/**
 * WEBGL HARDWARE CLIPPING ENGINE: LÁT CẮT (SLICING), TẮT ĐẤT & ISOLATE ROI
 * 100% GPU Fragment Discard (0ms CPU Main Thread / 0 Garbage Collection Heap)
 * Bảo toàn 100% Perspective 3D View (View 3D chính không bị cắt)
 */

import { getReduxStore } from "./redux_bridge.ts";

export interface OrthoSlicingConfig {
  hideGround: boolean;
}

export let currentOrthoSlicing: OrthoSlicingConfig = {
  hideGround: true,
};

try {
  const savedSlicing = typeof localStorage !== "undefined" ? localStorage.getItem("cvat_3d_ortho_slicing") : null;
  if (savedSlicing) {
    const parsed = JSON.parse(savedSlicing);
    if (typeof parsed.hideGround === "boolean") currentOrthoSlicing.hideGround = parsed.hideGround;
  }
} catch (_) {}

export function setOrthoSlicingConfig(cfg: Partial<OrthoSlicingConfig>): void {
  if (typeof cfg.hideGround === "boolean") {
    currentOrthoSlicing.hideGround = cfg.hideGround;
    try {
      localStorage.setItem("cvat_3d_ortho_slicing", JSON.stringify(currentOrthoSlicing));
    } catch (_) {}
  }
}

export function getOrthoSlicingConfig(): OrthoSlicingConfig {
  return { ...currentOrthoSlicing };
}

// =========================================================================
// CÁC LỚP THUẦN TOÁN HỌC TƯƠNG THÍCH THREE.JS WEBGL CLIPPING (ZERO-DEPENDENCY)
// =========================================================================
export class ThreeCompatibleVector3 {
  public isVector3: boolean;
  public x: number;
  public y: number;
  public z: number;

  constructor(x: number = 0, y: number = 0, z: number = 0) {
    this.isVector3 = true;
    this.x = x;
    this.y = y;
    this.z = z;
  }

  set(x: number, y: number, z: number) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  copy(v: any) {
    this.x = v?.x || 0;
    this.y = v?.y || 0;
    this.z = v?.z || 0;
    return this;
  }

  clone() {
    return new ThreeCompatibleVector3(this.x, this.y, this.z);
  }

  dot(v: any) {
    return this.x * (v?.x || 0) + this.y * (v?.y || 0) + this.z * (v?.z || 0);
  }

  multiplyScalar(s: number) {
    this.x *= s;
    this.y *= s;
    this.z *= s;
    return this;
  }

  normalize() {
    const l = Math.hypot(this.x, this.y, this.z) || 1;
    this.x /= l;
    this.y /= l;
    this.z /= l;
    return this;
  }

  applyMatrix3(m: any) {
    const x = this.x, y = this.y, z = this.z;
    const e = m?.elements || [1, 0, 0, 0, 1, 0, 0, 0, 1];
    this.x = e[0] * x + e[3] * y + e[6] * z;
    this.y = e[1] * x + e[4] * y + e[7] * z;
    this.z = e[2] * x + e[5] * y + e[8] * z;
    return this;
  }

  applyMatrix4(m: any) {
    const x = this.x, y = this.y, z = this.z;
    const e = m?.elements || [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
    this.x = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
    this.y = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
    this.z = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
    return this;
  }
}

export class ThreeCompatibleMatrix3 {
  public elements: number[];

  constructor() {
    this.elements = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  }

  getNormalMatrix(matrix4: any) {
    const me = matrix4?.elements || [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const te = this.elements;

    const m11 = me[0], m21 = me[1], m31 = me[2];
    const m12 = me[4], m22 = me[5], m32 = me[6];
    const m13 = me[8], m23 = me[9], m33 = me[10];

    te[0] = m22 * m33 - m23 * m32;
    te[1] = m23 * m31 - m21 * m33;
    te[2] = m21 * m32 - m22 * m31;
    te[3] = m13 * m32 - m12 * m33;
    te[4] = m11 * m33 - m13 * m31;
    te[5] = m12 * m31 - m11 * m32;
    te[6] = m12 * m23 - m13 * m22;
    te[7] = m13 * m21 - m11 * m23;
    te[8] = m11 * m22 - m12 * m21;

    const det = m11 * te[0] + m21 * te[3] + m31 * te[6];
    if (det === 0) return this;
    const invDet = 1 / det;
    for (let i = 0; i < 9; i++) te[i] *= invDet;
    return this;
  }
}

export class ThreeCompatiblePlane {
  public isPlane: boolean;
  public normal: ThreeCompatibleVector3;
  public constant: number;

