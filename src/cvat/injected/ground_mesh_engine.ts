/**
 * Module: Ground Mesh & Slope Fitting Engine (CVAT 3D Suite)
 * Chuyên trách:
 * 1. Trích xuất đám mây điểm THREE.Points từ Scene Canvas3D kèm kênh Intensity.
 * 2. Trích xuất constructors Three.js từ Scene để độc lập hoàn toàn với window.THREE.
 * 3. Ước lượng mốc cao độ mặt đường xe Ego (Ego Road Surface Z Reference).
 * 4. Thuật toán tính cao độ mặt đất và độ dốc đường 3D (Pitch & Roll Fitting) theo vết đè box.
 * 5. Tự động nhận diện vỉa hè và bậc gác lề (Auto Curb Detection).
 * 6. Lọc thung lũng mật độ trục Z (Density Gap Cutoff) tìm đỉnh đầu vật thể.
 */

import { getReduxStore } from "./redux_bridge.ts";
import { detectTrueHeadZ } from "../../core/geometry/pedestrian_fitting.ts";

export interface SceneLidarPoints {
  count: number;
  array: Float32Array;
  intensity?: Float32Array | null;
  color?: Float32Array | null;
  getIntensityAt: (idx: number) => number;
}

/**
 * Trích xuất đối tượng THREE.Points từ Scene của Canvas3D (kèm kênh Intensity/Color)
 */
export function getSceneLidarPoints(): SceneLidarPoints | null {
  try {
    const store = getReduxStore();
    const canvas = store?.getState()?.annotation?.canvas?.instance;
    const pScene = canvas?.view?.views?.perspective?.scene;
    if (!pScene) return null;

    let found: any = null;
    pScene.traverse((obj: any) => {
      if (
        (obj.isPoints || obj.type === "Points") &&
        obj.geometry?.attributes?.position?.count > 5000
      ) {
        found = obj;
      }
    });

    if (!found) return null;
    const posAttr = found.geometry?.attributes?.position;
    if (!posAttr || !posAttr.array) return null;

    const count = posAttr.count;
    const array = posAttr.array as Float32Array;
    const intensityAttr = (found.geometry?.attributes?.intensity || found.geometry?.attributes?.intensities)?.array as Float32Array | undefined;
    const colorAttr = (found.geometry?.attributes?.color || found.geometry?.attributes?.colors)?.array as Float32Array | undefined;

    const getIntensityAt = (idx: number): number => {
      if (intensityAttr && idx < intensityAttr.length) {
        const val = intensityAttr[idx];
        return val <= 1.0 ? val * 255 : val;
      }
      if (colorAttr && idx * 3 + 2 < colorAttr.length) {
        const r = colorAttr[idx * 3];
        const g = colorAttr[idx * 3 + 1];
        const b = colorAttr[idx * 3 + 2];
        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        return r <= 1.0 && g <= 1.0 && b <= 1.0 ? l * 255 : l;
      }
      return 0;
    };

    return {
      count,
      array,
      intensity: intensityAttr || null,
      color: colorAttr || null,
      getIntensityAt,
    };
  } catch (e) {
    console.warn("[CVAT 3D Suite] Không thể trích xuất LiDAR points:", e);
    return null;
  }
}

/**
 * Trích xuất constructors Three.js từ Scene của CVAT
 */
