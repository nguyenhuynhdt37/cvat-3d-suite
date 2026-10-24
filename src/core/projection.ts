/**
 * ==============================================================================
 * CVAT 3D SUITE - CORE PROJECTION & LENS DISTORTION ENGINE
 * ==============================================================================
 * Module chuyên trách:
 * 1. Chuyển đổi không gian hình học từ hệ tọa độ LiDAR sang hệ tọa độ Camera.
 * 2. Cắt Near-Plane (Near-Plane Clipping) loại bỏ các điểm sau lưng camera (Z <= 0.1m).
 * 3. Khử méo hình học quang học:
 *    - Mô hình RadTan (Brown-Conrady 5 tham số) cho camera góc rộng.
 *    - Mô hình Fisheye (Kannala-Brandt 4 tham số) cho camera mắt cá 180°.
 *    - Mô hình Pinhole thuần (Zero distortion).
 * 4. Chia nhỏ cạnh cong thích ứng (Adaptive Edge Subdivision) uốn cong mượt mà theo thấu kính.
 * 5. Định vị Camera thông minh thời gian thực (Smart Camera Visibility & Coverage).
 * 6. Trích xuất vùng ảnh ROI 2D chuẩn hóa sẵn sàng cho Module AI nhận diện xe.
 * ==============================================================================
 */

import type { Box3D } from "./geometry.ts";
import { boxCorners, BOX_EDGES } from "./geometry.ts";

/** Mô hình biến dạng ống kính */
export type DistortionModel = "radtan" | "fisheye" | "none";

/** Thông số nội tại của camera (Camera Intrinsics) */
export interface CameraIntrinsics {
  fx: number;
  fy: number;
  cx: number;
  cy: number;
  k1?: number;
  k2?: number;
  p1?: number;
  p2?: number;
  k3?: number;
  k4?: number; // Dành riêng cho Fisheye
}

/** Thông số ngoại tại của camera so với hệ tọa độ LiDAR (Extrinsics: P_cam = R * P_lidar + T) */
export interface CameraExtrinsics {
  /** Ma trận quay 3x3 (dạng mảng phẳng 9 phần tử [r00, r01, r02, r10, ...]) */
  rotation: number[];
  /** Vector tịnh tiến [tx, ty, tz] tính bằng mét */
  translation: [number, number, number];
}

/** Cấu hình đầy đủ của 1 Camera */
export interface CameraConfig {
  id: number;
  name: string;
  imageWidth: number;
  imageHeight: number;
  distortionModel: DistortionModel;
  intrinsics: CameraIntrinsics;
  extrinsics: CameraExtrinsics;
}

/** Tọa độ điểm 2D trên ảnh */
export interface Point2D {
  u: number;
  v: number;
  /** Điểm có nằm trong tầm nhìn hợp lệ của camera không (Z > 0.1m và trong khung ảnh) */
  isValid: boolean;
}

/** Đoạn cạnh 2D được chia nhỏ thành các điểm nội suy để vẽ đường cong */
export interface ProjectedEdge {
  edgeIndex: number;
  startCornerIndex: number;
  endCornerIndex: number;
  points: Point2D[];
  color: string;
  faceType: "front" | "rear" | "left" | "right" | "top" | "bottom" | "vertical";
  isVisible: boolean;
}

/** Kết quả chiếu toàn bộ khung dây của 1 Box 3D lên 1 Camera */
export interface ProjectedBox2D {
  cameraId: number;
  cameraName: string;
  corners2D: Point2D[];
  edges: ProjectedEdge[];
  /** Khung chữ nhật bao quanh 2D [uMin, vMin, uMax, vMax] */
  bbox2D: [number, number, number, number] | null;
  /** Tỷ lệ bao phủ tầm nhìn (0% đến 100%) */
  visibilityCoverage: number;
  /** Số đỉnh nằm trong khung ảnh */
  visibleCornersCount: number;
  /** Camera có nhìn thấy ít nhất 1 phần của box không */
  isVisible: boolean;
  /** Vai trò của camera đối với box này */
  role: "primary" | "secondary" | "out_of_view";
}

/** Kết quả phân tích tầm nhìn trên toàn bộ 8 camera */
export interface CameraVisibilityReport {
  boxes: Array<{
    boxIndex: number;
    primaryCameraId: number | null;
    primaryCameraName: string | null;
    highestCoverage: number;
    cameraCoverages: Array<{
      cameraId: number;
      cameraName: string;
      coveragePercent: number;
      role: "primary" | "secondary" | "out_of_view";
      bbox2D: [number, number, number, number] | null;
    }>;
  }>;
}

