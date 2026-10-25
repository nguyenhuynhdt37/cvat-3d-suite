/**
 * Modal hiển thị bảng tra cứu phím tắt nổi (Speedrun Hotkeys Cheatsheet Modal)
 * Thiết kế gọn gàng, 100% phím bấm bàn tay trái.
 */
export class HotkeysModal {
  public isOpen: boolean = false;
  private container: HTMLElement | null = null;

  public toggle(): boolean {
    if (this.isOpen) {
      this.close();
      return false;
    } else {
      this.open();
      return true;
    }
  }

  public open(): void {
    if (this.isOpen) return;

    this.isOpen = true;
    this.container = document.createElement("div");
    this.container.id = "cvat-3d-suite-hotkeys-modal";
    this.container.style.position = "fixed";
    this.container.style.top = "0";
    this.container.style.left = "0";
    this.container.style.width = "100vw";
    this.container.style.height = "100vh";
    this.container.style.backgroundColor = "rgba(15, 23, 42, 0.55)";
    this.container.style.backdropFilter = "blur(6px)";
    this.container.style.zIndex = "1000000";
    this.container.style.display = "flex";
    this.container.style.alignItems = "center";
    this.container.style.justifyContent = "center";
    this.container.style.userSelect = "none";
    this.container.style.fontFamily = "ui-sans-serif, system-ui, -apple-system, sans-serif";

    this.container.innerHTML = `
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
                <span>Fit Rộng (W) [Người & Xe 2 bánh]</span>
                <kbd style="background: #faf5ff; border: 1px solid #d8b4fe; color: #7e22ce; padding: 1px 5px; border-radius: 4px; font-weight: 700;">4</kbd>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Fit Cao (H) [Người & Xe 2 bánh]</span>
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
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Xoay dốc Side (Pitch) ±1°</span>
                <div><kbd style="background: #ffffff; border: 1px solid #cbd5e1; padding: 1px 5px; border-radius: 4px; font-weight: 700;">.</kbd> / <kbd style="background: #ffffff; border: 1px solid #cbd5e1; padding: 1px 5px; border-radius: 4px; font-weight: 700;">/</kbd></div>
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
                <span>Hoàn Tác Thao Tác (Undo / Pre)</span>
                <kbd style="background: #ffffff; border: 1px solid #cbd5e1; padding: 1px 4px; border-radius: 4px; font-weight: 700;">Ctrl+Z</kbd>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Làm Lại Thao Tác (Redo)</span>
                <div><kbd style="background: #ffffff; border: 1px solid #cbd5e1; padding: 1px 4px; border-radius: 4px; font-weight: 700;">Ctrl+Y</kbd> / <kbd style="background: #ffffff; border: 1px solid #cbd5e1; padding: 1px 4px; border-radius: 4px; font-weight: 700;">Shift+Z</kbd></div>
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

    document.body.appendChild(this.container);

    const closeBtn = this.container.querySelector("#btn-close-help-modal");
    if (closeBtn) closeBtn.addEventListener("click", () => this.close());

    const footerCloseBtn = this.container.querySelector("#btn-close-help-footer");
    if (footerCloseBtn) footerCloseBtn.addEventListener("click", () => this.close());

    this.container.addEventListener("click", (e) => {
      if (e.target === this.container) {
        this.close();
      }
    });
  }

  public close(): void {
    if (!this.isOpen) return;

    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.container = null;
    this.isOpen = false;
  }
}
