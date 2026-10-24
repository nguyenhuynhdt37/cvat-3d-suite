/**
 * Module toán học hình học 3D (Pure Functions).
 * Chịu trách nhiệm tính toán góc xoay Yaw, bù trừ cao độ Ground-Lock Z,
 * và các kịch bản Ghim Mặt Đất (Ground Snapping) & Nền Vỉa Hè (Curb / Sidewalk Offset).
 */

/**
 * Đảo ngược góc Yaw (Heading) 180 độ (π radian) và chuẩn hóa về khoảng [-π, π].
 * @param currentYaw Góc Yaw hiện tại (tính bằng radian).
 * @returns Góc Yaw mới đã đảo ngược 180 độ.
 */
export function flipYaw(currentYaw: number): number {
  let newYaw = currentYaw + Math.PI;

  // Chuẩn hóa góc về khoảng [-π, π]
  while (newYaw > Math.PI) {
    newYaw -= 2 * Math.PI;
  }
  while (newYaw < -Math.PI) {
    newYaw += 2 * Math.PI;
  }

  return newYaw;
}

/**
 * Chuẩn hóa bất kỳ góc radian nào về khoảng [-π, π].
 * @param rad Góc tính bằng radian.
 * @returns Góc đã chuẩn hóa về [-π, π].
 */
export function normalizeAngle(rad: number): number {
  let angle = rad;
  while (angle > Math.PI) {
    angle -= 2 * Math.PI;
  }
  while (angle < -Math.PI) {
    angle += 2 * Math.PI;
  }
  return angle;
}

/**
 * Chuyển đổi góc từ Radian sang Độ (Degrees) để hiển thị trực quan cho người dùng.
 */
export function radToDeg(rad: number): number {
  return Number(((rad * 180) / Math.PI).toFixed(2));
}

/**
 * Chuyển đổi góc từ Độ (Degrees) sang Radian để lưu vào CVAT.
 */
export function degToRad(deg: number): number {
  return Number(((deg * Math.PI) / 180).toFixed(6));
}

/**
 * Tính toán bù trừ tọa độ tâm Z để mặt phẳng tiếp xúc bánh xe với mặt đường không đổi (Ground-Lock).
 * @param oldZ Tọa độ tâm Z hiện tại (mét)
 * @param oldHeight Chiều cao hiện tại của xe (mét)
 * @param newHeight Chiều cao mới cần áp dụng (mét)
 * @returns Tọa độ tâm Z mới (mét)
 */
export function calculateGroundLockedZ(oldZ: number, oldHeight: number, newHeight: number): number {
  const deltaH = newHeight - oldHeight;
  return Number((oldZ + deltaH / 2).toFixed(3));
}

/**
 * Tính toán tâm Z để mặt đáy cuboid áp sát đúng vào mặt đất (Road Ground Snap).
 * Mặt đáy: Z_bottom = Z_center - height / 2  =>  Z_center = groundZ + height / 2.
 * @param groundZ Cao độ mặt đất thực tế (mét)
 * @param height Chiều cao của xe (mét)
 */
export function calculateGroundSnapZ(groundZ: number, height: number): number {
  return Number((groundZ + height / 2).toFixed(3));
}

/**
 * Tính toán bù trừ cao độ Z khi xe nằm trên vỉa hè (Curb / Sidewalk Offset).
 * @param currentZ Tâm Z hiện tại (mét)
 * @param curbOffsetMeters Chiều cao bậc vỉa hè (mặc định +0.15m = 15cm)
 */
export function calculateCurbOffsetZ(currentZ: number, curbOffsetMeters: number = 0.15): number {
  return Number((currentZ + curbOffsetMeters).toFixed(3));
}

/**
 * Tính toán góc nghiêng Roll và độ nâng tâm Z khi xe đỗ gác nửa bánh lên vỉa hè (Half-on-Curb Parking).
 * @param curbHeight Chiều cao vỉa hè (mét, ví dụ 0.15m)
 * @param carWidth Chiều rộng xe (mét, ví dụ 1.85m)
 * @param isLeftOnCurb True nếu 2 bánh bên trái trên vỉa hè, False nếu 2 bánh bên phải
 */
export function calculateHalfCurbRoll(
  curbHeight: number = 0.15,
  carWidth: number = 1.85,
  isLeftOnCurb: boolean = true
): { rollRad: number; rollDeg: number; deltaZ: number } {
  if (carWidth <= 0) {
    return { rollRad: 0, rollDeg: 0, deltaZ: 0 };
  }

  // Góc nghiêng Roll = arcsin(H_curb / Width)
  const ratio = Math.max(-1, Math.min(1, curbHeight / carWidth));
  let rollRad = Math.asin(ratio);
  if (!isLeftOnCurb) {
    rollRad = -rollRad;
  }

  return {
    rollRad: Number(rollRad.toFixed(5)),
    rollDeg: Number(((rollRad * 180) / Math.PI).toFixed(2)),
    deltaZ: Number((curbHeight / 2).toFixed(3)),
  };
}

/**
 * Vi chỉnh cao độ Z từng centimet (Micro-Z adjustment).
 * @param currentZ Tâm Z hiện tại (mét)
 * @param deltaCm Số centimet cần nhích (+1, -1, +5, -5 cm)
 */
export function calculateMicroAdjustZ(currentZ: number, deltaCm: number): number {
  return Number((currentZ + deltaCm / 100).toFixed(3));
}

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
 * Thuật toán Phân Cụm Điểm Liên Tục & Mật Độ (Continuous Density-Connected Clustering):
 * - Dò khoảng cách (gap) giữa các điểm lân cận để tách cụm khi có khoảng trống lớn giữa 2 xe.
 * - Chấm điểm cụm (Cluster Score) kết hợp Số lượng điểm (Mật độ) và Độ gần tâm Box hiện tại.
 * - Loại bỏ 100% điểm của xe khác đỗ bên cạnh hoặc vật cản ngoài lề.
 */
export function filterDenseConnectedCluster1D<T extends { lx: number; ly: number; z: number }>(
  pts: T[],
  axis: "ly" | "lx",
  maxGap: number = 0.22,
  centerBias: number = 0
): T[] {
  // Chỉ kích hoạt phân cụm mật độ khi có đủ số lượng điểm thực tế (tối thiểu 8 điểm)
  if (pts.length < 8) return pts;

  // Sắp xếp các điểm theo tọa độ trục tăng dần
  const sorted = [...pts].sort((a, b) => a[axis] - b[axis]);

  // Nhận diện các cụm bị ngăn cách bởi khoảng trống (Gap > maxGap)
  const clusters: T[][] = [];
  let currentCluster: T[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i][axis] - sorted[i - 1][axis];
    if (gap > maxGap) {
      clusters.push(currentCluster);
      currentCluster = [sorted[i]];
    } else {
      currentCluster.push(sorted[i]);
    }
  }
  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }

  if (clusters.length === 1) {
    return pts;
  }

  // CHỌN CỤM CỦA VẬT THỂ MỤC TIÊU:
  // Vật thể mục tiêu là đối tượng mà annotator đang đặt Box bao quanh (tâm box tại centerBias = 0).
  // Tiêu chí số 1: Khoảng cách tối thiểu từ các điểm trong cụm tới tâm box (minDistanceToCenter).
  // Bất kỳ cụm nào nằm xa tâm box (ở ngoài lề) đều là Object khác đỗ cạnh, tuyệt đối không được chọn!
  let bestCluster = clusters[0];
  let minDistanceToCenter = Infinity;

  for (const c of clusters) {
    if (c.length < 2) continue;

    // Tìm khoảng cách nhỏ nhất từ các điểm trong cụm tới centerBias (tâm box)
    let clusterMinDist = Infinity;
    for (const p of c) {
      const d = Math.abs(p[axis] - centerBias);
      if (d < clusterMinDist) clusterMinDist = d;
    }

    // Cụm nào có điểm nằm gần tâm box nhất sẽ được chọn là xe mục tiêu
    if (clusterMinDist < minDistanceToCenter - 0.05) {
      minDistanceToCenter = clusterMinDist;
      bestCluster = c;
    } else if (Math.abs(clusterMinDist - minDistanceToCenter) <= 0.05) {
      // Nếu khoảng cách tới tâm tương đương nhau, ưu tiên cụm có nhiều điểm hơn
      if (c.length > bestCluster.length) {
        bestCluster = c;
      }
    }
  }

  if (bestCluster.length >= 4) {
    return bestCluster;
  }

  return pts;
}