/**
 * Biến đổi 1 điểm từ hệ tọa độ LiDAR sang hệ tọa độ Camera:
 * P_cam = R * P_lidar + T
 */
export function lidarToCamera(
  pointLidar: [number, number, number],
  extrinsics: CameraExtrinsics
): [number, number, number] {
  const [lx, ly, lz] = pointLidar;
  const R = extrinsics.rotation;
  const [tx, ty, tz] = extrinsics.translation;

  // Hỗ trợ cả mảng 9 phần tử (3x3) lẫn 16 phần tử (4x4)
  const r00 = R[0], r01 = R[1], r02 = R[2];
  const r10 = R[3] !== undefined ? (R.length >= 16 ? R[4] : R[3]) : 0;
  const r11 = R[4] !== undefined ? (R.length >= 16 ? R[5] : R[4]) : 1;
  const r12 = R[5] !== undefined ? (R.length >= 16 ? R[6] : R[5]) : 0;
  const r20 = R[6] !== undefined ? (R.length >= 16 ? R[8] : R[6]) : 0;
  const r21 = R[7] !== undefined ? (R.length >= 16 ? R[9] : R[7]) : 0;
  const r22 = R[8] !== undefined ? (R.length >= 16 ? R[10] : R[8]) : 1;

  const cx = r00 * lx + r01 * ly + r02 * lz + tx;
  const cy = r10 * lx + r11 * ly + r12 * lz + ty;
  const cz = r20 * lx + r21 * ly + r22 * lz + tz;

  return [cx, cy, cz];
}

/**
 * Chiếu 1 điểm trong không gian Camera (X, Y, Z) sang tọa độ pixel ảnh (u, v)
 * Tích hợp đầy đủ mô hình khử méo hình học: RadTan, Fisheye và Pinhole.
 */
export function projectPointToPixel(
  pointCam: [number, number, number],
  intrinsics: CameraIntrinsics,
  distortionModel: DistortionModel = "none",
  imageWidth: number = 1920,
  imageHeight: number = 1080
): Point2D {
  const [x, y, z] = pointCam;

  // Near-plane guard: Vật thể sau lưng camera hoặc quá sát ống kính
  if (z <= 0.05) {
    return { u: -9999, v: -9999, isValid: false };
  }

  const fx = intrinsics.fx;
  const fy = intrinsics.fy;
  const cx = intrinsics.cx;
  const cy = intrinsics.cy;

  // Chuẩn hóa tọa độ theo chiều sâu
  const xn = x / z;
  const yn = y / z;

  let u = 0;
  let v = 0;

  if (distortionModel === "none") {
    // Pinhole thuần
    u = fx * xn + cx;
    v = fy * yn + cy;
  } else if (distortionModel === "radtan") {
    // Mô hình Brown-Conrady (OpenCV RadTan)
    const k1 = intrinsics.k1 || 0;
    const k2 = intrinsics.k2 || 0;
    const p1 = intrinsics.p1 || 0;
    const p2 = intrinsics.p2 || 0;
    const k3 = intrinsics.k3 || 0;

    const r2 = xn * xn + yn * yn;
    const r4 = r2 * r2;
    const r6 = r4 * r2;

    const radial = 1 + k1 * r2 + k2 * r4 + k3 * r6;
    const xDist = xn * radial + 2 * p1 * xn * yn + p2 * (r2 + 2 * xn * xn);
    const yDist = yn * radial + p1 * (r2 + 2 * yn * yn) + 2 * p2 * xn * yn;

    u = fx * xDist + cx;
    v = fy * yDist + cy;
  } else if (distortionModel === "fisheye") {
    // Mô hình Mắt Cá Kannala-Brandt (OpenCV Fisheye)
    const k1 = intrinsics.k1 || 0;
    const k2 = intrinsics.k2 || 0;
    const k3 = intrinsics.k3 || 0;
    const k4 = intrinsics.k4 || 0;

    const r = Math.sqrt(xn * xn + yn * yn);

    if (r < 1e-8) {
      u = cx;
      v = cy;
    } else {
      const theta = Math.atan(r);
      // Giới hạn góc nhìn bán cầu trước của mắt cá
      if (theta > Math.PI / 2 + 0.15) {
        return { u: -9999, v: -9999, isValid: false };
      }

      const theta2 = theta * theta;
      const theta4 = theta2 * theta2;
      const theta6 = theta4 * theta2;
      const theta8 = theta4 * theta4;

      const thetaD = theta * (1 + k1 * theta2 + k2 * theta4 + k3 * theta6 + k4 * theta8);
      const scale = thetaD / r;

      const xDist = scale * xn;
      const yDist = scale * yn;

      u = fx * xDist + cx;
      v = fy * yDist + cy;
    }
  }

  // Kiểm tra điểm có rơi vào khung hình ảnh hay không
  const isValid = u >= 0 && u <= imageWidth && v >= 0 && v <= imageHeight;

  return {
    u: Number(u.toFixed(2)),
    v: Number(v.toFixed(2)),
    isValid,
  };
}

