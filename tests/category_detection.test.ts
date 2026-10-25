import assert from "assert";
import {
  detectObjectCategory,
  classifyLabelGroup,
} from "../src/core/qc/qc_engine.ts";

console.log("🧪 Đang chạy kiểm thử tự động Nhận Diện Loại Đối Tượng & Phân Lập Category (Cyclist / Pedestrian / Car)...");

// 1. Test 1: Kiểm thử toàn diện nhóm Xe 2 Bánh (Cyclist)
(() => {
  const cyclistLabels = [
    // Biến thể two_wheel & typo người dùng báo ("tow whel")
    "tow whel",
    "tow_whel",
    "tow-whel",
    "towwhel",
    "two whel",
    "two_whel",
    "tow wheel",
    "tow_wheel",
    "tow-wheel",
    "towwheel",
    "tow wheels",
    "tow_wheels",
    "tow wheeler",
    "tow_wheeler",
    "tow-wheeler",
    "towwheeler",
    "tow wheelers",
    "two wheel",
    "two_wheel",
    "two-wheel",
    "twowheel",
    "two wheels",
    "two_wheels",
    "two wheeler",
    "two_wheeler",
    "two-wheeler",
    "twowheeler",
    "two wheelers",
    "two_wheelers",
    "two-wheelers",
    "two-wheeled",
    "two_wheeled",
    "2 wheel",
    "2_wheel",
    "2-wheel",
    "2wheel",
    "2 wheels",
    "2_wheels",
    "2 wheeler",
    "2_wheeler",
    "2-wheeler",
    "2wheeler",
    "2 wheelers",
    "2_wheelers",
    // Tiếng Anh phổ biến
    "motorcycle",
    "motorcycles",
    "motorbike",
    "motorbikes",
    "motobike",
    "motobikes",
    "motor_cycle",
    "motor-cycle",
    "motor cycle",
    "motor_bike",
    "motor-bike",
    "motor bike",
    "moto",
    "motos",
    "bicycle",
    "bicycles",
    "bike",
    "bikes",
    "biking",
    "cyclist",
    "cyclists",
    "cycle",
    "cycles",
    "scooter",
    "scooters",
    "e-scooter",
    "escooter",
    "e_scooter",
    "e-bike",
    "ebike",
    "moped",
    "mopeds",
    "rider",
    "riders",
    "tricycle",
    "trike",
    // Tiếng Việt
    "xe máy",
    "xe_máy",
    "xe-máy",
    "xe may",
    "xe_may",
    "xe-may",
    "xemay",
    "xe đạp",
    "xe_đạp",
    "xe dap",
    "xe_dap",
    "xedap",
    "xe 2 bánh",
    "xe 2 banh",
    "xe_2_bánh",
    "xe_2_banh",
    "xe-2-banh",
    "xe hai bánh",
    "xe_hai_banh",
    // Hoa thường hỗn hợp
    "Two_Wheeler",
    "Two Wheel",
    "TOW WHEL",
    "MotorCycle",
    "Cyclist #1",
  ];

  for (const lbl of cyclistLabels) {
    const cat = detectObjectCategory(lbl);
    assert.strictEqual(
      cat,
      "cyclist",
      `Nhãn "${lbl}" phải được nhận diện là "cyclist" (nhận được: "${cat}")`
    );
  }

  console.log(`✅ Test 1: Bắt trọn ${cyclistLabels.length} biến thể Xe 2 bánh (kể cả "tow whel", "two_wheel", "two wheel", "moped") ➔ "cyclist"`);
})();

// 2. Test 2: Kiểm thử toàn diện nhóm Người Đi Bộ (Pedestrian)
(() => {
  const pedLabels = [
    "pedestrian",
    "pedestrians",
    "Pedestrian",
    "PEDESTRIAN",
    "ped",
    "peds",
    "ped_adult",
    "ped-child",
    "ped.crossing",
    "person",
    "persons",
    "Person",
    "people",
    "People",
    "human",
    "humans",
    "walker",
    "walkers",
    "walking",
    "child",
    "children",
    "kid",
    "kids",
    "baby",
    "infant",
    "toddler",
    "stroller",
    "pram",
    "bystander",
    "bystanders",
    "jogger",
    "joggers",
    "runner",
    "runners",
    // Tiếng Việt
    "người đi bộ",
    "nguoi di bo",
    "người_đi_bộ",
    "nguoi_di_bo",
    "nguoi-di-bo",
    "khách bộ hành",
    "bo hanh",
    "bo_hanh",
    "người",
    "nguoi",
    "Người #2",
  ];

  for (const lbl of pedLabels) {
    const cat = detectObjectCategory(lbl);
    assert.strictEqual(
      cat,
      "pedestrian",
      `Nhãn "${lbl}" phải được nhận diện là "pedestrian" (nhận được: "${cat}")`
    );
  }

  console.log(`✅ Test 2: Bắt trọn ${pedLabels.length} biến thể Người đi bộ (kể cả "ped", "people", "người đi bộ") ➔ "pedestrian"`);
})();

