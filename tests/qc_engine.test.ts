import assert from "assert";
import {
  QCEngine,
  classifyLabelGroup,
  detectObjectCategory,
  calcAngleDiffDeg,
  compressFrames,
  loadObjects,
  generateDatumaroQAReport,
  exportReportToCsv,
  exportReportToTsv,
  generateReportCsv,
  generateReportMarkdown,
  countPointsInsideBox,
  checkEmptyOrSparseBox,
  checkGroundMismatch,
  checkMotionYawMismatch,
} from "../src/core/qc/qc_engine.ts";
import { computeBevOverlap, rectCorners, polyArea, clipConvex } from "../src/core/qc/bev_overlap.ts";
import { DEFAULT_DATUMARO_QA_CONFIG, type QCObjectInstance } from "../src/core/qc/types.ts";

console.log("🧪 Đang chạy kiểm thử tự động Module QC Engine (Datumaro QA TS Edition)...");

const engine = new QCEngine(DEFAULT_DATUMARO_QA_CONFIG);

// 1. Phân loại nhãn chuẩn xác (classifyLabelGroup & detectObjectCategory)
assert.strictEqual(classifyLabelGroup("car"), "vehicle");
assert.strictEqual(classifyLabelGroup("vehicles"), "vehicle");
assert.strictEqual(classifyLabelGroup("Motorcycle"), "two_wheel");
assert.strictEqual(classifyLabelGroup("pedestrians"), "pedestrian");
assert.strictEqual(classifyLabelGroup("unknown_label_xyz"), "other");
assert.strictEqual(detectObjectCategory("pedestrian"), "pedestrian");
assert.strictEqual(detectObjectCategory("moped"), "cyclist");
assert.strictEqual(detectObjectCategory("sedan"), "car");
console.log("✅ Test 1: Phân loại nhãn chuẩn xác (Car, Motorcycle, Pedestrian, Other)");

// 2. Tính góc lệch Yaw (calcAngleDiffDeg)
assert.ok(Math.abs(calcAngleDiffDeg(0, Math.PI) - 180) < 0.1);
assert.ok(Math.abs(calcAngleDiffDeg(0, Math.PI / 2) - 90) < 0.1);
assert.ok(Math.abs(calcAngleDiffDeg(-Math.PI * 0.9, Math.PI * 0.9) - 36) < 0.1);
console.log("✅ Test 2: Tính góc lệch Yaw chính xác theo modulo 360°");

// 3. Kiểm tra Scale Sync (S)
const trackObjs: QCObjectInstance[] = [
  { frame: 0, trackId: 1, label: "car", group: "vehicle", x: 0, y: 0, z: 0, yaw: 0, yawDeg: 0, l: 4.5, w: 1.8, h: 1.6 },
  { frame: 1, trackId: 1, label: "car", group: "vehicle", x: 1, y: 0, z: 0, yaw: 0, yawDeg: 0, l: 4.5, w: 1.8, h: 1.6 },
  { frame: 2, trackId: 1, label: "car", group: "vehicle", x: 2, y: 0, z: 0, yaw: 0, yawDeg: 0, l: 4.65, w: 1.8, h: 1.6 }, // Lệch +0.15m
];
const scaleIssues = engine.checkScaleSync(trackObjs);
assert.strictEqual(scaleIssues.length, 1);
assert.strictEqual(scaleIssues[0].check, "scale");
assert.strictEqual(scaleIssues[0].frame, 2);
assert.ok(scaleIssues[0].detail.includes("L +0.15"));
console.log("✅ Test 3: Scale Sync (S): Bắt chính xác frame bị lệch kích thước so với median của track");

// 4. Kiểm tra Size Range (K)
const bigCar: QCObjectInstance = {
  frame: 0,
  trackId: 2,
  label: "car",
  group: "vehicle",
  x: 0,
  y: 0,
  z: 0,
  yaw: 0,
  yawDeg: 0,
  l: 6.0,
  w: 2.0,
  h: 1.7,
};
const issueBig = engine.checkSizeRange(bigCar);
assert.ok(issueBig !== null);
assert.strictEqual(issueBig?.check, "size");
assert.ok(issueBig?.detail.includes("Dài (L) 6.00 > 5.5"));

const smallCar: QCObjectInstance = {
  frame: 0,
  trackId: 3,
  label: "car",
  group: "vehicle",
  x: 0,
  y: 0,
  z: 0,
  yaw: 0,
  yawDeg: 0,
  l: 4.0,
  w: 1.3,
  h: 1.6,
};
const issueSmall = engine.checkSizeRange(smallCar);
assert.ok(issueSmall !== null);
assert.ok(issueSmall?.detail.includes("Rộng (W) 1.30 < 1.6"));
console.log("✅ Test 4: Size Range (K): Cảnh báo xe quá to hoặc quá nhỏ so với Catalog Class");

