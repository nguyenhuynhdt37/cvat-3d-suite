/**
 * Module nhận diện mặt đất, vỉa hè & ghim sàn (Ground, Curb & Road Snapping).
 */

import {
  type Box3D,
  cloneBox,
  axes,
  addVec,
  scaleVec,
} from "./transforms.ts";

/**
 * Thuật toán Annular Ring Ground Detection:
 * Dò cao độ mặt phẳng mặt đường thực tế từ vành đai lộ thiên xung quanh thân xe.
 * Khắc phục triệt để hiện tượng gầm xe bị thân xe che khuất tia LiDAR.
 * @param pts Danh sách các điểm LiDAR {x, y, z}
 * @param cx Tâm X hiện tại
 * @param cy Tâm Y hiện tại
 * @param yaw Góc xoay Yaw (radian)
 * @param halfL Nửa chiều dài xe
 * @param halfW Nửa chiều rộng xe
 * @param innerMargin Khoảng thụt lề gầm xe (mặc định 0.1m)
 * @param outerMargin Bán kính vành đai quét mặt đường lộ thiên (mặc định 1.2m)
 * @param ceilingZ Trần giới hạn cao độ loại bỏ cành cây
 */
export function computeAnnularRingGroundZ(
  pts: Array<{ x: number; y: number; z: number }>,
  cx: number,
  cy: number,
  yaw: number,
  halfL: number,
  halfW: number,
  innerMargin: number = 0.1,
  outerMargin: number = 1.2,
  ceilingZ?: number
): { groundZ: number | null; groundPointsCount: number } {
  const cosY = Math.cos(-yaw);
  const sinY = Math.sin(-yaw);

  const ringPointsZ: number[] = [];
  const maxZ = ceilingZ !== undefined ? ceilingZ : 999;

  for (const p of pts) {
    if (p.z > maxZ) continue;
    const dx = p.x - cx;
    const dy = p.y - cy;
    const lx = dx * cosY - dy * sinY;
    const ly = dx * sinY + dy * cosY;

    // Nằm trong phạm vi mở rộng outerMargin
    const inOuter = Math.abs(lx) <= halfL + outerMargin && Math.abs(ly) <= halfW + outerMargin;
    // Nằm trong vùng che khuất lõi gầm xe
    const inCoreShadow = Math.abs(lx) < Math.max(0.2, halfL - innerMargin) && Math.abs(ly) < Math.max(0.2, halfW - innerMargin);

    // Điểm thuộc vành đai mặt đường lộ thiên nếu nằm trong outer và KHÔNG nằm trong core gầm xe
    if (inOuter && !inCoreShadow) {
      ringPointsZ.push(p.z);
    }
  }

  if (ringPointsZ.length < 5) {
    // Nếu vành đai có ít điểm, fallback quét toàn bộ các điểm lân cận
    for (const p of pts) {
      if (p.z > maxZ) continue;
      const dx = p.x - cx;
      const dy = p.y - cy;
      if (dx * dx + dy * dy <= (halfL + outerMargin) * (halfL + outerMargin)) {
        ringPointsZ.push(p.z);
      }
    }
  }

  if (ringPointsZ.length < 3) {
    return { groundZ: null, groundPointsCount: 0 };
  }

  ringPointsZ.sort((a, b) => a - b);
  // Lấy phân vị 6% để loại bỏ hoàn toàn tia phản xạ ngầm bất thường
  const pIdx = Math.max(0, Math.floor(ringPointsZ.length * 0.06));
  const groundZ = Number(ringPointsZ[pIdx].toFixed(3));

  return { groundZ, groundPointsCount: ringPointsZ.length };
}

/**
 * Thuật toán Ước lượng Cao độ Mặt đường của xe Ego (Ego Road Surface Ground Z):
 * - Quét các điểm mặt đất trong vành đai lân cận quanh xe Ego (mở rộng bán kính 0.8m đến 15.0m).
 * - Lọc bỏ thân xe Ego (gầm xe r < 0.8m) và các vật thể nổi.
 * - Sử dụng phân vị thấp (15% ~ 25%) để loại bỏ tia nhiễu đáy cống / vũng nước.
 * - Đóng vai trò là mốc chuẩn (Baseline Ground Reference) để:
 *   1. Chống lún âm đất / chống bay lơ lửng cho các xe ở xa / ít điểm / không có điểm mặt đất dưới gầm.
 *   2. Nhận diện nền vỉa hè chuẩn xác khi mây điểm cao hơn mặt đường Ego (+8cm ~ +35cm).
 */
export function estimateEgoRoadGroundZ(
  pts: Array<{ x: number; y: number; z: number }> | Float32Array | number[],
  egoPos: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 },
  options: { minRadius?: number; maxRadius?: number; defaultZ?: number } = {}
): number {
  const minR = options.minRadius ?? 0.8;
  const maxR = options.maxRadius ?? 15.0;
  const defaultZ = options.defaultZ ?? -1.75;
  const minRSq = minR * minR;
  const maxRSq = maxR * maxR;

  const groundZArr: number[] = [];

  if (Array.isArray(pts) && pts.length > 0 && typeof (pts[0] as any).x === "number") {
    const arr = pts as Array<{ x: number; y: number; z: number }>;
    for (let i = 0; i < arr.length; i++) {
      const p = arr[i];
      const dx = p.x - egoPos.x;
      const dy = p.y - egoPos.y;
      const distSq = dx * dx + dy * dy;
      if (distSq >= minRSq && distSq <= maxRSq) {
        if (p.z >= egoPos.z - 3.5 && p.z <= egoPos.z + 0.5) {
          groundZArr.push(p.z);
        }
      }
    }
  } else {
    const raw = pts as Float32Array | number[];
    const len = raw.length;
    for (let i = 0; i < len; i += 3) {
      const x = raw[i];
      const y = raw[i + 1];
      const z = raw[i + 2];
      const dx = x - egoPos.x;
      const dy = y - egoPos.y;
      const distSq = dx * dx + dy * dy;
      if (distSq >= minRSq && distSq <= maxRSq) {
        if (z >= egoPos.z - 3.5 && z <= egoPos.z + 0.5) {
          groundZArr.push(z);
        }
      }
    }
  }

  if (groundZArr.length < 8) {
    return defaultZ;
  }

  groundZArr.sort((a, b) => a - b);
  // Cắt 1% điểm sâu đáy (nhiễu cống)
  const cutLow = Math.floor(groundZArr.length * 0.01);
  const validZ = groundZArr.slice(cutLow);
  const p15Idx = Math.floor(validZ.length * 0.15);
  return Number(validZ[p15Idx].toFixed(3));
}

