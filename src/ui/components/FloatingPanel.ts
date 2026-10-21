import { CVATContext } from "../../core/types";
import { ICONS } from "../icons";
import { CVATBridge, FrameTrackItem } from "../../cvat/bridge";
import { findBestFitCatalog, STANDARD_VEHICLE_CATALOG } from "../../core/catalog";
import { TrackStudioModal } from "./TrackStudioModal";

/**
 * Cửa sổ nổi (Floating Panel) chuẩn phong cách shadcn/ui:
 * - Cập nhật 100% THỜI GIAN THỰC (REALTIME, TUYỆT ĐỐI KHÔNG RELOAD TRANG, KHÔNG CẦN F5)
 * - Tự động nhận diện khi click vào box 3D trên Canvas (Canvas Auto-Select) và Highlight 2 chiều
 * - Dropdown Select Danh Sách Xe (Searchable Combobox) thông minh, hỗ trợ 50+ xe không lo tràn màn hình
 * - Chỉnh sửa kích thước (L, W, H) linh hoạt: Áp dụng Chỉ Frame Này hoặc Toàn Bộ Track
 * - Thuật toán Tự Tính Kích Thước Tốt Nhất (LiDAR Best-Fit & Catalog Matching)
 * - Tái thiết kế giao diện theo Module / Tabs (Kích thước, Hướng xoay, Ghim đất)
 * - Thông Báo Nổi Tuyệt Đối (Absolute Floating Toast Overlay) - CHỐNG NHÁY & CHỐNG GIẬT NÚT 100%
 */
export class FloatingPanel {
  private container: HTMLDivElement | null = null;
  private miniPill: HTMLDivElement | null = null;
  private toastOverlay: HTMLDivElement | null = null;
  private toastTimer: any = null;
  private isMinimized: boolean = false;
  private trackStudioModal: TrackStudioModal = new TrackStudioModal();

  // Module Tab đang mở: "dimensions" | "rotation" | "ground"
  private activeTab: "dimensions" | "rotation" | "ground" = "dimensions";

  // Phạm vi áp dụng kích thước: false = Chỉ Frame này, true = Toàn bộ Track
  private applyToTrack: boolean = false;

  // Dữ liệu đối tượng đang chọn
  private selectedUiId: number | null = null;       // Số 1, 2 hiển thị chuẩn
  private selectedServerId: number | null = null;   // Số 31, 32 lưu database
  private currentLabel: string = "Chưa chọn xe";
  private currentX: number = 0;
  private currentY: number = 0;
  private currentZ: number = 0;
  private currentYawDeg: number = 0;
  private currentL: number = 0;
  private currentW: number = 0;
  private currentH: number = 0;

  // Giá trị đang chỉnh sửa trên ô input (L, W, H)
  private editL: number = 0;
  private editW: number = 0;
  private editH: number = 0;

  // Danh sách các xe ĐANG CÓ MẶT TẠI FRAME HIỆN TẠI
  private currentFrameNumber: number = 0;
  private frameTracks: FrameTrackItem[] = [];

  // Trạng thái Dropdown Select & Tìm kiếm
  private isDropdownOpen: boolean = false;
  private searchKeyword: string = "";
  private autoSelectListenerAttached: boolean = false;

  // Trạng thái xử lý
  private isProcessing: boolean = false;

  // Tọa độ kéo thả
  private isDragging: boolean = false;
  private startX: number = 0;
  private startY: number = 0;

  private currentCtx: CVATContext | null = null;
  private pollInterval: any = null;

  public render(ctx: CVATContext): void {
    this.currentCtx = ctx;

    if (!ctx.isCVAT) {
      this.destroy();
      return;
    }

    if (!this.container) {
      this.createContainer();
      this.createMiniPill();
      this.createToastOverlay();
      this.setupDraggable();
      this.setupCanvasAutoSelectListener();
      this.startPollingLoop();
    }

    this.updateContent();
  }

  private createContainer(): void {
    this.container = document.createElement("div");
    this.container.id = "cvat-3d-suite-floating";
    this.container.style.position = "fixed";
    this.container.style.top = "20px";
    this.container.style.right = "20px";
    this.container.style.width = "370px";
    this.container.style.maxHeight = "calc(100vh - 40px)";
    this.container.style.zIndex = "999995";
    this.container.style.fontFamily = "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

    // shadcn/ui Dark Card style
    this.container.style.backgroundColor = "rgba(9, 9, 11, 0.95)";
    this.container.style.backdropFilter = "blur(16px)";
    this.container.style.border = "1px solid rgba(255, 255, 255, 0.12)";
    this.container.style.borderRadius = "16px";
    this.container.style.boxShadow = "0 20px 40px -15px rgba(0, 0, 0, 0.75), 0 0 1px 1px rgba(255, 255, 255, 0.05)";
    this.container.style.color = "#f4f4f5";
    this.container.style.display = "flex";
    this.container.style.flexDirection = "column";
    this.container.style.overflow = "hidden";
    this.container.style.userSelect = "none";
    this.container.style.transition = "opacity 0.2s ease";

    document.body.appendChild(this.container);

    // Click outside để đóng Dropdown Select
    document.addEventListener("click", (e: MouseEvent) => {
      if (!this.isDropdownOpen) return;
      const target = e.target as HTMLElement;
      if (!target.closest("#dropdown-menu-popover") && !target.closest("#btn-dropdown-toggle")) {
        this.isDropdownOpen = false;
        this.updateContent();
      }
    });
  }

  private createMiniPill(): void {
    this.miniPill = document.createElement("div");
    this.miniPill.id = "cvat-3d-suite-pill";
    this.miniPill.style.position = "fixed";
    this.miniPill.style.bottom = "24px";
    this.miniPill.style.right = "24px";
    this.miniPill.style.zIndex = "999996";
    this.miniPill.style.fontFamily = "ui-sans-serif, system-ui, sans-serif";
    this.miniPill.style.backgroundColor = "rgba(9, 9, 11, 0.92)";
    this.miniPill.style.backdropFilter = "blur(12px)";
    this.miniPill.style.border = "1px solid rgba(255, 255, 255, 0.14)";
    this.miniPill.style.borderRadius = "9999px";
    this.miniPill.style.padding = "8px 14px";
    this.miniPill.style.color = "#f4f4f5";
    this.miniPill.style.fontSize = "12px";
    this.miniPill.style.fontWeight = "600";
    this.miniPill.style.display = "none";
    this.miniPill.style.alignItems = "center";
    this.miniPill.style.gap = "8px";
    this.miniPill.style.boxShadow = "0 10px 25px -5px rgba(0, 0, 0, 0.5)";
    this.miniPill.style.cursor = "pointer";
    this.miniPill.style.userSelect = "none";

    this.miniPill.innerHTML = `
      <span style="width: 8px; height: 8px; border-radius: 50%; background: #10b981; box-shadow: 0 0 8px #10b981;"></span>
      <span>3D Suite</span>
      <span style="font-size: 10px; font-family: monospace; color: #71717a; background: #27272a; padding: 2px 6px; border-radius: 4px;">\`</span>
    `;

    this.miniPill.addEventListener("click", () => this.toggleMinimize());
    document.body.appendChild(this.miniPill);
  }

  /**
   * Tạo phần tử Thông Báo Nổi (Floating Toast Overlay):
   * Định vị absolute ở đáy của Card, KHÔNG nằm trong luồng DOM -> KHÔNG BAO GIỜ LÀM NHÁY HOẶC GIẬT NÚT!
   */
  private createToastOverlay(): void {
    if (!this.container || this.toastOverlay) return;

    this.toastOverlay = document.createElement("div");
    this.toastOverlay.id = "cvat-floating-toast-overlay";
    this.toastOverlay.style.position = "absolute";
    this.toastOverlay.style.bottom = "38px";
    this.toastOverlay.style.left = "14px";
    this.toastOverlay.style.right = "14px";
    this.toastOverlay.style.zIndex = "999999";
    this.toastOverlay.style.pointerEvents = "none";
    this.toastOverlay.style.display = "flex";
    this.toastOverlay.style.justifyContent = "center";
    this.toastOverlay.style.alignItems = "center";
    this.toastOverlay.style.transition = "all 0.22s cubic-bezier(0.16, 1, 0.3, 1)";
    this.toastOverlay.style.opacity = "0";
    this.toastOverlay.style.transform = "translateY(8px)";

    this.container.appendChild(this.toastOverlay);
  }

  /**
   * Hiển thị thông báo nổi không gây gián đoạn giao diện (Zero Layout Shift).
   * 100% SVG Flat Icons phẳng, tối giản, thanh lịch, KHÔNG DÙNG EMOJI 3D.
   */
  public showToast(msg: string, type: "success" | "info" | "warning" | "error" = "success"): void {
    if (!this.toastOverlay) return;

    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }

    let bgColor = "rgba(16, 185, 129, 0.95)";
    let textColor = "#ffffff";
    let iconSvg = ICONS.checkCircle;

    if (type === "info") {
      bgColor = "rgba(14, 165, 233, 0.95)";
      iconSvg = ICONS.infoCircle;
    } else if (type === "warning") {
      bgColor = "rgba(245, 158, 11, 0.95)";
      textColor = "#18181b";
      iconSvg = ICONS.alertCircle;
    } else if (type === "error") {
      bgColor = "rgba(239, 68, 68, 0.95)";
      iconSvg = ICONS.xCircle;
    }

    this.toastOverlay.innerHTML = `
      <div style="
        background: ${bgColor};
        color: ${textColor};
        padding: 6px 14px;
        border-radius: 9999px;
        font-size: 11px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 6px;
        box-shadow: 0 10px 25px -4px rgba(0, 0, 0, 0.6), 0 0 1px 1px rgba(255, 255, 255, 0.15);
        backdrop-filter: blur(8px);
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        letter-spacing: -0.2px;
      ">
        <span style="display: flex; align-items: center;">${iconSvg}</span>
        <span>${msg}</span>
      </div>
    `;

