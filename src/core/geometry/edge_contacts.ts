/**
 * Module đánh giá viền chạm điểm mây (Edge Contact HUD) & Bảng màu LiDAR.
 */

// =============================================================================
// THUẬT TOÁN TÔ MÀU MÂY ĐIỂM LIDAR (POINT CLOUD COLORIZATION ENGINE)
// =============================================================================

export interface Box3DTarget {
  id?: number | string;
  trackId?: number;
  cx: number;
  cy: number;
  cz: number;
  rx?: number;
  ry?: number;
  rz: number; // yaw rad
  l: number;
  w: number;
  h: number;
  color?: { r: number; g: number; b: number };
  category?: "car" | "pedestrian" | "cyclist" | string;
  isActive?: boolean;
}

export interface PointCloudColorOptions {
  mode: "intensity" | "plain";
  colorizeBoxed: boolean;
  theme?: "light" | "dark";
  intensityColormap?: "grayscale" | "contrast_boost";
  plainColor?: { r: number; g: number; b: number };
  activeBoxColor?: { r: number; g: number; b: number };
}

/**
 * Kiểm tra siêu nhanh 1 điểm P(x, y, z) có nằm bên trong 3D Bounding Box hay không.
 * Hỗ trợ xoay Yaw và góc dốc Roll/Pitch nếu có.
 */
export function isPointInsideBox3D(
  px: number,
  py: number,
  pz: number,
  box: Box3DTarget
): boolean {
  const dx = px - box.cx;
  const dy = py - box.cy;
  const dz = pz - box.cz;

  // AABB pre-filter: Bán kính bao hình cầu sơ loại 95% điểm ngoài box siêu tốc
  const maxR = Math.max(box.l, box.w, box.h) * 0.75;
  if (Math.abs(dx) > maxR || Math.abs(dy) > maxR || Math.abs(dz) > maxR) {
    return false;
  }

  // Chuyển sang hệ tọa độ cục bộ của Box theo Yaw
  const cosY = Math.cos(-box.rz);
  const sinY = Math.sin(-box.rz);

  let lx = dx * cosY - dy * sinY;
  let ly = dx * sinY + dy * cosY;
  let lz = dz;

  // Xử lý góc dốc Roll / Pitch nếu xe đang đỗ nghiêng hoặc dốc
  if (box.rx || box.ry) {
    const rx = box.rx || 0;
    const ry = box.ry || 0;
    const cosP = Math.cos(-ry);
    const sinP = Math.sin(-ry);
    const lx2 = lx * cosP + lz * sinP;
    const lz2 = -lx * sinP + lz * cosP;

    const cosR = Math.cos(-rx);
    const sinR = Math.sin(-rx);
    const ly2 = ly * cosR - lz2 * sinR;
    const lz3 = ly * sinR + lz2 * cosR;

    lx = lx2;
    ly = ly2;
    lz = lz3;
  }

  const halfL = box.l / 2;
  const halfW = box.w / 2;
  const halfH = box.h / 2;

  return Math.abs(lx) <= halfL && Math.abs(ly) <= halfW && Math.abs(lz) <= halfH;
}

// Bảng màu mặc định theo nhãn xe
export const DEFAULT_LABEL_COLORS: Record<string, { r: number; g: number; b: number }> = {
  car: { r: 0.96, g: 0.62, b: 0.04 },        // Cam hổ phách ấm (#f59e0b)
  pedestrian: { r: 0.51, g: 0.55, b: 0.97 }, // Xanh tím Indigo (#818cf8)
  cyclist: { r: 0.06, g: 0.73, b: 0.51 },    // Xanh lục Emerald (#10b981)
  truck: { r: 0.94, g: 0.38, b: 0.57 },      // Hồng Ruby (#f43f5e)
  bus: { r: 0.65, g: 0.43, b: 0.95 },        // Tím tím Purple (#a855f7)
  active: { r: 0.98, g: 0.80, b: 0.08 },     // Vàng chanh Neon (#facc15)
};

