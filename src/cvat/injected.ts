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

  // Lấy Job Instance thật đang gắn liền với ứng dụng CVAT UI
  async function getActiveJobInstance(jobId?: number): Promise<any> {
    const store = getReduxStore();
    const storeJob = store?.getState()?.annotation?.job?.instance;
    if (storeJob) {
      return storeJob;
    }
    // TUYỆT ĐỐI KHÔNG gọi win.cvat.jobs.get({ jobID }) tạo Job instance ảo riêng của SDK
    // vì Collection mới sẽ tự đánh số clientID từ 1..6 gây lệch pha và sinh ra ID ảo!
    return null;
  }

  // Interface dữ liệu điểm mây LiDAR mở rộng hỗ trợ Intensity và Color phản quang
  interface SceneLidarPoints {
    count: number;
    array: Float32Array;
    intensity?: Float32Array | null;
    color?: Float32Array | null;
    getIntensityAt: (idx: number) => number;
  }

  // Trích xuất đối tượng THREE.Points từ Scene của Canvas3D (kèm kênh Intensity/Color)
  function getSceneLidarPoints(): SceneLidarPoints | null {
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

  // =============================================================================
  // THUẬT TOÁN TÔ MÀU MÂY ĐIỂM LIDAR (POINT CLOUD COLORIZATION ENGINE IN MAIN WORLD)
  // 1. Hiển thị mặc định theo độ phản xạ (LiDAR Intensity)
  // 2. Nhuộm màu mây điểm nằm trong xe bọc (Boxed Points Colorization)
  // 3. Chế độ xem không xét độ phản xạ (Plain / Uniform Color Mode)
  // 4. Cơ chế Single-Flight Frame Controller (Zero-Lag 60 FPS, hủy frame cũ)
  // 5. Mặt Sàn Polygon 3D Mờ (Mặt đường & Vỉa hè) siêu nhẹ cho annotator
  // =============================================================================
  let currentPointColorMode: "intensity" | "plain" =
    typeof localStorage !== "undefined" && localStorage.getItem("cvat_3d_point_color_mode") === "plain"
      ? "plain"
      : "intensity";
  let currentColorizeBoxed: boolean =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("cvat_3d_colorize_boxed") !== "false"
      : true;
  let currentGroundPlaneVisible: boolean =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("cvat_3d_ground_plane_visible") !== "false"
      : true;

  let isColorizingRunning: boolean = false;
  let groundPlaneMeshGroup: any = null;
  let singleFrameColorizeTimer: any = null;

  // Lấy danh sách tất cả các đối tượng THREE.Points từ mọi view của Canvas3D
  function getAllScenePointsObjects(): any[] {
    try {
      const store = getReduxStore();
      const canvas = store?.getState()?.annotation?.canvas?.instance;
      if (!canvas || !canvas.view || !canvas.view.views) return [];

      const pointsObjects: any[] = [];
      const views = canvas.view.views;
      const viewKeys = ["perspective", "top", "side", "front"];

      for (const key of viewKeys) {
        const v = views[key];
        const scene = v?.scene;
        if (!scene) continue;
        scene.traverse((obj: any) => {
          if (
            (obj.isPoints || obj.type === "Points") &&
            obj.geometry?.attributes?.position?.count > 5000 &&
            !pointsObjects.includes(obj)
          ) {
            pointsObjects.push(obj);
          }
        });
      }

      return pointsObjects;
    } catch (e) {
      return [];
    }
  }

  // Bảng 32 màu phân kỳ tương phản cao (High-Contrast Vivid Palette) cho từng Track ID
  const DISTINCT_TRACK_PALETTE: Array<{ r: number; g: number; b: number }> = [
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

  const OVERLAP_WARNING_COLOR = { r: 1.0, g: 0.05, b: 0.20 }; // Đỏ Neon Cảnh Báo (#ff0d33)

  function getDistinctTrackColor(
    trackId: number | string | undefined | null,
    isActive?: boolean
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

    const colorIndex = (numId * 13 + 7) % DISTINCT_TRACK_PALETTE.length;
    const baseColor = DISTINCT_TRACK_PALETTE[colorIndex];

    if (isActive) {
      // Khi Active: Tăng sáng rực rỡ pha nhẹ 20% ánh vàng chanh neon (#facc15)
      return {
        r: Math.min(1.0, baseColor.r * 0.8 + 0.98 * 0.2),
        g: Math.min(1.0, baseColor.g * 0.8 + 0.80 * 0.2),
        b: Math.min(1.0, baseColor.b * 0.8 + 0.08 * 0.2),
      };
    }

    return baseColor;
  }

  // Thuật toán gán màu cho mây điểm Three.js: Intensity / Plain & Tô màu trong xe bọc (Tối ưu Zero-Lag)
  function applyPointCloudColorizationInMainWorld(
    options?: { mode?: "intensity" | "plain"; colorizeBoxed?: boolean }
  ): boolean {
    if (isColorizingRunning) return false;

    try {
      if (options?.mode) currentPointColorMode = options.mode;
      if (options?.colorizeBoxed !== undefined) currentColorizeBoxed = !!options.colorizeBoxed;

      const store = getReduxStore();
      const canvas = store?.getState()?.annotation?.canvas?.instance;
      if (!canvas) return false;

      const ptsObjs = getAllScenePointsObjects();
      if (ptsObjs.length === 0) return false;

      const curFrame =
        store?.getState()?.annotation?.player?.frame?.number ??
        store?.getState()?.annotation?.job?.instance?.frame ??
        0;

      // 1. Trích xuất danh sách tất cả các 3D Cuboids hiện hữu trên frame
      interface FastBoxTarget {
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
      }

      const defaultColors: Record<string, { r: number; g: number; b: number }> = {
        car: { r: 0.96, g: 0.62, b: 0.04 },        // Cam hổ phách (#f59e0b)
        pedestrian: { r: 0.51, g: 0.55, b: 0.97 }, // Xanh tím Indigo (#818cf8)
        cyclist: { r: 0.06, g: 0.73, b: 0.51 },    // Xanh lục Emerald (#10b981)
        truck: { r: 0.94, g: 0.38, b: 0.57 },      // Hồng Ruby (#f43f5e)
        bus: { r: 0.65, g: 0.43, b: 0.95 },        // Tím tím Purple (#a855f7)
        active: { r: 0.98, g: 0.80, b: 0.08 },     // Vàng chanh Neon (#facc15)
      };

      const fastBoxesMap = new Map<number, FastBoxTarget>();
      const activeClientId =
        canvas.view?.activatedElementID ||
        store?.getState()?.annotation?.annotations?.activatedStateClientID;

      if (currentColorizeBoxed) {
        // TẦNG 1: QUÉT TOÀN BỘ REDUX ANNOTATIONS STATES CỦA FRAME
        // Chứa 100% tất cả các xe/người đã bọc trong frame, KỂ CẢ KHI CANVAS ĐANG BỊ FILTER ID!
        const states = store?.getState()?.annotation?.annotations?.states || [];
        for (const s of states) {
          if (s && Array.isArray(s.points) && s.points.length >= 9 && !s.outside) {
            const pts = s.points;
            const l = pts[6];
            const w = pts[7];
            const h = pts[8];
            if (l <= 0 || w <= 0 || h <= 0) continue;

            const clientId = Number(s.clientID ?? s.id);
            const isActive = clientId === Number(activeClientId);
            const trackId = s.parentID ?? s.trackID ?? clientId;
            const c = getDistinctTrackColor(trackId, isActive);

            const yaw = pts[5] || 0;
            fastBoxesMap.set(clientId, {
              cx: pts[0],
              cy: pts[1],
              cz: pts[2],
              rx: pts[3] || 0,
              ry: pts[4] || 0,
              rz: yaw,
              cosY: Math.cos(-yaw),
              sinY: Math.sin(-yaw),
              halfL: l / 2,
              halfW: w / 2,
              halfH: h / 2,
              maxR: Math.max(l, w, h) * 0.75,
              colorR: c.r,
              colorG: c.g,
              colorB: c.b,
            });
          }
        }

        // TẦNG 2: CẬP NHẬT TỌA ĐỘ VÀ ROTATION REALTIME TỪ THREE.JS DRAWN OBJECTS
        // Đọc trực tiếp Three.js cuboid.position / scale / rotation khi người dùng kéo/co giãn box
        const drawnObjects = canvas.view?.drawnObjects || {};
        for (const idStr of Object.keys(drawnObjects)) {
          const drawnItem = drawnObjects[idStr];
          const data = drawnItem?.data;
          if (data && Array.isArray(data.points) && data.points.length >= 9 && !data.outside) {
            const pts = data.points;
            let cx = pts[0];
            let cy = pts[1];
            let cz = pts[2];
            let yaw = pts[5] || 0;
            let l = pts[6];
            let w = pts[7];
            let h = pts[8];

            if (drawnItem.cuboid) {
              const cp =
                drawnItem.cuboid.position ||
                drawnItem.cuboid.perspective?.position ||
                drawnItem.cuboid.top?.position;
              const cr =
                drawnItem.cuboid.rotation ||
                drawnItem.cuboid.perspective?.rotation ||
                drawnItem.cuboid.top?.rotation;
              const cs =
                drawnItem.cuboid.scale ||
                drawnItem.cuboid.perspective?.scale ||
                drawnItem.cuboid.top?.scale;
              if (cp && typeof cp.x === "number") {
                cx = cp.x;
                cy = cp.y;
                cz = cp.z;
              }
              if (cr && typeof cr.z === "number") {
                yaw = cr.z;
              }
              if (cs && typeof cs.x === "number" && cs.x > 0) {
                l = cs.x;
                w = cs.y;
                h = cs.z;
              }
            }

            if (l <= 0 || w <= 0 || h <= 0) continue;

            const clientId = Number(idStr);
            const isActive = clientId === Number(activeClientId);
            const trackId = data.parentID ?? data.trackID ?? clientId;
            const c = getDistinctTrackColor(trackId, isActive);

            fastBoxesMap.set(clientId, {
              cx,
              cy,
              cz,
              rx: pts[3] || 0,
              ry: pts[4] || 0,
              rz: yaw,
              cosY: Math.cos(-yaw),
              sinY: Math.sin(-yaw),
              halfL: l / 2,
              halfW: w / 2,
              halfH: h / 2,
              maxR: Math.max(l, w, h) * 0.75,
              colorR: c.r,
              colorG: c.g,
              colorB: c.b,
            });
          }
        }
      }

      const fastBoxes: FastBoxTarget[] = Array.from(fastBoxesMap.values());

      const numBoxes = fastBoxes.length;
      const isPlain = currentPointColorMode === "plain";
      const plainR = 0.72;
      const plainG = 0.76;
      const plainB = 0.82;

      let anyUpdated = false;
      const processedGeometries = new Set<any>();

      for (const obj of ptsObjs) {
        const geom = obj.geometry;
        if (!geom) continue;

        // TỐI ƯU CỰC ĐỘ: Nếu nhiều views dùng chung 1 geometry buffer, chỉ tính toán 1 lần duy nhất!
        if (processedGeometries.has(geom)) {
          if (obj.material) {
            obj.material.vertexColors = true;
            obj.material.needsUpdate = true;
          }
          continue;
        }
        processedGeometries.add(geom);

        const posAttr = geom.attributes?.position;
        if (!posAttr || !posAttr.array) continue;

        const count = posAttr.count;
        const posArray = posAttr.array as Float32Array;
        const intensityAttr = (geom.attributes.intensity || geom.attributes.intensities)?.array as Float32Array | undefined;

        let colorAttr = geom.attributes.color;
        let colorArray: Float32Array;

        const BufferAttrClass = posAttr.constructor;
        const winThree = (window as any).THREE;
        if (!colorAttr || !colorAttr.array || colorAttr.array.length !== count * 3) {
          colorArray = new Float32Array(count * 3);
          if (typeof BufferAttrClass === "function") {
            geom.setAttribute("color", new BufferAttrClass(colorArray, 3));
            colorAttr = geom.attributes.color;
          } else if (winThree && typeof winThree.BufferAttribute === "function") {
            geom.setAttribute("color", new winThree.BufferAttribute(colorArray, 3));
            colorAttr = geom.attributes.color;
          }
        } else {
          colorArray = colorAttr.array as Float32Array;
        }

        // Vòng lặp tô màu siêu tốc cho từng điểm (Vectorized & Fast-Path)
        for (let i = 0; i < count; i++) {
          const idx3 = i * 3;
          const px = posArray[idx3];
          const py = posArray[idx3 + 1];
          const pz = posArray[idx3 + 2];

          // Lấy Intensity chuẩn hóa v in [0, 1]
          let v = 0.5;
          if (intensityAttr && i < intensityAttr.length) {
            const rawInt = intensityAttr[i];
            v = rawInt <= 1.0 ? rawInt : Math.min(1.0, rawInt / 255);
          }

          // Kiểm tra Point-in-Box (Hỗ trợ phát hiện Overlap 2..N box)
          let matched: FastBoxTarget | null = null;
          let matchCount = 0;
          if (numBoxes > 0) {
            for (let k = 0; k < numBoxes; k++) {
              const b = fastBoxes[k];
              const dx = px - b.cx;
              const dy = py - b.cy;
              const dz = pz - b.cz;

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
                  matched = b;
                } else {
                  // Đã phát hiện Overlap từ 2 box trở lên! Early Exit siêu tốc
                  matched = null;
                  break;
                }
              }
            }
          }

          if (matchCount >= 2) {
            // VÙNG CHỒNG LẤN TỪ 2 ĐẾN N BOX: ĐỎ NEON CẢNH BÁO (#ff0d33) FULL BRIGHTNESS
            colorArray[idx3] = OVERLAP_WARNING_COLOR.r;
            colorArray[idx3 + 1] = OVERLAP_WARNING_COLOR.g;
            colorArray[idx3 + 2] = OVERLAP_WARNING_COLOR.b;
          } else if (matched) {
            // NẰM TRONG 1 XE BỌC: Nhuộm màu riêng biệt theo Track ID
            const factor = isPlain ? 0.90 : 0.40 + 0.60 * v;
            colorArray[idx3] = matched.colorR * factor;
            colorArray[idx3 + 1] = matched.colorG * factor;
            colorArray[idx3 + 2] = matched.colorB * factor;
          } else {
            // NGOÀI XE BỌC:
            if (isPlain) {
              colorArray[idx3] = plainR;
              colorArray[idx3 + 1] = plainG;
              colorArray[idx3 + 2] = plainB;
            } else {
              // Intensity Mode (Mượt mà, không lag)
              const boostV = Math.min(1.0, v * 1.25);
              if (v >= 0.70) {
                // Vạch sơn phản quang rực rỡ ánh vàng nhẹ
                colorArray[idx3] = 1.0;
                colorArray[idx3 + 1] = 0.95;
                colorArray[idx3 + 2] = 0.50 + 0.50 * boostV;
              } else {
                colorArray[idx3] = boostV;
                colorArray[idx3 + 1] = boostV;
                colorArray[idx3 + 2] = boostV;
              }
            }
          }
        }

        colorAttr.needsUpdate = true;

        if (obj.material) {
          obj.material.vertexColors = true;
          obj.material.needsUpdate = true;
        }

        anyUpdated = true;
      }

      if (anyUpdated && typeof canvas.render === "function") {
        isColorizingRunning = true;
        try {
          canvas.render();
        } finally {
          isColorizingRunning = false;
        }
      }

      return anyUpdated;
    } catch (err) {
      console.warn("[CVAT 3D Suite] Lỗi applyPointCloudColorizationInMainWorld:", err);
      return false;
    }
  }

  // =============================================================================
  // DỰNG MẶT SÀN POLYGON 3D MỜ (MẶT ĐƯỜNG & VỈA HÈ - GROUND SURFACE MESH)
  // Tạo một mặt phẳng bán trong suốt tại Z_ground giúp annotator thấy rõ mặt đất và vỉa hè
  // Hoàn toàn độc lập với window.THREE bằng cách tự trích xuất constructors từ Three.js Scene của CVAT
  // =============================================================================
  function getThreeEngineFromScene(scene: any, canvas: any): any {
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

  function updateGroundPlaneMeshInMainWorld(customZ?: number): void {
    try {
      const store = getReduxStore();
      const canvas = store?.getState()?.annotation?.canvas?.instance;
      if (!canvas || !canvas.view?.views) return;

      const pView = canvas.view.views.perspective;
      const scene = pView?.scene;
      if (!scene) return;

      // 1. Nếu người dùng TẮT mặt sàn: ẩn ngay lập tức
      if (!currentGroundPlaneVisible) {
        if (groundPlaneMeshGroup && groundPlaneMeshGroup.parent) {
          groundPlaneMeshGroup.visible = false;
          if (typeof canvas.render === "function") canvas.render();
        }
        return;
      }

      const three = getThreeEngineFromScene(scene, canvas);
      if (!three) return;

      // 2. Tính cao độ mặt đất chuẩn (Ego Road Ground Z)
      let zGround = customZ !== undefined ? customZ : getEgoRoadGroundZInMainWorld();
      if (isNaN(zGround) || zGround === 0) zGround = -1.75;

      // Hàm hỗ trợ dựng Đĩa Tròn 360° bán kính 100m (Radial Disc)
      const createCircleGeom = (radius: number, segments = 72, oz = 0) => {
        const verts: number[] = [];
        const step = (Math.PI * 2) / segments;
        for (let i = 0; i < segments; i++) {
          const a0 = i * step;
          const a1 = (i + 1) * step;
          const x0 = Math.cos(a0) * radius;
          const y0 = Math.sin(a0) * radius;
          const x1 = Math.cos(a1) * radius;
          const y1 = Math.sin(a1) * radius;
          verts.push(0, 0, oz,  x0, y0, oz,  x1, y1, oz);
        }
        const g = new three.BufferGeometry();
        g.setAttribute("position", new three.BufferAttribute(new Float32Array(verts), 3));
        return g;
      };

      // Hàm hỗ trợ dựng Vành Tròn Đồng Tâm phân chia cự ly (Concentric Range Rings)
      const createRingGeom = (radius: number, width = 0.25, segments = 72, oz = 0.005) => {
        const verts: number[] = [];
        const rIn = radius - width / 2;
        const rOut = radius + width / 2;
        const step = (Math.PI * 2) / segments;
        for (let i = 0; i < segments; i++) {
          const a0 = i * step;
          const a1 = (i + 1) * step;
          const c0 = Math.cos(a0), s0 = Math.sin(a0);
          const c1 = Math.cos(a1), s1 = Math.sin(a1);

          const xIn0 = c0 * rIn, yIn0 = s0 * rIn;
          const xOut0 = c0 * rOut, yOut0 = s0 * rOut;
          const xIn1 = c1 * rIn, yIn1 = s1 * rIn;
          const xOut1 = c1 * rOut, yOut1 = s1 * rOut;

          verts.push(
            xIn0, yIn0, oz,  xOut0, yOut0, oz,  xOut1, yOut1, oz,
            xIn0, yIn0, oz,  xOut1, yOut1, oz,  xIn1, yIn1, oz
          );
        }
        const g = new three.BufferGeometry();
        g.setAttribute("position", new three.BufferAttribute(new Float32Array(verts), 3));
        return g;
      };

      // Hàm hỗ trợ dựng Trục Chữ Thập X - Y dài 100m mỗi hướng
      const createCrosshairGeom = (maxRadius: number, width = 0.18, oz = 0.008) => {
        const hw = width / 2;
        const verts = new Float32Array([
          // Trục X (Tiến - Lùi): từ -maxRadius đến +maxRadius
          -maxRadius, -hw, oz,   maxRadius, -hw, oz,   maxRadius, hw, oz,
          -maxRadius, -hw, oz,   maxRadius, hw, oz,   -maxRadius, hw, oz,
          // Trục Y (Trái - Phải): từ -maxRadius đến +maxRadius
          -hw, -maxRadius, oz,   hw, -maxRadius, oz,   hw, maxRadius, oz,
          -hw, -maxRadius, oz,   hw, maxRadius, oz,   -hw, maxRadius, oz,
        ]);
        const g = new three.BufferGeometry();
        g.setAttribute("position", new three.BufferAttribute(verts, 3));
        return g;
      };

      // Hàm hỗ trợ dựng Dải Vỉa Hè ôm gọn trong bán kính 100m
      const createCurbGeom = (yMin: number, yMax: number, maxRadius = 100, oz = 0.15) => {
        const verts: number[] = [];
        const steps = 32;
        const dy = (yMax - yMin) / steps;
        for (let i = 0; i < steps; i++) {
          const y0 = yMin + i * dy;
          const y1 = yMin + (i + 1) * dy;
          const xSpan0 = Math.sqrt(Math.max(0, maxRadius * maxRadius - y0 * y0));
          const xSpan1 = Math.sqrt(Math.max(0, maxRadius * maxRadius - y1 * y1));

          verts.push(
            -xSpan0, y0, oz,   xSpan0, y0, oz,   xSpan1, y1, oz,
            -xSpan0, y0, oz,   xSpan1, y1, oz,  -xSpan1, y1, oz
          );
        }
        const g = new three.BufferGeometry();
        g.setAttribute("position", new three.BufferAttribute(new Float32Array(verts), 3));
        return g;
      };

      // Hàm hỗ trợ tạo Material bán trong suốt depthWrite=false
      const createMat = (hexColor: number, opacity: number) => {
        if (typeof three.MeshBasicMaterial === "function") {
          return new three.MeshBasicMaterial({
            color: hexColor,
            transparent: true,
            opacity,
            depthWrite: false,
            side: 2, // DoubleSide
          });
        }
        if (typeof three.Material === "function") {
          try {
            return new three.Material({
              color: hexColor,
              transparent: true,
              opacity,
              depthWrite: false,
              side: 2,
            });
          } catch (_) {}
        }
        // Fallback: Clone từ material trong scene
        let baseMat: any = null;
        scene.traverse((o: any) => {
          if (!baseMat && o.material) baseMat = o.material;
        });
        if (baseMat) {
          const m = baseMat.clone();
          if (m.color && typeof m.color.setHex === "function") m.color.setHex(hexColor);
          m.transparent = true;
          m.opacity = opacity;
          m.depthWrite = false;
          m.side = 2;
          return m;
        }
        return null;
      };

      // 3. Khởi tạo Three.js Group Đĩa Tròn 360° Bán Kính 100m
      if (!groundPlaneMeshGroup || !(groundPlaneMeshGroup as any)._isRadial100m) {
        if (groundPlaneMeshGroup && groundPlaneMeshGroup.parent) {
          groundPlaneMeshGroup.parent.remove(groundPlaneMeshGroup);
        }

        const GroupCtor = three.Group || three.Mesh;
        groundPlaneMeshGroup = new GroupCtor();
        groundPlaneMeshGroup.name = "__cvat_suite_ground_plane_mesh";
        (groundPlaneMeshGroup as any)._isRadial100m = true;

        // A. ĐĨA TRÒN MẶT ĐƯỜNG 360 ĐỘ BÁN KÍNH 100M
        const roadGeom = createCircleGeom(100, 72, 0);
        const roadMat = createMat(0x0284c7, 0.10);
        if (roadMat && typeof three.Mesh === "function") {
          const roadMesh = new three.Mesh(roadGeom, roadMat);
          roadMesh.name = "roadPlaneRadial100m";
          groundPlaneMeshGroup.add(roadMesh);
        }

        // B. CÁC VÒNG CỰ LY ĐỒNG TÂM 360 ĐỘ (20m, 40m, 60m, 80m, 100m)
        const ringMat = createMat(0x38bdf8, 0.28);
        if (ringMat && typeof three.Mesh === "function") {
          const distances = [20, 40, 60, 80, 100];
          for (const d of distances) {
            const ringGeom = createRingGeom(d, d === 100 ? 0.35 : 0.20, 72, 0.005);
            const ringMesh = new three.Mesh(ringGeom, ringMat);
            ringMesh.name = `rangeRing_${d}m`;
            groundPlaneMeshGroup.add(ringMesh);
          }
        }

        // C. TRỤC CHỮ THẬP ĐỊNH HƯỚNG 4 CHIỀU X - Y (100M MỖI HƯỚNG)
        const crossMat = createMat(0x94a3b8, 0.22);
        if (crossMat && typeof three.Mesh === "function") {
          const crossGeom = createCrosshairGeom(100, 0.18, 0.008);
          const crossMesh = new three.Mesh(crossGeom, crossMat);
          crossMesh.name = "crosshairAxes100m";
          groundPlaneMeshGroup.add(crossMesh);
        }

        // D. DẢI VỈA HÈ TRÁI & PHẢI TRONG BÁN KÍNH 100M (Giật cấp +15cm)
        const curbMat = createMat(0xf59e0b, 0.14);
        if (curbMat && typeof three.Mesh === "function") {
          // Vỉa hè bên trái (Y in [3.8m, 12.0m])
          const curbLeftGeom = createCurbGeom(3.8, 12.0, 100, 0.15);
          const curbLeft = new three.Mesh(curbLeftGeom, curbMat);
          curbLeft.name = "curbLeftRadial100m";
          groundPlaneMeshGroup.add(curbLeft);

          // Vỉa hè bên phải (Y in [-12.0m, -3.8m])
          const curbRightGeom = createCurbGeom(-12.0, -3.8, 100, 0.15);
          const curbRight = new three.Mesh(curbRightGeom, curbMat.clone ? curbMat.clone() : curbMat);
          curbRight.name = "curbRightRadial100m";
          groundPlaneMeshGroup.add(curbRight);
        }

        scene.add(groundPlaneMeshGroup);
      }

      // Đảm bảo group đã được add vào scene hiện tại
      if (!groundPlaneMeshGroup.parent || groundPlaneMeshGroup.parent !== scene) {
        scene.add(groundPlaneMeshGroup);
      }

      // 4. CẬP NHẬT CAO ĐỘ VÀ VỊ TRÍ MẶT SÀN CHO FRAME HIỆN TẠI
      groundPlaneMeshGroup.position.set(0, 0, zGround);
      groundPlaneMeshGroup.visible = true;

      if (typeof canvas.render === "function") {
        canvas.render();
      }
    } catch (err) {
      console.warn("[CVAT 3D Suite] Lỗi updateGroundPlaneMeshInMainWorld:", err);
    }
  }

  // Single-Flight Frame Controller: Hủy tác vụ cũ khi đổi frame, chỉ render đúng 1 lần cho frame active (kèm auto-retry nhẹ nếu mạng tải PCD chậm)
  function scheduleSingleFrameColorizationAndGround(targetFrame: number, delayMs: number = 180): void {
    if (singleFrameColorizeTimer) {
      clearTimeout(singleFrameColorizeTimer);
      singleFrameColorizeTimer = null;
    }

    const runAttempt = (attempt: number) => {
      try {
        const store = getReduxStore();
        const curF =
          store?.getState()?.annotation?.player?.frame?.number ??
          store?.getState()?.annotation?.job?.instance?.frame;
        if (curF === targetFrame) {
          const ok = applyPointCloudColorizationInMainWorld();
          updateGroundPlaneMeshInMainWorld();
          // Nếu chưa có points (PCD đang tải qua mạng) và chưa thử quá 3 lần:
          if (!ok && attempt < 3) {
            singleFrameColorizeTimer = setTimeout(() => runAttempt(attempt + 1), 350);
          }
        }
      } catch (_) {}
    };

    singleFrameColorizeTimer = setTimeout(() => runAttempt(1), delayMs);
  }

  // Thuật toán Annular Ring Ground Detection & 3D Slope Fitting (Pitch Dọc & Roll Ngang Front)
  // Thuật toán ƯỚC LƯỢNG CAO ĐỘ MẶT ĐƯỜNG XE EGO (Ego Road Surface Z Reference):
  // Quét các điểm mặt đường trong bán kính mở rộng 0.8m - 15.0m quanh xe Ego làm mốc chuẩn (mặc định -1.75m)
  function getEgoRoadGroundZInMainWorld(egoPos: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }): number {
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
    isHalfCurb?: boolean;
    halfCurbSide?: "left" | "right" | "none";
    curbHeightCm?: number;
  } {
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
    // Bán kính quét Footprint chặt chẽ quanh 4 lốp xe:
    const outerL = isInitialBox ? 3.0 : halfL + 0.55;
    const outerW = isInitialBox ? 2.0 : halfW + 0.45;
    const innerL = isInitialBox ? 0.2 : Math.max(0.15, halfL - 0.35);
    const innerW = isInitialBox ? 0.2 : Math.max(0.15, halfW - 0.35);

    // Mở rộng độ sâu: Trần cao độ lấy từ mép sàn xe trở xuống (cz - halfH * 0.4), đáy quét sâu tận min(cz - 4.5, -4.5m) chống lơ lửng
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

    // Helper tính cao độ mặt đất thông minh khi thiếu điểm dưới gầm (< 10 điểm):
    // 1. Ưu tiên mây điểm của chính chiếc xe (Golden Anchor Box: Z_ground = Z_roof - H)
    // 2. Mặt đất lân cận cục bộ quanh xe (1.5m - 5.0m)
    // 3. Bảo toàn đáy hiện tại của chiếc xe (cz - halfH) -> CHỐNG 100% HIỆN TƯỢNG BAY LÊN TRỜI
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
        // Golden Anchor: Z_ground = Z_roof - H
        const zFromRoof = zRoof - curObjH;
        const zFromLowest = zLowest - 0.18; // clearance gầm xe
        const estimatedZ = Math.min(zFromRoof, zFromLowest);
        // Sanity check: không chênh lệch quá 45cm so với đáy hiện tại
        if (Math.abs(estimatedZ - currentBaseZ) <= 0.45) {
          return Number(estimatedZ.toFixed(3));
        }
      }

      // Quét mặt đất lân cận cục bộ quanh xe (bán kính 1.5m - 5.0m)
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

      // Nếu có truyền egoRoadZ tường minh và độ lệch hợp lý
      if (egoRoadZ !== undefined && Math.abs(egoRoadZ - currentBaseZ) <= 0.50) {
        return Number(egoRoadZ.toFixed(3));
      }

      // Mặc định an toàn tuyệt đối: Bảo toàn đáy hiện tại của xe, khóa góc Roll 0°, Pitch 0°
      return Number(currentBaseZ.toFixed(3));
    };

    if (groundPts.length < 10) {
      // Dưới chân không có điểm hoặc point cloud mặt đất quá ít (< 10 điểm) -> Khóa 0° phẳng, dùng Smart Fallback Ground Z
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

    if (finalPts.length < 6) {
      // Số điểm mặt đất sau lọc không đủ tin cậy để OLS mặt phẳng 3D -> Khóa chuẩn 0° phẳng, dùng Smart Fallback Ground Z
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

      // Nhận diện Bậc Vỉa Hè: Chênh lệch cao độ lớn giữa 2 bên (stepDeltaZ >= 0.08m = 8cm)
      // VÀ bên lòng đường thấp là mặt phẳng ngang (lowerSpread < 0.05m = 5cm).
      // Nếu lòng đường dốc liên tục hoặc độ nghiêng nhẹ (< 8cm): Là đường nghiêng tự nhiên -> bám theo Roll!
      if (stepDeltaZ >= 0.08 && lowerSpread < 0.05) {
        isCurbOrRamp = true;
      }
    }

    // =========================================================================
    // CĂN DẢI CURPOINT TIẾP ĐẤT THEO KHOẢNG 30% - 30% ĐẦU CUỐI:
    // - Dải 0%–30% (Mép Phải): Khoảng ly từ [-halfW - 0.45m] đến [-halfW + W * 0.30m].
    // - Dải 70%–100% (Mép Trái): Khoảng ly từ [halfW - W * 0.30m] đến [halfW + 0.45m].
    // 1. TỰ ĐỘNG PHÁT HIỆN GÁC LỀ (Half-Curb): Nếu chênh lệch cao độ |zLeft - zRight| >= 7cm
    //    so với mốc Ego Road Z (1 bên lòng đường, 1 bên trên vỉa hè): tự động tính Roll và bù Z.
    // 2. MẶT ĐƯỜNG DỐC TỰ NHIÊN: Bám theo góc nghiêng tự nhiên của mặt đường.
    // 3. NẾU CHƯA ĐỦ ĐIỂM Ở 1 TRONG 2 ĐẦU MÉP: Fit góc thẳng theo Ego, KHÓA CỨNG Roll = 0°!
    // =========================================================================
    const W = halfW * 2;
    const edgeRightPts = sorted.filter(
      (p) => p.ly >= -halfW - 0.45 && p.ly <= -halfW + W * 0.30
    );
    const edgeLeftPts = sorted.filter(
      (p) => p.ly >= halfW - W * 0.30 && p.ly <= halfW + 0.45
    );

    if (edgeRightPts.length >= 2 && edgeLeftPts.length >= 2) {
      // Khử thành phần dốc dọc (Pitch) để đo độ dốc ngang Front theo 2 đầu mép biên độc lập
      const aSlope = -Math.tan(pitchRad);

      // Trích xuất cao độ tiếp đất chuẩn xác cho từng sườn (kháng nhiễu thân xe & nhận diện bậc vỉa hè)
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
      // Chưa đủ điểm ở 1 trong 2 đầu mép biên -> Fit góc thẳng theo Ego: Khóa cứng Roll = 0°
      rollRad = 0;
      if (isCurbOrRamp) {
        c0 = lowestRoadZ;
      }
    }

    // =========================================================================
    // CĂN DỐC DỌC SIDE VIEW (PITCH) THEO DẢI 30% ĐẦU VÀ 30% CUỐI DỌC TRỤC X:
    // - Dải 70%–100% (Đầu xe / Bánh trước): lx từ [halfL - L * 0.30] đến [halfL + 0.45].
    // - Dải 0%–30% (Đuôi xe / Bánh sau): lx từ [-halfL - 0.45] đến [-halfL + L * 0.30].
    // 1. Khử thành phần dốc ngang Roll để đo dốc dọc Side nguyên bản: zTrans = p.z - bSlope * p.ly.
    // 2. Nếu cả 2 đầu đều có điểm tiếp đất tin cậy (>= 2 điểm mỗi bên):
    //    -> Tính độ dốc dọc: pitchRad = -atan((zFront - zRear) / spanX).
    // 3. Cân bằng tâm sàn c0 giữa 2 đầu bánh xe.
    // =========================================================================
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

    // =========================================================================
    // NHẬN DIỆN NỀN VỈA HÈ TOÀN PHẦN & CHỐNG LÚN ÂM ĐẤT THEO EGO ROAD Z REFERENCE:
    // =========================================================================
    let isCurbGround = false;
    const refEgoZ = egoRoadZ !== undefined ? egoRoadZ : getEgoRoadGroundZInMainWorld();
    if (!isCurbOrRamp && !isHalfCurb) {
      // 1. Xe đỗ hoàn toàn trên vỉa hè: Mây điểm mặt đất cao hơn Ego Road Z từ +8cm đến +35cm
      if (c0 >= refEgoZ + 0.08 && c0 <= refEgoZ + 0.35) {
        isCurbGround = true;
        curbHeightCm = Math.round((c0 - refEgoZ) * 100);
        // Nền vỉa hè phẳng -> khóa Roll = 0° theo góc thẳng Ego để xe đứng ngay ngắn
        if (Math.abs(rollRad) < (5 * Math.PI) / 180) {
          rollRad = 0;
        }
      }
      // 2. Chống lún âm đất khi chưa đủ điểm: Fit độ cao theo mốc Ego Z và khóa góc thẳng theo Ego
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
      isHalfCurb,
      halfCurbSide,
      curbHeightCm,
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

  // Thuật toán Cắt Thung Lũng Mật Độ Trục Z (Z-Axis Density Gap Cutoff) & Dò Đỉnh Đầu Thật:
  // - Quét từ điểm cao nhất ngược xuống.
  // - Chỉ kiểm tra và cắt thung lũng mật độ nếu điểm nằm ở vùng cao bất thường (> groundZ + maxNormalHeight)
  //   và khoảng hở so với điểm bên dưới lớn hơn maxGap (> 15cm)
  // - Loại bỏ 100% điểm lá cây, dây điện, bụi lơ lửng trên trời, kháng hiện tượng phình to chiều cao.
  // - Bảo toàn 100% đỉnh đầu và nón bảo hiểm trong vùng chiều cao vật lý bình thường.
  function detectTrueHeadZInMainWorld(
    zArr: number[],
    maxGap: number = 0.15,
    groundZ?: number,
    maxNormalHeight: number = 1.75
  ): number {
    if (zArr.length === 0) return 0;
    if (zArr.length === 1) return zArr[0];
    const sorted = [...zArr].sort((a, b) => a - b);

    // Điểm sàn tham chiếu (nếu không có groundZ thì lấy điểm thấp nhất)
    const baseZ = groundZ !== undefined ? groundZ : sorted[0];
    const suspiciousThresholdZ = baseZ + maxNormalHeight;

    let cutoffIdx = sorted.length - 1;
    for (let i = sorted.length - 1; i >= 1; i--) {
      if (sorted[i] > suspiciousThresholdZ) {
        const gap = sorted[i] - sorted[i - 1];
        if (gap > maxGap) {
          cutoffIdx = i - 1;
        }
      } else {
        break;
      }
    }

    const clusterPts = sorted.slice(0, cutoffIdx + 1);
    const pIdx = clusterPts.length >= 20 ? Math.min(clusterPts.length - 1, Math.floor(clusterPts.length * 0.98)) : clusterPts.length - 1;
    return clusterPts[pIdx];
  }

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

  // Tính toán trọng số cường độ phản xạ (Intensity Weighting) cho danh sách mây điểm trong Main World
  function computeIntensityWeights(
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

    if (maxI - minI < 15) {
      return {
        weights: new Array(n).fill(1.0),
        hasValidIntensity: false,
        highIntensityThreshold: maxI,
      };
    }

    const p75Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.75));
    const highIntensityThreshold = Math.max(minI + 15, sorted[p75Idx]);

    const range = maxI - minI;
    const weights: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const norm = Math.max(0, Math.min(1, (intensities[i] - minI) / range));
      weights[i] = 1.0 + 1.5 * norm;
    }

    return {
      weights,
      hasValidIntensity: true,
      highIntensityThreshold,
    };
  }

  // Thuật toán Dò Bức Tường Mật Độ Vỏ Xe & Cắt Thung Lũng Mật Độ trong Main World (Tích hợp Trọng Số Intensity & Kháng Co Lẹm)
  function detectDominantWallEdgeWithValleyCutoff<
    T extends { lx: number; ly: number; z: number; intensity?: number }
  >(
    pts: T[],
    axis: "ly" | "lx",
    direction: "positive" | "negative",
    nominalHalf: number,
    options: {
      binSize?: number;
      minSpanOrthogonal?: number;
      maxSearchExtension?: number;
      useIntensity?: boolean;
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

    // Phân tích trọng số Intensity
    const intensityData = options.useIntensity !== false ? computeIntensityWeights(candidatePts) : null;
    const weights = intensityData?.weights || new Array(candidatePts.length).fill(1.0);
    const highThreshold = intensityData?.highIntensityThreshold ?? Infinity;
    const hasValidIntensity = intensityData?.hasValidIntensity ?? false;

    const maxDist = nominalHalf + maxSearchExt;
    const numBins = Math.ceil(maxDist / binSize) + 2;
    const bins: Array<Array<{ pt: T; weight: number; isBright: boolean }>> = Array.from(
      { length: numBins },
      () => []
    );
    const binWeights: number[] = new Array(numBins).fill(0);

    for (let i = 0; i < candidatePts.length; i++) {
      const p = candidatePts[i];
      const w = weights[i];
      const isBright = hasValidIntensity && typeof p.intensity === "number" && p.intensity >= highThreshold;
      const dist = isPos ? p[axis] : -p[axis];
      if (dist >= 0 && dist <= maxDist) {
        const bIdx = Math.min(numBins - 1, Math.floor(dist / binSize));
        bins[bIdx].push({ pt: p, weight: w, isBright });
        binWeights[bIdx] += w;
      }
    }

    // 1. Tìm ĐỈNH MẬT ĐỘ THÂN XE CÓ TRỌNG SỐ (Dominant Weighted Wall Peak)
    const nominalMinBin = Math.max(0, Math.floor((nominalHalf - 0.45) / binSize));
    const nominalMaxBin = Math.min(numBins - 1, Math.floor((nominalHalf + maxSearchExt) / binSize));

    let peakBin = nominalMinBin;
    let maxWeight = 0;

    for (let b = nominalMinBin; b <= nominalMaxBin; b++) {
      const bw = binWeights[b];
      if (bw > maxWeight) {
        maxWeight = bw;
        peakBin = b;
      }
    }

    if (maxWeight < 2.0) {
      for (let b = 1; b < numBins - 1; b++) {
        if (binWeights[b] > maxWeight) {
          maxWeight = binWeights[b];
          peakBin = b;
        }
      }
    }

    if (maxWeight === 0) {
      return {
        edge: isPos ? nominalHalf : -nominalHalf,
        wallPoints: candidatePts,
        peakDensity: 0,
      };
    }

    // 2. Dò mép vỏ xe từ peakBin ra phía ngoài (b tăng dần)
    const minWallWeight = Math.max(1.8, maxWeight * 0.12);
    let outerWallBin = peakBin;

    let consecutiveEmptyBins = 0;
    for (let b = peakBin + 1; b < numBins; b++) {
      const ptsInBin = bins[b];
      const count = ptsInBin.length;
      const bw = binWeights[b];
      const hasBrightInBin = ptsInBin.some((item) => item.isBright);

      if (count === 0) {
        consecutiveEmptyBins++;
        if (consecutiveEmptyBins >= 2) {
          const nextBinHasBright = b + 1 < numBins && bins[b + 1].some((item) => item.isBright);
          if (!nextBinHasBright) {
            break;
          }
        }
        continue;
      }

      // ĐIỂM SÁNG PHẢN XẠ MẠNH: BẢO VỆ TUYỆT ĐỐI, CHỐNG CO RÚT LẸM VÀO TRONG OBJECT!
      if (hasBrightInBin) {
        consecutiveEmptyBins = 0;
        outerWallBin = b;
        continue;
      }

      const distCenter = (b + 0.5) * binSize;
      if (bw < minWallWeight && distCenter > nominalHalf) {
        consecutiveEmptyBins++;
        if (consecutiveEmptyBins >= 2) {
          break;
        }
        continue;
      }

      if (distCenter > nominalHalf - 0.05) {
        const orthVals = ptsInBin.map((item) => item.pt[orthAxis]);
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

    // 3. Thu thập điểm của thân xe từ tâm ra đến outerWallBin
    const collectedWallPoints: T[] = [];
    for (let b = 0; b <= outerWallBin; b++) {
      for (const item of bins[b]) {
        collectedWallPoints.push(item.pt);
      }
    }

    const outerEdgeItems: Array<{ pt: T; weight: number; isBright: boolean }> = [];
    const edgeStartBin = Math.max(0, outerWallBin - 3);
    for (let b = edgeStartBin; b <= outerWallBin; b++) {
      for (const item of bins[b]) {
        outerEdgeItems.push(item);
      }
    }

    if (outerEdgeItems.length >= 3) {
      const brightItems = outerEdgeItems.filter((i) => i.isBright);
      const targetItems = brightItems.length >= 2 ? brightItems : outerEdgeItems;
      const dists = targetItems.map((item) => (isPos ? item.pt[axis] : -item.pt[axis])).sort((a, b) => a - b);
      const pIdx = Math.max(0, Math.min(dists.length - 1, Math.floor(dists.length * 0.95)));
      const chosenDist = dists[pIdx];
      const edge = isPos ? Number(chosenDist.toFixed(3)) : Number((-chosenDist).toFixed(3));
      return {
        edge,
        wallPoints: collectedWallPoints,
        peakDensity: Math.round(maxWeight),
      };
    }

    const fallbackDist = (outerWallBin + 1) * binSize;
    const edge = isPos ? Number(fallbackDist.toFixed(3)) : Number((-fallbackDist).toFixed(3));
    return {
      edge,
      wallPoints: collectedWallPoints.length > 0 ? collectedWallPoints : candidatePts,
      peakDensity: Math.round(maxWeight),
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

  // Thuật toán Căn Thẳng Góc Yaw Dựa Trên Viền Mật Độ Đột Biến Nhìn Từ Top View trong Main World (Tích hợp Trọng Số Intensity WLS)
  function straightenYawFromBoundaryEdge<
    T extends { lx: number; ly: number; z: number; intensity?: number }
  >(
    pts: Array<T>,
    currentYaw: number,
    L: number,
    _W: number,
    visibleLateral: "left" | "right",
    options: { maxAdjustmentDeg?: number; useIntensity?: boolean } = {}
  ): { newYawRad: number; newYawDeg: number; deltaYawDeg: number; slope: number } {
    const maxAdjDeg = options.maxAdjustmentDeg ?? 8.0;
    const maxAdjRad = (maxAdjDeg * Math.PI) / 180;

    const intensityData = options.useIntensity !== false ? computeIntensityWeights(pts) : null;
    const highThreshold = intensityData?.highIntensityThreshold ?? Infinity;
    const hasValidIntensity = intensityData?.hasValidIntensity ?? false;

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
    const slicePoints: Array<{ lx: number; ly: number; weight: number }> = [];
    for (let s = 0; s < numSlices; s++) {
      const minLx = -L / 2 + s * sliceWidth;
      const maxLx = minLx + sliceWidth;
      const inSlice = sidePts.filter((p) => p.lx >= minLx && p.lx < maxLx);
      if (inSlice.length >= 1) {
        const brightInSlice = hasValidIntensity
          ? inSlice.filter((p) => typeof p.intensity === "number" && p.intensity >= highThreshold)
          : [];
        const targetSlicePts = brightInSlice.length >= 1 ? brightInSlice : inSlice;
        const sliceWeight = brightInSlice.length >= 1 ? 2.0 : 1.0;

        if (isLeft) {
          const sortedLy = targetSlicePts.map((p) => p.ly).sort((a, b) => a - b);
          const pIdx = Math.max(0, Math.floor(sortedLy.length * 0.90));
          const medianLx = (minLx + maxLx) / 2;
          slicePoints.push({ lx: medianLx, ly: sortedLy[pIdx], weight: sliceWeight });
        } else {
          const sortedLy = targetSlicePts.map((p) => p.ly).sort((a, b) => a - b);
          const pIdx = Math.min(sortedLy.length - 1, Math.floor(sortedLy.length * 0.10));
          const medianLx = (minLx + maxLx) / 2;
          slicePoints.push({ lx: medianLx, ly: sortedLy[pIdx], weight: sliceWeight });
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

    // Hồi quy bền vững kháng ngoại lai Theil-Sen Estimator có trọng số:
    const slopesWithWeights: Array<{ slope: number; weight: number }> = [];
    for (let i = 0; i < slicePoints.length; i++) {
      for (let j = i + 1; j < slicePoints.length; j++) {
        const dx = slicePoints[j].lx - slicePoints[i].lx;
        const dy = slicePoints[j].ly - slicePoints[i].ly;
        if (Math.abs(dx) >= 0.25) {
          const pairWeight = (slicePoints[i].weight + slicePoints[j].weight) / 2;
          slopesWithWeights.push({ slope: dy / dx, weight: pairWeight });
        }
      }
    }

    let slope = 0;
    if (slopesWithWeights.length >= 3) {
      slopesWithWeights.sort((a, b) => a.slope - b.slope);
      const totalW = slopesWithWeights.reduce((sum, item) => sum + item.weight, 0);
      let cumulativeW = 0;
      let chosenSlope = slopesWithWeights[Math.floor(slopesWithWeights.length / 2)].slope;
      for (const item of slopesWithWeights) {
        cumulativeW += item.weight;
        if (cumulativeW >= totalW / 2) {
          chosenSlope = item.slope;
          break;
        }
      }
      slope = chosenSlope;
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

  // Helper nhận diện cản trước / cản sau dựa trên mật độ 20% đầu/đuôi xe và góc chiếu Ego
  function determineBumperByDensity(
    pts: Array<{ lx: number; ly: number; z?: number }>,
    L: number,
    egoLocalX: number,
    egoLocalY: number
  ): {
    visibleBumper: "front" | "rear";
    isParallelBalanced: boolean;
    nFront20: number;
    nRear20: number;
    nMiddle60: number;
  } {
    if (pts.length === 0) {
      return {
        visibleBumper: egoLocalX >= 0 ? "front" : "rear",
        isParallelBalanced: false,
        nFront20: 0,
        nRear20: 0,
        nMiddle60: 0,
      };
    }

    // Xác định 20% đầu xe và 20% đuôi xe theo 2 đầu cực trị của cụm mây điểm thực tế (chống lệch tâm box)
    const allLx = pts.map((p) => p.lx).sort((a, b) => a - b);
    const pMinIdx = allLx.length >= 15 ? Math.floor(allLx.length * 0.015) : 0;
    const pMaxIdx = allLx.length >= 15 ? Math.min(allLx.length - 1, Math.floor(allLx.length * 0.985)) : allLx.length - 1;
    const lxMin = allLx[pMinIdx];
    const lxMax = allLx[pMaxIdx];

    const zoneSpan = Math.max(0.40, L * 0.20);
    const span = lxMax - lxMin;

    let nFront20 = 0;
    let nRear20 = 0;
    let nMiddle60 = 0;

    if (span < zoneSpan * 1.5) {
      // Cụm điểm co cụm hẹp ở một vùng (ví dụ chỉ có 1 đầu xe đón tia laser, đầu kia khuất hoàn toàn)
      const meanLx = pts.reduce((sum, p) => sum + p.lx, 0) / pts.length;
      const threshold = Math.max(0.35, L * 0.20);
      if (meanLx > threshold) {
        nFront20 = pts.length;
      } else if (meanLx < -threshold) {
        nRear20 = pts.length;
      } else {
        nMiddle60 = pts.length;
      }
    } else {
      const front20Min = lxMax - zoneSpan;
      const front20Max = lxMax + 0.35;
      const rear20Min = lxMin - 0.35;
      const rear20Max = lxMin + zoneSpan;

      nFront20 = pts.filter((p) => p.lx >= front20Min && p.lx <= front20Max).length;
      nRear20 = pts.filter((p) => p.lx >= rear20Min && p.lx <= rear20Max).length;
      nMiddle60 = pts.filter((p) => p.lx > rear20Max && p.lx < front20Min).length;
    }

    // 1. So sánh mật độ 20% hai đầu xe (Ở khoảng cách gần, cản trực diện đón tia có mật độ vượt trội, cản khuất thưa thớt)
    const isFrontDominant = (nFront20 >= 6 && nRear20 <= 4) || (nFront20 >= 8 && nFront20 >= nRear20 * 2.5);
    const isRearDominant = (nRear20 >= 6 && nFront20 <= 4) || (nRear20 >= 8 && nRear20 >= nFront20 * 2.5);

    if (isFrontDominant) {
      return {
        visibleBumper: "front",
        isParallelBalanced: false,
        nFront20,
        nRear20,
        nMiddle60,
      };
    }

    if (isRearDominant) {
      return {
        visibleBumper: "rear",
        isParallelBalanced: false,
        nFront20,
        nRear20,
        nMiddle60,
      };
    }

    // 2. Trường hợp chiếu ngang sườn song song hoặc phân bố đều đối xứng 2 đầu thân xe
    const tan25 = 0.466;
    const isEgoParallel = Math.abs(egoLocalX) <= Math.abs(egoLocalY) * tan25;
    const isSymmetricBothEnds = Math.abs(nFront20 - nRear20) <= 2 && nFront20 >= 2 && nRear20 >= 2 && nMiddle60 >= 3;

    if ((isEgoParallel || isSymmetricBothEnds) && pts.length >= 4) {
      return {
        visibleBumper: egoLocalX >= 0 ? "front" : "rear",
        isParallelBalanced: true,
        nFront20,
        nRear20,
        nMiddle60,
      };
    }

    // 3. Fallback theo hướng đón tia Ego (khi điểm thưa hoặc 2 đầu tương đương)
    let visibleBumper: "front" | "rear" = egoLocalX >= 0 ? "front" : "rear";
    const allFrontPts = pts.filter((p) => p.lx > 0.05);
    const allRearPts = pts.filter((p) => p.lx < -0.05);

    if (visibleBumper === "front" && allFrontPts.length < 2 && allRearPts.length >= 4) {
      visibleBumper = "rear";
    } else if (visibleBumper === "rear" && allRearPts.length < 2 && allFrontPts.length >= 4) {
      visibleBumper = "front";
    }

    return {
      visibleBumper,
      isParallelBalanced: false,
      nFront20,
      nRear20,
      nMiddle60,
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

    const rawBodyPts: Array<{ x: number; y: number; z: number; lx: number; ly: number; intensity: number }> = [];
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
        rawBodyPts.push({ x, y, z, lx, ly, intensity: lidar.getIntensityAt(i) });
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
    let isSideParallelBalanced = false;
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
        const egoLocalY = -toEgoX * Math.sin(currentYaw) + toEgoY * Math.cos(currentYaw);

        const edgePadding = options.edgePadding ?? 0.05; // 5.0cm

        // QUY TẮC CĂN SIDE KẾT HỢP MẬT ĐỘ 20% ĐẦU/ĐUÔI XE & GÓC CHIẾU EGO:
        const densityDecision = determineBumperByDensity(pts, targetL, egoLocalX, egoLocalY);

        if (densityDecision.isParallelBalanced && pts.length >= 4) {
          // VÙNG 1: CHIẾU VUÔNG GÓC SƯỜN XE HOẶC PHÂN BỐ ĐỐI XỨNG DỌC THÂN XE:
          const allLx = pts.map((p) => p.lx).sort((a, b) => a - b);
          const pMinIdx = allLx.length >= 15 ? Math.floor(allLx.length * 0.015) : 0;
          const pMaxIdx = allLx.length >= 15 ? Math.min(allLx.length - 1, Math.floor(allLx.length * 0.985)) : allLx.length - 1;
          const lxMin = allLx[pMinIdx];
          const lxMax = allLx[pMaxIdx];

          let sLx = (lxMin + lxMax) / 2;
          const maxShiftL = Math.min(0.40, targetL * 0.25);
          sLx = Math.max(-maxShiftL, Math.min(maxShiftL, sLx));
          if (Math.abs(sLx) < 0.01) sLx = 0;
          return { shiftLx: sLx, visibleBumper: densityDecision.visibleBumper, isBalanced: true };
        }

        // VÙNG 2 & 3: CÓ MẶT CẢN ĐÓN TIA RÕ RỆT (ƯU TIÊN THEO MẬT ĐỘ 20% ĐẦU / ĐUÔI XE):
        const visibleBumper = densityDecision.visibleBumper;

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

        let sLx = 0;
        if (visibleBumper === "front") {
          sLx = (bumperEdge + edgePadding) - targetL / 2;
        } else {
          sLx = (bumperEdge - edgePadding) + targetL / 2;
        }

        const maxShiftL = Math.min(0.40, targetL * 0.25);
        sLx = Math.max(-maxShiftL, Math.min(maxShiftL, sLx));
        if (Math.abs(sLx) < 0.01) sLx = 0;

        return { shiftLx: sLx, visibleBumper, isBalanced: false };
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
        isSideParallelBalanced = sideRes.isBalanced;
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
      if (isSideParallelBalanced) {
        msg = `Đã căn SIDE: Chiếu ngang sườn song song (Fit đều đầu & cuối xe, ΔX: ${deltaXSign}${shiftLx.toFixed(2)}m, giữ nguyên cao độ Z)`;
      } else {
        msg = `Đã căn SIDE: Cản [${faceTextLong}] đón tia (ΔX: ${deltaXSign}${shiftLx.toFixed(2)}m, giữ nguyên cao độ Z)`;
      }
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
    const headBuffer = options.headBuffer ?? 0.02;
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

    // 2. Thu thập điểm thân người và chân:
    // - Tầng thân chính (Core Body): Z in [groundZ + 0.30m, groundZ + 2.00m]
    // - Tầng chân (Foot/Ankle): Z in [groundZ + 0.08m, groundZ + 0.30m] (ở SIDE & FRONT hạ xuống groundZ + 0.02m để giữ trọn curpoint)
    // GIỮ TRỌN CURPOINT: Không gạt bỏ điểm tầng chân khi thân có nhiều điểm (tránh cắt mất curpoint bàn chân/mũi chân)
    const minCoreZ = groundZ + 0.30;
    const maxBodyZ = groundZ + 2.00;
    const minFootZ = (step === "side" || step === "front") ? groundZ + 0.02 : groundZ + 0.08;
    const outerL = Math.max(0.45, curL / 2 + 0.25);
    const outerW = Math.max(0.40, curW / 2 + 0.25);

    const cosY = Math.cos(-yaw);
    const sinY = Math.sin(-yaw);
    const coreBodyPts: Array<{ lx: number; ly: number; z: number; intensity: number }> = [];
    const footPts: Array<{ lx: number; ly: number; z: number; intensity: number }> = [];

    for (let i = 0; i < count; i++) {
      const z = array[i * 3 + 2];
      if (z < minFootZ || z > maxBodyZ) continue;
      const x = array[i * 3];
      const y = array[i * 3 + 1];
      const dx = x - cx;
      const dy = y - cy;
      const lx = dx * cosY - dy * sinY;
      const ly = dx * sinY + dy * cosY;
      const intensity = lidar.getIntensityAt(i);
      if (Math.abs(lx) <= outerL && Math.abs(ly) <= outerW) {
        if (z >= minCoreZ) {
          coreBodyPts.push({ lx, ly, z, intensity });
        } else {
          // Tầng chân: chỉ loại bỏ các tia quét xiên loang quá xa ngoài bán kính sải chân
          if (Math.abs(lx) <= Math.max(0.35, curL / 2 + 0.12) && Math.abs(ly) <= Math.max(0.30, curW / 2 + 0.12)) {
            footPts.push({ lx, ly, z, intensity });
          }
        }
      }
    }

    // Phối hợp điểm:
    // - Ở nút SIDE & FRONT: Tính luôn cả điểm tầng chân để mép cản/sườn đón tia ôm trọn curpoint bàn chân/mũi chân ngoài cùng
    // - Ở các nút Fit Size (L, W, H) & ALL: Ưu tiên tầng thân chính nếu có >= 8 điểm để chống phình to kích thước do vệt quét loang sát đất
    let rawBodyPts: Array<{ lx: number; ly: number; z: number }>;
    if (step === "side" || step === "front") {
      rawBodyPts = [...coreBodyPts, ...footPts];
    } else {
      rawBodyPts = coreBodyPts.length >= 8 ? coreBodyPts : [...coreBodyPts, ...footPts];
    }

    // 3. Phân cụm mật độ tự thích ứng (Adaptive Density-Connected Clustering):
    // - Giảm cắt nhiễu bớt đi: Dùng maxGapLx = 0.32m ở Side; maxGapLy = 0.30m ở Front để không chém đứt curpoint cẳng chân, sải bước hay tay
    const isSparse = rawBodyPts.length <= 12;
    const maxGapLx = (step === "side" || isSparse) ? 0.32 : 0.22;
    const maxGapLy = (step === "front" || isSparse) ? 0.30 : 0.22;

    const clusterLy = filterDenseConnectedCluster1D(rawBodyPts, "ly", maxGapLy, 0);
    const bodyPts = filterDenseConnectedCluster1D(clusterLy, "lx", maxGapLx, 0);

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

    // Giảm cắt nhiễu bớt đi: Chỉ cắt 1% nếu mây điểm cực đông (>= 25 điểm), không cắt mất curpoint đón tia
    const pMinIdx = !isSparse && bodyPts.length >= 25 ? Math.floor(bodyPts.length * 0.01) : 0;
    const pMaxIdx = !isSparse && bodyPts.length >= 25 ? Math.min(bodyPts.length - 1, Math.floor(bodyPts.length * 0.99)) : bodyPts.length - 1;

    const lxMin = allLx[pMinIdx];
    const lxMax = allLx[pMaxIdx];
    const lyMin = allLy[pMinIdx];
    const lyMax = allLy[pMaxIdx];
    // Cắt thung lũng mật độ trục Z (loại bỏ 100% điểm nhiễu lơ lửng trên cao gap > 15cm)
    const highestPtZ = detectTrueHeadZInMainWorld(allZ, 0.15, groundZ, 1.78);

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
      let bumperName = "Cân đối";

      if (options.egoPos) {
        const toEgoX = options.egoPos.x - cx;
        const toEgoY = options.egoPos.y - cy;
        const egoLocalX = toEgoX * Math.cos(yaw) + toEgoY * Math.sin(yaw);
        const egoLocalY = -toEgoX * Math.sin(yaw) + toEgoY * Math.cos(yaw);

        // Ngưỡng góc 25 độ: tan(25°) ≈ 0.466
        const isSideBeamParallel = Math.abs(egoLocalX) <= Math.abs(egoLocalY) * 0.466;

        if (isSideBeamParallel) {
          // VÙNG 1: TRỤC Y EGO SONG SONG VẬT THỂ / CHIẾU NGANG SƯỜN:
          shiftLx = (lxMin + lxMax) / 2;
          bumperName = "Chiếu ngang sườn (Dàn đều trước - sau)";
        } else if (egoLocalX < 0) {
          // VÙNG 2: LỆCH GÓC > 25° VÀ BOX Ở TRƯỚC EGO:
          shiftLx = (lxMin - 0.02) + curL / 2;
          bumperName = "Mặt sau";
        } else {
          // VÙNG 3: LỆCH GÓC > 25° VÀ BOX Ở SAU EGO:
          shiftLx = (lxMax + 0.02) - curL / 2;
          bumperName = "Mặt trước";
        }
      } else {
        const frontCount = bodyPts.filter((p) => p.lx > 0).length;
        const rearCount = bodyPts.filter((p) => p.lx <= 0).length;
        if (frontCount > rearCount * 1.5) {
          shiftLx = (lxMax + 0.02) - curL / 2;
          bumperName = "Mặt trước";
        } else if (rearCount > frontCount * 1.5) {
          shiftLx = (lxMin - 0.02) + curL / 2;
          bumperName = "Mặt sau";
        } else {
          shiftLx = (lxMin + lxMax) / 2;
          bumperName = "Cân đối";
        }
      }

      shiftLx = Math.max(-0.35, Math.min(0.35, shiftLx));
      if (Math.abs(shiftLx) < 0.005) shiftLx = 0;
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
      let shiftLy = 0;
      const edgePadding = 0.025; // 2.5cm

      if (options.egoPos) {
        const toEgoX = options.egoPos.x - cx;
        const toEgoY = options.egoPos.y - cy;
        const egoLocalX = toEgoX * Math.cos(yaw) + toEgoY * Math.sin(yaw);
        const egoLocalY = -toEgoX * Math.sin(yaw) + toEgoY * Math.cos(yaw);

        // Khi Ego nhìn chính diện trước/sau (|egoLocalY| <= |egoLocalX| * 0.15 && |egoLocalY| < 0.10)
        if (Math.abs(egoLocalY) <= Math.abs(egoLocalX) * 0.15 && Math.abs(egoLocalY) < 0.10) {
          visibleSide = "center";
          shiftLy = (lyMin + lyMax) / 2;
        } else if (egoLocalY >= 0) {
          visibleSide = "left";
          shiftLy = (lyMax + edgePadding) - curW / 2;
        } else {
          visibleSide = "right";
          shiftLy = (lyMin - edgePadding) + curW / 2;
        }
      } else {
        const leftCount = bodyPts.filter((p) => p.ly > 0.03).length;
        const rightCount = bodyPts.filter((p) => p.ly < -0.03).length;
        if (leftCount > rightCount * 1.3) {
          visibleSide = "left";
          shiftLy = (lyMax + edgePadding) - curW / 2;
        } else if (rightCount > leftCount * 1.3) {
          visibleSide = "right";
          shiftLy = (lyMin - edgePadding) + curW / 2;
        } else {
          visibleSide = "center";
          shiftLy = (lyMin + lyMax) / 2;
        }
      }

      shiftLy = Math.max(-0.35, Math.min(0.35, shiftLy));
      if (Math.abs(shiftLy) < 0.005) shiftLy = 0;
      newX = Number((cx - shiftLy * Math.sin(yaw)).toFixed(3));
      newY = Number((cy + shiftLy * Math.cos(yaw)).toFixed(3));

      const signY = shiftLy >= 0 ? "+" : "";
      const sideText = visibleSide === "left" ? "Sườn Trái đón tia Ego" : visibleSide === "right" ? "Sườn Phải đón tia Ego" : "Cân đối 2 sườn";
      msg = `Đã căn FRONT Người đi bộ: [${sideText}] ôm sát viền đón tia (ΔY: ${signY}${(shiftLy * 100).toFixed(1)}cm, giữ nguyên Z), Khóa size ${curL}x${curW}x${curH}m`;
    } else if (step === "l") {
      // 4. FIX RIÊNG CHIỀU DÀI L (Bắt trọn sải chân, tự thích ứng ít điểm & kháng ghosting)
      newYaw = yaw;
      newYawDeg = curYawDeg;
      deltaYawDeg = 0;
      newW = curW;
      newH = curH;
      newZ = cz;

      const spanL = (lxMax - lxMin) + 0.05;
      let shiftLx = 0;

      if (spanL > 0.78) {
        // Kháng Ghosting: Chặn trần L <= 0.78m, ưu tiên căn mép đón tia Ego
        newL = 0.78;
        if (options.egoPos) {
          const toEgoX = options.egoPos.x - cx;
          const toEgoY = options.egoPos.y - cy;
          const egoLocalX = toEgoX * Math.cos(yaw) + toEgoY * Math.sin(yaw);
          const egoLocalY = -toEgoX * Math.sin(yaw) + toEgoY * Math.cos(yaw);
          const isSideBeamParallel = Math.abs(egoLocalX) <= Math.abs(egoLocalY) * 0.466;

          if (isSideBeamParallel) {
            shiftLx = (lxMin + lxMax) / 2;
          } else if (egoLocalX < 0) {
            shiftLx = (lxMin - 0.02) + newL / 2;
          } else {
            shiftLx = (lxMax + 0.02) - newL / 2;
          }
        } else {
          shiftLx = (lxMin + lxMax) / 2;
        }
      } else {
        newL = Number(Math.max(0.35, Math.min(0.78, spanL)).toFixed(2));
        shiftLx = (lxMin + lxMax) / 2;
      }

      shiftLx = Math.max(-0.35, Math.min(0.35, shiftLx));
      newX = Number((cx + shiftLx * Math.cos(yaw)).toFixed(3));
      newY = Number((cy + shiftLx * Math.sin(yaw)).toFixed(3));

      const signX = shiftLx >= 0 ? "+" : "";
      msg = `Đã fix Chiều Dài (L) Người đi bộ: L=${newL}m (căn tâm X: ${signX}${(shiftLx * 100).toFixed(1)}cm, kháng ghosting), giữ nguyên W, H & Z`;
    } else if (step === "w") {
      // 5. FIX RIÊNG CHIỀU RỘNG W (Bắt trọn vai/ngực, đệm nhẹ +4cm ôm sát)
      newYaw = yaw;
      newYawDeg = curYawDeg;
      deltaYawDeg = 0;
      newL = curL;
      newH = curH;
      newZ = cz;

      const spanW = (lyMax - lyMin) + 0.04;
      let shiftLy = 0;

      if (spanW > 0.68) {
        // Kháng Ghosting: Chặn trần W <= 0.68m, ưu tiên căn mép đón tia Ego
        newW = 0.68;
        if (options.egoPos) {
          const toEgoX = options.egoPos.x - cx;
          const toEgoY = options.egoPos.y - cy;
          const egoLocalY = -toEgoX * Math.sin(yaw) + toEgoY * Math.cos(yaw);
          if (egoLocalY > 0.04) {
            shiftLy = (lyMax + 0.01) - newW / 2;
          } else if (egoLocalY < -0.04) {
            shiftLy = (lyMin - 0.01) + newW / 2;
          } else {
            shiftLy = (lyMin + lyMax) / 2;
          }
        } else {
          shiftLy = (lyMin + lyMax) / 2;
        }
      } else {
        newW = Number(Math.max(0.35, Math.min(0.68, spanW)).toFixed(2));
        shiftLy = (lyMin + lyMax) / 2;
      }

      shiftLy = Math.max(-0.35, Math.min(0.35, shiftLy));
      newX = Number((cx - shiftLy * Math.sin(yaw)).toFixed(3));
      newY = Number((cy + shiftLy * Math.cos(yaw)).toFixed(3));

      const signY = shiftLy >= 0 ? "+" : "";
      msg = `Đã fix Chiều Rộng (W) Người đi bộ: W=${newW}m (căn tâm Y: ${signY}${(shiftLy * 100).toFixed(1)}cm, vừa khít vai), giữ nguyên L, H & Z`;
    } else if (step === "h") {
      // 6. FIX RIÊNG CHIỀU CAO H (Ground-Lock: Đáy Z_base cố định, nở lên nóc +5cm đệm đầu)
      newYaw = yaw;
      newYawDeg = curYawDeg;
      deltaYawDeg = 0;
      newL = curL;
      newW = curW;
      newX = cx;
      newY = cy;

      const currentBaseZ = cz - curH / 2;
      const effectiveBaseZ = Math.abs(currentBaseZ - groundZ) <= 0.35 ? currentBaseZ : groundZ;

      const roofTopZ = highestPtZ + headBuffer;
      const maxCapPedH = options.headBuffer !== undefined ? 1.95 : 1.78;
      newH = Number(Math.max(1.00, Math.min(maxCapPedH, roofTopZ - effectiveBaseZ)).toFixed(2));
      newZ = Number((effectiveBaseZ + newH / 2).toFixed(3));

      msg = `Đã fix Chiều Cao (H) Người đi bộ: H=${newH}m (Đáy bám sàn Z=${effectiveBaseZ.toFixed(2)}m cố định, nở lên đỉnh đầu +${Math.round(headBuffer * 100)}cm gọn gàng), giữ nguyên L, W & XY`;
    } else {
      // 7. TOÀN DIỆN (ALL): 1-Click Smart Fit (Kháng Ghosting L<=0.78m, W<=0.68m)
      const spanL = (lxMax - lxMin) + 0.05;
      newL = Number(Math.max(0.40, Math.min(0.78, spanL)).toFixed(2));
      const spanW = (lyMax - lyMin) + 0.04;
      newW = Number(Math.max(0.38, Math.min(0.68, spanW)).toFixed(2));

      const roofTopZ = highestPtZ + headBuffer;
      const maxCapPedH = options.headBuffer !== undefined ? 1.95 : 1.78;
      newH = Number(Math.max(1.05, Math.min(maxCapPedH, roofTopZ - groundZ)).toFixed(2));

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
    const headBuffer = options.headBuffer ?? 0.02;
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

    // 2. Thu thập điểm thân xe và bánh xe:
    // - Tầng thân xe & người lái (Core): Z in [groundZ + 0.25m, groundZ + 2.00m]
    // - Tầng lốp/bánh xe sát đất: Z in [groundZ + 0.08m, groundZ + 0.25m] (ở SIDE & FRONT hạ xuống groundZ + 0.02m để giữ trọn curpoint)
    // GIỮ TRỌN CURPOINT: Không gạt bỏ bánh xe khi thân có nhiều điểm (tránh cắt mất curpoint lốp xe trước/sau)
    const minCoreZ = groundZ + 0.25;
    const maxBodyZ = groundZ + 2.00;
    const minWheelZ = (step === "side" || step === "front") ? groundZ + 0.02 : groundZ + 0.08;
    const outerL = curL / 2 + 0.45;
    const outerW = Math.max(curW, 0.85) / 2 + 0.45;

    const cosY = Math.cos(-yaw);
    const sinY = Math.sin(-yaw);
    const corePts: Array<{ lx: number; ly: number; z: number; intensity: number }> = [];
    const wheelPts: Array<{ lx: number; ly: number; z: number; intensity: number }> = [];

    for (let i = 0; i < count; i++) {
      const z = array[i * 3 + 2];
      if (z < minWheelZ || z > maxBodyZ) continue;
      const x = array[i * 3];
      const y = array[i * 3 + 1];
      const dx = x - cx;
      const dy = y - cy;
      const lx = dx * cosY - dy * sinY;
      const ly = dx * sinY + dy * cosY;
      const intensity = lidar.getIntensityAt(i);
      if (Math.abs(lx) <= outerL && Math.abs(ly) <= outerW) {
        if (z >= minCoreZ) {
          corePts.push({ lx, ly, z, intensity });
        } else {
          // Điểm bánh xe sát đất: chỉ loại bỏ các tia quét xiên loang quá xa ngoài trục xe
          if (Math.abs(ly) <= Math.max(0.25, curW / 2 + 0.08)) {
            wheelPts.push({ lx, ly, z, intensity });
          }
        }
      }
    }

    // Phối hợp điểm:
    // - Ở nút SIDE & FRONT: Tính luôn cả điểm bánh xe để cản trước/sau và sườn đón tia ôm trọn curpoint lốp xe ngoài cùng
    // - Ở các nút Fit Size (W, H) & ALL: Ưu tiên tầng thân xe nếu có >= 8 điểm để chống phình to kích thước do vệt quét sát đất
    let rawPts: Array<{ lx: number; ly: number; z: number }>;
    if (step === "side" || step === "front") {
      rawPts = [...corePts, ...wheelPts];
    } else {
      rawPts = corePts.length >= 8 ? corePts : [...corePts, ...wheelPts];
    }

    const isSparse = rawPts.length <= 12;
    // Giảm cắt nhiễu bớt đi: Dùng maxGapLx = 0.38m ở Side để nối thông lốp trước/sau; maxGapLy = 0.35m ở Front để nối thông gương/tay lái
    const maxGapLx = (step === "side" || isSparse) ? 0.38 : 0.28;
    const maxGapLy = (step === "front" || isSparse) ? 0.35 : 0.24;
    const clusterLy = filterDenseConnectedCluster1D(rawPts, "ly", maxGapLy, 0);
    const bodyPts = filterDenseConnectedCluster1D(clusterLy, "lx", maxGapLx, 0);

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

    // Giảm cắt nhiễu bớt đi: Chỉ cắt 1% nếu mây điểm cực đông (>= 35 điểm), không cắt mất curpoint gương/tay lái
    const pMinIdx = !isSparse && bodyPts.length >= 35 ? Math.floor(bodyPts.length * 0.01) : 0;
    const pMaxIdx = !isSparse && bodyPts.length >= 35 ? Math.min(bodyPts.length - 1, Math.floor(bodyPts.length * 0.99)) : bodyPts.length - 1;

    const lxMin = allLx[pMinIdx];
    const lxMax = allLx[pMaxIdx];
    const lyMin = allLy[pMinIdx];
    const lyMax = allLy[pMaxIdx];
    // Cắt thung lũng mật độ trục Z (loại bỏ 100% điểm nhiễu lơ lửng trên cao gap > 15cm)
    const highestPtZ = detectTrueHeadZInMainWorld(allZ, 0.15, groundZ, 1.60);

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

      // 2. Vector nối Trọng tâm Cụm Đuôi 30% -> Cụm Đầu 30%
      const sorted = [...bodyPts].sort((a, b) => a.lx - b.lx);
      const sliceCount = Math.max(1, Math.floor(n * 0.30));
      const rearSlice = sorted.slice(0, sliceCount);
      const frontSlice = sorted.slice(Math.max(sliceCount, n - sliceCount));

      const rearLx = rearSlice.reduce((s, p) => s + p.lx, 0) / rearSlice.length;
      const rearLy = rearSlice.reduce((s, p) => s + p.ly, 0) / rearSlice.length;
      const frontLx = frontSlice.reduce((s, p) => s + p.lx, 0) / frontSlice.length;
      const frontLy = frontSlice.reduce((s, p) => s + p.ly, 0) / frontSlice.length;

      const dLx = frontLx - rearLx;
      const dLy = frontLy - rearLy;
      let deltaThetaExt = deltaThetaPca;
      if (dLx >= 0.30) {
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
      // 2. CĂN SIDE ĐỘC LẬP: Cản X đón tia, Rider 42% Geometry, Khóa L tuyệt đối
      newYaw = yaw;
      newYawDeg = curYawDeg;
      deltaYawDeg = 0;
      newL = curL;
      newW = curW;
      newH = curH;

      let shiftLx = 0;
      let bumperName = "Đón tia";

      // Phân tích Người Lái (Rider): Người lái ở tầng cao Z >= groundZ + 0.65m
      // Theo chuẩn giải phẫu hình học xe 2 bánh: Người lái ngồi cách cản trước khoảng 42% chiều dài xe (lxRider ~ +0.08 * curL)
      const riderPts = bodyPts.filter((p) => p.z >= groundZ + 0.65);
      const hasRider = riderPts.length >= 2;
      let lxRider = 0;
      if (hasRider) {
        const sortedRiderLx = riderPts.map((p) => p.lx).sort((a, b) => a - b);
        lxRider = sortedRiderLx[Math.floor(sortedRiderLx.length / 2)];
      }

      const distFront = hasRider ? lxMax - lxRider : curL / 2;
      const distRear = hasRider ? lxRider - lxMin : curL / 2;

      // Ngưỡng phát hiện mất bánh xe:
      const isMissingFront = hasRider && distFront < 0.28 * curL;
      const isMissingRear = hasRider && distRear < 0.38 * curL;

      let toEgoX = 0;
      let toEgoY = 0;
      let egoLocalX = 0;
      let egoLocalY = 0;
      let hasEgo = false;
      let isSideBeamParallel = false;

      if (options.egoPos) {
        toEgoX = options.egoPos.x - cx;
        toEgoY = options.egoPos.y - cy;
        egoLocalX = toEgoX * Math.cos(yaw) + toEgoY * Math.sin(yaw);
        egoLocalY = -toEgoX * Math.sin(yaw) + toEgoY * Math.cos(yaw);
        hasEgo = true;
        // Ngưỡng góc 25 độ: tan(25°) ≈ 0.466
        isSideBeamParallel = Math.abs(egoLocalX) <= Math.abs(egoLocalY) * 0.466;
      }

      if (isMissingFront && isMissingRear) {
        // 1. MẤT CẢ 2 BÁNH (Chỉ có điểm người ngồi lái):
        shiftLx = lxRider - 0.08 * curL;
        bumperName = "Người lái 42% (Mất cả 2 bánh)";
      } else if (isMissingFront) {
        // 2. MẤT BÁNH TRƯỚC (Có bánh sau hoặc Ego nhìn từ sau):
        const estFrontEdge = lxRider + 0.42 * curL;
        if (hasEgo && !isSideBeamParallel && egoLocalX < 0) {
          shiftLx = (lxMin - 0.02) + curL / 2;
          bumperName = "Cản sau (Mất bánh trước)";
        } else {
          shiftLx = (lxMin + estFrontEdge) / 2;
          bumperName = "Người lái 42% + Bánh sau (Mất bánh trước)";
        }
      } else if (isMissingRear) {
        // 3. MẤT BÁNH SAU (Có bánh trước hoặc Ego nhìn từ trước):
        const estRearEdge = lxRider - 0.58 * curL;
        if (hasEgo && !isSideBeamParallel && egoLocalX > 0) {
          shiftLx = (lxMax + 0.02) - curL / 2;
          bumperName = "Cản trước (Mất bánh sau)";
        } else {
          shiftLx = (estRearEdge + lxMax) / 2;
          bumperName = "Người lái 42% + Bánh trước (Mất bánh sau)";
        }
      } else {
        // 4. ĐỦ CẢ 2 BÁNH:
        if (hasEgo) {
          if (isSideBeamParallel) {
            // VÙNG 1: CHIẾU NGANG SƯỜN SONG SONG -> DÀN ĐỀU 2 ĐẦU BÁNH XE
            shiftLx = (lxMin + lxMax) / 2;
            bumperName = "Chiếu ngang sườn (Dàn đều 2 bánh)";
          } else if (egoLocalX < 0) {
            // VÙNG 2: LỆCH GÓC > 25° VÀ BOX Ở TRƯỚC EGO -> ƯU TIÊN BẮT CẢN/BÁNH SAU
            shiftLx = (lxMin - 0.03) + curL / 2;
            bumperName = "Cản/Bánh sau đón tia";
          } else {
            // VÙNG 3: LỆCH GÓC > 25° VÀ BOX Ở SAU EGO -> ƯU TIÊN BẮT CẢN/BÁNH TRƯỚC
            shiftLx = (lxMax + 0.03) - curL / 2;
            bumperName = "Cản/Bánh trước đón tia";
          }
        } else {
          const frontCount = bodyPts.filter((p) => p.lx > 0).length;
          const rearCount = bodyPts.filter((p) => p.lx <= 0).length;
          if (frontCount > rearCount * 1.5) {
            shiftLx = (lxMax + 0.03) - curL / 2;
            bumperName = "Cản trước";
          } else if (rearCount > frontCount * 1.5) {
            shiftLx = (lxMin - 0.03) + curL / 2;
            bumperName = "Cản sau";
          } else {
            shiftLx = (lxMin + lxMax) / 2;
            bumperName = "Cân đối";
          }
        }
      }

      shiftLx = Math.max(-0.60, Math.min(0.60, shiftLx));
      if (Math.abs(shiftLx) < 0.005) shiftLx = 0;
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

      // Xác định sườn đón tia (Trái hoặc Phải)
      let visibleSide: "left" | "right" | "center" = "center";
      const edgePadding = 0.03; // 3.0cm đệm bảo vệ gương xe và tay lái
      let shiftLy = 0;

      if (options.egoPos) {
        const toEgoX = options.egoPos.x - cx;
        const toEgoY = options.egoPos.y - cy;
        const egoLocalX = toEgoX * Math.cos(yaw) + toEgoY * Math.sin(yaw);
        const egoLocalY = -toEgoX * Math.sin(yaw) + toEgoY * Math.cos(yaw);

        // Nếu Ego nhìn thẳng chính diện đầu/đuôi xe (|egoLocalY| <= |egoLocalX| * 0.15 && |egoLocalY| < 0.15)
        if (Math.abs(egoLocalY) <= Math.abs(egoLocalX) * 0.15 && Math.abs(egoLocalY) < 0.15) {
          visibleSide = "center";
          shiftLy = (lyMin + lyMax) / 2;
        } else if (egoLocalY >= 0) {
          visibleSide = "left";
          shiftLy = (lyMax + edgePadding) - curW / 2;
        } else {
          visibleSide = "right";
          shiftLy = (lyMin - edgePadding) + curW / 2;
        }
      } else {
        const leftCount = bodyPts.filter((p) => p.ly > 0.05).length;
        const rightCount = bodyPts.filter((p) => p.ly < -0.05).length;
        if (leftCount > rightCount * 1.3) {
          visibleSide = "left";
          shiftLy = (lyMax + edgePadding) - curW / 2;
        } else if (rightCount > leftCount * 1.3) {
          visibleSide = "right";
          shiftLy = (lyMin - edgePadding) + curW / 2;
        } else {
          visibleSide = "center";
          shiftLy = (lyMin + lyMax) / 2;
        }
      }

      shiftLy = Math.max(-0.35, Math.min(0.35, shiftLy));
      if (Math.abs(shiftLy) < 0.005) shiftLy = 0;

      newX = Number((cx - shiftLy * Math.sin(yaw)).toFixed(3));
      newY = Number((cy + shiftLy * Math.cos(yaw)).toFixed(3));

      const signY = shiftLy >= 0 ? "+" : "";
      const sideText = visibleSide === "left" ? "Sườn Trái" : visibleSide === "right" ? "Sườn Phải" : "Cân đối 2 sườn";
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
        // Điểm LiDAR bao quát cả 2 bên: Đệm nhẹ +6cm (+3cm mỗi bên cho tay lái/gương)
        measuredW = (lyMax - lyMin) + 0.06;
        shiftLy = (lyMin + lyMax) / 2;
        shiftLy = Math.max(-0.35, Math.min(0.35, shiftLy));
      } else if (lyMax > 0 && lyMin > -0.06) {
        // Điểm LiDAR chỉ ở SƯỜN TRÁI -> Mở rộng đối xứng qua trục dọc bánh xe +5cm đệm gương
        measuredW = 2 * (lyMax + 0.05);
        shiftLy = 0;
      } else if (lyMin < 0 && lyMax < 0.06) {
        // Điểm LiDAR chỉ ở SƯỜN PHẢI -> Mở rộng đối xứng qua trục dọc bánh xe +5cm đệm gương
        measuredW = 2 * (Math.abs(lyMin) + 0.05);
        shiftLy = 0;
      } else {
        measuredW = (lyMax - lyMin) + 0.06;
        shiftLy = (lyMin + lyMax) / 2;
        shiftLy = Math.max(-0.35, Math.min(0.35, shiftLy));
      }

      // Kháng Ghosting: Giới hạn trần an toàn W <= 0.85m cho xe 2 bánh (chống bóng ma dãn ngang phình to)
      if (measuredW > 0.85) {
        newW = 0.85;
        if (options.egoPos) {
          const toEgoX = options.egoPos.x - cx;
          const toEgoY = options.egoPos.y - cy;
          const egoLocalY = -toEgoX * Math.sin(yaw) + toEgoY * Math.cos(yaw);
          if (egoLocalY > 0.05) {
            shiftLy = (lyMax + 0.03) - newW / 2;
          } else if (egoLocalY < -0.05) {
            shiftLy = (lyMin - 0.03) + newW / 2;
          }
        }
      } else {
        newW = Number(Math.max(0.55, Math.min(0.85, measuredW)).toFixed(2));
      }
      shiftLy = Math.max(-0.35, Math.min(0.35, shiftLy));

      newX = Number((cx - shiftLy * Math.sin(yaw)).toFixed(3));
      newY = Number((cy + shiftLy * Math.cos(yaw)).toFixed(3));

      const signY = shiftLy >= 0 ? "+" : "";
      msg = `Đã fit Rộng (W) Xe 2 bánh: W=${newW}m (Đệm +3cm vừa khít gương/tay lái), căn Y: ${signY}${(shiftLy * 100).toFixed(1)}cm, giữ nguyên L, H & Z`;
    } else if (step === "h") {
      // -------------------------------------------------------------
      // CHẾ ĐỘ FIT RIÊNG CHIỀU CAO H: Bám sàn Z_base cố định, nở lên nóc gọn gàng
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

      const roofTopZ = highestPtZ + headBuffer;
      const maxCap2WH = options.headBuffer !== undefined ? 1.85 : 1.68;
      newH = Number(Math.max(1.05, Math.min(maxCap2WH, roofTopZ - effectiveBaseZ)).toFixed(2));
      newZ = Number((effectiveBaseZ + newH / 2).toFixed(3));

      msg = `Đã fit Cao (H) Xe 2 bánh: H=${newH}m (Đáy bám sàn Z=${effectiveBaseZ.toFixed(2)}m cố định, nở lên nóc +${Math.round(headBuffer * 100)}cm gọn gàng), giữ nguyên L, W & XY`;
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
        measuredW = lyMax - lyMin + 0.06;
        shiftLy = (lyMin + lyMax) / 2;
        shiftLy = Math.max(-0.35, Math.min(0.35, shiftLy));
      } else if (lyMax > 0 && lyMin > -0.06) {
        measuredW = 2 * (lyMax + 0.05);
        shiftLy = 0;
      } else if (lyMin < 0 && lyMax < 0.06) {
        measuredW = 2 * (Math.abs(lyMin) + 0.05);
        shiftLy = 0;
      } else {
        measuredW = lyMax - lyMin + 0.06;
        shiftLy = (lyMin + lyMax) / 2;
        shiftLy = Math.max(-0.35, Math.min(0.35, shiftLy));
      }

      newW = Number(Math.max(0.55, Math.min(0.85, measuredW)).toFixed(2));

      const roofTopZ = highestPtZ + headBuffer;
      const maxCap2WH = options.headBuffer !== undefined ? 1.85 : 1.68;
      newH = Number(Math.max(1.05, Math.min(maxCap2WH, roofTopZ - groundZ)).toFixed(2));
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

  // =========================================================================
  // TỪ ĐIỂN NHÃN VÀ HÀM CĂN GIỮA / TẬP TRUNG VIEW 3D (MAIN WORLD LEVEL)
  // =========================================================================
  const mainWorldLabelsCache = new Map<number, { name: string; color: string }>();

  function updateMainWorldLabels(job?: any): void {
    try {
      const store = getReduxStore();
      const storeJob = store?.getState()?.annotation?.job?.instance || job;
      const labels = storeJob?.labels || storeJob?.task?.labels || store?.getState()?.annotation?.job?.labels;
      if (Array.isArray(labels)) {
        for (const l of labels) {
          if (l && l.id !== undefined) {
            mainWorldLabelsCache.set(Number(l.id), {
              name: l.name || "Object",
              color: l.color || "#3b82f6",
            });
          }
        }
      }
    } catch (_) {}
  }

  function resolveLabelName(stateOrShape: any): { name: string; color: string } {
    if (stateOrShape?.label && typeof stateOrShape.label.name === "string" && stateOrShape.label.name.trim()) {
      return {
        name: stateOrShape.label.name.trim(),
        color: stateOrShape.label.color || "#22c55e",
      };
    }
    const lblId = stateOrShape?.labelID ?? stateOrShape?.labelId ?? stateOrShape?.label_id;
    if (lblId !== undefined && mainWorldLabelsCache.has(Number(lblId))) {
      return mainWorldLabelsCache.get(Number(lblId))!;
    }
    return { name: "Car", color: "#22c55e" };
  }

  // Căn giữa (Center) và tập trung (Focus) View 3D vào đối tượng tức thì (Perspective & Orthographic Views)
  function center3DViewOnObject(uiId: number, targetPos?: { x: number; y: number; z: number }): boolean {
    try {
      const store = getReduxStore();
      const canvas = store?.getState()?.annotation?.canvas?.instance;
      if (!canvas || !canvas.view) return false;

      // 1. Thử gọi hàm center hoặc focus bản địa của CVAT canvas nếu có
      try {
        if (typeof (canvas as any).center === "function") {
          (canvas as any).center(uiId);
        }
        if (typeof (canvas.view as any)?.center === "function") {
          (canvas.view as any).center(uiId);
        }
        if (typeof (canvas.view as any)?.focus === "function") {
          (canvas.view as any).focus(uiId);
        }
      } catch (_) {}

      // 2. Tìm tọa độ tâm box (x, y, z)
      let pos = targetPos;
      if (!pos) {
        const drawn = canvas.view?.drawnObjects?.[String(uiId)];
        if (drawn?.data?.points && Array.isArray(drawn.data.points)) {
          pos = {
            x: drawn.data.points[0],
            y: drawn.data.points[1],
            z: drawn.data.points[2],
          };
        }
      }

      if (!pos || typeof pos.x !== "number" || isNaN(pos.x)) return false;

      // 3. Can thiệp Three.js Views (Perspective, Top, Side, Front)
      const views = canvas.view.views;
      if (views) {
        // A. Perspective 3D View: Dời controls.target và tịnh tiến camera giữ nguyên góc nhìn
        const pView = views.perspective;
        if (pView?.controls?.target) {
          const curTarget = pView.controls.target;
          const deltaX = pos.x - curTarget.x;
          const deltaY = pos.y - curTarget.y;
          const deltaZ = pos.z - curTarget.z;

          // Dời tâm xoay target về tâm box
          curTarget.set(pos.x, pos.y, pos.z);

          // Tịnh tiến camera để giữ nguyên góc nghiêng và cự ly quan sát
          if (pView.camera) {
            pView.camera.position.x += deltaX;
            pView.camera.position.y += deltaY;
            pView.camera.position.z += deltaZ;
            pView.camera.lookAt(pos.x, pos.y, pos.z);
          }
          if (typeof pView.controls.update === "function") {
            pView.controls.update();
          }
        }

        // B. Orthographic Views (Top, Side, Front Views)
        for (const viewName of ["top", "side", "front"]) {
          const oView = views[viewName];
          if (oView) {
            if (oView.controls?.target) {
              const curTarget = oView.controls.target;
              const deltaX = pos.x - curTarget.x;
              const deltaY = pos.y - curTarget.y;
              const deltaZ = pos.z - curTarget.z;

              // Tịnh tiến camera position của Top, Side, Front views để không bị lệch hoặc văng khỏi khung nhìn
              if (oView.camera) {
                oView.camera.position.x += deltaX;
                oView.camera.position.y += deltaY;
                oView.camera.position.z += deltaZ;
              }

              curTarget.set(pos.x, pos.y, pos.z);
              if (typeof oView.controls.update === "function") {
                oView.controls.update();
              }
            }
            if (typeof oView.updateControls === "function") {
              oView.updateControls();
            }
          }
        }

        // C. Ép Three.js re-render ngay lập tức
        if (typeof canvas.render === "function") {
          canvas.render();
        }
      }

      return true;
    } catch (err) {
      console.warn("[CVAT 3D Suite] Lỗi center3DViewOnObject:", err);
      return false;
    }
  }

  // Cấu hình & Biến theo dõi tính năng Ghim Tâm khi tua frame (Sticky Track Lock-On)
  let autoCenterOnFrameChange = true;
  let lastActiveTrackId: number | null = null;
  let persistentActiveTrackId: number | null = null; // Khóa chặt Track ID bền vững xuyên suốt mọi frame
  let isFrameTransitioning = false;
  let frameTransitionTimer: any = null;

  // Cập nhật Track ID bền vững khi người dùng chọn đối tượng
  function updateLockedTrackId(clientId: number): void {
    if (clientId === null || clientId === undefined || isNaN(clientId)) return;
    try {
      const store = getReduxStore();
      const states = store?.getState()?.annotation?.annotations?.states || [];
      const st = states.find((s: any) => Number(s.clientID) === Number(clientId));
      if (st) {
        const tid = st.parentID ?? st.trackID ?? st.parent?.clientID;
        if (tid !== undefined && tid !== null && !isNaN(Number(tid))) {
          persistentActiveTrackId = Number(tid);
          return;
        }
      }
    } catch (_) {}
    persistentActiveTrackId = Number(clientId);
  }

  // Dò tìm tọa độ và ghim tâm đối tượng đang active khi chuyển frame (Sticky Track Lock-On)
  function lockOnActiveObjectAtFrame(targetId: number, targetFrame: number, attempt: number = 0): void {
    try {
      const store = getReduxStore();
      const anno = store?.getState()?.annotation;
      const canvas = anno?.canvas?.instance;
      const states = anno?.annotations?.states || [];

      // 1. Dò tìm đối tượng theo Track ID bền vững (persistentActiveTrackId) để CHỐNG NHẢY SANG ID KHÁC
      let matchedState: any = null;
      if (persistentActiveTrackId !== null) {
        matchedState = states.find(
          (s: any) =>
            (Number(s.parentID ?? s.trackID ?? s.parent?.clientID) === Number(persistentActiveTrackId) ||
              Number(s.clientID) === Number(persistentActiveTrackId)) &&
            !s.outside
        );
      }

      if (!matchedState && targetId !== null && targetId !== undefined && !isNaN(targetId)) {
        matchedState = states.find(
          (s: any) =>
            (Number(s.clientID) === Number(targetId) ||
              Number(s.parentID ?? s.trackID ?? s.parent?.clientID) === Number(targetId)) &&
            !s.outside
        );
      }

      let activeIdToUse = targetId;
      let foundPos: { x: number; y: number; z: number } | null = null;

      if (matchedState) {
        activeIdToUse = Number(matchedState.clientID);
        if (Array.isArray(matchedState.points) && matchedState.points.length >= 3) {
          foundPos = {
            x: matchedState.points[0],
            y: matchedState.points[1],
            z: matchedState.points[2],
          };
        }
      } else {
        const drawnItem = canvas?.view?.drawnObjects?.[String(targetId)];
        if (drawnItem?.data?.points && Array.isArray(drawnItem.data.points) && !drawnItem.data.outside) {
          foundPos = {
            x: drawnItem.data.points[0],
            y: drawnItem.data.points[1],
            z: drawnItem.data.points[2],
          };
        }
      }

      // Kiểm tra xem Three.js đã tạo mesh cho đối tượng này chưa
      const isMeshReady = !!canvas?.view?.drawnObjects?.[String(activeIdToUse)];

      // 2. Kích hoạt và ghim tâm
      if (foundPos && typeof foundPos.x === "number" && !isNaN(foundPos.x)) {
        // A. Kích hoạt lại đúng box trên canvas 3D để bật hiển thị Top, Side, Front views
        if (canvas && typeof canvas.activate === "function") {
          try {
            canvas.activate(activeIdToUse);
          } catch (_) {}
        }

        // B. Đồng bộ Redux Store
        if (store && typeof store.dispatch === "function") {
          try {
            store.dispatch({
              type: "ACTIVATE_OBJECT",
              payload: { activatedStateClientID: activeIdToUse, activatedElementID: activeIdToUse },
            });
          } catch (_) {}
        }

        // C. Căn giữa Top, Side, Front và Perspective theo tâm xe (nếu bật ghim tâm)
        if (autoCenterOnFrameChange) {
          center3DViewOnObject(activeIdToUse, foundPos);
        }

        // D. Đồng bộ highlight Sidebar
        try {
          const sidebarItem =
            document.querySelector<HTMLElement>(`#cvat-objects-sidebar-state-item-${activeIdToUse}`) ||
            document.querySelector<HTMLElement>(`[data-cvat-state-item-id="${activeIdToUse}"]`) ||
            document.querySelector<HTMLElement>(`[class*="cvat-objects-sidebar-state-item"][id*="${activeIdToUse}"]`);
          if (sidebarItem) {
            sidebarItem.scrollIntoView({ block: "nearest", behavior: "smooth" });
            const allItems = document.querySelectorAll<HTMLElement>("[class*='cvat-objects-sidebar-state-item']");
            allItems.forEach((el) => el.classList.remove("cvat-objects-sidebar-state-item-active", "selected"));
            sidebarItem.classList.add("cvat-objects-sidebar-state-item-active", "selected");
          }
        } catch (_) {}

        if (typeof canvas.render === "function") {
          canvas.render();
        }

        // Thông báo cho Extension biết xe đã được kích hoạt lại thành công
        const details = extractObjectDetails(activeIdToUse);
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_RES_OBJECT_ACTIVATED", {
            detail: { clientId: activeIdToUse, details },
          })
        );
      }

      // 3. Thử lại lũy tiến để đảm bảo Three.js load xong và không bị CVAT ghi đè mất focus
      const delays = [40, 100, 220, 450, 750];
      if (attempt < delays.length) {
        setTimeout(() => {
          const curF = anno?.player?.frame?.number ?? store?.getState()?.annotation?.job?.instance?.frame;
          if (curF === targetFrame) {
            lockOnActiveObjectAtFrame(targetId, targetFrame, attempt + 1);
          }
        }, delays[attempt]);
      } else if (!matchedState && attempt >= delays.length) {
        // Hết lượt thử mà không tìm thấy track này ở frame mới -> đối tượng kết thúc hoặc outside
        window.dispatchEvent(new CustomEvent("CVAT_EXT_RES_OBJECT_DEACTIVATED"));
      }
    } catch (err) {
      console.warn("[CVAT 3D Suite] Lỗi lockOnActiveObjectAtFrame:", err);
    }
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

      // 3. Tự động căn giữa và tập trung View 3D vào chiếc xe vừa chỉnh sửa
      if (newPos) {
        center3DViewOnObject(uiId, newPos);
      } else {
        center3DViewOnObject(uiId);
      }

      if (typeof canvas.render === "function") {
        canvas.render();
      }

      if (currentColorizeBoxed) {
        applyPointCloudColorizationInMainWorld();
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

      // Cập nhật từ điển nhãn từ Redux Job instance
      updateMainWorldLabels();

      // 1. Thử lấy từ Three.js canvas drawnObjects
      const drawnItem = canvas?.view?.drawnObjects?.[String(clientId)];
      if (drawnItem && drawnItem.data && Array.isArray(drawnItem.data.points)) {
        const p = drawnItem.data.points;
        const resolved = resolveLabelName(drawnItem.data);
        return {
          clientId,
          serverId: drawnItem.data.serverID || null,
          label: resolved.name,
          color: resolved.color,
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
        const resolved = resolveLabelName(matched);
        return {
          clientId,
          serverId: matched.serverID || null,
          label: resolved.name,
          color: resolved.color,
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

  // Thiết lập bộ theo dõi tương tác chuột & bàn phím trên Canvas 3D (Realtime Point Cloud Color Update)
  let isInteractiveWatcherAttached = false;
  function setupCanvasInteractiveWatcher(): void {
    if (isInteractiveWatcherAttached) return;
    isInteractiveWatcherAttached = true;

    let isCanvasInteracting = false;
    let dragRafId: number | null = null;

    const onPointerMove = () => {
      if (!isCanvasInteracting || !currentColorizeBoxed) return;
      if (dragRafId !== null) return;
      dragRafId = requestAnimationFrame(() => {
        dragRafId = null;
        if (isCanvasInteracting && currentColorizeBoxed) {
          applyPointCloudColorizationInMainWorld();
        }
      });
    };

    const onPointerUp = () => {
      if (!isCanvasInteracting) return;
      isCanvasInteracting = false;
      if (dragRafId !== null) {
        cancelAnimationFrame(dragRafId);
        dragRafId = null;
      }
      if (currentColorizeBoxed) {
        applyPointCloudColorizationInMainWorld();
        // Quét bổ sung tức thì sau 80ms và 220ms để bắt trọn tọa độ commit sau khi nhả chuột
        setTimeout(() => applyPointCloudColorizationInMainWorld(), 80);
        setTimeout(() => applyPointCloudColorizationInMainWorld(), 220);
      }
    };

    // Gắn listener trên toàn bộ window với capture để bắt đầu tương tác ngay cả khi component con stop propagation
    window.addEventListener(
      "pointerdown",
      (e: PointerEvent) => {
        const target = e.target as HTMLElement;
        if (target && target.closest && target.closest(".cvat-canvas-container, .cvat-canvas3d-orthographic-view, [class*='cvat-canvas3d'], canvas")) {
          isCanvasInteracting = true;
        }
      },
      { capture: true, passive: true }
    );
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    window.addEventListener("pointercancel", onPointerUp, { passive: true });

    // Gắn pointerdown trên các canvas container
    const attachPointerDown = () => {
      const canvasElements = document.querySelectorAll<HTMLElement>(
        ".cvat-canvas-container, .cvat-canvas3d-orthographic-view, [class*='cvat-canvas3d'], canvas"
      );
      canvasElements.forEach((el) => {
        if ((el as any)._hasColorDragWatcher) return;
        (el as any)._hasColorDragWatcher = true;
        el.addEventListener(
          "pointerdown",
          () => {
            isCanvasInteracting = true;
            try {
              const store = getReduxStore();
              const canvas = store?.getState()?.annotation?.canvas?.instance;
              const activeId =
                canvas?.view?.activatedElementID ||
                store?.getState()?.annotation?.annotations?.activatedStateClientID;
              if (activeId !== null && activeId !== undefined) {
                updateLockedTrackId(Number(activeId));
              }
            } catch (_) {}
          },
          { passive: true }
        );
      });
    };

    attachPointerDown();
    setInterval(attachPointerDown, 2000);

    // Lắng nghe phím tắt di chuyển/co giãn box (WASD, phím mũi tên, v.v.)
    let keyDebounceTimer: any = null;
    window.addEventListener(
      "keydown",
      (e: KeyboardEvent) => {
        if (!currentColorizeBoxed) return;
        const target = e.target as HTMLElement;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || (target as any).isContentEditable)) {
          return;
        }

        const relevantKeys = [
          "KeyW", "KeyA", "KeyS", "KeyD",
          "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
          "KeyQ", "KeyE", "KeyR", "KeyT", "KeyF", "KeyZ", "KeyX", "KeyC",
        ];
        if (relevantKeys.includes(e.code) || e.ctrlKey || e.altKey || e.shiftKey) {
          if (keyDebounceTimer) clearTimeout(keyDebounceTimer);
          keyDebounceTimer = setTimeout(() => {
            keyDebounceTimer = null;
            applyPointCloudColorizationInMainWorld();
          }, 60);
        }
      },
      { passive: true }
    );
  }

  // Thiết lập cơ chế tự động chọn xe khi click vào box trên Canvas 3D & Redux Subscriber Realtime
  let isCanvasAutoSelectAttached = false;
  function setupCanvasAutoSelect(retryCount = 0): void {
    if (isCanvasAutoSelectAttached) return;

    const store = getReduxStore();
    const canvasContainers = document.querySelectorAll<HTMLElement>(
      ".cvat-canvas-container, .cvat-canvas3d-orthographic-view"
    );

    // Nếu chưa có canvas containers hoặc Redux store chưa sẵn sàng, retry sau 1s (tối đa 15 lần)
    if ((canvasContainers.length === 0 || !store) && retryCount < 15) {
      setTimeout(() => setupCanvasAutoSelect(retryCount + 1), 1000);
      return;
    }

    isCanvasAutoSelectAttached = true;
    setupCanvasInteractiveWatcher();

    canvasContainers.forEach((container) => {
      container.addEventListener("pointerup", () => {
        setTimeout(() => {
          try {
            const currentStore = getReduxStore() || store;
            const canvas = currentStore?.getState()?.annotation?.canvas?.instance;
            const activeId =
              canvas?.view?.activatedElementID ||
              currentStore?.getState()?.annotation?.annotations?.activatedStateClientID;

            if (activeId !== null && activeId !== undefined) {
              updateLockedTrackId(Number(activeId));
              const details = extractObjectDetails(Number(activeId));
              window.dispatchEvent(
                new CustomEvent("CVAT_EXT_RES_OBJECT_ACTIVATED", {
                  detail: { clientId: Number(activeId), details },
                })
              );
              if (currentColorizeBoxed) {
                applyPointCloudColorizationInMainWorld();
              }
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
            updateLockedTrackId(id);
            const details = extractObjectDetails(id);
            window.dispatchEvent(
              new CustomEvent("CVAT_EXT_RES_OBJECT_ACTIVATED", {
                detail: { clientId: id, details },
              })
            );
            if (currentColorizeBoxed) {
              applyPointCloudColorizationInMainWorld();
            }
          }
        }, 60);
      }
    });

    // =========================================================================
    // XỬ LÝ SỰ KIỆN HOVER ĐỐI TƯỢNG (TỰ ĐỘNG CẬP NHẬT ID TỨC THÌ KHI RÊ CHUỘT)
    // =========================================================================
    let hoverActivateTimer: any = null;
    function handleObjectHovered(id: number): void {
      if (id === null || id === undefined || isNaN(id) || id <= 0) return;
      if (id === lastActiveTrackId && id === persistentActiveTrackId) return;

      if (hoverActivateTimer) clearTimeout(hoverActivateTimer);
      hoverActivateTimer = setTimeout(() => {
        hoverActivateTimer = null;
        if (id === lastActiveTrackId && id === persistentActiveTrackId) return;

        console.log(`[CVAT 3D Suite] Hover sang đối tượng #${id} -> Tự động update ID và thông số`);
        lastActiveTrackId = id;
        updateLockedTrackId(id);

        const details = extractObjectDetails(id);
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_RES_OBJECT_ACTIVATED", {
            detail: { clientId: id, details, isHover: true },
          })
        );

        if (currentColorizeBoxed) {
          applyPointCloudColorizationInMainWorld();
        }

        try {
          const store = getReduxStore();
          const canvas = store?.getState()?.annotation?.canvas?.instance;
          if (canvas && typeof canvas.activate === "function") {
            const curActive =
              canvas.view?.activatedElementID ||
              store?.getState()?.annotation?.annotations?.activatedStateClientID;
            if (curActive !== id) {
              canvas.activate(id);
              if (typeof canvas.render === "function") {
                canvas.render();
              }
            }
          }

          if (store && typeof store.dispatch === "function") {
            store.dispatch({
              type: "ACTIVATE_OBJECT",
              payload: { activatedStateClientID: id, activatedElementID: id },
            });
          }
        } catch (_) {}

        try {
          const sidebarItem =
            document.querySelector<HTMLElement>(`#cvat-objects-sidebar-state-item-${id}`) ||
            document.querySelector<HTMLElement>(`[data-cvat-state-item-id="${id}"]`) ||
            document.querySelector<HTMLElement>(`[class*="cvat-objects-sidebar-state-item"][id*="${id}"]`);
          if (sidebarItem) {
            sidebarItem.scrollIntoView({ block: "nearest", behavior: "smooth" });
            const allItems = document.querySelectorAll<HTMLElement>("[class*='cvat-objects-sidebar-state-item']");
            allItems.forEach((el) => el.classList.remove("cvat-objects-sidebar-state-item-active", "selected"));
            sidebarItem.classList.add("cvat-objects-sidebar-state-item-active", "selected");
          }
        } catch (_) {}
      }, 50);
    }

    // 1. Theo dõi Hover trên Sidebar của CVAT
    document.addEventListener(
      "mouseover",
      (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (!target) return;
        const sidebarItem = target.closest<HTMLElement>(
          "[class*='cvat-objects-sidebar-state-item'], [class*='cvat-objects-sidebar-states-list-item'], [data-cvat-state-item-id]"
        );
        if (sidebarItem) {
          let id: number | null = null;
          const dataId = sidebarItem.getAttribute("data-cvat-state-item-id") || sidebarItem.getAttribute("data-item-id");
          if (dataId && /^\d+$/.test(dataId)) {
            id = parseInt(dataId, 10);
          } else {
            const match = (sidebarItem.id || sidebarItem.innerText || sidebarItem.textContent || "").match(/#?(\d+)/);
            if (match) id = parseInt(match[1], 10);
          }
          if (id && id > 0 && id !== lastActiveTrackId) {
            handleObjectHovered(id);
          }
        }
      },
      { passive: true }
    );

    // 2. Theo dõi Hover trên Canvas 3D Three.js qua Raycasting siêu nhẹ
    let sharedRaycaster: any = null;
    let sharedMouse: any = null;
    let canvasHoverThrottleTimer: any = null;

    function attachCanvas3DHoverWatcher(): void {
      try {
        const store = getReduxStore();
        const canvas = store?.getState()?.annotation?.canvas?.instance;
        if (!canvas || !canvas.view || !canvas.view.views) return;

        const winThree = (window as any).THREE || canvas?.view?.THREE;
        if (!winThree) return;

        if (!sharedRaycaster && typeof winThree.Raycaster === "function") {
          sharedRaycaster = new winThree.Raycaster();
        }
        if (!sharedMouse && typeof winThree.Vector2 === "function") {
          sharedMouse = new winThree.Vector2();
        }

        const views = canvas.view.views;
        const viewKeys = ["perspective", "top", "side", "front"];

        for (const key of viewKeys) {
          const v = views[key];
          const domEl = v?.renderer?.domElement;
          if (!domEl || (domEl as any).__cvat_hover_watcher_attached__) continue;
          (domEl as any).__cvat_hover_watcher_attached__ = true;

          domEl.addEventListener(
            "pointermove",
            (e: PointerEvent) => {
              if (isCanvasInteracting) return;
              if (canvasHoverThrottleTimer) return;

              canvasHoverThrottleTimer = setTimeout(() => {
                canvasHoverThrottleTimer = null;
                try {
                  if (!sharedRaycaster || !sharedMouse || !v.camera) return;

                  const rect = domEl.getBoundingClientRect();
                  if (rect.width <= 0 || rect.height <= 0) return;

                  sharedMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                  sharedMouse.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

                  sharedRaycaster.setFromCamera(sharedMouse, v.camera);

                  const drawnObjects = canvas.view?.drawnObjects || {};
                  const meshToId = new Map<any, number>();
                  const targetMeshes: any[] = [];

                  for (const idStr of Object.keys(drawnObjects)) {
                    const item = drawnObjects[idStr];
                    const cid = Number(idStr);
                    const cuboid = item?.cuboid;
                    if (!cuboid) continue;

                    const viewObj = cuboid[key] || cuboid.perspective;
                    if (viewObj) {
                      viewObj.traverse((child: any) => {
                        if (child && (child.isMesh || child.type === "Mesh" || child.isLine || child.isLineSegments)) {
                          targetMeshes.push(child);
                          meshToId.set(child, cid);
                        }
                      });
                    }
                  }

                  if (targetMeshes.length === 0) return;

                  const intersects = sharedRaycaster.intersectObjects(targetMeshes, false);
                  if (intersects && intersects.length > 0) {
                    const hitMesh = intersects[0].object;
                    const hitId = meshToId.get(hitMesh);
                    if (hitId !== undefined && hitId !== null && hitId > 0 && hitId !== lastActiveTrackId) {
                      handleObjectHovered(hitId);
                    }
                  }
                } catch (_) {}
              }, 40);
            },
            { passive: true }
          );
        }
      } catch (_) {}
    }

    attachCanvas3DHoverWatcher();
    setInterval(attachCanvas3DHoverWatcher, 2000);

    // LẮNG NGHE REDUX STORE SUBSCRIBE ĐỂ PHÁT HIỆN TỨC THÌ KHI VỪA VẼ XONG BOX MỚI VÀ KHI TUA FRAME
    try {
      const store = getReduxStore();
      if (store) {
        let prevActiveId: any = null;
        let prevStatesLen = 0;
        let prevFrame: any = null;
        let prevPointsFingerprint = "";
        let activeDebounceTimer: any = null;
        let dirtyDebounceTimer: any = null;
        let pointsDebounceTimer: any = null;

        store.subscribe(() => {
          try {
            const anno = store.getState()?.annotation;
            const curActiveId = anno?.annotations?.activatedStateClientID;
            const curStatesLen = anno?.annotations?.states?.length || 0;
            const curFrame = anno?.player?.frame?.number ?? anno?.job?.instance?.frame;

            // 1. PHÁT HIỆN CHUYỂN FRAME HOẶC NẠP FRAME ĐẦU TIÊN (Single-Flight: Hủy frame cũ, kích hoạt duy nhất 1 lần cho frame active)
            if (curFrame !== undefined && curFrame !== null && curFrame !== prevFrame) {
              const oldFrame = prevFrame;
              prevFrame = curFrame;
              prevPointsFingerprint = ""; // Reset fingerprint khi sang frame mới

              isFrameTransitioning = true;
              if (frameTransitionTimer) clearTimeout(frameTransitionTimer);
              frameTransitionTimer = setTimeout(() => {
                isFrameTransitioning = false;
                frameTransitionTimer = null;
              }, 700);

              // Hủy ngay tiến trình của frame cũ và lên lịch render frame mới
              scheduleSingleFrameColorizationAndGround(curFrame, 180);

              if (oldFrame !== null) {
                // Bắn event tức thì thông báo cho Extension
                window.dispatchEvent(
                  new CustomEvent("CVAT_EXT_RES_FRAME_CHANGED", {
                    detail: { frame: curFrame, prevFrame: oldFrame },
                  })
                );

                // GHIM TÂM XE ĐANG ACTIVE VÀO CHÍNH GIỮA MÀN EDIT THỜI GIAN THỰC (STICKY TRACK LOCK-ON)
                const activeIdToLock =
                  persistentActiveTrackId !== null
                    ? persistentActiveTrackId
                    : (curActiveId !== null && curActiveId !== undefined
                        ? Number(curActiveId)
                        : lastActiveTrackId);

                if (activeIdToLock !== null && !isNaN(activeIdToLock)) {
                  lockOnActiveObjectAtFrame(activeIdToLock, curFrame);
                }
              }
            }

            // 2. PHÁT HIỆN THAY ĐỔI ACTIVE OBJECT (2 CHIỀU & DEACTIVATE KHI BỎ CHỌN)
            if (curActiveId !== prevActiveId) {
              prevActiveId = curActiveId;
              if (curActiveId !== null && curActiveId !== undefined) {
                lastActiveTrackId = Number(curActiveId);
                if (!isFrameTransitioning) {
                  updateLockedTrackId(Number(curActiveId));
                }
                if (activeDebounceTimer) clearTimeout(activeDebounceTimer);
                activeDebounceTimer = setTimeout(() => {
                  activeDebounceTimer = null;
                  const details = extractObjectDetails(Number(curActiveId));
                  window.dispatchEvent(
                    new CustomEvent("CVAT_EXT_RES_OBJECT_ACTIVATED", {
                      detail: { clientId: Number(curActiveId), details },
                    })
                  );
                  // Highlight lại mây điểm trong xe active mới
                  applyPointCloudColorizationInMainWorld();
                }, 80);
              } else {
                // Người dùng bỏ chọn hoặc click ra ngoài canvas -> Báo cho Extension biết để ẩn chức năng
                lastActiveTrackId = null;
                persistentActiveTrackId = null;
                if (activeDebounceTimer) clearTimeout(activeDebounceTimer);
                activeDebounceTimer = setTimeout(() => {
                  activeDebounceTimer = null;
                  window.dispatchEvent(new CustomEvent("CVAT_EXT_RES_OBJECT_DEACTIVATED"));
                  applyPointCloudColorizationInMainWorld();
                }, 80);
              }
            }

            // 3. THEO DÕI THAY ĐỔI TỌA ĐỘ / DIMENSIONS / ROTATION CỦA CÁC BOX TRÊN FRAME (POINTS FINGERPRINT)
            const states = anno?.annotations?.states || [];
            let currentPointsFingerprint = "";
            for (let i = 0; i < states.length; i++) {
              const st = states[i];
              if (st && Array.isArray(st.points) && st.points.length >= 9 && !st.outside) {
                const p = st.points;
                // Băm nhanh: clientID, x, y, z, yaw, l, w, h (độ phân giải 2cm)
                currentPointsFingerprint += `${st.clientID}:${Math.round(p[0] * 50)},${Math.round(p[1] * 50)},${Math.round(p[2] * 50)},${Math.round(p[5] * 50)},${Math.round(p[6] * 50)},${Math.round(p[7] * 50)},${Math.round(p[8] * 50)}|`;
              }
            }

            if (currentPointsFingerprint !== prevPointsFingerprint) {
              const isInit = prevPointsFingerprint === "";
              prevPointsFingerprint = currentPointsFingerprint;
              if (!isInit) {
                if (pointsDebounceTimer) clearTimeout(pointsDebounceTimer);
                pointsDebounceTimer = setTimeout(() => {
                  pointsDebounceTimer = null;
                  applyPointCloudColorizationInMainWorld();
                }, 50);
              }
            }

            if (curStatesLen !== prevStatesLen) {
              prevStatesLen = curStatesLen;
              // Debounce 400ms để không bắn liên tục khi CVAT đang nạp batch states lúc khởi động
              if (dirtyDebounceTimer) clearTimeout(dirtyDebounceTimer);
              dirtyDebounceTimer = setTimeout(() => {
                dirtyDebounceTimer = null;
                window.dispatchEvent(new CustomEvent("CVAT_EXT_RES_FRAME_TRACKS_DIRTY"));
                applyPointCloudColorizationInMainWorld();
              }, 400);
            }
          } catch (err) {}
        });
      }
    } catch (sErr) {}

    // Lắng nghe yêu cầu kích hoạt đối tượng từ Extension (Đồng bộ Realtime 3 Tầng & Căn giữa 3D)
    window.addEventListener("CVAT_EXT_REQ_ACTIVATE_OBJECT", (e: any) => {
      const { clientId, pos } = e.detail || {};
      if (clientId === undefined || clientId === null) return;
      const numId = Number(clientId);
      lastActiveTrackId = numId;
      updateLockedTrackId(numId);
      try {
        const store = getReduxStore();
        const canvas = store?.getState()?.annotation?.canvas?.instance;

        // Tầng 1: Kích hoạt trên Canvas 3D Three.js
        if (canvas && typeof canvas.activate === "function") {
          const curActive =
            canvas.view?.activatedElementID ||
            store?.getState()?.annotation?.annotations?.activatedStateClientID;
          if (curActive !== numId) {
            canvas.activate(numId);
            if (typeof canvas.render === "function") {
              canvas.render();
            }
          }
        }

        // Tầng 2: Đồng bộ Redux Store của CVAT Native
        if (store && typeof store.dispatch === "function") {
          try {
            store.dispatch({
              type: "ACTIVATE_OBJECT",
              payload: { activatedStateClientID: numId, activatedElementID: numId },
            });
          } catch (_) {}
        }

        // Tầng 3: Đồng bộ DOM Sidebar của CVAT
        try {
          const sidebarItem =
            document.querySelector<HTMLElement>(`#cvat-objects-sidebar-state-item-${numId}`) ||
            document.querySelector<HTMLElement>(`[data-cvat-state-item-id="${numId}"]`) ||
            document.querySelector<HTMLElement>(`[class*="cvat-objects-sidebar-state-item"][id*="${numId}"]`);
          if (sidebarItem) {
            sidebarItem.scrollIntoView({ block: "nearest", behavior: "smooth" });
            const allItems = document.querySelectorAll<HTMLElement>("[class*='cvat-objects-sidebar-state-item']");
            allItems.forEach((el) => el.classList.remove("cvat-objects-sidebar-state-item-active", "selected"));
            sidebarItem.classList.add("cvat-objects-sidebar-state-item-active", "selected");
          }
        } catch (_) {}

        // Tầng 4: Tự động căn giữa View 3D vào chiếc xe vừa chọn
        center3DViewOnObject(numId, pos);
      } catch (err) {}
    });

    // Lắng nghe yêu cầu đồng bộ ID Track đang chọn từ Extension
    window.addEventListener("CVAT_EXT_REQ_SET_ACTIVE_TRACK", (e: any) => {
      const { trackId } = e.detail || {};
      if (trackId !== undefined && trackId !== null && !isNaN(Number(trackId))) {
        const numTrack = Number(trackId);
        lastActiveTrackId = numTrack;
        persistentActiveTrackId = numTrack;
      }
    });

    // Lắng nghe cấu hình bật/tắt tự động ghim tâm khi tua frame
    window.addEventListener("CVAT_EXT_REQ_SET_AUTO_CENTER_FRAME", (e: any) => {
      const { enabled } = e.detail || {};
      if (typeof enabled === "boolean") {
        autoCenterOnFrameChange = enabled;
        console.log(`[CVAT 3D Suite] Đã ${enabled ? "BẬT" : "TẮT"} tính năng Ghim Tâm khi tua frame.`);
      }
    });

    // Lắng nghe yêu cầu căn giữa trực tiếp vào đối tượng
    window.addEventListener("CVAT_EXT_REQ_CENTER_OBJECT", (e: any) => {
      const { clientId, pos } = e.detail || {};
      if (clientId !== undefined && clientId !== null) {
        center3DViewOnObject(Number(clientId), pos);
      }
    });
  }

  // Khởi chạy listener click canvas
  setTimeout(() => setupCanvasAutoSelect(), 1500);

  // 1. Lắng nghe yêu cầu lấy danh sách xe tại Frame hiện tại
  window.addEventListener("CVAT_EXT_REQ_FRAME_TRACKS", async (e: any) => {
    const { jobId, frame } = e.detail || {};
    try {
      let job = await getActiveJobInstance(jobId);
      let annotations: any[] = [];

      if (job) {
        updateMainWorldLabels(job);
        try {
          annotations = await job.annotations.get(frame);
        } catch (fErr) {
          // Nếu frame vượt quá giới hạn hoặc chưa nạp kịp
          annotations = [];
        }
      } else {
        // Fallback tức thì vào Redux Store nếu Job Instance chưa gắn xong lúc F5
        const store = getReduxStore();
        const reduxStates = store?.getState()?.annotation?.annotations?.states;
        if (Array.isArray(reduxStates) && reduxStates.length > 0) {
          annotations = reduxStates;
        } else {
          // Trả về loading êm dịu lúc F5, tuyệt đối không bịa ID ảo!
          window.dispatchEvent(
            new CustomEvent("CVAT_EXT_RES_FRAME_TRACKS", {
              detail: { success: false, loading: true, frame, list: [] },
            })
          );
          return;
        }
      }
      const list = annotations
        .filter((s: any) => s && s.shapeType === "cuboid" && Array.isArray(s.points) && s.points.length >= 9 && typeof s.clientID === "number")
        .map((s: any) => {
          const p = s.points;
          const resolved = resolveLabelName(s);
          return {
            uiId: s.clientID,       // SỐ CLIENT_ID HIỂN THỊ CHUẨN XÁC 100% TRÊN GIAO DIỆN!
            serverId: s.serverID,   // SỐ SERVER_ID LƯU DƯỚI CƠ SỞ DỮ LIỆU
            label: resolved.name,
            color: resolved.color,
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

      updateMainWorldLabels(job);
      const framesMap = new Map<number, any>();
      const parentTrack = await findTrackInJob(job, uiId, serverId);
      const trackLabel = resolveLabelName(parentTrack).name;

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
              label: resolveLabelName(sh).name || trackLabel,
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
                label: resolveLabelName(st).name || trackLabel,
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

  // 1b4_roi. Lấy điểm LiDAR trong vùng quan tâm (ROI) quanh vật thể tốc độ cao
  window.addEventListener("CVAT_EXT_REQ_GET_ROI_LIDAR_POINTS", (e: any) => {
    try {
      const { center, radius = 4.0, maxPoints = 25000 } = e.detail || {};
      const lidar = getSceneLidarPoints();
      if (!lidar || !lidar.array) {
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_RES_GET_ROI_LIDAR_POINTS", {
            detail: { success: false, error: "Không tìm thấy buffer điểm LiDAR trong Three.js scene" },
          })
        );
        return;
      }

      const arr = lidar.array;
      const count = lidar.count;
      const sampled: number[] = [];

      if (Array.isArray(center) && center.length >= 3) {
        const [cx, cy, cz] = center;
        const rSq = radius * radius;
        const maxDz = Math.max(3.0, radius * 0.85);
        for (let i = 0; i < count; i++) {
          const px = arr[i * 3];
          const py = arr[i * 3 + 1];
          const pz = arr[i * 3 + 2];
          const dx = px - cx;
          const dy = py - cy;
          const dz = Math.abs(pz - cz);
          if (dx * dx + dy * dy <= rSq && dz <= maxDz) {
            sampled.push(px, py, pz);
            if (sampled.length >= maxPoints * 3) break;
          }
        }
      } else {
        const step = Math.max(1, Math.floor(count / maxPoints));
        for (let i = 0; i < count; i += step) {
          sampled.push(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]);
        }
      }

      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_GET_ROI_LIDAR_POINTS", {
          detail: { success: true, points: sampled, totalCount: sampled.length / 3 },
        })
      );
    } catch (err: any) {
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_GET_ROI_LIDAR_POINTS", {
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

  // 1c. Lắng nghe yêu cầu Căn Yaw theo Vạch Kẻ Làn Đường 3D (LiDAR Intensity Lane Snap)
  window.addEventListener("CVAT_EXT_REQ_SNAP_YAW_TO_LANE", async (e: any) => {
    const { jobId, frame, uiId, serverId, currentFrameOnly = true } = e.detail || {};
    try {
      const job = await getActiveJobInstance(jobId);
      const { target, isDrawn } = await findTargetSafely(job, frame, uiId, serverId);

      const p = target.points;
      const curX = p[0];
      const curY = p[1];
      const curZ = p[2];
      const curYaw = p[5];
      const curL = p[6] || 4.6;
      const curW = p[7] || 1.85;
      const curH = p[8] || 1.5;

      const lidar = getSceneLidarPoints();
      if (!lidar || lidar.count === 0) {
        throw new Error("Không tìm thấy điểm LiDAR trong scene");
      }

      const ptsWithIntensity: Array<{ x: number; y: number; z: number; intensity?: number }> = [];
      const groundZ = curZ - curH / 2;
      const cosY = Math.cos(-curYaw);
      const sinY = Math.sin(-curYaw);

      for (let i = 0; i < lidar.count; i++) {
        const z = lidar.array[i * 3 + 2];
        if (Math.abs(z - groundZ) > 0.15) continue;

        const x = lidar.array[i * 3];
        const y = lidar.array[i * 3 + 1];
        const dx = x - curX;
        const dy = y - curY;
        const lx = dx * cosY - dy * sinY;
        const ly = dx * sinY + dy * cosY;

        if (Math.abs(lx) <= 15.0 && Math.abs(ly) <= 6.0) {
          ptsWithIntensity.push({
            x,
            y,
            z,
            intensity: lidar.getIntensityAt(i),
          });
        }
      }

      const res = fitYawToLaneIntensity(
        ptsWithIntensity,
        curX,
        curY,
        curZ,
        curYaw,
        curL,
        curW,
        curH,
        { groundZ }
      );

      if (!res.hasLane) {
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_RES_SNAP_YAW_TO_LANE", {
            detail: {
              success: false,
              uiId,
              hasLane: false,
              message: res.message || "Không tìm thấy vạch sơn làn đường rõ nét, giữ nguyên góc Yaw",
            },
          })
        );
        return;
      }

      const newYaw = res.newYawRad;
      const newPoints = [...target.points];
      newPoints[5] = newYaw;
      target.points = newPoints;
      if (!isDrawn && typeof target.save === "function") {
        await target.save();
      }

      updateThreeJsCuboid(uiId, newYaw);

      if (currentFrameOnly === false && job) {
        try {
          const parentTrack = await findTrackInJob(job, uiId, serverId, target.parentID);
          if (parentTrack) {
            const shapes = toArray(parentTrack.shapes || parentTrack.keyframes);
            for (const sh of shapes) {
              if (sh.shapeType === "cuboid" && Array.isArray(sh.points) && sh.points.length >= 9) {
                const shPoints = [...sh.points];
                shPoints[5] = newYaw;
                sh.points = shPoints;
              }
            }
            if (typeof parentTrack.save === "function") {
              await parentTrack.save();
            }
          }
        } catch (tErr) {
          console.warn("[CVAT 3D Suite] Lỗi áp dụng Yaw theo làn cho toàn track:", tErr);
        }
      }

      markCvatSaveButtonUnsaved();

      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_SNAP_YAW_TO_LANE", {
          detail: {
            success: true,
            uiId,
            hasLane: true,
            newYawRad: res.newYawRad,
            newYawDeg: res.newYawDeg,
            deltaYawDeg: res.deltaYawDeg,
            confidence: res.confidence,
            message: res.message,
          },
        })
      );
    } catch (err: any) {
      console.error("[CVAT 3D Suite] Lỗi căn Yaw theo làn đường:", err);
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_SNAP_YAW_TO_LANE", {
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
    const { jobId, frame, uiId, serverId, mode, deltaCm, deltaDeg, curbHeight, targetGroundZ: _targetGroundZ, applyToTrack } = e.detail || {};
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

        if (groundInfo.isFallbackZeroGround || groundInfo.groundPointsCount < 10) {
          // Point mặt đất quá ít (< 10 điểm) -> Khóa chuẩn 0° phẳng (Roll 0°, Pitch 0°), bảo toàn cao độ đáy
          const baseZ = groundInfo.groundZ !== null ? groundInfo.groundZ : (curZ - curH / 2);
          newRotX = 0;
          newRotY = 0;
          newZ = Number((baseZ + curH / 2).toFixed(3));
          // Sanity Guardrail: Chống bay lên trời / sụt hố lún đất (> 0.50m so với curZ)
          if (Math.abs(newZ - curZ) > 0.50) {
            newZ = curZ;
          }
          msg = `Point mặt đất ít (${groundInfo.groundPointsCount} điểm) ➔ Khóa chuẩn 0° phẳng (Tâm Z: ${newZ}m, Khóa Roll 0°, Pitch 0°)`;
        } else if (groundInfo.groundZ !== null) {
          const cosPitch = Math.cos(groundInfo.pitchRad);
          const cosRoll = Math.cos(groundInfo.rollRad);
          newRotY = groundInfo.pitchRad; // Bám đúng độ dốc dọc Pitch của mặt đường (Side View khít 100%)

          if (groundInfo.isHalfCurb) {
            // TỰ ĐỘNG PHÁT HIỆN XE ĐỖ GÁC LỀ
            newRotX = groundInfo.rollRad;
            newZ = Number((groundInfo.groundZ + (curH / 2) * cosPitch * cosRoll).toFixed(3));
            const sideText = groundInfo.halfCurbSide === "left" ? "bên TRÁI" : "bên PHẢI";
            msg = `Đã tự động nhận diện xe #${uiId} gác lề ${sideText} (Bậc vỉa hè: +${groundInfo.curbHeightCm}cm, Nghiêng Front Roll: ${groundInfo.rollDeg}°, Tâm Z: ${newZ}m)`;
          } else if (groundInfo.isCurbGround) {
            // TỰ ĐỘNG PHÁT HIỆN XE ĐỖ TRÊN NỀN VỈA HÈ
            newRotX = 0; // Khóa thẳng theo Ego để xe đứng ngay ngắn
            newZ = Number((groundInfo.groundZ + (curH / 2) * cosPitch).toFixed(3));
            msg = `Đã tự động nhận diện xe #${uiId} đỗ trên nền vỉa hè (+${groundInfo.curbHeightCm || 15}cm so với Ego, Khóa Roll 0°, Tâm Z: ${newZ}m)`;
          } else {
            // MẶT ĐƯỜNG DỐC TỰ NHIÊN
            newRotX = groundInfo.rollRad;
            newZ = Number((groundInfo.groundZ + (curH / 2) * cosPitch * cosRoll).toFixed(3));
            msg = `Đã ghim đáy xe #${uiId} bám sát mặt đường (Z: ${newZ}m, Roll: ${groundInfo.rollDeg}°, Pitch: ${groundInfo.pitchDeg}°)`;
          }
        } else {
          // Fallback nếu không có điểm mặt đất: khóa chuẩn 0° phẳng, bảo toàn cao độ Z hiện tại
          newRotX = 0;
          newRotY = 0;
          newZ = curZ;
          msg = `Không có điểm mặt đất ➔ Khóa chuẩn 0° phẳng (Tâm Z: ${newZ}m, Khóa Roll 0°, Pitch 0°)`;
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

      let framesSnapped = 1;
      if (applyToTrack) {
        try {
          const deltaZ = newZ - curZ;
          const parentTrack = await findTrackInJob(job, uiId, serverId, target.parentID);
          if (parentTrack) {
            const shapesList = toArray(parentTrack.shapes || parentTrack.keyframes || (parentTrack as any)._shapes);
            for (const sh of shapesList) {
              if (sh.shapeType === "cuboid" && Array.isArray(sh.points) && sh.points.length >= 9) {
                const pts = [...sh.points];
                pts[2] = Number((pts[2] + deltaZ).toFixed(3));
                pts[3] = newRotX;
                pts[4] = newRotY;
                sh.points = pts;
                if (typeof sh.save === "function") {
                  await sh.save();
                }
                framesSnapped++;
              }
            }
          }
        } catch (tErr) {
          console.warn("[CVAT 3D Suite] Lỗi snap ground cho toàn track:", tErr);
        }
        msg += ` (Đã ghim toàn bộ ${framesSnapped} frames trong track)`;
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
          detail: { success: true, uiId, newZ, mode, applyToTrack, message: msg },
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

  // 7. Lắng nghe yêu cầu Đánh dấu Outside / Inside cho toàn bộ frame của Track (REALTIME 100% THREE.JS & REDUX)
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

      // 1. CẬP NHẬT TRÊN PARENT TRACK SHAPES (KEYFRAMES)
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
            try {
              await parentTrack.save();
            } catch (pSaveErr) {
              console.warn("[CVAT 3D Suite] Lưu parentTrack trong SET_TRACK_OUTSIDE:", pSaveErr);
            }
          }
        }
      }

      // 2. QUÉT TOÀN BỘ CÁC FRAMES CỦA JOB ĐỂ ĐẢM BẢO BẮT TRỌN CẢ OBJECT STATE NỘI SUY
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
              if (!previousStates.some((ps) => ps.frame === f)) {
                previousStates.push({
                  frame: f,
                  outside: !!st.outside,
                  points: Array.isArray(st.points) ? [...st.points] : [],
                });
              }
              st.outside = !!outside;
              if (typeof st.save === "function") {
                try {
                  await st.save();
                } catch (stErr) {}
              }
              countModified++;
            }
          }
        } catch (e) {}
      }

      // 3. ĐẢM BẢO FRAME HIỆN TẠI ĐƯỢC CẬP NHẬT TRÊN CURRENT TARGET NẾU CÓ
      if (currentTarget) {
        currentTarget.outside = !!outside;
        if (typeof currentTarget.save === "function") {
          try {
            await currentTarget.save();
          } catch (cErr) {}
        }
      }

      if (countModified === 0) {
        throw new Error(`Không tìm thấy Track hoặc Shape #${uiId} trong toàn bộ Job`);
      }

      // 4. CAN THIỆP THREE.JS WEBGL TRỰC TIẾP TỨC THÌ (REALTIME 100%, ZERO RELOAD)
      const store = getReduxStore();
      const canvas = store?.getState()?.annotation?.canvas?.instance;
      if (canvas && canvas.view && canvas.view.drawnObjects) {
        const drawnItem = canvas.view.drawnObjects[String(uiId)];
        if (drawnItem) {
          if (drawnItem.data) {
            drawnItem.data.outside = !!outside;
            drawnItem.data.updated = true;
          }
          if (drawnItem.cuboid) {
            const isVis = !outside;
            if (drawnItem.cuboid.perspective) drawnItem.cuboid.perspective.visible = isVis;
            if (drawnItem.cuboid.top) drawnItem.cuboid.top.visible = isVis;
            if (drawnItem.cuboid.side) drawnItem.cuboid.side.visible = isVis;
            if (drawnItem.cuboid.front) drawnItem.cuboid.front.visible = isVis;
            if (typeof drawnItem.cuboid.visible === "boolean") drawnItem.cuboid.visible = isVis;
          }
        }

        // Nếu outside = true và đối tượng đang được kích hoạt, hủy active để ẩn gizmo/box vàng
        const activeId = canvas.view?.activatedElementID;
        if (outside && (Number(activeId) === Number(uiId) || String(activeId) === String(uiId))) {
          if (typeof canvas.activate === "function") {
            try {
              canvas.activate(null);
            } catch (aErr) {}
          }
        }
      }

      // 5. CẬP NHẬT TRỰC TIẾP REDUX STATES ĐỂ SIDEBAR OBJECT LIST ĐỒNG BỘ
      try {
        const reduxStates = store?.getState()?.annotation?.annotations?.states;
        if (Array.isArray(reduxStates)) {
          const matchedState = reduxStates.find((s: any) => Number(s.clientID) === Number(uiId));
          if (matchedState) {
            matchedState.outside = !!outside;
          }
        }
      } catch (rErr) {}

      markCvatSaveButtonUnsaved();

      if (canvas && typeof canvas.render === "function") {
        canvas.render();
      }

      // Bắn event báo hiệu danh sách frame tracks đã thay đổi
      window.dispatchEvent(new CustomEvent("CVAT_EXT_RES_FRAME_TRACKS_DIRTY"));

      const msg = `Đã đánh dấu ${outside ? "Outside (Ẩn)" : "Inside (Hiện)"} cho ${countModified} frame của xe #${uiId} (Realtime)`;
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

      // Khôi phục visibility của Three.js nếu thao tác hoàn tác có chứa trạng thái outside tại frame hiện tại
      const currentBackup = trackShapesBackup?.find((b: any) => b.frame === currentFrame);
      if (currentBackup && currentBackup.outside !== undefined) {
        const store = getReduxStore();
        const canvas = store?.getState()?.annotation?.canvas?.instance;
        if (canvas && canvas.view && canvas.view.drawnObjects) {
          const drawnItem = canvas.view.drawnObjects[String(uiId)];
          if (drawnItem) {
            drawnItem.data.outside = !!currentBackup.outside;
            if (drawnItem.cuboid) {
              const isVis = !currentBackup.outside;
              if (drawnItem.cuboid.perspective) drawnItem.cuboid.perspective.visible = isVis;
              if (drawnItem.cuboid.top) drawnItem.cuboid.top.visible = isVis;
              if (drawnItem.cuboid.side) drawnItem.cuboid.side.visible = isVis;
              if (drawnItem.cuboid.front) drawnItem.cuboid.front.visible = isVis;
              if (typeof drawnItem.cuboid.visible === "boolean") drawnItem.cuboid.visible = isVis;
            }
          }
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

  // 7. Lắng nghe yêu cầu Vi Chỉnh Center (Dịch chuyển tâm theo trục cục bộ của xe hoặc trục Screen Space / World)
  window.addEventListener("CVAT_EXT_REQ_SHIFT_CENTER", async (e: any) => {
    const { jobId, frame, uiId, serverId, deltaXLocal = 0, deltaYLocal = 0, deltaZ = 0, applyToTrack = false, isWorld = false } = e.detail || {};
    try {
      const job = await getActiveJobInstance(jobId);
      const { target, isDrawn } = await findTargetSafely(job, frame, uiId, serverId);

      const yaw = target.points[5] || 0;
      const cosYaw = Math.cos(yaw);
      const sinYaw = Math.sin(yaw);

      // Nếu là toạ độ World (Screen Space WASD trực quan): không xoay qua yaw
      // Nếu là toạ độ Local (nút bấm tiến/lùi, trái/phải trên panel): xoay qua yaw
      let deltaXWorld = deltaXLocal;
      let deltaYWorld = deltaYLocal;
      if (!isWorld) {
        deltaXWorld = deltaXLocal * cosYaw - deltaYLocal * sinYaw;
        deltaYWorld = deltaXLocal * sinYaw + deltaYLocal * cosYaw;
      }

      let framesShifted = 1;

      if (applyToTrack) {
        const parentTrack = await findTrackInJob(job, uiId, serverId, target.parentID);
        if (parentTrack && Array.isArray(parentTrack.shapes)) {
          for (const sh of parentTrack.shapes) {
            if (sh.shapeType === "cuboid" && Array.isArray(sh.points) && sh.points.length >= 9) {
              const pts = [...sh.points];
              pts[0] = Number((pts[0] + deltaXWorld).toFixed(3));
              pts[1] = Number((pts[1] + deltaYWorld).toFixed(3));
              if (deltaZ !== 0) {
                pts[2] = Number((pts[2] + deltaZ).toFixed(3));
              }
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
      if (deltaZ !== 0) {
        currentPts[2] = Number((currentPts[2] + deltaZ).toFixed(3));
      }
      target.points = currentPts;
      if (!isDrawn && typeof target.save === "function") {
        await target.save();
      }

      updateThreeJsCuboid(
        uiId,
        yaw,
        { x: currentPts[0], y: currentPts[1], z: currentPts[2] },
        { l: currentPts[6], w: currentPts[7], h: currentPts[8] },
        { rx: currentPts[3] || 0, ry: currentPts[4] || 0, rz: yaw }
      );

      markCvatSaveButtonUnsaved();

      const scopeText = applyToTrack ? `toàn bộ ${framesShifted} frames trong track` : `frame #${frame}`;
      const msg = `Đã vi chỉnh Center (${isWorld ? 'Screen Space' : 'Local'} ΔX: ${deltaXWorld > 0 ? "+" : ""}${(deltaXWorld * 100).toFixed(1)}cm, ΔY: ${deltaYWorld > 0 ? "+" : ""}${(deltaYWorld * 100).toFixed(1)}cm, ΔZ: ${deltaZ > 0 ? "+" : ""}${(deltaZ * 100).toFixed(1)}cm) cho ${scopeText}`;
      console.log(`[CVAT 3D Suite] ${msg}`);

      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_SHIFT_CENTER", {
          detail: {
            success: true,
            uiId,
            newX: currentPts[0],
            newY: currentPts[1],
            newZ: currentPts[2],
            deltaXLocal,
            deltaYLocal,
            deltaZ,
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

  // 8. Lắng nghe yêu cầu Fit Riêng Từng Chiều W hoặc H (Phím 4 và 5)
  window.addEventListener("CVAT_EXT_REQ_FIT_DIMENSION", async (e: any) => {
    const { jobId, frame, uiId, serverId, dimension = "w", applyToTrack = false } = e.detail || {};
    try {
      const job = await getActiveJobInstance(jobId);
      const { target, isDrawn } = await findTargetSafely(job, frame, uiId, serverId);

      const cx = target.points[0];
      const cy = target.points[1];
      const cz = target.points[2];
      const rx = target.points[3] || 0;
      const ry = target.points[4] || 0;
      const yaw = target.points[5] || 0;
      const curL = target.points[6] || 4.65;
      const curW = target.points[7] || 1.85;
      const curH = target.points[8] || 1.45;

      const lidar = getSceneLidarPoints();
      if (!lidar || lidar.count === 0) {
        throw new Error("Không tìm thấy điểm LiDAR trong scene");
      }

      const { count, array } = lidar;
      const groundInfo = detectAccurateGroundZ(cx, cy, cz, yaw, curL / 2, curW / 2, curH / 2, false, false);
      const groundZ = groundInfo.groundZ !== null ? groundInfo.groundZ : cz - curH / 2;

      const cosY = Math.cos(-yaw);
      const sinY = Math.sin(-yaw);

      const minBodyZ = groundZ + 0.20;
      const maxRoofZ = groundZ + 4.0;
      const searchHalfL = curL / 2 + 0.55;
      const searchHalfW = curW / 2 + 0.45;

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

      const clLy = filterDenseConnectedCluster1D(rawBodyPts, "ly", 0.20, 0);
      const bodyPts = filterDenseConnectedCluster1D(clLy, "lx", 0.20, 0);
      const finalPts = bodyPts.length >= 5 ? bodyPts : rawBodyPts;

      let newL = curL;
      let newW = curW;
      let newH = curH;
      let newX = cx;
      let newY = cy;
      let newZ = cz;
      let dimMessage = "";

      if (dimension === "w") {
        // FIT RIÊNG CHIỀU RỘNG W (Phím 4)
        const leftWall = detectDominantWallEdgeWithValleyCutoff(finalPts, "ly", "positive", curW / 2, { binSize: 0.03 });
        const rightWall = detectDominantWallEdgeWithValleyCutoff(finalPts, "ly", "negative", curW / 2, { binSize: 0.03 });
        const measuredW = Math.max(0.4, Math.min(3.5, Number((leftWall.edge - rightWall.edge).toFixed(3))));
        newW = Number((measuredW + 0.08).toFixed(2)); // Đệm nhẹ 4cm mỗi bên

        // Dời nhẹ tâm Y theo trung điểm 2 vách đón tia
        const shiftLy = Number(((leftWall.edge + rightWall.edge) / 2).toFixed(3));
        if (Math.abs(shiftLy) < 0.20) {
          newX = Number((cx - shiftLy * sinY).toFixed(3));
          newY = Number((cy + shiftLy * cosY).toFixed(3));
        }
        dimMessage = `Fit Rộng W=${newW}m (đo ${measuredW}m + 8cm đệm)`;
      } else {
        // FIT RIÊNG CHIỀU CAO H (Phím 5) - CHUẨN GROUND-LOCK
        const zList = finalPts.map((p) => p.z).sort((a, b) => a - b);
        const zRoof = zList[Math.floor(zList.length * 0.95)];
        const measuredH = Math.max(0.4, Math.min(4.5, Number((zRoof - groundZ).toFixed(3))));
        newH = Number((measuredH + 0.05).toFixed(2)); // Đệm nhẹ 5cm nóc

        // Mặt đáy bám sàn cố định tại groundZ: newZ = groundZ + newH / 2
        newZ = Number((groundZ + newH / 2).toFixed(3));
        dimMessage = `Fit Cao H=${newH}m [Ground-Lock nở nóc] (đo nóc ${(zRoof).toFixed(2)}m, đáy ${(groundZ).toFixed(2)}m)`;
      }

      let framesSynced = 1;
      if (applyToTrack) {
        const parentTrack = await findTrackInJob(job, uiId, serverId, target.parentID);
        if (parentTrack) {
          const shapesList = toArray(parentTrack.shapes || parentTrack.keyframes || (parentTrack as any)._shapes);
          for (const sh of shapesList) {
            if (sh.shapeType === "cuboid" && Array.isArray(sh.points) && sh.points.length >= 9) {
              const pts = [...sh.points];
              if (dimension === "w") {
                pts[7] = newW;
              } else {
                const sOldZ = pts[2];
                const sOldH = pts[8];
                // Giữ cố định mặt đáy: dời tâm lên trên theo nửa độ chênh lệch chiều cao
                pts[2] = Number((sOldZ + (newH - sOldH) / 2).toFixed(3));
                pts[8] = newH;
              }
              sh.points = pts;
              framesSynced++;
            }
          }
          if (typeof parentTrack.save === "function") {
            await parentTrack.save();
          }
        }
      }

      const currentPts = [...target.points];
      currentPts[0] = newX;
      currentPts[1] = newY;
      currentPts[2] = newZ;
      currentPts[6] = newL;
      currentPts[7] = newW;
      currentPts[8] = newH;
      target.points = currentPts;
      if (!isDrawn && typeof target.save === "function") {
        await target.save();
      }

      updateThreeJsCuboid(
        uiId,
        yaw,
        { x: newX, y: newY, z: newZ },
        { l: newL, w: newW, h: newH },
        { rx, ry, rz: yaw }
      );

      markCvatSaveButtonUnsaved();

      const scopeText = applyToTrack ? `toàn bộ ${framesSynced} frames trong track` : `frame #${frame}`;
      const msg = `Đã ${dimMessage} cho ${scopeText}`;
      console.log(`[CVAT 3D Suite] ${msg}`);

      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_FIT_DIMENSION", {
          detail: {
            success: true,
            uiId,
            dimension,
            newL,
            newW,
            newH,
            newX,
            newY,
            newZ,
            pointsCount: finalPts.length,
            framesSynced,
            message: msg,
          },
        })
      );
    } catch (err: any) {
      console.error("[CVAT 3D Suite] Lỗi Fit Dimension:", err);
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_FIT_DIMENSION", {
          detail: { success: false, error: err.message || String(err) },
        })
      );
    }
  });

  // 17. Lắng nghe yêu cầu cấu hình Chế độ màu mây điểm LiDAR (Intensity vs Plain & Điểm trong xe bọc)
  window.addEventListener("CVAT_EXT_REQ_SET_POINT_COLOR_MODE", (e: any) => {
    const { mode, colorizeBoxed } = e.detail || {};
    if (mode === "intensity" || mode === "plain") {
      currentPointColorMode = mode;
    }
    if (colorizeBoxed !== undefined) {
      currentColorizeBoxed = !!colorizeBoxed;
    }

    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem("cvat_3d_point_color_mode", currentPointColorMode);
        localStorage.setItem("cvat_3d_colorize_boxed", String(currentColorizeBoxed));
      } catch (_) {}
    }

    const ok = applyPointCloudColorizationInMainWorld({
      mode: currentPointColorMode,
      colorizeBoxed: currentColorizeBoxed,
    });

    const modeText = currentPointColorMode === "intensity" ? "Độ phản xạ (Intensity)" : "Màu phẳng (Plain)";
    const boxedText = currentColorizeBoxed ? "BẬT" : "TẮT";
    const msg = `Chế độ màu Point: ${modeText} | Nhuộm màu xe bọc: ${boxedText}`;
    console.log(`[CVAT 3D Suite] ${msg}`);

    window.dispatchEvent(
      new CustomEvent("CVAT_EXT_RES_SET_POINT_COLOR_MODE", {
        detail: {
          success: true,
          mode: currentPointColorMode,
          colorizeBoxed: currentColorizeBoxed,
          message: msg,
        },
      })
    );
  });

  window.addEventListener("CVAT_EXT_REQ_GET_POINT_COLOR_MODE", () => {
    window.dispatchEvent(
      new CustomEvent("CVAT_EXT_RES_GET_POINT_COLOR_MODE", {
        detail: {
          mode: currentPointColorMode,
          colorizeBoxed: currentColorizeBoxed,
        },
      })
    );
  });

  // 18. Lắng nghe yêu cầu Bật/Tắt Mặt Sàn Polygon 3D Mờ (Mặt đường & Vỉa hè)
  window.addEventListener("CVAT_EXT_REQ_SET_GROUND_PLANE_VISIBLE", (e: any) => {
    const { visible } = e.detail || {};
    currentGroundPlaneVisible = !!visible;
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem("cvat_3d_ground_plane_visible", String(currentGroundPlaneVisible));
      } catch (_) {}
    }
    updateGroundPlaneMeshInMainWorld();
    window.dispatchEvent(
      new CustomEvent("CVAT_EXT_RES_SET_GROUND_PLANE_VISIBLE", {
        detail: { success: true, visible: currentGroundPlaneVisible },
      })
    );
  });

  window.addEventListener("CVAT_EXT_REQ_GET_GROUND_PLANE_VISIBLE", () => {
    window.dispatchEvent(
      new CustomEvent("CVAT_EXT_RES_GET_GROUND_PLANE_VISIBLE", {
        detail: { visible: currentGroundPlaneVisible },
      })
    );
  });

  // Khởi động nạp ban đầu cho Frame đầu tiên (Single-Flight sau khi canvas sẵn sàng)
  setTimeout(() => {
    try {
      const store = getReduxStore();
      const f = store?.getState()?.annotation?.player?.frame?.number ?? 0;
      scheduleSingleFrameColorizationAndGround(f, 300);
    } catch (_) {}
  }, 1200);
}
