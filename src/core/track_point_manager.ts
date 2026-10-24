import { Box3D, axes, worldToLocal, localToWorld } from "./geometry";
import { TrackState } from "./track_store";
import { CVATBridge } from "../cvat/bridge";

/**
 * Quản lý bộ nhớ đệm mây điểm LiDAR của toàn bộ dải frame trong Track ID
 * và thuật toán gộp mây điểm đa frame (Multi-Frame Dense Point Cloud Accumulation).
 */
export class TrackPointManager {
  private activeTrackId: number = -1;
  // Lưu trữ các điểm LiDAR thô (World coordinates) theo từng frame
  private framePointsCache: Map<number, Float32Array> = new Map();
  // Lưu trữ Box3D tương ứng tại frame đã lưu điểm để nội suy chuyển hệ tọa độ
  private frameBoxCache: Map<number, Box3D> = new Map();
  private isScanning: boolean = false;
  private abortScanFlag: boolean = false;

  /**
   * Đặt Track ID hiện tại. Nếu đổi xe khác thì reset cache
   */
  public setActiveTrack(trackId: number): void {
    if (this.activeTrackId !== trackId) {
      this.clear();
      this.activeTrackId = trackId;
    }
  }

  /**
   * Xóa toàn bộ cache mây điểm
   */
  public clear(): void {
    this.abortScan();
    this.framePointsCache.clear();
    this.frameBoxCache.clear();
  }

  /**
   * Lưu các điểm LiDAR của frame cụ thể vào cache
   */
  public setFramePoints(frame: number, points: Float32Array | number[], box: Box3D): void {
    const arr = points instanceof Float32Array ? points : new Float32Array(points);
    this.framePointsCache.set(frame, arr);
    this.frameBoxCache.set(frame, {
      c: [...box.c],
      s: [...box.s],
      r: [...box.r],
    });
  }

  /**
   * Lấy điểm LiDAR riêng của một frame
   */
  public getFramePoints(frame: number): Float32Array | null {
    return this.framePointsCache.get(frame) || null;
  }

  /**
   * Kiểm tra frame đã có mây điểm trong cache chưa
   */
  public hasFrame(frame: number): boolean {
    return this.framePointsCache.has(frame);
  }

  /**
   * Đếm tổng số frame đã được nạp mây điểm
   */
  public get loadedFramesCount(): number {
    return this.framePointsCache.size;
  }

  /**
   * Lấy danh sách các frame đã có dữ liệu mây điểm
   */
  public getLoadedFrames(): number[] {
    return Array.from(this.framePointsCache.keys()).sort((a, b) => a - b);
  }

  /**
   * Thuật toán GỘP MÂY ĐIỂM TOÀN TRACK (Dense Multi-Frame Accumulation):
   * Biến đổi tọa độ các điểm từ mọi frame trong cache về hệ quy chiếu của box ở frame mục tiêu.
   */
  public getAccumulatedPoints(currentFrame: number, targetBox: Box3D): Float32Array | null {
    if (this.framePointsCache.size === 0) return null;

    const targetAxes = axes(targetBox.r);
    const totalAccumulated: number[] = [];
    const maxTotalPoints = 65000; // Giới hạn an toàn để đảm bảo mượt mà 60fps trên canvas

    // 1. Điểm của frame hiện tại được ưu tiên đưa vào trước (không cần biến đổi)
    const curPts = this.framePointsCache.get(currentFrame);
    if (curPts && curPts.length > 0) {
      const curCount = curPts.length / 3;
      for (let i = 0; i < curCount; i++) {
        totalAccumulated.push(curPts[i * 3], curPts[i * 3 + 1], curPts[i * 3 + 2]);
      }
    }

    // 2. Duyệt qua các frame khác và chuyển đổi tọa độ theo vị trí tương đối của box
    for (const [f, pts] of this.framePointsCache.entries()) {
      if (f === currentFrame) continue;
      if (totalAccumulated.length / 3 >= maxTotalPoints) break;

      const srcBox = this.frameBoxCache.get(f);
      if (!srcBox) continue;

      const srcAxes = axes(srcBox.r);
      const ptCount = pts.length / 3;

      // Lấy mẫu nếu số lượng điểm quá lớn
      const step = ptCount > 3000 ? 2 : 1;

      for (let i = 0; i < ptCount; i += step) {
        if (totalAccumulated.length / 3 >= maxTotalPoints) break;

        const wx = pts[i * 3];
        const wy = pts[i * 3 + 1];
        const wz = pts[i * 3 + 2];

        // Bước a: Chuyển từ World sang Local của srcBox
        const localP = worldToLocal([wx, wy, wz], srcBox.c, srcAxes);

        // Bước b: Chuyển từ Local của targetBox sang World của targetBox
        const targetWorldP = localToWorld(localP, targetBox.c, targetAxes);

        totalAccumulated.push(targetWorldP[0], targetWorldP[1], targetWorldP[2]);
      }
    }

    if (totalAccumulated.length === 0) return null;
    return new Float32Array(totalAccumulated);
  }

