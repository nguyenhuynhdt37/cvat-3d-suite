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
import { QCStudioModal } from "./QCStudioModal";
import { QCEngine, classifyLabelGroup } from "../../core/qc/qc_engine.ts";
import type { QCObjectInstance } from "../../core/qc/types.ts";
import { CameraOverlayManager, setVinCalibForOverlay } from "./CameraOverlay";
import { CameraFocusModal } from "./CameraFocusModal";
import { CalibrationModal } from "./CalibrationModal";
import { HeaderSuiteButton } from "./HeaderSuiteButton";
import { HelperOverlay } from "../../helper/overlay";
import type { Box3D } from "../../core/geometry";

export interface UndoSnapshot {
  uiId: number;
  serverId: number | null;
  frame: number;
  applyToTrack: boolean;
  boxPoints: number[];
  trackShapesBackup?: Array<{ frame: number; outside?: boolean; points: number[] }>;
  actionName: string;
}

export interface TrackStatsInfo {
  uiId: number;
  totalFrames: number;
  startFrame: number;
  endFrame: number;
  activeCount: number;
  outsideCount: number;
  isFullyOutside: boolean;
  isFullyActive: boolean;
  label?: string;
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
  private qcStudioModal: QCStudioModal = new QCStudioModal();
  private qcEngine: QCEngine = new QCEngine();

  // Tab chính của Floating Panel: "edit" (Chỉnh sửa) hoặc "qc" (Kiểm tra QC tức thì)
  public activeMainTab: "edit" | "qc" = "edit";

  // Ngăn xếp hoàn tác thao tác (Undo / Pre Stack)
  private undoStack: UndoSnapshot[] = [];

  // Chế độ phân loại đối tượng nhanh: "car" | "pedestrian" | "cyclist"
  private selectedCategory: "car" | "pedestrian" | "cyclist" = "car";

  // Trạng thái mở rộng accordion tinh chỉnh nâng cao
  private isAdvancedOpen: boolean = false;

  // Phạm vi áp dụng kích thước: false = Chỉ Frame này, true = Toàn bộ Track
  private applyToTrack: boolean = false;

  // Dữ liệu đối tượng đang chọn
  public selectedUiId: number | null = null;       // Số 1, 2 hiển thị chuẩn
  public selectedServerId: number | null = null;   // Số 31, 32 lưu database
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
  private lastContextImageFrame: number = -1;
  private frameTracks: FrameTrackItem[] = [];

  // Trạng thái Dropdown Select & Tìm kiếm
  private isDropdownOpen: boolean = false;
  private searchKeyword: string = "";
  private autoSelectListenerAttached: boolean = false;
  private autoCenterOnFrame: boolean = localStorage.getItem("CVAT_3D_SUITE_AUTO_CENTER_FRAME") !== "false";

  // Cấu hình Chế độ màu mây điểm LiDAR & Nhuộm màu xe bọc & Mặt sàn Polygon
  private pointColorMode: "intensity" | "plain" =
    (localStorage.getItem("cvat_3d_point_color_mode") as any) || "intensity";
  private colorizeBoxedPoints: boolean =
    localStorage.getItem("cvat_3d_colorize_boxed") !== "false";
  private groundPlaneVisible: boolean =
    localStorage.getItem("cvat_3d_ground_plane_visible") !== "false";

  // Thống kê vòng đời của Track ID đang chọn
  private trackStats: TrackStatsInfo | null = null;
  private trackStatsLoading: boolean = false;

  // Trạng thái xử lý
  private isProcessing: boolean = false;
  public isHelpModalOpen: boolean = false;
  private helpModalContainer: HTMLElement | null = null;

  // Tọa độ kéo thả
  private isDragging: boolean = false;
  private startX: number = 0;
  private startY: number = 0;

  // Khung nhìn đang active (Top, Side, Front, hoặc Perspective 3D) để điều khiển WASD
  public currentActiveView: "top" | "side" | "front" | "perspective" = "top";

  private currentCtx: CVATContext | null = null;
  private pollInterval: any = null;
  private updatePending: boolean = false;
  private lastRenderedHash: string = "";

