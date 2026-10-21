import { CVATContext } from "../../core/types";
import { CVATBridge, FrameTrackItem } from "../../cvat/bridge";
import {
  Box3D,
  cloneBox,
  resizeKeepBottom,
  boxToPoints,
  boxCorners,
  BOX_EDGES,
  snapToGround,
  axes,
  localToWorld,
} from "../../core/geometry";
import {
  JobAnnotationStore,
  TrackData,
} from "../../core/track_store";
import {
  OrthoInteractionEngine,
  OrthoViewType,
  ViewCellState,
  DragSession,
  VIEWS_DEF,
} from "../../core/grid_interaction";

export type EditorTab = "case1" | "case2";

/**
 * Giao diện Toàn Màn Hình Chuyên Nghiệp (Full-Screen Suite):
 * - Hỗ trợ 2 Tab: Case 1 (Sửa L/W/H hàng loạt) và Case 2 (Duyệt theo ID)
 * - Tương tác chuột trực tiếp: kéo thân, 4 góc đỏ đổi 2 chiều, 4 cạnh trắng đổi 1 chiều, chấm vàng xoay 5°
 * - Cuộn chuột zoom quanh con trỏ (Shift + cuộn = zoom đồng bộ toàn bộ ô cùng loại)
 * - Nút ⛶ mở Big View Modal toàn cảnh LiDAR ~40m
 * - Two-Way Live Sync sang Three.js Canvas của CVAT native theo thời gian thực
 * - Undo/Redo stack (Ctrl+Z, Ctrl+Y)
 * - TUYỆT ĐỐI KHÔNG AUTOSAVE: Chỉ lưu khi người dùng bấm "Lưu vào CVAT" hoặc nhấn Ctrl+S
 */
export class TrackEditorModal {
  private overlay: HTMLDivElement | null = null;
  private currentCtx: CVATContext | null = null;
  private currentTab: EditorTab = "case2";
  private allJobTracks: FrameTrackItem[] = [];

  // Kho dữ liệu annotation
  private store: JobAnnotationStore | null = null;

  // Cấu hình Case 2
  private activeTrackId: number = 1;
  private frameRange: [number, number] = [0, 100];
  private rowHeight: number = 230;
  private syncLwhAll: boolean = true;
  private isContextMode: boolean = true;
  private hideGroundTop: boolean = false;
  private allowTilt: boolean = false;
  private slabThickness: number = 1.0;
  private pointSize: number = 2.0;

  // Zoom và Pan cho từng view
  private globalZoom: Record<OrthoViewType, number> = { top: 1, side: 1, front: 1 };
  private cells: Map<string, ViewCellState> = new Map(); // key: `${frame}_${view}`
  private activeDrag: DragSession | null = null;

  // Point Cloud Cache từ WebGL RAM
  private sceneLidarPoints: Float32Array | null = null;

  // Cấu hình Case 1
  private case1SizeMode: "bottom" | "center" | "ground" = "bottom";
  private case1Range: [number, number] = [0, 100];

  // Big View Modal
  private bigViewModal: HTMLDivElement | null = null;
  private bigViewCell: ViewCellState | null = null;

  constructor() {
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
  }

  public async open(
    ctx: CVATContext,
    uiId: number,
    _serverId?: number,
    allTracks: FrameTrackItem[] = []
  ): Promise<void> {
    this.currentCtx = ctx;
    this.activeTrackId = uiId;
    this.allJobTracks = allTracks;

    if (!this.overlay) {
      this.createOverlay();
    }

    document.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("pointermove", this.handlePointerMove);
    window.addEventListener("pointerup", this.handlePointerUp);

    if (this.overlay) {
      this.overlay.style.display = "flex";
    }

    await this.loadInitialData();
  }

  public close(): void {
    if (this.store && this.store.getDirtyTracks().length > 0) {
      const confirmClose = window.confirm(
        "Bạn có các thay đổi chưa lưu vào CVAT. Bạn có chắc chắn muốn đóng giao diện?"
      );
      if (!confirmClose) return;
    }

    document.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("pointermove", this.handlePointerMove);
    window.removeEventListener("pointerup", this.handlePointerUp);

    if (this.overlay) {
      this.overlay.style.display = "none";
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
      return;
    }

    const key = e.key.toLowerCase();

    // 1. Phím Escape: Đóng modal
    if (key === "escape") {
      if (this.bigViewModal) {
        this.closeBigView();
      } else {
        this.close();
      }
      return;
    }

    // 2. Ctrl+Z / Cmd+Z: Undo
    if ((e.ctrlKey || e.metaKey) && key === "z" && !e.shiftKey) {
      e.preventDefault();
      this.triggerUndo();
      return;
    }

    // 3. Ctrl+Y / Cmd+Y / Ctrl+Shift+Z: Redo
    if (
      ((e.ctrlKey || e.metaKey) && key === "y") ||
      ((e.ctrlKey || e.metaKey) && e.shiftKey && key === "z")
    ) {
      e.preventDefault();
      this.triggerRedo();
      return;
    }

    // 4. Ctrl+S / Cmd+S: Lưu vào CVAT
    if ((e.ctrlKey || e.metaKey) && key === "s") {
      e.preventDefault();
      this.triggerCommitSave();
      return;
    }

    // 5. Phím O: Bật/tắt Outside tại frame đang chọn trong Case 2
    if (key === "o" && this.currentTab === "case2") {
      e.preventDefault();
      this.toggleOutsideCurrentRow();
      return;
    }
  }

  private createOverlay(): void {
    this.overlay = document.createElement("div");
    this.overlay.id = "cvat-3d-fullscreen-suite";
    this.overlay.style.position = "fixed";
    this.overlay.style.inset = "0";
    this.overlay.style.zIndex = "999999";
    this.overlay.style.background = "#09090b"; // zinc-950
    this.overlay.style.color = "#f4f4f5";
    this.overlay.style.display = "none";
    this.overlay.style.flexDirection = "column";
    this.overlay.style.fontFamily =
      "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    this.overlay.style.userSelect = "none";

    document.body.appendChild(this.overlay);
  }

