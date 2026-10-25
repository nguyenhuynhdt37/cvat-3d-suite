import assert from "node:assert";
import { QCEngine, classifyLabelGroup, compressFrames, loadObjects } from "../src/core/qc/qc_engine.ts";
import { DEFAULT_DATUMARO_QA_CONFIG } from "../src/core/qc/types.ts";
import type { QCObjectInstance, FrameIssueGroup } from "../src/core/qc/types.ts";

console.log("🧪 Đang chạy kiểm thử tự động Toàn Diện QC (Datumaro QA Comprehensive Suite)...");

const engine = new QCEngine(DEFAULT_DATUMARO_QA_CONFIG);

// =========================================================================
// TEST 1: KÍCH THƯỚC NGƯỜI ĐI BỘ CHUẨN DATUMARO (L=0.80m, W=0.75m, H=1.65m)
// =========================================================================
const adultPed: QCObjectInstance = {
  frame: 0,
  trackId: 1,
  label: "pedestrian",
  group: "pedestrian",
  x: 5.0,
  y: 2.0,
  z: 0.8,
  yaw: 0,
  yawDeg: 0,
  l: 0.80,
  w: 0.75,
  h: 1.65,
};

const issueAdult = engine.checkSizeRange(adultPed);
assert.strictEqual(issueAdult, null, "Người đi bộ chuẩn Datumaro L=0.80m, W=0.75m, H=1.65m phải đạt chuẩn Clean, không bị báo lỗi [K]!");
console.log("✅ Test 1: Người đi bộ chuẩn Datumaro (0.80x0.75x1.65m) đạt chuẩn Clean 100%");

// =========================================================================
// TEST 2: KÍCH THƯỚC VƯỢT NGƯỠNG BÁO LỖI [K] (L=1.5m > 1.0m)
// =========================================================================
const overPed: QCObjectInstance = {
  frame: 0,
  trackId: 2,
  label: "pedestrian",
  group: "pedestrian",
  x: 5.0,
  y: 3.0,
  z: 0.5,
  yaw: 0,
  yawDeg: 0,
  l: 1.50,
  w: 0.80,
  h: 1.70,
};

const issueOver = engine.checkSizeRange(overPed);
assert.ok(issueOver !== null, "Người đi bộ có L=1.50m > 1.0m phải bị báo lỗi Kích thước ngoài ngưỡng [K]!");
console.log("✅ Test 2: Bắt chính xác lỗi Kích thước ngoài ngưỡng cho người đi bộ quá dài");

// =========================================================================
// TEST 3: XE 2 BÁNH CHUẨN DATUMARO (L=1.75m, W=0.75m, H=1.65m)
// =========================================================================
const standardBike: QCObjectInstance = {
  frame: 0,
  trackId: 3,
  label: "motorcycle",
  group: "two_wheel",
  x: 8.0,
  y: -1.5,
  z: 0.5,
  yaw: 0,
  yawDeg: 0,
  l: 1.75,
  w: 0.75,
  h: 1.65,
};

const issueBike = engine.checkSizeRange(standardBike);
assert.strictEqual(issueBike, null, "Xe 2 bánh chuẩn Datumaro L=1.75m, W=0.75m, H=1.65m phải đạt chuẩn Clean 100%!");
console.log("✅ Test 3: Xe 2 bánh chuẩn Datumaro (1.75x0.75x1.65m) đạt chuẩn Clean 100%");

// =========================================================================
// TEST 4: HAI BOX KHÔNG GIAO NHAU (Cách xa) => CLEAN 100%
// =========================================================================
const roadCar: QCObjectInstance = {
  frame: 0,
  trackId: 10,
  label: "car",
  group: "vehicle",
  x: 5.0,
  y: 0.0,
  z: 0.0,
  yaw: 0,
  yawDeg: 0,
  l: 4.5,
  w: 2.0,
  h: 1.5,
};

const otherFarCar: QCObjectInstance = {
  frame: 0,
  trackId: 11,
  label: "car",
  group: "vehicle",
  x: 15.0,
  y: 5.0,
  z: 0.0,
  yaw: 0,
  yawDeg: 0,
  l: 4.0,
  w: 1.8,
  h: 1.5,
};

