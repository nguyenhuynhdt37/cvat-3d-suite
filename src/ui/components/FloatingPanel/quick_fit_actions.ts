import type { CVATContext, OrthoSlicingConfig } from "../../../core/types";
import type { FrameTrackItem } from "../../../cvat/bridge";
import { CVATBridge } from "../../../cvat/bridge";
import type { ObjectCategory, ActiveViewType } from "./panel_state";
import { findBestFitCatalog, type VehicleCatalogItem } from "../../../core/catalog";

export interface IFloatingPanelActionsHost {
  currentCtx: CVATContext | null;
  selectedUiId: number | null;
  selectedTrackId: number | null;
  selectedServerId: number | null;
  selectedCategory: ObjectCategory;
  applyToTrack: boolean;
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
  currentFrameNumber: number;
  currentAttributes: Record<string, any>;
  isProcessing: boolean;
  frameTracks: FrameTrackItem[];
  container: HTMLDivElement | null;
  currentActiveView: ActiveViewType;
  orthoSlicing: OrthoSlicingConfig;
  showToast(msg: string, type?: "success" | "info" | "warning" | "error"): void;
  pushUndoSnapshot(actionName: string, forTrack?: boolean): Promise<void>;
  onBoxModificationSuccess(applyToTrack?: boolean): void;
  updateContent(): void;
  scheduleUpdate(): void;
  ensureActiveTrackSelected(): Promise<number | null>;
  syncFrameTracks(): Promise<void>;
  loadTrackStats(uiId: number | null, immediate?: boolean): Promise<void>;
  saveAndSyncOrthoSlicing(): void;
}

/**
 * Vi chỉnh nhanh Box 3D bằng tổ hợp phím Shift + WASD theo Screen Space trực quan
 */
export async function handleNudgeByView(panel: IFloatingPanelActionsHost, key: "w" | "a" | "s" | "d"): Promise<void> {
  const activeId = await panel.ensureActiveTrackSelected();
  if (!activeId || !panel.currentCtx?.jobId) {
    panel.showToast("Chưa chọn đối tượng để vi chỉnh!", "warning");
    return;
  }

  const step = 0.02; // 2cm mỗi lần bấm
  let deltaXWorld = 0;
  let deltaYWorld = 0;
  let deltaZWorld = 0;

  const view = panel.currentActiveView;

  switch (view) {
    case "side":
      if (key === "w") deltaZWorld = step;
      if (key === "s") deltaZWorld = -step;
      if (key === "a") deltaXWorld = -step;
      if (key === "d") deltaXWorld = step;
      break;

    case "front":
      if (key === "w") deltaZWorld = step;
      if (key === "s") deltaZWorld = -step;
      if (key === "a") deltaYWorld = step;
      if (key === "d") deltaYWorld = -step;
      break;

    case "top":
    case "perspective":
    default:
      if (key === "w") deltaXWorld = step;
      if (key === "s") deltaXWorld = -step;
      if (key === "a") deltaYWorld = step;
      if (key === "d") deltaYWorld = -step;
      break;
  }

  try {
    await panel.pushUndoSnapshot(
      `Shift+WASD Nudge [${view.toUpperCase()}]: ${key.toUpperCase()}`,
      false
    );

    const res = await CVATBridge.shiftTrackCenter(
      panel.currentCtx.jobId,
      activeId,
      panel.selectedServerId,
      deltaXWorld,
      deltaYWorld,
      deltaZWorld,
      false,
      true
    );

    if (res.success) {
      if (res.newX !== undefined) panel.currentX = res.newX;
      if (res.newY !== undefined) panel.currentY = res.newY;
      if (res.newZ !== undefined) panel.currentZ = res.newZ;
      panel.scheduleUpdate();
    }
  } catch (err: any) {
    console.warn("[CVAT 3D Suite] Lỗi vi chỉnh WASD:", err);
  }
}

/**
 * Đánh dấu Outside (ẩn) cho toàn bộ các frame của Track đang chọn
 */
export async function handleSetTrackOutside(panel: IFloatingPanelActionsHost, outside: boolean = true): Promise<void> {
  if (!panel.currentCtx || !panel.currentCtx.jobId) {
    panel.showToast("Chưa kết nối Job CVAT!", "warning");
    return;
  }
  if (panel.selectedUiId === null) {
    panel.showToast("Vui lòng chọn xe trước!", "warning");
    return;
  }
  if (panel.isProcessing) return;

  await panel.pushUndoSnapshot(`${outside ? "Outside (Ẩn)" : "Inside (Hiện)"} Toàn Track #${panel.selectedUiId}`, true);
  panel.isProcessing = true;

  panel.showToast(`Đang đánh dấu ${outside ? "Outside" : "Inside"} cho toàn bộ Track #${panel.selectedUiId}...`, "info");

  try {
    const serverId = panel.selectedServerId || panel.selectedUiId;
    const res = await CVATBridge.setTrackOutside(
      panel.currentCtx.jobId,
      panel.selectedUiId,
      serverId,
      outside,
      panel.currentFrameNumber
    );

    if (res.success) {
      panel.showToast(
        `Đã đánh dấu ${outside ? "Outside (Ẩn)" : "Inside (Hiện)"} cho ${res.count || "toàn bộ"} frame của Track #${panel.selectedUiId}! Bấm Pre để hoàn tác.`,
        "success"
      );
      await panel.syncFrameTracks();
      await panel.loadTrackStats(panel.selectedUiId, true);
    } else {
      panel.showToast(res.message || "Không thể đổi trạng thái Outside!", "error");
    }
  } catch (err: any) {
    panel.showToast(`Lỗi đánh dấu Outside: ${err.message || err}`, "error");
  } finally {
    panel.isProcessing = false;
    panel.updateContent();
  }
}

/**
 * Xử lý Lật ngược đầu xe 180°
 */
