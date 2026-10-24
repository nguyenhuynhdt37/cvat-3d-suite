import assert from "assert";
import {
  isPointInsideBox3D,
  computePointCloudColors,
  DEFAULT_LABEL_COLORS,
} from "../src/core/geometry.ts";
import type { Box3DTarget } from "../src/core/geometry.ts";

console.log("🧪 Đang chạy kiểm thử tự động Module Point Cloud Colorization...");

// ==========================================
// TEST 1: KIỂM TRA POINT-IN-BOX 3D (ĐỘ CHÍNH XÁC HÌNH HỌC)
// ==========================================
{
  const testBox: Box3DTarget = {
    cx: 10.0,
    cy: 5.0,
    cz: 1.0,
    rz: 0.0, // không xoay
    l: 4.0, // x in [8.0, 12.0]
    w: 2.0, // y in [4.0, 6.0]
    h: 1.5, // z in [0.25, 1.75]
  };

  // Điểm ở tâm box
  assert.strictEqual(isPointInsideBox3D(10.0, 5.0, 1.0, testBox), true, "Điểm ở tâm phải nằm trong box");
  // Điểm ở góc mép
  assert.strictEqual(isPointInsideBox3D(11.9, 5.9, 1.7, testBox), true, "Điểm sát mép trong phải nằm trong box");
  // Điểm ngoài box
  assert.strictEqual(isPointInsideBox3D(12.1, 5.0, 1.0, testBox), false, "Điểm ngoài theo trục X phải false");
  assert.strictEqual(isPointInsideBox3D(10.0, 6.2, 1.0, testBox), false, "Điểm ngoài theo trục Y phải false");
  assert.strictEqual(isPointInsideBox3D(10.0, 5.0, 1.8, testBox), false, "Điểm ngoài theo trục Z phải false");

  // Box có xoay Yaw 90 độ (PI/2)
  const rotatedBox: Box3DTarget = {
    cx: 0.0,
    cy: 0.0,
    cz: 0.0,
    rz: Math.PI / 2, // quay 90 độ: trục L (dài 4m) quay sang trục Y!
    l: 4.0,
    w: 2.0,
    h: 1.0,
  };
  // Khi quay 90 độ, điểm (0, 1.8, 0) nằm trên trục Y sẽ rơi vào trục L local => nằm trong box!
  assert.strictEqual(isPointInsideBox3D(0.0, 1.8, 0.0, rotatedBox), true, "Điểm (0, 1.8, 0) phải nằm trong box xoay 90°");
  // Điểm (1.8, 0, 0) nằm trên trục X sẽ rơi vào trục W local (w/2 = 1.0) => nằm NGOÀI box!
  assert.strictEqual(isPointInsideBox3D(1.8, 0.0, 0.0, rotatedBox), false, "Điểm (1.8, 0, 0) phải nằm ngoài box xoay 90°");

  console.log("✅ Test 1: Kiểm tra Point-in-Box 3D (Tâm, Viền mép, Góc xoay Yaw 90°): Chính xác 100%");
}

// ==========================================
// TEST 2: TÔ MÀU CHẾ ĐỘ INTENSITY (MẶC ĐỊNH)
// ==========================================
{
  // 3 điểm: điểm 1 ngoài box intensity cao (vạch sơn), điểm 2 ngoài box intensity thấp, điểm 3 trong box ô tô
  const positions = new Float32Array([
    0.0, 0.0, 0.0,   // Point 0: Ngoài box, vạch sơn (intensity = 255)
    10.0, 0.0, 0.0,  // Point 1: Ngoài box, mặt đường (intensity = 50)
    20.0, 5.0, 1.0,  // Point 2: Trong box ô tô
  ]);

  const intensities = new Float32Array([255, 50, 128]);

  const boxes: Box3DTarget[] = [
    {
      cx: 20.0,
      cy: 5.0,
      cz: 1.0,
      rz: 0.0,
      l: 4.6,
      w: 1.85,
      h: 1.45,
      category: "car",
    },
  ];

  const colors = computePointCloudColors(positions, intensities, boxes, {
    mode: "intensity",
    colorizeBoxed: true,
  });

  // Point 0 (vạch sơn ngoài box, intensity 255): phải có màu sáng rực rỡ ánh vàng (R=1, G=0.96)
  assert.ok(Math.abs(colors[0] - 1.0) < 1e-4, "Point 0: R phải bằng 1.0");
  assert.ok(Math.abs(colors[1] - 0.96) < 1e-4, "Point 0: G phải bằng 0.96");

  // Point 1 (mặt đường ngoài box, intensity 50): thang xám tương phản
  const expectedV1 = Math.min(1.0, (50 / 255) * 1.25);
  assert.ok(Math.abs(colors[3] - expectedV1) < 1e-4, "Point 1: R phải theo thang xám tương phản");
  assert.ok(Math.abs(colors[4] - expectedV1) < 1e-4, "Point 1: G phải theo thang xám tương phản");

  // Point 2 (trong box ô tô): phải có màu cam hổ phách của xe (R > G > B)
  const carColor = DEFAULT_LABEL_COLORS.car;
  assert.ok(colors[6] > colors[7] && colors[7] > colors[8], "Point 2: Điểm trong xe ô tô phải có tông màu cam hổ phách");
  assert.ok(colors[6] > 0.5, "Point 2: Kênh Đỏ phải sáng rõ");

  console.log("✅ Test 2: Chế độ Intensity (Mặc định): Vạch sơn sáng rực, mặt đường xám, xe bọc màu cam hổ phách");
}

