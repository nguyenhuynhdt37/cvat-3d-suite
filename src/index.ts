import { detectCVAT } from "./cvat/detector";
import { FloatingPanel } from "./ui/components/FloatingPanel";

console.log("[CVAT 3D Suite] Đang khởi động cửa sổ nổi Floating shadcn/ui...");

const panel = new FloatingPanel();

/**
 * Kiểm tra và cập nhật ngữ cảnh CVAT.
 */
function updateContext(): void {
  const ctx = detectCVAT();

  // 🚨 QUY TẮC AN TOÀN TUYỆT ĐỐI:
  // Nếu không phải trang web CVAT, lập tức thoát và dọn dẹp sạch sẽ, không ảnh hưởng trang web khác!
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

    // Phím T đơn: Ôm Sát Cụm Điểm (Tight Fit)
    if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === "T" || e.key === "t")) {
      e.preventDefault();
      console.log("[CVAT 3D Suite] Phím tắt T: Ôm Sát Cụm Điểm (Tight Fit)");
      panel.handleTightFit();
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
 * Khởi động ứng dụng và lắng nghe thay đổi URL (SPA Navigation).
 */
function bootstrap(): void {
  updateContext();
  setupGlobalHotkeys();

  // Lắng nghe điều hướng SPA của CVAT
  window.addEventListener("popstate", updateContext);

  const originalPushState = history.pushState;
  history.pushState = function (...args) {
    originalPushState.apply(this, args);
    setTimeout(updateContext, 300);
  };

  const originalReplaceState = history.replaceState;
  history.replaceState = function (...args) {
    originalReplaceState.apply(this, args);
    setTimeout(updateContext, 300);
  };

  // Quét định kỳ nhẹ để đồng bộ
  let checkCount = 0;
  const interval = setInterval(() => {
    checkCount++;
    updateContext();
    if (checkCount >= 8) {
      clearInterval(interval);
    }
  }, 1200);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