// Bảng 32 màu phân kỳ tương phản cao (High-Contrast Vivid Palette) cho từng Track ID
export const DISTINCT_TRACK_PALETTE: Array<{ r: number; g: number; b: number }> = [
  { r: 0.00, g: 0.95, b: 1.00 }, // 0: Cyan Neon (#00f2fe)
  { r: 0.96, g: 0.62, b: 0.04 }, // 1: Vàng Cam Amber (#f59e0b)
  { r: 0.66, g: 0.33, b: 0.97 }, // 2: Tím Violet (#a855f7)
  { r: 0.06, g: 0.73, b: 0.51 }, // 3: Xanh Lục Emerald (#10b981)
  { r: 0.93, g: 0.28, b: 0.60 }, // 4: Hồng Sen Neon (#ec4899)
  { r: 0.23, g: 0.51, b: 0.96 }, // 5: Xanh Biển Electric Blue (#3b82f6)
  { r: 0.52, g: 0.80, b: 0.09 }, // 6: Xanh Chuối Chartreuse (#84cc16)
  { r: 0.98, g: 0.57, b: 0.24 }, // 7: Cam San Hô Coral (#fb923c)
  { r: 0.08, g: 0.72, b: 0.65 }, // 8: Xanh Ngọc Lục Bảo Teal (#14b8a6)
  { r: 0.92, g: 0.70, b: 0.03 }, // 9: Vàng Gold (#eab308)
  { r: 0.39, g: 0.40, b: 0.95 }, // 10: Tím Indigo (#6366f1)
  { r: 0.20, g: 0.83, b: 0.60 }, // 11: Xanh Lục Mint (#34d399)
  { r: 0.85, g: 0.27, b: 0.94 }, // 12: Hồng Tím Fuchsia (#d946ef)
  { r: 0.22, g: 0.74, b: 0.97 }, // 13: Xanh Trời Sky (#38bdf8)
  { r: 0.98, g: 0.45, b: 0.09 }, // 14: Cam Đỏ Nhẹ Warm Orange (#f97316)
  { r: 0.13, g: 0.77, b: 0.37 }, // 15: Xanh Lá Spring Green (#22c55e)
  { r: 0.75, g: 0.52, b: 0.99 }, // 16: Tím Lavender (#c084fc)
  { r: 0.02, g: 0.71, b: 0.83 }, // 17: Xanh Biển Aqua (#06b6d4)
  { r: 0.98, g: 0.44, b: 0.52 }, // 18: Hồng Phấn Rose (#fb7185)
  { r: 0.64, g: 0.90, b: 0.21 }, // 19: Vàng Chanh Lemon Lime (#a3e635)
  { r: 0.40, g: 0.91, b: 0.98 }, // 20: Xanh Băng Glacier (#67e8f9)
  { r: 0.99, g: 0.73, b: 0.45 }, // 21: Cam Nắng Peach (#fdba74)
  { r: 0.58, g: 0.20, b: 0.92 }, // 22: Tím Orchid (#9333ea)
  { r: 0.09, g: 0.64, b: 0.29 }, // 23: Xanh Clover (#16a34a)
  { r: 0.96, g: 0.25, b: 0.37 }, // 24: Hồng Magenta (#f43f5e)
  { r: 0.15, g: 0.39, b: 0.92 }, // 25: Xanh Sapphire (#2563eb)
  { r: 0.05, g: 0.58, b: 0.53 }, // 26: Xanh Ngọc Jade (#0d9488)
  { r: 0.85, g: 0.47, b: 0.02 }, // 27: Vàng Hổ Phách Đậm (#d97706)
  { r: 0.31, g: 0.27, b: 0.90 }, // 28: Xanh Cobalt (#4f46e5)
  { r: 0.13, g: 0.83, b: 0.93 }, // 29: Xanh Cyan Sáng (#22d3ee)
  { r: 0.96, g: 0.45, b: 0.71 }, // 30: Hồng Pink Light (#f472b6)
  { r: 0.29, g: 0.87, b: 0.50 }, // 31: Xanh Táo Apple Green (#4ade80)
];

