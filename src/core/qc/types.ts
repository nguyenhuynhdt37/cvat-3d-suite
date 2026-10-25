/**
 * src/core/qc/types.ts
 * Định nghĩa kiểu dữ liệu và cấu hình cho CVAT 3D QC Suite
 * Đồng bộ 100% với đặc tả Datumaro 1.0 JSON QA (datumaro_qa.py)
 */

// ============================================================================
// 1. CẤU HÌNH DATUMARO QA (100% KHỚP DEFAULT_CONFIG TRONG datumaro_qa.py)
// ============================================================================

export interface SizeRangeLimits {
  length: [number, number];
  width: [number, number];
  height: [number, number];
}

export interface DatumaroQAConfig {
  class_groups: Record<string, string[]>;
  size_limits: Record<string, SizeRangeLimits>;
  size_over_hint: Record<string, string>;
  size_eps: number;
  scale_sync_groups: string[];
  scale_sync_tol: number;
  z_min: number;
  z_max: number;
  rotation_unit: "rad" | "deg";
  max_rotation_jump_deg: number;
  max_frame_gap: number;
  rotation_check_groups: string[];
  overlap_allowed: Record<string, number>;
  overlap_metric: "iou" | "ioa";
  overlap_min_area: number;
  max_distance: number;
  track_id_offset: number;
  default_input?: string;

  // Thuộc tính tương thích ngược dạng camelCase
  classGroups?: Record<string, string[]>;
  sizeLimits?: Record<string, SizeRangeLimits>;
  sizeOverHint?: Record<string, string>;
  sizeEps?: number;
  scaleSyncGroups?: string[];
  scaleSyncTol?: number;
  zMin?: number;
  zMax?: number;
  rotationUnit?: "rad" | "deg";
  maxRotationJumpDeg?: number;
  maxFrameGap?: number;
  rotationCheckGroups?: string[];
  overlapAllowed?: Record<string, number>;
  overlapMetric?: "iou" | "ioa";
  overlapMinArea?: number;
  maxDistance?: number;
  min_lidar_points_near?: number;
  min_lidar_points_far?: number;
  ground_hover_max?: number;
  ground_sink_max?: number;
  motion_speed_threshold?: number;
  motion_cos_threshold?: number;

  minLidarPointsNear?: number;
  minLidarPointsFar?: number;
  groundHoverMax?: number;
  groundSinkMax?: number;
  motionSpeedThreshold?: number;
  motionCosThreshold?: number;
}

export const DEFAULT_DATUMARO_QA_CONFIG: DatumaroQAConfig = {
  class_groups: {
    vehicle: ["vehicle", "vehicles", "car", "truck", "bus", "van", "suv", "sedan", "pickup", "minibus"],
    two_wheel: [
      "two_wheel", "two_wheels", "two_wheeler", "twowheel", "twowheels",
      "motorbike", "motorcycle", "bicycle", "bike"
    ],
    pedestrian: ["pedestrian", "pedestrians", "person", "human", "people"],
  },
  size_limits: {
    vehicle: { length: [3.2, 5.5], width: [1.6, 2.2], height: [1.5, 1.9] },
    two_wheel: { length: [1.5, 2.0], width: [0.6, 0.9], height: [1.5, 1.8] },
    pedestrian: { length: [0.65, 1.0], width: [0.65, 1.0], height: [1.2, 1.9] },
  },
  size_over_hint: {
    vehicle: "có thể là xe bus/truck",
  },
  size_eps: 0.001,
  scale_sync_groups: ["vehicle"],
  scale_sync_tol: 0.01,
  z_min: -3.0,
  z_max: 3.0,
  rotation_unit: "rad",
  max_rotation_jump_deg: 75.0,
  max_frame_gap: 1,
  rotation_check_groups: ["vehicle", "two_wheel", "pedestrian"],
  overlap_allowed: {
    vehicle: 0.0,
    two_wheel: 0.5,
    pedestrian: 0.5,
  },
  overlap_metric: "iou",
  overlap_min_area: 0.001,
  max_distance: 100.0,
  min_lidar_points_near: 3,
  min_lidar_points_far: 1,
  ground_hover_max: 0.1,
  ground_sink_max: -0.06,
  motion_speed_threshold: 0.4,
  motion_cos_threshold: -0.5,
  minLidarPointsNear: 3,
  minLidarPointsFar: 1,
  groundHoverMax: 0.1,
  groundSinkMax: -0.06,
  motionSpeedThreshold: 0.4,
  motionCosThreshold: -0.5,
  track_id_offset: 1,
  default_input: "",
};

