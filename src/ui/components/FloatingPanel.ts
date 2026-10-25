import { CVATContext, OrthoSlicingConfig } from "../../core/types";
import { ICONS } from "../icons";
import { CVATBridge, FrameTrackItem, type BoxEdgeContactsResult, type EdgeContactSide } from "../../cvat/bridge";
import type { VehicleCatalogItem } from "../../core/catalog";
import { QCStudioModal } from "./QCStudioModal";
import { QCEngine, classifyLabelGroup, detectObjectCategory } from "../../core/qc/qc_engine.ts";
import type { QCObjectInstance, QCIssue } from "../../core/qc/types.ts";
import { CameraOverlayManager, setVinCalibForOverlay } from "./CameraOverlay";
import { CameraFocusModal } from "./CameraFocusModal";
import { HeaderSuiteButton } from "./HeaderSuiteButton";
import { HelperOverlay } from "../../helper/overlay";
import type { Box3D } from "../../core/geometry";

// Modules con chuyên biệt sau khi phân rã
import { HotkeysModal } from "./FloatingPanel/hotkeys_modal";
import { HistoryManager } from "./FloatingPanel/history_manager";
import {
  type HistorySnapshot,
  type UndoSnapshot,
  type TrackStatsInfo,
  type FrameIssueGroup,
  type TrackQCResult,
  type ObjectCategory,
  type ActiveMainTab,
  type ActiveViewType,
  type PointColorMode,
  type CanvasThemeMode,
} from "./FloatingPanel/panel_state";
import {
  renderHeader,
  renderMainTabsSwitcher,
  renderEditTabContent,
  renderQCTabContent,
  renderMiniPillHtml,
  renderCardFooter,
  renderToastHtml,
  renderEdgeContactBadge,
  renderEdgeContactsHUD,
  renderTrackStatsSubHeader,
} from "./FloatingPanel/panel_template";
import {
  type IFloatingPanelActionsHost,
  handleNudgeByView,
  handleSetTrackOutside,
  handleFlipYaw,
  handleUpdateDimensions,
  handleStepDimension,
  rotateYawByDelta,
  rotatePitchByDelta,
  toggleScope,
  handleSmartFitAll,
  handleFitCurrentBox,
  handleApplyPreset,
  handleShiftCenter,
  handleSnapGround,
  handleSnapGroundTrack,
  handleSnapYawToLane,
  handleEgoRayFit,
  handleFitTop,
  handleFitSide,
  handleFitFront,
  handleFitWidth,
  handleFitHeight,
  handleFitCarDimension,
  handleFitPedestrian,
  handleFitCyclist,
  handleAlignBoxToPoints,
  handleCatalogFit,
  handleSmartAnchorFit,
  toggleOrthoSlicing,
  stepOrthoSlab,
  toggleHideGround,
  toggleIsolateROI,
} from "./FloatingPanel/quick_fit_actions";

// Re-export để đảm bảo tương thích 100% với các file bên ngoài (Zero Breaking Changes)
export type {
  HistorySnapshot,
  UndoSnapshot,
  TrackStatsInfo,
  FrameIssueGroup,
  TrackQCResult,
  ObjectCategory,
  ActiveMainTab,
  ActiveViewType,
  PointColorMode,
  CanvasThemeMode,
};

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
export class FloatingPanel implements IFloatingPanelActionsHost {
  public container: HTMLDivElement | null = null;
  private miniPill: HTMLDivElement | null = null;
  private toastOverlay: HTMLDivElement | null = null;
  private toastTimer: any = null;
  private isMinimized: boolean = false;
  private qcStudioModal: QCStudioModal = new QCStudioModal();
  private qcEngine: QCEngine = new QCEngine();
  private hotkeysModal: HotkeysModal = new HotkeysModal();
  private historyManager: HistoryManager = new HistoryManager();

  // Tab chính của Floating Panel: "edit" (Chỉnh sửa) hoặc "qc" (Kiểm tra QC tức thì)
  public activeMainTab: "edit" | "qc" = "edit";

  // Bộ nhớ đệm RAM lưu kết quả QC độc lập cho từng Track ID (0ms latency, không fetch lại)
  public trackQCRamCache: Map<number, TrackQCResult> = new Map();
  private pendingTrackQCPreloads: Set<number> = new Set();

  // Chế độ phân loại đối tượng nhanh: "car" | "pedestrian" | "cyclist"
  public selectedCategory: ObjectCategory = "car";

  // Trạng thái mở rộng accordion tinh chỉnh nâng cao
  private isAdvancedOpen: boolean = false;

  // Phạm vi áp dụng kích thước: false = Chỉ Frame này, true = Toàn bộ Track
  public applyToTrack: boolean = false;

  // Dữ liệu đối tượng đang chọn
  public selectedUiId: number | null = null;       // Số instance clientID tại frame này (dùng tương tác Three.js)
  public selectedTrackId: number | null = null;    // Số Track ID bền vững toàn cục xuyên suốt các frame
  public selectedServerId: number | null = null;   // Số 31, 32 lưu database
  public currentLabel: string = "Chưa chọn xe";
  public currentX: number = 0;
  public currentY: number = 0;
  public currentZ: number = 0;
  public currentYawDeg: number = 0;
  public currentL: number = 0;
  public currentW: number = 0;
  public currentH: number = 0;
  private currentRawPoints: number[] | null = null; // Lưu trữ mảng điểm nguyên bản (16 điểm) từ CVAT
  public currentAttributes: Record<string, any> = {}; // Lưu trữ attributes (balo, vali, xe đỗ, sitting, v.v.)

  // Giá trị đang chỉnh sửa trên ô input (L, W, H)
  public editL: number = 0;
  public editW: number = 0;
  public editH: number = 0;

  // Danh sách các xe ĐANG CÓ MẶT TẠI FRAME HIỆN TẠI
  public currentFrameNumber: number = 0;
  private lastContextImageFrame: number = -1;
  private contextImagesDebounceTimer: any = null;
  public frameTracks: FrameTrackItem[] = [];
  private cachedAllJobObjects: QCObjectInstance[] = []; // Bộ nhớ đệm toàn bộ đối tượng trong Job (nếu đã nạp từ QC Studio)

  // Trạng thái Dropdown Select & Tìm kiếm
  private isDropdownOpen: boolean = false;
  private searchKeyword: string = "";
  private autoSelectListenerAttached: boolean = false;
  private autoCenterOnFrame: boolean = localStorage.getItem("CVAT_3D_SUITE_AUTO_CENTER_FRAME") !== "false";

  // Cấu hình Chế độ màu mây điểm LiDAR & Nhuộm màu xe bọc
  private pointColorMode: "intensity" | "plain" =
    (localStorage.getItem("cvat_3d_point_color_mode") as any) || "intensity";
  private colorizeBoxedPoints: boolean =
    localStorage.getItem("cvat_3d_colorize_boxed") !== "false";
  private canvasTheme: "light" | "dark" =
    localStorage.getItem("cvat_3d_canvas_theme") === "dark" ? "dark" : "light";

  // Kích thước hạt điểm mây LiDAR trên 3 khung nhìn trực giao 2D (Top / Side / Front)
  private orthoPointSize: number =
    typeof localStorage !== "undefined" && localStorage.getItem("cvat_3d_ortho_point_size")
      ? parseFloat(localStorage.getItem("cvat_3d_ortho_point_size")!) || 3.5
      : 3.5;