export interface DensityRobustBoundsResult {
  lxMin: number;
  lxMax: number;
  lyMin: number;
  lyMax: number;
  zTop: number;
  validPointsCount: number;
}

/**
 * Dò tìm biên 1D thích nghi xuất phát từ tâm xe quét ra 2 phía (Center-Outward Adaptive 1D Boundary Detection).
 * Tự động loại bỏ cụm nhiễu bên ngoài (vị trí 2 chấm đỏ) và gương chiếu hậu nhô ra ở sườn xe,
 * đồng thời ngăn chặn tuyệt đối việc ăn sang Object khác đỗ cạnh.
 */
function detectAdaptiveBounds(
  sortedValues: number[],
  isYAxis: boolean = false
): { min: number; max: number } {
  const n = sortedValues.length;
  if (n < 8) {
    return { min: sortedValues[0] ?? 0, max: sortedValues[n - 1] ?? 0 };
  }

  const pMinIdx = Math.max(0, Math.floor(n * 0.005));
  const pMaxIdx = Math.min(n - 1, Math.floor(n * 0.995));
  let minVal = sortedValues[pMinIdx];
  let maxVal = sortedValues[pMaxIdx];

  const minGap = isYAxis ? 0.14 : 0.25;
  const maxNoisePoints = Math.max(2, Math.min(12, Math.floor(n * 0.06)));

  // 1. Quét từ MAX về trung tâm (tìm khoảng hở gap ngăn cách cụm nhiễu/gương ở phía dương)
  for (let i = n - 1; i >= Math.floor(n * 0.65); i--) {
    const gap = sortedValues[i] - sortedValues[i - 1];
    const pointsAfter = n - i;

    if (gap >= minGap && pointsAfter <= maxNoisePoints) {
      maxVal = sortedValues[i - 1];
      break;
    }
  }

  // 2. Quét từ MIN về trung tâm (tìm khoảng hở gap ngăn cách cụm nhiễu ở phía âm)
  for (let i = 0; i <= Math.floor(n * 0.35); i++) {
    const gap = sortedValues[i + 1] - sortedValues[i];
    const pointsBefore = i + 1;

    if (gap >= minGap && pointsBefore <= maxNoisePoints) {
      minVal = sortedValues[i + 1];
      break;
    }
  }

  return {
    min: Number(minVal.toFixed(2)),
    max: Number(maxVal.toFixed(2)),
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
 * Tính toán trọng số cường độ phản xạ (Intensity Weighting) cho danh sách mây điểm:
 * - Điểm có cường độ phản xạ / màu sáng cao (vỏ kim loại xe, biển số, đèn phản quang) được gán trọng số lớn hơn (1.5 ~ 2.5x).
 * - Tự động nhận diện nếu dữ liệu không có intensity hoặc độ biến thiên quá nhỏ để kích hoạt Fallback an toàn (trọng số đồng nhất 1.0).
 */
export function computeIntensityWeights(
  pts: Array<{ intensity?: number }>
): {
  weights: number[];
  hasValidIntensity: boolean;
  highIntensityThreshold: number;
} {
  const n = pts.length;
  if (n === 0) {
    return { weights: [], hasValidIntensity: false, highIntensityThreshold: 0 };
  }

  const intensities: number[] = [];
  let validCount = 0;
  for (let i = 0; i < n; i++) {
    const val = pts[i].intensity;
    if (typeof val === "number" && !isNaN(val)) {
      intensities.push(val);
      validCount++;
    } else {
      intensities.push(0);
    }
  }

  // Nếu không có điểm nào có intensity hợp lệ
  if (validCount < 3) {
    return {
      weights: new Array(n).fill(1.0),
      hasValidIntensity: false,
      highIntensityThreshold: 0,
    };
  }

  const sorted = [...intensities].sort((a, b) => a - b);
  const minI = sorted[0];
  const maxI = sorted[sorted.length - 1];

  // Nếu độ biến thiên intensity quá nhỏ (< 15 đơn vị trên thang 255) -> Không đủ cơ sở để phân tách
  if (maxI - minI < 15) {
    return {
      weights: new Array(n).fill(1.0),
      hasValidIntensity: false,
      highIntensityThreshold: maxI,
    };
  }

  // Ngưỡng điểm sáng (Top 25% điểm có intensity cao nhất)
  const p75Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.75));
  const highIntensityThreshold = Math.max(minI + 15, sorted[p75Idx]);

  const range = maxI - minI;
  const weights: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const norm = Math.max(0, Math.min(1, (intensities[i] - minI) / range));
    // Trọng số chạy từ 1.0 (điểm tối nhất) đến 2.5 (điểm sáng nhất)
    weights[i] = 1.0 + 1.5 * norm;
  }

  return {
    weights,
    hasValidIntensity: true,
    highIntensityThreshold,
  };
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
  for (let b = peakBin + 1; b < numBins; b++) {
    const ptsInBin = bins[b];
    const count = ptsInBin.length;
    const bw = binWeights[b];
    const hasBrightInBin = ptsInBin.some((item) => item.isBright);

    if (count === 0) {
      consecutiveEmptyBins++;
      // Nếu gặp khoảng trống liên tiếp >= 2 bin (>= 6cm): Thung Lũng Mật Độ / Air Gap!
      if (consecutiveEmptyBins >= 2) {
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
      if (consecutiveEmptyBins >= 2) {
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
 * Thuật toán Lọc Nhiễu Thưa Thớt Cận Thân Xe Dựa Trên Mật Độ Lõi Cục Bộ 3D (3D Local Core Density Filtering):
 * - Thân xe ô tô kim loại/kính phản xạ chùm tia LiDAR dày đặc (Local Density D cao).
 * - Nhiễu (tán xạ, hơi nước, bụi, lá cây, vệt phản xạ ẩm, điểm văng từ xe bên cạnh) có thể nằm RẤT SÁT VỎ XE,
 *   nhưng mật độ cục bộ của chúng CỰC KỲ THƯA THỚT (D rất thấp: chỉ 1-2 điểm láng giềng).
 * - Thuật toán tính mật độ cục bộ trong bán kính cầu R (mặc định 0.22m) cho từng điểm.
 * - Loại bỏ triệt để các điểm có mật độ thấp thưa thớt trước khi tính toán mép xe, cản xe hay nóc xe.
 */
export function filterSparseNoiseByLocalDensity<T extends { lx: number; ly: number; z: number }>(
  pts: T[],
  options: {
    radius?: number;
    minCoreNeighbors?: number;
    adaptiveRatio?: number;
  } = {}
): T[] {
  if (pts.length < 8) return pts;

  // Bán kính lân cận phù hợp với bước điểm LiDAR xe (mặc định 0.12m)
  // để loại bỏ triệt để điểm nhiễu thưa thớt sát vỏ xe
  const radius = options.radius ?? 0.12;
  const r2 = radius * radius;
  const n = pts.length;

  // Tính số lượng láng giềng (kể cả chính nó) trong quả cầu bán kính radius cho từng điểm
  const densities = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const pi = pts[i];
    let count = 0;
    for (let j = 0; j < n; j++) {
      const pj = pts[j];
      const dx = pi.lx - pj.lx;
      const dy = pi.ly - pj.ly;
      const dz = pi.z - pj.z;
      if (dx * dx + dy * dy + dz * dz <= r2) {
        count++;
      }
    }
    densities[i] = count;
  }

  // Tính mật độ trung vị (Median Density) của cụm điểm
  const sortedDensities = Array.from(densities).sort((a, b) => a - b);
  const medianDensity = sortedDensities[Math.floor(n / 2)];

  // Ngưỡng lọc mật độ lõi thích nghi (Adaptive Core Density Threshold):
  // Thân xe thường có medianDensity >= 6.
  // Các điểm nhiễu sát sườn thường chỉ có 1-2 láng giềng.
  const adaptiveRatio = options.adaptiveRatio ?? 0.25;
  const userMin = options.minCoreNeighbors ?? 3;
  const coreThreshold = Math.max(userMin, Math.floor(medianDensity * adaptiveRatio));

  const corePts: T[] = [];
  for (let i = 0; i < n; i++) {
    if (densities[i] >= coreThreshold) {
      corePts.push(pts[i]);
    }
  }

  // Đảm bảo an toàn không lọc sạch nếu đám mây quá thưa
  if (corePts.length >= 6 && corePts.length >= n * 0.4) {
    return corePts;
  }

  return pts;
}

/**
 * Thuật toán Dò Tìm Lớp Nóc Xe Thật Thông Qua Đỉnh Mật Độ Lát Cắt Trục Z (Z-Density Roof Layer Detection):
 * - Ưu tiên xử lý phần TOP trước:
 *   Nóc xe ô tô là mặt phẳng ngang rộng lớn song song với mặt sàn, tạo thành một Đỉnh Mật Độ (Z-Density Peak) ở phần trên của xe.
 * - Các điểm nhiễu trên cao (bụi, lá cây, chim bay, dây cáp, bóng ma LiDAR trên không) có cao độ Z > Z_roof nhưng mật độ rất thưa thớt.
 * - Thuật toán kết hợp quét khoảng hở thích nghi và mật độ lát cắt để xác định chính xác cao độ mép trên cùng của vỏ nóc xe (Z_roof_top),
 *   gạt bỏ 100% các điểm nhiễu thưa thớt bên trên.
 */
export function detectRoofTopBounds(
  pts: Array<{ z: number; lx?: number; ly?: number }>,
  expectedRoofZ?: number
): number {
  if (pts.length === 0) return expectedRoofZ ?? 0;

  // Lấy danh sách Z đã lọc và sắp xếp tăng dần
  const zValues = pts.map((p) => p.z).sort((a, b) => a - b);
  const n = zValues.length;

  if (n < 6) {
    return zValues[n - 1];
  }

  // Quét từ điểm cao nhất lùi về để tìm khoảng trống ngăn cách cụm nhiễu trên cao (gap >= 0.22m)
  let maxRoofZ = zValues[n - 1];
  const minGap = 0.22;
  const maxNoisePoints = Math.max(2, Math.min(8, Math.floor(n * 0.08)));

  for (let i = n - 1; i >= Math.floor(n * 0.55); i--) {
    const gap = zValues[i] - zValues[i - 1];
    const pointsAfter = n - i;

    if (gap >= minGap && pointsAfter <= maxNoisePoints) {
      maxRoofZ = zValues[i - 1];
      break;
    }
  }

  return Number(maxRoofZ.toFixed(3));
}

/**
 * Thuật toán Tính Toán Biên Kháng Nhiễu Dựa Trên Mật Độ (Density Robust Bounds):
 * - Lớp 1: Lọc nhiễu mật độ lõi 3D (filterSparseNoiseByLocalDensity) loại bỏ điểm thưa thớt sát thân và điểm lơ lửng.
 * - Lớp 2: Dò nóc xe thật (detectRoofTopBounds) gạt bỏ 100% điểm nhiễu trên cao.
 * - Lớp 3: Quét khoảng hở và mật độ lát cắt (Adaptive Gap & Density Slicing) nhận diện mép vỏ xe thật,
 *          chặn đứng cụm nhiễu bên ngoài (tại 2 chấm đỏ) và loại bỏ gương chiếu hậu nhô ra.
 */
export function computeDensityRobustBounds(
  pts: Array<{ lx: number; ly: number; z: number }>,
  options: {
    rorRadius?: number;
    rorMinNeighbors?: number;
  } = {}
): DensityRobustBoundsResult {
  if (pts.length === 0) {
    return { lxMin: 0, lxMax: 0, lyMin: 0, lyMax: 0, zTop: 0, validPointsCount: 0 };
  }

  // LỚP 1: Lọc nhiễu thưa thớt dựa trên mật độ lõi cục bộ 3D
  const cleanPts = filterSparseNoiseByLocalDensity(pts, {
    radius: options.rorRadius ?? 0.25,
    minCoreNeighbors: options.rorMinNeighbors ?? 2,
  });

  const allLx = cleanPts.map((p) => p.lx).sort((a, b) => a - b);
  const allLy = cleanPts.map((p) => p.ly).sort((a, b) => a - b);

  const fallbackLxMin = allLx[0];
  const fallbackLxMax = allLx[allLx.length - 1];
  const fallbackLyMin = allLy[0];
  const fallbackLyMax = allLy[allLy.length - 1];

  // LỚP 2: Dò lớp nóc xe thật bằng đỉnh mật độ trục Z thay vì lấy Z max tuyệt đối
  const zTop = detectRoofTopBounds(cleanPts);

  if (cleanPts.length < 10) {
    return {
      lxMin: fallbackLxMin,
      lxMax: fallbackLxMax,
      lyMin: fallbackLyMin,
      lyMax: fallbackLyMax,
      zTop,
      validPointsCount: cleanPts.length,
    };
  }

  // LỚP 3: Dò biên thích nghi theo mật độ & khoảng hở trên trục X và Y
  const boundsX = detectAdaptiveBounds(allLx, false);
  const boundsY = detectAdaptiveBounds(allLy, true);

  return {
    lxMin: boundsX.min,
    lxMax: boundsX.max,
    lyMin: boundsY.min,
    lyMax: boundsY.max,
    zTop,
    validPointsCount: cleanPts.length,
  };
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
  pts: Array<{ x: number; y: number; z: number }>,
  cx: number,
  cy: number,
  cz: number,
  yaw: number,
  halfL: number,
  halfW: number,
  ceilingZ?: number,
  options: {
    lockRollFlat?: boolean;
    egoRoadZ?: number;
    egoPos?: { x: number; y: number; z: number };
    halfH?: number;
  } = {}
): GroundSlopeResult {
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
  const isSymmetricBothEnds = Math.abs(nFront20 - nRear20) <= 2 && nFront20 >= 2 && nRear20 >= 2 && nMiddle60 >= 3;

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

  // Lọc cụm liên tục & mật độ: Loại bỏ 100% điểm của xe khác đỗ bên cạnh hoặc nối đuôi
  // Lớp 1: Lọc nhiễu thưa thớt sát thân xe dựa trên mật độ lõi 3D
  const denseCoreBodyPts = filterSparseNoiseByLocalDensity(rawBodyPts, { radius: 0.22, minCoreNeighbors: 2 });

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

  const validBodyPts = bodyPts.length >= 4 ? bodyPts : (denseCoreBodyPts.length >= 4 ? denseCoreBodyPts : rawBodyPts);

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

      // Lọc các điểm thuộc sườn đón tia của vỏ xe thật (loại bỏ người đi bộ bằng thung lũng mật độ)
      const wallDet = detectDominantWallEdgeWithValleyCutoff(
        validBodyPts,
        "ly",
        visibleLateral === "left" ? "positive" : "negative",
        W / 2,
        { minSpanOrthogonal: 0.70 }
      );
      const activePtsForYaw = wallDet.wallPoints.length >= 6 ? wallDet.wallPoints : validBodyPts;

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
      if (leftSidePts.length >= rightSidePts.length + 3) {
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
    finalPitch = 0;
    finalRoll = 0;
    finalPitchDeg = 0;
    finalRollDeg = 0;
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
    pitchRad,
    rollRad,
    pitchDeg,
    rollDeg,
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
    message: msg,
  };
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
  shiftLx?: number;
  shiftLy?: number;
  pointsCount: number;
  step?: "all" | "top" | "side" | "front" | "l" | "w" | "h";
  message: string;
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
  } = {},
  stepParam: "all" | "top" | "side" | "front" | "l" | "w" | "h" = "all"
): PedestrianFitResult {
  const step = options.step ?? stepParam;
  // Đệm nóc đỉnh đầu chuẩn tinh gọn (+5cm theo GEMINI.md), không đệm quá dày làm box vọt lên quá cao
  const headBuffer = options.headBuffer ?? 0.05;
  const margin = options.margin ?? 0.15;

  // 1. Quét mặt đất siêu hẹp sát chân người (R <= 0.45m)
  const footRadius = Math.max(0.35, Math.max(curL, curW) / 2 + margin);
  const footGroundPts: number[] = [];
  const maxFootGroundZ = cz - curH / 2 + 0.35;
  const minFootGroundZ = cz - 4.0;

  for (const p of pts) {
    if (p.z > maxFootGroundZ || p.z < minFootGroundZ) continue;
    const dx = p.x - cx;
    const dy = p.y - cy;
    if (dx * dx + dy * dy <= footRadius * footRadius) {
      footGroundPts.push(p.z);
    }
  }

  let groundZ = cz - curH / 2;
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

  // 3. Phân cụm mật độ tự thích ứng (Adaptive Density-Connected Clustering):
  // - Giảm cắt nhiễu bớt đi: Dùng maxClusteringGap = 0.22m (sparse 0.26m) để không chém đứt curpoint cẳng chân, sải bước hay tay
  const isSparse = rawBodyPts.length <= 12;
  // Giảm cắt nhiễu bớt đi: Nới lỏng gap ở SIDE (trục X) và FRONT (trục Y) để không chém đứt curpoint sải chân, tay hay balo
  const maxGapLy = (step === "front" || isSparse) ? 0.30 : 0.22;
  const maxGapLx = (step === "side" || isSparse) ? 0.32 : 0.22;

  const clusterLy = filterDenseConnectedCluster1D(rawBodyPts, "ly", maxGapLy, 0);
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

    const spanL = (lxMax - lxMin) + 0.05;
    shiftLx = 0;

    if (spanL > 0.78) {
      // Bị Ghosting vệt dài: Khóa trần an toàn L = 0.78m & Ưu tiên cản đón tia Ego
      newL = 0.78;
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
      newL = Number(Math.max(0.35, Math.min(0.78, spanL)).toFixed(2));
      shiftLx = (lxMin + lxMax) / 2;
    }

    shiftLx = Math.max(-0.35, Math.min(0.35, shiftLx));
    newCenterX = Number((cx + shiftLx * Math.cos(yaw)).toFixed(3));
    newCenterY = Number((cy + shiftLx * Math.sin(yaw)).toFixed(3));

    const deltaXSign = shiftLx >= 0 ? "+" : "";
    msg = `Đã fix Chiều Dài (L) Người đi bộ: L=${newL}m (căn tâm X: ${deltaXSign}${(shiftLx * 100).toFixed(1)}cm, kháng ghosting), giữ nguyên W, H & Z`;
  } else if (step === "w") {
    // -------------------------------------------------------------
    // 5. FIX RIÊNG CHIỀU RỘNG W: Co giãn vừa vặn theo vai/ngực & Kháng phình to
    // - Đệm nhẹ +4cm ôm sát thân người
    // - Khi bị Ghosting (> 0.68m): Khóa trần W = 0.68m
    // - Giữ nguyên 100% Chiều dài L, Chiều cao H, Cao độ Z và trục X
    // -------------------------------------------------------------
    newYawRad = yaw;
    newYawDeg = radToDeg(yaw);
    deltaYawDeg = 0;
    newL = curL;
    newH = curH;
    newCenterZ = cz;

    const spanW = (lyMax - lyMin) + 0.04;
    shiftLy = 0;

    if (spanW > 0.68) {
      // Bị Ghosting: Khóa trần an toàn W = 0.68m & Ưu tiên sườn đón tia Ego
      newW = 0.68;
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
      newW = Number(Math.max(0.35, Math.min(0.68, spanW)).toFixed(2));
      shiftLy = (lyMin + lyMax) / 2;
    }

    shiftLy = Math.max(-0.35, Math.min(0.35, shiftLy));
    newCenterX = Number((cx - shiftLy * Math.sin(yaw)).toFixed(3));
    newCenterY = Number((cy + shiftLy * Math.cos(yaw)).toFixed(3));

    const deltaYSign = shiftLy >= 0 ? "+" : "";
    msg = `Đã fix Chiều Rộng (W) Người đi bộ: W=${newW}m (căn tâm Y: ${deltaYSign}${(shiftLy * 100).toFixed(1)}cm, vừa khít vai), giữ nguyên L, H & Z`;
  } else if (step === "h") {
    // -------------------------------------------------------------
    // 6. FIX RIÊNG CHIỀU CAO H: Bám sàn Z_base cố định, nở lên đỉnh đầu gọn gàng
    // - Mặt đáy tiếp đất giữ nguyên cố định 100%
    // - Đỉnh đầu nở lên +5cm đệm nóc tinh gọn (không đệm quá dày làm vọt lên quá cao)
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
    const maxCapPedH = options.headBuffer !== undefined ? 1.95 : 1.78;
    newH = Number(Math.max(1.00, Math.min(maxCapPedH, roofTopZ - effectiveBaseZ)).toFixed(2));
    newCenterZ = Number((effectiveBaseZ + newH / 2).toFixed(3));

    msg = `Đã fix Chiều Cao (H) Người đi bộ: H=${newH}m (Đáy bám sàn Z=${effectiveBaseZ.toFixed(2)}m cố định, nở lên đỉnh đầu +${Math.round(headBuffer * 100)}cm gọn gàng), giữ nguyên L, W & XY`;
  } else {
    // -------------------------------------------------------------
    // 7. CHU TRÌNH TOÀN DIỆN (ALL): 1-Click Smart Fit cho Người
    // -------------------------------------------------------------
    newL = Number(Math.max(0.40, Math.min(0.78, lxMax - lxMin + 0.05)).toFixed(2));
    newW = Number(Math.max(0.38, Math.min(0.68, lyMax - lyMin + 0.04)).toFixed(2));

    roofTopZ = highestPtZ + headBuffer;
    const maxCapPedH = options.headBuffer !== undefined ? 1.95 : 1.78;
    newH = Number(Math.max(1.05, Math.min(maxCapPedH, roofTopZ - groundZ)).toFixed(2));

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

    msg = `Đã fit Người Đi Bộ: ${newL}x${newW}x${newH}m (Khóa thẳng đứng 0°, Ghim đất Z: ${newCenterZ}m, Bù đỉnh đầu +${Math.round(headBuffer * 100)}cm)`;
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
    shiftLx: Number(shiftLx.toFixed(3)),
    shiftLy: Number(shiftLy.toFixed(3)),
    pointsCount: bodyPts.length,
    step,
    message: msg,
  };
}

export interface TwoWheelerFitResult extends PedestrianFitResult {
  newYawRad: number;
  newYawDeg: number;
  deltaYawDeg: number;
  step: "all" | "top" | "side" | "front" | "w" | "h";
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
  } = {},
  stepParam: "all" | "top" | "side" | "front" | "w" | "h" = "all"
): TwoWheelerFitResult {
  const step = options.step ?? stepParam;
  // Đệm nóc xe 2 bánh chuẩn tinh gọn (+5cm theo GEMINI.md), tránh box bị cao lêu nghêu
  const headBuffer = options.headBuffer ?? 0.05;
  const margin = options.margin ?? 0.20;

  // 1. Quét mặt đất vệt bánh xe (R <= curL/2 + margin)
  const footRadius = Math.max(0.60, curL / 2 + margin);
  const groundPts: number[] = [];
  const maxGroundZ = cz - curH / 2 + 0.35;
  const minGroundZ = cz - 4.0;

  for (const p of pts) {
    if (p.z > maxGroundZ || p.z < minGroundZ) continue;
    const dx = p.x - cx;
    const dy = p.y - cy;
    if (dx * dx + dy * dy <= footRadius * footRadius) {
      groundPts.push(p.z);
    }
  }

  let groundZ = cz - curH / 2;
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
  // Giảm cắt nhiễu bớt đi: Dùng maxGapLx = 0.38m ở Side để nối thông lốp trước/sau; maxGapLy = 0.35m ở Front để nối thông gương/tay lái
  const maxGapLx = (step === "side" || isSparse) ? 0.38 : 0.28;
  const maxGapLy = (step === "front" || isSparse) ? 0.35 : 0.24;
  const clusterLy = filterDenseConnectedCluster1D(rawPts, "ly", maxGapLy, 0);
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

    // Kháng Ghosting: Giới hạn trần an toàn W <= 0.85m cho xe 2 bánh (chống bóng ma dãn ngang phình to)
    if (measuredW > 0.85) {
      newW = 0.85;
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
      newW = Number(Math.max(0.55, Math.min(0.85, measuredW)).toFixed(2));
    }
    shiftLy = Math.max(-0.35, Math.min(0.35, shiftLy));

    newCenterX = Number((cx - shiftLy * Math.sin(yaw)).toFixed(3));
    newCenterY = Number((cy + shiftLy * Math.cos(yaw)).toFixed(3));

    const deltaYSign = shiftLy >= 0 ? "+" : "";
    msg = `Đã fit Rộng (W) Xe 2 bánh: W=${newW}m (Đệm +3cm vừa khít gương/tay lái), căn Y: ${deltaYSign}${(shiftLy * 100).toFixed(1)}cm, giữ nguyên L, H & Z`;
  } else if (step === "h") {
    // -------------------------------------------------------------
    // CHẾ ĐỘ FIT RIÊNG CHIỀU CAO H: Bám sàn cố định Z_base, nở lên nóc xe gọn gàng
    // - Mặt đáy tiếp đất Z_base giữ nguyên cố định 100%
    // - Bắt trọn đỉnh nón bảo hiểm / đầu người lái + 5cm đệm nóc (không đệm quá dày làm vọt lên quá cao)
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
    const maxCap2WH = options.headBuffer !== undefined ? 1.85 : 1.68;
    newH = Number(Math.max(1.05, Math.min(maxCap2WH, roofTopZ - effectiveBaseZ)).toFixed(2));
    newCenterZ = Number((effectiveBaseZ + newH / 2).toFixed(3));

    msg = `Đã fit Cao (H) Xe 2 bánh: H=${newH}m (Đáy bám sàn Z=${effectiveBaseZ.toFixed(2)}m cố định, nở lên nóc +${Math.round(headBuffer * 100)}cm gọn gàng), giữ nguyên L, W & XY`;
  } else {
    // -------------------------------------------------------------
    // CHẾ ĐỘ 4: CHU TRÌNH TOÀN DIỆN (TOP ➔ SIDE ➔ FRONT)
    // -------------------------------------------------------------
    // 1. TOP: Xoay Yaw theo trục thân xe
    const headingRes = estimateTwoWheelerHeading(bodyPts, yaw);
    newYawRad = headingRes.newYawRad;
    newYawDeg = headingRes.newYawDeg;
    deltaYawDeg = headingRes.deltaYawDeg;

    // 2. SIDE: Căn cản đón tia X & Ghim đất, Khóa L
    newL = curL; // BẢO TOÀN TUYỆT ĐỐI CHIỀU DÀI L
    shiftLx = 0;
    const frontCount = bodyPts.filter((p) => p.lx > 0).length;
    const rearCount = bodyPts.filter((p) => p.lx <= 0).length;
    if (frontCount > rearCount * 1.5) {
      shiftLx = lxMax - curL / 2;
    } else if (rearCount > frontCount * 1.5) {
      shiftLx = lxMin + curL / 2;
    } else {
      shiftLx = (lxMin + lxMax) / 2;
    }
    shiftLx = Math.max(-0.45, Math.min(0.45, shiftLx));

    // 3. FRONT: Căn ngang Y, linh động W và H
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

    newW = Number(Math.max(0.55, Math.min(0.85, measuredW)).toFixed(2));

    roofTopZ = highestPtZ + headBuffer;
    const maxCap2WH = options.headBuffer !== undefined ? 1.85 : 1.68;
    newH = Number(Math.max(1.05, Math.min(maxCap2WH, roofTopZ - groundZ)).toFixed(2));
    newCenterZ = Number((groundZ + newH / 2).toFixed(3));

    // Tọa độ thế giới kết hợp (xoay theo newYawRad)
    const cosWorld = Math.cos(newYawRad);
    const sinWorld = Math.sin(newYawRad);
    newCenterX = Number((cx + shiftLx * cosWorld - shiftLy * sinWorld).toFixed(3));
    newCenterY = Number((cy + shiftLx * sinWorld + shiftLy * cosWorld).toFixed(3));

    msg = `Đã fit toàn diện Xe 2 bánh: ${newL}x${newW}x${newH}m (Khóa L, Xoay Yaw ${newYawDeg}°, Ghim đất Z: ${newCenterZ}m)`;
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
    shiftLx: Number(shiftLx.toFixed(3)),
    shiftLy: Number(shiftLy.toFixed(3)),
    pointsCount: bodyPts.length,
    step,
    message: msg,
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

// =========================================================================
// CÁC HÀM HÌNH HỌC 3D VÀ MA TRẬN HƯỚNG THEO CHUẨN THREE.JS EULER 'XYZ'
// =========================================================================

export interface Box3D {
  c: [number, number, number]; // [x, y, z] tâm box
  r: [number, number, number]; // [rx, ry, rz] góc xoay Euler XYZ (radian)
  s: [number, number, number]; // [l, w, h] kích thước (mét)
}

/**
 * Chuyển đổi mảng points (16 phần tử của CVAT cuboid) thành đối tượng Box3D.
 */
export function pointsToBox(points: number[]): Box3D {
  return {
    c: [points[0], points[1], points[2]],
    r: [points[3], points[4], points[5]],
    s: [points[6], points[7], points[8]],
  };
}

/**
 * Chuyển đổi đối tượng Box3D thành mảng 16 số points của CVAT.
 */
export function boxToPoints(box: Box3D, basePoints?: number[]): number[] {
  const out = basePoints ? basePoints.slice() : new Array(16).fill(0);
  while (out.length < 16) out.push(0);
  out[0] = Number(box.c[0].toFixed(4));
  out[1] = Number(box.c[1].toFixed(4));
  out[2] = Number(box.c[2].toFixed(4));
  out[3] = Number(box.r[0].toFixed(5));
  out[4] = Number(box.r[1].toFixed(5));
  out[5] = Number(box.r[2].toFixed(5));
  out[6] = Number(box.s[0].toFixed(4));
  out[7] = Number(box.s[1].toFixed(4));
  out[8] = Number(box.s[2].toFixed(4));
  return out;
}

/**
 * Sao chép sâu đối tượng Box3D.
 */
export function cloneBox(box: Box3D): Box3D {
  return {
    c: [box.c[0], box.c[1], box.c[2]],
    r: [box.r[0], box.r[1], box.r[2]],
    s: [box.s[0], box.s[1], box.s[2]],
  };
}

/**
 * Trả về 3 trục cục bộ của box trong toạ độ thế giới (các cột của ma trận quay R = Rx · Ry · Rz).
 */
export function axes(r: [number, number, number] | number[]): {
  ex: [number, number, number];
  ey: [number, number, number];
  ez: [number, number, number];
} {
  const a = Math.cos(r[0]), b = Math.sin(r[0]);
  const c = Math.cos(r[1]), d = Math.sin(r[1]);
  const e = Math.cos(r[2]), f = Math.sin(r[2]);
  const ae = a * e, af = a * f, be = b * e, bf = b * f;
  return {
    ex: [c * e, af + be * d, bf - ae * d],
    ey: [-c * f, ae - bf * d, be + af * d],
    ez: [d, -b * c, a * c],
  };
}

/**
 * Chuyển đổi ma trận quay 3 trục sang góc Euler 'XYZ' (chuẩn Three.js Euler.setFromRotationMatrix).
 */
export function axesToEuler(ax: {
  ex: number[];
  ey: number[];
  ez: number[];
}): [number, number, number] {
  const m11 = ax.ex[0], m12 = ax.ey[0], m13 = ax.ez[0];
  const m22 = ax.ey[1], m23 = ax.ez[1];
  const m32 = ax.ey[2], m33 = ax.ez[2];
  const y = Math.asin(Math.min(1, Math.max(-1, m13)));
  if (Math.abs(m13) < 0.9999999) {
    return [Math.atan2(-m23, m33), y, Math.atan2(-m12, m11)];
  }
  return [Math.atan2(m32, m22), y, 0];
}

/**
 * Quay box quanh trục cục bộ thứ axis (0=x, 1=y, 2=z) một góc angle (radian).
 */
export function rotateLocal(
  r: [number, number, number] | number[],
  axis: number,
  angle: number
): [number, number, number] {
  const ax = axes(r);
  const keys: Array<"ex" | "ey" | "ez"> = ["ex", "ey", "ez"];
  const j = keys[(axis + 1) % 3];
  const k = keys[(axis + 2) % 3];
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const ej = ax[j];
  const ek = ax[k];
  const out = { ...ax };
  out[j] = [0, 1, 2].map((i) => c * ej[i] + s * ek[i]) as [number, number, number];
  out[k] = [0, 1, 2].map((i) => -s * ej[i] + c * ek[i]) as [number, number, number];
  return axesToEuler(out);
}

export const dotVec = (u: number[], v: number[]): number =>
  u[0] * v[0] + u[1] * v[1] + u[2] * v[2];

export const addVec = (u: number[], v: number[]): [number, number, number] => [
  u[0] + v[0],
  u[1] + v[1],
  u[2] + v[2],
];

export const subVec = (u: number[], v: number[]): [number, number, number] => [
  u[0] - v[0],
  u[1] - v[1],
  u[2] - v[2],
];

export const scaleVec = (u: number[], k: number): [number, number, number] => [
  u[0] * k,
  u[1] * k,
  u[2] * k,
];

/**
 * Chuyển tọa độ thế giới (world) sang tọa độ cục bộ (local) của box.
 */
export function worldToLocal(
  p: number[],
  c: number[],
  ax: { ex: number[]; ey: number[]; ez: number[] }
): [number, number, number] {
  const v = subVec(p, c);
  return [dotVec(v, ax.ex), dotVec(v, ax.ey), dotVec(v, ax.ez)];
}

/**
 * Chuyển tọa độ cục bộ (local) của box sang tọa độ thế giới (world).
 */
export function localToWorld(
  q: number[],
  c: number[],
  ax: { ex: number[]; ey: number[]; ez: number[] }
): [number, number, number] {
  return addVec(
    c,
    addVec(
      scaleVec(ax.ex, q[0]),
      addVec(scaleVec(ax.ey, q[1]), scaleVec(ax.ez, q[2]))
    )
  );
}

/**
 * Tính toán tọa độ 8 góc của cuboid 3D trong tọa độ thế giới.
 */
export function boxCorners(box: Box3D): Array<[number, number, number]> {
  const ax = axes(box.r);
  const [hx, hy, hz] = box.s.map((v) => v / 2);
  const out: Array<[number, number, number]> = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        out.push(localToWorld([sx * hx, sy * hy, sz * hz], box.c, ax));
      }
    }
  }
  return out;
}

