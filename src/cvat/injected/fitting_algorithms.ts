/**
 * Module: Fitting Algorithms Hub (CVAT 3D Suite - Main World)
 * Chuyên trách:
 * 1. Thuật toán Fit Box theo góc đón tia Ego (Ray-Cast L-Shape Fit) & Ghim Đất 3D.
 * 2. Thuật toán Fit Người Đi Bộ (Pedestrian Fit) đa chế độ.
 * 3. Thuật toán Fit Xe 2 Bánh (Cyclist / Motorcycle Fit).
 * 4. Thuật toán Fit Box sơ khởi / Tight Fit theo đám mây điểm LiDAR.
 * 5. Thuật toán Fit Box có đệm an toàn 5cm kẹp chuẩn Tool_QC.
 */

import { getSceneLidarPoints, detectAccurateGroundZ } from "./ground_mesh_engine.ts";
import {
  fitBoxToEgoRayAndGround,
  detectDominantWallEdgeWithValleyCutoff,
} from "../../core/geometry/car_fitting.ts";
import {
  filterDenseConnectedCluster1D,
} from "../../core/geometry/clustering.ts";
import { fitPedestrianBox } from "../../core/geometry/pedestrian_fitting.ts";
import { fitCyclistBox } from "../../core/geometry/two_wheeler_fitting.ts";

/**
 * Trích xuất các điểm LiDAR nằm trong vùng ROI quanh tâm box
 */
function extractRoiPoints(
  cx: number,
  cy: number,
  radius: number = 4.5
): Array<{ x: number; y: number; z: number }> {
  const lidar = getSceneLidarPoints();
  if (!lidar || lidar.count === 0) return [];
  const { count, array } = lidar;
  const rSq = radius * radius;
  const res: Array<{ x: number; y: number; z: number }> = [];

  for (let i = 0; i < count; i++) {
    const px = array[i * 3];
    const py = array[i * 3 + 1];
    const pz = array[i * 3 + 2];
    const dx = px - cx;
    const dy = py - cy;
    if (dx * dx + dy * dy <= rSq) {
      res.push({ x: px, y: py, z: pz });
    }
  }
  return res;
}

export interface MainWorldEgoRayFitResult {
  newX: number;
  newY: number;
  newZ: number;
  newCenterX: number;
  newCenterY: number;
  newCenterZ: number;
  newYawRad?: number;
  newYawDeg?: number;
  deltaYawDeg?: number;
  newL: number;
  newW: number;
  newH: number;
  pitchRad: number;
  rollRad: number;
  pitchDeg: number;
  rollDeg: number;
  groundZ: number;
  roofTopZ: number;
  shiftLx?: number;
  shiftLy?: number;
  visibleFaces: { longitudinal: "front" | "rear"; lateral: "left" | "right" };
  dominantEdge?: {
    edgeSide: "left" | "right";
    bumperSide: "front" | "rear";
    sideWallEdge: number;
    bumperEdge: number;
  };
  pointsCount: number;
  fitStep?: "all" | "top" | "side" | "front";
  message: string;
}

/**
 * Fit box theo góc đón tia Ego và ghim đất 3D
 */
export function fitBoxToEgoRayAndGroundInMainWorld(
  points: number[],
  egoPos: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 },
  options: {
    preserveDimensions?: boolean;
    fitRoofTop?: boolean;
    alignMode?: "w_only" | "both";
    fitStep?: "all" | "top" | "side" | "front";
    edgePadding?: number;
  } = {}
): MainWorldEgoRayFitResult {
  const cx = points[0];
  const cy = points[1];
  const cz = points[2];
  const yaw = points[5];
  const L = points[6];
  const W = points[7];
  const H = points[8];

  const searchRadius = Math.max(L, W) + 2.0;
  const roiPts = extractRoiPoints(cx, cy, searchRadius);

  if (roiPts.length === 0) {
    return {
      newX: cx,
      newY: cy,
      newZ: cz,
      newCenterX: cx,
      newCenterY: cy,
      newCenterZ: cz,
      newYawRad: yaw,
      newYawDeg: Number(((yaw * 180) / Math.PI).toFixed(2)),
      deltaYawDeg: 0,
      newL: L,
      newW: W,
      newH: H,
      pitchRad: 0,
      rollRad: 0,
      pitchDeg: 0,
      rollDeg: 0,
      groundZ: cz - H / 2,
      roofTopZ: cz + H / 2,
      visibleFaces: { longitudinal: "front", lateral: "left" },
      pointsCount: 0,
      message: "Không tìm thấy điểm LiDAR trong scene",
    };
  }

  const res = fitBoxToEgoRayAndGround(roiPts, cx, cy, cz, yaw, L, W, H, egoPos, options);
  return {
    ...res,
    newX: res.newCenterX,
    newY: res.newCenterY,
    newZ: res.newCenterZ,
  };
}

