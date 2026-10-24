/**
 * ==============================================================================
 * CVAT 3D SUITE - CAMERA CALIBRATION MANAGER (CALIBRATION RIG STORE)
 * ==============================================================================
 * Quản lý thông số hiệu chuẩn của 8 Camera:
 * - Intrinsics K, Extrinsics [R | T], Lens Distortion D (RadTan / Fisheye)
 * - Cung cấp sẵn cấu hình mẫu chuẩn VinFast ADAS 8 Camera 360°
 * - Hỗ trợ Import/Export cấu hình JSON tùy chỉnh theo từng Task/Job
 * - Lưu trữ bền vững vào localStorage theo TaskID
 * ==============================================================================
 */

import type { CameraConfig, DistortionModel } from "./projection.ts";

/**
 * Cấu hình mẫu 8 Camera chuẩn xe tự hành VinFast ADAS 360°
 * Quy ước trục LiDAR: X trước, Y trái, Z trên
 * Quy ước trục Camera: X phải, Y xuống, Z trước
 */
export const DEFAULT_VINFAST_ADAS_CAMERAS: CameraConfig[] = [
  // 0: CAM_FRONT (Trước chính diện)
  {
    id: 0,
    name: "CAM_FRONT",
    imageWidth: 1920,
    imageHeight: 1080,
    distortionModel: "radtan",
    intrinsics: {
      fx: 1250.0,
      fy: 1250.0,
      cx: 960.0,
      cy: 540.0,
      k1: -0.12,
      k2: 0.03,
      p1: 0.0005,
      p2: -0.0005,
      k3: 0.0,
    },
    extrinsics: {
      // Camera nhìn thẳng về phía trước X: X_cam = -Y_lidar, Y_cam = -Z_lidar, Z_cam = X_lidar
      rotation: [
        0, -1, 0,
        0, 0, -1,
        1, 0, 0,
      ],
      translation: [1.8, 0.0, 1.4], // Đặt tại kính lái trước
    },
  },

  // 1: CAM_FRONT_LEFT (Trước góc chéo trái ~45°)
  {
    id: 1,
    name: "CAM_FRONT_LEFT",
    imageWidth: 1920,
    imageHeight: 1080,
    distortionModel: "radtan",
    intrinsics: {
      fx: 1100.0,
      fy: 1100.0,
      cx: 960.0,
      cy: 540.0,
      k1: -0.14,
      k2: 0.04,
      p1: 0.0008,
      p2: -0.0008,
    },
    extrinsics: {
      // Quay sang trái 45°: cos(45) ~ 0.7071
      rotation: [
        0.7071, -0.7071, 0,
        0, 0, -1,
        0.7071, 0.7071, 0,
      ],
      translation: [1.6, 0.7, 1.3],
    },
  },

  // 2: CAM_FRONT_RIGHT (Trước góc chéo phải ~45°)
  {
    id: 2,
    name: "CAM_FRONT_RIGHT",
    imageWidth: 1920,
    imageHeight: 1080,
    distortionModel: "radtan",
    intrinsics: {
      fx: 1100.0,
      fy: 1100.0,
      cx: 960.0,
      cy: 540.0,
      k1: -0.14,
      k2: 0.04,
      p1: 0.0008,
      p2: -0.0008,
    },
    extrinsics: {
      // Quay sang phải 45°
      rotation: [
        -0.7071, -0.7071, 0,
        0, 0, -1,
        0.7071, -0.7071, 0,
      ],
      translation: [1.6, -0.7, 1.3],
    },
  },

  // 3: CAM_SIDE_LEFT (Gương sườn trái 90° - Mắt cá Fisheye)
  {
    id: 3,
    name: "CAM_SIDE_LEFT",
    imageWidth: 1920,
    imageHeight: 1080,
    distortionModel: "fisheye",
    intrinsics: {
      fx: 850.0,
      fy: 850.0,
      cx: 960.0,
      cy: 540.0,
      k1: 0.04,
      k2: -0.015,
      k3: 0.003,
      k4: -0.0005,
    },
    extrinsics: {
      // Nhìn ngang sang trái 90°
      rotation: [
        1, 0, 0,
        0, 0, -1,
        0, 1, 0,
      ],
      translation: [0.5, 0.95, 1.1],
    },
  },

  // 4: CAM_SIDE_RIGHT (Gương sườn phải 90° - Mắt cá Fisheye)
  {
    id: 4,
    name: "CAM_SIDE_RIGHT",
    imageWidth: 1920,
    imageHeight: 1080,
    distortionModel: "fisheye",
    intrinsics: {
      fx: 850.0,
      fy: 850.0,
      cx: 960.0,
      cy: 540.0,
      k1: 0.04,
      k2: -0.015,
      k3: 0.003,
      k4: -0.0005,
    },
    extrinsics: {
      // Nhìn ngang sang phải 90°
      rotation: [
        -1, 0, 0,
        0, 0, -1,
        0, -1, 0,
      ],
      translation: [0.5, -0.95, 1.1],
    },
  },

  // 5: CAM_BACK_LEFT (Sau góc chéo trái ~135°)
  {
    id: 5,
    name: "CAM_BACK_LEFT",
    imageWidth: 1920,
    imageHeight: 1080,
    distortionModel: "radtan",
    intrinsics: {
      fx: 1100.0,
      fy: 1100.0,
      cx: 960.0,
      cy: 540.0,
      k1: -0.14,
      k2: 0.04,
    },
    extrinsics: {
      rotation: [
        0.7071, 0.7071, 0,
        0, 0, -1,
        -0.7071, 0.7071, 0,
      ],
      translation: [-1.2, 0.7, 1.2],
    },
  },

  // 6: CAM_BACK_RIGHT (Sau góc chéo phải ~135°)
  {
    id: 6,
    name: "CAM_BACK_RIGHT",
    imageWidth: 1920,
    imageHeight: 1080,
    distortionModel: "radtan",
    intrinsics: {
      fx: 1100.0,
      fy: 1100.0,
      cx: 960.0,
      cy: 540.0,
      k1: -0.14,
      k2: 0.04,
    },
    extrinsics: {
      rotation: [
        -0.7071, 0.7071, 0,
        0, 0, -1,
        -0.7071, -0.7071, 0,
      ],
      translation: [-1.2, -0.7, 1.2],
    },
  },

  // 7: CAM_BACK (Đuôi xe chính diện - Camera lùi)
  {
    id: 7,
    name: "CAM_BACK",
    imageWidth: 1920,
    imageHeight: 1080,
    distortionModel: "fisheye",
    intrinsics: {
      fx: 800.0,
      fy: 800.0,
      cx: 960.0,
      cy: 540.0,
      k1: 0.05,
      k2: -0.02,
      k3: 0.004,
      k4: -0.0006,
    },
    extrinsics: {
      // Nhìn thẳng về phía sau -X
      rotation: [
        0, 1, 0,
        0, 0, -1,
        -1, 0, 0,
      ],
      translation: [-1.8, 0.0, 1.2],
    },
  },
];

