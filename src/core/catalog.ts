/**
 * Thư viện kích thước xe chuẩn quốc tế (Automotive Dimension Catalog)
 * và thuật toán so khớp Best-Fit tối ưu cho gán nhãn 3D LiDAR Bounding Box.
 */

export interface VehicleCatalogItem {
  id: string;
  name: string;
  category: "car" | "suv" | "truck" | "van" | "bus" | "cycle" | "pedestrian";
  l: number; // Chiều dài (mét)
  w: number; // Chiều rộng (mét)
  h: number; // Chiều cao (mét)
  description: string;
}

export const CAR_PRESETS: VehicleCatalogItem[] = [
  {
    id: "compact_car",
    name: "Compact Car",
    category: "car",
    l: 4.40,
    w: 1.78,
    h: 1.43,
    description: "Xe cỡ nhỏ (Civic, Mazda 3, Vios, i10)",
  },
  {
    id: "mid_sedan",
    name: "Sedan",
    category: "car",
    l: 4.70,
    w: 1.82,
    h: 1.45,
    description: "Sedan thông dụng (Camry, Accord, C-Class)",
  },
  {
    id: "mid_suv",
    name: "SUV 5 Chỗ",
    category: "suv",
    l: 4.65,
    w: 1.85,
    h: 1.68,
    description: "Crossover/SUV 5 chỗ (CR-V, CX-5, Tucson)",
  },
  {
    id: "full_suv",
    name: "SUV 7 Chỗ",
    category: "suv",
    l: 5.00,
    w: 1.95,
    h: 1.80,
    description: "SUV 7 chỗ cỡ lớn (Land Cruiser, Everest, Fortuner)",
  },
  {
    id: "pickup",
    name: "Bán Tải",
    category: "truck",
    l: 5.35,
    w: 1.90,
    h: 1.82,
    description: "Xe bán tải (Ford Ranger, Hilux, Triton)",
  },
  {
    id: "van",
    name: "Van / MPV",
    category: "van",
    l: 5.15,
    w: 1.95,
    h: 1.85,
    description: "Xe 7 chỗ / Van (Carnival, Transit, Innova)",
  },
  {
    id: "small_truck",
    name: "Tải Nhỏ",
    category: "truck",
    l: 4.80,
    w: 1.85,
    h: 2.10,
    description: "Xe tải nhỏ 1-2.5 tấn (Kia K200, Porter)",
  },
  {
    id: "box_truck",
    name: "Tải Thùng",
    category: "truck",
    l: 6.50,
    w: 2.25,
    h: 2.80,
    description: "Xe tải thùng trung bình (Hino, Isuzu 5 tấn)",
  },
  {
    id: "bus",
    name: "City Bus",
    category: "bus",
    l: 10.50,
    w: 2.50,
    h: 3.20,
    description: "Xe buýt đô thị",
  },
];

export const CYCLIST_PRESETS: VehicleCatalogItem[] = [
  {
    id: "motorcycle_only",
    name: "Xe Máy",
    category: "cycle",
    l: 1.90,
    w: 0.70,
    h: 1.15,
    description: "Xe máy dựng chân chống (Vision, Wave, Lead)",
  },
  {
    id: "motorcycle_rider",
    name: "Xe Máy + Người",
    category: "cycle",
    l: 1.95,
    w: 0.75,
    h: 1.55,
    description: "Người ngồi lái xe máy (Đội nón bảo hiểm)",
  },
  {
    id: "bicycle_only",
    name: "Xe Đạp",
    category: "cycle",
    l: 1.75,
    w: 0.50,
    h: 1.05,
    description: "Xe đạp khung tiêu chuẩn",
  },
  {
    id: "bicycle_rider",
    name: "Xe Đạp + Người",
    category: "cycle",
    l: 1.75,
    w: 0.60,
    h: 1.65,
    description: "Người đang đạp xe đạp",
  },
  {
    id: "big_moto",
    name: "Mô Tô Lớn",
    category: "cycle",
    l: 2.15,
    w: 0.85,
    h: 1.25,
    description: "Xe phân khối lớn / Cruiser / Touring",
  },
  {
    id: "delivery_moto",
    name: "Xe Chở Hàng",
    category: "cycle",
    l: 2.05,
    w: 0.80,
    h: 1.60,
    description: "Shipper xe máy có thùng hàng phía sau",
  },
];