/**
 * Thuật toán Tính Toán Độ Dốc Mặt Đường 3D Theo Vết Đè Của Box (Footprint Ground Snap):
 * - Thu hẹp bán kính triệt để vào đúng Footprint của Box (+0.55m dọc, +0.45m ngang quanh lốp xe).
 * - Miễn nhiễm 100% với nhiễu từ xe khác đỗ bên cạnh, dải phân cách hay tường rào.
 * - Quét sâu Z xuống tới -4.5m để bắt cụm điểm sàn (curpoint đáy) ngay dưới chân xe.
 * - Phân vùng 4 hốc bánh xe (FL, FR, RL, RR) cân bằng tính chuẩn xác dốc dọc Side (Pitch) và dốc ngang Front (Roll).
 * - Căn góc nghiêng Front Roll theo 2 dải mép biên 0–10% và 90–100%: nếu không đủ điểm -> khóa Roll = 0°.
 * - Tham chiếu mốc Z mặt đường Ego (Ego Road Z) chống lún âm đất và nhận diện nền vỉa hè.
 * - Hồi quy mặt phẳng 3D dốc chéo: z = a * lx + b * ly + c0.
 */
export interface GroundSlopeResult {
  groundZ: number | null;
  pitchRad: number;
  rollRad: number;
  pitchDeg: number;
  rollDeg: number;
  groundPointsCount: number;
  isValidGround?: boolean;
  isFallbackZeroGround?: boolean;
  isCurbGround?: boolean;
  isHalfCurb?: boolean;
  halfCurbSide?: "left" | "right" | "none";
  curbHeightCm?: number;
}

/**
 * Thuật toán Tính Toán Độ Dốc Mặt Đường 3D Theo Vết Đè Của Box (Footprint Ground Snap):
 * - Thu hẹp bán kính triệt để vào đúng Footprint của Box (+0.55m dọc, +0.45m ngang quanh lốp xe).
 * - Miễn nhiễm 100% với nhiễu từ xe khác đỗ bên cạnh, dải phân cách hay tường rào.
 * - Quét sâu Z xuống tới -4.5m để bắt cụm điểm sàn (curpoint đáy) ngay dưới chân xe.
 * - Phân vùng 4 hốc bánh xe (FL, FR, RL, RR) cân bằng tính chuẩn xác dốc dọc Side (Pitch) và dốc ngang Front (Roll).
 * - Căn dải curpoint tiếp đất theo khoảng 30% - 30% đầu cuối (0%–30% mép phải & 70%–100% mép trái):
 *   + Tự động phát hiện xe gác lề (Half-Curb) khi 2 bên chênh lệch >= 7cm: tự động nghiêng Roll và bù Z.
 *   + Tự động nhận diện xe đỗ hoàn toàn trên nền vỉa hè (Full-Curb) khi cao hơn Ego Road Z từ +8cm ~ +35cm.
 * - Nếu chưa đủ point cloud mặt đất (< 6 điểm hoặc thiếu điểm 2 mép): Tự động fit theo độ cao mốc Ego Road Z (mốc 0) và khóa góc thẳng theo Ego (Roll = 0°, Pitch = 0°).
 * - Hồi quy mặt phẳng 3D dốc chéo: z = a * lx + b * ly + c0.
 */
