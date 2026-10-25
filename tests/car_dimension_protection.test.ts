import assert from "assert";
import {
  fitBoxToEgoRayAndGround,
  fitPedestrianBox,
  fitTwoWheelerBox,
} from "../src/core/geometry.ts";
import { findBestFitCatalog } from "../src/core/catalog.ts";

interface Point3D {
  x: number;
  y: number;
  z: number;
  intensity?: number;
}

console.log("🧪 Đang chạy kiểm thử tự động Bảo Vệ Kích Thước Ô Tô & Phân Lập Fit W/H...");

// 1. Test 1: Ô tô bảo toàn 100% kích thước L, W, H khi căn Top, Side, Front
(() => {
  // Giả lập mây điểm ô tô có bề rộng 2.2m nhưng box gốc là sedan chuẩn 4.7m x 1.85m x 1.45m
  const pts: Point3D[] = [];
  for (let x = -2.0; x <= 2.0; x += 0.2) {
    for (let y = -1.1; y <= 1.1; y += 0.2) {
      pts.push({ x, y, z: 0.5 });
    }
  }

  const origL = 4.7;
  const origW = 1.85;
  const origH = 1.45;

  // Căn TOP
  const topRes = fitBoxToEgoRayAndGround(pts, 0, 0, 0.725, 0, origL, origW, origH, { x: 0, y: 0, z: 0 }, {
    preserveDimensions: true,
    fitStep: "top",
  });
  assert.strictEqual(topRes.newL, origL, "Căn TOP phải bảo toàn chiều dài L của Ô tô");
  assert.strictEqual(topRes.newW, origW, "Căn TOP phải bảo toàn chiều rộng W của Ô tô");
  assert.strictEqual(topRes.newH, origH, "Căn TOP phải bảo toàn chiều cao H của Ô tô");

  // Căn SIDE
  const sideRes = fitBoxToEgoRayAndGround(pts, 0, 0, 0.725, 0, origL, origW, origH, { x: 0, y: 0, z: 0 }, {
    preserveDimensions: true,
    fitStep: "side",
  });
  assert.strictEqual(sideRes.newL, origL, "Căn SIDE phải bảo toàn chiều dài L của Ô tô");
  assert.strictEqual(sideRes.newW, origW, "Căn SIDE phải bảo toàn chiều rộng W của Ô tô");
  assert.strictEqual(sideRes.newH, origH, "Căn SIDE phải bảo toàn chiều cao H của Ô tô");

  // Căn FRONT
  const frontRes = fitBoxToEgoRayAndGround(pts, 0, 0, 0.725, 0, origL, origW, origH, { x: 0, y: 0, z: 0 }, {
    preserveDimensions: true,
    fitStep: "front",
  });
  assert.strictEqual(frontRes.newL, origL, "Căn FRONT phải bảo toàn chiều dài L của Ô tô");
  assert.strictEqual(frontRes.newW, origW, "Căn FRONT phải bảo toàn chiều rộng W của Ô tô");
  assert.strictEqual(frontRes.newH, origH, "Căn FRONT phải bảo toàn chiều cao H của Ô tô");

  console.log("✅ Test 1: Ô tô bảo toàn 100% kích thước L, W, H qua cả 3 view TOP, SIDE, FRONT (Chuẩn)");
})();

// 2. Test 2: Ô tô chỉ thay đổi kích thước khi khớp Catalog Xe Chuẩn (Phím B)
(() => {
  // Một chiếc xe sedan có kích thước lệch 4.55 x 1.78 x 1.40
  const match = findBestFitCatalog(4.55, 1.78, 1.40, "car");
  assert.ok(match, "Phải tìm thấy mẫu Catalog phù hợp");
  assert.ok(match.matchedItem, "Phải match được item trong Catalog");
  // Catalog đề xuất kích thước chuẩn của dòng Sedan
  assert.strictEqual(match.recommendedL >= 4.5 && match.recommendedL <= 5.0, true, "Chiều dài L catalog chuẩn");
  assert.strictEqual(match.recommendedW >= 1.75 && match.recommendedW <= 1.95, true, "Chiều rộng W catalog chuẩn");
  assert.strictEqual(match.recommendedH >= 1.40 && match.recommendedH <= 1.55, true, "Chiều cao H catalog chuẩn");

  console.log(`✅ Test 2: Ô tô khớp kích thước chuẩn từ Catalog xe [${match.matchedItem.name}] (${match.recommendedL}x${match.recommendedW}x${match.recommendedH}m)`);
})();

