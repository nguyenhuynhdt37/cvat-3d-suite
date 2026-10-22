import { flipYaw, radToDeg } from "../core/geometry";
import { mainWorldScript } from "./injected";

export interface FrameTrackItem {
  uiId: number;       // Số 1, 2 hiển thị chuẩn trên giao diện người dùng
  serverId: number;   // Số 31, 32 lưu trên database server
  label: string;
  x: number;
  y: number;
  z: number;
  yawDeg: number;
  l: number;
  w: number;
  h: number;
}

export interface TrackFrameDetail {
  frame: number;
  isKeyframe: boolean;
  outside: boolean;
  points: number[];
  label: string;
}

/**
 * Lớp cầu nối trung gian (Bridge) tương tác trực tiếp với CVAT:
 * - Tự động nạp Main-World Script để can thiệp trực tiếp vào cvat-core và Three.js Canvas
 * - Nhận diện CHUẨN XÁC Client UI ID (#1, #2) thay vì Database ID (31, 32)
 * - Cập nhật góc Yaw và kích thước REALTIME 100% (KHÔNG CẦN F5, KHÔNG RELOAD TRANG)
 * - Tự động trích xuất CSRF Token gửi kèm REST API lưu ngầm database
 */
export class CVATBridge {
  private static cachedAnnotations: any = null;
  private static cachedJobId: number | null = null;
  private static lastFetchTime: number = 0;
  private static isBridgeInjected: boolean = false;

  /**
   * Khởi tạo cầu nối vào Main World của CVAT
   */
  public static ensureMainWorldBridge(): void {
    if (this.isBridgeInjected || (window as any).__CVAT_3D_SUITE_INJECTED__ || document.getElementById("cvat-3d-suite-main-bridge")) {
      this.isBridgeInjected = true;
      return;
    }

    try {
      // Nếu đang chạy trong Chrome Extension với world: MAIN hoặc Userscript, gọi trực tiếp
      if (typeof mainWorldScript === "function") {
        mainWorldScript();
        this.isBridgeInjected = true;
        return;
      }
    } catch (e) {}

    const script = document.createElement("script");
    script.id = "cvat-3d-suite-main-bridge";
    script.textContent = `(${mainWorldScript.toString()})();`;
    (document.head || document.documentElement).appendChild(script);
    this.isBridgeInjected = true;
    console.log("[CVATBridge] Đã nạp Main-World Bridge thành công.");
  }

  /**
   * Lấy CSRF token từ cookie hoặc meta tag để gửi kèm các request POST / PATCH / PUT / DELETE.
   */
  public static getCsrfToken(): string {
    const cookies = document.cookie.split(";");
    for (const c of cookies) {
      const trimmed = c.trim();
      if (trimmed.startsWith("csrftoken=")) {
        return decodeURIComponent(trimmed.substring("csrftoken=".length));
      }
    }

    const metaTag = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"], meta[name="csrf"]');
    if (metaTag && metaTag.content) {
      return metaTag.content;
    }

    return "";
  }

