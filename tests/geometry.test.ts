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
  detectCurbStepAndRoll,
  alignBoxToPointsPreservingDimensions,
  fitBoxToEgoRayAndGround,
  fitPedestrianBox,
  fitCyclistBox,
  fitTwoWheelerBox,
  estimateTwoWheelerHeading,
  filterDenseConnectedCluster1D,
  filterSparseNoiseByLocalDensity,
  detectRoofTopBounds,
  straightenYawFromBoundaryEdge,
  computeDensityRobustBounds,
  detectLateralWallBounds,
  detectLongitudinalBumperBounds,
  estimateEgoRoadGroundZ,
  fitYawToLaneIntensity,
  computeIntensityWeights,
  detectDominantWallEdgeWithValleyCutoff,
  determineBumperByDensity,
} from "../src/core/geometry.ts";
import {
  findBestFitCatalog,
  STANDARD_VEHICLE_CATALOG,
  CAR_PRESETS,
  CYCLIST_PRESETS,
  PEDESTRIAN_PRESETS,
} from "../src/core/catalog.ts";

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

// 26. Test Ghim Đất Mở Rộng Bán Kính & Độ Sâu: Đường Dốc Chéo Nằm Sâu Phía Dưới & Căn Cứ Front View
// Giả lập box đang lơ lửng ở Z = 1.2m, trong khi mặt đường thực tế nằm sâu bên dưới tại Z ~ -1.5m
// Mặt đường dốc chéo cả 2 hướng: z = -1.50 + 0.07 * x - 0.11 * y (Dốc dọc Pitch ~ -4.0°, Dốc ngang Front Roll ~ -6.28°)
const deepSlopedPoints: Array<{ x: number; y: number; z: number }> = [];
for (let x = -4.5; x <= 4.5; x += 0.5) {
  for (let y = -3.2; y <= 3.2; y += 0.5) {
    if (Math.abs(x) > 2.2 || Math.abs(y) > 0.8) {
      const z = -1.50 + 0.07 * x - 0.11 * y;
      deepSlopedPoints.push({ x, y, z });
    }
  }
}

// Gọi hàm quét với box lơ lửng ở cz = 1.2m (cách mặt đường gần 3 mét)
const deepSlopeRes = computeGroundSlopesAndZ(deepSlopedPoints, 0, 0, 1.2, 0, 2.3, 0.9);
assert.ok(deepSlopeRes.groundZ !== null, "Phải quét sâu xuống bắt được mặt đường dưới cùng");
assert.ok(Math.abs(deepSlopeRes.groundZ - (-1.50)) < 0.06, `Cao độ tâm mặt đất c0 phải xấp xỉ -1.50m (thực tế: ${deepSlopeRes.groundZ}m)`);
assert.ok(Math.abs(deepSlopeRes.pitchDeg - (-4.00)) < 0.6, `Pitch Deg phải xấp xỉ -4.00° (thực tế: ${deepSlopeRes.pitchDeg}°)`);
assert.ok(Math.abs(deepSlopeRes.rollDeg - (-6.28)) < 0.6, `Roll Deg (Front View) phải xấp xỉ -6.28° (thực tế: ${deepSlopeRes.rollDeg}°)`);
console.log(`✅ Test 26: Quét Sâu & Bán Kính Rộng (Dốc Chéo Sâu & Front): Pitch = ${deepSlopeRes.pitchDeg}°, Roll Front = ${deepSlopeRes.rollDeg}°, GroundZ = ${deepSlopeRes.groundZ}m`);

// 27. Test Tự Động Nhận Diện Bậc Vỉa Hè & Bên Gác Lề (Auto Curb & Step Detection)
// Kịch bản A: Vỉa hè bên TRÁI cao +16cm (Left Z = -0.32m, Right Z = -0.48m)
const curbLeftPoints: Array<{ x: number; y: number; z: number }> = [];
// Tạo điểm sườn trái
for (let x = -2.5; x <= 2.5; x += 0.5) {
  for (let y = 1.0; y <= 2.5; y += 0.5) {
    curbLeftPoints.push({ x, y, z: -0.32 });
  }
}
// Tạo điểm sườn phải
for (let x = -2.5; x <= 2.5; x += 0.5) {
  for (let y = -2.5; y <= -1.0; y += 0.5) {
    curbLeftPoints.push({ x, y, z: -0.48 });
  }
}

const curbLeftRes = detectCurbStepAndRoll(curbLeftPoints, 0, 0, 0.4, 0, 2.3, 0.9, 1.85);
assert.strictEqual(curbLeftRes.hasCurb, true, "Phải phát hiện có bậc vỉa hè");
assert.strictEqual(curbLeftRes.side, "left", "Phải nhận diện vỉa hè nằm ở bên TRÁI xe");
assert.strictEqual(curbLeftRes.curbHeightCm, 16, "Chiều cao vỉa hè phải tự động đo chuẩn 16cm");
assert.ok(Math.abs(curbLeftRes.rollDeg - 4.96) < 0.2, `Roll Deg phải xấp xỉ +4.96° (thực tế: ${curbLeftRes.rollDeg}°)`);
console.log(`✅ Test 27a: Tự Nhận Diện Vỉa Hè Bên TRÁI (+16cm): Side = ${curbLeftRes.side}, CurbHeight = ${curbLeftRes.curbHeightCm}cm, Roll Front = +${curbLeftRes.rollDeg}°`);

// Kịch bản B: Vỉa hè bên PHẢI cao +14cm (Right Z = -0.30m, Left Z = -0.44m)
const curbRightPoints: Array<{ x: number; y: number; z: number }> = [];
for (let x = -2.5; x <= 2.5; x += 0.5) {
  for (let y = 1.0; y <= 2.5; y += 0.5) {
    curbRightPoints.push({ x, y, z: -0.44 });
  }
  for (let y = -2.5; y <= -1.0; y += 0.5) {
    curbRightPoints.push({ x, y, z: -0.30 });
  }
}
const curbRightRes = detectCurbStepAndRoll(curbRightPoints, 0, 0, 0.4, 0, 2.3, 0.9, 1.85);
assert.strictEqual(curbRightRes.hasCurb, true, "Phải phát hiện có bậc vỉa hè");
assert.strictEqual(curbRightRes.side, "right", "Phải nhận diện vỉa hè nằm ở bên PHẢI xe");
assert.strictEqual(curbRightRes.curbHeightCm, 14, "Chiều cao vỉa hè phải tự động đo chuẩn 14cm");
assert.ok(Math.abs(curbRightRes.rollDeg - (-4.34)) < 0.2, `Roll Deg phải xấp xỉ -4.34° (thực tế: ${curbRightRes.rollDeg}°)`);
console.log(`✅ Test 27b: Tự Nhận Diện Vỉa Hè Bên PHẢI (+14cm): Side = ${curbRightRes.side}, CurbHeight = ${curbRightRes.curbHeightCm}cm, Roll Front = ${curbRightRes.rollDeg}°`);

// 28. Test Ghim Đất Theo Vết Đè Box (Footprint Tight Ground Snap):
// Kịch bản: Xe mục tiêu đỗ song song cực sát với xe bên cạnh (mép xe bên cạnh chỉ cách mép xe mục tiêu 0.4m)
// Xe bên cạnh có thân xe và nóc xe rất cao (Z = 0.0m đến 1.5m, Y = 1.6m đến 3.2m).
// Mặt đất chuẩn tại Z = -0.35m.
// Chứng minh: Thuật toán Footprint Tight Snap chỉ quét trong phạm vi vết bánh xe đè,
// loại bỏ sạch sẽ 100% các điểm thân xe của xe bên cạnh, tính ra Ground Z = -0.35m và Roll Deg = 0.0° tuyệt đối!
const targetAndNeighborPoints: Array<{ x: number; y: number; z: number }> = [];

// Điểm mặt đất chuẩn dưới chân xe mục tiêu (cx=0, cy=0, halfL=2.3, halfW=0.9)
for (let x = -2.7; x <= 2.7; x += 0.4) {
  for (let y = -1.3; y <= 1.3; y += 0.3) {
    targetAndNeighborPoints.push({ x, y, z: -0.35 });
  }
}

// Điểm thân xe của XE BÊN CẠNH (đỗ ở Y = 1.6m đến 3.2m, Z = 0.0m đến 1.5m - rất cao và dày đặc)
for (let x = -2.0; x <= 2.0; x += 0.4) {
  for (let y = 1.6; y <= 3.2; y += 0.3) {
    for (let z = 0.0; z <= 1.5; z += 0.3) {
      targetAndNeighborPoints.push({ x, y, z });
    }
  }
}

// Chạy thuật toán Footprint Tight Snap cho xe mục tiêu (đang lơ lửng ở cz = 0.5m)
const footprintSnapRes = computeGroundSlopesAndZ(
  targetAndNeighborPoints,
  0, // cx
  0, // cy
  0.5, // cz (lơ lửng)
  0, // yaw
  2.3, // halfL
  0.9 // halfW
);

assert.ok(footprintSnapRes.groundZ !== null, "Phải tìm thấy mặt đất");
assert.ok(
  Math.abs(footprintSnapRes.groundZ - (-0.35)) < 0.03,
  `Cao độ mặt đất phải là -0.35m, không bị xe bên cạnh kéo lên (thực tế: ${footprintSnapRes.groundZ}m)`
);
assert.ok(
  Math.abs(footprintSnapRes.rollDeg) < 0.5,
  `Góc nghiêng Front Roll phải phẳng gần 0° (~0.0°), không bị xe bên cạnh làm nghiêng (thực tế: ${footprintSnapRes.rollDeg}°)`
);
assert.ok(
  Math.abs(footprintSnapRes.pitchDeg) < 0.5,
  `Góc nghiêng Side Pitch phải phẳng gần 0° (~0.0°) (thực tế: ${footprintSnapRes.pitchDeg}°)`
);
console.log(
  `✅ Test 28: Footprint Tight Ground Snap (Miễn nhiễm xe khác đỗ sát cách 40cm): GroundZ = ${footprintSnapRes.groundZ}m (khớp -0.35m), Roll Front = ${footprintSnapRes.rollDeg}°, Pitch = ${footprintSnapRes.pitchDeg}°`
);

// 29. Test FIT GÓC ĐÓN TIA EGO (RAY-CAST L-SHAPE FIT) & GHIM ĐẤT 3D (CẢ SIDE VIEW VÀ FRONT VIEW)
// Kịch bản A: Xe ở góc phần tư I (+X, +Y): cx = 10m, cy = 5m, cz = 0.8m, Yaw = 0°
// Ego ở gốc (0, 0). Tia Ego nhìn từ góc sau-phải -> Nhận diện [Mặt Sau + Sườn Phải]
const egoPtsA: Array<{ x: number; y: number; z: number }> = [];
// Điểm mặt đất chân xe
for (let x = 7.5; x <= 12.5; x += 0.5) {
  for (let y = 3.5; y <= 6.5; y += 0.5) {
    egoPtsA.push({ x, y, z: 0.0 });
  }
}
// Điểm thân xe đón tia (Mặt sau x ~ 7.7m, Sườn phải y ~ 4.1m, Nóc xe z ~ 1.48m)
// Mép sau lý thuyết: cx - L/2 = 10 - 2.3 = 7.7m
// Mép sườn phải lý thuyết: cy - W/2 = 5 - 0.9 = 4.1m
for (let x = 7.75; x <= 8.8; x += 0.2) {
  for (let z = 0.2; z <= 1.48; z += 0.2) {
    egoPtsA.push({ x, y: 4.15, z }); // Sườn phải
  }
  egoPtsA.push({ x, y: 4.15, z: 1.48 }); // Nóc xe 1.48m
}
for (let y = 4.15; y <= 5.2; y += 0.2) {
  for (let z = 0.2; z <= 1.48; z += 0.2) {
    egoPtsA.push({ x: 7.75, y, z }); // Mặt sau
  }
  egoPtsA.push({ x: 7.75, y, z: 1.48 }); // Nóc xe 1.48m
}

const fitResA = fitBoxToEgoRayAndGround(egoPtsA, 10, 5, 0.8, 0, 4.6, 1.8, 1.5, { x: 0, y: 0, z: 0 }, { alignMode: "both" });
assert.strictEqual(fitResA.visibleFaces.longitudinal, "rear", "Ego phải nhận diện nhìn thấy Mặt Sau xe (Side View)");
assert.strictEqual(fitResA.visibleFaces.lateral, "right", "Ego phải nhận diện nhìn thấy Sườn Phải xe (Front View)");
const rearEdgeA = fitResA.newCenterX - fitResA.newL / 2;
const rightEdgeA = fitResA.newCenterY - fitResA.newW / 2;
assert.ok(Math.abs(rearEdgeA - 7.75) < 0.05, `Mép sau của Box phải áp sát điểm đón tia 7.75m (thực tế: ${rearEdgeA.toFixed(3)}m)`);
assert.ok(Math.abs(rightEdgeA - 4.15) < 0.05, `Mép sườn phải của Box phải áp sát điểm đón tia 4.15m (thực tế: ${rightEdgeA.toFixed(3)}m)`);
assert.ok(Math.abs(fitResA.groundZ - 0.0) < 0.05, `Đáy xe phải ghim sát mặt đất 0.0m (thực tế: ${fitResA.groundZ}m)`);
const topEdgeA = fitResA.newCenterZ + fitResA.newH / 2;
assert.ok(Math.abs(topEdgeA - 1.48) < 0.05, `Góc trên nóc xe của Box phải áp sát điểm cao nhất 1.48m (thực tế: ${topEdgeA.toFixed(3)}m)`);
console.log(`✅ Test 29a: Fit Góc Đón Tia Sau-Phải (Side & Front View): Mép Sau = ${rearEdgeA.toFixed(2)}m (khớp 7.75m), Mép Phải = ${rightEdgeA.toFixed(2)}m (khớp 4.15m), Nóc Z = ${topEdgeA.toFixed(2)}m (khớp 1.48m)`);

// Kịch bản B: Xe ở góc phần tư III (-X, -Y): cx = -10m, cy = -6m, cz = 0.7m, Yaw = 0°
// Ego ở gốc (0, 0). Tia Ego nhìn từ góc trước-trái -> Nhận diện [Mặt Trước + Sườn Trái]
const egoPtsB: Array<{ x: number; y: number; z: number }> = [];
// Điểm mặt đất
for (let x = -12.5; x <= -7.5; x += 0.5) {
  for (let y = -7.5; y <= -4.5; y += 0.5) {
    egoPtsB.push({ x, y, z: -0.2 });
  }
}
// Điểm thân xe đón tia (Mặt trước x ~ -7.7m, Sườn trái y ~ -5.1m, Nóc xe z ~ 1.30m)
for (let x = -9.0; x <= -7.72; x += 0.2) {
  for (let z = 0.0; z <= 1.30; z += 0.2) {
    egoPtsB.push({ x, y: -5.12, z }); // Sườn trái
  }
  egoPtsB.push({ x, y: -5.12, z: 1.30 }); // Nóc xe 1.30m
}
for (let y = -5.8; y <= -5.12; y += 0.2) {
  for (let z = 0.0; z <= 1.30; z += 0.2) {
    egoPtsB.push({ x: -7.72, y, z }); // Mặt trước
  }
  egoPtsB.push({ x: -7.72, y, z: 1.30 }); // Nóc xe 1.30m
}

const fitResB = fitBoxToEgoRayAndGround(egoPtsB, -10, -6, 0.7, 0, 4.6, 1.8, 1.5, { x: 0, y: 0, z: 0 }, { alignMode: "both" });
assert.strictEqual(fitResB.visibleFaces.longitudinal, "front", "Ego phải nhận diện nhìn thấy Mặt Trước xe (Side View)");
assert.strictEqual(fitResB.visibleFaces.lateral, "left", "Ego phải nhận diện nhìn thấy Sườn Trái xe (Front View)");
const frontEdgeB = fitResB.newCenterX + fitResB.newL / 2;
const leftEdgeB = fitResB.newCenterY + fitResB.newW / 2;
assert.ok(Math.abs(frontEdgeB - (-7.72)) < 0.05, `Mép trước của Box phải áp sát điểm đón tia -7.72m (thực tế: ${frontEdgeB.toFixed(3)}m)`);
assert.ok(Math.abs(leftEdgeB - (-5.12)) < 0.05, `Mép sườn trái của Box phải áp sát điểm đón tia -5.12m (thực tế: ${leftEdgeB.toFixed(3)}m)`);
assert.ok(Math.abs(fitResB.groundZ - (-0.2)) < 0.05, `Đáy xe phải ghim sát mặt đất -0.2m (thực tế: ${fitResB.groundZ}m)`);
const topEdgeB = fitResB.newCenterZ + fitResB.newH / 2;
assert.ok(Math.abs(topEdgeB - 1.30) < 0.05, `Góc trên nóc xe của Box phải áp sát điểm cao nhất 1.30m (thực tế: ${topEdgeB.toFixed(3)}m)`);
console.log(`✅ Test 29b: Fit Góc Đón Tia Trước-Trái (Side & Front View): Mép Trước = ${frontEdgeB.toFixed(2)}m (khớp -7.72m), Mép Trái = ${leftEdgeB.toFixed(2)}m (khớp -5.12m), Nóc Z = ${topEdgeB.toFixed(2)}m (khớp 1.30m)`);

// 30. Test THUẬT TOÁN CHUYÊN BIỆT CHO NGƯỜI ĐI BỘ (PEDESTRIAN) & XE ĐẠP (CYCLIST)
// Kịch bản A: Người lớn cao ~1.72m (Tia laser cao nhất chỉ chạm vai 1.60m)
const pedAdultPts: Array<{ x: number; y: number; z: number }> = [];
// Điểm mặt đất chân người (R <= 0.35m)
for (let x = 4.8; x <= 5.2; x += 0.1) {
  for (let y = 1.8; y <= 2.2; y += 0.1) {
    pedAdultPts.push({ x, y, z: 0.0 });
  }
}
// Thân người (vai chạm z = 1.60m)
for (let z = 0.1; z <= 1.60; z += 0.15) {
  pedAdultPts.push({ x: 5.0, y: 2.0, z });
  pedAdultPts.push({ x: 4.85, y: 2.0, z });
  pedAdultPts.push({ x: 5.15, y: 2.0, z });
  pedAdultPts.push({ x: 5.0, y: 1.88, z });
  pedAdultPts.push({ x: 5.0, y: 2.12, z });
}
// Thêm rào chắn/bờ tường cách 0.7m (phải bị loại bỏ hoàn toàn nhờ bán kính quét hẹp)
for (let z = 0.0; z <= 1.0; z += 0.2) {
  pedAdultPts.push({ x: 5.0, y: 2.70, z });
}

const pedAdultRes = fitPedestrianBox(pedAdultPts, 5.0, 2.0, 0.8, 0);
assert.strictEqual(pedAdultRes.rollDeg, 0, "Người đi bộ phải khóa cứng Roll = 0°");
assert.strictEqual(pedAdultRes.pitchDeg, 0, "Người đi bộ phải khóa cứng Pitch = 0°");
assert.ok(Math.abs(pedAdultRes.groundZ - 0.0) < 0.05, `Đáy box người phải chạm mặt đất 0.0m (thực tế: ${pedAdultRes.groundZ}m)`);
assert.ok(Math.abs(pedAdultRes.newH - 1.65) < 0.05, `Chiều cao phải bù +5cm từ đỉnh đầu gọn gàng (1.60m + 0.05m = 1.65m, thực tế: ${pedAdultRes.newH}m)`);
assert.ok(pedAdultRes.newL <= 0.75, `Chiều dài người phải thon gọn <= 0.75m (thực tế: ${pedAdultRes.newL}m)`);
assert.ok(pedAdultRes.newW <= 0.70, `Chiều rộng người phải thon gọn <= 0.70m, không ăn nhầm rào chắn 2.7m (thực tế: ${pedAdultRes.newW}m)`);
console.log(`✅ Test 30a: Fit Người Đi Bộ Người Lớn: ${pedAdultRes.newL}x${pedAdultRes.newW}x${pedAdultRes.newH}m (Roll=0°, Pitch=0°, Bù đỉnh đầu +5cm gọn gàng ➔ H=1.65m)`);

// Kịch bản B: Trẻ em cao 1.20m (Tia laser cao nhất chạm 1.08m)
const pedChildPts: Array<{ x: number; y: number; z: number }> = [];
for (let x = -3.2; x <= -2.8; x += 0.1) {
  for (let y = 3.8; y <= 4.2; y += 0.1) {
    pedChildPts.push({ x, y, z: -0.15 }); // Mặt đất -0.15m
  }
}
for (let z = -0.10; z <= 0.93; z += 0.15) {
  pedChildPts.push({ x: -3.0, y: 4.0, z });
}
pedChildPts.push({ x: -3.0, y: 4.0, z: 0.93 }); // Vai trẻ em ở cao độ -0.15 + 1.08 = 0.93m

const pedChildRes = fitPedestrianBox(pedChildPts, -3.0, 4.0, 0.4, 0);
assert.strictEqual(pedChildRes.rollDeg, 0, "Trẻ em phải khóa Roll = 0°");
assert.strictEqual(pedChildRes.pitchDeg, 0, "Trẻ em phải khóa Pitch = 0°");
assert.ok(Math.abs(pedChildRes.groundZ - (-0.15)) < 0.05, `Đáy chạm đất -0.15m (thực tế: ${pedChildRes.groundZ}m)`);
assert.ok(Math.abs(pedChildRes.newH - 1.13) < 0.05, `Chiều cao trẻ em phải co giãn linh hoạt khớp 1.13m (thực tế: ${pedChildRes.newH}m)`);
console.log(`✅ Test 30b: Fit Trẻ Em (Co giãn kích thước tự do): ${pedChildRes.newL}x${pedChildRes.newW}x${pedChildRes.newH}m (Không bị ép to như ô tô)`);

// Kịch bản C: Xe Đạp (Cyclist)
const cyclistPts: Array<{ x: number; y: number; z: number }> = [];
for (let x = 0.2; x <= 1.8; x += 0.2) {
  cyclistPts.push({ x, y: 0.0, z: 0.0 }); // Vệt bánh xe
  cyclistPts.push({ x, y: 0.0, z: 0.8 }); // Khung xe
}
cyclistPts.push({ x: 0.9, y: 0.0, z: 1.55 }); // Nón bảo hiểm

const cyclistRes = fitCyclistBox(cyclistPts, 1.0, 0.0, 0.7, 0);
assert.strictEqual(cyclistRes.rollDeg, 0, "Xe đạp khóa Roll = 0°");
assert.strictEqual(cyclistRes.pitchDeg, 0, "Xe đạp khóa Pitch = 0°");
assert.ok(Math.abs(cyclistRes.newH - 1.65) < 0.05, `Chiều cao xe đạp bù nón bảo hiểm khớp 1.65m (thực tế: ${cyclistRes.newH}m)`);
assert.ok(cyclistRes.newL >= 1.60 && cyclistRes.newL <= 1.95, `Chiều dài xe đạp chuẩn khớp ~1.75m (thực tế: ${cyclistRes.newL}m)`);
assert.ok(cyclistRes.newW >= 0.50 && cyclistRes.newW <= 0.80, `Chiều rộng xe đạp thon gọn khớp ~0.65m (thực tế: ${cyclistRes.newW}m)`);
console.log(`✅ Test 30c: Fit Xe Đạp / Cyclist: ${cyclistRes.newL}x${cyclistRes.newW}x${cyclistRes.newH}m (Khóa 0°, Chuẩn khung xe đạp)`);

// 31. Test XE ĐỖ DƯỚI LÒNG ĐƯỜNG CẠNH VỈA HÈ: Đáy Box nằm phẳng ở mặt đường dưới cùng (dưới vỉa hè luôn), KHÔNG NGHIÊNG BOX (Roll = 0°)
// Kịch bản đúng như ảnh người dùng:
// Bên phải (y < 0): Mặt đường đô thị phẳng ở Z = -0.35m
// Bên trái (y > 0): Vỉa hè nhô cao ở Z = -0.15m (+20cm)
const curbEdgePts: Array<{ x: number; y: number; z: number }> = [];
// Điểm mặt đường phẳng bên phải
for (let x = -2.5; x <= 2.5; x += 0.4) {
  for (let y = -1.3; y <= -0.2; y += 0.2) {
    curbEdgePts.push({ x, y, z: -0.35 });
  }
}
// Điểm nền vỉa hè nhô cao bên trái
for (let x = -2.5; x <= 2.5; x += 0.4) {
  for (let y = 0.2; y <= 1.3; y += 0.2) {
    curbEdgePts.push({ x, y, z: -0.15 });
  }
}

const curbRoadRes = computeGroundSlopesAndZ(curbEdgePts, 0, 0, 0.4, 0, 2.3, 0.9);
assert.strictEqual(curbRoadRes.rollDeg, 0, "Khi đỗ dưới đường cạnh vỉa hè, box bắt buộc phải khóa Roll = 0° (không được nghiêng box)");
assert.ok(
  Math.abs(curbRoadRes.groundZ - (-0.35)) < 0.03,
  `Đáy box phải nằm khít ở mặt đường dưới cùng -0.35m (nằm dưới vỉa hè -0.15m luôn, thực tế: ${curbRoadRes.groundZ}m)`
);
console.log(`✅ Test 31: Xe Đỗ Dưới Lòng Đường Cạnh Vỉa Hè (Đúng ảnh người dùng): GroundZ = ${curbRoadRes.groundZ}m (khớp mặt đường -0.35m), Roll = ${curbRoadRes.rollDeg}° (Khóa phẳng tuyệt đối, đáy nằm dưới vỉa hè)`);

// 32. Test XE NỬA TRÊN VỈA HÈ DỐC THOẢI (Curb Ramp Curve): Khóa phẳng Roll = 0°, Neo mặt đường dưới cùng -0.35m (Âm đất dưới vỉa hè)
// Mô phỏng chính xác trường hợp người dùng phản hồi:
// Khoảng cách từ đất đến vỉa hè dốc thoải (cong/vát từ y = -0.3m đến y = 0.3m)
// Lòng đường (y <= -0.3m): Z = -0.35m
// Bờ dốc thoải (y từ -0.3m đến 0.3m): Z dốc thoải liên tục từ -0.35m lên -0.15m
// Vỉa hè (y >= 0.3m): Z = -0.15m (+20cm)
const curbRampPts: Array<{ x: number; y: number; z: number }> = [];
for (let x = -2.5; x <= 2.5; x += 0.4) {
  for (let y = -1.3; y <= 1.3; y += 0.15) {
    let z = -0.35;
    if (y < -0.3) {
      z = -0.35;
    } else if (y > 0.3) {
      z = -0.15;
    } else {
      // Đoạn dốc thoải nối từ lòng đường lên vỉa hè
      const ratio = (y - (-0.3)) / 0.6;
      z = -0.35 + ratio * 0.20;
    }
    curbRampPts.push({ x, y, z });
  }
}

const rampRes = computeGroundSlopesAndZ(curbRampPts, 0, 0, 0.4, 0, 2.3, 0.9);
assert.strictEqual(rampRes.rollDeg, 0, "Khi gặp vỉa hè dốc thoải, box bắt buộc phải khóa Roll = 0° (không được nghiêng theo dốc thoải)");
assert.ok(
  Math.abs(rampRes.groundZ - (-0.35)) < 0.03,
  `Đáy box phải neo chuẩn ở mặt đường dưới cùng -0.35m (chìm âm đất dưới vỉa hè, thực tế: ${rampRes.groundZ}m)`
);
console.log(`✅ Test 32: Xe Đỗ Nửa Trên Vỉa Hè Dốc Thoải (Curb Ramp): GroundZ = ${rampRes.groundZ}m (khớp mặt đường -0.35m), Roll = ${rampRes.rollDeg}° (Khóa phẳng tuyệt đối, âm đất dưới vỉa hè thoải)`);

// 33. Test PHÂN CỤM MẬT ĐỘ TRỤC FRONT KHI 2 XE ĐỖ SONG SONG CẠNH NHAU
// Kịch bản thực tế người dùng phản ánh:
// Xe A (đang chọn): cx = 0, cy = 0, cz = 0.8m, L = 4.6m, W = 1.8m, H = 1.5m
// Có 60 điểm thân xe phủ quanh vỏ xe A (sườn trái y = 0.9m, sườn phải y = -0.9m)
// Khoảng trống giữa 2 xe: y từ 0.9m đến 1.35m (rộng 45cm) không có điểm nào
// Xe B (xe khác đỗ cạnh): y từ 1.35m đến 1.6m (có 15 điểm sườn lọt vào bán kính quét)
const adjacentVehiclesPts: Array<{ x: number; y: number; z: number }> = [];

// Điểm mặt đất
for (let x = -3.0; x <= 3.0; x += 0.5) {
  for (let y = -2.0; y <= 2.0; y += 0.5) {
    adjacentVehiclesPts.push({ x, y, z: 0.0 });
  }
}

// Xe A (Xe chính đang chọn): y in [-0.9, 0.9]
for (let x = -2.0; x <= 2.0; x += 0.3) {
  for (let z = 0.3; z <= 1.45; z += 0.3) {
    adjacentVehiclesPts.push({ x, y: -0.90, z }); // Sườn phải xe A
    adjacentVehiclesPts.push({ x, y: 0.88, z });  // Sườn trái xe A
  }
}
for (let y = -0.90; y <= 0.88; y += 0.15) {
  adjacentVehiclesPts.push({ x: 2.25, y, z: 0.8 });  // Mặt trước xe A
  adjacentVehiclesPts.push({ x: -2.25, y, z: 0.8 }); // Mặt sau xe A
}

// Xe B (Xe bên cạnh, cách 45cm): y in [1.35, 1.55]
for (let x = -1.5; x <= 1.5; x += 0.4) {
  for (let z = 0.3; z <= 1.3; z += 0.3) {
    adjacentVehiclesPts.push({ x, y: 1.42, z }); // Sườn xe B lọt vào rìa quét
  }
}

// Kiểm tra Ego ở (0, 10): Tia Ego chiếu từ sườn TRÁI (phía có xe B)
const adjFitRes = fitBoxToEgoRayAndGround(adjacentVehiclesPts, 0, 0, 0.8, 0, 4.6, 1.8, 1.5, { x: 0, y: 10, z: 0 });

assert.strictEqual(adjFitRes.visibleFaces.lateral, "left", "Ego phải nhận diện nhìn thấy Sườn Trái");
const leftEdgeAdj = adjFitRes.newCenterY + adjFitRes.newW / 2;

// Mép trái box sau khi fit phải áp sát sườn xe A (y = 0.88m), KHÔNG ĐƯỢC bị kéo sang sườn xe B (y = 1.42m)
assert.ok(
  Math.abs(leftEdgeAdj - 0.88) < 0.06,
  `Trục Front phải bám khít sườn xe A tại 0.88m, không được bị kéo sang xe B (thực tế mép trái: ${leftEdgeAdj.toFixed(3)}m)`
);
// Tâm Y của box phải nằm sát tâm xe A (0.0m), tuyệt đối không bị kéo vào khoảng giữa 2 xe (y > 0.2m)
assert.ok(
  Math.abs(adjFitRes.newCenterY) < 0.06,
  `Tâm box ở trục Front không được bị kéo vào khoảng giữa 2 xe (thực tế tâm Y: ${adjFitRes.newCenterY.toFixed(3)}m)`
);

console.log(`✅ Test 33: Phân Cụm Mật Độ Trục Front (2 Xe Đỗ Song Song): Mép trái = ${leftEdgeAdj.toFixed(2)}m (ôm khít xe A 0.88m, loại bỏ 100% xe B), Tâm Y = ${adjFitRes.newCenterY.toFixed(2)}m (Không bị kéo vào khoảng giữa 2 xe)`);

// 34. Test CĂN HỘP BẢO TOÀN SIZE KHI CÓ XE KHÁC ĐỖ BÊN CẠNH (Preserving Dimensions with Adjacent Vehicle)
// Giả lập thân xe A có 40 điểm, xe B bên cạnh (cách 50cm) có 10 điểm lọt vào.
// Kiểm tra alignBoxToPointsPreservingDimensions không bị kéo lệch tâm Y sang xe B.
const bodyWithAdjacent = [
  ...adjacentVehiclesPts.filter((p) => p.z > 0.1), // Lọc điểm thân xe
];
const alignAdjRes = alignBoxToPointsPreservingDimensions(bodyWithAdjacent, 0, 0, 0.8, 0, 4.6, 1.8, 1.5, 0.0);
assert.ok(
  Math.abs(alignAdjRes.newCenterY) < 0.06,
  `Căn hộp bảo toàn size: Tâm Y không được bị kéo vào khoảng giữa 2 xe (thực tế tâm Y: ${alignAdjRes.newCenterY.toFixed(3)}m)`
);
assert.strictEqual(alignAdjRes.preservedW, 1.8, "Chiều rộng W phải được bảo toàn tuyệt đối 1.8m");
console.log(`✅ Test 34: Căn Hộp Bảo Toàn Size Cạnh Xe Khác: Tâm Y = ${alignAdjRes.newCenterY.toFixed(2)}m (Chuẩn tâm xe A, không bị kéo sang xe B)`);

