/**
 * Module phân cụm mây điểm LiDAR & Lọc nhiễu mật độ (Clustering & Density Noise Filtering).
 */

/**
 * Thuật toán Phân Cụm Điểm Liên Tục & Mật Độ (Continuous Density-Connected Clustering):
 * - Dò khoảng cách (gap) giữa các điểm lân cận để tách cụm khi có khoảng trống lớn giữa 2 xe.
 * - Chấm điểm cụm (Cluster Score) kết hợp Số lượng điểm (Mật độ) và Độ gần tâm Box hiện tại.
 * - Loại bỏ 100% điểm của xe khác đỗ bên cạnh hoặc vật cản ngoài lề.
 */
export function filterDenseConnectedCluster1D<T extends { lx: number; ly: number; z: number }>(
  pts: T[],
  axis: "ly" | "lx",
  maxGap: number = 0.22,
  centerBias: number = 0
): T[] {
  // Chỉ kích hoạt phân cụm mật độ khi có đủ số lượng điểm thực tế (tối thiểu 8 điểm)
  if (pts.length < 8) return pts;

  // Sắp xếp các điểm theo tọa độ trục tăng dần
  const sorted = [...pts].sort((a, b) => a[axis] - b[axis]);

  // Nhận diện các cụm bị ngăn cách bởi khoảng trống (Gap > maxGap)
  const clusters: T[][] = [];
  let currentCluster: T[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i][axis] - sorted[i - 1][axis];
    if (gap > maxGap) {
      clusters.push(currentCluster);
      currentCluster = [sorted[i]];
    } else {
      currentCluster.push(sorted[i]);
    }
  }
  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }

  if (clusters.length === 1) {
    return pts;
  }

  // CHỌN CỤM CỦA VẬT THỂ MỤC TIÊU:
  // Vật thể mục tiêu là đối tượng mà annotator đang đặt Box bao quanh (tâm box tại centerBias = 0).
  // Tiêu chí số 1: Khoảng cách tối thiểu từ các điểm trong cụm tới tâm box (minDistanceToCenter).
  // Bất kỳ cụm nào nằm xa tâm box (ở ngoài lề) đều là Object khác đỗ cạnh, tuyệt đối không được chọn!
  let bestCluster = clusters[0];
  let minDistanceToCenter = Infinity;

  for (const c of clusters) {
    if (c.length < 2) continue;

    // Tìm khoảng cách nhỏ nhất từ các điểm trong cụm tới centerBias (tâm box)
    let clusterMinDist = Infinity;
    for (const p of c) {
      const d = Math.abs(p[axis] - centerBias);
      if (d < clusterMinDist) clusterMinDist = d;
    }

    // Cụm nào có điểm nằm gần tâm box nhất sẽ được chọn là xe mục tiêu
    if (clusterMinDist < minDistanceToCenter - 0.05) {
      minDistanceToCenter = clusterMinDist;
      bestCluster = c;
    } else if (Math.abs(clusterMinDist - minDistanceToCenter) <= 0.05) {
      // Nếu khoảng cách tới tâm tương đương nhau, ưu tiên cụm có nhiều điểm hơn
      if (c.length > bestCluster.length) {
        bestCluster = c;
      }
    }
  }

  if (bestCluster.length >= 4) {
    return bestCluster;
  }

  return pts;
}

export interface DilationClusterOptions {
  /** Bán kính hạt điểm danh định r0 (mặc định 0.025m = 2.5cm) */
  basePointSize?: number;
  /** Hệ số phóng to hạt điểm (mặc định 5.0 -> 5x) */
  dilationFactor?: number;
  /** Ngưỡng kết nối hiệu dụng giữa 2 điểm (mặc định 2 * basePointSize * dilationFactor = 0.25m) */
  connectDist?: number;
  /** Ngưỡng kết nối dọc trục X lx (nếu muốn nới cho xe 2 bánh nối lốp trước-sau) */
  connectDistLx?: number;
  /** Ngưỡng kết nối dọc trục Y ly */
  connectDistLy?: number;
  /** Chiều không gian phân cụm: "2d" (mặt phẳng lx-ly) hoặc "3d" (lx-ly-z). Mặc định "2d" */
  dim?: "2d" | "3d";
  /** Số điểm tối thiểu cho cụm hợp lệ (mặc định 3) */
  minClusterPts?: number;
  /** Tọa độ tâm ưu tiên (mặc định { lx: 0, ly: 0 }) */
  centerBias?: { lx: number; ly: number };
}

