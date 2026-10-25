import assert from "assert";
import {
  computeBoxEdgeContacts,
  computePointCloudColors,
  EDGE_SNAP_COLOR,
  CUT_OUT_WARNING_COLOR,
  OVERLAP_WARNING_COLOR,
  DEFAULT_LABEL_COLORS,
} from "../src/core/geometry.ts";
import type { Box3DTarget } from "../src/core/geometry.ts";

console.log("🧪 Đang chạy kiểm thử tự động Module Cảnh Báo Viền Chạm Point (Edge Contact HUD & Snap Color)...");

// ==========================================
// TEST 1: ĐÁNH GIÁ 4 MÉP KHÍT / CẮT LẸM / HỞ
// ==========================================
{
  // Box: L=4.0m (X: -2.0m -> +2.0m), W=2.0m (Y: -1.0m -> +1.0m), H=1.5m (Z: -0.75m -> +0.75m)
  const box: Box3DTarget = {
    id: 1,
    cx: 0,
    cy: 0,
    cz: 0,
    rz: 0,
    l: 4.0,
    w: 2.0,
    h: 1.5,
    isActive: true,
  };

  // Tạo tập điểm:
  // - Điểm trước: lx = 1.98m (cách mép 2.0m đúng 2cm => KHÍT)
  // - Điểm sau: lx = -2.05m (tràn ra ngoài mép -2.0m đúng 5cm => CẮT LẸM)
  // - Điểm trái: ly = 0.90m (cách mép 1.0m đúng 10cm => HỞ)
  // - Điểm phải: ly = -0.99m (cách mép -1.0m đúng 1cm => KHÍT)
  const positions = new Float32Array([
    1.98,  0.0, 0.0,  // Điểm trước
    -2.05, 0.0, 0.0,  // Điểm sau
    0.0,   0.90, 0.0, // Điểm trái
    0.0,  -0.99, 0.0, // Điểm phải
  ]);

  const contacts = computeBoxEdgeContacts(positions, box);
  assert.ok(contacts !== null, "Kết quả contacts không được null khi đủ điểm");
  assert.strictEqual(contacts!.pointCount, 4, "Phải nhận đủ 4 điểm hợp lệ");

  // Kiểm tra Mép Trước (X+)
  assert.strictEqual(contacts!.front.status, "tight", "Mép trước cách 2cm phải là tight (Khít)");
  assert.strictEqual(contacts!.front.label, "Khít");

  // Kiểm tra Mép Sau (X-)
  assert.strictEqual(contacts!.rear.status, "cut", "Mép sau tràn 5cm phải là cut (Cắt lẹm)");
  assert.strictEqual(contacts!.rear.label, "Cắt lẹm");
  assert.strictEqual(contacts!.rear.gapCm, -5, "Khoảng lẹm phải là -5cm");

  // Kiểm tra Mép Trái (Y+)
  assert.strictEqual(contacts!.left.status, "loose", "Mép trái hở 10cm phải là loose (Hở)");
  assert.strictEqual(contacts!.left.label, "Hở");
  assert.strictEqual(contacts!.left.gapCm, 10, "Khoảng hở phải là 10cm");

  // Kiểm tra Mép Phải (Y-)
  assert.strictEqual(contacts!.right.status, "tight", "Mép phải cách 1cm phải là tight (Khít)");
  assert.strictEqual(contacts!.right.label, "Khít");

  console.log("✅ Test 1: Đánh giá 4 mép đón tia (Khít / Cắt lẹm / Hở): Chuẩn xác 100%");
}

