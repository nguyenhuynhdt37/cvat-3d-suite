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

  const localPts: Array<{ lx: number; ly: number; z: number }> = [];
  for (const p of bodyPoints) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const lx = dx * cosY - dy * sinY;
    const ly = dx * sinY + dy * cosY;
    localPts.push({ lx, ly, z: p.z });
  }

  const allLx = localPts.map((p) => p.lx).sort((a, b) => a - b);
  const allLy = localPts.map((p) => p.ly).sort((a, b) => a - b);
  const allZ = localPts.map((p) => p.z).sort((a, b) => a - b);

  // Lọc 1% outlier cạnh biên
  const pMinIdx = Math.floor(localPts.length * 0.01);
  const pMaxIdx = Math.min(localPts.length - 1, Math.floor(localPts.length * 0.99));

  const lxMin = allLx[pMinIdx];
  const lxMax = allLx[pMaxIdx];
  const lyMin = allLy[pMinIdx];
  const lyMax = allLy[pMaxIdx];
  const zTop = allZ[pMaxIdx];

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
 * Thuật toán Tính Toán Độ Dốc Mặt Đường 3D (Pitch Dọc & Roll Ngang):
 * Hồi quy mặt phẳng mặt đường z = a * lx + b * ly + c0 từ các điểm LiDAR vành đai xung quanh xe.
 * Giải quyết triệt để hiện tượng đáy xe bị lệch mặt đất ở cả Front View và Side View.
 */
export function computeGroundSlopesAndZ(
  pts: Array<{ x: number; y: number; z: number }>,
  cx: number,
  cy: number,
  cz: number,
  yaw: number,
  halfL: number,
  halfW: number,
  ceilingZ?: number
): {
  groundZ: number | null;
  pitchRad: number;
  rollRad: number;
  pitchDeg: number;
  rollDeg: number;
  groundPointsCount: number;
} {
  const cosY = Math.cos(-yaw);
  const sinY = Math.sin(-yaw);

  const outerL = halfL + 1.4;
  const outerW = halfW + 1.4;
  const innerL = Math.max(0.3, halfL - 0.2);
  const innerW = Math.max(0.3, halfW - 0.2);
  const maxZ = ceilingZ !== undefined ? ceilingZ : cz + 0.35;

  const groundPts: Array<{ lx: number; ly: number; z: number }> = [];

  for (const p of pts) {
    if (p.z > maxZ) continue;
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

  // Fallback nếu vành đai ít điểm
  if (groundPts.length < 6) {
    for (const p of pts) {
      if (p.z > maxZ) continue;
      const dx = p.x - cx;
      const dy = p.y - cy;
      if (dx * dx + dy * dy <= outerL * outerL) {
        const lx = dx * cosY - dy * sinY;
        const ly = dx * sinY + dy * cosY;
        groundPts.push({ lx, ly, z: p.z });
      }
    }
  }

  if (groundPts.length < 4) {
    return {
      groundZ: null,
      pitchRad: 0,
      rollRad: 0,
      pitchDeg: 0,
      rollDeg: 0,
      groundPointsCount: groundPts.length,
    };
  }

  // Sắp xếp theo cao độ Z tăng dần và lấy 40% điểm thấp nhất làm mặt đất chuẩn
  groundPts.sort((a, b) => a.z - b.z);
  const lowestPts = groundPts.slice(0, Math.max(4, Math.floor(groundPts.length * 0.4)));

  // Hồi quy tuyến tính OLS mặt phẳng: z = a * lx + b * ly + c0
  let sumLx = 0;
  let sumLy = 0;
  let sumZ = 0;
  const N = lowestPts.length;

  for (const p of lowestPts) {
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

  for (const p of lowestPts) {
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

  if (Math.abs(det) > 1e-4) {
    const a = (covLxZ * varLy - covLyZ * covLxLy) / det;
    const b = (covLyZ * varLx - covLxZ * covLxLy) / det;

    // Giới hạn độ dốc mặt đường thực tế: Pitch tối đa 20°, Roll tối đa 25°
    // Trong Three.js hệ trục Z-Up, quay quanh trục Y có z'\'' = -x*sin(ry) nên góc Pitch = -atan(a) để mũi xe ngóc lên theo đường dốc
    const maxPitchRad = (20 * Math.PI) / 180;
    const maxRollRad = (25 * Math.PI) / 180;

    pitchRad = Math.max(-maxPitchRad, Math.min(maxPitchRad, -Math.atan(a)));
    rollRad = Math.max(-maxRollRad, Math.min(maxRollRad, Math.atan(b)));

    // Cao độ đáy tại tâm (lx = 0, ly = 0)
    c0 = meanZ - a * meanLx - b * meanLy;
  } else {
    // Nếu không giải được OLS, lấy phân vị 8%
    const p8Idx = Math.floor(lowestPts.length * 0.2);
    c0 = lowestPts[p8Idx].z;
  }

  return {
    groundZ: Number(c0.toFixed(3)),
    pitchRad: Number(pitchRad.toFixed(5)),
    rollRad: Number(rollRad.toFixed(5)),
    pitchDeg: Number(((pitchRad * 180) / Math.PI).toFixed(2)),
    rollDeg: Number(((rollRad * 180) / Math.PI).toFixed(2)),
    groundPointsCount: lowestPts.length,
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

  const localPts: Array<{ lx: number; ly: number; z: number }> = [];
  for (const p of bodyPoints) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const lx = dx * cosY - dy * sinY;
    const ly = dx * sinY + dy * cosY;
    localPts.push({ lx, ly, z: p.z });
  }

  const allLx = localPts.map((p) => p.lx).sort((a, b) => a - b);
  const allLy = localPts.map((p) => p.ly).sort((a, b) => a - b);

  // Lọc 2% outlier cực biên
  const pMinIdx = Math.max(0, Math.floor(localPts.length * 0.02));
  const pMaxIdx = Math.min(localPts.length - 1, Math.floor(localPts.length * 0.98));

  const lxMin = allLx[pMinIdx];
  const lxMax = allLx[pMaxIdx];
  const lyMin = allLy[pMinIdx];
  const lyMax = allLy[pMaxIdx];

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
  const margin = opts.margin ?? 1.2;
  const below = opts.below ?? 1.0;
  const above = opts.above ?? 0.6;
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

  // Fallback mở rộng margin 2.5m nếu điểm quá thưa ở xa cảm biến
  if (margin < 2.0 && xyz.length >= 3) {
    return estimateGround(xyz, box, { ...opts, margin: 2.5, minPoints: 3 });
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

// Xuất các hàm hình học quan trọng ra toàn cục phòng vệ 100% chống lỗi undefined
if (typeof globalThis !== "undefined") {
  (globalThis as any).boxCorners = boxCorners;
  (globalThis as any).BOX_EDGES = BOX_EDGES;
}
if (typeof window !== "undefined") {
  (window as any).boxCorners = boxCorners;
  (window as any).BOX_EDGES = BOX_EDGES;
}