export function computeGroundSlopesAndZ(
  ptsOrBox: Array<{ x: number; y: number; z: number }> | Float32Array | any,
  cxOrPts?: any,
  cy: number = 0,
  cz: number = 0,
  yaw: number = 0,
  halfL: number = 2.25,
  halfW: number = 0.9,
  ceilingZ?: number,
  options: {
    lockRollFlat?: boolean;
    egoRoadZ?: number;
    egoPos?: { x: number; y: number; z: number };
    halfH?: number;
  } = {}
): GroundSlopeResult {
  // Phòng vệ 1: Đảo tham số nếu người dùng gọi computeGroundSlopesAndZ(box, points, options)
  if (
    ptsOrBox &&
    typeof ptsOrBox === "object" &&
    !Array.isArray(ptsOrBox) &&
    !(ptsOrBox instanceof Float32Array) &&
    ("x" in ptsOrBox || "pos" in ptsOrBox)
  ) {
    const box = ptsOrBox;
    const rawPts = cxOrPts;
    const boxX = box.x ?? (box.pos ? box.pos[0] : 0);
    const boxY = box.y ?? (box.pos ? box.pos[1] : 0);
    const boxZ = box.z ?? (box.pos ? box.pos[2] : 0);
    const boxYaw = box.yaw ?? (box.rot ? box.rot[2] : 0);
    const boxL = box.l ?? (box.scale ? box.scale[0] : 4.5);
    const boxW = box.w ?? (box.scale ? box.scale[1] : 1.8);
    const boxH = box.h ?? (box.scale ? box.scale[2] : 1.6);
    const ceilZ = boxZ + boxH / 2;
    const opts = (typeof cy === "object" ? cy : options) || {};
    return computeGroundSlopesAndZ(
      rawPts,
      boxX,
      boxY,
      boxZ,
      boxYaw,
      boxL / 2,
      boxW / 2,
      ceilZ,
      opts
    );
  }

  // Phòng vệ 2: Chuẩn hóa pts nếu là Float32Array
  let pts: Array<{ x: number; y: number; z: number }>;
  if (ptsOrBox instanceof Float32Array) {
    pts = [];
    const n = Math.floor(ptsOrBox.length / 3);
    for (let i = 0; i < n; i++) {
      pts.push({ x: ptsOrBox[i * 3], y: ptsOrBox[i * 3 + 1], z: ptsOrBox[i * 3 + 2] });
    }
  } else if (Array.isArray(ptsOrBox)) {
    pts = ptsOrBox;
  } else {
    pts = [];
  }

  const cx = typeof cxOrPts === "number" ? cxOrPts : 0;
  cy = cy ?? 0;
  cz = cz ?? 0;
  yaw = yaw ?? 0;
  halfL = halfL ?? 2.25;
  halfW = halfW ?? 0.9;

  const cosY = Math.cos(-yaw);
  const sinY = Math.sin(-yaw);

  // Thu hẹp bán kính quét vào đúng phạm vi Footprint vết đè của Box hiện tại
  // Nới nhẹ 55cm đầu đuôi và 45cm hai bên mép lốp xe để bắt trọn vết tiếp đất
  const outerL = halfL + 0.55;
  const outerW = halfW + 0.45;
  const innerL = Math.max(0.15, halfL - 0.35);
  const innerW = Math.max(0.15, halfW - 0.35);

  // Độ sâu quét: Trần cao độ tránh nóc xe (cz + 0.20m), đáy quét sâu xuống tới -4.5m
  const maxZ = ceilingZ !== undefined ? ceilingZ : cz + 0.20;
  const minZ = cz - 4.5;

  const groundPts: Array<{ lx: number; ly: number; z: number }> = [];

  for (const p of pts) {
    if (p.z > maxZ || p.z < minZ) continue;
    const dx = p.x - cx;
    const dy = p.y - cy;
    const lx = dx * cosY - dy * sinY;
    const ly = dx * sinY + dy * cosY;

    const inOuter = Math.abs(lx) <= outerL && Math.abs(ly) <= outerW;
    const inCore = Math.abs(lx) < innerL && Math.abs(ly) < innerW;

    if (inOuter && !inCore) {
      groundPts.push({ lx, ly, z: p.z });
    }
  }

  // Fallback 1: Nếu điểm quá thưa (xe ở xa cảm biến), nới nhẹ thêm 25cm
  if (groundPts.length < 8) {
    const extOuterL = outerL + 0.25;
    const extOuterW = outerW + 0.25;
    for (const p of pts) {
      if (p.z > maxZ || p.z < minZ) continue;
      const dx = p.x - cx;
      const dy = p.y - cy;
      const lx = dx * cosY - dy * sinY;
      const ly = dx * sinY + dy * cosY;
      if (Math.abs(lx) <= extOuterL && Math.abs(ly) <= extOuterW) {
        if (!groundPts.some((gp) => Math.abs(gp.lx - lx) < 1e-3 && Math.abs(gp.ly - ly) < 1e-3)) {
          groundPts.push({ lx, ly, z: p.z });
        }
      }
    }
  }

  // Xác định mốc mặt đường Ego chuẩn (Ego Road Z Reference)
  const resolvedEgoRoadZ =
    options.egoRoadZ !== undefined
      ? options.egoRoadZ
      : pts && pts.length >= 8
      ? estimateEgoRoadGroundZ(pts, options.egoPos, { defaultZ: -1.75 })
      : -1.75;

  const hH = options.halfH ?? 0.8;
  const curObjH = hH * 2;
  const currentBaseZ = cz - hH;

  // Helper tính cao độ mặt đất dự phòng khi thiếu điểm dưới gầm (< 10 điểm):
  // 1. Ưu tiên mây điểm của chính chiếc xe (Golden Anchor Box: Z_ground = Z_roof - H)
  // 2. Bảo toàn đáy hiện tại của chiếc xe (cz - halfH) -> CHỐNG 100% HIỆN TƯỢNG BAY LÊN TRỜI
  const computeSmartFallbackGroundZ = (): number => {
    const searchL = halfL + 0.35;
    const searchW = halfW + 0.25;
    const bodyPtsZ: number[] = [];

    if (Array.isArray(pts) && pts.length > 0 && typeof (pts[0] as any).x === "number") {
      const arr = pts as Array<{ x: number; y: number; z: number }>;
      for (let i = 0; i < arr.length; i++) {
        const p = arr[i];
        if (p.z < cz - hH - 0.4 || p.z > cz + hH + 0.4) continue;
        const dx = p.x - cx;
        const dy = p.y - cy;
        const lx = dx * cosY - dy * sinY;
        const ly = dx * sinY + dy * cosY;
        if (Math.abs(lx) <= searchL && Math.abs(ly) <= searchW) {
          bodyPtsZ.push(p.z);
        }
      }
    }

    if (bodyPtsZ.length >= 4) {
      bodyPtsZ.sort((a, b) => a - b);
      const zRoof = bodyPtsZ[Math.floor(bodyPtsZ.length * 0.95)];
      const zLowest = bodyPtsZ[Math.floor(bodyPtsZ.length * 0.05)];
      // Golden Anchor: Z_ground = Z_roof - H
      const zFromRoof = zRoof - curObjH;
      const zFromLowest = zLowest - 0.18; // clearance gầm xe
      const estimatedZ = Math.min(zFromRoof, zFromLowest);
      if (Math.abs(estimatedZ - currentBaseZ) <= 0.45) {
        return Number(estimatedZ.toFixed(3));
      }
    }

    // 2. Nếu người dùng truyền options.egoRoadZ rõ ràng hoặc mảng điểm rỗng (Test 95)
    if (options.egoRoadZ !== undefined || !pts || pts.length === 0) {
      return Number(resolvedEgoRoadZ.toFixed(3));
    }

    // 3. Nếu pts có ít nhất 8 điểm và resolvedEgoRoadZ không lệch quá 50cm
    if (pts && pts.length >= 8 && Math.abs(resolvedEgoRoadZ - currentBaseZ) <= 0.50) {
      return Number(resolvedEgoRoadZ.toFixed(3));
    }

    // 4. Mặc định an toàn tuyệt đối: Bảo toàn đáy hiện tại của xe, khóa góc Roll 0°, Pitch 0°
    return Number(currentBaseZ.toFixed(3));
  };

  if (groundPts.length < 10) {
    // Dưới chân không có điểm hoặc point cloud mặt đất quá ít (< 10 điểm) -> Khóa chuẩn 0° phẳng, dùng Smart Fallback Ground Z
    const fallbackGroundZ = computeSmartFallbackGroundZ();
    return {
      groundZ: fallbackGroundZ,
      pitchRad: 0,
      rollRad: 0,
      pitchDeg: 0,
      rollDeg: 0,
      groundPointsCount: groundPts.length,
      isValidGround: false,
      isFallbackZeroGround: true,
      isCurbGround: false,
      isHalfCurb: false,
      halfCurbSide: "none",
      curbHeightCm: 0,
    };
  }

  // Lọc cụm điểm sàn dưới cùng (Bottom Floor Cluster) ngay dưới chân xe:
  groundPts.sort((a, b) => a.z - b.z);
  const cutLow = Math.floor(groundPts.length * 0.01);
  const sorted = groundPts.slice(cutLow);

  // Thuật toán Lọc Mặt Sàn Kháng Thân Xe & Vật Thể Nổi (Robust Ground Inlier Filter):
  // 1. Lấy 35% số điểm ở tầng thấp nhất làm hạt giống sàn cơ sở (Ground Seed Points)
  let validPts = sorted;
  const seedCount = Math.max(6, Math.floor(sorted.length * 0.35));
  const seedPts = sorted.slice(0, seedCount);

  let sumSeedLx = 0, sumSeedLy = 0, sumSeedZ = 0;
  for (const p of seedPts) {
    sumSeedLx += p.lx;
    sumSeedLy += p.ly;
    sumSeedZ += p.z;
  }
  const meanSeedLx = sumSeedLx / seedCount;
  const meanSeedLy = sumSeedLy / seedCount;
  const meanSeedZ = sumSeedZ / seedCount;

  let vSeedLx = 0, vSeedLy = 0, cSeedLxLy = 0, cSeedLxZ = 0, cSeedLyZ = 0;
  for (const p of seedPts) {
    const dlx = p.lx - meanSeedLx;
    const dly = p.ly - meanSeedLy;
    const dz = p.z - meanSeedZ;
    vSeedLx += dlx * dlx;
    vSeedLy += dly * dly;
    cSeedLxLy += dlx * dly;
    cSeedLxZ += dlx * dz;
    cSeedLyZ += dly * dz;
  }

  const detSeed = vSeedLx * vSeedLy - cSeedLxLy * cSeedLxLy;
  let aSeed = 0, bSeed = 0, c0Seed = meanSeedZ;
  if (Math.abs(detSeed) > 1e-4) {
    aSeed = (cSeedLxZ * vSeedLy - cSeedLyZ * cSeedLxLy) / detSeed;
    bSeed = (cSeedLyZ * vSeedLx - cSeedLxZ * cSeedLxLy) / detSeed;
    c0Seed = meanSeedZ - aSeed * meanSeedLx - bSeed * meanSeedLy;
  }

  // 2. Lọc Inliers: Điểm mặt đất thực tế chỉ nằm trong dải tán xạ [-8cm, +8cm] so với mặt phẳng sàn cơ sở.
  // Các điểm thân xe (gầm xe, sườn xe, xe khác đỗ gần) có dz > +10cm sẽ bị loại bỏ 100%.
  const inliers = sorted.filter((p) => {
    const expectedZ = aSeed * p.lx + bSeed * p.ly + c0Seed;
    const diff = p.z - expectedZ;
    return diff >= -0.08 && diff <= 0.08;
  });

  if (inliers.length >= 6 && inliers.length >= sorted.length * 0.20) {
    validPts = inliers;
  }

  // Phân bổ 4 góc bánh xe (FL, FR, RL, RR) để cân bằng sườn Trái - Phải và Đầu - Đuôi
  const qFL: typeof groundPts = [];
  const qFR: typeof groundPts = [];
  const qRL: typeof groundPts = [];
  const qRR: typeof groundPts = [];

  for (const p of validPts) {
    if (p.lx >= 0 && p.ly >= 0) qFL.push(p);
    else if (p.lx >= 0 && p.ly < 0) qFR.push(p);
    else if (p.lx < 0 && p.ly >= 0) qRL.push(p);
    else qRR.push(p);
  }

  const fitPts: typeof groundPts = [];
  const takeRatio = 0.45;

  const addLowestFromQuadrant = (q: typeof groundPts) => {
    if (q.length === 0) return;
    const count = Math.max(1, Math.floor(q.length * takeRatio));
    fitPts.push(...q.slice(0, count));
  };

  addLowestFromQuadrant(qFL);
  addLowestFromQuadrant(qFR);
  addLowestFromQuadrant(qRL);
  addLowestFromQuadrant(qRR);

  const finalPts = fitPts.length >= 4 ? fitPts : validPts.slice(0, Math.max(4, Math.floor(validPts.length * 0.45)));

  if (finalPts.length < 6) {
    // Số điểm mặt đất sau lọc không đủ tin cậy để OLS mặt phẳng 3D -> Khóa chuẩn 0° phẳng, dùng Smart Fallback Ground Z
    const fallbackGroundZ = computeSmartFallbackGroundZ();
    return {
      groundZ: fallbackGroundZ,
      pitchRad: 0,
      rollRad: 0,
      pitchDeg: 0,
      rollDeg: 0,
      groundPointsCount: finalPts.length,
      isValidGround: false,
      isFallbackZeroGround: true,
      isCurbGround: false,
      isHalfCurb: false,
      halfCurbSide: "none",
      curbHeightCm: 0,
    };
  }

  // Hồi quy tuyến tính bình phương tối thiểu (OLS) mặt phẳng 3D: z = a * lx + b * ly + c0
  let sumLx = 0;
  let sumLy = 0;
  let sumZ = 0;
  const N = finalPts.length;

  for (const p of finalPts) {
    sumLx += p.lx;
    sumLy += p.ly;
    sumZ += p.z;
  }

  const meanLx = sumLx / N;
  const meanLy = sumLy / N;
  const meanZ = sumZ / N;

  let varLx = 0;
  let varLy = 0;
  let covLxLy = 0;
  let covLxZ = 0;
  let covLyZ = 0;

  for (const p of finalPts) {
    const dlx = p.lx - meanLx;
    const dly = p.ly - meanLy;
    const dz = p.z - meanZ;
    varLx += dlx * dlx;
    varLy += dly * dly;
    covLxLy += dlx * dly;
    covLxZ += dlx * dz;
    covLyZ += dly * dz;
  }

  const det = varLx * varLy - covLxLy * covLxLy;
  let pitchRad = 0;
  let rollRad = 0;
  let c0 = meanZ;

  const maxPitchRad = (20 * Math.PI) / 180;
  const maxRollRad = (25 * Math.PI) / 180;

  if (Math.abs(det) > 1e-4) {
    const a = (covLxZ * varLy - covLyZ * covLxLy) / det;
    const b = (covLyZ * varLx - covLxZ * covLxLy) / det;

    pitchRad = Math.max(-maxPitchRad, Math.min(maxPitchRad, -Math.atan(a)));
    rollRad = Math.max(-maxRollRad, Math.min(maxRollRad, Math.atan(b)));

    c0 = meanZ - a * meanLx - b * meanLy;
  } else {
    const pIdx = Math.floor(finalPts.length * 0.15);
    c0 = finalPts[pIdx].z;
  }

  // Tính sai số dư (residual) của các điểm so với mặt phẳng hồi quy OLS
  let meanResidual = 0;
  if (Math.abs(det) > 1e-4) {
    let sumRes = 0;
    for (const p of finalPts) {
      const a = (covLxZ * varLy - covLyZ * covLxLy) / det;
      const b = (covLyZ * varLx - covLxZ * covLxLy) / det;
      const expectedZ = meanZ + a * (p.lx - meanLx) + b * (p.ly - meanLy);
      sumRes += Math.abs(p.z - expectedZ);
    }
    meanResidual = sumRes / finalPts.length;
  }

  // =========================================================================
  // THUẬT TOÁN PHÂN BIỆT MẶT ĐƯỜNG DỐC NGHIÊNG TỰ NHIÊN VS VỈA HÈ BẬC ĐỨNG:
  // 1. Nếu mây điểm phân bố phẳng đều (meanResidual < 0.035m) và góc dốc ngang |rollRad| <= 10°:
  //    -> 100% là MẶT ĐƯỜNG DỐC NGHIÊNG TỰ NHIÊN (Natural Sloped Road)!
  //    -> Giữ nguyên rollRad để xe bám nghiêng theo mặt đường, Front View khít 100%.
  // 2. Chỉ coi là vỉa hè khi có bậc đứng rõ rệt (stepDeltaZ >= 0.08m) VÀ sai số mặt phẳng lớn (meanResidual >= 0.035m),
  //    hoặc khi người dùng chủ động yêu cầu lockRollFlat = true.
  // =========================================================================

  // Phân vị thấp 12% đại diện cho cao độ mặt đường dưới lòng đường (Lowest Road Surface)
  const p12Idx = Math.max(0, Math.floor(sorted.length * 0.12));
  const lowestRoadZ = sorted[p12Idx].z;

  const leftPtsZ = sorted.filter((p) => p.ly > 0.15).map((p) => p.z).sort((a, b) => a - b);
  const rightPtsZ = sorted.filter((p) => p.ly < -0.15).map((p) => p.z).sort((a, b) => a - b);

  let isCurbOrRamp = options.lockRollFlat === true;
  let isHalfCurb = false;
  let halfCurbSide: "left" | "right" | "none" = "none";
  let curbHeightCm = 0;

  if (!isCurbOrRamp && leftPtsZ.length >= 3 && rightPtsZ.length >= 3) {
    const leftMedian = leftPtsZ[Math.floor(leftPtsZ.length * 0.25)];
    const rightMedian = rightPtsZ[Math.floor(rightPtsZ.length * 0.25)];
    const stepDeltaZ = Math.abs(leftMedian - rightMedian);
    const lowerPts = leftMedian < rightMedian ? leftPtsZ : rightPtsZ;
    const lowerSpread = lowerPts[Math.floor(lowerPts.length * 0.75)] - lowerPts[Math.floor(lowerPts.length * 0.25)];

    // Nhận diện Bậc Vỉa Hè: Chênh lệch cao độ lớn giữa 2 bên (stepDeltaZ >= 0.08m = 8cm)
    // VÀ bên lòng đường thấp là mặt phẳng ngang (lowerSpread < 0.05m = 5cm).
    // Nếu lòng đường dốc liên tục hoặc độ nghiêng nhẹ (< 8cm): Là đường nghiêng tự nhiên -> bám theo Roll!
    if (stepDeltaZ >= 0.08 && lowerSpread < 0.05) {
      isCurbOrRamp = true;
    }
  }

  // =========================================================================
  // CĂN DẢI CURPOINT TIẾP ĐẤT THEO KHOẢNG 30% - 30% ĐẦU CUỐI:
  // - Dải 0%–30% (Mép Phải): Khoảng ly từ [-halfW - 0.45m] đến [-halfW + W * 0.30m].
  // - Dải 70%–100% (Mép Trái): Khoảng ly từ [halfW - W * 0.30m] đến [halfW + 0.45m].
  // 1. TỰ ĐỘNG PHÁT HIỆN GÁC LỀ (Half-Curb): Nếu chênh lệch cao độ |zLeft - zRight| >= 7cm
  //    so với mốc Ego Road Z (1 bên lòng đường, 1 bên trên vỉa hè): tự động tính Roll và bù Z.
  // 2. MẶT ĐƯỜNG DỐC TỰ NHIÊN: Bám theo góc nghiêng tự nhiên của mặt đường.
  // 3. NẾU CHƯA ĐỦ ĐIỂM Ở 1 TRONG 2 ĐẦU MÉP: Fit góc thẳng theo Ego, KHÓA CỨNG Roll = 0°!
  // =========================================================================
  const W = halfW * 2;
  const edgeRightPts = sorted.filter(
    (p) => p.ly >= -halfW - 0.45 && p.ly <= -halfW + W * 0.30
  );
  const edgeLeftPts = sorted.filter(
    (p) => p.ly >= halfW - W * 0.30 && p.ly <= halfW + 0.45
  );

  if (edgeRightPts.length >= 2 && edgeLeftPts.length >= 2) {
    // Khử thành phần dốc dọc (Pitch) để đo độ dốc ngang Front theo 2 đầu mép biên độc lập
    const aSlope = -Math.tan(pitchRad);
    
    // Trích xuất cao độ tiếp đất chuẩn xác cho từng sườn (kháng nhiễu thân xe & nhận diện bậc vỉa hè)
    const baseFloorZ = sorted[0].z;
    const extractEdgeZ = (edgePts: typeof sorted) => {
      const transPts = edgePts
        .map((p) => ({ lx: p.lx, ly: p.ly, zTrans: p.z - aSlope * p.lx }))
        .sort((a, b) => a.zTrans - b.zTrans);
      const basePts = transPts.filter((p) => p.zTrans <= baseFloorZ + 0.08);
      if (basePts.length >= 2) {
        return basePts[Math.floor(basePts.length / 2)].zTrans;
      }
      const curbPts = transPts.filter((p) => p.zTrans >= baseFloorZ + 0.07 && p.zTrans <= baseFloorZ + 0.35);
      if (curbPts.length >= 2) {
        return curbPts[Math.floor(curbPts.length * 0.25)].zTrans;
      }
      return transPts[0].zTrans;
    };

    const zRight = extractEdgeZ(edgeRightPts);
    const zLeft = extractEdgeZ(edgeLeftPts);

    const sumRightLy = edgeRightPts.reduce((s, p) => s + p.ly, 0);
    const sumLeftLy = edgeLeftPts.reduce((s, p) => s + p.ly, 0);
    const meanRightLy = sumRightLy / edgeRightPts.length;
    const meanLeftLy = sumLeftLy / edgeLeftPts.length;
    const spanY = Math.max(0.6, meanLeftLy - meanRightLy);

    const deltaZ = zLeft - zRight;
    const absDeltaZ = Math.abs(deltaZ);

    const hasEgoRef = options.egoRoadZ !== undefined;
    const egoZ = resolvedEgoRoadZ;
    const diffLeftEgo = zLeft - egoZ;
    const diffRightEgo = zRight - egoZ;

    if (hasEgoRef && absDeltaZ >= 0.07 && absDeltaZ <= 0.35) {
      const isLeftCurb = Math.abs(diffRightEgo) <= 0.08 && diffLeftEgo >= 0.07 && diffLeftEgo <= 0.35;
      const isRightCurb = Math.abs(diffLeftEgo) <= 0.08 && diffRightEgo >= 0.07 && diffRightEgo <= 0.35;

      if (isLeftCurb || isRightCurb) {
        isHalfCurb = true;
        halfCurbSide = isLeftCurb ? "left" : "right";
        curbHeightCm = Math.round(absDeltaZ * 100);
        const edgeRoll = Math.atan(deltaZ / spanY);
        rollRad = Math.max(-maxRollRad, Math.min(maxRollRad, edgeRoll));
        c0 = (zLeft + zRight) / 2;
      }
    }

    if (!isHalfCurb) {
      if (isCurbOrRamp) {
        rollRad = 0;
        c0 = lowestRoadZ;

        // Bảo lưu dốc dọc xe (Pitch) từ các điểm thuộc mặt đường bên dưới
        const roadPts = validPts.filter((p) => p.z <= lowestRoadZ + 0.10);
        if (roadPts.length >= 4) {
          let sLx = 0;
          let sZ = 0;
          for (const p of roadPts) {
            sLx += p.lx;
            sZ += p.z;
          }
          const mLx = sLx / roadPts.length;
          const mZ = sZ / roadPts.length;
          let vLx = 0;
          let cLxZ = 0;
          for (const p of roadPts) {
            const dlx = p.lx - mLx;
            const dz = p.z - mZ;
            vLx += dlx * dlx;
            cLxZ += dlx * dz;
          }
          if (vLx > 1e-4) {
            const aRoad = cLxZ / vLx;
            pitchRad = Math.max(-maxPitchRad, Math.min(maxPitchRad, -Math.atan(aRoad)));
          }
        }
      } else {
        const edgeRoll = Math.atan(deltaZ / spanY);
        if (Math.abs(rollRad - edgeRoll) < 0.05) {
          c0 = (zLeft + zRight) / 2;
        } else {
          rollRad = Math.max(-maxRollRad, Math.min(maxRollRad, edgeRoll));
          c0 = (zLeft + zRight) / 2;
        }
      }
    }
  } else {
    // Chưa đủ điểm ở 1 trong 2 đầu mép biên -> Fit góc thẳng theo Ego: Khóa cứng Roll = 0°
    rollRad = 0;
    if (isCurbOrRamp) {
      c0 = lowestRoadZ;
    }
  }

  // =========================================================================
  // CĂN DỐC DỌC SIDE VIEW (PITCH) THEO DẢI 30% ĐẦU VÀ 30% CUỐI DỌC TRỤC X:
  // - Dải 70%–100% (Đầu xe / Bánh trước): lx từ [halfL - L * 0.30] đến [halfL + 0.45].
  // - Dải 0%–30% (Đuôi xe / Bánh sau): lx từ [-halfL - 0.45] đến [-halfL + L * 0.30].
  // 1. Khử thành phần dốc ngang Roll để đo dốc dọc Side nguyên bản: zTrans = p.z - bSlope * p.ly.
  // 2. Nếu cả 2 đầu đều có điểm tiếp đất tin cậy (>= 2 điểm mỗi bên):
  //    -> Tính độ dốc dọc: pitchRad = -atan((zFront - zRear) / spanX).
  // 3. Cân bằng tâm sàn c0 giữa 2 đầu bánh xe.
  // =========================================================================
  const L = halfL * 2;
  const edgeFrontPts = sorted.filter(
    (p) => p.lx >= halfL - L * 0.30 && p.lx <= halfL + 0.45
  );
  const edgeRearPts = sorted.filter(
    (p) => p.lx >= -halfL - 0.45 && p.lx <= -halfL + L * 0.30
  );

  if (!isCurbOrRamp && !isHalfCurb && edgeFrontPts.length >= 2 && edgeRearPts.length >= 2) {
    const bSlope = Math.tan(rollRad);
    const extractSideZ = (edgePts: typeof sorted) => {
      const transPts = edgePts
        .map((p) => ({ lx: p.lx, ly: p.ly, zTrans: p.z - bSlope * p.ly }))
        .sort((a, b) => a.zTrans - b.zTrans);
      const floorZ = transPts[0].zTrans;
      const basePts = transPts.filter((p) => p.zTrans <= floorZ + 0.08);
      if (basePts.length >= 2) {
        return basePts[Math.floor(basePts.length / 2)].zTrans;
      }
      return transPts[0].zTrans;
    };

    const zFront = extractSideZ(edgeFrontPts);
    const zRear = extractSideZ(edgeRearPts);

    const sumFrontLx = edgeFrontPts.reduce((s, p) => s + p.lx, 0);
    const sumRearLx = edgeRearPts.reduce((s, p) => s + p.lx, 0);
    const meanFrontLx = sumFrontLx / edgeFrontPts.length;
    const meanRearLx = sumRearLx / edgeRearPts.length;
    const spanX = Math.max(0.8, meanFrontLx - meanRearLx);

    const deltaZSide = zFront - zRear;
    const edgePitch = -Math.atan(deltaZSide / spanX);

    if (Math.abs(pitchRad - edgePitch) < 0.05) {
      pitchRad = edgePitch;
    } else {
      pitchRad = Math.max(-maxPitchRad, Math.min(maxPitchRad, edgePitch));
    }

    c0 = (zFront + zRear) / 2;
  }

  // =========================================================================
  // NHẬN DIỆN NỀN VỈA HÈ TOÀN PHẦN & CHỐNG LÚN ÂM ĐẤT THEO EGO ROAD Z REFERENCE:
  // =========================================================================
  let isCurbGround = false;
  if (!isCurbOrRamp && !isHalfCurb && options.egoRoadZ !== undefined) {
    const egoZ = options.egoRoadZ;
    // 1. Xe đỗ hoàn toàn trên vỉa hè: Mây điểm mặt đất cao hơn Ego Road Z từ +8cm đến +35cm
    if (c0 >= egoZ + 0.08 && c0 <= egoZ + 0.35) {
      isCurbGround = true;
      curbHeightCm = Math.round((c0 - egoZ) * 100);
      // Nền vỉa hè phẳng -> khóa Roll = 0° theo góc thẳng Ego để xe đứng ngay ngắn
      if (Math.abs(rollRad) < (5 * Math.PI) / 180) {
        rollRad = 0;
      }
    }
    // 2. Chống lún âm đất khi chưa đủ điểm: Fit độ cao theo mốc Ego Z và khóa góc thẳng theo Ego
    else if (c0 < egoZ - 0.25 && validPts.length < 15) {
      c0 = egoZ;
      rollRad = 0;
      pitchRad = 0;
    }
  }

  let pitchRadVal = Number(pitchRad.toFixed(5));
  let rollRadVal = Number(rollRad.toFixed(5));
  let pitchDegVal = Number(((pitchRad * 180) / Math.PI).toFixed(2));
  let rollDegVal = Number(((rollRad * 180) / Math.PI).toFixed(2));

  if (Math.abs(pitchRadVal) < 1e-6) pitchRadVal = 0;
  if (Math.abs(rollRadVal) < 1e-6) rollRadVal = 0;
  if (Math.abs(pitchDegVal) < 1e-4) pitchDegVal = 0;
  if (Math.abs(rollDegVal) < 1e-4) rollDegVal = 0;

  return {
    groundZ: Number(c0.toFixed(3)),
    pitchRad: pitchRadVal,
    rollRad: rollRadVal,
    pitchDeg: pitchDegVal,
    rollDeg: rollDegVal,
    groundPointsCount: finalPts.length,
    isValidGround: true,
    isCurbGround,
    isHalfCurb,
    halfCurbSide,
    curbHeightCm,
  };
}