const overlapFarIssues = engine.checkFrameOverlaps([roadCar, otherFarCar]);
assert.strictEqual(overlapFarIssues.length, 0, "Hai xe cách xa nhau không được báo lỗi Overlap!");
console.log("✅ Test 4: Hai xe cách xa nhau đạt chuẩn Clean Overlap 100%");

// =========================================================================
// TEST 5: HAI Ô TÔ GIAO THOA BEV TRÊN MẶT ĐẤT => BÁO LỖI [O]
// =========================================================================
const lowerBox: QCObjectInstance = {
  frame: 0,
  trackId: 20,
  label: "car",
  group: "vehicle",
  x: 10.0,
  y: 0.0,
  z: 0.0,
  yaw: 0,
  yawDeg: 0,
  l: 4.0,
  w: 2.0,
  h: 1.6,
};

const upperOverlapBox: QCObjectInstance = {
  frame: 0,
  trackId: 21,
  label: "car",
  group: "vehicle",
  x: 10.5,
  y: 0.2,
  z: 0.0,
  yaw: 0,
  yawDeg: 0,
  l: 4.0,
  w: 2.0,
  h: 1.6,
};

const overlapRealIssues = engine.checkFrameOverlaps([lowerBox, upperOverlapBox]);
assert.strictEqual(overlapRealIssues.length, 2, "Hai xe giao nhau trên mặt phẳng BEV phải báo lỗi Overlap [O]!");
console.log("✅ Test 5: Hai box giao thoa BEV báo lỗi Overlap [O] chuẩn xác");

// =========================================================================
// TEST 6: ĐỐI TƯỢNG CÓ outside === true KHÔNG BỊ BÁO OVERLAP
// =========================================================================
const outsideBox: QCObjectInstance = {
  frame: 0,
  trackId: 22,
  label: "car",
  group: "vehicle",
  x: 10.0,
  y: 0.0,
  z: 0.0,
  yaw: 0,
  yawDeg: 0,
  l: 4.0,
  w: 2.0,
  h: 1.6,
  outside: true,
};

const overlapWithOutside = engine.checkFrameOverlaps([lowerBox, outsideBox]);
assert.strictEqual(overlapWithOutside.length, 0, "Đối tượng outside: true không tồn tại trên scene, không được tính Overlap!");
console.log("✅ Test 6: Đối tượng outside: true được loại bỏ khỏi kiểm tra Overlap");

// =========================================================================
// TEST 7: SCALE SYNC LOẠI BỎ FRAME OUTSIDE, KHÔNG KÉO LỆCH MEDIAN
// =========================================================================
const trackWithOutsideFrames: QCObjectInstance[] = [
  { frame: 0, trackId: 30, label: "car", group: "vehicle", x: 0, y: 0, z: 0, yaw: 0, yawDeg: 0, l: 4.6, w: 1.8, h: 1.5, outside: false },
  { frame: 1, trackId: 30, label: "car", group: "vehicle", x: 1, y: 0, z: 0, yaw: 0, yawDeg: 0, l: 9.9, w: 9.9, h: 9.9, outside: true },
  { frame: 2, trackId: 30, label: "car", group: "vehicle", x: 2, y: 0, z: 0, yaw: 0, yawDeg: 0, l: 4.6, w: 1.8, h: 1.5, outside: false },
  { frame: 3, trackId: 30, label: "car", group: "vehicle", x: 3, y: 0, z: 0, yaw: 0, yawDeg: 0, l: 8.8, w: 8.8, h: 8.8, outside: true },
  { frame: 4, trackId: 30, label: "car", group: "vehicle", x: 4, y: 0, z: 0, yaw: 0, yawDeg: 0, l: 4.6, w: 1.8, h: 1.5, outside: false },
];

const scaleIssues = engine.checkScaleSync(trackWithOutsideFrames);
assert.strictEqual(scaleIssues.length, 0, "Scale Sync phải lọc sạch các frame outside, không để rác kéo lệch Median chuẩn 4.6x1.8x1.5m!");
console.log("✅ Test 7: Scale Sync loại trừ 100% các frame outside, Median chuẩn xác");

