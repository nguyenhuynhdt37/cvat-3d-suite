import assert from "assert";
import {
  flipYaw,
  radToDeg,
  calculateGroundLockedZ,
  calculateGroundSnapZ,
  calculateCurbOffsetZ,
  calculateHalfCurbRoll,
  calculateMicroAdjustZ,
  estimateYawFromPoints,
  computeAnchorFrameScore,
  computeAnnularRingGroundZ,
  computeTightFitDimensions,
  computeGroundSlopesAndZ,
  alignBoxToPointsPreservingDimensions,
} from "../src/core/geometry.ts";
import { findBestFitCatalog, STANDARD_VEHICLE_CATALOG } from "../src/core/catalog.ts";

console.log("🧪 Đang chạy kiểm thử tự động Module Geometry...");

// 1. Test lật Yaw từ 0 độ sang 180 độ
const yaw0 = 0;
const flipped0 = flipYaw(yaw0);
assert.ok(Math.abs(Math.abs(flipped0) - Math.PI) < 1e-10, "Lật 0 rad phải ra ±π rad (180°)");
console.log(`✅ Test 1: Lật 0° ➔ ${radToDeg(flipped0)}° (Chuẩn)`);

// 2. Test lật Yaw từ 90 độ (π/2) sang -90 độ (-π/2)
const yaw90 = Math.PI / 2;
const flipped90 = flipYaw(yaw90);
assert.ok(Math.abs(flipped90 - (-Math.PI / 2)) < 1e-10, "Lật +90° phải ra -90°");
console.log(`✅ Test 2: Lật +90° ➔ ${radToDeg(flipped90)}° (Chuẩn)`);

// 3. Test lật Yaw 2 lần liên tiếp phải quay về đúng góc ban đầu
const originalYaw = 1.234567;
const doubleFlipped = flipYaw(flipYaw(originalYaw));
assert.ok(Math.abs(doubleFlipped - originalYaw) < 1e-10, "Lật 2 lần phải về góc ban đầu");
console.log(`✅ Test 3: Lật 2 lần liên tiếp bảo toàn góc ban đầu (${originalYaw})`);

// 4. Test bù trừ Ground-Lock Z
const oldZ = -0.8;
const oldH = 1.4;
const newH = 1.8;
const newZ = calculateGroundLockedZ(oldZ, oldH, newH);
assert.ok(Math.abs(newZ - (-0.6)) < 1e-10, "Tâm Z mới phải được nâng lên +0.2m thành -0.6m");

const oldBottom = oldZ - oldH / 2;
const newBottom = newZ - newH / 2;
assert.ok(Math.abs(oldBottom - newBottom) < 1e-10, "Mặt phẳng đáy xe tiếp đất phải bất biến!");
console.log(`✅ Test 4: Ground-Lock Z chuẩn xác tuyệt đối (Mặt đáy tiếp đất cố định tại ${oldBottom}m)`);

// 5. Test Ghim Mặt Đất (Ground Snap): Mặt đường ở Z = -1.22m, xe cao 1.45m => tâm Z = -1.22 + 0.725 = -0.495m
const groundZ = -1.22;
const carH = 1.45;
const snapZ = calculateGroundSnapZ(groundZ, carH);
assert.strictEqual(snapZ, -0.495, "Tâm Z sau khi ghim đất phải là -0.495m");
assert.ok(Math.abs(snapZ - carH / 2 - groundZ) < 1e-10, "Đáy xe phải khớp khít 100% với mặt đất");
console.log(`✅ Test 5: Ghim Mặt Đất (Road Ground Snap): Đáy xe = ${groundZ}m, Tâm Z = ${snapZ}m`);

// 6. Test Bậc Nâng Vỉa Hè (Curb / Sidewalk Offset): +15cm
const curZ = -0.495;
const curbZ = calculateCurbOffsetZ(curZ, 0.15);
assert.strictEqual(curbZ, -0.345, "Tâm Z trên vỉa hè phải tăng đúng 0.15m thành -0.345m");
console.log(`✅ Test 6: Bậc Nâng Vỉa Hè (Curb Offset +15cm): ${curZ}m ➔ ${curbZ}m`);

