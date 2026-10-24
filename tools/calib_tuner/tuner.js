/**
 * ==============================================================================
 * CVAT 3D STANDALONE CALIBRATION TUNER ENGINE (WITH AUTO-OPTIMIZER)
 * ==============================================================================
 * - Day14 Projection Engine: eulerXYZ -> boxCorners -> ego -> cam -> distort -> pixel
 * - Real-time matrix generation: makeEgo2Cam(yaw, pitch, roll, tx, ty, tz)
 * - Two-way sync: Sliders <-> Inputs <-> Canvas Rendering (60 FPS)
 * - AI Auto-Fit Optimizer: Coordinate Descent / Simplex (Tự tính toán hiệu chuẩn)
 * - Shift + Drag Target Box: Kéo khung vàng để máy tự động hút wireframe vào xe!
 * ==============================================================================
 */

// ==============================================================================
// 1. DAY14 PROJECTION MATHEMATICS
// ==============================================================================

const NEAR_Z = 0.1;
const EDGE_STEPS = 16;

const D14_UNIT = [
  [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5], [-0.5, -0.5, -0.5],
  [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, -0.5, 0.5],
];

const D14_EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

const FRONT_SET = new Set(["0-1", "1-5", "5-4", "4-0", "1-0", "5-1", "4-5", "0-4"]);

function eulerXYZ(rx, ry, rz) {
  const [cx, sx, cy, sy, cz, sz] = [
    Math.cos(rx), Math.sin(rx), Math.cos(ry),
    Math.sin(ry), Math.cos(rz), Math.sin(rz)
  ];
  return [
    [cy * cz, -cy * sz, sy],
    [sx * sy * cz + cx * sz, -sx * sy * sz + cx * cz, -sx * cy],
    [-cx * sy * cz + sx * sz, cx * sy * sz + sx * cz, cx * cy],
  ];
}

function d14BoxCorners(position, rotation, scale) {
  const R = eulerXYZ(rotation[0], rotation[1], rotation[2]);
  return D14_UNIT.map((u) => {
    const p = [u[0] * scale[0], u[1] * scale[1], u[2] * scale[2]];
    return [0, 1, 2].map((r) => R[r][0] * p[0] + R[r][1] * p[1] + R[r][2] * p[2] + position[r]);
  });
}

function d14Transform(p, T) {
  return [0, 1, 2].map((r) => T[r][0] * p[0] + T[r][1] * p[1] + T[r][2] * p[2] + T[r][3]);
}

function d14DistCoeffs(dist) {
  const d = [0, 0, 0, 0, 0];
  (dist || []).slice(0, 5).forEach((v, i) => { d[i] = Number(v); });
  return d;
}

function d14RadialFoldR2(dist) {
  const d = d14DistCoeffs(dist);
  const c = [1.0, 3.0 * d[0], 5.0 * d[1], 7.0 * d[4]];
  let deg = 3;
  while (deg > 0 && c[deg] === 0.0) deg -= 1;
  if (deg === 0) return Infinity;
  const g = (s) => c[0] + s * (c[1] + s * (c[2] + s * c[3]));
  let top = 0.0;
  for (let i = 0; i < deg; i += 1) top = Math.max(top, Math.abs(c[i]));
  const bound = 1.0 + top / Math.abs(c[deg]);
  let crit = [];
  const [qa, qb, qc] = [3.0 * c[3], 2.0 * c[2], c[1]];
  if (qa !== 0.0) {
    const disc = qb * qb - 4.0 * qa * qc;
    if (disc >= 0.0) {
      const sq = Math.sqrt(disc);
      crit = [(-qb - sq) / (2.0 * qa), (-qb + sq) / (2.0 * qa)];
    }
  } else if (qb !== 0.0) {
    crit = [-qc / qb];
  }
  const knots = [0.0, bound, ...crit.filter((s) => s > 0.0 && s < bound)].sort((x, y) => x - y);
  for (let k = 0; k + 1 < knots.length; k += 1) {
    let [lo, hi] = [knots[k], knots[k + 1]];
    if (g(hi) > 0.0) continue;
    for (let it = 0; it < 200; it += 1) {
      const mid = 0.5 * (lo + hi);
      if (mid <= lo || mid >= hi) break;
      if (g(mid) > 0.0) lo = mid; else hi = mid;
    }
    return lo;
  }
  return Infinity;
}

function d14MaxR2(cam) {
  if (cam._foldR2 === undefined) cam._foldR2 = d14RadialFoldR2(cam.dist || []);
  return cam._foldR2;
}

function d14DistortToPixel(xn, yn, cam) {
  const [k1, k2, p1, p2, k3] = d14DistCoeffs(cam.dist);
  const r2 = xn * xn + yn * yn;
  const radial = 1 + k1 * r2 + k2 * r2 * r2 + k3 * r2 * r2 * r2;
  const xd = xn * radial + 2 * p1 * xn * yn + p2 * (r2 + 2 * xn * xn);
  const yd = yn * radial + p1 * (r2 + 2 * yn * yn) + 2 * p2 * xn * yn;
  return [cam.K[0][0] * xd + cam.K[0][2], cam.K[1][1] * yd + cam.K[1][2]];
}

function d14ClipEdgeView(a, b, m) {
  if (a[2] <= NEAR_Z && b[2] <= NEAR_Z) return null;
  let [t0, t1] = [0.0, 1.0];
  if (a[2] <= NEAR_Z || b[2] <= NEAR_Z) {
    const t = (NEAR_Z - a[2]) / (b[2] - a[2]);
    if (a[2] > NEAR_Z) t1 = t; else t0 = t;
  }
  if (m === Infinity) return [t0, t1];
  const [dx, dy, dz] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const qa = dx * dx + dy * dy - m * dz * dz;
  const qb = 2.0 * (a[0] * dx + a[1] * dy - m * a[2] * dz);
  const qc = a[0] * a[0] + a[1] * a[1] - m * a[2] * a[2];
  let roots = [];
  if (qa !== 0.0) {
    const disc = qb * qb - 4.0 * qa * qc;
    if (disc >= 0.0) {
      const sq = Math.sqrt(disc);
      crit = [(-qb - sq) / (2.0 * qa), (-qb + sq) / (2.0 * qa)];
    }
  } else if (qb !== 0.0) {
    crit = [-qc / qb];
  }
  const knots = [t0, t1, ...roots.filter((r) => r > t0 && r < t1)].sort((x, y) => x - y);
  const inside = [];
  for (let k = 0; k + 1 < knots.length; k += 1) {
    const mid = 0.5 * (knots[k] + knots[k + 1]);
    if ((qa * mid + qb) * mid + qc <= 0.0) inside.push([knots[k], knots[k + 1]]);
  }
  if (!inside.length || inside[inside.length - 1][1] <= inside[0][0]) return null;
  return [inside[0][0], inside[inside.length - 1][1]];
}

