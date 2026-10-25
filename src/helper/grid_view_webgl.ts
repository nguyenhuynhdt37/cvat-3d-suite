/**
 * Lưới các ô Top / Side / Front: 1 canvas WebGL2 cho point cloud + 1 canvas 2D cho box & tay cầm.
 * Mỗi ô là 1 phần tử HTML trong danh sách cuộn; canvas phủ lên và chỉ vẽ các ô đang nhìn thấy.
 * Port từ cvat-helper/content/views.js (583 dòng) sang TypeScript strict.
 */

import {
  cloneBox,
  axes,
  boxCorners,
  BOX_EDGES,
  rotateLocal,
  type Box3D,
} from '../core/geometry';

export type ViewType = 'top' | 'side' | 'front';

export interface ViewAxisDef {
  u: 'ex' | 'ey' | 'ez';
  v: 'ex' | 'ey' | 'ez';
  d: 'ex' | 'ey' | 'ez';
  ui: 0 | 1 | 2;
  vi: 0 | 1 | 2;
  di: 0 | 1 | 2;
}

export const VIEWS: Record<ViewType, ViewAxisDef> = {
  // u = trục ngang màn hình, v = trục dọc (lên trên), d = trục chiều sâu (đều là trục cục bộ của box)
  top: { u: 'ex', v: 'ey', d: 'ez', ui: 0, vi: 1, di: 2 },
  side: { u: 'ex', v: 'ez', d: 'ey', ui: 0, vi: 2, di: 1 },
  front: { u: 'ey', v: 'ez', d: 'ex', ui: 1, vi: 2, di: 0 },
};

const VS = `#version 300 es
  in vec3 aPos;
  uniform vec3 uC, uU, uV, uD;
  uniform vec2 uScale, uDepth, uPan;
  uniform float uPointSize;
  uniform vec3 uBC, uBx, uBy, uBz, uBHalf;
  uniform vec3 uColIn, uColOut;
  out vec3 vCol;
  void main() {
    vec3 w = aPos - uC;
    float d = dot(w, uD);
    if (d < uDepth.x || d > uDepth.y) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      vCol = vec3(0.0);
      return;
    }
    gl_Position = vec4(dot(w, uU) * uScale.x + uPan.x, dot(w, uV) * uScale.y + uPan.y, 0.0, 1.0);
    gl_PointSize = uPointSize;
    vec3 b = aPos - uBC;
    vec3 q = vec3(dot(b, uBx), dot(b, uBy), dot(b, uBz));
    vCol = all(lessThanEqual(abs(q), uBHalf)) ? uColIn : uColOut;
  }`;

const FS = `#version 300 es
  precision mediump float;
  in vec3 vCol;
  out vec4 outColor;
  void main() { outColor = vec4(vCol, 1.0); }`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type);
  if (!s) throw new Error('Không thể tạo WebGL shader');
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error(info || 'Lỗi biên dịch shader');
  }
  return s;
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex || '');
  return m ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255] : [0.35, 0.82, 0.48];
}

const HANDLE_R = 7;

// Vector 3D math helpers
const dotVec = (u: number[], v: number[]): number => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
const addVec = (u: number[], v: number[]): [number, number, number] => [u[0] + v[0], u[1] + v[1], u[2] + v[2]];
const subVec = (u: number[], v: number[]): [number, number, number] => [u[0] - v[0], u[1] - v[1], u[2] - v[2]];
const scaleVec = (u: number[], k: number): [number, number, number] => [u[0] * k, u[1] * k, u[2] * k];

function localToWorldVec(
  q: number[],
  c: [number, number, number],
  ax: { ex: [number, number, number]; ey: [number, number, number]; ez: [number, number, number] }
): [number, number, number] {
  return addVec(c, addVec(scaleVec(ax.ex, q[0]), addVec(scaleVec(ax.ey, q[1]), scaleVec(ax.ez, q[2]))));
}

function worldToLocalVec(
  p: [number, number, number],
  c: [number, number, number],
  ax: { ex: [number, number, number]; ey: [number, number, number]; ez: [number, number, number] }
): [number, number, number] {
  const v = subVec(p, c);
  return [dotVec(v, ax.ex), dotVec(v, ax.ey), dotVec(v, ax.ez)];
}