export async function handleFlipYaw(panel: IFloatingPanelActionsHost, currentFrameOnly: boolean): Promise<void> {
  if (!panel.currentCtx || !panel.currentCtx.jobId) {
    panel.showToast("Chưa kết nối Job CVAT!", "warning");
    return;
  }

  if (panel.selectedUiId === null) {
    await panel.ensureActiveTrackSelected();
  }

  if (panel.selectedUiId === null) {
    panel.showToast("Vui lòng chọn xe trước!", "warning");
    return;
  }

  if (panel.isProcessing) return;

  await panel.pushUndoSnapshot(`Lật đầu 180° ${currentFrameOnly ? "(Frame này)" : "(Toàn Track)"}`, !currentFrameOnly);
  panel.isProcessing = true;
  panel.showToast(`Đang lật ngược đầu xe 180° ${currentFrameOnly ? "ở frame này" : "toàn bộ track"}...`, "info");

  try {
    const serverId = panel.selectedServerId || panel.selectedUiId;
    const res = await CVATBridge.flipTrackYaw(
      panel.currentCtx.jobId,
      panel.selectedUiId,
      serverId,
      currentFrameOnly
    );

    if (res.success) {
      panel.currentYawDeg = res.newYawDeg;
      const targetItem = panel.frameTracks.find((t) => t.uiId === panel.selectedUiId);
      if (targetItem) {
        targetItem.yawDeg = res.newYawDeg;
      }
      panel.showToast(res.message, "success");
      panel.onBoxModificationSuccess(!currentFrameOnly);
    } else {
      panel.showToast(res.message, "error");
    }
  } catch (err: any) {
    panel.showToast(`Lỗi lật đầu xe: ${err.message || err}`, "error");
  } finally {
    panel.isProcessing = false;
    panel.updateContent();
  }
}

/**
 * Cập nhật kích thước (L, W, H) linh hoạt:
 * - Chuẩn Ground-Lock Z: Khi thay đổi chiều cao H, mặt đáy giữ nguyên cố định, chiều cao nở lên nóc xe.
 */
export async function handleUpdateDimensions(
  panel: IFloatingPanelActionsHost,
  l: number,
  w: number,
  h: number,
  applyToTrack: boolean
): Promise<void> {
  if (!panel.currentCtx || !panel.currentCtx.jobId) {
    panel.showToast("Chưa kết nối Job CVAT!", "warning");
    return;
  }
  if (panel.selectedUiId === null) {
    panel.showToast("Vui lòng chọn xe trước!", "warning");
    return;
  }
  if (panel.isProcessing) return;

  await panel.pushUndoSnapshot(`Đổi kích thước ${l}x${w}x${h}m`, applyToTrack);
  panel.isProcessing = true;
  panel.showToast(`Đang cập nhật kích thước ${l}x${w}x${h}m...`, "info");

  try {
    const serverId = panel.selectedServerId || panel.selectedUiId;
    const res = await CVATBridge.updateTrackDimensions(
      panel.currentCtx.jobId,
      panel.selectedUiId,
      serverId,
      l,
      w,
      h,
      applyToTrack
    );

    if (res.success) {
      panel.currentL = l;
      panel.currentW = w;
      panel.currentH = h;
      panel.editL = l;
      panel.editW = w;
      panel.editH = h;
      if (res.newZ !== undefined) {
        panel.currentZ = res.newZ;
      }

      const targetItem = panel.frameTracks.find((t) => t.uiId === panel.selectedUiId);
      if (targetItem) {
        targetItem.l = l;
        targetItem.w = w;
        targetItem.h = h;
        if (res.newZ !== undefined) {
          targetItem.z = res.newZ;
        }
      }

      panel.showToast(res.message, "success");
      panel.onBoxModificationSuccess(applyToTrack);
    } else {
      panel.showToast(res.message, "error");
    }
  } catch (err: any) {
    panel.showToast(`Lỗi cập nhật kích thước: ${err.message || err}`, "error");
  } finally {
    panel.isProcessing = false;
    panel.updateContent();
  }
}

/**
 * Vi chỉnh kích thước theo bước nhảy Stepper ±5cm
 */
export function handleStepDimension(panel: IFloatingPanelActionsHost, axis: "l" | "w" | "h", delta: number): void {
  let l = panel.currentL;
  let w = panel.currentW;
  let h = panel.currentH;

  if (axis === "l") {
    if (panel.selectedCategory === "cyclist") {
      panel.showToast("Xe 2 bánh khóa cố định chiều dài L theo quy chuẩn!", "warning");
      return;
    }
    l = Math.max(0.1, Math.round((l + delta) * 100) / 100);
    panel.editL = l;
  } else if (axis === "w") {
    w = Math.max(0.1, Math.round((w + delta) * 100) / 100);
    panel.editW = w;
  } else if (axis === "h") {
    h = Math.max(0.1, Math.round((h + delta) * 100) / 100);
    panel.editH = h;
  }

  handleUpdateDimensions(panel, l, w, h, panel.applyToTrack);
}

/**
 * Xoay góc Yaw theo độ lệch (delta degrees)
 */
