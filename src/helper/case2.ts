/**
 * Case 2: Duyệt theo ID – mỗi frame 1 dòng: | thông tin | ảnh camera | Top | Side | Front |, sửa trực tiếp trên view.
 * Port từ cvat-helper/content/case2.js (553 dòng) sang TypeScript strict.
 */

import type { HelperApp } from './overlay';
import {
  GridViewWebGL,
  type GridCell,
  type GridViewSettings,
  type ViewType,
  type BoxPosState,
} from './grid_view_webgl';
import {
  cloneBox,
  resizeKeepBottom,
  snapToGround,
  rotateLocal,
  flipYaw,
  degToRad,
  axes,
  fitBoxToEgoRayAndGround,
  fitPedestrianBox,
  fitTwoWheelerBox,
  type Box3D,
} from '../core/geometry';
import { findBestFitCatalog } from '../core/catalog';
import { detectObjectCategory } from '../core/qc/qc_engine';
import { CASE2_CSS } from './styles';
import { PointCloudDiskStorage } from './point_cloud_cache';

export interface Case2Mount {
  refresh(): void;
  unmount(): void;
  onKey(e: KeyboardEvent): void;
}

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

const fmt = (v: number, n: number = 2): string => (Number.isFinite(v) ? v.toFixed(n) : '–');
const deg = (rad: number): number => (rad * 180) / Math.PI;

function float32ToPointObjects(arr: Float32Array): Array<{ x: number; y: number; z: number }> {
  const n = Math.floor(arr.length / 3);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = { x: arr[i * 3], y: arr[i * 3 + 1], z: arr[i * 3 + 2] };
  }
  return out;
}

const VIEW_NAMES: Record<ViewType, string> = { top: 'Top', side: 'Side', front: 'Front' };
const BIG = { fullScene: true, sceneSpan: 40, slab: 3, hideGround: undefined as boolean | undefined };

