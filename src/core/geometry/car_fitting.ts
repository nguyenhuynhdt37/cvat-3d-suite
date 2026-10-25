/**
 * Module fit xe hơi, cản trước/sau và sườn xe (Car Bounding Box & Boundary Snapping).
 */

import {
  filterDenseConnectedCluster1D,
  clusterByPointDilation5x,
  computeIntensityWeights,
  filterSparseNoiseByLocalDensity,
  detectRoofTopBounds,
  computeDensityRobustBounds,
} from "./clustering.ts";
import {
  computeAnnularRingGroundZ,
  computeGroundSlopesAndZ,
} from "./ground_curb.ts";

export { detectRoofTopBounds };

/**
 * Thuật toán Principal Component Analysis (PCA 2D):
 * Ước lượng hướng trục dài của thân xe (Vehicle Long Axis / Heading Yaw) từ cụm điểm LiDAR 2D.
 * @param pts Danh sách tọa độ (x, y) của các điểm thuộc cụm thân xe
 */
export function estimateYawFromPoints(pts: Array<{ x: number; y: number }>): {
  yawRad: number;
  yawDeg: number;
  confidence: number;
} {
  if (pts.length < 8) {
    return { yawRad: 0, yawDeg: 0, confidence: 0 };
  }

  // 1. Tính trọng tâm trung bình (Mean Center)
  let sumX = 0;
  let sumY = 0;
  for (const p of pts) {
    sumX += p.x;
    sumY += p.y;
  }
  const meanX = sumX / pts.length;
  const meanY = sumY / pts.length;

  // 2. Tính Ma trận hiệp phương sai (Covariance Matrix)
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of pts) {
    const dx = p.x - meanX;
    const dy = p.y - meanY;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  sxx /= pts.length;
  syy /= pts.length;
  sxy /= pts.length;

  // 3. Eigenvector tương ứng với Eigenvalue lớn nhất
  // tan(2 * theta) = 2 * sxy / (sxx - syy)
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);

  // 4. Đánh giá độ tin cậy dựa trên độ dài trục chính so với trục phụ
  const diff = sxx - syy;
  const trace = sxx + syy;
  const disc = Math.sqrt(diff * diff + 4 * sxy * sxy);
  const lambda1 = (trace + disc) / 2;
  const lambda2 = Math.max(1e-5, (trace - disc) / 2);
  const ratio = lambda1 / lambda2; // Tỉ số dài/rộng (Xe hơi thường > 2.0)
  const confidence = Math.min(100, Math.max(10, Math.round((1 - 1 / Math.max(1, ratio)) * 100)));

  return {
    yawRad: Number(angle.toFixed(5)),
    yawDeg: Math.round((angle * 180) / Math.PI),
    confidence,
  };
}

/**
 * Thuật toán Lan Truyền Mây Điểm 3D (Spatial BFS Region Growing):
 * Khi Annotator chỉ đặt Box ở 1 góc xe bất kỳ:
 * - Lấy tất cả các điểm nằm trong hoặc gần Seed Box làm Hạt Giống (Seeds).
 * - Tự động lan truyền liên thông 3D (Flood Fill) ra không gian xung quanh với bước nhảy rNeighbor (0.42m).
 * - Giới hạn Z trên mặt đất [groundZ + 0.05, groundZ + 3.0] và bán kính cụm <= 6.5m.
 * - Loại bỏ hoàn toàn mặt đất và ngăn chặn lan sang xe khác đỗ bên cạnh (do khe hở giữa 2 xe >= 0.5m).
 * @returns Danh sách toàn bộ các điểm thuộc về chiếc xe đó.
 */
export function growCarClusterFromSeeds(
  pts: Array<{ x: number; y: number; z: number }>,
  cx: number,
  cy: number,
  _cz: number,
  yaw: number,
  L: number,
  W: number,
  _H: number,
  groundZ: number,
  options: {
    maxSearchRadius?: number;
    neighborRadius2D?: number;
    neighborRadiusZ?: number;
  } = {}
): Array<{ x: number; y: number; z: number }> {
  const maxSearchRadius = options.maxSearchRadius ?? 6.5;
  const neighborRadius2D = options.neighborRadius2D ?? 0.42;
  const neighborRadiusZ = options.neighborRadiusZ ?? 0.45;
  const minZ = groundZ + 0.05;
  const maxZ = groundZ + 3.0;

  // 1. Lọc thô các điểm ứng viên trong phạm vi quanh box ban đầu
  const candidatePts: Array<{ x: number; y: number; z: number }> = [];

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p.z < minZ || p.z > maxZ) continue;
    const distToCenter = Math.hypot(p.x - cx, p.y - cy);
    if (distToCenter <= maxSearchRadius) {
      candidatePts.push(p);
    }
  }

  if (candidatePts.length < 4) {
    return candidatePts;
  }

  // 2. Tìm các điểm hạt giống (Seeds) nằm trong hoặc sát Seed Box ban đầu
  const cosY = Math.cos(-yaw);
  const sinY = Math.sin(-yaw);
  const seedBoxExpandL = L / 2 + 0.6;
  const seedBoxExpandW = W / 2 + 0.6;

  const seedLocalIndices: number[] = [];
  for (let i = 0; i < candidatePts.length; i++) {
    const p = candidatePts[i];
    const dx = p.x - cx;
    const dy = p.y - cy;
    const lx = dx * cosY - dy * sinY;
    const ly = dx * sinY + dy * cosY;
    if (Math.abs(lx) <= seedBoxExpandL && Math.abs(ly) <= seedBoxExpandW) {
      seedLocalIndices.push(i);
    }
  }

  // Nếu không tìm thấy hạt giống trong box theo góc yaw, dùng bán kính tròn gần tâm box
  if (seedLocalIndices.length < 4) {
    const seedDist = Math.max(1.5, Math.min(L, W) * 0.7);
    for (let i = 0; i < candidatePts.length; i++) {
      const p = candidatePts[i];
      if (Math.hypot(p.x - cx, p.y - cy) <= seedDist) {
        seedLocalIndices.push(i);
      }
    }
  }

  if (seedLocalIndices.length < 4) {
    return candidatePts;
  }

  // 3. Lan truyền không gian 3D (BFS Region Growing)
  const n = candidatePts.length;
  const visited = new Uint8Array(n);
  const queue: number[] = [];

  for (const sIdx of seedLocalIndices) {
    visited[sIdx] = 1;
    queue.push(sIdx);
  }

  const cluster: Array<{ x: number; y: number; z: number }> = [];

  while (queue.length > 0) {
    const currIdx = queue.shift()!;
    const cp = candidatePts[currIdx];
    cluster.push(cp);

    for (let j = 0; j < n; j++) {
      if (visited[j]) continue;
      const np = candidatePts[j];
      const dist2D = Math.hypot(np.x - cp.x, np.y - cp.y);
      if (dist2D <= neighborRadius2D && Math.abs(np.z - cp.z) <= neighborRadiusZ) {
        visited[j] = 1;
        queue.push(j);
      }
    }
  }

  return cluster.length >= 4 ? cluster : candidatePts;
}

/**
 * Thuật toán Nhận Diện Chiều Dài Của Xe & Bẻ Góc Yaw Chuẩn Xác (Search-based L-Shape Fitting):
 * Tự động phân tích hình thái 2D của đám mây điểm xe để xác định:
 * - Trục nào là CHIỀU DÀI XE (L) và trục nào là CHIỀU RỘNG XE (W).
 * - Góc xoay chuẩn xác của chiều dài xe (Vehicle Long Axis Heading Yaw).
 * - Bẻ góc Yaw sao cho trục L của Box chạy dọc đúng chiều dài xe.
 */
export function detectVehicleLongAxisAndYaw(
  clusterPts: Array<{ x: number; y: number; z: number }>,
  annotatorYaw: number
): {
  vehicleYawRad: number;
  vehicleYawDeg: number;
  spanL: number;
  spanW: number;
  deltaYawDeg: number;
} {
  if (clusterPts.length < 4) {
    return {
      vehicleYawRad: annotatorYaw,
      vehicleYawDeg: Number(((annotatorYaw * 180) / Math.PI).toFixed(2)),
      spanL: 4.6,
      spanW: 1.8,
      deltaYawDeg: 0,
    };
  }

  // 1. Khảo sát góc xoay theta từ 0 deg đến 90 deg với bước nhảy 0.5 deg (Search-based L-shape Fitting)
  let bestTheta = 0;
  let minCost = Infinity;

  const xyPts: Array<{ x: number; y: number }> = clusterPts.map((p) => ({ x: p.x, y: p.y }));
  const m = xyPts.length;

  for (let deg = 0; deg < 90; deg += 0.5) {
    const theta = (deg * Math.PI) / 180;
    const cosA = Math.cos(theta);
    const sinA = Math.sin(theta);

    let uMin = Infinity;
    let uMax = -Infinity;
    let vMin = Infinity;
    let vMax = -Infinity;
    const uArr: number[] = new Array(m);
    const vArr: number[] = new Array(m);

    for (let i = 0; i < m; i++) {
      const p = xyPts[i];
      const u = p.x * cosA + p.y * sinA;
      const v = -p.x * sinA + p.y * cosA;
      uArr[i] = u;
      vArr[i] = v;
      if (u < uMin) uMin = u;
      if (u > uMax) uMax = u;
      if (v < vMin) vMin = v;
      if (v > vMax) vMax = v;
    }

    // Tiêu chí Closeness Criterion (Zhang et al.):
    // Tổng khoảng cách từ mỗi điểm tới mép gần nhất trong 2 cạnh đón tia
    let sumDist = 0;
    for (let i = 0; i < m; i++) {
      const du = Math.min(Math.abs(uArr[i] - uMin), Math.abs(uArr[i] - uMax));
      const dv = Math.min(Math.abs(vArr[i] - vMin), Math.abs(vArr[i] - vMax));
      sumDist += Math.min(du, dv);
    }

    if (sumDist < minCost) {
      minCost = sumDist;
      bestTheta = theta;
    }
  }

  // 2. Xác định trục nào là chiều dài xe (Longitudinal Axis vs Lateral Axis)
  const cosB = Math.cos(bestTheta);
  const sinB = Math.sin(bestTheta);
  let uMin = Infinity;
  let uMax = -Infinity;
  let vMin = Infinity;
  let vMax = -Infinity;

  for (let i = 0; i < m; i++) {
    const p = xyPts[i];
    const u = p.x * cosB + p.y * sinB;
    const v = -p.x * sinB + p.y * cosB;
    if (u < uMin) uMin = u;
    if (u > uMax) uMax = u;
    if (v < vMin) vMin = v;
    if (v > vMax) vMax = v;
  }

  const spanU = uMax - uMin;
  const spanV = vMax - vMin;

  let vehicleYaw = bestTheta;
  let spanL = spanU;
  let spanW = spanV;

  if (spanU < spanV) {
    // Trục V có độ dài lớn hơn => Trục V là Chiều Dài xe, xoay vuông góc 90°
    vehicleYaw = bestTheta + Math.PI / 2;
    spanL = spanV;
    spanW = spanU;
  }

  // 3. Chọn chiều đầu xe sao cho góc xoay so với góc ban đầu của Annotator là nhỏ nhất (|ΔYaw| <= 90°)
  while (vehicleYaw - annotatorYaw > Math.PI / 2) vehicleYaw -= Math.PI;
  while (vehicleYaw - annotatorYaw < -Math.PI / 2) vehicleYaw += Math.PI;

  // Chuẩn hóa góc vào khoảng [-PI, PI]
  while (vehicleYaw > Math.PI) vehicleYaw -= 2 * Math.PI;
  while (vehicleYaw < -Math.PI) vehicleYaw += 2 * Math.PI;

  const vehicleYawDeg = Number(((vehicleYaw * 180) / Math.PI).toFixed(2));
  let deltaYawDeg = Number((((vehicleYaw - annotatorYaw) * 180) / Math.PI).toFixed(2));
  if (Math.abs(deltaYawDeg) < 0.08) {
    deltaYawDeg = 0;
    vehicleYaw = annotatorYaw;
  }

  return {
    vehicleYawRad: Number(vehicleYaw.toFixed(5)),
    vehicleYawDeg,
    spanL: Number(spanL.toFixed(3)),
    spanW: Number(spanW.toFixed(3)),
    deltaYawDeg,
  };
}