export async function rotateYawByDelta(panel: IFloatingPanelActionsHost, deg: number): Promise<void> {
  if (!panel.currentCtx || !panel.currentCtx.jobId) {
    panel.showToast("Chưa kết nối Job CVAT!", "warning");
    return;
  }
  if (panel.selectedUiId === null) {
    await panel.ensureActiveTrackSelected();
  }
  if (panel.selectedUiId === null) {
    panel.showToast("Vui lòng chọn xe trước!", "warning");
    return;
  }
  if (panel.isProcessing) return;

  let newDeg = Math.round(panel.currentYawDeg + deg);
  while (newDeg > 180) newDeg -= 360;
  while (newDeg < -180) newDeg += 360;
  const rad = (newDeg * Math.PI) / 180;

  await panel.pushUndoSnapshot(`Xoay Yaw ${deg > 0 ? "+" : ""}${deg}°`, panel.applyToTrack);
  panel.isProcessing = true;

  try {
    const serverId = panel.selectedServerId || panel.selectedUiId;
    window.dispatchEvent(
      new CustomEvent("CVAT_EXT_REQ_FLIP_YAW", {
        detail: {
          jobId: panel.currentCtx.jobId,
          frame: panel.currentFrameNumber,
          uiId: panel.selectedUiId,
          serverId,
          currentFrameOnly: !panel.applyToTrack,
          customYawRad: rad,
        },
      })
    );

    panel.currentYawDeg = newDeg;
    const targetItem = panel.frameTracks.find((t) => t.uiId === panel.selectedUiId);
    if (targetItem) {
      targetItem.yawDeg = newDeg;
    }

    panel.showToast(`Xoay ${deg > 0 ? "+" : ""}${deg}° ➔ Yaw: ${newDeg}°`, "success");
    panel.onBoxModificationSuccess();
  } catch (err: any) {
    panel.showToast(`Lỗi xoay Yaw: ${err.message || err}`, "error");
  } finally {
    panel.isProcessing = false;
    panel.updateContent();
  }
}

/**
 * Vi chỉnh góc nghiêng Dốc Side (Pitch) bằng phím tắt
 */
export async function rotatePitchByDelta(panel: IFloatingPanelActionsHost, deg: number): Promise<void> {
  if (panel.selectedCategory === "pedestrian") {
    panel.showToast("Người đi bộ luôn khóa đứng Roll = 0°, Pitch = 0° theo quy chuẩn!", "warning");
    return;
  }

  await handleSnapGround(panel, "micro_adjust_pitch", {
    deltaDeg: deg,
    applyToTrack: panel.applyToTrack,
  });
}

/**
 * Chuyển đổi phạm vi áp dụng (Frame này <-> Toàn Track)
 */
export function toggleScope(panel: IFloatingPanelActionsHost): void {
  panel.applyToTrack = !panel.applyToTrack;
  panel.updateContent();
  panel.showToast(
    `Đã chuyển phạm vi sang: ${panel.applyToTrack ? "Toàn Bộ Track" : "Chỉ Frame Này"}`,
    "info"
  );
}

/**
 * Xử lý Smart Fit tự động
 */
export async function handleSmartFitAll(panel: IFloatingPanelActionsHost): Promise<void> {
  if (panel.selectedCategory === "pedestrian") {
    await handleFitPedestrian(panel, "all");
  } else if (panel.selectedCategory === "cyclist") {
    await handleFitCyclist(panel, "all");
  } else {
    await handleEgoRayFit(panel, "all");
  }
}

/**
 * Fit Box trực tiếp tại Frame Hiện Tại với Padding 5cm mỗi bên
 */
export async function handleFitCurrentBox(panel: IFloatingPanelActionsHost): Promise<void> {
  if (!panel.currentCtx || !panel.currentCtx.jobId) {
    panel.showToast("Chưa kết nối Job CVAT!", "warning");
    return;
  }
  if (panel.selectedUiId === null) {
    panel.showToast("Vui lòng chọn đối tượng trước!", "warning");
    return;
  }
  if (panel.isProcessing) return;

  if (panel.selectedCategory === "pedestrian") {
    await handleFitPedestrian(panel, "all");
    return;
  }
  if (panel.selectedCategory === "cyclist") {
    await handleFitCyclist(panel, "all");
    return;
  }

  await panel.pushUndoSnapshot("Fit Box Hiện Tại (+5cm Pad)", panel.applyToTrack);
  panel.isProcessing = true;
  panel.showToast("Đang đo mây điểm & Fit Box Ô tô (+5cm Pad, Chuẩn Tool_QC)...", "info");

  try {
    const serverId = panel.selectedServerId || panel.selectedUiId;
    const res = await CVATBridge.fitCurrentBox(
      panel.currentCtx.jobId,
      panel.selectedUiId,
      serverId,
      panel.applyToTrack,
      panel.currentAttributes
    );

    if (res.success && res.newL && res.newW && res.newH) {
      panel.currentL = res.newL;
      panel.currentW = res.newW;
      panel.currentH = res.newH;
      panel.editL = res.newL;
      panel.editW = res.newW;
      panel.editH = res.newH;
      if (res.newZ !== undefined) panel.currentZ = res.newZ;

      const targetItem = panel.frameTracks.find((t) => t.uiId === panel.selectedUiId);
      if (targetItem) {
        targetItem.l = res.newL;
        targetItem.w = res.newW;
        targetItem.h = res.newH;
        if (res.newZ !== undefined) targetItem.z = res.newZ;
      }

      const inputL = panel.container?.querySelector<HTMLInputElement>("#input-dim-l");
      const inputW = panel.container?.querySelector<HTMLInputElement>("#input-dim-w");
      const inputH = panel.container?.querySelector<HTMLInputElement>("#input-dim-h");
      if (inputL) inputL.value = String(res.newL);
      if (inputW) inputW.value = String(res.newW);
      if (inputH) inputH.value = String(res.newH);

      panel.showToast(res.message, "success");
      panel.onBoxModificationSuccess();
    } else {
      panel.showToast(res.message || "Không thể Fit Box với frame hiện tại!", "warning");
    }
  } catch (err: any) {
    panel.showToast(`Lỗi Fit Box: ${err.message || err}`, "error");
  } finally {
    panel.isProcessing = false;
    panel.updateContent();
  }
}

/**
 * Áp dụng kích thước chuẩn từ Preset mẫu (1-click)
 */
export async function handleApplyPreset(panel: IFloatingPanelActionsHost, preset: VehicleCatalogItem): Promise<void> {
  if (!panel.currentCtx || !panel.currentCtx.jobId) {
    panel.showToast("Chưa kết nối Job CVAT!", "warning");
    return;
  }
  if (panel.selectedUiId === null) {
    panel.showToast("Vui lòng chọn đối tượng trước!", "warning");
    return;
  }

  panel.editL = preset.l;
  panel.editW = preset.w;
  panel.editH = preset.h;

  panel.showToast(`Áp dụng mẫu: ${preset.name} (${preset.l}x${preset.w}x${preset.h}m)...`, "info");
  await handleUpdateDimensions(panel, preset.l, preset.w, preset.h, panel.applyToTrack);
}