  /**
   * Cập nhật khung nhìn đang focus (được gọi từ trình theo dõi chuột trên Canvas)
   */
  public setActiveView(view: "top" | "side" | "front" | "perspective"): void {
    if (this.currentActiveView !== view) {
      this.currentActiveView = view;
      this.scheduleUpdate();
    }
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

        if (!this.trackStats || this.trackStats.uiId !== details.clientId) {
          this.loadTrackStats(details.clientId);
        }

        this.scheduleUpdate();
      } else if (clientId && clientId !== this.selectedUiId) {
        console.log(`[CVAT 3D Suite] Tự động chọn xe #${clientId} từ click Canvas 3D`);
        this.selectTrackByUiId(clientId, undefined, false);
      }
    });

    // Lắng nghe sự kiện đối tượng bị hủy kích hoạt (click ra ngoài canvas hoặc bỏ chọn trên CVAT)
    window.addEventListener("CVAT_EXT_RES_OBJECT_DEACTIVATED", () => {
      if (this.selectedUiId !== null) {
        console.log("[CVAT 3D Suite] Đối tượng bị hủy kích hoạt trên CVAT -> chuyển sang Inactive State");
        this.selectedUiId = null;
        this.selectedServerId = null;
        this.currentLabel = "Chưa chọn đối tượng";
        this.scheduleUpdate();
      }
    });

    // Lắng nghe tín hiệu khi danh sách track trong Redux thay đổi (vừa vẽ xong box mới)
    window.addEventListener("CVAT_EXT_RES_FRAME_TRACKS_DIRTY", () => {
      this.syncFrameTracks();
    });

    // Lắng nghe sự kiện chuyển frame tức thì từ Main World (Phím F/D, Timeline, Play)
    window.addEventListener("CVAT_EXT_RES_FRAME_CHANGED", (e: any) => {
      const { frame } = e.detail || {};
      if (typeof frame === "number" && frame !== this.currentFrameNumber) {
        this.currentFrameNumber = frame;
        this.syncFrameTracks();
      }
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

      // 2. Quét xem có active item nào trên sidebar không (Tự động FOCUS vào xe khi đổi đối tượng)
      const active = CVATBridge.getActiveTrackId();
      if (active.id !== null && active.id !== this.selectedUiId) {
        const isTrackInCurrentFrame = this.frameTracks.length === 0 || this.frameTracks.some((t) => t.uiId === active.id);
        if (isTrackInCurrentFrame) {
          await this.selectTrackByUiId(active.id, undefined, true);
        }
      }
    }, 150);

    // Chờ CVAT ổn định 1.2s sau khi F5 rồi mới quét lần đầu để chống bão khởi tạo
    setTimeout(() => this.syncFrameTracks(), 1200);
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
    const activeId = await this.ensureActiveTrackSelected();
    if (!activeId || !this.currentCtx?.jobId) {
      this.showToast("Chưa chọn đối tượng để vi chỉnh!", "warning");
      return;
    }

    const step = 0.02; // 2cm mỗi lần bấm: vừa mịn vừa đủ quan sát tức thì
    let deltaXWorld = 0;
    let deltaYWorld = 0;
    let deltaZWorld = 0;

    const view = this.currentActiveView;

    switch (view) {
      case "side":
        // SIDE VIEW (Màn hình: Trục ngang là X, trục đứng là Z)
        if (key === "w") deltaZWorld = step;        // Lên màn hình (Nâng Z)
        if (key === "s") deltaZWorld = -step;       // Xuống màn hình (Hạ Z)
        if (key === "a") deltaXWorld = -step;       // Sang TRÁI màn hình (-X)
        if (key === "d") deltaXWorld = step;        // Sang PHẢI màn hình (+X)
        break;

      case "front":
        // FRONT VIEW (Màn hình: Trục ngang là Y [Trái: +Y, Phải: -Y], trục đứng là Z)
        if (key === "w") deltaZWorld = step;        // Lên màn hình (Nâng Z)
        if (key === "s") deltaZWorld = -step;       // Xuống màn hình (Hạ Z)
        if (key === "a") deltaYWorld = step;        // Sang TRÁI màn hình (+Y)
        if (key === "d") deltaYWorld = -step;       // Sang PHẢI màn hình (-Y)
        break;

      case "top":
      case "perspective":
      default:
        // TOP VIEW hoặc 3D (Màn hình: Trục đứng là X [+X đi lên], Trục ngang là Y [Trái: +Y, Phải: -Y])
        if (key === "w") deltaXWorld = step;        // Đi LÊN màn hình (+X)
        if (key === "s") deltaXWorld = -step;       // Đi XUỐNG màn hình (-X)
        if (key === "a") deltaYWorld = step;        // Đi sang TRÁI màn hình (+Y)
        if (key === "d") deltaYWorld = -step;       // Đi sang PHẢI màn hình (-Y)
        break;
    }

    try {
      // 🚨 BỎ HOÀN TOÀN ÁP DỤNG TOÀN TRACK: Luôn luôn lưu snapshot và shift duy nhất cho Frame này (applyToTrack = false)
      await this.pushUndoSnapshot(
        `Shift+WASD Nudge [${view.toUpperCase()}]: ${key.toUpperCase()}`,
        false
      );

      // Truyền isWorld = true để tịnh tiến trực tiếp theo toạ độ màn hình (độc lập 100% với góc quay của xe)
      // applyToTrack = false (Chỉ tác động Frame Hiện Tại!)
      const res = await CVATBridge.shiftTrackCenter(
        this.currentCtx.jobId,
        activeId,
        this.selectedServerId,
        deltaXWorld,
        deltaYWorld,
        deltaZWorld,
        false,
        true
      );

      if (res.success) {
        if (res.newX !== undefined) this.currentX = res.newX;
        if (res.newY !== undefined) this.currentY = res.newY;
        if (res.newZ !== undefined) this.currentZ = res.newZ;
        this.scheduleUpdate();
      }
    } catch (err: any) {
      console.warn("[CVAT 3D Suite] Lỗi vi chỉnh WASD:", err);
    }
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

    // Fetch ảnh Context Images từ CVAT API (chỉ khi frame thay đổi)
    if (this.currentFrameNumber !== this.lastContextImageFrame) {
      this.lastContextImageFrame = this.currentFrameNumber;
      CVATBridge.fetchContextImages(this.currentCtx.jobId, this.currentFrameNumber)
        .then((images) => {
          if (images.size > 0) {
            images.forEach((blobUrl, camIdx) => {
              CameraOverlayManager.getInstance().updateCameraImage(camIdx, blobUrl);
            });
          }
        })
        .catch(() => {});
    }

    // 1. Dò tìm đối tượng đang active trong frame mới (ưu tiên serverId, fallback uiId)
    let matchingTrack: FrameTrackItem | undefined;
    if (this.selectedServerId) {
      matchingTrack = tracks.find((t) => t.serverId === this.selectedServerId);
    }
    if (!matchingTrack && this.selectedUiId !== null) {
      matchingTrack = tracks.find((t) => t.uiId === this.selectedUiId);
    }

    if (matchingTrack) {
      // Đối tượng VẪN CÒN MẶT tại frame mới: duy trì và cập nhật thông số mới nhất
      this.selectedUiId = matchingTrack.uiId;
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

      // KÍCH HOẠT LẠI TRÊN THREE.JS CANVAS 3D ĐỂ BẬT LẠI TOP, SIDE, FRONT VIEWS ĐÚNG CHO BOX NÀY
      CVATBridge.activateCanvasTrack(matchingTrack.uiId, { x: matchingTrack.x, y: matchingTrack.y, z: matchingTrack.z });
      CVATBridge.setActiveTrackIdInMainWorld(matchingTrack.uiId);

      if (this.selectedUiId && (!this.trackStats || this.trackStats.uiId !== this.selectedUiId)) {
        this.loadTrackStats(this.selectedUiId);
      }
      this.scheduleUpdate();
    } else {
      // Đối tượng KHÔNG CÓ MẶT ở frame này (outside hoặc track kết thúc):
      // Chuyển sang Inactive State, KHÔNG TỰ ĐỘNG CHỌN BOX KHÁC (chống nhảy ID bừa bãi)
      if (this.selectedUiId !== null) {
        this.selectedUiId = null;
        this.selectedServerId = null;
        this.currentLabel = "Chưa chọn đối tượng";
        this.scheduleUpdate();
      }
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
    CVATBridge.setActiveTrackIdInMainWorld(uiId);

    if (!this.trackStats || this.trackStats.uiId !== uiId) {
      this.loadTrackStats(uiId);
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
    await this.pushUndoSnapshot(`${outside ? "Outside (Ẩn)" : "Inside (Hiện)"} Toàn Track #${this.selectedUiId}`, true);
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
          `Đã đánh dấu ${outside ? "Outside (Ẩn)" : "Inside (Hiện)"} cho ${res.count || "toàn bộ"} frame của Track #${this.selectedUiId}! Bấm Pre để hoàn tác.`,
          "success"
        );
        await this.syncFrameTracks();
        await this.loadTrackStats(this.selectedUiId);
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
   * Tải ngầm thống kê toàn bộ vòng đời của Track ID (Total frames, Active, Outside, Dải frame)
   */
  public async loadTrackStats(uiId: number | null): Promise<void> {
    if (uiId === null || !this.currentCtx?.jobId) {
      this.trackStats = null;
      this.updateContent();
      return;
    }

    try {
      this.trackStatsLoading = true;
      const serverId = this.selectedServerId || uiId;
      const allFrames = await CVATBridge.getTrackAllFrames(this.currentCtx.jobId, uiId, serverId);

      // Nếu người dùng đã chuyển sang xe khác trong lúc đang truy vấn
      if (this.selectedUiId !== uiId) return;

      if (Array.isArray(allFrames) && allFrames.length > 0) {
        const totalFrames = allFrames.length;
        const startFrame = allFrames[0].frame;
        const endFrame = allFrames[allFrames.length - 1].frame;
        const outsideCount = allFrames.filter((f) => !!f.outside).length;
        const activeCount = totalFrames - outsideCount;
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
          label: allFrames[0]?.label || this.currentLabel,
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
    if (this.selectedUiId === null) {
      return "";
    }

    const stats = this.trackStats;
    const isLoading = this.trackStatsLoading && !stats;

    if (isLoading) {
      return `
        <div style="
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
          padding: 4px 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 10px;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          color: #64748b;
        ">
          <div style="display: flex; align-items: center; gap: 5px;">
            <span style="font-weight: 700; color: #0284c7;">Track #${this.selectedUiId}</span>
            <span style="font-size: 9px; color: #94a3b8;">Đang tải thống kê track...</span>
          </div>
        </div>
      `;
    }

    if (!stats) {
      return `
        <div style="
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
          padding: 4px 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 10px;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          color: #64748b;
        ">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-weight: 700; color: #0284c7;">Track #${this.selectedUiId}</span>
            <span style="color: #64748b; font-size: 9.5px;">${this.currentLabel}</span>
          </div>
          <span style="font-size: 9px; color: #94a3b8;">F#${this.currentFrameNumber}</span>
        </div>
      `;
    }

    const { totalFrames, startFrame, endFrame, activeCount, outsideCount, isFullyOutside, isFullyActive } = stats;

    let badgeHtml = "";
    if (isFullyOutside) {
      badgeHtml = `
        <span style="
          background: #fee2e2;
          border: 1px solid #fecdd3;
          color: #e11d48;
          padding: 1px 6px;
          border-radius: 4px;
          font-weight: 700;
          font-size: 9.5px;
          display: inline-flex;
          align-items: center;
          gap: 3px;
        ">
          ${ICONS.eyeOff}
          <span>Ẩn Toàn Bộ (${totalFrames}f)</span>
        </span>
      `;
    } else if (isFullyActive) {
      badgeHtml = `
        <span style="
          background: #ecfdf5;
          border: 1px solid #a7f3d0;
          color: #059669;
          padding: 1px 6px;
          border-radius: 4px;
          font-weight: 600;
          font-size: 9.5px;
          display: inline-flex;
          align-items: center;
          gap: 3px;
        ">
          ${ICONS.eye}
          <span>Hiện Toàn Bộ (${totalFrames}f)</span>
        </span>
      `;
    } else {
      badgeHtml = `
        <div style="display: flex; align-items: center; gap: 4px; font-size: 9.5px; font-weight: 600;">
          <span style="color: #059669; background: #ecfdf5; border: 1px solid #a7f3d0; padding: 1px 5px; border-radius: 4px; display: inline-flex; align-items: center; gap: 2px;">
            ${ICONS.eye} ${activeCount} Hiện
          </span>
          <span style="color: #e11d48; background: #fee2e2; border: 1px solid #fecdd3; padding: 1px 5px; border-radius: 4px; display: inline-flex; align-items: center; gap: 2px;">
            ${ICONS.eyeOff} ${outsideCount} Ẩn
          </span>
        </div>
      `;
    }

    return `
      <div style="
        background: ${isFullyOutside ? "#fff5f5" : "#f8fafc"};
        border-bottom: 1px solid ${isFullyOutside ? "#fed7aa" : "#e2e8f0"};
        padding: 4px 10px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 10px;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        transition: background 0.15s;
      ">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="font-weight: 700; color: ${isFullyOutside ? "#e11d48" : "#0284c7"};">Track #${this.selectedUiId}</span>
          <span style="color: #64748b; font-size: 9.5px;">
            ${totalFrames} frames (F#${startFrame} ➔ F#${endFrame})
          </span>
        </div>
        <div>
          ${badgeHtml}
        </div>
      </div>
    `;
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
      this.showToast("Cần active đối tượng để thao tác!", "warning");
      return;
    }

    // Phòng vệ phân lập nhãn: Không lật 180° người đi bộ
    if (this.selectedCategory === "pedestrian") {
      this.showToast("Không áp dụng lật 180° cho Người đi bộ!", "warning");
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

      if (this.selectedUiId !== null) {
        CVATBridge.centerCanvas3DOnTrack(this.selectedUiId, { x: this.currentX, y: this.currentY, z: this.currentZ });
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

      if (this.selectedUiId !== null) {
        CVATBridge.centerCanvas3DOnTrack(this.selectedUiId, { x: this.currentX, y: this.currentY, z: this.currentZ });
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
    if (this.selectedUiId !== null) {
      CVATBridge.centerCanvas3DOnTrack(this.selectedUiId, { x: this.currentX, y: this.currentY, z: this.currentZ });
    }
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

        if (this.selectedUiId !== null) {
          CVATBridge.centerCanvas3DOnTrack(this.selectedUiId, { x: this.currentX, y: this.currentY, z: this.currentZ });
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

      if (this.selectedUiId !== null) {
        CVATBridge.centerCanvas3DOnTrack(this.selectedUiId, { x: this.currentX, y: this.currentY, z: this.currentZ });
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
      this.showToast("Cần active đối tượng để thao tác!", "warning");
      return;
    }

    // Phòng vệ phân lập nhãn: Căn vạch sơn chỉ áp dụng cho Ô tô
    if (this.selectedCategory !== "car") {
      this.showToast("Căn làn đường chỉ áp dụng cho Ô tô/Xe cơ giới!", "warning");
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
        if (this.selectedUiId !== null) {
          CVATBridge.centerCanvas3DOnTrack(this.selectedUiId, { x: this.currentX, y: this.currentY, z: this.currentZ });
        }
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

        if (this.selectedUiId !== null) {
          CVATBridge.centerCanvas3DOnTrack(this.selectedUiId, { x: this.currentX, y: this.currentY, z: this.currentZ });
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
   * Fit riêng Chiều Rộng W (Phím 4):
   * Tự động điều hướng theo loại đối tượng:
   * - Pedestrian: Fit vai/ngực người
   * - Cyclist: Fit tay lái / gương xe (+5cm pad)
   * - Car: Fit riêng bề rộng W (+8cm pad)
   */
  public async handleFitWidth(): Promise<void> {
    if (this.selectedCategory === "pedestrian") {
      await this.handleFitPedestrian("w");
    } else if (this.selectedCategory === "cyclist") {
      await this.handleFitCyclist("w");
    } else {
      await this.handleFitCarDimension("w");
    }
  }

  /**
   * Fit riêng Chiều Cao H (Phím 5) - CHUẨN GROUND-LOCK:
   * Mặt đáy tiếp đất bám sàn cố định tại groundZ, chiều cao nở lên nóc xe.
   * Tự động điều hướng theo loại đối tượng:
   * - Pedestrian: Fit đỉnh đầu (+12cm đệm)
   * - Cyclist: Fit nón bảo hiểm (+12cm đệm)
   * - Car: Fit nóc xe (+5cm đệm)
   */
  public async handleFitHeight(): Promise<void> {
    if (this.selectedCategory === "pedestrian") {
      await this.handleFitPedestrian("h");
    } else if (this.selectedCategory === "cyclist") {
      await this.handleFitCyclist("h");
    } else {
      await this.handleFitCarDimension("h");
    }
  }

  /**
   * Fit riêng Chiều Rộng (W) hoặc Chiều Cao (H Ground-Lock) cho Xe Ô tô (Car) hoặc đối tượng chung
   */
  public async handleFitCarDimension(dimension: "w" | "h"): Promise<void> {
    if (!this.currentCtx || !this.currentCtx.jobId) {
      this.showToast("Chưa kết nối Job CVAT!", "warning");
      return;
    }
    const activeId = await this.ensureActiveTrackSelected();
    if (!activeId) {
      this.showToast("Chưa chọn đối tượng để fit kích thước!", "warning");
      return;
    }
    if (this.isProcessing) return;

    const dimLabel = dimension === "w" ? "Rộng (W) [Phím 4]" : "Cao (H) [Phím 5 - Ground-Lock]";
    await this.pushUndoSnapshot(`Fit ${dimLabel}`, this.applyToTrack);
    this.isProcessing = true;
    this.showToast(`Đang đo mây điểm & Fit ${dimLabel}...`, "info");

    try {
      const serverId = this.selectedServerId || activeId;
      const res = await CVATBridge.fitDimension(
        this.currentCtx.jobId,
        activeId,
        serverId,
        dimension,
        this.applyToTrack
      );

      if (res.success) {
        if (res.newW !== undefined) {
          this.currentW = res.newW;
          this.editW = res.newW;
        }
        if (res.newH !== undefined) {
          this.currentH = res.newH;
          this.editH = res.newH;
        }
        if (res.newX !== undefined) this.currentX = res.newX;
        if (res.newY !== undefined) this.currentY = res.newY;
        if (res.newZ !== undefined) this.currentZ = res.newZ;

        const targetItem = this.frameTracks.find((t) => t.uiId === activeId);
        if (targetItem) {
          if (res.newW !== undefined) targetItem.w = res.newW;
          if (res.newH !== undefined) targetItem.h = res.newH;
          if (res.newX !== undefined) targetItem.x = res.newX;
          if (res.newY !== undefined) targetItem.y = res.newY;
          if (res.newZ !== undefined) targetItem.z = res.newZ;
        }

        const inputW = this.container?.querySelector<HTMLInputElement>("#input-dim-w");
        const inputH = this.container?.querySelector<HTMLInputElement>("#input-dim-h");
        if (inputW && res.newW !== undefined) inputW.value = String(res.newW);
        if (inputH && res.newH !== undefined) inputH.value = String(res.newH);

        this.showToast(res.message, "success");
        this.scheduleUpdate();
      } else {
        this.showToast(res.message, "error");
      }
    } catch (err: any) {
      this.showToast(`Lỗi fit ${dimLabel}: ${err.message || String(err)}`, "error");
    } finally {
      this.isProcessing = false;
      this.updateContent();
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
      this.showToast("Cần active đối tượng để thao tác!", "warning");
      return;
    }

    // Phòng vệ phân lập nhãn: Chỉ áp dụng khi đối tượng là Người đi bộ
    if (this.selectedCategory !== "pedestrian") {
      this.showToast("Fit Người chỉ áp dụng cho nhãn Người đi bộ!", "warning");
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
      this.showToast("Cần active đối tượng để thao tác!", "warning");
      return;
    }

    // Phòng vệ phân lập nhãn: Chỉ áp dụng cho Xe 2 bánh (Cyclist)
    if (this.selectedCategory !== "cyclist") {
      this.showToast("Fit Xe 2 bánh chỉ áp dụng cho nhãn Xe 2 bánh (Cyclist)!", "warning");
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
      this.showToast("Cần active đối tượng để thao tác!", "warning");
      return;
    }

    // Phòng vệ phân lập nhãn: Catalog xe chỉ áp dụng cho Ô tô/Xe cơ giới
    if (this.selectedCategory !== "car") {
      this.showToast("Catalog kích thước chỉ áp dụng cho Ô tô/Xe cơ giới!", "warning");
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

  /**
   * Render nội dung Tab QC (Quick Focus Mode) trên Floating Panel
   */
  private renderQCTabContent(): string {
    const openModalBtnHtml = `
      <button id="btn-open-qc-studio-modal" style="
        width: 100%;
        padding: 9px 12px;
        background: linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%);
        border: 1px solid #bfdbfe;
        border-radius: 8px;
        color: #1d4ed8;
        font-size: 11.5px;
        font-weight: 700;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        transition: all 0.15s ease;
      ">
        <span style="display: flex; align-items: center;">${ICONS.matrix}</span>
        <span>Mở QC Studio Toàn Màn Hình</span>
        <span style="display: flex; align-items: center; opacity: 0.7;">${ICONS.externalLink}</span>
      </button>
    `;

    if (this.selectedUiId === null) {
      return `
        <div style="display: flex; flex-direction: column; gap: 10px;">
          ${openModalBtnHtml}

          <div style="
            background: #ffffff;
            border: 1px dashed #cbd5e1;
            border-radius: 10px;
            padding: 24px 16px;
            text-align: center;
            color: #64748b;
          ">
            <div style="margin-bottom: 8px; color: #94a3b8; display: flex; justify-content: center;">
              ${ICONS.target}
            </div>
            <div style="font-size: 12px; font-weight: 600; color: #334155; margin-bottom: 4px;">
              Chưa chọn đối tượng để kiểm định
            </div>
            <div style="font-size: 11px; line-height: 1.5;">
              Vui lòng nhấp chọn bất kỳ box 3D nào trên Canvas hoặc chọn từ Dropdown để xem báo cáo sức khỏe tức thì.
            </div>
          </div>
        </div>
      `;
    }

    // Tạo đối tượng hiện tại
    const curObj: QCObjectInstance = {
      frame: this.currentFrameNumber,
      trackId: this.selectedUiId,
      label: this.currentLabel,
      group: classifyLabelGroup(this.currentLabel, this.qcEngine.getConfig()),
      x: this.currentX,
      y: this.currentY,
      z: this.currentZ,
      yaw: (this.currentYawDeg * Math.PI) / 180,
      yawDeg: this.currentYawDeg,
      l: this.currentL,
      w: this.currentW,
      h: this.currentH,
    };

    // Danh sách các đối tượng khác trong cùng frame
    const currentFrameObjects: QCObjectInstance[] = this.frameTracks.map((t) => ({
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

    // Chạy bộ kiểm tra tức thì
    const summary = this.qcEngine.checkSingleObject(curObj, [curObj], currentFrameObjects);

    const isClean = summary.overallStatus === "clean";
    const isError = summary.overallStatus === "error";

    const statusBg = isClean ? "#ecfdf5" : isError ? "#fef2f2" : "#fffbeb";
    const statusBorder = isClean ? "#a7f3d0" : isError ? "#fecaca" : "#fef08a";
    const statusText = isClean ? "#059669" : isError ? "#dc2626" : "#d97706";
    const statusTitle = isClean
      ? "✓ ĐẠT CHUẨN KIỂM ĐỊNH"
      : isError
      ? `✖ CÓ ${summary.issues.length} LỖI CẦN SỬA`
      : `⚠ CÓ ${summary.issues.length} CẢNH BÁO`;

    // Render danh sách tiêu chí kiểm tra
    const renderCheckItem = (code: string, name: string, chk: any) => {
      const ok = chk.passed;
      const color = ok ? "#059669" : chk.severity === "error" ? "#dc2626" : "#d97706";
      const bg = ok ? "#f0fdf4" : chk.severity === "error" ? "#fef2f2" : "#fffbeb";
      const icon = ok ? "✓" : chk.severity === "error" ? "✖" : "⚠";

      return `
        <div style="
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 5px 8px;
          border-radius: 6px;
          background: ${bg};
          border: 1px solid ${color}20;
          font-size: 11px;
        ">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-weight: 700; color: ${color}; font-family: monospace;">[${code}]</span>
            <span style="color: #334155; font-weight: 500;">${name}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 4px; color: ${color}; font-weight: 600; font-size: 10px;">
            <span>${icon}</span>
            <span>${ok ? "Đạt" : "Chưa đạt"}</span>
          </div>
        </div>
      `;
    };

    // Render chi tiết lỗi nếu có
    let issuesDetailHtml = "";
    if (summary.issues.length > 0) {
      issuesDetailHtml = `
        <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 4px;">
          <div style="font-size: 11px; font-weight: 700; color: #475569;">Chi tiết cảnh báo & lỗi:</div>
          ${summary.issues
            .map(
              (iss) => `
            <div style="
              padding: 6px 8px;
              border-radius: 6px;
              background: ${iss.severity === "error" ? "#fef2f2" : "#fffbeb"};
              border: 1px solid ${iss.severity === "error" ? "#fca5a5" : "#fde047"};
              font-size: 10.5px;
              color: #0f172a;
              display: flex;
              flex-direction: column;
              gap: 2px;
            ">
              <div style="display: flex; justify-content: space-between; font-weight: 700; color: ${iss.severity === "error" ? "#dc2626" : "#b45309"};">
                <span>[${iss.symbol}] ${iss.name}</span>
                <span style="font-family: monospace;">${iss.value}</span>
              </div>
              <div style="color: #475569; font-size: 10px;">${iss.detail}</div>
              <div style="color: #64748b; font-size: 9.5px; font-family: monospace;">Chuẩn: ${iss.ref}</div>
            </div>
          `
            )
            .join("")}
        </div>
      `;
    }

    return `
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <!-- NÚT MỞ TOÀN MÀN HÌNH -->
        ${openModalBtnHtml}

        <!-- THẺ TỔNG HỢP SỨC KHỎE OBJECT ĐANG CHỌN -->
        <div style="
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        ">
          <!-- HEADER THẺ: ID & TRẠNG THÁI TỔNG THỂ -->
          <div style="
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 6px 10px;
            border-radius: 6px;
            background: ${statusBg};
            border: 1px solid ${statusBorder};
          ">
            <div style="font-weight: 700; font-size: 12px; color: ${statusText};">
              #${this.selectedUiId} · ${this.currentLabel}
            </div>
            <div style="font-size: 10.5px; font-weight: 700; color: ${statusText};">
              ${statusTitle}
            </div>
          </div>

          <!-- THÔNG SỐ HIỆN TẠI -->
          <div style="
            display: flex;
            justify-content: space-between;
            padding: 4px 6px;
            background: #f8fafc;
            border-radius: 6px;
            font-size: 10px;
            font-family: monospace;
            color: #64748b;
          ">
            <span>Size: ${this.currentL.toFixed(2)}x${this.currentW.toFixed(2)}x${this.currentH.toFixed(2)}m</span>
            <span>Z: ${this.currentZ.toFixed(2)}m</span>
            <span>Yaw: ${this.currentYawDeg.toFixed(0)}°</span>
          </div>

          <!-- BẢNG TIÊU CHÍ KIỂM TRA -->
          <div style="display: flex; flex-direction: column; gap: 4px;">
            ${renderCheckItem("S", "Scale Toàn Track", summary.checks.scale)}
            ${renderCheckItem("K", "Kích Thước Catalog", summary.checks.size)}
            ${renderCheckItem("Z", "Cao Độ Mặt Đường", summary.checks.z)}
            ${renderCheckItem("H", "Hướng Đầu Xe (Yaw)", summary.checks.rot)}
            ${renderCheckItem("O", "Chồng Lấn BEV", summary.checks.overlap)}
            ${renderCheckItem("D", "Khoảng Cách LiDAR", summary.checks.dist)}
            ${renderCheckItem("L", "Mây Điểm LiDAR Thực", summary.checks.empty_box)}
          </div>

          <!-- CHI TIẾT CẢNH BÁO / LỖI NẾU CÓ -->
          ${issuesDetailHtml}
        </div>
      </div>
    `;
  }

  private updateContent(): void {
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
          const badgeColor = t.color || "#3b82f6";
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
                <span style="font-weight: 700; color: ${isSelected ? "#059669" : "#64748b"}; font-size: 11px;">#${t.uiId}</span>
                <span style="
                  display: inline-flex;
                  align-items: center;
                  gap: 4px;
                  padding: 1px 6px;
                  border-radius: 4px;
                  background: ${badgeColor}18;
                  border: 1px solid ${badgeColor}40;
                  color: ${badgeColor};
                  font-weight: 600;
                  font-size: 10px;
                ">
                  <span style="width: 5px; height: 5px; border-radius: 50%; background: ${badgeColor}; display: inline-block;"></span>
                  ${t.label}
                </span>
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
          <span id="floating-badge-view" title="Khung nhìn đang active. Giữ Shift + WASD để vi chỉnh 2cm theo màn hình (Chỉ Frame Hiện Tại)" style="
            display: inline-flex;
            align-items: center;
            gap: 3px;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 9.5px;
            font-weight: 700;
            font-family: ui-monospace, monospace;
            background: ${viewBg};
            border: 1px solid ${viewBorder};
            color: ${viewColor};
            cursor: pointer;
            transition: all 0.12s;
          ">${viewText}</span>
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
          <button id="floating-btn-help" title="Bảng tra cứu phím tắt (?)" style="
            background: transparent;
            border: none;
            color: #64748b;
            cursor: pointer;
            padding: 3px;
            border-radius: 4px;
            display: flex;
            align-items: center;
          ">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
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

      <!-- DẢI SUB-HEADER THỐNG KÊ TRACK ID (CỤM TIÊU ĐỀ) -->
      ${this.renderTrackStatsSubHeader()}

      <!-- MAIN TABS SWITCHER: EDIT vs QC -->
      <div style="
        display: flex;
        gap: 4px;
        background: #f1f5f9;
        padding: 3px;
        border-radius: 8px;
        margin: 6px 10px 0 10px;
        border: 1px solid #e2e8f0;
      ">
        <button id="main-tab-edit" style="
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 5px 0;
          border-radius: 6px;
          border: none;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.12s;
          background: ${this.activeMainTab === "edit" ? "#ffffff" : "transparent"};
          color: ${this.activeMainTab === "edit" ? "#0f172a" : "#64748b"};
          box-shadow: ${this.activeMainTab === "edit" ? "0 1px 2px rgba(0,0,0,0.06)" : "none"};
        ">
          <span style="display: flex;">${ICONS.box}</span>
          <span>Chỉnh Sửa</span>
        </button>
        <button id="main-tab-qc" style="
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 5px 0;
          border-radius: 6px;
          border: none;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.12s;
          background: ${this.activeMainTab === "qc" ? "#ffffff" : "transparent"};
          color: ${this.activeMainTab === "qc" ? "#dc2626" : "#64748b"};
          box-shadow: ${this.activeMainTab === "qc" ? "0 1px 2px rgba(0,0,0,0.06)" : "none"};
        ">
          <span style="display: flex;">${ICONS.shieldCheck}</span>
          <span>Kiểm Tra QC</span>
        </button>
      </div>

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
        ${this.activeMainTab === "qc" ? this.renderQCTabContent() : `
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
                <span style="font-weight: 600; font-size: 11px; color: #09090b;">${this.selectedUiId ? this.currentLabel : "Chưa active đối tượng"}</span>
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

            <!-- NÚT GHIM TÂM KHI TUA FRAME (LOCK-ON CAMERA TRACKING) -->
            <button id="btn-toggle-auto-center" title="Tự động ghim đối tượng đang chọn ở chính giữa màn hình khi tua frame. Nhấn để Bật/Tắt." style="
              background: ${this.autoCenterOnFrame ? "#ecfdf5" : "#ffffff"};
              border: 1px solid ${this.autoCenterOnFrame ? "#a7f3d0" : "#e2e8f0"};
              color: ${this.autoCenterOnFrame ? "#047857" : "#64748b"};
              padding: 6px 8px;
              border-radius: 6px;
              cursor: pointer;
              display: flex;
              align-items: center;
              gap: 4px;
              font-size: 11px;
              font-weight: 600;
              transition: all 0.12s;
              box-shadow: ${this.autoCenterOnFrame ? "0 1px 2px rgba(16, 185, 129, 0.12)" : "none"};
              white-space: nowrap;
            ">
              <span style="display: flex; align-items: center; color: ${this.autoCenterOnFrame ? "#10b981" : "#94a3b8"};">
                ${ICONS.target}
              </span>
              <span>${this.autoCenterOnFrame ? "Ghim" : "Tự do"}</span>
            </button>
          </div>

          <!-- CỤM ĐIỀU KHIỂN MÀU MÂY ĐIỂM LIDAR (INTENSITY VS PLAIN & ĐIỂM XE BỌC) -->
          <div style="
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 6px;
            background: #f8fafc;
            padding: 4px 8px;
            border-radius: 7px;
            border: 1px solid #e2e8f0;
            font-size: 11px;
          ">
            <div style="display: flex; align-items: center; gap: 4px; font-weight: 600; color: #475569;">
              <span style="display: flex; align-items: center; color: #64748b;">${ICONS.eye}</span>
              <span>Màu Point:</span>
            </div>

            <div style="display: flex; align-items: center; gap: 4px;">
              <!-- NÚT CHUYỂN ĐỔI CHẾ ĐỘ MÀU: INTENSITY VS PLAIN -->
              <button id="btn-toggle-point-color-mode" title="Chuyển đổi giữa chế độ Độ phản xạ (Intensity - Soi vạch sơn, biển báo) và Màu phẳng không xét intensity (Plain - Rõ khối 3D)" style="
                background: ${this.pointColorMode === "intensity" ? "#eff6ff" : "#ffffff"};
                border: 1px solid ${this.pointColorMode === "intensity" ? "#93c5fd" : "#cbd5e1"};
                color: ${this.pointColorMode === "intensity" ? "#1d4ed8" : "#475569"};
                padding: 3px 7px;
                border-radius: 5px;
                cursor: pointer;
                font-size: 10px;
                font-weight: 600;
                display: flex;
                align-items: center;
                gap: 3px;
                transition: all 0.12s;
              ">
                <span>${this.pointColorMode === "intensity" ? "⚡ Intensity" : "⚪ Plain"}</span>
              </button>

              <!-- NÚT TOGGLE NHUỘM MÀU XE BỌC -->
              <button id="btn-toggle-colorize-boxed" title="Bật/Tắt nhuộm màu riêng cho các điểm LiDAR nằm trong 3D Box (Tự động áp dụng bền vững cho TOÀN BỘ FRAME)" style="
                background: ${this.colorizeBoxedPoints ? "#ecfdf5" : "#ffffff"};
                border: 1px solid ${this.colorizeBoxedPoints ? "#a7f3d0" : "#cbd5e1"};
                color: ${this.colorizeBoxedPoints ? "#047857" : "#64748b"};
                padding: 3px 7px;
                border-radius: 5px;
                cursor: pointer;
                font-size: 10px;
                font-weight: 600;
                display: flex;
                align-items: center;
                gap: 3px;
                transition: all 0.12s;
              ">
                <span>📦 Xe bọc: ${this.colorizeBoxedPoints ? "BẬT" : "TẮT"}</span>
              </button>

              <!-- NÚT TOGGLE MẶT SÀN POLYGON 3D MỜ (MẶT ĐƯỜNG & VỈA HÈ) -->
              <button id="btn-toggle-ground-plane" title="Bật/Tắt hiển thị Mặt Sàn Polygon 3D Mờ (Mặt đường & Vỉa hè) giúp annotator dễ thấy đáy xe có chạm sàn" style="
                background: ${this.groundPlaneVisible ? "#f0fdf4" : "#ffffff"};
                border: 1px solid ${this.groundPlaneVisible ? "#86efac" : "#cbd5e1"};
                color: ${this.groundPlaneVisible ? "#15803d" : "#64748b"};
                padding: 3px 7px;
                border-radius: 5px;
                cursor: pointer;
                font-size: 10px;
                font-weight: 600;
                display: flex;
                align-items: center;
                gap: 3px;
                transition: all 0.12s;
              ">
                <span>🛣️ Sàn: ${this.groundPlaneVisible ? "BẬT" : "TẮT"}</span>
              </button>
            </div>
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

          ${
            this.selectedUiId === null
              ? `
            <!-- KHỐI THÔNG BÁO INACTIVE STATE: ẨN TOÀN BỘ CHỨC NĂNG KHI CHƯA ACTIVE -->
            <div style="
              background: #f8fafc;
              border: 1.5px dashed #cbd5e1;
              border-radius: 10px;
              padding: 24px 14px;
              text-align: center;
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 10px;
              margin-top: 4px;
            ">
              <div style="
                width: 44px;
                height: 44px;
                border-radius: 50%;
                background: #eff6ff;
                border: 1px solid #bfdbfe;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #2563eb;
              ">
                ${ICONS.target}
              </div>
              <div style="display: flex; flex-direction: column; gap: 4px;">
                <span style="font-weight: 700; font-size: 13px; color: #0f172a;">Cần active đối tượng để thao tác</span>
                <span style="font-size: 11px; color: #64748b; line-height: 1.5; max-width: 280px;">
                  Vui lòng click vào 1 Box 3D trên màn hình hoặc chọn từ danh sách Sidebar để mở khóa các công cụ căn chỉnh.
                </span>
              </div>

              ${
                this.frameTracks.length > 0
                  ? `
                <div style="margin-top: 6px; width: 100%; max-width: 270px;">
                  <span style="font-size: 10px; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 5px;">Hoặc chọn trong Frame (${this.frameTracks.length} đối tượng):</span>
                  <div style="display: flex; flex-direction: column; gap: 4px; max-height: 130px; overflow-y: auto;">
                    ${this.frameTracks
                      .map(
                        (t) => `
                      <button class="btn-quick-select-track" data-uiid="${t.uiId}" style="
                        background: #ffffff;
                        border: 1px solid #e2e8f0;
                        padding: 5px 8px;
                        border-radius: 6px;
                        font-size: 11px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        color: #1e293b;
                        transition: all 0.12s;
                      ">
                        <span style="font-weight: 700; color: #059669;">#${t.uiId}</span>
                        <span style="font-weight: 500;">${t.label}</span>
                        <span style="font-size: 9.5px; color: #64748b; font-family: monospace;">Z: ${t.z}m</span>
                      </button>
                    `
                      )
                      .join("")}
                  </div>
                </div>
              `
                  : ""
              }
            </div>
          `
              : `
            <!-- PHÂN LOẠI ĐỐI TƯỢNG (HIỂN THỊ RÕ NHÃN & CATEGORY) -->
            <div style="
              display: flex;
              align-items: center;
              justify-content: space-between;
              background: #f1f5f9;
              padding: 5px 8px;
              border-radius: 7px;
              border: 1px solid #e2e8f0;
            ">
              <span style="font-size: 10px; color: #64748b; font-weight: 600; text-transform: uppercase;">Loại đối tượng:</span>
              <div style="
                display: inline-flex;
                align-items: center;
                gap: 5px;
                padding: 2px 8px;
                border-radius: 5px;
                font-size: 11px;
                font-weight: 700;
                background: ${this.selectedCategory === "car" ? "#ecfdf5" : this.selectedCategory === "pedestrian" ? "#faf5ff" : "#fffbeb"};
                border: 1px solid ${this.selectedCategory === "car" ? "#a7f3d0" : this.selectedCategory === "pedestrian" ? "#d8b4fe" : "#fcd34d"};
                color: ${this.selectedCategory === "car" ? "#047857" : this.selectedCategory === "pedestrian" ? "#6b21a8" : "#b45309"};
              ">
                <span style="display: flex; align-items: center;">${this.selectedCategory === "car" ? ICONS.car : this.selectedCategory === "pedestrian" ? ICONS.user : ICONS.bicycle}</span>
                <span>${this.selectedCategory === "car" ? "Ô tô / Xe cơ giới" : this.selectedCategory === "pedestrian" ? "Người đi bộ" : "Xe 2 bánh (Cyclist)"}</span>
              </div>
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
          `
          }
        </div>

        ${
          this.selectedUiId !== null
            ? `
          <!-- KHỐI 2: ĐIỀU KHIỂN CĂN CHỈNH 2D/3D & THAO TÁC NHANH (PHÂN LẬP THEO NHÃN) -->
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

            <!-- THANH 2 NÚT TÁCH BIỆT CHO CAR: FIT RỘNG (W) & FIT CAO (H GROUND-LOCK) -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px;">
              <!-- 1. NÚT FIT RỘNG W -->
              <button id="btn-fit-car-w" title="Tự động đo mây điểm và fit riêng chiều rộng W (bám khít 2 sườn xe +8cm đệm), giữ nguyên L, H và Z (Phím 4)" style="
                background: #faf5ff;
                border: 1px solid #d8b4fe;
                color: #7e22ce;
                padding: 6px 8px;
                border-radius: 7px;
                font-size: 10px;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 2px;
                transition: all 0.12s;
                box-shadow: 0 1px 2px rgba(0,0,0,0.03);
              ">
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                  <span style="display: flex; align-items: center; gap: 4px; font-weight: 700;">
                    ${ICONS.sparkles}
                    <span>Fit Rộng (W)</span>
                  </span>
                  <kbd style="font-size: 8.5px; font-family: monospace; background: #ffffff; padding: 1px 4px; border-radius: 3px; border: 1px solid #e9d5ff; color: #7e22ce;">4</kbd>
                </div>
                <span style="font-size: 8.5px; opacity: 0.85;">+8cm đệm vỏ</span>
              </button>

              <!-- 2. NÚT FIT CAO H -->
              <button id="btn-fit-car-h" title="Tự động đo mây điểm nóc xe và fit riêng chiều cao H (Mặt đáy tiếp đất bám sàn cố định tại groundZ, nở lên nóc xe +5cm), giữ nguyên L, W và XY (Phím 5)" style="
                background: #fff7ed;
                border: 1px solid #fdba74;
                color: #c2410c;
                padding: 6px 8px;
                border-radius: 7px;
                font-size: 10px;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 2px;
                transition: all 0.12s;
                box-shadow: 0 1px 2px rgba(0,0,0,0.03);
              ">
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                  <span style="display: flex; align-items: center; gap: 4px; font-weight: 700;">
                    ${ICONS.arrowUpDown}
                    <span>Fit Cao (H)</span>
                  </span>
                  <kbd style="font-size: 8.5px; font-family: monospace; background: #ffffff; padding: 1px 4px; border-radius: 3px; border: 1px solid #fed7aa; color: #c2410c;">5</kbd>
                </div>
                <span style="font-size: 8.5px; opacity: 0.85;">Ground-Lock nở nóc</span>
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
              <button id="btn-fit-cyclist-w" title="Tự động đo mây điểm và fit riêng chiều rộng W (bắt trọn gương chiếu hậu, tay lái, đệm +5cm mỗi bên), giữ nguyên L, H và Z (Phím 4)" style="
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
                justify-content: space-between;
                gap: 4px;
                transition: all 0.12s;
                box-shadow: 0 1px 2px rgba(0,0,0,0.03);
              ">
                <span style="display: flex; align-items: center; gap: 4px;">
                  <span style="display: flex; align-items: center; color: #d97706;">${ICONS.sparkles}</span>
                  <span>Fit Rộng (W)</span>
                </span>
                <kbd style="font-size: 8.5px; font-family: monospace; background: #ffffff; padding: 1px 4px; border-radius: 3px; border: 1px solid #fde68a; color: #b45309;">4</kbd>
              </button>

              <!-- 2. NÚT FIT CAO H -->
              <button id="btn-fit-cyclist-h" title="Tự động đo đỉnh nón bảo hiểm và fit riêng chiều cao H (Mặt đáy tiếp đất giữ nguyên cố định 100%, nở lên nóc +12cm), giữ nguyên L, W và XY (Phím 5)" style="
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
                justify-content: space-between;
                gap: 4px;
                transition: all 0.12s;
                box-shadow: 0 1px 2px rgba(0,0,0,0.03);
              ">
                <span style="display: flex; align-items: center; gap: 4px;">
                  <span style="display: flex; align-items: center; color: #ea580c;">${ICONS.arrowUpDown}</span>
                  <span>Fit Cao (H)</span>
                </span>
                <kbd style="font-size: 8.5px; font-family: monospace; background: #ffffff; padding: 1px 4px; border-radius: 3px; border: 1px solid #fed7aa; color: #c2410c;">5</kbd>
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
              <button id="btn-fit-ped-w" title="Tự động đo và co giãn riêng Chiều Rộng W ôm vai/ngực (giữ nguyên L, H & Z) (Phím 4)" style="
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
                justify-content: space-between;
                gap: 2px;
                transition: all 0.12s;
                box-shadow: 0 1px 2px rgba(0,0,0,0.03);
              ">
                <span style="display: flex; align-items: center; gap: 2px;">
                  <span style="display: flex; align-items: center; color: #9333ea;">${ICONS.sparkles}</span>
                  <span>Fit Rộng</span>
                </span>
                <kbd style="font-size: 8px; font-family: monospace; background: #ffffff; padding: 1px 3px; border-radius: 3px; border: 1px solid #e9d5ff; color: #7e22ce;">4</kbd>
              </button>

              <!-- 3. NÚT FIX CAO H -->
              <button id="btn-fit-ped-h" title="Tự động đo đỉnh đầu và fit riêng Chiều Cao H (Đáy tiếp đất giữ nguyên cố định, đỉnh đầu nở lên +12cm), giữ nguyên L, W và XY (Phím 5)" style="
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
                justify-content: space-between;
                gap: 2px;
                transition: all 0.12s;
                box-shadow: 0 1px 2px rgba(0,0,0,0.03);
              ">
                <span style="display: flex; align-items: center; gap: 2px;">
                  <span style="display: flex; align-items: center; color: #ea580c;">${ICONS.arrowUpDown}</span>
                  <span>Fit Cao</span>
                </span>
                <kbd style="font-size: 8px; font-family: monospace; background: #ffffff; padding: 1px 3px; border-radius: 3px; border: 1px solid #fed7aa; color: #c2410c;">5</kbd>
              </button>
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
            <button id="btn-quick-ground" title="Tự động nhận diện mặt đường, vỉa hè & gác lề. Chưa đủ điểm tự fit theo Ego (Phím G)" style="
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
            <button id="btn-snap-ground-track" title="Tự động ghim đất & vỉa hè cho TẤT CẢ các frame theo Track ID #${this.selectedUiId !== null ? this.selectedUiId : 'N/A'} (Phím Shift+G)" style="
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

          <!-- CẶP NÚT ẨN / HIỆN TOÀN TRACK -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
            <!-- NÚT ẨN TOÀN TRACK (OUTSIDE) -->
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
              <span style="display: flex; align-items: center; gap: 4px;">
                <span style="display: flex; align-items: center;">${ICONS.eyeOff}</span>
                <span>Ẩn Toàn Track</span>
              </span>
              <kbd style="font-size: 8.5px; font-family: monospace; background: #ffffff; border: 1px solid #fecdd3; padding: 1px 4px; border-radius: 3px; color: #e11d48;">⇧O</kbd>
            </button>

            <!-- NÚT HIỆN TOÀN TRACK (INSIDE) -->
            <button id="btn-inside-entire-track" title="Đánh dấu Inside (hiện lại) cho toàn bộ frame của Track này (Shift+I)" style="
              width: 100%;
              background: #ecfdf5;
              border: 1px solid #a7f3d0;
              color: #059669;
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
              <span style="display: flex; align-items: center; gap: 4px;">
                <span style="display: flex; align-items: center;">${ICONS.eye}</span>
                <span>Hiện Toàn Track</span>
              </span>
              <kbd style="font-size: 8.5px; font-family: monospace; background: #ffffff; border: 1px solid #a7f3d0; padding: 1px 4px; border-radius: 3px; color: #059669;">⇧I</kbd>
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
        ` : ""
        }

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
        `}
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
      tabQcBtn.addEventListener("click", () => {
        if (this.activeMainTab !== "qc") {
          this.activeMainTab = "qc";
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

    // Nút Fit riêng W và H cho Xe Ô tô (Car)
    const fitCarWBtn = this.container.querySelector("#btn-fit-car-w");
    if (fitCarWBtn) fitCarWBtn.addEventListener("click", () => this.handleFitWidth());

    const fitCarHBtn = this.container.querySelector("#btn-fit-car-h");
    if (fitCarHBtn) fitCarHBtn.addEventListener("click", () => this.handleFitHeight());

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

    // 7e. Gắn sự kiện Bật/Tắt Mặt Sàn Polygon 3D Mờ (Mặt đường & Vỉa hè)
    const groundPlaneBtn = this.container.querySelector("#btn-toggle-ground-plane");
    if (groundPlaneBtn) {
      groundPlaneBtn.addEventListener("click", async () => {
        this.groundPlaneVisible = !this.groundPlaneVisible;
        localStorage.setItem("cvat_3d_ground_plane_visible", String(this.groundPlaneVisible));
        await CVATBridge.setGroundPlaneVisible(this.groundPlaneVisible);
        this.showToast(
          `Đã ${this.groundPlaneVisible ? "BẬT" : "TẮT"} mặt sàn polygon mờ (Đường & Vỉa hè)`,
          this.groundPlaneVisible ? "success" : "info"
        );
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
    if (this.isHelpModalOpen) {
      if (this.helpModalContainer && this.helpModalContainer.parentNode) {
        this.helpModalContainer.parentNode.removeChild(this.helpModalContainer);
      }
      this.helpModalContainer = null;
      this.isHelpModalOpen = false;
      return;
    }

    this.isHelpModalOpen = true;
    this.helpModalContainer = document.createElement("div");
    this.helpModalContainer.id = "cvat-3d-suite-hotkeys-modal";
    this.helpModalContainer.style.position = "fixed";
    this.helpModalContainer.style.top = "0";
    this.helpModalContainer.style.left = "0";
    this.helpModalContainer.style.width = "100vw";
    this.helpModalContainer.style.height = "100vh";
    this.helpModalContainer.style.backgroundColor = "rgba(15, 23, 42, 0.55)";
    this.helpModalContainer.style.backdropFilter = "blur(6px)";
    this.helpModalContainer.style.zIndex = "1000000";
    this.helpModalContainer.style.display = "flex";
    this.helpModalContainer.style.alignItems = "center";
    this.helpModalContainer.style.justifyContent = "center";
    this.helpModalContainer.style.userSelect = "none";
    this.helpModalContainer.style.fontFamily = "ui-sans-serif, system-ui, -apple-system, sans-serif";

    this.helpModalContainer.innerHTML = `
      <div style="
        background: #ffffff;
        border-radius: 16px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        border: 1px solid #e2e8f0;
        width: 92%;
        max-width: 660px;
        max-height: 88vh;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        color: #0f172a;
      ">
        <!-- HEADER -->
        <div style="
          padding: 14px 18px;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #f8fafc;
          border-radius: 16px 16px 0 0;
        ">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 16px;">⌨️</span>
            <div>
              <div style="font-size: 13px; font-weight: 700; color: #0f172a;">BẢNG PHÍM TẮT SPEEDRUN (TAY TRÁI SIÊU TỐC)</div>
              <div style="font-size: 10px; color: #64748b;">Tay phải giữ nguyên chuột 3D · 100% phím bấm nằm gọn ở bàn tay trái</div>
            </div>
          </div>
          <button id="btn-close-help-modal" style="
            background: transparent;
            border: none;
            color: #64748b;
            cursor: pointer;
            font-size: 16px;
            padding: 4px 8px;
            border-radius: 6px;
          ">✕</button>
        </div>

        <!-- CONTENT MATRIX -->
        <div style="padding: 14px 18px; display: flex; flex-direction: column; gap: 12px; font-size: 11px;">
          <!-- HÀNG 1: 3 CHIỀU & HƯỚNG XE -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <!-- CỘT 1 -->
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 6px;">
              <div style="font-weight: 700; color: #0f766e; font-size: 11px; margin-bottom: 2px;">🎯 CĂN CHỈNH 3 CHIỀU & FIT SIZE</div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Căn TOP (Yaw & Nóc quanh tâm)</span>
                <div><kbd style="background: #f0fdfa; border: 1px solid #99f6e4; color: #0f766e; padding: 1px 5px; border-radius: 4px; font-weight: 700;">1</kbd> / <kbd style="background: #f0fdfa; border: 1px solid #99f6e4; color: #0f766e; padding: 1px 5px; border-radius: 4px; font-weight: 700;">T</kbd></div>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Căn SIDE (Cản trước/sau trục X)</span>
                <kbd style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; padding: 1px 5px; border-radius: 4px; font-weight: 700;">2</kbd>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Căn FRONT (Sườn ngang W, giữ Z)</span>
                <kbd style="background: #faf5ff; border: 1px solid #e9d5ff; color: #7e22ce; padding: 1px 5px; border-radius: 4px; font-weight: 700;">3</kbd>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Fit Rộng (W) [Mọi đối tượng]</span>
                <kbd style="background: #faf5ff; border: 1px solid #d8b4fe; color: #7e22ce; padding: 1px 5px; border-radius: 4px; font-weight: 700;">4</kbd>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Fit Cao (H) [Ground-Lock nở nóc]</span>
                <kbd style="background: #fff7ed; border: 1px solid #fdba74; color: #c2410c; padding: 1px 5px; border-radius: 4px; font-weight: 700;">5</kbd>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Căn giữa (Center / Focus) xe đang chọn</span>
                <kbd style="background: #ecfdf5; border: 1px solid #a7f3d0; color: #047857; padding: 1px 6px; border-radius: 4px; font-weight: 700;">Z</kbd>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed #cbd5e1; padding-top: 4px; margin-top: 2px;">
                <span style="font-weight: 600; color: #64748b; font-size: 10px;">Nguyên tắc Front/Side/Fit H</span>
                <span style="font-size: 9.5px; color: #059669; font-weight: 600;">Khóa Z & Đáy Bám Sàn</span>
              </div>
            </div>

            <!-- CỘT 2 -->
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 6px;">
              <div style="font-weight: 700; color: #1d4ed8; font-size: 11px; margin-bottom: 2px;">🛣️ HƯỚNG XE, LÀN ĐƯỜNG & YAW</div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Căn theo Vạch Kẻ Làn Đường 3D</span>
                <kbd style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; padding: 1px 6px; border-radius: 4px; font-weight: 700;">L</kbd>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Lật ngược đầu xe 180° (Frame này)</span>
                <kbd style="background: #ffffff; border: 1px solid #cbd5e1; color: #0f172a; padding: 1px 6px; border-radius: 4px; font-weight: 700;">F</kbd>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Lật ngược đầu xe (Toàn bộ Track)</span>
                <kbd style="background: #ffffff; border: 1px solid #cbd5e1; color: #0f172a; padding: 1px 5px; border-radius: 4px; font-weight: 700;">Shift+F</kbd>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Vi chỉnh Xoay Trái / Phải ±1°</span>
                <div><kbd style="background: #ffffff; border: 1px solid #cbd5e1; padding: 1px 5px; border-radius: 4px;">Q</kbd> / <kbd style="background: #ffffff; border: 1px solid #cbd5e1; padding: 1px 5px; border-radius: 4px;">E</kbd></div>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Xoay nhanh Trái / Phải ±5°</span>
                <div><kbd style="background: #ffffff; border: 1px solid #cbd5e1; padding: 1px 4px; border-radius: 4px;">Shift+Q/E</kbd></div>
              </div>
            </div>
          </div>

          <!-- HÀNG 2: MẶT ĐẤT & ĐIỀU HƯỚNG -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <!-- CỘT 3 -->
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 6px;">
              <div style="font-weight: 700; color: #b45309; font-size: 11px; margin-bottom: 2px;">⛰️ MẶT ĐẤT, VỈA HÈ & DỐC (TỰ ĐỘNG)</div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Ghim Đất (Tự nhận diện vỉa hè/gác lề)</span>
                <kbd style="background: #fef3c7; border: 1px solid #fde68a; color: #92400e; padding: 1px 6px; border-radius: 4px; font-weight: 700;">G</kbd>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Ghim Đất & Vỉa Hè Toàn Bộ Track</span>
                <kbd style="background: #fef3c7; border: 1px solid #fde68a; color: #92400e; padding: 1px 5px; border-radius: 4px; font-weight: 700;">Shift+G</kbd>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Đặt lại Dốc 0° (Reset phẳng hoàn toàn)</span>
                <kbd style="background: #ffffff; border: 1px solid #cbd5e1; padding: 1px 4px; border-radius: 4px;">Alt+R</kbd>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed #cbd5e1; padding-top: 4px; margin-top: 2px;">
                <span style="font-size: 9.5px; color: #64748b;">Chưa đủ điểm mặt đất</span>
                <span style="font-size: 9.5px; color: #b45309; font-weight: 600;">Fit cao & góc thẳng theo Ego</span>
              </div>
            </div>

            <!-- CỘT 4 -->
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 6px;">
              <div style="font-weight: 700; color: #4338ca; font-size: 11px; margin-bottom: 2px;">⚡ VI CHỈNH SHIFT + WASD (SCREEN SPACE)</div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Shift + A: Trái | Shift + D: Phải</span>
                <div><kbd style="background: #ecfdf5; border: 1px solid #a7f3d0; color: #047857; padding: 1px 4px; border-radius: 4px; font-weight: 700;">Shift</kbd> + <kbd style="background: #ecfdf5; border: 1px solid #a7f3d0; color: #047857; padding: 1px 4px; border-radius: 4px; font-weight: 700;">A/D</kbd></div>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Shift + W: Lên | Shift + S: Xuống</span>
                <div><kbd style="background: #ecfdf5; border: 1px solid #a7f3d0; color: #047857; padding: 1px 4px; border-radius: 4px; font-weight: 700;">Shift</kbd> + <kbd style="background: #ecfdf5; border: 1px solid #a7f3d0; color: #047857; padding: 1px 4px; border-radius: 4px; font-weight: 700;">W/S</kbd></div>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 9.5px; color: #64748b;">Bước nhảy: 2cm / lần bấm</span>
                <span style="font-size: 9px; color: #059669; font-weight: 600;">Chỉ Frame này (Không đổi cả Track)</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed #cbd5e1; padding-top: 4px; margin-top: 2px;">
                <span>Xe Liền Trước / Xe Kế Tiếp</span>
                <div><kbd style="background: #e0e7ff; border: 1px solid #c7d2fe; color: #3730a3; padding: 1px 5px; border-radius: 4px; font-weight: 700;">[</kbd> / <kbd style="background: #e0e7ff; border: 1px solid #c7d2fe; color: #3730a3; padding: 1px 5px; border-radius: 4px; font-weight: 700;">]</kbd></div>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Đổi Phạm Vi: Frame Này ⟷ Toàn Track</span>
                <div><kbd style="background: #ffffff; border: 1px solid #cbd5e1; padding: 1px 4px; border-radius: 4px;">Tab</kbd> / <kbd style="background: #ffffff; border: 1px solid #cbd5e1; padding: 1px 4px; border-radius: 4px;">X</kbd></div>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Hoàn Tác Thao Tác Vừa Làm (Pre)</span>
                <kbd style="background: #ffffff; border: 1px solid #cbd5e1; padding: 1px 4px; border-radius: 4px; font-weight: 700;">Ctrl+Z</kbd>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Ẩn / Hiện Toàn Bộ Track</span>
                <div><kbd style="background: #fff1f2; border: 1px solid #fecdd3; color: #e11d48; padding: 1px 4px; border-radius: 4px; font-weight: 700;">Shift+O</kbd> / <kbd style="background: #ecfdf5; border: 1px solid #a7f3d0; color: #059669; padding: 1px 4px; border-radius: 4px; font-weight: 700;">Shift+I</kbd></div>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Fit Người Đi Bộ / Xe 2 Bánh</span>
                <div><kbd style="background: #ffffff; border: 1px solid #cbd5e1; padding: 1px 5px; border-radius: 4px;">P</kbd> / <kbd style="background: #ffffff; border: 1px solid #cbd5e1; padding: 1px 5px; border-radius: 4px;">C</kbd></div>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Khớp Chuẩn Kích Thước Catalog</span>
                <kbd style="background: #ffffff; border: 1px solid #cbd5e1; padding: 1px 6px; border-radius: 4px; font-weight: 700;">B</kbd>
              </div>
            </div>
          </div>
        </div>

        <!-- FOOTER -->
        <div style="
          padding: 10px 18px;
          border-top: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #f8fafc;
          border-radius: 0 0 16px 16px;
        ">
          <span style="font-size: 10px; color: #64748b;">Mẹo: Bấm <strong>?</strong> bất cứ lúc nào để mở/đóng bảng này</span>
          <button id="btn-close-help-footer" style="
            background: #0f172a;
            border: none;
            color: #ffffff;
            padding: 5px 14px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
          ">Đóng (Esc)</button>
        </div>
      </div>
    `;

    document.body.appendChild(this.helpModalContainer);

    const closeBtn = this.helpModalContainer.querySelector("#btn-close-help-modal");
    if (closeBtn) closeBtn.addEventListener("click", () => this.toggleHotkeysHelpModal());

    const footerCloseBtn = this.helpModalContainer.querySelector("#btn-close-help-footer");
    if (footerCloseBtn) footerCloseBtn.addEventListener("click", () => this.toggleHotkeysHelpModal());

    this.helpModalContainer.addEventListener("click", (e) => {
      if (e.target === this.helpModalContainer) {
        this.toggleHotkeysHelpModal();
      }
    });
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