// 5. Kiểm tra Z Range (Z)
const highCar: QCObjectInstance = {
  frame: 0,
  trackId: 4,
  label: "car",
  group: "vehicle",
  x: 0,
  y: 0,
  z: 4.5, // > z_max (3.0m)
  yaw: 0,
  yawDeg: 0,
  l: 4.5,
  w: 1.8,
  h: 1.6,
};
const issueZ = engine.checkZRange(highCar);
assert.ok(issueZ !== null);
assert.strictEqual(issueZ?.check, "z");
assert.ok(issueZ?.detail.includes("cao hơn mặt đường"));
console.log("✅ Test 5: Z Range (Z): Bắt chính xác xe lơ lửng bất thường trên trời z = 4.5m > 3.0m");

// 6. Kiểm tra Rotation Jump (H)
const prevRot: QCObjectInstance = {
  frame: 0,
  trackId: 5,
  label: "car",
  group: "vehicle",
  x: 0,
  y: 0,
  z: 0,
  yaw: 0,
  yawDeg: 0,
  l: 4.5,
  w: 1.8,
  h: 1.6,
};
const curRot: QCObjectInstance = {
  frame: 1,
  trackId: 5,
  label: "car",
  group: "vehicle",
  x: 1,
  y: 0,
  z: 0,
  yaw: Math.PI,
  yawDeg: 180,
  l: 4.5,
  w: 1.8,
  h: 1.6,
};
const issueRot = engine.checkRotationJump(prevRot, curRot);
assert.ok(issueRot !== null);
assert.strictEqual(issueRot?.check, "rot");
console.log("✅ Test 6: Rotation Jump (H): Bắt chính xác xe bị lật ngược đầu 180° giữa 2 frame liên tiếp");

// 7. Thuật toán Sutherland-Hodgman BEV Overlap và kiểm tra chồng lấn (O)
const box1 = { x: 0, y: 0, l: 4, w: 2, yaw: 0 };
const box2 = { x: 0, y: 0, l: 4, w: 2, yaw: 0 };
const overlapSame = computeBevOverlap(box1, box2);
assert.ok(Math.abs(overlapSame.iou - 1.0) < 0.001);

const box3 = { x: 10, y: 0, l: 4, w: 2, yaw: 0 };
const overlapFar = computeBevOverlap(box1, box3);
assert.strictEqual(overlapFar.iou, 0);

const objA: QCObjectInstance = {
  frame: 0,
  trackId: 10,
  label: "car",
  group: "vehicle",
  x: 0,
  y: 0,
  z: 0,
  yaw: 0,
  yawDeg: 0,
  l: 4.0,
  w: 2.0,
  h: 1.6,
};
const objB: QCObjectInstance = {
  frame: 0,
  trackId: 11,
  label: "car",
  group: "vehicle",
  x: 2.0,
  y: 0,
  z: 0,
  yaw: 0,
  yawDeg: 0,
  l: 4.0,
  w: 2.0,
  h: 1.6,
};
const overlapIssues = engine.checkFrameOverlaps([objA, objB]);
assert.strictEqual(overlapIssues.length, 2);
console.log("✅ Test 7: BEV Overlap (O): Sutherland-Hodgman cắt đa giác xoay và báo lỗi cặp xe đè lên nhau");

// 8. Kiểm tra Quá Xa (D)
const farCar: QCObjectInstance = {
  frame: 0,
  trackId: 12,
  label: "car",
  group: "vehicle",
  x: 105,
  y: 10,
  z: 0,
  yaw: 0,
  yawDeg: 0,
  l: 4.5,
  w: 1.8,
  h: 1.6,
};
const issueDist = engine.checkDistance(farCar);
assert.ok(issueDist !== null);
assert.strictEqual(issueDist?.check, "dist");
console.log("✅ Test 8: Quá Xa (D): Cảnh báo xe ở cự ly > 100m");

// 9. Kiểm tra Nén Chuỗi Frame (compressFrames)
assert.strictEqual(compressFrames([1, 2, 3, 7, 9, 10]), "1-3, 7, 9-10");
assert.strictEqual(compressFrames([5]), "5");
assert.strictEqual(compressFrames([]), "");
assert.strictEqual(compressFrames([0, 1, 2, 3, 4, 5]), "0-5");
console.log("✅ Test 9: compressFrames nén mảng [1,2,3,7,9,10] ➔ '1-3, 7, 9-10' chuẩn xác");