/**
 * Vi chỉnh Center theo trục cục bộ xe
 */
export async function handleShiftCenter(panel: IFloatingPanelActionsHost, deltaXLocal: number, deltaYLocal: number): Promise<void> {
  if (!panel.currentCtx || !panel.currentCtx.jobId) {
    panel.showToast("Chưa kết nối Job CVAT!", "warning");
    return;
  }
  if (panel.selectedUiId === null) {
    panel.showToast("Vui lòng chọn xe trước!", "warning");
    return;
  }
  if (panel.isProcessing) return;
  await panel.pushUndoSnapshot("Vi Chỉnh Center", panel.applyToTrack);
  panel.isProcessing = true;

  try {
    const serverId = panel.selectedServerId || panel.selectedUiId;
    const res = await CVATBridge.shiftTrackCenter(
      panel.currentCtx.jobId,
      panel.selectedUiId,
      serverId,
      deltaXLocal,
      deltaYLocal,
      0,
      panel.applyToTrack
    );

    if (res.success) {
      if (res.newX !== undefined) panel.currentX = res.newX;
      if (res.newY !== undefined) panel.currentY = res.newY;

      const targetItem = panel.frameTracks.find((t) => t.uiId === panel.selectedUiId);
      if (targetItem) {
        if (res.newX !== undefined) targetItem.x = res.newX;
        if (res.newY !== undefined) targetItem.y = res.newY;
      }

      if (panel.selectedUiId !== null) {
        CVATBridge.centerCanvas3DOnTrack(panel.selectedUiId, { x: panel.currentX, y: panel.currentY, z: panel.currentZ });
      }

      panel.showToast(res.message, "success");
      panel.onBoxModificationSuccess();
    } else {
      panel.showToast(res.message || "Lỗi khi vi chỉnh Center!", "error");
    }
  } catch (err: any) {
    panel.showToast(`Lỗi vi chỉnh Center: ${err.message || err}`, "error");
  } finally {
    panel.isProcessing = false;
    panel.updateContent();
  }
}

/**
 * Xử lý Ghim Mặt Đất & Địa Hình Vỉa Hè
 */
export async function handleSnapGround(
  panel: IFloatingPanelActionsHost,
  mode: "road" | "curb" | "half_curb" | "micro_adjust" | "micro_adjust_pitch" | "micro_adjust_roll" | "reset_slope",
  params?: { deltaCm?: number; deltaDeg?: number; curbHeight?: number; targetGroundZ?: number; applyToTrack?: boolean }
): Promise<void> {
  if (!panel.currentCtx || !panel.currentCtx.jobId) {
    panel.showToast("Chưa kết nối Job CVAT!", "warning");
    return;
  }

  if (panel.selectedUiId === null) {
    await panel.ensureActiveTrackSelected();
  }

  if (panel.selectedUiId === null) {
    panel.showToast("Vui lòng chọn xe trước!", "warning");
    return;
  }

  const forTrack = params?.applyToTrack === true;
  if (panel.isProcessing) return;
  let actionDesc = `Ghim Đất ${forTrack ? "Toàn Track " : ""}(${mode})`;
  if (mode === "micro_adjust_pitch") {
    const dDeg = params?.deltaDeg ?? 1;
    actionDesc = `Xoay dốc Side ${dDeg > 0 ? "+" : ""}${dDeg}° ${forTrack ? "Toàn Track" : ""}`.trim();
  } else if (mode === "micro_adjust_roll") {
    const dDeg = params?.deltaDeg ?? 1;
    actionDesc = `Xoay nghiêng Front ${dDeg > 0 ? "+" : ""}${dDeg}° ${forTrack ? "Toàn Track" : ""}`.trim();
  }
  await panel.pushUndoSnapshot(actionDesc, forTrack);
  panel.isProcessing = true;

  try {
    const serverId = panel.selectedServerId || panel.selectedUiId;
    const res = await CVATBridge.snapTrackToGround(
      panel.currentCtx.jobId,
      panel.selectedUiId,
      serverId,
      mode,
      {
        ...params,
        category: panel.selectedCategory,
        attributes: panel.currentAttributes,
      }
    );

    panel.currentZ = res.newZ;
    const targetItem = panel.frameTracks.find((t) => t.uiId === panel.selectedUiId);
    if (targetItem) {
      targetItem.z = res.newZ;
    }

    if (panel.selectedUiId !== null) {
      CVATBridge.centerCanvas3DOnTrack(panel.selectedUiId, { x: panel.currentX, y: panel.currentY, z: panel.currentZ });
    }

    panel.showToast(res.message, "success");
    panel.onBoxModificationSuccess();
  } catch (err: any) {
    panel.showToast(`Lỗi: ${err.message || err}`, "error");
  } finally {
    panel.isProcessing = false;
    panel.updateContent();
  }
}

/**
 * Nút Riêng: Ghim toàn bộ các frame của Track hiện tại xuống mặt đất
 */
export async function handleSnapGroundTrack(panel: IFloatingPanelActionsHost): Promise<void> {
  await handleSnapGround(panel, "road", { applyToTrack: true });
}

/**
 * Căn góc xoay Yaw theo vạch kẻ làn đường 3D
 */
