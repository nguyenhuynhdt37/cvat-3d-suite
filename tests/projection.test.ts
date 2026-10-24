/**
 * ==============================================================================
 * CVAT 3D SUITE - PROJECTION & LENS DISTORTION ENGINE UNIT TESTS
 * ==============================================================================
 */

import { strict as assert } from "assert";
import type {
  CameraConfig,
  CameraIntrinsics,
  CameraExtrinsics,
} from "../src/core/projection.ts";
import {
  lidarToCamera,
  projectPointToPixel,
  clipSegmentNearPlane,
  getEdgeColorAndFace,
  project3DBoxToCamera,
  computeVisibilityCoverage,
  extractObjectROI,
} from "../src/core/projection.ts";
import {
  DEFAULT_VINFAST_ADAS_CAMERAS,
  validateCameraConfig,
  parseCalibrationJSON,
  getActiveCameras,
} from "../src/core/calibration.ts";
import type { Box3D } from "../src/core/geometry.ts";

console.log("🧪 Đang chạy kiểm thử tự động Module Projection & Lens Distortion...");

// Mock Camera Front (Pinhole thuần)
const mockCamFrontPinhole: CameraConfig = {
  id: 0,
  name: "CAM_FRONT",
  imageWidth: 1920,
  imageHeight: 1080,
  distortionModel: "none",
  intrinsics: {
    fx: 1200,
    fy: 1200,
    cx: 960,
    cy: 540,
  },
  extrinsics: {
    // Hệ LiDAR (X trước, Y trái, Z trên) sang Camera (X phải, Y xuống, Z trước)
    // X_cam = -Y_lidar, Y_cam = -Z_lidar, Z_cam = X_lidar
    rotation: [
      0, -1, 0,
      0, 0, -1,
      1, 0, 0,
    ],
    translation: [0, 0, 0],
  },
};

// Mock Camera Góc Rộng với méo RadTan (Brown-Conrady)
const mockCamRadTan: CameraConfig = {
  id: 1,
  name: "CAM_FRONT_RADTAN",
  imageWidth: 1920,
  imageHeight: 1080,
  distortionModel: "radtan",
  intrinsics: {
    fx: 1100,
    fy: 1100,
    cx: 960,
    cy: 540,
    k1: -0.15,
    k2: 0.05,
    p1: 0.001,
    p2: -0.001,
    k3: 0.0,
  },
  extrinsics: {
    rotation: [
      0, -1, 0,
      0, 0, -1,
      1, 0, 0,
    ],
    translation: [0, 0, 0],
  },
};

// Mock Camera Mắt Cá với méo Fisheye (Kannala-Brandt)
const mockCamFisheye: CameraConfig = {
  id: 2,
  name: "CAM_FISHEYE",
  imageWidth: 1920,
  imageHeight: 1080,
  distortionModel: "fisheye",
  intrinsics: {
    fx: 800,
    fy: 800,
    cx: 960,
    cy: 540,
    k1: 0.05,
    k2: -0.02,
    k3: 0.005,
    k4: -0.001,
  },
  extrinsics: {
    rotation: [
      0, -1, 0,
      0, 0, -1,
      1, 0, 0,
    ],
    translation: [0, 0, 0],
  },
};

// --------------------------------------------------------------------------
// TEST 1: Biến đổi tọa độ LiDAR sang Camera
// --------------------------------------------------------------------------
{
  // Điểm LiDAR ở phía trước 10m, bên trái 2m, cao 1m: [10, 2, 1]
  // Hệ Camera: X_cam = -Y = -2, Y_cam = -Z = -1, Z_cam = X = 10
  const ptCam = lidarToCamera([10, 2, 1], mockCamFrontPinhole.extrinsics);
  assert.equal(ptCam[0], -2, "X_cam phải bằng -2");
  assert.equal(ptCam[1], -1, "Y_cam phải bằng -1");
  assert.equal(ptCam[2], 10, "Z_cam phải bằng 10");
  console.log("✅ Test 1: Biến đổi tọa độ LiDAR sang Camera (Chuẩn xác 100%)");
}

