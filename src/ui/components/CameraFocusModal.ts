/**
 * ==============================================================================
 * CVAT 3D SUITE - CAMERA FOCUS MODAL (HIGH-RES DETAIL VIEWER)
 * ==============================================================================
 * Modal phóng to xem ảnh camera chi tiết:
 * - Hỗ trợ Zoom (con lăn chuột 100% -> 500%) và Pan (kéo chuột di chuyển).
 * - Render khung dây 3D sắc nét theo tỷ lệ phóng to thời gian thực.
 * - Nút chuyển nhanh giữa 8 camera (< Prev / Next >).
 * ==============================================================================
 */

import type { Box3D } from "../../core/geometry.ts";
import type { CameraConfig, ProjectedBox2D } from "../../core/projection.ts";
import { project3DBoxToCamera } from "../../core/projection.ts";
import { getActiveCameras } from "../../core/calibration.ts";
import { ICONS } from "../icons.ts";
import { CameraOverlayManager, getStoredVinCalib, renderDay14WireframeOnContext } from "./CameraOverlay.ts";

export class CameraFocusModal {
  private static instance: CameraFocusModal | null = null;
  private overlay: HTMLDivElement | null = null;
  private currentCameraId: number = 0;
  private activeBox: Box3D | null = null;
  private activeCameras: CameraConfig[] = [];

  // Thuộc tính Zoom & Pan
  private scale: number = 1.0;
  private panX: number = 0;
  private panY: number = 0;
  private isDragging: boolean = false;
  private dragStartX: number = 0;
  private dragStartY: number = 0;

  // Tham chiếu DOM
  private imgEl: HTMLImageElement | null = null;
  private canvasEl: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private titleEl: HTMLSpanElement | null = null;
  private infoBadgeEl: HTMLSpanElement | null = null;
  private transformContainer: HTMLDivElement | null = null;

  private constructor() {
    this.activeCameras = getActiveCameras();
  }

  public static getInstance(): CameraFocusModal {
    if (!CameraFocusModal.instance) {
      CameraFocusModal.instance = new CameraFocusModal();
    }
    return CameraFocusModal.instance;
  }

  /**
   * Mở Focus Modal cho một camera cụ thể
   */
  public open(cameraId: number, box?: Box3D | null, imageSrc?: string): void {
    this.currentCameraId = cameraId;
    if (box) this.activeBox = box;
    this.activeCameras = getActiveCameras();

    // Reset zoom & pan
    this.scale = 1.0;
    this.panX = 0;
    this.panY = 0;

    if (!this.overlay) {
      this.createModalDOM();
    }

    if (this.overlay) {
      this.overlay.style.display = "flex";
    }

    if (imageSrc && this.imgEl) {
      this.imgEl.src = imageSrc;
    }

    this.updateViewport();
  }

  /**
   * Đóng Focus Modal
   */
  public close(): void {
    if (this.overlay) {
      this.overlay.style.display = "none";
    }
  }

  /**
   * Cập nhật Box đang chọn và vẽ lại
   */
  public setBox(box: Box3D | null): void {
    this.activeBox = box;
    this.renderWireframe();
  }