export async function handleSnapYawToLane(panel: IFloatingPanelActionsHost): Promise<void> {
  if (!panel.currentCtx || !panel.currentCtx.jobId) {
    panel.showToast("Chưa kết nối Job CVAT!", "warning");
    return;
  }
  if (panel.selectedUiId === null) {
    await panel.ensureActiveTrackSelected();
  }
  if (panel.selectedUiId === null) {
    panel.showToast("Cần active đối tượng để thao tác!", "warning");
    return;
  }

  if (panel.selectedCategory !== "car") {
    panel.showToast("Căn làn đường chỉ áp dụng cho Ô tô/Xe cơ giới!", "warning");
    return;
  }

  if (panel.isProcessing) return;
  await panel.pushUndoSnapshot("Căn Yaw Theo Làn 3D", panel.applyToTrack);
  panel.isProcessing = true;
  panel.showToast("Đang quét vạch sơn phản quang 3D để căn Yaw...", "info");

  try {
    const serverId = panel.selectedServerId || panel.selectedUiId;
    const res = await CVATBridge.snapYawToLane(
      panel.currentCtx.jobId,
      panel.selectedUiId,
      serverId,
      !panel.applyToTrack
    );

    if (res.success && res.newYawDeg !== undefined) {
      panel.currentYawDeg = res.newYawDeg;
      if (panel.selectedUiId !== null) {
        CVATBridge.centerCanvas3DOnTrack(panel.selectedUiId, { x: panel.currentX, y: panel.currentY, z: panel.currentZ });
      }
      panel.showToast(res.message, "success");
      panel.onBoxModificationSuccess();
    } else {
      panel.showToast(res.message || "Không tìm thấy vạch sơn rõ nét!", "warning");
    }
  } catch (err: any) {
    panel.showToast(`Lỗi căn Yaw theo làn: ${err.message || err}`, "error");
  } finally {
    panel.isProcessing = false;
    panel.updateContent();
  }
}

/**
 * Xử lý FIT XE: CĂN TOP, CĂN SIDE, CĂN FRONT hoặc GHÉP CHU TRÌNH TOÀN DIỆN
 */
export async function handleEgoRayFit(panel: IFloatingPanelActionsHost, step: "all" | "top" | "side" | "front" = "all"): Promise<void> {
  if (!panel.currentCtx || !panel.currentCtx.jobId) {
    panel.showToast("Chưa kết nối Job CVAT!", "warning");
    return;
  }

  if (panel.selectedUiId === null) {
    await panel.ensureActiveTrackSelected();
  }

  if (panel.selectedUiId === null) {
    panel.showToast("Vui lòng chọn xe trước!", "warning");
    return;
  }

  if (panel.isProcessing) return;
  await panel.pushUndoSnapshot("Fit Toàn Track", true);
  panel.isProcessing = true;

  const stepLabel = step === "top" ? "Căn TOP (Yaw & Nóc)" : step === "side" ? "Căn SIDE (Cản X)" : step === "front" ? "Căn FRONT (Sườn Y)" : "Fit toàn diện";
  panel.showToast(`Đang ${stepLabel}...`, "info");

  try {
    const serverId = panel.selectedServerId || panel.selectedUiId;
    const res = await CVATBridge.fitBoxToEgoRayAndGround(
      panel.currentCtx.jobId,
      panel.selectedUiId,
      serverId,
      panel.applyToTrack,
      true,
      step
    );

    if (res.success) {
      if (res.newX !== undefined) panel.currentX = res.newX;
      if (res.newY !== undefined) panel.currentY = res.newY;
      if (res.newZ !== undefined) panel.currentZ = res.newZ;
      if (res.newYawDeg !== undefined) panel.currentYawDeg = res.newYawDeg;

      const targetItem = panel.frameTracks.find((t) => t.uiId === panel.selectedUiId);
      if (targetItem) {
        if (res.newX !== undefined) targetItem.x = res.newX;
        if (res.newY !== undefined) targetItem.y = res.newY;
        if (res.newZ !== undefined) targetItem.z = res.newZ;
        if (res.newYawDeg !== undefined) targetItem.yawDeg = res.newYawDeg;
      }

      if (panel.selectedUiId !== null) {
        CVATBridge.centerCanvas3DOnTrack(panel.selectedUiId, { x: panel.currentX, y: panel.currentY, z: panel.currentZ });
      }

      panel.showToast(res.message, "success");
      panel.onBoxModificationSuccess();
    } else {
      panel.showToast(res.message, "error");
    }
  } catch (err: any) {
    panel.showToast(`Lỗi ${stepLabel}: ${err.message || err}`, "error");
  } finally {
    panel.isProcessing = false;
    panel.updateContent();
  }
}

export async function handleFitTop(panel: IFloatingPanelActionsHost): Promise<void> {
  if (panel.selectedCategory === "cyclist") {
    await handleFitCyclist(panel, "top");
  } else if (panel.selectedCategory === "pedestrian") {
    await handleFitPedestrian(panel, "top");
  } else {
    await handleEgoRayFit(panel, "top");
  }
}

export async function handleFitSide(panel: IFloatingPanelActionsHost): Promise<void> {
  if (panel.selectedCategory === "cyclist") {
    await handleFitCyclist(panel, "side");
  } else if (panel.selectedCategory === "pedestrian") {
    await handleFitPedestrian(panel, "side");
  } else {
    await handleEgoRayFit(panel, "side");
  }
}

export async function handleFitFront(panel: IFloatingPanelActionsHost): Promise<void> {
  if (panel.selectedCategory === "cyclist") {
    await handleFitCyclist(panel, "front");
  } else if (panel.selectedCategory === "pedestrian") {
    await handleFitPedestrian(panel, "front");
  } else {
    await handleEgoRayFit(panel, "front");
  }
}

export async function handleFitWidth(panel: IFloatingPanelActionsHost): Promise<void> {
  if (panel.selectedCategory === "car") {
    panel.showToast("Ô tô tuân thủ kích thước chuẩn Catalog (Phím B), không áp dụng Fit W tự do!", "warning");
    return;
  }
  if (panel.selectedCategory === "pedestrian") {
    await handleFitPedestrian(panel, "w");
  } else if (panel.selectedCategory === "cyclist") {
    await handleFitCyclist(panel, "w");
  }
}