/**
 * Tính điểm chất lượng mốc (Anchor Quality Score) để tìm ra Frame mốc đẹp nhất của xe trong Track.
 * Frame có Score cao nhất sẽ là mốc chuẩn xác nhất để lấy kích thước xe.
 */
export function computeAnchorFrameScore(
  pointsCount: number,
  measuredL: number,
  measuredW: number,
  measuredH: number
): number {
  if (pointsCount < 20) return 0;

  // Điểm số điểm LiDAR (càng dày càng tốt, tối đa 2000 điểm)
  const countScore = Math.min(pointsCount, 2000) / 20; // 0 - 100 điểm

  // Kiểm tra tỉ số kích thước có giống xe thật không
  let shapeScore = 50;
  if (measuredL >= 3.5 && measuredL <= 6.0 && measuredW >= 1.5 && measuredW <= 2.4) {
    shapeScore += 30;
  }
  if (measuredH >= 1.2 && measuredH <= 2.2) {
    shapeScore += 20;
  }

  return Math.round(countScore + shapeScore);
}

/**
 * Đánh giá chất lượng Frame Mốc Vàng (Golden Anchor Evaluation):
 * - Chạy ghim sàn (Footprint Ground Snap) để xác định chính xác cao độ mặt sàn zGround dưới đáy xe.
 * - Dò nóc xe thật zRoof (gạt bỏ 100% cành cây/dây điện) bằng detectRoofTopBounds.
 * - Chiều cao xe được tính chuẩn xác TỪ ĐÁY LÊN ĐẦU: H = zRoof - zGround.
 * - Chiều dài L và rộng W dàn đều theo cụm điểm đối xứng qua tâm.
 * - Chấm điểm chất lượng CQS (Composite Quality Score).
 */
export function evaluateGoldenAnchorFrame(
  pts: Array<{ x: number; y: number; z: number }>,
  cx: number,
  cy: number,
  cz: number,
  yaw: number,
  currentL: number,
  currentW: number,
  currentH: number,
  groundZInput?: number | null,
  egoPos: { x: number; y: number } = { x: 0, y: 0 }
): {
  score: number;
  optimalL: number;
  optimalW: number;
  optimalH: number;
  pointsCount: number;
  groundZ: number;
  roofTopZ: number;
} {
  const cosY = Math.cos(-yaw);
  const sinY = Math.sin(-yaw);

  // 1. Xác định mặt đất ghim sàn
  let groundZ = groundZInput ?? null;
  if (groundZ === null || groundZ === undefined) {
    const groundRes = computeAnnularRingGroundZ(pts, cx, cy, yaw, currentL / 2, currentW / 2);
    groundZ = groundRes.groundZ !== null ? groundRes.groundZ : cz - currentH / 2;
  }

  // 2. Thu thập điểm thân xe (trên mặt đất +22cm loại bỏ hoàn toàn nhiễu quét loang mặt đất/gờ vỉa hè)
  const minBodyZ = groundZ + 0.22;
  const maxBodyZ = groundZ + Math.max(currentH, 1.8) + 0.6;
  const outerL = currentL / 2 + 0.5;
  const outerW = currentW / 2 + 0.4;

  const bodyPts: Array<{ lx: number; ly: number; z: number }> = [];
  for (const p of pts) {
    if (p.z < minBodyZ || p.z > maxBodyZ) continue;
    const dx = p.x - cx;
    const dy = p.y - cy;
    const lx = dx * cosY - dy * sinY;
    const ly = dx * sinY + dy * cosY;
    if (Math.abs(lx) <= outerL && Math.abs(ly) <= outerW) {
      bodyPts.push({ lx, ly, z: p.z });
    }
  }

  const pointsCount = bodyPts.length;
  if (pointsCount < 8) {
    return {
      score: 0,
      optimalL: currentL,
      optimalW: currentW,
      optimalH: currentH,
      pointsCount,
      groundZ,
      roofTopZ: groundZ + currentH,
    };
  }

  // 3. Dò cao độ nóc xe thật và tính chiều cao TỪ ĐÁY LÊN ĐẦU
  const roofTopZ = detectRoofTopBounds(bodyPts, groundZ + currentH);
  let measuredH = Number((roofTopZ - groundZ).toFixed(2));
  // Giới hạn an toàn hình học xe thực tế
  if (measuredH < 1.1) measuredH = Math.max(measuredH, currentH);
  if (measuredH > 2.6) measuredH = Math.min(measuredH, currentH);

  // 4. Đo dải trải dài L và W từ cụm điểm
  const lxVals = bodyPts.map((p) => p.lx).sort((a, b) => a - b);
  const lyVals = bodyPts.map((p) => p.ly).sort((a, b) => a - b);
  const spreadL = lxVals[lxVals.length - 1] - lxVals[0];
  const spreadW = lyVals[lyVals.length - 1] - lyVals[0];

  let optimalL = currentL;
  let optimalW = currentW;
  if (spreadL >= 3.0 && spreadL <= 6.5) {
    optimalL = Number((spreadL + 0.15).toFixed(2));
  }
  if (spreadW >= 1.4 && spreadW <= 2.4) {
    optimalW = Number((spreadW + 0.10).toFixed(2));
  }

  // 5. Chấm điểm chất lượng mốc CQS (0 - 200 điểm)
  // Mật độ điểm (tối đa 100 điểm)
  const densityScore = Math.min(pointsCount, 500) / 5; // 0 - 100
  // Độ đầy đủ 3 chiều (0 - 50 điểm)
  let completenessScore = 0;
  if (spreadL >= 2.8) completenessScore += 25;
  if (spreadW >= 1.3) completenessScore += 25;
  // Khoảng cách tới Ego (gần hơn = ít sai số tia hơn, 0 - 30 điểm)
  const distEgo = Math.hypot(cx - egoPos.x, cy - egoPos.y);
  const proximityScore = Math.max(0, 30 - distEgo * 0.5);
  // Độ hợp lý chiều cao (0 - 20 điểm)
  const heightScore = (measuredH >= 1.3 && measuredH <= 2.1) ? 20 : 5;

  const totalScore = Math.round(densityScore + completenessScore + proximityScore + heightScore);

  return {
    score: totalScore,
    optimalL,
    optimalW,
    optimalH: measuredH,
    pointsCount,
    groundZ,
    roofTopZ,
  };
}

/**
 * Thuật toán Dò Bức Tường Thành Vỏ Xe (Lateral Wall Peak Detection) có kèm trạng thái tìm thấy:
 * Dò đỉnh xung mật độ đứng của thành xe trên trục ly (Front View),
 * loại bỏ hoàn toàn gương chiếu hậu (chỉ 1-2 điểm hẹp) và vật thể khác bên cạnh.
 */
export function detectLateralWallBoundsWithStatus(
  pts: Array<{ lx: number; ly: number; z: number }>,
  halfW: number,
  visibleLateral: "left" | "right",
  binSize: number = 0.025
): { edge: number; found: boolean; peakCount: number } {
  const isLeft = visibleLateral === "left";
  const sidePts = pts.filter((p) => (isLeft ? p.ly > 0 : p.ly < 0));
  if (sidePts.length < 4) {
    return { edge: isLeft ? halfW : -halfW, found: false, peakCount: 0 };
  }

  // Phạm vi danh định quanh thành xe: [halfW - 0.35, halfW + 0.35] đồng bộ hoàn hảo với outerW
  const minRange = Math.max(0.1, halfW - 0.35);
  const maxRange = halfW + 0.35;

  const numBins = Math.ceil(maxRange / binSize) + 1;
  const bins = new Array(numBins).fill(0);
  const binMaxLy = new Array(numBins).fill(-Infinity);
  const binMinLy = new Array(numBins).fill(Infinity);

  for (const p of sidePts) {
    const absLy = Math.abs(p.ly);
    if (absLy <= maxRange) {
      const idx = Math.min(numBins - 1, Math.floor(absLy / binSize));
      bins[idx]++;
      if (p.ly > binMaxLy[idx]) binMaxLy[idx] = p.ly;
      if (p.ly < binMinLy[idx]) binMinLy[idx] = p.ly;
    }
  }

  const startBin = Math.floor(minRange / binSize);
  const endBin = Math.min(numBins - 1, Math.floor(maxRange / binSize));

  let peakCount = 0;
  let peakIdx = startBin;
  for (let i = startBin; i <= endBin; i++) {
    // Ưu tiên thành xe ở bề mặt ngoài cùng khi các bin có mật độ tương đương nhau
    if (bins[i] >= peakCount && bins[i] > 0) {
      peakCount = bins[i];
      peakIdx = i;
    }
  }

  if (peakCount < 2) {
    return { edge: isLeft ? halfW : -halfW, found: false, peakCount };
  }

  const minWallDensity = Math.max(2, Math.floor(peakCount * 0.12));
  let wallIdx = peakIdx;
  for (let i = peakIdx; i <= endBin; i++) {
    if (bins[i] >= minWallDensity) {
      wallIdx = i;
    } else {
      break;
    }
  }

  const edge = isLeft
    ? (binMaxLy[wallIdx] !== -Infinity ? Number(binMaxLy[wallIdx].toFixed(3)) : halfW)
    : (binMinLy[wallIdx] !== Infinity ? Number(binMinLy[wallIdx].toFixed(3)) : -halfW);

  return { edge, found: true, peakCount };
}