export interface GridCell {
  el: HTMLElement;
  frame: number;
  view: ViewType;
  zoom: number;
  pan: [number, number];
}

export interface GridViewSettings {
  refSize: [number, number, number];
  zoom: Record<ViewType, number>;
  pointSize: number;
  slab: number;
  hideGround: boolean;
  allowTilt: boolean;
  context?: boolean;
  topAll?: boolean;
  sceneSpan?: number;
  color: string;
}

export interface BoxPosState {
  box: Box3D;
  keyframe: boolean;
  outside: boolean;
}

export interface GridViewOptions {
  wrap: HTMLElement;
  scroller: HTMLElement;
  getCloud: (frame: number) => Float32Array | null;
  getBox: (frame: number) => BoxPosState | null;
  onEditStart?: (frame: number) => void;
  onEdit?: (frame: number, box: Box3D) => void;
  onEditEnd?: (frame: number, startBox: Box3D, endBox: Box3D) => void;
  onEditCancel?: (frame: number) => void;
  onZoom?: (cell?: GridCell) => void;
  settings: GridViewSettings;
}

interface CameraInternal {
  c: [number, number, number];
  ax: { ex: [number, number, number]; ey: [number, number, number]; ez: [number, number, number] };
  half: [number, number, number];
  pan: [number, number];
}

interface DragState {
  cell: GridCell;
  kind: 'move' | 'resize' | 'rotate';
  a?: number;
  b?: number;
  startBox: Box3D;
  cam: CameraInternal;
  rect: { x: number; y: number; w: number; h: number };
  ppm: number;
  p0: [number, number, number];
  ang0: number;
  moved: boolean;
}

interface HandlesResult {
  list: Array<{ kind: 'resize'; a: number; b: number; p: [number, number] }>;
  center: [number, number];
  top: [number, number];
  rot: [number, number];
  P: (a: number, b: number) => [number, number];
}

export class GridViewWebGL {
  public wrap: HTMLElement;
  public scroller: HTMLElement;
  public getCloud: (frame: number) => Float32Array | null;
  public getBox: (frame: number) => BoxPosState | null;
  public onEditStart?: (frame: number) => void;
  public onEdit?: (frame: number, box: Box3D) => void;
  public onEditEnd?: (frame: number, startBox: Box3D, endBox: Box3D) => void;
  public onEditCancel?: (frame: number) => void;
  public onZoom?: (cell?: GridCell) => void;
  public settings: GridViewSettings;

  public cells: Set<GridCell> = new Set();
  private buffers: Map<number, { array: Float32Array; buf: WebGLBuffer; count: number }> = new Map();
  private drag: DragState | null = null;
  private pending: boolean = false;
  private dpr: number = 1;

  // Cache Bounding Rects để đạt 60 FPS, 0ms Layout Thrashing
  private cachedCellRects: Map<GridCell, { x: number; y: number; w: number; h: number }> = new Map();
  private cachedVisRect: { x: number; y: number; w: number; h: number } | null = null;
  private cachedWrapRect: DOMRect | null = null;
  private rectsDirty: boolean = true;

  private glCanvas: HTMLCanvasElement;
  private uiCanvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private ctx: CanvasRenderingContext2D;
  private prog: WebGLProgram;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private aPos: number;
  private vao: WebGLVertexArrayObject | null;
  private onScroll: () => void;
  private resizeObs: ResizeObserver;

  public invalidateRects(): void {
    this.rectsDirty = true;
    this.cachedWrapRect = null;
    this.cachedVisRect = null;
    this.cachedCellRects.clear();
  }

  public getWrapRect(): DOMRect {
    if (!this.cachedWrapRect || this.rectsDirty) {
      this.cachedWrapRect = this.wrap.getBoundingClientRect();
    }
    return this.cachedWrapRect;
  }