export async function handleFitHeight(panel: IFloatingPanelActionsHost): Promise<void> {
  if (panel.selectedCategory === "car") {
    panel.showToast("Ô tô tuân thủ kích thước chuẩn Catalog (Phím B), không áp dụng Fit H tự do!", "warning");
    return;
  }
  if (panel.selectedCategory === "pedestrian") {
    await handleFitPedestrian(panel, "h");
  } else if (panel.selectedCategory === "cyclist") {
    await handleFitCyclist(panel, "h");
  }
}

export function handleFitCarDimension(panel: IFloatingPanelActionsHost, dimension: "w" | "h"): void {
  const dimLabel = dimension === "w" ? "Rộng (W)" : "Cao (H)";
  panel.showToast(`Ô tô tuân thủ kích thước chuẩn Catalog (Phím B), không áp dụng Fit ${dimLabel} tự do!`, "warning");
}

/**
 * Xử lý FIT CHUYÊN BIỆT CHO NGƯỜI ĐI BỘ
 */
export async function handleFitPedestrian(
  panel: IFloatingPanelActionsHost,
  step: "all" | "top" | "side" | "front" | "l" | "w" | "h" = "all"
): Promise<void> {
  if (!panel.currentCtx || !panel.currentCtx.jobId) {
    panel.showToast("Chưa kết nối Job CVAT!", "warning");
    return;
  }

  if (panel.selectedUiId === null) {
    await panel.ensureActiveTrackSelected();
  }

  if (panel.selectedUiId === null) {
    panel.showToast("Cần active đối tượng để thao tác!", "warning");
    return;
  }

  if (panel.selectedCategory !== "pedestrian") {
    panel.showToast("Fit Người chỉ áp dụng cho nhãn Người đi bộ!", "warning");
    return;
  }

  if (panel.isProcessing) return;
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

  await panel.pushUndoSnapshot(stepLabel, false);
  panel.isProcessing = true;
  panel.showToast(`Đang ${stepLabel}...`, "info");

  try {
    const serverId = panel.selectedServerId || panel.selectedUiId;
    const res = await CVATBridge.fitPedestrian(
      panel.currentCtx.jobId,
      panel.selectedUiId,
      serverId,
      0.12,
      step,
      panel.applyToTrack
    );

    if (res.success) {
      if (res.newX !== undefined) panel.currentX = res.newX;
      if (res.newY !== undefined) panel.currentY = res.newY;
      if (res.newZ !== undefined) panel.currentZ = res.newZ;
      if (res.newYawDeg !== undefined) panel.currentYawDeg = res.newYawDeg;
      if (res.newL !== undefined) {
        panel.currentL = res.newL;
        panel.editL = res.newL;
      }
      if (res.newW !== undefined) {
        panel.currentW = res.newW;
        panel.editW = res.newW;
      }
      if (res.newH !== undefined) {
        panel.currentH = res.newH;
        panel.editH = res.newH;
      }

      const inputW = panel.container?.querySelector<HTMLInputElement>("#input-dim-w");
      if (inputW && res.newW !== undefined) {
        inputW.value = String(res.newW);
      }
      const inputH = panel.container?.querySelector<HTMLInputElement>("#input-dim-h");
      if (inputH && res.newH !== undefined) {
        inputH.value = String(res.newH);
      }
      const inputL = panel.container?.querySelector<HTMLInputElement>("#input-dim-l");
      if (inputL && res.newL !== undefined) {
        inputL.value = String(res.newL);
      }

      const targetItem = panel.frameTracks.find((t) => t.uiId === panel.selectedUiId);
      if (targetItem) {
        if (res.newX !== undefined) targetItem.x = res.newX;
        if (res.newY !== undefined) targetItem.y = res.newY;
        if (res.newZ !== undefined) targetItem.z = res.newZ;
        if (res.newYawDeg !== undefined) targetItem.yawDeg = res.newYawDeg;
        if (res.newL !== undefined) targetItem.l = res.newL;
        if (res.newW !== undefined) targetItem.w = res.newW;
        if (res.newH !== undefined) targetItem.h = res.newH;
      }

      panel.showToast(res.message, "success");
      panel.onBoxModificationSuccess(panel.applyToTrack);
    } else {
      panel.showToast(res.message, "error");
    }
  } catch (err: any) {
    panel.showToast(`Lỗi ${stepLabel}: ${err.message || err}`, "error");
  } finally {
    panel.isProcessing = false;
    panel.updateContent();
  }
}

/**
 * Xử lý FIT CHUYÊN BIỆT CHO XE 2 BÁNH
 */