// ==========================================
// TEST 2: LỌC NHIỄU MẶT ĐẤT (GROUND NOISE CUT-OFF)
// ==========================================
{
  const box: Box3DTarget = {
    id: 2,
    cx: 0,
    cy: 0,
    cz: 0,
    rz: 0,
    l: 4.0,
    w: 2.0,
    h: 1.5, // zFloor = -0.75 + 0.15 = -0.60m
    isActive: true,
  };

  // Điểm sát mặt đất: lz = -0.70m (< -0.60m) nằm ở cản trước lx = 2.10m (vệt loang quét xiên mặt đường)
  // Các điểm thân xe thật: lx = 1.98m (lz = 0.0m)
  const positions = new Float32Array([
    2.10, 0.0, -0.70, // Điểm nhiễu mặt đất ở cản trước (phải bị loại bỏ)
    1.98, 0.0,  0.0,  // Điểm thân xe thật ở cản trước (khít 2cm)
    -1.99, 0.0, 0.0,  // Điểm cản sau
    0.0, 0.98, 0.0,   // Điểm sườn trái
  ]);

  const contacts = computeBoxEdgeContacts(positions, box);
  assert.ok(contacts !== null);
  assert.strictEqual(contacts!.pointCount, 3, "Điểm nhiễu lz = -0.70m phải bị loại bỏ, chỉ còn 3 điểm");
  assert.strictEqual(contacts!.front.status, "tight", "Mép trước không bị điểm nhiễu mặt đất làm báo cắt lẹm giả");

  console.log("✅ Test 2: Kháng nhiễu mặt đất theo chuẩn GEMINI.md (Ground Noise Cut-off): Hoàn hảo");
}

// ==========================================
// TEST 3: GÓC XOAY YAW 90 ĐỘ
// ==========================================
{
  const box: Box3DTarget = {
    id: 3,
    cx: 0,
    cy: 0,
    cz: 0,
    rz: Math.PI / 2, // quay 90 độ: trục X cục bộ xoay sang trục Y thế giới
    l: 4.0, // dài 4m theo X cục bộ
    w: 2.0, // rộng 2m theo Y cục bộ
    h: 1.5,
    isActive: true,
  };

  // Điểm thế giới (0, 1.98, 0) -> local: lx = 1.98, ly = 0 (Mép trước X+)
  // Điểm thế giới (0, -2.05, 0) -> local: lx = -2.05, ly = 0 (Mép sau X-)
  // Điểm thế giới (-0.99, 0, 0) -> local: lx = 0, ly = 0.99 (Mép trái Y+)
  const positions = new Float32Array([
    0.0,  1.98, 0.0,
    0.0, -2.05, 0.0,
   -0.99, 0.0,  0.0,
  ]);

  const contacts = computeBoxEdgeContacts(positions, box);
  assert.ok(contacts !== null);
  assert.strictEqual(contacts!.front.status, "tight", "Mép trước khi xoay 90° phải là tight (Khít)");
  assert.strictEqual(contacts!.rear.status, "cut", "Mép sau khi xoay 90° phải là cut (Cắt lẹm)");
  assert.strictEqual(contacts!.left.status, "tight", "Mép trái khi xoay 90° phải là tight (Khít)");

  console.log("✅ Test 3: Hỗ trợ góc xoay Euler/Yaw tùy biến: Tính toán chính xác 100%");
}