export const BOX_EDGES: Array<[number, number]> = [
  [0, 1], [2, 3], [4, 5], [6, 7], // dọc z
  [0, 2], [1, 3], [4, 6], [5, 7], // dọc y
  [0, 4], [1, 5], [2, 6], [3, 7], // dọc x
];

/**
 * Thay đổi kích thước box nhưng giữ mặt đáy box (-z cục bộ) đứng yên tuyệt đối.
 */
export function resizeKeepBottom(
  box: Box3D,
  newSize: [number, number, number] | number[]
): Box3D {
  const out = cloneBox(box);
  const ax = axes(box.r);
  const dh = (newSize[2] - box.s[2]) / 2;
  out.c = addVec(box.c, scaleVec(ax.ez, dh));
  out.s = [newSize[0], newSize[1], newSize[2]];
  return out;
}

/**
 * Tìm khoảng chênh lệch góc giữa 2 góc (tính theo độ) trong khoảng [-180, 180] (CVAT object-utils.ts).
 */
export function findAngleDiff(rightAngle: number, leftAngle: number): number {
  let angleDiff = rightAngle - leftAngle;
  angleDiff = ((angleDiff + 180) % 360) - 180;
  if (Math.abs(angleDiff) >= 180) {
    angleDiff = 360 - Math.abs(angleDiff) * Math.sign(angleDiff) * -1;
  }
  return angleDiff;
}