/**
 * Thuật toán Dò Bức Tường Thành Vỏ Xe (Lateral Wall Peak Detection):
 * Dò đỉnh xung mật độ đứng của thành xe trên trục ly (Front View),
 * loại bỏ hoàn toàn gương chiếu hậu (chỉ 1-2 điểm hẹp) và vật thể khác bên cạnh.
 */
export function detectLateralWallBounds(
  pts: Array<{ lx: number; ly: number; z: number }>,
  halfW: number,
  visibleLateral: "left" | "right",
  binSize: number = 0.025
): number {
  return detectLateralWallBoundsWithStatus(pts, halfW, visibleLateral, binSize).edge;
}

/**
 * Thuật toán Dò Bức Tường Mật Độ Vỏ Xe & Cắt Thung Lũng Mật Độ (Dominant Wall Edge with Density Valley Cutoff):
 * - Thay thế việc lấy phân vị cực biên mù quáng (5% hay 95%) vốn dễ bị "hút" vào người đi bộ hoặc xe khác đỗ sát bên.
 * - Tích hợp Trọng Số Intensity / Màu Sáng (Intensity Weighting) và Cơ Chế Bảo Vệ Mép Sáng (Bright Edge Protection):
 *   1. Điểm có màu sáng / intensity cao được bảo tồn, không bị coi là nhiễu thưa thớt, chống co rút lẹm vào object.
 *   2. Đỉnh mật độ thân xe được tính toán dựa trên Weighted Histogram, ưu tiên phản xạ kim loại/đèn xe.
 *   3. Trải dài hình học: Sườn xe trải dài theo trục dọc lx (spanLx >= 0.7m), người đi bộ là cột trụ hẹp (spanLx <= 0.45m).
 * - Quét từ đỉnh mật độ thân vỏ xe ra phía ngoài đón tia, chốt mép vỏ xe tại đó và CẮT BỎ 100% các điểm nằm sau thung lũng.
 */
export function detectDominantWallEdgeWithValleyCutoff<
  T extends { lx: number; ly: number; z: number; intensity?: number }
>(
  pts: Array<T>,
  axis: "ly" | "lx",
  direction: "positive" | "negative",
  nominalHalf: number,
  options: {
    binSize?: number;
    minSpanOrthogonal?: number;
    maxSearchExtension?: number;
    useIntensity?: boolean;
  } = {}
): {
  edge: number;
  wallPoints: Array<T>;
  peakDensity: number;
} {
  const isPos = direction === "positive";
  const orthAxis = axis === "ly" ? "lx" : "ly";
  const binSize = options.binSize ?? 0.03; // 3cm
  const minSpanOrth = options.minSpanOrthogonal ?? (axis === "ly" ? 0.70 : 0.60);
  const maxSearchExt = options.maxSearchExtension ?? 0.35;

  // Lọc các điểm thuộc nửa đón tia (bỏ các điểm quá sát 0)
  const candidatePts = pts.filter((p) => (isPos ? p[axis] > 0.02 : p[axis] < -0.02));
  if (candidatePts.length < 3) {
    return {
      edge: isPos ? nominalHalf : -nominalHalf,
      wallPoints: candidatePts,
      peakDensity: candidatePts.length,
    };
  }

  // Phân tích trọng số Intensity (Cường độ phản xạ & độ sáng)
  const intensityData = options.useIntensity !== false ? computeIntensityWeights(candidatePts) : null;
  const weights = intensityData?.weights || new Array(candidatePts.length).fill(1.0);
  const highThreshold = intensityData?.highIntensityThreshold ?? Infinity;
  const hasValidIntensity = intensityData?.hasValidIntensity ?? false;

  // Quy chuẩn khoảng cách từ tâm xe ra phía ngoài (dist >= 0)
  const maxDist = nominalHalf + maxSearchExt;
  const numBins = Math.ceil(maxDist / binSize) + 2;
  const bins: Array<Array<{ pt: T; weight: number; isBright: boolean }>> = Array.from(
    { length: numBins },
    () => []
  );
  const binWeights: number[] = new Array(numBins).fill(0);

  for (let i = 0; i < candidatePts.length; i++) {
    const p = candidatePts[i];
    const w = weights[i];
    const isBright = hasValidIntensity && typeof p.intensity === "number" && p.intensity >= highThreshold;
    const dist = isPos ? p[axis] : -p[axis];
    if (dist >= 0 && dist <= maxDist) {
      const bIdx = Math.min(numBins - 1, Math.floor(dist / binSize));
      bins[bIdx].push({ pt: p, weight: w, isBright });
      binWeights[bIdx] += w;
    }
  }

  // 1. Tìm ĐỈNH MẬT ĐỘ THÂN XE CÓ TRỌNG SỐ (Dominant Weighted Wall Peak)
  // Quét toàn bộ phạm vi cho phép [nominalHalf - 0.45, nominalHalf + maxSearchExt]
  const nominalMinBin = Math.max(0, Math.floor((nominalHalf - 0.45) / binSize));
  const nominalMaxBin = Math.min(numBins - 1, Math.floor((nominalHalf + maxSearchExt) / binSize));

  let peakBin = nominalMinBin;
  let maxWeight = 0;

  for (let b = nominalMinBin; b <= nominalMaxBin; b++) {
    const bw = binWeights[b];
    if (bw > maxWeight) {
      maxWeight = bw;
      peakBin = b;
    }
  }

  // Nếu trong vùng danh định không có điểm nào rõ ràng (maxWeight < 2.0), dò toàn bộ dải
  if (maxWeight < 2.0) {
    for (let b = 1; b < numBins - 1; b++) {
      if (binWeights[b] > maxWeight) {
        maxWeight = binWeights[b];
        peakBin = b;
      }
    }
  }

  if (maxWeight === 0) {
    return {
      edge: isPos ? nominalHalf : -nominalHalf,
      wallPoints: candidatePts,
      peakDensity: 0,
    };
  }

  // 2. Dò mép vỏ xe từ peakBin ra phía ngoài (b tăng dần)
  const minWallWeight = Math.max(1.8, maxWeight * 0.12);
  let outerWallBin = peakBin;

  // Quét từ peakBin + 1 ra phía ngoài
  let consecutiveEmptyBins = 0;
  const maxGapBins = Math.round(0.12 / binSize); // 12cm chuẩn GEMINI.md Density Valley Cutoff
  for (let b = peakBin + 1; b < numBins; b++) {
    const ptsInBin = bins[b];
    const count = ptsInBin.length;
    const bw = binWeights[b];
    const hasBrightInBin = ptsInBin.some((item) => item.isBright);

    if (count === 0) {
      consecutiveEmptyBins++;
      // Nếu gặp khoảng trống liên tiếp >= maxGapBins (>= 12cm): Thung Lũng Mật Độ / Air Gap!
      if (consecutiveEmptyBins >= maxGapBins) {
        // Kiểm tra xem ở 1 bin kế tiếp ngay sau có điểm sáng phản quang không (Bright Point Bridge)
        const nextBinHasBright = b + 1 < numBins && bins[b + 1].some((item) => item.isBright);
        if (!nextBinHasBright) {
          break; // Dừng lại ngay lập tức, cắt bỏ toàn bộ phía sau!
        }
      }
      continue;
    }

    // NẾU CÓ ĐIỂM SÁNG PHẢN XẠ MẠNH: BẢO VỆ TUYỆT ĐỐI KHÔNG BỊ CO LẸM VÀO TRONG!
    if (hasBrightInBin) {
      consecutiveEmptyBins = 0;
      outerWallBin = b;
      continue;
    }

    // Nếu bin có điểm nhưng mật độ quá thấp (< minWallWeight) và nằm ngoài mép danh định
    const distCenter = (b + 0.5) * binSize;
    if (bw < minWallWeight && distCenter > nominalHalf) {
      consecutiveEmptyBins++;
      if (consecutiveEmptyBins >= maxGapBins) {
        break;
      }
      continue;
    }

    // Kiểm tra Tiêu chí Trải Dài Hình Học (Orthogonal Span):
    // Điểm ngoài sườn xe (hoặc cản xe) bắt buộc phải có độ trải dài vuông góc hợp lý.
    if (distCenter > nominalHalf - 0.05) {
      const orthVals = ptsInBin.map((item) => item.pt[orthAxis]);
      const spanOrth = Math.max(...orthVals) - Math.min(...orthVals);
      if (count <= 6 && spanOrth < minSpanOrth * 0.6) {
        if (b > peakBin + 1) {
          break; // Cắt thung lũng ngay tại đây!
        }
      }
    }

    // Bin này hợp lệ thuộc về thân vỏ xe
    consecutiveEmptyBins = 0;
    outerWallBin = b;
  }

  // 3. Thu thập toàn bộ điểm của thân xe từ tâm ra đến outerWallBin (đã cắt bỏ 100% người đi bộ bên ngoài)
  const collectedWallPoints: Array<T> = [];
  for (let b = 0; b <= outerWallBin; b++) {
    for (const item of bins[b]) {
      collectedWallPoints.push(item.pt);
    }
  }

  // Điểm mép vỏ xe được tính từ các bin quanh outerWallBin (lớp vỏ ngoài của xe)
  const outerEdgeItems: Array<{ pt: T; weight: number; isBright: boolean }> = [];
  const edgeStartBin = Math.max(0, outerWallBin - 3);
  for (let b = edgeStartBin; b <= outerWallBin; b++) {
    for (const item of bins[b]) {
      outerEdgeItems.push(item);
    }
  }

  // Tính tọa độ mép ngoài cùng (Edge)
  if (outerEdgeItems.length >= 3) {
    const brightItems = outerEdgeItems.filter((i) => i.isBright);
    // Nếu có điểm sáng ở lớp vỏ ngoài, ưu tiên bắt theo phân vị điểm sáng để chống thụt mép lẹm vào object
    const targetItems = brightItems.length >= 2 ? brightItems : outerEdgeItems;
    const dists = targetItems.map((item) => (isPos ? item.pt[axis] : -item.pt[axis])).sort((a, b) => a - b);
    const pIdx = Math.max(0, Math.min(dists.length - 1, Math.floor(dists.length * 0.95)));
    const chosenDist = dists[pIdx];
    const edge = isPos ? Number(chosenDist.toFixed(3)) : Number((-chosenDist).toFixed(3));
    return {
      edge,
      wallPoints: collectedWallPoints,
      peakDensity: Math.round(maxWeight),
    };
  }

  const fallbackDist = (outerWallBin + 1) * binSize;
  const edge = isPos ? Number(fallbackDist.toFixed(3)) : Number((-fallbackDist).toFixed(3));
  return {
    edge,
    wallPoints: collectedWallPoints.length > 0 ? collectedWallPoints : candidatePts,
    peakDensity: Math.round(maxWeight),
  };
}