// Bảng 32 màu Đậm Sâu Độ Tương Phản Cao (Ultra-Deep Vivid / Rich Jewel Palette) cho Giao diện Nền Trắng
export const DEEP_VIVID_TRACK_PALETTE: Array<{ r: number; g: number; b: number }> = [
  { r: 0.02, g: 0.38, b: 0.68 }, // 0: Xanh Ocean Đậm Sâu (#0369a1)
  { r: 0.70, g: 0.32, b: 0.02 }, // 1: Vàng Hổ Phách Nâu Đậm (#b45309)
  { r: 0.40, g: 0.08, b: 0.68 }, // 2: Tím Hoàng Gia Đậm (#6b21a8)
  { r: 0.01, g: 0.45, b: 0.28 }, // 3: Xanh Lục Bảo Đậm Sâu (#047857)
  { r: 0.65, g: 0.05, b: 0.15 }, // 4: Đỏ Ruby / Đỏ Mận Đậm (#991b1b)
  { r: 0.08, g: 0.22, b: 0.72 }, // 5: Xanh Cobalt Đậm (#1e40af)
  { r: 0.22, g: 0.38, b: 0.04 }, // 6: Xanh Rêu Đậm Sâu (#3f6212)
  { r: 0.65, g: 0.18, b: 0.04 }, // 7: Cam Cháy Đậm (#9a3412)
  { r: 0.04, g: 0.36, b: 0.34 }, // 8: Xanh Teal Đậm Sâu (#115e59)
  { r: 0.58, g: 0.25, b: 0.02 }, // 9: Nâu Đồng Đậm (#78350f)
  { r: 0.20, g: 0.16, b: 0.65 }, // 10: Tím Indigo Đậm Sâu (#3730a3)
  { r: 0.01, g: 0.38, b: 0.24 }, // 11: Xanh Thông Đậm (#064e3b)
  { r: 0.52, g: 0.08, b: 0.58 }, // 12: Hồng Tím Fuchsia Đậm (#86198f)
  { r: 0.01, g: 0.32, b: 0.58 }, // 13: Xanh Biển Đậm (#075985)
  { r: 0.68, g: 0.10, b: 0.02 }, // 14: Đỏ Cam Đậm (#991b1b)
  { r: 0.06, g: 0.42, b: 0.18 }, // 15: Xanh Lá Đậm Sâu (#166534)
  { r: 0.35, g: 0.10, b: 0.62 }, // 16: Tím Mận Đậm (#581c87)
  { r: 0.03, g: 0.35, b: 0.45 }, // 17: Xanh Petrol Đậm (#155e75)
  { r: 0.62, g: 0.04, b: 0.12 }, // 18: Đỏ Rượu Vang Đậm (#881337)
  { r: 0.30, g: 0.44, b: 0.05 }, // 19: Vàng Chanh Rêu Đậm (#4d7c0f)
  { r: 0.02, g: 0.36, b: 0.50 }, // 20: Xanh Băng Đậm Sâu (#0e7490)
  { r: 0.65, g: 0.28, b: 0.05 }, // 21: Cam Đất Đậm (#9a3412)
  { r: 0.38, g: 0.06, b: 0.62 }, // 22: Tím Đậm Sâu (#581c87)
  { r: 0.04, g: 0.32, b: 0.14 }, // 23: Xanh Rừng Đậm (#14532d)
  { r: 0.60, g: 0.06, b: 0.22 }, // 24: Hồng Đậm Sâu (#881337)
  { r: 0.08, g: 0.20, b: 0.58 }, // 25: Xanh Navy Đậm (#172554)
  { r: 0.02, g: 0.30, b: 0.28 }, // 26: Xanh Rêu Đen (#042f2e)
  { r: 0.58, g: 0.26, b: 0.02 }, // 27: Vàng Đất Nung Đậm (#78350f)
  { r: 0.16, g: 0.12, b: 0.55 }, // 28: Tím Đêm Đậm (#312e81)
  { r: 0.02, g: 0.38, b: 0.48 }, // 29: Xanh Lam Đậm Sâu (#155e75)
  { r: 0.55, g: 0.08, b: 0.35 }, // 30: Hồng Sen Đậm Sâu (#701a75)
  { r: 0.08, g: 0.40, b: 0.20 }, // 31: Xanh Táo Đậm Sâu (#166534)
];

// Màu đỏ neon cảnh báo phát sáng khi có từ 2 box trở lên chồng lấn (Overlap Warning)
export const OVERLAP_WARNING_COLOR = { r: 1.0, g: 0.0, b: 0.20 }; // Đỏ Neon Rực Lửa (#ff0033)

// Màu vàng chanh neon bám sát viền trong phạm vi ±3cm (#facc15)
export const EDGE_SNAP_COLOR: { r: number; g: number; b: number } = { r: 0.98, g: 0.80, b: 0.08 };

// Màu đỏ cảnh báo cho điểm tràn ra ngoài mép 1~8cm - box cắt lẹm điểm đón tia (#ef4444)
export const CUT_OUT_WARNING_COLOR: { r: number; g: number; b: number } = { r: 0.94, g: 0.27, b: 0.27 };