  // Cấu hình Lọc mặt đất trực giao (Top View)
  public orthoSlicing: OrthoSlicingConfig = (() => {
    const def: OrthoSlicingConfig = { hideGround: true };
    try {
      const saved = typeof localStorage !== "undefined" ? localStorage.getItem("cvat_3d_ortho_slicing") : null;
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.hideGround === "boolean") def.hideGround = parsed.hideGround;
      }
    } catch (_) {}
    return def;
  })();

  // Trạng thái tiếp xúc 4 mép đón tia (Edge Contact HUD) cho Active Box
  private edgeContacts: BoxEdgeContactsResult | null = null;

  // Thống kê vòng đời của Track ID đang chọn
  private trackStats: TrackStatsInfo | null = null;
  private trackStatsLoading: boolean = false;
  private loadTrackStatsDebounceTimer: any = null;

  // Trạng thái xử lý
  public isProcessing: boolean = false;
  public isHelpModalOpen: boolean = false;
  private helpModalContainer: HTMLElement | null = null;

  // Trạng thái gắn vào sidebar CVAT (Docked mode)
  public isDocked: boolean = false;
  private cvatOrigChildrenEl: HTMLElement | null = null;
  private isShowingCVATOrigSidebar: boolean = false;

  // Tọa độ kéo thả
  private isDragging: boolean = false;
  private startX: number = 0;
  private startY: number = 0;

  // Khung nhìn đang active (Top, Side, Front, hoặc Perspective 3D) để điều khiển WASD
  public currentActiveView: "top" | "side" | "front" | "perspective" = "top";

  public currentCtx: CVATContext | null = null;
  private pollInterval: any = null;
  private updatePending: boolean = false;
  private lastRenderedHash: string = "";

  /**
   * Cập nhật khung nhìn đang focus (được gọi từ trình theo dõi chuột trên Canvas)
   * Tối ưu O(1) DOM Direct Swap vào badge, triệt tiêu hoàn toàn re-render HTML panel khi rê chuột.
   */
  public setActiveView(view: "top" | "side" | "front" | "perspective"): void {
    if (this.currentActiveView !== view) {
      this.currentActiveView = view;
      if (this.container) {
        const badge = this.container.querySelector<HTMLElement>("#floating-badge-view");
        if (badge) {
          let viewText = "VIEW: TOP";
          let viewBg = "#f0fdfa";
          let viewBorder = "#99f6e4";
          let viewColor = "#0f766e";
          if (view === "side") {
            viewText = "VIEW: SIDE";
            viewBg = "#eff6ff";
            viewBorder = "#bfdbfe";
            viewColor = "#1d4ed8";
          } else if (view === "front") {
            viewText = "VIEW: FRONT";
            viewBg = "#fdf4ff";
            viewBorder = "#f5d0fe";
            viewColor = "#a21caf";
          } else if (view === "perspective") {
            viewText = "VIEW: 3D";
            viewBg = "#fefce8";
            viewBorder = "#fef08a";
            viewColor = "#854d0e";
          }
          badge.textContent = viewText;
          badge.style.background = viewBg;
          badge.style.borderColor = viewBorder;
          badge.style.color = viewColor;
        }
      }
    }
  }

  /**
   * Cập nhật DOM trực tiếp cho cụm badge mép đón tia mà không re-render toàn bộ FloatingPanel
   */
  private updateEdgeContactBadgesDOM(): void {
    if (!this.container) return;
    const container = this.container.querySelector<HTMLElement>("#edge-contacts-badges-container");
    if (!container) return;
    container.innerHTML = renderEdgeContactsHUD(this.edgeContacts);
  }

  /**
   * Render HTML cho từng badge trạng thái mép đón tia (Khít / Cắt lẹm / Hở)
   */
  private renderEdgeContactBadge(title: string, side?: EdgeContactSide): string {
    return renderEdgeContactBadge(title, side);
  }

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

      // Khởi tạo Camera 2D Overlay HUD & Focus Modal
      const camOverlay = CameraOverlayManager.getInstance();
      camOverlay.mount();
      camOverlay.onCameraFocusRequested = (camId) => {
        const box = this.getCurrentBox3D();
        const imgSrc = CameraOverlayManager.getInstance().getCameraImageSrc(camId);
        CameraFocusModal.getInstance().open(camId, box, imgSrc || undefined);
      };

      // Auto-load VinFast calibration từ CVAT hoặc hardcoded
      this.loadVinCalibration();

      // Đồng bộ cấu hình Ghim Tâm khi tua frame sang Main World
      CVATBridge.setAutoCenterOnFrameChange(this.autoCenterOnFrame);

      // Tự động cấu hình chế độ màu mây điểm LiDAR (Intensity mặc định & Tô màu xe bọc)
      CVATBridge.setPointCloudColorMode(this.pointColorMode, this.colorizeBoxedPoints);

      // Tự động khởi tạo theme Canvas 3D (Light: Nền Trắng / Điểm Đen ⇄ Dark: Nền Tối / Điểm Sáng)
      CVATBridge.setCanvasTheme(this.canvasTheme);
    }

    this.scheduleUpdate();

    // Tự động kiểm tra cấu hình bật/tắt Suite từ Header / localStorage (Auto-boot)
    if (!HeaderSuiteButton.isSuiteEnabled()) {
      this.setSuiteVisible(false);
    }
  }


  /**
   * Bật hoặc Tắt hiển thị Suite Panel và Camera Overlay (Được kích hoạt từ nút Header hoặc API)
   */
  public setSuiteVisible(visible: boolean): void {
    if (!visible) {
      if (this.container) {
        this.container.style.display = "none";
      }
      try {
        CameraOverlayManager.getInstance().hide();
      } catch (_) {}
    } else {
      if (this.container) {
        this.container.style.display = "flex";
      }
      try {
        CameraOverlayManager.getInstance().show();
      } catch (_) {}
      this.scheduleUpdate();
    }
  }

  /**
   * Trích xuất đối tượng Box3D hiện thời của đối tượng đang chọn
   */
  /**
   * Trích xuất đối tượng Box3D hiện thời của đối tượng đang chọn.
   * Ưu tiên dùng rawPoints gốc (chính xác nhất) để chiếu 2D chuẩn.
   */
  public getCurrentBox3D(): Box3D | null {
    if (this.selectedUiId === null || this.currentL <= 0) return null;

    // Ưu tiên dùng rawPoints gốc từ CVAT (full precision, không bị round)
    // Format CVAT cuboid: [x, y, z, rx, ry, rz, L, W, H, ...]
    if (this.currentRawPoints && this.currentRawPoints.length >= 9) {
      return {
        c: [this.currentRawPoints[0], this.currentRawPoints[1], this.currentRawPoints[2]],
        s: [this.currentRawPoints[6], this.currentRawPoints[7], this.currentRawPoints[8]],
        r: [this.currentRawPoints[3], this.currentRawPoints[4], this.currentRawPoints[5]],
      };
    }

    // Fallback: dùng giá trị đã round từ UI (kém chính xác hơn)
    const rx = 0;
    const ry = 0;
    const rz = (this.currentYawDeg * Math.PI) / 180;
    return {
      c: [this.currentX, this.currentY, this.currentZ],
      s: [this.currentL, this.currentW, this.currentH],
      r: [rx, ry, rz],
    };
  }

  /**
   * Tự động tải calibration VinFast từ CVAT Day14 overlay hoặc hardcoded fallback.
   * Chỉ truyền raw VinCalib cho Day14 engine, KHÔNG thay thế grid 8 camera mặc định.
   */
  private async loadVinCalibration(): Promise<void> {
    try {
      const vinCalib = await CVATBridge.fetchVinCalibration();
      if (!vinCalib || !vinCalib.cameras) return;

      // ★ CRITICAL: Truyền raw VinCalib cho Day14 projection engine trong CameraOverlay
      // Day14 engine cần trực tiếp sensor2ego + ego2cam + dist + K (không qua CameraConfig convert)
      setVinCalibForOverlay(vinCalib);

      const camNames = Object.keys(vinCalib.cameras);
      console.log(`[VinCalib] Đã load VinFast calibration: ${camNames.length} cameras [${camNames.join(", ")}] (Day14 engine active)`);
    } catch (e) {
      console.warn("[VinCalib] Lỗi load calibration:", e);
    }
  }

  private createContainer(): void {
    this.container = document.createElement("div");
    this.container.id = "cvat-3d-suite-floating";
    this.container.setAttribute("translate", "no");
    this.container.classList.add("notranslate");
    this.container.style.position = "fixed";
    this.container.style.top = "70px";
    this.container.style.right = "24px";
    this.container.style.width = "360px";
    this.container.style.maxHeight = "calc(100vh - 90px)";
    this.container.style.zIndex = "999995";
    this.container.style.fontFamily = "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

    // shadcn/ui Clean Card style (Giao diện trắng tinh tế chuẩn GEMINI.md)
    this.container.style.backgroundColor = "rgba(255, 255, 255, 0.98)";
    this.container.style.backdropFilter = "blur(16px)";
    this.container.style.border = "1px solid #e2e8f0";
    this.container.style.borderRadius = "12px";
    this.container.style.boxShadow = "0 10px 30px -5px rgba(0, 0, 0, 0.1), 0 0 1px 1px rgba(0, 0, 0, 0.05)";
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

    this.miniPill.innerHTML = renderMiniPillHtml();

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

    this.toastOverlay.innerHTML = renderToastHtml(msg, type);

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
        // Khi thu nhỏ: nếu đang gắn ở sidebar, hiện lại nội dung gốc CVAT để người dùng thao tác
        if (this.isDocked && this.cvatOrigChildrenEl) {
          this.cvatOrigChildrenEl.style.visibility = "visible";
          this.cvatOrigChildrenEl.style.pointerEvents = "auto";
        }
      } else {
        this.container.style.display = "flex";
        this.miniPill.style.display = "none";
        // Khi mở lại: ẩn nội dung gốc CVAT
        if (this.isDocked && this.cvatOrigChildrenEl && !this.isShowingCVATOrigSidebar) {
          this.cvatOrigChildrenEl.style.visibility = "hidden";
          this.cvatOrigChildrenEl.style.pointerEvents = "none";
        }
      }
    }
  }

  /**
   * Kéo thả cửa sổ nổi
   */
  private setupDraggable(): void {
    if (!this.container) return;

    const onMouseDown = (e: MouseEvent) => {
      // Khi đang gắn vào sidebar thì không cho kéo thả lệch vị trí
      if (this.isDocked) return;

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
      const trackId = e.detail?.trackId;
      const details = e.detail?.details;

      if (details && details.clientId) {
        console.log(`[CVAT 3D Suite] Nhận dữ liệu tức thì của xe #${details.clientId}:`, details);
        this.selectedUiId = details.clientId;
        this.selectedTrackId = trackId ?? details.trackId ?? this.selectedTrackId ?? details.clientId;
        this.selectedServerId = details.serverId || null;
        this.currentLabel = details.label || `Xe #${details.clientId}`;
        this.syncCategoryFromLabel(this.currentLabel);
        this.currentAttributes = details.attributes || {};
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
          trackId: this.selectedTrackId ?? details.trackId ?? details.clientId,
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

        if (!this.trackStats || this.trackStats.uiId !== details.clientId) {
          this.loadTrackStats(details.clientId);
        }

        // Tự động nạp kết quả kiểm tra QC ngay khi kích hoạt xe nếu đang ở Tab QC
        if (this.activeMainTab === "qc") {
          this.preloadTrackQCInBackground(details.clientId, details.serverId || this.selectedServerId);
        }

        // Phản hồi Toast nhanh khi kích hoạt thông qua cú Double-Click trên View 3D
        if (e.detail?.isDoubleClick) {
          this.showToast(`Đã kích hoạt & Ghim xe #${details.clientId} (${details.label || "Object"})`, "success");
        }

        this.scheduleUpdate();
      } else if (clientId && clientId !== this.selectedUiId) {
        console.log(`[CVAT 3D Suite] Tự động chọn xe #${clientId} từ click Canvas 3D`);
        this.selectTrackByUiId(clientId, undefined, false);
      }
    });

    // Lắng nghe sự kiện đối tượng bị hủy kích hoạt (click ra ngoài canvas hoặc bỏ chọn trên CVAT)
    window.addEventListener("CVAT_EXT_RES_OBJECT_DEACTIVATED", () => {
      if (this.selectedUiId !== null || this.selectedTrackId !== null) {
        console.log("[CVAT 3D Suite] Đối tượng bị hủy kích hoạt trên CVAT -> chuyển sang Inactive State");
        this.selectedUiId = null;
        this.selectedTrackId = null;
        this.selectedServerId = null;
        this.currentLabel = "Chưa chọn đối tượng";
        this.edgeContacts = null;
        this.scheduleUpdate();
      }
    });

    // Lắng nghe sự kiện Cảnh Báo Viền Chạm Point (Edge Contact HUD) cho Active Box
    window.addEventListener("CVAT_EXT_RES_EDGE_CONTACTS_UPDATED", (e: any) => {
      const contacts = e.detail;
      if (contacts && (this.selectedUiId === null || Number(contacts.clientId) === Number(this.selectedUiId))) {
        this.edgeContacts = contacts;
        this.updateEdgeContactBadgesDOM();
      }
    });

    // Lắng nghe tín hiệu khi danh sách track trong Redux thay đổi (vừa vẽ xong box mới)
    window.addEventListener("CVAT_EXT_RES_FRAME_TRACKS_DIRTY", () => {
      this.syncFrameTracks();
    });

    // Lắng nghe sự kiện chuyển frame tức thì từ Main World (Phím F/D, Timeline, Play, Frame nạp lần đầu)
    window.addEventListener("CVAT_EXT_RES_FRAME_CHANGED", (e: any) => {
      const { frame } = e.detail || {};
      if (typeof frame === "number" && (frame !== this.currentFrameNumber || this.frameTracks.length === 0)) {
        this.currentFrameNumber = frame;
        this.syncFrameTracks();
      }
    });

    // Lắng nghe sự kiện biến đổi Box thời gian thực (Kéo di chuyển, xoay hoặc co giãn trên Three.js Canvas)
    window.addEventListener("CVAT_EXT_RES_LIVE_TRANSFORM_CHANGED", (e: any) => {
      const clientId = e.detail?.clientId;
      const details = e.detail?.details;
      if (!details || !clientId) return;

      const numId = Number(clientId);
      if (this.selectedUiId === numId) {
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
        if (Array.isArray(details.points)) {
          this.currentRawPoints = [...details.points];
        }
      }

      // Cập nhật ngay mục đối ứng trong frameTracks
      const existingIdx = this.frameTracks.findIndex((t) => t.uiId === numId);
      if (existingIdx >= 0) {
        this.frameTracks[existingIdx] = {
          ...this.frameTracks[existingIdx],
          x: details.x,
          y: details.y,
          z: details.z,
          yawDeg: details.yawDeg,
          l: details.l,
          w: details.w,
          h: details.h,
        };
      }

      // Revalidate QC thời gian thực cho track vừa biến đổi (< 0.5ms)
      const pointsToUse = details.points || [
        details.x,
        details.y,
        details.z,
        0,
        0,
        (details.yawDeg * Math.PI) / 180,
        details.l,
        details.w,
        details.h,
      ];
      this.revalidateAndSyncIssue(numId, this.currentFrameNumber, pointsToUse, false);

      this.scheduleUpdate();
    });
  }

  /**
   * Đồng bộ xe và Frame thuần Event-Driven (Zero-Polling, 60 FPS mượt mà tuyệt đối)
   * Thay thế hoàn toàn cơ chế Polling setInterval(400ms) bằng các sự kiện Realtime:
   * - CVAT_EXT_RES_FRAME_CHANGED: Khi chuyển frame
   * - CVAT_EXT_RES_FRAME_TRACKS_DIRTY: Khi có track thêm/sửa/xóa
   * - CVAT_EXT_RES_OBJECT_ACTIVATED / DEACTIVATED: Khi chọn/hủy chọn xe (< 0.2ms)
   */
  private startPollingLoop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    // Nạp danh sách ban đầu một lần duy nhất khi khởi tạo panel sau khi CVAT sẵn sàng
    if (this.currentCtx?.jobId) {
      setTimeout(() => {
        if (this.frameTracks.length === 0) {
          this.syncFrameTracks();
        }
      }, 800);
    }
  }

  /**
   * Vi chỉnh nhanh Box 3D bằng tổ hợp phím Shift + WASD theo Screen Space trực quan (độc lập với góc xoay của xe)
   * - Phím Shift + A: Luôn luôn dịch sang TRÁI màn hình (Chỉ Frame Hiện Tại)
   * - Phím Shift + D: Luôn luôn dịch sang PHẢI màn hình (Chỉ Frame Hiện Tại)
   * - Phím Shift + W: Luôn luôn dịch LÊN TRÊN màn hình (Chỉ Frame Hiện Tại)
   * - Phím Shift + S: Luôn luôn dịch XUỐNG DƯỚI màn hình (Chỉ Frame Hiện Tại)
   * 🚨 QUY TẮC BẮT BUỘC: TUYỆT ĐỐI KHÔNG ÁP DỤNG TOÀN BỘ TRACK KHI DÙNG SHIFT+WASD (Chỉ tác động Frame này).
   * @param key Phím bấm ('w', 'a', 's', 'd')
   */
  public async handleNudgeByView(key: "w" | "a" | "s" | "d"): Promise<void> {
    return handleNudgeByView(this, key);
  }

  /**
   * Đảm bảo luôn có đối tượng được chọn trước khi thực hiện thao tác phím tắt hoặc nút bấm.
   * Nếu selectedUiId đang null, chỉ lấy khi trên Sidebar CVAT có đối tượng active thực sự.
   * TUYỆT ĐỐI KHÔNG TỰ Ý CHỌN XE ĐẦU TIÊN KHI NGƯỜI DÙNG CHƯA ACTIVE.
   */
  public async ensureActiveTrackSelected(): Promise<number | null> {
    if (this.selectedUiId !== null) return this.selectedUiId;

    // 1. Thử lấy từ Sidebar active item nếu người dùng đang click trên CVAT
    const active = CVATBridge.getActiveTrackId();
    if (active.id !== null) {
      const isTrackInCurrentFrame = this.frameTracks.some((t) => t.uiId === active.id);
      if (isTrackInCurrentFrame) {
        console.log(`[CVAT 3D Suite] Chọn đối tượng active #${active.id} từ Sidebar`);
        await this.selectTrackByUiId(active.id, undefined, false);
        return this.selectedUiId;
      }
    }

    return null;
  }

  /**
   * Đồng bộ danh sách xe có mặt tại Frame hiện tại.
   * Duy trì Track ID đang active nếu track đó còn tồn tại ở frame mới;
   * Nếu track kết thúc hoặc outside, chuyển về Inactive State (TUYỆT ĐỐI KHÔNG NHẢY SANG XE KHÁC).
   */
  public async syncFrameTracks(): Promise<void> {
    if (!this.currentCtx || !this.currentCtx.jobId) return;

    this.currentFrameNumber = CVATBridge.getCurrentFrame();
    const tracks = await CVATBridge.getTracksInCurrentFrame(this.currentCtx.jobId, this.currentFrameNumber);
    this.frameTracks = tracks;

    // Fetch ảnh Context Images từ CVAT API có Debounce 250ms (hoãn tải khi tua frame liên tục)
    if (
      this.currentFrameNumber !== this.lastContextImageFrame &&
      CameraOverlayManager.getInstance().isVisible()
    ) {
      if (this.contextImagesDebounceTimer) {
        clearTimeout(this.contextImagesDebounceTimer);
        this.contextImagesDebounceTimer = null;
      }
      const targetFrame = this.currentFrameNumber;
      const targetJobId = this.currentCtx.jobId;
      this.contextImagesDebounceTimer = setTimeout(() => {
        this.contextImagesDebounceTimer = null;
        if (this.currentFrameNumber !== targetFrame) return;
        this.lastContextImageFrame = targetFrame;
        CVATBridge.fetchContextImages(targetJobId, targetFrame)
          .then((images) => {
            if (this.currentFrameNumber === targetFrame && images.size > 0) {
              images.forEach((blobUrl, camIdx) => {
                CameraOverlayManager.getInstance().updateCameraImage(camIdx, blobUrl);
              });
            }
          })
          .catch(() => {});
      }, 250);
    }

    // 1. Dò tìm đối tượng đang active trong frame mới:
    // ƯU TIÊN 1: Tìm theo Track ID bền vững toàn cục (selectedTrackId) để CHỐNG NHẢY ID
    let matchingTrack: FrameTrackItem | undefined;
    if (this.selectedTrackId !== null) {
      matchingTrack = tracks.find((t) => t.trackId === this.selectedTrackId);
    }
    // ƯU TIÊN 2: Fallback tìm theo serverId lưu trên server (nếu đã lưu DB)
    if (!matchingTrack && this.selectedServerId) {
      matchingTrack = tracks.find((t) => t.serverId === this.selectedServerId);
    }
    // 🚨 TUYỆT ĐỐI KHÔNG FALLBACK THEO t.uiId === this.selectedUiId
    // vì uiId ở frame mới là ID của instance khác, hoàn toàn không liên quan đến frame cũ!

    if (matchingTrack) {
      // Đối tượng VẪN CÒN MẶT tại frame mới: duy trì và cập nhật thông số mới nhất
      this.selectedUiId = matchingTrack.uiId;
      this.selectedTrackId = matchingTrack.trackId ?? this.selectedTrackId;
      this.selectedServerId = matchingTrack.serverId;
      this.currentLabel = matchingTrack.label;
      this.syncCategoryFromLabel(this.currentLabel);
      this.currentX = matchingTrack.x;
      this.currentY = matchingTrack.y;
      this.currentZ = matchingTrack.z;
      this.currentYawDeg = matchingTrack.yawDeg;
      this.currentL = matchingTrack.l;
      this.currentW = matchingTrack.w;
      this.currentH = matchingTrack.h;
      this.editL = matchingTrack.l;
      this.editW = matchingTrack.w;
      this.editH = matchingTrack.h;

      // KÍCH HOẠT LẠI TRÊN THREE.JS CANVAS 3D BẰNG INSTANCE CLIENT ID MỚI CỦA FRAME ĐÓ
      CVATBridge.activateCanvasTrack(matchingTrack.uiId, { x: matchingTrack.x, y: matchingTrack.y, z: matchingTrack.z });
      CVATBridge.setActiveTrackIdInMainWorld(this.selectedTrackId);

      if (this.selectedUiId && (!this.trackStats || this.trackStats.uiId !== this.selectedUiId)) {
        this.loadTrackStats(this.selectedUiId);
      }
      this.scheduleUpdate();
    } else {
      // Đối tượng KHÔNG CÓ MẶT ở frame này (outside hoặc track kết thúc):
      // Chuyển sang Inactive State, KHÔNG TỰ ĐỘNG CHỌN BOX KHÁC (chống nhảy ID bừa bãi)
      // 🚨 NẾU tracks đang rỗng (đang nạp frame mới), KHÔNG VỘI XÓA selectedTrackId để chờ states nạp xong!
      if (tracks.length === 0) {
        return;
      }
      if (this.selectedUiId !== null || this.selectedTrackId !== null) {
        this.selectedUiId = null;
        this.selectedTrackId = null;
        this.selectedServerId = null;
        this.currentLabel = "Chưa chọn đối tượng";
        this.scheduleUpdate();
      }
    }
  }

  private syncCategoryFromLabel(label: string): void {
    this.selectedCategory = detectObjectCategory(label);
  }

  /**
   * Chọn xe theo UI ID (#1, #2...) và kích hoạt highlight trên Canvas
   * @param activateCanvas Chỉ bật khi người dùng chủ động click hoặc dùng hotkey, không bật khi sync ngầm lúc F5!
   */
  public async selectTrackByUiId(uiId: number, details?: any, activateCanvas: boolean = true): Promise<void> {
    this.selectedUiId = uiId;
    let trackIdToSet = uiId;
    if (details?.trackId !== undefined) {
      trackIdToSet = details.trackId;
    } else {
      const foundInFrame = this.frameTracks.find((t) => t.uiId === uiId);
      if (foundInFrame?.trackId !== undefined) {
        trackIdToSet = foundInFrame.trackId;
      }
    }
    this.selectedTrackId = trackIdToSet;
    CVATBridge.setActiveTrackIdInMainWorld(trackIdToSet);

    if (!this.trackStats || this.trackStats.uiId !== uiId) {
      this.loadTrackStats(uiId);
    }

    // Chỉ kích hoạt nạp kiểm tra QC khi người dùng đang ở Tab Kiểm Tra QC (tiết kiệm 100% CPU khi đang ở Tab Edit)
    if (this.activeMainTab === "qc") {
      this.preloadTrackQCInBackground(uiId, details?.serverId || this.selectedServerId);
    }

    let targetPos: { x: number; y: number; z: number } | undefined;
    if (details) {
      targetPos = { x: details.x, y: details.y, z: details.z };
    } else {
      const foundInFrame = this.frameTracks.find((t) => t.uiId === uiId);
      if (foundInFrame) {
        targetPos = { x: foundInFrame.x, y: foundInFrame.y, z: foundInFrame.z };
      }
    }

    // Chỉ kích hoạt Three.js Canvas nếu người dùng chủ động tương tác
    if (activateCanvas) {
      CVATBridge.activateCanvasTrack(uiId, targetPos);
      CVATBridge.centerCanvas3DOnTrack(uiId, targetPos);
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
      if (activateCanvas && targetPos) {
        CVATBridge.centerCanvas3DOnTrack(uiId, targetPos);
      }
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
      if (activateCanvas) {
        CVATBridge.centerCanvas3DOnTrack(uiId, { x: foundInFrame.x, y: foundInFrame.y, z: foundInFrame.z });
      }
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
   * Căn giữa tức thì View 3D vào xe đang chọn
   */
  public handleCenterCurrentTrack(): void {
    if (this.selectedUiId !== null) {
      CVATBridge.centerCanvas3DOnTrack(this.selectedUiId);
      this.showToast(`Đã căn giữa xe #${this.selectedUiId}`, "info");
    } else {
      this.showToast("Chưa chọn đối tượng để căn giữa!", "warning");
    }
  }

  /**
   * Trích xuất mây điểm và shapes của đối tượng hiện tại để phục vụ Undo/Redo
   */
  private async captureCurrentSnapshotData(forTrack: boolean): Promise<{
    boxPoints: number[];
    trackShapes?: Array<{ frame: number; outside?: boolean; points: number[] }>;
  }> {
    let boxPoints: number[];
    if (Array.isArray(this.currentRawPoints) && this.currentRawPoints.length >= 16) {
      boxPoints = [...this.currentRawPoints];
      boxPoints[0] = this.currentX;
      boxPoints[1] = this.currentY;
      boxPoints[2] = this.currentZ;
      boxPoints[3] = 0;
      boxPoints[4] = 0;
      boxPoints[5] = (this.currentYawDeg * Math.PI) / 180;
      boxPoints[6] = this.currentL;
      boxPoints[7] = this.currentW;
      boxPoints[8] = this.currentH;
    } else {
      boxPoints = [
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
      while (boxPoints.length < 16) {
        boxPoints.push(0);
      }
    }

    let trackShapes: Array<{ frame: number; outside?: boolean; points: number[] }> | undefined = undefined;
    if (forTrack && this.currentCtx?.jobId && this.selectedUiId !== null) {
      try {
        const serverId = this.selectedServerId || this.selectedUiId;
        const allFrames = await CVATBridge.getTrackAllFrames(this.currentCtx.jobId, this.selectedUiId, serverId);
        if (allFrames && allFrames.length > 0) {
          trackShapes = allFrames.map((f) => ({
            frame: f.frame,
            outside: f.outside,
            points: [...f.points],
          }));
        }
      } catch (_) {}
    }

    return { boxPoints, trackShapes };
  }

  /**
   * Cập nhật trạng thái enabled/disabled và tooltip của 2 nút Undo và Redo trên giao diện
   */
  private updateUndoRedoButtonsState(): void {
    this.historyManager.updateButtonsState(this.container);
  }

  /**
   * Lưu snapshot trạng thái trước khi thực hiện thao tác để người dùng có thể bấm Hoàn Tác (Undo / Pre).
   */
  public async pushUndoSnapshot(actionName: string, forTrack: boolean = false): Promise<void> {
    if (!this.currentCtx || !this.currentCtx.jobId || this.selectedUiId === null) return;

    try {
      const data = await this.captureCurrentSnapshotData(forTrack || this.applyToTrack);

      this.historyManager.pushSnapshot({
        uiId: this.selectedUiId,
        serverId: this.selectedServerId,
        frame: this.currentFrameNumber,
        applyToTrack: forTrack || this.applyToTrack,
        boxPoints: data.boxPoints,
        trackShapesBackup: data.trackShapes,
        actionName,
      });

      this.updateUndoRedoButtonsState();
    } catch (err) {
      console.warn("[CVAT 3D Suite] Lỗi lưu Undo Snapshot:", err);
    }
  }

  /**
   * Hoàn tác (Undo / Pre) thao tác vừa thực hiện
   */
  public async handleUndo(): Promise<void> {
    if (!this.historyManager.canUndo()) {
      this.showToast("Không có thao tác nào để hoàn tác (Undo)!", "info");
      return;
    }
    if (this.isProcessing) return;
    this.isProcessing = true;

    const snapshot = this.historyManager.popUndo()!;
    this.showToast(`Đang hoàn tác: ${snapshot.actionName}...`, "info");

    try {
      // 1. Chụp lại trạng thái hiện tại (ngay trước lúc hoàn tác) để phục vụ Redo
      const curData = await this.captureCurrentSnapshotData(snapshot.applyToTrack);
      snapshot.afterBoxPoints = curData.boxPoints;
      snapshot.afterTrackShapes = curData.trackShapes;

      // 2. Khôi phục trạng thái cũ (before)
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
        // Đẩy snapshot vào ngăn xếp Redo
        this.historyManager.pushRedo(snapshot);

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
        this.historyManager.pushUndo(snapshot);
        this.showToast(res.message || "Không thể hoàn tác!", "error");
      }
    } catch (err: any) {
      this.historyManager.pushUndo(snapshot);
      this.showToast(`Lỗi hoàn tác: ${err.message || err}`, "error");
    } finally {
      this.isProcessing = false;
      this.updateUndoRedoButtonsState();
      this.updateContent();
    }
  }

  /**
   * Làm lại (Redo) thao tác vừa hoàn tác
   */
  public async handleRedo(): Promise<void> {
    if (!this.historyManager.canRedo()) {
      this.showToast("Không có thao tác nào để làm lại (Redo)!", "info");
      return;
    }
    if (this.isProcessing) return;
    this.isProcessing = true;

    const snapshot = this.historyManager.popRedo()!;
    this.showToast(`Đang làm lại: ${snapshot.actionName}...`, "info");

    try {
      const targetPoints = snapshot.afterBoxPoints || snapshot.boxPoints;
      const targetShapes = snapshot.afterTrackShapes || snapshot.trackShapesBackup;

      const res = await CVATBridge.restoreTrackSnapshot(
        this.currentCtx!.jobId!,
        snapshot.uiId,
        snapshot.serverId,
        {
          frame: snapshot.frame,
          applyToTrack: snapshot.applyToTrack,
          boxPoints: targetPoints,
          trackShapesBackup: targetShapes,
        }
      );

      if (res.success) {
        // Đẩy snapshot trở lại undoStack
        this.historyManager.pushUndo(snapshot);

        // Đồng bộ các thông số hiển thị trên Panel về trạng thái vừa làm lại
        if (Array.isArray(targetPoints) && targetPoints.length >= 9) {
          this.currentX = targetPoints[0];
          this.currentY = targetPoints[1];
          this.currentZ = targetPoints[2];
          this.currentYawDeg = Math.round((targetPoints[5] * 180) / Math.PI);
          this.currentL = targetPoints[6];
          this.currentW = targetPoints[7];
          this.currentH = targetPoints[8];
          this.editL = this.currentL;
          this.editW = this.currentW;
          this.editH = this.currentH;
          this.currentRawPoints = [...targetPoints];
        }
        this.showToast(`Đã làm lại: ${snapshot.actionName}`, "success");
        await this.syncFrameTracks();
      } else {
        this.historyManager.pushRedo(snapshot);
        this.showToast(res.message || "Không thể làm lại!", "error");
      }
    } catch (err: any) {
      this.historyManager.pushRedo(snapshot);
      this.showToast(`Lỗi làm lại: ${err.message || err}`, "error");
    } finally {
      this.isProcessing = false;
      this.updateUndoRedoButtonsState();
      this.updateContent();
    }
  }

  /**
   * Đánh dấu Outside (ẩn) cho toàn bộ các frame của Track đang chọn
   */
  public async handleSetTrackOutside(outside: boolean = true): Promise<void> {
    return handleSetTrackOutside(this, outside);
  }

  /**
   * Tải ngầm thống kê toàn bộ vòng đời của Track ID (Total frames, Active, Outside, Dải frame)
   * Debounce 300ms để chống nghẽn khi người dùng chuyển liên tục qua nhiều xe
   */
  public async loadTrackStats(uiId: number | null, immediate: boolean = false): Promise<void> {
    if (this.loadTrackStatsDebounceTimer) {
      clearTimeout(this.loadTrackStatsDebounceTimer);
      this.loadTrackStatsDebounceTimer = null;
    }

    if (uiId === null || !this.currentCtx?.jobId) {
      this.trackStats = null;
      this.updateContent();
      return;
    }

    if (immediate) {
      await this.executeLoadTrackStats(uiId);
    } else {
      this.loadTrackStatsDebounceTimer = setTimeout(async () => {
        this.loadTrackStatsDebounceTimer = null;
        await this.executeLoadTrackStats(uiId);
      }, 300);
    }
  }

  private async executeLoadTrackStats(uiId: number): Promise<void> {
    if (!this.currentCtx?.jobId) return;
    try {
      this.trackStatsLoading = true;
      const serverId = this.selectedServerId || uiId;
      const allFrames = await CVATBridge.getTrackAllFrames(this.currentCtx.jobId, uiId, serverId);

      // Nếu người dùng đã chuyển sang xe khác trong lúc đang truy vấn
      if (this.selectedUiId !== uiId) return;

      if (Array.isArray(allFrames) && allFrames.length > 0) {
        const sortedFrames = [...allFrames].sort((a, b) => a.frame - b.frame);
        const startFrame = sortedFrames[0].frame;
        const endFrame = sortedFrames[sortedFrames.length - 1].frame;

        let activeCount = 0;
        let outsideCount = 0;

        if (sortedFrames.length === 1) {
          if (sortedFrames[0].outside) {
            outsideCount = 1;
          } else {
            activeCount = 1;
          }
        } else {
          for (let i = 0; i < sortedFrames.length - 1; i++) {
            const span = sortedFrames[i + 1].frame - sortedFrames[i].frame;
            if (sortedFrames[i].outside) {
              outsideCount += span;
            } else {
              activeCount += span;
            }
          }
          if (sortedFrames[sortedFrames.length - 1].outside) {
            outsideCount += 1;
          } else {
            activeCount += 1;
          }
        }

        const totalFrames = activeCount + outsideCount;
        const isFullyOutside = outsideCount === totalFrames;
        const isFullyActive = outsideCount === 0;

        this.trackStats = {
          uiId,
          totalFrames,
          startFrame,
          endFrame,
          activeCount,
          outsideCount,
          isFullyOutside,
          isFullyActive,
          label: sortedFrames[0]?.label || this.currentLabel,
        };
      } else {
        this.trackStats = null;
      }
    } catch (err) {
      console.warn("[CVAT 3D Suite] Lỗi loadTrackStats:", err);
      this.trackStats = null;
    } finally {
      this.trackStatsLoading = false;
      this.updateContent();
    }
  }

  /**
   * Hiển thị dải Sub-Header thống kê Track ID ngay tại cụm tiêu đề Floating Panel
   */
  private renderTrackStatsSubHeader(): string {
    return renderTrackStatsSubHeader(
      this.selectedUiId,
      this.trackStats,
      this.trackStatsLoading,
      this.currentLabel,
      this.currentFrameNumber
    );
  }

  public saveAndSyncOrthoSlicing(): void {
    try {
      localStorage.setItem("cvat_3d_ortho_slicing", JSON.stringify(this.orthoSlicing));
    } catch (_) {}
    CVATBridge.setOrthoSlicing(this.orthoSlicing);
  }

  public async handleFlipYaw(currentFrameOnly: boolean): Promise<void> {
    return handleFlipYaw(this, currentFrameOnly);
  }

  public async handleUpdateDimensions(newL?: number, newW?: number, newH?: number, applyToTrack?: boolean): Promise<void> {
    return handleUpdateDimensions(this, newL, newW, newH, applyToTrack);
  }

  public handleStepDimension(axis: "l" | "w" | "h", delta: number): void {
    return handleStepDimension(this, axis, delta);
  }

  public async rotateYawByDelta(deg: number): Promise<void> {
    return rotateYawByDelta(this, deg);
  }

  public async rotatePitchByDelta(deg: number): Promise<void> {
    return rotatePitchByDelta(this, deg);
  }

  public toggleScope(): void {
    return toggleScope(this);
  }

  public async handleSmartFitAll(): Promise<void> {
    return handleSmartFitAll(this);
  }

  public async handleFitCurrentBox(): Promise<void> {
    return handleFitCurrentBox(this);
  }

  public async handleApplyPreset(preset: VehicleCatalogItem): Promise<void> {
    return handleApplyPreset(this, preset);
  }

  public async handleShiftCenter(deltaXLocal: number, deltaYLocal: number): Promise<void> {
    return handleShiftCenter(this, deltaXLocal, deltaYLocal);
  }

  public async handleSnapGround(options?: {
    applyToTrack?: boolean;
    mode?: "best" | "road" | "curb";
    targetGroundZ?: number;
    deltaZ?: number;
    pitchDeg?: number;
    rollDeg?: number;
  }): Promise<void> {
    return handleSnapGround(this, options);
  }

  public async handleSnapGroundTrack(): Promise<void> {
    return handleSnapGroundTrack(this);
  }

  public toggleHideGround(): void {
    return toggleHideGround(this);
  }

  public toggleOrthoSlicing(): void {
    return toggleOrthoSlicing(this);
  }

  public stepOrthoSlab(delta: number): void {
    return stepOrthoSlab(this, delta);
  }

  public toggleIsolateROI(): void {
    return toggleIsolateROI(this);
  }

  public async handleSnapYawToLane(): Promise<void> {
    return handleSnapYawToLane(this);
  }

  public async handleEgoRayFit(step: "all" | "top" | "side" | "front" = "all"): Promise<void> {
    return handleEgoRayFit(this, step);
  }

  public async handleFitTop(): Promise<void> {
    return handleFitTop(this);
  }

  public async handleFitSide(): Promise<void> {
    return handleFitSide(this);
  }

  public async handleFitFront(): Promise<void> {
    return handleFitFront(this);
  }

  public async handleFitWidth(): Promise<void> {
    return handleFitWidth(this);
  }

  public async handleFitHeight(): Promise<void> {
    return handleFitHeight(this);
  }

  public handleFitCarDimension(dimension: "w" | "h"): void {
    return handleFitCarDimension(this, dimension);
  }

  public async handleFitPedestrian(
    step: "all" | "top" | "side" | "front" | "l" | "w" | "h" = "all",
    overrideCategory?: "car" | "pedestrian" | "cyclist"
  ): Promise<void> {
    return handleFitPedestrian(this, step as any, overrideCategory);
  }

  public async handleFitCyclist(
    step: "all" | "top" | "side" | "front" | "w" | "h" = "all",
    overrideCategory?: "car" | "pedestrian" | "cyclist"
  ): Promise<void> {
    return handleFitCyclist(this, step as any, overrideCategory);
  }

  public async handleAlignBoxToPoints(): Promise<void> {
    return handleAlignBoxToPoints(this);
  }

  public async handleTightFit(): Promise<void> {
    return this.handleAlignBoxToPoints();
  }

  public async handleCatalogFit(): Promise<void> {
    return handleCatalogFit(this);
  }

  public async handleAutoFit(tightFit: boolean = true): Promise<void> {
    return this.handleSmartFitAll();
  }
  /**
   * Render nội dung Tab QC: Quản lý danh sách lỗi của riêng Track ID đang chọn qua từng Frame lỗi
   */
  private renderQCTabContent(): string {
    return renderQCTabContent({
      selectedUiId: this.selectedUiId,
      cachedResult: this.selectedUiId !== null ? this.trackQCRamCache.get(this.selectedUiId) : undefined,
      currentLabel: this.currentLabel,
      currentFrameNumber: this.currentFrameNumber,
    });
  }

  /**
   * Tua trực tiếp đến một lỗi cụ thể và focus camera 3D vào đối tượng (Tab QC)
   */
  public jumpToSpecificIssue(frame: number, trackId: number, issueTitle?: string): void {
    const isSameFrame = this.currentFrameNumber === frame;

    // 1. Nhảy Timeline chỉ khi khác frame
    if (!isSameFrame) {
      CVATBridge.jumpToFrame(frame);
    }

    // Lấy trước thông số tọa độ đã lưu trong RAM cache của đối tượng tại frame đó nếu có
    const cached = this.trackQCRamCache.get(trackId);
    const targetObj = cached?.trackObjects?.find((o) => o.frame === frame);
    const targetPos = targetObj ? { x: targetObj.x, y: targetObj.y, z: targetObj.z } : undefined;

    // 2. Kích hoạt và pan camera: nếu cùng frame thì chạy ngay lập tức (0ms), nếu khác frame thì chờ 100ms
    const delay = isSameFrame ? 0 : 100;
    setTimeout(() => {
      CVATBridge.activateObject(trackId, targetPos);
      CVATBridge.centerCanvas3DOnTrack(trackId, targetPos);
      this.selectedUiId = trackId;
      if (targetObj) {
        if (targetObj.label) {
          this.currentLabel = targetObj.label;
          this.syncCategoryFromLabel(this.currentLabel);
        } else if (cached?.label) {
          this.currentLabel = cached.label;
          this.syncCategoryFromLabel(this.currentLabel);
        }
        this.currentX = targetObj.x;
        this.currentY = targetObj.y;
        this.currentZ = targetObj.z;
        this.currentYawDeg = targetObj.yawDeg;
        this.currentL = targetObj.l;
        this.currentW = targetObj.w;
        this.currentH = targetObj.h;
        this.editL = targetObj.l;
        this.editW = targetObj.w;
        this.editH = targetObj.h;
      }
      this.scheduleUpdate();
    }, delay);

    this.scheduleUpdate();
    this.showToast(
      `Đã chuyển đến Track #${trackId} @ Frame ${frame}${issueTitle ? `: ${issueTitle}` : ""}`,
      "info"
    );
  }

  /**
   * Cập nhật danh sách toàn bộ đối tượng của Job (ví dụ khi QC Studio quét xong toàn Job)
   */
  public setCachedAllJobObjects(objects: QCObjectInstance[]): void {
    this.cachedAllJobObjects = Array.isArray(objects) ? objects : [];
  }

  /**
   * Tự động nạp ngầm kiểm tra QC toàn bộ các frame của riêng một Track ID vào bộ nhớ RAM
   * Chạy bất đồng bộ ngầm, không khóa Main Thread, lưu kết quả vào trackQCRamCache
   */
  public async preloadTrackQCInBackground(
    uiId: number,
    serverId?: number | null,
    forceRefresh: boolean = false
  ): Promise<TrackQCResult> {
    const existing = this.trackQCRamCache.get(uiId);
    if (!forceRefresh && existing && (existing.status === "ready" || existing.status === "loading")) {
      return existing;
    }

    const currentJobId = this.currentCtx?.jobId;
    if (!currentJobId) {
      const idleResult: TrackQCResult = {
        trackId: uiId,
        serverId: serverId ?? null,
        label: this.currentLabel || `Track #${uiId}`,
        status: "idle",
        totalFrames: 0,
        errorFrames: [],
        cleanFramesCount: 0,
        lastScannedAt: Date.now(),
      };
      return idleResult;
    }

    const loadingResult: TrackQCResult = {
      trackId: uiId,
      serverId: serverId ?? null,
      label: this.currentLabel || `Track #${uiId}`,
      status: "loading",
      totalFrames: 0,
      errorFrames: [],
      cleanFramesCount: 0,
      lastScannedAt: Date.now(),
    };
    this.trackQCRamCache.set(uiId, loadingResult);

    if (this.activeMainTab === "qc" && this.selectedUiId === uiId) {
      this.scheduleUpdate();
    }

    this.pendingTrackQCPreloads.add(uiId);

    try {
      const frames = await CVATBridge.getTrackAllFrames(currentJobId, uiId, serverId ?? undefined);

      const trackObjects: QCObjectInstance[] = [];
      const trackLabel = this.currentLabel || `Track #${uiId}`;

      for (const f of frames) {
        if (f.outside || !Array.isArray(f.points) || f.points.length < 9) continue;
        const yaw = f.points[5];
        const objLabel = f.label || trackLabel;
        trackObjects.push({
          frame: f.frame,
          trackId: uiId,
          label: objLabel,
          group: classifyLabelGroup(objLabel, this.qcEngine.getConfig()),
          x: f.points[0],
          y: f.points[1],
          z: f.points[2],
          yaw: yaw,
          yawDeg: (yaw * 180) / Math.PI,
          l: f.points[6],
          w: f.points[7],
          h: f.points[8],
          outside: f.outside,
        });
      }

      trackObjects.sort((a, b) => a.frame - b.frame);

      // Cập nhật chuẩn xác số frame hiện tại từ CVAT Timeline
      this.currentFrameNumber = CVATBridge.getCurrentFrame();

      // Thu thập ngữ cảnh toàn bộ các đối tượng trong cùng frame để kiểm tra Overlap (O)
      const frameContextMap = new Map<number, QCObjectInstance[]>();

      // 1. Frame hiện tại: Lấy từ frameTracks (hoặc gọi getTracksInCurrentFrame nếu forceRefresh)
      let curFrameTracks: FrameTrackItem[] = [];
      if (!forceRefresh && Array.isArray(this.frameTracks) && this.frameTracks.length > 0) {
        curFrameTracks = this.frameTracks;
      } else {
        try {
          const fetched = await CVATBridge.getTracksInCurrentFrame(currentJobId, this.currentFrameNumber);
          curFrameTracks = Array.isArray(fetched) ? fetched : [];
        } catch (_) {
          curFrameTracks = [];
        }
      }

      if (Array.isArray(curFrameTracks) && curFrameTracks.length > 0) {
        this.frameTracks = curFrameTracks;
      }

      const curFrameObjs: QCObjectInstance[] = (curFrameTracks || []).map((t) => ({
        frame: this.currentFrameNumber,
        trackId: t.uiId,
        label: t.label,
        group: classifyLabelGroup(t.label, this.qcEngine.getConfig()),
        x: t.x,
        y: t.y,
        z: t.z,
        yaw: (t.yawDeg * Math.PI) / 180,
        yawDeg: t.yawDeg,
        l: t.l,
        w: t.w,
        h: t.h,
      }));
      frameContextMap.set(this.currentFrameNumber, curFrameObjs);

      // Nếu đối tượng uiId đang có mặt tại frame hiện tại nhưng trackObjects chưa có shape ở frame này, bổ sung ngay!
      const curObjInFrame = curFrameObjs.find((o) => o.trackId === uiId);
      if (curObjInFrame && !trackObjects.some((o) => o.frame === this.currentFrameNumber)) {
        trackObjects.push({ ...curObjInFrame });
        trackObjects.sort((a, b) => a.frame - b.frame);
      }

      // 2. Các frame khác: nếu đã từng nạp toàn Job thì lấy từ cachedAllJobObjects
      if (Array.isArray(this.cachedAllJobObjects) && this.cachedAllJobObjects.length > 0) {
        for (const o of this.cachedAllJobObjects) {
          if (o.frame === this.currentFrameNumber) continue;
          let list = frameContextMap.get(o.frame);
          if (!list) {
            list = [];
            frameContextMap.set(o.frame, list);
          }
          list.push(o);
        }
      }

      // Phân tích và nhóm lỗi theo từng frame
      const frameGroupMap = new Map<number, QCIssue[]>();

      for (const obj of trackObjects) {
        // Nếu obj ở frame hiện tại, ƯU TIÊN cập nhật tọa độ live từ curObjInFrame!
        if (obj.frame === this.currentFrameNumber && curObjInFrame) {
          obj.x = curObjInFrame.x;
          obj.y = curObjInFrame.y;
          obj.z = curObjInFrame.z;
          obj.yaw = curObjInFrame.yaw;
          obj.yawDeg = curObjInFrame.yawDeg;
          obj.l = curObjInFrame.l;
          obj.w = curObjInFrame.w;
          obj.h = curObjInFrame.h;
        }

        // Lấy danh sách đầy đủ các đối tượng trong cùng frame để phát hiện Overlap (O)
        let frameObjs = frameContextMap.get(obj.frame);
        if (!frameObjs || frameObjs.length === 0) {
          frameObjs = [obj];
        } else {
          // Đảm bảo obj hiện tại có mặt trong frameObjs với tọa độ mới nhất
          const existingIdx = frameObjs.findIndex((o) => o.trackId === obj.trackId);
          if (existingIdx >= 0) {
            frameObjs[existingIdx] = obj;
          } else {
            frameObjs = [...frameObjs, obj];
          }
        }

        const summary = this.qcEngine.checkSingleObject(obj, trackObjects, frameObjs);
        if (summary.issues.length > 0) {
          frameGroupMap.set(obj.frame, summary.issues);
        }
      }

      const errorFrames: FrameIssueGroup[] = [];
      for (const [frame, issues] of frameGroupMap.entries()) {
        const actionableIssues = issues.filter(
          (iss) => iss.severity === "error" || iss.severity === "warning"
        );
        if (actionableIssues.length > 0) {
          const hasError = actionableIssues.some((iss) => iss.severity === "error");
          errorFrames.push({
            frame,
            issues: actionableIssues,
            topSeverity: hasError ? "error" : "warning",
          });
        }
      }

      errorFrames.sort((a, b) => a.frame - b.frame);

      const totalFrames = trackObjects.length;
      const cleanFramesCount = Math.max(0, totalFrames - errorFrames.length);

      const readyResult: TrackQCResult = {
        trackId: uiId,
        serverId: serverId ?? null,
        label: trackObjects[0]?.label || trackLabel,
        status: "ready",
        totalFrames,
        errorFrames,
        cleanFramesCount,
        lastScannedAt: Date.now(),
        trackObjects,
      };

      this.trackQCRamCache.set(uiId, readyResult);

      if (this.activeMainTab === "qc" && this.selectedUiId === uiId) {
        this.scheduleUpdate();
      }

      return readyResult;
    } catch (err: any) {
      console.error(`[FloatingPanel] Lỗi nạp ngầm QC cho Track #${uiId}:`, err);
      const errResult: TrackQCResult = {
        trackId: uiId,
        serverId: serverId ?? null,
        label: this.currentLabel || `Track #${uiId}`,
        status: "error",
        totalFrames: 0,
        errorFrames: [],
        cleanFramesCount: 0,
        lastScannedAt: Date.now(),
        errorMessage: err?.message || "Lỗi tải thông tin frames",
      };
      this.trackQCRamCache.set(uiId, errResult);
      if (this.activeMainTab === "qc" && this.selectedUiId === uiId) {
        this.scheduleUpdate();
      }
      return errResult;
    } finally {
      this.pendingTrackQCPreloads.delete(uiId);
    }
  }


  /**
   * Helper kích hoạt live auto-update QC sau khi sửa đối tượng thành công
   */
  public onBoxModificationSuccess(applyToTrack: boolean = false): void {
    if (this.selectedUiId !== null) {
      this.revalidateAndSyncIssue(this.selectedUiId, this.currentFrameNumber, undefined, applyToTrack);
      CVATBridge.requestEdgeContactsCalculation();
    }
  }

  /**
   * Tự động kiểm tra lại đối tượng sau khi sửa và cập nhật dữ liệu lưu trữ (Live Auto-Update)
   * Loại bỏ lỗi khỏi danh sách kiểm định ngay khi sửa thành công mà không làm gián đoạn main process của CVAT.
   */
  public revalidateAndSyncIssue(
    uiId: number,
    frame: number,
    newBoxPoints?: number[],
    applyToTrack: boolean = false
  ): void {
    try {
      // 1. Cập nhật bộ nhớ RAM cache của riêng Track ID này (trackQCRamCache)
      if (this.trackQCRamCache.has(uiId)) {
        const cached = this.trackQCRamCache.get(uiId)!;
        if (cached.status === "ready" && cached.trackObjects) {
          const pointsToUse = newBoxPoints || [
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

          if (applyToTrack) {
            // Khi áp dụng toàn bộ track: cập nhật kích thước cho toàn bộ các frame của track trong RAM cache
            for (const obj of cached.trackObjects) {
              obj.l = pointsToUse[6] ?? this.currentL;
              obj.w = pointsToUse[7] ?? this.currentW;
              obj.h = pointsToUse[8] ?? this.currentH;
            }
          } else {
            // Cập nhật riêng cho frame được sửa
            const yaw = pointsToUse[5];
            const yawDeg = (yaw * 180) / Math.PI;
            const targetObj = cached.trackObjects.find((o) => o.frame === frame);
            if (targetObj) {
              targetObj.x = pointsToUse[0];
              targetObj.y = pointsToUse[1];
              targetObj.z = pointsToUse[2];
              targetObj.yaw = yaw;
              targetObj.yawDeg = yawDeg;
              targetObj.l = pointsToUse[6];
              targetObj.w = pointsToUse[7];
              targetObj.h = pointsToUse[8];
            } else {
              const newObj: QCObjectInstance = {
                frame,
                trackId: uiId,
                label: cached.label || this.currentLabel,
                group: classifyLabelGroup(cached.label || this.currentLabel, this.qcEngine.getConfig()),
                x: pointsToUse[0],
                y: pointsToUse[1],
                z: pointsToUse[2],
                yaw,
                yawDeg,
                l: pointsToUse[6],
                w: pointsToUse[7],
                h: pointsToUse[8],
              };
              cached.trackObjects.push(newObj);
              cached.trackObjects.sort((a, b) => a.frame - b.frame);
            }
          }

          // Chạy lại kiểm tra toàn bộ track với đầy đủ ngữ cảnh trackObjects và frameContext
          const frameGroupMap = new Map<number, QCIssue[]>();
          for (const obj of cached.trackObjects) {
            let frameObjs = [obj];
            if (obj.frame === this.currentFrameNumber && this.frameTracks.length > 0) {
              frameObjs = this.frameTracks.map((t) => {
                if (t.uiId === uiId) {
                  return obj;
                }
                return {
                  frame: this.currentFrameNumber,
                  trackId: t.uiId,
                  label: t.label,
                  group: classifyLabelGroup(t.label, this.qcEngine.getConfig()),
                  x: t.x,
                  y: t.y,
                  z: t.z,
                  yaw: (t.yawDeg * Math.PI) / 180,
                  yawDeg: t.yawDeg,
                  l: t.l,
                  w: t.w,
                  h: t.h,
                };
              });
              if (!frameObjs.some((o) => o.trackId === uiId)) {
                frameObjs.push(obj);
              }
            } else if (Array.isArray(this.cachedAllJobObjects) && this.cachedAllJobObjects.length > 0) {
              const fromAll = this.cachedAllJobObjects.filter((o) => o.frame === obj.frame);
              if (fromAll.length > 0) {
                frameObjs = fromAll.map((o) => (o.trackId === uiId ? obj : o));
                if (!frameObjs.some((o) => o.trackId === uiId)) {
                  frameObjs.push(obj);
                }
              }
            }

            const summary = this.qcEngine.checkSingleObject(obj, cached.trackObjects, frameObjs);
            if (summary.issues.length > 0) {
              frameGroupMap.set(obj.frame, summary.issues);
            }
          }

          const hadIssueBeforeThisFrame = cached.errorFrames.some((ef) => ef.frame === frame);
          const newErrorFrames: FrameIssueGroup[] = [];
          for (const [f, issues] of frameGroupMap.entries()) {
            const actionableIssues = issues.filter(
              (iss) => iss.severity === "error" || iss.severity === "warning"
            );
            if (actionableIssues.length > 0) {
              const hasError = actionableIssues.some((iss) => iss.severity === "error");
              newErrorFrames.push({
                frame: f,
                issues: actionableIssues,
                topSeverity: hasError ? "error" : "warning",
              });
            }
          }
          newErrorFrames.sort((a, b) => a.frame - b.frame);

          const hasIssueNowThisFrame = newErrorFrames.some((ef) => ef.frame === frame);
          cached.errorFrames = newErrorFrames;
          cached.totalFrames = cached.trackObjects.length;
          cached.cleanFramesCount = Math.max(0, cached.totalFrames - cached.errorFrames.length);
          cached.lastScannedAt = Date.now();

          if (hadIssueBeforeThisFrame && !hasIssueNowThisFrame) {
            this.showToast(`✓ Đã sửa đạt chuẩn! Frame #${frame} đã được xóa khỏi danh sách lỗi.`, "success");
          }

          if (this.activeMainTab === "qc") {
            this.scheduleUpdate();
          }

          // 1b. Khắc phục Cross-Track Cache Stale:
          // Nếu có track khác trong RAM cache đang ghi nhận lỗi overlap với uiId, tự động revalidate để xóa sạch lỗi cho cả 2 track
          for (const [otherUiId, otherCached] of this.trackQCRamCache.entries()) {
            if (otherUiId === uiId || otherCached.status !== "ready" || !otherCached.trackObjects) continue;

            const hasRelatedOverlap = otherCached.errorFrames.some((ef) =>
              ef.issues.some((iss) => iss.check === "overlap" && (iss as any).otherTrackId === uiId)
            );

            if (hasRelatedOverlap) {
              const otherFrameGroupMap = new Map<number, QCIssue[]>();
              for (const otherObj of otherCached.trackObjects) {
                let otherFrameObjs = [otherObj];
                if (otherObj.frame === this.currentFrameNumber && this.frameTracks.length > 0) {
                  otherFrameObjs = this.frameTracks.map((t) => {
                    if (t.uiId === uiId) {
                      return (
                        cached.trackObjects.find((o) => o.frame === this.currentFrameNumber) || {
                          frame: this.currentFrameNumber,
                          trackId: uiId,
                          label: cached.label || this.currentLabel,
                          group: classifyLabelGroup(cached.label || this.currentLabel, this.qcEngine.getConfig()),
                          x: pointsToUse[0],
                          y: pointsToUse[1],
                          z: pointsToUse[2],
                          yaw: pointsToUse[5],
                          yawDeg: (pointsToUse[5] * 180) / Math.PI,
                          l: pointsToUse[6],
                          w: pointsToUse[7],
                          h: pointsToUse[8],
                        }
                      );
                    }
                    if (t.uiId === otherUiId) return otherObj;
                    return {
                      frame: this.currentFrameNumber,
                      trackId: t.uiId,
                      label: t.label,
                      group: classifyLabelGroup(t.label, this.qcEngine.getConfig()),
                      x: t.x,
                      y: t.y,
                      z: t.z,
                      yaw: (t.yawDeg * Math.PI) / 180,
                      yawDeg: t.yawDeg,
                      l: t.l,
                      w: t.w,
                      h: t.h,
                    };
                  });
                  if (!otherFrameObjs.some((o) => o.trackId === otherUiId)) {
                    otherFrameObjs.push(otherObj);
                  }
                } else if (Array.isArray(this.cachedAllJobObjects) && this.cachedAllJobObjects.length > 0) {
                  const fromAll = this.cachedAllJobObjects.filter((o) => o.frame === otherObj.frame);
                  if (fromAll.length > 0) {
                    otherFrameObjs = fromAll.map((o) => {
                      if (o.trackId === otherUiId) return otherObj;
                      if (o.trackId === uiId) {
                        const inCached = cached.trackObjects.find((co) => co.frame === otherObj.frame);
                        return inCached || o;
                      }
                      return o;
                    });
                    if (!otherFrameObjs.some((o) => o.trackId === otherUiId)) {
                      otherFrameObjs.push(otherObj);
                    }
                  }
                }

                const otherSummary = this.qcEngine.checkSingleObject(otherObj, otherCached.trackObjects, otherFrameObjs);
                if (otherSummary.issues.length > 0) {
                  otherFrameGroupMap.set(otherObj.frame, otherSummary.issues);
                }
              }

              const newOtherErrorFrames: FrameIssueGroup[] = [];
              for (const [f, issues] of otherFrameGroupMap.entries()) {
                const actionableIssues = issues.filter(
                  (iss) => iss.severity === "error" || iss.severity === "warning"
                );
                if (actionableIssues.length > 0) {
                  const hasError = actionableIssues.some((iss) => iss.severity === "error");
                  newOtherErrorFrames.push({
                    frame: f,
                    issues: actionableIssues,
                    topSeverity: hasError ? "error" : "warning",
                  });
                }
              }
              newOtherErrorFrames.sort((a, b) => a.frame - b.frame);
              otherCached.errorFrames = newOtherErrorFrames;
              otherCached.cleanFramesCount = Math.max(0, otherCached.totalFrames - otherCached.errorFrames.length);
              otherCached.lastScannedAt = Date.now();
            }
          }
        }
      }

    } catch (e) {
      console.warn("[FloatingPanel] Lỗi live revalidate:", e);
    }
  }

  public updateContent(): void {
    if (!this.container || !this.currentCtx) return;

    // Snapshot trạng thái hiển thị (State Memoization chống nháy DOM):
    const stateHash = [
      this.activeMainTab,
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
      this.currentActiveView,
      this.pointColorMode,
      this.colorizeBoxedPoints,
      this.canvasTheme,
      this.selectedUiId ? this.trackQCRamCache.get(this.selectedUiId)?.status : "",
      this.selectedUiId ? this.trackQCRamCache.get(this.selectedUiId)?.errorFrames.length : 0,
      this.selectedUiId ? this.trackQCRamCache.get(this.selectedUiId)?.lastScannedAt : 0,
    ].join("|");

    if (stateHash === this.lastRenderedHash && this.container.children.length > 0) {
      return; // Dữ liệu hoàn toàn không thay đổi -> Giữ nguyên DOM, triệt tiêu 100% nhấp nháy!
    }
    this.lastRenderedHash = stateHash;

    const jobText = this.currentCtx.jobId ? `#${this.currentCtx.jobId}` : "OFFLINE";

    // Cấu hình Badge Khung nhìn View đang active (Top, Side, Front, 3D)
    let viewText = "VIEW: TOP";
    let viewBg = "#f0fdfa";
    let viewBorder = "#99f6e4";
    let viewColor = "#0f766e";
    if (this.currentActiveView === "side") {
      viewText = "VIEW: SIDE";
      viewBg = "#eff6ff";
      viewBorder = "#bfdbfe";
      viewColor = "#1d4ed8";
    } else if (this.currentActiveView === "front") {
      viewText = "VIEW: FRONT";
      viewBg = "#faf5ff";
      viewBorder = "#e9d5ff";
      viewColor = "#7e22ce";
    } else if (this.currentActiveView === "perspective") {
      viewText = "VIEW: 3D";
      viewBg = "#f8fafc";
      viewBorder = "#cbd5e1";
      viewColor = "#475569";
    }
    const hasUndo = this.historyManager.canUndo();
    const hasRedo = this.historyManager.canRedo();
    const lastUndoAction = this.historyManager.getLastUndoAction();
    const lastRedoAction = this.historyManager.getLastRedoAction();

    this.container.innerHTML = `
      ${renderHeader({
        jobText,
        viewText,
        viewBg,
        viewBorder,
        viewColor,
        hasUndo,
        hasRedo,
        lastUndoAction,
        lastRedoAction,
      })}

      <!-- DẢI SUB-HEADER THỐNG KÊ TRACK ID (CỤM TIÊU ĐỀ) -->
      ${renderTrackStatsSubHeader(
        this.selectedUiId,
        this.trackStats,
        this.trackStatsLoading,
        this.currentLabel,
        this.currentFrameNumber
      )}

      <!-- MAIN TABS SWITCHER: EDIT vs QC -->
      ${renderMainTabsSwitcher(this.activeMainTab)}

      <!-- MAIN CONTAINER BODY (LIGHT) -->
      <div style="
        padding: 10px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 8px;
        flex: 1;
        max-height: calc(100vh - 120px);
      ">
        ${this.activeMainTab === "qc" ? renderQCTabContent({
          selectedUiId: this.selectedUiId,
          cachedResult: this.selectedUiId !== null ? this.trackQCRamCache.get(this.selectedUiId) : undefined,
          currentLabel: this.currentLabel,
          currentFrameNumber: this.currentFrameNumber,
        }) : renderEditTabContent({
          selectedUiId: this.selectedUiId,
          currentLabel: this.currentLabel,
          currentX: this.currentX,
          currentY: this.currentY,
          currentZ: this.currentZ,
          currentYawDeg: this.currentYawDeg,
          currentL: this.currentL,
          currentW: this.currentW,
          currentH: this.currentH,
          editL: this.editL,
          editW: this.editW,
          editH: this.editH,
          isDropdownOpen: this.isDropdownOpen,
          searchKeyword: this.searchKeyword,
          frameTracks: this.frameTracks,
          autoCenterOnFrame: this.autoCenterOnFrame,
          canvasTheme: this.canvasTheme,
          pointColorMode: this.pointColorMode,
          colorizeBoxedPoints: this.colorizeBoxedPoints,
          orthoPointSize: this.orthoPointSize,
          selectedCategory: this.selectedCategory,
          edgeContacts: this.edgeContacts,
          orthoSlicing: this.orthoSlicing,
          applyToTrack: this.applyToTrack,
          isAdvancedOpen: this.isAdvancedOpen,
        })}
      </div>

      <!-- CARD FOOTER (LIGHT) -->
      ${renderCardFooter()}
    `;

    // Gắn lại phần tử Toast Overlay vào cuối Container
    if (this.toastOverlay) {
      this.container.appendChild(this.toastOverlay);
    }

    // ==========================================
    // GẮN SỰ KIỆN TƯƠNG TÁC
    // ==========================================

    // 0. Gắn sự kiện chuyển đổi Main Suite Tabs (Edit vs QC)
    const tabEditBtn = this.container.querySelector("#main-tab-edit");
    if (tabEditBtn) {
      tabEditBtn.addEventListener("click", () => {
        if (this.activeMainTab !== "edit") {
          this.activeMainTab = "edit";
          this.updateContent();
        }
      });
    }

    const tabQcBtn = this.container.querySelector("#main-tab-qc");
    if (tabQcBtn) {
      tabQcBtn.addEventListener("click", async () => {
        if (this.activeMainTab !== "qc") {
          this.activeMainTab = "qc";
          if (this.selectedUiId !== null) {
            await this.syncFrameTracks();
            this.preloadTrackQCInBackground(this.selectedUiId, this.selectedServerId, true);
          }
          this.updateContent();
        }
      });
    }

    // Nút mở toàn màn hình QC Studio Modal
    const openQcModalBtn = this.container.querySelector("#btn-open-qc-studio-modal");
    if (openQcModalBtn) {
      openQcModalBtn.addEventListener("click", () => {
        if (this.currentCtx) {
          this.qcStudioModal.open(this.currentCtx);
        }
      });
    }


    // Nút thử lại tải QC theo Track ID nếu gặp sự cố mạng/bridge
    const retryTrackQcBtn = this.container.querySelector<HTMLButtonElement>("#btn-retry-track-qc");
    if (retryTrackQcBtn && this.selectedUiId !== null) {
      retryTrackQcBtn.addEventListener("click", async () => {
        if (this.selectedUiId !== null) {
          this.trackQCRamCache.delete(this.selectedUiId);
          await this.syncFrameTracks();
          await this.preloadTrackQCInBackground(this.selectedUiId, this.selectedServerId, true);
          this.updateContent();
        }
      });
    }

    // Nút quét lại toàn bộ frames của Track ID vào RAM (Refresh Track QC)
    const refreshTrackQcBtn = this.container.querySelector<HTMLButtonElement>("#btn-refresh-track-qc");
    if (refreshTrackQcBtn && this.selectedUiId !== null) {
      refreshTrackQcBtn.addEventListener("click", async () => {
        if (this.selectedUiId !== null) {
          this.showToast(`Đang quét lại QC cho Track #${this.selectedUiId}...`, "info");
          // 1. Xóa cache cũ của track này để ép nạp mới hoàn toàn
          this.trackQCRamCache.delete(this.selectedUiId);
          // 2. Đồng bộ lại danh sách và tọa độ live của tất cả các box trong frame hiện tại từ Canvas/Redux
          await this.syncFrameTracks();
          // 3. Cập nhật lại các biến hiển thị nếu track này vẫn còn trong frameTracks
          const currentTrack = this.frameTracks.find((t) => t.uiId === this.selectedUiId);
          if (currentTrack) {
            this.currentX = currentTrack.x;
            this.currentY = currentTrack.y;
            this.currentZ = currentTrack.z;
            this.currentYawDeg = currentTrack.yawDeg;
            this.currentL = currentTrack.l;
            this.currentW = currentTrack.w;
            this.currentH = currentTrack.h;
          }
          // 4. Chạy lại QC ngầm cho Track ID này với đầy đủ ngữ cảnh các xe khác trong frame
          await this.preloadTrackQCInBackground(this.selectedUiId, this.selectedServerId, true);
          this.updateContent();
        }
      });
    }

    // Gắn sự kiện click vào từng dòng cảnh báo & lỗi để tua Timeline và chuyển góc nhìn đến đối tượng đó luôn
    const issueCards = this.container.querySelectorAll<HTMLElement>(".btn-jump-to-qc-issue");
    issueCards.forEach((card) => {
      card.addEventListener("click", () => {
        const fStr = card.dataset.frame;
        const tStr = card.dataset.trackId;
        const title = card.dataset.issueTitle || "";
        if (fStr !== undefined && tStr !== undefined) {
          const f = parseInt(fStr, 10);
          const t = parseInt(tStr, 10);
          if (!isNaN(f) && !isNaN(t)) {
            this.jumpToSpecificIssue(f, t, title);
          }
        }
      });
    });

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

    // 3.5. Gắn sự kiện Tắt Đất Top View
    const hideGroundBtn = this.container.querySelector("#btn-toggle-hide-ground");
    if (hideGroundBtn) hideGroundBtn.addEventListener("click", () => this.toggleHideGround());

    // 4. Gắn sự kiện Mở rộng / Thu gọn Accordion Tinh chỉnh nâng cao
    const toggleAdvancedBtn = this.container.querySelector("#btn-toggle-advanced");
    if (toggleAdvancedBtn) {
      toggleAdvancedBtn.addEventListener("click", () => {
        this.isAdvancedOpen = !this.isAdvancedOpen;
        this.updateContent();
      });
    }

    // 5. Gắn sự kiện nút Hoàn Tác (Pre), Làm Lại (Redo), Thu nhỏ & Quét Frame
    const undoBtn = this.container.querySelector("#floating-btn-undo");
    if (undoBtn) undoBtn.addEventListener("click", () => this.handleUndo());

    const redoBtn = this.container.querySelector("#floating-btn-redo");
    if (redoBtn) redoBtn.addEventListener("click", () => this.handleRedo());

    const minBtn = this.container.querySelector("#floating-btn-minimize");
    if (minBtn) minBtn.addEventListener("click", () => this.toggleMinimize());

    // Badge View: Click để chuyển nhanh khung nhìn đang active
    const badgeView = this.container.querySelector("#floating-badge-view");
    if (badgeView) {
      badgeView.addEventListener("click", () => {
        const views: Array<"top" | "side" | "front" | "perspective"> = ["top", "side", "front", "perspective"];
        const nextIdx = (views.indexOf(this.currentActiveView) + 1) % views.length;
        this.setActiveView(views[nextIdx]);
        this.showToast(`Khung nhìn WASD: ${views[nextIdx].toUpperCase()}`, "info");
      });
    }

    const helpBtn = this.container.querySelector("#floating-btn-help");
    if (helpBtn) helpBtn.addEventListener("click", () => this.toggleHotkeysHelpModal());

    const syncBtn = this.container.querySelector("#floating-btn-sync-frame");
    if (syncBtn) {
      syncBtn.addEventListener("click", async () => {
        this.showToast("Đang quét lại xe ở frame này...", "info");
        await this.syncFrameTracks();
        if (this.selectedUiId !== null) {
          this.trackQCRamCache.delete(this.selectedUiId);
          await this.preloadTrackQCInBackground(this.selectedUiId, this.selectedServerId, true);
        }
        this.updateContent();
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
                const badgeColor = t.color || "#3b82f6";
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
                      <span style="font-weight: 700; color: ${isSelected ? "#10b981" : "#a1a1aa"}; font-size: 11px;">#${t.uiId}</span>
                      <span style="
                        display: inline-flex;
                        align-items: center;
                        gap: 4px;
                        padding: 1px 6px;
                        border-radius: 4px;
                        background: ${badgeColor}25;
                        border: 1px solid ${badgeColor}60;
                        color: ${badgeColor};
                        font-weight: 600;
                        font-size: 10px;
                      ">
                        <span style="width: 5px; height: 5px; border-radius: 50%; background: ${badgeColor}; display: inline-block;"></span>
                        ${t.label}
                      </span>
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

    // Gắn sự kiện click chọn nhanh đối tượng từ Card Inactive State
    const quickSelectBtns = this.container.querySelectorAll<HTMLButtonElement>(".btn-quick-select-track");
    quickSelectBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = parseInt(btn.dataset.uiid || "0", 10);
        if (id > 0) {
          this.selectTrackByUiId(id, undefined, true);
        }
      });
    });

    // 7. Gắn sự kiện Prev / Next
    const prevBtn = this.container.querySelector("#btn-prev-frame-track");
    if (prevBtn) prevBtn.addEventListener("click", () => this.selectPrevTrack());

    const nextBtn = this.container.querySelector("#btn-next-frame-track");
    if (nextBtn) nextBtn.addEventListener("click", () => this.selectNextTrack());

    // 7b. Gắn sự kiện Bật/Tắt Ghim Tâm khi tua frame (Lock-On Camera Tracking)
    const autoCenterBtn = this.container.querySelector("#btn-toggle-auto-center");
    if (autoCenterBtn) {
      autoCenterBtn.addEventListener("click", () => {
        this.autoCenterOnFrame = !this.autoCenterOnFrame;
        localStorage.setItem("CVAT_3D_SUITE_AUTO_CENTER_FRAME", String(this.autoCenterOnFrame));
        CVATBridge.setAutoCenterOnFrameChange(this.autoCenterOnFrame);
        this.showToast(
          `Đã ${this.autoCenterOnFrame ? "BẬT Ghim Tâm (Lock-On)" : "TẮT Ghim Tâm (Tự do)"} khi tua frame`,
          this.autoCenterOnFrame ? "success" : "info"
        );
        if (this.autoCenterOnFrame && this.selectedUiId !== null) {
          CVATBridge.centerCanvas3DOnTrack(this.selectedUiId);
        }
        this.updateContent();
      });
    }

    // 7b2. Gắn sự kiện Chuyển đổi Theme Canvas 3D (Nền Trắng ⇄ Nền Tối)
    const canvasThemeBtn = this.container.querySelector("#btn-toggle-canvas-theme");
    if (canvasThemeBtn) {
      canvasThemeBtn.addEventListener("click", async () => {
        this.canvasTheme = this.canvasTheme === "light" ? "dark" : "light";
        localStorage.setItem("cvat_3d_canvas_theme", this.canvasTheme);
        await CVATBridge.setCanvasTheme(this.canvasTheme);
        this.showToast(
          this.canvasTheme === "light"
            ? "Theme Canvas: Nền Trắng (Mây điểm Đen High-Contrast)"
            : "Theme Canvas: Nền Tối (Mây điểm Sáng Nguyên bản)",
          "info"
        );
        this.updateContent();
      });
    }

    // 7c. Gắn sự kiện Chuyển đổi Chế độ màu mây điểm LiDAR (Intensity vs Plain)
    const colorModeBtn = this.container.querySelector("#btn-toggle-point-color-mode");
    if (colorModeBtn) {
      colorModeBtn.addEventListener("click", async () => {
        this.pointColorMode = this.pointColorMode === "intensity" ? "plain" : "intensity";
        localStorage.setItem("cvat_3d_point_color_mode", this.pointColorMode);
        await CVATBridge.setPointCloudColorMode(this.pointColorMode, this.colorizeBoxedPoints);
        this.showToast(
          this.pointColorMode === "intensity"
            ? "Màu Point: Độ phản xạ (Intensity - Soi vạch sơn)"
            : "Màu Point: Màu phẳng (Plain - Rõ hình khối 3D)",
          "info"
        );
        this.updateContent();
      });
    }

    // 7d. Gắn sự kiện Bật/Tắt Nhuộm màu các điểm trong xe bọc
    const colorizeBoxedBtn = this.container.querySelector("#btn-toggle-colorize-boxed");
    if (colorizeBoxedBtn) {
      colorizeBoxedBtn.addEventListener("click", async () => {
        this.colorizeBoxedPoints = !this.colorizeBoxedPoints;
        localStorage.setItem("cvat_3d_colorize_boxed", String(this.colorizeBoxedPoints));
        await CVATBridge.setPointCloudColorMode(this.pointColorMode, this.colorizeBoxedPoints);
        this.showToast(
          `Đã ${this.colorizeBoxedPoints ? "BẬT" : "TẮT"} nhuộm màu điểm xe bọc (Toàn Bộ Frame)`,
          this.colorizeBoxedPoints ? "success" : "info"
        );
        this.updateContent();
      });
    }

    // 7e. Gắn sự kiện Chuyển đổi Kích thước Hạt Điểm Mây 2D (Top / Side / Front)
    const pointSizeBtn = this.container.querySelector("#btn-toggle-ortho-point-size");
    if (pointSizeBtn) {
      pointSizeBtn.addEventListener("click", async () => {
        // Xoay vòng: 2.0px -> 3.5px -> 5.0px -> 2.0px
        if (this.orthoPointSize < 3.0) {
          this.orthoPointSize = 3.5;
        } else if (this.orthoPointSize < 4.5) {
          this.orthoPointSize = 5.0;
        } else {
          this.orthoPointSize = 2.0;
        }
        localStorage.setItem("cvat_3d_ortho_point_size", String(this.orthoPointSize));
        await CVATBridge.setOrthoPointSize(this.orthoPointSize);
        this.showToast(`Cỡ điểm 2D: ${this.orthoPointSize.toFixed(1)}px`, "info");
        this.updateContent();
      });
    }

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

    // Gắn sự kiện Input trực tiếp (L, W, H) - Tự động áp dụng Realtime khi đổi số (Enter hoặc blur)
    const inpL = this.container.querySelector<HTMLInputElement>("#input-dim-l");
    const inpW = this.container.querySelector<HTMLInputElement>("#input-dim-w");
    const inpH = this.container.querySelector<HTMLInputElement>("#input-dim-h");

    const onDimInputChange = () => {
      const l = inpL ? parseFloat(inpL.value) || this.currentL : this.currentL;
      const w = inpW ? parseFloat(inpW.value) || this.currentW : this.currentW;
      const h = inpH ? parseFloat(inpH.value) || this.currentH : this.currentH;
      if (l > 0 && w > 0 && h > 0 && (l !== this.currentL || w !== this.currentW || h !== this.currentH)) {
        this.handleUpdateDimensions(l, w, h, this.applyToTrack);
      }
    };

    if (inpL) {
      inpL.addEventListener("change", onDimInputChange);
      inpL.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter") inpL.blur();
      });
    }
    if (inpW) {
      inpW.addEventListener("change", onDimInputChange);
      inpW.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter") inpW.blur();
      });
    }
    if (inpH) {
      inpH.addEventListener("change", onDimInputChange);
      inpH.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter") inpH.blur();
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

    // Gắn sự kiện Đánh dấu Outside (Ẩn) toàn bộ frame của Track (Shift+O)
    const outsideTrackBtn = this.container.querySelector("#btn-outside-entire-track");
    if (outsideTrackBtn) {
      outsideTrackBtn.addEventListener("click", () => this.handleSetTrackOutside(true));
    }

    // Gắn sự kiện Đánh dấu Inside (Hiện lại) toàn bộ frame của Track (Shift+I)
    const insideTrackBtn = this.container.querySelector("#btn-inside-entire-track");
    if (insideTrackBtn) {
      insideTrackBtn.addEventListener("click", () => this.handleSetTrackOutside(false));
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

    // 12. Gắn sự kiện Ghim Mặt Đất, Dốc Pitch & Roll (trong accordion)
    const snapRoadBtn = this.container.querySelector("#btn-snap-road");
    if (snapRoadBtn) snapRoadBtn.addEventListener("click", () => this.handleSnapGround("road"));

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
          this.rotatePitchByDelta(deltaDeg);
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

    // Đồng bộ vẽ Box 3D lên Camera 2D Overlay HUD & Focus Modal (Realtime)
    const activeBox = this.getCurrentBox3D();
    if (activeBox) {
      CameraOverlayManager.getInstance().renderBox(activeBox);
      CameraFocusModal.getInstance().setBox(activeBox);
    } else {
      CameraOverlayManager.getInstance().clearAllCanvases();
      CameraFocusModal.getInstance().setBox(null);
    }
  }

  /**
   * Mở giao diện toàn màn hình duyệt và chỉnh sửa toàn bộ track của xe (CVAT Helper Studio)
   */
  public openFullscreenEditor(): void {
    if (!this.currentCtx || !this.currentCtx.jobId) {
      this.showToast("Chưa kết nối Job CVAT!", "warning");
      return;
    }

    const firstTrack = this.frameTracks[0];
    const targetUiId = this.selectedUiId !== null ? this.selectedUiId : (firstTrack ? firstTrack.uiId : undefined);

    // Mở CVAT Helper Overlay toàn màn hình (Case 1: Sửa L/W/H hàng loạt + Case 2: Duyệt theo ID với WebGL Grid)
    HelperOverlay.getInstance().open(this.currentCtx.jobId, targetUiId);
  }

  /**
   * Bật / Tắt bảng hướng dẫn phím tắt nổi (Speedrun Hotkeys Cheatsheet Modal)
   */
  public toggleHotkeysHelpModal(): void {
    this.hotkeysModal.toggle();
    this.isHelpModalOpen = this.hotkeysModal.isOpen;
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
