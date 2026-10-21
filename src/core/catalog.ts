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

export const STANDARD_VEHICLE_CATALOG: VehicleCatalogItem[] = [
  {
    id: "compact_car",
    name: "Compact Car",
    category: "car",
    l: 4.40,
    w: 1.78,
    h: 1.43,
    description: "Xe cỡ nhỏ (Honda Civic, Mazda 3, Kia Cerato)",
  },
  {
    id: "mid_sedan",
    name: "Mid Sedan",
    category: "car",
    l: 4.75,
    w: 1.84,
    h: 1.45,
    description: "Sedan hạng D (Toyota Camry, Honda Accord, Mercedes C-Class)",
  },
  {
    id: "mid_suv",
    name: "Mid-size SUV",
    category: "suv",
    l: 4.65,
    w: 1.86,
    h: 1.68,
    description: "Crossover/SUV 5 chỗ (Honda CR-V, Mazda CX-5, Hyundai Tucson)",
  },
  {
    id: "full_suv",
    name: "Full-size SUV",
    category: "suv",
    l: 5.05,
    w: 1.98,
    h: 1.85,
    description: "SUV 7 chỗ cỡ lớn (Toyota Land Cruiser, Ford Everest, BMW X7)",
  },
  {
    id: "pickup",
    name: "Pickup Truck",
    category: "truck",
    l: 5.35,
    w: 1.90,
    h: 1.82,
    description: "Xe bán tải (Ford Ranger, Toyota Hilux, Mitsubishi Triton)",
  },
  {
    id: "van",
    name: "Minivan / MPV",
    category: "van",
    l: 5.10,
    w: 1.95,
    h: 1.78,
    description: "Xe gia đình 7 chỗ / Van (Kia Carnival, Toyota Sienna)",
  },
  {
    id: "box_truck",
    name: "Box Truck",
    category: "truck",
    l: 6.20,
    w: 2.20,
    h: 2.75,
    description: "Xe tải thùng trung bình",
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
  {
    id: "motorcycle",
    name: "Motorcycle / Cyclist",
    category: "cycle",
    l: 1.85,
    w: 0.75,
    h: 1.45,
    description: "Xe máy / Xe đạp",
  },
  {
    id: "pedestrian",
    name: "Pedestrian",
    category: "pedestrian",
    l: 0.60,
    w: 0.60,
    h: 1.70,
    description: "Người đi bộ",
  },
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
