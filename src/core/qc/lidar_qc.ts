/**
 * src/core/qc/lidar_qc.ts
 * Bộ module kiểm tra mây điểm LiDAR thực tế (Point Cloud Smart QC):
 * - L1 (empty_box): Phát hiện box rỗng hoặc mật độ mây điểm quá thưa.
 * - L2 (ground_mismatch): Phát hiện đáy box bị lún âm hoặc bay lơ lửng so với mặt đất LiDAR.
 * - L3 (motion_mismatch): Phát hiện đầu xe quay ngược so với vector di chuyển giữa các frame.
 */

import { computeGroundSlopesAndZ } from "../geometry.ts";
import type { DatumaroQAConfig, QCIssue, QCObjectInstance } from "./types.ts";

/**
 * Đếm số lượng điểm LiDAR nằm lọt trong không gian hình hộp chữ nhật xoay (3D OBB)
 */
export function countPointsInsideBox(
  box: { x: number; y: number; z: number; l: number; w: number; h: number; yaw: number },
  points: Float32Array | Array<{ x: number; y: number; z: number }>
): number {
  const cosYaw = Math.cos(-box.yaw);
  const sinYaw = Math.sin(-box.yaw);
  const hl = box.l / 2;
  const hw = box.w / 2;
  const hh = box.h / 2;
  let count = 0;

  if (points instanceof Float32Array) {
    const total = Math.floor(points.length / 3);
    for (let i = 0; i < total; i++) {
      const px = points[i * 3];
      const py = points[i * 3 + 1];
      const pz = points[i * 3 + 2];
      const dx = px - box.x;
      const dy = py - box.y;
      const dz = pz - box.z;
      if (Math.abs(dz) > hh) continue;
      const lx = dx * cosYaw - dy * sinYaw;
      const ly = dx * sinYaw + dy * cosYaw;
      if (Math.abs(lx) <= hl && Math.abs(ly) <= hw) {
        count++;
      }
    }
  } else if (Array.isArray(points)) {
    for (const p of points) {
      const dx = p.x - box.x;
      const dy = p.y - box.y;
      const dz = p.z - box.z;
      if (Math.abs(dz) > hh) continue;
      const lx = dx * cosYaw - dy * sinYaw;
      const ly = dx * sinYaw + dy * cosYaw;
      if (Math.abs(lx) <= hl && Math.abs(ly) <= hw) {
        count++;
      }
    }
  }

  return count;
}

/**
 * L1: Kiểm tra box rỗng hoặc mật độ mây điểm LiDAR quá thưa
 */
export function checkEmptyOrSparseBox(
  obj: QCObjectInstance,
  points: Float32Array | Array<{ x: number; y: number; z: number }>,
  cfg: DatumaroQAConfig
): QCIssue | null {
  if (!points) return null;
  const box = {
    x: obj.x,
    y: obj.y,
    z: obj.z,
    l: obj.l,
    w: obj.w,
    h: obj.h,
    yaw: obj.yaw,
  };
  const pointCount = countPointsInsideBox(box, points);
  const dist = Math.hypot(obj.x, obj.y);
  const minNear = cfg.min_lidar_points_near ?? cfg.minLidarPointsNear ?? 3;
  const minFar = cfg.min_lidar_points_far ?? cfg.minLidarPointsFar ?? 1;
  const minRequired = dist < 35 ? minNear : minFar;

  if (pointCount < minRequired) {
    const isZero = pointCount === 0;
    return {
      id: `${obj.trackId}_${obj.frame}_empty_box`,
      frame: obj.frame,
      trackId: obj.trackId,
      label: obj.label,
      check: "empty_box",
      symbol: "L1",
      name: isZero ? "Box rỗng (0 điểm LiDAR)" : "Quá ít điểm LiDAR",
      severity: isZero ? "error" : "warning",
      detail: isZero
        ? `Box hoàn toàn không có điểm LiDAR nào bên trong (cự ly ${dist.toFixed(1)}m), có thể là box ảo/ma hoặc gán nhầm vị trí`
        : `Chỉ có ${pointCount} điểm LiDAR trong box (ngưỡng tối thiểu ${minRequired} điểm ở cự ly ${dist.toFixed(1)}m)`,
      value: `${pointCount} điểm`,
      ref: `≥ ${minRequired} điểm`,
    };
  }
  return null;
}

/**
 * L2: Kiểm tra đáy box bị lún âm hoặc bay lơ lửng so với mặt đất LiDAR
 */
