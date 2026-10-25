/**
 * Định nghĩa kiểu dữ liệu ngữ cảnh làm việc của CVAT.
 */
export interface CVATContext {
  /** Trang web hiện tại có phải là CVAT không */
  isCVAT: boolean;
  /** Có đang mở trong một Job gán nhãn cụ thể không */
  isJob: boolean;
  /** Có phải là Job 3D Point Cloud không */
  is3D: boolean;
  /** Domain / Base URL của CVAT (ví dụ: https://cvat.example.com) */
  baseUrl: string;
  /** Task ID (nếu có trong URL) */
  taskId: number | null;
  /** Job ID hiện tại */
  jobId: number | null;
  /** Phiên bản hoặc thông điệp trạng thái */
  statusMessage: string;
}

/**
 * Cấu hình tính năng Lát cắt (Depth Slicing) & Lọc mặt đất/ROI trên 3 khung nhìn trực giao (Top, Side, Front).
 */
export interface OrthoSlicingConfig {
  /** Bật/tắt tính năng lát cắt linh hoạt trên Side & Front views */
  enabled: boolean;
  /** Độ dày mở rộng của lát cắt (mét), ví dụ: 0.3, 0.5, 1.0, 2.0 */
  slab: number;
  /** Tự động tắt mặt đất trên Top View (cắt tại Z_base + 12cm) */
  hideGround: boolean;
  /** Tắt bối cảnh cây cối, nhà cửa xung quanh (ROI Bounding Box) */
  isolateROI: boolean;
}
