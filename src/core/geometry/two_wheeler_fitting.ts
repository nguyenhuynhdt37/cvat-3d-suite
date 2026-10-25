/**
 * Module fit xe 2 bánh & Người lái (Two-Wheeler, Cyclist & Motorcycle Fitting).
 * Áp dụng Rider 42% Geometry & Bù mất bánh trước/sau.
 */

import { normalizeAngle, radToDeg } from "./transforms.ts";
import {
  filterDenseConnectedCluster1D,
  clusterByPointDilation5x,
} from "./clustering.ts";
import { estimateGroundSlopeInRadius } from "./ground_curb.ts";
import {
  type PedestrianFitResult,
  detectTrueHeadZ,
  analyzeOrientedDensityEnvelope,
} from "./pedestrian_fitting.ts";

export interface TwoWheelerFitResult extends PedestrianFitResult {
  newYawRad: number;
  newYawDeg: number;
  deltaYawDeg: number;
  step: "all" | "top" | "side" | "front" | "w" | "h";
  hasCargo?: boolean;
}

/**
 * Ước tính trục dài thân xe (Head-Tail Axis Vector) cho Xe 2 Bánh từ cụm mây điểm.
 * Khác với ô tô có mặt phẳng sườn hộp chữ nhật (L-shape), xe 2 bánh thon dẹp, mây điểm
 * phân bố dọc theo vệt bánh sau - người lái - bánh trước.
 * Hàm này tìm vector nối Cực Sau (Rear Extremity) và Cực Trước (Front Extremity)
 * dọc theo trục xe để xác định góc lệch Yaw chính xác nhất.
 */
export function estimateTwoWheelerHeading(
  bodyPts: Array<{ lx: number; ly: number; z: number }>,
  curYaw: number
): { deltaYawRad: number; deltaYawDeg: number; newYawRad: number; newYawDeg: number } {
  if (bodyPts.length < 4) {
    return { deltaYawRad: 0, deltaYawDeg: 0, newYawRad: curYaw, newYawDeg: radToDeg(curYaw) };
  }

  const n = bodyPts.length;

  // 1. Thuật toán PCA 2D trên cụm mây điểm thân xe (Kháng nhiễu cực mạnh)
  let sumLx = 0;
  let sumLy = 0;
  for (const p of bodyPts) {
    sumLx += p.lx;
    sumLy += p.ly;
  }
  const meanLx = sumLx / n;
  const meanLy = sumLy / n;

  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of bodyPts) {
    const dx = p.lx - meanLx;
    const dy = p.ly - meanLy;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  sxx /= n;
  syy /= n;
  sxy /= n;

  const deltaThetaPca = 0.5 * Math.atan2(2 * sxy, sxx - syy);

  // 2. Vector nối Trọng tâm Cụm Đuôi 30% (Bánh sau) -> Trọng tâm Cụm Đầu 30% (Bánh trước)
  const sortedByLx = [...bodyPts].sort((a, b) => a.lx - b.lx);
  const sliceCount = Math.max(1, Math.floor(n * 0.30));
  const rearSlice = sortedByLx.slice(0, sliceCount);
  const frontSlice = sortedByLx.slice(Math.max(sliceCount, n - sliceCount));

  const rearLx = rearSlice.reduce((s, p) => s + p.lx, 0) / rearSlice.length;
  const rearLy = rearSlice.reduce((s, p) => s + p.ly, 0) / rearSlice.length;
  const frontLx = frontSlice.reduce((s, p) => s + p.lx, 0) / frontSlice.length;
  const frontLy = frontSlice.reduce((s, p) => s + p.ly, 0) / frontSlice.length;

  const dLx = frontLx - rearLx;
  const dLy = frontLy - rearLy;
  let deltaThetaExt = deltaThetaPca;
  if (dLx >= 0.30) {
    deltaThetaExt = Math.atan2(dLy, dLx);
  }

  // Kết hợp tối ưu: Nếu cả 2 đều nhỏ và hợp lý thì lấy trung bình có trọng số ưu tiên PCA
  let deltaTheta = Math.abs(deltaThetaPca - deltaThetaExt) < 0.2
    ? 0.7 * deltaThetaPca + 0.3 * deltaThetaExt
    : deltaThetaPca;

  // Giới hạn góc hiệu chỉnh an toàn không quá 45° (tránh bị giật ngang khi có nhiễu)
  const maxDeltaRad = Math.PI / 4;
  deltaTheta = Math.max(-maxDeltaRad, Math.min(maxDeltaRad, deltaTheta));

  const newYawRad = normalizeAngle(curYaw + deltaTheta);
  const deltaYawDeg = radToDeg(deltaTheta);
  const newYawDeg = radToDeg(newYawRad);

  return { deltaYawRad: deltaTheta, deltaYawDeg, newYawRad, newYawDeg };
}