// Alias tương thích ngược cho codebase hiện tại
export type QCConfig = DatumaroQAConfig;
export const DEFAULT_QC_CONFIG: QCConfig = {
  ...DEFAULT_DATUMARO_QA_CONFIG,
  classGroups: DEFAULT_DATUMARO_QA_CONFIG.class_groups,
  sizeLimits: DEFAULT_DATUMARO_QA_CONFIG.size_limits,
  sizeOverHint: DEFAULT_DATUMARO_QA_CONFIG.size_over_hint,
  sizeEps: DEFAULT_DATUMARO_QA_CONFIG.size_eps,
  scaleSyncGroups: DEFAULT_DATUMARO_QA_CONFIG.scale_sync_groups,
  scaleSyncTol: DEFAULT_DATUMARO_QA_CONFIG.scale_sync_tol,
  zMin: DEFAULT_DATUMARO_QA_CONFIG.z_min,
  zMax: DEFAULT_DATUMARO_QA_CONFIG.z_max,
  rotationUnit: DEFAULT_DATUMARO_QA_CONFIG.rotation_unit,
  maxRotationJumpDeg: DEFAULT_DATUMARO_QA_CONFIG.max_rotation_jump_deg,
  maxFrameGap: DEFAULT_DATUMARO_QA_CONFIG.max_frame_gap,
  rotationCheckGroups: DEFAULT_DATUMARO_QA_CONFIG.rotation_check_groups,
  overlapAllowed: DEFAULT_DATUMARO_QA_CONFIG.overlap_allowed,
  overlapMetric: DEFAULT_DATUMARO_QA_CONFIG.overlap_metric,
  overlapMinArea: DEFAULT_DATUMARO_QA_CONFIG.overlap_min_area,
  maxDistance: DEFAULT_DATUMARO_QA_CONFIG.max_distance,
  minLidarPointsNear: 3,
  minLidarPointsFar: 1,
  groundHoverMax: 0.1,
  groundSinkMax: -0.06,
  motionSpeedThreshold: 0.4,
  motionCosThreshold: -0.5,
};

// ============================================================================
// 2. SCHEMA DỮ LIỆU ĐẦU VÀO DATUMARO 1.0 JSON
// ============================================================================

export interface DatumaroLabelCategoryItem {
  name: string;
  parent?: string;
  attributes?: string[];
}

export interface DatumaroCategories {
  label?: {
    labels?: DatumaroLabelCategoryItem[];
  };
  [key: string]: any;
}

export interface DatumaroCuboidAnn {
  type: string; // "cuboid_3d"
  id?: string | number;
  label_id?: number;
  position: [number, number, number] | number[];
  rotation: [number, number, number] | number[];
  scale: [number, number, number] | number[];
  attributes?: {
    track_id?: number | string;
    outside?: boolean;
    keyframe?: boolean;
    [key: string]: any;
  };
  [key: string]: any;
}

export interface DatumaroItem {
  id: string | number;
  attr?: {
    frame?: number | string;
    [key: string]: any;
  };
  annotations?: DatumaroCuboidAnn[];
  [key: string]: any;
}

export interface DatumaroDataset {
  dm_format_version?: string;
  categories?: DatumaroCategories;
  items?: DatumaroItem[];
  [key: string]: any;
}

// ============================================================================
// 3. CÁC ĐỊNH NGHĨA KIỂM ĐỊNH (6 BÀI KIỂM TRA CHUẨN + DATA ISSUES)
// ============================================================================

export type QCCheckCode =
  | "scale"            // S: Scale không đồng bộ
  | "size"             // K: Kích thước ngoài ngưỡng
  | "z"                // Z: Z ngoài ngưỡng
  | "rot"              // H: Đổi hướng đột ngột (Yaw jump)
  | "overlap"          // O: Chồng lấn BEV
  | "dist"             // D: Quá xa (> 100m)
  | "data"             // !: Lỗi cấu trúc dữ liệu
  | "empty_box"        // L1: Box rỗng / Quá ít điểm LiDAR
  | "ground_mismatch"  // L2: Đáy box lệch mặt đất
  | "motion_mismatch"; // L3: Đầu xe quay ngược hướng di chuyển

export type QCSeverity = "error" | "warning" | "info";

export interface QCCheckMeta {
  code: QCCheckCode;
  symbol: string;        // S, K, Z, H, O, D, !, L1, L2, L3
  name: string;          // Tên hiển thị
  category: "datumaro" | "data";
  defaultSeverity: QCSeverity;
}