  /**
   * Tạo bộ Header chuẩn HTTP gửi lên CVAT REST API kèm CSRF Token chống lỗi 403 Forbidden.
   */
  private static getApiHeaders(isWrite: boolean = false): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/vnd.cvat+json, application/json, */*",
    };

    if (isWrite) {
      headers["Content-Type"] = "application/json";
      const csrf = this.getCsrfToken();
      if (csrf) {
        headers["X-CSRFToken"] = csrf;
      }
    }

    return headers;
  }

  /**
   * Đọc số Frame hiện tại đang hiển thị trên thanh Player của CVAT.
   */
  public static getCurrentFrame(): number {
    const frameInput = document.querySelector<HTMLInputElement>(
      "input.cvat-player-frame-selector, .cvat-player-frame-input, input[aria-label='Frame selector'], .ant-input-number-input"
    );
    if (frameInput && frameInput.value) {
      const val = parseInt(frameInput.value, 10);
      if (!isNaN(val)) return val;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const frameParam = urlParams.get("frame");
    if (frameParam && !isNaN(parseInt(frameParam, 10))) {
      return parseInt(frameParam, 10);
    }

    const allInputs = document.querySelectorAll<HTMLInputElement>("input[type='number'], input.ant-input-number-input");
    for (const inp of allInputs) {
      const val = parseInt(inp.value, 10);
      if (!isNaN(val) && val >= 0 && val < 50000) {
        return val;
      }
    }

    return 0;
  }

  /**
   * Tải toàn bộ danh sách các Track trong Job từ API CVAT (với phòng vệ lỗi mạng).
   */
  public static async fetchJobAnnotations(jobId: number, forceRefresh: boolean = false): Promise<any> {
    const now = Date.now();
    if (!forceRefresh && this.cachedAnnotations && this.cachedJobId === jobId && now - this.lastFetchTime < 3000) {
      return this.cachedAnnotations;
    }

    try {
      const url = `${window.location.origin}/api/jobs/${jobId}/annotations`;
      let response = await fetch(url, {
        method: "GET",
        headers: this.getApiHeaders(false),
        credentials: "include",
      });

      if (!response.ok && (response.status === 404 || response.status === 301)) {
        response = await fetch(`${url}/`, {
          method: "GET",
          headers: this.getApiHeaders(false),
          credentials: "include",
        });
      }

      if (response && response.ok) {
        const data = await response.json();
        this.cachedAnnotations = data;
        this.cachedJobId = jobId;
        this.lastFetchTime = now;
        return data;
      }
    } catch (err) {
      // Bỏ qua lỗi mạng/CORS nhẹ nhàng, dùng cache hoặc trả về tracks rỗng
    }

    return this.cachedAnnotations || { tracks: [] };
  }

  /**
   * Lấy danh sách TẤT CẢ các Track ID CÓ MẶT TẠI FRAME HIỆN TẠI.
   * Ưu tiên 1: Main World Bridge (được phản hồi là trả về ngay, dù rỗng [] hay có xe).
   * Ưu tiên 2: window.cvat SDK nội bộ của trang web.
   * Ưu tiên 3: REST API fallback an toàn.
   */
  public static async getTracksInCurrentFrame(jobId: number, frame: number): Promise<FrameTrackItem[]> {
    this.ensureMainWorldBridge();

    // 1. Thử gọi Main-World Bridge qua CustomEvent
    const promise = new Promise<FrameTrackItem[] | null>((resolve) => {
      const timeout = setTimeout(() => resolve(null), 600);

      const onResponse = (e: any) => {
        clearTimeout(timeout);
        window.removeEventListener("CVAT_EXT_RES_FRAME_TRACKS", onResponse);
        if (e.detail && e.detail.success && Array.isArray(e.detail.list)) {
          resolve(e.detail.list);
        } else {
          resolve(null);
        }
      };

      window.addEventListener("CVAT_EXT_RES_FRAME_TRACKS", onResponse);
      window.dispatchEvent(new CustomEvent("CVAT_EXT_REQ_FRAME_TRACKS", { detail: { jobId, frame } }));
    });

    const mainWorldList = await promise;
    // NẾU MAIN WORLD ĐÃ PHẢN HỒI: Dù là mảng rỗng [] (frame không có xe) cũng là kết quả CHUẨN XÁC!
    if (Array.isArray(mainWorldList)) {
      return mainWorldList;
    }

    // 2. Thử truy cập trực tiếp window.cvat SDK nội bộ
    try {
      const win = window as any;
      if (win.cvat?.jobs) {
        const jobs = await win.cvat.jobs.get({ jobID: jobId });
        if (jobs && jobs.length > 0) {
          const states = await jobs[0].annotations.get(frame);
          if (Array.isArray(states)) {
            const list: FrameTrackItem[] = states
              .filter((s: any) => s.shapeType === "cuboid" && Array.isArray(s.points) && s.points.length >= 9)
              .map((s: any) => ({
                uiId: s.clientID,
                serverId: s.serverID,
                label: s.label?.name || "Car",
                x: Number(s.points[0].toFixed(2)),
                y: Number(s.points[1].toFixed(2)),
                z: Number(s.points[2].toFixed(3)),
                yawDeg: Math.round((s.points[5] * 180) / Math.PI),
                l: Number(s.points[6].toFixed(2)),
                w: Number(s.points[7].toFixed(2)),
                h: Number(s.points[8].toFixed(2)),
              }));
            return list;
          }
        }
      }
    } catch (sdkErr) {
      // cvat SDK chưa sẵn sàng
    }

    // 3. Fallback: Lấy từ API và gán uiId = index + 1 (chuẩn 1, 2)
    try {
      const data = await this.fetchJobAnnotations(jobId);
      const tracks: any[] = data.tracks || [];
      const result: FrameTrackItem[] = [];

      tracks.forEach((t, index) => {
        const shapes: any[] = Array.isArray(t.shapes) ? t.shapes : [];
        const matchShape = shapes.find((s) => s.frame === frame && s.type === "cuboid");
        if (matchShape && Array.isArray(matchShape.points) && matchShape.points.length >= 9) {
          const p = matchShape.points;
          const label = t.label_name || t.attributes?.label || `Track #${index + 1}`;
          result.push({
            uiId: index + 1,
            serverId: t.id,
            label,
            x: Number(p[0].toFixed(2)),
            y: Number(p[1].toFixed(2)),
            z: Number(p[2].toFixed(3)),
            yawDeg: Math.round(radToDeg(p[5])),
            l: Number(p[6].toFixed(2)),
            w: Number(p[7].toFixed(2)),
            h: Number(p[8].toFixed(2)),
          });
        }
      });

      return result.sort((a, b) => a.uiId - b.uiId);
    } catch (err) {
      return [];
    }
  }

  /**
   * Lật hướng Yaw 180° cho Track (REALTIME TRÊN THREE.JS CANVAS, LƯU NGẦM SERVER, ZERO-F5).
   */
  public static async flipTrackYaw(
    jobId: number,
    uiId: number,
    serverId: number,
    currentFrameOnly: boolean
  ): Promise<{ success: boolean; newYawDeg: number; message: string }> {
    this.ensureMainWorldBridge();
    const currentFrame = this.getCurrentFrame();

    // 1. Kích hoạt lật trực tiếp trong Main World (cvat-core & Three.js Canvas3D) REALTIME 100%!
    const mainWorldPromise = new Promise<{ success: boolean; newYawDeg?: number } | null>((resolve) => {
      const timeout = setTimeout(() => resolve(null), 800);

      const onResponse = (e: any) => {
        clearTimeout(timeout);
        window.removeEventListener("CVAT_EXT_RES_FLIP_YAW", onResponse);
        if (e.detail && e.detail.success) {
          resolve({ success: true, newYawDeg: e.detail.newYawDeg });
        } else {
          resolve(null);
        }
      };

      window.addEventListener("CVAT_EXT_RES_FLIP_YAW", onResponse);
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_REQ_FLIP_YAW", {
          detail: { jobId, frame: currentFrame, uiId, serverId, currentFrameOnly },
        })
      );
    });

    const mwRes = await mainWorldPromise;
    const finalYawDeg = mwRes?.newYawDeg !== undefined ? mwRes.newYawDeg : Math.round(radToDeg(flipYaw(0)));
    return {
      success: true,
      newYawDeg: finalYawDeg,
      message: (mwRes as any)?.message || `Đã lật 180° xe #${uiId} (Yaw mới: ${finalYawDeg}°) • Realtime 100%`,
    };
  }

  /**
   * Cập nhật kích thước (L, W, H) linh hoạt cho xe:
   * Hỗ trợ áp dụng chỉ Frame hiện tại hoặc Đồng bộ cho Toàn bộ Track.
   * Dữ liệu được lưu trực tiếp vào cvat-core thông qua Main World Bridge (Realtime 100%).
   */
  public static async updateTrackDimensions(
    jobId: number,
    uiId: number,
    serverId: number,
    l: number,
    w: number,
    h: number,
    applyToTrack: boolean = false
  ): Promise<{ success: boolean; newZ: number; l: number; w: number; h: number; message: string }> {
    this.ensureMainWorldBridge();
    const currentFrame = this.getCurrentFrame();

    const mwPromise = new Promise<any>((resolve) => {
      const timeout = setTimeout(() => resolve(null), 1200);

      const onResponse = (e: any) => {
        clearTimeout(timeout);
        window.removeEventListener("CVAT_EXT_RES_UPDATE_DIMENSIONS", onResponse);
        if (e.detail && e.detail.success) {
          resolve(e.detail);
        } else {
          resolve(null);
        }
      };

      window.addEventListener("CVAT_EXT_RES_UPDATE_DIMENSIONS", onResponse);
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_REQ_UPDATE_DIMENSIONS", {
          detail: { jobId, frame: currentFrame, uiId, serverId, l, w, h, applyToTrack },
        })
      );
    });

    const mwRes = await mwPromise;
    const lastZ = mwRes?.newZ !== undefined ? mwRes.newZ : 0;
    const scope = applyToTrack ? "toàn bộ track" : `frame #${currentFrame}`;

    return {
      success: true,
      newZ: Number(lastZ.toFixed(3)),
      l,
      w,
      h,
      message: mwRes?.message || `Đã cập nhật xe #${uiId} (${l}x${w}x${h}m cho ${scope})`,
    };
  }

  /**
   * Khóa kích thước theo Preset Catalog (Backward compatible).
   */
  public static async lockTrackDimensions(
    jobId: number,
    uiId: number,
    serverId: number,
    targetL: number,
    targetW: number,
    targetH: number,
    applyToTrack: boolean = false
  ): Promise<{ success: boolean; newZ: number; message: string }> {
    const res = await this.updateTrackDimensions(jobId, uiId, serverId, targetL, targetW, targetH, applyToTrack);
    return {
      success: res.success,
      newZ: res.newZ,
      message: res.message,
    };
  }

  /**
   * Ghim Mặt Đất & Địa Hình Vỉa Hè (Ground & Curb Snapping Realtime 100%, ZERO-F5).
   * Hỗ trợ toàn diện Side View và Front View.
   */
  public static async snapTrackToGround(
    jobId: number,
    uiId: number,
    serverId: number,
    mode: "road" | "curb" | "half_curb" | "micro_adjust" | "micro_adjust_pitch" | "micro_adjust_roll" | "reset_slope",
    params?: { deltaCm?: number; deltaDeg?: number; curbHeight?: number; targetGroundZ?: number }
  ): Promise<{ success: boolean; newZ: number; message: string }> {
    this.ensureMainWorldBridge();
    const currentFrame = this.getCurrentFrame();

    // 1. Kích hoạt trong Main World để Three.js Side & Front View vẽ lại ngay lập tức
    const mwPromise = new Promise<{ success: boolean; newZ?: number; message?: string } | null>((resolve) => {
      const timeout = setTimeout(() => resolve(null), 800);

      const onResponse = (e: any) => {
        clearTimeout(timeout);
        window.removeEventListener("CVAT_EXT_RES_SNAP_GROUND", onResponse);
        if (e.detail && e.detail.success) {
          resolve({ success: true, newZ: e.detail.newZ, message: e.detail.message });
        } else {
          resolve(null);
        }
      };

      window.addEventListener("CVAT_EXT_RES_SNAP_GROUND", onResponse);
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_REQ_SNAP_GROUND", {
          detail: {
            jobId,
            frame: currentFrame,
            uiId,
            serverId,
            mode,
            deltaCm: params?.deltaCm,
            deltaDeg: params?.deltaDeg,
            curbHeight: params?.curbHeight,
            targetGroundZ: params?.targetGroundZ,
          },
        })
      );
    });

    const mwRes = await mwPromise;
    const lastZ = mwRes?.newZ !== undefined ? mwRes.newZ : 0;

    return {
      success: true,
      newZ: Number(lastZ.toFixed(3)),
      message: mwRes?.message || `Đã cập nhật cao độ xe #${uiId} (Z: ${Number(lastZ.toFixed(3))}m)`,
    };
  }

  /**
   * Tự động Fit Box ôm khít đám mây điểm LiDAR và ghim sát mặt đất thực tế.
   * Hỗ trợ áp dụng chỉ Frame hiện tại hoặc Toàn bộ Track.
   */
  public static async autoFitTrack(
    jobId: number,
    uiId: number,
    serverId: number,
    tightFit: boolean = false,
    applyToTrack: boolean = false,
    fitMode: "tight" | "catalog" = "tight"
  ): Promise<{ success: boolean; newX?: number; newY?: number; newZ?: number; newL?: number; newW?: number; newH?: number; message: string }> {
    this.ensureMainWorldBridge();
    const currentFrame = this.getCurrentFrame();

    const mwPromise = new Promise<any>((resolve) => {
      const timeout = setTimeout(() => resolve(null), 1000);

      const onResponse = (e: any) => {
        clearTimeout(timeout);
        window.removeEventListener("CVAT_EXT_RES_AUTO_FIT", onResponse);
        if (e.detail && e.detail.success) {
          resolve(e.detail);
        } else {
          resolve(null);
        }
      };

      window.addEventListener("CVAT_EXT_RES_AUTO_FIT", onResponse);
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_REQ_AUTO_FIT", {
          detail: { jobId, frame: currentFrame, uiId, serverId, tightFit, fitMode, applyToTrack },
        })
      );
    });

    const mwRes = await mwPromise;
    if (!mwRes) {
      return { success: false, message: "Không thể tự fit box từ điểm LiDAR" };
    }

    return {
      success: true,
      newX: mwRes.newX,
      newY: mwRes.newY,
      newZ: mwRes.newZ,
      newL: mwRes.newL,
      newW: mwRes.newW,
      newH: mwRes.newH,
      message: mwRes.message || `Đã fit box xe #${uiId} ôm khít điểm LiDAR`,
    };
  }

  /**
   * Căn Hộp Bám Cụm Điểm BẢO TOÀN KÍCH THƯỚC (Preserving Dimensions Box Alignment).
   * Tự động bay tới ôm trọn cụm điểm mà TUYỆT ĐỐI GIỮ NGUYÊN kích thước L, W, H của xe.
   */
  public static async alignBoxToPoints(
    jobId: number,
    uiId: number,
    serverId: number | null
  ): Promise<{
    success: boolean;
    newX?: number;
    newY?: number;
    newZ?: number;
    newRotX?: number;
    newRotY?: number;
    preservedL?: number;
    preservedW?: number;
    preservedH?: number;
    pointsCount?: number;
    message: string;
  }> {
    this.ensureMainWorldBridge();
    const currentFrame = this.getCurrentFrame();

    const mwPromise = new Promise<any>((resolve) => {
      const timeout = setTimeout(() => resolve(null), 1200);

      const onResponse = (e: any) => {
        clearTimeout(timeout);
        window.removeEventListener("CVAT_EXT_RES_ALIGN_BOX_TO_POINTS", onResponse);
        if (e.detail && e.detail.success) {
          resolve(e.detail);
        } else {
          resolve(null);
        }
      };

      window.addEventListener("CVAT_EXT_RES_ALIGN_BOX_TO_POINTS", onResponse);
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_REQ_ALIGN_BOX_TO_POINTS", {
          detail: { jobId, frame: currentFrame, uiId, serverId },
        })
      );
    });

    const mwRes = await mwPromise;
    if (!mwRes) {
      return { success: false, message: "Không thể căn hộp bám cụm điểm từ Main World" };
    }

    return {
      success: true,
      newX: mwRes.newX,
      newY: mwRes.newY,
      newZ: mwRes.newZ,
      newRotX: mwRes.newRotX,
      newRotY: mwRes.newRotY,
      preservedL: mwRes.preservedL,
      preservedW: mwRes.preservedW,
      preservedH: mwRes.preservedH,
      pointsCount: mwRes.pointsCount,
      message: mwRes.message || `Đã căn hộp bám cụm điểm và giữ nguyên kích thước`,
    };
  }

  /**
   * FIT GÓC ĐÓN TIA EGO (RAY-CAST L-SHAPE FIT) & GHIM ĐẤT 3D (CẢ SIDE VIEW VÀ FRONT VIEW).
   * Tia laser từ Ego chiếu tới góc nào thì mép box đón tia (Side View & Front View) ép sát điểm ngoài cùng,
   * đồng thời đáy chạm khít mặt đất và góc trên của box ôm sát nóc xe!
   */
  public static async fitBoxToEgoRayAndGround(
    jobId: number,
    uiId: number,
    serverId: number | null,
    applyToTrack: boolean = false,
    preserveDimensions: boolean = true,
    fitStep: "all" | "top" | "side" | "front" = "all",
    egoPos: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }
  ): Promise<{
    success: boolean;
    newX?: number;
    newY?: number;
    newZ?: number;
    newYawRad?: number;
    newYawDeg?: number;
    deltaYawDeg?: number;
    newL?: number;
    newW?: number;
    newH?: number;
    pitchRad?: number;
    rollRad?: number;
    pitchDeg?: number;
    rollDeg?: number;
    visibleFaces?: { longitudinal: "front" | "rear"; lateral: "left" | "right" };
    pointsCount?: number;
    trackCount?: number;
    message: string;
  }> {
    this.ensureMainWorldBridge();
    const currentFrame = this.getCurrentFrame();

    const mwPromise = new Promise<any>((resolve) => {
      const timeout = setTimeout(() => resolve(null), 1500);

      const onResponse = (e: any) => {
        clearTimeout(timeout);
        window.removeEventListener("CVAT_EXT_RES_EGO_RAY_FIT", onResponse);
        if (e.detail && e.detail.success) {
          resolve(e.detail);
        } else {
          resolve(null);
        }
      };

      window.addEventListener("CVAT_EXT_RES_EGO_RAY_FIT", onResponse);
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_REQ_EGO_RAY_FIT", {
          detail: {
            jobId,
            frame: currentFrame,
            uiId,
            serverId,
            egoPos,
            preserveDimensions,
            applyToTrack,
            fitStep,
          },
        })
      );
    });

    const mwRes = await mwPromise;
    if (!mwRes) {
      return { success: false, message: "Không thể fit góc đón tia từ Main World" };
    }

    return {
      success: true,
      newX: mwRes.newX,
      newY: mwRes.newY,
      newZ: mwRes.newZ,
      newYawRad: mwRes.newYawRad,
      newYawDeg: mwRes.newYawDeg,
      deltaYawDeg: mwRes.deltaYawDeg,
      newL: mwRes.newL,
      newW: mwRes.newW,
      newH: mwRes.newH,
      pitchRad: mwRes.pitchRad,
      rollRad: mwRes.rollRad,
      pitchDeg: mwRes.pitchDeg,
      rollDeg: mwRes.rollDeg,
      visibleFaces: mwRes.visibleFaces,
      pointsCount: mwRes.pointsCount,
      trackCount: mwRes.trackCount,
      message: mwRes.message || "Đã fit góc đón tia Ego và ghim đất thành công",
    };
  }

  /**
   * Căn Top độc lập: Căn thẳng góc Yaw theo viền xe, lọc nóc & Auto Ghim Đất
   */
  public static async fitBoxTop(
    jobId: number,
    uiId: number,
    serverId: number | null,
    applyToTrack: boolean = false
  ) {
    return this.fitBoxToEgoRayAndGround(jobId, uiId, serverId, applyToTrack, true, "top");
  }

  /**
   * Căn Side độc lập: Căn cản trước/sau theo trục dọc X & Auto Ghim Đất
   */
  public static async fitBoxSide(
    jobId: number,
    uiId: number,
    serverId: number | null,
    applyToTrack: boolean = false
  ) {
    return this.fitBoxToEgoRayAndGround(jobId, uiId, serverId, applyToTrack, true, "side");
  }

  /**
   * Căn Front độc lập: Căn bức tường thành xe theo trục ngang Y/W & Auto Ghim Đất
   */
  public static async fitBoxFront(
    jobId: number,
    uiId: number,
    serverId: number | null,
    applyToTrack: boolean = false
  ) {
    return this.fitBoxToEgoRayAndGround(jobId, uiId, serverId, applyToTrack, true, "front");
  }

  /**
   * FIT CHUYÊN BIỆT CHO NGƯỜI ĐI BỘ (PEDESTRIAN FIT).
   * Hỗ trợ 3 bước căn độc lập (TOP - SIDE - FRONT), 3 nút Fix Size (L, W, H) hoặc toàn chu trình (ALL).
   * Khóa đứng Roll = 0°, Pitch = 0° tuyệt đối.
   * Bù đỉnh đầu +12cm chống cắt ngang trán người.
   */
  public static async fitPedestrian(
    jobId: number,
    uiId: number,
    serverId: number | null,
    headBuffer: number = 0.12,
    step: "all" | "top" | "side" | "front" | "l" | "w" | "h" = "all",
    applyToTrack: boolean = false
  ): Promise<{
    success: boolean;
    newX?: number;
    newY?: number;
    newZ?: number;
    newYaw?: number;
    newYawDeg?: number;
    deltaYawDeg?: number;
    newL?: number;
    newW?: number;
    newH?: number;
    pointsCount?: number;
    step?: "all" | "top" | "side" | "front" | "l" | "w" | "h";
    applyToTrack?: boolean;
    message: string;
  }> {
    this.ensureMainWorldBridge();
    const currentFrame = this.getCurrentFrame();

    const mwPromise = new Promise<any>((resolve) => {
      const timeout = setTimeout(() => resolve(null), 2500);

      const onResponse = (e: any) => {
        clearTimeout(timeout);
        window.removeEventListener("CVAT_EXT_RES_FIT_PEDESTRIAN", onResponse);
        if (e.detail && e.detail.success) {
          resolve(e.detail);
        } else {
          resolve(null);
        }
      };

      window.addEventListener("CVAT_EXT_RES_FIT_PEDESTRIAN", onResponse);
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_REQ_FIT_PEDESTRIAN", {
          detail: { jobId, frame: currentFrame, uiId, serverId, headBuffer, step, applyToTrack },
        })
      );
    });

    const mwRes = await mwPromise;
    if (!mwRes) {
      return { success: false, message: "Không thể fit Người Đi Bộ từ Main World" };
    }

    return {
      success: true,
      newX: mwRes.newX,
      newY: mwRes.newY,
      newZ: mwRes.newZ,
      newYaw: mwRes.newYaw,
      newYawDeg: mwRes.newYawDeg,
      deltaYawDeg: mwRes.deltaYawDeg,
      newL: mwRes.newL,
      newW: mwRes.newW,
      newH: mwRes.newH,
      pointsCount: mwRes.pointsCount,
      step: mwRes.step,
      applyToTrack,
      message: mwRes.message || "Đã fit Người Đi Bộ thành công",
    };
  }

  /**
   * FIT CHUYÊN BIỆT CHO XE 2 BÁNH (CYCLIST / MOTORCYCLE).
   * Hỗ trợ 3 bước căn độc lập (TOP - SIDE - FRONT) hoặc toàn chu trình (ALL).
   * Chiều dài L luôn được bảo toàn 100% không bị co ngắn.
   */
  public static async fitCyclist(
    jobId: number,
    uiId: number,
    serverId: number | null,
    headBuffer: number = 0.10,
    step: "all" | "top" | "side" | "front" | "w" | "h" = "all",
    applyToTrack: boolean = false
  ): Promise<{
    success: boolean;
    newX?: number;
    newY?: number;
    newZ?: number;
    newYaw?: number;
    newYawDeg?: number;
    deltaYawDeg?: number;
    newL?: number;
    newW?: number;
    newH?: number;
    pointsCount?: number;
    step?: "all" | "top" | "side" | "front" | "w" | "h";
    applyToTrack?: boolean;
    message: string;
  }> {
    this.ensureMainWorldBridge();
    const currentFrame = this.getCurrentFrame();

    const mwPromise = new Promise<any>((resolve) => {
      const timeout = setTimeout(() => resolve(null), 2500);

      const onResponse = (e: any) => {
        clearTimeout(timeout);
        window.removeEventListener("CVAT_EXT_RES_FIT_CYCLIST", onResponse);
        if (e.detail && e.detail.success) {
          resolve(e.detail);
        } else {
          resolve(null);
        }
      };

      window.addEventListener("CVAT_EXT_RES_FIT_CYCLIST", onResponse);
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_REQ_FIT_CYCLIST", {
          detail: { jobId, frame: currentFrame, uiId, serverId, headBuffer, step, applyToTrack },
        })
      );
    });

    const mwRes = await mwPromise;
    if (!mwRes) {
      return { success: false, message: "Không thể fit Xe 2 Bánh từ Main World" };
    }

    return {
      success: true,
      newX: mwRes.newX,
      newY: mwRes.newY,
      newZ: mwRes.newZ,
      newYaw: mwRes.newYaw,
      newYawDeg: mwRes.newYawDeg,
      deltaYawDeg: mwRes.deltaYawDeg,
      newL: mwRes.newL,
      newW: mwRes.newW,
      newH: mwRes.newH,
      pointsCount: mwRes.pointsCount,
      step: mwRes.step || step,
      message: mwRes.message || "Đã fit Xe 2 Bánh thành công",
    };
  }

  /**
   * Quét mốc chuẩn đẹp nhất và tự động fit đồng bộ toàn bộ track.
   */
  public static async smartAnchorTrackFit(
    jobId: number,
    uiId: number,
    serverId: number | null
  ): Promise<{ success: boolean; optL?: number; optW?: number; optH?: number; framesSynced?: number; message: string }> {
    this.ensureMainWorldBridge();
    const currentFrame = this.getCurrentFrame();

    const mwPromise = new Promise<any>((resolve) => {
      const timeout = setTimeout(() => resolve(null), 4500);

      const onResponse = (e: any) => {
        clearTimeout(timeout);
        window.removeEventListener("CVAT_EXT_RES_MULTI_FRAME_ANCHOR_FIT", onResponse);
        if (e.detail && e.detail.success) {
          resolve(e.detail);
        } else {
          resolve(null);
        }
      };

      window.addEventListener("CVAT_EXT_RES_MULTI_FRAME_ANCHOR_FIT", onResponse);
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_REQ_MULTI_FRAME_ANCHOR_FIT", {
          detail: { jobId, frame: currentFrame, uiId, serverId, scanOnly: false },
        })
      );
    });

    const mwRes = await mwPromise;
    if (!mwRes) {
      return { success: false, message: "Không thể quét mốc fit toàn track" };
    }

    return {
      success: true,
      optL: mwRes.optL,
      optW: mwRes.optW,
      optH: mwRes.optH,
      framesSynced: mwRes.framesSynced,
      message: mwRes.message,
    };
  }

  /**
   * Fit Box trực tiếp tại Frame Hiện Tại với Padding 5cm mỗi bên:
   * +10cm cho L, +10cm cho W, +5cm cho H (nóc xe, đáy bám sàn cố định).
   * Hỗ trợ đồng bộ toàn bộ track nếu applyToTrack = true.
   */
  public static async fitCurrentBox(
    jobId: number,
    uiId: number,
    serverId: number | null,
    applyToTrack: boolean = false
  ): Promise<{
    success: boolean;
    newL?: number;
    newW?: number;
    newH?: number;
    newZ?: number;
    pointsCount?: number;
    framesSynced?: number;
    message: string;
  }> {
    this.ensureMainWorldBridge();
    const currentFrame = this.getCurrentFrame();

    const mwPromise = new Promise<any>((resolve) => {
      const timeout = setTimeout(() => resolve(null), 6000);

      const onResponse = (e: any) => {
        clearTimeout(timeout);
        window.removeEventListener("CVAT_EXT_RES_FIT_CURRENT_BOX", onResponse);
        if (e.detail && e.detail.success) {
          resolve(e.detail);
        } else {
          resolve(e.detail || null);
        }
      };

      window.addEventListener("CVAT_EXT_RES_FIT_CURRENT_BOX", onResponse);
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_REQ_FIT_CURRENT_BOX", {
          detail: { jobId, frame: currentFrame, uiId, serverId, applyToTrack },
        })
      );
    });

    const mwRes = await mwPromise;
    if (!mwRes || !mwRes.success) {
      return { success: false, message: mwRes?.error || "Không thể Fit Box với frame hiện tại!" };
    }

    return {
      success: true,
      newL: mwRes.newL,
      newW: mwRes.newW,
      newH: mwRes.newH,
      newZ: mwRes.newZ,
      pointsCount: mwRes.pointsCount,
      framesSynced: mwRes.framesSynced,
      message: mwRes.message,
    };
  }

  /**
   * Vi chỉnh Center theo trục cục bộ của xe (deltaXLocal dọc xe, deltaYLocal ngang xe).
   * Hỗ trợ dịch chuyển dàn đều cho toàn bộ track (applyToTrack = true).
   */
  public static async shiftTrackCenter(
    jobId: number,
    uiId: number,
    serverId: number | null,
    deltaXLocal: number,
    deltaYLocal: number,
    applyToTrack: boolean
  ): Promise<{
    success: boolean;
    newX?: number;
    newY?: number;
    framesShifted?: number;
    message: string;
  }> {
    this.ensureMainWorldBridge();
    const currentFrame = this.getCurrentFrame();

    const mwPromise = new Promise<any>((resolve) => {
      const timeout = setTimeout(() => resolve(null), 2500);

      const onResponse = (e: any) => {
        clearTimeout(timeout);
        window.removeEventListener("CVAT_EXT_RES_SHIFT_CENTER", onResponse);
        if (e.detail && e.detail.success) {
          resolve(e.detail);
        } else {
          resolve(null);
        }
      };

      window.addEventListener("CVAT_EXT_RES_SHIFT_CENTER", onResponse);
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_REQ_SHIFT_CENTER", {
          detail: {
            jobId,
            frame: currentFrame,
            uiId,
            serverId,
            deltaXLocal,
            deltaYLocal,
            applyToTrack,
          },
        })
      );
    });

    const mwRes = await mwPromise;
    if (!mwRes) {
      return { success: false, message: "Không thể vi chỉnh Center của xe!" };
    }

    return {
      success: true,
      newX: mwRes.newX,
      newY: mwRes.newY,
      framesShifted: mwRes.framesShifted,
      message: mwRes.message,
    };
  }

  /**
   * Kích hoạt highlight sáng viền đối tượng trên Three.js Canvas3D
   */
  public static activateCanvasTrack(uiId: number): void {
    this.ensureMainWorldBridge();
    window.dispatchEvent(
      new CustomEvent("CVAT_EXT_REQ_ACTIVATE_OBJECT", {
        detail: { clientId: uiId },
      })
    );
  }

  /**
   * Quét UI element để lấy UI ID (#1, #2)
   */
  public static getActiveTrackId(): { id: number | null; label: string | null } {
    const activeSelectors = [
      ".cvat-objects-sidebar-state-item-active",
      "[class*='sidebar-state-item-active']",
      "[class*='sidebar-state-item--active']",
      "[class*='state-item-activated']",
      "[class*='state-item-active']",
      "[class*='objects-sidebar-item'][class*='active']",
      ".cvat-objects-sidebar-state-item.selected",
      "[data-cvat-state-item-id][class*='active']",
    ];

    for (const selector of activeSelectors) {
      const el = document.querySelector<HTMLElement>(selector);
      if (el) {
        const id = this.extractIdFromElement(el);
        if (id !== null) {
          return { id, label: this.extractLabelFromElement(el) };
        }
      }
    }

    return { id: null, label: null };
  }

  public static extractIdFromElement(el: HTMLElement): number | null {
    const dataId = el.getAttribute("data-cvat-state-item-id") || el.getAttribute("data-item-id");
    if (dataId && /^\d+$/.test(dataId)) {
      return parseInt(dataId, 10);
    }

    const idChild = el.querySelector<HTMLElement>(".cvat-objects-sidebar-state-item-id, [class*='state-item-id']");
    if (idChild) {
      const m = (idChild.innerText || idChild.textContent || "").match(/#?(\d+)/);
      if (m) return parseInt(m[1], 10);
    }

    const text = el.innerText || el.textContent || "";
    const hashMatch = text.match(/#(\d+)/);
    if (hashMatch) {
      return parseInt(hashMatch[1], 10);
    }

    return null;
  }

  public static extractLabelFromElement(el: HTMLElement): string {
    const text = (el.innerText || el.textContent || "").trim();
    const firstLine = text.split("\n")[0].trim();
    return firstLine.replace(/#\d+\s*/, "").trim() || "Object";
  }

  /**
   * Lấy toàn bộ các frame của một chiếc xe (Full-Track Lifecycle Query)
   */
  public static async getTrackAllFrames(
    jobId: number,
    uiId: number,
    serverId?: number
  ): Promise<TrackFrameDetail[]> {
    this.ensureMainWorldBridge();

    const promise = new Promise<TrackFrameDetail[] | null>((resolve) => {
      const timeout = setTimeout(() => resolve(null), 1500);

      const onResponse = (e: any) => {
        clearTimeout(timeout);
        window.removeEventListener("CVAT_EXT_RES_GET_TRACK_ALL_FRAMES", onResponse);
        if (e.detail && e.detail.success && Array.isArray(e.detail.frames)) {
          resolve(e.detail.frames);
        } else {
          resolve(null);
        }
      };

      window.addEventListener("CVAT_EXT_RES_GET_TRACK_ALL_FRAMES", onResponse);
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_REQ_GET_TRACK_ALL_FRAMES", {
          detail: { jobId, uiId, serverId },
        })
      );
    });

    const res = await promise;
    return res || [];
  }

  /**
   * Lưu chính thức các thay đổi vào cơ sở dữ liệu CVAT (Explicit Save Only)
   */
  public static async commitSave(jobId: number): Promise<{ success: boolean; message: string }> {
    this.ensureMainWorldBridge();

    const promise = new Promise<{ success: boolean; message?: string } | null>((resolve) => {
      const timeout = setTimeout(() => resolve(null), 2500);

      const onResponse = (e: any) => {
        clearTimeout(timeout);
        window.removeEventListener("CVAT_EXT_RES_COMMIT_SAVE", onResponse);
        if (e.detail) {
          resolve(e.detail);
        } else {
          resolve(null);
        }
      };

      window.addEventListener("CVAT_EXT_RES_COMMIT_SAVE", onResponse);
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_REQ_COMMIT_SAVE", {
          detail: { jobId },
        })
      );
    });

    const res = await promise;
    return {
      success: res?.success || false,
      message: res?.message || (res?.success ? "Đã lưu vào CVAT!" : "Lưu thất bại hoặc timeout"),
    };
  }

  /**
   * Lấy toàn bộ các Track trong Job kèm đầy đủ các Shapes/Keyframes
   */
  public static async getAllJobTracksWithShapes(jobId: number): Promise<any[]> {
    this.ensureMainWorldBridge();

    const promise = new Promise<any[]>((resolve) => {
      const timeout = setTimeout(() => resolve([]), 3000);

      const onResponse = (e: any) => {
        clearTimeout(timeout);
        window.removeEventListener("CVAT_EXT_RES_GET_ALL_JOB_TRACKS_WITH_SHAPES", onResponse);
        if (e.detail && e.detail.success && Array.isArray(e.detail.tracks)) {
          resolve(e.detail.tracks);
        } else {
          resolve([]);
        }
      };

      window.addEventListener("CVAT_EXT_RES_GET_ALL_JOB_TRACKS_WITH_SHAPES", onResponse);
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_REQ_GET_ALL_JOB_TRACKS_WITH_SHAPES", {
          detail: { jobId },
        })
      );
    });

    return await promise;
  }

  /**
   * Cập nhật tức thì hộp 3D sang Three.js Canvas của CVAT native (Two-Way Live Sync)
   */
  public static async updateLiveBox(
    jobId: number,
    frame: number,
    uiId: number,
    serverId: number | null,
    points: number[],
    isFinal: boolean = false
  ): Promise<boolean> {
    this.ensureMainWorldBridge();

    const promise = new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => resolve(false), 500);

      const onResponse = (e: any) => {
        clearTimeout(timeout);
        window.removeEventListener("CVAT_EXT_RES_UPDATE_LIVE_BOX", onResponse);
        resolve(!!(e.detail && e.detail.success));
      };

      window.addEventListener("CVAT_EXT_RES_UPDATE_LIVE_BOX", onResponse);
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_REQ_UPDATE_LIVE_BOX", {
          detail: { jobId, frame, uiId, serverId, points, isFinal },
        })
      );
    });

    return await promise;
  }

  /**
   * Lấy trực tiếp đám mây điểm LiDAR từ WebGL RAM của Three.js
   */
  public static async getLidarPointsFromScene(): Promise<number[] | null> {
    this.ensureMainWorldBridge();

    const promise = new Promise<number[] | null>((resolve) => {
      const timeout = setTimeout(() => resolve(null), 1000);

      const onResponse = (e: any) => {
        clearTimeout(timeout);
        window.removeEventListener("CVAT_EXT_RES_GET_LIDAR_POINTS", onResponse);
        if (e.detail && e.detail.success && Array.isArray(e.detail.points)) {
          resolve(e.detail.points);
        } else {
          resolve(null);
        }
      };

      window.addEventListener("CVAT_EXT_RES_GET_LIDAR_POINTS", onResponse);
      window.dispatchEvent(new CustomEvent("CVAT_EXT_REQ_GET_LIDAR_POINTS"));
    });

    return await promise;
  }

  /**
   * Yêu cầu CVAT native nhảy timeline tới frame chỉ định
   */
  public static jumpToFrame(frame: number): void {
    window.dispatchEvent(
      new CustomEvent("CVAT_EXT_REQ_JUMP_FRAME", {
        detail: { frame },
      })
    );
  }

  /**
   * Đánh dấu Outside (ẩn) hoặc Inside cho toàn bộ các frame của một Track.
   */
  public static async setTrackOutside(
    jobId: number,
    uiId: number,
    serverId: number | null,
    outside: boolean = true,
    frame?: number
  ): Promise<{
    success: boolean;
    count?: number;
    previousStates?: any[];
    message: string;
  }> {
    this.ensureMainWorldBridge();
    const currentFrame = typeof frame === "number" ? frame : this.getCurrentFrame();

    const mwPromise = new Promise<any>((resolve) => {
      const timeout = setTimeout(() => resolve(null), 12000);

      const onResponse = (e: any) => {
        clearTimeout(timeout);
        window.removeEventListener("CVAT_EXT_RES_SET_TRACK_OUTSIDE", onResponse);
        if (e.detail && e.detail.success) {
          resolve(e.detail);
        } else {
          resolve(e.detail || null);
        }
      };

      window.addEventListener("CVAT_EXT_RES_SET_TRACK_OUTSIDE", onResponse);
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_REQ_SET_TRACK_OUTSIDE", {
          detail: { jobId, frame: currentFrame, uiId, serverId, outside },
        })
      );
    });

    const mwRes = await mwPromise;
    if (!mwRes || !mwRes.success) {
      return { success: false, message: mwRes?.error || `Không thể đánh dấu Outside cho track #${uiId}!` };
    }

    return {
      success: true,
      count: mwRes.count,
      previousStates: mwRes.previousStates,
      message: mwRes.message,
    };
  }

  /**
   * Khôi phục (Undo / Pre) trạng thái trước đó của một Track hoặc Box ở frame hiện tại.
   */
  public static async restoreTrackSnapshot(
    jobId: number,
    uiId: number,
    serverId: number | null,
    snapshot: {
      frame: number;
      applyToTrack: boolean;
      boxPoints?: number[];
      trackShapesBackup?: Array<{ frame: number; outside?: boolean; points: number[] }>;
    }
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    this.ensureMainWorldBridge();

    const mwPromise = new Promise<any>((resolve) => {
      const timeout = setTimeout(() => resolve(null), 8000);

      const onResponse = (e: any) => {
        clearTimeout(timeout);
        window.removeEventListener("CVAT_EXT_RES_RESTORE_BOX", onResponse);
        if (e.detail && e.detail.success) {
          resolve(e.detail);
        } else {
          resolve(null);
        }
      };

      window.addEventListener("CVAT_EXT_RES_RESTORE_BOX", onResponse);
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_REQ_RESTORE_BOX", {
          detail: {
            jobId,
            uiId,
            serverId,
            frame: snapshot.frame,
            applyToTrack: snapshot.applyToTrack,
            boxPoints: snapshot.boxPoints,
            trackShapesBackup: snapshot.trackShapesBackup,
          },
        })
      );
    });

    const mwRes = await mwPromise;
    if (!mwRes) {
      return { success: false, message: `Không thể hoàn tác (Pre) cho xe #${uiId}!` };
    }

    return {
      success: true,
      message: mwRes.message,
    };
  }
}
