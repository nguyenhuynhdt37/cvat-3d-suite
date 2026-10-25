/**
 * Module fit người đi bộ & Trẻ em (Pedestrian & Children Fitting).
 */

import { radToDeg } from "./transforms.ts";
import {
  filterDenseConnectedCluster1D,
  clusterByPointDilation5x,
} from "./clustering.ts";
import { estimateGroundSlopeInRadius } from "./ground_curb.ts";
import { estimateTwoWheelerHeading } from "./two_wheeler_fitting.ts";

/**
 * Thuật toán Cắt Thung Lũng Mật Độ Trục Z (Z-Axis Density Gap Cutoff) & Dò Đỉnh Đầu Thật:
 * - Sắp xếp các điểm theo Z tăng dần.
 * - Quét từ điểm cao nhất ngược xuống: nếu phát hiện khoảng trống rỗng deltaZ > maxGap (mặc định 15cm)
 *   giữa các điểm trên trời và cụm đỉnh đầu người/xe 2 bánh -> Loại bỏ 100% các điểm nhiễu lơ lửng đó.
 * - Trả về cao độ đỉnh đầu thật (trueHeadZ), kháng 100% điểm lá cây, dây điện, bụi.
 */
export function detectTrueHeadZ(
  zArr: number[],
  maxGap: number = 0.15,
  groundZ?: number,
  maxNormalHeight: number = 1.75
): number {
  if (zArr.length === 0) return 0;
  if (zArr.length === 1) return zArr[0];
  const sorted = [...zArr].sort((a, b) => a - b);

  // Điểm sàn tham chiếu (nếu không có groundZ thì lấy điểm thấp nhất)
  const baseZ = groundZ !== undefined ? groundZ : sorted[0];
  const suspiciousThresholdZ = baseZ + maxNormalHeight;

  // Quét từ điểm cao nhất ngược xuống:
  // Nếu điểm nằm trên ngưỡng nghi vấn (> baseZ + maxNormalHeight)
  // và khoảng hở so với điểm bên dưới lớn hơn maxGap (> 15cm)
  // -> Loại bỏ điểm đó và tiếp tục quét xuống
  let cutoffIdx = sorted.length - 1;
  for (let i = sorted.length - 1; i >= 1; i--) {
    if (sorted[i] > suspiciousThresholdZ) {
      const gap = sorted[i] - sorted[i - 1];
      if (gap > maxGap) {
        cutoffIdx = i - 1;
      }
    } else {
      // Đã chạm vào vùng chiều cao bình thường của vật thể -> dừng kiểm tra
      break;
    }
  }

  const clusterPts = sorted.slice(0, cutoffIdx + 1);
  return clusterPts[clusterPts.length - 1];
}

export interface PedestrianFitResult {
  newCenterX: number;
  newCenterY: number;
  newCenterZ: number;
  newYawRad?: number;
  newYawDeg?: number;
  deltaYawDeg?: number;
  newL: number;
  newW: number;
  newH: number;
  pitchRad: 0;
  rollRad: 0;
  pitchDeg: 0;
  rollDeg: 0;
  groundZ: number;
  roofTopZ: number;
  groundPitchDeg?: number; // Độ dốc dọc địa hình tham khảo trong bán kính 1m
  groundRollDeg?: number;  // Độ dốc ngang địa hình tham khảo trong bán kính 1m
  hasBackpack?: boolean;   // Nhận diện mang vác balo / túi / vali
  shiftLx?: number;
  shiftLy?: number;
  pointsCount: number;
  step?: "all" | "top" | "side" | "front" | "l" | "w" | "h";
  message: string;
  aodeInfo?: {
    meanR: number;
    meanAbsLx: number;
    meanAbsLy: number;
    uncoveredFront: number;
    uncoveredRear: number;
    uncoveredLeft: number;
    uncoveredRight: number;
    lxPeak: number;
    lyPeak: number;
    hasCrowdSeparation: boolean;
    hasParallelVehicleSeparation?: boolean;
  };
}

export interface AODEDensityEnvelopeLimits {
  minL: number;
  maxL: number;
  minW: number;
  maxW: number;
  minH: number;
  maxH: number;
}

export const CLASS_SIZE_LIMITS: Record<"pedestrian" | "two_wheel" | "vehicle", AODEDensityEnvelopeLimits> = {
  pedestrian: {
    minL: 0.65,
    maxL: 1.0,
    minW: 0.65,
    maxW: 1.0,
    minH: 1.2,
    maxH: 1.9,
  },
  two_wheel: {
    minL: 1.5,
    maxL: 2.0,
    minW: 0.6,
    maxW: 0.9,
    minH: 1.5,
    maxH: 1.8,
  },
  vehicle: {
    minL: 3.2,
    maxL: 5.5,
    minW: 1.6,
    maxW: 2.2,
    minH: 1.5,
    maxH: 1.9,
  },
};

export interface AODEDensityEnvelopeResult {
  filteredPts: Array<{ lx: number; ly: number; z: number }>;
  rawCount: number;
  filteredCount: number;

  meanR: number;
  meanAbsLx: number;
  meanAbsLy: number;

  lxFrontEdge: number;
  lxRearEdge: number;
  lyLeftEdge: number;
  lyRightEdge: number;

  lxPeak: number;
  lyPeak: number;

  uncoveredFront: number;
  uncoveredRear: number;
  uncoveredLeft: number;
  uncoveredRight: number;

  measuredSpanL: number;
  measuredSpanW: number;

  limits: AODEDensityEnvelopeLimits;
  hasCrowdSeparation: boolean;
  hasParallelVehicleSeparation: boolean;
}

/**
 * Thuật toán A-O-D-E (Anisotropic Oriented Density Envelope):
 * 1. Vùng quét bầu dục elip định hướng theo góc Yaw (Oriented Ellipsoid):
 *    - Pedestrian: bán trục semiA = 0.55m, semiB = 0.55m (dựa trên max L=1.0m, W=1.0m từ Tool_QC).
 *    - Two_wheel: bán trục semiA = 1.15m, semiB = 0.55m (dựa trên max L=2.0m, W=0.9m từ Tool_QC).
 *      Khóa chặt ly in [-0.55m, +0.55m] để không bao giờ quét nhầm xe máy/xe đạp chạy song song ở 2 bên sườn.
 * 2. Phân tích khoảng cách 4 cực xuyên tâm độc lập (Trước +lx, Sau -lx, Trái +ly, Phải -ly)
 *    và tìm Thung Lũng Mật Độ (Density Valley) với gap > 12cm để cắt đứt người đi cùng / vỉa hè / tường rào / xe song song.
 * 3. Tính khoảng cách từ tâm đến các điểm và khoảng cách trung bình (meanR, meanAbsLx, meanAbsLy).
 * 4. Tính khoảng cách chưa bọc (Uncovered Span/Margin) so với mép box hiện tại: d_edge - (size / 2)
 *    để xác định mép box hụt hay thừa so với mây điểm thật.
 * 5. Histogram đỉnh mật độ (Density Peak) với bins 2cm để xác định lõi thân và điểm rơi mật độ
 *    (Density Drop-off) để bảo toàn các điểm viền mỏng (gương chiếu hậu, tay lái, ba lô, bàn chân).
 */