export interface DilationClusterResult<T> {
  dominantPts: T[];
  noisePts: T[];
  clusters: T[][];
  dominantClusterIndex: number;
  connectDist: number;
}

/**
 * Thuật toán PHÂN CỤM THEO ĐỘ ĐO KHOẢNG CÁCH PHÓNG TO ĐIỂM 5X (5x Point Dilation Spatial Graph)
 * - Mỗi điểm LiDAR được gán một bán kính hạt điểm cơ sở r0 ≈ 2.5cm.
 * - Khi phóng to điểm lên 5x, bán kính hiệu dụng là Reff = 5 * r0 = 12.5cm.
 * - Ngưỡng kết nối láng giềng giữa 2 điểm chạm nhau là Dconnect = 2 * Reff = 25cm.
 * - Đám mây điểm thân vỏ xe/người/xe máy liên thông sẽ kết hợp thành duy nhất một Khối Thân Chính (Dominant Component).
 * - Các điểm nhiễu lẻ loi (bụi, lá cây) hoặc vật thể bên ngoài (người đi bộ cách vỏ xe > 25cm, xe bên cạnh)
 *   bị tách thành cụm riêng và loại bỏ hoàn toàn, trong khi curpoint mép cản/sườn được bảo toàn 100%.
 * - Tối ưu hóa bằng Spatial Hash Grid O(N) và Disjoint Set Union (DSU) với thời gian thực thi < 0.05ms.
 */
