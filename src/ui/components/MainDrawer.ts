import { CVATContext } from "../../core/types";

/**
 * Giao diện Bảng điều khiển 3D lấy cảm hứng 100% từ DataForge-AI (greensm-hitl):
 * - Tone màu: Zinc Theme (#18181b zinc-900, #27272a zinc-800, #09090b zinc-950)
 * - Điểm nhấn: Emerald-500 (#10b981) và Cyan/Amber đặc trưng của DataForge-AI
 * - Typography: font-mono text-[10px] cho các tọa độ & kích thước
 * - Thẻ bo góc: rounded-xl (12px) với viền mảnh border-zinc-800
 * - Chiều rộng: w-80 (320px) chuẩn xác theo BoxPropertySidebar của DataForge-AI
 */
export class MainDrawer {
  private container: HTMLDivElement | null = null;
  private isCollapsed: boolean = false;
  private selectedTrackId: number | null = null;

  public render(ctx: CVATContext): void {
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
    this.container.id = "cvat-3d-suite-drawer";
    this.container.style.position = "fixed";
    this.container.style.top = "0";
    this.container.style.right = "0";
    this.container.style.bottom = "0";
    this.container.style.width = "320px";
    this.container.style.zIndex = "999990";
    this.container.style.fontFamily = "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    this.container.style.backgroundColor = "#18181b"; // bg-zinc-900
    this.container.style.borderLeft = "1px solid #27272a"; // border-zinc-800
    this.container.style.color = "#ffffff";
    this.container.style.display = "flex";
    this.container.style.flexDirection = "column";
    this.container.style.transition = "transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)";
    this.container.style.userSelect = "none";
    this.container.style.boxShadow = "-12px 0 36px rgba(0, 0, 0, 0.6)";

    document.body.appendChild(this.container);
  }

  public toggleCollapse(): void {
    this.isCollapsed = !this.isCollapsed;
    if (this.container) {
      this.container.style.transform = this.isCollapsed ? "translateX(calc(100% - 36px))" : "translateX(0)";
      const toggleText = this.container.querySelector("#cvat-3d-toggle-text");
      if (toggleText) {
        toggleText.textContent = this.isCollapsed ? "‹" : "›";
      }
    }
  }

