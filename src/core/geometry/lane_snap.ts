/**
 * Module căn vạch kẻ làn đường 3D theo cường độ LiDAR (LiDAR Intensity Lane Snap).
 * RANSAC 2D line fitting & PCA orthogonal line regression.
 */

import { radToDeg } from "./transforms.ts";

export interface LidarPoint3D {
  x: number;
  y: number;
  z: number;
  intensity?: number;
}

export interface LaneIntensityFitResult {
  hasLane: boolean;
  laneYawRad: number;
  laneYawDeg: number;
  deltaYawDeg: number;
  newYawRad: number;
  newYawDeg: number;
  inliersCount: number;
  confidence: number;
  message: string;
}

/**
 * Thuật toán CĂN GÓC YAW THEO VẠCH KẺ LÀN ĐƯỜNG 3D (LiDAR Intensity Lane Snap):
 * - Quét các điểm mặt sàn trong bán kính 12m dọc và 4.5m ngang quanh xe.
 * - Lọc các điểm có cường độ phản xạ laser (Intensity) cao vượt trội (vạch sơn nhiệt phản quang).
 * - Sử dụng RANSAC 2D Line Fitting kết hợp PCA hồi quy trực giao để trích xuất vector tiếp tuyến tim làn.
 * - Tự động căn góc xoay Yaw của xe bám thẳng tắp theo làn đường; nếu không có vạch sơn tự động fallback an toàn 100%.
 */