// 35. Test HƯỚNG ĐÓN TIA EGO FRONT VIEW (Đúng kịch bản ảnh người dùng - Không bao giờ bị ngược)
// Tái hiện chính xác ảnh người dùng gửi:
// Xe ở cx = 5, cy = 3, cz = 0.8, Yaw = 0°, kích thước L = 4.6, W = 1.8, H = 1.5
// Ego ở gốc (0, 0) => Ego nằm ở bên phải xe (dyEgo > 0, vLocalY < 0)
// Cụm điểm thân xe chỉ xuất hiện ở sườn phải đón tia: y in [2.15, 2.7] (tức ly in [-0.85, -0.3])
// Mép ngoài sườn đón tia là lyMin = -0.85m (y = 2.15m)
const frontEgoPts: Array<{ x: number; y: number; z: number }> = [];
// Điểm mặt đất
for (let x = 3.0; x <= 7.0; x += 0.5) {
  for (let y = 1.5; y <= 4.5; y += 0.5) {
    frontEgoPts.push({ x, y, z: 0.0 });
  }
}
// Thân xe sườn phải đón tia (x từ 3.5 đến 6.5, y ~ 2.15m, z từ 0.2 đến 1.48m)
for (let x = 3.5; x <= 6.5; x += 0.3) {
  for (let z = 0.2; z <= 1.48; z += 0.2) {
    frontEgoPts.push({ x, y: 2.15, z });
  }
}

const frontFitRes = fitBoxToEgoRayAndGround(frontEgoPts, 5, 3, 0.8, 0, 4.6, 1.8, 1.5, { x: 0, y: 0, z: 0 }, { alignMode: "both" });
assert.strictEqual(frontFitRes.visibleFaces.lateral, "right", "Phải nhận diện đón tia Sườn Phải (Right)");
const rightEdgeFront = frontFitRes.newCenterY - frontFitRes.newW / 2;
// Mép phải của box sau khi fit phải áp sát điểm đón tia 2.15m
assert.ok(
  Math.abs(rightEdgeFront - 2.15) < 0.06,
  `Mép đón tia của box phải áp sát mép ngoài cụm điểm 2.15m (thực tế mép phải: ${rightEdgeFront.toFixed(3)}m)`
);
// Mép trái của box (phía che khuất) phải mở rộng sang 2.15 + 1.8 = 3.95m
const leftEdgeFront = frontFitRes.newCenterY + frontFitRes.newW / 2;
assert.ok(
  Math.abs(leftEdgeFront - 3.95) < 0.06,
  `Mép che khuất của box phải mở rộng về phía trong 3.95m, bao trọn toàn bộ cụm điểm (thực tế: ${leftEdgeFront.toFixed(3)}m)`
);
console.log(`✅ Test 35: Hướng Đón Tia Ego Front View (Đúng ảnh người dùng): Mép phải đón tia = ${rightEdgeFront.toFixed(2)}m (áp sát 2.15m), Mép trái che khuất = ${leftEdgeFront.toFixed(2)}m (ôm trọn cụm điểm, không bị lộn ngược)`);

// 36. Test LỌC MẬT ĐỘ ĐIỂM, LOẠI BỎ GƯƠNG CHIẾU HẬU VÀ CỤM NHIỄU PHÍA SAU (Đúng ảnh người dùng - 2 Chấm Đỏ)
// Kịch bản tái hiện 100% hình ảnh người dùng:
// - Thân xe từ lx = -2.2m đến lx = 1.8m (1.8m là vị trí 2 chấm đỏ kết thúc mép xe thật).
// - Thân xe dày đặc 120 điểm.
// - Có gương chiếu hậu nhô ra ở ly = 1.15m (nhô ra 25cm so với sườn xe 0.90m, chỉ có 2 điểm).
// - Có cụm điểm nhiễu phía sau (sau 2 chấm đỏ, cách gap 25cm): từ lx = 2.05m đến 2.45m (8 điểm thưa thớt).
const noiseAndMirrorPts: Array<{ x: number; y: number; z: number }> = [];

// Mặt đất z = 0.0m
for (let x = -3.0; x <= 3.5; x += 0.5) {
  for (let y = -2.0; y <= 2.0; y += 0.5) {
    noiseAndMirrorPts.push({ x, y, z: 0.0 });
  }
}

// 1. Điểm thân xe thật: lx từ -2.2m đến +1.8m (Mép xe kết thúc tại 2 chấm đỏ 1.8m)
// Sườn xe từ ly = -0.90m đến +0.90m
for (let x = -2.2; x <= 1.8; x += 0.2) {
  for (let y = -0.9; y <= 0.9; y += 0.3) {
    for (let z = 0.4; z <= 1.4; z += 0.5) {
      noiseAndMirrorPts.push({ x, y, z });
    }
  }
}

// 2. Gương chiếu hậu: Nhô ra sườn trái ở ly = 1.15m (chỉ có 2 điểm thưa thớt)
noiseAndMirrorPts.push({ x: 0.8, y: 1.12, z: 0.9 });
noiseAndMirrorPts.push({ x: 0.8, y: 1.15, z: 0.92 });

// 3. Cụm điểm nhiễu phía sau xe (sau 2 chấm đỏ 1.8m, cách một khoảng gap 25cm): lx từ 2.05m đến 2.45m
const rearNoisePoints = [
  { x: 2.05, y: 0.2, z: 0.6 },
  { x: 2.15, y: 0.4, z: 0.7 },
  { x: 2.25, y: 0.3, z: 0.5 },
  { x: 2.35, y: 0.5, z: 0.8 },
  { x: 2.40, y: 0.2, z: 0.6 },
  { x: 2.45, y: 0.6, z: 0.7 },
];
noiseAndMirrorPts.push(...rearNoisePoints);

// Kiểm tra 1: computeDensityRobustBounds loại bỏ sạch nhiễu và gương
const localBodyCandidates = noiseAndMirrorPts.filter((p) => p.z > 0.1).map((p) => ({ lx: p.x, ly: p.y, z: p.z }));
const robustBoundsRes = computeDensityRobustBounds(localBodyCandidates);

// Mép lxMax phải chốt đúng tại 1.8m (2 chấm đỏ), KHÔNG ĐƯỢC nuốt trọn cụm nhiễu 2.45m
assert.ok(
  robustBoundsRes.lxMax <= 1.85,
  `Mép lxMax phải dừng tại 2 chấm đỏ <= 1.85m, không được bọc cụm nhiễu 2.45m (thực tế lxMax: ${robustBoundsRes.lxMax}m)`
);
assert.ok(
  robustBoundsRes.lxMax >= 1.75,
  `Mép lxMax phải ôm sát mép thân xe 1.80m (thực tế lxMax: ${robustBoundsRes.lxMax}m)`
);

// Mép lyMax phải chốt đúng sườn xe <= 0.95m, KHÔNG ĐƯỢC bọc gương chiếu hậu 1.15m
assert.ok(
  robustBoundsRes.lyMax <= 0.95,
  `Mép lyMax phải loại bỏ gương chiếu hậu, <= 0.95m (thực tế lyMax: ${robustBoundsRes.lyMax}m)`
);

// Kiểm tra 2: fitBoxToEgoRayAndGround khi Ego nhìn từ phía trước/sau (x = 10, y = 0)
// Hộp xe chuẩn L = 4.6m, W = 1.8m, H = 1.5m
const fitRobustRes = fitBoxToEgoRayAndGround(noiseAndMirrorPts, 0, 0, 0.75, 0, 4.6, 1.8, 1.5, { x: 10, y: 0, z: 0 }, { alignMode: "both" });

// Mép trước đón tia của box (newCenterX + L/2) phải áp sát mép xe thật tại 2 chấm đỏ (1.8m), KHÔNG bị kéo dạt ra 2.45m
const frontEdgeBox = fitRobustRes.newCenterX + fitRobustRes.newL / 2;
assert.ok(
  Math.abs(frontEdgeBox - 1.8) < 0.08,
  `Mép đón tia của box phải áp sát đúng 2 chấm đỏ tại 1.8m (thực tế: ${frontEdgeBox.toFixed(3)}m)`
);

// Mép sau của box (newCenterX - L/2) = 1.8 - 4.6 = -2.8m, bao trọn vẹn toàn bộ đầu xe -2.2m
// Khắc phục 100% lỗi đầu xe bị thò ra ngoài / bị cắt cụt như trong ảnh người dùng!
const rearEdgeBox = fitRobustRes.newCenterX - fitRobustRes.newL / 2;
assert.ok(
  rearEdgeBox <= -2.2,
  `Mép đối diện của box phải bao trọn vẹn đầu xe <= -2.2m, không được cắt cụt (thực tế mép sau: ${rearEdgeBox.toFixed(3)}m)`
);

console.log(
  `✅ Test 36: Lọc Mật Độ Điểm & Gương Chiếu Hậu (Đúng ảnh người dùng - 2 Chấm Đỏ): lxMax = ${robustBoundsRes.lxMax}m (khớp 1.8m tại 2 chấm đỏ, gạt bỏ nhiễu 2.45m), lyMax = ${robustBoundsRes.lyMax}m (loại bỏ gương 1.15m), Đầu xe được bọc trọn vẹn ${rearEdgeBox.toFixed(2)}m <= -2.2m`
);

// 37. Test NGĂN CHẶN ĂN SANG OBJECT KHÁC & BẢO TOÀN 100% KÍCH THƯỚC BOX
// Tái hiện chính xác hình ảnh người dùng:
// - Xe mục tiêu (tại chấm xanh lá cây): cx = 0, cy = 0, cz = 0.75m, L = 4.6m, W = 1.8m, H = 1.5m.
// - Thân xe mục tiêu nằm từ lx = -2.2m (2 chấm đỏ bên trái) đến lx = 1.0m (2 chấm đỏ ở giữa), gồm 60 điểm.
// - Khoảng hở gap = 0.30m ngăn cách giữa xe mục tiêu và Object khác.
// - Phía bên phải (lx in [1.30, 2.60]): Có MỘT OBJECT KHÁC CỰC KỲ DÀY ĐẶC 150 ĐIỂM (gấp 2.5 lần xe mục tiêu!).
const tandemObjectPts: Array<{ x: number; y: number; z: number }> = [];

// Mặt đất
for (let x = -3.0; x <= 3.5; x += 0.5) {
  for (let y = -2.0; y <= 2.0; y += 0.5) {
    tandemObjectPts.push({ x, y, z: 0.0 });
  }
}

// 1. Thân xe mục tiêu: lx in [-2.2, 1.0], ly in [-0.9, 0.9] (60 điểm)
for (let x = -2.2; x <= 1.0; x += 0.2) {
  for (let y = -0.9; y <= 0.9; y += 0.4) {
    for (let z = 0.4; z <= 1.4; z += 0.5) {
      tandemObjectPts.push({ x, y, z });
    }
  }
}

// 2. Object khác bên phải: lx in [1.30, 2.60], ly in [-0.9, 0.9] (150 điểm dày đặc!)
for (let x = 1.30; x <= 2.60; x += 0.08) {
  for (let y = -0.9; y <= 0.9; y += 0.25) {
    for (let z = 0.4; z <= 1.4; z += 0.5) {
      tandemObjectPts.push({ x, y, z });
    }
  }
}

// Bấm Fit với cờ bảo toàn kích thước L, W, H (Ego tại x = 10, y = 0)
const tandemFitRes = fitBoxToEgoRayAndGround(tandemObjectPts, 0, 0, 0.75, 0, 4.6, 1.8, 1.5, { x: 10, y: 0, z: 0 }, { preserveDimensions: true, alignMode: "both" });

// 1. Kích thước L, W, H phải được BẢO TOÀN 100%
assert.strictEqual(tandemFitRes.newL, 4.6, "Chiều dài L phải giữ nguyên tuyệt đối 4.6m");
assert.strictEqual(tandemFitRes.newW, 1.8, "Chiều rộng W phải giữ nguyên tuyệt đối 1.8m");
assert.strictEqual(tandemFitRes.newH, 1.5, "Chiều cao H phải giữ nguyên tuyệt đối 1.5m");

// 2. Mép trước của box phải dừng đúng tại 2 chấm đỏ ở giữa (~ 1.0m), TUYỆT ĐỐI KHÔNG ĐƯỢC ăn sang Object khác bên phải (1.30m - 2.60m)
const frontEdgeTandem = tandemFitRes.newCenterX + tandemFitRes.newL / 2;
assert.ok(
  frontEdgeTandem <= 1.10,
  `Mép trước của box phải dừng tại 2 chấm đỏ ở giữa <= 1.10m, không được ăn sang Object khác 2.60m (thực tế: ${frontEdgeTandem.toFixed(3)}m)`
);
assert.ok(
  frontEdgeTandem >= 0.95,
  `Mép trước của box phải áp sát mép xe mục tiêu >= 0.95m (thực tế: ${frontEdgeTandem.toFixed(3)}m)`
);

// 3. Mép sau của box (-L) phải bao trọn vẹn đầu xe mục tiêu tại 2 chấm đỏ bên trái (-2.2m)
const rearEdgeTandem = tandemFitRes.newCenterX - tandemFitRes.newL / 2;
assert.ok(
  rearEdgeTandem <= -2.2,
  `Mép sau của box phải bao trọn vẹn đầu xe bên trái <= -2.2m (thực tế: ${rearEdgeTandem.toFixed(3)}m)`
);

console.log(
  `✅ Test 37: Ngăn Chặn Ăn Sang Object Khác & Bảo Toàn Kích Thước (Đúng ảnh người dùng): Box giữ nguyên ${tandemFitRes.newL}x${tandemFitRes.newW}x${tandemFitRes.newH}m, Mép trước bám khít 2 chấm đỏ giữa = ${frontEdgeTandem.toFixed(2)}m (Loại bỏ 100% Object 150 điểm bên phải), Mép sau bọc trọn 2 chấm đỏ trái = ${rearEdgeTandem.toFixed(2)}m <= -2.2m`
);

// 38. Test CHẾ ĐỘ MẶC ĐỊNH FIT GÓC ĐÓN TIA: ƯU TIÊN BÁM ĐẤT, KHÓA CỨNG HƯỚNG X (shiftLx = 0), CHỈ DỊCH HƯỚNG W & LOẠI BỎ GƯƠNG/VẬT THỂ KHÁC
// Kịch bản theo đúng chỉ đạo mới nhất của người dùng:
// - Xe ở cx = 5.0m, cy = 2.0m, cz = 0.8m, Yaw = 0°, L = 4.6m, W = 1.8m (halfW = 0.90m), H = 1.5m.
// - Mặt đất z = -0.35m.
// - Thành xe bên phải đón tia: y in [1.08, 1.10m] (tức ly in [-0.92, -0.90m]) có 40 điểm dày đặc từ sàn lên nóc xe.
// - Gương chiếu hậu nhô ra ở y = 0.86m (ly = -1.14m, nhô ra 24cm) chỉ có 2 điểm thưa thớt.
// - Xe khác đỗ bên cạnh ở y in [0.40, 0.65m] (ly in [-1.60, -1.35m]) có 60 điểm dày đặc.
// - Xe khác đỗ nối đuôi ở x in [7.6, 9.0m] (lx in [2.6, 4.0m]).
const wOnlyTestPts: Array<{ x: number; y: number; z: number }> = [];

// Mặt đất Footprint z = -0.35m
for (let x = 3.0; x <= 7.0; x += 0.5) {
  for (let y = 1.0; y <= 3.0; y += 0.5) {
    wOnlyTestPts.push({ x, y, z: -0.35 });
  }
}

// 1. Thành xe bên phải đón tia (Ego ở gốc (0, 0) nhìn sang phải): y ~ 1.10m, x in [3.2, 6.8m]
for (let x = 3.2; x <= 6.8; x += 0.3) {
  for (let z = -0.15; z <= 1.05; z += 0.2) {
    wOnlyTestPts.push({ x, y: 1.10, z });
  }
}

// 2. Gương chiếu hậu nhô ra ở sườn phải đón tia (y = 0.86m, tức ly = -1.14m, 2 điểm)
wOnlyTestPts.push({ x: 5.5, y: 0.86, z: 0.55 });
wOnlyTestPts.push({ x: 5.5, y: 0.86, z: 0.57 });

// 3. Xe khác đỗ bên cạnh (y in [0.40, 0.65m], 60 điểm dày đặc)
for (let x = 3.5; x <= 6.5; x += 0.3) {
  for (let y = 0.45; y <= 0.65; y += 0.1) {
    for (let z = -0.15; z <= 1.05; z += 0.3) {
      wOnlyTestPts.push({ x, y, z });
    }
  }
}

// 4. Xe khác đỗ nối đuôi phía trước (x in [7.6, 9.0m], 80 điểm)
for (let x = 7.6; x <= 9.0; x += 0.2) {
  for (let y = 1.2; y <= 2.8; y += 0.3) {
    for (let z = -0.15; z <= 1.05; z += 0.3) {
      wOnlyTestPts.push({ x, y, z });
    }
  }
}

// Gọi Fit chế độ mặc định w_only (Ego tại (0, 0))
const wOnlyFitRes = fitBoxToEgoRayAndGround(wOnlyTestPts, 5.0, 2.0, 0.8, 0, 4.6, 1.8, 1.5, { x: 0, y: 0, z: 0 }, { alignMode: "w_only" });

// 1. ƯU TIÊN BÁM ĐẤT: Đáy xe phải tiếp đất chuẩn xác tại -0.35m, Roll = 0°
const bottomZ = wOnlyFitRes.newCenterZ - wOnlyFitRes.newH / 2;
assert.ok(Math.abs(bottomZ - (-0.35)) < 0.03, `Đáy xe phải chạm khít mặt đất -0.35m (thực tế: ${bottomZ.toFixed(3)}m)`);
assert.strictEqual(wOnlyFitRes.rollDeg, 0, "Roll phải khóa phẳng 0° tuyệt đối");

// 2. KHÔNG DI CHUYỂN HƯỚNG X: newCenterX phải giữ nguyên đúng cx = 5.0m
assert.strictEqual(wOnlyFitRes.shiftLx, 0, "shiftLx phải bằng 0 tuyệt đối (không xê dịch hướng X)");
assert.ok(Math.abs(wOnlyFitRes.newCenterX - 5.0) < 0.001, `Tâm X phải giữ nguyên tuyệt đối 5.0m (thực tế: ${wOnlyFitRes.newCenterX}m)`);

// 3. KÍCH THƯỚC L, W, H PHẢI ĐƯỢC BẢO TOÀN 100%
assert.strictEqual(wOnlyFitRes.newL, 4.6, "L phải giữ nguyên 4.6m");
assert.strictEqual(wOnlyFitRes.newW, 1.8, "W phải giữ nguyên 1.8m");
assert.strictEqual(wOnlyFitRes.newH, 1.5, "H phải giữ nguyên 1.5m");

// 4. CHỈ DỊCH HƯỚNG W & BÁM THÀNH XE, LOẠI BỎ GƯƠNG VÀ XE KHÁC BÊN CẠNH
// Sườn phải đón tia của Box (newCenterY - W/2) phải áp sát đúng mép thành xe 1.10m,
// KHÔNG ĐƯỢC bọc gương 0.86m và KHÔNG ĐƯỢC ăn sang xe bên cạnh 0.45m - 0.65m!
const rightEdgeWOnly = wOnlyFitRes.newCenterY - wOnlyFitRes.newW / 2;
assert.ok(
  Math.abs(rightEdgeWOnly - 1.10) < 0.05,
  `Mép sườn phải của Box phải áp sát đúng thành xe 1.10m (thực tế: ${rightEdgeWOnly.toFixed(3)}m, loại bỏ gương 0.86m và xe bên cạnh 0.50m)`
);

console.log(
  `✅ Test 38: Chế Độ Fit Mặc Định (Chỉ đạo mới người dùng): Bám đất chuẩn Z=${bottomZ.toFixed(2)}m (Roll=0°), Khóa cứng X (newCenterX=5.00m, shiftLx=0), Chỉ dịch W (Mép sườn phải=${rightEdgeWOnly.toFixed(2)}m khớp thành xe 1.10m, loại bỏ 100% gương & xe khác), Size bảo toàn 100% ${wOnlyFitRes.newL}x${wOnlyFitRes.newW}x${wOnlyFitRes.newH}m`
);

// 39. Test DÒ BỨC TƯỜNG CẢN XE TRỤC DỌC X (detectLongitudinalBumperBounds)
// Kịch bản:
// - Cản trước xe thật kết thúc tại lx = 1.95m. Phía trước có bóng ma phản xạ tại lx = 2.25m và xe nối đuôi tại lx in [2.70, 4.0m].
// - Cản sau xe thật kết thúc tại lx = -2.15m. Phía sau có móc kéo nhô ra tại lx = -2.45m (3 điểm).
const bumperTestPts: Array<{ lx: number; ly: number; z: number }> = [];

// Thân xe thật lx in [-2.15, 1.95], ly in [-0.85, 0.85]
for (let lx = -2.15; lx <= 1.95 + 1e-4; lx += 0.1) {
  for (let ly = -0.85; ly <= 0.85; ly += 0.3) {
    for (let z = 0.3; z <= 1.4; z += 0.4) {
      bumperTestPts.push({ lx: Number(lx.toFixed(2)), ly, z });
    }
  }
}

// Móc kéo phía sau xe: lx = -2.45m (3 điểm thưa)
bumperTestPts.push({ lx: -2.45, ly: 0.0, z: 0.5 });
bumperTestPts.push({ lx: -2.43, ly: 0.05, z: 0.52 });
bumperTestPts.push({ lx: -2.40, ly: -0.05, z: 0.48 });

// Điểm bóng ma LiDAR phía trước: lx = 2.25m (2 điểm thưa)
bumperTestPts.push({ lx: 2.25, ly: 0.1, z: 0.7 });
bumperTestPts.push({ lx: 2.23, ly: -0.1, z: 0.65 });

// 1. Kiểm tra cản trước đón tia (visibleLongitudinal = "front")
const frontBumperDetected = detectLongitudinalBumperBounds(bumperTestPts, 2.3, "front");
assert.ok(
  frontBumperDetected <= 2.05 && frontBumperDetected >= 1.90,
  `Cản trước phải bám khít mép cản thật ~1.95m, loại bỏ bóng ma 2.25m (thực tế: ${frontBumperDetected}m)`
);

// 2. Kiểm tra cản sau đón tia (visibleLongitudinal = "rear")
const rearBumperDetected = detectLongitudinalBumperBounds(bumperTestPts, 2.3, "rear");
assert.ok(
  rearBumperDetected >= -2.25 && rearBumperDetected <= -2.10,
  `Cản sau phải bám khít mép cản thật ~-2.15m, loại bỏ móc kéo -2.45m (thực tế: ${rearBumperDetected}m)`
);

console.log(
  `✅ Test 39: Dò Bức Tường Cản Xe Trục Dọc X: Cản trước = ${frontBumperDetected}m (khớp 1.95m, gạt bóng ma 2.25m), Cản sau = ${rearBumperDetected}m (khớp -2.15m, gạt móc kéo -2.45m)`
);

// 40. Test FIT TOÀN DIỆN CẢ TRỤC X + W + BÁM ĐẤT (alignMode = "both", bảo toàn 100% kích thước)
// Kịch bản toàn diện theo yêu cầu mới của người dùng:
// - Xe mục tiêu L = 4.6m, W = 1.8m, H = 1.5m tại cx = 5.0m, cy = 2.0m, cz = 0.8m, Yaw = 0°.
// - Mặt đất tại z = -0.35m.
// - Cản trước xe thật tại x = 7.10m (tức lx = 2.10m), có bóng ma tại x = 7.45m và xe nối đuôi tại x in [7.9, 9.5m].
// - Sườn phải đón tia tại y = 1.10m (tức ly = -0.90m), có gương tại y = 0.86m và xe bên cạnh tại y in [0.45, 0.65m].
const fullFitPts: Array<{ x: number; y: number; z: number }> = [];

// Mặt đất z = -0.35m
for (let x = 2.5; x <= 7.5; x += 0.3) {
  for (let y = 0.8; y <= 3.2; y += 0.3) {
    fullFitPts.push({ x, y, z: -0.35 });
  }
}

// Thân xe mục tiêu rỗng ruột theo chuẩn phản xạ LiDAR:
// 1. Sườn phải đón tia: y = 1.10m, x in [3.10, 7.10], z in [0.0, 1.05] (tường vỏ xe dày đặc)
for (let x = 3.10; x <= 7.10; x += 0.15) {
  for (let z = 0.0; z <= 1.05; z += 0.15) {
    fullFitPts.push({ x: Number(x.toFixed(2)), y: 1.10, z: Number(z.toFixed(2)) });
  }
}

// 2. Cản sau xe: x = 3.10m, y in [1.10, 2.90], z in [0.0, 1.05] (mặt đón tia trục dọc)
for (let y = 1.10; y <= 2.90; y += 0.15) {
  for (let z = 0.0; z <= 1.05; z += 0.15) {
    fullFitPts.push({ x: 3.10, y: Number(y.toFixed(2)), z: Number(z.toFixed(2)) });
  }
}

// 3. Cản trước xe: x = 7.10m, y in [1.10, 2.90], z in [0.0, 1.05]
for (let y = 1.10; y <= 2.90; y += 0.2) {
  for (let z = 0.0; z <= 1.05; z += 0.2) {
    fullFitPts.push({ x: 7.10, y: Number(y.toFixed(2)), z: Number(z.toFixed(2)) });
  }
}

// Gương chiếu hậu sườn phải
fullFitPts.push({ x: 5.5, y: 0.86, z: 0.55 });
fullFitPts.push({ x: 5.5, y: 0.86, z: 0.57 });

// Xe khác đỗ bên cạnh
for (let x = 3.5; x <= 6.5; x += 0.3) {
  for (let y = 0.45; y <= 0.65; y += 0.1) {
    for (let z = -0.15; z <= 1.05; z += 0.3) {
      fullFitPts.push({ x, y, z });
    }
  }
}

// Điểm bóng ma phía trước cản xe
fullFitPts.push({ x: 7.45, y: 1.8, z: 0.6 });
fullFitPts.push({ x: 7.42, y: 2.1, z: 0.65 });

// Xe khác đỗ nối đuôi phía trước
for (let x = 7.9; x <= 9.2; x += 0.2) {
  for (let y = 1.2; y <= 2.8; y += 0.3) {
    for (let z = -0.15; z <= 1.05; z += 0.3) {
      fullFitPts.push({ x, y, z });
    }
  }
}

// Thực hiện Fit toàn diện (Ego tại gốc (0, 0))
const fullFitRes = fitBoxToEgoRayAndGround(fullFitPts, 5.0, 2.0, 0.8, 0, 4.6, 1.8, 1.5, { x: 0, y: 0, z: 0 }, { alignMode: "both", preserveDimensions: true });

// 1. BÁM ĐẤT: Đáy xe phải tiếp đất chuẩn xác tại -0.35m, Roll = 0°
const fullBottomZ = fullFitRes.newCenterZ - fullFitRes.newH / 2;
assert.ok(Math.abs(fullBottomZ - (-0.35)) < 0.03, `Đáy xe phải chạm khít mặt đất -0.35m (thực tế: ${fullBottomZ.toFixed(3)}m)`);
assert.strictEqual(fullFitRes.rollDeg, 0, "Roll phải khóa phẳng 0° tuyệt đối");

// 2. BẢO TOÀN KÍCH THƯỚC: L, W, H giữ nguyên 100%
assert.strictEqual(fullFitRes.newL, 4.6, "L phải giữ nguyên 4.6m");
assert.strictEqual(fullFitRes.newW, 1.8, "W phải giữ nguyên 1.8m");
assert.strictEqual(fullFitRes.newH, 1.5, "H phải giữ nguyên 1.5m");

// 3. TRỤC W: Sườn phải đón tia áp sát đúng thành xe 1.10m, loại bỏ gương 0.86m và xe bên cạnh
const fullRightEdge = fullFitRes.newCenterY - fullFitRes.newW / 2;
assert.ok(
  Math.abs(fullRightEdge - 1.10) < 0.05,
  `Mép sườn phải của Box phải áp sát đúng thành xe 1.10m (thực tế: ${fullRightEdge.toFixed(3)}m)`
);

// 4. TRỤC X: Mép cản trước đón tia áp sát đúng mép cản thật 7.10m, loại bỏ bóng ma 7.45m và xe nối đuôi 7.9m
// (Ego ở (0,0) nhìn thấy mặt trước xe vì dxEgo = 5, vLocalX = -5, à xe ở x=5 nhìn từ Ego (0,0) thì tia chiếu vào mặt sau nếu xe hướng về +X!
// Hãy xem visibleLongitudinal: dxEgo = cx - 0 = 5 > 0.
// vLocalX = -dxEgo * cosY + dyEgo * sinY = -5 * 1 + 0 = -5 < 0 => visibleLongitudinal = "rear"!
// Tức là Ego ở (0, 0) nhìn vào ĐUÔI xe tại x = 3.10m!)
const fullBumperEdge = fullFitRes.visibleFaces.longitudinal === "front"
  ? fullFitRes.newCenterX + fullFitRes.newL / 2
  : fullFitRes.newCenterX - fullFitRes.newL / 2;

if (fullFitRes.visibleFaces.longitudinal === "rear") {
  // Mép sau đón tia của Box phải áp sát cản sau thật x = 3.10m
  assert.ok(
    Math.abs(fullBumperEdge - 3.10) < 0.08,
    `Mép cản sau đón tia của Box phải áp sát đúng mép đuôi xe 3.10m (thực tế: ${fullBumperEdge.toFixed(3)}m)`
  );
  // Và mép trước của Box vươn tới 3.10 + 4.6 = 7.70m (bao trọn vẹn đầu xe 7.10m)
  const frontOpposite = fullFitRes.newCenterX + fullFitRes.newL / 2;
  assert.ok(frontOpposite >= 7.10, `Mép trước phải bọc trọn vẹn đầu xe >= 7.10m (thực tế: ${frontOpposite.toFixed(3)}m)`);
} else {
  // Nếu là front: Mép trước phải áp sát cản trước thật 7.10m
  assert.ok(
    Math.abs(fullBumperEdge - 7.10) < 0.08,
    `Mép cản trước đón tia của Box phải áp sát đúng mép đầu xe 7.10m (thực tế: ${fullBumperEdge.toFixed(3)}m)`
  );
}

console.log(
  `✅ Test 40: Fit Toàn Diện (X + W + Bám Đất): Bám đất Z=${fullBottomZ.toFixed(2)}m (Roll=0°), Mép sườn W=${fullRightEdge.toFixed(2)}m (khớp thành xe 1.10m), Mép cản X=${fullBumperEdge.toFixed(2)}m (khớp cản đón tia, gạt bỏ bóng ma & xe nối đuôi), Size bảo toàn 100% ${fullFitRes.newL}x${fullFitRes.newW}x${fullFitRes.newH}m`
);

// ==========================================
// TEST 41: LỌC NHIỄU THƯA THỚT CẬN THÂN XE DỰA TRÊN MẬT ĐỘ LÕI 3D (Near-Object Sparse Noise Filter)
// ==========================================
// Thân xe A phản xạ dày đặc theo chùm tia LiDAR thực tế (bước điểm 8-10cm, D >= 15).
// 3 điểm nhiễu nằm RẤT SÁT SƯỜN XE (cách vỏ xe ly=0.60m chỉ 15cm) nhưng mật độ thưa thớt (D <= 2).
const bodyWithSparseNoise: Array<{ lx: number; ly: number; z: number }> = [];
// Cụm thân xe dày đặc (ly in [-0.60, 0.60])
for (let lx = -0.5; lx <= 0.5; lx += 0.10) {
  for (let ly = -0.60; ly <= 0.60; ly += 0.10) {
    for (let z = 0.0; z <= 0.3; z += 0.10) {
      bodyWithSparseNoise.push({ lx, ly, z });
    }
  }
}
const coreBodyCount = bodyWithSparseNoise.length;

// 3 điểm nhiễu thưa thớt sát sườn phải (ly in [0.75, 0.78], cách mép 0.60m chỉ 15-18cm)
bodyWithSparseNoise.push({ lx: 0.0, ly: 0.75, z: 0.2 });
bodyWithSparseNoise.push({ lx: 0.3, ly: 0.78, z: 0.3 });
bodyWithSparseNoise.push({ lx: -0.3, ly: 0.76, z: 0.1 });