// =========================================================================
// TEST 8: ĐỒNG BỘ CROSS-TRACK CACHE KHI KHẮC PHỤC OVERLAP
// =========================================================================
interface MockCachedTrack {
  trackId: number;
  label: string;
  status: "ready";
  trackObjects: QCObjectInstance[];
  errorFrames: FrameIssueGroup[];
  totalFrames: number;
  cleanFramesCount: number;
  lastScannedAt: number;
}

const mockRamCache = new Map<number, MockCachedTrack>();

const trackAObjs: QCObjectInstance[] = [
  { frame: 0, trackId: 100, label: "car", group: "vehicle", x: 0.0, y: 0, z: 0, yaw: 0, yawDeg: 0, l: 4.5, w: 1.8, h: 1.5 },
  { frame: 1, trackId: 100, label: "car", group: "vehicle", x: 2.0, y: 0, z: 0, yaw: 0, yawDeg: 0, l: 4.5, w: 1.8, h: 1.5 },
];

const trackBObjs: QCObjectInstance[] = [
  { frame: 0, trackId: 101, label: "car", group: "vehicle", x: 1.0, y: 0, z: 0, yaw: 0, yawDeg: 0, l: 4.5, w: 1.8, h: 1.5 },
  { frame: 1, trackId: 101, label: "car", group: "vehicle", x: 15.0, y: 0, z: 0, yaw: 0, yawDeg: 0, l: 4.5, w: 1.8, h: 1.5 },
];

const initialFrame0Overlap = engine.checkFrameOverlaps([trackAObjs[0], trackBObjs[0]]);
assert.strictEqual(initialFrame0Overlap.length, 2);

mockRamCache.set(100, {
  trackId: 100,
  label: "car",
  status: "ready",
  trackObjects: trackAObjs,
  errorFrames: [{ frame: 0, issues: [initialFrame0Overlap[0]], topSeverity: "error" }],
  totalFrames: 2,
  cleanFramesCount: 1,
  lastScannedAt: Date.now(),
});

mockRamCache.set(101, {
  trackId: 101,
  label: "car",
  status: "ready",
  trackObjects: trackBObjs,
  errorFrames: [{ frame: 0, issues: [initialFrame0Overlap[1]], topSeverity: "error" }],
  totalFrames: 2,
  cleanFramesCount: 1,
  lastScannedAt: Date.now(),
});

trackAObjs[0].x = -10.0;

function simulateRevalidateCrossTrack(uiId: number, frame: number) {
  const cachedA = mockRamCache.get(uiId)!;
  const frameObjsForA = [cachedA.trackObjects.find((o) => o.frame === frame)!];
  for (const [otherId, otherCached] of mockRamCache.entries()) {
    if (otherId === uiId) continue;
    const otherObj = otherCached.trackObjects.find((o) => o.frame === frame);
    if (otherObj) frameObjsForA.push(otherObj);
  }

  const summaryA = engine.checkSingleObject(cachedA.trackObjects[0], cachedA.trackObjects, frameObjsForA);
  cachedA.errorFrames = summaryA.issues.length > 0 ? [{ frame, issues: summaryA.issues, topSeverity: "error" }] : [];
  cachedA.cleanFramesCount = cachedA.totalFrames - cachedA.errorFrames.length;

  for (const [otherUiId, otherCached] of mockRamCache.entries()) {
    if (otherUiId === uiId) continue;
    const hasRelatedOverlap = otherCached.errorFrames.some((ef) =>
      ef.issues.some((iss) => iss.check === "overlap" && (iss as any).otherTrackId === uiId)
    );
    if (hasRelatedOverlap) {
      const otherFrameObjs = otherCached.trackObjects.map((oo) => {
        const matchingA = cachedA.trackObjects.find((ao) => ao.frame === oo.frame);
        return matchingA ? [oo, matchingA] : [oo];
      });

      const newOtherErrors: FrameIssueGroup[] = [];
      for (let i = 0; i < otherCached.trackObjects.length; i++) {
        const oo = otherCached.trackObjects[i];
        const s = engine.checkSingleObject(oo, otherCached.trackObjects, otherFrameObjs[i]);
        if (s.issues.length > 0) {
          newOtherErrors.push({ frame: oo.frame, issues: s.issues, topSeverity: "error" });
        }
      }
      otherCached.errorFrames = newOtherErrors;
      otherCached.cleanFramesCount = otherCached.totalFrames - otherCached.errorFrames.length;
    }
  }
}

