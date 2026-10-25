import type { CVATContext, OrthoSlicingConfig } from "../../../core/types";
import type { FrameTrackItem, BoxEdgeContactsResult } from "../../../cvat/bridge";
import type { QCObjectInstance, QCIssue } from "../../../core/qc/types";

export interface HistorySnapshot {
  uiId: number;
  serverId: number | null;
  frame: number;
  applyToTrack: boolean;
  boxPoints: number[];
  trackShapesBackup?: Array<{ frame: number; outside?: boolean; points: number[] }>;
  afterBoxPoints?: number[];
  afterTrackShapes?: Array<{ frame: number; outside?: boolean; points: number[] }>;
  actionName: string;
}

export type UndoSnapshot = HistorySnapshot;

export interface TrackStatsInfo {
  uiId: number;
  totalFrames: number;
  startFrame: number;
  endFrame: number;
  activeCount: number;
  outsideCount: number;
  isFullyOutside: boolean;
  isFullyActive: boolean;
  label?: string;
}

export interface FrameIssueGroup {
  frame: number;
  issues: QCIssue[];
  topSeverity: "error" | "warning";
}

export interface TrackQCResult {
  trackId: number;
  serverId: number | null;
  label: string;
  status: "idle" | "loading" | "ready" | "error";
  totalFrames: number;
  errorFrames: FrameIssueGroup[];
  cleanFramesCount: number;
  lastScannedAt: number;
  errorMessage?: string;
  trackObjects?: QCObjectInstance[]; // Lưu trữ danh sách đối tượng các frame để revalidate chính xác ngữ cảnh
}

export type ObjectCategory = "car" | "pedestrian" | "cyclist";
export type ActiveMainTab = "edit" | "qc";
export type ActiveViewType = "top" | "side" | "front" | "perspective";
export type PointColorMode = "intensity" | "plain";
export type CanvasThemeMode = "light" | "dark";

export function createDefaultOrthoSlicing(): OrthoSlicingConfig {
  const def: OrthoSlicingConfig = { hideGround: true };
  try {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem("cvat_3d_ortho_slicing") : null;
    if (saved) {
      const parsed = JSON.parse(saved);
      if (typeof parsed.hideGround === "boolean") def.hideGround = parsed.hideGround;
    }
  } catch (_) {}
  return def;
}