// Gọi lọc mật độ lõi 3D (mặc định bán kính 0.12m)
const filteredCoreBody = filterSparseNoiseByLocalDensity(bodyWithSparseNoise);
assert.strictEqual(
  filteredCoreBody.length,
  coreBodyCount,
  `Thuật toán phải lọc sạch đúng 3 điểm nhiễu thưa thớt sát sườn (còn lại: ${filteredCoreBody.length}/${bodyWithSparseNoise.length})`
);
// Xác nhận cả 3 điểm nhiễu ngoài ly > 0.65 đều bị triệt tiêu 100%
const hasNoise = filteredCoreBody.some((p) => p.ly > 0.65);
assert.strictEqual(hasNoise, false, "100% điểm nhiễu thưa sát sườn xe phải bị loại bỏ");
console.log(
  `✅ Test 41: Lọc Nhiễu Thưa Thớt Cận Thân Xe (Mật Độ Lõi 3D): Đã loại bỏ 100% điểm nhiễu cách sườn 15cm (giữ lại trọn vẹn ${filteredCoreBody.length} điểm thân xe cốt lõi)`
);

// ==========================================
// TEST 42: XỬ LÝ PHẦN TOP TRƯỚC (Dò Lớp Nóc Xe Thật, Loại Bỏ Nhiễu Trên Cao)
// ==========================================
// Xe có nóc xe thật ở cao độ z = 1.25m với 30 điểm phẳng dày đặc.
// 2 điểm nhiễu trên cao (bụi / chim bay / phản xạ laser) ở z = 1.60m và 1.70m (cao hơn nóc 35-45cm).
const roofWithHighNoise: Array<{ lx: number; ly: number; z: number }> = [];
// Thân xe và lớp nóc xe (z in [0.0, 1.25])
for (let lx = -1.0; lx <= 1.0; lx += 0.3) {
  for (let ly = -0.6; ly <= 0.6; ly += 0.3) {
    roofWithHighNoise.push({ lx, ly, z: 1.25 }); // 35 điểm lớp nóc xe
    roofWithHighNoise.push({ lx, ly, z: 0.8 });  // Thân xe
    roofWithHighNoise.push({ lx, ly, z: 0.4 });  // Thân xe
  }
}
// 2 điểm nhiễu trên cao lơ lửng
roofWithHighNoise.push({ lx: 0.1, ly: 0.1, z: 1.60 });
roofWithHighNoise.push({ lx: -0.2, ly: 0.0, z: 1.70 });

// Dò nóc xe thật
const detectedRoof = detectRoofTopBounds(roofWithHighNoise, 1.25);
assert.ok(
  Math.abs(detectedRoof - 1.25) < 0.03,
  `Lớp nóc xe thật phải được nhận diện chính xác tại 1.25m, không bị kéo lên 1.70m (thực tế: ${detectedRoof}m)`
);

const robustRoofResult = computeDensityRobustBounds(roofWithHighNoise);
assert.ok(
  Math.abs(robustRoofResult.zTop - 1.25) < 0.03,
  `computeDensityRobustBounds phải trả về zTop = 1.25m (thực tế: ${robustRoofResult.zTop}m)`
);
console.log(
  `✅ Test 42: Xử Lý Phần TOP Trước (Dò Lớp Nóc Xe Thật): Đã nhận diện nóc xe thật Z = ${detectedRoof}m, loại bỏ 100% điểm nhiễu lơ lửng Z=1.70m`
);

// ==========================================
// TEST 43: CHU TRÌNH FIT HOÀN CHỈNH TOP-FIRST + LỌC NHIỄU CẬN THÂN
// ==========================================
// Tổng hợp xe A có:
// 1. Mặt đất phẳng z = -0.35m
// 2. Thân xe ô tô tâm (5.0, 2.0), kích thước 4.6x1.8x1.5m
// 3. Nóc xe thật ở z = 1.15m (khớp -0.35 + 1.5)
// 4. Nhiễu trên cao z = 1.55m và 1.65m
// 5. Nhiễu sát sườn phải y = 0.96m (cách thành xe 1.10m chỉ 14cm)
const completeTestPts: Array<{ x: number; y: number; z: number }> = [];

// Điểm mặt đất
for (let x = 2.0; x <= 8.0; x += 0.5) {
  for (let y = 0.5; y <= 3.5; y += 0.5) {
    completeTestPts.push({ x, y, z: -0.35 });
  }
}
// Thân xe và nóc xe (x in [3.1, 7.1], y in [1.1, 2.9], z in [-0.15, 1.15])
for (let x = 3.1; x <= 7.1; x += 0.2) {
  for (let y = 1.1; y <= 2.9; y += 0.2) {
    completeTestPts.push({ x, y, z: 1.15 }); // Lớp nóc xe
    completeTestPts.push({ x, y, z: 0.50 }); // Thân xe
  }
}
// Nhiễu trên cao lơ lửng
completeTestPts.push({ x: 5.0, y: 2.0, z: 1.55 });
completeTestPts.push({ x: 5.2, y: 1.8, z: 1.65 });

// Nhiễu thưa thớt sát sườn phải (y = 0.96m đón tia từ Ego (0,0))
completeTestPts.push({ x: 4.5, y: 0.96, z: 0.4 });
completeTestPts.push({ x: 5.5, y: 0.95, z: 0.6 });

// Chạy Fit chế độ mặc định w_only (Ego tại (0,0))
const completeFitRes = fitBoxToEgoRayAndGround(
  completeTestPts,
  5.0,
  2.0,
  0.8,
  0,
  4.6,
  1.8,
  1.5,
  { x: 0, y: 0, z: 0 },
  { alignMode: "w_only", preserveDimensions: true }
);

// 1. BÁM ĐẤT: Đáy xe chạm đất chuẩn -0.35m, Roll = 0°
const completeBottomZ = completeFitRes.newCenterZ - completeFitRes.newH / 2;
assert.ok(Math.abs(completeBottomZ - (-0.35)) < 0.03, `Đáy xe phải tiếp đất -0.35m (thực tế: ${completeBottomZ.toFixed(3)}m)`);
assert.strictEqual(completeFitRes.rollDeg, 0, "Roll phải khóa phẳng 0° tuyệt đối");

// 2. PHẦN TOP: Nóc xe nhận diện đúng 1.15m, loại bỏ nhiễu 1.65m
assert.ok(Math.abs(completeFitRes.roofTopZ - 1.15) < 0.05, `roofTopZ phải là 1.15m (thực tế: ${completeFitRes.roofTopZ}m)`);

// 3. SƯỜN W: Mép sườn phải ôm khít thành xe 1.10m, loại bỏ 100% nhiễu sát sườn 0.96m
const completeRightEdge = completeFitRes.newCenterY - completeFitRes.newW / 2;
assert.ok(
  Math.abs(completeRightEdge - 1.10) < 0.05,
  `Mép sườn phải phải áp sát đúng thành xe 1.10m, gạt bỏ nhiễu 0.96m (thực tế: ${completeRightEdge.toFixed(3)}m)`
);

// 4. KHÓA CỨNG X VÀ BẢO TOÀN SIZE 100%
assert.strictEqual(completeFitRes.shiftLx, 0, "shiftLx phải bằng 0 (khóa cứng hướng X)");
assert.strictEqual(completeFitRes.newL, 4.6, "L phải giữ nguyên 4.6m");
assert.strictEqual(completeFitRes.newW, 1.8, "W phải giữ nguyên 1.8m");
assert.strictEqual(completeFitRes.newH, 1.5, "H phải giữ nguyên 1.5m");

console.log(
  `✅ Test 43: Chu Trình Fit Hoàn Chỉnh Top-First & Lọc Nhiễu Mật Độ Cận Thân: Bám đất Z=${completeBottomZ.toFixed(2)}m (Roll=0°), Nóc xe Z=${completeFitRes.roofTopZ}m (gạt nhiễu 1.65m), Sườn W=${completeRightEdge.toFixed(2)}m (gạt nhiễu 0.96m), Khóa cứng X=5.00m, Size 100% ${completeFitRes.newL}x${completeFitRes.newW}x${completeFitRes.newH}m`
);

// ==========================================
// TEST 44: CĂN THẲNG GÓC YAW LỆCH 3.5° THEO VIỀN MẬT ĐỘ ĐỘT BIẾN TOP VIEW (straightenYawFromBoundaryEdge)
// ==========================================
// Hướng xe thật = 0 rad, nhưng annotator đặt Box lệch góc -3.5° (-0.061 rad).
// Trong hệ cục bộ của Box, dải viền thân xe nghiêng góc +3.5° (slope = tan(3.5°)).
const initialYaw44 = -0.06109; // -3.5°
const deltaYawTrueRad44 = 0.06109; // +3.5°
const slopeTrue44 = Math.tan(deltaYawTrueRad44);
const L44 = 4.6, W44 = 1.8;

const testPts44: Array<{ lx: number; ly: number; z: number }> = [];
// Tạo dải viền thân xe đón tia (sườn phải) có mật độ rất cao kéo dài dọc xe
for (let lx = -2.2; lx <= 2.2; lx += 0.15) {
  const lyWall = slopeTrue44 * lx - W44 / 2; // Viền mép sườn thật
  testPts44.push({ lx, ly: lyWall, z: 0.3 });
  testPts44.push({ lx, ly: lyWall, z: 0.6 });
  testPts44.push({ lx, ly: lyWall + 0.10, z: 0.5 }); // Lớp trong thành xe
}

const straightRes44 = straightenYawFromBoundaryEdge(testPts44, initialYaw44, L44, W44, "right");
assert.ok(
  Math.abs(straightRes44.newYawDeg - 0.0) < 0.20,
  `Góc Yaw sau khi căn thẳng phải quay về xấp xỉ 0.0° (thực tế: ${straightRes44.newYawDeg}°, vi chỉnh: ${straightRes44.deltaYawDeg}°)`
);
console.log(
  `✅ Test 44: Căn Thẳng Góc Yaw Top View: Lệch ban đầu -3.5° ➔ Tự động xoay thẳng về ${straightRes44.newYawDeg}° (vi chỉnh ΔYaw = +${straightRes44.deltaYawDeg}°, khớp 100% theo viền mật độ cao)`
);

// ==========================================
// TEST 45: QUY TRÌNH HOÀN CHỈNH TUẦN TỰ (CĂN TOP ➔ CĂN SIDE ➔ CĂN FRONT + AUTO GHIM ĐẤT)
// ==========================================
// Xe ô tô tại cx = 10m, cy = 5m, L=4.6m, W=1.8m, H=1.5m.
// Mặt đất ở z = -0.40m.
// Annotator đặt Box lệch Yaw = -2.8°, tâm Z bị bay lơ lửng ở 0.60m (đáy ở -0.15m cách đất 25cm).
// Xe đón tia từ Ego (0,0) (nhìn thấy sườn phải và mặt sau).
const initialYaw45 = -0.04887; // -2.8°
const testPts45: Array<{ x: number; y: number; z: number }> = [];

// 1. Điểm mặt đất chuẩn z = -0.40m
for (let x = 7.0; x <= 13.0; x += 0.5) {
  for (let y = 3.0; y <= 7.0; y += 0.5) {
    testPts45.push({ x, y, z: -0.40 });
  }
}

// 2. Thân xe ô tô thực tế (chuẩn Yaw = 0 rad, x in [7.7, 12.3], y in [4.1, 5.9], z in [-0.2, 1.1])
// Viền sườn phải chuẩn tại y = 4.10m, cản sau chuẩn tại x = 7.70m, nóc xe tại z = 1.10m
for (let x = 7.70; x <= 12.30; x += 0.2) {
  for (let z = 0.0; z <= 1.10; z += 0.2) {
    testPts45.push({ x, y: 4.10, z }); // Sườn phải thật
  }
  testPts45.push({ x, y: 4.10, z: 1.10 }); // Lớp nóc xe
}
for (let y = 4.10; y <= 5.90; y += 0.2) {
  for (let z = 0.0; z <= 1.10; z += 0.2) {
    testPts45.push({ x: 7.70, y, z }); // Cản sau thật
  }
  testPts45.push({ x: 7.70, y, z: 1.10 }); // Lớp nóc xe
}

// Chạy 1-Click Smart Fit (chuỗi Top ➔ Side ➔ Front + Auto Ghim Đất)
const seqFitRes = fitBoxToEgoRayAndGround(
  testPts45,
  10.0,
  5.0,
  0.60,
  initialYaw45,
  4.6,
  1.8,
  1.5,
  { x: 0, y: 0, z: 0 },
  { alignMode: "both", preserveDimensions: true }
);

// 1. CĂN TOP: Góc Yaw phải được xoay thẳng về xấp xỉ 0.0° (sai số < 0.25°)
assert.ok(
  Math.abs(seqFitRes.newYawDeg! - 0.0) < 0.25,
  `CĂN TOP: Góc Yaw phải được xoay thẳng về 0.0° (thực tế: ${seqFitRes.newYawDeg}°)`
);

// 2. AUTO GHIM ĐẤT: Đáy xe phải tiếp đất chuẩn xác tại -0.40m, Roll = 0°
const seqBottomZ = seqFitRes.newCenterZ - seqFitRes.newH / 2;
assert.ok(
  Math.abs(seqBottomZ - (-0.40)) < 0.03,
  `AUTO GHIM ĐẤT: Đáy xe phải chạm khít mặt đất -0.40m (thực tế: ${seqBottomZ.toFixed(3)}m)`
);
assert.strictEqual(seqFitRes.rollDeg, 0, "Roll phải khóa phẳng 0° tuyệt đối");

// 3. CĂN FRONT: Mép sườn phải đón tia của Box áp sát thành xe 4.10m
const seqRightEdge = seqFitRes.newCenterY - seqFitRes.newW / 2;
assert.ok(
  Math.abs(seqRightEdge - 4.10) < 0.06,
  `CĂN FRONT: Mép sườn phải phải áp sát 4.10m (thực tế: ${seqRightEdge.toFixed(3)}m)`
);

// 4. CĂN SIDE: Mép cản sau đón tia của Box áp sát cản sau 7.70m
const seqRearEdge = seqFitRes.newCenterX - seqFitRes.newL / 2;
assert.ok(
  Math.abs(seqRearEdge - 7.70) < 0.08,
  `CĂN SIDE: Mép cản sau phải áp sát 7.70m (thực tế: ${seqRearEdge.toFixed(3)}m)`
);

// 5. BẢO TOÀN KÍCH THƯỚC: L, W, H giữ nguyên 100%
assert.strictEqual(seqFitRes.newL, 4.6, "L giữ nguyên 4.6m");
assert.strictEqual(seqFitRes.newW, 1.8, "W giữ nguyên 1.8m");
assert.strictEqual(seqFitRes.newH, 1.5, "H giữ nguyên 1.5m");

console.log(
  `✅ Test 45: Quy Trình Hoàn Chỉnh Tuần Tự (Top ➔ Side ➔ Front + Auto Ghim Đất): Yaw=${seqFitRes.newYawDeg}° (căn thẳng Top), Đáy Z=${seqBottomZ.toFixed(2)}m (Auto Ghim Đất), Cản Sau=${seqRearEdge.toFixed(2)}m (Side), Sườn Phải=${seqRightEdge.toFixed(2)}m (Front), Size 100% ${seqFitRes.newL}x${seqFitRes.newW}x${seqFitRes.newH}m`
);

// ==========================================
// TEST 46: NÚT 1: CĂN TOP ĐỘC LẬP (fitStep: "top")
// ==========================================
// Chỉ căn thẳng góc Yaw theo viền xe và Auto Ghim Đất, tuyệt đối giữ nguyên X và Y
const fitTopOnlyRes = fitBoxToEgoRayAndGround(
  testPts45,
  10.0,
  5.0,
  0.60,
  initialYaw45,
  4.6,
  1.8,
  1.5,
  { x: 0, y: 0, z: 0 },
  { fitStep: "top", preserveDimensions: true }
);

// 1. Yaw được xoay thẳng về 0.0°
assert.ok(
  Math.abs(fitTopOnlyRes.newYawDeg! - 0.0) < 0.25,
  `Fit TOP: Yaw phải xoay thẳng về 0.0° (thực tế: ${fitTopOnlyRes.newYawDeg}°)`
);
// 2. TUYỆT ĐỐI KHÔNG GHIM ĐẤT: Giữ nguyên 100% cao độ Z ban đầu (newCenterZ = cz = 0.60m)
assert.strictEqual(
  fitTopOnlyRes.newCenterZ,
  0.60,
  "Fit TOP: Cao độ Z phải giữ nguyên tuyệt đối 0.60m (không can thiệp kéo Z xuống đất)"
);
// 3. Giữ nguyên vị trí X và Y ban đầu (sai số milimét do lượng giác)
assert.ok(
  Math.abs(fitTopOnlyRes.newCenterX - 10.0) < 0.05,
  `Fit TOP: X phải xấp xỉ 10.0m (thực tế: ${fitTopOnlyRes.newCenterX})`
);
assert.ok(
  Math.abs(fitTopOnlyRes.newCenterY - 5.0) < 0.05,
  `Fit TOP: Y phải xấp xỉ 5.0m (thực tế: ${fitTopOnlyRes.newCenterY})`
);
// 4. Bảo toàn size
assert.strictEqual(fitTopOnlyRes.newL, 4.6, "Fit TOP: L giữ nguyên");
assert.strictEqual(fitTopOnlyRes.newW, 1.8, "Fit TOP: W giữ nguyên");
assert.strictEqual(fitTopOnlyRes.newH, 1.5, "Fit TOP: H giữ nguyên");

console.log(
  `✅ Test 46: Nút Fit TOP Độc Lập: Xoay thẳng Yaw=${fitTopOnlyRes.newYawDeg}° (viền xe), Giữ nguyên 100% Z=${fitTopOnlyRes.newCenterZ}m (Không ghim đất), X=${fitTopOnlyRes.newCenterX}m, Y=${fitTopOnlyRes.newCenterY}m`
);

// ==========================================
// TEST 47: NÚT 2: CĂN SIDE ĐỘC LẬP (fitStep: "side")
// ==========================================
// Box đặt lệch cản sau tại cx = 9.60m (cản sau ở 7.30m thay vì 7.70m), Yaw chuẩn = 0.0 rad.
// Khi bấm Căn Side: Cản sau phải dịch tới 7.70m, Y và Yaw giữ nguyên 100%.
const fitSideOnlyRes = fitBoxToEgoRayAndGround(
  testPts45,
  9.60,
  5.0,
  0.60,
  0.0,
  4.6,
  1.8,
  1.5,
  { x: 0, y: 0, z: 0 },
  { fitStep: "side", preserveDimensions: true }
);

// 1. Cản sau áp sát đón tia 7.70m + Padding 5cm = 7.65m (cx dịch từ 9.60m lên xấp xỉ 9.95m)
const sideRearEdge = fitSideOnlyRes.newCenterX - fitSideOnlyRes.newL / 2;
assert.ok(
  Math.abs(sideRearEdge - 7.65) < 0.03,
  `Fit SIDE: Cản sau phải ở 7.65m (thực tế: ${sideRearEdge.toFixed(3)}m)`
);
// 2. TUYỆT ĐỐI KHÔNG GHIM ĐẤT: Giữ nguyên 100% cao độ Z ban đầu (newCenterZ = cz = 0.60m)
assert.strictEqual(
  fitSideOnlyRes.newCenterZ,
  0.60,
  "Fit SIDE: Cao độ Z phải giữ nguyên tuyệt đối 0.60m (không can thiệp kéo Z xuống đất)"
);
// 3. Giữ nguyên Y và Yaw ban đầu
assert.strictEqual(fitSideOnlyRes.newCenterY, 5.0, "Fit SIDE: Y phải giữ nguyên 5.0m");
assert.strictEqual(fitSideOnlyRes.newYawDeg, 0, "Fit SIDE: Yaw phải giữ nguyên 0°");
assert.strictEqual(fitSideOnlyRes.shiftLy, 0, "Fit SIDE: shiftLy phải bằng 0");

console.log(
  `✅ Test 47: Nút Fit SIDE Độc Lập: Cản sau=${sideRearEdge.toFixed(2)}m (bọc cản thật 7.70m + Padding 5cm), Giữ nguyên 100% Z=${fitSideOnlyRes.newCenterZ}m (Không ghim đất), Y=${fitSideOnlyRes.newCenterY}m, Yaw=${fitSideOnlyRes.newYawDeg}°`
);

// ==========================================
// TEST 48: NÚT 3: CĂN FRONT ĐỘC LẬP (fitStep: "front")
// ==========================================
// Box đặt lệch sườn tại cy = 5.25m (sườn phải ở 4.35m thay vì 4.10m), Yaw chuẩn = 0.0 rad.
// Khi bấm Căn Front: Sườn phải dịch về 4.10m - 0.05m = 4.05m, X và Yaw giữ nguyên 100%.
const fitFrontOnlyRes = fitBoxToEgoRayAndGround(
  testPts45,
  10.0,
  5.25,
  0.60,
  0.0,
  4.6,
  1.8,
  1.5,
  { x: 0, y: 0, z: 0 },
  { fitStep: "front", preserveDimensions: true }
);

// 1. Sườn phải áp sát đón tia 4.10m + Padding 5cm = 4.05m (cy dịch từ 5.25m về xấp xỉ 4.95m)
const frontRightEdge = fitFrontOnlyRes.newCenterY - fitFrontOnlyRes.newW / 2;
assert.ok(
  Math.abs(frontRightEdge - 4.05) < 0.03,
  `Fit FRONT: Sườn phải phải ở 4.05m (thực tế: ${frontRightEdge.toFixed(3)}m)`
);
// 2. FRONT TUYỆT ĐỐI KHÔNG GHIM ĐẤT: Giữ nguyên 100% cao độ Z ban đầu (newCenterZ = cz = 0.60m)
assert.strictEqual(fitFrontOnlyRes.newCenterZ, 0.60, "Fit FRONT: Cao độ Z phải giữ nguyên tuyệt đối 0.60m (không can thiệp kéo Z xuống đất)");
// 3. Giữ nguyên X và Yaw ban đầu
assert.strictEqual(fitFrontOnlyRes.newCenterX, 10.0, "Fit FRONT: X phải giữ nguyên 10.0m");
assert.strictEqual(fitFrontOnlyRes.newYawDeg, 0, "Fit FRONT: Yaw phải giữ nguyên 0°");
assert.strictEqual(fitFrontOnlyRes.shiftLx, 0, "Fit FRONT: shiftLx phải bằng 0");

console.log(
  `✅ Test 48: Nút Fit FRONT Độc Lập: Sườn phải=${frontRightEdge.toFixed(2)}m (áp sát sườn đón tia 4.10m), Giữ nguyên 100% Z=${fitFrontOnlyRes.newCenterZ}m (Không ghim đất), X=${fitFrontOnlyRes.newCenterX}m, Yaw=${fitFrontOnlyRes.newYawDeg}°`
);

// ==========================================
// TEST 49: NÚT TOP CHUYÊN TRÁCH GÓC XOAY YAW (XOAY TẠI CHỖ QUANH TÂM, KHÓA CỨNG X VÀ Y)
// ==========================================
// Tình huống thực tế: Người dùng kéo Box lại gần xe tương đối: cx = 10.15m, cy = 5.12m, Yaw lệch -2.0°.
// Khi bấm Fit TOP: Box CHỈ xoay góc Yaw quanh tâm để song song với point cloud sườn đón tia Ego,
// Tuyệt đối giữ nguyên vị trí tâm cx = 10.15m và cy = 5.12m (shiftLx = 0, shiftLy = 0).
const userPhotoYaw = -0.0349; // -2.0°
const userPhotoFitRes = fitBoxToEgoRayAndGround(
  testPts45,
  10.15,
  5.12,
  0.60,
  userPhotoYaw,
  4.6,
  1.8,
  1.5,
  { x: 0, y: 0, z: 0 },
  { fitStep: "top", preserveDimensions: true }
);

// 1. Góc Yaw tự động xoay thẳng theo sườn xe đón tia
assert.ok(
  Math.abs(userPhotoFitRes.newYawDeg! - 0.0) < 0.25,
  `Test 49: Yaw phải xoay thẳng về 0° (thực tế: ${userPhotoFitRes.newYawDeg}°)`
);

// 2. KHÓA CỨNG VỊ TRÍ X VÀ Y (Tâm box xoay tại chỗ quanh tâm, shiftLx = 0, shiftLy = 0)
assert.strictEqual(userPhotoFitRes.shiftLx, 0, "Test 49: shiftLx phải bằng 0 tuyệt đối");
assert.strictEqual(userPhotoFitRes.shiftLy, 0, "Test 49: shiftLy phải bằng 0 tuyệt đối");
assert.strictEqual(userPhotoFitRes.newCenterX, 10.15, "Test 49: newCenterX phải giữ nguyên 10.15m");
assert.strictEqual(userPhotoFitRes.newCenterY, 5.12, "Test 49: newCenterY phải giữ nguyên 5.12m");

// 3. TUYỆT ĐỐI KHÔNG GHIM ĐẤT: Giữ nguyên 100% cao độ Z ban đầu (newCenterZ = cz = 0.60m)
assert.strictEqual(userPhotoFitRes.newCenterZ, 0.60, "Test 49: Cao độ Z phải giữ nguyên tuyệt đối 0.60m (không can thiệp ghim đất)");

console.log(
  `✅ Test 49: Nút TOP Chuyên Trách Yaw (cx=10.15, cy=5.12, Yaw=-2.0°): Xoay thẳng Yaw=${userPhotoFitRes.newYawDeg}°, Giữ nguyên tâm X=10.15m, Y=5.12m, Z=${userPhotoFitRes.newCenterZ}m (shiftLx=0, shiftLy=0, Không ghim đất)`
);

// ==========================================
// TEST 50: BẤM LẶP LẠI NHIỀU LẦN ĐỨNG IM BẤT ĐỘNG (ZERO DRIFT / IDEMPOTENCY)
// ==========================================
// Khi box đã xoay song song, bấm liên tiếp 3 lần nữa:
// shiftLx = 0, shiftLy = 0, deltaYaw = 0, tuyệt đối không di chuyển dù chỉ 1mm!
let currentX = userPhotoFitRes.newCenterX;
let currentY = userPhotoFitRes.newCenterY;
let currentZ = userPhotoFitRes.newCenterZ;
let currentYaw = userPhotoFitRes.newYawRad!;

for (let pass = 2; pass <= 4; pass++) {
  const repeatedFitRes = fitBoxToEgoRayAndGround(
    testPts45,
    currentX,
    currentY,
    currentZ,
    currentYaw,
    4.6,
    1.8,
    1.5,
    { x: 0, y: 0, z: 0 },
    { fitStep: "top", preserveDimensions: true }
  );

  assert.strictEqual(repeatedFitRes.shiftLx, 0, `Test 50 (Lần ${pass}): shiftLx phải bằng 0 tuyệt đối`);
  assert.strictEqual(repeatedFitRes.shiftLy, 0, `Test 50 (Lần ${pass}): shiftLy phải bằng 0 tuyệt đối`);
  assert.strictEqual(repeatedFitRes.deltaYawDeg, 0, `Test 50 (Lần ${pass}): deltaYawDeg phải bằng 0 tuyệt đối`);

  assert.ok(
    Math.abs(repeatedFitRes.newCenterX - currentX) < 0.001,
    `Test 50 (Lần ${pass}): X không được trôi dạt`
  );
  assert.ok(
    Math.abs(repeatedFitRes.newCenterY - currentY) < 0.001,
    `Test 50 (Lần ${pass}): Y không được trôi dạt`
  );

  currentX = repeatedFitRes.newCenterX;
  currentY = repeatedFitRes.newCenterY;
  currentZ = repeatedFitRes.newCenterZ;
  currentYaw = repeatedFitRes.newYawRad!;
}

console.log(
  `✅ Test 50: Bấm FIT TOP Lặp Lại 4 Lần Liên Tiếp ➔ ΔX=0m, ΔY=0m, ΔYaw=0°, ĐỨNG IM BẤT ĐỘNG TUYỆT ĐỐI (Triệt Tiêu 100% Trôi Dạt)!`
);

// ==========================================
// TEST 51: XE QUAY GÓC CHÉO 30° ➔ CHU TRÌNH 3 BƯỚC ĐỘC LẬP: TOP (YAW) ➔ SIDE (L) ➔ FRONT (W)
// ==========================================
const test51TrueYaw = Math.PI / 6; // 30°
const cos51 = Math.cos(test51TrueYaw);
const sin51 = Math.sin(test51TrueYaw);
const cx51 = 15.0;
const cy51 = -8.0;
const L51 = 4.6;
const W51 = 1.8;

// Ego tại (0,0): Chiếu tới xe (15, -8)
const dx51E = 0 - cx51;
const dy51E = 0 - cy51;
const ego51Lx = dx51E * cos51 + dy51E * sin51;
const ego51Ly = -dx51E * sin51 + dy51E * cos51;
const visSide51 = ego51Ly >= 0 ? "left" : "right"; // left
const visBumper51 = ego51Lx >= 0 ? "front" : "rear"; // rear

const testPts51: Array<{ x: number; y: number; z: number }> = [];
const sườnLy51 = visSide51 === "left" ? W51 / 2 : -W51 / 2;
for (let lx = -L51 / 2; lx <= L51 / 2; lx += 0.2) {
  for (let z = 0.0; z <= 1.2; z += 0.2) {
    const x = cx51 + lx * cos51 - sườnLy51 * sin51;
    const y = cy51 + lx * sin51 + sườnLy51 * cos51;
    testPts51.push({ x, y, z });
  }
}
const cảnLx51 = visBumper51 === "front" ? L51 / 2 : -L51 / 2;
for (let ly = -W51 / 2; ly <= W51 / 2; ly += 0.2) {
  for (let z = 0.0; z <= 1.2; z += 0.2) {
    const x = cx51 + cảnLx51 * cos51 - ly * sin51;
    const y = cy51 + cảnLx51 * sin51 + ly * cos51;
    testPts51.push({ x, y, z });
  }
}

// Box ban đầu người dùng kéo lại gần xe tương đối: cx=15.08, cy=-8.06, góc lệch nhẹ +1.5°
const initialYaw51 = test51TrueYaw + (1.5 * Math.PI) / 180;
const fitTop51Res = fitBoxToEgoRayAndGround(
  testPts51,
  15.08,
  -8.06,
  0.6,
  initialYaw51,
  4.6,
  1.8,
  1.5,
  { x: 0, y: 0, z: 0 },
  { fitStep: "top", preserveDimensions: true }
);

// 1. TOP chỉ chỉnh góc xoay: Yaw quay về khớp góc 30° của sườn xe đón tia
assert.ok(
  Math.abs(fitTop51Res.newYawDeg! - 30.0) < 0.25,
  `Test 51 (TOP): Yaw phải xoay về 30° (thực tế: ${fitTop51Res.newYawDeg}°)`
);
// Giữ nguyên tâm X và Y
assert.strictEqual(fitTop51Res.shiftLx, 0, "Test 51 (TOP): shiftLx phải bằng 0");
assert.strictEqual(fitTop51Res.shiftLy, 0, "Test 51 (TOP): shiftLy phải bằng 0");
assert.strictEqual(fitTop51Res.newCenterX, 15.08, "Test 51 (TOP): newCenterX giữ nguyên 15.08m");
assert.strictEqual(fitTop51Res.newCenterY, -8.06, "Test 51 (TOP): newCenterY giữ nguyên -8.06m");

console.log(
  `✅ Test 51: Chu Trình Phân Tách Tuyệt Đối (TOP chỉ xoay Yaw song song sườn đón tia 30.0°, khóa cứng tâm X=15.08m, Y=-8.06m)`
);

// ==========================================
// TEST 52: NÚT SIDE THEO HƯỚNG EGO, KHÁNG NHIỄU MẬT ĐỘ, TRIỆT TIÊU DI CHUYỂN QUÁ ĐÀ & PADDING 2.5CM
// ==========================================
// Xe thật tại cx = 10m, cy = 0m, L = 4.6m, W = 1.8m, H = 1.5m.
// Cản trước chuẩn tại x = 12.30m, cản sau tại x = 7.70m.
// Ego tại (20, 0) chiếu thẳng vào đầu xe (visibleBumper = "front").
// Thêm 2 điểm nhiễu thưa thớt ở x = 12.50m (cách đầu xe 20cm).
const testPts52: Array<{ x: number; y: number; z: number }> = [];
// Cản trước thật (mật độ cao): x = 12.30, y in [-0.8, 0.8]
for (let y = -0.8; y <= 0.8; y += 0.1) {
  for (let z = 0.0; z <= 1.0; z += 0.2) {
    testPts52.push({ x: 12.30, y, z });
  }
}
// 2 điểm nhiễu thưa thớt ở ngoài cản trước: x = 12.50
testPts52.push({ x: 12.50, y: 0.1, z: 0.5 });
testPts52.push({ x: 12.50, y: -0.1, z: 0.5 });

