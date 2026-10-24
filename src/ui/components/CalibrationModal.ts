/**
 * ==============================================================================
 * CVAT 3D SUITE - CALIBRATION CONFIG MODAL (IMPORT / EXPORT RIG JSON)
 * ==============================================================================
 * Modal quản lý và nạp cấu hình thông số Camera:
 * - Hỗ trợ nhập chuỗi JSON tùy chỉnh theo Task ID.
 * - Kiểm tra dữ liệu nghiêm ngặt (Validate Intrinsics, Extrinsics, Distortion).
 * - Cung cấp nút khôi phục mẫu VinFast ADAS 8 Camera 360°.
 * ==============================================================================
 */

import type { CameraConfig } from "../../core/projection.ts";
import {
  getActiveCameras,
  saveActiveCameras,
  resetCamerasToDefault,
  parseCalibrationJSON,
  DEFAULT_VINFAST_ADAS_CAMERAS,
} from "../../core/calibration.ts";
import { CameraOverlayManager } from "./CameraOverlay.ts";
import { ICONS } from "../icons.ts";

export class CalibrationModal {
  private static instance: CalibrationModal | null = null;
  private overlay: HTMLDivElement | null = null;
  private currentTaskId: number = 0;
  private textareaEl: HTMLTextAreaElement | null = null;
  private statusMsgEl: HTMLDivElement | null = null;

  private constructor() {}

  public static getInstance(): CalibrationModal {
    if (!CalibrationModal.instance) {
      CalibrationModal.instance = new CalibrationModal();
    }
    return CalibrationModal.instance;
  }

  /**
   * Mở Modal cấu hình Calibration
   */
  public open(taskId?: number): void {
    this.currentTaskId = taskId || 0;
    if (!this.overlay) {
      this.createModalDOM();
    }

    if (this.overlay) {
      this.overlay.style.display = "flex";
      this.loadCurrentConfigToTextarea();
      this.setStatus("", "none");
    }
  }

  public close(): void {
    if (this.overlay) {
      this.overlay.style.display = "none";
    }
  }

  private setStatus(msg: string, type: "success" | "error" | "none"): void {
    if (!this.statusMsgEl) return;
    if (type === "none" || !msg) {
      this.statusMsgEl.style.display = "none";
      this.statusMsgEl.innerText = "";
      return;
    }

    this.statusMsgEl.style.display = "block";
    this.statusMsgEl.innerText = msg;
    if (type === "success") {
      this.statusMsgEl.style.background = "#dcfce7";
      this.statusMsgEl.style.color = "#15803d";
      this.statusMsgEl.style.border = "1px solid #86efac";
    } else {
      this.statusMsgEl.style.background = "#fee2e2";
      this.statusMsgEl.style.color = "#b91c1c";
      this.statusMsgEl.style.border = "1px solid #fca5a5";
    }
  }

  private loadCurrentConfigToTextarea(): void {
    const cams = getActiveCameras(this.currentTaskId);
    if (this.textareaEl) {
      this.textareaEl.value = JSON.stringify(cams, null, 2);
    }
  }

  private createModalDOM(): void {
    this.overlay = document.createElement("div");
    this.overlay.id = "cvat-calibration-modal";
    this.overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      z-index: 99999;
      display: none;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;

    this.overlay.innerHTML = `
      <div style="
        width: 680px;
        max-width: 95vw;
        background: #ffffff;
        border-radius: 12px;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border: 1px solid #e4e4e7;
      ">
        <!-- Header -->
        <div style="
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 18px;
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
        ">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="color: #0284c7; display: flex;">${ICONS.settings}</span>
            <span style="font-weight: 700; font-size: 15px; color: #0f172a;">Cấu Hình Camera Calibration (8 Camera)</span>
          </div>
          <button id="cvat-calib-close-btn" style="
            background: transparent;
            border: none;
            cursor: pointer;
            color: #64748b;
            display: flex;
            padding: 4px;
          ">${ICONS.close}</button>
        </div>

        <!-- Body -->
        <div style="padding: 16px; display: flex; flex-direction: column; gap: 12px;">
          <div style="font-size: 12px; color: #64748b; line-height: 1.5;">
            Dán chuỗi cấu hình JSON chứa thông số của 8 Camera (Nội tại <code>intrinsics</code>, Ngoại tại <code>extrinsics</code>, và Mô hình méo hình <code>distortionModel: radtan / fisheye</code>).
          </div>

          <div id="cvat-calib-status-msg" style="
            display: none;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
          "></div>

          <textarea id="cvat-calib-textarea" rows="14" style="
            width: 100%;
            box-sizing: border-box;
            font-family: Menlo, Monaco, Consolas, 'Courier New', monospace;
            font-size: 11px;
            padding: 10px;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            background: #f8fafc;
            color: #0f172a;
            resize: vertical;
            outline: none;
          "></textarea>

          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 4px;">
            <button id="cvat-calib-reset-btn" style="
              background: #f1f5f9;
              border: 1px solid #cbd5e1;
              color: #475569;
              padding: 6px 12px;
              border-radius: 6px;
              font-size: 12px;
              font-weight: 600;
              cursor: pointer;
            ">Mẫu VinFast ADAS (8 Cams)</button>

            <div style="display: flex; align-items: center; gap: 8px;">
              <button id="cvat-calib-cancel-btn" style="
                background: #f1f5f9;
                border: 1px solid #cbd5e1;
                color: #475569;
                padding: 6px 14px;
                border-radius: 6px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
              ">Hủy bỏ</button>

              <button id="cvat-calib-save-btn" style="
                background: #0284c7;
                border: none;
                color: #ffffff;
                padding: 6px 16px;
                border-radius: 6px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
              ">Lưu Cấu Hình</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(this.overlay);

    this.textareaEl = this.overlay.querySelector("#cvat-calib-textarea");
    this.statusMsgEl = this.overlay.querySelector("#cvat-calib-status-msg");

    this.overlay.querySelector("#cvat-calib-close-btn")?.addEventListener("click", () => this.close());
    this.overlay.querySelector("#cvat-calib-cancel-btn")?.addEventListener("click", () => this.close());

    // Nút Lưu Cấu Hình
    this.overlay.querySelector("#cvat-calib-save-btn")?.addEventListener("click", () => {
      const rawText = this.textareaEl?.value.trim() || "";
      const { configs, error } = parseCalibrationJSON(rawText);

      if (error || configs.length === 0) {
        this.setStatus(`❌ ${error || "Dữ liệu không hợp lệ"}`, "error");
        return;
      }

      saveActiveCameras(configs, this.currentTaskId);
      CameraOverlayManager.getInstance().updateCameras(configs);
      this.setStatus(`✅ Đã lưu thành công cấu hình ${configs.length} Camera!`, "success");

      setTimeout(() => this.close(), 1200);
    });

    // Nút Khôi phục mẫu VinFast ADAS
    this.overlay.querySelector("#cvat-calib-reset-btn")?.addEventListener("click", () => {
      const def = resetCamerasToDefault(this.currentTaskId);
      if (this.textareaEl) {
        this.textareaEl.value = JSON.stringify(def, null, 2);
      }
      CameraOverlayManager.getInstance().updateCameras(def);
      this.setStatus("✅ Đã khôi phục cấu hình mẫu VinFast ADAS 8 Camera!", "success");
    });
  }
}
