import { ICONS } from "../../icons";
import type { FrameTrackItem, BoxEdgeContactsResult, EdgeContactSide } from "../../../cvat/bridge";
import type { TrackStatsInfo, TrackQCResult, ObjectCategory, ActiveMainTab, ActiveViewType, PointColorMode, CanvasThemeMode } from "./panel_state";
import { findBestFitCatalog, STANDARD_VEHICLE_CATALOG, CAR_PRESETS, CYCLIST_PRESETS, PEDESTRIAN_PRESETS, VehicleCatalogItem } from "../../../core/catalog";
import type { OrthoSlicingConfig } from "../../../core/types";

/**
 * Render HTML cho từng badge trạng thái mép đón tia (Khít / Cắt lẹm / Hở)
 */
export function renderEdgeContactBadge(title: string, side?: EdgeContactSide): string {
  if (!side) {
    return `
      <div style="text-align: center; padding: 2px 0;">
        <div style="color: #64748b; font-size: 8.5px; font-weight: 600;">${title}</div>
        <div style="color: #94a3b8; font-weight: 600; font-size: 9px; margin-top: 1px;">--</div>
      </div>
    `;
  }

  let bg = "#f0fdf4";
  let border = "#bbf7d0";
  let text = "#15803d";
  let dotHtml = `<span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #16a34a; vertical-align: middle; margin-right: 2px;"></span>`;
  let label = "Khít";
  let sub = side.gapCm !== 0 ? ` (${side.gapCm > 0 ? "+" : ""}${side.gapCm}cm)` : "";

  if (side.status === "cut") {
    bg = "#fef2f2";
    border = "#fecaca";
    text = "#b91c1c";
    dotHtml = `<span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #dc2626; vertical-align: middle; margin-right: 2px;"></span>`;
    label = "Cắt";
    sub = ` (${side.gapCm}cm)`;
  } else if (side.status === "loose") {
    bg = "#f8fafc";
    border = "#e2e8f0";
    text = "#475569";
    dotHtml = `<span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #94a3b8; vertical-align: middle; margin-right: 2px;"></span>`;
    label = "Hở";
    sub = ` (+${side.gapCm}cm)`;
  }

  return `
    <div title="${title}: ${side.label} (${side.gapCm}cm)" style="
      text-align: center;
      background: ${bg};
      border: 1px solid ${border};
      border-radius: 4px;
      padding: 2px 1px;
      transition: all 0.12s;
    ">
      <div style="color: #64748b; font-size: 7.5px; font-weight: 600; white-space: nowrap;">${title}</div>
      <div style="color: ${text}; font-weight: 700; font-size: 8.5px; margin-top: 1px; white-space: nowrap;">
        ${dotHtml}${label}<span style="font-size: 7px; opacity: 0.85;">${sub}</span>
      </div>
    </div>
  `;
}

/**
 * Render dải HUD 5 mép đón tia (Trước, Sau, Trái, Phải, Nóc)
 */
export function renderEdgeContactsHUD(edgeContacts: BoxEdgeContactsResult | null): string {
  return `
    <div style="
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 3px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 3px 4px;
      box-shadow: inset 0 1px 2px rgba(0,0,0,0.02);
    ">
      ${renderEdgeContactBadge("Trước (X+)", edgeContacts?.front)}
      ${renderEdgeContactBadge("Sau (X-)", edgeContacts?.rear)}
      ${renderEdgeContactBadge("Trái (Y+)", edgeContacts?.left)}
      ${renderEdgeContactBadge("Phải (Y-)", edgeContacts?.right)}
      ${renderEdgeContactBadge("Nóc (Z+)", edgeContacts?.roof)}
    </div>
  `;
}

/**
 * Hiển thị dải Sub-Header thống kê Track ID ngay tại cụm tiêu đề Floating Panel
 */