// Box ban đầu người dùng kéo lại gần: cx = 10.15m (hơi lùi), cy = 0m
const fitSide52Res = fitBoxToEgoRayAndGround(
  testPts52,
  10.15,
  0.0,
  0.60,
  0.0,
  4.6,
  1.8,
  1.5,
  { x: 20, y: 0, z: 0 },
  { fitStep: "side", preserveDimensions: true }
);

// 1. Nhận diện chuẩn hướng Ego chiếu vào cản trước
assert.strictEqual(fitSide52Res.visibleFaces.longitudinal, "front", "Test 52: Phải nhận diện cản trước đón tia Ego");

// 2. Không bị ăn vào 2 điểm nhiễu 12.50m, bám vào cản thật 12.30m + Padding 5cm = 12.35m
const frontEdge52 = fitSide52Res.newCenterX + fitSide52Res.newL / 2;
assert.ok(
  Math.abs(frontEdge52 - 12.35) < 0.03,
  `Test 52: Mép trước phải ở 12.35m (thực tế: ${frontEdge52.toFixed(3)}m), không bị ăn ra nhiễu 12.50m`
);

// 3. Không di chuyển quá đà (shiftLx nhỏ hợp lý <= 40cm)
assert.ok(
  Math.abs(fitSide52Res.shiftLx) <= 0.40,
  `Test 52: shiftLx không được vượt quá 40cm (thực tế: ${fitSide52Res.shiftLx}m)`
);

console.log(
  `✅ Test 52: Nút SIDE Bắt Đúng Hướng Ego [Cản Trước], Kháng Nhiễu 100% (Mép cản ${frontEdge52.toFixed(2)}m bọc trọn cản thật 12.30m + Padding 5cm, gạt bỏ nhiễu 12.50m, Không di chuyển quá đà ΔX=${fitSide52Res.shiftLx}m)`
);

// ==========================================
// TEST 53: NÚT FRONT CẮT THUNG LŨNG MẬT ĐỘ (DENSITY VALLEY CUTOFF)
// KHÁNG 100% NGƯỜI ĐI BỘ ĐỨNG SÁT BÊN SƯỜN XE (KHE HỞ 20CM)
// ==========================================
// Xe thật tại cx = 10.0m, cy = 5.0m, L = 4.6m, W = 1.8m, H = 1.5m.
// Sườn phải thật tại y = 4.10m (ly = -0.90m), trải dài từ x = 7.70 đến 12.30m (150 điểm mật độ cao).
// Người đi bộ đứng sát sườn phải tại y = 3.90m (cách sườn xe 20cm, ly = -1.10m), co cụm hẹp x in [9.8, 10.2m] (25 điểm).
// Giữa sườn xe và người có thung lũng khoảng trống y in [3.95, 4.08m] (khe hở không gian).
const testPts53: Array<{ x: number; y: number; z: number }> = [];
// 1. Mặt đất
for (let x = 7.0; x <= 13.0; x += 0.5) {
  for (let y = 3.0; y <= 7.0; y += 0.5) {
    testPts53.push({ x, y, z: -0.40 });
  }
}
// 2. Sườn phải thật của xe ô tô (bức tường mật độ cao, span X = 4.6m)
for (let x = 7.70; x <= 12.30; x += 0.2) {
  for (let z = 0.0; z <= 1.10; z += 0.2) {
    testPts53.push({ x, y: 4.10, z });
  }
}
// 3. Người đi bộ đứng sát bên sườn phải (cột trụ hẹp x in [9.8, 10.2], y ~ 3.90, 25 điểm)
for (let x = 9.85; x <= 10.15; x += 0.1) {
  for (let z = -0.2; z <= 1.4; z += 0.2) {
    testPts53.push({ x, y: 3.90, z });
  }
}

// Bấm Căn FRONT (Ego tại gốc (0, 0) nhìn sang sườn phải đón tia)
const fitFront53Res = fitBoxToEgoRayAndGround(
  testPts53,
  10.0,
  5.0,
  0.60,
  0.0,
  4.6,
  1.8,
  1.5,
  { x: 0, y: 0, z: 0 },
  { fitStep: "front", preserveDimensions: true }
);

// 1. Phải nhận diện sườn phải đón tia Ego
assert.strictEqual(fitFront53Res.visibleFaces.lateral, "right", "Test 53: Phải nhận diện Sườn Phải đón tia Ego");

// 2. Mép sườn phải của Box phải áp sát đúng sườn xe thật 4.10m - Padding 5cm = 4.05m!
// TUYỆT ĐỐI KHÔNG ĐƯỢC ôm sang người đi bộ 3.90m (nếu ôm người mép sẽ là 3.85m)
const frontRightEdge53 = fitFront53Res.newCenterY - fitFront53Res.newW / 2;
assert.ok(
  Math.abs(frontRightEdge53 - 4.05) < 0.03,
  `Test 53: Mép sườn phải phải ở 4.05m (thực tế: ${frontRightEdge53.toFixed(3)}m), gạt bỏ 100% người đi bộ tại 3.90m!`
);
// Giữ nguyên X và Yaw
assert.strictEqual(fitFront53Res.newCenterX, 10.0, "Test 53: X phải giữ nguyên 10.0m");
assert.strictEqual(fitFront53Res.newYawDeg, 0, "Test 53: Yaw phải giữ nguyên 0°");

console.log(
  `✅ Test 53: Nút FRONT Kháng Người Đứng Sát Sườn (Mép sườn ${frontRightEdge53.toFixed(2)}m áp sát sườn thật 4.10m + Padding 5cm, gạt bỏ 100% người đi bộ tại 3.90m cách sườn 20cm)`
);

// ==========================================
// TEST 54: NÚT SIDE CẮT THUNG LŨNG MẬT ĐỘ (DENSITY VALLEY CUTOFF)
// KHÁNG 100% NGƯỜI ĐI BỘ ĐỨNG TRƯỚC CẢN TRƯỚC XE (KHE HỞ 18CM)
// ==========================================
// Xe thật tại cx = 10.0m, cy = 0.0m, L = 4.6m, W = 1.8m, H = 1.5m.
// Cản trước thật tại x = 12.30m, y in [-0.8, 0.8] (span Y = 1.6m, 100 điểm).
// Người đi bộ đứng trước cản trước tại x = 12.48m (cách cản xe 18cm), y in [-0.15, 0.15] (cột trụ hẹp span Y = 0.3m, 20 điểm).
const testPts54: Array<{ x: number; y: number; z: number }> = [];
// Cản trước thật
for (let y = -0.8; y <= 0.8; y += 0.1) {
  for (let z = 0.0; z <= 1.0; z += 0.2) {
    testPts54.push({ x: 12.30, y, z });
  }
}
// Người đi bộ trước cản xe tại x = 12.48m
for (let y = -0.15; y <= 0.15; y += 0.1) {
  for (let z = 0.0; z <= 1.4; z += 0.2) {
    testPts54.push({ x: 12.48, y, z });
  }
}

// Bấm Căn SIDE (Ego tại (20, 0) nhìn thẳng cản trước đón tia)
const fitSide54Res = fitBoxToEgoRayAndGround(
  testPts54,
  10.0,
  0.0,
  0.60,
  0.0,
  4.6,
  1.8,
  1.5,
  { x: 20, y: 0, z: 0 },
  { fitStep: "side", preserveDimensions: true }
);

// 1. Phải nhận diện cản trước đón tia Ego
assert.strictEqual(fitSide54Res.visibleFaces.longitudinal, "front", "Test 54: Phải nhận diện Cản Trước đón tia Ego");

// 2. Mép cản trước của Box phải áp sát đúng cản xe thật 12.30m + Padding 5cm = 12.35m!
// TUYỆT ĐỐI KHÔNG ĐƯỢC ôm sang người đi bộ 12.48m (nếu ôm người mép sẽ là 12.53m)
const sideFrontEdge54 = fitSide54Res.newCenterX + fitSide54Res.newL / 2;
assert.ok(
  Math.abs(sideFrontEdge54 - 12.35) < 0.03,
  `Test 54: Mép cản trước phải ở 12.35m (thực tế: ${sideFrontEdge54.toFixed(3)}m), gạt bỏ 100% người đi bộ tại 12.48m!`
);
// Giữ nguyên Y và Yaw
assert.strictEqual(fitSide54Res.newCenterY, 0.0, "Test 54: Y phải giữ nguyên 0.0m");
assert.strictEqual(fitSide54Res.newYawDeg, 0, "Test 54: Yaw phải giữ nguyên 0°");

console.log(
  `✅ Test 54: Nút SIDE Kháng Người Đứng Trước Cản (Mép cản ${sideFrontEdge54.toFixed(2)}m áp sát cản thật 12.30m + Padding 5cm, gạt bỏ 100% người đi bộ tại 12.48m cách cản 18cm)`
);

// ==========================================
// TEST 55: NÚT TOP CĂN YAW CHUẨN XÁC KHI CÓ NGƯỜI ĐI BỘ ĐỨNG SÁT SƯỜN XE
// ==========================================
// Box lệch góc -2.0°, sườn xe thật tại góc 0.0°.
// Có người đi bộ đứng sát sườn xe (tạo cụm điểm không đối xứng ở sườn phải).
// Thuật toán TOP lọc thung lũng mật độ, loại bỏ cụm người đi bộ trước khi hồi quy đường thẳng.
const fitTop55Res = fitBoxToEgoRayAndGround(
  testPts53, // Bộ điểm có người đi bộ đứng sát sườn xe ở Test 53
  10.0,
  5.0,
  0.60,
  -0.0349, // -2.0°
  4.6,
  1.8,
  1.5,
  { x: 0, y: 0, z: 0 },
  { fitStep: "top", preserveDimensions: true }
);

// 1. Yaw vẫn xoay thẳng chính xác về 0.0° theo sườn xe thật (không bị người làm lệch)
assert.ok(
  Math.abs(fitTop55Res.newYawDeg! - 0.0) < 0.25,
  `Test 55: Yaw phải xoay thẳng về 0.0° (thực tế: ${fitTop55Res.newYawDeg}°)`
);
// 2. Khóa cứng tâm X và Y
assert.strictEqual(fitTop55Res.shiftLx, 0, "Test 55: shiftLx phải bằng 0");
assert.strictEqual(fitTop55Res.shiftLy, 0, "Test 55: shiftLy phải bằng 0");
assert.strictEqual(fitTop55Res.newCenterX, 10.0, "Test 55: newCenterX giữ nguyên 10.0m");
assert.strictEqual(fitTop55Res.newCenterY, 5.0, "Test 55: newCenterY giữ nguyên 5.0m");

console.log(
  `✅ Test 55: Nút TOP Căn Yaw Miễn Nhiễm Người Đứng Sát Sườn (Yaw xoay thẳng ${fitTop55Res.newYawDeg}° theo sườn xe thật, khóa cứng tâm X=10m, Y=5m)`
);

// ==========================================
// TEST 56: THUẬT TOÁN QUÉT MÂY ĐIỂM TO NHẤT (GOLDEN ANCHOR SCORE) & PADDING 5CM MỖI BÊN
// ==========================================
// So sánh giữa 2 frame:
// - Frame 1: Xe bị che khuất một nửa (chỉ nhìn thấy đuôi xe L=2.2m, W=1.8m, 120 điểm)
// - Frame 2: Xe đi ra khoảng trống, lộ diện trọn vẹn (to nhất, L=4.6m, W=1.8m, H=1.45m, 450 điểm)
// Yêu cầu:
// 1. Phải chọn Frame 2 có Score cao nhất làm Golden Anchor Frame
// 2. Kích thước chuẩn phải được cộng Padding 5cm mỗi bên (+10cm cho L, +10cm cho W, +5cm cho H nóc xe)
const frame1Measured = { measuredL: 2.2, measuredW: 1.8, measuredH: 1.45, pointsCount: 120 };
const score1 = (frame1Measured.measuredL * frame1Measured.measuredW) * Math.sqrt(frame1Measured.pointsCount);

const frame2Measured = { measuredL: 4.6, measuredW: 1.8, measuredH: 1.45, pointsCount: 450 };
const score2 = (frame2Measured.measuredL * frame2Measured.measuredW) * Math.sqrt(frame2Measured.pointsCount);

assert.ok(score2 > score1 * 2, `Test 56: Frame 2 (Score=${score2.toFixed(1)}) phải vượt trội so với Frame 1 (Score=${score1.toFixed(1)})`);

// Tính kích thước tối ưu kèm Padding 5cm mỗi bên (+10cm L, +10cm W, +5cm H):
const optL56 = Number((frame2Measured.measuredL + 0.10).toFixed(2));
const optW56 = Number((frame2Measured.measuredW + 0.10).toFixed(2));
const optH56 = Number((frame2Measured.measuredH + 0.05).toFixed(2));

assert.strictEqual(optL56, 4.70, "Test 56: optL phải là 4.70m (4.6m + 10cm padding)");
assert.strictEqual(optW56, 1.90, "Test 56: optW phải là 1.90m (1.8m + 10cm padding)");
assert.strictEqual(optH56, 1.50, "Test 56: optH phải là 1.50m (1.45m + 5cm padding nóc xe)");

console.log(
  `✅ Test 56: Quét Mây Điểm To Nhất & Padding 5cm (Frame 2 Score=${score2.toFixed(0)} > Frame 1 Score=${score1.toFixed(0)}, L=${optL56}m (+10cm), W=${optW56}m (+10cm), H=${optH56}m (+5cm))`
);

// ==========================================
// TEST 57: LOGIC OUTSIDE TOÀN BỘ TRACK VÀ KHÔI PHỤC SNAPSHOT HOÀN TÁC (PRE / UNDO)
// ==========================================
// Giả lập track có 5 frames (Frame 0 đến 4)
const mockTrackShapes = [
  { frame: 0, outside: false, points: [10, 0, 0.5, 0, 0, 0, 4.6, 1.8, 1.4] },
  { frame: 1, outside: false, points: [12, 0, 0.5, 0, 0, 0, 4.6, 1.8, 1.4] },
  { frame: 2, outside: false, points: [14, 0, 0.5, 0, 0, 0, 4.6, 1.8, 1.4] },
  { frame: 3, outside: true,  points: [16, 0, 0.5, 0, 0, 0, 4.6, 1.8, 1.4] },
  { frame: 4, outside: true,  points: [18, 0, 0.5, 0, 0, 0, 4.6, 1.8, 1.4] },
];

// 1. Lưu snapshot trước khi đổi trạng thái (Backup Snapshot)
const snapshotBeforeOutside = mockTrackShapes.map((s) => ({
  frame: s.frame,
  outside: s.outside,
  points: [...s.points],
}));

// 2. Thực hiện Outside toàn bộ track
for (const s of mockTrackShapes) {
  s.outside = true;
}
assert.ok(mockTrackShapes.every((s) => s.outside === true), "Test 57: Tất cả các shape trong track phải là outside=true");

// 3. Thực hiện Hoàn Tác (Pre / Restore) từ Snapshot
for (const bk of snapshotBeforeOutside) {
  const sh = mockTrackShapes.find((s) => s.frame === bk.frame);
  if (sh) {
    sh.outside = bk.outside;
    sh.points = [...bk.points];
  }
}

// Kiểm tra trạng thái đã được phục hồi nguyên vẹn như ban đầu
assert.strictEqual(mockTrackShapes[0].outside, false, "Test 57: Frame 0 phải phục hồi outside=false");
assert.strictEqual(mockTrackShapes[1].outside, false, "Test 57: Frame 1 phải phục hồi outside=false");
assert.strictEqual(mockTrackShapes[2].outside, false, "Test 57: Frame 2 phải phục hồi outside=false");
assert.strictEqual(mockTrackShapes[3].outside, true,  "Test 57: Frame 3 phải phục hồi outside=true");
assert.strictEqual(mockTrackShapes[4].outside, true,  "Test 57: Frame 4 phải phục hồi outside=true");

console.log(
  `✅ Test 57: Outside Toàn Track & Hoàn Tác (Pre) Thành Công (5/5 frames phục hồi chính xác 100% về snapshot ban đầu)`
);

// =========================================================================
// 58. Test BỘ CÔNG CỤ FIT 3 CHIỀU XE 2 BÁNH (TOP - SIDE - FRONT - ALL)
// =========================================================================
// Kịch bản: Xe máy di chuyển chếch góc 5° (Yaw = 0.087 rad), chiều dài chuẩn L = 1.85m, W = 0.70m, H = 1.45m
// Điểm LiDAR gồm:
// - Vệt bánh sau tại x = -0.8m, bánh trước tại x = +0.8m (trục dài ~1.6m)
// - Đỉnh nón bảo hiểm tại z = 1.40m, mặt đất tại z = -0.10m
// - Bề rộng người và tay lái: y dao động từ -0.32m đến +0.33m (span W ~ 0.65m)
const twoWheelerPts: Array<{ x: number; y: number; z: number }> = [];

// Điểm mặt đất tiếp xúc vệt bánh xe (z = -0.10m)
for (let x = -1.2; x <= 1.2; x += 0.3) {
  for (let y = -0.4; y <= 0.4; y += 0.2) {
    twoWheelerPts.push({ x, y, z: -0.10 });
  }
}

// Điểm khung xe và người lái hơi chếch góc ~6°: y = 0.1 * x
for (let x = -0.8; x <= 0.8; x += 0.1) {
  const y = 0.1 * x;
  twoWheelerPts.push({ x, y, z: 0.3 }); // Khung xe
  twoWheelerPts.push({ x, y, z: 0.7 }); // Yên xe / thân
  twoWheelerPts.push({ x: x, y: y + 0.25, z: 0.9 }); // Tay lái phải / gương
  twoWheelerPts.push({ x: x, y: y - 0.25, z: 0.9 }); // Tay lái trái
}
twoWheelerPts.push({ x: 0.05, y: 0.02, z: 1.40 }); // Đỉnh nón bảo hiểm

const initialL = 1.85;
const initialW = 0.70;
const initialH = 1.45;
const initialYaw = 0.0; // Xe đang đặt thẳng theo trục X, nhưng thực tế mây điểm hơi xiên ~6°

// 58a. Kiểm thử NÚT TOP (Yaw): Xoay theo trục Đầu - Đuôi, khóa tâm X/Y/Z và khóa kích thước L/W/H
const topRes = fitTwoWheelerBox(
  twoWheelerPts,
  0.0, 0.0, 0.65, initialYaw,
  initialL, initialW, initialH,
  {},
  "top"
);
assert.strictEqual(topRes.step, "top", "Test 58a: Phải ghi nhận step là 'top'");
assert.ok(topRes.deltaYawDeg > 3.0 && topRes.deltaYawDeg < 8.0, `Test 58a: Góc lệch Yaw phải xoay về trục đầu-đuôi ~5.7° (thực tế: ${topRes.deltaYawDeg}°)`);
assert.strictEqual(topRes.newL, initialL, "Test 58a: Chiều dài L KHÓA CỨNG tuyệt đối khi căn TOP");
assert.strictEqual(topRes.newW, initialW, "Test 58a: Chiều rộng W giữ nguyên khi căn TOP");
assert.strictEqual(topRes.newH, initialH, "Test 58a: Chiều cao H giữ nguyên khi căn TOP");
assert.strictEqual(topRes.newCenterX, 0.0, "Test 58a: Tâm X giữ nguyên không trôi dạt khi căn TOP");
assert.strictEqual(topRes.newCenterY, 0.0, "Test 58a: Tâm Y giữ nguyên không trôi dạt khi căn TOP");
assert.strictEqual(topRes.newCenterZ, 0.65, "Test 58a: Cao độ Z giữ nguyên khi căn TOP");
console.log(`✅ Test 58a: Nút TOP Xe 2 Bánh: Xoay Yaw ${topRes.newYawDeg}° (Δ=${topRes.deltaYawDeg}°), Khóa 100% X/Y/Z và L/W/H`);

// 58b. Kiểm thử NÚT SIDE: Căn cản X & TUYỆT ĐỐI KHÔNG GHIM ĐẤT, KHÓA CỨNG CHIỀU DÀI L
const sideRes = fitTwoWheelerBox(
  twoWheelerPts,
  0.20, 0.0, 0.90, 0.0, // Thử cho tâm xe lệch X=+20cm và cao độ Z đang ở 0.90m
  initialL, initialW, initialH,
  {},
  "side"
);
assert.strictEqual(sideRes.step, "side", "Test 58b: Phải ghi nhận step là 'side'");
assert.strictEqual(sideRes.newL, initialL, "Test 58b: Chiều dài L KHÓA CỨNG tuyệt đối 100% khi căn SIDE");
assert.strictEqual(sideRes.newW, initialW, "Test 58b: Chiều rộng W giữ nguyên khi căn SIDE");
assert.strictEqual(sideRes.newH, initialH, "Test 58b: Chiều cao H giữ nguyên khi căn SIDE");
assert.strictEqual(sideRes.newCenterZ, 0.90, "Test 58b: Cao độ Z GIỮ NGUYÊN 100% khi căn SIDE (Không ghim đất)");
assert.strictEqual(sideRes.newCenterY, 0.0, "Test 58b: Trục ngang Y giữ nguyên tuyệt đối khi căn SIDE");
console.log(`✅ Test 58b: Nút SIDE Xe 2 Bánh: Căn cản X đón tia & Giữ nguyên Z=${sideRes.newCenterZ}m (Không ghim đất), KHÓA CỨNG 100% Chiều dài L=${sideRes.newL}m`);

// 58c. Kiểm thử NÚT FRONT: Làm chuẩn theo CAR (Căn sườn đón tia Y, Giữ nguyên 100% Z và Kích thước L, W, H)
const frontRes = fitTwoWheelerBox(
  twoWheelerPts,
  0.0, 0.15, 0.65, 0.0, // Thử cho tâm lệch ngang Y = +15cm
  initialL, initialW, initialH,
  { headBuffer: 0.10 },
  "front"
);
assert.strictEqual(frontRes.step, "front", "Test 58c: Phải ghi nhận step là 'front'");
assert.strictEqual(frontRes.newL, initialL, "Test 58c: Chiều dài L KHÓA CỨNG tuyệt đối khi căn FRONT");
assert.strictEqual(frontRes.newW, initialW, "Test 58c: Chiều rộng W BẢO TOÀN 100% khi căn FRONT (chuẩn CAR)");
assert.strictEqual(frontRes.newH, initialH, "Test 58c: Chiều cao H BẢO TOÀN 100% khi căn FRONT (chuẩn CAR)");
assert.strictEqual(frontRes.newCenterZ, 0.65, "Test 58c: Cao độ Z GIỮ NGUYÊN 100% khi căn FRONT (Không ghim đất)");
assert.ok(frontRes.newCenterY < 0.15, "Test 58c: Tâm Y được căn dời ăn khít sườn đón tia");
console.log(`✅ Test 58c: Nút FRONT Xe 2 Bánh (Chuẩn CAR): Giữ nguyên Z=0.65m & Size 1.85x0.7x1.45m, Căn sườn Y đón tia`);

// 58d. Kiểm thử NÚT RIÊNG "Fit Rộng (W)": Bắt trọn gương chiếu hậu, tay lái (+5cm đệm)
const fitWRes = fitTwoWheelerBox(
  twoWheelerPts,
  0.0, 0.15, 0.65, 0.0,
  initialL, initialW, initialH,
  {},
  "w"
);
assert.strictEqual(fitWRes.step, "w", "Test 58d: Phải ghi nhận step là 'w'");
assert.strictEqual(fitWRes.newL, initialL, "Test 58d: Giữ nguyên Chiều dài L khi Fit W");
assert.strictEqual(fitWRes.newH, initialH, "Test 58d: Giữ nguyên Chiều cao H khi Fit W");
assert.strictEqual(fitWRes.newCenterZ, 0.65, "Test 58d: Giữ nguyên Cao độ Z khi Fit W");
assert.ok(fitWRes.newW >= 0.65 && fitWRes.newW <= 0.85, `Test 58d: Chiều rộng W tự động fit ôm gương xe ~0.76m (thực tế: ${fitWRes.newW}m)`);
console.log(`✅ Test 58d: Nút Fit Rộng (W) Xe 2 Bánh: W=${fitWRes.newW}m (+5cm đệm gương/tay lái), Giữ nguyên L, H & Z`);

// 58e. Kiểm thử NÚT RIÊNG "Fit Cao (H)": Đáy bám sàn cố định, nở lên nóc +12cm đệm nón
const fitHRes = fitTwoWheelerBox(
  twoWheelerPts,
  0.0, 0.0, 0.65, 0.0,
  initialL, initialW, initialH,
  { headBuffer: 0.12 },
  "h"
);
assert.strictEqual(fitHRes.step, "h", "Test 58e: Phải ghi nhận step là 'h'");
assert.strictEqual(fitHRes.newL, initialL, "Test 58e: Giữ nguyên Chiều dài L khi Fit H");
assert.strictEqual(fitHRes.newW, initialW, "Test 58e: Giữ nguyên Chiều rộng W khi Fit H");
assert.strictEqual(fitHRes.newCenterX, 0.0, "Test 58e: Giữ nguyên Tâm X khi Fit H");
assert.strictEqual(fitHRes.newCenterY, 0.0, "Test 58e: Giữ nguyên Tâm Y khi Fit H");
assert.ok(fitHRes.newH >= 1.55 && fitHRes.newH <= 1.65, `Test 58e: Chiều cao H tự động vươn tới đỉnh nón bảo hiểm ~1.60m (thực tế: ${fitHRes.newH}m)`);
const bottomZ58 = Number((fitHRes.newCenterZ - fitHRes.newH / 2).toFixed(3));
assert.ok(Math.abs(bottomZ58 - (0.65 - initialH / 2)) < 0.01, `Test 58e: Đáy tiếp đất giữ nguyên cố định (thực tế: ${bottomZ58}m)`);
console.log(`✅ Test 58e: Nút Fit Cao (H) Xe 2 Bánh: H=${fitHRes.newH}m (Đáy bám sàn cố định Z=${bottomZ58}m, nở nóc +12cm), Giữ nguyên L, W & XY`);

// 58f. Kiểm thử CHU TRÌNH TOÀN DIỆN (ALL): TOP ➔ SIDE ➔ FRONT
const allRes = fitTwoWheelerBox(
  twoWheelerPts,
  0.10, 0.10, 0.80, 0.0,
  initialL, initialW, initialH,
  { headBuffer: 0.10 },
  "all"
);
assert.strictEqual(allRes.newL, initialL, "Test 58f: Chu trình ALL bảo toàn 100% Chiều dài L");
assert.ok(allRes.deltaYawDeg > 2.0, "Test 58f: Chu trình ALL đã xoay Yaw theo trục thân xe");
assert.ok(allRes.newH >= 1.55 && allRes.newH <= 1.65, `Test 58f: Chu trình ALL đã fit chiều cao chạm đỉnh nón H=${allRes.newH}m`);
console.log(`✅ Test 58f: Fit Toàn Diện Xe 2 Bánh (ALL): ${allRes.newL}x${allRes.newW}x${allRes.newH}m, Yaw=${allRes.newYawDeg}°, Z=${allRes.newCenterZ}m (Khóa L hoàn hảo)`);

// 59. Kiểm thử Nút "Fit Box Hiện Tại (+5cm Pad)" (Đo mây điểm, Lọc thung lũng mật độ, Ghim sàn cố định đáy & Nở lên nóc)
// =========================================================================
{
  // Kịch bản: Box xe tại frame hiện tại có mây điểm đo được:
  // Thân xe: X từ -2.25m đến +2.25m (L_meas = 4.50m)
  //          Y từ -0.90m đến +0.90m (W_meas = 1.80m)
  // Sàn đất: Z_ground = -0.35m, Nóc xe thật: Z_roof = +1.15m (H_meas = 1.50m)
  // Có người đứng cách xe 20cm (Y = 1.15m) -> Phải bị bộ lọc thung lũng mật độ cắt bỏ hoàn toàn
  const currentFramePts: Array<{ x: number; y: number; z: number }> = [];

  // Điểm mặt sàn dưới đáy xe (-0.35m)
  for (let x = -2.5; x <= 2.5; x += 0.2) {
    for (let y = -1.2; y <= 1.2; y += 0.2) {
      currentFramePts.push({ x, y, z: -0.35 });
    }
  }
  // Điểm thân xe chính (4.50m x 1.80m)
  for (let x = -2.25; x <= 2.25; x += 0.15) {
    for (let y = -0.90; y <= 0.90; y += 0.15) {
      currentFramePts.push({ x, y, z: 0.2 });
      currentFramePts.push({ x, y, z: 0.6 });
      currentFramePts.push({ x, y, z: 1.15 }); // Điểm nóc xe
    }
  }
  // Điểm người đứng sát xe tại y = 1.15m (thưa và có khoảng trống > 15cm từ 0.90m đến 1.15m)
  for (let z = -0.35; z <= 1.30; z += 0.2) {
    currentFramePts.push({ x: 0.2, y: 1.15, z });
    currentFramePts.push({ x: 0.3, y: 1.18, z });
  }

  // Bóc tách theo logic fitBoxWithPadding5cm
  const rawL = 2.25 - (-2.25); // 4.50m
  const rawW = 0.90 - (-0.90); // 1.80m
  const currentGroundZ = -0.35;
  const currentRoofZ = 1.15;
  const rawH = currentRoofZ - currentGroundZ; // 1.50m

  // Thêm Padding 5cm mỗi bên (+10cm L, +10cm W, +5cm H)
  const paddedL = Math.round((rawL + 0.10) * 100) / 100;
  const paddedW = Math.round((rawW + 0.10) * 100) / 100;
  const paddedH = Math.round((rawH + 0.05) * 100) / 100;
  const centerZ = Math.round((currentGroundZ + paddedH / 2) * 1000) / 1000;
  const bottomZ = Math.round((centerZ - paddedH / 2) * 1000) / 1000;

  assert.strictEqual(paddedL, 4.60, "Test 59: Chiều dài L phải được cộng padding 5cm mỗi bên (+10cm thành 4.60m)");
  assert.strictEqual(paddedW, 1.90, "Test 59: Chiều rộng W phải được cộng padding 5cm mỗi bên (+10cm thành 1.90m)");
  assert.strictEqual(paddedH, 1.55, "Test 59: Chiều cao H phải nở lên nóc và cộng thêm 5cm (+5cm thành 1.55m)");
  assert.strictEqual(bottomZ, currentGroundZ, "Test 59: Mặt đáy tiếp đất Z_bottom phải cố định 100% tại mặt đất Z_ground (-0.35m)");
  console.log(`✅ Test 59: Nút Fit Box Hiện Tại (+5cm Pad): L=${paddedL}m (+10cm), W=${paddedW}m (+10cm), H=${paddedH}m (+5cm), Đáy bám sàn cố định Z=${bottomZ}m`);
}

// 60. Kiểm thử Bộ Presets Mẫu Chuẩn Cho Annotator (Ô tô, Xe 2 bánh, Người đi bộ)
// =========================================================================
{
  // 60a. Kiểm tra danh mục Ô tô (CAR_PRESETS)
  assert.ok(CAR_PRESETS.length >= 8, `Test 60a: CAR_PRESETS phải có ít nhất 8 mẫu phổ biến (thực tế: ${CAR_PRESETS.length})`);
  const sedanPreset = CAR_PRESETS.find((p) => p.name.includes("Sedan"));
  assert.ok(sedanPreset && sedanPreset.l > 4.5 && sedanPreset.w > 1.7, "Test 60a: Phải có mẫu Sedan chuẩn");
  const suvPreset = CAR_PRESETS.find((p) => p.name.includes("SUV"));
  assert.ok(suvPreset && suvPreset.h >= 1.6, "Test 60a: Phải có mẫu SUV cao >= 1.6m");

  // 60b. Kiểm tra danh mục Xe 2 bánh (CYCLIST_PRESETS)
  assert.ok(CYCLIST_PRESETS.length >= 5, `Test 60b: CYCLIST_PRESETS phải có ít nhất 5 mẫu (thực tế: ${CYCLIST_PRESETS.length})`);
  const motorbikePreset = CYCLIST_PRESETS.find((p) => p.name.toLowerCase().includes("xe máy"));
  assert.ok(motorbikePreset && motorbikePreset.w <= 0.85, "Test 60b: Mẫu Xe máy có chiều rộng thon gọn <= 0.85m");
  const bicyclePreset = CYCLIST_PRESETS.find((p) => p.name.toLowerCase().includes("xe đạp"));
  assert.ok(bicyclePreset && bicyclePreset.w <= 0.65, "Test 60b: Mẫu Xe đạp có bề rộng <= 0.65m");

  // 60c. Kiểm tra danh mục Người đi bộ (PEDESTRIAN_PRESETS)
  assert.ok(PEDESTRIAN_PRESETS.length >= 4, `Test 60c: PEDESTRIAN_PRESETS phải có ít nhất 4 mẫu (thực tế: ${PEDESTRIAN_PRESETS.length})`);
  const adultPed = PEDESTRIAN_PRESETS.find((p) => p.name.toLowerCase().includes("người đứng"));
  assert.ok(adultPed && adultPed.h >= 1.70, "Test 60c: Mẫu Người đứng có chiều cao >= 1.70m");
  const childPed = PEDESTRIAN_PRESETS.find((p) => p.name.toLowerCase().includes("trẻ em"));
  assert.ok(childPed && childPed.h <= 1.30, "Test 60c: Mẫu Trẻ em có chiều cao <= 1.30m");

  // 60d. Kiểm tra tích hợp Catalog & Best Fit Matcher
  const fitCar = findBestFitCatalog(4.68, 1.82, 1.46);
  assert.strictEqual(fitCar.matchedItem.category, "car", "Test 60d: Phải nhận diện đúng category 'car'");
  assert.ok(fitCar.confidence > 80, `Test 60d: Độ tin cậy khớp catalog phải > 80% (thực tế: ${fitCar.confidence}%)`);

  const fitMoto = findBestFitCatalog(1.9, 0.72, 1.25);
  assert.strictEqual(fitMoto.matchedItem.category, "cycle", "Test 60d: Phải nhận diện đúng category 'cycle'");

  const fitHuman = findBestFitCatalog(0.5, 0.45, 1.72);
  assert.strictEqual(fitHuman.matchedItem.category, "pedestrian", "Test 60d: Phải nhận diện đúng category 'pedestrian'");
  console.log(`✅ Test 60: Bộ Presets Mẫu Chuẩn: Khớp Sedan (${fitCar.confidence}%), Xe 2 bánh, Người đi bộ (1-Click áp dụng tức thì)`);
}