function d14EdgePolyline(a, b, cam) {
  const span = d14ClipEdgeView(a, b, d14MaxR2(cam));
  if (!span) return null;
  const [t0, t1] = span;
  const pts = [];
  for (let k = 0; k <= EDGE_STEPS; k += 1) {
    const t = t0 + (t1 - t0) * k / EDGE_STEPS;
    const p = [0, 1, 2].map((i) => a[i] + t * (b[i] - a[i]));
    pts.push(d14DistortToPixel(p[0] / p[2], p[1] / p[2], cam));
  }
  return pts;
}

// ==============================================================================
// 2. EXTRINSICS SYNTHESIS & DECOMPOSITION
// ==============================================================================

function makeEgo2Cam(yawDeg, pitchDeg, rollDeg, tx, ty, tz) {
  const y = (yawDeg * Math.PI) / 180;
  const p = (pitchDeg * Math.PI) / 180;
  const r = (rollDeg * Math.PI) / 180;

  let cz = [
    Math.cos(y) * Math.cos(p),
    Math.sin(y) * Math.cos(p),
    Math.sin(p)
  ];
  const normZ = Math.hypot(cz[0], cz[1], cz[2]);
  cz = [cz[0] / normZ, cz[1] / normZ, cz[2] / normZ];

  const downEgo = [0, 0, -1];
  const dotDown = downEgo[0] * cz[0] + downEgo[1] * cz[1] + downEgo[2] * cz[2];
  let cy = [
    downEgo[0] - dotDown * cz[0],
    downEgo[1] - dotDown * cz[1],
    downEgo[2] - dotDown * cz[2]
  ];
  const normY = Math.hypot(cy[0], cy[1], cy[2]);
  cy = normY < 1e-6 ? [0, 1, 0] : [cy[0] / normY, cy[1] / normY, cy[2] / normY];

  let cx = [
    cy[1] * cz[2] - cy[2] * cz[1],
    cy[2] * cz[0] - cy[0] * cz[2],
    cy[0] * cz[1] - cy[1] * cz[0]
  ];
  const normX = Math.hypot(cx[0], cx[1], cx[2]);
  cx = [cx[0] / normX, cx[1] / normX, cx[2] / normX];

  const cosR = Math.cos(r);
  const sinR = Math.sin(r);
  const cxR = [
    cosR * cx[0] + sinR * cy[0],
    cosR * cx[1] + sinR * cy[1],
    cosR * cx[2] + sinR * cy[2]
  ];
  const cyR = [
    -sinR * cx[0] + cosR * cy[0],
    -sinR * cx[1] + cosR * cy[1],
    -sinR * cx[2] + cosR * cy[2]
  ];

  const pos = [tx, ty, tz];
  const tvec = [
    -(cxR[0] * pos[0] + cxR[1] * pos[1] + cxR[2] * pos[2]),
    -(cyR[0] * pos[0] + cyR[1] * pos[1] + cyR[2] * pos[2]),
    -(cz[0] * pos[0] + cz[1] * pos[1] + cz[2] * pos[2])
  ];

  return [
    [cxR[0], cxR[1], cxR[2], tvec[0]],
    [cyR[0], cyR[1], cyR[2], tvec[1]],
    [cz[0], cz[1], cz[2], tvec[2]],
    [0, 0, 0, 1]
  ];
}

function decomposeEgo2Cam(M) {
  const R = [
    [M[0][0], M[0][1], M[0][2]],
    [M[1][0], M[1][1], M[1][2]],
    [M[2][0], M[2][1], M[2][2]]
  ];
  const t = [M[0][3], M[1][3], M[2][3]];

  const tx = -(R[0][0] * t[0] + R[1][0] * t[1] + R[2][0] * t[2]);
  const ty = -(R[0][1] * t[0] + R[1][1] * t[1] + R[2][1] * t[2]);
  const tz = -(R[0][2] * t[0] + R[1][2] * t[1] + R[2][2] * t[2]);

  const cz = [R[2][0], R[2][1], R[2][2]];
  const yawRad = Math.atan2(cz[1], cz[0]);
  const pitchRad = Math.asin(Math.max(-1, Math.min(1, cz[2])));

  const downEgo = [0, 0, -1];
  const dotDown = downEgo[0] * cz[0] + downEgo[1] * cz[1] + downEgo[2] * cz[2];
  let cy0 = [
    downEgo[0] - dotDown * cz[0],
    downEgo[1] - dotDown * cz[1],
    downEgo[2] - dotDown * cz[2]
  ];
  const normY = Math.hypot(cy0[0], cy0[1], cy0[2]);
  cy0 = normY < 1e-6 ? [0, 1, 0] : [cy0[0] / normY, cy0[1] / normY, cy0[2] / normY];

  let cx0 = [
    cy0[1] * cz[2] - cy0[2] * cz[1],
    cy0[2] * cz[0] - cy0[0] * cz[2],
    cy0[0] * cz[1] - cy0[1] * cz[0]
  ];
  const normX = Math.hypot(cx0[0], cx0[1], cx0[2]);
  cx0 = [cx0[0] / normX, cx0[1] / normX, cx0[2] / normX];

  const actualCx = [R[0][0], R[0][1], R[0][2]];
  const dotCx = cx0[0] * actualCx[0] + cx0[1] * actualCx[1] + cx0[2] * actualCx[2];
  const crossCx = [
    cx0[1] * actualCx[2] - cx0[2] * actualCx[1],
    cx0[2] * actualCx[0] - cx0[0] * actualCx[2],
    cx0[0] * actualCx[1] - cx0[1] * actualCx[0]
  ];
  const rollSign = (crossCx[0] * cz[0] + crossCx[1] * cz[1] + crossCx[2] * cz[2]) >= 0 ? 1 : -1;
  const rollRad = rollSign * Math.acos(Math.max(-1, Math.min(1, dotCx)));

  return {
    yaw: (yawRad * 180) / Math.PI,
    pitch: (pitchRad * 180) / Math.PI,
    roll: (rollRad * 180) / Math.PI,
    tx,
    ty,
    tz
  };
}

