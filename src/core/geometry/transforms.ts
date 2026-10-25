/**
 * Module các phép biến đổi không gian 3D cơ bản và vi chỉnh Z/Góc.
 * Chuẩn Three.js Euler 'XYZ' & Hình học Vector 3D.
 */

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
 * Định dạng chuỗi hiển thị góc Euler theo độ.
 */
export function degToEulerString(rDeg: number, pDeg: number, yDeg: number): string {
  return `Roll: ${rDeg.toFixed(1)}°, Pitch: ${pDeg.toFixed(1)}°, Yaw: ${yDeg.toFixed(1)}°`;
}

/**
 * Định dạng góc Euler (radian) thành chuỗi hiển thị độ.
 */
export function formatEulerDeg(rxRad: number, ryRad: number, rzRad: number): string {
  return degToEulerString(radToDeg(rxRad), radToDeg(ryRad), radToDeg(rzRad));
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

export interface Ray3D {
  origin: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number };
}

export interface Box3DParams {
  x: number;
  y: number;
  z: number;
  l: number;
  w: number;
  h: number;
  yaw: number;
  pitch?: number;
  roll?: number;
}

/**
 * Xoay ngược vector 3D theo góc Euler XYZ đảo chiều (R^-1 = Rx(-rx) * Ry(-ry) * Rz(-rz))
 */
export function transformVectorInverseEuler(
  v: { x: number; y: number; z: number },
  rx: number = 0,
  ry: number = 0,
  rz: number = 0
): { x: number; y: number; z: number } {
  // 1. Xoay quanh Z góc -rz
  const cosZ = Math.cos(rz), sinZ = Math.sin(rz);
  const x1 = v.x * cosZ + v.y * sinZ;
  const y1 = -v.x * sinZ + v.y * cosZ;
  const z1 = v.z;

  // 2. Xoay quanh Y góc -ry
  const cosY = Math.cos(ry), sinY = Math.sin(ry);
  const x2 = x1 * cosY - z1 * sinY;
  const y2 = y1;
  const z2 = x1 * sinY + z1 * cosY;

  // 3. Xoay quanh X góc -rx
  const cosX = Math.cos(rx), sinX = Math.sin(rx);
  const x3 = x2;
  const y3 = y2 * cosX + z2 * sinX;
  const z3 = -y2 * sinX + z2 * cosX;

  return { x: x3, y: y3, z: z3 };
}

/**
 * Kiểm tra va chạm giữa tia Ray 3D và Hộp Hướng 3D (Oriented Bounding Box - OBB).
 * Trả về khoảng cách từ tia tới điểm va chạm gần nhất trên bề mặt hộp (t >= 0), hoặc null nếu không chạm.
 * Có đệm nhẹ padding (mặc định 0.12m) để hỗ trợ annotator/QC click trúng hộp dễ dàng.
 */
export function intersectRayWithOBB(
  ray: Ray3D,
  box: Box3DParams,
  padding: number = 0.12
): number | null {
  if (box.l <= 0 || box.w <= 0 || box.h <= 0) return null;

  // Bán kính nửa trục
  const hx = box.l / 2 + padding;
  const hy = box.w / 2 + padding;
  const hz = box.h / 2 + padding;

  // Vector từ tâm hộp tới gốc tia
  const P = {
    x: ray.origin.x - box.x,
    y: ray.origin.y - box.y,
    z: ray.origin.z - box.z,
  };
  const D = ray.direction;

  const rx = box.roll || 0;
  const ry = box.pitch || 0;
  const rz = box.yaw || 0;

  // Đưa về hệ trục cục bộ của Box
  const Ploc = transformVectorInverseEuler(P, rx, ry, rz);
  const Dloc = transformVectorInverseEuler(D, rx, ry, rz);

  let tMin = -Infinity;
  let tMax = Infinity;

  // Trục X
  if (Math.abs(Dloc.x) > 1e-7) {
    let t1 = (-hx - Ploc.x) / Dloc.x;
    let t2 = (hx - Ploc.x) / Dloc.x;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  } else if (Math.abs(Ploc.x) > hx) {
    return null;
  }

  // Trục Y
  if (Math.abs(Dloc.y) > 1e-7) {
    let t1 = (-hy - Ploc.y) / Dloc.y;
    let t2 = (hy - Ploc.y) / Dloc.y;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  } else if (Math.abs(Ploc.y) > hy) {
    return null;
  }

  // Trục Z
  if (Math.abs(Dloc.z) > 1e-7) {
    let t1 = (-hz - Ploc.z) / Dloc.z;
    let t2 = (hz - Ploc.z) / Dloc.z;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  } else if (Math.abs(Ploc.z) > hz) {
    return null;
  }

  if (tMax < 0) return null; // Hộp ở phía sau camera
  return tMin >= 0 ? tMin : tMax;
}