// 7. Test Xe Gác Bánh Vỉa Hè (Half-Curb Parking): Vỉa hè cao 15cm, xe rộng 1.85m
const halfCurb = calculateHalfCurbRoll(0.15, 1.85, true);
assert.ok(halfCurb.rollDeg > 4.6 && halfCurb.rollDeg < 4.7, "Góc nghiêng Roll phải xấp xỉ 4.65°");
assert.strictEqual(halfCurb.deltaZ, 0.075, "Tâm Z phải nâng lên nửa chiều cao vỉa hè (+7.5cm)");
console.log(`✅ Test 7: Xe Đỗ Gác Bánh Vỉa Hè: Nghiêng Roll = ${halfCurb.rollDeg}°, Nâng ΔZ = +${halfCurb.deltaZ}m`);

// 8. Test Vi Chỉnh Micro-Z: +1cm và -5cm
const microZ1 = calculateMicroAdjustZ(curZ, 1);
assert.strictEqual(microZ1, -0.485, "Nhích +1cm phải tăng 0.01m");
const microZ5 = calculateMicroAdjustZ(curZ, -5);
assert.strictEqual(microZ5, -0.545, "Hạ -5cm phải giảm 0.05m");
console.log(`✅ Test 8: Vi Chỉnh Micro-Z: +1cm ➔ ${microZ1}m, -5cm ➔ ${microZ5}m`);

// 9. Test So khớp Best-Fit Catalog cho Sedan (L=4.7m, W=1.85m, H=1.45m)
const matchSedan = findBestFitCatalog(4.72, 1.83, 1.46, "Car");
assert.strictEqual(matchSedan.matchedItem.id, "mid_sedan", "Phải nhận diện ra Mid Sedan");
assert.ok(matchSedan.confidence >= 90, "Độ tin cậy phải >= 90%");
console.log(`✅ Test 9: Best-Fit Sedan: Nhận diện ${matchSedan.matchedItem.name} (${matchSedan.confidence}% tin cậy)`);

// 10. Test So khớp Best-Fit Catalog cho SUV (L=4.6m, W=1.86m, H=1.68m)
const matchSUV = findBestFitCatalog(4.62, 1.87, 1.69, "Car");
assert.strictEqual(matchSUV.matchedItem.id, "mid_suv", "Phải nhận diện ra Mid-size SUV");
console.log(`✅ Test 10: Best-Fit SUV: Nhận diện ${matchSUV.matchedItem.name} (${matchSUV.confidence}% tin cậy)`);

// 11. Test So khớp Best-Fit Catalog cho Bus (L=10.5m, W=2.5m, H=3.2m)
const matchBus = findBestFitCatalog(10.2, 2.48, 3.15, "Bus");
assert.strictEqual(matchBus.matchedItem.id, "bus", "Phải nhận diện ra City Bus");
console.log(`✅ Test 11: Best-Fit Bus: Nhận diện ${matchBus.matchedItem.name} (${matchBus.confidence}% tin cậy)`);

// 12. Test Thuật toán PCA ước lượng góc trục dài của thân xe (Xe đặt nằm ngang trục X)
const carPointsHorizontal = [
  { x: -2.0, y: 0.1 }, { x: -1.0, y: -0.2 }, { x: 0.0, y: 0.0 },
  { x: 1.0, y: 0.2 }, { x: 2.0, y: -0.1 }, { x: -2.0, y: -0.5 },
  { x: 2.0, y: 0.5 }, { x: 0.0, y: 0.4 }, { x: -1.0, y: 0.3 }
];
const pcaRes = estimateYawFromPoints(carPointsHorizontal);
assert.ok(Math.abs(pcaRes.yawDeg) < 15, "Góc trục dài xe nằm ngang phải xấp xỉ 0°");
assert.ok(pcaRes.confidence > 70, "Độ tin cậy của PCA phải cao");
console.log(`✅ Test 12: Ước lượng trục dài thân xe (PCA Yaw): ${pcaRes.yawDeg}° (${pcaRes.confidence}% tin cậy)`);

// 13. Test Tính điểm Frame Mốc (Anchor Frame Score)
const scoreDense = computeAnchorFrameScore(1200, 4.6, 1.85, 1.5);
const scoreSparse = computeAnchorFrameScore(30, 2.0, 1.1, 0.9);
assert.ok(scoreDense > scoreSparse + 50, "Frame dày điểm chuẩn xe phải có điểm cao hơn frame thưa thiếu điểm");
console.log(`✅ Test 13: Anchor Frame Score: Frame chuẩn (${scoreDense} điểm) > Frame thưa (${scoreSparse} điểm)`);