export function mountCase2(app: HelperApp, root: HTMLElement, initialTrackId?: number): Case2Mount {
  const store = app.store!;
  const frameData = app.getFrames();
  const tracks = [...store.tracks.values()].sort((a, b) => Number(a.uiId) - Number(b.uiId));

  const S = (app.settings as any).case2 ||= {
    zoom: { top: 1, side: 1, front: 1 },
    pointSize: 2,
    slab: 1,
    hideGround: false,
    allowTilt: false,
    context: true,
    syncSize: false,
    rowH: 230,
    camera: 0,
    showImage: true,
  };

  root.append(h('style', {}, CASE2_CSS));

  if (!tracks.length) {
    root.append(h('div', { class: 'bar muted' }, 'Job không có track cuboid nào.'));
    return {
      refresh() {},
      unmount() {},
      onKey() {},
    };
  }

  let track = (initialTrackId ? store.track(initialTrackId) : null) || tracks[0];
  let range: [number, number] | null = null;
  let grid: GridViewWebGL | null = null;
  const extraGrids = new Set<GridViewWebGL>();
  let rows = new Map<number, {
    el: HTMLElement;
    info: HTMLElement;
    img: HTMLElement;
    views: HTMLElement[];
    refresh: () => void;
    imgLoaded: boolean;
  }>();
  let crops = new Map<number, { arr: Float32Array; center: number[] }>();
  let isDragging = false;
  let observer: IntersectionObserver | null = null;
  let cameraNames: string[] = [];

  const settings: GridViewSettings = {
    ...S,
    refSize: [1, 1, 1],
    color: '#2563eb',
  };
  settings.zoom = S.zoom;

  // ---------- Toolbar ----------
  const trackSel = h(
    'select',
    { onchange: () => openTrack(store.track(Number(trackSel.value))!) },
    ...tracks.map((t) =>
      h(
        'option',
        { value: String(t.id), selected: t.id === track.id },
        `#${t.uiId} · ${store.labelName(t.labelId)} · f${t.firstFrame}–f${t.lastFrame}`
      )
    )
  ) as HTMLSelectElement;

  const fromIn = h('input', { type: 'number' }) as HTMLInputElement;
  const toIn = h('input', { type: 'number' }) as HTMLInputElement;
  const gotoIn = h('input', { type: 'number', placeholder: 'frame' }) as HTMLInputElement;
  const camSel = h('select', {
    onchange: () => {
      S.camera = Number(camSel.value);
      reloadImages();
    },
  }) as HTMLSelectElement;

  const pfill = h('div', { class: 'fill' });
  const ptext = h('span', { class: 'ptext' });
  const pbar = h('div', { class: 'pbar', hidden: true, title: 'Tiến độ tải point cloud' }, pfill, ptext);

  const check = (key: string, text: string, title: string, after?: () => void): HTMLElement =>
    h(
      'label',
      { title },
      h('input', {
        type: 'checkbox',
        checked: !!S[key],
        onchange: (e: Event) => {
          S[key] = (e.target as HTMLInputElement).checked;
          (settings as any)[key] = S[key];
          after?.();
          renderAll();
        },
      }),
      text
    );

  const num = (
    key: string,
    text: string,
    step: number,
    min: number,
    max: number,
    after?: () => void
  ): HTMLElement =>
    h(
      'label',
      {},
      text,
      h('input', {
        type: 'number',
        value: String(S[key]),
        step: String(step),
        min: String(min),
        max: String(max),
        style: { width: '60px' },
        onchange: (e: Event) => {
          const v = Number((e.target as HTMLInputElement).value);
          if (Number.isFinite(v)) {
            S[key] = v;
            (settings as any)[key] = v;
            after?.();
            renderAll();
          }
        },
      })
    );

  const head = h(
    'div',
    { class: 'c2-head' },
    h('span', {}, 'Frame'),
    h('span', {}, 'Camera'),
    h('span', {}, 'Top'),
    h('span', {}, 'Side'),
    h('span', {}, 'Front')
  );
  const scroller = h('div', { class: 'c2-scroll' });
  const wrap = h('div', { class: 'c2-wrap' }, scroller);

  function applyLayout(): void {
    root.style.setProperty('--row-h', `${S.rowH}px`);
    root.style.setProperty('--img-col', S.showImage ? '1.15fr' : '0px');
    grid?.resize();
  }

  const fitBtn = (label: string, title: string, op: any) =>
    h(
      'button',
      {
        class: 'small',
        title,
        onclick: () => {
          const target = selected !== null ? selected : Number(fromIn.value);
          applyFitOperation(target, op);
        },
      },
      label
    );

  const fitBar = h(
    'div',
    { class: 'bar', style: { background: '#f8fafc', borderBottom: '1px solid #e2e8f0', gap: '6px', alignItems: 'center' } },
    h('span', { style: { fontWeight: '700', fontSize: '11px', color: '#1e293b', marginRight: '4px' } }, '⚡ Căn Nhanh:'),
    fitBtn('TOP (1)', 'Căn hướng Yaw và nóc xe theo góc nhìn Top (Phím 1/T)', 'top'),
    fitBtn('SIDE (2)', 'Căn mép cản trước/sau theo trục dọc X (Phím 2)', 'side'),
    fitBtn('FRONT (3)', 'Căn mép sườn đón tia theo phương ngang Y (Phím 3)', 'front'),
    fitBtn('Fit W (4)', 'Fit riêng bề rộng W (Phím 4)', 'w'),
    fitBtn('Fit H (5)', 'Fit riêng chiều cao H chuẩn Ground-Lock (Phím 5)', 'h'),
    fitBtn('Đất (G)', 'Ghim đáy box bám sát mặt đất (Phím G)', 'ground'),
    fitBtn('Flip (F)', 'Lật ngược góc xoay Yaw 180 độ (Phím F)', 'flip'),
    fitBtn('Catalog (B)', 'Khớp kích thước xe chuẩn Catalog quốc tế (Phím B)', 'catalog'),
    fitBtn('Pedestrian (P)', 'Fit toàn diện Người đi bộ (Phím P)', 'ped_all'),
    fitBtn('Cyclist (C)', 'Fit toàn diện Xe 2 bánh (Phím C)', 'cyclist_all'),
    h('span', { class: 'help', style: { marginLeft: 'auto', fontSize: '11px' } }, 'Phím: 1/2/3 · 4/5 · G · F · B · P · C · Q/E · Shift+WASD')
  );

  root.append(
    h(
      'div',
      { class: 'bar' },
      h('label', {}, 'ID', trackSel),
      h('label', {}, 'Frame', fromIn, '→', toIn),
      h('button', { class: 'small', onclick: () => buildRows() }, 'Hiện'),
      h('label', {}, 'Đi tới', gotoIn),
      h('label', {}, 'Camera', camSel),
      check('showImage', 'Ảnh', 'Hiện cột ảnh camera', applyLayout),
      num('rowH', 'Cao dòng', 10, 120, 600, applyLayout),
      h('button', { class: 'small', onclick: fitZoom, title: 'Đặt lại zoom mọi ô cho vừa box' }, 'Fit'),
      h(
        'button',
        {
          class: 'small',
          title: 'Xem dung lượng cache point cloud trên ổ cứng của Job này',
          onclick: async () => {
            const stats = await PointCloudDiskStorage.getCacheStats(store.jid);
            const mb = (stats.totalBytes / (1024 * 1024)).toFixed(1);
            const msg =
              `💾 Bộ nhớ đệm Ổ cứng (Job #${store.jid}):\n` +
              `• Đã lưu: ${stats.count} chunks (~${mb} MB) trên ổ cứng.\n` +
              `• Lần sau mở Job này sẽ nạp tức thì trong vài ms, không tải qua mạng.\n\n` +
              `Bạn có muốn XÓA cache này để giải phóng ổ cứng không?`;
            if (confirm(msg)) {
              await PointCloudDiskStorage.clearCache(store.jid);
              app.setStatus(`Đã xóa cache ổ cứng của Job #${store.jid}`, 'ok');
            }
          },
        },
        '💾 Ổ cứng'
      ),
      pbar
    ),
    fitBar,
    h(
      'div',
      { class: 'bar' },
      check(
        'syncSize',
        'Đồng bộ L/W/H cho cả track',
        'Khi đổi kích thước ở 1 frame, áp kích thước đó cho mọi keyframe (theo chế độ giữ đáy/giữ tâm/bám đất ở Case 1)'
      ),
      check(
        'context',
        'Hiện xung quanh (giống CVAT)',
        'Bật: mỗi ô hiện cả mặt đất và vật xung quanh. Tắt: chỉ vùng sát box',
        () => {
          crops = new Map();
        }
      ),
      check('hideGround', 'Top: ẩn mặt đất', 'Top view chỉ hiện điểm cao hơn đáy box 12cm'),
      check('allowTilt', 'Cho xoay pitch/roll', 'Cho phép xoay ở Side/Front (mặc định khoá, chỉ xoay yaw ở Top)'),
      num('slab', 'Lát cắt ±m', 0.1, 0, 5),
      num('pointSize', 'Cỡ điểm', 0.5, 1, 8),
      h(
        'span',
        { class: 'help' },
        'Kéo box = di chuyển · kéo cạnh/góc = đổi size · chấm vàng = xoay (Shift: 5°) · kéo vùng trống = pan · ' +
          'Cuộn chuột = zoom ô (Shift: mọi ô) · ⛶ phóng to · O = outside · ↑/↓ chọn frame'
      )
    ),
    head,
    wrap
  );
  applyLayout();

  gotoIn.addEventListener('change', () => {
    const r = rows.get(Number(gotoIn.value));
    if (r) {
      r.el.scrollIntoView({ block: 'center' });
      select(Number(gotoIn.value));
    }
  });

  function renderAll(): void {
    grid?.requestRender();
    for (const g of extraGrids) g.requestRender();
  }

  // ---------- Data helpers ----------
  function refSizeOf(t: any): [number, number, number] {
    const s: [number, number, number] = [0, 0, 0];
    for (const sh of t.shapes) {
      for (let i = 0; i < 3; i++) s[i] = Math.max(s[i], sh.points[6 + i]);
    }
    return [Math.max(s[0], 0.3), Math.max(s[1], 0.3), Math.max(s[2], 0.3)];
  }

  function getCloud(frame: number): Float32Array | null {
    const full = frameData.clouds.get(frame);
    if (!full) return null;
    const pos = track.at(frame);
    if (!pos) return null;
    const c = pos.box.c;
    const old = crops.get(frame);
    if (old && (isDragging || Math.hypot(old.center[0] - c[0], old.center[1] - c[1], old.center[2] - c[2]) < 2.5)) {
      return old.arr;
    }
    const ref = settings.refSize;
    const rh = Math.max(ref[0], ref[1]) / 2 + (settings.context ? 15 : 4);
    const rv = ref[2] / 2 + (settings.context ? 8 : 3);
    const out = new Float32Array(full.length);
    let n = 0;
    for (let i = 0; i < full.length; i += 3) {
      const dx = full[i] - c[0];
      const dy = full[i + 1] - c[1];
      const dz = full[i + 2] - c[2];
      if (dx * dx + dy * dy > rh * rh || Math.abs(dz) > rv) continue;
      out[n++] = full[i];
      out[n++] = full[i + 1];
      out[n++] = full[i + 2];
    }
    const arr = out.slice(0, n);
    crops.set(frame, { arr, center: [c[0], c[1], c[2]] });
    return arr;
  }

  // ---------- Editing ----------
  let selected: number | null = null;
  function select(frame: number): void {
    if (selected !== null) rows.get(selected)?.el.classList.remove('sel');
    selected = frame;
    rows.get(frame)?.el.classList.add('sel');
  }

  function editBox(frame: number, mutate: (box: Box3D) => void, { sync = false } = {}): void {
    const pos = track.at(frame);
    if (!pos || pos.outside) return;
    app.snapshot([Number(track.id)]);
    const box = cloneBox(pos.box);
    mutate(box);
    track.setBox(frame, box);
    const sizeChanged = box.s.some((v, i) => Math.abs(v - pos.box.s[i]) > 1e-6);
    if (sync && sizeChanged) syncSize(frame, box.s).then(afterEdit);
    else afterEdit();
  }

  function toggleOutside(frame: number): void {
    const pos = track.at(frame);
    if (!pos) return;
    app.snapshot([Number(track.id)]);
    track.setOutside(frame, !pos.outside);
    app.setStatus(`f${frame}: outside ${pos.outside ? 'TẮT' : 'BẬT'}`, 'ok');
    afterEdit();
  }

  async function syncSize(frame: number, size: number[]): Promise<void> {
    let failed = 0;
    for (const shape of track.shapes) {
      if (shape.frame === frame) continue;
      const res = await app.resizeBox(
        { c: [shape.points[0], shape.points[1], shape.points[2]], r: [shape.points[3], shape.points[4], shape.points[5]], s: [shape.points[6], shape.points[7], shape.points[8]] },
        size,
        shape.frame
      );
      if (!res.ok) failed += 1;
      shape.points[6] = res.box.s[0];
      shape.points[7] = res.box.s[1];
      shape.points[8] = res.box.s[2];
      shape.points[0] = res.box.c[0];
      shape.points[1] = res.box.c[1];
      shape.points[2] = res.box.c[2];
    }
    track.dirty = true;
    app.setStatus(
      `Đã đồng bộ L/W/H cho ${track.shapes.length} keyframe` +
        (failed ? ` · ${failed} frame không đủ điểm mặt đất → giữ đáy` : ''),
      failed ? 'err' : 'ok'
    );
  }

  function afterEdit(): void {
    for (const r of rows.values()) r.refresh();
    renderAll();
    app.changed();
  }

  function nudgeBox(frame: number, dir: 'w' | 's' | 'a' | 'd'): void {
    const pos = track.at(frame);
    if (!pos || pos.outside) return;
    app.snapshot([Number(track.id)]);
    const box = cloneBox(pos.box);
    const ax = axes(box.r);
    const step = 0.02; // 2cm
    if (dir === 'w') {
      box.c[0] += ax.ex[0] * step;
      box.c[1] += ax.ex[1] * step;
      box.c[2] += ax.ex[2] * step;
    } else if (dir === 's') {
      box.c[0] -= ax.ex[0] * step;
      box.c[1] -= ax.ex[1] * step;
      box.c[2] -= ax.ex[2] * step;
    } else if (dir === 'a') {
      box.c[0] += ax.ey[0] * step;
      box.c[1] += ax.ey[1] * step;
      box.c[2] += ax.ey[2] * step;
    } else if (dir === 'd') {
      box.c[0] -= ax.ey[0] * step;
      box.c[1] -= ax.ey[1] * step;
      box.c[2] -= ax.ey[2] * step;
    }
    track.setBox(frame, box);
    afterEdit();
  }

  async function applyFitOperation(
    frame: number,
    op: 'top' | 'side' | 'front' | 'w' | 'h' | 'ground' | 'flip' | 'catalog' | 'ped_all' | 'cyclist_all'
  ): Promise<void> {
    const pos = track.at(frame);
    if (!pos || pos.outside) return;

    // 1. Phép lật Yaw (Flip 180°): Dùng chung hàm flipYaw từ geometry.ts
    if (op === 'flip') {
      app.snapshot([Number(track.id)]);
      const newBox = cloneBox(pos.box);
      newBox.r[2] = flipYaw(newBox.r[2]);
      track.setBox(frame, newBox);
      app.setStatus(`f${frame}: Đã lật Yaw 180°`, 'ok');
      afterEdit();
      return;
    }

    // 2. Phép Catalog Best-Fit: Dùng chung hàm findBestFitCatalog từ catalog.ts
    if (op === 'catalog') {
      const match = findBestFitCatalog(pos.box.s[0], pos.box.s[1], pos.box.s[2], store.labelName(track.labelId));
      if (match && match.matchedItem) {
        app.snapshot([Number(track.id)]);
        const newBox = cloneBox(pos.box);
        const oldH = newBox.s[2];
        const newH = match.recommendedH;
        newBox.s = [match.recommendedL, match.recommendedW, newH];
        // Giữ nguyên đáy tiếp đất (Ground-Lock)
        newBox.c[2] += (newH - oldH) / 2;
        track.setBox(frame, newBox);
        if (S.syncSize) await syncSize(frame, newBox.s);
        app.setStatus(
          `f${frame}: Khớp Catalog ${match.matchedItem.name} (${match.recommendedL}x${match.recommendedW}x${newH})`,
          'ok'
        );
        afterEdit();
      }
      return;
    }

    // Lấy point cloud của frame
    let cloud = frameData.clouds.get(frame);
    if (!cloud || cloud.length === 0) {
      app.setStatus(`f${frame}: Đang nạp point cloud...`, 'info');
      cloud = await frameData.cloud(frame);
    }
    if (!cloud || cloud.length === 0) {
      app.setStatus(`f${frame}: Không có dữ liệu point cloud`, 'err');
      return;
    }

    // 3. Phép Ghim Đất: Dùng chung hàm snapToGround từ geometry.ts
    if (op === 'ground') {
      const res = snapToGround(cloud, pos.box);
      if (!res) {
        app.setStatus(`f${frame}: Không đủ điểm mặt đất quanh box`, 'err');
        return;
      }
      app.snapshot([Number(track.id)]);
      const newBox = cloneBox(pos.box);
      newBox.c = res.box.c;
      track.setBox(frame, newBox);
      app.setStatus(`f${frame}: Đã ghim mặt đất (ΔZ: ${fmt(res.shift * 100, 1)} cm)`, 'ok');
      afterEdit();
      return;
    }

    const rawLabel = store.labelName(track.labelId);
    const cat = detectObjectCategory(rawLabel);
    const isPed = cat === 'pedestrian';
    const isCyclist = cat === 'cyclist';
    const pts = float32ToPointObjects(cloud);
    const curBox = cloneBox(pos.box);

    app.snapshot([Number(track.id)]);

    // 4. Phép Fit Pedestrian: Dùng chung hàm fitPedestrianBox từ geometry.ts
    if (isPed || op === 'ped_all') {
      const stepParam = op === 'ped_all' ? 'all' : (op as 'top' | 'side' | 'front' | 'w' | 'h');
      const res = fitPedestrianBox(
        pts,
        curBox.c[0],
        curBox.c[1],
        curBox.c[2],
        curBox.r[2],
        curBox.s[0],
        curBox.s[1],
        curBox.s[2],
        { step: stepParam }
      );
      curBox.c = [res.newCenterX, res.newCenterY, res.newCenterZ];
      curBox.s = [res.newL, res.newW, res.newH];
      if (res.newYawRad !== undefined) curBox.r[2] = res.newYawRad;
      curBox.r[0] = 0;
      curBox.r[1] = 0;
      track.setBox(frame, curBox);
      if (S.syncSize && (op === 'w' || op === 'h' || op === 'ped_all')) await syncSize(frame, curBox.s);
      app.setStatus(`f${frame}: Fit Pedestrian [${stepParam.toUpperCase()}] hoàn tất`, 'ok');
      afterEdit();
      return;
    }

    // 5. Phép Fit Cyclist / Xe 2 bánh: Dùng chung hàm fitTwoWheelerBox từ geometry.ts
    if (isCyclist || op === 'cyclist_all') {
      const stepParam = op === 'cyclist_all' ? 'all' : (op as 'top' | 'side' | 'front' | 'w' | 'h');
      const res = fitTwoWheelerBox(
        pts,
        curBox.c[0],
        curBox.c[1],
        curBox.c[2],
        curBox.r[2],
        curBox.s[0],
        curBox.s[1],
        curBox.s[2],
        { step: stepParam }
      );
      curBox.c = [res.newCenterX, res.newCenterY, res.newCenterZ];
      curBox.s = [res.newL, res.newW, res.newH];
      if (res.newYawRad !== undefined) curBox.r[2] = res.newYawRad;
      track.setBox(frame, curBox);
      if (S.syncSize && (op === 'w' || op === 'h' || op === 'cyclist_all')) await syncSize(frame, curBox.s);
      app.setStatus(`f${frame}: Fit Cyclist [${stepParam.toUpperCase()}] hoàn tất`, 'ok');
      afterEdit();
      return;
    }

    // 6. Phép Fit Car / Ô tô: Dùng chung hàm fitBoxToEgoRayAndGround từ geometry.ts
    // Bảo vệ kích thước chuẩn Catalog xe: Ô tô không có fit W hoặc H tự do
    if (op === 'w' || op === 'h') {
      app.setStatus(`f${frame}: Ô tô tuân thủ kích thước chuẩn Catalog (Phím B), không có Fit ${op.toUpperCase()}`, 'err');
      return;
    }

    const fitStepParam = (op === 'top' || op === 'side' || op === 'front') ? op : 'all';
    const res = fitBoxToEgoRayAndGround(
      pts,
      curBox.c[0],
      curBox.c[1],
      curBox.c[2],
      curBox.r[2],
      curBox.s[0],
      curBox.s[1],
      curBox.s[2],
      { x: 0, y: 0, z: 0 },
      {
        preserveDimensions: true,
        fitStep: fitStepParam,
      }
    );

    curBox.c = [res.newCenterX, res.newCenterY, res.newCenterZ];
    curBox.s = [res.newL, res.newW, res.newH];
    if (res.newYawRad !== undefined) curBox.r[2] = res.newYawRad;
    curBox.r[0] = res.rollRad || 0;
    curBox.r[1] = res.pitchRad || 0;

    track.setBox(frame, curBox);
    app.setStatus(`f${frame}: Căn ${op.toUpperCase()} hoàn tất`, 'ok');
    afterEdit();
  }

  const editCallbacks = {
    getCloud,
    getBox: (frame: number): BoxPosState | null => {
      const pos = track.at(frame);
      return pos ? { box: pos.box, keyframe: pos.keyframe, outside: pos.outside } : null;
    },
    onEditStart: () => {
      isDragging = true;
      app.snapshot([Number(track.id)]);
    },
    onEdit: (frame: number, box: Box3D) => {
      track.setBox(frame, box);
      rows.get(frame)?.refresh();
      select(frame);
      renderAll();
    },
    onEditEnd: async (frame: number, startBox: Box3D, endBox: Box3D) => {
      isDragging = false;
      const sizeChanged = endBox.s.some((v, i) => Math.abs(v - startBox.s[i]) > 1e-6);
      if (S.syncSize && sizeChanged) await syncSize(frame, endBox.s);
      afterEdit();
    },
    onEditCancel: () => {
      isDragging = false;
      app.dropLastSnapshot();
    },
  };

  // ---------- Row building ----------
  function outsideSwitch(getFrame: () => number): HTMLElement & { update: (outside: boolean) => void } {
    const el = h(
      'button',
      {
        class: 'osw',
        title: 'Bật/tắt outside tại frame này (phím O)',
        onclick: (e: MouseEvent) => {
          e.stopPropagation();
          toggleOutside(getFrame());
        },
      },
      h('span', { class: 'knob' }),
      h('span', { class: 'lbl' }, 'Outside')
    ) as HTMLElement & { update: (outside: boolean) => void };

    el.update = (outside: boolean) => {
      el.classList.toggle('on', !!outside);
      const lbl = el.querySelector('.lbl');
      if (lbl) lbl.textContent = outside ? 'Outside: BẬT' : 'Outside: tắt';
    };
    return el;
  }

  function buildRow(frame: number): {
    el: HTMLElement;
    info: HTMLElement;
    img: HTMLElement;
    views: HTMLElement[];
    refresh: () => void;
    imgLoaded: boolean;
  } {
    const kfBadge = h('span', { class: 'kf' });
    const osw = outsideSwitch(() => frame);

    const field = (
      title: string,
      get: (b: Box3D) => number,
      set: (b: Box3D, v: number) => void,
      step: string = '0.01'
    ): { input: HTMLInputElement; get: (b: Box3D) => number } => {
      const input = h('input', {
        type: 'number',
        step,
        title,
        onchange: () => {
          const v = Number(input.value);
          if (!Number.isFinite(v)) return;
          editBox(frame, (box) => set(box, v), {
            sync: S.syncSize && ['L', 'W', 'H'].includes(title),
          });
        },
      }) as HTMLInputElement;
      return { input, get };
    };

    const fields = [
      field('L', (b) => b.s[0], (b, v) => { b.s[0] = Math.max(0.05, v); }),
      field('W', (b) => b.s[1], (b, v) => { b.s[1] = Math.max(0.05, v); }),
      field('H', (b) => b.s[2], (b, v) => {
        Object.assign(b, resizeKeepBottom(b, [b.s[0], b.s[1], Math.max(0.05, v)]));
      }),
      field(
        'Yaw°',
        (b) => deg(b.r[2]),
        (b, v) => {
          const delta = (v * Math.PI) / 180 - b.r[2];
          if (!b.r[0] && !b.r[1]) b.r[2] += delta;
          else b.r = rotateLocal(b.r, 2, delta);
        },
        '0.5'
      ),
      field('z', (b) => b.c[2], (b, v) => { b.c[2] = v; }),
    ];

    const kfDel = h(
      'button',
      {
        class: 'small',
        title: 'Xoá keyframe này (frame sẽ nội suy lại)',
        onclick: () => {
          const idx = track.keyframeIndex(frame);
          if (idx <= 0) {
            app.setStatus('Không xoá được keyframe đầu tiên của track', 'err');
            return;
          }
          app.snapshot([Number(track.id)]);
          track.shapes.splice(idx, 1);
          track.dirty = true;
          afterEdit();
        },
      },
      '✕ KF'
    ) as HTMLButtonElement;

    const ground = h(
      'button',
      {
        class: 'small',
        title: 'Nâng/hạ box cho đáy chạm mặt đất (point cloud)',
        onclick: () => {
          const cloud = frameData.clouds.get(frame);
          if (!cloud) {
            app.setStatus('Point cloud frame này chưa tải xong', 'err');
            return;
          }
          const pos = track.at(frame);
          if (!pos || pos.outside) return;
          const res = snapToGround(cloud, pos.box);
          if (!res) {
            app.setStatus(`f${frame}: không đủ điểm mặt đất quanh box`, 'err');
            return;
          }
          editBox(frame, (b) => { b.c = res.box.c; });
          app.setStatus(`f${frame}: dịch ${fmt(res.shift * 100, 1)} cm theo trục z`, 'ok');
        },
      },
      '⇩ Đất'
    ) as HTMLButtonElement;

    const info = h(
      'div',
      { class: 'c2-info', onclick: () => select(frame) },
      h('div', { class: 'head' }, h('b', {}, `f${frame}`), kfBadge, osw),
      h(
        'div',
        { class: 'grid' },
        ...fields.flatMap((f, i) => [
          h('span', { class: 'muted' }, ['L', 'W', 'H', 'Yaw°', 'z'][i]),
          f.input,
        ])
      ),
      h(
        'div',
        { class: 'btns' },
        h('button', { class: 'small', title: 'Căn TOP (Phím 1/T)', onclick: () => applyFitOperation(frame, 'top') }, 'Top'),
        h('button', { class: 'small', title: 'Căn SIDE (Phím 2)', onclick: () => applyFitOperation(frame, 'side') }, 'Side'),
        h('button', { class: 'small', title: 'Căn FRONT (Phím 3)', onclick: () => applyFitOperation(frame, 'front') }, 'Front'),
        h('button', { class: 'small', title: 'Lật Yaw 180° (Phím F)', onclick: () => applyFitOperation(frame, 'flip') }, 'Flip'),
        ground,
        h(
          'button',
          {
            class: 'small',
            title: 'Áp L/W/H của frame này cho mọi keyframe của track',
            onclick: async () => {
              const pos = track.at(frame);
              if (!pos) return;
              app.snapshot([Number(track.id)]);
              await syncSize(frame, pos.box.s);
              afterEdit();
            },
          },
          'L/W/H → tất cả'
        ),
        kfDel
      )
    );

    const img = h('div', { class: 'c2-img', onclick: () => showAllImages(frame) }, '…');
    const views = (['top', 'side', 'front'] as ViewType[]).map(() => h('div', { class: 'c2-view' }));
    const el = h('div', { class: 'c2-row' }, info, img, ...views);
    el.dataset.frame = String(frame);

    const refresh = (): void => {
      const pos = track.at(frame);
      if (!pos) {
        kfBadge.className = 'kf off';
        kfBadge.textContent = 'ngoài track';
        return;
      }
      kfBadge.className = `kf ${pos.outside ? 'out' : pos.keyframe ? 'on' : 'off'}`;
      kfBadge.textContent = pos.outside ? 'OUTSIDE' : pos.keyframe ? 'KEYFRAME' : 'nội suy';
      osw.update(pos.outside);
      for (const f of fields) {
        if (f.input === (f.input.getRootNode() as Document)?.activeElement) continue;
        f.input.value = f.get(pos.box).toFixed(f.input.step === '0.5' ? 1 : 3);
        f.input.disabled = pos.outside;
      }
      ground.disabled = pos.outside;
      kfDel.disabled = !pos.keyframe || track.keyframeIndex(frame) <= 0;
    };
    refresh();
    return { el, info, img, views, refresh, imgLoaded: false };
  }

  function attachViewTools(el: HTMLElement, cell: GridCell): void {
    el.append(
      h(
        'div',
        { class: 'vtools' },
        h(
          'button',
          {
            title: 'Phóng to toàn cảnh để sửa',
            onclick: (e: MouseEvent) => {
              e.stopPropagation();
              openBigView(cell.frame, cell.view);
            },
          },
          '⛶'
        )
      )
    );
  }

  // ---------- Big View (modal) ----------
  function openBigView(frame: number, view: ViewType): void {
    const frames = [...rows.keys()];
    const cellEl = h('div', { class: 'big-cell' });
    const inner = h('div', { class: 'big-inner' }, cellEl);
    const bwrap = h('div', { class: 'big-wrap' }, inner);

    const bigSettings = Object.create(settings) as GridViewSettings;
    Object.assign(bigSettings, BIG);
    bigSettings.zoom = { top: 1, side: 1, front: 1 };

    const applyScene = (): void => {
      bigSettings.sceneSpan = BIG.fullScene ? BIG.sceneSpan : 0;
      bigSettings.topAll = BIG.fullScene;
      bigSettings.hideGround = BIG.hideGround !== undefined ? BIG.hideGround : settings.hideGround;
      bigSettings.slab = BIG.fullScene ? BIG.slab : settings.slab;
    };
    applyScene();

    const big = new GridViewWebGL({
      wrap: bwrap,
      scroller: inner,
      settings: bigSettings,
      getCloud: (f: number) => (BIG.fullScene ? frameData.clouds.get(f) || null : getCloud(f)),
      getBox: editCallbacks.getBox,
      onEditStart: () => {
        isDragging = true;
        app.snapshot([Number(track.id)]);
      },
      onEdit: (f: number, box: Box3D) => {
        track.setBox(f, box);
        // Isolated Drag Mode: Khi kéo trong modal Big View, chỉ render duy nhất Big View!
        big.requestRender();
      },
      onEditEnd: async (f: number, startBox: Box3D, endBox: Box3D) => {
        isDragging = false;
        rows.get(f)?.refresh();
        select(f);
        renderAll();
        const sizeChanged = endBox.s.some((v, i) => Math.abs(v - startBox.s[i]) > 1e-6);
        if (S.syncSize && sizeChanged) await syncSize(f, endBox.s);
        afterEdit();
      },
      onEditCancel: () => {
        isDragging = false;
        rows.get(cell.frame)?.refresh();
        select(cell.frame);
        renderAll();
        app.dropLastSnapshot();
      },
      onZoom: () => updateBar(),
    });
    extraGrids.add(big);
    const cell = big.addCell(cellEl, frame, view);

    const frameLbl = h('b', { style: { minWidth: '48px', textAlign: 'center' } });
    const kfBadge = h('span', { class: 'kf' });
    const zoomLbl = h('span', { class: 'zoomlbl' });
    const osw = outsideSwitch(() => cell.frame);
    const viewBtns = (Object.keys(VIEW_NAMES) as ViewType[]).map((v) =>
      h('button', { class: 'small', onclick: () => setView(v) }, VIEW_NAMES[v])
    );

    function updateBar(): void {
      frameLbl.textContent = `f${cell.frame}`;
      const pos = track.at(cell.frame);
      kfBadge.className = `kf ${!pos ? 'off' : pos.outside ? 'out' : pos.keyframe ? 'on' : 'off'}`;
      kfBadge.textContent = !pos ? '–' : pos.outside ? 'OUTSIDE' : pos.keyframe ? 'KEYFRAME' : 'nội suy';
      osw.update(!!(pos && pos.outside));
      zoomLbl.textContent = `${Math.round(cell.zoom * 100)}%`;
      (Object.keys(VIEW_NAMES) as ViewType[]).forEach((v, i) =>
        viewBtns[i].classList.toggle('active', v === cell.view)
      );
      ui.setTitle(`ID #${track.uiId} · ${VIEW_NAMES[cell.view]}`);
    }

    function setFrame(f: number): void {
      cell.frame = f;
      select(f);
      rows.get(f)?.el.scrollIntoView({ block: 'nearest' });
      updateBar();
      big.requestRender();
    }

    function step(d: number): void {
      const i = frames.indexOf(cell.frame);
      const j = Math.min(frames.length - 1, Math.max(0, i + d));
      if (j !== i) setFrame(frames[j]);
    }

    function setView(v: ViewType): void {
      cell.view = v;
      big.resetCell(cell);
      updateBar();
    }

    const ui = app.openModal('', bwrap, {
      tools: [
        h('button', { class: 'small', onclick: () => step(-1), title: '←' }, '◀'),
        frameLbl,
        h('button', { class: 'small', onclick: () => step(1), title: '→' }, '▶'),
        kfBadge,
        osw,
        h('span', { class: 'seg' }, ...viewBtns),
        h('button', { class: 'small', onclick: () => big.zoomCell(cell, 1 / 1.25) }, '−'),
        zoomLbl,
        h('button', { class: 'small', onclick: () => big.zoomCell(cell, 1.25) }, '+'),
        h('button', { class: 'small', onclick: () => big.resetCell(cell) }, 'Vừa khung'),
        h(
          'label',
          { title: 'Hiện toàn bộ point cloud như view phóng to của CVAT' },
          h('input', {
            type: 'checkbox',
            checked: BIG.fullScene,
            onchange: (e: Event) => {
              BIG.fullScene = (e.target as HTMLInputElement).checked;
              applyScene();
              big.resetCell(cell);
            },
          }),
          'Toàn cảnh'
        ),
        h(
          'label',
          { title: 'Top: ẩn mặt đất (chỉ hiện điểm cao hơn đáy box 12cm)' },
          h('input', {
            type: 'checkbox',
            checked: BIG.hideGround !== undefined ? BIG.hideGround : settings.hideGround,
            onchange: (e: Event) => {
              BIG.hideGround = (e.target as HTMLInputElement).checked;
              applyScene();
              big.requestRender();
            },
          }),
          'Tắt đất (Top)'
        ),
        h(
          'label',
          { title: 'Side/Front: chỉ hiện điểm cách box ± bao nhiêu mét theo chiều sâu' },
          'Lát cắt ±m',
          h('input', {
            type: 'number',
            value: String(BIG.slab),
            step: '0.5',
            min: '0',
            max: '100',
            style: { width: '56px' },
            onchange: (e: Event) => {
              const v = Number((e.target as HTMLInputElement).value);
              if (Number.isFinite(v)) {
                BIG.slab = v;
                applyScene();
                big.requestRender();
              }
            },
          })
        ),
        h(
          'span',
          { class: 'help' },
          'Cuộn = zoom · kéo = pan · ←/→ frame · 1/2/3 = Top/Side/Front · O = outside'
        ),
      ],
      onKey: (e: KeyboardEvent) => {
        const k = e.key.toLowerCase();
        if ((e.composedPath()[0] as HTMLElement)?.tagName === 'INPUT') return;
        if (k === 'arrowleft') step(-1);
        else if (k === 'arrowright') step(1);
        else if (k === '1') setView('top');
        else if (k === '2') setView('side');
        else if (k === '3') setView('front');
        else if (k === 'o') toggleOutside(cell.frame);
        else if (k === '+' || k === '=') big.zoomCell(cell, 1.25);
        else if (k === '-') big.zoomCell(cell, 1 / 1.25);
        else if (k === '0') big.resetCell(cell);
      },
      onClose: () => {
        extraGrids.delete(big);
        bigViews.delete(ui);
        big.destroy();
      },
    });

    (ui as any).updateBar = updateBar;
    bigViews.add(ui);
    updateBar();
    big.resize();
  }
  const bigViews = new Set<any>();

  // ---------- Camera Images ----------
  async function loadImage(frame: number): Promise<void> {
    const r = rows.get(frame);
    if (!r || r.imgLoaded || !S.showImage) return;
    r.imgLoaded = true;
    try {
      const list = await frameData.contextImages(frame);
      if (!cameraNames.length && list.length) {
        cameraNames = list.map((x) => x.name);
        camSel.replaceChildren(
          ...cameraNames.map((n, i) =>
            h('option', { value: String(i), selected: i === S.camera }, n)
          )
        );
      }
      const pick = list[Math.min(S.camera, list.length - 1)];
      r.img.replaceChildren(
        pick ? h('img', { src: pick.url, alt: pick.name }) : 'không có ảnh'
      );
    } catch {
      r.img.textContent = 'lỗi tải ảnh';
      r.imgLoaded = false;
    }
  }

  function reloadImages(): void {
    for (const r of rows.values()) r.imgLoaded = false;
    for (const [frame, r] of rows) {
      const rect = r.el.getBoundingClientRect();
      const sr = scroller.getBoundingClientRect();
      if (rect.bottom > sr.top - 300 && rect.top < sr.bottom + 300) loadImage(frame);
    }
  }

  async function showAllImages(frame: number): Promise<void> {
    const list = (await frameData.contextImages(frame).catch(() => [])).map((x) => ({
      ...x,
      title: `f${frame} · ${x.name}`,
    }));
    const view = (i: number): void => {
      app.openImageViewer(list, i);
    };
    app.openModal(
      `f${frame} · ${list.length} ảnh camera`,
      h(
        'div',
        { class: 'imgs' },
        ...list.map((x, i) =>
          h(
            'figure',
            { class: 'imgbox' },
            h('img', { src: x.url, alt: x.name, onclick: () => view(i) }),
            h(
              'button',
              { class: 'small max', title: 'Phóng to (zoom, kéo ảnh)', onclick: () => view(i) },
              '⛶ Phóng to'
            ),
            h('figcaption', {}, x.name)
          )
        )
      )
    );
  }

  // ---------- Grid setup ----------
  function fitZoom(): void {
    settings.refSize = refSizeOf(track);
    S.zoom.top = S.zoom.side = S.zoom.front = 1;
    for (const c of grid?.cells || []) {
      c.zoom = 1;
      c.pan = [0, 0];
    }
    renderAll();
  }

  function showProgress(p: {
    done: number;
    total: number;
    fraction: number;
    loadedBytes: number;
    diskCount?: number;
  }): void {
    const pct = Math.round(p.fraction * 100);
    const diskInfo = p.diskCount && p.diskCount > 0 ? ` · 💾 ${p.diskCount} chunk từ ổ cứng` : '';
    if (p.done >= p.total) {
      pfill.style.width = '100%';
      ptext.textContent =
        p.diskCount === p.total
          ? `Point cloud: 100% nạp từ ổ cứng (${p.total} chunk)`
          : `Point cloud: đã tải xong${diskInfo}`;
      setTimeout(() => {
        if (p.done >= p.total) pbar.hidden = true;
      }, 1000);
      return;
    }
    pbar.hidden = false;
    pfill.style.width = `${pct}%`;
    const mb = p.loadedBytes / 1048576;
    ptext.textContent = `Point cloud ${pct}% · ${p.done}/${p.total} chunk${diskInfo}${mb >= 0.1 ? ` · ${mb.toFixed(1)} MB` : ''}`;
  }

  function buildRows(): void {
    const from = Number(fromIn.value);
    const to = Number(toIn.value);
    range = [Math.min(from, to), Math.max(from, to)];
    grid?.clearCells();
    observer?.disconnect();
    rows = new Map();
    scroller.replaceChildren();

    observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) loadImage(Number((e.target as HTMLElement).dataset.frame));
        }
      },
      { root: scroller, rootMargin: '300px' }
    );

    const list = store.frames.filter((f) => f >= range![0] && f <= range![1]);
    for (const frame of list) {
      const r = buildRow(frame);
      rows.set(frame, r);
      scroller.append(r.el);
      (['top', 'side', 'front'] as ViewType[]).forEach((v, i) =>
        attachViewTools(r.views[i], grid!.addCell(r.views[i], frame, v))
      );
      observer.observe(r.el);
    }
    renderAll();

    frameData
      .preload(list, (p: any) => {
        showProgress(p);
        if (p.chunk !== null) renderAll();
      })
      .catch((err: any) => {
        pbar.hidden = true;
        app.setStatus(`Lỗi tải point cloud: ${err.message}`, 'err');
      });
  }

  function openTrack(t: any): void {
    track = t;
    trackSel.value = String(t.id);
    crops = new Map();
    settings.refSize = refSizeOf(t);
    settings.color = store.labelColor(t.labelId);
    const first = Math.max(t.firstFrame, store.frames[0]);
    const last = store.frames[store.frames.length - 1];
    fromIn.value = String(first);
    toIn.value = String(last);
    grid?.destroy();
    grid = new GridViewWebGL({
      wrap,
      scroller,
      settings,
      ...editCallbacks,
    });
    buildRows();
  }

  openTrack(track);

  return {
    refresh() {
      for (const r of rows.values()) r.refresh();
      for (const b of bigViews) b.updateBar?.();
      renderAll();
    },
    onKey(e: KeyboardEvent) {
      if ((e.composedPath()[0] as HTMLElement)?.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      const code = e.code;
      const frames = [...rows.keys()];
      const curFrame = selected !== null ? selected : frames[0];
      if (curFrame === undefined) return;

      // Phím O: Toggle outside
      if (k === 'o' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        toggleOutside(curFrame);
        return;
      }

      // Phím 1 hoặc T: Fit TOP
      if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && (k === '1' || k === 't' || code === 'Digit1' || code === 'KeyT')) {
        e.preventDefault();
        applyFitOperation(curFrame, 'top');
        return;
      }

      // Phím 2: Fit SIDE
      if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && (k === '2' || code === 'Digit2')) {
        e.preventDefault();
        applyFitOperation(curFrame, 'side');
        return;
      }

      // Phím 3: Fit FRONT
      if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && (k === '3' || code === 'Digit3')) {
        e.preventDefault();
        applyFitOperation(curFrame, 'front');
        return;
      }

      // Phím 4: Fit Width
      if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && (k === '4' || code === 'Digit4')) {
        e.preventDefault();
        applyFitOperation(curFrame, 'w');
        return;
      }

      // Phím 5: Fit Height
      if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && (k === '5' || code === 'Digit5')) {
        e.preventDefault();
        applyFitOperation(curFrame, 'h');
        return;
      }

      // Phím G: Ghim đất
      if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && (k === 'g' || code === 'KeyG')) {
        e.preventDefault();
        applyFitOperation(curFrame, 'ground');
        return;
      }

      // Phím F: Flip Yaw
      if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && (k === 'f' || code === 'KeyF')) {
        e.preventDefault();
        applyFitOperation(curFrame, 'flip');
        return;
      }

      // Phím B: Catalog Best-Fit
      if (!e.ctrlKey && !e.metaKey && !e.altKey && (k === 'b' || code === 'KeyB')) {
        e.preventDefault();
        applyFitOperation(curFrame, 'catalog');
        return;
      }

      // Phím P: Fit Pedestrian
      if (!e.ctrlKey && !e.metaKey && !e.altKey && (k === 'p' || code === 'KeyP')) {
        e.preventDefault();
        applyFitOperation(curFrame, e.shiftKey ? 'h' : 'ped_all');
        return;
      }

      // Phím C: Fit Cyclist
      if (!e.ctrlKey && !e.metaKey && !e.altKey && (k === 'c' || code === 'KeyC')) {
        e.preventDefault();
        applyFitOperation(curFrame, e.shiftKey ? 'w' : 'cyclist_all');
        return;
      }

      // Phím Q: Xoay trái -1° (Shift: -5°)
      if (!e.ctrlKey && !e.metaKey && !e.altKey && (k === 'q' || code === 'KeyQ')) {
        e.preventDefault();
        const deltaDeg = e.shiftKey ? -5 : -1;
        editBox(curFrame, (b) => {
          b.r = rotateLocal(b.r, 2, degToRad(deltaDeg));
        });
        app.setStatus(`f${curFrame}: Xoay ${deltaDeg}°`, 'ok');
        return;
      }

      // Phím E: Xoay phải +1° (Shift: +5°)
      if (!e.ctrlKey && !e.metaKey && !e.altKey && (k === 'e' || code === 'KeyE')) {
        e.preventDefault();
        const deltaDeg = e.shiftKey ? 5 : 1;
        editBox(curFrame, (b) => {
          b.r = rotateLocal(b.r, 2, degToRad(deltaDeg));
        });
        app.setStatus(`f${curFrame}: Xoay +${deltaDeg}°`, 'ok');
        return;
      }

      // Shift + W/A/S/D: Nudge box 2cm theo trục xe
      const isKeyW = k === 'w' || code === 'KeyW' || k === 'ư';
      const isKeyA = k === 'a' || code === 'KeyA' || ['á', 'à', 'ả', 'ã', 'ạ', 'â', 'ă'].includes(k);
      const isKeyS = k === 's' || code === 'KeyS';
      const isKeyD = k === 'd' || code === 'KeyD' || k === 'đ';
      if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (isKeyW || isKeyA || isKeyS || isKeyD)) {
        e.preventDefault();
        const dir = isKeyW ? 'w' : isKeyA ? 'a' : isKeyS ? 's' : 'd';
        nudgeBox(curFrame, dir);
        return;
      }

      // PageUp / PageDown: Vi chỉnh Z ±1cm
      if (k === 'pageup' || code === 'PageUp') {
        e.preventDefault();
        editBox(curFrame, (b) => { b.c[2] += 0.01; });
        app.setStatus(`f${curFrame}: Nâng Z +1cm`, 'ok');
        return;
      }
      if (k === 'pagedown' || code === 'PageDown') {
        e.preventDefault();
        editBox(curFrame, (b) => { b.c[2] -= 0.01; });
        app.setStatus(`f${curFrame}: Hạ Z -1cm`, 'ok');
        return;
      }

      // ArrowUp / ArrowDown: Di chuyển qua lại giữa các dòng frame
      if ((k === 'arrowdown' || k === 'arrowup') && frames.length) {
        e.preventDefault();
        const i = selected === null ? -1 : frames.indexOf(selected);
        const j = Math.min(frames.length - 1, Math.max(0, i + (k === 'arrowdown' ? 1 : -1)));
        select(frames[j]);
        rows.get(frames[j])?.el.scrollIntoView({ block: 'nearest' });
      }
    },
    unmount() {
      observer?.disconnect();
      grid?.destroy();
      grid = null;
    },
  };
}