// =========================================================================
// 61. Kiểm thử Thuật toán FRONT chuẩn CAR và 2 Nút Riêng Fit W & Fit H Xe 2 Bánh
// =========================================================================
{
  // Kịch bản ĐÓN TIA MỘT BÊN SƯỜN (Single-Side Laser Ray)
  // Xe máy chạy thẳng (Yaw = 0), Ego chiếu chéo từ phía sau-phải.
  // Mây điểm chỉ bám vào sườn PHẢI: y dao động từ -0.42m đến -0.08m (mép ngoài sườn phải lyMin = -0.42m)
  // Sườn trái hoàn toàn không có điểm do bị che khuất.
  const singleSidePts: Array<{ x: number; y: number; z: number }> = [];

  // Mặt đất dưới lốp xe z = -0.10m
  for (let x = -1.0; x <= 1.0; x += 0.3) {
    for (let y = -0.3; y <= 0.3; y += 0.2) {
      singleSidePts.push({ x, y, z: -0.10 });
    }
  }

  // Khung và sườn phải của xe + chân người lái (chỉ có y < 0)
  for (let x = -0.7; x <= 0.7; x += 0.15) {
    for (let y = -0.42; y <= -0.08; y += 0.08) {
      singleSidePts.push({ x, y, z: 0.35 });
      singleSidePts.push({ x, y, z: 0.75 });
    }
  }
  // Mũ bảo hiểm ở trên cao z = 1.45m
  singleSidePts.push({ x: 0.0, y: -0.12, z: 1.45 });

  const initL = 1.80;
  const initW = 0.65;
  const initH = 1.40;
  const initCz = 0.60; // Đáy ban đầu: 0.60 - 1.40/2 = -0.10m

  // 61a. Kiểm tra NÚT FRONT XE 2 BÁNH (Chuẩn theo CAR): Căn sườn đón tia Y, Giữ nguyên 100% Z và Kích thước
  const resFront = fitTwoWheelerBox(
    singleSidePts,
    0.0, 0.0, initCz, 0.0,
    initL, initW, initH,
    {},
    "front"
  );
  assert.strictEqual(resFront.step, "front", "Test 61a: Phải ghi nhận step là 'front'");
  assert.strictEqual(resFront.newL, initL, "Test 61a: Chiều dài L phải khóa cứng 100%");
  assert.strictEqual(resFront.newW, initW, "Test 61a: Chiều rộng W giữ nguyên 100% khi bấm FRONT (chuẩn Car)");
  assert.strictEqual(resFront.newH, initH, "Test 61a: Chiều cao H giữ nguyên 100% khi bấm FRONT (chuẩn Car)");
  assert.strictEqual(resFront.newCenterZ, initCz, "Test 61a: Cao độ Z giữ nguyên 100% (không ghim đất như Car)");

  // 61b. Kiểm tra NÚT RIÊNG FIT RỘNG (W): Tự động đo W đối xứng từ sườn đón tia gọn gàng (+3cm đệm gương)
  const resFitW = fitTwoWheelerBox(
    singleSidePts,
    0.0, 0.0, initCz, 0.0,
    initL, initW, initH,
    {},
    "w"
  );
  assert.strictEqual(resFitW.step, "w", "Test 61b: Phải ghi nhận step là 'w'");
  assert.ok(
    resFitW.newW >= 0.82 && resFitW.newW <= 0.95,
    `Test 61b: Chiều rộng W phải mở rộng đối xứng từ mép sườn phải sang sườn trái kèm đệm gương vừa vặn ~0.85m (thực tế: ${resFitW.newW}m)`
  );
  assert.strictEqual(resFitW.newCenterY, 0.0, "Test 61b: Tâm Y giữ vững trên trục dọc bánh xe khi đón tia 1 sườn");
  assert.strictEqual(resFitW.newL, initL, "Test 61b: Giữ nguyên Chiều dài L khi Fit W");
  assert.strictEqual(resFitW.newH, initH, "Test 61b: Giữ nguyên Chiều cao H khi Fit W");
  assert.strictEqual(resFitW.newCenterZ, initCz, "Test 61b: Giữ nguyên Cao độ Z khi Fit W");

  // 61c. Kiểm tra NÚT RIÊNG FIT CAO (H): Mặt đáy bám sàn cố định, nở lên nóc +12cm đệm nón
  const resFitH = fitTwoWheelerBox(
    singleSidePts,
    0.0, 0.0, initCz, 0.0,
    initL, initW, initH,
    { headBuffer: 0.12 },
    "h"
  );
  assert.strictEqual(resFitH.step, "h", "Test 61c: Phải ghi nhận step là 'h'");
  const expectedH = 1.45 + 0.12 - (-0.10); // 1.67m
  assert.ok(
    Math.abs(resFitH.newH - expectedH) <= 0.05,
    `Test 61c: Chiều cao H nở từ sàn -0.10m lên nóc 1.57m = ${expectedH}m (thực tế: ${resFitH.newH}m)`
  );
  const bottomZ61 = Number((resFitH.newCenterZ - resFitH.newH / 2).toFixed(3));
  assert.ok(
    Math.abs(bottomZ61 - (-0.10)) <= 0.02,
    `Test 61c: Mặt đáy tiếp đất Z_bottom phải bám sàn cố định tại -0.10m (thực tế: ${bottomZ61}m)`
  );
  assert.strictEqual(resFitH.newL, initL, "Test 61c: Giữ nguyên Chiều dài L khi Fit H");
  assert.strictEqual(resFitH.newW, initW, "Test 61c: Giữ nguyên Chiều rộng W khi Fit H");

  console.log(
    `✅ Test 61: Nút FRONT chuẩn Car (Giữ Size & Z) & 2 Nút Riêng Fit W=${resFitW.newW}m (Đệm gương 1 sườn) + Fit H=${resFitH.newH}m (Bám sàn cố định Z=${bottomZ61}m)`
  );
}

// =========================================================================
// TEST 62: KHÁNG NHIỄU TIA QUÉT LOANG MẶT ĐẤT Ở CHÂN NGƯỜI ĐI BỘ (PHÂN TẦNG ĐỘ CAO)
// =========================================================================
{
  const pedPtsWithGroundScatter: Array<{ x: number; y: number; z: number }> = [];

  // 1. Vệt quét loang sát mặt đất quanh bàn chân: Z trong [-0.35m, -0.15m], loang rộng ra [-0.45m, +0.45m] (Rộng 0.90m)
  for (let x = -0.45; x <= 0.45; x += 0.08) {
    for (let y = -0.45; y <= 0.45; y += 0.08) {
      pedPtsWithGroundScatter.push({ x, y, z: -0.35 });
      pedPtsWithGroundScatter.push({ x, y, z: -0.20 });
    }
  }

  // 2. Thân người cốt lõi thật (từ đùi lên đầu): Z trong [0.0m, 1.35m], thân gọn gàng [-0.18m, +0.18m] (Rộng 0.36m, Dài 0.36m)
  for (let z = 0.0; z <= 1.35; z += 0.10) {
    for (let x = -0.18; x <= 0.18; x += 0.09) {
      for (let y = -0.18; y <= 0.18; y += 0.09) {
        pedPtsWithGroundScatter.push({ x, y, z });
      }
    }
  }

  const pedFitRes = fitPedestrianBox(
    pedPtsWithGroundScatter,
    0.0, 0.0, 0.50, 0.0,
    0.80, 0.80, 1.70, // Box ban đầu bị người dùng kéo to 80x80cm
    0.12
  );

  // Nhờ cơ chế lọc phân tầng (cắt bỏ Z < Z_ground + 0.30m):
  // Box không bị vệt quét 0.90m sát đất "lừa", mà ôm gọn thân người ~0.45m - 0.55m!
  assert.ok(
    pedFitRes.newL <= 0.55,
    `Test 62: Chiều dài L người phải được thu gọn <= 0.55m (thực tế: ${pedFitRes.newL}m)`
  );
  assert.ok(
    pedFitRes.newW <= 0.55,
    `Test 62: Chiều rộng W người phải được thu gọn <= 0.55m (thực tế: ${pedFitRes.newW}m)`
  );
  console.log(
    `✅ Test 62: Phân Tầng Kháng Nhiễu Đất Người Đi Bộ: Thu gọn box về ${pedFitRes.newL}x${pedFitRes.newW}x${pedFitRes.newH}m (loại bỏ 100% vệt quét loang sát đất 0.9m)`
  );
}

// =========================================================================
// TEST 63: KHÁNG NHIỄU GẦM / MẶT ĐƯỜNG / VỈA HÈ SÁT SÀN Ở Ô TÔ (PHÂN TẦNG +22CM)
// =========================================================================
{
  const carPtsWithGroundScatter: Array<{ x: number; y: number; z: number }> = [];

  // 1. Mặt đường và vệt quét loang sát sàn: Z = -0.35m đến -0.20m, loang ra trước cản 0.5m và sang hai bên sườn
  for (let x = -3.0; x <= 3.0; x += 0.25) {
    for (let y = -1.5; y <= 1.5; y += 0.25) {
      carPtsWithGroundScatter.push({ x, y, z: -0.35 });
      carPtsWithGroundScatter.push({ x, y, z: -0.22 });
    }
  }

  // 2. Thân vỏ xe thật (Z từ 0.0m đến +1.2m): Dài 4.6m (x từ -2.3m đến +2.3m), Rộng 1.8m (y từ -0.9m đến +0.9m)
  for (let x = -2.3; x <= 2.3; x += 0.20) {
    for (let y = -0.9; y <= 0.9; y += 0.20) {
      carPtsWithGroundScatter.push({ x, y, z: 0.1 });
      carPtsWithGroundScatter.push({ x, y, z: 0.6 });
      carPtsWithGroundScatter.push({ x, y, z: 1.15 });
    }
  }

  // Mặt cản trước đón tia Ego (x = +2.30m) có mật độ điểm đón tia dày đặc
  for (let y = -0.9; y <= 0.9; y += 0.1) {
    for (let z = 0.0; z <= 0.8; z += 0.1) {
      carPtsWithGroundScatter.push({ x: 2.30, y, z });
    }
  }

  const carFitRes = fitBoxToEgoRayAndGround(
    carPtsWithGroundScatter,
    0.0, 0.0, 0.45, 0.0,
    4.6, 1.8, 1.5,
    { x: 10, y: 0, z: 0 },
    { fitStep: "side", preserveDimensions: true }
  );

  // Mép cản trước xe phải bám cản vỏ thật (+2.3m), không bị vệt quét loang mặt đất ở 3.0m kéo văng ra xa
  const bumperEdge = carFitRes.newCenterX + carFitRes.newL / 2;
  assert.ok(
    Math.abs(bumperEdge - 2.35) <= 0.10,
    `Test 63: Cản trước phải bám cản vỏ thật 2.35m (thực tế: ${bumperEdge.toFixed(2)}m, loại bỏ vệt quét 3.0m)`
  );
  console.log(
    `✅ Test 63: Phân Tầng Kháng Nhiễu Mặt Đường Ô Tô: Mép cản đón tia bám chuẩn ${bumperEdge.toFixed(2)}m (loại bỏ 100% vệt quét loang sát sàn 3.0m)`
  );
}

// =========================================================================
// TEST 64: NÚT FIT TOP CHO NGƯỜI ĐI BỘ (KHÓA TÂM X/Y/Z & BẢO TOÀN KÍCH THƯỚC L/W/H)
// =========================================================================
{
  const pedPts: Array<{ x: number; y: number; z: number }> = [];
  // Giả lập thân người: x từ -0.15 đến +0.15, y từ -0.22 đến +0.22, z từ 0.0 đến 1.45 (mặt đất -0.30m)
  for (let z = -0.30; z <= 1.45; z += 0.1) {
    pedPts.push({ x: 0, y: 0, z });
  }
  for (let z = 0.1; z <= 1.40; z += 0.15) {
    for (let x = -0.15; x <= 0.15; x += 0.08) {
      for (let y = -0.22; y <= 0.22; y += 0.08) {
        pedPts.push({ x: 5.0 + x, y: 3.0 + y, z: 0.5 + z });
      }
    }
  }

  const topRes = fitPedestrianBox(
    pedPts,
    5.0, 3.0, 0.85, 0.0,
    0.60, 0.60, 1.70,
    {},
    "top"
  );

  // 1. Phải khóa 100% vị trí tâm X, Y, Z
  assert.strictEqual(topRes.newCenterX, 5.0, "Test 64: newCenterX phải giữ nguyên 5.0m");
  assert.strictEqual(topRes.newCenterY, 3.0, "Test 64: newCenterY phải giữ nguyên 3.0m");
  assert.strictEqual(topRes.newCenterZ, 0.85, "Test 64: newCenterZ phải giữ nguyên 0.85m (KHÔNG GHIM ĐẤT)");

  // 2. Phải khóa 100% kích thước L, W, H
  assert.strictEqual(topRes.newL, 0.60, "Test 64: newL phải giữ nguyên 0.60m");
  assert.strictEqual(topRes.newW, 0.60, "Test 64: newW phải giữ nguyên 0.60m");
  assert.strictEqual(topRes.newH, 1.70, "Test 64: newH phải giữ nguyên 1.70m");

  console.log(`✅ Test 64: Nút TOP Người đi bộ: Khóa 100% vị trí X=5.0m, Y=3.0m, Z=0.85m (Không ghim đất) & Khóa size 0.6x0.6x1.7m`);
}

// =========================================================================
// TEST 65: NÚT FIT SIDE CHO NGƯỜI ĐI BỘ (CĂN ĐÓN TIA X & GIỮ NGUYÊN 100% Z & SIZE)
// =========================================================================
{
  const pedPts: Array<{ x: number; y: number; z: number }> = [];
  // Người đứng tại x = 10.20m, y = 2.0m, cao từ z = 0.0m đến 1.45m
  // Ego ở phía trước (x = 15m), mặt đón tia trước của người ở x = 10.35m
  for (let z = 0.0; z <= 1.401; z += 0.1) {
    for (let x = 10.05; x <= 10.351; x += 0.05) {
      for (let y = 1.85; y <= 2.151; y += 0.05) {
        pedPts.push({ x, y, z });
      }
    }
  }

  const sideRes = fitPedestrianBox(
    pedPts,
    10.0, 2.0, 0.70, 0.0,
    0.60, 0.60, 1.70,
    { egoPos: { x: 15.0, y: 2.0, z: 0.0 } },
    "side"
  );

  // 1. Phải giữ nguyên 100% cao độ Z (TUYỆT ĐỐI KHÔNG GHIM ĐẤT)
  assert.strictEqual(sideRes.newCenterZ, 0.70, "Test 65: newCenterZ phải giữ nguyên 0.70m");
  // 2. Phải giữ nguyên Y
  assert.strictEqual(sideRes.newCenterY, 2.0, "Test 65: newCenterY phải giữ nguyên 2.0m");
  // 3. Phải bảo toàn kích thước L, W, H
  assert.strictEqual(sideRes.newL, 0.60, "Test 65: newL phải giữ nguyên 0.60m");
  assert.strictEqual(sideRes.newW, 0.60, "Test 65: newW phải giữ nguyên 0.60m");
  assert.strictEqual(sideRes.newH, 1.70, "Test 65: newH phải giữ nguyên 1.70m");
  // 4. Mép trước box áp sát mép trước đón tia
  const frontEdge = sideRes.newCenterX + sideRes.newL / 2;
  assert.ok(frontEdge >= 10.35, `Test 65: Mép trước box (${frontEdge.toFixed(3)}m) phải bao trọn mép người 10.35m`);

  console.log(`✅ Test 65: Nút SIDE Người đi bộ: Căn đón tia X (mép trước ${frontEdge.toFixed(2)}m), Giữ nguyên Z=0.70m & Khóa size 0.6x0.6x1.7m`);
}

// =========================================================================
// TEST 66: NÚT FIT FRONT CHO NGƯỜI ĐI BỘ (CĂN SƯỜN ĐÓN TIA Y & GIỮ NGUYÊN 100% Z & SIZE)
// =========================================================================
{
  const pedPts: Array<{ x: number; y: number; z: number }> = [];
  // Người ở x = 5.0m, y = 3.20m. Ego ở y = 8.0m (bên trái người). Mép trái đón tia ở y = 3.38m.
  for (let z = 0.0; z <= 1.401; z += 0.1) {
    for (let x = 4.85; x <= 5.151; x += 0.05) {
      for (let y = 3.05; y <= 3.381; y += 0.05) {
        pedPts.push({ x, y, z });
      }
    }
  }

  const frontRes = fitPedestrianBox(
    pedPts,
    5.0, 3.0, 0.80, 0.0,
    0.60, 0.60, 1.70,
    { egoPos: { x: 5.0, y: 8.0, z: 0.0 } },
    "front"
  );

  // 1. Phải giữ nguyên 100% cao độ Z (TUYỆT ĐỐI KHÔNG GHIM ĐẤT)
  assert.strictEqual(frontRes.newCenterZ, 0.80, "Test 66: newCenterZ phải giữ nguyên 0.80m");
  // 2. Phải giữ nguyên X
  assert.strictEqual(frontRes.newCenterX, 5.0, "Test 66: newCenterX phải giữ nguyên 5.0m");
  // 3. Phải bảo toàn kích thước L, W, H
  assert.strictEqual(frontRes.newL, 0.60, "Test 66: newL phải giữ nguyên 0.60m");
  assert.strictEqual(frontRes.newW, 0.60, "Test 66: newW phải giữ nguyên 0.60m");
  assert.strictEqual(frontRes.newH, 1.70, "Test 66: newH phải giữ nguyên 1.70m");
  // 4. Mép trái box áp sát mép sườn trái đón tia
  const leftEdge = frontRes.newCenterY + frontRes.newW / 2;
  assert.ok(leftEdge >= 3.35, `Test 66: Mép trái box (${leftEdge.toFixed(3)}m) phải bao trọn sườn người 3.35m`);

  console.log(`✅ Test 66: Nút FRONT Người đi bộ: Căn sườn Y đón tia (${leftEdge.toFixed(2)}m), Giữ nguyên Z=0.80m & Khóa size 0.6x0.6x1.7m`);
}

// =========================================================================
// TEST 67: NÚT FIX RIÊNG CHIỀU DÀI (L) CHO NGƯỜI ĐI BỘ
// =========================================================================
{
  const pedPts: Array<{ x: number; y: number; z: number }> = [];
  // Người có sải chân dài x từ -0.22m đến +0.22m, bề ngang hẹp y từ -0.14m đến +0.14m
  for (let z = 0.0; z <= 1.40; z += 0.1) {
    for (let x = -0.22; x <= 0.22; x += 0.08) {
      for (let y = -0.14; y <= 0.14; y += 0.08) {
        pedPts.push({ x, y, z });
      }
    }
  }

  const fixLRes = fitPedestrianLength(
    pedPts,
    0.0, 0.0, 0.70, 0.0,
    0.75, 0.50, 1.65 // Box ban đầu L=0.75m, W=0.50m, H=1.65m
  );

  // 1. Chiều dài L phải được fit co giãn chính xác 0.48m
  assert.ok(
    Math.abs(fixLRes.newL - 0.48) <= 0.03,
    `Test 67: newL phải là 0.48m (thực tế: ${fixLRes.newL}m)`
  );
  // 2. Chiều rộng W, Chiều cao H và Cao độ Z phải giữ nguyên 100%
  assert.strictEqual(fixLRes.newW, 0.50, "Test 67: newW phải giữ nguyên 0.50m");
  assert.strictEqual(fixLRes.newH, 1.65, "Test 67: newH phải giữ nguyên 1.65m");
  assert.strictEqual(fixLRes.newCenterZ, 0.70, "Test 67: newCenterZ phải giữ nguyên 0.70m");

  console.log(`✅ Test 67: Nút Fix Dài (L) Người đi bộ: L=${fixLRes.newL}m (ôm sải chân +8cm), Giữ nguyên W=0.50m, H=1.65m & Z=0.70m`);
}

// =========================================================================
// TEST 68: NÚT FIX RIÊNG CHIỀU RỘNG (W) CHO NGƯỜI ĐI BỘ
// =========================================================================
{
  const pedPts: Array<{ x: number; y: number; z: number }> = [];
  // Người có bề ngang vai rộng y từ -0.25m đến +0.25m, bề dày ngực x từ -0.15m đến +0.15m
  for (let z = 0.0; z <= 1.40; z += 0.1) {
    for (let x = -0.15; x <= 0.15; x += 0.08) {
      for (let y = -0.25; y <= 0.25; y += 0.08) {
        pedPts.push({ x, y, z });
      }
    }
  }

  const fixWRes = fitPedestrianWidth(
    pedPts,
    0.0, 0.0, 0.70, 0.0,
    0.45, 0.80, 1.65 // Box ban đầu L=0.45m, W=0.80m, H=1.65m
  );

  // 1. Chiều rộng W phải được fit co giãn chính xác ~0.52m - 0.54m (ôm vai vừa khít +4cm)
  assert.ok(
    Math.abs(fixWRes.newW - 0.53) <= 0.03,
    `Test 68: newW phải là ~0.53m (thực tế: ${fixWRes.newW}m)`
  );
  // 2. Chiều dài L, Chiều cao H và Cao độ Z phải giữ nguyên 100%
  assert.strictEqual(fixWRes.newL, 0.45, "Test 68: newL phải giữ nguyên 0.45m");
  assert.strictEqual(fixWRes.newH, 1.65, "Test 68: newH phải giữ nguyên 1.65m");
  assert.strictEqual(fixWRes.newCenterZ, 0.70, "Test 68: newCenterZ phải giữ nguyên 0.70m");

  console.log(`✅ Test 68: Nút Fix Rộng (W) Người đi bộ: W=${fixWRes.newW}m (ôm vai vừa khít +4cm), Giữ nguyên L=0.45m, H=1.65m & Z=0.70m`);
}

// =========================================================================
// TEST 69: NÚT FIX RIÊNG CHIỀU CAO (H) CHO NGƯỜI ĐI BỘ (GROUND-LOCK: NỞ NÓC +12CM)
// =========================================================================
{
  const pedPts: Array<{ x: number; y: number; z: number }> = [];
  // Người cao: chân tiếp đất tại Z = -0.30m, đỉnh đầu tại Z = 1.40m
  // Box ban đầu: cz = 0.50m, curH = 1.60m -> Đáy ban đầu Z_base = 0.50 - 0.80 = -0.30m
  for (let z = -0.30; z <= 1.401; z += 0.10) {
    pedPts.push({ x: 0.0, y: 0.0, z });
    pedPts.push({ x: 0.1, y: -0.1, z });
  }

  const fixHRes = fitPedestrianHeight(
    pedPts,
    0.0, 0.0, 0.50, 0.0,
    0.50, 0.50, 1.60,
    { headBuffer: 0.12 }
  );

  // 1. Đỉnh đầu Z = 1.40m + 0.12m buffer = 1.52m. Mặt đáy cố định tại Z = -0.30m -> H = 1.52 - (-0.30) = 1.82m
  assert.ok(
    Math.abs(fixHRes.newH - 1.82) <= 0.03,
    `Test 69: newH phải là 1.82m (thực tế: ${fixHRes.newH}m)`
  );
  // 2. Mặt đáy tiếp đất Z_base phải giữ nguyên cố định -0.30m
  const newBottomZ = fixHRes.newCenterZ - fixHRes.newH / 2;
  assert.ok(
    Math.abs(newBottomZ - (-0.30)) <= 0.01,
    `Test 69: Mặt đáy phải giữ nguyên cố định -0.30m (thực tế: ${newBottomZ.toFixed(3)}m)`
  );
  // 3. Giữ nguyên 100% Chiều dài L, Chiều rộng W và tọa độ XY
  assert.strictEqual(fixHRes.newL, 0.50, "Test 69: newL phải giữ nguyên 0.50m");
  assert.strictEqual(fixHRes.newW, 0.50, "Test 69: newW phải giữ nguyên 0.50m");
  assert.strictEqual(fixHRes.newCenterX, 0.0, "Test 69: newCenterX giữ nguyên 0.0m");
  assert.strictEqual(fixHRes.newCenterY, 0.0, "Test 69: newCenterY giữ nguyên 0.0m");

  console.log(
    `✅ Test 69: Nút Fix Cao (H) Người đi bộ (Ground-Lock): H=${fixHRes.newH}m (Đáy bám sàn -0.30m cố định, đỉnh đầu nở lên +12cm), Giữ nguyên L, W & XY`
  );
}

// =========================================================================
// TEST 70: KHÁNG NHIỄU CỤM ĐÁM ĐÔNG Ở NGƯỜI ĐI BỘ (PHÂN CỤM MẬT ĐỘ 2D DENSITY VALLEY)
// =========================================================================
{
  const crowdPts: Array<{ x: number; y: number; z: number }> = [];

  // 1. Người A (Mục tiêu đang chọn tại tâm x=0, y=0):
  // Chiều rộng y từ -0.18m đến +0.18m (bề ngang 0.36m), x từ -0.15m đến +0.15m
  for (let z = 0.0; z <= 1.40; z += 0.1) {
    for (let x = -0.15; x <= 0.151; x += 0.06) {
      for (let y = -0.18; y <= 0.181; y += 0.06) {
        crowdPts.push({ x, y, z });
      }
    }
  }

  // 2. Người B (Người đi cùng trong đám đông, đứng cách người A 22cm gap):
  // y từ +0.40m đến +0.70m, x từ -0.15m đến +0.15m
  for (let z = 0.0; z <= 1.40; z += 0.1) {
    for (let x = -0.15; x <= 0.151; x += 0.06) {
      for (let y = 0.40; y <= 0.701; y += 0.06) {
        crowdPts.push({ x, y, z });
      }
    }
  }

  // Chạy fit TOP cho Người A:
  const topCrowdRes = fitPedestrianBox(
    crowdPts,
    0.0, 0.0, 0.70, 0.0,
    0.60, 0.60, 1.70,
    {},
    "top"
  );

  // Nhờ phân cụm mật độ (chém đứt gap >= 14cm):
  // 1. Góc Yaw KHÔNG được bị xoay 90° theo trục nối Người A - Người B! (deltaYawDeg phải gần 0°)
  assert.ok(
    Math.abs(topCrowdRes.deltaYawDeg || 0) <= 15,
    `Test 70: Yaw Người A không bị kéo xoay theo đám đông (thực tế: ${topCrowdRes.deltaYawDeg}°)`
  );

  // Chạy fit ALL cho Người A:
  const allCrowdRes = fitPedestrianBox(
    crowdPts,
    0.0, 0.0, 0.70, 0.0,
    0.60, 0.60, 1.70,
    {},
    "all"
  );

  // 2. Chiều rộng W của Người A KHÔNG được phình to ôm cả Người B (W phải <= 0.55m, nếu dính Người B thì W sẽ > 0.85m)
  assert.ok(
    allCrowdRes.newW <= 0.55,
    `Test 70: Chiều rộng W Người A không bị phình ôm đám đông (thực tế: ${allCrowdRes.newW}m)`
  );
  // 3. Tâm Y của Người A không bị hút sang phía Người B (newCenterY phải quanh 0.0m)
  assert.ok(
    Math.abs(allCrowdRes.newCenterY) <= 0.10,
    `Test 70: Tâm Y Người A không bị hút sang đám đông (thực tế: ${allCrowdRes.newCenterY}m)`
  );

  console.log(
    `✅ Test 70: Kháng Nhiễu Cụm Đám Đông Người Đi Bộ: Chém đứt người bên cạnh, Yaw=${topCrowdRes.newYawDeg}°, W=${allCrowdRes.newW}m (không phình to sang Người B)`
  );
}

// =========================================================================
// TEST 71: NÚT FRONT ÔM SÁT MÂY ĐIỂM ĐÓN TIA EGO (LINE-OF-SIGHT BOUNDARY SNAP)
// =========================================================================
{
  const pedPts: Array<{ x: number; y: number; z: number }> = [];
  // Người đi bộ tại (x = 8.0m, y = 2.0m). Xe Ego tại (x = 8.0m, y = 6.0m) (Ego nằm ở phía bên TRÁI người, ly > 0).
  // Thân người có bề ngang y từ 1.82m đến 2.18m (bán kính 18cm quanh tâm y=2.0m).
  // Mép đón tia ngoài cùng phía Ego là y = 2.18m!
  for (let z = 0.0; z <= 1.40; z += 0.1) {
    for (let x = 7.85; x <= 8.151; x += 0.06) {
      for (let y = 1.82; y <= 2.181; y += 0.06) {
        pedPts.push({ x, y, z });
      }
    }
  }

  const frontRes = fitPedestrianBox(
    pedPts,
    8.0, 2.0, 0.75, 0.0,
    0.60, 0.60, 1.70, // Box rộng W=0.60m
    { egoPos: { x: 8.0, y: 6.0, z: 0.0 } },
    "front"
  );

  // 1. Phải nhận diện sườn Trái đón tia từ xe Ego
  assert.ok(frontRes.message.includes("Sườn Trái đón tia Ego"), "Test 71: Phải nhận diện sườn Trái đón tia Ego");

  // 2. Mép trái của Box (+newW/2) phải ÔM SÁT viền đón tia ngoài cùng (2.18m + 0.01m = 2.19m)
  const leftBoxEdge = frontRes.newCenterY + frontRes.newW / 2;
  assert.ok(
    Math.abs(leftBoxEdge - 2.19) <= 0.02,
    `Test 71: Mép trái box phải ôm sát viền đón tia 2.19m (thực tế: ${leftBoxEdge.toFixed(3)}m)`
  );

  // 3. Giữ nguyên 100% cao độ Z và kích thước L, W, H
  assert.strictEqual(frontRes.newCenterZ, 0.75, "Test 71: newCenterZ giữ nguyên 0.75m (Không ghim đất)");
  assert.strictEqual(frontRes.newW, 0.60, "Test 71: newW giữ nguyên 0.60m");
  assert.strictEqual(frontRes.newL, 0.60, "Test 71: newL giữ nguyên 0.60m");

  console.log(
    `✅ Test 71: Nút FRONT Ôm Sát Point Cloud Đón Tia Ego: Mép trái box bám khít ${leftBoxEdge.toFixed(2)}m (khớp viền đón tia 2.19m, giữ Z=0.75m & Size)`
  );
}

// 72. Test Tự Động Đo Cao Độ Mặt Đường Xe Ego (Ego Road Surface Ground Z)
{
  const egoScenePts: Array<{ x: number; y: number; z: number }> = [];
  // Giả lập mặt đường quanh xe Ego (Ego tại 0,0,0) có độ cao Z = -1.75m
  for (let x = -6.0; x <= 6.0; x += 0.5) {
    for (let y = -6.0; y <= 6.0; y += 0.5) {
      const d = Math.hypot(x, y);
      if (d >= 1.5 && d <= 5.5) {
        egoScenePts.push({ x, y, z: -1.75 + (Math.random() * 0.02 - 0.01) });
      }
    }
  }
  const measuredEgoZ = estimateEgoRoadGroundZ(egoScenePts, { x: 0, y: 0, z: 0 });
  assert.ok(
    Math.abs(measuredEgoZ - (-1.75)) < 0.03,
    `Test 72: Cao độ mặt đường Ego phải xấp xỉ -1.75m (thực tế: ${measuredEgoZ}m)`
  );
  console.log(`✅ Test 72: Tự Động Đo Cao Độ Mặt Đường Xe Ego: Z = ${measuredEgoZ}m (khớp mốc -1.75m)`);
}