/**
 * Thuật toán FIT CHUYÊN BIỆT CHO XE 2 BÁNH (CYCLIST / MOTORCYCLE):
 * Hỗ trợ 3 bước căn độc lập (TOP - SIDE - FRONT) hoặc toàn chu trình (ALL):
 * - Chiều dài L: BẢO TOÀN 100% CỐ ĐỊNH, không bị co ngắn khi bị khuất lốp trước hoặc lốp sau.
 * - Bước TOP (Heading / Yaw): Ước tính trục dài thân xe (Vector Cực Đuôi -> Cực Đầu / Major Axis),
 *   xoay tại chỗ quanh tâm hiện tại, KHÓA CỨNG vị trí X, Y, Z.
 * - Bước SIDE (Trục X & Ghim Đất): Căn cản đón tia theo chiều dọc X và ghim đáy bánh xe bám sàn
 *   mặt đất Z_ground. Giữ nguyên Y và bảo toàn L.
 * - Bước FRONT (Trục Y, W & H): Căn tâm ngang Y, linh động co giãn W (0.55m - 1.10m bọc người + tay lái/hàng hóa)
 *   và chiều cao H (nở lên trên từ Z_ground tới đỉnh đầu/nón bảo hiểm + buffer 8-10cm). Giữ nguyên X và L.
 */