export function getThreeEngineFromScene(scene: any, canvas: any): any {
  const win = window as any;
  if (win.THREE && typeof win.THREE.Mesh === "function") {
    return win.THREE;
  }
  if (canvas?.THREE && typeof canvas.THREE.Mesh === "function") {
    return canvas.THREE;
  }
  if (canvas?.view?.THREE && typeof canvas.view.THREE.Mesh === "function") {
    return canvas.view.THREE;
  }

  let MeshClass: any = null;
  let BufferGeometryClass: any = null;
  let BufferAttributeClass: any = null;
  let MaterialClass: any = null;
  let GroupClass: any = null;

  if (scene) {
    if (typeof scene.constructor === "function") {
      GroupClass = scene.constructor;
    }
    scene.traverse((obj: any) => {
      if (!MeshClass && (obj.isMesh || obj.type === "Mesh")) {
        MeshClass = obj.constructor;
        if (obj.material && !MaterialClass) {
          MaterialClass = obj.material.constructor;
        }
      }
      if (!BufferGeometryClass && obj.geometry?.isBufferGeometry) {
        BufferGeometryClass = obj.geometry.constructor;
        if (obj.geometry.attributes?.position && !BufferAttributeClass) {
          BufferAttributeClass = obj.geometry.attributes.position.constructor;
        }
      }
      if (!GroupClass && (obj.isGroup || obj.type === "Group")) {
        GroupClass = obj.constructor;
      }
    });
  }

  if (BufferGeometryClass && BufferAttributeClass) {
    return {
      Mesh: MeshClass || GroupClass,
      BufferGeometry: BufferGeometryClass,
      BufferAttribute: BufferAttributeClass,
      Material: MaterialClass,
      Group: GroupClass || MeshClass,
    };
  }
  return null;
}

/**
 * Ước lượng mốc cao độ mặt đường xe Ego (Ego Road Surface Z Reference)
 */
export function getEgoRoadGroundZInMainWorld(egoPos: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }): number {
  const lidar = getSceneLidarPoints();
  if (!lidar || lidar.count === 0) return -1.75;
  const { count, array } = lidar;
  const minRSq = 0.8 * 0.8;
  const maxRSq = 15.0 * 15.0;
  const zArr: number[] = [];
  for (let i = 0; i < count; i++) {
    const x = array[i * 3];
    const y = array[i * 3 + 1];
    const z = array[i * 3 + 2];
    const dx = x - egoPos.x;
    const dy = y - egoPos.y;
    const dSq = dx * dx + dy * dy;
    if (dSq >= minRSq && dSq <= maxRSq) {
      if (z >= egoPos.z - 3.5 && z <= egoPos.z + 0.5) {
        zArr.push(z);
      }
    }
  }
  if (zArr.length < 8) return -1.75;
  zArr.sort((a, b) => a - b);
  const cutLow = Math.floor(zArr.length * 0.01);
  const validZ = zArr.slice(cutLow);
  const p15 = validZ[Math.floor(validZ.length * 0.15)];
  return Number(p15.toFixed(3));
}

export interface AccurateGroundResult {
  groundZ: number | null;
  pitchRad: number;
  rollRad: number;
  pitchDeg: number;
  rollDeg: number;
  groundPointsCount: number;
  isFallbackZeroGround?: boolean;
  isCurbGround?: boolean;
  isHalfCurb?: boolean;
  halfCurbSide?: "left" | "right" | "none";
  curbHeightCm?: number;
}

/**
 * Thuật toán Tính Toán Cao Độ Mặt Đất và Độ Dốc Đường 3D Theo Footprint Vết Đè Box
 */