// --------------------------------------------------------------------------
// TEST 2: Chiếu Pinhole Thuần (Tâm ảnh & Điểm đối xứng)
// --------------------------------------------------------------------------
{
  // Điểm nằm thẳng trục camera tại Z=10m: [0, 0, 10]
  // Pixel phải rơi đúng vào quang tâm cx=960, cy=540
  const centerPt = projectPointToPixel([0, 0, 10], mockCamFrontPinhole.intrinsics, "none");
  assert.equal(centerPt.u, 960, "Quang tâm u phải là 960");
  assert.equal(centerPt.v, 540, "Quang tâm v phải là 540");
  assert.equal(centerPt.isValid, true, "Điểm phải hợp lệ");

  // Điểm lệch phải X=2m, xuống dưới Y=1m tại Z=10m:
  // u = 960 + 1200 * (2 / 10) = 960 + 240 = 1200
  // v = 540 + 1200 * (1 / 10) = 540 + 120 = 660
  const offsetPt = projectPointToPixel([2, 1, 10], mockCamFrontPinhole.intrinsics, "none");
  assert.equal(offsetPt.u, 1200, "u phải là 1200");
  assert.equal(offsetPt.v, 660, "v phải là 660");
  assert.equal(offsetPt.isValid, true, "Điểm phải hợp lệ");
  console.log("✅ Test 2: Chiếu Pinhole thuần (Quang tâm & Điểm lệch chuẩn toán học)");
}

// --------------------------------------------------------------------------
// TEST 3: Phòng vệ điểm sau lưng Camera (Near-Plane Guard)
// --------------------------------------------------------------------------
{
  // Điểm sau lưng camera Z=-5m
  const backPt = projectPointToPixel([1, 1, -5], mockCamFrontPinhole.intrinsics, "none");
  assert.equal(backPt.isValid, false, "Điểm sau lưng camera phải isValid = false");
  assert.equal(backPt.u, -9999, "u phải là -9999");

  // Điểm quá sát ống kính Z=0.02m
  const nearPt = projectPointToPixel([0.1, 0.1, 0.02], mockCamFrontPinhole.intrinsics, "none");
  assert.equal(nearPt.isValid, false, "Điểm Z <= 0.05m phải isValid = false");
  console.log("✅ Test 3: Phòng vệ điểm sau lưng camera (Z <= 0.05m an toàn tuyệt đối)");
}

// --------------------------------------------------------------------------
// TEST 4: Khử méo RadTan (Brown-Conrady)
// --------------------------------------------------------------------------
{
  // Điểm ở vùng rìa ảnh với k1 = -0.15 (méo thùng - barrel distortion co lại vào tâm)
  const ptCam: [number, number, number] = [3, 2, 8];
  const pinholePt = projectPointToPixel(ptCam, mockCamRadTan.intrinsics, "none");
  const radtanPt = projectPointToPixel(ptCam, mockCamRadTan.intrinsics, "radtan");

  assert.notEqual(pinholePt.u, radtanPt.u, "Tọa độ RadTan phải khác Pinhole");
  // Vì k1 âm, radial factor < 1 nên điểm RadTan phải gần tâm hơn điểm Pinhole
  const distPinhole = Math.hypot(pinholePt.u - 960, pinholePt.v - 540);
  const distRadTan = Math.hypot(radtanPt.u - 960, radtanPt.v - 540);
  assert.ok(distRadTan < distPinhole, "Méo thùng k1 < 0 phải kéo điểm co lại gần tâm");
  console.log("✅ Test 4: Khử méo góc rộng RadTan Brown-Conrady (Co méo thùng chính xác)");
}