export interface CurbDetectionResult {
  hasCurb: boolean;
  side: "left" | "right" | "none";
  curbHeight: number;        // Chiều cao bậc vỉa hè thực tế đo từ LiDAR (mét)
  curbHeightCm: number;      // Chiều cao bậc vỉa hè theo cm
  rollRad: number;           // Góc nghiêng Front View (rad)
  rollDeg: number;           // Góc nghiêng Front View (độ)
  roadGroundZ: number;       // Cao độ mặt đường (phía thấp hơn)
  curbGroundZ: number;       // Cao độ mặt vỉa hè (phía cao hơn)
  deltaCenterZ: number;      // Độ nâng tâm xe tương ứng (curbHeight / 2)
  confidence: number;        // Độ tin cậy (%)
}

/**
 * Thuật toán TỰ ĐỘNG NHẬN DIỆN VỈA HÈ & BẬC GÁC LỀ (Auto Curb Detection):
 * - Tự động đo chiều cao thực tế của bậc vỉa hè (h_curb) từ đám mây điểm LiDAR thay vì fix cứng 15cm.
 * - Tự động phát hiện vỉa hè nằm ở bên Trái (Left) hay bên Phải (Right) của xe thông qua phân tích 2 dải sườn mở rộng.
 * - Tính toán góc nghiêng Front Roll và cao độ tâm Z tương ứng để 2 bánh dưới đường và 2 bánh trên vỉa hè khớp 100%.
 */