export function detectAccurateGroundZ(
  cx: number,
  cy: number,
  cz: number,
  yaw: number,
  halfL: number,
  halfW: number,
  halfH: number = 0.8,
  isInitialBox: boolean = false,
  lockRollFlat: boolean = false,
  egoRoadZ?: number
): AccurateGroundResult {
  const lidar = getSceneLidarPoints();
  if (!lidar || lidar.count === 0) {
    return {
      groundZ: -1.75,
      pitchRad: 0,
      rollRad: 0,
      pitchDeg: 0,
      rollDeg: 0,
      groundPointsCount: 0,
      isFallbackZeroGround: true,
      isCurbGround: false,
      isHalfCurb: false,
      halfCurbSide: "none",
      curbHeightCm: 0,
    };
  }

  const { count, array } = lidar;
  const cosY = Math.cos(-yaw);
  const sinY = Math.sin(-yaw);

  const groundPts: Array<{ lx: number; ly: number; z: number }> = [];
  const outerL = isInitialBox ? 3.0 : halfL + 0.55;
  const outerW = isInitialBox ? 2.0 : halfW + 0.45;
  const innerL = isInitialBox ? 0.2 : Math.max(0.15, halfL - 0.35);
  const innerW = isInitialBox ? 0.2 : Math.max(0.15, halfW - 0.35);

  const maxGroundZ = cz - Math.max(0.15, halfH * 0.4);
  const minGroundZ = Math.min(cz - 4.5, -4.5);

  for (let i = 0; i < count; i++) {
    const z = array[i * 3 + 2];
    if (z > maxGroundZ || z < minGroundZ) continue;

    const x = array[i * 3];
    const y = array[i * 3 + 1];
    const dx = x - cx;
    const dy = y - cy;

    const lx = dx * cosY - dy * sinY;
    const ly = dx * sinY + dy * cosY;

    const inOuter = Math.abs(lx) <= outerL && Math.abs(ly) <= outerW;
    const inCore = !isInitialBox && Math.abs(lx) < innerL && Math.abs(ly) < innerW;

    if (inOuter && !inCore) {
      groundPts.push({ lx, ly, z });
    }
  }

  if (groundPts.length < 8) {
    const extL = outerL + 0.25;
    const extW = outerW + 0.25;
    for (let i = 0; i < count; i++) {
      const z = array[i * 3 + 2];
      if (z > maxGroundZ || z < minGroundZ) continue;
      const dx = array[i * 3] - cx;
      const dy = array[i * 3 + 1] - cy;
      const lx = dx * cosY - dy * sinY;
      const ly = dx * sinY + dy * cosY;
      if (Math.abs(lx) <= extL && Math.abs(ly) <= extW) {
        groundPts.push({ lx, ly, z });
      }
    }
  }

  const resolvedEgoRoadZ = egoRoadZ !== undefined ? egoRoadZ : getEgoRoadGroundZInMainWorld();

  const computeSmartFallbackGroundZ = (): number => {
    const curObjH = halfH * 2;
    const searchL = halfL + 0.35;
    const searchW = halfW + 0.25;
    const bodyPtsZ: number[] = [];

    for (let i = 0; i < count; i++) {
      const z = array[i * 3 + 2];
      if (z < cz - halfH - 0.4 || z > cz + halfH + 0.4) continue;
      const dx = array[i * 3] - cx;
      const dy = array[i * 3 + 1] - cy;
      const lx = dx * cosY - dy * sinY;
      const ly = dx * sinY + dy * cosY;
      if (Math.abs(lx) <= searchL && Math.abs(ly) <= searchW) {
        bodyPtsZ.push(z);
      }
    }

    const currentBaseZ = cz - halfH;

    if (bodyPtsZ.length >= 4) {
      bodyPtsZ.sort((a, b) => a - b);
      const zRoof = bodyPtsZ[Math.floor(bodyPtsZ.length * 0.95)];
      const zLowest = bodyPtsZ[Math.floor(bodyPtsZ.length * 0.05)];
      const zFromRoof = zRoof - curObjH;
      const zFromLowest = zLowest - 0.18;
      const estimatedZ = Math.min(zFromRoof, zFromLowest);
      if (Math.abs(estimatedZ - currentBaseZ) <= 0.45) {
        return Number(estimatedZ.toFixed(3));
      }
    }

    const localGround: number[] = [];
    const minRSq = (halfL + 0.4) * (halfL + 0.4);
    const maxRSq = 5.0 * 5.0;
    for (let i = 0; i < count; i++) {
      const z = array[i * 3 + 2];
      if (z < currentBaseZ - 0.5 || z > currentBaseZ + 0.25) continue;
      const dx = array[i * 3] - cx;
      const dy = array[i * 3 + 1] - cy;
      const dSq = dx * dx + dy * dy;
      if (dSq >= minRSq && dSq <= maxRSq) {
        localGround.push(z);
      }
    }

    if (localGround.length >= 4) {
      localGround.sort((a, b) => a - b);
      const p20 = localGround[Math.floor(localGround.length * 0.2)];
      if (Math.abs(p20 - currentBaseZ) <= 0.40) {
        return Number(p20.toFixed(3));
      }
    }

    if (egoRoadZ !== undefined && Math.abs(egoRoadZ - currentBaseZ) <= 0.50) {
      return Number(egoRoadZ.toFixed(3));
    }

    return Number(currentBaseZ.toFixed(3));
  };

  if (groundPts.length < 10) {
    const fallbackGroundZ = computeSmartFallbackGroundZ();
    return {
      groundZ: fallbackGroundZ,
      pitchRad: 0,
      rollRad: 0,
      pitchDeg: 0,
      rollDeg: 0,
      groundPointsCount: groundPts.length,
      isFallbackZeroGround: true,
      isCurbGround: false,
      isHalfCurb: false,
      halfCurbSide: "none",
      curbHeightCm: 0,
    };
  }

  groundPts.sort((a, b) => a.z - b.z);
  const cutLow = Math.floor(groundPts.length * 0.01);
  const sorted = groundPts.slice(cutLow);

  let validPts = sorted;
  const seedCount = Math.max(6, Math.floor(sorted.length * 0.35));
  const seedPts = sorted.slice(0, seedCount);

  let sumSeedLx = 0, sumSeedLy = 0, sumSeedZ = 0;
  for (const p of seedPts) {
    sumSeedLx += p.lx;
    sumSeedLy += p.ly;
    sumSeedZ += p.z;
  }
  const meanSeedLx = sumSeedLx / seedCount;
  const meanSeedLy = sumSeedLy / seedCount;
  const meanSeedZ = sumSeedZ / seedCount;

  let vSeedLx = 0, vSeedLy = 0, cSeedLxLy = 0, cSeedLxZ = 0, cSeedLyZ = 0;
  for (const p of seedPts) {
    const dlx = p.lx - meanSeedLx;
    const dly = p.ly - meanSeedLy;
    const dz = p.z - meanSeedZ;
    vSeedLx += dlx * dlx;
    vSeedLy += dly * dly;
    cSeedLxLy += dlx * dly;
    cSeedLxZ += dlx * dz;
    cSeedLyZ += dly * dz;
  }

  const detSeed = vSeedLx * vSeedLy - cSeedLxLy * cSeedLxLy;
  let aSeed = 0, bSeed = 0, c0Seed = meanSeedZ;
  if (Math.abs(detSeed) > 1e-4) {
    aSeed = (cSeedLxZ * vSeedLy - cSeedLyZ * cSeedLxLy) / detSeed;
    bSeed = (cSeedLyZ * vSeedLx - cSeedLxZ * cSeedLxLy) / detSeed;
    c0Seed = meanSeedZ - aSeed * meanSeedLx - bSeed * meanSeedLy;
  }

  const inliers = sorted.filter((p) => {
    const expectedZ = aSeed * p.lx + bSeed * p.ly + c0Seed;
    const diff = p.z - expectedZ;
    return diff >= -0.08 && diff <= 0.08;
  });

  if (inliers.length >= 6 && inliers.length >= sorted.length * 0.20) {
    validPts = inliers;
  }

  const qFL: typeof groundPts = [];
  const qFR: typeof groundPts = [];
  const qRL: typeof groundPts = [];
  const qRR: typeof groundPts = [];

  for (const p of validPts) {
    if (p.lx >= 0 && p.ly >= 0) qFL.push(p);
    else if (p.lx >= 0 && p.ly < 0) qFR.push(p);
    else if (p.lx < 0 && p.ly >= 0) qRL.push(p);
    else qRR.push(p);
  }

  const fitPts: typeof groundPts = [];
  const takeRatio = 0.45;

  const addLowestFromQuadrant = (q: typeof groundPts) => {
    if (q.length === 0) return;
    const cnt = Math.max(1, Math.floor(q.length * takeRatio));
    fitPts.push(...q.slice(0, cnt));
  };

  addLowestFromQuadrant(qFL);
  addLowestFromQuadrant(qFR);
  addLowestFromQuadrant(qRL);
  addLowestFromQuadrant(qRR);

  const finalPts = fitPts.length >= 4 ? fitPts : validPts.slice(0, Math.max(4, Math.floor(validPts.length * 0.45)));

  if (finalPts.length < 6) {
    const fallbackGroundZ = computeSmartFallbackGroundZ();
    return {
      groundZ: fallbackGroundZ,
      pitchRad: 0,
      rollRad: 0,
      pitchDeg: 0,
      rollDeg: 0,
      groundPointsCount: finalPts.length,
      isFallbackZeroGround: true,
      isCurbGround: false,
      isHalfCurb: false,
      halfCurbSide: "none",
      curbHeightCm: 0,
    };
  }

  let sumLx = 0;
  let sumLy = 0;
  let sumZ = 0;
  const N = finalPts.length;

  for (const p of finalPts) {
    sumLx += p.lx;
    sumLy += p.ly;
    sumZ += p.z;
  }

  const meanLx = sumLx / N;
  const meanLy = sumLy / N;
  const meanZ = sumZ / N;

  let varLx = 0;
  let varLy = 0;
  let covLxLy = 0;
  let covLxZ = 0;
  let covLyZ = 0;

  for (const p of finalPts) {
    const dlx = p.lx - meanLx;
    const dly = p.ly - meanLy;
    const dz = p.z - meanZ;
    varLx += dlx * dlx;
    varLy += dly * dly;
    covLxLy += dlx * dly;
    covLxZ += dlx * dz;
    covLyZ += dly * dz;
  }

  const det = varLx * varLy - covLxLy * covLxLy;
  let pitchRad = 0;
  let rollRad = 0;
  let c0 = meanZ;
  let a = 0;
  let b = 0;

  const maxPitchRad = (20 * Math.PI) / 180;
  const maxRollRad = (25 * Math.PI) / 180;

  if (Math.abs(det) > 1e-4) {
    a = (covLxZ * varLy - covLyZ * covLxLy) / det;
    b = (covLyZ * varLx - covLxZ * covLxLy) / det;

    pitchRad = Math.max(-maxPitchRad, Math.min(maxPitchRad, -Math.atan(a)));
    rollRad = Math.max(-maxRollRad, Math.min(maxRollRad, Math.atan(b)));
    c0 = meanZ - a * meanLx - b * meanLy;
  } else {
    const pIdx = Math.floor(finalPts.length * 0.15);
    c0 = finalPts[pIdx].z;
  }

  const p12Idx = Math.max(0, Math.floor(sorted.length * 0.12));
  const lowestRoadZ = sorted[p12Idx].z;

  const leftPtsZ = sorted.filter((p) => p.ly > 0.15).map((p) => p.z).sort((a, b) => a - b);
  const rightPtsZ = sorted.filter((p) => p.ly < -0.15).map((p) => p.z).sort((a, b) => a - b);

  let isCurbOrRamp = lockRollFlat === true;
  let isHalfCurb = false;
  let halfCurbSide: "left" | "right" | "none" = "none";
  let curbHeightCm = 0;

  if (!isCurbOrRamp && leftPtsZ.length >= 3 && rightPtsZ.length >= 3) {
    const leftMedian = leftPtsZ[Math.floor(leftPtsZ.length * 0.25)];
    const rightMedian = rightPtsZ[Math.floor(rightPtsZ.length * 0.25)];
    const stepDeltaZ = Math.abs(leftMedian - rightMedian);
    const lowerPts = leftMedian < rightMedian ? leftPtsZ : rightPtsZ;
    const lowerSpread = lowerPts[Math.floor(lowerPts.length * 0.75)] - lowerPts[Math.floor(lowerPts.length * 0.25)];

    if (stepDeltaZ >= 0.08 && lowerSpread < 0.05) {
      isCurbOrRamp = true;
    }
  }

  const W = halfW * 2;
  const edgeRightPts = sorted.filter(
    (p) => p.ly >= -halfW - 0.45 && p.ly <= -halfW + W * 0.30
  );
  const edgeLeftPts = sorted.filter(
    (p) => p.ly >= halfW - W * 0.30 && p.ly <= halfW + 0.45
  );

  if (edgeRightPts.length >= 2 && edgeLeftPts.length >= 2) {
    const aSlope = -Math.tan(pitchRad);
    const baseFloorZ = sorted[0].z;
    const extractEdgeZ = (edgePts: typeof sorted) => {
      const transPts = edgePts
        .map((p) => ({ lx: p.lx, ly: p.ly, zTrans: p.z - aSlope * p.lx }))
        .sort((a, b) => a.zTrans - b.zTrans);
      const basePts = transPts.filter((p) => p.zTrans <= baseFloorZ + 0.08);
      if (basePts.length >= 2) {
        return basePts[Math.floor(basePts.length / 2)].zTrans;
      }
      const curbPts = transPts.filter((p) => p.zTrans >= baseFloorZ + 0.07 && p.zTrans <= baseFloorZ + 0.35);
      if (curbPts.length >= 2) {
        return curbPts[Math.floor(curbPts.length * 0.25)].zTrans;
      }
      return transPts[0].zTrans;
    };

    const zRight = extractEdgeZ(edgeRightPts);
    const zLeft = extractEdgeZ(edgeLeftPts);

    const sumRightLy = edgeRightPts.reduce((s, p) => s + p.ly, 0);
    const sumLeftLy = edgeLeftPts.reduce((s, p) => s + p.ly, 0);
    const meanRightLy = sumRightLy / edgeRightPts.length;
    const meanLeftLy = sumLeftLy / edgeLeftPts.length;
    const spanY = Math.max(0.6, meanLeftLy - meanRightLy);

    const deltaZ = zLeft - zRight;
    const absDeltaZ = Math.abs(deltaZ);

    const egoZ = resolvedEgoRoadZ;
    const diffLeftEgo = zLeft - egoZ;
    const diffRightEgo = zRight - egoZ;

    if (absDeltaZ >= 0.07 && absDeltaZ <= 0.35) {
      const isLeftCurb = Math.abs(diffRightEgo) <= 0.08 && diffLeftEgo >= 0.07 && diffLeftEgo <= 0.35;
      const isRightCurb = Math.abs(diffLeftEgo) <= 0.08 && diffRightEgo >= 0.07 && diffRightEgo <= 0.35;

      if (isLeftCurb || isRightCurb) {
        isHalfCurb = true;
        halfCurbSide = isLeftCurb ? "left" : "right";
        curbHeightCm = Math.round(absDeltaZ * 100);
        const edgeRoll = Math.atan(deltaZ / spanY);
        rollRad = Math.max(-maxRollRad, Math.min(maxRollRad, edgeRoll));
        c0 = (zLeft + zRight) / 2;
      }
    }

    if (!isHalfCurb) {
      if (isCurbOrRamp) {
        rollRad = 0;
        c0 = lowestRoadZ;

        const roadPts = validPts.filter((p) => p.z <= lowestRoadZ + 0.10);
        if (roadPts.length >= 4) {
          let sLx = 0;
          let sZ = 0;
          for (const p of roadPts) {
            sLx += p.lx;
            sZ += p.z;
          }
          const mLx = sLx / roadPts.length;
          const mZ = sZ / roadPts.length;
          let vLx = 0;
          let cLxZ = 0;
          for (const p of roadPts) {
            const dlx = p.lx - mLx;
            const dz = p.z - mZ;
            vLx += dlx * dlx;
            cLxZ += dlx * dz;
          }
          if (vLx > 1e-4) {
            const aRoad = cLxZ / vLx;
            pitchRad = Math.max(-maxPitchRad, Math.min(maxPitchRad, -Math.atan(aRoad)));
          }
        }
      } else {
        const edgeRoll = Math.atan(deltaZ / spanY);
        if (Math.abs(rollRad - edgeRoll) < 0.05) {
          c0 = (zLeft + zRight) / 2;
        } else {
          rollRad = Math.max(-maxRollRad, Math.min(maxRollRad, edgeRoll));
          c0 = (zLeft + zRight) / 2;
        }
      }
    }
  } else {
    rollRad = 0;
    if (isCurbOrRamp) {
      c0 = lowestRoadZ;
    }
  }

  const L = halfL * 2;
  const edgeFrontPts = sorted.filter(
    (p) => p.lx >= halfL - L * 0.30 && p.lx <= halfL + 0.45
  );
  const edgeRearPts = sorted.filter(
    (p) => p.lx >= -halfL - 0.45 && p.lx <= -halfL + L * 0.30
  );

  if (!isCurbOrRamp && !isHalfCurb && edgeFrontPts.length >= 2 && edgeRearPts.length >= 2) {
    const bSlope = Math.tan(rollRad);
    const extractSideZ = (edgePts: typeof sorted) => {
      const transPts = edgePts
        .map((p) => ({ lx: p.lx, ly: p.ly, zTrans: p.z - bSlope * p.ly }))
        .sort((a, b) => a.zTrans - b.zTrans);
      const floorZ = transPts[0].zTrans;
      const basePts = transPts.filter((p) => p.zTrans <= floorZ + 0.08);
      if (basePts.length >= 2) {
        return basePts[Math.floor(basePts.length / 2)].zTrans;
      }
      return transPts[0].zTrans;
    };

    const zFront = extractSideZ(edgeFrontPts);
    const zRear = extractSideZ(edgeRearPts);

    const sumFrontLx = edgeFrontPts.reduce((s, p) => s + p.lx, 0);
    const sumRearLx = edgeRearPts.reduce((s, p) => s + p.lx, 0);
    const meanFrontLx = sumFrontLx / edgeFrontPts.length;
    const meanRearLx = sumRearLx / edgeRearPts.length;
    const spanX = Math.max(0.8, meanFrontLx - meanRearLx);

    const deltaZSide = zFront - zRear;
    const edgePitch = -Math.atan(deltaZSide / spanX);

    if (Math.abs(pitchRad - edgePitch) < 0.05) {
      pitchRad = edgePitch;
    } else {
      pitchRad = Math.max(-maxPitchRad, Math.min(maxPitchRad, edgePitch));
    }

    c0 = (zFront + zRear) / 2;
  }

  let isCurbGround = false;
  const refEgoZ = egoRoadZ !== undefined ? egoRoadZ : getEgoRoadGroundZInMainWorld();
  if (!isCurbOrRamp && !isHalfCurb) {
    if (c0 >= refEgoZ + 0.08 && c0 <= refEgoZ + 0.35) {
      isCurbGround = true;
      curbHeightCm = Math.round((c0 - refEgoZ) * 100);
      if (Math.abs(rollRad) < (5 * Math.PI) / 180) {
        rollRad = 0;
      }
    } else if (c0 < refEgoZ - 0.25 && validPts.length < 15) {
      c0 = refEgoZ;
      rollRad = 0;
      pitchRad = 0;
    }
  }

  let pitchRadVal = Number(pitchRad.toFixed(5));
  let rollRadVal = Number(rollRad.toFixed(5));
  let pitchDegVal = Number(((pitchRad * 180) / Math.PI).toFixed(2));
  let rollDegVal = Number(((rollRad * 180) / Math.PI).toFixed(2));

  if (Math.abs(pitchRadVal) < 1e-6) pitchRadVal = 0;
  if (Math.abs(rollRadVal) < 1e-6) rollRadVal = 0;
  if (Math.abs(pitchDegVal) < 1e-4) pitchDegVal = 0;
  if (Math.abs(rollDegVal) < 1e-4) rollDegVal = 0;

  return {
    groundZ: Number(c0.toFixed(3)),
    pitchRad: pitchRadVal,
    rollRad: rollRadVal,
    pitchDeg: pitchDegVal,
    rollDeg: rollDegVal,
    groundPointsCount: finalPts.length,
    isCurbGround,
    isHalfCurb,
    halfCurbSide,
    curbHeightCm,
  };
}

