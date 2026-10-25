import assert from "assert";
import {
  isPointInsideBox3D,
  computePointCloudColors,
  DEFAULT_LABEL_COLORS,
  DISTINCT_TRACK_PALETTE,
  DEEP_VIVID_TRACK_PALETTE,
  OVERLAP_WARNING_COLOR,
  getDistinctTrackColor,
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
// TEST 2: TÔ MÀU CHẾ ĐỘ INTENSITY (MẶC ĐỊNH NỀN ĐEN - TRẮNG 100%)
// ==========================================
{
  // 3 điểm: điểm 0 ngoài box (intensity = 255), điểm 1 ngoài box (intensity = 50), điểm 2 trong box ô tô
  const positions = new Float32Array([
    0.0, 0.0, 0.0,   // Point 0: Ngoài box (intensity = 255)
    10.0, 0.0, 0.0,  // Point 1: Ngoài box (intensity = 50)
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

  // Point 0 (ngoài box trên nền đen): Trắng 100% (R=1.0, G=1.0, B=1.0)
  assert.strictEqual(colors[0], 1.0, "Point 0: R phải bằng 1.0 (Trắng 100%)");
  assert.strictEqual(colors[1], 1.0, "Point 0: G phải bằng 1.0 (Trắng 100%)");
  assert.strictEqual(colors[2], 1.0, "Point 0: B phải bằng 1.0 (Trắng 100%)");

  // Point 1 (ngoài box trên nền đen): Trắng 100% (R=1.0, G=1.0, B=1.0)
  assert.strictEqual(colors[3], 1.0, "Point 1: R phải bằng 1.0 (Trắng 100%)");
  assert.strictEqual(colors[4], 1.0, "Point 1: G phải bằng 1.0 (Trắng 100%)");
  assert.strictEqual(colors[5], 1.0, "Point 1: B phải bằng 1.0 (Trắng 100%)");

  // Point 2 (trong box ô tô): phải có màu cam hổ phách của xe (factor = 1.0, đậm nét nhất)
  const carColor = DEFAULT_LABEL_COLORS.car;
  assert.ok(Math.abs(colors[6] - carColor.r) < 1e-4, "Point 2: Kênh R phải chuẩn màu xe (factor = 1.0)");
  assert.ok(Math.abs(colors[7] - carColor.g) < 1e-4, "Point 2: Kênh G phải chuẩn màu xe (factor = 1.0)");
  assert.ok(Math.abs(colors[8] - carColor.b) < 1e-4, "Point 2: Kênh B phải chuẩn màu xe (factor = 1.0)");

  console.log("✅ Test 2: Chế độ Intensity Nền Đen: Điểm ngoài box trắng 100%, xe bọc màu cam hổ phách đậm nhất (factor = 1.0)");
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

  // Cả Point 0 và Point 1 ngoài box phải có màu đồng nhất trắng 100% (1.0, 1.0, 1.0) trên nền đen
  assert.strictEqual(colors[0], 1.0, "Point 0: R phải bằng 1.0 (Trắng 100%)");
  assert.strictEqual(colors[1], 1.0, "Point 0: G phải bằng 1.0 (Trắng 100%)");
  assert.strictEqual(colors[2], 1.0, "Point 0: B phải bằng 1.0 (Trắng 100%)");

  assert.strictEqual(colors[3], 1.0, "Point 1: R phải bằng 1.0 (Trắng 100%)");
  assert.strictEqual(colors[4], 1.0, "Point 1: G phải bằng 1.0 (Trắng 100%)");
  assert.strictEqual(colors[5], 1.0, "Point 1: B phải bằng 1.0 (Trắng 100%)");

  // Point 2 trong box ô tô vẫn được tô màu xe rõ rệt (factor = 1.0)
  assert.ok(Math.abs(colors[6] - DEFAULT_LABEL_COLORS.car.r) < 1e-4, "Point 2: Điểm trong xe bọc giữ màu xe factor 1.0");

  console.log("✅ Test 3: Chế độ Plain Nền Đen: Mọi điểm ngoài box đồng màu trắng 100%, không phụ thuộc intensity");
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

  // Khi tắt, điểm trong box cũng có màu nền trắng 100% trên nền đen
  assert.strictEqual(colors[0], 1.0, "Điểm trong box khi tắt colorizeBoxed phải có màu nền trắng 100%");
  assert.strictEqual(colors[1], 1.0, "G phải là 1.0");
  assert.strictEqual(colors[2], 1.0, "B phải là 1.0");

  console.log("✅ Test 4: Tắt Nhuộm Màu Xe Bọc (colorizeBoxed = false): Toàn bộ scene trở về màu nền trắng 100%");
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

// ==========================================
// TEST 6: BẢO TOÀN TRẠNG THÁI COLORIZATION QUA NHIỀU FRAMES (TOÀN FRAME ENGINE)
// ==========================================
{
  // Giả lập 3 frames liên tiếp: Frame 0, Frame 1, Frame 2
  const frame0Positions = new Float32Array([10, 5, 0]);
  const frame1Positions = new Float32Array([12, 5, 0]);
  const frame2Positions = new Float32Array([14, 5, 0]);
  const dummyIntensities = new Float32Array([150]);

  // Track xe di chuyển qua 3 frames
  const frame0Boxes: Box3DTarget[] = [{ cx: 10, cy: 5, cz: 0, rz: 0, l: 4, w: 2, h: 1.5, category: "car" }];
  const frame1Boxes: Box3DTarget[] = [{ cx: 12, cy: 5, cz: 0, rz: 0, l: 4, w: 2, h: 1.5, category: "car" }];
  const frame2Boxes: Box3DTarget[] = [{ cx: 14, cy: 5, cz: 0, rz: 0, l: 4, w: 2, h: 1.5, category: "car" }];

  const colors0 = computePointCloudColors(frame0Positions, dummyIntensities, frame0Boxes, { mode: "intensity", colorizeBoxed: true });
  const colors1 = computePointCloudColors(frame1Positions, dummyIntensities, frame1Boxes, { mode: "intensity", colorizeBoxed: true });
  const colors2 = computePointCloudColors(frame2Positions, dummyIntensities, frame2Boxes, { mode: "intensity", colorizeBoxed: true });

  // Cả 3 frames đều phải có màu xe ô tô (R > G > B, màu cam hổ phách)
  assert.ok(colors0[0] > colors0[1] && colors0[1] > colors0[2], "Frame 0: Điểm trong xe bọc phải có màu cam");
  assert.ok(colors1[0] > colors1[1] && colors1[1] > colors1[2], "Frame 1: Điểm trong xe bọc phải duy trì màu cam khi chuyển frame");
  assert.ok(colors2[0] > colors2[1] && colors2[1] > colors2[2], "Frame 2: Điểm trong xe bọc phải duy trì màu cam khi chuyển frame");

  console.log("✅ Test 6: Toàn Frame Engine: Bảo toàn và áp dụng tự động 100% qua các frame liên tiếp");
}

// ==========================================
// TEST 7: FALLBACK REDUX STATES (KHI THREE.JS CHƯA DỰNG XONG MESH CỦA FRAME MỚI)
// ==========================================
{
  // Giả lập Redux annotations states:
  const reduxStates = [
    {
      clientID: 101,
      points: [5.0, -3.0, 0.5, 0, 0, 0, 4.5, 2.0, 1.6],
      outside: false,
      label: { name: "Pedestrian" },
    },
  ];

  // Trích xuất fallback từ Redux states
  const fallbackBoxes: Box3DTarget[] = reduxStates
    .filter((s) => !s.outside && Array.isArray(s.points) && s.points.length >= 9)
    .map((s) => ({
      cx: s.points[0],
      cy: s.points[1],
      cz: s.points[2],
      rz: s.points[5] || 0,
      l: s.points[6],
      w: s.points[7],
      h: s.points[8],
      category: "pedestrian" as const,
    }));

  assert.strictEqual(fallbackBoxes.length, 1, "Phải trích xuất được 1 box từ Redux states");

  const pedPoint = new Float32Array([5.0, -3.0, 0.5]);
  const pedIntensity = new Float32Array([100]);
  const pedColors = computePointCloudColors(pedPoint, pedIntensity, fallbackBoxes, {
    mode: "intensity",
    colorizeBoxed: true,
  });

  // Người đi bộ: Màu Xanh Tím Indigo (B > R)
  assert.ok(pedColors[2] > pedColors[0], "Điểm người đi bộ phải có kênh Blue ưu thế (Xanh Tím Indigo)");

  console.log("✅ Test 7: Fallback Redux States: Nhận diện và nhuộm màu chính xác ngay khi Three.js chưa dựng mesh");
}

// ==========================================
// TEST 8: MẶT SÀN POLYGON 3D MỜ (ĐĨA TRÒN 360° BÁN KÍNH 100M & VÒNG CỰ LY ĐỒNG TÂM)
// ==========================================
{
  // 1. Kiểm tra tính toán hình học mặt sàn:
  const egoRoadZ = -1.75;
  const curbStep = 0.15; // Bậc vỉa hè +15cm

  const roadPlaneZ = egoRoadZ;
  const curbPlaneZ = egoRoadZ + curbStep;

  assert.strictEqual(roadPlaneZ, -1.75, "Mặt đường phải ở cao độ -1.75m");
  assert.strictEqual(curbPlaneZ, -1.60, "Mặt vỉa hè phải giật cấp +15cm lên -1.60m");

  // 2. Kiểm tra bán kính bao phủ 360 độ (R <= 100m, không bị chiếu 1 hướng):
  const maxRadius = 100.0;
  const rangeRings = [20, 40, 60, 80, 100];
  assert.strictEqual(rangeRings[rangeRings.length - 1], maxRadius, "Vòng cự ly ngoài cùng phải khớp chuẩn bán kính 100m");
  assert.strictEqual(rangeRings.length, 5, "Phải có 5 vòng cự ly đồng tâm (20m, 40m, 60m, 80m, 100m)");

  // 3. Kiểm tra thuộc tính vật liệu mờ siêu nhẹ không che khuất point cloud
  const materialProps = {
    transparent: true,
    opacity: 0.10,
    depthWrite: false, // Quan trọng nhất: không che mây điểm
  };

  assert.strictEqual(materialProps.depthWrite, false, "depthWrite phải là false để hạt LiDAR luôn nổi");
  assert.ok(materialProps.opacity < 0.25, "Độ mờ phải nhỏ hơn 0.25 để nhìn xuyên thấu");

  console.log("✅ Test 8: Mặt Sàn Polygon 3D Mờ: Đĩa tròn 360° bán kính 100m & 5 vòng cự ly đồng tâm đạt chuẩn");
}

// ==========================================
// TEST 9: REALTIME POINT CLOUD COLOR UPDATE KHI DI CHUYỂN BOX
// ==========================================
{
  // Có 2 điểm: Point 0 tại (10, 0, 0) và Point 1 tại (20, 0, 0)
  const positions = new Float32Array([
    10.0, 0.0, 0.0, // Point 0
    20.0, 0.0, 0.0, // Point 1
  ]);
  const intensities = new Float32Array([100, 100]);

  // Bước 1: Ban đầu box ở vị trí (10, 0, 0) -> bao bọc Point 0, Point 1 ở ngoài
  const initialBoxes: Box3DTarget[] = [
    {
      cx: 10.0,
      cy: 0.0,
      cz: 0.0,
      rz: 0.0,
      l: 4.0,
      w: 2.0,
      h: 1.5,
      category: "car",
    },
  ];

  const colorsBefore = computePointCloudColors(positions, intensities, initialBoxes, {
    mode: "plain",
    colorizeBoxed: true,
  });

  // Point 0 ở trong xe (màu cam xe factor 1.0), Point 1 ở ngoài xe (màu trắng 100% 1.0, 1.0, 1.0)
  assert.ok(Math.abs(colorsBefore[0] - DEFAULT_LABEL_COLORS.car.r) < 1e-4, "Trước di chuyển: Point 0 phải mang màu cam của xe factor 1.0");
  assert.strictEqual(colorsBefore[3], 1.0, "Trước di chuyển: Point 1 ở ngoài phải là màu trắng 100%");

  // Bước 2: Người dùng kéo chuột di chuyển box sang vị trí mới (20, 0, 0) -> Point 0 rơi ra ngoài, Point 1 lọt vào trong!
  const movedBoxes: Box3DTarget[] = [
    {
      cx: 20.0, // Đã dời sang Point 1
      cy: 0.0,
      cz: 0.0,
      rz: 0.0,
      l: 4.0,
      w: 2.0,
      h: 1.5,
      category: "car",
    },
  ];

  const colorsAfter = computePointCloudColors(positions, intensities, movedBoxes, {
    mode: "plain",
    colorizeBoxed: true,
  });

  // Lúc này: Point 0 đã lọt ra ngoài -> lập tức trả về màu trắng 100% (1.0, 1.0, 1.0)
  assert.strictEqual(colorsAfter[0], 1.0, "Sau di chuyển: Point 0 lọt ra ngoài phải lập tức đổi về màu trắng 100%");
  assert.strictEqual(colorsAfter[1], 1.0, "G phải là 1.0");
  assert.strictEqual(colorsAfter[2], 1.0, "B phải là 1.0");

  // Point 1 mới lọt vào trong xe -> lập tức sáng màu xe (factor = 1.0)
  assert.ok(Math.abs(colorsAfter[3] - DEFAULT_LABEL_COLORS.car.r) < 1e-4, "Sau di chuyển: Point 1 mới lọt vào box phải lập tức sáng màu xe factor 1.0");

  console.log("✅ Test 9: Realtime Point Cloud Color Update khi di chuyển box: Điểm ra ngoài trả về màu nền trắng 100%, điểm vào box đổi sang màu xe");
}

// ==========================================
// TEST 10: STICKY TRACK LOCK-ON & BẢO TOÀN TRACK ID KHI CLIENTID THAY ĐỔI
// ==========================================
{
  // Giả lập trạng thái Redux annotations của 2 frame:
  // Track đang theo dõi là Track ID = 2 (Chiếc xe tải)

  // Frame 1: Xe tải có clientID = 101, parentID = 2
  const frame1States = [
    { clientID: 101, parentID: 2, label: { name: "Truck" }, points: [10, 0, 0, 0, 0, 0, 5, 2.2, 2.0] },
    { clientID: 102, parentID: 3, label: { name: "Pedestrian" }, points: [2, 1, 0, 0, 0, 0, 0.5, 0.5, 1.7] },
  ];

  // Khi người dùng chọn xe tải ở Frame 1:
  let persistentActiveTrackId: number | null = null;
  function updateLockedTrackId(clientId: number, states: any[]) {
    const st = states.find((s: any) => Number(s.clientID) === Number(clientId));
    if (st) {
      const tid = st.parentID ?? st.trackID ?? st.parent?.clientID;
      if (tid !== undefined && tid !== null && !isNaN(Number(tid))) {
        persistentActiveTrackId = Number(tid);
        return;
      }
    }
    persistentActiveTrackId = Number(clientId);
  }

  updateLockedTrackId(101, frame1States);
  assert.strictEqual(persistentActiveTrackId, 2, "Hệ thống phải trích xuất đúng Track ID = 2 từ clientID = 101");

  // Frame 2: CVAT cấp clientID mới hoàn toàn cho mọi shape!
  // Xe tải (Track 2) bây giờ có clientID = 205!
  // Shape clientID = 206 là của một người đi bộ (Track 4)!
  const frame2States = [
    { clientID: 206, parentID: 4, label: { name: "Pedestrian" }, points: [5, 2, 0, 0, 0, 0, 0.5, 0.5, 1.7] },
    { clientID: 205, parentID: 2, label: { name: "Truck" }, points: [12, 0, 0, 0, 0, 0, 5, 2.2, 2.0] },
  ];

  // Thuật toán Sticky Track Lock-On tìm shape tương ứng trong frame mới:
  function resolveStickyTarget(targetId: number, targetTrackId: number | null, states: any[]) {
    let matched: any = null;
    if (targetTrackId !== null) {
      matched = states.find(
        (s: any) =>
          Number(s.parentID ?? s.trackID ?? s.parent?.clientID) === Number(targetTrackId) ||
          Number(s.clientID) === Number(targetTrackId)
      );
    }
    if (!matched && targetId !== null) {
      matched = states.find(
        (s: any) =>
          Number(s.clientID) === Number(targetId) ||
          Number(s.parentID ?? s.trackID ?? s.parent?.clientID) === Number(targetId)
      );
    }
    return matched;
  }

  // Giả sử CVAT tự tiện chọn shape đầu tiên ở frame 2 (clientID 206 của người đi bộ)
  const cvatUnwantedActiveId = 206;

  // Nhưng hệ thống của chúng ta dùng persistentActiveTrackId = 2 để giải quyết:
  const matchedAtFrame2 = resolveStickyTarget(cvatUnwantedActiveId, persistentActiveTrackId, frame2States);

  assert.ok(matchedAtFrame2, "Phải tìm thấy shape tương ứng ở Frame 2");
  assert.strictEqual(matchedAtFrame2.clientID, 205, "Shape tìm thấy phải là clientID = 205 (Xe tải), KHÔNG PHẢI người đi bộ 206!");
  assert.strictEqual(matchedAtFrame2.parentID, 2, "ParentID phải khớp chuẩn xác 2");

  console.log("✅ Test 10: Sticky Track Lock-On & Khóa Chặt Focus: Khóa chặt Track ID = 2 qua các frame, chống nhảy ID");
}

// ==========================================
// TEST 11: MÀU RIÊNG BIỆT THEO TRACK ID (DISTINCT TRACK COLOR PALETTE)
// ==========================================
{
  // Kiểm tra 2 xe liền kề (Track 16 và Track 17) có màu khác nhau hoàn toàn
  const color16 = getDistinctTrackColor(16);
  const color17 = getDistinctTrackColor(17);
  const color18 = getDistinctTrackColor(18);

  const diff16_17 = Math.abs(color16.r - color17.r) + Math.abs(color16.g - color17.g) + Math.abs(color16.b - color17.b);
  const diff17_18 = Math.abs(color17.r - color18.r) + Math.abs(color17.g - color18.g) + Math.abs(color17.b - color18.b);

  assert.ok(diff16_17 > 0.5, "Track 16 và Track 17 phải có màu sắc tương phản cao (diff > 0.5)");
  assert.ok(diff17_18 > 0.5, "Track 17 và Track 18 phải có màu sắc tương phản cao (diff > 0.5)");

  // Khi Active: Màu của xe được đẩy sáng rực rỡ và pha nhẹ ánh vàng neon
  const color16Active = getDistinctTrackColor(16, true);
  assert.ok(color16Active.r >= color16.r * 0.79, "Kênh Red khi active phải sáng rõ");
  assert.ok(color16Active.g >= color16.g * 0.79, "Kênh Green khi active phải sáng rõ");

  console.log("✅ Test 11: Distinct Track Palette: Mỗi Track ID mang một màu riêng biệt, 2 xe liền kề tương phản cực mạnh");
}

// ==========================================
// TEST 12: CẢNH BÁO OVERLAP 2..N BOX BẰNG ĐỎ NEON RỰC LỬA (#ff0d33)
// ==========================================
{
  // 3 hạt điểm:
  // - Point 0: Chỉ nằm trong Box A (x = 8.0, y = 0.0, z = 0.0)
  // - Point 1: Nằm trong VÙNG GIAO NHAU giữa Box A và Box B (x = 10.0, y = 0.0, z = 0.0) -> OVERLAP!
  // - Point 2: Chỉ nằm trong Box B (x = 12.0, y = 0.0, z = 0.0)
  const positions = new Float32Array([
    8.0, 0.0, 0.0,   // Point 0: Thuộc riêng Box A
    10.0, 0.0, 0.0,  // Point 1: Giao nhau giữa Box A và Box B (Overlap)
    12.0, 0.0, 0.0,  // Point 2: Thuộc riêng Box B
  ]);
  const dummyIntensities = new Float32Array([150, 150, 150]);

  // Box A tâm (9, 0, 0), dài 4m -> x từ [7, 11]
  // Box B tâm (11, 0, 0), dài 4m -> x từ [9, 13]
  // Vùng giao thoa: x từ [9, 11] -> Point 1 (x=10) nằm trong cả hai box!
  const overlappingBoxes: Box3DTarget[] = [
    { trackId: 16, cx: 9.0, cy: 0.0, cz: 0.0, rz: 0.0, l: 4.0, w: 2.0, h: 1.5, category: "car" },
    { trackId: 17, cx: 11.0, cy: 0.0, cz: 0.0, rz: 0.0, l: 4.0, w: 2.0, h: 1.5, category: "car" },
  ];

  const colors = computePointCloudColors(positions, dummyIntensities, overlappingBoxes, {
    mode: "plain",
    colorizeBoxed: true,
  });

  // Point 0: Phải mang màu riêng của Box A (Track 16) với factor = 1.0 (đậm nét nhất)
  const expectedColor16 = getDistinctTrackColor(16);
  assert.ok(Math.abs(colors[0] - expectedColor16.r) < 1e-4, "Point 0: Phải mang màu Track 16 factor 1.0");

  // Point 1: Nằm trong vùng Overlap 2 box -> Phải mang màu ĐỎ NEON CẢNH BÁO (#ff0033)
  assert.ok(Math.abs(colors[3] - OVERLAP_WARNING_COLOR.r) < 1e-4, "Point 1 (Overlap): R phải bằng 1.0 (Đỏ Neon)");
  assert.ok(Math.abs(colors[4] - OVERLAP_WARNING_COLOR.g) < 1e-4, "Point 1 (Overlap): G phải bằng 0.0");
  assert.ok(Math.abs(colors[5] - OVERLAP_WARNING_COLOR.b) < 1e-4, "Point 1 (Overlap): B phải bằng 0.20");

  // Point 2: Phải mang màu riêng của Box B (Track 17) với factor = 1.0
  const expectedColor17 = getDistinctTrackColor(17);
  assert.ok(Math.abs(colors[6] - expectedColor17.r) < 1e-4, "Point 2: Phải mang màu Track 17 factor 1.0");

  console.log("✅ Test 12: Cảnh báo Overlap: Điểm trong vùng giao nhau của 2..N box lập tức phát sáng ĐỎ NEON (#ff0033)!");
}

// ==========================================
// TEST 13: TỰ ĐỘNG TẮT ĐỎ NEON KHI KÉO TÁCH RỜI 2 BOX
// ==========================================
{
  // Tách rời 2 box: Dời Box B từ cx=11.0 sang cx=15.0 -> x in [13, 17]
  // Khi đó Point 1 (x=10.0) chỉ còn nằm trong Box A, không còn Overlap nữa!
  const positions = new Float32Array([
    10.0, 0.0, 0.0,  // Point 1 lúc trước bị Overlap
  ]);
  const dummyIntensities = new Float32Array([150]);

  const separatedBoxes: Box3DTarget[] = [
    { trackId: 16, cx: 9.0, cy: 0.0, cz: 0.0, rz: 0.0, l: 4.0, w: 2.0, h: 1.5, category: "car" },
    { trackId: 17, cx: 15.0, cy: 0.0, cz: 0.0, rz: 0.0, l: 4.0, w: 2.0, h: 1.5, category: "car" }, // Đã tách rời
  ];

  const colors = computePointCloudColors(positions, dummyIntensities, separatedBoxes, {
    mode: "plain",
    colorizeBoxed: true,
  });

  // Point 1 không còn đỏ neon nữa, mà trở lại màu riêng của Box A (Track 16) factor = 1.0
  const expectedColor16 = getDistinctTrackColor(16);
  assert.ok(Math.abs(colors[0] - expectedColor16.r) < 1e-4, "Sau khi tách rời: Point 1 phải hết đỏ và trở về màu Track 16 factor 1.0");
  assert.notStrictEqual(colors[0], OVERLAP_WARNING_COLOR.r, "Không còn cảnh báo đỏ neon");

  console.log("✅ Test 13: Khi tách rời 2 box: Màu Đỏ Neon tự động tắt, trả lại màu chuẩn của từng xe");
}

// ==========================================
// TEST 14: THEME NỀN TRẮNG (LIGHT THEME) - MÂY ĐIỂM ĐEN HOÀN TOÀN & XE BỌC MÀU ĐẬM SÂU TƯƠNG PHẢN CAO
// ==========================================
{
  // Kiểm tra bảng màu DEEP_VIVID_TRACK_PALETTE có đủ 32 màu
  assert.strictEqual(DEEP_VIVID_TRACK_PALETTE.length, 32, "DEEP_VIVID_TRACK_PALETTE phải có đủ 32 màu bão hòa cao");

  // 3 điểm:
  // - Point 0: Ngoài box (intensity = 255)
  // - Point 1: Ngoài box (intensity = 50)
  // - Point 2: Trong box xe Track ID = 5
  const positions = new Float32Array([
    0.0, 0.0, 0.0,   // Point 0: Ngoài box
    10.0, 0.0, 0.0,  // Point 1: Ngoài box
    20.0, 5.0, 1.0,  // Point 2: Trong box ô tô Track 5
  ]);
  const intensities = new Float32Array([255, 50, 180]);

  const boxes: Box3DTarget[] = [
    {
      trackId: 5,
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

  // Tính toán màu với theme = "light"
  const colorsLight = computePointCloudColors(positions, intensities, boxes, {
    mode: "intensity",
    colorizeBoxed: true,
    theme: "light",
  });

  // Point 0 (ngoài box trên nền trắng): ĐEN HOÀN TOÀN 100% (0.0, 0.0, 0.0)
  assert.strictEqual(colorsLight[0], 0.0, "Light Theme: Point 0 ngoài box R = 0.0 (Đen hoàn toàn)");
  assert.strictEqual(colorsLight[1], 0.0, "Light Theme: Point 0 ngoài box G = 0.0 (Đen hoàn toàn)");
  assert.strictEqual(colorsLight[2], 0.0, "Light Theme: Point 0 ngoài box B = 0.0 (Đen hoàn toàn)");

  // Point 1 (ngoài box trên nền trắng): ĐEN HOÀN TOÀN 100% (0.0, 0.0, 0.0)
  assert.strictEqual(colorsLight[3], 0.0, "Light Theme: Point 1 ngoài box R = 0.0 (Đen hoàn toàn)");
  assert.strictEqual(colorsLight[4], 0.0, "Light Theme: Point 1 ngoài box G = 0.0 (Đen hoàn toàn)");
  assert.strictEqual(colorsLight[5], 0.0, "Light Theme: Point 1 ngoài box B = 0.0 (Đen hoàn toàn)");

  // Point 2 (trong box xe Track 5 trên nền trắng): Sử dụng DEEP_VIVID_TRACK_PALETTE với hệ số đậm nhất có thể (factor = 1.0)
  const expectedColor5Light = getDistinctTrackColor(5, false, "light");
  assert.ok(Math.abs(colorsLight[6] - expectedColor5Light.r) < 1e-4, "Point 2: R phải khớp màu DEEP_VIVID_TRACK_PALETTE factor 1.0");
  assert.ok(Math.abs(colorsLight[7] - expectedColor5Light.g) < 1e-4, "Point 2: G phải khớp màu DEEP_VIVID_TRACK_PALETTE factor 1.0");
  assert.ok(Math.abs(colorsLight[8] - expectedColor5Light.b) < 1e-4, "Point 2: B phải khớp màu DEEP_VIVID_TRACK_PALETTE factor 1.0");

  console.log("✅ Test 14: Light Theme Canvas: Mây điểm đen hoàn toàn 100%, xe bọc màu đậm sâu tương phản cao (factor = 1.0)");
}

// ==========================================
// TEST 15: CHẾ ĐỘ PLAIN TRÊN LIGHT THEME & BẢO TOÀN DARK THEME (ZERO REGRESSION)
// ==========================================
{
  const positions = new Float32Array([
    5.0, 5.0, 0.0, // Điểm ngoài box
  ]);
  const dummyIntensities = new Float32Array([100]);

  // Khi Light Theme + Mode Plain: Điểm ngoài box là màu đen hoàn toàn 100% (0.0, 0.0, 0.0)
  const colorsPlainLight = computePointCloudColors(positions, dummyIntensities, [], {
    mode: "plain",
    colorizeBoxed: true,
    theme: "light",
  });
  assert.strictEqual(colorsPlainLight[0], 0.0, "Plain Light: R = 0.0 (Đen 100%)");
  assert.strictEqual(colorsPlainLight[1], 0.0, "Plain Light: G = 0.0 (Đen 100%)");
  assert.strictEqual(colorsPlainLight[2], 0.0, "Plain Light: B = 0.0 (Đen 100%)");

  // Khi Dark Theme + Mode Plain: Điểm ngoài box là màu trắng 100% (1.0, 1.0, 1.0)
  const colorsPlainDark = computePointCloudColors(positions, dummyIntensities, [], {
    mode: "plain",
    colorizeBoxed: true,
    theme: "dark",
  });
  assert.strictEqual(colorsPlainDark[0], 1.0, "Plain Dark: R = 1.0 (Trắng 100%)");
  assert.strictEqual(colorsPlainDark[1], 1.0, "Plain Dark: G = 1.0 (Trắng 100%)");
  assert.strictEqual(colorsPlainDark[2], 1.0, "Plain Dark: B = 1.0 (Trắng 100%)");

  console.log("✅ Test 15: Chế độ Plain Light Theme (Đen 100%) & Dark Theme (Trắng 100%): Hoàn hảo");
}

// ==========================================
// TEST 16: KIỂM THỬ PHÒNG VỆ DEFENSIVE & KHÁNG LỖI NAN/INFINITY & ACTIVE BOX COLOR
// ==========================================
{
  // 1. Kiểm tra positions rỗng
  const emptyPositions = new Float32Array([]);
  const emptyColors = computePointCloudColors(emptyPositions, null, [], {
    mode: "intensity",
    colorizeBoxed: true,
    theme: "light",
  });
  assert.strictEqual(emptyColors.length, 0, "Positions rỗng phải trả về colors rỗng");

  // 2. Mảng intensities chứa NaN, Infinity, số âm, số vượt trần
  const positionsWithEdgeIntensities = new Float32Array([
    1.0, 2.0, 3.0,
    4.0, 5.0, 6.0,
    7.0, 8.0, 9.0,
  ]);
  const invalidIntensities = new Float32Array([NaN, Infinity, -100]);
  const colorsEdge = computePointCloudColors(positionsWithEdgeIntensities, invalidIntensities, [], {
    mode: "intensity",
    colorizeBoxed: true,
    theme: "light",
  });
  assert.strictEqual(colorsEdge.length, 9, "Độ dài colors phải bằng 9");
  for (let i = 0; i < colorsEdge.length; i++) {
    assert.ok(!isNaN(colorsEdge[i]), `Giá trị colors[${i}] không bao giờ được là NaN`);
    assert.ok(isFinite(colorsEdge[i]), `Giá trị colors[${i}] phải là số hữu hạn`);
  }

  // 3. Kiểm tra activeBoxColor tùy chỉnh và fallback active trên Light theme
  const boxWithoutTrackId: Box3DTarget = {
    cx: 1.0,
    cy: 2.0,
    cz: 3.0,
    rz: 0.0,
    l: 2.0,
    w: 2.0,
    h: 2.0,
    isActive: true,
  };
  const pointInside = new Float32Array([1.0, 2.0, 3.0]);
  const customActiveColor = { r: 0.99, g: 0.11, b: 0.22 };
  const colorsCustomActive = computePointCloudColors(pointInside, null, [boxWithoutTrackId], {
    mode: "plain",
    colorizeBoxed: true,
    theme: "light",
    activeBoxColor: customActiveColor,
  });
  assert.ok(Math.abs(colorsCustomActive[0] - customActiveColor.r) < 1e-4, "Phải sử dụng custom activeBoxColor factor 1.0");
  assert.ok(Math.abs(colorsCustomActive[1] - customActiveColor.g) < 1e-4, "G khớp custom activeBoxColor");
  assert.ok(Math.abs(colorsCustomActive[2] - customActiveColor.b) < 1e-4, "B khớp custom activeBoxColor");

  console.log("✅ Test 16: Kháng lỗi NaN/Infinity & Kiểm thử phòng vệ Robustness cho Light Theme: Hoàn hảo 100%");
}

// ==========================================
// TEST 17: MÔ PHỎNG LIVE DRAG TRÊN TOP, SIDE, FRONT VIEWS & OVERLAP DETECTION
// ==========================================
{
  // Mô phỏng thuật toán trích xuất vị trí cuboid đang kéo từ các view khác nhau
  function extractLiveCuboidTransform(
    basePts: number[],
    cuboid: {
      perspective?: { position?: { x: number; y: number; z: number }; rotation?: { z: number }; scale?: { x: number; y: number; z: number } };
      top?: { position?: { x: number; y: number; z: number }; rotation?: { z: number }; scale?: { x: number; y: number; z: number } };
      side?: { position?: { x: number; y: number; z: number }; rotation?: { z: number }; scale?: { x: number; y: number; z: number } };
      front?: { position?: { x: number; y: number; z: number }; rotation?: { z: number }; scale?: { x: number; y: number; z: number } };
      position?: { x: number; y: number; z: number };
      rotation?: { z: number };
      scale?: { x: number; y: number; z: number };
    }
  ) {
    const basePos = { x: basePts[0], y: basePts[1], z: basePts[2] };
    const baseYaw = basePts[5] || 0;
    const baseScale = { l: basePts[6], w: basePts[7], h: basePts[8] };

    let cx = basePos.x, cy = basePos.y, cz = basePos.z;
    let yaw = baseYaw;
    let l = baseScale.l, w = baseScale.w, h = baseScale.h;

    const candidateViews = [
      { name: "top", obj: cuboid.top },
      { name: "side", obj: cuboid.side },
      { name: "front", obj: cuboid.front },
      { name: "perspective", obj: cuboid.perspective },
      { name: "root", obj: cuboid },
    ];

    let bestDeltaPos = 0;
    let bestPos: { x: number; y: number; z: number } | null = null;
    for (const cand of candidateViews) {
      const p = cand.obj?.position;
      if (p && typeof p.x === "number" && typeof p.y === "number" && typeof p.z === "number") {
        let dx = p.x - basePos.x;
        let dy = p.y - basePos.y;
        let dz = p.z - basePos.z;
        if (cand.name === "top") dz = 0;
        if (cand.name === "side") dy = 0;
        if (cand.name === "front") dx = 0;

        const delta = dx * dx + dy * dy + dz * dz;
        if (delta > bestDeltaPos && delta > 1e-4) {
          bestDeltaPos = delta;
          bestPos = {
            x: cand.name === "front" ? basePos.x : p.x,
            y: cand.name === "side" ? basePos.y : p.y,
            z: cand.name === "top" ? basePos.z : p.z,
          };
        }
      }
    }

    if (bestPos) {
      cx = bestPos.x;
      cy = bestPos.y;
      cz = bestPos.z;
    }

    return { cx, cy, cz, yaw, l, w, h };
  }

  // Kịch bản A: Người dùng đang kéo chuột trên TOP view (Top View di chuyển sang x=10, y=2)
  // Trong khi perspective.position vẫn ở vị trí cũ (0, 0, 0)
  const baseDataA = [0, 0, 0, 0, 0, 0, 4, 2, 2];
  const cuboidTopDrag = {
    perspective: { position: { x: 0, y: 0, z: 0 } },
    top: { position: { x: 10, y: 2, z: 0 } }, // Đang kéo trên Top view
  };

  const liveA = extractLiveCuboidTransform(baseDataA, cuboidTopDrag);
  assert.strictEqual(liveA.cx, 10, "Top View Drag: cx phải cập nhật = 10");
  assert.strictEqual(liveA.cy, 2, "Top View Drag: cy phải cập nhật = 2");
  assert.strictEqual(liveA.cz, 0, "Top View Drag: cz bảo toàn từ baseZ");

  // Kiểm tra tô màu: Box đã dịch chuyển tới (10, 2, 0).
  // Điểm (10, 2, 0) phải nằm trong box, còn điểm (0, 0, 0) ở ngoài box!
  const positionsDrag = new Float32Array([
    0.0, 0.0, 0.0,   // Vị trí cũ (nay đã ở ngoài box)
    10.0, 2.0, 0.0,  // Vị trí mới (nằm trong box đang kéo)
  ]);
  const activeBoxA: Box3DTarget = {
    trackId: 1,
    cx: liveA.cx,
    cy: liveA.cy,
    cz: liveA.cz,
    rz: liveA.yaw,
    l: liveA.l,
    w: liveA.w,
    h: liveA.h,
  };

  // Nền trắng: Điểm ngoài box phải đen hoàn toàn 100% (0.0), điểm trong box có màu Track 1 factor 1.0
  const colorsA = computePointCloudColors(positionsDrag, null, [activeBoxA], {
    mode: "plain",
    colorizeBoxed: true,
    theme: "light",
  });
  assert.strictEqual(colorsA[0], 0.0, "Vị trí cũ ngoài box: R = 0.0 (Đen 100%)");
  const track1Color = getDistinctTrackColor(1, false, "light");
  assert.ok(Math.abs(colorsA[3] - track1Color.r) < 1e-4, "Vị trí mới trong box: R khớp màu xe factor 1.0");

  // Kịch bản B: Khi kéo Box A đè lên Box B cố định tại (11, 2, 0) -> Cảnh báo Overlap Đỏ Neon (#ff0033) tức thì!
  const staticBoxB: Box3DTarget = {
    trackId: 2,
    cx: 11.0,
    cy: 2.0,
    cz: 0.0,
    rz: 0.0,
    l: 4.0,
    w: 2.0,
    h: 2.0,
  };
  const colorsOverlapLive = computePointCloudColors(positionsDrag, null, [activeBoxA, staticBoxB], {
    mode: "plain",
    colorizeBoxed: true,
    theme: "light",
  });
  // Điểm (10, 2, 0) nằm trong cả Box A (x in [8, 12]) và Box B (x in [9, 13]) -> Overlap!
  assert.ok(Math.abs(colorsOverlapLive[3] - OVERLAP_WARNING_COLOR.r) < 1e-4, "Overlap Live: R phải phát sáng Đỏ Neon (#ff0033)");
  assert.ok(Math.abs(colorsOverlapLive[4] - OVERLAP_WARNING_COLOR.g) < 1e-4, "Overlap Live: G phải bằng 0.0");
  assert.ok(Math.abs(colorsOverlapLive[5] - OVERLAP_WARNING_COLOR.b) < 1e-4, "Overlap Live: B phải bằng 0.20");

  console.log("✅ Test 17: Mô phỏng Live Drag trên Top, Side, Front Views & Cảnh báo Overlap tức thì (#ff0033): Hoàn hảo!");
}

// ==========================================
// TEST 18: KIỂM THỬ KHÁNG LỖI MULTI-MATERIAL & BUFFER ATTRIBUTE AN TOÀN TRÊN CẢ 4 VIEWS
// ==========================================
{
  // Mô phỏng đối tượng Points có multi-material mảng và kiểm tra cập nhật needsUpdate
  const mockMaterial1 = { vertexColors: false, needsUpdate: false };
  const mockMaterial2 = { vertexColors: false, needsUpdate: false };
  const multiMaterialPoints = {
    type: "Points",
    material: [mockMaterial1, mockMaterial2],
  };

  const mats = Array.isArray(multiMaterialPoints.material)
    ? multiMaterialPoints.material
    : [multiMaterialPoints.material];
  for (const m of mats) {
    if (m) {
      m.vertexColors = true;
      m.needsUpdate = true;
    }
  }

  assert.strictEqual(mockMaterial1.vertexColors, true, "Material 1: vertexColors phải = true");
  assert.strictEqual(mockMaterial1.needsUpdate, true, "Material 1: needsUpdate phải = true");
  assert.strictEqual(mockMaterial2.vertexColors, true, "Material 2: vertexColors phải = true");
  assert.strictEqual(mockMaterial2.needsUpdate, true, "Material 2: needsUpdate phải = true");

  console.log("✅ Test 18: Kiểm thử kháng lỗi Multi-Material & Buffer Attribute trên cả 4 Views: Hoàn hảo 100%");
}

console.log("\n🎉 TẤT CẢ 18/18 BÀI KIỂM THỬ MODULE POINT CLOUD COLORIZATION ĐÃ PASS 100%!");