/**
 * Kiểm tra tính hợp lệ của cấu hình Camera (Validator phòng vệ)
 */
export function validateCameraConfig(config: any): { isValid: boolean; error?: string } {
  if (!config || typeof config !== "object") {
    return { isValid: false, error: "Cấu hình camera phải là một đối tượng JSON" };
  }

  if (typeof config.id !== "number") {
    return { isValid: false, error: "Thiếu hoặc sai trường 'id' (phải là số từ 0 đến 7)" };
  }

  if (!config.name || typeof config.name !== "string") {
    return { isValid: false, error: `Camera ${config.id}: Thiếu hoặc sai trường 'name'` };
  }

  // Kiểm tra Intrinsics
  const intr = config.intrinsics;
  if (!intr || typeof intr.fx !== "number" || typeof intr.fy !== "number" ||
      typeof intr.cx !== "number" || typeof intr.cy !== "number") {
    return { isValid: false, error: `Camera ${config.name}: Thiếu hoặc sai thông số Intrinsics (fx, fy, cx, cy)` };
  }

  // Kiểm tra Extrinsics
  const extr = config.extrinsics;
  if (!extr || !Array.isArray(extr.rotation) || (extr.rotation.length !== 9 && extr.rotation.length !== 16)) {
    return { isValid: false, error: `Camera ${config.name}: Extrinsics.rotation phải là mảng 9 hoặc 16 số` };
  }

  if (!Array.isArray(extr.translation) || extr.translation.length !== 3) {
    return { isValid: false, error: `Camera ${config.name}: Extrinsics.translation phải là mảng 3 số [tx, ty, tz]` };
  }

  return { isValid: true };
}