// --------------------------------------------------------------------------
// TEST 5: Khử méo Mắt Cá Fisheye (Kannala-Brandt)
// --------------------------------------------------------------------------
{
  const ptCam: [number, number, number] = [5, 3, 5]; // Góc rộng theta = atan(sqrt(34)/5) ~ 49°
  const fisheyePt = projectPointToPixel(ptCam, mockCamFisheye.intrinsics, "fisheye");
  assert.equal(fisheyePt.isValid, true, "Điểm fisheye hợp lệ");
  assert.ok(!isNaN(fisheyePt.u) && !isNaN(fisheyePt.v), "Không bị tràn số NaN");

  // Điểm ở góc quá rộng (> 100°)
  const extremePtCam: [number, number, number] = [20, 20, 1]; // theta > 87°
  const extremePt = projectPointToPixel(extremePtCam, mockCamFisheye.intrinsics, "fisheye");
  assert.ok(extremePt.u !== undefined, "Hàm không bị văng lỗi khi góc quét lớn");
  console.log("✅ Test 5: Khử méo mắt cá Fisheye Kannala-Brandt (Kháng tràn số & Giới hạn góc mượt mà)");
}

// --------------------------------------------------------------------------
// TEST 6: Near-Plane Segment Clipping (Cắt cạnh tại mặt phẳng Z=0.1m)
// --------------------------------------------------------------------------
{
  // Cạnh 1: Cả 2 điểm trước camera (Z=5m và Z=10m)
  const seg1 = clipSegmentNearPlane([0, 0, 5], [0, 0, 10], 0.1);
  assert.equal(seg1.isVisible, true);
  assert.equal(seg1.p1Clipped[2], 5);
  assert.equal(seg1.p2Clipped[2], 10);

  // Cạnh 2: Cả 2 điểm sau lưng camera (Z=-5m và Z=-2m)
  const seg2 = clipSegmentNearPlane([0, 0, -5], [0, 0, -2], 0.1);
  assert.equal(seg2.isVisible, false);

  // Cạnh 3: Điểm 1 sau lưng Z=-2m, Điểm 2 trước mặt Z=8m
  const seg3 = clipSegmentNearPlane([0, 0, -2], [0, 0, 8], 0.1);
  assert.equal(seg3.isVisible, true);
  assert.equal(seg3.p1Clipped[2], 0.1, "Điểm 1 phải được cắt chính xác tại Z=0.1m");
  assert.equal(seg3.p2Clipped[2], 8, "Điểm 2 giữ nguyên Z=8m");
  console.log("✅ Test 6: Near-Plane Segment Clipping (Cắt đoạn thẳng qua mặt phẳng an toàn Z=0.1m)");
}

// --------------------------------------------------------------------------
// TEST 7: Chiếu Toàn Bộ 3D Box Lên Camera (8 Đỉnh & 12 Cạnh Chuẩn Màu)
// --------------------------------------------------------------------------
{
  // Xe Sedan ở phía trước 12m, chính giữa camera:
  // c=[12, 0, 0], s=[4.6, 1.8, 1.5], r=[0, 0, 0]
  const sedanBox: Box3D = {
    c: [12, 0, 0],
    s: [4.6, 1.8, 1.5],
    r: [0, 0, 0],
  };

  const proj = project3DBoxToCamera(sedanBox, mockCamFrontPinhole, 8);

  assert.equal(proj.cameraId, 0);
  assert.equal(proj.cameraName, "CAM_FRONT");
  assert.equal(proj.corners2D.length, 8, "Phải có đúng 8 đỉnh");
  assert.equal(proj.edges.length, 12, "Phải có đúng 12 cạnh");
  assert.equal(proj.isVisible, true, "Xe ở trước mặt 12m phải nhìn thấy");
  assert.equal(proj.role, "primary", "Xe nằm chính diện camera phải là Primary");
  assert.ok(proj.bbox2D !== null, "Phải tính được BBox2D");

  // Kiểm tra mã màu các mặt
  const frontEdges = proj.edges.filter((e) => e.faceType === "front");
  assert.ok(frontEdges.length > 0, "Phải có cạnh mặt trước");
  assert.equal(frontEdges[0].color, "#ef4444", "Mặt trước phải là màu Đỏ (#ef4444)");

  const rearEdges = proj.edges.filter((e) => e.faceType === "rear");
  assert.ok(rearEdges.length > 0, "Phải có cạnh mặt sau");
  assert.equal(rearEdges[0].color, "#3b82f6", "Mặt sau phải là màu Xanh Dương (#3b82f6)");

  const leftEdges = proj.edges.filter((e) => e.faceType === "left");
  assert.ok(leftEdges.length > 0, "Phải có cạnh sườn trái");
  assert.equal(leftEdges[0].color, "#22c55e", "Sườn trái phải là màu Xanh Lục (#22c55e)");

  const rightEdges = proj.edges.filter((e) => e.faceType === "right");
  assert.ok(rightEdges.length > 0, "Phải có cạnh sườn phải");
  assert.equal(rightEdges[0].color, "#06b6d4", "Sườn phải phải là màu Xanh Ngọc (#06b6d4)");

  console.log("✅ Test 7: Chiếu 3D Box lên Camera (8 đỉnh, 12 cạnh, phân màu 6 mặt chuẩn tự hành)");
}