/**
 * Cắt Near-Plane cho một đoạn thẳng nối giữa 2 điểm trong không gian Camera.
 * Trả về 2 điểm mới đã được giới hạn với Z >= nearPlane (mặc định 0.1m).
 */
export function clipSegmentNearPlane(
  p1: [number, number, number],
  p2: [number, number, number],
  nearPlane: number = 0.1
): { p1Clipped: [number, number, number]; p2Clipped: [number, number, number]; isVisible: boolean } {
  const z1 = p1[2];
  const z2 = p2[2];

  // Trường hợp cả 2 điểm đều sau lưng camera
  if (z1 < nearPlane && z2 < nearPlane) {
    return { p1Clipped: p1, p2Clipped: p2, isVisible: false };
  }

  // Trường hợp cả 2 điểm đều trước mặt camera
  if (z1 >= nearPlane && z2 >= nearPlane) {
    return { p1Clipped: p1, p2Clipped: p2, isVisible: true };
  }

  // Cắt tại giao điểm Z = nearPlane
  const t = (nearPlane - z1) / (z2 - z1);
  const intersectX = p1[0] + t * (p2[0] - p1[0]);
  const intersectY = p1[1] + t * (p2[1] - p1[1]);
  const intersectZ = nearPlane;

  const clipped: [number, number, number] = [intersectX, intersectY, intersectZ];

  if (z1 < nearPlane) {
    return { p1Clipped: clipped, p2Clipped: p2, isVisible: true };
  } else {
    return { p1Clipped: p1, p2Clipped: clipped, isVisible: true };
  }
}

/**
 * Gán màu sắc chuẩn tự hành cho từng cạnh của Box 3D:
 * - Mặt trước (Front): Đỏ (#ef4444)
 * - Mặt sau (Rear): Xanh dương (#3b82f6)
 * - Sườn trái (Left): Xanh lục (#22c55e)
 * - Sườn phải (Right): Xanh ngọc (#06b6d4)
 * - Nóc (Top): Vàng (#eab308)
 * - Đáy (Bottom): Xám (#71717a)
 */
export function getEdgeColorAndFace(
  idxA: number,
  idxB: number
): { color: string; faceType: "front" | "rear" | "left" | "right" | "top" | "bottom" | "vertical" } {
  const isFront = (idxA === 4 || idxA === 5 || idxA === 6 || idxA === 7) &&
                  (idxB === 4 || idxB === 5 || idxB === 6 || idxB === 7);
  const isRear = (idxA === 0 || idxA === 1 || idxA === 2 || idxA === 3) &&
                 (idxB === 0 || idxB === 1 || idxB === 2 || idxB === 3);
  const isTop = (idxA % 2 === 1) && (idxB % 2 === 1);
  const isBottom = (idxA % 2 === 0) && (idxB % 2 === 0);
  const isLeft = (idxA === 2 || idxA === 3 || idxA === 6 || idxA === 7) &&
                 (idxB === 2 || idxB === 3 || idxB === 6 || idxB === 7);
  const isRight = (idxA === 0 || idxA === 1 || idxA === 4 || idxA === 5) &&
                  (idxB === 0 || idxB === 1 || idxB === 4 || idxB === 5);

  if (isFront) return { color: "#ef4444", faceType: "front" }; // Mặt trước: Đỏ
  if (isRear) return { color: "#3b82f6", faceType: "rear" };   // Mặt sau: Xanh dương
  if (isLeft) return { color: "#22c55e", faceType: "left" };   // Sườn trái: Xanh lục
  if (isRight) return { color: "#06b6d4", faceType: "right" }; // Sườn phải: Xanh ngọc
  if (isTop) return { color: "#eab308", faceType: "top" };     // Nóc xe: Vàng
  if (isBottom) return { color: "#71717a", faceType: "bottom" }; // Đáy: Xám

  return { color: "#a1a1aa", faceType: "vertical" };
}

