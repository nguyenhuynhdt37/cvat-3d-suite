import { ICONS } from "../icons";

export type HeaderToggleCallback = (enabled: boolean) => void;

/**
 * Nút Bật/Tắt CVAT 3D Suite gắn trực tiếp trên thanh Header bản địa của CVAT.
 * - Tự động nhận diện thanh Header của CVAT (.cvat-annotation-header, .cvat-header)
 * - Tự động ghi nhớ trạng thái BẬT/TẮT vào localStorage (CVAT_3D_SUITE_AUTO_ENABLED)
 * - Giao diện Clean Light Theme, 100% Flat SVG Icons chuẩn GEMINI.md
 * - Khởi động tự động (Auto-boot), người dùng không cần bật thủ công!
 */
export class HeaderSuiteButton {
  private static instance: HeaderSuiteButton | null = null;
  private static readonly STORAGE_KEY = "CVAT_3D_SUITE_AUTO_ENABLED";
  private static readonly BUTTON_ID = "cvat-3d-suite-header-btn";

  private observer: MutationObserver | null = null;
  private callbacks: Set<HeaderToggleCallback> = new Set();
  private isMounted: boolean = false;

  private constructor() {
    this.initObserver();
  }

  public static getInstance(): HeaderSuiteButton {
    if (!HeaderSuiteButton.instance) {
      HeaderSuiteButton.instance = new HeaderSuiteButton();
    }
    return HeaderSuiteButton.instance;
  }

  /**
   * Kiểm tra trạng thái kích hoạt hiện tại của Suite.
   * Mặc định là TRUE nếu chưa từng được người dùng bấm tắt (Auto-boot).
   */
  public static isSuiteEnabled(): boolean {
    const val = localStorage.getItem(HeaderSuiteButton.STORAGE_KEY);
    return val !== "false";
  }

  /**
   * Thiết lập trạng thái Bật/Tắt của Suite và lưu vào localStorage.
   */
  public setSuiteEnabled(enabled: boolean): void {
    localStorage.setItem(HeaderSuiteButton.STORAGE_KEY, String(enabled));
    this.updateButtonUI(enabled);
    this.notifyCallbacks(enabled);
  }

  /**
   * Đăng ký lắng nghe sự kiện khi người dùng nhấn chuyển trạng thái Bật/Tắt.
   */
  public onToggle(callback: HeaderToggleCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  private notifyCallbacks(enabled: boolean): void {
    this.callbacks.forEach((cb) => {
      try {
        cb(enabled);
      } catch (err) {
        console.error("[CVAT 3D Suite] Lỗi callback Header toggle:", err);
      }
    });
  }

  /**
   * Tự động theo dõi DOM để gắn nút vào Header ngay khi Header xuất hiện hoặc re-render.
   */
  private initObserver(): void {
    if (this.observer) return;

    this.observer = new MutationObserver(() => {
      this.tryMount();
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Thử mount ngay lập tức
    this.tryMount();
  }

  /**
   * Cố gắng mount nút vào Header của CVAT nếu chưa tồn tại.
   */
  public tryMount(): boolean {
    const existing = document.getElementById(HeaderSuiteButton.BUTTON_ID);
    if (existing && existing.isConnected) {
      this.isMounted = true;
      return true;
    }

    const targetHeader =
      document.querySelector<HTMLElement>(".cvat-annotation-header-left-group") ||
      document.querySelector<HTMLElement>(".cvat-annotation-header") ||
      document.querySelector<HTMLElement>(".cvat-header") ||
      document.querySelector<HTMLElement>("header.ant-layout-header");

    if (!targetHeader) {
      return false;
    }

    const btn = document.createElement("button");
    btn.id = HeaderSuiteButton.BUTTON_ID;
    btn.type = "button";
    btn.setAttribute("aria-label", "Toggle CVAT 3D Suite");

    // CSS Styling chuẩn Clean Light Theme & tương thích CVAT Header
    btn.style.display = "inline-flex";
    btn.style.alignItems = "center";
    btn.style.gap = "6px";
    btn.style.height = "28px";
    btn.style.padding = "0 10px";
    btn.style.marginLeft = "8px";
    btn.style.marginRight = "4px";
    btn.style.background = "#ffffff";
    btn.style.border = "1px solid #e2e8f0";
    btn.style.borderRadius = "6px";
    btn.style.cursor = "pointer";
    btn.style.fontSize = "11px";
    btn.style.fontWeight = "600";
    btn.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    btn.style.boxShadow = "0 1px 2px rgba(0, 0, 0, 0.05)";
    btn.style.transition = "all 0.15s ease";
    btn.style.userSelect = "none";
    btn.style.verticalAlign = "middle";

    btn.addEventListener("mouseenter", () => {
      btn.style.borderColor = "#cbd5e1";
      btn.style.background = "#f8fafc";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.borderColor = "#e2e8f0";
      btn.style.background = "#ffffff";
    });

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const current = HeaderSuiteButton.isSuiteEnabled();
      this.setSuiteEnabled(!current);
    });

    // Chèn nút vào vị trí đẹp nhất trong header
    targetHeader.appendChild(btn);
    this.isMounted = true;

    // Cập nhật giao diện theo trạng thái hiện tại
    this.updateButtonUI(HeaderSuiteButton.isSuiteEnabled());
    return true;
  }

  /**
   * Cập nhật nội dung hiển thị của nút (Icon, Indicator Dot, Badge ON/OFF, Tooltip)
   */
  private updateButtonUI(enabled: boolean): void {
    const btn = document.getElementById(HeaderSuiteButton.BUTTON_ID);
    if (!btn) return;

    btn.title = `CVAT 3D Suite (Đang ${enabled ? "BẬT" : "TẮT"} - Nhấn để ${enabled ? "TẮT" : "BẬT"})`;

    const dotColor = enabled ? "#10b981" : "#94a3b8";
    const dotShadow = enabled ? "box-shadow: 0 0 6px rgba(16, 185, 129, 0.6);" : "";
    const badgeColor = enabled ? "#047857" : "#64748b";
    const badgeBg = enabled ? "#ecfdf5" : "#f1f5f9";
    const badgeBorder = enabled ? "#a7f3d0" : "#e2e8f0";
    const iconColor = enabled ? "#0f172a" : "#64748b";

    btn.innerHTML = `
      <span style="display: flex; align-items: center; color: ${iconColor};">
        ${ICONS.box3d}
      </span>
      <span style="color: #0f172a; font-weight: 600; letter-spacing: -0.2px;">3D Suite</span>
      <span style="
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 1px 5px;
        background: ${badgeBg};
        border: 1px solid ${badgeBorder};
        border-radius: 4px;
        font-size: 10px;
        font-weight: 700;
        color: ${badgeColor};
        font-family: ui-monospace, monospace;
      ">
        <span style="
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: ${dotColor};
          ${dotShadow}
          display: inline-block;
        "></span>
        ${enabled ? "ON" : "OFF"}
      </span>
    `;
  }

  public destroy(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    const btn = document.getElementById(HeaderSuiteButton.BUTTON_ID);
    if (btn && btn.parentNode) {
      btn.parentNode.removeChild(btn);
    }
    this.isMounted = false;
  }
}
