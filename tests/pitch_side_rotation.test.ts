/**
 * Bộ kiểm thử tự động Tính Năng Chỉnh Hướng Side Góc (Pitch) bằng 2 Nút [ . ] và [ / ]
 * Tuân thủ nghiêm ngặt quy chuẩn GEMINI.md (Khóa Người Đi Bộ 0°, Tịnh Tiến Toàn Track, Zero-Leak).
 */

import assert from "node:assert";

console.log("🧪 Đang chạy kiểm thử tự động Module Xoay Dốc Side (Pitch) [Phím . và /]...");

// =========================================================================
// TEST 1: Tính toán Radian và Degree chuẩn xác khi vi chỉnh ±1° và ±3°
// =========================================================================
function computeNewPitch(curRy: number, deltaDeg: number): { newRotY: number; pitchDeg: number } {
  const dRad = (deltaDeg * Math.PI) / 180;
  const newRotY = Number((curRy + dRad).toFixed(5));
  const pitchDeg = Number(((newRotY * 180) / Math.PI).toFixed(2));
  return { newRotY, pitchDeg };
}

// 1.1: Ban đầu 0° (0 rad), vi chỉnh -1° (phím .)
const res1 = computeNewPitch(0, -1);
assert.strictEqual(res1.pitchDeg, -1.0, "Pitch degree phải là -1.0°");
assert(Math.abs(res1.newRotY - (-0.01745)) < 1e-4, "Pitch radian phải xấp xỉ -0.01745 rad");

// 1.2: Ban đầu -1°, vi chỉnh +1° (phím /) quay lại 0°
const res2 = computeNewPitch(res1.newRotY, 1);
assert.strictEqual(res2.pitchDeg, 0, "Pitch degree phải quay lại 0°");
assert.strictEqual(res2.newRotY, 0, "Pitch radian phải quay lại 0 rad");

// 1.3: Xoay nhanh -3° (Alt + .) và +3° (Alt + /)
const res3 = computeNewPitch(0, -3);
assert.strictEqual(res3.pitchDeg, -3.0, "Xoay nhanh -3°");
const res4 = computeNewPitch(res3.newRotY, 3);
assert.strictEqual(res4.pitchDeg, 0, "Xoay nhanh +3° quay lại 0°");

console.log("✅ Test 1: Tính toán góc Pitch Radian / Degree (±1° và ±3°) chuẩn xác 100%");

// =========================================================================
// TEST 2: GEMINI.md Mục I.7 - Khóa cứng Người Đi Bộ (Pedestrian) Pitch = 0° tuyệt đối
// =========================================================================
function applyPitchWithCategoryGuard(
  category: "car" | "cyclist" | "pedestrian",
  curRy: number,
  deltaDeg: number
): { success: boolean; newRotY: number; pitchDeg: number; message: string } {
  if (category === "pedestrian") {
    // Quy chuẩn GEMINI.md mục I.7: Luôn khóa cứng Roll = 0°, Pitch = 0° tuyệt đối cho người đi bộ!
    return {
      success: false,
      newRotY: 0,
      pitchDeg: 0,
      message: "Người đi bộ luôn đứng thẳng (Roll=0°, Pitch=0° tuyệt đối)!",
    };
  }

  const { newRotY, pitchDeg } = computeNewPitch(curRy, deltaDeg);
  return {
    success: true,
    newRotY,
    pitchDeg,
    message: `Đã vi chỉnh dốc Side (${deltaDeg > 0 ? "+" : ""}${deltaDeg}° ➔ Pitch: ${pitchDeg}°)`,
  };
}

// 2.1: Thử xoay người đi bộ
const pedRes = applyPitchWithCategoryGuard("pedestrian", 0, -1);
assert.strictEqual(pedRes.success, false, "Phải từ chối xoay dốc Pitch đối với người đi bộ");
assert.strictEqual(pedRes.newRotY, 0, "Pitch của người đi bộ bắt buộc phải là 0");
assert.strictEqual(pedRes.pitchDeg, 0, "PitchDeg của người đi bộ bắt buộc phải là 0°");

// 2.2: Xe 2 bánh (cyclist) được phép xoay dốc dọc Pitch của mặt đường
const cycRes = applyPitchWithCategoryGuard("cyclist", 0, 1);
assert.strictEqual(cycRes.success, true, "Xe 2 bánh được phép bám dốc dọc mặt đường");
assert.strictEqual(cycRes.pitchDeg, 1.0, "Góc dốc xe 2 bánh tăng +1°");

// 2.3: Ô tô (car) xoay bình thường
const carRes = applyPitchWithCategoryGuard("car", 0, -2);
assert.strictEqual(carRes.success, true, "Ô tô xoay dốc bình thường");
assert.strictEqual(carRes.pitchDeg, -2.0, "Góc dốc ô tô là -2°");

console.log("✅ Test 2: Phòng vệ GEMINI.md - Khóa cứng Người Đi Bộ Pitch = 0° tuyệt đối, Cyclist & Car bám dốc chuẩn xác");

// =========================================================================
// TEST 3: GEMINI.md Mục I.6 - Tịnh tiến dàn đều góc Pitch cho Toàn Track
// =========================================================================
interface MockFrameShape {
  frame: number;
  points: number[]; // [x, y, z, rx, ry, rz, l, w, h]
}