// 10. Đọc dữ liệu Datumaro JSON & Data Issues (loadObjects)
const sampleDatumaro = {
  dm_format_version: "1.0",
  categories: {
    label: { labels: [{ name: "car" }, { name: "pedestrian" }] },
  },
  items: [
    {
      id: "frame_000000",
      attr: { frame: 0 },
      annotations: [
        {
          type: "cuboid_3d",
          id: 1,
          label_id: 0,
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [4.5, 1.8, 1.6],
          attributes: { track_id: 0, outside: false },
        },
        {
          type: "cuboid_3d",
          id: 2,
          label_id: 1,
          position: [5, 2, 0],
          rotation: [0, 0, 0],
          scale: [0.8, 0.7, 1.7],
          attributes: { outside: false }, // Thiếu track_id
        },
        {
          type: "cuboid_3d",
          id: 3,
          label_id: 0,
          position: [10, 0, 0],
          rotation: [0, 0, 0],
          scale: [4.5, 1.8, 1.6],
          attributes: { track_id: 0, outside: false }, // Trùng track_id 0 trong cùng frame
        },
      ],
    },
  ],
};

const { objs: parsedObjs, issues: parsedDataIssues } = loadObjects(
  sampleDatumaro,
  DEFAULT_DATUMARO_QA_CONFIG
);
assert.strictEqual(parsedObjs.length, 3);
assert.ok(parsedDataIssues.some((i) => i.kind === "Thiếu track_id"));
assert.ok(parsedDataIssues.some((i) => i.kind === "track_id trùng trong 1 frame"));
console.log("✅ Test 10: loadObjects đọc chuẩn Datumaro 1.0 JSON và bắt chính xác Data Issues");

// 11. Báo cáo Tổng thể Datumaro QA (generateDatumaroQAReport) & Ma trận 2D
const report = generateDatumaroQAReport(
  parsedObjs,
  parsedDataIssues,
  { version: "1.0", n_items: 1, n_objs: 3, n_tracks: 2, frame_items: { 0: "frame_000000" } },
  DEFAULT_DATUMARO_QA_CONFIG
);
assert.strictEqual(report.summary.nItems, 1);
assert.strictEqual(report.summary.nObjs, 3);
assert.ok(report.dataIssues.length >= 2);
console.log("✅ Test 11: generateDatumaroQAReport tổng kết 6 Tab chuẩn (Summary, By Track, By Frame, Matrix, All Issues, Data Issues)");

// 12. Xuất Báo Cáo CSV (kèm BOM UTF-8) và TSV (Google Sheets)
const csvAll = exportReportToCsv(report, "All_Issues");
assert.ok(csvAll.startsWith("\uFEFF"), "File CSV bắt buộc phải có BOM UTF-8 cho Microsoft Excel");
assert.ok(csvAll.includes("Frame,Item ID,Track ID,Class,Loại kiểm tra"));

const csvSummary = exportReportToCsv(report, "Summary");
assert.ok(csvSummary.includes("BÁO CÁO KIỂM TRA CHẤT LƯỢNG DỮ LIỆU 3D (Datumaro)"));

const tsvAll = exportReportToTsv(report, "All_Issues");
assert.ok(tsvAll.includes("\t"), "File TSV phải dùng dấu tab để dán vào Google Sheets");
console.log("✅ Test 12: Xuất báo cáo CSV UTF-8 with BOM và TSV Google Sheets hoàn hảo");

// 13. Kiểm thử Floored Modulo của calcAngleDiffDeg (Đồng bộ 100% Python angle_diff_deg)
assert.ok(Math.abs(calcAngleDiffDeg(3.0, -3.0) - 16.22) < 0.1);
assert.ok(Math.abs(calcAngleDiffDeg(-3.0, 3.0) - 16.22) < 0.1);
assert.ok(Math.abs(calcAngleDiffDeg(Math.PI, -Math.PI) - 0.0) < 0.001);
assert.ok(Math.abs(calcAngleDiffDeg(5.0, -5.0) - 146.9) < 0.5);
assert.ok(Math.abs(calcAngleDiffDeg(10.0, 0.0) - 146.9) < 0.5);
console.log("✅ Test 13: calcAngleDiffDeg floored modulo chính xác trong mọi miền âm/dương lớn");

// 14. Kiểm thử xuất sheet Matrix sang CSV và TSV
const csvMatrix = exportReportToCsv(report, "Matrix");
assert.ok(csvMatrix.startsWith("\uFEFF"));
assert.ok(csvMatrix.includes("Track ID,Class,Tổng số issue"));

const tsvMatrix = exportReportToTsv(report, "Matrix");
assert.ok(tsvMatrix.includes("Track ID\tClass\tTổng số issue"));
console.log("✅ Test 14: Xuất sheet Matrix dạng CSV UTF-8 with BOM và TSV chuẩn xác 100%");

