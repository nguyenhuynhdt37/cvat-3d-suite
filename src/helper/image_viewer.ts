/**
 * Canvas-based Image Viewer: zoom tại con trỏ, pan, double-click fit, mũi tên đổi ảnh.
 * Port từ cvat-helper/content/app.js (openImageViewer, dòng 315-403).
 */

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface ImageItem {
  name: string;
  url: string;
  title?: string;
}

export interface ModalOpts {
  tools?: HTMLElement[];
  onKey?(e: KeyboardEvent): void;
  onClose?(): void;
}

export interface ModalHandle {
  modal: HTMLElement;
  setTitle(t: string): void;
  close(): void;
}

export type OpenModalFn = (
  title: string,
  content: HTMLElement,
  opts?: ModalOpts,
) => ModalHandle;

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
// openImageViewer
// ---------------------------------------------------------------------------

/**
 * Mở trình xem ảnh canvas toàn cảnh bên trong modal.
 *
 * - Cuộn chuột = zoom tại con trỏ
 * - Kéo = di chuyển ảnh
 * - Double-click = vừa khung
 * - ←/→ = chuyển ảnh trước/sau
 * - +/- = zoom, 0 = fit
 *
 * @param list Danh sách ảnh
 * @param startIndex Chỉ số ảnh ban đầu
 * @param openModalFn Hàm mở modal (lấy từ HelperApp.openModal)
 * @returns ModalHandle để điều khiển modal
 */
export function openImageViewer(
  list: ImageItem[],
  startIndex: number,
  openModalFn: OpenModalFn,
): ModalHandle {
  let index = startIndex;
  let img: HTMLImageElement | null = null;
  let s = 1;
  let tx = 0;
  let ty = 0;
  let fitted = true;

  const canvas = h('canvas') as HTMLCanvasElement;
  const area = h('div', { class: 'viewer' }, canvas);
  const zoomLbl = h('span', { class: 'zoomlbl' });
  const ctx = canvas.getContext('2d')!;

  // ---- Vẽ ----

  function draw(): void {
    const dpr = window.devicePixelRatio || 1;
    const W = area.clientWidth;
    const H = area.clientHeight;
    const rW = Math.round(W * dpr);
    const rH = Math.round(H * dpr);
    if (canvas.width !== rW || canvas.height !== rH) {
      canvas.width = rW;
      canvas.height = rH;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    if (!img) return;
    ctx.imageSmoothingEnabled = s < 3; // phóng lớn → hiện rõ từng pixel
    ctx.drawImage(img, tx, ty, img.width * s, img.height * s);
    zoomLbl.textContent = `${Math.round(s * 100)}%`;
  }

  function fit(): void {
    if (!img) return;
    const W = area.clientWidth;
    const H = area.clientHeight;
    s = Math.min(W / img.width, H / img.height);
    tx = (W - img.width * s) / 2;
    ty = (H - img.height * s) / 2;
    fitted = true;
    draw();
  }

  function zoomAt(k: number, mx: number, my: number): void {
    const ns = Math.min(40, Math.max(0.05, s * k));
    const ratio = ns / s;
    tx = mx - (mx - tx) * ratio;
    ty = my - (my - ty) * ratio;
    s = ns;
    fitted = false;
    draw();
  }

  function load(i: number): void {
    index = ((i % list.length) + list.length) % list.length;
    ui.setTitle(
      `${list[index].title || list[index].name} · ${index + 1}/${list.length}`,
    );
    const im = new Image();
    im.onload = () => {
      img = im;
      fit();
    };
    im.src = list[index].url;
  }

  // ---- Sự kiện ----

  area.addEventListener(
    'wheel',
    (e: WheelEvent) => {
      e.preventDefault();
      const r = area.getBoundingClientRect();
      zoomAt(
        e.deltaY < 0 ? 1.2 : 1 / 1.2,
        e.clientX - r.left,
        e.clientY - r.top,
      );
    },
    { passive: false },
  );

  area.addEventListener('pointerdown', (e: PointerEvent) => {
    area.setPointerCapture(e.pointerId);
    area.classList.add('dragging');
    let lx = e.clientX;
    let ly = e.clientY;

    const move = (ev: PointerEvent): void => {
      tx += ev.clientX - lx;
      ty += ev.clientY - ly;
      lx = ev.clientX;
      ly = ev.clientY;
      fitted = false;
      draw();
    };

    const up = (): void => {
      area.classList.remove('dragging');
      area.removeEventListener('pointermove', move as EventListener);
      area.removeEventListener('pointerup', up);
    };

    area.addEventListener('pointermove', move as EventListener);
    area.addEventListener('pointerup', up);
  });

  area.addEventListener('dblclick', fit);

  const center = (k: number): void =>
    zoomAt(k, area.clientWidth / 2, area.clientHeight / 2);

  // ---- Toolbar ----

  const tools: HTMLElement[] = [
    h('button', { class: 'small', onclick: () => load(index - 1), title: '←' }, '◀'),
    h('button', { class: 'small', onclick: () => load(index + 1), title: '→' }, '▶'),
    h('button', { class: 'small', onclick: () => center(1 / 1.25), title: '-' }, '−'),
    zoomLbl,
    h('button', { class: 'small', onclick: () => center(1.25), title: '+' }, '+'),
    h(
      'button',
      { class: 'small', onclick: fit, title: 'Vừa khung (double-click)' },
      'Vừa khung',
    ),
    h(
      'button',
      {
        class: 'small',
        onclick: () => {
          if (!img) return;
          const W = area.clientWidth;
          const H = area.clientHeight;
          s = 1;
          tx = (W - img.width) / 2;
          ty = (H - img.height) / 2;
          fitted = false;
          draw();
        },
      },
      '1:1',
    ),
    h(
      'span',
      { class: 'help' },
      'Cuộn = zoom · kéo = di chuyển · double-click = vừa khung · ←/→ đổi ảnh',
    ),
  ];

  // ---- ResizeObserver ----

  const ro = new ResizeObserver(() => (fitted ? fit() : draw()));

  // ---- Modal ----

  const ui = openModalFn('', area, {
    tools,
    onKey: (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') load(index - 1);
      else if (e.key === 'ArrowRight') load(index + 1);
      else if (e.key === '+' || e.key === '=') center(1.25);
      else if (e.key === '-') center(1 / 1.25);
      else if (e.key === '0') fit();
    },
    onClose: () => ro.disconnect(),
  });

  ro.observe(area);
  load(index);

  return ui;
}