export interface EdgeContactSide {
  status: "tight" | "cut" | "loose";
  gapCm: number;
  label: string;
}

export interface BoxEdgeContactsResult {
  clientId?: number | string;
  front?: EdgeContactSide;
  rear?: EdgeContactSide;
  left?: EdgeContactSide;
  right?: EdgeContactSide;
  roof?: EdgeContactSide;
  pointCount: number;
}

/**
 * Tính toán trạng thái tiếp xúc mép viền (Edge Contact HUD) cho các mép đón tia (Trước X+, Sau X-, Trái Y+, Phải Y-, Nóc Z+).
 * Tối ưu O(N) với N <= 300 điểm trong phạm vi active box, hoàn tất dưới 0.03ms (Zero-Lag 60 FPS).
 * Kháng báo lỗi giả khi xe có mặt khuất bóng (Occluded / Shadow sides).
 */
export function computeBoxEdgeContacts(
  positions: Float32Array | number[],
  box: Box3DTarget,
  options?: { minPoints?: number; groundNoiseMargin?: number }
): BoxEdgeContactsResult | null {
  if (!box || box.l <= 0 || box.w <= 0 || box.h <= 0) return null;

  const count = Math.floor(positions.length / 3);
  if (count === 0) return null;

  const minPoints = options?.minPoints ?? 3;
  const groundMargin = options?.groundNoiseMargin ?? 0.15; // Loại bỏ điểm nhiễu mặt đất theo GEMINI.md

  const cosY = Math.cos(-box.rz);
  const sinY = Math.sin(-box.rz);
  const hasPitchRoll = !!(box.rx || box.ry);
  const cosP = hasPitchRoll ? Math.cos(-(box.ry || 0)) : 1;
  const sinP = hasPitchRoll ? Math.sin(-(box.ry || 0)) : 0;
  const cosR = hasPitchRoll ? Math.cos(-(box.rx || 0)) : 1;
  const sinR = hasPitchRoll ? Math.sin(-(box.rx || 0)) : 0;

  const halfL = box.l / 2;
  const halfW = box.w / 2;
  const halfH = box.h / 2;
  const maxR = Math.max(box.l, box.w, box.h) * 0.75 + 0.25;

  const zFloor = -halfH + groundMargin;
  const zCeil = halfH + 0.10;

  let maxLx = -Infinity;
  let minLx = Infinity;
  let maxLy = -Infinity;
  let minLy = Infinity;
  let maxLz = -Infinity;
  let validPointCount = 0;

  for (let i = 0; i < count; i++) {
    const idx3 = i * 3;
    const px = positions[idx3];
    const py = positions[idx3 + 1];
    const pz = positions[idx3 + 2];

    const dx = px - box.cx;
    const dy = py - box.cy;
    const dz = pz - box.cz;

    if (Math.abs(dx) > maxR || Math.abs(dy) > maxR || Math.abs(dz) > maxR) {
      continue;
    }

    let lx = dx * cosY - dy * sinY;
    let ly = dx * sinY + dy * cosY;
    let lz = dz;

    if (hasPitchRoll) {
      const lx2 = lx * cosP + lz * sinP;
      const lz2 = -lx * sinP + lz * cosP;
      const ly2 = ly * cosR - lz2 * sinR;
      const lz3 = ly * sinR + lz2 * cosR;
      lx = lx2;
      ly = ly2;
      lz = lz3;
    }

    // Lọc độ cao loại trừ mặt đất và trần
    if (lz < zFloor || lz > zCeil) continue;

    // Giới hạn biên xét trong phạm vi lân cận thân xe (±15cm)
    if (Math.abs(lx) > halfL + 0.15 || Math.abs(ly) > halfW + 0.15) continue;

    validPointCount++;

    // Lọc cực trị độc lập theo hướng đón tia vuông góc để tránh nhiễu chéo góc
    // 1. Mép Trước (X+): nửa trước lx > 0, nằm trong dải chiều ngang |ly| <= halfW + 0.05
    if (lx > 0 && Math.abs(ly) <= halfW + 0.05) {
      if (lx > maxLx) maxLx = lx;
    }
    // 2. Mép Sau (X-): nửa sau lx < 0, nằm trong dải chiều ngang |ly| <= halfW + 0.05
    if (lx < 0 && Math.abs(ly) <= halfW + 0.05) {
      if (lx < minLx) minLx = lx;
    }
    // 3. Mép Trái (Y+): nửa trái ly > 0, nằm trong dải chiều dài |lx| <= halfL + 0.05
    if (ly > 0 && Math.abs(lx) <= halfL + 0.05) {
      if (ly > maxLy) maxLy = ly;
    }
    // 4. Mép Phải (Y-): nửa phải ly < 0, nằm trong dải chiều dài |lx| <= halfL + 0.05
    if (ly < 0 && Math.abs(lx) <= halfL + 0.05) {
      if (ly < minLy) minLy = ly;
    }
    // 5. Nóc xe (Z+): nửa trên lz > 0, nằm trong dải thân xe
    if (lz > 0 && Math.abs(lx) <= halfL + 0.05 && Math.abs(ly) <= halfW + 0.05) {
      if (lz > maxLz) maxLz = lz;
    }
  }

  if (validPointCount < minPoints) {
    return null;
  }

  // Đánh giá trạng thái từng mép, tự động nhận diện mặt khuất không có điểm đón tia
  const evaluateSide = (diff: number, isFound: boolean, maxLooseGap = 0.35): EdgeContactSide | undefined => {
    if (!isFound) return undefined;
    // diff = vị trí cực trị của điểm - mép ngoài cùng của box
    // diff > 0: điểm vượt ra ngoài mép box
    // diff < 0: điểm thụt vào trong so với mép box
    if (diff > 0.01) {
      // Cắt lẹm: điểm tràn ra ngoài mép từ 1cm trở lên
      return {
        status: "cut",
        gapCm: -Math.round(diff * 100),
        label: "Cắt lẹm",
      };
    } else if (Math.abs(diff) <= 0.03) {
      // Khít: điểm bám sát mép trong phạm vi ±3cm
      return {
        status: "tight",
        gapCm: -Math.round(diff * 100),
        label: "Khít",
      };
    } else if (diff >= -maxLooseGap) {
      // Hở: mép box thừa ra ngoài > 3cm và trong phạm vi thân xe đón tia (<= 35cm)
      return {
        status: "loose",
        gapCm: Math.round((-diff) * 100),
        label: "Hở",
      };
    } else {
      // Điểm thụt quá sâu (> 35cm): Mặt khuất (Shadow / Occluded side), không đón tia LiDAR
      return undefined;
    }
  };

  const frontDiff = maxLx - halfL;
  const rearDiff = -halfL - minLx; // minLx < -halfL => -halfL - minLx > 0
  const leftDiff = maxLy - halfW;
  const rightDiff = -halfW - minLy;
  const roofDiff = maxLz - halfH;

  return {
    clientId: box.id ?? box.trackId,
    front: evaluateSide(frontDiff, maxLx !== -Infinity),
    rear: evaluateSide(rearDiff, minLx !== Infinity),
    left: evaluateSide(leftDiff, maxLy !== -Infinity),
    right: evaluateSide(rightDiff, minLy !== Infinity),
    roof: evaluateSide(roofDiff, maxLz !== -Infinity, 0.25),
    pointCount: validPointCount,
  };
}