export function fitTwoWheelerBox(
  pts: Array<{ x: number; y: number; z: number }>,
  cx: number,
  cy: number,
  cz: number,
  yaw: number,
  curL: number = 1.75,
  curW: number = 0.65,
  curH: number = 1.55,
  options: {
    headBuffer?: number;
    margin?: number;
    egoPos?: { x: number; y: number; z?: number };
    step?: "all" | "top" | "side" | "front" | "w" | "h";
    attributes?: Record<string, any>;
  } = {},
  stepParam: "all" | "top" | "side" | "front" | "w" | "h" = "all"
): TwoWheelerFitResult {
  const step = options.step ?? stepParam;
  // Đệm nóc xe 2 bánh chuẩn tinh gọn (+5cm theo GEMINI.md), tránh box bị cao lêu nghêu
  const headBuffer = options.headBuffer ?? 0.05;
  const margin = options.margin ?? 0.20;

  // 1. Quét mặt đất:
  // - Bán kính mở rộng 1.5m bao quát trọn cả vệt 2 bánh xe để check độ dốc địa hình tham khảo
  // - Bán kính vệt bánh xe (R <= curL/2 + margin) lấy cao độ mặt đất chuẩn
  const baseZ = cz - curH / 2;
  const groundSlopeInfo = estimateGroundSlopeInRadius(pts, cx, cy, cz, 1.5, 0.35, baseZ);
  const groundPitchDeg = groundSlopeInfo.pitchDeg;
  const groundRollDeg = groundSlopeInfo.rollDeg;

  const footRadius = Math.max(0.60, curL / 2 + margin);
  const groundPts: number[] = [];
  const maxGroundZ = baseZ + 0.35;
  const minGroundZ = baseZ - 1.0;

  for (const p of pts) {
    if (p.z > maxGroundZ || p.z < minGroundZ) continue;
    const dx = p.x - cx;
    const dy = p.y - cy;
    if (dx * dx + dy * dy <= footRadius * footRadius) {
      groundPts.push(p.z);
    }
  }

  let groundZ = baseZ;
  if (groundPts.length >= 3) {
    groundPts.sort((a, b) => a - b);
    groundZ = groundPts[Math.max(0, Math.floor(groundPts.length * 0.15))];
  }

  // 2. Thu thập điểm thân xe và bánh xe:
  // - Tầng thân xe & người lái (Core): Z in [groundZ + 0.25m, groundZ + 2.30m]
  // - Tầng lốp/bánh xe sát đất: Z in [groundZ + 0.08m, groundZ + 0.25m] (ở SIDE & FRONT hạ xuống groundZ + 0.02m để giữ trọn curpoint)
  // GIỮ TRỌN CURPOINT: Không gạt bỏ bánh xe khi thân có nhiều điểm (tránh cắt mất curpoint lốp xe trước/sau)
  const minCoreZ = groundZ + 0.25;
  const maxBodyZ = groundZ + 2.00;
  const minWheelZ = (step === "side" || step === "front") ? groundZ + 0.02 : groundZ + 0.08;
  const outerL = curL / 2 + 0.45;
  const outerW = Math.max(curW, 0.85) / 2 + 0.45;

  const cosY = Math.cos(-yaw);
  const sinY = Math.sin(-yaw);
  const corePts: Array<{ lx: number; ly: number; z: number }> = [];
  const wheelPts: Array<{ lx: number; ly: number; z: number }> = [];

  for (const p of pts) {
    if (p.z < minWheelZ || p.z > maxBodyZ) continue;
    const dx = p.x - cx;
    const dy = p.y - cy;
    const lx = dx * cosY - dy * sinY;
    const ly = dx * sinY + dy * cosY;
    if (Math.abs(lx) <= outerL && Math.abs(ly) <= outerW) {
      if (p.z >= minCoreZ) {
        corePts.push({ lx, ly, z: p.z });
      } else {
        // Điểm bánh xe sát đất: chỉ loại bỏ các tia quét xiên loang quá xa ngoài trục xe
        if (Math.abs(ly) <= Math.max(0.25, curW / 2 + 0.08)) {
          wheelPts.push({ lx, ly, z: p.z });
        }
      }
    }
  }

  // Phối hợp điểm:
  // - Ở nút SIDE & FRONT: Tính luôn cả điểm bánh xe để cản trước/sau và sườn đón tia ôm trọn curpoint lốp xe ngoài cùng
  // - Ở các nút Fit Size (W, H) & ALL: Ưu tiên tầng thân xe nếu có >= 8 điểm để chống phình to kích thước do vệt quét sát đất
  let rawPts: Array<{ lx: number; ly: number; z: number }>;
  if (step === "side" || step === "front") {
    rawPts = [...corePts, ...wheelPts];
  } else {
    rawPts = corePts.length >= 8 ? corePts : [...corePts, ...wheelPts];
  }

  const isSparse = rawPts.length <= 12;

  // 2b. Phân cụm 5x Point Dilation cho Xe 2 Bánh:
  // Xe 2 bánh có trục dọc dài nên nới nhẹ connectDistLx = 0.38m để thông suốt 2 bánh (theo GEMINI.md mục 10),
  // trục ngang ly connectDistLy = 0.32m ôm trọn gương xe và tay lái, loại bỏ xe máy khác chạy song song (cách >= 40cm).
  // Khi ít điểm ở xa (N <= 12): Tự động bảo toàn 100% biên cực trị theo GEMINI.md mục 9 để không bị teo nhỏ.
  let cleanCyclistPts = rawPts;
  if (!isSparse) {
    const cyclistDilationRes = clusterByPointDilation5x(rawPts, {
      basePointSize: 0.03,
      dilationFactor: 5.0,
      connectDist: 0.30,
      connectDistLx: 0.38,
      connectDistLy: 0.32,
      dim: "2d",
      centerBias: { lx: 0, ly: 0 },
    });
    cleanCyclistPts = cyclistDilationRes.dominantPts.length >= 8 ? cyclistDilationRes.dominantPts : rawPts;
  }

  // 3. Phân tích A-O-D-E (Anisotropic Oriented Density Envelope) & Phân cụm tự thích ứng:
  // - Vùng elip định hướng bán trục semiA = 1.15m, semiB = 0.55m (chuẩn Tool_QC max L=2.0, W=0.9)
  // - Khóa chặt ly in [-0.55m, +0.55m] để không bao giờ quét nhầm xe máy/xe đạp chạy song song ở 2 bên sườn
  // - Cắt thung lũng mật độ 4 cực (gap > 12cm trên trục ly và ngoài đầu/đuôi xe) để loại bỏ xe song song / vỉa hè
  // - Histogram bin 2cm xác định lõi thân xe (lxPeak, lyPeak) và bảo vệ viền mỏng (Density Drop-off) ôm gương xe & tay lái
  // - Tính khoảng cách chưa bọc (uncoveredFront/Rear/Left/Right)
  const aodeRes = analyzeOrientedDensityEnvelope(
    cleanCyclistPts,
    "two_wheel",
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

  // Giảm cắt nhiễu bớt đi: Dùng maxGapLx = 0.38m ở Side để nối thông lốp trước/sau; maxGapLy = 0.35m ở Front để nối thông gương/tay lái
  const maxGapLx = (step === "side" || isSparse) ? 0.38 : 0.28;
  const maxGapLy = (step === "front" || isSparse) ? 0.35 : 0.24;
  const sourcePts = aodeRes.filteredPts.length >= 3 ? aodeRes.filteredPts : rawPts;
  const clusterLy = filterDenseConnectedCluster1D(sourcePts, "ly", maxGapLy, 0);
  const bodyPts = filterDenseConnectedCluster1D(clusterLy, "lx", maxGapLx, 0);

  // Giá trị khởi tạo mặc định (giữ nguyên hiện trạng nếu thiếu điểm)
  let newCenterX = cx;
  let newCenterY = cy;
  let newCenterZ = cz;
  let newYawRad = yaw;
  let newYawDeg = radToDeg(yaw);
  let deltaYawDeg = 0;
  let newL = curL; // BẢO TOÀN TUYỆT ĐỐI 100% CHIỀU DÀI L
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
      message: `Không đủ điểm LiDAR xe 2 bánh (${bodyPts.length} điểm), giữ nguyên box`,
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
        hasParallelVehicleSeparation: aodeRes.hasParallelVehicleSeparation,
      },
    };
  }

  const allLx = bodyPts.map((p) => p.lx).sort((a, b) => a - b);
  const allLy = bodyPts.map((p) => p.ly).sort((a, b) => a - b);
  const allZ = bodyPts.map((p) => p.z).sort((a, b) => a - b);

  // Nếu ít điểm: Bắt trọn 100% điểm cực biên không dùng phân vị làm teo nhỏ box
  const pMinIdx = !isSparse && bodyPts.length >= 30 ? Math.floor(bodyPts.length * 0.015) : 0;
  const pMaxIdx = !isSparse && bodyPts.length >= 30 ? Math.min(bodyPts.length - 1, Math.floor(bodyPts.length * 0.985)) : bodyPts.length - 1;

  const lxMin = allLx[pMinIdx];
  const lxMax = allLx[pMaxIdx];
  const lyMin = allLy[pMinIdx];
  const lyMax = allLy[pMaxIdx];
  // Cắt thung lũng mật độ trục Z (loại bỏ 100% điểm nhiễu lơ lửng trên cao gap > 15cm)
  const highestPtZ = detectTrueHeadZ(allZ, 0.15, groundZ, 1.60);

  // =========================================================================
  // BƯỚC 1: XỬ LÝ THEO TỪNG CHẾ ĐỘ FIT (TOP, SIDE, FRONT HOẶC ALL)
  // =========================================================================

  if (step === "top") {
    // -------------------------------------------------------------
    // CHẾ ĐỘ 1: CĂN TOP ĐỘC LẬP (Xoay Yaw theo Trục Đầu - Đuôi Thân Xe)
    // -------------------------------------------------------------
    const headingRes = estimateTwoWheelerHeading(bodyPts, yaw);
    newYawRad = headingRes.newYawRad;
    newYawDeg = headingRes.newYawDeg;
    deltaYawDeg = headingRes.deltaYawDeg;

    // KHÓA CỨNG VỊ TRÍ VÀ KÍCH THƯỚC: Nút TOP chỉ xoay tại chỗ quanh tâm!
    newCenterX = cx;
    newCenterY = cy;
    newCenterZ = cz;
    newL = curL;
    newW = curW;
    newH = curH;

    const deltaSign = deltaYawDeg >= 0 ? "+" : "";
    msg = `Đã căn TOP Xe 2 bánh: Xoay Yaw (${newYawDeg}°, Δ=${deltaSign}${deltaYawDeg.toFixed(1)}°) theo trục Đầu - Đuôi, khóa tâm X/Y/Z và kích thước`;
  } else if (step === "side") {
    // -------------------------------------------------------------
    // CHẾ ĐỘ 2: CĂN SIDE ĐỘC LẬP (Cản đón tia X, Rider 42% Geometry, Khóa L)
    // -------------------------------------------------------------
    newYawRad = yaw;
    newYawDeg = radToDeg(yaw);
    deltaYawDeg = 0;
    newL = curL; // BẢO TOÀN TUYỆT ĐỐI 100% CHIỀU DÀI L
    newW = curW;
    newH = curH;

    shiftLx = 0;
    let bumperLabel = "Đón tia";

    // Phân tích Người Lái (Rider): Người lái ở tầng cao Z >= groundZ + 0.65m
    // Theo chuẩn giải phẫu hình học xe 2 bánh: Người lái ngồi cách cản trước khoảng 42% chiều dài xe (lxRider ~ +0.08 * curL)
    const riderPts = bodyPts.filter((p) => p.z >= groundZ + 0.65);
    const hasRider = riderPts.length >= 2;
    let lxRider = 0;
    if (hasRider) {
      const sortedRiderLx = riderPts.map((p) => p.lx).sort((a, b) => a - b);
      lxRider = sortedRiderLx[Math.floor(sortedRiderLx.length / 2)];
    }

    const distFront = hasRider ? lxMax - lxRider : curL / 2;
    const distRear = hasRider ? lxRider - lxMin : curL / 2;

    // Ngưỡng phát hiện mất bánh xe:
    // Bình thường: khoảng cách từ người lái ra đầu xe ~ 0.42 * L; về đuôi xe ~ 0.58 * L.
    // Nếu distFront < 0.28 * curL -> Mất bánh trước!
    // Nếu distRear < 0.38 * curL -> Mất bánh sau!
    const isMissingFront = hasRider && distFront < 0.28 * curL;
    const isMissingRear = hasRider && distRear < 0.38 * curL;

    let toEgoX = 0;
    let toEgoY = 0;
    let egoLocalX = 0;
    let egoLocalY = 0;
    let hasEgo = false;
    let isSideBeamParallel = false;

    if (options.egoPos) {
      toEgoX = options.egoPos.x - cx;
      toEgoY = options.egoPos.y - cy;
      egoLocalX = toEgoX * Math.cos(yaw) + toEgoY * Math.sin(yaw);
      egoLocalY = -toEgoX * Math.sin(yaw) + toEgoY * Math.cos(yaw);
      hasEgo = true;
      // Ngưỡng góc 25 độ: tan(25°) ≈ 0.466
      isSideBeamParallel = Math.abs(egoLocalX) <= Math.abs(egoLocalY) * 0.466;
    }

    if (isMissingFront && isMissingRear) {
      // 1. MẤT CẢ 2 BÁNH (Chỉ có điểm người ngồi lái):
      // Người lái ngồi ở vị trí 42% tính từ đầu xe lùi lại -> Tọa độ tâm box ước lượng là lxRider - 0.08 * curL
      shiftLx = lxRider - 0.08 * curL;
      bumperLabel = "Người lái 42% (Mất cả 2 bánh)";
    } else if (isMissingFront) {
      // 2. MẤT BÁNH TRƯỚC (Có bánh sau hoặc Ego nhìn từ sau):
      // Ước lượng đầu xe từ người lái: lxRider + 0.42 * curL
      const estFrontEdge = lxRider + 0.42 * curL;
      if (hasEgo && !isSideBeamParallel && egoLocalX < 0) {
        // Ego phía sau xe: Mép sau đón tia thật lxMin là chuẩn nhất
        shiftLx = (lxMin - 0.02) + curL / 2;
        bumperLabel = "Cản sau (Mất bánh trước)";
      } else {
        // Ego phía trước hoặc ngang hông: Vì bánh trước bị mất, căn theo mép sau thật kết hợp đầu xe ước lượng
        shiftLx = (lxMin + estFrontEdge) / 2;
        bumperLabel = "Người lái 42% + Bánh sau (Mất bánh trước)";
      }
    } else if (isMissingRear) {
      // 3. MẤT BÁNH SAU (Có bánh trước hoặc Ego nhìn từ trước):
      // Ước lượng đuôi xe từ người lái: lxRider - 0.58 * curL
      const estRearEdge = lxRider - 0.58 * curL;
      if (hasEgo && !isSideBeamParallel && egoLocalX > 0) {
        // Ego phía trước xe: Mép trước đón tia thật lxMax là chuẩn nhất
        shiftLx = (lxMax + 0.02) - curL / 2;
        bumperLabel = "Cản trước (Mất bánh sau)";
      } else {
        // Ego phía sau hoặc ngang hông: Vì bánh sau bị mất, căn theo mép trước thật kết hợp đuôi xe ước lượng
        shiftLx = (estRearEdge + lxMax) / 2;
        bumperLabel = "Người lái 42% + Bánh trước (Mất bánh sau)";
      }
    } else {
      // 4. ĐỦ CẢ 2 BÁNH (Hoặc không có điểm người lái để đối chiếu):
      if (hasEgo) {
        if (isSideBeamParallel) {
          // VÙNG 1: CHIẾU NGANG SƯỜN SONG SONG -> DÀN ĐỀU 2 ĐẦU BÁNH XE
          shiftLx = (lxMin + lxMax) / 2;
          bumperLabel = "Chiếu ngang sườn (Dàn đều 2 bánh)";
        } else if (egoLocalX < 0) {
          // VÙNG 2: LỆCH GÓC > 25° VÀ BOX Ở TRƯỚC EGO -> ƯU TIÊN BẮT CẢN/BÁNH SAU
          shiftLx = (lxMin - 0.03) + curL / 2;
          bumperLabel = "Cản/Bánh sau đón tia";
        } else {
          // VÙNG 3: LỆCH GÓC > 25° VÀ BOX Ở SAU EGO -> ƯU TIÊN BẮT CẢN/BÁNH TRƯỚC
          shiftLx = (lxMax + 0.03) - curL / 2;
          bumperLabel = "Cản/Bánh trước đón tia";
        }
      } else {
        const frontCount = bodyPts.filter((p) => p.lx > 0).length;
        const rearCount = bodyPts.filter((p) => p.lx <= 0).length;
        if (frontCount > rearCount * 1.5) {
          shiftLx = (lxMax + 0.03) - curL / 2;
          bumperLabel = "Cản trước";
        } else if (rearCount > frontCount * 1.5) {
          shiftLx = (lxMin - 0.03) + curL / 2;
          bumperLabel = "Cản sau";
        } else {
          shiftLx = (lxMin + lxMax) / 2;
          bumperLabel = "Cân đối";
        }
      }
    }

    // Giới hạn dịch chuyển an toàn theo trục dọc X (±60cm)
    shiftLx = Math.max(-0.60, Math.min(0.60, shiftLx));
    if (Math.abs(shiftLx) < 0.005) shiftLx = 0;

    // TUYỆT ĐỐI KHÔNG GHIM ĐẤT: Giữ nguyên cao độ Z ban đầu của xe 2 bánh (đã có nút ghim đất riêng)
    newCenterZ = cz;

    // Dịch chuyển tâm theo hướng Yaw hiện tại (shiftLy = 0, giữ nguyên Y)
    newCenterX = Number((cx + shiftLx * Math.cos(yaw)).toFixed(3));
    newCenterY = Number((cy + shiftLx * Math.sin(yaw)).toFixed(3));

    const deltaXSign = shiftLx >= 0 ? "+" : "";
    msg = `Đã căn SIDE Xe 2 bánh: [${bumperLabel}] bám vệt lốp (ΔX: ${deltaXSign}${(shiftLx * 100).toFixed(1)}cm, giữ nguyên cao độ Z), Khóa L: ${newL}m`;
  } else if (step === "front") {
    // -------------------------------------------------------------
    // CHẾ ĐỘ 3: CĂN FRONT ĐỘC LẬP (LÀM CHUẨN THEO CAR THEO YÊU CẦU NGƯỜI DÙNG)
    // - Mặt phẳng 2D Y - Z theo phương W: Căn sườn xe đón tia
    // - 🚨 TUYỆT ĐỐI KHÔNG GHIM ĐẤT: Giữ nguyên 100% cao độ Z (newCenterZ = cz)
    // - Trục dọc X giữ nguyên cố định 100% (shiftLx = 0)
    // - BẢO TOÀN TUYỆT ĐỐI 100% KÍCH THƯỚC L, W, H (Không co giãn size ở nút Front)
    // -------------------------------------------------------------
    newYawRad = yaw;
    newYawDeg = radToDeg(yaw);
    deltaYawDeg = 0;
    newL = curL; // BẢO TOÀN 100% CHIỀU DÀI L
    newW = curW; // BẢO TOÀN 100% CHIỀU RỘNG W
    newH = curH; // BẢO TOÀN 100% CHIỀU CAO H
    newCenterZ = cz; // BẢO TOÀN 100% CAO ĐỘ Z (KHÔNG GHIM ĐẤT NHƯ CAR)

    // Xác định sườn đón tia (Trái hoặc Phải)
    let visibleSide: "left" | "right" | "center" = "center";
    const edgePadding = 0.03; // 3.0cm đệm bảo vệ gương xe và tay lái
    shiftLy = 0;

    if (options.egoPos) {
      const toEgoX = options.egoPos.x - cx;
      const toEgoY = options.egoPos.y - cy;
      const egoLocalX = toEgoX * Math.cos(yaw) + toEgoY * Math.sin(yaw);
      const egoLocalY = -toEgoX * Math.sin(yaw) + toEgoY * Math.cos(yaw);

      // Nếu Ego nhìn thẳng chính diện đầu/đuôi xe (|egoLocalY| <= |egoLocalX| * 0.15 && |egoLocalY| < 0.15)
      if (Math.abs(egoLocalY) <= Math.abs(egoLocalX) * 0.15 && Math.abs(egoLocalY) < 0.15) {
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
      const leftCount = bodyPts.filter((p) => p.ly > 0.05).length;
      const rightCount = bodyPts.filter((p) => p.ly < -0.05).length;
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
    const sideText = visibleSide === "left" ? "Sườn Trái" : visibleSide === "right" ? "Sườn Phải" : "Cân đối 2 sườn";
    msg = `Đã căn FRONT Xe 2 bánh: [${sideText}] đón tia ăn khít phương W (ΔY: ${deltaYSign}${(shiftLy * 100).toFixed(1)}cm), giữ nguyên cao độ Z và kích thước (chuẩn Car)`;
  } else if (step === "w") {
    // -------------------------------------------------------------
    // CHẾ ĐỘ FIT RIÊNG CHIỀU RỘNG W: Bắt gương xe, tay lái (+5cm đệm gương)
    // - Cho phép sai số nhiễu cao hơn để bắt trọn gương chiếu hậu
    // - Đệm thêm padding 5cm mỗi bên để viền không cọ gương xe
    // - Giữ nguyên 100% Chiều dài L, Chiều cao H và Cao độ Z
    // -------------------------------------------------------------
    newYawRad = yaw;
    newYawDeg = radToDeg(yaw);
    deltaYawDeg = 0;
    newL = curL;
    newH = curH;
    newCenterZ = cz;

    shiftLy = 0;
    let measuredW = curW;

    if (lyMin <= -0.06 && lyMax >= 0.06) {
      // Điểm LiDAR bao quát cả 2 bên: Đệm nhẹ +6cm (+3cm mỗi bên cho tay lái/gương)
      measuredW = (lyMax - lyMin) + 0.06;
      shiftLy = (lyMin + lyMax) / 2;
      shiftLy = Math.max(-0.35, Math.min(0.35, shiftLy));
    } else if (lyMax > 0 && lyMin > -0.06) {
      // Điểm LiDAR chỉ ở SƯỜN TRÁI -> Mở rộng đối xứng qua trục dọc bánh xe +5cm đệm gương
      measuredW = 2 * (lyMax + 0.05);
      shiftLy = 0;
    } else if (lyMin < 0 && lyMax < 0.06) {
      // Điểm LiDAR chỉ ở SƯỜN PHẢI -> Mở rộng đối xứng qua trục dọc bánh xe +5cm đệm gương
      measuredW = 2 * (Math.abs(lyMin) + 0.05);
      shiftLy = 0;
    } else {
      measuredW = (lyMax - lyMin) + 0.06;
      shiftLy = (lyMin + lyMax) / 2;
      shiftLy = Math.max(-0.35, Math.min(0.35, shiftLy));
    }

    // Nhận diện Xe chở hàng / Thùng shipper / Giá chở hàng 2 bên sườn
    const hasSideLuggage = bodyPts.filter((p) => p.z >= groundZ + 0.35 && Math.abs(p.ly) > 0.35).length >= 3;
    const maxCapW = hasSideLuggage ? 0.90 : 0.85;

    // Kháng Ghosting: Giới hạn trần an toàn W theo chuẩn Tool_QC (tối đa 0.90m nếu chở hàng, 0.85m nếu xe thường)
    if (measuredW > maxCapW) {
      newW = maxCapW;
      if (options.egoPos) {
        const toEgoX = options.egoPos.x - cx;
        const toEgoY = options.egoPos.y - cy;
        const egoLocalY = -toEgoX * Math.sin(yaw) + toEgoY * Math.cos(yaw);
        if (egoLocalY > 0.05) {
          shiftLy = (lyMax + 0.03) - newW / 2;
        } else if (egoLocalY < -0.05) {
          shiftLy = (lyMin - 0.03) + newW / 2;
        }
      }
    } else {
      // Cận dưới chuẩn Tool_QC: W >= 0.60m
      newW = Number(Math.max(0.60, Math.min(maxCapW, measuredW)).toFixed(2));
    }
    shiftLy = Math.max(-0.35, Math.min(0.35, shiftLy));

    newCenterX = Number((cx - shiftLy * Math.sin(yaw)).toFixed(3));
    newCenterY = Number((cy + shiftLy * Math.cos(yaw)).toFixed(3));

    const deltaYSign = shiftLy >= 0 ? "+" : "";
    const cargoTag = hasSideLuggage ? " [📦 Giá chở hàng]" : "";
    msg = `Đã fit Rộng (W) Xe 2 bánh${cargoTag}: W=${newW}m (Đệm vừa khít tay lái/gương/thùng hàng, chuẩn Tool_QC), căn Y: ${deltaYSign}${(shiftLy * 100).toFixed(1)}cm, giữ nguyên L, H & Z`;
  } else if (step === "h") {
    // -------------------------------------------------------------
    // CHẾ ĐỘ FIT RIÊNG CHIỀU CAO H: Bám sàn cố định Z_base, nở lên nóc xe gọn gàng
    // - Mặt đáy tiếp đất Z_base giữ nguyên cố định 100%
    // - Bắt trọn đỉnh nón bảo hiểm / đầu người lái / thùng hàng + 5cm đệm nóc
    // - Kẹp chuẩn Tool_QC: H in [1.50m, 1.80m] (nếu xe đỗ không người H in [1.00m, 1.40m])
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

    const roofTopZ = highestPtZ + headBuffer;
    const isParkedNoRider = Boolean(options.attributes?.parked || options.attributes?.rider === false);
    const maxCap2WH = 1.80; // Trần max Tool_QC cho Two-wheel
    const minCap2WH = isParkedNoRider ? 1.00 : 1.50; // Sàn min Tool_QC cho Two-wheel
    newH = Number(Math.max(minCap2WH, Math.min(maxCap2WH, roofTopZ - effectiveBaseZ)).toFixed(2));
    newCenterZ = Number((effectiveBaseZ + newH / 2).toFixed(3));

    const parkedTag = isParkedNoRider ? " [🅿️ Xe đỗ không người]" : "";
    msg = `Đã fit Cao (H) Xe 2 bánh${parkedTag}: H=${newH}m (Đáy bám sàn Z=${effectiveBaseZ.toFixed(2)}m cố định, chuẩn Tool_QC), giữ nguyên L, W & XY`;
  } else {
    // -------------------------------------------------------------
    // CHẾ ĐỘ 4: CHU TRÌNH TOÀN DIỆN (TOP ➔ SIDE ➔ FRONT)
    // -------------------------------------------------------------
    // 1. TOP: Xoay Yaw theo trục thân xe
    const headingRes = estimateTwoWheelerHeading(bodyPts, yaw);
    newYawRad = headingRes.newYawRad;
    newYawDeg = headingRes.newYawDeg;
    deltaYawDeg = headingRes.deltaYawDeg;

    // 2. SIDE: Căn cản đón tia X & Ghim đất, Khóa L theo chuẩn Tool_QC
    const hasCargo = (bodyPts.filter((p) => p.z >= groundZ + 0.45 && p.lx < -0.25).length >= 3) || Boolean(options.attributes?.cargo || options.attributes?.delivery_box);
    const maxCapL = hasCargo ? 2.00 : 1.95;
    newL = Number(Math.max(1.50, Math.min(maxCapL, curL)).toFixed(2));

    shiftLx = 0;
    const frontCount = bodyPts.filter((p) => p.lx > 0).length;
    const rearCount = bodyPts.filter((p) => p.lx <= 0).length;
    if (frontCount > rearCount * 1.5) {
      shiftLx = lxMax - newL / 2;
    } else if (rearCount > frontCount * 1.5) {
      shiftLx = lxMin + newL / 2;
    } else {
      shiftLx = (lxMin + lxMax) / 2;
    }
    shiftLx = Math.max(-0.45, Math.min(0.45, shiftLx));

    // 3. FRONT: Căn ngang Y, linh động W và H kẹp chuẩn Tool_QC
    shiftLy = 0;
    let measuredW = curW;

    if (lyMin <= -0.06 && lyMax >= 0.06) {
      measuredW = lyMax - lyMin + 0.06;
      shiftLy = (lyMin + lyMax) / 2;
      shiftLy = Math.max(-0.35, Math.min(0.35, shiftLy));
    } else if (lyMax > 0 && lyMin > -0.06) {
      measuredW = 2 * (lyMax + 0.05);
      shiftLy = 0;
    } else if (lyMin < 0 && lyMax < 0.06) {
      measuredW = 2 * (Math.abs(lyMin) + 0.05);
      shiftLy = 0;
    } else {
      measuredW = lyMax - lyMin + 0.06;
      shiftLy = (lyMin + lyMax) / 2;
      shiftLy = Math.max(-0.35, Math.min(0.35, shiftLy));
    }

    const hasSideLuggage = bodyPts.filter((p) => p.z >= groundZ + 0.35 && Math.abs(p.ly) > 0.35).length >= 3;
    const maxCapW = hasSideLuggage ? 0.90 : 0.85;
    newW = Number(Math.max(0.60, Math.min(maxCapW, measuredW)).toFixed(2));

    roofTopZ = highestPtZ + headBuffer;
    const isParkedNoRider = Boolean(options.attributes?.parked || options.attributes?.rider === false);
    const maxCap2WH = 1.80;
    const minCap2WH = isParkedNoRider ? 1.00 : 1.50;
    newH = Number(Math.max(minCap2WH, Math.min(maxCap2WH, roofTopZ - groundZ)).toFixed(2));
    newCenterZ = Number((groundZ + newH / 2).toFixed(3));

    // Tọa độ thế giới kết hợp (xoay theo newYawRad)
    const cosWorld = Math.cos(newYawRad);
    const sinWorld = Math.sin(newYawRad);
    newCenterX = Number((cx + shiftLx * cosWorld - shiftLy * sinWorld).toFixed(3));
    newCenterY = Number((cy + shiftLx * sinWorld + shiftLy * cosWorld).toFixed(3));

    const cargoMsg = hasCargo ? " [📦 Chở hàng]" : isParkedNoRider ? " [🅿️ Xe đỗ]" : "";
    msg = `Đã fit toàn diện Xe 2 bánh${cargoMsg}: ${newL}x${newW}x${newH}m (Chuẩn Tool_QC, Khóa L, Xoay Yaw ${newYawDeg}°, Ghim Z: ${newCenterZ}m, Dốc địa hình: ${groundPitchDeg}°/${groundRollDeg}°)`;
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
    hasCargo: (bodyPts.filter((p) => p.z >= groundZ + 0.45 && p.lx < -0.25).length >= 3) || Boolean(options.attributes?.cargo),
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
      hasParallelVehicleSeparation: aodeRes.hasParallelVehicleSeparation,
    },
  };
}

