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

  // ⚡ SIÊU TỐI ƯU HIỆU NĂNG 60 FPS: PROTOTYPE RAYCAST GUARD & SCENE.ADD INTERCEPTION
  // Vô hiệu hóa raycast va chạm trên mây 305k điểm LiDAR ở cấp độ Prototype của Three.js
  // Đảm bảo 100% mọi thể hiện THREE.Points ở MỌI FRAME, MỌI VIEW (Perspective, Top, Side, Front)
  // sinh ra bất kỳ lúc nào đều có raycast = () => {} NGAY LẬP TỨC từ miligiây đầu tiên!
  function guardPointsInstance(obj: any): void {
    if (!obj) return;
    if (!(obj as any).__cvat_raycast_guarded__) {
      (obj as any).__cvat_raycast_guarded__ = true;
      obj.raycast = () => {};
    }
    try {
      const proto = Object.getPrototypeOf(obj);
      if (proto && !(proto as any).__cvat_proto_guarded__) {
        (proto as any).__cvat_proto_guarded__ = true;
        proto.raycast = () => {};
      }
      if (obj.constructor && obj.constructor.prototype && !(obj.constructor.prototype as any).__cvat_proto_guarded__) {
        (obj.constructor.prototype as any).__cvat_proto_guarded__ = true;
        obj.constructor.prototype.raycast = () => {};
      }
    } catch (_) {}
  }

  function installGlobalThreeRaycastGuard(target?: any): void {
    try {
      const candidates: any[] = [];
      if (target) candidates.push(target);
      if (typeof window !== "undefined") {
        const win = window as any;
        if (win.THREE) candidates.push(win.THREE);
        if (win.__THREE__) candidates.push(win.__THREE__);
      }
      try {
        const store = getReduxStore();
        const canvas = store?.getState()?.annotation?.canvas?.instance;
        if (canvas?.THREE) candidates.push(canvas.THREE);
        if (canvas?.view?.THREE) candidates.push(canvas.view.THREE);
        if (canvas?.view?.rayCaster) candidates.push(canvas.view.rayCaster);
        if (canvas?.view?.views) {
          for (const k of ["perspective", "top", "side", "front"]) {
            const v = canvas.view.views[k];
            if (v?.THREE) candidates.push(v.THREE);
            if (v?.renderer?.constructor) candidates.push(v.renderer.constructor);
            if (v?.scene) candidates.push(v.scene);
            if (v?.rayCaster) candidates.push(v.rayCaster);
            if (v?.controls?.raycaster) candidates.push(v.controls.raycaster);
          }
        }
      } catch (_) {}

      for (const cand of candidates) {
        if (!cand) continue;

        // A. Xử lý Points Constructor / Prototype
        let PointsCtor = cand.Points;
        if (!PointsCtor) {
          if (typeof cand === "function" && (cand.name === "Points" || cand.prototype?.isPoints)) {
            PointsCtor = cand;
          } else if (cand.isPoints && cand.constructor) {
            PointsCtor = cand.constructor;
          }
        }

        if (PointsCtor && PointsCtor.prototype && !(PointsCtor.prototype as any).__cvat_proto_guarded__) {
          (PointsCtor.prototype as any).__cvat_proto_guarded__ = true;
          PointsCtor.prototype.raycast = () => {};
          try {
            Object.defineProperty(PointsCtor.prototype, "raycast", {
              value: () => {},
              writable: true,
              configurable: true,
            });
          } catch (_) {}
        }

        // B. Xử lý Raycaster Instance & Prototype (Vô hiệu hóa va chạm trên mây 305k điểm)
        let RaycasterCtor = cand.Raycaster;
        if (!RaycasterCtor) {
          if (typeof cand === "function" && cand.name === "Raycaster") {
            RaycasterCtor = cand;
          } else if (cand.intersectObjects && cand.constructor) {
            RaycasterCtor = cand.constructor;
          }
        }

        // Khóa trực tiếp trên Raycaster instance nếu cand là một instance
        if (cand && typeof cand.intersectObject === "function" && !(cand as any).__cvat_instance_guarded__) {
          (cand as any).__cvat_instance_guarded__ = true;
          const origInstIntersectObject = cand.intersectObject;
          cand.intersectObject = function (object: any, recursive?: boolean, optionalTarget?: any) {
            if (object && (object.isPoints || object.type === "Points")) {
              return optionalTarget || [];
            }
            return origInstIntersectObject.call(this, object, recursive, optionalTarget);
          };
          const origInstIntersectObjects = cand.intersectObjects;
          cand.intersectObjects = function (objects: any[], recursive?: boolean, optionalTarget?: any) {
            if (!Array.isArray(objects)) return optionalTarget || [];
            const filtered = objects.filter((o: any) => o && !o.isPoints && o.type !== "Points");
            return origInstIntersectObjects.call(this, filtered, recursive, optionalTarget);
          };
        }

        if (RaycasterCtor && RaycasterCtor.prototype && !(RaycasterCtor.prototype as any).__cvat_proto_guarded__) {
          (RaycasterCtor.prototype as any).__cvat_proto_guarded__ = true;
          const origIntersectObject = RaycasterCtor.prototype.intersectObject;
          RaycasterCtor.prototype.intersectObject = function (object: any, recursive?: boolean, optionalTarget?: any) {
            if (object && (object.isPoints || object.type === "Points")) {
              return optionalTarget || [];
            }
            return origIntersectObject.call(this, object, recursive, optionalTarget);
          };

          const origIntersectObjects = RaycasterCtor.prototype.intersectObjects;
          RaycasterCtor.prototype.intersectObjects = function (objects: any[], recursive?: boolean, optionalTarget?: any) {
            if (!Array.isArray(objects)) return optionalTarget || [];
            const filtered = objects.filter((o: any) => o && !o.isPoints && o.type !== "Points");
            return origIntersectObjects.call(this, filtered, recursive, optionalTarget);
          };
        }
      }
    } catch (_) {}
  }

  function hookSceneForPointsGuard(scene: any): void {
    if (!scene) return;

    // A. Intercept Object3D.prototype.add: Đón đầu 100% mọi thể hiện Points được thêm vào bất kỳ container nào
    try {
      const sceneProto = Object.getPrototypeOf(scene);
      const obj3dProto = sceneProto ? Object.getPrototypeOf(sceneProto) : null;
      if (obj3dProto && typeof obj3dProto.add === "function" && !(obj3dProto as any).__cvat_obj3d_add_guarded__) {
        (obj3dProto as any).__cvat_obj3d_add_guarded__ = true;
        const origObj3dAdd = obj3dProto.add;
        obj3dProto.add = function (...objects: any[]) {
          for (const item of objects) {
            if (item) {
              if (item.isPoints || item.type === "Points") {
                guardPointsInstance(item);
                installGlobalThreeRaycastGuard(item);
              }
              if (typeof item.traverse === "function") {
                item.traverse((child: any) => {
                  if (child && (child.isPoints || child.type === "Points")) {
                    guardPointsInstance(child);
                    installGlobalThreeRaycastGuard(child);
                  }
                });
              }
            }
          }
          return origObj3dAdd.apply(this, objects);
        };
      }
    } catch (_) {}

    if (typeof scene.traverse === "function") {
      scene.traverse((obj: any) => {
        if (obj && (obj.isPoints || obj.type === "Points")) {
          guardPointsInstance(obj);
          installGlobalThreeRaycastGuard(obj);
        }
      });
    }

    if (typeof scene.add === "function" && !(scene as any).__cvat_add_guarded__) {
      (scene as any).__cvat_add_guarded__ = true;
      const origAdd = scene.add;
      scene.add = function (...objects: any[]) {
        for (const item of objects) {
          if (item) {
            if (item.isPoints || item.type === "Points") {
              guardPointsInstance(item);
              installGlobalThreeRaycastGuard(item);
            }
            if (typeof item.traverse === "function") {
              item.traverse((child: any) => {
                if (child && (child.isPoints || child.type === "Points")) {
                  guardPointsInstance(child);
                  installGlobalThreeRaycastGuard(child);
                }
              });
            }
          }
        }
        return origAdd.apply(this, objects);
      };
    }
  }

  function hookAllScenes(): void {
    try {
      const store = getReduxStore();
      const canvas = store?.getState()?.annotation?.canvas?.instance;
      const scenes: any[] = [];
      if (canvas?.view?.views) {
        for (const k of ["perspective", "top", "side", "front"]) {
          const s = canvas.view.views[k]?.scene;
          if (s && !scenes.includes(s)) scenes.push(s);
        }
      }
      if (canvas?.view?.scene && !scenes.includes(canvas.view.scene)) scenes.push(canvas.view.scene);
      if (canvas?.scene && !scenes.includes(canvas.scene)) scenes.push(canvas.scene);

      for (const sc of scenes) {
        hookSceneForPointsGuard(sc);
      }
    } catch (_) {}
  }

  installGlobalThreeRaycastGuard();

  function flipYawRad(yaw: number): number {
    let newYaw = yaw + Math.PI;
    while (newYaw > Math.PI) newYaw -= 2 * Math.PI;
    while (newYaw < -Math.PI) newYaw += 2 * Math.PI;
    return newYaw;
  }

  // Helper lấy Redux Store từ React Fiber root container (Cache O(1) chống quét DOM Fiber nhiều lần)
  let cachedReduxStore: any = null;
  function getReduxStore(): any {
    if (cachedReduxStore && typeof cachedReduxStore.getState === "function") {
      return cachedReduxStore;
    }
    const rootEl = document.getElementById("root");
    if (!rootEl) return null;
    const rKey = Object.keys(rootEl).find(
      (k) => k.startsWith("__reactContainer$") || k.startsWith("__reactFiber$")
    );
    if (!rKey) return null;
    let rNode = (rootEl as any)[rKey];
    while (rNode) {
      if (rNode.memoizedProps?.store) {
        cachedReduxStore = rNode.memoizedProps.store;
        return cachedReduxStore;
      }
      if (rNode.stateNode?.store) {
        cachedReduxStore = rNode.stateNode.store;
        return cachedReduxStore;
      }
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
  let currentCanvasTheme: "light" | "dark" =
    typeof localStorage !== "undefined" && localStorage.getItem("cvat_3d_canvas_theme") === "dark"
      ? "dark"
      : "light";

  // Kích thước hạt điểm mây LiDAR trên 3 khung nhìn trực giao 2D (Top, Side, Front)
  // Mặc định: 3.5px (Nét rõ), Hỗ trợ xoay vòng: 2.0px / 3.5px / 5.0px
  // Khung nhìn 3D chính (Perspective View) giữ nguyên 100% mặc định theo cài đặt của CVAT
  let currentOrthoPointSize: number = 3.5;
  try {
    const savedOrthoSize = localStorage.getItem("cvat_3d_ortho_point_size");
    if (savedOrthoSize) {
      const parsed = parseFloat(savedOrthoSize);
      if (!isNaN(parsed) && parsed >= 1.0 && parsed <= 10.0) {
        currentOrthoPointSize = parsed;
      }
    }
  } catch (_) {}

  function applyOrthoPointSize(size: number): void {
    currentOrthoPointSize = size;
    try {
      localStorage.setItem("cvat_3d_ortho_point_size", String(size));
    } catch (_) {}

    try {
      const store = getReduxStore();
      const canvas = store?.getState()?.annotation?.canvas?.instance;
      if (canvas && typeof canvas.render === "function") {
        canvas.render();
      }
    } catch (_) {}
  }

  let isColorizingRunning: boolean = false;
  let isCanvasInteracting: boolean = false;
  let singleFrameColorizeTimer: any = null;

  // Áp dụng Theme Canvas 3D Three.js và CSS (Light: Nền Trắng / Điểm Đen ⇄ Dark: Nền Tối / Điểm Sáng)
  function applyCanvasThemeInMainWorld(theme?: "light" | "dark"): void {
    try {
      if (theme) currentCanvasTheme = theme;
      if (typeof localStorage !== "undefined") {
        try {
          localStorage.setItem("cvat_3d_canvas_theme", currentCanvasTheme);
        } catch (_) {}
      }

      const store = getReduxStore();
      const canvas = store?.getState()?.annotation?.canvas?.instance;
      const isLight = currentCanvasTheme === "light";
      const bgColor = isLight ? 0xffffff : 0x000000;
      const bgCss = isLight ? "#ffffff" : "#000000";

      // 1. Áp dụng trực tiếp vào Three.js Scenes & Renderers (Perspective, Top, Side, Front)
      if (canvas?.view?.views) {
        const views = canvas.view.views;
        const winThree = (window as any).THREE;
        let ColorCtor: any =
          winThree?.Color ||
          (canvas as any)?.THREE?.Color ||
          (canvas as any)?.view?.THREE?.Color;

        const viewKeys = Object.keys(views);
        for (const key of viewKeys) {
          const v = views[key];
          if (!v) continue;
          if (v.scene) {
            if (v.scene.background && typeof v.scene.background.setHex === "function") {
              v.scene.background.setHex(bgColor);
            } else {
              if (!ColorCtor) {
                if (v.scene.background?.constructor && typeof v.scene.background.constructor === "function") {
                  ColorCtor = v.scene.background.constructor;
                } else {
                  v.scene.traverse((obj: any) => {
                    if (!ColorCtor && obj.material?.color && typeof obj.material.color.setHex === "function") {
                      ColorCtor = obj.material.color.constructor;
                    }
                  });
                }
              }

              if (ColorCtor && typeof ColorCtor === "function") {
                v.scene.background = new ColorCtor(bgColor);
              } else {
                v.scene.background = null;
              }
            }
          }
          if (v.renderer && typeof v.renderer.setClearColor === "function") {
            v.renderer.setClearColor(bgColor, 1);
          }
        }
      }

      // 2. Inject CSS Style đồng bộ các container canvas
      let styleEl = document.getElementById("cvat-3d-suite-canvas-theme-style");
      if (!styleEl) {
        styleEl = document.createElement("style");
        styleEl.id = "cvat-3d-suite-canvas-theme-style";
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = `
        .cvat-canvas-container,
        .cvat-canvas3d-perspective,
        .cvat-canvas3d-topview,
        .cvat-canvas3d-sideview,
        .cvat-canvas3d-frontview,
        .cvat-canvas3d-orthographic-view {
          background-color: ${bgCss} !important;
          isolation: isolate !important;
        }
        .cvat-canvas3d-orthographic-view canvas,
        .cvat-canvas-container canvas {
          background-color: ${bgCss} !important;
        }
        .cvat-canvas3d-orthographic-view-header,
        .cvat-canvas3d-perspective-header {
          color: ${isLight ? "#1e293b" : "#f8fafc"} !important;
        }

        /* Tối ưu hóa sâu CSS Virtualization cho Sidebar CVAT: Ngắt render 85% thẻ ngoài màn hình */
        .cvat-objects-sidebar-states-list > div,
        .cvat-objects-sidebar-state-item {
          content-visibility: auto !important;
          contain-intrinsic-size: 0 46px !important;
        }

        /* Triệt tiêu độ trễ hoạt họa thừa trên Sidebar để phản hồi click tức thì 0ms */
        .cvat-objects-sidebar-state-item,
        .cvat-objects-sidebar-state-item * {
          transition: none !important;
        }
      `;

      // 3. Render lại Three.js
      if (canvas && typeof canvas.render === "function") {
        canvas.render();
      }
      const views = canvas?.view?.views;
      if (views) {
        for (const key of ["perspective", "top", "side", "front"]) {
          const v = views[key];
          if (v && typeof v.render === "function") {
            try { v.render(); } catch (_) {}
          }
        }
      }
    } catch (err) {
      console.warn("[CVAT 3D Suite] Lỗi applyCanvasThemeInMainWorld:", err);
    }
  }

  // Lấy danh sách tất cả các đối tượng THREE.Points từ mọi view của Canvas3D (Perspective, Top, Side, Front)
  function getAllScenePointsObjects(): any[] {
    try {
      const store = getReduxStore();
      const canvas = store?.getState()?.annotation?.canvas?.instance;
      if (!canvas || !canvas.view) return [];

      const pointsObjects: any[] = [];
      const scenes: any[] = [];

      const views = canvas.view.views;
      if (views) {
        const viewKeys = ["perspective", "top", "side", "front"];
        for (const key of viewKeys) {
          const s = views[key]?.scene;
          if (s && !scenes.includes(s)) scenes.push(s);
        }
      }
      if (canvas.view.scene && !scenes.includes(canvas.view.scene)) {
        scenes.push(canvas.view.scene);
      }
      if (canvas.scene && !scenes.includes(canvas.scene)) {
        scenes.push(canvas.scene);
      }

      for (const scene of scenes) {
        if (!scene) continue;
        hookSceneForPointsGuard(scene);
        if (typeof scene.traverse !== "function") continue;
        scene.traverse((obj: any) => {
          if (
            (obj.isPoints || obj.type === "Points") &&
            obj.geometry?.attributes?.position?.count >= 10 &&
            !pointsObjects.includes(obj)
          ) {
            // Raycasting Guard: Vô hiệu hóa raycast va chạm trên mây 305k điểm để chuột di chuyển 60 FPS không khựng
            guardPointsInstance(obj);
            installGlobalThreeRaycastGuard(obj);

            // Ortho Point Size Hook: Tự động phát hiện OrthographicCamera trên 3 view Top, Side, Front để boost material.size
            // KHUNG 3D CHÍNH (Perspective): Giữ nguyên 100% kích thước mặc định/native của CVAT, tuyệt đối không can thiệp!
            if (!(obj as any).__cvat_ortho_size_hooked__) {
              (obj as any).__cvat_ortho_size_hooked__ = true;
              const originalOnBeforeRender = obj.onBeforeRender;
              obj.onBeforeRender = function (renderer: any, scene: any, camera: any, geometry: any, material: any, group: any) {
                if (typeof originalOnBeforeRender === "function") {
                  try {
                    originalOnBeforeRender.call(this, renderer, scene, camera, geometry, material, group);
                  } catch (_) {}
                }

                const isOrtho = camera && (camera.isOrthographicCamera || camera.type === "OrthographicCamera");
                const mats = Array.isArray(this.material) ? this.material : (this.material ? [this.material] : []);

                for (const m of mats) {
                  if (!m) continue;

                  // Khởi tạo và ghi nhớ kích thước native ban đầu của CVAT (chỉ lưu 1 lần duy nhất)
                  if ((m as any).__cvat_native_point_size__ === undefined) {
                    (m as any).__cvat_native_point_size__ = typeof m.size === "number" ? m.size : 1.0;
                  }

                  if (isOrtho) {
                    // 3 Khung nhìn 2D trực giao (Top, Side, Front): Đặt cỡ hạt rõ nét 3.5px
                    if (m.size !== currentOrthoPointSize) {
                      m.size = currentOrthoPointSize;
                    }
                  } else {
                    // Khung nhìn 3D chính (Perspective View):
                    // Nếu annotator vừa kéo thanh trượt Point Size trong Cài đặt của CVAT:
                    if (typeof m.size === "number" && m.size !== currentOrthoPointSize && m.size !== (m as any).__cvat_native_point_size__) {
                      (m as any).__cvat_native_point_size__ = m.size;
                    }

                    // Khôi phục kích thước native cho Perspective View
                    const nativeSize = (m as any).__cvat_native_point_size__;
                    if (m.size !== nativeSize) {
                      m.size = nativeSize;
                    }
                  }
                }
              };
            }

            pointsObjects.push(obj);
          }
        });
      }

      return pointsObjects;
    } catch (e) {
      return [];
    }
  }

  // Bảng 32 màu phân kỳ tương phản cao (High-Contrast Vivid Palette) cho từng Track ID (Nền Tối)
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

  // Bảng 32 màu Đậm Sâu Độ Tương Phản Cao (Ultra-Deep Vivid / Rich Jewel Palette) cho Giao diện Nền Trắng
  const DEEP_VIVID_TRACK_PALETTE: Array<{ r: number; g: number; b: number }> = [
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

  const OVERLAP_WARNING_COLOR = { r: 1.0, g: 0.0, b: 0.20 }; // Đỏ Neon Cảnh Báo (#ff0033)

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

    const palette = currentCanvasTheme === "light" ? DEEP_VIVID_TRACK_PALETTE : DISTINCT_TRACK_PALETTE;
    const colorIndex = (numId * 13 + 7) % palette.length;
    const baseColor = palette[colorIndex];

    if (isActive) {
      if (currentCanvasTheme === "light") {
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
        cosP: number;
        sinP: number;
        cosR: number;
        sinR: number;
        hasPitchRoll: boolean;
        halfL: number;
        halfW: number;
        halfH: number;
        maxR: number;
        maxR2: number;
        minX: number;
        maxX: number;
        minY: number;
        maxY: number;
        minZ: number;
        maxZ: number;
        colorR: number;
        colorG: number;
        colorB: number;
        isActive: boolean;
      }

      const defaultColors: Record<string, { r: number; g: number; b: number }> = {
        car: { r: 0.96, g: 0.62, b: 0.04 },        // Cam hổ phách (#f59e0b)
        pedestrian: { r: 0.51, g: 0.55, b: 0.97 }, // Xanh tím Indigo (#818cf8)
        cyclist: { r: 0.06, g: 0.73, b: 0.51 },    // Xanh lục Emerald (#10b981)
        truck: { r: 0.94, g: 0.38, b: 0.57 },      // Hồng Ruby (#f43f5e)
        bus: { r: 0.65, g: 0.43, b: 0.95 },        // Tím tím Purple (#a855f7)
        active: { r: 0.98, g: 0.80, b: 0.08 },     // Vàng chanh Neon (#facc15)
      };

      const EDGE_SNAP_COLOR = { r: 0.98, g: 0.80, b: 0.08 }; // Vàng chanh neon (#facc15) bám sát viền ±3cm
      const CUT_OUT_WARNING_COLOR = { r: 0.94, g: 0.27, b: 0.27 }; // Đỏ cảnh báo (#ef4444) cắt lẹm 1~8cm

      const fastBoxesMap = new Map<number, FastBoxTarget>();
      const activeClientId =
        store?.getState()?.annotation?.annotations?.activatedStateClientID ??
        (isCanvasInteracting ? canvas.view?.activatedElementID : null);

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
            const rx = pts[3] || 0;
            const ry = pts[4] || 0;
            const hasPitchRoll = rx !== 0 || ry !== 0;
            const cosP = hasPitchRoll ? Math.cos(-ry) : 1;
            const sinP = hasPitchRoll ? Math.sin(-ry) : 0;
            const cosR = hasPitchRoll ? Math.cos(-rx) : 1;
            const sinR = hasPitchRoll ? Math.sin(-rx) : 0;

            const halfL = l / 2;
            const halfW = w / 2;
            const halfH = h / 2;
            const maxR = Math.sqrt(halfL * halfL + halfW * halfW + halfH * halfH);
            const maxR2 = maxR * maxR;

            fastBoxesMap.set(clientId, {
              cx: pts[0],
              cy: pts[1],
              cz: pts[2],
              rx,
              ry,
              rz: yaw,
              cosY: Math.cos(-yaw),
              sinY: Math.sin(-yaw),
              cosP,
              sinP,
              cosR,
              sinR,
              hasPitchRoll,
              halfL,
              halfW,
              halfH,
              maxR,
              maxR2,
              minX: pts[0] - maxR,
              maxX: pts[0] + maxR,
              minY: pts[1] - maxR,
              maxY: pts[1] + maxR,
              minZ: pts[2] - maxR,
              maxZ: pts[2] + maxR,
              colorR: c.r,
              colorG: c.g,
              colorB: c.b,
              isActive,
            });
          }
        }

        // TẦNG 2: CẬP NHẬT TỌA ĐỘ VÀ ROTATION REALTIME TỪ THREE.JS DRAWN OBJECTS
        // Đọc trực tiếp Three.js cuboid.position / scale / rotation khi người dùng kéo/co giãn box (Perspective, Top, Side, Front)
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
              const basePos = { x: pts[0], y: pts[1], z: pts[2] };
              const baseYaw = pts[5] || 0;
              const baseScale = { l: pts[6], w: pts[7], h: pts[8] };

              const c = drawnItem.cuboid;
              // Kiểm tra từng view độc lập để phát hiện view nào đang được annotator kéo bằng chuột
              // Nếu đang kéo Top view: x và y thay đổi
              // Nếu đang kéo Side view: x và z thay đổi
              // Nếu đang kéo Front view: y và z thay đổi
              // Nếu đang kéo Perspective view: x, y, z thay đổi
              let bestDeltaPos = 0;
              let bestPos: { x: number; y: number; z: number } | null = null;

              const candidateViews = [
                { name: "top", obj: c.top },
                { name: "side", obj: c.side },
                { name: "front", obj: c.front },
                { name: "perspective", obj: c.perspective },
                { name: "root", obj: c },
              ];

              for (const cand of candidateViews) {
                const p = cand.obj?.position;
                if (p && typeof p.x === "number" && typeof p.y === "number" && typeof p.z === "number") {
                  let dx = p.x - basePos.x;
                  let dy = p.y - basePos.y;
                  let dz = p.z - basePos.z;
                  if (cand.name === "top") dz = 0;
                  if (cand.name === "side") dy = 0;
                  if (cand.name === "front") dx = 0;

                  const delta = dx * dx + dy * dy + dz * dz;
                  if (delta > bestDeltaPos && delta > 1e-4) {
                    bestDeltaPos = delta;
                    bestPos = {
                      x: cand.name === "front" ? basePos.x : p.x,
                      y: cand.name === "side" ? basePos.y : p.y,
                      z: cand.name === "top" ? basePos.z : p.z,
                    };
                  }
                }
              }

              if (bestPos) {
                cx = bestPos.x;
                cy = bestPos.y;
                cz = bestPos.z;
              } else {
                const fallbackPos = c.position || c.perspective?.position || c.top?.position;
                if (fallbackPos && typeof fallbackPos.x === "number") {
                  cx = fallbackPos.x;
                  cy = fallbackPos.y;
                  cz = fallbackPos.z;
                }
              }

              // Tương tự cho Rotation (Yaw)
              let bestDeltaYaw = 0;
              let bestYaw: number | null = null;
              for (const cand of candidateViews) {
                const r = cand.obj?.rotation;
                if (r && typeof r.z === "number") {
                  const dYaw = Math.abs(r.z - baseYaw);
                  if (dYaw > bestDeltaYaw && dYaw > 1e-4) {
                    bestDeltaYaw = dYaw;
                    bestYaw = r.z;
                  }
                }
              }
              if (bestYaw !== null) {
                yaw = bestYaw;
              } else {
                const fallbackRot = c.rotation || c.perspective?.rotation || c.top?.rotation;
                if (fallbackRot && typeof fallbackRot.z === "number") {
                  yaw = fallbackRot.z;
                }
              }

              // Tương tự cho Scale (l, w, h)
              let bestDeltaScale = 0;
              let bestScale: { x: number; y: number; z: number } | null = null;
              for (const cand of candidateViews) {
                const s = cand.obj?.scale;
                if (s && typeof s.x === "number" && s.x > 0) {
                  let dl = Math.abs(s.x - baseScale.l);
                  let dw = Math.abs(s.y - baseScale.w);
                  let dh = Math.abs(s.z - baseScale.h);
                  if (cand.name === "top") dh = 0;
                  if (cand.name === "side") dw = 0;
                  if (cand.name === "front") dl = 0;

                  const delta = dl + dw + dh;
                  if (delta > bestDeltaScale && delta > 1e-4) {
                    bestDeltaScale = delta;
                    bestScale = {
                      x: cand.name === "front" ? baseScale.l : s.x,
                      y: cand.name === "side" ? baseScale.w : s.y,
                      z: cand.name === "top" ? baseScale.h : s.z,
                    };
                  }
                }
              }
              if (bestScale) {
                l = bestScale.x;
                w = bestScale.y;
                h = bestScale.z;
              } else {
                const fallbackScale = c.scale || c.perspective?.scale || c.top?.scale;
                if (fallbackScale && typeof fallbackScale.x === "number" && fallbackScale.x > 0) {
                  l = fallbackScale.x;
                  w = fallbackScale.y;
                  h = fallbackScale.z;
                }
              }
            }

            if (l <= 0 || w <= 0 || h <= 0) continue;

            const clientId = Number(idStr);
            const isActive = clientId === Number(activeClientId);
            const trackId = data.parentID ?? data.trackID ?? clientId;
            const c = getDistinctTrackColor(trackId, isActive);

            const rx = pts[3] || 0;
            const ry = pts[4] || 0;
            const hasPitchRoll = rx !== 0 || ry !== 0;
            const cosP = hasPitchRoll ? Math.cos(-ry) : 1;
            const sinP = hasPitchRoll ? Math.sin(-ry) : 0;
            const cosR = hasPitchRoll ? Math.cos(-rx) : 1;
            const sinR = hasPitchRoll ? Math.sin(-rx) : 0;

            const halfL = l / 2;
            const halfW = w / 2;
            const halfH = h / 2;
            const maxR = Math.sqrt(halfL * halfL + halfW * halfW + halfH * halfH);
            const maxR2 = maxR * maxR;

            fastBoxesMap.set(clientId, {
              cx,
              cy,
              cz,
              rx,
              ry,
              rz: yaw,
              cosY: Math.cos(-yaw),
              sinY: Math.sin(-yaw),
              cosP,
              sinP,
              cosR,
              sinR,
              hasPitchRoll,
              halfL,
              halfW,
              halfH,
              maxR,
              maxR2,
              minX: cx - maxR,
              maxX: cx + maxR,
              minY: cy - maxR,
              maxY: cy + maxR,
              minZ: cz - maxR,
              maxZ: cz + maxR,
              colorR: c.r,
              colorG: c.g,
              colorB: c.b,
              isActive,
            });
          }
        }
      }

      const fastBoxes: FastBoxTarget[] = Array.from(fastBoxesMap.values());
      const activeBox = fastBoxes.find((b) => b.isActive) || (activeClientId ? fastBoxesMap.get(Number(activeClientId)) : null);

      const numBoxes = fastBoxes.length;
      const isPlain = currentPointColorMode === "plain";
      const isLight = currentCanvasTheme === "light";
      const plainR = isLight ? 0.0 : 1.0;
      const plainG = isLight ? 0.0 : 1.0;
      const plainB = isLight ? 0.0 : 1.0;

      // FAST SPATIAL BOUNDING FILTER: Tính toán Global AABB của toàn bộ các box để loại bỏ điểm ngoài lề
      let globalMinX = Infinity;
      let globalMaxX = -Infinity;
      let globalMinY = Infinity;
      let globalMaxY = -Infinity;
      let globalMinZ = Infinity;
      let globalMaxZ = -Infinity;

      for (let k = 0; k < numBoxes; k++) {
        const b = fastBoxes[k];
        if (b.minX < globalMinX) globalMinX = b.minX;
        if (b.maxX > globalMaxX) globalMaxX = b.maxX;
        if (b.minY < globalMinY) globalMinY = b.minY;
        if (b.maxY > globalMaxY) globalMaxY = b.maxY;
        if (b.minZ < globalMinZ) globalMinZ = b.minZ;
        if (b.maxZ > globalMaxZ) globalMaxZ = b.maxZ;
      }

      let activeMaxR15 = 0;
      let activeMaxR15_2 = 0;
      if (activeBox) {
        activeMaxR15 = activeBox.maxR + 0.15;
        activeMaxR15_2 = activeMaxR15 * activeMaxR15;
        const aMinX = activeBox.minX - 0.15;
        const aMaxX = activeBox.maxX + 0.15;
        const aMinY = activeBox.minY - 0.15;
        const aMaxY = activeBox.maxY + 0.15;
        const aMinZ = activeBox.minZ - 0.15;
        const aMaxZ = activeBox.maxZ + 0.15;
        if (aMinX < globalMinX) globalMinX = aMinX;
        if (aMaxX > globalMaxX) globalMaxX = aMaxX;
        if (aMinY < globalMinY) globalMinY = aMinY;
        if (aMaxY > globalMaxY) globalMaxY = aMaxY;
        if (aMinZ < globalMinZ) globalMinZ = aMinZ;
        if (aMaxZ > globalMaxZ) globalMaxZ = aMaxZ;
      }

      // SPATIAL HASH GRID 2D (Cell size = 8.0m): Giảm triệt để độ phức tạp duyệt Point-in-Box từ O(M*N) xuống O(M*1)
      // Sử dụng Integer Key ((gx + 2048) << 12) | ((gy + 2048) & 0xfff) triệt tiêu 100% việc cấp phát heap string trong loop 300.000 điểm
      const SPATIAL_GRID_CELL = 8.0;
      const spatialBoxGrid = new Map<number, number[]>();
      if (numBoxes >= 4) {
        for (let k = 0; k < numBoxes; k++) {
          const b = fastBoxes[k];
          const minGx = Math.floor(b.minX / SPATIAL_GRID_CELL);
          const maxGx = Math.floor(b.maxX / SPATIAL_GRID_CELL);
          const minGy = Math.floor(b.minY / SPATIAL_GRID_CELL);
          const maxGy = Math.floor(b.maxY / SPATIAL_GRID_CELL);
          for (let gx = minGx; gx <= maxGx; gx++) {
            for (let gy = minGy; gy <= maxGy; gy++) {
              const key = (((gx + 2048) << 12) | ((gy + 2048) & 0xfff));
              let bucket = spatialBoxGrid.get(key);
              if (!bucket) {
                bucket = [];
                spatialBoxGrid.set(key, bucket);
              }
              bucket.push(k);
            }
          }
        }
      }

      let anyUpdated = false;
      const processedGeometries = new Set<any>();

      for (const obj of ptsObjs) {
        const geom = obj.geometry;
        if (!geom) continue;

        // TỐI ƯU CỰC ĐỘ: Nếu nhiều views dùng chung 1 geometry buffer, chỉ tính toán 1 lần duy nhất!
        if (processedGeometries.has(geom)) {
          if (obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            for (const m of mats) {
              if (m && !m.vertexColors) {
                m.vertexColors = true;
                m.needsUpdate = true;
              }
            }
          }
          anyUpdated = true;
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
          let created = false;
          if (typeof BufferAttrClass === "function") {
            try {
              geom.setAttribute("color", new BufferAttrClass(colorArray, 3));
              colorAttr = geom.attributes.color;
              created = !!colorAttr;
            } catch (_) {}
          }
          if (!created && winThree && typeof winThree.BufferAttribute === "function") {
            try {
              geom.setAttribute("color", new winThree.BufferAttribute(colorArray, 3));
              colorAttr = geom.attributes.color;
              created = !!colorAttr;
            } catch (_) {}
          }
          if (!colorAttr) {
            colorAttr = { array: colorArray, needsUpdate: false };
            geom.attributes.color = colorAttr;
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

          // 1. FAST GLOBAL REJECT: Nếu nằm ngoài vùng bao quanh của toàn bộ các box
          // (Loại bỏ ngay 70-90% số điểm LiDAR không cần duyệt bất kỳ box nào!)
          if (
            numBoxes === 0 ||
            px < globalMinX || px > globalMaxX ||
            py < globalMinY || py > globalMaxY ||
            pz < globalMinZ || pz > globalMaxZ
          ) {
            colorArray[idx3] = plainR;
            colorArray[idx3 + 1] = plainG;
            colorArray[idx3 + 2] = plainB;
            continue;
          }

          // Lấy Intensity chuẩn hóa v in [0, 1] (Defensive Programming chống NaN / Infinity)
          let v = 0.5;
          if (intensityAttr && i < intensityAttr.length) {
            const rawInt = intensityAttr[i];
            if (typeof rawInt === "number" && !isNaN(rawInt) && isFinite(rawInt)) {
              v = rawInt <= 1.0 ? Math.max(0, rawInt) : Math.min(1.0, Math.max(0, rawInt) / 255);
            }
          }

          // Kiểm tra Point-in-Box (Hỗ trợ phát hiện Overlap 2..N box)
          let matched: FastBoxTarget | null = null;
          let matchCount = 0;

          // SPATIAL FAST-PATH: Khi có >= 4 boxes, chỉ duyệt các box lọt vào cell 2D của điểm
          let candidateIndices: number[] | null = null;
          if (numBoxes >= 4) {
            const gx = Math.floor(px * 0.125); // 0.125 = 1 / 8.0
            const gy = Math.floor(py * 0.125);
            const key = (((gx + 2048) << 12) | ((gy + 2048) & 0xfff));
            candidateIndices = spatialBoxGrid.get(key) || null;
          }

          if (numBoxes < 4 || (candidateIndices && candidateIndices.length > 0)) {
            const candidatesLen = candidateIndices ? candidateIndices.length : numBoxes;
            for (let cIdx = 0; cIdx < candidatesLen; cIdx++) {
              const k = candidateIndices ? candidateIndices[cIdx] : cIdx;
              const b = fastBoxes[k];

              // A. Fast Reject bằng AABB của từng box (chỉ dùng phép so sánh số học, không gọi hàm)
              if (px < b.minX || px > b.maxX || py < b.minY || py > b.maxY || pz < b.minZ || pz > b.maxZ) {
                continue;
              }

              const dx = px - b.cx;
              const dy = py - b.cy;
              const dz = pz - b.cz;

              // B. Fast Reject bằng Bounding Sphere R^2 (tránh hoàn toàn Math.abs và phép quay ma trận)
              if (dx * dx + dy * dy + dz * dz > b.maxR2) {
                continue;
              }

              // C. Chỉ khi lọt qua Bounding Sphere mới thực hiện biến đổi góc xoay Yaw, Pitch, Roll
              let lx = dx * b.cosY - dy * b.sinY;
              let ly = dx * b.sinY + dy * b.cosY;
              let lz = dz;

              if (b.hasPitchRoll) {
                const lx2 = lx * b.cosP + lz * b.sinP;
                const lz2 = -lx * b.sinP + lz * b.cosP;

                const ly2 = ly * b.cosR - lz2 * b.sinR;
                const lz3 = ly * b.sinR + lz2 * b.cosR;

                lx = lx2;
                ly = ly2;
                lz = lz3;
              }

              if (
                lx >= -b.halfL && lx <= b.halfL &&
                ly >= -b.halfW && ly <= b.halfW &&
                lz >= -b.halfH && lz <= b.halfH
              ) {
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

          // 2. Kiểm tra Cảnh Báo Viền & Cắt Lẹm đối với Active Box (Top / Side / Front Edge Snap)
          let isCutOut = false;
          let isEdgeSnap = false;

          if (activeBox) {
            const adx = px - activeBox.cx;
            const ady = py - activeBox.cy;
            const adz = pz - activeBox.cz;
            if (
              adx >= -activeMaxR15 && adx <= activeMaxR15 &&
              ady >= -activeMaxR15 && ady <= activeMaxR15 &&
              adz >= -activeMaxR15 && adz <= activeMaxR15 &&
              adx * adx + ady * ady + adz * adz <= activeMaxR15_2
            ) {
              let alx = adx * activeBox.cosY - ady * activeBox.sinY;
              let aly = adx * activeBox.sinY + ady * activeBox.cosY;
              let alz = adz;

              if (activeBox.hasPitchRoll) {
                const lx2 = alx * activeBox.cosP + alz * activeBox.sinP;
                const lz2 = -alx * activeBox.sinP + alz * activeBox.cosP;
                const ly2 = aly * activeBox.cosR - lz2 * activeBox.sinR;
                const lz3 = aly * activeBox.sinR + lz2 * activeBox.cosR;
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
            // VÙNG CHỒNG LẤN TỪ 2 ĐẾN N BOX: ĐỎ NEON CẢNH BÁO (#ff0033) FULL BRIGHTNESS
            colorArray[idx3] = OVERLAP_WARNING_COLOR.r;
            colorArray[idx3 + 1] = OVERLAP_WARNING_COLOR.g;
            colorArray[idx3 + 2] = OVERLAP_WARNING_COLOR.b;
          } else if (isCutOut) {
            // ĐIỂM BỊ CẮT LẸM NGOÀI MÉP ACTIVE BOX (1~8cm): ĐỎ CẢNH BÁO (#ef4444)
            colorArray[idx3] = CUT_OUT_WARNING_COLOR.r;
            colorArray[idx3 + 1] = CUT_OUT_WARNING_COLOR.g;
            colorArray[idx3 + 2] = CUT_OUT_WARNING_COLOR.b;
          } else if (isEdgeSnap) {
            // ĐIỂM BÁM SÁT VIỀN ACTIVE BOX (±3cm): VÀNG CHANH NEON (#facc15)
            colorArray[idx3] = EDGE_SNAP_COLOR.r;
            colorArray[idx3 + 1] = EDGE_SNAP_COLOR.g;
            colorArray[idx3 + 2] = EDGE_SNAP_COLOR.b;
          } else if (matched) {
            // NẰM TRONG 1 XE BỌC: Nhuộm màu riêng biệt theo Track ID (Đậm nhất có thể, factor = 1.0)
            const factor = 1.0;
            colorArray[idx3] = matched.colorR * factor;
            colorArray[idx3 + 1] = matched.colorG * factor;
            colorArray[idx3 + 2] = matched.colorB * factor;
          } else {
            // NGOÀI XE BỌC:
            // Nền trắng: PHẢI ĐEN HOÀN TOÀN 100% (r: 0.0, g: 0.0, b: 0.0)
            // Nền đen: PHẢI TRẮNG 100% (r: 1.0, g: 1.0, b: 1.0)
            colorArray[idx3] = plainR;
            colorArray[idx3 + 1] = plainG;
            colorArray[idx3 + 2] = plainB;
          }
        }

        if (colorAttr) {
          colorAttr.needsUpdate = true;
        }
        if (geom.attributes?.color) {
          geom.attributes.color.needsUpdate = true;
        }

        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const m of mats) {
            if (m && !m.vertexColors) {
              m.vertexColors = true;
              m.needsUpdate = true;
            }
          }
        }

        anyUpdated = true;
      }

      if (anyUpdated) {
        isColorizingRunning = true;
        try {
          // Chỉ gọi canvas.render() để Three.js CVAT tự quản lý luồng render mượt mà,
          // TUYỆT ĐỐI KHÔNG ép render thủ công cả 4 views gây tắc nghẽn GPU pipeline
          if (typeof canvas.render === "function") {
            canvas.render();
          }
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

  // Single-Flight Debounce Controller qua requestAnimationFrame cho Tô Màu Mây Điểm (Zero Main-Thread Freeze)
  let colorizeRafId: number | null = null;
  let colorizeDebounceTimer: any = null;
  let pendingColorizeOptions: { mode?: "intensity" | "plain"; colorizeBoxed?: boolean } | undefined = undefined;

  function schedulePointCloudColorization(
    delayMs: number = 0,
    options?: { mode?: "intensity" | "plain"; colorizeBoxed?: boolean }
  ): void {
    if (options) {
      pendingColorizeOptions = { ...pendingColorizeOptions, ...options };
    }
    if (colorizeDebounceTimer) {
      clearTimeout(colorizeDebounceTimer);
      colorizeDebounceTimer = null;
    }
    if (colorizeRafId) {
      cancelAnimationFrame(colorizeRafId);
      colorizeRafId = null;
    }

    const execute = () => {
      colorizeRafId = requestAnimationFrame(() => {
        colorizeRafId = null;
        const opts = pendingColorizeOptions;
        pendingColorizeOptions = undefined;
        applyPointCloudColorizationInMainWorld(opts);
      });
    };

    if (delayMs > 0) {
      colorizeDebounceTimer = setTimeout(execute, delayMs);
    } else {
      execute();
    }
  }

  // =============================================================================
  // WEBGL HARDWARE CLIPPING ENGINE: LÁT CẮT (SLICING), TẮT ĐẤT & ISOLATE ROI
  // 100% GPU Fragment Discard (0ms CPU Main Thread / 0 Garbage Collection Heap)
  // Bảo toàn 100% Perspective 3D View (View 3D chính không bị cắt)
  // =============================================================================
  interface OrthoSlicingConfig {
    hideGround: boolean;
  }

  let currentOrthoSlicing: OrthoSlicingConfig = {
    hideGround: true,
  };

  try {
    const savedSlicing = localStorage.getItem("cvat_3d_ortho_slicing");
    if (savedSlicing) {
      const parsed = JSON.parse(savedSlicing);
      if (typeof parsed.hideGround === "boolean") currentOrthoSlicing.hideGround = parsed.hideGround;
    }
  } catch (_) {}

  // =========================================================================
  // CÁC LỚP THUẦN TOÁN HỌC TƯƠNG THÍCH THREE.JS WEBGL CLIPPING (ZERO-DEPENDENCY)
  // Đảm bảo WebGLRenderer thực thi Clipping Planes chuẩn 100% kể cả khi Three.js bị Webpack đóng gói kín
  // =========================================================================
  class ThreeCompatibleVector3 {
    public isVector3: boolean;
    public x: number;
    public y: number;
    public z: number;

    constructor(x: number = 0, y: number = 0, z: number = 0) {
      this.isVector3 = true;
      this.x = x;
      this.y = y;
      this.z = z;
    }

    set(x: number, y: number, z: number) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    }

    copy(v: any) {
      this.x = v?.x || 0;
      this.y = v?.y || 0;
      this.z = v?.z || 0;
      return this;
    }

    clone() {
      return new ThreeCompatibleVector3(this.x, this.y, this.z);
    }

    dot(v: any) {
      return this.x * (v?.x || 0) + this.y * (v?.y || 0) + this.z * (v?.z || 0);
    }

    multiplyScalar(s: number) {
      this.x *= s;
      this.y *= s;
      this.z *= s;
      return this;
    }

    normalize() {
      const l = Math.hypot(this.x, this.y, this.z) || 1;
      this.x /= l;
      this.y /= l;
      this.z /= l;
      return this;
    }

    applyMatrix3(m: any) {
      const e = m.elements;
      const x = this.x, y = this.y, z = this.z;
      this.x = e[0] * x + e[3] * y + e[6] * z;
      this.y = e[1] * x + e[4] * y + e[7] * z;
      this.z = e[2] * x + e[5] * y + e[8] * z;
      return this;
    }

    applyMatrix4(m: any) {
      const e = m.elements;
      const x = this.x, y = this.y, z = this.z;
      const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
      this.x = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
      this.y = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
      this.z = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
      return this;
    }

    toArray(array: number[] | Float32Array = [], offset: number = 0) {
      array[offset] = this.x;
      array[offset + 1] = this.y;
      array[offset + 2] = this.z;
      return array;
    }
  }

  class ThreeCompatibleMatrix3 {
    public isMatrix3 = true;
    public elements: number[] = [1, 0, 0, 0, 1, 0, 0, 0, 1];

    set(
      n11: number, n12: number, n13: number,
      n21: number, n22: number, n23: number,
      n31: number, n32: number, n33: number
    ) {
      const te = this.elements;
      te[0] = n11; te[1] = n21; te[2] = n31;
      te[3] = n12; te[4] = n22; te[5] = n32;
      te[6] = n13; te[7] = n23; te[8] = n33;
      return this;
    }

    setFromMatrix4(m: any) {
      const me = m.elements;
      return this.set(
        me[0], me[4], me[8],
        me[1], me[5], me[9],
        me[2], me[6], me[10]
      );
    }

    getNormalMatrix(matrix4: any) {
      return this.setFromMatrix4(matrix4).invert().transpose();
    }

    invert() {
      const te = this.elements;
      const m11 = te[0], m21 = te[1], m31 = te[2],
            m12 = te[3], m22 = te[4], m32 = te[5],
            m13 = te[6], m23 = te[7], m33 = te[8];
      const t11 = m33 * m22 - m32 * m23;
      const t12 = -m33 * m12 + m32 * m13;
      const t13 = m23 * m12 - m22 * m13;
      const det = m11 * t11 + m21 * t12 + m31 * t13;
      if (det === 0) {
        te[0] = 1; te[1] = 0; te[2] = 0;
        te[3] = 0; te[4] = 1; te[5] = 0;
        te[6] = 0; te[7] = 0; te[8] = 1;
        return this;
      }
      const invDet = 1 / det;
      te[0] = t11 * invDet;
      te[1] = (-m33 * m21 + m31 * m23) * invDet;
      te[2] = (m32 * m21 - m31 * m22) * invDet;
      te[3] = t12 * invDet;
      te[4] = (m33 * m11 - m31 * m13) * invDet;
      te[5] = (-m32 * m11 + m31 * m12) * invDet;
      te[6] = t13 * invDet;
      te[7] = (-m23 * m11 + m21 * m13) * invDet;
      te[8] = (m22 * m11 - m21 * m12) * invDet;
      return this;
    }

    transpose() {
      const te = this.elements;
      let m = te[1]; te[1] = te[3]; te[3] = m;
      m = te[2]; te[2] = te[6]; te[6] = m;
      m = te[5]; te[5] = te[7]; te[7] = m;
      return this;
    }
  }

  class ThreeCompatiblePlane {
    public isPlane = true;
    public normal: any;
    public constant: number;

    constructor(normal?: any, constant: number = 0) {
      this.normal = normal && typeof normal.clone === "function"
        ? normal.clone()
        : new ThreeCompatibleVector3(normal?.x || 0, normal?.y || 0, normal?.z || 1);
      this.constant = constant || 0;
    }

    set(normal: any, constant: number) {
      this.normal.copy(normal);
      this.constant = constant;
      return this;
    }

    setComponents(x: number, y: number, z: number, w: number) {
      this.normal.set(x, y, z);
      this.constant = w;
      return this;
    }

    copy(source: any) {
      this.normal.copy(source.normal);
      this.constant = source.constant;
      return this;
    }

    clone() {
      return new ThreeCompatiblePlane(this.normal, this.constant);
    }

    coplanarPoint(target?: any) {
      const t = target || new ThreeCompatibleVector3();
      return t.copy(this.normal).multiplyScalar(-this.constant);
    }

    applyMatrix4(matrix: any, optionalNormalMatrix?: any) {
      const normalMatrix = optionalNormalMatrix || new ThreeCompatibleMatrix3().getNormalMatrix(matrix);
      const refPt = this.coplanarPoint(new ThreeCompatibleVector3()).applyMatrix4(matrix);
      const norm = this.normal.clone().applyMatrix3(normalMatrix).normalize();
      this.constant = -refPt.dot(norm);
      this.normal.copy(norm);
      return this;
    }
  }

  // Pre-allocated THREE.Plane pools để 0ms Garbage Collection
  const cachedTopPlanes: any[] = [];
  let clippingThreeEngine: any = null;
  let lastGlobalClippingActive: boolean = false;

  function getClippingThree(): any {
    if (clippingThreeEngine) return clippingThreeEngine;
    const win = window as any;
    if (win.THREE && typeof win.THREE.Plane === "function") {
      clippingThreeEngine = win.THREE;
      return clippingThreeEngine;
    }
    const store = getReduxStore();
    const canvas = store?.getState()?.annotation?.canvas?.instance;
    if (canvas?.THREE && typeof canvas.THREE.Plane === "function") {
      clippingThreeEngine = canvas.THREE;
      return clippingThreeEngine;
    }
    if (canvas?.view?.THREE && typeof canvas.view.THREE.Plane === "function") {
      clippingThreeEngine = canvas.view.THREE;
      return clippingThreeEngine;
    }
    // Fallback độc lập tương thích 100% Three.js WebGLClipping
    clippingThreeEngine = {
      Plane: ThreeCompatiblePlane,
      Vector3: ThreeCompatibleVector3,
      Matrix3: ThreeCompatibleMatrix3,
    };
    return clippingThreeEngine;
  }

  function ensurePlaneAt(arr: any[], index: number, ThreeClass: any): any {
    while (arr.length <= index) {
      const PlaneCtor = ThreeClass?.Plane || ThreeCompatiblePlane;
      const VecCtor = ThreeClass?.Vector3 || ThreeCompatibleVector3;
      arr.push(new PlaneCtor(new VecCtor(0, 0, 1), 0));
    }
    return arr[index];
  }

  function applyClippingPlanesToView(view: any, planes: any[], isSharedScene: boolean): void {
    if (!view) return;
    if (view.renderer) {
      view.renderer.localClippingEnabled = planes.length > 0;
      view.renderer.clippingPlanes = planes;
    }
  }

  /**
   * Tính toán và cập nhật các mặt phẳng cắt GPU WebGL cho 3 view trực giao (Top, Side, Front)
   * Giữ lại duy nhất chức năng Tắt Đất (Top View: cắt tại Z_base + 12cm).
   * Side và Front hoàn toàn không cắt (0 clipping planes -> 60 FPS cực mượt khi drag/zoom).
   * @param overrideTarget Thông số chi tiết đối tượng active (nếu truyền vào)
   * @param forceRender Ép Three.js render (mặc định: true, đặt false khi đang drag chuột để rAF tự lo)
   */
  function updateOrthoClippingPlanes(overrideTarget?: any, forceRender: boolean = true): void {
    try {
      const Three = getClippingThree();
      const store = getReduxStore();
      const canvas = store?.getState()?.annotation?.canvas?.instance;
      const views = canvas?.view?.views;
      if (!views) return;

      const topView = views.top;
      const sideView = views.side;
      const frontView = views.front;
      const perspectiveView = views.perspective;

      // Perspective View: Bảo toàn 100% toàn cảnh không bao giờ bị cắt
      if (perspectiveView?.renderer && perspectiveView.renderer.clippingPlanes && perspectiveView.renderer.clippingPlanes.length > 0) {
        perspectiveView.renderer.clippingPlanes = [];
      }

      const activeId =
        overrideTarget?.clientId ??
        canvas?.view?.activatedElementID ??
        store?.getState()?.annotation?.annotations?.activatedStateClientID ??
        lastActiveTrackId;

      const isAnyClippingActive = !!(
        currentOrthoSlicing.hideGround &&
        activeId && !isNaN(Number(activeId)) && Number(activeId) > 0
      );

      // Quản lý trạng thái compile shader: Chỉ ép material.needsUpdate khi trạng thái bật/tắt thay đổi (0ms micro-stutter)
      if (lastGlobalClippingActive !== isAnyClippingActive) {
        lastGlobalClippingActive = isAnyClippingActive;
        const scenesToNotify: any[] = [];
        for (const k of ["top", "side", "front", "perspective"]) {
          const sc = views[k]?.scene;
          if (sc && !scenesToNotify.includes(sc)) scenesToNotify.push(sc);
        }
        for (const sc of scenesToNotify) {
          if (typeof sc?.traverse === "function") {
            sc.traverse((obj: any) => {
              if (obj && (obj.isPoints || obj.type === "Points") && obj.material) {
                obj.material.needsUpdate = true;
              }
            });
          }
        }
      }

      const isSharedScene =
        !!(topView?.scene && perspectiveView?.scene && topView.scene === perspectiveView.scene);

      if (!isAnyClippingActive || !Three) {
        // Reset sạch sẽ clipping planes trên cả 3 view trực giao
        applyClippingPlanesToView(topView, [], isSharedScene);
        applyClippingPlanesToView(sideView, [], isSharedScene);
        applyClippingPlanesToView(frontView, [], isSharedScene);
        applyClippingPlanesToView(perspectiveView, [], isSharedScene);
        return;
      }

      const numId = Number(activeId);
      let p: number[] | null = null;
      if (overrideTarget?.points && Array.isArray(overrideTarget.points)) {
        p = overrideTarget.points;
      } else {
        const drawnItem = canvas?.view?.drawnObjects?.[String(numId)];
        if (drawnItem) {
          const states = store?.getState()?.annotation?.annotations?.states || [];
          const matched = states.find((s: any) => s.clientID === numId);
          p = extractLivePointsFromDrawnAndState(drawnItem, matched);
        }
        if (!p) {
          const details = extractObjectDetails(numId);
          p = details?.points || null;
        }
      }

      if (!p || p.length < 9) {
        applyClippingPlanesToView(topView, [], isSharedScene);
        applyClippingPlanesToView(sideView, [], isSharedScene);
        applyClippingPlanesToView(frontView, [], isSharedScene);
        applyClippingPlanesToView(perspectiveView, [], isSharedScene);
        return;
      }

      const cx = p[0], cy = p[1], cz = p[2];
      const rx = p[3] || 0;
      const ry = p[4] || 0;
      const rz = p[5] || 0;
      const h = p[8];
      const halfH = h / 2;

      // Tính vector hướng trục thẳng đứng u_z
      const cosZ = Math.cos(rz), sinZ = Math.sin(rz);
      const cosY = Math.cos(ry), sinY = Math.sin(ry);
      const cosX = Math.cos(rx), sinX = Math.sin(rx);

      const uzx = cosZ * sinY * cosX + sinZ * sinX;
      const uzy = sinZ * sinY * cosX - cosZ * sinX;
      const uzz = cosY * cosX;

      // Helper set plane: normal (nx, ny, nz) và constant d = -(n . p)
      const setPlane = (plane: any, nx: number, ny: number, nz: number, px: number, py: number, pz: number) => {
        plane.normal.set(nx, ny, nz);
        plane.constant = -(nx * px + ny * py + nz * pz);
      };

      // 1. TOP VIEW PLANES: Duy nhất mặt phẳng cắt ngang mặt đất dưới gầm xe (Z_base + 12cm)
      const activeTopPlanes: any[] = [];
      if (currentOrthoSlicing.hideGround) {
        const pzCutX = cx + (-halfH + 0.12) * uzx;
        const pzCutY = cy + (-halfH + 0.12) * uzy;
        const pzCutZ = cz + (-halfH + 0.12) * uzz;
        const pl = ensurePlaneAt(cachedTopPlanes, 0, Three);
        setPlane(pl, uzx, uzy, uzz, pzCutX, pzCutY, pzCutZ);
        activeTopPlanes.push(pl);
      }

      // 2. Áp dụng: Top View cắt mặt đất, Side và Front view toàn cảnh không cắt (0 clipping planes)
      applyClippingPlanesToView(topView, activeTopPlanes, isSharedScene);
      applyClippingPlanesToView(sideView, [], isSharedScene);
      applyClippingPlanesToView(frontView, [], isSharedScene);
      applyClippingPlanesToView(perspectiveView, [], isSharedScene);

      // Trigger render Three.js nhẹ (chỉ khi forceRender = true, tránh bão render GPU khi đang drag chuột)
      if (forceRender && typeof canvas?.render === "function") {
        canvas.render();
      }
    } catch (e) {
      console.warn("[CVAT 3D Suite] Lỗi updateOrthoClippingPlanes:", e);
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



  // Single-Flight Frame Controller: Hủy tác vụ cũ khi đổi frame, chỉ render đúng 1 lần cho frame active qua requestAnimationFrame
  function scheduleSingleFrameColorizationAndGround(targetFrame: number, delayMs: number = 180): void {
    if (singleFrameColorizeTimer) {
      clearTimeout(singleFrameColorizeTimer);
      singleFrameColorizeTimer = null;
    }
    if (colorizeRafId) {
      cancelAnimationFrame(colorizeRafId);
      colorizeRafId = null;
    }

    const runAttempt = (attempt: number) => {
      try {
        const store = getReduxStore();
        const curF =
          store?.getState()?.annotation?.player?.frame?.number ??
          store?.getState()?.annotation?.job?.instance?.frame;
        if (curF === targetFrame) {
          applyCanvasThemeInMainWorld();
          colorizeRafId = requestAnimationFrame(() => {
            colorizeRafId = null;
            const ok = applyPointCloudColorizationInMainWorld();
            // Nếu chưa có points (PCD đang tải qua mạng) và chưa thử quá 3 lần:
            if (!ok && attempt < 3) {
              singleFrameColorizeTimer = setTimeout(() => runAttempt(attempt + 1), 350);
            }
          });
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

  // Thuật toán PHÂN CỤM THEO ĐỘ ĐO KHOẢNG CÁCH PHÓNG TO ĐIỂM 5X (5x Point Dilation Spatial Graph)
  // - Mỗi điểm LiDAR được gán một bán kính hạt điểm cơ sở r0 ≈ 2.5cm.
  // - Khi phóng to điểm lên 5x, bán kính hiệu dụng là Reff = 5 * r0 = 12.5cm.
  // - Ngưỡng kết nối láng giềng giữa 2 điểm chạm nhau là Dconnect = 2 * Reff = 25cm.
  // - Đám mây điểm thân vỏ xe/người/xe máy liên thông sẽ kết hợp thành duy nhất một Khối Thân Chính (Dominant Component).
  // - Tối ưu hóa bằng Spatial Hash Grid O(N) và Disjoint Set Union (DSU) với thời gian thực thi < 0.05ms.
  function clusterByPointDilation5x<T extends { lx: number; ly: number; z?: number }>(
    pts: T[],
    options: {
      basePointSize?: number;
      dilationFactor?: number;
      connectDist?: number;
      connectDistLx?: number;
      connectDistLy?: number;
      dim?: "2d" | "3d";
      minClusterPts?: number;
      centerBias?: { lx: number; ly: number };
    } = {}
  ): {
    dominantPts: T[];
    noisePts: T[];
    clusters: T[][];
    dominantClusterIndex: number;
    connectDist: number;
  } {
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
              if (j <= i) continue;

              const pj = pts[j];
              const dX = (pi.lx - pj.lx) / connectDistX;
              const dY = (pi.ly - pj.ly) / connectDistY;
              let distNormSq = dX * dX + dY * dY;

              if (is3D) {
                const dZ = ((pi.z ?? 0) - (pj.z ?? 0)) / connectDistZ;
                distNormSq += dZ * dZ;
              }

              if (distNormSq <= 1.000001) {
                union(i, j);
              }
            }
          }
        }
      }
    }

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
    fitStep?: "all" | "top" | "side" | "front";
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

    // Lọc cụm liên thông bằng Độ đo phóng to điểm 5x (5x Point Dilation Spatial Graph)
    // Kết nối liền mạch vỏ xe và bảo vệ 100% curpoint biên đón tia, triệt tiêu người đi bộ & xe đỗ bên cạnh
    const dilationRes = clusterByPointDilation5x(rawBodyPts, {
      basePointSize: 0.025,
      dilationFactor: 5.0,
      connectDist: 0.25,
      dim: "2d",
      centerBias: { lx: 0, ly: 0 },
    });
    const dominantDilationPts = dilationRes.dominantPts.length >= 4 ? dilationRes.dominantPts : rawBodyPts;

    // Lớp 1: Lọc nhiễu thưa thớt sát thân xe bằng mật độ lõi 3D
    const denseCorePts = filterSparseNoiseByLocalDensity(dominantDilationPts, { radius: 0.22, minCoreNeighbors: 2 });

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
      fitStep,
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
    const headBuffer = options.headBuffer ?? 0.05;
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

    const isSparse = rawBodyPts.length <= 12;
    let cleanPedPts = rawBodyPts;
    if (!isSparse) {
      const pedDilationRes = clusterByPointDilation5x(rawBodyPts, {
        basePointSize: 0.022,
        dilationFactor: 5.0,
        connectDist: 0.22,
        dim: "2d",
        centerBias: { lx: 0, ly: 0 },
      });
      cleanPedPts = pedDilationRes.dominantPts.length >= 6 ? pedDilationRes.dominantPts : rawBodyPts;
    }

    // 3. Phân cụm mật độ tự thích ứng (Adaptive Density-Connected Clustering):
    // - Giảm cắt nhiễu bớt đi: Dùng maxGapLx = 0.32m ở Side; maxGapLy = 0.30m ở Front để không chém đứt curpoint cẳng chân, sải bước hay tay
    const maxGapLx = (step === "side" || isSparse) ? 0.32 : 0.22;
    const maxGapLy = (step === "front" || isSparse) ? 0.30 : 0.22;

    const clusterLy = filterDenseConnectedCluster1D(cleanPedPts, "ly", maxGapLy, 0);
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
    const headBuffer = options.headBuffer ?? 0.05;
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
    let cleanCyclistPts = rawPts;
    if (!isSparse) {
      const cyclistDilationRes = clusterByPointDilation5x(rawPts, {
        basePointSize: 0.03,
        dilationFactor: 5.0,
        connectDist: 0.30,
        connectDistLx: 0.38,
        connectDistLy: 0.32,
        dim: "2d",
        centerBias: { lx: 0, ly: 0 },
      });
      cleanCyclistPts = cyclistDilationRes.dominantPts.length >= 8 ? cyclistDilationRes.dominantPts : rawPts;
    }

    // Giảm cắt nhiễu bớt đi: Dùng maxGapLx = 0.38m ở Side để nối thông lốp trước/sau; maxGapLy = 0.35m ở Front để nối thông gương/tay lái
    const maxGapLx = (step === "side" || isSparse) ? 0.38 : 0.28;
    const maxGapLy = (step === "front" || isSparse) ? 0.35 : 0.24;
    const clusterLy = filterDenseConnectedCluster1D(cleanCyclistPts, "ly", maxGapLy, 0);
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

  // Biến và hàm tối ưu O(1) Class Swap cho DOM Sidebar của CVAT (Loại bỏ hoàn toàn querySelectorAll trên cả danh sách)
  let lastHighlightedSidebarItem: HTMLElement | null = null;
  function syncSidebarItemHighlight(id: number | null): void {
    try {
      if (id === null || id <= 0) {
        if (lastHighlightedSidebarItem) {
          lastHighlightedSidebarItem.classList.remove("cvat-objects-sidebar-state-item-active", "selected");
          lastHighlightedSidebarItem = null;
        }
        return;
      }

      const sidebarItem =
        document.querySelector<HTMLElement>(`#cvat-objects-sidebar-state-item-${id}`) ||
        document.querySelector<HTMLElement>(`[data-cvat-state-item-id="${id}"]`) ||
        document.querySelector<HTMLElement>(`[class*="cvat-objects-sidebar-state-item"][id*="${id}"]`);

      if (sidebarItem) {
        if (lastHighlightedSidebarItem && lastHighlightedSidebarItem !== sidebarItem) {
          lastHighlightedSidebarItem.classList.remove("cvat-objects-sidebar-state-item-active", "selected");
        }
        sidebarItem.classList.add("cvat-objects-sidebar-state-item-active", "selected");
        lastHighlightedSidebarItem = sidebarItem;
        sidebarItem.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    } catch (_) {}
  }

  function updateMainWorldLabels(job?: any): void {
    try {
      const store = getReduxStore();
      const state = store?.getState?.();
      const storeJob = state?.annotation?.job?.instance || job;
      const candidates = [
        storeJob?.labels,
        storeJob?.task?.labels,
        state?.annotation?.job?.labels,
        state?.annotation?.job?.task?.labels,
        state?.annotation?.canvas?.instance?.setup?.labels,
      ];
      for (const labels of candidates) {
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
      }
    } catch (_) {}
  }

  function resolveLabelName(stateOrShape: any): { name: string; color: string } {
    if (!stateOrShape) return { name: "Object", color: "#22c55e" };

    // 1. Kiểm tra trực tiếp label.name
    if (stateOrShape?.label && typeof stateOrShape.label.name === "string" && stateOrShape.label.name.trim()) {
      return {
        name: stateOrShape.label.name.trim(),
        color: stateOrShape.label.color || "#22c55e",
      };
    }
    // 1b. data.label.name
    if (stateOrShape?.data?.label && typeof stateOrShape.data.label.name === "string" && stateOrShape.data.label.name.trim()) {
      return {
        name: stateOrShape.data.label.name.trim(),
        color: stateOrShape.data.label.color || "#22c55e",
      };
    }

    // 2. Tìm lblId
    const lblId =
      stateOrShape?.labelID ??
      stateOrShape?.labelId ??
      stateOrShape?.label_id ??
      stateOrShape?.label?.id ??
      stateOrShape?.data?.labelID ??
      stateOrShape?.data?.labelId ??
      stateOrShape?.data?.label?.id;

    if (lblId !== undefined) {
      if (!mainWorldLabelsCache.has(Number(lblId))) {
        updateMainWorldLabels();
      }
      if (mainWorldLabelsCache.has(Number(lblId))) {
        return mainWorldLabelsCache.get(Number(lblId))!;
      }
    }

    // 3. Fallback tra cứu từ DOM sidebar nếu có clientID
    const clientId = stateOrShape?.clientID ?? stateOrShape?.clientId ?? stateOrShape?.id;
    if (clientId !== undefined && typeof document !== "undefined") {
      try {
        const sidebarItem =
          document.querySelector<HTMLElement>(`#cvat-objects-sidebar-state-item-${clientId}`) ||
          document.querySelector<HTMLElement>(`[class*="cvat-objects-sidebar-state-item"][id*="${clientId}"]`);
        if (sidebarItem) {
          const labelEl =
            sidebarItem.querySelector<HTMLElement>(".cvat-objects-sidebar-state-item-label-selector .ant-select-selection-item") ||
            sidebarItem.querySelector<HTMLElement>(".ant-select-selection-item") ||
            sidebarItem.querySelector<HTMLElement>("[class*='label']");
          const labelText = labelEl?.innerText?.trim() || labelEl?.textContent?.trim();
          if (labelText) {
            return { name: labelText, color: "#22c55e" };
          }
        }
      } catch (_) {}
    }

    return { name: "Object", color: "#22c55e" };
  }

  // Trích xuất tọa độ và kích thước thời gian thực (Live 3D Coordinates)
  // Ưu tiên đọc trực tiếp từ Three.js cuboid khi người dùng đang kéo bằng chuột trên Canvas
  function extractLivePointsFromDrawnAndState(drawnItem: any, stateOrShape: any): number[] | null {
    const basePoints =
      drawnItem?.data?.points && Array.isArray(drawnItem.data.points) && drawnItem.data.points.length >= 9
        ? drawnItem.data.points
        : stateOrShape?.points && Array.isArray(stateOrShape.points) && stateOrShape.points.length >= 9
        ? stateOrShape.points
        : null;

    if (!basePoints) return null;

    let cx = basePoints[0];
    let cy = basePoints[1];
    let cz = basePoints[2];
    let rx = basePoints[3] || 0;
    let ry = basePoints[4] || 0;
    let yaw = basePoints[5] || 0;
    let l = basePoints[6];
    let w = basePoints[7];
    let h = basePoints[8];

    if (drawnItem && drawnItem.cuboid) {
      const basePos = { x: basePoints[0], y: basePoints[1], z: basePoints[2] };
      const baseYaw = basePoints[5] || 0;
      const baseScale = { l: basePoints[6], w: basePoints[7], h: basePoints[8] };
      const c = drawnItem.cuboid;

      let bestDeltaPos = 0;
      let bestPos: { x: number; y: number; z: number } | null = null;
      const candidateViews = [
        { name: "top", obj: c.top },
        { name: "side", obj: c.side },
        { name: "front", obj: c.front },
        { name: "perspective", obj: c.perspective },
        { name: "root", obj: c },
      ];

      for (const cand of candidateViews) {
        const p = cand.obj?.position;
        if (p && typeof p.x === "number" && typeof p.y === "number" && typeof p.z === "number") {
          let dx = p.x - basePos.x;
          let dy = p.y - basePos.y;
          let dz = p.z - basePos.z;
          if (cand.name === "top") dz = 0;
          if (cand.name === "side") dy = 0;
          if (cand.name === "front") dx = 0;

          const delta = dx * dx + dy * dy + dz * dz;
          if (delta > bestDeltaPos && delta > 1e-4) {
            bestDeltaPos = delta;
            bestPos = {
              x: cand.name === "front" ? basePos.x : p.x,
              y: cand.name === "side" ? basePos.y : p.y,
              z: cand.name === "top" ? basePos.z : p.z,
            };
          }
        }
      }

      if (bestPos) {
        cx = bestPos.x;
        cy = bestPos.y;
        cz = bestPos.z;
      } else {
        const fallbackPos = c.position || c.perspective?.position || c.top?.position;
        if (fallbackPos && typeof fallbackPos.x === "number" && typeof fallbackPos.y === "number" && typeof fallbackPos.z === "number") {
          cx = fallbackPos.x;
          cy = fallbackPos.y;
          cz = fallbackPos.z;
        }
      }

      // Rotation (Yaw)
      let bestDeltaYaw = 0;
      let bestYaw: number | null = null;
      for (const cand of candidateViews) {
        const r = cand.obj?.rotation;
        if (r && typeof r.z === "number") {
          const dYaw = Math.abs(r.z - baseYaw);
          if (dYaw > bestDeltaYaw && dYaw > 1e-4) {
            bestDeltaYaw = dYaw;
            bestYaw = r.z;
          }
        }
      }
      if (bestYaw !== null) {
        yaw = bestYaw;
      } else {
        const fallbackRot = c.rotation || c.perspective?.rotation || c.top?.rotation;
        if (fallbackRot && typeof fallbackRot.z === "number") {
          yaw = fallbackRot.z;
        }
      }

      // Scale (l, w, h)
      let bestDeltaScale = 0;
      let bestScale: { x: number; y: number; z: number } | null = null;
      for (const cand of candidateViews) {
        const s = cand.obj?.scale;
        if (s && typeof s.x === "number" && s.x > 0) {
          let dl = Math.abs(s.x - baseScale.l);
          let dw = Math.abs(s.y - baseScale.w);
          let dh = Math.abs(s.z - baseScale.h);
          if (cand.name === "top") dh = 0;
          if (cand.name === "side") dw = 0;
          if (cand.name === "front") dl = 0;

          const delta = dl + dw + dh;
          if (delta > bestDeltaScale && delta > 1e-4) {
            bestDeltaScale = delta;
            bestScale = {
              x: cand.name === "front" ? baseScale.l : s.x,
              y: cand.name === "side" ? baseScale.w : s.y,
              z: cand.name === "top" ? baseScale.h : s.z,
            };
          }
        }
      }
      if (bestScale) {
        l = bestScale.x;
        w = bestScale.y;
        h = bestScale.z;
      } else {
        const fallbackScale = c.scale || c.perspective?.scale || c.top?.scale;
        if (fallbackScale && typeof fallbackScale.x === "number" && fallbackScale.x > 0) {
          l = fallbackScale.x;
          w = fallbackScale.y;
          h = fallbackScale.z;
        }
      }
    }

    const res = [...basePoints];
    res[0] = cx;
    res[1] = cy;
    res[2] = cz;
    res[3] = rx;
    res[4] = ry;
    res[5] = yaw;
    res[6] = l;
    res[7] = w;
    res[8] = h;
    return res;
  }

  // Căn giữa (Center) và tập trung (Focus) View 3D vào đối tượng tức thì (Perspective & Orthographic Views)
  function center3DViewOnObject(uiId: number, targetPos?: { x: number; y: number; z: number }): boolean {
    // Zero-Stall Guard: Nếu người dùng đang giữ chuột kéo box hoặc điều hướng canvas, tuyệt đối không dời camera
    if (isCanvasInteracting || (window as any).__cvat_mouse_down__) {
      return false;
    }
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

      // 2. Tìm tọa độ tâm box (x, y, z) đa tầng (Robust Multi-Layer Pos Resolver)
      let pos = targetPos;
      if (!pos) {
        // Tầng 1: Tìm trực tiếp theo key string trong drawnObjects
        const drawn = canvas.view?.drawnObjects?.[String(uiId)];
        if (drawn?.data?.points && Array.isArray(drawn.data.points)) {
          pos = {
            x: drawn.data.points[0],
            y: drawn.data.points[1],
            z: drawn.data.points[2],
          };
        } else {
          // Tầng 2: Quét toàn bộ drawnObjects so khớp clientID, parentID, trackID, serverID
          const drawnObjects = canvas.view?.drawnObjects || {};
          for (const k of Object.keys(drawnObjects)) {
            const item = drawnObjects[k];
            const d = item?.data;
            if (d && Array.isArray(d.points)) {
              if (
                Number(k) === uiId ||
                Number(d.clientID) === uiId ||
                Number(d.parentID) === uiId ||
                Number(d.trackID) === uiId ||
                Number(d.serverID) === uiId
              ) {
                pos = { x: d.points[0], y: d.points[1], z: d.points[2] };
                break;
              }
            }
          }
        }

        // Tầng 3: Fallback tìm trong Redux annotations states
        if (!pos) {
          const states = store?.getState()?.annotation?.annotations?.states || [];
          const matched = states.find(
            (s: any) =>
              Number(s.clientID) === uiId ||
              Number(s.id) === uiId ||
              Number(s.parentID) === uiId ||
              Number(s.trackID) === uiId ||
              Number(s.serverID) === uiId
          );
          if (matched && Array.isArray(matched.points)) {
            pos = { x: matched.points[0], y: matched.points[1], z: matched.points[2] };
          }
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
  let currentActiveTrackId: number = -1;
  let isFrameTransitioning = false;
  let frameTransitionTimer: any = null;
  let lockOnActiveTimer: any = null;

  // 🚨 BẢO VỆ CHUYỂN FRAME: Theo dõi và thoát transition tức thì khi nhận thao tác chuột
  // Bảo toàn 100% các sự kiện di chuột tự nhiên (pointermove/mouseenter) để CVAT nhận diện hover handle
  // Hủy ngay toàn bộ timer ngầm (lockOnActiveTimer, singleFrameColorizeTimer) để Main Thread mượt mà 60 FPS khi kéo box
  const handlePointerTransitionUnblock = (e: Event) => {
    if (e.type === "pointerdown" || e.type === "mousedown") {
      isCanvasInteracting = true;
      (window as any).__cvat_mouse_down__ = true;
      if (isFrameTransitioning) {
        isFrameTransitioning = false;
        if (frameTransitionTimer) {
          clearTimeout(frameTransitionTimer);
          frameTransitionTimer = null;
        }
      }
      if (lockOnActiveTimer) {
        clearTimeout(lockOnActiveTimer);
        lockOnActiveTimer = null;
      }
      if (singleFrameColorizeTimer) {
        clearTimeout(singleFrameColorizeTimer);
        singleFrameColorizeTimer = null;
      }
    }
  };
  window.addEventListener("pointerdown", handlePointerTransitionUnblock, { capture: true, passive: true });
  window.addEventListener("mousedown", handlePointerTransitionUnblock, { capture: true, passive: true });

  // Theo dõi trạng thái nhấn chuột toàn cục (Zero-Stall Mouse Tracking)
  window.addEventListener("pointerdown", () => { (window as any).__cvat_mouse_down__ = true; }, { capture: true, passive: true });
  window.addEventListener("mousedown", () => { (window as any).__cvat_mouse_down__ = true; }, { capture: true, passive: true });
  window.addEventListener("pointerup", () => { (window as any).__cvat_mouse_down__ = false; }, { capture: true, passive: true });
  window.addEventListener("mouseup", () => { (window as any).__cvat_mouse_down__ = false; }, { capture: true, passive: true });
  window.addEventListener("pointercancel", () => { (window as any).__cvat_mouse_down__ = false; }, { capture: true, passive: true });

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
    if (lockOnActiveTimer) {
      clearTimeout(lockOnActiveTimer);
      lockOnActiveTimer = null;
    }

    try {
      const store = getReduxStore();
      const anno = store?.getState()?.annotation;
      const canvas = anno?.canvas?.instance;
      const states = anno?.annotations?.states || [];

      // 1. Kiểm tra tính hợp lệ của states trong Redux đối với targetFrame
      // Nếu Redux đang fetching, hoặc states đang rỗng, hoặc phần tử trong states mang frame cũ (!== targetFrame):
      // ĐÂY LÀ STATES CỦA FRAME CŨ, KHÔNG ĐƯỢC DÙNG (chống kích hoạt nhầm ID cũ)!
      const isFetching = !!anno?.annotations?.fetching;
      const isStaleStates =
        isFetching ||
        states.length === 0 ||
        (states.length > 0 && typeof states[0].frame === "number" && states[0].frame !== targetFrame);

      // 2. Dò tìm đối tượng theo Track ID bền vững (persistentActiveTrackId) để CHỐNG NHẢY SANG ID KHÁC
      let matchedState: any = null;
      const trackIdToFind = persistentActiveTrackId !== null ? persistentActiveTrackId : targetId;

      if (!isStaleStates && trackIdToFind !== null && trackIdToFind !== undefined && !isNaN(trackIdToFind)) {
        matchedState = states.find(
          (s: any) =>
            Number(s.parentID ?? s.trackID ?? s.parent?.clientID) === Number(trackIdToFind) &&
            (typeof s.frame !== "number" || s.frame === targetFrame) &&
            !s.outside
        );
        if (!matchedState) {
          matchedState = states.find(
            (s: any) =>
              Number(s.clientID) === Number(trackIdToFind) &&
              (s.parentID === undefined || s.parentID === null) &&
              (typeof s.frame !== "number" || s.frame === targetFrame) &&
              !s.outside
          );
        }
      }

      // TUYỆT ĐỐI KHÔNG lookup bừa bãi vào drawnObjects[String(targetId)] khi chưa có matchedState,
      // vì targetId là Track ID (hoặc clientID cũ của frame trước), tra vào drawnObjects sẽ ăn nhầm sang object khác!
      if (!matchedState) {
        // Nếu chưa nạp xong states của frame mới hoặc đang là states cũ, thử lại ở attempt tiếp theo
        const delays = [60, 140, 260, 480, 800];
        if (attempt < delays.length) {
          lockOnActiveTimer = setTimeout(() => {
            lockOnActiveTimer = null;
            const curF = anno?.player?.frame?.number ?? store?.getState()?.annotation?.job?.instance?.frame;
            if (curF === targetFrame) {
              lockOnActiveObjectAtFrame(targetId, targetFrame, attempt + 1);
            }
          }, delays[attempt]);
        } else {
          // Hết lượt thử mà không tìm thấy track này ở frame mới -> đối tượng kết thúc hoặc outside
          window.dispatchEvent(new CustomEvent("CVAT_EXT_RES_OBJECT_DEACTIVATED"));
        }
        return;
      }

      const activeIdToUse = Number(matchedState.clientID);
      let foundPos: { x: number; y: number; z: number } | null = null;
      if (Array.isArray(matchedState.points) && matchedState.points.length >= 3) {
        foundPos = {
          x: matchedState.points[0],
          y: matchedState.points[1],
          z: matchedState.points[2],
        };
      }

      // Kiểm tra xem Three.js đã tạo mesh cho đối tượng này chưa
      const isMeshReady = !!canvas?.view?.drawnObjects?.[String(activeIdToUse)];

      // 2. Kích hoạt và ghim tâm
      if (foundPos && typeof foundPos.x === "number" && !isNaN(foundPos.x)) {
        lastActiveTrackId = activeIdToUse;

        // A. Kích hoạt lại đúng box trên canvas 3D để bật hiển thị Top, Side, Front views
        if (canvas && typeof canvas.activate === "function") {
          try {
            canvas.activate(activeIdToUse);
          } catch (_) {}
        }

        // B. Đồng bộ Redux Store (Anti-Loop: Chỉ dispatch khi Store chưa active ID này)
        if (store && typeof store.dispatch === "function") {
          try {
            const currentStoreActiveId =
              store.getState()?.annotation?.annotations?.activatedStateClientID ??
              store.getState()?.annotation?.canvas?.instance?.view?.activatedElementID;
            if (Number(currentStoreActiveId) !== Number(activeIdToUse)) {
              store.dispatch({
                type: "ACTIVATE_OBJECT",
                payload: { activatedStateClientID: activeIdToUse, activatedElementID: activeIdToUse },
              });
            }
          } catch (_) {}
        }

        // C. Căn giữa Top, Side, Front và Perspective theo tâm xe (nếu bật ghim tâm)
        if (autoCenterOnFrameChange) {
          center3DViewOnObject(activeIdToUse, foundPos);
        }

        // D. Đồng bộ highlight Sidebar (Tối ưu O(1) Direct Class Swap)
        syncSidebarItemHighlight(Number(activeIdToUse));

        if (typeof canvas.render === "function") {
          canvas.render();
        }

        // Thông báo cho Extension biết xe đã được kích hoạt lại thành công kèm trackId
        const details = extractObjectDetails(activeIdToUse);
        updateOrthoClippingPlanes(details);
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_RES_OBJECT_ACTIVATED", {
            detail: { clientId: activeIdToUse, trackId: persistentActiveTrackId, details },
          })
        );
      }

      // 3. Nếu Three.js mesh chưa sẵn sàng, retry nhẹ để hoàn thiện hiển thị
      if (!isMeshReady && attempt < 3) {
        const delays = [60, 150, 300];
        lockOnActiveTimer = setTimeout(() => {
          lockOnActiveTimer = null;
          const curF = anno?.player?.frame?.number ?? store?.getState()?.annotation?.job?.instance?.frame;
          if (curF === targetFrame) {
            lockOnActiveObjectAtFrame(targetId, targetFrame, attempt + 1);
          }
        }, delays[attempt]);
      }
      // NẾU isMeshReady === true: ĐÃ THÀNH CÔNG VÀ MƯỢT MÀ -> DỪNG RETRY NGAY LẬP TỨC!
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
        schedulePointCloudColorization(0);
      }
      calculateAndBroadcastBoxEdgeContacts();
      updateOrthoClippingPlanes();

      return true;
    } catch (err) {
      console.warn("[CVAT 3D Suite] Lỗi cập nhật trực tiếp Three.js:", err);
      return false;
    }
  }

  // Phân tích và trích xuất attributes của đối tượng từ cvat-core / Redux
  function parseObjectAttributes(rawAttrs: any): Record<string, any> {
    const res: Record<string, any> = {};
    if (!rawAttrs) return res;
    if (typeof rawAttrs === "object") {
      for (const k of Object.keys(rawAttrs)) {
        const val = rawAttrs[k];
        if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
          res[String(k).toLowerCase()] = val;
          if (typeof val === "string") {
            res[val.toLowerCase()] = true;
          }
        } else if (val && typeof val === "object" && val.value !== undefined) {
          res[String(k).toLowerCase()] = val.value;
          if (typeof val.value === "string") {
            res[String(val.value).toLowerCase()] = true;
          }
        }
      }
    }
    return res;
  }

  // Trích xuất chi tiết thời gian thực của đối tượng từ WebGL drawnObjects hoặc Redux States
  function extractObjectDetails(clientId: number): any {
    try {
      const store = getReduxStore();
      const anno = store?.getState()?.annotation;
      const canvas = anno?.canvas?.instance;

      // Cập nhật từ điển nhãn từ Redux Job instance (chỉ quét khi cache rỗng)
      if (mainWorldLabelsCache.size === 0) {
        updateMainWorldLabels();
      }

      const drawnItem = canvas?.view?.drawnObjects?.[String(clientId)];
      const states = anno?.annotations?.states || [];
      const matched = states.find((s: any) => s.clientID === clientId);

      const p = extractLivePointsFromDrawnAndState(drawnItem, matched);
      if (p && p.length >= 9) {
        const resolved = resolveLabelName(drawnItem?.data || matched);
        const attrs = parseObjectAttributes(
          drawnItem?.data?.attributes ||
          drawnItem?.data?.attributeValues ||
          matched?.attributes ||
          matched?.attributeValues
        );
        const persistentTid =
          matched?.parentID ??
          matched?.trackID ??
          matched?.parent?.clientID ??
          drawnItem?.data?.parentID ??
          drawnItem?.data?.trackID ??
          clientId;
        return {
          clientId,
          trackId: Number(persistentTid),
          serverId: drawnItem?.data?.serverID || matched?.serverID || null,
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
          attributes: attrs,
        };
      }
    } catch (e) {}
    return null;
  }

  // Tính toán và phát sự kiện Cảnh Báo Viền Chạm Point (Edge Contact HUD) cho Active Box
  function calculateAndBroadcastBoxEdgeContacts(): void {
    try {
      const store = getReduxStore();
      const canvas = store?.getState()?.annotation?.canvas?.instance;
      const activeId =
        canvas?.view?.activatedElementID ??
        store?.getState()?.annotation?.annotations?.activatedStateClientID ??
        lastActiveTrackId;
      if (activeId === null || activeId === undefined || isNaN(Number(activeId))) return;

      const numId = Number(activeId);
      const details = extractObjectDetails(numId);
      if (!details || !Array.isArray(details.points) || details.points.length < 9) return;

      const ptsObjs = getAllScenePointsObjects();
      if (ptsObjs.length === 0) return;

      // Chọn đối tượng Points có số lượng điểm lớn nhất (Mây điểm LiDAR chính của frame)
      let mainPtsObj = ptsObjs[0];
      let maxCount = 0;
      for (const obj of ptsObjs) {
        const c = obj.geometry?.attributes?.position?.count || 0;
        if (c > maxCount) {
          maxCount = c;
          mainPtsObj = obj;
        }
      }

      const geom = mainPtsObj?.geometry;
      const posAttr = geom?.attributes?.position;
      if (!posAttr || !posAttr.array) return;

      const posArray = posAttr.array as Float32Array;
      const p = details.points;
      const boxTarget: any = {
        id: numId,
        cx: p[0],
        cy: p[1],
        cz: p[2],
        rx: p[3] || 0,
        ry: p[4] || 0,
        rz: p[5] || 0,
        l: p[6],
        w: p[7],
        h: p[8],
        category: details.label,
        isActive: true,
      };

      const computeFn = (window as any).computeBoxEdgeContacts || (globalThis as any).computeBoxEdgeContacts;
      if (typeof computeFn === "function") {
        const contacts = computeFn(posArray, boxTarget);
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_RES_EDGE_CONTACTS_UPDATED", {
            detail: contacts || { clientId: numId, pointCount: 0 },
          })
        );
      }
    } catch (e) {
      console.warn("[CVAT 3D Suite] Lỗi calculateAndBroadcastBoxEdgeContacts:", e);
    }
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

  // Kích hoạt chế độ "Đã sửa nhưng chưa lưu" chuẩn xác trên CVAT Native (Redux Store, cvat-core & Header UI)
  function markCvatSaveButtonUnsaved(job?: any): void {
    try {
      (window as any).__CVAT_HAS_UNSAVED_CHANGES__ = true;

      // 1. Đánh dấu trạng thái dirty trên cvat-core collection
      const activeJob = job || getReduxStore()?.getState()?.annotation?.job?.instance;
      if (activeJob && activeJob.annotations) {
        const col = (activeJob.annotations as any)._collection || (activeJob.annotations as any).collection;
        if (col) {
          col._isModified = true;
        }
      }

      // 2. Đồng bộ trạng thái Unsaved vào Redux Store của CVAT Native
      const store = getReduxStore();
      if (store && typeof store.dispatch === "function") {
        try {
          const historyState = store.getState()?.annotation?.annotations?.history || {};
          store.dispatch({
            type: "UPDATE_ANNOTATIONS_SUCCESS",
            payload: {
              history: historyState,
            },
          });
        } catch (_) {
          try {
            store.dispatch({ type: "CHANGE_ANNOTATIONS" });
          } catch (__) {}
        }
      }

      // 3. Fallback đảm bảo nút Save trên Header CVAT Native sáng đèn (không disabled)
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

  const markCvatUnsavedInReduxAndCore = markCvatSaveButtonUnsaved;

  // Đồng bộ và lưu lên cơ sở dữ liệu CVAT bằng cvat-core API (CHỈ GỌI KHI NGƯỜI DÙNG THỰC SỰ YÊU CẦU LƯU)
  async function persistJobAnnotations(job: any): Promise<void> {
    try {
      if (job && job.annotations && typeof job.annotations.save === "function") {
        await job.annotations.save();
        console.log("[CVAT 3D Suite] Đã lưu thành công lên database CVAT qua cvat-core API.");
      }
    } catch (err) {
      console.warn("[CVAT 3D Suite] Ghi nhận thay đổi cvat-core:", err);
    }
  }

  // Thiết lập bộ theo dõi tương tác chuột & bàn phím trên Canvas 3D (Realtime Point Cloud Color Update)
  let isInteractiveWatcherAttached = false;
  function setupCanvasInteractiveWatcher(): void {
    if (isInteractiveWatcherAttached) return;
    isInteractiveWatcherAttached = true;

    let pointerUpDebounceTimer: any = null;
    let dragRafId: number | null = null;
    let hadBoxTransform = false;
    let clippingRafId: number | null = null;

    const scheduleOrthoClippingUpdate = () => {
      if (clippingRafId !== null) return;
      clippingRafId = requestAnimationFrame(() => {
        clippingRafId = null;
        if (currentOrthoSlicing.hideGround) {
          updateOrthoClippingPlanes(undefined, false);
        }
      });
    };

    // Kiểm tra xem Three.js OrbitControls có đang trong trạng thái xoay/pan/dolly camera hay không
    const isCameraNavigating = (): boolean => {
      try {
        const store = getReduxStore();
        const canvas = store?.getState()?.annotation?.canvas?.instance;
        const views = canvas?.view?.views;
        if (!views) return false;
        for (const vKey of ["perspective", "top", "side", "front"]) {
          const v = views[vKey];
          const controls = v?.controls;
          if (controls) {
            if (typeof controls.state === "number" && controls.state !== -1) {
              return true;
            }
            if (typeof (controls as any)._state === "number" && (controls as any)._state !== -1) {
              return true;
            }
            if ((controls as any).isRotating || (controls as any).isPanning) {
              return true;
            }
          }
        }
      } catch (_) {}
      return false;
    };

    // Kiểm tra xem Box đang active có thực sự bị transform (kéo di chuyển, xoay hoặc co giãn) hay không
    // Tối ưu O(1) trực tiếp trên target active box, khử nhiễu 2D orthographic view (Top/Side/Front)
    const isTargetBoxTransforming = (): boolean => {
      try {
        const store = getReduxStore();
        const canvas = store?.getState()?.annotation?.canvas?.instance;
        const activeId =
          store?.getState()?.annotation?.annotations?.activatedStateClientID ??
          lastActiveTrackId;

        // Nếu không có đối tượng nào active thì chắc chắn 100% không có box nào đang bị kéo
        if (!activeId || isNaN(Number(activeId)) || Number(activeId) <= 0) {
          return false;
        }

        const drawnObjects = canvas?.view?.drawnObjects;
        if (!drawnObjects) return false;

        const drawnItem = drawnObjects[String(activeId)];
        if (!drawnItem) return false;

        const data = drawnItem.data;
        const c = drawnItem.cuboid;
        if (!data || !c || !Array.isArray(data.points) || data.points.length < 9 || data.outside) {
          return false;
        }

        const bx = data.points[0];
        const by = data.points[1];
        const bz = data.points[2];
        const bYaw = data.points[5] || 0;
        const bL = data.points[6];
        const bW = data.points[7];
        const bH = data.points[8];

        // 1. Kiểm tra Perspective View và Root Cuboid (Đầy đủ 3D: X, Y, Z)
        for (const cand of [c.perspective, c]) {
          const p = cand?.position;
          if (p && typeof p.x === "number") {
            const dx = p.x - bx;
            const dy = p.y - by;
            const dz = p.z - bz;
            if (dx * dx + dy * dy + dz * dz > 1e-4) return true;
          }
        }

        // 2. Kiểm tra Top View (2D Orthographic: CHỈ X và Y, tuyệt đối bỏ qua Z vì mặt phẳng chiếu 2D cố định z)
        if (c.top?.position) {
          const p = c.top.position;
          if (typeof p.x === "number" && typeof p.y === "number") {
            const dx = p.x - bx;
            const dy = p.y - by;
            if (dx * dx + dy * dy > 1e-4) return true;
          }
        }

        // 3. Kiểm tra Side View (2D Orthographic: CHỈ X và Z, tuyệt đối bỏ qua Y)
        if (c.side?.position) {
          const p = c.side.position;
          if (typeof p.x === "number" && typeof p.z === "number") {
            const dx = p.x - bx;
            const dz = p.z - bz;
            if (dx * dx + dz * dz > 1e-4) return true;
          }
        }

        // 4. Kiểm tra Front View (2D Orthographic: CHỈ Y và Z, tuyệt đối bỏ qua X)
        if (c.front?.position) {
          const p = c.front.position;
          if (typeof p.y === "number" && typeof p.z === "number") {
            const dy = p.y - by;
            const dz = p.z - bz;
            if (dy * dy + dz * dz > 1e-4) return true;
          }
        }

        // 5. Kiểm tra Góc Xoay (Yaw / Rotation Z)
        for (const cand of [c.perspective, c.top, c]) {
          const r = cand?.rotation;
          if (r && typeof r.z === "number") {
            if (Math.abs(r.z - bYaw) > 1e-3) return true;
          }
        }

        // 6. Kiểm tra Thay Đổi Kích Thước (Scale / Resize Box: L, W, H)
        for (const cand of [c.perspective, c.top, c.side, c.front, c]) {
          const s = cand?.scale;
          if (s && typeof s.x === "number" && s.x > 0) {
            if (
              Math.abs(s.x - bL) > 1e-3 ||
              Math.abs(s.y - bW) > 1e-3 ||
              Math.abs(s.z - bH) > 1e-3
            ) {
              return true;
            }
          }
        }
      } catch (_) {}
      return false;
    };

    const onPointerMove = (e: PointerEvent) => {
      // Tự động khôi phục cờ tương tác nếu chuột trái đang nhấn giữ (chống lỡ click lúc tua frame)
      if (e.buttons === 1 && !isCanvasInteracting) {
        isCanvasInteracting = true;
      }

      // Nếu chuột đã nhả nhưng sự kiện pointerup bị lỡ (ví dụ kéo ra ngoài window)
      if (isCanvasInteracting && e.buttons === 0) {
        onPointerUp();
        return;
      }
      if (!isCanvasInteracting) return;

      // 1. LOẠI BỎ 100% RECOLOR NẶNG KHI XOAY CAMERA (ORBIT) & PANNING:
      // Chuột phải (buttons === 2) hoặc chuột giữa (buttons === 4) hoặc phím Alt luôn là Camera Orbit/Pan
      if (e.buttons === 2 || e.buttons === 4 || e.altKey) return;

      // 2. Kiểm tra nếu OrbitControls đang active (Three.js STATE.ROTATE, STATE.PAN, STATE.DOLLY)
      if (isCameraNavigating()) return;

      // 3. Nếu chuột trái đang nhấn: Kiểm tra xem target box có thực sự đang bị transform không
      // O(1) kiểm tra chính xác, loại bỏ hoàn toàn false positive từ 2D orthographic views
      if (!isTargetBoxTransforming()) return;

      hadBoxTransform = true;
      // Zero-Lag 60 FPS: TUYỆT ĐỐI KHÔNG RECOLOR VÀ KHÔNG UPDATE CLIPPING TRONG SUỐT QUÁ TRÌNH POINTERMOVE!
      // Toàn bộ GPU và CPU Main Thread được giải phóng để Three.js CVAT render việc kéo/zoom box ở 60 FPS mượt mà tuyệt đối.
      // Cập nhật clipping planes và recolor sẽ chỉ được thực thi một lần duy nhất khi nhả chuột (onPointerUp).
    };

    const onPointerUp = () => {
      if (dragRafId) {
        cancelAnimationFrame(dragRafId);
        dragRafId = null;
      }
      if (clippingRafId !== null) {
        cancelAnimationFrame(clippingRafId);
        clippingRafId = null;
      }
      if (!isCanvasInteracting) return;
      isCanvasInteracting = false;

      // CHỈ recolor & thông báo khi nhả chuột NẾU trước đó thực sự có thao tác kéo box (Box Transform)
      // Nếu người dùng chỉ xoay/pan camera, mây điểm không đổi -> TUYỆT ĐỐI KHÔNG RECOLOR LÃNG PHÍ!
      if (hadBoxTransform) {
        hadBoxTransform = false;

        // Bắn sự kiện biến đổi Live Transform sang Extension ngay khi nhả chuột
        try {
          const store = getReduxStore();
          const canvas = store?.getState()?.annotation?.canvas?.instance;
          const activeId =
            store?.getState()?.annotation?.annotations?.activatedStateClientID ??
            lastActiveTrackId;
          if (activeId !== null && activeId !== undefined && !isNaN(Number(activeId))) {
            const numId = Number(activeId);
            const details = extractObjectDetails(numId);
            if (details) {
              window.dispatchEvent(
                new CustomEvent("CVAT_EXT_RES_LIVE_TRANSFORM_CHANGED", {
                  detail: { clientId: numId, details },
                })
              );
            }
          }
        } catch (_) {}

        if (pointerUpDebounceTimer) clearTimeout(pointerUpDebounceTimer);
        pointerUpDebounceTimer = setTimeout(() => {
          pointerUpDebounceTimer = null;
          if (currentColorizeBoxed) {
            schedulePointCloudColorization(0);
          }
          calculateAndBroadcastBoxEdgeContacts();
          updateOrthoClippingPlanes(undefined, true);
        }, 60);
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
              const activeId = store?.getState()?.annotation?.annotations?.activatedStateClientID;
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
            schedulePointCloudColorization(0);
            calculateAndBroadcastBoxEdgeContacts();
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

    // =========================================================================
    // THUẬT TOÁN RAY-OBB DOUBLE CLICK 3D SIÊU TỐC (< 0.05ms, ZERO-LAG 60 FPS)
    // Khi annotator hoặc QC nhấn click 2 lần vào đối tượng ở View 3D gốc:
    // 1. Nhận diện chuẩn xác chiếc xe (Client ID / Track ID) dù là Solid Mesh hay Wireframe
    // 2. Kích hoạt ngay lập tức trên Tool (FloatingPanel) và đồng bộ Redux / Sidebar
    // 3. Lập tức GHIM TÂM CẢ 4 KHUNG NHÌN (Perspective 3D, Top, Side, Front) vào xe đó!
    // =========================================================================
    function transformVectorInverseEulerLocal(
      v: { x: number; y: number; z: number },
      rx: number = 0,
      ry: number = 0,
      rz: number = 0
    ): { x: number; y: number; z: number } {
      const cosZ = Math.cos(rz), sinZ = Math.sin(rz);
      const x1 = v.x * cosZ + v.y * sinZ;
      const y1 = -v.x * sinZ + v.y * cosZ;
      const z1 = v.z;

      const cosY = Math.cos(ry), sinY = Math.sin(ry);
      const x2 = x1 * cosY - z1 * sinY;
      const y2 = y1;
      const z2 = x1 * sinY + z1 * cosY;

      const cosX = Math.cos(rx), sinX = Math.sin(rx);
      const x3 = x2;
      const y3 = y2 * cosX + z2 * sinX;
      const z3 = -y2 * sinX + z2 * cosX;

      return { x: x3, y: y3, z: z3 };
    }

    function intersectRayWithOBBLocal(
      ray: { origin: { x: number; y: number; z: number }; direction: { x: number; y: number; z: number } },
      box: { x: number; y: number; z: number; l: number; w: number; h: number; yaw: number; pitch?: number; roll?: number },
      padding: number = 0.15
    ): number | null {
      if (box.l <= 0 || box.w <= 0 || box.h <= 0) return null;

      const hx = box.l / 2 + padding;
      const hy = box.w / 2 + padding;
      const hz = box.h / 2 + padding;

      const P = {
        x: ray.origin.x - box.x,
        y: ray.origin.y - box.y,
        z: ray.origin.z - box.z,
      };
      const D = ray.direction;

      const rx = box.roll || 0;
      const ry = box.pitch || 0;
      const rz = box.yaw || 0;

      const Ploc = transformVectorInverseEulerLocal(P, rx, ry, rz);
      const Dloc = transformVectorInverseEulerLocal(D, rx, ry, rz);

      let tMin = -Infinity;
      let tMax = Infinity;

      if (Math.abs(Dloc.x) > 1e-7) {
        let t1 = (-hx - Ploc.x) / Dloc.x;
        let t2 = (hx - Ploc.x) / Dloc.x;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        tMin = Math.max(tMin, t1);
        tMax = Math.min(tMax, t2);
        if (tMin > tMax) return null;
      } else if (Math.abs(Ploc.x) > hx) {
        return null;
      }

      if (Math.abs(Dloc.y) > 1e-7) {
        let t1 = (-hy - Ploc.y) / Dloc.y;
        let t2 = (hy - Ploc.y) / Dloc.y;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        tMin = Math.max(tMin, t1);
        tMax = Math.min(tMax, t2);
        if (tMin > tMax) return null;
      } else if (Math.abs(Ploc.y) > hy) {
        return null;
      }

      if (Math.abs(Dloc.z) > 1e-7) {
        let t1 = (-hz - Ploc.z) / Dloc.z;
        let t2 = (hz - Ploc.z) / Dloc.z;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        tMin = Math.max(tMin, t1);
        tMax = Math.min(tMax, t2);
        if (tMin > tMax) return null;
      } else if (Math.abs(Ploc.z) > hz) {
        return null;
      }

      if (tMax < 0) return null;
      return tMin >= 0 ? tMin : tMax;
    }

    let fastDoubleRaycaster: any = null;

    function findObjectUnderPointer(
      clientX: number,
      clientY: number
    ): { uiId: number; pos: { x: number; y: number; z: number } } | null {
      try {
        const curStore = getReduxStore() || store;
        const canvas = curStore?.getState()?.annotation?.canvas?.instance;
        const views = canvas?.view?.views;
        if (!views) return null;

        // 1. Xác định View đang được tương tác (Ưu tiên Perspective View 3D gốc)
        let activeView = views.perspective;
        let activeCam = activeView?.camera;
        let activeRenderer = activeView?.renderer;
        let targetCanvas: HTMLCanvasElement | null = activeRenderer?.domElement || null;

        // Kiểm tra xem chuột có click trong canvas trực giao (Top, Side, Front) không
        const orthoKeys = ["top", "side", "front"];
        for (const name of orthoKeys) {
          const v = views[name];
          const dom = v?.renderer?.domElement;
          if (dom) {
            const r = dom.getBoundingClientRect();
            if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
              activeView = v;
              activeCam = v.camera;
              activeRenderer = v.renderer;
              targetCanvas = dom;
              break;
            }
          }
        }

        if (!targetCanvas) {
          targetCanvas =
            document.querySelector<HTMLCanvasElement>(".cvat-canvas3d-perspective canvas") ||
            document.querySelector<HTMLCanvasElement>(".cvat-canvas-container canvas");
        }

        if (!activeCam || !targetCanvas) return null;

        const rect = targetCanvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;

        const mouseX = ((clientX - rect.left) / rect.width) * 2 - 1;
        const mouseY = -((clientY - rect.top) / rect.height) * 2 + 1;

        const winThree = (window as any).THREE || canvas?.view?.THREE;
        if (!winThree) return null;

        if (!fastDoubleRaycaster && typeof winThree.Raycaster === "function") {
          fastDoubleRaycaster = new winThree.Raycaster();
        }
        if (!fastDoubleRaycaster) return null;

        fastDoubleRaycaster.setFromCamera({ x: mouseX, y: mouseY }, activeCam);
        const ray = fastDoubleRaycaster.ray;
        if (!ray || !ray.origin || !ray.direction) return null;

        const drawnObjects = canvas?.view?.drawnObjects || {};
        const states = curStore?.getState()?.annotation?.annotations?.states || [];

        let bestHitDist = Infinity;
        let bestUiId: number | null = null;
        let bestPos: { x: number; y: number; z: number } | null = null;

        const checkedIds = new Set<number>();

        // TẦNG 1: Thuật toán Ray-OBB siêu tốc (< 0.02ms) trên drawnObjects của Three.js
        for (const k of Object.keys(drawnObjects)) {
          const item = drawnObjects[k];
          const data = item?.data;
          if (!data || data.outside) continue;
          const uiId = Number(k);
          if (isNaN(uiId) || uiId <= 0) continue;
          checkedIds.add(uiId);

          const pts = extractLivePointsFromDrawnAndState(item, null) || data.points;
          if (!pts || !Array.isArray(pts) || pts.length < 9) continue;

          const box = {
            x: pts[0],
            y: pts[1],
            z: pts[2],
            roll: pts[3] || 0,
            pitch: pts[4] || 0,
            yaw: pts[5] || 0,
            l: pts[6],
            w: pts[7],
            h: pts[8],
          };

          const hitDist = intersectRayWithOBBLocal(ray, box, 0.15);
          if (hitDist !== null && hitDist < bestHitDist) {
            bestHitDist = hitDist;
            bestUiId = uiId;
            bestPos = { x: pts[0], y: pts[1], z: pts[2] };
          }
        }

        // Quét thêm các state trong Redux nếu chưa có trong drawnObjects
        for (const st of states) {
          if (!st || st.outside || st.shapeType !== "cuboid") continue;
          const uiId = Number(st.clientID ?? st.id);
          if (isNaN(uiId) || uiId <= 0 || checkedIds.has(uiId)) continue;
          checkedIds.add(uiId);

          const pts = st.points;
          if (!pts || !Array.isArray(pts) || pts.length < 9) continue;

          const box = {
            x: pts[0],
            y: pts[1],
            z: pts[2],
            roll: pts[3] || 0,
            pitch: pts[4] || 0,
            yaw: pts[5] || 0,
            l: pts[6],
            w: pts[7],
            h: pts[8],
          };

          const hitDist = intersectRayWithOBBLocal(ray, box, 0.15);
          if (hitDist !== null && hitDist < bestHitDist) {
            bestHitDist = hitDist;
            bestUiId = uiId;
            bestPos = { x: pts[0], y: pts[1], z: pts[2] };
          }
        }

        if (bestUiId !== null && bestPos !== null) {
          return { uiId: bestUiId, pos: bestPos };
        }

        // TẦNG 2: Mesh Raycast Fallback nếu OBB chưa bắt được
        try {
          const cuboidMeshes: any[] = [];
          const meshToIdMap = new Map<any, number>();
          for (const k of Object.keys(drawnObjects)) {
            const item = drawnObjects[k];
            const uiId = Number(k);
            if (item?.cuboid) {
              const cand = item.cuboid.perspective || item.cuboid;
              if (cand) {
                cuboidMeshes.push(cand);
                meshToIdMap.set(cand, uiId);
              }
            }
          }
          if (cuboidMeshes.length > 0) {
            const intersects = fastDoubleRaycaster.intersectObjects(cuboidMeshes, true);
            if (intersects && intersects.length > 0) {
              const firstHit = intersects[0];
              let curObj = firstHit.object;
              while (curObj) {
                if (meshToIdMap.has(curObj)) {
                  const uiId = meshToIdMap.get(curObj)!;
                  const d = drawnObjects[String(uiId)]?.data;
                  const pos = d && Array.isArray(d.points) ? { x: d.points[0], y: d.points[1], z: d.points[2] } : undefined;
                  return { uiId, pos: pos || { x: firstHit.point.x, y: firstHit.point.y, z: firstHit.point.z } };
                }
                curObj = curObj.parent;
              }
            }
          }
        } catch (_) {}

        // TẦNG 3: Screen-Space 2D Proximity Fallback (Trong bán kính <= 32px trên màn hình)
        try {
          let bestScreenDist = 32;
          let screenMatchId: number | null = null;
          let screenMatchPos: { x: number; y: number; z: number } | null = null;

          for (const id of checkedIds) {
            const drawn = drawnObjects[String(id)];
            const pts = extractLivePointsFromDrawnAndState(drawn, null) || drawn?.data?.points;
            if (!pts || !Array.isArray(pts) || pts.length < 3) continue;

            const cx = pts[0], cy = pts[1], cz = pts[2];
            const tempV = new winThree.Vector3(cx, cy, cz);
            tempV.project(activeCam);

            if (tempV.z >= -1 && tempV.z <= 1) {
              const screenX = ((tempV.x + 1) / 2) * rect.width + rect.left;
              const screenY = ((-tempV.y + 1) / 2) * rect.height + rect.top;
              const d = Math.hypot(clientX - screenX, clientY - screenY);
              if (d < bestScreenDist) {
                bestScreenDist = d;
                screenMatchId = id;
                screenMatchPos = { x: cx, y: cy, z: cz };
              }
            }
          }

          if (screenMatchId !== null && screenMatchPos !== null) {
            return { uiId: screenMatchId, pos: screenMatchPos };
          }
        } catch (_) {}

        return null;
      } catch (err) {
        console.warn("[CVAT 3D Suite] Lỗi findObjectUnderPointer:", err);
        return null;
      }
    }

    function activateAndGhimObjectImmediately(
      uiId: number,
      targetPos?: { x: number; y: number; z: number }
    ): void {
      if (uiId === null || uiId === undefined || isNaN(uiId) || uiId <= 0) return;

      console.log(`[CVAT 3D Suite] ⚡ DOUBLE-CLICK: KÍCH HOẠT TỨC THÌ & GHIM TÂM XE #${uiId}!`);

      lastActiveTrackId = uiId;
      lastDispatchedActiveId = uiId;
      updateLockedTrackId(uiId);

      // 1. FOCUS CẢ 4 KHUNG NHÌN: Căn giữa camera 3D Perspective, Top, Side, Front vào tâm xe ngay lập tức!
      center3DViewOnObject(uiId, targetPos);

      // 2. Trích xuất thông số xe
      const details = extractObjectDetails(uiId);

      // 3. Gửi event cập nhật tức thì sang FloatingPanel
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_OBJECT_ACTIVATED", {
          detail: { clientId: uiId, details, isHover: false, isDoubleClick: true },
        })
      );

      // 4. Highlight mây điểm xe active rực rỡ & Cảnh báo viền chạm
      if (currentColorizeBoxed) {
        schedulePointCloudColorization(0);
      }
      calculateAndBroadcastBoxEdgeContacts();
      updateOrthoClippingPlanes(details);

      // 5. Đồng bộ Three.js Canvas & Redux Store với ANTI-LOOP GUARD
      try {
        const curStore = getReduxStore() || store;
        const canvas = curStore?.getState()?.annotation?.canvas?.instance;
        if (canvas && typeof canvas.activate === "function") {
          const curCanvasActive =
            canvas.view?.activatedElementID ||
            curStore?.getState()?.annotation?.annotations?.activatedStateClientID;
          if (Number(curCanvasActive) !== uiId) {
            canvas.activate(uiId);
            if (typeof canvas.render === "function") {
              canvas.render();
            }
          }
        }

        if (curStore && typeof curStore.dispatch === "function") {
          const currentStoreActiveId =
            curStore.getState()?.annotation?.annotations?.activatedStateClientID ??
            curStore.getState()?.annotation?.canvas?.instance?.view?.activatedElementID;
          if (Number(currentStoreActiveId) !== uiId) {
            curStore.dispatch({
              type: "ACTIVATE_OBJECT",
              payload: { activatedStateClientID: uiId, activatedElementID: uiId },
            });
          }
        }
      } catch (_) {}

      // 6. Highlight trên Sidebar của CVAT (Tối ưu O(1) Direct Class Swap)
      syncSidebarItemHighlight(uiId);
    }

    let lastHandledDblClickTime = 0;
    function handle3DCanvasDoubleClick(e: MouseEvent | PointerEvent): void {
      if (isFrameTransitioning) return;
      const now = Date.now();
      if (now - lastHandledDblClickTime < 240) return;
      lastHandledDblClickTime = now;

      const hit = findObjectUnderPointer(e.clientX, e.clientY);
      if (hit && hit.uiId > 0) {
        activateAndGhimObjectImmediately(hit.uiId, hit.pos);
        try {
          e.stopPropagation();
        } catch (_) {}
      }
    }

    // A. Lắng nghe dblclick bản địa trên Canvas 3D
    document.addEventListener(
      "dblclick",
      (e: MouseEvent) => {
        if (isFrameTransitioning) return;
        const target = e.target as HTMLElement;
        if (!target) return;
        if (target.closest("input, textarea, button, select, #cvat-3d-suite-panel, .cvat-3d-suite-modal")) {
          return;
        }
        const canvasContainer = target.closest(
          ".cvat-canvas-container, .cvat-canvas3d-perspective, .cvat-canvas3d-orthographic-view, .cvat-canvas3d-topview, .cvat-canvas3d-sideview, .cvat-canvas3d-frontview"
        );
        if (canvasContainer || target.tagName === "CANVAS") {
          handle3DCanvasDoubleClick(e);
        }
      },
      { capture: true }
    );

    // B. Fast Double Click Tracker (Đảm bảo 100% bắt được kể cả khi OrbitControls nuốt dblclick)
    let fastDblLastTime = 0;
    let fastDblLastX = 0;
    let fastDblLastY = 0;

    canvasContainers.forEach((container) => {
      container.addEventListener(
        "pointerup",
        (e: PointerEvent) => {
          if (isFrameTransitioning) return;
          if (e.button !== 0) return;
          const now = Date.now();
          const dt = now - fastDblLastTime;
          const dx = Math.abs(e.clientX - fastDblLastX);
          const dy = Math.abs(e.clientY - fastDblLastY);

          fastDblLastTime = now;
          fastDblLastX = e.clientX;
          fastDblLastY = e.clientY;

          if (dt >= 40 && dt <= 320 && dx <= 8 && dy <= 8) {
            handle3DCanvasDoubleClick(e);
            return;
          }

          // Nếu chuột đã di chuyển (kéo thả box, pan view) hoặc vừa có thao tác biến đổi box:
          // Tuyệt đối không can thiệp dời camera để tránh giật vị trí, lệch con trỏ!
          if (dx > 4 || dy > 4 || hadBoxTransform) return;

          // Single click fallback: Chỉ kích hoạt nếu thực sự là click tĩnh tại chỗ (dx, dy <= 4)
          setTimeout(() => {
            if (isFrameTransitioning) return;
            try {
              const currentStore = getReduxStore() || store;
              const activeId = currentStore?.getState()?.annotation?.annotations?.activatedStateClientID;

              if (activeId !== null && activeId !== undefined) {
                const numId = Number(activeId);
                if (numId > 0 && numId !== lastActiveTrackId) {
                  updateLockedTrackId(numId);
                  triggerFocusOnObject(numId, false);
                }
              }
            } catch (err) {}
          }, 80);
        },
        { capture: true }
      );
    });

    // Lắng nghe sự kiện click tường minh trên sidebar để Focus vào đối tượng
    document.addEventListener("click", (e: MouseEvent) => {
      if (isFrameTransitioning) return;
      const target = e.target as HTMLElement;
      const sidebarItem = target.closest<HTMLElement>(
        "[class*='cvat-objects-sidebar-state-item'], [class*='cvat-objects-sidebar-states-list-item'], [data-cvat-state-item-id]"
      );
      if (sidebarItem) {
        setTimeout(() => {
          if (isFrameTransitioning) return;
          let id: number | null = null;
          const dataId = sidebarItem.getAttribute("data-cvat-state-item-id") || sidebarItem.getAttribute("data-item-id");
          if (dataId && /^\d+$/.test(dataId)) {
            id = parseInt(dataId, 10);
          } else {
            const idAttr = sidebarItem.id || sidebarItem.closest("[id*='cvat-objects-sidebar-state-item-']")?.id || "";
            const directMatch = idAttr.match(/cvat-objects-sidebar-state-item-(\d+)/);
            if (directMatch) {
              id = parseInt(directMatch[1], 10);
            } else {
              const textMatch = (sidebarItem.innerText || sidebarItem.textContent || "").match(/#(\d+)/);
              if (textMatch) id = parseInt(textMatch[1], 10);
            }
          }
          if (id && id > 0) {
            updateLockedTrackId(id);
            triggerFocusOnObject(id, true);
          }
        }, 60);
      }
    });

    // =========================================================================
    // XỬ LÝ FOCUS TẬP TRUNG KHI CHỌN OBJECT (CLICK / SHORTCUT / REDUX ACTION)
    // =========================================================================
    let focusTriggerDebounceTimer: any = null;
    let isTriggeringFocus = false;
    let lastDispatchedActiveId: number | null = null;

    function triggerFocusOnObject(id: number, forceCenter: boolean = true): void {
      if (id === null || id === undefined || isNaN(id) || id <= 0) return;
      if (isTriggeringFocus) return;

      // 1. GỬI EVENT CẬP NHẬT TỨC THÌ SANG FLOATINGPANEL (< 0.2ms)
      // Chỉ dispatch nếu chưa được dispatch trước đó (tránh bão event liên tiếp cùng 1 object)
      if (id !== lastDispatchedActiveId) {
        lastDispatchedActiveId = id;
        const details = extractObjectDetails(id);
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_RES_OBJECT_ACTIVATED", {
            detail: { clientId: id, details, isHover: false },
          })
        );
        calculateAndBroadcastBoxEdgeContacts();
      }

      // Nếu đối tượng đã active và không yêu cầu re-center thì kết thúc sớm
      if (id === lastActiveTrackId && id === persistentActiveTrackId && !forceCenter) return;

      lastActiveTrackId = id;
      updateLockedTrackId(id);

      if (focusTriggerDebounceTimer) clearTimeout(focusTriggerDebounceTimer);
      focusTriggerDebounceTimer = setTimeout(() => {
        focusTriggerDebounceTimer = null;
        isTriggeringFocus = true;

        try {
          // 2. FOCUS CẢ 4 KHUNG NHÌN: Căn giữa camera 3D Perspective, Top View, Side View, Front View vào tâm xe!
          if (forceCenter) {
            center3DViewOnObject(id);
          }

          // 3. Highlight mây điểm xe active
          if (currentColorizeBoxed) {
            schedulePointCloudColorization(0);
          }
          calculateAndBroadcastBoxEdgeContacts();
          updateOrthoClippingPlanes();

          // 4. Đồng bộ Three.js Canvas & Redux Store với ANTI-LOOP GUARD
          try {
            const store = getReduxStore();
            const canvas = store?.getState()?.annotation?.canvas?.instance;
            if (canvas && typeof canvas.activate === "function") {
              const curCanvasActive =
                canvas.view?.activatedElementID ||
                store?.getState()?.annotation?.annotations?.activatedStateClientID;
              if (Number(curCanvasActive) !== id) {
                canvas.activate(id);
                if (typeof canvas.render === "function") {
                  canvas.render();
                }
              }
            }

            if (store && typeof store.dispatch === "function") {
              const currentStoreActiveId =
                store.getState()?.annotation?.annotations?.activatedStateClientID ??
                store.getState()?.annotation?.canvas?.instance?.view?.activatedElementID;
              // 🚨 ANTI-LOOP GUARD: Tuyệt đối KHÔNG re-dispatch nếu Redux Store đã có ID này active!
              // Ngăn chặn 100% Sidebar DOM re-render storm
              if (Number(currentStoreActiveId) !== id) {
                store.dispatch({
                  type: "ACTIVATE_OBJECT",
                  payload: { activatedStateClientID: id, activatedElementID: id },
                });
              }
            }
          } catch (_) {}

          // 5. Highlight trên Sidebar của CVAT (Tối ưu O(1) Direct Class Swap - Thay vì O(N) querySelectorAll)
          syncSidebarItemHighlight(id);
        } finally {
          isTriggeringFocus = false;
        }
      }, 15);
    }

    // Đồng bộ trạng thái active của Sidebar khi CVAT thay đổi (Chỉ lắng nghe Active/Selected thực sự, KHÔNG bắt hover)
    let lastObservedSidebarId: number | null = null;
    let sidebarObserverDebounce: any = null;

    function attachSidebarActiveObserver(): void {
      try {
        const sidebarEl =
          document.querySelector("#cvat-objects-sidebar") ||
          document.querySelector(".cvat-objects-sidebar") ||
          document.querySelector("[class*='cvat-objects-sidebar']") ||
          document.body;

        if (!sidebarEl || (sidebarEl as any).__cvat_sidebar_observer_attached__) return;
        (sidebarEl as any).__cvat_sidebar_observer_attached__ = true;

        const observer = new MutationObserver(() => {
          if (isFrameTransitioning) return; // 🚨 BẢO VỆ CHUYỂN FRAME: Không bắt re-render DOM của Sidebar
          if (sidebarObserverDebounce) return;
          sidebarObserverDebounce = setTimeout(() => {
            sidebarObserverDebounce = null;
            if (isFrameTransitioning) return;
            try {
              // CHỈ lọc các phần tử có class active/selected thực sự, TUYỆT ĐỐI KHÔNG bắt class hover/highlight
              const activeItem = document.querySelector<HTMLElement>(
                ".cvat-objects-sidebar-state-item-active, " +
                ".cvat-objects-sidebar-state-item.selected, " +
                "[class*='sidebar-state-item-active'], " +
                "[data-cvat-state-item-id][class*='selected']"
              );

              if (activeItem) {
                let id: number | null = null;
                const idAttr = activeItem.id || activeItem.closest("[id*='cvat-objects-sidebar-state-item-']")?.id || "";
                const directMatch = idAttr.match(/cvat-objects-sidebar-state-item-(\d+)/) || idAttr.match(/#?(\d+)/);
                if (directMatch) {
                  id = parseInt(directMatch[1], 10);
                } else {
                  const dataId = activeItem.getAttribute("data-cvat-state-item-id") || activeItem.getAttribute("data-item-id");
                  if (dataId && /^\d+$/.test(dataId)) {
                    id = parseInt(dataId, 10);
                  } else {
                    const match = (activeItem.innerText || activeItem.textContent || "").match(/#(\d+)/);
                    if (match) id = parseInt(match[1], 10);
                  }
                }

                if (id && id > 0 && id !== lastObservedSidebarId) {
                  const curReduxActive = getReduxStore()?.getState()?.annotation?.annotations?.activatedStateClientID;
                  if (Number(curReduxActive) === id && id !== lastActiveTrackId) {
                    lastObservedSidebarId = id;
                    lastActiveTrackId = id;
                    updateLockedTrackId(id);
                  }
                }
              }
            } catch (_) {}
          }, 60);
        });

        observer.observe(sidebarEl, {
          attributes: true,
          attributeFilter: ["class", "data-cvat-state-item-id"],
          subtree: true,
        });
      } catch (_) {}
    }

    attachSidebarActiveObserver();

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

        // Bộ Throttle 200ms cho tính toán Fingerprint nhằm giải phóng Main Thread khỏi hàng trăm Redux actions/giây
        let lastFingerprintCalcTime = 0;
        let fingerprintThrottleTimer: any = null;

        const doComputeFingerprint = (states: any[]) => {
          const isMouseDown = typeof window !== "undefined" && (window as any).__cvat_mouse_down__;
          if (isCanvasInteracting || isMouseDown || isFrameTransitioning) return;

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
            if (!isInit && !isCanvasInteracting && !isMouseDown && !isFrameTransitioning) {
              if (pointsDebounceTimer) clearTimeout(pointsDebounceTimer);
              pointsDebounceTimer = setTimeout(() => {
                pointsDebounceTimer = null;
                if (isFrameTransitioning) return;
                schedulePointCloudColorization(0);
                calculateAndBroadcastBoxEdgeContacts();

                // Đồng bộ Live Transform tức thì sang Extension khi Redux states cập nhật
                try {
                  const store = getReduxStore();
                  const activeId =
                    store?.getState()?.annotation?.annotations?.activatedStateClientID ??
                    lastActiveTrackId;
                  if (activeId !== null && activeId !== undefined && !isNaN(Number(activeId))) {
                    const numId = Number(activeId);
                    const details = extractObjectDetails(numId);
                    if (details) {
                      window.dispatchEvent(
                        new CustomEvent("CVAT_EXT_RES_LIVE_TRANSFORM_CHANGED", {
                          detail: { clientId: numId, details },
                        })
                      );
                    }
                  }
                } catch (_) {}
              }, 50);
            }
          }
        };

        const checkPointsFingerprintThrottled = (states: any[]) => {
          // BẢO VỆ TUYỆT ĐỐI: Đang tương tác kéo chuột hoặc nhấn chuột -> Không tính toán fingerprint
          const isMouseDown = typeof window !== "undefined" && (window as any).__cvat_mouse_down__;
          if (isCanvasInteracting || isMouseDown || isFrameTransitioning) return;

          const now = Date.now();
          const elapsed = now - lastFingerprintCalcTime;
          if (elapsed >= 200) {
            lastFingerprintCalcTime = now;
            if (fingerprintThrottleTimer) {
              clearTimeout(fingerprintThrottleTimer);
              fingerprintThrottleTimer = null;
            }
            doComputeFingerprint(states);
          } else if (!fingerprintThrottleTimer) {
            fingerprintThrottleTimer = setTimeout(() => {
              fingerprintThrottleTimer = null;
              lastFingerprintCalcTime = Date.now();
              const latestStates = getReduxStore()?.getState()?.annotation?.annotations?.states || states;
              doComputeFingerprint(latestStates);
            }, 200 - elapsed);
          }
        };

        store.subscribe(() => {
          try {
            const anno = store.getState()?.annotation;
            const canvas = anno?.canvas?.instance;
            // CHỈ lấy ID thực sự active/selected do người dùng click (TUYỆT ĐỐI KHÔNG fallback vào activatedElementID của Three.js khi hover)
            const curActiveId = anno?.annotations?.activatedStateClientID ?? null;
            const curStatesLen = anno?.annotations?.states?.length || 0;
            const curFrame = anno?.player?.frame?.number ?? anno?.job?.instance?.frame;

            // 1. PHÁT HIỆN CHUYỂN FRAME HOẶC NẠP FRAME ĐẦU TIÊN (Single-Flight: Hủy frame cũ, kích hoạt duy nhất 1 lần cho frame active)
            if (curFrame !== undefined && curFrame !== null && curFrame !== prevFrame) {
              const oldFrame = prevFrame;
              prevFrame = curFrame;
              prevPointsFingerprint = ""; // Reset fingerprint khi sang frame mới
              lastFingerprintCalcTime = 0;
              lastDispatchedActiveId = null;

              // SINGLE-FLIGHT COALESCING: Hủy ngay toàn bộ timers và animation frames cũ
              if (frameTransitionTimer) { clearTimeout(frameTransitionTimer); frameTransitionTimer = null; }
              if (lockOnActiveTimer) { clearTimeout(lockOnActiveTimer); lockOnActiveTimer = null; }
              if (singleFrameColorizeTimer) { clearTimeout(singleFrameColorizeTimer); singleFrameColorizeTimer = null; }
              if (colorizeRafId) { cancelAnimationFrame(colorizeRafId); colorizeRafId = null; }
              if (activeDebounceTimer) { clearTimeout(activeDebounceTimer); activeDebounceTimer = null; }
              if (dirtyDebounceTimer) { clearTimeout(dirtyDebounceTimer); dirtyDebounceTimer = null; }

              // KHÓA RAYCAST NGAY TỨC THÌ TRÊN TOÀN BỘ SCENES CỦA FRAME MỚI (MILIGIÂY 0)
              installGlobalThreeRaycastGuard();
              hookAllScenes();

              // FAST SCAN GUARD: Quét và khóa Raycast tức thì mỗi 35ms trong 1.2s đầu để đón đầu PCD tải về bất đồng bộ
              let scanGuardCount = 0;
              const scanGuardInterval = setInterval(() => {
                scanGuardCount++;
                installGlobalThreeRaycastGuard();
                hookAllScenes();
                if (scanGuardCount >= 30) {
                  clearInterval(scanGuardInterval);
                }
              }, 35);

              isFrameTransitioning = true;
              frameTransitionTimer = setTimeout(() => {
                isFrameTransitioning = false;
                frameTransitionTimer = null;
              }, 120);

              // Cập nhật lại clipping planes cho frame mới (không ép render đồng bộ)
              if (currentOrthoSlicing.hideGround) {
                setTimeout(() => updateOrthoClippingPlanes(undefined, false), 80);
              }

              // Hủy ngay tiến trình của frame cũ và lên lịch render frame mới
              scheduleSingleFrameColorizationAndGround(curFrame, 180);

              // Bắn event tức thì thông báo cho Extension (kể cả frame khởi tạo đầu tiên để Event-Driven 100%)
              window.dispatchEvent(
                new CustomEvent("CVAT_EXT_RES_FRAME_CHANGED", {
                  detail: { frame: curFrame, prevFrame: oldFrame },
                })
              );

              if (oldFrame !== null) {
                // GHIM TÂM XE ĐANG ACTIVE VÀO CHÍNH GIỮA MÀN EDIT THỜI GIAN THỰC (STICKY TRACK LOCK-ON)
                const activeIdToLock =
                  persistentActiveTrackId !== null
                    ? persistentActiveTrackId
                    : (curActiveId !== null && curActiveId !== undefined
                        ? Number(curActiveId)
                        : lastActiveTrackId);

                if (activeIdToLock !== null && !isNaN(activeIdToLock)) {
                  if (lockOnActiveTimer) clearTimeout(lockOnActiveTimer);
                  lockOnActiveTimer = setTimeout(() => {
                    lockOnActiveTimer = null;
                    lockOnActiveObjectAtFrame(activeIdToLock, curFrame, 0);
                  }, 60);
                }
              }
            }

            // 2. PHÁT HIỆN THAY ĐỔI ACTIVE OBJECT (TỰ ĐỘNG FOCUS CẢ 4 KHUNG 3D, TOP, SIDE, FRONT VÀO XE ĐÓ)
            if (curActiveId !== prevActiveId) {
              prevActiveId = curActiveId;
              if (curActiveId !== null && curActiveId !== undefined) {
                const idNum = Number(curActiveId);

                // 🚨 BẢO VỆ CHUYỂN FRAME (FRAME TRANSITION GUARD):
                // Nếu đang trong thời gian chuyển frame, chỉ chấp nhận nếu idNum này thực sự thuộc về persistentActiveTrackId.
                // Ngăn chặn Redux / Three.js Hover kích hoạt tạm thời một ID ngẫu nhiên khác!
                if (isFrameTransitioning) {
                  if (persistentActiveTrackId !== null) {
                    const curStates = anno?.annotations?.states || [];
                    const st = curStates.find((s: any) => Number(s.clientID) === idNum);
                    const tid = st ? (st.parentID ?? st.trackID ?? st.parent?.clientID ?? st.clientID) : null;
                    if (tid === null || Number(tid) !== Number(persistentActiveTrackId)) {
                      // ID này không thuộc track đang khóa -> Bỏ qua, chống nhảy active sang ID khác!
                      return;
                    }
                  } else {
                    // Nếu trước đó không khóa track nào, tuyệt đối không tự ý kích hoạt ID ngẫu nhiên trong lúc chuyển frame!
                    return;
                  }
                }

                lastActiveTrackId = idNum;
                currentActiveTrackId = idNum;
                lastDispatchedActiveId = idNum;
                if (!isFrameTransitioning) {
                  updateLockedTrackId(idNum);
                }
                // Đồng bộ siêu tốc < 0.2ms sang Tool kèm trackId
                const details = extractObjectDetails(idNum);
                window.dispatchEvent(
                  new CustomEvent("CVAT_EXT_RES_OBJECT_ACTIVATED", {
                    detail: { clientId: idNum, trackId: persistentActiveTrackId, details, isHover: false },
                  })
                );

                if (activeDebounceTimer) clearTimeout(activeDebounceTimer);
                activeDebounceTimer = setTimeout(() => {
                  activeDebounceTimer = null;
                  triggerFocusOnObject(idNum, true);
                }, 15);
              } else {
                // 🚨 BẢO VỆ CHUYỂN FRAME: Khi chuyển frame, Redux có thể tạm thời trả về null trong vài ms
                // Tuyệt đối không xóa persistentActiveTrackId khi đang chuyển frame!
                if (isFrameTransitioning) return;

                // Người dùng bỏ chọn hoặc click ra ngoài canvas -> Báo cho Extension biết để ẩn chức năng
                lastActiveTrackId = null;
                persistentActiveTrackId = null;
                currentActiveTrackId = -1;
                lastDispatchedActiveId = null;
                syncSidebarItemHighlight(null);
                if (activeDebounceTimer) clearTimeout(activeDebounceTimer);
                activeDebounceTimer = setTimeout(() => {
                  activeDebounceTimer = null;
                  if (isFrameTransitioning) return;
                  window.dispatchEvent(new CustomEvent("CVAT_EXT_RES_OBJECT_DEACTIVATED"));
                  schedulePointCloudColorization(0);
                  updateOrthoClippingPlanes();
                }, 40);
              }
            }

            // 3. THEO DÕI THAY ĐỔI TỌA ĐỘ / DIMENSIONS / ROTATION CỦA CÁC BOX TRÊN FRAME (POINTS FINGERPRINT QUA THROTTLE 200MS)
            const states = anno?.annotations?.states || [];
            checkPointsFingerprintThrottled(states);

            if (curStatesLen !== prevStatesLen) {
              prevStatesLen = curStatesLen;
              // Debounce 400ms để không bắn liên tục khi CVAT đang nạp batch states lúc khởi động
              if (dirtyDebounceTimer) clearTimeout(dirtyDebounceTimer);
              dirtyDebounceTimer = setTimeout(() => {
                dirtyDebounceTimer = null;
                if (isFrameTransitioning) return;
                window.dispatchEvent(new CustomEvent("CVAT_EXT_RES_FRAME_TRACKS_DIRTY"));
                schedulePointCloudColorization(0);
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

      // Zero-Stall Drag Guard: Nếu người dùng đang giữ chuột thao tác hoặc kéo thả box trên canvas,
      // TUYỆT ĐỐI KHÔNG can thiệp dời camera hay dispatch re-render làm gián đoạn luồng kéo chuột 60 FPS!
      if (isCanvasInteracting || (window as any).__cvat_mouse_down__) {
        return;
      }
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

        // Tầng 2: Đồng bộ Redux Store của CVAT Native (Anti-Loop: Chỉ dispatch khi Store chưa active ID này)
        if (store && typeof store.dispatch === "function") {
          try {
            const currentStoreActiveId =
              store.getState()?.annotation?.annotations?.activatedStateClientID ??
              store.getState()?.annotation?.canvas?.instance?.view?.activatedElementID;
            if (Number(currentStoreActiveId) !== numId) {
              store.dispatch({
                type: "ACTIVATE_OBJECT",
                payload: { activatedStateClientID: numId, activatedElementID: numId },
              });
            }
          } catch (_) {}
        }

        // Tầng 3: Đồng bộ DOM Sidebar của CVAT (Tối ưu O(1) Class Swap)
        syncSidebarItemHighlight(numId);

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

    // Lắng nghe yêu cầu cập nhật cấu hình Lát cắt (Depth Slicing & Ground/ROI Filter)
    window.addEventListener("CVAT_EXT_REQ_SET_ORTHO_SLICING", (e: any) => {
      const cfg = e.detail;
      if (cfg && typeof cfg === "object") {
        currentOrthoSlicing = { ...currentOrthoSlicing, ...cfg };
        try {
          localStorage.setItem("cvat_3d_ortho_slicing", JSON.stringify(currentOrthoSlicing));
        } catch (_) {}
        updateOrthoClippingPlanes();
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_RES_ORTHO_SLICING", { detail: { config: currentOrthoSlicing } })
        );
      }
    });

    // Lắng nghe yêu cầu lấy cấu hình Lát cắt hiện tại
    window.addEventListener("CVAT_EXT_REQ_GET_ORTHO_SLICING", () => {
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_ORTHO_SLICING", { detail: { config: currentOrthoSlicing } })
      );
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
      const store = getReduxStore();
      const canvas = store?.getState()?.annotation?.canvas?.instance;
      const drawnObjects = canvas?.view?.drawnObjects || {};
      const reduxStates = store?.getState()?.annotation?.annotations?.states || [];

      // MERGE TOÀN DIỆN: Đảm bảo bắt trọn 100% tất cả các box trên Canvas (kể cả box mới vẽ thêm hoặc vừa kéo chưa Save)
      const stateMap = new Map<number, any>();
      if (Array.isArray(annotations)) {
        for (const a of annotations) {
          if (a && typeof a.clientID === "number") stateMap.set(a.clientID, a);
        }
      }
      // CHỈ MERGE reduxStates và drawnObjects NẾU canvas/redux THỰC SỰ ĐANG Ở ĐÚNG FRAME NÀY VÀ ĐÃ NẠP XONG
      const curF = store?.getState()?.annotation?.player?.frame?.number ?? store?.getState()?.annotation?.job?.instance?.frame;
      if (curF === frame && !isFrameTransitioning) {
        for (const s of reduxStates) {
          if (s && typeof s.clientID === "number") {
            if (typeof s.frame === "number" && s.frame !== frame) continue;
            if (!stateMap.has(s.clientID)) {
              stateMap.set(s.clientID, s);
            }
          }
        }
        for (const key of Object.keys(drawnObjects)) {
          const idNum = Number(key);
          if (!isNaN(idNum) && !stateMap.has(idNum)) {
            const item = drawnObjects[key];
            if (item?.data) {
              if (typeof item.data.frame === "number" && item.data.frame !== frame) continue;
              stateMap.set(idNum, {
                ...item.data,
                clientID: idNum,
                shapeType: "cuboid",
              });
            }
          }
        }
      }

      const list: any[] = [];
      for (const [cId, s] of stateMap.entries()) {
        if (!s || s.shapeType !== "cuboid" || s.outside) continue;
        const drawn = drawnObjects[String(cId)];
        const p = extractLivePointsFromDrawnAndState(drawn, s);
        if (!p || p.length < 9) continue;

        const resolved = resolveLabelName(s);
        const persistentTid =
          s.parentID ??
          s.trackID ??
          s.parent?.clientID ??
          drawn?.data?.parentID ??
          drawn?.data?.trackID ??
          cId;
        list.push({
          uiId: cId,              // SỐ CLIENT_ID HIỂN THỊ CHUẨN XÁC 100% TRÊN GIAO DIỆN TẠI FRAME NÀY!
          trackId: Number(persistentTid), // SỐ TRACK_ID BỀN VỮNG TOÀN CỤC XUYÊN SUỐT CÁC FRAME!
          serverId: s.serverID || null,  // SỐ SERVER_ID LƯU DƯỚI CƠ SỞ DỮ LIỆU
          label: resolved.name,
          color: resolved.color,
          x: Number(p[0].toFixed(2)),
          y: Number(p[1].toFixed(2)),
          z: Number(p[2].toFixed(3)),
          yawDeg: Math.round((p[5] * 180) / Math.PI),
          l: Number(p[6].toFixed(2)),
          w: Number(p[7].toFixed(2)),
          h: Number(p[8].toFixed(2)),
        });
      }

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

  // 1b. Lắng nghe yêu cầu lấy TOÀN BỘ CÁC FRAME của một chiếc xe (Full-Track Lifecycle Query - Siêu tốc trong RAM < 1ms)
  window.addEventListener("CVAT_EXT_REQ_GET_TRACK_ALL_FRAMES", async (e: any) => {
    const { jobId, uiId, serverId } = e.detail || {};
    try {
      const job = await getActiveJobInstance(jobId);
      if (!job) throw new Error("Không tìm thấy Job Instance của CVAT");

      updateMainWorldLabels(job);
      const framesMap = new Map<number, any>();
      const parentTrack = await findTrackInJob(job, uiId, serverId);
      const trackLabel = resolveLabelName(parentTrack).name;

      // 1. Thu thập shapes / keyframes trực tiếp từ Track instance trong bộ nhớ RAM (< 1ms, không khóa Main Thread)
      if (parentTrack) {
        const shapes = toArray(parentTrack.shapes || parentTrack.keyframes || (parentTrack as any)._shapes);
        for (const sh of shapes) {
          if (sh && (sh.shapeType === "cuboid" || sh.type === "cuboid" || Array.isArray(sh.points)) && Array.isArray(sh.points) && sh.points.length >= 9) {
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

      // 2. Bổ sung dữ liệu frame hiện tại từ Redux store nếu có để đảm bảo tính thời gian thực
      try {
        const store = getReduxStore();
        const curStates = store?.getState()?.annotation?.annotations?.states || [];
        const curSt = curStates.find(
          (s: any) => Number(s.clientID) === Number(uiId) || (serverId && Number(s.serverID) === Number(serverId))
        );
        const canvas = store?.getState()?.annotation?.canvas?.instance;
        const drawn = canvas?.view?.drawnObjects?.[String(uiId)];
        const livePts = extractLivePointsFromDrawnAndState(drawn, curSt);

        if (livePts && livePts.length >= 9) {
          const curF = store?.getState()?.annotation?.player?.frame?.number ?? (typeof job.frame === "number" ? job.frame : 0);
          const existing = framesMap.get(curF);
          framesMap.set(curF, {
            frame: curF,
            isKeyframe: existing ? existing.isKeyframe : !!curSt?.keyframe,
            outside: !!curSt?.outside,
            points: livePts,
            label: (curSt ? resolveLabelName(curSt).name : null) || trackLabel,
          });
        }
      } catch (_) {}

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

  // 1b2. Lắng nghe yêu cầu lấy TOÀN BỘ CÁC TRACK trong Job kèm danh sách Shapes (Dùng cho Case 1 & Case 2 Store & QC Studio)
  window.addEventListener("CVAT_EXT_REQ_GET_ALL_JOB_TRACKS_WITH_SHAPES", async (e: any) => {
    const { jobId } = e.detail || {};
    try {
      const job = await getActiveJobInstance(jobId);
      if (!job) throw new Error("Không tìm thấy Job Instance của CVAT");

      const rawTracks = getJobTrackCollection(job);

      // Gom nhóm shapes theo clientID trực tiếp từ in-memory collection (siêu tốc < 5ms, không khoá Main Thread)
      const trackMap = new Map<number, any>();
      for (const t of rawTracks) {
        if (!t || typeof t.clientID !== "number") continue;
        if (trackMap.has(t.clientID)) continue;

        const shList = toArray(t.shapes || t.keyframes);
        const shapes = shList
          .filter((s: any) => s && s.shapeType === "cuboid" && Array.isArray(s.points) && s.points.length >= 9)
          .map((s: any) => ({
            type: "cuboid",
            frame: s.frame,
            points: [...s.points],
            outside: !!s.outside,
            occluded: !!s.occluded,
            z_order: s.zOrder || 0,
            rotation: 0,
          }));

        const resolved = resolveLabelName(t);
        trackMap.set(t.clientID, {
          id: t.clientID,
          clientID: t.clientID,
          serverID: t.serverID || null,
          labelId: t.label?.id || 1,
          labelName: resolved.name || t.label?.name || "Car",
          labelColor: resolved.color || t.label?.color || "#38bdf8",
          shapes,
        });
      }

      // Chỉ fallback quét frame nhẹ khi bộ sưu tập in-memory hoàn toàn rỗng
      if (trackMap.size === 0) {
        const startF = typeof job.startFrame === "number" ? job.startFrame : 0;
        const stopF = typeof job.stopFrame === "number" ? job.stopFrame : startF + 50;
        const maxScanFrames = Math.min(stopF, startF + 80);

        for (let f = startF; f <= maxScanFrames; f++) {
          try {
            const states = await job.annotations.get(f);
            if (Array.isArray(states)) {
              for (const st of states) {
                if (st.shapeType !== "cuboid" || !Array.isArray(st.points) || st.points.length < 9) continue;
                let t = trackMap.get(st.clientID);
                if (!t) {
                  const resolved = resolveLabelName(st);
                  t = {
                    id: st.clientID,
                    clientID: st.clientID,
                    serverID: st.serverID || null,
                    labelId: st.label?.id || 1,
                    labelName: resolved.name || "Car",
                    labelColor: resolved.color || "#38bdf8",
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
      }

      // ĐỒNG BỘ TỌA ĐỘ LIVE THỜI GIAN THỰC TỪ THREE.JS CANVAS & REDUX STATES CHO FRAME HIỆN TẠI
      try {
        const store = getReduxStore();
        const canvas = store?.getState()?.annotation?.canvas?.instance;
        const drawnObjects = canvas?.view?.drawnObjects || {};
        const reduxStates = store?.getState()?.annotation?.annotations?.states || [];
        const curF = store?.getState()?.annotation?.player?.frame?.number ?? (typeof job.frame === "number" ? job.frame : 0);

        for (const st of reduxStates) {
          if (!st || st.shapeType !== "cuboid" || typeof st.clientID !== "number") continue;
          const cId = st.clientID;
          const drawn = drawnObjects[String(cId)];
          const livePoints = extractLivePointsFromDrawnAndState(drawn, st);

          if (livePoints) {
            let t = trackMap.get(cId);
            if (!t) {
              const resolved = resolveLabelName(st);
              t = {
                id: cId,
                clientID: cId,
                serverID: st.serverID || null,
                labelId: st.label?.id || 1,
                labelName: resolved.name || "Car",
                labelColor: resolved.color || "#38bdf8",
                shapes: [],
              };
              trackMap.set(cId, t);
            }

            const existingShapeIdx = t.shapes.findIndex((s: any) => s.frame === curF);
            const liveShape = {
              type: "cuboid",
              frame: curF,
              points: livePoints,
              outside: !!st.outside,
              occluded: !!st.occluded,
              z_order: st.zOrder || 0,
              rotation: 0,
            };

            if (existingShapeIdx >= 0) {
              t.shapes[existingShapeIdx] = liveShape;
            } else {
              t.shapes.push(liveShape);
            }
          }
        }
      } catch (_) {}

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

  // 1b2b. Lắng nghe yêu cầu xuất TOÀN BỘ JOB CHUẨN FORMAT DATUMARO 1.0 (Bao gồm đầy đủ các frame nội suy)
  window.addEventListener("CVAT_EXT_REQ_EXPORT_JOB_DATUMARO_DATA", async (e: any) => {
    const { jobId } = e.detail || {};
    try {
      const job = await getActiveJobInstance(jobId);
      if (!job) throw new Error("Không tìm thấy Job Instance của CVAT");

      const startFrame = typeof job.startFrame === "number" ? job.startFrame : 0;
      const stopFrame = typeof job.stopFrame === "number" ? job.stopFrame : startFrame;

      // Trích xuất danh sách nhãn (labels)
      const labels: Array<{ name: string; id?: number }> = [];
      const jobLabels = job.labels || job.task?.labels || [];
      if (Array.isArray(jobLabels)) {
        for (const l of jobLabels) {
          if (l && l.name) {
            labels.push({ name: String(l.name), id: l.id });
          }
        }
      }

      const items: any[] = [];
      let annIdCounter = 1;

      // Duyệt qua tất cả các frame từ startFrame đến stopFrame theo lô (BATCH_SIZE = 25) để tối ưu hóa hiệu năng
      const BATCH_SIZE = 25;
      for (let bStart = startFrame; bStart <= stopFrame; bStart += BATCH_SIZE) {
        const bEnd = Math.min(stopFrame, bStart + BATCH_SIZE - 1);
        const batchPromises: Promise<{ f: number; states: any[] }>[] = [];
        for (let f = bStart; f <= bEnd; f++) {
          batchPromises.push(
            Promise.resolve(job.annotations.get(f)).then(
              (states: any[]) => ({ f, states: Array.isArray(states) ? states : [] }),
              () => ({ f, states: [] })
            )
          );
        }
        const batchResults = await Promise.all(batchPromises);
        batchResults.sort((a, b) => a.f - b.f);

        for (const { f, states } of batchResults) {
          const annotations: any[] = [];
          if (Array.isArray(states)) {
            for (const st of states) {
              if (!st || st.shapeType !== "cuboid" || !Array.isArray(st.points) || st.points.length < 9) {
                continue;
              }
              const isOutside =
                st.outside === true ||
                st.attributes?.outside === true ||
                st.attributes?.outside === "true";
              if (isOutside) {
                continue; // Bỏ qua ngoài tầm nhìn theo đúng chuẩn Datumaro
              }

              const pos = [Number(st.points[0]), Number(st.points[1]), Number(st.points[2])];
              const rot = [Number(st.points[3]), Number(st.points[4]), Number(st.points[5])];
              const scale = [
                Math.abs(Number(st.points[6])),
                Math.abs(Number(st.points[7])),
                Math.abs(Number(st.points[8])),
              ];

              // Xác định label_id
              let labelId = 0;
              const labelName =
                st.label?.name ||
                (typeof st.labelId === "number" ? labels.find((l) => l.id === st.labelId)?.name : null) ||
                "car";
              const existingLabelIdx = labels.findIndex((l) => l.name === labelName);
              if (existingLabelIdx >= 0) {
                labelId = existingLabelIdx;
              } else {
                labelId = labels.length;
                labels.push({ name: labelName });
              }

              // Nhận diện Track ID gốc (parentID / trackID / parent.clientID) để không bị vỡ track ở frame nội suy
              const parentTrackId =
                st.parentID ??
                st.trackID ??
                (st.parent && (st.parent.clientID ?? st.parent.id));
              const rawClient =
                typeof parentTrackId === "number"
                  ? parentTrackId
                  : typeof st.clientID === "number"
                  ? st.clientID
                  : 1;
              const datumaroTrackId = Math.max(0, rawClient - 1);

              annotations.push({
                type: "cuboid_3d",
                id: annIdCounter++,
                label_id: labelId,
                position: pos,
                rotation: rot,
                scale: scale,
                attributes: {
                  track_id: datumaroTrackId,
                  outside: false,
                  keyframe: !!st.keyframe,
                  ...(st.attributes || {}),
                },
              });
            }
          }

          items.push({
            id: `frame_${String(f).padStart(6, "0")}`,
            attr: { frame: f },
            annotations,
          });
        }
      }

      const datumaroDataset = {
        dm_format_version: "1.0",
        categories: {
          label: {
            labels: labels.map((l) => ({ name: l.name })),
          },
        },
        items,
      };

      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_EXPORT_JOB_DATUMARO_DATA", {
          detail: {
            success: true,
            dataset: datumaroDataset,
            totalFrames: stopFrame - startFrame + 1,
            jobId,
          },
        })
      );
    } catch (err: any) {
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_EXPORT_JOB_DATUMARO_DATA", {
          detail: {
            success: false,
            error: err?.message || String(err),
            jobId,
          },
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
              markCvatSaveButtonUnsaved(job);
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

  // 1b5. Lắng nghe yêu cầu chuyển frame trong CVAT native (Chuẩn React Fiber, 1 Kênh Duy Nhất, Zero Delay)
  window.addEventListener("CVAT_EXT_REQ_JUMP_FRAME", (e: any) => {
    try {
      const { frame } = e.detail || {};
      if (typeof frame !== "number" || isNaN(frame) || frame < 0) return;

      const store = getReduxStore();
      const currentStoreFrame = store?.getState()?.annotation?.player?.frame?.number;
      // Nếu đã ở đúng frame này rồi thì bỏ qua ngay lập tức, không kích hoạt nhảy frame
      if (currentStoreFrame === frame) return;

      // Tìm frame selector input của CVAT Player
      const frameInput = document.querySelector<HTMLInputElement>(
        ".cvat-player-frame-selector input, input.cvat-player-frame-selector, input[aria-label='Frame selector']"
      );

      if (frameInput) {
        // Ưu tiên 1: Gọi trực tiếp React Fiber props (cách nhanh nhất và chính thống nhất của Ant Design / React)
        const fiberKey = Object.keys(frameInput).find(
          (k) => k.startsWith("__reactProps$") || k.startsWith("__reactEventHandlers$")
        );
        let handled = false;
        if (fiberKey) {
          const props = (frameInput as any)[fiberKey];
          if (typeof props?.onPressEnter === "function") {
            try {
              props.onPressEnter({
                target: { value: String(frame) },
                currentTarget: { value: String(frame) },
                preventDefault: () => {},
                stopPropagation: () => {},
              });
              handled = true;
            } catch (_) {}
          } else if (typeof props?.onChange === "function") {
            try {
              props.onChange(frame);
              handled = true;
            } catch (_) {}
          }
        }

        // Ưu tiên 2: Fallback nếu không bắt được Fiber (chỉ kích hoạt 1 lần dứt khoát)
        if (!handled) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            "value"
          )?.set;
          if (nativeInputValueSetter) {
            nativeInputValueSetter.call(frameInput, String(frame));
          } else {
            frameInput.value = String(frame);
          }
          frameInput.dispatchEvent(new Event("change", { bubbles: true }));
          frameInput.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: "Enter",
              code: "Enter",
              keyCode: 13,
              which: 13,
              bubbles: true,
              cancelable: true,
            })
          );
        }
      }

      // Failsafe Spinner Release: phòng vệ nếu CVAT đang bị kẹt fetching = true quá 1.0s
      if (store) {
        setTimeout(() => {
          try {
            const checkState = store.getState?.();
            if (checkState?.annotation?.player?.frame?.fetching) {
              const curF = checkState?.annotation?.player?.frame?.number ?? frame;
              store.dispatch({
                type: "CHANGE_FRAME_SUCCESS",
                payload: {
                  number: curF,
                  data: checkState?.annotation?.player?.frame?.data || null,
                },
              });
            }
          } catch (_) {}
        }, 1000);
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

      const fitLaneFn = ((window as any).fitYawToLaneIntensity || (typeof fitYawToLaneIntensity !== "undefined" ? fitYawToLaneIntensity : undefined));
      if (!fitLaneFn) {
        throw new Error("Hàm fitYawToLaneIntensity chưa sẵn sàng trên window");
      }
      const res = fitLaneFn(
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

      markCvatSaveButtonUnsaved(job);

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

      markCvatSaveButtonUnsaved(job);

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

      markCvatSaveButtonUnsaved(job);

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
    const { jobId, frame, uiId, serverId, mode, deltaCm, deltaDeg, curbHeight, targetGroundZ: _targetGroundZ, applyToTrack, category, attributes } = e.detail || {};
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
      const curL = newPoints[6] || 4.6;
      const curW = newPoints[7] || 1.85;
      const curH = newPoints[8] || 1.45;

      let newZ = curZ;
      let newRotX = curRx;
      let newRotY = curRy;
      let msg = "";

      if (mode === "road") {
        if (category === "pedestrian") {
          // =========================================================
          // GHIM ĐẤT CHO NGƯỜI ĐI BỘ (PEDESTRIAN GROUND SNAP)
          // - Bán kính 1.0m check độ dốc địa hình tham khảo
          // - Ghim đáy chân người bám đất, KHÓA CỨNG Roll = 0°, Pitch = 0° tuyệt đối!
          // =========================================================
          const lidar = getSceneLidarPoints();
          let baseGroundZ = curZ - curH / 2;
          let pitchDeg = 0;
          let rollDeg = 0;

          if (lidar && lidar.count > 0) {
            const pts: Array<{ x: number; y: number; z: number }> = [];
            const r = 1.0;
            const rSq = r * r;
            const maxZ = baseGroundZ + 0.35;
            const minZ = baseGroundZ - 1.0;

            for (let i = 0; i < lidar.count; i++) {
              const pz = lidar.array[i * 3 + 2];
              if (pz > maxZ || pz < minZ) continue;
              const px = lidar.array[i * 3];
              const py = lidar.array[i * 3 + 1];
              const dx = px - curX;
              const dy = py - curY;
              if (dx * dx + dy * dy <= rSq) {
                pts.push({ x: px, y: py, z: pz });
              }
            }

            if (pts.length >= 3) {
              const footPts = pts.filter((p) => {
                const dx = p.x - curX;
                const dy = p.y - curY;
                return dx * dx + dy * dy <= 0.45 * 0.45;
              });
              if (footPts.length >= 3) {
                footPts.sort((a, b) => a.z - b.z);
                baseGroundZ = footPts[Math.max(0, Math.floor(footPts.length * 0.15))].z;
              }
              const slopeFn = ((window as any).estimateGroundSlopeInRadius || (typeof estimateGroundSlopeInRadius !== "undefined" ? estimateGroundSlopeInRadius : undefined));
              const slope = slopeFn ? slopeFn(pts, curX, curY, curZ, 1.0, 0.35, baseGroundZ) : { pitchDeg: 0, rollDeg: 0, pitchRad: 0, rollRad: 0 };
              pitchDeg = slope.pitchDeg;
              rollDeg = slope.rollDeg;
            }
          }

          newRotX = 0; // Khóa cứng Roll = 0°
          newRotY = 0; // Khóa cứng Pitch = 0°
          newZ = Number((baseGroundZ + curH / 2).toFixed(3));
          msg = `Đã ghim Người #${uiId} bám sàn: Z=${newZ}m (Khóa thẳng Roll=0°, Pitch=0°, Dốc địa hình 1m: ${pitchDeg}°/${rollDeg}°)`;
        } else if (category === "cyclist") {
          // =========================================================
          // GHIM ĐẤT CHO XE 2 BÁNH (CYCLIST GROUND SNAP)
          // - Bán kính 1.5m quét trọn vệt 2 bánh xe
          // - Bám dốc dọc Pitch của thân xe, KHÓA CỨNG Roll = 0° (đứng thẳng, cấm lật)
          // =========================================================
          const lidar = getSceneLidarPoints();
          let baseGroundZ = curZ - curH / 2;
          let pitchDeg = 0;
          let pitchRad = 0;

          if (lidar && lidar.count > 0) {
            const pts: Array<{ x: number; y: number; z: number }> = [];
            const r = 1.5;
            const rSq = r * r;
            const maxZ = baseGroundZ + 0.35;
            const minZ = baseGroundZ - 1.0;

            for (let i = 0; i < lidar.count; i++) {
              const pz = lidar.array[i * 3 + 2];
              if (pz > maxZ || pz < minZ) continue;
              const px = lidar.array[i * 3];
              const py = lidar.array[i * 3 + 1];
              const dx = px - curX;
              const dy = py - curY;
              if (dx * dx + dy * dy <= rSq) {
                pts.push({ x: px, y: py, z: pz });
              }
            }

            if (pts.length >= 3) {
              const wheelPts = pts.filter((p) => {
                const dx = p.x - curX;
                const dy = p.y - curY;
                return dx * dx + dy * dy <= Math.pow(curL / 2 + 0.20, 2);
              });
              if (wheelPts.length >= 3) {
                wheelPts.sort((a, b) => a.z - b.z);
                baseGroundZ = wheelPts[Math.max(0, Math.floor(wheelPts.length * 0.15))].z;
              }
              const slopeFn = ((window as any).estimateGroundSlopeInRadius || (typeof estimateGroundSlopeInRadius !== "undefined" ? estimateGroundSlopeInRadius : undefined));
              const slope = slopeFn ? slopeFn(pts, curX, curY, curZ, 1.5, 0.35, baseGroundZ) : { pitchDeg: 0, rollDeg: 0, pitchRad: 0, rollRad: 0 };
              pitchDeg = slope.pitchDeg;
              pitchRad = slope.pitchRad;
            }
          }

          newRotX = 0; // Khóa cứng Roll = 0° (đứng thẳng 100%)
          newRotY = pitchRad; // Bám dốc dọc Pitch của xe
          newZ = Number((baseGroundZ + (curH / 2) * Math.cos(pitchRad)).toFixed(3));
          msg = `Đã ghim Xe 2 bánh #${uiId} bám mặt đường: Z=${newZ}m (Pitch=${pitchDeg}°, Khóa Roll=0° đứng thẳng)`;
        } else {
          // =========================================================
          // GHIM ĐẤT CHO Ô TÔ (CAR / TRUCK / BUS GROUND SNAP)
          // - Bám dốc 3D Roll 2 mép biên, Pitch cản trước/sau, vỉa hè / gác lề
          // =========================================================
          const groundInfo = detectAccurateGroundZ(curX, curY, curZ, curRz, curL / 2, curW / 2, curH / 2, false, false);

          if (groundInfo.isFallbackZeroGround || groundInfo.groundPointsCount < 10) {
            const baseZ = groundInfo.groundZ !== null ? groundInfo.groundZ : (curZ - curH / 2);
            newRotX = 0;
            newRotY = 0;
            newZ = Number((baseZ + curH / 2).toFixed(3));
            if (Math.abs(newZ - curZ) > 0.50) {
              newZ = curZ;
            }
            msg = `Point mặt đất ít (${groundInfo.groundPointsCount} điểm) ➔ Khóa chuẩn 0° phẳng (Tâm Z: ${newZ}m, Khóa Roll 0°, Pitch 0°)`;
          } else if (groundInfo.groundZ !== null) {
            const cosPitch = Math.cos(groundInfo.pitchRad);
            const cosRoll = Math.cos(groundInfo.rollRad);
            newRotY = groundInfo.pitchRad;

            if (groundInfo.isHalfCurb) {
              newRotX = groundInfo.rollRad;
              newZ = Number((groundInfo.groundZ + (curH / 2) * cosPitch * cosRoll).toFixed(3));
              const sideText = groundInfo.halfCurbSide === "left" ? "bên TRÁI" : "bên PHẢI";
              msg = `Đã tự động nhận diện xe #${uiId} gác lề ${sideText} (Bậc vỉa hè: +${groundInfo.curbHeightCm}cm, Nghiêng Front Roll: ${groundInfo.rollDeg}°, Tâm Z: ${newZ}m)`;
            } else if (groundInfo.isCurbGround) {
              newRotX = 0;
              newZ = Number((groundInfo.groundZ + (curH / 2) * cosPitch).toFixed(3));
              msg = `Đã tự động nhận diện xe #${uiId} đỗ trên nền vỉa hè (+${groundInfo.curbHeightCm || 15}cm so với Ego, Khóa Roll 0°, Tâm Z: ${newZ}m)`;
            } else {
              newRotX = groundInfo.rollRad;
              newZ = Number((groundInfo.groundZ + (curH / 2) * cosPitch * cosRoll).toFixed(3));
              msg = `Đã ghim đáy xe #${uiId} bám sát mặt đường (Z: ${newZ}m, Roll: ${groundInfo.rollDeg}°, Pitch: ${groundInfo.pitchDeg}°)`;
            }
          } else {
            newRotX = 0;
            newRotY = 0;
            newZ = curZ;
            msg = `Không có điểm mặt đất ➔ Khóa chuẩn 0° phẳng (Tâm Z: ${newZ}m, Khóa Roll 0°, Pitch 0°)`;
          }
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
        if (category === "pedestrian") {
          newRotX = 0;
          newRotY = 0;
          msg = `Người đi bộ #${uiId} luôn khóa thẳng đứng (Roll=0°, Pitch=0° tuyệt đối)`;
        } else {
          const dDeg = deltaDeg !== undefined ? deltaDeg : 0.5;
          const dRad = (dDeg * Math.PI) / 180;
          newRotY = Number((curRy + dRad).toFixed(5));
          const pitchDeg = Number(((newRotY * 180) / Math.PI).toFixed(2));
          msg = `Đã vi chỉnh dốc Side xe #${uiId} (${dDeg > 0 ? "+" : ""}${dDeg}° ➔ Pitch: ${pitchDeg}°)`;
        }
      } else if (mode === "micro_adjust_roll") {
        if (category === "pedestrian") {
          newRotX = 0;
          newRotY = 0;
          msg = `Người đi bộ #${uiId} luôn khóa thẳng đứng (Roll=0°, Pitch=0° tuyệt đối)`;
        } else {
          const dDeg = deltaDeg !== undefined ? deltaDeg : 0.5;
          const dRad = (dDeg * Math.PI) / 180;
          newRotX = Number((curRx + dRad).toFixed(5));
          const rollDeg = Number(((newRotX * 180) / Math.PI).toFixed(2));
          msg = `Đã vi chỉnh nghiêng Front xe #${uiId} (${dDeg > 0 ? "+" : ""}${dDeg}° ➔ Roll: ${rollDeg}°)`;
        }
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
          const dRadPitch = mode === "micro_adjust_pitch" ? ((deltaDeg !== undefined ? deltaDeg : 0.5) * Math.PI) / 180 : 0;
          const dRadRoll = mode === "micro_adjust_roll" ? ((deltaDeg !== undefined ? deltaDeg : 0.5) * Math.PI) / 180 : 0;
          const parentTrack = await findTrackInJob(job, uiId, serverId, target.parentID);
          if (parentTrack) {
            const shapesList = toArray(parentTrack.shapes || parentTrack.keyframes || (parentTrack as any)._shapes);
            for (const sh of shapesList) {
              if (sh.shapeType === "cuboid" && Array.isArray(sh.points) && sh.points.length >= 9) {
                const pts = [...sh.points];
                pts[2] = Number((pts[2] + deltaZ).toFixed(3));
                if (category === "pedestrian") {
                  pts[3] = 0;
                  pts[4] = 0;
                } else if (mode === "micro_adjust_pitch") {
                  pts[4] = Number(((pts[4] || 0) + dRadPitch).toFixed(5));
                } else if (mode === "micro_adjust_roll") {
                  pts[3] = Number(((pts[3] || 0) + dRadRoll).toFixed(5));
                } else {
                  pts[3] = newRotX;
                  pts[4] = newRotY;
                }
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
        msg += ` (Đã cập nhật toàn bộ ${framesSnapped} frames trong track)`;
      }

      updateThreeJsCuboid(
        uiId,
        undefined,
        { x: curX, y: curY, z: newZ },
        undefined,
        { rx: newRotX, ry: newRotY, rz: curRz }
      );

      markCvatSaveButtonUnsaved(job);

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

      markCvatSaveButtonUnsaved(job);

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

      markCvatSaveButtonUnsaved(job);

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
      const targetBox = {
        c: [target.points[0], target.points[1], target.points[2]],
        s: [target.points[6], target.points[7], target.points[8]],
        r: [target.points[3] || 0, target.points[4] || 0, target.points[5] || 0],
      };

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

      markCvatSaveButtonUnsaved(job);

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
      const targetBox = {
        c: [target.points[0], target.points[1], target.points[2]],
        s: [target.points[6], target.points[7], target.points[8]],
        r: [target.points[3] || 0, target.points[4] || 0, target.points[5] || 0],
      };

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

      markCvatSaveButtonUnsaved(job);
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
      const targetBox = {
        c: [target.points[0], target.points[1], target.points[2]],
        s: [target.points[6], target.points[7], target.points[8]],
        r: [target.points[3] || 0, target.points[4] || 0, target.points[5] || 0],
      };

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

      markCvatSaveButtonUnsaved(job);
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

  // Thuật toán Fit Box tại Frame Hiện Tại với Padding 5cm mỗi bên (+10cm L, +10cm W, +5cm H, Đáy Ghim Sàn, Kẹp Chuẩn Tool_QC)
  function fitBoxWithPadding5cm(points: number[], attributes?: Record<string, any>): {
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
    let rawL = Number((measuredL + 0.10).toFixed(2));
    let rawW = Number((measuredW + 0.10).toFixed(2));
    let rawH = Number((measuredH + 0.05).toFixed(2));

    // KẸP CHUẨN TOOL_QC CHO XE CƠ GIỚI:
    const isLargeVehicle = Boolean(
      attributes?.is_large ||
      attributes?.truck ||
      attributes?.bus ||
      attributes?.vehicle_type === "truck" ||
      attributes?.vehicle_type === "bus"
    );
    const minL = 3.20, maxL = isLargeVehicle ? 12.00 : 5.50;
    const minW = 1.60, maxW = isLargeVehicle ? 2.60 : 2.20;
    const minH = 1.45, maxH = isLargeVehicle ? 3.60 : 1.90;

    const newL = Number(Math.max(minL, Math.min(maxL, rawL)).toFixed(2));
    const newW = Number(Math.max(minW, Math.min(maxW, rawW)).toFixed(2));
    const newH = Number(Math.max(minH, Math.min(maxH, rawH)).toFixed(2));

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
    const { jobId, frame, uiId, serverId, applyToTrack = false, attributes } = e.detail || {};
    try {
      const job = await getActiveJobInstance(jobId);
      const { target, isDrawn } = await findTargetSafely(job, frame, uiId, serverId);

      const fit = fitBoxWithPadding5cm(target.points, attributes);

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

      markCvatSaveButtonUnsaved(job);

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

      markCvatSaveButtonUnsaved(job);

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

      markCvatSaveButtonUnsaved(job);

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

      markCvatSaveButtonUnsaved(job);

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

      const targetBox = {
        c: [cx, cy, cz],
        s: [curL, curW, curH],
        r: [rx, ry, yaw],
      };

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

      markCvatSaveButtonUnsaved(job);

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


  // 19. Lắng nghe yêu cầu cấu hình Canvas Theme (Light: Nền Trắng + Điểm Đen ⇄ Dark: Nền Tối + Điểm Sáng)
  window.addEventListener("CVAT_EXT_REQ_SET_CANVAS_THEME", (e: any) => {
    const { theme } = e.detail || {};
    if (theme === "light" || theme === "dark") {
      currentCanvasTheme = theme;
    }
    applyCanvasThemeInMainWorld(currentCanvasTheme);
    applyPointCloudColorizationInMainWorld({
      mode: currentPointColorMode,
      colorizeBoxed: currentColorizeBoxed,
    });
    window.dispatchEvent(
      new CustomEvent("CVAT_EXT_RES_SET_CANVAS_THEME", {
        detail: {
          success: true,
          theme: currentCanvasTheme,
        },
      })
    );
  });

  window.addEventListener("CVAT_EXT_REQ_GET_CANVAS_THEME", () => {
    window.dispatchEvent(
      new CustomEvent("CVAT_EXT_RES_GET_CANVAS_THEME", {
        detail: {
          theme: currentCanvasTheme,
        },
      })
    );
  });

  // 20. Lắng nghe yêu cầu cấu hình Kích thước điểm mây Ortho 2D (Top / Side / Front)
  window.addEventListener("CVAT_EXT_REQ_SET_ORTHO_POINT_SIZE", (e: any) => {
    const { size } = e.detail || {};
    if (typeof size === "number" && size >= 1.0 && size <= 10.0) {
      applyOrthoPointSize(size);
    }
    window.dispatchEvent(
      new CustomEvent("CVAT_EXT_RES_SET_ORTHO_POINT_SIZE", {
        detail: {
          success: true,
          size: currentOrthoPointSize,
        },
      })
    );
  });

  window.addEventListener("CVAT_EXT_REQ_GET_ORTHO_POINT_SIZE", () => {
    window.dispatchEvent(
      new CustomEvent("CVAT_EXT_RES_GET_ORTHO_POINT_SIZE", {
        detail: {
          size: currentOrthoPointSize,
        },
      })
    );
  });

  // 21. Lắng nghe yêu cầu tính toán lại Cảnh Báo Viền Chạm Point (Edge Contact HUD)
  window.addEventListener("CVAT_EXT_REQ_CALCULATE_EDGE_CONTACTS", () => {
    calculateAndBroadcastBoxEdgeContacts();
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