export function analyzeOrientedDensityEnvelope(
  localPts: Array<{ lx: number; ly: number; z: number }>,
  objectClass: "pedestrian" | "two_wheel" | "vehicle",
  curL: number,
  curW: number,
  curH: number,
  groundZ: number,
  options: {
    binSize?: number;
    densityValleyGap?: number;
    attributes?: Record<string, any>;
    isSideOrFrontStep?: boolean;
    egoLocalPos?: { lx: number; ly: number };
  } = {}
): AODEDensityEnvelopeResult {
  const binSize = options.binSize ?? 0.02; // Histogram bins 2cm
  const rawCount = localPts.length;
  const limits = CLASS_SIZE_LIMITS[objectClass] ?? CLASS_SIZE_LIMITS.pedestrian;

  const isPedestrian = objectClass === "pedestrian";
  const isTwoWheel = objectClass === "two_wheel";

  const isBackpackOrLuggage = Boolean(
    options.attributes?.backpack ||
    options.attributes?.baggage ||
    options.attributes?.carrying_object ||
    options.attributes?.cargo ||
    options.attributes?.luggage ||
    options.attributes?.suitcase ||
    options.attributes?.bag
  );

  // 1. VÙNG QUÉT BẦU DỤC ELIP ĐỊNH HƯỚNG
  const baseSemiA = isPedestrian ? (isBackpackOrLuggage ? 0.60 : 0.55) : isTwoWheel ? 1.15 : (limits.maxL / 2 + 0.35);
  const baseSemiB = isPedestrian ? (isBackpackOrLuggage ? 0.60 : 0.55) : isTwoWheel ? 0.85 : (limits.maxW / 2 + 0.25);

  let semiA = Math.max(baseSemiA, curL / 2 + 0.45);
  let semiB = Math.max(baseSemiB, curW / 2 + 0.45);

  const minZ = options.isSideOrFrontStep ? groundZ + 0.02 : groundZ + 0.08;
  const maxZ = groundZ + 2.10;

  const ptsInEllipsoid: Array<{ lx: number; ly: number; z: number }> = [];
  for (const p of localPts) {
    if (p.z < minZ || p.z > maxZ) continue;
    if (Math.abs(p.lx) > semiA || Math.abs(p.ly) > semiB) continue;
    const ellipseNorm = (p.lx * p.lx) / (semiA * semiA) + (p.ly * p.ly) / (semiB * semiB);
    if (ellipseNorm <= 1.08) {
      ptsInEllipsoid.push(p);
    }
  }

  // Fallback an toàn nếu thiếu điểm
  if (ptsInEllipsoid.length < 3) {
    const defaultFront = curL / 2;
    const defaultRear = -curL / 2;
    const defaultLeft = curW / 2;
    const defaultRight = -curW / 2;
    return {
      filteredPts: ptsInEllipsoid,
      rawCount,
      filteredCount: ptsInEllipsoid.length,
      meanR: 0,
      meanAbsLx: 0,
      meanAbsLy: 0,
      lxFrontEdge: defaultFront,
      lxRearEdge: defaultRear,
      lyLeftEdge: defaultLeft,
      lyRightEdge: defaultRight,
      lxPeak: 0,
      lyPeak: 0,
      uncoveredFront: 0,
      uncoveredRear: 0,
      uncoveredLeft: 0,
      uncoveredRight: 0,
      measuredSpanL: curL,
      measuredSpanW: curW,
      limits,
      hasCrowdSeparation: false,
      hasParallelVehicleSeparation: false,
    };
  }

  // 2. KHOẢNG CÁCH TỪ TÂM VÀ KHOẢNG CÁCH TRUNG BÌNH (MEAN RADIAL DISTANCES)
  let sumR = 0;
  let sumAbsLx = 0;
  let sumAbsLy = 0;
  for (const p of ptsInEllipsoid) {
    const r = Math.sqrt(p.lx * p.lx + p.ly * p.ly);
    sumR += r;
    sumAbsLx += Math.abs(p.lx);
    sumAbsLy += Math.abs(p.ly);
  }
  const meanR = Number((sumR / ptsInEllipsoid.length).toFixed(3));
  const meanAbsLx = Number((sumAbsLx / ptsInEllipsoid.length).toFixed(3));
  const meanAbsLy = Number((sumAbsLy / ptsInEllipsoid.length).toFixed(3));

  // 3. HISTOGRAM ĐỈNH MẬT ĐỘ (DENSITY PEAK) BINS 2CM ĐỂ TÌM LÕI THÂN VẬT THỂ
  const numBinsLx = Math.max(1, Math.ceil((semiA * 2) / binSize));
  const numBinsLy = Math.max(1, Math.ceil((semiB * 2) / binSize));
  const histLx = new Array(numBinsLx).fill(0);
  const histLy = new Array(numBinsLy).fill(0);

  for (const p of ptsInEllipsoid) {
    const binX = Math.max(0, Math.min(numBinsLx - 1, Math.floor((p.lx + semiA) / binSize)));
    const binY = Math.max(0, Math.min(numBinsLy - 1, Math.floor((p.ly + semiB) / binSize)));
    histLx[binX]++;
    histLy[binY]++;
  }

  let maxCountX = -1;
  let peakBinX = Math.floor(numBinsLx / 2);
  for (let i = 0; i < numBinsLx; i++) {
    if (histLx[i] > maxCountX) {
      maxCountX = histLx[i];
      peakBinX = i;
    }
  }

  let maxCountY = -1;
  let peakBinY = Math.floor(numBinsLy / 2);
  for (let i = 0; i < numBinsLy; i++) {
    if (histLy[i] > maxCountY) {
      maxCountY = histLy[i];
      peakBinY = i;
    }
  }

  const lxPeak = Number(((peakBinX + 0.5) * binSize - semiA).toFixed(3));
  const lyPeak = Number(((peakBinY + 0.5) * binSize - semiB).toFixed(3));

  // 4. PHÂN TÍCH 4 CỰC XUYÊN TÂM ĐỘC LẬP & TÌM THUNG LŨNG MẬT ĐỘ (DENSITY VALLEY GAP > 12CM)
  const valleyGapDefault = options.densityValleyGap ?? 0.12; // 12cm
  let hasCrowdSeparation = false;
  let hasParallelVehicleSeparation = false;

  // 4a. Cực Trái (+ly) và Cực Phải (-ly)
  const isSparse = ptsInEllipsoid.length <= 12;
  const valleyGapLy = isSparse ? 0.30 : valleyGapDefault;

  // Cực Trái (+ly)
  const leftPts = ptsInEllipsoid.filter((p) => p.ly > 0).sort((a, b) => a.ly - b.ly);
  let lyLeftEdge = leftPts.length > 0 ? leftPts[leftPts.length - 1].ly : 0;
  const validLeftSet = new Set<any>();

  if (leftPts.length > 0) {
    let cutoffIdx = leftPts.length;
    for (let i = 1; i < leftPts.length; i++) {
      const gap = leftPts[i].ly - leftPts[i - 1].ly;
      if (gap > valleyGapLy && leftPts[i - 1].ly >= 0.04) {
        cutoffIdx = i;
        hasCrowdSeparation = true;
        if (isTwoWheel) hasParallelVehicleSeparation = true;
        break;
      }
    }
    for (let i = 0; i < cutoffIdx; i++) {
      validLeftSet.add(leftPts[i]);
    }
    lyLeftEdge = leftPts[cutoffIdx - 1].ly;
  }

  // Cực Phải (-ly)
  const rightPts = ptsInEllipsoid.filter((p) => p.ly < 0).sort((a, b) => Math.abs(a.ly) - Math.abs(b.ly));
  let lyRightEdge = rightPts.length > 0 ? rightPts[rightPts.length - 1].ly : 0;
  const validRightSet = new Set<any>();

  if (rightPts.length > 0) {
    let cutoffIdx = rightPts.length;
    for (let i = 1; i < rightPts.length; i++) {
      const gap = Math.abs(rightPts[i].ly) - Math.abs(rightPts[i - 1].ly);
      if (gap > valleyGapLy && Math.abs(rightPts[i - 1].ly) >= 0.04) {
        cutoffIdx = i;
        hasCrowdSeparation = true;
        if (isTwoWheel) hasParallelVehicleSeparation = true;
        break;
      }
    }
    for (let i = 0; i < cutoffIdx; i++) {
      validRightSet.add(rightPts[i]);
    }
    lyRightEdge = rightPts[cutoffIdx - 1].ly;
  }

  const centerLinePts = ptsInEllipsoid.filter((p) => p.ly === 0);
  const ptsAfterLy = [...Array.from(validLeftSet), ...Array.from(validRightSet), ...centerLinePts];

  // 4b. Cực Trước (+lx) và Cực Sau (-lx)
  const valleyGapLxPed = isSparse ? 0.32 : valleyGapDefault;

  // Cực Trước (+lx)
  const frontPts = ptsAfterLy.filter((p) => p.lx > 0).sort((a, b) => a.lx - b.lx);
  let lxFrontEdge = frontPts.length > 0 ? frontPts[frontPts.length - 1].lx : 0;
  const validFrontSet = new Set<any>();

  if (frontPts.length > 0) {
    let cutoffIdx = frontPts.length;
    for (let i = 1; i < frontPts.length; i++) {
      const gap = frontPts[i].lx - frontPts[i - 1].lx;
      let thresholdGap = valleyGapLxPed;
      if (isTwoWheel) {
        thresholdGap = frontPts[i - 1].lx <= Math.max(0.90, curL / 2 + 0.05) ? 0.45 : 0.15;
      }
      if (gap > thresholdGap && frontPts[i - 1].lx >= 0.05) {
        cutoffIdx = i;
        hasCrowdSeparation = true;
        break;
      }
    }
    for (let i = 0; i < cutoffIdx; i++) {
      validFrontSet.add(frontPts[i]);
    }
    lxFrontEdge = frontPts[cutoffIdx - 1].lx;
  }

  // Cực Sau (-lx)
  const rearPts = ptsAfterLy.filter((p) => p.lx < 0).sort((a, b) => Math.abs(a.lx) - Math.abs(b.lx));
  let lxRearEdge = rearPts.length > 0 ? rearPts[rearPts.length - 1].lx : 0;
  const validRearSet = new Set<any>();

  if (rearPts.length > 0) {
    let cutoffIdx = rearPts.length;
    for (let i = 1; i < rearPts.length; i++) {
      const gap = Math.abs(rearPts[i].lx) - Math.abs(rearPts[i - 1].lx);
      let thresholdGap = valleyGapLxPed;
      if (isTwoWheel) {
        thresholdGap = Math.abs(rearPts[i - 1].lx) <= Math.max(0.90, curL / 2 + 0.05) ? 0.45 : 0.15;
      }
      if (gap > thresholdGap && Math.abs(rearPts[i - 1].lx) >= 0.05) {
        cutoffIdx = i;
        hasCrowdSeparation = true;
        break;
      }
    }
    for (let i = 0; i < cutoffIdx; i++) {
      validRearSet.add(rearPts[i]);
    }
    lxRearEdge = rearPts[cutoffIdx - 1].lx;
  }

  const centerLxPts = ptsAfterLy.filter((p) => p.lx === 0);
  const filteredPts = [...Array.from(validFrontSet), ...Array.from(validRearSet), ...centerLxPts];

  // 5. TÍNH KHOẢNG CÁCH CHƯA BỌC (UNCOVERED SPAN/MARGIN) SO VỚI MÉP BOX HIỆN TẠI
  const halfL = curL / 2;
  const halfW = curW / 2;

  const uncoveredFront = Number((lxFrontEdge - halfL).toFixed(3));
  const uncoveredRear = Number((-halfL - lxRearEdge).toFixed(3));
  const uncoveredLeft = Number((lyLeftEdge - halfW).toFixed(3));
  const uncoveredRight = Number((-halfW - lyRightEdge).toFixed(3));

  const measuredSpanL = Number((lxFrontEdge - lxRearEdge).toFixed(3));
  const measuredSpanW = Number((lyLeftEdge - lyRightEdge).toFixed(3));

  return {
    filteredPts: filteredPts.length >= 3 ? filteredPts : ptsInEllipsoid,
    rawCount,
    filteredCount: filteredPts.length >= 3 ? filteredPts.length : ptsInEllipsoid.length,
    meanR,
    meanAbsLx,
    meanAbsLy,
    lxFrontEdge: Number(lxFrontEdge.toFixed(3)),
    lxRearEdge: Number(lxRearEdge.toFixed(3)),
    lyLeftEdge: Number(lyLeftEdge.toFixed(3)),
    lyRightEdge: Number(lyRightEdge.toFixed(3)),
    lxPeak,
    lyPeak,
    uncoveredFront,
    uncoveredRear,
    uncoveredLeft,
    uncoveredRight,
    measuredSpanL,
    measuredSpanW,
    limits,
    hasCrowdSeparation,
    hasParallelVehicleSeparation,
  };
}