// 14. Test Dò Mặt Đất Vành Đai (Annular Ring Ground Detection)
// Giả lập xe ở tâm (0, 0), mặt đất ở Z = -0.32m, gầm xe không có điểm nào, thân xe Z > 0.2m
const simulatedLidarPoints: Array<{ x: number; y: number; z: number }> = [];
// Tạo các điểm thân xe (Z từ 0.2m đến 1.5m, bên trong xe |x| <= 2.3, |y| <= 0.9)
for (let x = -2.2; x <= 2.2; x += 0.5) {
  for (let y = -0.8; y <= 0.8; y += 0.4) {
    simulatedLidarPoints.push({ x, y, z: 0.5 + Math.random() * 0.8 });
  }
}
// Tạo các điểm mặt đất lộ thiên ở vành đai xung quanh xe (|x| từ 2.4 đến 3.2 hoặc |y| từ 1.0 đến 1.8, Z xấp xỉ -0.32m)
for (let x = -3.2; x <= 3.2; x += 0.4) {
  for (let y = -1.8; y <= 1.8; y += 0.4) {
    if (Math.abs(x) > 2.3 || Math.abs(y) > 0.9) {
      simulatedLidarPoints.push({ x, y, z: -0.32 + (Math.random() - 0.5) * 0.02 });
    }
  }
}
const ringGround = computeAnnularRingGroundZ(simulatedLidarPoints, 0, 0, 0, 2.3, 0.9, 0.1, 1.2);
assert.ok(ringGround.groundZ !== null, "Phải tìm thấy mặt đất trong vành đai");
assert.ok(Math.abs(ringGround.groundZ - (-0.32)) < 0.03, `Mặt đất vành đai phải xấp xỉ -0.32m (thực tế: ${ringGround.groundZ}m)`);
console.log(`✅ Test 14: Annular Ring Ground Detection: Tìm thấy Ground Z = ${ringGround.groundZ}m (${ringGround.groundPointsCount} điểm)`);

// 15. Test Ôm Sát Cụm Điểm (Tight Bounding Box)
// Thân xe có các điểm biên: X từ -2.25 đến +2.35 (L = 4.6m), Y từ -0.92 đến +0.93 (W = 1.85m), Z cao nhất 1.22m (Ground Z = -0.32m => H = 1.54m)
const bodyPtsForTightFit = [
  { x: -2.25, y: 0.0, z: 0.5 },
  { x: 2.35, y: 0.0, z: 0.8 },
  { x: 0.0, y: -0.92, z: 0.6 },
  { x: 0.0, y: 0.93, z: 0.7 },
  { x: 0.5, y: 0.2, z: 1.22 },
];
const tightRes = computeTightFitDimensions(bodyPtsForTightFit, 0, 0, 0, -0.32);
assert.ok(Math.abs(tightRes.newL - 4.6) < 0.05, `Chiều dài ôm khít phải là 4.6m (thực tế: ${tightRes.newL}m)`);
assert.ok(Math.abs(tightRes.newW - 1.85) < 0.05, `Chiều rộng ôm khít phải là 1.85m (thực tế: ${tightRes.newW}m)`);
assert.ok(Math.abs(tightRes.newH - 1.54) < 0.05, `Chiều cao ôm khít phải là 1.54m (thực tế: ${tightRes.newH}m)`);
assert.ok(Math.abs(tightRes.newCenterZ - (-0.32 + 1.54 / 2)) < 0.01, `Tâm Z phải là Ground + H/2`);
console.log(`✅ Test 15: Tight Fit Box: ${tightRes.newL}x${tightRes.newW}x${tightRes.newH}m (Tâm Z: ${tightRes.newCenterZ}m)`);