export interface CurbStepResult {
  hasCurb: boolean;
  side: "left" | "right" | "none";
  curbHeight: number;
  curbHeightCm: number;
  rollRad: number;
  rollDeg: number;
  roadGroundZ: number;
  deltaCenterZ: number;
}

/**
 * Thuật toán TỰ ĐỘNG NHẬN DIỆN VỈA HÈ & BẬC GÁC LỀ TRONG MAIN WORLD
 */
export function detectCurbStepAndRollInMainWorld(
  cx: number,
  cy: number,
  cz: number,
  yaw: number,
  halfL: number,
  halfW: number,
  trackW?: number
): CurbStepResult {
  const lidar = getSceneLidarPoints();
  if (!lidar || lidar.count === 0) {
    return { hasCurb: false, side: "none", curbHeight: 0.15, curbHeightCm: 15, rollRad: 0, rollDeg: 0, roadGroundZ: cz - 0.7, deltaCenterZ: 0.075 };
  }

  const { count, array } = lidar;
  const cosY = Math.cos(-yaw);
  const sinY = Math.sin(-yaw);
  const effectiveW = trackW !== undefined ? trackW : halfW * 2;

  const minLy = Math.max(0.2, halfW * 0.7);
  const maxLy = halfW + 0.85;
  const maxLx = halfL + 0.55;

  const maxZ = cz - 0.15;
  const minZ = cz - 4.5;

  const leftPts: number[] = [];
  const rightPts: number[] = [];

  for (let i = 0; i < count; i++) {
    const z = array[i * 3 + 2];
    if (z > maxZ || z < minZ) continue;
    const x = array[i * 3];
    const y = array[i * 3 + 1];
    const lx = (x - cx) * cosY - (y - cy) * sinY;
    const ly = (x - cx) * sinY + (y - cy) * cosY;

    if (Math.abs(lx) > maxLx) continue;

    if (ly >= minLy && ly <= maxLy) {
      leftPts.push(z);
    } else if (ly <= -minLy && ly >= -maxLy) {
      rightPts.push(z);
    }
  }

  if (leftPts.length < 3 || rightPts.length < 3) {
    return { hasCurb: false, side: "none", curbHeight: 0.15, curbHeightCm: 15, rollRad: 0, rollDeg: 0, roadGroundZ: cz - 0.7, deltaCenterZ: 0.075 };
  }

  leftPts.sort((a, b) => a - b);
  rightPts.sort((a, b) => a - b);

  const leftZ = leftPts[Math.floor(leftPts.length * 0.25)];
  const rightZ = rightPts[Math.floor(rightPts.length * 0.25)];

  const deltaZ = leftZ - rightZ;
  const absDeltaZ = Math.abs(deltaZ);

  if (absDeltaZ >= 0.07 && absDeltaZ <= 0.32) {
    const curbHeight = Number(absDeltaZ.toFixed(3));
    const curbHeightCm = Math.round(curbHeight * 100);
    const side = deltaZ > 0 ? "left" : "right";

    const ratio = Math.max(-0.6, Math.min(0.6, deltaZ / effectiveW));
    const rollRad = Number(Math.asin(ratio).toFixed(5));
    const rollDeg = Number(((rollRad * 180) / Math.PI).toFixed(2));

    const roadGroundZ = Number(Math.min(leftZ, rightZ).toFixed(3));
    const deltaCenterZ = Number((curbHeight / 2).toFixed(3));

    return {
      hasCurb: true,
      side,
      curbHeight,
      curbHeightCm,
      rollRad,
      rollDeg,
      roadGroundZ,
      deltaCenterZ,
    };
  }

  return {
    hasCurb: false,
    side: "none",
    curbHeight: Number(absDeltaZ.toFixed(3)),
    curbHeightCm: Math.round(absDeltaZ * 100),
    rollRad: 0,
    rollDeg: 0,
    roadGroundZ: Number(Math.min(leftZ, rightZ).toFixed(3)),
    deltaCenterZ: 0,
  };
}

/**
 * Thuật toán Cắt Thung Lũng Mật Độ Trục Z (Z-Axis Density Gap Cutoff) & Dò Đỉnh Đầu Thật
 */
export function detectTrueHeadZInMainWorld(
  zArr: number[],
  maxGap: number = 0.15,
  groundZ?: number,
  maxNormalHeight: number = 1.95
): number {
  return detectTrueHeadZ(zArr, maxGap, groundZ, maxNormalHeight);
}