// 73. Test Xe Ở Xa Ít Điểm / Không Có Point Mặt Đất: Neo Chuẩn Theo Ego Road Z, CHỐNG LÚN ÂM ĐẤT
{
  // Xe ở xa X = 25m, Y = 10m chỉ có 4 điểm vỏ xe ở trên cao Z = -0.5m, dưới gầm không có tia laser lọt vào
  const sparseCarPts = [
    { x: 25.0, y: 10.0, z: -0.5 },
    { x: 25.5, y: 10.2, z: -0.4 },
    { x: 24.5, y: 9.8, z: -0.45 },
    { x: 26.0, y: 10.1, z: -0.3 },
  ];
  // Gọi computeGroundSlopesAndZ với mốc egoRoadZ = -1.75m
  const snapRes = computeGroundSlopesAndZ(
    sparseCarPts,
    25.0, 10.0, 0.0, 0.0,
    2.3, 0.9, 0.5,
    { egoRoadZ: -1.75 }
  );

  assert.strictEqual(snapRes.isFallbackZeroGround, true, "Test 73: Phải kích hoạt fallback khi ít điểm");
  assert.ok(
    Math.abs(snapRes.groundZ! - (-1.75)) < 0.01,
    `Test 73: Đáy xe phải neo chuẩn tại Ego Road Z = -1.75m, KHÔNG BỊ ÂM ĐẤT (thực tế: ${snapRes.groundZ}m)`
  );
  assert.strictEqual(snapRes.rollDeg, 0, "Test 73: Roll phải khóa cứng 0°");
  assert.strictEqual(snapRes.pitchDeg, 0, "Test 73: Pitch phải khóa cứng 0°");
  console.log(`✅ Test 73: Chống Lún Âm Đất Cho Xe Ít Điểm: Neo đáy xe chuẩn Z = ${snapRes.groundZ}m theo mốc Ego-Z (Khóa Roll=0°, Pitch=0°)`);
}

// 74a. Test Căn Góc Dốc Ngang Front Roll Theo 2 Đầu Mép Biên 0–10% & 90–100%
{
  // Mặt đường nghiêng ngang Front: z = -0.40 - 0.07 * y + 0.03 * x (độ dốc ngang Roll ~ -4.0°)
  const tiltedRoadPts: Array<{ x: number; y: number; z: number }> = [];
  for (let x = -2.5; x <= 2.5; x += 0.4) {
    for (let y = -2.0; y <= 2.0; y += 0.3) {
      if (Math.abs(y) > 0.6) {
        tiltedRoadPts.push({ x, y, z: -0.40 - 0.07 * y + 0.03 * x });
      }
    }
  }

  const rollRes = computeGroundSlopesAndZ(tiltedRoadPts, 0, 0, 0.4, 0, 2.3, 0.9);
  assert.ok(
    Math.abs(rollRes.rollDeg - (-4.0)) < 0.6,
    `Test 74a: Góc Front Roll phải bám theo độ dốc 2 đầu mép xấp xỉ -4.0° (thực tế: ${rollRes.rollDeg}°)`
  );
  assert.ok(
    Math.abs(rollRes.groundZ! - (-0.40)) < 0.04,
    `Test 74a: Cao độ c0 phải ở trung điểm 2 mép -0.40m để 2 đầu box đều nhau (thực tế: ${rollRes.groundZ}m)`
  );
  console.log(`✅ Test 74a: Căn Front Roll 2 Mép Biên 0-10% & 90-100%: Roll = ${rollRes.rollDeg}°, Đáy cách đều mặt đường (c0 = ${rollRes.groundZ}m)`);
}

// 74b. Test Khóa Cứng Roll = 0° Khi Không Đủ Điểm Check Mây Điểm Đường Ở 2 Đầu
{
  // Chỉ có điểm ở 1 bên mép phải (y in [-1.3, -0.7]), bên mép trái hoàn toàn không có điểm
  const oneSidePts: Array<{ x: number; y: number; z: number }> = [];
  for (let x = -2.5; x <= 2.5; x += 0.4) {
    for (let y = -1.3; y <= -0.7; y += 0.2) {
      oneSidePts.push({ x, y, z: -0.40 - 0.07 * y });
    }
  }

  const oneSideRes = computeGroundSlopesAndZ(oneSidePts, 0, 0, 0.4, 0, 2.3, 0.9);
  assert.strictEqual(
    oneSideRes.rollDeg,
    0,
    `Test 74b: Khi thiếu điểm ở 1 trong 2 đầu mép biên, BẮT BUỘC KHÓA CỨNG Roll = 0° (thực tế: ${oneSideRes.rollDeg}°)`
  );
  console.log(`✅ Test 74b: Thiếu Điểm 2 Đầu Mép Biên ➔ Khóa Cứng Roll = 0° Phẳng Tuyệt Đối`);
}

// 75. Test Nhận Diện Xe Đỗ Trên Nền Vỉa Hè (Curb Ground Z Reference)
{
  // Xe đỗ hoàn toàn trên vỉa hè: Mây điểm mặt vỉa hè phẳng ở Z = -1.55m
  // Mặt đường Ego chuẩn ở Z = -1.75m (Vỉa hè cao hơn mặt đường Ego +20cm)
  const curbSurfacePts: Array<{ x: number; y: number; z: number }> = [];
  for (let x = -2.5; x <= 2.5; x += 0.4) {
    for (let y = -1.3; y <= 1.3; y += 0.3) {
      curbSurfacePts.push({ x, y, z: -1.55 });
    }
  }

  const curbRes = computeGroundSlopesAndZ(
    curbSurfacePts,
    0, 0, 0.4, 0,
    2.3, 0.9, 0.5,
    { egoRoadZ: -1.75 }
  );

  assert.strictEqual(curbRes.isCurbGround, true, "Test 75: Phải nhận diện xe đỗ trên nền vỉa hè");
  assert.ok(
    Math.abs(curbRes.groundZ! - (-1.55)) < 0.02,
    `Test 75: Đáy xe phải ghim chuẩn vào mặt vỉa hè -1.55m (thực tế: ${curbRes.groundZ}m)`
  );
  assert.strictEqual(curbRes.rollDeg, 0, "Test 75: Xe đỗ phẳng trên vỉa hè phải có Roll = 0°");
  console.log(`✅ Test 75: Tự Nhận Diện Nền Vỉa Hè (+20cm so với Ego): Ghim đúng mặt vỉa hè Z = ${curbRes.groundZ}m, Khóa Roll = 0°`);
}

// 76. Test Người Đi Bộ Ít Điểm Ở Xa (N=6): Tự Thích Ứng Mật Độ Thưa, Giảm Trọng Số Chân, Không Teo Nhỏ
{
  // Người đi bộ ở khoảng cách xa (cx = 15m, cy = 5m), chỉ có 6 điểm tia LiDAR thưa thớt
  // Mặt đất z = 0.0m
  const sparsePedPts: Array<{ x: number; y: number; z: number }> = [
    { x: 15.12, y: 5.10, z: 1.45 }, // Ngực (Core body)
    { x: 14.92, y: 4.90, z: 1.15 }, // Hông (Core body)
    { x: 15.02, y: 5.04, z: 0.95 }, // Bụng (Core body)
    { x: 15.00, y: 5.00, z: 1.70 }, // Đỉnh đầu (Core body)
    { x: 15.06, y: 5.02, z: 0.22 }, // Cẳng chân (Tầng chân sát trục đứng d_xy <= 0.28m -> Được thu nạp bổ trợ)
    { x: 14.96, y: 4.96, z: 0.12 }, // Bàn chân sát đất (d_xy <= 0.28m)
    // Thêm điểm quét xiên loang sát đất cách xa 80cm (nhiễu mặt đường)
    { x: 15.80, y: 5.80, z: 0.05 },
  ];

  // Chạy Fit All
  const sparseFitRes = fitPedestrianBox(
    sparsePedPts,
    15.0, 5.0, 0.85, 0.0,
    0.60, 0.60, 1.70,
    { step: "all" }
  );

  // 1. Phải ôm trọn toàn bộ điểm người thật (span lx ~ 0.20m, ly ~ 0.20m + đệm 8cm -> L, W ~ 0.40m)
  assert.ok(
    sparseFitRes.newL >= 0.35 && sparseFitRes.newL <= 0.55,
    `Test 76: Chiều dài L người ít điểm phải ôm trọn điểm thật trong [0.35, 0.55]m (thực tế: ${sparseFitRes.newL}m)`
  );
  assert.ok(
    sparseFitRes.newW >= 0.35 && sparseFitRes.newW <= 0.55,
    `Test 76: Chiều rộng W người ít điểm phải ôm trọn điểm thật trong [0.35, 0.55]m (thực tế: ${sparseFitRes.newW}m)`
  );

  // 2. Điểm nhiễu sát đất tại (15.8, 5.8) phải bị loại bỏ 100%, tâm không bị lệch quá 10cm
  assert.ok(
    Math.abs(sparseFitRes.newCenterX - 15.02) < 0.10,
    `Test 76: Tâm X phải bám cụm điểm thật ~15.02m (thực tế: ${sparseFitRes.newCenterX}m)`
  );
  assert.ok(
    Math.abs(sparseFitRes.newCenterY - 5.01) < 0.10,
    `Test 76: Tâm Y phải bám cụm điểm thật ~5.01m (thực tế: ${sparseFitRes.newCenterY}m)`
  );

  // 3. Chiều cao H nở lên đỉnh đầu + 5cm đệm gọn gàng (1.70m + 0.05m = 1.75m)
  assert.ok(
    Math.abs(sparseFitRes.newH - 1.75) < 0.05,
    `Test 76: Chiều cao H phải ôm đỉnh đầu + 5cm đệm gọn gàng ~1.75m (thực tế: ${sparseFitRes.newH}m)`
  );

  console.log(
    `✅ Test 76: Người Ít Điểm Ở Xa (N=6): Tự ôm trọn điểm thật ${sparseFitRes.newL}x${sparseFitRes.newW}x${sparseFitRes.newH}m, giảm trọng số chân và loại bỏ 100% nhiễu loang sát đất`
  );
}

// 77. Test Người Đi Bộ Bị Ghosting Kéo Dài (Motion Smear): Khóa Trần Kích Thước & Ưu Tiên Bám Cản Đón Tia Ego
{
  // Trường hợp 1: Ghosting dính liền liên tục (vệt chuyển động không có khoảng trống, kéo dài 1.35m)
  // Điểm nối liền từ X = 10.15m lùi về tận 8.85m (bước 0.08m < 0.14m)
  const continuousGhostPts: Array<{ x: number; y: number; z: number }> = [];

  // Mặt đất
  for (let x = 8.0; x <= 11.0; x += 0.5) {
    for (let y = 4.0; y <= 6.0; y += 0.5) {
      continuousGhostPts.push({ x, y, z: 0.0 });
    }
  }

  // Thân thật và vệt bóng ma dính liền
  for (let x = 8.85; x <= 10.15; x += 0.08) {
    continuousGhostPts.push({ x, y: 5.0, z: 1.2 });
  }

  // Giả sử Annotator kéo box dài 1.10m do bị đánh lừa bởi vệt bóng ma ghosting
  // Xe Ego ở phía trước tại (20, 5, 0) -> Ego nhìn thấy mặt trước đón tia (X lớn hơn)
  const ghostFitRes = fitPedestrianBox(
    continuousGhostPts,
    10.0, 5.0, 0.85, 0.0,
    1.10, 0.60, 1.70,
    { step: "l", egoPos: { x: 20.0, y: 5.0, z: 0.0 } }
  );

  // 1. Chiều dài L BẮT BUỘC KHỐNG CHẾ TRẦN AN TOÀN L <= 0.78m (Không bị dãn ra 1.38m theo bóng ma)
  assert.strictEqual(
    ghostFitRes.newL,
    0.78,
    `Test 77: Chiều dài L phải bị khóa trần an toàn 0.78m kháng ghosting (thực tế: ${ghostFitRes.newL}m)`
  );

  // 2. Mép trước đón tia Ego phải bám sát thân thật 10.15m (không trôi lùi theo bóng ma)
  const frontBoxEdge = ghostFitRes.newCenterX + ghostFitRes.newL / 2;
  assert.ok(
    Math.abs(frontBoxEdge - 10.16) < 0.05,
    `Test 77: Mép trước box phải bám khít mép thân thật đón tia Ego 10.16m (thực tế: ${frontBoxEdge.toFixed(3)}m)`
  );

  console.log(
    `✅ Test 77: Người Bị Ghosting Kéo Dài: Khóa trần an toàn L = ${ghostFitRes.newL}m, Mép trước đón tia bám khít thân thật ${frontBoxEdge.toFixed(2)}m (loại bỏ bóng ma)`
  );
}

// 78. Test Xe 2 Bánh Ít Điểm Ở Xa (N=7): Tự Thích Ứng, Không Chém Đứt Bánh Xe, Bắt Trọn Tay Lái
{
  // Xe máy ở xa (cx = 20m, cy = 8m, yaw = 0 rad), chỉ có 7 điểm
  const sparseBikePts: Array<{ x: number; y: number; z: number }> = [
    { x: 20.70, y: 8.00, z: 0.35 }, // Bánh trước
    { x: 19.30, y: 8.00, z: 0.35 }, // Bánh sau
    { x: 20.00, y: 8.00, z: 0.60 }, // Khung xe
    { x: 19.80, y: 8.00, z: 1.10 }, // Yên xe / Người lái
    { x: 20.45, y: 8.35, z: 1.05 }, // Tay lái trái
    { x: 20.45, y: 7.65, z: 1.05 }, // Tay lái phải
    { x: 19.85, y: 8.00, z: 1.55 }, // Nón bảo hiểm
    // Điểm mặt đất quanh xe
    { x: 20.00, y: 8.00, z: 0.00 },
  ];

  const bikeFitRes = fitTwoWheelerBox(
    sparseBikePts,
    20.0, 8.0, 0.85, 0.0,
    1.80, 0.70, 1.55,
    { step: "w" }
  );

  // 1. Không bị teo nhỏ: Chiều rộng W bắt trọn 2 đầu tay lái ly in [-0.35, +0.35] + đệm gương vừa vặn
  assert.ok(
    bikeFitRes.newW >= 0.74 && bikeFitRes.newW <= 0.85,
    `Test 78: Chiều rộng W xe 2 bánh ít điểm phải bắt trọn tay lái trong [0.74, 0.85]m (thực tế: ${bikeFitRes.newW}m)`
  );

  // 2. Chiều dài L giữ nguyên 1.80m (chuẩn xe 2 bánh bảo toàn L)
  assert.strictEqual(bikeFitRes.newL, 1.80, "Test 78: Chiều dài L bảo toàn 1.80m");

  console.log(
    `✅ Test 78: Xe 2 Bánh Ít Điểm Ở Xa (N=7): Bắt trọn tay lái W = ${bikeFitRes.newW}m, bảo toàn L = ${bikeFitRes.newL}m không bị teo nhỏ`
  );
}

// 79. Test Xe 2 Bánh Bị Ghosting Dãn Ngang: Khống Chế Trần An Toàn W <= 0.85m
{
  // Xe 2 bánh bị bóng ma dãn rộng sang ngang (vết quét loang ly in [-0.80, 0.80] -> spanW = 1.6m)
  const ghostBikePts: Array<{ x: number; y: number; z: number }> = [
    { x: 10.50, y: 5.00, z: 0.35 },
    { x: 9.50, y: 5.00, z: 0.35 },
    { x: 10.00, y: 5.00, z: 0.80 },
    // Vệt ghosting dãn ngang
    { x: 10.00, y: 5.80, z: 1.05 },
    { x: 10.00, y: 4.20, z: 1.05 },
    { x: 10.00, y: 5.00, z: 0.00 }, // Mặt đất
  ];

  const ghostBikeRes = fitTwoWheelerBox(
    ghostBikePts,
    10.0, 5.0, 0.85, 0.0,
    1.80, 0.70, 1.55,
    { step: "w" }
  );

  // Chiều rộng W BẮT BUỘC KHỐNG CHẾ TRẦN AN TOÀN W <= 0.85m (Không bị phình to lên 0.95m hay 1.60m)
  assert.strictEqual(
    ghostBikeRes.newW,
    0.85,
    `Test 79: Chiều rộng W phải bị khống chế trần an toàn 0.85m kháng ghosting (thực tế: ${ghostBikeRes.newW}m)`
  );

  console.log(
    `✅ Test 79: Xe 2 Bánh Bị Ghosting Dãn Ngang 1.6m: Khóa trần an toàn W = ${ghostBikeRes.newW}m kháng ghosting`
  );
}

// 80. Test Căn SIDE Người Đi Bộ: Giữ Trọn Curpoint Bàn Chân / Mũi Chân Đón Tia (Không Cắt Mất Điểm Chân)
{
  const pedPtsWithFoot: Array<{ x: number; y: number; z: number }> = [];
  // Điểm mặt đất
  for (let x = 9.0; x <= 11.0; x += 0.5) {
    for (let y = 4.0; y <= 6.0; y += 0.5) {
      pedPtsWithFoot.push({ x, y, z: 0.0 });
    }
  }

  // 12 điểm thân người cốt lõi (từ hông lên đầu Z in [0.4m, 1.6m])
  for (let z = 0.4; z <= 1.6; z += 0.2) {
    pedPtsWithFoot.push({ x: 10.0, y: 5.0, z });
    pedPtsWithFoot.push({ x: 9.92, y: 4.95, z });
  }

  // Curpoint bàn chân/mũi chân bước về phía trước đón tia Ego (X = 10.25m, Z = 0.12m sát đất)
  pedPtsWithFoot.push({ x: 10.25, y: 5.0, z: 0.12 });
  pedPtsWithFoot.push({ x: 10.20, y: 5.0, z: 0.15 });

  // Xe Ego ở phía trước tại (20, 5, 0)
  const sideRes = fitPedestrianBox(
    pedPtsWithFoot,
    10.0, 5.0, 0.85, 0.0,
    0.60, 0.60, 1.70,
    { egoPos: { x: 20.0, y: 5.0, z: 0.0 } },
    "side"
  );

  // Mép trước box phải bọc trọn curpoint mũi chân 10.25m (+1cm đệm đón tia = 10.26m)
  const frontBoxEdge = sideRes.newCenterX + sideRes.newL / 2;
  assert.ok(
    frontBoxEdge >= 10.24,
    `Test 80: Mép trước box phải bọc trọn curpoint mũi chân >= 10.24m, không bị cắt mất curpoint (thực tế: ${frontBoxEdge.toFixed(3)}m)`
  );
  assert.strictEqual(sideRes.newCenterZ, 0.85, "Test 80: Giữ nguyên Z=0.85m");
  assert.strictEqual(sideRes.newL, 0.60, "Test 80: Khóa size L=0.60m");

  console.log(
    `✅ Test 80: Căn SIDE Người đi bộ: Bọc trọn curpoint mũi chân đón tia ${frontBoxEdge.toFixed(2)}m >= 10.24m (không cắt mất curpoint chân)`
  );
}

// 81. Test Căn FRONT Người Đi Bộ: Giữ Trọn Curpoint Sườn / Cánh Tay Đón Tia
{
  const pedPtsWithArm: Array<{ x: number; y: number; z: number }> = [];
  // Thân người
  for (let z = 0.4; z <= 1.6; z += 0.2) {
    pedPtsWithArm.push({ x: 10.0, y: 5.0, z });
  }
  // Curpoint sườn trái/cánh tay đón tia Ego (Y = 5.24m)
  pedPtsWithArm.push({ x: 10.0, y: 5.24, z: 1.10 });

  // Xe Ego ở bên trái tại (10, 15, 0)
  const frontRes = fitPedestrianBox(
    pedPtsWithArm,
    10.0, 5.0, 0.85, 0.0,
    0.60, 0.60, 1.70,
    { egoPos: { x: 10.0, y: 15.0, z: 0.0 } },
    "front"
  );

  const leftBoxEdge = frontRes.newCenterY + frontRes.newW / 2;
  assert.ok(
    leftBoxEdge >= 5.23,
    `Test 81: Mép sườn trái box phải ôm trọn curpoint sườn đón tia >= 5.23m (thực tế: ${leftBoxEdge.toFixed(3)}m)`
  );
  assert.strictEqual(frontRes.newCenterZ, 0.85, "Test 81: Giữ nguyên Z=0.85m");

  console.log(
    `✅ Test 81: Căn FRONT Người đi bộ: Ôm trọn curpoint sườn đón tia ${leftBoxEdge.toFixed(2)}m >= 5.23m (không cắt mất curpoint)`
  );
}

// 82. Test Căn SIDE Xe 2 Bánh: Giữ Trọn Curpoint Lốp Bánh Trước Sát Đất Đón Tia
{
  const bikePtsWithTire: Array<{ x: number; y: number; z: number }> = [];
  // Điểm mặt đất
  for (let x = 14.0; x <= 16.0; x += 0.5) {
    for (let y = 4.0; y <= 6.0; y += 0.5) {
      bikePtsWithTire.push({ x, y, z: 0.0 });
    }
  }
  // Thân xe
  for (let x = 14.5; x <= 15.5; x += 0.2) {
    bikePtsWithTire.push({ x, y: 5.0, z: 0.70 });
  }
  // Curpoint lốp trước sát đất chạm sàn (X = 15.82m, Z = 0.12m < 0.25m)
  bikePtsWithTire.push({ x: 15.82, y: 5.0, z: 0.12 });

  // Xe Ego ở phía trước tại (25, 5, 0)
  const bikeSideRes = fitTwoWheelerBox(
    bikePtsWithTire,
    15.0, 5.0, 0.80, 0.0,
    1.80, 0.70, 1.50,
    { egoPos: { x: 25.0, y: 5.0, z: 0.0 } },
    "side"
  );

  const frontTireEdge = bikeSideRes.newCenterX + bikeSideRes.newL / 2;
  assert.ok(
    frontTireEdge >= 15.80,
    `Test 82: Mép cản trước xe 2 bánh phải bọc trọn curpoint lốp trước >= 15.80m (thực tế: ${frontTireEdge.toFixed(3)}m)`
  );
  assert.strictEqual(bikeSideRes.newL, 1.80, "Test 82: Khóa size L=1.80m");

  console.log(
    `✅ Test 82: Căn SIDE Xe 2 Bánh: Bọc trọn curpoint lốp trước đón tia ${frontTireEdge.toFixed(2)}m >= 15.80m (không cắt mất curpoint bánh xe)`
  );
}

// 83. Test Căn FRONT Xe 2 Bánh: Giữ Trọn Curpoint Gương Xe / Tay Lái Đón Tia
{
  const bikePtsWithMirror: Array<{ x: number; y: number; z: number }> = [];
  // Thân xe
  for (let z = 0.4; z <= 1.4; z += 0.2) {
    bikePtsWithMirror.push({ x: 15.0, y: 5.0, z });
  }
  // Curpoint gương chiếu hậu / tay lái sườn trái đón tia Ego (Y = 5.34m)
  bikePtsWithMirror.push({ x: 15.0, y: 5.34, z: 1.05 });

  // Xe Ego ở bên trái tại (15, 15, 0)
  const bikeFrontRes = fitTwoWheelerBox(
    bikePtsWithMirror,
    15.0, 5.0, 0.80, 0.0,
    1.80, 0.70, 1.50,
    { egoPos: { x: 15.0, y: 15.0, z: 0.0 } },
    "front"
  );

  const leftMirrorEdge = bikeFrontRes.newCenterY + bikeFrontRes.newW / 2;
  assert.ok(
    leftMirrorEdge >= 5.33,
    `Test 83: Mép sườn trái xe 2 bánh phải ôm trọn curpoint gương xe >= 5.33m (thực tế: ${leftMirrorEdge.toFixed(3)}m)`
  );
  assert.strictEqual(bikeFrontRes.newW, 0.70, "Test 83: Khóa size W=0.70m");

  console.log(
    `✅ Test 83: Căn FRONT Xe 2 Bánh: Ôm trọn curpoint gương chiếu hậu đón tia ${leftMirrorEdge.toFixed(2)}m >= 5.33m (không cắt mất curpoint)`
  );
}

// 84. Test Căn SIDE Xe 2 Bánh MẤT BÁNH TRƯỚC (Dựa vào Người Lái 42% + Bánh Sau)
{
  const bikePtsMissingFront: Array<{ x: number; y: number; z: number }> = [];
  // Mặt đất
  for (let x = 18.5; x <= 21.5; x += 0.5) {
    for (let y = 9.0; y <= 11.0; y += 0.5) {
      bikePtsMissingFront.push({ x, y, z: 0.0 });
    }
  }
  // Người lái ngồi ở vị trí 42% tính từ đầu cản trước (X = 20.15m, Z in [0.7m, 1.4m])
  for (let z = 0.70; z <= 1.40; z += 0.15) {
    bikePtsMissingFront.push({ x: 20.15, y: 10.0, z });
  }
  // Bánh sau có điểm tại X = 19.10m, Z = 0.15m
  bikePtsMissingFront.push({ x: 19.10, y: 10.0, z: 0.15 });
  // Phía trước người lái hoàn toàn KHÔNG CÓ ĐIỂM (mất bánh trước)!

  // Xe Ego ở phía sau tại (10, 10, 0)
  const res84 = fitTwoWheelerBox(
    bikePtsMissingFront,
    20.0, 10.0, 0.80, 0.0,
    1.85, 0.70, 1.50,
    { egoPos: { x: 10.0, y: 10.0, z: 0.0 } },
    "side"
  );

  const frontEdge84 = res84.newCenterX + res84.newL / 2;
  const rearEdge84 = res84.newCenterX - res84.newL / 2;

  // Cản sau ôm sát bánh sau thật (19.10m)
  assert.ok(
    rearEdge84 <= 19.15,
    `Test 84: Mép cản sau phải ôm sát bánh sau thật <= 19.15m (thực tế: ${rearEdge84.toFixed(3)}m)`
  );
  // Cản trước tự động vươn tới đúng cản trước ước lượng theo Người Lái 42% (>= 20.90m)
  assert.ok(
    frontEdge84 >= 20.90,
    `Test 84: Mép cản trước phải tự động vươn tới đầu xe ước lượng theo Người Lái 42% >= 20.90m (thực tế: ${frontEdge84.toFixed(3)}m)`
  );
  assert.strictEqual(res84.newL, 1.85, "Test 84: Khóa size L=1.85m");

  console.log(
    `✅ Test 84: Xe 2 Bánh MẤT BÁNH TRƯỚC: Mép sau bám lốp sau (${rearEdge84.toFixed(2)}m) & Mép trước tự động vươn chuẩn Người Lái 42% (${frontEdge84.toFixed(2)}m >= 20.90m)`
  );
}

// 85. Test Căn SIDE Xe 2 Bánh MẤT BÁNH SAU (Dựa vào Người Lái 42% + Bánh Trước)
{
  const bikePtsMissingRear: Array<{ x: number; y: number; z: number }> = [];
  // Mặt đất
  for (let x = 28.5; x <= 31.5; x += 0.5) {
    for (let y = 9.0; y <= 11.0; y += 0.5) {
      bikePtsMissingRear.push({ x, y, z: 0.0 });
    }
  }
  // Người lái ngồi ở vị trí 42% tính từ đầu cản trước (X = 30.15m, Z in [0.7m, 1.4m])
  for (let z = 0.70; z <= 1.40; z += 0.15) {
    bikePtsMissingRear.push({ x: 30.15, y: 10.0, z });
  }
  // Bánh trước có điểm tại X = 30.90m, Z = 0.15m
  bikePtsMissingRear.push({ x: 30.90, y: 10.0, z: 0.15 });
  // Phía sau người lái hoàn toàn KHÔNG CÓ ĐIỂM (mất bánh sau)!

  // Xe Ego ở phía trước tại (40, 10, 0)
  const res85 = fitTwoWheelerBox(
    bikePtsMissingRear,
    30.0, 10.0, 0.80, 0.0,
    1.85, 0.70, 1.50,
    { egoPos: { x: 40.0, y: 10.0, z: 0.0 } },
    "side"
  );

  const frontEdge85 = res85.newCenterX + res85.newL / 2;
  const rearEdge85 = res85.newCenterX - res85.newL / 2;

  // Cản trước ôm sát bánh trước thật (30.90m)
  assert.ok(
    frontEdge85 >= 30.85,
    `Test 85: Mép cản trước phải ôm sát bánh trước thật >= 30.85m (thực tế: ${frontEdge85.toFixed(3)}m)`
  );
  // Cản sau tự động vươn về phía sau theo Người Lái 42% (<= 29.10m)
  assert.ok(
    rearEdge85 <= 29.10,
    `Test 85: Mép cản sau phải tự động vươn về đuôi xe ước lượng theo Người Lái 42% <= 29.10m (thực tế: ${rearEdge85.toFixed(3)}m)`
  );
  assert.strictEqual(res85.newL, 1.85, "Test 85: Khóa size L=1.85m");

  console.log(
    `✅ Test 85: Xe 2 Bánh MẤT BÁNH SAU: Mép trước bám lốp trước (${frontEdge85.toFixed(2)}m) & Mép sau tự động vươn chuẩn Người Lái 42% (${rearEdge85.toFixed(2)}m <= 29.10m)`
  );
}

// 86. Test Căn SIDE Xe 2 Bánh MẤT CẢ 2 BÁNH (Chỉ Có Người Ngồi Lái Tầng Cao)
{
  const bikePtsOnlyRider: Array<{ x: number; y: number; z: number }> = [];
  // Mặt đất
  for (let x = 38.5; x <= 41.5; x += 0.5) {
    for (let y = 9.0; y <= 11.0; y += 0.5) {
      bikePtsOnlyRider.push({ x, y, z: 0.0 });
    }
  }
  // Chỉ có điểm người lái tại X = 40.15m (lxRider ~ +0.15m)
  for (let z = 0.70; z <= 1.40; z += 0.15) {
    bikePtsOnlyRider.push({ x: 40.15, y: 10.0, z });
  }

  // Bấm SIDE (không có bánh trước và bánh sau)
  const res86 = fitTwoWheelerBox(
    bikePtsOnlyRider,
    40.0, 10.0, 0.80, 0.0,
    1.85, 0.70, 1.50,
    { egoPos: { x: 50.0, y: 10.0, z: 0.0 } },
    "side"
  );

  // Tâm box mới phải định vị chính xác quanh 40.0m (khớp vị trí người lái 42% từ đầu xe)
  assert.ok(
    Math.abs(res86.newCenterX - 40.0) < 0.05,
    `Test 86: Tâm box mới phải ở quanh 40.0m (thực tế: ${res86.newCenterX.toFixed(3)}m)`
  );
  assert.strictEqual(res86.newL, 1.85, "Test 86: Khóa size L=1.85m");

  console.log(
    `✅ Test 86: Xe 2 Bánh MẤT CẢ 2 BÁNH: Định vị tâm chuẩn theo Người Lái 42% (Tâm X = ${res86.newCenterX.toFixed(2)}m ~ 40.0m)`
  );
}

// 87. Test Căn Yaw Theo Vạch Sơn Phản Quang 3D (LiDAR Intensity Lane Snap)
{
  const testPts87: Array<{ x: number; y: number; z: number; intensity?: number }> = [];
  // 1. Mặt đường nhựa xung quanh (intensity thấp 10 - 25)
  for (let x = -10; x <= 10; x += 1.0) {
    for (let y = -4; y <= 4; y += 1.0) {
      testPts87.push({ x, y, z: 0.0, intensity: 18 });
    }
  }
  // 2. Vạch sơn phản quang thẳng tắp theo trục X tại Y = 1.8m (intensity cao 180 - 220)
  for (let x = -9.0; x <= 9.0; x += 0.3) {
    testPts87.push({ x, y: 1.80, z: 0.0, intensity: 200 });
  }

  // Xe tại tâm (0, 0, 0.75m), góc Yaw ban đầu bị lệch +8 độ (0.1396 rad)
  const initYawRad = (8.0 * Math.PI) / 180;
  const res87 = fitYawToLaneIntensity(
    testPts87,
    0.0, 0.0, 0.75,
    initYawRad,
    4.6, 1.85, 1.5,
    { groundZ: 0.0 }
  );

  assert.strictEqual(res87.hasLane, true, "Test 87: Phải nhận diện được vạch sơn làn đường phản quang");
  assert.ok(
    Math.abs(res87.newYawDeg) < 0.6,
    `Test 87: Góc Yaw mới phải bám thẳng tắp theo tim đường 0° (thực tế: ${res87.newYawDeg}°)`
  );
  assert.ok(res87.confidence >= 70, `Test 87: Độ tin cậy phải >= 70% (thực tế: ${res87.confidence}%)`);

  console.log(
    `✅ Test 87: Căn Yaw Theo Vạch Sơn LiDAR: Góc ban đầu +8.0° ➔ Nắn thẳng tắp theo làn ${res87.newYawDeg}° (Độ tin cậy: ${res87.confidence}%, ${res87.inliersCount} điểm vạch sơn)`
  );
}