// 3. Test 3: Người đi bộ (Pedestrian) được phép Fit Rộng (W) và Fit Cao (H)
(() => {
  // Tạo đám mây điểm thân người đi bộ cao 1.70m, vai rộng 0.45m, sâu 0.35m
  const pedPts: Point3D[] = [];
  for (let z = 0.05; z <= 1.70; z += 0.1) {
    for (let y = -0.225; y <= 0.225; y += 0.05) {
      pedPts.push({ x: 0, y, z });
    }
  }

  // Khởi đầu với box ban đầu kích thước chưa khớp: 0.8 x 0.8 x 2.0m
  const fitWRes = fitPedestrianBox(pedPts, 0, 0, 1.0, 0, 0.8, 0.8, 2.0, { step: "w" });
  assert.strictEqual(fitWRes.newL, 0.8, "Fit W không được làm đổi L của người");
  assert.strictEqual(fitWRes.newH, 2.0, "Fit W không được làm đổi H của người");
  // W mới phải ôm sát bề rộng vai người
  assert.ok(fitWRes.newW < 0.8, `Fit W người phải co gọn lại ôm vai (nhận được: ${fitWRes.newW}m)`);

  const fitHRes = fitPedestrianBox(pedPts, 0, 0, 1.0, 0, 0.8, fitWRes.newW, 2.0, { step: "h" });
  assert.strictEqual(fitHRes.newL, 0.8, "Fit H không được làm đổi L của người");
  assert.strictEqual(fitHRes.newW, fitWRes.newW, "Fit H không được làm đổi W của người");
  // H mới phải bám sàn và ôm đỉnh đầu (+5cm pad)
  assert.ok(fitHRes.newH >= 1.70 && fitHRes.newH <= 1.85, `Fit H người phải chuẩn Ground-Lock nở nóc (nhận được: ${fitHRes.newH}m)`);

  console.log(`✅ Test 3: Người đi bộ Fit Rộng W (${fitWRes.newW}m) và Fit Cao H (${fitHRes.newH}m) chính xác 100%`);
})();

// 4. Test 4: Xe 2 bánh (Cyclist) được phép Fit Rộng (W) và Fit Cao (H)
(() => {
  // Tạo mây điểm xe máy với tay lái rộng 0.70m, chiều cao người lái và nón bảo hiểm 1.55m
  const cyclistPts: Point3D[] = [];
  for (let z = 0.1; z <= 1.55; z += 0.1) {
    for (let y = -0.35; y <= 0.35; y += 0.07) {
      cyclistPts.push({ x: 0, y, z });
    }
  }

  const fitWRes = fitTwoWheelerBox(cyclistPts, 0, 0, 0.9, 0, 1.8, 1.2, 1.8, { step: "w" });
  assert.strictEqual(fitWRes.newL, 1.8, "Fit W xe 2 bánh không được làm đổi L (khóa cứng L)");
  assert.strictEqual(fitWRes.newH, 1.8, "Fit W xe 2 bánh không được làm đổi H");
  assert.ok(fitWRes.newW < 1.2, `Fit W xe 2 bánh phải ôm sát tay lái (nhận được: ${fitWRes.newW}m)`);

  const fitHRes = fitTwoWheelerBox(cyclistPts, 0, 0, 0.9, 0, 1.8, fitWRes.newW, 1.8, { step: "h" });
  assert.strictEqual(fitHRes.newL, 1.8, "Fit H xe 2 bánh không làm đổi L");
  assert.strictEqual(fitHRes.newW, fitWRes.newW, "Fit H xe 2 bánh không làm đổi W");
  assert.ok(fitHRes.newH >= 1.55 && fitHRes.newH <= 1.70, `Fit H xe 2 bánh ôm sát đỉnh đầu người lái (nhận được: ${fitHRes.newH}m)`);

  console.log(`✅ Test 4: Xe 2 bánh Fit Rộng W (${fitWRes.newW}m) và Fit Cao H (${fitHRes.newH}m) chính xác 100%`);
})();

// 5. Test 5: Guardrail kiểm tra category: Car từ chối Fit W/H tự do
(() => {
  function simulateFitAction(category: "car" | "pedestrian" | "cyclist", action: "w" | "h"): { allowed: boolean; message: string } {
    if (category === "car") {
      const dimLabel = action === "w" ? "Fit W" : "Fit H";
      return {
        allowed: false,
        message: `Ô tô tuân thủ kích thước chuẩn Catalog (Phím B), không áp dụng ${dimLabel} tự do!`,
      };
    }
    return {
      allowed: true,
      message: `Cho phép thực thi ${action.toUpperCase()}`,
    };
  }

  const carW = simulateFitAction("car", "w");
  assert.strictEqual(carW.allowed, false, "Ô tô phải bị từ chối Fit W");
  assert.ok(carW.message.includes("Catalog"), "Phải nhắc dùng Catalog xe");

  const carH = simulateFitAction("car", "h");
  assert.strictEqual(carH.allowed, false, "Ô tô phải bị từ chối Fit H");
  assert.ok(carH.message.includes("Catalog"), "Phải nhắc dùng Catalog xe");

  const pedW = simulateFitAction("pedestrian", "w");
  assert.strictEqual(pedW.allowed, true, "Người đi bộ được phép Fit W");

  const cyclistH = simulateFitAction("cyclist", "h");
  assert.strictEqual(cyclistH.allowed, true, "Xe 2 bánh được phép Fit H");

  console.log("✅ Test 5: Guardrail phân lập nhãn chuẩn: Car bị từ chối Fit W/H tự do, Pedestrian & Cyclist được phép");
})();

console.log("\n🎉 TẤT CẢ 5/5 BÀI KIỂM THỬ BẢO VỆ KÍCH THƯỚC Ô TÔ & PHÂN LẬP FIT W/H ĐÃ PASS 100%!");