export const QC_CHECKS_CATALOG: Record<QCCheckCode, QCCheckMeta> = {
  scale: {
    code: "scale",
    symbol: "S",
    name: "Scale không đồng bộ",
    category: "datumaro",
    defaultSeverity: "error",
  },
  size: {
    code: "size",
    symbol: "K",
    name: "Kích thước ngoài ngưỡng",
    category: "datumaro",
    defaultSeverity: "warning",
  },
  z: {
    code: "z",
    symbol: "Z",
    name: "Z ngoài ngưỡng",
    category: "datumaro",
    defaultSeverity: "warning",
  },
  rot: {
    code: "rot",
    symbol: "H",
    name: "Đổi hướng đột ngột",
    category: "datumaro",
    defaultSeverity: "error",
  },
  overlap: {
    code: "overlap",
    symbol: "O",
    name: "Chồng lấn",
    category: "datumaro",
    defaultSeverity: "error",
  },
  dist: {
    code: "dist",
    symbol: "D",
    name: "Quá xa",
    category: "datumaro",
    defaultSeverity: "info",
  },
  data: {
    code: "data",
    symbol: "!",
    name: "Lỗi dữ liệu",
    category: "data",
    defaultSeverity: "error",
  },
  empty_box: {
    code: "empty_box",
    symbol: "L1",
    name: "Box rỗng / Quá ít điểm",
    category: "datumaro",
    defaultSeverity: "warning",
  },
  ground_mismatch: {
    code: "ground_mismatch",
    symbol: "L2",
    name: "Lệch mặt đất",
    category: "datumaro",
    defaultSeverity: "warning",
  },
  motion_mismatch: {
    code: "motion_mismatch",
    symbol: "L3",
    name: "Ngược hướng di chuyển",
    category: "datumaro",
    defaultSeverity: "error",
  },
};

export const CHECKS_LIST: Array<{ key: QCCheckCode; name: string; code: string }> = [
  { key: "scale", name: "Scale không đồng bộ", code: "S" },
  { key: "size", name: "Kích thước ngoài ngưỡng", code: "K" },
  { key: "z", name: "Z ngoài ngưỡng", code: "Z" },
  { key: "rot", name: "Đổi hướng đột ngột", code: "H" },
  { key: "overlap", name: "Chồng lấn", code: "O" },
  { key: "dist", name: "Quá xa", code: "D" },
  { key: "empty_box", name: "Box rỗng / Quá ít điểm", code: "L1" },
  { key: "ground_mismatch", name: "Lệch mặt đất", code: "L2" },
  { key: "motion_mismatch", name: "Ngược hướng di chuyển", code: "L3" },
];

export const CHECK_NAME: Record<string, string> = {
  scale: "Scale không đồng bộ",
  size: "Kích thước ngoài ngưỡng",
  z: "Z ngoài ngưỡng",
  rot: "Đổi hướng đột ngột",
  overlap: "Chồng lấn",
  dist: "Quá xa",
  empty_box: "Box rỗng / Quá ít điểm",
  ground_mismatch: "Lệch mặt đất",
  motion_mismatch: "Ngược hướng di chuyển",
};

export const CHECK_CODE: Record<string, string> = {
  scale: "S",
  size: "K",
  z: "Z",
  rot: "H",
  overlap: "O",
  dist: "D",
  empty_box: "L1",
  ground_mismatch: "L2",
  motion_mismatch: "L3",
};

// ============================================================================
// 4. KẾT QUẢ KIỂM ĐỊNH CHI TIẾT (BẢN GHI THEO CHUẨN datumaro_qa.py)
// ============================================================================

export interface QCIssueRecord {
  frame: number;
  item_id: string;
  track: string;
  label: string;
  check: QCCheckCode;
  detail: string;
  value: string | number;
  ref: string;
  other: string; // Track ID đối phương khi chồng lấn
}

export interface QCDataIssue {
  kind: string; // "Cuboid lỗi" | "Thiếu track_id" | "Class không nhận dạng" | "track_id trùng trong 1 frame"
  frame: number | string;
  item_id: string;
  ann_id: string | number;
  detail: string;
}

export interface QCTrackSummary {
  track: string;
  label: string;
  presenceCount: number;
  firstFrame: number | null;
  lastFrame: number | null;
  totalIssues: number;
  issueFramesCount: number;
  checkFrames: Record<string, string>; // ví dụ { scale: "1-3, 7 (4)" }
}

export interface QCFrameSummary {
  frame: number;
  itemId: string;
  objCount: number;
  totalIssues: number;
  issueTracksCount: number;
  checkTracks: Record<string, string>; // ví dụ { overlap: "1&2; 3&4", scale: "1, 2" }
}