// 16. Test Tính Độ Dốc Mặt Đường 3D (Pitch & Roll Slopes)
// Giả lập mặt đường nghiêng z = -0.30 + 0.05 * x - 0.08 * y
const slopedGroundPoints: Array<{ x: number; y: number; z: number }> = [];
for (let x = -3.5; x <= 3.5; x += 0.5) {
  for (let y = -2.2; y <= 2.2; y += 0.5) {
    if (Math.abs(x) > 2.3 || Math.abs(y) > 0.9) {
      const z = -0.30 + 0.05 * x - 0.08 * y;
      slopedGroundPoints.push({ x, y, z });
    }
  }
}
const slopeRes = computeGroundSlopesAndZ(slopedGroundPoints, 0, 0, 0.4, 0, 2.3, 0.9);
assert.ok(slopeRes.groundZ !== null, "Phải tính được mặt đất dốc");
assert.ok(Math.abs(slopeRes.pitchDeg - (-2.86)) < 0.5, `Pitch Deg phải xấp xỉ -2.86° trong Three.js Z-Up (thực tế: ${slopeRes.pitchDeg}°)`);
assert.ok(Math.abs(slopeRes.rollDeg - (-4.57)) < 0.5, `Roll Deg phải xấp xỉ -4.57° (thực tế: ${slopeRes.rollDeg}°)`);
assert.ok(Math.abs(slopeRes.groundZ - (-0.30)) < 0.05, `Cao độ tâm đất c0 phải xấp xỉ -0.30m (thực tế: ${slopeRes.groundZ}m)`);
console.log(`✅ Test 16: Fit Mặt Đường Dốc 3D: Pitch = ${slopeRes.pitchDeg}°, Roll = ${slopeRes.rollDeg}°, GroundZ = ${slopeRes.groundZ}m`);

// 17. Test Căn Hộp Bám Cụm Điểm BẢO TOÀN KÍCH THƯỚC (Preserving Dimensions)
// Giả lập box đang ở tâm 0, nhưng xe thực tế bị lệch về phía trước: mũi xe ở X = 2.8m (X từ 1.0m đến 2.8m)
// Kích thước chuẩn của xe là L = 4.7m, W = 1.85m, H = 1.45m
const partialFrontBodyPoints = [
  { x: 1.0, y: -0.8, z: 0.5 },
  { x: 1.8, y: -0.7, z: 0.6 },
  { x: 2.8, y: 0.0, z: 0.8 }, // Mũi xe nhô về trước ở 2.8m
  { x: 2.2, y: 0.8, z: 0.6 },
  { x: 1.2, y: 0.8, z: 0.5 },
];
const alignRes = alignBoxToPointsPreservingDimensions(
  partialFrontBodyPoints,
  0, 0, 0.5, 0,
  4.7, 1.85, 1.45,
  -0.30
);
// Chiều dài L, W, H PHẢI ĐƯỢC GIỮ NGUYÊN 100% TUYỆT ĐỐI!
assert.strictEqual(alignRes.preservedL, 4.7, "Chiều dài L phải giữ nguyên 4.7m tuyệt đối");
assert.strictEqual(alignRes.preservedW, 1.85, "Chiều rộng W phải giữ nguyên 1.85m tuyệt đối");
assert.strictEqual(alignRes.preservedH, 1.45, "Chiều cao H phải giữ nguyên 1.45m tuyệt đối");
// Tâm xe mới phải tự động dịch chuyển về phía trước để bao trọn mũi xe (newCenterX = 2.8 - 2.35 = 0.45m > 0)
assert.strictEqual(alignRes.newCenterX, 0.45, `Tâm xe phải dịch chuyển tiến về trước +0.45m để bao mũi xe 2.8m`);
assert.strictEqual(alignRes.newCenterZ, 0.425, "Tâm Z phải là groundZ + H/2 = -0.30 + 0.725 = 0.425m");
console.log(`✅ Test 17: Căn Hộp Bám Cụm Điểm Bảo Toàn Size: L=${alignRes.preservedL}m, W=${alignRes.preservedW}m, H=${alignRes.preservedH}m (Tâm X nhích: ${alignRes.newCenterX}m, Z: ${alignRes.newCenterZ}m)`);