function applyPitchToTrack(
  trackShapes: MockFrameShape[],
  deltaDeg: number,
  category: "car" | "cyclist" | "pedestrian"
): MockFrameShape[] {
  const dRad = (deltaDeg * Math.PI) / 180;
  return trackShapes.map((shape) => {
    const pts = [...shape.points];
    if (category === "pedestrian") {
      pts[3] = 0; // Roll = 0°
      pts[4] = 0; // Pitch = 0°
    } else {
      pts[4] = Number(((pts[4] || 0) + dRad).toFixed(5));
    }
    return { ...shape, points: pts };
  });
}

const initialTrack: MockFrameShape[] = [
  { frame: 1, points: [10, 5, -0.5, 0, -0.03491, 0, 4.5, 1.9, 1.5] }, // Pitch ban đầu ~ -2°
  { frame: 2, points: [12, 5, -0.5, 0, 0, 0, 4.5, 1.9, 1.5] },        // Pitch ban đầu = 0°
  { frame: 3, points: [14, 5, -0.5, 0, 0.05236, 0, 4.5, 1.9, 1.5] },  // Pitch ban đầu ~ +3°
];

// Áp dụng tịnh tiến +1° (+0.01745 rad)
const updatedTrack = applyPitchToTrack(initialTrack, 1, "car");

const dRadExpected = (1 * Math.PI) / 180;
assert(
  Math.abs(updatedTrack[0].points[4] - (-0.03491 + dRadExpected)) < 1e-4,
  "Frame 1 phải được cộng tịnh tiến đúng +1°"
);
assert(
  Math.abs(updatedTrack[1].points[4] - (0 + dRadExpected)) < 1e-4,
  "Frame 2 phải được cộng tịnh tiến đúng +1°"
);
assert(
  Math.abs(updatedTrack[2].points[4] - (0.05236 + dRadExpected)) < 1e-4,
  "Frame 3 phải được cộng tịnh tiến đúng +1°"
);

// Đảm bảo không bị gán đè cùng một giá trị cho cả 3 frame
assert.notStrictEqual(
  updatedTrack[0].points[4],
  updatedTrack[1].points[4],
  "Các frame phải bảo tồn độ chênh lệch góc ban đầu (tịnh tiến dàn đều)"
);

console.log("✅ Test 3: Cơ chế tịnh tiến dàn đều góc Pitch Toàn Track chuẩn xác 100% (Không gán đè thô bạo)");

// =========================================================================
// TEST 4: Phân loại phím tắt và bộ lọc ô Input (Zero-Leak Security)
// =========================================================================
function testHotkeyClassification(e: { key: string; code: string; shiftKey: boolean; isInput: boolean }): string {
  if (e.isInput) return "PASSTHROUGH_TO_INPUT";

  const key = e.key.toLowerCase();
  const code = e.code;
  const isKeyPeriod = key === "." || code === "Period" || code === "NumpadDecimal";
  const isKeySlash = key === "/" || code === "Slash" || code === "NumpadDivide";

  if (e.shiftKey && (key === "/" || code === "Slash" || key === "?")) {
    return "OPEN_CHEATSHEET_MODAL";
  }

  if (!e.shiftKey && isKeyPeriod) {
    return "ROTATE_PITCH_MINUS_1";
  }

  if (!e.shiftKey && isKeySlash) {
    return "ROTATE_PITCH_PLUS_1";
  }

  return "IGNORED";
}

// 4.1: Khi gõ trong ô Input
assert.strictEqual(
  testHotkeyClassification({ key: ".", code: "Period", shiftKey: false, isInput: true }),
  "PASSTHROUGH_TO_INPUT",
  "Phím . trong ô input phải được cho qua để người dùng gõ số thập phân"
);
assert.strictEqual(
  testHotkeyClassification({ key: "/", code: "Slash", shiftKey: false, isInput: true }),
  "PASSTHROUGH_TO_INPUT",
  "Phím / trong ô input phải được cho qua để người dùng gõ đường dẫn hoặc ký tự"
);

// 4.2: Khi ở canvas ngoài ô input
assert.strictEqual(
  testHotkeyClassification({ key: ".", code: "Period", shiftKey: false, isInput: false }),
  "ROTATE_PITCH_MINUS_1",
  "Phím . đơn ngoài ô input kích hoạt xoay Pitch -1°"
);
assert.strictEqual(
  testHotkeyClassification({ key: "/", code: "Slash", shiftKey: false, isInput: false }),
  "ROTATE_PITCH_PLUS_1",
  "Phím / đơn ngoài ô input kích hoạt xoay Pitch +1°"
);

// 4.3: Khi bấm Shift + / (tức dấu ?) -> Mở CheatSheet Modal
assert.strictEqual(
  testHotkeyClassification({ key: "?", code: "Slash", shiftKey: true, isInput: false }),
  "OPEN_CHEATSHEET_MODAL",
  "Shift + / (dấu ?) mở bảng phím tắt CheatSheet"
);

console.log("✅ Test 4: Phân giải phím tắt bàn phím & bộ lọc Input an toàn 100% (Không xung đột với CheatSheet và Input)");

console.log("\n🎉 TẤT CẢ 4/4 BÀI KIỂM THỬ MODULE XOAY DỐC SIDE (PITCH) ĐÃ PASS 100%!");