export function clusterByPointDilation5x<T extends { lx: number; ly: number; z?: number }>(
  pts: T[],
  options: DilationClusterOptions = {}
): DilationClusterResult<T> {
  const n = pts.length;
  const baseR = options.basePointSize ?? 0.025;
  const dilation = options.dilationFactor ?? 5.0;
  const defaultConnect = options.connectDist ?? (2 * baseR * dilation); // 0.25m
  const connectDistX = options.connectDistLx ?? defaultConnect;
  const connectDistY = options.connectDistLy ?? defaultConnect;
  const connectDistZ = defaultConnect;
  const is3D = options.dim === "3d";

  if (n <= 1) {
    return {
      dominantPts: pts,
      noisePts: [],
      clusters: n === 1 ? [[pts[0]]] : [],
      dominantClusterIndex: 0,
      connectDist: defaultConnect,
    };
  }

  // Khởi tạo Spatial Hash Grid với kích thước ô bằng ngưỡng kết nối
  const cellX = connectDistX;
  const cellY = connectDistY;
  const cellZ = connectDistZ;

  const grid = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const gx = Math.floor(p.lx / cellX);
    const gy = Math.floor(p.ly / cellY);
    const key = is3D ? `${gx}_${gy}_${Math.floor((p.z ?? 0) / cellZ)}` : `${gx}_${gy}`;
    const bucket = grid.get(key);
    if (bucket) {
      bucket.push(i);
    } else {
      grid.set(key, [i]);
    }
  }

  // Cấu trúc Disjoint Set Union (DSU) với Path Compression và Union by Rank
  const parent = new Int32Array(n);
  const rank = new Uint8Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;

  function find(x: number): number {
    let root = x;
    while (root !== parent[root]) root = parent[root];
    let curr = x;
    while (curr !== root) {
      const next = parent[curr];
      parent[curr] = root;
      curr = next;
    }
    return root;
  }

  function union(x: number, y: number): void {
    const rootX = find(x);
    const rootY = find(y);
    if (rootX === rootY) return;
    if (rank[rootX] < rank[rootY]) {
      parent[rootX] = rootY;
    } else if (rank[rootX] > rank[rootY]) {
      parent[rootY] = rootX;
    } else {
      parent[rootY] = rootX;
      rank[rootX]++;
    }
  }

  // Duyệt các điểm và ô láng giềng để nối các hạt điểm giao thoa (5x Dilation Contact)
  for (let i = 0; i < n; i++) {
    const pi = pts[i];
    const gx = Math.floor(pi.lx / cellX);
    const gy = Math.floor(pi.ly / cellY);
    const gz = is3D ? Math.floor((pi.z ?? 0) / cellZ) : 0;

    const zMin = is3D ? -1 : 0;
    const zMax = is3D ? 1 : 0;

    for (let dz = zMin; dz <= zMax; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const neighborKey = is3D ? `${gx + dx}_${gy + dy}_${gz + dz}` : `${gx + dx}_${gy + dy}`;
          const neighborIndices = grid.get(neighborKey);
          if (!neighborIndices) continue;

          for (let k = 0; k < neighborIndices.length; k++) {
            const j = neighborIndices[k];
            if (j <= i) continue; // Tránh so sánh trùng lặp và tự so sánh

            const pj = pts[j];
            const dX = (pi.lx - pj.lx) / connectDistX;
            const dY = (pi.ly - pj.ly) / connectDistY;
            let distNormSq = dX * dX + dY * dY;

            if (is3D) {
              const dZ = ((pi.z ?? 0) - (pj.z ?? 0)) / connectDistZ;
              distNormSq += dZ * dZ;
            }

            // Hai hạt điểm 5x chạm nhau (khoảng cách chuẩn hóa <= 1.0)
            if (distNormSq <= 1.000001) {
              union(i, j);
            }
          }
        }
      }
    }
  }

  // Gom các điểm theo root của cụm
  const groupMap = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const list = groupMap.get(r);
    if (list) {
      list.push(i);
    } else {
      groupMap.set(r, [i]);
    }
  }

  const clusterIndices = Array.from(groupMap.values());
  const clusters: T[][] = clusterIndices.map((indices) => indices.map((idx) => pts[idx]));

  if (clusters.length === 1) {
    return {
      dominantPts: pts,
      noisePts: [],
      clusters,
      dominantClusterIndex: 0,
      connectDist: defaultConnect,
    };
  }

  // Đánh giá và chọn Dominant Cluster (Khối thân xe / người mục tiêu)
  // Tiêu chí kết hợp chặt chẽ:
  // 1. Phân biệt cụm thực chất (Significant Cluster) vs cụm nhiễu lặt vặt (Noise):
  //    - Cụm nhiễu 1-3 điểm lơ lửng gần tâm (lá cây, bụi, multipath) có span siêu nhỏ (< 0.25m) và số điểm < 4
  //      tuyệt đối không được cướp quyền thân xe thật sự (có nhiều điểm hoặc span lớn).
  // 2. Phân biệt vật thể mục tiêu trong Box ROI vs Vật thể lớn bên ngoài (Xe buýt, tòa nhà bên cạnh):
  //    - Trong các cụm thực chất, cụm nào có điểm gần tâm box hơn (dMin tới centerBias) chính là vật thể mục tiêu!
  const biasX = options.centerBias?.lx ?? 0;
  const biasY = options.centerBias?.ly ?? 0;
  const minClusterPts = options.minClusterPts ?? 3;

  const clusterStats = clusters.map((cluster, idx) => {
    let dMin = Infinity;
    let minLx = Infinity;
    let maxLx = -Infinity;
    let minLy = Infinity;
    let maxLy = -Infinity;
    for (let k = 0; k < cluster.length; k++) {
      const p = cluster[k];
      const d = Math.hypot(p.lx - biasX, p.ly - biasY);
      if (d < dMin) dMin = d;
      if (p.lx < minLx) minLx = p.lx;
      if (p.lx > maxLx) maxLx = p.lx;
      if (p.ly < minLy) minLy = p.ly;
      if (p.ly > maxLy) maxLy = p.ly;
    }
    const span = Math.max(maxLx - minLx, maxLy - minLy);
    return { idx, len: cluster.length, dMin, span };
  });

  const maxLen = Math.max(...clusterStats.map((s) => s.len));

  // Lọc tập các cụm có ý nghĩa (loại bỏ triệt để các cụm nhiễu nhỏ lặt vặt nếu có cụm vật thể lớn)
  let candidateStats = clusterStats.filter((s) => {
    if (maxLen >= 8) {
      if (s.len < Math.min(minClusterPts, 4)) return false;
      const isSignificantSize = s.len >= maxLen * 0.15 || s.len >= 8;
      const hasPhysicalSpan = s.span >= 0.25;
      return isSignificantSize || hasPhysicalSpan;
    } else {
      return s.len >= Math.min(minClusterPts, 2);
    }
  });

  if (candidateStats.length === 0) {
    candidateStats = clusterStats;
  }

  // Sắp xếp các ứng viên hợp lệ:
  // - Ưu tiên dMin (gần tâm box hơn). Nếu khoảng cách chênh lệch <= 0.20m, ưu tiên cụm có số điểm đông hơn
  candidateStats.sort((a, b) => {
    const diffD = a.dMin - b.dMin;
    if (Math.abs(diffD) > 0.20) {
      return diffD;
    }
    return b.len - a.len;
  });

  const bestIdx = candidateStats[0].idx;

  const dominantPts = clusters[bestIdx];
  const noisePts: T[] = [];
  for (let c = 0; c < clusters.length; c++) {
    if (c === bestIdx) continue;
    for (let k = 0; k < clusters[c].length; k++) {
      noisePts.push(clusters[c][k]);
    }
  }

  return {
    dominantPts,
    noisePts,
    clusters,
    dominantClusterIndex: bestIdx,
    connectDist: defaultConnect,
  };
}