  /**
   * Tải toàn bộ dữ liệu từ CVAT thông qua Bridge
   */
  private async loadInitialData(): Promise<void> {
    if (!this.currentCtx?.jobId) return;

    this.renderLoading();
    try {
      // 1. Lấy danh sách toàn bộ tracks kèm shapes
      const tracksData: TrackData[] = await CVATBridge.getAllJobTracksWithShapes(
        this.currentCtx.jobId
      );

      this.store = new JobAnnotationStore(this.currentCtx.jobId);
      this.store.setTracks(tracksData);

      // Nếu không có track nào từ Bridge, tạo fallback từ allJobTracks
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

      // 2. Lấy điểm LiDAR từ WebGL RAM
      const rawPoints = await CVATBridge.getLidarPointsFromScene();
      if (rawPoints && rawPoints.length > 0) {
        this.sceneLidarPoints = new Float32Array(rawPoints);
      }

      // 3. Khởi tạo dải frame từ track hiện tại
      const activeTrack = this.store.getTrack(this.activeTrackId) || this.store.getAllTracks()[0];
      if (activeTrack) {
        this.activeTrackId = activeTrack.uiId;
        this.frameRange = [activeTrack.firstFrame, activeTrack.lastFrame];
        this.case1Range = [activeTrack.firstFrame, activeTrack.lastFrame];
      }

      this.render();
    } catch (err: any) {
      if (this.overlay) {
        this.overlay.innerHTML = `
          <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; color: #ef4444;">
            <h3 style="margin: 0; font-size: 16px;">Lỗi tải dữ liệu Job: ${err.message || err}</h3>
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
      <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px;">
        <div style="width: 36px; height: 36px; border: 3px solid rgba(255,255,255,0.1); border-top-color: #38bdf8; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
        <span style="font-size: 13px; color: #a1a1aa; font-family: monospace;">Đang nạp dữ liệu Point Cloud & Hành trình xe...</span>
      </div>
      <style>
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      </style>
    `;
  }

  /**
   * Render giao diện chính với 2 Tab
   */
  private render(): void {
    if (!this.overlay || !this.currentCtx || !this.store) return;

    const jobId = this.currentCtx.jobId;
    const allTracks = this.store.getAllTracks();
    const dirtyCount = this.store.getDirtyTracks().length;

    this.overlay.innerHTML = `
      <!-- 1. HEADER BAR CHUYÊN NGHIỆP -->
      <div style="
        background: #18181b;
        border-bottom: 1px solid rgba(255,255,255,0.08);
        padding: 8px 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 48px;
      ">
        <div style="display: flex; align-items: center; gap: 12px;">
          <!-- Logo & Job Name -->
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="background: #ef4444; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; letter-spacing: 0.5px;">3D SUITE</span>
            <span style="font-size: 13px; font-weight: bold; color: #f4f4f5;">Job #${jobId}</span>
          </div>

          <!-- Tab Selection (Case 1 vs Case 2) -->
          <div style="display: flex; background: #09090b; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 2px;">
            <button id="tab-btn-case1" style="
              border: none;
              background: ${this.currentTab === "case1" ? "#2563eb" : "transparent"};
              color: ${this.currentTab === "case1" ? "white" : "#71717a"};
              padding: 4px 12px;
              font-size: 11px;
              font-weight: 600;
              cursor: pointer;
              border-radius: 4px;
              transition: all 0.15s;
            ">Case 1 · Sửa L/W/H hàng loạt</button>

            <button id="tab-btn-case2" style="
              border: none;
              background: ${this.currentTab === "case2" ? "#2563eb" : "transparent"};
              color: ${this.currentTab === "case2" ? "white" : "#71717a"};
              padding: 4px 12px;
              font-size: 11px;
              font-weight: 600;
              cursor: pointer;
              border-radius: 4px;
              transition: all 0.15s;
            ">Case 2 · Duyệt theo ID</button>
          </div>

          <!-- Undo / Redo Buttons -->
          <div style="display: flex; align-items: center; gap: 4px;">
            <button id="btn-modal-undo" title="Hoàn tác (Ctrl+Z)" ${this.store.history.length === 0 ? "disabled" : ""} style="
              background: #27272a;
              border: 1px solid rgba(255,255,255,0.1);
              color: ${this.store.history.length === 0 ? "#52525b" : "#d4d4d8"};
              font-size: 11px;
              padding: 4px 8px;
              border-radius: 5px;
              cursor: ${this.store.history.length === 0 ? "default" : "pointer"};
            ">↶ Undo</button>

            <button id="btn-modal-redo" title="Làm lại (Ctrl+Y)" ${this.store.redoHistory.length === 0 ? "disabled" : ""} style="
              background: #27272a;
              border: 1px solid rgba(255,255,255,0.1);
              color: ${this.store.redoHistory.length === 0 ? "#52525b" : "#d4d4d8"};
              font-size: 11px;
              padding: 4px 8px;
              border-radius: 5px;
              cursor: ${this.store.redoHistory.length === 0 ? "default" : "pointer"};
            ">↷ Redo</button>
          </div>

          <!-- Live Indicator Badge -->
          <span style="
            font-size: 11px;
            font-family: ui-monospace, monospace;
            background: rgba(34, 197, 94, 0.12);
            color: #22c55e;
            border: 1px solid rgba(34, 197, 94, 0.25);
            padding: 2px 8px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            gap: 5px;
          ">
            <span style="width: 6px; height: 6px; background: #22c55e; border-radius: 50%;"></span>
            <span>LIVE · ${allTracks.length} tracks in RAM</span>
          </span>
        </div>

        <!-- Action Buttons (Right) -->
        <div style="display: flex; align-items: center; gap: 8px;">
          <button id="btn-modal-reload" title="Tải lại toàn bộ dữ liệu" style="
            background: #27272a;
            border: 1px solid rgba(255,255,255,0.1);
            color: #d4d4d8;
            font-size: 11px;
            padding: 5px 10px;
            border-radius: 6px;
            cursor: pointer;
          ">⟳ Tải lại</button>

          <!-- Commit Save Button (Lưu vào CVAT) -->
          <button id="btn-modal-commit-save" style="
            background: ${dirtyCount > 0 ? "#ea580c" : "#2563eb"};
            border: 1px solid rgba(255,255,255,0.15);
            color: white;
            font-size: 11px;
            font-weight: 600;
            padding: 5px 14px;
            border-radius: 6px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            box-shadow: 0 2px 8px ${dirtyCount > 0 ? "rgba(234, 88, 12, 0.4)" : "rgba(37, 99, 235, 0.3)"};
            transition: all 0.2s;
          ">
            <span>💾</span>
            <span>${dirtyCount > 0 ? `Lưu vào CVAT (${dirtyCount} track)` : "Lưu vào CVAT"}</span>
          </button>

          <button id="btn-modal-close" style="
            background: #27272a;
            border: 1px solid rgba(255,255,255,0.1);
            color: #a1a1aa;
            font-size: 11px;
            font-weight: bold;
            padding: 5px 10px;
            border-radius: 6px;
            cursor: pointer;
          ">✕ Đóng</button>
        </div>
      </div>

      <!-- 2. NỘI DUNG CHÍNH (TAB CASE 1 HOẶC CASE 2) -->
      <div id="modal-tab-content" style="flex: 1; min-height: 0; display: flex; flex-direction: column;">
        ${this.currentTab === "case1" ? this.renderCase1Html() : this.renderCase2Html()}
      </div>
    `;

    this.attachHeaderListeners();
    if (this.currentTab === "case1") {
      this.attachCase1Listeners();
    } else {
      this.attachCase2Listeners();
      this.renderAllCase2Canvases();
    }
  }

  // =========================================================================
  // GIAO DIỆN & TƯƠNG TÁC TAB CASE 1: SỬA L/W/H HÀNG LOẠT
  // =========================================================================

  private renderCase1Html(): string {
    if (!this.store) return "";

    const allTracks = this.store.getAllTracks();
    const [fromF, toF] = this.case1Range;

    const rowsHtml = allTracks
      .map((t) => {
        // Tính toán median kích thước và kiểm tra biến thiên
        const sizes = t.shapes.map((s) => s.points.slice(6, 9));
        const medL = this.median(sizes.map((s) => s[0]));
        const medW = this.median(sizes.map((s) => s[1]));
        const medH = this.median(sizes.map((s) => s[2]));

        const minL = Math.min(...sizes.map((s) => s[0]));
        const maxL = Math.max(...sizes.map((s) => s[0]));
        const minW = Math.min(...sizes.map((s) => s[1]));
        const maxW = Math.max(...sizes.map((s) => s[1]));
        const minH = Math.min(...sizes.map((s) => s[2]));
        const maxH = Math.max(...sizes.map((s) => s[2]));

        const varies =
          maxL - minL > 0.01 || maxW - minW > 0.01 || maxH - minH > 0.01;

        return `
          <tr data-track-id="${t.uiId}" style="border-bottom: 1px solid rgba(255,255,255,0.06); background: ${t.dirty ? "rgba(34, 197, 94, 0.06)" : "transparent"};">
            <td style="padding: 8px 12px; font-weight: bold; color: #38bdf8; font-family: monospace;">#${t.uiId}</td>
            <td style="padding: 8px 12px;">
              <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${t.labelColor}; margin-right: 6px;"></span>
              <span>${t.labelName}</span>
            </td>
            <td style="padding: 8px 12px; font-family: monospace; color: #a1a1aa;">f${t.firstFrame} ➔ f${t.lastFrame}</td>
            <td style="padding: 8px 12px; font-family: monospace; text-align: center;">${t.shapes.length}</td>
            <td style="padding: 8px 12px; font-family: monospace; color: #e4e4e7;">
              ${medL.toFixed(2)} / ${medW.toFixed(2)} / ${medH.toFixed(2)}m
              ${varies ? '<span style="margin-left: 6px; font-size: 10px; background: rgba(234, 88, 12, 0.2); color: #fb923c; padding: 1px 4px; border-radius: 3px;">không đều</span>' : ""}
            </td>
            <td style="padding: 8px 6px;">
              <input class="input-case1-l" data-track-id="${t.uiId}" type="number" step="0.02" placeholder="${medL.toFixed(2)}" style="width: 60px; background: #09090b; border: 1px solid rgba(255,255,255,0.12); color: #38bdf8; padding: 3px 5px; border-radius: 4px; font-size: 11px;" />
            </td>
            <td style="padding: 8px 6px;">
              <input class="input-case1-w" data-track-id="${t.uiId}" type="number" step="0.02" placeholder="${medW.toFixed(2)}" style="width: 60px; background: #09090b; border: 1px solid rgba(255,255,255,0.12); color: #38bdf8; padding: 3px 5px; border-radius: 4px; font-size: 11px;" />
            </td>
            <td style="padding: 8px 6px;">
              <input class="input-case1-h" data-track-id="${t.uiId}" type="number" step="0.02" placeholder="${medH.toFixed(2)}" style="width: 60px; background: #09090b; border: 1px solid rgba(255,255,255,0.12); color: #38bdf8; padding: 3px 5px; border-radius: 4px; font-size: 11px;" />
            </td>
            <td style="padding: 8px 6px; font-family: monospace;">
              <input class="input-case1-from-frame" data-track-id="${t.uiId}" type="number" value="${t.firstFrame}" style="width: 48px; background: #09090b; border: 1px solid rgba(255,255,255,0.12); color: white; padding: 3px 5px; border-radius: 4px; font-size: 11px;" />
              <button class="btn-case1-pick-frame" data-track-id="${t.uiId}" style="background: #27272a; border: 1px solid rgba(255,255,255,0.1); color: #d4d4d8; padding: 3px 6px; border-radius: 4px; font-size: 10px; cursor: pointer;">⤵ lấy</button>
            </td>
            <td style="padding: 8px 12px;">
              <button class="btn-case1-apply-single" data-track-id="${t.uiId}" style="background: #2563eb; border: none; color: white; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer;">Áp dụng</button>
              <button class="btn-case1-snap-ground" data-track-id="${t.uiId}" title="Chỉ nâng/hạ box bám mặt đất" style="margin-left: 4px; background: #27272a; border: 1px solid rgba(255,255,255,0.1); color: #2dd4bf; padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer;">⇩ Chạm đất</button>
            </td>
            <td style="padding: 8px 12px; text-align: right;">
              <button class="btn-case1-open-case2" data-track-id="${t.uiId}" style="background: #27272a; border: 1px solid rgba(255,255,255,0.1); color: #a1a1aa; padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer;">Mở Case 2 ➔</button>
            </td>
          </tr>
        `;
      })
      .join("");

    return `
      <!-- Toolbar Case 1 -->
      <div style="background: #141416; border-bottom: 1px solid rgba(255,255,255,0.06); padding: 8px 16px; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
        <div style="display: flex; align-items: center; gap: 12px; font-size: 11px;">
          <label style="display: flex; align-items: center; gap: 6px;">
            <span style="color: #a1a1aa;">Khi đổi kích thước:</span>
            <select id="select-case1-mode" style="background: #09090b; border: 1px solid rgba(255,255,255,0.15); color: #38bdf8; padding: 4px 8px; border-radius: 5px; font-size: 11px; cursor: pointer;">
              <option value="bottom" ${this.case1SizeMode === "bottom" ? "selected" : ""}>Giữ đáy box (khuyên dùng)</option>
              <option value="center" ${this.case1SizeMode === "center" ? "selected" : ""}>Giữ tâm box (giống CVAT)</option>
              <option value="ground" ${this.case1SizeMode === "ground" ? "selected" : ""}>Bám mặt đất theo LiDAR</option>
            </select>
          </label>

          <div style="display: flex; align-items: center; gap: 6px; font-family: monospace;">
            <span style="color: #a1a1aa;">Áp dụng cho frame:</span>
            <input id="input-case1-from" type="number" value="${fromF}" style="width: 50px; background: #09090b; border: 1px solid rgba(255,255,255,0.1); color: white; padding: 3px; border-radius: 4px; text-align: center;" />
            <span style="color: #71717a;">➔</span>
            <input id="input-case1-to" type="number" value="${toF}" style="width: 50px; background: #09090b; border: 1px solid rgba(255,255,255,0.1); color: white; padding: 3px; border-radius: 4px; text-align: center;" />
          </div>
        </div>

        <div style="font-size: 11px; color: #71717a; font-family: monospace;">
          Thay đổi chỉ nằm in-memory cho tới khi bấm "Lưu vào CVAT" (Ctrl+S)
        </div>
      </div>

      <!-- Bảng danh sách các xe trong Job -->
      <div style="flex: 1; overflow: auto; padding: 8px 16px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
          <thead>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.12); color: #a1a1aa; font-weight: 600; font-size: 11px;">
              <th style="padding: 8px 12px;">ID</th>
              <th style="padding: 8px 12px;">Label</th>
              <th style="padding: 8px 12px;">Dải Frame</th>
              <th style="padding: 8px 12px; text-align: center;">Keyframes</th>
              <th style="padding: 8px 12px;">L / W / H (Trung vị)</th>
              <th style="padding: 8px 6px;">L mới</th>
              <th style="padding: 8px 6px;">W mới</th>
              <th style="padding: 8px 6px;">H mới</th>
              <th style="padding: 8px 6px;">Lấy kích thước từ f#</th>
              <th style="padding: 8px 12px;">Thao tác</th>
              <th style="padding: 8px 12px; text-align: right;">Chi tiết</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;
  }

  private attachCase1Listeners(): void {
    if (!this.overlay || !this.store) return;

    // Chọn chế độ đổi kích thước
    const modeSel = this.overlay.querySelector<HTMLSelectElement>("#select-case1-mode");
    if (modeSel) {
      modeSel.addEventListener("change", () => {
        this.case1SizeMode = modeSel.value as any;
      });
    }

    // Nút ⤵ lấy kích thước từ frame
    this.overlay.querySelectorAll<HTMLButtonElement>(".btn-case1-pick-frame").forEach((btn) => {
      btn.addEventListener("click", () => {
        const trackId = parseInt(btn.dataset.trackId || "0", 10);
        const row = btn.closest("tr");
        if (!row) return;

        const frameInp = row.querySelector<HTMLInputElement>(".input-case1-from-frame");
        const f = parseInt(frameInp?.value || "0", 10);

        const track = this.store?.getTrack(trackId);
        if (!track) return;
        const pos = track.at(f);
        if (!pos) return;

        const inpL = row.querySelector<HTMLInputElement>(".input-case1-l");
        const inpW = row.querySelector<HTMLInputElement>(".input-case1-w");
        const inpH = row.querySelector<HTMLInputElement>(".input-case1-h");

        if (inpL) inpL.value = pos.box.s[0].toFixed(2);
        if (inpW) inpW.value = pos.box.s[1].toFixed(2);
        if (inpH) inpH.value = pos.box.s[2].toFixed(2);
      });
    });

    // Nút Áp dụng kích thước cho 1 track
    this.overlay.querySelectorAll<HTMLButtonElement>(".btn-case1-apply-single").forEach((btn) => {
      btn.addEventListener("click", () => {
        const trackId = parseInt(btn.dataset.trackId || "0", 10);
        const row = btn.closest("tr");
        if (!row) return;

        const inpL = row.querySelector<HTMLInputElement>(".input-case1-l");
        const inpW = row.querySelector<HTMLInputElement>(".input-case1-w");
        const inpH = row.querySelector<HTMLInputElement>(".input-case1-h");

        const track = this.store?.getTrack(trackId);
        if (!track) return;

        const sizes = track.shapes.map((s) => s.points.slice(6, 9));
        const medL = this.median(sizes.map((s) => s[0]));
        const medW = this.median(sizes.map((s) => s[1]));
        const medH = this.median(sizes.map((s) => s[2]));

        const newL = parseFloat(inpL?.value || "") || medL;
        const newW = parseFloat(inpW?.value || "") || medW;
        const newH = parseFloat(inpH?.value || "") || medH;

        this.applySizeToTrack(trackId, [newL, newW, newH]);
      });
    });

    // Nút ⇩ Chạm đất (Case 1)
    this.overlay.querySelectorAll<HTMLButtonElement>(".btn-case1-snap-ground").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const trackId = parseInt(btn.dataset.trackId || "0", 10);
        const track = this.store?.getTrack(trackId);
        if (!track) return;
        const pts = await this.ensureSceneLidarPoints();
        if (!pts) return;

        this.store?.snapshot([trackId]);
        const [fromF, toF] = this.case1Range;
        const minF = Math.min(fromF, toF);
        const maxF = Math.max(fromF, toF);

        for (const shape of track.shapes) {
          if (shape.frame >= minF && shape.frame <= maxF && !shape.outside) {
            const curBox = track.at(shape.frame)?.box;
            if (curBox) {
              const snapped = snapToGround(pts, curBox);
              if (snapped) {
                shape.points = boxToPoints(snapped.box, shape.points);
              }
            }
          }
        }
        track.dirty = true;
        this.updateHeaderSaveBadge();
        this.render();
      });
    });

    // Nút Mở Case 2
    this.overlay.querySelectorAll<HTMLButtonElement>(".btn-case1-open-case2").forEach((btn) => {
      btn.addEventListener("click", () => {
        const trackId = parseInt(btn.dataset.trackId || "0", 10);
        this.activeTrackId = trackId;
        this.currentTab = "case2";
        this.render();
      });
    });
  }

  private applySizeToTrack(trackId: number, newSize: [number, number, number]): void {
    if (!this.store) return;
    const track = this.store.getTrack(trackId);
    if (!track) return;

    this.store.snapshot([trackId]);

    const [fromF, toF] = this.case1Range;
    const minF = Math.min(fromF, toF);
    const maxF = Math.max(fromF, toF);

    for (const shape of track.shapes) {
      if (shape.frame >= minF && shape.frame <= maxF) {
        const curBox = cloneBox(track.at(shape.frame)?.box || { c: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] });
        let updatedBox: Box3D;
        if (this.case1SizeMode === "bottom" || this.case1SizeMode === "ground") {
          updatedBox = resizeKeepBottom(curBox, newSize);
          if (this.case1SizeMode === "ground" && this.sceneLidarPoints) {
            const snapped = snapToGround(this.sceneLidarPoints, updatedBox);
            if (snapped) updatedBox = snapped.box;
          }
        } else {
          updatedBox = { ...curBox, s: [newSize[0], newSize[1], newSize[2]] };
        }
        shape.points = boxToPoints(updatedBox, shape.points);
      }
    }

    track.dirty = true;
    this.updateHeaderSaveBadge();
    this.render();
  }

  // =========================================================================
  // GIAO DIỆN & TƯƠNG TÁC TAB CASE 2: DUYỆT THEO ID (BẢNG FRAME CHUYÊN SÂU)
  // =========================================================================

  private renderCase2Html(): string {
    if (!this.store) return "";

    const activeTrack = this.store.getTrack(this.activeTrackId);
    if (!activeTrack) {
      return `<div style="padding: 40px; text-align: center; color: #71717a;">Không tìm thấy track #${this.activeTrackId}</div>`;
    }

    const allTracks = this.store.getAllTracks();
    const idOptions = allTracks
      .map(
        (t) =>
          `<option value="${t.uiId}" ${t.uiId === this.activeTrackId ? "selected" : ""}>
            #${t.uiId} · ${t.labelName} (f${t.firstFrame}➔f${t.lastFrame})
          </option>`
      )
      .join("");

    const [fromF, toF] = this.frameRange;

    // Lọc danh sách frame
    const minF = Math.min(fromF, toF);
    const maxF = Math.max(fromF, toF);
    const framesToRender: number[] = [];
    for (let f = minF; f <= maxF; f++) {
      framesToRender.push(f);
    }

    const rowsHtml = framesToRender
      .map((f) => {
        const pos = activeTrack.at(f);
        if (!pos) return "";

        const p = pos.points;
        const l = p[6].toFixed(2);
        const w = p[7].toFixed(2);
        const h = p[8].toFixed(2);
        const yawDeg = Math.round((p[5] * 180) / Math.PI);
        const z = p[2].toFixed(2);

        return `
          <div class="case2-frame-row" data-frame="${f}" style="
            display: grid;
            grid-template-columns: 190px 200px 1fr 1fr 1fr;
            gap: 8px;
            background: #141416;
            border: 1px solid rgba(255,255,255,0.06);
            border-radius: 6px;
            padding: 6px;
            min-height: ${this.rowHeight}px;
          ">
            <!-- CỘT 1: THÔNG TIN & PARAMS -->
            <div style="display: flex; flex-direction: column; gap: 4px; font-size: 11px;">
              <div style="display: flex; align-items: center; justify-content: space-between;">
                <span style="font-weight: bold; font-family: monospace; color: #f4f4f5;">f${f}</span>
                <span style="
                  font-size: 9px;
                  font-weight: 700;
                  padding: 1px 4px;
                  border-radius: 3px;
                  background: ${pos.outside ? "rgba(234, 88, 12, 0.2)" : pos.keyframe ? "rgba(34, 197, 94, 0.15)" : "#27272a"};
                  color: ${pos.outside ? "#fb923c" : pos.keyframe ? "#22c55e" : "#71717a"};
                ">
                  ${pos.outside ? "OUTSIDE" : pos.keyframe ? "KEYFRAME" : "nội suy"}
                </span>

                <!-- Switch Outside -->
                <button class="btn-toggle-outside" data-frame="${f}" style="
                  border: 1px solid ${pos.outside ? "#d97706" : "rgba(255,255,255,0.1)"};
                  background: ${pos.outside ? "#78350f" : "#18181b"};
                  color: ${pos.outside ? "#fde047" : "#a1a1aa"};
                  font-size: 9px;
                  font-weight: bold;
                  padding: 1px 5px;
                  border-radius: 10px;
                  cursor: pointer;
                ">
                  ${pos.outside ? "● Outside" : "○ Out"}
                </button>
              </div>

              <!-- Inputs L, W, H, Yaw, Z -->
              <div style="display: grid; grid-template-columns: 28px 1fr; gap: 2px 4px; align-items: center; font-family: monospace;">
                <span style="color: #71717a;">L:</span>
                <input class="input-param" data-frame="${f}" data-axis="0" type="number" step="0.02" value="${l}" style="background: #09090b; border: 1px solid rgba(255,255,255,0.1); color: #38bdf8; font-weight: bold; padding: 2px 4px; border-radius: 3px; font-size: 11px;" />

                <span style="color: #71717a;">W:</span>
                <input class="input-param" data-frame="${f}" data-axis="1" type="number" step="0.02" value="${w}" style="background: #09090b; border: 1px solid rgba(255,255,255,0.1); color: #38bdf8; font-weight: bold; padding: 2px 4px; border-radius: 3px; font-size: 11px;" />

                <span style="color: #71717a;">H:</span>
                <input class="input-param" data-frame="${f}" data-axis="2" type="number" step="0.02" value="${h}" style="background: #09090b; border: 1px solid rgba(255,255,255,0.1); color: #38bdf8; font-weight: bold; padding: 2px 4px; border-radius: 3px; font-size: 11px;" />

                <span style="color: #71717a;">Yaw:</span>
                <input class="input-param-yaw" data-frame="${f}" type="number" step="1" value="${yawDeg}" style="background: #09090b; border: 1px solid rgba(255,255,255,0.1); color: #fbbf24; padding: 2px 4px; border-radius: 3px; font-size: 11px;" />

                <span style="color: #71717a;">z:</span>
                <input class="input-param-z" data-frame="${f}" type="number" step="0.02" value="${z}" style="background: #09090b; border: 1px solid rgba(255,255,255,0.1); color: #d4d4d8; padding: 2px 4px; border-radius: 3px; font-size: 11px;" />
              </div>

              <!-- Quick Action Buttons -->
              <div style="display: flex; gap: 4px; margin-top: auto;">
                <button class="btn-snap-ground-frame" data-frame="${f}" title="Nâng/hạ box cho đáy chạm khít mặt đất" style="background: #27272a; border: 1px solid rgba(255,255,255,0.1); color: #2dd4bf; font-size: 9px; padding: 3px 6px; border-radius: 3px; cursor: pointer;">
                  ⇩ Đất
                </button>
                <button class="btn-sync-all-keyframes" data-frame="${f}" title="Áp dụng L/W/H của frame này cho mọi keyframe" style="flex: 1; background: #27272a; border: 1px solid rgba(255,255,255,0.1); color: #6ee7b7; font-size: 9px; padding: 3px; border-radius: 3px; cursor: pointer;">
                  L/W/H ➔ Tất cả
                </button>
                <button class="btn-delete-keyframe" data-frame="${f}" ${!pos.keyframe || activeTrack.keyframeIndex(f) <= 0 ? "disabled" : ""} title="Xóa keyframe này" style="background: #27272a; border: 1px solid rgba(255,255,255,0.1); color: #ef4444; font-size: 9px; padding: 3px 6px; border-radius: 3px; cursor: pointer;">
                  ✕ KF
                </button>
              </div>
            </div>

            <!-- CỘT 2: CAMERA PERSPECTIVE -->
            <div style="background: #09090b; border: 1px solid rgba(255,255,255,0.06); border-radius: 4px; overflow: hidden; display: flex; align-items: center; justify-content: center; position: relative;">
              <canvas class="canvas-cam-view" data-frame="${f}" width="200" height="${this.rowHeight - 12}" style="width: 100%; height: 100%; display: block;"></canvas>
              <span style="position: absolute; top: 4px; left: 4px; font-size: 9px; font-family: monospace; color: #a1a1aa; background: rgba(0,0,0,0.6); padding: 1px 4px; border-radius: 3px;">Camera</span>
            </div>

            <!-- CỘT 3: TOP VIEW (XY) -->
            <div style="background: #09090b; border: 1px solid rgba(255,255,255,0.06); border-radius: 4px; overflow: hidden; position: relative;" class="cell-wrapper" data-frame="${f}" data-view="top">
              <canvas class="canvas-ortho-interactive" data-frame="${f}" data-view="top" style="width: 100%; height: 100%; display: block; touch-action: none; cursor: grab;"></canvas>
              <div class="cell-tools" style="position: absolute; top: 4px; right: 4px; display: flex; gap: 4px;">
                <button class="btn-big-view" data-frame="${f}" data-view="top" title="Phóng to toàn cảnh ~40m để sửa" style="background: rgba(24,24,27,0.85); border: 1px solid rgba(255,255,255,0.2); color: #f4f4f5; font-size: 10px; padding: 2px 5px; border-radius: 3px; cursor: pointer;">⛶</button>
              </div>
            </div>

            <!-- CỘT 4: SIDE VIEW (XZ) -->
            <div style="background: #09090b; border: 1px solid rgba(255,255,255,0.06); border-radius: 4px; overflow: hidden; position: relative;" class="cell-wrapper" data-frame="${f}" data-view="side">
              <canvas class="canvas-ortho-interactive" data-frame="${f}" data-view="side" style="width: 100%; height: 100%; display: block; touch-action: none; cursor: grab;"></canvas>
              <div class="cell-tools" style="position: absolute; top: 4px; right: 4px; display: flex; gap: 4px;">
                <button class="btn-big-view" data-frame="${f}" data-view="side" title="Phóng to toàn cảnh ~40m để sửa" style="background: rgba(24,24,27,0.85); border: 1px solid rgba(255,255,255,0.2); color: #f4f4f5; font-size: 10px; padding: 2px 5px; border-radius: 3px; cursor: pointer;">⛶</button>
              </div>
            </div>

            <!-- CỘT 5: FRONT VIEW (YZ) -->
            <div style="background: #09090b; border: 1px solid rgba(255,255,255,0.06); border-radius: 4px; overflow: hidden; position: relative;" class="cell-wrapper" data-frame="${f}" data-view="front">
              <canvas class="canvas-ortho-interactive" data-frame="${f}" data-view="front" style="width: 100%; height: 100%; display: block; touch-action: none; cursor: grab;"></canvas>
              <div class="cell-tools" style="position: absolute; top: 4px; right: 4px; display: flex; gap: 4px;">
                <button class="btn-big-view" data-frame="${f}" data-view="front" title="Phóng to toàn cảnh ~40m để sửa" style="background: rgba(24,24,27,0.85); border: 1px solid rgba(255,255,255,0.2); color: #f4f4f5; font-size: 10px; padding: 2px 5px; border-radius: 3px; cursor: pointer;">⛶</button>
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    return `
      <!-- Toolbar Case 2 -->
      <div style="
        background: #141416;
        border-bottom: 1px solid rgba(255,255,255,0.06);
        padding: 6px 16px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      ">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <!-- Select ID -->
            <div style="display: flex; align-items: center; gap: 4px;">
              <span style="font-size: 11px; font-weight: bold; color: #a1a1aa;">ID:</span>
              <select id="select-case2-id" style="background: #09090b; border: 1px solid rgba(255,255,255,0.15); color: #38bdf8; font-size: 11px; font-weight: bold; padding: 4px 8px; border-radius: 6px; cursor: pointer;">
                ${idOptions}
              </select>
            </div>

            <!-- Frame Range Filter -->
            <div style="display: flex; align-items: center; gap: 4px; font-size: 11px; font-family: monospace;">
              <span style="color: #71717a;">Frame</span>
              <input id="input-case2-start" type="number" value="${minF}" style="width: 45px; background: #09090b; border: 1px solid rgba(255,255,255,0.1); color: white; padding: 3px; border-radius: 4px; text-align: center;" />
              <span style="color: #71717a;">➔</span>
              <input id="input-case2-end" type="number" value="${maxF}" style="width: 45px; background: #09090b; border: 1px solid rgba(255,255,255,0.1); color: white; padding: 3px; border-radius: 4px; text-align: center;" />
              <button id="btn-case2-apply-range" style="background: #27272a; border: 1px solid rgba(255,255,255,0.1); color: #d4d4d8; padding: 3px 8px; border-radius: 4px; cursor: pointer;">Hiện</button>
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 10px; font-size: 11px;">
            <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
              <input type="checkbox" id="chk-sync-lwh-track" ${this.syncLwhAll ? "checked" : ""} />
              <span style="color: #6ee7b7; font-weight: 500;">Đồng bộ L/W/H cả track</span>
            </label>

            <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
              <input type="checkbox" id="chk-context-mode" ${this.isContextMode ? "checked" : ""} />
              <span style="color: #a1a1aa;">Hiện xung quanh</span>
            </label>

            <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
              <input type="checkbox" id="chk-hide-ground-top" ${this.hideGroundTop ? "checked" : ""} />
              <span style="color: #a1a1aa;">Top: ẩn mặt đất</span>
            </label>

            <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
              <input type="checkbox" id="chk-allow-tilt" ${this.allowTilt ? "checked" : ""} />
              <span style="color: #a1a1aa;">Cho xoay pitch/roll</span>
            </label>

            <div style="display: flex; align-items: center; gap: 4px; font-family: monospace;">
              <span style="color: #71717a;">Cao dòng:</span>
              <input id="input-case2-row-h" type="number" step="10" value="${this.rowHeight}" style="width: 50px; background: #09090b; border: 1px solid rgba(255,255,255,0.1); color: white; padding: 2px 4px; border-radius: 4px; text-align: center;" />
            </div>

            <button id="btn-case2-fit-zoom" title="Đặt lại zoom vừa vặn cho mọi ô" style="background: #27272a; border: 1px solid rgba(255,255,255,0.1); color: #d4d4d8; padding: 3px 8px; border-radius: 4px; cursor: pointer;">Fit</button>
          </div>
        </div>

        <!-- Cheat-Sheet -->
        <div style="font-size: 10px; color: #71717a; font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          Kéo thân = Di chuyển · Kéo góc đỏ = 2 chiều · Kéo cạnh trắng = 1 chiều · Chấm vàng = Xoay (Shift: 5°) · Cuộn = Zoom ô (Shift+cuộn = tất cả) · Kéo nền trống = Dời · O = Outside · ⛶ = Phóng to · Ctrl+S = Lưu CVAT
        </div>
      </div>

      <!-- Header Cột Bảng -->
      <div style="
        background: #09090b;
        border-bottom: 1px solid rgba(255,255,255,0.08);
        padding: 4px 16px;
        display: grid;
        grid-template-columns: 190px 200px 1fr 1fr 1fr;
        gap: 8px;
        font-size: 11px;
        font-weight: 600;
        color: #a1a1aa;
      ">
        <div>Frame & Thông số</div>
        <div>Camera</div>
        <div>Top View (XY)</div>
        <div>Side View (XZ)</div>
        <div>Front View (YZ)</div>
      </div>

      <!-- Container Danh sách các dòng Frame -->
      <div id="case2-rows-scroller" style="
        flex: 1;
        overflow-y: auto;
        padding: 6px 16px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        background: #09090b;
      ">
        ${rowsHtml}
      </div>
    `;
  }

  // =========================================================================
  // GẮN SỰ KIỆN TƯƠNG TÁC CHUỘT TRỰC TIẾP TRÊN CANVAS
  // =========================================================================

  private attachHeaderListeners(): void {
    if (!this.overlay) return;

    this.overlay.querySelector("#tab-btn-case1")?.addEventListener("click", () => {
      this.currentTab = "case1";
      this.render();
    });

    this.overlay.querySelector("#tab-btn-case2")?.addEventListener("click", () => {
      this.currentTab = "case2";
      this.render();
    });

    this.overlay.querySelector("#btn-modal-undo")?.addEventListener("click", () => this.triggerUndo());
    this.overlay.querySelector("#btn-modal-redo")?.addEventListener("click", () => this.triggerRedo());
    this.overlay.querySelector("#btn-modal-commit-save")?.addEventListener("click", () => this.triggerCommitSave());
    this.overlay.querySelector("#btn-modal-reload")?.addEventListener("click", () => this.loadInitialData());
    this.overlay.querySelector("#btn-modal-close")?.addEventListener("click", () => this.close());
  }

  private attachCase2Listeners(): void {
    if (!this.overlay || !this.store) return;

    // Chọn ID xe khác
    const idSel = this.overlay.querySelector<HTMLSelectElement>("#select-case2-id");
    if (idSel) {
      idSel.addEventListener("change", () => {
        const newId = parseInt(idSel.value, 10);
        const t = this.store?.getTrack(newId);
        if (t) {
          this.activeTrackId = newId;
          this.frameRange = [t.firstFrame, t.lastFrame];
          this.render();
        }
      });
    }

    // Lọc dải Frame
    this.overlay.querySelector("#btn-case2-apply-range")?.addEventListener("click", () => {
      const s = parseInt((this.overlay?.querySelector("#input-case2-start") as HTMLInputElement)?.value || "0", 10);
      const e = parseInt((this.overlay?.querySelector("#input-case2-end") as HTMLInputElement)?.value || "0", 10);
      this.frameRange = [s, e];
      this.render();
    });

    // Checkbox đồng bộ cả track
    this.overlay.querySelector("#chk-sync-lwh-track")?.addEventListener("change", (e: any) => {
      this.syncLwhAll = e.target.checked;
    });

    // Checkbox hiện xung quanh
    this.overlay.querySelector("#chk-context-mode")?.addEventListener("change", (e: any) => {
      this.isContextMode = e.target.checked;
      this.renderAllCase2Canvases();
    });

    // Checkbox Top ẩn mặt đất
    this.overlay.querySelector("#chk-hide-ground-top")?.addEventListener("change", (e: any) => {
      this.hideGroundTop = e.target.checked;
      this.renderAllCase2Canvases();
    });

    // Checkbox cho xoay pitch/roll
    this.overlay.querySelector("#chk-allow-tilt")?.addEventListener("change", (e: any) => {
      this.allowTilt = e.target.checked;
    });

    // Cao dòng
    this.overlay.querySelector("#input-case2-row-h")?.addEventListener("change", (e: any) => {
      this.rowHeight = parseInt(e.target.value, 10) || 230;
      this.render();
    });

    // Nút Fit Zoom
    this.overlay.querySelector("#btn-case2-fit-zoom")?.addEventListener("click", () => {
      this.globalZoom = { top: 1, side: 1, front: 1 };
      for (const cell of this.cells.values()) {
        cell.zoom = 1;
        cell.pan = [0, 0];
      }
      this.renderAllCase2Canvases();
    });

    // Gắn sự kiện cho từng dòng Frame
    this.overlay.querySelectorAll<HTMLButtonElement>(".btn-toggle-outside").forEach((btn) => {
      btn.addEventListener("click", () => {
        const f = parseInt(btn.dataset.frame || "0", 10);
        this.toggleOutside(f);
      });
    });

    // Nút L/W/H ➔ Tất cả
    this.overlay.querySelectorAll<HTMLButtonElement>(".btn-sync-all-keyframes").forEach((btn) => {
      btn.addEventListener("click", () => {
        const f = parseInt(btn.dataset.frame || "0", 10);
        const track = this.store?.getTrack(this.activeTrackId);
        const pos = track?.at(f);
        if (pos) {
          this.applySizeToTrack(this.activeTrackId, [pos.box.s[0], pos.box.s[1], pos.box.s[2]]);
        }
      });
    });

    // Nút ✕ KF (xóa keyframe)
    this.overlay.querySelectorAll<HTMLButtonElement>(".btn-delete-keyframe").forEach((btn) => {
      btn.addEventListener("click", () => {
        const f = parseInt(btn.dataset.frame || "0", 10);
        const track = this.store?.getTrack(this.activeTrackId);
        if (track) {
          this.store?.snapshot([this.activeTrackId]);
          track.deleteKeyframe(f);
          this.render();
        }
      });
    });

    // Nút ⇩ Đất (Case 2: Ghim đáy xe bám sát mặt đất tức thì)
    this.overlay.querySelectorAll<HTMLButtonElement>(".btn-snap-ground-frame").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const f = parseInt(btn.dataset.frame || "0", 10);
        const track = this.store?.getTrack(this.activeTrackId);
        const pos = track?.at(f);
        if (!track || !pos) return;
        const pts = await this.ensureSceneLidarPoints();
        if (!pts) return;

        this.store?.snapshot([this.activeTrackId]);
        const snapped = snapToGround(pts, pos.box);
        if (snapped) {
          track.setBox(f, snapped.box);
          track.dirty = true;
          this.updateHeaderSaveBadge();
          this.render();
        }
      });
    });

    // Nhập tham số L, W, H trên từng dòng frame (Đổi H giữ nguyên đáy xe tuyệt đối)
    this.overlay.querySelectorAll<HTMLInputElement>(".input-param").forEach((inp) => {
      inp.addEventListener("change", () => {
        const f = parseInt(inp.dataset.frame || "0", 10);
        const axis = parseInt(inp.dataset.axis || "0", 10);
        const val = parseFloat(inp.value);
        if (isNaN(val) || val <= 0) return;

        const track = this.store?.getTrack(this.activeTrackId);
        const pos = track?.at(f);
        if (!track || !pos) return;

        this.store?.snapshot([this.activeTrackId]);
        const curBox = cloneBox(pos.box);

        if (axis === 2) {
          // Đổi H: BẮT BUỘC GIỮ NGUYÊN MẶT ĐÁY XE!
          const updatedBox = resizeKeepBottom(curBox, [curBox.s[0], curBox.s[1], val]);
          track.setBox(f, updatedBox);

          if (this.syncLwhAll) {
            for (const sh of track.shapes) {
              if (sh.frame !== f) {
                const shPos = track.at(sh.frame);
                if (shPos) {
                  const shBox = resizeKeepBottom(shPos.box, [curBox.s[0], curBox.s[1], val]);
                  sh.points = boxToPoints(shBox, sh.points);
                }
              }
            }
          }
        } else {
          curBox.s[axis] = val;
          track.setBox(f, curBox);

          if (this.syncLwhAll) {
            for (const sh of track.shapes) {
              if (sh.frame !== f) {
                const shPos = track.at(sh.frame);
                if (shPos) {
                  const s = [...shPos.box.s];
                  s[axis] = val;
                  const shBox = { ...shPos.box, s: [s[0], s[1], s[2]] };
                  sh.points = boxToPoints(shBox as any, sh.points);
                }
              }
            }
          }
        }

        track.dirty = true;
        this.updateHeaderSaveBadge();
        this.render();
      });
    });

    // Nhập góc Yaw trên từng dòng frame
    this.overlay.querySelectorAll<HTMLInputElement>(".input-param-yaw").forEach((inp) => {
      inp.addEventListener("change", () => {
        const f = parseInt(inp.dataset.frame || "0", 10);
        const valDeg = parseFloat(inp.value);
        if (isNaN(valDeg)) return;
        const track = this.store?.getTrack(this.activeTrackId);
        const pos = track?.at(f);
        if (!track || !pos) return;

        this.store?.snapshot([this.activeTrackId]);
        const curBox = cloneBox(pos.box);
        curBox.r[2] = (valDeg * Math.PI) / 180;
        track.setBox(f, curBox);
        track.dirty = true;
        this.updateHeaderSaveBadge();
        this.render();
      });
    });

    // Nhập cao độ Z trên từng dòng frame
    this.overlay.querySelectorAll<HTMLInputElement>(".input-param-z").forEach((inp) => {
      inp.addEventListener("change", () => {
        const f = parseInt(inp.dataset.frame || "0", 10);
        const valZ = parseFloat(inp.value);
        if (isNaN(valZ)) return;
        const track = this.store?.getTrack(this.activeTrackId);
        const pos = track?.at(f);
        if (!track || !pos) return;

        this.store?.snapshot([this.activeTrackId]);
        const curBox = cloneBox(pos.box);
        curBox.c[2] = valZ;
        track.setBox(f, curBox);
        track.dirty = true;
        this.updateHeaderSaveBadge();
        this.render();
      });
    });

    // Nút ⛶ (Big View phóng to)
    this.overlay.querySelectorAll<HTMLButtonElement>(".btn-big-view").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const f = parseInt(btn.dataset.frame || "0", 10);
        const v = btn.dataset.view as OrthoViewType;
        this.openBigView(f, v);
      });
    });

    // Gắn sự kiện chuột tương tác trên từng Canvas
    this.overlay.querySelectorAll<HTMLCanvasElement>(".canvas-ortho-interactive").forEach((canvas) => {
      const f = parseInt(canvas.dataset.frame || "0", 10);
      const v = canvas.dataset.view as OrthoViewType;
      const key = `${f}_${v}`;

      let cell = this.cells.get(key);
      if (!cell) {
        cell = { canvas, frame: f, view: v, zoom: 1, pan: [0, 0] };
        this.cells.set(key, cell);
      } else {
        cell.canvas = canvas;
      }

      canvas.addEventListener("pointerdown", (e) => this.handlePointerDown(e, cell!));
      canvas.addEventListener("wheel", (e) => this.handleWheel(e, cell!), { passive: false });
      canvas.addEventListener("dblclick", () => {
        cell!.zoom = 1;
        cell!.pan = [0, 0];
        this.renderCell(cell!);
      });
    });
  }

  private handlePointerDown(e: PointerEvent, cell: ViewCellState): void {
    if (e.button !== 0 && e.button !== 1) return;
    const track = this.store?.getTrack(this.activeTrackId);
    const pos = track?.at(cell.frame);
    if (!pos || pos.outside) return;

    const rect = cell.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const refSize: [number, number, number] = [pos.box.s[0], pos.box.s[1], pos.box.s[2]];
    const ppm = OrthoInteractionEngine.calculatePpm(
      cell,
      rect.width,
      rect.height,
      refSize,
      this.globalZoom,
      this.isContextMode
    );

    const hit = OrthoInteractionEngine.hitTest(
      mx,
      my,
      cell,
      pos.box,
      { w: rect.width, h: rect.height },
      ppm,
      this.allowTilt
    );

    if (e.button === 1 || !hit) {
      // Bấm chuột giữa hoặc bấm ngoài vùng hit -> Kéo Pan khung nhìn
      this.startPanDrag(e, cell);
      return;
    }

    e.preventDefault();
    cell.canvas.setPointerCapture(e.pointerId);

    // Lưu snapshot trước khi kéo để có thể Undo
    this.store?.snapshot([this.activeTrackId]);

    const cam = OrthoInteractionEngine.getCamera(cell, pos.box);
    const p0 = OrthoInteractionEngine.unproject(
      mx,
      my,
      cam,
      cell.view,
      { w: rect.width, h: rect.height },
      ppm
    );
    const center = OrthoInteractionEngine.project(
      pos.box.c,
      cam,
      cell.view,
      { w: rect.width, h: rect.height },
      ppm
    );
    const ang0 = Math.atan2(-(my - center[1]), mx - center[0]);

    this.activeDrag = {
      cell,
      kind: hit.kind,
      a: hit.a,
      b: hit.b,
      startBox: cloneBox(pos.box),
      cam,
      rect: { w: rect.width, h: rect.height },
      ppm,
      p0,
      ang0,
      moved: false,
    };
  }

  private handlePointerMove(e: PointerEvent): void {
    if (!this.activeDrag) return;

    const { cell } = this.activeDrag;
    const rect = cell.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const updatedBox = OrthoInteractionEngine.computeDragUpdate(
      this.activeDrag,
      mx,
      my,
      e.shiftKey
    );

    this.activeDrag.moved = true;

    // Cập nhật vào store
    const track = this.store?.getTrack(this.activeTrackId);
    if (track) {
      track.setBox(cell.frame, updatedBox);

      // Nếu bật đồng bộ cả track và có thay đổi kích thước
      if (this.syncLwhAll && this.activeDrag.kind === "resize") {
        for (const sh of track.shapes) {
          if (sh.frame !== cell.frame) {
            const b = track.at(sh.frame)?.box;
            if (b) {
              const rb = resizeKeepBottom(b, updatedBox.s);
              sh.points = boxToPoints(rb, sh.points);
            }
          }
        }
      }

      // Two-Way Live Sync sang Three.js Canvas native của CVAT
      CVATBridge.updateLiveBox(
        this.store!.jobId,
        cell.frame,
        this.activeTrackId,
        track.serverId,
        boxToPoints(updatedBox),
        false
      );

      // Vẽ lại tất cả các ô của frame này
      this.renderFrameCanvases(cell.frame);
    }
  }

  private handlePointerUp(_e: PointerEvent): void {
    if (!this.activeDrag) return;

    const { cell, moved } = this.activeDrag;
    this.activeDrag = null;

    if (moved) {
      const track = this.store?.getTrack(this.activeTrackId);
      const pos = track?.at(cell.frame);
      if (pos && this.store) {
        // Ghi nhận hoàn tất thao tác vào in-memory CVAT
        CVATBridge.updateLiveBox(
          this.store.jobId,
          cell.frame,
          this.activeTrackId,
          track?.serverId || null,
          pos.points,
          true
        );
      }
      this.updateHeaderSaveBadge();
    }
  }

  private startPanDrag(e: PointerEvent, cell: ViewCellState): void {
    e.preventDefault();
    cell.canvas.setPointerCapture(e.pointerId);
    let lx = e.clientX;
    let ly = e.clientY;

    const move = (ev: PointerEvent) => {
      cell.pan[0] += ev.clientX - lx;
      cell.pan[1] += ev.clientY - ly;
      lx = ev.clientX;
      ly = ev.clientY;
      this.renderCell(cell);
    };

    const up = () => {
      cell.canvas.removeEventListener("pointermove", move);
      cell.canvas.removeEventListener("pointerup", up);
      cell.canvas.removeEventListener("pointercancel", up);
    };

    cell.canvas.addEventListener("pointermove", move);
    cell.canvas.addEventListener("pointerup", up);
    cell.canvas.addEventListener("pointercancel", up);
  }

  private handleWheel(e: WheelEvent, cell: ViewCellState): void {
    e.preventDefault();
    e.stopPropagation();

    const delta = e.deltaY || e.deltaX;
    if (!delta) return;
    const factor = delta < 0 ? 1.15 : 1 / 1.15;

    if (e.shiftKey) {
      // Shift + cuộn: Zoom đồng bộ toàn bộ ô cùng loại view
      this.globalZoom[cell.view] = Math.min(
        20,
        Math.max(0.2, (this.globalZoom[cell.view] || 1) * factor)
      );
      this.renderAllCase2Canvases();
      return;
    }

    // Cuộn thường: Zoom quanh vị trí con trỏ chuột trong ô
    const rect = cell.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const newZoom = Math.min(25, Math.max(0.1, cell.zoom * factor));
    const k = newZoom / cell.zoom;
    cell.pan[0] = mx - rect.width / 2 - (mx - rect.width / 2 - cell.pan[0]) * k;
    cell.pan[1] = my - rect.height / 2 - (my - rect.height / 2 - cell.pan[1]) * k;
    cell.zoom = newZoom;

    this.renderCell(cell);
  }

  // =========================================================================
  // VẼ CANVAS TRỰC GIAO (POINT CLOUD & 3D CUBOID VỚI TAY CẦM)
  // =========================================================================

  private renderAllCase2Canvases(): void {
    for (const cell of this.cells.values()) {
      this.renderCell(cell);
    }
  }

  private renderFrameCanvases(frame: number): void {
    for (const cell of this.cells.values()) {
      if (cell.frame === frame) {
        this.renderCell(cell);
      }
    }
  }

  private renderCell(cell: ViewCellState): void {
    const ctx = cell.canvas.getContext("2d");
    if (!ctx) return;

    const rect = cell.canvas.getBoundingClientRect();
    const w = (cell.canvas.width = rect.width > 0 ? rect.width : 220);
    const h = (cell.canvas.height = rect.height > 0 ? rect.height : this.rowHeight - 12);

    ctx.fillStyle = "#09090b";
    ctx.fillRect(0, 0, w, h);

    const track = this.store?.getTrack(this.activeTrackId);
    const pos = track?.at(cell.frame);
    if (!pos) return;

    const refSize: [number, number, number] = [pos.box.s[0], pos.box.s[1], pos.box.s[2]];
    const ppm = OrthoInteractionEngine.calculatePpm(
      cell,
      w,
      h,
      refSize,
      this.globalZoom,
      this.isContextMode
    );
    const cam = OrthoInteractionEngine.getCamera(cell, pos.box);

    // 1. Vẽ các điểm Point Cloud LiDAR
    this.drawLidarPoints(ctx, cell, pos.box, cam, { w, h }, ppm);

    // 2. Vẽ 3D Bounding Box
    this.drawBoundingBox(ctx, cell, pos, cam, { w, h }, ppm);
  }

  private drawLidarPoints(
    ctx: CanvasRenderingContext2D,
    cell: ViewCellState,
    box: Box3D,
    cam: any,
    rect: { w: number; h: number },
    ppm: number
  ): void {
    const pts = this.sceneLidarPoints;
    const V = VIEWS_DEF[cell.view];
    const ax = cam.ax;
    const c = box.c;
    const half = [box.s[0] / 2 + 0.03, box.s[1] / 2 + 0.03, box.s[2] / 2 + 0.03];

    if (pts && pts.length > 0) {
      const totalPoints = pts.length / 3;
      const slab = this.slabThickness;
      const hd = cam.half[V.di];

      for (let i = 0; i < totalPoints; i++) {
        const px = pts[i * 3];
        const py = pts[i * 3 + 1];
        const pz = pts[i * 3 + 2];

        // Lọc lát cắt theo chiều sâu
        const dx = px - cam.c[0];
        const dy = py - cam.c[1];
        const dz = pz - cam.c[2];
        const depth = dx * cam.ax[V.d][0] + dy * cam.ax[V.d][1] + dz * cam.ax[V.d][2];

        if (cell.view === "top") {
          if (this.hideGroundTop && dz < -half[2] + 0.12) continue;
        } else {
          if (depth < -hd - slab || depth > hd + slab) continue;
        }

        // Tọa độ màn hình
        const screenP = OrthoInteractionEngine.project([px, py, pz], cam, cell.view, rect, ppm);
        if (
          screenP[0] < -10 ||
          screenP[0] > rect.w + 10 ||
          screenP[1] < -10 ||
          screenP[1] > rect.h + 10
        ) {
          continue;
        }

        // Kiểm tra xem điểm có nằm trong hộp cuboid hay không
        const bx = px - c[0];
        const by = py - c[1];
        const bz = pz - c[2];
        const qx = Math.abs(bx * ax.ex[0] + by * ax.ex[1] + bz * ax.ex[2]);
        const qy = Math.abs(bx * ax.ey[0] + by * ax.ey[1] + bz * ax.ey[2]);
        const qz = Math.abs(bx * ax.ez[0] + by * ax.ez[1] + bz * ax.ez[2]);

        const isInside = qx <= half[0] && qy <= half[1] && qz <= half[2];

        ctx.fillStyle = isInside ? "#38bdf8" : "rgba(161, 161, 170, 0.4)";
        ctx.fillRect(screenP[0] - 1, screenP[1] - 1, this.pointSize, this.pointSize);
      }
    }
  }

  /**
   * Đảm bảo luôn có điểm LiDAR sẵn sàng trong bộ nhớ RAM, nếu chưa có thì tải ngay tức thì
   */
  private async ensureSceneLidarPoints(): Promise<Float32Array | null> {
    if (this.sceneLidarPoints && this.sceneLidarPoints.length > 0) {
      return this.sceneLidarPoints;
    }
    try {
      const raw = await CVATBridge.getLidarPointsFromScene();
      if (raw && raw.length > 0) {
        this.sceneLidarPoints = new Float32Array(raw);
        return this.sceneLidarPoints;
      }
    } catch (e) {
      console.warn("[CVAT 3D Suite] Tải điểm LiDAR:", e);
    }
    return null;
  }

  /**
   * Tính toán 8 góc của cuboid một cách phòng vệ 100% (Defensive Programming),
   * chống triệt để mọi lỗi 'boxCorners is not defined' do lệch scope/hoisting.
   */
  private getBoxCorners(box: Box3D): Array<[number, number, number]> {
    try {
      if (typeof boxCorners === "function") {
        return boxCorners(box);
      }
    } catch (e) {}

    const ax = axes(box.r);
    const [hx, hy, hz] = box.s.map((v) => v / 2);
    const out: Array<[number, number, number]> = [];
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          out.push(localToWorld([sx * hx, sy * hy, sz * hz], box.c, ax));
        }
      }
    }
    return out;
  }

  private drawBoundingBox(
    ctx: CanvasRenderingContext2D,
    cell: ViewCellState,
    pos: any,
    cam: any,
    rect: { w: number; h: number },
    ppm: number
  ): void {
    const box = pos.box;
    const corners = this.getBoxCorners(box).map((p: [number, number, number]) =>
      OrthoInteractionEngine.project(p, cam, cell.view, rect, ppm)
    );

    const isKf = pos.keyframe;
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = pos.outside ? "#71717a" : "#38bdf8";
    ctx.setLineDash(isKf ? [] : [4, 4]);

    const edges =
      typeof BOX_EDGES !== "undefined" && Array.isArray(BOX_EDGES)
        ? BOX_EDGES
        : [
            [0, 1], [2, 3], [4, 5], [6, 7],
            [0, 2], [1, 3], [4, 6], [5, 7],
            [0, 4], [1, 5], [2, 6], [3, 7],
          ];

    ctx.beginPath();
    for (const [i, j] of edges) {
      ctx.moveTo(corners[i][0], corners[i][1]);
      ctx.lineTo(corners[j][0], corners[j][1]);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Nếu là Outside thì dừng lại, không vẽ tay cầm
    if (pos.outside) return;

    const hs = OrthoInteractionEngine.calculateHandles(box, cam, cell.view, rect, ppm);

    // 1. Top View: Vẽ hướng đầu xe (đỏ)
    if (cell.view === "top") {
      const front = hs.P(1, 0);
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(hs.center[0], hs.center[1]);
      ctx.lineTo(front[0], front[1]);
      ctx.stroke();
    }

    // 2. Chấm vàng xoay (Rotate Handle)
    const canRotate = cell.view === "top" || this.allowTilt;
    if (canRotate) {
      ctx.strokeStyle = "#38bdf8";
      ctx.beginPath();
      ctx.moveTo(hs.top[0], hs.top[1]);
      ctx.lineTo(hs.rot[0], hs.rot[1]);
      ctx.stroke();

      ctx.fillStyle = "#fbbf24"; // vàng rực
      ctx.beginPath();
      ctx.arc(hs.rot[0], hs.rot[1], 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 3. 4 góc đỏ (đổi 2 chiều) và 4 ô vuông trắng giữa cạnh (đổi 1 chiều)
    for (const hd of hs.list) {
      const isCorner = hd.a !== 0 && hd.b !== 0;
      ctx.fillStyle = isCorner ? "#ef4444" : "#ffffff";
      ctx.fillRect(hd.p[0] - 3, hd.p[1] - 3, 6, 6);
      ctx.strokeStyle = "#09090b";
      ctx.lineWidth = 1;
      ctx.strokeRect(hd.p[0] - 3, hd.p[1] - 3, 6, 6);
    }
  }

  // =========================================================================
  // BIG VIEW MODAL (PHÓNG TO TOÀN CẢNH ~40M)
  // =========================================================================

  private openBigView(frame: number, view: OrthoViewType): void {
    if (this.bigViewModal) this.closeBigView();

    const track = this.store?.getTrack(this.activeTrackId);
    if (!track) return;

    this.bigViewModal = document.createElement("div");
    this.bigViewModal.style.position = "fixed";
    this.bigViewModal.style.inset = "0";
    this.bigViewModal.style.zIndex = "1000000";
    this.bigViewModal.style.background = "rgba(0, 0, 0, 0.88)";
    this.bigViewModal.style.display = "flex";
    this.bigViewModal.style.flexDirection = "column";
    this.bigViewModal.style.padding = "16px";
    this.bigViewModal.style.gap = "8px";

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.justifyContent = "space-between";
    header.style.background = "#18181b";
    header.style.border = "1px solid rgba(255,255,255,0.1)";
    header.style.padding = "8px 16px";
    header.style.borderRadius = "8px";

    header.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        <span style="font-weight: bold; color: #38bdf8;">Toàn cảnh #${track.uiId} · ${view.toUpperCase()}</span>
        <button id="btn-big-prev-frame" style="background: #27272a; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">◀ f${frame - 1}</button>
        <span id="lbl-big-frame" style="font-family: monospace; font-weight: bold;">f${frame}</span>
        <button id="btn-big-next-frame" style="background: #27272a; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">f${frame + 1} ▶</button>
      </div>

      <div style="display: flex; align-items: center; gap: 8px;">
        <button id="btn-big-reset" style="background: #27272a; color: #d4d4d8; border: 1px solid rgba(255,255,255,0.1); padding: 4px 10px; border-radius: 4px; cursor: pointer;">Vừa khung</button>
        <button id="btn-big-close" style="background: #ef4444; color: white; border: none; padding: 4px 12px; border-radius: 4px; font-weight: bold; cursor: pointer;">✕ Đóng</button>
      </div>
    `;

    const canvasContainer = document.createElement("div");
    canvasContainer.style.flex = "1";
    canvasContainer.style.minHeight = "0";
    canvasContainer.style.background = "#050608";
    canvasContainer.style.borderRadius = "8px";
    canvasContainer.style.overflow = "hidden";
    canvasContainer.style.position = "relative";

    const bigCanvas = document.createElement("canvas");
    bigCanvas.style.width = "100%";
    bigCanvas.style.height = "100%";
    bigCanvas.style.display = "block";
    bigCanvas.style.touchAction = "none";
    bigCanvas.style.cursor = "grab";
    canvasContainer.appendChild(bigCanvas);

    this.bigViewModal.appendChild(header);
    this.bigViewModal.appendChild(canvasContainer);
    document.body.appendChild(this.bigViewModal);

    this.bigViewCell = { canvas: bigCanvas, frame, view, zoom: 1.8, pan: [0, 0] };

    // Sự kiện Big View
    header.querySelector("#btn-big-close")?.addEventListener("click", () => this.closeBigView());
    header.querySelector("#btn-big-reset")?.addEventListener("click", () => {
      if (this.bigViewCell) {
        this.bigViewCell.zoom = 1.8;
        this.bigViewCell.pan = [0, 0];
        this.renderCell(this.bigViewCell);
      }
    });

    header.querySelector("#btn-big-prev-frame")?.addEventListener("click", () => {
      if (this.bigViewCell && this.bigViewCell.frame > 0) {
        this.bigViewCell.frame--;
        header.querySelector("#lbl-big-frame")!.textContent = `f${this.bigViewCell.frame}`;
        this.renderCell(this.bigViewCell);
      }
    });

    header.querySelector("#btn-big-next-frame")?.addEventListener("click", () => {
      if (this.bigViewCell) {
        this.bigViewCell.frame++;
        header.querySelector("#lbl-big-frame")!.textContent = `f${this.bigViewCell.frame}`;
        this.renderCell(this.bigViewCell);
      }
    });

    bigCanvas.addEventListener("pointerdown", (e) => {
      if (this.bigViewCell) this.handlePointerDown(e, this.bigViewCell);
    });
    bigCanvas.addEventListener("wheel", (e) => {
      if (this.bigViewCell) this.handleWheel(e, this.bigViewCell);
    }, { passive: false });

    requestAnimationFrame(() => {
      if (this.bigViewCell) this.renderCell(this.bigViewCell);
    });
  }

  private closeBigView(): void {
    if (this.bigViewModal) {
      this.bigViewModal.remove();
      this.bigViewModal = null;
      this.bigViewCell = null;
    }
  }

  // =========================================================================
  // CÁC HÀM XỬ LÝ NGIỆP VỤ & AN TOÀN DỮ LIỆU
  // =========================================================================

  private toggleOutside(frame: number): void {
    const track = this.store?.getTrack(this.activeTrackId);
    if (!track) return;
    const pos = track.at(frame);
    if (!pos) return;

    this.store?.snapshot([this.activeTrackId]);
    track.setOutside(frame, !pos.outside);
    this.render();
  }

  private toggleOutsideCurrentRow(): void {
    this.toggleOutside(this.frameRange[0]);
  }

  private triggerUndo(): void {
    if (this.store && this.store.undo()) {
      this.render();
      this.updateHeaderSaveBadge();
    }
  }

  private triggerRedo(): void {
    if (this.store && this.store.redo()) {
      this.render();
      this.updateHeaderSaveBadge();
    }
  }

  private async triggerCommitSave(): Promise<void> {
    if (!this.currentCtx?.jobId || !this.store) return;

    const commitBtn = this.overlay?.querySelector<HTMLButtonElement>("#btn-modal-commit-save");
    if (commitBtn) {
      commitBtn.disabled = true;
      commitBtn.innerHTML = "<span>⏳</span><span>Đang lưu vào CVAT...</span>";
    }

    const res = await CVATBridge.commitSave(this.currentCtx.jobId);
    if (res.success) {
      this.store.markSaved();
      this.updateHeaderSaveBadge();
      if (commitBtn) {
        commitBtn.innerHTML = "<span>✅</span><span>Đã lưu vào CVAT</span>";
        commitBtn.style.background = "#2563eb";
        setTimeout(() => {
          commitBtn.disabled = false;
        }, 1200);
      }
    } else {
      if (commitBtn) {
        commitBtn.disabled = false;
        commitBtn.innerHTML = "<span>❌</span><span>Lỗi lưu CVAT</span>";
      }
      alert(`Lỗi lưu CVAT: ${res.message}`);
    }
  }

  private updateHeaderSaveBadge(): void {
    const dirtyCount = this.store?.getDirtyTracks().length || 0;
    const commitBtn = this.overlay?.querySelector<HTMLButtonElement>("#btn-modal-commit-save");
    if (commitBtn) {
      commitBtn.style.background = dirtyCount > 0 ? "#ea580c" : "#2563eb";
      commitBtn.innerHTML = `<span>💾</span><span>${
        dirtyCount > 0 ? `Lưu vào CVAT (${dirtyCount} track)` : "Lưu vào CVAT"
      }</span>`;
    }
  }

  private median(values: number[]): number {
    const s = values.slice().sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)] : 0;
  }
}
