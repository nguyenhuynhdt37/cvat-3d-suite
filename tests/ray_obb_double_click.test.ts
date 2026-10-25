/**
 * tests/ray_obb_double_click.test.ts
 * Bộ kiểm thử tự động cho Thuật toán Bắt Đối Tượng Bằng Tia Ray-OBB khi Double Click
 * Đảm bảo phát hiện tức thì xe trên View 3D (< 0.05ms), chuẩn xác 100%, Zero-Lag 60 FPS.
 */

import assert from "node:assert";
import {
  intersectRayWithOBB,
  transformVectorInverseEuler,
  type Ray3D,
  type Box3DParams,
} from "../src/core/geometry.ts";

console.log("🧪 Đang chạy kiểm thử tự động Thuật toán Ray-OBB Double Click 3D...");

// =========================================================================
// TEST 1: Tia bắn trực diện vào tâm xe thẳng đứng (Yaw = 0, Pitch = 0, Roll = 0)
// =========================================================================
{
  const cameraPos = { x: 0, y: 0, z: 2.0 };
  const carBox: Box3DParams = {
    x: 10.0,
    y: 0,
    z: 0,
    l: 4.8,  // Chiều dài dọc X: [10 - 2.4, 10 + 2.4] = [7.6, 12.4]
    w: 2.0,  // Chiều rộng dọc Y: [-1.0, 1.0]
    h: 1.6,  // Chiều cao dọc Z: [-0.8, 0.8]
    yaw: 0,
  };

  // Tia bắn dọc theo trục X hướng về tâm xe (10, 0, 0) từ camera (0, 0, 2.0)
  const ray: Ray3D = {
    origin: cameraPos,
    direction: { x: 10.0, y: 0, z: -2.0 },
  };
  // Chuẩn hóa direction
  const len = Math.hypot(ray.direction.x, ray.direction.y, ray.direction.z);
  ray.direction.x /= len;
  ray.direction.y /= len;
  ray.direction.z /= len;

  const hitDist = intersectRayWithOBB(ray, carBox, 0.12);
  assert(hitDist !== null && hitDist > 0, "Tia phải bắn trúng xe");
  // Khoảng cách từ camera (x=0) tới mép trước xe (x=7.6 - padding) xấp xỉ 7.5m
  assert(hitDist >= 7.0 && hitDist <= 8.0, `Khoảng cách hit phải gần mép xe (~7.5m), thực tế: ${hitDist}`);

  console.log("✅ Test 1: Tia bắn trực diện vào xe thẳng đứng đạt chuẩn 100%");
}

// =========================================================================
// TEST 2: Tia bắn trúng xe xoay góc Yaw 45° (Math.PI / 4)
// =========================================================================
{
  const carBox: Box3DParams = {
    x: 5.0,
    y: 5.0,
    z: 0,
    l: 4.5,
    w: 1.9,
    h: 1.5,
    yaw: Math.PI / 4,
  };

  // Tia bắn từ gốc (0, 0, 0) về phía tâm xe (5, 5, 0)
  const dirX = 5.0 / Math.hypot(5, 5);
  const dirY = 5.0 / Math.hypot(5, 5);
  const ray: Ray3D = {
    origin: { x: 0, y: 0, z: 0 },
    direction: { x: dirX, y: dirY, z: 0 },
  };

  const hitDist = intersectRayWithOBB(ray, carBox, 0.1);
  assert(hitDist !== null && hitDist > 0, "Tia phải bắn trúng xe xoay 45°");
  assert(hitDist >= 4.0 && hitDist <= 6.5, `Khoảng cách hit hợp lý (~5.0m), thực tế: ${hitDist}`);

  console.log("✅ Test 2: Tia bắn trúng xe xoay góc Yaw 45° đạt chuẩn 100%");
}