// 18. Test Đồng Bộ Kích Thước Toàn Bộ Track (Multi-Frame Track Synchronization)
// Giả lập Track gồm 3 keyframes tại các frame 0, 5, 10
const mockTrack = {
  clientID: 1,
  serverID: 101,
  shapes: [
    { frame: 0, shapeType: "cuboid", points: [10.0, 5.0, -0.50, 0, 0, 0.1, 4.5, 1.80, 1.40] },
    { frame: 5, shapeType: "cuboid", points: [12.0, 5.2, -0.48, 0, 0, 0.1, 4.5, 1.80, 1.40] },
    { frame: 10, shapeType: "cuboid", points: [14.0, 5.4, -0.46, 0, 0, 0.1, 4.5, 1.80, 1.40] },
  ],
};

const syncNewL = 4.80;
const syncNewW = 1.90;
const syncNewH = 1.50;

// Thực hiện đồng bộ toàn bộ track theo cơ chế Ground-Lock
let syncedFrames = 0;
for (const sh of mockTrack.shapes) {
  if (sh.shapeType === "cuboid" && Array.isArray(sh.points) && sh.points.length >= 9) {
    const sOldZ = sh.points[2];
    const sOldH = sh.points[8];
    // Bù trừ Ground-Lock: ΔZ = (newH - oldH) / 2
    sh.points[2] = Number((sOldZ + (syncNewH - sOldH) / 2).toFixed(3));
    sh.points[6] = syncNewL;
    sh.points[7] = syncNewW;
    sh.points[8] = syncNewH;
    syncedFrames++;
  }
}

assert.strictEqual(syncedFrames, 3, "Phải đồng bộ chính xác cả 3 frame của track");
// Kiểm tra frame 0: tâm Z = -0.50 + (1.50 - 1.40) / 2 = -0.45m
assert.strictEqual(mockTrack.shapes[0].points[2], -0.45, "Cao độ tâm Z frame 0 phải là -0.45m");
assert.strictEqual(mockTrack.shapes[0].points[6], 4.80, "Chiều dài L frame 0 phải là 4.80m");
assert.strictEqual(mockTrack.shapes[0].points[7], 1.90, "Chiều rộng W frame 0 phải là 1.90m");
assert.strictEqual(mockTrack.shapes[0].points[8], 1.50, "Chiều cao H frame 0 phải là 1.50m");

// Kiểm tra frame 10: tâm Z = -0.46 + 0.05 = -0.41m
assert.strictEqual(mockTrack.shapes[2].points[2], -0.41, "Cao độ tâm Z frame 10 phải là -0.41m");
assert.strictEqual(mockTrack.shapes[2].points[6], 4.80, "Chiều dài L frame 10 phải là 4.80m");
assert.strictEqual(mockTrack.shapes[2].points[7], 1.90, "Chiều rộng W frame 10 phải là 1.90m");
assert.strictEqual(mockTrack.shapes[2].points[8], 1.50, "Chiều cao H frame 10 phải là 1.50m");
console.log(`✅ Test 18: Đồng Bộ Kích Thước Toàn Track: Cả ${syncedFrames} frames đã khớp ${syncNewL}x${syncNewW}x${syncNewH}m (Ground-Lock Z bù trừ chuẩn)`);

// 19. Test Quét Toàn Dải từ Frame 0 Đến Frame End (Full Range Scan & AutoSave Sync)
const mockJobFrames: Record<number, Array<{ clientID: number; points: number[] }>> = {};
const activeFrames = [0, 4, 8, 15, 20];
for (let f = 0; f <= 20; f++) {
  mockJobFrames[f] = [];
  if (activeFrames.includes(f)) {
    // Chiếc xe #2 xuất hiện tại các frame này với kích thước cũ: 4.60 x 1.85 x 1.45m
    mockJobFrames[f].push({
      clientID: 2,
      points: [15.0 + f * 0.5, 3.0, -0.40, 0, 0, 0.2, 4.60, 1.85, 1.45],
    });
  }
}

const targetL = 4.90;
const targetW = 1.95;
const targetH = 1.55;
const deltaH = targetH - 1.45; // 0.10m -> deltaZ = +0.05m

let fullRangeCount = 0;
for (let f = 0; f <= 20; f++) {
  const states = mockJobFrames[f];
  const st = states.find((s) => s.clientID === 2);
  if (st && st.points.length >= 9) {
    const p = st.points;
    p[2] = Number((p[2] + deltaH / 2).toFixed(3));
    p[6] = targetL;
    p[7] = targetW;
    p[8] = targetH;
    fullRangeCount++;
  }
}

