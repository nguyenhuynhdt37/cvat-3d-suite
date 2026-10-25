/**
 * ============================================================================
 * CVAT 3D SUITE - CORE GEOMETRY FACADE HUB
 * ============================================================================
 * Tệp trung tâm kết nối và tái xuất khẩu (Re-Export) toàn bộ 8 module hình học:
 * 1. transforms.ts         - Euler XYZ, Vector 3D, Micro-Z, Ray-OBB
 * 2. clustering.ts         - Dilation 5x, Connected cluster 1D, Density filter
 * 3. ground_curb.ts        - Ghim sàn, Annular ring, Peak histogram, Curb ramp
 * 4. car_fitting.ts        - PCA Long axis, cản trước/sau, sườn xe, Tight fit
 * 5. pedestrian_fitting.ts - Fit người đi bộ, Trẻ em, AODE envelope, Head Z
 * 6. two_wheeler_fitting.ts- Fit xe 2 bánh, Rider 42% geometry, Bù mất bánh
 * 7. lane_snap.ts          - Vạch kẻ làn đường LiDAR Intensity RANSAC/PCA
 * 8. edge_contacts.ts      - Edge Contact HUD & Point cloud colorization
 * ============================================================================
 */

export * from "./geometry/index.ts";

import * as Geometry from "./geometry/index.ts";

// Xuất các hàm hình học quan trọng ra toàn cục phòng vệ 100% chống lỗi undefined
if (typeof globalThis !== "undefined") {
  (globalThis as any).boxCorners = Geometry.boxCorners;
  (globalThis as any).BOX_EDGES = Geometry.BOX_EDGES;
  (globalThis as any).fitBoxToEgoRayAndGround = Geometry.fitBoxToEgoRayAndGround;
  (globalThis as any).fitPedestrianBox = Geometry.fitPedestrianBox;
  (globalThis as any).fitPedestrianLength = Geometry.fitPedestrianLength;
  (globalThis as any).fitPedestrianWidth = Geometry.fitPedestrianWidth;
  (globalThis as any).fitPedestrianHeight = Geometry.fitPedestrianHeight;
  (globalThis as any).fitCyclistBox = Geometry.fitCyclistBox;
  (globalThis as any).fitTwoWheelerBox = Geometry.fitTwoWheelerBox;
  (globalThis as any).estimateTwoWheelerHeading = Geometry.estimateTwoWheelerHeading;
  (globalThis as any).estimateEgoRoadGroundZ = Geometry.estimateEgoRoadGroundZ;
  (globalThis as any).detectTrueHeadZ = Geometry.detectTrueHeadZ;
  (globalThis as any).computeGroundSlopesAndZ = Geometry.computeGroundSlopesAndZ;
  (globalThis as any).estimateGroundSlopeInRadius = Geometry.estimateGroundSlopeInRadius;
  (globalThis as any).fitYawToLaneIntensity = Geometry.fitYawToLaneIntensity;
  (globalThis as any).isPointInsideBox3D = Geometry.isPointInsideBox3D;
  (globalThis as any).computePointCloudColors = Geometry.computePointCloudColors;
  (globalThis as any).DISTINCT_TRACK_PALETTE = Geometry.DISTINCT_TRACK_PALETTE;
  (globalThis as any).OVERLAP_WARNING_COLOR = Geometry.OVERLAP_WARNING_COLOR;
  (globalThis as any).EDGE_SNAP_COLOR = Geometry.EDGE_SNAP_COLOR;
  (globalThis as any).CUT_OUT_WARNING_COLOR = Geometry.CUT_OUT_WARNING_COLOR;
  (globalThis as any).computeBoxEdgeContacts = Geometry.computeBoxEdgeContacts;
  (globalThis as any).getDistinctTrackColor = Geometry.getDistinctTrackColor;
  (globalThis as any).analyzeOrientedDensityEnvelope = Geometry.analyzeOrientedDensityEnvelope;
  (globalThis as any).computeAODEDensityEnvelope = Geometry.computeAODEDensityEnvelope;
  (globalThis as any).CLASS_SIZE_LIMITS = Geometry.CLASS_SIZE_LIMITS;
  (globalThis as any).axes = Geometry.axes;
  (globalThis as any).transformVectorInverseEuler = Geometry.transformVectorInverseEuler;
  (globalThis as any).intersectRayWithOBB = Geometry.intersectRayWithOBB;
  (globalThis as any).clusterByPointDilation5x = Geometry.clusterByPointDilation5x;
}
if (typeof window !== "undefined") {
  (window as any).boxCorners = Geometry.boxCorners;
  (window as any).BOX_EDGES = Geometry.BOX_EDGES;
  (window as any).fitBoxToEgoRayAndGround = Geometry.fitBoxToEgoRayAndGround;
  (window as any).fitPedestrianBox = Geometry.fitPedestrianBox;
  (window as any).fitPedestrianLength = Geometry.fitPedestrianLength;
  (window as any).fitPedestrianWidth = Geometry.fitPedestrianWidth;
  (window as any).fitPedestrianHeight = Geometry.fitPedestrianHeight;
  (window as any).fitCyclistBox = Geometry.fitCyclistBox;
  (window as any).fitTwoWheelerBox = Geometry.fitTwoWheelerBox;
  (window as any).estimateTwoWheelerHeading = Geometry.estimateTwoWheelerHeading;
  (window as any).estimateEgoRoadGroundZ = Geometry.estimateEgoRoadGroundZ;
  (window as any).detectTrueHeadZ = Geometry.detectTrueHeadZ;
  (window as any).computeGroundSlopesAndZ = Geometry.computeGroundSlopesAndZ;
  (window as any).estimateGroundSlopeInRadius = Geometry.estimateGroundSlopeInRadius;
  (window as any).fitYawToLaneIntensity = Geometry.fitYawToLaneIntensity;
  (window as any).isPointInsideBox3D = Geometry.isPointInsideBox3D;
  (window as any).computePointCloudColors = Geometry.computePointCloudColors;
  (window as any).DISTINCT_TRACK_PALETTE = Geometry.DISTINCT_TRACK_PALETTE;
  (window as any).OVERLAP_WARNING_COLOR = Geometry.OVERLAP_WARNING_COLOR;
  (window as any).EDGE_SNAP_COLOR = Geometry.EDGE_SNAP_COLOR;
  (window as any).CUT_OUT_WARNING_COLOR = Geometry.CUT_OUT_WARNING_COLOR;
  (window as any).computeBoxEdgeContacts = Geometry.computeBoxEdgeContacts;
  (window as any).getDistinctTrackColor = Geometry.getDistinctTrackColor;
  (window as any).analyzeOrientedDensityEnvelope = Geometry.analyzeOrientedDensityEnvelope;
  (window as any).computeAODEDensityEnvelope = Geometry.computeAODEDensityEnvelope;
  (window as any).CLASS_SIZE_LIMITS = Geometry.CLASS_SIZE_LIMITS;
  (window as any).axes = Geometry.axes;
  (window as any).transformVectorInverseEuler = Geometry.transformVectorInverseEuler;
  (window as any).intersectRayWithOBB = Geometry.intersectRayWithOBB;
  (window as any).clusterByPointDilation5x = Geometry.clusterByPointDilation5x;
}