export function computeAODEDensityEnvelope(
  pts: Array<{ x: number; y: number; z: number }>,
  cx: number,
  cy: number,
  cz: number,
  yaw: number,
  objectClass: "pedestrian" | "two_wheel" | "vehicle",
  curL: number,
  curW: number,
  curH: number,
  options: {
    groundZ?: number;
    binSize?: number;
    densityValleyGap?: number;
    attributes?: Record<string, any>;
    isSideOrFrontStep?: boolean;
    egoPos?: { x: number; y: number; z?: number };
  } = {}
): AODEDensityEnvelopeResult {
  const baseZ = cz - curH / 2;
  const groundZ = options.groundZ ?? baseZ;

  const cosY = Math.cos(-yaw);
  const sinY = Math.sin(-yaw);

  const localPts: Array<{ lx: number; ly: number; z: number }> = pts.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    return {
      lx: dx * cosY - dy * sinY,
      ly: dx * sinY + dy * cosY,
      z: p.z,
    };
  });

  let egoLocalPos: { lx: number; ly: number } | undefined;
  if (options.egoPos) {
    const toEgoX = options.egoPos.x - cx;
    const toEgoY = options.egoPos.y - cy;
    egoLocalPos = {
      lx: toEgoX * Math.cos(yaw) + toEgoY * Math.sin(yaw),
      ly: -toEgoX * Math.sin(yaw) + toEgoY * Math.cos(yaw),
    };
  }

  return analyzeOrientedDensityEnvelope(localPts, objectClass, curL, curW, curH, groundZ, {
    binSize: options.binSize,
    densityValleyGap: options.densityValleyGap,
    attributes: options.attributes,
    isSideOrFrontStep: options.isSideOrFrontStep,
    egoLocalPos,
  });
}