  private createModalDOM(): void {
    this.overlay = document.createElement("div");
    this.overlay.id = "cvat-camera-focus-modal";
    this.overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      z-index: 99999;
      display: none;
      align-items: center;
      justify-content: center;
      user-select: none;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;

    this.overlay.innerHTML = `
      <div style="
        position: relative;
        width: 90vw;
        height: 88vh;
        background: #09090b;
        border: 1px solid #27272a;
        border-radius: 12px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      ">
        <!-- Header -->
        <div style="
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 16px;
          background: #18181b;
          border-bottom: 1px solid #27272a;
          color: #f1f5f9;
        ">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="color: #38bdf8; display: flex;">${ICONS.cameraFocus}</span>
            <span id="cvat-focus-modal-title" style="font-weight: 700; font-size: 14px;">Camera Focus Viewer</span>
            <span id="cvat-focus-modal-badge" style="
              font-size: 11px;
              font-weight: 600;
              padding: 2px 8px;
              border-radius: 9999px;
              background: #27272a;
              color: #a1a1aa;
            ">100% Zoom</span>
          </div>

          <!-- Controls -->
          <div style="display: flex; align-items: center; gap: 8px;">
            <button id="cvat-focus-prev-btn" title="Camera trước" style="
              background: #27272a;
              border: 1px solid #3f3f46;
              color: #f1f5f9;
              border-radius: 6px;
              cursor: pointer;
              padding: 4px 8px;
              display: flex;
              align-items: center;
              font-size: 12px;
            ">${ICONS.chevronLeft} Trước</button>

            <button id="cvat-focus-next-btn" title="Camera tiếp theo" style="
              background: #27272a;
              border: 1px solid #3f3f46;
              color: #f1f5f9;
              border-radius: 6px;
              cursor: pointer;
              padding: 4px 8px;
              display: flex;
              align-items: center;
              font-size: 12px;
            ">Sau ${ICONS.chevronRight}</button>

            <button id="cvat-focus-reset-zoom-btn" title="Đặt lại Zoom (100%)" style="
              background: #27272a;
              border: 1px solid #3f3f46;
              color: #f1f5f9;
              border-radius: 6px;
              cursor: pointer;
              padding: 4px 8px;
              font-size: 12px;
              font-weight: 600;
            ">1:1</button>

            <button id="cvat-focus-close-btn" title="Đóng (Esc)" style="
              background: #ef4444;
              border: none;
              color: #ffffff;
              border-radius: 6px;
              cursor: pointer;
              padding: 5px 8px;
              display: flex;
              align-items: center;
              margin-left: 8px;
            ">${ICONS.close}</button>
          </div>
        </div>

        <!-- Viewport Canvas Area -->
        <div id="cvat-focus-viewport-area" style="
          flex: 1;
          position: relative;
          background: #000000;
          overflow: hidden;
          cursor: grab;
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <div id="cvat-focus-transform-container" style="
            position: absolute;
            transform-origin: center center;
            transition: transform 0.05s linear;
            display: flex;
            align-items: center;
            justify-content: center;
          ">
            <img id="cvat-focus-img" style="
              max-width: 85vw;
              max-height: 78vh;
              object-fit: contain;
              display: block;
              user-select: none;
              pointer-events: none;
            " />
            <canvas id="cvat-focus-canvas" style="
              position: absolute;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              pointer-events: none;
            "></canvas>
          </div>
        </div>

        <!-- Footer Guide -->
        <div style="
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 16px;
          background: #18181b;
          border-top: 1px solid #27272a;
          color: #71717a;
          font-size: 11px;
        ">
          <span>💡 Lăn chuột để Phóng to/Thu nhỏ (Zoom) • Giữ chuột trái kéo để Di chuyển (Pan)</span>
          <span style="display: flex; gap: 12px;">
            <span style="color: #ef4444;">■ Mặt trước</span>
            <span style="color: #3b82f6;">■ Mặt sau</span>
            <span style="color: #22c55e;">■ Sườn trái</span>
            <span style="color: #06b6d4;">■ Sườn phải</span>
            <span style="color: #eab308;">■ Nóc xe</span>
          </span>
        </div>
      </div>
    `;

    document.body.appendChild(this.overlay);

    // Gán tham chiếu
    this.titleEl = this.overlay.querySelector("#cvat-focus-modal-title");
    this.infoBadgeEl = this.overlay.querySelector("#cvat-focus-modal-badge");
    this.imgEl = this.overlay.querySelector("#cvat-focus-img");
    this.canvasEl = this.overlay.querySelector("#cvat-focus-canvas");
    this.transformContainer = this.overlay.querySelector("#cvat-focus-transform-container");
    if (this.canvasEl) {
      this.ctx = this.canvasEl.getContext("2d");
    }

    // Gắn sự kiện đóng
    this.overlay.querySelector("#cvat-focus-close-btn")?.addEventListener("click", () => this.close());
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.overlay?.style.display === "flex") {
        this.close();
      }
    });

    // Chuyển Prev / Next Camera
    this.overlay.querySelector("#cvat-focus-prev-btn")?.addEventListener("click", () => {
      this.currentCameraId = (this.currentCameraId - 1 + this.activeCameras.length) % this.activeCameras.length;
      this.updateViewport();
    });
    this.overlay.querySelector("#cvat-focus-next-btn")?.addEventListener("click", () => {
      this.currentCameraId = (this.currentCameraId + 1) % this.activeCameras.length;
      this.updateViewport();
    });

    // Reset zoom
    this.overlay.querySelector("#cvat-focus-reset-zoom-btn")?.addEventListener("click", () => {
      this.scale = 1.0;
      this.panX = 0;
      this.panY = 0;
      this.applyTransform();
    });

    // Zoom bằng lăn chuột
    const viewArea = this.overlay.querySelector<HTMLDivElement>("#cvat-focus-viewport-area");
    viewArea?.addEventListener("wheel", (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
      this.scale = Math.max(0.5, Math.min(6.0, this.scale * zoomFactor));
      this.applyTransform();
    });

    // Pan bằng kéo chuột
    viewArea?.addEventListener("mousedown", (e) => {
      if (e.button === 0) {
        this.isDragging = true;
        this.dragStartX = e.clientX - this.panX;
        this.dragStartY = e.clientY - this.panY;
        viewArea.style.cursor = "grabbing";
      }
    });
    window.addEventListener("mousemove", (e) => {
      if (this.isDragging) {
        this.panX = e.clientX - this.dragStartX;
        this.panY = e.clientY - this.dragStartY;
        this.applyTransform();
      }
    });
    window.addEventListener("mouseup", () => {
      if (this.isDragging) {
        this.isDragging = false;
        if (viewArea) viewArea.style.cursor = "grab";
      }
    });
  }

  private applyTransform(): void {
    if (this.transformContainer) {
      this.transformContainer.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
    }
    if (this.infoBadgeEl) {
      this.infoBadgeEl.innerText = `${Math.round(this.scale * 100)}% Zoom`;
    }
  }

  private updateViewport(): void {
    const cam = this.activeCameras.find((c) => c.id === this.currentCameraId) || this.activeCameras[0];
    if (!cam) return;

    if (this.titleEl) {
      this.titleEl.innerText = `${cam.name} (Camera #${cam.id}) - ${cam.distortionModel.toUpperCase()}`;
    }

    if (this.canvasEl) {
      this.canvasEl.width = cam.imageWidth || 1920;
      this.canvasEl.height = cam.imageHeight || 1080;
    }

    // Lấy ảnh từ CameraOverlay nếu chưa có (khi chuyển Prev/Next camera)
    if (this.imgEl) {
      const imgSrc = CameraOverlayManager.getInstance().getCameraImageSrc(cam.id);
      if (imgSrc) {
        this.imgEl.src = imgSrc;
      }
    }

    this.applyTransform();
    this.renderWireframe();
  }

  private renderWireframe(): void {
    if (!this.ctx || !this.canvasEl || !this.activeBox) return;

    const cam = this.activeCameras.find((c) => c.id === this.currentCameraId);
    if (!cam) return;

    this.ctx.clearRect(0, 0, this.canvasEl.width, this.canvasEl.height);

    // Ưu tiên Day14 engine nếu có VinFast calibration (projection chính xác)
    const vinCalib = getStoredVinCalib();
    if (vinCalib) {
      // renderDay14WireframeOnContext tự resolve tên camera (CAM_FRONT → CAM_P_F)
      // Set canvas resolution nếu tìm được camera calibration
      const camNames = Object.keys(vinCalib.cameras);
      for (const vinCamName of camNames) {
        const camCalib = vinCalib.cameras[vinCamName];
        if (camCalib && camCalib.image_size) {
          this.canvasEl.width = camCalib.image_size[0];
          this.canvasEl.height = camCalib.image_size[1];
          break;
        }
      }

      const drawn = renderDay14WireframeOnContext(
        this.ctx,
        this.canvasEl.width,
        this.canvasEl.height,
        this.activeBox,
        cam.name,
      );
      if (drawn) return;
    }

    // Fallback: dùng old projection engine (cho trường hợp không có VinCalib)
    const proj: ProjectedBox2D = project3DBoxToCamera(this.activeBox, cam, 12);

    if (proj.isVisible) {
      this.ctx.lineWidth = 3.5;
      this.ctx.lineCap = "round";
      this.ctx.lineJoin = "round";

      for (const edge of proj.edges) {
        if (!edge.isVisible || edge.points.length < 2) continue;

        this.ctx.beginPath();
        this.ctx.strokeStyle = edge.color;

        let isFirst = true;
        for (const pt of edge.points) {
          if (pt.isValid) {
            if (isFirst) {
              this.ctx.moveTo(pt.u, pt.v);
              isFirst = false;
            } else {
              this.ctx.lineTo(pt.u, pt.v);
            }
          }
        }
        this.ctx.stroke();
      }

      // Vẽ 8 đỉnh tròn nổi bật
      this.ctx.fillStyle = "#ffffff";
      for (const c of proj.corners2D) {
        if (c.isValid) {
          this.ctx.beginPath();
          this.ctx.arc(c.u, c.v, 5.0, 0, 2 * Math.PI);
          this.ctx.fill();
          this.ctx.strokeStyle = "#000000";
          this.ctx.lineWidth = 1.5;
          this.ctx.stroke();
        }
      }

      // Vẽ nhãn kích thước L, W, H tại tâm hộp
      if (proj.bbox2D) {
        const [uMin, vMin, uMax] = proj.bbox2D;
        const labelX = (uMin + uMax) / 2;
        const labelY = Math.max(30, vMin - 12);
        const text = `L:${this.activeBox.s[0].toFixed(2)}m W:${this.activeBox.s[1].toFixed(2)}m H:${this.activeBox.s[2].toFixed(2)}m`;

        this.ctx.font = "bold 18px -apple-system, BlinkMacSystemFont, sans-serif";
        const textMetrics = this.ctx.measureText(text);
        const pad = 6;

        this.ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
        this.ctx.fillRect(labelX - textMetrics.width / 2 - pad, labelY - 16, textMetrics.width + 2 * pad, 24);

        this.ctx.fillStyle = "#facc15";
        this.ctx.textAlign = "center";
        this.ctx.fillText(text, labelX, labelY);
      }
    }
  }
}