  /**
   * Quét tự động tải toàn bộ curpoint của toàn track:
   * Duyệt qua dải frame của track, lấy ROI point cloud từ Three.js scene và nạp vào cache.
   */
  public async scanTrackCurpoints(
    track: TrackState,
    onProgress: (current: number, total: number, frame: number) => void,
    onComplete: (success: boolean, loadedCount: number) => void
  ): Promise<void> {
    if (this.isScanning) return;
    this.isScanning = true;
    this.abortScanFlag = false;

    // Lấy dải frame của track (từ firstFrame đến lastFrame)
    const shapes = [...track.shapes].sort((a, b) => a.frame - b.frame);
    if (shapes.length === 0) {
      this.isScanning = false;
      onComplete(false, 0);
      return;
    }

    const firstF = shapes[0].frame;
    const lastF = shapes[shapes.length - 1].frame;
    const framesToScan: number[] = [];
    for (let f = firstF; f <= lastF; f++) {
      // Chỉ quét những frame mà box không bị ẩn Outside
      const pos = track.at(f);
      if (pos && !pos.outside) {
        framesToScan.push(f);
      }
    }

    const total = framesToScan.length;
    let loaded = 0;

    for (let i = 0; i < total; i++) {
      if (this.abortScanFlag) {
        break;
      }

      const f = framesToScan[i];
      const pos = track.at(f);
      if (!pos) continue;

      onProgress(i + 1, total, f);

      // Nếu đã có trong cache thì chỉ tăng đếm
      if (this.framePointsCache.has(f)) {
        loaded++;
        continue;
      }

      try {
        // Nhảy tới frame trong CVAT
        CVATBridge.jumpToFrame(f);
        // Đợi 160ms để Three.js Canvas3D nạp mây điểm của frame mới vào RAM
        await new Promise((res) => setTimeout(res, 160));

        if (this.abortScanFlag) break;

        // Bán kính quét xung quanh xe (kích thước đường chéo xe + 1.2m)
        const diag = Math.hypot(pos.box.s[0], pos.box.s[1]);
        const radius = Math.max(3.2, diag / 2 + 1.2);

        const rawPoints = await CVATBridge.getRoiLidarPoints(pos.box.c, radius, 12000);
        if (rawPoints && rawPoints.length > 0) {
          this.setFramePoints(f, rawPoints, pos.box);
          loaded++;
        }
      } catch (err) {
        console.warn(`[CVAT 3D Suite] Lỗi khi tải điểm LiDAR frame #${f}:`, err);
      }
    }

    this.isScanning = false;
    onComplete(!this.abortScanFlag, loaded);
  }

  /**
   * Hủy tiến trình quét tự động
   */
  public abortScan(): void {
    if (this.isScanning) {
      this.abortScanFlag = true;
      this.isScanning = false;
    }
  }

  public get isScanActive(): boolean {
    return this.isScanning;
  }
}