export function detectCurbStepAndRoll(
  pts: Array<{ x: number; y: number; z: number }>,
  cx: number,
  cy: number,
  cz: number,
  yaw: number,
  halfL: number,
  halfW: number,
  trackW?: number
): CurbDetectionResult {
  const cosY = Math.cos(-yaw);
  const sinY = Math.sin(-yaw);
  const effectiveW = trackW !== undefined ? trackW : halfW * 2;

  // Dải quét vỉa hè bám sát footprint mép bánh xe: từ mép lốp nới nhẹ 85cm (tránh dính xe khác bên cạnh)
  const minLy = Math.max(0.2, halfW * 0.7);
  const maxLy = halfW + 0.85;
  const maxLx = halfL + 0.55;

  // Độ sâu: quét từ mép dưới thân xe (cz - 0.15m) xuống tận cz - 4.5m
  const maxZ = cz - 0.15;
  const minZ = cz - 4.5;

  const leftPts: number[] = [];
  const rightPts: number[] = [];

  for (const p of pts) {
    if (p.z > maxZ || p.z < minZ) continue;
    const dx = p.x - cx;
    const dy = p.y - cy;
    const lx = dx * cosY - dy * sinY;
    const ly = dx * sinY + dy * cosY;

    if (Math.abs(lx) > maxLx) continue;

    // Sườn bên Trái (ly > 0)
    if (ly >= minLy && ly <= maxLy) {
      leftPts.push(p.z);
    }
    // Sườn bên Phải (ly < 0)
    else if (ly <= -minLy && ly >= -maxLy) {
      rightPts.push(p.z);
    }
  }

  // Fallback nếu thiếu điểm
  if (leftPts.length < 3 || rightPts.length < 3) {
    return {
      hasCurb: false,
      side: "none",
      curbHeight: 0,
      curbHeightCm: 0,
      rollRad: 0,
      rollDeg: 0,
      roadGroundZ: cz - 0.7,
      curbGroundZ: cz - 0.7,
      deltaCenterZ: 0,
      confidence: 0,
    };
  }

  // Sắp xếp cao độ từng sườn để lọc nhiễu và lấy phân vị 25% đại diện cho mặt đất mỗi bên
  leftPts.sort((a, b) => a - b);
  rightPts.sort((a, b) => a - b);

  const leftGroundZ = leftPts[Math.floor(leftPts.length * 0.25)];
  const rightGroundZ = rightPts[Math.floor(rightPts.length * 0.25)];

  const deltaZ = leftGroundZ - rightGroundZ;
  const absDeltaZ = Math.abs(deltaZ);

  // Bậc vỉa hè tiêu chuẩn: chênh lệch từ 7cm đến 32cm
  if (absDeltaZ >= 0.07 && absDeltaZ <= 0.32) {
    const curbHeight = Number(absDeltaZ.toFixed(3));
    const curbHeightCm = Math.round(curbHeight * 100);
    const side = deltaZ > 0 ? "left" : "right";

    // Tính góc nghiêng Roll theo tỉ số chênh lệch cao độ / chiều rộng vết bánh xe
    const ratio = Math.max(-0.6, Math.min(0.6, deltaZ / effectiveW));
    const rollRad = Number(Math.asin(ratio).toFixed(5));
    const rollDeg = Number(((rollRad * 180) / Math.PI).toFixed(2));

    const roadGroundZ = Number(Math.min(leftGroundZ, rightGroundZ).toFixed(3));
    const curbGroundZ = Number(Math.max(leftGroundZ, rightGroundZ).toFixed(3));
    const deltaCenterZ = Number((curbHeight / 2).toFixed(3));
    const confidence = Math.min(99, Math.round(75 + (leftPts.length + rightPts.length) / 4));

    return {
      hasCurb: true,
      side,
      curbHeight,
      curbHeightCm,
      rollRad,
      rollDeg,
      roadGroundZ,
      curbGroundZ,
      deltaCenterZ,
      confidence,
    };
  }

  return {
    hasCurb: false,
    side: "none",
    curbHeight: Number(absDeltaZ.toFixed(3)),
    curbHeightCm: Math.round(absDeltaZ * 100),
    rollRad: 0,
    rollDeg: 0,
    roadGroundZ: Number(Math.min(leftGroundZ, rightGroundZ).toFixed(3)),
    curbGroundZ: Number(Math.max(leftGroundZ, rightGroundZ).toFixed(3)),
    deltaCenterZ: 0,
    confidence: 50,
  };
}