export function checkGroundMismatch(
  obj: QCObjectInstance,
  points: Float32Array | Array<{ x: number; y: number; z: number }>,
  cfg: DatumaroQAConfig
): QCIssue | null {
  if (!points) return null;
  const box = {
    x: obj.x,
    y: obj.y,
    z: obj.z,
    l: obj.l,
    w: obj.w,
    h: obj.h,
    yaw: obj.yaw,
    pitch: 0,
    roll: 0,
  };

  const groundInfo = computeGroundSlopesAndZ(
    points,
    box.x,
    box.y,
    box.z,
    box.yaw,
    box.l / 2,
    box.w / 2,
    box.z + box.h / 2
  );

  if (!groundInfo || !groundInfo.isValidGround || groundInfo.groundZ === null) {
    return null;
  }

  const groundZ = groundInfo.groundZ;
  const baseZ = obj.z - obj.h / 2;
  const deltaZ = baseZ - groundZ;
  const hoverMax = cfg.ground_hover_max ?? cfg.groundHoverMax ?? 0.1;
  const sinkMax = cfg.ground_sink_max ?? cfg.groundSinkMax ?? -0.06;

  if (deltaZ > hoverMax) {
    return {
      id: `${obj.trackId}_${obj.frame}_ground_hover`,
      frame: obj.frame,
      trackId: obj.trackId,
      label: obj.label,
      check: "ground_mismatch",
      symbol: "L2",
      name: "Box bay lơ lửng trên mặt đất",
      severity: "warning",
      detail: `Đáy box cao hơn mặt đất LiDAR thực tế ${(deltaZ * 100).toFixed(1)}cm (Z đáy ${baseZ.toFixed(2)}m vs Z đất ${groundZ.toFixed(2)}m)`,
      value: `+${(deltaZ * 100).toFixed(1)} cm`,
      ref: `≤ +${(hoverMax * 100).toFixed(0)} cm`,
    };
  } else if (deltaZ < sinkMax) {
    return {
      id: `${obj.trackId}_${obj.frame}_ground_sink`,
      frame: obj.frame,
      trackId: obj.trackId,
      label: obj.label,
      check: "ground_mismatch",
      symbol: "L2",
      name: "Box lún âm dưới mặt đất",
      severity: "warning",
      detail: `Đáy box chìm dưới mặt đất LiDAR thực tế ${(Math.abs(deltaZ) * 100).toFixed(1)}cm (Z đáy ${baseZ.toFixed(2)}m vs Z đất ${groundZ.toFixed(2)}m)`,
      value: `${(deltaZ * 100).toFixed(1)} cm`,
      ref: `≥ ${(sinkMax * 100).toFixed(0)} cm`,
    };
  }
  return null;
}

/**
 * L3: Kiểm tra đầu xe quay ngược so với hướng di chuyển
 */
export function checkMotionYawMismatch(
  prevObj: QCObjectInstance,
  curObj: QCObjectInstance,
  cfg: DatumaroQAConfig
): QCIssue | null {
  const maxGap = cfg.max_frame_gap ?? cfg.maxFrameGap ?? 1;
  if (curObj.frame - prevObj.frame > maxGap) {
    return null;
  }
  const vx = curObj.x - prevObj.x;
  const vy = curObj.y - prevObj.y;
  const speed = Math.hypot(vx, vy);
  const minSpeed = cfg.motion_speed_threshold ?? cfg.motionSpeedThreshold ?? 0.4;
  if (speed < minSpeed) {
    return null;
  }
  const dirX = vx / speed;
  const dirY = vy / speed;
  const yawX = Math.cos(curObj.yaw);
  const yawY = Math.sin(curObj.yaw);
  const dot = dirX * yawX + dirY * yawY;
  const cosThreshold = cfg.motion_cos_threshold ?? cfg.motionCosThreshold ?? -0.5;

  if (dot < cosThreshold) {
    const angleDeg = Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI);
    return {
      id: `${curObj.trackId}_${curObj.frame}_motion_mismatch`,
      frame: curObj.frame,
      trackId: curObj.trackId,
      label: curObj.label,
      check: "motion_mismatch",
      symbol: "L3",
      name: "Đầu xe quay ngược hướng di chuyển",
      severity: "error",
      detail: `Xe đang tiến với tốc độ ${speed.toFixed(2)}m/frame nhưng góc đầu xe lệch ${angleDeg.toFixed(0)}° so với hướng di chuyển (nhiều khả năng bị lật ngược đầu 180°)`,
      value: `${angleDeg.toFixed(0)}°`,
      ref: `< 90°`,
    };
  }
  return null;
}