/**
 * Thuật toán Căn Thẳng Góc Yaw Dựa Trên Viền Mật Độ Đột Biến Nhìn Từ Top View (BEV):
 * - Nhìn từ trên xuống (Top View - mặt phẳng X-Y), thành xe tạo thành một dải điểm có mật độ cực cao
 *   chênh lệch rõ rệt so với vùng trống rỗng bên ngoài.
 * - Thuật toán dò tìm dải viền ngoài này, khớp đường thẳng hồi quy ly = slope * lx + intercept,
 *   tính góc nghiêng deltaYaw = atan(slope) và vi chỉnh góc Yaw mới: newYaw = currentYaw + deltaYaw.
 * - Giới hạn góc vi chỉnh an toàn (|deltaYaw| <= 8 độ) để chống lộn ngược xe.
 */
export function straightenYawFromBoundaryEdge<
  T extends { lx: number; ly: number; z: number; intensity?: number }
>(
  pts: Array<T>,
  currentYaw: number,
  _L: number,
  _W: number,
  visibleLateral: "left" | "right",
  options: { maxAdjustmentDeg?: number; useIntensity?: boolean } = {}
): { newYawRad: number; newYawDeg: number; deltaYawDeg: number; slope: number } {
  const maxAdjDeg = options.maxAdjustmentDeg ?? 8.0;
  const maxAdjRad = (maxAdjDeg * Math.PI) / 180;

  // Phân tích trọng số Intensity
  const intensityData = options.useIntensity !== false ? computeIntensityWeights(pts) : null;
  const highThreshold = intensityData?.highIntensityThreshold ?? Infinity;
  const hasValidIntensity = intensityData?.hasValidIntensity ?? false;

  // Tự động nhận diện sườn xe đón tia dựa trên mật độ và số lượng điểm thực tế
  const leftPts = pts.filter((p) => p.ly > 0);
  const rightPts = pts.filter((p) => p.ly < 0);
  let sidePts: Array<T>;
  let isTargetLeft: boolean;

  if (leftPts.length >= 8 && leftPts.length > rightPts.length * 1.3) {
    sidePts = leftPts;
    isTargetLeft = true;
  } else if (rightPts.length >= 8 && rightPts.length > leftPts.length * 1.3) {
    sidePts = rightPts;
    isTargetLeft = false;
  } else {
    const isLeft = visibleLateral === "left";
    const preferredPts = isLeft ? leftPts : rightPts;
    if (preferredPts.length >= 8) {
      sidePts = preferredPts;
      isTargetLeft = isLeft;
    } else {
      sidePts = pts;
      isTargetLeft = isLeft;
    }
  }

  if (sidePts.length < 8) {
    return {
      newYawRad: currentYaw,
      newYawDeg: Number(((currentYaw * 180) / Math.PI).toFixed(2)),
      deltaYawDeg: 0,
      slope: 0,
    };
  }

  // Phân tích dải phân bố thực tế của thân xe trên trục lx để thích nghi với cả trường hợp box đặt ở 1 góc xe
  const sortedLx = sidePts.map((p) => p.lx).sort((a, b) => a - b);
  const minLxBound = sortedLx[Math.floor(sortedLx.length * 0.05)];
  const maxLxBound = sortedLx[Math.min(sortedLx.length - 1, Math.floor(sortedLx.length * 0.95))];
  const spanLx = maxLxBound - minLxBound;

  if (spanLx < 0.5) {
    return {
      newYawRad: currentYaw,
      newYawDeg: Number(((currentYaw * 180) / Math.PI).toFixed(2)),
      deltaYawDeg: 0,
      slope: 0,
    };
  }

  // Chia dải thân xe thành 10 lát cắt dọc theo chiều dài phân bố thực tế
  const numSlices = 10;
  const sliceWidth = spanLx / numSlices;
  const slicePoints: Array<{ lx: number; ly: number; weight: number }> = [];

  for (let s = 0; s < numSlices; s++) {
    const sMin = minLxBound + s * sliceWidth;
    const sMax = sMin + sliceWidth;
    const inSlice = sidePts.filter((p) => p.lx >= sMin && p.lx < sMax);

    if (inSlice.length >= 1) {
      // Ưu tiên điểm sáng trong lát cắt nếu có
      const brightInSlice = hasValidIntensity
        ? inSlice.filter((p) => typeof p.intensity === "number" && p.intensity >= highThreshold)
        : [];
      const targetSlicePts = brightInSlice.length >= 1 ? brightInSlice : inSlice;
      const sliceWeight = brightInSlice.length >= 1 ? 2.0 : 1.0;

      const sortedLy = targetSlicePts.map((p) => p.ly).sort((a, b) => a - b);
      if (isTargetLeft) {
        // Sườn trái đón tia: lấy phân vị mép ngoài cùng (90th percentile)
        const pIdx = Math.max(0, Math.floor(sortedLy.length * 0.90));
        slicePoints.push({ lx: (sMin + sMax) / 2, ly: sortedLy[pIdx], weight: sliceWeight });
      } else {
        // Sườn phải đón tia: lấy phân vị mép ngoài cùng (10th percentile)
        const pIdx = Math.min(sortedLy.length - 1, Math.floor(sortedLy.length * 0.10));
        slicePoints.push({ lx: (sMin + sMax) / 2, ly: sortedLy[pIdx], weight: sliceWeight });
      }
    }
  }

  if (slicePoints.length < 4) {
    return {
      newYawRad: currentYaw,
      newYawDeg: Number(((currentYaw * 180) / Math.PI).toFixed(2)),
      deltaYawDeg: 0,
      slope: 0,
    };
  }

  // Hồi quy bền vững kháng ngoại lai Theil-Sen Estimator có trọng số:
  // Miễn nhiễm 100% với các điểm cản trước/sau lọt vào mép sườn xe
  const slopesWithWeights: Array<{ slope: number; weight: number }> = [];
  for (let i = 0; i < slicePoints.length; i++) {
    for (let j = i + 1; j < slicePoints.length; j++) {
      const dx = slicePoints[j].lx - slicePoints[i].lx;
      const dy = slicePoints[j].ly - slicePoints[i].ly;
      if (Math.abs(dx) >= 0.25) {
        const pairWeight = (slicePoints[i].weight + slicePoints[j].weight) / 2;
        slopesWithWeights.push({ slope: dy / dx, weight: pairWeight });
      }
    }
  }

  let slope = 0;
  if (slopesWithWeights.length >= 3) {
    slopesWithWeights.sort((a, b) => a.slope - b.slope);
    // Weighted Median of Slopes
    const totalW = slopesWithWeights.reduce((sum, item) => sum + item.weight, 0);
    let cumulativeW = 0;
    let chosenSlope = slopesWithWeights[Math.floor(slopesWithWeights.length / 2)].slope;
    for (const item of slopesWithWeights) {
      cumulativeW += item.weight;
      if (cumulativeW >= totalW / 2) {
        chosenSlope = item.slope;
        break;
      }
    }
    slope = chosenSlope;
  } else {
    let sumLx = 0;
    let sumLy = 0;
    let sumLxLy = 0;
    let sumLx2 = 0;
    const m = slicePoints.length;

    for (const p of slicePoints) {
      sumLx += p.lx;
      sumLy += p.ly;
      sumLxLy += p.lx * p.ly;
      sumLx2 += p.lx * p.lx;
    }

    const denom = m * sumLx2 - sumLx * sumLx;
    slope = Math.abs(denom) > 1e-6 ? (m * sumLxLy - sumLx * sumLy) / denom : 0;
  }
  let deltaYaw = Math.atan(slope);

  // Giới hạn góc vi chỉnh trong phạm vi an toàn [-8°, +8°]
  deltaYaw = Math.max(-maxAdjRad, Math.min(maxAdjRad, deltaYaw));

  let deltaYawDeg = Number(((deltaYaw * 180) / Math.PI).toFixed(2));
  // Vùng chết (Deadband) 0.25°: Nếu góc vi chỉnh quá nhỏ, giữ nguyên 0° để chống rung lắc khi bấm liên tiếp
  if (Math.abs(deltaYawDeg) < 0.25) {
    deltaYaw = 0;
    deltaYawDeg = 0;
  }

  // Góc Yaw mới = currentYaw + deltaYaw, chuẩn hóa [-PI, PI]
  let newYaw = currentYaw + deltaYaw;
  while (newYaw > Math.PI) newYaw -= 2 * Math.PI;
  while (newYaw < -Math.PI) newYaw += 2 * Math.PI;

  const newYawDeg = Number(((newYaw * 180) / Math.PI).toFixed(2));

  return {
    newYawRad: Number(newYaw.toFixed(5)),
    newYawDeg,
    deltaYawDeg,
    slope: Number(slope.toFixed(4)),
  };
}

/**
 * Thuật toán Dò Bức Tường Cản Xe Trục Dọc (Longitudinal Bumper Bounds Detection):
 * Dò mép cản trước hoặc cản sau trên trục lx (Side View),
 * loại bỏ hoàn toàn móc kéo, điểm nhiễu rời rạc và xe khác đỗ nối đuôi.
 */