// ==============================================================================
// 3. BASE CALIBRATION DEFAULTS
// ==============================================================================

const SENSOR2EGO_DEFAULT = [
  [0.999848, -0.017452, 0.0, 0.0],
  [0.017452, 0.999848, 0.0, 0.0],
  [0.0, 0.0, 1.0, 0.0],
  [0.0, 0.0, 0.0, 1.0]
];

const INITIAL_CAMERAS = {
  "CAM_P_FR": {
    name: "CAM_P_FR",
    label: "0: Trước Phải (~40°)",
    index: 0,
    image_size: [1920, 1536],
    K: [[1842.50, 0, 953.85], [0, 1842.31, 780.73], [0, 0, 1]],
    dist: [-0.4946, 0.2545, -0.0026, -0.0011, -0.0788],
    ego2cam: makeEgo2Cam(-40.0, 1.0, 0.0, 0.80, -0.35, 1.77)
  },
  "CAM_P_F": {
    name: "CAM_P_F",
    label: "1: Trước Chính Diện (Ground Truth ⭐)",
    index: 1,
    image_size: [1920, 1536],
    K: [[1842.5042844353281, 0, 953.8468015854089], [0, 1842.3052782411678, 780.7314324894343], [0, 0, 1]],
    dist: [-0.494617, 0.254457, -0.002633, -0.001096, -0.078763],
    ego2cam: [
      [-0.001396, -0.999929, 0.011868, -0.019678],
      [0.020751, -0.011894, -0.999714, 1.755513],
      [0.999784, -0.001149, 0.020766, -1.047623],
      [0.0, 0.0, 0.0, 1.0]
    ]
  },
  "CAM_P_FL": {
    name: "CAM_P_FL",
    label: "2: Trước Trái (~40°)",
    index: 2,
    image_size: [1920, 1536],
    K: [[1842.50, 0, 953.85], [0, 1842.31, 780.73], [0, 0, 1]],
    dist: [-0.4946, 0.2545, -0.0026, -0.0011, -0.0788],
    ego2cam: makeEgo2Cam(40.0, 1.0, 0.0, 0.80, 0.35, 1.77)
  },
  "CAM_P_FW": {
    name: "CAM_P_FW",
    label: "3: Trước Fisheye (Siêu Rộng 180°)",
    index: 3,
    image_size: [1920, 1536],
    K: [[700.0, 0, 960.0], [0, 700.0, 768.0], [0, 0, 1]],
    dist: [-0.35, 0.12, -0.001, -0.001, -0.02],
    ego2cam: makeEgo2Cam(0.0, 5.0, 0.0, 0.90, 0.0, 1.80)
  },
  "CAM_P_BL": {
    name: "CAM_P_BL",
    label: "4: Sau Trái (~140°)",
    index: 4,
    image_size: [1920, 1536],
    K: [[1050.0, 0, 960.0], [0, 1050.0, 768.0], [0, 0, 1]],
    dist: [-0.38, 0.15, -0.002, -0.001, -0.04],
    ego2cam: makeEgo2Cam(140.0, 3.0, 0.0, -0.40, 0.35, 1.77)
  },
  "CAM_P_SR": {
    name: "CAM_P_SR",
    label: "5: Sườn Phải (~-90°)",
    index: 5,
    image_size: [1920, 1536],
    K: [[1050.0, 0, 960.0], [0, 1050.0, 768.0], [0, 0, 1]],
    dist: [-0.38, 0.15, -0.002, -0.001, -0.04],
    ego2cam: makeEgo2Cam(-90.0, 3.0, 0.0, 0.0, -0.45, 1.77)
  },
  "CAM_P_B": {
    name: "CAM_P_B",
    label: "6: Sau Chính Diện (180°)",
    index: 6,
    image_size: [1920, 1536],
    K: [[1050.0, 0, 960.0], [0, 1050.0, 768.0], [0, 0, 1]],
    dist: [-0.38, 0.15, -0.002, -0.001, -0.04],
    ego2cam: makeEgo2Cam(180.0, 5.0, 0.0, -0.70, 0.0, 1.77)
  },
  "CAM_P_BR": {
    name: "CAM_P_BR",
    label: "7: Sau Phải (~-140°)",
    index: 7,
    image_size: [1920, 1536],
    K: [[1050.0, 0, 960.0], [0, 1050.0, 768.0], [0, 0, 1]],
    dist: [-0.38, 0.15, -0.002, -0.001, -0.04],
    ego2cam: makeEgo2Cam(-140.0, 3.0, 0.0, -0.40, -0.35, 1.77)
  }
};

// ==============================================================================
// 4. AUTO-CALIBRATION OPTIMIZER (TỰ ĐỘNG TÍNH TOÁN HIỆU CHUẨN)
// ==============================================================================

class CalibrationOptimizer {
  /**
   * Tính bounding box 2D và tâm của một 3D box khi chiếu qua camera cấu hình hiện tại
   */
  static getProjected2DBound(box, cam, sensor2ego) {
    const cornersLidar = d14BoxCorners(box.c, box.r, box.s);
    const cornersCam = cornersLidar.map((p) => {
      const ego = d14Transform(p, sensor2ego);
      return d14Transform(ego, cam.ego2cam);
    });

    const [W, H] = cam.image_size;
    const maxR2 = d14MaxR2(cam);
    const validPts = [];

    for (const pc of cornersCam) {
      if (pc[2] <= NEAR_Z) continue;
      const xn = pc[0] / pc[2];
      const yn = pc[1] / pc[2];
      if (xn * xn + yn * yn > maxR2) continue;
      const [u, v] = d14DistortToPixel(xn, yn, cam);
      validPts.push([u, v]);
    }

    if (validPts.length < 4) return null;

    const us = validPts.map((p) => p[0]);
    const vs = validPts.map((p) => p[1]);
    const minU = Math.min(...us);
    const maxU = Math.max(...us);
    const minV = Math.min(...vs);
    const maxV = Math.max(...vs);

    return {
      minU, maxU, minV, maxV,
      width: maxU - minU,
      height: maxV - minV,
      centerX: (minU + maxU) / 2,
      centerY: (minV + maxV) / 2
    };
  }