export interface MainWorldPedestrianFitResult {
  newX: number;
  newY: number;
  newZ: number;
  newCenterX: number;
  newCenterY: number;
  newCenterZ: number;
  newYaw?: number;
  newYawDeg?: number;
  deltaYawDeg?: number;
  newL: number;
  newW: number;
  newH: number;
  groundZ: number;
  pointsCount: number;
  step: "all" | "top" | "side" | "front" | "l" | "w" | "h";
  message: string;
}

/**
 * Fit người đi bộ trong Main World
 */
export function fitPedestrianInMainWorld(
  points: number[],
  options: {
    headBuffer?: number;
    margin?: number;
    egoPos?: { x: number; y: number; z: number };
    step?: "all" | "top" | "side" | "front" | "l" | "w" | "h";
    attributes?: Record<string, any>;
  } = {}
): MainWorldPedestrianFitResult {
  const cx = points[0];
  const cy = points[1];
  const cz = points[2];
  const yaw = points[5];
  const curL = points[6] || 0.65;
  const curW = points[7] || 0.65;
  const curH = points[8] || 1.70;

  const roiPts = extractRoiPoints(cx, cy, 2.5);

  if (roiPts.length === 0) {
    return {
      newX: cx,
      newY: cy,
      newZ: cz,
      newCenterX: cx,
      newCenterY: cy,
      newCenterZ: cz,
      newYaw: yaw,
      newYawDeg: Number(((yaw * 180) / Math.PI).toFixed(2)),
      deltaYawDeg: 0,
      newL: curL,
      newW: curW,
      newH: curH,
      groundZ: cz - curH / 2,
      pointsCount: 0,
      step: options.step ?? "all",
      message: "Không tìm thấy điểm LiDAR trong scene",
    };
  }

  const res = fitPedestrianBox(roiPts, cx, cy, cz, yaw, curL, curW, curH, options);
  return {
    ...res,
    newX: res.newCenterX,
    newY: res.newCenterY,
    newZ: res.newCenterZ,
    newYaw: res.newYawRad,
    step: options.step ?? "all",
  };
}

export interface MainWorldTwoWheelerFitResult {
  newX: number;
  newY: number;
  newZ: number;
  newCenterX: number;
  newCenterY: number;
  newCenterZ: number;
  newYaw?: number;
  newYawDeg?: number;
  deltaYawDeg?: number;
  newL: number;
  newW: number;
  newH: number;
  groundZ: number;
  pointsCount: number;
  step: "all" | "top" | "side" | "front" | "l" | "w" | "h";
  message: string;
}

/**
 * Fit xe 2 bánh (xe đạp, xe máy) trong Main World
 */
export function fitCyclistInMainWorld(
  points: number[],
  options: {
    headBuffer?: number;
    margin?: number;
    egoPos?: { x: number; y: number; z: number };
    step?: "all" | "top" | "side" | "front" | "l" | "w" | "h";
    attributes?: Record<string, any>;
  } = {}
): MainWorldTwoWheelerFitResult {
  const cx = points[0];
  const cy = points[1];
  const cz = points[2];
  const yaw = points[5];
  const curL = points[6] || 1.80;
  const curW = points[7] || 0.70;
  const curH = points[8] || 1.50;

  const roiPts = extractRoiPoints(cx, cy, 3.0);

  if (roiPts.length === 0) {
    return {
      newX: cx,
      newY: cy,
      newZ: cz,
      newCenterX: cx,
      newCenterY: cy,
      newCenterZ: cz,
      newYaw: yaw,
      newYawDeg: Number(((yaw * 180) / Math.PI).toFixed(2)),
      deltaYawDeg: 0,
      newL: curL,
      newW: curW,
      newH: curH,
      groundZ: cz - curH / 2,
      pointsCount: 0,
      step: options.step ?? "all",
      message: "Không tìm thấy điểm LiDAR trong scene",
    };
  }

  const cyclistStep = (options.step === "l" || options.step === "w" || options.step === "h" ? "all" : options.step) as ("all" | "top" | "side" | "front" | undefined);
  const res = fitCyclistBox(roiPts, cx, cy, cz, yaw, curL, curW, curH, options, cyclistStep ?? "all");

  return {
    ...res,
    newX: res.newCenterX,
    newY: res.newCenterY,
    newZ: res.newCenterZ,
    newYaw: res.newYawRad,
    step: options.step ?? "all",
  };
}

/**
 * Tính toán mặt đất và fit tự động từ điểm LiDAR
 */