export function renderTrackStatsSubHeader(
  selectedUiId: number | null,
  stats: TrackStatsInfo | null,
  isLoading: boolean,
  currentLabel: string,
  currentFrameNumber: number
): string {
  if (selectedUiId === null) {
    return "";
  }

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
          <span style="font-weight: 700; color: #0284c7;">Track #${selectedUiId}</span>
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
          <span style="font-weight: 700; color: #0284c7;">Track #${selectedUiId}</span>
          <span style="color: #64748b; font-size: 9.5px;">${currentLabel}</span>
        </div>
        <span style="font-size: 9px; color: #94a3b8;">F#${currentFrameNumber}</span>
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
        <span style="font-weight: 700; color: ${isFullyOutside ? "#e11d48" : "#0284c7"};">Track #${selectedUiId}</span>
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
 * Render Header của Floating Panel
 */
export function renderHeader(options: {
  jobText: string;
  viewText: string;
  viewBg: string;
  viewBorder: string;
  viewColor: string;
  hasUndo: boolean;
  hasRedo: boolean;
  lastUndoAction: string;
  lastRedoAction: string;
}): string {
  const { jobText, viewText, viewBg, viewBorder, viewColor, hasUndo, hasRedo, lastUndoAction, lastRedoAction } = options;

  return `
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
        <button id="floating-btn-undo" title="${hasUndo ? `Hoàn tác: ${lastUndoAction} (Ctrl+Z / Cmd+Z)` : 'Không có thao tác nào để hoàn tác (Ctrl+Z)'}" style="
          background: #ffffff;
          border: 1px solid #e2e8f0;
          color: #0f172a;
          cursor: ${hasUndo ? 'pointer' : 'not-allowed'};
          opacity: ${hasUndo ? '1' : '0.35'};
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
        <button id="floating-btn-redo" title="${hasRedo ? `Làm lại: ${lastRedoAction} (Ctrl+Y / Ctrl+Shift+Z)` : 'Không có thao tác nào để làm lại (Ctrl+Y / Ctrl+Shift+Z)'}" style="
          background: #ffffff;
          border: 1px solid #e2e8f0;
          color: #0f172a;
          cursor: ${hasRedo ? 'pointer' : 'not-allowed'};
          opacity: ${hasRedo ? '1' : '0.35'};
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
          <span style="display: flex; align-items: center;">${ICONS.redo}</span>
          <span>Redo</span>
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
  `;
}

/**
 * Render Main Tabs Switcher (Chỉnh sửa vs Kiểm tra QC)
 */
export function renderMainTabsSwitcher(activeMainTab: ActiveMainTab): string {
  return `
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
        background: ${activeMainTab === "edit" ? "#ffffff" : "transparent"};
        color: ${activeMainTab === "edit" ? "#0f172a" : "#64748b"};
        box-shadow: ${activeMainTab === "edit" ? "0 1px 2px rgba(0,0,0,0.06)" : "none"};
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
        background: ${activeMainTab === "qc" ? "#ffffff" : "transparent"};
        color: ${activeMainTab === "qc" ? "#dc2626" : "#64748b"};
        box-shadow: ${activeMainTab === "qc" ? "0 1px 2px rgba(0,0,0,0.06)" : "none"};
      ">
        <span style="display: flex;">${ICONS.shieldCheck}</span>
        <span>Kiểm Tra QC</span>
      </button>
    </div>
  `;
}

/**
 * Render Dropdown Items danh sách xe
 */
export function renderDropdownTrackItems(
  filteredTracks: FrameTrackItem[],
  selectedUiId: number | null,
  searchKeyword: string
): string {
  if (filteredTracks.length > 0) {
    return filteredTracks
      .map((t) => {
        const isSelected = t.uiId === selectedUiId;
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
    return `
      <div style="font-size: 11px; color: #64748b; padding: 8px; text-align: center; font-style: italic;">
        Không tìm thấy xe nào khớp với "${searchKeyword}"
      </div>
    `;
  }
}

/**
 * Render thông báo Inactive State khi chưa có đối tượng nào active
 */
export function renderInactiveNotice(frameTracks: FrameTrackItem[]): string {
  return `
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
        frameTracks.length > 0
          ? `
        <div style="margin-top: 6px; width: 100%; max-width: 270px;">
          <span style="font-size: 10px; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 5px;">Hoặc chọn trong Frame (${frameTracks.length} đối tượng):</span>
          <div style="display: flex; flex-direction: column; gap: 4px; max-height: 130px; overflow-y: auto;">
            ${frameTracks
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
  `;
}

/**
 * Render Accordion tinh chỉnh nâng cao (Z, Pitch, Roll, Yaw, Presets)
 */
export function renderAdvancedControls(): string {
  return `
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
            <button class="btn-micro-pitch" data-delta="-1" title="Vi chỉnh dốc Side -1° (Phím .)" style="flex: 1; background: #f8fafc; border: 1px solid #cbd5e1; color: #334155; font-size: 9px; padding: 3px 0; border-radius: 4px; cursor: pointer;">-1° [ . ]</button>
            <button class="btn-micro-pitch" data-delta="1" title="Vi chỉnh dốc Side +1° (Phím /)" style="flex: 1; background: #f0f9ff; border: 1px solid #bae6fd; color: #0284c7; font-size: 9px; padding: 3px 0; border-radius: 4px; cursor: pointer; font-weight: 600;">+1° [ / ]</button>
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

export interface EditTabRenderOptions {
  selectedUiId: number | null;
  currentLabel: string;
  currentX: number;
  currentY: number;
  currentZ: number;
  currentYawDeg: number;
  currentL: number;
  currentW: number;
  currentH: number;
  editL: number;
  editW: number;
  editH: number;
  isDropdownOpen: boolean;
  searchKeyword: string;
  frameTracks: FrameTrackItem[];
  autoCenterOnFrame: boolean;
  canvasTheme: CanvasThemeMode;
  pointColorMode: PointColorMode;
  colorizeBoxedPoints: boolean;
  orthoPointSize: number;
  selectedCategory: ObjectCategory;
  edgeContacts: BoxEdgeContactsResult | null;
  orthoSlicing: OrthoSlicingConfig;
  applyToTrack: boolean;
  isAdvancedOpen: boolean;
}

/**
 * Render nội dung toàn bộ Tab Chỉnh Sửa (Edit Tab Content)
 */
export function renderEditTabContent(opts: EditTabRenderOptions): string {
  const filteredTracks = opts.frameTracks.filter((t) => {
    if (!opts.searchKeyword.trim()) return true;
    const kw = opts.searchKeyword.trim().toLowerCase().replace("#", "");
    return String(t.uiId).includes(kw) || t.label.toLowerCase().includes(kw);
  });

  const dropdownItemsHtml = renderDropdownTrackItems(filteredTracks, opts.selectedUiId, opts.searchKeyword);

  const bestFit = findBestFitCatalog(
    opts.currentL || 4.6,
    opts.currentW || 1.8,
    opts.currentH || 1.45,
    opts.currentLabel
  );

  const activePresets =
    opts.selectedCategory === "pedestrian"
      ? PEDESTRIAN_PRESETS
      : opts.selectedCategory === "cyclist"
      ? CYCLIST_PRESETS
      : CAR_PRESETS;

  return `
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
          border: 1px solid ${opts.isDropdownOpen ? "#10b981" : "#e2e8f0"};
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
            <span style="color: #059669; font-weight: 700;">${opts.selectedUiId ? `#${opts.selectedUiId}` : "#0"}</span>
            <span style="font-weight: 600; font-size: 11px; color: #09090b;">${opts.selectedUiId ? opts.currentLabel : "Chưa active đối tượng"}</span>
          </span>
          <span style="color: #64748b; font-size: 9px;">${opts.isDropdownOpen ? "▲" : "▼"}</span>
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
          background: ${opts.autoCenterOnFrame ? "#ecfdf5" : "#ffffff"};
          border: 1px solid ${opts.autoCenterOnFrame ? "#a7f3d0" : "#e2e8f0"};
          color: ${opts.autoCenterOnFrame ? "#047857" : "#64748b"};
          padding: 6px 8px;
          border-radius: 6px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          font-weight: 600;
          transition: all 0.12s;
          box-shadow: ${opts.autoCenterOnFrame ? "0 1px 2px rgba(16, 185, 129, 0.12)" : "none"};
          white-space: nowrap;
        ">
          <span style="display: flex; align-items: center; color: ${opts.autoCenterOnFrame ? "#10b981" : "#94a3b8"};">
            ${ICONS.target}
          </span>
          <span>${opts.autoCenterOnFrame ? "Ghim" : "Tự do"}</span>
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
          <!-- NÚT TOGGLE THEME CANVAS: NỀN TRẮNG / NỀN TỐI -->
          <button id="btn-toggle-canvas-theme" title="Chuyển đổi giữa Canvas Nền Trắng (Mây điểm Đen) và Canvas Nền Tối (Mây điểm Sáng)" style="
            background: ${opts.canvasTheme === "light" ? "#f8fafc" : "#1e293b"};
            border: 1px solid ${opts.canvasTheme === "light" ? "#cbd5e1" : "#475569"};
            color: ${opts.canvasTheme === "light" ? "#0f172a" : "#f8fafc"};
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
            <span style="display: flex; align-items: center;">${opts.canvasTheme === "light" ? ICONS.sun : ICONS.moon}</span>
            <span>${opts.canvasTheme === "light" ? "Nền Trắng" : "Nền Tối"}</span>
          </button>

          <!-- NÚT CHUYỂN ĐỔI CHẾ ĐỘ MÀU: INTENSITY VS PLAIN -->
          <button id="btn-toggle-point-color-mode" title="Chuyển đổi giữa chế độ Độ phản xạ (Intensity - Soi vạch sơn, biển báo) và Màu phẳng không xét intensity (Plain - Rõ khối 3D)" style="
            background: ${opts.pointColorMode === "intensity" ? "#eff6ff" : "#ffffff"};
            border: 1px solid ${opts.pointColorMode === "intensity" ? "#93c5fd" : "#cbd5e1"};
            color: ${opts.pointColorMode === "intensity" ? "#1d4ed8" : "#475569"};
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
            <span style="display: flex; align-items: center; gap: 3px;">
              ${opts.pointColorMode === "intensity" ? `${ICONS.zap} Intensity` : `${ICONS.sun} Plain`}
            </span>
          </button>

          <!-- NÚT TOGGLE NHUỘM MÀU XE BỌC -->
          <button id="btn-toggle-colorize-boxed" title="Bật/Tắt nhuộm màu riêng cho các điểm LiDAR nằm trong 3D Box (Tự động áp dụng bền vững cho TOÀN BỘ FRAME)" style="
            background: ${opts.colorizeBoxedPoints ? "#ecfdf5" : "#ffffff"};
            border: 1px solid ${opts.colorizeBoxedPoints ? "#a7f3d0" : "#cbd5e1"};
            color: ${opts.colorizeBoxedPoints ? "#047857" : "#64748b"};
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
            <span>📦 Xe bọc: ${opts.colorizeBoxedPoints ? "BẬT" : "TẮT"}</span>
          </button>

          <!-- NÚT CHUYỂN ĐỔI KÍCH THƯỚC POINT CLOUD (2.0px / 3.5px / 5.0px) -->
          <button id="btn-toggle-ortho-point-size" title="Kích thước hạt điểm mây LiDAR trên 3 khung nhìn trực giao 2D Top/Side/Front (2.0px ➔ 3.5px ➔ 5.0px)" style="
            background: #f0f9ff;
            border: 1px solid #bae6fd;
            color: #0369a1;
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
            <span style="display: flex; align-items: center; color: #0284c7;">${ICONS.target}</span>
            <span>Điểm: ${opts.orthoPointSize.toFixed(1)}px</span>
          </button>
        </div>
      </div>

      <!-- DROPDOWN POPOVER MENU (NẾU ĐANG MỞ) -->
      ${
        opts.isDropdownOpen
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
          <input id="input-dropdown-search" type="text" placeholder="Tìm ID (#1) hoặc loại xe..." value="${opts.searchKeyword}" style="
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
        opts.selectedUiId === null
          ? renderInactiveNotice(opts.frameTracks)
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
          <div style="display: inline-flex; align-items: center; gap: 3px; background: #e2e8f0; padding: 2px; border-radius: 6px;">
            <button type="button" class="btn-category-chip" data-cat="car" title="Chế độ Ô tô / Xe cơ giới (Catalog xe chuẩn - Phím B)" style="
              border: ${opts.selectedCategory === "car" ? "1px solid #a7f3d0" : "1px solid transparent"};
              background: ${opts.selectedCategory === "car" ? "#ecfdf5" : "transparent"};
              color: ${opts.selectedCategory === "car" ? "#047857" : "#475569"};
              padding: 2px 6px;
              border-radius: 4px;
              font-size: 10px;
              font-weight: ${opts.selectedCategory === "car" ? "700" : "500"};
              cursor: pointer;
              display: inline-flex;
              align-items: center;
              gap: 3px;
              box-shadow: ${opts.selectedCategory === "car" ? "0 1px 2px rgba(0,0,0,0.05)" : "none"};
              transition: all 0.12s;
            ">
              <span style="display: flex; align-items: center;">${ICONS.car}</span>
              <span>Ô tô</span>
            </button>
            <button type="button" class="btn-category-chip" data-cat="pedestrian" title="Chế độ Người đi bộ (Fit L, W phím 4, H phím 5)" style="
              border: ${opts.selectedCategory === "pedestrian" ? "1px solid #d8b4fe" : "1px solid transparent"};
              background: ${opts.selectedCategory === "pedestrian" ? "#faf5ff" : "transparent"};
              color: ${opts.selectedCategory === "pedestrian" ? "#6b21a8" : "#475569"};
              padding: 2px 6px;
              border-radius: 4px;
              font-size: 10px;
              font-weight: ${opts.selectedCategory === "pedestrian" ? "700" : "500"};
              cursor: pointer;
              display: inline-flex;
              align-items: center;
              gap: 3px;
              box-shadow: ${opts.selectedCategory === "pedestrian" ? "0 1px 2px rgba(0,0,0,0.05)" : "none"};
              transition: all 0.12s;
            ">
              <span style="display: flex; align-items: center;">${ICONS.user}</span>
              <span>Người</span>
            </button>
            <button type="button" class="btn-category-chip" data-cat="cyclist" title="Chế độ Xe 2 bánh (Fit Rộng W phím 4, Fit Cao H phím 5, Khóa L)" style="
              border: ${opts.selectedCategory === "cyclist" ? "1px solid #fcd34d" : "1px solid transparent"};
              background: ${opts.selectedCategory === "cyclist" ? "#fffbeb" : "transparent"};
              color: ${opts.selectedCategory === "cyclist" ? "#b45309" : "#475569"};
              padding: 2px 6px;
              border-radius: 4px;
              font-size: 10px;
              font-weight: ${opts.selectedCategory === "cyclist" ? "700" : "500"};
              cursor: pointer;
              display: inline-flex;
              align-items: center;
              gap: 3px;
              box-shadow: ${opts.selectedCategory === "cyclist" ? "0 1px 2px rgba(0,0,0,0.05)" : "none"};
              transition: all 0.12s;
            ">
              <span style="display: flex; align-items: center;">${ICONS.bicycle}</span>
              <span>Xe 2 bánh</span>
            </button>
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
          <div><span style="color: #64748b;">X:</span> ${opts.currentX}</div>
          <div><span style="color: #64748b;">Y:</span> ${opts.currentY}</div>
          <div><span style="color: #64748b;">Z:</span> ${opts.currentZ}</div>
          <div><span style="color: #64748b;">Yaw:</span> <span style="color: #059669; font-weight: bold;">${opts.currentYawDeg}°</span></div>
        </div>
      `
      }
    </div>

    ${
      opts.selectedUiId !== null
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
        <!-- DẢI BADGE CẢNH BÁO VIỀN CHẠM POINT TRỰC TIẾP (TOP - SIDE - FRONT HUD) -->
        ${renderEdgeContactsHUD(opts.edgeContacts)}

        ${
          opts.selectedCategory === "car"
            ? `
          <!-- THANH 3 NÚT FIT ĐỘC LẬP THEO 3 CHIỀU (TOP - SIDE - FRONT) -->
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 5px;">
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
        `
            : opts.selectedCategory === "cyclist"
            ? `
          <!-- THANH 3 NÚT FIT ĐỘC LẬP CHO XE 2 BÁNH (TOP - SIDE - FRONT) -->
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 5px;">
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
          <button id="btn-snap-ground-track" title="Tự động ghim đất & vỉa hè cho TẤT CẢ các frame theo Track ID #${opts.selectedUiId !== null ? opts.selectedUiId : 'N/A'} (Phím Shift+G)" style="
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

      <!-- KHỐI 2.5: LÁT CẮT & LỌC 3 KHUNG NHÌN TRỰC GIAO (TOP, SIDE, FRONT) -->
      <div style="
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        padding: 8px 10px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      ">
        <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 4px; border-bottom: 1px solid #f1f5f9;">
          <span style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; display: flex; align-items: center; gap: 4px;">
            <span style="color: #6366f1; display: flex; align-items: center;">${ICONS.scissors}</span>
            <span>Lát cắt & Lọc trực giao:</span>
          </span>
          <button id="btn-toggle-ortho-slicing" title="Bật/Tắt Lát cắt mỏng trên Side & Front views (GPU Hardware Clipping 60 FPS)" style="
            background: ${opts.orthoSlicing.enabled ? '#eef2ff' : '#f8fafc'};
            border: 1px solid ${opts.orthoSlicing.enabled ? '#c7d2fe' : '#e2e8f0'};
            color: ${opts.orthoSlicing.enabled ? '#4338ca' : '#64748b'};
            padding: 2px 7px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 9.5px;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 4px;
            transition: all 0.12s;
          ">
            <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: ${opts.orthoSlicing.enabled ? '#4f46e5' : '#94a3b8'};"></span>
            <span>${opts.orthoSlicing.enabled ? 'Đang BẬT' : 'Đang TẮT'}</span>
          </button>
        </div>

        <div style="display: grid; grid-template-columns: 1.1fr 1fr 1fr; gap: 5px;">
          <div style="
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 3px 6px;
            display: flex;
            align-items: center;
            justify-content: space-between;
          " title="Độ dày lát cắt Side/Front (m)">
            <button id="btn-slab-minus" style="
              background: #ffffff;
              border: 1px solid #cbd5e1;
              border-radius: 4px;
              width: 18px;
              height: 18px;
              display: flex;
              align-items: center;
              justify-content: center;
              cursor: pointer;
              color: #475569;
              padding: 0;
            ">${ICONS.minus}</button>
            <span style="font-size: 10px; font-weight: 700; color: #1e293b; font-family: monospace;">±${opts.orthoSlicing.slab}m</span>
            <button id="btn-slab-plus" style="
              background: #ffffff;
              border: 1px solid #cbd5e1;
              border-radius: 4px;
              width: 18px;
              height: 18px;
              display: flex;
              align-items: center;
              justify-content: center;
              cursor: pointer;
              color: #475569;
              padding: 0;
            ">${ICONS.plus}</button>
          </div>

          <button id="btn-toggle-hide-ground" title="Top View: Cắt mây điểm mặt đất cao hơn đáy xe +12cm để nhìn rõ viền xe" style="
            background: ${opts.orthoSlicing.hideGround ? '#f0fdf4' : '#ffffff'};
            border: 1px solid ${opts.orthoSlicing.hideGround ? '#86efac' : '#e2e8f0'};
            color: ${opts.orthoSlicing.hideGround ? '#15803d' : '#64748b'};
            padding: 3px 5px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 10px;
            font-weight: 600;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
            transition: all 0.12s;
          ">
            <span style="display: flex; align-items: center;">${ICONS.mountain}</span>
            <span>Tắt Đất</span>
          </button>

          <button id="btn-toggle-isolate-roi" title="Xóa cây cối, nhà cửa ngoài vùng ±1.0m quanh xe trên 3 view trực giao" style="
            background: ${opts.orthoSlicing.isolateROI ? '#eff6ff' : '#ffffff'};
            border: 1px solid ${opts.orthoSlicing.isolateROI ? '#93c5fd' : '#e2e8f0'};
            color: ${opts.orthoSlicing.isolateROI ? '#1d4ed8' : '#64748b'};
            padding: 3px 5px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 10px;
            font-weight: 600;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
            transition: all 0.12s;
          ">
            <span style="display: flex; align-items: center;">${ICONS.focus}</span>
            <span>Khóa ROI</span>
          </button>
        </div>
      </div>

      <!-- KHỐI 3: BỘ ĐIỀU CHỈNH KÍCH THƯỚC & CENTER -->
      <div style="
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        padding: 8px 10px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      ">
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
              background: ${!opts.applyToTrack ? "#ffffff" : "transparent"};
              color: ${!opts.applyToTrack ? "#059669" : "#64748b"};
              font-weight: ${!opts.applyToTrack ? "600" : "normal"};
              box-shadow: ${!opts.applyToTrack ? "0 1px 2px rgba(0,0,0,0.06)" : "none"};
            ">Frame Này</span>
            <span style="
              padding: 2px 7px;
              border-radius: 4px;
              background: ${opts.applyToTrack ? "#fee2e2" : "transparent"};
              color: ${opts.applyToTrack ? "#dc2626" : "#64748b"};
              font-weight: ${opts.applyToTrack ? "600" : "normal"};
              box-shadow: ${opts.applyToTrack ? "0 1px 2px rgba(0,0,0,0.06)" : "none"};
            ">Toàn Track</span>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; gap: 5px;">
          <button id="btn-fit-current-box" title="Fit kích thước L, W, H theo mây điểm tại frame này (Padding +5cm mỗi bên, ghim sàn giữ cố định đáy, chỉ nở lên nóc). ${opts.applyToTrack ? 'Áp dụng Toàn Track' : 'Chỉ Frame Này'}" style="
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

        <div style="display: flex; flex-direction: column; gap: 4px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 7px; padding: 5px 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 9.5px; font-weight: 600; color: #475569;">
              Mẫu ${opts.selectedCategory === "pedestrian" ? "Người đi bộ" : opts.selectedCategory === "cyclist" ? "Xe 2 bánh" : "Ô tô"} chuẩn:
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

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
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
          <div style="display: flex; flex-direction: column; gap: 2px;">
            <span style="font-size: 9px; color: ${opts.selectedCategory === "cyclist" ? "#b45309" : "#64748b"}; font-family: monospace; font-weight: ${opts.selectedCategory === "cyclist" ? "700" : "500"};">
              ${opts.selectedCategory === "cyclist" ? "Dài (L) [🔒 Khóa]:" : "Dài (L) [Side]:"}
            </span>
            <div style="display: flex; align-items: center; background: #f8fafc; border: 1px solid ${opts.selectedCategory === "cyclist" ? "#fcd34d" : "#cbd5e1"}; border-radius: 6px;">
              <button class="btn-step" data-axis="l" data-delta="-0.05" style="border: none; background: transparent; color: #475569; padding: 3px 5px; cursor: pointer; font-weight: bold;">-</button>
              <input id="input-dim-l" type="number" step="0.05" value="${opts.editL || opts.currentL}" style="width: 100%; border: none; background: transparent; color: ${opts.selectedCategory === "cyclist" ? "#b45309" : "#0284c7"}; font-size: 11px; font-weight: bold; text-align: center; outline: none; font-family: monospace;" />
              <button class="btn-step" data-axis="l" data-delta="0.05" style="border: none; background: transparent; color: #475569; padding: 3px 5px; cursor: pointer; font-weight: bold;">+</button>
            </div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 2px;">
            <span style="font-size: 9px; color: #64748b; font-family: monospace; font-weight: 500;">Rộng (W) [Front]:</span>
            <div style="display: flex; align-items: center; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px;">
              <button class="btn-step" data-axis="w" data-delta="-0.05" style="border: none; background: transparent; color: #475569; padding: 3px 5px; cursor: pointer; font-weight: bold;">-</button>
              <input id="input-dim-w" type="number" step="0.05" value="${opts.editW || opts.currentW}" style="width: 100%; border: none; background: transparent; color: #0284c7; font-size: 11px; font-weight: bold; text-align: center; outline: none; font-family: monospace;" />
              <button class="btn-step" data-axis="w" data-delta="0.05" style="border: none; background: transparent; color: #475569; padding: 3px 5px; cursor: pointer; font-weight: bold;">+</button>
            </div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 2px;">
            <span style="font-size: 9px; color: #64748b; font-family: monospace; font-weight: 500;">Cao (H) [Fit Lên]:</span>
            <div style="display: flex; align-items: center; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px;">
              <button class="btn-step" data-axis="h" data-delta="-0.05" style="border: none; background: transparent; color: #475569; padding: 3px 5px; cursor: pointer; font-weight: bold;">-</button>
              <input id="input-dim-h" type="number" step="0.05" value="${opts.editH || opts.currentH}" style="width: 100%; border: none; background: transparent; color: #0284c7; font-size: 11px; font-weight: bold; text-align: center; outline: none; font-family: monospace;" />
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
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 9px; font-weight: 600; color: #475569; font-family: monospace;">Tâm X (Side):</span>
            <div style="display: flex; gap: 3px;">
              <button class="btn-shift-center" data-dx="-0.05" data-dy="0" title="Lùi tâm 5cm" style="border: 1px solid #cbd5e1; background: #ffffff; color: #334155; padding: 1px 5px; border-radius: 3px; font-size: 8.5px; font-family: monospace; cursor: pointer;">-5cm</button>
              <button class="btn-shift-center" data-dx="-0.01" data-dy="0" title="Lùi tâm 1cm" style="border: 1px solid #cbd5e1; background: #ffffff; color: #334155; padding: 1px 5px; border-radius: 3px; font-size: 8.5px; font-family: monospace; cursor: pointer;">-1cm</button>
              <button class="btn-shift-center" data-dx="0.01" data-dy="0" title="Tiến tâm 1cm" style="border: 1px solid #cbd5e1; background: #ffffff; color: #334155; padding: 1px 5px; border-radius: 3px; font-size: 8.5px; font-family: monospace; cursor: pointer;">+1cm</button>
              <button class="btn-shift-center" data-dx="0.05" data-dy="0" title="Tiến tâm 5cm" style="border: 1px solid #cbd5e1; background: #ffffff; color: #334155; padding: 1px 5px; border-radius: 3px; font-size: 8.5px; font-family: monospace; cursor: pointer;">+5cm</button>
            </div>
          </div>

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
        </div>
      </div>

      <!-- KHỐI 4: ACCORDION TINH CHỈNH NÂNG CAO -->
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
          <span>${opts.isAdvancedOpen ? "Thu gọn" : "Mở rộng"}</span>
          <span style="display: flex; align-items: center;">${opts.isAdvancedOpen ? ICONS.chevronUp : ICONS.chevronDown}</span>
        </span>
      </button>

      ${opts.isAdvancedOpen ? renderAdvancedControls() : ""}
      `
        : ""
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
  `;
}

/**
 * Render nội dung Tab QC (Kiểm tra lỗi từng Frame của Track đang chọn)
 */
export function renderQCTabContent(options: {
  selectedUiId: number | null;
  cachedResult?: TrackQCResult;
  currentLabel: string;
  currentFrameNumber: number;
}): string {
  const { selectedUiId, cachedResult, currentLabel, currentFrameNumber } = options;

  const openModalBtnHtml = `
    <button id="btn-open-qc-studio-modal" style="
      width: 100%;
      padding: 8px 12px;
      background: #0284c7;
      border: none;
      border-radius: 6px;
      color: #ffffff;
      font-size: 11.5px;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    ">
      <span style="display: flex; align-items: center;">${ICONS.matrix}</span>
      <span>Mở CVAT 3D QC Studio (Datumaro QA)</span>
    </button>
  `;

  // 1. Chưa chọn Track ID nào
  if (selectedUiId === null) {
    return `
      <div style="display: flex; flex-direction: column; gap: 8px;">
        ${openModalBtnHtml}
        <div style="
          background: #ffffff;
          border: 1px dashed #cbd5e1;
          border-radius: 10px;
          padding: 24px 16px;
          text-align: center;
          color: #64748b;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        ">
          <div style="color: #94a3b8; display: flex; justify-content: center;">
            ${ICONS.target}
          </div>
          <div style="font-size: 12.5px; font-weight: 700; color: #334155;">
            Vui lòng chọn đối tượng để kiểm tra danh sách lỗi
          </div>
          <div style="font-size: 11px; line-height: 1.5; color: #64748b;">
            Nhấp chọn một Box 3D trên Canvas hoặc chọn một ID trong danh sách để kiểm định danh sách lỗi qua từng Frame.
          </div>
        </div>
      </div>
    `;
  }

  // 2. Trạng thái idle hoặc chưa có cache
  if (!cachedResult || cachedResult.status === "idle") {
    return `
      <div style="display: flex; flex-direction: column; gap: 8px;">
        ${openModalBtnHtml}
        <div style="
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 22px 16px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        ">
          <div style="display: flex; align-items: center; justify-content: center; animation: spin 1s linear infinite; color: #2563eb;">
            ${ICONS.radar}
          </div>
          <div style="font-size: 11.5px; font-weight: 700; color: #1e293b;">
            Đang nạp kiểm tra QC ngầm vào RAM...
          </div>
          <div style="font-size: 10.5px; color: #64748b;">
            Đang phân tích các frames của Track #${selectedUiId} (${currentLabel})
          </div>
        </div>
      </div>
    `;
  }

  // Trạng thái đang tải
  if (cachedResult.status === "loading") {
    return `
      <div style="display: flex; flex-direction: column; gap: 8px;">
        ${openModalBtnHtml}
        <div style="
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 22px 16px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        ">
          <div style="display: flex; align-items: center; justify-content: center; animation: spin 1s linear infinite; color: #2563eb;">
            ${ICONS.radar}
          </div>
          <div style="font-size: 11.5px; font-weight: 700; color: #1e293b;">
            Đang nạp kiểm tra QC ngầm vào RAM...
          </div>
          <div style="font-size: 10.5px; color: #64748b;">
            Đang phân tích các frames của Track #${cachedResult.trackId} (${cachedResult.label})
          </div>
        </div>
      </div>
    `;
  }

  // Trạng thái lỗi tải
  if (cachedResult.status === "error") {
    return `
      <div style="display: flex; flex-direction: column; gap: 8px;">
        ${openModalBtnHtml}
        <div style="
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 10px;
          padding: 16px 12px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          text-align: center;
        ">
          <div style="font-size: 11.5px; font-weight: 700; color: #dc2626;">
            Không thể nạp dữ liệu QC cho Track #${cachedResult.trackId}
          </div>
          <div style="font-size: 10px; color: #991b1b;">
            ${cachedResult.errorMessage || "Vui lòng thử lại"}
          </div>
          <button id="btn-retry-track-qc" style="
            background: #ffffff;
            border: 1px solid #fca5a5;
            border-radius: 6px;
            padding: 4px 10px;
            font-size: 10.5px;
            font-weight: 600;
            color: #dc2626;
            cursor: pointer;
          ">Thử lại</button>
        </div>
      </div>
    `;
  }

  // Trạng thái READY
  const isClean = cachedResult.errorFrames.length === 0;

  const headerHtml = `
    <div style="
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    ">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="font-size: 12.5px; font-weight: 800; color: #0f172a; font-family: monospace;">
            #${cachedResult.trackId}
          </span>
          <span style="font-size: 11px; font-weight: 600; color: #475569;">
            ${cachedResult.label}
          </span>
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="
            font-size: 10.5px;
            font-weight: 700;
            padding: 2px 8px;
            border-radius: 6px;
            background: ${isClean ? "#ecfdf5" : "#fef2f2"};
            color: ${isClean ? "#059669" : "#dc2626"};
            border: 1px solid ${isClean ? "#a7f3d0" : "#fecaca"};
          ">
            ${isClean ? "✓ Đạt chuẩn 100%" : `${cachedResult.errorFrames.length} frame lỗi`}
          </span>
          <button id="btn-refresh-track-qc" title="Quét lại toàn bộ frames của track này vào RAM" style="
            background: #f8fafc;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            padding: 3px 6px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #475569;
            transition: all 0.15s ease;
          ">
            ${ICONS.refresh}
          </button>
        </div>
      </div>

      <div style="
        display: flex;
        justify-content: space-between;
        font-size: 10px;
        color: #64748b;
        border-top: 1px dashed #e2e8f0;
        padding-top: 6px;
      ">
        <span>Tổng: <strong>${cachedResult.totalFrames} frames</strong></span>
        <span>Chuẩn: <strong style="color: #059669;">${cachedResult.cleanFramesCount}</strong></span>
        <span>Lỗi: <strong style="color: ${cachedResult.errorFrames.length > 0 ? "#dc2626" : "#64748b"};">${cachedResult.errorFrames.length}</strong></span>
      </div>
    </div>
  `;

  if (isClean) {
    return `
      <div style="display: flex; flex-direction: column; gap: 8px;">
        ${openModalBtnHtml}
        ${headerHtml}
        <div style="
          background: #ecfdf5;
          border: 1px solid #a7f3d0;
          border-radius: 10px;
          padding: 18px 14px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
        ">
          <div style="color: #059669; font-size: 12.5px; font-weight: 800; display: flex; align-items: center; gap: 6px;">
            <span>✓</span>
            <span>ĐẠT CHUẨN KIỂM ĐỊNH 100%</span>
          </div>
          <div style="font-size: 10.5px; color: #047857; line-height: 1.5;">
            Toàn bộ ${cachedResult.totalFrames} frames của Track #${cachedResult.trackId} đều đạt chuẩn kích thước Catalog, cao độ Z, hướng xoay Yaw và tính đồng bộ Scale.
          </div>
        </div>
      </div>
    `;
  }

  // Danh sách Frame lỗi
  const errorFramesListHtml = `
    <div style="
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 2px;
    ">
      <span style="font-size: 11px; font-weight: 700; color: #0f172a;">
        Danh sách frame lỗi (${cachedResult.errorFrames.length} frame):
      </span>
      <span style="font-size: 9.5px; color: #64748b;">
        Nhấp để tua tới frame
      </span>
    </div>

    <div style="
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-height: 320px;
      overflow-y: auto;
      padding-right: 2px;
    ">
      ${cachedResult.errorFrames
        .map((group) => {
          const isCurFrame = group.frame === currentFrameNumber;
          return `
            <div class="btn-jump-to-qc-issue"
                 data-frame="${group.frame}"
                 data-track-id="${cachedResult.trackId}"
                 data-issue-title="Frame #${group.frame}"
                 title="Nhấp để tua CVAT tới Frame #${group.frame} và căn chỉnh camera 3D"
                 style="
                   padding: 8px 10px;
                   border-radius: 8px;
                   background: ${group.topSeverity === "error" ? "#fef2f2" : "#fffbeb"};
                   border: 1px solid ${isCurFrame ? "#2563eb" : group.topSeverity === "error" ? "#fca5a5" : "#fde047"};
                   box-shadow: ${isCurFrame ? "0 0 0 2px #93c5fd" : "none"};
                   cursor: pointer;
                   display: flex;
                   flex-direction: column;
                   gap: 4px;
                   transition: all 0.12s ease;
                 ">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span style="
                    font-size: 10px;
                    font-family: monospace;
                    font-weight: 800;
                    padding: 2px 6px;
                    border-radius: 4px;
                    background: ${group.topSeverity === "error" ? "#dc2626" : "#d97706"};
                    color: #ffffff;
                  ">Frame #${group.frame}</span>
                  <span style="font-size: 10px; font-weight: 700; color: ${group.topSeverity === "error" ? "#b91c1c" : "#b45309"};">
                    ${group.issues.length} lỗi
                  </span>
                </div>
                <span style="font-size: 11px; color: #1d4ed8; font-weight: 700; white-space: nowrap; margin-left: 6px;">
                  Tua tới ➔
                </span>
              </div>

              <div style="display: flex; flex-direction: column; gap: 3px; margin-top: 2px;">
                ${group.issues
                  .map(
                    (iss) => `
                  <div style="
                    font-size: 10px;
                    background: rgba(255, 255, 255, 0.85);
                    padding: 4px 6px;
                    border-radius: 4px;
                    border-left: 2px solid ${iss.severity === "error" ? "#dc2626" : "#d97706"};
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                  ">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                      <span style="font-weight: 700; color: ${iss.severity === "error" ? "#dc2626" : "#b45309"};">
                        [${iss.symbol}] ${iss.name}
                      </span>
                      <span style="font-family: monospace; font-size: 9.5px; color: #2563eb; font-weight: 600;">
                        ${iss.value} ➔ ${iss.ref}
                      </span>
                    </div>
                    <div style="font-size: 9px; color: #64748b;">
                      ${iss.detail}
                    </div>
                  </div>
                `
                  )
                  .join("")}
              </div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;

  return `
    <div style="display: flex; flex-direction: column; gap: 8px;">
      ${openModalBtnHtml}
      ${headerHtml}
      ${errorFramesListHtml}
    </div>
  `;
}

/**
 * Render Mini Pill HTML
 */
export function renderMiniPillHtml(): string {
  return `
    <span style="width: 8px; height: 8px; border-radius: 50%; background: #10b981; box-shadow: 0 0 6px #10b981;"></span>
    <span>3D Suite</span>
    <span style="font-size: 10px; font-family: monospace; color: #71717a; background: #f4f4f5; border: 1px solid #e4e4e7; padding: 2px 6px; border-radius: 4px;">\`</span>
  `;
}

/**
 * Render Card Footer
 */
export function renderCardFooter(): string {
  return `
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
}

/**
 * Render Toast Message
 */
export function renderToastHtml(msg: string, type: "success" | "info" | "warning" | "error"): string {
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

  return `
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
}