  /**
   * Tính hàm mất mát (Loss) giữa BBox dự đoán và Target BBox được người dùng chỉ định
   */
  static evaluateLoss(pred, target) {
    if (!pred) return 999999.0;

    // 1. Sai số tâm (Center distance error)
    const dX = pred.centerX - target.centerX;
    const dY = pred.centerY - target.centerY;
    const centerErr = Math.hypot(dX, dY);

    // 2. Sai số kích thước (Width & Height error)
    const wErr = Math.abs(pred.width - target.width);
    const hErr = Math.abs(pred.height - target.height);
    const sizeErr = wErr + hErr;

    // 3. IoU (Intersection over Union)
    const interX1 = Math.max(pred.minU, target.minU);
    const interY1 = Math.max(pred.minV, target.minV);
    const interX2 = Math.min(pred.maxU, target.maxU);
    const interY2 = Math.min(pred.maxV, target.maxV);
    const interW = Math.max(0, interX2 - interX1);
    const interH = Math.max(0, interY2 - interY1);
    const interArea = interW * interH;
    const areaA = pred.width * pred.height;
    const areaB = target.width * target.height;
    const unionArea = areaA + areaB - interArea;
    const iou = unionArea > 0 ? interArea / unionArea : 0;

    // Loss tổng hợp (càng nhỏ càng khớp)
    return centerErr * 1.5 + sizeErr * 0.8 + (1.0 - iou) * 300.0;
  }

  /**
   * Thuật toán tối ưu hóa đa biến Adaptive Coordinate Descent (chạy trực tiếp trong browser)
   */
  static async optimizeCamera(app, box, targetBBox, onProgress) {
    const cam = app.getCurrentCam();
    let currentDecomp = decomposeEgo2Cam(cam.ego2cam);
    let currentFx = cam.K[0][0];

    // Các tham số tối ưu và bước nhảy
    // Giai đoạn 1: Coarse search (dò thô góc Yaw và Pitch để bắt tâm)
    const params = {
      yaw: currentDecomp.yaw,
      pitch: currentDecomp.pitch,
      roll: currentDecomp.roll,
      tx: currentDecomp.tx,
      fx: currentFx
    };

    const evalParams = (p) => {
      const M = makeEgo2Cam(p.yaw, p.pitch, p.roll, p.tx, currentDecomp.ty, currentDecomp.tz);
      const testCam = {
        K: [[p.fx, 0, cam.K[0][2]], [0, p.fx, cam.K[1][2]], [0, 0, 1]],
        dist: cam.dist,
        image_size: cam.image_size,
        ego2cam: M
      };
      delete testCam._foldR2;
      const pred = CalibrationOptimizer.getProjected2DBound(box, testCam, app.sensor2ego);
      return CalibrationOptimizer.evaluateLoss(pred, targetBBox);
    };

    let bestLoss = evalParams(params);
    let step = 0;
    const maxSteps = 120;

    // Lưới bước nhảy biến thiên
    const deltas = [
      { key: "yaw", steps: [3.0, 1.0, 0.2, 0.05] },
      { key: "pitch", steps: [1.5, 0.5, 0.1, 0.03] },
      { key: "roll", steps: [1.0, 0.3, 0.05] },
      { key: "fx", steps: [50.0, 15.0, 3.0] }
    ];

    for (const dConfig of deltas) {
      for (const dVal of dConfig.steps) {
        let improved = true;
        let localIter = 0;

        while (improved && localIter < 15) {
          improved = false;
          localIter++;

          // Thử đi tới (+)
          params[dConfig.key] += dVal;
          let lossPlus = evalParams(params);
          if (lossPlus < bestLoss) {
            bestLoss = lossPlus;
            improved = true;
          } else {
            // Thử đi lùi (-)
            params[dConfig.key] -= dVal * 2;
            let lossMinus = evalParams(params);
            if (lossMinus < bestLoss) {
              bestLoss = lossMinus;
              improved = true;
            } else {
              // Khôi phục giá trị cũ
              params[dConfig.key] += dVal;
            }
          }

          step++;
          if (step % 4 === 0) {
            // Cập nhật UI và animation
            cam.ego2cam = makeEgo2Cam(params.yaw, params.pitch, params.roll, params.tx, currentDecomp.ty, currentDecomp.tz);
            cam.K[0][0] = params.fx;
            cam.K[1][1] = params.fx;
            delete cam._foldR2;

            app.syncControlsFromCam();
            app.render();

            if (onProgress) {
              const fitScore = Math.max(0, Math.min(100, Math.round(100 - bestLoss / 5)));
              onProgress(step, maxSteps, bestLoss, fitScore);
            }
            await new Promise((r) => setTimeout(r, 12)); // Cho phép trình duyệt render khung hình
          }
        }
      }
    }

    // Áp dụng kết quả tối ưu cuối cùng
    cam.ego2cam = makeEgo2Cam(params.yaw, params.pitch, params.roll, params.tx, currentDecomp.ty, currentDecomp.tz);
    cam.K[0][0] = params.fx;
    cam.K[1][1] = params.fx;
    delete cam._foldR2;

    app.syncControlsFromCam();
    app.saveToStorage();
    app.render();

    const finalScore = Math.max(0, Math.min(100, Math.round(100 - bestLoss / 5)));
    return { loss: bestLoss, score: finalScore };
  }
}

// ==============================================================================
// 5. APPLICATION STATE & CONTROLLER
// ==============================================================================

class CalibrationTunerApp {
  constructor() {
    this.currentFrame = 0;
    this.currentCamKey = "CAM_P_F";
    this.selectedTrackId = null;
    this.annotations = null;
    this.labels = {};
    this.cameras = JSON.parse(JSON.stringify(INITIAL_CAMERAS));
    this.sensor2ego = JSON.parse(JSON.stringify(SENSOR2EGO_DEFAULT));

    // Canvas & Zoom/Pan state
    this.canvas = document.getElementById("viewportCanvas");
    this.ctx = this.canvas.getContext("2d");
    this.img = new Image();
    this.imgLoaded = false;
    this.zoom = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.isDragging = false;
    this.lastMouse = { x: 0, y: 0 };

    // Target Box Drag state (Shift + Drag hoặc chế độ Target)
    this.isDrawingTarget = false;
    this.targetBoxStart = null;
    this.targetBBox = null; // { minU, maxU, minV, maxV, centerX, centerY, width, height }
    this.isOptimizing = false;

    this.loadFromStorage();
    this.bindEvents();
    this.loadData();
  }