/**
 * Parser nhập cấu hình từ chuỗi JSON tự do
 */
export function parseCalibrationJSON(rawJson: string): { configs: CameraConfig[]; error?: string } {
  try {
    const parsed = JSON.parse(rawJson);
    const list: any[] = Array.isArray(parsed) ? parsed : (parsed.cameras || [parsed]);

    if (!Array.isArray(list) || list.length === 0) {
      return { configs: [], error: "Dữ liệu JSON không chứa danh sách camera hợp lệ" };
    }

    const configs: CameraConfig[] = [];
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      const valid = validateCameraConfig(item);
      if (!valid.isValid) {
        return { configs: [], error: `Mục #${i}: ${valid.error}` };
      }

      configs.push({
        id: item.id,
        name: String(item.name),
        imageWidth: Number(item.imageWidth || 1920),
        imageHeight: Number(item.imageHeight || 1080),
        distortionModel: (item.distortionModel === "radtan" || item.distortionModel === "fisheye")
          ? item.distortionModel
          : "none",
        intrinsics: {
          fx: Number(item.intrinsics.fx),
          fy: Number(item.intrinsics.fy),
          cx: Number(item.intrinsics.cx),
          cy: Number(item.intrinsics.cy),
          k1: item.intrinsics.k1 !== undefined ? Number(item.intrinsics.k1) : undefined,
          k2: item.intrinsics.k2 !== undefined ? Number(item.intrinsics.k2) : undefined,
          p1: item.intrinsics.p1 !== undefined ? Number(item.intrinsics.p1) : undefined,
          p2: item.intrinsics.p2 !== undefined ? Number(item.intrinsics.p2) : undefined,
          k3: item.intrinsics.k3 !== undefined ? Number(item.intrinsics.k3) : undefined,
          k4: item.intrinsics.k4 !== undefined ? Number(item.intrinsics.k4) : undefined,
        },
        extrinsics: {
          rotation: item.extrinsics.rotation.map(Number),
          translation: [
            Number(item.extrinsics.translation[0]),
            Number(item.extrinsics.translation[1]),
            Number(item.extrinsics.translation[2]),
          ],
        },
      });
    }

    return { configs };
  } catch (err: any) {
    return { configs: [], error: `Lỗi cú pháp JSON: ${err.message}` };
  }
}

/**
 * Lấy khóa lưu trữ LocalStorage cho TaskID
 */
function getStorageKey(taskId?: number): string {
  return taskId ? `CVAT_3D_SUITE_CALIB_TASK_${taskId}` : "CVAT_3D_SUITE_CALIB_DEFAULT";
}

/**
 * Tải danh sách cấu hình Camera đang kích hoạt (Ưu tiên LocalStorage -> Fallback mẫu VinFast ADAS)
 */
export function getActiveCameras(taskId?: number): CameraConfig[] {
  try {
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem(getStorageKey(taskId));
      if (saved) {
        const { configs, error } = parseCalibrationJSON(saved);
        if (!error && configs.length > 0) {
          return configs;
        }
      }
    }
  } catch (e) {
    console.warn("[CVAT 3D Suite] Không thể đọc localStorage:", e);
  }

  // Fallback mặc định
  return DEFAULT_VINFAST_ADAS_CAMERAS;
}

/**
 * Lưu cấu hình Camera vào LocalStorage
 */
