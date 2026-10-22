import { CVATContext } from "../../core/types";
import { ICONS } from "../icons";
import { CVATBridge, FrameTrackItem } from "../../cvat/bridge";
import {
  findBestFitCatalog,
  STANDARD_VEHICLE_CATALOG,
  CAR_PRESETS,
  CYCLIST_PRESETS,
  PEDESTRIAN_PRESETS,
  VehicleCatalogItem,
} from "../../core/catalog";
import { TrackStudioModal } from "./TrackStudioModal";

export interface UndoSnapshot {
  uiId: number;
  serverId: number | null;
  frame: number;
  applyToTrack: boolean;
  boxPoints: number[];
  trackShapesBackup?: Array<{ frame: number; outside?: boolean; points: number[] }>;
  actionName: string;
}

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

  // Ngăn xếp hoàn tác thao tác (Undo / Pre Stack)
  private undoStack: UndoSnapshot[] = [];

  // Chế độ phân loại đối tượng nhanh: "car" | "pedestrian" | "cyclist"
  private selectedCategory: "car" | "pedestrian" | "cyclist" = "car";

  // Trạng thái mở rộng accordion tinh chỉnh nâng cao
  private isAdvancedOpen: boolean = false;

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
  private currentRawPoints: number[] | null = null; // Lưu trữ mảng điểm nguyên bản (16 điểm) từ CVAT

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
  private updatePending: boolean = false;
  private lastRenderedHash: string = "";

  /**
   * Lên lịch cập nhật giao diện bằng requestAnimationFrame (gộp nhiều lần gọi dồn dập, chống nháy DOM).
   */
  public scheduleUpdate(): void {
    if (this.updatePending) return;
    this.updatePending = true;
    requestAnimationFrame(() => {
      this.updatePending = false;
      this.updateContent();
    });
  }

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

    this.scheduleUpdate();
  }

  private createContainer(): void {
    this.container = document.createElement("div");
    this.container.id = "cvat-3d-suite-floating";
    this.container.setAttribute("translate", "no");
    this.container.classList.add("notranslate");
    this.container.style.position = "fixed";
    this.container.style.top = "20px";
    this.container.style.right = "20px";
    this.container.style.width = "370px";
    this.container.style.maxHeight = "calc(100vh - 40px)";
    this.container.style.zIndex = "999995";
    this.container.style.fontFamily = "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

    // shadcn/ui Light Card style (Giao diện trắng hiện đại)
    this.container.style.backgroundColor = "rgba(255, 255, 255, 0.98)";
    this.container.style.backdropFilter = "blur(16px)";
    this.container.style.border = "1px solid #e4e4e7";
    this.container.style.borderRadius = "16px";
    this.container.style.boxShadow = "0 20px 40px -15px rgba(0, 0, 0, 0.08), 0 0 1px 1px rgba(0, 0, 0, 0.04)";
    this.container.style.color = "#09090b";
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
    this.miniPill.style.backgroundColor = "rgba(255, 255, 255, 0.98)";
    this.miniPill.style.backdropFilter = "blur(12px)";
    this.miniPill.style.border = "1px solid #e4e4e7";
    this.miniPill.style.borderRadius = "9999px";
    this.miniPill.style.padding = "8px 14px";
    this.miniPill.style.color = "#09090b";
    this.miniPill.style.fontSize = "12px";
    this.miniPill.style.fontWeight = "600";
    this.miniPill.style.display = "none";
    this.miniPill.style.alignItems = "center";
    this.miniPill.style.gap = "8px";
    this.miniPill.style.boxShadow = "0 10px 25px -5px rgba(0, 0, 0, 0.08)";
    this.miniPill.style.cursor = "pointer";
    this.miniPill.style.userSelect = "none";

    this.miniPill.innerHTML = `
      <span style="width: 8px; height: 8px; border-radius: 50%; background: #10b981; box-shadow: 0 0 6px #10b981;"></span>
      <span>3D Suite</span>
      <span style="font-size: 10px; font-family: monospace; color: #71717a; background: #f4f4f5; border: 1px solid #e4e4e7; padding: 2px 6px; border-radius: 4px;">\`</span>
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

    let bgColor = "#059669";
    let textColor = "#ffffff";
    let iconSvg = ICONS.checkCircle;

    if (type === "info") {
      bgColor = "#0284c7";
      iconSvg = ICONS.infoCircle;
    } else if (type === "warning") {
      bgColor = "#d97706";
      textColor = "#ffffff";
      iconSvg = ICONS.alertCircle;
    } else if (type === "error") {
      bgColor = "#dc2626";
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
        box-shadow: 0 10px 25px -4px rgba(0, 0, 0, 0.18), 0 0 1px 1px rgba(0, 0, 0, 0.06);
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
        this.currentRawPoints = Array.isArray(details.points) ? [...details.points] : null;

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

        this.scheduleUpdate();
      } else if (clientId && clientId !== this.selectedUiId) {
        console.log(`[CVAT 3D Suite] Tự động chọn xe #${clientId} từ click Canvas 3D`);
        this.selectTrackByUiId(clientId, undefined, false);
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

      // 2. Quét xem có active item nào trên sidebar không (quét ngầm: không ép Three.js canvas activate)
      const active = CVATBridge.getActiveTrackId();
      if (active.id !== null && active.id !== this.selectedUiId) {
        await this.selectTrackByUiId(active.id, undefined, false);
      }
    }, 800);

    setTimeout(() => this.syncFrameTracks(), 250);
  }

  /**
   * Đảm bảo luôn có đối tượng được chọn trước khi thực hiện thao tác phím tắt hoặc nút bấm.
   * Nếu selectedUiId đang null, tự động quét từ Sidebar hoặc lấy xe đầu tiên trong Frame.
   */
  public async ensureActiveTrackSelected(): Promise<number | null> {
    if (this.selectedUiId !== null) return this.selectedUiId;

    // 1. Thử lấy từ Sidebar active item
    const active = CVATBridge.getActiveTrackId();
    if (active.id !== null) {
      console.log(`[CVAT 3D Suite] Tự động chọn xe active #${active.id} từ Sidebar`);
      await this.selectTrackByUiId(active.id, undefined, false);
      return this.selectedUiId;
    }

    // 2. Thử lấy từ frameTracks đã có
    if (this.frameTracks.length > 0) {
      console.log(`[CVAT 3D Suite] Tự động chọn xe đầu tiên #${this.frameTracks[0].uiId} trong frame`);
      await this.selectTrackByUiId(this.frameTracks[0].uiId, undefined, false);
      return this.selectedUiId;
    }

    // 3. Thử đồng bộ lại frameTracks rồi lấy
    if (this.currentCtx?.jobId) {
      await this.syncFrameTracks();
      if (this.frameTracks.length > 0) {
        console.log(`[CVAT 3D Suite] Tự động đồng bộ và chọn xe #${this.frameTracks[0].uiId}`);
        await this.selectTrackByUiId(this.frameTracks[0].uiId, undefined, false);
        return this.selectedUiId;
      }
    }

    return null;
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
      // Khi mới F5 hoặc đổi frame, đồng bộ xe đầu tiên lên bảng điều khiển nhưng KHÔNG ép canvas activate/render (chống nháy)
      await this.selectTrackByUiId(tracks[0].uiId, undefined, false);
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
      this.scheduleUpdate();
    } else {
      this.scheduleUpdate();
    }
  }

  private syncCategoryFromLabel(label: string): void {
    const l = (label || "").toLowerCase();
    if (l.includes("pedestrian") || l.includes("person") || l.includes("walker") || l.includes("human")) {
      this.selectedCategory = "pedestrian";
    } else if (
      l.includes("cyclist") ||
      l.includes("bicycle") ||
      l.includes("motorcycle") ||
      l.includes("motorbike") ||
      l.includes("motobike") ||
      l.includes("bike") ||
      l.includes("rider") ||
      l.includes("scooter") ||
      l.includes("moped") ||
      l.includes("two_wheeler") ||
      l.includes("two-wheeler") ||
      l.includes("twowheeler") ||
      l.includes("2_wheeler") ||
      l.includes("2-wheeler") ||
      l.includes("2wheeler") ||
      l.includes("motor") ||
      l.includes("cycle") ||
      l.includes("xe máy") ||
      l.includes("xe_may") ||
      l.includes("xemay") ||
      l.includes("xe đạp") ||
      l.includes("xe_dap") ||
      l.includes("xedap") ||
      l.includes("xe 2 bánh") ||
      l.includes("xe_2_banh")
    ) {
      this.selectedCategory = "cyclist";
    } else {
      this.selectedCategory = "car";
    }
  }

  /**
   * Chọn xe theo UI ID (#1, #2...) và kích hoạt highlight trên Canvas
   * @param activateCanvas Chỉ bật khi người dùng chủ động click hoặc dùng hotkey, không bật khi sync ngầm lúc F5!
   */
  public async selectTrackByUiId(uiId: number, details?: any, activateCanvas: boolean = true): Promise<void> {
    this.selectedUiId = uiId;

    // Chỉ kích hoạt Three.js Canvas nếu người dùng chủ động tương tác
    if (activateCanvas) {
      CVATBridge.activateCanvasTrack(uiId);
    }

    if (details) {
      this.selectedServerId = details.serverId || null;
      this.currentLabel = details.label || `Xe #${uiId}`;
      this.syncCategoryFromLabel(this.currentLabel);
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
      this.currentRawPoints = Array.isArray(details.points) ? [...details.points] : null;
      this.scheduleUpdate();
      return;
    }

    const foundInFrame = this.frameTracks.find((t) => t.uiId === uiId);
    if (foundInFrame) {
      this.selectedServerId = foundInFrame.serverId;
      this.currentLabel = foundInFrame.label;
      this.syncCategoryFromLabel(this.currentLabel);
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
      this.scheduleUpdate();
      return;
    }

    // Nếu là box vừa mới tạo chưa có trong danh sách frameTracks, đồng bộ ngay tức thì
    await this.syncFrameTracks();
  }

  public selectPrevTrack(): void {
    if (this.frameTracks.length === 0) return;
    const idx = this.frameTracks.findIndex((t) => t.uiId === this.selectedUiId);
    if (idx > 0) {
      this.selectTrackByUiId(this.frameTracks[idx - 1].uiId, undefined, true);
    } else {
      this.selectTrackByUiId(this.frameTracks[this.frameTracks.length - 1].uiId, undefined, true);
    }
  }

  public selectNextTrack(): void {
    if (this.frameTracks.length === 0) return;
    const idx = this.frameTracks.findIndex((t) => t.uiId === this.selectedUiId);
    if (idx !== -1 && idx < this.frameTracks.length - 1) {
      this.selectTrackByUiId(this.frameTracks[idx + 1].uiId, undefined, true);
    } else {
      this.selectTrackByUiId(this.frameTracks[0].uiId, undefined, true);
    }
  }

  /**
   * Lưu snapshot trạng thái trước khi thực hiện thao tác để người dùng có thể bấm Hoàn Tác (Pre).
   */
  public async pushUndoSnapshot(actionName: string, forTrack: boolean = false): Promise<void> {
    if (!this.currentCtx || !this.currentCtx.jobId || this.selectedUiId === null) return;

    try {
      let currentBoxPoints: number[];
      if (Array.isArray(this.currentRawPoints) && this.currentRawPoints.length >= 16) {
        currentBoxPoints = [...this.currentRawPoints];
        currentBoxPoints[0] = this.currentX;
        currentBoxPoints[1] = this.currentY;
        currentBoxPoints[2] = this.currentZ;
        currentBoxPoints[3] = 0;
        currentBoxPoints[4] = 0;
        currentBoxPoints[5] = (this.currentYawDeg * Math.PI) / 180;
        currentBoxPoints[6] = this.currentL;
        currentBoxPoints[7] = this.currentW;
        currentBoxPoints[8] = this.currentH;
      } else {
        currentBoxPoints = [
          this.currentX,
          this.currentY,
          this.currentZ,
          0,
          0,
          (this.currentYawDeg * Math.PI) / 180,
          this.currentL,
          this.currentW,
          this.currentH,
        ];
        // Đảm bảo đủ tối thiểu 16 giá trị cho cấu trúc cuboid (8 đỉnh x 2) để thỏa mãn cvat-core
        while (currentBoxPoints.length < 16) {
          currentBoxPoints.push(0);
        }
      }

      let trackShapesBackup: Array<{ frame: number; outside?: boolean; points: number[] }> | undefined = undefined;

      // Nếu thao tác tác động toàn bộ track: sao lưu toàn bộ shapes
      if (forTrack || this.applyToTrack) {
        const serverId = this.selectedServerId || this.selectedUiId;
        const allFrames = await CVATBridge.getTrackAllFrames(this.currentCtx.jobId, this.selectedUiId, serverId);
        if (allFrames && allFrames.length > 0) {
          trackShapesBackup = allFrames.map((f) => ({
            frame: f.frame,
            outside: f.outside,
            points: [...f.points],
          }));
        }
      }

      this.undoStack.push({
        uiId: this.selectedUiId,
        serverId: this.selectedServerId,
        frame: this.currentFrameNumber,
        applyToTrack: forTrack || this.applyToTrack,
        boxPoints: currentBoxPoints,
        trackShapesBackup,
        actionName,
      });

      // Giới hạn độ sâu Undo tối đa 25 bước để tối ưu bộ nhớ
      if (this.undoStack.length > 25) {
        this.undoStack.shift();
      }
    } catch (err) {
      console.warn("[CVAT 3D Suite] Lỗi lưu Undo Snapshot:", err);
    }
  }

  /**
   * Hoàn tác (Pre) thao tác vừa thực hiện
   */
  public async handleUndo(): Promise<void> {
    if (this.undoStack.length === 0) {
      this.showToast("Không có thao tác nào để hoàn tác (Pre)!", "info");
      return;
    }
    if (this.isProcessing) return;
    this.isProcessing = true;

    const snapshot = this.undoStack.pop()!;
    this.showToast(`Đang hoàn tác: ${snapshot.actionName}...`, "info");

    try {
      const res = await CVATBridge.restoreTrackSnapshot(
        this.currentCtx!.jobId!,
        snapshot.uiId,
        snapshot.serverId,
        {
          frame: snapshot.frame,
          applyToTrack: snapshot.applyToTrack,
          boxPoints: snapshot.boxPoints,
          trackShapesBackup: snapshot.trackShapesBackup,
        }
      );

      if (res.success) {
        // Đồng bộ tức thì các thông số hiển thị trên Panel về trạng thái vừa khôi phục
        if (Array.isArray(snapshot.boxPoints) && snapshot.boxPoints.length >= 9) {
          this.currentX = snapshot.boxPoints[0];
          this.currentY = snapshot.boxPoints[1];
          this.currentZ = snapshot.boxPoints[2];
          this.currentYawDeg = Math.round((snapshot.boxPoints[5] * 180) / Math.PI);
          this.currentL = snapshot.boxPoints[6];
          this.currentW = snapshot.boxPoints[7];
          this.currentH = snapshot.boxPoints[8];
          this.editL = this.currentL;
          this.editW = this.currentW;
          this.editH = this.currentH;
          this.currentRawPoints = [...snapshot.boxPoints];
        }
        this.showToast(`Đã hoàn tác: ${snapshot.actionName}`, "success");
        await this.syncFrameTracks();
      } else {
        this.showToast(res.message || "Không thể hoàn tác!", "error");
      }
    } catch (err: any) {
      this.showToast(`Lỗi hoàn tác: ${err.message || err}`, "error");
    } finally {
      this.isProcessing = false;
      this.updateContent();
    }
  }

  /**
   * Đánh dấu Outside (ẩn) cho toàn bộ các frame của Track đang chọn
   */
  public async handleSetTrackOutside(outside: boolean = true): Promise<void> {
    if (!this.currentCtx || !this.currentCtx.jobId) {
      this.showToast("Chưa kết nối Job CVAT!", "warning");
      return;
    }
    if (this.selectedUiId === null) {
      this.showToast("Vui lòng chọn xe trước!", "warning");
      return;
    }
    if (this.isProcessing) return;

    // Lưu snapshot vào undo stack trước khi đổi trạng thái
    await this.pushUndoSnapshot(`Outside Toàn Track #${this.selectedUiId}`, true);
    this.isProcessing = true;

    this.showToast(`Đang đánh dấu ${outside ? "Outside" : "Inside"} cho toàn bộ Track #${this.selectedUiId}...`, "info");

    try {
      const serverId = this.selectedServerId || this.selectedUiId;
      const res = await CVATBridge.setTrackOutside(
        this.currentCtx.jobId,
        this.selectedUiId,
        serverId,
        outside,
        this.currentFrameNumber
      );

      if (res.success) {
        this.showToast(
          `Đã đánh dấu ${outside ? "Outside" : "Inside"} cho ${res.count || "toàn bộ"} frame của Track #${this.selectedUiId}! Bấm Pre để hoàn tác.`,
          "success"
        );
        await this.syncFrameTracks();
      } else {
        this.showToast(res.message || "Không thể đổi trạng thái Outside!", "error");
      }
    } catch (err: any) {
      this.showToast(`Lỗi đánh dấu Outside: ${err.message || err}`, "error");
    } finally {
      this.isProcessing = false;
      this.updateContent();
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
      await this.ensureActiveTrackSelected();
    }

    if (this.selectedUiId === null) {
      this.showToast("Vui lòng chọn xe từ danh sách!", "warning");
      return;
    }

    if (this.isProcessing) return;
    await this.pushUndoSnapshot(currentFrameOnly ? "Lật 180° Frame" : "Lật 180° Track", !currentFrameOnly);
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
    await this.pushUndoSnapshot("Cập nhật Kích Thước", applyToTrack);
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
   * Xoay vi chỉnh góc Yaw tương đối một lượng deltaDeg (ví dụ: -1°, +1°, -5°, +5°)
   */
  public async rotateYawByDelta(deg: number): Promise<void> {
    if (!this.currentCtx || !this.currentCtx.jobId) return;
    if (this.selectedUiId === null) {
      await this.ensureActiveTrackSelected();
    }
    if (this.selectedUiId === null) {
      this.showToast("Vui lòng chọn xe trước!", "warning");
      return;
    }

    let newDeg = Math.round(this.currentYawDeg + deg);
    while (newDeg > 180) newDeg -= 360;
    while (newDeg < -180) newDeg += 360;
    const rad = (newDeg * Math.PI) / 180;

    await this.pushUndoSnapshot(`Xoay Yaw ${deg > 0 ? "+" : ""}${deg}°`, this.applyToTrack);
    this.currentYawDeg = newDeg;

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

    const sign = deg > 0 ? "+" : "";
    this.showToast(`Xoay Yaw ${sign}${deg}° ➔ ${newDeg}°`, "info");
    this.updateContent();
  }

  /**
   * Chuyển đổi giữa 2 phạm vi: Chỉ Frame Này <-> Toàn Bộ Track
   */
  public toggleScope(): void {
    this.applyToTrack = !this.applyToTrack;
    this.updateContent();
    this.showToast(`Phạm vi: ${this.applyToTrack ? "Toàn Bộ Track" : "Chỉ Frame Này"}`, "info");
  }

  /**
   * 1-Click Smart Fit hoàn chỉnh toàn diện (TOP -> SIDE -> FRONT)
   */
  public async handleSmartFitAll(): Promise<void> {
    if (this.selectedCategory === "cyclist") {
      await this.handleFitCyclist("all");
    } else if (this.selectedCategory === "pedestrian") {
      await this.handleFitPedestrian("all");
    } else {
      await this.handleEgoRayFit("all");
    }
  }

  /**
   * Fit Box trực tiếp tại Frame Hiện Tại với Padding 5cm mỗi bên (+10cm L, +10cm W, +5cm H, Đáy bám sàn cố định)
   */
  public async handleFitCurrentBox(): Promise<void> {
    if (!this.currentCtx || !this.currentCtx.jobId) {
      this.showToast("Chưa kết nối Job CVAT!", "warning");
      return;
    }
    if (this.selectedUiId === null) {
      this.showToast("Vui lòng chọn đối tượng trước!", "warning");
      return;
    }
    if (this.isProcessing) return;

    // Lưu snapshot vào undo stack trước khi đổi trạng thái
    await this.pushUndoSnapshot("Fit Box Hiện Tại (+5cm Pad)", this.applyToTrack);
    this.isProcessing = true;
    this.showToast("Đang đo mây điểm & Fit Box hiện tại (+5cm Pad)...", "info");

    try {
      const serverId = this.selectedServerId || this.selectedUiId;
      const res = await CVATBridge.fitCurrentBox(
        this.currentCtx.jobId,
        this.selectedUiId,
        serverId,
        this.applyToTrack
      );

      if (res.success && res.newL && res.newW && res.newH) {
        this.currentL = res.newL;
        this.currentW = res.newW;
        this.currentH = res.newH;
        this.editL = res.newL;
        this.editW = res.newW;
        this.editH = res.newH;
        if (res.newZ !== undefined) this.currentZ = res.newZ;

        const targetItem = this.frameTracks.find((t) => t.uiId === this.selectedUiId);
        if (targetItem) {
          targetItem.l = res.newL;
          targetItem.w = res.newW;
          targetItem.h = res.newH;
          if (res.newZ !== undefined) targetItem.z = res.newZ;
        }

        // Cập nhật giá trị vào DOM input nếu đang hiển thị
        const inputL = this.container?.querySelector<HTMLInputElement>("#input-dim-l");
        const inputW = this.container?.querySelector<HTMLInputElement>("#input-dim-w");
        const inputH = this.container?.querySelector<HTMLInputElement>("#input-dim-h");
        if (inputL) inputL.value = String(res.newL);
        if (inputW) inputW.value = String(res.newW);
        if (inputH) inputH.value = String(res.newH);

        this.showToast(res.message, "success");
      } else {
        this.showToast(res.message || "Không thể Fit Box với frame hiện tại!", "warning");
      }
    } catch (err: any) {
      this.showToast(`Lỗi Fit Box: ${err.message || err}`, "error");
    } finally {
      this.isProcessing = false;
      this.updateContent();
    }
  }

  /**
   * Áp dụng kích thước chuẩn từ Preset mẫu (1-click)
   */
  public async handleApplyPreset(preset: VehicleCatalogItem): Promise<void> {
    if (!this.currentCtx || !this.currentCtx.jobId) {
      this.showToast("Chưa kết nối Job CVAT!", "warning");
      return;
    }
    if (this.selectedUiId === null) {
      this.showToast("Vui lòng chọn đối tượng trước!", "warning");
      return;
    }

    this.editL = preset.l;
    this.editW = preset.w;
    this.editH = preset.h;

    this.showToast(`Áp dụng mẫu: ${preset.name} (${preset.l}x${preset.w}x${preset.h}m)...`, "info");
    await this.handleUpdateDimensions(preset.l, preset.w, preset.h, this.applyToTrack);
  }

  /**
   * Vi chỉnh Center theo trục cục bộ xe:
   * deltaXLocal: Trục dọc xe (Side View, tiến/lùi)
   * deltaYLocal: Trục ngang xe (Front View, trái/phải)
   */
  public async handleShiftCenter(deltaXLocal: number, deltaYLocal: number): Promise<void> {
    if (!this.currentCtx || !this.currentCtx.jobId) {
      this.showToast("Chưa kết nối Job CVAT!", "warning");
      return;
    }
    if (this.selectedUiId === null) {
      this.showToast("Vui lòng chọn xe trước!", "warning");
      return;
    }
    if (this.isProcessing) return;
    await this.pushUndoSnapshot("Vi Chỉnh Center", this.applyToTrack);
    this.isProcessing = true;

    try {
      const serverId = this.selectedServerId || this.selectedUiId;
      const res = await CVATBridge.shiftTrackCenter(
        this.currentCtx.jobId,
        this.selectedUiId,
        serverId,
        deltaXLocal,
        deltaYLocal,
        this.applyToTrack
      );

      if (res.success) {
        if (res.newX !== undefined) this.currentX = res.newX;
        if (res.newY !== undefined) this.currentY = res.newY;

        const targetItem = this.frameTracks.find((t) => t.uiId === this.selectedUiId);
        if (targetItem) {
          if (res.newX !== undefined) targetItem.x = res.newX;
          if (res.newY !== undefined) targetItem.y = res.newY;
        }

        this.showToast(res.message, "success");
      } else {
        this.showToast(res.message || "Lỗi khi vi chỉnh Center!", "error");
      }
    } catch (err: any) {
      this.showToast(`Lỗi vi chỉnh Center: ${err.message || err}`, "error");
    } finally {
      this.isProcessing = false;
      this.updateContent();
    }
  }

  /**
   * Xử lý Ghim Mặt Đất & Địa Hình Vỉa Hè (Ground & Curb Snapping Realtime 100%, ZERO-F5)
   */
  public async handleSnapGround(
    mode: "road" | "curb" | "half_curb" | "micro_adjust" | "micro_adjust_pitch" | "micro_adjust_roll" | "reset_slope",
    params?: { deltaCm?: number; deltaDeg?: number; curbHeight?: number; targetGroundZ?: number; applyToTrack?: boolean }
  ): Promise<void> {
    if (!this.currentCtx || !this.currentCtx.jobId) {
      this.showToast("Chưa kết nối Job CVAT!", "warning");
      return;
    }

    if (this.selectedUiId === null) {
      await this.ensureActiveTrackSelected();
    }

    if (this.selectedUiId === null) {
      this.showToast("Vui lòng chọn xe trước!", "warning");
      return;
    }

    const forTrack = params?.applyToTrack === true;
    if (this.isProcessing) return;
    await this.pushUndoSnapshot(`Ghim Đất ${forTrack ? "Toàn Track " : ""}(${mode})`, forTrack);
    this.isProcessing = true;

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
   * Nút Riêng: Ghim toàn bộ các frame của Track hiện tại xuống mặt đất
   */
  public async handleSnapGroundTrack(): Promise<void> {
    await this.handleSnapGround("road", { applyToTrack: true });
  }

  /**
   * Căn góc xoay Yaw theo vạch kẻ làn đường 3D (LiDAR Intensity Lane Snap)
   */
  public async handleSnapYawToLane(): Promise<void> {
    if (!this.currentCtx || !this.currentCtx.jobId) {
      this.showToast("Chưa kết nối Job CVAT!", "warning");
      return;
    }
    if (this.selectedUiId === null) {
      await this.ensureActiveTrackSelected();
    }
    if (this.selectedUiId === null) {
      this.showToast("Vui lòng chọn xe trước!", "warning");
      return;
    }

    if (this.isProcessing) return;
    await this.pushUndoSnapshot("Căn Yaw Theo Làn 3D", this.applyToTrack);
    this.isProcessing = true;
    this.showToast("Đang quét vạch sơn phản quang 3D để căn Yaw...", "info");

    try {
      const serverId = this.selectedServerId || this.selectedUiId;
      const res = await CVATBridge.snapYawToLane(
        this.currentCtx.jobId,
        this.selectedUiId,
        serverId,
        !this.applyToTrack
      );

      if (res.success && res.newYawDeg !== undefined) {
        this.currentYawDeg = res.newYawDeg;
        this.showToast(res.message, "success");
      } else {
        this.showToast(res.message || "Không tìm thấy vạch sơn rõ nét!", "warning");
      }
    } catch (err: any) {
      this.showToast(`Lỗi căn Yaw theo làn: ${err.message || err}`, "error");
    } finally {
      this.isProcessing = false;
      this.updateContent();
    }
  }

  /**
   * Xử lý FIT XE: Hỗ trợ CĂN TOP, CĂN SIDE, CĂN FRONT hoặc GHÉP CHU TRÌNH HOÀN CHỈNH (TOP ➔ SIDE ➔ FRONT)
   */
  public async handleEgoRayFit(step: "all" | "top" | "side" | "front" = "all"): Promise<void> {
    if (!this.currentCtx || !this.currentCtx.jobId) {
      this.showToast("Chưa kết nối Job CVAT!", "warning");
      return;
    }

    if (this.selectedUiId === null) {
      await this.ensureActiveTrackSelected();
    }

    if (this.selectedUiId === null) {
      this.showToast("Vui lòng chọn xe trước!", "warning");
      return;
    }

    if (this.isProcessing) return;
    await this.pushUndoSnapshot("Fit Toàn Track", true);
    this.isProcessing = true;

    const stepLabel = step === "top" ? "Căn TOP (Yaw & Nóc)" : step === "side" ? "Căn SIDE (Cản X)" : step === "front" ? "Căn FRONT (Sườn Y)" : "Fit toàn diện";
    this.showToast(`Đang ${stepLabel}...`, "info");

    try {
      const serverId = this.selectedServerId || this.selectedUiId;
      const res = await CVATBridge.fitBoxToEgoRayAndGround(
        this.currentCtx.jobId,
        this.selectedUiId,
        serverId,
        this.applyToTrack,
        true, // BẢO TOÀN TUYỆT ĐỐI 100% KÍCH THƯỚC L, W, H THEO YÊU CẦU NGƯỜI DÙNG!
        step
      );

      if (res.success) {
        if (res.newX !== undefined) this.currentX = res.newX;
        if (res.newY !== undefined) this.currentY = res.newY;
        if (res.newZ !== undefined) this.currentZ = res.newZ;
        if (res.newYawDeg !== undefined) this.currentYawDeg = res.newYawDeg;

        const targetItem = this.frameTracks.find((t) => t.uiId === this.selectedUiId);
        if (targetItem) {
          if (res.newX !== undefined) targetItem.x = res.newX;
          if (res.newY !== undefined) targetItem.y = res.newY;
          if (res.newZ !== undefined) targetItem.z = res.newZ;
          if (res.newYawDeg !== undefined) targetItem.yawDeg = res.newYawDeg;
        }

        this.showToast(res.message, "success");
      } else {
        this.showToast(res.message, "error");
      }
    } catch (err: any) {
      this.showToast(`Lỗi ${stepLabel}: ${err.message || err}`, "error");
    } finally {
      this.isProcessing = false;
      this.updateContent();
    }
  }

  public async handleFitTop(): Promise<void> {
    if (this.selectedCategory === "cyclist") {
      await this.handleFitCyclist("top");
    } else if (this.selectedCategory === "pedestrian") {
      await this.handleFitPedestrian("top");
    } else {
      await this.handleEgoRayFit("top");
    }
  }

  public async handleFitSide(): Promise<void> {
    if (this.selectedCategory === "cyclist") {
      await this.handleFitCyclist("side");
    } else if (this.selectedCategory === "pedestrian") {
      await this.handleFitPedestrian("side");
    } else {
      await this.handleEgoRayFit("side");
    }
  }

  public async handleFitFront(): Promise<void> {
    if (this.selectedCategory === "cyclist") {
      await this.handleFitCyclist("front");
    } else if (this.selectedCategory === "pedestrian") {
      await this.handleFitPedestrian("front");
    } else {
      await this.handleEgoRayFit("front");
    }
  }

  /**
   * Xử lý FIT CHUYÊN BIỆT CHO NGƯỜI ĐI BỘ (PEDESTRIAN FIT)
   * - Hỗ trợ 3 chiều độc lập (TOP - SIDE - FRONT)
   * - Hỗ trợ 3 nút Fix Size linh hoạt: Dài (L), Rộng (W), Cao (H)
   * - Hỗ trợ chu trình hoàn chỉnh toàn diện (ALL)
   * - Khóa thẳng đứng Roll = 0, Pitch = 0
   * - Quét chân siêu hẹp +15cm tránh vỉa hè
   * - Bù đỉnh đầu +12cm chống cắt ngang trán
   */
  public async handleFitPedestrian(step: "all" | "top" | "side" | "front" | "l" | "w" | "h" = "all"): Promise<void> {
    if (!this.currentCtx || !this.currentCtx.jobId) {
      this.showToast("Chưa kết nối Job CVAT!", "warning");
      return;
    }

    if (this.selectedUiId === null) {
      await this.ensureActiveTrackSelected();
    }

    if (this.selectedUiId === null) {
      this.showToast("Vui lòng chọn người trước!", "warning");
      return;
    }

    if (this.isProcessing) return;
    const stepLabel =
      step === "top"
        ? "Căn TOP (Yaw Trục người)"
        : step === "side"
        ? "Căn SIDE (Cản X đón tia, Khóa Size & Z)"
        : step === "front"
        ? "Căn FRONT (Sườn Y đón tia, Khóa Size & Z)"
        : step === "l"
        ? "Fix Dài L (Co giãn ôm thân, giữ W/H/Z)"
        : step === "w"
        ? "Fix Rộng W (Co giãn ôm vai/ngực, giữ L/H/Z)"
        : step === "h"
        ? "Fix Cao H (Bám sàn cố định, nở đỉnh đầu +12cm)"
        : "Fit Người Đi Bộ toàn diện";

    await this.pushUndoSnapshot(stepLabel, false);
    this.isProcessing = true;
    this.showToast(`Đang ${stepLabel}...`, "info");

    try {
      const serverId = this.selectedServerId || this.selectedUiId;
      const res = await CVATBridge.fitPedestrian(
        this.currentCtx.jobId,
        this.selectedUiId,
        serverId,
        0.12,
        step,
        this.applyToTrack
      );

      if (res.success) {
        if (res.newX !== undefined) this.currentX = res.newX;
        if (res.newY !== undefined) this.currentY = res.newY;
        if (res.newZ !== undefined) this.currentZ = res.newZ;
        if (res.newYawDeg !== undefined) this.currentYawDeg = res.newYawDeg;
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

        // Cập nhật DOM tức thì cho các ô input số đo (Zero-Delay)
        const inputW = this.container.querySelector<HTMLInputElement>("#input-dim-w");
        if (inputW && res.newW !== undefined) {
          inputW.value = String(res.newW);
        }
        const inputH = this.container.querySelector<HTMLInputElement>("#input-dim-h");
        if (inputH && res.newH !== undefined) {
          inputH.value = String(res.newH);
        }
        const inputL = this.container.querySelector<HTMLInputElement>("#input-dim-l");
        if (inputL && res.newL !== undefined) {
          inputL.value = String(res.newL);
        }

        const targetItem = this.frameTracks.find((t) => t.uiId === this.selectedUiId);
        if (targetItem) {
          if (res.newX !== undefined) targetItem.x = res.newX;
          if (res.newY !== undefined) targetItem.y = res.newY;
          if (res.newZ !== undefined) targetItem.z = res.newZ;
          if (res.newYawDeg !== undefined) targetItem.yawDeg = res.newYawDeg;
          if (res.newL !== undefined) targetItem.l = res.newL;
          if (res.newW !== undefined) targetItem.w = res.newW;
          if (res.newH !== undefined) targetItem.h = res.newH;
        }

        this.showToast(res.message, "success");
      } else {
        this.showToast(res.message, "error");
      }
    } catch (err: any) {
      this.showToast(`Lỗi ${stepLabel}: ${err.message || err}`, "error");
    } finally {
      this.isProcessing = false;
      this.updateContent();
    }
  }

  /**
   * Xử lý FIT CHUYÊN BIỆT CHO XE 2 BÁNH (CYCLIST / TWO-WHEELER FIT)
   * Hỗ trợ 3 chiều độc lập (TOP - SIDE - FRONT) hoặc toàn chu trình (ALL).
   * Bảo toàn 100% kích thước L cố định theo quy chuẩn.
   */
  public async handleFitCyclist(step: "all" | "top" | "side" | "front" | "w" | "h" = "all"): Promise<void> {
    if (!this.currentCtx || !this.currentCtx.jobId) {
      this.showToast("Chưa kết nối Job CVAT!", "warning");
      return;
    }

    if (this.selectedUiId === null) {
      await this.ensureActiveTrackSelected();
    }

    if (this.selectedUiId === null) {
      this.showToast("Vui lòng chọn xe trước!", "warning");
      return;
    }

    if (this.isProcessing) return;
    const stepLabel =
      step === "top"
        ? "Căn TOP (Yaw Đầu - Đuôi)"
        : step === "side"
        ? "Căn SIDE (Cản X & Sàn, Khóa L)"
        : step === "front"
        ? "Căn FRONT (Sườn Y đón tia, Giữ Size)"
        : step === "w"
        ? "Fit Rộng W (Bắt gương xe +5cm Pad)"
        : step === "h"
        ? "Fit Cao H (Bám sàn cố định, nở nóc)"
        : "Fit Xe 2 Bánh toàn diện";

    await this.pushUndoSnapshot(stepLabel, false);
    this.isProcessing = true;
    this.showToast(`Đang ${stepLabel}...`, "info");

    try {
      const serverId = this.selectedServerId || this.selectedUiId;
      const res = await CVATBridge.fitCyclist(
        this.currentCtx.jobId,
        this.selectedUiId,
        serverId,
        0.10,
        step,
        this.applyToTrack
      );

      if (res.success) {
        if (res.newX !== undefined) this.currentX = res.newX;
        if (res.newY !== undefined) this.currentY = res.newY;
        if (res.newZ !== undefined) this.currentZ = res.newZ;
        if (res.newYawDeg !== undefined) this.currentYawDeg = res.newYawDeg;
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

        // Cập nhật DOM tức thì cho các ô input số đo (Zero-Delay)
        const inputW = this.container.querySelector<HTMLInputElement>("#input-dim-w");
        if (inputW && res.newW !== undefined) {
          inputW.value = String(res.newW);
        }
        const inputH = this.container.querySelector<HTMLInputElement>("#input-dim-h");
        if (inputH && res.newH !== undefined) {
          inputH.value = String(res.newH);
        }
        const inputL = this.container.querySelector<HTMLInputElement>("#input-dim-l");
        if (inputL && res.newL !== undefined) {
          inputL.value = String(res.newL);
        }

        const targetItem = this.frameTracks.find((t) => t.uiId === this.selectedUiId);
        if (targetItem) {
          if (res.newX !== undefined) targetItem.x = res.newX;
          if (res.newY !== undefined) targetItem.y = res.newY;
          if (res.newZ !== undefined) targetItem.z = res.newZ;
          if (res.newYawDeg !== undefined) targetItem.yawDeg = res.newYawDeg;
          if (res.newL !== undefined) targetItem.l = res.newL;
          if (res.newW !== undefined) targetItem.w = res.newW;
          if (res.newH !== undefined) targetItem.h = res.newH;
        }

        this.showToast(res.message, "success");
      } else {
        this.showToast(res.message, "error");
      }
    } catch (err: any) {
      this.showToast(`Lỗi ${stepLabel}: ${err.message || err}`, "error");
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
    await this.pushUndoSnapshot("Căn Hộp Bám Điểm", false);
    this.isProcessing = true;

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
    await this.pushUndoSnapshot("Khớp Kích Thước Catalog", this.applyToTrack);
    this.isProcessing = true;

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
    await this.pushUndoSnapshot("Fit Toàn Track", true);
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

    // Snapshot trạng thái hiển thị (State Memoization chống nháy DOM):
    const stateHash = [
      this.selectedUiId,
      this.currentFrameNumber,
      this.currentX,
      this.currentY,
      this.currentZ,
      this.currentYawDeg,
      this.currentL,
      this.currentW,
      this.currentH,
      this.editL,
      this.editW,
      this.editH,
      this.frameTracks.length,
      this.isDropdownOpen,
      this.searchKeyword,
      this.selectedCategory,
      this.isAdvancedOpen,
      this.applyToTrack,
    ].join("|");

    if (stateHash === this.lastRenderedHash && this.container.children.length > 0) {
      return; // Dữ liệu hoàn toàn không thay đổi -> Giữ nguyên DOM, triệt tiêu 100% nhấp nháy!
    }
    this.lastRenderedHash = stateHash;

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
              background: ${isSelected ? "#ecfdf5" : "transparent"};
              border: 1px solid ${isSelected ? "#a7f3d0" : "transparent"};
              color: ${isSelected ? "#047857" : "#0f172a"};
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: space-between;
              font-family: ui-monospace, monospace;
              font-size: 11px;
              transition: background 0.12s;
            ">
              <span style="display: flex; align-items: center; gap: 8px;">
                <span style="font-weight: 700; color: ${isSelected ? "#059669" : "#64748b"};">#${t.uiId}</span>
                <span style="color: ${isSelected ? "#047857" : "#0f172a"}; font-weight: 500;">${t.label}</span>
              </span>
              <span style="font-size: 10px; color: #64748b;">
                Z: ${t.z}m • ${t.yawDeg}°
                ${isSelected ? `<span style="color: #059669; margin-left: 4px;">●</span>` : ""}
              </span>
            </div>
          `;
        })
        .join("");
    } else {
      dropdownItemsHtml = `
        <div style="font-size: 11px; color: #64748b; padding: 8px; text-align: center; font-style: italic;">
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

    // Danh sách Presets mẫu theo Category đang chọn (Ô tô, Xe 2 bánh, Người đi bộ)
    const activePresets =
      this.selectedCategory === "pedestrian"
        ? PEDESTRIAN_PRESETS
        : this.selectedCategory === "cyclist"
        ? CYCLIST_PRESETS
        : CAR_PRESETS;

    // ==========================================
    // RENDER NỘI DUNG GIAO DIỆN MỚI: 1-CLICK WORKFLOW & TRỰC QUAN TOÀN DIỆN
    // ==========================================

    // 1. Cấu hình Hero Button theo phân loại đối tượng (100% Flat SVG Icons, Không dùng emoji 3D)
    let heroTitle = "1-CLICK SMART FIT";
    let heroSub = "Tự bám đất • Khóa Roll 0° • Lọc sạch gương & xe khác";
    let heroKey = "T";
    let heroGradient = "linear-gradient(135deg, #ecfdf5 0%, #e0f2fe 100%)";
    let heroBorder = "#6ee7b7";
    let heroColor = "#047857";
    let heroIcon = ICONS.zap;

    if (this.selectedCategory === "pedestrian") {
      heroTitle = "FIT NGƯỜI ĐI BỘ";
      heroSub = "Khóa đứng 0° • Bù đỉnh đầu +12cm • Co giãn dáng người";
      heroKey = "P";
      heroGradient = "linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)";
      heroBorder = "#d8b4fe";
      heroColor = "#6b21a8";
      heroIcon = ICONS.user;
    } else if (this.selectedCategory === "cyclist") {
      heroTitle = "FIT XE ĐẠP / XE MÁY";
      heroSub = "Khung xe chuẩn • Khóa thẳng đứng 0° • Bù nón bảo hiểm";
      heroKey = "Shift+C";
      heroGradient = "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)";
      heroBorder = "#fcd34d";
      heroColor = "#b45309";
      heroIcon = ICONS.bicycle;
    }

    // 2. Nội dung Accordion Tinh chỉnh nâng cao (nếu mở)
    let advancedContentHtml = "";
    if (this.isAdvancedOpen) {
      advancedContentHtml = `
        <div style="
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        ">
          <!-- VI CHỈNH ĐỘ CAO Z -->
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <span style="font-size: 10px; color: #64748b; font-family: ui-monospace, monospace; font-weight: 500;">Vi chỉnh Z (cm):</span>
            <div style="display: flex; gap: 4px;">
              <button class="btn-micro-z" data-delta="-5" title="Hạ 5cm" style="background: #ffffff; border: 1px solid #cbd5e1; color: #334155; font-size: 10px; font-family: monospace; padding: 4px 7px; border-radius: 5px; cursor: pointer;">-5</button>
              <button class="btn-micro-z" data-delta="-1" title="Hạ 1cm" style="background: #ffffff; border: 1px solid #cbd5e1; color: #334155; font-size: 10px; font-family: monospace; padding: 4px 7px; border-radius: 5px; cursor: pointer;">-1</button>
              <button class="btn-micro-z" data-delta="1" title="Nâng 1cm" style="background: #ffffff; border: 1px solid #a7f3d0; color: #059669; font-size: 10px; font-family: monospace; padding: 4px 7px; border-radius: 5px; cursor: pointer; font-weight: 600;">+1</button>
              <button class="btn-micro-z" data-delta="5" title="Nâng 5cm" style="background: #ffffff; border: 1px solid #a7f3d0; color: #059669; font-size: 10px; font-family: monospace; padding: 4px 7px; border-radius: 5px; cursor: pointer; font-weight: 600;">+5</button>
            </div>
          </div>

          <!-- DỐC DỌC PITCH & NGHIÊNG NGANG ROLL -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
            <div style="background: #ffffff; padding: 6px; border-radius: 6px; border: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 4px;">
              <span style="font-size: 9px; color: #0284c7; font-family: monospace; font-weight: 600; display: flex; align-items: center; gap: 4px;">
                ${ICONS.arrowUpDown}
                <span>Dốc Side (Pitch)</span>
              </span>
              <div style="display: flex; gap: 3px;">
                <button class="btn-micro-pitch" data-delta="-1" style="flex: 1; background: #f8fafc; border: 1px solid #cbd5e1; color: #334155; font-size: 9px; padding: 3px 0; border-radius: 4px; cursor: pointer;">-1°</button>
                <button class="btn-micro-pitch" data-delta="1" style="flex: 1; background: #f0f9ff; border: 1px solid #bae6fd; color: #0284c7; font-size: 9px; padding: 3px 0; border-radius: 4px; cursor: pointer; font-weight: 600;">+1°</button>
              </div>
            </div>

            <div style="background: #ffffff; padding: 6px; border-radius: 6px; border: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 4px;">
              <span style="font-size: 9px; color: #e11d48; font-family: monospace; font-weight: 600; display: flex; align-items: center; gap: 4px;">
                ${ICONS.arrowRightLeft}
                <span>Nghiêng (Roll)</span>
              </span>
              <div style="display: flex; gap: 3px;">
                <button class="btn-micro-roll" data-delta="-1" style="flex: 1; background: #f8fafc; border: 1px solid #cbd5e1; color: #334155; font-size: 9px; padding: 3px 0; border-radius: 4px; cursor: pointer;">-1°</button>
                <button class="btn-micro-roll" data-delta="1" style="flex: 1; background: #fff1f2; border: 1px solid #fecdd3; color: #e11d48; font-size: 9px; padding: 3px 0; border-radius: 4px; cursor: pointer; font-weight: 600;">+1°</button>
                <button id="btn-reset-slope" title="Đặt lại dốc phẳng 0°" style="background: #f1f5f9; border: 1px solid #cbd5e1; color: #334155; font-size: 9px; padding: 3px 6px; border-radius: 4px; cursor: pointer; font-weight: 600;">0°</button>
              </div>
            </div>
          </div>

          <!-- VỈA HÈ & GÁC LỀ -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
            <button id="btn-snap-curb" style="
              background: #fffbeb;
              border: 1px solid #fde68a;
              color: #b45309;
              padding: 6px 8px;
              border-radius: 6px;
              font-size: 10px;
              font-weight: 600;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: space-between;
            ">
              <span style="display: flex; align-items: center; gap: 5px;">
                <span style="display: flex; align-items: center;">${ICONS.curb}</span>
                <span>Vỉa Hè +15cm</span>
              </span>
              <kbd style="font-size: 8px; font-family: monospace; background: #fef3c7; border: 1px solid #fde68a; padding: 1px 4px; border-radius: 3px; color: #92400e;">⌥G</kbd>
            </button>

            <button id="btn-snap-half-curb" style="
              background: #fff1f2;
              border: 1px solid #fecdd3;
              color: #be123c;
              padding: 6px 8px;
              border-radius: 6px;
              font-size: 10px;
              font-weight: 600;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: space-between;
            ">
              <span style="display: flex; align-items: center; gap: 5px;">
                <span style="display: flex; align-items: center;">${ICONS.layers}</span>
                <span>Gác Lề Roll</span>
              </span>
              <kbd style="font-size: 8px; font-family: monospace; background: #ffe4e6; border: 1px solid #fecdd3; padding: 1px 4px; border-radius: 3px; color: #9f1239;">⇧G</kbd>
            </button>
          </div>

          <!-- VI CHỈNH GÓC YAW & CĂN THEO VẠCH KẺ LÀN ĐƯỜNG 3D -->
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 9px; color: #64748b; font-family: monospace; font-weight: 500;">Xoay góc Yaw:</span>
              <button id="btn-snap-yaw-lane" title="Quét vạch sơn phản quang 3D dưới lòng đường để khóa góc Yaw thẳng theo tim đường (Phím L)" style="
                background: #f0fdf4;
                border: 1px solid #86efac;
                color: #15803d;
                font-size: 9px;
                font-weight: 600;
                padding: 2px 7px;
                border-radius: 4px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 4px;
                transition: all 0.12s;
              ">
                <span style="display: flex; align-items: center; color: #16a34a;">${ICONS.road}</span>
                <span>Căn Theo Làn (LiDAR)</span>
              </button>
            </div>
            <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 3px;">
              <button class="btn-rot" data-deg="-90" style="background: #ffffff; border: 1px solid #cbd5e1; color: #334155; font-size: 9px; font-family: monospace; padding: 4px 0; border-radius: 4px; cursor: pointer;">-90°</button>
              <button class="btn-rot" data-deg="-15" style="background: #ffffff; border: 1px solid #cbd5e1; color: #334155; font-size: 9px; font-family: monospace; padding: 4px 0; border-radius: 4px; cursor: pointer;">-15°</button>
              <button class="btn-rot" data-deg="-5" style="background: #ffffff; border: 1px solid #cbd5e1; color: #334155; font-size: 9px; font-family: monospace; padding: 4px 0; border-radius: 4px; cursor: pointer;">-5°</button>
              <button class="btn-rot" data-deg="5" style="background: #ffffff; border: 1px solid #a7f3d0; color: #059669; font-size: 9px; font-family: monospace; padding: 4px 0; border-radius: 4px; cursor: pointer; font-weight: 600;">+5°</button>
              <button class="btn-rot" data-deg="15" style="background: #ffffff; border: 1px solid #a7f3d0; color: #059669; font-size: 9px; font-family: monospace; padding: 4px 0; border-radius: 4px; cursor: pointer; font-weight: 600;">+15°</button>
              <button class="btn-rot" data-deg="90" style="background: #ffffff; border: 1px solid #a7f3d0; color: #059669; font-size: 9px; font-family: monospace; padding: 4px 0; border-radius: 4px; cursor: pointer; font-weight: 600;">+90°</button>
            </div>
          </div>

          <!-- PRESET CATALOG XE NHANH -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-top: 2px;">
            ${STANDARD_VEHICLE_CATALOG.slice(0, 4)
              .map(
                (item) => `
              <button class="catalog-btn" data-l="${item.l}" data-w="${item.w}" data-h="${item.h}" data-name="${item.name}" style="
                background: #ffffff;
                border: 1px solid #e2e8f0;
                color: #1e293b;
                padding: 4px 6px;
                border-radius: 5px;
                font-size: 9px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: space-between;
              ">
                <span style="font-weight: 600;">${item.name}</span>
                <span style="font-size: 8px; font-family: monospace; color: #64748b;">${item.l}x${item.w}m</span>
              </button>
            `
              )
              .join("")}
          </div>
        </div>
      `;
    }

    this.container.innerHTML = `
      <!-- HEADER CHUẨN SHADCN (LIGHT) -->
      <div id="floating-drag-header" style="
        padding: 9px 12px;
        border-bottom: 1px solid #e2e8f0;
        background: #ffffff;
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: grab;
      ">
        <div style="display: flex; align-items: center; gap: 7px;">
          <span style="color: #94a3b8; display: flex;">${ICONS.grip}</span>
          <span style="color: #10b981; display: flex;">${ICONS.box}</span>
          <span style="font-weight: 700; font-size: 13px; letter-spacing: -0.2px; color: #09090b;">CVAT 3D Suite</span>
          <span style="
            font-size: 9px;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            background: #f1f5f9;
            color: #059669;
            padding: 2px 5px;
            border-radius: 5px;
            border: 1px solid #e2e8f0;
            font-weight: 600;
          ">${jobText}</span>
        </div>

        <div style="display: flex; align-items: center; gap: 3px;">
          <button id="floating-btn-undo" title="Hoàn tác thao tác vừa thực hiện (Ctrl+Z / Cmd+Z)" style="
            background: #ffffff;
            border: 1px solid #e2e8f0;
            color: #0f172a;
            cursor: pointer;
            padding: 3px 6px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 10px;
            font-weight: 600;
            box-shadow: 0 1px 2px rgba(0,0,0,0.03);
            transition: all 0.12s;
          ">
            <span style="display: flex; align-items: center;">${ICONS.undo}</span>
            <span>Pre</span>
          </button>
          <button id="floating-btn-fullscreen" title="Mở Rộng Toàn Màn Hình · Duyệt Toàn Bộ Track ID (Shift+M)" style="
            background: #eff6ff;
            border: 1px solid #bfdbfe;
            color: #2563eb;
            cursor: pointer;
            padding: 3px 6px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 10px;
            font-weight: 600;
          ">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
            <span>Full</span>
          </button>
          <button id="floating-btn-sync-frame" title="Quét lại xe frame này" style="
            background: transparent;
            border: none;
            color: #64748b;
            cursor: pointer;
            padding: 3px;
            border-radius: 4px;
            display: flex;
            align-items: center;
          ">
            ${ICONS.refresh}
          </button>
          <button id="floating-btn-minimize" title="Thu nhỏ (\`)" style="
            background: transparent;
            border: none;
            color: #64748b;
            cursor: pointer;
            padding: 3px;
            border-radius: 4px;
            display: flex;
            align-items: center;
          ">
            ${ICONS.minimize}
          </button>
        </div>
      </div>

      <!-- MAIN CONTAINER BODY (LIGHT) -->
      <div style="
        padding: 10px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: calc(100vh - 120px);
      ">
        <!-- KHỐI 1: CHỌN XE & THÔNG SỐ TÓM TẮT -->
        <div style="
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 8px 10px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          position: relative;
        ">
          <!-- THANH CHỌN XE & PREV/NEXT -->
          <div style="display: flex; gap: 5px; align-items: center;">
            <button id="btn-dropdown-toggle" style="
              flex: 1;
              background: #ffffff;
              border: 1px solid ${this.isDropdownOpen ? "#10b981" : "#e2e8f0"};
              color: #09090b;
              padding: 6px 10px;
              border-radius: 7px;
              font-size: 11px;
              font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
              font-weight: 600;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: space-between;
              transition: all 0.15s;
            ">
              <span style="display: flex; align-items: center; gap: 6px;">
                <span style="color: #059669; font-weight: 700;">${this.selectedUiId ? `#${this.selectedUiId}` : "#0"}</span>
                <span style="font-weight: 600; font-size: 11px; color: #09090b;">${this.selectedUiId ? this.currentLabel : "Chưa chọn đối tượng"}</span>
              </span>
              <span style="color: #64748b; font-size: 9px;">${this.isDropdownOpen ? "▲" : "▼"}</span>
            </button>

            <!-- NÚT PREV / NEXT -->
            <button id="btn-prev-frame-track" title="Đối tượng trước (Phím [)" style="
              background: #ffffff;
              border: 1px solid #e2e8f0;
              color: #334155;
              padding: 6px 8px;
              border-radius: 6px;
              cursor: pointer;
              display: flex;
              align-items: center;
            ">
              ${ICONS.chevronLeft}
            </button>
            <button id="btn-next-frame-track" title="Đối tượng kế (Phím ])" style="
              background: #ffffff;
              border: 1px solid #e2e8f0;
              color: #334155;
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
              background: #ffffff;
              border: 1px solid #e2e8f0;
              border-radius: 8px;
              padding: 6px;
              box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08);
              display: flex;
              flex-direction: column;
              gap: 4px;
              max-height: 200px;
              overflow-y: auto;
              z-index: 1000;
            ">
              <!-- Ô TÌM KIẾM NHANH -->
              <input id="input-dropdown-search" type="text" placeholder="Tìm ID (#1) hoặc loại xe..." value="${this.searchKeyword}" style="
                background: #f8fafc;
                border: 1px solid #cbd5e1;
                border-radius: 6px;
                color: #09090b;
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

          <!-- PHÂN LOẠI ĐỐI TƯỢNG (CATEGORY CHIPS) -->
          <div style="
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 4px;
            background: #f1f5f9;
            padding: 3px;
            border-radius: 7px;
            border: 1px solid #e2e8f0;
          ">
            <button class="btn-category-chip" data-cat="car" style="
              background: ${this.selectedCategory === "car" ? "#ffffff" : "transparent"};
              border: 1px solid ${this.selectedCategory === "car" ? "#10b981" : "transparent"};
              color: ${this.selectedCategory === "car" ? "#059669" : "#64748b"};
              box-shadow: ${this.selectedCategory === "car" ? "0 1px 3px rgba(0,0,0,0.06)" : "none"};
              padding: 5px 6px;
              border-radius: 5px;
              font-size: 11px;
              font-weight: 600;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 5px;
              transition: all 0.12s;
            ">
              <span style="display: flex; align-items: center;">${ICONS.car}</span>
              <span>Ô tô</span>
            </button>

            <button class="btn-category-chip" data-cat="pedestrian" style="
              background: ${this.selectedCategory === "pedestrian" ? "#ffffff" : "transparent"};
              border: 1px solid ${this.selectedCategory === "pedestrian" ? "#a855f7" : "transparent"};
              color: ${this.selectedCategory === "pedestrian" ? "#7e22ce" : "#64748b"};
              box-shadow: ${this.selectedCategory === "pedestrian" ? "0 1px 3px rgba(0,0,0,0.06)" : "none"};
              padding: 5px 6px;
              border-radius: 5px;
              font-size: 11px;
              font-weight: 600;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 5px;
              transition: all 0.12s;
            ">
              <span style="display: flex; align-items: center;">${ICONS.user}</span>
              <span>Người</span>
            </button>

            <button class="btn-category-chip" data-cat="cyclist" style="
              background: ${this.selectedCategory === "cyclist" ? "#ffffff" : "transparent"};
              border: 1px solid ${this.selectedCategory === "cyclist" ? "#f59e0b" : "transparent"};
              color: ${this.selectedCategory === "cyclist" ? "#d97706" : "#64748b"};
              box-shadow: ${this.selectedCategory === "cyclist" ? "0 1px 3px rgba(0,0,0,0.06)" : "none"};
              padding: 5px 6px;
              border-radius: 5px;
              font-size: 11px;
              font-weight: 600;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 5px;
              transition: all 0.12s;
            ">
              <span style="display: flex; align-items: center;">${ICONS.bicycle}</span>
              <span>Xe 2 bánh</span>
            </button>
          </div>

          <!-- THÔNG SỐ TÓM TẮT X, Y, Z, YAW -->
          <div style="
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 4px;
            font-size: 10px;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            background: #f8fafc;
            padding: 4px 6px;
            border-radius: 6px;
            border: 1px solid #e2e8f0;
            color: #475569;
            text-align: center;
          ">
            <div><span style="color: #64748b;">X:</span> ${this.currentX}</div>
            <div><span style="color: #64748b;">Y:</span> ${this.currentY}</div>
            <div><span style="color: #64748b;">Z:</span> ${this.currentZ}</div>
            <div><span style="color: #64748b;">Yaw:</span> <span style="color: #059669; font-weight: bold;">${this.currentYawDeg}°</span></div>
          </div>
        </div>

        <!-- KHỐI 2: ĐIỀU KHIỂN CĂN CHỈNH 2D/3D & THAO TÁC NHANH -->
        <div style="
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 8px 10px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        ">
          ${
            this.selectedCategory === "car"
              ? `
            <!-- THANH 3 NÚT FIT ĐỘC LẬP THEO 3 CHIỀU (TOP - SIDE - FRONT) -->
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 5px;">
              <!-- 1. FIT TOP -->
              <button id="btn-fit-top" title="Căn góc xoay Yaw quanh tâm xe & Auto Ghim Đất (Phím 1 hoặc T)" style="
                background: #f0fdfa;
                border: 1px solid #99f6e4;
                color: #0f766e;
                padding: 7px 5px;
                border-radius: 8px;
                cursor: pointer;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 2px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.04);
                transition: all 0.12s;
              ">
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                  <span style="font-size: 11px; font-weight: 700; letter-spacing: -0.2px; display: flex; align-items: center; gap: 3px;">
                    ${ICONS.arrowUp}
                    <span>TOP</span>
                  </span>
                  <kbd style="font-size: 8.5px; font-family: monospace; background: #ffffff; padding: 1px 4px; border-radius: 3px; border: 1px solid #ccfbf1; color: #0f766e;">1</kbd>
                </div>
                <span style="font-size: 9px; opacity: 0.9; text-align: center; white-space: nowrap;">Thẳng Yaw</span>
              </button>

              <!-- 2. FIT SIDE -->
              <button id="btn-fit-side" title="Căn cản trước/sau theo trục dọc X & Auto Ghim Đất (Phím 2 hoặc S)" style="
                background: #eff6ff;
                border: 1px solid #bfdbfe;
                color: #1d4ed8;
                padding: 7px 5px;
                border-radius: 8px;
                cursor: pointer;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 2px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.04);
                transition: all 0.12s;
              ">
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                  <span style="font-size: 11px; font-weight: 700; letter-spacing: -0.2px; display: flex; align-items: center; gap: 3px;">
                    ${ICONS.arrowRightLeft}
                    <span>SIDE</span>
                  </span>
                  <kbd style="font-size: 8.5px; font-family: monospace; background: #ffffff; padding: 1px 4px; border-radius: 3px; border: 1px solid #dbeafe; color: #1d4ed8;">2</kbd>
                </div>
                <span style="font-size: 9px; opacity: 0.9; text-align: center; white-space: nowrap;">Cản đón tia X</span>
              </button>

              <!-- 3. FIT FRONT -->
              <button id="btn-fit-front" title="Căn mép sườn xe ăn khít phương W (Giữ nguyên cao độ Z, không ghim đất) (Phím 3 hoặc W)" style="
                background: #faf5ff;
                border: 1px solid #e9d5ff;
                color: #7e22ce;
                padding: 7px 5px;
                border-radius: 8px;
                cursor: pointer;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 2px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.04);
                transition: all 0.12s;
              ">
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                  <span style="font-size: 11px; font-weight: 700; letter-spacing: -0.2px; display: flex; align-items: center; gap: 3px;">
                    ${ICONS.arrowUpDown}
                    <span>FRONT</span>
                  </span>
                  <kbd style="font-size: 8.5px; font-family: monospace; background: #ffffff; padding: 1px 4px; border-radius: 3px; border: 1px solid #f3e8ff; color: #7e22ce;">3</kbd>
                </div>
                <span style="font-size: 9px; opacity: 0.9; text-align: center; white-space: nowrap;">Sườn xe W</span>
              </button>
            </div>
          `
              : this.selectedCategory === "cyclist"
              ? `
            <!-- THANH 3 NÚT FIT ĐỘC LẬP CHO XE 2 BÁNH (TOP - SIDE - FRONT) -->
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 5px;">
              <!-- 1. FIT TOP XE 2 BÁNH -->
              <button id="btn-fit-top" title="Căn Yaw theo trục dài nối Cực Đuôi -> Cực Đầu (Bánh sau - Bánh trước), khóa tâm X/Y/Z và kích thước (Phím 1 hoặc T)" style="
                background: #fffbeb;
                border: 1px solid #fcd34d;
                color: #b45309;
                padding: 7px 5px;
                border-radius: 8px;
                cursor: pointer;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 2px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.04);
                transition: all 0.12s;
              ">
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                  <span style="font-size: 11px; font-weight: 700; letter-spacing: -0.2px; display: flex; align-items: center; gap: 3px;">
                    ${ICONS.arrowUp}
                    <span>TOP</span>
                  </span>
                  <kbd style="font-size: 8.5px; font-family: monospace; background: #ffffff; padding: 1px 4px; border-radius: 3px; border: 1px solid #fde68a; color: #b45309;">1</kbd>
                </div>
                <span style="font-size: 9px; opacity: 0.9; text-align: center; white-space: nowrap;">Trục đầu-đuôi</span>
              </button>

              <!-- 2. FIT SIDE XE 2 BÁNH -->
              <button id="btn-fit-side" title="Căn cản trước/sau đón tia theo trục dọc X & Ghim đất đáy xe. KHÓA 100% CHIỀU DÀI L (Phím 2 hoặc S)" style="
                background: #fef3c7;
                border: 1px solid #f59e0b;
                color: #92400e;
                padding: 7px 5px;
                border-radius: 8px;
                cursor: pointer;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 2px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.04);
                transition: all 0.12s;
              ">
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                  <span style="font-size: 11px; font-weight: 700; letter-spacing: -0.2px; display: flex; align-items: center; gap: 3px;">
                    ${ICONS.arrowRightLeft}
                    <span>SIDE</span>
                  </span>
                  <kbd style="font-size: 8.5px; font-family: monospace; background: #ffffff; padding: 1px 4px; border-radius: 3px; border: 1px solid #fcd34d; color: #92400e;">2</kbd>
                </div>
                <span style="font-size: 9px; opacity: 0.9; text-align: center; white-space: nowrap;">Cản đón tia (Khóa L)</span>
              </button>

              <!-- 3. FIT FRONT XE 2 BÁNH (CHUẨN THEO CAR, GIỮ NGUYÊN CAO ĐỘ Z & KÍCH THƯỚC) -->
              <button id="btn-fit-front" title="Căn sườn xe ăn khít phương W theo mép đón tia (Giữ nguyên cao độ Z & kích thước L, W, H) (Phím 3 hoặc W)" style="
                background: #faf5ff;
                border: 1px solid #e9d5ff;
                color: #7e22ce;
                padding: 7px 5px;
                border-radius: 8px;
                cursor: pointer;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 2px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.04);
                transition: all 0.12s;
              ">
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                  <span style="font-size: 11px; font-weight: 700; letter-spacing: -0.2px; display: flex; align-items: center; gap: 3px;">
                    ${ICONS.arrowUpDown}
                    <span>FRONT</span>
                  </span>
                  <kbd style="font-size: 8.5px; font-family: monospace; background: #ffffff; padding: 1px 4px; border-radius: 3px; border: 1px solid #f3e8ff; color: #7e22ce;">3</kbd>
                </div>
                <span style="font-size: 9px; opacity: 0.9; text-align: center; white-space: nowrap;">Sườn xe W (Giữ Size)</span>
              </button>
            </div>

            <!-- THANH 2 NÚT TÁCH BIỆT: FIT RỘNG (W) & FIT CAO (H) CHO XE 2 BÁNH -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px;">
              <!-- 1. NÚT FIT RỘNG W -->
              <button id="btn-fit-cyclist-w" title="Tự động đo mây điểm và fit riêng chiều rộng W (bắt trọn gương chiếu hậu, tay lái, đệm +5cm mỗi bên), giữ nguyên L, H và Z" style="
                background: #fffbeb;
                border: 1px solid #fcd34d;
                color: #b45309;
                padding: 6px 8px;
                border-radius: 7px;
                font-size: 10px;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 4px;
                transition: all 0.12s;
                box-shadow: 0 1px 2px rgba(0,0,0,0.03);
              ">
                <span style="display: flex; align-items: center; color: #d97706;">${ICONS.sparkles}</span>
                <span>Fit Rộng (W) [+5cm Pad]</span>
              </button>

              <!-- 2. NÚT FIT CAO H -->
              <button id="btn-fit-cyclist-h" title="Tự động đo đỉnh nón bảo hiểm và fit riêng chiều cao H (Mặt đáy tiếp đất giữ nguyên cố định 100%, nở lên nóc +12cm), giữ nguyên L, W và XY" style="
                background: #fff7ed;
                border: 1px solid #fdba74;
                color: #c2410c;
                padding: 6px 8px;
                border-radius: 7px;
                font-size: 10px;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 4px;
                transition: all 0.12s;
                box-shadow: 0 1px 2px rgba(0,0,0,0.03);
              ">
                <span style="display: flex; align-items: center; color: #ea580c;">${ICONS.arrowUpDown}</span>
                <span>Fit Cao (H) [Nở Nóc]</span>
              </button>
            </div>

            <!-- NÚT FIT TOÀN DIỆN CHO XE 2 BÁNH (1-CHẠM CHU TRÌNH HOÀN CHỈNH) -->
            <button id="btn-fit-cyclist-all" title="Chạy chu trình fit hoàn chỉnh Xe 2 bánh: TOP ➔ SIDE ➔ FRONT (Khóa cứng L)" style="
              width: 100%;
              background: #fffbeb;
              border: 1px dashed #f59e0b;
              color: #b45309;
              padding: 4px 8px;
              border-radius: 6px;
              font-size: 10px;
              font-weight: 600;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: space-between;
              transition: all 0.12s;
            ">
              <span style="display: flex; align-items: center; gap: 5px;">
                ${ICONS.bicycle}
                <span>Fit Toàn Diện Xe 2 Bánh (TOP ➔ SIDE ➔ FRONT)</span>
              </span>
              <kbd style="font-size: 8.5px; font-family: monospace; background: #ffffff; border: 1px solid #fde68a; padding: 1px 4px; border-radius: 3px;">Shift+C</kbd>
            </button>
          `
              : `
            <!-- THANH 3 NÚT FIT ĐỘC LẬP CHO NGƯỜI ĐI BỘ (TOP - SIDE - FRONT) -->
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 5px;">
              <!-- 1. FIT TOP NGƯỜI -->
              <button id="btn-fit-top" title="Căn góc xoay Yaw theo trục cơ thể người, khóa tâm X/Y/Z và kích thước (Phím 1 hoặc T)" style="
                background: #faf5ff;
                border: 1px solid #d8b4fe;
                color: #7e22ce;
                padding: 7px 5px;
                border-radius: 8px;
                cursor: pointer;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 2px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.04);
                transition: all 0.12s;
              ">
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                  <span style="font-size: 11px; font-weight: 700; letter-spacing: -0.2px; display: flex; align-items: center; gap: 3px;">
                    ${ICONS.arrowUp}
                    <span>TOP</span>
                  </span>
                  <kbd style="font-size: 8.5px; font-family: monospace; background: #ffffff; padding: 1px 4px; border-radius: 3px; border: 1px solid #f3e8ff; color: #7e22ce;">1</kbd>
                </div>
                <span style="font-size: 9px; opacity: 0.9; text-align: center; white-space: nowrap;">Trục thân người</span>
              </button>

              <!-- 2. FIT SIDE NGƯỜI -->
              <button id="btn-fit-side" title="Căn mép trước/sau đón tia theo trục dọc X (Giữ nguyên Z và kích thước L, W, H) (Phím 2 hoặc S)" style="
                background: #fdf4ff;
                border: 1px solid #f0abfc;
                color: #a21caf;
                padding: 7px 5px;
                border-radius: 8px;
                cursor: pointer;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 2px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.04);
                transition: all 0.12s;
              ">
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                  <span style="font-size: 11px; font-weight: 700; letter-spacing: -0.2px; display: flex; align-items: center; gap: 3px;">
                    ${ICONS.arrowRightLeft}
                    <span>SIDE</span>
                  </span>
                  <kbd style="font-size: 8.5px; font-family: monospace; background: #ffffff; padding: 1px 4px; border-radius: 3px; border: 1px solid #fae8ff; color: #a21caf;">2</kbd>
                </div>
                <span style="font-size: 9px; opacity: 0.9; text-align: center; white-space: nowrap;">Cản đón tia X</span>
              </button>

              <!-- 3. FIT FRONT NGƯỜI -->
              <button id="btn-fit-front" title="Căn sườn trái/phải đón tia theo trục ngang Y (Giữ nguyên Z và kích thước L, W, H) (Phím 3 hoặc W)" style="
                background: #f5f3ff;
                border: 1px solid #c4b5fd;
                color: #6d28d9;
                padding: 7px 5px;
                border-radius: 8px;
                cursor: pointer;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 2px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.04);
                transition: all 0.12s;
              ">
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                  <span style="font-size: 11px; font-weight: 700; letter-spacing: -0.2px; display: flex; align-items: center; gap: 3px;">
                    ${ICONS.arrowUpDown}
                    <span>FRONT</span>
                  </span>
                  <kbd style="font-size: 8.5px; font-family: monospace; background: #ffffff; padding: 1px 4px; border-radius: 3px; border: 1px solid #ede9fe; color: #6d28d9;">3</kbd>
                </div>
                <span style="font-size: 9px; opacity: 0.9; text-align: center; white-space: nowrap;">Sườn đón tia Y</span>
              </button>
            </div>

            <!-- THANH 3 NÚT TÁCH BIỆT: FIX DÀI (L) - FIX RỘNG (W) - FIX CAO (H) CHO NGƯỜI ĐI BỘ -->
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px;">
              <!-- 1. NÚT FIX DÀI L -->
              <button id="btn-fit-ped-l" title="Tự động đo và co giãn riêng Chiều Dài L ôm thân người (giữ nguyên W, H & Z)" style="
                background: #fdf4ff;
                border: 1px solid #f0abfc;
                color: #a21caf;
                padding: 6px 4px;
                border-radius: 7px;
                font-size: 9.5px;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 3px;
                transition: all 0.12s;
                box-shadow: 0 1px 2px rgba(0,0,0,0.03);
              ">
                <span style="display: flex; align-items: center; color: #c026d3;">${ICONS.arrowRightLeft}</span>
                <span>Fit Dài (L)</span>
              </button>

              <!-- 2. NÚT FIX RỘNG W -->
              <button id="btn-fit-ped-w" title="Tự động đo và co giãn riêng Chiều Rộng W ôm vai/ngực (giữ nguyên L, H & Z)" style="
                background: #faf5ff;
                border: 1px solid #d8b4fe;
                color: #7e22ce;
                padding: 6px 4px;
                border-radius: 7px;
                font-size: 9.5px;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 3px;
                transition: all 0.12s;
                box-shadow: 0 1px 2px rgba(0,0,0,0.03);
              ">
                <span style="display: flex; align-items: center; color: #9333ea;">${ICONS.sparkles}</span>
                <span>Fit Rộng (W)</span>
              </button>

              <!-- 3. NÚT FIX CAO H -->
              <button id="btn-fit-ped-h" title="Tự động đo đỉnh đầu và fit riêng Chiều Cao H (Đáy tiếp đất giữ nguyên cố định, đỉnh đầu nở lên +12cm), giữ nguyên L, W và XY" style="
                background: #fff7ed;
                border: 1px solid #fdba74;
                color: #c2410c;
                padding: 6px 4px;
                border-radius: 7px;
                font-size: 9.5px;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 3px;
                transition: all 0.12s;
                box-shadow: 0 1px 2px rgba(0,0,0,0.03);
              ">
                <span style="display: flex; align-items: center; color: #ea580c;">${ICONS.arrowUpDown}</span>
                <span>Fit Cao (H)</span>
              </button>
            </div>

            <!-- NÚT FIT TOÀN DIỆN CHO NGƯỜI ĐI BỘ (1-CHẠM CHU TRÌNH HOÀN CHỈNH) -->
            <button id="btn-fit-ped-all" title="Fit Người Đi Bộ toàn diện: Khóa đứng 0° • Bù đỉnh đầu +12cm • Co giãn dáng người (Phím P)" style="
              width: 100%;
              background: linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%);
              border: 1px dashed #c084fc;
              color: #6b21a8;
              padding: 5px 8px;
              border-radius: 6px;
              font-size: 10px;
              font-weight: 600;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: space-between;
              transition: all 0.12s;
            ">
              <span style="display: flex; align-items: center; gap: 5px;">
                ${ICONS.user}
                <span>Fit Toàn Diện Người Đi Bộ (ALL)</span>
              </span>
              <kbd style="font-size: 8.5px; font-family: monospace; background: #ffffff; border: 1px solid #e9d5ff; padding: 1px 5px; border-radius: 3px; color: #6b21a8;">P</kbd>
            </button>
          `
          }

          <!-- THAO TÁC 1-CHẠM THƯỜNG DÙNG: GHIM ĐẤT (G) & LẬT ĐẦU 180° (F) -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px;">
            <!-- GHIM MẶT ĐẤT -->
            <button id="btn-quick-ground" title="Đáy xe chạm sát mặt đường chuẩn xác 100%, khóa Roll 0° (Phím G)" style="
              background: #f0fdf4;
              border: 1px solid #bbf7d0;
              color: #15803d;
              padding: 6px 10px;
              border-radius: 7px;
              font-size: 11px;
              font-weight: 600;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: space-between;
              transition: all 0.12s;
              box-shadow: 0 1px 2px rgba(0,0,0,0.03);
            ">
              <span style="display: flex; align-items: center; gap: 5px;">
                <span style="display: flex; align-items: center; color: #16a34a;">${ICONS.road}</span>
                <span>Ghim Đất</span>
              </span>
              <kbd style="font-size: 9px; font-family: monospace; background: #dcfce7; border: 1px solid #bbf7d0; padding: 1px 4px; border-radius: 3px; color: #15803d;">G</kbd>
            </button>

            <!-- LẬT ĐẦU 180° -->
            <button id="btn-quick-flip" title="Lật ngược đầu xe 180° tức thì (Phím F)" style="
              background: #ffffff;
              border: 1px solid #e2e8f0;
              color: #0f172a;
              padding: 6px 10px;
              border-radius: 7px;
              font-size: 11px;
              font-weight: 600;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: space-between;
              transition: all 0.12s;
              box-shadow: 0 1px 2px rgba(0,0,0,0.03);
            ">
              <span style="display: flex; align-items: center; gap: 5px;">
                <span style="display: flex; align-items: center; color: #64748b;">${ICONS.flip}</span>
                <span>Lật Đầu 180°</span>
              </span>
              <kbd style="font-size: 9px; font-family: monospace; background: #f1f5f9; border: 1px solid #e2e8f0; padding: 1px 4px; border-radius: 3px; color: #64748b;">F</kbd>
            </button>
          </div>

          <!-- NÚT RIÊNG: GHIM ĐẤT TOÀN TRACK -->
          <div style="margin-top: 5px;">
            <button id="btn-snap-ground-track" title="Ghim toàn bộ đáy xe xuống mặt đất cho TẤT CẢ các frame theo Track ID #${this.selectedUiId !== null ? this.selectedUiId : 'N/A'}" style="
              width: 100%;
              background: #f0fdf4;
              border: 1px solid #86efac;
              color: #15803d;
              padding: 6px 10px;
              border-radius: 7px;
              font-size: 11px;
              font-weight: 600;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: space-between;
              transition: all 0.12s;
              box-shadow: 0 1px 2px rgba(0,0,0,0.03);
            ">
              <span style="display: flex; align-items: center; gap: 5px;">
                <span style="display: flex; align-items: center; color: #16a34a;">${ICONS.road}</span>
                <span>Ghim Đất Toàn Track</span>
              </span>
              <span style="display: flex; align-items: center; gap: 4px;">
                <span style="font-size: 9px; background: #dcfce7; color: #15803d; padding: 1px 6px; border-radius: 4px; font-weight: 700; border: 1px solid #bbf7d0;">All Track</span>
              </span>
            </button>
          </div>
        </div>

        <!-- KHỐI 3: BỘ ĐIỀU CHỈNH KÍCH THƯỚC & CENTER (COMPACT STEPPER - LIGHT) -->
        <div style="
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 8px 10px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        ">
          <!-- HEADER & TOGGLE PHẠM VI -->
          <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 4px; border-bottom: 1px solid #f1f5f9;">
            <span style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase;">Kích thước hộp & Center:</span>
            <div id="btn-toggle-scope" style="
              background: #f1f5f9;
              border: 1px solid #e2e8f0;
              border-radius: 5px;
              display: flex;
              padding: 2px;
              cursor: pointer;
              font-size: 9.5px;
              font-family: ui-monospace, monospace;
            ">
              <span style="
                padding: 2px 7px;
                border-radius: 4px;
                background: ${!this.applyToTrack ? "#ffffff" : "transparent"};
                color: ${!this.applyToTrack ? "#059669" : "#64748b"};
                font-weight: ${!this.applyToTrack ? "600" : "normal"};
                box-shadow: ${!this.applyToTrack ? "0 1px 2px rgba(0,0,0,0.06)" : "none"};
              ">Frame Này</span>
              <span style="
                padding: 2px 7px;
                border-radius: 4px;
                background: ${this.applyToTrack ? "#fee2e2" : "transparent"};
                color: ${this.applyToTrack ? "#dc2626" : "#64748b"};
                font-weight: ${this.applyToTrack ? "600" : "normal"};
                box-shadow: ${this.applyToTrack ? "0 1px 2px rgba(0,0,0,0.06)" : "none"};
              ">Toàn Track</span>
            </div>
          </div>

          <!-- NÚT FIT BOX HIỆN TẠI VỚI PADDING 5CM (BÁM SÀN CỐ ĐỊNH) -->
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 5px;">
            <button id="btn-fit-current-box" title="Fit kích thước L, W, H theo mây điểm tại frame này (Padding +5cm mỗi bên, ghim sàn giữ cố định đáy, chỉ nở lên nóc). ${this.applyToTrack ? 'Áp dụng Toàn Track' : 'Chỉ Frame Này'}" style="
              width: 100%;
              background: #f0fdf4;
              border: 1px solid #86efac;
              color: #15803d;
              padding: 6px 10px;
              border-radius: 7px;
              font-size: 11px;
              font-weight: 600;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: space-between;
              transition: all 0.12s;
              box-shadow: 0 1px 2px rgba(0,0,0,0.03);
            ">
              <span style="display: flex; align-items: center; gap: 6px;">
                <span style="display: flex; align-items: center; color: #16a34a;">${ICONS.sparkles}</span>
                <span>Fit Box Hiện Tại (+5cm Pad)</span>
              </span>
              <span style="font-size: 9px; font-family: monospace; background: #dcfce7; border: 1px solid #bbf7d0; padding: 1px 5px; border-radius: 4px; color: #15803d; font-weight: 700;">
                +5cm Pad
              </span>
            </button>
          </div>

          <!-- GỢI Ý MẪU KÍCH THƯỚC CHUẨN (1-CLICK ÁP DỤNG) -->
          <div style="display: flex; flex-direction: column; gap: 4px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 7px; padding: 5px 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 9.5px; font-weight: 600; color: #475569;">
                Mẫu ${this.selectedCategory === "pedestrian" ? "Người đi bộ" : this.selectedCategory === "cyclist" ? "Xe 2 bánh" : "Ô tô"} chuẩn:
              </span>
              <span style="font-size: 8.5px; color: #94a3b8; font-family: monospace;">1-Click áp dụng</span>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 4px; max-height: 80px; overflow-y: auto; padding-right: 2px;">
              ${activePresets
                .map(
                  (preset, pIdx) => `
                <button class="btn-preset-chip" data-idx="${pIdx}" title="${preset.name} - ${preset.description || ''} (${preset.l} x ${preset.w} x ${preset.h}m)" style="
                  background: #ffffff;
                  border: 1px solid #cbd5e1;
                  color: #334155;
                  padding: 2px 6px;
                  border-radius: 4px;
                  font-size: 9px;
                  cursor: pointer;
                  display: flex;
                  align-items: center;
                  gap: 3px;
                  transition: all 0.12s;
                  white-space: nowrap;
                ">
                  <span style="font-weight: 600;">${preset.name}</span>
                  <span style="font-size: 8px; font-family: monospace; color: #64748b;">${preset.l}x${preset.w}x${preset.h}</span>
                </button>
              `
                )
                .join("")}
            </div>
          </div>

          <!-- NÚT ĐÁNH DẤU OUTSIDE TOÀN TRACK -->
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 5px;">
            <button id="btn-outside-entire-track" title="Đánh dấu Outside (ẩn) cho toàn bộ frame của Track này (Shift+O)" style="
              width: 100%;
              background: #fff1f2;
              border: 1px solid #fecdd3;
              color: #e11d48;
              padding: 5px 8px;
              border-radius: 6px;
              font-size: 10px;
              font-weight: 600;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: space-between;
              transition: all 0.12s;
              box-shadow: 0 1px 2px rgba(0,0,0,0.02);
            ">
              <span style="display: flex; align-items: center; gap: 5px;">
                <span style="display: flex; align-items: center;">${ICONS.eyeOff}</span>
                <span>Outside Toàn Track</span>
              </span>
              <kbd style="font-size: 8.5px; font-family: monospace; background: #ffffff; border: 1px solid #fecdd3; padding: 1px 4px; border-radius: 3px; color: #e11d48;">⇧O</kbd>
            </button>
          </div>

          <!-- 3 STEPPER: DÀI (L) [2D Side], RỘNG (W) [2D Front], CAO (H) [Đáy Ghim Sàn] -->
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 5px;">
            <!-- Chiều Dài L -->
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <span style="font-size: 9px; color: ${this.selectedCategory === "cyclist" ? "#b45309" : "#64748b"}; font-family: monospace; font-weight: ${this.selectedCategory === "cyclist" ? "700" : "500"};">
                ${this.selectedCategory === "cyclist" ? "Dài (L) [🔒 Khóa]:" : "Dài (L) [Side]:"}
              </span>
              <div style="display: flex; align-items: center; background: #f8fafc; border: 1px solid ${this.selectedCategory === "cyclist" ? "#fcd34d" : "#cbd5e1"}; border-radius: 6px;">
                <button class="btn-step" data-axis="l" data-delta="-0.05" style="border: none; background: transparent; color: #475569; padding: 3px 5px; cursor: pointer; font-weight: bold;">-</button>
                <input id="input-dim-l" type="number" step="0.05" value="${this.editL || this.currentL}" style="width: 100%; border: none; background: transparent; color: ${this.selectedCategory === "cyclist" ? "#b45309" : "#0284c7"}; font-size: 11px; font-weight: bold; text-align: center; outline: none; font-family: monospace;" />
                <button class="btn-step" data-axis="l" data-delta="0.05" style="border: none; background: transparent; color: #475569; padding: 3px 5px; cursor: pointer; font-weight: bold;">+</button>
              </div>
            </div>

            <!-- Chiều Rộng W -->
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <span style="font-size: 9px; color: #64748b; font-family: monospace; font-weight: 500;">Rộng (W) [Front]:</span>
              <div style="display: flex; align-items: center; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px;">
                <button class="btn-step" data-axis="w" data-delta="-0.05" style="border: none; background: transparent; color: #475569; padding: 3px 5px; cursor: pointer; font-weight: bold;">-</button>
                <input id="input-dim-w" type="number" step="0.05" value="${this.editW || this.currentW}" style="width: 100%; border: none; background: transparent; color: #0284c7; font-size: 11px; font-weight: bold; text-align: center; outline: none; font-family: monospace;" />
                <button class="btn-step" data-axis="w" data-delta="0.05" style="border: none; background: transparent; color: #475569; padding: 3px 5px; cursor: pointer; font-weight: bold;">+</button>
              </div>
            </div>

            <!-- Chiều Cao H -->
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <span style="font-size: 9px; color: #64748b; font-family: monospace; font-weight: 500;">Cao (H) [Fit Lên]:</span>
              <div style="display: flex; align-items: center; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px;">
                <button class="btn-step" data-axis="h" data-delta="-0.05" style="border: none; background: transparent; color: #475569; padding: 3px 5px; cursor: pointer; font-weight: bold;">-</button>
                <input id="input-dim-h" type="number" step="0.05" value="${this.editH || this.currentH}" style="width: 100%; border: none; background: transparent; color: #0284c7; font-size: 11px; font-weight: bold; text-align: center; outline: none; font-family: monospace;" />
                <button class="btn-step" data-axis="h" data-delta="0.05" style="border: none; background: transparent; color: #475569; padding: 3px 5px; cursor: pointer; font-weight: bold;">+</button>
              </div>
            </div>
          </div>

          <!-- BỘ VI CHỈNH CENTER 2D DÀN ĐỀU (TIẾN/LÙI DỌC X & TRÁI/PHẢI NGANG Y) -->
          <div style="
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 5px 7px;
            display: flex;
            flex-direction: column;
            gap: 4px;
          ">
            <!-- Trục Dọc X (Tiến / Lùi - Side View) -->
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 9px; font-weight: 600; color: #475569; font-family: monospace;">Tâm X (Side):</span>
              <div style="display: flex; gap: 3px;">
                <button class="btn-shift-center" data-dx="-0.05" data-dy="0" title="Lùi tâm 5cm" style="border: 1px solid #cbd5e1; background: #ffffff; color: #334155; padding: 1px 5px; border-radius: 3px; font-size: 8.5px; font-family: monospace; cursor: pointer;">-5cm</button>
                <button class="btn-shift-center" data-dx="-0.01" data-dy="0" title="Lùi tâm 1cm" style="border: 1px solid #cbd5e1; background: #ffffff; color: #334155; padding: 1px 5px; border-radius: 3px; font-size: 8.5px; font-family: monospace; cursor: pointer;">-1cm</button>
                <button class="btn-shift-center" data-dx="0.01" data-dy="0" title="Tiến tâm 1cm" style="border: 1px solid #cbd5e1; background: #ffffff; color: #334155; padding: 1px 5px; border-radius: 3px; font-size: 8.5px; font-family: monospace; cursor: pointer;">+1cm</button>
                <button class="btn-shift-center" data-dx="0.05" data-dy="0" title="Tiến tâm 5cm" style="border: 1px solid #cbd5e1; background: #ffffff; color: #334155; padding: 1px 5px; border-radius: 3px; font-size: 8.5px; font-family: monospace; cursor: pointer;">+5cm</button>
              </div>
            </div>

            <!-- Trục Ngang Y (Trái / Phải - Front View) -->
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 9px; font-weight: 600; color: #475569; font-family: monospace;">Tâm Y (Front):</span>
              <div style="display: flex; gap: 3px;">
                <button class="btn-shift-center" data-dx="0" data-dy="-0.05" title="Dời tâm sang phải 5cm" style="border: 1px solid #cbd5e1; background: #ffffff; color: #334155; padding: 1px 5px; border-radius: 3px; font-size: 8.5px; font-family: monospace; cursor: pointer;">-5cm</button>
                <button class="btn-shift-center" data-dx="0" data-dy="-0.01" title="Dời tâm sang phải 1cm" style="border: 1px solid #cbd5e1; background: #ffffff; color: #334155; padding: 1px 5px; border-radius: 3px; font-size: 8.5px; font-family: monospace; cursor: pointer;">-1cm</button>
                <button class="btn-shift-center" data-dx="0" data-dy="0.01" title="Dời tâm sang trái 1cm" style="border: 1px solid #cbd5e1; background: #ffffff; color: #334155; padding: 1px 5px; border-radius: 3px; font-size: 8.5px; font-family: monospace; cursor: pointer;">+1cm</button>
                <button class="btn-shift-center" data-dx="0" data-dy="0.05" title="Dời tâm sang trái 5cm" style="border: 1px solid #cbd5e1; background: #ffffff; color: #334155; padding: 1px 5px; border-radius: 3px; font-size: 8.5px; font-family: monospace; cursor: pointer;">+5cm</button>
              </div>
            </div>
          </div>

          <!-- GỢI Ý DÒNG XE CATALOG & NÚT LƯU KÍCH THƯỚC -->
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 2px;">
            <span style="font-size: 9.5px; color: #64748b; font-family: ui-monospace, monospace;">
              Khớp: <strong style="color: #059669;">${bestFit.matchedItem.name}</strong> (${bestFit.confidence}%)
              <button class="catalog-btn" data-l="${bestFit.recommendedL}" data-w="${bestFit.recommendedW}" data-h="${bestFit.recommendedH}" data-name="${bestFit.matchedItem.name}" style="
                border: none;
                background: transparent;
                color: #0284c7;
                font-size: 9.5px;
                cursor: pointer;
                text-decoration: underline;
                padding-left: 4px;
                font-weight: 600;
              ">Áp dụng</button>
            </span>

            <button id="btn-apply-dimensions" style="
              background: #0f172a;
              border: 1px solid #0f172a;
              color: #ffffff;
              padding: 4px 10px;
              border-radius: 5px;
              font-size: 10px;
              font-weight: 600;
              cursor: pointer;
              display: flex;
              align-items: center;
              gap: 4px;
              transition: background 0.12s;
            ">
              ${ICONS.save}
              <span>Lưu</span>
            </button>
          </div>
        </div>

        <!-- KHỐI 4: ACCORDION TINH CHỈNH NÂNG CAO (COLLAPSIBLE - LIGHT) -->
        <button id="btn-toggle-advanced" style="
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          color: #334155;
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
            <span style="display: flex; align-items: center; color: #64748b;">${ICONS.sliders}</span>
            <span style="color: #09090b; font-weight: 600;">Tinh Chỉnh Nâng Cao</span>
          </span>
          <span style="display: flex; align-items: center; gap: 4px; font-size: 10px; color: #64748b;">
            <span>${this.isAdvancedOpen ? "Thu gọn" : "Mở rộng"}</span>
            <span style="display: flex; align-items: center;">${this.isAdvancedOpen ? ICONS.chevronUp : ICONS.chevronDown}</span>
          </span>
        </button>

        ${advancedContentHtml}

        <!-- KHỐI 5: NÚT MỞ RỘNG FULLSCREEN TRACK STUDIO (DUYỆT THEO ID) -->
        <button id="btn-banner-fullscreen-editor" title="Mở Rộng Toàn Màn Hình · Duyệt Toàn Bộ Track ID (Shift+M)" style="
          background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
          border: 1px solid #bfdbfe;
          color: #1d4ed8;
          padding: 6px 10px;
          border-radius: 8px;
          font-size: 10.5px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: space-between;
          transition: all 0.15s;
        ">
          <span style="display: flex; align-items: center; gap: 6px;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
            <span>Duyệt Toàn Track ID (Full Screen)</span>
          </span>
          <kbd style="font-size: 9px; font-family: monospace; background: #ffffff; border: 1px solid #bfdbfe; padding: 1px 4px; border-radius: 3px; color: #1d4ed8;">⇧M</kbd>
        </button>
      </div>

      <!-- CARD FOOTER (LIGHT) -->
      <div style="
        padding: 6px 12px;
        background: #f8fafc;
        border-top: 1px solid #e2e8f0;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 9.5px;
        color: #64748b;
        font-family: ui-monospace, monospace;
      ">
        <span>300K LIDAR FIT</span>
        <span style="color: #059669; display: flex; align-items: center; gap: 4px; font-weight: 600;">
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

    // 1. Gắn sự kiện chọn nhanh Loại đối tượng (Category Chips)
    const catChips = this.container.querySelectorAll<HTMLButtonElement>(".btn-category-chip");
    catChips.forEach((btn) => {
      btn.addEventListener("click", () => {
        const cat = btn.dataset.cat as "car" | "pedestrian" | "cyclist";
        if (cat && cat !== this.selectedCategory) {
          this.selectedCategory = cat;
          this.updateContent();
          this.showToast(`Chế độ: ${cat === "car" ? "Ô tô" : cat === "pedestrian" ? "Người đi bộ" : "Xe 2 bánh"}`, "info");
        }
      });
    });

    // 2. Gắn sự kiện 3 Nút Fit độc lập (Top, Side, Front)
    const fitTopBtn = this.container.querySelector("#btn-fit-top");
    if (fitTopBtn) fitTopBtn.addEventListener("click", () => this.handleFitTop());

    const fitSideBtn = this.container.querySelector("#btn-fit-side");
    if (fitSideBtn) fitSideBtn.addEventListener("click", () => this.handleFitSide());

    const fitFrontBtn = this.container.querySelector("#btn-fit-front");
    if (fitFrontBtn) fitFrontBtn.addEventListener("click", () => this.handleFitFront());

    // Nút Hero 1-Click Smart Fit (dành riêng cho Người Đi Bộ hoặc Xe 2 bánh)
    const heroBtn = this.container.querySelector("#btn-hero-smart-fit");
    if (heroBtn) {
      heroBtn.addEventListener("click", () => {
        if (this.selectedCategory === "pedestrian") {
          this.handleFitPedestrian();
        } else if (this.selectedCategory === "cyclist") {
          this.handleFitCyclist();
        }
      });
    }

    // Nút Fit Toàn Diện cho Người Đi Bộ (ALL)
    const fitPedAllBtn = this.container.querySelector("#btn-fit-ped-all");
    if (fitPedAllBtn) {
      fitPedAllBtn.addEventListener("click", () => this.handleFitPedestrian("all"));
    }

    // Nút Fix Dài (L) cho Người Đi Bộ
    const fitPedLBtn = this.container.querySelector("#btn-fit-ped-l");
    if (fitPedLBtn) {
      fitPedLBtn.addEventListener("click", () => this.handleFitPedestrian("l"));
    }

    // Nút Fix Rộng (W) cho Người Đi Bộ
    const fitPedWBtn = this.container.querySelector("#btn-fit-ped-w");
    if (fitPedWBtn) {
      fitPedWBtn.addEventListener("click", () => this.handleFitPedestrian("w"));
    }

    // Nút Fix Cao (H) cho Người Đi Bộ
    const fitPedHBtn = this.container.querySelector("#btn-fit-ped-h");
    if (fitPedHBtn) {
      fitPedHBtn.addEventListener("click", () => this.handleFitPedestrian("h"));
    }

    // Nút Fit Toàn Diện cho Xe 2 Bánh (Chu trình hoàn chỉnh TOP ➔ SIDE ➔ FRONT)
    const fitCyclistAllBtn = this.container.querySelector("#btn-fit-cyclist-all");
    if (fitCyclistAllBtn) {
      fitCyclistAllBtn.addEventListener("click", () => this.handleFitCyclist("all"));
    }

    // Nút Fit riêng Chiều Rộng W cho Xe 2 Bánh (+5cm đệm gương xe)
    const fitCyclistWBtn = this.container.querySelector("#btn-fit-cyclist-w");
    if (fitCyclistWBtn) {
      fitCyclistWBtn.addEventListener("click", () => this.handleFitCyclist("w"));
    }

    // Nút Fit riêng Chiều Cao H cho Xe 2 Bánh (Mặt đáy tiếp đất giữ nguyên cố định, nở lên nóc)
    const fitCyclistHBtn = this.container.querySelector("#btn-fit-cyclist-h");
    if (fitCyclistHBtn) {
      fitCyclistHBtn.addEventListener("click", () => this.handleFitCyclist("h"));
    }

    // 3. Gắn sự kiện Thao tác nhanh (1 Chạm: Lật đầu & Ghim đất)
    const quickFlipBtn = this.container.querySelector("#btn-quick-flip");
    if (quickFlipBtn) quickFlipBtn.addEventListener("click", () => this.handleFlipYaw(true));

    const quickGroundBtn = this.container.querySelector("#btn-quick-ground");
    if (quickGroundBtn) quickGroundBtn.addEventListener("click", () => this.handleSnapGround("road"));

    // Nút Riêng: Ghim Đất Toàn Track
    const quickGroundTrackBtn = this.container.querySelector("#btn-snap-ground-track");
    if (quickGroundTrackBtn) quickGroundTrackBtn.addEventListener("click", () => this.handleSnapGroundTrack());

    // 4. Gắn sự kiện Mở rộng / Thu gọn Accordion Tinh chỉnh nâng cao
    const toggleAdvancedBtn = this.container.querySelector("#btn-toggle-advanced");
    if (toggleAdvancedBtn) {
      toggleAdvancedBtn.addEventListener("click", () => {
        this.isAdvancedOpen = !this.isAdvancedOpen;
        this.updateContent();
      });
    }

    // 5. Gắn sự kiện nút Hoàn Tác (Pre), Thu nhỏ & Quét Frame
    const undoBtn = this.container.querySelector("#floating-btn-undo");
    if (undoBtn) undoBtn.addEventListener("click", () => this.handleUndo());

    const minBtn = this.container.querySelector("#floating-btn-minimize");
    if (minBtn) minBtn.addEventListener("click", () => this.toggleMinimize());

    const syncBtn = this.container.querySelector("#floating-btn-sync-frame");
    if (syncBtn) {
      syncBtn.addEventListener("click", async () => {
        this.showToast("Đang quét lại xe ở frame này...", "info");
        await this.syncFrameTracks();
      });
    }

    // 6. Gắn sự kiện Bật/Tắt Dropdown Select
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

    // 7. Gắn sự kiện Prev / Next
    const prevBtn = this.container.querySelector("#btn-prev-frame-track");
    if (prevBtn) prevBtn.addEventListener("click", () => this.selectPrevTrack());

    const nextBtn = this.container.querySelector("#btn-next-frame-track");
    if (nextBtn) nextBtn.addEventListener("click", () => this.selectNextTrack());

    // 8. Gắn sự kiện Toggle Scope: Frame Này vs Toàn Track
    const scopeToggle = this.container.querySelector("#btn-toggle-scope");
    if (scopeToggle) {
      scopeToggle.addEventListener("click", () => {
        this.applyToTrack = !this.applyToTrack;
        this.updateContent();
        this.showToast(`Phạm vi: ${this.applyToTrack ? "Toàn Bộ Track" : "Chỉ Frame Này"}`, "info");
      });
    }

    // 9. Gắn sự kiện Stepper (L, W, H)
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

    // Gắn sự kiện Fit Box Hiện Tại (+5cm Pad)
    const fitCurrentBoxBtn = this.container.querySelector("#btn-fit-current-box");
    if (fitCurrentBoxBtn) {
      fitCurrentBoxBtn.addEventListener("click", () => this.handleFitCurrentBox());
    }

    // Gắn sự kiện Chọn nhanh Preset mẫu kích thước chuẩn (Ô tô, Xe 2 bánh, Người đi bộ)
    const presetChips = this.container.querySelectorAll<HTMLButtonElement>(".btn-preset-chip");
    presetChips.forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.idx || "0", 10);
        const preset = activePresets[idx];
        if (preset) {
          this.handleApplyPreset(preset);
        }
      });
    });

    // Gắn sự kiện Đánh dấu Outside toàn bộ frame của Track (Shift+O)
    const outsideTrackBtn = this.container.querySelector("#btn-outside-entire-track");
    if (outsideTrackBtn) {
      outsideTrackBtn.addEventListener("click", () => this.handleSetTrackOutside(true));
    }

    // Gắn sự kiện Vi Chỉnh Center 2D Dàn Đều (deltaXLocal, deltaYLocal)
    const shiftCenterBtns = this.container.querySelectorAll<HTMLButtonElement>(".btn-shift-center");
    shiftCenterBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const dx = parseFloat(btn.dataset.dx || "0");
        const dy = parseFloat(btn.dataset.dy || "0");
        if (dx !== 0 || dy !== 0) {
          this.handleShiftCenter(dx, dy);
        }
      });
    });

    // 10. Gắn sự kiện Preset Catalog
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

    // Gắn sự kiện Căn Yaw Theo Vạch Kẻ Làn Đường 3D (LiDAR Intensity Lane Snap)
    const snapYawLaneBtn = this.container.querySelector("#btn-snap-yaw-lane");
    if (snapYawLaneBtn) {
      snapYawLaneBtn.addEventListener("click", () => this.handleSnapYawToLane());
    }

    // 11. Gắn sự kiện Xoay Vi Chỉnh Yaw (nếu accordion đang mở)
    const rotBtns = this.container.querySelectorAll<HTMLButtonElement>(".btn-rot");
    rotBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const deg = parseInt(btn.dataset.deg || "0", 10);
        if (deg !== 0) {
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

    // 12. Gắn sự kiện Ghim Mặt Đất, Vỉa Hè, Dốc Pitch & Roll (trong accordion)
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

    // 13. Gắn sự kiện Mở Rộng Full Màn Hình (Fullscreen Track Studio)
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

    const firstTrack = this.frameTracks[0];
    const targetUiId = this.selectedUiId !== null ? this.selectedUiId : (firstTrack ? firstTrack.uiId : 1);
    const targetServerId = this.selectedServerId || (firstTrack ? firstTrack.serverId : undefined);

    this.trackStudioModal.open(
      this.currentCtx,
      targetUiId,
      targetServerId,
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
