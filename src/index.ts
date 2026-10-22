import { detectCVAT } from "./cvat/detector";
import { FloatingPanel } from "./ui/components/FloatingPanel";
import { CVATBridge } from "./cvat/bridge";

declare global {
  interface Window {
    __CVAT_3D_SUITE_INITIALIZED__?: boolean;
    __CVAT_3D_SUITE_PANEL_INSTANCE__?: FloatingPanel;
  }
}

// =========================================================================
// 1. SINGLETON GUARD: CHỐNG CHẠY NHIỀU INSTANCE TRÙNG LẶP KHI BẬT CẢ EXTENSION & USERSCRIPT
// =========================================================================
if (window.__CVAT_3D_SUITE_INITIALIZED__) {
  console.log("[CVAT 3D Suite] Đã có một phiên bản Suite đang chạy trên trang, bỏ qua khởi tạo trùng lặp.");
} else {
  window.__CVAT_3D_SUITE_INITIALIZED__ = true;

  console.log("[CVAT 3D Suite] Đang khởi động cửa sổ nổi Floating shadcn/ui...");

  // Dọn dẹp bất kỳ container mồ côi nào nếu có từ trước
  const existingContainer = document.getElementById("cvat-3d-suite-floating");
  if (existingContainer && existingContainer.parentNode) {
    existingContainer.parentNode.removeChild(existingContainer);
  }
  const existingPill = document.getElementById("cvat-3d-suite-pill");
  if (existingPill && existingPill.parentNode) {
    existingPill.parentNode.removeChild(existingPill);
  }

  const panel = new FloatingPanel();
  window.__CVAT_3D_SUITE_PANEL_INSTANCE__ = panel;

  // Đảm bảo Main World Bridge được nạp sẵn sàng
  CVATBridge.ensureMainWorldBridge();

  /**
   * Kiểm tra và cập nhật ngữ cảnh CVAT.
   */
  function updateContext(): void {
    const ctx = detectCVAT();

    // 🚨 QUY TẮC AN TOÀN TUYỆT ĐỐI:
    // Nếu không phải trang web CVAT, lập tức dọn dẹp sạch sẽ, không ảnh hưởng trang web khác!
    if (!ctx.isCVAT) {
      panel.destroy();
      return;
    }

    // Render Cửa sổ nổi shadcn/ui (Floating Window)
    panel.render(ctx);
  }

  /**
   * Lắng nghe phím tắt toàn cục (Speedrun Hotkeys Engine):
   * - Phím ` : Ẩn / Hiện cửa sổ nổi
   * - Phím F : Lật ngược đầu xe 180° tại Frame hiện tại
   * - Phím Shift + F : Lật ngược đầu xe 180° cho toàn bộ Track
   * - Phím [ : Chuyển sang xe liền trước (Prev Track)
   * - Phím ] : Chuyển sang xe kế tiếp (Next Track)
   */
  function setupGlobalHotkeys(): void {
    window.addEventListener("keydown", (e: KeyboardEvent) => {
      // Tuyệt đối không can thiệp khi người dùng đang gõ trong ô input/textarea/select
      const target = e.target as HTMLElement;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        return;
      }

      // Phím ` (dấu huyền): Bật/tắt thu nhỏ cửa sổ nổi
      if (e.key === "`") {
        e.preventDefault();
        panel.toggleMinimize();
        return;
      }

      // Phím Ctrl+Z hoặc Cmd+Z: Hoàn Tác (Pre) thao tác vừa làm
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        console.log("[CVAT 3D Suite] Phím tắt Ctrl/Cmd+Z: Hoàn tác (Pre)");
        panel.handleUndo();
        return;
      }

      // Phím Shift + O: Đánh dấu Outside toàn bộ Track
      if (e.shiftKey && (e.key === "O" || e.key === "o")) {
        e.preventDefault();
        console.log("[CVAT 3D Suite] Phím tắt Shift+O: Đánh dấu Outside toàn bộ Track");
        panel.handleSetTrackOutside(true);
        return;
      }

      // Phím Shift + M: Mở rộng Fullscreen Track Editor (Duyệt toàn bộ ID)
      if (e.shiftKey && (e.key === "M" || e.key === "m")) {
        e.preventDefault();
        console.log("[CVAT 3D Suite] Phím tắt Shift+M: Mở Fullscreen Track Editor");
        panel.openFullscreenEditor();
        return;
      }

      // Phím Shift + F: Lật toàn bộ Track
      if (e.shiftKey && (e.key === "F" || e.key === "f")) {
        e.preventDefault();
        console.log("[CVAT 3D Suite] Phím tắt Shift+F: Lật toàn bộ Track");
        panel.handleFlipYaw(false);
        return;
      }

      // Phím F đơn: Lật Frame hiện tại
      if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === "F" || e.key === "f")) {
        e.preventDefault();
        console.log("[CVAT 3D Suite] Phím tắt F: Lật Frame hiện tại");
        panel.handleFlipYaw(true);
        return;
      }

      // Phím [ : Xe liền trước
      if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === "[") {
        e.preventDefault();
        panel.selectPrevTrack();
        return;
      }

      // Phím ] : Xe kế tiếp
      if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === "]") {
        e.preventDefault();
        panel.selectNextTrack();
        return;
      }

      // Phím Alt + G: Ghim Nền Vỉa Hè (+15cm)
      if (e.altKey && (e.key === "G" || e.key === "g")) {
        e.preventDefault();
        console.log("[CVAT 3D Suite] Phím tắt Alt+G: Ghim Nền Vỉa Hè (+15cm)");
        panel.handleSnapGround("curb", { curbHeight: 0.15 });
        return;
      }

      // Phím Shift + G: Xe Đỗ Gác Bánh Vỉa Hè (Nghiêng Roll)
      if (e.shiftKey && (e.key === "G" || e.key === "g")) {
        e.preventDefault();
        console.log("[CVAT 3D Suite] Phím tắt Shift+G: Xe Gác Lề Vỉa Hè");
        panel.handleSnapGround("half_curb", { curbHeight: 0.15 });
        return;
      }

      // Phím G đơn: Ghim Tiếp Đất Mặt Đường
      if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === "G" || e.key === "g")) {
        e.preventDefault();
        console.log("[CVAT 3D Suite] Phím tắt G: Ghim Mặt Đường");
        panel.handleSnapGround("road");
        return;
      }

      // Phím 1: Căn TOP (Yaw & Nóc xe & Auto Ghim Đất)
      if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === "1") {
        e.preventDefault();
        console.log("[CVAT 3D Suite] Phím tắt 1: Căn TOP");
        panel.handleFitTop();
        return;
      }

      // Phím 2: Căn SIDE (Cản trước/sau X & Auto Ghim Đất)
      if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === "2") {
        e.preventDefault();
        console.log("[CVAT 3D Suite] Phím tắt 2: Căn SIDE");
        panel.handleFitSide();
        return;
      }

      // Phím 3: Căn FRONT (Sườn xe W/Y, giữ nguyên cao độ Z, không ghim đất)
      if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === "3") {
        e.preventDefault();
        console.log("[CVAT 3D Suite] Phím tắt 3: Căn FRONT");
        panel.handleFitFront();
        return;
      }

      // Phím T đơn: Căn TOP (Yaw & Nóc xe)
      if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === "T" || e.key === "t")) {
        e.preventDefault();
        console.log("[CVAT 3D Suite] Phím tắt T: Căn TOP");
        panel.handleFitTop();
        return;
      }

      // Phím P hoặc Shift + P: Fit Người Đi Bộ (Pedestrian Fit)
      if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === "P" || e.key === "p")) {
        e.preventDefault();
        console.log("[CVAT 3D Suite] Phím tắt P: Fit Người Đi Bộ (Pedestrian Fit)");
        panel.handleFitPedestrian();
        return;
      }

      // Phím Shift + C: Fit Toàn Diện Xe 2 Bánh (Cyclist / Two-Wheeler)
      if (e.shiftKey && (e.key === "C" || e.key === "c")) {
        e.preventDefault();
        console.log("[CVAT 3D Suite] Phím tắt Shift+C: Fit Toàn Diện Xe 2 Bánh");
        panel.handleFitCyclist("all");
        return;
      }

      // Phím Shift + B: Khớp Chuẩn Catalog (Catalog Best-Fit)
      if (e.shiftKey && (e.key === "B" || e.key === "b")) {
        e.preventDefault();
        console.log("[CVAT 3D Suite] Phím tắt Shift+B: Khớp Chuẩn Catalog");
        panel.handleCatalogFit();
        return;
      }

      // Phím PageUp: Nâng +1cm (Vi chỉnh Z)
      if (e.key === "PageUp") {
        e.preventDefault();
        panel.handleSnapGround("micro_adjust", { deltaCm: 1 });
        return;
      }

      // Phím PageDown: Hạ -1cm (Vi chỉnh Z)
      if (e.key === "PageDown") {
        e.preventDefault();
        panel.handleSnapGround("micro_adjust", { deltaCm: -1 });
        return;
      }
    });
  }

  /**
   * Khởi động ứng dụng và lắng nghe thay đổi URL thông minh (Chống bão replaceState khi F5).
   */
  function bootstrap(): void {
    updateContext();
    setupGlobalHotkeys();

    let lastPathname = window.location.pathname;
    let navDebounceTimer: any = null;

    // Chỉ trigger cập nhật context khi PATHNAME thực sự thay đổi (chuyển Task/Job)
    // Bỏ qua 100% các lần replaceState chỉ đổi query string (?frame=0...) để chống nháy!
    function handleUrlChange(): void {
      const currentPathname = window.location.pathname;
      if (currentPathname === lastPathname) {
        return;
      }
      lastPathname = currentPathname;

      if (navDebounceTimer) clearTimeout(navDebounceTimer);
      navDebounceTimer = setTimeout(() => {
        navDebounceTimer = null;
        updateContext();
      }, 250);
    }

    window.addEventListener("popstate", handleUrlChange);

    const originalPushState = history.pushState;
    history.pushState = function (...args) {
      originalPushState.apply(this, args);
      handleUrlChange();
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function (...args) {
      originalReplaceState.apply(this, args);
      handleUrlChange();
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
}
