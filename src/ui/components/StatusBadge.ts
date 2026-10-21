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
    this.container.style.backgroundColor = "rgba(20, 20, 20, 0.92)";
    this.container.style.backdropFilter = "blur(8px)";
    this.container.style.color = "#ffffff";
    this.container.style.boxShadow = "0 4px 16px rgba(0, 0, 0, 0.4)";
    this.container.style.border = "1px solid rgba(255, 255, 255, 0.15)";
    this.container.style.userSelect = "none";
    this.container.style.cursor = "pointer";
    this.container.style.transition = "all 0.2s ease";

    // Hiệu ứng hover
    this.container.addEventListener("mouseenter", () => {
      if (this.container) {
        this.container.style.transform = "translateY(-1px)";
        this.container.style.boxShadow = "0 6px 20px rgba(0, 0, 0, 0.6)";
        this.container.style.borderColor = "rgba(24, 144, 255, 0.5)";
      }
    });

    this.container.addEventListener("mouseleave", () => {
      if (this.container) {
        this.container.style.transform = "translateY(0)";
        this.container.style.boxShadow = "0 4px 16px rgba(0, 0, 0, 0.4)";
        this.container.style.borderColor = "rgba(255, 255, 255, 0.15)";
      }
    });

    document.body.appendChild(this.container);
  }

  private updateContent(ctx: CVATContext): void {
    if (!this.container) return;

    let dotColor = "#faad14"; // Vàng mặc định
    let statusText = "CVAT Sẵn sàng";

    if (ctx.isJob && ctx.is3D) {
      dotColor = "#52c41a"; // Xanh lá: 3D Kết nối hoàn hảo
      statusText = `3D Job #${ctx.jobId}`;
      if (ctx.taskId) {
        statusText += ` (Task #${ctx.taskId})`;
      }
    } else if (ctx.isJob) {
      dotColor = "#1890ff"; // Xanh dương: Đang ở Job 2D hoặc 3D đang load
      statusText = `Job #${ctx.jobId} (Loading 3D...)`;
    } else {
      dotColor = "#8c8c8c"; // Xám: Dashboard
      statusText = "CVAT Dashboard";
    }

    this.container.innerHTML = `
      <span style="
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background-color: ${dotColor};
        box-shadow: 0 0 8px ${dotColor};
        display: inline-block;
      "></span>
      <span style="font-weight: 600; letter-spacing: 0.3px;">CVAT 3D Suite</span>
      <span style="color: rgba(255, 255, 255, 0.3); font-size: 10px;">|</span>
      <span style="color: #d9d9d9;">${statusText}</span>
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