/**
 * Nội suy tuyến tính vị trí 3D giữa 2 keyframes chuẩn theo CuboidTrack.interpolatePosition của cvat-core.
 */
export function interpolatePoints(
  left: number[],
  right: number[],
  offset: number
): number[] {
  const out = left.map((v, i) => v + (right[i] - v) * offset);
  const angles = left
    .slice(3, 6)
    .concat(right.slice(3, 6))
    .map((a) => (a < 0 ? a + Math.PI * 2 : a))
    .map((a) => a * (180 / Math.PI));

  for (let i = 0; i < 3; i++) {
    let angle =
      (angles[i] + findAngleDiff(angles[i + 3], angles[i]) * offset) *
      (Math.PI / 180);
    if (angle > Math.PI) angle -= Math.PI * 2;
    out[3 + i] = angle;
  }
  return out;
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

// =============================================================================
// THUẬT TOÁN TÔ MÀU MÂY ĐIỂM LIDAR (POINT CLOUD COLORIZATION ENGINE)
// =============================================================================

export interface Box3DTarget {
  id?: number | string;
  trackId?: number;
  cx: number;
  cy: number;
  cz: number;
  rx?: number;
  ry?: number;
  rz: number; // yaw rad
  l: number;
  w: number;
  h: number;
  color?: { r: number; g: number; b: number };
  category?: "car" | "pedestrian" | "cyclist" | string;
  isActive?: boolean;
}

export interface PointCloudColorOptions {
  mode: "intensity" | "plain";
  colorizeBoxed: boolean;
  intensityColormap?: "grayscale" | "contrast_boost";
  plainColor?: { r: number; g: number; b: number };
  activeBoxColor?: { r: number; g: number; b: number };
}

/**
 * Kiểm tra siêu nhanh 1 điểm P(x, y, z) có nằm bên trong 3D Bounding Box hay không.
 * Hỗ trợ xoay Yaw và góc dốc Roll/Pitch nếu có.
 */
export function isPointInsideBox3D(
  px: number,
  py: number,
  pz: number,
  box: Box3DTarget
): boolean {
  const dx = px - box.cx;
  const dy = py - box.cy;
  const dz = pz - box.cz;

  // AABB pre-filter: Bán kính bao hình cầu sơ loại 95% điểm ngoài box siêu tốc
  const maxR = Math.max(box.l, box.w, box.h) * 0.75;
  if (Math.abs(dx) > maxR || Math.abs(dy) > maxR || Math.abs(dz) > maxR) {
    return false;
  }

  // Chuyển sang hệ tọa độ cục bộ của Box theo Yaw
  const cosY = Math.cos(-box.rz);
  const sinY = Math.sin(-box.rz);

  let lx = dx * cosY - dy * sinY;
  let ly = dx * sinY + dy * cosY;
  let lz = dz;

  // Xử lý góc dốc Roll / Pitch nếu xe đang đỗ nghiêng hoặc dốc
  if (box.rx || box.ry) {
    const rx = box.rx || 0;
    const ry = box.ry || 0;
    const cosP = Math.cos(-ry);
    const sinP = Math.sin(-ry);
    const lx2 = lx * cosP + lz * sinP;
    const lz2 = -lx * sinP + lz * cosP;

    const cosR = Math.cos(-rx);
    const sinR = Math.sin(-rx);
    const ly2 = ly * cosR - lz2 * sinR;
    const lz3 = ly * sinR + lz2 * cosR;

    lx = lx2;
    ly = ly2;
    lz = lz3;
  }

  const halfL = box.l / 2;
  const halfW = box.w / 2;
  const halfH = box.h / 2;

  return Math.abs(lx) <= halfL && Math.abs(ly) <= halfW && Math.abs(lz) <= halfH;
}

// Bảng màu mặc định theo nhãn xe
export const DEFAULT_LABEL_COLORS: Record<string, { r: number; g: number; b: number }> = {
  car: { r: 0.96, g: 0.62, b: 0.04 },        // Cam hổ phách ấm (#f59e0b)
  pedestrian: { r: 0.51, g: 0.55, b: 0.97 }, // Xanh tím Indigo (#818cf8)
  cyclist: { r: 0.06, g: 0.73, b: 0.51 },    // Xanh lục Emerald (#10b981)
  truck: { r: 0.94, g: 0.38, b: 0.57 },      // Hồng Ruby (#f43f5e)
  bus: { r: 0.65, g: 0.43, b: 0.95 },        // Tím tím Purple (#a855f7)
  active: { r: 0.98, g: 0.80, b: 0.08 },     // Vàng chanh Neon (#facc15)
};

// Bảng 32 màu phân kỳ tương phản cao (High-Contrast Vivid Palette) cho từng Track ID
export const DISTINCT_TRACK_PALETTE: Array<{ r: number; g: number; b: number }> = [
  { r: 0.00, g: 0.95, b: 1.00 }, // 0: Cyan Neon (#00f2fe)
  { r: 0.96, g: 0.62, b: 0.04 }, // 1: Vàng Cam Amber (#f59e0b)
  { r: 0.66, g: 0.33, b: 0.97 }, // 2: Tím Violet (#a855f7)
  { r: 0.06, g: 0.73, b: 0.51 }, // 3: Xanh Lục Emerald (#10b981)
  { r: 0.93, g: 0.28, b: 0.60 }, // 4: Hồng Sen Neon (#ec4899)
  { r: 0.23, g: 0.51, b: 0.96 }, // 5: Xanh Biển Electric Blue (#3b82f6)
  { r: 0.52, g: 0.80, b: 0.09 }, // 6: Xanh Chuối Chartreuse (#84cc16)
  { r: 0.98, g: 0.57, b: 0.24 }, // 7: Cam San Hô Coral (#fb923c)
  { r: 0.08, g: 0.72, b: 0.65 }, // 8: Xanh Ngọc Lục Bảo Teal (#14b8a6)
  { r: 0.92, g: 0.70, b: 0.03 }, // 9: Vàng Gold (#eab308)
  { r: 0.39, g: 0.40, b: 0.95 }, // 10: Tím Indigo (#6366f1)
  { r: 0.20, g: 0.83, b: 0.60 }, // 11: Xanh Lục Mint (#34d399)
  { r: 0.85, g: 0.27, b: 0.94 }, // 12: Hồng Tím Fuchsia (#d946ef)
  { r: 0.22, g: 0.74, b: 0.97 }, // 13: Xanh Trời Sky (#38bdf8)
  { r: 0.98, g: 0.45, b: 0.09 }, // 14: Cam Đỏ Nhẹ Warm Orange (#f97316)
  { r: 0.13, g: 0.77, b: 0.37 }, // 15: Xanh Lá Spring Green (#22c55e)
  { r: 0.75, g: 0.52, b: 0.99 }, // 16: Tím Lavender (#c084fc)
  { r: 0.02, g: 0.71, b: 0.83 }, // 17: Xanh Biển Aqua (#06b6d4)
  { r: 0.98, g: 0.44, b: 0.52 }, // 18: Hồng Phấn Rose (#fb7185)
  { r: 0.64, g: 0.90, b: 0.21 }, // 19: Vàng Chanh Lemon Lime (#a3e635)
  { r: 0.40, g: 0.91, b: 0.98 }, // 20: Xanh Băng Glacier (#67e8f9)
  { r: 0.99, g: 0.73, b: 0.45 }, // 21: Cam Nắng Peach (#fdba74)
  { r: 0.58, g: 0.20, b: 0.92 }, // 22: Tím Orchid (#9333ea)
  { r: 0.09, g: 0.64, b: 0.29 }, // 23: Xanh Clover (#16a34a)
  { r: 0.96, g: 0.25, b: 0.37 }, // 24: Hồng Magenta (#f43f5e)
  { r: 0.15, g: 0.39, b: 0.92 }, // 25: Xanh Sapphire (#2563eb)
  { r: 0.05, g: 0.58, b: 0.53 }, // 26: Xanh Ngọc Jade (#0d9488)
  { r: 0.85, g: 0.47, b: 0.02 }, // 27: Vàng Hổ Phách Đậm (#d97706)
  { r: 0.31, g: 0.27, b: 0.90 }, // 28: Xanh Cobalt (#4f46e5)
  { r: 0.13, g: 0.83, b: 0.93 }, // 29: Xanh Cyan Sáng (#22d3ee)
  { r: 0.96, g: 0.45, b: 0.71 }, // 30: Hồng Pink Light (#f472b6)
  { r: 0.29, g: 0.87, b: 0.50 }, // 31: Xanh Táo Apple Green (#4ade80)
];

// Màu đỏ neon cảnh báo phát sáng khi có từ 2 box trở lên chồng lấn (Overlap Warning)
export const OVERLAP_WARNING_COLOR = { r: 1.0, g: 0.05, b: 0.20 }; // Đỏ Neon Rực Lửa (#ff0d33)

/**
 * Trích xuất màu sắc riêng biệt (Distinct Color) tương ứng với từng Track ID.
 * - Sử dụng hàm băm số nguyên tố 13 để hai ID cạnh nhau (VD 16 và 17) luôn nhảy xa nhau trên bảng màu.
 * - Khi Active: Đẩy sáng rực rỡ (Full Brightness) kết hợp pha nhẹ ánh vàng neon để nổi bật mà không mất nhận diện track.
 */
export function getDistinctTrackColor(
  trackId: number | string | undefined | null,
  isActive?: boolean
): { r: number; g: number; b: number } {
  let numId = 0;
  if (typeof trackId === "number") {
    numId = Math.abs(trackId);
  } else if (typeof trackId === "string") {
    const parsed = parseInt(trackId, 10);
    if (!isNaN(parsed)) {
      numId = Math.abs(parsed);
    } else {
      for (let i = 0; i < trackId.length; i++) {
        numId = (numId * 31 + trackId.charCodeAt(i)) & 0x7fffffff;
      }
    }
  }

  const colorIndex = (numId * 13 + 7) % DISTINCT_TRACK_PALETTE.length;
  const baseColor = DISTINCT_TRACK_PALETTE[colorIndex];

  if (isActive) {
    // Khi Active: Tăng sáng rực rỡ pha nhẹ 20% ánh vàng chanh neon (#facc15)
    return {
      r: Math.min(1.0, baseColor.r * 0.8 + 0.98 * 0.2),
      g: Math.min(1.0, baseColor.g * 0.8 + 0.80 * 0.2),
      b: Math.min(1.0, baseColor.b * 0.8 + 0.08 * 0.2),
    };
  }

  return baseColor;
}

/**
 * Tính toán mảng màu Float32Array (RGB) cho toàn bộ mây điểm LiDAR.
 * - Mode 'intensity': Hiển thị theo độ phản xạ (Intensity) với vạch sơn sáng rực.
 * - Mode 'plain': Hiển thị đồng màu xám bạc sáng rõ khối, không xét intensity.
 * - colorizeBoxed: Điểm nằm trong bất kỳ 3D box nào sẽ được nhuộm màu riêng theo Track ID.
 * - OVERLAP WARNING: Điểm nằm trong vùng giao nhau từ 2..N box sẽ phát sáng ĐỎ NEON RỰC LỬA (#ff0d33).
 */
export function computePointCloudColors(
  positions: Float32Array | number[],
  intensities: Float32Array | number[] | null | undefined,
  boxes: Box3DTarget[],
  options: PointCloudColorOptions,
  outColors?: Float32Array
): Float32Array {
  const count = Math.floor(positions.length / 3);
  const colors = outColors && outColors.length === count * 3 ? outColors : new Float32Array(count * 3);

  const isPlainMode = options.mode === "plain";
  const colorizeBoxed = options.colorizeBoxed !== false && boxes.length > 0;
  const plainR = options.plainColor?.r ?? 0.72;
  const plainG = options.plainColor?.g ?? 0.76;
  const plainB = options.plainColor?.b ?? 0.82;

  // Tiền xử lý thông tin các Box để tăng tốc độ kiểm tra Point-in-Box
  interface FastBox {
    cx: number;
    cy: number;
    cz: number;
    rx: number;
    ry: number;
    rz: number;
    cosY: number;
    sinY: number;
    halfL: number;
    halfW: number;
    halfH: number;
    maxR: number;
    colorR: number;
    colorG: number;
    colorB: number;
  }

  const fastBoxes: FastBox[] = [];
  if (colorizeBoxed) {
    for (const b of boxes) {
      if (!b || b.l <= 0 || b.w <= 0 || b.h <= 0) continue;
      const cosY = Math.cos(-b.rz);
      const sinY = Math.sin(-b.rz);
      const maxR = Math.max(b.l, b.w, b.h) * 0.75;

      let c = b.color;
      if (!c) {
        const boxId = b.trackId ?? b.id;
        if (boxId !== undefined && boxId !== null) {
          c = getDistinctTrackColor(boxId, b.isActive);
        } else if (b.isActive) {
          c = DEFAULT_LABEL_COLORS.active;
        } else {
          const cat = (b.category || "car").toLowerCase();
          c = DEFAULT_LABEL_COLORS[cat] || DEFAULT_LABEL_COLORS.car;
        }
      }

      fastBoxes.push({
        cx: b.cx,
        cy: b.cy,
        cz: b.cz,
        rx: b.rx || 0,
        ry: b.ry || 0,
        rz: b.rz,
        cosY,
        sinY,
        halfL: b.l / 2,
        halfW: b.w / 2,
        halfH: b.h / 2,
        maxR,
        colorR: c.r,
        colorG: c.g,
        colorB: c.b,
      });
    }
  }

  const numBoxes = fastBoxes.length;

  for (let i = 0; i < count; i++) {
    const idx3 = i * 3;
    const px = positions[idx3];
    const py = positions[idx3 + 1];
    const pz = positions[idx3 + 2];

    // Lấy giá trị Intensity chuẩn hóa v in [0, 1]
    let v = 0.5;
    if (intensities && i < intensities.length) {
      const rawInt = intensities[i];
      v = rawInt <= 1.0 ? rawInt : Math.min(1.0, rawInt / 255);
    }

    // 1. Kiểm tra điểm có nằm trong 3D Box nào không (Hỗ trợ phát hiện Overlap 2..N box)
    let matchedBox: FastBox | null = null;
    let matchCount = 0;

    if (numBoxes > 0) {
      for (let k = 0; k < numBoxes; k++) {
        const b = fastBoxes[k];
        const dx = px - b.cx;
        const dy = py - b.cy;
        const dz = pz - b.cz;

        // AABB pre-filter
        if (Math.abs(dx) > b.maxR || Math.abs(dy) > b.maxR || Math.abs(dz) > b.maxR) {
          continue;
        }

        let lx = dx * b.cosY - dy * b.sinY;
        let ly = dx * b.sinY + dy * b.cosY;
        let lz = dz;

        if (b.rx || b.ry) {
          const cosP = Math.cos(-b.ry);
          const sinP = Math.sin(-b.ry);
          const lx2 = lx * cosP + lz * sinP;
          const lz2 = -lx * sinP + lz * cosP;

          const cosR = Math.cos(-b.rx);
          const sinR = Math.sin(-b.rx);
          const ly2 = ly * cosR - lz2 * sinR;
          const lz3 = ly * sinR + lz2 * cosR;

          lx = lx2;
          ly = ly2;
          lz = lz3;
        }

        if (Math.abs(lx) <= b.halfL && Math.abs(ly) <= b.halfW && Math.abs(lz) <= b.halfH) {
          matchCount++;
          if (matchCount === 1) {
            matchedBox = b;
          } else {
            // Đã phát hiện Overlap từ 2 box trở lên! Early Exit siêu tốc
            matchedBox = null;
            break;
          }
        }
      }
    }

    if (matchCount >= 2) {
      // VÙNG CHỒNG LẤN TỪ 2 ĐẾN N BOX: ĐỎ NEON CẢNH BÁO (#ff0d33) SÁNG RỰC RỠ FULL BRIGHTNESS
      colors[idx3] = OVERLAP_WARNING_COLOR.r;
      colors[idx3 + 1] = OVERLAP_WARNING_COLOR.g;
      colors[idx3 + 2] = OVERLAP_WARNING_COLOR.b;
    } else if (matchedBox) {
      // ĐIỂM NẰM TRONG 1 XE BỌC DUY NHẤT: Nhuộm màu riêng biệt theo Track ID
      const factor = isPlainMode ? 0.90 : 0.40 + 0.60 * v;
      colors[idx3] = matchedBox.colorR * factor;
      colors[idx3 + 1] = matchedBox.colorG * factor;
      colors[idx3 + 2] = matchedBox.colorB * factor;
    } else {
      // ĐIỂM NGOÀI XE BỌC:
      if (isPlainMode) {
        // Chế độ Plain: màu xám bạc sáng rõ hình khối đồng nhất
        colors[idx3] = plainR;
        colors[idx3 + 1] = plainG;
        colors[idx3 + 2] = plainB;
      } else {
        // Chế độ Intensity (Mặc định):
        // Điểm phản xạ cao (>0.65, vạch sơn, biển báo) sáng rực rỡ
        const boostV = Math.min(1.0, v * 1.25);
        if (v >= 0.70) {
          // Vạch sơn phản quang rực rỡ ánh vàng nhẹ
          colors[idx3] = 1.0;
          colors[idx3 + 1] = 0.96;
          colors[idx3 + 2] = 0.50 + 0.50 * boostV;
        } else {
          // Grayscale contrast
          colors[idx3] = boostV;
          colors[idx3 + 1] = boostV;
          colors[idx3 + 2] = boostV;
        }
      }
    }
  }

  return colors;
}

// Xuất các hàm hình học quan trọng ra toàn cục phòng vệ 100% chống lỗi undefined
if (typeof globalThis !== "undefined") {
  (globalThis as any).boxCorners = boxCorners;
  (globalThis as any).BOX_EDGES = BOX_EDGES;
  (globalThis as any).fitBoxToEgoRayAndGround = fitBoxToEgoRayAndGround;
  (globalThis as any).fitPedestrianBox = fitPedestrianBox;
  (globalThis as any).fitPedestrianLength = fitPedestrianLength;
  (globalThis as any).fitPedestrianWidth = fitPedestrianWidth;
  (globalThis as any).fitPedestrianHeight = fitPedestrianHeight;
  (globalThis as any).fitCyclistBox = fitCyclistBox;
  (globalThis as any).fitTwoWheelerBox = fitTwoWheelerBox;
  (globalThis as any).estimateTwoWheelerHeading = estimateTwoWheelerHeading;
  (globalThis as any).estimateEgoRoadGroundZ = estimateEgoRoadGroundZ;
  (globalThis as any).detectTrueHeadZ = detectTrueHeadZ;
  (globalThis as any).computeGroundSlopesAndZ = computeGroundSlopesAndZ;
  (globalThis as any).fitYawToLaneIntensity = fitYawToLaneIntensity;
  (globalThis as any).isPointInsideBox3D = isPointInsideBox3D;
  (globalThis as any).computePointCloudColors = computePointCloudColors;
  (globalThis as any).DISTINCT_TRACK_PALETTE = DISTINCT_TRACK_PALETTE;
  (globalThis as any).OVERLAP_WARNING_COLOR = OVERLAP_WARNING_COLOR;
  (globalThis as any).getDistinctTrackColor = getDistinctTrackColor;
}
if (typeof window !== "undefined") {
  (window as any).boxCorners = boxCorners;
  (window as any).BOX_EDGES = BOX_EDGES;
  (window as any).fitBoxToEgoRayAndGround = fitBoxToEgoRayAndGround;
  (window as any).fitPedestrianBox = fitPedestrianBox;
  (window as any).fitPedestrianLength = fitPedestrianLength;
  (window as any).fitPedestrianWidth = fitPedestrianWidth;
  (window as any).fitPedestrianHeight = fitPedestrianHeight;
  (window as any).fitCyclistBox = fitCyclistBox;
  (window as any).fitTwoWheelerBox = fitTwoWheelerBox;
  (window as any).estimateTwoWheelerHeading = estimateTwoWheelerHeading;
  (window as any).estimateEgoRoadGroundZ = estimateEgoRoadGroundZ;
  (window as any).detectTrueHeadZ = detectTrueHeadZ;
  (window as any).computeGroundSlopesAndZ = computeGroundSlopesAndZ;
  (window as any).fitYawToLaneIntensity = fitYawToLaneIntensity;
  (window as any).isPointInsideBox3D = isPointInsideBox3D;
  (window as any).computePointCloudColors = computePointCloudColors;
  (window as any).DISTINCT_TRACK_PALETTE = DISTINCT_TRACK_PALETTE;
  (window as any).OVERLAP_WARNING_COLOR = OVERLAP_WARNING_COLOR;
  (window as any).getDistinctTrackColor = getDistinctTrackColor;
}