/**
 * Trích xuất màu sắc riêng biệt (Distinct Color) tương ứng với từng Track ID.
 * - Sử dụng hàm băm số nguyên tố 13 để hai ID cạnh nhau (VD 16 và 17) luôn nhảy xa nhau trên bảng màu.
 * - Khi Active: Đẩy sáng rực rỡ (Full Brightness) kết hợp pha nhẹ ánh vàng neon để nổi bật mà không mất nhận diện track.
 */
export function getDistinctTrackColor(
  trackId: number | string | undefined | null,
  isActive?: boolean,
  theme?: "light" | "dark"
): { r: number; g: number; b: number } {
  let numId = 0;
  if (typeof trackId === "number") {
    numId = Math.abs(trackId);
  } else if (typeof trackId === "string") {
    const parsed = parseInt(trackId, 10);
    if (!isNaN(parsed)) {
      numId = Math.abs(parsed);
    } else {
      for (let i = 0; i < trackId.length; i++) {
        numId = (numId * 31 + trackId.charCodeAt(i)) & 0x7fffffff;
      }
    }
  }

  const palette = theme === "light" ? DEEP_VIVID_TRACK_PALETTE : DISTINCT_TRACK_PALETTE;
  const colorIndex = (numId * 13 + 7) % palette.length;
  const baseColor = palette[colorIndex];

  if (isActive) {
    if (theme === "light") {
      // Khi Active trên nền trắng: Tăng độ đậm và viền vàng cam rực rỡ
      return {
        r: Math.min(1.0, baseColor.r * 0.75 + 0.98 * 0.25),
        g: Math.min(1.0, baseColor.g * 0.75 + 0.70 * 0.25),
        b: Math.min(1.0, baseColor.b * 0.75 + 0.05 * 0.25),
      };
    }
    // Khi Active trên nền tối: Tăng sáng rực rỡ pha nhẹ 20% ánh vàng chanh neon (#facc15)
    return {
      r: Math.min(1.0, baseColor.r * 0.8 + 0.98 * 0.2),
      g: Math.min(1.0, baseColor.g * 0.8 + 0.80 * 0.2),
      b: Math.min(1.0, baseColor.b * 0.8 + 0.08 * 0.2),
    };
  }

  return baseColor;
}

