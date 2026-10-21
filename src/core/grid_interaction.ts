import {
  Box3D,
  axes,
  dotVec,
  addVec,
  subVec,
  scaleVec,
  localToWorld,
  worldToLocal,
  rotateLocal,
  cloneBox,
} from "./geometry";

export type OrthoViewType = "top" | "side" | "front";

export interface ViewAxisDef {
  u: "ex" | "ey" | "ez";
  v: "ex" | "ey" | "ez";
  d: "ex" | "ey" | "ez";
  ui: 0 | 1 | 2; // 0=L (x), 1=W (y), 2=H (z)
  vi: 0 | 1 | 2;
  di: 0 | 1 | 2;
}

export const VIEWS_DEF: Record<OrthoViewType, ViewAxisDef> = {
  top: { u: "ex", v: "ey", d: "ez", ui: 0, vi: 1, di: 2 },
  side: { u: "ex", v: "ez", d: "ey", ui: 0, vi: 2, di: 1 },
  front: { u: "ey", v: "ez", d: "ex", ui: 1, vi: 2, di: 0 },
};

export interface CameraState {
  c: [number, number, number];
  ax: {
    ex: [number, number, number];
    ey: [number, number, number];
    ez: [number, number, number];
  };
  half: [number, number, number];
  pan: [number, number];
}

export interface ViewCellState {
  canvas: HTMLCanvasElement;
  frame: number;
  view: OrthoViewType;
  zoom: number;
  pan: [number, number];
}

export interface HandleItem {
  kind: "resize";
  a: number; // -1, 0, 1
  b: number; // -1, 0, 1
  p: [number, number];
}

export interface HandlesResult {
  list: HandleItem[];
  center: [number, number];
  top: [number, number];
  rot: [number, number];
  P: (a: number, b: number) => [number, number];
}

export interface HitResult {
  kind: "move" | "resize" | "rotate";
  a?: number;
  b?: number;
  box: Box3D;
  cam: CameraState;
  rect: { w: number; h: number };
  ppm: number;
  hs: HandlesResult;
}

export interface DragSession {
  cell: ViewCellState;
  kind: "move" | "resize" | "rotate";
  a?: number;
  b?: number;
  startBox: Box3D;
  cam: CameraState;
  rect: { w: number; h: number };
  ppm: number;
  p0: [number, number, number];
  ang0: number;
  moved: boolean;
}

export const HANDLE_RADIUS = 7;

/**
 * Động cơ tính toán hình chiếu và tương tác chuột trên Canvas Trực giao (Ortho Canvas Engine).
 */
export class OrthoInteractionEngine {
  /**
   * Tính tỷ lệ điểm ảnh trên mét (Pixels Per Meter - PPM).
   */
  public static calculatePpm(
    cell: ViewCellState,
    w: number,
    h: number,
    refSize: [number, number, number],
    globalViewZoom: Record<OrthoViewType, number>,
    isContextMode: boolean = true
  ): number {
    const V = VIEWS_DEF[cell.view];
    const fitFactor = isContextMode ? 2.6 : 1.7;
    const k = Math.min(
      w / (Math.max(0.3, refSize[V.ui]) * fitFactor),
      h / (Math.max(0.3, refSize[V.vi]) * fitFactor)
    );
    return k * (globalViewZoom[cell.view] || 1) * (cell.zoom || 1);
  }

  /**
   * Trích xuất camera state cố định trong phiên kéo để tránh giật hình.
   */
  public static getCamera(cell: ViewCellState, box: Box3D): CameraState {
    const ax = axes(box.r);
    return {
      c: [box.c[0], box.c[1], box.c[2]],
      ax,
      half: [box.s[0] / 2, box.s[1] / 2, box.s[2] / 2],
      pan: [cell.pan[0], cell.pan[1]],
    };
  }

