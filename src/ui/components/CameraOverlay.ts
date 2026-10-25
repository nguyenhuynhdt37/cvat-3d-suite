/**
 * ==============================================================================
 * CVAT 3D SUITE - CAMERA 2D OVERLAY & HUD VIEWPORTS MANAGER
 * ==============================================================================
 * Quản lý 8 khung nhìn Camera Context Images đính kèm Canvas 2D trong suốt:
 * - Vẽ 12 cạnh khung dây 3D lên ảnh 2D thời gian thực (Realtime 60fps / <0.5ms).
 * - Tự động Highlight và gắn Badge Camera nhìn thấy đối tượng (85% Chính / 15% Mép).
 * - Tự động làm mờ các camera không nhìn thấy vật thể (Smart Visibility Focus).
 * - Hỗ trợ Click đúp để mở Focus Modal phóng to toàn màn hình.
 * ==============================================================================
 */

import type { Box3D } from "../../core/geometry.ts";
import type { CameraConfig } from "../../core/projection.ts";
import { getActiveCameras } from "../../core/calibration.ts";
import type { VinCalibCamera } from "../../core/calibration.ts";
import { ICONS } from "../icons.ts";

// ===========================================================================
// DAY14 PROJECTION ENGINE (port nguyên bản từ d14-projection-overlay.js)
// Pipeline: eulerXYZ → boxCorners → lidarToCam → distort → pixel
// ===========================================================================

const NEAR_Z = 0.1;
const EDGE_STEPS = 16;
// corner order: 0-3 bottom (z-), 4-7 top (z+); 0,1,5,4 = front face (x+)
const D14_UNIT: number[][] = [
  [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5], [-0.5, -0.5, -0.5],
  [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, -0.5, 0.5],
];
const D14_EDGES: number[][] = [
  [0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
];
const FRONT_SET = new Set(["0-1", "1-5", "5-4", "4-0", "1-0", "5-1", "4-5", "0-4"]);

function eulerXYZ(rx: number, ry: number, rz: number): number[][] {
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(rx), Math.sin(rx), Math.cos(ry),
    Math.sin(ry), Math.cos(rz), Math.sin(rz)];
  return [
    [cy * cz, -cy * sz, sy],
    [sx * sy * cz + cx * sz, -sx * sy * sz + cx * cz, -sx * cy],
    [-cx * sy * cz + sx * sz, cx * sy * sz + sx * cz, cx * cy],
  ];
}

function d14BoxCorners(position: number[], rotation: number[], scale: number[]): number[][] {
  const R = eulerXYZ(rotation[0], rotation[1], rotation[2]);
  return D14_UNIT.map((u) => {
    const p = [u[0] * scale[0], u[1] * scale[1], u[2] * scale[2]];
    return [0, 1, 2].map((r) => R[r][0] * p[0] + R[r][1] * p[1] + R[r][2] * p[2] + position[r]);
  });
}

function d14Transform(p: number[], T: number[][]): number[] {
  return [0, 1, 2].map((r) => T[r][0] * p[0] + T[r][1] * p[1] + T[r][2] * p[2] + T[r][3]);
}

function d14DistCoeffs(dist: number[]): number[] {
  const d = [0, 0, 0, 0, 0];
  (dist || []).slice(0, 5).forEach((v, i) => { d[i] = Number(v); });
  return d;
}