  constructor(opts: GridViewOptions) {
    this.wrap = opts.wrap;
    this.scroller = opts.scroller;
    this.getCloud = opts.getCloud;
    this.getBox = opts.getBox;
    this.onEditStart = opts.onEditStart;
    this.onEdit = opts.onEdit;
    this.onEditEnd = opts.onEditEnd;
    this.onEditCancel = opts.onEditCancel;
    this.onZoom = opts.onZoom;
    this.settings = opts.settings;

    this.glCanvas = document.createElement('canvas');
    this.uiCanvas = document.createElement('canvas');

    for (const c of [this.uiCanvas, this.glCanvas]) {
      Object.assign(c.style, { position: 'absolute', left: '0', top: '0', pointerEvents: 'none' });
      this.wrap.insertBefore(c, this.wrap.firstChild);
    }

    if (getComputedStyle(this.scroller).position === 'static') {
      this.scroller.style.position = 'relative';
    }
    this.scroller.style.zIndex = '1';

    const gl = this.glCanvas.getContext('webgl2', {
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('Trình duyệt không hỗ trợ WebGL2');
    this.gl = gl;

    const ctx = this.uiCanvas.getContext('2d');
    if (!ctx) throw new Error('Không thể khởi tạo 2D Context');
    this.ctx = ctx;

    const prog = gl.createProgram();
    if (!prog) throw new Error('Không thể tạo WebGL Program');
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(prog) || 'Lỗi link shader');
    }
    this.prog = prog;

    for (const n of [
      'uC', 'uU', 'uV', 'uD', 'uScale', 'uDepth', 'uPan',
      'uPointSize', 'uBC', 'uBx', 'uBy', 'uBz', 'uBHalf', 'uColIn', 'uColOut',
    ]) {
      this.loc[n] = gl.getUniformLocation(prog, n);
    }
    this.aPos = gl.getAttribLocation(prog, 'aPos');
    this.vao = gl.createVertexArray();

    this.onScroll = () => {
      this.invalidateRects();
      this.requestRender();
    };
    this.scroller.addEventListener('scroll', this.onScroll, { passive: true });
    this.resizeObs = new ResizeObserver(() => {
      this.invalidateRects();
      this.resize();
    });
    this.resizeObs.observe(this.wrap);
    this.resize();
  }

  destroy(): void {
    this.scroller.removeEventListener('scroll', this.onScroll);
    this.resizeObs.disconnect();
    this.invalidateRects();
    for (const b of this.buffers.values()) {
      this.gl.deleteBuffer(b.buf);
    }
    this.buffers.clear();
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.glCanvas.remove();
    this.uiCanvas.remove();
  }

  resize(): void {
    this.invalidateRects();
    const dpr = window.devicePixelRatio || 1;
    const w = this.wrap.clientWidth;
    const h = this.wrap.clientHeight;
    this.dpr = dpr;
    for (const c of [this.glCanvas, this.uiCanvas]) {
      c.width = Math.max(1, Math.round(w * dpr));
      c.height = Math.max(1, Math.round(h * dpr));
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
    }
    this.requestRender();
  }