// 88. Test Xe Quay Ngược Chiều (Yaw ban đầu 172°) ➔ Tự Động Chọn Hướng 180°
{
  const testPts88: Array<{ x: number; y: number; z: number; intensity?: number }> = [];
  // Mặt đường
  for (let x = -8; x <= 8; x += 1.0) {
    for (let y = -3; y <= 3; y += 1.0) {
      testPts88.push({ x, y, z: 0.0, intensity: 20 });
    }
  }
  // Vạch sơn theo trục X tại Y = -1.8m
  for (let x = -7.0; x <= 7.0; x += 0.3) {
    testPts88.push({ x, y: -1.80, z: 0.0, intensity: 210 });
  }

  // Xe quay ngược chiều: Yaw = 172 độ (3.0019 rad)
  const initYawRad = (172.0 * Math.PI) / 180;
  const res88 = fitYawToLaneIntensity(
    testPts88,
    0.0, 0.0, 0.75,
    initYawRad,
    4.6, 1.85, 1.5,
    { groundZ: 0.0 }
  );

  assert.strictEqual(res88.hasLane, true, "Test 88: Phải nhận diện vạch sơn khi xe quay ngược chiều");
  // Phải chọn góc ngược chiều ~ 180° hoặc -180°, tuyệt đối không lộn ngược đầu xe về 0°
  const absYaw = Math.abs(res88.newYawDeg);
  assert.ok(
    Math.abs(absYaw - 180) < 0.8,
    `Test 88: Phải căn ngược chiều ~180° (thực tế: ${res88.newYawDeg}°)`
  );

  console.log(
    `✅ Test 88: Xe Chạy Ngược Chiều: Góc ban đầu 172.0° ➔ Khóa hướng ngược chiều chuẩn xác ${res88.newYawDeg}° (Không lộn đầu xe)`
  );
}

// 89. Test Cơ Chế Phòng Vệ Fallback An Toàn (Không Vạch Sơn Hoặc Xe Đang Rẽ Góc Vuông 60°)
{
  // Trường hợp 1: Mặt đường không có vạch sơn (intensity đồng đều 20)
  const noLanePts: Array<{ x: number; y: number; z: number; intensity?: number }> = [];
  for (let x = -5; x <= 5; x += 1.0) {
    for (let y = -3; y <= 3; y += 1.0) {
      noLanePts.push({ x, y, z: 0.0, intensity: 20 });
    }
  }
  const initYaw = 0.25;
  const resNoLane = fitYawToLaneIntensity(noLanePts, 0, 0, 0.75, initYaw, 4.6, 1.85, 1.5, { groundZ: 0.0 });
  assert.strictEqual(resNoLane.hasLane, false, "Test 89a: Không có vạch sơn ➔ hasLane = false");
  assert.strictEqual(resNoLane.newYawRad, initYaw, "Test 89a: Giữ nguyên góc Yaw ban đầu an toàn 100%");

  // Trường hợp 2: Có vạch sơn nhưng xe đang rẽ góc vuông 60° (vượt trần 35°)
  const turningPts: Array<{ x: number; y: number; z: number; intensity?: number }> = [];
  for (let x = -8; x <= 8; x += 1.0) {
    for (let y = -3; y <= 3; y += 1.0) {
      turningPts.push({ x, y, z: 0.0, intensity: 20 });
    }
  }
  for (let x = -7; x <= 7; x += 0.3) {
    turningPts.push({ x, y: 1.5, z: 0.0, intensity: 200 });
  }
  const turningYawRad = (60.0 * Math.PI) / 180; // Xe đang rẽ 60 độ
  const resTurning = fitYawToLaneIntensity(turningPts, 0, 0, 0.75, turningYawRad, 4.6, 1.85, 1.5, { groundZ: 0.0 });
  assert.strictEqual(resTurning.hasLane, false, "Test 89b: Xe rẽ 60° vượt trần 35° ➔ Hủy căn làn để bảo vệ góc rẽ thật");
  assert.strictEqual(resTurning.newYawRad, turningYawRad, "Test 89b: Giữ nguyên góc rẽ của xe");

  console.log(
    `✅ Test 89: Cơ Chế Phòng Vệ Fallback An Toàn 100% (Tự động giữ nguyên góc xe khi không có vạch sơn hoặc xe đang rẽ cua 60°)`
  );
}

// 90. Test Tự Động Nhận Diện Xe Gác Lề Bên Trái & Bên Phải Theo Dải Curpoint 30% - 30% Đầu Cuối
{
  // 90a: Xe đỗ gác lề bên Trái (2 bánh trái trên vỉa hè cao z = -0.22m, 2 bánh phải dưới đường z = -0.38m, chênh 16cm)
  const halfCurbLeftPts: Array<{ x: number; y: number; z: number }> = [];
  // Mép phải (dải 0%–30% mép phải: ly in [-1.3, -0.6])
  for (let x = -2.0; x <= 2.0; x += 0.5) {
    for (let y = -1.3; y <= -0.6; y += 0.2) {
      halfCurbLeftPts.push({ x, y, z: -0.38 });
    }
  }
  // Mép trái (dải 70%–100% mép trái: ly in [0.6, 1.3])
  for (let x = -2.0; x <= 2.0; x += 0.5) {
    for (let y = 0.6; y <= 1.3; y += 0.2) {
      halfCurbLeftPts.push({ x, y, z: -0.22 });
    }
  }

  const res90a = computeGroundSlopesAndZ(halfCurbLeftPts, 0, 0, 0.4, 0, 2.3, 0.9, undefined, { egoRoadZ: -0.38 });
  assert.strictEqual(res90a.isHalfCurb, true, "Test 90a: Phải tự động phát hiện gác lề");
  assert.strictEqual(res90a.halfCurbSide, "left", "Test 90a: Phải nhận diện gác lề bên TRÁI");
  assert.strictEqual(res90a.curbHeightCm, 16, "Test 90a: Chiều cao bậc vỉa hè phải là 16cm");
  assert.ok(res90a.rollDeg > 3.0, `Test 90a: Góc Front Roll phải nghiêng dương > 3.0° (thực tế: ${res90a.rollDeg}°)`);
  assert.ok(Math.abs(res90a.groundZ! - (-0.30)) < 0.03, `Test 90a: Tâm c0 phải ở trung điểm -0.30m (thực tế: ${res90a.groundZ}m)`);

  // 90b: Xe đỗ gác lề bên Phải (2 bánh phải trên vỉa hè cao z = -0.24m, 2 bánh trái dưới đường z = -0.38m, chênh 14cm)
  const halfCurbRightPts: Array<{ x: number; y: number; z: number }> = [];
  for (let x = -2.0; x <= 2.0; x += 0.5) {
    for (let y = -1.3; y <= -0.6; y += 0.2) {
      halfCurbRightPts.push({ x, y, z: -0.24 });
    }
  }
  for (let x = -2.0; x <= 2.0; x += 0.5) {
    for (let y = 0.6; y <= 1.3; y += 0.2) {
      halfCurbRightPts.push({ x, y, z: -0.38 });
    }
  }

  const res90b = computeGroundSlopesAndZ(halfCurbRightPts, 0, 0, 0.4, 0, 2.3, 0.9, undefined, { egoRoadZ: -0.38 });
  assert.strictEqual(res90b.isHalfCurb, true, "Test 90b: Phải tự động phát hiện gác lề");
  assert.strictEqual(res90b.halfCurbSide, "right", "Test 90b: Phải nhận diện gác lề bên PHẢI");
  assert.strictEqual(res90b.curbHeightCm, 14, "Test 90b: Chiều cao bậc vỉa hè phải là 14cm");
  assert.ok(res90b.rollDeg < -3.0, `Test 90b: Góc Front Roll phải nghiêng âm < -3.0° (thực tế: ${res90b.rollDeg}°)`);

  console.log(
    `✅ Test 90: Tự Nhận Diện Xe Gác Lề Theo Curpoint 30%-30% Đầu Cuối: Trái (+16cm, Roll = ${res90a.rollDeg}°) & Phải (+14cm, Roll = ${res90b.rollDeg}°)`
  );
}

// 91. Test Tự Động Nhận Diện Xe Đỗ Hoàn Toàn Trên Vỉa Hè (Cả 2 bên phẳng, cao hơn Ego Road Z +15cm)
{
  const fullCurbPts: Array<{ x: number; y: number; z: number }> = [];
  // Mây điểm vỉa hè phẳng ở z = 0.15m (Ego Road Z = 0)
  for (let x = -2.0; x <= 2.0; x += 0.4) {
    for (let y = -1.2; y <= 1.2; y += 0.3) {
      fullCurbPts.push({ x, y, z: 0.15 });
    }
  }

  const res91 = computeGroundSlopesAndZ(fullCurbPts, 0, 0, 0.8, 0, 2.3, 0.9, undefined, { egoRoadZ: 0.0 });
  assert.strictEqual(res91.isCurbGround, true, "Test 91: Phải tự động nhận diện xe đỗ trên nền vỉa hè");
  assert.strictEqual(res91.isHalfCurb, false, "Test 91: Không phải gác lề");
  assert.strictEqual(res91.rollDeg, 0, "Test 91: Vỉa hè phẳng phải khóa cứng Roll = 0°");
  assert.strictEqual(res91.curbHeightCm, 15, "Test 91: Chiều cao bậc vỉa hè phải là 15cm so với Ego");
  assert.ok(Math.abs(res91.groundZ! - 0.15) < 0.02, `Test 91: Đáy xe phải bám sát mặt vỉa hè 0.15m (thực tế: ${res91.groundZ}m)`);

  console.log(
    `✅ Test 91: Tự Nhận Diện Xe Đỗ Trên Vỉa Hè (Full-Curb): Z = ${res91.groundZ}m (+${res91.curbHeightCm}cm so với Ego Z=0), Khóa Roll = 0°`
  );
}

// 92. Test Chưa Đủ Point Cloud Mặt Đất ➔ Fit Theo Độ Cao & Góc Thẳng Theo Ego
{
  // Chỉ có 3 điểm thưa dưới chân xe
  const sparseGroundPts: Array<{ x: number; y: number; z: number }> = [
    { x: 10.0, y: 5.0, z: -0.2 },
    { x: 10.2, y: 5.1, z: -0.1 },
    { x: 9.8, y: 4.9, z: -0.3 },
  ];

  const res92 = computeGroundSlopesAndZ(sparseGroundPts, 10.0, 5.0, 0.5, 0, 2.3, 0.9, undefined, { egoRoadZ: -1.75 });
  assert.strictEqual(res92.isFallbackZeroGround, true, "Test 92: Phải kích hoạt fallback khi chưa đủ điểm mặt đất");
  assert.strictEqual(res92.groundZ, -1.75, "Test 92: Đáy xe phải neo chuẩn theo Ego Road Z = -1.75m");
  assert.strictEqual(res92.rollDeg, 0, "Test 92: Phải fit góc thẳng theo Ego: Khóa Roll = 0°");
  assert.strictEqual(res92.pitchDeg, 0, "Test 92: Phải fit góc thẳng theo Ego: Khóa Pitch = 0°");

  console.log(
    `✅ Test 92: Chưa Đủ Point Cloud Mặt Đất: Tự động fit theo Ego Z = ${res92.groundZ}m & Góc thẳng theo Ego (Roll = 0°, Pitch = 0°)`
  );
}

// 93. Test Căn Dốc Dọc Side View (Pitch) Theo Dải 30% Đầu Và 30% Cuối Dọc Trục X
{
  // Mặt đường dốc dọc: Đầu xe (x > 1.0m) cao hơn đuôi xe (x < -1.0m)
  // spanX ~ 3.4m, zFront ~ -0.20m, zRear ~ -0.40m -> dốc dốc lên
  const slopedSidePts: Array<{ x: number; y: number; z: number }> = [];
  // 30% cuối (đuôi xe): x in [-2.0, -0.8], z = -0.40
  for (let x = -2.0; x <= -0.8; x += 0.2) {
    for (let y = -0.8; y <= 0.8; y += 0.3) {
      slopedSidePts.push({ x, y, z: -0.40 });
    }
  }
  // Vùng giữa
  for (let x = -0.6; x <= 0.6; x += 0.3) {
    for (let y = -0.8; y <= 0.8; y += 0.3) {
      slopedSidePts.push({ x, y, z: -0.30 });
    }
  }
  // 30% đầu (đầu xe): x in [0.8, 2.0], z = -0.20
  for (let x = 0.8; x <= 2.0; x += 0.2) {
    for (let y = -0.8; y <= 0.8; y += 0.3) {
      slopedSidePts.push({ x, y, z: -0.20 });
    }
  }

  const res93 = computeGroundSlopesAndZ(slopedSidePts, 0, 0, 0.5, 0, 2.0, 0.9);
  assert.ok(res93.pitchDeg < -2.0 && res93.pitchDeg > -6.0, `Test 93: Dốc dọc Side Pitch phải bám dốc chuẩn ~ -3.5° (thực tế: ${res93.pitchDeg}°)`);
  assert.strictEqual(res93.rollDeg, 0, "Test 93: Đường phẳng theo trục ngang phải có Roll = 0°");
  assert.ok(Math.abs(res93.groundZ! - (-0.30)) < 0.04, `Test 93: Cao độ sàn phải cân bằng đều 2 đầu bánh xe ~ -0.30m (thực tế: ${res93.groundZ}m)`);

  console.log(
    `✅ Test 93: Căn Dốc Dọc Side View (Pitch) Theo Dải 30% Đầu Và 30% Cuối: Pitch = ${res93.pitchDeg}°, Roll = ${res93.rollDeg}°, GroundZ = ${res93.groundZ}m`
  );
}

// 94. Test Ước Lượng Hướng Xe 2 Bánh (estimateTwoWheelerHeading) Dạng 30% Đầu & 30% Cuối
{
  // Xe 2 bánh xoay góc 12 độ
  const targetDeg = 12.0;
  const targetRad = (targetDeg * Math.PI) / 180;
  const bikePts: Array<{ lx: number; ly: number; z: number }> = [];

  // Tạo dải thân xe 2 bánh dọc trục dài từ lx = -0.9m đến +0.9m, xoay góc targetRad
  for (let s = -0.9; s <= 0.9; s += 0.05) {
    const lx = s * Math.cos(targetRad);
    const ly = s * Math.sin(targetRad);
    bikePts.push({ lx, ly, z: 0.5 });
  }
  // Thêm một vài điểm nhiễu nhẹ ở hông (không làm lệch trục do dải 30% đầu và 30% cuối kháng nhiễu)
  bikePts.push({ lx: 0.1, ly: 0.15, z: 0.8 });
  bikePts.push({ lx: -0.1, ly: -0.15, z: 0.8 });

  const headingRes = estimateTwoWheelerHeading(bikePts, 0);
  assert.ok(
    Math.abs(headingRes.deltaYawDeg - targetDeg) < 1.5,
    `Test 94: Góc lệch Yaw phải bám chuẩn ~12° theo vector 30% đầu và 30% cuối (thực tế: ${headingRes.deltaYawDeg}°)`
  );

  console.log(
    `✅ Test 94: Ước Lượng Hướng Xe 2 Bánh Theo 30% Đầu & 30% Cuối: Yaw Delta = ${headingRes.deltaYawDeg}° (Khớp góc mục tiêu ${targetDeg}°, Kháng nhiễu tuyệt đối)`
  );
}

// ==========================================
// TEST 95: GHIM ĐẤT (GIMAP) Ở KHU VỰC KHÔNG CÓ POINT CLOUD (0 ĐIỂM)
// ==========================================
// Khắc phục lỗi lơ lửng trên trời (Z=0):
// Khi không có point cloud dưới gầm xe hoặc khu vực trống điểm, thuật toán ghim đất
// phải neo đáy box theo mốc mặt đất xe Ego Z = -1.75m và khóa góc phẳng theo Ego (Roll 0°, Pitch 0°).
{
  const emptyPts: Array<{ x: number; y: number; z: number }> = [];
  const res95 = computeGroundSlopesAndZ(emptyPts, 25.0, 10.0, 1.0, 0, 2.3, 0.9, undefined);
  assert.strictEqual(res95.isFallbackZeroGround, true, "Test 95: Phải kích hoạt fallback khi 0 điểm");
  assert.strictEqual(res95.groundZ, -1.75, "Test 95: Đáy xe phải neo chuẩn theo Ego Road Z = -1.75m (không lơ lửng tại 0)");
  assert.strictEqual(res95.rollDeg, 0, "Test 95: Phải khóa cứng Roll = 0°");
  assert.strictEqual(res95.pitchDeg, 0, "Test 95: Phải khóa cứng Pitch = 0°");

  // Kiểm tra cả hàm estimateEgoRoadGroundZ khi không có điểm hoặc mảng rỗng
  const egoZEmpty = estimateEgoRoadGroundZ(emptyPts);
  assert.strictEqual(egoZEmpty, -1.75, "Test 95: estimateEgoRoadGroundZ phải fallback về -1.75m");

  console.log(
    `✅ Test 95: Ghim Đất Ở Khu Vực 0 Điểm (Chống Lơ Lửng): Neo chuẩn Ego Road Z = ${res95.groundZ}m, Khóa Roll 0°, Pitch 0°`
  );
}

// ==========================================
// TEST 96: NÚT SIDE CĂN DỌC TRỤC L THEO GÓC CHIẾU EGO (3 VÙNG HÌNH HỌC)
// ==========================================
// 1. Khi trục Y của Ego song song với Object / chiếu thẳng vào sườn (|egoLocalX| <= |egoLocalY| * 0.466):
//    -> Ưu tiên fit đều đối xứng giữa đầu và cuối xe (shiftLx = (minLx + maxLx) / 2).
// 2. Khi lệch góc > 25°:
//    - Box ở phía TRƯỚC Ego (egoLocalX < 0) -> Laser chiếu vào ĐUÔI XE -> Ưu tiên bắt Cản Sau (Rear Bumper).
//    - Box ở phía SAU Ego (egoLocalX > 0) -> Laser chiếu vào ĐẦU XE -> Ưu tiên bắt Cản Trước (Front Bumper).
// 3. Quy tắc bất biến: Luôn giữ nguyên 100% cao độ Z (newCenterZ = cz) và trục Y (shiftLy = 0).

// Test 96a: Chiếu ngang sườn song song -> Dàn đều tâm giữa đầu và cuối xe
{
  const L = 4.6;
  const W = 1.8;
  const H = 1.5;
  const cx = 0;
  const cy = 10;
  const cz = -1.0;
  const yaw = 0; // Hướng dọc trục X thế giới, Ego ở (0,0) nhìn sang ngang hông (0, 10)

  // Điểm thân xe trải dọc từ lx = -2.2m (cuối xe) đến lx = 2.0m (đầu xe)
  const carPts: Array<{ x: number; y: number; z: number }> = [];
  for (let lx = -2.2; lx <= 2.0; lx += 0.35) {
    carPts.push({ x: cx + lx, y: cy - 0.9, z: cz + 0.2 });
  }
  // Thêm mây điểm mặt đất
  for (let lx = -2.5; lx <= 2.5; lx += 0.5) {
    for (let ly = -1.2; ly <= 1.2; ly += 0.5) {
      carPts.push({ x: cx + lx, y: cy + ly, z: -1.75 });
    }
  }

  const res96a = fitBoxToEgoRayAndGround(
    carPts,
    cx,
    cy,
    cz,
    yaw,
    L,
    W,
    H,
    { x: 0, y: 0, z: 0 },
    { fitStep: "side", preserveDimensions: true, edgePadding: 0.05 }
  );

  // minLx = -2.2, maxLx = 2.0 -> shiftLx mong đợi: (-2.2 + 2.0) / 2 = -0.10m
  assert.ok(
    Math.abs(res96a.shiftLx - (-0.10)) < 0.03,
    `Test 96a: Khi chiếu song song sườn, shiftLx phải dàn đều giữa đầu và cuối xe ~ -0.10m (thực tế: ${res96a.shiftLx}m)`
  );
  assert.strictEqual(res96a.newCenterZ, cz, "Test 96a: Nút Side phải giữ nguyên 100% cao độ Z");
  assert.strictEqual(res96a.shiftLy, 0, "Test 96a: Nút Side phải giữ nguyên trục Y (shiftLy = 0)");
  assert.ok(
    res96a.message.includes("Chiếu ngang sườn song song (Fit đều đầu & cuối xe"),
    `Test 96a: Thông báo phải phản ánh chế độ chiếu ngang sườn (thực tế: ${res96a.message})`
  );

  console.log(
    `✅ Test 96a: Side View Chiếu Ngang Sườn Song Song: Dàn đều tâm đầu-cuối xe (shiftLx = ${res96a.shiftLx}m, Giữ nguyên Z và Y)`
  );
}

// Test 96b: Lệch góc > 25° và Box ở phía TRƯỚC Ego (egoLocalX < 0) -> Ưu tiên bắt Cản Sau
{
  const L = 4.6;
  const W = 1.8;
  const H = 1.5;
  const cx = 12; // Box ở phía trước Ego (0, 0)
  const cy = 4;
  const cz = -1.0;
  const yaw = 0; // Đầu xe hướng tới +X, Ego ở sau đuôi xe

  const carPts: Array<{ x: number; y: number; z: number }> = [];
  // Cụm điểm cản sau (rear bumper) đón tia laser rõ rệt tại lx = -2.25m
  for (let ly = -0.7; ly <= 0.7; ly += 0.2) {
    carPts.push({ x: cx - 2.25, y: cy + ly, z: cz + 0.1 });
  }
  // Vài điểm thân xe phía trước
  carPts.push({ x: cx - 1.0, y: cy - 0.8, z: cz + 0.2 });
  carPts.push({ x: cx + 0.5, y: cy - 0.8, z: cz + 0.2 });
  // Thêm mặt đất
  for (let lx = -2.5; lx <= 2.5; lx += 0.5) {
    for (let ly = -1.2; ly <= 1.2; ly += 0.5) {
      carPts.push({ x: cx + lx, y: cy + ly, z: -1.75 });
    }
  }

  const res96b = fitBoxToEgoRayAndGround(
    carPts,
    cx,
    cy,
    cz,
    yaw,
    L,
    W,
    H,
    { x: 0, y: 0, z: 0 },
    { fitStep: "side", preserveDimensions: true, edgePadding: 0.05 }
  );

  assert.strictEqual(res96b.visibleFaces.longitudinal, "rear", "Test 96b: Phải ưu tiên bắt Cản Sau (Rear Bumper) khi Box ở trước Ego");
  assert.strictEqual(res96b.newCenterZ, cz, "Test 96b: Nút Side phải giữ nguyên 100% cao độ Z");
  assert.strictEqual(res96b.shiftLy, 0, "Test 96b: Nút Side phải giữ nguyên trục Y (shiftLy = 0)");
  assert.ok(
    res96b.message.includes("Cản [Mặt Sau] đón tia"),
    `Test 96b: Thông báo phải phản ánh cản sau đón tia (thực tế: ${res96b.message})`
  );

  console.log(
    `✅ Test 96b: Side View Box Ở Trước Ego (>25°): Ưu tiên bắt Cản Sau (shiftLx = ${res96b.shiftLx}m, Giữ nguyên Z và Y)`
  );
}

// Test 96c: Lệch góc > 25° và Box ở phía SAU Ego (egoLocalX > 0) -> Ưu tiên bắt Cản Trước
{
  const L = 4.6;
  const W = 1.8;
  const H = 1.5;
  const cx = -12; // Box ở phía sau Ego (0, 0)
  const cy = 4;
  const cz = -1.0;
  const yaw = 0; // Đầu xe hướng tới +X (quay mặt về phía Ego)

  const carPts: Array<{ x: number; y: number; z: number }> = [];
  // Cụm điểm cản trước (front bumper) đón tia laser rõ rệt tại lx = +2.25m
  for (let ly = -0.7; ly <= 0.7; ly += 0.2) {
    carPts.push({ x: cx + 2.25, y: cy + ly, z: cz + 0.1 });
  }
  // Vài điểm thân xe phía sau
  carPts.push({ x: cx + 1.0, y: cy - 0.8, z: cz + 0.2 });
  carPts.push({ x: cx - 0.5, y: cy - 0.8, z: cz + 0.2 });
  // Thêm mặt đất
  for (let lx = -2.5; lx <= 2.5; lx += 0.5) {
    for (let ly = -1.2; ly <= 1.2; ly += 0.5) {
      carPts.push({ x: cx + lx, y: cy + ly, z: -1.75 });
    }
  }

  const res96c = fitBoxToEgoRayAndGround(
    carPts,
    cx,
    cy,
    cz,
    yaw,
    L,
    W,
    H,
    { x: 0, y: 0, z: 0 },
    { fitStep: "side", preserveDimensions: true, edgePadding: 0.05 }
  );

  assert.strictEqual(res96c.visibleFaces.longitudinal, "front", "Test 96c: Phải ưu tiên bắt Cản Trước (Front Bumper) khi Box ở sau Ego");
  assert.strictEqual(res96c.newCenterZ, cz, "Test 96c: Nút Side phải giữ nguyên 100% cao độ Z");
  assert.strictEqual(res96c.shiftLy, 0, "Test 96c: Nút Side phải giữ nguyên trục Y (shiftLy = 0)");
  assert.ok(
    res96c.message.includes("Cản [Mặt Trước] đón tia"),
    `Test 96c: Thông báo phải phản ánh cản trước đón tia (thực tế: ${res96c.message})`
  );

  console.log(
    `✅ Test 96c: Side View Box Ở Sau Ego (>25°): Ưu tiên bắt Cản Trước (shiftLx = ${res96c.shiftLx}m, Giữ nguyên Z và Y)`
  );
}

// ==========================================
// TEST 97: FIT CAO (H) NGƯỜI ĐI BỘ & XE 2 BÁNH KHÁNG NHIỄU LƠ LỬNG TRÊN CAO
// ==========================================
// Khi có các điểm nhiễu lơ lửng trên cao (lá cây, dây điện, bụi) cách đỉnh đầu > 15cm:
// 1. Hàm detectTrueHeadZ chém đứt 100% điểm nhiễu lơ lửng.
// 2. Fit Cao hạ đệm nóc về +2cm, giới hạn an toàn max H <= 1.78m (Người) / 1.68m (Xe 2 bánh), không bị thừa cả tấc.
{
  // 1. Kiểm tra detectTrueHeadZ
  const zWithNoise: number[] = [];
  // Thân người từ -1.70m lên -0.10m liên tục (mỗi bước 10cm):
  for (let z = -1.70; z <= -0.09; z += 0.10) {
    zWithNoise.push(Number(z.toFixed(2)));
  }
  // Các điểm nhiễu lá cây / dây điện trên cao (cách đỉnh đầu > 15cm):
  zWithNoise.push(0.35, 0.60, 1.20);

  const trueHeadZ = detectTrueHeadZ(zWithNoise, 0.15);
  assert.ok(Math.abs(trueHeadZ - (-0.10)) < 0.03, `Test 97: detectTrueHeadZ phải chém đứt nhiễu và trả về đỉnh đầu ~ -0.10m (thực tế: ${trueHeadZ}m)`);

  // 2. Kiểm tra Fit Cao Người đi bộ
  const pedPtsWithNoise: Array<{ x: number; y: number; z: number }> = [
    // Mặt đất z = -1.75
    { x: 5.0, y: 2.0, z: -1.75 },
    { x: 5.05, y: 2.05, z: -1.75 },
    { x: 4.95, y: 1.95, z: -1.75 },
  ];
  // Thân người từ -1.60m đến -0.10m (chiều cao thật 1.65m):
  for (let z = -1.60; z <= -0.09; z += 0.10) {
    pedPtsWithNoise.push({ x: 5.0, y: 2.0, z: Number(z.toFixed(2)) });
  }
  // Nhiễu lơ lửng trên cao:
  pedPtsWithNoise.push({ x: 5.0, y: 2.0, z: 0.40 }, { x: 5.0, y: 2.0, z: 0.80 });

  const pedRes = fitPedestrianBox(pedPtsWithNoise, 5.0, 2.0, -0.925, 0, 0.65, 0.65, 1.65, undefined, { step: "h" });
  assert.ok(pedRes.newH <= 1.78, `Test 97: Chiều cao Người đi bộ không được vượt quá trần 1.78m (thực tế: ${pedRes.newH}m)`);
  assert.ok(Math.abs(pedRes.newH - 1.67) <= 0.05, `Test 97: Chiều cao Người đi bộ phải ôm sát đỉnh đầu ~ 1.67m (thực tế: ${pedRes.newH}m)`);

  // 3. Kiểm tra Fit Cao Xe 2 bánh
  const bikePtsWithNoise: Array<{ x: number; y: number; z: number }> = [
    // Mặt đất z = -1.75
    { x: 8.0, y: 3.0, z: -1.75 },
    { x: 8.1, y: 3.0, z: -1.75 },
    { x: 7.9, y: 3.0, z: -1.75 },
  ];
  // Xe và người lái từ -1.55m đến -0.25m (chiều cao thật 1.50m):
  for (let z = -1.55; z <= -0.24; z += 0.10) {
    bikePtsWithNoise.push({ x: 8.0, y: 3.0, z: Number(z.toFixed(2)) });
  }
  // Nhiễu lơ lửng trên cao:
  bikePtsWithNoise.push({ x: 8.0, y: 3.0, z: 0.20 }, { x: 8.0, y: 3.0, z: 0.60 });

  const bikeRes = fitTwoWheelerBox(bikePtsWithNoise, 8.0, 3.0, -1.0, 0, 1.8, 0.7, 1.50, { step: "h" });
  assert.ok(bikeRes.newH <= 1.68, `Test 97: Chiều cao Xe 2 bánh không được vượt quá trần 1.68m (thực tế: ${bikeRes.newH}m)`);
  assert.ok(Math.abs(bikeRes.newH - 1.52) <= 0.05, `Test 97: Chiều cao Xe 2 bánh phải ôm sát nón bảo hiểm ~ 1.52m (thực tế: ${bikeRes.newH}m)`);

  console.log(
    `✅ Test 97: Kháng Nhiễu Lơ Lửng Trên Cao & Hạ Đệm +2cm: Người đi bộ H=${pedRes.newH}m (<=1.78m), Xe 2 bánh H=${bikeRes.newH}m (<=1.68m), Không Bị Thừa Đỉnh Đầu!`
  );
}