function d14RadialFoldR2(dist: number[]): number {
  const d = d14DistCoeffs(dist);
  const c = [1.0, 3.0 * d[0], 5.0 * d[1], 7.0 * d[4]];
  let deg = 3;
  while (deg > 0 && c[deg] === 0.0) deg -= 1;
  if (deg === 0) return Infinity;
  const g = (s: number) => c[0] + s * (c[1] + s * (c[2] + s * c[3]));
  let top = 0.0;
  for (let i = 0; i < deg; i += 1) top = Math.max(top, Math.abs(c[i]));
  const bound = 1.0 + top / Math.abs(c[deg]);
  let crit: number[] = [];
  const [qa, qb, qc] = [3.0 * c[3], 2.0 * c[2], c[1]];
  if (qa !== 0.0) {
    const disc = qb * qb - 4.0 * qa * qc;
    if (disc >= 0.0) {
      const sq = Math.sqrt(disc);
      crit = [(-qb - sq) / (2.0 * qa), (-qb + sq) / (2.0 * qa)];
    }
  } else if (qb !== 0.0) {
    crit = [-qc / qb];
  }
  const knots = [0.0, bound, ...crit.filter((s) => s > 0.0 && s < bound)].sort((x, y) => x - y);
  for (let k = 0; k + 1 < knots.length; k += 1) {
    let [lo, hi] = [knots[k], knots[k + 1]];
    if (g(hi) > 0.0) continue;
    for (let it = 0; it < 200; it += 1) {
      const mid = 0.5 * (lo + hi);
      if (mid <= lo || mid >= hi) break;
      if (g(mid) > 0.0) lo = mid; else hi = mid;
    }
    return lo;
  }
  return Infinity;
}

interface D14CamCalib {
  K: number[][];
  dist: number[];
  image_size: [number, number];
  ego2cam: number[][];
  _foldR2?: number;
}

function d14MaxR2(cam: D14CamCalib): number {
  if (cam._foldR2 === undefined) cam._foldR2 = d14RadialFoldR2(cam.dist || []);
  return cam._foldR2;
}

function d14DistortToPixel(xn: number, yn: number, cam: D14CamCalib): [number, number] {
  const [k1, k2, p1, p2, k3] = d14DistCoeffs(cam.dist);
  const r2 = xn * xn + yn * yn;
  const radial = 1 + k1 * r2 + k2 * r2 * r2 + k3 * r2 * r2 * r2;
  const xd = xn * radial + 2 * p1 * xn * yn + p2 * (r2 + 2 * xn * xn);
  const yd = yn * radial + p1 * (r2 + 2 * yn * yn) + 2 * p2 * xn * yn;
  return [cam.K[0][0] * xd + cam.K[0][2], cam.K[1][1] * yd + cam.K[1][2]];
}

function d14ClipEdgeView(a: number[], b: number[], m: number): [number, number] | null {
  if (a[2] <= NEAR_Z && b[2] <= NEAR_Z) return null;
  let [t0, t1] = [0.0, 1.0];
  if (a[2] <= NEAR_Z || b[2] <= NEAR_Z) {
    const t = (NEAR_Z - a[2]) / (b[2] - a[2]);
    if (a[2] > NEAR_Z) t1 = t; else t0 = t;
  }
  if (m === Infinity) return [t0, t1];
  const [dx, dy, dz] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const qa = dx * dx + dy * dy - m * dz * dz;
  const qb = 2.0 * (a[0] * dx + a[1] * dy - m * a[2] * dz);
  const qc = a[0] * a[0] + a[1] * a[1] - m * a[2] * a[2];
  let roots: number[] = [];
  if (qa !== 0.0) {
    const disc = qb * qb - 4.0 * qa * qc;
    if (disc > 0.0) {
      const sq = Math.sqrt(disc);
      const h = qb >= 0.0 ? -0.5 * (qb + sq) : -0.5 * (qb - sq);
      roots = [h / qa, qc / h];
    }
  } else if (qb !== 0.0) {
    roots = [-qc / qb];
  }
  const knots = [t0, t1, ...roots.filter((r) => r > t0 && r < t1)].sort((x, y) => x - y);
  const inside: number[][] = [];
  for (let k = 0; k + 1 < knots.length; k += 1) {
    const mid = 0.5 * (knots[k] + knots[k + 1]);
    if ((qa * mid + qb) * mid + qc <= 0.0) inside.push([knots[k], knots[k + 1]]);
  }
  if (!inside.length || inside[inside.length - 1][1] <= inside[0][0]) return null;
  return [inside[0][0], inside[inside.length - 1][1]];
}

function d14EdgePolyline(a: number[], b: number[], cam: D14CamCalib): number[][] | null {
  const span = d14ClipEdgeView(a, b, d14MaxR2(cam));
  if (!span) return null;
  const [t0, t1] = span;
  const pts: number[][] = [];
  for (let k = 0; k <= EDGE_STEPS; k += 1) {
    const t = t0 + (t1 - t0) * k / EDGE_STEPS;
    const p = [0, 1, 2].map((i) => a[i] + t * (b[i] - a[i]));
    pts.push(d14DistortToPixel(p[0] / p[2], p[1] / p[2], cam));
  }
  return pts;
}