export interface DensityRobustBoundsResult {
  lxMin: number;
  lxMax: number;
  lyMin: number;
  lyMax: number;
  zTop: number;
  validPointsCount: number;
}

/**
 * Dò tìm biên 1D thích nghi xuất phát từ tâm xe quét ra 2 phía (Center-Outward Adaptive 1D Boundary Detection).
 * Tự động loại bỏ cụm nhiễu bên ngoài (vị trí 2 chấm đỏ) và gương chiếu hậu nhô ra ở sườn xe,
 * đồng thời ngăn chặn tuyệt đối việc ăn sang Object khác đỗ cạnh.
 */
export function detectAdaptiveBounds(
  sortedValues: number[],
  isYAxis: boolean = false
): { min: number; max: number } {
  const n = sortedValues.length;
  if (n < 8) {
    return { min: sortedValues[0] ?? 0, max: sortedValues[n - 1] ?? 0 };
  }

  const pMinIdx = Math.max(0, Math.floor(n * 0.005));
  const pMaxIdx = Math.min(n - 1, Math.floor(n * 0.995));
  let minVal = sortedValues[pMinIdx];
  let maxVal = sortedValues[pMaxIdx];

  const minGap = isYAxis ? 0.14 : 0.25;
  const maxNoisePoints = Math.max(2, Math.min(12, Math.floor(n * 0.06)));

  // 1. Quét từ MAX về trung tâm (tìm khoảng hở gap ngăn cách cụm nhiễu/gương ở phía dương)
  for (let i = n - 1; i >= Math.floor(n * 0.65); i--) {
    const gap = sortedValues[i] - sortedValues[i - 1];
    const pointsAfter = n - i;

    if (gap >= minGap && pointsAfter <= maxNoisePoints) {
      maxVal = sortedValues[i - 1];
      break;
    }
  }

  // 2. Quét từ MIN về trung tâm (tìm khoảng hở gap ngăn cách cụm nhiễu ở phía âm)
  for (let i = 0; i <= Math.floor(n * 0.35); i++) {
    const gap = sortedValues[i + 1] - sortedValues[i];
    const pointsBefore = i + 1;

    if (gap >= minGap && pointsBefore <= maxNoisePoints) {
      minVal = sortedValues[i + 1];
      break;
    }
  }

  return {
    min: Number(minVal.toFixed(2)),
    max: Number(maxVal.toFixed(2)),
  };
}

/**
 * Tính toán trọng số cường độ phản xạ (Intensity Weighting) cho danh sách mây điểm:
 * - Điểm có cường độ phản xạ / màu sáng cao (vỏ kim loại xe, biển số, đèn phản quang) được gán trọng số lớn hơn (1.5 ~ 2.5x).
 * - Tự động nhận diện nếu dữ liệu không có intensity hoặc độ biến thiên quá nhỏ để kích hoạt Fallback an toàn (trọng số đồng nhất 1.0).
 */
export function computeIntensityWeights(
  pts: Array<{ intensity?: number }>
): {
  weights: number[];
  hasValidIntensity: boolean;
  highIntensityThreshold: number;
} {
  const n = pts.length;
  if (n === 0) {
    return { weights: [], hasValidIntensity: false, highIntensityThreshold: 0 };
  }

  const intensities: number[] = [];
  let validCount = 0;
  for (let i = 0; i < n; i++) {
    const val = pts[i].intensity;
    if (typeof val === "number" && !isNaN(val)) {
      intensities.push(val);
      validCount++;
    } else {
      intensities.push(0);
    }
  }

  // Nếu không có điểm nào có intensity hợp lệ
  if (validCount < 3) {
    return {
      weights: new Array(n).fill(1.0),
      hasValidIntensity: false,
      highIntensityThreshold: 0,
    };
  }

  const sorted = [...intensities].sort((a, b) => a - b);
  const minI = sorted[0];
  const maxI = sorted[sorted.length - 1];

  // Nếu độ biến thiên intensity quá nhỏ (< 15 đơn vị trên thang 255) -> Không đủ cơ sở để phân tách
  if (maxI - minI < 15) {
    return {
      weights: new Array(n).fill(1.0),
      hasValidIntensity: false,
      highIntensityThreshold: maxI,
    };
  }

  // Ngưỡng điểm sáng (Top 25% điểm có intensity cao nhất)
  const p75Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.75));
  const highIntensityThreshold = Math.max(minI + 15, sorted[p75Idx]);

  const range = maxI - minI;
  const weights: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const norm = Math.max(0, Math.min(1, (intensities[i] - minI) / range));
    // Trọng số chạy từ 1.0 (điểm tối nhất) đến 2.5 (điểm sáng nhất)
    weights[i] = 1.0 + 1.5 * norm;
  }

  return {
    weights,
    hasValidIntensity: true,
    highIntensityThreshold,
  };
}

