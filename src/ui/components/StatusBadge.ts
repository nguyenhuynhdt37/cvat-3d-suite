import { CVATContext } from "../../core/types";

export class StatusBadge {
  private container: HTMLDivElement | null = null;

  public render(ctx: CVATContext): void {
    // Nếu không phải CVAT, xóa container nếu có và thoát ngay
    if (!ctx.isCVAT) {
      this.destroy();
      return;
    }

    if (!this.container) {
      this.createContainer();
    }

    this.updateContent(ctx);
  }

  private createContainer(): void {
    this.container = document.createElement("div");
    this.container.id = "cvat-3d-suite-badge";
    this.container.setAttribute("translate", "no");
    this.container.classList.add("notranslate");
    this.container.style.position = "fixed";
    this.container.style.bottom = "24px";
    this.container.style.right = "24px";
    this.container.style.zIndex = "999999";
    this.container.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
    this.container.style.fontSize = "12px";
    this.container.style.display = "flex";
    this.container.style.alignItems = "center";
    this.container.style.gap = "8px";
    this.container.style.padding = "6px 12px";
    this.container.style.borderRadius = "20px";
    this.container.style.backgroundColor = "rgba(255, 255, 255, 0.96)";
    this.container.style.backdropFilter = "blur(8px)";
    this.container.style.color = "#09090b";
    this.container.style.boxShadow = "0 4px 16px rgba(0, 0, 0, 0.08)";
    this.container.style.border = "1px solid #e2e8f0";
    this.container.style.userSelect = "none";
    this.container.style.cursor = "pointer";
    this.container.style.transition = "all 0.2s ease";

    // Hiệu ứng hover
    this.container.addEventListener("mouseenter", () => {
      if (this.container) {
        this.container.style.transform = "translateY(-1px)";
        this.container.style.boxShadow = "0 6px 20px rgba(0, 0, 0, 0.12)";
        this.container.style.borderColor = "rgba(24, 144, 255, 0.5)";
      }
    });

    this.container.addEventListener("mouseleave", () => {
      if (this.container) {
        this.container.style.transform = "translateY(0)";
        this.container.style.boxShadow = "0 4px 16px rgba(0, 0, 0, 0.08)";
        this.container.style.borderColor = "#e2e8f0";
      }
    });

    document.body.appendChild(this.container);
  }

  private updateContent(ctx: CVATContext): void {
    if (!this.container) return;

    let dotColor = "#faad14"; // Vàng mặc định
    let statusText = "CVAT Sẵn sàng";

    if (ctx.isJob && ctx.is3D) {
      dotColor = "#10b981"; // Xanh lá
      statusText = `3D Job #${ctx.jobId}`;
      if (ctx.taskId) {
        statusText += ` (Task #${ctx.taskId})`;
      }
    } else if (ctx.isJob) {
      dotColor = "#0284c7"; // Xanh dương
      statusText = `Job #${ctx.jobId} (Loading 3D...)`;
    } else {
      dotColor = "#64748b"; // Xám
      statusText = "CVAT Dashboard";
    }

    this.container.innerHTML = `
      <span style="
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background-color: ${dotColor};
        box-shadow: 0 0 6px ${dotColor};
        display: inline-block;
      "></span>
      <span style="font-weight: 600; letter-spacing: 0.3px; color: #09090b;">CVAT 3D Suite</span>
      <span style="color: #cbd5e1; font-size: 10px;">|</span>
      <span style="color: #475569;">${statusText}</span>
    `;

    this.container.title = `${ctx.statusMessage}\nNhấp để kiểm tra trạng thái.`;
  }

  public destroy(): void {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
      this.container = null;
    }
  }
}