/** Stored VinFast calibration for Day14 projection */
let storedVinCalib: {
  pcd_frame: string;
  lidar: { sensor2ego: number[][] };
  cameras: Record<string, D14CamCalib>;
} | null = null;

export function setVinCalibForOverlay(calib: any): void {
  storedVinCalib = calib;
}

export function getStoredVinCalib(): typeof storedVinCalib {
  return storedVinCalib;
}

/**
 * Map tên camera mặc định (DEFAULT_VINFAST_ADAS) sang tên VinFast calibration thực tế.
 * VinFast context images trong ZIP: image_0..image_7
 * Theo Day14 config: image_1 = CAM_P_F (camera trước chính diện)
 * Default cameras grid: id=0 CAM_FRONT, id=1 CAM_FRONT_LEFT, id=2 CAM_FRONT_RIGHT, ...
 * Ảnh ZIP được map theo index: image_N → viewport id=N
 * Vậy: viewport id=1 (slot CAM_FRONT_LEFT) chứa ảnh image_1 = CAM_P_F
 *
 * CHỈ map camera có calibration thực sự. Camera không có calibration → chỉ hiện ảnh, không vẽ wireframe.
 * Khi có đầy đủ calibration 8 camera, mở rộng mapping này.
 */
const VIN_CAMERA_NAME_MAP: Record<string, string> = {
  // id=1 (CAM_FRONT_LEFT slot) chứa image_1 = CAM_P_F (đã xác nhận từ Day14 config)
  "CAM_FRONT_LEFT": "CAM_P_F",
  // Các camera khác chưa có calibration → KHÔNG map → không vẽ wireframe
  // Khi có thêm calibration, thêm mapping vào đây:
  // "CAM_FRONT": "CAM_P_??",         // image_0
  // "CAM_FRONT_RIGHT": "CAM_P_FR",   // image_2
  // "CAM_SIDE_LEFT": "CAM_P_SL",     // image_3
  // "CAM_SIDE_RIGHT": "CAM_P_SR",    // image_4
  // "CAM_BACK_LEFT": "CAM_P_BL",     // image_5
  // "CAM_BACK_RIGHT": "CAM_P_BR",    // image_6
  // "CAM_BACK": "CAM_P_B",           // image_7
};

/**
 * Resolve tên camera trong VinCalib: thử tên gốc trước, rồi thử map.
 */
function resolveVinCameraName(camName: string): string | null {
  if (!storedVinCalib) return null;
  // Tên gốc khớp trực tiếp
  if (storedVinCalib.cameras[camName]) return camName;
  // Map tên default → VinFast
  const mapped = VIN_CAMERA_NAME_MAP[camName];
  if (mapped && storedVinCalib.cameras[mapped]) return mapped;
  return null;
}

/**
 * Render wireframe Day14 lên một CanvasRenderingContext2D bất kỳ.
 * Dùng chung cho CameraOverlay HUD và CameraFocusModal.
 * Trả về true nếu box nhìn thấy trên camera này.
 */