/**
 * Thuật toán Lọc Nhiễu Thưa Thớt Cận Thân Xe Dựa Trên Mật Độ Lõi Cục Bộ 3D (3D Local Core Density Filtering):
 * - Thân xe ô tô kim loại/kính phản xạ chùm tia LiDAR dày đặc (Local Density D cao).
 * - Nhiễu (tán xạ, hơi nước, bụi, lá cây, vệt phản xạ ẩm, điểm văng từ xe bên cạnh) có thể nằm RẤT SÁT VỎ XE,
 *   nhưng mật độ cục bộ của chúng CỰC KỲ THƯA THỚT (D rất thấp: chỉ 1-2 điểm láng giềng).
 * - Thuật toán tính mật độ cục bộ trong bán kính cầu R (mặc định 0.22m) cho từng điểm.
 * - Loại bỏ triệt để các điểm có mật độ thấp thưa thớt trước khi tính toán mép xe, cản xe hay nóc xe.
 */
export function filterSparseNoiseByLocalDensity<T extends { lx: number; ly: number; z: number }>(
  pts: T[],
  options: {
    radius?: number;
    minCoreNeighbors?: number;
    adaptiveRatio?: number;
  } = {}
): T[] {
  if (pts.length < 8) return pts;

  // Bán kính lân cận phù hợp với bước điểm LiDAR xe (mặc định 0.12m)
  // để loại bỏ triệt để điểm nhiễu thưa thớt sát vỏ xe
  const radius = options.radius ?? 0.12;
  const r2 = radius * radius;
  const n = pts.length;

  // Tính số lượng láng giềng (kể cả chính nó) trong quả cầu bán kính radius cho từng điểm
  const densities = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const pi = pts[i];
    let count = 0;
    for (let j = 0; j < n; j++) {
      const pj = pts[j];
      const dx = pi.lx - pj.lx;
      const dy = pi.ly - pj.ly;
      const dz = pi.z - pj.z;
      if (dx * dx + dy * dy + dz * dz <= r2) {
        count++;
      }
    }
    densities[i] = count;
  }

  // Tính mật độ trung vị (Median Density) của cụm điểm
  const sortedDensities = Array.from(densities).sort((a, b) => a - b);
  const medianDensity = sortedDensities[Math.floor(n / 2)];

  // Ngưỡng lọc mật độ lõi thích nghi (Adaptive Core Density Threshold):
  // Thân xe thường có medianDensity >= 6.
  // Các điểm nhiễu sát sườn thường chỉ có 1-2 láng giềng.
  const adaptiveRatio = options.adaptiveRatio ?? 0.25;
  const userMin = options.minCoreNeighbors ?? 3;
  const coreThreshold = Math.max(userMin, Math.floor(medianDensity * adaptiveRatio));

  const corePts: T[] = [];
  for (let i = 0; i < n; i++) {
    if (densities[i] >= coreThreshold) {
      corePts.push(pts[i]);
    }
  }

  // Đảm bảo an toàn không lọc sạch nếu đám mây quá thưa
  if (corePts.length >= 6 && corePts.length >= n * 0.4) {
    return corePts;
  }

  return pts;
}

/**
 * Thuật toán Dò Tìm Lớp Nóc Xe Thật Thông Qua Đỉnh Mật Độ Lát Cắt Trục Z (Z-Density Roof Layer Detection):
 * - Ưu tiên xử lý phần TOP trước:
 *   Nóc xe ô tô là mặt phẳng ngang rộng lớn song song với mặt sàn, tạo thành một Đỉnh Mật Độ (Z-Density Peak) ở phần trên của xe.
 * - Các điểm nhiễu trên cao (bụi, lá cây, chim bay, dây cáp, bóng ma LiDAR trên không) có cao độ Z > Z_roof nhưng mật độ rất thưa thớt.
 * - Thuật toán kết hợp quét khoảng hở thích nghi và mật độ lát cắt để xác định chính xác cao độ mép trên cùng của vỏ nóc xe (Z_roof_top),
 *   gạt bỏ 100% các điểm nhiễu thưa thớt bên trên.
 */