// ==========================================
// TEST 3: CHẾ ĐỘ PLAIN (KHÔNG XÉT INTENSITY)
// ==========================================
{
  const positions = new Float32Array([
    0.0, 0.0, 0.0,   // Point 0: Ngoài box
    10.0, 0.0, 0.0,  // Point 1: Ngoài box
    20.0, 5.0, 1.0,  // Point 2: Trong box ô tô
  ]);

  const intensities = new Float32Array([255, 10, 128]); // Cả điểm 255 lẫn 10 đều phải đồng màu

  const boxes: Box3DTarget[] = [
    {
      cx: 20.0,
      cy: 5.0,
      cz: 1.0,
      rz: 0.0,
      l: 4.6,
      w: 1.85,
      h: 1.45,
      category: "car",
    },
  ];

  const colors = computePointCloudColors(positions, intensities, boxes, {
    mode: "plain",
    colorizeBoxed: true,
  });

  // Cả Point 0 và Point 1 ngoài box phải có màu đồng nhất xám bạc (0.72, 0.76, 0.82)
  assert.ok(Math.abs(colors[0] - 0.72) < 1e-4, "Point 0: R phải bằng 0.72");
  assert.ok(Math.abs(colors[1] - 0.76) < 1e-4, "Point 0: G phải bằng 0.76");
  assert.ok(Math.abs(colors[2] - 0.82) < 1e-4, "Point 0: B phải bằng 0.82");

  assert.ok(Math.abs(colors[3] - 0.72) < 1e-4, "Point 1: R phải bằng 0.72 (đồng màu không xét intensity)");
  assert.ok(Math.abs(colors[4] - 0.76) < 1e-4, "Point 1: G phải bằng 0.76");
  assert.ok(Math.abs(colors[5] - 0.82) < 1e-4, "Point 1: B phải bằng 0.82");

  // Point 2 trong box ô tô vẫn được tô màu xe rõ rệt
  assert.ok(colors[6] > colors[7] && colors[7] > colors[8], "Point 2: Điểm trong xe bọc vẫn giữ màu xe");

  console.log("✅ Test 3: Chế độ Plain: Mọi điểm ngoài box đồng màu xám bạc sáng rõ, không phụ thuộc intensity");
}

// ==========================================
// TEST 4: TẮT NHUỘM MÀU XE BỌC (COLORIZE BOXED = FALSE)
// ==========================================
{
  const positions = new Float32Array([
    20.0, 5.0, 1.0, // Điểm nằm trong box
  ]);
  const intensities = new Float32Array([100]);

  const boxes: Box3DTarget[] = [
    {
      cx: 20.0,
      cy: 5.0,
      cz: 1.0,
      rz: 0.0,
      l: 4.6,
      w: 1.85,
      h: 1.45,
      category: "car",
    },
  ];

  const colors = computePointCloudColors(positions, intensities, boxes, {
    mode: "plain",
    colorizeBoxed: false, // Tắt tô màu box
  });

  // Khi tắt, điểm trong box cũng có màu plain bình thường
  assert.ok(Math.abs(colors[0] - 0.72) < 1e-4, "Điểm trong box khi tắt colorizeBoxed phải có màu plain");
  assert.ok(Math.abs(colors[1] - 0.76) < 1e-4, "G phải là 0.76");
  assert.ok(Math.abs(colors[2] - 0.82) < 1e-4, "B phải là 0.82");

  console.log("✅ Test 4: Tắt Nhuộm Màu Xe Bọc (colorizeBoxed = false): Toàn bộ scene trở về màu thuần nhất");
}

// ==========================================
// TEST 5: KIỂM THỬ HIỆU NĂNG TÍNH TOÁN 100.000 ĐIỂM
// ==========================================
{
  const N = 100_000;
  const positions = new Float32Array(N * 3);
  const intensities = new Float32Array(N);

  for (let i = 0; i < N; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 100;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 100;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 10;
    intensities[i] = Math.floor(Math.random() * 255);
  }

  // 15 3D Boxes rải rác
  const boxes: Box3DTarget[] = [];
  for (let k = 0; k < 15; k++) {
    boxes.push({
      cx: (Math.random() - 0.5) * 80,
      cy: (Math.random() - 0.5) * 80,
      cz: (Math.random() - 0.5) * 5,
      rz: Math.random() * Math.PI,
      l: 4.5,
      w: 1.85,
      h: 1.5,
      category: k % 2 === 0 ? "car" : "pedestrian",
    });
  }

  const t0 = performance.now();
  const colors = computePointCloudColors(positions, intensities, boxes, {
    mode: "intensity",
    colorizeBoxed: true,
  });
  const t1 = performance.now();
  const elapsedMs = t1 - t0;

  assert.strictEqual(colors.length, N * 3, "Số lượng kênh màu phải là N * 3");
  assert.ok(elapsedMs < 35, `Thời gian tính toán 100.000 điểm phải < 35ms (thực tế: ${elapsedMs.toFixed(2)}ms)`);

  console.log(`✅ Test 5: Hiệu Năng Xử Lý 100.000 Điểm & 15 Boxes: ${elapsedMs.toFixed(2)}ms (Siêu tốc, đảm bảo 60 FPS!)`);
}

console.log("\n🎉 TẤT CẢ 5/5 BÀI KIỂM THỬ MODULE POINT CLOUD COLORIZATION ĐÃ PASS 100%!");