  addCell(el: HTMLElement, frame: number, view: ViewType): GridCell {
    this.invalidateRects();
    const cell: GridCell = { el, frame, view, zoom: 1, pan: [0, 0] };
    this.cells.add(cell);

    el.addEventListener('pointerdown', (e) => this.pointerDown(e, cell));
    el.addEventListener('pointermove', (e) => this.pointerHover(e, cell));
    el.addEventListener('wheel', (e) => this.wheel(e, cell), { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('dblclick', (e) => {
      const r = this.cellRect(cell);
      const wr = this.getWrapRect();
      if (!this.hit(cell, e.clientX - (wr.left + r.x), e.clientY - (wr.top + r.y))) {
        this.resetCell(cell);
      }
    });
    return cell;
  }

  removeCell(cell: GridCell): void {
    this.invalidateRects();
    this.cells.delete(cell);
    this.requestRender();
  }

  zoomCell(cell: GridCell, k: number, mx?: number, my?: number): void {
    const rect = this.cellRect(cell);
    if (mx === undefined) mx = rect.w / 2;
    if (my === undefined) my = rect.h / 2;
    const nz = Math.min(30, Math.max(0.1, cell.zoom * k));
    k = nz / cell.zoom;
    cell.pan[0] = mx - rect.w / 2 - (mx - rect.w / 2 - cell.pan[0]) * k;
    cell.pan[1] = my - rect.h / 2 - (my - rect.h / 2 - cell.pan[1]) * k;
    cell.zoom = nz;
    this.onZoom?.(cell);
    this.requestRender();
  }

  resetCell(cell: GridCell): void {
    cell.zoom = 1;
    cell.pan = [0, 0];
    this.onZoom?.(cell);
    this.requestRender();
  }

  clearCells(): void {
    this.cells.clear();
  }

  invalidateCloud(frame: number): void {
    const b = this.buffers.get(frame);
    if (b) {
      this.gl.deleteBuffer(b.buf);
      this.buffers.delete(frame);
    }
    this.requestRender();
  }

  requestRender(): void {
    if (this.pending) return;
    this.pending = true;
    requestAnimationFrame(() => {
      this.pending = false;
      this.render();
    });
  }

  // ---------- camera ----------

  ppm(cell: GridCell, w: number, h: number): number {
    const S = this.settings;
    let k: number;
    if (S.sceneSpan) {
      k = w / S.sceneSpan;
    } else {
      const s = S.refSize;
      const V = VIEWS[cell.view];
      const fit = S.context ? 2.6 : 1.7;
      k = Math.min(w / (s[V.ui] * fit), h / (s[V.vi] * fit));
    }
    return k * (S.zoom[cell.view] || 1) * (cell.zoom || 1);
  }

  camera(cell: GridCell, pos: BoxPosState): CameraInternal {
    if (this.drag && this.drag.cell === cell && this.drag.cam) return this.drag.cam;
    return {
      c: [pos.box.c[0], pos.box.c[1], pos.box.c[2]],
      ax: axes(pos.box.r),
      half: [pos.box.s[0] / 2, pos.box.s[1] / 2, pos.box.s[2] / 2],
      pan: cell.pan,
    };
  }

  cellRect(cell: GridCell): { x: number; y: number; w: number; h: number } {
    if (!this.rectsDirty && this.cachedCellRects.has(cell)) {
      return this.cachedCellRects.get(cell)!;
    }
    const r = cell.el.getBoundingClientRect();
    const wr = this.getWrapRect();
    const res = { x: r.left - wr.left, y: r.top - wr.top, w: r.width, h: r.height };
    this.cachedCellRects.set(cell, res);
    return res;
  }

  visibleRect(): { x: number; y: number; w: number; h: number } {
    if (!this.rectsDirty && this.cachedVisRect) {
      return this.cachedVisRect;
    }
    const sr = this.scroller.getBoundingClientRect();
    const wr = this.getWrapRect();
    this.cachedVisRect = {
      x: sr.left - wr.left,
      y: sr.top - wr.top,
      w: this.scroller.clientWidth,
      h: this.scroller.clientHeight,
    };
    return this.cachedVisRect;
  }

  project(
    p: [number, number, number],
    cam: CameraInternal,
    view: ViewType,
    rect: { w: number; h: number },
    ppm: number
  ): [number, number] {
    const V = VIEWS[view];
    const w = subVec(p, cam.c);
    return [
      rect.w / 2 + cam.pan[0] + dotVec(w, cam.ax[V.u]) * ppm,
      rect.h / 2 + cam.pan[1] - dotVec(w, cam.ax[V.v]) * ppm,
    ];
  }

  unproject(
    px: number,
    py: number,
    cam: CameraInternal,
    view: ViewType,
    rect: { w: number; h: number },
    ppm: number
  ): [number, number, number] {
    const V = VIEWS[view];
    const u = (px - rect.w / 2 - cam.pan[0]) / ppm;
    const v = -(py - rect.h / 2 - cam.pan[1]) / ppm;
    return addVec(cam.c, addVec(scaleVec(cam.ax[V.u], u), scaleVec(cam.ax[V.v], v)));
  }

  // ---------- render ----------

  private uploadCloud(frame: number): { array: Float32Array; buf: WebGLBuffer; count: number } | null {
    let b = this.buffers.get(frame);
    if (this.drag && b) return b;

    const array = this.getCloud(frame);
    if (!array) return null;
    if (b && b.array === array) return b;

    const gl = this.gl;
    const buf = b?.buf || gl.createBuffer();
    if (!buf) return null;

    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, array, gl.STATIC_DRAW);
    if (!b) {
      b = { array, buf, count: array.length / 3 };
      this.buffers.set(frame, b);
    } else {
      b.array = array;
      b.count = array.length / 3;
    }
    return b;
  }

  render(): void {
    const gl = this.gl;
    const ctx = this.ctx;
    const dpr = this.dpr;
    const H = this.glCanvas.height;
    const vis = this.visibleRect();
    const S = this.settings;
    const colIn = hexToRgb(S.color);
    const colOut: [number, number, number] = [0.78, 0.78, 0.78];

    gl.disable(gl.SCISSOR_TEST);
    gl.viewport(0, 0, this.glCanvas.width, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.uiCanvas.width, this.uiCanvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.enable(gl.SCISSOR_TEST);

    for (const cell of this.cells) {
      const r = this.cellRect(cell);
      const x0 = Math.max(r.x, vis.x);
      const y0 = Math.max(r.y, vis.y);
      const x1 = Math.min(r.x + r.w, vis.x + vis.w);
      const y1 = Math.min(r.y + r.h, vis.y + vis.h);
      if (x1 <= x0 || y1 <= y0) continue;

      const pos = this.getBox(cell.frame);
      gl.scissor(
        Math.round(x0 * dpr),
        Math.round(H - y1 * dpr),
        Math.round((x1 - x0) * dpr),
        Math.round((y1 - y0) * dpr)
      );
      gl.viewport(
        Math.round(r.x * dpr),
        Math.round(H - (r.y + r.h) * dpr),
        Math.round(r.w * dpr),
        Math.round(r.h * dpr)
      );
      gl.clearColor(0.02, 0.02, 0.03, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (!pos) continue;

      const V = VIEWS[cell.view];
      const cam = this.camera(cell, pos);
      const ppm = this.ppm(cell, r.w, r.h);
      const buf = this.uploadCloud(cell.frame);

      if (buf && buf.count) {
        const slab = S.slab;
        const hd = cam.half[V.di];
        let depth: [number, number];
        if (cell.view === 'top') {
          if (S.topAll || S.context) {
            depth = [S.hideGround ? -cam.half[2] + 0.12 : -1e6, 1e6];
          } else {
            depth = [S.hideGround ? -cam.half[2] + 0.12 : -cam.half[2] - 1.5, cam.half[2] + 0.5];
          }
        } else {
          depth = [-hd - slab, hd + slab];
        }
        const bax = axes(pos.box.r);
        const l = this.loc;
        gl.uniform3fv(l.uC, cam.c);
        gl.uniform3fv(l.uU, cam.ax[V.u]);
        gl.uniform3fv(l.uV, cam.ax[V.v]);
        gl.uniform3fv(l.uD, cam.ax[V.d]);
        gl.uniform2f(l.uScale, (2 * ppm) / r.w, (2 * ppm) / r.h);
        gl.uniform2f(l.uPan, (2 * cam.pan[0]) / r.w, (-2 * cam.pan[1]) / r.h);
        gl.uniform2f(l.uDepth, depth[0], depth[1]);
        gl.uniform1f(l.uPointSize, S.pointSize * dpr);
        gl.uniform3fv(l.uBC, pos.box.c);
        gl.uniform3fv(l.uBx, bax.ex);
        gl.uniform3fv(l.uBy, bax.ey);
        gl.uniform3fv(l.uBz, bax.ez);
        gl.uniform3fv(l.uBHalf, [pos.box.s[0] / 2 + 0.02, pos.box.s[1] / 2 + 0.02, pos.box.s[2] / 2 + 0.02]);
        gl.uniform3fv(l.uColIn, colIn);
        gl.uniform3fv(l.uColOut, colOut);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf.buf);
        gl.enableVertexAttribArray(this.aPos);
        gl.vertexAttribPointer(this.aPos, 3, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.POINTS, 0, buf.count);
      }

      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, x1 - x0, y1 - y0);
      ctx.clip();
      ctx.translate(r.x, r.y);
      this.drawBox(ctx, cell, pos, cam, r, ppm, !buf);
      ctx.restore();
    }
    gl.disable(gl.SCISSOR_TEST);
    this.rectsDirty = false;
  }

  handles(
    cell: GridCell,
    pos: BoxPosState,
    cam: CameraInternal,
    rect: { w: number; h: number },
    ppm: number
  ): HandlesResult {
    const V = VIEWS[cell.view];
    const box = pos.box;
    const ax = axes(box.r);
    const h = [box.s[0] / 2, box.s[1] / 2, box.s[2] / 2];
    const P = (a: number, b: number): [number, number] => {
      const q: [number, number, number] = [0, 0, 0];
      q[V.ui] = a * h[V.ui];
      q[V.vi] = b * h[V.vi];
      return this.project(localToWorldVec(q, box.c, ax), cam, cell.view, rect, ppm);
    };
    const list: Array<{ kind: 'resize'; a: number; b: number; p: [number, number] }> = [];
    for (const a of [-1, 0, 1]) {
      for (const b of [-1, 0, 1]) {
        if (a === 0 && b === 0) continue;
        list.push({ kind: 'resize', a, b, p: P(a, b) });
      }
    }
    const center = P(0, 0);
    const top = P(0, 1);
    const dx = top[0] - center[0];
    const dy = top[1] - center[1];
    const len = Math.hypot(dx, dy) || 1;
    const rot: [number, number] = [top[0] + (dx / len) * 22, top[1] + (dy / len) * 22];
    return { list, center, top, rot, P };
  }

  drawBox(
    ctx: CanvasRenderingContext2D,
    cell: GridCell,
    pos: BoxPosState,
    cam: CameraInternal,
    rect: { w: number; h: number },
    ppm: number,
    noCloud: boolean
  ): void {
    const color = pos.outside ? '#888888' : this.settings.color;
    const corners = boxCorners(pos.box).map((p) =>
      this.project([p[0], p[1], p[2]], cam, cell.view, rect, ppm)
    );
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = color;
    ctx.setLineDash(pos.keyframe ? [] : [5, 4]);
    ctx.beginPath();
    for (const [i, j] of BOX_EDGES) {
      ctx.moveTo(corners[i][0], corners[i][1]);
      ctx.lineTo(corners[j][0], corners[j][1]);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = '#dddddd';
    ctx.fillText(cell.view.toUpperCase(), 6, 14);
    if (pos.outside) {
      ctx.fillStyle = '#f0a020';
      ctx.fillText('OUTSIDE', 6, 28);
    }
    if (noCloud) {
      ctx.fillStyle = '#aaaaaa';
      ctx.fillText('đang tải point cloud…', 6, rect.h - 8);
    }
    if (pos.outside) return;

    const hs = this.handles(cell, pos, cam, rect, ppm);
    const canRotate = cell.view === 'top' || this.settings.allowTilt;
    if (canRotate) {
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(hs.top[0], hs.top[1]);
      ctx.lineTo(hs.rot[0], hs.rot[1]);
      ctx.stroke();
      ctx.fillStyle = '#ffd33d';
      ctx.beginPath();
      ctx.arc(hs.rot[0], hs.rot[1], 5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const hd of hs.list) {
      ctx.fillStyle = hd.a !== 0 && hd.b !== 0 ? '#ff4d4d' : '#ffffff';
      ctx.fillRect(hd.p[0] - 3, hd.p[1] - 3, 6, 6);
    }
    if (cell.view === 'top') {
      const front = hs.P(1, 0);
      ctx.strokeStyle = '#ff4d4d';
      ctx.beginPath();
      ctx.moveTo(hs.center[0], hs.center[1]);
      ctx.lineTo(front[0], front[1]);
      ctx.stroke();
    }
  }

  // ---------- interaction ----------

  hit(
    cell: GridCell,
    mx: number,
    my: number
  ): {
    kind: 'move' | 'resize' | 'rotate';
    a?: number;
    b?: number;
    pos: BoxPosState;
    cam: CameraInternal;
    rect: { w: number; h: number; x: number; y: number };
    ppm: number;
    hs: HandlesResult;
  } | null {
    const pos = this.getBox(cell.frame);
    if (!pos || pos.outside) return null;
    const rect = this.cellRect(cell);
    const cam = this.camera(cell, pos);
    const ppm = this.ppm(cell, rect.w, rect.h);
    const hs = this.handles(cell, pos, cam, rect, ppm);
    const canRotate = cell.view === 'top' || this.settings.allowTilt;

    if (canRotate && Math.hypot(mx - hs.rot[0], my - hs.rot[1]) <= HANDLE_R + 2) {
      return { kind: 'rotate', pos, cam, rect, ppm, hs };
    }

    let best: { a: number; b: number; d: number } | null = null;
    for (const hd of hs.list) {
      const d = Math.hypot(mx - hd.p[0], my - hd.p[1]);
      if (d <= HANDLE_R && (!best || d < best.d)) {
        best = { a: hd.a, b: hd.b, d };
      }
    }
    if (best) {
      return { kind: 'resize', a: best.a, b: best.b, pos, cam, rect, ppm, hs };
    }

    const V = VIEWS[cell.view];
    const ax = axes(pos.box.r);
    const p = this.unproject(mx, my, cam, cell.view, rect, ppm);
    const q = worldToLocalVec(p, pos.box.c, ax);
    const hu = pos.box.s[V.ui] / 2;
    const hv = pos.box.s[V.vi] / 2;
    const tol = 5 / ppm;
    const inU = Math.abs(q[V.ui]) <= hu + tol;
    const inV = Math.abs(q[V.vi]) <= hv + tol;

    if (inV && Math.abs(Math.abs(q[V.ui]) - hu) <= tol) {
      return { kind: 'resize', a: Math.sign(q[V.ui]) || 1, b: 0, pos, cam, rect, ppm, hs };
    }
    if (inU && Math.abs(Math.abs(q[V.vi]) - hv) <= tol) {
      return { kind: 'resize', a: 0, b: Math.sign(q[V.vi]) || 1, pos, cam, rect, ppm, hs };
    }
    if (Math.abs(q[V.ui]) < hu && Math.abs(q[V.vi]) < hv) {
      return { kind: 'move', pos, cam, rect, ppm, hs };
    }
    return null;
  }

  pointerHover(e: PointerEvent, cell: GridCell): void {
    if (this.drag) return;
    const r = this.cellRect(cell);
    const wr = this.getWrapRect();
    const h = this.hit(cell, e.clientX - (wr.left + r.x), e.clientY - (wr.top + r.y));
    let cursor = 'grab';
    if (h) {
      if (h.kind === 'move') cursor = 'move';
      else if (h.kind === 'rotate') cursor = 'grab';
      else if (h.a && h.b) cursor = 'nwse-resize';
      else cursor = h.a ? 'ew-resize' : 'ns-resize';
    }
    cell.el.style.cursor = cursor;
  }

  panDrag(e: PointerEvent, cell: GridCell): void {
    e.preventDefault();
    cell.el.setPointerCapture(e.pointerId);
    cell.el.style.cursor = 'grabbing';
    let lx = e.clientX;
    let ly = e.clientY;

    const move = (ev: PointerEvent): void => {
      cell.pan[0] += ev.clientX - lx;
      cell.pan[1] += ev.clientY - ly;
      lx = ev.clientX;
      ly = ev.clientY;
      this.requestRender();
    };

    const up = (): void => {
      cell.el.style.cursor = '';
      cell.el.removeEventListener('pointermove', move);
      cell.el.removeEventListener('pointerup', up);
      cell.el.removeEventListener('pointercancel', up);
    };

    cell.el.addEventListener('pointermove', move);
    cell.el.addEventListener('pointerup', up);
    cell.el.addEventListener('pointercancel', up);
  }

  pointerDown(e: PointerEvent, cell: GridCell): void {
    if (e.target !== cell.el) return;
    const r = this.cellRect(cell);
    const wr = this.getWrapRect();
    const mx = e.clientX - (wr.left + r.x);
    const my = e.clientY - (wr.top + r.y);

    if (e.button === 1 || e.button === 2) {
      this.panDrag(e, cell);
      return;
    }
    if (e.button !== 0) return;

    const h = this.hit(cell, mx, my);
    if (!h) {
      this.panDrag(e, cell);
      return;
    }

    e.preventDefault();
    cell.el.setPointerCapture(e.pointerId);
    const startBox = cloneBox(h.pos.box);
    const cam: CameraInternal = {
      c: [h.cam.c[0], h.cam.c[1], h.cam.c[2]],
      ax: h.cam.ax,
      half: [h.cam.half[0], h.cam.half[1], h.cam.half[2]],
      pan: [h.cam.pan[0], h.cam.pan[1]],
    };

    this.drag = {
      cell,
      kind: h.kind,
      a: h.a,
      b: h.b,
      startBox,
      cam,
      rect: h.rect,
      ppm: h.ppm,
      p0: this.unproject(mx, my, cam, cell.view, h.rect, h.ppm),
      ang0: Math.atan2(-(my - h.hs.center[1]), mx - h.hs.center[0]),
      moved: false,
    };
    this.onEditStart?.(cell.frame);

    const move = (ev: PointerEvent): void => this.pointerMove(ev, cell);
    const up = (): void => {
      cell.el.removeEventListener('pointermove', move);
      cell.el.removeEventListener('pointerup', up);
      cell.el.removeEventListener('pointercancel', up);
      const d = this.drag;
      this.drag = null;
      if (d) {
        if (d.moved) {
          const currentPos = this.getBox(cell.frame);
          if (currentPos) {
            this.onEditEnd?.(cell.frame, d.startBox, currentPos.box);
          }
        } else {
          this.onEditCancel?.(cell.frame);
        }
      }
      this.requestRender();
    };

    cell.el.addEventListener('pointermove', move);
    cell.el.addEventListener('pointerup', up);
    cell.el.addEventListener('pointercancel', up);
  }

  pointerMove(e: PointerEvent, cell: GridCell): void {
    const d = this.drag;
    if (!d || d.cell !== cell) return;
    const r = this.cellRect(cell);
    const wr = this.getWrapRect();
    const mx = e.clientX - (wr.left + r.x);
    const my = e.clientY - (wr.top + r.y);
    const V = VIEWS[cell.view];
    const box = cloneBox(d.startBox);
    const p = this.unproject(mx, my, d.cam, cell.view, d.rect, d.ppm);

    if (d.kind === 'move') {
      box.c = addVec(d.startBox.c, subVec(p, d.p0));
    } else if (d.kind === 'resize') {
      const ax = axes(d.startBox.r);
      const q = worldToLocalVec(p, d.startBox.c, ax);
      const shift: [number, number, number] = [0, 0, 0];
      for (const [axis, sign] of [
        [V.ui, d.a],
        [V.vi, d.b],
      ] as Array<[0 | 1 | 2, number]>) {
        if (!sign) continue;
        const half = d.startBox.s[axis] / 2;
        const size = Math.max(0.05, sign * q[axis] + half);
        shift[axis] = (sign * (size - d.startBox.s[axis])) / 2;
        box.s[axis] = size;
      }
      box.c = localToWorldVec(shift, d.startBox.c, ax);
    } else if (d.kind === 'rotate') {
      const center = this.project(d.startBox.c, d.cam, cell.view, d.rect, d.ppm);
      const ang = Math.atan2(-(my - center[1]), mx - center[0]);
      let delta = ang - d.ang0;
      if (e.shiftKey) delta = Math.round(delta / (Math.PI / 36)) * (Math.PI / 36);

      if (cell.view === 'top') {
        if (!d.startBox.r[0] && !d.startBox.r[1]) {
          box.r[2] = d.startBox.r[2] + delta;
        } else {
          box.r = rotateLocal(d.startBox.r, 2, delta);
        }
      } else if (cell.view === 'side') {
        box.r = rotateLocal(d.startBox.r, 1, -delta);
      } else {
        box.r = rotateLocal(d.startBox.r, 0, delta);
      }
    }
    d.moved = true;
    this.onEdit?.(cell.frame, box);
    this.requestRender();
  }

  wheel(e: WheelEvent, cell: GridCell): void {
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY || e.deltaX;
    if (!delta) return;
    const k = delta < 0 ? 1.15 : 1 / 1.15;
    if (e.shiftKey) {
      const z = this.settings.zoom;
      z[cell.view] = Math.min(20, Math.max(0.2, (z[cell.view] || 1) * k));
      this.onZoom?.();
      this.requestRender();
      return;
    }
    const r = this.cellRect(cell);
    const wr = this.getWrapRect();
    this.zoomCell(cell, k, e.clientX - (wr.left + r.x), e.clientY - (wr.top + r.y));
  }
}