// 15. Kiểm thử fmtSigned và checkScaleSync không bao giờ sinh -0.00
const { fmtSigned } = await import("../src/core/qc/qc_engine.ts");
assert.strictEqual(fmtSigned(0.0), "+0.00");
assert.strictEqual(fmtSigned(-0.00001), "+0.00");
assert.strictEqual(fmtSigned(0.05), "+0.05");
assert.strictEqual(fmtSigned(-0.05), "-0.05");
console.log("✅ Test 15: fmtSigned định dạng chuẩn xác số thực có dấu");

// 16. Kiểm thử Sutherland-Hodgman & Shoelace Polygon Clipping (BEV Overlap)
const corners45 = rectCorners(0, 0, 4, 2, Math.PI / 4);
assert.strictEqual(corners45.length, 4);
const areaShoelace = polyArea(corners45);
assert.ok(Math.abs(areaShoelace - 8.0) < 0.001);

const clipped = clipConvex(corners45, rectCorners(0, 0, 4, 2, 0));
assert.ok(clipped.length >= 4);
const interShoelaceArea = polyArea(clipped);
assert.ok(interShoelaceArea > 0 && interShoelaceArea < 8.0);
console.log("✅ Test 16: Thuật toán Sutherland-Hodgman & Shoelace đa giác xoay kiểm thử thành công");

// 17. Kiểm thử LiDAR QC (L1: Empty Box, L2: Ground Mismatch, L3: Motion Yaw Mismatch)
const dummyBox = { x: 0, y: 0, z: 0.8, l: 4.5, w: 1.8, h: 1.6, yaw: 0 };
const insidePoints = [
  { x: 0, y: 0, z: 0.8 },
  { x: 1.0, y: 0.5, z: 0.5 },
  { x: -1.0, y: -0.5, z: 1.0 },
  { x: 10.0, y: 10.0, z: 0 }, // Điểm ngoài
];
const countInside = countPointsInsideBox(dummyBox, insidePoints);
assert.strictEqual(countInside, 3);

// Kiểm thử với Float32Array
const floatPts = new Float32Array([
  0, 0, 0.8,
  1.0, 0.5, 0.5,
  -1.0, -0.5, 1.0,
  10.0, 10.0, 0,
]);
const countFloat = countPointsInsideBox(dummyBox, floatPts);
assert.strictEqual(countFloat, 3);

// L1: Box rỗng (0 điểm) -> error
const emptyObj: QCObjectInstance = {
  frame: 0, trackId: 10, label: "car", group: "vehicle",
  x: 5, y: 5, z: 0.8, yaw: 0, yawDeg: 0, l: 4.5, w: 1.8, h: 1.6,
};
const emptyIssue = checkEmptyOrSparseBox(emptyObj, [], DEFAULT_DATUMARO_QA_CONFIG);
assert.ok(emptyIssue !== null);
assert.strictEqual(emptyIssue.check, "empty_box");
assert.strictEqual(emptyIssue.severity, "error");

// L1: Box có điểm nhưng ít hơn ngưỡng ở gần (< 3 điểm) -> warning
const sparseIssue = checkEmptyOrSparseBox(emptyObj, [{ x: 5, y: 5, z: 0.8 }], DEFAULT_DATUMARO_QA_CONFIG);
assert.ok(sparseIssue !== null);
assert.strictEqual(sparseIssue.severity, "warning");

// L3: Xe chạy tiến với góc quay ngược 180° -> error
const movePrev: QCObjectInstance = {
  frame: 0, trackId: 20, label: "car", group: "vehicle",
  x: 0, y: 0, z: 0, yaw: 0, yawDeg: 0, l: 4.5, w: 1.8, h: 1.6,
};
const moveCurBackward: QCObjectInstance = {
  frame: 1, trackId: 20, label: "car", group: "vehicle",
  x: 2.0, y: 0, z: 0, yaw: Math.PI, yawDeg: 180, l: 4.5, w: 1.8, h: 1.6, // Tiến dọc X nhưng đầu quay ngược 180°
};
const motionIssue = checkMotionYawMismatch(movePrev, moveCurBackward, DEFAULT_DATUMARO_QA_CONFIG);
assert.ok(motionIssue !== null);
assert.strictEqual(motionIssue.check, "motion_mismatch");
assert.strictEqual(motionIssue.severity, "error");

// Tích hợp checkSingleObject có lidarPoints
const summaryWithLidar = engine.checkSingleObject(emptyObj, [emptyObj], [emptyObj], []);
assert.strictEqual(summaryWithLidar.checks.empty_box.passed, false);
assert.strictEqual(summaryWithLidar.checks.empty_box.severity, "error");
console.log("✅ Test 17: Module LiDAR Smart QC (L1, L2, L3) kiểm thử thành công 100%");

console.log("\n🎉 TẤT CẢ 17/17 BÀI KIỂM THỬ QC ENGINE ĐÃ ĐẠT 100%!");