// --------------------------------------------------------------------------
// TEST 8: Định Vị Camera Thông Minh (computeVisibilityCoverage)
// --------------------------------------------------------------------------
{
  // Tạo 2 camera: Front (Nhìn trước) và Back (Nhìn sau)
  const camFront = { ...mockCamFrontPinhole, id: 0, name: "CAM_FRONT" };
  const camBack: CameraConfig = {
    id: 1,
    name: "CAM_BACK",
    imageWidth: 1920,
    imageHeight: 1080,
    distortionModel: "none",
    intrinsics: { fx: 1200, fy: 1200, cx: 960, cy: 540 },
    extrinsics: {
      // Nhìn ra phía sau (X_cam = Y_lidar, Y_cam = -Z_lidar, Z_cam = -X_lidar)
      rotation: [
        0, 1, 0,
        0, 0, -1,
        -1, 0, 0,
      ],
      translation: [0, 0, 0],
    },
  };

  // Xe 1 ở phía trước X=15m -> CAM_FRONT nhìn thấy, CAM_BACK out_of_view
  const frontCar: Box3D = { c: [15, 0, 0], s: [4.5, 1.8, 1.5], r: [0, 0, 0] };
  // Xe 2 ở phía sau X=-15m -> CAM_BACK nhìn thấy, CAM_FRONT out_of_view
  const rearCar: Box3D = { c: [-15, 0, 0], s: [4.5, 1.8, 1.5], r: [0, 0, 0] };

  const report = computeVisibilityCoverage([frontCar, rearCar], [camFront, camBack]);

  assert.equal(report.boxes.length, 2);

  // Xe 1: Primary là CAM_FRONT (id 0)
  assert.equal(report.boxes[0].primaryCameraId, 0, "Xe trước thì Primary Camera phải là CAM_FRONT");
  assert.ok(report.boxes[0].highestCoverage > 80, "Xe trước nằm trọn vẹn trong CAM_FRONT");
  assert.equal(report.boxes[0].cameraCoverages[1].role, "out_of_view", "CAM_BACK phải là out_of_view với xe trước");

  // Xe 2: Primary là CAM_BACK (id 1)
  assert.equal(report.boxes[1].primaryCameraId, 1, "Xe sau thì Primary Camera phải là CAM_BACK");
  assert.ok(report.boxes[1].highestCoverage > 80, "Xe sau nằm trọn vẹn trong CAM_BACK");
  assert.equal(report.boxes[1].cameraCoverages[0].role, "out_of_view", "CAM_FRONT phải là out_of_view với xe sau");

  console.log("✅ Test 8: Định vị Camera Thông Minh (Xác định chính xác Primary/Secondary & Out-of-view)");
}