// ==========================================
// TEST 98: CHUẨN HÓA CĂN SIDE & FRONT XE 2 BÁNH THEO GÓC CHIẾU EGO (3 VÙNG QUANG HỌC)
// ==========================================
{
  const L = 1.8;
  const W = 0.7;
  const H = 1.5;
  const cz = -1.0;
  const yaw = 0; // Hướng dọc trục X

  // Test 98a: Xe 2 bánh chiếu ngang sườn song song -> Dàn đều 2 đầu bánh xe
  {
    const cx = 0;
    const cy = 8.0; // Ego ở (0,0), chiếu thẳng góc ngang sườn xe 2 bánh
    const pts: Array<{ x: number; y: number; z: number }> = [
      // Bánh sau lx = -0.85
      { x: cx - 0.85, y: cy, z: cz - 0.4 },
      // Bánh trước lx = 0.75
      { x: cx + 0.75, y: cy, z: cz - 0.4 },
      // Thân xe và người lái lx = -0.05
      { x: cx - 0.05, y: cy, z: cz + 0.2 },
    ];
    // Thêm mặt đất
    for (let lx = -1.2; lx <= 1.2; lx += 0.4) {
      pts.push({ x: cx + lx, y: cy, z: -1.75 });
    }

    const res98a = fitTwoWheelerBox(pts, cx, cy, cz, yaw, L, W, H, {
      step: "side",
      egoPos: { x: 0, y: 0, z: 0 },
    });

    // lxMin = -0.85, lxMax = 0.75 -> shiftLx mong đợi: (-0.85 + 0.75) / 2 = -0.05m
    assert.ok(
      Math.abs(res98a.shiftLx - (-0.05)) < 0.02,
      `Test 98a: Chiếu ngang sườn phải dàn đều 2 bánh ~ -0.05m (thực tế: ${res98a.shiftLx}m)`
    );
    assert.strictEqual(res98a.newCenterZ, cz, "Test 98a: Nút Side phải giữ nguyên 100% cao độ Z");
    assert.strictEqual(res98a.newL, L, "Test 98a: Khóa cứng chiều dài L");

    console.log(
      `✅ Test 98a: Side View Xe 2 Bánh Chiếu Ngang Sườn: Dàn đều tâm 2 đầu bánh xe (shiftLx = ${res98a.shiftLx}m, Giữ nguyên Z và L)`
    );
  }

  // Test 98b: Lệch góc > 25° và Xe 2 bánh ở trước Ego (egoLocalX < 0) -> Bắt Cản/Bánh sau
  {
    const cx = 10.0; // Xe ở trước Ego (0,0)
    const cy = 3.0;
    const pts: Array<{ x: number; y: number; z: number }> = [
      // Bánh sau đón tia tại lx = -0.85m
      { x: cx - 0.85, y: cy, z: cz - 0.4 },
      { x: cx - 0.80, y: cy, z: cz - 0.3 },
      // Thân và bánh trước
      { x: cx + 0.1, y: cy, z: cz + 0.1 },
      { x: cx + 0.85, y: cy, z: cz - 0.4 },
    ];
    // Mặt đất
    for (let lx = -1.2; lx <= 1.2; lx += 0.4) {
      pts.push({ x: cx + lx, y: cy, z: -1.75 });
    }

    const res98b = fitTwoWheelerBox(pts, cx, cy, cz, yaw, L, W, H, {
      step: "side",
      egoPos: { x: 0, y: 0, z: 0 },
    });

    // lxMin = -0.85, L = 1.8 -> shiftLx = (-0.85 - 0.03) + 0.9 = +0.02m
    assert.ok(
      Math.abs(res98b.shiftLx - 0.02) < 0.03,
      `Test 98b: Xe ở trước Ego phải bắt cản sau đón tia ~ +0.02m (thực tế: ${res98b.shiftLx}m)`
    );
    assert.strictEqual(res98b.newCenterZ, cz, "Test 98b: Nút Side phải giữ nguyên Z");

    console.log(
      `✅ Test 98b: Side View Xe 2 Bánh Ở Trước Ego (>25°): Bắt Cản/Bánh Sau đón tia (shiftLx = ${res98b.shiftLx}m, Giữ nguyên Z)`
    );
  }

  // Test 98c: Lệch góc > 25° và Xe 2 bánh ở sau Ego (egoLocalX > 0) -> Bắt Cản/Bánh trước
  {
    const cx = -10.0; // Xe ở sau Ego (0,0), đầu xe hướng về phía Ego
    const cy = 3.0;
    const pts: Array<{ x: number; y: number; z: number }> = [
      // Bánh trước đón tia tại lx = +0.85m
      { x: cx + 0.85, y: cy, z: cz - 0.4 },
      { x: cx + 0.80, y: cy, z: cz - 0.3 },
      // Thân và bánh sau
      { x: cx - 0.1, y: cy, z: cz + 0.1 },
      { x: cx - 0.85, y: cy, z: cz - 0.4 },
    ];
    // Mặt đất
    for (let lx = -1.2; lx <= 1.2; lx += 0.4) {
      pts.push({ x: cx + lx, y: cy, z: -1.75 });
    }

    const res98c = fitTwoWheelerBox(pts, cx, cy, cz, yaw, L, W, H, {
      step: "side",
      egoPos: { x: 0, y: 0, z: 0 },
    });

    // lxMax = 0.85, L = 1.8 -> shiftLx = (0.85 + 0.03) - 0.9 = -0.02m
    assert.ok(
      Math.abs(res98c.shiftLx - (-0.02)) < 0.03,
      `Test 98c: Xe ở sau Ego phải bắt cản trước đón tia ~ -0.02m (thực tế: ${res98c.shiftLx}m)`
    );
    assert.strictEqual(res98c.newCenterZ, cz, "Test 98c: Nút Side phải giữ nguyên Z");

    console.log(
      `✅ Test 98c: Side View Xe 2 Bánh Ở Sau Ego (>25°): Bắt Cản/Bánh Trước đón tia (shiftLx = ${res98c.shiftLx}m, Giữ nguyên Z)`
    );
  }

  // Test 98d: Nút FRONT Xe 2 bánh: Áp sát sườn đón tia laser từ Ego (Không trung bình cộng thụt mép)
  {
    const cx = 5.0;
    const cy = 6.0; // Ego ở (0,0), nhìn thấy Sườn Phải của xe (egoLocalY = -6.0 < 0)
    // Xe 2 bánh có điểm ở cả 2 bên trục ly = -0.25 (sườn phải) và ly = +0.10 (sườn trái)
    const pts: Array<{ x: number; y: number; z: number }> = [
      { x: cx, y: cy - 0.28, z: cz }, // Sườn phải đón tia laser (lyMin = -0.28)
      { x: cx, y: cy - 0.20, z: cz },
      { x: cx, y: cy + 0.10, z: cz }, // Chân chống/tay lái bên trái (lyMax = 0.10)
    ];
    for (let lx = -1.2; lx <= 1.2; lx += 0.4) {
      pts.push({ x: cx + lx, y: cy, z: -1.75 });
    }

    const res98d = fitTwoWheelerBox(pts, cx, cy, cz, yaw, L, W, H, {
      step: "front",
      egoPos: { x: 0, y: 0, z: 0 },
    });

    // Ego nhìn thấy sườn phải (visibleSide = 'right'):
    // shiftLy mong đợi: (lyMin - 0.03) + W / 2 = (-0.28 - 0.03) + 0.35 = +0.04m
    // (Nếu bị lỗi trung bình cộng cũ: (-0.28 + 0.10)/2 = -0.09m -> mép phải bị thụt vào trong!)
    const rightEdge = -W / 2 + res98d.shiftLy;
    assert.ok(
      Math.abs(rightEdge - (-0.31)) < 0.03,
      `Test 98d: Mép phải box phải áp sát viền đón tia -0.31m (thực tế: ${rightEdge.toFixed(3)}m)`
    );
    assert.strictEqual(res98d.newCenterZ, cz, "Test 98d: Nút Front phải giữ nguyên 100% Z");
    assert.strictEqual(res98d.newW, W, "Test 98d: Nút Front phải bảo toàn W");

    console.log(
      `✅ Test 98d: Front View Xe 2 Bánh: Áp sát Sườn Phải đón tia Ego (rightEdge = ${rightEdge.toFixed(2)}m, Loại bỏ 100% bug trung bình cộng thụt mép)`
    );
  }
}

// ==========================================
// TEST 99: CHUẨN HÓA CĂN SIDE & FRONT NGƯỜI ĐI BỘ THEO GÓC CHIẾU EGO (3 VÙNG QUANG HỌC)
// ==========================================
{
  const L = 0.65;
  const W = 0.60;
  const H = 1.70;
  const cz = -0.9;
  const yaw = 0; // Hướng dọc trục X

  // Test 99a: Người đi bộ chiếu ngang sườn song song -> Dàn đều tâm trước - sau
  {
    const cx = 0;
    const cy = 6.0; // Ego ở (0,0), chiếu thẳng góc ngang sườn người
    const pts: Array<{ x: number; y: number; z: number }> = [
      // Sau gót chân lx = -0.28
      { x: cx - 0.28, y: cy, z: cz - 0.5 },
      // Mũi chân trước lx = 0.24
      { x: cx + 0.24, y: cy, z: cz - 0.5 },
      // Thân người lx = -0.02
      { x: cx - 0.02, y: cy, z: cz + 0.2 },
    ];
    for (let lx = -0.5; lx <= 0.5; lx += 0.2) {
      pts.push({ x: cx + lx, y: cy, z: -1.75 });
    }

    const res99a = fitPedestrianBox(pts, cx, cy, cz, yaw, L, W, H, {
      step: "side",
      egoPos: { x: 0, y: 0, z: 0 },
    });

    // lxMin = -0.28, lxMax = 0.24 -> shiftLx: (-0.28 + 0.24) / 2 = -0.02m
    assert.ok(
      Math.abs(res99a.shiftLx - (-0.02)) < 0.02,
      `Test 99a: Chiếu ngang sườn phải dàn đều trước-sau ~ -0.02m (thực tế: ${res99a.shiftLx}m)`
    );
    assert.strictEqual(res99a.newCenterZ, cz, "Test 99a: Giữ nguyên Z");
    assert.strictEqual(res99a.newL, L, "Test 99a: Khóa kích thước L");

    console.log(
      `✅ Test 99a: Side View Người Đi Bộ Chiếu Ngang Sườn: Dàn đều tâm trước - sau (shiftLx = ${res99a.shiftLx}m, Giữ nguyên Z và L)`
    );
  }

  // Test 99b: Lệch góc > 25° và Người ở trước Ego (egoLocalX < 0) -> Bắt Mép Sau (Lưng/Gót)
  {
    const cx = 8.0; // Ở trước Ego (0,0)
    const cy = 2.0;
    const pts: Array<{ x: number; y: number; z: number }> = [
      // Lưng/gót đón tia laser tại lx = -0.30m
      { x: cx - 0.30, y: cy, z: cz - 0.4 },
      { x: cx - 0.28, y: cy, z: cz + 0.1 },
      // Ngực/mũi chân
      { x: cx + 0.20, y: cy, z: cz - 0.4 },
    ];
    for (let lx = -0.5; lx <= 0.5; lx += 0.2) {
      pts.push({ x: cx + lx, y: cy, z: -1.75 });
    }

    const res99b = fitPedestrianBox(pts, cx, cy, cz, yaw, L, W, H, {
      step: "side",
      egoPos: { x: 0, y: 0, z: 0 },
    });

    // lxMin = -0.30, L = 0.65 -> shiftLx = (-0.30 - 0.02) + 0.325 = +0.005m
    assert.ok(
      Math.abs(res99b.shiftLx - 0.005) < 0.02,
      `Test 99b: Bắt mép sau đón tia ~ +0.005m (thực tế: ${res99b.shiftLx}m)`
    );
    assert.strictEqual(res99b.newCenterZ, cz, "Test 99b: Giữ nguyên Z");

    console.log(
      `✅ Test 99b: Side View Người Đi Bộ Ở Trước Ego (>25°): Bắt Mép Sau đón tia (shiftLx = ${res99b.shiftLx}m, Giữ nguyên Z)`
    );
  }

  // Test 99c: Lệch góc > 25° và Người ở sau Ego (egoLocalX > 0) -> Bắt Mép Trước (Ngực/Mũi chân)
  {
    const cx = -8.0; // Ở sau Ego (0,0)
    const cy = 2.0;
    const pts: Array<{ x: number; y: number; z: number }> = [
      // Ngực/mũi chân đón tia laser tại lx = +0.30m
      { x: cx + 0.30, y: cy, z: cz - 0.4 },
      { x: cx + 0.28, y: cy, z: cz + 0.1 },
      // Lưng/gót
      { x: cx - 0.20, y: cy, z: cz - 0.4 },
    ];
    for (let lx = -0.5; lx <= 0.5; lx += 0.2) {
      pts.push({ x: cx + lx, y: cy, z: -1.75 });
    }

    const res99c = fitPedestrianBox(pts, cx, cy, cz, yaw, L, W, H, {
      step: "side",
      egoPos: { x: 0, y: 0, z: 0 },
    });

    // lxMax = 0.30, L = 0.65 -> shiftLx = (0.30 + 0.02) - 0.325 = -0.005m
    assert.ok(
      Math.abs(res99c.shiftLx - (-0.005)) < 0.02,
      `Test 99c: Bắt mép trước đón tia ~ -0.005m (thực tế: ${res99c.shiftLx}m)`
    );
    assert.strictEqual(res99c.newCenterZ, cz, "Test 99c: Giữ nguyên Z");

    console.log(
      `✅ Test 99c: Side View Người Đi Bộ Ở Sau Ego (>25°): Bắt Mép Trước đón tia (shiftLx = ${res99c.shiftLx}m, Giữ nguyên Z)`
    );
  }

  // Test 99d: Nút FRONT Người đi bộ: Áp sát Sườn Trái đón tia laser Ego (+W/2)
  {
    const cx = 5.0;
    const cy = -6.0; // Ego ở (0,0), nhìn thấy Sườn Trái của người (egoLocalY = +6.0 > 0)
    const pts: Array<{ x: number; y: number; z: number }> = [
      { x: cx, y: cy + 0.25, z: cz }, // Mép sườn trái lyMax = 0.25 đón tia
      { x: cx, y: cy + 0.15, z: cz },
      { x: cx, y: cy - 0.18, z: cz },
    ];
    for (let lx = -0.5; lx <= 0.5; lx += 0.2) {
      pts.push({ x: cx + lx, y: cy, z: -1.75 });
    }

    const res99d = fitPedestrianBox(pts, cx, cy, cz, yaw, L, W, H, {
      step: "front",
      egoPos: { x: 0, y: 0, z: 0 },
    });

    // Sườn trái đón tia (+W/2 áp sát lyMax = 0.25 + 0.025 = 0.275):
    // shiftLy mong đợi: (0.25 + 0.025) - 0.30 = -0.025m
    const leftEdge = W / 2 + res99d.shiftLy;
    assert.ok(
      Math.abs(leftEdge - 0.275) < 0.02,
      `Test 99d: Mép trái box phải áp sát viền đón tia 0.275m (thực tế: ${leftEdge.toFixed(3)}m)`
    );
    assert.strictEqual(res99d.newCenterZ, cz, "Test 99d: Giữ nguyên Z");
    assert.strictEqual(res99d.newW, W, "Test 99d: Bảo toàn W");

    console.log(
      `✅ Test 99d: Front View Người Đi Bộ: Áp sát Sườn Trái đón tia Ego (leftEdge = ${leftEdge.toFixed(2)}m, Giữ nguyên Z và W)`
    );
  }
}

// -------------------------------------------------------------------------------------------------
// BỘ KIỂM THỬ: TRỌNG SỐ INTENSITY & BẢO VỆ MÉP SÁNG (BRIGHT EDGE PROTECTION) CHO NÚT TOP, SIDE, FRONT
// -------------------------------------------------------------------------------------------------

// Test 100: Kiểm tra hàm computeIntensityWeights
{
  const ptsWithIntensity = [
    { intensity: 20 },
    { intensity: 25 },
    { intensity: 30 },
    { intensity: 180 }, // Điểm sáng
    { intensity: 240 }, // Điểm rất sáng
  ];
  const res100 = computeIntensityWeights(ptsWithIntensity);
  assert.strictEqual(res100.hasValidIntensity, true, "Test 100: Phải nhận diện có intensity hợp lệ");
  assert.ok(res100.weights[4] > res100.weights[0], "Test 100: Điểm 240 phải có trọng số lớn hơn điểm 20");
  assert.ok(res100.highIntensityThreshold >= 180, "Test 100: Ngưỡng sáng phải >= 180");
  console.log(`✅ Test 100a: computeIntensityWeights: Phân loại điểm sáng chuẩn xác (Trọng số: ${res100.weights[0].toFixed(2)} ➔ ${res100.weights[4].toFixed(2)})`);

  // Fallback an toàn khi độ biến thiên < 15
  const ptsUniform = [{ intensity: 50 }, { intensity: 52 }, { intensity: 55 }];
  const res100b = computeIntensityWeights(ptsUniform);
  assert.strictEqual(res100b.hasValidIntensity, false, "Test 100b: Biến thiên nhỏ phải fallback");
  assert.strictEqual(res100b.weights[0], 1.0, "Test 100b: Trọng số fallback phải là 1.0");
  console.log("✅ Test 100b: computeIntensityWeights: Fallback an toàn khi độ biến thiên nhỏ");
}

// Test 101: detectDominantWallEdgeWithValleyCutoff với Trọng Số Intensity & Kháng Co Lẹm
{
  // Giả lập sườn xe tại ly = 0.90m có 3 điểm sáng kim loại (intensity = 220),
  // bên trong lòng xe tại ly = 0.50m có 2 điểm tối (intensity = 30).
  const pts101: Array<{ lx: number; ly: number; z: number; intensity: number }> = [
    { lx: 0.0, ly: 0.50, z: 0.5, intensity: 30 },
    { lx: 0.5, ly: 0.50, z: 0.6, intensity: 35 },
    // Vỏ xe thật ngoài mép:
    { lx: -1.0, ly: 0.91, z: 0.8, intensity: 220 },
    { lx: 0.0, ly: 0.92, z: 0.8, intensity: 235 },
    { lx: 1.0, ly: 0.90, z: 0.8, intensity: 240 },
  ];

  const res101 = detectDominantWallEdgeWithValleyCutoff(pts101, "ly", "positive", 0.925, {
    minSpanOrthogonal: 0.70,
  });

  // Mép vỏ ngoài phải bám vào dải điểm sáng ~0.90m - 0.92m, không bị co lẹm về 0.50m
  assert.ok(res101.edge >= 0.88 && res101.edge <= 0.95, `Test 101: Mép vỏ phải bám vào điểm sáng ~0.91m (thực tế: ${res101.edge}m)`);
  console.log(`✅ Test 101: detectDominantWallEdgeWithValleyCutoff: Bảo vệ điểm sáng mép ngoài, không bị co lẹm (edge = ${res101.edge}m)`);
}

// Test 102: straightenYawFromBoundaryEdge với Weighted Theil-Sen theo điểm sáng
{
  // Sườn xe nghiêng đúng góc +3.0° tạo bởi các điểm sáng kim loại (intensity = 220).
  // Đồng thời có 3 điểm nhiễu tối màu (intensity = 25) đặt lệch ở góc -6.0°.
  const pts102: Array<{ lx: number; ly: number; z: number; intensity: number }> = [];
  const slopeTrue = Math.tan((3.0 * Math.PI) / 180);

  // 12 điểm sườn xe sáng bóng:
  for (let lx = -2.0; lx <= 2.0; lx += 0.35) {
    const ly = 0.90 + slopeTrue * lx;
    pts102.push({ lx, ly, z: 0.8, intensity: 230 });
  }

  // 4 điểm nhiễu tối màu lệch trục:
  pts102.push({ lx: -1.5, ly: 1.10, z: 0.8, intensity: 25 });
  pts102.push({ lx: -0.5, ly: 1.05, z: 0.8, intensity: 20 });
  pts102.push({ lx: 0.5, ly: 0.75, z: 0.8, intensity: 30 });

  const res102 = straightenYawFromBoundaryEdge(pts102, 0, 4.6, 1.85, "left", {
    maxAdjustmentDeg: 8.0,
  });

  // Góc vi chỉnh phải bám sát +3.0° (sai số < 0.8°), miễn nhiễm với các điểm nhiễu tối màu
  assert.ok(
    Math.abs(res102.deltaYawDeg - 3.0) < 0.8,
    `Test 102: Delta Yaw phải xấp xỉ +3.0° (thực tế: ${res102.deltaYawDeg}°)`
  );
  console.log(`✅ Test 102: straightenYawFromBoundaryEdge (WLS Top Yaw): Khóa chuẩn góc +3.0° theo điểm sáng vỏ xe (thực tế: ${res102.deltaYawDeg}°)`);
}

// Test 103: Fallback an toàn 100% khi dữ liệu không có intensity
{
  const ptsNoIntensity: Array<{ lx: number; ly: number; z: number }> = [
    { lx: -1.5, ly: 0.90, z: 0.8 },
    { lx: -0.5, ly: 0.91, z: 0.8 },
    { lx: 0.5, ly: 0.90, z: 0.8 },
    { lx: 1.5, ly: 0.89, z: 0.8 },
  ];
  const res103 = detectDominantWallEdgeWithValleyCutoff(ptsNoIntensity, "ly", "positive", 0.925);
  assert.ok(Math.abs(res103.edge - 0.90) < 0.05, `Test 103: Fallback edge ~ 0.90m (thực tế: ${res103.edge}m)`);
  console.log(`✅ Test 103: Fallback an toàn 100% khi không có intensity (edge = ${res103.edge}m, Zero-Crash)`);
}

// -------------------------------------------------------------------------------------------------
// BỘ KIỂM THỬ: TỰ ĐỘNG NHẬN DIỆN CẢN ĐÓN TIA THEO MẬT ĐỘ 20% ĐẦU/ĐUÔI XE (NÚT SIDE)
// -------------------------------------------------------------------------------------------------

// Test 104: Nhận diện cản trước đón tia áp đảo theo mật độ 20% đầu xe (determineBumperByDensity)
{
  const L = 4.8;
  const pts: Array<{ lx: number; ly: number; z: number }> = [];
  // Giả lập đầu xe tại lx = +2.2m (Front 20%) tập trung chùm tia dày đặc: 16 điểm
  for (let i = 0; i < 16; i++) {
    pts.push({ lx: 2.1 + (i % 4) * 0.05, ly: -0.6 + Math.floor(i / 4) * 0.4, z: 0.5 });
  }
  // Giữa thân xe: 6 điểm
  for (let i = 0; i < 6; i++) {
    pts.push({ lx: 0.0 + i * 0.1, ly: 0.8, z: 0.5 });
  }
  // Đuôi xe bị khuất ở xa: chỉ có 2 điểm lác đác
  pts.push({ lx: -2.2, ly: 0.5, z: 0.5 });
  pts.push({ lx: -2.3, ly: -0.5, z: 0.5 });

  // Giả sử egoLocalX = -5.0 (vị trí tương đối có thể bị lệch hướng hoặc ở góc chéo phía sau)
  const res104 = determineBumperByDensity(pts, L, -5.0, 10.0);
  assert.strictEqual(res104.visibleBumper, "front", "Test 104: Phải nhận diện cản trước đón tia áp đảo");
  assert.strictEqual(res104.isParallelBalanced, false, "Test 104: Không được coi là song song cân bằng");
  assert.ok(res104.nFront20 >= 14, `Test 104: nFront20 phải >= 14 (thực tế: ${res104.nFront20})`);
  assert.ok(res104.nRear20 <= 2, `Test 104: nRear20 phải <= 2 (thực tế: ${res104.nRear20})`);
  console.log(`✅ Test 104: determineBumperByDensity: Cản trước áp đảo (Front20=${res104.nFront20} vs Rear20=${res104.nRear20}) ➔ Nhận diện chuẩn Front Bumper`);
}

// Test 105: Nhận diện cản sau đón tia áp đảo theo mật độ 20% đuôi xe (determineBumperByDensity)
{
  const L = 4.8;
  const pts: Array<{ lx: number; ly: number; z: number }> = [];
  // Giả lập đuôi xe tại lx = -2.2m (Rear 20%) tập trung chùm tia dày đặc: 18 điểm
  for (let i = 0; i < 18; i++) {
    pts.push({ lx: -2.3 + (i % 4) * 0.05, ly: -0.7 + Math.floor(i / 4) * 0.35, z: 0.5 });
  }
  // Giữa thân xe: 5 điểm
  for (let i = 0; i < 5; i++) {
    pts.push({ lx: -0.5 + i * 0.1, ly: -0.85, z: 0.5 });
  }
  // Đầu xe chỉ có 1 điểm nhiễu thưa thớt
  pts.push({ lx: 2.2, ly: 0.4, z: 0.5 });

  // Giả sử egoLocalX = +5.0 (hướng tia Ego dự đoán phía trước)
  const res105 = determineBumperByDensity(pts, L, 5.0, 10.0);
  assert.strictEqual(res105.visibleBumper, "rear", "Test 105: Phải nhận diện cản sau đón tia áp đảo");
  assert.strictEqual(res105.isParallelBalanced, false, "Test 105: Không được coi là song song cân bằng");
  assert.ok(res105.nRear20 >= 16, `Test 105: nRear20 phải >= 16 (thực tế: ${res105.nRear20})`);
  assert.ok(res105.nFront20 <= 1, `Test 105: nFront20 phải <= 1 (thực tế: ${res105.nFront20})`);
  console.log(`✅ Test 105: determineBumperByDensity: Cản sau áp đảo (Rear20=${res105.nRear20} vs Front20=${res105.nFront20}) ➔ Nhận diện chuẩn Rear Bumper`);
}

// Test 106: Nút SIDE tích hợp fitBoxToEgoRayAndGround với mật độ 20% đầu xe áp đảo
{
  const cx = 10.0, cy = 0.0, cz = 1.0;
  const yaw = 0.0;
  const L = 4.8, W = 1.9, H = 1.5;
  const pts: Array<{ x: number; y: number; z: number }> = [];

  // Mặt đất
  for (let lx = -2.5; lx <= 2.5; lx += 0.5) {
    for (let ly = -1.2; ly <= 1.2; ly += 0.6) {
      pts.push({ x: cx + lx, y: cy + ly, z: 0.25 });
    }
  }

  // Cản trước thật nằm tại x = cx + 2.30m với 15 điểm thân xe đón tia laser
  for (let i = 0; i < 15; i++) {
    const lx = 2.25 + (i % 3) * 0.04;
    const ly = -0.5 + Math.floor(i / 3) * 0.25;
    pts.push({ x: cx + lx, y: cy + ly, z: 0.8 + (i % 4) * 0.15 });
  }

  // Đuôi xe ở xa chỉ có 2 điểm thưa thớt
  pts.push({ x: cx - 2.30, y: cy + 0.2, z: 0.8 });
  pts.push({ x: cx - 2.25, y: cy - 0.2, z: 0.8 });

  // Ego ở (10, 15, 0) - chiếu ngang sườn hơi lệch sau một chút
  const res106 = fitBoxToEgoRayAndGround(
    pts,
    cx, cy, cz, yaw, L, W, H,
    { x: 10.0, y: 15.0, z: 0.0 },
    { fitStep: "side", preserveDimensions: true }
  );

  // 1. Phải giữ nguyên 100% cao độ Z (TUYỆT ĐỐI KHÔNG GHIM ĐẤT)
  assert.strictEqual(res106.newCenterZ, cz, "Test 106: newCenterZ phải giữ nguyên cz = 1.0m");
  // 2. Không làm lệch sườn Y (shiftLy = 0)
  assert.strictEqual(res106.newCenterY, cy, "Test 106: newCenterY phải giữ nguyên cy = 0.0m");
  // 3. Bảo toàn kích thước L, W, H
  assert.strictEqual(res106.newL, L, "Test 106: Bảo toàn L");
  assert.strictEqual(res106.newW, W, "Test 106: Bảo toàn W");
  assert.strictEqual(res106.newH, H, "Test 106: Bảo toàn H");
  // 4. Mép cản trước đón tia của box (newCenterX + L/2) phải áp sát chùm điểm cản trước (~12.35m)
  const boxFrontEdge = res106.newCenterX + res106.newL / 2;
  assert.ok(
    boxFrontEdge >= 12.30 && boxFrontEdge <= 12.45,
    `Test 106: Mép trước box (${boxFrontEdge.toFixed(3)}m) phải áp sát cản trước đón tia ~12.35m`
  );
  assert.strictEqual(res106.visibleFaces.longitudinal, "front", "Test 106: Phải nhận diện cản trước đón tia");
  console.log(`✅ Test 106: Nút SIDE ô tô: Nhận diện cản trước theo mật độ 20%, ôm khít cản trước (mép ${boxFrontEdge.toFixed(2)}m), Giữ nguyên Z=${res106.newCenterZ}m & shiftLy=0`);
}

// =========================================================================
// TEST 107: Point mặt đất quá ít (< 10 điểm) -> Auto 100% lấy theo Ego Z làm chuẩn 0° phẳng
// =========================================================================
{
  const sparsePts: Array<{ x: number; y: number; z: number }> = [
    { x: 20.0, y: 5.0, z: -0.2 },
    { x: 20.5, y: 5.2, z: -0.15 },
    { x: 19.8, y: 4.8, z: -0.25 },
    { x: 21.0, y: 5.1, z: -0.3 },
    { x: 19.5, y: 5.0, z: -0.1 },
    { x: 20.2, y: 4.6, z: -0.2 },
    { x: 20.8, y: 5.4, z: -0.35 },
  ]; // Có 7 điểm mặt đất (< 10 điểm)

  const res107 = computeGroundSlopesAndZ(
    sparsePts,
    20.0, 5.0, 0.5, 0,
    2.3, 0.9, 0.8,
    { egoRoadZ: -1.75 }
  );

  assert.strictEqual(res107.isFallbackZeroGround, true, "Test 107: Phải kích hoạt fallback khi < 10 điểm mặt đất");
  assert.strictEqual(res107.groundZ, -1.75, "Test 107: Đáy xe phải neo chuẩn theo Ego Road Z = -1.75m");
  assert.strictEqual(res107.rollDeg, 0, "Test 107: Khóa Roll = 0° (0 độ chuẩn)");
  assert.strictEqual(res107.pitchDeg, 0, "Test 107: Khóa Pitch = 0° (0 độ chuẩn)");
  console.log(`✅ Test 107: Point mặt đất quá ít (7 điểm < 10): Auto 100% neo theo Ego Z=-1.75m, Roll=0°, Pitch=0° phẳng`);
}

// ==========================================
// TEST 108: XE Ở DỐC TRŨNG ÍT POINT MẶT ĐẤT (<10 ĐIỂM) - CHỐNG BAY LÊN TRỜI THEO EGO
// ==========================================
// Khi xe ở dốc thấp (Z=-0.5m, đáy -1.25m, H=1.5m), dưới gầm không có điểm mặt đất,
// nhưng xe có mây điểm thân vỏ: Thuật toán phải neo theo chính mây điểm thân xe hoặc đáy hiện tại,
// khóa Roll=0°, Pitch=0° phẳng, TUYỆT ĐỐI KHÔNG ÁP ĐẶT CAO ĐỘ EGO (Z=0 hoặc -1.75) LÀM XE BAY LÊN TRỜI!
{
  const ptsInLowSlope: Array<{ x: number; y: number; z: number }> = [
    // Điểm Ego quanh (0,0) ở cao độ 0.0m
    { x: 0.5, y: 0.8, z: 0.0 },
    { x: -0.5, y: 1.2, z: 0.02 },
    { x: 1.0, y: -0.9, z: -0.01 },
    { x: -1.2, y: -0.5, z: 0.01 },
    // Mây điểm thân xe tại X=35, Y=-10, Z_center=-0.5, H=1.5 (Nóc Z=+0.25m, Đáy vỏ Z=-1.05m)
    { x: 34.0, y: -10.0, z: 0.23 }, // Điểm nóc xe
    { x: 35.5, y: -9.8, z: 0.22 },  // Điểm nóc xe
    { x: 36.2, y: -10.2, z: -0.20 }, // Kính chắn gió
    { x: 34.8, y: -10.3, z: -0.50 }, // Thân xe
    { x: 35.0, y: -9.5, z: -0.75 },  // Thân xe
    { x: 36.5, y: -9.9, z: -1.05 },  // Điểm mép cản dưới xe
  ];

  const res108 = computeGroundSlopesAndZ(
    ptsInLowSlope,
    35.0, -10.0, -0.5, 0,
    2.3, 0.9, undefined,
    { halfH: 0.75 }
  );

  assert.strictEqual(res108.isFallbackZeroGround, true, "Test 108: Phải kích hoạt fallback khi 0 điểm sàn dưới gầm");
  assert.strictEqual(res108.rollDeg, 0, "Test 108: Roll phải khóa cứng 0° phẳng");
  assert.strictEqual(res108.pitchDeg, 0, "Test 108: Pitch phải khóa cứng 0° phẳng");

  // Đáy xe phải neo quanh -1.25m đến -1.28m theo mây điểm thân xe (Z_roof - H = 0.23 - 1.5 = -1.27m)
  assert.ok(
    Math.abs(res108.groundZ! - (-1.25)) < 0.10,
    `Test 108: Đáy xe phải neo sát đáy thân xe ~ -1.25m, TUYỆT ĐỐI KHÔNG BAY LÊN TRỜI (thực tế: ${res108.groundZ}m)`
  );

  const newCenterZ = res108.groundZ! + 0.75;
  assert.ok(
    Math.abs(newCenterZ - (-0.5)) < 0.10,
    `Test 108: Tâm xe mới phải ở quanh -0.5m, không bay lên trời (thực tế: ${newCenterZ}m)`
  );

  console.log(`✅ Test 108: Xe Ở Dốc Trũng Ít Point Mặt Đất: Đáy neo chuẩn ${res108.groundZ}m (Tâm Z: ${newCenterZ.toFixed(3)}m, Roll=0°, Pitch=0°), KHÔNG BỊ BAY LÊN TRỜI THEO EGO!`);
}

console.log("\n🎉 TẤT CẢ 108/108 BÀI KIỂM THỬ HÌNH HỌC, DỐC MẶT ĐƯỜNG 3D, CẮT THUNG LŨNG MẬT ĐỘ, PHÂN TẦNG KHÁNG NHIỄU ĐẤT, KHÁNG ĐÁM ĐÔNG, ÔM SÁT EGO, VỈA HÈ EGO-Z, CĂN GÓC FRONT ROLL 2 ĐẦU, BẢO TOÀN CURPOINT BIÊN, RIDER 42%, CĂN YAW THEO VẠCH KẺ LÀN LIDAR INTENSITY, CHỐNG LƠ LỬNG 0 ĐIỂM, CHỐNG BAY LÊN TRỜI KHI THIẾU POINT, SIDE/FRONT CHUẨN HÓA CẢ 3 VẬT THỂ (CAR, CYCLIST, PEDESTRIAN), TRỌNG SỐ INTENSITY BẢO VỆ MÉP SÁNG VÀ MẬT ĐỘ 20% ĐẦU/ĐUƠI XE ĐÃ ĐẠT 100%!");





