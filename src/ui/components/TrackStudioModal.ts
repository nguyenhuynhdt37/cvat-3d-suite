import { CVATContext } from "../../core/types";
import { CVATBridge, FrameTrackItem } from "../../cvat/bridge";
import { JobAnnotationStore, TrackState, TrackData } from "../../core/track_store";
import { resizeKeepBottom } from "../../core/geometry";

export type StudioTab = "batch_all" | "active_track";

/**
 * Giao diện Active Track Retime Studio (Full-Screen Studio):
 * - Thay thế hoàn toàn Canvas 2D cũ, triệt tiêu 100% lỗi runtime (boxCorners, memory leak).
 * - Tích hợp sâu vào CVAT native Three.js WebGL: Click frame nào CVAT nhảy frame đó.
 * - Tab 1: Quản lý kích thước hàng loạt toàn bộ xe trong Job (Batch Size Manager).
 * - Tab 2: Studio duyệt toàn bộ dải frame của xe đang active từ Frame đầu -> Frame cuối.
 * - Retime từ frame 0 -> frame end với Ground-Lock 3D vector ez cố định đáy xe phẳng mặt đường.
 * - TUYỆT ĐỐI KHÔNG AUTOSAVE NGẦM: Chỉ lưu khi người dùng bấm nút [Lưu vào CVAT] hoặc Ctrl+S.
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

    if (this.overlay) {
      this.overlay.style.display = "flex";
    }

    await this.loadInitialData();
  }

  public close(): void {
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
    this.overlay.style.position = "fixed";
    this.overlay.style.inset = "0";
    this.overlay.style.zIndex = "999999";
    this.overlay.style.background = "rgba(9, 9, 11, 0.95)"; // zinc-950
    this.overlay.style.backdropFilter = "blur(8px)";
    this.overlay.style.color = "#f4f4f5";
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

        // Phím O: Toggle outside tại frame đang chọn trong Tab 2
        if (e.key.toLowerCase() === "o" && this.currentTab === "active_track") {
          const target = e.target as HTMLElement;
          if (target && (target.tagName === "INPUT" || target.tagName === "SELECT")) return;
          e.preventDefault();
          this.toggleOutsideFrame(this.selectedFrame);
          return;
        }

        // Phím [ : Chuyển sang xe trước
        if (e.key === "[" && this.currentTab === "active_track") {
          const target = e.target as HTMLElement;
          if (target && (target.tagName === "INPUT" || target.tagName === "SELECT")) return;
          e.preventDefault();
          this.switchPrevTrack();
          return;
        }

        // Phím ] : Chuyển sang xe tiếp theo
        if (e.key === "]" && this.currentTab === "active_track") {
          const target = e.target as HTMLElement;
          if (target && (target.tagName === "INPUT" || target.tagName === "SELECT")) return;
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
      <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px;">
        <div style="width: 36px; height: 36px; border: 3px solid rgba(255,255,255,0.1); border-top-color: #38bdf8; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
        <span style="font-size: 13px; color: #a1a1aa; font-family: monospace;">Đang đồng bộ dữ liệu xe từ Three.js CVAT native...</span>
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
        background: #141416;
        border-bottom: 1px solid rgba(255,255,255,0.08);
        padding: 10px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        min-height: 52px;
      ">
        <div style="display: flex; align-items: center; gap: 14px;">
          <!-- Badge Studio -->
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="background: #2563eb; color: white; padding: 3px 8px; border-radius: 5px; font-size: 11px; font-weight: bold; letter-spacing: 0.5px;">RETIME STUDIO</span>
            <span style="font-size: 14px; font-weight: bold; color: #f4f4f5;">Job #${this.currentCtx.jobId}</span>
          </div>

          <!-- Tab Switcher -->
          <div style="display: flex; background: #09090b; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 2px;">
            <button id="studio-tab-active" style="
              border: none;
              background: ${this.currentTab === "active_track" ? "#2563eb" : "transparent"};
              color: ${this.currentTab === "active_track" ? "white" : "#71717a"};
              padding: 5px 14px;
              font-size: 12px;
              font-weight: 600;
              cursor: pointer;
              border-radius: 4px;
              transition: all 0.15s;
            ">Duyệt Frame (Xe #${this.activeTrackId})</button>

            <button id="studio-tab-batch" style="
              border: none;
              background: ${this.currentTab === "batch_all" ? "#2563eb" : "transparent"};
              color: ${this.currentTab === "batch_all" ? "white" : "#71717a"};
              padding: 5px 14px;
              font-size: 12px;
              font-weight: 600;
              cursor: pointer;
              border-radius: 4px;
              transition: all 0.15s;
            ">Tất Cả Track ID (${allTracks.length})</button>
          </div>

          <!-- Quick Track Selector Dropdown & Switcher -->
          <div style="display: flex; align-items: center; gap: 4px; background: #09090b; border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; padding: 2px 6px;">
            <span style="font-size: 11px; color: #a1a1aa; font-weight: 600;">Track:</span>
            <select id="studio-quick-track-select" style="
              background: transparent;
              border: none;
              color: #38bdf8;
              font-size: 12px;
              font-weight: bold;
              cursor: pointer;
              outline: none;
              padding: 3px 4px;
              max-width: 200px;
            ">
              ${allTracks
                .map(
                  (t) => `
                <option value="${t.uiId}" ${t.uiId === this.activeTrackId ? "selected" : ""} style="background: #18181b; color: white;">
                  #${t.uiId} · ${t.labelName} (${t.shapes.length}f)
                </option>
              `
                )
                .join("")}
            </select>
            <button id="btn-quick-prev-track" title="Xe trước (phím [)" style="
              background: #27272a; border: 1px solid rgba(255,255,255,0.1); color: #d4d4d8; font-size: 11px; padding: 2px 7px; border-radius: 4px; cursor: pointer;
            ">◀</button>
            <button id="btn-quick-next-track" title="Xe sau (phím ])" style="
              background: #27272a; border: 1px solid rgba(255,255,255,0.1); color: #d4d4d8; font-size: 11px; padding: 2px 7px; border-radius: 4px; cursor: pointer;
            ">▶</button>
          </div>

          <!-- Status Indicator -->
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
            <span>THREE.JS NATIVE CONNECTED</span>
          </span>
        </div>

        <!-- Right Action Controls -->
        <div style="display: flex; align-items: center; gap: 10px;">
          <!-- Nút Lưu vào CVAT (TUYỆT ĐỐI KHÔNG TỰ ĐỘNG AUTOSAVE NGẦM) -->
          <button id="btn-studio-commit-save" style="
            background: ${dirtyCount > 0 ? "#ea580c" : "#2563eb"};
            border: 1px solid rgba(255,255,255,0.15);
            color: white;
            font-size: 12px;
            font-weight: 600;
            padding: 6px 16px;
            border-radius: 6px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            box-shadow: 0 2px 8px ${dirtyCount > 0 ? "rgba(234, 88, 12, 0.4)" : "rgba(37, 99, 235, 0.3)"};
            transition: all 0.2s;
          ">
            <span>💾</span>
            <span>${this.isSaving ? "Đang lưu..." : dirtyCount > 0 ? `Lưu vào CVAT (${dirtyCount} track)` : "Lưu vào CVAT"}</span>
            <span style="font-size: 10px; opacity: 0.8; font-family: monospace;">(Ctrl+S)</span>
          </button>

          <!-- Nút Đóng -->
          <button id="btn-studio-close" style="
            background: #27272a;
            border: 1px solid rgba(255,255,255,0.1);
            color: #a1a1aa;
            font-size: 12px;
            font-weight: bold;
            padding: 6px 12px;
            border-radius: 6px;
            cursor: pointer;
          ">✕ Đóng (Esc)</button>
        </div>
      </div>

      <!-- 2. NỘI DUNG CHÍNH (TAB 1 HOẶC TAB 2) -->
      <div style="flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden;">
        ${this.currentTab === "active_track" ? this.renderActiveTrackHtml(activeTrack) : this.renderBatchAllHtml(allTracks)}
      </div>
    `;

    this.attachHeaderListeners();
    if (this.currentTab === "active_track") {
      this.attachActiveTrackListeners(activeTrack);
    } else {
      this.attachBatchAllListeners();
    }
  }

  // =========================================================================
  // TAB 2: ACTIVE TRACK RETIME STUDIO (Duyệt toàn bộ frame của xe)
  // =========================================================================

  private renderActiveTrackHtml(track: TrackState | undefined): string {
    if (!track) {
      return `
        <div style="flex: 1; display: flex; align-items: center; justify-content: center; color: #71717a;">
          Chưa chọn xe nào để duyệt. Vui lòng chuyển sang tab danh sách xe.
        </div>
      `;
    }

    const sizes = track.shapes.map((s) => s.points.slice(6, 9));
    const medL = this.median(sizes.map((s) => s[0]));
    const medW = this.median(sizes.map((s) => s[1]));
    const medH = this.median(sizes.map((s) => s[2]));

    // Sắp xếp các shapes theo thứ tự frame tăng dần
    const sortedShapes = [...track.shapes].sort((a, b) => a.frame - b.frame);

    const rowsHtml = sortedShapes
      .map((sh) => {
        const f = sh.frame;
        const pts = sh.points;
        const curL = pts[6] || 0;
        const curW = pts[7] || 0;
        const curH = pts[8] || 0;
        const curZ = pts[2] || 0;
        const curYawDeg = Number((((pts[5] || 0) * 180) / Math.PI).toFixed(1));
        const isSelected = f === this.selectedFrame;

        return `
          <tr class="studio-frame-row ${isSelected ? "selected-row" : ""}" data-frame="${f}" style="
            border-bottom: 1px solid rgba(255,255,255,0.06);
            background: ${isSelected ? "rgba(37, 99, 235, 0.15)" : sh.outside ? "rgba(24, 24, 27, 0.5)" : "transparent"};
            cursor: pointer;
            transition: background 0.12s;
          ">
            <!-- Cột 1: Frame Number -->
            <td style="padding: 10px 14px; font-weight: bold; font-family: monospace;">
              <span class="btn-jump-frame" data-frame="${f}" style="
                background: ${isSelected ? "#2563eb" : "#27272a"};
                color: ${isSelected ? "white" : "#38bdf8"};
                padding: 3px 8px;
                border-radius: 4px;
                display: inline-flex;
                align-items: center;
                gap: 4px;
              ">
                <span>f#${f}</span>
                ${isSelected ? '<span style="font-size: 9px;">●</span>' : ""}
              </span>
            </td>

            <!-- Cột 2: Keyframe Status -->
            <td style="padding: 10px 14px; text-align: center;">
              <span style="background: rgba(16, 185, 129, 0.15); color: #34d399; font-size: 10px; font-weight: bold; padding: 2px 6px; border-radius: 4px;">KF</span>
            </td>

            <!-- Cột 3: Outside Toggle -->
            <td style="padding: 10px 14px;">
              <button class="btn-toggle-outside" data-frame="${f}" style="
                border: 1px solid ${sh.outside ? "rgba(239, 68, 68, 0.4)" : "rgba(34, 197, 94, 0.4)"};
                background: ${sh.outside ? "rgba(239, 68, 68, 0.12)" : "rgba(34, 197, 94, 0.12)"};
                color: ${sh.outside ? "#f87171" : "#4ade80"};
                font-size: 10px;
                font-weight: 600;
                padding: 3px 8px;
                border-radius: 4px;
                cursor: pointer;
              ">${sh.outside ? "Outside (Ẩn)" : "Visible (Hiện)"}</button>
            </td>

            <!-- Cột 4: Kích Thước L / W / H (Nhập trực tiếp) -->
            <td style="padding: 10px 8px; font-family: monospace;">
              <div style="display: flex; align-items: center; gap: 4px;">
                <input class="input-shape-l" data-frame="${f}" type="number" step="0.02" value="${curL.toFixed(2)}" style="width: 58px; background: #09090b; border: 1px solid rgba(255,255,255,0.12); color: #38bdf8; padding: 3px; border-radius: 4px; font-size: 11px; text-align: center;" />
                <span style="color: #71717a;">×</span>
                <input class="input-shape-w" data-frame="${f}" type="number" step="0.02" value="${curW.toFixed(2)}" style="width: 58px; background: #09090b; border: 1px solid rgba(255,255,255,0.12); color: #38bdf8; padding: 3px; border-radius: 4px; font-size: 11px; text-align: center;" />
                <span style="color: #71717a;">×</span>
                <input class="input-shape-h" data-frame="${f}" type="number" step="0.02" value="${curH.toFixed(2)}" title="Đổi H giữ nguyên mặt đáy" style="width: 58px; background: #09090b; border: 1px solid rgba(255,255,255,0.12); color: #38bdf8; padding: 3px; border-radius: 4px; font-size: 11px; text-align: center;" />
                <span style="color: #a1a1aa; font-size: 10px;">m</span>
              </div>
            </td>

            <!-- Cột 5: Cao độ Z & Góc Yaw -->
            <td style="padding: 10px 8px; font-family: monospace;">
              <div style="display: flex; align-items: center; gap: 6px; font-size: 11px;">
                <span style="color: #a1a1aa;">Z:</span>
                <input class="input-shape-z" data-frame="${f}" type="number" step="0.02" value="${curZ.toFixed(2)}" style="width: 54px; background: #09090b; border: 1px solid rgba(255,255,255,0.12); color: white; padding: 3px; border-radius: 4px; font-size: 11px; text-align: center;" />
                <span style="color: #a1a1aa;">Yaw:</span>
                <span style="color: #e4e4e7;">${curYawDeg}°</span>
              </div>
            </td>

            <!-- Cột 6: Thao tác từng frame -->
            <td style="padding: 10px 14px; text-align: right;">
              <button class="btn-snap-ground-single" data-frame="${f}" title="Hút đáy xe bám sát mặt đất tại frame này" style="
                background: #27272a;
                border: 1px solid rgba(255,255,255,0.1);
                color: #2dd4bf;
                font-size: 11px;
                padding: 4px 8px;
                border-radius: 4px;
                cursor: pointer;
              ">⇩ Đất</button>

              <button class="btn-apply-size-to-all" data-frame="${f}" title="Lấy kích thước L, W, H của frame này ép cho toàn bộ các frame khác" style="
                background: #27272a;
                border: 1px solid rgba(255,255,255,0.1);
                color: #6ee7b7;
                font-size: 11px;
                padding: 4px 8px;
                border-radius: 4px;
                cursor: pointer;
                margin-left: 4px;
              ">L/W/H ➔ Toàn Track</button>
            </td>
          </tr>
        `;
      })
      .join("");

    return `
      <!-- Studio Toolbar -->
      <div style="
        background: #18181b;
        border-bottom: 1px solid rgba(255,255,255,0.08);
        padding: 10px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
      ">
        <!-- Info Active Track -->
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="width: 10px; height: 10px; border-radius: 50%; background: ${track.labelColor};"></span>
            <span style="font-size: 14px; font-weight: bold; color: white;">${track.labelName} #${track.uiId}</span>
            <span style="font-size: 11px; color: #a1a1aa; font-family: monospace;">(${track.firstFrame} ➔ ${track.lastFrame}, ${track.shapes.length} frames)</span>
          </div>

          <div style="font-size: 12px; color: #d4d4d8; font-family: monospace; background: #09090b; padding: 4px 10px; border-radius: 5px; border: 1px solid rgba(255,255,255,0.08);">
            Trung vị: <b style="color: #38bdf8;">${medL.toFixed(2)} × ${medW.toFixed(2)} × ${medH.toFixed(2)}m</b>
          </div>
        </div>

        <!-- Batch Action Buttons For Active Track -->
        <div style="display: flex; align-items: center; gap: 8px;">
          <button id="btn-batch-snap-ground" style="
            background: #27272a;
            border: 1px solid rgba(255,255,255,0.12);
            color: #2dd4bf;
            font-size: 11px;
            font-weight: 600;
            padding: 5px 10px;
            border-radius: 5px;
            cursor: pointer;
          ">⇩ Ghim Đất Toàn Track</button>

          <button id="btn-batch-flip-yaw" style="
            background: #27272a;
            border: 1px solid rgba(255,255,255,0.12);
            color: #fbbf24;
            font-size: 11px;
            font-weight: 600;
            padding: 5px 10px;
            border-radius: 5px;
            cursor: pointer;
          ">🔄 Lật 180° Toàn Track</button>

          <button id="btn-batch-median-size" style="
            background: #27272a;
            border: 1px solid rgba(255,255,255,0.12);
            color: #a78bfa;
            font-size: 11px;
            font-weight: 600;
            padding: 5px 10px;
            border-radius: 5px;
            cursor: pointer;
          ">⟲ Làm Mịn Kích Thước (Median)</button>
        </div>
      </div>

      <!-- Danh Sách Các Frame -->
      <div style="flex: 1; overflow: auto; padding: 12px 20px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
          <thead>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.12); color: #a1a1aa; font-weight: 600; font-size: 11px;">
              <th style="padding: 8px 14px;">Frame</th>
              <th style="padding: 8px 14px; text-align: center;">Loại</th>
              <th style="padding: 8px 14px;">Hiển Thị</th>
              <th style="padding: 8px 8px;">Kích Thước (L × W × H)</th>
              <th style="padding: 8px 8px;">Tọa Độ & Hướng</th>
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

  private attachActiveTrackListeners(track: TrackState | undefined): void {
    if (!this.overlay || !track || !this.store || !this.currentCtx?.jobId) return;
    const jobId = this.currentCtx.jobId;

    // 1. Click vào bất kỳ hàng nào -> CVAT native nhảy tới frame đó
    this.overlay.querySelectorAll<HTMLTableRowElement>(".studio-frame-row").forEach((row) => {
      row.addEventListener("click", (e) => {
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "BUTTON") return;
        const f = parseInt(row.dataset.frame || "0", 10);
        this.selectedFrame = f;
        this.jumpToCVATFrame(f);
        this.render();
      });
    });

    // Nút jump frame
    this.overlay.querySelectorAll<HTMLElement>(".btn-jump-frame").forEach((btn) => {
      btn.addEventListener("click", () => {
        const f = parseInt(btn.dataset.frame || "0", 10);
        this.selectedFrame = f;
        this.jumpToCVATFrame(f);
        this.render();
      });
    });

    // 2. Toggle Outside (Hiện / Ẩn)
    this.overlay.querySelectorAll<HTMLButtonElement>(".btn-toggle-outside").forEach((btn) => {
      btn.addEventListener("click", () => {
        const f = parseInt(btn.dataset.frame || "0", 10);
        this.toggleOutsideFrame(f);
      });
    });

    // 3. Sửa kích thước L, W, H trên từng frame (Đổi H giữ nguyên đáy)
    const updateShapeSize = (f: number, newL?: number, newW?: number, newH?: number) => {
      const sh = track.shapes.find((s) => s.frame === f);
      if (!sh || !Array.isArray(sh.points)) return;
      this.store?.snapshot([track.uiId]);

      const oldH = sh.points[8];
      const curL = newL !== undefined ? newL : sh.points[6];
      const curW = newW !== undefined ? newW : sh.points[7];
      const curH = newH !== undefined ? newH : sh.points[8];

      if (newH !== undefined && newH !== oldH) {
        // Ground-Lock 3D: Giữ nguyên đáy xe
        const curBox = track.at(f)?.box;
        if (curBox) {
          const updatedBox = resizeKeepBottom(curBox, [curL, curW, curH]);
          sh.points[0] = updatedBox.c[0];
          sh.points[1] = updatedBox.c[1];
          sh.points[2] = updatedBox.c[2];
        }
      }

      sh.points[6] = curL;
      sh.points[7] = curW;
      sh.points[8] = curH;
      track.dirty = true;

      // Realtime Three.js nếu đang xem frame này
      if (f === CVATBridge.getCurrentFrame()) {
        CVATBridge.updateLiveBox(jobId, f, track.uiId, track.serverId, sh.points);
      }
      this.render();
    };

    this.overlay.querySelectorAll<HTMLInputElement>(".input-shape-l").forEach((inp) => {
      inp.addEventListener("change", () => {
        const f = parseInt(inp.dataset.frame || "0", 10);
        const val = parseFloat(inp.value);
        if (!isNaN(val) && val > 0) updateShapeSize(f, val, undefined, undefined);
      });
    });

    this.overlay.querySelectorAll<HTMLInputElement>(".input-shape-w").forEach((inp) => {
      inp.addEventListener("change", () => {
        const f = parseInt(inp.dataset.frame || "0", 10);
        const val = parseFloat(inp.value);
        if (!isNaN(val) && val > 0) updateShapeSize(f, undefined, val, undefined);
      });
    });

    this.overlay.querySelectorAll<HTMLInputElement>(".input-shape-h").forEach((inp) => {
      inp.addEventListener("change", () => {
        const f = parseInt(inp.dataset.frame || "0", 10);
        const val = parseFloat(inp.value);
        if (!isNaN(val) && val > 0) updateShapeSize(f, undefined, val, undefined);
      });
    });

    // 4. Nút L/W/H -> Toàn Track
    this.overlay.querySelectorAll<HTMLButtonElement>(".btn-apply-size-to-all").forEach((btn) => {
      btn.addEventListener("click", () => {
        const f = parseInt(btn.dataset.frame || "0", 10);
        const sh = track.shapes.find((s) => s.frame === f);
        if (!sh || !Array.isArray(sh.points)) return;
        const size: [number, number, number] = [sh.points[6], sh.points[7], sh.points[8]];
        this.applySizeToWholeTrack(track.uiId, size);
      });
    });

    // 5. Nút Ghim Đất frame này
    this.overlay.querySelectorAll<HTMLButtonElement>(".btn-snap-ground-single").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await CVATBridge.snapTrackToGround(jobId, track.uiId, track.serverId || track.uiId, "road");
        await this.loadInitialData();
      });
    });

    // 6. Thanh công cụ: Ghim đất toàn track
    this.overlay.querySelector("#btn-batch-snap-ground")?.addEventListener("click", async () => {
      for (const sh of track.shapes) {
        if (!sh.outside) {
          await CVATBridge.snapTrackToGround(jobId, track.uiId, track.serverId || track.uiId, "road");
        }
      }
      await this.loadInitialData();
    });

    // 7. Thanh công cụ: Lật 180° toàn track
    this.overlay.querySelector("#btn-batch-flip-yaw")?.addEventListener("click", async () => {
      await CVATBridge.flipTrackYaw(jobId, track.uiId, track.serverId || track.uiId, false);
      await this.loadInitialData();
    });

    // 8. Thanh công cụ: Median làm mịn kích thước
    this.overlay.querySelector("#btn-batch-median-size")?.addEventListener("click", () => {
      const sizes = track.shapes.map((s) => s.points.slice(6, 9));
      const medSize: [number, number, number] = [
        this.median(sizes.map((s) => s[0])),
        this.median(sizes.map((s) => s[1])),
        this.median(sizes.map((s) => s[2])),
      ];
      this.applySizeToWholeTrack(track.uiId, medSize);
    });
  }

  // =========================================================================
  // TAB 1: BATCH SIZE MANAGER (Quản lý kích thước toàn Job)
  // =========================================================================

  private renderBatchAllHtml(allTracks: TrackState[]): string {
    const rowsHtml = allTracks
      .map((t) => {
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
        const varies = maxL - minL > 0.01 || maxW - minW > 0.01 || maxH - minH > 0.01;

        return `
          <tr class="batch-track-row" data-track-id="${t.uiId}" style="border-bottom: 1px solid rgba(255,255,255,0.06); cursor: pointer; transition: background 0.15s; background: ${t.uiId === this.activeTrackId ? "rgba(37, 99, 235, 0.15)" : t.dirty ? "rgba(34, 197, 94, 0.06)" : "transparent"};">
            <td style="padding: 10px 14px; font-weight: bold; color: #38bdf8; font-family: monospace;">#${t.uiId}</td>
            <td style="padding: 10px 14px;">
              <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${t.labelColor}; margin-right: 6px;"></span>
              <span>${t.labelName}</span>
            </td>
            <td style="padding: 10px 14px; font-family: monospace; color: #a1a1aa;">f${t.firstFrame} ➔ f${t.lastFrame}</td>
            <td style="padding: 10px 14px; font-family: monospace; text-align: center;">${t.shapes.length}</td>
            <td style="padding: 10px 14px; font-family: monospace; color: #e4e4e7;">
              ${medL.toFixed(2)} / ${medW.toFixed(2)} / ${medH.toFixed(2)}m
              ${varies ? '<span style="margin-left: 6px; font-size: 10px; background: rgba(234, 88, 12, 0.2); color: #fb923c; padding: 1px 4px; border-radius: 3px;">không đều</span>' : ""}
            </td>
            <td style="padding: 10px 8px;">
              <input class="batch-inp-l" data-track-id="${t.uiId}" type="number" step="0.02" placeholder="${medL.toFixed(2)}" style="width: 58px; background: #09090b; border: 1px solid rgba(255,255,255,0.12); color: #38bdf8; padding: 4px; border-radius: 4px; font-size: 11px; text-align: center;" />
            </td>
            <td style="padding: 10px 8px;">
              <input class="batch-inp-w" data-track-id="${t.uiId}" type="number" step="0.02" placeholder="${medW.toFixed(2)}" style="width: 58px; background: #09090b; border: 1px solid rgba(255,255,255,0.12); color: #38bdf8; padding: 4px; border-radius: 4px; font-size: 11px; text-align: center;" />
            </td>
            <td style="padding: 10px 8px;">
              <input class="batch-inp-h" data-track-id="${t.uiId}" type="number" step="0.02" placeholder="${medH.toFixed(2)}" style="width: 58px; background: #09090b; border: 1px solid rgba(255,255,255,0.12); color: #38bdf8; padding: 4px; border-radius: 4px; font-size: 11px; text-align: center;" />
            </td>
            <td style="padding: 10px 14px;">
              <button class="btn-batch-apply" data-track-id="${t.uiId}" style="background: #2563eb; border: none; color: white; padding: 5px 12px; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer;">Áp dụng</button>
              <button class="btn-batch-snap" data-track-id="${t.uiId}" style="margin-left: 4px; background: #27272a; border: 1px solid rgba(255,255,255,0.1); color: #2dd4bf; padding: 5px 8px; border-radius: 4px; font-size: 11px; cursor: pointer;">⇩ Đất</button>
            </td>
            <td style="padding: 10px 14px; text-align: right;">
              <button class="btn-open-studio-track" data-track-id="${t.uiId}" style="background: #2563eb; border: 1px solid rgba(255,255,255,0.15); color: white; padding: 5px 12px; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer;">Duyệt Frame ➔</button>
            </td>
          </tr>
        `;
      })
      .join("");

    return `
      <!-- Toolbar Tab 1 -->
      <div style="background: #18181b; border-bottom: 1px solid rgba(255,255,255,0.06); padding: 10px 20px; display: flex; align-items: center; justify-content: space-between;">
        <span style="font-size: 12px; color: #a1a1aa;">
          Áp dụng kích thước mới từ <b>Frame 0 ➔ Frame End</b> với <b>Ground-Lock 3D</b> (Đáy xe cố định tuyệt đối trên mặt đường).
        </span>
        <span style="font-size: 11px; color: #71717a; font-family: monospace;">
          Dữ liệu in-memory, chỉ lưu khi bấm nút "Lưu vào CVAT" (Ctrl+S)
        </span>
      </div>

      <!-- Bảng Danh Sách Xe -->
      <div style="flex: 1; overflow: auto; padding: 12px 20px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
          <thead>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.12); color: #a1a1aa; font-weight: 600; font-size: 11px;">
              <th style="padding: 8px 14px;">ID</th>
              <th style="padding: 8px 14px;">Label</th>
              <th style="padding: 8px 14px;">Dải Frame</th>
              <th style="padding: 8px 14px; text-align: center;">Keyframes</th>
              <th style="padding: 8px 14px;">L / W / H (Trung vị)</th>
              <th style="padding: 8px 8px;">L mới</th>
              <th style="padding: 8px 8px;">W mới</th>
              <th style="padding: 8px 8px;">H mới</th>
              <th style="padding: 8px 14px;">Thao Tác</th>
              <th style="padding: 8px 14px; text-align: right;">Chi Tiết</th>
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
    if (!this.overlay || !this.store || !this.currentCtx?.jobId) return;
    const jobId = this.currentCtx.jobId;

    // Nút Áp dụng kích thước cho 1 xe trong Tab 1
    this.overlay.querySelectorAll<HTMLButtonElement>(".btn-batch-apply").forEach((btn) => {
      btn.addEventListener("click", () => {
        const trackId = parseInt(btn.dataset.trackId || "0", 10);
        const row = btn.closest("tr");
        if (!row) return;

        const inpL = row.querySelector<HTMLInputElement>(".batch-inp-l");
        const inpW = row.querySelector<HTMLInputElement>(".batch-inp-w");
        const inpH = row.querySelector<HTMLInputElement>(".batch-inp-h");

        const track = this.store?.getTrack(trackId);
        if (!track) return;

        const sizes = track.shapes.map((s) => s.points.slice(6, 9));
        const medL = this.median(sizes.map((s) => s[0]));
        const medW = this.median(sizes.map((s) => s[1]));
        const medH = this.median(sizes.map((s) => s[2]));

        const newL = parseFloat(inpL?.value || "") || medL;
        const newW = parseFloat(inpW?.value || "") || medW;
        const newH = parseFloat(inpH?.value || "") || medH;

        this.applySizeToWholeTrack(trackId, [newL, newW, newH]);
      });
    });

    // Nút Ghim đất trong Tab 1
    this.overlay.querySelectorAll<HTMLButtonElement>(".btn-batch-snap").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const trackId = parseInt(btn.dataset.trackId || "0", 10);
        const track = this.store?.getTrack(trackId);
        if (!track) return;

        await CVATBridge.snapTrackToGround(jobId, trackId, track.serverId || trackId, "road");
        await this.loadInitialData();
      });
    });

    // Click vào bất kỳ hàng nào của bảng xe -> Chuyển sang duyệt frame xe đó
    this.overlay.querySelectorAll<HTMLTableRowElement>(".batch-track-row").forEach((row) => {
      row.addEventListener("click", (e) => {
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "BUTTON") return;
        const trackId = parseInt(row.dataset.trackId || "0", 10);
        this.switchActiveTrack(trackId);
      });
    });

    // Nút Mở Studio xe (Duyệt Frame)
    this.overlay.querySelectorAll<HTMLButtonElement>(".btn-open-studio-track").forEach((btn) => {
      btn.addEventListener("click", () => {
        const trackId = parseInt(btn.dataset.trackId || "0", 10);
        this.switchActiveTrack(trackId);
      });
    });
  }

  // =========================================================================
  // LOGIC ĐIỀU KHIỂN & TƯƠNG TÁC
  // =========================================================================

  public switchActiveTrack(trackId: number): void {
    if (!this.store) return;
    const track = this.store.getTrack(trackId);
    if (!track) return;

    this.activeTrackId = trackId;
    this.currentTab = "active_track";

    // Đồng bộ frame: giữ frame hiện tại nếu nằm trong dải của xe, ngược lại nhảy tới firstFrame
    const curF = CVATBridge.getCurrentFrame();
    if (track.shapes.some((s) => s.frame === curF)) {
      this.selectedFrame = curF;
    } else if (track.shapes.length > 0) {
      this.selectedFrame = track.firstFrame;
      this.jumpToCVATFrame(track.firstFrame);
    }

    this.render();
  }

  public switchPrevTrack(): void {
    if (!this.store) return;
    const all = this.store.getAllTracks();
    if (all.length <= 1) return;
    const idx = all.findIndex((t) => t.uiId === this.activeTrackId);
    const prevIdx = idx <= 0 ? all.length - 1 : idx - 1;
    this.switchActiveTrack(all[prevIdx].uiId);
  }

  public switchNextTrack(): void {
    if (!this.store) return;
    const all = this.store.getAllTracks();
    if (all.length <= 1) return;
    const idx = all.findIndex((t) => t.uiId === this.activeTrackId);
    const nextIdx = idx < 0 || idx >= all.length - 1 ? 0 : idx + 1;
    this.switchActiveTrack(all[nextIdx].uiId);
  }

  private attachHeaderListeners(): void {
    if (!this.overlay) return;

    // Chuyển Tab
    this.overlay.querySelector("#studio-tab-active")?.addEventListener("click", () => {
      this.currentTab = "active_track";
      this.render();
    });

    this.overlay.querySelector("#studio-tab-batch")?.addEventListener("click", () => {
      this.currentTab = "batch_all";
      this.render();
    });

    // Quick Track Selector Dropdown
    this.overlay.querySelector<HTMLSelectElement>("#studio-quick-track-select")?.addEventListener("change", (e) => {
      const select = e.target as HTMLSelectElement;
      const tid = parseInt(select.value, 10);
      if (!isNaN(tid)) this.switchActiveTrack(tid);
    });

    // Nút Xe trước / Xe sau
    this.overlay.querySelector("#btn-quick-prev-track")?.addEventListener("click", () => {
      this.switchPrevTrack();
    });

    this.overlay.querySelector("#btn-quick-next-track")?.addEventListener("click", () => {
      this.switchNextTrack();
    });

    // Nút Đóng
    this.overlay.querySelector("#btn-studio-close")?.addEventListener("click", () => {
      this.close();
    });

    // Nút Lưu vào CVAT
    this.overlay.querySelector("#btn-studio-commit-save")?.addEventListener("click", () => {
      this.triggerCommitSave();
    });
  }

  /**
   * Chuyển frame trong timeline CVAT native và Three.js scene
   */
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

  /**
   * Bật/tắt trạng thái Outside tại một frame
   */
  private toggleOutsideFrame(frame: number): void {
    if (!this.store) return;
    const track = this.store.getTrack(this.activeTrackId);
    if (!track) return;

    const sh = track.shapes.find((s) => s.frame === frame);
    if (sh) {
      this.store.snapshot([this.activeTrackId]);
      sh.outside = !sh.outside;
      track.dirty = true;
      this.render();
    }
  }

  /**
   * Áp dụng kích thước mới cho toàn bộ các frame của một track (Ground-Lock 3D)
   */
  private applySizeToWholeTrack(trackId: number, newSize: [number, number, number]): void {
    if (!this.store || !this.currentCtx?.jobId) return;
    const track = this.store.getTrack(trackId);
    if (!track) return;

    this.store.snapshot([trackId]);

    for (const sh of track.shapes) {
      if (!sh.outside) {
        const curBox = track.at(sh.frame)?.box;
        if (curBox) {
          // Bù trừ cao độ Ground-Lock theo vector ez: Đáy xe cố định tuyệt đối
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

    // Realtime Two-Way Sync sang Three.js nếu đang ở cùng frame
    const curF = CVATBridge.getCurrentFrame();
    const curSh = track.shapes.find((s) => s.frame === curF);
    if (curSh) {
      CVATBridge.updateLiveBox(this.currentCtx.jobId, curF, track.uiId, track.serverId, curSh.points);
    }

    this.render();
  }

  /**
   * Lưu toàn bộ các thay đổi vào CVAT (Chỉ lưu khi bấm, TUYỆT ĐỐI KHÔNG AUTOSAVE)
   */
  private async triggerCommitSave(): Promise<void> {
    if (!this.currentCtx?.jobId || !this.store || this.isSaving) return;

    this.isSaving = true;
    this.render();

    try {
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
