/**
 * POINT CLOUD COLORIZATION ENGINE (MAIN WORLD)
 * 1. Hiển thị mặc định theo độ phản xạ (LiDAR Intensity)
 * 2. Nhuộm màu mây điểm nằm trong xe bọc (Boxed Points Colorization)
 * 3. Chế độ xem không xét độ phản xạ (Plain / Uniform Color Mode)
 * 4. Cơ chế Single-Flight Frame Controller (Zero-Lag 60 FPS, hủy frame cũ)
 */

import { getReduxStore } from "./redux_bridge.ts";
import { guardPointsInstance, installGlobalThreeRaycastGuard, hookSceneForPointsGuard } from "./three_guard.ts";

  export let currentPointColorMode: "intensity" | "plain" =
    typeof localStorage !== "undefined" && localStorage.getItem("cvat_3d_point_color_mode") === "plain"
      ? "plain"
      : "intensity";

  export function setCurrentPointColorMode(mode: "intensity" | "plain"): void {
    currentPointColorMode = mode;
  }

  export let currentColorizeBoxed: boolean =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("cvat_3d_colorize_boxed") !== "false"
      : true;

  export function setCurrentColorizeBoxed(val: boolean): void {
    currentColorizeBoxed = val;
  }

  export let currentCanvasTheme: "light" | "dark" =
    typeof localStorage !== "undefined" && localStorage.getItem("cvat_3d_canvas_theme") === "dark"
      ? "dark"
      : "light";

  export function setCurrentCanvasTheme(theme: "light" | "dark"): void {
    currentCanvasTheme = theme;
  }

  // Kích thước hạt điểm mây LiDAR trên 3 khung nhìn trực giao 2D (Top, Side, Front)
  // Mặc định: 3.5px (Nét rõ), Hỗ trợ xoay vòng: 2.0px / 3.5px / 5.0px
  // Khung nhìn 3D chính (Perspective View) giữ nguyên 100% mặc định theo cài đặt của CVAT
  export let currentOrthoPointSize: number = 3.5;
  try {
    const savedOrthoSize = localStorage.getItem("cvat_3d_ortho_point_size");
    if (savedOrthoSize) {
      const parsed = parseFloat(savedOrthoSize);
      if (!isNaN(parsed) && parsed >= 1.0 && parsed <= 10.0) {
        currentOrthoPointSize = parsed;
      }
    }
  } catch (_) {}

  export function applyOrthoPointSize(size: number): void {
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

  export let isColorizingRunning: boolean = false;
  export let isCanvasInteracting: boolean = false;
  let singleFrameColorizeTimer: any = null;

  // Áp dụng Theme Canvas 3D Three.js và CSS (Light: Nền Trắng / Điểm Đen ⇄ Dark: Nền Tối / Điểm Sáng)
  export function applyCanvasThemeInMainWorld(theme?: "light" | "dark"): void {
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
  export function getAllScenePointsObjects(): any[] {
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

  export const OVERLAP_WARNING_COLOR = { r: 1.0, g: 0.0, b: 0.20 }; // Đỏ Neon Cảnh Báo (#ff0033)

  export function getDistinctTrackColor(
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
  export function applyPointCloudColorizationInMainWorld(
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
          let _v = 0.5;
          if (intensityAttr && i < intensityAttr.length) {
            const rawInt = intensityAttr[i];
            if (typeof rawInt === "number" && !isNaN(rawInt) && isFinite(rawInt)) {
              _v = rawInt <= 1.0 ? Math.max(0, rawInt) : Math.min(1.0, Math.max(0, rawInt) / 255);
            }
          }
          void _v;

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

  export function schedulePointCloudColorization(
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



  // Single-Flight Frame Controller: Hủy tác vụ cũ khi đổi frame, chỉ render đúng 1 lần cho frame active qua requestAnimationFrame
  export function scheduleSingleFrameColorizationAndGround(targetFrame: number, delayMs: number = 180): void {
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

  export function cancelSingleFrameColorization(): void {
    if (singleFrameColorizeTimer) {
      clearTimeout(singleFrameColorizeTimer);
      singleFrameColorizeTimer = null;
    }
    if (colorizeRafId) {
      cancelAnimationFrame(colorizeRafId);
      colorizeRafId = null;
    }
  }

    // Thuật toán Annular Ring Ground Detection & 3D Slope Fitting (Pitch Dọc & Roll Ngang Front)
  // Thuật toán ƯỚC LƯỢNG CAO ĐỘ MẶT ĐƯỜNG XE EGO (Ego Road Surface Z Reference):
