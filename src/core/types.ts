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
 * Cấu hình tính năng Tắt mặt đất (Hide Ground) trên khung nhìn Top View.
 */
export interface OrthoSlicingConfig {
  /** Tự động tắt mặt đất trên Top View (cắt tại Z_base + 12cm) */
  hideGround: boolean;
  /** (Legacy/Tương thích ngược) */
  enabled?: boolean;
  slab?: number;
  isolateROI?: boolean;
}