/**
 * Fit riêng chiều rộng W cho xe 2 bánh (+5cm đệm bắt trọn gương/tay lái, bảo toàn L & H).
 */
export function fitTwoWheelerWidth(
  pts: Array<{ x: number; y: number; z: number }>,
  cx: number,
  cy: number,
  cz: number,
  yaw: number,
  curL: number = 1.75,
  curW: number = 0.65,
  curH: number = 1.55,
  options: { egoPos?: { x: number; y: number; z?: number } } = {}
): TwoWheelerFitResult {
  return fitTwoWheelerBox(pts, cx, cy, cz, yaw, curL, curW, curH, options, "w");
}

/**
 * Fit riêng chiều cao H cho xe 2 bánh (mặt đáy tiếp đất giữ nguyên cố định, nở lên nóc).
 */
export function fitTwoWheelerHeight(
  pts: Array<{ x: number; y: number; z: number }>,
  cx: number,
  cy: number,
  cz: number,
  yaw: number,
  curL: number = 1.75,
  curW: number = 0.65,
  curH: number = 1.55,
  options: { headBuffer?: number } = {}
): TwoWheelerFitResult {
  return fitTwoWheelerBox(pts, cx, cy, cz, yaw, curL, curW, curH, options, "h");
}

/**
 * Thuật toán CHUYÊN BIỆT CHO XE ĐẠP / XE MÁY (CYCLIST / BICYCLE):
 * Giữ nguyên hàm gốc để đảm bảo tương thích 100%, gọi trực tiếp fitTwoWheelerBox.
 */
export function fitCyclistBox(
  pts: Array<{ x: number; y: number; z: number }>,
  cx: number,
  cy: number,
  cz: number,
  yaw: number,
  curL: number = 1.75,
  curW: number = 0.65,
  curH: number = 1.55,
  options: {
    headBuffer?: number;
    margin?: number;
    egoPos?: { x: number; y: number; z?: number };
  } = {},
  step: "all" | "top" | "side" | "front" = "all"
): TwoWheelerFitResult {
  const mergedOptions = { headBuffer: options.headBuffer ?? 0.10, ...options };
  return fitTwoWheelerBox(pts, cx, cy, cz, yaw, curL, curW, curH, mergedOptions, step);
}