export interface QCMatrixCellInfo {
  present: boolean;
  codes: string[];
  severity: "clean" | "warning" | "error";
}

export interface QCMatrixRow {
  track: string;
  label: string;
  totalIssues: number;
  cells: Record<number, QCMatrixCellInfo>;
}

export interface QCMatrixData {
  allFrames: number[];
  rows: QCMatrixRow[];
}

export interface QCSummaryData {
  inPath: string;
  runTime: string;
  version: string;
  nItems: number;
  nObjs: number;
  nTracks: number;
  trackOffsetInfo: string;
  checkStats: Array<{
    key: string;
    name: string;
    code: string;
    issueCount: number;
    trackCount: number;
    frameCount: number;
  }>;
  dataIssueCount: number;
  activeConfig: Record<string, any>;
}

export interface DatumaroQAReport {
  meta: {
    version: string;
    n_items: number;
    n_objs: number;
    n_tracks: number;
    frame_items: Record<number, string>;
  };
  results: {
    scale: QCIssueRecord[];
    size: QCIssueRecord[];
    z: QCIssueRecord[];
    rot: QCIssueRecord[];
    overlap: QCIssueRecord[];
    dist: QCIssueRecord[];
    issues: QCDataIssue[];
  };
  allIssues: QCIssueRecord[];
  dataIssues: QCDataIssue[];
  byTrack: QCTrackSummary[];
  byFrame: QCFrameSummary[];
  matrix: QCMatrixData;
  summary: QCSummaryData;
}

// ============================================================================
// 5. CÁC TYPE TƯƠNG THÍCH NGƯỢC CHO FloatingPanel & Case2
// ============================================================================

export interface QCObjectInstance {
  frame: number;
  trackId: number;
  label: string;
  group: "vehicle" | "two_wheel" | "pedestrian" | "other";
  x: number;
  y: number;
  z: number;
  yaw: number;           // radian
  yawDeg: number;        // độ
  l: number;             // chiều dài (x local)
  w: number;             // chiều rộng (y local)
  h: number;             // chiều cao (z)
  outside?: boolean;
  isKeyframe?: boolean;
}

export interface QCIssue {
  id: string;                    // Unique ID của issue: track_frame_check
  frame: number;
  trackId: number;               // 1-based Track UI ID khớp CVAT
  label: string;
  check: QCCheckCode;
  symbol: string;                // Ký hiệu (S, K, Z, H, O, D, !)
  name: string;                  // Tên lỗi
  severity: QCSeverity;
  detail: string;                // Mô tả chi tiết nguyên nhân
  value: string;                 // Giá trị đo đạc thực tế
  ref: string;                   // Ngưỡng hoặc giá trị chuẩn
  otherTrackId?: number | null;  // Track liên quan (khi bị chồng lấn)
}

export interface QCMatrixCell {
  hasObject: boolean;
  issues: QCIssue[];
  severity: "clean" | "warning" | "error";
  symbols: string[];
}

export interface QCJobReport {
  timestamp: number;
  totalTracks: number;
  totalFrames: number;
  totalObjects: number;
  totalIssues: number;
  healthScore: number;               // Điểm sức khỏe dữ liệu 0 - 100
  cleanFramesCount: number;          // Số frame hoàn toàn sạch
  cleanTracksCount: number;          // Số track hoàn toàn sạch
  criticalIssuesCount: number;       // Số lỗi nghiêm trọng (error)
  warningIssuesCount: number;        // Số cảnh báo (warning)
  infoIssuesCount: number;           // Số lưu ý (info)
  summaryByCheck: Record<QCCheckCode, { count: number; tracksCount: number; framesCount: number }>;
  allIssues: QCIssue[];
  byTrack: Record<number, { trackId: number; label: string; issues: QCIssue[]; framesWithIssues: number[] }>;
  byFrame: Record<number, { frame: number; issues: QCIssue[]; tracksWithIssues: number[] }>;
  matrix: Record<number, Record<number, QCMatrixCell>>; // [trackId][frame]
  framesList: number[];
  tracksList: number[];
}

export interface QCSingleObjectSummary {
  trackId: number;
  frame: number;
  label: string;
  group: string;
  overallStatus: "clean" | "warning" | "error";
  issues: QCIssue[];
  checks: Record<QCCheckCode, {
    passed: boolean;
    severity: QCSeverity | "clean";
    message: string;
    value?: string;
    ref?: string;
  }>;
}