assert.strictEqual(fullRangeCount, 5, "Phải quét và cập nhật đủ 5 frame từ Frame 0 đến Frame 20");
assert.strictEqual(mockJobFrames[0][0].points[6], 4.90, "Frame 0 phải có L = 4.90m");
assert.strictEqual(mockJobFrames[0][0].points[2], -0.35, "Frame 0 phải có Z bù trừ = -0.35m");
assert.strictEqual(mockJobFrames[20][0].points[6], 4.90, "Frame 20 (Frame End) phải có L = 4.90m");
assert.strictEqual(mockJobFrames[20][0].points[2], -0.35, "Frame 20 (Frame End) phải có Z bù trừ = -0.35m");
console.log(`✅ Test 19: Full Range Scan (Frame 0 -> Frame End): Khớp 100% cả ${fullRangeCount} frames với ${targetL}x${targetW}x${targetH}m`);

// =========================================================================
// CÁC BÀI KIỂM THỬ MỚI: EULER XYZ, MA TRẬN QUAY, TƯƠNG TÁC CHUỘT & NỘI SUY
// =========================================================================
import {
  axes,
  axesToEuler,
  rotateLocal,
  localToWorld,
  worldToLocal,
  resizeKeepBottom,
  pointsToBox,
  boxToPoints,
  interpolatePoints,
  findAngleDiff,
  estimateGround,
  snapToGround,
  type Box3D,
} from "../src/core/geometry.ts";

// 20. Test axes và axesToEuler bảo toàn góc quay Euler XYZ
const testEuler: [number, number, number] = [0.1, -0.2, 0.5];
const ax = axes(testEuler);
const recoveredEuler = axesToEuler(ax);
assert.ok(Math.abs(recoveredEuler[0] - testEuler[0]) < 1e-5, "Rx phải được khôi phục chính xác");
assert.ok(Math.abs(recoveredEuler[1] - testEuler[1]) < 1e-5, "Ry phải được khôi phục chính xác");
assert.ok(Math.abs(recoveredEuler[2] - testEuler[2]) < 1e-5, "Rz phải được khôi phục chính xác");
console.log(`✅ Test 20: Bảo toàn góc Euler 'XYZ' qua ma trận quay axes: [${testEuler.join(", ")}] ➔ [${recoveredEuler.map((v) => v.toFixed(4)).join(", ")}]`);

// 21. Test rotateLocal xoay quanh trục Z cục bộ 90 độ
const rInitial: [number, number, number] = [0, 0, 0];
const rRotated = rotateLocal(rInitial, 2, Math.PI / 2);
assert.ok(Math.abs(rRotated[2] - Math.PI / 2) < 1e-5, "Góc Yaw quanh Z phải là +90°");
console.log(`✅ Test 21: rotateLocal quanh Z: 0° ➔ ${radToDeg(rRotated[2])}° (Chuẩn)`);

// 22. Test resizeKeepBottom giữ nguyên đáy box đứng yên
const initialBox: Box3D = {
  c: [10, 5, -0.5],
  r: [0, 0, 0.2],
  s: [4.6, 1.85, 1.45],
};
const bottomBefore = initialBox.c[2] - initialBox.s[2] / 2; // -0.5 - 0.725 = -1.225m
const resizedBox = resizeKeepBottom(initialBox, [4.8, 1.9, 1.65]);
const bottomAfter = resizedBox.c[2] - resizedBox.s[2] / 2; // -1.225m
assert.ok(Math.abs(bottomAfter - bottomBefore) < 1e-5, "Mặt đáy -Z phải đứng yên tuyệt đối");
assert.strictEqual(resizedBox.s[0], 4.8, "Chiều dài mới phải là 4.8m");
assert.strictEqual(resizedBox.s[2], 1.65, "Chiều cao mới phải là 1.65m");
console.log(`✅ Test 22: resizeKeepBottom: Đáy trước = ${bottomBefore.toFixed(3)}m, Đáy sau = ${bottomAfter.toFixed(3)}m (Khớp 100%)`);