/**
 * Thuật toán ước lượng mặt đất và độ dốc địa hình tham khảo cục bộ trong bán kính radius (1m cho Người, 1.5m cho Xe 2 bánh)
 */
export function estimateGroundSlopeInRadius(
  pts: Array<{ x: number; y: number; z: number }>,
  cx: number,
  cy: number,
  cz: number,
  radius: number = 1.0,
  maxGroundZOffset: number = 0.35,
  baseZ?: number
): {
  groundZ: number;
  pitchDeg: number;
  rollDeg: number;
  pitchRad: number;
  rollRad: number;
  groundPointsCount: number;
} {
  const groundPts: Array<{ x: number; y: number; z: number }> = [];
  const referenceBaseZ = baseZ !== undefined ? baseZ : cz;
  const maxZ = referenceBaseZ + maxGroundZOffset;
  const minZ = referenceBaseZ - 1.0;
  const rSq = radius * radius;

  for (const p of pts) {
    if (p.z > maxZ || p.z < minZ) continue;
    const dx = p.x - cx;
    const dy = p.y - cy;
    if (dx * dx + dy * dy <= rSq) {
      groundPts.push(p);
    }
  }

  if (groundPts.length < 4) {
    const fallbackZ = groundPts.length > 0
      ? groundPts.map((p) => p.z).sort((a, b) => a - b)[0]
      : referenceBaseZ;
    return { groundZ: fallbackZ, pitchDeg: 0, rollDeg: 0, pitchRad: 0, rollRad: 0, groundPointsCount: groundPts.length };
  }

  // Sắp xếp z lấy phân vị 15% làm cao độ mặt đất
  const sortedZ = groundPts.map((p) => p.z).sort((a, b) => a - b);
  const groundZ = sortedZ[Math.max(0, Math.floor(sortedZ.length * 0.15))];

  // Hồi quy mặt phẳng cục bộ z = z0 + a * dx + b * dy
  let sumDx = 0, sumDy = 0, sumDz = 0;
  let sumDx2 = 0, sumDy2 = 0, sumDxDy = 0;
  let sumDxDz = 0, sumDyDz = 0;

  for (const p of groundPts) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const dz = p.z - groundZ;
    sumDx += dx; sumDy += dy; sumDz += dz;
    sumDx2 += dx * dx; sumDy2 += dy * dy; sumDxDy += dx * dy;
    sumDxDz += dx * dz; sumDyDz += dy * dz;
  }

  const denom = (sumDx2 * sumDy2 - sumDxDy * sumDxDy);
  let slopeX = 0;
  let slopeY = 0;
  if (Math.abs(denom) > 1e-5) {
    slopeX = (sumDxDz * sumDy2 - sumDyDz * sumDxDy) / denom;
    slopeY = (sumDyDz * sumDx2 - sumDxDz * sumDxDy) / denom;
  }

  // Chặn góc dốc tối đa 35 độ để tránh nhiễu thành tường/vỉa hè gắt
  const maxSlope = Math.tan((35 * Math.PI) / 180);
  slopeX = Math.max(-maxSlope, Math.min(maxSlope, slopeX));
  slopeY = Math.max(-maxSlope, Math.min(maxSlope, slopeY));

  const pitchRad = Math.atan(slopeX);
  const rollRad = Math.atan(slopeY);
  const pitchDeg = Number(((pitchRad * 180) / Math.PI).toFixed(1));
  const rollDeg = Number(((rollRad * 180) / Math.PI).toFixed(1));

  return { groundZ, pitchDeg, rollDeg, pitchRad, rollRad, groundPointsCount: groundPts.length };
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const i = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round((sorted.length - 1) * p))
  );
  return sorted[i];
}

