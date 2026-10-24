import { detectCVAT } from "./cvat/detector";
import { FloatingPanel } from "./ui/components/FloatingPanel";
import { CVATBridge } from "./cvat/bridge";
import { HeaderSuiteButton } from "./ui/components/HeaderSuiteButton";

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
   * Sử dụng Capture Phase ({ capture: true }) để bắt sự kiện TRƯỚC Three.js Canvas và React của CVAT.
   * Hỗ trợ song song cả e.key lẫn e.code (chống lỗi bộ gõ tiếng Việt Telex/VNI trên macOS).
   * Chặn triệt để sự kiện Backspace/Delete giả lập của bộ gõ macOS để không bao giờ bị popup 'Remove object' của CVAT.
   */
  function setupGlobalHotkeys(): void {
    const isInputElement = (target: any): boolean => {
      if (!target) return false;
      const tagName = target.tagName || "";
      return ["INPUT", "TEXTAREA", "SELECT"].includes(tagName) || !!target.isContentEditable;
    };

    // Chặn triệt để keyup và keypress cho các phím tắt của tool và bộ gõ để CVAT không bắt được ở phase sau
    const blockCvatKeyLeak = (e: KeyboardEvent) => {
      if (isInputElement(e.target)) return;
      const key = (e.key || "").toLowerCase();
      const code = e.code || "";
      if (
        key === "w" || code === "KeyW" || key === "ư" ||
        key === "a" || code === "KeyA" || key === "á" || key === "à" || key === "â" ||
        key === "s" || code === "KeyS" ||
        key === "d" || code === "KeyD" || key === "đ" ||
        key === "backspace" || code === "Backspace" ||
        key === "delete" || code === "Delete" ||
        key === "1" || code === "Digit1" || code === "Numpad1" ||
        key === "2" || code === "Digit2" || code === "Numpad2" ||
        key === "3" || code === "Digit3" || code === "Numpad3" ||
        key === "4" || code === "Digit4" || code === "Numpad4" ||
        key === "5" || code === "Digit5" || code === "Numpad5"
      ) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    };

    window.addEventListener("keyup", blockCvatKeyLeak, { capture: true, passive: false });
    window.addEventListener("keypress", blockCvatKeyLeak, { capture: true, passive: false });

    window.addEventListener(
      "keydown",
      (e: KeyboardEvent) => {
        // Tuyệt đối không can thiệp khi người dùng đang gõ trong ô input/textarea/select hoặc phần tử contenteditable
        const target = e.target as HTMLElement;
        if (isInputElement(target)) {
          return;
        }

        const key = (e.key || "").toLowerCase();
        const code = e.code || "";

        const consume = () => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
        };

        // 🚨 CHẶN TRIỆT ĐỂ PHÍM BACKSPACE / DELETE NGOÀI Ô INPUT:
        // Khi gõ liên tiếp phím 'd' trên macOS với bộ gõ Telex (để tạo chữ 'đ'), bộ gõ tự động phát ra phím Backspace.
        // Chặn phím này để CVAT không nhận lệnh xóa và KHÔNG BAO GIỜ hiển thị popup 'Remove object'!
        if (key === "backspace" || code === "Backspace" || key === "delete" || code === "Delete") {
          consume();
          return;
        }

        // Phím ` (dấu huyền): Bật/tắt thu nhỏ cửa sổ nổi
        if (key === "`" || key === "~" || code === "Backquote") {
          consume();
          panel.toggleMinimize();
          return;
        }

        // Phím ? hoặc Shift + /: Bật/Tắt Bảng Tra Cứu Phím Tắt CheatSheet
        if (key === "?" || (e.shiftKey && (key === "/" || code === "Slash"))) {
          consume();
          panel.toggleHotkeysHelpModal();
          return;
        }

        // Phím Escape: Đóng Modal Trợ Giúp nếu đang mở
        if ((key === "escape" || code === "Escape") && panel.isHelpModalOpen) {
          consume();
          panel.toggleHotkeysHelpModal();
          return;
        }

        // Phím Ctrl+Z hoặc Cmd+Z: Hoàn Tác (Pre) thao tác vừa làm
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (key === "z" || code === "KeyZ")) {
          consume();
          console.log("[CVAT 3D Suite] Phím tắt Ctrl/Cmd+Z: Hoàn tác (Pre)");
          panel.handleUndo();
          return;
        }

        // Phím Z đơn: Căn giữa (Center / Focus) View 3D vào xe đang chọn
        if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && (key === "z" || code === "KeyZ")) {
          consume();
          console.log("[CVAT 3D Suite] Phím tắt Z: Căn giữa View 3D vào xe đang chọn");
          panel.handleCenterCurrentTrack();
          return;
        }

        // Phím Tab hoặc X: Bật/tắt phạm vi Scope (Chỉ Frame Này <-> Toàn Bộ Track)
        if (!e.ctrlKey && !e.metaKey && !e.altKey && (key === "tab" || code === "Tab" || key === "x" || code === "KeyX")) {
          consume();
          panel.toggleScope();
          return;
        }

        // Phím Shift + O: Đánh dấu Outside toàn bộ Track
        if (e.shiftKey && (key === "o" || code === "KeyO")) {
          consume();
          console.log("[CVAT 3D Suite] Phím tắt Shift+O: Đánh dấu Outside toàn bộ Track");
          panel.handleSetTrackOutside(true);
          return;
        }

        // Phím Shift + I: Đánh dấu Inside (Hiện lại) toàn bộ Track
        if (e.shiftKey && (key === "i" || code === "KeyI")) {
          consume();
          console.log("[CVAT 3D Suite] Phím tắt Shift+I: Đánh dấu Inside (Hiện lại) toàn bộ Track");
          panel.handleSetTrackOutside(false);
          return;
        }

        // Phím Shift + M: Mở rộng Fullscreen Track Editor (Duyệt toàn bộ ID)
        if (e.shiftKey && (key === "m" || code === "KeyM")) {
          consume();
          console.log("[CVAT 3D Suite] Phím tắt Shift+M: Mở Fullscreen Track Editor");
          panel.openFullscreenEditor();
          return;
        }

        // Phím Shift + F: Lật toàn bộ Track
        if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (key === "f" || code === "KeyF")) {
          consume();
          console.log("[CVAT 3D Suite] Phím tắt Shift+F: Lật toàn bộ Track");
          panel.handleFlipYaw(false);
          return;
        }

        // Phím F đơn: Lật Frame hiện tại
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (key === "f" || code === "KeyF")) {
          consume();
          console.log("[CVAT 3D Suite] Phím tắt F: Lật Frame hiện tại");
          panel.handleFlipYaw(true);
          return;
        }

        // Phím Shift + W, Shift + A, Shift + S, Shift + D: BẮT BUỘC NHẤN SHIFT MỚI VI CHỈNH BOX (Screen Space Trực Quan)
        // Mặc định: 2cm mỗi lần bấm (Chỉ Frame Hiện Tại, không đụng toàn bộ frame khác)
        // Hỗ trợ cả các ký tự biến thể Telex tiếng Việt: w/ư, a/á/à/ả/ã/ạ/â/ă, s, d/đ
        const isKeyW = key === "w" || code === "KeyW" || key === "ư";
        const isKeyA = key === "a" || code === "KeyA" || ["á", "à", "ả", "ã", "ạ", "â", "ă"].includes(key);
        const isKeyS = key === "s" || code === "KeyS";
        const isKeyD = key === "d" || code === "KeyD" || key === "đ";

        if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (isKeyW || isKeyA || isKeyS || isKeyD)) {
          consume();
          const nudgeKey = isKeyW ? "w" : isKeyA ? "a" : isKeyS ? "s" : "d";
          panel.handleNudgeByView(nudgeKey);
          return;
        }

        // Phím [ : Xe liền trước
        if (!e.ctrlKey && !e.metaKey && !e.altKey && (key === "[" || code === "BracketLeft")) {
          consume();
          panel.selectPrevTrack();
          return;
        }

        // Phím ] : Xe kế tiếp
        if (!e.ctrlKey && !e.metaKey && !e.altKey && (key === "]" || code === "BracketRight")) {
          consume();
          panel.selectNextTrack();
          return;
        }

        // Phím Shift + Q: Xoay Trái Mạnh (-5°)
        if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (key === "q" || code === "KeyQ")) {
          consume();
          panel.rotateYawByDelta(-5);
          return;
        }

        // Phím Shift + E: Xoay Phải Mạnh (+5°)
        if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (key === "e" || code === "KeyE")) {
          consume();
          panel.rotateYawByDelta(5);
          return;
        }

        // Phím Q: Vi chỉnh Xoay Trái Nhẹ (-1°)
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (key === "q" || code === "KeyQ")) {
          consume();
          panel.rotateYawByDelta(-1);
          return;
        }

        // Phím E: Vi chỉnh Xoay Phải Nhẹ (+1°)
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (key === "e" || code === "KeyE")) {
          consume();
          panel.rotateYawByDelta(1);
          return;
        }

        // Phím Shift + G: Ghim Đất & Vỉa Hè Toàn Bộ Track
        if (e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && (key === "g" || code === "KeyG")) {
          consume();
          console.log("[CVAT 3D Suite] Phím tắt Shift+G: Ghim Đất & Vỉa Hè Toàn Bộ Track");
          panel.handleSnapGroundTrack();
          return;
        }

        // Phím G đơn: Ghim Mặt Đất, Vỉa Hè & Gác Lề Tự Động (Chưa đủ điểm tự fit theo Ego)
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (key === "g" || code === "KeyG")) {
          consume();
          console.log("[CVAT 3D Suite] Phím tắt G: Ghim Mặt Đất, Vỉa Hè & Gác Lề Tự Động");
          panel.handleSnapGround("road");
          return;
        }

        // Phím Alt + R: Reset Dốc Phẳng 0°
        if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && (key === "r" || code === "KeyR")) {
          consume();
          console.log("[CVAT 3D Suite] Phím tắt Alt+R: Đặt lại dốc phẳng 0°");
          panel.handleSnapGround("reset_slope");
          return;
        }

        // Phím 1 hoặc T: Căn TOP (Yaw & Nóc xe)
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (key === "1" || code === "Digit1" || code === "Numpad1" || key === "t" || code === "KeyT")) {
          consume();
          console.log("[CVAT 3D Suite] Phím tắt 1/T: Căn TOP");
          panel.handleFitTop();
          return;
        }

        // Phím 2: Căn SIDE (Cản trước/sau X & Auto Ghim Đất)
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (key === "2" || code === "Digit2" || code === "Numpad2")) {
          consume();
          console.log("[CVAT 3D Suite] Phím tắt 2: Căn SIDE");
          panel.handleFitSide();
          return;
        }

        // Phím 3: Căn FRONT (Sườn xe W/Y, giữ nguyên cao độ Z, không ghim đất)
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (key === "3" || code === "Digit3" || code === "Numpad3")) {
          consume();
          console.log("[CVAT 3D Suite] Phím tắt 3: Căn FRONT");
          panel.handleFitFront();
          return;
        }

        // Phím 4: Fit Riêng Chiều Rộng W (Pedestrian / Cyclist / Car)
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (key === "4" || code === "Digit4" || code === "Numpad4")) {
          consume();
          console.log("[CVAT 3D Suite] Phím tắt 4: Fit Rộng (W)");
          panel.handleFitWidth();
          return;
        }

        // Phím 5: Fit Riêng Chiều Cao H - Ground-Lock Bám Sàn Cố Định, Nở Lên Nóc (Pedestrian / Cyclist / Car)
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (key === "5" || code === "Digit5" || code === "Numpad5")) {
          consume();
          console.log("[CVAT 3D Suite] Phím tắt 5: Fit Cao (H) [Ground-Lock]");
          panel.handleFitHeight();
          return;
        }

        // Phím Shift + P: Fix Cao H cho Người Đi Bộ (Ground-Lock)
        if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (key === "p" || code === "KeyP")) {
          consume();
          console.log("[CVAT 3D Suite] Phím tắt Shift+P: Fix Cao H Người");
          panel.handleFitPedestrian("h");
          return;
        }

        // Phím P đơn: Fit Người Đi Bộ Toàn Diện (Pedestrian Fit)
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (key === "p" || code === "KeyP")) {
          consume();
          console.log("[CVAT 3D Suite] Phím tắt P: Fit Người Đi Bộ Toàn Diện");
          panel.handleFitPedestrian("all");
          return;
        }

        // Phím Shift + C: Fit Rộng W Xe 2 Bánh (Bắt gương xe)
        if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (key === "c" || code === "KeyC")) {
          consume();
          console.log("[CVAT 3D Suite] Phím tắt Shift+C: Fit Rộng W Xe 2 Bánh");
          panel.handleFitCyclist("w");
          return;
        }

        // Phím C đơn: Fit Toàn Diện Xe 2 Bánh (Cyclist / Two-Wheeler)
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (key === "c" || code === "KeyC")) {
          consume();
          console.log("[CVAT 3D Suite] Phím tắt C: Fit Toàn Diện Xe 2 Bánh");
          panel.handleFitCyclist("all");
          return;
        }

        // Phím B hoặc Shift + B: Khớp Chuẩn Catalog (Catalog Best-Fit)
        if (!e.ctrlKey && !e.metaKey && !e.altKey && (key === "b" || code === "KeyB")) {
          consume();
          console.log("[CVAT 3D Suite] Phím tắt B: Khớp Chuẩn Catalog");
          panel.handleCatalogFit();
          return;
        }

        // Phím L: Căn Yaw theo Vạch Kẻ Làn Đường 3D (LiDAR Intensity Lane Snap)
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (key === "l" || code === "KeyL")) {
          consume();
          console.log("[CVAT 3D Suite] Phím tắt L: Căn Yaw theo Vạch Kẻ Làn Đường 3D");
          panel.handleSnapYawToLane();
          return;
        }

        // Phím Shift + ArrowUp: Tăng Chiều Dài L (+10cm)
        if (e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && (code === "ArrowUp" || key === "arrowup")) {
          consume();
          panel.handleStepDimension("l", 0.1);
          return;
        }

        // Phím Shift + ArrowDown: Giảm Chiều Dài L (-10cm)
        if (e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && (code === "ArrowDown" || key === "arrowdown")) {
          consume();
          panel.handleStepDimension("l", -0.1);
          return;
        }

        // Phím Shift + ArrowRight: Tăng Chiều Rộng W (+10cm)
        if (e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && (code === "ArrowRight" || key === "arrowright")) {
          consume();
          panel.handleStepDimension("w", 0.1);
          return;
        }

        // Phím Shift + ArrowLeft: Giảm Chiều Rộng W (-10cm)
        if (e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && (code === "ArrowLeft" || key === "arrowleft")) {
          consume();
          panel.handleStepDimension("w", -0.1);
          return;
        }

        // Phím Alt + ArrowUp: Tăng Chiều Cao H (+5cm Ground-Lock)
        if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && (code === "ArrowUp" || key === "arrowup")) {
          consume();
          panel.handleStepDimension("h", 0.05);
          return;
        }

        // Phím Alt + ArrowDown: Giảm Chiều Cao H (-5cm Ground-Lock)
        if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && (code === "ArrowDown" || key === "arrowdown")) {
          consume();
          panel.handleStepDimension("h", -0.05);
          return;
        }

        // Phím PageUp: Nâng +1cm (Vi chỉnh Z)
        if (key === "pageup" || code === "PageUp") {
          consume();
          panel.handleSnapGround("micro_adjust", { deltaCm: 1 });
          return;
        }

        // Phím PageDown: Hạ -1cm (Vi chỉnh Z)
        if (key === "pagedown" || code === "PageDown") {
          consume();
          panel.handleSnapGround("micro_adjust", { deltaCm: -1 });
          return;
        }
      },
      { capture: true, passive: false }
    );
  }

  /**
   * Theo dõi tự động khung nhìn (Top, Side, Front, Perspective 3D) khi con trỏ chuột hover.
   */
  function setupViewTracker(): void {
    let lastCheck = 0;
    window.addEventListener(
      "pointermove",
      (e: PointerEvent) => {
        const now = Date.now();
        if (now - lastCheck < 60) return; // Throttle 60ms để tối ưu hiệu năng
        lastCheck = now;

        const target = e.target as HTMLElement;
        if (!target) return;

        if (target.closest(".cvat-canvas3d-topview, [id*='topview']")) {
          panel.setActiveView("top");
        } else if (target.closest(".cvat-canvas3d-sideview, [id*='sideview']")) {
          panel.setActiveView("side");
        } else if (target.closest(".cvat-canvas3d-frontview, [id*='frontview']")) {
          panel.setActiveView("front");
        } else if (target.closest(".cvat-canvas3d-perspective, [id*='perspective']")) {
          panel.setActiveView("perspective");
        }
      },
      { capture: true, passive: true }
    );
  }

  /**
   * Khởi động ứng dụng và lắng nghe thay đổi URL thông minh (Chống bão replaceState khi F5).
   */
  function bootstrap(): void {
    updateContext();
    setupGlobalHotkeys();
    setupViewTracker();

    // Khởi tạo nút Header Toggle CVAT 3D Suite & Auto-boot
    const headerBtn = HeaderSuiteButton.getInstance();
    headerBtn.onToggle((enabled) => {
      panel.setSuiteVisible(enabled);
    });

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
        headerBtn.tryMount();
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
