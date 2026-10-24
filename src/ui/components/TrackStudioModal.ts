import { CVATContext } from "../../core/types";
import { CVATBridge, FrameTrackItem } from "../../cvat/bridge";
import { JobAnnotationStore, TrackState, TrackData } from "../../core/track_store";
import {
  Box3D,
  pointsToBox,
  boxToPoints,
  resizeKeepBottom,
  cloneBox,
  rotateLocal,
  computeGroundSlopesAndZ,
  fitBoxToEgoRayAndGround,
} from "../../core/geometry";
import { ICONS } from "../icons";
import { OrthoEditorPanel, FrameColumnData } from "./OrthoEditorPanel";
import { TrackPointManager } from "../../core/track_point_manager";

export type StudioTab = "batch_all" | "active_track";

function float32ToVec3Array(arr: Float32Array): Array<{ x: number; y: number; z: number }> {
  const count = Math.floor(arr.length / 3);
  const res: Array<{ x: number; y: number; z: number }> = [];
  for (let i = 0; i < count; i++) {
    res.push({ x: arr[i * 3], y: arr[i * 3 + 1], z: arr[i * 3 + 2] });
  }
  return res;
}

/**
 * Giao diện Active Track Retime Studio (Full-Screen Orthographic Studio):
 * - Tái hiện 100% trình edit trực quan của CVAT 3D với 3 góc chiếu 2D trực giao (TOP, SIDE, FRONT).
 * - Hiển thị đám mây điểm LiDAR xung quanh xe tại từng frame hoặc gộp toàn bộ các frame (Show All Point Cloud).
 * - Cơ chế Tải Toàn Bộ Curpoint: Tự động duyệt qua toàn bộ dải frame của Track ID để gom mây điểm đa frame dày đặc.
 * - Thanh Timeline Filmstrip hiển thị đầy đủ tất cả các frame từ đầu tới cuối của chiếc xe.
 * - Tương tác chuột trực tiếp: kéo thân Move, kéo 4 góc + 4 cạnh Resize, kéo chấm vàng xoay góc Yaw.
 * - Two-Way Live Sync tức thì sang WebGL Canvas của CVAT (Realtime 60fps).
 * - Bộ nút Auto-Fit TOP, SIDE, FRONT, Ghim Đất, Lật 180° chuẩn GEMINI.md.
 * - TUYỆT ĐỐI KHÔNG AUTOSAVE NGẦM: Chỉ lưu chính thức khi người dùng bấm nút [Lưu vào CVAT] hoặc Ctrl+S.
 */
export class TrackStudioModal {
  private overlay: HTMLDivElement | null = null;
  private currentCtx: CVATContext | null = null;
  private currentTab: StudioTab = "active_track";
  private activeTrackId: number = 0;
  private store: JobAnnotationStore | null = null;
  private allJobTracks: FrameTrackItem[] = [];
  private selectedFrame: number = 0;
  private isSaving: boolean = false;

  // Thành phần 3D Ortho Editor và Mây Điểm
  private orthoEditor: OrthoEditorPanel | null = null;
  private pointManager: TrackPointManager = new TrackPointManager();
  private showAllPoints: boolean = false;
  private applyToAllFrames: boolean = false;
  private isPlaying: boolean = false;
  private playInterval: any = null;

  constructor() {
    this.createOverlay();
    this.attachGlobalHotkeys();
  }

  public async open(
    ctx: CVATContext,
    activeTrackId: number,
    _activeServerId?: number,
    allJobTracks: FrameTrackItem[] = []
  ): Promise<void> {
    this.currentCtx = ctx;
    this.activeTrackId = activeTrackId;
    this.allJobTracks = allJobTracks;
    this.selectedFrame = CVATBridge.getCurrentFrame();
    this.currentTab = "active_track";
    this.pointManager.setActiveTrack(activeTrackId);

    if (this.overlay) {
      this.overlay.style.display = "flex";
    }

    await this.loadInitialData();
  }

  public close(): void {
    this.stopPlayback();
    this.pointManager.abortScan();
    if (this.orthoEditor) {
      this.orthoEditor.unmount();
      this.orthoEditor = null;
    }
    if (this.overlay) {
      this.overlay.style.display = "none";
    }
  }

  public isOpen(): boolean {
    return !!(this.overlay && this.overlay.style.display !== "none");
  }

  private createOverlay(): void {
    if (document.getElementById("cvat-3d-track-studio-modal")) return;

    this.overlay = document.createElement("div");
    this.overlay.id = "cvat-3d-track-studio-modal";
    this.overlay.setAttribute("translate", "no");
    this.overlay.classList.add("notranslate");
    this.overlay.style.position = "fixed";
    this.overlay.style.inset = "0";
    this.overlay.style.zIndex = "999999";
    this.overlay.style.background = "#ffffff";
    this.overlay.style.color = "#09090b";
    this.overlay.style.display = "none";
    this.overlay.style.flexDirection = "column";
    this.overlay.style.fontFamily =
      "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    this.overlay.style.userSelect = "none";

    document.body.appendChild(this.overlay);
  }