  private updateContent(ctx: CVATContext): void {
    if (!this.container) return;

    const jobText = ctx.jobId ? `Job #${ctx.jobId}` : "Chưa mở Job";

    this.container.innerHTML = `
      <!-- HEADER (DataForge-AI Style) -->
      <div style="
        padding: 14px 16px;
        border-bottom: 1px solid #27272a;
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: #18181b;
      ">
        <div style="display: flex; align-items: center; gap: 8px;">
          <!-- Tag Icon SVG -->
          <svg style="width: 16px; height: 16px; color: #10b981;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
          <span style="font-size: 13px; font-weight: 600; color: #ffffff;">DataForge 3D</span>
          <span style="
            font-size: 10px;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            background: #27272a;
            color: #10b981;
            padding: 2px 6px;
            border-radius: 4px;
            font-weight: 600;
          ">
            ${jobText}
          </span>
        </div>

        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="font-size: 10px; font-family: ui-monospace, monospace; color: #71717a;">Auto + HITL</span>
          <button id="cvat-3d-collapse-btn" style="
            background: #27272a;
            border: none;
            color: #a1a1aa;
            border-radius: 6px;
            width: 22px;
            height: 22px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            font-size: 14px;
          ">
            <span id="cvat-3d-toggle-text">${this.isCollapsed ? "‹" : "›"}</span>
          </button>
        </div>
      </div>

      <!-- SCROLLABLE BODY -->
      <div style="
        flex: 1;
        overflow-y: auto;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      ">
        <!-- CARD: ACTIVE BOX PROPERTY (Lấy cảm hứng từ BoxPropertySidebar) -->
        <div style="
          padding: 12px;
          border-radius: 12px;
          border: 1px solid ${this.selectedTrackId ? "#10b981" : "#27272a"};
          background: ${this.selectedTrackId ? "rgba(16, 185, 129, 0.08)" : "rgba(9, 9, 11, 0.6)"};
          transition: all 0.2s ease;
        ">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="
                width: 20px;
                height: 20px;
                border-radius: 6px;
                background: #27272a;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: ui-monospace, monospace;
                font-weight: bold;
                color: #d4d4d8;
                font-size: 10px;
              ">
                ${this.selectedTrackId ? `#${this.selectedTrackId}` : "0"}
              </span>
              <span style="font-weight: 600; font-size: 12px; color: #ffffff;">
                ${this.selectedTrackId ? "Car (Sedan)" : "Chưa chọn đối tượng"}
              </span>
              ${this.selectedTrackId ? `
                <span style="font-size: 9px; font-family: ui-monospace, monospace; color: #60a5fa; background: rgba(59, 130, 246, 0.15); padding: 1px 4px; border-radius: 3px;">
                  3D RIGID
                </span>
              ` : ""}
            </div>

            <span style="font-size: 10px; font-family: ui-monospace, monospace; color: #71717a;">
              ${this.selectedTrackId ? "Frame 10 ➔ 65" : "Idle"}
            </span>
          </div>

          <!-- 4-GRID METRICS: X, Y, Z, YAW (Theo đúng BoxPropertySidebar) -->
          <div style="
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 4px;
            font-size: 10px;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            color: #a1a1aa;
            background: #18181b;
            padding: 6px 8px;
            border-radius: 8px;
            border: 1px solid rgba(39, 39, 42, 0.8);
          ">
            <div><span style="color: #71717a;">X:</span> 14.2</div>
            <div><span style="color: #71717a;">Y:</span> -3.5</div>
            <div><span style="color: #71717a;">Z:</span> -0.85</div>
            <div><span style="color: #71717a;">Y:</span> <span style="color: #10b981;">178°</span></div>
          </div>

          <!-- KÍCH THƯỚC CHUẨN L x W x H -->
          <div style="
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 10px;
            font-family: ui-monospace, monospace;
            margin-top: 6px;
            padding: 0 2px;
          ">
            <span style="color: #71717a;">Dimension (m):</span>
            <span style="color: #10b981; font-weight: 600;">4.60 × 1.80 × 1.45</span>
          </div>
        </div>

        <!-- CỤM 1: LẬT HƯỚNG YAW 180° -->
        <div>
          <div style="font-size: 11px; font-weight: 600; color: #a1a1aa; margin-bottom: 6px; display: flex; justify-content: space-between;">
            <span>LẬT HƯỚNG ĐẦU XE (HEADING)</span>
            <span style="font-size: 9px; font-family: ui-monospace, monospace; color: #71717a;">180° INVERSION</span>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
            <button id="btn-flip-frame" style="
              background: #09090b;
              border: 1px solid #27272a;
              color: #f4f4f5;
              padding: 7px 10px;
              border-radius: 10px;
              font-size: 11px;
              cursor: pointer;
              display: flex;
              justify-content: space-between;
              align-items: center;
              transition: all 0.15s ease;
            ">
              <span>Lật Frame này</span>
              <kbd style="font-size: 9px; font-family: ui-monospace, monospace; padding: 1px 4px; border-radius: 4px; background: #27272a; color: #a1a1aa;">F</kbd>
            </button>

            <button id="btn-flip-track" style="
              background: rgba(239, 68, 68, 0.1);
              border: 1px solid rgba(239, 68, 68, 0.3);
              color: #fca5a5;
              padding: 7px 10px;
              border-radius: 10px;
              font-size: 11px;
              cursor: pointer;
              display: flex;
              justify-content: space-between;
              align-items: center;
              transition: all 0.15s ease;
            ">
              <span>Lật Toàn Track</span>
              <kbd style="font-size: 9px; font-family: ui-monospace, monospace; padding: 1px 4px; border-radius: 4px; background: #27272a; color: #a1a1aa;">⇧F</kbd>
            </button>
          </div>
        </div>

        <!-- CỤM 2: LABEL CLASSES (Lấy cảm hứng 100% từ LabelToolbar của DataForge-AI) -->
        <div>
          <div style="font-size: 11px; font-weight: 600; color: #a1a1aa; margin-bottom: 6px;">
            KHÓA KÍCH THƯỚC CATALOG (GROUND-LOCKED)
          </div>

          <div style="display: flex; flex-direction: column; gap: 5px;">
            <!-- Car / Ô tô -->
            <button class="label-class-btn" data-type="sedan" style="
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: 6px 10px;
              border-radius: 10px;
              font-size: 11px;
              border: 1px solid #10b981;
              background: rgba(16, 185, 129, 0.12);
              color: #6ee7b7;
              cursor: pointer;
            ">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="width: 6px; height: 6px; border-radius: 50%; background: #10b981;"></span>
                <span style="font-weight: 500;">Car / Ô tô điện (Sedan)</span>
              </div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-size: 9px; font-family: ui-monospace, monospace; color: #a1a1aa;">4.6×1.8×1.45m</span>
                <kbd style="font-size: 9px; font-family: ui-monospace, monospace; padding: 1px 4px; border-radius: 4px; background: #27272a; color: #a1a1aa;">1</kbd>
              </div>
            </button>

            <!-- SUV / Crossover -->
            <button class="label-class-btn" data-type="suv" style="
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: 6px 10px;
              border-radius: 10px;
              font-size: 11px;
              border: 1px solid #27272a;
              background: rgba(9, 9, 11, 0.6);
              color: #d4d4d8;
              cursor: pointer;
            ">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="width: 6px; height: 6px; border-radius: 50%; background: #06b6d4;"></span>
                <span>SUV / Crossover</span>
              </div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-size: 9px; font-family: ui-monospace, monospace; color: #71717a;">4.65×1.85×1.68m</span>
                <kbd style="font-size: 9px; font-family: ui-monospace, monospace; padding: 1px 4px; border-radius: 4px; background: #27272a; color: #a1a1aa;">2</kbd>
              </div>
            </button>

            <!-- Motorbike -->
            <button class="label-class-btn" data-type="motorbike" style="
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: 6px 10px;
              border-radius: 10px;
              font-size: 11px;
              border: 1px solid #27272a;
              background: rgba(9, 9, 11, 0.6);
              color: #d4d4d8;
              cursor: pointer;
            ">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="width: 6px; height: 6px; border-radius: 50%; background: #f59e0b;"></span>
                <span>Motorbike / Xe máy</span>
              </div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-size: 9px; font-family: ui-monospace, monospace; color: #71717a;">1.9×0.8×1.45m</span>
                <kbd style="font-size: 9px; font-family: ui-monospace, monospace; padding: 1px 4px; border-radius: 4px; background: #27272a; color: #a1a1aa;">3</kbd>
              </div>
            </button>

            <!-- Truck -->
            <button class="label-class-btn" data-type="truck" style="
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: 6px 10px;
              border-radius: 10px;
              font-size: 11px;
              border: 1px solid #27272a;
              background: rgba(9, 9, 11, 0.6);
              color: #d4d4d8;
              cursor: pointer;
            ">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="width: 6px; height: 6px; border-radius: 50%; background: #a855f7;"></span>
                <span>Truck / Xe tải</span>
              </div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-size: 9px; font-family: ui-monospace, monospace; color: #71717a;">7.5×2.4×3.2m</span>
                <kbd style="font-size: 9px; font-family: ui-monospace, monospace; padding: 1px 4px; border-radius: 4px; background: #27272a; color: #a1a1aa;">4</kbd>
              </div>
            </button>

            <!-- Bus -->
            <button class="label-class-btn" data-type="bus" style="
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: 6px 10px;
              border-radius: 10px;
              font-size: 11px;
              border: 1px solid #27272a;
              background: rgba(9, 9, 11, 0.6);
              color: #d4d4d8;
              cursor: pointer;
            ">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="width: 6px; height: 6px; border-radius: 50%; background: #f43f5e;"></span>
                <span>Bus / Xe buýt điện</span>
              </div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-size: 9px; font-family: ui-monospace, monospace; color: #71717a;">12.0×2.5×3.4m</span>
                <kbd style="font-size: 9px; font-family: ui-monospace, monospace; padding: 1px 4px; border-radius: 4px; background: #27272a; color: #a1a1aa;">5</kbd>
              </div>
            </button>
          </div>

          <!-- NÚT CHỨC NĂNG PHỤ: MEDIAN & SYNC ALL -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 6px;">
            <button id="btn-median" style="
              background: #09090b;
              border: 1px solid #27272a;
              color: #d4d4d8;
              padding: 6px 8px;
              border-radius: 8px;
              font-size: 10px;
              cursor: pointer;
              display: flex;
              justify-content: space-between;
              align-items: center;
            ">
              <span>Làm mịn Median</span>
              <kbd style="font-size: 9px; font-family: monospace; padding: 1px 3px; border-radius: 3px; background: #27272a; color: #71717a;">M</kbd>
            </button>

            <button id="btn-sync-all" style="
              background: #09090b;
              border: 1px solid #27272a;
              color: #d4d4d8;
              padding: 6px 8px;
              border-radius: 8px;
              font-size: 10px;
              cursor: pointer;
              display: flex;
              justify-content: space-between;
              align-items: center;
            ">
              <span>Sync All Frames</span>
              <kbd style="font-size: 9px; font-family: monospace; padding: 1px 3px; border-radius: 3px; background: #27272a; color: #71717a;">⇧S</kbd>
            </button>
          </div>
        </div>

        <!-- CỤM 3: ĐỊA HÌNH & VỈA HÈ -->
        <div>
          <div style="font-size: 11px; font-weight: 600; color: #a1a1aa; margin-bottom: 6px;">
            ĐỊA HÌNH & GẮN MẶT ĐƯỜNG (TERRAIN)
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
            <button id="btn-snap-road" style="
              background: #09090b;
              border: 1px solid #27272a;
              color: #2dd4bf;
              padding: 7px 8px;
              border-radius: 10px;
              font-size: 11px;
              cursor: pointer;
              display: flex;
              justify-content: space-between;
              align-items: center;
            ">
              <span>Ghim Dốc Đường</span>
              <kbd style="font-size: 9px; font-family: monospace; padding: 1px 3px; border-radius: 3px; background: #27272a; color: #71717a;">G</kbd>
            </button>

            <button id="btn-snap-curb" style="
              background: #09090b;
              border: 1px solid #27272a;
              color: #fb7185;
              padding: 7px 8px;
              border-radius: 10px;
              font-size: 11px;
              cursor: pointer;
              display: flex;
              justify-content: space-between;
              align-items: center;
            ">
              <span>Vỉa Hè (+15cm)</span>
              <kbd style="font-size: 9px; font-family: monospace; padding: 1px 3px; border-radius: 3px; background: #27272a; color: #71717a;">⌥G</kbd>
            </button>
          </div>
        </div>

        <!-- CỤM 4: DANH SÁCH FRAMES (BOX LIST COMPACT) -->
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="font-size: 11px; font-weight: 600; color: #a1a1aa;">DANH SÁCH FRAMES (TIMELINE)</span>
            <span style="font-size: 9px; font-family: ui-monospace, monospace; color: #71717a;">CLICK ĐÚP NHẢY</span>
          </div>

          <div style="
            background: #09090b;
            border: 1px solid #27272a;
            border-radius: 10px;
            max-height: 120px;
            overflow-y: auto;
            font-size: 11px;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          ">
            <div style="padding: 16px; text-align: center; color: #52525b; font-size: 10px;">
              Chưa có đối tượng nào được chọn.<br>Click vào một xe 3D để hiển thị timeline.
            </div>
          </div>
        </div>
      </div>

      <!-- FOOTER -->
      <div style="
        padding: 8px 14px;
        background: #09090b;
        border-top: 1px solid #27272a;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 10px;
        color: #71717a;
      ">
        <span>MODE: ZERO-F5</span>
        <span style="color: #10b981; display: flex; align-items: center; gap: 4px;">
          <span style="width: 5px; height: 5px; border-radius: 50%; background: #10b981;"></span>
          CONNECTED
        </span>
      </div>
    `;

    // Sự kiện nút thu gọn
    const collapseBtn = this.container.querySelector("#cvat-3d-collapse-btn");
    if (collapseBtn) {
      collapseBtn.addEventListener("click", () => this.toggleCollapse());
    }
  }

  public destroy(): void {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
      this.container = null;
    }
  }
}