export function detectLongitudinalBumperBounds(
  pts: Array<{ lx: number; ly: number; z: number }>,
  halfL: number,
  visibleLongitudinal: "front" | "rear"
): number {
  const isFront = visibleLongitudinal === "front";
  if (pts.length < 4) {
    return isFront ? halfL : -halfL;
  }

  // Sử dụng computeDensityRobustBounds đã tích hợp Radius Outlier Removal (ROR)
  // và Adaptive Gap & Density Slicing để tìm đúng mép cản xe đón tia thực tế
  const robustBounds = computeDensityRobustBounds(pts);
  return isFront ? robustBounds.lxMax : robustBounds.lxMin;
}

/**
 * Thuật toán Ôm Sát Cụm Điểm (Tight Bounding Box):
 * Căn chỉnh các mặt hộp 3D tiếp xúc khít 100% với các điểm cực biên thân xe.
 * Giữ nguyên góc Yaw annotator đã căn chỉnh.
 */
export function computeTightFitDimensions(
  bodyPoints: Array<{ x: number; y: number; z: number }>,
  cx: number,
  cy: number,
  yaw: number,
  groundZ: number
): {
  newL: number;
  newW: number;
  newH: number;
  newCenterX: number;
  newCenterY: number;
  newCenterZ: number;
  lxMin: number;
  lxMax: number;
  lyMin: number;
  lyMax: number;
  zTop: number;
} {
  const cosY = Math.cos(-yaw);
  const sinY = Math.sin(-yaw);

  const rawLocalPts: Array<{ lx: number; ly: number; z: number }> = [];
  for (const p of bodyPoints) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const lx = dx * cosY - dy * sinY;
    const ly = dx * sinY + dy * cosY;
    rawLocalPts.push({ lx, ly, z: p.z });
  }

  // Lọc cụm thân xe chính: loại bỏ xe bên cạnh ở trục ly và xe nối đuôi ở trục lx
  const filteredLy = filterDenseConnectedCluster1D(rawLocalPts, "ly", 0.22, 0);
  const localPts = filterDenseConnectedCluster1D(filteredLy, "lx", 0.22, 0);

  // Áp dụng thuật toán biên kháng nhiễu mật độ & loại bỏ gương chiếu hậu
  const robustBounds = computeDensityRobustBounds(localPts);
  const lxMin = robustBounds.lxMin;
  const lxMax = robustBounds.lxMax;
  const lyMin = robustBounds.lyMin;
  const lyMax = robustBounds.lyMax;
  const zTop = robustBounds.zTop;

  const measuredL = lxMax - lxMin;
  const measuredW = lyMax - lyMin;
  const measuredH = zTop - groundZ;

  // Giới hạn kích thước hợp lý cho phương tiện giao thông
  const newL = Number(Math.max(1.0, Math.min(18.0, measuredL)).toFixed(2));
  const newW = Number(Math.max(0.8, Math.min(3.5, measuredW)).toFixed(2));
  const newH = Number(Math.max(0.8, Math.min(4.5, measuredH)).toFixed(2));

  // Tâm cục bộ
  const midLx = (lxMin + lxMax) / 2;
  const midLy = (lyMin + lyMax) / 2;

  // Biến đổi ngược về hệ tọa độ toàn cục
  const cosWorld = Math.cos(yaw);
  const sinWorld = Math.sin(yaw);
  const newCenterX = Number((cx + midLx * cosWorld - midLy * sinWorld).toFixed(2));
  const newCenterY = Number((cy + midLx * sinWorld + midLy * cosWorld).toFixed(2));
  const newCenterZ = Number((groundZ + newH / 2).toFixed(3));

  return {
    newL,
    newW,
    newH,
    newCenterX,
    newCenterY,
    newCenterZ,
    lxMin: Number(lxMin.toFixed(2)),
    lxMax: Number(lxMax.toFixed(2)),
    lyMin: Number(lyMin.toFixed(2)),
    lyMax: Number(lyMax.toFixed(2)),
    zTop: Number(zTop.toFixed(3)),
  };
}

/**
 * Thuật toán Căn Hộp Bám Cụm Điểm BẢO TOÀN KÍCH THƯỚC (Preserving Dimensions Box Alignment):
 * Tự động dịch chuyển tâm (X, Y, Z) và căn sát cụm điểm LiDAR mà TUYỆT ĐỐI GIỮ NGUYÊN kích thước (L, W, H) của xe.
 * Khắc phục hoàn toàn lỗi khi annotator bấm fit thì xe bị bóp méo teo tóp kích thước.
 */
export function alignBoxToPointsPreservingDimensions(
  bodyPoints: Array<{ x: number; y: number; z: number }>,
  cx: number,
  cy: number,
  _cz: number,
  yaw: number,
  L: number,
  W: number,
  H: number,
  groundZ: number
): {
  newCenterX: number;
  newCenterY: number;
  newCenterZ: number;
  preservedL: number;
  preservedW: number;
  preservedH: number;
  pointsCount: number;
} {
  if (bodyPoints.length < 5) {
    return {
      newCenterX: cx,
      newCenterY: cy,
      newCenterZ: Number((groundZ + H / 2).toFixed(3)),
      preservedL: L,
      preservedW: W,
      preservedH: H,
      pointsCount: bodyPoints.length,
    };
  }

  const cosY = Math.cos(-yaw);
  const sinY = Math.sin(-yaw);

  const rawLocalPts: Array<{ lx: number; ly: number; z: number }> = [];
  for (const p of bodyPoints) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const lx = dx * cosY - dy * sinY;
    const ly = dx * sinY + dy * cosY;
    rawLocalPts.push({ lx, ly, z: p.z });
  }

  // Lọc cụm thân xe chính: loại bỏ 100% điểm của xe khác đỗ bên cạnh hoặc nối đuôi
  const filteredLy = filterDenseConnectedCluster1D(rawLocalPts, "ly", 0.22, 0);
  const localPts = filterDenseConnectedCluster1D(filteredLy, "lx", 0.22, 0);

  // Áp dụng thuật toán biên kháng nhiễu mật độ & loại bỏ gương chiếu hậu
  const robustBounds = computeDensityRobustBounds(localPts);
  const lxMin = robustBounds.lxMin;
  const lxMax = robustBounds.lxMax;
  const lyMin = robustBounds.lyMin;
  const lyMax = robustBounds.lyMax;

  const spanL = lxMax - lxMin;
  const spanW = lyMax - lyMin;

  // Xác định dịch chuyển tâm cục bộ midLx theo chiều dài xe
  let midLx = 0;
  if (spanL >= L * 0.75) {
    // Nếu cụm điểm bao phủ phần lớn chiều dài xe, căn giữa
    midLx = (lxMin + lxMax) / 2;
  } else {
    // Nếu cụm điểm bị khuyết một đầu:
    // Kiểm tra trọng tâm cụm điểm nghiêng về đầu trước hay đuôi xe
    const meanLx = localPts.reduce((acc, p) => acc + p.lx, 0) / localPts.length;
    if (meanLx > 0.3) {
      // Cụm điểm tập trung ở đầu trước xe: mặt trước xe chạm lxMax
      midLx = lxMax - L / 2;
    } else if (meanLx < -0.3) {
      // Cụm điểm tập trung ở đuôi sau xe: mặt sau xe chạm lxMin
      midLx = lxMin + L / 2;
    } else {
      midLx = (lxMin + lxMax) / 2;
    }
  }

  // Giới hạn dịch chuyển tối đa để tránh box bị văng xa khỏi vị trí người dùng
  const maxShiftL = Math.max(0.6, L * 0.35);
  midLx = Math.max(-maxShiftL, Math.min(maxShiftL, midLx));

  // Xác định dịch chuyển tâm cục bộ midLy theo chiều rộng xe
  let midLy = 0;
  if (spanW >= W * 0.75) {
    midLy = (lyMin + lyMax) / 2;
  } else {
    const meanLy = localPts.reduce((acc, p) => acc + p.ly, 0) / localPts.length;
    if (meanLy > 0.2) {
      midLy = lyMax - W / 2;
    } else if (meanLy < -0.2) {
      midLy = lyMin + W / 2;
    } else {
      midLy = (lyMin + lyMax) / 2;
    }
  }

  const maxShiftW = Math.max(0.4, W * 0.35);
  midLy = Math.max(-maxShiftW, Math.min(maxShiftW, midLy));

  // Biến đổi ngược về hệ tọa độ thế giới (World Frame)
  const cosWorld = Math.cos(yaw);
  const sinWorld = Math.sin(yaw);
  const newCenterX = Number((cx + midLx * cosWorld - midLy * sinWorld).toFixed(2));
  const newCenterY = Number((cy + midLx * sinWorld + midLy * cosWorld).toFixed(2));
  const newCenterZ = Number((groundZ + H / 2).toFixed(3));

  return {
    newCenterX,
    newCenterY,
    newCenterZ,
    preservedL: L,
    preservedW: W,
    preservedH: H,
    pointsCount: bodyPoints.length,
  };
}

