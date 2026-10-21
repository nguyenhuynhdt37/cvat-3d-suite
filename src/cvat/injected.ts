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

  // Thuật toán Annular Ring Ground Detection & 3D Slope Fitting (Pitch & Roll)
  function detectAccurateGroundZ(
    cx: number,
    cy: number,
    cz: number,
    yaw: number,
    halfL: number,
    halfW: number,
    isInitialBox: boolean = false
  ): {
    groundZ: number | null;
    pitchRad: number;
    rollRad: number;
    pitchDeg: number;
    rollDeg: number;
    groundPointsCount: number;
  } {
    const lidar = getSceneLidarPoints();
    if (!lidar || lidar.count === 0) {
      return { groundZ: null, pitchRad: 0, rollRad: 0, pitchDeg: 0, rollDeg: 0, groundPointsCount: 0 };
    }

    const { count, array } = lidar;
    const cosY = Math.cos(-yaw);
    const sinY = Math.sin(-yaw);

    const groundPts: Array<{ lx: number; ly: number; z: number }> = [];
    const outerL = isInitialBox ? 3.5 : halfL + 1.3;
    const outerW = isInitialBox ? 2.8 : halfW + 1.3;
    const innerL = isInitialBox ? 0.3 : Math.max(0.4, halfL - 0.2);
    const innerW = isInitialBox ? 0.3 : Math.max(0.3, halfW - 0.2);

    // Trần cao độ mặt đất: Mặt đường luôn nằm thấp hơn tâm xe cz + 0.35m
    const maxGroundZ = cz + 0.35;

    for (let i = 0; i < count; i++) {
      const z = array[i * 3 + 2];
      if (z > maxGroundZ) continue;

      const x = array[i * 3];
      const y = array[i * 3 + 1];
      const dx = x - cx;
      const dy = y - cy;

      const lx = dx * cosY - dy * sinY;
      const ly = dx * sinY + dy * cosY;

      // Nằm trong vành đai mở rộng và KHÔNG nằm trong vùng lõi gầm xe bị che khuất
      const inOuter = Math.abs(lx) <= outerL && Math.abs(ly) <= outerW;
      const inCore = !isInitialBox && Math.abs(lx) < innerL && Math.abs(ly) < innerW;

      if (inOuter && !inCore) {
        groundPts.push({ lx, ly, z });
      }
    }

    if (groundPts.length < 5) {
      // Fallback: Quét toàn bộ điểm lân cận thấp hơn maxGroundZ
      for (let i = 0; i < count; i++) {
        const z = array[i * 3 + 2];
        if (z > maxGroundZ) continue;
        const dx = array[i * 3] - cx;
        const dy = array[i * 3 + 1] - cy;
        if (dx * dx + dy * dy <= outerL * outerL) {
          const lx = dx * cosY - dy * sinY;
          const ly = dx * sinY + dy * cosY;
          groundPts.push({ lx, ly, z });
        }
      }
    }

    if (groundPts.length < 4) {
      // Fallback mở rộng bán kính 2.5m cho các xe ở xa cảm biến LiDAR
      const extL = outerL + 1.8;
      const extW = outerW + 1.8;
      for (let i = 0; i < count; i++) {
        const z = array[i * 3 + 2];
        if (z > maxGroundZ) continue;
        const dx = array[i * 3] - cx;
        const dy = array[i * 3 + 1] - cy;
        const lx = dx * cosY - dy * sinY;
        const ly = dx * sinY + dy * cosY;
        if (Math.abs(lx) <= extL && Math.abs(ly) <= extW) {
          groundPts.push({ lx, ly, z });
        }
      }
    }

    if (groundPts.length < 3) {
      return { groundZ: null, pitchRad: 0, rollRad: 0, pitchDeg: 0, rollDeg: 0, groundPointsCount: groundPts.length };
    }

    // 1. Phân tích Histogram 2cm để tìm đỉnh cao độ mặt đường thực tế dày đặc nhất (loại bỏ 100% tia phản xạ ngầm)
    const allZ = groundPts.map((p) => p.z).sort((a, b) => a - b);
    const minZ = allZ[0];
    const maxZ = allZ[allZ.length - 1];
    const binSize = 0.02; // 2cm
    const binCount = Math.ceil((maxZ - minZ) / binSize) + 1;
    const bins = new Float32Array(binCount);

    for (const z of allZ) {
      const idx = Math.min(binCount - 1, Math.max(0, Math.floor((z - minZ) / binSize)));
      bins[idx] += 1;
    }

    let bestBin = 0;
    let bestScore = -1;
    for (let i = 0; i < binCount; i++) {
      const score = bins[i] + 0.5 * ((bins[i - 1] || 0) + (bins[i + 1] || 0));
      if (score > bestScore) {
        bestScore = score;
        bestBin = i;
      }
    }

    const peakZ = minZ + (bestBin + 0.5) * binSize;
    // Lọc các điểm thuộc lớp mặt đường lộ thiên quanh đỉnh (±6cm)
    const roadSurfacePts = groundPts.filter((p) => Math.abs(p.z - peakZ) <= 0.06);
    const fitPts = roadSurfacePts.length >= 4 ? roadSurfacePts : groundPts;

    // 2. Hồi quy tuyến tính bình phương tối thiểu (OLS): z = a * lx + b * ly + c0
    let sumLx = 0;
    let sumLy = 0;
    let sumZ = 0;
    const N = fitPts.length;

    for (const p of fitPts) {
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

    for (const p of fitPts) {
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
    let c0 = peakZ; // Mặc định là đỉnh cao độ mặt đường

    if (Math.abs(det) > 1e-4) {
      const a = (covLxZ * varLy - covLyZ * covLxLy) / det;
      const b = (covLyZ * varLx - covLxZ * covLxLy) / det;

      // Giới hạn độ dốc đường thực tế: Pitch tối đa 20°, Roll tối đa 25°
      // Trong Three.js hệ Z-Up, quay quanh trục Y có z' = -x*sin(ry), do đó pitchRad = -atan(a) để nâng mũi xe theo đường dốc
      const maxPitchRad = (20 * Math.PI) / 180;
      const maxRollRad = (25 * Math.PI) / 180;

      pitchRad = Math.max(-maxPitchRad, Math.min(maxPitchRad, -Math.atan(a)));
      rollRad = Math.max(-maxRollRad, Math.min(maxRollRad, Math.atan(b)));

      // Cao độ mặt đất tại tâm xe (lx = 0, ly = 0)
      c0 = meanZ - a * meanLx - b * meanLy;
    }

    return {
      groundZ: Number(c0.toFixed(3)),
      pitchRad: Number(pitchRad.toFixed(5)),
      rollRad: Number(rollRad.toFixed(5)),
      pitchDeg: Number(((pitchRad * 180) / Math.PI).toFixed(2)),
      rollDeg: Number(((rollRad * 180) / Math.PI).toFixed(2)),
      groundPointsCount: fitPts.length,
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

    // 2. Dò cao độ mặt đất thực tế bằng thuật toán Annular Ring Ground Detection & 3D Slope
    const groundInfo = detectAccurateGroundZ(cx, cy, cz, yaw, l / 2, w / 2, isInitialBox);
    const detectedGroundZ = groundInfo.groundZ;
    const effectiveGroundZ = detectedGroundZ !== null ? detectedGroundZ : cz - h / 2;

    // 3. Thu thập các điểm thuộc vùng lân cận chiếc xe
    let cosY = Math.cos(-yaw);
    let sinY = Math.sin(-yaw);
    const candidateBodyPts: Array<{ x: number; y: number; z: number }> = [];

    // Trần cao độ để loại bỏ cành cây, dây điện, biển báo phía trên cao
    const maxRoofZ = effectiveGroundZ + 2.7;
    // Đáy cao độ: cao hơn mặt đất ít nhất 3cm để loại bỏ các điểm mặt đường
    const minBodyZ = effectiveGroundZ + 0.03;

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
      const localBodyPts: Array<{ lx: number; ly: number; z: number }> = [];
      for (const p of candidateBodyPts) {
        const dx = p.x - cx;
        const dy = p.y - cy;
        const lx = dx * cosY - dy * sinY;
        const ly = dx * sinY + dy * cosY;
        localBodyPts.push({ lx, ly, z: p.z });
      }

      const allLx = localBodyPts.map((p) => p.lx).sort((a, b) => a - b);
      const allLy = localBodyPts.map((p) => p.ly).sort((a, b) => a - b);
      const allZ = localBodyPts.map((p) => p.z).sort((a, b) => a - b);

      // Lọc 1% outlier cạnh biên để lấy chính xác mép ngoài của các mặt xe
      const pMinIdx = Math.max(0, Math.floor(localBodyPts.length * 0.01));
      const pMaxIdx = Math.min(localBodyPts.length - 1, Math.floor(localBodyPts.length * 0.99));

      const lxMin = allLx[pMinIdx];
      const lxMax = allLx[pMaxIdx];
      const lyMin = allLy[pMinIdx];
      const lyMax = allLy[pMaxIdx];
      const zTop = allZ[pMaxIdx];

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

    // 1. Tìm trực tiếp trong collection.tracks của cvat-core
    const tracks = getJobTrackCollection(job);
    if (tracks && tracks.length > 0) {
      let found = tracks.find((t: any) => t.clientID === uiId);
      if (found) return found;

      if (serverId) {
        found = tracks.find((t: any) => t.serverID === serverId);
        if (found) return found;
      }

      if (parentID) {
        found = tracks.find((t: any) => t.clientID === parentID);
        if (found) return found;
      }

      found = tracks.find((t: any) => {
        const shList = toArray(t.shapes || t.keyframes);
        return shList.some((sh: any) => sh.clientID === uiId);
      });
      if (found) return found;
    }

    // 2. Thử qua API job.annotations.get(null, true)
    if (job.annotations) {
      try {
        const allObjects = await job.annotations.get(null, true);
        if (Array.isArray(allObjects)) {
          let found = allObjects.find((t: any) => t.clientID === uiId);
          if (found) return found;
          if (serverId) {
            found = allObjects.find((t: any) => t.serverID === serverId);
            if (found) return found;
          }
          if (parentID) {
            found = allObjects.find((t: any) => t.clientID === parentID);
            if (found) return found;
          }
        }
      } catch (e) {}

      // 3. Thử qua API job.annotations.get()
      try {
        const defaultTracks = await job.annotations.get();
        if (Array.isArray(defaultTracks)) {
          let found = defaultTracks.find((t: any) => t.clientID === uiId);
          if (found) return found;
          if (serverId) {
            found = defaultTracks.find((t: any) => t.serverID === serverId);
            if (found) return found;
          }
          if (parentID) {
            found = defaultTracks.find((t: any) => t.clientID === parentID);
            if (found) return found;
          }
        }
      } catch (e) {}
    }

    return null;
  }

  // Tự động đồng bộ và lưu vĩnh viễn lên cơ sở dữ liệu CVAT bằng cvat-core API & AutoSave UI Header Trigger
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
  function setupCanvasAutoSelect(): void {
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

    // LẮNG NGHE REDUX STORE SUB SCRIBE ĐỂ PHÁT HIỆN TỨC THÌ KHI VỪA VẼ XONG BOX MỚI
    try {
      const store = getReduxStore();
      if (store) {
        let prevActiveId: any = null;
        let prevStatesLen = 0;

        store.subscribe(() => {
          try {
            const anno = store.getState()?.annotation;
            const curActiveId = anno?.annotations?.activatedStateClientID;
            const curStatesLen = anno?.annotations?.states?.length || 0;

            if (curActiveId !== prevActiveId) {
              prevActiveId = curActiveId;
              if (curActiveId !== null && curActiveId !== undefined) {
                const details = extractObjectDetails(Number(curActiveId));
                window.dispatchEvent(
                  new CustomEvent("CVAT_EXT_RES_OBJECT_ACTIVATED", {
                    detail: { clientId: Number(curActiveId), details },
                  })
                );
              }
            }

            if (curStatesLen !== prevStatesLen) {
              prevStatesLen = curStatesLen;
              // Thông báo cho extension cập nhật lại danh sách Dropdown
              window.dispatchEvent(new CustomEvent("CVAT_EXT_RES_FRAME_TRACKS_DIRTY"));
            }
          } catch (err) {}
        });
      }
    } catch (sErr) {}

    // Lắng nghe yêu cầu kích hoạt đối tượng từ Extension
    window.addEventListener("CVAT_EXT_REQ_ACTIVATE_OBJECT", (e: any) => {
      const { clientId } = e.detail || {};
      try {
        const store = getReduxStore();
        const canvas = store?.getState()?.annotation?.canvas?.instance;
        if (canvas && typeof canvas.activate === "function") {
          canvas.activate(clientId);
          if (typeof canvas.render === "function") {
            canvas.render();
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
          target.points = [...points];
          if (isFinal && typeof target.save === "function") {
            await target.save();
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

      (window as any).__CVAT_HAS_UNSAVED_CHANGES__ = true;

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

      (window as any).__CVAT_HAS_UNSAVED_CHANGES__ = true;

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
    const { jobId, frame, uiId, serverId, mode, deltaCm, deltaDeg, curbHeight, targetGroundZ } = e.detail || {};
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
        // GHIM MẶT ĐƯỜNG BÁM DỐC 3D (ANNULAR RING + PITCH & ROLL FITTING)
        const curL = newPoints[6] || 4.6;
        const curW = newPoints[7] || 1.85;
        const groundInfo = detectAccurateGroundZ(curX, curY, curZ, curRz, curL / 2, curW / 2, false);
        if (groundInfo.groundZ !== null) {
          const cosSlope = Math.cos(groundInfo.rollRad) * Math.cos(groundInfo.pitchRad);
          newZ = Number((groundInfo.groundZ + (curH / 2) * cosSlope).toFixed(3));
          newRotX = groundInfo.rollRad;
          newRotY = groundInfo.pitchRad;
          msg = `Đã ghim đáy xe #${uiId} bám dốc mặt đường (Z: ${newZ}m, Dốc dọc Pitch: ${groundInfo.pitchDeg}°, Dốc ngang Roll: ${groundInfo.rollDeg}°)`;
        } else {
          const roadBottomZ = targetGroundZ !== undefined ? targetGroundZ : (curZ - curH / 2);
          newZ = Number((roadBottomZ + curH / 2).toFixed(3));
          newRotX = 0;
          newRotY = 0;
          msg = `Đã ghim đáy xe #${uiId} sát mặt đường (Z: ${newZ}m)`;
        }
      } else if (mode === "curb") {
        const offset = curbHeight !== undefined ? curbHeight : 0.15;
        newZ = Number((curZ + offset).toFixed(3));
        msg = `Đã ghim đáy xe #${uiId} lên nền vỉa hè (+${Math.round(offset * 100)}cm ➔ Z: ${newZ}m)`;
      } else if (mode === "half_curb") {
        const cH = curbHeight !== undefined ? curbHeight : 0.15;
        const ratio = Math.max(-1, Math.min(1, cH / curW));
        const rollRad = Math.asin(ratio);
        const deltaZ = cH / 2;
        newZ = Number((curZ + deltaZ).toFixed(3));
        newRotX = Number(rollRad.toFixed(5));
        const rollDeg = Math.round((rollRad * 180) / Math.PI);
        msg = `Đã gác lề xe #${uiId} (Nghiêng Roll: ${rollDeg}°, Nâng Z: +${Math.round(deltaZ * 100)}cm)`;
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

      (window as any).__CVAT_HAS_UNSAVED_CHANGES__ = true;

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

      (window as any).__CVAT_HAS_UNSAVED_CHANGES__ = true;

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

      // 1. Dò mặt đất và độ dốc mặt đường 3D
      const groundInfo = detectAccurateGroundZ(curX, curY, curZ, curYaw, curL / 2, curW / 2, false);
      const effectiveGroundZ = groundInfo.groundZ !== null ? groundInfo.groundZ : curZ - curH / 2;

      // 2. Thu thập điểm thân xe
      const { count, array } = lidar;
      const cosY = Math.cos(-curYaw);
      const sinY = Math.sin(-curYaw);
      const halfL = curL / 2 + 0.35;
      const halfW = curW / 2 + 0.35;
      const minBodyZ = effectiveGroundZ + 0.03;
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

      if (bodyPts.length < 4) {
        throw new Error(`Không đủ điểm LiDAR trên thân xe #${uiId} (tìm thấy ${bodyPts.length} điểm)`);
      }

      // 3. Tính toán dịch chuyển tâm bám cụm điểm mà GIỮ NGUYÊN 100% KÍCH THƯỚC (L, W, H)
      const sortedLx = [...bodyPts].sort((a, b) => a.lx - b.lx);
      const sortedLy = [...bodyPts].sort((a, b) => a.ly - b.ly);

      const pMinIdx = Math.max(0, Math.floor(bodyPts.length * 0.02));
      const pMaxIdx = Math.min(bodyPts.length - 1, Math.floor(bodyPts.length * 0.98));

      const lxMin = sortedLx[pMinIdx].lx;
      const lxMax = sortedLx[pMaxIdx].lx;
      const lyMin = sortedLy[pMinIdx].ly;
      const lyMax = sortedLy[pMaxIdx].ly;

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
      const newRotX = groundInfo.rollRad;
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

      (window as any).__CVAT_HAS_UNSAVED_CHANGES__ = true;

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

  // 6. Lắng nghe yêu cầu Quét Mốc Đa Frame và Tự Fit Toàn Track (Smart Multi-Frame Anchor Fit)
  window.addEventListener("CVAT_EXT_REQ_MULTI_FRAME_ANCHOR_FIT", async (e: any) => {
    const { jobId, frame, uiId, serverId } = e.detail || {};
    try {
      const job = await getActiveJobInstance(jobId);
      const { target, isDrawn } = await findTargetSafely(job, frame, uiId, serverId);

      // Bước 1: Khảo sát các frame của chiếc xe này trong toàn bộ track
      const parentTrack = await findTrackInJob(job, uiId, serverId, target.parentID);

      let bestFrame = frame;
      let optL = target.points[6] || 4.65;
      let optW = target.points[7] || 1.85;
      let optH = target.points[8] || 1.45;
      let bestScore = 0;
      let framesSynced = 1;

      // Đo lường chất lượng cụm điểm tại frame hiện tại
      const currentFit = computeLidarGroundAndFit(target.points, "catalog");
      if (currentFit.pointsCount > 0) {
        optL = currentFit.newL;
        optW = currentFit.newW;
        optH = currentFit.newH;
        bestScore = currentFit.pointsCount;
      }

      // NẾU CÓ NHIỀU FRAME TRONG TRACK: Duyệt qua các frame để tìm frame hiển thị tốt nhất
      if (parentTrack && Array.isArray(parentTrack.shapes) && parentTrack.shapes.length > 1) {
        const cuboidShapes = parentTrack.shapes.filter(
          (s: any) => s.shapeType === "cuboid" && Array.isArray(s.points) && s.points.length >= 9
        );
        const trackFrames = cuboidShapes.map((s: any) => s.frame).sort((a: number, b: number) => a - b);

        console.log(`[CVAT 3D Suite] Đang khảo sát ${trackFrames.length} frames của xe #${uiId} (Frames: ${trackFrames.join(", ")})...`);

        // Helper chuyển frame qua Player DOM hoặc Redux store
        const switchFrameDom = async (f: number) => {
          const frameInput = document.querySelector<HTMLInputElement>(
            ".cvat-player-frame-input input, input.cvat-player-frame-input"
          );
          if (frameInput) {
            frameInput.focus();
            frameInput.value = String(f);
            frameInput.dispatchEvent(new Event("input", { bubbles: true }));
            frameInput.dispatchEvent(new Event("change", { bubbles: true }));
            frameInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
            await new Promise((r) => setTimeout(r, 220));
          }
        };

        // Lấy tối đa 6 frame đại diện (bao gồm frame đầu, giữa, cuối) để quét nhanh mà không gây đơ web
        const sampleFrames: number[] = [];
        if (trackFrames.length <= 6) {
          sampleFrames.push(...trackFrames);
        } else {
          sampleFrames.push(trackFrames[0]);
          const step = Math.floor(trackFrames.length / 5);
          for (let i = 1; i < 5; i++) {
            sampleFrames.push(trackFrames[i * step]);
          }
          sampleFrames.push(trackFrames[trackFrames.length - 1]);
        }

        // Khảo sát từng frame trong danh sách
        for (const f of sampleFrames) {
          if (f === frame) continue; // Đã đo ở trên
          try {
            await switchFrameDom(f);
            const lidarF = getSceneLidarPoints();
            if (lidarF && lidarF.count > 0) {
              const shapeF = cuboidShapes.find((s: any) => s.frame === f);
              if (shapeF) {
                const fitF = computeLidarGroundAndFit(shapeF.points, "catalog");
                if (fitF.pointsCount > bestScore) {
                  bestScore = fitF.pointsCount;
                  bestFrame = f;
                  optL = fitF.newL;
                  optW = fitF.newW;
                  optH = fitF.newH;
                  console.log(`[CVAT 3D Suite] Tìm thấy Frame #${f} hiển thị tốt hơn (${fitF.pointsCount} điểm, ${optL}x${optW}x${optH}m)`);
                }
              }
            }
          } catch (scanErr) {
            console.warn(`[CVAT 3D Suite] Lỗi quét Frame #${f}:`, scanErr);
          }
        }

        // Quay lại Frame ban đầu (hoặc Frame tốt nhất)
        if (bestFrame !== frame) {
          await switchFrameDom(frame);
        }

        // Bước 2: Đồng bộ kích thước mốc chuẩn optL, optW, optH cho TOÀN BỘ TRACK
        for (const sh of cuboidShapes) {
          const shPoints = [...sh.points];
          const sOldZ = shPoints[2];
          const sOldH = shPoints[8];
          shPoints[2] = Number((sOldZ + (optH - sOldH) / 2).toFixed(3));
          shPoints[6] = optL;
          shPoints[7] = optW;
          shPoints[8] = optH;
          sh.points = shPoints;
          framesSynced++;
        }
        await parentTrack.save();
      }

      // Cập nhật Three.js của frame hiện tại
      const finalPoints = [...target.points];
      finalPoints[6] = optL;
      finalPoints[7] = optW;
      finalPoints[8] = optH;
      target.points = finalPoints;
      if (!isDrawn && typeof target.save === "function") {
        await target.save();
      }

      updateThreeJsCuboid(
        uiId,
        target.points[5],
        { x: target.points[0], y: target.points[1], z: target.points[2] },
        { l: optL, w: optW, h: optH }
      );

      (window as any).__CVAT_HAS_UNSAVED_CHANGES__ = true;

      const msg = `Đã quét chọn Frame #${bestFrame} hiển thị tốt nhất (${bestScore} điểm LiDAR), lấy kích thước chuẩn ${optL}x${optW}x${optH}m đồng bộ cho ${framesSynced} frames trong track`;
      console.log(`[CVAT 3D Suite] ${msg}`);

      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_MULTI_FRAME_ANCHOR_FIT", {
          detail: {
            success: true,
            uiId,
            anchorFrame: bestFrame,
            optL,
            optW,
            optH,
            framesSynced,
            message: msg,
          },
        })
      );
    } catch (err: any) {
      console.error("[CVAT 3D Suite] Lỗi Multi-Frame Anchor Fit:", err);
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_MULTI_FRAME_ANCHOR_FIT", {
          detail: { success: false, error: err.message || String(err) },
        })
      );
    }
  });
}