// =========================================================================
// TEST 3: Tia bắn trượt ra ngoài hộp
// =========================================================================
{
  const carBox: Box3DParams = {
    x: 10.0,
    y: 0,
    z: 0,
    l: 4.0,
    w: 2.0,
    h: 1.5,
    yaw: 0,
  };

  // Tia bắn lệch sang trái 5m (y = 5.0)
  const rayMiss: Ray3D = {
    origin: { x: 0, y: 5.0, z: 0 },
    direction: { x: 1.0, y: 0, z: 0 },
  };

  const hitMiss = intersectRayWithOBB(rayMiss, carBox, 0.12);
  assert.strictEqual(hitMiss, null, "Tia lệch ra ngoài không được báo trúng");

  console.log("✅ Test 3: Tia bắn trượt ngoài xe không gây báo trúng giả");
}

// =========================================================================
// TEST 4: Tia bắn ngược chiều (Xe nằm sau lưng Camera)
// =========================================================================
{
  const carBox: Box3DParams = {
    x: -10.0, // Sau lưng camera
    y: 0,
    z: 0,
    l: 4.0,
    w: 2.0,
    h: 1.5,
    yaw: 0,
  };

  // Tia bắn về phía trước (+X)
  const rayForward: Ray3D = {
    origin: { x: 0, y: 0, z: 0 },
    direction: { x: 1.0, y: 0, z: 0 },
  };

  const hitBack = intersectRayWithOBB(rayForward, carBox, 0.12);
  assert.strictEqual(hitBack, null, "Xe sau lưng camera không được báo trúng");

  console.log("✅ Test 4: Xe nằm sau lưng camera được loại trừ 100%");
}

// =========================================================================
// TEST 5: Đa xe - Tia đâm qua 2 xe liên tiếp (Chọn xe gần hơn)
// =========================================================================
{
  const carNear: Box3DParams = {
    x: 8.0,
    y: 0,
    z: 0,
    l: 4.0,
    w: 2.0,
    h: 1.5,
    yaw: 0,
  };
  const carFar: Box3DParams = {
    x: 20.0,
    y: 0,
    z: 0,
    l: 4.0,
    w: 2.0,
    h: 1.5,
    yaw: 0,
  };

  const ray: Ray3D = {
    origin: { x: 0, y: 0, z: 0 },
    direction: { x: 1.0, y: 0, z: 0 },
  };

  const distNear = intersectRayWithOBB(ray, carNear, 0.12);
  const distFar = intersectRayWithOBB(ray, carFar, 0.12);

  assert(distNear !== null && distFar !== null, "Tia phải cắt cả 2 xe");
  assert(distNear < distFar, `Xe gần (t=${distNear}) phải có khoảng cách nhỏ hơn xe xa (t=${distFar})`);

  console.log("✅ Test 5: Đa xe xếp thẳng hàng: Nhận diện chính xác xe ở gần hơn");
}

// =========================================================================
// TEST 6: Hiệu năng cực hạn 60 FPS (Zero-Lag Benchmark: 20,000 lượt tính toán)
// =========================================================================
{
  const carBox: Box3DParams = {
    x: 12.0,
    y: 3.5,
    z: -0.5,
    l: 4.7,
    w: 1.88,
    h: 1.52,
    yaw: 0.35,
    pitch: 0.02,
    roll: -0.01,
  };

  const ray: Ray3D = {
    origin: { x: 0, y: 0, z: 2.0 },
    direction: { x: 0.95, y: 0.25, z: -0.18 },
  };

  const start = performance.now();
  const iterations = 20000;
  let hits = 0;
  for (let i = 0; i < iterations; i++) {
    const res = intersectRayWithOBB(ray, carBox, 0.12);
    if (res !== null) hits++;
  }
  const duration = performance.now() - start;
  const timePerOpMs = duration / iterations;

  assert(hits === iterations, "Mọi lượt tính đều phải nhất quán");
  assert(duration < 30, `20,000 lượt tính phải chạy dưới 30ms (thực tế: ${duration.toFixed(2)}ms)`);

  console.log(`✅ Test 6: Benchmark Hiệu Năng 20,000 lượt tính Ray-OBB trong ${duration.toFixed(2)}ms (${(timePerOpMs * 1000).toFixed(2)} µs/lượt) -> ĐÁP ỨNG SIÊU MƯỢT 60 FPS!`);
}

console.log("\n🎉 TẤT CẢ 6/6 BÀI KIỂM THỬ THUẬT TOÁN RAY-OBB DOUBLE CLICK ĐÃ PASS 100%!");