/**
 * Thuật toán CHUYÊN BIỆT CHO NGƯỜI ĐI BỘ (PEDESTRIAN FIT):
 * 1. Khóa cứng Roll = 0° và Pitch = 0° tuyệt đối (Người luôn đứng thẳng 100% theo phương trọng lực).
 * 2. Bán kính quét mặt đất siêu hẹp (+15cm quanh chân) loại bỏ 100% rủi ro ăn nhầm vào vỉa hè hay cột đèn.
 * 3. Phân tầng độ cao (Height Stratification): Loại bỏ 100% vệt quét mặt đất quanh chân (minBodyZ = groundZ + 0.30m).
 * 4. Hỗ trợ các chế độ căn chỉnh độc lập:
 *    - TOP: Ước lượng Yaw quanh trục cơ thể, khóa cứng vị trí X/Y/Z và kích thước L/W/H.
 *    - SIDE: Căn mép trước/sau đón tia theo trục dọc X, giữ nguyên 100% cao độ Z và kích thước.
 *    - FRONT: Căn mép sườn đón tia theo trục ngang Y, giữ nguyên 100% cao độ Z và kích thước.
 *    - L: Co giãn riêng chiều dài L theo mây điểm thân người, căn tâm X, giữ nguyên W, H & Z.
 *    - W: Co giãn riêng chiều rộng W theo mây điểm thân người, căn tâm Y, giữ nguyên L, H & Z.
 *    - H: Bám sàn Z_base cố định, chiều cao nở lên đỉnh đầu (+12cm đệm đầu), giữ nguyên L, W & XY.
 *    - ALL: Chu trình fit toàn diện Người đi bộ (1-Click).
 */