export const PEDESTRIAN_PRESETS: VehicleCatalogItem[] = [
  {
    id: "ped_standing",
    name: "Người Đứng",
    category: "pedestrian",
    l: 0.55,
    w: 0.50,
    h: 1.70,
    description: "Người lớn đứng yên",
  },
  {
    id: "ped_walking",
    name: "Người Đi Bộ",
    category: "pedestrian",
    l: 0.80,
    w: 0.60,
    h: 1.70,
    description: "Người lớn sải chân bước đi",
  },
  {
    id: "ped_child",
    name: "Trẻ Em",
    category: "pedestrian",
    l: 0.45,
    w: 0.40,
    h: 1.20,
    description: "Trẻ em chiều cao thấp",
  },
  {
    id: "ped_backpack",
    name: "Mang Balo / Vali",
    category: "pedestrian",
    l: 0.75,
    w: 0.65,
    h: 1.72,
    description: "Người mang balo to hoặc kéo vali",
  },
  {
    id: "ped_sitting",
    name: "Khom / Ngồi",
    category: "pedestrian",
    l: 0.70,
    w: 0.60,
    h: 1.25,
    description: "Người ngồi ghế hoặc khom cúi người",
  },
];

export const STANDARD_VEHICLE_CATALOG: VehicleCatalogItem[] = [
  ...CAR_PRESETS,
  ...CYCLIST_PRESETS,
  ...PEDESTRIAN_PRESETS,
];

export interface BestFitMatchResult {
  matchedItem: VehicleCatalogItem;
  confidence: number; // 0 - 100%
  recommendedL: number;
  recommendedW: number;
  recommendedH: number;
  isCustomRefined: boolean;
}

/**
 * Thuật toán tìm kiếm chủng loại xe gần nhất và tính toán kích thước tối ưu (Best Fit).
 * @param measuredL Chiều dài đo được từ cụm điểm LiDAR (mét)
 * @param measuredW Chiều rộng đo được từ cụm điểm LiDAR (mét)
 * @param measuredH Chiều cao đo được từ cụm điểm LiDAR (mét)
 * @param labelHint Nhãn gợi ý hiện tại của CVAT (ví dụ "Car", "Truck", "Bus"...)
 */
export function findBestFitCatalog(
  measuredL: number,
  measuredW: number,
  measuredH: number,
  labelHint?: string
): BestFitMatchResult {
  let candidates = STANDARD_VEHICLE_CATALOG;

  // Lọc sơ bộ theo nhãn nếu có
  if (labelHint) {
    const hint = labelHint.toLowerCase();
    if (hint.includes("bus")) {
      candidates = STANDARD_VEHICLE_CATALOG.filter((c) => c.category === "bus");
    } else if (hint.includes("truck")) {
      candidates = STANDARD_VEHICLE_CATALOG.filter((c) => c.category === "truck");
    } else if (hint.includes("pedestrian")) {
      candidates = STANDARD_VEHICLE_CATALOG.filter((c) => c.category === "pedestrian");
    } else if (hint.includes("cycl") || hint.includes("moto")) {
      candidates = STANDARD_VEHICLE_CATALOG.filter((c) => c.category === "cycle");
    } else if (hint.includes("car") || hint.includes("vehicle")) {
      candidates = STANDARD_VEHICLE_CATALOG.filter((c) =>
        ["car", "suv", "van", "truck"].includes(c.category)
      );
    }
  }

  if (candidates.length === 0) {
    candidates = STANDARD_VEHICLE_CATALOG;
  }

  let bestMatch = candidates[0];
  let minDistance = Infinity;

  for (const item of candidates) {
    // Trọng số: Dài (x2.0), Rộng (x1.5), Cao (x1.0)
    const dl = (measuredL - item.l) / item.l;
    const dw = (measuredW - item.w) / item.w;
    const dh = (measuredH - item.h) / item.h;

    const dist = Math.sqrt(2.0 * dl * dl + 1.5 * dw * dw + 1.0 * dh * dh);
    if (dist < minDistance) {
      minDistance = dist;
      bestMatch = item;
    }
  }

  // Độ tin cậy tính theo khoảng cách chuẩn hóa
  const confidence = Math.max(10, Math.min(100, Math.round((1 - minDistance / 2) * 100)));

  // Kết hợp kích thước:
  // Nếu số đo LiDAR nằm trong khoảng hợp lý (không bị che khuất quá mức), ta ưu tiên số đo thực tế + bù viền
  let recommendedL = bestMatch.l;
  let recommendedW = bestMatch.w;
  let recommendedH = bestMatch.h;

  if (measuredL >= 3.0 && measuredL <= 7.0) {
    recommendedL = Number(Math.max(measuredL, bestMatch.l * 0.95).toFixed(2));
  }
  if (measuredW >= 1.5 && measuredW <= 2.5) {
    recommendedW = Number(Math.max(measuredW, bestMatch.w * 0.95).toFixed(2));
  }
  if (measuredH >= 1.2 && measuredH <= 2.2) {
    recommendedH = Number(measuredH.toFixed(2));
  }

  return {
    matchedItem: bestMatch,
    confidence,
    recommendedL,
    recommendedW,
    recommendedH,
    isCustomRefined: true,
  };
}