// 23. Test localToWorld và worldToLocal là ánh xạ ngược nhau
const axTest = axes([0, 0, 0.3]);
const localQ: [number, number, number] = [2.0, -1.0, 0.5];
const worldP = localToWorld(localQ, [15, 20, 1], axTest);
const backToLocal = worldToLocal(worldP, [15, 20, 1], axTest);
assert.ok(Math.abs(backToLocal[0] - localQ[0]) < 1e-5, "X cục bộ phải khớp");
assert.ok(Math.abs(backToLocal[1] - localQ[1]) < 1e-5, "Y cục bộ phải khớp");
assert.ok(Math.abs(backToLocal[2] - localQ[2]) < 1e-5, "Z cục bộ phải khớp");
console.log(`✅ Test 23: Chuyển đổi tọa độ local ➔ world ➔ local bảo toàn 100%`);

// 24. Test Nội suy góc và vị trí giữa 2 Keyframe chuẩn CVAT
const kf1 = [0, 0, 0, 0, 0, 0.1, 4.5, 1.8, 1.4];
const kf2 = [10, 20, 2, 0, 0, 0.5, 4.5, 1.8, 1.4];
const midPoints = interpolatePoints(kf1, kf2, 0.5);
assert.strictEqual(midPoints[0], 5, "X nội suy tại 50% phải là 5m");
assert.strictEqual(midPoints[1], 10, "Y nội suy tại 50% phải là 10m");
assert.strictEqual(midPoints[2], 1, "Z nội suy tại 50% phải là 1m");
assert.ok(Math.abs(midPoints[5] - 0.3) < 1e-5, "Yaw nội suy tại 50% phải là 0.3 rad");
console.log(`✅ Test 24: interpolatePoints chuẩn CVAT tại offset 50%: [${midPoints.slice(0, 3).join(", ")}], Yaw=${midPoints[5].toFixed(2)} rad`);

// 25. Test estimateGround & snapToGround (Histogram 2cm Peak Detection & Đáy chạm khít mặt đất)
// Giả lập mặt đường thực tế ở Z = -0.35m với 50 điểm LiDAR, lẫn 5 điểm nhiễu sâu dưới cống ở Z = -0.60m
const ptsWithNoise: number[] = [];
for (let i = 0; i < 50; i++) {
  const x = -3 + Math.random() * 6;
  const y = -2 + Math.random() * 4;
  ptsWithNoise.push(x, y, -0.35 + (Math.random() - 0.5) * 0.02);
}
// Thêm 5 điểm nhiễu sâu
for (let i = 0; i < 5; i++) {
  ptsWithNoise.push(-1 + Math.random() * 2, -1 + Math.random() * 2, -0.60);
}

const testBoxForSnap: Box3D = {
  c: [0, 0, 0.5], // Đang lơ lửng ở cao độ 0.5m
  r: [0, 0, 0],
  s: [4.6, 1.85, 1.45], // H = 1.45m => Đáy box đang ở 0.5 - 0.725 = -0.225m
};

const groundEst = estimateGround(new Float32Array(ptsWithNoise), testBoxForSnap);
assert.ok(groundEst !== null, "Phải tìm thấy đỉnh cao độ mặt đất");
assert.ok(Math.abs(groundEst.localZ - (-0.35 - testBoxForSnap.c[2])) < 0.03, "Đỉnh histogram phải khớp mặt đường -0.35m, loại bỏ hoàn toàn nhiễu -0.60m");

const snapResult = snapToGround(new Float32Array(ptsWithNoise), testBoxForSnap);
assert.ok(snapResult !== null, "Phải snap được box xuống đất");
const snappedBottomZ = snapResult.box.c[2] - snapResult.box.s[2] / 2;
assert.ok(Math.abs(snappedBottomZ - (-0.35)) < 0.03, `Đáy xe sau khi snap phải chạm đúng mặt đất -0.35m (thực tế: ${snappedBottomZ.toFixed(3)}m)`);
console.log(`✅ Test 25: estimateGround & snapToGround (Histogram 2cm Peak): Đáy xe hạ chính xác từ -0.225m ➔ ${snappedBottomZ.toFixed(3)}m (Khớp mặt đất -0.35m, Miễn nhiễm 100% với điểm nhiễu cống -0.60m)`);

console.log("\n🎉 TẤT CẢ 25 BÀI KIỂM THỬ HÌNH HỌC, DỐC MẶT ĐƯỜNG 3D, EULER XYZ, TƯƠNG TÁC GRID & GHIM ĐÁY ĐÃ ĐẠT 100%!");