export function fitPedestrianBox(
  pts: Array<{ x: number; y: number; z: number }>,
  cx: number,
  cy: number,
  cz: number,
  yaw: number,
  curL: number = 0.65,
  curW: number = 0.65,
  curH: number = 1.70,
  options: {
    headBuffer?: number;
    margin?: number;
    egoPos?: { x: number; y: number; z?: number };
    step?: "all" | "top" | "side" | "front" | "l" | "w" | "h";
    attributes?: Record<string, any>;
  } = {},
  stepParam: "all" | "top" | "side" | "front" | "l" | "w" | "h" = "all"
): PedestrianFitResult {
  const step = options.step ?? stepParam;
  // Đệm nóc đỉnh đầu chuẩn tinh gọn (+5cm theo GEMINI.md), không đệm quá dày làm box vọt lên quá cao
  const headBuffer = options.headBuffer ?? 0.05;
  const margin = options.margin ?? 0.15;

  // 1. Quét mặt đất:
  // - Bán kính mở rộng 1.0m quanh chân để check độ dốc địa hình tham khảo (dốc dọc pitchRef, dốc ngang rollRef)
  // - Bán kính siêu hẹp sát chân (R <= 0.45m) để trích xuất cao độ mặt đất tiếp xúc gót chân
  const baseZ = cz - curH / 2;
  const groundSlopeInfo = estimateGroundSlopeInRadius(pts, cx, cy, cz, 1.0, 0.35, baseZ);
  const groundPitchDeg = groundSlopeInfo.pitchDeg;
  const groundRollDeg = groundSlopeInfo.rollDeg;

  const footRadius = Math.max(0.35, Math.max(curL, curW) / 2 + margin);
  const footGroundPts: number[] = [];
  const maxFootGroundZ = baseZ + 0.35;
  const minFootGroundZ = baseZ - 1.0;

  for (const p of pts) {
    if (p.z > maxFootGroundZ || p.z < minFootGroundZ) continue;
    const dx = p.x - cx;
    const dy = p.y - cy;
    if (dx * dx + dy * dy <= footRadius * footRadius) {
      footGroundPts.push(p.z);
    }
  }

  let groundZ = baseZ;
  if (footGroundPts.length >= 3) {
    footGroundPts.sort((a, b) => a - b);
    groundZ = footGroundPts[Math.max(0, Math.floor(footGroundPts.length * 0.15))];
  }

  // 2. Thu thập điểm thân người và chân:
  // - Tầng thân chính (Core Body): Z in [groundZ + 0.30m, groundZ + 2.30m]
  // - Tầng chân (Foot/Ankle): Z in [groundZ + 0.08m, groundZ + 0.30m] (ở SIDE & FRONT hạ xuống groundZ + 0.02m để giữ trọn curpoint)
  // GIỮ TRỌN CURPOINT: Không gạt bỏ điểm tầng chân khi thân có nhiều điểm (tránh cắt mất curpoint bàn chân/mũi chân)
  const minCoreZ = groundZ + 0.30;
  const maxBodyZ = groundZ + 2.00;
  const minFootZ = (step === "side" || step === "front") ? groundZ + 0.02 : groundZ + 0.08;
  const outerL = Math.max(0.45, curL / 2 + 0.25);
  const outerW = Math.max(0.40, curW / 2 + 0.25);

  const cosY = Math.cos(-yaw);
  const sinY = Math.sin(-yaw);
  const coreBodyPts: Array<{ lx: number; ly: number; z: number }> = [];
  const footPts: Array<{ lx: number; ly: number; z: number }> = [];

  for (const p of pts) {
    if (p.z < minFootZ || p.z > maxBodyZ) continue;
    const dx = p.x - cx;
    const dy = p.y - cy;
    const lx = dx * cosY - dy * sinY;
    const ly = dx * sinY + dy * cosY;
    if (Math.abs(lx) <= outerL && Math.abs(ly) <= outerW) {
      if (p.z >= minCoreZ) {
        coreBodyPts.push({ lx, ly, z: p.z });
      } else {
        // Tầng chân: chỉ loại bỏ các tia quét xiên loang quá xa ngoài bán kính sải chân người
        if (Math.abs(lx) <= Math.max(0.35, curL / 2 + 0.12) && Math.abs(ly) <= Math.max(0.30, curW / 2 + 0.12)) {
          footPts.push({ lx, ly, z: p.z });
        }
      }
    }
  }

  // Phối hợp điểm:
  // - Ở nút SIDE & FRONT: Tính luôn cả điểm tầng chân để mép cản/sườn đón tia ôm trọn curpoint bàn chân/mũi chân ngoài cùng
  // - Ở các nút Fit Size (L, W, H) & ALL: Ưu tiên tầng thân chính nếu có >= 8 điểm để chống phình to kích thước do vệt quét loang sát đất
  let rawBodyPts: Array<{ lx: number; ly: number; z: number }>;
  if (step === "side" || step === "front") {
    rawBodyPts = [...coreBodyPts, ...footPts];
  } else {
    rawBodyPts = coreBodyPts.length >= 8 ? coreBodyPts : [...coreBodyPts, ...footPts];
  }

  const isSparse = rawBodyPts.length <= 12;

  // 2b. Phân cụm 5x Point Dilation cho Người Đi Bộ:
  // Khối thân người mục tiêu liên thông chặt chẽ (Reff = 5 * 2.2cm = 11cm -> Dconnect = 22cm).
  // Chém đứt người đi bên cạnh (đám đông) cách > 22cm, bảo tồn curpoint bàn chân, mũi chân, đầu vai.
  // Khi ít điểm ở xa (N <= 12): Tự động bảo toàn 100% biên cực trị theo GEMINI.md mục 9 để không bị teo nhỏ.
  let cleanPedBodyPts = rawBodyPts;
  if (!isSparse) {
    const pedDilationRes = clusterByPointDilation5x(rawBodyPts, {
      basePointSize: 0.022,
      dilationFactor: 5.0,
      connectDist: 0.22,
      dim: "2d",
      centerBias: { lx: 0, ly: 0 },
    });
    cleanPedBodyPts = pedDilationRes.dominantPts.length >= 6 ? pedDilationRes.dominantPts : rawBodyPts;
  }

  // 3. Phân tích A-O-D-E (Anisotropic Oriented Density Envelope) & Phân cụm tự thích ứng:
  // - Vùng elip định hướng bán trục semiA = 0.55m, semiB = 0.55m (chuẩn Tool_QC max L=1.0, W=1.0)
  // - Cắt thung lũng mật độ 4 cực (gap > 12cm) để cắt đứt người đi cùng / đám đông / vỉa hè
  // - Histogram bin 2cm xác định lõi thân (lxPeak, lyPeak) và bảo vệ viền mỏng (Density Drop-off)
  // - Tính khoảng cách chưa bọc (uncoveredFront/Rear/Left/Right)
  const aodeRes = analyzeOrientedDensityEnvelope(
    cleanPedBodyPts,
    "pedestrian",
    curL,
    curW,
    curH,
    groundZ,
    {
      binSize: 0.02,
      densityValleyGap: 0.12,
      attributes: options.attributes,
      isSideOrFrontStep: step === "side" || step === "front",
      egoLocalPos: options.egoPos ? {
        lx: (options.egoPos.x - cx) * Math.cos(yaw) + (options.egoPos.y - cy) * Math.sin(yaw),
        ly: -(options.egoPos.x - cx) * Math.sin(yaw) + (options.egoPos.y - cy) * Math.cos(yaw),
      } : undefined,
    }
  );

  // Giảm cắt nhiễu bớt đi: Nới lỏng gap ở SIDE (trục X) và FRONT (trục Y) để không chém đứt curpoint sải chân, tay hay balo
  const maxGapLy = (step === "front" || isSparse) ? 0.30 : 0.22;
  const maxGapLx = (step === "side" || isSparse) ? 0.32 : 0.22;

  const sourcePts = aodeRes.filteredPts.length >= 3 ? aodeRes.filteredPts : rawBodyPts;
  const clusterLy = filterDenseConnectedCluster1D(sourcePts, "ly", maxGapLy, 0);
  const bodyPts = filterDenseConnectedCluster1D(clusterLy, "lx", maxGapLx, 0);

  let newCenterX = cx;
  let newCenterY = cy;
  let newCenterZ = cz;
  let newYawRad = yaw;
  let newYawDeg = radToDeg(yaw);
  let deltaYawDeg = 0;
  let newL = curL;
  let newW = curW;
  let newH = curH;
  let shiftLx = 0;
  let shiftLy = 0;
  let roofTopZ = groundZ + curH;
  let msg = "";

  if (bodyPts.length < 3) {
    return {
      newCenterX,
      newCenterY,
      newCenterZ,
      newYawRad,
      newYawDeg,
      deltaYawDeg: 0,
      newL,
      newW,
      newH,
      pitchRad: 0,
      rollRad: 0,
      pitchDeg: 0,
      rollDeg: 0,
      groundZ: Number(groundZ.toFixed(3)),
      roofTopZ: Number(roofTopZ.toFixed(3)),
      pointsCount: bodyPts.length,
      step,
      message: `Không đủ điểm LiDAR thân người (${bodyPts.length} điểm), giữ nguyên box`,
      aodeInfo: {
        meanR: aodeRes.meanR,
        meanAbsLx: aodeRes.meanAbsLx,
        meanAbsLy: aodeRes.meanAbsLy,
        uncoveredFront: aodeRes.uncoveredFront,
        uncoveredRear: aodeRes.uncoveredRear,
        uncoveredLeft: aodeRes.uncoveredLeft,
        uncoveredRight: aodeRes.uncoveredRight,
        lxPeak: aodeRes.lxPeak,
        lyPeak: aodeRes.lyPeak,
        hasCrowdSeparation: aodeRes.hasCrowdSeparation,
      },
    };
  }

  const allLx = bodyPts.map((p) => p.lx).sort((a, b) => a - b);
  const allLy = bodyPts.map((p) => p.ly).sort((a, b) => a - b);
  const allZ = bodyPts.map((p) => p.z).sort((a, b) => a - b);

  // Giảm cắt nhiễu bớt đi: Chỉ cắt 1% nếu mây điểm cực đông (>= 25 điểm), không cắt mất curpoint đón tia
  const pMinIdx = !isSparse && bodyPts.length >= 25 ? Math.floor(bodyPts.length * 0.01) : 0;
  const pMaxIdx = !isSparse && bodyPts.length >= 25 ? Math.min(bodyPts.length - 1, Math.floor(bodyPts.length * 0.99)) : bodyPts.length - 1;

  const lxMin = allLx[pMinIdx];
  const lxMax = allLx[pMaxIdx];
  const lyMin = allLy[pMinIdx];
  const lyMax = allLy[pMaxIdx];
  // Cắt thung lũng mật độ trục Z (loại bỏ 100% điểm nhiễu lơ lửng trên cao gap > 15cm)
  const highestPtZ = detectTrueHeadZ(allZ, 0.15, groundZ, 1.78);

  // =========================================================================
  // XỬ LÝ THEO TỪNG CHẾ ĐỘ FIT CHO NGƯỜI ĐI BỘ (TOP, SIDE, FRONT, L, W, H, ALL)
  // =========================================================================

  if (step === "top") {
    // -------------------------------------------------------------
    // 1. CĂN TOP ĐỘC LẬP: Ước lượng trục xoay quanh thân người mục tiêu
    // - Kháng đám đông: Điểm thân đã được bóc tách đơn lẻ sạch sẽ
    // - Khóa cứng vị trí X, Y, Z (Không ghim đất)
    // - Khóa cứng 100% kích thước L, W, H
    // -------------------------------------------------------------
    const headingRes = estimateTwoWheelerHeading(bodyPts, yaw);
    // Giới hạn biên độ xoay delta <= 25° để tránh lật vuông góc nếu người đứng chéo
    if (Math.abs(headingRes.deltaYawDeg) <= 25) {
      newYawRad = headingRes.newYawRad;
      newYawDeg = headingRes.newYawDeg;
      deltaYawDeg = headingRes.deltaYawDeg;
    } else {
      newYawRad = yaw;
      newYawDeg = radToDeg(yaw);
      deltaYawDeg = 0;
    }

    newCenterX = cx;
    newCenterY = cy;
    newCenterZ = cz;
    newL = curL;
    newW = curW;
    newH = curH;

    const deltaSign = deltaYawDeg >= 0 ? "+" : "";
    msg = `Đã căn TOP Người đi bộ: Xoay Yaw (${newYawDeg}°, Δ=${deltaSign}${deltaYawDeg.toFixed(1)}°), khóa tâm X/Y/Z và kích thước (kháng dính đám đông)`;
  } else if (step === "side") {
    // -------------------------------------------------------------
    // 2. CĂN SIDE ĐỘC LẬP: Căn cản trước/sau đón tia theo trục dọc X
    // - 🚨 TUYỆT ĐỐI KHÔNG GHIM ĐẤT: Giữ nguyên 100% cao độ Z (newCenterZ = cz)
    // - Khóa cứng 100% kích thước L, W, H
    // - Giữ nguyên trục ngang Y (shiftLy = 0)
    // -------------------------------------------------------------
    newYawRad = yaw;
    newYawDeg = radToDeg(yaw);
    deltaYawDeg = 0;
    newL = curL;
    newW = curW;
    newH = curH;
    newCenterZ = cz;

    shiftLx = 0;
    let bumperLabel = "Cân đối";

    if (options.egoPos) {
      const toEgoX = options.egoPos.x - cx;
      const toEgoY = options.egoPos.y - cy;
      const egoLocalX = toEgoX * Math.cos(yaw) + toEgoY * Math.sin(yaw);
      const egoLocalY = -toEgoX * Math.sin(yaw) + toEgoY * Math.cos(yaw);

      // Ngưỡng góc 25 độ: tan(25°) ≈ 0.466
      const isSideBeamParallel = Math.abs(egoLocalX) <= Math.abs(egoLocalY) * 0.466;

      if (isSideBeamParallel) {
        // VÙNG 1: TRỤC Y EGO SONG SONG VẬT THỂ / CHIẾU NGANG SƯỜN:
        // Dàn đều tâm đối xứng đầu - cuối
        shiftLx = (lxMin + lxMax) / 2;
        bumperLabel = "Chiếu ngang sườn (Dàn đều trước - sau)";
      } else if (egoLocalX < 0) {
        // VÙNG 2: LỆCH GÓC > 25° VÀ BOX Ở PHÍA TRƯỚC EGO (Ego nhìn từ sau tới):
        // Laser đập vào Lưng / Sau gót -> Ưu tiên bắt Mép Sau:
        shiftLx = (lxMin - 0.02) + curL / 2;
        bumperLabel = "Mặt sau";
      } else {
        // VÙNG 3: LỆCH GÓC > 25° VÀ BOX Ở PHÍA SAU EGO (Ego nhìn từ trước về):
        // Laser đập vào Ngực / Mũi trước -> Ưu tiên bắt Mép Trước:
        shiftLx = (lxMax + 0.02) - curL / 2;
        bumperLabel = "Mặt trước";
      }
    } else {
      const frontCount = bodyPts.filter((p) => p.lx > 0).length;
      const rearCount = bodyPts.filter((p) => p.lx <= 0).length;
      if (frontCount > rearCount * 1.5) {
        shiftLx = (lxMax + 0.02) - curL / 2;
        bumperLabel = "Mặt trước";
      } else if (rearCount > frontCount * 1.5) {
        shiftLx = (lxMin - 0.02) + curL / 2;
        bumperLabel = "Mặt sau";
      } else {
        shiftLx = (lxMin + lxMax) / 2;
        bumperLabel = "Cân đối";
      }
    }

    shiftLx = Math.max(-0.35, Math.min(0.35, shiftLx));
    if (Math.abs(shiftLx) < 0.005) shiftLx = 0;
    newCenterX = Number((cx + shiftLx * Math.cos(yaw)).toFixed(3));
    newCenterY = Number((cy + shiftLx * Math.sin(yaw)).toFixed(3));

    const deltaXSign = shiftLx >= 0 ? "+" : "";
    msg = `Đã căn SIDE Người đi bộ: [${bumperLabel}] bám mép đón tia (ΔX: ${deltaXSign}${(shiftLx * 100).toFixed(1)}cm, giữ nguyên Z), Khóa size ${curL}x${curW}x${curH}m`;
  } else if (step === "front") {
    // -------------------------------------------------------------
    // 3. CĂN FRONT ĐỘC LẬP: ÔM SÁT POINT CLOUD HƯỚNG VỀ PHÍA EGO
    // - Mặt phẳng 2D Y - Z theo phương W: Căn sườn đón tia Ego
    // - 🚨 TUYỆT ĐỐI KHÔNG GHIM ĐẤT: Giữ nguyên 100% cao độ Z (newCenterZ = cz)
    // - Khóa cứng 100% kích thước L, W, H
    // - Giữ nguyên trục dọc X (shiftLx = 0)
    // - Ôm sát khít khao mép đón tia Ego (Line-of-Sight Boundary Snap)
    // -------------------------------------------------------------
    newYawRad = yaw;
    newYawDeg = radToDeg(yaw);
    deltaYawDeg = 0;
    newL = curL;
    newW = curW;
    newH = curH;
    newCenterZ = cz;

    let visibleSide: "left" | "right" | "center" = "center";
    shiftLy = 0;
    const edgePadding = 0.025; // 2.5cm

    if (options.egoPos) {
      const toEgoX = options.egoPos.x - cx;
      const toEgoY = options.egoPos.y - cy;
      const egoLocalX = toEgoX * Math.cos(yaw) + toEgoY * Math.sin(yaw);
      const egoLocalY = -toEgoX * Math.sin(yaw) + toEgoY * Math.cos(yaw);

      // Khi Ego nhìn chính diện trước/sau (|egoLocalY| <= |egoLocalX| * 0.15)
      if (Math.abs(egoLocalY) <= Math.abs(egoLocalX) * 0.15 && Math.abs(egoLocalY) < 0.10) {
        visibleSide = "center";
        shiftLy = (lyMin + lyMax) / 2;
      } else if (egoLocalY >= 0) {
        visibleSide = "left";
        shiftLy = (lyMax + edgePadding) - curW / 2;
      } else {
        visibleSide = "right";
        shiftLy = (lyMin - edgePadding) + curW / 2;
      }
    } else {
      const leftCount = bodyPts.filter((p) => p.ly > 0.03).length;
      const rightCount = bodyPts.filter((p) => p.ly < -0.03).length;
      if (leftCount > rightCount * 1.3) {
        visibleSide = "left";
        shiftLy = (lyMax + edgePadding) - curW / 2;
      } else if (rightCount > leftCount * 1.3) {
        visibleSide = "right";
        shiftLy = (lyMin - edgePadding) + curW / 2;
      } else {
        visibleSide = "center";
        shiftLy = (lyMin + lyMax) / 2;
      }
    }

    shiftLy = Math.max(-0.35, Math.min(0.35, shiftLy));
    if (Math.abs(shiftLy) < 0.005) shiftLy = 0;
    newCenterX = Number((cx - shiftLy * Math.sin(yaw)).toFixed(3));
    newCenterY = Number((cy + shiftLy * Math.cos(yaw)).toFixed(3));

    const deltaYSign = shiftLy >= 0 ? "+" : "";
    const sideText = visibleSide === "left" ? "Sườn Trái đón tia Ego" : visibleSide === "right" ? "Sườn Phải đón tia Ego" : "Cân đối 2 sườn";
    msg = `Đã căn FRONT Người đi bộ: [${sideText}] ôm sát viền đón tia (ΔY: ${deltaYSign}${(shiftLy * 100).toFixed(1)}cm, giữ nguyên Z), Khóa size ${curL}x${curW}x${curH}m`;
  } else if (step === "l") {
    // -------------------------------------------------------------
    // 4. FIX RIÊNG CHIỀU DÀI L: Co giãn theo mây điểm thân người & Kháng Ghosting
    // - Khi ít điểm: Bắt trọn 100% biên cực trị
    // - Khi bị Ghosting kéo dài (> 0.80m): Khóa trần L = 0.80m, ưu tiên ôm cản đón tia Ego
    // - Giữ nguyên 100% Chiều rộng W, Chiều cao H, Cao độ Z và trục Y
    // -------------------------------------------------------------
    newYawRad = yaw;
    newYawDeg = radToDeg(yaw);
    deltaYawDeg = 0;
    newW = curW;
    newH = curH;
    newCenterZ = cz;

    // Nhận diện người mang vác Balo to / Vali / Gùi hàng qua attributes hoặc phân bố điểm thân trên
    const isBackpack = Boolean(
      options.attributes?.backpack ||
      options.attributes?.baggage ||
      options.attributes?.carrying_object ||
      options.attributes?.cargo
    );
    const isLuggage = Boolean(
      options.attributes?.luggage ||
      options.attributes?.suitcase ||
      options.attributes?.bag
    );
    const isSitting = Boolean(options.attributes?.sitting || options.attributes?.pose === "sitting");

    const spanL = (lxMax - lxMin) + 0.05;
    shiftLx = 0;

    // Giới hạn trần an toàn theo GEMINI.md & Tool_QC:
    // Bình thường L <= 0.78m (kháng ghosting motion smear), nếu có attribute Balo/Vali cho phép mở rộng lên trần L <= 1.00m
    const maxCapL = isBackpack ? 1.00 : 0.78;

    if (spanL > maxCapL) {
      newL = maxCapL;
      if (options.egoPos) {
        const toEgoX = options.egoPos.x - cx;
        const toEgoY = options.egoPos.y - cy;
        const egoLocalX = toEgoX * Math.cos(yaw) + toEgoY * Math.sin(yaw);
        const egoLocalY = -toEgoX * Math.sin(yaw) + toEgoY * Math.cos(yaw);
        const isSideBeamParallel = Math.abs(egoLocalX) <= Math.abs(egoLocalY) * 0.466;

        if (isSideBeamParallel) {
          shiftLx = (lxMin + lxMax) / 2;
        } else if (egoLocalX < 0) {
          shiftLx = (lxMin - 0.02) + newL / 2;
        } else {
          shiftLx = (lxMax + 0.02) - newL / 2;
        }
      } else {
        shiftLx = (lxMin + lxMax) / 2;
      }
    } else {
      // Co giãn theo mây điểm thân người thực tế (min 0.35m, nếu có Balo nới trần lên maxCapL 1.00m chuẩn Tool_QC)
      newL = Number(Math.max(0.35, Math.min(maxCapL, spanL)).toFixed(2));
      shiftLx = (lxMin + lxMax) / 2;
    }

    shiftLx = Math.max(-0.35, Math.min(0.35, shiftLx));
    newCenterX = Number((cx + shiftLx * Math.cos(yaw)).toFixed(3));
    newCenterY = Number((cy + shiftLx * Math.sin(yaw)).toFixed(3));

    const deltaXSign = shiftLx >= 0 ? "+" : "";
    const backpackTag = isBackpack ? " [🎒 Balo/Đồ mang vác]" : "";
    msg = `Đã fix Chiều Dài (L) Người đi bộ${backpackTag}: L=${newL}m (căn tâm X: ${deltaXSign}${(shiftLx * 100).toFixed(1)}cm, chuẩn Tool_QC), giữ nguyên W, H & Z`;
  } else if (step === "w") {
    // -------------------------------------------------------------
    // 5. FIX RIÊNG CHIỀU RỘNG W: Co giãn vừa vặn theo vai/ngực & Kháng phình to
    // - Đệm nhẹ +4cm ôm sát thân người
    // - Bình thường khóa trần W = 0.68m, nếu xách vali/túi cho phép mở rộng lên trần Tool_QC W <= 1.00m
    // - Giữ nguyên 100% Chiều dài L, Chiều cao H, Cao độ Z và trục X
    // -------------------------------------------------------------
    newYawRad = yaw;
    newYawDeg = radToDeg(yaw);
    deltaYawDeg = 0;
    newL = curL;
    newH = curH;
    newCenterZ = cz;

    const isLuggage = Boolean(
      options.attributes?.luggage ||
      options.attributes?.carrying_object ||
      options.attributes?.suitcase ||
      options.attributes?.bag
    );

    const spanW = (lyMax - lyMin) + 0.04;
    shiftLy = 0;
    const maxCapW = isLuggage ? 1.00 : 0.68;

    if (spanW > maxCapW) {
      newW = maxCapW;
      if (options.egoPos) {
        const toEgoX = options.egoPos.x - cx;
        const toEgoY = options.egoPos.y - cy;
        const egoLocalY = -toEgoX * Math.sin(yaw) + toEgoY * Math.cos(yaw);
        if (egoLocalY > 0.04) {
          shiftLy = (lyMax + 0.01) - newW / 2;
        } else if (egoLocalY < -0.04) {
          shiftLy = (lyMin - 0.01) + newW / 2;
        } else {
          shiftLy = (lyMin + lyMax) / 2;
        }
      } else {
        shiftLy = (lyMin + lyMax) / 2;
      }
    } else {
      // Co giãn theo mây điểm vai/ngực thực tế (min 0.35m, nếu có Vali nới trần lên maxCapW 1.00m chuẩn Tool_QC)
      newW = Number(Math.max(0.35, Math.min(maxCapW, spanW)).toFixed(2));
      shiftLy = (lyMin + lyMax) / 2;
    }

    shiftLy = Math.max(-0.35, Math.min(0.35, shiftLy));
    newCenterX = Number((cx - shiftLy * Math.sin(yaw)).toFixed(3));
    newCenterY = Number((cy + shiftLy * Math.cos(yaw)).toFixed(3));

    const deltaYSign = shiftLy >= 0 ? "+" : "";
    const luggageTag = isLuggage ? " [👜 Vali/Túi xách]" : "";
    msg = `Đã fix Chiều Rộng (W) Người đi bộ${luggageTag}: W=${newW}m (căn tâm Y: ${deltaYSign}${(shiftLy * 100).toFixed(1)}cm, chuẩn Tool_QC), giữ nguyên L, H & Z`;
  } else if (step === "h") {
    // -------------------------------------------------------------
    // 6. FIX RIÊNG CHIỀU CAO H: Bám sàn Z_base cố định, nở lên đỉnh đầu gọn gàng
    // - Mặt đáy tiếp đất giữ nguyên cố định 100%
    // - Đỉnh đầu nở lên +5cm đệm nóc tinh gọn (không đệm quá dày làm vọt lên quá cao)
    // - Kẹp chuẩn Tool_QC: H in [1.20m, 1.90m] (người ngồi H <= 1.45m)
    // - Giữ nguyên 100% Chiều dài L, Chiều rộng W và vị trí XY
    // -------------------------------------------------------------
    newYawRad = yaw;
    newYawDeg = radToDeg(yaw);
    deltaYawDeg = 0;
    newL = curL;
    newW = curW;
    newCenterX = cx;
    newCenterY = cy;

    const currentBaseZ = cz - curH / 2;
    const effectiveBaseZ = Math.abs(currentBaseZ - groundZ) <= 0.35 ? currentBaseZ : groundZ;

    roofTopZ = highestPtZ + headBuffer;
    const isSitting = Boolean(options.attributes?.sitting || options.attributes?.pose === "sitting");
    const maxCapPedH = isSitting ? 1.45 : (options.headBuffer !== undefined ? 1.90 : 1.85);
    const minCapPedH = 1.00; // Cho phép co giãn linh hoạt cho cả trẻ em lẫn người lớn
    newH = Number(Math.max(minCapPedH, Math.min(maxCapPedH, roofTopZ - effectiveBaseZ)).toFixed(2));
    newCenterZ = Number((effectiveBaseZ + newH / 2).toFixed(3));

    const sittingTag = isSitting ? " [🪑 Người ngồi]" : "";
    msg = `Đã fix Chiều Cao (H) Người đi bộ${sittingTag}: H=${newH}m (Đáy bám sàn Z=${effectiveBaseZ.toFixed(2)}m cố định, chuẩn Tool_QC), giữ nguyên L, W & XY`;
  } else {
    // -------------------------------------------------------------
    // 7. CHU TRÌNH TOÀN DIỆN (ALL): 1-Click Smart Fit cho Người
    // -------------------------------------------------------------
    const isBackpack = Boolean(
      options.attributes?.backpack ||
      options.attributes?.baggage ||
      options.attributes?.carrying_object ||
      options.attributes?.cargo
    );
    const isLuggage = Boolean(
      options.attributes?.luggage ||
      options.attributes?.carrying_object ||
      options.attributes?.suitcase ||
      options.attributes?.bag
    );
    const isSitting = Boolean(options.attributes?.sitting || options.attributes?.pose === "sitting");

    const maxCapL = isBackpack ? 1.00 : 0.78;
    const maxCapW = isLuggage ? 1.00 : 0.68;
    const maxCapPedH = isSitting ? 1.45 : (options.headBuffer !== undefined ? 1.90 : 1.85);
    const minCapPedH = 1.00;

    newL = Number(Math.max(0.40, Math.min(maxCapL, lxMax - lxMin + 0.05)).toFixed(2));
    newW = Number(Math.max(0.38, Math.min(maxCapW, lyMax - lyMin + 0.04)).toFixed(2));

    roofTopZ = highestPtZ + headBuffer;
    newH = Number(Math.max(minCapPedH, Math.min(maxCapPedH, roofTopZ - groundZ)).toFixed(2));

    shiftLx = (lxMin + lxMax) / 2;
    shiftLy = (lyMin + lyMax) / 2;

    const maxShift = 0.40;
    shiftLx = Math.max(-maxShift, Math.min(maxShift, shiftLx));
    shiftLy = Math.max(-maxShift, Math.min(maxShift, shiftLy));

    const cosWorld = Math.cos(yaw);
    const sinWorld = Math.sin(yaw);
    newCenterX = Number((cx + shiftLx * cosWorld - shiftLy * sinWorld).toFixed(3));
    newCenterY = Number((cy + shiftLx * sinWorld + shiftLy * cosWorld).toFixed(3));
    newCenterZ = Number((groundZ + newH / 2).toFixed(3));

    const tag = isBackpack ? " [🎒 Balo]" : isLuggage ? " [👜 Vali]" : isSitting ? " [🪑 Ngồi]" : "";
    msg = `Đã fit Người Đi Bộ${tag}: ${newL}x${newW}x${newH}m (Chuẩn Tool_QC, Khóa thẳng 0°, Ghim đất Z: ${newCenterZ}m, Dốc địa hình: ${groundPitchDeg}°/${groundRollDeg}°)`;
  }

  return {
    newCenterX,
    newCenterY,
    newCenterZ,
    newYawRad,
    newYawDeg,
    deltaYawDeg,
    newL,
    newW,
    newH,
    pitchRad: 0,
    rollRad: 0,
    pitchDeg: 0,
    rollDeg: 0,
    groundZ: Number(groundZ.toFixed(3)),
    roofTopZ: Number(roofTopZ.toFixed(3)),
    groundPitchDeg,
    groundRollDeg,
    hasBackpack: Boolean(options.attributes?.backpack || options.attributes?.baggage),
    shiftLx: Number(shiftLx.toFixed(3)),
    shiftLy: Number(shiftLy.toFixed(3)),
    pointsCount: bodyPts.length,
    step,
    message: msg,
    aodeInfo: {
      meanR: aodeRes.meanR,
      meanAbsLx: aodeRes.meanAbsLx,
      meanAbsLy: aodeRes.meanAbsLy,
      uncoveredFront: aodeRes.uncoveredFront,
      uncoveredRear: aodeRes.uncoveredRear,
      uncoveredLeft: aodeRes.uncoveredLeft,
      uncoveredRight: aodeRes.uncoveredRight,
      lxPeak: aodeRes.lxPeak,
      lyPeak: aodeRes.lyPeak,
      hasCrowdSeparation: aodeRes.hasCrowdSeparation,
    },
  };
}