export function fitYawToLaneIntensity(
  pts: Array<{ x: number; y: number; z: number; intensity?: number }>,
  cx: number,
  cy: number,
  cz: number,
  curYaw: number,
  curL: number = 4.6,
  curW: number = 1.85,
  curH: number = 1.5,
  options: {
    groundZ?: number;
    maxSearchRadiusX?: number;
    maxSearchRadiusY?: number;
    maxAngleDiffDeg?: number;
    intensityPercentile?: number;
    ransacIterations?: number;
    distanceThreshold?: number;
    minInliers?: number;
  } = {}
): LaneIntensityFitResult {
  const defaultYawDeg = radToDeg(curYaw);
  const fallbackResult = (msg: string): LaneIntensityFitResult => ({
    hasLane: false,
    laneYawRad: curYaw,
    laneYawDeg: defaultYawDeg,
    deltaYawDeg: 0,
    newYawRad: curYaw,
    newYawDeg: defaultYawDeg,
    inliersCount: 0,
    confidence: 0,
    message: msg,
  });

  if (!pts || pts.length < 30) {
    return fallbackResult("Không đủ điểm mây LiDAR để quét vạch sơn mặt đường");
  }

  const groundZ = options.groundZ !== undefined ? options.groundZ : cz - curH / 2;
  const searchX = options.maxSearchRadiusX ?? 12.0; // Bán kính dọc 12m (quét dải 24m)
  const searchY = options.maxSearchRadiusY ?? 4.5;  // Bán kính ngang 4.5m (quét đủ 2 vạch kẻ làn)
  const maxAngleDiffDeg = options.maxAngleDiffDeg ?? 35.0; // Góc lệch tối đa cho phép
  const intensityPercentile = options.intensityPercentile ?? 0.85; // Top 15% điểm sáng nhất
  const ransacIters = options.ransacIterations ?? 80;
  const distThreshold = options.distanceThreshold ?? 0.10; // Khoảng cách tới đường thẳng 10cm
  const minInliers = options.minInliers ?? 12;

  const cosY = Math.cos(-curYaw);
  const sinY = Math.sin(-curYaw);

  // 1. Lọc các điểm mặt đất quanh làn xe (Ground ROI Points)
  // Cao độ mặt sàn trong khoảng groundZ ± 0.12m
  const groundPts: Array<{ x: number; y: number; z: number; lx: number; ly: number; intensity: number }> = [];

  for (const p of pts) {
    const dz = Math.abs(p.z - groundZ);
    if (dz > 0.12) continue; // Bỏ qua điểm trên cao hoặc âm sâu dưới cống

    const dx = p.x - cx;
    const dy = p.y - cy;
    const lx = dx * cosY - dy * sinY;
    const ly = dx * sinY + dy * cosY;

    if (Math.abs(lx) <= searchX && Math.abs(ly) <= searchY) {
      const intensity = typeof p.intensity === "number" ? p.intensity : 0;
      groundPts.push({ x: p.x, y: p.y, z: p.z, lx, ly, intensity });
    }
  }

  if (groundPts.length < 25) {
    return fallbackResult(`Số điểm mặt sàn xung quanh quá ít (${groundPts.length} điểm)`);
  }

  // 2. Kiểm tra dữ liệu Intensity & Tính ngưỡng phân vị động
  const intensities = groundPts.map((p) => p.intensity).sort((a, b) => a - b);
  const maxIntensity = intensities[intensities.length - 1];
  const minIntensity = intensities[0];

  // Nếu tất cả điểm đều có intensity = 0 hoặc độ biến thiên quá nhỏ (dưới 15 đơn vị) -> dataset không có intensity
  if (maxIntensity < 20 || maxIntensity - minIntensity < 15) {
    return fallbackResult("Mây điểm không chứa kênh cường độ phản xạ (Intensity) rõ nét của vạch sơn");
  }

  const pIdx = Math.min(intensities.length - 1, Math.floor(intensities.length * intensityPercentile));
  const intensityThreshold = Math.max(35, intensities[pIdx]);

  const candidatePts = groundPts.filter((p) => p.intensity >= intensityThreshold);
  if (candidatePts.length < minInliers) {
    return fallbackResult(`Số điểm hạt giống vạch sơn quá ít (${candidatePts.length} điểm < ${minInliers})`);
  }

  // 3. Thuật toán RANSAC 2D tìm đường thẳng vạch sơn có số inliers lớn nhất
  let bestInliers: typeof candidatePts = [];
  const nCandidates = candidatePts.length;

  for (let iter = 0; iter < ransacIters; iter++) {
    const idx1 = Math.floor(Math.random() * nCandidates);
    let idx2 = Math.floor(Math.random() * nCandidates);
    let attempts = 0;
    while (idx2 === idx1 && attempts++ < 10) {
      idx2 = Math.floor(Math.random() * nCandidates);
    }
    if (idx1 === idx2) continue;

    const p1 = candidatePts[idx1];
    const p2 = candidatePts[idx2];

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const segLenSq = dx * dx + dy * dy;

    // Yêu cầu khoảng cách giữa 2 điểm mẫu tối thiểu 1.2m để hướng đường thẳng ổn định
    if (segLenSq < 1.44) continue;

    const segLen = Math.sqrt(segLenSq);
    // Phương trình pháp tuyến đường thẳng Ax + By + C = 0
    const A = -dy / segLen;
    const B = dx / segLen;
    const C = -(A * p1.x + B * p1.y);

    const currentInliers: typeof candidatePts = [];
    for (let i = 0; i < nCandidates; i++) {
      const pt = candidatePts[i];
      const dist = Math.abs(A * pt.x + B * pt.y + C);
      if (dist <= distThreshold) {
        currentInliers.push(pt);
      }
    }

    if (currentInliers.length > bestInliers.length) {
      bestInliers = currentInliers;
    }
  }

  if (bestInliers.length < minInliers) {
    return fallbackResult(`Không tìm thấy vệt đường thẳng vạch sơn đủ tin cậy (${bestInliers.length} inliers < ${minInliers})`);
  }

  // 4. Tinh chỉnh hướng vạch sơn bằng hồi quy trực giao (PCA 2D trên tập inliers)
  let sumX = 0, sumY = 0;
  for (const p of bestInliers) {
    sumX += p.x;
    sumY += p.y;
  }
  const meanX = sumX / bestInliers.length;
  const meanY = sumY / bestInliers.length;

  let sxx = 0, syy = 0, sxy = 0;
  for (const p of bestInliers) {
    const dx = p.x - meanX;
    const dy = p.y - meanY;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }

  // Hướng trục chính của dải vạch sơn
  const laneHeading = 0.5 * Math.atan2(2 * sxy, sxx - syy);

  // 5. Tìm góc xoay khớp với hướng xe hiện tại (xuôi chiều hoặc ngược chiều)
  const norm = (r: number) => {
    let a = r;
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
  };

  const candYaw1 = norm(laneHeading);
  const candYaw2 = norm(laneHeading + Math.PI);

  const diff1 = Math.abs(norm(curYaw - candYaw1));
  const diff2 = Math.abs(norm(curYaw - candYaw2));

  const chosenYaw = diff1 <= diff2 ? candYaw1 : candYaw2;
  const deltaYawRad = norm(chosenYaw - curYaw);
  const deltaYawDeg = radToDeg(deltaYawRad);

  // Nếu góc lệch quá lớn (> maxAngleDiffDeg = 35 độ) -> xe đang rẽ vuông góc hoặc quay đầu, không ép bám làn
  if (Math.abs(deltaYawDeg) > maxAngleDiffDeg) {
    return fallbackResult(
      `Góc lệch xe so với vạch làn quá lớn (${Math.abs(deltaYawDeg).toFixed(1)}° > ${maxAngleDiffDeg}°), hủy căn làn để bảo vệ góc rẽ thật của xe`
    );
  }

  const newYawRad = Number(chosenYaw.toFixed(5));
  const newYawDeg = Number(radToDeg(newYawRad).toFixed(2));
  const confidence = Math.min(100, Math.max(50, Math.round((bestInliers.length / candidatePts.length) * 100)));

  const sign = deltaYawDeg >= 0 ? "+" : "";
  const msg = `Đã căn Yaw theo vạch kẻ làn đường 3D (${newYawDeg}°, ΔYaw: ${sign}${deltaYawDeg.toFixed(1)}°, Độ tin cậy: ${confidence}%, ${bestInliers.length} điểm vạch sơn)`;

  return {
    hasLane: true,
    laneYawRad: Number(laneHeading.toFixed(5)),
    laneYawDeg: Number(radToDeg(laneHeading).toFixed(2)),
    deltaYawDeg: Number(deltaYawDeg.toFixed(2)),
    newYawRad,
    newYawDeg,
    inliersCount: bestInliers.length,
    confidence,
    message: msg,
  };
}

/**
 * Bí danh đồng bộ cho fitYawToLaneIntensity theo kiến trúc refactoring.
 */
export const alignYawToLidarLaneIntensity = fitYawToLaneIntensity;