  loadFromStorage() {
    try {
      const saved = localStorage.getItem("CVAT_CALIB_TUNER_DATA");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.cameras) {
          for (const k in parsed.cameras) {
            if (this.cameras[k]) {
              this.cameras[k] = parsed.cameras[k];
            }
          }
        }
      }
    } catch (_) {}
  }

  saveToStorage() {
    try {
      localStorage.setItem("CVAT_CALIB_TUNER_DATA", JSON.stringify({
        cameras: this.cameras
      }));
    } catch (_) {}
  }

  async loadData() {
    try {
      const lblRes = await fetch("data/labels.json");
      if (lblRes.ok) {
        const lblData = await lblRes.json();
        for (const item of lblData.results || []) {
          this.labels[item.id] = item;
        }
      }

      const annoRes = await fetch("data/annotations.json");
      if (annoRes.ok) {
        this.annotations = await annoRes.json();
        this.renderTrackList();
      }

      this.updateCamButtons();
      this.syncControlsFromCam();
      this.loadCurrentImage();
    } catch (e) {
      console.error("Lỗi khi load dữ liệu ban đầu:", e);
    }
  }

  loadCurrentImage() {
    const cam = this.cameras[this.currentCamKey];
    const imagePath = `data/frames/frame_${this.currentFrame}/image_${cam.index}.jpg`;
    this.imgLoaded = false;
    this.img = new Image();
    this.img.onload = () => {
      this.imgLoaded = true;
      this.render();
    };
    this.img.onerror = () => {
      console.warn("Không tìm thấy ảnh:", imagePath);
      this.render();
    };
    this.img.src = imagePath;
  }

  getCurrentCam() {
    return this.cameras[this.currentCamKey];
  }

  syncControlsFromCam() {
    const cam = this.getCurrentCam();
    const decomp = decomposeEgo2Cam(cam.ego2cam);

    this.setVal("inpYaw", decomp.yaw.toFixed(2));
    this.setVal("rngYaw", decomp.yaw);
    this.setVal("inpPitch", decomp.pitch.toFixed(2));
    this.setVal("rngPitch", decomp.pitch);
    this.setVal("inpRoll", decomp.roll.toFixed(2));
    this.setVal("rngRoll", decomp.roll);

    this.setVal("inpTx", decomp.tx.toFixed(2));
    this.setVal("rngTx", decomp.tx);
    this.setVal("inpTy", decomp.ty.toFixed(2));
    this.setVal("rngTy", decomp.ty);
    this.setVal("inpTz", decomp.tz.toFixed(2));
    this.setVal("rngTz", decomp.tz);

    this.setVal("inpFx", cam.K[0][0].toFixed(1));
    this.setVal("rngFx", cam.K[0][0]);
    this.setVal("inpFy", cam.K[1][1].toFixed(1));
    this.setVal("rngFy", cam.K[1][1]);
    this.setVal("inpCx", cam.K[0][2].toFixed(1));
    this.setVal("inpCy", cam.K[1][2].toFixed(1));

    const dist = d14DistCoeffs(cam.dist);
    this.setVal("inpK1", dist[0].toFixed(4));
    this.setVal("rngK1", dist[0]);
    this.setVal("inpK2", dist[1].toFixed(4));
    this.setVal("rngK2", dist[1]);
    this.setVal("inpP1", dist[2].toFixed(4));
    this.setVal("inpP2", dist[3].toFixed(4));
    this.setVal("inpK3", dist[4].toFixed(4));

    const lblCam = document.getElementById("lblCurrentCam");
    if (lblCam) lblCam.textContent = `${cam.label}`;
    delete cam._foldR2;
  }

  setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
  }

  getFloat(id) {
    const el = document.getElementById(id);
    return el ? parseFloat(el.value) || 0 : 0;
  }

  onControlChange(sourceId) {
    if (sourceId.startsWith("rng")) {
      const inpId = "inp" + sourceId.slice(3);
      const val = this.getFloat(sourceId);
      this.setVal(inpId, val);
    } else if (sourceId.startsWith("inp")) {
      const rngId = "rng" + sourceId.slice(3);
      const val = this.getFloat(sourceId);
      this.setVal(rngId, val);
    }

    const lockFocal = document.getElementById("chkLockFocal")?.checked;
    if (lockFocal && (sourceId === "rngFx" || sourceId === "inpFx")) {
      const fx = this.getFloat("inpFx");
      this.setVal("inpFy", fx);
      this.setVal("rngFy", fx);
    }

    const yaw = this.getFloat("inpYaw");
    const pitch = this.getFloat("inpPitch");
    const roll = this.getFloat("inpRoll");
    const tx = this.getFloat("inpTx");
    const ty = this.getFloat("inpTy");
    const tz = this.getFloat("inpTz");

    const fx = this.getFloat("inpFx");
    const fy = this.getFloat("inpFy");
    const cx = this.getFloat("inpCx");
    const cy = this.getFloat("inpCy");

    const k1 = this.getFloat("inpK1");
    const k2 = this.getFloat("inpK2");
    const p1 = this.getFloat("inpP1");
    const p2 = this.getFloat("inpP2");
    const k3 = this.getFloat("inpK3");

    const cam = this.getCurrentCam();
    cam.ego2cam = makeEgo2Cam(yaw, pitch, roll, tx, ty, tz);
    cam.K = [
      [fx, 0, cx],
      [0, fy, cy],
      [0, 0, 1]
    ];
    cam.dist = [k1, k2, p1, p2, k3];
    delete cam._foldR2;

    this.saveToStorage();
    this.render();
  }

  // Chuyển đổi tọa độ từ Client Window sang Tọa Độ Pixel Ảnh gốc (1920x1536)
  clientToImagePixel(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const mouseCanvasX = clientX - rect.left;
    const mouseCanvasY = clientY - rect.top;

    // Đảo ngược zoom và pan
    const imgX = (mouseCanvasX - this.panX) / this.zoom;
    const imgY = (mouseCanvasY - this.panY) / this.zoom;

    // Giới hạn trong vùng ảnh 1920x1536
    return [
      Math.max(0, Math.min(1920, imgX)),
      Math.max(0, Math.min(1536, imgY))
    ];
  }

  bindEvents() {
    const controlIds = [
      "Yaw", "Pitch", "Roll", "Tx", "Ty", "Tz",
      "Fx", "Fy", "Cx", "Cy", "K1", "K2", "P1", "P2", "K3"
    ];
    for (const name of controlIds) {
      const inp = document.getElementById("inp" + name);
      const rng = document.getElementById("rng" + name);
      if (inp) inp.addEventListener("input", () => this.onControlChange("inp" + name));
      if (rng) rng.addEventListener("input", () => this.onControlChange("rng" + name));
    }

    // Mouse Down: Phân biệt giữa vẽ Target Box (khi giữ Shift hoặc bật mode) và Pan
    this.canvas.addEventListener("mousedown", (e) => {
      const isShift = e.shiftKey || document.getElementById("chkTargetMode")?.checked;
      if (isShift) {
        this.isDrawingTarget = true;
        const [u, v] = this.clientToImagePixel(e.clientX, e.clientY);
        this.targetBoxStart = { u, v };
        this.targetBBox = null;
      } else {
        this.isDragging = true;
        this.lastMouse = { x: e.clientX, y: e.clientY };
      }
    });

    window.addEventListener("mouseup", () => {
      if (this.isDrawingTarget) {
        this.isDrawingTarget = false;
        if (this.targetBBox && this.targetBBox.width > 20 && this.targetBBox.height > 20) {
          document.getElementById("btnAutoFit")?.removeAttribute("disabled");
          document.getElementById("btnAutoFit")?.classList.remove("opacity-50", "cursor-not-allowed");
          const statusEl = document.getElementById("lblAutoFitStatus");
          if (statusEl) {
            statusEl.textContent = `🎯 Đã chọn vùng xe mục tiêu (${Math.round(this.targetBBox.width)}x${Math.round(this.targetBBox.height)}px). Bấm Auto-Fit!`;
            statusEl.className = "text-amber-600 font-bold text-xs";
          }
        }
      }
      this.isDragging = false;
    });

    this.canvas.addEventListener("mousemove", (e) => {
      if (this.isDrawingTarget && this.targetBoxStart) {
        const [u, v] = this.clientToImagePixel(e.clientX, e.clientY);
        const minU = Math.min(this.targetBoxStart.u, u);
        const maxU = Math.max(this.targetBoxStart.u, u);
        const minV = Math.min(this.targetBoxStart.v, v);
        const maxV = Math.max(this.targetBoxStart.v, v);
        this.targetBBox = {
          minU, maxU, minV, maxV,
          width: maxU - minU,
          height: maxV - minV,
          centerX: (minU + maxU) / 2,
          centerY: (minV + maxV) / 2
        };
        this.render();
      } else if (this.isDragging) {
        this.panX += e.clientX - this.lastMouse.x;
        this.panY += e.clientY - this.lastMouse.y;
        this.lastMouse = { x: e.clientX, y: e.clientY };
        this.render();
      }
    });

    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
      const newZoom = Math.max(0.2, Math.min(10.0, this.zoom * zoomFactor));

      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      this.panX = mouseX - (mouseX - this.panX) * (newZoom / this.zoom);
      this.panY = mouseY - (mouseY - this.panY) * (newZoom / this.zoom);
      this.zoom = newZoom;
      this.render();
      this.updateZoomLabel();
    });

    // Reset View
    document.getElementById("btnResetView")?.addEventListener("click", () => {
      this.zoom = 1.0;
      this.panX = 0;
      this.panY = 0;
      this.render();
      this.updateZoomLabel();
    });

    // Reset Camera
    document.getElementById("btnResetCam")?.addEventListener("click", () => {
      if (confirm(`Khôi phục camera ${this.currentCamKey} về giá trị mặc định ban đầu?`)) {
        this.cameras[this.currentCamKey] = JSON.parse(JSON.stringify(INITIAL_CAMERAS[this.currentCamKey]));
        this.syncControlsFromCam();
        this.saveToStorage();
        this.render();
      }
    });

    // Copy JSON
    document.getElementById("btnCopyJson")?.addEventListener("click", () => {
      const cam = this.getCurrentCam();
      const data = {
        K: cam.K,
        dist: cam.dist,
        ego2cam: cam.ego2cam,
        image_size: cam.image_size
      };
      navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      alert(`Đã copy cấu hình ${this.currentCamKey} vào Clipboard!`);
    });

    // Export All
    document.getElementById("btnExportAll")?.addEventListener("click", () => {
      const output = {
        pcd_frame: "lidar",
        lidar: { sensor2ego: this.sensor2ego },
        cameras: {}
      };
      for (const [k, c] of Object.entries(this.cameras)) {
        output.cameras[k] = {
          K: c.K,
          dist: c.dist,
          ego2cam: c.ego2cam,
          image_size: c.image_size
        };
      }
      const blob = new Blob([JSON.stringify(output, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "calib_diagnostic.json";
      a.click();
      URL.revokeObjectURL(url);
    });

    // Frame selection buttons
    const frameBtns = document.querySelectorAll(".btn-frame");
    frameBtns.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        frameBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.currentFrame = parseInt(btn.dataset.frame, 10);
        this.targetBBox = null;
        this.loadCurrentImage();
      });
    });

    // Toggles
    ["chkShowVertices", "chkShowLabels"].forEach((id) => {
      document.getElementById(id)?.addEventListener("change", () => this.render());
    });

    // Nút Clear Target Box
    document.getElementById("btnClearTarget")?.addEventListener("click", () => {
      this.targetBBox = null;
      document.getElementById("btnAutoFit")?.setAttribute("disabled", "true");
      document.getElementById("btnAutoFit")?.classList.add("opacity-50", "cursor-not-allowed");
      document.getElementById("lblAutoFitStatus").textContent = "Giữ Shift và kéo chuột để vẽ khung xe";
      document.getElementById("lblAutoFitStatus").className = "text-slate-500 text-xs";
      this.render();
    });

    // Nút Kích Hoạt Auto-Fit
    document.getElementById("btnAutoFit")?.addEventListener("click", async () => {
      if (this.isOptimizing) return;
      if (!this.targetBBox) {
        alert("Vui lòng giữ phím SHIFT và kéo chuột trên ảnh để vẽ khung xe mục tiêu trước!");
        return;
      }
      if (!this.selectedTrackId) {
        // Tự động chọn xe gần nhất với Target Box nếu chưa chọn
        this.selectClosestTrackToTarget();
      }
      if (!this.selectedTrackId) {
        alert("Không tìm thấy xe 3D nào ở frame hiện tại!");
        return;
      }

      await this.runAutoFit();
    });
  }

  selectClosestTrackToTarget() {
    if (!this.annotations || !this.targetBBox) return;
    let closestTrack = null;
    let minDist = Infinity;
    const cam = this.getCurrentCam();

    for (const track of this.annotations.tracks || []) {
      const shape = track.shapes.find((s) => s.frame === this.currentFrame);
      if (!shape) continue;
      const pts = shape.points;
      const box = { c: pts.slice(0, 3), r: pts.slice(3, 6), s: pts.slice(6, 9) };
      const pred = CalibrationOptimizer.getProjected2DBound(box, cam, this.sensor2ego);
      if (pred) {
        const d = Math.hypot(pred.centerX - this.targetBBox.centerX, pred.centerY - this.targetBBox.centerY);
        if (d < minDist) {
          minDist = d;
          closestTrack = track.id;
        }
      }
    }

    if (closestTrack !== null) {
      this.selectedTrackId = closestTrack;
      this.renderTrackList();
    }
  }

  async runAutoFit() {
    const track = this.annotations.tracks.find((t) => t.id === this.selectedTrackId);
    if (!track) return;
    const shape = track.shapes.find((s) => s.frame === this.currentFrame);
    if (!shape) return;

    const pts = shape.points;
    const box = {
      c: pts.slice(0, 3),
      r: pts.slice(3, 6),
      s: pts.slice(6, 9),
      trackId: track.id,
      labelId: track.label_id
    };

    this.isOptimizing = true;
    const btn = document.getElementById("btnAutoFit");
    const statusEl = document.getElementById("lblAutoFitStatus");
    if (btn) btn.classList.add("animate-pulse");

    statusEl.textContent = "⚡ AI Đang tính toán ma trận tối ưu...";
    statusEl.className = "text-blue-600 font-bold text-xs";

    try {
      const result = await CalibrationOptimizer.optimizeCamera(this, box, this.targetBBox, (step, max, loss, score) => {
        statusEl.textContent = `⚡ Bước ${step}/${max} (Độ khớp: ${score}%, Loss: ${Math.round(loss)})`;
      });

      statusEl.textContent = `🎉 Hoàn tất! Độ khớp: ${result.score}% (Loss: ${Math.round(result.loss)})`;
      statusEl.className = "text-emerald-600 font-bold text-xs";
    } catch (err) {
      console.error(err);
      statusEl.textContent = "Lỗi khi tối ưu: " + err.message;
      statusEl.className = "text-red-600 font-bold text-xs";
    } finally {
      this.isOptimizing = false;
      if (btn) btn.classList.remove("animate-pulse");
    }
  }

  updateZoomLabel() {
    const el = document.getElementById("lblZoom");
    if (el) el.textContent = `${Math.round(this.zoom * 100)}%`;
  }

  updateCamButtons() {
    const container = document.getElementById("camButtonsContainer");
    if (!container) return;
    container.innerHTML = "";

    for (const [key, cam] of Object.entries(this.cameras)) {
      const btn = document.createElement("button");
      btn.className = `px-3 py-1.5 text-xs font-semibold rounded border transition ${
        key === this.currentCamKey
          ? "bg-blue-600 text-white border-blue-600 shadow"
          : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
      }`;
      btn.textContent = cam.name + (key === "CAM_P_F" ? " ⭐" : "");
      btn.title = cam.label;
      btn.addEventListener("click", () => {
        this.currentCamKey = key;
        this.targetBBox = null;
        this.updateCamButtons();
        this.syncControlsFromCam();
        this.loadCurrentImage();
      });
      container.appendChild(btn);
    }
  }

  renderTrackList() {
    const container = document.getElementById("trackListContainer");
    if (!container || !this.annotations) return;
    container.innerHTML = "";

    const allBtn = document.createElement("button");
    allBtn.className = `w-full text-left px-2 py-1.5 rounded text-xs font-semibold transition ${
      this.selectedTrackId === null ? "bg-slate-800 text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-800"
    }`;
    allBtn.textContent = "👁️ Hiện tất cả xe";
    allBtn.addEventListener("click", () => {
      this.selectedTrackId = null;
      this.renderTrackList();
      this.render();
    });
    container.appendChild(allBtn);

    for (const track of this.annotations.tracks || []) {
      const shapeInFrame = track.shapes.find((s) => s.frame === this.currentFrame);
      if (!shapeInFrame) continue;

      const lbl = this.labels[track.label_id] || { name: "Object", color: "#666" };
      const pts = shapeInFrame.points;
      const [cx, cy, cz, rx, ry, rz, lx, ly, lz] = pts;

      const btn = document.createElement("button");
      btn.className = `w-full text-left p-1.5 rounded border text-xs transition ${
        this.selectedTrackId === track.id
          ? "border-blue-500 bg-blue-50 shadow-sm"
          : "border-slate-200 bg-white hover:bg-slate-50"
      }`;

      btn.innerHTML = `
        <div class="flex items-center justify-between mb-0.5">
          <span class="font-bold flex items-center gap-1">
            <span class="w-2 h-2 rounded-full inline-block" style="background:${lbl.color}"></span>
            #${track.id} (${lbl.name})
          </span>
          <span class="text-[10px] text-slate-500 font-mono">${lx.toFixed(1)}x${ly.toFixed(1)}m</span>
        </div>
      `;

      btn.addEventListener("click", () => {
        this.selectedTrackId = track.id;
        this.renderTrackList();
        this.render();
      });

      container.appendChild(btn);
    }
  }

  // ==============================================================================
  // 6. CANVAS RENDERING
  // ==============================================================================

  render() {
    const W = this.canvas.width;
    const H = this.canvas.height;
    this.ctx.clearRect(0, 0, W, H);

    this.ctx.save();
    this.ctx.translate(this.panX, this.panY);
    this.ctx.scale(this.zoom, this.zoom);

    // 1. Vẽ Background Image (1920x1536)
    if (this.imgLoaded && this.img.complete) {
      this.ctx.drawImage(this.img, 0, 0, W, H);
    } else {
      this.ctx.fillStyle = "#1e293b";
      this.ctx.fillRect(0, 0, W, H);
      this.ctx.fillStyle = "#64748b";
      this.ctx.font = "bold 24px sans-serif";
      this.ctx.textAlign = "center";
      this.ctx.fillText(`Đang tải ảnh camera ${this.currentCamKey}...`, W / 2, H / 2);
    }

    // 2. Vẽ Target Bounding Box do người dùng kéo chuột
    if (this.targetBBox) {
      this.ctx.save();
      this.ctx.strokeStyle = "#f59e0b"; // Vàng hổ phách nổi bật
      this.ctx.lineWidth = 3 / this.zoom;
      this.ctx.setLineDash([8 / this.zoom, 4 / this.zoom]);
      this.ctx.strokeRect(
        this.targetBBox.minU,
        this.targetBBox.minV,
        this.targetBBox.width,
        this.targetBBox.height
      );

      // Điểm tâm mục tiêu
      this.ctx.fillStyle = "#f59e0b";
      this.ctx.beginPath();
      this.ctx.arc(this.targetBBox.centerX, this.targetBBox.centerY, 6 / this.zoom, 0, 2 * Math.PI);
      this.ctx.fill();

      // Nhãn Target Box
      this.ctx.fillStyle = "rgba(245, 158, 11, 0.9)";
      this.ctx.font = `bold ${Math.max(12, 16 / this.zoom)}px sans-serif`;
      this.ctx.fillText(
        `Target Xe (${Math.round(this.targetBBox.width)}x${Math.round(this.targetBBox.height)}px)`,
        this.targetBBox.minU,
        this.targetBBox.minV - 8 / this.zoom
      );
      this.ctx.restore();
    }

    // 3. Chiếu & Vẽ Wireframe 3D
    const cam = this.getCurrentCam();
    if (this.annotations && this.annotations.tracks) {
      let visibleBoxesCount = 0;

      for (const track of this.annotations.tracks) {
        if (this.selectedTrackId !== null && track.id !== this.selectedTrackId) {
          continue;
        }

        const shape = track.shapes.find((s) => s.frame === this.currentFrame);
        if (!shape) continue;

        const pts = shape.points;
        const box = {
          c: [pts[0], pts[1], pts[2]],
          r: [pts[3], pts[4], pts[5]],
          s: [pts[6], pts[7], pts[8]],
          trackId: track.id,
          labelId: track.label_id
        };

        const isVisible = this.drawBoxWireframe(this.ctx, box, cam);
        if (isVisible) visibleBoxesCount++;
      }

      const statusEl = document.getElementById("lblInImageStatus");
      if (statusEl) {
        statusEl.textContent = visibleBoxesCount > 0
          ? `Nhìn thấy ${visibleBoxesCount} xe trong camera`
          : `Không có xe nào nằm trong tầm nhìn camera`;
        statusEl.className = visibleBoxesCount > 0 ? "text-emerald-600 font-semibold text-xs" : "text-amber-600 font-semibold text-xs";
      }
    }

    this.ctx.restore();
  }

  drawBoxWireframe(ctx, box, cam) {
    const cornersLidar = d14BoxCorners(box.c, box.r, box.s);

    const cornersCam = cornersLidar.map((p) => {
      const ego = d14Transform(p, this.sensor2ego);
      return d14Transform(ego, cam.ego2cam);
    });

    const [W, H] = cam.image_size;
    const maxR2 = d14MaxR2(cam);

    const projected = cornersCam.map((pc) => {
      const front = pc[2] > NEAR_Z;
      const z = front ? pc[2] : 1.0;
      const xn = pc[0] / z;
      const yn = pc[1] / z;
      const [u, v] = d14DistortToPixel(xn, yn, cam);
      return { u, v, valid: front && xn * xn + yn * yn <= maxR2 };
    });

    const inImage = projected.filter((q) => q.valid && q.u >= 0 && q.u < W && q.v >= 0 && q.v < H).length;
    if (inImage === 0) return false;

    const isSelected = this.selectedTrackId === box.trackId;
    const baseW = Math.max(2, W / 500);

    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    // 1. Vẽ 12 Cạnh Wireframe
    for (const [i, j] of D14_EDGES) {
      const pts = d14EdgePolyline(cornersCam[i], cornersCam[j], cam);
      if (!pts || pts.length === 0) continue;

      const isFrontEdge = FRONT_SET.has(`${i}-${j}`);
      ctx.lineWidth = isFrontEdge ? baseW * 2.5 : baseW * 1.5;

      if (isFrontEdge) {
        ctx.strokeStyle = "#ef4444";
      } else if (isSelected) {
        ctx.strokeStyle = "#3b82f6";
      } else {
        ctx.strokeStyle = "#22c55e";
      }

      ctx.beginPath();
      pts.forEach(([u, v], k) => (k ? ctx.lineTo(u, v) : ctx.moveTo(u, v)));
      ctx.stroke();
    }

    // 2. Vẽ 8 Đỉnh Tròn
    const showVertices = document.getElementById("chkShowVertices")?.checked;
    if (showVertices) {
      ctx.fillStyle = "#ffffff";
      for (const q of projected) {
        if (q.valid && q.u >= 0 && q.u < W && q.v >= 0 && q.v < H) {
          ctx.beginPath();
          ctx.arc(q.u, q.v, baseW * 2, 0, 2 * Math.PI);
          ctx.fill();
          ctx.strokeStyle = "#000000";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    }

    // 3. Vẽ Nhãn Kích Thước
    const showLabels = document.getElementById("chkShowLabels")?.checked;
    if (showLabels) {
      const validPts = projected.filter((q) => q.valid && q.u >= 0 && q.u < W && q.v >= 0 && q.v < H);
      if (validPts.length >= 2) {
        const uMin = Math.min(...validPts.map((p) => p.u));
        const uMax = Math.max(...validPts.map((p) => p.u));
        const vMin = Math.min(...validPts.map((p) => p.v));
        const labelX = (uMin + uMax) / 2;
        const labelY = Math.max(35, vMin - 15);

        const lblName = (this.labels[box.labelId] && this.labels[box.labelId].name) || "Car";
        const text = `#${box.trackId} ${lblName} [L:${box.s[0].toFixed(1)} W:${box.s[1].toFixed(1)} H:${box.s[2].toFixed(1)}]`;

        ctx.font = `bold ${Math.max(14, baseW * 4.5)}px -apple-system, BlinkMacSystemFont, sans-serif`;
        const textMetrics = ctx.measureText(text);
        const padX = 8;
        const padY = 5;
        const textH = Math.max(14, baseW * 4.5);

        ctx.fillStyle = isSelected ? "rgba(37, 99, 235, 0.9)" : "rgba(15, 23, 42, 0.85)";
        ctx.fillRect(
          labelX - textMetrics.width / 2 - padX,
          labelY - textH - padY,
          textMetrics.width + padX * 2,
          textH + padY * 2
        );

        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.fillText(text, labelX, labelY - 2);
      }
    }

    ctx.restore();
    return true;
  }
}

window.addEventListener("DOMContentLoaded", () => {
  window.app = new CalibrationTunerApp();
});