  private attachGlobalHotkeys(): void {
    window.addEventListener(
      "keydown",
      (e: KeyboardEvent) => {
        if (!this.isOpen()) return;

        // Escape: Đóng modal
        if (e.key === "Escape") {
          e.preventDefault();
          this.close();
          return;
        }

        // Ctrl+S / Cmd+S: Lưu vào CVAT
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          this.triggerCommitSave();
          return;
        }

        // Ctrl+Z: Undo in-memory
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
          e.preventDefault();
          this.triggerUndo();
          return;
        }

        // Ctrl+Y / Ctrl+Shift+Z: Redo in-memory
        if (
          ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") ||
          ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z")
        ) {
          e.preventDefault();
          this.triggerRedo();
          return;
        }

        const target = e.target as HTMLElement;
        if (target && (target.tagName === "INPUT" || target.tagName === "SELECT")) return;

        // Space: Play / Pause dải frame
        if (e.code === "Space" && this.currentTab === "active_track") {
          e.preventDefault();
          this.togglePlayback();
          return;
        }

        // Phím Mũi tên Trái hoặc A: Frame trước
        if ((e.key === "ArrowLeft" || e.key.toLowerCase() === "a") && this.currentTab === "active_track") {
          e.preventDefault();
          this.stepFrame(-1);
          return;
        }

        // Phím Mũi tên Phải hoặc D: Frame sau
        if ((e.key === "ArrowRight" || e.key.toLowerCase() === "d") && this.currentTab === "active_track") {
          e.preventDefault();
          this.stepFrame(1);
          return;
        }

        // Phím O: Toggle outside tại frame đang chọn
        if (e.key.toLowerCase() === "o" && this.currentTab === "active_track") {
          e.preventDefault();
          this.toggleOutsideFrame(this.selectedFrame);
          return;
        }

        // Phím [ : Chuyển sang xe trước
        if (e.key === "[" && this.currentTab === "active_track") {
          e.preventDefault();
          this.switchPrevTrack();
          return;
        }

        // Phím ] : Chuyển sang xe tiếp theo
        if (e.key === "]" && this.currentTab === "active_track") {
          e.preventDefault();
          this.switchNextTrack();
          return;
        }
      },
      true
    );
  }

  /**
   * Tải toàn bộ dữ liệu Job từ Bridge vào in-memory store
   */
  private async loadInitialData(): Promise<void> {
    if (!this.currentCtx?.jobId) return;

    this.renderLoading();
    try {
      const tracksData: TrackData[] = await CVATBridge.getAllJobTracksWithShapes(
        this.currentCtx.jobId
      );

      this.store = new JobAnnotationStore(this.currentCtx.jobId);
      this.store.setTracks(tracksData);

      // Nếu không có track từ Bridge, tạo fallback từ allJobTracks
      if (this.store.getAllTracks().length === 0 && this.allJobTracks.length > 0) {
        const fallbackList: TrackData[] = this.allJobTracks.map((t) => ({
          id: t.uiId,
          clientID: t.uiId,
          serverID: t.serverId,
          labelId: 1,
          labelName: t.label,
          labelColor: "#38bdf8",
          shapes: [
            {
              type: "cuboid",
              frame: CVATBridge.getCurrentFrame(),
              points: [t.x, t.y, t.z, 0, 0, (t.yawDeg * Math.PI) / 180, t.l, t.w, t.h, 0, 0, 0, 0, 0, 0, 0],
              outside: false,
            },
          ],
        }));
        this.store.setTracks(fallbackList);
      }

      this.render();
      if (this.currentTab === "active_track") {
        this.updateOrthoEditorState(track);
    await this.preloadPointsForVisibleFrames(track);
      }
    } catch (err: any) {
      if (this.overlay) {
        this.overlay.innerHTML = `
          <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; color: #ef4444;">
            <h3 style="margin: 0; font-size: 16px;">Không thể tải dữ liệu: ${err.message || err}</h3>
            <button id="btn-close-error" style="background: #27272a; color: white; border: 1px solid rgba(255,255,255,0.1); padding: 8px 16px; border-radius: 6px; cursor: pointer;">Đóng</button>
          </div>
        `;
        this.overlay.querySelector("#btn-close-error")?.addEventListener("click", () => this.close());
      }
    }
  }

  private renderLoading(): void {
    if (!this.overlay) return;
    this.overlay.innerHTML = `
      <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; background: #ffffff;">
        <div style="width: 36px; height: 36px; border: 3px solid #e2e8f0; border-top-color: #0284c7; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
        <span style="font-size: 13px; color: #64748b; font-family: monospace;">Đang đồng bộ dữ liệu xe từ Three.js CVAT native...</span>
      </div>
      <style>
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      </style>
    `;
  }

  private render(): void {
    if (!this.overlay || !this.currentCtx || !this.store) return;

    const allTracks: TrackState[] = this.store.getAllTracks();
    const activeTrack: TrackState | undefined =
      this.store.getTrack(this.activeTrackId) || allTracks[0];
    const dirtyCount = this.store.getDirtyTracks().length;

    this.overlay.innerHTML = `
      <!-- 1. HEADER BAR CHUYÊN NGHIỆP -->
      <div style="
        background: #ffffff;
        border-bottom: 1px solid #e2e8f0;
        padding: 8px 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 48px;
        box-sizing: border-box;
      ">
        <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
          <!-- Badge Studio -->
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="background: #2563eb; color: white; padding: 3px 8px; border-radius: 5px; font-size: 11px; font-weight: bold; letter-spacing: 0.5px;">ORTHO 3D STUDIO</span>
            <span style="font-size: 13px; font-weight: bold; color: #09090b;">Job #${this.currentCtx.jobId}</span>
          </div>

          <!-- Tab Switcher -->
          <div style="display: flex; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 6px; padding: 2px;">
            <button id="studio-tab-active" style="
              border: none;
              background: ${this.currentTab === "active_track" ? "#ffffff" : "transparent"};
              color: ${this.currentTab === "active_track" ? "#09090b" : "#64748b"};
              box-shadow: ${this.currentTab === "active_track" ? "0 1px 3px rgba(0,0,0,0.08)" : "none"};
              padding: 4px 12px;
              font-size: 11px;
              font-weight: 600;
              cursor: pointer;
              border-radius: 4px;
              transition: all 0.15s;
            ">Duyệt Track (Xe #${this.activeTrackId})</button>

            <button id="studio-tab-batch" style="
              border: none;
              background: ${this.currentTab === "batch_all" ? "#ffffff" : "transparent"};
              color: ${this.currentTab === "batch_all" ? "#09090b" : "#64748b"};
              box-shadow: ${this.currentTab === "batch_all" ? "0 1px 3px rgba(0,0,0,0.08)" : "none"};
              padding: 4px 12px;
              font-size: 11px;
              font-weight: 600;
              cursor: pointer;
              border-radius: 4px;
              transition: all 0.15s;
            ">Tất Cả Track ID (${allTracks.length})</button>
          </div>

          <!-- Quick Track Selector Dropdown -->
          <div style="display: flex; align-items: center; gap: 4px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 2px 6px;">
            <span style="font-size: 11px; color: #64748b; font-weight: 600;">Track:</span>
            <select id="studio-quick-track-select" style="
              background: transparent;
              border: none;
              color: #0284c7;
              font-size: 11px;
              font-weight: bold;
              cursor: pointer;
              outline: none;
              padding: 2px 4px;
              max-width: 180px;
            ">
              ${allTracks
                .map(
                  (t) => `
                <option value="${t.uiId}" ${t.uiId === this.activeTrackId ? "selected" : ""} style="background: #ffffff; color: #09090b;">
                  #${t.uiId} · ${t.labelName} (${t.shapes.length}f)
                </option>
              `
                )
                .join("")}
            </select>
            <button id="btn-quick-prev-track" title="Xe trước (phím [)" style="
              background: #ffffff; border: 1px solid #cbd5e1; color: #334155; font-size: 10px; padding: 2px 6px; border-radius: 4px; cursor: pointer;
            ">◀</button>
            <button id="btn-quick-next-track" title="Xe sau (phím ])" style="
              background: #ffffff; border: 1px solid #cbd5e1; color: #334155; font-size: 10px; padding: 2px 6px; border-radius: 4px; cursor: pointer;
            ">▶</button>
          </div>

          <!-- Undo / Redo Buttons -->
          <div style="display: flex; align-items: center; gap: 3px;">
            <button id="btn-studio-undo" title="Hoàn tác (Ctrl+Z)" style="
              background: #f8fafc; border: 1px solid #cbd5e1; color: #334155; font-size: 11px; padding: 3px 8px; border-radius: 4px; cursor: pointer;
            ">↶ Undo</button>
            <button id="btn-studio-redo" title="Làm lại (Ctrl+Y)" style="
              background: #f8fafc; border: 1px solid #cbd5e1; color: #334155; font-size: 11px; padding: 3px 8px; border-radius: 4px; cursor: pointer;
            ">↷ Redo</button>
          </div>
        </div>

        <!-- Right Action Controls -->
        <div style="display: flex; align-items: center; gap: 8px;">
          <!-- Nút Lưu vào CVAT -->
          <button id="btn-studio-commit-save" style="
            background: ${dirtyCount > 0 ? "#ea580c" : "#059669"};
            border: 1px solid ${dirtyCount > 0 ? "#ea580c" : "#059669"};
            color: white;
            font-size: 11px;
            font-weight: 600;
            padding: 5px 14px;
            border-radius: 5px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 5px;
            box-shadow: 0 1px 4px ${dirtyCount > 0 ? "rgba(234, 88, 12, 0.2)" : "rgba(5, 150, 105, 0.2)"};
            transition: all 0.2s;
          ">
            <span style="display: flex; align-items: center;">${ICONS.save}</span>
            <span>${this.isSaving ? "Đang lưu..." : dirtyCount > 0 ? `Lưu vào CVAT (${dirtyCount} track)` : "Lưu vào CVAT"}</span>
            <span style="font-size: 9px; opacity: 0.85; font-family: monospace;">(Ctrl+S)</span>
          </button>

          <!-- Nút Đóng -->
          <button id="btn-studio-close" style="
            background: #f1f5f9;
            border: 1px solid #e2e8f0;
            color: #334155;
            font-size: 11px;
            font-weight: 600;
            padding: 5px 10px;
            border-radius: 5px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 4px;
          ">
            <span style="display: flex; align-items: center;">${ICONS.close}</span>
            <span>Đóng (Esc)</span>
          </button>
        </div>
      </div>

      <!-- 2. NỘI DUNG CHÍNH (TAB 1 HOẶC TAB 2) -->
      <div id="studio-main-content-area" style="flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden;">
        ${this.currentTab === "active_track" ? this.renderActiveTrackHtml(activeTrack) : this.renderBatchAllHtml(allTracks)}
      </div>
    `;

    this.attachHeaderListeners();
    if (this.currentTab === "active_track") {
      this.attachActiveTrackListeners(activeTrack);
      this.mountOrthoEditor(activeTrack);
    } else {
      this.attachBatchAllListeners();
    }
  }

  // =========================================================================
  // TAB 2: ACTIVE TRACK ORTHOGRAPHIC STUDIO (TOP / SIDE / FRONT)
  // =========================================================================

  private renderActiveTrackHtml(track: TrackState | undefined): string {
    if (!track) {
      return `
        <div style="flex: 1; display: flex; align-items: center; justify-content: center; color: #71717a;">
          Chưa chọn xe nào để duyệt. Vui lòng chuyển sang tab danh sách xe.
        </div>
      `;
    }

    const pos = track.at(this.selectedFrame);
    const box = pos ? pos.box : { c: [0, 0, 0], s: [4, 1.8, 1.5], r: [0, 0, 0] };
    const yawDeg = Math.round((box.r[2] * 180) / Math.PI);

    const sortedShapes = [...track.shapes].sort((a, b) => a.frame - b.frame);
    const firstF = sortedShapes.length > 0 ? sortedShapes[0].frame : 0;
    const lastF = sortedShapes.length > 0 ? sortedShapes[sortedShapes.length - 1].frame : 0;

    // Danh sách các thẻ frame trong filmstrip
    const filmstripCardsHtml = sortedShapes
      .map((sh) => {
        const f = sh.frame;
        const isSel = f === this.selectedFrame;
        const pts = sh.points;
        const l = (pts[6] || 0).toFixed(2);
        const w = (pts[7] || 0).toFixed(2);
        const h = (pts[8] || 0).toFixed(2);

        return `
          <div class="filmstrip-card ${isSel ? "active" : ""}" data-frame="${f}" style="
            display: inline-flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: ${isSel ? "#eff6ff" : sh.outside ? "#f8fafc" : "#ffffff"};
            border: 1.5px solid ${isSel ? "#2563eb" : sh.outside ? "#e2e8f0" : "#cbd5e1"};
            border-radius: 6px;
            padding: 4px 8px;
            min-width: 68px;
            cursor: pointer;
            transition: all 0.12s;
            box-shadow: ${isSel ? "0 2px 6px rgba(37, 99, 235, 0.2)" : "none"};
          ">
            <div style="display: flex; align-items: center; gap: 4px; width: 100%; justify-content: space-between;">
              <span style="font-size: 11px; font-weight: bold; font-family: monospace; color: ${isSel ? "#1d4ed8" : "#0f172a"};">#${f}</span>
              <span style="
                font-size: 9px;
                font-weight: bold;
                padding: 1px 4px;
                border-radius: 3px;
                background: ${sh.outside ? "#fee2e2" : "#ecfdf5"};
                color: ${sh.outside ? "#dc2626" : "#059669"};
              ">${sh.outside ? "OUT" : "KF"}</span>
            </div>
            <span style="font-size: 10px; color: #64748b; font-family: monospace; margin-top: 2px;">${l}×${w}×${h}</span>
          </div>
        `;
      })
      .join("");

    return `
      <div style="flex: 1; min-height: 0; display: flex; flex-direction: column; background: #f8fafc;">
        <!-- KHU VỰC TRÊN: 3 ORTHO VIEWS (75%) + SIDEBAR ĐIỀU KHIỂN & VI CHỈNH (25%) -->
        <div style="flex: 1; min-height: 0; display: flex; gap: 8px; padding: 8px;">
          <!-- Khung chứa 3 Canvas Trực Giao TOP / SIDE / FRONT -->
          <div id="ortho-canvas-mount-point" style="flex: 1; min-width: 0; min-height: 0; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.06);"></div>

          <!-- Sidebar Điều Khiển Nhanh & Vi Chỉnh Số Liệu -->
          <div style="
            width: 280px;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 10px;
            display: flex;
            flex-direction: column;
            gap: 10px;
            overflow-y: auto;
            box-sizing: border-box;
          ">
            <!-- Thông tin Track & Frame Hiện Tại -->
            <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="width: 8px; height: 8px; border-radius: 50%; background: ${track.labelColor};"></span>
                <span style="font-size: 13px; font-weight: bold; color: #09090b;">${track.labelName} #${track.uiId}</span>
              </div>
              <span style="font-size: 12px; font-weight: bold; font-family: monospace; color: #2563eb; background: #eff6ff; padding: 2px 6px; border-radius: 4px;">Frame #${this.selectedFrame}</span>
            </div>

            <!-- Tọa độ Tâm X, Y, Z -->
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px;">
              <span style="font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase;">Tọa Độ Tâm (Center)</span>
              <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; margin-top: 4px;">
                <div>
                  <span style="font-size: 10px; color: #64748b;">X (dọc)</span>
                  <input id="input-center-x" type="number" step="0.01" value="${box.c[0].toFixed(2)}" style="width: 100%; font-size: 11px; padding: 3px; font-family: monospace; border: 1px solid #cbd5e1; border-radius: 4px; text-align: center; box-sizing: border-box;" />
                </div>
                <div>
                  <span style="font-size: 10px; color: #64748b;">Y (ngang)</span>
                  <input id="input-center-y" type="number" step="0.01" value="${box.c[1].toFixed(2)}" style="width: 100%; font-size: 11px; padding: 3px; font-family: monospace; border: 1px solid #cbd5e1; border-radius: 4px; text-align: center; box-sizing: border-box;" />
                </div>
                <div>
                  <span style="font-size: 10px; color: #64748b;">Z (cao)</span>
                  <input id="input-center-z" type="number" step="0.01" value="${box.c[2].toFixed(2)}" style="width: 100%; font-size: 11px; padding: 3px; font-family: monospace; border: 1px solid #cbd5e1; border-radius: 4px; text-align: center; box-sizing: border-box;" />
                </div>
              </div>

              <!-- Nút Stepper vi chỉnh nhanh X/Y/Z -->
              <div style="display: flex; gap: 4px; margin-top: 6px; justify-content: space-between;">
                <button class="btn-step-move" data-axis="x" data-val="-0.02" style="font-size: 10px; padding: 2px 4px; background: white; border: 1px solid #cbd5e1; border-radius: 3px; cursor: pointer;">-2cm X</button>
                <button class="btn-step-move" data-axis="x" data-val="0.02" style="font-size: 10px; padding: 2px 4px; background: white; border: 1px solid #cbd5e1; border-radius: 3px; cursor: pointer;">+2cm X</button>
                <button class="btn-step-move" data-axis="y" data-val="-0.02" style="font-size: 10px; padding: 2px 4px; background: white; border: 1px solid #cbd5e1; border-radius: 3px; cursor: pointer;">-2cm Y</button>
                <button class="btn-step-move" data-axis="y" data-val="0.02" style="font-size: 10px; padding: 2px 4px; background: white; border: 1px solid #cbd5e1; border-radius: 3px; cursor: pointer;">+2cm Y</button>
              </div>
            </div>

            <!-- Kích thước L, W, H & Góc Yaw -->
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px;">
              <span style="font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase;">Kích Thước & Hướng</span>
              <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin-top: 4px;">
                <div>
                  <span style="font-size: 10px; color: #64748b;">Dài L</span>
                  <input id="input-dim-l" type="number" step="0.02" value="${box.s[0].toFixed(2)}" style="width: 100%; font-size: 11px; padding: 3px; font-family: monospace; border: 1px solid #cbd5e1; border-radius: 4px; text-align: center; box-sizing: border-box;" />
                </div>
                <div>
                  <span style="font-size: 10px; color: #64748b;">Rộng W</span>
                  <input id="input-dim-w" type="number" step="0.02" value="${box.s[1].toFixed(2)}" style="width: 100%; font-size: 11px; padding: 3px; font-family: monospace; border: 1px solid #cbd5e1; border-radius: 4px; text-align: center; box-sizing: border-box;" />
                </div>
                <div>
                  <span style="font-size: 10px; color: #64748b;">Cao H</span>
                  <input id="input-dim-h" type="number" step="0.02" value="${box.s[2].toFixed(2)}" title="Ground-Lock nở lên trên" style="width: 100%; font-size: 11px; padding: 3px; font-family: monospace; border: 1px solid #cbd5e1; border-radius: 4px; text-align: center; box-sizing: border-box;" />
                </div>
                <div>
                  <span style="font-size: 10px; color: #64748b;">Yaw°</span>
                  <input id="input-dim-yaw" type="number" step="1" value="${yawDeg}" style="width: 100%; font-size: 11px; padding: 3px; font-family: monospace; border: 1px solid #cbd5e1; border-radius: 4px; text-align: center; box-sizing: border-box;" />
                </div>
              </div>

              <!-- Checkbox Áp dụng cho Toàn Track -->
              <div style="margin-top: 8px; display: flex; align-items: center; gap: 6px;">
                <input id="chk-apply-all-frames" type="checkbox" ${this.applyToAllFrames ? "checked" : ""} style="cursor: pointer;" />
                <label for="chk-apply-all-frames" style="font-size: 11px; font-weight: 600; color: #0f172a; cursor: pointer;">Áp dụng cho Toàn Track</label>
              </div>
            </div>

            <!-- Bộ Nút Auto-Fit Nhanh (GEMINI.md Standard) -->
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <span style="font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase;">Căn Chỉnh Nhanh (Auto-Fit)</span>
              <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px;">
                <button id="btn-fit-top" title="Căn góc xoay Yaw ôm viền đón tia" style="background: #f0fdf4; border: 1px solid #bbf7d0; color: #15803d; font-size: 11px; font-weight: bold; padding: 5px; border-radius: 4px; cursor: pointer;">TOP</button>
                <button id="btn-fit-side" title="Căn cản trước/sau trục X (giữ nguyên Z)" style="background: #f0fdf4; border: 1px solid #bbf7d0; color: #15803d; font-size: 11px; font-weight: bold; padding: 5px; border-radius: 4px; cursor: pointer;">SIDE</button>
                <button id="btn-fit-front" title="Áp sát sườn đón tia laser trục Y (giữ nguyên Z)" style="background: #f0fdf4; border: 1px solid #bbf7d0; color: #15803d; font-size: 11px; font-weight: bold; padding: 5px; border-radius: 4px; cursor: pointer;">FRONT</button>
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-top: 2px;">
                <button id="btn-fit-ground" title="Ghim đáy xe bám sát mặt đất (Ground-Lock)" style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; font-size: 11px; font-weight: 600; padding: 5px; border-radius: 4px; cursor: pointer;">⇩ Ghim Đất</button>
                <button id="btn-fit-flip-180" title="Lật ngược đầu xe 180°" style="background: #fffbeb; border: 1px solid #fde68a; color: #b45309; font-size: 11px; font-weight: 600; padding: 5px; border-radius: 4px; cursor: pointer;">🔄 Lật 180°</button>
              </div>
            </div>

            <!-- Nút Toggle Outside tại Frame hiện tại -->
            <button id="btn-toggle-outside-cur" style="
              background: ${pos?.outside ? "#fee2e2" : "#f1f5f9"};
              border: 1px solid ${pos?.outside ? "#fca5a5" : "#cbd5e1"};
              color: ${pos?.outside ? "#dc2626" : "#334155"};
              font-size: 11px;
              font-weight: 600;
              padding: 6px;
              border-radius: 4px;
              cursor: pointer;
              margin-top: auto;
            ">${pos?.outside ? "Đang Ẩn (Outside) - Bấm để Hiện" : "Đang Hiện - Bấm để Ẩn (Phím O)"}</button>
          </div>
        </div>

        <!-- KHU VỰC DƯỚI: TIMELINE CONTROLS & DẢI PHIM FILMSTRIP TOÀN BỘ CÁC FRAME -->
        <div style="
          background: #ffffff;
          border-top: 1px solid #e2e8f0;
          padding: 8px 12px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        ">
          <!-- Hàng 1: Bộ điều khiển Timeline & Mây điểm -->
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
            <!-- Bộ điều khiển phát & chuyển frame -->
            <div style="display: flex; align-items: center; gap: 4px;">
              <button id="btn-timeline-prev5" title="Lùi 5 frames" style="background: #f1f5f9; border: 1px solid #cbd5e1; color: #334155; font-size: 11px; padding: 4px 6px; border-radius: 4px; cursor: pointer;">◀◀ -5f</button>
              <button id="btn-timeline-prev" title="Frame trước (phím A hoặc ◀)" style="background: #f1f5f9; border: 1px solid #cbd5e1; color: #334155; font-size: 11px; padding: 4px 8px; border-radius: 4px; cursor: pointer;">◀ Prev</button>
              <button id="btn-timeline-play" title="Phát lướt tự động (Space)" style="background: #2563eb; border: none; color: white; font-size: 11px; font-weight: bold; padding: 4px 10px; border-radius: 4px; cursor: pointer;">${this.isPlaying ? "❚❚ Pause" : "▶ Play"}</button>
              <button id="btn-timeline-next" title="Frame sau (phím D hoặc ▶)" style="background: #f1f5f9; border: 1px solid #cbd5e1; color: #334155; font-size: 11px; padding: 4px 8px; border-radius: 4px; cursor: pointer;">Next ▶</button>
              <button id="btn-timeline-next5" title="Tiến 5 frames" style="background: #f1f5f9; border: 1px solid #cbd5e1; color: #334155; font-size: 11px; padding: 4px 6px; border-radius: 4px; cursor: pointer;">+5f ▶▶</button>

              <!-- Slider kéo nhanh frame -->
              <div style="display: flex; align-items: center; gap: 6px; margin-left: 8px;">
                <span style="font-size: 11px; color: #64748b; font-family: monospace;">f#${firstF}</span>
                <input id="timeline-slider" type="range" min="${firstF}" max="${lastF}" value="${this.selectedFrame}" style="width: 180px; cursor: pointer;" />
                <span style="font-size: 11px; color: #64748b; font-family: monospace;">f#${lastF}</span>
              </div>
            </div>

            <!-- Tải Toàn Bộ Curpoint & Show All Point Cloud -->
            <div style="display: flex; align-items: center; gap: 8px;">
              <!-- Nút Tải Toàn Bộ Curpoint -->
              <button id="btn-scan-all-curpoints" style="
                background: ${this.pointManager.isScanActive ? "#ea580c" : "#0284c7"};
                border: 1px solid ${this.pointManager.isScanActive ? "#ea580c" : "#0284c7"};
                color: white;
                font-size: 11px;
                font-weight: 600;
                padding: 4px 10px;
                border-radius: 5px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 5px;
                transition: all 0.15s;
              ">
                <span>📥</span>
                <span id="lbl-scan-progress">${this.pointManager.isScanActive ? "Đang quét..." : "Tải Toàn Bộ Curpoint"}</span>
              </button>

              <!-- Toggle Xem Mây Điểm: Frame Này vs Gộp Toàn Track -->
              <div style="display: flex; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; padding: 2px;">
                <button id="btn-point-mode-single" style="
                  border: none;
                  background: ${!this.showAllPoints ? "#ffffff" : "transparent"};
                  color: ${!this.showAllPoints ? "#0284c7" : "#64748b"};
                  font-weight: ${!this.showAllPoints ? "bold" : "normal"};
                  padding: 3px 8px;
                  font-size: 10px;
                  border-radius: 4px;
                  cursor: pointer;
                ">Frame Này</button>

                <button id="btn-point-mode-all" style="
                  border: none;
                  background: ${this.showAllPoints ? "#059669" : "transparent"};
                  color: ${this.showAllPoints ? "white" : "#64748b"};
                  font-weight: ${this.showAllPoints ? "bold" : "normal"};
                  padding: 3px 8px;
                  font-size: 10px;
                  border-radius: 4px;
                  cursor: pointer;
                ">Show All Point Cloud (${this.pointManager.loadedFramesCount}f)</button>
              </div>
            </div>
          </div>

          <!-- Hàng 2: Dải phim cuộn ngang Filmstrip (Hiển thị tất cả các frame của ID đó) -->
          <div id="filmstrip-scroll-container" style="
            display: flex;
            gap: 6px;
            overflow-x: auto;
            padding: 4px 2px;
            scroll-behavior: smooth;
          ">
            ${filmstripCardsHtml}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Lấy dải 5 frames liên tiếp xung quanh frame đang chọn (Sliding Window)
   */
  private getVisible5Frames(track: TrackState): number[] {
    const sortedShapes = [...track.shapes].sort((a, b) => a.frame - b.frame);
    const allFrames = sortedShapes.map((s) => s.frame);
    if (allFrames.length === 0) return [this.selectedFrame];
    if (allFrames.length <= 5) return allFrames;

    const curIdx = allFrames.indexOf(this.selectedFrame);
    const idx = curIdx >= 0 ? curIdx : 0;

    let startIdx = idx - 2;
    if (startIdx < 0) startIdx = 0;
    if (startIdx + 5 > allFrames.length) startIdx = Math.max(0, allFrames.length - 5);

    return allFrames.slice(startIdx, startIdx + 5);
  }

  /**
   * Khởi tạo và gắn component 5 Frames x 3 Ortho Viewports vào DOM
   */
  private mountOrthoEditor(track: TrackState | undefined): void {
    const mountEl = this.overlay?.querySelector<HTMLElement>("#ortho-canvas-mount-point");
    if (!mountEl || !track) return;

    if (this.orthoEditor) {
      this.orthoEditor.unmount();
      this.orthoEditor = null;
    }

    this.orthoEditor = new OrthoEditorPanel(
      (newBox: Box3D, isLiveSync: boolean) => {
        this.handleBoxChangedFromOrtho(track, newBox, isLiveSync);
      },
      (frame: number) => {
        this.selectFrame(frame);
      }
    );

    this.orthoEditor.mount(mountEl);
    this.updateOrthoEditorState(track);
    this.preloadPointsForVisibleFrames(track);
  }

  /**
   * Cập nhật Box và Point Cloud cho 5 Frames của OrthoEditor
   */
  private updateOrthoEditorState(track: TrackState | undefined): void {
    if (!this.orthoEditor || !track) return;

    const visibleFrames = this.getVisible5Frames(track);
    const framesData: FrameColumnData[] = visibleFrames.map((f) => {
      const pos = track.at(f);
      const box = pos ? pos.box : { c: [0, 0, 0], s: [4, 1.8, 1.5], r: [0, 0, 0] };
      const keyframe = pos ? pos.keyframe : false;
      const outside = pos ? pos.outside : false;

      let points: Float32Array | null = null;
      if (this.showAllPoints) {
        points = this.pointManager.getAccumulatedPoints(f, box);
      } else {
        points = this.pointManager.getFramePoints(f);
      }

      return {
        frame: f,
        box,
        keyframe,
        outside,
        labelColor: track.labelColor,
        points,
      };
    });

    this.orthoEditor.setFrames(framesData, this.selectedFrame);
  }

  /**
   * Tự động tải trước mây điểm cho toàn bộ 5 frames đang hiển thị
   */
  private async preloadPointsForVisibleFrames(track: TrackState): Promise<void> {
    const visibleFrames = this.getVisible5Frames(track);
    let hasNewPoints = false;

    for (const f of visibleFrames) {
      if (!this.pointManager.hasFrame(f)) {
        const pos = track.at(f);
        if (pos && !pos.outside) {
          try {
            const diag = Math.hypot(pos.box.s[0], pos.box.s[1]);
            const radius = Math.max(3.5, diag / 2 + 1.2);
            const pts = await CVATBridge.getRoiLidarPoints(pos.box.c, radius, 15000);
            if (pts && pts.length > 0) {
              this.pointManager.setFramePoints(f, pts, pos.box);
              hasNewPoints = true;
            }
          } catch (e) {
            console.warn(`[CVAT 3D Studio] Không thể tải điểm frame #${f}:`, e);
          }
        }
      }
    }

    if (hasNewPoints) {
      this.updateOrthoEditorState(track);
    }
  }

  /**
   * Tự động tải mây điểm cho frame hiện tại nếu chưa có trong cache
   */
  private async loadPointsForCurrentFrame(): Promise<void> {
    if (!this.store) return;
    const track = this.store.getTrack(this.activeTrackId);
    if (!track) return;
    await this.preloadPointsForVisibleFrames(track);
  }

  /**
   * Xử lý khi người dùng tương tác kéo chuột chỉnh box trên Ortho Canvas (In-Memory Only)
   */
  private handleBoxChangedFromOrtho(track: TrackState, newBox: Box3D, isLiveSync: boolean): void {
    const f = this.selectedFrame;

    if (isLiveSync) {
      // 1. Kéo chuột: Chỉ cập nhật in-memory box để giao diện mượt mà 60fps (TUYỆT ĐỐI KHÔNG GỌI CVATBridge.updateLiveBox)
      track.setBox(f, newBox);
      this.updateSidebarInputs(newBox);
    } else {
      // 2. Nhả chuột chốt thay đổi: Lưu snapshot vào Undo stack in-memory
      track.snapshot();

      if (this.applyToAllFrames) {
        this.applySizeToWholeTrack(track.uiId, [newBox.s[0], newBox.s[1], newBox.s[2]]);
      } else {
        track.setBox(f, newBox);
      }
      track.dirty = true;

      this.updateHeaderDirtyState();
      this.updateOrthoEditorState(track);
      // TUYỆT ĐỐI KHÔNG GỌI CVATBridge.updateLiveBox - CHỈ ĐỒNG BỘ KHI BẤM NÚT SAVE!
    }
  }

  private updateSidebarInputs(box: Box3D): void {
    const inpX = this.overlay?.querySelector<HTMLInputElement>("#input-center-x");
    const inpY = this.overlay?.querySelector<HTMLInputElement>("#input-center-y");
    const inpZ = this.overlay?.querySelector<HTMLInputElement>("#input-center-z");
    const inpL = this.overlay?.querySelector<HTMLInputElement>("#input-dim-l");
    const inpW = this.overlay?.querySelector<HTMLInputElement>("#input-dim-w");
    const inpH = this.overlay?.querySelector<HTMLInputElement>("#input-dim-h");
    const inpYaw = this.overlay?.querySelector<HTMLInputElement>("#input-dim-yaw");

    if (inpX) inpX.value = box.c[0].toFixed(2);
    if (inpY) inpY.value = box.c[1].toFixed(2);
    if (inpZ) inpZ.value = box.c[2].toFixed(2);
    if (inpL) inpL.value = box.s[0].toFixed(2);
    if (inpW) inpW.value = box.s[1].toFixed(2);
    if (inpH) inpH.value = box.s[2].toFixed(2);
    if (inpYaw) inpYaw.value = String(Math.round((box.r[2] * 180) / Math.PI));
  }

  private updateHeaderDirtyState(): void {
    if (!this.store) return;
    const dirtyCount = this.store.getDirtyTracks().length;
    const btn = this.overlay?.querySelector<HTMLButtonElement>("#btn-studio-commit-save");
    if (btn) {
      btn.style.background = dirtyCount > 0 ? "#ea580c" : "#059669";
      btn.style.borderColor = dirtyCount > 0 ? "#ea580c" : "#059669";
      const span = btn.querySelector("span:nth-child(2)");
      if (span) {
        span.textContent = dirtyCount > 0 ? `Lưu vào CVAT (${dirtyCount} track)` : "Lưu vào CVAT";
      }
    }
  }

  private attachActiveTrackListeners(track: TrackState | undefined): void {
    if (!this.overlay || !track || !this.store || !this.currentCtx?.jobId) return;
    const jobId = this.currentCtx.jobId;

    // 1. Click vào bất kỳ thẻ card nào trên dải phim Filmstrip
    this.overlay.querySelectorAll<HTMLElement>(".filmstrip-card").forEach((card) => {
      card.addEventListener("click", () => {
        const f = parseInt(card.dataset.frame || "0", 10);
        this.selectFrame(f);
      });
    });

    // 2. Kéo Slider Timeline
    const slider = this.overlay.querySelector<HTMLInputElement>("#timeline-slider");
    slider?.addEventListener("input", (e) => {
      const f = parseInt((e.target as HTMLInputElement).value, 10);
      this.selectFrame(f, false);
    });

    // 3. Nút Prev / Next / Play
    this.overlay.querySelector("#btn-timeline-prev5")?.addEventListener("click", () => {
      this.stepFrame(-5);
    });

    this.overlay.querySelector("#btn-timeline-prev")?.addEventListener("click", () => {
      this.stepFrame(-1);
    });

    this.overlay.querySelector("#btn-timeline-next")?.addEventListener("click", () => {
      this.stepFrame(1);
    });

    this.overlay.querySelector("#btn-timeline-next5")?.addEventListener("click", () => {
      this.stepFrame(5);
    });

    this.overlay.querySelector("#btn-timeline-play")?.addEventListener("click", () => {
      this.togglePlayback();
    });

    // 4. Nút Tải Toàn Bộ Curpoint
    const btnScan = this.overlay.querySelector<HTMLButtonElement>("#btn-scan-all-curpoints");
    btnScan?.addEventListener("click", () => {
      if (this.pointManager.isScanActive) {
        this.pointManager.abortScan();
        return;
      }

      const lbl = this.overlay?.querySelector("#lbl-scan-progress");
      this.pointManager.scanTrackCurpoints(
        track,
        (cur, total, f) => {
          if (lbl) lbl.textContent = `Đang tải: f#${f} (${cur}/${total})... [Hủy]`;
          this.selectedFrame = f;
          this.updateOrthoEditorState(track);
        },
        (success, count) => {
          if (lbl) lbl.textContent = success ? `Đã tải ${count} frames!` : "Tải Toàn Bộ Curpoint";
          if (success) {
            this.showAllPoints = true;
            this.updatePointModeButtons();
            this.updateOrthoEditorState(track);
          }
        }
      );
    });

    // 5. Toggle Chế Độ Điểm: Frame Này vs Show All Point Cloud
    this.overlay.querySelector("#btn-point-mode-single")?.addEventListener("click", () => {
      this.showAllPoints = false;
      this.updatePointModeButtons();
      this.updateOrthoEditorState(track);
    });

    this.overlay.querySelector("#btn-point-mode-all")?.addEventListener("click", () => {
      this.showAllPoints = true;
      this.updatePointModeButtons();
      this.updateOrthoEditorState(track);
    });

    // 6. Checkbox Toàn Track
    const chkAll = this.overlay.querySelector<HTMLInputElement>("#chk-apply-all-frames");
    chkAll?.addEventListener("change", (e) => {
      this.applyToAllFrames = (e.target as HTMLInputElement).checked;
    });

    // 7. Nhập trực tiếp các thông số từ Sidebar
    const handleInputBoxChange = () => {
      const inpX = parseFloat(this.overlay?.querySelector<HTMLInputElement>("#input-center-x")?.value || "0");
      const inpY = parseFloat(this.overlay?.querySelector<HTMLInputElement>("#input-center-y")?.value || "0");
      const inpZ = parseFloat(this.overlay?.querySelector<HTMLInputElement>("#input-center-z")?.value || "0");
      const inpL = parseFloat(this.overlay?.querySelector<HTMLInputElement>("#input-dim-l")?.value || "0");
      const inpW = parseFloat(this.overlay?.querySelector<HTMLInputElement>("#input-dim-w")?.value || "0");
      const inpH = parseFloat(this.overlay?.querySelector<HTMLInputElement>("#input-dim-h")?.value || "0");
      const inpYaw = parseFloat(this.overlay?.querySelector<HTMLInputElement>("#input-dim-yaw")?.value || "0");

      if (inpL > 0 && inpW > 0 && inpH > 0) {
        const curBox = track.at(this.selectedFrame)?.box;
        const newBox: Box3D = {
          c: [inpX, inpY, inpZ],
          s: [inpL, inpW, inpH],
          r: curBox ? [curBox.r[0], curBox.r[1], (inpYaw * Math.PI) / 180] : [0, 0, (inpYaw * Math.PI) / 180],
        };
        this.handleBoxChangedFromOrtho(track, newBox, false);
        this.updateOrthoEditorState(track);
      }
    };

    [
      "#input-center-x",
      "#input-center-y",
      "#input-center-z",
      "#input-dim-l",
      "#input-dim-w",
      "#input-dim-h",
      "#input-dim-yaw",
    ].forEach((id) => {
      this.overlay?.querySelector(id)?.addEventListener("change", handleInputBoxChange);
    });

    // 8. Các nút vi chỉnh nhanh Stepper Move
    this.overlay.querySelectorAll<HTMLButtonElement>(".btn-step-move").forEach((btn) => {
      btn.addEventListener("click", () => {
        const axis = btn.dataset.axis;
        const val = parseFloat(btn.dataset.val || "0");
        const curPos = track.at(this.selectedFrame);
        if (!curPos) return;

        const newBox = cloneBox(curPos.box);
        if (axis === "x") newBox.c[0] += val;
        else if (axis === "y") newBox.c[1] += val;
        else if (axis === "z") newBox.c[2] += val;

        this.handleBoxChangedFromOrtho(track, newBox, false);
        this.updateOrthoEditorState(track);
        this.updateSidebarInputs(newBox);
      });
    });

    // 9. Bộ nút Auto-Fit nhanh (Thực thi In-Memory - Tuyệt đối không auto-sync ngầm vào CVAT)
    this.overlay.querySelector("#btn-fit-top")?.addEventListener("click", () => {
      this.executeInMemoryFit("top");
    });

    this.overlay.querySelector("#btn-fit-side")?.addEventListener("click", () => {
      this.executeInMemoryFit("side");
    });

    this.overlay.querySelector("#btn-fit-front")?.addEventListener("click", () => {
      this.executeInMemoryFit("front");
    });

    this.overlay.querySelector("#btn-fit-ground")?.addEventListener("click", () => {
      this.executeInMemoryGroundSnap();
    });

    this.overlay.querySelector("#btn-fit-flip-180")?.addEventListener("click", () => {
      this.executeInMemoryFlip180();
    });

    // 10. Nút Toggle Outside tại frame hiện tại
    this.overlay.querySelector("#btn-toggle-outside-cur")?.addEventListener("click", () => {
      this.toggleOutsideFrame(this.selectedFrame);
    });
  }

  /**
   * Chạy thuật toán Auto-Fit (TOP, SIDE, FRONT) trực tiếp In-Memory (Không ghi đè sang CVAT)
   */
  private executeInMemoryFit(step: "top" | "side" | "front"): void {
    if (!this.store) return;
    const track = this.store.getTrack(this.activeTrackId);
    if (!track) return;

    const curPos = track.at(this.selectedFrame);
    if (!curPos) return;

    const b = curPos.box;
    const ptsArr = this.showAllPoints
      ? this.pointManager.getAccumulatedPoints(this.selectedFrame, b)
      : this.pointManager.getFramePoints(this.selectedFrame);
    const pts = ptsArr ? float32ToVec3Array(ptsArr) : [];

    if (pts.length > 0) {
      track.snapshot();
      const fitRes = fitBoxToEgoRayAndGround(
        pts,
        b.c[0],
        b.c[1],
        b.c[2],
        b.r[2],
        b.s[0],
        b.s[1],
        b.s[2],
        { x: 0, y: 0, z: 0 },
        { fitStep: step, preserveDimensions: true }
      );

      const newBox: Box3D = {
        c: [fitRes.newCenterX, fitRes.newCenterY, fitRes.newCenterZ],
        s: [fitRes.newL, fitRes.newW, fitRes.newH],
        r: [b.r[0], b.r[1], fitRes.newYaw],
      };

      if (this.applyToAllFrames) {
        this.applySizeToWholeTrack(track.uiId, [newBox.s[0], newBox.s[1], newBox.s[2]]);
      } else {
        track.setBox(this.selectedFrame, newBox);
      }
      track.dirty = true;
      this.updateSidebarInputs(newBox);
      this.updateOrthoEditorState(track);
      this.updateHeaderDirtyState();
    }
  }

  /**
   * Ghim đáy xe bám sát mặt đất In-Memory theo Footprint Ground Snap (Fallback Ego Z 0° nếu ít điểm)
   */
  private executeInMemoryGroundSnap(): void {
    if (!this.store) return;
    const track = this.store.getTrack(this.activeTrackId);
    if (!track) return;

    const curPos = track.at(this.selectedFrame);
    if (!curPos) return;

    const b = curPos.box;
    const ptsArr = this.pointManager.getFramePoints(this.selectedFrame);
    const pts = ptsArr ? float32ToVec3Array(ptsArr) : [];

    track.snapshot();
    const groundRes = computeGroundSlopesAndZ(
      pts,
      b.c[0],
      b.c[1],
      b.c[2],
      b.r[2],
      b.s[0] / 2,
      b.s[1] / 2
    );

    const baseZ = groundRes.groundZ !== null ? groundRes.groundZ : -1.75;
    const newBox = cloneBox(b);
    newBox.r[0] = groundRes.rollRad;
    newBox.r[1] = groundRes.pitchRad;
    newBox.c[2] = Number(
      (baseZ + (b.s[2] / 2) * Math.cos(groundRes.pitchRad) * Math.cos(groundRes.rollRad)).toFixed(3)
    );

    track.setBox(this.selectedFrame, newBox);
    track.dirty = true;
    this.updateSidebarInputs(newBox);
    this.updateOrthoEditorState(track);
    this.updateHeaderDirtyState();
  }

  /**
   * Lật ngược đầu xe 180° In-Memory quanh trục Z
   */
  private executeInMemoryFlip180(): void {
    if (!this.store) return;
    const track = this.store.getTrack(this.activeTrackId);
    if (!track) return;

    const curPos = track.at(this.selectedFrame);
    if (!curPos) return;

    track.snapshot();
    const rotated = rotateLocal(curPos.box, 0, 0, Math.PI);
    track.setBox(this.selectedFrame, rotated);
    track.dirty = true;
    this.updateSidebarInputs(rotated);
    this.updateOrthoEditorState(track);
    this.updateHeaderDirtyState();
  }

  private updatePointModeButtons(): void {
    const btnSingle = this.overlay?.querySelector<HTMLButtonElement>("#btn-point-mode-single");
    const btnAll = this.overlay?.querySelector<HTMLButtonElement>("#btn-point-mode-all");
    if (btnSingle && btnAll) {
      btnSingle.style.background = !this.showAllPoints ? "#ffffff" : "transparent";
      btnSingle.style.color = !this.showAllPoints ? "#0284c7" : "#64748b";
      btnSingle.style.fontWeight = !this.showAllPoints ? "bold" : "normal";

      btnAll.style.background = this.showAllPoints ? "#059669" : "transparent";
      btnAll.style.color = this.showAllPoints ? "white" : "#64748b";
      btnAll.style.fontWeight = this.showAllPoints ? "bold" : "normal";
      btnAll.textContent = `Show All Point Cloud (${this.pointManager.loadedFramesCount}f)`;
    }
  }

  private async selectFrame(f: number, updateSlider: boolean = true): Promise<void> {
    if (this.selectedFrame === f) return;
    this.selectedFrame = f;
    this.jumpToCVATFrame(f);

    if (updateSlider) {
      const slider = this.overlay?.querySelector<HTMLInputElement>("#timeline-slider");
      if (slider) slider.value = String(f);
    }

    // Highlight thẻ card trong Filmstrip
    this.overlay?.querySelectorAll(".filmstrip-card").forEach((c) => {
      const cardF = parseInt((c as HTMLElement).dataset.frame || "-1", 10);
      if (cardF === f) {
        c.classList.add("active");
        (c as HTMLElement).style.borderColor = "#2563eb";
        (c as HTMLElement).style.background = "#eff6ff";
        c.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      } else {
        c.classList.remove("active");
        (c as HTMLElement).style.borderColor = "#cbd5e1";
        (c as HTMLElement).style.background = "#ffffff";
      }
    });

    if (!this.store) return;
    const track = this.store.getTrack(this.activeTrackId);
    if (!track) return;

    const pos = track.at(f);
    if (pos) {
      this.updateSidebarInputs(pos.box);
    }

    this.updateOrthoEditorState(track);
    await this.preloadPointsForVisibleFrames(track);
  }

  private stepFrame(delta: number): void {
    if (!this.store) return;
    const track = this.store.getTrack(this.activeTrackId);
    if (!track || track.shapes.length === 0) return;

    const frames = track.shapes.map((s) => s.frame).sort((a, b) => a - b);
    const curIdx = frames.indexOf(this.selectedFrame);
    if (curIdx >= 0) {
      const nextIdx = Math.max(0, Math.min(frames.length - 1, curIdx + delta));
      this.selectFrame(frames[nextIdx]);
    } else {
      this.selectFrame(frames[0]);
    }
  }

  private togglePlayback(): void {
    if (this.isPlaying) {
      this.stopPlayback();
    } else {
      this.startPlayback();
    }
  }

  private startPlayback(): void {
    this.isPlaying = true;
    const btn = this.overlay?.querySelector("#btn-timeline-play");
    if (btn) btn.textContent = "❚❚ Pause";

    this.playInterval = setInterval(() => {
      if (!this.store) return;
      const track = this.store.getTrack(this.activeTrackId);
      if (!track || track.shapes.length === 0) return;

      const frames = track.shapes.map((s) => s.frame).sort((a, b) => a - b);
      const curIdx = frames.indexOf(this.selectedFrame);
      const nextIdx = curIdx + 1 >= frames.length ? 0 : curIdx + 1;
      this.selectFrame(frames[nextIdx]);
    }, 250);
  }

  private stopPlayback(): void {
    this.isPlaying = false;
    if (this.playInterval) {
      clearInterval(this.playInterval);
      this.playInterval = null;
    }
    const btn = this.overlay?.querySelector("#btn-timeline-play");
    if (btn) btn.textContent = "▶ Play";
  }

  private async refreshCurrentFrameAfterFit(): Promise<void> {
    if (!this.currentCtx?.jobId) return;
    await this.loadInitialData();
  }

  // =========================================================================
  // TAB 1: BATCH SIZE MANAGER
  // =========================================================================

  private renderBatchAllHtml(allTracks: TrackState[]): string {
    const rowsHtml = allTracks
      .map((t) => {
        const sizes = t.shapes.map((s) => s.points.slice(6, 9));
        const medL = this.median(sizes.map((s) => s[0]));
        const medW = this.median(sizes.map((s) => s[1]));
        const medH = this.median(sizes.map((s) => s[2]));

        return `
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px 14px; font-weight: bold;">
              <span style="color: ${t.labelColor};">#${t.uiId}</span> · ${t.labelName}
            </td>
            <td style="padding: 10px 14px; font-family: monospace;">${t.firstFrame} ➔ ${t.lastFrame} (${t.shapes.length}f)</td>
            <td style="padding: 10px 14px; font-family: monospace; font-weight: bold; color: #0284c7;">
              ${medL.toFixed(2)} × ${medW.toFixed(2)} × ${medH.toFixed(2)}m
            </td>
            <td style="padding: 10px 14px; text-align: right;">
              <button class="btn-jump-track-studio" data-tid="${t.uiId}" style="
                background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 4px; cursor: pointer;
              ">Mở Studio ➔</button>
            </td>
          </tr>
        `;
      })
      .join("");

    return `
      <div style="flex: 1; overflow: auto; padding: 16px 20px; background: #ffffff;">
        <h3 style="margin: 0 0 12px 0; font-size: 14px; color: #09090b;">Danh Sách Kích Thước Tất Cả Track Trong Job</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
          <thead>
            <tr style="border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 11px; background: #f8fafc;">
              <th style="padding: 8px 14px;">Track ID & Nhãn</th>
              <th style="padding: 8px 14px;">Vòng Đời Frames</th>
              <th style="padding: 8px 14px;">Kích Thước Trung Vị (L × W × H)</th>
              <th style="padding: 8px 14px; text-align: right;">Hành Động</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;
  }

  private attachBatchAllListeners(): void {
    if (!this.overlay) return;
    this.overlay.querySelectorAll<HTMLButtonElement>(".btn-jump-track-studio").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tid = parseInt(btn.dataset.tid || "0", 10);
        if (tid) this.switchActiveTrack(tid);
      });
    });
  }

  // =========================================================================
  // CÁC HÀM ĐIỀU HƯỚNG & HỖ TRỢ TOÀN CỤC
  // =========================================================================

  private attachHeaderListeners(): void {
    if (!this.overlay) return;

    this.overlay.querySelector("#studio-tab-active")?.addEventListener("click", () => {
      this.currentTab = "active_track";
      this.render();
    });

    this.overlay.querySelector("#studio-tab-batch")?.addEventListener("click", () => {
      this.currentTab = "batch_all";
      this.render();
    });

    this.overlay.querySelector<HTMLSelectElement>("#studio-quick-track-select")?.addEventListener("change", (e) => {
      const select = e.target as HTMLSelectElement;
      const tid = parseInt(select.value, 10);
      if (!isNaN(tid)) this.switchActiveTrack(tid);
    });

    this.overlay.querySelector("#btn-quick-prev-track")?.addEventListener("click", () => {
      this.switchPrevTrack();
    });

    this.overlay.querySelector("#btn-quick-next-track")?.addEventListener("click", () => {
      this.switchNextTrack();
    });

    this.overlay.querySelector("#btn-studio-undo")?.addEventListener("click", () => {
      this.triggerUndo();
    });

    this.overlay.querySelector("#btn-studio-redo")?.addEventListener("click", () => {
      this.triggerRedo();
    });

    this.overlay.querySelector("#btn-studio-close")?.addEventListener("click", () => {
      this.close();
    });

    this.overlay.querySelector("#btn-studio-commit-save")?.addEventListener("click", () => {
      this.triggerCommitSave();
    });
  }

  private triggerUndo(): void {
    if (!this.store) return;
    const track = this.store.getTrack(this.activeTrackId);
    if (track && track.undo()) {
      track.dirty = true;
      this.render();
      this.updateHeaderDirtyState();
    }
  }

  private triggerRedo(): void {
    if (!this.store) return;
    const track = this.store.getTrack(this.activeTrackId);
    if (track && track.redo()) {
      track.dirty = true;
      this.render();
      this.updateHeaderDirtyState();
    }
  }

  private switchActiveTrack(newTrackId: number): void {
    this.stopPlayback();
    this.activeTrackId = newTrackId;
    this.pointManager.setActiveTrack(newTrackId);
    this.currentTab = "active_track";
    if (this.store) {
      const track = this.store.getTrack(newTrackId);
      if (track && track.shapes.length > 0) {
        this.selectedFrame = track.shapes[0].frame;
      }
    }
    this.render();
    this.loadPointsForCurrentFrame();
  }

  private switchPrevTrack(): void {
    if (!this.store) return;
    const tracks = this.store.getAllTracks();
    const idx = tracks.findIndex((t) => t.uiId === this.activeTrackId);
    if (idx > 0) {
      this.switchActiveTrack(tracks[idx - 1].uiId);
    }
  }

  private switchNextTrack(): void {
    if (!this.store) return;
    const tracks = this.store.getAllTracks();
    const idx = tracks.findIndex((t) => t.uiId === this.activeTrackId);
    if (idx >= 0 && idx < tracks.length - 1) {
      this.switchActiveTrack(tracks[idx + 1].uiId);
    }
  }

  private jumpToCVATFrame(frame: number): void {
    try {
      const frameInput = document.querySelector<HTMLInputElement>("input.cvat-player-frame-selector");
      if (frameInput) {
        frameInput.value = String(frame);
        frameInput.dispatchEvent(new Event("change", { bubbles: true }));
        frameInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true }));
      }
      CVATBridge.jumpToFrame(frame);
    } catch (e) {
      console.warn("[CVAT 3D Studio] Chuyển frame:", e);
    }
  }

  private toggleOutsideFrame(frame: number): void {
    if (!this.store) return;
    const track = this.store.getTrack(this.activeTrackId);
    if (!track) return;

    const sh = track.shapes.find((s) => s.frame === frame);
    if (sh) {
      track.snapshot();
      sh.outside = !sh.outside;
      track.dirty = true;
      this.render();
    }
  }

  private applySizeToWholeTrack(trackId: number, newSize: [number, number, number]): void {
    if (!this.store || !this.currentCtx?.jobId) return;
    const track = this.store.getTrack(trackId);
    if (!track) return;

    for (const sh of track.shapes) {
      if (!sh.outside) {
        const curBox = track.at(sh.frame)?.box;
        if (curBox) {
          const updatedBox = resizeKeepBottom(curBox, newSize);
          sh.points[0] = updatedBox.c[0];
          sh.points[1] = updatedBox.c[1];
          sh.points[2] = updatedBox.c[2];
        }
        sh.points[6] = newSize[0];
        sh.points[7] = newSize[1];
        sh.points[8] = newSize[2];
      }
    }

    track.dirty = true;
    this.updateHeaderDirtyState();
    this.updateOrthoEditorState(track);
  }

  private async triggerCommitSave(): Promise<void> {
    if (!this.currentCtx?.jobId || !this.store || this.isSaving) return;

    this.isSaving = true;
    this.updateHeaderDirtyState();

    try {
      const dirtyTracks = this.store.getDirtyTracks();
      // 1. Đồng bộ toàn bộ các frame đã chỉnh sửa sang CVAT WebGL Canvas
      for (const track of dirtyTracks) {
        for (const sh of track.shapes) {
          if (!sh.outside && sh.points) {
            await CVATBridge.updateLiveBox(
              this.currentCtx.jobId,
              sh.frame,
              track.uiId,
              track.serverId,
              sh.points,
              true
            );
          }
        }
      }

      // 2. Lưu chính thức vào cơ sở dữ liệu CVAT
      const res = await CVATBridge.commitSave(this.currentCtx.jobId);
      if (res && res.success) {
        for (const t of this.store.getAllTracks()) {
          t.dirty = false;
        }
      }
    } catch (e) {
      console.error("[CVAT 3D Studio] Lỗi lưu vào CVAT:", e);
    } finally {
      this.isSaving = false;
      this.updateHeaderDirtyState();
      this.render();
    }
  }

  private median(arr: number[]): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }
}