export async function handleFitCyclist(
  panel: IFloatingPanelActionsHost,
  step: "all" | "top" | "side" | "front" | "w" | "h" = "all"
): Promise<void> {
  if (!panel.currentCtx || !panel.currentCtx.jobId) {
    panel.showToast("Chưa kết nối Job CVAT!", "warning");
    return;
  }

  if (panel.selectedUiId === null) {
    await panel.ensureActiveTrackSelected();
  }

  if (panel.selectedUiId === null) {
    panel.showToast("Cần active đối tượng để thao tác!", "warning");
    return;
  }

  if (panel.selectedCategory !== "cyclist") {
    panel.showToast("Fit Xe 2 bánh chỉ áp dụng cho nhãn Xe 2 bánh (Cyclist)!", "warning");
    return;
  }

  if (panel.isProcessing) return;
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

  await panel.pushUndoSnapshot(stepLabel, false);
  panel.isProcessing = true;
  panel.showToast(`Đang ${stepLabel}...`, "info");

  try {
    const serverId = panel.selectedServerId || panel.selectedUiId;
    const res = await CVATBridge.fitCyclist(
      panel.currentCtx.jobId,
      panel.selectedUiId,
      serverId,
      0.10,
      step,
      panel.applyToTrack
    );

    if (res.success) {
      if (res.newX !== undefined) panel.currentX = res.newX;
      if (res.newY !== undefined) panel.currentY = res.newY;
      if (res.newZ !== undefined) panel.currentZ = res.newZ;
      if (res.newYawDeg !== undefined) panel.currentYawDeg = res.newYawDeg;
      if (res.newL !== undefined) {
        panel.currentL = res.newL;
        panel.editL = res.newL;
      }
      if (res.newW !== undefined) {
        panel.currentW = res.newW;
        panel.editW = res.newW;
      }
      if (res.newH !== undefined) {
        panel.currentH = res.newH;
        panel.editH = res.newH;
      }

      const inputW = panel.container?.querySelector<HTMLInputElement>("#input-dim-w");
      if (inputW && res.newW !== undefined) {
        inputW.value = String(res.newW);
      }
      const inputH = panel.container?.querySelector<HTMLInputElement>("#input-dim-h");
      if (inputH && res.newH !== undefined) {
        inputH.value = String(res.newH);
      }
      const inputL = panel.container?.querySelector<HTMLInputElement>("#input-dim-l");
      if (inputL && res.newL !== undefined) {
        inputL.value = String(res.newL);
      }

      const targetItem = panel.frameTracks.find((t) => t.uiId === panel.selectedUiId);
      if (targetItem) {
        if (res.newX !== undefined) targetItem.x = res.newX;
        if (res.newY !== undefined) targetItem.y = res.newY;
        if (res.newZ !== undefined) targetItem.z = res.newZ;
        if (res.newYawDeg !== undefined) targetItem.yawDeg = res.newYawDeg;
        if (res.newL !== undefined) targetItem.l = res.newL;
        if (res.newW !== undefined) targetItem.w = res.newW;
        if (res.newH !== undefined) targetItem.h = res.newH;
      }

      panel.showToast(res.message, "success");
      panel.onBoxModificationSuccess(panel.applyToTrack);
    } else {
      panel.showToast(res.message, "error");
    }
  } catch (err: any) {
    panel.showToast(`Lỗi ${stepLabel}: ${err.message || err}`, "error");
  } finally {
    panel.isProcessing = false;
    panel.updateContent();
  }
}

/**
 * Xử lý Căn Hộp Bám Cụm Điểm BẢO TOÀN KÍCH THƯỚC
 */
export async function handleAlignBoxToPoints(panel: IFloatingPanelActionsHost): Promise<void> {
  if (!panel.currentCtx || !panel.currentCtx.jobId) {
    panel.showToast("Chưa kết nối Job CVAT!", "warning");
    return;
  }

  if (panel.selectedUiId === null) {
    panel.showToast("Vui lòng chọn xe trước!", "warning");
    return;
  }

  if (panel.isProcessing) return;
  await panel.pushUndoSnapshot("Căn Hộp Bám Điểm", false);
  panel.isProcessing = true;

  try {
    const serverId = panel.selectedServerId || panel.selectedUiId;
    const res = await CVATBridge.alignBoxToPoints(
      panel.currentCtx.jobId,
      panel.selectedUiId,
      serverId
    );

    if (res.success) {
      if (res.newX !== undefined) panel.currentX = res.newX;
      if (res.newY !== undefined) panel.currentY = res.newY;
      if (res.newZ !== undefined) panel.currentZ = res.newZ;

      const targetItem = panel.frameTracks.find((t) => t.uiId === panel.selectedUiId);
      if (targetItem) {
        if (res.newX !== undefined) targetItem.x = res.newX;
        if (res.newY !== undefined) targetItem.y = res.newY;
        if (res.newZ !== undefined) targetItem.z = res.newZ;
      }

      panel.showToast(res.message, "success");
      panel.onBoxModificationSuccess();
    } else {
      panel.showToast(res.message, "error");
    }
  } catch (err: any) {
    panel.showToast(`Lỗi căn bám điểm: ${err.message || err}`, "error");
  } finally {
    panel.isProcessing = false;
    panel.updateContent();
  }
}

/**
 * Xử lý Khớp Kích Thước Chuẩn Catalog (Phím B)
 */
export async function handleCatalogFit(panel: IFloatingPanelActionsHost): Promise<void> {
  if (!panel.currentCtx || !panel.currentCtx.jobId) {
    panel.showToast("Chưa kết nối Job CVAT!", "warning");
    return;
  }

  if (panel.selectedUiId === null) {
    panel.showToast("Cần active đối tượng để thao tác!", "warning");
    return;
  }

  if (panel.isProcessing) return;

  if (panel.selectedCategory === "pedestrian") {
    const match = findBestFitCatalog(panel.currentL, panel.currentW, panel.currentH, "pedestrian");
    panel.showToast(`Khớp Catalog Người: ${match.matchedItem.name} (${match.recommendedL}x${match.recommendedW}x${match.recommendedH}m, Chuẩn Tool_QC)`, "info");
    await handleUpdateDimensions(panel, match.recommendedL, match.recommendedW, match.recommendedH, panel.applyToTrack);
    return;
  }

  if (panel.selectedCategory === "cyclist") {
    const match = findBestFitCatalog(panel.currentL, panel.currentW, panel.currentH, "cycle");
    panel.showToast(`Khớp Catalog Xe 2 Bánh: ${match.matchedItem.name} (${match.recommendedL}x${match.recommendedW}x${match.recommendedH}m, Chuẩn Tool_QC)`, "info");
    await handleUpdateDimensions(panel, match.recommendedL, match.recommendedW, match.recommendedH, panel.applyToTrack);
    return;
  }

  await panel.pushUndoSnapshot("Khớp Kích Thước Catalog Xe", panel.applyToTrack);
  panel.isProcessing = true;

  try {
    const serverId = panel.selectedServerId || panel.selectedUiId;
    const res = await CVATBridge.autoFitTrack(
      panel.currentCtx.jobId,
      panel.selectedUiId,
      serverId,
      false,
      panel.applyToTrack,
      "catalog"
    );

    if (res.success) {
      if (res.newX !== undefined) panel.currentX = res.newX;
      if (res.newY !== undefined) panel.currentY = res.newY;
      if (res.newZ !== undefined) panel.currentZ = res.newZ;
      if (res.newL !== undefined) {
        panel.currentL = res.newL;
        panel.editL = res.newL;
      }
      if (res.newW !== undefined) {
        panel.currentW = res.newW;
        panel.editW = res.newW;
      }
      if (res.newH !== undefined) {
        panel.currentH = res.newH;
        panel.editH = res.newH;
      }

      const targetItem = panel.frameTracks.find((t) => t.uiId === panel.selectedUiId);
      if (targetItem) {
        if (res.newX !== undefined) targetItem.x = res.newX;
        if (res.newY !== undefined) targetItem.y = res.newY;
        if (res.newZ !== undefined) targetItem.z = res.newZ;
        if (res.newL !== undefined) targetItem.l = res.newL;
        if (res.newW !== undefined) targetItem.w = res.newW;
        if (res.newH !== undefined) targetItem.h = res.newH;
      }

      panel.showToast(res.message, "success");
      panel.onBoxModificationSuccess();
    } else {
      panel.showToast(res.message, "error");
    }
  } catch (err: any) {
    panel.showToast(`Lỗi Khớp Catalog: ${err.message || err}`, "error");
  } finally {
    panel.isProcessing = false;
    panel.updateContent();
  }
}