  /**
   * Chuyển tọa độ thế giới (world x, y, z) sang tọa độ pixel trong Canvas.
   */
  public static project(
    p: number[],
    cam: CameraState,
    view: OrthoViewType,
    rect: { w: number; h: number },
    ppm: number
  ): [number, number] {
    const V = VIEWS_DEF[view];
    const w = subVec(p, cam.c);
    return [
      rect.w / 2 + cam.pan[0] + dotVec(w, cam.ax[V.u]) * ppm,
      rect.h / 2 + cam.pan[1] - dotVec(w, cam.ax[V.v]) * ppm,
    ];
  }

  /**
   * Chuyển tọa độ pixel trong Canvas về tọa độ thế giới (world) trên mặt phẳng cắt đi qua tâm.
   */
  public static unproject(
    px: number,
    py: number,
    cam: CameraState,
    view: OrthoViewType,
    rect: { w: number; h: number },
    ppm: number
  ): [number, number, number] {
    const V = VIEWS_DEF[view];
    const u = (px - rect.w / 2 - cam.pan[0]) / ppm;
    const v = -(py - rect.h / 2 - cam.pan[1]) / ppm;
    return addVec(
      cam.c,
      addVec(scaleVec(cam.ax[V.u], u), scaleVec(cam.ax[V.v], v))
    );
  }

  /**
   * Tính toán vị trí các tay cầm (Handles): 4 góc đỏ, 4 cạnh giữa trắng, chấm vàng xoay.
   */
  public static calculateHandles(
    box: Box3D,
    cam: CameraState,
    view: OrthoViewType,
    rect: { w: number; h: number },
    ppm: number
  ): HandlesResult {
    const V = VIEWS_DEF[view];
    const ax = axes(box.r);
    const h = [box.s[0] / 2, box.s[1] / 2, box.s[2] / 2];

    const P = (a: number, b: number): [number, number] => {
      const q: [number, number, number] = [0, 0, 0];
      q[V.ui] = a * h[V.ui];
      q[V.vi] = b * h[V.vi];
      const worldP = localToWorld(q, box.c, ax);
      return this.project(worldP, cam, view, rect, ppm);
    };

    const list: HandleItem[] = [];
    for (const a of [-1, 0, 1]) {
      for (const b of [-1, 0, 1]) {
        if (a === 0 && b === 0) continue;
        list.push({ kind: "resize", a, b, p: P(a, b) });
      }
    }

    const center = P(0, 0);
    const top = P(0, 1);
    const dx = top[0] - center[0];
    const dy = top[1] - center[1];
    const len = Math.hypot(dx, dy) || 1;
    const rot: [number, number] = [
      top[0] + (dx / len) * 22,
      top[1] + (dy / len) * 22,
    ];

    return { list, center, top, rot, P };
  }

