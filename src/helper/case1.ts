/**
 * Case 1: Bảng danh sách track – nhập L/W/H mới → áp dụng cho keyframes trong dải frame.
 * Port từ cvat-helper/content/case1.js (150 dòng).
 */

import type { HelperApp } from './overlay';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface CaseMount {
  refresh?(): void;
  unmount?(): void;
  onKey?(e: KeyboardEvent): void;
}

// ---------------------------------------------------------------------------
// Helper DOM builder (local)
// ---------------------------------------------------------------------------

type Props = Record<string, unknown>;

function h(tag: string, props: Props = {}, ...children: unknown[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (k === 'class') {
      el.className = v as string;
    } else if (k === 'style' && typeof v === 'object') {
      Object.assign(el.style, v);
    } else if (k in el && typeof v !== 'string') {
      (el as any)[k] = v;
    } else {
      el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of (children as unknown[]).flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODES: [string, string][] = [
  ['bottom', 'Giữ đáy box (khuyên dùng)'],
  ['center', 'Giữ tâm box (giống CVAT)'],
  ['ground', 'Bám mặt đất theo point cloud'],
];

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function median(values: number[]): number {
  const s = values.slice().sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
}

function fmt(v: number, n: number = 2): string {
  return Number.isFinite(v) ? v.toFixed(n) : '–';
}

// ---------------------------------------------------------------------------
// mountCase1
// ---------------------------------------------------------------------------

/**
 * Mount Case 1: bảng tổng hợp track – nhập L/W/H, chọn chế độ, áp dụng kích thước.
 *
 * @param app HelperApp chứa store, settings và các method dùng chung
 * @param root Phần tử DOM gốc để mount giao diện
 * @returns CaseMount với refresh / unmount
 */
export function mountCase1(app: HelperApp, root: HTMLElement): CaseMount {
  const store = app.store!;
  const frames = store.frames;
  const range = { from: frames[0], to: frames[frames.length - 1] };
  const inputs = new Map<number | string, { L: string; W: string; H: string; from: number }>();

  // ---- Controls ----

  const modeSel = h(
    'select',
    { onchange: () => { app.settings.sizeMode = (modeSel as HTMLSelectElement).value as 'bottom' | 'center' | 'ground'; } },
    ...MODES.map(([v, t]) =>
      h('option', { value: v, selected: app.settings.sizeMode === v }, t),
    ),
  ) as HTMLSelectElement;

  const fromIn = h('input', {
    type: 'number',
    value: String(range.from),
    min: String(frames[0]),
    max: String(frames[frames.length - 1]),
    onchange: () => { range.from = Number((fromIn as HTMLInputElement).value); },
  }) as HTMLInputElement;

  const toIn = h('input', {
    type: 'number',
    value: String(range.to),
    min: String(frames[0]),
    max: String(frames[frames.length - 1]),
    onchange: () => { range.to = Number((toIn as HTMLInputElement).value); },
  }) as HTMLInputElement;

  const progress = h('span', { class: 'progress' });

  // ---- Table ----

  const tbody = h('tbody');
  const table = h(
    'table',
    {},
    h(
      'thead',
      {},
      h(
        'tr',
        {},
        ...['ID', 'Label', 'Frame', 'Keyframe', 'L / W / H hiện tại (trung vị)',
          'L mới', 'W mới', 'H mới', 'Lấy kích thước từ frame', '', ''].map(
          (t) => h('th', {}, t),
        ),
      ),
    ),
    tbody,
  );

  root.append(
    h(
      'div',
      { class: 'bar' },
      h('label', {}, 'Khi đổi kích thước:', modeSel),
      h('label', {}, 'Áp dụng cho frame', fromIn, '→', toIn),
      progress,
    ),
    h(
      'div',
      { class: 'bar help' },
      'Giữ đáy: đổi H thì đáy box đứng yên, chỉ nóc box dịch chuyển. ',
      'Bám mặt đất: đặt đáy box lên mặt đất ước lượng từ point cloud quanh box (tải point cloud, chậm hơn). ',
      'Chỉ keyframe được sửa – frame nội suy tự đi theo. Thay đổi chỉ nằm trong tool cho tới khi bấm "Lưu lên CVAT".',
    ),
    h('div', { class: 'scroll' }, table),
  );

  // ---- Helpers ----

  function inRange(f: number): boolean {
    return f >= Math.min(range.from, range.to) && f <= Math.max(range.from, range.to);
  }

  async function apply(track: any, size: number[]): Promise<void> {
    const keyframes = track.shapes.filter((s: any) => inRange(s.frame));
    if (!keyframes.length) {
      app.setStatus('Không có keyframe nào trong dải frame.', 'err');
      return;
    }
    const mode = app.settings.sizeMode;
    if (mode === 'ground') {
      await app.getFrames().preload(
        keyframes.map((s: any) => s.frame),
        (p: any) => {
          const disk = p.diskCount ? ` (💾 ${p.diskCount} từ ổ cứng)` : '';
          progress.textContent = `Nạp point cloud ${Math.round(p.fraction * 100)}% (${p.done}/${p.total} chunk)${disk}…`;
        },
      );
    }
    app.snapshot([track.id]);
    let failed = 0;
    for (const shape of keyframes) {
      const box = pointsToBox(shape.points);
      const res = await app.resizeBox(box, size, shape.frame, mode);
      if (!res.ok) failed += 1;
      shape.points = boxToPoints(res.box, shape.points);
    }
    track.dirty = true;
    progress.textContent = '';
    app.setStatus(
      `ID ${track.uiId}: đã sửa ${keyframes.length} keyframe (chưa lưu)`
      + (failed ? ` · ${failed} frame không đủ điểm mặt đất → giữ đáy` : ''),
      failed ? 'err' : 'ok',
    );
    app.changed();
  }

  async function snapOnly(track: any): Promise<void> {
    const keyframes = track.shapes.filter((s: any) => inRange(s.frame) && !s.outside);
    await app.getFrames().preload(
      keyframes.map((s: any) => s.frame),
      (p: any) => {
        const disk = p.diskCount ? ` (💾 ${p.diskCount} từ ổ cứng)` : '';
        progress.textContent = `Nạp point cloud ${Math.round(p.fraction * 100)}% (${p.done}/${p.total} chunk)${disk}…`;
      },
    );
    app.snapshot([track.id]);
    let failed = 0;
    for (const shape of keyframes) {
      const cloud = await app.getFrames().cloud(shape.frame);
      const res = snapToGround(cloud, pointsToBox(shape.points));
      if (!res) {
        failed += 1;
        continue;
      }
      shape.points = boxToPoints(res.box, shape.points);
    }
    track.dirty = true;
    progress.textContent = '';
    app.setStatus(
      `ID ${track.uiId}: đã đặt ${keyframes.length - failed} keyframe chạm đất`
      + (failed ? ` · ${failed} frame không đủ điểm` : ''),
      failed ? 'err' : 'ok',
    );
    app.changed();
  }

  // ---- Render ----

  function render(): void {
    tbody.replaceChildren();
    const tracks = [...store.tracks.values()].sort((a: any, b: any) => a.uiId - b.uiId);
    if (!tracks.length) {
      tbody.append(
        h('tr', {}, h('td', { colSpan: '11', class: 'muted' }, 'Job không có track cuboid nào.')),
      );
      return;
    }

    for (const t of tracks) {
      const sizes = t.shapes.map((s: any) => s.points.slice(6, 9) as number[]);
      const med = [0, 1, 2].map((i) => median(sizes.map((s: number[]) => s[i])));
      const lo = [0, 1, 2].map((i) => Math.min(...sizes.map((s: number[]) => s[i])));
      const hi = [0, 1, 2].map((i) => Math.max(...sizes.map((s: number[]) => s[i])));
      const varies = [0, 1, 2].some((i) => hi[i] - lo[i] > 0.005);

      const state = inputs.get(t.id) || { L: '', W: '', H: '', from: t.firstFrame };
      inputs.set(t.id, state);

      const mk = (key: 'L' | 'W' | 'H'): HTMLInputElement => {
        const input = h('input', {
          type: 'number',
          step: '0.01',
          min: '0.05',
          value: state[key],
          placeholder: fmt(med['LWH'.indexOf(key)]),
          oninput: (e: Event) => { state[key] = (e.target as HTMLInputElement).value; },
        }) as HTMLInputElement;
        return input;
      };

      const L = mk('L');
      const W = mk('W');
      const H = mk('H');

      const fromFrame = h('input', {
        type: 'number',
        value: String(state.from),
        min: String(t.firstFrame),
        max: String(t.lastFrame),
        oninput: (e: Event) => { state.from = Number((e.target as HTMLInputElement).value); },
      }) as HTMLInputElement;

      const pick = (): void => {
        const pos = t.at(Number(fromFrame.value));
        if (!pos) return;
        [state.L, state.W, state.H] = pos.box.s.map((v: number) => v.toFixed(3));
        L.value = state.L;
        W.value = state.W;
        H.value = state.H;
      };

      const applyBtn = h(
        'button',
        {
          class: 'primary small',
          onclick: async () => {
            const size = [L, W, H].map((el, i) =>
              el.value === '' ? med[i] : Number(el.value),
            );
            if (size.some((v) => !Number.isFinite(v) || v <= 0)) {
              app.setStatus('L/W/H không hợp lệ', 'err');
              return;
            }
            (applyBtn as HTMLButtonElement).disabled = true;
            try {
              await apply(t, size);
            } catch (err: unknown) {
              app.setStatus(`Lỗi: ${(err as Error).message}`, 'err');
            } finally {
              (applyBtn as HTMLButtonElement).disabled = false;
            }
          },
        },
        'Áp dụng',
      );

      const kfCount = t.shapes.length;

      tbody.append(
        h(
          'tr',
          { class: t.dirty ? 'dirty' : '' },
          h(
            'td',
            {},
            h('b', {}, `#${t.uiId}`),
            h('span', { class: 'muted' }, t.serverId ? ` (server ${t.serverId})` : ' (mới)'),
          ),
          h(
            'td',
            {},
            h('span', { class: 'dot', style: { background: store.labelColor(t.labelId) } }),
            store.labelName(t.labelId),
          ),
          h('td', {}, `f${t.firstFrame} → f${t.lastFrame}`),
          h('td', {}, String(kfCount)),
          h(
            'td',
            {
              title: varies
                ? `min ${lo.map((v) => fmt(v)).join(' / ')}\nmax ${hi.map((v) => fmt(v)).join(' / ')}`
                : '',
            },
            med.map((v) => fmt(v)).join(' / '),
            varies
              ? h('span', { class: 'kf out', style: { marginLeft: '6px' } }, 'không đều')
              : null,
          ),
          h('td', {}, L),
          h('td', {}, W),
          h('td', {}, H),
          h(
            'td',
            {},
            fromFrame,
            ' ',
            h('button', { class: 'small', onclick: pick }, '⤵ lấy'),
          ),
          h(
            'td',
            {},
            applyBtn,
            ' ',
            h(
              'button',
              {
                class: 'small',
                title: 'Chỉ nâng/hạ box cho đáy chạm đất, không đổi kích thước',
                onclick: () =>
                  snapOnly(t).catch((err: Error) =>
                    app.setStatus(`Lỗi: ${err.message}`, 'err'),
                  ),
              },
              '⇩ Chạm đất',
            ),
          ),
          h(
            'td',
            {},
            h(
              'button',
              { class: 'small', onclick: () => app.switchTab('case2', t.id) },
              'Mở Case 2 →',
            ),
          ),
        ),
      );
    }
  }

  render();

  return {
    refresh: render,
    unmount() { /* Không cần cleanup đặc biệt */ },
  };
}

// ---------------------------------------------------------------------------
// Geometry imports được sử dụng thông qua module path
// ---------------------------------------------------------------------------

import {
  pointsToBox,
  boxToPoints,
  snapToGround,
} from '../core/geometry';