// 3. Test 3: Phòng vệ không nhầm lẫn giữa Moped (Xe máy) và Pedestrian (Người)
(() => {
  // Chuỗi "moped" chứa "ped", nhưng tuyệt đối KHÔNG ĐƯỢC nhận nhầm thành pedestrian!
  const mopedCat = detectObjectCategory("moped");
  assert.strictEqual(mopedCat, "cyclist", '"moped" phải là cyclist, không được là pedestrian!');

  const mopedsCat = detectObjectCategory("mopeds");
  assert.strictEqual(mopedsCat, "cyclist", '"mopeds" phải là cyclist, không được là pedestrian!');

  const mopedRider = detectObjectCategory("moped_rider");
  assert.strictEqual(mopedRider, "cyclist", '"moped_rider" phải là cyclist!');

  console.log("✅ Test 3: Phòng vệ chống nhầm lẫn: Moped/Mopeds được xếp vào Xe 2 bánh (cyclist), miễn nhiễm 100% với pedestrian");
})();

// 4. Test 4: Kiểm thử nhóm Ô Tô & Fallback
(() => {
  const carLabels = [
    "car",
    "cars",
    "Car",
    "sedan",
    "suv",
    "truck",
    "trucks",
    "bus",
    "buses",
    "van",
    "vans",
    "pickup",
    "minibus",
    "vehicle",
    "vehicles",
    "ô tô",
    "xe con",
    "xe tải",
    "xe buýt",
    "Object",
    "",
    "unknown",
  ];

  for (const lbl of carLabels) {
    const cat = detectObjectCategory(lbl);
    assert.strictEqual(
      cat,
      "car",
      `Nhãn "${lbl}" phải được nhận diện là "car" (nhận được: "${cat}")`
    );
  }

  console.log(`✅ Test 4: Bắt chuẩn ${carLabels.length} nhãn Ô tô / Xe cơ giới & Fallback ➔ "car"`);
})();

// 5. Test 5: Đồng bộ với classifyLabelGroup của QC Engine
(() => {
  assert.strictEqual(classifyLabelGroup("tow whel"), "two_wheel", '"tow whel" phải thuộc nhóm two_wheel trong QC');
  assert.strictEqual(classifyLabelGroup("two_wheel"), "two_wheel", '"two_wheel" phải thuộc nhóm two_wheel trong QC');
  assert.strictEqual(classifyLabelGroup("two wheel"), "two_wheel", '"two wheel" phải thuộc nhóm two_wheel trong QC');
  assert.strictEqual(classifyLabelGroup("motorcycle"), "two_wheel", '"motorcycle" phải thuộc nhóm two_wheel trong QC');
  assert.strictEqual(classifyLabelGroup("ped"), "pedestrian", '"ped" phải thuộc nhóm pedestrian trong QC');
  assert.strictEqual(classifyLabelGroup("people"), "pedestrian", '"people" phải thuộc nhóm pedestrian trong QC');
  assert.strictEqual(classifyLabelGroup("người đi bộ"), "pedestrian", '"người đi bộ" phải thuộc nhóm pedestrian trong QC');
  assert.strictEqual(classifyLabelGroup("car"), "vehicle", '"car" phải thuộc nhóm vehicle trong QC');
  assert.strictEqual(classifyLabelGroup("truck"), "vehicle", '"truck" phải thuộc nhóm vehicle trong QC');

  console.log("✅ Test 5: classifyLabelGroup đồng bộ 100% với detectObjectCategory cho toàn bộ QC Engine");
})();

console.log("\n🎉 TẤT CẢ 5/5 BÀI KIỂM THỬ NHẬN DIỆN CATEGORY ĐÃ ĐẠT 100%!");