export function renderDay14WireframeOnContext(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  box: Box3D,
  cameraName: string,
): boolean {
  if (!storedVinCalib) return false;

  const resolvedName = resolveVinCameraName(cameraName);
  if (!resolvedName) return false;

  const camCalib = storedVinCalib.cameras[resolvedName];
  if (!camCalib) return false;

  const cornersLidar = d14BoxCorners(box.c, box.r, box.s);

  // Chuyển 8 đỉnh sang hệ camera: lidar → ego → cam
  const cornersCam = cornersLidar.map((p) => {
    const ego = storedVinCalib!.pcd_frame === "ego" ? p : d14Transform(p, storedVinCalib!.lidar.sensor2ego);
    return d14Transform(ego, camCalib.ego2cam);
  });

  // Chiếu 8 đỉnh và kiểm tra visibility
  const [W, H] = camCalib.image_size;
  const maxR2 = d14MaxR2(camCalib);
  const projected = cornersCam.map((pc) => {
    const front = pc[2] > NEAR_Z;
    const z = front ? pc[2] : 1.0;
    const xn = pc[0] / z;
    const yn = pc[1] / z;
    const [u, v] = d14DistortToPixel(xn, yn, camCalib);
    return { u, v, valid: front && xn * xn + yn * yn <= maxR2 };
  });

  const inImage = projected.filter((q) => q.valid && q.u >= 0 && q.u < W && q.v >= 0 && q.v < H).length;
  if (inImage === 0) return false;

  // Vẽ 12 cạnh
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const base = Math.max(2, W / 480);

  for (const [i, j] of D14_EDGES) {
    const pts = d14EdgePolyline(cornersCam[i], cornersCam[j], camCalib);
    if (!pts) continue;

    const isFrontEdge = FRONT_SET.has(`${i}-${j}`);
    ctx.lineWidth = isFrontEdge ? base * 2.5 : base * 1.5;
    ctx.strokeStyle = isFrontEdge ? "#ef4444" : "#22c55e";

    ctx.beginPath();
    pts.forEach(([u, v], k) => (k ? ctx.lineTo(u, v) : ctx.moveTo(u, v)));
    ctx.stroke();
  }

  // Vẽ 8 đỉnh tròn
  ctx.fillStyle = "#ffffff";
  for (const q of projected) {
    if (q.valid && q.u >= 0 && q.u < W && q.v >= 0 && q.v < H) {
      ctx.beginPath();
      ctx.arc(q.u, q.v, base * 2, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // Vẽ nhãn kích thước
  const validPts = projected.filter((q) => q.valid && q.u >= 0 && q.u < W && q.v >= 0 && q.v < H);
  if (validPts.length >= 2) {
    const uMin = Math.min(...validPts.map((p) => p.u));
    const uMax = Math.max(...validPts.map((p) => p.u));
    const vMin = Math.min(...validPts.map((p) => p.v));
    const labelX = (uMin + uMax) / 2;
    const labelY = Math.max(30, vMin - 12);
    const text = `L:${box.s[0].toFixed(2)}m W:${box.s[1].toFixed(2)}m H:${box.s[2].toFixed(2)}m`;

    ctx.font = `bold ${Math.max(14, base * 5)}px -apple-system, BlinkMacSystemFont, sans-serif`;
    const textMetrics = ctx.measureText(text);
    const pad = 6;

    ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
    ctx.fillRect(labelX - textMetrics.width / 2 - pad, labelY - 16, textMetrics.width + 2 * pad, 24);

    ctx.fillStyle = "#facc15";
    ctx.textAlign = "center";
    ctx.fillText(text, labelX, labelY);
  }

  return true;
}

export class CameraOverlayManager {
  private static instance: CameraOverlayManager | null = null;
  private container: HTMLDivElement | null = null;
  private isEnabled: boolean = true;
  private isCollapsed: boolean = false;
  private activeBox: Box3D | null = null;
  private activeCameras: CameraConfig[] = [];
  private viewports: Map<number, {
    container: HTMLDivElement;
    img: HTMLImageElement;
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    badge: HTMLSpanElement;
  }> = new Map();

  // Callback mở modal Focus
  public onCameraFocusRequested?: (cameraId: number, cameraName: string) => void;

  private constructor() {
    this.activeCameras = getActiveCameras();
  }

  public static getInstance(): CameraOverlayManager {
    if (!CameraOverlayManager.instance) {
      CameraOverlayManager.instance = new CameraOverlayManager();
    }
    return CameraOverlayManager.instance;
  }

  /**
   * Khởi tạo HUD giao diện 8 Camera Thumbnail tại góc phải dưới màn hình CVAT
   */
  public mount(): void {
    if (document.getElementById("cvat-3d-suite-camera-hud")) {
      return;
    }

    this.container = document.createElement("div");
    this.container.id = "cvat-3d-suite-camera-hud";
    this.container.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 360px;
      z-index: 9998;
      background: rgba(255, 255, 255, 0.96);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1px solid #e4e4e7;
      border-radius: 12px;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
      width: 480px;
      max-height: 420px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      transition: all 0.25s ease-in-out;
    `;

    this.container.innerHTML = `
      <!-- Header HUD -->
      <div style="
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        background: #f8fafc;
        border-bottom: 1px solid #f1f5f9;
        user-select: none;
      ">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="color: #0284c7; display: flex;">${ICONS.camera}</span>
          <span style="font-weight: 700; font-size: 12px; color: #0f172a;">Camera 2D Wireframe HUD</span>
          <span id="cvat-cam-hud-counter" style="
            font-size: 10px;
            font-weight: 600;
            color: #64748b;
            background: #e2e8f0;
            padding: 2px 6px;
            border-radius: 9999px;
          ">8 Cams</span>
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <button id="cvat-cam-hud-toggle-btn" title="Bật/Tắt Vẽ Khung 2D" style="
            background: #f1f5f9;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            cursor: pointer;
            padding: 3px 6px;
            display: flex;
            align-items: center;
            font-size: 11px;
            color: #334155;
          ">${ICONS.eye}</button>
          <button id="cvat-cam-hud-collapse-btn" title="Thu gọn/Mở rộng" style="
            background: transparent;
            border: none;
            cursor: pointer;
            padding: 2px;
            display: flex;
            color: #64748b;
          ">${ICONS.chevronDown}</button>
        </div>
      </div>

      <!-- Grid 8 Camera Views -->
      <div id="cvat-cam-hud-grid" style="
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 6px;
        padding: 8px;
        background: #09090b;
        overflow-y: auto;
        max-height: 360px;
      "></div>
    `;

    document.body.appendChild(this.container);
    console.log("[Camera HUD] mount() - HUD container đã append vào document.body, cameras:", this.activeCameras.length);

    // Xây dựng 8 Viewport Canvases
    this.buildCameraViewports();

    // Gắn sự kiện thu gọn / mở rộng
    const collapseBtn = this.container.querySelector("#cvat-cam-hud-collapse-btn");
    const gridEl = this.container.querySelector<HTMLDivElement>("#cvat-cam-hud-grid");
    collapseBtn?.addEventListener("click", () => {
      this.isCollapsed = !this.isCollapsed;
      if (gridEl) {
        gridEl.style.display = this.isCollapsed ? "none" : "grid";
      }
      if (collapseBtn) {
        collapseBtn.innerHTML = this.isCollapsed ? ICONS.chevronUp : ICONS.chevronDown;
      }
    });

    // Sự kiện Bật/Tắt Overlay
    const toggleBtn = this.container.querySelector("#cvat-cam-hud-toggle-btn");
    toggleBtn?.addEventListener("click", () => {
      this.isEnabled = !this.isEnabled;
      if (toggleBtn) {
        toggleBtn.innerHTML = this.isEnabled ? ICONS.eye : ICONS.eyeOff;
        toggleBtn.style.color = this.isEnabled ? "#0284c7" : "#94a3b8";
      }
      this.clearAllCanvases();
      if (this.isEnabled && this.activeBox) {
        this.renderBox(this.activeBox);
      }
    });
  }

  /**
   * Tạo 8 khung ảnh kèm canvas overlay
   */
  private buildCameraViewports(): void {
    const grid = this.container?.querySelector<HTMLDivElement>("#cvat-cam-hud-grid");
    if (!grid) return;

    grid.innerHTML = "";
    this.viewports.clear();

    for (const cam of this.activeCameras) {
      const card = document.createElement("div");
      card.className = "cvat-cam-card";
      card.id = `cvat-cam-card-${cam.id}`;
      card.title = `Click đúp để xem phóng to ${cam.name}`;
      card.style.cssText = `
        position: relative;
        background: #18181b;
        border: 2px solid #27272a;
        border-radius: 6px;
        overflow: hidden;
        cursor: pointer;
        aspect-ratio: 16 / 9;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease-in-out;
      `;

      // Thẻ ảnh
      const img = document.createElement("img");
      img.style.cssText = `
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      `;
      img.alt = cam.name;
      // Placeholder ảnh xám khi chưa tải
      img.src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90" viewBox="0 0 160 90"><rect width="100%" height="100%" fill="%2327272a"/><text x="50%" y="50%" fill="%2371717a" font-size="10" font-family="sans-serif" dominant-baseline="middle" text-anchor="middle">${cam.name}</text></svg>`;

      // Thẻ Canvas trong suốt đè lên trên ảnh
      const canvas = document.createElement("canvas");
      canvas.width = cam.imageWidth || 1920;
      canvas.height = cam.imageHeight || 1080;
      canvas.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
      `;

      const ctx = canvas.getContext("2d")!;

      // Badge nhãn camera & % bao phủ
      const badge = document.createElement("span");
      badge.style.cssText = `
        position: absolute;
        top: 3px;
        left: 3px;
        font-size: 9px;
        font-weight: 700;
        padding: 1px 4px;
        border-radius: 4px;
        background: rgba(0, 0, 0, 0.75);
        color: #f1f5f9;
        pointer-events: none;
        letter-spacing: 0.3px;
      `;
      badge.innerText = cam.name;

      card.appendChild(img);
      card.appendChild(canvas);
      card.appendChild(badge);
      grid.appendChild(card);

      // Lưu trữ viewport
      this.viewports.set(cam.id, {
        container: card,
        img,
        canvas,
        ctx,
        badge,
      });

      // Sự kiện click đúp phóng to Focus Modal
      card.addEventListener("click", () => {
        if (typeof this.onCameraFocusRequested === "function") {
          this.onCameraFocusRequested(cam.id, cam.name);
        }
      });
    }
  }

  /**
   * Lấy URL ảnh hiện tại của một camera (dùng để truyền sang FocusModal)
   */
  public getCameraImageSrc(cameraId: number): string | null {
    const vp = this.viewports.get(cameraId);
    if (vp && vp.img.src && !vp.img.src.startsWith("data:image/svg+xml")) {
      return vp.img.src;
    }
    return null;
  }

  /**
   * Cập nhật nguồn ảnh của Camera từ ImageElement hoặc URL
   */
  public updateCameraImage(cameraId: number, imageSrc: string): void {
    const vp = this.viewports.get(cameraId);
    if (vp && imageSrc) {
      vp.img.src = imageSrc;
      console.log(`[Camera HUD] updateCameraImage() cam=${cameraId}, src=${imageSrc.substring(0, 60)}...`);
    }
  }

  /**
   * Xóa sạch các nét vẽ trên toàn bộ 8 canvas
   */
  public clearAllCanvases(): void {
    for (const vp of this.viewports.values()) {
      vp.ctx.clearRect(0, 0, vp.canvas.width, vp.canvas.height);
      vp.container.style.borderColor = "#27272a";
      vp.container.style.opacity = "1";
      vp.badge.style.background = "rgba(0, 0, 0, 0.75)";
      vp.badge.style.color = "#f1f5f9";
      vp.badge.innerText = vp.img.alt;
    }
  }

  /**
   * Vẽ khung dây 3D lên camera dùng CHÍNH XÁC engine Day14 overlay (đã chứng minh đúng với VinFast).
   * Pipeline: eulerXYZ → boxCorners → sensor2ego → ego2cam → distort+K → pixel
   */
  public renderBox(box: Box3D): void {
    this.activeBox = box;
    if (!this.isEnabled) return;

    // Dùng Day14 projection nếu có VinFast calibration
    if (storedVinCalib) {
      this.renderBoxDay14(box);
      return;
    }

    // Fallback: dùng projection engine cũ (cho trường hợp không có VinCalib)
    for (const cam of this.activeCameras) {
      const vp = this.viewports.get(cam.id);
      if (!vp) continue;
      vp.ctx.clearRect(0, 0, vp.canvas.width, vp.canvas.height);
      // Không vẽ gì nếu không có calibration
      vp.container.style.borderColor = "#27272a";
      vp.container.style.opacity = "0.35";
      vp.badge.innerText = cam.name + " (No calib)";
    }
  }

  /**
   * Render wireframe dùng chính xác Day14 projection pipeline (port từ d14-projection-overlay.js).
   * Delegate sang hàm dùng chung renderDay14WireframeOnContext() cho mỗi camera.
   */
  private renderBoxDay14(box: Box3D): void {
    if (!storedVinCalib) return;

    for (const cam of this.activeCameras) {
      const vp = this.viewports.get(cam.id);
      if (!vp) continue;

      vp.ctx.clearRect(0, 0, vp.canvas.width, vp.canvas.height);

      // Resolve tên camera mặc định → tên VinCalib thực tế
      const resolvedName = resolveVinCameraName(cam.name);
      if (!resolvedName) {
        vp.container.style.borderColor = "#27272a";
        vp.container.style.opacity = "0.35";
        vp.badge.innerText = cam.name;
        continue;
      }

      const camCalib = storedVinCalib.cameras[resolvedName];

      // Dùng hàm dùng chung để vẽ wireframe
      const isVisible = renderDay14WireframeOnContext(
        vp.ctx, vp.canvas.width, vp.canvas.height, box, cam.name,
      );

      if (!isVisible) {
        vp.container.style.borderColor = "#27272a";
        vp.container.style.boxShadow = "none";
        vp.container.style.opacity = "0.35";
        vp.badge.style.background = "rgba(0, 0, 0, 0.75)";
        vp.badge.style.color = "#94a3b8";
        vp.badge.innerText = cam.name;
        continue;
      }

      // Camera nhìn thấy → highlight (ước lượng coverage)
      const cornersLidar = d14BoxCorners(box.c, box.r, box.s);
      const [W, H] = camCalib.image_size;
      const maxR2 = d14MaxR2(camCalib);
      let inImage = 0;
      for (const p of cornersLidar) {
        const ego = storedVinCalib.pcd_frame === "ego" ? p : d14Transform(p, storedVinCalib.lidar.sensor2ego);
        const pc = d14Transform(ego, camCalib.ego2cam);
        if (pc[2] > NEAR_Z) {
          const xn = pc[0] / pc[2];
          const yn = pc[1] / pc[2];
          if (xn * xn + yn * yn <= maxR2) {
            const [u, v] = d14DistortToPixel(xn, yn, camCalib);
            if (u >= 0 && u < W && v >= 0 && v < H) inImage++;
          }
        }
      }

      const coverage = Math.round(inImage / 8 * 100);
      if (coverage >= 50) {
        vp.container.style.borderColor = "#22c55e";
        vp.container.style.boxShadow = "0 0 10px rgba(34, 197, 94, 0.4)";
        vp.container.style.opacity = "1";
        vp.badge.style.background = "#22c55e";
        vp.badge.style.color = "#000000";
        vp.badge.innerText = `${cam.name} (${coverage}% CHÍNH)`;
      } else {
        vp.container.style.borderColor = "#eab308";
        vp.container.style.boxShadow = "0 0 8px rgba(234, 179, 8, 0.3)";
        vp.container.style.opacity = "1";
        vp.badge.style.background = "#eab308";
        vp.badge.style.color = "#000000";
        vp.badge.innerText = `${cam.name} (${coverage}% MÉP)`;
      }
    }
  }

  /**
   * Cập nhật danh sách cấu hình Camera mới
   */
  public updateCameras(newCameras: CameraConfig[]): void {
    this.activeCameras = newCameras;
    this.buildCameraViewports();
    if (this.activeBox) {
      this.renderBox(this.activeBox);
    }
  }

  /**
   * Ẩn toàn bộ Camera HUD khi tắt Suite
   */
  public hide(): void {
    if (this.container) {
      this.container.style.display = "none";
    }
  }

  /**
   * Hiện lại Camera HUD khi bật Suite
   */
  public show(): void {
    if (this.container) {
      this.container.style.display = "flex";
    }
  }

  /**
   * Kiểm tra xem HUD Camera có đang hiển thị trên màn hình hay không
   */
  public isVisible(): boolean {
    if (!this.container || !this.container.isConnected) return false;
    if (this.container.style.display === "none") return false;
    if (this.isCollapsed) return false;
    return true;
  }

  /**
   * Hủy bỏ HUD khi rời khỏi trang
   */
  public destroy(): void {
    this.container?.remove();
    this.container = null;
    this.viewports.clear();
  }
}