/**
 * Chiếu toàn bộ 8 đỉnh và 12 cạnh của một Box 3D lên 1 Camera cụ thể:
 * Tự động chia nhỏ cạnh thích ứng (Subdivision) để tạo đường cong quang học.
 */
export function project3DBoxToCamera(
  box: Box3D,
  cameraConfig: CameraConfig,
  subdivisionSegments: number = 8
): ProjectedBox2D {
  // 1. Lấy 8 đỉnh trong hệ tọa độ LiDAR
  const cornersLidar = boxCorners(box);

  // 2. Biến đổi 8 đỉnh sang hệ tọa độ Camera
  const cornersCam: Array<[number, number, number]> = cornersLidar.map((pt) =>
    lidarToCamera(pt, cameraConfig.extrinsics)
  );

  // 3. Chiếu 8 đỉnh sang tọa độ Pixel
  const corners2D: Point2D[] = cornersCam.map((ptCam) =>
    projectPointToPixel(
      ptCam,
      cameraConfig.intrinsics,
      cameraConfig.distortionModel,
      cameraConfig.imageWidth,
      cameraConfig.imageHeight
    )
  );

  // 4. Chiếu 12 cạnh với cơ chế Subdivision (chia nhỏ cạnh cong)
  const edges: ProjectedEdge[] = [];
  let validPointsCount = 0;
  let minU = Infinity, maxU = -Infinity;
  let minV = Infinity, maxV = -Infinity;

  for (let edgeIdx = 0; edgeIdx < BOX_EDGES.length; edgeIdx++) {
    const [startIdx, endIdx] = BOX_EDGES[edgeIdx];
    const p1Cam = cornersCam[startIdx];
    const p2Cam = cornersCam[endIdx];

    // Near-plane clipping
    const { p1Clipped, p2Clipped, isVisible } = clipSegmentNearPlane(p1Cam, p2Cam, 0.1);

    if (!isVisible) {
      continue;
    }

    const { color, faceType } = getEdgeColorAndFace(startIdx, endIdx);
    const edgePoints: Point2D[] = [];

    // Chia nhỏ cạnh thành các điểm nội suy
    const segCount = Math.max(1, subdivisionSegments);
    for (let step = 0; step <= segCount; step++) {
      const frac = step / segCount;
      const interpCam: [number, number, number] = [
        p1Clipped[0] + frac * (p2Clipped[0] - p1Clipped[0]),
        p1Clipped[1] + frac * (p2Clipped[1] - p1Clipped[1]),
        p1Clipped[2] + frac * (p2Clipped[2] - p1Clipped[2]),
      ];

      const pt2D = projectPointToPixel(
        interpCam,
        cameraConfig.intrinsics,
        cameraConfig.distortionModel,
        cameraConfig.imageWidth,
        cameraConfig.imageHeight
      );

      if (pt2D.isValid) {
        validPointsCount++;
        minU = Math.min(minU, pt2D.u);
        maxU = Math.max(maxU, pt2D.u);
        minV = Math.min(minV, pt2D.v);
        maxV = Math.max(maxV, pt2D.v);
      }

      edgePoints.push(pt2D);
    }

    edges.push({
      edgeIndex: edgeIdx,
      startCornerIndex: startIdx,
      endCornerIndex: endIdx,
      points: edgePoints,
      color,
      faceType,
      isVisible: edgePoints.some((p) => p.isValid),
    });
  }

  // 5. Tính toán hình chữ nhật bao quanh 2D (BBox2D)
  let bbox2D: [number, number, number, number] | null = null;
  let visibilityCoverage = 0;
  const visibleCornersCount = corners2D.filter((c) => c.isValid).length;

  if (minU < maxU && minV < maxV) {
    // Kẹp trong kích thước ảnh
    const clampedMinU = Math.max(0, minU);
    const clampedMinV = Math.max(0, minV);
    const clampedMaxU = Math.min(cameraConfig.imageWidth, maxU);
    const clampedMaxV = Math.min(cameraConfig.imageHeight, maxV);

    bbox2D = [clampedMinU, clampedMinV, clampedMaxU, clampedMaxV];

    const boxArea = Math.max(1, (maxU - minU) * (maxV - minV));
    const intersectArea = Math.max(0, clampedMaxU - clampedMinU) * Math.max(0, clampedMaxV - clampedMinV);

    visibilityCoverage = Number(((intersectArea / boxArea) * 100).toFixed(1));
  }

  // 6. Phân loại vai trò của camera
  let role: "primary" | "secondary" | "out_of_view" = "out_of_view";
  if (visibilityCoverage >= 25 || visibleCornersCount >= 4) {
    role = "primary";
  } else if (visibilityCoverage > 0 || visibleCornersCount > 0) {
    role = "secondary";
  }

  return {
    cameraId: cameraConfig.id,
    cameraName: cameraConfig.name,
    corners2D,
    edges,
    bbox2D,
    visibilityCoverage,
    visibleCornersCount,
    isVisible: visibilityCoverage > 0 || visibleCornersCount > 0,
    role,
  };
}