/**
 * Xử lý Quét Mốc Chuẩn Đẹp Nhất & Tự Fit Đồng Bộ Toàn Track
 */
export async function handleSmartAnchorFit(panel: IFloatingPanelActionsHost): Promise<void> {
  if (!panel.currentCtx || !panel.currentCtx.jobId) {
    panel.showToast("Chưa kết nối Job CVAT!", "warning");
    return;
  }

  if (panel.selectedUiId === null) {
    panel.showToast("Vui lòng chọn xe trước!", "warning");
    return;
  }

  if (panel.isProcessing) return;
  await panel.pushUndoSnapshot("Fit Toàn Track", true);
  panel.isProcessing = true;
  panel.showToast("Đang tìm mốc chuẩn và fit đồng bộ toàn track...", "info");

  try {
    const serverId = panel.selectedServerId || panel.selectedUiId;
    const res = await CVATBridge.smartAnchorTrackFit(
      panel.currentCtx.jobId,
      panel.selectedUiId,
      serverId
    );

    if (res.success) {
      if (res.optL !== undefined) {
        panel.currentL = res.optL;
        panel.editL = res.optL;
      }
      if (res.optW !== undefined) {
        panel.currentW = res.optW;
        panel.editW = res.optW;
      }
      if (res.optH !== undefined) {
        panel.currentH = res.optH;
        panel.editH = res.optH;
      }

      const targetItem = panel.frameTracks.find((t) => t.uiId === panel.selectedUiId);
      if (targetItem) {
        if (res.optL !== undefined) targetItem.l = res.optL;
        if (res.optW !== undefined) targetItem.w = res.optW;
        if (res.optH !== undefined) targetItem.h = res.optH;
      }

      panel.showToast(res.message, "success");
      panel.onBoxModificationSuccess(true);
    } else {
      panel.showToast(res.message, "error");
    }
  } catch (err: any) {
    panel.showToast(`Lỗi Fit Mốc Toàn Track: ${err.message || err}`, "error");
  } finally {
    panel.isProcessing = false;
    panel.updateContent();
  }
}

export function toggleOrthoSlicing(panel: IFloatingPanelActionsHost): void {
  panel.orthoSlicing.enabled = !panel.orthoSlicing.enabled;
  panel.saveAndSyncOrthoSlicing();
  panel.showToast(
    panel.orthoSlicing.enabled
      ? `Đã BẬT lát cắt Side & Front (±${panel.orthoSlicing.slab}m)`
      : "Đã TẮT lát cắt (Toàn cảnh không cắt)",
    "info"
  );
  panel.scheduleUpdate();
}

export function stepOrthoSlab(panel: IFloatingPanelActionsHost, delta: number): void {
  const slabs = [0.3, 0.5, 1.0, 2.0];
  let cur = panel.orthoSlicing.slab;
  let nextSlab = cur;
  if (delta > 0) {
    const found = slabs.find((s) => s > cur + 1e-3);
    nextSlab = found !== undefined ? found : Math.min(4.0, Number((cur + 0.5).toFixed(1)));
  } else {
    const reversed = [...slabs].reverse();
    const found = reversed.find((s) => s < cur - 1e-3);
    nextSlab = found !== undefined ? found : Math.max(0.2, Number((cur - 0.2).toFixed(1)));
  }
  panel.orthoSlicing.slab = nextSlab;
  panel.saveAndSyncOrthoSlicing();
  panel.showToast(`Độ dày lát cắt Side/Front: ±${panel.orthoSlicing.slab}m`, "info");
  panel.scheduleUpdate();
}

export function toggleHideGround(panel: IFloatingPanelActionsHost): void {
  panel.orthoSlicing.hideGround = !panel.orthoSlicing.hideGround;
  panel.saveAndSyncOrthoSlicing();
  panel.showToast(
    panel.orthoSlicing.hideGround
      ? "Đã BẬT tắt mặt đất Top View (Z_base + 12cm)"
      : "Đã TẮT lọc mặt đất Top View",
    "info"
  );
  panel.scheduleUpdate();
}

export function toggleIsolateROI(panel: IFloatingPanelActionsHost): void {
  panel.orthoSlicing.isolateROI = !panel.orthoSlicing.isolateROI;
  panel.saveAndSyncOrthoSlicing();
  panel.showToast(
    panel.orthoSlicing.isolateROI
      ? "Đã BẬT khóa vùng ROI (Xóa cây cối, nhà cửa xung quanh)"
      : "Đã TẮT khóa vùng ROI (Hiển thị toàn bối cảnh)",
    "info"
  );
  panel.scheduleUpdate();
}