  constructor(normal: any = new ThreeCompatibleVector3(0, 0, 1), constant: number = 0) {
    this.isPlane = true;
    this.normal = normal instanceof ThreeCompatibleVector3 ? normal : new ThreeCompatibleVector3().copy(normal);
    this.constant = constant;
  }

  set(normal: any, constant: number) {
    this.normal.copy(normal);
    this.constant = constant;
    return this;
  }

  setComponents(x: number, y: number, z: number, w: number) {
    this.normal.set(x, y, z);
    this.constant = w;
    return this;
  }

  coplanarPoint(target: any) {
    return target.copy(this.normal).multiplyScalar(-this.constant);
  }

  applyMatrix4(matrix: any, optionalNormalMatrix?: any) {
    const normalMatrix = optionalNormalMatrix || new ThreeCompatibleMatrix3().getNormalMatrix(matrix);
    const refPt = this.coplanarPoint(new ThreeCompatibleVector3()).applyMatrix4(matrix);
    const norm = this.normal.clone().applyMatrix3(normalMatrix).normalize();
    this.constant = -refPt.dot(norm);
    this.normal.copy(norm);
    return this;
  }
}

const cachedTopPlanes: any[] = [];
let clippingThreeEngine: any = null;
let lastGlobalClippingActive: boolean = false;

export function getClippingThree(): any {
  if (clippingThreeEngine) return clippingThreeEngine;
  const win = typeof window !== "undefined" ? (window as any) : {};
  if (win.THREE && typeof win.THREE.Plane === "function") {
    clippingThreeEngine = win.THREE;
    return clippingThreeEngine;
  }
  const store = getReduxStore();
  const canvas = store?.getState()?.annotation?.canvas?.instance;
  if (canvas?.THREE && typeof canvas.THREE.Plane === "function") {
    clippingThreeEngine = canvas.THREE;
    return clippingThreeEngine;
  }
  if (canvas?.view?.THREE && typeof canvas.view.THREE.Plane === "function") {
    clippingThreeEngine = canvas.view.THREE;
    return clippingThreeEngine;
  }
  clippingThreeEngine = {
    Plane: ThreeCompatiblePlane,
    Vector3: ThreeCompatibleVector3,
    Matrix3: ThreeCompatibleMatrix3,
  };
  return clippingThreeEngine;
}

export function ensurePlaneAt(arr: any[], index: number, ThreeClass: any): any {
  while (arr.length <= index) {
    const PlaneCtor = ThreeClass?.Plane || ThreeCompatiblePlane;
    const VecCtor = ThreeClass?.Vector3 || ThreeCompatibleVector3;
    arr.push(new PlaneCtor(new VecCtor(0, 0, 1), 0));
  }
  return arr[index];
}

export function applyClippingPlanesToView(view: any, planes: any[], _isSharedScene?: boolean): void {
  if (!view) return;
  if (view.renderer) {
    view.renderer.localClippingEnabled = planes.length > 0;
    view.renderer.clippingPlanes = planes;
  }
}

/**
 * Tính toán và cập nhật các mặt phẳng cắt GPU WebGL cho 3 view trực giao (Top, Side, Front)
 * Giữ lại duy nhất chức năng Tắt Đất (Top View: cắt tại Z_base + 12cm).
 * Side và Front hoàn toàn không cắt (0 clipping planes -> 60 FPS cực mượt khi drag/zoom).
 */
export function updateOrthoClippingPlanes(
  overrideTarget?: any,
  forceRender: boolean = true,
  lastActiveTrackId?: number | null,
  extractPointsHelper?: (numId: number) => number[] | null
): void {
  try {
    const Three = getClippingThree();
    const store = getReduxStore();
    const canvas = store?.getState()?.annotation?.canvas?.instance;
    const views = canvas?.view?.views;
    if (!views) return;

    const topView = views.top;
    const sideView = views.side;
    const frontView = views.front;
    const perspectiveView = views.perspective;

    if (perspectiveView?.renderer && perspectiveView.renderer.clippingPlanes && perspectiveView.renderer.clippingPlanes.length > 0) {
      perspectiveView.renderer.clippingPlanes = [];
    }

    const activeId =
      overrideTarget?.clientId ??
      canvas?.view?.activatedElementID ??
      store?.getState()?.annotation?.annotations?.activatedStateClientID ??
      lastActiveTrackId;

    const isAnyClippingActive = !!(
      currentOrthoSlicing.hideGround &&
      activeId && !isNaN(Number(activeId)) && Number(activeId) > 0
    );

    if (lastGlobalClippingActive !== isAnyClippingActive) {
      lastGlobalClippingActive = isAnyClippingActive;
      const scenesToNotify: any[] = [];
      for (const k of ["top", "side", "front", "perspective"]) {
        const sc = views[k]?.scene;
        if (sc && !scenesToNotify.includes(sc)) scenesToNotify.push(sc);
      }
      for (const sc of scenesToNotify) {
        if (typeof sc?.traverse === "function") {
          sc.traverse((obj: any) => {
            if (obj && (obj.isPoints || obj.type === "Points") && obj.material) {
              obj.material.needsUpdate = true;
            }
          });
        }
      }
    }

    const isSharedScene =
      !!(topView?.scene && perspectiveView?.scene && topView.scene === perspectiveView.scene);

    if (!isAnyClippingActive || !Three) {
      applyClippingPlanesToView(topView, [], isSharedScene);
      applyClippingPlanesToView(sideView, [], isSharedScene);
      applyClippingPlanesToView(frontView, [], isSharedScene);
      applyClippingPlanesToView(perspectiveView, [], isSharedScene);
      return;
    }

    const numId = Number(activeId);
    let p: number[] | null = null;
    if (overrideTarget?.points && Array.isArray(overrideTarget.points)) {
      p = overrideTarget.points;
    } else if (extractPointsHelper) {
      p = extractPointsHelper(numId);
    }

    if (!p || p.length < 9) {
      applyClippingPlanesToView(topView, [], isSharedScene);
      applyClippingPlanesToView(sideView, [], isSharedScene);
      applyClippingPlanesToView(frontView, [], isSharedScene);
      applyClippingPlanesToView(perspectiveView, [], isSharedScene);
      return;
    }

    const cx = p[0], cy = p[1], cz = p[2];
    const rx = p[3] || 0;
    const ry = p[4] || 0;
    const rz = p[5] || 0;
    const h = p[8];
    const halfH = h / 2;

    const cosZ = Math.cos(rz), sinZ = Math.sin(rz);
    const cosY = Math.cos(ry), sinY = Math.sin(ry);
    const cosX = Math.cos(rx), sinX = Math.sin(rx);

    const uzx = cosZ * sinY * cosX + sinZ * sinX;
    const uzy = sinZ * sinY * cosX - cosZ * sinX;
    const uzz = cosY * cosX;

    const setPlane = (plane: any, nx: number, ny: number, nz: number, px: number, py: number, pz: number) => {
      plane.normal.set(nx, ny, nz);
      plane.constant = -(nx * px + ny * py + nz * pz);
    };

    const activeTopPlanes: any[] = [];
    if (currentOrthoSlicing.hideGround) {
      const pzCutX = cx + (-halfH + 0.12) * uzx;
      const pzCutY = cy + (-halfH + 0.12) * uzy;
      const pzCutZ = cz + (-halfH + 0.12) * uzz;
      const pl = ensurePlaneAt(cachedTopPlanes, 0, Three);
      setPlane(pl, uzx, uzy, uzz, pzCutX, pzCutY, pzCutZ);
      activeTopPlanes.push(pl);
    }

    applyClippingPlanesToView(topView, activeTopPlanes, isSharedScene);
    applyClippingPlanesToView(sideView, [], isSharedScene);
    applyClippingPlanesToView(frontView, [], isSharedScene);
    applyClippingPlanesToView(perspectiveView, [], isSharedScene);

    if (forceRender && typeof canvas?.render === "function") {
      canvas.render();
    }
  } catch (e) {
    console.warn("[CVAT 3D Suite] Lỗi updateOrthoClippingPlanes:", e);
  }
}