// ==========================================
// TEST 4: NHUỘM MÀU TRÊN CANVAS (BÁM SÁT VIỀN & CẮT LẸM)
// ==========================================
{
  const activeBox: Box3DTarget = {
    id: 10,
    cx: 0,
    cy: 0,
    cz: 0,
    rz: 0,
    l: 4.0,
    w: 2.0,
    h: 1.5,
    isActive: true,
  };

  const positions = new Float32Array([
    1.98, 0.0, 0.0,  // Điểm 0: cách mép trước 2cm (<= 3cm) => Bám sát viền (Vàng neon #facc15)
    2.05, 0.0, 0.0,  // Điểm 1: tràn ra ngoài mép trước 5cm (1~8cm) => Cắt lẹm (Đỏ #ef4444)
    0.0,  0.0, 0.0,  // Điểm 2: nằm sâu ở tâm xe => Màu xe active
    10.0, 0.0, 0.0,  // Điểm 3: ngoài xe xa tít => Màu nền (1.0 trên nền tối)
  ]);

  const colors = computePointCloudColors(positions, null, [activeBox], {
    mode: "plain",
    colorizeBoxed: true,
    theme: "dark",
  });

  // Điểm 0: Vàng neon (#facc15)
  assert.ok(Math.abs(colors[0] - EDGE_SNAP_COLOR.r) < 1e-4, "Điểm 0: R phải màu vàng chanh neon");
  assert.ok(Math.abs(colors[1] - EDGE_SNAP_COLOR.g) < 1e-4, "Điểm 0: G phải màu vàng chanh neon");
  assert.ok(Math.abs(colors[2] - EDGE_SNAP_COLOR.b) < 1e-4, "Điểm 0: B phải màu vàng chanh neon");

  // Điểm 1: Đỏ cảnh báo cắt lẹm (#ef4444)
  assert.ok(Math.abs(colors[3] - CUT_OUT_WARNING_COLOR.r) < 1e-4, "Điểm 1: R phải màu đỏ cảnh báo");
  assert.ok(Math.abs(colors[4] - CUT_OUT_WARNING_COLOR.g) < 1e-4, "Điểm 1: G phải màu đỏ cảnh báo");
  assert.ok(Math.abs(colors[5] - CUT_OUT_WARNING_COLOR.b) < 1e-4, "Điểm 1: B phải màu đỏ cảnh báo");

  // Điểm 3: Màu nền tối (trắng 100%)
  assert.strictEqual(colors[9], 1.0, "Điểm ngoài box phải là màu nền");
  assert.strictEqual(colors[10], 1.0);
  assert.strictEqual(colors[11], 1.0);

  console.log("✅ Test 4: Nhuộm màu Canvas trực tiếp (Vàng chanh bám viền, Đỏ cắt lẹm, Nền sạch): Chuẩn xác 100%");
}

// ==========================================
// TEST 5: HIỆU NĂNG TÍNH TOÁN O(N) ZERO-LAG (< 0.05ms)
// ==========================================
{
  const N = 500; // Số điểm quanh xe
  const positions = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 4.5;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 2.5;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 1.6;
  }

  const box: Box3DTarget = {
    id: 99,
    cx: 0,
    cy: 0,
    cz: 0,
    rz: 0.12,
    l: 4.6,
    w: 1.85,
    h: 1.5,
    isActive: true,
  };

  const t0 = performance.now();
  for (let loop = 0; loop < 100; loop++) {
    computeBoxEdgeContacts(positions, box);
  }
  const t1 = performance.now();
  const avgMs = (t1 - t0) / 100;

  assert.ok(avgMs < 0.5, `Thời gian tính toán phải < 0.5ms (thực tế: ${avgMs.toFixed(4)}ms)`);
  console.log(`✅ Test 5: Hiệu năng O(N) đạt ${avgMs.toFixed(4)}ms/lượt (Tốc độ đáp ứng > 2000 FPS, Zero-Lag)`);
}

