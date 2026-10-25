/**
 * Module: CVAT Main World Injected Script (Facade Hub)
 * Đoạn mã chạy trực tiếp trong Main World của trang web CVAT:
 * - Có quyền truy cập 100% vào Redux Store, cvat-core và Three.js Canvas3D
 * - Trích xuất mây 300,000+ điểm LiDAR từ THREE.Points trong WebGL RAM
 * - Tính toán cao độ mặt đất thực tế & Tự Fit Box hoàn toàn
 * - Nhận diện khi click vào box 3D trên Canvas và Highlight 2 chiều
 * - Can thiệp trực tiếp vào Three.js Cuboid mesh -> Realtime 100% (Zero-F5)
 */

import { installGlobalThreeRaycastGuard, hookAllScenes } from "./injected/three_guard.ts";
import { getReduxStore } from "./injected/redux_bridge.ts";
import { setupCanvasAutoSelect, setupCanvasInteractiveWatcher } from "./injected/canvas_interactor.ts";
import { registerEventRouters } from "./injected/event_router.ts";
import { scheduleSingleFrameColorizationAndGround } from "./injected/point_cloud_colorizer.ts";

export function mainWorldScript(): void {
  if ((window as any).__CVAT_3D_SUITE_INJECTED__) return;
  (window as any).__CVAT_3D_SUITE_INJECTED__ = true;

  console.log(
    "[CVAT 3D Suite] Main-World Injected Bridge đã sẵn sàng (LiDAR Point Cloud Engine, Auto-Fit & Canvas Select)."
  );

  // 1. Cài đặt Raycasting Guard trên Three.js (Khóa raycast mây 305k điểm)
  installGlobalThreeRaycastGuard();
  hookAllScenes();

  // Fast scan guard đón đầu PCD tải bất đồng bộ trong 1.2s đầu
  let scanGuardCount = 0;
  const scanGuardInterval = setInterval(() => {
    scanGuardCount++;
    installGlobalThreeRaycastGuard();
    hookAllScenes();
    if (scanGuardCount >= 30) {
      clearInterval(scanGuardInterval);
    }
  }, 35);

  // 2. Thiết lập cơ chế tương tác Canvas và Ray-OBB Double-Click Auto Select
  setTimeout(() => {
    setupCanvasAutoSelect();
    setupCanvasInteractiveWatcher();
  }, 1000);

  // 3. Đăng ký toàn bộ Router sự kiện với UI Extension
  registerEventRouters();

  // 4. Khởi động nạp ban đầu cho Frame đầu tiên (Single-Flight sau khi canvas sẵn sàng)
  setTimeout(() => {
    try {
      const store = getReduxStore();
      const f = store?.getState()?.annotation?.player?.frame?.number ?? 0;
      scheduleSingleFrameColorizationAndGround(f, 300);
    } catch (_) {}
  }, 1200);
}
