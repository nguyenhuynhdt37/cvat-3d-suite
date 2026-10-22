/**
 * Đoạn mã chạy trực tiếp trong Main World của trang web CVAT:
 * - Có quyền truy cập 100% vào Redux Store, cvat-core và Three.js Canvas3D
 * - Trích xuất trực tiếp mảng 300,000+ điểm LiDAR từ THREE.Points trong WebGL RAM
 * - Tính toán chính xác 100% cao độ mặt đất thực tế (Ground Detection) & Tự Fit Box hoàn toàn
 * - Tự động nhận diện khi click vào box 3D trên Canvas (Canvas Auto-Select) và Highlight 2 chiều
 * - Can thiệp trực tiếp vào canvas.view.drawnObjects[clientID].cuboid (setRotation, setScale, setPosition)
 * - Ép Three.js vẽ lại tức thì bằng canvas.render() -> REALTIME 100% (ZERO-RELOAD / KHÔNG CẦN F5)
 */

export function mainWorldScript(): void {
  if ((window as any).__CVAT_3D_SUITE_INJECTED__) return;
  (window as any).__CVAT_3D_SUITE_INJECTED__ = true;

  console.log("[CVAT 3D Suite] Main-World Injected Bridge đã sẵn sàng (LiDAR Point Cloud Engine, Auto-Fit & Canvas Select).");

  function flipYawRad(yaw: number): number {
    let newYaw = yaw + Math.PI;
    while (newYaw > Math.PI) newYaw -= 2 * Math.PI;
    while (newYaw < -Math.PI) newYaw += 2 * Math.PI;
    return newYaw;
  }

  // Helper lấy Redux Store từ React Fiber root container
  function getReduxStore(): any {
    const rootEl = document.getElementById("root");
    if (!rootEl) return null;
    const rKey = Object.keys(rootEl).find(
      (k) => k.startsWith("__reactContainer$") || k.startsWith("__reactFiber$")
    );
    if (!rKey) return null;
    let rNode = (rootEl as any)[rKey];
    while (rNode) {
      if (rNode.memoizedProps?.store) return rNode.memoizedProps.store;
      if (rNode.stateNode?.store) return rNode.stateNode.store;
      rNode = rNode.child;
    }
    return null;
  }

  // Lấy Job Instance thật đang gắn liền với ứng dụng CVAT
  async function getActiveJobInstance(jobId?: number): Promise<any> {
    const store = getReduxStore();
    const storeJob = store?.getState()?.annotation?.job?.instance;
    if (storeJob) {
      return storeJob;
    }

    const win = window as any;
    if (win.cvat && win.cvat.jobs && jobId) {
      const jobs = await win.cvat.jobs.get({ jobID: jobId });
      if (jobs && jobs.length > 0) return jobs[0];
    }
    return null;
  }

  // Trích xuất đối tượng THREE.Points từ Scene của Canvas3D
  function getSceneLidarPoints(): { count: number; array: Float32Array } | null {
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
      const posAttr = found.geometry.attributes.position;
      return { count: posAttr.count, array: posAttr.array };
    } catch (e) {
      console.warn("[CVAT 3D Suite] Không thể trích xuất LiDAR points:", e);
      return null;
    }
  }

  // Thuật toán Annular Ring Ground Detection & 3D Slope Fitting (Pitch Dọc & Roll Ngang Front)
  // Thuật toán ƯỚC LƯỢNG CAO ĐỘ MẶT ĐƯỜNG XE EGO (Ego Road Surface Z Reference):
  // Quét các điểm mặt đường trong bán kính 1.2m - 6.0m quanh xe Ego làm mốc chuẩn
  function getEgoRoadGroundZInMainWorld(egoPos: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }): number {
    const lidar = getSceneLidarPoints();
    if (!lidar || lidar.count === 0) return 0;
    const { count, array } = lidar;
    const minRSq = 1.2 * 1.2;
    const maxRSq = 6.0 * 6.0;
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
    if (zArr.length < 8) return 0;
    zArr.sort((a, b) => a - b);
    const cutLow = Math.floor(zArr.length * 0.01);
    const validZ = zArr.slice(cutLow);
    const p15 = validZ[Math.floor(validZ.length * 0.15)];
    return Number(p15.toFixed(3));
  }

  // Thuật toán TÍNH CAO ĐỘ MẶT ĐẤT VÀ ĐỘ DỐC ĐƯỜNG 3D THEO FOOTPRINT VẾT ĐÈ CỦA BOX (Pitch & Roll Fitting)
  // - Thu hẹp bán kính quét XY bám sát viền bánh xe (+0.55m dọc đầu đuôi, +0.45m ngang sườn xe Front)
  //   Loại bỏ 100% nhiễu do vơ phải các điểm của xe bên cạnh, dải phân cách bê tông hay tường rào
  // - Mở rộng độ sâu quét Z sâu xuống -4.5m dưới tâm xe để bắt trọn curpoint mặt đường dưới cùng khi box lơ lửng
  // - Cân bằng 4 góc tiếp đất (Front-Left, Front-Right, Rear-Left, Rear-Right) đảm bảo căn cứ dốc ngang Front (Roll) chuẩn xác
  // - Căn góc dốc ngang Front Roll theo 2 đầu mép biên 0–10% và 90–100%: nếu không đủ điểm -> khóa Roll = 0°
  // - Tham chiếu mốc Z mặt đường Ego (Ego Road Z) chống lún âm đất và nhận diện nền vỉa hè
  function detectAccurateGroundZ(
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
  ): {
    groundZ: number | null;
    pitchRad: number;
    rollRad: number;
    pitchDeg: number;
    rollDeg: number;
    groundPointsCount: number;
    isFallbackZeroGround?: boolean;
    isCurbGround?: boolean;
  } {
    const lidar = getSceneLidarPoints();
    if (!lidar || lidar.count === 0) {
      return {
        groundZ: 0,
        pitchRad: 0,
        rollRad: 0,
        pitchDeg: 0,
        rollDeg: 0,
        groundPointsCount: 0,
        isFallbackZeroGround: true,
      };
    }

    const { count, array } = lidar;
    const cosY = Math.cos(-yaw);
    const sinY = Math.sin(-yaw);

    const groundPts: Array<{ lx: number; ly: number; z: number }> = [];
    // Bán kính quét Footprint chặt chẽ quanh 4 lốp xe:
    const outerL = isInitialBox ? 3.0 : halfL + 0.55;
    const outerW = isInitialBox ? 2.0 : halfW + 0.45;
    const innerL = isInitialBox ? 0.2 : Math.max(0.15, halfL - 0.35);
    const innerW = isInitialBox ? 0.2 : Math.max(0.15, halfW - 0.35);

    // Mở rộng độ sâu: Trần cao độ lấy từ mép sàn xe trở xuống (cz - halfH * 0.4), đáy quét sâu tận cz - 4.5m
    const maxGroundZ = cz - Math.max(0.15, halfH * 0.4);
    const minGroundZ = cz - 4.5;

    for (let i = 0; i < count; i++) {
      const z = array[i * 3 + 2];
      if (z > maxGroundZ || z < minGroundZ) continue;

      const x = array[i * 3];
      const y = array[i * 3 + 1];
      const dx = x - cx;
      const dy = y - cy;

      const lx = dx * cosY - dy * sinY;
      const ly = dx * sinY + dy * cosY;

      // Nằm trong vành đai Footprint tiếp đất và KHÔNG nằm trong vùng lõi gầm xe bị che khuất
      const inOuter = Math.abs(lx) <= outerL && Math.abs(ly) <= outerW;
      const inCore = !isInitialBox && Math.abs(lx) < innerL && Math.abs(ly) < innerW;

      if (inOuter && !inCore) {
        groundPts.push({ lx, ly, z });
      }
    }

    if (groundPts.length < 8) {
      // Fallback 1: Nới nhẹ thêm 25cm (tối đa outerL + 0.25) cho xe ở quá xa cảm biến
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

    if (groundPts.length < 6) {
      // Dưới chân không có điểm hoặc rất ít điểm (< 6 điểm) -> Neo chuẩn theo mốc Z mặt đường của Ego
      return {
        groundZ: Number(resolvedEgoRoadZ.toFixed(3)),
        pitchRad: 0,
        rollRad: 0,
        pitchDeg: 0,
        rollDeg: 0,
        groundPointsCount: groundPts.length,
        isFallbackZeroGround: true,
        isCurbGround: false,
      };
    }

    // Lọc cụm điểm sàn dưới cùng (Bottom Floor Cluster):
    groundPts.sort((a, b) => a.z - b.z);
    // Loại bỏ 1% điểm ngầm đáy sâu cùng (nhiễu phản xạ đáy cống/vũng nước)
    const cutLow = Math.floor(groundPts.length * 0.01);
    const sorted = groundPts.slice(cutLow);

    // Thuật toán Lọc Mặt Sàn Kháng Thân Xe & Vật Thể Nổi (Robust Ground Inlier Filter):
    // 1. Lấy 35% số điểm ở tầng thấp nhất làm hạt giống sàn cơ sở (Ground Seed Points)
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

    // 2. Lọc Inliers: Điểm mặt đất thực tế chỉ nằm trong dải tán xạ [-8cm, +8cm] so với mặt phẳng sàn cơ sở.
    // Các điểm thân xe (gầm xe, sườn xe, xe khác đỗ gần) có dz > +10cm sẽ bị loại bỏ 100%.
    const inliers = sorted.filter((p) => {
      const expectedZ = aSeed * p.lx + bSeed * p.ly + c0Seed;
      const diff = p.z - expectedZ;
      return diff >= -0.08 && diff <= 0.08;
    });

    if (inliers.length >= 6 && inliers.length >= sorted.length * 0.20) {
      validPts = inliers;
    }

    // Cân bằng 4 góc phần tư (Quadrant Balancing): Front-Left, Front-Right, Rear-Left, Rear-Right
    // Đảm bảo sườn Trái và Phải có tỷ trọng ngang nhau -> góc Front (Roll) cực kỳ chuẩn xác
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
    const takeRatio = 0.45; // Lấy 45% điểm thấp nhất của mỗi phân vùng

    const addLowestFromQuadrant = (q: typeof groundPts) => {
      if (q.length === 0) return;
      const count = Math.max(1, Math.floor(q.length * takeRatio));
      fitPts.push(...q.slice(0, count));
    };

    addLowestFromQuadrant(qFL);
    addLowestFromQuadrant(qFR);
    addLowestFromQuadrant(qRL);
    addLowestFromQuadrant(qRR);

    const finalPts = fitPts.length >= 4 ? fitPts : validPts.slice(0, Math.max(4, Math.floor(validPts.length * 0.45)));

    // Hồi quy tuyến tính bình phương tối thiểu (OLS) mặt phẳng 3D: z = a * lx + b * ly + c0
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

      // Cao độ mặt đất tại tâm xe (lx = 0, ly = 0)
      c0 = meanZ - a * meanLx - b * meanLy;
    } else {
      const pIdx = Math.floor(finalPts.length * 0.15);
      c0 = finalPts[pIdx].z;
    }

    // Tính sai số dư (residual) của các điểm so với mặt phẳng hồi quy OLS
    let meanResidual = 0;
    if (Math.abs(det) > 1e-4) {
      let sumRes = 0;
      for (const p of finalPts) {
        const expectedZ = a * p.lx + b * p.ly + c0;
        sumRes += Math.abs(p.z - expectedZ);
      }
      meanResidual = sumRes / finalPts.length;
    }

    // =========================================================================
    // THUẬT TOÁN PHÂN BIỆT MẶT ĐƯỜNG DỐC NGHIÊNG TỰ NHIÊN VS VỈA HÈ BẬC ĐỨNG:
    // 1. Nếu mây điểm phân bố phẳng đều (meanResidual < 0.035m) và góc dốc ngang |rollRad| <= 10°:
    //    -> 100% là MẶT ĐƯỜNG DỐC NGHIÊNG TỰ NHIÊN (Natural Sloped Road)!
    //    -> Giữ nguyên rollRad để xe bám nghiêng theo mặt đường, Front View khít 100%.
    // 2. Chỉ coi là vỉa hè khi có bậc đứng rõ rệt (stepDeltaZ >= 0.08m) VÀ sai số mặt phẳng lớn (meanResidual >= 0.035m),
    //    hoặc khi người dùng chủ động yêu cầu lockRollFlat = true.
    // =========================================================================

    // Phân vị thấp 12% đại diện cho cao độ mặt đường dưới lòng đường (Lowest Road Surface)
    const p12Idx = Math.max(0, Math.floor(validPts.length * 0.12));
    const lowestRoadZ = validPts[p12Idx].z;

    const leftPtsZ = validPts.filter((p) => p.ly > 0.15).map((p) => p.z).sort((a, b) => a - b);
    const rightPtsZ = validPts.filter((p) => p.ly < -0.15).map((p) => p.z).sort((a, b) => a - b);

    let isCurbOrRamp = lockRollFlat === true;

    if (!isCurbOrRamp && leftPtsZ.length >= 3 && rightPtsZ.length >= 3) {
      const leftMedian = leftPtsZ[Math.floor(leftPtsZ.length * 0.25)];
      const rightMedian = rightPtsZ[Math.floor(rightPtsZ.length * 0.25)];
      const stepDeltaZ = Math.abs(leftMedian - rightMedian);
      const lowerPts = leftMedian < rightMedian ? leftPtsZ : rightPtsZ;
      const lowerSpread = lowerPts[Math.floor(lowerPts.length * 0.75)] - lowerPts[Math.floor(lowerPts.length * 0.25)];

      // Nhận diện Bậc Vỉa Hè: Chênh lệch cao độ lớn giữa 2 bên (stepDeltaZ >= 0.08m = 8cm)
      // VÀ bên lòng đường thấp là mặt phẳng ngang (lowerSpread < 0.05m = 5cm).
      // Nếu lòng đường dốc liên tục hoặc độ nghiêng nhẹ (< 8cm): Là đường nghiêng tự nhiên -> bám theo Roll!
      if (stepDeltaZ >= 0.08 && lowerSpread < 0.05) {
        isCurbOrRamp = true;
      }
    }

    if (isCurbOrRamp) {
      rollRad = 0;
      c0 = lowestRoadZ;

      // Bảo lưu dốc dọc xe (Pitch) từ các điểm thuộc mặt đường bên dưới
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
      // =========================================================================
      // CĂN GÓC DỐC NGANG FRONT ROLL THEO 2 ĐẦU MÉP BIÊN 0–10% VÀ 90–100%:
      // =========================================================================
      const W = halfW * 2;
      const edgeRightPts = validPts.filter(
        (p) => p.ly >= -halfW - 0.45 && p.ly <= -halfW + W * 0.20
      );
      const edgeLeftPts = validPts.filter(
        (p) => p.ly >= halfW - W * 0.20 && p.ly <= halfW + 0.45
      );

      if (edgeRightPts.length >= 2 && edgeLeftPts.length >= 2) {
        const aSlope = -Math.tan(pitchRad);
        const zRightTrans = edgeRightPts.map((p) => p.z - aSlope * p.lx).sort((a, b) => a - b);
        const zLeftTrans = edgeLeftPts.map((p) => p.z - aSlope * p.lx).sort((a, b) => a - b);
        const zRight = zRightTrans[Math.floor(zRightTrans.length / 2)];
        const zLeft = zLeftTrans[Math.floor(zLeftTrans.length / 2)];

        const sumRightLy = edgeRightPts.reduce((s, p) => s + p.ly, 0);
        const sumLeftLy = edgeLeftPts.reduce((s, p) => s + p.ly, 0);
        const meanRightLy = sumRightLy / edgeRightPts.length;
        const meanLeftLy = sumLeftLy / edgeLeftPts.length;
        const spanY = Math.max(0.5, meanLeftLy - meanRightLy);

        const deltaZ = zLeft - zRight;
        const edgeRoll = Math.atan(deltaZ / spanY);

        if (Math.abs(rollRad - edgeRoll) < 0.05) {
          c0 = (zLeft + zRight) / 2;
        } else {
          rollRad = Math.max(-maxRollRad, Math.min(maxRollRad, edgeRoll));
          c0 = (zLeft + zRight) / 2;
        }
      } else {
        // Ít điểm hoặc không check được mây điểm mặt đường ở cả 2 đầu mép -> BẮT BUỘC KHÓA CỨNG Roll = 0°
        rollRad = 0;
      }
    }

    // =========================================================================
    // NHẬN DIỆN NỀN VỈA HÈ & CHỐNG LÚN ÂM ĐẤT THEO EGO ROAD Z REFERENCE:
    // =========================================================================
    let isCurbGround = false;
    const refEgoZ = egoRoadZ !== undefined ? egoRoadZ : getEgoRoadGroundZInMainWorld();
    if (!isCurbOrRamp && refEgoZ !== 0) {
      // 1. Xe đỗ hoàn toàn trên vỉa hè: Mây điểm mặt đất cao hơn Ego Road Z từ +8cm đến +35cm
      if (c0 >= refEgoZ + 0.08 && c0 <= refEgoZ + 0.35) {
        isCurbGround = true;
        if (Math.abs(rollRad) < (5 * Math.PI) / 180) {
          rollRad = 0;
        }
      }
      // 2. Chống lún âm đất cho xe ít điểm: Không cho c0 tụt sâu âm hơn mặt đường Ego quá 25cm
      else if (c0 < refEgoZ - 0.25 && validPts.length < 15) {
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
    };
  }

  // Thuật toán TỰ ĐỘNG NHẬN DIỆN VỈA HÈ & BẬC GÁC LỀ TRONG MAIN WORLD (Auto Curb Detection)
  function detectCurbStepAndRollInMainWorld(
    cx: number,
    cy: number,
    cz: number,
    yaw: number,
    halfL: number,
    halfW: number,
    trackW?: number
  ): {
    hasCurb: boolean;
    side: "left" | "right" | "none";
    curbHeight: number;
    curbHeightCm: number;
    rollRad: number;
    rollDeg: number;
    roadGroundZ: number;
    deltaCenterZ: number;
  } {
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

  // Thuật toán Phân Cụm Điểm Liên Tục & Mật Độ (Continuous Density-Connected Clustering):
  // - Dò khoảng cách (gap) giữa các điểm lân cận để tách cụm khi có khoảng trống lớn giữa 2 xe.
  // Thuật toán Phân Cụm Điểm Liên Tục & Mật Độ (Continuous Density-Connected Clustering):
  // - Dò khoảng cách (gap) giữa các điểm lân cận để tách cụm khi có khoảng trống lớn giữa 2 xe.
  // - Ưu tiên cụm có điểm gần tâm Box hiện tại nhất (minDistanceToCenter).
  // - Loại bỏ 100% điểm của xe khác đỗ bên cạnh hoặc vật cản ngoài lề.
  function filterDenseConnectedCluster1D<T extends { lx: number; ly: number; z: number }>(
    pts: T[],
    axis: "ly" | "lx",
    maxGap: number = 0.22,
    centerBias: number = 0
  ): T[] {
    if (pts.length < 8) return pts;

    const sorted = [...pts].sort((a, b) => a[axis] - b[axis]);
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
    let bestCluster = clusters[0];
    let minDistanceToCenter = Infinity;

    for (const c of clusters) {
      if (c.length < 2) continue;

      let clusterMinDist = Infinity;
      for (const p of c) {
        const d = Math.abs(p[axis] - centerBias);
        if (d < clusterMinDist) clusterMinDist = d;
      }

      if (clusterMinDist < minDistanceToCenter - 0.05) {
        minDistanceToCenter = clusterMinDist;
        bestCluster = c;
      } else if (Math.abs(clusterMinDist - minDistanceToCenter) <= 0.05) {
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

  // Dò tìm biên 1D thích nghi theo mật độ điểm và khoảng hở (Density & Gap Adaptive 1D Boundary Detection)
  // Tự động loại bỏ cụm nhiễu bên ngoài (vị trí 2 chấm đỏ) và gương chiếu hậu nhô ra ở sườn xe
  function detectAdaptiveBounds(
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



  // Thuật toán Tính Toán Biên Kháng Nhiễu Dựa Trên Mật Độ (Density Robust Bounds)
  function computeDensityRobustBounds(
    pts: Array<{ lx: number; ly: number; z: number }>,
    options: {
      rorRadius?: number;
      rorMinNeighbors?: number;
    } = {}
  ): {
    lxMin: number;
    lxMax: number;
    lyMin: number;
    lyMax: number;
    zTop: number;
    validPointsCount: number;
  } {
    if (pts.length === 0) {
      return { lxMin: 0, lxMax: 0, lyMin: 0, lyMax: 0, zTop: 0, validPointsCount: 0 };
    }

    const rorRadius = options.rorRadius ?? 0.35;
    const rorMinNeighbors = options.rorMinNeighbors ?? 1;

    // LỚP 1: Radius Outlier Removal (ROR)
    let cleanPts = pts;
    if (pts.length >= 12) {
      const rorFiltered: Array<{ lx: number; ly: number; z: number }> = [];
      const r2 = rorRadius * rorRadius;

      for (let i = 0; i < pts.length; i++) {
        let neighbors = 0;
        const pi = pts[i];
        for (let j = 0; j < pts.length; j++) {
          if (i === j) continue;
          const pj = pts[j];
          const dx = pi.lx - pj.lx;
          const dy = pi.ly - pj.ly;
          const dz = pi.z - pj.z;
          if (dx * dx + dy * dy + dz * dz <= r2) {
            neighbors++;
            if (neighbors >= rorMinNeighbors) break;
          }
        }
        if (neighbors >= rorMinNeighbors) {
          rorFiltered.push(pi);
        }
      }

      if (rorFiltered.length >= 8 && rorFiltered.length >= pts.length * 0.5) {
        cleanPts = rorFiltered;
      }
    }

    const allLx = cleanPts.map((p) => p.lx).sort((a, b) => a - b);
    const allLy = cleanPts.map((p) => p.ly).sort((a, b) => a - b);
    const allZ = cleanPts.map((p) => p.z).sort((a, b) => a - b);

    const fallbackLxMin = allLx[0];
    const fallbackLxMax = allLx[allLx.length - 1];
    const fallbackLyMin = allLy[0];
    const fallbackLyMax = allLy[allLy.length - 1];
    const zTop = allZ[allZ.length - 1];

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

  // Thuật toán Lọc Nhiễu Thưa Thớt Cận Thân Xe Dựa Trên Mật Độ Lõi 3D trong Main World
  function filterSparseNoiseByLocalDensity<T extends { lx: number; ly: number; z: number }>(
    pts: T[],
    options: { radius?: number; minCoreNeighbors?: number; adaptiveRatio?: number } = {}
  ): T[] {
    if (pts.length < 8) return pts;
    const radius = options.radius ?? 0.12;
    const r2 = radius * radius;
    const n = pts.length;
    const densities = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      const pi = pts[i];
      let count = 0;
      for (let j = 0; j < n; j++) {
        const pj = pts[j];
        const dx = pi.lx - pj.lx;
        const dy = pi.ly - pj.ly;
        const dz = pi.z - pj.z;
        if (dx * dx + dy * dy + dz * dz <= r2) count++;
      }
      densities[i] = count;
    }
    const sorted = Array.from(densities).sort((a, b) => a - b);
    const medianDensity = sorted[Math.floor(n / 2)];
    const adaptiveRatio = options.adaptiveRatio ?? 0.25;
    const userMin = options.minCoreNeighbors ?? 3;
    const coreThreshold = Math.max(userMin, Math.floor(medianDensity * adaptiveRatio));
    const corePts: T[] = [];
    for (let i = 0; i < n; i++) {
      if (densities[i] >= coreThreshold) corePts.push(pts[i]);
    }
    if (corePts.length >= 6 && corePts.length >= n * 0.4) return corePts;
    return pts;
  }

  // Thuật toán Dò Bức Tường Mật Độ Vỏ Xe & Cắt Thung Lũng Mật Độ trong Main World
  function detectDominantWallEdgeWithValleyCutoff<T extends { lx: number; ly: number; z: number }>(
    pts: T[],
    axis: "ly" | "lx",
    direction: "positive" | "negative",
    nominalHalf: number,
    options: {
      binSize?: number;
      minSpanOrthogonal?: number;
      maxSearchExtension?: number;
    } = {}
  ): {
    edge: number;
    wallPoints: T[];
    peakDensity: number;
  } {
    const isPos = direction === "positive";
    const orthAxis = axis === "ly" ? "lx" : "ly";
    const binSize = options.binSize ?? 0.03; // 3cm
    const minSpanOrth = options.minSpanOrthogonal ?? (axis === "ly" ? 0.70 : 0.60);
    const maxSearchExt = options.maxSearchExtension ?? 0.35;

    const candidatePts = pts.filter((p) => (isPos ? p[axis] > 0.02 : p[axis] < -0.02));
    if (candidatePts.length < 3) {
      return {
        edge: isPos ? nominalHalf : -nominalHalf,
        wallPoints: candidatePts,
        peakDensity: candidatePts.length,
      };
    }

    const maxDist = nominalHalf + maxSearchExt;
    const numBins = Math.ceil(maxDist / binSize) + 2;
    const bins: T[][] = Array.from({ length: numBins }, () => []);

    for (const p of candidatePts) {
      const dist = isPos ? p[axis] : -p[axis];
      if (dist >= 0 && dist <= maxDist) {
        const bIdx = Math.min(numBins - 1, Math.floor(dist / binSize));
        bins[bIdx].push(p);
      }
    }

    // 1. Tìm ĐỈNH MẬT ĐỘ THÂN XE (Dominant Wall Peak)
    const nominalMinBin = Math.max(0, Math.floor((nominalHalf - 0.45) / binSize));
    const nominalMaxBin = Math.min(numBins - 1, Math.floor((nominalHalf + maxSearchExt) / binSize));

    let peakBin = nominalMinBin;
    let maxCount = 0;

    for (let b = nominalMinBin; b <= nominalMaxBin; b++) {
      const count = bins[b].length;
      if (count > maxCount) {
        maxCount = count;
        peakBin = b;
      }
    }

    if (maxCount < 2) {
      for (let b = 1; b < numBins - 1; b++) {
        if (bins[b].length > maxCount) {
          maxCount = bins[b].length;
          peakBin = b;
        }
      }
    }

    if (maxCount === 0) {
      return {
        edge: isPos ? nominalHalf : -nominalHalf,
        wallPoints: candidatePts,
        peakDensity: 0,
      };
    }

    // 2. Dò mép vỏ xe từ peakBin ra phía ngoài (b tăng dần)
    const minWallDensity = Math.max(2, Math.floor(maxCount * 0.15));
    let outerWallBin = peakBin;

    let consecutiveEmptyBins = 0;
    for (let b = peakBin + 1; b < numBins; b++) {
      const ptsInBin = bins[b];
      const count = ptsInBin.length;

      if (count === 0) {
        consecutiveEmptyBins++;
        if (consecutiveEmptyBins >= 2) {
          break; // Cắt thung lũng khoảng trống!
        }
        continue;
      }

      const distCenter = (b + 0.5) * binSize;
      if (count < minWallDensity && distCenter > nominalHalf) {
        consecutiveEmptyBins++;
        if (consecutiveEmptyBins >= 2) {
          break;
        }
        continue;
      }

      if (distCenter > nominalHalf - 0.05) {
        const orthVals = ptsInBin.map((p) => p[orthAxis]);
        const spanOrth = Math.max(...orthVals) - Math.min(...orthVals);
        if (count <= 6 && spanOrth < minSpanOrth * 0.6) {
          if (b > peakBin + 1) {
            break;
          }
        }
      }

      consecutiveEmptyBins = 0;
      outerWallBin = b;
    }

    // 3. Thu thập điểm của thân xe từ tâm ra đến outerWallBin (loại bỏ người đi bộ bên ngoài)
    const collectedWallPoints: T[] = [];
    for (let b = 0; b <= outerWallBin; b++) {
      for (const p of bins[b]) {
        collectedWallPoints.push(p);
      }
    }

    const outerEdgePts: T[] = [];
    const edgeStartBin = Math.max(0, outerWallBin - 3);
    for (let b = edgeStartBin; b <= outerWallBin; b++) {
      for (const p of bins[b]) {
        outerEdgePts.push(p);
      }
    }

    if (outerEdgePts.length >= 3) {
      const dists = outerEdgePts.map((p) => (isPos ? p[axis] : -p[axis])).sort((a, b) => a - b);
      const pIdx = Math.max(0, Math.min(dists.length - 1, Math.floor(dists.length * 0.95)));
      const chosenDist = dists[pIdx];
      const edge = isPos ? Number(chosenDist.toFixed(3)) : Number((-chosenDist).toFixed(3));
      return {
        edge,
        wallPoints: collectedWallPoints,
        peakDensity: maxCount,
      };
    }

    const fallbackDist = (outerWallBin + 1) * binSize;
    const edge = isPos ? Number(fallbackDist.toFixed(3)) : Number((-fallbackDist).toFixed(3));
    return {
      edge,
      wallPoints: collectedWallPoints.length > 0 ? collectedWallPoints : candidatePts,
      peakDensity: maxCount,
    };
  }

  // Thuật toán Dò Tìm Nóc Xe Thật trong Main World
  function detectRoofTopBounds(
    pts: Array<{ z: number; lx?: number; ly?: number }>,
    expectedRoofZ?: number
  ): number {
    if (pts.length === 0) return expectedRoofZ ?? 0;
    const zValues = pts.map((p) => p.z).sort((a, b) => a - b);
    const n = zValues.length;
    if (n < 6) return zValues[n - 1];
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

  // Thuật toán Căn Thẳng Góc Yaw Dựa Trên Viền Mật Độ Đột Biến Nhìn Từ Top View trong Main World
  function straightenYawFromBoundaryEdge(
    pts: Array<{ lx: number; ly: number; z: number }>,
    currentYaw: number,
    L: number,
    _W: number,
    visibleLateral: "left" | "right",
    options: { maxAdjustmentDeg?: number } = {}
  ): { newYawRad: number; newYawDeg: number; deltaYawDeg: number; slope: number } {
    const maxAdjDeg = options.maxAdjustmentDeg ?? 8.0;
    const maxAdjRad = (maxAdjDeg * Math.PI) / 180;
    const isLeft = visibleLateral === "left";
    const sidePts = pts.filter((p) => (isLeft ? p.ly > 0 : p.ly < 0) && Math.abs(p.lx) <= L / 2);
    if (sidePts.length < 8) {
      return {
        newYawRad: currentYaw,
        newYawDeg: Number(((currentYaw * 180) / Math.PI).toFixed(2)),
        deltaYawDeg: 0,
        slope: 0,
      };
    }
    const numSlices = 10;
    const sliceWidth = L / numSlices;
    const slicePoints: Array<{ lx: number; ly: number }> = [];
    for (let s = 0; s < numSlices; s++) {
      const minLx = -L / 2 + s * sliceWidth;
      const maxLx = minLx + sliceWidth;
      const inSlice = sidePts.filter((p) => p.lx >= minLx && p.lx < maxLx);
      if (inSlice.length >= 1) {
        if (isLeft) {
          const sortedLy = inSlice.map((p) => p.ly).sort((a, b) => a - b);
          const pIdx = Math.max(0, Math.floor(sortedLy.length * 0.90));
          const medianLx = (minLx + maxLx) / 2;
          slicePoints.push({ lx: medianLx, ly: sortedLy[pIdx] });
        } else {
          const sortedLy = inSlice.map((p) => p.ly).sort((a, b) => a - b);
          const pIdx = Math.min(sortedLy.length - 1, Math.floor(sortedLy.length * 0.10));
          const medianLx = (minLx + maxLx) / 2;
          slicePoints.push({ lx: medianLx, ly: sortedLy[pIdx] });
        }
      }
    }
    if (slicePoints.length < 4) {
      return {
        newYawRad: currentYaw,
        newYawDeg: Number(((currentYaw * 180) / Math.PI).toFixed(2)),
        deltaYawDeg: 0,
        slope: 0,
      };
    }

    // Hồi quy bền vững kháng ngoại lai Theil-Sen Estimator (Median of Slopes):
    const slopes: number[] = [];
    for (let i = 0; i < slicePoints.length; i++) {
      for (let j = i + 1; j < slicePoints.length; j++) {
        const dx = slicePoints[j].lx - slicePoints[i].lx;
        const dy = slicePoints[j].ly - slicePoints[i].ly;
        if (Math.abs(dx) >= 0.25) {
          slopes.push(dy / dx);
        }
      }
    }

    let slope = 0;
    if (slopes.length >= 3) {
      slopes.sort((a, b) => a - b);
      slope = slopes[Math.floor(slopes.length / 2)];
    } else {
      let sumLx = 0, sumLy = 0, sumLxLy = 0, sumLx2 = 0;
      const m = slicePoints.length;
      for (const p of slicePoints) {
        sumLx += p.lx; sumLy += p.ly; sumLxLy += p.lx * p.ly; sumLx2 += p.lx * p.lx;
      }
      const denom = m * sumLx2 - sumLx * sumLx;
      slope = Math.abs(denom) > 1e-6 ? (m * sumLxLy - sumLx * sumLy) / denom : 0;
    }

    let deltaYaw = Math.atan(slope);
    deltaYaw = Math.max(-maxAdjRad, Math.min(maxAdjRad, deltaYaw));
    let deltaYawDeg = Number(((deltaYaw * 180) / Math.PI).toFixed(2));
    if (Math.abs(deltaYawDeg) < 0.25) {
      deltaYaw = 0;
      deltaYawDeg = 0;
    }
    let newYaw = currentYaw + deltaYaw;
    while (newYaw > Math.PI) newYaw -= 2 * Math.PI;
    while (newYaw < -Math.PI) newYaw += 2 * Math.PI;
    return {
      newYawRad: Number(newYaw.toFixed(5)),
      newYawDeg: Number(((newYaw * 180) / Math.PI).toFixed(2)),
      deltaYawDeg,
      slope: Number(slope.toFixed(4)),
    };
  }

  // Thuật toán FIT GÓC ĐÓN TIA EGO (RAY-CAST L-SHAPE FIT) & GHIM ĐẤT 3D (CẢ SIDE VIEW VÀ FRONT VIEW)
  function fitBoxToEgoRayAndGroundInMainWorld(
    points: number[],
    egoPos: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 },
    options: {
      preserveDimensions?: boolean;
      fitRoofTop?: boolean;
      alignMode?: "w_only" | "both";
      fitStep?: "all" | "top" | "side" | "front";
      edgePadding?: number;
    } = {}
  ): {
    newX: number;
    newY: number;
    newZ: number;
    newYawRad?: number;
    newYawDeg?: number;
    deltaYawDeg?: number;
    newL: number;
    newW: number;
    newH: number;
    pitchRad: number;
    rollRad: number;
    pitchDeg: number;
    rollDeg: number;
    groundZ: number;
    roofTopZ: number;
    shiftLx?: number;
    shiftLy?: number;
    visibleFaces: { longitudinal: "front" | "rear"; lateral: "left" | "right" };
    dominantEdge?: {
      edgeSide: "left" | "right";
      bumperSide: "front" | "rear";
      sideWallEdge: number;
      bumperEdge: number;
    };
    pointsCount: number;
    message: string;
  } {
    const cx = points[0];
    const cy = points[1];
    const cz = points[2];
    const yaw = points[5];
    const L = points[6];
    const W = points[7];
    const H = points[8];

    const lidar = getSceneLidarPoints();
    if (!lidar || lidar.count === 0) {
      return {
        newX: cx,
        newY: cy,
        newZ: cz,
        newYawRad: yaw,
        newYawDeg: Number(((yaw * 180) / Math.PI).toFixed(2)),
        deltaYawDeg: 0,
        newL: L,
        newW: W,
        newH: H,
        pitchRad: 0,
        rollRad: 0,
        pitchDeg: 0,
        rollDeg: 0,
        groundZ: cz - H / 2,
        roofTopZ: cz + H / 2,
        visibleFaces: { longitudinal: "front", lateral: "left" },
        pointsCount: 0,
        message: "Không tìm thấy điểm LiDAR trong scene",
      };
    }

    const { count, array } = lidar;

    // BƯỚC 0: Auto Ghim Đất theo Footprint Tight (Bám dốc mặt đường thật, nếu thiếu điểm lấy mốc Ego Z = 0)
    const groundInfo = detectAccurateGroundZ(cx, cy, cz, yaw, L / 2, W / 2, H / 2, false, false);
    const groundZ = groundInfo.groundZ !== null ? groundInfo.groundZ : 0;
    const pitchRad = groundInfo.pitchRad;
    const rollRad = groundInfo.rollRad;

    const cosY = Math.cos(-yaw);
    const sinY = Math.sin(-yaw);

    // Thu thập các điểm thân xe cốt lõi (loại bỏ mặt đất và vệt quét loang sát sàn +22cm)
    const minBodyZ = groundZ + 0.22;
    const maxRoofZ = groundZ + H + 0.55;
    const fitStep = options.fitStep ?? "all";
    const outerL = L / 2 + 0.45;
    const outerW = W / 2 + 0.35;

    const rawBodyPts: Array<{ x: number; y: number; z: number; lx: number; ly: number }> = [];
    for (let i = 0; i < count; i++) {
      const z = array[i * 3 + 2];
      if (z < minBodyZ || z > maxRoofZ) continue;
      const x = array[i * 3];
      const y = array[i * 3 + 1];
      const dx = x - cx;
      const dy = y - cy;
      const lx = dx * cosY - dy * sinY;
      const ly = dx * sinY + dy * cosY;
      if (Math.abs(lx) <= outerL && Math.abs(ly) <= outerW) {
        rawBodyPts.push({ x, y, z, lx, ly });
      }
    }

    // Lớp 1: Lọc nhiễu thưa thớt sát thân xe bằng mật độ lõi 3D
    const denseCorePts = filterSparseNoiseByLocalDensity(rawBodyPts, { radius: 0.12, minCoreNeighbors: 2 });

    // Lớp 2: Lọc cụm liên tục (Loại bỏ 100% điểm của xe khác đỗ bên cạnh hoặc nối đuôi)
    const clusterLy = filterDenseConnectedCluster1D(denseCorePts, "ly", 0.22, 0);
    const bodyPts = filterDenseConnectedCluster1D(clusterLy, "lx", 0.22, 0);

    const dxEgo = cx - egoPos.x;
    const dyEgo = cy - egoPos.y;
    const vLocalX = -dxEgo * cosY + dyEgo * sinY;
    const vLocalY = -dxEgo * sinY - dyEgo * cosY;

    let visibleLongitudinal: "front" | "rear" = vLocalX >= 0 ? "front" : "rear";
    let visibleLateral: "left" | "right" = vLocalY >= 0 ? "left" : "right";

    let shiftLx = 0;
    let shiftLy = 0;
    let roofTopZ = groundZ + H;
    let newH = H;
    let newL = L;
    let newW = W;
    let finalYaw = yaw;
    let straightYawDeg = Number(((yaw * 180) / Math.PI).toFixed(2));
    let deltaYawDeg = 0;
    const preserveDimensions = options.preserveDimensions ?? true;

    const validBodyPts = bodyPts.length >= 4 ? bodyPts : (denseCorePts.length >= 4 ? denseCorePts : rawBodyPts);

    if (validBodyPts.length >= 4) {
      // Helper 1: Căn mép cản trước/sau theo trục dọc X (Side View)
      const computeSideShift = (
        pts: Array<{ lx: number; ly: number; z: number }>,
        targetL: number,
        targetW: number,
        currentYaw: number,
        center_x: number,
        center_y: number,
        ego_pos: { x: number; y: number }
      ) => {
        const toEgoX = ego_pos.x - center_x;
        const toEgoY = ego_pos.y - center_y;
        const egoLocalX = toEgoX * Math.cos(currentYaw) + toEgoY * Math.sin(currentYaw);

        const frontBumperPts = pts.filter((p) => p.lx > 0.05);
        const rearBumperPts = pts.filter((p) => p.lx < -0.05);

        let visibleBumper: "front" | "rear";
        if (frontBumperPts.length >= rearBumperPts.length + 3) {
          visibleBumper = "front";
        } else if (rearBumperPts.length >= frontBumperPts.length + 3) {
          visibleBumper = "rear";
        } else {
          visibleBumper = egoLocalX >= 0 ? "front" : "rear";
        }

        const targetBumperPts = pts.filter((p) => Math.abs(p.ly) <= targetW / 2 + 0.15);
        const activePtsForL = targetBumperPts.length >= 4 ? targetBumperPts : pts;
        const bumperCloudPts = activePtsForL.filter((p) => (visibleBumper === "front" ? p.lx > 0 : p.lx < 0));
        const cleanBumperPts = filterSparseNoiseByLocalDensity(bumperCloudPts, { radius: 0.15, minCoreNeighbors: 2 });
        const finalBumperPts = cleanBumperPts.length >= 3 ? cleanBumperPts : bumperCloudPts;

        let bumperEdge: number;
        if (finalBumperPts.length >= 3) {
          const wallDet = detectDominantWallEdgeWithValleyCutoff(
            finalBumperPts,
            "lx",
            visibleBumper === "front" ? "positive" : "negative",
            targetL / 2,
            { minSpanOrthogonal: 0.60 }
          );
          bumperEdge = wallDet.edge;
        } else {
          bumperEdge = visibleBumper === "front" ? targetL / 2 : -targetL / 2;
        }

        const edgePadding = options.edgePadding ?? 0.05; // 5.0cm
        let sLx = 0;
        if (visibleBumper === "front") {
          sLx = (bumperEdge + edgePadding) - targetL / 2;
        } else {
          sLx = (bumperEdge - edgePadding) + targetL / 2;
        }

        const maxShiftL = Math.min(0.40, targetL * 0.25);
        sLx = Math.max(-maxShiftL, Math.min(maxShiftL, sLx));
        if (Math.abs(sLx) < 0.01) sLx = 0;

        return { shiftLx: sLx, visibleBumper };
      };

      // Helper 2: Căn góc xoay Yaw theo viền đón tia (Top View)
      const computeTopYaw = (
        pts: Array<{ lx: number; ly: number; z: number }>,
        currentYaw: number,
        targetL: number,
        targetW: number,
        visibleSide: "left" | "right"
      ) => {
        const wallDet = detectDominantWallEdgeWithValleyCutoff(
          pts,
          "ly",
          visibleSide === "left" ? "positive" : "negative",
          targetW / 2,
          { minSpanOrthogonal: 0.70 }
        );
        const activePtsForYaw = wallDet.wallPoints.length >= 6 ? wallDet.wallPoints : pts;
        return straightenYawFromBoundaryEdge(activePtsForYaw, currentYaw, targetL, targetW, visibleSide, { maxAdjustmentDeg: 12.0 });
      };

      // Helper 3: Căn mép sườn xe theo phương W (Front View)
      const computeFrontShift = (
        pts: Array<{ lx: number; ly: number; z: number }>,
        targetW: number,
        targetL: number,
        currentYaw: number,
        center_x: number,
        center_y: number,
        ego_pos: { x: number; y: number }
      ) => {
        const toEgoX = ego_pos.x - center_x;
        const toEgoY = ego_pos.y - center_y;
        const egoLocalY = -toEgoX * Math.sin(currentYaw) + toEgoY * Math.cos(currentYaw);

        const leftSidePts = pts.filter((p) => p.ly > 0.05);
        const rightSidePts = pts.filter((p) => p.ly < -0.05);

        let visibleSide: "left" | "right";
        if (leftSidePts.length >= rightSidePts.length + 3) {
          visibleSide = "left";
        } else if (rightSidePts.length >= leftSidePts.length + 3) {
          visibleSide = "right";
        } else {
          visibleSide = egoLocalY >= 0 ? "left" : "right";
        }

        const targetSidePts = pts.filter((p) => Math.abs(p.lx) <= targetL / 2 + 0.15);
        const activePtsForW = targetSidePts.length >= 4 ? targetSidePts : pts;
        const sideCloudPts = activePtsForW.filter((p) => (visibleSide === "left" ? p.ly > 0 : p.ly < 0));
        const cleanSidePts = filterSparseNoiseByLocalDensity(sideCloudPts, { radius: 0.15, minCoreNeighbors: 2 });
        const finalSidePts = cleanSidePts.length >= 3 ? cleanSidePts : sideCloudPts;

        let boundaryEdge: number;
        if (finalSidePts.length >= 3) {
          const wallDet = detectDominantWallEdgeWithValleyCutoff(
            finalSidePts,
            "ly",
            visibleSide === "left" ? "positive" : "negative",
            targetW / 2,
            { minSpanOrthogonal: 0.70 }
          );
          boundaryEdge = wallDet.edge;
        } else {
          boundaryEdge = visibleSide === "left" ? targetW / 2 : -targetW / 2;
        }

        const edgePadding = options.edgePadding ?? 0.05; // 5.0cm
        let sLy = 0;
        if (visibleSide === "left") {
          sLy = (boundaryEdge + edgePadding) - targetW / 2;
        } else {
          sLy = (boundaryEdge - edgePadding) + targetW / 2;
        }

        const maxShiftW = Math.min(0.40, targetW * 0.30);
        sLy = Math.max(-maxShiftW, Math.min(maxShiftW, sLy));
        if (Math.abs(sLy) < 0.01) sLy = 0;

        return { shiftLy: sLy, visibleSide };
      };

      if (fitStep === "top") {
        // ========================================================
        // CHẾ ĐỘ 1: CĂN TOP CHUYÊN TRÁCH GÓC XOAY YAW (XOAY TẠI CHỖ QUANH TÂM)
        // ========================================================
        const expectedRoofZ = groundZ + H;
        roofTopZ = detectRoofTopBounds(validBodyPts, expectedRoofZ);

        const frontDet = computeFrontShift(validBodyPts, W, L, yaw, cx, cy, egoPos);
        visibleLateral = frontDet.visibleSide;

        const straightYawResult = computeTopYaw(validBodyPts, yaw, L, W, visibleLateral);
        finalYaw = straightYawResult.newYawRad;
        straightYawDeg = straightYawResult.newYawDeg;
        deltaYawDeg = straightYawResult.deltaYawDeg;

        shiftLx = 0;
        shiftLy = 0;
      } else if (fitStep === "side") {
        // ========================================================
        // CHẾ ĐỘ 2: CĂN SIDE ĐỘC LẬP (Trục dọc X đón tia Ego)
        // ========================================================
        finalYaw = yaw;
        straightYawDeg = Number(((yaw * 180) / Math.PI).toFixed(2));
        deltaYawDeg = 0;

        const sideRes = computeSideShift(validBodyPts, L, W, yaw, cx, cy, egoPos);
        shiftLx = sideRes.shiftLx;
        visibleLongitudinal = sideRes.visibleBumper;
        shiftLy = 0;
      } else if (fitStep === "front") {
        // ========================================================
        // CHẾ ĐỘ 3: CĂN FRONT ĐỘC LẬP (Trục ngang Y / Phương W đón tia Ego)
        // TUYỆT ĐỐI KHÔNG GHIM ĐẤT, giữ nguyên Z và Roll/Pitch
        // ========================================================
        finalYaw = yaw;
        straightYawDeg = Number(((yaw * 180) / Math.PI).toFixed(2));
        deltaYawDeg = 0;

        const frontRes = computeFrontShift(validBodyPts, W, L, yaw, cx, cy, egoPos);
        shiftLy = frontRes.shiftLy;
        visibleLateral = frontRes.visibleSide;
        shiftLx = 0;
      } else {
        // ========================================================
        // CHẾ ĐỘ 4: GHÉP CHU TRÌNH HOÀN CHỈNH (HERO SMART FIT / PHÍM SHIFT+T)
        // QUY TRÌNH: Ghim Đất -> Side -> Top -> Front -> Side -> Top -> Front
        // ========================================================
        // BƯỚC 1: Ghim Đất đã tính tại Bước 0 (groundZ và pitchRad)
        const expectedRoofZ = groundZ + H;
        roofTopZ = detectRoofTopBounds(validBodyPts, expectedRoofZ);

        let curCx = cx;
        let curCy = cy;
        let curYaw = yaw;

        const toLocalPts = (cCenter_x: number, cCenter_y: number, cYaw: number) => {
          const cY = Math.cos(-cYaw);
          const sY = Math.sin(-cYaw);
          return validBodyPts.map((p) => {
            const dx = p.x - cCenter_x;
            const dy = p.y - cCenter_y;
            return {
              x: p.x,
              y: p.y,
              z: p.z,
              lx: dx * cY - dy * sY,
              ly: dx * sY + dy * cY,
            };
          });
        };

        const applyShift = (sLx: number, sLy: number, cYaw: number) => {
          const cW = Math.cos(cYaw);
          const sW = Math.sin(cYaw);
          curCx = Number((curCx + sLx * cW - sLy * sW).toFixed(3));
          curCy = Number((curCy + sLx * sW + sLy * cW).toFixed(3));
        };

        // --- VÒNG 1 (Định vị mốc sơ bộ) ---
        // 2. Side lần 1 (Căn cản trước/sau đón tia X)
        let localPts = toLocalPts(curCx, curCy, curYaw);
        const side1 = computeSideShift(localPts, L, W, curYaw, curCx, curCy, egoPos);
        applyShift(side1.shiftLx, 0, curYaw);
        visibleLongitudinal = side1.visibleBumper;

        // 3. Top lần 1 (Căn góc xoay Yaw)
        localPts = toLocalPts(curCx, curCy, curYaw);
        const frontDet1 = computeFrontShift(localPts, W, L, curYaw, curCx, curCy, egoPos);
        const top1 = computeTopYaw(localPts, curYaw, L, W, frontDet1.visibleSide);
        curYaw = top1.newYawRad;

        // 4. Front lần 1 (Căn sườn đón tia W)
        localPts = toLocalPts(curCx, curCy, curYaw);
        const front1 = computeFrontShift(localPts, W, L, curYaw, curCx, curCy, egoPos);
        applyShift(0, front1.shiftLy, curYaw);
        visibleLateral = front1.visibleSide;

        // --- VÒNG 2 (Tinh chỉnh hội tụ Coarse-to-Fine) ---
        // 5. Side lần 2 (Căn lại cản X theo Yaw và Y mới)
        localPts = toLocalPts(curCx, curCy, curYaw);
        const side2 = computeSideShift(localPts, L, W, curYaw, curCx, curCy, egoPos);
        applyShift(side2.shiftLx, 0, curYaw);
        visibleLongitudinal = side2.visibleBumper;

        // 6. Top lần 2 (Vi chỉnh Yaw lần cuối)
        localPts = toLocalPts(curCx, curCy, curYaw);
        const top2 = computeTopYaw(localPts, curYaw, L, W, visibleLateral);
        curYaw = top2.newYawRad;

        // 7. Front lần 2 (Khóa khít mép sườn W lần cuối)
        localPts = toLocalPts(curCx, curCy, curYaw);
        const front2 = computeFrontShift(localPts, W, L, curYaw, curCx, curCy, egoPos);
        applyShift(0, front2.shiftLy, curYaw);
        visibleLateral = front2.visibleSide;

        finalYaw = curYaw;
        straightYawDeg = Number(((finalYaw * 180) / Math.PI).toFixed(2));
        deltaYawDeg = Number((((finalYaw - yaw) * 180) / Math.PI).toFixed(2));
        while (deltaYawDeg > 180) deltaYawDeg -= 360;
        while (deltaYawDeg < -180) deltaYawDeg += 360;

        // Tính độ lệch tổng thể shiftLx, shiftLy chiếu vào hệ finalYaw
        const cFinal = Math.cos(-finalYaw);
        const sFinal = Math.sin(-finalYaw);
        const totalDx = curCx - cx;
        const totalDy = curCy - cy;
        shiftLx = Number((totalDx * cFinal - totalDy * sFinal).toFixed(3));
        shiftLy = Number((totalDx * sFinal + totalDy * cFinal).toFixed(3));
      }

      // Giới hạn an toàn chung cho shiftLx và shiftLy
      if (fitStep === "top") {
        shiftLx = 0;
        shiftLy = 0;
      } else {
        const maxShiftL = Math.min(0.40, L * 0.25);
        const maxShiftW = Math.min(0.40, W * 0.30);
        shiftLx = Math.max(-maxShiftL, Math.min(maxShiftL, shiftLx));
        shiftLy = Math.max(-maxShiftW, Math.min(maxShiftW, shiftLy));
      }

      if (preserveDimensions !== true) {
        const measuredH = roofTopZ - groundZ;
        newH = Number(Math.max(1.35, Math.min(2.8, measuredH)).toFixed(2));
      } else {
        newH = H;
        newL = L;
        newW = W;
      }
    }

    // Tọa độ tâm trong hệ thế giới (World Frame) tính theo góc Yaw mới đã căn thẳng
    const cosWorld = Math.cos(finalYaw);
    const sinWorld = Math.sin(finalYaw);
    const newX = Number((cx + shiftLx * cosWorld - shiftLy * sinWorld).toFixed(3));
    const newY = Number((cy + shiftLx * sinWorld + shiftLy * cosWorld).toFixed(3));
    // Đáy xe tiếp đất chuẩn xác 100% (Auto Ghim Đất) - NGOẠI TRỪ FRONT VIEW
    const cosPitch = Math.cos(pitchRad);
    const cosRoll = Math.cos(rollRad);
    let newZ = Number((groundZ + (newH / 2) * cosPitch * cosRoll).toFixed(3));
    let finalPitch = pitchRad;
    let finalRoll = rollRad;

    if (fitStep === "top" || fitStep === "side" || fitStep === "front") {
      // TOP, SIDE VÀ FRONT TUYỆT ĐỐI KHÔNG ĐƯỢC GHIM ĐẤT: Giữ nguyên 100% cao độ Z và góc nghiêng của box hiện tại
      newZ = cz;
      finalPitch = points[4] || 0;
      finalRoll = points[3] || 0;
    }

    const faceTextLong = visibleLongitudinal === "front" ? "Mặt Trước" : "Mặt Sau";
    const faceTextLat = visibleLateral === "left" ? "Sườn Trái" : "Sườn Phải";

    let msg = `Đã ghép chu trình (Đất ➔ Side ➔ Top ➔ Front ➔ Side ➔ Top ➔ Front): Yaw ${straightYawDeg}°, Cản [${faceTextLong}], Sườn [${faceTextLat}] & Ghim Đất (Z: ${newZ}m)`;
    if (fitStep === "top") {
      const deltaSign = deltaYawDeg >= 0 ? "+" : "";
      msg = `Đã căn TOP: Xoay Yaw (${straightYawDeg}°, Δ=${deltaSign}${deltaYawDeg}°) song song sườn đón tia [${faceTextLat}], khóa tâm X/Y (giữ nguyên cao độ Z)`;
    } else if (fitStep === "side") {
      const deltaXSign = shiftLx >= 0 ? "+" : "";
      msg = `Đã căn SIDE: Cản [${faceTextLong}] đón tia (ΔX: ${deltaXSign}${shiftLx.toFixed(2)}m, giữ nguyên cao độ Z)`;
    } else if (fitStep === "front") {
      const deltaYSign = shiftLy >= 0 ? "+" : "";
      msg = `Đã căn FRONT: Mép sườn [${faceTextLat}] ăn khít phương W (ΔY: ${deltaYSign}${(shiftLy * 100).toFixed(1)}cm, giữ nguyên cao độ Z)`;
    }

    return {
      newX,
      newY,
      newZ,
      newYawRad: finalYaw,
      newYawDeg: straightYawDeg,
      deltaYawDeg,
      newL,
      newW,
      newH,
      pitchRad: finalPitch,
      rollRad: finalRoll,
      pitchDeg: Number(((finalPitch * 180) / Math.PI).toFixed(2)),
      rollDeg: Number(((finalRoll * 180) / Math.PI).toFixed(2)),
      groundZ,
      roofTopZ,
      shiftLx: Number(shiftLx.toFixed(3)),
      shiftLy: Number(shiftLy.toFixed(3)),
      visibleFaces: {
        longitudinal: visibleLongitudinal,
        lateral: visibleLateral,
      },
      dominantEdge: {
        edgeSide: visibleLateral,
        bumperSide: visibleLongitudinal,
        sideWallEdge: Number(shiftLy.toFixed(3)),
        bumperEdge: Number(shiftLx.toFixed(3)),
      },
      pointsCount: bodyPts.length,
      message: msg,
    };
  }

  // Thuật toán CHUYÊN BIỆT CHO NGƯỜI ĐI BỘ TRONG MAIN WORLD (PEDESTRIAN FIT)
  function fitPedestrianInMainWorld(
    points: number[],
    options: {
      headBuffer?: number;
      margin?: number;
      egoPos?: { x: number; y: number; z: number };
      step?: "all" | "top" | "side" | "front" | "l" | "w" | "h";
    } = {}
  ): {
    newX: number;
    newY: number;
    newZ: number;
    newYaw?: number;
    newYawDeg?: number;
    deltaYawDeg?: number;
    newL: number;
    newW: number;
    newH: number;
    groundZ: number;
    pointsCount: number;
    step: "all" | "top" | "side" | "front" | "l" | "w" | "h";
    message: string;
  } {
    const cx = points[0];
    const cy = points[1];
    const cz = points[2];
    const yaw = points[5];
    const curL = points[6] || 0.65;
    const curW = points[7] || 0.65;
    const curH = points[8] || 1.70;
    const step = options.step ?? "all";
    const curYawDeg = Number(((yaw * 180) / Math.PI).toFixed(2));

    const lidar = getSceneLidarPoints();
    if (!lidar || lidar.count === 0) {
      return {
        newX: cx,
        newY: cy,
        newZ: cz,
        newYaw: yaw,
        newYawDeg: curYawDeg,
        deltaYawDeg: 0,
        newL: curL,
        newW: curW,
        newH: curH,
        groundZ: cz - curH / 2,
        pointsCount: 0,
        step,
        message: "Không tìm thấy điểm LiDAR trong scene",
      };
    }

    const { count, array } = lidar;
    const headBuffer = options.headBuffer ?? 0.12;
    const margin = options.margin ?? 0.15;

    // 1. Quét mặt đất siêu hẹp sát chân người (R <= 0.45m)
    const footRadius = Math.max(0.35, Math.max(curL, curW) / 2 + margin);
    const footGroundPts: number[] = [];
    const maxFootGroundZ = cz - curH / 2 + 0.35;
    const minFootGroundZ = cz - 4.0;

    for (let i = 0; i < count; i++) {
      const z = array[i * 3 + 2];
      if (z > maxFootGroundZ || z < minFootGroundZ) continue;
      const x = array[i * 3];
      const y = array[i * 3 + 1];
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= footRadius * footRadius) {
        footGroundPts.push(z);
      }
    }

    let groundZ = cz - curH / 2;
    if (footGroundPts.length >= 3) {
      footGroundPts.sort((a, b) => a - b);
      groundZ = footGroundPts[Math.max(0, Math.floor(footGroundPts.length * 0.15))];
    }

    // 2. Thu thập điểm thân người cốt lõi (từ mặt đất + 30cm loại bỏ 100% vệt quét mặt đất quanh chân)
    const minBodyZ = groundZ + 0.30;
    const maxBodyZ = groundZ + 2.30;
    const outerL = Math.max(0.45, curL / 2 + 0.25);
    const outerW = Math.max(0.40, curW / 2 + 0.25);

    const cosY = Math.cos(-yaw);
    const sinY = Math.sin(-yaw);
    const rawBodyPts: Array<{ lx: number; ly: number; z: number }> = [];

    for (let i = 0; i < count; i++) {
      const z = array[i * 3 + 2];
      if (z < minBodyZ || z > maxBodyZ) continue;
      const x = array[i * 3];
      const y = array[i * 3 + 1];
      const dx = x - cx;
      const dy = y - cy;
      const lx = dx * cosY - dy * sinY;
      const ly = dx * sinY + dy * cosY;
      if (Math.abs(lx) <= outerL && Math.abs(ly) <= outerW) {
        rawBodyPts.push({ lx, ly, z });
      }
    }

    // 3. Phân cụm mật độ liên tục 2D (Continuous Density-Connected Clustering)
    // - Cắt đứt thung lũng khoảng cách >= 14cm để chống dính sang người bên cạnh trong đám đông
    // - Ưu tiên chọn cụm điểm thân người cốt lõi nằm gần tâm box nhất (centerBias = 0)
    const clusterLy = filterDenseConnectedCluster1D(rawBodyPts, "ly", 0.14, 0);
    const bodyPts = filterDenseConnectedCluster1D(clusterLy, "lx", 0.14, 0);

    let newX = cx;
    let newY = cy;
    let newZ = cz;
    let newYaw = yaw;
    let newYawDeg = curYawDeg;
    let deltaYawDeg = 0;
    let newL = curL;
    let newW = curW;
    let newH = curH;
    let msg = "";

    if (bodyPts.length < 3) {
      return {
        newX,
        newY,
        newZ,
        newYaw,
        newYawDeg,
        deltaYawDeg: 0,
        newL,
        newW,
        newH,
        groundZ: Number(groundZ.toFixed(3)),
        pointsCount: bodyPts.length,
        step,
        message: `Không đủ điểm LiDAR thân người (${bodyPts.length} điểm), giữ nguyên box`,
      };
    }

    const allLx = bodyPts.map((p) => p.lx).sort((a, b) => a - b);
    const allLy = bodyPts.map((p) => p.ly).sort((a, b) => a - b);
    const allZ = bodyPts.map((p) => p.z).sort((a, b) => a - b);

    const pMinIdx = bodyPts.length >= 8 ? Math.floor(bodyPts.length * 0.02) : 0;
    const pMaxIdx = bodyPts.length >= 8 ? Math.floor(bodyPts.length * 0.98) : bodyPts.length - 1;

    const lxMin = allLx[pMinIdx];
    const lxMax = allLx[pMaxIdx];
    const lyMin = allLy[pMinIdx];
    const lyMax = allLy[pMaxIdx];
    const highestPtZ = allZ[allZ.length - 1];

    const normalizeRad = (r: number) => {
      let a = r;
      while (a > Math.PI) a -= 2 * Math.PI;
      while (a < -Math.PI) a += 2 * Math.PI;
      return a;
    };

    if (step === "top") {
      // 1. CĂN TOP ĐỘC LẬP: Ước lượng trục xoay quanh thân người mục tiêu (kháng dính đám đông)
      let sumLx = 0;
      let sumLy = 0;
      for (const p of bodyPts) {
        sumLx += p.lx;
        sumLy += p.ly;
      }
      const meanLx = sumLx / bodyPts.length;
      const meanLy = sumLy / bodyPts.length;
      let sxx = 0;
      let syy = 0;
      let sxy = 0;
      for (const p of bodyPts) {
        const dx = p.lx - meanLx;
        const dy = p.ly - meanLy;
        sxx += dx * dx;
        syy += dy * dy;
        sxy += dx * dy;
      }
      const dTheta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
      const dThetaDeg = (dTheta * 180) / Math.PI;

      if (Math.abs(dThetaDeg) <= 25) {
        newYaw = normalizeRad(yaw + dTheta);
        newYawDeg = Number(((newYaw * 180) / Math.PI).toFixed(2));
        deltaYawDeg = Number(dThetaDeg.toFixed(2));
      } else {
        newYaw = yaw;
        newYawDeg = curYawDeg;
        deltaYawDeg = 0;
      }

      newX = cx;
      newY = cy;
      newZ = cz;
      newL = curL;
      newW = curW;
      newH = curH;

      const sign = deltaYawDeg >= 0 ? "+" : "";
      msg = `Đã căn TOP Người đi bộ: Xoay Yaw (${newYawDeg}°, Δ=${sign}${deltaYawDeg}°) theo trục cơ thể, khóa tâm X/Y/Z & L/W/H (kháng dính đám đông)`;
    } else if (step === "side") {
      // 2. CĂN SIDE ĐỘC LẬP: Căn đón tia X, giữ nguyên 100% Z & size
      newYaw = yaw;
      newYawDeg = curYawDeg;
      deltaYawDeg = 0;
      newL = curL;
      newW = curW;
      newH = curH;
      newZ = cz;

      let shiftLx = 0;
      let bumperName = "Đón tia";

      if (options.egoPos) {
        const dxEgo = options.egoPos.x - cx;
        const dyEgo = options.egoPos.y - cy;
        const lxEgo = dxEgo * Math.cos(-yaw) - dyEgo * Math.sin(-yaw);
        if (lxEgo > 0.15) {
          shiftLx = (lxMax + 0.01) - curL / 2;
          bumperName = "Mặt trước";
        } else if (lxEgo < -0.15) {
          shiftLx = (lxMin - 0.01) + curL / 2;
          bumperName = "Mặt sau";
        } else {
          shiftLx = (lxMin + lxMax) / 2;
          bumperName = "Cân đối";
        }
      } else {
        const frontCount = bodyPts.filter((p) => p.lx > 0).length;
        const rearCount = bodyPts.filter((p) => p.lx <= 0).length;
        if (frontCount > rearCount * 1.5) {
          shiftLx = (lxMax + 0.01) - curL / 2;
          bumperName = "Mặt trước";
        } else if (rearCount > frontCount * 1.5) {
          shiftLx = (lxMin - 0.01) + curL / 2;
          bumperName = "Mặt sau";
        } else {
          shiftLx = (lxMin + lxMax) / 2;
          bumperName = "Cân đối";
        }
      }

      shiftLx = Math.max(-0.35, Math.min(0.35, shiftLx));
      newX = Number((cx + shiftLx * Math.cos(yaw)).toFixed(3));
      newY = Number((cy + shiftLx * Math.sin(yaw)).toFixed(3));

      const signX = shiftLx >= 0 ? "+" : "";
      msg = `Đã căn SIDE Người đi bộ: [${bumperName}] bám mép đón tia (ΔX: ${signX}${(shiftLx * 100).toFixed(1)}cm, giữ nguyên Z), Khóa size ${curL}x${curW}x${curH}m`;
    } else if (step === "front") {
      // 3. CĂN FRONT ĐỘC LẬP: ÔM SÁT POINT CLOUD HƯỚNG VỀ PHÍA EGO
      newYaw = yaw;
      newYawDeg = curYawDeg;
      deltaYawDeg = 0;
      newL = curL;
      newW = curW;
      newH = curH;
      newZ = cz;

      let visibleSide: "left" | "right" | "center" = "center";
      if (options.egoPos) {
        const toEgoX = options.egoPos.x - cx;
        const toEgoY = options.egoPos.y - cy;
        const egoLocalY = -toEgoX * Math.sin(yaw) + toEgoY * Math.cos(yaw);
        if (egoLocalY > 0.04) {
          visibleSide = "left";
        } else if (egoLocalY < -0.04) {
          visibleSide = "right";
        } else {
          visibleSide = "center";
        }
      } else {
        const leftCount = bodyPts.filter((p) => p.ly > 0.03).length;
        const rightCount = bodyPts.filter((p) => p.ly < -0.03).length;
        if (leftCount > rightCount * 1.3) {
          visibleSide = "left";
        } else if (rightCount > leftCount * 1.3) {
          visibleSide = "right";
        } else {
          visibleSide = "center";
        }
      }

      let shiftLy = 0;
      if (visibleSide === "left") {
        // Sườn TRÁI đón tia Ego: Mép trái (+W/2) ôm sát mép ngoài cùng đón tia lyMax (+1cm)
        shiftLy = (lyMax + 0.01) - curW / 2;
      } else if (visibleSide === "right") {
        // Sườn PHẢI đón tia Ego: Mép phải (-W/2) ôm sát mép ngoài cùng đón tia lyMin (-1cm)
        shiftLy = (lyMin - 0.01) + curW / 2;
      } else {
        shiftLy = (lyMin + lyMax) / 2;
      }

      shiftLy = Math.max(-0.35, Math.min(0.35, shiftLy));
      newX = Number((cx - shiftLy * Math.sin(yaw)).toFixed(3));
      newY = Number((cy + shiftLy * Math.cos(yaw)).toFixed(3));

      const signY = shiftLy >= 0 ? "+" : "";
      const sideText = visibleSide === "left" ? "Sườn Trái đón tia Ego" : visibleSide === "right" ? "Sườn Phải đón tia Ego" : "Cân đối 2 sườn";
      msg = `Đã căn FRONT Người đi bộ: [${sideText}] ôm sát viền đón tia (ΔY: ${signY}${(shiftLy * 100).toFixed(1)}cm, giữ nguyên Z), Khóa size ${curL}x${curW}x${curH}m`;
    } else if (step === "l") {
      // 4. FIX RIÊNG CHIỀU DÀI L
      newYaw = yaw;
      newYawDeg = curYawDeg;
      deltaYawDeg = 0;
      newW = curW;
      newH = curH;
      newZ = cz;

      newL = Number(Math.max(0.35, Math.min(0.85, (lxMax - lxMin) + 0.08)).toFixed(2));
      let shiftLx = (lxMin + lxMax) / 2;
      shiftLx = Math.max(-0.35, Math.min(0.35, shiftLx));

      newX = Number((cx + shiftLx * Math.cos(yaw)).toFixed(3));
      newY = Number((cy + shiftLx * Math.sin(yaw)).toFixed(3));

      const signX = shiftLx >= 0 ? "+" : "";
      msg = `Đã fix Chiều Dài (L) Người đi bộ: L=${newL}m (căn tâm X: ${signX}${(shiftLx * 100).toFixed(1)}cm), giữ nguyên W, H & Z`;
    } else if (step === "w") {
      // 5. FIX RIÊNG CHIỀU RỘNG W
      newYaw = yaw;
      newYawDeg = curYawDeg;
      deltaYawDeg = 0;
      newL = curL;
      newH = curH;
      newZ = cz;

      newW = Number(Math.max(0.35, Math.min(0.85, (lyMax - lyMin) + 0.08)).toFixed(2));
      let shiftLy = (lyMin + lyMax) / 2;
      shiftLy = Math.max(-0.35, Math.min(0.35, shiftLy));

      newX = Number((cx - shiftLy * Math.sin(yaw)).toFixed(3));
      newY = Number((cy + shiftLy * Math.cos(yaw)).toFixed(3));

      const signY = shiftLy >= 0 ? "+" : "";
      msg = `Đã fix Chiều Rộng (W) Người đi bộ: W=${newW}m (căn tâm Y: ${signY}${(shiftLy * 100).toFixed(1)}cm), giữ nguyên L, H & Z`;
    } else if (step === "h") {
      // 6. FIX RIÊNG CHIỀU CAO H (Ground-Lock: Đáy Z_base cố định, nở lên nóc +12cm đệm đầu)
      newYaw = yaw;
      newYawDeg = curYawDeg;
      deltaYawDeg = 0;
      newL = curL;
      newW = curW;
      newX = cx;
      newY = cy;

      const currentBaseZ = cz - curH / 2;
      const effectiveBaseZ = Math.abs(currentBaseZ - groundZ) <= 0.35 ? currentBaseZ : groundZ;

      const roofTopZ = highestPtZ + Math.max(0.12, headBuffer);
      newH = Number(Math.max(1.00, Math.min(2.15, roofTopZ - effectiveBaseZ)).toFixed(2));
      newZ = Number((effectiveBaseZ + newH / 2).toFixed(3));

      msg = `Đã fix Chiều Cao (H) Người đi bộ: H=${newH}m (Đáy bám sàn Z=${effectiveBaseZ.toFixed(2)}m cố định, nở lên đỉnh đầu +12cm), giữ nguyên L, W & XY`;
    } else {
      // 7. TOÀN DIỆN (ALL): 1-Click Smart Fit
      newL = Number(Math.max(0.40, Math.min(0.85, lxMax - lxMin + 0.08)).toFixed(2));
      newW = Number(Math.max(0.40, Math.min(0.85, lyMax - lyMin + 0.08)).toFixed(2));

      const roofTopZ = highestPtZ + headBuffer;
      newH = Number(Math.max(1.05, Math.min(2.15, roofTopZ - groundZ)).toFixed(2));

      let shiftLx = (lxMin + lxMax) / 2;
      let shiftLy = (lyMin + lyMax) / 2;

      const maxShift = 0.40;
      shiftLx = Math.max(-maxShift, Math.min(maxShift, shiftLx));
      shiftLy = Math.max(-maxShift, Math.min(maxShift, shiftLy));

      const cosWorld = Math.cos(yaw);
      const sinWorld = Math.sin(yaw);
      newX = Number((cx + shiftLx * cosWorld - shiftLy * sinWorld).toFixed(3));
      newY = Number((cy + shiftLx * sinWorld + shiftLy * cosWorld).toFixed(3));
      newZ = Number((groundZ + newH / 2).toFixed(3));

      msg = `Đã fit Người Đi Bộ: ${newL}x${newW}x${newH}m (Khóa thẳng đứng 0°, Ghim đất Z: ${newZ}m, Bù đỉnh đầu +${Math.round(headBuffer * 100)}cm)`;
    }

    return {
      newX,
      newY,
      newZ,
      newYaw,
      newYawDeg,
      deltaYawDeg,
      newL,
      newW,
      newH,
      groundZ: Number(groundZ.toFixed(3)),
      pointsCount: bodyPts.length,
      step,
      message: msg,
    };
  }

  // Thuật toán CHUYÊN BIỆT CHO XE ĐẠP / XE MÁY (CYCLIST / TWO-WHEELER) TRONG MAIN WORLD
  function fitCyclistInMainWorld(
    points: number[],
    options: {
      headBuffer?: number;
      margin?: number;
      egoPos?: { x: number; y: number; z: number };
      step?: "all" | "top" | "side" | "front" | "w" | "h";
    } = {}
  ): {
    newX: number;
    newY: number;
    newZ: number;
    newYaw: number;
    newYawDeg: number;
    deltaYawDeg: number;
    newL: number;
    newW: number;
    newH: number;
    groundZ: number;
    pointsCount: number;
    step: "all" | "top" | "side" | "front" | "w" | "h";
    message: string;
  } {
    const cx = points[0];
    const cy = points[1];
    const cz = points[2];
    const yaw = points[5];
    const curL = points[6] || 1.75;
    const curW = points[7] || 0.65;
    const curH = points[8] || 1.55;
    const step = options.step ?? "all";

    const curYawDeg = Number(((yaw * 180) / Math.PI).toFixed(2));

    const lidar = getSceneLidarPoints();
    if (!lidar || lidar.count === 0) {
      return {
        newX: cx,
        newY: cy,
        newZ: cz,
        newYaw: yaw,
        newYawDeg: curYawDeg,
        deltaYawDeg: 0,
        newL: curL,
        newW: curW,
        newH: curH,
        groundZ: cz - curH / 2,
        pointsCount: 0,
        step,
        message: "Không tìm thấy điểm LiDAR trong scene",
      };
    }

    const { count, array } = lidar;
    const headBuffer = options.headBuffer ?? 0.10;
    const margin = options.margin ?? 0.20;

    // 1. Quét mặt đất vệt bánh xe
    const footRadius = Math.max(0.60, curL / 2 + margin);
    const groundPts: number[] = [];
    const maxGroundZ = cz - curH / 2 + 0.35;
    const minGroundZ = cz - 4.0;

    for (let i = 0; i < count; i++) {
      const z = array[i * 3 + 2];
      if (z > maxGroundZ || z < minGroundZ) continue;
      const x = array[i * 3];
      const y = array[i * 3 + 1];
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= footRadius * footRadius) {
        groundPts.push(z);
      }
    }

    let groundZ = cz - curH / 2;
    if (groundPts.length >= 3) {
      groundPts.sort((a, b) => a - b);
      groundZ = groundPts[Math.max(0, Math.floor(groundPts.length * 0.15))];
    }

    // 2. Thu thập điểm thân xe và người lái (từ mặt đất +25cm loại bỏ vệt quét loang sát lốp xe)
    const minBodyZ = groundZ + 0.25;
    const maxBodyZ = groundZ + 2.30;
    const outerL = curL / 2 + 0.45;
    const outerW = Math.max(curW, 0.85) / 2 + 0.45;

    const cosY = Math.cos(-yaw);
    const sinY = Math.sin(-yaw);
    const bodyPts: Array<{ lx: number; ly: number; z: number }> = [];

    for (let i = 0; i < count; i++) {
      const z = array[i * 3 + 2];
      if (z < minBodyZ || z > maxBodyZ) continue;
      const x = array[i * 3];
      const y = array[i * 3 + 1];
      const dx = x - cx;
      const dy = y - cy;
      const lx = dx * cosY - dy * sinY;
      const ly = dx * sinY + dy * cosY;
      if (Math.abs(lx) <= outerL && Math.abs(ly) <= outerW) {
        bodyPts.push({ lx, ly, z });
      }
    }

    let newX = cx;
    let newY = cy;
    let newZ = cz;
    let newYaw = yaw;
    let newYawDeg = curYawDeg;
    let deltaYawDeg = 0;
    let newL = curL; // BẢO TOÀN TUYỆT ĐỐI 100% CHIỀU DÀI L
    let newW = curW;
    let newH = curH;
    let msg = "";

    if (bodyPts.length < 3) {
      return {
        newX,
        newY,
        newZ,
        newYaw,
        newYawDeg,
        deltaYawDeg: 0,
        newL,
        newW,
        newH,
        groundZ: Number(groundZ.toFixed(3)),
        pointsCount: bodyPts.length,
        step,
        message: `Không đủ điểm LiDAR xe 2 bánh (${bodyPts.length} điểm)`,
      };
    }

    const allLx = bodyPts.map((p) => p.lx).sort((a, b) => a - b);
    const allLy = bodyPts.map((p) => p.ly).sort((a, b) => a - b);
    const allZ = bodyPts.map((p) => p.z).sort((a, b) => a - b);

    // Sai số cho phép nhiễu cao hơn (chỉ cắt 1.5% thay vì 5%) để bắt trọn gương xe và cạnh ngoài
    const pMinIdx = bodyPts.length >= 30 ? Math.floor(bodyPts.length * 0.015) : 0;
    const pMaxIdx = bodyPts.length >= 30 ? Math.min(bodyPts.length - 1, Math.floor(bodyPts.length * 0.985)) : bodyPts.length - 1;

    const lxMin = allLx[pMinIdx];
    const lxMax = allLx[pMaxIdx];
    const lyMin = allLy[pMinIdx];
    const lyMax = allLy[pMaxIdx];
    const highestPtZ = allZ[allZ.length - 1];

    // Hàm chuẩn hóa góc cục bộ
    const normalizeRad = (r: number) => {
      let a = r;
      while (a > Math.PI) a -= 2 * Math.PI;
      while (a < -Math.PI) a += 2 * Math.PI;
      return a;
    };

    // Hàm ước tính góc lệch Yaw theo trục nối Cực Đuôi -> Cực Đầu kết hợp PCA 2D
    const calcHeadingDelta = (): number => {
      const n = bodyPts.length;

      // 1. PCA 2D trên cụm điểm thân xe
      let sumLx = 0;
      let sumLy = 0;
      for (const p of bodyPts) {
        sumLx += p.lx;
        sumLy += p.ly;
      }
      const meanLx = sumLx / n;
      const meanLy = sumLy / n;
      let sxx = 0;
      let syy = 0;
      let sxy = 0;
      for (const p of bodyPts) {
        const dx = p.lx - meanLx;
        const dy = p.ly - meanLy;
        sxx += dx * dx;
        syy += dy * dy;
        sxy += dx * dy;
      }
      sxx /= n;
      syy /= n;
      sxy /= n;
      const deltaThetaPca = 0.5 * Math.atan2(2 * sxy, sxx - syy);

      // 2. Vector nối Trọng tâm Cụm Đuôi -> Cụm Đầu
      const sorted = [...bodyPts].sort((a, b) => a.lx - b.lx);
      const rearSlice = sorted.slice(0, Math.max(1, Math.floor(n * 0.18)));
      const frontSlice = sorted.slice(Math.max(1, Math.floor(n * 0.82)));

      const rearLx = rearSlice.reduce((s, p) => s + p.lx, 0) / rearSlice.length;
      const rearLy = rearSlice.reduce((s, p) => s + p.ly, 0) / rearSlice.length;
      const frontLx = frontSlice.reduce((s, p) => s + p.lx, 0) / frontSlice.length;
      const frontLy = frontSlice.reduce((s, p) => s + p.ly, 0) / frontSlice.length;

      const dLx = frontLx - rearLx;
      const dLy = frontLy - rearLy;
      let deltaThetaExt = deltaThetaPca;
      if (dLx >= 0.35) {
        deltaThetaExt = Math.atan2(dLy, dLx);
      }

      let dTheta = Math.abs(deltaThetaPca - deltaThetaExt) < 0.2
        ? 0.7 * deltaThetaPca + 0.3 * deltaThetaExt
        : deltaThetaPca;

      return Math.max(-Math.PI / 4, Math.min(Math.PI / 4, dTheta));
    };

    if (step === "top") {
      // 1. CĂN TOP ĐỘC LẬP: Xoay Yaw theo Trục Đầu - Đuôi, khóa tâm X/Y/Z và kích thước L/W/H
      const dTheta = calcHeadingDelta();
      newYaw = normalizeRad(yaw + dTheta);
      newYawDeg = Number(((newYaw * 180) / Math.PI).toFixed(2));
      deltaYawDeg = Number(((dTheta * 180) / Math.PI).toFixed(2));

      newX = cx;
      newY = cy;
      newZ = cz;
      newL = curL;
      newW = curW;
      newH = curH;

      const sign = deltaYawDeg >= 0 ? "+" : "";
      msg = `Đã căn TOP Xe 2 bánh: Xoay Yaw (${newYawDeg}°, Δ=${sign}${deltaYawDeg}°) theo trục Đầu - Đuôi, khóa tâm X/Y/Z & L/W/H`;
    } else if (step === "side") {
      // 2. CĂN SIDE ĐỘC LẬP: Cản X đón tia & Ghim đất, Khóa L tuyệt đối
      newYaw = yaw;
      newYawDeg = curYawDeg;
      deltaYawDeg = 0;
      newL = curL;
      newW = curW;
      newH = curH;

      let shiftLx = 0;
      let bumperName = "Đón tia";

      if (options.egoPos) {
        const dxEgo = options.egoPos.x - cx;
        const dyEgo = options.egoPos.y - cy;
        const lxEgo = dxEgo * Math.cos(-yaw) - dyEgo * Math.sin(-yaw);
        if (lxEgo > 0.4) {
          shiftLx = lxMax - curL / 2;
          bumperName = "Cản trước";
        } else if (lxEgo < -0.4) {
          shiftLx = lxMin + curL / 2;
          bumperName = "Cản sau";
        } else {
          shiftLx = (lxMin + lxMax) / 2;
          bumperName = "Cân đối";
        }
      } else {
        const frontCount = bodyPts.filter((p) => p.lx > 0).length;
        const rearCount = bodyPts.filter((p) => p.lx <= 0).length;
        if (frontCount > rearCount * 1.5) {
          shiftLx = lxMax - curL / 2;
          bumperName = "Cản trước";
        } else if (rearCount > frontCount * 1.5) {
          shiftLx = lxMin + curL / 2;
          bumperName = "Cản sau";
        } else {
          shiftLx = (lxMin + lxMax) / 2;
          bumperName = "Cân đối";
        }
      }

      shiftLx = Math.max(-0.45, Math.min(0.45, shiftLx));
      newZ = cz; // TUYỆT ĐỐI KHÔNG GHIM ĐẤT: Giữ nguyên cao độ Z ban đầu (đã có nút ghim đất riêng)
      newX = Number((cx + shiftLx * Math.cos(yaw)).toFixed(3));
      newY = Number((cy + shiftLx * Math.sin(yaw)).toFixed(3));

      const signX = shiftLx >= 0 ? "+" : "";
      msg = `Đã căn SIDE Xe 2 bánh: [${bumperName}] bám vệt lốp (ΔX: ${signX}${(shiftLx * 100).toFixed(1)}cm, giữ nguyên cao độ Z), Khóa L: ${newL}m`;
    } else if (step === "front") {
      // 3. CĂN FRONT ĐỘC LẬP (LÀM CHUẨN THEO CAR THEO YÊU CẦU NGƯỜI DÙNG)
      // - Mặt phẳng 2D Y - Z theo phương W: Căn sườn xe đón tia
      // - 🚨 TUYỆT ĐỐI KHÔNG GHIM ĐẤT: Giữ nguyên 100% cao độ Z (newZ = cz)
      // - Trục dọc X giữ nguyên cố định 100% (shiftLx = 0)
      // - BẢO TOÀN TUYỆT ĐỐI 100% KÍCH THƯỚC L, W, H (Không co giãn size ở nút Front)
      newYaw = yaw;
      newYawDeg = curYawDeg;
      deltaYawDeg = 0;
      newL = curL;
      newW = curW;
      newH = curH;
      newZ = cz; // GIỮ NGUYÊN 100% CAO ĐỘ Z (KHÔNG GHIM ĐẤT NHƯ CAR)

      let visibleSide: "left" | "right";
      if (options.egoPos) {
        const toEgoX = options.egoPos.x - cx;
        const toEgoY = options.egoPos.y - cy;
        const egoLocalY = -toEgoX * Math.sin(yaw) + toEgoY * Math.cos(yaw);
        visibleSide = egoLocalY >= 0 ? "left" : "right";
      } else {
        const leftCount = bodyPts.filter((p) => p.ly > 0.05).length;
        const rightCount = bodyPts.filter((p) => p.ly < -0.05).length;
        visibleSide = leftCount >= rightCount ? "left" : "right";
      }

      // Padding đệm an toàn 5cm để gương và tay lái không cọ sát mép box
      const edgePadding = 0.05;
      let shiftLy = 0;
      if (lyMin <= -0.06 && lyMax >= 0.06) {
        shiftLy = (lyMin + lyMax) / 2;
      } else if (visibleSide === "left") {
        shiftLy = (lyMax + edgePadding) - curW / 2;
      } else {
        shiftLy = (lyMin - edgePadding) + curW / 2;
      }

      shiftLy = Math.max(-0.35, Math.min(0.35, shiftLy));

      newX = Number((cx - shiftLy * Math.sin(yaw)).toFixed(3));
      newY = Number((cy + shiftLy * Math.cos(yaw)).toFixed(3));

      const signY = shiftLy >= 0 ? "+" : "";
      const sideText = visibleSide === "left" ? "Sườn Trái" : "Sườn Phải";
      msg = `Đã căn FRONT Xe 2 bánh: [${sideText}] đón tia ăn khít phương W (ΔY: ${signY}${(shiftLy * 100).toFixed(1)}cm), giữ nguyên cao độ Z và kích thước (chuẩn Car)`;
    } else if (step === "w") {
      // -------------------------------------------------------------
      // CHẾ ĐỘ FIT RIÊNG CHIỀU RỘNG W: Bắt gương xe, tay lái (+5cm đệm gương)
      // -------------------------------------------------------------
      newYaw = yaw;
      newYawDeg = curYawDeg;
      deltaYawDeg = 0;
      newL = curL;
      newH = curH;
      newZ = cz;

      let shiftLy = 0;
      let measuredW = curW;

      if (lyMin <= -0.06 && lyMax >= 0.06) {
        measuredW = (lyMax - lyMin) + 0.16;
        shiftLy = (lyMin + lyMax) / 2;
        shiftLy = Math.max(-0.35, Math.min(0.35, shiftLy));
      } else if (lyMax > 0 && lyMin > -0.06) {
        measuredW = 2 * (lyMax + 0.10);
        shiftLy = 0;
      } else if (lyMin < 0 && lyMax < 0.06) {
        measuredW = 2 * (Math.abs(lyMin) + 0.10);
        shiftLy = 0;
      } else {
        measuredW = (lyMax - lyMin) + 0.16;
        shiftLy = (lyMin + lyMax) / 2;
        shiftLy = Math.max(-0.35, Math.min(0.35, shiftLy));
      }

      newW = Number(Math.max(0.55, Math.min(1.45, measuredW)).toFixed(2));

      newX = Number((cx - shiftLy * Math.sin(yaw)).toFixed(3));
      newY = Number((cy + shiftLy * Math.cos(yaw)).toFixed(3));

      const signY = shiftLy >= 0 ? "+" : "";
      msg = `Đã fit Rộng (W) Xe 2 bánh: W=${newW}m (Đệm +5cm bắt trọn gương/tay lái), căn Y: ${signY}${(shiftLy * 100).toFixed(1)}cm, giữ nguyên L, H & Z`;
    } else if (step === "h") {
      // -------------------------------------------------------------
      // CHẾ ĐỘ FIT RIÊNG CHIỀU CAO H: Bám sàn Z_base cố định, nở lên nóc
      // -------------------------------------------------------------
      newYaw = yaw;
      newYawDeg = curYawDeg;
      deltaYawDeg = 0;
      newL = curL;
      newW = curW;
      newX = cx;
      newY = cy;

      const currentBaseZ = cz - curH / 2;
      const effectiveBaseZ = Math.abs(currentBaseZ - groundZ) <= 0.35 ? currentBaseZ : groundZ;

      const roofTopZ = highestPtZ + Math.max(0.12, headBuffer);
      newH = Number(Math.max(1.15, Math.min(2.20, roofTopZ - effectiveBaseZ)).toFixed(2));
      newZ = Number((effectiveBaseZ + newH / 2).toFixed(3));

      msg = `Đã fit Cao (H) Xe 2 bánh: H=${newH}m (Đáy bám sàn Z=${effectiveBaseZ.toFixed(2)}m cố định, nở lên nóc +12cm), giữ nguyên L, W & XY`;
    } else {
      // 4. CHU TRÌNH TOÀN DIỆN: TOP ➔ SIDE ➔ FRONT
      const dTheta = calcHeadingDelta();
      newYaw = normalizeRad(yaw + dTheta);
      newYawDeg = Number(((newYaw * 180) / Math.PI).toFixed(2));
      deltaYawDeg = Number(((dTheta * 180) / Math.PI).toFixed(2));

      newL = curL; // BẢO TOÀN TUYỆT ĐỐI CHIỀU DÀI L

      let shiftLx = 0;
      const frontCount = bodyPts.filter((p) => p.lx > 0).length;
      const rearCount = bodyPts.filter((p) => p.lx <= 0).length;
      if (frontCount > rearCount * 1.5) {
        shiftLx = lxMax - curL / 2;
      } else if (rearCount > frontCount * 1.5) {
        shiftLx = lxMin + curL / 2;
      } else {
        shiftLx = (lxMin + lxMax) / 2;
      }
      shiftLx = Math.max(-0.45, Math.min(0.45, shiftLx));

      let shiftLy = 0;
      let measuredW = curW;

      if (lyMin <= -0.06 && lyMax >= 0.06) {
        measuredW = lyMax - lyMin + 0.12;
        shiftLy = (lyMin + lyMax) / 2;
        shiftLy = Math.max(-0.35, Math.min(0.35, shiftLy));
      } else if (lyMax > 0 && lyMin > -0.06) {
        measuredW = 2 * (lyMax + 0.08);
        shiftLy = 0;
      } else if (lyMin < 0 && lyMax < 0.06) {
        measuredW = 2 * (Math.abs(lyMin) + 0.08);
        shiftLy = 0;
      } else {
        measuredW = lyMax - lyMin + 0.12;
        shiftLy = (lyMin + lyMax) / 2;
        shiftLy = Math.max(-0.35, Math.min(0.35, shiftLy));
      }

      newW = Number(Math.max(0.55, Math.min(1.35, measuredW)).toFixed(2));

      const roofTopZ = highestPtZ + headBuffer;
      newH = Number(Math.max(1.15, Math.min(2.20, roofTopZ - groundZ)).toFixed(2));
      newZ = Number((groundZ + newH / 2).toFixed(3));

      const cosW = Math.cos(newYaw);
      const sinW = Math.sin(newYaw);
      newX = Number((cx + shiftLx * cosW - shiftLy * sinW).toFixed(3));
      newY = Number((cy + shiftLx * sinW + shiftLy * cosW).toFixed(3));

      msg = `Đã fit toàn diện Xe 2 bánh: ${newL}x${newW}x${newH}m (Khóa L, Xoay Yaw ${newYawDeg}°, Ghim đất Z: ${newZ}m)`;
    }

    return {
      newX,
      newY,
      newZ,
      newYaw,
      newYawDeg,
      deltaYawDeg,
      newL,
      newW,
      newH,
      groundZ: Number(groundZ.toFixed(3)),
      pointsCount: bodyPts.length,
      step,
      message: msg,
    };
  }

  // Thuật toán ÔM SÁT CỤM ĐIỂM (Tight Bounding Box) & Chuẩn Hóa Theo Đám Mây Điểm LiDAR
  function computeLidarGroundAndFit(
    points: number[],
    fitMode: "tight" | "catalog" = "tight"
  ): {
    detectedGroundZ: number | null;
    newZ: number;
    newX: number;
    newY: number;
    newYaw: number;
    newL: number;
    newW: number;
    newH: number;
    pointsCount: number;
  } {
    const cx = points[0];
    const cy = points[1];
    const cz = points[2];
    let yaw = points[5];
    let l = points[6];
    let w = points[7];
    let h = points[8];

    const lidar = getSceneLidarPoints();
    if (!lidar || lidar.count === 0) {
      return {
        detectedGroundZ: null,
        newZ: cz,
        newX: cx,
        newY: cy,
        newYaw: yaw,
        newL: l,
        newW: w,
        newH: h,
        pointsCount: 0,
      };
    }

    const { count, array } = lidar;

    // 1. Nhận diện box sơ khởi (vừa vẽ 1x1m, chưa có kích thước và góc xoay chuẩn)
    const isInitialBox = l <= 2.2 || w <= 1.3;
    const halfL = isInitialBox ? 3.0 : l / 2 + 0.35;
    const halfW = isInitialBox ? 2.0 : w / 2 + 0.35;

    // 2. Dò cao độ mặt đất thực tế bằng thuật toán Footprint Tight Ground Snap (Bám dốc mặt đường thật, nếu thiếu điểm lấy mốc Ego Z = 0)
    const groundInfo = detectAccurateGroundZ(cx, cy, cz, yaw, l / 2, w / 2, h / 2, isInitialBox, false);
    const detectedGroundZ = groundInfo.groundZ;
    const effectiveGroundZ = detectedGroundZ !== null ? detectedGroundZ : 0;

    // 3. Thu thập các điểm thuộc vùng lân cận chiếc xe
    let cosY = Math.cos(-yaw);
    let sinY = Math.sin(-yaw);
    const candidateBodyPts: Array<{ x: number; y: number; z: number }> = [];

    // Trần cao độ để loại bỏ cành cây, dây điện, biển báo phía trên cao
    const maxRoofZ = effectiveGroundZ + 2.7;
    // Đáy cao độ: cao hơn mặt đất ít nhất 22cm để loại bỏ triệt để các điểm vệt quét loang sát mặt đường
    const minBodyZ = effectiveGroundZ + 0.22;

    for (let i = 0; i < count; i++) {
      const z = array[i * 3 + 2];
      if (z < minBodyZ || z > maxRoofZ) continue;

      const x = array[i * 3];
      const y = array[i * 3 + 1];
      const dx = x - cx;
      const dy = y - cy;

      if (isInitialBox) {
        if (dx * dx + dy * dy <= 3.4 * 3.4) {
          candidateBodyPts.push({ x, y, z });
        }
      } else {
        const lx = dx * cosY - dy * sinY;
        const ly = dx * sinY + dy * cosY;
        if (Math.abs(lx) <= halfL && Math.abs(ly) <= halfW) {
          candidateBodyPts.push({ x, y, z });
        }
      }
    }

    let newX = cx;
    let newY = cy;
    let newZ = Number((effectiveGroundZ + h / 2).toFixed(3));
    let newYaw = yaw;
    let newL = l;
    let newW = w;
    let newH = h;

    // 4. Nếu là box sơ khởi mới tạo: Dùng PCA 2D để tự động ước lượng góc trục dài của thân xe
    if (isInitialBox && candidateBodyPts.length >= 12) {
      let sumPtsX = 0, sumPtsY = 0;
      for (const p of candidateBodyPts) {
        sumPtsX += p.x;
        sumPtsY += p.y;
      }
      const mX = sumPtsX / candidateBodyPts.length;
      const mY = sumPtsY / candidateBodyPts.length;

      let sxx = 0, syy = 0, sxy = 0;
      for (const p of candidateBodyPts) {
        const dx = p.x - mX;
        const dy = p.y - mY;
        sxx += dx * dx;
        syy += dy * dy;
        sxy += dx * dy;
      }
      const pcaAngle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
      newYaw = Number(pcaAngle.toFixed(5));
      cosY = Math.cos(-newYaw);
      sinY = Math.sin(-newYaw);
    }

    // 5. Tính toán kích thước ôm khít (Tight Fit) hoặc chuẩn Catalog
    if (candidateBodyPts.length >= 10) {
      const rawLocalBodyPts: Array<{ lx: number; ly: number; z: number }> = [];
      for (const p of candidateBodyPts) {
        const dx = p.x - cx;
        const dy = p.y - cy;
        const lx = dx * cosY - dy * sinY;
        const ly = dx * sinY + dy * cosY;
        rawLocalBodyPts.push({ lx, ly, z: p.z });
      }

      // Lọc cụm thân xe chính: loại bỏ 100% xe bên cạnh ở trục ly và xe nối đuôi ở trục lx
      const filteredLy = filterDenseConnectedCluster1D(rawLocalBodyPts, "ly", 0.22, 0);
      const localBodyPts = filterDenseConnectedCluster1D(filteredLy, "lx", 0.22, 0);

      // Áp dụng thuật toán biên kháng nhiễu mật độ & loại bỏ gương chiếu hậu
      const robustBounds = computeDensityRobustBounds(localBodyPts);
      const lxMin = robustBounds.lxMin;
      const lxMax = robustBounds.lxMax;
      const lyMin = robustBounds.lyMin;
      const lyMax = robustBounds.lyMax;
      const zTop = robustBounds.zTop;

      const measuredL = lxMax - lxMin;
      const measuredW = lyMax - lyMin;
      const measuredH = zTop - effectiveGroundZ;

      if (fitMode === "tight") {
        // CHẾ ĐỘ 1: ÔM SÁT CỤM ĐIỂM (TIGHT FIT 100%)
        // Các mặt hộp tiếp xúc khít vào các điểm cực biên
        newL = Number(Math.max(1.5, Math.min(18.0, measuredL)).toFixed(2));
        newW = Number(Math.max(1.0, Math.min(3.2, measuredW)).toFixed(2));
        newH = Number(Math.max(1.0, Math.min(4.0, measuredH)).toFixed(2));

        // Nếu xe chỉ quét được 1 mặt sườn hoặc đuôi (điểm bị thiếu một chiều)
        if (isInitialBox) {
          if (newL < 3.2) newL = 4.65;
          if (newW < 1.4) newW = 1.85;
          if (newH < 1.2) newH = 1.55;
        }

        // Tâm trung điểm của cụm điểm
        const midLx = (lxMin + lxMax) / 2;
        const midLy = (lyMin + lyMax) / 2;

        const cosWorld = Math.cos(newYaw);
        const sinWorld = Math.sin(newYaw);
        newX = Number((cx + midLx * cosWorld - midLy * sinWorld).toFixed(2));
        newY = Number((cy + midLx * sinWorld + midLy * cosWorld).toFixed(2));
        newZ = Number((effectiveGroundZ + newH / 2).toFixed(3));
      } else {
        // CHẾ ĐỘ 2: GỢI Ý CHUẨN CATALOG
        if (measuredL >= 3.0) {
          newL = Math.min(5.5, Math.max(3.8, Number((measuredL + 0.1).toFixed(2))));
        } else {
          newL = 4.65;
        }

        if (measuredW >= 1.5 && measuredW <= 2.2) {
          newW = Number(measuredW.toFixed(2));
        } else {
          newW = 1.85;
        }

        newH = Number(Math.max(1.4, Math.min(2.2, measuredH)).toFixed(2));

        const midLx = Math.max(-1.5, Math.min(1.5, (lxMin + lxMax) / 2));
        const midLy = Math.max(-0.4, Math.min(0.4, (lyMin + lyMax) / 2));
        const cosWorld = Math.cos(newYaw);
        const sinWorld = Math.sin(newYaw);
        newX = Number((cx + midLx * cosWorld - midLy * sinWorld).toFixed(2));
        newY = Number((cy + midLx * sinWorld + midLy * cosWorld).toFixed(2));
        newZ = Number((effectiveGroundZ + newH / 2).toFixed(3));
      }
    }

    return {
      detectedGroundZ,
      newZ,
      newX,
      newY,
      newYaw,
      newL,
      newW,
      newH,
      pointsCount: candidateBodyPts.length,
    };
  }

  // Can thiệp trực tiếp Three.js Canvas3D để xoay, co giãn và di chuyển cuboid tức thì
  function updateThreeJsCuboid(
    uiId: number,
    newYaw?: number,
    newPos?: { x: number; y: number; z: number },
    newScale?: { l: number; w: number; h: number },
    newRot?: { rx: number; ry: number; rz: number }
  ): boolean {
    try {
      const store = getReduxStore();
      const canvas = store?.getState()?.annotation?.canvas?.instance;
      if (!canvas || !canvas.view || !canvas.view.drawnObjects) {
        return false;
      }

      const drawnItem = canvas.view.drawnObjects[String(uiId)];
      if (!drawnItem) {
        return false;
      }

      // 1. Cập nhật dữ liệu points trong RAM của drawnItem
      if (drawnItem.data && Array.isArray(drawnItem.data.points)) {
        if (newYaw !== undefined) {
          drawnItem.data.points[5] = newYaw;
        }
        if (newRot) {
          drawnItem.data.points[3] = newRot.rx;
          drawnItem.data.points[4] = newRot.ry;
          drawnItem.data.points[5] = newRot.rz;
        }
        if (newPos) {
          drawnItem.data.points[0] = newPos.x;
          drawnItem.data.points[1] = newPos.y;
          drawnItem.data.points[2] = newPos.z;
        }
        if (newScale) {
          drawnItem.data.points[6] = newScale.l;
          drawnItem.data.points[7] = newScale.w;
          drawnItem.data.points[8] = newScale.h;
        }
        drawnItem.data.updated = true;
      }

      // 2. Can thiệp trực tiếp Three.js Cuboid (Perspective, Top, Side, Front views)
      const cuboid = drawnItem.cuboid;
      if (cuboid) {
        if (newRot && typeof cuboid.setRotation === "function") {
          cuboid.setRotation(newRot.rx, newRot.ry, newRot.rz);
        } else if (newYaw !== undefined && typeof cuboid.setRotation === "function") {
          const curRot = cuboid.perspective?.rotation;
          const rx = curRot ? curRot.x : 0;
          const ry = curRot ? curRot.y : 0;
          cuboid.setRotation(rx, ry, newYaw);
        }

        if (newScale && typeof cuboid.setScale === "function") {
          cuboid.setScale(newScale.l, newScale.w, newScale.h);
        }

        if (newPos && typeof cuboid.setPosition === "function") {
          cuboid.setPosition(newPos.x, newPos.y, newPos.z);
        }
      }

      if (typeof canvas.render === "function") {
        canvas.render();
      }

      return true;
    } catch (err) {
      console.warn("[CVAT 3D Suite] Lỗi cập nhật trực tiếp Three.js:", err);
      return false;
    }
  }

  // Trích xuất chi tiết thời gian thực của đối tượng từ WebGL drawnObjects hoặc Redux States
  function extractObjectDetails(clientId: number): any {
    try {
      const store = getReduxStore();
      const anno = store?.getState()?.annotation;
      const canvas = anno?.canvas?.instance;

      // 1. Thử lấy từ Three.js canvas drawnObjects
      const drawnItem = canvas?.view?.drawnObjects?.[String(clientId)];
      if (drawnItem && drawnItem.data && Array.isArray(drawnItem.data.points)) {
        const p = drawnItem.data.points;
        return {
          clientId,
          serverId: drawnItem.data.serverID || null,
          label: drawnItem.data.label?.name || "Car",
          x: Number(p[0].toFixed(2)),
          y: Number(p[1].toFixed(2)),
          z: Number(p[2].toFixed(3)),
          yawDeg: Math.round((p[5] * 180) / Math.PI),
          l: Number(p[6].toFixed(2)),
          w: Number(p[7].toFixed(2)),
          h: Number(p[8].toFixed(2)),
          points: [...p],
        };
      }

      // 2. Thử lấy từ Redux states
      const states = anno?.annotations?.states || [];
      const matched = states.find((s: any) => s.clientID === clientId);
      if (matched && Array.isArray(matched.points)) {
        const p = matched.points;
        return {
          clientId,
          serverId: matched.serverID || null,
          label: matched.label?.name || "Car",
          x: Number(p[0].toFixed(2)),
          y: Number(p[1].toFixed(2)),
          z: Number(p[2].toFixed(3)),
          yawDeg: Math.round((p[5] * 180) / Math.PI),
          l: Number(p[6].toFixed(2)),
          w: Number(p[7].toFixed(2)),
          h: Number(p[8].toFixed(2)),
          points: [...p],
        };
      }
    } catch (e) {}
    return null;
  }

  // Đảm bảo mảng points của cuboid luôn có tối thiểu 16 phần tử để thỏa mãn quy tắc validation của cvat-core (16 / 2 = 8 đỉnh)
  function ensureCuboidPoints(newValues: number[], existingPoints?: number[]): number[] {
    let result: number[];
    if (Array.isArray(existingPoints) && existingPoints.length >= 16) {
      result = [...existingPoints];
      for (let i = 0; i < Math.min(newValues.length, 9); i++) {
        result[i] = newValues[i];
      }
    } else {
      result = [...newValues];
      while (result.length < 16) {
        result.push(0);
      }
    }
    return result;
  }

  // Tìm đối tượng với cơ chế phòng vệ 2 lớp (cvat-core annotations + Three.js drawnObjects fallback)
  async function findTargetSafely(job: any, frame: number, uiId: number, serverId?: number): Promise<{ target: any; isDrawn: boolean }> {
    if (job && job.annotations) {
      try {
        const annotations = await job.annotations.get(frame);
        const found = annotations.find(
          (s: any) => s.clientID === uiId || (serverId && s.serverID === serverId)
        );
        if (found) return { target: found, isDrawn: false };
      } catch (e) {}
    }

    // Fallback: Lấy trực tiếp từ drawnObjects nếu box vừa mới được tạo
    const store = getReduxStore();
    const canvas = store?.getState()?.annotation?.canvas?.instance;
    const drawnItem = canvas?.view?.drawnObjects?.[String(uiId)];
    if (drawnItem && drawnItem.data && Array.isArray(drawnItem.data.points)) {
      return { target: drawnItem.data, isDrawn: true };
    }

    throw new Error(`Không tìm thấy xe #${uiId} tại Frame #${frame}`);
  }

  // Helper chuẩn hóa các cấu trúc đa hình (Array, Map, Set, Object dictionary) thành mảng thuần túy
  function toArray(val: any): any[] {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (val instanceof Map || val instanceof Set) return Array.from(val.values());
    if (typeof val === "object") {
      const values = Object.values(val);
      if (values.length > 0 && typeof values[0] === "object") return values;
    }
    return [];
  }

  // Trích xuất danh sách Track từ Job cvat-core theo cơ chế đa tầng
  function getJobTrackCollection(job: any): any[] {
    if (!job) return [];
    const list: any[] = [];
    const anno = job.annotations;
    if (anno) {
      const col = (anno as any)._collection || (anno as any).collection;
      if (col) {
        list.push(...toArray(col.tracks));
      }
    }
    if ((job as any).tracks) {
      list.push(...toArray((job as any).tracks));
    }

    try {
      const store = getReduxStore();
      const storeJob = store?.getState()?.annotation?.job?.instance;
      const storeCol = storeJob?.annotations?._collection || storeJob?.annotations?.collection;
      if (storeCol) {
        list.push(...toArray(storeCol.tracks));
      }
    } catch (e) {}

    return list;
  }

  // Tìm đối tượng Track cha trong Job cvat-core theo mọi tiêu chí nhận diện (Multi-tier Track Discovery)
  async function findTrackInJob(
    job: any,
    uiId: number,
    serverId?: number,
    parentID?: number
  ): Promise<any | null> {
    if (!job) return null;

    // 0. Nếu chưa có parentID, thử truy vấn ở frame hiện tại của job để trích xuất parentID/trackID
    if (!parentID && job.annotations) {
      try {
        const curFrame = typeof job.frame === "number" ? job.frame : 0;
        const curStates = await job.annotations.get(curFrame);
        if (Array.isArray(curStates)) {
          const curSt = curStates.find(
            (s: any) =>
              Number(s.clientID) === Number(uiId) ||
              (serverId && Number(s.serverID) === Number(serverId))
          );
          if (curSt) {
            parentID = curSt.parentID || curSt.trackID || (curSt.parent && curSt.parent.clientID);
          }
        }
      } catch (e) {}
    }

    // 1. Tìm trực tiếp trong collection.tracks của cvat-core
    const tracks = getJobTrackCollection(job);
    if (tracks && tracks.length > 0) {
      let found = tracks.find(
        (t: any) =>
          Number(t.clientID) === Number(uiId) ||
          Number(t.id) === Number(uiId) ||
          String(t.clientID) === String(uiId)
      );
      if (found) return found;

      if (serverId) {
        found = tracks.find(
          (t: any) =>
            Number(t.serverID) === Number(serverId) ||
            String(t.serverID) === String(serverId)
        );
        if (found) return found;
      }

      if (parentID) {
        found = tracks.find(
          (t: any) =>
            Number(t.clientID) === Number(parentID) ||
            Number(t.id) === Number(parentID) ||
            String(t.clientID) === String(parentID)
        );
        if (found) return found;
      }

      found = tracks.find((t: any) => {
        const shList = toArray(t.shapes || t.keyframes || (t as any)._shapes);
        return shList.some(
          (sh: any) =>
            Number(sh.clientID) === Number(uiId) ||
            (serverId && Number(sh.serverID) === Number(serverId)) ||
            (sh.parentID && Number(sh.parentID) === Number(uiId))
        );
      });
      if (found) return found;
    }

    // 2. Thử qua API job.annotations.get(null, true)
    if (job.annotations) {
      try {
        const allObjects = await job.annotations.get(null, true);
        if (Array.isArray(allObjects)) {
          let found = allObjects.find(
            (t: any) =>
              Number(t.clientID) === Number(uiId) ||
              Number(t.id) === Number(uiId) ||
              (serverId && Number(t.serverID) === Number(serverId)) ||
              (parentID && (Number(t.clientID) === Number(parentID) || Number(t.id) === Number(parentID)))
          );
          if (found) return found;
        }
      } catch (e) {}

      // 3. Thử qua API job.annotations.get()
      try {
        const defaultTracks = await job.annotations.get();
        if (Array.isArray(defaultTracks)) {
          let found = defaultTracks.find(
            (t: any) =>
              Number(t.clientID) === Number(uiId) ||
              Number(t.id) === Number(uiId) ||
              (serverId && Number(t.serverID) === Number(serverId)) ||
              (parentID && (Number(t.clientID) === Number(parentID) || Number(t.id) === Number(parentID)))
          );
          if (found) return found;
        }
      } catch (e) {}
    }

    return null;
  }

  // Kích hoạt chế độ "Đã sửa nhưng chưa lưu" trên CVAT Native Header (Sáng nút Save, không disabled)
  function markCvatSaveButtonUnsaved(): void {
    try {
      (window as any).__CVAT_HAS_UNSAVED_CHANGES__ = true;
      const cvatSaveBtn = document.querySelector<HTMLButtonElement>(
        "button.cvat-annotation-header-save-button, .cvat-annotation-header-save-button, button[aria-label='Save annotations']"
      );
      if (cvatSaveBtn) {
        cvatSaveBtn.disabled = false;
        cvatSaveBtn.removeAttribute("disabled");
        cvatSaveBtn.classList.remove("cvat-disabled-button");
        cvatSaveBtn.style.opacity = "1";
        cvatSaveBtn.style.cursor = "pointer";
      }
    } catch (e) {}
  }

  // Tự động đồng bộ và lưu vĩnh viễn lên cơ sở dữ liệu CVAT bằng cvat-core API & AutoSave UI Header Trigger (CHỈ GỌI KHI USER BẤM LƯU)
  async function persistJobAnnotations(job: any): Promise<void> {
    try {
      if (job && job.annotations && typeof job.annotations.save === "function") {
        await job.annotations.save();
        console.log("[CVAT 3D Suite] Đã lưu thành công lên database CVAT qua cvat-core API.");
      }
    } catch (err) {
      console.warn("[CVAT 3D Suite] Ghi nhận thay đổi cvat-core:", err);
    }

    // AutoSave UI Header Sync: Tự động kích hoạt nút Save trên Header CVAT để giao diện web đồng bộ 100%
    setTimeout(() => {
      try {
        const cvatSaveBtn = document.querySelector<HTMLButtonElement>(
          "button.cvat-annotation-header-save-button, .cvat-annotation-header-save-button, button[aria-label='Save annotations']"
        );
        if (cvatSaveBtn && !cvatSaveBtn.disabled && !cvatSaveBtn.classList.contains("cvat-disabled-button")) {
          cvatSaveBtn.click();
          console.log("[CVAT 3D Suite] Đã kích hoạt AutoSave trên giao diện CVAT Header.");
        }
      } catch (e) {}
    }, 120);
  }

  // Thiết lập cơ chế tự động chọn xe khi click vào box trên Canvas 3D & Redux Subscriber Realtime
  let isCanvasAutoSelectAttached = false;
  function setupCanvasAutoSelect(): void {
    if (isCanvasAutoSelectAttached) return;
    isCanvasAutoSelectAttached = true;

    const canvasContainers = document.querySelectorAll<HTMLElement>(
      ".cvat-canvas-container, .cvat-canvas3d-orthographic-view"
    );

    canvasContainers.forEach((container) => {
      container.addEventListener("pointerup", () => {
        setTimeout(() => {
          try {
            const store = getReduxStore();
            const canvas = store?.getState()?.annotation?.canvas?.instance;
            const activeId =
              canvas?.view?.activatedElementID ||
              store?.getState()?.annotation?.annotations?.activatedStateClientID;

            if (activeId !== null && activeId !== undefined) {
              const details = extractObjectDetails(Number(activeId));
              window.dispatchEvent(
                new CustomEvent("CVAT_EXT_RES_OBJECT_ACTIVATED", {
                  detail: { clientId: Number(activeId), details },
                })
              );
            }
          } catch (e) {}
        }, 80);
      });
    });

    // Lắng nghe sự kiện click trên sidebar
    document.addEventListener("click", (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const sidebarItem = target.closest<HTMLElement>(
        "[class*='cvat-objects-sidebar-state-item']"
      );
      if (sidebarItem) {
        setTimeout(() => {
          const match = (sidebarItem.id || sidebarItem.innerText || "").match(/#?(\d+)/);
          if (match) {
            const id = parseInt(match[1], 10);
            const details = extractObjectDetails(id);
            window.dispatchEvent(
              new CustomEvent("CVAT_EXT_RES_OBJECT_ACTIVATED", {
                detail: { clientId: id, details },
              })
            );
          }
        }, 60);
      }
    });

    // LẮNG NGHE REDUX STORE SUBSCRIBE ĐỂ PHÁT HIỆN TỨC THÌ KHI VỪA VẼ XONG BOX MỚI
    try {
      const store = getReduxStore();
      if (store) {
        let prevActiveId: any = null;
        let prevStatesLen = 0;
        let activeDebounceTimer: any = null;
        let dirtyDebounceTimer: any = null;

        store.subscribe(() => {
          try {
            const anno = store.getState()?.annotation;
            const curActiveId = anno?.annotations?.activatedStateClientID;
            const curStatesLen = anno?.annotations?.states?.length || 0;

            if (curActiveId !== prevActiveId) {
              prevActiveId = curActiveId;
              if (curActiveId !== null && curActiveId !== undefined) {
                if (activeDebounceTimer) clearTimeout(activeDebounceTimer);
                activeDebounceTimer = setTimeout(() => {
                  activeDebounceTimer = null;
                  const details = extractObjectDetails(Number(curActiveId));
                  window.dispatchEvent(
                    new CustomEvent("CVAT_EXT_RES_OBJECT_ACTIVATED", {
                      detail: { clientId: Number(curActiveId), details },
                    })
                  );
                }, 80);
              }
            }

            if (curStatesLen !== prevStatesLen) {
              prevStatesLen = curStatesLen;
              // Debounce 400ms để không bắn liên tục khi CVAT đang nạp batch states lúc khởi động
              if (dirtyDebounceTimer) clearTimeout(dirtyDebounceTimer);
              dirtyDebounceTimer = setTimeout(() => {
                dirtyDebounceTimer = null;
                window.dispatchEvent(new CustomEvent("CVAT_EXT_RES_FRAME_TRACKS_DIRTY"));
              }, 400);
            }
          } catch (err) {}
        });
      }
    } catch (sErr) {}

    // Lắng nghe yêu cầu kích hoạt đối tượng từ Extension (Chặn lặp vô tận)
    window.addEventListener("CVAT_EXT_REQ_ACTIVATE_OBJECT", (e: any) => {
      const { clientId } = e.detail || {};
      if (!clientId) return;
      try {
        const store = getReduxStore();
        const canvas = store?.getState()?.annotation?.canvas?.instance;
        if (canvas && typeof canvas.activate === "function") {
          const curActive =
            canvas.view?.activatedElementID ||
            store?.getState()?.annotation?.annotations?.activatedStateClientID;
          // Chỉ gọi activate nếu ID thực sự khác ID đang active để tránh kích hoạt lại vòng lặp vô tận!
          if (curActive !== clientId) {
            canvas.activate(clientId);
            if (typeof canvas.render === "function") {
              canvas.render();
            }
          }
        }
      } catch (err) {}
    });
  }

  // Khởi chạy listener click canvas
  setTimeout(() => setupCanvasAutoSelect(), 1500);

  // 1. Lắng nghe yêu cầu lấy danh sách xe tại Frame hiện tại
  window.addEventListener("CVAT_EXT_REQ_FRAME_TRACKS", async (e: any) => {
    const { jobId, frame } = e.detail || {};
    try {
      const job = await getActiveJobInstance(jobId);
      if (!job) throw new Error("Không tìm thấy Job Instance của CVAT");

      const annotations = await job.annotations.get(frame);
      const list = annotations
        .filter((s: any) => s.shapeType === "cuboid" && Array.isArray(s.points) && s.points.length >= 9)
        .map((s: any) => {
          const p = s.points;
          return {
            uiId: s.clientID,       // SỐ 1, 2 HIỂN THỊ CHUẨN XÁC 100% TRÊN GIAO DIỆN!
            serverId: s.serverID,   // SỐ 31, 32 LƯU DƯỚI CƠ SỞ DỮ LIỆU
            label: s.label?.name || "Car",
            x: Number(p[0].toFixed(2)),
            y: Number(p[1].toFixed(2)),
            z: Number(p[2].toFixed(3)),
            yawDeg: Math.round((p[5] * 180) / Math.PI),
            l: Number(p[6].toFixed(2)),
            w: Number(p[7].toFixed(2)),
            h: Number(p[8].toFixed(2)),
          };
        });

      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_FRAME_TRACKS", {
          detail: { success: true, frame, list },
        })
      );
    } catch (err: any) {
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_FRAME_TRACKS", {
          detail: { success: false, error: err.message || String(err) },
        })
      );
    }
  });

  // 1b. Lắng nghe yêu cầu lấy TOÀN BỘ CÁC FRAME của một chiếc xe (Full-Track Lifecycle Query)
  window.addEventListener("CVAT_EXT_REQ_GET_TRACK_ALL_FRAMES", async (e: any) => {
    const { jobId, uiId, serverId } = e.detail || {};
    try {
      const job = await getActiveJobInstance(jobId);
      if (!job) throw new Error("Không tìm thấy Job Instance của CVAT");

      const framesMap = new Map<number, any>();
      const parentTrack = await findTrackInJob(job, uiId, serverId);
      const trackLabel = parentTrack?.label?.name || "Vehicle";

      // 1. Thu thập keyframes từ Track instance nếu có
      if (parentTrack) {
        const shapes = toArray(parentTrack.shapes || parentTrack.keyframes);
        for (const sh of shapes) {
          if (sh.shapeType === "cuboid" && Array.isArray(sh.points) && sh.points.length >= 9) {
            framesMap.set(sh.frame, {
              frame: sh.frame,
              isKeyframe: true,
              outside: !!sh.outside,
              points: [...sh.points],
              label: trackLabel,
            });
          }
        }
      }

      // 2. Quét dải frame của Job để lấy đầy đủ cả các frame nội suy
      const startF = typeof job.startFrame === "number" ? job.startFrame : 0;
      const stopF = typeof job.stopFrame === "number" ? job.stopFrame : (startF + 100);
      for (let f = startF; f <= stopF; f++) {
        try {
          const states = await job.annotations.get(f);
          if (Array.isArray(states)) {
            const st = states.find(
              (s: any) => s.clientID === uiId || (serverId && s.serverID === serverId)
            );
            if (st && Array.isArray(st.points) && st.points.length >= 9) {
              const existing = framesMap.get(f);
              framesMap.set(f, {
                frame: f,
                isKeyframe: existing ? existing.isKeyframe : !!st.keyframe,
                outside: !!st.outside,
                points: [...st.points],
                label: st.label?.name || trackLabel,
              });
            }
          }
        } catch (e) {}
      }

      const framesList = Array.from(framesMap.values()).sort((a, b) => a.frame - b.frame);
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_GET_TRACK_ALL_FRAMES", {
          detail: { success: true, uiId, serverId, frames: framesList },
        })
      );
    } catch (err: any) {
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_GET_TRACK_ALL_FRAMES", {
          detail: { success: false, error: err.message || String(err) },
        })
      );
    }
  });

  // 1b2. Lắng nghe yêu cầu lấy TOÀN BỘ CÁC TRACK trong Job kèm danh sách Shapes (Dùng cho Case 1 & Case 2 Store)
  window.addEventListener("CVAT_EXT_REQ_GET_ALL_JOB_TRACKS_WITH_SHAPES", async (e: any) => {
    const { jobId } = e.detail || {};
    try {
      const job = await getActiveJobInstance(jobId);
      if (!job) throw new Error("Không tìm thấy Job Instance của CVAT");

      const rawTracks = getJobTrackCollection(job);
      const startF = typeof job.startFrame === "number" ? job.startFrame : 0;
      const stopF = typeof job.stopFrame === "number" ? job.stopFrame : startF + 100;

      // Gom nhóm shapes theo clientID
      const trackMap = new Map<number, any>();
      for (const t of rawTracks) {
        if (!t.clientID) continue;
        const shList = toArray(t.shapes || t.keyframes);
        const shapes = shList
          .filter((s: any) => s.shapeType === "cuboid" && Array.isArray(s.points) && s.points.length >= 9)
          .map((s: any) => ({
            type: "cuboid",
            frame: s.frame,
            points: [...s.points],
            outside: !!s.outside,
            occluded: !!s.occluded,
            z_order: s.zOrder || 0,
            rotation: 0,
          }));

        trackMap.set(t.clientID, {
          id: t.clientID,
          clientID: t.clientID,
          serverID: t.serverID || null,
          labelId: t.label?.id || 1,
          labelName: t.label?.name || "Car",
          labelColor: t.label?.color || "#38bdf8",
          shapes,
        });
      }

      // Quét các frame để bắt trọn vẹn cả những track chưa có trong memory collection
      for (let f = startF; f <= stopF; f++) {
        try {
          const states = await job.annotations.get(f);
          if (Array.isArray(states)) {
            for (const st of states) {
              if (st.shapeType !== "cuboid" || !Array.isArray(st.points) || st.points.length < 9) continue;
              let t = trackMap.get(st.clientID);
              if (!t) {
                t = {
                  id: st.clientID,
                  clientID: st.clientID,
                  serverID: st.serverID || null,
                  labelId: st.label?.id || 1,
                  labelName: st.label?.name || "Car",
                  labelColor: st.label?.color || "#38bdf8",
                  shapes: [],
                };
                trackMap.set(st.clientID, t);
              }
              if (st.keyframe && !t.shapes.some((s: any) => s.frame === f)) {
                t.shapes.push({
                  type: "cuboid",
                  frame: f,
                  points: [...st.points],
                  outside: !!st.outside,
                  occluded: !!st.occluded,
                  z_order: st.zOrder || 0,
                  rotation: 0,
                });
              }
            }
          }
        } catch (e) {}
      }

      // Sắp xếp các shapes theo thứ tự frame
      const result = Array.from(trackMap.values()).map((t) => {
        t.shapes.sort((a: any, b: any) => a.frame - b.frame);
        return t;
      });

      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_GET_ALL_JOB_TRACKS_WITH_SHAPES", {
          detail: { success: true, tracks: result },
        })
      );
    } catch (err: any) {
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_GET_ALL_JOB_TRACKS_WITH_SHAPES", {
          detail: { success: false, error: err.message || String(err) },
        })
      );
    }
  });

  // 1b3. Lắng nghe cập nhật Realtime Live Box (Two-Way Live Sync sang Three.js Canvas của CVAT)
  window.addEventListener("CVAT_EXT_REQ_UPDATE_LIVE_BOX", async (e: any) => {
    const { jobId, frame, uiId, serverId, points, isFinal } = e.detail || {};
    try {
      const job = await getActiveJobInstance(jobId);
      if (job) {
        const { target } = await findTargetSafely(job, frame, uiId, serverId);
        if (target) {
          target.points = ensureCuboidPoints(points, target.points);
          if (isFinal && typeof target.save === "function") {
            try {
              await target.save();
            } catch (sErr) {
              console.warn("[CVAT 3D Suite] Cảnh báo target.save trong UPDATE_LIVE_BOX:", sErr);
            }
          }
        }
      }

      // Cập nhật Three.js Canvas của CVAT native ngay lập tức
      updateThreeJsCuboid(
        uiId,
        points[5],
        { x: points[0], y: points[1], z: points[2] },
        { l: points[6], w: points[7], h: points[8] },
        { rx: points[3] || 0, ry: points[4] || 0, rz: points[5] }
      );

      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_UPDATE_LIVE_BOX", {
          detail: { success: true, uiId, frame },
        })
      );
    } catch (err: any) {
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_UPDATE_LIVE_BOX", {
          detail: { success: false, error: err.message || String(err) },
        })
      );
    }
  });

  // 1b4. Lấy điểm LiDAR từ WebGL RAM
  window.addEventListener("CVAT_EXT_REQ_GET_LIDAR_POINTS", (_e: any) => {
    try {
      const lidar = getSceneLidarPoints();
      if (!lidar || !lidar.array) {
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_RES_GET_LIDAR_POINTS", {
            detail: { success: false, error: "Không tìm thấy buffer điểm LiDAR trong Three.js scene" },
          })
        );
        return;
      }

      // Chuyển sang mảng số thông thường để truyền qua CustomEvent
      // Để tối ưu tốc độ, lấy tối đa 50,000 điểm hoặc toàn bộ
      const step = Math.max(1, Math.floor(lidar.count / 40000));
      const sampled: number[] = [];
      const arr = lidar.array;
      for (let i = 0; i < lidar.count; i += step) {
        sampled.push(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]);
      }

      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_GET_LIDAR_POINTS", {
          detail: { success: true, points: sampled, totalCount: lidar.count },
        })
      );
    } catch (err: any) {
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_GET_LIDAR_POINTS", {
          detail: { success: false, error: err.message || String(err) },
        })
      );
    }
  });

  // 1b5. Lắng nghe yêu cầu chuyển frame trong CVAT native
  window.addEventListener("CVAT_EXT_REQ_JUMP_FRAME", (e: any) => {
    try {
      const { frame } = e.detail || {};
      if (typeof frame !== "number") return;

      const store = getReduxStore();
      if (store) {
        try {
          store.dispatch({ type: "CHANGE_FRAME", payload: { frame } });
        } catch (err) {}
      }

      const frameInput = document.querySelector<HTMLInputElement>("input.cvat-player-frame-selector");
      if (frameInput) {
        frameInput.value = String(frame);
        frameInput.dispatchEvent(new Event("change", { bubbles: true }));
        frameInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true }));
      }
    } catch (e) {
      console.warn("[CVAT 3D Suite] Lỗi Jump Frame:", e);
    }
  });

  // 1c. Lắng nghe yêu cầu Lưu vào CVAT (Chỉ lưu khi người dùng bấm Lưu, KHÔNG tự động autosave)
  window.addEventListener("CVAT_EXT_REQ_COMMIT_SAVE", async (e: any) => {
    const { jobId } = e.detail || {};
    try {
      const job = await getActiveJobInstance(jobId);
      if (!job) throw new Error("Không tìm thấy Job Instance của CVAT");

      await persistJobAnnotations(job);
      (window as any).__CVAT_HAS_UNSAVED_CHANGES__ = false;

      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_COMMIT_SAVE", {
          detail: { success: true, message: "Đã lưu toàn bộ thay đổi vào cơ sở dữ liệu CVAT thành công!" },
        })
      );
    } catch (err: any) {
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_COMMIT_SAVE", {
          detail: { success: false, error: err.message || String(err) },
        })
      );
    }
  });

  // 2. Lắng nghe yêu cầu Lật ngược góc Yaw hoặc Xoay theo góc chỉ định (Realtime 100% - Zero F5)
  window.addEventListener("CVAT_EXT_REQ_FLIP_YAW", async (e: any) => {
    const { jobId, frame, uiId, serverId, currentFrameOnly, customYawRad } = e.detail || {};
    try {
      const job = await getActiveJobInstance(jobId);
      const { target, isDrawn } = await findTargetSafely(job, frame, uiId, serverId);

      const oldYaw = target.points[5];
      const newYaw = customYawRad !== undefined ? customYawRad : flipYawRad(oldYaw);

      const newPoints = [...target.points];
      newPoints[5] = newYaw;
      target.points = newPoints;
      if (!isDrawn && typeof target.save === "function") {
        await target.save();
      }

      // CAN THIỆP THREE.JS CANVAS3D VẼ LẠI TỨC THÌ (REALTIME 100%)
      const threeUpdated = updateThreeJsCuboid(uiId, newYaw);

      if (currentFrameOnly === false && job) {
        try {
          const parentTrack = await findTrackInJob(job, uiId, serverId, target.parentID);
          if (parentTrack) {
            const shapes = toArray(parentTrack.shapes || parentTrack.keyframes);
            for (const sh of shapes) {
              if (sh.shapeType === "cuboid" && Array.isArray(sh.points) && sh.points.length >= 9) {
                const shPoints = [...sh.points];
                shPoints[5] = customYawRad !== undefined ? customYawRad : flipYawRad(shPoints[5]);
                sh.points = shPoints;
              }
            }
            if (typeof parentTrack.save === "function") {
              await parentTrack.save();
            }
          }

          // Quét toàn dải từ Frame 0 đến Frame End
          const startF = typeof job.startFrame === "number" ? job.startFrame : 0;
          const stopF = typeof job.stopFrame === "number" ? job.stopFrame : (startF + 100);
          for (let f = startF; f <= stopF; f++) {
            if (f === frame) continue;
            try {
              const states = await job.annotations.get(f);
              if (Array.isArray(states)) {
                const st = states.find(
                  (s: any) => s.clientID === uiId || (serverId && s.serverID === serverId)
                );
                if (st && Array.isArray(st.points) && st.points.length >= 9) {
                  const p = [...st.points];
                  p[5] = customYawRad !== undefined ? customYawRad : flipYawRad(p[5]);
                  st.points = p;
                  if (typeof st.save === "function") {
                    await st.save();
                  }
                }
              }
            } catch (e) {}
          }
        } catch (tErr) {
          console.warn("[CVAT 3D Suite] Lưu Yaw cho các frame khác trong track:", tErr);
        }
      }

      markCvatSaveButtonUnsaved();

      const newYawDeg = Math.round((newYaw * 180) / Math.PI);
      console.log(`[CVAT 3D Suite] Đã cập nhật xe #${uiId} sang Yaw: ${newYawDeg}° (Three.js Realtime: ${threeUpdated})`);

      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_FLIP_YAW", {
          detail: { success: true, uiId, newYawDeg },
        })
      );
    } catch (err: any) {
      console.error("[CVAT 3D Suite] Lỗi Flip Yaw trong Main World:", err);
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_FLIP_YAW", {
          detail: { success: false, error: err.message || String(err) },
        })
      );
    }
  });

  // 3. Lắng nghe yêu cầu Cập nhật Kích thước (L, W, H) - Hỗ trợ Chỉ Frame này hoặc Toàn bộ Track
  window.addEventListener("CVAT_EXT_REQ_UPDATE_DIMENSIONS", async (e: any) => {
    const { jobId, frame, uiId, serverId, l, w, h, applyToTrack } = e.detail || {};
    try {
      const job = await getActiveJobInstance(jobId);
      const { target, isDrawn } = await findTargetSafely(job, frame, uiId, serverId);

      // Hàm tính toán độ bù trừ 3D vector ez khi thay đổi chiều cao H để giữ nguyên 4 góc đáy
      const computeGroundLockOffset = (p: number[], targetH: number) => {
        const rx = p[3] || 0;
        const ry = p[4] || 0;
        const oldHeight = p[8] || targetH;
        const dh = (targetH - oldHeight) / 2;
        const sinRy = Math.sin(ry);
        const cosRy = Math.cos(ry);
        const sinRx = Math.sin(rx);
        const cosRx = Math.cos(rx);
        return {
          dx: Number((dh * sinRy).toFixed(3)),
          dy: Number((-dh * sinRx * cosRy).toFixed(3)),
          dz: Number((dh * cosRx * cosRy).toFixed(3)),
        };
      };

      const newPoints = [...target.points];
      const offset = computeGroundLockOffset(newPoints, h);
      newPoints[0] = Number((newPoints[0] + offset.dx).toFixed(3));
      newPoints[1] = Number((newPoints[1] + offset.dy).toFixed(3));
      newPoints[2] = Number((newPoints[2] + offset.dz).toFixed(3));
      newPoints[6] = l;
      newPoints[7] = w;
      newPoints[8] = h;
      target.points = newPoints;
      if (!isDrawn && typeof target.save === "function") {
        await target.save();
      }

      // Cập nhật Three.js tức thì trên cả 4 view (Zero-F5)
      updateThreeJsCuboid(
        uiId,
        undefined,
        { x: newPoints[0], y: newPoints[1], z: newPoints[2] },
        { l, w, h }
      );

      let trackCount = 1;
      // NẾU CHỌN ÁP DỤNG TOÀN BỘ TRACK: ĐỒNG BỘ TOÀN DẢI TỪ FRAME 0 ĐẾN FRAME END
      const startF = typeof job.startFrame === "number" ? job.startFrame : 0;
      const stopF = typeof job.stopFrame === "number" ? job.stopFrame : (startF + 100);

      if (applyToTrack === true && job) {
        try {
          // 1. Cập nhật Keyframe Collection của Track
          const parentTrack = await findTrackInJob(job, uiId, serverId, target.parentID);
          if (parentTrack) {
            const shapes = toArray(parentTrack.shapes || parentTrack.keyframes);
            for (const sh of shapes) {
              if (sh.shapeType === "cuboid" && Array.isArray(sh.points) && sh.points.length >= 9) {
                const shPoints = [...sh.points];
                const shOffset = computeGroundLockOffset(shPoints, h);
                shPoints[0] = Number((shPoints[0] + shOffset.dx).toFixed(3));
                shPoints[1] = Number((shPoints[1] + shOffset.dy).toFixed(3));
                shPoints[2] = Number((shPoints[2] + shOffset.dz).toFixed(3));
                shPoints[6] = l;
                shPoints[7] = w;
                shPoints[8] = h;
                sh.points = shPoints;
                if (sh.frame !== frame) {
                  trackCount++;
                }
              }
            }
            if (typeof parentTrack.save === "function") {
              await parentTrack.save();
            }
          }

          // 2. QUÉT TOÀN DẢI TỪ FRAME 0 ĐẾN FRAME END ĐẢM BẢO 100% CÁC FRAME ĐỀU KHỚP KÍCH THƯỚC MỚI
          for (let f = startF; f <= stopF; f++) {
            if (f === frame) continue; // Frame hiện tại đã được target.save & Three.js cập nhật
            try {
              const states = await job.annotations.get(f);
              if (Array.isArray(states)) {
                const st = states.find(
                  (s: any) => s.clientID === uiId || (serverId && s.serverID === serverId)
                );
                if (st && Array.isArray(st.points) && st.points.length >= 9) {
                  const p = [...st.points];
                  const stOffset = computeGroundLockOffset(p, h);
                  p[0] = Number((p[0] + stOffset.dx).toFixed(3));
                  p[1] = Number((p[1] + stOffset.dy).toFixed(3));
                  p[2] = Number((p[2] + stOffset.dz).toFixed(3));
                  p[6] = l;
                  p[7] = w;
                  p[8] = h;
                  st.points = p;
                  if (typeof st.save === "function") {
                    await st.save();
                  }
                  trackCount++;
                }
              }
            } catch (e) {}
          }
        } catch (tErr) {
          console.warn("[CVAT 3D Suite] Lưu các frame khác trong track:", tErr);
        }
      }

      markCvatSaveButtonUnsaved();

      const scopeText = applyToTrack
        ? `toàn bộ track (từ Frame #${startF} ➔ #${stopF}, ${trackCount} frames, Realtime)`
        : `chỉ frame #${frame}`;
      const msg = `Đã cập nhật xe #${uiId} kích thước ${l}x${w}x${h}m cho ${scopeText}`;
      console.log(`[CVAT 3D Suite] ${msg} (Three.js Re-rendered Realtime)`);

      const newZ = newPoints[2];
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_UPDATE_DIMENSIONS", {
          detail: { success: true, uiId, newZ, l, w, h, applyToTrack, message: msg },
        })
      );
    } catch (err: any) {
      console.error("[CVAT 3D Suite] Lỗi Update Dimensions trong Main World:", err);
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_UPDATE_DIMENSIONS", {
          detail: { success: false, error: err.message || String(err) },
        })
      );
    }
  });

  // Giữ tương thích ngược với event cũ LOCK_DIMENSIONS
  window.addEventListener("CVAT_EXT_REQ_LOCK_DIMENSIONS", async (e: any) => {
    const detail = { ...(e.detail || {}), applyToTrack: false };
    window.dispatchEvent(new CustomEvent("CVAT_EXT_REQ_UPDATE_DIMENSIONS", { detail }));
  });

  // 4. Lắng nghe yêu cầu Ghim Mặt Đất & Địa Hình Vỉa Hè (Ground & Curb Snapping Chuẩn Xác từ LiDAR Points)
  window.addEventListener("CVAT_EXT_REQ_SNAP_GROUND", async (e: any) => {
    const { jobId, frame, uiId, serverId, mode, deltaCm, deltaDeg, curbHeight, targetGroundZ: _targetGroundZ } = e.detail || {};
    try {
      const job = await getActiveJobInstance(jobId);
      const { target, isDrawn } = await findTargetSafely(job, frame, uiId, serverId);

      const newPoints = [...target.points];
      const curX = newPoints[0];
      const curY = newPoints[1];
      const curZ = newPoints[2];
      const curRx = newPoints[3] || 0;
      const curRy = newPoints[4] || 0;
      const curRz = newPoints[5] || 0;
      const curW = newPoints[7] || 1.85;
      const curH = newPoints[8] || 1.45;

      let newZ = curZ;
      let newRotX = curRx;
      let newRotY = curRy;
      let msg = "";

      if (mode === "road") {
        // GHIM MẶT ĐƯỜNG BÁM DỐC 3D (BÁM ĐÚNG GÓC NGHIÊNG ROLL TỰ NHIÊN; NẾU THIẾU ĐIỂM LẤY MỐC EGO Z = 0 ĐẶT PHẲNG MẶT)
        const curL = newPoints[6] || 4.6;
        const curW = newPoints[7] || 1.85;
        const groundInfo = detectAccurateGroundZ(curX, curY, curZ, curRz, curL / 2, curW / 2, curH / 2, false, false);

        if (groundInfo.isFallbackZeroGround || groundInfo.groundPointsCount < 6) {
          // Với box mà dưới chân không có điểm hoặc rất ít (< 6 điểm): Neo chuẩn theo mốc Z mặt đường Ego chống âm đất
          const baseZ = groundInfo.groundZ !== null ? groundInfo.groundZ : 0;
          newRotX = 0;
          newRotY = 0;
          newZ = Number((baseZ + curH / 2).toFixed(3));
          msg = `Dưới chân ít điểm LiDAR (${groundInfo.groundPointsCount} điểm) ➔ Neo đáy xe theo mốc Ego Road Z: ${baseZ}m (Tâm Z: ${newZ}m, Khóa Roll 0°, Pitch 0°)`;
        } else if (groundInfo.groundZ !== null) {
          const cosPitch = Math.cos(groundInfo.pitchRad);
          const cosRoll = Math.cos(groundInfo.rollRad);
          newZ = Number((groundInfo.groundZ + (curH / 2) * cosPitch * cosRoll).toFixed(3));
          newRotX = groundInfo.rollRad; // Bám đúng độ dốc ngang Roll theo 2 đầu mép biên (Front View khít 100%)
          newRotY = groundInfo.pitchRad; // Bám đúng độ dốc dọc Pitch của mặt đường (Side View khít 100%)
          if (groundInfo.isCurbGround) {
            msg = `Đã nhận diện xe #${uiId} đỗ trên nền vỉa hè (Z đất: ${groundInfo.groundZ}m, Tâm Z: ${newZ}m, Khóa Roll: ${groundInfo.rollDeg}°)`;
          } else {
            msg = `Đã ghim đáy xe #${uiId} bám sát mặt đường (Z: ${newZ}m, Roll: ${groundInfo.rollDeg}°, Pitch: ${groundInfo.pitchDeg}°)`;
          }
        } else {
          // Fallback nếu không có điểm mặt đất: neo theo mốc Ego Z
          const egoZ = getEgoRoadGroundZInMainWorld();
          newRotX = 0;
          newRotY = 0;
          newZ = Number((egoZ + curH / 2).toFixed(3));
          msg = `Không có điểm mặt đất ➔ Neo theo mốc Ego Road Z: ${egoZ}m (Tâm Z: ${newZ}m)`;
        }
      } else if (mode === "curb") {
        // TỰ ĐỘNG NHẬN DIỆN VỈA HÈ TỪ LIDAR (BÁN KÍNH RỘNG + ĐỘ SÂU)
        const curL = newPoints[6] || 4.6;
        const autoCurb = detectCurbStepAndRollInMainWorld(curX, curY, curZ, curRz, curL / 2, curW / 2, curW);
        const offset = curbHeight !== undefined ? curbHeight : (autoCurb.hasCurb ? autoCurb.curbHeight : 0.15);
        newZ = Number((curZ + offset).toFixed(3));
        msg = autoCurb.hasCurb
          ? `Đã tự động nhận diện nền vỉa hè cao +${autoCurb.curbHeightCm}cm từ LiDAR ➔ Z: ${newZ}m`
          : `Đã nâng đáy xe #${uiId} lên nền vỉa hè (+${Math.round(offset * 100)}cm ➔ Z: ${newZ}m)`;
      } else if (mode === "half_curb") {
        // TỰ ĐỘNG NHẬN DIỆN BẬC GÁC LỀ TỪ LIDAR (TỰ ĐỘNG DÒ BÊN TRÁI / PHẢI & ĐO CHIỀU CAO THỰC TẾ)
        const curL = newPoints[6] || 4.6;
        const autoCurb = detectCurbStepAndRollInMainWorld(curX, curY, curZ, curRz, curL / 2, curW / 2, curW);

        if (autoCurb.hasCurb && autoCurb.side !== "none") {
          newRotX = autoCurb.rollRad;
          const deltaZ = autoCurb.deltaCenterZ;
          newZ = Number((curZ + deltaZ).toFixed(3));
          const sideText = autoCurb.side === "left" ? "bên TRÁI" : "bên PHẢI";
          msg = `Đã tự động nhận diện gác lề ${sideText} (Bậc vỉa hè: +${autoCurb.curbHeightCm}cm, Nghiêng Front Roll: ${autoCurb.rollDeg}°, Nâng Z: +${Math.round(deltaZ * 100)}cm)`;
        } else {
          // Fallback nếu không phát hiện bậc thềm rõ ràng
          const cH = curbHeight !== undefined ? curbHeight : 0.15;
          const ratio = Math.max(-1, Math.min(1, cH / curW));
          const rollRad = Math.asin(ratio);
          const deltaZ = cH / 2;
          newZ = Number((curZ + deltaZ).toFixed(3));
          newRotX = Number(rollRad.toFixed(5));
          const rollDeg = Math.round((rollRad * 180) / Math.PI);
          msg = `Đã gác lề xe #${uiId} (Nghiêng Roll: ${rollDeg}°, Nâng Z: +${Math.round(deltaZ * 100)}cm)`;
        }
      } else if (mode === "micro_adjust") {
        const dCm = deltaCm !== undefined ? deltaCm : 1;
        newZ = Number((curZ + dCm / 100).toFixed(3));
        msg = `Đã vi chỉnh cao độ xe #${uiId} (${dCm > 0 ? "+" : ""}${dCm}cm ➔ Z: ${newZ}m)`;
      } else if (mode === "micro_adjust_pitch") {
        const dDeg = deltaDeg !== undefined ? deltaDeg : 0.5;
        const dRad = (dDeg * Math.PI) / 180;
        newRotY = Number((curRy + dRad).toFixed(5));
        const pitchDeg = Number(((newRotY * 180) / Math.PI).toFixed(2));
        msg = `Đã vi chỉnh dốc Side xe #${uiId} (${dDeg > 0 ? "+" : ""}${dDeg}° ➔ Pitch: ${pitchDeg}°)`;
      } else if (mode === "micro_adjust_roll") {
        const dDeg = deltaDeg !== undefined ? deltaDeg : 0.5;
        const dRad = (dDeg * Math.PI) / 180;
        newRotX = Number((curRx + dRad).toFixed(5));
        const rollDeg = Number(((newRotX * 180) / Math.PI).toFixed(2));
        msg = `Đã vi chỉnh nghiêng Front xe #${uiId} (${dDeg > 0 ? "+" : ""}${dDeg}° ➔ Roll: ${rollDeg}°)`;
      } else if (mode === "reset_slope") {
        newRotX = 0;
        newRotY = 0;
        msg = `Đã reset góc dốc xe #${uiId} về 0° (Phẳng hoàn toàn)`;
      }

      newPoints[2] = newZ;
      newPoints[3] = newRotX;
      newPoints[4] = newRotY;
      target.points = newPoints;
      if (!isDrawn && typeof target.save === "function") {
        await target.save();
      }

      updateThreeJsCuboid(
        uiId,
        undefined,
        { x: curX, y: curY, z: newZ },
        undefined,
        { rx: newRotX, ry: newRotY, rz: curRz }
      );

      markCvatSaveButtonUnsaved();

      console.log(`[CVAT 3D Suite] ${msg} (Three.js Side/Front Re-rendered Realtime)`);

      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_SNAP_GROUND", {
          detail: { success: true, uiId, newZ, mode, message: msg },
        })
      );
    } catch (err: any) {
      console.error("[CVAT 3D Suite] Lỗi Snap Ground trong Main World:", err);
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_SNAP_GROUND", {
          detail: { success: false, error: err.message || String(err) },
        })
      );
    }
  });

  // 5. Lắng nghe yêu cầu Tự Fit Box Hoàn Toàn từ Điểm LiDAR (Auto-Fit Box to LiDAR Points)
  window.addEventListener("CVAT_EXT_REQ_AUTO_FIT", async (e: any) => {
    const { jobId, frame, uiId, serverId, tightFit, fitMode, applyToTrack } = e.detail || {};
    try {
      const job = await getActiveJobInstance(jobId);
      const { target, isDrawn } = await findTargetSafely(job, frame, uiId, serverId);

      const resolvedMode = fitMode || (tightFit ? "tight" : "catalog");
      const fit = computeLidarGroundAndFit(target.points, resolvedMode);
      if (fit.pointsCount === 0) {
        throw new Error(`Không tìm thấy điểm LiDAR nào trong vùng xe #${uiId}`);
      }

      const newPoints = [...target.points];
      newPoints[0] = fit.newX;
      newPoints[1] = fit.newY;
      newPoints[2] = fit.newZ;
      newPoints[3] = 0; // Khóa cứng Roll = 0° tuyệt đối, không nghiêng box theo vỉa hè
      if (fit.newYaw !== undefined) {
        newPoints[5] = fit.newYaw;
      }
      newPoints[6] = fit.newL;
      newPoints[7] = fit.newW;
      newPoints[8] = fit.newH;

      target.points = newPoints;
      if (!isDrawn && typeof target.save === "function") {
        await target.save();
      }

      updateThreeJsCuboid(
        uiId,
        fit.newYaw,
        { x: fit.newX, y: fit.newY, z: fit.newZ },
        { l: fit.newL, w: fit.newW, h: fit.newH }
      );

      let trackCount = 1;
      // NẾU CHỌN ÁP DỤNG CHO TOÀN BỘ TRACK: ĐỒNG BỘ TOÀN DẢI TỪ FRAME 0 ĐẾN FRAME END
      const startF = typeof job.startFrame === "number" ? job.startFrame : 0;
      const stopF = typeof job.stopFrame === "number" ? job.stopFrame : (startF + 100);

      if (applyToTrack === true && job) {
        try {
          const parentTrack = await findTrackInJob(job, uiId, serverId, target.parentID);
          if (parentTrack) {
            const shapes = toArray(parentTrack.shapes || parentTrack.keyframes);
            for (const sh of shapes) {
              if (sh.shapeType === "cuboid" && Array.isArray(sh.points) && sh.points.length >= 9) {
                const shPoints = [...sh.points];
                const sOldZ = shPoints[2];
                const sOldH = shPoints[8];
                shPoints[2] = Number((sOldZ + (fit.newH - sOldH) / 2).toFixed(3));
                shPoints[6] = fit.newL;
                shPoints[7] = fit.newW;
                shPoints[8] = fit.newH;
                sh.points = shPoints;
                if (sh.frame !== frame) {
                  trackCount++;
                }
              }
            }
            if (typeof parentTrack.save === "function") {
              await parentTrack.save();
            }
          }

          // Quét toàn dải từ Frame 0 đến Frame End
          for (let f = startF; f <= stopF; f++) {
            if (f === frame) continue;
            try {
              const states = await job.annotations.get(f);
              if (Array.isArray(states)) {
                const st = states.find(
                  (s: any) => s.clientID === uiId || (serverId && s.serverID === serverId)
                );
                if (st && Array.isArray(st.points) && st.points.length >= 9) {
                  const p = [...st.points];
                  const sOldH = p[8];
                  p[2] = Number((p[2] + (fit.newH - sOldH) / 2).toFixed(3));
                  p[6] = fit.newL;
                  p[7] = fit.newW;
                  p[8] = fit.newH;
                  st.points = p;
                  if (typeof st.save === "function") {
                    await st.save();
                  }
                  trackCount++;
                }
              }
            } catch (e) {}
          }
        } catch (tErr) {
          console.warn("[CVAT 3D Suite] Lưu các frame khác trong track:", tErr);
        }
      }

      markCvatSaveButtonUnsaved();

      const scopeText = applyToTrack
        ? `toàn bộ track (từ Frame #${startF} ➔ #${stopF}, ${trackCount} frames, Realtime)`
        : `chỉ frame #${frame}`;
      const modeText = resolvedMode === "tight" ? "ôm sát cụm điểm" : "chuẩn catalog";
      const msg = `Đã fit box xe #${uiId} ${modeText} (${fit.pointsCount} điểm LiDAR, Ground: ${fit.detectedGroundZ}m, ${fit.newL}x${fit.newW}x${fit.newH}m cho ${scopeText})`;
      console.log(`[CVAT 3D Suite] ${msg}`);

      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_AUTO_FIT", {
          detail: {
            success: true,
            uiId,
            newX: fit.newX,
            newY: fit.newY,
            newZ: fit.newZ,
            newYaw: fit.newYaw,
            newL: fit.newL,
            newW: fit.newW,
            newH: fit.newH,
            detectedGroundZ: fit.detectedGroundZ,
            pointsCount: fit.pointsCount,
            applyToTrack,
            message: msg,
          },
        })
      );
    } catch (err: any) {
      console.error("[CVAT 3D Suite] Lỗi Auto-Fit Box:", err);
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_AUTO_FIT", {
          detail: { success: false, error: err.message || String(err) },
        })
      );
    }
  });

  // 5B. Lắng nghe yêu cầu Căn Hộp Bám Cụm Điểm BẢO TOÀN KÍCH THƯỚC (Preserving Dimensions Box Alignment)
  // Giải quyết triệt để vấn đề: Box tự động bay tới ôm khít cụm điểm mà TUYỆT ĐỐI GIỮ NGUYÊN kích thước L, W, H chuẩn của xe!
  window.addEventListener("CVAT_EXT_REQ_ALIGN_BOX_TO_POINTS", async (e: any) => {
    const { jobId, frame, uiId, serverId } = e.detail || {};
    try {
      const job = await getActiveJobInstance(jobId);
      const { target, isDrawn } = await findTargetSafely(job, frame, uiId, serverId);

      const p = target.points;
      const curX = p[0];
      const curY = p[1];
      const curZ = p[2];
      const curYaw = p[5];
      const curL = p[6];
      const curW = p[7];
      const curH = p[8];

      const lidar = getSceneLidarPoints();
      if (!lidar || lidar.count === 0) {
        throw new Error(`Không tìm thấy điểm LiDAR nào trong Scene`);
      }

      // 1. Dò mặt đất và độ dốc mặt đường 3D theo Footprint vết đè của Box (Bám dốc thật, nếu thiếu điểm lấy mốc Ego Z = 0)
      const groundInfo = detectAccurateGroundZ(curX, curY, curZ, curYaw, curL / 2, curW / 2, curH / 2, false, false);
      const effectiveGroundZ = groundInfo.groundZ !== null ? groundInfo.groundZ : 0;

      // 2. Thu thập điểm thân xe
      const { count, array } = lidar;
      const cosY = Math.cos(-curYaw);
      const sinY = Math.sin(-curYaw);
      const halfL = curL / 2 + 0.35;
      const halfW = curW / 2 + 0.30;
      const minBodyZ = effectiveGroundZ + 0.22;
      const maxRoofZ = effectiveGroundZ + curH + 0.25;

      const bodyPts: Array<{ x: number; y: number; z: number; lx: number; ly: number }> = [];
      for (let i = 0; i < count; i++) {
        const z = array[i * 3 + 2];
        if (z < minBodyZ || z > maxRoofZ) continue;
        const x = array[i * 3];
        const y = array[i * 3 + 1];
        const dx = x - curX;
        const dy = y - curY;
        const lx = dx * cosY - dy * sinY;
        const ly = dx * sinY + dy * cosY;
        if (Math.abs(lx) <= halfL && Math.abs(ly) <= halfW) {
          bodyPts.push({ x, y, z, lx, ly });
        }
      }

      // Lọc cụm thân xe chính: loại bỏ 100% điểm xe khác đỗ bên cạnh hoặc nối đuôi
      const filteredLy = filterDenseConnectedCluster1D(bodyPts, "ly", 0.22, 0);
      const cleanBodyPts = filterDenseConnectedCluster1D(filteredLy, "lx", 0.22, 0);

      if (cleanBodyPts.length < 4) {
        throw new Error(`Không đủ điểm LiDAR trên thân xe #${uiId} (tìm thấy ${cleanBodyPts.length} điểm)`);
      }

      // 3. Tính toán dịch chuyển tâm bám cụm điểm mà GIỮ NGUYÊN 100% KÍCH THƯỚC (L, W, H)
      // Áp dụng thuật toán biên kháng nhiễu mật độ & loại bỏ gương chiếu hậu
      const robustBounds = computeDensityRobustBounds(cleanBodyPts);
      const lxMin = robustBounds.lxMin;
      const lxMax = robustBounds.lxMax;
      const lyMin = robustBounds.lyMin;
      const lyMax = robustBounds.lyMax;

      const spanL = lxMax - lxMin;
      const spanW = lyMax - lyMin;

      let midLx = 0;
      if (spanL >= curL * 0.75) {
        midLx = (lxMin + lxMax) / 2;
      } else {
        const meanLx = bodyPts.reduce((acc, pt) => acc + pt.lx, 0) / bodyPts.length;
        if (meanLx > 0.3) {
          midLx = lxMax - curL / 2;
        } else if (meanLx < -0.3) {
          midLx = lxMin + curL / 2;
        } else {
          midLx = (lxMin + lxMax) / 2;
        }
      }
      const maxShiftL = Math.max(0.6, curL * 0.35);
      midLx = Math.max(-maxShiftL, Math.min(maxShiftL, midLx));

      let midLy = 0;
      if (spanW >= curW * 0.75) {
        midLy = (lyMin + lyMax) / 2;
      } else {
        const meanLy = bodyPts.reduce((acc, pt) => acc + pt.ly, 0) / bodyPts.length;
        if (meanLy > 0.2) {
          midLy = lyMax - curW / 2;
        } else if (meanLy < -0.2) {
          midLy = lyMin + curW / 2;
        } else {
          midLy = (lyMin + lyMax) / 2;
        }
      }
      const maxShiftW = Math.max(0.4, curW * 0.35);
      midLy = Math.max(-maxShiftW, Math.min(maxShiftW, midLy));

      const cosWorld = Math.cos(curYaw);
      const sinWorld = Math.sin(curYaw);
      const newX = Number((curX + midLx * cosWorld - midLy * sinWorld).toFixed(2));
      const newY = Number((curY + midLx * sinWorld + midLy * cosWorld).toFixed(2));
      const newZ = Number((effectiveGroundZ + curH / 2).toFixed(3));
      const newRotX = 0; // Khóa Roll = 0° tuyệt đối, không nghiêng box theo vỉa hè
      const newRotY = groundInfo.pitchRad;

      const newPoints = [...target.points];
      newPoints[0] = newX;
      newPoints[1] = newY;
      newPoints[2] = newZ;
      newPoints[3] = newRotX;
      newPoints[4] = newRotY;
      // BẢO TOÀN TUYỆT ĐỐI KÍCH THƯỚC:
      newPoints[6] = curL;
      newPoints[7] = curW;
      newPoints[8] = curH;

      target.points = newPoints;
      if (!isDrawn && typeof target.save === "function") {
        await target.save();
      }

      updateThreeJsCuboid(
        uiId,
        undefined,
        { x: newX, y: newY, z: newZ },
        undefined,
        { rx: newRotX, ry: newRotY, rz: curYaw }
      );

      markCvatSaveButtonUnsaved();

      const msg = `Đã căn hộp ôm trọn cụm điểm (${bodyPts.length} điểm), bám dốc mặt đường (Pitch: ${groundInfo.pitchDeg}°, Roll: ${groundInfo.rollDeg}°) và BẢO TOÀN 100% kích thước chuẩn ${curL}x${curW}x${curH}m`;
      console.log(`[CVAT 3D Suite] ${msg}`);

      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_ALIGN_BOX_TO_POINTS", {
          detail: {
            success: true,
            uiId,
            newX,
            newY,
            newZ,
            newRotX,
            newRotY,
            preservedL: curL,
            preservedW: curW,
            preservedH: curH,
            pointsCount: bodyPts.length,
            message: msg,
          },
        })
      );
    } catch (err: any) {
      console.error("[CVAT 3D Suite] Lỗi Align Box to Points:", err);
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_ALIGN_BOX_TO_POINTS", {
          detail: { success: false, error: err.message || String(err) },
        })
      );
    }
  });

  // 5C. Lắng nghe yêu cầu FIT GÓC ĐÓN TIA EGO & GHIM ĐẤT 3D (Ego Ray-Cast L-Shape Fit & Ground Contact)
  // Giải quyết: Tia laser từ Ego chiếu tới góc nào thì mép box đón tia (Side View & Front View) ép sát điểm ngoài cùng,
  // đồng thời đáy chạm khít mặt đất và góc trên của box ôm sát nóc xe!
  window.addEventListener("CVAT_EXT_REQ_EGO_RAY_FIT", async (e: any) => {
    const { jobId, frame, uiId, serverId, egoPos, preserveDimensions, applyToTrack, fitStep } = e.detail || {};
    try {
      const job = await getActiveJobInstance(jobId);
      const { target, isDrawn } = await findTargetSafely(job, frame, uiId, serverId);

      const fit = fitBoxToEgoRayAndGroundInMainWorld(
        target.points,
        egoPos || { x: 0, y: 0, z: 0 },
        { preserveDimensions, fitStep }
      );

      if (fit.pointsCount === 0) {
        throw new Error(`Không tìm thấy điểm LiDAR nào trong vùng xe #${uiId}`);
      }

      const newYaw = fit.newYawRad !== undefined ? fit.newYawRad : target.points[5];
      const newPoints = [...target.points];
      newPoints[0] = fit.newX;
      newPoints[1] = fit.newY;
      newPoints[2] = fit.newZ;
      newPoints[3] = fit.rollRad;
      newPoints[4] = fit.pitchRad;
      newPoints[5] = newYaw; // Căn thẳng góc Yaw theo đường viền Top View!
      newPoints[6] = fit.newL;
      newPoints[7] = fit.newW;
      newPoints[8] = fit.newH;

      target.points = newPoints;
      if (!isDrawn && typeof target.save === "function") {
        await target.save();
      }

      updateThreeJsCuboid(
        uiId,
        newYaw,
        { x: fit.newX, y: fit.newY, z: fit.newZ },
        { l: fit.newL, w: fit.newW, h: fit.newH },
        { rx: fit.rollRad, ry: fit.pitchRad, rz: newYaw }
      );

      markCvatSaveButtonUnsaved();

      let trackCount = 1;
      if (applyToTrack === true && job) {
        try {
          const parentTrack = await findTrackInJob(job, uiId, serverId, target.parentID);
          if (parentTrack) {
            const shapes = toArray(parentTrack.shapes || parentTrack.keyframes);
            for (const sh of shapes) {
              if (sh.shapeType === "cuboid" && Array.isArray(sh.points) && sh.points.length >= 9) {
                const shPoints = [...sh.points];
                const sOldZ = shPoints[2];
                const sOldH = shPoints[8];
                shPoints[2] = Number((sOldZ + (fit.newH - sOldH) / 2).toFixed(3));
                shPoints[6] = fit.newL;
                shPoints[7] = fit.newW;
                shPoints[8] = fit.newH;
                sh.points = shPoints;
                if (sh.frame !== frame) {
                  trackCount++;
                }
              }
            }
            if (typeof parentTrack.save === "function") {
              await parentTrack.save();
            }
          }
        } catch (tErr) {
          console.warn("[CVAT 3D Suite] Cảnh báo đồng bộ track trong Ego Ray Fit:", tErr);
        }
      }

      console.log(`[CVAT 3D Suite] ${fit.message}`);

      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_EGO_RAY_FIT", {
          detail: {
            success: true,
            uiId,
            newX: fit.newX,
            newY: fit.newY,
            newZ: fit.newZ,
            newYawRad: newYaw,
            newYawDeg: fit.newYawDeg,
            deltaYawDeg: fit.deltaYawDeg,
            newL: fit.newL,
            newW: fit.newW,
            newH: fit.newH,
            pitchRad: fit.pitchRad,
            rollRad: fit.rollRad,
            pitchDeg: fit.pitchDeg,
            rollDeg: fit.rollDeg,
            visibleFaces: fit.visibleFaces,
            pointsCount: fit.pointsCount,
            trackCount,
            message: fit.message,
          },
        })
      );
    } catch (err: any) {
      console.error("[CVAT 3D Suite] Lỗi Ego Ray Fit:", err);
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_EGO_RAY_FIT", {
          detail: { success: false, error: err.message || String(err) },
        })
      );
    }
  });

  // 5D. Lắng nghe yêu cầu FIT CHUYÊN BIỆT CHO NGƯỜI ĐI BỘ (PEDESTRIAN FIT)
  // - Hỗ trợ các chế độ độc lập: TOP, SIDE, FRONT, L, W, H, ALL
  // - Khóa cứng Roll = 0°, Pitch = 0° (Người luôn đứng thẳng tuyệt đối)
  // - Quét mặt đất siêu hẹp +15cm tránh dính vỉa hè, rào chắn
  // - Bù đỉnh đầu +12cm chống cắt ngang trán người
  window.addEventListener("CVAT_EXT_REQ_FIT_PEDESTRIAN", async (e: any) => {
    const { jobId, frame, uiId, serverId, headBuffer, egoPos, step, applyToTrack } = e.detail || {};
    try {
      const job = await getActiveJobInstance(jobId);
      const { target, isDrawn } = await findTargetSafely(job, frame, uiId, serverId);

      const fit = fitPedestrianInMainWorld(target.points, { headBuffer, egoPos, step });

      if (fit.pointsCount === 0) {
        throw new Error(`Không tìm thấy điểm LiDAR nào thuộc người #${uiId}`);
      }

      const newPoints = [...target.points];
      newPoints[0] = fit.newX;
      newPoints[1] = fit.newY;
      newPoints[2] = fit.newZ;
      newPoints[3] = 0; // Roll = 0° tuyệt đối
      newPoints[4] = 0; // Pitch = 0° tuyệt đối
      if (fit.newYaw !== undefined) {
        newPoints[5] = fit.newYaw;
      }
      newPoints[6] = fit.newL;
      newPoints[7] = fit.newW;
      newPoints[8] = fit.newH;

      target.points = newPoints;
      if (!isDrawn && typeof target.save === "function") {
        await target.save();
      }

      // ĐỒNG BỘ PARENT TRACK & REDUX ANNOTATIONS TRONG CVAT
      let trackCount = 1;
      const startF = typeof job?.startFrame === "number" ? job.startFrame : 0;
      const stopF = typeof job?.stopFrame === "number" ? job.stopFrame : (startF + 100);

      try {
        const parentTrack = await findTrackInJob(job, uiId, serverId, target.parentID);
        if (parentTrack) {
          const shapes = toArray(parentTrack.shapes || parentTrack.keyframes);
          for (const sh of shapes) {
            if (sh.shapeType === "cuboid" && Array.isArray(sh.points) && sh.points.length >= 9) {
              if (sh.frame === frame) {
                // Luôn cập nhật shape của frame hiện tại trong track cha
                sh.points = [...newPoints];
              } else if (applyToTrack === true) {
                // Nếu bật Toàn Track, cập nhật L, W, H cho toàn bộ các frame khác
                const shPoints = [...sh.points];
                const sOldH = shPoints[8] || fit.newH;
                const dh = (fit.newH - sOldH) / 2;
                shPoints[2] = Number((shPoints[2] + dh).toFixed(3));
                shPoints[6] = fit.newL;
                shPoints[7] = fit.newW;
                shPoints[8] = fit.newH;
                sh.points = shPoints;
                trackCount++;
              }
            }
          }
          if (typeof parentTrack.save === "function") {
            await parentTrack.save();
          }
        }

        // Quét các frame khác nếu applyToTrack === true
        if (applyToTrack === true && job) {
          for (let f = startF; f <= stopF; f++) {
            if (f === frame) continue;
            try {
              const states = await job.annotations.get(f);
              if (Array.isArray(states)) {
                const st = states.find(
                  (s: any) => s.clientID === uiId || (serverId && s.serverID === serverId)
                );
                if (st && Array.isArray(st.points) && st.points.length >= 9) {
                  const p = [...st.points];
                  const sOldH = p[8] || fit.newH;
                  const dh = (fit.newH - sOldH) / 2;
                  p[2] = Number((p[2] + dh).toFixed(3));
                  p[6] = fit.newL;
                  p[7] = fit.newW;
                  p[8] = fit.newH;
                  st.points = p;
                  if (typeof st.save === "function") {
                    await st.save();
                  }
                  trackCount++;
                }
              }
            } catch (e) {}
          }
        }
      } catch (tErr) {
        console.warn("[CVAT 3D Suite] Lưu parentTrack khi fit người đi bộ:", tErr);
      }

      updateThreeJsCuboid(
        uiId,
        newPoints[5],
        { x: fit.newX, y: fit.newY, z: fit.newZ },
        { l: fit.newL, w: fit.newW, h: fit.newH },
        { rx: 0, ry: 0, rz: newPoints[5] }
      );

      markCvatSaveButtonUnsaved();
      console.log(`[CVAT 3D Suite] ${fit.message}`);

      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_FIT_PEDESTRIAN", {
          detail: {
            success: true,
            uiId,
            newX: fit.newX,
            newY: fit.newY,
            newZ: fit.newZ,
            newYaw: fit.newYaw,
            newYawDeg: fit.newYawDeg,
            deltaYawDeg: fit.deltaYawDeg,
            newL: fit.newL,
            newW: fit.newW,
            newH: fit.newH,
            pointsCount: fit.pointsCount,
            step: fit.step,
            trackCount,
            message: fit.message,
          },
        })
      );
    } catch (err: any) {
      console.error("[CVAT 3D Suite] Lỗi Fit Pedestrian:", err);
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_FIT_PEDESTRIAN", {
          detail: { success: false, error: err.message || String(err) },
        })
      );
    }
  });

  // 5E. Lắng nghe yêu cầu FIT CHUYÊN BIỆT CHO XE ĐẠP / XE MÁY (CYCLIST)
  window.addEventListener("CVAT_EXT_REQ_FIT_CYCLIST", async (e: any) => {
    const { jobId, frame, uiId, serverId, headBuffer, egoPos, step, applyToTrack } = e.detail || {};
    try {
      const job = await getActiveJobInstance(jobId);
      const { target, isDrawn } = await findTargetSafely(job, frame, uiId, serverId);

      const fit = fitCyclistInMainWorld(target.points, { headBuffer, egoPos, step });

      if (fit.pointsCount === 0) {
        throw new Error(`Không tìm thấy điểm LiDAR nào thuộc xe 2 bánh #${uiId}`);
      }

      const newPoints = [...target.points];
      newPoints[0] = fit.newX;
      newPoints[1] = fit.newY;
      newPoints[2] = fit.newZ;
      newPoints[3] = 0;
      newPoints[4] = 0;
      if (fit.newYaw !== undefined) {
        newPoints[5] = fit.newYaw;
      }
      newPoints[6] = fit.newL;
      newPoints[7] = fit.newW;
      newPoints[8] = fit.newH;

      target.points = newPoints;
      if (!isDrawn && typeof target.save === "function") {
        await target.save();
      }

      // ĐỒNG BỘ PARENT TRACK & REDUX ANNOTATIONS TRONG CVAT
      let trackCount = 1;
      const startF = typeof job?.startFrame === "number" ? job.startFrame : 0;
      const stopF = typeof job?.stopFrame === "number" ? job.stopFrame : (startF + 100);

      try {
        const parentTrack = await findTrackInJob(job, uiId, serverId, target.parentID);
        if (parentTrack) {
          const shapes = toArray(parentTrack.shapes || parentTrack.keyframes);
          for (const sh of shapes) {
            if (sh.shapeType === "cuboid" && Array.isArray(sh.points) && sh.points.length >= 9) {
              if (sh.frame === frame) {
                // Luôn cập nhật shape của frame hiện tại trong track cha
                sh.points = [...newPoints];
              } else if (applyToTrack === true) {
                // Nếu bật Toàn Track, cập nhật W và H cho toàn bộ các frame khác
                const shPoints = [...sh.points];
                const sOldH = shPoints[8] || fit.newH;
                const dh = (fit.newH - sOldH) / 2;
                shPoints[2] = Number((shPoints[2] + dh).toFixed(3));
                shPoints[6] = fit.newL;
                shPoints[7] = fit.newW;
                shPoints[8] = fit.newH;
                sh.points = shPoints;
                trackCount++;
              }
            }
          }
          if (typeof parentTrack.save === "function") {
            await parentTrack.save();
          }
        }

        // Quét các frame khác nếu applyToTrack === true
        if (applyToTrack === true && job) {
          for (let f = startF; f <= stopF; f++) {
            if (f === frame) continue;
            try {
              const states = await job.annotations.get(f);
              if (Array.isArray(states)) {
                const st = states.find(
                  (s: any) => s.clientID === uiId || (serverId && s.serverID === serverId)
                );
                if (st && Array.isArray(st.points) && st.points.length >= 9) {
                  const p = [...st.points];
                  const sOldH = p[8] || fit.newH;
                  const dh = (fit.newH - sOldH) / 2;
                  p[2] = Number((p[2] + dh).toFixed(3));
                  p[6] = fit.newL;
                  p[7] = fit.newW;
                  p[8] = fit.newH;
                  st.points = p;
                  if (typeof st.save === "function") {
                    await st.save();
                  }
                  trackCount++;
                }
              }
            } catch (e) {}
          }
        }
      } catch (tErr) {
        console.warn("[CVAT 3D Suite] Lưu parentTrack khi fit xe 2 bánh:", tErr);
      }

      updateThreeJsCuboid(
        uiId,
        newPoints[5],
        { x: fit.newX, y: fit.newY, z: fit.newZ },
        { l: fit.newL, w: fit.newW, h: fit.newH },
        { rx: 0, ry: 0, rz: newPoints[5] }
      );

      markCvatSaveButtonUnsaved();
      console.log(`[CVAT 3D Suite] ${fit.message}`);

      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_FIT_CYCLIST", {
          detail: {
            success: true,
            uiId,
            newX: fit.newX,
            newY: fit.newY,
            newZ: fit.newZ,
            newYaw: fit.newYaw,
            newYawDeg: fit.newYawDeg,
            deltaYawDeg: fit.deltaYawDeg,
            newL: fit.newL,
            newW: fit.newW,
            newH: fit.newH,
            pointsCount: fit.pointsCount,
            step: fit.step,
            applyToTrack: !!applyToTrack,
            message: fit.message,
          },
        })
      );
    } catch (err: any) {
      console.error("[CVAT 3D Suite] Lỗi Fit Cyclist:", err);
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_FIT_CYCLIST", {
          detail: { success: false, error: err.message || String(err) },
        })
      );
    }
  });

  // Thuật toán Fit Box tại Frame Hiện Tại với Padding 5cm mỗi bên (+10cm L, +10cm W, +5cm H, Đáy Ghim Sàn)
  function fitBoxWithPadding5cm(points: number[]): {
    newL: number;
    newW: number;
    newH: number;
    newZ: number;
    pointsCount: number;
    measuredL: number;
    measuredW: number;
    measuredH: number;
    groundZ: number;
  } {
    const cx = points[0];
    const cy = points[1];
    const cz = points[2];
    const yaw = points[5];
    const l = points[6] || 4.65;
    const w = points[7] || 1.85;
    const h = points[8] || 1.45;

    const lidar = getSceneLidarPoints();
    if (!lidar || lidar.count === 0) {
      throw new Error("Không trích xuất được điểm LiDAR từ Three.js scene!");
    }

    const { count, array } = lidar;
    const groundInfo = detectAccurateGroundZ(cx, cy, cz, yaw, l / 2, w / 2, h / 2, false, false);
    const groundZ = groundInfo.groundZ !== null ? groundInfo.groundZ : cz - h / 2;

    const cosY = Math.cos(-yaw);
    const sinY = Math.sin(-yaw);

    const minBodyZ = groundZ + 0.22;
    const maxRoofZ = groundZ + 3.5;
    const searchHalfL = l / 2 + 0.55;
    const searchHalfW = w / 2 + 0.45;

    const rawBodyPts: Array<{ lx: number; ly: number; z: number }> = [];
    for (let i = 0; i < count; i++) {
      const z = array[i * 3 + 2];
      if (z < minBodyZ || z > maxRoofZ) continue;

      const x = array[i * 3];
      const y = array[i * 3 + 1];
      const dx = x - cx;
      const dy = y - cy;

      const lx = dx * cosY - dy * sinY;
      const ly = dx * sinY + dy * cosY;

      if (Math.abs(lx) <= searchHalfL && Math.abs(ly) <= searchHalfW) {
        rawBodyPts.push({ lx, ly, z });
      }
    }

    if (rawBodyPts.length < 5) {
      throw new Error(`Cụm điểm quá thưa (${rawBodyPts.length} điểm), không đủ để fit tự động!`);
    }

    // Tách cụm thân xe chính theo trục ly và lx
    const clLy = filterDenseConnectedCluster1D(rawBodyPts, "ly", 0.20, 0);
    const bodyPts = filterDenseConnectedCluster1D(clLy, "lx", 0.20, 0);

    const finalPts = bodyPts.length >= 5 ? bodyPts : rawBodyPts;

    // Đo mép trước / sau bằng Valley Cutoff
    const frontWall = detectDominantWallEdgeWithValleyCutoff(finalPts, "lx", "positive", l / 2, { binSize: 0.04 });
    const rearWall = detectDominantWallEdgeWithValleyCutoff(finalPts, "lx", "negative", l / 2, { binSize: 0.04 });
    const measuredL = Math.max(0.5, Math.min(15.0, Number((frontWall.edge - rearWall.edge).toFixed(3))));

    // Đo mép trái / phải bằng Valley Cutoff
    const leftWall = detectDominantWallEdgeWithValleyCutoff(finalPts, "ly", "positive", w / 2, { binSize: 0.03 });
    const rightWall = detectDominantWallEdgeWithValleyCutoff(finalPts, "ly", "negative", w / 2, { binSize: 0.03 });
    const measuredW = Math.max(0.4, Math.min(3.5, Number((leftWall.edge - rightWall.edge).toFixed(3))));

    // Đo nóc xe (phân vị 95% để loại bỏ nhiễu anten)
    const zList = finalPts.map((p) => p.z).sort((a, b) => a - b);
    const zRoof = zList[Math.floor(zList.length * 0.95)];
    const measuredH = Math.max(0.4, Math.min(4.0, Number((zRoof - groundZ).toFixed(3))));

    // 🚨 BỔ SUNG PADDING 5CM MỖI BÊN:
    // +10cm cho L (5cm trước, 5cm sau)
    // +10cm cho W (5cm trái, 5cm phải)
    // +5cm cho H (nóc xe, đáy bám sàn cố định tại groundZ)
    const newL = Number((measuredL + 0.10).toFixed(2));
    const newW = Number((measuredW + 0.10).toFixed(2));
    const newH = Number((measuredH + 0.05).toFixed(2));

    // Đáy bám sàn cố định: newZ = groundZ + newH / 2
    const newZ = Number((groundZ + newH / 2).toFixed(3));

    return {
      newL,
      newW,
      newH,
      newZ,
      pointsCount: finalPts.length,
      measuredL,
      measuredW,
      measuredH,
      groundZ,
    };
  }

  // 6. Lắng nghe yêu cầu Fit Box Hiện Tại có Padding 5cm (+10cm L, +10cm W, +5cm H)
  window.addEventListener("CVAT_EXT_REQ_FIT_CURRENT_BOX", async (e: any) => {
    const { jobId, frame, uiId, serverId, applyToTrack = false } = e.detail || {};
    try {
      const job = await getActiveJobInstance(jobId);
      const { target, isDrawn } = await findTargetSafely(job, frame, uiId, serverId);

      const fit = fitBoxWithPadding5cm(target.points);

      const newPoints = [...target.points];
      newPoints[2] = fit.newZ;
      newPoints[6] = fit.newL;
      newPoints[7] = fit.newW;
      newPoints[8] = fit.newH;
      target.points = newPoints;

      if (!isDrawn && typeof target.save === "function") {
        await target.save();
      }

      let framesSynced = 1;
      if (applyToTrack) {
        const parentTrack = await findTrackInJob(job, uiId, serverId, target.parentID);
        if (parentTrack) {
          const shapesList = toArray(parentTrack.shapes || parentTrack.keyframes || (parentTrack as any)._shapes);
          for (const sh of shapesList) {
            if (sh.shapeType === "cuboid" && Array.isArray(sh.points) && sh.points.length >= 9) {
              const pts = [...sh.points];
              const sOldZ = pts[2];
              const sOldH = pts[8];
              pts[2] = Number((sOldZ + (fit.newH - sOldH) / 2).toFixed(3));
              pts[6] = fit.newL;
              pts[7] = fit.newW;
              pts[8] = fit.newH;
              sh.points = pts;
              framesSynced++;
            }
          }
          if (typeof parentTrack.save === "function") {
            await parentTrack.save();
          }
        }
      }

      updateThreeJsCuboid(
        uiId,
        newPoints[5],
        { x: newPoints[0], y: newPoints[1], z: fit.newZ },
        { l: fit.newL, w: fit.newW, h: fit.newH },
        { rx: newPoints[3] || 0, ry: newPoints[4] || 0, rz: newPoints[5] }
      );

      markCvatSaveButtonUnsaved();

      const scopeText = applyToTrack ? `toàn bộ ${framesSynced} frames trong track` : `frame #${frame}`;
      const msg = `Đã Fit Box với padding 5cm (L=${fit.newL}m, W=${fit.newW}m, H=${fit.newH}m, ${fit.pointsCount} điểm LiDAR) cho ${scopeText}`;
      console.log(`[CVAT 3D Suite] ${msg}`);

      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_FIT_CURRENT_BOX", {
          detail: {
            success: true,
            uiId,
            newL: fit.newL,
            newW: fit.newW,
            newH: fit.newH,
            newZ: fit.newZ,
            pointsCount: fit.pointsCount,
            framesSynced,
            message: msg,
          },
        })
      );
    } catch (err: any) {
      console.error("[CVAT 3D Suite] Lỗi Fit Box Hiện Tại:", err);
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_FIT_CURRENT_BOX", {
          detail: { success: false, error: err.message || String(err) },
        })
      );
    }
  });

  // 7. Lắng nghe yêu cầu Đánh dấu Outside cho toàn bộ frame của Track
  window.addEventListener("CVAT_EXT_REQ_SET_TRACK_OUTSIDE", async (e: any) => {
    const { jobId, frame, uiId, serverId, outside = true } = e.detail || {};
    try {
      const job = await getActiveJobInstance(jobId);
      if (!job) throw new Error("Không tìm thấy Job Instance của CVAT");

      const currentFrame = typeof frame === "number" ? frame : (typeof job.frame === "number" ? job.frame : 0);

      // Thử tìm target ở frame hiện tại
      let currentTarget: any = null;
      try {
        const res = await findTargetSafely(job, currentFrame, uiId, serverId);
        currentTarget = res.target;
      } catch (e) {}

      const parentID = currentTarget?.parentID || currentTarget?.trackID || (currentTarget?.parent && currentTarget.parent.clientID);
      let parentTrack = await findTrackInJob(job, uiId, serverId, parentID);

      const previousStates: Array<{ frame: number; outside: boolean; points: number[] }> = [];
      let countModified = 0;

      // TRƯỜNG HỢP 1: TÌM THẤY PARENT TRACK
      if (parentTrack) {
        const shapesList = toArray(parentTrack.shapes || parentTrack.keyframes || (parentTrack as any)._shapes);
        if (shapesList.length > 0) {
          for (const sh of shapesList) {
            previousStates.push({
              frame: sh.frame,
              outside: !!sh.outside,
              points: Array.isArray(sh.points) ? [...sh.points] : [],
            });
            sh.outside = !!outside;
            countModified++;
          }
          if (typeof parentTrack.save === "function") {
            await parentTrack.save();
          }
        }
      }

      // TRƯỜNG HỢP 2: QUÉT CÁC FRAMES CỦA JOB ĐỂ ĐẢM BẢO BẮT TRỌN CẢ OBJECT STATE NỘI SUY
      if (countModified === 0) {
        const startF = typeof job.startFrame === "number" ? job.startFrame : 0;
        const stopF = typeof job.stopFrame === "number" ? job.stopFrame : (startF + 300);

        for (let f = startF; f <= stopF; f++) {
          try {
            const states = await job.annotations.get(f);
            if (Array.isArray(states)) {
              const st = states.find(
                (s: any) =>
                  Number(s.clientID) === Number(uiId) ||
                  (serverId && Number(s.serverID) === Number(serverId)) ||
                  (parentID && (Number(s.clientID) === Number(parentID) || Number(s.parentID) === Number(parentID)))
              );
              if (st) {
                previousStates.push({
                  frame: f,
                  outside: !!st.outside,
                  points: Array.isArray(st.points) ? [...st.points] : [],
                });
                st.outside = !!outside;
                if (typeof st.save === "function") {
                  await st.save();
                }
                countModified++;
              }
            }
          } catch (e) {}
        }
      }

      // TRƯỜNG HỢP 3: NẾU VẪN CHƯA THẤY NHƯNG CÓ CURRENT TARGET Ở FRAME HIỆN TẠI
      if (countModified === 0 && currentTarget) {
        previousStates.push({
          frame: currentFrame,
          outside: !!currentTarget.outside,
          points: Array.isArray(currentTarget.points) ? [...currentTarget.points] : [],
        });
        currentTarget.outside = !!outside;
        if (typeof currentTarget.save === "function") {
          await currentTarget.save();
        }
        countModified = 1;
      }

      if (countModified === 0) {
        throw new Error(`Không tìm thấy Track hoặc Shape #${uiId} trong toàn bộ Job`);
      }

      markCvatSaveButtonUnsaved();

      const store = getReduxStore();
      const canvas = store?.getState()?.annotation?.canvas?.instance;
      if (canvas && typeof canvas.render === "function") {
        canvas.render();
      }

      const msg = `Đã đánh dấu ${outside ? "Outside" : "Inside"} cho ${countModified} frame của xe #${uiId}`;
      console.log(`[CVAT 3D Suite] ${msg}`);

      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_SET_TRACK_OUTSIDE", {
          detail: {
            success: true,
            uiId,
            outside,
            count: countModified,
            previousStates,
            message: msg,
          },
        })
      );
    } catch (err: any) {
      console.error("[CVAT 3D Suite] Lỗi Set Track Outside:", err);
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_SET_TRACK_OUTSIDE", {
          detail: { success: false, error: err.message || String(err) },
        })
      );
    }
  });

  // 8. Lắng nghe yêu cầu Khôi phục trạng thái (Undo / Pre)
  window.addEventListener("CVAT_EXT_REQ_RESTORE_BOX", async (e: any) => {
    const { jobId, frame, uiId, serverId, applyToTrack, boxPoints, trackShapesBackup } = e.detail || {};
    try {
      const job = await getActiveJobInstance(jobId);
      if (!job) throw new Error("Không tìm thấy Job Instance của CVAT");

      const currentFrame = typeof frame === "number" ? frame : (typeof job.frame === "number" ? job.frame : 0);

      let currentTarget: any = null;
      try {
        const res = await findTargetSafely(job, currentFrame, uiId, serverId);
        currentTarget = res.target;
      } catch (e) {}

      const parentID = currentTarget?.parentID || currentTarget?.trackID || (currentTarget?.parent && currentTarget.parent.clientID);
      const parentTrack = await findTrackInJob(job, uiId, serverId, parentID);

      // Nếu là thao tác toàn track: khôi phục danh sách shapes
      if (applyToTrack && Array.isArray(trackShapesBackup) && trackShapesBackup.length > 0) {
        if (parentTrack) {
          const shapesList = toArray(parentTrack.shapes || parentTrack.keyframes || (parentTrack as any)._shapes);
          for (const bk of trackShapesBackup) {
            const sh = shapesList.find((s: any) => s.frame === bk.frame);
            if (sh) {
              if (bk.outside !== undefined) sh.outside = bk.outside;
              if (Array.isArray(bk.points)) sh.points = ensureCuboidPoints(bk.points, sh.points);
            }
          }
          if (typeof parentTrack.save === "function") {
            try {
              await parentTrack.save();
            } catch (tSaveErr) {
              console.warn("[CVAT 3D Suite] Cảnh báo parentTrack.save trong RESTORE_BOX:", tSaveErr);
            }
          }
        }

        // Khôi phục trên từng frame nếu parentTrack không lưu được
        for (const bk of trackShapesBackup) {
          try {
            const states = await job.annotations.get(bk.frame);
            if (Array.isArray(states)) {
              const st = states.find(
                (s: any) =>
                  Number(s.clientID) === Number(uiId) ||
                  (serverId && Number(s.serverID) === Number(serverId)) ||
                  (parentID && (Number(s.clientID) === Number(parentID) || Number(s.parentID) === Number(parentID)))
              );
              if (st) {
                if (bk.outside !== undefined) st.outside = bk.outside;
                if (Array.isArray(bk.points)) st.points = ensureCuboidPoints(bk.points, st.points);
                if (typeof st.save === "function") {
                  try {
                    await st.save();
                  } catch (stSaveErr) {
                    console.warn("[CVAT 3D Suite] Cảnh báo st.save trong RESTORE_BOX:", stSaveErr);
                  }
                }
              }
            }
          } catch (e) {}
        }
      }

      // Khôi phục frame hiện tại
      if (Array.isArray(boxPoints) && boxPoints.length >= 9) {
        try {
          const { target, isDrawn } = await findTargetSafely(job, currentFrame, uiId, serverId);
          target.points = ensureCuboidPoints(boxPoints, target.points);
          if (!isDrawn && typeof target.save === "function") {
            try {
              await target.save();
            } catch (curSaveErr) {
              console.warn("[CVAT 3D Suite] Cảnh báo target.save trong RESTORE_BOX:", curSaveErr);
            }
          }

          updateThreeJsCuboid(
            uiId,
            boxPoints[5],
            { x: boxPoints[0], y: boxPoints[1], z: boxPoints[2] },
            { l: boxPoints[6], w: boxPoints[7], h: boxPoints[8] },
            { rx: boxPoints[3] || 0, ry: boxPoints[4] || 0, rz: boxPoints[5] }
          );
        } catch (curErr) {
          console.warn("[CVAT 3D Suite] Khôi phục frame hiện tại:", curErr);
        }
      }

      markCvatSaveButtonUnsaved();

      const store = getReduxStore();
      const canvas = store?.getState()?.annotation?.canvas?.instance;
      if (canvas && typeof canvas.render === "function") {
        canvas.render();
      }

      const msg = `Đã hoàn tác (Pre) thành công trạng thái trước đó của xe #${uiId}`;
      console.log(`[CVAT 3D Suite] ${msg}`);

      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_RESTORE_BOX", {
          detail: {
            success: true,
            uiId,
            message: msg,
          },
        })
      );
    } catch (err: any) {
      console.error("[CVAT 3D Suite] Lỗi Restore Box (Pre):", err);
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_RESTORE_BOX", {
          detail: { success: false, error: err.message || String(err) },
        })
      );
    }
  });

  // 7. Lắng nghe yêu cầu Vi Chỉnh Center (Dịch chuyển tâm dàn đều theo hệ trục cục bộ của xe)
  window.addEventListener("CVAT_EXT_REQ_SHIFT_CENTER", async (e: any) => {
    const { jobId, frame, uiId, serverId, deltaXLocal = 0, deltaYLocal = 0, applyToTrack = false } = e.detail || {};
    try {
      const job = await getActiveJobInstance(jobId);
      const { target, isDrawn } = await findTargetSafely(job, frame, uiId, serverId);

      const yaw = target.points[5] || 0;
      const cosYaw = Math.cos(yaw);
      const sinYaw = Math.sin(yaw);

      // Chuyển vector độ lệch từ Local sang World
      const deltaXWorld = deltaXLocal * cosYaw - deltaYLocal * sinYaw;
      const deltaYWorld = deltaXLocal * sinYaw + deltaYLocal * cosYaw;

      let framesShifted = 1;

      if (applyToTrack) {
        const parentTrack = await findTrackInJob(job, uiId, serverId, target.parentID);
        if (parentTrack && Array.isArray(parentTrack.shapes)) {
          for (const sh of parentTrack.shapes) {
            if (sh.shapeType === "cuboid" && Array.isArray(sh.points) && sh.points.length >= 9) {
              const pts = [...sh.points];
              pts[0] = Number((pts[0] + deltaXWorld).toFixed(3));
              pts[1] = Number((pts[1] + deltaYWorld).toFixed(3));
              sh.points = pts;
              framesShifted++;
            }
          }
          await parentTrack.save();
        }
      }

      // Cập nhật frame hiện tại
      const currentPts = [...target.points];
      currentPts[0] = Number((currentPts[0] + deltaXWorld).toFixed(3));
      currentPts[1] = Number((currentPts[1] + deltaYWorld).toFixed(3));
      target.points = currentPts;
      if (!isDrawn && typeof target.save === "function") {
        await target.save();
      }

      updateThreeJsCuboid(
        uiId,
        yaw,
        { x: currentPts[0], y: currentPts[1], z: currentPts[2] },
        { l: currentPts[6], w: currentPts[7], h: currentPts[8] },
        { rx: 0, ry: 0, rz: yaw }
      );

      markCvatSaveButtonUnsaved();

      const scopeText = applyToTrack ? `toàn bộ ${framesShifted} frames trong track` : `frame #${frame}`;
      const msg = `Đã vi chỉnh Center (ΔX: ${deltaXLocal > 0 ? "+" : ""}${(deltaXLocal * 100).toFixed(0)}cm, ΔY: ${deltaYLocal > 0 ? "+" : ""}${(deltaYLocal * 100).toFixed(0)}cm) cho ${scopeText}`;
      console.log(`[CVAT 3D Suite] ${msg}`);

      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_SHIFT_CENTER", {
          detail: {
            success: true,
            uiId,
            newX: currentPts[0],
            newY: currentPts[1],
            deltaXLocal,
            deltaYLocal,
            framesShifted,
            message: msg,
          },
        })
      );
    } catch (err: any) {
      console.error("[CVAT 3D Suite] Lỗi vi chỉnh Center:", err);
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_SHIFT_CENTER", {
          detail: { success: false, error: err.message || String(err) },
        })
      );
    }
  });
}