export interface EgoRayFitResult {
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
  shiftLx: number;
  shiftLy: number;
  visibleLongitudinal?: "front" | "rear";
  visibleLateral?: "left" | "right";
  visibleFaces: {
    longitudinal: "front" | "rear";
    lateral: "left" | "right";
  };
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
 * Phân tích mật độ 2 đầu xe (20% Đầu vs 20% Đuôi dọc trục X) để xác định chính xác mặt cản đón tia laser:
 * - 20% Đầu xe (Front Zone): lx từ [+0.30 * L] đến [+L / 2 + 0.35m]
 * - 20% Đuôi xe (Rear Zone): lx từ [-L / 2 - 0.35m] đến [-0.30 * L]
 * - 60% Thân giữa (Middle Zone): lx từ (-0.30 * L) đến (+0.30 * L)
 * @param pts Danh sách điểm thân xe đã khử nhiễu mặt đất (lx, ly)
 * @param L Chiều dài xe
 * @param egoLocalX Tọa độ X của Ego trong hệ trục cục bộ của xe
 * @param egoLocalY Tọa độ Y của Ego trong hệ trục cục bộ của xe
 */
export function determineBumperByDensity(
  pts: Array<{ lx: number; ly: number; z?: number }>,
  L: number,
  egoLocalX: number,
  egoLocalY: number
): {
  visibleBumper: "front" | "rear";
  isParallelBalanced: boolean;
  nFront20: number;
  nRear20: number;
  nMiddle60: number;
} {
  if (pts.length === 0) {
    return {
      visibleBumper: egoLocalX >= 0 ? "front" : "rear",
      isParallelBalanced: false,
      nFront20: 0,
      nRear20: 0,
      nMiddle60: 0,
    };
  }

  // Xác định 20% đầu xe và 20% đuôi xe theo 2 đầu cực trị của cụm mây điểm thực tế (chống lệch tâm box)
  const allLx = pts.map((p) => p.lx).sort((a, b) => a - b);
  const pMinIdx = allLx.length >= 15 ? Math.floor(allLx.length * 0.015) : 0;
  const pMaxIdx = allLx.length >= 15 ? Math.min(allLx.length - 1, Math.floor(allLx.length * 0.985)) : allLx.length - 1;
  const lxMin = allLx[pMinIdx];
  const lxMax = allLx[pMaxIdx];

  const zoneSpan = Math.max(0.40, L * 0.20);
  const span = lxMax - lxMin;

  let nFront20 = 0;
  let nRear20 = 0;
  let nMiddle60 = 0;

  if (span < zoneSpan * 1.5) {
    // Cụm điểm co cụm hẹp ở một vùng (ví dụ chỉ có 1 đầu xe đón tia laser, đầu kia khuất hoàn toàn)
    const meanLx = pts.reduce((sum, p) => sum + p.lx, 0) / pts.length;
    const threshold = Math.max(0.35, L * 0.20);
    if (meanLx > threshold) {
      nFront20 = pts.length;
    } else if (meanLx < -threshold) {
      nRear20 = pts.length;
    } else {
      nMiddle60 = pts.length;
    }
  } else {
    const front20Min = lxMax - zoneSpan;
    const front20Max = lxMax + 0.35;
    const rear20Min = lxMin - 0.35;
    const rear20Max = lxMin + zoneSpan;

    nFront20 = pts.filter((p) => p.lx >= front20Min && p.lx <= front20Max).length;
    nRear20 = pts.filter((p) => p.lx >= rear20Min && p.lx <= rear20Max).length;
    nMiddle60 = pts.filter((p) => p.lx > rear20Max && p.lx < front20Min).length;
  }

  // 1. So sánh mật độ 20% hai đầu xe (Ở khoảng cách gần, cản trực diện đón tia có mật độ vượt trội, cản khuất thưa thớt)
  const isFrontDominant = (nFront20 >= 6 && nRear20 <= 4) || (nFront20 >= 8 && nFront20 >= nRear20 * 2.5);
  const isRearDominant = (nRear20 >= 6 && nFront20 <= 4) || (nRear20 >= 8 && nRear20 >= nFront20 * 2.5);

  if (isFrontDominant) {
    return {
      visibleBumper: "front",
      isParallelBalanced: false,
      nFront20,
      nRear20,
      nMiddle60,
    };
  }

  if (isRearDominant) {
    return {
      visibleBumper: "rear",
      isParallelBalanced: false,
      nFront20,
      nRear20,
      nMiddle60,
    };
  }

  // 2. Trường hợp chiếu ngang sườn song song hoặc phân bố đều đối xứng 2 đầu thân xe
  const tan25 = 0.466;
  const isEgoParallel = Math.abs(egoLocalX) <= Math.abs(egoLocalY) * tan25;
  const isEgoFacingBumper = Math.abs(egoLocalX) > Math.abs(egoLocalY) * tan25;
  const isSymmetricBothEnds = !isEgoFacingBumper && Math.abs(nFront20 - nRear20) <= 2 && nFront20 >= 2 && nRear20 >= 2 && nMiddle60 >= 3;

  if ((isEgoParallel || isSymmetricBothEnds) && pts.length >= 4) {
    return {
      visibleBumper: egoLocalX >= 0 ? "front" : "rear",
      isParallelBalanced: true,
      nFront20,
      nRear20,
      nMiddle60,
    };
  }

  // 3. Fallback theo hướng đón tia Ego (khi điểm thưa hoặc 2 đầu tương đương)
  let visibleBumper: "front" | "rear" = egoLocalX >= 0 ? "front" : "rear";
  const allFrontPts = pts.filter((p) => p.lx > 0.05);
  const allRearPts = pts.filter((p) => p.lx < -0.05);

  if (visibleBumper === "front" && allFrontPts.length < 2 && allRearPts.length >= 4) {
    visibleBumper = "rear";
  } else if (visibleBumper === "rear" && allRearPts.length < 2 && allFrontPts.length >= 4) {
    visibleBumper = "front";
  }

  return {
    visibleBumper,
    isParallelBalanced: false,
    nFront20,
    nRear20,
    nMiddle60,
  };
}

/**
 * Thuật toán FIT GÓC ĐÓN TIA EGO (RAY-CAST L-SHAPE FIT) & GHIM ĐẤT 3D (CẢ SIDE VIEW VÀ FRONT VIEW).
 * - Cảm biến Ego tại (egoPos.x, egoPos.y) bắn tia laser tới xe:
 *   + Nhận diện các mặt và góc đón tia trực tiếp (Front/Rear theo Side View và Left/Right theo Front View).
 *   + Đẩy mép đón tia của Box áp sát mép ngoài đám mây điểm (Outer Hull Contact).
 *   + Ghim đáy xe chạm khít mặt đất (Ground Snap) và đưa góc trên của box áp sát điểm cao nhất của nóc xe (Roof Top Contact).
 */
export function fitBoxToEgoRayAndGround(
  pts: Array<{ x: number; y: number; z: number }>,
  cx: number,
  cy: number,
  cz: number,
  yaw: number,
  L: number,
  W: number,
  H: number,
  egoPos: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 },
  options: {
    preserveDimensions?: boolean;
    curbHeight?: number;
    fitRoofTop?: boolean;
    alignMode?: "w_only" | "both";
    fitStep?: "all" | "top" | "side" | "front";
    edgePadding?: number;
    pitch?: number;
    roll?: number;
  } = {}
): EgoRayFitResult {
  // 1. Dò cao độ mặt đất và độ dốc (Pitch & Roll) theo Footprint vết bánh xe (Bám dốc thật, thiếu điểm lấy Ego Z = 0)
  const ceilingZ = cz - Math.max(0.15, (H / 2) * 0.4);
  const groundInfo = computeGroundSlopesAndZ(pts, cx, cy, cz, yaw, L / 2, W / 2, ceilingZ, { lockRollFlat: false });
  const groundZ = groundInfo.groundZ !== null ? groundInfo.groundZ : 0;
  const pitchRad = groundInfo.pitchRad;
  const rollRad = groundInfo.rollRad;
  const pitchDeg = groundInfo.pitchDeg;
  const rollDeg = groundInfo.rollDeg;

  const cosY = Math.cos(-yaw);
  const sinY = Math.sin(-yaw);

  // 2. Thu thập các điểm thân xe cốt lõi (loại bỏ mặt đất và vệt quét loang sát sàn +22cm)
  const effectiveGroundZ = (groundInfo.groundZ !== null && !groundInfo.isFallbackZeroGround)
    ? groundInfo.groundZ
    : (cz - H / 2);
  const minBodyZ = effectiveGroundZ + 0.22;
  const maxRoofZ = effectiveGroundZ + H + 0.55;
  const fitStep = options.fitStep ?? "all";
  const outerL = L / 2 + 0.45;
  const outerW = W / 2 + 0.35;

  const rawBodyPts: Array<{ lx: number; ly: number; z: number }> = [];
  for (const p of pts) {
    if (p.z < minBodyZ || p.z > maxRoofZ) continue;
    const dx = p.x - cx;
    const dy = p.y - cy;
    const lx = dx * cosY - dy * sinY;
    const ly = dx * sinY + dy * cosY;
    if (Math.abs(lx) <= outerL && Math.abs(ly) <= outerW) {
      rawBodyPts.push({ lx, ly, z: p.z });
    }
  }

  // Lọc cụm liên thông bằng Độ đo phóng to điểm 5x (5x Point Dilation Spatial Graph)
  // Kết nối liền mạch vỏ xe và bảo vệ 100% curpoint biên đón tia, triệt tiêu người đi bộ & xe đỗ bên cạnh
  const dilationRes = clusterByPointDilation5x(rawBodyPts, {
    basePointSize: 0.025,
    dilationFactor: 5.0,
    connectDist: 0.25,
    dim: "2d",
    centerBias: { lx: 0, ly: 0 },
  });
  const dominantDilationPts = dilationRes.dominantPts.length >= 4 ? dilationRes.dominantPts : rawBodyPts;

  // Lọc cụm liên tục & mật độ: Loại bỏ 100% điểm của xe khác đỗ bên cạnh hoặc nối đuôi
  // Lớp 1: Lọc nhiễu thưa thớt sát thân xe dựa trên mật độ lõi 3D
  const denseCoreBodyPts = filterSparseNoiseByLocalDensity(dominantDilationPts, { radius: 0.22, minCoreNeighbors: 2 });

  // Lớp 2: Lọc cụm liên tục (maxGap = 0.22m đảm bảo liền mạch khối thân xe và tương thích bước lưới LiDAR)
  const clusterLy = filterDenseConnectedCluster1D(denseCoreBodyPts, "ly", 0.22, 0);
  const bodyPts = filterDenseConnectedCluster1D(clusterLy, "lx", 0.22, 0);

  // 3. Vector tia chiếu từ Ego tới xe và chuyển sang hệ tọa độ cục bộ của xe
  const dxEgo = cx - egoPos.x;
  const dyEgo = cy - egoPos.y;
  // Vector từ tâm xe về phía Ego (-dxEgo, -dyEgo) chiếu sang hệ cục bộ quay góc yaw:
  const vLocalX = -dxEgo * cosY + dyEgo * sinY;
  const vLocalY = -dxEgo * sinY - dyEgo * cosY;

  let visibleLongitudinal: "front" | "rear" = vLocalX >= 0 ? "front" : "rear";
  let visibleLateral: "left" | "right" = vLocalY >= 0 ? "left" : "right";

  let shiftLx = 0;
  let shiftLy = 0;
  let isSideParallelBalanced = false;
  let roofTopZ = groundZ + H;
  let newH = H;
  let newL = L;
  let newW = W;
  const preserveDimensions = options.preserveDimensions ?? true;
  const alignMode = options.alignMode ?? "both";

  const validBodyPts = bodyPts.length >= 4
    ? bodyPts
    : (dominantDilationPts.length >= 4 ? dominantDilationPts : (denseCoreBodyPts.length >= 4 ? denseCoreBodyPts : rawBodyPts));

  let straightYawResult = {
    newYawRad: yaw,
    newYawDeg: Number(((yaw * 180) / Math.PI).toFixed(1)),
    deltaYawDeg: 0,
    slope: 0,
  };
  let finalYaw = yaw;

  if (validBodyPts.length >= 4) {
    if (fitStep === "top") {
      // ========================================================
      // CHẾ ĐỘ 1: CĂN TOP CHUYÊN TRÁCH GÓC XOAY YAW (XOAY TẠI CHỖ QUANH TÂM)
      // - Nhiệm vụ DUY NHẤT: Căn chỉnh hướng xoay Yaw sao cho sườn xe song song tuyệt đối
      //   với dải mây điểm phần Ego chiếu trực tiếp vào.
      // - Cắt bỏ người đi bộ / vật thể lân cận bằng thung lũng mật độ trước khi hồi quy đường thẳng.
      // - Giữ nguyên vị trí tâm xe theo cả 2 trục X và Y: shiftLx = 0, shiftLy = 0.
      // - Tuyệt đối không bao giờ làm box bị trôi hay nhảy văng đi xa.
      // ========================================================
      const expectedRoofZ = groundZ + H;
      roofTopZ = detectRoofTopBounds(validBodyPts, expectedRoofZ);

      const cleanRoofBodyPts = validBodyPts.filter((p) => p.z <= roofTopZ + 0.05);
      const cleanPts = cleanRoofBodyPts.length >= 4 ? cleanRoofBodyPts : validBodyPts;

      // Lọc các điểm thuộc sườn đón tia của vỏ xe thật (loại bỏ người đi bộ bằng thung lũng mật độ)
      const wallDet = detectDominantWallEdgeWithValleyCutoff(
        cleanPts,
        "ly",
        visibleLateral === "left" ? "positive" : "negative",
        W / 2,
        { minSpanOrthogonal: 0.70 }
      );
      const activePtsForYaw = wallDet.wallPoints.length >= 6 ? wallDet.wallPoints : cleanPts;

      // Căn thẳng Yaw bằng Theil-Sen Median Slope (giới hạn an toàn ±12°, deadband 0.25°)
      straightYawResult = straightenYawFromBoundaryEdge(activePtsForYaw, yaw, L, W, visibleLateral, { maxAdjustmentDeg: 12.0 });
      finalYaw = straightYawResult.newYawRad;

      // KHÓA CỨNG VỊ TRÍ X VÀ Y: Nút TOP chỉ xoay quanh tâm hiện tại, không dời vị trí!
      shiftLx = 0;
      shiftLy = 0;
    } else if (fitStep === "side") {
      // ========================================================
      // CHẾ ĐỘ 2: CĂN SIDE ĐỘC LẬP (Side View / Cản Trước - Sau X)
      // QUY TẮC BẮT BUỘC:
      // 1. Nhận diện mặt cản đón tia laser từ Ego (Front hoặc Rear) kết hợp mật độ chùm điểm thực tế.
      // 2. Dò đỉnh mật độ cản xe & cắt thung lũng mật độ để miễn nhiễm 100% với người đi bộ/vật cản trước cản.
      // 3. Bổ sung khoảng đệm Padding 5.0cm để viền box không bị cấn đè lên điểm ngoài cùng.
      // 4. Kẹp an toàn dịch chuyển (<= 40cm) triệt tiêu hoàn toàn hiện tượng di chuyển quá đà.
      // ========================================================
      finalYaw = yaw; // Giữ nguyên Yaw hiện tại

      // 1. Xác định mặt cản đón tia từ Ego:
      const toEgoX = egoPos.x - cx;
      const toEgoY = egoPos.y - cy;
      // Chiếu lên trục dọc X của xe (hướng tới trước đầu xe: (cos(yaw), sin(yaw)))
      const egoLocalX = toEgoX * Math.cos(yaw) + toEgoY * Math.sin(yaw);
      // Chiếu lên trục ngang Y của xe (hướng sang trái xe: (-sin(yaw), cos(yaw)))
      const egoLocalY = -toEgoX * Math.sin(yaw) + toEgoY * Math.cos(yaw);

      const edgePadding = options.edgePadding ?? 0.05; // 5.0cm

      // QUY TẮC CĂN SIDE KẾT HỢP MẬT ĐỘ 20% ĐẦU/ĐUÔI XE & GÓC CHIẾU EGO:
      const densityDecision = determineBumperByDensity(validBodyPts, L, egoLocalX, egoLocalY);

      if (densityDecision.isParallelBalanced && validBodyPts.length >= 4) {
        // VÙNG 1: CHIẾU VUÔNG GÓC SƯỜN XE HOẶC PHÂN BỐ ĐỐI XỨNG:
        // Cả cản trước và cản sau đều không đón tia trực diện.
        // -> Dàn đều tâm box theo trọng tâm 2 đầu mây điểm thân xe:
        isSideParallelBalanced = true;
        const allLx = validBodyPts.map((p) => p.lx).sort((a, b) => a - b);
        const pMinIdx = allLx.length >= 15 ? Math.floor(allLx.length * 0.015) : 0;
        const pMaxIdx = allLx.length >= 15 ? Math.min(allLx.length - 1, Math.floor(allLx.length * 0.985)) : allLx.length - 1;
        const lxMin = allLx[pMinIdx];
        const lxMax = allLx[pMaxIdx];

        shiftLx = (lxMin + lxMax) / 2;
        visibleLongitudinal = densityDecision.visibleBumper;
      } else {
        // VÙNG 2 & 3: CÓ MẶT CẢN ĐÓN TIA RÕ RỆT (Ưu tiên theo mật độ 20% đầu/đuôi xe hoặc góc Ego):
        const visibleBumper = densityDecision.visibleBumper;
        visibleLongitudinal = visibleBumper;

        // 2. Lấy điểm bao cản xe bằng Bức Tường Mật Độ & Cắt Thung Lũng Mật Độ (Density Valley Cutoff)
        const targetBumperPts = validBodyPts.filter((p) => Math.abs(p.ly) <= W / 2 + 0.15);
        const activePtsForL = targetBumperPts.length >= 4 ? targetBumperPts : validBodyPts;
        const bumperCloudPts = activePtsForL.filter((p) => (visibleBumper === "front" ? p.lx > 0 : p.lx < 0));

        // Lọc nhiễu thưa thớt sát cản xe bằng mật độ lõi 3D
        const cleanBumperPts = filterSparseNoiseByLocalDensity(bumperCloudPts, { radius: 0.15, minCoreNeighbors: 2 });
        const finalBumperPts = cleanBumperPts.length >= 3 ? cleanBumperPts : bumperCloudPts;

        let bumperEdge: number;
        if (finalBumperPts.length >= 3) {
          const wallDet = detectDominantWallEdgeWithValleyCutoff(
            finalBumperPts,
            "lx",
            visibleBumper === "front" ? "positive" : "negative",
            L / 2,
            { minSpanOrthogonal: 0.60 }
          );
          bumperEdge = wallDet.edge;
        } else {
          bumperEdge = visibleBumper === "front" ? L / 2 : -L / 2;
        }

        // 3. Căn mép đón tia của Box ôm khít điểm bao cản xe + Padding 5.0cm chống dính điểm:
        if (visibleBumper === "front") {
          shiftLx = (bumperEdge + edgePadding) - L / 2;
        } else {
          shiftLx = (bumperEdge - edgePadding) + L / 2;
        }
      }

      // Giới hạn an toàn (triệt tiêu 100% hiện tượng di chuyển quá đà) và deadband
      const maxShiftL = Math.min(0.40, L * 0.25);
      shiftLx = Math.max(-maxShiftL, Math.min(maxShiftL, shiftLx));
      if (Math.abs(shiftLx) < 0.01) shiftLx = 0;
      shiftLy = 0; // Giữ nguyên sườn Y
    } else if (fitStep === "front") {
      // ========================================================
      // CHẾ ĐỘ 3: CĂN FRONT ĐỘC LẬP (View 2D sườn xe theo phương W)
      // QUY TẮC BẮT BUỘC:
      // 1. FRONT TUYỆT ĐỐI KHÔNG GHIM ĐẤT (Giữ nguyên 100% cao độ Z và Roll/Pitch của xe).
      // 2. Dò đỉnh mật độ sườn xe & cắt thung lũng mật độ để miễn nhiễm 100% với người đi bộ đứng sát sườn.
      // 3. Bổ sung khoảng đệm Padding 5.0cm để viền box không bị cấn đè lên điểm ngoài cùng.
      // ========================================================
      finalYaw = yaw; // Giữ nguyên Yaw hiện tại

      // 1. Xác định mặt sườn đón tia từ Ego:
      const toEgoX = egoPos.x - cx;
      const toEgoY = egoPos.y - cy;
      // Chiếu lên trục ngang Y của xe (hướng sang bên trái xe: (-sin(yaw), cos(yaw)))
      const egoLocalY = -toEgoX * Math.sin(yaw) + toEgoY * Math.cos(yaw);

      // Đếm mật độ điểm thực tế 2 bên sườn (Tia laser không xuyên qua xe nên mặt đón tia luôn có nhiều điểm hơn hẳn)
      const leftSidePts = validBodyPts.filter((p) => p.ly > 0.05);
      const rightSidePts = validBodyPts.filter((p) => p.ly < -0.05);

      let visibleSide: "left" | "right";
      if (Math.abs(egoLocalY) >= 0.25) {
        visibleSide = egoLocalY >= 0 ? "left" : "right";
      } else if (leftSidePts.length >= rightSidePts.length + 3) {
        visibleSide = "left";
      } else if (rightSidePts.length >= leftSidePts.length + 3) {
        visibleSide = "right";
      } else {
        visibleSide = egoLocalY >= 0 ? "left" : "right";
      }
      visibleLateral = visibleSide;

      // 2. Lấy điểm bao sườn xe bằng Bức Tường Mật Độ & Cắt Thung Lũng Mật Độ (Density Valley Cutoff)
      const targetSidePts = validBodyPts.filter((p) => Math.abs(p.lx) <= L / 2 + 0.15);
      const activePtsForW = targetSidePts.length >= 4 ? targetSidePts : validBodyPts;
      const sideCloudPts = activePtsForW.filter((p) => (visibleSide === "left" ? p.ly > 0 : p.ly < 0));

      // Lọc nhiễu thưa thớt sát sườn xe bằng mật độ lõi 3D
      const cleanSidePts = filterSparseNoiseByLocalDensity(sideCloudPts, { radius: 0.15, minCoreNeighbors: 2 });
      const finalSidePts = cleanSidePts.length >= 3 ? cleanSidePts : sideCloudPts;

      let boundaryEdge: number;
      if (finalSidePts.length >= 3) {
        const wallDet = detectDominantWallEdgeWithValleyCutoff(
          finalSidePts,
          "ly",
          visibleSide === "left" ? "positive" : "negative",
          W / 2,
          { minSpanOrthogonal: 0.70 }
        );
        boundaryEdge = wallDet.edge;
      } else {
        boundaryEdge = visibleSide === "left" ? W / 2 : -W / 2;
      }

      // 3. Căn mép đón tia của Box ôm khít điểm bao này theo phương W + Padding 5.0cm chống dính điểm:
      const edgePadding = options.edgePadding ?? 0.05; // 5.0cm
      if (visibleSide === "left") {
        shiftLy = (boundaryEdge + edgePadding) - W / 2;
      } else {
        shiftLy = (boundaryEdge - edgePadding) + W / 2;
      }

      // Giới hạn an toàn và triệt tiêu rung lắc
      const maxShiftW = Math.min(0.40, W * 0.30);
      shiftLy = Math.max(-maxShiftW, Math.min(maxShiftW, shiftLy));
      if (Math.abs(shiftLy) < 0.01) shiftLy = 0;
      shiftLx = 0; // Giữ nguyên cản X
    } else {
      // ========================================================
      // CHẾ ĐỘ TOÀN DIỆN (Chu trình tuần tự: TOP ➔ SIDE ➔ FRONT)
      // ========================================================
      const expectedRoofZ = groundZ + H;
      const detectedRoofZ = detectRoofTopBounds(validBodyPts, expectedRoofZ);
      roofTopZ = detectedRoofZ;

      const cleanRoofBodyPts = validBodyPts.filter((p) => p.z <= roofTopZ + 0.05);
      const activeBodyPts = cleanRoofBodyPts.length >= 4 ? cleanRoofBodyPts : validBodyPts;

      // Bước 1: Căn thẳng góc Yaw theo Top View
      straightYawResult = straightenYawFromBoundaryEdge(activeBodyPts, yaw, L, W, visibleLateral);
      finalYaw = straightYawResult.newYawRad;

      // Chiếu lại các điểm sang hệ tọa độ mới (finalYaw) để căn Side và Front tuyệt đối chính xác
      let alignedPts = activeBodyPts;
      if (Math.abs(straightYawResult.deltaYawDeg) >= 0.05) {
        const cosFinal = Math.cos(-finalYaw);
        const sinFinal = Math.sin(-finalYaw);
        const reprojected: Array<{ lx: number; ly: number; z: number }> = [];
        for (const p of pts) {
          if (p.z < minBodyZ || p.z > roofTopZ + 0.05) continue;
          const dx = p.x - cx;
          const dy = p.y - cy;
          const lx = dx * cosFinal - dy * sinFinal;
          const ly = dx * sinFinal + dy * cosFinal;
          if (Math.abs(lx) <= outerL && Math.abs(ly) <= outerW) {
            reprojected.push({ lx, ly, z: p.z });
          }
        }
        if (reprojected.length >= 4) {
          alignedPts = reprojected;
        }
      }

      const distToEgo = Math.hypot(dxEgo, dyEgo);
      if (distToEgo < 0.5) {
        const meanLy = alignedPts.reduce((acc, p) => acc + p.ly, 0) / alignedPts.length;
        const meanLx = alignedPts.reduce((acc, p) => acc + p.lx, 0) / alignedPts.length;

        if (meanLy < -0.12) visibleLateral = "right";
        else if (meanLy > 0.12) visibleLateral = "left";

        if (meanLx > 0.20) visibleLongitudinal = "front";
        else if (meanLx < -0.20) visibleLongitudinal = "rear";
      }

      // Bước 2: Dò bức tường thành sườn xe W/Y (Front View)
      const innerBodyPtsForW = alignedPts.filter((p) => Math.abs(p.lx) <= L / 2 - 0.05);
      const targetSidePts = innerBodyPtsForW.length >= 4 ? innerBodyPtsForW : alignedPts;
      const sideWallEdge = detectLateralWallBounds(targetSidePts, W / 2, visibleLateral);

      if (visibleLateral === "left") {
        shiftLy = sideWallEdge - W / 2;
      } else {
        shiftLy = sideWallEdge + W / 2;
      }

      // Bước 3: Dò cản trước / sau X (Side View) kết hợp mật độ 20% đầu/đuôi xe
      if (alignMode === "w_only") {
        shiftLx = 0;
      } else {
        const bumperDecAll = determineBumperByDensity(alignedPts, L, vLocalX, vLocalY);
        visibleLongitudinal = bumperDecAll.visibleBumper;

        const innerBodyPtsForX = alignedPts.filter((p) => Math.abs(p.ly) <= W / 2 + 0.10);
        const targetBumperPts = innerBodyPtsForX.length >= 4 ? innerBodyPtsForX : alignedPts;
        const bumperEdge = detectLongitudinalBumperBounds(targetBumperPts, L / 2, visibleLongitudinal);

        if (visibleLongitudinal === "front") {
          shiftLx = bumperEdge - L / 2;
        } else {
          shiftLx = bumperEdge + L / 2;
        }
      }
    }

    // Giới hạn độ dịch chuyển an toàn và đảm bảo tính bất biến cho nút TOP
    if (fitStep === "top") {
      shiftLx = 0;
      shiftLy = 0;
    } else {
      const maxShiftL = Math.max(0.65, L * 0.35);
      const maxShiftW = Math.max(0.45, W * 0.35);
      shiftLx = Math.max(-maxShiftL, Math.min(maxShiftL, shiftLx));
      shiftLy = Math.max(-maxShiftW, Math.min(maxShiftW, shiftLy));
    }

    // Chiều cao & trần xe
    if (preserveDimensions !== true) {
      const measuredH = roofTopZ - groundZ;
      newH = Number(Math.max(1.35, Math.min(2.8, measuredH)).toFixed(2));
    } else {
      newH = H;
      newL = L;
      newW = W;
    }
  }

  // Tọa độ tâm trong hệ thế giới (World Frame) tính theo góc Yaw
  const cosWorld = Math.cos(finalYaw);
  const sinWorld = Math.sin(finalYaw);
  const newCenterX = Number((cx + shiftLx * cosWorld - shiftLy * sinWorld).toFixed(3));
  const newCenterY = Number((cy + shiftLx * sinWorld + shiftLy * cosWorld).toFixed(3));
  // Đáy xe tiếp đất chuẩn xác 100% (Auto Ghim Đất) - NGOẠI TRỪ CÁC NÚT ĐỘC LẬP TOP, SIDE, FRONT
  const cosPitch = Math.cos(pitchRad);
  const cosRoll = Math.cos(rollRad);
  let newCenterZ = Number((groundZ + (newH / 2) * cosPitch * cosRoll).toFixed(3));
  let finalPitch = pitchRad;
  let finalRoll = rollRad;
  let finalPitchDeg = pitchDeg;
  let finalRollDeg = rollDeg;

  if (fitStep === "top" || fitStep === "side" || fitStep === "front") {
    // TOP, SIDE VÀ FRONT TUYỆT ĐỐI KHÔNG GHIM ĐẤT: Giữ nguyên 100% cao độ Z và góc nghiêng của box hiện tại
    newCenterZ = cz;
    finalPitch = options.pitch ?? 0;
    finalRoll = options.roll ?? 0;
    finalPitchDeg = Number(((finalPitch * 180) / Math.PI).toFixed(2));
    finalRollDeg = Number(((finalRoll * 180) / Math.PI).toFixed(2));
  }

  const faceTextLong = visibleLongitudinal === "front" ? "Mặt Trước" : "Mặt Sau";
  const faceTextLat = visibleLateral === "left" ? "Sườn Trái" : "Sườn Phải";

  let msg = `Đã căn thẳng Top (Yaw: ${straightYawResult.newYawDeg}°), Side [${faceTextLong}], Front [${faceTextLat}] & Ghim Đất (Z: ${newCenterZ}m, H: ${newH}m)`;
  if (fitStep === "top") {
    const deltaSign = straightYawResult.deltaYawDeg >= 0 ? "+" : "";
    msg = `Đã căn TOP: Xoay Yaw (${straightYawResult.newYawDeg}°, Δ=${deltaSign}${straightYawResult.deltaYawDeg}°) song song sườn đón tia [${faceTextLat}], khóa tâm X/Y/Z (giữ nguyên cao độ Z)`;
  } else if (fitStep === "side") {
    const deltaXSign = shiftLx >= 0 ? "+" : "";
    if (isSideParallelBalanced) {
      msg = `Đã căn SIDE: Chiếu ngang sườn song song (Fit đều đầu & cuối xe, ΔX: ${deltaXSign}${shiftLx.toFixed(2)}m, giữ nguyên cao độ Z)`;
    } else {
      msg = `Đã căn SIDE: Cản [${faceTextLong}] đón tia (ΔX: ${deltaXSign}${shiftLx.toFixed(2)}m, giữ nguyên cao độ Z)`;
    }
  } else if (fitStep === "front") {
    const deltaYSign = shiftLy >= 0 ? "+" : "";
    msg = `Đã căn FRONT: Mép sườn [${faceTextLat}] ăn khít phương W (ΔY: ${deltaYSign}${(shiftLy * 100).toFixed(1)}cm, giữ nguyên cao độ Z)`;
  }

  return {
    newCenterX,
    newCenterY,
    newCenterZ,
    newYawRad: finalYaw,
    newYawDeg: straightYawResult.newYawDeg,
    deltaYawDeg: straightYawResult.deltaYawDeg,
    newL,
    newW,
    newH,
    pitchRad: finalPitch,
    rollRad: finalRoll,
    pitchDeg: finalPitchDeg,
    rollDeg: finalRollDeg,
    groundZ,
    roofTopZ,
    shiftLx: Number(shiftLx.toFixed(3)),
    shiftLy: Number(shiftLy.toFixed(3)),
    visibleLongitudinal,
    visibleLateral,
    visibleFaces: {
      longitudinal: visibleLongitudinal,
      lateral: visibleLateral,
    },
    dominantEdge: {
      edgeSide: visibleLateral,
      bumperSide: visibleLongitudinal,
      sideWallEdge: Number(shiftLy.toFixed(3)),
      bumperEdge: Number(shiftLx.toFixed(3)),
    },
    pointsCount: bodyPts.length,
    fitStep,
    message: msg,
  };
}