/**
 * Ước lượng cao độ mặt đất thực tế xung quanh box bằng thuật toán Histogram 2cm Peak Detection.
 * Tìm đỉnh mật độ dày đặc nhất của đám mây điểm lộ thiên quanh đáy box để loại bỏ 100% tia nhiễu dưới cống/vũng nước.
 */
export function estimateGround(
  xyz: Float32Array | number[],
  box: Box3D,
  opts: { margin?: number; below?: number; above?: number; minPoints?: number } = {}
): { localZ: number; count: number } | null {
  if (!xyz || !xyz.length || xyz.length < 3) return null;

  const minPoints = opts.minPoints ?? 4;
  const margin = opts.margin ?? 0.45; // Footprint tight margin 45cm sát mép lốp xe (chống nhiễu xe khác đỗ gần)
  const below = opts.below ?? 4.0;  // Quét sâu 4.0m bắt trọn curpoint mặt đường dưới cùng khi box lơ lửng
  const above = opts.above ?? 0.35; // Trần cao độ chỉ lấy từ mép đáy xe trở xuống (+35cm) tránh dính thân xe
  const ax = axes(box.r);
  const ix = box.s[0] / 2;
  const iy = box.s[1] / 2;
  const hx = ix + margin;
  const hy = iy + margin;
  const bottom = -box.s[2] / 2;
  const ring: number[] = [];
  const inner: number[] = [];
  const c = box.c;

  for (let i = 0; i < xyz.length; i += 3) {
    const vx = xyz[i] - c[0];
    const vy = xyz[i + 1] - c[1];
    const vz = xyz[i + 2] - c[2];
    const qx = vx * ax.ex[0] + vy * ax.ex[1] + vz * ax.ex[2];
    if (qx < -hx || qx > hx) continue;
    const qy = vx * ax.ey[0] + vy * ax.ey[1] + vz * ax.ey[2];
    if (qy < -hy || qy > hy) continue;
    const qz = vx * ax.ez[0] + vy * ax.ez[1] + vz * ax.ez[2];
    if (qz < bottom - below || qz > bottom + above) continue;
    if (Math.abs(qx) > ix || Math.abs(qy) > iy) {
      ring.push(qz);
    } else {
      inner.push(qz);
    }
  }

  if (ring.length >= minPoints) {
    const bin = 0.02; // histogram dày 2cm
    const lo = bottom - below;
    const binCount = Math.ceil((below + above) / bin) + 1;
    const bins = new Float64Array(binCount);
    for (const z of ring) {
      const idx = Math.min(bins.length - 1, Math.max(0, Math.floor((z - lo) / bin)));
      bins[idx] += 1;
    }
    let best = 0;
    let bestScore = -1;
    for (let i = 0; i < bins.length; i++) {
      const score = bins[i] + 0.5 * ((bins[i - 1] || 0) + (bins[i + 1] || 0));
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    const peak = lo + (best + 0.5) * bin;
    const near = ring.filter((z) => Math.abs(z - peak) <= 0.05).sort((p, q) => p - q);
    if (near.length >= minPoints) {
      return { localZ: percentile(near, 0.5), count: near.length };
    }
  }

  const all = ring.concat(inner).sort((p, q) => p - q);
  if (all.length >= minPoints) {
    return { localZ: percentile(all, 0.15), count: all.length };
  }

  // Fallback nới nhẹ margin 0.85m nếu điểm quá thưa ở xa cảm biến (tuyệt đối không mở rộng quá 1m làm nhiễu xe khác)
  if (margin < 0.8 && xyz.length >= 3) {
    return estimateGround(xyz, box, { ...opts, margin: 0.85, below: 4.5, minPoints: 3 });
  }

  return null;
}

/**
 * Đặt đáy box chạm khít vào mặt đất ước lượng từ point cloud (Zero Floating / Zero Sinking).
 */
export function snapToGround(
  xyz: Float32Array | number[],
  box: Box3D,
  opts?: { margin?: number; below?: number; above?: number; minPoints?: number }
): { box: Box3D; shift: number; count: number } | null {
  if (!xyz || !xyz.length) return null;
  const g = estimateGround(xyz, box, opts);
  if (!g) return null;
  const ax = axes(box.r);
  const shift = g.localZ + box.s[2] / 2; // Đáy hiện tại ở -H/2
  const out = cloneBox(box);
  out.c = addVec(box.c, scaleVec(ax.ez, shift));
  return { box: out, shift, count: g.count };
}