export function saveActiveCameras(configs: CameraConfig[], taskId?: number): boolean {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(getStorageKey(taskId), JSON.stringify(configs, null, 2));
      return true;
    }
  } catch (e) {
    console.error("[CVAT 3D Suite] Lỗi lưu cấu hình camera vào localStorage:", e);
  }
  return false;
}

/**
 * Đặt lại cấu hình về mặc định VinFast ADAS
 */
export function resetCamerasToDefault(taskId?: number): CameraConfig[] {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(getStorageKey(taskId));
    }
  } catch (e) {}
  return DEFAULT_VINFAST_ADAS_CAMERAS;
}

// ===========================================================================
// VINFAST DAY14 CALIBRATION FORMAT CONVERTER
// ===========================================================================
// Format VinFast: { pcd_frame, lidar: { sensor2ego[4x4] }, cameras: { name: { K[3x3], ego2cam[3x4|4x4], dist[5], image_size[2] } } }
// Pipeline: P_lidar → sensor2ego → P_ego → ego2cam → P_cam → K + dist → pixel

/** Cấu trúc calibration VinFast Day14 (calib_diagnostic.json) */
export interface VinCalibCamera {
  K: number[][];        // Ma trận nội tại 3x3
  ego2cam: number[][];  // Ma trận chuyển đổi Ego→Camera 3x4 hoặc 4x4
  dist: number[];       // Hệ số méo Brown-Conrady [k1, k2, p1, p2, k3]
  image_size: [number, number]; // [Width, Height]
}

export interface VinCalibration {
  pcd_frame: "lidar" | "ego";
  lidar: { sensor2ego: number[][] }; // Ma trận 4x4 (có thể 3x4)
  cameras: Record<string, VinCalibCamera>;
}

/**
 * Nhân 2 ma trận affine 3x4 (hoặc 4x4) thành 1 ma trận tổng hợp 3x4.
 * Kết quả: C = B @ A → P_out = B * (A * P_in)
 * Input: mỗi ma trận là mảng dòng (row-major), ít nhất 3 dòng x 4 cột.
 */
function multiplyAffine3x4(A: number[][], B: number[][]): number[][] {
  const result: number[][] = [];
  for (let r = 0; r < 3; r++) {
    const row: number[] = [];
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let k = 0; k < 3; k++) {
        sum += B[r][k] * A[k][c];
      }
      // Cộng thêm phần tử translation của B (cột 3) nhân với dòng cuối A (implicit [0,0,0,1])
      if (c === 3) {
        sum += B[r][3]; // vì A[3][3] = 1
      }
      row.push(sum);
    }
    result.push(row);
  }
  return result;
}

/**
 * Chuyển đổi calibration format VinFast Day14 sang CameraConfig[] tương thích với projection engine.
 *
 * Pipeline VinFast:
 *   P_lidar → sensor2ego → P_ego → ego2cam → P_cam → K * distort(P_cam/Z) → pixel
 *
 * Tổng hợp: lidar2cam = ego2cam @ sensor2ego → rotation[9] + translation[3]
 *
 * @param vinCalib - Đối tượng calibration đọc từ calib_diagnostic.json
 * @param cameraMap - Mapping tên context image → tên camera calibration. Ví dụ: {"image_0": "CAM_P_F"}
 *                    Nếu không cung cấp, tự động dùng tất cả cameras trong calibration.
 * @returns Mảng CameraConfig[] sẵn sàng dùng cho projection engine
 */