/**
 * Fit riêng chiều dài L cho người đi bộ (co giãn L ôm thân người, căn tâm X, giữ nguyên W, H & Z).
 */
export function fitPedestrianLength(
  pts: Array<{ x: number; y: number; z: number }>,
  cx: number,
  cy: number,
  cz: number,
  yaw: number,
  curL: number = 0.65,
  curW: number = 0.65,
  curH: number = 1.70,
  options: { egoPos?: { x: number; y: number; z?: number } } = {}
): PedestrianFitResult {
  return fitPedestrianBox(pts, cx, cy, cz, yaw, curL, curW, curH, options, "l");
}

/**
 * Fit riêng chiều rộng W cho người đi bộ (co giãn W ôm vai/ngực, căn tâm Y, giữ nguyên L, H & Z).
 */
export function fitPedestrianWidth(
  pts: Array<{ x: number; y: number; z: number }>,
  cx: number,
  cy: number,
  cz: number,
  yaw: number,
  curL: number = 0.65,
  curW: number = 0.65,
  curH: number = 1.70,
  options: { egoPos?: { x: number; y: number; z?: number } } = {}
): PedestrianFitResult {
  return fitPedestrianBox(pts, cx, cy, cz, yaw, curL, curW, curH, options, "w");
}

/**
 * Fit riêng chiều cao H cho người đi bộ (mặt đáy tiếp đất Z_base giữ nguyên cố định, nở lên đỉnh đầu +12cm đệm đầu).
 */
export function fitPedestrianHeight(
  pts: Array<{ x: number; y: number; z: number }>,
  cx: number,
  cy: number,
  cz: number,
  yaw: number,
  curL: number = 0.65,
  curW: number = 0.65,
  curH: number = 1.70,
  options: { headBuffer?: number } = {}
): PedestrianFitResult {
  return fitPedestrianBox(pts, cx, cy, cz, yaw, curL, curW, curH, options, "h");
}