/**
 * Tính toán mảng màu Float32Array (RGB) cho toàn bộ mây điểm LiDAR.
 * - Nền trắng (Light): Điểm ngoài xe bọc đen hoàn toàn 100% (0.0, 0.0, 0.0), xe bọc màu đậm sâu bão hòa cao nhất.
 * - Nền đen (Dark): Điểm ngoài xe bọc trắng 100% (1.0, 1.0, 1.0), xe bọc sáng rõ.
 * - OVERLAP WARNING: Điểm nằm trong vùng giao nhau từ 2..N box phát sáng ĐỎ NEON RỰC LỬA (#ff0033).
 */
export function computePointCloudColors(
  positions: Float32Array | number[],
  intensities: Float32Array | number[] | null | undefined,
  boxes: Box3DTarget[],
  options: PointCloudColorOptions,
  outColors?: Float32Array
): Float32Array {
  const count = Math.floor(positions.length / 3);
  const colors = outColors && outColors.length === count * 3 ? outColors : new Float32Array(count * 3);

  const isLight = options.theme === "light";
  const isPlainMode = options.mode === "plain";
  const colorizeBoxed = options.colorizeBoxed !== false && boxes.length > 0;
  const defaultBg = isLight ? 0.0 : 1.0;
  const plainR = options.plainColor?.r ?? defaultBg;
  const plainG = options.plainColor?.g ?? defaultBg;
  const plainB = options.plainColor?.b ?? defaultBg;

  // Tiền xử lý thông tin các Box để tăng tốc độ kiểm tra Point-in-Box
  interface FastBox {
    cx: number;
    cy: number;
    cz: number;
    rx: number;
    ry: number;
    rz: number;
    cosY: number;
    sinY: number;
    halfL: number;
    halfW: number;
    halfH: number;
    maxR: number;
    colorR: number;
    colorG: number;
    colorB: number;
    isActive: boolean;
  }

  const fastBoxes: FastBox[] = [];
  if (colorizeBoxed) {
    for (const b of boxes) {
      if (!b || b.l <= 0 || b.w <= 0 || b.h <= 0) continue;
      const cosY = Math.cos(-b.rz);
      const sinY = Math.sin(-b.rz);
      const maxR = Math.max(b.l, b.w, b.h) * 0.75;

      let c = b.color;
      if (!c) {
        const boxId = b.trackId ?? b.id;
        if (boxId !== undefined && boxId !== null) {
          c = getDistinctTrackColor(boxId, b.isActive, options.theme);
        } else if (b.isActive) {
          c = options.activeBoxColor || (options.theme === "light" ? { r: 0.85, g: 0.60, b: 0.02 } : DEFAULT_LABEL_COLORS.active);
        } else {
          const cat = (b.category || "car").toLowerCase();
          c = DEFAULT_LABEL_COLORS[cat] || DEFAULT_LABEL_COLORS.car;
        }
      }

      fastBoxes.push({
        cx: b.cx,
        cy: b.cy,
        cz: b.cz,
        rx: b.rx || 0,
        ry: b.ry || 0,
        rz: b.rz,
        cosY,
        sinY,
        halfL: b.l / 2,
        halfW: b.w / 2,
        halfH: b.h / 2,
        maxR,
        colorR: c.r,
        colorG: c.g,
        colorB: c.b,
        isActive: !!b.isActive,
      });
    }
  }

  const numBoxes = fastBoxes.length;
  const activeBox = fastBoxes.find((b) => b.isActive);

  for (let i = 0; i < count; i++) {
    const idx3 = i * 3;
    const px = positions[idx3];
    const py = positions[idx3 + 1];
    const pz = positions[idx3 + 2];

    // Lấy giá trị Intensity chuẩn hóa v in [0, 1] (Defensive Programming chống NaN / Infinity)
    let v = 0.5;
    if (intensities && i < intensities.length) {
      const rawInt = intensities[i];
      if (typeof rawInt === "number" && !isNaN(rawInt) && isFinite(rawInt)) {
        v = rawInt <= 1.0 ? Math.max(0, rawInt) : Math.min(1.0, Math.max(0, rawInt) / 255);
      }
    }

    // 1. Kiểm tra điểm có nằm trong 3D Box nào không (Hỗ trợ phát hiện Overlap 2..N box)
    let matchedBox: FastBox | null = null;
    let matchCount = 0;

    if (numBoxes > 0) {
      for (let k = 0; k < numBoxes; k++) {
        const b = fastBoxes[k];
        const dx = px - b.cx;
        const dy = py - b.cy;
        const dz = pz - b.cz;

        // AABB pre-filter
        if (Math.abs(dx) > b.maxR || Math.abs(dy) > b.maxR || Math.abs(dz) > b.maxR) {
          continue;
        }

        let lx = dx * b.cosY - dy * b.sinY;
        let ly = dx * b.sinY + dy * b.cosY;
        let lz = dz;

        if (b.rx || b.ry) {
          const cosP = Math.cos(-b.ry);
          const sinP = Math.sin(-b.ry);
          const lx2 = lx * cosP + lz * sinP;
          const lz2 = -lx * sinP + lz * cosP;

          const cosR = Math.cos(-b.rx);
          const sinR = Math.sin(-b.rx);
          const ly2 = ly * cosR - lz2 * sinR;
          const lz3 = ly * sinR + lz2 * cosR;

          lx = lx2;
          ly = ly2;
          lz = lz3;
        }

        if (Math.abs(lx) <= b.halfL && Math.abs(ly) <= b.halfW && Math.abs(lz) <= b.halfH) {
          matchCount++;
          if (matchCount === 1) {
            matchedBox = b;
          } else {
            // Đã phát hiện Overlap từ 2 box trở lên! Early Exit siêu tốc
            matchedBox = null;
            break;
          }
        }
      }
    }

    // 2. Kiểm tra Cảnh Báo Viền & Cắt Lẹm đối với Active Box (Top / Side / Front Edge Snap)
    let isCutOut = false;
    let isEdgeSnap = false;

    if (activeBox) {
      const adx = px - activeBox.cx;
      const ady = py - activeBox.cy;
      const adz = pz - activeBox.cz;
      if (
        Math.abs(adx) <= activeBox.maxR + 0.15 &&
        Math.abs(ady) <= activeBox.maxR + 0.15 &&
        Math.abs(adz) <= activeBox.maxR + 0.15
      ) {
        let alx = adx * activeBox.cosY - ady * activeBox.sinY;
        let aly = adx * activeBox.sinY + ady * activeBox.cosY;
        let alz = adz;

        if (activeBox.rx || activeBox.ry) {
          const cosP = Math.cos(-activeBox.ry);
          const sinP = Math.sin(-activeBox.ry);
          const lx2 = alx * cosP + alz * sinP;
          const lz2 = -alx * sinP + alz * cosP;
          const cosR = Math.cos(-activeBox.rx);
          const sinR = Math.sin(-activeBox.rx);
          const ly2 = aly * cosR - lz2 * sinR;
          const lz3 = aly * sinR + lz2 * cosR;
          alx = lx2;
          aly = ly2;
          alz = lz3;
        }

        // Lọc tầng độ cao: Cắt bỏ nhiễu sát sàn theo chuẩn GEMINI.md
        const zFloor = -activeBox.halfH + 0.15;
        const zCeil = activeBox.halfH + 0.10;
        if (alz >= zFloor && alz <= zCeil) {
          // Kiểm tra Cắt Lẹm Ngoài Mép (1cm ~ 8cm) - Bao quát cả 3 view Top (X, Y), Side (X, Z), Front (Y, Z)
          const dFront = alx - activeBox.halfL;
          const dRear = -activeBox.halfL - alx;
          const dLeft = aly - activeBox.halfW;
          const dRight = -activeBox.halfW - aly;
          const dRoof = alz - activeBox.halfH;

          const isCutFront = dFront > 0.01 && dFront <= 0.08 && Math.abs(aly) <= activeBox.halfW + 0.05;
          const isCutRear = dRear > 0.01 && dRear <= 0.08 && Math.abs(aly) <= activeBox.halfW + 0.05;
          const isCutLeft = dLeft > 0.01 && dLeft <= 0.08 && Math.abs(alx) <= activeBox.halfL + 0.05;
          const isCutRight = dRight > 0.01 && dRight <= 0.08 && Math.abs(alx) <= activeBox.halfL + 0.05;
          const isCutRoof = dRoof > 0.01 && dRoof <= 0.08 && Math.abs(alx) <= activeBox.halfL + 0.05 && Math.abs(aly) <= activeBox.halfW + 0.05;

          if (isCutFront || isCutRear || isCutLeft || isCutRight || isCutRoof) {
            isCutOut = true;
          } else if (
            Math.abs(alx) <= activeBox.halfL + 0.01 &&
            Math.abs(aly) <= activeBox.halfW + 0.01 &&
            alz <= activeBox.halfH + 0.01
          ) {
            // Điểm nằm trong hoặc sát mép (<= 1cm) -> Kiểm tra Bám Sát Viền (±3cm) trên cả 3 chiều
            const distX = Math.min(Math.abs(alx - activeBox.halfL), Math.abs(alx + activeBox.halfL));
            const distY = Math.min(Math.abs(aly - activeBox.halfW), Math.abs(aly + activeBox.halfW));
            const distZ = Math.abs(alz - activeBox.halfH);
            if (Math.min(distX, distY, distZ) <= 0.03) {
              isEdgeSnap = true;
            }
          }
        }
      }
    }

    if (matchCount >= 2) {
      // VÙNG CHỒNG LẤN TỪ 2 ĐẾN N BOX: ĐỎ NEON CẢNH BÁO (#ff0033) SÁNG RỰC RỠ FULL BRIGHTNESS
      colors[idx3] = OVERLAP_WARNING_COLOR.r;
      colors[idx3 + 1] = OVERLAP_WARNING_COLOR.g;
      colors[idx3 + 2] = OVERLAP_WARNING_COLOR.b;
    } else if (isCutOut) {
      // ĐIỂM BỊ CẮT LẸM NGOÀI MÉP ACTIVE BOX (1~8cm): ĐỎ CẢNH BÁO (#ef4444)
      colors[idx3] = CUT_OUT_WARNING_COLOR.r;
      colors[idx3 + 1] = CUT_OUT_WARNING_COLOR.g;
      colors[idx3 + 2] = CUT_OUT_WARNING_COLOR.b;
    } else if (isEdgeSnap) {
      // ĐIỂM BÁM SÁT VIỀN ACTIVE BOX (±3cm): VÀNG CHANH NEON (#facc15)
      colors[idx3] = EDGE_SNAP_COLOR.r;
      colors[idx3 + 1] = EDGE_SNAP_COLOR.g;
      colors[idx3 + 2] = EDGE_SNAP_COLOR.b;
    } else if (matchedBox) {
      // ĐIỂM NẰM TRONG 1 XE BỌC DUY NHẤT: Nhuộm màu riêng biệt theo Track ID (Đậm nhất có thể, factor = 1.0)
      const factor = 1.0;
      colors[idx3] = matchedBox.colorR * factor;
      colors[idx3 + 1] = matchedBox.colorG * factor;
      colors[idx3 + 2] = matchedBox.colorB * factor;
    } else {
      // ĐIỂM NGOÀI XE BỌC:
      // Nền trắng: PHẢI ĐEN HOÀN TOÀN 100% (r: 0.0, g: 0.0, b: 0.0)
      // Nền đen: PHẢI TRẮNG 100% (r: 1.0, g: 1.0, b: 1.0)
      // Áp dụng cho cả plain lẫn intensity mode
      colors[idx3] = plainR;
      colors[idx3 + 1] = plainG;
      colors[idx3 + 2] = plainB;
    }
  }

  return colors;
}

/**
 * Bí danh đồng bộ cho computeBoxEdgeContacts theo kiến trúc refactoring.
 */
export const calculateBoxEdgeContacts = computeBoxEdgeContacts;