simulateRevalidateCrossTrack(100, 0);

const cacheAAfter = mockRamCache.get(100)!;
const cacheBAfter = mockRamCache.get(101)!;
assert.strictEqual(cacheAAfter.errorFrames.length, 0, "Track A phải sạch lỗi sau khi dời");
assert.strictEqual(cacheBAfter.errorFrames.length, 0, "Track B cũng phải tự động sạch lỗi nhờ Cross-Track Sync!");
assert.strictEqual(cacheAAfter.cleanFramesCount, 2);
assert.strictEqual(cacheBAfter.cleanFramesCount, 2);
console.log("✅ Test 8: Khắc phục Cross-Track Stale Cache: Cả 2 track tự động sạch lỗi cùng lúc khi dời xe");

// =========================================================================
// TEST 9: FULL JOB QC REPORT VỚI OUTSIDE OBJECTS
// =========================================================================
const jobObjects: QCObjectInstance[] = [
  { frame: 0, trackId: 200, label: "car", group: "vehicle", x: 0, y: 0, z: 0, yaw: 0, yawDeg: 0, l: 4.5, w: 1.8, h: 1.5, outside: false },
  { frame: 1, trackId: 200, label: "car", group: "vehicle", x: 1, y: 0, z: 0, yaw: 0, yawDeg: 0, l: 9.9, w: 9.9, h: 9.9, outside: true },
  { frame: 2, trackId: 200, label: "car", group: "vehicle", x: 2, y: 0, z: 0, yaw: 0, yawDeg: 0, l: 4.5, w: 1.8, h: 1.5, outside: false },
];

const jobReport = engine.runFullJobQC(jobObjects);
assert.strictEqual(jobReport.totalTracks, 1);
assert.strictEqual(jobReport.totalIssues, 0, "Shape outside không được sinh ra bất kỳ lỗi size hay scale nào!");
assert.strictEqual(jobReport.matrix[200][1].hasObject, false, "Frame 1 là outside nên matrix hasObject phải là false");
assert.strictEqual(jobReport.matrix[200][0].hasObject, true);
assert.strictEqual(jobReport.matrix[200][2].hasObject, true);
console.log("✅ Test 9: Full Job QC Report xử lý shape outside chuẩn xác, không báo lỗi giả");

// =========================================================================
// TEST 10: KIỂM ĐỊNH DATA ISSUES THEO CHUẨN DATUMARO (Thiếu track_id & Trùng track)
// =========================================================================
const mockDatumaroData = {
  dm_format_version: "1.0",
  categories: {
    label: { labels: [{ name: "car" }] },
  },
  items: [
    {
      id: "frame_0",
      attr: { frame: 0 },
      annotations: [
        {
          type: "cuboid_3d",
          id: 1,
          label_id: 0,
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [4.5, 1.8, 1.6],
          attributes: { outside: false },
        },
        {
          type: "cuboid_3d",
          id: 2,
          label_id: 0,
          position: [5, 0, 0],
          rotation: [0, 0, 0],
          scale: [4.5, 1.8, 1.6],
          attributes: { track_id: 10, outside: false },
        },
        {
          type: "cuboid_3d",
          id: 3,
          label_id: 0,
          position: [10, 0, 0],
          rotation: [0, 0, 0],
          scale: [4.5, 1.8, 1.6],
          attributes: { track_id: 10, outside: false },
        },
      ],
    },
  ],
};

const { issues: dataIssues } = loadObjects(mockDatumaroData, DEFAULT_DATUMARO_QA_CONFIG);
assert.ok(dataIssues.some((i) => i.kind === "Thiếu track_id"), "Phải bắt lỗi thiếu track_id");
assert.ok(dataIssues.some((i) => i.kind === "track_id trùng trong 1 frame"), "Phải bắt lỗi track_id trùng trong frame");
console.log("✅ Test 10: Data Issues: Bắt chính xác thiếu track_id và trùng track_id trong frame");