    this.toastOverlay.style.opacity = "1";
    this.toastOverlay.style.transform = "translateY(0)";

    this.toastTimer = setTimeout(() => {
      if (this.toastOverlay) {
        this.toastOverlay.style.opacity = "0";
        this.toastOverlay.style.transform = "translateY(8px)";
      }
      this.toastTimer = null;
    }, 2800);
  }

  public toggleMinimize(): void {
    this.isMinimized = !this.isMinimized;
    if (this.container && this.miniPill) {
      if (this.isMinimized) {
        this.container.style.display = "none";
        this.miniPill.style.display = "flex";
      } else {
        this.container.style.display = "flex";
        this.miniPill.style.display = "none";
      }
    }
  }

  /**
   * Kéo thả cửa sổ nổi
   */
  private setupDraggable(): void {
    if (!this.container) return;

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("button") || target.closest("input") || target.closest("select")) return;
      if (!target.closest("#floating-drag-header")) return;

      this.isDragging = true;
      this.startX = e.clientX - this.container!.offsetLeft;
      this.startY = e.clientY - this.container!.offsetTop;
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!this.isDragging || !this.container) return;

      let newLeft = e.clientX - this.startX;
      let newTop = e.clientY - this.startY;

      const maxLeft = window.innerWidth - this.container.offsetWidth - 10;
      const maxTop = window.innerHeight - this.container.offsetHeight - 10;

      newLeft = Math.max(10, Math.min(newLeft, maxLeft));
      newTop = Math.max(10, Math.min(newTop, maxTop));

      this.container.style.left = `${newLeft}px`;
      this.container.style.top = `${newTop}px`;
      this.container.style.right = "auto";
    };

    const onMouseUp = () => {
      this.isDragging = false;
    };

    this.container.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  /**
   * Tự động nhận diện khi người dùng click vào box trên Three.js Canvas hoặc Sidebar (0ms Realtime)
   */
  private setupCanvasAutoSelectListener(): void {
    if (this.autoSelectListenerAttached) return;
    this.autoSelectListenerAttached = true;

    // Lắng nghe sự kiện kích hoạt đối tượng từ Main World
    window.addEventListener("CVAT_EXT_RES_OBJECT_ACTIVATED", (e: any) => {
      const clientId = e.detail?.clientId;
      const details = e.detail?.details;

      if (details && details.clientId) {
        console.log(`[CVAT 3D Suite] Nhận dữ liệu tức thì của xe #${details.clientId}:`, details);
        this.selectedUiId = details.clientId;
        this.selectedServerId = details.serverId || null;
        this.currentLabel = details.label || `Xe #${details.clientId}`;
        this.currentX = details.x;
        this.currentY = details.y;
        this.currentZ = details.z;
        this.currentYawDeg = details.yawDeg;
        this.currentL = details.l;
        this.currentW = details.w;
        this.currentH = details.h;
        this.editL = details.l;
        this.editW = details.w;
        this.editH = details.h;

        // Cập nhật hoặc bổ sung ngay vào danh sách frameTracks
        const existingIdx = this.frameTracks.findIndex((t) => t.uiId === details.clientId);
        const item: FrameTrackItem = {
          uiId: details.clientId,
          serverId: details.serverId || details.clientId,
          label: details.label || "Car",
          x: details.x,
          y: details.y,
          z: details.z,
          yawDeg: details.yawDeg,
          l: details.l,
          w: details.w,
          h: details.h,
        };
        if (existingIdx >= 0) {
          this.frameTracks[existingIdx] = item;
        } else {
          this.frameTracks.push(item);
        }

        this.updateContent();
      } else if (clientId && clientId !== this.selectedUiId) {
        console.log(`[CVAT 3D Suite] Tự động chọn xe #${clientId} từ click Canvas 3D`);
        this.selectTrackByUiId(clientId);
      }
    });

    // Lắng nghe tín hiệu khi danh sách track trong Redux thay đổi (vừa vẽ xong box mới)
    window.addEventListener("CVAT_EXT_RES_FRAME_TRACKS_DIRTY", () => {
      this.syncFrameTracks();
    });
  }

  /**
   * Vòng lặp quét Frame và Đồng bộ xe thời gian thực (Realtime Loop)
   */
  private startPollingLoop(): void {
    this.pollInterval = setInterval(async () => {
      if (!this.currentCtx || !this.currentCtx.jobId) return;

      const frame = CVATBridge.getCurrentFrame();
      const frameChanged = frame !== this.currentFrameNumber;
      this.currentFrameNumber = frame;

      // 1. Quét danh sách các xe có ở frame này
      if (frameChanged || this.frameTracks.length === 0) {
        await this.syncFrameTracks();
      }

      // 2. Quét xem có active item nào trên sidebar không
      const active = CVATBridge.getActiveTrackId();
      if (active.id !== null && active.id !== this.selectedUiId) {
        await this.selectTrackByUiId(active.id);
      }
    }, 800);

    setTimeout(() => this.syncFrameTracks(), 250);
  }

  /**
   * Đồng bộ danh sách xe có mặt tại Frame hiện tại
   */
  public async syncFrameTracks(): Promise<void> {
    if (!this.currentCtx || !this.currentCtx.jobId) return;

    this.currentFrameNumber = CVATBridge.getCurrentFrame();
    const tracks = await CVATBridge.getTracksInCurrentFrame(this.currentCtx.jobId, this.currentFrameNumber);
    this.frameTracks = tracks;

    const isCurrentTrackInFrame = tracks.some((t) => t.uiId === this.selectedUiId);
    if (!isCurrentTrackInFrame && tracks.length > 0) {
      await this.selectTrackByUiId(tracks[0].uiId);
    } else if (isCurrentTrackInFrame && this.selectedUiId) {
      const cur = tracks.find((t) => t.uiId === this.selectedUiId);
      if (cur) {
        this.selectedServerId = cur.serverId;
        this.currentLabel = cur.label;
        this.currentX = cur.x;
        this.currentY = cur.y;
        this.currentZ = cur.z;
        this.currentYawDeg = cur.yawDeg;
        this.currentL = cur.l;
        this.currentW = cur.w;
        this.currentH = cur.h;
        this.editL = cur.l;
        this.editW = cur.w;
        this.editH = cur.h;
      }
      this.updateContent();
    } else {
      this.updateContent();
    }
  }

  /**
   * Chọn xe theo UI ID (#1, #2...) và kích hoạt highlight trên Canvas
   */
  public async selectTrackByUiId(uiId: number, details?: any): Promise<void> {
    this.selectedUiId = uiId;

    // Kích hoạt sáng viền đối tượng trên Three.js Canvas
    CVATBridge.activateCanvasTrack(uiId);

    if (details) {
      this.selectedServerId = details.serverId || null;
      this.currentLabel = details.label || `Xe #${uiId}`;
      this.currentX = details.x;
      this.currentY = details.y;
      this.currentZ = details.z;
      this.currentYawDeg = details.yawDeg;
      this.currentL = details.l;
      this.currentW = details.w;
      this.currentH = details.h;
      this.editL = details.l;
      this.editW = details.w;
      this.editH = details.h;
      this.updateContent();
      return;
    }

    const foundInFrame = this.frameTracks.find((t) => t.uiId === uiId);
    if (foundInFrame) {
      this.selectedServerId = foundInFrame.serverId;
      this.currentLabel = foundInFrame.label;
      this.currentX = foundInFrame.x;
      this.currentY = foundInFrame.y;
      this.currentZ = foundInFrame.z;
      this.currentYawDeg = foundInFrame.yawDeg;
      this.currentL = foundInFrame.l;
      this.currentW = foundInFrame.w;
      this.currentH = foundInFrame.h;
      this.editL = foundInFrame.l;
      this.editW = foundInFrame.w;
      this.editH = foundInFrame.h;
      this.updateContent();
      return;
    }

    // Nếu là box vừa mới tạo chưa có trong danh sách frameTracks, đồng bộ ngay tức thì
    await this.syncFrameTracks();
  }

  public selectPrevTrack(): void {
    if (this.frameTracks.length === 0) return;
    const idx = this.frameTracks.findIndex((t) => t.uiId === this.selectedUiId);
    if (idx > 0) {
      this.selectTrackByUiId(this.frameTracks[idx - 1].uiId);
    } else {
      this.selectTrackByUiId(this.frameTracks[this.frameTracks.length - 1].uiId);
    }
  }

  public selectNextTrack(): void {
    if (this.frameTracks.length === 0) return;
    const idx = this.frameTracks.findIndex((t) => t.uiId === this.selectedUiId);
    if (idx !== -1 && idx < this.frameTracks.length - 1) {
      this.selectTrackByUiId(this.frameTracks[idx + 1].uiId);
    } else {
      this.selectTrackByUiId(this.frameTracks[0].uiId);
    }
  }

  /**
   * Xử lý Lật đầu xe 180° (REALTIME 100%, ZERO-F5)
   */
  public async handleFlipYaw(currentFrameOnly: boolean): Promise<void> {
    if (!this.currentCtx || !this.currentCtx.jobId) {
      this.showToast("Chưa kết nối Job CVAT!", "warning");
      return;
    }

    if (this.selectedUiId === null) {
      this.showToast("Vui lòng chọn xe từ danh sách!", "warning");
      return;
    }

    if (this.isProcessing) return;
    this.isProcessing = true;
    this.showToast(`Đang lật hướng 180° xe #${this.selectedUiId}...`, "info");

    try {
      const serverId = this.selectedServerId || this.selectedUiId;
      const res = await CVATBridge.flipTrackYaw(this.currentCtx.jobId, this.selectedUiId, serverId, currentFrameOnly);

      this.currentYawDeg = res.newYawDeg;
      const targetItem = this.frameTracks.find((t) => t.uiId === this.selectedUiId);
      if (targetItem) {
        targetItem.yawDeg = res.newYawDeg;
      }

      this.showToast(res.message, "success");
    } catch (err: any) {
      this.showToast(`Lỗi: ${err.message || err}`, "error");
    } finally {
      this.isProcessing = false;
      this.updateContent();
    }
  }

  /**
   * Xử lý Cập nhật kích thước (L, W, H) linh hoạt: Áp dụng Chỉ Frame này hoặc Toàn bộ Track
   */
  public async handleUpdateDimensions(l: number, w: number, h: number, applyToTrack: boolean): Promise<void> {
    if (!this.currentCtx || !this.currentCtx.jobId) {
      this.showToast("Chưa kết nối Job CVAT!", "warning");
      return;
    }

    if (this.selectedUiId === null) {
      this.showToast("Vui lòng chọn xe trước!", "warning");
      return;
    }

    if (l <= 0 || w <= 0 || h <= 0) {
      this.showToast("Kích thước không hợp lệ!", "warning");
      return;
    }

    if (this.isProcessing) return;
    this.isProcessing = true;
    const scopeMsg = applyToTrack ? "toàn bộ track" : "frame này";
    this.showToast(`Đang lưu ${l}x${w}x${h}m cho ${scopeMsg}...`, "info");

    try {
      const serverId = this.selectedServerId || this.selectedUiId;
      const res = await CVATBridge.updateTrackDimensions(
        this.currentCtx.jobId,
        this.selectedUiId,
        serverId,
        l,
        w,
        h,
        applyToTrack
      );

      this.currentL = l;
      this.currentW = w;
      this.currentH = h;
      this.editL = l;
      this.editW = w;
      this.editH = h;
      this.currentZ = res.newZ;

      const targetItem = this.frameTracks.find((t) => t.uiId === this.selectedUiId);
      if (targetItem) {
        targetItem.l = l;
        targetItem.w = w;
        targetItem.h = h;
        targetItem.z = res.newZ;
      }

      this.showToast(res.message, "success");
    } catch (err: any) {
      this.showToast(`Lỗi: ${err.message || err}`, "error");
    } finally {
      this.isProcessing = false;
      this.updateContent();
    }
  }

  /**
   * Xử lý Tăng/Giảm kích thước từng bước (±0.05m)
   */
  public handleStepDimension(axis: "l" | "w" | "h", delta: number): void {
    if (axis === "l") {
      this.editL = Number(Math.max(0.5, this.editL + delta).toFixed(2));
    } else if (axis === "w") {
      this.editW = Number(Math.max(0.4, this.editW + delta).toFixed(2));
    } else if (axis === "h") {
      this.editH = Number(Math.max(0.4, this.editH + delta).toFixed(2));
    }
    this.handleUpdateDimensions(this.editL, this.editW, this.editH, this.applyToTrack);
  }

  /**
   * Xử lý Ghim Mặt Đất & Địa Hình Vỉa Hè (Ground & Curb Snapping Realtime 100%, ZERO-F5)
   */
  public async handleSnapGround(
    mode: "road" | "curb" | "half_curb" | "micro_adjust" | "micro_adjust_pitch" | "micro_adjust_roll" | "reset_slope",
    params?: { deltaCm?: number; deltaDeg?: number; curbHeight?: number; targetGroundZ?: number }
  ): Promise<void> {
    if (!this.currentCtx || !this.currentCtx.jobId) {
      this.showToast("Chưa kết nối Job CVAT!", "warning");
      return;
    }

    if (this.selectedUiId === null) {
      this.showToast("Vui lòng chọn xe trước!", "warning");
      return;
    }

    if (this.isProcessing) return;
    this.isProcessing = true;
    this.showToast("Đang quét mặt đất LiDAR...", "info");

    try {
      const serverId = this.selectedServerId || this.selectedUiId;
      const res = await CVATBridge.snapTrackToGround(
        this.currentCtx.jobId,
        this.selectedUiId,
        serverId,
        mode,
        params
      );

      this.currentZ = res.newZ;
      const targetItem = this.frameTracks.find((t) => t.uiId === this.selectedUiId);
      if (targetItem) {
        targetItem.z = res.newZ;
      }

      this.showToast(res.message, "success");
    } catch (err: any) {
      this.showToast(`Lỗi: ${err.message || err}`, "error");
    } finally {
      this.isProcessing = false;
      this.updateContent();
    }
  }

  /**
   * Xử lý Căn Hộp Bám Cụm Điểm BẢO TOÀN KÍCH THƯỚC (Preserving Dimensions Alignment)
   * Tự động bay tới ôm khít cụm điểm mà TUYỆT ĐỐI GIỮ NGUYÊN kích thước L, W, H của xe.
   */
  public async handleAlignBoxToPoints(): Promise<void> {
    if (!this.currentCtx || !this.currentCtx.jobId) {
      this.showToast("Chưa kết nối Job CVAT!", "warning");
      return;
    }

    if (this.selectedUiId === null) {
      this.showToast("Vui lòng chọn xe trước!", "warning");
      return;
    }

    if (this.isProcessing) return;
    this.isProcessing = true;
    this.showToast("Đang căn hộp bám cụm điểm & giữ nguyên kích thước...", "info");

    try {
      const serverId = this.selectedServerId || this.selectedUiId;
      const res = await CVATBridge.alignBoxToPoints(
        this.currentCtx.jobId,
        this.selectedUiId,
        serverId
      );

      if (res.success) {
        if (res.newX !== undefined) this.currentX = res.newX;
        if (res.newY !== undefined) this.currentY = res.newY;
        if (res.newZ !== undefined) this.currentZ = res.newZ;
        // BẢO TOÀN KÍCH THƯỚC L, W, H!

        const targetItem = this.frameTracks.find((t) => t.uiId === this.selectedUiId);
        if (targetItem) {
          if (res.newX !== undefined) targetItem.x = res.newX;
          if (res.newY !== undefined) targetItem.y = res.newY;
          if (res.newZ !== undefined) targetItem.z = res.newZ;
        }

        this.showToast(res.message, "success");
      } else {
        this.showToast(res.message, "error");
      }
    } catch (err: any) {
      this.showToast(`Lỗi Căn Hộp: ${err.message || err}`, "error");
    } finally {
      this.isProcessing = false;
      this.updateContent();
    }
  }

  /**
   * Giữ tương thích ngược với handleTightFit
   */
  public async handleTightFit(): Promise<void> {
    await this.handleAlignBoxToPoints();
  }

  /**
   * Xử lý Khớp Kích Thước Chuẩn Catalog (Catalog Best-Fit)
   */
  public async handleCatalogFit(): Promise<void> {
    if (!this.currentCtx || !this.currentCtx.jobId) {
      this.showToast("Chưa kết nối Job CVAT!", "warning");
      return;
    }

    if (this.selectedUiId === null) {
      this.showToast("Vui lòng chọn xe trước!", "warning");
      return;
    }

    if (this.isProcessing) return;
    this.isProcessing = true;
    this.showToast("Đang đối chiếu và khớp kích thước Catalog...", "info");

    try {
      const serverId = this.selectedServerId || this.selectedUiId;
      const res = await CVATBridge.autoFitTrack(
        this.currentCtx.jobId,
        this.selectedUiId,
        serverId,
        false,
        this.applyToTrack,
        "catalog"
      );

      if (res.success) {
        if (res.newX !== undefined) this.currentX = res.newX;
        if (res.newY !== undefined) this.currentY = res.newY;
        if (res.newZ !== undefined) this.currentZ = res.newZ;
        if (res.newL !== undefined) {
          this.currentL = res.newL;
          this.editL = res.newL;
        }
        if (res.newW !== undefined) {
          this.currentW = res.newW;
          this.editW = res.newW;
        }
        if (res.newH !== undefined) {
          this.currentH = res.newH;
          this.editH = res.newH;
        }

        const targetItem = this.frameTracks.find((t) => t.uiId === this.selectedUiId);
        if (targetItem) {
          if (res.newX !== undefined) targetItem.x = res.newX;
          if (res.newY !== undefined) targetItem.y = res.newY;
          if (res.newZ !== undefined) targetItem.z = res.newZ;
          if (res.newL !== undefined) targetItem.l = res.newL;
          if (res.newW !== undefined) targetItem.w = res.newW;
          if (res.newH !== undefined) targetItem.h = res.newH;
        }

        this.showToast(res.message, "success");
      } else {
        this.showToast(res.message, "error");
      }
    } catch (err: any) {
      this.showToast(`Lỗi Khớp Catalog: ${err.message || err}`, "error");
    } finally {
      this.isProcessing = false;
      this.updateContent();
    }
  }

  /**
   * Giữ tương thích ngược với handleAutoFit
   */
  public async handleAutoFit(tightFit: boolean = true): Promise<void> {
    if (tightFit) {
      await this.handleTightFit();
    } else {
      await this.handleCatalogFit();
    }
  }

  /**
   * Xử lý Quét Mốc Chuẩn Đẹp Nhất & Tự Fit Đồng Bộ Toàn Track (Smart Multi-Frame Anchor Fit)
   */
  public async handleSmartAnchorFit(): Promise<void> {
    if (!this.currentCtx || !this.currentCtx.jobId) {
      this.showToast("Chưa kết nối Job CVAT!", "warning");
      return;
    }

    if (this.selectedUiId === null) {
      this.showToast("Vui lòng chọn xe trước!", "warning");
      return;
    }

    if (this.isProcessing) return;
    this.isProcessing = true;
    this.showToast("Đang tìm mốc chuẩn và fit đồng bộ toàn track...", "info");

    try {
      const serverId = this.selectedServerId || this.selectedUiId;
      const res = await CVATBridge.smartAnchorTrackFit(
        this.currentCtx.jobId,
        this.selectedUiId,
        serverId
      );

      if (res.success) {
        if (res.optL !== undefined) {
          this.currentL = res.optL;
          this.editL = res.optL;
        }
        if (res.optW !== undefined) {
          this.currentW = res.optW;
          this.editW = res.optW;
        }
        if (res.optH !== undefined) {
          this.currentH = res.optH;
          this.editH = res.optH;
        }

        const targetItem = this.frameTracks.find((t) => t.uiId === this.selectedUiId);
        if (targetItem) {
          if (res.optL !== undefined) targetItem.l = res.optL;
          if (res.optW !== undefined) targetItem.w = res.optW;
          if (res.optH !== undefined) targetItem.h = res.optH;
        }

        this.showToast(res.message, "success");
      } else {
        this.showToast(res.message, "error");
      }
    } catch (err: any) {
      this.showToast(`Lỗi Fit Mốc Toàn Track: ${err.message || err}`, "error");
    } finally {
      this.isProcessing = false;
      this.updateContent();
    }
  }

  private updateContent(): void {
    if (!this.container || !this.currentCtx) return;

    const jobText = this.currentCtx.jobId ? `#${this.currentCtx.jobId}` : "OFFLINE";

    // Lọc danh sách xe theo từ khóa tìm kiếm
    const filteredTracks = this.frameTracks.filter((t) => {
      if (!this.searchKeyword.trim()) return true;
      const kw = this.searchKeyword.trim().toLowerCase().replace("#", "");
      return String(t.uiId).includes(kw) || t.label.toLowerCase().includes(kw);
    });

    // Tạo HTML các item trong Dropdown
    let dropdownItemsHtml = "";
    if (filteredTracks.length > 0) {
      dropdownItemsHtml = filteredTracks
        .map((t) => {
          const isSelected = t.uiId === this.selectedUiId;
          return `
            <div class="dropdown-track-item" data-uiid="${t.uiId}" style="
              padding: 6px 10px;
              border-radius: 6px;
              background: ${isSelected ? "rgba(16, 185, 129, 0.2)" : "transparent"};
              border: 1px solid ${isSelected ? "rgba(16, 185, 129, 0.4)" : "transparent"};
              color: ${isSelected ? "#6ee7b7" : "#e4e4e7"};
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: space-between;
              font-family: ui-monospace, monospace;
              font-size: 11px;
              transition: background 0.12s;
            ">
              <span style="display: flex; align-items: center; gap: 8px;">
                <span style="font-weight: 700; color: ${isSelected ? "#10b981" : "#a1a1aa"};">#${t.uiId}</span>
                <span style="color: #fafafa; font-weight: 500;">${t.label}</span>
              </span>
              <span style="font-size: 10px; color: #71717a;">
                Z: ${t.z}m • ${t.yawDeg}°
                ${isSelected ? `<span style="color: #10b981; margin-left: 4px;">●</span>` : ""}
              </span>
            </div>
          `;
        })
        .join("");
    } else {
      dropdownItemsHtml = `
        <div style="font-size: 11px; color: #71717a; padding: 8px; text-align: center; font-style: italic;">
          Không tìm thấy xe nào khớp với "${this.searchKeyword}"
        </div>
      `;
    }

    // Tìm Best-Fit Catalog xe tương ứng để gợi ý
    const bestFit = findBestFitCatalog(
      this.currentL || 4.6,
      this.currentW || 1.8,
      this.currentH || 1.45,
      this.currentLabel
    );

    // ==========================================
    // RENDER NỘI DUNG TỪNG MODULE TAB (100% FLAT SVG ICONS, NO 3D EMOJI)
    // ==========================================
    let tabContentHtml = "";

    // --- TAB 1: KÍCH THƯỚC (DIMENSIONS & TIGHT FIT & CATALOG) ---
    if (this.activeTab === "dimensions") {
      tabContentHtml = `
        <!-- BỘ ĐIỀU CHỈNH KÍCH THƯỚC (L, W, H) -->
        <div style="
          background: rgba(24, 24, 27, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          padding: 8px 10px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        ">
          <!-- TOGGLE SWITCH: CHỈ FRAME NÀY VS TOÀN TRACK -->
          <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.06);">
            <span style="font-size: 11px; font-weight: 600; color: #a1a1aa;">Phạm vi áp dụng:</span>
            <div id="btn-toggle-scope" style="
              background: #18181b;
              border: 1px solid rgba(255, 255, 255, 0.1);
              border-radius: 6px;
              display: flex;
              padding: 2px;
              cursor: pointer;
              font-size: 10px;
              font-family: ui-monospace, monospace;
            ">
              <span style="
                padding: 3px 8px;
                border-radius: 4px;
                background: ${!this.applyToTrack ? "#27272a" : "transparent"};
                color: ${!this.applyToTrack ? "#10b981" : "#71717a"};
                font-weight: ${!this.applyToTrack ? "600" : "normal"};
              ">Frame Này</span>
              <span style="
                padding: 3px 8px;
                border-radius: 4px;
                background: ${this.applyToTrack ? "rgba(239, 68, 68, 0.2)" : "transparent"};
                color: ${this.applyToTrack ? "#fca5a5" : "#71717a"};
                font-weight: ${this.applyToTrack ? "600" : "normal"};
              ">Toàn Track</span>
            </div>
          </div>

          <!-- 3 HÀNG STEPPER (L, W, H) -->
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px;">
            <!-- Chiều Dài L -->
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <span style="font-size: 10px; color: #a1a1aa; font-family: monospace;">Dài (L):</span>
              <div style="display: flex; align-items: center; background: #09090b; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px;">
                <button class="btn-step" data-axis="l" data-delta="-0.05" style="border: none; background: transparent; color: #71717a; padding: 4px; cursor: pointer;">-</button>
                <input id="input-dim-l" type="number" step="0.05" value="${this.editL || this.currentL}" style="width: 100%; border: none; background: transparent; color: #38bdf8; font-size: 11px; font-weight: bold; text-align: center; outline: none; font-family: monospace;" />
                <button class="btn-step" data-axis="l" data-delta="0.05" style="border: none; background: transparent; color: #71717a; padding: 4px; cursor: pointer;">+</button>
              </div>
            </div>

            <!-- Chiều Rộng W -->
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <span style="font-size: 10px; color: #a1a1aa; font-family: monospace;">Rộng (W):</span>
              <div style="display: flex; align-items: center; background: #09090b; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px;">
                <button class="btn-step" data-axis="w" data-delta="-0.05" style="border: none; background: transparent; color: #71717a; padding: 4px; cursor: pointer;">-</button>
                <input id="input-dim-w" type="number" step="0.05" value="${this.editW || this.currentW}" style="width: 100%; border: none; background: transparent; color: #38bdf8; font-size: 11px; font-weight: bold; text-align: center; outline: none; font-family: monospace;" />
                <button class="btn-step" data-axis="w" data-delta="0.05" style="border: none; background: transparent; color: #71717a; padding: 4px; cursor: pointer;">+</button>
              </div>
            </div>

            <!-- Chiều Cao H -->
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <span style="font-size: 10px; color: #a1a1aa; font-family: monospace;">Cao (H):</span>
              <div style="display: flex; align-items: center; background: #09090b; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px;">
                <button class="btn-step" data-axis="h" data-delta="-0.05" style="border: none; background: transparent; color: #71717a; padding: 4px; cursor: pointer;">-</button>
                <input id="input-dim-h" type="number" step="0.05" value="${this.editH || this.currentH}" style="width: 100%; border: none; background: transparent; color: #38bdf8; font-size: 11px; font-weight: bold; text-align: center; outline: none; font-family: monospace;" />
                <button class="btn-step" data-axis="h" data-delta="0.05" style="border: none; background: transparent; color: #71717a; padding: 4px; cursor: pointer;">+</button>
              </div>
            </div>
          </div>

          <!-- NÚT ÁP DỤNG KÍCH THƯỚC ĐÃ NHẬP -->
          <button id="btn-apply-dimensions" style="
            background: #27272a;
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: #f4f4f5;
            padding: 6px 10px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            transition: all 0.15s;
          ">
            <span style="display: flex; align-items: center;">${ICONS.save}</span>
            <span>Lưu Kích Thước (${this.applyToTrack ? "Toàn Track" : "Frame Này"})</span>
          </button>
        </div>

        <!-- 3 NÚT HÀNH ĐỘNG FIT CHUYÊN BIỆT: ALIGN TO POINTS (GIỮ SIZE), CATALOG & QUÉT MỐC ĐA FRAME -->
        <div style="display: flex; flex-direction: column; gap: 5px;">
          <!-- NÚT 1: CĂN HỘP BÁM CỤM ĐIỂM (BẢO TOÀN KÍCH THƯỚC L, W, H) -->
          <button id="btn-tight-fit" title="Tự động dịch tâm và ôm trọn cụm điểm LiDAR, giữ nguyên 100% kích cỡ chuẩn" style="
            background: rgba(16, 185, 129, 0.15);
            border: 1px solid #10b981;
            color: #6ee7b7;
            padding: 8px 12px;
            border-radius: 8px;
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            transition: all 0.12s;
          ">
            <span style="display: flex; align-items: center; gap: 7px;">
              <span style="display: flex; align-items: center;">${ICONS.tightFit}</span>
              <span>Căn Hộp Bám Cụm Điểm (Giữ Size)</span>
            </span>
            <kbd style="font-size: 9px; font-family: monospace; background: #18181b; padding: 1px 5px; border-radius: 4px; color: #a7f3d0;">T</kbd>
          </button>

          <!-- NÚT 2: QUÉT MỐC ĐA FRAME (CHỌN FRAME HIỂN THỊ TỐT NHẤT) -->
          <button id="btn-smart-anchor-fit" title="Duyệt qua toàn bộ frame của xe trong track, chọn frame có cụm điểm đầy đủ nhất để đồng bộ kích thước" style="
            background: rgba(168, 85, 247, 0.12);
            border: 1px solid rgba(168, 85, 247, 0.35);
            color: #d8b4fe;
            padding: 7px 12px;
            border-radius: 8px;
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            transition: all 0.15s;
          ">
            <span style="display: flex; align-items: center; gap: 7px;">
              <span style="display: flex; align-items: center;">${ICONS.link}</span>
              <span>Quét Mốc Đa Frame (Chọn Frame Đẹp)</span>
            </span>
            <span style="font-size: 9px; font-family: monospace; background: rgba(0,0,0,0.35); padding: 1px 5px; border-radius: 4px; color: #d8b4fe;">MULTI-SCAN</span>
          </button>

          <!-- NÚT 3: KHỚP KÍCH THƯỚC CHUẨN CATALOG -->
          <button id="btn-catalog-fit" title="Gợi ý và khớp kích thước theo catalog phương tiện chuẩn" style="
            background: rgba(14, 165, 233, 0.12);
            border: 1px solid rgba(14, 165, 233, 0.35);
            color: #7dd3fc;
            padding: 7px 12px;
            border-radius: 8px;
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            transition: all 0.12s;
          ">
            <span style="display: flex; align-items: center; gap: 7px;">
              <span style="display: flex; align-items: center;">${ICONS.sparkles}</span>
              <span>Khớp Chuẩn Catalog (Best-Fit)</span>
            </span>
            <kbd style="font-size: 9px; font-family: monospace; background: #18181b; padding: 1px 5px; border-radius: 4px; color: #7dd3fc;">⇧B</kbd>
          </button>

          <!-- GỢI Ý XE KHỚP TỪ CATALOG -->
          <div style="
            font-size: 10px;
            color: #71717a;
            padding: 2px 4px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-family: ui-monospace, monospace;
          ">
            <span>Dòng xe khớp: <strong style="color: #10b981;">${bestFit.matchedItem.name}</strong> (${bestFit.confidence}%)</span>
            <button class="catalog-btn" data-l="${bestFit.recommendedL}" data-w="${bestFit.recommendedW}" data-h="${bestFit.recommendedH}" data-name="${bestFit.matchedItem.name}" style="
              border: none;
              background: transparent;
              color: #38bdf8;
              font-size: 10px;
              cursor: pointer;
              text-decoration: underline;
            ">Áp dụng</button>
          </div>
        </div>

        <!-- PRESET CATALOG NHANH -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
          ${STANDARD_VEHICLE_CATALOG.slice(0, 4)
            .map(
              (item) => `
            <button class="catalog-btn" data-l="${item.l}" data-w="${item.w}" data-h="${item.h}" data-name="${item.name}" style="
              background: #18181b;
              border: 1px solid rgba(255,255,255,0.08);
              color: #d4d4d8;
              padding: 5px 8px;
              border-radius: 6px;
              font-size: 10px;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: space-between;
            ">
              <span style="font-weight: 500;">${item.name}</span>
              <span style="font-size: 8px; font-family: monospace; color: #71717a;">${item.l}x${item.w}m</span>
            </button>
          `
            )
            .join("")}
        </div>
      `;
    }

    // --- TAB 2: HƯỚNG & LẬT XE (ROTATION & FLIP) ---
    else if (this.activeTab === "rotation") {
      tabContentHtml = `
        <!-- LẬT 180 ĐỘ -->
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <div style="font-size: 10px; font-weight: 600; text-transform: uppercase; color: #71717a;">Lật Đầu Xe 180°</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
            <button id="btn-flip-frame" style="
              background: #27272a;
              border: 1px solid rgba(255, 255, 255, 0.08);
              color: #f4f4f5;
              padding: 8px 10px;
              border-radius: 8px;
              font-size: 11px;
              font-weight: 500;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: space-between;
            ">
              <span style="display: flex; align-items: center; gap: 6px;">
                <span style="display: flex; align-items: center;">${ICONS.flip}</span>
                <span>Lật Frame này</span>
              </span>
              <kbd style="font-size: 9px; font-family: monospace; background: #18181b; padding: 1px 4px; border-radius: 4px; color: #71717a;">F</kbd>
            </button>

            <button id="btn-flip-track" style="
              background: rgba(239, 68, 68, 0.12);
              border: 1px solid rgba(239, 68, 68, 0.3);
              color: #fca5a5;
              padding: 8px 10px;
              border-radius: 8px;
              font-size: 11px;
              font-weight: 500;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: space-between;
            ">
              <span style="display: flex; align-items: center; gap: 6px;">
                <span style="display: flex; align-items: center;">${ICONS.flip}</span>
                <span>Lật Toàn Track</span>
              </span>
              <kbd style="font-size: 9px; font-family: monospace; background: #18181b; padding: 1px 4px; border-radius: 4px; color: #71717a;">⇧F</kbd>
            </button>
          </div>
        </div>

        <!-- VI CHỈNH GÓC XOAY -->
        <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 4px;">
          <div style="font-size: 10px; font-weight: 600; text-transform: uppercase; color: #71717a;">Vi Chỉnh Góc Yaw</div>
          <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px;">
            <button class="btn-rot" data-deg="-90" style="background: #18181b; border: 1px solid rgba(255,255,255,0.08); color: #d4d4d8; font-size: 10px; font-family: monospace; padding: 6px 0; border-radius: 6px; cursor: pointer;">-90°</button>
            <button class="btn-rot" data-deg="-15" style="background: #18181b; border: 1px solid rgba(255,255,255,0.08); color: #d4d4d8; font-size: 10px; font-family: monospace; padding: 6px 0; border-radius: 6px; cursor: pointer;">-15°</button>
            <button class="btn-rot" data-deg="-5" style="background: #18181b; border: 1px solid rgba(255,255,255,0.08); color: #d4d4d8; font-size: 10px; font-family: monospace; padding: 6px 0; border-radius: 6px; cursor: pointer;">-5°</button>
            <button class="btn-rot" data-deg="5" style="background: #18181b; border: 1px solid rgba(255,255,255,0.08); color: #10b981; font-size: 10px; font-family: monospace; padding: 6px 0; border-radius: 6px; cursor: pointer;">+5°</button>
            <button class="btn-rot" data-deg="15" style="background: #18181b; border: 1px solid rgba(255,255,255,0.08); color: #10b981; font-size: 10px; font-family: monospace; padding: 6px 0; border-radius: 6px; cursor: pointer;">+15°</button>
            <button class="btn-rot" data-deg="90" style="background: #18181b; border: 1px solid rgba(255,255,255,0.08); color: #10b981; font-size: 10px; font-family: monospace; padding: 6px 0; border-radius: 6px; cursor: pointer;">+90°</button>
          </div>
        </div>
      `;
    }

    // --- TAB 3: GHIM MẶT ĐẤT & VỈA HÈ (GROUND & CURB) ---
    else if (this.activeTab === "ground") {
      tabContentHtml = `
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <!-- GHIM MẶT ĐƯỜNG & VỈA HÈ -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
            <button id="btn-snap-road" title="Ghim sát mặt đường và tự động khớp góc dốc Pitch dọc & Roll ngang theo thực tế 3D" style="
              background: #27272a;
              border: 1px solid rgba(45, 212, 191, 0.3);
              color: #2dd4bf;
              padding: 8px 10px;
              border-radius: 8px;
              font-size: 11px;
              font-weight: 500;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: space-between;
            ">
              <span style="display: flex; align-items: center; gap: 6px;">
                <span style="display: flex; align-items: center;">${ICONS.road}</span>
                <span>Mặt Đường Bám Dốc 3D</span>
              </span>
              <kbd style="font-size: 9px; font-family: monospace; background: #18181b; padding: 1px 4px; border-radius: 4px; color: #71717a;">G</kbd>
            </button>

            <button id="btn-snap-curb" style="
              background: #27272a;
              border: 1px solid rgba(245, 158, 11, 0.3);
              color: #fbbf24;
              padding: 8px 10px;
              border-radius: 8px;
              font-size: 11px;
              font-weight: 500;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: space-between;
            ">
              <span style="display: flex; align-items: center; gap: 6px;">
                <span style="display: flex; align-items: center;">${ICONS.curb}</span>
                <span>Vỉa Hè +15cm</span>
              </span>
              <kbd style="font-size: 9px; font-family: monospace; background: #18181b; padding: 1px 4px; border-radius: 4px; color: #71717a;">⌥G</kbd>
            </button>
          </div>

          <!-- GÁC LỀ NGHIÊNG ROLL & VI CHỈNH CENTIMET -->
          <div style="display: grid; grid-template-columns: 1.2fr 1fr; gap: 6px;">
            <button id="btn-snap-half-curb" style="
              background: rgba(244, 63, 94, 0.1);
              border: 1px solid rgba(244, 63, 94, 0.25);
              color: #fda4af;
              padding: 6px 8px;
              border-radius: 8px;
              font-size: 10px;
              font-weight: 500;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: space-between;
            ">
              <span style="display: flex; align-items: center; gap: 5px;">
                <span style="display: flex; align-items: center;">${ICONS.layers}</span>
                <span>Gác Lề Nghiêng Roll</span>
              </span>
              <kbd style="font-size: 8px; font-family: monospace; background: #18181b; padding: 1px 3px; border-radius: 3px; color: #71717a;">⇧G</kbd>
            </button>

            <div style="display: flex; gap: 3px; align-items: center;">
              <button class="btn-micro-z" data-delta="-5" title="Hạ 5cm" style="flex: 1; background: #18181b; border: 1px solid rgba(255,255,255,0.08); color: #d4d4d8; font-size: 9px; font-family: monospace; padding: 6px 0; border-radius: 6px; cursor: pointer;">-5</button>
              <button class="btn-micro-z" data-delta="-1" title="Hạ 1cm" style="flex: 1; background: #18181b; border: 1px solid rgba(255,255,255,0.08); color: #d4d4d8; font-size: 9px; font-family: monospace; padding: 6px 0; border-radius: 6px; cursor: pointer;">-1</button>
              <button class="btn-micro-z" data-delta="1" title="Nâng 1cm" style="flex: 1; background: #18181b; border: 1px solid rgba(255,255,255,0.08); color: #2dd4bf; font-size: 9px; font-family: monospace; padding: 6px 0; border-radius: 6px; cursor: pointer;">+1</button>
              <button class="btn-micro-z" data-delta="5" title="Nâng 5cm" style="flex: 1; background: #18181b; border: 1px solid rgba(255,255,255,0.08); color: #2dd4bf; font-size: 9px; font-family: monospace; padding: 6px 0; border-radius: 6px; cursor: pointer;">+5</button>
            </div>
          </div>

          <!-- VI CHỈNH GÓC DỐC SIDE VIEW (PITCH) -->
          <div style="display: flex; align-items: center; justify-content: space-between; background: #18181b; padding: 4px 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.06);">
            <span style="font-size: 10px; color: #a1a1aa; display: flex; align-items: center; gap: 4px;">
              <span style="color: #38bdf8; font-weight: bold;">↕</span> Dốc Side (Pitch)
            </span>
            <div style="display: flex; gap: 3px; align-items: center;">
              <button class="btn-micro-pitch" data-delta="-1" title="Chúc mũi xuống 1°" style="background: #27272a; border: 1px solid rgba(255,255,255,0.08); color: #d4d4d8; font-size: 9px; font-family: monospace; padding: 3px 6px; border-radius: 4px; cursor: pointer;">-1°</button>
              <button class="btn-micro-pitch" data-delta="-0.5" title="Chúc mũi xuống 0.5°" style="background: #27272a; border: 1px solid rgba(255,255,255,0.08); color: #d4d4d8; font-size: 9px; font-family: monospace; padding: 3px 5px; border-radius: 4px; cursor: pointer;">-0.5°</button>
              <button class="btn-micro-pitch" data-delta="0.5" title="Nâng mũi lên 0.5°" style="background: #27272a; border: 1px solid rgba(56, 189, 248, 0.2); color: #38bdf8; font-size: 9px; font-family: monospace; padding: 3px 5px; border-radius: 4px; cursor: pointer;">+0.5°</button>
              <button class="btn-micro-pitch" data-delta="1" title="Nâng mũi lên 1°" style="background: #27272a; border: 1px solid rgba(56, 189, 248, 0.2); color: #38bdf8; font-size: 9px; font-family: monospace; padding: 3px 6px; border-radius: 4px; cursor: pointer;">+1°</button>
            </div>
          </div>

          <!-- VI CHỈNH GÓC NGHIÊNG FRONT VIEW (ROLL) & RESET PHẲNG -->
          <div style="display: flex; align-items: center; justify-content: space-between; background: #18181b; padding: 4px 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.06);">
            <span style="font-size: 10px; color: #a1a1aa; display: flex; align-items: center; gap: 4px;">
              <span style="color: #f43f5e; font-weight: bold;">↔</span> Nghiêng Front (Roll)
            </span>
            <div style="display: flex; gap: 3px; align-items: center;">
              <button class="btn-micro-roll" data-delta="-1" title="Nghiêng phải 1°" style="background: #27272a; border: 1px solid rgba(255,255,255,0.08); color: #d4d4d8; font-size: 9px; font-family: monospace; padding: 3px 6px; border-radius: 4px; cursor: pointer;">-1°</button>
              <button class="btn-micro-roll" data-delta="-0.5" title="Nghiêng phải 0.5°" style="background: #27272a; border: 1px solid rgba(255,255,255,0.08); color: #d4d4d8; font-size: 9px; font-family: monospace; padding: 3px 5px; border-radius: 4px; cursor: pointer;">-0.5°</button>
              <button class="btn-micro-roll" data-delta="0.5" title="Nghiêng trái 0.5°" style="background: #27272a; border: 1px solid rgba(244, 63, 94, 0.2); color: #fda4af; font-size: 9px; font-family: monospace; padding: 3px 5px; border-radius: 4px; cursor: pointer;">+0.5°</button>
              <button class="btn-micro-roll" data-delta="1" title="Nghiêng trái 1°" style="background: #27272a; border: 1px solid rgba(244, 63, 94, 0.2); color: #fda4af; font-size: 9px; font-family: monospace; padding: 3px 6px; border-radius: 4px; cursor: pointer;">+1°</button>
              <button id="btn-reset-slope" title="Đặt lại dốc phẳng 0° (Reset Pitch & Roll)" style="background: #27272a; border: 1px solid rgba(255,255,255,0.15); color: #e4e4e7; font-size: 9px; font-family: monospace; padding: 3px 5px; border-radius: 4px; cursor: pointer; margin-left: 1px;">0°</button>
            </div>
          </div>
        </div>
      `;
    }

    this.container.innerHTML = `
      <!-- SHADCN CARD HEADER (DRAGGABLE HANDLE) -->
      <div id="floating-drag-header" style="
        padding: 10px 14px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(24, 24, 27, 0.75);
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: grab;
      ">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="color: #71717a; display: flex;">${ICONS.grip}</span>
          <span style="color: #10b981; display: flex;">${ICONS.box}</span>
          <span style="font-weight: 600; font-size: 13px; letter-spacing: -0.2px; color: #fafafa;">CVAT 3D Suite</span>
          <span style="
            font-size: 10px;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            background: #27272a;
            color: #10b981;
            padding: 2px 6px;
            border-radius: 6px;
            border: 1px solid rgba(255,255,255,0.06);
            font-weight: 600;
          ">${jobText}</span>
        </div>

        <div style="display: flex; align-items: center; gap: 4px;">
          <button id="floating-btn-fullscreen" title="Mở Rộng Toàn Màn Hình · Duyệt Toàn Bộ Track ID (Shift+F)" style="
            background: rgba(37, 99, 235, 0.15);
            border: 1px solid rgba(37, 99, 235, 0.3);
            color: #60a5fa;
            cursor: pointer;
            padding: 4px 6px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 10px;
            font-weight: 600;
          ">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
            <span>Full</span>
          </button>
          <button id="floating-btn-sync-frame" title="Quét lại xe frame này" style="
            background: transparent;
            border: none;
            color: #71717a;
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            display: flex;
            align-items: center;
          ">
            ${ICONS.refresh}
          </button>
          <button id="floating-btn-minimize" title="Thu nhỏ (\`)" style="
            background: transparent;
            border: none;
            color: #71717a;
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            display: flex;
            align-items: center;
          ">
            ${ICONS.minimize}
          </button>
        </div>
      </div>

      <!-- MAIN CONTAINER BODY -->
      <div style="
        padding: 12px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 10px;
      ">
        <!-- KHỐI 1: DROPDOWN SELECT DANH SÁCH XE (SEARCHABLE COMBOBOX) -->
        <div style="
          background: rgba(24, 24, 27, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 10px 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          position: relative;
        ">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 11px; font-weight: 700; color: #f4f4f5; display: flex; align-items: center; gap: 5px;">
              <span>Xe tại Frame #${this.currentFrameNumber}</span>
              <span style="color: #71717a; font-weight: normal;">(${this.frameTracks.length})</span>
            </span>
            <span style="
              font-size: 9px;
              font-family: ui-monospace, monospace;
              color: #10b981;
              background: rgba(16, 185, 129, 0.12);
              border: 1px solid rgba(16, 185, 129, 0.25);
              padding: 1px 6px;
              border-radius: 4px;
              font-weight: 600;
            ">CANVAS AUTO-SELECT</span>
          </div>

          <!-- HEADER SELECT BUTTON & PREV/NEXT -->
          <div style="display: flex; gap: 6px; align-items: center;">
            <button id="btn-dropdown-toggle" style="
              flex: 1;
              background: #18181b;
              border: 1px solid ${this.isDropdownOpen ? "#10b981" : "rgba(255, 255, 255, 0.12)"};
              color: #f4f4f5;
              padding: 7px 10px;
              border-radius: 8px;
              font-size: 12px;
              font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
              font-weight: 600;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: space-between;
              transition: all 0.15s;
            ">
              <span style="display: flex; align-items: center; gap: 6px;">
                <span style="color: #10b981;">${this.selectedUiId ? `#${this.selectedUiId}` : "#0"}</span>
                <span style="font-weight: 500; font-size: 11px; color: #e4e4e7;">${this.selectedUiId ? this.currentLabel : "Chưa chọn xe"}</span>
              </span>
              <span style="color: #71717a; font-size: 10px;">${this.isDropdownOpen ? "▲" : "▼"}</span>
            </button>

            <!-- NÚT PREV / NEXT -->
            <button id="btn-prev-frame-track" title="Xe trước (Phím [)" style="
              background: #18181b;
              border: 1px solid rgba(255,255,255,0.08);
              color: #d4d4d8;
              padding: 6px 8px;
              border-radius: 6px;
              cursor: pointer;
              display: flex;
              align-items: center;
            ">
              ${ICONS.chevronLeft}
            </button>
            <button id="btn-next-frame-track" title="Xe kế (Phím ])" style="
              background: #18181b;
              border: 1px solid rgba(255,255,255,0.08);
              color: #d4d4d8;
              padding: 6px 8px;
              border-radius: 6px;
              cursor: pointer;
              display: flex;
              align-items: center;
            ">
              ${ICONS.chevronRight}
            </button>
          </div>

          <!-- DROPDOWN POPOVER MENU (NẾU ĐANG MỞ) -->
          ${
            this.isDropdownOpen
              ? `
            <div id="dropdown-menu-popover" style="
              background: #18181b;
              border: 1px solid rgba(255, 255, 255, 0.15);
              border-radius: 8px;
              padding: 6px;
              box-shadow: 0 10px 25px rgba(0, 0, 0, 0.6);
              display: flex;
              flex-direction: column;
              gap: 4px;
              max-height: 220px;
              overflow-y: auto;
              z-index: 1000;
            ">
              <!-- Ô TÌM KIẾM NHANH -->
              <input id="input-dropdown-search" type="text" placeholder="Tìm ID (#1) hoặc loại xe..." value="${this.searchKeyword}" style="
                background: #09090b;
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 6px;
                color: #f4f4f5;
                font-size: 11px;
                padding: 5px 8px;
                outline: none;
                font-family: inherit;
                margin-bottom: 2px;
              " />

              <!-- DANH SÁCH ITEM -->
              <div style="display: flex; flex-direction: column; gap: 2px;">
                ${dropdownItemsHtml}
              </div>
            </div>
          `
              : ""
          }
        </div>

        <!-- THẺ THÔNG SỐ TÓM TẮT CỦA XE ĐANG CHỌN -->
        <div style="
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 4px;
          font-size: 10px;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          background: rgba(24, 24, 27, 0.55);
          padding: 6px 8px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          color: #a1a1aa;
        ">
          <div><span style="color: #71717a;">X:</span> ${this.currentX}</div>
          <div><span style="color: #71717a;">Y:</span> ${this.currentY}</div>
          <div><span style="color: #71717a;">Z:</span> ${this.currentZ}</div>
          <div><span style="color: #71717a;">Yaw:</span> <span style="color: #10b981; font-weight: bold;">${this.currentYawDeg}°</span></div>
        </div>

        <!-- NÚT MỞ RỘNG FULLSCREEN TRACK EDITOR (CASE 2 - DUYỆT THEO ID) -->
        <button id="btn-banner-fullscreen-editor" title="Mở Rộng Toàn Màn Hình · Duyệt Toàn Bộ Track ID (Shift+M)" style="
          background: linear-gradient(135deg, rgba(37, 99, 235, 0.2), rgba(30, 64, 175, 0.3));
          border: 1px solid rgba(59, 130, 246, 0.4);
          color: #93c5fd;
          padding: 7px 10px;
          border-radius: 8px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: space-between;
          transition: all 0.15s;
        ">
          <span style="display: flex; align-items: center; gap: 6px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
            <span>Duyệt Toàn Track ID (Full Screen)</span>
          </span>
          <kbd style="font-size: 9px; font-family: monospace; background: rgba(0,0,0,0.4); padding: 1px 4px; border-radius: 3px; color: #bfdbfe;">⇧M</kbd>
        </button>

        <!-- THANH TAB NAVIGATION THEO MODULE CHUYÊN BIỆT -->
        <div style="
          display: flex;
          background: #18181b;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          padding: 3px;
          gap: 3px;
        ">
          <button class="nav-tab-btn" data-tab="dimensions" style="
            flex: 1;
            padding: 5px 6px;
            border-radius: 6px;
            border: none;
            background: ${this.activeTab === "dimensions" ? "rgba(16, 185, 129, 0.2)" : "transparent"};
            color: ${this.activeTab === "dimensions" ? "#6ee7b7" : "#71717a"};
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
            transition: all 0.12s;
          ">
            <span style="display: flex; align-items: center;">${ICONS.ruler}</span>
            <span>Kích Thước</span>
          </button>
          <button class="nav-tab-btn" data-tab="rotation" style="
            flex: 1;
            padding: 5px 6px;
            border-radius: 6px;
            border: none;
            background: ${this.activeTab === "rotation" ? "rgba(16, 185, 129, 0.2)" : "transparent"};
            color: ${this.activeTab === "rotation" ? "#6ee7b7" : "#71717a"};
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
            transition: all 0.12s;
          ">
            <span style="display: flex; align-items: center;">${ICONS.compass}</span>
            <span>Hướng Xoay</span>
          </button>
          <button class="nav-tab-btn" data-tab="ground" style="
            flex: 1;
            padding: 5px 6px;
            border-radius: 6px;
            border: none;
            background: ${this.activeTab === "ground" ? "rgba(16, 185, 129, 0.2)" : "transparent"};
            color: ${this.activeTab === "ground" ? "#6ee7b7" : "#71717a"};
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
            transition: all 0.12s;
          ">
            <span style="display: flex; align-items: center;">${ICONS.alignBottom}</span>
            <span>Ghim Đất</span>
          </button>
        </div>

        <!-- NỘI DUNG MODULE ĐANG CHỌN -->
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${tabContentHtml}
        </div>
      </div>

      <!-- CARD FOOTER -->
      <div style="
        padding: 8px 14px;
        background: rgba(24, 24, 27, 0.5);
        border-top: 1px solid rgba(255, 255, 255, 0.06);
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 10px;
        color: #71717a;
        font-family: ui-monospace, monospace;
      ">
        <span>300K LIDAR FIT</span>
        <span style="color: #10b981; display: flex; align-items: center; gap: 4px;">
          <span style="width: 5px; height: 5px; border-radius: 50%; background: #10b981;"></span>
          CANVAS AUTO-SELECT
        </span>
      </div>
    `;

    // Gắn lại phần tử Toast Overlay vào cuối Container
    if (this.toastOverlay) {
      this.container.appendChild(this.toastOverlay);
    }

    // ==========================================
    // GẮN SỰ KIỆN TƯƠNG TÁC
    // ==========================================

    // 1. Gắn sự kiện chuyển Tab Navigation
    const tabBtns = this.container.querySelectorAll<HTMLButtonElement>(".nav-tab-btn");
    tabBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.dataset.tab as "dimensions" | "rotation" | "ground";
        if (tab && tab !== this.activeTab) {
          this.activeTab = tab;
          this.updateContent();
        }
      });
    });

    // 2. Gắn sự kiện nút Thu nhỏ & Quét Frame
    const minBtn = this.container.querySelector("#floating-btn-minimize");
    if (minBtn) minBtn.addEventListener("click", () => this.toggleMinimize());

    const syncBtn = this.container.querySelector("#floating-btn-sync-frame");
    if (syncBtn) {
      syncBtn.addEventListener("click", async () => {
        this.showToast("Đang quét lại xe ở frame này...", "info");
        await this.syncFrameTracks();
      });
    }

    // 3. Gắn sự kiện Bật/Tắt Dropdown Select
    const dropdownToggle = this.container.querySelector("#btn-dropdown-toggle");
    if (dropdownToggle) {
      dropdownToggle.addEventListener("click", () => {
        this.isDropdownOpen = !this.isDropdownOpen;
        this.updateContent();
        if (this.isDropdownOpen) {
          setTimeout(() => {
            const inputSearch = this.container?.querySelector<HTMLInputElement>("#input-dropdown-search");
            if (inputSearch) inputSearch.focus();
          }, 60);
        }
      });
    }

    // Gắn sự kiện Ô tìm kiếm trong Dropdown
    const inputSearch = this.container.querySelector<HTMLInputElement>("#input-dropdown-search");
    if (inputSearch) {
      inputSearch.addEventListener("input", (e: any) => {
        this.searchKeyword = e.target.value;
        const popover = this.container?.querySelector("#dropdown-menu-popover");
        if (popover) {
          const filtered = this.frameTracks.filter((t) => {
            if (!this.searchKeyword.trim()) return true;
            const kw = this.searchKeyword.trim().toLowerCase().replace("#", "");
            return String(t.uiId).includes(kw) || t.label.toLowerCase().includes(kw);
          });

          const itemsContainer = popover.querySelector("div:last-child");
          if (itemsContainer) {
            itemsContainer.innerHTML = filtered
              .map((t) => {
                const isSelected = t.uiId === this.selectedUiId;
                return `
                  <div class="dropdown-track-item" data-uiid="${t.uiId}" style="
                    padding: 6px 10px;
                    border-radius: 6px;
                    background: ${isSelected ? "rgba(16, 185, 129, 0.2)" : "transparent"};
                    border: 1px solid ${isSelected ? "rgba(16, 185, 129, 0.4)" : "transparent"};
                    color: ${isSelected ? "#6ee7b7" : "#e4e4e7"};
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    font-family: ui-monospace, monospace;
                    font-size: 11px;
                    transition: background 0.12s;
                  ">
                    <span style="display: flex; align-items: center; gap: 8px;">
                      <span style="font-weight: 700; color: ${isSelected ? "#10b981" : "#a1a1aa"};">#${t.uiId}</span>
                      <span style="color: #fafafa; font-weight: 500;">${t.label}</span>
                    </span>
                    <span style="font-size: 10px; color: #71717a;">
                      Z: ${t.z}m • ${t.yawDeg}°
                    </span>
                  </div>
                `;
              })
              .join("");

            // Gắn lại sự kiện click item sau khi search
            itemsContainer.querySelectorAll<HTMLElement>(".dropdown-track-item").forEach((item) => {
              item.addEventListener("click", () => {
                const id = parseInt(item.dataset.uiid || "0", 10);
                if (id > 0) {
                  this.selectTrackByUiId(id);
                  this.isDropdownOpen = false;
                  this.updateContent();
                }
              });
            });
          }
        }
      });
    }

    // Gắn sự kiện click từng item trong Dropdown
    const dropdownItems = this.container.querySelectorAll<HTMLElement>(".dropdown-track-item");
    dropdownItems.forEach((item) => {
      item.addEventListener("click", () => {
        const id = parseInt(item.dataset.uiid || "0", 10);
        if (id > 0) {
          this.selectTrackByUiId(id);
          this.isDropdownOpen = false;
          this.updateContent();
        }
      });
    });

    // 4. Gắn sự kiện Prev / Next
    const prevBtn = this.container.querySelector("#btn-prev-frame-track");
    if (prevBtn) prevBtn.addEventListener("click", () => this.selectPrevTrack());

    const nextBtn = this.container.querySelector("#btn-next-frame-track");
    if (nextBtn) nextBtn.addEventListener("click", () => this.selectNextTrack());

    // 5. Gắn sự kiện Toggle Scope: Frame Này vs Toàn Track
    const scopeToggle = this.container.querySelector("#btn-toggle-scope");
    if (scopeToggle) {
      scopeToggle.addEventListener("click", () => {
        this.applyToTrack = !this.applyToTrack;
        this.updateContent();
        this.showToast(`Phạm vi: ${this.applyToTrack ? "Toàn Bộ Track" : "Chỉ Frame Này"}`, "info");
      });
    }

    // 6. Gắn sự kiện Stepper (L, W, H)
    const stepBtns = this.container.querySelectorAll<HTMLButtonElement>(".btn-step");
    stepBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const axis = btn.dataset.axis as "l" | "w" | "h";
        const delta = parseFloat(btn.dataset.delta || "0");
        if (axis && delta !== 0) {
          this.handleStepDimension(axis, delta);
        }
      });
    });

    // Gắn sự kiện Input trực tiếp (L, W, H)
    const inpL = this.container.querySelector<HTMLInputElement>("#input-dim-l");
    const inpW = this.container.querySelector<HTMLInputElement>("#input-dim-w");
    const inpH = this.container.querySelector<HTMLInputElement>("#input-dim-h");

    if (inpL) inpL.addEventListener("change", () => (this.editL = parseFloat(inpL.value) || this.currentL));
    if (inpW) inpW.addEventListener("change", () => (this.editW = parseFloat(inpW.value) || this.currentW));
    if (inpH) inpH.addEventListener("change", () => (this.editH = parseFloat(inpH.value) || this.currentH));

    const applyDimBtn = this.container.querySelector("#btn-apply-dimensions");
    if (applyDimBtn) {
      applyDimBtn.addEventListener("click", () => {
        const l = inpL ? parseFloat(inpL.value) : this.editL;
        const w = inpW ? parseFloat(inpW.value) : this.editW;
        const h = inpH ? parseFloat(inpH.value) : this.editH;
        this.handleUpdateDimensions(l, w, h, this.applyToTrack);
      });
    }

    // 7. Gắn sự kiện Ôm Sát Cụm Điểm (Tight Fit)
    const tightFitBtn = this.container.querySelector("#btn-tight-fit");
    if (tightFitBtn) {
      tightFitBtn.addEventListener("click", () => this.handleTightFit());
    }

    // Gắn sự kiện Khớp Chuẩn Catalog (Catalog Best-Fit)
    const catalogFitBtn = this.container.querySelector("#btn-catalog-fit");
    if (catalogFitBtn) {
      catalogFitBtn.addEventListener("click", () => this.handleCatalogFit());
    }

    // Tương thích ngược nút cũ nếu có
    const autoFitBtn = this.container.querySelector("#btn-auto-fit-points");
    if (autoFitBtn) {
      autoFitBtn.addEventListener("click", () => this.handleTightFit());
    }

    // Gắn sự kiện Fit Mốc Toàn Track (Multi-Frame Anchor)
    const smartAnchorBtn = this.container.querySelector("#btn-smart-anchor-fit");
    if (smartAnchorBtn) {
      smartAnchorBtn.addEventListener("click", () => this.handleSmartAnchorFit());
    }

    // 8. Gắn sự kiện Preset Catalog
    const catalogBtns = this.container.querySelectorAll<HTMLButtonElement>(".catalog-btn");
    catalogBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const l = parseFloat(btn.dataset.l || "0");
        const w = parseFloat(btn.dataset.w || "0");
        const h = parseFloat(btn.dataset.h || "0");
        if (l > 0 && w > 0 && h > 0) {
          this.handleUpdateDimensions(l, w, h, this.applyToTrack);
        }
      });
    });

    // 9. Gắn sự kiện Lật xe
    const flipFrameBtn = this.container.querySelector("#btn-flip-frame");
    if (flipFrameBtn) flipFrameBtn.addEventListener("click", () => this.handleFlipYaw(true));

    const flipTrackBtn = this.container.querySelector("#btn-flip-track");
    if (flipTrackBtn) flipTrackBtn.addEventListener("click", () => this.handleFlipYaw(false));

    // 10. Gắn sự kiện Xoay Vi Chỉnh Yaw
    const rotBtns = this.container.querySelectorAll<HTMLButtonElement>(".btn-rot");
    rotBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const deg = parseInt(btn.dataset.deg || "0", 10);
        if (deg !== 0) {
          // Tính góc mới
          let newDeg = Math.round(this.currentYawDeg + deg);
          while (newDeg > 180) newDeg -= 360;
          while (newDeg < -180) newDeg += 360;
          const rad = (newDeg * Math.PI) / 180;
          if (this.selectedUiId && this.currentCtx?.jobId) {
            window.dispatchEvent(
              new CustomEvent("CVAT_EXT_REQ_FLIP_YAW", {
                detail: {
                  jobId: this.currentCtx.jobId,
                  frame: this.currentFrameNumber,
                  uiId: this.selectedUiId,
                  serverId: this.selectedServerId,
                  currentFrameOnly: !this.applyToTrack,
                  customYawRad: rad,
                },
              })
            );
            this.currentYawDeg = newDeg;
            this.showToast(`Xoay ${deg > 0 ? "+" : ""}${deg}° ➔ Yaw: ${newDeg}°`, "success");
            this.updateContent();
          }
        }
      });
    });

    // 11. Gắn sự kiện Ghim Mặt Đất & Vỉa Hè (Side & Front View)
    const snapRoadBtn = this.container.querySelector("#btn-snap-road");
    if (snapRoadBtn) snapRoadBtn.addEventListener("click", () => this.handleSnapGround("road"));

    const snapCurbBtn = this.container.querySelector("#btn-snap-curb");
    if (snapCurbBtn) snapCurbBtn.addEventListener("click", () => this.handleSnapGround("curb", { curbHeight: 0.15 }));

    const snapHalfCurbBtn = this.container.querySelector("#btn-snap-half-curb");
    if (snapHalfCurbBtn) snapHalfCurbBtn.addEventListener("click", () => this.handleSnapGround("half_curb", { curbHeight: 0.15 }));

    const microBtns = this.container.querySelectorAll<HTMLButtonElement>(".btn-micro-z");
    microBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const delta = parseInt(btn.dataset.delta || "0", 10);
        if (delta !== 0) {
          this.handleSnapGround("micro_adjust", { deltaCm: delta });
        }
      });
    });

    // Vi chỉnh Dốc Side (Pitch)
    const microPitchBtns = this.container.querySelectorAll<HTMLButtonElement>(".btn-micro-pitch");
    microPitchBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const deltaDeg = parseFloat(btn.dataset.delta || "0");
        if (deltaDeg !== 0) {
          this.handleSnapGround("micro_adjust_pitch", { deltaDeg });
        }
      });
    });

    // Vi chỉnh Nghiêng Front (Roll)
    const microRollBtns = this.container.querySelectorAll<HTMLButtonElement>(".btn-micro-roll");
    microRollBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const deltaDeg = parseFloat(btn.dataset.delta || "0");
        if (deltaDeg !== 0) {
          this.handleSnapGround("micro_adjust_roll", { deltaDeg });
        }
      });
    });

    // Reset Dốc 0° (Phẳng hoàn toàn)
    const resetSlopeBtn = this.container.querySelector("#btn-reset-slope");
    if (resetSlopeBtn) {
      resetSlopeBtn.addEventListener("click", () => {
        this.handleSnapGround("reset_slope");
      });
    }

    // 12. Gắn sự kiện Mở Rộng Full Màn Hình (Fullscreen Track Editor)
    const fullscreenHeaderBtn = this.container.querySelector("#floating-btn-fullscreen");
    if (fullscreenHeaderBtn) {
      fullscreenHeaderBtn.addEventListener("click", () => this.openFullscreenEditor());
    }

    const fullscreenBannerBtn = this.container.querySelector("#btn-banner-fullscreen-editor");
    if (fullscreenBannerBtn) {
      fullscreenBannerBtn.addEventListener("click", () => this.openFullscreenEditor());
    }
  }

  /**
   * Mở giao diện toàn màn hình duyệt và chỉnh sửa toàn bộ track của xe (Label Helper Style)
   */
  public openFullscreenEditor(): void {
    if (!this.currentCtx || !this.currentCtx.jobId) {
      this.showToast("Chưa kết nối Job CVAT!", "warning");
      return;
    }

    if (this.selectedUiId === null) {
      this.showToast("Vui lòng chọn xe trước khi mở toàn màn hình!", "warning");
      return;
    }

    this.trackStudioModal.open(
      this.currentCtx,
      this.selectedUiId,
      this.selectedServerId || undefined,
      this.frameTracks
    );
  }

  public destroy(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
      this.container = null;
    }
    if (this.miniPill && this.miniPill.parentNode) {
      this.miniPill.parentNode.removeChild(this.miniPill);
      this.miniPill = null;
    }
  }
}