export function convertVinCalibration(
  vinCalib: VinCalibration,
  cameraMap?: Record<string, string>,
): CameraConfig[] {
  const configs: CameraConfig[] = [];
  const sensor2ego = vinCalib.lidar.sensor2ego;

  // Nếu pcd_frame === "ego", sensor2ego là Identity (không cần nhân)
  const isEgoFrame = vinCalib.pcd_frame === "ego";

  // Xác định danh sách camera cần xử lý
  let cameraEntries: Array<{ contextKey: string; calibName: string; index: number }> = [];

  if (cameraMap && Object.keys(cameraMap).length > 0) {
    // Dùng mapping được cung cấp
    // Parse index từ contextKey (ví dụ: "image_1" → index 1) để khớp với ZIP file index
    for (const [contextKey, calibName] of Object.entries(cameraMap)) {
      const match = contextKey.match(/image[_-]?(\d+)/);
      const index = match ? parseInt(match[1], 10) : 0;
      cameraEntries.push({ contextKey, calibName, index });
    }
  } else {
    // Tự động lấy tất cả cameras từ calibration
    let idx = 0;
    for (const calibName of Object.keys(vinCalib.cameras)) {
      cameraEntries.push({ contextKey: `image_${idx}`, calibName, index: idx++ });
    }
  }

  for (const entry of cameraEntries) {
    const camData = vinCalib.cameras[entry.calibName];
    if (!camData) {
      console.warn(`[VinCalib] Camera "${entry.calibName}" không tìm thấy trong calibration, bỏ qua.`);
      continue;
    }

    // Tính lidar2cam = ego2cam @ sensor2ego (hoặc chỉ ego2cam nếu pcd_frame === "ego")
    const lidar2cam = isEgoFrame
      ? camData.ego2cam
      : multiplyAffine3x4(sensor2ego, camData.ego2cam);

    // Tách rotation (3x3 flatten) và translation (3 phần tử) từ lidar2cam
    const rotation: number[] = [
      lidar2cam[0][0], lidar2cam[0][1], lidar2cam[0][2],
      lidar2cam[1][0], lidar2cam[1][1], lidar2cam[1][2],
      lidar2cam[2][0], lidar2cam[2][1], lidar2cam[2][2],
    ];
    const translation: [number, number, number] = [
      lidar2cam[0][3],
      lidar2cam[1][3],
      lidar2cam[2][3],
    ];

    // Trích xuất thông số nội tại từ ma trận K
    const K = camData.K;
    const dist = camData.dist || [0, 0, 0, 0, 0];

    const config: CameraConfig = {
      id: entry.index,
      name: entry.calibName,
      imageWidth: camData.image_size[0],
      imageHeight: camData.image_size[1],
      distortionModel: "radtan", // VinFast dùng Brown-Conrady (RadTan)
      intrinsics: {
        fx: K[0][0],
        fy: K[1][1],
        cx: K[0][2],
        cy: K[1][2],
        k1: dist[0] || 0,
        k2: dist[1] || 0,
        p1: dist[2] || 0,
        p2: dist[3] || 0,
        k3: dist[4] || 0,
      },
      extrinsics: {
        rotation,
        translation,
      },
    };

    configs.push(config);
    console.log(`[VinCalib] Camera "${entry.calibName}" (id=${entry.index}): `
      + `K=[${K[0][0].toFixed(1)}, ${K[1][1].toFixed(1)}], `
      + `size=${camData.image_size[0]}x${camData.image_size[1]}, `
      + `dist=[${dist.map((d: number) => d.toFixed(4)).join(", ")}]`);
  }

  return configs;
}

/**
 * Parse và convert VinFast calibration JSON string trực tiếp.
 * Nhận diện tự động format VinFast (có key "pcd_frame" và "cameras" chứa "ego2cam").
 */
export function parseVinCalibrationJSON(
  rawJson: string,
  cameraMap?: Record<string, string>,
): { configs: CameraConfig[]; error?: string } {
  try {
    const data = JSON.parse(rawJson);

    // Kiểm tra xem có phải format VinFast không
    if (!data.cameras || !data.lidar) {
      return { configs: [], error: "JSON không phải format VinFast (thiếu cameras hoặc lidar)" };
    }

    // Kiểm tra ít nhất 1 camera có ego2cam
    const firstCamName = Object.keys(data.cameras)[0];
    if (!firstCamName || !data.cameras[firstCamName].ego2cam) {
      return { configs: [], error: "Camera thiếu trường ego2cam" };
    }

    const configs = convertVinCalibration(data as VinCalibration, cameraMap);
    return { configs };
  } catch (err: any) {
    return { configs: [], error: `Lỗi parse VinFast calibration: ${err.message}` };
  }
}