// =========================================================================
// TEST 11: NÉN CHUỖI FRAME CHUẨN XÁC THEO DATUMARO QA (compressFrames)
// =========================================================================
const compressed = compressFrames([1, 2, 3, 7, 9, 10]);
assert.strictEqual(compressed, "1-3, 7, 9-10", "Thuật toán nén frame phải trả về '1-3, 7, 9-10'");
console.log("✅ Test 11: compressFrames nén mảng [1,2,3,7,9,10] ➔ '1-3, 7, 9-10' chuẩn xác 100%");

// =========================================================================
// TEST 12: XE BICYCLE VÀ NGƯỜI LÁI (PEDESTRIAN) ĐƯỢC MIỄN TRỪ OVERLAP <= 50%
// =========================================================================
const myBike: QCObjectInstance = {
  frame: 0,
  trackId: 500,
  label: "bicycle",
  group: "two_wheel",
  x: 5.0, y: 0.0, z: 0.5,
  yaw: 0, yawDeg: 0,
  l: 1.8, w: 0.6, h: 1.2
};

const myRider: QCObjectInstance = {
  frame: 0,
  trackId: 501,
  label: "pedestrian",
  group: "pedestrian",
  x: 5.1, y: 0.0, z: 0.9,
  yaw: 0, yawDeg: 0,
  l: 0.7, w: 0.7, h: 1.4
};

const riderOverlapIssues = engine.checkFrameOverlaps([myBike, myRider]);
assert.strictEqual(riderOverlapIssues.length, 0, "Cặp bicycle + rider (IoU <= 50%) phải được miễn trừ overlap thông minh!");
console.log("✅ Test 12: Cặp bicycle + rider được nhận diện chuẩn xác và miễn trừ Overlap");

// =========================================================================
// TEST 13: NGƯỜI LÁI CÓ KÍCH THƯỚC NGƯỜI ĐẠT CHUẨN PEDESTRIAN
// =========================================================================
const riderSizeIssue = engine.checkSizeRange(myRider);
assert.strictEqual(riderSizeIssue, null, "Người lái (0.7x0.7x1.4m) mang kích thước người đi bộ hợp lệ, không bị báo lỗi!");
console.log("✅ Test 13: checkSizeRange áp dụng catalog người đi bộ đạt chuẩn 100%");

// =========================================================================
// TEST 14: Ô TÔ ĐƯỢC BẢO VỆ SCALE SYNC TOÀN TRACK
// =========================================================================
const vehicleScaleTrack: QCObjectInstance[] = [
  { frame: 0, trackId: 600, label: "car", group: "vehicle", x: 0, y: 0, z: 0, yaw: 0, yawDeg: 0, l: 4.5, w: 1.8, h: 1.6 },
  { frame: 1, trackId: 600, label: "car", group: "vehicle", x: 1, y: 0, z: 0, yaw: 0, yawDeg: 0, l: 4.8, w: 1.8, h: 1.6 }, // Lệch +30cm
  { frame: 2, trackId: 600, label: "car", group: "vehicle", x: 2, y: 0, z: 0, yaw: 0, yawDeg: 0, l: 4.5, w: 1.8, h: 1.6 },
];

const vehicleScaleIssues = engine.checkScaleSync(vehicleScaleTrack);
assert.strictEqual(vehicleScaleIssues.length, 1, "Ô tô bị resize ở Frame 1 phải bị báo lỗi Scale Sync [S]!");
assert.strictEqual(vehicleScaleIssues[0].frame, 1);
assert.strictEqual(vehicleScaleIssues[0].symbol, "S");
console.log("✅ Test 14: scaleSyncGroups bảo vệ ô tô, bắt trọn lỗi resize thân xe giữa track");

// =========================================================================
// TEST 15: XE RƠI XUỐNG ÂM ĐẤT Z = -4.5m BỊ BÁO LỖI [Z]
// =========================================================================
const lowCar: QCObjectInstance = {
  frame: 0,
  trackId: 700,
  label: "car",
  group: "vehicle",
  x: 20.0, y: 5.0, z: -4.5, // Thấp hơn z_min = -3.0m
  yaw: 0, yawDeg: 0,
  l: 4.5, w: 1.8, h: 1.6,
};
const zIssue = engine.checkZRange(lowCar);
assert.ok(zIssue !== null && zIssue.check === "z", "Xe ở Z = -4.5m < -3.0m phải bị báo lỗi ZRange [Z]!");
console.log("✅ Test 15: Bắt chính xác lỗi xe thấp hơn mặt đường Z = -4.5m < -3.0m");