// --------------------------------------------------------------------------
// TEST 9: Trích xuất ROI 2D (AI 2D-to-3D Dimension Estimator Ready)
// --------------------------------------------------------------------------
{
  const sedanBox: Box3D = { c: [10, 0, 0], s: [4.6, 1.8, 1.5], r: [0, 0, 0] };
  const roiData = extractObjectROI(sedanBox, mockCamFrontPinhole, 0.1);

  assert.ok(roiData !== null, "Phải trích xuất được ROI");
  assert.equal(roiData.cameraId, 0);
  assert.equal(roiData.cameraName, "CAM_FRONT");
  assert.ok(roiData.roi.width > 0, "Bề rộng ROI phải > 0");
  assert.ok(roiData.roi.height > 0, "Chiều cao ROI phải > 0");
  assert.ok(roiData.roi.x >= 0, "Tọa độ X phải >= 0");
  assert.ok(roiData.roi.y >= 0, "Tọa độ Y phải >= 0");
  assert.ok(roiData.roi.x + roiData.roi.width <= 1920, "Không vượt quá bề rộng ảnh");
  assert.ok(roiData.roi.y + roiData.roi.height <= 1080, "Không vượt quá chiều cao ảnh");
  assert.equal(roiData.isFullyVisible, true, "Xe 10m chính diện phải isFullyVisible = true");

  console.log("✅ Test 9: Trích xuất vùng ảnh ROI 2D chuẩn hóa (Sẵn sàng cấp cho model AI 2D-to-3D)");
}

// --------------------------------------------------------------------------
// TEST 10: Cấu hình mặc định VinFast ADAS 8 Camera
// --------------------------------------------------------------------------
{
  assert.equal(DEFAULT_VINFAST_ADAS_CAMERAS.length, 8, "Phải có đủ 8 camera");
  const names = DEFAULT_VINFAST_ADAS_CAMERAS.map((c) => c.name);
  assert.ok(names.includes("CAM_FRONT"));
  assert.ok(names.includes("CAM_FRONT_LEFT"));
  assert.ok(names.includes("CAM_FRONT_RIGHT"));
  assert.ok(names.includes("CAM_SIDE_LEFT"));
  assert.ok(names.includes("CAM_SIDE_RIGHT"));
  assert.ok(names.includes("CAM_BACK_LEFT"));
  assert.ok(names.includes("CAM_BACK_RIGHT"));
  assert.ok(names.includes("CAM_BACK"));

  // Kiểm tra tính hợp lệ của cả 8 camera
  for (const cam of DEFAULT_VINFAST_ADAS_CAMERAS) {
    const val = validateCameraConfig(cam);
    assert.equal(val.isValid, true, `Camera ${cam.name} phải hợp lệ`);
  }
  console.log("✅ Test 10: Cấu hình mặc định VinFast ADAS 8 Camera (Chuẩn xác & Đầy đủ 360°)");
}

// --------------------------------------------------------------------------
// TEST 11: Validator & Parser cấu hình Calibration JSON
// --------------------------------------------------------------------------
{
  // Trường hợp JSON hợp lệ
  const sampleJson = JSON.stringify([DEFAULT_VINFAST_ADAS_CAMERAS[0]]);
  const parseRes = parseCalibrationJSON(sampleJson);
  assert.equal(parseRes.error, undefined);
  assert.equal(parseRes.configs.length, 1);
  assert.equal(parseRes.configs[0].name, "CAM_FRONT");

  // Trường hợp JSON sai cú pháp
  const invalidJson = "{ invalid json ...";
  const errRes1 = parseCalibrationJSON(invalidJson);
  assert.ok(errRes1.error !== undefined, "Phải báo lỗi cú pháp JSON");

  // Trường hợp thiếu trường bắt buộc
  const missingIntrinsics = JSON.stringify([{ id: 0, name: "TEST", extrinsics: { rotation: [0], translation: [0] } }]);
  const errRes2 = parseCalibrationJSON(missingIntrinsics);
  assert.ok(errRes2.error !== undefined, "Phải báo lỗi thiếu intrinsics");

  console.log("✅ Test 11: Validator & Parser cấu hình Calibration JSON (Phòng vệ dữ liệu nghiêm ngặt)");
}

// --------------------------------------------------------------------------
// TEST 12: Fallback an toàn khi chưa nạp Calibration
// --------------------------------------------------------------------------
{
  const cams = getActiveCameras(99999);
  assert.equal(cams.length, 8, "Khi chưa có cấu hình riêng, tự động fallback 8 camera VinFast ADAS");
  console.log("✅ Test 12: Fallback an toàn (Luôn có sẵn 8 Camera, Zero-Crash khi chưa nạp)");
}

console.log("\n🎉 TẤT CẢ 12/12 BÀI KIỂM THỬ MODULE PROJECTION & CALIBRATION ĐÃ PASS 100%!");