export function computeLidarGroundAndFit(
  points: number[],
  fitMode: "tight" | "catalog" = "tight"
): {
  detectedGroundZ: number | null;
  newZ: number;
  newX: number;
  newY: number;
  newYaw: number;
  newL: number;
  newW: number;
  newH: number;
  pointsCount: number;
} {
  const cx = points[0];
  const cy = points[1];
  const cz = points[2];
  const yaw = points[5];
  const l = points[6];
  const w = points[7];
  const h = points[8];

  const lidar = getSceneLidarPoints();
  if (!lidar || lidar.count === 0) {
    return {
      detectedGroundZ: null,
      newZ: cz,
      newX: cx,
      newY: cy,
      newYaw: yaw,
      newL: l,
      newW: w,
      newH: h,
      pointsCount: 0,
    };
  }

  const { count, array } = lidar;
  const isInitialBox = l <= 2.2 || w <= 1.3;
  const halfL = isInitialBox ? 3.0 : l / 2 + 0.35;
  const halfW = isInitialBox ? 2.0 : w / 2 + 0.35;

  const groundInfo = detectAccurateGroundZ(cx, cy, cz, yaw, l / 2, w / 2, h / 2, isInitialBox, false);
  const detectedGroundZ = groundInfo.groundZ;
  const effectiveGroundZ = detectedGroundZ !== null ? detectedGroundZ : 0;

  const cosY = Math.cos(-yaw);
  const sinY = Math.sin(-yaw);
  const candidateBodyPts: Array<{ x: number; y: number; z: number }> = [];

  const maxRoofZ = effectiveGroundZ + 2.7;
  const minBodyZ = effectiveGroundZ + 0.22;

  for (let i = 0; i < count; i++) {
    const z = array[i * 3 + 2];
    if (z < minBodyZ || z > maxRoofZ) continue;
    const x = array[i * 3];
    const y = array[i * 3 + 1];
    const dx = x - cx;
    const dy = y - cy;
    const lx = dx * cosY - dy * sinY;
    const ly = dx * sinY + dy * cosY;
    if (Math.abs(lx) <= halfL && Math.abs(ly) <= halfW) {
      candidateBodyPts.push({ x, y, z });
    }
  }

  if (candidateBodyPts.length < 5) {
    return {
      detectedGroundZ,
      newZ: effectiveGroundZ + h / 2,
      newX: cx,
      newY: cy,
      newYaw: yaw,
      newL: l,
      newW: w,
      newH: h,
      pointsCount: candidateBodyPts.length,
    };
  }

  const localPts = candidateBodyPts.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    return {
      lx: dx * cosY - dy * sinY,
      ly: dx * sinY + dy * cosY,
      z: p.z,
    };
  });

  const clLy = filterDenseConnectedCluster1D(localPts, "ly", 0.22, 0);
  const bodyPts = filterDenseConnectedCluster1D(clLy, "lx", 0.22, 0);
  const finalPts = bodyPts.length >= 5 ? bodyPts : localPts;

  let minLx = Infinity, maxLx = -Infinity;
  let minLy = Infinity, maxLy = -Infinity;
  let maxZ = -Infinity;

  for (const p of finalPts) {
    if (p.lx < minLx) minLx = p.lx;
    if (p.lx > maxLx) maxLx = p.lx;
    if (p.ly < minLy) minLy = p.ly;
    if (p.ly > maxLy) maxLy = p.ly;
    if (p.z > maxZ) maxZ = p.z;
  }

  const measuredL = maxLx - minLx;
  const measuredW = maxLy - minLy;
  const measuredH = maxZ - effectiveGroundZ;

  let newL = l;
  let newW = w;
  let newH = h;

  if (fitMode === "tight") {
    newL = Number(Math.max(3.2, Math.min(6.5, measuredL + 0.10)).toFixed(2));
    newW = Number(Math.max(1.6, Math.min(2.4, measuredW + 0.08)).toFixed(2));
    newH = Number(Math.max(1.3, Math.min(2.0, measuredH + 0.05)).toFixed(2));
  } else {
    newL = 4.65;
    newW = 1.85;
    newH = 1.45;
  }

  const midLx = (minLx + maxLx) / 2;
  const midLy = (minLy + maxLy) / 2;
  const newX = Number((cx + midLx * Math.cos(yaw) - midLy * Math.sin(yaw)).toFixed(2));
  const newY = Number((cy + midLx * Math.sin(yaw) + midLy * Math.cos(yaw)).toFixed(2));
  const newZ = Number((effectiveGroundZ + newH / 2).toFixed(3));

  return {
    detectedGroundZ,
    newZ,
    newX,
    newY,
    newYaw: yaw,
    newL,
    newW,
    newH,
    pointsCount: finalPts.length,
  };
}

/**
 * Thuật toán Fit Box với padding 5cm kẹp chuẩn Tool_QC
 */