/**
 * Thuật toán Định vị Camera Thông Minh & Tỷ lệ bao phủ tầm nhìn:
 * Khảo sát box trên toàn bộ danh sách camera và xác định Camera chính (Primary) & Camera phụ (Secondary).
 */
export function computeVisibilityCoverage(
  boxes: Box3D[],
  cameras: CameraConfig[]
): CameraVisibilityReport {
  const result: CameraVisibilityReport = { boxes: [] };

  for (let bIdx = 0; bIdx < boxes.length; bIdx++) {
    const box = boxes[bIdx];
    let primaryCameraId: number | null = null;
    let primaryCameraName: string | null = null;
    let highestCoverage = -1;

    const cameraCoverages: Array<{
      cameraId: number;
      cameraName: string;
      coveragePercent: number;
      role: "primary" | "secondary" | "out_of_view";
      bbox2D: [number, number, number, number] | null;
    }> = [];

    for (const cam of cameras) {
      const proj = project3DBoxToCamera(box, cam, 4); // Dùng subdivision 4 để tính nhanh
      cameraCoverages.push({
        cameraId: cam.id,
        cameraName: cam.name,
        coveragePercent: proj.visibilityCoverage,
        role: proj.role,
        bbox2D: proj.bbox2D,
      });

      if (proj.visibilityCoverage > highestCoverage && proj.isVisible) {
        highestCoverage = proj.visibilityCoverage;
        primaryCameraId = cam.id;
        primaryCameraName = cam.name;
      }
    }

    result.boxes.push({
      boxIndex: bIdx,
      primaryCameraId,
      primaryCameraName,
      highestCoverage: Math.max(0, highestCoverage),
      cameraCoverages,
    });
  }

  return result;
}

/**
 * Trích xuất vùng ảnh ROI 2D (Region of Interest) từ Camera chính:
 * Sẵn sàng cho Module AI nhận diện dòng xe và kích thước (AI 2D-to-3D Dimension Estimator).
 */
export function extractObjectROI(
  box: Box3D,
  cameraConfig: CameraConfig,
  paddingPercent: number = 0.1
): {
  cameraId: number;
  cameraName: string;
  roi: { x: number; y: number; width: number; height: number };
  isFullyVisible: boolean;
} | null {
  const proj = project3DBoxToCamera(box, cameraConfig, 4);
  if (!proj.bbox2D || !proj.isVisible) {
    return null;
  }

  const [uMin, vMin, uMax, vMax] = proj.bbox2D;
  const rawW = uMax - uMin;
  const rawH = vMax - vMin;

  const padX = rawW * paddingPercent;
  const padY = rawH * paddingPercent;

  const x = Math.max(0, Math.floor(uMin - padX));
  const y = Math.max(0, Math.floor(vMin - padY));
  const w = Math.min(cameraConfig.imageWidth - x, Math.ceil(rawW + 2 * padX));
  const h = Math.min(cameraConfig.imageHeight - y, Math.ceil(rawH + 2 * padY));

  return {
    cameraId: cameraConfig.id,
    cameraName: cameraConfig.name,
    roi: { x, y, width: w, height: h },
    isFullyVisible: proj.visibilityCoverage >= 80,
  };
}