  /**
   * Nhận diện phần tử mà chuột click trúng (Hit-Test).
   */
  public static hitTest(
    mx: number,
    my: number,
    cell: ViewCellState,
    box: Box3D,
    rect: { w: number; h: number },
    ppm: number,
    allowTilt: boolean = false
  ): HitResult | null {
    const cam = this.getCamera(cell, box);
    const hs = this.calculateHandles(box, cam, cell.view, rect, ppm);
    const canRotate = cell.view === "top" || allowTilt;

    // 1. Kiểm tra trúng chấm vàng xoay
    if (canRotate && Math.hypot(mx - hs.rot[0], my - hs.rot[1]) <= HANDLE_RADIUS + 2) {
      return { kind: "rotate", box, cam, rect, ppm, hs };
    }

    // 2. Kiểm tra trúng 4 góc đỏ hoặc 4 nút vuông giữa cạnh
    let bestHd: (HandleItem & { d: number }) | null = null;
    for (const hd of hs.list) {
      const d = Math.hypot(mx - hd.p[0], my - hd.p[1]);
      if (d <= HANDLE_RADIUS && (!bestHd || d < bestHd.d)) {
        bestHd = { ...hd, d };
      }
    }
    if (bestHd) {
      return {
        kind: "resize",
        a: bestHd.a,
        b: bestHd.b,
        box,
        cam,
        rect,
        ppm,
        hs,
      };
    }

    // 3. Kiểm tra trúng cạnh của hình chữ nhật
    const V = VIEWS_DEF[cell.view];
    const ax = axes(box.r);
    const p = this.unproject(mx, my, cam, cell.view, rect, ppm);
    const q = worldToLocal(p, box.c, ax);
    const hu = box.s[V.ui] / 2;
    const hv = box.s[V.vi] / 2;
    const tol = 5 / ppm; // dung sai 5px quy ra mét

    const inU = Math.abs(q[V.ui]) <= hu + tol;
    const inV = Math.abs(q[V.vi]) <= hv + tol;

    if (inV && Math.abs(Math.abs(q[V.ui]) - hu) <= tol) {
      return {
        kind: "resize",
        a: Math.sign(q[V.ui]) || 1,
        b: 0,
        box,
        cam,
        rect,
        ppm,
        hs,
      };
    }
    if (inU && Math.abs(Math.abs(q[V.vi]) - hv) <= tol) {
      return {
        kind: "resize",
        a: 0,
        b: Math.sign(q[V.vi]) || 1,
        box,
        cam,
        rect,
        ppm,
        hs,
      };
    }

    // 4. Kiểm tra trúng bên trong thân box (kéo di chuyển Move)
    if (Math.abs(q[V.ui]) < hu && Math.abs(q[V.vi]) < hv) {
      return { kind: "move", box, cam, rect, ppm, hs };
    }

    return null;
  }

  /**
   * Tính toán box mới khi người dùng đang kéo chuột (PointerMove).
   */
  public static computeDragUpdate(
    session: DragSession,
    mx: number,
    my: number,
    isShiftPressed: boolean = false
  ): Box3D {
    const { cell, kind, a, b, startBox, cam, rect, ppm, p0, ang0 } = session;
    const V = VIEWS_DEF[cell.view];
    const box = cloneBox(startBox);
    const p = this.unproject(mx, my, cam, cell.view, rect, ppm);

    if (kind === "move") {
      // Di chuyển thân box trong mặt phẳng trực giao
      const deltaWorld = subVec(p, p0);
      box.c = addVec(startBox.c, deltaWorld);
    } else if (kind === "resize") {
      // Đổi kích thước: Giữ cạnh/góc đối diện đứng yên tuyệt đối
      const ax = axes(startBox.r);
      const q = worldToLocal(p, startBox.c, ax);
      const shift: [number, number, number] = [0, 0, 0];

      const axesToAdjust: Array<[0 | 1 | 2, number | undefined]> = [
        [V.ui, a],
        [V.vi, b],
      ];

      for (const [axis, sign] of axesToAdjust) {
        if (!sign) continue;
        const half = startBox.s[axis] / 2;
        const newSize = Math.max(0.05, sign * q[axis] + half);
        shift[axis] = (sign * (newSize - startBox.s[axis])) / 2;
        box.s[axis] = Number(newSize.toFixed(4));
      }

      box.c = localToWorld(shift, startBox.c, ax);
    } else if (kind === "rotate") {
      // Xoay bằng chấm vàng: Top view xoay Yaw quanh Z, Side xoay Pitch quanh Y, Front xoay Roll quanh X
      const center = this.project(startBox.c, cam, cell.view, rect, ppm);
      const ang = Math.atan2(-(my - center[1]), mx - center[0]);
      let delta = ang - ang0;

      // Giữ Shift để snap bước 5 độ (π / 36)
      if (isShiftPressed) {
        const step = Math.PI / 36;
        delta = Math.round(delta / step) * step;
      }

      if (cell.view === "top") {
        if (!startBox.r[0] && !startBox.r[1]) {
          box.r[2] = startBox.r[2] + delta;
        } else {
          box.r = rotateLocal(startBox.r, 2, delta);
        }
      } else if (cell.view === "side") {
        box.r = rotateLocal(startBox.r, 1, -delta);
      } else {
        box.r = rotateLocal(startBox.r, 0, delta);
      }
    }

    return box;
  }
}