export function fitBoxWithPadding5cm(
  points: number[],
  attributes?: Record<string, any>
): {
  newL: number;
  newW: number;
  newH: number;
  newZ: number;
  pointsCount: number;
  measuredL: number;
  measuredW: number;
  measuredH: number;
  groundZ: number;
} {
  const cx = points[0];
  const cy = points[1];
  const cz = points[2];
  const yaw = points[5];
  const l = points[6] || 4.65;
  const w = points[7] || 1.85;
  const h = points[8] || 1.45;

  const lidar = getSceneLidarPoints();
  if (!lidar || lidar.count === 0) {
    throw new Error("Không trích xuất được điểm LiDAR từ Three.js scene!");
  }

  const { count, array } = lidar;
  const groundInfo = detectAccurateGroundZ(cx, cy, cz, yaw, l / 2, w / 2, h / 2, false, false);
  const groundZ = groundInfo.groundZ !== null ? groundInfo.groundZ : cz - h / 2;

  const cosY = Math.cos(-yaw);
  const sinY = Math.sin(-yaw);

  const minBodyZ = groundZ + 0.22;
  const maxRoofZ = groundZ + 3.5;
  const searchHalfL = l / 2 + 0.55;
  const searchHalfW = w / 2 + 0.45;

  const rawBodyPts: Array<{ lx: number; ly: number; z: number }> = [];
  for (let i = 0; i < count; i++) {
    const z = array[i * 3 + 2];
    if (z < minBodyZ || z > maxRoofZ) continue;

    const x = array[i * 3];
    const y = array[i * 3 + 1];
    const dx = x - cx;
    const dy = y - cy;

    const lx = dx * cosY - dy * sinY;
    const ly = dx * sinY + dy * cosY;

    if (Math.abs(lx) <= searchHalfL && Math.abs(ly) <= searchHalfW) {
      rawBodyPts.push({ lx, ly, z });
    }
  }

  if (rawBodyPts.length < 5) {
    throw new Error(`Cụm điểm quá thưa (${rawBodyPts.length} điểm), không đủ để fit tự động!`);
  }

  const clLy = filterDenseConnectedCluster1D(rawBodyPts, "ly", 0.20, 0);
  const bodyPts = filterDenseConnectedCluster1D(clLy, "lx", 0.20, 0);
  const finalPts = bodyPts.length >= 5 ? bodyPts : rawBodyPts;

  const frontWall = detectDominantWallEdgeWithValleyCutoff(finalPts, "lx", "positive", l / 2, { binSize: 0.04 });
  const rearWall = detectDominantWallEdgeWithValleyCutoff(finalPts, "lx", "negative", l / 2, { binSize: 0.04 });
  const measuredL = Math.max(0.5, Math.min(15.0, Number((frontWall.edge - rearWall.edge).toFixed(3))));

  const leftWall = detectDominantWallEdgeWithValleyCutoff(finalPts, "ly", "positive", w / 2, { binSize: 0.03 });
  const rightWall = detectDominantWallEdgeWithValleyCutoff(finalPts, "ly", "negative", w / 2, { binSize: 0.03 });
  const measuredW = Math.max(0.4, Math.min(3.5, Number((leftWall.edge - rightWall.edge).toFixed(3))));

  const zList = finalPts.map((p) => p.z).sort((a, b) => a - b);
  const zRoof = zList[Math.floor(zList.length * 0.95)];
  const measuredH = Math.max(0.4, Math.min(4.0, Number((zRoof - groundZ).toFixed(3))));

  const rawL = Number((measuredL + 0.10).toFixed(2));
  const rawW = Number((measuredW + 0.10).toFixed(2));
  const rawH = Number((measuredH + 0.05).toFixed(2));

  const isLargeVehicle = Boolean(
    attributes?.is_large ||
    attributes?.truck ||
    attributes?.bus ||
    attributes?.vehicle_type === "truck" ||
    attributes?.vehicle_type === "bus"
  );
  const minL = 3.20, maxL = isLargeVehicle ? 12.00 : 5.50;
  const minW = 1.60, maxW = isLargeVehicle ? 2.60 : 2.20;
  const minH = 1.45, maxH = isLargeVehicle ? 3.60 : 1.90;

  const newL = Number(Math.max(minL, Math.min(maxL, rawL)).toFixed(2));
  const newW = Number(Math.max(minW, Math.min(maxW, rawW)).toFixed(2));
  const newH = Number(Math.max(minH, Math.min(maxH, rawH)).toFixed(2));
  const newZ = Number((groundZ + newH / 2).toFixed(3));

  return {
    newL,
    newW,
    newH,
    newZ,
    pointsCount: finalPts.length,
    measuredL,
    measuredW,
    measuredH,
    groundZ,
  };
}