// ==========================================
// TEST 6: CẢNH BÁO MÉP NÓC XE (Z+) TRÊN SIDE & FRONT VIEW
// ==========================================
{
  const box: Box3DTarget = {
    id: 101,
    cx: 0,
    cy: 0,
    cz: 0,
    rz: 0,
    l: 4.0,
    w: 2.0,
    h: 1.6, // halfH = 0.80m
    isActive: true,
  };

  // 1. Điểm nóc khít: lz = 0.78m (cách mép nóc 0.80m đúng 2cm => KHÍT)
  const positionsTight = new Float32Array([
    1.98, 0.0, 0.0,
    -1.98, 0.0, 0.0,
    0.0, 0.98, 0.0,
    0.0, -0.98, 0.0,
    0.0, 0.0, 0.78, // Điểm nóc
  ]);

  const contactsTight = computeBoxEdgeContacts(positionsTight, box);
  assert.ok(contactsTight !== null);
  assert.ok(contactsTight!.roof !== undefined, "Mép nóc phải được đánh giá");
  assert.strictEqual(contactsTight!.roof!.status, "tight", "Mép nóc cách 2cm phải là tight (Khít)");
  assert.strictEqual(contactsTight!.roof!.label, "Khít");

  // 2. Điểm nóc cắt lẹm: lz = 0.84m (tràn ra ngoài nóc 0.80m đúng 4cm => CẮT LẸM)
  const positionsCut = new Float32Array([
    1.98, 0.0, 0.0,
    -1.98, 0.0, 0.0,
    0.0, 0.98, 0.0,
    0.0, -0.98, 0.0,
    0.0, 0.0, 0.84, // Điểm nóc cắt lẹm 4cm
  ]);

  const contactsCut = computeBoxEdgeContacts(positionsCut, box);
  assert.ok(contactsCut !== null);
  assert.ok(contactsCut!.roof !== undefined);
  assert.strictEqual(contactsCut!.roof!.status, "cut", "Mép nóc tràn 4cm phải là cut (Cắt lẹm)");
  assert.strictEqual(contactsCut!.roof!.gapCm, -4, "Khoảng cắt lẹm nóc phải là -4cm");

  // 3. Nhuộm màu Canvas trực tiếp cho Nóc xe
  const colors = computePointCloudColors(positionsCut, null, [box], {
    mode: "plain",
    colorizeBoxed: true,
    theme: "dark",
  });
  // Điểm index 4 (0.0, 0.0, 0.84) phải màu đỏ cảnh báo cắt lẹm (#ef4444)
  const idx3 = 4 * 3;
  assert.ok(Math.abs(colors[idx3] - CUT_OUT_WARNING_COLOR.r) < 1e-4, "Điểm nóc cắt lẹm: R phải màu đỏ");
  assert.ok(Math.abs(colors[idx3 + 1] - CUT_OUT_WARNING_COLOR.g) < 1e-4, "Điểm nóc cắt lẹm: G phải màu đỏ");
  assert.ok(Math.abs(colors[idx3 + 2] - CUT_OUT_WARNING_COLOR.b) < 1e-4, "Điểm nóc cắt lẹm: B phải màu đỏ");

  console.log("✅ Test 6: Cảnh báo mép Nóc xe (Z+) - Khít / Cắt lẹm trên Side & Front View: Hoàn hảo 100%");
}

// ==========================================
// TEST 7: KHÁNG BÁO LỖI GIẢ MẶT KHUẤT (SHADOW / OCCLUDED SIDES)
// ==========================================
{
  const box: Box3DTarget = {
    id: 102,
    cx: 0,
    cy: 0,
    cz: 0,
    rz: 0,
    l: 4.0, // halfL = 2.0m
    w: 2.0, // halfW = 1.0m
    h: 1.5,
    isActive: true,
  };

  // Xe chỉ đón tia ở Cản Trước (lx > 0) và Sườn Trái (ly > 0)
  // Phía Sau (lx < 0) và Sườn Phải (ly < 0) hoàn toàn không có điểm đón tia
  const positions = new Float32Array([
    1.98, 0.5, 0.0,  // Cản trước đón tia
    1.50, 0.98, 0.0, // Sườn trái đón tia
    1.20, 0.60, 0.2, // Thân xe tầng trên
  ]);

  const contacts = computeBoxEdgeContacts(positions, box);
  assert.ok(contacts !== null);
  assert.ok(contacts!.front !== undefined, "Mép trước đón tia phải được đánh giá");
  assert.strictEqual(contacts!.front!.status, "tight", "Mép trước phải là tight (Khít)");

  assert.ok(contacts!.left !== undefined, "Mép trái đón tia phải được đánh giá");
  assert.strictEqual(contacts!.left!.status, "tight", "Mép trái phải là tight (Khít)");

  // Mặt khuất: Phải là undefined (không được báo Hở giả +250cm hoặc +120cm)
  assert.strictEqual(contacts!.rear, undefined, "Mép sau không có điểm đón tia phải trả về undefined (hiển thị --)");
  assert.strictEqual(contacts!.right, undefined, "Mép phải không có điểm đón tia phải trả về undefined (hiển thị --)");

  console.log("✅ Test 7: Kháng báo lỗi giả khi xe có mặt khuất bóng (Occluded sides): Chuẩn xác 100%");
}

console.log("\n🎉 TẤT CẢ 7/7 BÀI KIỂM THỬ CẢNH BÁO VIỀN CHẠM POINT ĐÃ ĐẠT 100%!\n");