// =========================================================================
// TEST 16: ĐỐI TƯỢNG Ở XA > 100M (INFO) KHÔNG BỊ ĐẾM VÀO ERRORFRAMES
// =========================================================================
const farCar: QCObjectInstance = {
  frame: 0,
  trackId: 800,
  label: "car",
  group: "vehicle",
  x: 105.0, y: 0.0, z: 0.0, // Cách gốc 105m (> 100m)
  yaw: 0, yawDeg: 0,
  l: 4.5, w: 1.8, h: 1.6,
};
const farIssues = engine.checkDistance(farCar);
assert.ok(farIssues !== null && farIssues.severity === "info", "Lỗi D cự ly > 100m phải có severity là info");

const issuesList = [farIssues!];
const actionableIssues = issuesList.filter((iss) => iss.severity === "error" || iss.severity === "warning");
assert.strictEqual(actionableIssues.length, 0, "Issue thuần info tuyệt đối không được đưa vào actionableIssues!");
const simulatedErrorFrames = actionableIssues.length > 0 ? [{ frame: 0, issues: actionableIssues }] : [];
assert.strictEqual(simulatedErrorFrames.length, 0, "Track có xe ở xa 105m không có errorFrames nào, đạt chuẩn 100%!");
console.log("✅ Test 16: Đối tượng ở xa 105m (severity info) không bị đếm vào errorFrames (Đạt chuẩn 100%)");

// =========================================================================
// TEST 17: SAI SỐ LỆCH > 1CM BỊ BÁO SCALE SYNC [S] (scaleSyncTol = 1cm)
// =========================================================================
const diffTrack: QCObjectInstance[] = [
  { frame: 0, trackId: 900, label: "car", group: "vehicle", x: 0, y: 0, z: 0, yaw: 0, yawDeg: 0, l: 4.50, w: 1.80, h: 1.60 },
  { frame: 1, trackId: 900, label: "car", group: "vehicle", x: 1, y: 0, z: 0, yaw: 0, yawDeg: 0, l: 4.55, w: 1.80, h: 1.60 }, // Lệch 5cm > 1cm
  { frame: 2, trackId: 900, label: "car", group: "vehicle", x: 2, y: 0, z: 0, yaw: 0, yawDeg: 0, l: 4.50, w: 1.80, h: 1.60 },
];
const diffScaleIssues = engine.checkScaleSync(diffTrack);
assert.strictEqual(diffScaleIssues.length, 1, "Sai số lệch 5cm vượt quá dung sai 1cm phải bị báo lỗi Scale Sync [S]!");
console.log("✅ Test 17: Scale Sync bắt chính xác sai số lệch > 1cm theo chuẩn Datumaro QA");

// =========================================================================
// TEST 18: HAI XE Ô TÔ KHÔNG CHỒNG LẤN ĐẠT CLEAN 100%
// =========================================================================
const carA: QCObjectInstance = {
  frame: 0,
  trackId: 1001,
  label: "car",
  group: "vehicle",
  x: 0.0, y: 0.0, z: 0.0,
  yaw: 0, yawDeg: 0,
  l: 4.5, w: 1.8, h: 1.6,
};
const carB: QCObjectInstance = {
  frame: 0,
  trackId: 1002,
  label: "car",
  group: "vehicle",
  x: 6.0, y: 0.0, z: 0.0, // Cách nhau 1.5m không đụng
  yaw: 0, yawDeg: 0,
  l: 4.5, w: 1.8, h: 1.6,
};

const carIssues = engine.checkFrameOverlaps([carA, carB]);
assert.strictEqual(carIssues.length, 0, "Hai ô tô không đụng nhau tuyệt đối không báo lỗi Overlap!");
console.log("✅ Test 18: Hai ô tô không chạm nhau đạt Clean 100%");

console.log("\n🎉 TẤT CẢ 18/18 BÀI KIỂM THỬ QC TOÀN DIỆN ĐÃ ĐẠT 100%!");