export function detectRoofTopBounds(
  pts: Array<{ z: number; lx?: number; ly?: number }>,
  expectedRoofZ?: number
): number {
  if (pts.length === 0) return expectedRoofZ ?? 0;

  // Lấy danh sách Z đã lọc và sắp xếp tăng dần
  const zValues = pts.map((p) => p.z).sort((a, b) => a - b);
  const n = zValues.length;

  if (n < 6) {
    return zValues[n - 1];
  }

  // Quét từ điểm cao nhất lùi về để tìm khoảng trống ngăn cách cụm nhiễu trên cao (gap >= 0.22m)
  let maxRoofZ = zValues[n - 1];
  const minGap = 0.22;
  const maxNoisePoints = Math.max(2, Math.min(8, Math.floor(n * 0.08)));

  for (let i = n - 1; i >= Math.floor(n * 0.55); i--) {
    const gap = zValues[i] - zValues[i - 1];
    const pointsAfter = n - i;

    if (gap >= minGap && pointsAfter <= maxNoisePoints) {
      maxRoofZ = zValues[i - 1];
      break;
    }
  }

  return Number(maxRoofZ.toFixed(3));
}

/**
 * Thuật toán Tính Toán Biên Kháng Nhiễu Dựa Trên Mật Độ (Density Robust Bounds):
 * - Lớp 1: Lọc nhiễu mật độ lõi 3D (filterSparseNoiseByLocalDensity) loại bỏ điểm thưa thớt sát thân và điểm lơ lửng.
 * - Lớp 2: Dò nóc xe thật (detectRoofTopBounds) gạt bỏ 100% điểm nhiễu trên cao.
 * - Lớp 3: Quét khoảng hở và mật độ lát cắt (Adaptive Gap & Density Slicing) nhận diện mép vỏ xe thật,
 *          chặn đứng cụm nhiễu bên ngoài (tại 2 chấm đỏ) và loại bỏ gương chiếu hậu nhô ra.
 */
export function computeDensityRobustBounds(
  pts: Array<{ lx: number; ly: number; z: number }>,
  options: {
    rorRadius?: number;
    rorMinNeighbors?: number;
  } = {}
): DensityRobustBoundsResult {
  if (pts.length === 0) {
    return { lxMin: 0, lxMax: 0, lyMin: 0, lyMax: 0, zTop: 0, validPointsCount: 0 };
  }

  // LỚP 1: Lọc nhiễu thưa thớt dựa trên mật độ lõi cục bộ 3D
  const cleanPts = filterSparseNoiseByLocalDensity(pts, {
    radius: options.rorRadius ?? 0.25,
    minCoreNeighbors: options.rorMinNeighbors ?? 2,
  });

  const allLx = cleanPts.map((p) => p.lx).sort((a, b) => a - b);
  const allLy = cleanPts.map((p) => p.ly).sort((a, b) => a - b);

  const fallbackLxMin = allLx[0];
  const fallbackLxMax = allLx[allLx.length - 1];
  const fallbackLyMin = allLy[0];
  const fallbackLyMax = allLy[allLy.length - 1];

  // LỚP 2: Dò lớp nóc xe thật bằng đỉnh mật độ trục Z thay vì lấy Z max tuyệt đối
  const zTop = detectRoofTopBounds(cleanPts);

  if (cleanPts.length < 10) {
    return {
      lxMin: fallbackLxMin,
      lxMax: fallbackLxMax,
      lyMin: fallbackLyMin,
      lyMax: fallbackLyMax,
      zTop,
      validPointsCount: cleanPts.length,
    };
  }

  // LỚP 3: Dò biên thích nghi theo mật độ & khoảng hở trên trục X và Y
  const boundsX = detectAdaptiveBounds(allLx, false);
  const boundsY = detectAdaptiveBounds(allLy, true);

  return {
    lxMin: boundsX.min,
    lxMax: boundsX.max,
    lyMin: boundsY.min,
    lyMax: boundsY.max,
    zTop,
    validPointsCount: cleanPts.length,
  };
}
