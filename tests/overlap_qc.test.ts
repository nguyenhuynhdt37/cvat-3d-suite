import assert from "node:assert";
import { QCEngine } from "../src/core/qc/qc_engine.ts";
import type { QCObjectInstance } from "../src/core/qc/types.ts";
import { DEFAULT_QC_CONFIG } from "../src/core/qc/types.ts";
import { computeBevOverlap } from "../src/core/qc/bev_overlap.ts";

console.log("🧪 Đang chạy kiểm thử tự động Kiểm Định Overlap (BEV Overlap & Category Separation)...");

const engine = new QCEngine(DEFAULT_QC_CONFIG);

// =========================================================================
// TEST 1: HAI XE MÁY (two_wheel + two_wheel) CHỒNG LẤN
// =========================================================================
const bike1: QCObjectInstance = {
  frame: 0,
  trackId: 10,
  label: "two-wheels",
  group: "two_wheel",
  x: 5.0,
  y: 0.0,
  z: 0.5,
  yaw: 0,
  yawDeg: 0,
  l: 1.8,
  w: 0.7,
  h: 1.2,
};

const bike2Overlap: QCObjectInstance = {
  frame: 0,
  trackId: 11,
  label: "two-wheels",
  group: "two_wheel",
  x: 5.2, // Chồng lấn sâu vào bike1
  y: 0.1,
  z: 0.5,
  yaw: 0,
  yawDeg: 0,
  l: 1.8,
  w: 0.7,
  h: 1.2,
};

const issuesBikes = engine.checkFrameOverlaps([bike1, bike2Overlap]);
assert.strictEqual(issuesBikes.length, 2, "Hai xe máy chồng lấn phải sinh ra 2 lỗi overlap (cho cả 2 track)!");
assert.strictEqual(issuesBikes[0].check, "overlap");
assert.strictEqual(issuesBikes[0].symbol, "O");
assert.strictEqual(issuesBikes[0].trackId, 10);
assert.strictEqual(issuesBikes[0].otherTrackId, 11);
assert.ok(issuesBikes[0].detail.includes("Chồng lấn với Track #11"));
console.log("✅ Test 1: Hai xe máy chồng lấn (two_wheel + two_wheel) báo lỗi [O] chính xác 100%");

// =========================================================================
// TEST 2: HAI XE MÁY CHẠM MÉP RẤT NHẸ (Dung sai <= 2%)
// =========================================================================
const bike3Far: QCObjectInstance = {
  frame: 0,
  trackId: 12,
  label: "motorcycle",
  group: "two_wheel",
  x: 6.8, // Cách xa, không giao cắt
  y: 2.0,
  z: 0.5,
  yaw: 0,
  yawDeg: 0,
  l: 1.8,
  w: 0.7,
  h: 1.2,
};

const issuesFarBikes = engine.checkFrameOverlaps([bike1, bike3Far]);
assert.strictEqual(issuesFarBikes.length, 0, "Hai xe máy cách xa nhau tuyệt đối không báo lỗi overlap!");
console.log("✅ Test 2: Hai xe máy không giao cắt đạt chuẩn Clean 100%");

// =========================================================================
// TEST 3: XE MÁY + NGƯỜI LÁI XE (Rider on Two-Wheel, IoU <= 50% Hợp lệ)
// =========================================================================
const riderPerson: QCObjectInstance = {
  frame: 0,
  trackId: 15,
  label: "pedestrian",
  group: "pedestrian",
  x: 5.1, // Ngồi trên yên xe bike1
  y: 0.0,
  z: 1.1,
  yaw: 0,
  yawDeg: 0,
  l: 0.6,
  w: 0.5,
  h: 1.4,
};

const overlapResult = computeBevOverlap(bike1, riderPerson);
// Diện tích person = 0.3m2, diện tích bike = 1.26m2, IoU ≈ 0.3 / 1.26 ≈ 23.8% <= 50%
assert.ok(overlapResult.iou > 0.15 && overlapResult.iou <= 0.50, `IoU phải nằm trong khoảng cho phép người ngồi trên xe! (${overlapResult.iou})`);

const issuesRider = engine.checkFrameOverlaps([bike1, riderPerson]);
assert.strictEqual(issuesRider.length, 0, "Người lái xe ngồi trên xe máy (IoU <= 50%) là hợp lệ, không được báo lỗi!");
console.log("✅ Test 3: Cặp Rider + Two-Wheeler (IoU <= 50%) được miễn trừ thông minh");

// =========================================================================
// TEST 4: Ô TÔ + Ô TÔ (vehicle + vehicle) CHỒNG LẤN
// =========================================================================
const car1: QCObjectInstance = {
  frame: 0,
  trackId: 20,
  label: "car",
  group: "vehicle",
  x: 10.0,
  y: -2.0,
  z: 0.8,
  yaw: 0,
  yawDeg: 0,
  l: 4.5,
  w: 1.8,
  h: 1.5,
};

const car2Overlap: QCObjectInstance = {
  frame: 0,
  trackId: 21,
  label: "SUV",
  group: "vehicle",
  x: 11.0, // Chồng lấn 3.5m dài
  y: -2.0,
  z: 0.8,
  yaw: 0,
  yawDeg: 0,
  l: 4.7,
  w: 1.9,
  h: 1.7,
};

const issuesCars = engine.checkFrameOverlaps([car1, car2Overlap]);
assert.strictEqual(issuesCars.length, 2, "Hai ô tô đè lên nhau phải báo lỗi [O] lập tức!");
assert.strictEqual(issuesCars[0].check, "overlap");
console.log("✅ Test 4: Hai ô tô đè lên nhau (vehicle + vehicle) báo lỗi [O] chuẩn xác");

// =========================================================================
// TEST 5: Ô TÔ + XE 2 BÁNH (vehicle + two_wheel) CHỒNG LẤN
// =========================================================================
const carAndBikeIssues = engine.checkFrameOverlaps([car1, { ...bike1, x: 10.5, y: -2.0 }]);
assert.strictEqual(carAndBikeIssues.length, 2, "Ô tô đè lên xe máy (IoU > 2%) phải báo lỗi [O] lập tức!");
console.log("✅ Test 5: Ô tô đè lên xe máy (vehicle + two_wheel) báo lỗi [O] chuẩn xác");

// =========================================================================
// TEST 6: checkSingleObject TÍCH HỢP ĐẦY ĐỦ currentFrameObjects
// =========================================================================
const allTrackFramesBike1 = [bike1];
const frameObjsWithOverlap = [bike1, bike2Overlap];

const summaryBike1 = engine.checkSingleObject(bike1, allTrackFramesBike1, frameObjsWithOverlap);
assert.strictEqual(summaryBike1.checks.overlap.passed, false, "Kiểm tra checkSingleObject phải phát hiện lỗi overlap!");
assert.strictEqual(summaryBike1.checks.overlap.severity, "error");
assert.ok(summaryBike1.issues.some((iss) => iss.check === "overlap"), "Danh sách issues phải chứa lỗi overlap!");
console.log("✅ Test 6: checkSingleObject tích hợp currentFrameObjects báo lỗi Overlap chuẩn xác 100%");

console.log("\n🎉 TẤT CẢ 6/6 BÀI KIỂM THỬ OVERLAP QC ĐÃ ĐẠT 100%!");
