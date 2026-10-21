var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
(function() {
  "use strict";
  const KNOWN_CVAT_DOMAINS = [
    "localhost",
    "127.0.0.1"
  ];
  function isKnownCVATDomain(hostname) {
    if (hostname.includes("cvat")) {
      return true;
    }
    for (const domain of KNOWN_CVAT_DOMAINS) {
      if (hostname === domain || hostname.endsWith(`.${domain}`)) {
        return true;
      }
    }
    return false;
  }
  function parseUrlIds(pathname) {
    let taskId = null;
    let jobId = null;
    const taskMatch = pathname.match(/\/tasks\/(\d+)/i);
    if (taskMatch) {
      taskId = parseInt(taskMatch[1], 10);
    }
    const jobMatch = pathname.match(/\/jobs\/(\d+)/i);
    if (jobMatch) {
      jobId = parseInt(jobMatch[1], 10);
    }
    return { taskId, jobId };
  }
  function checkDOMMarkers() {
    const cvatSelectors = [
      "#cvat_canvas_wrapper",
      "#cvat-objects-sidebar",
      ".cvat-header",
      ".cvat-annotation-header",
      ".cvat-player",
      ".cvat-canvas-container",
      ".cvat-canvas3d-perspective"
    ];
    for (const selector of cvatSelectors) {
      if (document.querySelector(selector)) {
        return true;
      }
    }
    const title = document.title || "";
    if (/cvat|computer vision annotation/i.test(title)) {
      return true;
    }
    const win = window;
    if (typeof win.cvat !== "undefined") {
      return true;
    }
    return false;
  }
  function checkIf3DWorkspace() {
    const selectors3D = [
      ".cvat-canvas3d-perspective",
      ".cvat-canvas3d-topview",
      ".cvat-canvas3d-sideview",
      ".cvat-canvas3d-frontview",
      "[id^='cvat_canvas3d']"
    ];
    for (const selector of selectors3D) {
      if (document.querySelector(selector)) {
        return true;
      }
    }
    const canvasElements = document.querySelectorAll("canvas");
    for (const canvas of canvasElements) {
      if (canvas.classList.contains("cvat-canvas3d") || canvas.id.includes("3d")) {
        return true;
      }
    }
    return false;
  }
  function detectCVAT() {
    const origin = window.location.origin;
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;
    const { taskId, jobId } = parseUrlIds(pathname);
    const isKnownDomain = isKnownCVATDomain(hostname);
    const hasUrlPattern = jobId !== null || pathname.includes("/tasks/") || pathname.includes("/jobs/");
    const hasDOMMarker = checkDOMMarkers();
    const isCVAT = isKnownDomain || hasUrlPattern || hasDOMMarker;
    if (!isCVAT) {
      return {
        isCVAT: false,
        isJob: false,
        is3D: false,
        baseUrl: origin,
        taskId: null,
        jobId: null,
        statusMessage: "Không phát hiện CVAT trên trang web này."
      };
    }
    const isJob = jobId !== null;
    const is3D = checkIf3DWorkspace();
    let statusMessage = "Đã nhận diện CVAT.";
    if (isJob && is3D) {
      statusMessage = `Đã kết nối Job 3D #${jobId} (Task #${taskId || "N/A"}).`;
    } else if (isJob) {
      statusMessage = `Đang ở Job #${jobId} (Đang chờ nạp 3D Canvas...).`;
    } else {
      statusMessage = "Đang ở trang quản lý CVAT (Chưa mở Job gán nhãn).";
    }
    return {
      isCVAT: true,
      isJob,
      is3D,
      baseUrl: origin,
      taskId,
      jobId,
      statusMessage
    };
  }
  const ICONS = {
    // Thanh kéo thả
    grip: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>`,
    // Icon thẻ Tag / Bounding Box phẳng
    box: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>`,
    // Module Tabs
    ruler: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.3 15.3-7.6-7.6a2 2 0 0 0-2.8 0L2.7 15.9a2 2 0 0 0 0 2.8l2.6 2.6a2 2 0 0 0 2.8 0l8.2-8.2"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/></svg>`,
    compass: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>`,
    alignBottom: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="12" x="8" y="4" rx="1"/><path d="M4 20h16"/></svg>`,
    // Điều hướng Track
    chevronLeft: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`,
    chevronRight: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`,
    refresh: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`,
    flip: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 7 5 5-5 5V7"/><path d="m21 7-5 5 5 5V7"/><path d="M12 20v2"/><path d="M12 14v2"/><path d="M12 8v2"/><path d="M12 2v2"/></svg>`,
    // Thao tác Kích thước & Fit
    save: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg>`,
    tightFit: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14v6h6"/><path d="M20 10V4h-6"/><path d="m14 10 7-7"/><path d="m3 21 7-7"/></svg>`,
    sparkles: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/></svg>`,
    link: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
    // Địa hình & Ghim mặt đất
    road: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19 8 5"/><path d="m16 5 4 14"/><path d="M12 8v2"/><path d="M12 14v2"/></svg>`,
    curb: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17h6v-6h12"/><path d="M3 21h18"/></svg>`,
    layers: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
    // Cửa sổ & Điều khiển
    minimize: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/></svg>`,
    // Trạng thái Toast
    checkCircle: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>`,
    infoCircle: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
    alertCircle: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>`,
    xCircle: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>`
  };
  function flipYaw(currentYaw) {
    let newYaw = currentYaw + Math.PI;
    while (newYaw > Math.PI) {
      newYaw -= 2 * Math.PI;
    }
    while (newYaw < -Math.PI) {
      newYaw += 2 * Math.PI;
    }
    return newYaw;
  }
  function radToDeg(rad) {
    return Number((rad * 180 / Math.PI).toFixed(2));
  }
  function pointsToBox(points) {
    return {
      c: [points[0], points[1], points[2]],
      r: [points[3], points[4], points[5]],
      s: [points[6], points[7], points[8]]
    };
  }
  function boxToPoints(box, basePoints) {
    const out = basePoints ? basePoints.slice() : new Array(16).fill(0);
    while (out.length < 16) out.push(0);
    out[0] = Number(box.c[0].toFixed(4));
    out[1] = Number(box.c[1].toFixed(4));
    out[2] = Number(box.c[2].toFixed(4));
    out[3] = Number(box.r[0].toFixed(5));
    out[4] = Number(box.r[1].toFixed(5));
    out[5] = Number(box.r[2].toFixed(5));
    out[6] = Number(box.s[0].toFixed(4));
    out[7] = Number(box.s[1].toFixed(4));
    out[8] = Number(box.s[2].toFixed(4));
    return out;
  }
  function cloneBox(box) {
    return {
      c: [box.c[0], box.c[1], box.c[2]],
      r: [box.r[0], box.r[1], box.r[2]],
      s: [box.s[0], box.s[1], box.s[2]]
    };
  }
  function axes(r) {
    const a = Math.cos(r[0]), b = Math.sin(r[0]);
    const c = Math.cos(r[1]), d = Math.sin(r[1]);
    const e = Math.cos(r[2]), f = Math.sin(r[2]);
    const ae = a * e, af = a * f, be = b * e, bf = b * f;
    return {
      ex: [c * e, af + be * d, bf - ae * d],
      ey: [-c * f, ae - bf * d, be + af * d],
      ez: [d, -b * c, a * c]
    };
  }
  const addVec = (u, v) => [
    u[0] + v[0],
    u[1] + v[1],
    u[2] + v[2]
  ];
  const scaleVec = (u, k) => [
    u[0] * k,
    u[1] * k,
    u[2] * k
  ];
  function localToWorld(q, c, ax) {
    return addVec(
      c,
      addVec(
        scaleVec(ax.ex, q[0]),
        addVec(scaleVec(ax.ey, q[1]), scaleVec(ax.ez, q[2]))
      )
    );
  }
  function boxCorners(box) {
    const ax = axes(box.r);
    const [hx, hy, hz] = box.s.map((v) => v / 2);
    const out = [];
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          out.push(localToWorld([sx * hx, sy * hy, sz * hz], box.c, ax));
        }
      }
    }
    return out;
  }
  const BOX_EDGES = [
    [0, 1],
    [2, 3],
    [4, 5],
    [6, 7],
    // dọc z
    [0, 2],
    [1, 3],
    [4, 6],
    [5, 7],
    // dọc y
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7]
    // dọc x
  ];
  function resizeKeepBottom(box, newSize) {
    const out = cloneBox(box);
    const ax = axes(box.r);
    const dh = (newSize[2] - box.s[2]) / 2;
    out.c = addVec(box.c, scaleVec(ax.ez, dh));
    out.s = [newSize[0], newSize[1], newSize[2]];
    return out;
  }
  function findAngleDiff(rightAngle, leftAngle) {
    let angleDiff = rightAngle - leftAngle;
    angleDiff = (angleDiff + 180) % 360 - 180;
    if (Math.abs(angleDiff) >= 180) {
      angleDiff = 360 - Math.abs(angleDiff) * Math.sign(angleDiff) * -1;
    }
    return angleDiff;
  }
  function interpolatePoints(left, right, offset) {
    const out = left.map((v, i) => v + (right[i] - v) * offset);
    const angles = left.slice(3, 6).concat(right.slice(3, 6)).map((a) => a < 0 ? a + Math.PI * 2 : a).map((a) => a * (180 / Math.PI));
    for (let i = 0; i < 3; i++) {
      let angle = (angles[i] + findAngleDiff(angles[i + 3], angles[i]) * offset) * (Math.PI / 180);
      if (angle > Math.PI) angle -= Math.PI * 2;
      out[3 + i] = angle;
    }
    return out;
  }
  if (typeof globalThis !== "undefined") {
    globalThis.boxCorners = boxCorners;
    globalThis.BOX_EDGES = BOX_EDGES;
  }
  if (typeof window !== "undefined") {
    window.boxCorners = boxCorners;
    window.BOX_EDGES = BOX_EDGES;
  }
  function mainWorldScript() {
    if (window.__CVAT_3D_SUITE_INJECTED__) return;
    window.__CVAT_3D_SUITE_INJECTED__ = true;
    console.log("[CVAT 3D Suite] Main-World Injected Bridge đã sẵn sàng (LiDAR Point Cloud Engine, Auto-Fit & Canvas Select).");
    function flipYawRad(yaw) {
      let newYaw = yaw + Math.PI;
      while (newYaw > Math.PI) newYaw -= 2 * Math.PI;
      while (newYaw < -Math.PI) newYaw += 2 * Math.PI;
      return newYaw;
    }
    function getReduxStore() {
      var _a, _b;
      const rootEl = document.getElementById("root");
      if (!rootEl) return null;
      const rKey = Object.keys(rootEl).find(
        (k) => k.startsWith("__reactContainer$") || k.startsWith("__reactFiber$")
      );
      if (!rKey) return null;
      let rNode = rootEl[rKey];
      while (rNode) {
        if ((_a = rNode.memoizedProps) == null ? void 0 : _a.store) return rNode.memoizedProps.store;
        if ((_b = rNode.stateNode) == null ? void 0 : _b.store) return rNode.stateNode.store;
        rNode = rNode.child;
      }
      return null;
    }
    async function getActiveJobInstance(jobId) {
      var _a, _b, _c;
      const store = getReduxStore();
      const storeJob = (_c = (_b = (_a = store == null ? void 0 : store.getState()) == null ? void 0 : _a.annotation) == null ? void 0 : _b.job) == null ? void 0 : _c.instance;
      if (storeJob) {
        return storeJob;
      }
      const win = window;
      if (win.cvat && win.cvat.jobs && jobId) {
        const jobs = await win.cvat.jobs.get({ jobID: jobId });
        if (jobs && jobs.length > 0) return jobs[0];
      }
      return null;
    }
    function getSceneLidarPoints() {
      var _a, _b, _c, _d, _e, _f;
      try {
        const store = getReduxStore();
        const canvas = (_c = (_b = (_a = store == null ? void 0 : store.getState()) == null ? void 0 : _a.annotation) == null ? void 0 : _b.canvas) == null ? void 0 : _c.instance;
        const pScene = (_f = (_e = (_d = canvas == null ? void 0 : canvas.view) == null ? void 0 : _d.views) == null ? void 0 : _e.perspective) == null ? void 0 : _f.scene;
        if (!pScene) return null;
        let found = null;
        pScene.traverse((obj) => {
          var _a2, _b2, _c2;
          if ((obj.isPoints || obj.type === "Points") && ((_c2 = (_b2 = (_a2 = obj.geometry) == null ? void 0 : _a2.attributes) == null ? void 0 : _b2.position) == null ? void 0 : _c2.count) > 5e3) {
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
    function detectAccurateGroundZ(cx, cy, cz, yaw, halfL, halfW, isInitialBox = false) {
      const lidar = getSceneLidarPoints();
      if (!lidar || lidar.count === 0) {
        return { groundZ: null, pitchRad: 0, rollRad: 0, pitchDeg: 0, rollDeg: 0, groundPointsCount: 0 };
      }
      const { count, array } = lidar;
      const cosY = Math.cos(-yaw);
      const sinY = Math.sin(-yaw);
      const groundPts = [];
      const outerL = isInitialBox ? 3.5 : halfL + 1.3;
      const outerW = isInitialBox ? 2.8 : halfW + 1.3;
      const innerL = isInitialBox ? 0.3 : Math.max(0.4, halfL - 0.2);
      const innerW = isInitialBox ? 0.3 : Math.max(0.3, halfW - 0.2);
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
        const inOuter = Math.abs(lx) <= outerL && Math.abs(ly) <= outerW;
        const inCore = !isInitialBox && Math.abs(lx) < innerL && Math.abs(ly) < innerW;
        if (inOuter && !inCore) {
          groundPts.push({ lx, ly, z });
        }
      }
      if (groundPts.length < 5) {
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
      const allZ = groundPts.map((p) => p.z).sort((a, b) => a - b);
      const minZ = allZ[0];
      const maxZ = allZ[allZ.length - 1];
      const binSize = 0.02;
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
      const roadSurfacePts = groundPts.filter((p) => Math.abs(p.z - peakZ) <= 0.06);
      const fitPts = roadSurfacePts.length >= 4 ? roadSurfacePts : groundPts;
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
      let c0 = peakZ;
      if (Math.abs(det) > 1e-4) {
        const a = (covLxZ * varLy - covLyZ * covLxLy) / det;
        const b = (covLyZ * varLx - covLxZ * covLxLy) / det;
        const maxPitchRad = 20 * Math.PI / 180;
        const maxRollRad = 25 * Math.PI / 180;
        pitchRad = Math.max(-maxPitchRad, Math.min(maxPitchRad, -Math.atan(a)));
        rollRad = Math.max(-maxRollRad, Math.min(maxRollRad, Math.atan(b)));
        c0 = meanZ - a * meanLx - b * meanLy;
      }
      return {
        groundZ: Number(c0.toFixed(3)),
        pitchRad: Number(pitchRad.toFixed(5)),
        rollRad: Number(rollRad.toFixed(5)),
        pitchDeg: Number((pitchRad * 180 / Math.PI).toFixed(2)),
        rollDeg: Number((rollRad * 180 / Math.PI).toFixed(2)),
        groundPointsCount: fitPts.length
      };
    }
    function computeLidarGroundAndFit(points, fitMode = "tight") {
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
          pointsCount: 0
        };
      }
      const { count, array } = lidar;
      const isInitialBox = l <= 2.2 || w <= 1.3;
      const halfL = isInitialBox ? 3 : l / 2 + 0.35;
      const halfW = isInitialBox ? 2 : w / 2 + 0.35;
      const groundInfo = detectAccurateGroundZ(cx, cy, cz, yaw, l / 2, w / 2, isInitialBox);
      const detectedGroundZ = groundInfo.groundZ;
      const effectiveGroundZ = detectedGroundZ !== null ? detectedGroundZ : cz - h / 2;
      let cosY = Math.cos(-yaw);
      let sinY = Math.sin(-yaw);
      const candidateBodyPts = [];
      const maxRoofZ = effectiveGroundZ + 2.7;
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
      if (candidateBodyPts.length >= 10) {
        const localBodyPts = [];
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
          newL = Number(Math.max(1.5, Math.min(18, measuredL)).toFixed(2));
          newW = Number(Math.max(1, Math.min(3.2, measuredW)).toFixed(2));
          newH = Number(Math.max(1, Math.min(4, measuredH)).toFixed(2));
          if (isInitialBox) {
            if (newL < 3.2) newL = 4.65;
            if (newW < 1.4) newW = 1.85;
            if (newH < 1.2) newH = 1.55;
          }
          const midLx = (lxMin + lxMax) / 2;
          const midLy = (lyMin + lyMax) / 2;
          const cosWorld = Math.cos(newYaw);
          const sinWorld = Math.sin(newYaw);
          newX = Number((cx + midLx * cosWorld - midLy * sinWorld).toFixed(2));
          newY = Number((cy + midLx * sinWorld + midLy * cosWorld).toFixed(2));
          newZ = Number((effectiveGroundZ + newH / 2).toFixed(3));
        } else {
          if (measuredL >= 3) {
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
        pointsCount: candidateBodyPts.length
      };
    }
    function updateThreeJsCuboid(uiId, newYaw, newPos, newScale, newRot) {
      var _a, _b, _c, _d;
      try {
        const store = getReduxStore();
        const canvas = (_c = (_b = (_a = store == null ? void 0 : store.getState()) == null ? void 0 : _a.annotation) == null ? void 0 : _b.canvas) == null ? void 0 : _c.instance;
        if (!canvas || !canvas.view || !canvas.view.drawnObjects) {
          return false;
        }
        const drawnItem = canvas.view.drawnObjects[String(uiId)];
        if (!drawnItem) {
          return false;
        }
        if (drawnItem.data && Array.isArray(drawnItem.data.points)) {
          if (newYaw !== void 0) {
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
        const cuboid = drawnItem.cuboid;
        if (cuboid) {
          if (newRot && typeof cuboid.setRotation === "function") {
            cuboid.setRotation(newRot.rx, newRot.ry, newRot.rz);
          } else if (newYaw !== void 0 && typeof cuboid.setRotation === "function") {
            const curRot = (_d = cuboid.perspective) == null ? void 0 : _d.rotation;
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
    function extractObjectDetails(clientId) {
      var _a, _b, _c, _d, _e, _f, _g;
      try {
        const store = getReduxStore();
        const anno = (_a = store == null ? void 0 : store.getState()) == null ? void 0 : _a.annotation;
        const canvas = (_b = anno == null ? void 0 : anno.canvas) == null ? void 0 : _b.instance;
        const drawnItem = (_d = (_c = canvas == null ? void 0 : canvas.view) == null ? void 0 : _c.drawnObjects) == null ? void 0 : _d[String(clientId)];
        if (drawnItem && drawnItem.data && Array.isArray(drawnItem.data.points)) {
          const p = drawnItem.data.points;
          return {
            clientId,
            serverId: drawnItem.data.serverID || null,
            label: ((_e = drawnItem.data.label) == null ? void 0 : _e.name) || "Car",
            x: Number(p[0].toFixed(2)),
            y: Number(p[1].toFixed(2)),
            z: Number(p[2].toFixed(3)),
            yawDeg: Math.round(p[5] * 180 / Math.PI),
            l: Number(p[6].toFixed(2)),
            w: Number(p[7].toFixed(2)),
            h: Number(p[8].toFixed(2)),
            points: [...p]
          };
        }
        const states = ((_f = anno == null ? void 0 : anno.annotations) == null ? void 0 : _f.states) || [];
        const matched = states.find((s) => s.clientID === clientId);
        if (matched && Array.isArray(matched.points)) {
          const p = matched.points;
          return {
            clientId,
            serverId: matched.serverID || null,
            label: ((_g = matched.label) == null ? void 0 : _g.name) || "Car",
            x: Number(p[0].toFixed(2)),
            y: Number(p[1].toFixed(2)),
            z: Number(p[2].toFixed(3)),
            yawDeg: Math.round(p[5] * 180 / Math.PI),
            l: Number(p[6].toFixed(2)),
            w: Number(p[7].toFixed(2)),
            h: Number(p[8].toFixed(2)),
            points: [...p]
          };
        }
      } catch (e) {
      }
      return null;
    }
    async function findTargetSafely(job, frame, uiId, serverId) {
      var _a, _b, _c, _d, _e;
      if (job && job.annotations) {
        try {
          const annotations = await job.annotations.get(frame);
          const found = annotations.find(
            (s) => s.clientID === uiId || serverId && s.serverID === serverId
          );
          if (found) return { target: found, isDrawn: false };
        } catch (e) {
        }
      }
      const store = getReduxStore();
      const canvas = (_c = (_b = (_a = store == null ? void 0 : store.getState()) == null ? void 0 : _a.annotation) == null ? void 0 : _b.canvas) == null ? void 0 : _c.instance;
      const drawnItem = (_e = (_d = canvas == null ? void 0 : canvas.view) == null ? void 0 : _d.drawnObjects) == null ? void 0 : _e[String(uiId)];
      if (drawnItem && drawnItem.data && Array.isArray(drawnItem.data.points)) {
        return { target: drawnItem.data, isDrawn: true };
      }
      throw new Error(`Không tìm thấy xe #${uiId} tại Frame #${frame}`);
    }
    function toArray(val) {
      if (!val) return [];
      if (Array.isArray(val)) return val;
      if (val instanceof Map || val instanceof Set) return Array.from(val.values());
      if (typeof val === "object") {
        const values = Object.values(val);
        if (values.length > 0 && typeof values[0] === "object") return values;
      }
      return [];
    }
    function getJobTrackCollection(job) {
      var _a, _b, _c, _d, _e;
      if (!job) return [];
      const list = [];
      const anno = job.annotations;
      if (anno) {
        const col = anno._collection || anno.collection;
        if (col) {
          list.push(...toArray(col.tracks));
        }
      }
      if (job.tracks) {
        list.push(...toArray(job.tracks));
      }
      try {
        const store = getReduxStore();
        const storeJob = (_c = (_b = (_a = store == null ? void 0 : store.getState()) == null ? void 0 : _a.annotation) == null ? void 0 : _b.job) == null ? void 0 : _c.instance;
        const storeCol = ((_d = storeJob == null ? void 0 : storeJob.annotations) == null ? void 0 : _d._collection) || ((_e = storeJob == null ? void 0 : storeJob.annotations) == null ? void 0 : _e.collection);
        if (storeCol) {
          list.push(...toArray(storeCol.tracks));
        }
      } catch (e) {
      }
      return list;
    }
    async function findTrackInJob(job, uiId, serverId, parentID) {
      if (!job) return null;
      const tracks = getJobTrackCollection(job);
      if (tracks && tracks.length > 0) {
        let found = tracks.find((t) => t.clientID === uiId);
        if (found) return found;
        if (serverId) {
          found = tracks.find((t) => t.serverID === serverId);
          if (found) return found;
        }
        if (parentID) {
          found = tracks.find((t) => t.clientID === parentID);
          if (found) return found;
        }
        found = tracks.find((t) => {
          const shList = toArray(t.shapes || t.keyframes);
          return shList.some((sh) => sh.clientID === uiId);
        });
        if (found) return found;
      }
      if (job.annotations) {
        try {
          const allObjects = await job.annotations.get(null, true);
          if (Array.isArray(allObjects)) {
            let found = allObjects.find((t) => t.clientID === uiId);
            if (found) return found;
            if (serverId) {
              found = allObjects.find((t) => t.serverID === serverId);
              if (found) return found;
            }
            if (parentID) {
              found = allObjects.find((t) => t.clientID === parentID);
              if (found) return found;
            }
          }
        } catch (e) {
        }
        try {
          const defaultTracks = await job.annotations.get();
          if (Array.isArray(defaultTracks)) {
            let found = defaultTracks.find((t) => t.clientID === uiId);
            if (found) return found;
            if (serverId) {
              found = defaultTracks.find((t) => t.serverID === serverId);
              if (found) return found;
            }
            if (parentID) {
              found = defaultTracks.find((t) => t.clientID === parentID);
              if (found) return found;
            }
          }
        } catch (e) {
        }
      }
      return null;
    }
    async function persistJobAnnotations(job) {
      try {
        if (job && job.annotations && typeof job.annotations.save === "function") {
          await job.annotations.save();
          console.log("[CVAT 3D Suite] Đã lưu thành công lên database CVAT qua cvat-core API.");
        }
      } catch (err) {
        console.warn("[CVAT 3D Suite] Ghi nhận thay đổi cvat-core:", err);
      }
      setTimeout(() => {
        try {
          const cvatSaveBtn = document.querySelector(
            "button.cvat-annotation-header-save-button, .cvat-annotation-header-save-button, button[aria-label='Save annotations']"
          );
          if (cvatSaveBtn && !cvatSaveBtn.disabled && !cvatSaveBtn.classList.contains("cvat-disabled-button")) {
            cvatSaveBtn.click();
            console.log("[CVAT 3D Suite] Đã kích hoạt AutoSave trên giao diện CVAT Header.");
          }
        } catch (e) {
        }
      }, 120);
    }
    function setupCanvasAutoSelect() {
      const canvasContainers = document.querySelectorAll(
        ".cvat-canvas-container, .cvat-canvas3d-orthographic-view"
      );
      canvasContainers.forEach((container) => {
        container.addEventListener("pointerup", () => {
          setTimeout(() => {
            var _a, _b, _c, _d, _e, _f, _g;
            try {
              const store = getReduxStore();
              const canvas = (_c = (_b = (_a = store == null ? void 0 : store.getState()) == null ? void 0 : _a.annotation) == null ? void 0 : _b.canvas) == null ? void 0 : _c.instance;
              const activeId = ((_d = canvas == null ? void 0 : canvas.view) == null ? void 0 : _d.activatedElementID) || ((_g = (_f = (_e = store == null ? void 0 : store.getState()) == null ? void 0 : _e.annotation) == null ? void 0 : _f.annotations) == null ? void 0 : _g.activatedStateClientID);
              if (activeId !== null && activeId !== void 0) {
                const details = extractObjectDetails(Number(activeId));
                window.dispatchEvent(
                  new CustomEvent("CVAT_EXT_RES_OBJECT_ACTIVATED", {
                    detail: { clientId: Number(activeId), details }
                  })
                );
              }
            } catch (e) {
            }
          }, 80);
        });
      });
      document.addEventListener("click", (e) => {
        const target = e.target;
        const sidebarItem = target.closest(
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
                  detail: { clientId: id, details }
                })
              );
            }
          }, 60);
        }
      });
      try {
        const store = getReduxStore();
        if (store) {
          let prevActiveId = null;
          let prevStatesLen = 0;
          store.subscribe(() => {
            var _a, _b, _c, _d;
            try {
              const anno = (_a = store.getState()) == null ? void 0 : _a.annotation;
              const curActiveId = (_b = anno == null ? void 0 : anno.annotations) == null ? void 0 : _b.activatedStateClientID;
              const curStatesLen = ((_d = (_c = anno == null ? void 0 : anno.annotations) == null ? void 0 : _c.states) == null ? void 0 : _d.length) || 0;
              if (curActiveId !== prevActiveId) {
                prevActiveId = curActiveId;
                if (curActiveId !== null && curActiveId !== void 0) {
                  const details = extractObjectDetails(Number(curActiveId));
                  window.dispatchEvent(
                    new CustomEvent("CVAT_EXT_RES_OBJECT_ACTIVATED", {
                      detail: { clientId: Number(curActiveId), details }
                    })
                  );
                }
              }
              if (curStatesLen !== prevStatesLen) {
                prevStatesLen = curStatesLen;
                window.dispatchEvent(new CustomEvent("CVAT_EXT_RES_FRAME_TRACKS_DIRTY"));
              }
            } catch (err) {
            }
          });
        }
      } catch (sErr) {
      }
      window.addEventListener("CVAT_EXT_REQ_ACTIVATE_OBJECT", (e) => {
        var _a, _b, _c;
        const { clientId } = e.detail || {};
        try {
          const store = getReduxStore();
          const canvas = (_c = (_b = (_a = store == null ? void 0 : store.getState()) == null ? void 0 : _a.annotation) == null ? void 0 : _b.canvas) == null ? void 0 : _c.instance;
          if (canvas && typeof canvas.activate === "function") {
            canvas.activate(clientId);
            if (typeof canvas.render === "function") {
              canvas.render();
            }
          }
        } catch (err) {
        }
      });
    }
    setTimeout(() => setupCanvasAutoSelect(), 1500);
    window.addEventListener("CVAT_EXT_REQ_FRAME_TRACKS", async (e) => {
      const { jobId, frame } = e.detail || {};
      try {
        const job = await getActiveJobInstance(jobId);
        if (!job) throw new Error("Không tìm thấy Job Instance của CVAT");
        const annotations = await job.annotations.get(frame);
        const list = annotations.filter((s) => s.shapeType === "cuboid" && Array.isArray(s.points) && s.points.length >= 9).map((s) => {
          var _a;
          const p = s.points;
          return {
            uiId: s.clientID,
            // SỐ 1, 2 HIỂN THỊ CHUẨN XÁC 100% TRÊN GIAO DIỆN!
            serverId: s.serverID,
            // SỐ 31, 32 LƯU DƯỚI CƠ SỞ DỮ LIỆU
            label: ((_a = s.label) == null ? void 0 : _a.name) || "Car",
            x: Number(p[0].toFixed(2)),
            y: Number(p[1].toFixed(2)),
            z: Number(p[2].toFixed(3)),
            yawDeg: Math.round(p[5] * 180 / Math.PI),
            l: Number(p[6].toFixed(2)),
            w: Number(p[7].toFixed(2)),
            h: Number(p[8].toFixed(2))
          };
        });
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_RES_FRAME_TRACKS", {
            detail: { success: true, frame, list }
          })
        );
      } catch (err) {
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_RES_FRAME_TRACKS", {
            detail: { success: false, error: err.message || String(err) }
          })
        );
      }
    });
    window.addEventListener("CVAT_EXT_REQ_GET_TRACK_ALL_FRAMES", async (e) => {
      var _a, _b;
      const { jobId, uiId, serverId } = e.detail || {};
      try {
        const job = await getActiveJobInstance(jobId);
        if (!job) throw new Error("Không tìm thấy Job Instance của CVAT");
        const framesMap = /* @__PURE__ */ new Map();
        const parentTrack = await findTrackInJob(job, uiId, serverId);
        const trackLabel = ((_a = parentTrack == null ? void 0 : parentTrack.label) == null ? void 0 : _a.name) || "Vehicle";
        if (parentTrack) {
          const shapes = toArray(parentTrack.shapes || parentTrack.keyframes);
          for (const sh of shapes) {
            if (sh.shapeType === "cuboid" && Array.isArray(sh.points) && sh.points.length >= 9) {
              framesMap.set(sh.frame, {
                frame: sh.frame,
                isKeyframe: true,
                outside: !!sh.outside,
                points: [...sh.points],
                label: trackLabel
              });
            }
          }
        }
        const startF = typeof job.startFrame === "number" ? job.startFrame : 0;
        const stopF = typeof job.stopFrame === "number" ? job.stopFrame : startF + 100;
        for (let f = startF; f <= stopF; f++) {
          try {
            const states = await job.annotations.get(f);
            if (Array.isArray(states)) {
              const st = states.find(
                (s) => s.clientID === uiId || serverId && s.serverID === serverId
              );
              if (st && Array.isArray(st.points) && st.points.length >= 9) {
                const existing = framesMap.get(f);
                framesMap.set(f, {
                  frame: f,
                  isKeyframe: existing ? existing.isKeyframe : !!st.keyframe,
                  outside: !!st.outside,
                  points: [...st.points],
                  label: ((_b = st.label) == null ? void 0 : _b.name) || trackLabel
                });
              }
            }
          } catch (e2) {
          }
        }
        const framesList = Array.from(framesMap.values()).sort((a, b) => a.frame - b.frame);
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_RES_GET_TRACK_ALL_FRAMES", {
            detail: { success: true, uiId, serverId, frames: framesList }
          })
        );
      } catch (err) {
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_RES_GET_TRACK_ALL_FRAMES", {
            detail: { success: false, error: err.message || String(err) }
          })
        );
      }
    });
    window.addEventListener("CVAT_EXT_REQ_GET_ALL_JOB_TRACKS_WITH_SHAPES", async (e) => {
      var _a, _b, _c, _d, _e, _f;
      const { jobId } = e.detail || {};
      try {
        const job = await getActiveJobInstance(jobId);
        if (!job) throw new Error("Không tìm thấy Job Instance của CVAT");
        const rawTracks = getJobTrackCollection(job);
        const startF = typeof job.startFrame === "number" ? job.startFrame : 0;
        const stopF = typeof job.stopFrame === "number" ? job.stopFrame : startF + 100;
        const trackMap = /* @__PURE__ */ new Map();
        for (const t of rawTracks) {
          if (!t.clientID) continue;
          const shList = toArray(t.shapes || t.keyframes);
          const shapes = shList.filter((s) => s.shapeType === "cuboid" && Array.isArray(s.points) && s.points.length >= 9).map((s) => ({
            type: "cuboid",
            frame: s.frame,
            points: [...s.points],
            outside: !!s.outside,
            occluded: !!s.occluded,
            z_order: s.zOrder || 0,
            rotation: 0
          }));
          trackMap.set(t.clientID, {
            id: t.clientID,
            clientID: t.clientID,
            serverID: t.serverID || null,
            labelId: ((_a = t.label) == null ? void 0 : _a.id) || 1,
            labelName: ((_b = t.label) == null ? void 0 : _b.name) || "Car",
            labelColor: ((_c = t.label) == null ? void 0 : _c.color) || "#38bdf8",
            shapes
          });
        }
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
                    labelId: ((_d = st.label) == null ? void 0 : _d.id) || 1,
                    labelName: ((_e = st.label) == null ? void 0 : _e.name) || "Car",
                    labelColor: ((_f = st.label) == null ? void 0 : _f.color) || "#38bdf8",
                    shapes: []
                  };
                  trackMap.set(st.clientID, t);
                }
                if (st.keyframe && !t.shapes.some((s) => s.frame === f)) {
                  t.shapes.push({
                    type: "cuboid",
                    frame: f,
                    points: [...st.points],
                    outside: !!st.outside,
                    occluded: !!st.occluded,
                    z_order: st.zOrder || 0,
                    rotation: 0
                  });
                }
              }
            }
          } catch (e2) {
          }
        }
        const result = Array.from(trackMap.values()).map((t) => {
          t.shapes.sort((a, b) => a.frame - b.frame);
          return t;
        });
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_RES_GET_ALL_JOB_TRACKS_WITH_SHAPES", {
            detail: { success: true, tracks: result }
          })
        );
      } catch (err) {
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_RES_GET_ALL_JOB_TRACKS_WITH_SHAPES", {
            detail: { success: false, error: err.message || String(err) }
          })
        );
      }
    });
    window.addEventListener("CVAT_EXT_REQ_UPDATE_LIVE_BOX", async (e) => {
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
        updateThreeJsCuboid(
          uiId,
          points[5],
          { x: points[0], y: points[1], z: points[2] },
          { l: points[6], w: points[7], h: points[8] },
          { rx: points[3] || 0, ry: points[4] || 0, rz: points[5] }
        );
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_RES_UPDATE_LIVE_BOX", {
            detail: { success: true, uiId, frame }
          })
        );
      } catch (err) {
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_RES_UPDATE_LIVE_BOX", {
            detail: { success: false, error: err.message || String(err) }
          })
        );
      }
    });
    window.addEventListener("CVAT_EXT_REQ_GET_LIDAR_POINTS", (_e) => {
      try {
        const lidar = getSceneLidarPoints();
        if (!lidar || !lidar.array) {
          window.dispatchEvent(
            new CustomEvent("CVAT_EXT_RES_GET_LIDAR_POINTS", {
              detail: { success: false, error: "Không tìm thấy buffer điểm LiDAR trong Three.js scene" }
            })
          );
          return;
        }
        const step = Math.max(1, Math.floor(lidar.count / 4e4));
        const sampled = [];
        const arr = lidar.array;
        for (let i = 0; i < lidar.count; i += step) {
          sampled.push(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]);
        }
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_RES_GET_LIDAR_POINTS", {
            detail: { success: true, points: sampled, totalCount: lidar.count }
          })
        );
      } catch (err) {
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_RES_GET_LIDAR_POINTS", {
            detail: { success: false, error: err.message || String(err) }
          })
        );
      }
    });
    window.addEventListener("CVAT_EXT_REQ_JUMP_FRAME", (e) => {
      try {
        const { frame } = e.detail || {};
        if (typeof frame !== "number") return;
        const store = getReduxStore();
        if (store) {
          try {
            store.dispatch({ type: "CHANGE_FRAME", payload: { frame } });
          } catch (err) {
          }
        }
        const frameInput = document.querySelector("input.cvat-player-frame-selector");
        if (frameInput) {
          frameInput.value = String(frame);
          frameInput.dispatchEvent(new Event("change", { bubbles: true }));
          frameInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true }));
        }
      } catch (e2) {
        console.warn("[CVAT 3D Suite] Lỗi Jump Frame:", e2);
      }
    });
    window.addEventListener("CVAT_EXT_REQ_COMMIT_SAVE", async (e) => {
      const { jobId } = e.detail || {};
      try {
        const job = await getActiveJobInstance(jobId);
        if (!job) throw new Error("Không tìm thấy Job Instance của CVAT");
        await persistJobAnnotations(job);
        window.__CVAT_HAS_UNSAVED_CHANGES__ = false;
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_RES_COMMIT_SAVE", {
            detail: { success: true, message: "Đã lưu toàn bộ thay đổi vào cơ sở dữ liệu CVAT thành công!" }
          })
        );
      } catch (err) {
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_RES_COMMIT_SAVE", {
            detail: { success: false, error: err.message || String(err) }
          })
        );
      }
    });
    window.addEventListener("CVAT_EXT_REQ_FLIP_YAW", async (e) => {
      const { jobId, frame, uiId, serverId, currentFrameOnly, customYawRad } = e.detail || {};
      try {
        const job = await getActiveJobInstance(jobId);
        const { target, isDrawn } = await findTargetSafely(job, frame, uiId, serverId);
        const oldYaw = target.points[5];
        const newYaw = customYawRad !== void 0 ? customYawRad : flipYawRad(oldYaw);
        const newPoints = [...target.points];
        newPoints[5] = newYaw;
        target.points = newPoints;
        if (!isDrawn && typeof target.save === "function") {
          await target.save();
        }
        const threeUpdated = updateThreeJsCuboid(uiId, newYaw);
        if (currentFrameOnly === false && job) {
          try {
            const parentTrack = await findTrackInJob(job, uiId, serverId, target.parentID);
            if (parentTrack) {
              const shapes = toArray(parentTrack.shapes || parentTrack.keyframes);
              for (const sh of shapes) {
                if (sh.shapeType === "cuboid" && Array.isArray(sh.points) && sh.points.length >= 9) {
                  const shPoints = [...sh.points];
                  shPoints[5] = customYawRad !== void 0 ? customYawRad : flipYawRad(shPoints[5]);
                  sh.points = shPoints;
                }
              }
              if (typeof parentTrack.save === "function") {
                await parentTrack.save();
              }
            }
            const startF = typeof job.startFrame === "number" ? job.startFrame : 0;
            const stopF = typeof job.stopFrame === "number" ? job.stopFrame : startF + 100;
            for (let f = startF; f <= stopF; f++) {
              if (f === frame) continue;
              try {
                const states = await job.annotations.get(f);
                if (Array.isArray(states)) {
                  const st = states.find(
                    (s) => s.clientID === uiId || serverId && s.serverID === serverId
                  );
                  if (st && Array.isArray(st.points) && st.points.length >= 9) {
                    const p = [...st.points];
                    p[5] = customYawRad !== void 0 ? customYawRad : flipYawRad(p[5]);
                    st.points = p;
                    if (typeof st.save === "function") {
                      await st.save();
                    }
                  }
                }
              } catch (e2) {
              }
            }
          } catch (tErr) {
            console.warn("[CVAT 3D Suite] Lưu Yaw cho các frame khác trong track:", tErr);
          }
        }
        window.__CVAT_HAS_UNSAVED_CHANGES__ = true;
        const newYawDeg = Math.round(newYaw * 180 / Math.PI);
        console.log(`[CVAT 3D Suite] Đã cập nhật xe #${uiId} sang Yaw: ${newYawDeg}° (Three.js Realtime: ${threeUpdated})`);
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_RES_FLIP_YAW", {
            detail: { success: true, uiId, newYawDeg }
          })
        );
      } catch (err) {
        console.error("[CVAT 3D Suite] Lỗi Flip Yaw trong Main World:", err);
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_RES_FLIP_YAW", {
            detail: { success: false, error: err.message || String(err) }
          })
        );
      }
    });
    window.addEventListener("CVAT_EXT_REQ_UPDATE_DIMENSIONS", async (e) => {
      const { jobId, frame, uiId, serverId, l, w, h, applyToTrack } = e.detail || {};
      try {
        const job = await getActiveJobInstance(jobId);
        const { target, isDrawn } = await findTargetSafely(job, frame, uiId, serverId);
        const computeGroundLockOffset = (p, targetH) => {
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
            dz: Number((dh * cosRx * cosRy).toFixed(3))
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
        updateThreeJsCuboid(
          uiId,
          void 0,
          { x: newPoints[0], y: newPoints[1], z: newPoints[2] },
          { l, w, h }
        );
        let trackCount = 1;
        const startF = typeof job.startFrame === "number" ? job.startFrame : 0;
        const stopF = typeof job.stopFrame === "number" ? job.stopFrame : startF + 100;
        if (applyToTrack === true && job) {
          try {
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
            for (let f = startF; f <= stopF; f++) {
              if (f === frame) continue;
              try {
                const states = await job.annotations.get(f);
                if (Array.isArray(states)) {
                  const st = states.find(
                    (s) => s.clientID === uiId || serverId && s.serverID === serverId
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
              } catch (e2) {
              }
            }
          } catch (tErr) {
            console.warn("[CVAT 3D Suite] Lưu các frame khác trong track:", tErr);
          }
        }
        window.__CVAT_HAS_UNSAVED_CHANGES__ = true;
        const scopeText = applyToTrack ? `toàn bộ track (từ Frame #${startF} ➔ #${stopF}, ${trackCount} frames, Realtime)` : `chỉ frame #${frame}`;
        const msg = `Đã cập nhật xe #${uiId} kích thước ${l}x${w}x${h}m cho ${scopeText}`;
        console.log(`[CVAT 3D Suite] ${msg} (Three.js Re-rendered Realtime)`);
        const newZ = newPoints[2];
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_RES_UPDATE_DIMENSIONS", {
            detail: { success: true, uiId, newZ, l, w, h, applyToTrack, message: msg }
          })
        );
      } catch (err) {
        console.error("[CVAT 3D Suite] Lỗi Update Dimensions trong Main World:", err);
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_RES_UPDATE_DIMENSIONS", {
            detail: { success: false, error: err.message || String(err) }
          })
        );
      }
    });
    window.addEventListener("CVAT_EXT_REQ_LOCK_DIMENSIONS", async (e) => {
      const detail = { ...e.detail || {}, applyToTrack: false };
      window.dispatchEvent(new CustomEvent("CVAT_EXT_REQ_UPDATE_DIMENSIONS", { detail }));
    });
    window.addEventListener("CVAT_EXT_REQ_SNAP_GROUND", async (e) => {
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
          const curL = newPoints[6] || 4.6;
          const curW2 = newPoints[7] || 1.85;
          const groundInfo = detectAccurateGroundZ(curX, curY, curZ, curRz, curL / 2, curW2 / 2, false);
          if (groundInfo.groundZ !== null) {
            const cosSlope = Math.cos(groundInfo.rollRad) * Math.cos(groundInfo.pitchRad);
            newZ = Number((groundInfo.groundZ + curH / 2 * cosSlope).toFixed(3));
            newRotX = groundInfo.rollRad;
            newRotY = groundInfo.pitchRad;
            msg = `Đã ghim đáy xe #${uiId} bám dốc mặt đường (Z: ${newZ}m, Dốc dọc Pitch: ${groundInfo.pitchDeg}°, Dốc ngang Roll: ${groundInfo.rollDeg}°)`;
          } else {
            const roadBottomZ = targetGroundZ !== void 0 ? targetGroundZ : curZ - curH / 2;
            newZ = Number((roadBottomZ + curH / 2).toFixed(3));
            newRotX = 0;
            newRotY = 0;
            msg = `Đã ghim đáy xe #${uiId} sát mặt đường (Z: ${newZ}m)`;
          }
        } else if (mode === "curb") {
          const offset = curbHeight !== void 0 ? curbHeight : 0.15;
          newZ = Number((curZ + offset).toFixed(3));
          msg = `Đã ghim đáy xe #${uiId} lên nền vỉa hè (+${Math.round(offset * 100)}cm ➔ Z: ${newZ}m)`;
        } else if (mode === "half_curb") {
          const cH = curbHeight !== void 0 ? curbHeight : 0.15;
          const ratio = Math.max(-1, Math.min(1, cH / curW));
          const rollRad = Math.asin(ratio);
          const deltaZ = cH / 2;
          newZ = Number((curZ + deltaZ).toFixed(3));
          newRotX = Number(rollRad.toFixed(5));
          const rollDeg = Math.round(rollRad * 180 / Math.PI);
          msg = `Đã gác lề xe #${uiId} (Nghiêng Roll: ${rollDeg}°, Nâng Z: +${Math.round(deltaZ * 100)}cm)`;
        } else if (mode === "micro_adjust") {
          const dCm = deltaCm !== void 0 ? deltaCm : 1;
          newZ = Number((curZ + dCm / 100).toFixed(3));
          msg = `Đã vi chỉnh cao độ xe #${uiId} (${dCm > 0 ? "+" : ""}${dCm}cm ➔ Z: ${newZ}m)`;
        } else if (mode === "micro_adjust_pitch") {
          const dDeg = deltaDeg !== void 0 ? deltaDeg : 0.5;
          const dRad = dDeg * Math.PI / 180;
          newRotY = Number((curRy + dRad).toFixed(5));
          const pitchDeg = Number((newRotY * 180 / Math.PI).toFixed(2));
          msg = `Đã vi chỉnh dốc Side xe #${uiId} (${dDeg > 0 ? "+" : ""}${dDeg}° ➔ Pitch: ${pitchDeg}°)`;
        } else if (mode === "micro_adjust_roll") {
          const dDeg = deltaDeg !== void 0 ? deltaDeg : 0.5;
          const dRad = dDeg * Math.PI / 180;
          newRotX = Number((curRx + dRad).toFixed(5));
          const rollDeg = Number((newRotX * 180 / Math.PI).toFixed(2));
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
          void 0,
          { x: curX, y: curY, z: newZ },
          void 0,
          { rx: newRotX, ry: newRotY, rz: curRz }
        );
        window.__CVAT_HAS_UNSAVED_CHANGES__ = true;
        console.log(`[CVAT 3D Suite] ${msg} (Three.js Side/Front Re-rendered Realtime)`);
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_RES_SNAP_GROUND", {
            detail: { success: true, uiId, newZ, mode, message: msg }
          })
        );
      } catch (err) {
        console.error("[CVAT 3D Suite] Lỗi Snap Ground trong Main World:", err);
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_RES_SNAP_GROUND", {
            detail: { success: false, error: err.message || String(err) }
          })
        );
      }
    });
    window.addEventListener("CVAT_EXT_REQ_AUTO_FIT", async (e) => {
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
        if (fit.newYaw !== void 0) {
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
        const startF = typeof job.startFrame === "number" ? job.startFrame : 0;
        const stopF = typeof job.stopFrame === "number" ? job.stopFrame : startF + 100;
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
            for (let f = startF; f <= stopF; f++) {
              if (f === frame) continue;
              try {
                const states = await job.annotations.get(f);
                if (Array.isArray(states)) {
                  const st = states.find(
                    (s) => s.clientID === uiId || serverId && s.serverID === serverId
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
              } catch (e2) {
              }
            }
          } catch (tErr) {
            console.warn("[CVAT 3D Suite] Lưu các frame khác trong track:", tErr);
          }
        }
        window.__CVAT_HAS_UNSAVED_CHANGES__ = true;
        const scopeText = applyToTrack ? `toàn bộ track (từ Frame #${startF} ➔ #${stopF}, ${trackCount} frames, Realtime)` : `chỉ frame #${frame}`;
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
              message: msg
            }
          })
        );
      } catch (err) {
        console.error("[CVAT 3D Suite] Lỗi Auto-Fit Box:", err);
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_RES_AUTO_FIT", {
            detail: { success: false, error: err.message || String(err) }
          })
        );
      }
    });
    window.addEventListener("CVAT_EXT_REQ_ALIGN_BOX_TO_POINTS", async (e) => {
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
        const groundInfo = detectAccurateGroundZ(curX, curY, curZ, curYaw, curL / 2, curW / 2, false);
        const effectiveGroundZ = groundInfo.groundZ !== null ? groundInfo.groundZ : curZ - curH / 2;
        const { count, array } = lidar;
        const cosY = Math.cos(-curYaw);
        const sinY = Math.sin(-curYaw);
        const halfL = curL / 2 + 0.35;
        const halfW = curW / 2 + 0.35;
        const minBodyZ = effectiveGroundZ + 0.03;
        const maxRoofZ = effectiveGroundZ + curH + 0.25;
        const bodyPts = [];
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
        newPoints[6] = curL;
        newPoints[7] = curW;
        newPoints[8] = curH;
        target.points = newPoints;
        if (!isDrawn && typeof target.save === "function") {
          await target.save();
        }
        updateThreeJsCuboid(
          uiId,
          void 0,
          { x: newX, y: newY, z: newZ },
          void 0,
          { rx: newRotX, ry: newRotY, rz: curYaw }
        );
        window.__CVAT_HAS_UNSAVED_CHANGES__ = true;
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
              message: msg
            }
          })
        );
      } catch (err) {
        console.error("[CVAT 3D Suite] Lỗi Align Box to Points:", err);
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_RES_ALIGN_BOX_TO_POINTS", {
            detail: { success: false, error: err.message || String(err) }
          })
        );
      }
    });
    window.addEventListener("CVAT_EXT_REQ_MULTI_FRAME_ANCHOR_FIT", async (e) => {
      const { jobId, frame, uiId, serverId } = e.detail || {};
      try {
        const job = await getActiveJobInstance(jobId);
        const { target, isDrawn } = await findTargetSafely(job, frame, uiId, serverId);
        const parentTrack = await findTrackInJob(job, uiId, serverId, target.parentID);
        let bestFrame = frame;
        let optL = target.points[6] || 4.65;
        let optW = target.points[7] || 1.85;
        let optH = target.points[8] || 1.45;
        let bestScore = 0;
        let framesSynced = 1;
        const currentFit = computeLidarGroundAndFit(target.points, "catalog");
        if (currentFit.pointsCount > 0) {
          optL = currentFit.newL;
          optW = currentFit.newW;
          optH = currentFit.newH;
          bestScore = currentFit.pointsCount;
        }
        if (parentTrack && Array.isArray(parentTrack.shapes) && parentTrack.shapes.length > 1) {
          const cuboidShapes = parentTrack.shapes.filter(
            (s) => s.shapeType === "cuboid" && Array.isArray(s.points) && s.points.length >= 9
          );
          const trackFrames = cuboidShapes.map((s) => s.frame).sort((a, b) => a - b);
          console.log(`[CVAT 3D Suite] Đang khảo sát ${trackFrames.length} frames của xe #${uiId} (Frames: ${trackFrames.join(", ")})...`);
          const switchFrameDom = async (f) => {
            const frameInput = document.querySelector(
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
          const sampleFrames = [];
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
          for (const f of sampleFrames) {
            if (f === frame) continue;
            try {
              await switchFrameDom(f);
              const lidarF = getSceneLidarPoints();
              if (lidarF && lidarF.count > 0) {
                const shapeF = cuboidShapes.find((s) => s.frame === f);
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
          if (bestFrame !== frame) {
            await switchFrameDom(frame);
          }
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
        window.__CVAT_HAS_UNSAVED_CHANGES__ = true;
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
              message: msg
            }
          })
        );
      } catch (err) {
        console.error("[CVAT 3D Suite] Lỗi Multi-Frame Anchor Fit:", err);
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_RES_MULTI_FRAME_ANCHOR_FIT", {
            detail: { success: false, error: err.message || String(err) }
          })
        );
      }
    });
  }
  class CVATBridge {
    /**
     * Khởi tạo cầu nối vào Main World của CVAT
     */
    static ensureMainWorldBridge() {
      if (this.isBridgeInjected || document.getElementById("cvat-3d-suite-main-bridge")) {
        this.isBridgeInjected = true;
        return;
      }
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
    static getCsrfToken() {
      const cookies = document.cookie.split(";");
      for (const c of cookies) {
        const trimmed = c.trim();
        if (trimmed.startsWith("csrftoken=")) {
          return decodeURIComponent(trimmed.substring("csrftoken=".length));
        }
      }
      const metaTag = document.querySelector('meta[name="csrf-token"], meta[name="csrf"]');
      if (metaTag && metaTag.content) {
        return metaTag.content;
      }
      return "";
    }
    /**
     * Tạo bộ Header chuẩn HTTP gửi lên CVAT REST API kèm CSRF Token chống lỗi 403 Forbidden.
     */
    static getApiHeaders(isWrite = false) {
      const headers = {
        Accept: "application/vnd.cvat+json, application/json, */*"
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
    static getCurrentFrame() {
      const frameInput = document.querySelector(
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
      const allInputs = document.querySelectorAll("input[type='number'], input.ant-input-number-input");
      for (const inp of allInputs) {
        const val = parseInt(inp.value, 10);
        if (!isNaN(val) && val >= 0 && val < 5e4) {
          return val;
        }
      }
      return 0;
    }
    /**
     * Tải toàn bộ danh sách các Track trong Job từ API CVAT.
     */
    static async fetchJobAnnotations(jobId, forceRefresh = false) {
      const now = Date.now();
      if (!forceRefresh && this.cachedAnnotations && this.cachedJobId === jobId && now - this.lastFetchTime < 3e3) {
        return this.cachedAnnotations;
      }
      const url = `${window.location.origin}/api/jobs/${jobId}/annotations/`;
      const response = await fetch(url, {
        method: "GET",
        headers: this.getApiHeaders(false),
        credentials: "include"
      });
      if (!response.ok) {
        throw new Error(`Lỗi tải annotations Job #${jobId} (HTTP ${response.status})`);
      }
      const data = await response.json();
      this.cachedAnnotations = data;
      this.cachedJobId = jobId;
      this.lastFetchTime = now;
      return data;
    }
    /**
     * Lấy danh sách TẤT CẢ các Track ID CÓ MẶT TẠI FRAME HIỆN TẠI.
     * Ưu tiên lấy trực tiếp từ Main World để có UI ID chuẩn (#1, #2), nếu chưa có thì fallback API.
     */
    static async getTracksInCurrentFrame(jobId, frame) {
      this.ensureMainWorldBridge();
      const promise = new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 700);
        const onResponse = (e) => {
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
      if (mainWorldList && mainWorldList.length > 0) {
        return mainWorldList;
      }
      try {
        const data = await this.fetchJobAnnotations(jobId);
        const tracks = data.tracks || [];
        const result = [];
        tracks.forEach((t, index) => {
          var _a;
          const shapes = Array.isArray(t.shapes) ? t.shapes : [];
          const matchShape = shapes.find((s) => s.frame === frame && s.type === "cuboid");
          if (matchShape && Array.isArray(matchShape.points) && matchShape.points.length >= 9) {
            const p = matchShape.points;
            const label = t.label_name || ((_a = t.attributes) == null ? void 0 : _a.label) || `Track #${index + 1}`;
            result.push({
              uiId: index + 1,
              // SỐ 1, 2 KHỚP 100% VỚI MẮT NHÌN CỦA ANNOTATOR!
              serverId: t.id,
              // 31, 32 LƯU DƯỚI DATABASE
              label,
              x: Number(p[0].toFixed(2)),
              y: Number(p[1].toFixed(2)),
              z: Number(p[2].toFixed(3)),
              yawDeg: Math.round(radToDeg(p[5])),
              l: Number(p[6].toFixed(2)),
              w: Number(p[7].toFixed(2)),
              h: Number(p[8].toFixed(2))
            });
          }
        });
        return result.sort((a, b) => a.uiId - b.uiId);
      } catch (err) {
        console.warn("[CVATBridge] Lỗi lọc track theo frame:", err);
        return [];
      }
    }
    /**
     * Lật hướng Yaw 180° cho Track (REALTIME TRÊN THREE.JS CANVAS, LƯU NGẦM SERVER, ZERO-F5).
     */
    static async flipTrackYaw(jobId, uiId, serverId, currentFrameOnly) {
      this.ensureMainWorldBridge();
      const currentFrame = this.getCurrentFrame();
      const mainWorldPromise = new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 800);
        const onResponse = (e) => {
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
            detail: { jobId, frame: currentFrame, uiId, serverId, currentFrameOnly }
          })
        );
      });
      const mwRes = await mainWorldPromise;
      const finalYawDeg = (mwRes == null ? void 0 : mwRes.newYawDeg) !== void 0 ? mwRes.newYawDeg : Math.round(radToDeg(flipYaw(0)));
      return {
        success: true,
        newYawDeg: finalYawDeg,
        message: (mwRes == null ? void 0 : mwRes.message) || `Đã lật 180° xe #${uiId} (Yaw mới: ${finalYawDeg}°) • Realtime 100%`
      };
    }
    /**
     * Cập nhật kích thước (L, W, H) linh hoạt cho xe:
     * Hỗ trợ áp dụng chỉ Frame hiện tại hoặc Đồng bộ cho Toàn bộ Track.
     * Dữ liệu được lưu trực tiếp vào cvat-core thông qua Main World Bridge (Realtime 100%).
     */
    static async updateTrackDimensions(jobId, uiId, serverId, l, w, h, applyToTrack = false) {
      this.ensureMainWorldBridge();
      const currentFrame = this.getCurrentFrame();
      const mwPromise = new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 1200);
        const onResponse = (e) => {
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
            detail: { jobId, frame: currentFrame, uiId, serverId, l, w, h, applyToTrack }
          })
        );
      });
      const mwRes = await mwPromise;
      const lastZ = (mwRes == null ? void 0 : mwRes.newZ) !== void 0 ? mwRes.newZ : 0;
      const scope = applyToTrack ? "toàn bộ track" : `frame #${currentFrame}`;
      return {
        success: true,
        newZ: Number(lastZ.toFixed(3)),
        l,
        w,
        h,
        message: (mwRes == null ? void 0 : mwRes.message) || `Đã cập nhật xe #${uiId} (${l}x${w}x${h}m cho ${scope})`
      };
    }
    /**
     * Khóa kích thước theo Preset Catalog (Backward compatible).
     */
    static async lockTrackDimensions(jobId, uiId, serverId, targetL, targetW, targetH, applyToTrack = false) {
      const res = await this.updateTrackDimensions(jobId, uiId, serverId, targetL, targetW, targetH, applyToTrack);
      return {
        success: res.success,
        newZ: res.newZ,
        message: res.message
      };
    }
    /**
     * Ghim Mặt Đất & Địa Hình Vỉa Hè (Ground & Curb Snapping Realtime 100%, ZERO-F5).
     * Hỗ trợ toàn diện Side View và Front View.
     */
    static async snapTrackToGround(jobId, uiId, serverId, mode, params) {
      this.ensureMainWorldBridge();
      const currentFrame = this.getCurrentFrame();
      const mwPromise = new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 800);
        const onResponse = (e) => {
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
              deltaCm: params == null ? void 0 : params.deltaCm,
              deltaDeg: params == null ? void 0 : params.deltaDeg,
              curbHeight: params == null ? void 0 : params.curbHeight,
              targetGroundZ: params == null ? void 0 : params.targetGroundZ
            }
          })
        );
      });
      const mwRes = await mwPromise;
      const lastZ = (mwRes == null ? void 0 : mwRes.newZ) !== void 0 ? mwRes.newZ : 0;
      return {
        success: true,
        newZ: Number(lastZ.toFixed(3)),
        message: (mwRes == null ? void 0 : mwRes.message) || `Đã cập nhật cao độ xe #${uiId} (Z: ${Number(lastZ.toFixed(3))}m)`
      };
    }
    /**
     * Tự động Fit Box ôm khít đám mây điểm LiDAR và ghim sát mặt đất thực tế.
     * Hỗ trợ áp dụng chỉ Frame hiện tại hoặc Toàn bộ Track.
     */
    static async autoFitTrack(jobId, uiId, serverId, tightFit = false, applyToTrack = false, fitMode = "tight") {
      this.ensureMainWorldBridge();
      const currentFrame = this.getCurrentFrame();
      const mwPromise = new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 1e3);
        const onResponse = (e) => {
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
            detail: { jobId, frame: currentFrame, uiId, serverId, tightFit, fitMode, applyToTrack }
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
        message: mwRes.message || `Đã fit box xe #${uiId} ôm khít điểm LiDAR`
      };
    }
    /**
     * Căn Hộp Bám Cụm Điểm BẢO TOÀN KÍCH THƯỚC (Preserving Dimensions Box Alignment).
     * Tự động bay tới ôm trọn cụm điểm mà TUYỆT ĐỐI GIỮ NGUYÊN kích thước L, W, H của xe.
     */
    static async alignBoxToPoints(jobId, uiId, serverId) {
      this.ensureMainWorldBridge();
      const currentFrame = this.getCurrentFrame();
      const mwPromise = new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 1200);
        const onResponse = (e) => {
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
            detail: { jobId, frame: currentFrame, uiId, serverId }
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
        message: mwRes.message || `Đã căn hộp bám cụm điểm và giữ nguyên kích thước`
      };
    }
    /**
     * Quét mốc chuẩn đẹp nhất và tự động fit đồng bộ toàn bộ track.
     */
    static async smartAnchorTrackFit(jobId, uiId, serverId) {
      this.ensureMainWorldBridge();
      const currentFrame = this.getCurrentFrame();
      const mwPromise = new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 1200);
        const onResponse = (e) => {
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
            detail: { jobId, frame: currentFrame, uiId, serverId }
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
        message: mwRes.message
      };
    }
    /**
     * Kích hoạt highlight sáng viền đối tượng trên Three.js Canvas3D
     */
    static activateCanvasTrack(uiId) {
      this.ensureMainWorldBridge();
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_REQ_ACTIVATE_OBJECT", {
          detail: { clientId: uiId }
        })
      );
    }
    /**
     * Quét UI element để lấy UI ID (#1, #2)
     */
    static getActiveTrackId() {
      const activeSelectors = [
        ".cvat-objects-sidebar-state-item-active",
        "[class*='sidebar-state-item-active']",
        "[class*='sidebar-state-item--active']",
        "[class*='state-item-activated']",
        "[class*='state-item-active']",
        "[class*='objects-sidebar-item'][class*='active']",
        ".cvat-objects-sidebar-state-item.selected",
        "[data-cvat-state-item-id][class*='active']"
      ];
      for (const selector of activeSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          const id = this.extractIdFromElement(el);
          if (id !== null) {
            return { id, label: this.extractLabelFromElement(el) };
          }
        }
      }
      return { id: null, label: null };
    }
    static extractIdFromElement(el) {
      const dataId = el.getAttribute("data-cvat-state-item-id") || el.getAttribute("data-item-id");
      if (dataId && /^\d+$/.test(dataId)) {
        return parseInt(dataId, 10);
      }
      const idChild = el.querySelector(".cvat-objects-sidebar-state-item-id, [class*='state-item-id']");
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
    static extractLabelFromElement(el) {
      const text = (el.innerText || el.textContent || "").trim();
      const firstLine = text.split("\n")[0].trim();
      return firstLine.replace(/#\d+\s*/, "").trim() || "Object";
    }
    /**
     * Lấy toàn bộ các frame của một chiếc xe (Full-Track Lifecycle Query)
     */
    static async getTrackAllFrames(jobId, uiId, serverId) {
      this.ensureMainWorldBridge();
      const promise = new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 1500);
        const onResponse = (e) => {
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
            detail: { jobId, uiId, serverId }
          })
        );
      });
      const res = await promise;
      return res || [];
    }
    /**
     * Lưu chính thức các thay đổi vào cơ sở dữ liệu CVAT (Explicit Save Only)
     */
    static async commitSave(jobId) {
      this.ensureMainWorldBridge();
      const promise = new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 2500);
        const onResponse = (e) => {
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
            detail: { jobId }
          })
        );
      });
      const res = await promise;
      return {
        success: (res == null ? void 0 : res.success) || false,
        message: (res == null ? void 0 : res.message) || ((res == null ? void 0 : res.success) ? "Đã lưu vào CVAT!" : "Lưu thất bại hoặc timeout")
      };
    }
    /**
     * Lấy toàn bộ các Track trong Job kèm đầy đủ các Shapes/Keyframes
     */
    static async getAllJobTracksWithShapes(jobId) {
      this.ensureMainWorldBridge();
      const promise = new Promise((resolve) => {
        const timeout = setTimeout(() => resolve([]), 3e3);
        const onResponse = (e) => {
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
            detail: { jobId }
          })
        );
      });
      return await promise;
    }
    /**
     * Cập nhật tức thì hộp 3D sang Three.js Canvas của CVAT native (Two-Way Live Sync)
     */
    static async updateLiveBox(jobId, frame, uiId, serverId, points, isFinal = false) {
      this.ensureMainWorldBridge();
      const promise = new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(false), 500);
        const onResponse = (e) => {
          clearTimeout(timeout);
          window.removeEventListener("CVAT_EXT_RES_UPDATE_LIVE_BOX", onResponse);
          resolve(!!(e.detail && e.detail.success));
        };
        window.addEventListener("CVAT_EXT_RES_UPDATE_LIVE_BOX", onResponse);
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_REQ_UPDATE_LIVE_BOX", {
            detail: { jobId, frame, uiId, serverId, points, isFinal }
          })
        );
      });
      return await promise;
    }
    /**
     * Lấy trực tiếp đám mây điểm LiDAR từ WebGL RAM của Three.js
     */
    static async getLidarPointsFromScene() {
      this.ensureMainWorldBridge();
      const promise = new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 1e3);
        const onResponse = (e) => {
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
    static jumpToFrame(frame) {
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_REQ_JUMP_FRAME", {
          detail: { frame }
        })
      );
    }
  }
  __publicField(CVATBridge, "cachedAnnotations", null);
  __publicField(CVATBridge, "cachedJobId", null);
  __publicField(CVATBridge, "lastFetchTime", 0);
  __publicField(CVATBridge, "isBridgeInjected", false);
  const STANDARD_VEHICLE_CATALOG = [
    {
      id: "compact_car",
      name: "Compact Car",
      category: "car",
      l: 4.4,
      w: 1.78,
      h: 1.43,
      description: "Xe cỡ nhỏ (Honda Civic, Mazda 3, Kia Cerato)"
    },
    {
      id: "mid_sedan",
      name: "Mid Sedan",
      category: "car",
      l: 4.75,
      w: 1.84,
      h: 1.45,
      description: "Sedan hạng D (Toyota Camry, Honda Accord, Mercedes C-Class)"
    },
    {
      id: "mid_suv",
      name: "Mid-size SUV",
      category: "suv",
      l: 4.65,
      w: 1.86,
      h: 1.68,
      description: "Crossover/SUV 5 chỗ (Honda CR-V, Mazda CX-5, Hyundai Tucson)"
    },
    {
      id: "full_suv",
      name: "Full-size SUV",
      category: "suv",
      l: 5.05,
      w: 1.98,
      h: 1.85,
      description: "SUV 7 chỗ cỡ lớn (Toyota Land Cruiser, Ford Everest, BMW X7)"
    },
    {
      id: "pickup",
      name: "Pickup Truck",
      category: "truck",
      l: 5.35,
      w: 1.9,
      h: 1.82,
      description: "Xe bán tải (Ford Ranger, Toyota Hilux, Mitsubishi Triton)"
    },
    {
      id: "van",
      name: "Minivan / MPV",
      category: "van",
      l: 5.1,
      w: 1.95,
      h: 1.78,
      description: "Xe gia đình 7 chỗ / Van (Kia Carnival, Toyota Sienna)"
    },
    {
      id: "box_truck",
      name: "Box Truck",
      category: "truck",
      l: 6.2,
      w: 2.2,
      h: 2.75,
      description: "Xe tải thùng trung bình"
    },
    {
      id: "bus",
      name: "City Bus",
      category: "bus",
      l: 10.5,
      w: 2.5,
      h: 3.2,
      description: "Xe buýt đô thị"
    },
    {
      id: "motorcycle",
      name: "Motorcycle / Cyclist",
      category: "cycle",
      l: 1.85,
      w: 0.75,
      h: 1.45,
      description: "Xe máy / Xe đạp"
    },
    {
      id: "pedestrian",
      name: "Pedestrian",
      category: "pedestrian",
      l: 0.6,
      w: 0.6,
      h: 1.7,
      description: "Người đi bộ"
    }
  ];
  function findBestFitCatalog(measuredL, measuredW, measuredH, labelHint) {
    let candidates = STANDARD_VEHICLE_CATALOG;
    if (labelHint) {
      const hint = labelHint.toLowerCase();
      if (hint.includes("bus")) {
        candidates = STANDARD_VEHICLE_CATALOG.filter((c) => c.category === "bus");
      } else if (hint.includes("truck")) {
        candidates = STANDARD_VEHICLE_CATALOG.filter((c) => c.category === "truck");
      } else if (hint.includes("pedestrian")) {
        candidates = STANDARD_VEHICLE_CATALOG.filter((c) => c.category === "pedestrian");
      } else if (hint.includes("cycl") || hint.includes("moto")) {
        candidates = STANDARD_VEHICLE_CATALOG.filter((c) => c.category === "cycle");
      } else if (hint.includes("car") || hint.includes("vehicle")) {
        candidates = STANDARD_VEHICLE_CATALOG.filter(
          (c) => ["car", "suv", "van", "truck"].includes(c.category)
        );
      }
    }
    if (candidates.length === 0) {
      candidates = STANDARD_VEHICLE_CATALOG;
    }
    let bestMatch = candidates[0];
    let minDistance = Infinity;
    for (const item of candidates) {
      const dl = (measuredL - item.l) / item.l;
      const dw = (measuredW - item.w) / item.w;
      const dh = (measuredH - item.h) / item.h;
      const dist = Math.sqrt(2 * dl * dl + 1.5 * dw * dw + 1 * dh * dh);
      if (dist < minDistance) {
        minDistance = dist;
        bestMatch = item;
      }
    }
    const confidence = Math.max(10, Math.min(100, Math.round((1 - minDistance / 2) * 100)));
    let recommendedL = bestMatch.l;
    let recommendedW = bestMatch.w;
    let recommendedH = bestMatch.h;
    if (measuredL >= 3 && measuredL <= 7) {
      recommendedL = Number(Math.max(measuredL, bestMatch.l * 0.95).toFixed(2));
    }
    if (measuredW >= 1.5 && measuredW <= 2.5) {
      recommendedW = Number(Math.max(measuredW, bestMatch.w * 0.95).toFixed(2));
    }
    if (measuredH >= 1.2 && measuredH <= 2.2) {
      recommendedH = Number(measuredH.toFixed(2));
    }
    return {
      matchedItem: bestMatch,
      confidence,
      recommendedL,
      recommendedW,
      recommendedH,
      isCustomRefined: true
    };
  }
  class TrackState {
    constructor(data) {
      __publicField(this, "uiId");
      __publicField(this, "serverId");
      __publicField(this, "labelId");
      __publicField(this, "labelName");
      __publicField(this, "labelColor");
      __publicField(this, "shapes", []);
      __publicField(this, "undoStack", []);
      __publicField(this, "redoStack", []);
      __publicField(this, "dirty", false);
      __publicField(this, "originalShapesJson", "");
      this.uiId = data.clientID;
      this.serverId = data.serverID;
      this.labelId = data.labelId;
      this.labelName = data.labelName || `Label #${data.labelId}`;
      this.labelColor = data.labelColor || "#38bdf8";
      this.load(data.shapes);
    }
    load(shapes) {
      this.shapes = JSON.parse(JSON.stringify(shapes)).sort(
        (a, b) => a.frame - b.frame
      );
      this.originalShapesJson = JSON.stringify(this.shapes);
      this.undoStack = [];
      this.redoStack = [];
      this.dirty = false;
    }
    get firstFrame() {
      return this.shapes.length > 0 ? this.shapes[0].frame : 0;
    }
    get lastFrame() {
      return this.shapes.length > 0 ? this.shapes[this.shapes.length - 1].frame : 0;
    }
    keyframeIndex(frame) {
      return this.shapes.findIndex((s) => s.frame === frame);
    }
    /**
     * Lấy vị trí Box3D tại frame bất kỳ (nội suy tuyến tính nếu nằm giữa các keyframes).
     */
    at(frame) {
      if (this.shapes.length === 0) return null;
      let left = null;
      let right = null;
      for (const s of this.shapes) {
        if (s.frame <= frame) {
          left = s;
        } else {
          right = s;
          break;
        }
      }
      if (left && left.frame === frame) {
        return {
          points: left.points.slice(),
          box: pointsToBox(left.points),
          keyframe: true,
          outside: !!left.outside
        };
      }
      if (left && right) {
        const offset = (frame - left.frame) / (right.frame - left.frame);
        const points = interpolatePoints(left.points, right.points, offset);
        return {
          points,
          box: pointsToBox(points),
          keyframe: false,
          outside: !!left.outside
        };
      }
      const single = left || right;
      if (!single) return null;
      return {
        points: single.points.slice(),
        box: pointsToBox(single.points),
        keyframe: single.frame === frame,
        outside: single === right ? true : !!single.outside
      };
    }
    /**
     * Lưu snapshot vào undo stack trước khi thực hiện chỉnh sửa.
     */
    snapshot() {
      this.undoStack.push(JSON.parse(JSON.stringify(this.shapes)));
      if (this.undoStack.length > 200) {
        this.undoStack.shift();
      }
      this.redoStack = [];
    }
    /**
     * Hoàn tác thao tác gần nhất (Undo).
     */
    undo() {
      if (this.undoStack.length === 0) return false;
      this.redoStack.push(JSON.parse(JSON.stringify(this.shapes)));
      this.shapes = this.undoStack.pop();
      this.dirty = JSON.stringify(this.shapes) !== this.originalShapesJson;
      return true;
    }
    /**
     * Làm lại thao tác vừa hoàn tác (Redo).
     */
    redo() {
      if (this.redoStack.length === 0) return false;
      this.undoStack.push(JSON.parse(JSON.stringify(this.shapes)));
      this.shapes = this.redoStack.pop();
      this.dirty = true;
      return true;
    }
    /**
     * Ghi đè box vào frame cụ thể.
     * Nếu frame đó chưa là keyframe thì tự động tạo keyframe mới tại frame đó.
     */
    setBox(frame, box) {
      const idx = this.keyframeIndex(frame);
      if (idx >= 0) {
        this.shapes[idx].points = boxToPoints(box, this.shapes[idx].points);
      } else {
        const pos = this.at(frame);
        const basePoints = pos ? pos.points : this.shapes[0].points;
        const newPoints = boxToPoints(box, basePoints);
        const newShape = {
          type: "cuboid",
          frame,
          points: newPoints,
          outside: false,
          occluded: false,
          z_order: 0,
          rotation: 0,
          attributes: []
        };
        this.shapes.push(newShape);
        this.shapes.sort((a, b) => a.frame - b.frame);
      }
      this.dirty = true;
    }
    /**
     * Bật/tắt trạng thái Outside tại một frame (phím tắt O).
     */
    setOutside(frame, outside) {
      const idx = this.keyframeIndex(frame);
      if (idx >= 0) {
        this.shapes[idx].outside = outside;
      } else {
        const pos = this.at(frame);
        if (!pos) return;
        this.shapes.push({
          type: "cuboid",
          frame,
          points: pos.points.slice(),
          outside,
          occluded: false,
          z_order: 0,
          rotation: 0,
          attributes: []
        });
        this.shapes.sort((a, b) => a.frame - b.frame);
      }
      this.dirty = true;
    }
    /**
     * Xóa một keyframe tại frame cụ thể (khóa bảo vệ không cho xóa keyframe đầu tiên).
     */
    deleteKeyframe(frame) {
      const idx = this.keyframeIndex(frame);
      if (idx <= 0) return false;
      this.shapes.splice(idx, 1);
      this.dirty = true;
      return true;
    }
  }
  class JobAnnotationStore {
    constructor(jobId) {
      __publicField(this, "jobId");
      __publicField(this, "tracks", /* @__PURE__ */ new Map());
      // key: uiId
      __publicField(this, "history", []);
      // Lưu danh sách uiId của các thao tác để Undo toàn cục
      __publicField(this, "redoHistory", []);
      this.jobId = jobId;
    }
    setTracks(trackList) {
      this.tracks.clear();
      for (const t of trackList) {
        this.tracks.set(t.clientID, new TrackState(t));
      }
      this.history = [];
      this.redoHistory = [];
    }
    getTrack(uiId) {
      return this.tracks.get(uiId);
    }
    getAllTracks() {
      return [...this.tracks.values()].sort((a, b) => a.uiId - b.uiId);
    }
    getDirtyTracks() {
      return this.getAllTracks().filter((t) => t.dirty);
    }
    /**
     * Tạo snapshot cho một hoặc nhiều track trước khi chỉnh sửa.
     */
    snapshot(uiIds) {
      for (const id of uiIds) {
        const t = this.tracks.get(id);
        if (t) t.snapshot();
      }
      this.history.push(uiIds.slice());
      this.redoHistory = [];
    }
    undo() {
      const ids = this.history.pop();
      if (!ids || ids.length === 0) return false;
      for (const id of ids) {
        const t = this.tracks.get(id);
        if (t) t.undo();
      }
      this.redoHistory.push(ids);
      return true;
    }
    redo() {
      const ids = this.redoHistory.pop();
      if (!ids || ids.length === 0) return false;
      for (const id of ids) {
        const t = this.tracks.get(id);
        if (t) t.redo();
      }
      this.history.push(ids);
      return true;
    }
    /**
     * Đánh dấu đã lưu thành công (reset cờ dirty về false).
     */
    markSaved() {
      for (const t of this.tracks.values()) {
        t.dirty = false;
      }
    }
  }
  class TrackStudioModal {
    constructor() {
      __publicField(this, "overlay", null);
      __publicField(this, "currentCtx", null);
      __publicField(this, "currentTab", "active_track");
      __publicField(this, "activeTrackId", 0);
      __publicField(this, "store", null);
      __publicField(this, "allJobTracks", []);
      __publicField(this, "selectedFrame", 0);
      __publicField(this, "isSaving", false);
      this.createOverlay();
      this.attachGlobalHotkeys();
    }
    async open(ctx, activeTrackId, _activeServerId, allJobTracks = []) {
      this.currentCtx = ctx;
      this.activeTrackId = activeTrackId;
      this.allJobTracks = allJobTracks;
      this.selectedFrame = CVATBridge.getCurrentFrame();
      this.currentTab = "active_track";
      if (this.overlay) {
        this.overlay.style.display = "flex";
      }
      await this.loadInitialData();
    }
    close() {
      if (this.overlay) {
        this.overlay.style.display = "none";
      }
    }
    isOpen() {
      return !!(this.overlay && this.overlay.style.display !== "none");
    }
    createOverlay() {
      if (document.getElementById("cvat-3d-track-studio-modal")) return;
      this.overlay = document.createElement("div");
      this.overlay.id = "cvat-3d-track-studio-modal";
      this.overlay.style.position = "fixed";
      this.overlay.style.inset = "0";
      this.overlay.style.zIndex = "999999";
      this.overlay.style.background = "rgba(9, 9, 11, 0.95)";
      this.overlay.style.backdropFilter = "blur(8px)";
      this.overlay.style.color = "#f4f4f5";
      this.overlay.style.display = "none";
      this.overlay.style.flexDirection = "column";
      this.overlay.style.fontFamily = "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      this.overlay.style.userSelect = "none";
      document.body.appendChild(this.overlay);
    }
    attachGlobalHotkeys() {
      window.addEventListener(
        "keydown",
        (e) => {
          if (!this.isOpen()) return;
          if (e.key === "Escape") {
            e.preventDefault();
            this.close();
            return;
          }
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
            e.preventDefault();
            this.triggerCommitSave();
            return;
          }
          if (e.key.toLowerCase() === "o" && this.currentTab === "active_track") {
            const target = e.target;
            if (target && (target.tagName === "INPUT" || target.tagName === "SELECT")) return;
            e.preventDefault();
            this.toggleOutsideFrame(this.selectedFrame);
            return;
          }
          if (e.key === "[" && this.currentTab === "active_track") {
            const target = e.target;
            if (target && (target.tagName === "INPUT" || target.tagName === "SELECT")) return;
            e.preventDefault();
            this.switchPrevTrack();
            return;
          }
          if (e.key === "]" && this.currentTab === "active_track") {
            const target = e.target;
            if (target && (target.tagName === "INPUT" || target.tagName === "SELECT")) return;
            e.preventDefault();
            this.switchNextTrack();
            return;
          }
        },
        true
      );
    }
    /**
     * Tải toàn bộ dữ liệu Job từ Bridge vào in-memory store
     */
    async loadInitialData() {
      var _a, _b;
      if (!((_a = this.currentCtx) == null ? void 0 : _a.jobId)) return;
      this.renderLoading();
      try {
        const tracksData = await CVATBridge.getAllJobTracksWithShapes(
          this.currentCtx.jobId
        );
        this.store = new JobAnnotationStore(this.currentCtx.jobId);
        this.store.setTracks(tracksData);
        if (this.store.getAllTracks().length === 0 && this.allJobTracks.length > 0) {
          const fallbackList = this.allJobTracks.map((t) => ({
            id: t.uiId,
            clientID: t.uiId,
            serverID: t.serverId,
            labelId: 1,
            labelName: t.label,
            labelColor: "#38bdf8",
            shapes: [
              {
                type: "cuboid",
                frame: CVATBridge.getCurrentFrame(),
                points: [t.x, t.y, t.z, 0, 0, t.yawDeg * Math.PI / 180, t.l, t.w, t.h, 0, 0, 0, 0, 0, 0, 0],
                outside: false
              }
            ]
          }));
          this.store.setTracks(fallbackList);
        }
        this.render();
      } catch (err) {
        if (this.overlay) {
          this.overlay.innerHTML = `
          <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; color: #ef4444;">
            <h3 style="margin: 0; font-size: 16px;">Không thể tải dữ liệu: ${err.message || err}</h3>
            <button id="btn-close-error" style="background: #27272a; color: white; border: 1px solid rgba(255,255,255,0.1); padding: 8px 16px; border-radius: 6px; cursor: pointer;">Đóng</button>
          </div>
        `;
          (_b = this.overlay.querySelector("#btn-close-error")) == null ? void 0 : _b.addEventListener("click", () => this.close());
        }
      }
    }
    renderLoading() {
      if (!this.overlay) return;
      this.overlay.innerHTML = `
      <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px;">
        <div style="width: 36px; height: 36px; border: 3px solid rgba(255,255,255,0.1); border-top-color: #38bdf8; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
        <span style="font-size: 13px; color: #a1a1aa; font-family: monospace;">Đang đồng bộ dữ liệu xe từ Three.js CVAT native...</span>
      </div>
      <style>
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      </style>
    `;
    }
    render() {
      if (!this.overlay || !this.currentCtx || !this.store) return;
      const allTracks = this.store.getAllTracks();
      const activeTrack = this.store.getTrack(this.activeTrackId) || allTracks[0];
      const dirtyCount = this.store.getDirtyTracks().length;
      this.overlay.innerHTML = `
      <!-- 1. HEADER BAR CHUYÊN NGHIỆP -->
      <div style="
        background: #141416;
        border-bottom: 1px solid rgba(255,255,255,0.08);
        padding: 10px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        min-height: 52px;
      ">
        <div style="display: flex; align-items: center; gap: 14px;">
          <!-- Badge Studio -->
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="background: #2563eb; color: white; padding: 3px 8px; border-radius: 5px; font-size: 11px; font-weight: bold; letter-spacing: 0.5px;">RETIME STUDIO</span>
            <span style="font-size: 14px; font-weight: bold; color: #f4f4f5;">Job #${this.currentCtx.jobId}</span>
          </div>

          <!-- Tab Switcher -->
          <div style="display: flex; background: #09090b; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 2px;">
            <button id="studio-tab-active" style="
              border: none;
              background: ${this.currentTab === "active_track" ? "#2563eb" : "transparent"};
              color: ${this.currentTab === "active_track" ? "white" : "#71717a"};
              padding: 5px 14px;
              font-size: 12px;
              font-weight: 600;
              cursor: pointer;
              border-radius: 4px;
              transition: all 0.15s;
            ">Duyệt Frame (Xe #${this.activeTrackId})</button>

            <button id="studio-tab-batch" style="
              border: none;
              background: ${this.currentTab === "batch_all" ? "#2563eb" : "transparent"};
              color: ${this.currentTab === "batch_all" ? "white" : "#71717a"};
              padding: 5px 14px;
              font-size: 12px;
              font-weight: 600;
              cursor: pointer;
              border-radius: 4px;
              transition: all 0.15s;
            ">Tất Cả Track ID (${allTracks.length})</button>
          </div>

          <!-- Quick Track Selector Dropdown & Switcher -->
          <div style="display: flex; align-items: center; gap: 4px; background: #09090b; border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; padding: 2px 6px;">
            <span style="font-size: 11px; color: #a1a1aa; font-weight: 600;">Track:</span>
            <select id="studio-quick-track-select" style="
              background: transparent;
              border: none;
              color: #38bdf8;
              font-size: 12px;
              font-weight: bold;
              cursor: pointer;
              outline: none;
              padding: 3px 4px;
              max-width: 200px;
            ">
              ${allTracks.map(
        (t) => `
                <option value="${t.uiId}" ${t.uiId === this.activeTrackId ? "selected" : ""} style="background: #18181b; color: white;">
                  #${t.uiId} · ${t.labelName} (${t.shapes.length}f)
                </option>
              `
      ).join("")}
            </select>
            <button id="btn-quick-prev-track" title="Xe trước (phím [)" style="
              background: #27272a; border: 1px solid rgba(255,255,255,0.1); color: #d4d4d8; font-size: 11px; padding: 2px 7px; border-radius: 4px; cursor: pointer;
            ">◀</button>
            <button id="btn-quick-next-track" title="Xe sau (phím ])" style="
              background: #27272a; border: 1px solid rgba(255,255,255,0.1); color: #d4d4d8; font-size: 11px; padding: 2px 7px; border-radius: 4px; cursor: pointer;
            ">▶</button>
          </div>

          <!-- Status Indicator -->
          <span style="
            font-size: 11px;
            font-family: ui-monospace, monospace;
            background: rgba(34, 197, 94, 0.12);
            color: #22c55e;
            border: 1px solid rgba(34, 197, 94, 0.25);
            padding: 2px 8px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            gap: 5px;
          ">
            <span style="width: 6px; height: 6px; background: #22c55e; border-radius: 50%;"></span>
            <span>THREE.JS NATIVE CONNECTED</span>
          </span>
        </div>

        <!-- Right Action Controls -->
        <div style="display: flex; align-items: center; gap: 10px;">
          <!-- Nút Lưu vào CVAT (TUYỆT ĐỐI KHÔNG TỰ ĐỘNG AUTOSAVE NGẦM) -->
          <button id="btn-studio-commit-save" style="
            background: ${dirtyCount > 0 ? "#ea580c" : "#2563eb"};
            border: 1px solid rgba(255,255,255,0.15);
            color: white;
            font-size: 12px;
            font-weight: 600;
            padding: 6px 16px;
            border-radius: 6px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            box-shadow: 0 2px 8px ${dirtyCount > 0 ? "rgba(234, 88, 12, 0.4)" : "rgba(37, 99, 235, 0.3)"};
            transition: all 0.2s;
          ">
            <span>💾</span>
            <span>${this.isSaving ? "Đang lưu..." : dirtyCount > 0 ? `Lưu vào CVAT (${dirtyCount} track)` : "Lưu vào CVAT"}</span>
            <span style="font-size: 10px; opacity: 0.8; font-family: monospace;">(Ctrl+S)</span>
          </button>

          <!-- Nút Đóng -->
          <button id="btn-studio-close" style="
            background: #27272a;
            border: 1px solid rgba(255,255,255,0.1);
            color: #a1a1aa;
            font-size: 12px;
            font-weight: bold;
            padding: 6px 12px;
            border-radius: 6px;
            cursor: pointer;
          ">✕ Đóng (Esc)</button>
        </div>
      </div>

      <!-- 2. NỘI DUNG CHÍNH (TAB 1 HOẶC TAB 2) -->
      <div style="flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden;">
        ${this.currentTab === "active_track" ? this.renderActiveTrackHtml(activeTrack) : this.renderBatchAllHtml(allTracks)}
      </div>
    `;
      this.attachHeaderListeners();
      if (this.currentTab === "active_track") {
        this.attachActiveTrackListeners(activeTrack);
      } else {
        this.attachBatchAllListeners();
      }
    }
    // =========================================================================
    // TAB 2: ACTIVE TRACK RETIME STUDIO (Duyệt toàn bộ frame của xe)
    // =========================================================================
    renderActiveTrackHtml(track) {
      if (!track) {
        return `
        <div style="flex: 1; display: flex; align-items: center; justify-content: center; color: #71717a;">
          Chưa chọn xe nào để duyệt. Vui lòng chuyển sang tab danh sách xe.
        </div>
      `;
      }
      const sizes = track.shapes.map((s) => s.points.slice(6, 9));
      const medL = this.median(sizes.map((s) => s[0]));
      const medW = this.median(sizes.map((s) => s[1]));
      const medH = this.median(sizes.map((s) => s[2]));
      const sortedShapes = [...track.shapes].sort((a, b) => a.frame - b.frame);
      const rowsHtml = sortedShapes.map((sh) => {
        const f = sh.frame;
        const pts = sh.points;
        const curL = pts[6] || 0;
        const curW = pts[7] || 0;
        const curH = pts[8] || 0;
        const curZ = pts[2] || 0;
        const curYawDeg = Number(((pts[5] || 0) * 180 / Math.PI).toFixed(1));
        const isSelected = f === this.selectedFrame;
        return `
          <tr class="studio-frame-row ${isSelected ? "selected-row" : ""}" data-frame="${f}" style="
            border-bottom: 1px solid rgba(255,255,255,0.06);
            background: ${isSelected ? "rgba(37, 99, 235, 0.15)" : sh.outside ? "rgba(24, 24, 27, 0.5)" : "transparent"};
            cursor: pointer;
            transition: background 0.12s;
          ">
            <!-- Cột 1: Frame Number -->
            <td style="padding: 10px 14px; font-weight: bold; font-family: monospace;">
              <span class="btn-jump-frame" data-frame="${f}" style="
                background: ${isSelected ? "#2563eb" : "#27272a"};
                color: ${isSelected ? "white" : "#38bdf8"};
                padding: 3px 8px;
                border-radius: 4px;
                display: inline-flex;
                align-items: center;
                gap: 4px;
              ">
                <span>f#${f}</span>
                ${isSelected ? '<span style="font-size: 9px;">●</span>' : ""}
              </span>
            </td>

            <!-- Cột 2: Keyframe Status -->
            <td style="padding: 10px 14px; text-align: center;">
              <span style="background: rgba(16, 185, 129, 0.15); color: #34d399; font-size: 10px; font-weight: bold; padding: 2px 6px; border-radius: 4px;">KF</span>
            </td>

            <!-- Cột 3: Outside Toggle -->
            <td style="padding: 10px 14px;">
              <button class="btn-toggle-outside" data-frame="${f}" style="
                border: 1px solid ${sh.outside ? "rgba(239, 68, 68, 0.4)" : "rgba(34, 197, 94, 0.4)"};
                background: ${sh.outside ? "rgba(239, 68, 68, 0.12)" : "rgba(34, 197, 94, 0.12)"};
                color: ${sh.outside ? "#f87171" : "#4ade80"};
                font-size: 10px;
                font-weight: 600;
                padding: 3px 8px;
                border-radius: 4px;
                cursor: pointer;
              ">${sh.outside ? "Outside (Ẩn)" : "Visible (Hiện)"}</button>
            </td>

            <!-- Cột 4: Kích Thước L / W / H (Nhập trực tiếp) -->
            <td style="padding: 10px 8px; font-family: monospace;">
              <div style="display: flex; align-items: center; gap: 4px;">
                <input class="input-shape-l" data-frame="${f}" type="number" step="0.02" value="${curL.toFixed(2)}" style="width: 58px; background: #09090b; border: 1px solid rgba(255,255,255,0.12); color: #38bdf8; padding: 3px; border-radius: 4px; font-size: 11px; text-align: center;" />
                <span style="color: #71717a;">×</span>
                <input class="input-shape-w" data-frame="${f}" type="number" step="0.02" value="${curW.toFixed(2)}" style="width: 58px; background: #09090b; border: 1px solid rgba(255,255,255,0.12); color: #38bdf8; padding: 3px; border-radius: 4px; font-size: 11px; text-align: center;" />
                <span style="color: #71717a;">×</span>
                <input class="input-shape-h" data-frame="${f}" type="number" step="0.02" value="${curH.toFixed(2)}" title="Đổi H giữ nguyên mặt đáy" style="width: 58px; background: #09090b; border: 1px solid rgba(255,255,255,0.12); color: #38bdf8; padding: 3px; border-radius: 4px; font-size: 11px; text-align: center;" />
                <span style="color: #a1a1aa; font-size: 10px;">m</span>
              </div>
            </td>

            <!-- Cột 5: Cao độ Z & Góc Yaw -->
            <td style="padding: 10px 8px; font-family: monospace;">
              <div style="display: flex; align-items: center; gap: 6px; font-size: 11px;">
                <span style="color: #a1a1aa;">Z:</span>
                <input class="input-shape-z" data-frame="${f}" type="number" step="0.02" value="${curZ.toFixed(2)}" style="width: 54px; background: #09090b; border: 1px solid rgba(255,255,255,0.12); color: white; padding: 3px; border-radius: 4px; font-size: 11px; text-align: center;" />
                <span style="color: #a1a1aa;">Yaw:</span>
                <span style="color: #e4e4e7;">${curYawDeg}°</span>
              </div>
            </td>

            <!-- Cột 6: Thao tác từng frame -->
            <td style="padding: 10px 14px; text-align: right;">
              <button class="btn-snap-ground-single" data-frame="${f}" title="Hút đáy xe bám sát mặt đất tại frame này" style="
                background: #27272a;
                border: 1px solid rgba(255,255,255,0.1);
                color: #2dd4bf;
                font-size: 11px;
                padding: 4px 8px;
                border-radius: 4px;
                cursor: pointer;
              ">⇩ Đất</button>

              <button class="btn-apply-size-to-all" data-frame="${f}" title="Lấy kích thước L, W, H của frame này ép cho toàn bộ các frame khác" style="
                background: #27272a;
                border: 1px solid rgba(255,255,255,0.1);
                color: #6ee7b7;
                font-size: 11px;
                padding: 4px 8px;
                border-radius: 4px;
                cursor: pointer;
                margin-left: 4px;
              ">L/W/H ➔ Toàn Track</button>
            </td>
          </tr>
        `;
      }).join("");
      return `
      <!-- Studio Toolbar -->
      <div style="
        background: #18181b;
        border-bottom: 1px solid rgba(255,255,255,0.08);
        padding: 10px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
      ">
        <!-- Info Active Track -->
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="width: 10px; height: 10px; border-radius: 50%; background: ${track.labelColor};"></span>
            <span style="font-size: 14px; font-weight: bold; color: white;">${track.labelName} #${track.uiId}</span>
            <span style="font-size: 11px; color: #a1a1aa; font-family: monospace;">(${track.firstFrame} ➔ ${track.lastFrame}, ${track.shapes.length} frames)</span>
          </div>

          <div style="font-size: 12px; color: #d4d4d8; font-family: monospace; background: #09090b; padding: 4px 10px; border-radius: 5px; border: 1px solid rgba(255,255,255,0.08);">
            Trung vị: <b style="color: #38bdf8;">${medL.toFixed(2)} × ${medW.toFixed(2)} × ${medH.toFixed(2)}m</b>
          </div>
        </div>

        <!-- Batch Action Buttons For Active Track -->
        <div style="display: flex; align-items: center; gap: 8px;">
          <button id="btn-batch-snap-ground" style="
            background: #27272a;
            border: 1px solid rgba(255,255,255,0.12);
            color: #2dd4bf;
            font-size: 11px;
            font-weight: 600;
            padding: 5px 10px;
            border-radius: 5px;
            cursor: pointer;
          ">⇩ Ghim Đất Toàn Track</button>

          <button id="btn-batch-flip-yaw" style="
            background: #27272a;
            border: 1px solid rgba(255,255,255,0.12);
            color: #fbbf24;
            font-size: 11px;
            font-weight: 600;
            padding: 5px 10px;
            border-radius: 5px;
            cursor: pointer;
          ">🔄 Lật 180° Toàn Track</button>

          <button id="btn-batch-median-size" style="
            background: #27272a;
            border: 1px solid rgba(255,255,255,0.12);
            color: #a78bfa;
            font-size: 11px;
            font-weight: 600;
            padding: 5px 10px;
            border-radius: 5px;
            cursor: pointer;
          ">⟲ Làm Mịn Kích Thước (Median)</button>
        </div>
      </div>

      <!-- Danh Sách Các Frame -->
      <div style="flex: 1; overflow: auto; padding: 12px 20px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
          <thead>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.12); color: #a1a1aa; font-weight: 600; font-size: 11px;">
              <th style="padding: 8px 14px;">Frame</th>
              <th style="padding: 8px 14px; text-align: center;">Loại</th>
              <th style="padding: 8px 14px;">Hiển Thị</th>
              <th style="padding: 8px 8px;">Kích Thước (L × W × H)</th>
              <th style="padding: 8px 8px;">Tọa Độ & Hướng</th>
              <th style="padding: 8px 14px; text-align: right;">Hành Động</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;
    }
    attachActiveTrackListeners(track) {
      var _a, _b, _c, _d;
      if (!this.overlay || !track || !this.store || !((_a = this.currentCtx) == null ? void 0 : _a.jobId)) return;
      const jobId = this.currentCtx.jobId;
      this.overlay.querySelectorAll(".studio-frame-row").forEach((row) => {
        row.addEventListener("click", (e) => {
          const target = e.target;
          if (target.tagName === "INPUT" || target.tagName === "BUTTON") return;
          const f = parseInt(row.dataset.frame || "0", 10);
          this.selectedFrame = f;
          this.jumpToCVATFrame(f);
          this.render();
        });
      });
      this.overlay.querySelectorAll(".btn-jump-frame").forEach((btn) => {
        btn.addEventListener("click", () => {
          const f = parseInt(btn.dataset.frame || "0", 10);
          this.selectedFrame = f;
          this.jumpToCVATFrame(f);
          this.render();
        });
      });
      this.overlay.querySelectorAll(".btn-toggle-outside").forEach((btn) => {
        btn.addEventListener("click", () => {
          const f = parseInt(btn.dataset.frame || "0", 10);
          this.toggleOutsideFrame(f);
        });
      });
      const updateShapeSize = (f, newL, newW, newH) => {
        var _a2;
        const sh = track.shapes.find((s) => s.frame === f);
        if (!sh || !Array.isArray(sh.points)) return;
        (_a2 = this.store) == null ? void 0 : _a2.snapshot([track.uiId]);
        sh.points[8];
        const curL = newL !== void 0 ? newL : sh.points[6];
        const curW = newW !== void 0 ? newW : sh.points[7];
        const curH = sh.points[8];
        sh.points[6] = curL;
        sh.points[7] = curW;
        sh.points[8] = curH;
        track.dirty = true;
        if (f === CVATBridge.getCurrentFrame()) {
          CVATBridge.updateLiveBox(jobId, f, track.uiId, track.serverId, sh.points);
        }
        this.render();
      };
      this.overlay.querySelectorAll(".input-shape-l").forEach((inp) => {
        inp.addEventListener("change", () => {
          const f = parseInt(inp.dataset.frame || "0", 10);
          const val = parseFloat(inp.value);
          if (!isNaN(val) && val > 0) updateShapeSize(f, val, void 0);
        });
      });
      this.overlay.querySelectorAll(".input-shape-w").forEach((inp) => {
        inp.addEventListener("change", () => {
          const f = parseInt(inp.dataset.frame || "0", 10);
          const val = parseFloat(inp.value);
          if (!isNaN(val) && val > 0) updateShapeSize(f, void 0, val);
        });
      });
      this.overlay.querySelectorAll(".input-shape-h").forEach((inp) => {
        inp.addEventListener("change", () => {
          const f = parseInt(inp.dataset.frame || "0", 10);
          const val = parseFloat(inp.value);
          if (!isNaN(val) && val > 0) updateShapeSize(f, void 0, val);
        });
      });
      this.overlay.querySelectorAll(".btn-apply-size-to-all").forEach((btn) => {
        btn.addEventListener("click", () => {
          const f = parseInt(btn.dataset.frame || "0", 10);
          const sh = track.shapes.find((s) => s.frame === f);
          if (!sh || !Array.isArray(sh.points)) return;
          const size = [sh.points[6], sh.points[7], sh.points[8]];
          this.applySizeToWholeTrack(track.uiId, size);
        });
      });
      this.overlay.querySelectorAll(".btn-snap-ground-single").forEach((btn) => {
        btn.addEventListener("click", async () => {
          await CVATBridge.snapTrackToGround(jobId, track.uiId, track.serverId || track.uiId, "road");
          await this.loadInitialData();
        });
      });
      (_b = this.overlay.querySelector("#btn-batch-snap-ground")) == null ? void 0 : _b.addEventListener("click", async () => {
        for (const sh of track.shapes) {
          if (!sh.outside) {
            await CVATBridge.snapTrackToGround(jobId, track.uiId, track.serverId || track.uiId, "road");
          }
        }
        await this.loadInitialData();
      });
      (_c = this.overlay.querySelector("#btn-batch-flip-yaw")) == null ? void 0 : _c.addEventListener("click", async () => {
        await CVATBridge.flipTrackYaw(jobId, track.uiId, track.serverId || track.uiId, false);
        await this.loadInitialData();
      });
      (_d = this.overlay.querySelector("#btn-batch-median-size")) == null ? void 0 : _d.addEventListener("click", () => {
        const sizes = track.shapes.map((s) => s.points.slice(6, 9));
        const medSize = [
          this.median(sizes.map((s) => s[0])),
          this.median(sizes.map((s) => s[1])),
          this.median(sizes.map((s) => s[2]))
        ];
        this.applySizeToWholeTrack(track.uiId, medSize);
      });
    }
    // =========================================================================
    // TAB 1: BATCH SIZE MANAGER (Quản lý kích thước toàn Job)
    // =========================================================================
    renderBatchAllHtml(allTracks) {
      const rowsHtml = allTracks.map((t) => {
        const sizes = t.shapes.map((s) => s.points.slice(6, 9));
        const medL = this.median(sizes.map((s) => s[0]));
        const medW = this.median(sizes.map((s) => s[1]));
        const medH = this.median(sizes.map((s) => s[2]));
        const minL = Math.min(...sizes.map((s) => s[0]));
        const maxL = Math.max(...sizes.map((s) => s[0]));
        const minW = Math.min(...sizes.map((s) => s[1]));
        const maxW = Math.max(...sizes.map((s) => s[1]));
        const minH = Math.min(...sizes.map((s) => s[2]));
        const maxH = Math.max(...sizes.map((s) => s[2]));
        const varies = maxL - minL > 0.01 || maxW - minW > 0.01 || maxH - minH > 0.01;
        return `
          <tr class="batch-track-row" data-track-id="${t.uiId}" style="border-bottom: 1px solid rgba(255,255,255,0.06); cursor: pointer; transition: background 0.15s; background: ${t.uiId === this.activeTrackId ? "rgba(37, 99, 235, 0.15)" : t.dirty ? "rgba(34, 197, 94, 0.06)" : "transparent"};">
            <td style="padding: 10px 14px; font-weight: bold; color: #38bdf8; font-family: monospace;">#${t.uiId}</td>
            <td style="padding: 10px 14px;">
              <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${t.labelColor}; margin-right: 6px;"></span>
              <span>${t.labelName}</span>
            </td>
            <td style="padding: 10px 14px; font-family: monospace; color: #a1a1aa;">f${t.firstFrame} ➔ f${t.lastFrame}</td>
            <td style="padding: 10px 14px; font-family: monospace; text-align: center;">${t.shapes.length}</td>
            <td style="padding: 10px 14px; font-family: monospace; color: #e4e4e7;">
              ${medL.toFixed(2)} / ${medW.toFixed(2)} / ${medH.toFixed(2)}m
              ${varies ? '<span style="margin-left: 6px; font-size: 10px; background: rgba(234, 88, 12, 0.2); color: #fb923c; padding: 1px 4px; border-radius: 3px;">không đều</span>' : ""}
            </td>
            <td style="padding: 10px 8px;">
              <input class="batch-inp-l" data-track-id="${t.uiId}" type="number" step="0.02" placeholder="${medL.toFixed(2)}" style="width: 58px; background: #09090b; border: 1px solid rgba(255,255,255,0.12); color: #38bdf8; padding: 4px; border-radius: 4px; font-size: 11px; text-align: center;" />
            </td>
            <td style="padding: 10px 8px;">
              <input class="batch-inp-w" data-track-id="${t.uiId}" type="number" step="0.02" placeholder="${medW.toFixed(2)}" style="width: 58px; background: #09090b; border: 1px solid rgba(255,255,255,0.12); color: #38bdf8; padding: 4px; border-radius: 4px; font-size: 11px; text-align: center;" />
            </td>
            <td style="padding: 10px 8px;">
              <input class="batch-inp-h" data-track-id="${t.uiId}" type="number" step="0.02" placeholder="${medH.toFixed(2)}" style="width: 58px; background: #09090b; border: 1px solid rgba(255,255,255,0.12); color: #38bdf8; padding: 4px; border-radius: 4px; font-size: 11px; text-align: center;" />
            </td>
            <td style="padding: 10px 14px;">
              <button class="btn-batch-apply" data-track-id="${t.uiId}" style="background: #2563eb; border: none; color: white; padding: 5px 12px; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer;">Áp dụng</button>
              <button class="btn-batch-snap" data-track-id="${t.uiId}" style="margin-left: 4px; background: #27272a; border: 1px solid rgba(255,255,255,0.1); color: #2dd4bf; padding: 5px 8px; border-radius: 4px; font-size: 11px; cursor: pointer;">⇩ Đất</button>
            </td>
            <td style="padding: 10px 14px; text-align: right;">
              <button class="btn-open-studio-track" data-track-id="${t.uiId}" style="background: #2563eb; border: 1px solid rgba(255,255,255,0.15); color: white; padding: 5px 12px; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer;">Duyệt Frame ➔</button>
            </td>
          </tr>
        `;
      }).join("");
      return `
      <!-- Toolbar Tab 1 -->
      <div style="background: #18181b; border-bottom: 1px solid rgba(255,255,255,0.06); padding: 10px 20px; display: flex; align-items: center; justify-content: space-between;">
        <span style="font-size: 12px; color: #a1a1aa;">
          Áp dụng kích thước mới từ <b>Frame 0 ➔ Frame End</b> với <b>Ground-Lock 3D</b> (Đáy xe cố định tuyệt đối trên mặt đường).
        </span>
        <span style="font-size: 11px; color: #71717a; font-family: monospace;">
          Dữ liệu in-memory, chỉ lưu khi bấm nút "Lưu vào CVAT" (Ctrl+S)
        </span>
      </div>

      <!-- Bảng Danh Sách Xe -->
      <div style="flex: 1; overflow: auto; padding: 12px 20px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
          <thead>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.12); color: #a1a1aa; font-weight: 600; font-size: 11px;">
              <th style="padding: 8px 14px;">ID</th>
              <th style="padding: 8px 14px;">Label</th>
              <th style="padding: 8px 14px;">Dải Frame</th>
              <th style="padding: 8px 14px; text-align: center;">Keyframes</th>
              <th style="padding: 8px 14px;">L / W / H (Trung vị)</th>
              <th style="padding: 8px 8px;">L mới</th>
              <th style="padding: 8px 8px;">W mới</th>
              <th style="padding: 8px 8px;">H mới</th>
              <th style="padding: 8px 14px;">Thao Tác</th>
              <th style="padding: 8px 14px; text-align: right;">Chi Tiết</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;
    }
    attachBatchAllListeners() {
      var _a;
      if (!this.overlay || !this.store || !((_a = this.currentCtx) == null ? void 0 : _a.jobId)) return;
      const jobId = this.currentCtx.jobId;
      this.overlay.querySelectorAll(".btn-batch-apply").forEach((btn) => {
        btn.addEventListener("click", () => {
          var _a2;
          const trackId = parseInt(btn.dataset.trackId || "0", 10);
          const row = btn.closest("tr");
          if (!row) return;
          const inpL = row.querySelector(".batch-inp-l");
          const inpW = row.querySelector(".batch-inp-w");
          const inpH = row.querySelector(".batch-inp-h");
          const track = (_a2 = this.store) == null ? void 0 : _a2.getTrack(trackId);
          if (!track) return;
          const sizes = track.shapes.map((s) => s.points.slice(6, 9));
          const medL = this.median(sizes.map((s) => s[0]));
          const medW = this.median(sizes.map((s) => s[1]));
          const medH = this.median(sizes.map((s) => s[2]));
          const newL = parseFloat((inpL == null ? void 0 : inpL.value) || "") || medL;
          const newW = parseFloat((inpW == null ? void 0 : inpW.value) || "") || medW;
          const newH = parseFloat((inpH == null ? void 0 : inpH.value) || "") || medH;
          this.applySizeToWholeTrack(trackId, [newL, newW, newH]);
        });
      });
      this.overlay.querySelectorAll(".btn-batch-snap").forEach((btn) => {
        btn.addEventListener("click", async () => {
          var _a2;
          const trackId = parseInt(btn.dataset.trackId || "0", 10);
          const track = (_a2 = this.store) == null ? void 0 : _a2.getTrack(trackId);
          if (!track) return;
          await CVATBridge.snapTrackToGround(jobId, trackId, track.serverId || trackId, "road");
          await this.loadInitialData();
        });
      });
      this.overlay.querySelectorAll(".batch-track-row").forEach((row) => {
        row.addEventListener("click", (e) => {
          const target = e.target;
          if (target.tagName === "INPUT" || target.tagName === "BUTTON") return;
          const trackId = parseInt(row.dataset.trackId || "0", 10);
          this.switchActiveTrack(trackId);
        });
      });
      this.overlay.querySelectorAll(".btn-open-studio-track").forEach((btn) => {
        btn.addEventListener("click", () => {
          const trackId = parseInt(btn.dataset.trackId || "0", 10);
          this.switchActiveTrack(trackId);
        });
      });
    }
    // =========================================================================
    // LOGIC ĐIỀU KHIỂN & TƯƠNG TÁC
    // =========================================================================
    switchActiveTrack(trackId) {
      if (!this.store) return;
      const track = this.store.getTrack(trackId);
      if (!track) return;
      this.activeTrackId = trackId;
      this.currentTab = "active_track";
      const curF = CVATBridge.getCurrentFrame();
      if (track.shapes.some((s) => s.frame === curF)) {
        this.selectedFrame = curF;
      } else if (track.shapes.length > 0) {
        this.selectedFrame = track.firstFrame;
        this.jumpToCVATFrame(track.firstFrame);
      }
      this.render();
    }
    switchPrevTrack() {
      if (!this.store) return;
      const all = this.store.getAllTracks();
      if (all.length <= 1) return;
      const idx = all.findIndex((t) => t.uiId === this.activeTrackId);
      const prevIdx = idx <= 0 ? all.length - 1 : idx - 1;
      this.switchActiveTrack(all[prevIdx].uiId);
    }
    switchNextTrack() {
      if (!this.store) return;
      const all = this.store.getAllTracks();
      if (all.length <= 1) return;
      const idx = all.findIndex((t) => t.uiId === this.activeTrackId);
      const nextIdx = idx < 0 || idx >= all.length - 1 ? 0 : idx + 1;
      this.switchActiveTrack(all[nextIdx].uiId);
    }
    attachHeaderListeners() {
      var _a, _b, _c, _d, _e, _f, _g;
      if (!this.overlay) return;
      (_a = this.overlay.querySelector("#studio-tab-active")) == null ? void 0 : _a.addEventListener("click", () => {
        this.currentTab = "active_track";
        this.render();
      });
      (_b = this.overlay.querySelector("#studio-tab-batch")) == null ? void 0 : _b.addEventListener("click", () => {
        this.currentTab = "batch_all";
        this.render();
      });
      (_c = this.overlay.querySelector("#studio-quick-track-select")) == null ? void 0 : _c.addEventListener("change", (e) => {
        const select = e.target;
        const tid = parseInt(select.value, 10);
        if (!isNaN(tid)) this.switchActiveTrack(tid);
      });
      (_d = this.overlay.querySelector("#btn-quick-prev-track")) == null ? void 0 : _d.addEventListener("click", () => {
        this.switchPrevTrack();
      });
      (_e = this.overlay.querySelector("#btn-quick-next-track")) == null ? void 0 : _e.addEventListener("click", () => {
        this.switchNextTrack();
      });
      (_f = this.overlay.querySelector("#btn-studio-close")) == null ? void 0 : _f.addEventListener("click", () => {
        this.close();
      });
      (_g = this.overlay.querySelector("#btn-studio-commit-save")) == null ? void 0 : _g.addEventListener("click", () => {
        this.triggerCommitSave();
      });
    }
    /**
     * Chuyển frame trong timeline CVAT native và Three.js scene
     */
    jumpToCVATFrame(frame) {
      try {
        const frameInput = document.querySelector("input.cvat-player-frame-selector");
        if (frameInput) {
          frameInput.value = String(frame);
          frameInput.dispatchEvent(new Event("change", { bubbles: true }));
          frameInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true }));
        }
        CVATBridge.jumpToFrame(frame);
      } catch (e) {
        console.warn("[CVAT 3D Studio] Chuyển frame:", e);
      }
    }
    /**
     * Bật/tắt trạng thái Outside tại một frame
     */
    toggleOutsideFrame(frame) {
      if (!this.store) return;
      const track = this.store.getTrack(this.activeTrackId);
      if (!track) return;
      const sh = track.shapes.find((s) => s.frame === frame);
      if (sh) {
        this.store.snapshot([this.activeTrackId]);
        sh.outside = !sh.outside;
        track.dirty = true;
        this.render();
      }
    }
    /**
     * Áp dụng kích thước mới cho toàn bộ các frame của một track (Ground-Lock 3D)
     */
    applySizeToWholeTrack(trackId, newSize) {
      var _a, _b;
      if (!this.store || !((_a = this.currentCtx) == null ? void 0 : _a.jobId)) return;
      const track = this.store.getTrack(trackId);
      if (!track) return;
      this.store.snapshot([trackId]);
      for (const sh of track.shapes) {
        if (!sh.outside) {
          const curBox = (_b = track.at(sh.frame)) == null ? void 0 : _b.box;
          if (curBox) {
            const updatedBox = resizeKeepBottom(curBox, newSize);
            sh.points[0] = updatedBox.c[0];
            sh.points[1] = updatedBox.c[1];
            sh.points[2] = updatedBox.c[2];
          }
          sh.points[6] = newSize[0];
          sh.points[7] = newSize[1];
          sh.points[8] = newSize[2];
        }
      }
      track.dirty = true;
      const curF = CVATBridge.getCurrentFrame();
      const curSh = track.shapes.find((s) => s.frame === curF);
      if (curSh) {
        CVATBridge.updateLiveBox(this.currentCtx.jobId, curF, track.uiId, track.serverId, curSh.points);
      }
      this.render();
    }
    /**
     * Lưu toàn bộ các thay đổi vào CVAT (Chỉ lưu khi bấm, TUYỆT ĐỐI KHÔNG AUTOSAVE)
     */
    async triggerCommitSave() {
      var _a;
      if (!((_a = this.currentCtx) == null ? void 0 : _a.jobId) || !this.store || this.isSaving) return;
      this.isSaving = true;
      this.render();
      try {
        const res = await CVATBridge.commitSave(this.currentCtx.jobId);
        if (res && res.success) {
          for (const t of this.store.getAllTracks()) {
            t.dirty = false;
          }
        }
      } catch (e) {
        console.error("[CVAT 3D Studio] Lỗi lưu vào CVAT:", e);
      } finally {
        this.isSaving = false;
        this.render();
      }
    }
    median(arr) {
      if (arr.length === 0) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }
  }
  class FloatingPanel {
    constructor() {
      __publicField(this, "container", null);
      __publicField(this, "miniPill", null);
      __publicField(this, "toastOverlay", null);
      __publicField(this, "toastTimer", null);
      __publicField(this, "isMinimized", false);
      __publicField(this, "trackStudioModal", new TrackStudioModal());
      // Module Tab đang mở: "dimensions" | "rotation" | "ground"
      __publicField(this, "activeTab", "dimensions");
      // Phạm vi áp dụng kích thước: false = Chỉ Frame này, true = Toàn bộ Track
      __publicField(this, "applyToTrack", false);
      // Dữ liệu đối tượng đang chọn
      __publicField(this, "selectedUiId", null);
      // Số 1, 2 hiển thị chuẩn
      __publicField(this, "selectedServerId", null);
      // Số 31, 32 lưu database
      __publicField(this, "currentLabel", "Chưa chọn xe");
      __publicField(this, "currentX", 0);
      __publicField(this, "currentY", 0);
      __publicField(this, "currentZ", 0);
      __publicField(this, "currentYawDeg", 0);
      __publicField(this, "currentL", 0);
      __publicField(this, "currentW", 0);
      __publicField(this, "currentH", 0);
      // Giá trị đang chỉnh sửa trên ô input (L, W, H)
      __publicField(this, "editL", 0);
      __publicField(this, "editW", 0);
      __publicField(this, "editH", 0);
      // Danh sách các xe ĐANG CÓ MẶT TẠI FRAME HIỆN TẠI
      __publicField(this, "currentFrameNumber", 0);
      __publicField(this, "frameTracks", []);
      // Trạng thái Dropdown Select & Tìm kiếm
      __publicField(this, "isDropdownOpen", false);
      __publicField(this, "searchKeyword", "");
      __publicField(this, "autoSelectListenerAttached", false);
      // Trạng thái xử lý
      __publicField(this, "isProcessing", false);
      // Tọa độ kéo thả
      __publicField(this, "isDragging", false);
      __publicField(this, "startX", 0);
      __publicField(this, "startY", 0);
      __publicField(this, "currentCtx", null);
      __publicField(this, "pollInterval", null);
    }
    render(ctx) {
      this.currentCtx = ctx;
      if (!ctx.isCVAT) {
        this.destroy();
        return;
      }
      if (!this.container) {
        this.createContainer();
        this.createMiniPill();
        this.createToastOverlay();
        this.setupDraggable();
        this.setupCanvasAutoSelectListener();
        this.startPollingLoop();
      }
      this.updateContent();
    }
    createContainer() {
      this.container = document.createElement("div");
      this.container.id = "cvat-3d-suite-floating";
      this.container.style.position = "fixed";
      this.container.style.top = "20px";
      this.container.style.right = "20px";
      this.container.style.width = "370px";
      this.container.style.maxHeight = "calc(100vh - 40px)";
      this.container.style.zIndex = "999995";
      this.container.style.fontFamily = "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      this.container.style.backgroundColor = "rgba(9, 9, 11, 0.95)";
      this.container.style.backdropFilter = "blur(16px)";
      this.container.style.border = "1px solid rgba(255, 255, 255, 0.12)";
      this.container.style.borderRadius = "16px";
      this.container.style.boxShadow = "0 20px 40px -15px rgba(0, 0, 0, 0.75), 0 0 1px 1px rgba(255, 255, 255, 0.05)";
      this.container.style.color = "#f4f4f5";
      this.container.style.display = "flex";
      this.container.style.flexDirection = "column";
      this.container.style.overflow = "hidden";
      this.container.style.userSelect = "none";
      this.container.style.transition = "opacity 0.2s ease";
      document.body.appendChild(this.container);
      document.addEventListener("click", (e) => {
        if (!this.isDropdownOpen) return;
        const target = e.target;
        if (!target.closest("#dropdown-menu-popover") && !target.closest("#btn-dropdown-toggle")) {
          this.isDropdownOpen = false;
          this.updateContent();
        }
      });
    }
    createMiniPill() {
      this.miniPill = document.createElement("div");
      this.miniPill.id = "cvat-3d-suite-pill";
      this.miniPill.style.position = "fixed";
      this.miniPill.style.bottom = "24px";
      this.miniPill.style.right = "24px";
      this.miniPill.style.zIndex = "999996";
      this.miniPill.style.fontFamily = "ui-sans-serif, system-ui, sans-serif";
      this.miniPill.style.backgroundColor = "rgba(9, 9, 11, 0.92)";
      this.miniPill.style.backdropFilter = "blur(12px)";
      this.miniPill.style.border = "1px solid rgba(255, 255, 255, 0.14)";
      this.miniPill.style.borderRadius = "9999px";
      this.miniPill.style.padding = "8px 14px";
      this.miniPill.style.color = "#f4f4f5";
      this.miniPill.style.fontSize = "12px";
      this.miniPill.style.fontWeight = "600";
      this.miniPill.style.display = "none";
      this.miniPill.style.alignItems = "center";
      this.miniPill.style.gap = "8px";
      this.miniPill.style.boxShadow = "0 10px 25px -5px rgba(0, 0, 0, 0.5)";
      this.miniPill.style.cursor = "pointer";
      this.miniPill.style.userSelect = "none";
      this.miniPill.innerHTML = `
      <span style="width: 8px; height: 8px; border-radius: 50%; background: #10b981; box-shadow: 0 0 8px #10b981;"></span>
      <span>3D Suite</span>
      <span style="font-size: 10px; font-family: monospace; color: #71717a; background: #27272a; padding: 2px 6px; border-radius: 4px;">\`</span>
    `;
      this.miniPill.addEventListener("click", () => this.toggleMinimize());
      document.body.appendChild(this.miniPill);
    }
    /**
     * Tạo phần tử Thông Báo Nổi (Floating Toast Overlay):
     * Định vị absolute ở đáy của Card, KHÔNG nằm trong luồng DOM -> KHÔNG BAO GIỜ LÀM NHÁY HOẶC GIẬT NÚT!
     */
    createToastOverlay() {
      if (!this.container || this.toastOverlay) return;
      this.toastOverlay = document.createElement("div");
      this.toastOverlay.id = "cvat-floating-toast-overlay";
      this.toastOverlay.style.position = "absolute";
      this.toastOverlay.style.bottom = "38px";
      this.toastOverlay.style.left = "14px";
      this.toastOverlay.style.right = "14px";
      this.toastOverlay.style.zIndex = "999999";
      this.toastOverlay.style.pointerEvents = "none";
      this.toastOverlay.style.display = "flex";
      this.toastOverlay.style.justifyContent = "center";
      this.toastOverlay.style.alignItems = "center";
      this.toastOverlay.style.transition = "all 0.22s cubic-bezier(0.16, 1, 0.3, 1)";
      this.toastOverlay.style.opacity = "0";
      this.toastOverlay.style.transform = "translateY(8px)";
      this.container.appendChild(this.toastOverlay);
    }
    /**
     * Hiển thị thông báo nổi không gây gián đoạn giao diện (Zero Layout Shift).
     * 100% SVG Flat Icons phẳng, tối giản, thanh lịch, KHÔNG DÙNG EMOJI 3D.
     */
    showToast(msg, type = "success") {
      if (!this.toastOverlay) return;
      if (this.toastTimer) {
        clearTimeout(this.toastTimer);
        this.toastTimer = null;
      }
      let bgColor = "rgba(16, 185, 129, 0.95)";
      let textColor = "#ffffff";
      let iconSvg = ICONS.checkCircle;
      if (type === "info") {
        bgColor = "rgba(14, 165, 233, 0.95)";
        iconSvg = ICONS.infoCircle;
      } else if (type === "warning") {
        bgColor = "rgba(245, 158, 11, 0.95)";
        textColor = "#18181b";
        iconSvg = ICONS.alertCircle;
      } else if (type === "error") {
        bgColor = "rgba(239, 68, 68, 0.95)";
        iconSvg = ICONS.xCircle;
      }
      this.toastOverlay.innerHTML = `
      <div style="
        background: ${bgColor};
        color: ${textColor};
        padding: 6px 14px;
        border-radius: 9999px;
        font-size: 11px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 6px;
        box-shadow: 0 10px 25px -4px rgba(0, 0, 0, 0.6), 0 0 1px 1px rgba(255, 255, 255, 0.15);
        backdrop-filter: blur(8px);
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        letter-spacing: -0.2px;
      ">
        <span style="display: flex; align-items: center;">${iconSvg}</span>
        <span>${msg}</span>
      </div>
    `;
      this.toastOverlay.style.opacity = "1";
      this.toastOverlay.style.transform = "translateY(0)";
      this.toastTimer = setTimeout(() => {
        if (this.toastOverlay) {
          this.toastOverlay.style.opacity = "0";
          this.toastOverlay.style.transform = "translateY(8px)";
        }
        this.toastTimer = null;
      }, 2800);
    }
    toggleMinimize() {
      this.isMinimized = !this.isMinimized;
      if (this.container && this.miniPill) {
        if (this.isMinimized) {
          this.container.style.display = "none";
          this.miniPill.style.display = "flex";
        } else {
          this.container.style.display = "flex";
          this.miniPill.style.display = "none";
        }
      }
    }
    /**
     * Kéo thả cửa sổ nổi
     */
    setupDraggable() {
      if (!this.container) return;
      const onMouseDown = (e) => {
        const target = e.target;
        if (target.closest("button") || target.closest("input") || target.closest("select")) return;
        if (!target.closest("#floating-drag-header")) return;
        this.isDragging = true;
        this.startX = e.clientX - this.container.offsetLeft;
        this.startY = e.clientY - this.container.offsetTop;
        e.preventDefault();
      };
      const onMouseMove = (e) => {
        if (!this.isDragging || !this.container) return;
        let newLeft = e.clientX - this.startX;
        let newTop = e.clientY - this.startY;
        const maxLeft = window.innerWidth - this.container.offsetWidth - 10;
        const maxTop = window.innerHeight - this.container.offsetHeight - 10;
        newLeft = Math.max(10, Math.min(newLeft, maxLeft));
        newTop = Math.max(10, Math.min(newTop, maxTop));
        this.container.style.left = `${newLeft}px`;
        this.container.style.top = `${newTop}px`;
        this.container.style.right = "auto";
      };
      const onMouseUp = () => {
        this.isDragging = false;
      };
      this.container.addEventListener("mousedown", onMouseDown);
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    }
    /**
     * Tự động nhận diện khi người dùng click vào box trên Three.js Canvas hoặc Sidebar (0ms Realtime)
     */
    setupCanvasAutoSelectListener() {
      if (this.autoSelectListenerAttached) return;
      this.autoSelectListenerAttached = true;
      window.addEventListener("CVAT_EXT_RES_OBJECT_ACTIVATED", (e) => {
        var _a, _b;
        const clientId = (_a = e.detail) == null ? void 0 : _a.clientId;
        const details = (_b = e.detail) == null ? void 0 : _b.details;
        if (details && details.clientId) {
          console.log(`[CVAT 3D Suite] Nhận dữ liệu tức thì của xe #${details.clientId}:`, details);
          this.selectedUiId = details.clientId;
          this.selectedServerId = details.serverId || null;
          this.currentLabel = details.label || `Xe #${details.clientId}`;
          this.currentX = details.x;
          this.currentY = details.y;
          this.currentZ = details.z;
          this.currentYawDeg = details.yawDeg;
          this.currentL = details.l;
          this.currentW = details.w;
          this.currentH = details.h;
          this.editL = details.l;
          this.editW = details.w;
          this.editH = details.h;
          const existingIdx = this.frameTracks.findIndex((t) => t.uiId === details.clientId);
          const item = {
            uiId: details.clientId,
            serverId: details.serverId || details.clientId,
            label: details.label || "Car",
            x: details.x,
            y: details.y,
            z: details.z,
            yawDeg: details.yawDeg,
            l: details.l,
            w: details.w,
            h: details.h
          };
          if (existingIdx >= 0) {
            this.frameTracks[existingIdx] = item;
          } else {
            this.frameTracks.push(item);
          }
          this.updateContent();
        } else if (clientId && clientId !== this.selectedUiId) {
          console.log(`[CVAT 3D Suite] Tự động chọn xe #${clientId} từ click Canvas 3D`);
          this.selectTrackByUiId(clientId);
        }
      });
      window.addEventListener("CVAT_EXT_RES_FRAME_TRACKS_DIRTY", () => {
        this.syncFrameTracks();
      });
    }
    /**
     * Vòng lặp quét Frame và Đồng bộ xe thời gian thực (Realtime Loop)
     */
    startPollingLoop() {
      this.pollInterval = setInterval(async () => {
        if (!this.currentCtx || !this.currentCtx.jobId) return;
        const frame = CVATBridge.getCurrentFrame();
        const frameChanged = frame !== this.currentFrameNumber;
        this.currentFrameNumber = frame;
        if (frameChanged || this.frameTracks.length === 0) {
          await this.syncFrameTracks();
        }
        const active = CVATBridge.getActiveTrackId();
        if (active.id !== null && active.id !== this.selectedUiId) {
          await this.selectTrackByUiId(active.id);
        }
      }, 800);
      setTimeout(() => this.syncFrameTracks(), 250);
    }
    /**
     * Đồng bộ danh sách xe có mặt tại Frame hiện tại
     */
    async syncFrameTracks() {
      if (!this.currentCtx || !this.currentCtx.jobId) return;
      this.currentFrameNumber = CVATBridge.getCurrentFrame();
      const tracks = await CVATBridge.getTracksInCurrentFrame(this.currentCtx.jobId, this.currentFrameNumber);
      this.frameTracks = tracks;
      const isCurrentTrackInFrame = tracks.some((t) => t.uiId === this.selectedUiId);
      if (!isCurrentTrackInFrame && tracks.length > 0) {
        await this.selectTrackByUiId(tracks[0].uiId);
      } else if (isCurrentTrackInFrame && this.selectedUiId) {
        const cur = tracks.find((t) => t.uiId === this.selectedUiId);
        if (cur) {
          this.selectedServerId = cur.serverId;
          this.currentLabel = cur.label;
          this.currentX = cur.x;
          this.currentY = cur.y;
          this.currentZ = cur.z;
          this.currentYawDeg = cur.yawDeg;
          this.currentL = cur.l;
          this.currentW = cur.w;
          this.currentH = cur.h;
          this.editL = cur.l;
          this.editW = cur.w;
          this.editH = cur.h;
        }
        this.updateContent();
      } else {
        this.updateContent();
      }
    }
    /**
     * Chọn xe theo UI ID (#1, #2...) và kích hoạt highlight trên Canvas
     */
    async selectTrackByUiId(uiId, details) {
      this.selectedUiId = uiId;
      CVATBridge.activateCanvasTrack(uiId);
      if (details) {
        this.selectedServerId = details.serverId || null;
        this.currentLabel = details.label || `Xe #${uiId}`;
        this.currentX = details.x;
        this.currentY = details.y;
        this.currentZ = details.z;
        this.currentYawDeg = details.yawDeg;
        this.currentL = details.l;
        this.currentW = details.w;
        this.currentH = details.h;
        this.editL = details.l;
        this.editW = details.w;
        this.editH = details.h;
        this.updateContent();
        return;
      }
      const foundInFrame = this.frameTracks.find((t) => t.uiId === uiId);
      if (foundInFrame) {
        this.selectedServerId = foundInFrame.serverId;
        this.currentLabel = foundInFrame.label;
        this.currentX = foundInFrame.x;
        this.currentY = foundInFrame.y;
        this.currentZ = foundInFrame.z;
        this.currentYawDeg = foundInFrame.yawDeg;
        this.currentL = foundInFrame.l;
        this.currentW = foundInFrame.w;
        this.currentH = foundInFrame.h;
        this.editL = foundInFrame.l;
        this.editW = foundInFrame.w;
        this.editH = foundInFrame.h;
        this.updateContent();
        return;
      }
      await this.syncFrameTracks();
    }
    selectPrevTrack() {
      if (this.frameTracks.length === 0) return;
      const idx = this.frameTracks.findIndex((t) => t.uiId === this.selectedUiId);
      if (idx > 0) {
        this.selectTrackByUiId(this.frameTracks[idx - 1].uiId);
      } else {
        this.selectTrackByUiId(this.frameTracks[this.frameTracks.length - 1].uiId);
      }
    }
    selectNextTrack() {
      if (this.frameTracks.length === 0) return;
      const idx = this.frameTracks.findIndex((t) => t.uiId === this.selectedUiId);
      if (idx !== -1 && idx < this.frameTracks.length - 1) {
        this.selectTrackByUiId(this.frameTracks[idx + 1].uiId);
      } else {
        this.selectTrackByUiId(this.frameTracks[0].uiId);
      }
    }
    /**
     * Xử lý Lật đầu xe 180° (REALTIME 100%, ZERO-F5)
     */
    async handleFlipYaw(currentFrameOnly) {
      if (!this.currentCtx || !this.currentCtx.jobId) {
        this.showToast("Chưa kết nối Job CVAT!", "warning");
        return;
      }
      if (this.selectedUiId === null) {
        this.showToast("Vui lòng chọn xe từ danh sách!", "warning");
        return;
      }
      if (this.isProcessing) return;
      this.isProcessing = true;
      this.showToast(`Đang lật hướng 180° xe #${this.selectedUiId}...`, "info");
      try {
        const serverId = this.selectedServerId || this.selectedUiId;
        const res = await CVATBridge.flipTrackYaw(this.currentCtx.jobId, this.selectedUiId, serverId, currentFrameOnly);
        this.currentYawDeg = res.newYawDeg;
        const targetItem = this.frameTracks.find((t) => t.uiId === this.selectedUiId);
        if (targetItem) {
          targetItem.yawDeg = res.newYawDeg;
        }
        this.showToast(res.message, "success");
      } catch (err) {
        this.showToast(`Lỗi: ${err.message || err}`, "error");
      } finally {
        this.isProcessing = false;
        this.updateContent();
      }
    }
    /**
     * Xử lý Cập nhật kích thước (L, W, H) linh hoạt: Áp dụng Chỉ Frame này hoặc Toàn bộ Track
     */
    async handleUpdateDimensions(l, w, h, applyToTrack) {
      if (!this.currentCtx || !this.currentCtx.jobId) {
        this.showToast("Chưa kết nối Job CVAT!", "warning");
        return;
      }
      if (this.selectedUiId === null) {
        this.showToast("Vui lòng chọn xe trước!", "warning");
        return;
      }
      if (l <= 0 || w <= 0 || h <= 0) {
        this.showToast("Kích thước không hợp lệ!", "warning");
        return;
      }
      if (this.isProcessing) return;
      this.isProcessing = true;
      const scopeMsg = applyToTrack ? "toàn bộ track" : "frame này";
      this.showToast(`Đang lưu ${l}x${w}x${h}m cho ${scopeMsg}...`, "info");
      try {
        const serverId = this.selectedServerId || this.selectedUiId;
        const res = await CVATBridge.updateTrackDimensions(
          this.currentCtx.jobId,
          this.selectedUiId,
          serverId,
          l,
          w,
          h,
          applyToTrack
        );
        this.currentL = l;
        this.currentW = w;
        this.currentH = h;
        this.editL = l;
        this.editW = w;
        this.editH = h;
        this.currentZ = res.newZ;
        const targetItem = this.frameTracks.find((t) => t.uiId === this.selectedUiId);
        if (targetItem) {
          targetItem.l = l;
          targetItem.w = w;
          targetItem.h = h;
          targetItem.z = res.newZ;
        }
        this.showToast(res.message, "success");
      } catch (err) {
        this.showToast(`Lỗi: ${err.message || err}`, "error");
      } finally {
        this.isProcessing = false;
        this.updateContent();
      }
    }
    /**
     * Xử lý Tăng/Giảm kích thước từng bước (±0.05m)
     */
    handleStepDimension(axis, delta) {
      if (axis === "l") {
        this.editL = Number(Math.max(0.5, this.editL + delta).toFixed(2));
      } else if (axis === "w") {
        this.editW = Number(Math.max(0.4, this.editW + delta).toFixed(2));
      } else if (axis === "h") {
        this.editH = Number(Math.max(0.4, this.editH + delta).toFixed(2));
      }
      this.handleUpdateDimensions(this.editL, this.editW, this.editH, this.applyToTrack);
    }
    /**
     * Xử lý Ghim Mặt Đất & Địa Hình Vỉa Hè (Ground & Curb Snapping Realtime 100%, ZERO-F5)
     */
    async handleSnapGround(mode, params) {
      if (!this.currentCtx || !this.currentCtx.jobId) {
        this.showToast("Chưa kết nối Job CVAT!", "warning");
        return;
      }
      if (this.selectedUiId === null) {
        this.showToast("Vui lòng chọn xe trước!", "warning");
        return;
      }
      if (this.isProcessing) return;
      this.isProcessing = true;
      this.showToast("Đang quét mặt đất LiDAR...", "info");
      try {
        const serverId = this.selectedServerId || this.selectedUiId;
        const res = await CVATBridge.snapTrackToGround(
          this.currentCtx.jobId,
          this.selectedUiId,
          serverId,
          mode,
          params
        );
        this.currentZ = res.newZ;
        const targetItem = this.frameTracks.find((t) => t.uiId === this.selectedUiId);
        if (targetItem) {
          targetItem.z = res.newZ;
        }
        this.showToast(res.message, "success");
      } catch (err) {
        this.showToast(`Lỗi: ${err.message || err}`, "error");
      } finally {
        this.isProcessing = false;
        this.updateContent();
      }
    }
    /**
     * Xử lý Căn Hộp Bám Cụm Điểm BẢO TOÀN KÍCH THƯỚC (Preserving Dimensions Alignment)
     * Tự động bay tới ôm khít cụm điểm mà TUYỆT ĐỐI GIỮ NGUYÊN kích thước L, W, H của xe.
     */
    async handleAlignBoxToPoints() {
      if (!this.currentCtx || !this.currentCtx.jobId) {
        this.showToast("Chưa kết nối Job CVAT!", "warning");
        return;
      }
      if (this.selectedUiId === null) {
        this.showToast("Vui lòng chọn xe trước!", "warning");
        return;
      }
      if (this.isProcessing) return;
      this.isProcessing = true;
      this.showToast("Đang căn hộp bám cụm điểm & giữ nguyên kích thước...", "info");
      try {
        const serverId = this.selectedServerId || this.selectedUiId;
        const res = await CVATBridge.alignBoxToPoints(
          this.currentCtx.jobId,
          this.selectedUiId,
          serverId
        );
        if (res.success) {
          if (res.newX !== void 0) this.currentX = res.newX;
          if (res.newY !== void 0) this.currentY = res.newY;
          if (res.newZ !== void 0) this.currentZ = res.newZ;
          const targetItem = this.frameTracks.find((t) => t.uiId === this.selectedUiId);
          if (targetItem) {
            if (res.newX !== void 0) targetItem.x = res.newX;
            if (res.newY !== void 0) targetItem.y = res.newY;
            if (res.newZ !== void 0) targetItem.z = res.newZ;
          }
          this.showToast(res.message, "success");
        } else {
          this.showToast(res.message, "error");
        }
      } catch (err) {
        this.showToast(`Lỗi Căn Hộp: ${err.message || err}`, "error");
      } finally {
        this.isProcessing = false;
        this.updateContent();
      }
    }
    /**
     * Giữ tương thích ngược với handleTightFit
     */
    async handleTightFit() {
      await this.handleAlignBoxToPoints();
    }
    /**
     * Xử lý Khớp Kích Thước Chuẩn Catalog (Catalog Best-Fit)
     */
    async handleCatalogFit() {
      if (!this.currentCtx || !this.currentCtx.jobId) {
        this.showToast("Chưa kết nối Job CVAT!", "warning");
        return;
      }
      if (this.selectedUiId === null) {
        this.showToast("Vui lòng chọn xe trước!", "warning");
        return;
      }
      if (this.isProcessing) return;
      this.isProcessing = true;
      this.showToast("Đang đối chiếu và khớp kích thước Catalog...", "info");
      try {
        const serverId = this.selectedServerId || this.selectedUiId;
        const res = await CVATBridge.autoFitTrack(
          this.currentCtx.jobId,
          this.selectedUiId,
          serverId,
          false,
          this.applyToTrack,
          "catalog"
        );
        if (res.success) {
          if (res.newX !== void 0) this.currentX = res.newX;
          if (res.newY !== void 0) this.currentY = res.newY;
          if (res.newZ !== void 0) this.currentZ = res.newZ;
          if (res.newL !== void 0) {
            this.currentL = res.newL;
            this.editL = res.newL;
          }
          if (res.newW !== void 0) {
            this.currentW = res.newW;
            this.editW = res.newW;
          }
          if (res.newH !== void 0) {
            this.currentH = res.newH;
            this.editH = res.newH;
          }
          const targetItem = this.frameTracks.find((t) => t.uiId === this.selectedUiId);
          if (targetItem) {
            if (res.newX !== void 0) targetItem.x = res.newX;
            if (res.newY !== void 0) targetItem.y = res.newY;
            if (res.newZ !== void 0) targetItem.z = res.newZ;
            if (res.newL !== void 0) targetItem.l = res.newL;
            if (res.newW !== void 0) targetItem.w = res.newW;
            if (res.newH !== void 0) targetItem.h = res.newH;
          }
          this.showToast(res.message, "success");
        } else {
          this.showToast(res.message, "error");
        }
      } catch (err) {
        this.showToast(`Lỗi Khớp Catalog: ${err.message || err}`, "error");
      } finally {
        this.isProcessing = false;
        this.updateContent();
      }
    }
    /**
     * Giữ tương thích ngược với handleAutoFit
     */
    async handleAutoFit(tightFit = true) {
      if (tightFit) {
        await this.handleTightFit();
      } else {
        await this.handleCatalogFit();
      }
    }
    /**
     * Xử lý Quét Mốc Chuẩn Đẹp Nhất & Tự Fit Đồng Bộ Toàn Track (Smart Multi-Frame Anchor Fit)
     */
    async handleSmartAnchorFit() {
      if (!this.currentCtx || !this.currentCtx.jobId) {
        this.showToast("Chưa kết nối Job CVAT!", "warning");
        return;
      }
      if (this.selectedUiId === null) {
        this.showToast("Vui lòng chọn xe trước!", "warning");
        return;
      }
      if (this.isProcessing) return;
      this.isProcessing = true;
      this.showToast("Đang tìm mốc chuẩn và fit đồng bộ toàn track...", "info");
      try {
        const serverId = this.selectedServerId || this.selectedUiId;
        const res = await CVATBridge.smartAnchorTrackFit(
          this.currentCtx.jobId,
          this.selectedUiId,
          serverId
        );
        if (res.success) {
          if (res.optL !== void 0) {
            this.currentL = res.optL;
            this.editL = res.optL;
          }
          if (res.optW !== void 0) {
            this.currentW = res.optW;
            this.editW = res.optW;
          }
          if (res.optH !== void 0) {
            this.currentH = res.optH;
            this.editH = res.optH;
          }
          const targetItem = this.frameTracks.find((t) => t.uiId === this.selectedUiId);
          if (targetItem) {
            if (res.optL !== void 0) targetItem.l = res.optL;
            if (res.optW !== void 0) targetItem.w = res.optW;
            if (res.optH !== void 0) targetItem.h = res.optH;
          }
          this.showToast(res.message, "success");
        } else {
          this.showToast(res.message, "error");
        }
      } catch (err) {
        this.showToast(`Lỗi Fit Mốc Toàn Track: ${err.message || err}`, "error");
      } finally {
        this.isProcessing = false;
        this.updateContent();
      }
    }
    updateContent() {
      if (!this.container || !this.currentCtx) return;
      const jobText = this.currentCtx.jobId ? `#${this.currentCtx.jobId}` : "OFFLINE";
      const filteredTracks = this.frameTracks.filter((t) => {
        if (!this.searchKeyword.trim()) return true;
        const kw = this.searchKeyword.trim().toLowerCase().replace("#", "");
        return String(t.uiId).includes(kw) || t.label.toLowerCase().includes(kw);
      });
      let dropdownItemsHtml = "";
      if (filteredTracks.length > 0) {
        dropdownItemsHtml = filteredTracks.map((t) => {
          const isSelected = t.uiId === this.selectedUiId;
          return `
            <div class="dropdown-track-item" data-uiid="${t.uiId}" style="
              padding: 6px 10px;
              border-radius: 6px;
              background: ${isSelected ? "rgba(16, 185, 129, 0.2)" : "transparent"};
              border: 1px solid ${isSelected ? "rgba(16, 185, 129, 0.4)" : "transparent"};
              color: ${isSelected ? "#6ee7b7" : "#e4e4e7"};
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: space-between;
              font-family: ui-monospace, monospace;
              font-size: 11px;
              transition: background 0.12s;
            ">
              <span style="display: flex; align-items: center; gap: 8px;">
                <span style="font-weight: 700; color: ${isSelected ? "#10b981" : "#a1a1aa"};">#${t.uiId}</span>
                <span style="color: #fafafa; font-weight: 500;">${t.label}</span>
              </span>
              <span style="font-size: 10px; color: #71717a;">
                Z: ${t.z}m • ${t.yawDeg}°
                ${isSelected ? `<span style="color: #10b981; margin-left: 4px;">●</span>` : ""}
              </span>
            </div>
          `;
        }).join("");
      } else {
        dropdownItemsHtml = `
        <div style="font-size: 11px; color: #71717a; padding: 8px; text-align: center; font-style: italic;">
          Không tìm thấy xe nào khớp với "${this.searchKeyword}"
        </div>
      `;
      }
      const bestFit = findBestFitCatalog(
        this.currentL || 4.6,
        this.currentW || 1.8,
        this.currentH || 1.45,
        this.currentLabel
      );
      let tabContentHtml = "";
      if (this.activeTab === "dimensions") {
        tabContentHtml = `
        <!-- BỘ ĐIỀU CHỈNH KÍCH THƯỚC (L, W, H) -->
        <div style="
          background: rgba(24, 24, 27, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          padding: 8px 10px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        ">
          <!-- TOGGLE SWITCH: CHỈ FRAME NÀY VS TOÀN TRACK -->
          <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.06);">
            <span style="font-size: 11px; font-weight: 600; color: #a1a1aa;">Phạm vi áp dụng:</span>
            <div id="btn-toggle-scope" style="
              background: #18181b;
              border: 1px solid rgba(255, 255, 255, 0.1);
              border-radius: 6px;
              display: flex;
              padding: 2px;
              cursor: pointer;
              font-size: 10px;
              font-family: ui-monospace, monospace;
            ">
              <span style="
                padding: 3px 8px;
                border-radius: 4px;
                background: ${!this.applyToTrack ? "#27272a" : "transparent"};
                color: ${!this.applyToTrack ? "#10b981" : "#71717a"};
                font-weight: ${!this.applyToTrack ? "600" : "normal"};
              ">Frame Này</span>
              <span style="
                padding: 3px 8px;
                border-radius: 4px;
                background: ${this.applyToTrack ? "rgba(239, 68, 68, 0.2)" : "transparent"};
                color: ${this.applyToTrack ? "#fca5a5" : "#71717a"};
                font-weight: ${this.applyToTrack ? "600" : "normal"};
              ">Toàn Track</span>
            </div>
          </div>

          <!-- 3 HÀNG STEPPER (L, W, H) -->
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px;">
            <!-- Chiều Dài L -->
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <span style="font-size: 10px; color: #a1a1aa; font-family: monospace;">Dài (L):</span>
              <div style="display: flex; align-items: center; background: #09090b; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px;">
                <button class="btn-step" data-axis="l" data-delta="-0.05" style="border: none; background: transparent; color: #71717a; padding: 4px; cursor: pointer;">-</button>
                <input id="input-dim-l" type="number" step="0.05" value="${this.editL || this.currentL}" style="width: 100%; border: none; background: transparent; color: #38bdf8; font-size: 11px; font-weight: bold; text-align: center; outline: none; font-family: monospace;" />
                <button class="btn-step" data-axis="l" data-delta="0.05" style="border: none; background: transparent; color: #71717a; padding: 4px; cursor: pointer;">+</button>
              </div>
            </div>

            <!-- Chiều Rộng W -->
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <span style="font-size: 10px; color: #a1a1aa; font-family: monospace;">Rộng (W):</span>
              <div style="display: flex; align-items: center; background: #09090b; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px;">
                <button class="btn-step" data-axis="w" data-delta="-0.05" style="border: none; background: transparent; color: #71717a; padding: 4px; cursor: pointer;">-</button>
                <input id="input-dim-w" type="number" step="0.05" value="${this.editW || this.currentW}" style="width: 100%; border: none; background: transparent; color: #38bdf8; font-size: 11px; font-weight: bold; text-align: center; outline: none; font-family: monospace;" />
                <button class="btn-step" data-axis="w" data-delta="0.05" style="border: none; background: transparent; color: #71717a; padding: 4px; cursor: pointer;">+</button>
              </div>
            </div>

            <!-- Chiều Cao H -->
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <span style="font-size: 10px; color: #a1a1aa; font-family: monospace;">Cao (H):</span>
              <div style="display: flex; align-items: center; background: #09090b; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px;">
                <button class="btn-step" data-axis="h" data-delta="-0.05" style="border: none; background: transparent; color: #71717a; padding: 4px; cursor: pointer;">-</button>
                <input id="input-dim-h" type="number" step="0.05" value="${this.editH || this.currentH}" style="width: 100%; border: none; background: transparent; color: #38bdf8; font-size: 11px; font-weight: bold; text-align: center; outline: none; font-family: monospace;" />
                <button class="btn-step" data-axis="h" data-delta="0.05" style="border: none; background: transparent; color: #71717a; padding: 4px; cursor: pointer;">+</button>
              </div>
            </div>
          </div>

          <!-- NÚT ÁP DỤNG KÍCH THƯỚC ĐÃ NHẬP -->
          <button id="btn-apply-dimensions" style="
            background: #27272a;
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: #f4f4f5;
            padding: 6px 10px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            transition: all 0.15s;
          ">
            <span style="display: flex; align-items: center;">${ICONS.save}</span>
            <span>Lưu Kích Thước (${this.applyToTrack ? "Toàn Track" : "Frame Này"})</span>
          </button>
        </div>

        <!-- 3 NÚT HÀNH ĐỘNG FIT CHUYÊN BIỆT: ALIGN TO POINTS (GIỮ SIZE), CATALOG & QUÉT MỐC ĐA FRAME -->
        <div style="display: flex; flex-direction: column; gap: 5px;">
          <!-- NÚT 1: CĂN HỘP BÁM CỤM ĐIỂM (BẢO TOÀN KÍCH THƯỚC L, W, H) -->
          <button id="btn-tight-fit" title="Tự động dịch tâm và ôm trọn cụm điểm LiDAR, giữ nguyên 100% kích cỡ chuẩn" style="
            background: rgba(16, 185, 129, 0.15);
            border: 1px solid #10b981;
            color: #6ee7b7;
            padding: 8px 12px;
            border-radius: 8px;
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            transition: all 0.12s;
          ">
            <span style="display: flex; align-items: center; gap: 7px;">
              <span style="display: flex; align-items: center;">${ICONS.tightFit}</span>
              <span>Căn Hộp Bám Cụm Điểm (Giữ Size)</span>
            </span>
            <kbd style="font-size: 9px; font-family: monospace; background: #18181b; padding: 1px 5px; border-radius: 4px; color: #a7f3d0;">T</kbd>
          </button>

          <!-- NÚT 2: QUÉT MỐC ĐA FRAME (CHỌN FRAME HIỂN THỊ TỐT NHẤT) -->
          <button id="btn-smart-anchor-fit" title="Duyệt qua toàn bộ frame của xe trong track, chọn frame có cụm điểm đầy đủ nhất để đồng bộ kích thước" style="
            background: rgba(168, 85, 247, 0.12);
            border: 1px solid rgba(168, 85, 247, 0.35);
            color: #d8b4fe;
            padding: 7px 12px;
            border-radius: 8px;
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            transition: all 0.15s;
          ">
            <span style="display: flex; align-items: center; gap: 7px;">
              <span style="display: flex; align-items: center;">${ICONS.link}</span>
              <span>Quét Mốc Đa Frame (Chọn Frame Đẹp)</span>
            </span>
            <span style="font-size: 9px; font-family: monospace; background: rgba(0,0,0,0.35); padding: 1px 5px; border-radius: 4px; color: #d8b4fe;">MULTI-SCAN</span>
          </button>

          <!-- NÚT 3: KHỚP KÍCH THƯỚC CHUẨN CATALOG -->
          <button id="btn-catalog-fit" title="Gợi ý và khớp kích thước theo catalog phương tiện chuẩn" style="
            background: rgba(14, 165, 233, 0.12);
            border: 1px solid rgba(14, 165, 233, 0.35);
            color: #7dd3fc;
            padding: 7px 12px;
            border-radius: 8px;
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            transition: all 0.12s;
          ">
            <span style="display: flex; align-items: center; gap: 7px;">
              <span style="display: flex; align-items: center;">${ICONS.sparkles}</span>
              <span>Khớp Chuẩn Catalog (Best-Fit)</span>
            </span>
            <kbd style="font-size: 9px; font-family: monospace; background: #18181b; padding: 1px 5px; border-radius: 4px; color: #7dd3fc;">⇧B</kbd>
          </button>

          <!-- GỢI Ý XE KHỚP TỪ CATALOG -->
          <div style="
            font-size: 10px;
            color: #71717a;
            padding: 2px 4px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-family: ui-monospace, monospace;
          ">
            <span>Dòng xe khớp: <strong style="color: #10b981;">${bestFit.matchedItem.name}</strong> (${bestFit.confidence}%)</span>
            <button class="catalog-btn" data-l="${bestFit.recommendedL}" data-w="${bestFit.recommendedW}" data-h="${bestFit.recommendedH}" data-name="${bestFit.matchedItem.name}" style="
              border: none;
              background: transparent;
              color: #38bdf8;
              font-size: 10px;
              cursor: pointer;
              text-decoration: underline;
            ">Áp dụng</button>
          </div>
        </div>

        <!-- PRESET CATALOG NHANH -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
          ${STANDARD_VEHICLE_CATALOG.slice(0, 4).map(
          (item) => `
            <button class="catalog-btn" data-l="${item.l}" data-w="${item.w}" data-h="${item.h}" data-name="${item.name}" style="
              background: #18181b;
              border: 1px solid rgba(255,255,255,0.08);
              color: #d4d4d8;
              padding: 5px 8px;
              border-radius: 6px;
              font-size: 10px;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: space-between;
            ">
              <span style="font-weight: 500;">${item.name}</span>
              <span style="font-size: 8px; font-family: monospace; color: #71717a;">${item.l}x${item.w}m</span>
            </button>
          `
        ).join("")}
        </div>
      `;
      } else if (this.activeTab === "rotation") {
        tabContentHtml = `
        <!-- LẬT 180 ĐỘ -->
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <div style="font-size: 10px; font-weight: 600; text-transform: uppercase; color: #71717a;">Lật Đầu Xe 180°</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
            <button id="btn-flip-frame" style="
              background: #27272a;
              border: 1px solid rgba(255, 255, 255, 0.08);
              color: #f4f4f5;
              padding: 8px 10px;
              border-radius: 8px;
              font-size: 11px;
              font-weight: 500;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: space-between;
            ">
              <span style="display: flex; align-items: center; gap: 6px;">
                <span style="display: flex; align-items: center;">${ICONS.flip}</span>
                <span>Lật Frame này</span>
              </span>
              <kbd style="font-size: 9px; font-family: monospace; background: #18181b; padding: 1px 4px; border-radius: 4px; color: #71717a;">F</kbd>
            </button>

            <button id="btn-flip-track" style="
              background: rgba(239, 68, 68, 0.12);
              border: 1px solid rgba(239, 68, 68, 0.3);
              color: #fca5a5;
              padding: 8px 10px;
              border-radius: 8px;
              font-size: 11px;
              font-weight: 500;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: space-between;
            ">
              <span style="display: flex; align-items: center; gap: 6px;">
                <span style="display: flex; align-items: center;">${ICONS.flip}</span>
                <span>Lật Toàn Track</span>
              </span>
              <kbd style="font-size: 9px; font-family: monospace; background: #18181b; padding: 1px 4px; border-radius: 4px; color: #71717a;">⇧F</kbd>
            </button>
          </div>
        </div>

        <!-- VI CHỈNH GÓC XOAY -->
        <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 4px;">
          <div style="font-size: 10px; font-weight: 600; text-transform: uppercase; color: #71717a;">Vi Chỉnh Góc Yaw</div>
          <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px;">
            <button class="btn-rot" data-deg="-90" style="background: #18181b; border: 1px solid rgba(255,255,255,0.08); color: #d4d4d8; font-size: 10px; font-family: monospace; padding: 6px 0; border-radius: 6px; cursor: pointer;">-90°</button>
            <button class="btn-rot" data-deg="-15" style="background: #18181b; border: 1px solid rgba(255,255,255,0.08); color: #d4d4d8; font-size: 10px; font-family: monospace; padding: 6px 0; border-radius: 6px; cursor: pointer;">-15°</button>
            <button class="btn-rot" data-deg="-5" style="background: #18181b; border: 1px solid rgba(255,255,255,0.08); color: #d4d4d8; font-size: 10px; font-family: monospace; padding: 6px 0; border-radius: 6px; cursor: pointer;">-5°</button>
            <button class="btn-rot" data-deg="5" style="background: #18181b; border: 1px solid rgba(255,255,255,0.08); color: #10b981; font-size: 10px; font-family: monospace; padding: 6px 0; border-radius: 6px; cursor: pointer;">+5°</button>
            <button class="btn-rot" data-deg="15" style="background: #18181b; border: 1px solid rgba(255,255,255,0.08); color: #10b981; font-size: 10px; font-family: monospace; padding: 6px 0; border-radius: 6px; cursor: pointer;">+15°</button>
            <button class="btn-rot" data-deg="90" style="background: #18181b; border: 1px solid rgba(255,255,255,0.08); color: #10b981; font-size: 10px; font-family: monospace; padding: 6px 0; border-radius: 6px; cursor: pointer;">+90°</button>
          </div>
        </div>
      `;
      } else if (this.activeTab === "ground") {
        tabContentHtml = `
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <!-- GHIM MẶT ĐƯỜNG & VỈA HÈ -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
            <button id="btn-snap-road" title="Ghim sát mặt đường và tự động khớp góc dốc Pitch dọc & Roll ngang theo thực tế 3D" style="
              background: #27272a;
              border: 1px solid rgba(45, 212, 191, 0.3);
              color: #2dd4bf;
              padding: 8px 10px;
              border-radius: 8px;
              font-size: 11px;
              font-weight: 500;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: space-between;
            ">
              <span style="display: flex; align-items: center; gap: 6px;">
                <span style="display: flex; align-items: center;">${ICONS.road}</span>
                <span>Mặt Đường Bám Dốc 3D</span>
              </span>
              <kbd style="font-size: 9px; font-family: monospace; background: #18181b; padding: 1px 4px; border-radius: 4px; color: #71717a;">G</kbd>
            </button>

            <button id="btn-snap-curb" style="
              background: #27272a;
              border: 1px solid rgba(245, 158, 11, 0.3);
              color: #fbbf24;
              padding: 8px 10px;
              border-radius: 8px;
              font-size: 11px;
              font-weight: 500;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: space-between;
            ">
              <span style="display: flex; align-items: center; gap: 6px;">
                <span style="display: flex; align-items: center;">${ICONS.curb}</span>
                <span>Vỉa Hè +15cm</span>
              </span>
              <kbd style="font-size: 9px; font-family: monospace; background: #18181b; padding: 1px 4px; border-radius: 4px; color: #71717a;">⌥G</kbd>
            </button>
          </div>

          <!-- GÁC LỀ NGHIÊNG ROLL & VI CHỈNH CENTIMET -->
          <div style="display: grid; grid-template-columns: 1.2fr 1fr; gap: 6px;">
            <button id="btn-snap-half-curb" style="
              background: rgba(244, 63, 94, 0.1);
              border: 1px solid rgba(244, 63, 94, 0.25);
              color: #fda4af;
              padding: 6px 8px;
              border-radius: 8px;
              font-size: 10px;
              font-weight: 500;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: space-between;
            ">
              <span style="display: flex; align-items: center; gap: 5px;">
                <span style="display: flex; align-items: center;">${ICONS.layers}</span>
                <span>Gác Lề Nghiêng Roll</span>
              </span>
              <kbd style="font-size: 8px; font-family: monospace; background: #18181b; padding: 1px 3px; border-radius: 3px; color: #71717a;">⇧G</kbd>
            </button>

            <div style="display: flex; gap: 3px; align-items: center;">
              <button class="btn-micro-z" data-delta="-5" title="Hạ 5cm" style="flex: 1; background: #18181b; border: 1px solid rgba(255,255,255,0.08); color: #d4d4d8; font-size: 9px; font-family: monospace; padding: 6px 0; border-radius: 6px; cursor: pointer;">-5</button>
              <button class="btn-micro-z" data-delta="-1" title="Hạ 1cm" style="flex: 1; background: #18181b; border: 1px solid rgba(255,255,255,0.08); color: #d4d4d8; font-size: 9px; font-family: monospace; padding: 6px 0; border-radius: 6px; cursor: pointer;">-1</button>
              <button class="btn-micro-z" data-delta="1" title="Nâng 1cm" style="flex: 1; background: #18181b; border: 1px solid rgba(255,255,255,0.08); color: #2dd4bf; font-size: 9px; font-family: monospace; padding: 6px 0; border-radius: 6px; cursor: pointer;">+1</button>
              <button class="btn-micro-z" data-delta="5" title="Nâng 5cm" style="flex: 1; background: #18181b; border: 1px solid rgba(255,255,255,0.08); color: #2dd4bf; font-size: 9px; font-family: monospace; padding: 6px 0; border-radius: 6px; cursor: pointer;">+5</button>
            </div>
          </div>

          <!-- VI CHỈNH GÓC DỐC SIDE VIEW (PITCH) -->
          <div style="display: flex; align-items: center; justify-content: space-between; background: #18181b; padding: 4px 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.06);">
            <span style="font-size: 10px; color: #a1a1aa; display: flex; align-items: center; gap: 4px;">
              <span style="color: #38bdf8; font-weight: bold;">↕</span> Dốc Side (Pitch)
            </span>
            <div style="display: flex; gap: 3px; align-items: center;">
              <button class="btn-micro-pitch" data-delta="-1" title="Chúc mũi xuống 1°" style="background: #27272a; border: 1px solid rgba(255,255,255,0.08); color: #d4d4d8; font-size: 9px; font-family: monospace; padding: 3px 6px; border-radius: 4px; cursor: pointer;">-1°</button>
              <button class="btn-micro-pitch" data-delta="-0.5" title="Chúc mũi xuống 0.5°" style="background: #27272a; border: 1px solid rgba(255,255,255,0.08); color: #d4d4d8; font-size: 9px; font-family: monospace; padding: 3px 5px; border-radius: 4px; cursor: pointer;">-0.5°</button>
              <button class="btn-micro-pitch" data-delta="0.5" title="Nâng mũi lên 0.5°" style="background: #27272a; border: 1px solid rgba(56, 189, 248, 0.2); color: #38bdf8; font-size: 9px; font-family: monospace; padding: 3px 5px; border-radius: 4px; cursor: pointer;">+0.5°</button>
              <button class="btn-micro-pitch" data-delta="1" title="Nâng mũi lên 1°" style="background: #27272a; border: 1px solid rgba(56, 189, 248, 0.2); color: #38bdf8; font-size: 9px; font-family: monospace; padding: 3px 6px; border-radius: 4px; cursor: pointer;">+1°</button>
            </div>
          </div>

          <!-- VI CHỈNH GÓC NGHIÊNG FRONT VIEW (ROLL) & RESET PHẲNG -->
          <div style="display: flex; align-items: center; justify-content: space-between; background: #18181b; padding: 4px 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.06);">
            <span style="font-size: 10px; color: #a1a1aa; display: flex; align-items: center; gap: 4px;">
              <span style="color: #f43f5e; font-weight: bold;">↔</span> Nghiêng Front (Roll)
            </span>
            <div style="display: flex; gap: 3px; align-items: center;">
              <button class="btn-micro-roll" data-delta="-1" title="Nghiêng phải 1°" style="background: #27272a; border: 1px solid rgba(255,255,255,0.08); color: #d4d4d8; font-size: 9px; font-family: monospace; padding: 3px 6px; border-radius: 4px; cursor: pointer;">-1°</button>
              <button class="btn-micro-roll" data-delta="-0.5" title="Nghiêng phải 0.5°" style="background: #27272a; border: 1px solid rgba(255,255,255,0.08); color: #d4d4d8; font-size: 9px; font-family: monospace; padding: 3px 5px; border-radius: 4px; cursor: pointer;">-0.5°</button>
              <button class="btn-micro-roll" data-delta="0.5" title="Nghiêng trái 0.5°" style="background: #27272a; border: 1px solid rgba(244, 63, 94, 0.2); color: #fda4af; font-size: 9px; font-family: monospace; padding: 3px 5px; border-radius: 4px; cursor: pointer;">+0.5°</button>
              <button class="btn-micro-roll" data-delta="1" title="Nghiêng trái 1°" style="background: #27272a; border: 1px solid rgba(244, 63, 94, 0.2); color: #fda4af; font-size: 9px; font-family: monospace; padding: 3px 6px; border-radius: 4px; cursor: pointer;">+1°</button>
              <button id="btn-reset-slope" title="Đặt lại dốc phẳng 0° (Reset Pitch & Roll)" style="background: #27272a; border: 1px solid rgba(255,255,255,0.15); color: #e4e4e7; font-size: 9px; font-family: monospace; padding: 3px 5px; border-radius: 4px; cursor: pointer; margin-left: 1px;">0°</button>
            </div>
          </div>
        </div>
      `;
      }
      this.container.innerHTML = `
      <!-- SHADCN CARD HEADER (DRAGGABLE HANDLE) -->
      <div id="floating-drag-header" style="
        padding: 10px 14px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(24, 24, 27, 0.75);
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: grab;
      ">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="color: #71717a; display: flex;">${ICONS.grip}</span>
          <span style="color: #10b981; display: flex;">${ICONS.box}</span>
          <span style="font-weight: 600; font-size: 13px; letter-spacing: -0.2px; color: #fafafa;">CVAT 3D Suite</span>
          <span style="
            font-size: 10px;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            background: #27272a;
            color: #10b981;
            padding: 2px 6px;
            border-radius: 6px;
            border: 1px solid rgba(255,255,255,0.06);
            font-weight: 600;
          ">${jobText}</span>
        </div>

        <div style="display: flex; align-items: center; gap: 4px;">
          <button id="floating-btn-fullscreen" title="Mở Rộng Toàn Màn Hình · Duyệt Toàn Bộ Track ID (Shift+F)" style="
            background: rgba(37, 99, 235, 0.15);
            border: 1px solid rgba(37, 99, 235, 0.3);
            color: #60a5fa;
            cursor: pointer;
            padding: 4px 6px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 10px;
            font-weight: 600;
          ">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
            <span>Full</span>
          </button>
          <button id="floating-btn-sync-frame" title="Quét lại xe frame này" style="
            background: transparent;
            border: none;
            color: #71717a;
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            display: flex;
            align-items: center;
          ">
            ${ICONS.refresh}
          </button>
          <button id="floating-btn-minimize" title="Thu nhỏ (\`)" style="
            background: transparent;
            border: none;
            color: #71717a;
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            display: flex;
            align-items: center;
          ">
            ${ICONS.minimize}
          </button>
        </div>
      </div>

      <!-- MAIN CONTAINER BODY -->
      <div style="
        padding: 12px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 10px;
      ">
        <!-- KHỐI 1: DROPDOWN SELECT DANH SÁCH XE (SEARCHABLE COMBOBOX) -->
        <div style="
          background: rgba(24, 24, 27, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 10px 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          position: relative;
        ">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 11px; font-weight: 700; color: #f4f4f5; display: flex; align-items: center; gap: 5px;">
              <span>Xe tại Frame #${this.currentFrameNumber}</span>
              <span style="color: #71717a; font-weight: normal;">(${this.frameTracks.length})</span>
            </span>
            <span style="
              font-size: 9px;
              font-family: ui-monospace, monospace;
              color: #10b981;
              background: rgba(16, 185, 129, 0.12);
              border: 1px solid rgba(16, 185, 129, 0.25);
              padding: 1px 6px;
              border-radius: 4px;
              font-weight: 600;
            ">CANVAS AUTO-SELECT</span>
          </div>

          <!-- HEADER SELECT BUTTON & PREV/NEXT -->
          <div style="display: flex; gap: 6px; align-items: center;">
            <button id="btn-dropdown-toggle" style="
              flex: 1;
              background: #18181b;
              border: 1px solid ${this.isDropdownOpen ? "#10b981" : "rgba(255, 255, 255, 0.12)"};
              color: #f4f4f5;
              padding: 7px 10px;
              border-radius: 8px;
              font-size: 12px;
              font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
              font-weight: 600;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: space-between;
              transition: all 0.15s;
            ">
              <span style="display: flex; align-items: center; gap: 6px;">
                <span style="color: #10b981;">${this.selectedUiId ? `#${this.selectedUiId}` : "#0"}</span>
                <span style="font-weight: 500; font-size: 11px; color: #e4e4e7;">${this.selectedUiId ? this.currentLabel : "Chưa chọn xe"}</span>
              </span>
              <span style="color: #71717a; font-size: 10px;">${this.isDropdownOpen ? "▲" : "▼"}</span>
            </button>

            <!-- NÚT PREV / NEXT -->
            <button id="btn-prev-frame-track" title="Xe trước (Phím [)" style="
              background: #18181b;
              border: 1px solid rgba(255,255,255,0.08);
              color: #d4d4d8;
              padding: 6px 8px;
              border-radius: 6px;
              cursor: pointer;
              display: flex;
              align-items: center;
            ">
              ${ICONS.chevronLeft}
            </button>
            <button id="btn-next-frame-track" title="Xe kế (Phím ])" style="
              background: #18181b;
              border: 1px solid rgba(255,255,255,0.08);
              color: #d4d4d8;
              padding: 6px 8px;
              border-radius: 6px;
              cursor: pointer;
              display: flex;
              align-items: center;
            ">
              ${ICONS.chevronRight}
            </button>
          </div>

          <!-- DROPDOWN POPOVER MENU (NẾU ĐANG MỞ) -->
          ${this.isDropdownOpen ? `
            <div id="dropdown-menu-popover" style="
              background: #18181b;
              border: 1px solid rgba(255, 255, 255, 0.15);
              border-radius: 8px;
              padding: 6px;
              box-shadow: 0 10px 25px rgba(0, 0, 0, 0.6);
              display: flex;
              flex-direction: column;
              gap: 4px;
              max-height: 220px;
              overflow-y: auto;
              z-index: 1000;
            ">
              <!-- Ô TÌM KIẾM NHANH -->
              <input id="input-dropdown-search" type="text" placeholder="Tìm ID (#1) hoặc loại xe..." value="${this.searchKeyword}" style="
                background: #09090b;
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 6px;
                color: #f4f4f5;
                font-size: 11px;
                padding: 5px 8px;
                outline: none;
                font-family: inherit;
                margin-bottom: 2px;
              " />

              <!-- DANH SÁCH ITEM -->
              <div style="display: flex; flex-direction: column; gap: 2px;">
                ${dropdownItemsHtml}
              </div>
            </div>
          ` : ""}
        </div>

        <!-- THẺ THÔNG SỐ TÓM TẮT CỦA XE ĐANG CHỌN -->
        <div style="
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 4px;
          font-size: 10px;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          background: rgba(24, 24, 27, 0.55);
          padding: 6px 8px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          color: #a1a1aa;
        ">
          <div><span style="color: #71717a;">X:</span> ${this.currentX}</div>
          <div><span style="color: #71717a;">Y:</span> ${this.currentY}</div>
          <div><span style="color: #71717a;">Z:</span> ${this.currentZ}</div>
          <div><span style="color: #71717a;">Yaw:</span> <span style="color: #10b981; font-weight: bold;">${this.currentYawDeg}°</span></div>
        </div>

        <!-- NÚT MỞ RỘNG FULLSCREEN TRACK EDITOR (CASE 2 - DUYỆT THEO ID) -->
        <button id="btn-banner-fullscreen-editor" title="Mở Rộng Toàn Màn Hình · Duyệt Toàn Bộ Track ID (Shift+M)" style="
          background: linear-gradient(135deg, rgba(37, 99, 235, 0.2), rgba(30, 64, 175, 0.3));
          border: 1px solid rgba(59, 130, 246, 0.4);
          color: #93c5fd;
          padding: 7px 10px;
          border-radius: 8px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: space-between;
          transition: all 0.15s;
        ">
          <span style="display: flex; align-items: center; gap: 6px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
            <span>Duyệt Toàn Track ID (Full Screen)</span>
          </span>
          <kbd style="font-size: 9px; font-family: monospace; background: rgba(0,0,0,0.4); padding: 1px 4px; border-radius: 3px; color: #bfdbfe;">⇧M</kbd>
        </button>

        <!-- THANH TAB NAVIGATION THEO MODULE CHUYÊN BIỆT -->
        <div style="
          display: flex;
          background: #18181b;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          padding: 3px;
          gap: 3px;
        ">
          <button class="nav-tab-btn" data-tab="dimensions" style="
            flex: 1;
            padding: 5px 6px;
            border-radius: 6px;
            border: none;
            background: ${this.activeTab === "dimensions" ? "rgba(16, 185, 129, 0.2)" : "transparent"};
            color: ${this.activeTab === "dimensions" ? "#6ee7b7" : "#71717a"};
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
            transition: all 0.12s;
          ">
            <span style="display: flex; align-items: center;">${ICONS.ruler}</span>
            <span>Kích Thước</span>
          </button>
          <button class="nav-tab-btn" data-tab="rotation" style="
            flex: 1;
            padding: 5px 6px;
            border-radius: 6px;
            border: none;
            background: ${this.activeTab === "rotation" ? "rgba(16, 185, 129, 0.2)" : "transparent"};
            color: ${this.activeTab === "rotation" ? "#6ee7b7" : "#71717a"};
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
            transition: all 0.12s;
          ">
            <span style="display: flex; align-items: center;">${ICONS.compass}</span>
            <span>Hướng Xoay</span>
          </button>
          <button class="nav-tab-btn" data-tab="ground" style="
            flex: 1;
            padding: 5px 6px;
            border-radius: 6px;
            border: none;
            background: ${this.activeTab === "ground" ? "rgba(16, 185, 129, 0.2)" : "transparent"};
            color: ${this.activeTab === "ground" ? "#6ee7b7" : "#71717a"};
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
            transition: all 0.12s;
          ">
            <span style="display: flex; align-items: center;">${ICONS.alignBottom}</span>
            <span>Ghim Đất</span>
          </button>
        </div>

        <!-- NỘI DUNG MODULE ĐANG CHỌN -->
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${tabContentHtml}
        </div>
      </div>

      <!-- CARD FOOTER -->
      <div style="
        padding: 8px 14px;
        background: rgba(24, 24, 27, 0.5);
        border-top: 1px solid rgba(255, 255, 255, 0.06);
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 10px;
        color: #71717a;
        font-family: ui-monospace, monospace;
      ">
        <span>300K LIDAR FIT</span>
        <span style="color: #10b981; display: flex; align-items: center; gap: 4px;">
          <span style="width: 5px; height: 5px; border-radius: 50%; background: #10b981;"></span>
          CANVAS AUTO-SELECT
        </span>
      </div>
    `;
      if (this.toastOverlay) {
        this.container.appendChild(this.toastOverlay);
      }
      const tabBtns = this.container.querySelectorAll(".nav-tab-btn");
      tabBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
          const tab = btn.dataset.tab;
          if (tab && tab !== this.activeTab) {
            this.activeTab = tab;
            this.updateContent();
          }
        });
      });
      const minBtn = this.container.querySelector("#floating-btn-minimize");
      if (minBtn) minBtn.addEventListener("click", () => this.toggleMinimize());
      const syncBtn = this.container.querySelector("#floating-btn-sync-frame");
      if (syncBtn) {
        syncBtn.addEventListener("click", async () => {
          this.showToast("Đang quét lại xe ở frame này...", "info");
          await this.syncFrameTracks();
        });
      }
      const dropdownToggle = this.container.querySelector("#btn-dropdown-toggle");
      if (dropdownToggle) {
        dropdownToggle.addEventListener("click", () => {
          this.isDropdownOpen = !this.isDropdownOpen;
          this.updateContent();
          if (this.isDropdownOpen) {
            setTimeout(() => {
              var _a;
              const inputSearch2 = (_a = this.container) == null ? void 0 : _a.querySelector("#input-dropdown-search");
              if (inputSearch2) inputSearch2.focus();
            }, 60);
          }
        });
      }
      const inputSearch = this.container.querySelector("#input-dropdown-search");
      if (inputSearch) {
        inputSearch.addEventListener("input", (e) => {
          var _a;
          this.searchKeyword = e.target.value;
          const popover = (_a = this.container) == null ? void 0 : _a.querySelector("#dropdown-menu-popover");
          if (popover) {
            const filtered = this.frameTracks.filter((t) => {
              if (!this.searchKeyword.trim()) return true;
              const kw = this.searchKeyword.trim().toLowerCase().replace("#", "");
              return String(t.uiId).includes(kw) || t.label.toLowerCase().includes(kw);
            });
            const itemsContainer = popover.querySelector("div:last-child");
            if (itemsContainer) {
              itemsContainer.innerHTML = filtered.map((t) => {
                const isSelected = t.uiId === this.selectedUiId;
                return `
                  <div class="dropdown-track-item" data-uiid="${t.uiId}" style="
                    padding: 6px 10px;
                    border-radius: 6px;
                    background: ${isSelected ? "rgba(16, 185, 129, 0.2)" : "transparent"};
                    border: 1px solid ${isSelected ? "rgba(16, 185, 129, 0.4)" : "transparent"};
                    color: ${isSelected ? "#6ee7b7" : "#e4e4e7"};
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    font-family: ui-monospace, monospace;
                    font-size: 11px;
                    transition: background 0.12s;
                  ">
                    <span style="display: flex; align-items: center; gap: 8px;">
                      <span style="font-weight: 700; color: ${isSelected ? "#10b981" : "#a1a1aa"};">#${t.uiId}</span>
                      <span style="color: #fafafa; font-weight: 500;">${t.label}</span>
                    </span>
                    <span style="font-size: 10px; color: #71717a;">
                      Z: ${t.z}m • ${t.yawDeg}°
                    </span>
                  </div>
                `;
              }).join("");
              itemsContainer.querySelectorAll(".dropdown-track-item").forEach((item) => {
                item.addEventListener("click", () => {
                  const id = parseInt(item.dataset.uiid || "0", 10);
                  if (id > 0) {
                    this.selectTrackByUiId(id);
                    this.isDropdownOpen = false;
                    this.updateContent();
                  }
                });
              });
            }
          }
        });
      }
      const dropdownItems = this.container.querySelectorAll(".dropdown-track-item");
      dropdownItems.forEach((item) => {
        item.addEventListener("click", () => {
          const id = parseInt(item.dataset.uiid || "0", 10);
          if (id > 0) {
            this.selectTrackByUiId(id);
            this.isDropdownOpen = false;
            this.updateContent();
          }
        });
      });
      const prevBtn = this.container.querySelector("#btn-prev-frame-track");
      if (prevBtn) prevBtn.addEventListener("click", () => this.selectPrevTrack());
      const nextBtn = this.container.querySelector("#btn-next-frame-track");
      if (nextBtn) nextBtn.addEventListener("click", () => this.selectNextTrack());
      const scopeToggle = this.container.querySelector("#btn-toggle-scope");
      if (scopeToggle) {
        scopeToggle.addEventListener("click", () => {
          this.applyToTrack = !this.applyToTrack;
          this.updateContent();
          this.showToast(`Phạm vi: ${this.applyToTrack ? "Toàn Bộ Track" : "Chỉ Frame Này"}`, "info");
        });
      }
      const stepBtns = this.container.querySelectorAll(".btn-step");
      stepBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
          const axis = btn.dataset.axis;
          const delta = parseFloat(btn.dataset.delta || "0");
          if (axis && delta !== 0) {
            this.handleStepDimension(axis, delta);
          }
        });
      });
      const inpL = this.container.querySelector("#input-dim-l");
      const inpW = this.container.querySelector("#input-dim-w");
      const inpH = this.container.querySelector("#input-dim-h");
      if (inpL) inpL.addEventListener("change", () => this.editL = parseFloat(inpL.value) || this.currentL);
      if (inpW) inpW.addEventListener("change", () => this.editW = parseFloat(inpW.value) || this.currentW);
      if (inpH) inpH.addEventListener("change", () => this.editH = parseFloat(inpH.value) || this.currentH);
      const applyDimBtn = this.container.querySelector("#btn-apply-dimensions");
      if (applyDimBtn) {
        applyDimBtn.addEventListener("click", () => {
          const l = inpL ? parseFloat(inpL.value) : this.editL;
          const w = inpW ? parseFloat(inpW.value) : this.editW;
          const h = inpH ? parseFloat(inpH.value) : this.editH;
          this.handleUpdateDimensions(l, w, h, this.applyToTrack);
        });
      }
      const tightFitBtn = this.container.querySelector("#btn-tight-fit");
      if (tightFitBtn) {
        tightFitBtn.addEventListener("click", () => this.handleTightFit());
      }
      const catalogFitBtn = this.container.querySelector("#btn-catalog-fit");
      if (catalogFitBtn) {
        catalogFitBtn.addEventListener("click", () => this.handleCatalogFit());
      }
      const autoFitBtn = this.container.querySelector("#btn-auto-fit-points");
      if (autoFitBtn) {
        autoFitBtn.addEventListener("click", () => this.handleTightFit());
      }
      const smartAnchorBtn = this.container.querySelector("#btn-smart-anchor-fit");
      if (smartAnchorBtn) {
        smartAnchorBtn.addEventListener("click", () => this.handleSmartAnchorFit());
      }
      const catalogBtns = this.container.querySelectorAll(".catalog-btn");
      catalogBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
          const l = parseFloat(btn.dataset.l || "0");
          const w = parseFloat(btn.dataset.w || "0");
          const h = parseFloat(btn.dataset.h || "0");
          if (l > 0 && w > 0 && h > 0) {
            this.handleUpdateDimensions(l, w, h, this.applyToTrack);
          }
        });
      });
      const flipFrameBtn = this.container.querySelector("#btn-flip-frame");
      if (flipFrameBtn) flipFrameBtn.addEventListener("click", () => this.handleFlipYaw(true));
      const flipTrackBtn = this.container.querySelector("#btn-flip-track");
      if (flipTrackBtn) flipTrackBtn.addEventListener("click", () => this.handleFlipYaw(false));
      const rotBtns = this.container.querySelectorAll(".btn-rot");
      rotBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
          var _a;
          const deg = parseInt(btn.dataset.deg || "0", 10);
          if (deg !== 0) {
            let newDeg = Math.round(this.currentYawDeg + deg);
            while (newDeg > 180) newDeg -= 360;
            while (newDeg < -180) newDeg += 360;
            const rad = newDeg * Math.PI / 180;
            if (this.selectedUiId && ((_a = this.currentCtx) == null ? void 0 : _a.jobId)) {
              window.dispatchEvent(
                new CustomEvent("CVAT_EXT_REQ_FLIP_YAW", {
                  detail: {
                    jobId: this.currentCtx.jobId,
                    frame: this.currentFrameNumber,
                    uiId: this.selectedUiId,
                    serverId: this.selectedServerId,
                    currentFrameOnly: !this.applyToTrack,
                    customYawRad: rad
                  }
                })
              );
              this.currentYawDeg = newDeg;
              this.showToast(`Xoay ${deg > 0 ? "+" : ""}${deg}° ➔ Yaw: ${newDeg}°`, "success");
              this.updateContent();
            }
          }
        });
      });
      const snapRoadBtn = this.container.querySelector("#btn-snap-road");
      if (snapRoadBtn) snapRoadBtn.addEventListener("click", () => this.handleSnapGround("road"));
      const snapCurbBtn = this.container.querySelector("#btn-snap-curb");
      if (snapCurbBtn) snapCurbBtn.addEventListener("click", () => this.handleSnapGround("curb", { curbHeight: 0.15 }));
      const snapHalfCurbBtn = this.container.querySelector("#btn-snap-half-curb");
      if (snapHalfCurbBtn) snapHalfCurbBtn.addEventListener("click", () => this.handleSnapGround("half_curb", { curbHeight: 0.15 }));
      const microBtns = this.container.querySelectorAll(".btn-micro-z");
      microBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
          const delta = parseInt(btn.dataset.delta || "0", 10);
          if (delta !== 0) {
            this.handleSnapGround("micro_adjust", { deltaCm: delta });
          }
        });
      });
      const microPitchBtns = this.container.querySelectorAll(".btn-micro-pitch");
      microPitchBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
          const deltaDeg = parseFloat(btn.dataset.delta || "0");
          if (deltaDeg !== 0) {
            this.handleSnapGround("micro_adjust_pitch", { deltaDeg });
          }
        });
      });
      const microRollBtns = this.container.querySelectorAll(".btn-micro-roll");
      microRollBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
          const deltaDeg = parseFloat(btn.dataset.delta || "0");
          if (deltaDeg !== 0) {
            this.handleSnapGround("micro_adjust_roll", { deltaDeg });
          }
        });
      });
      const resetSlopeBtn = this.container.querySelector("#btn-reset-slope");
      if (resetSlopeBtn) {
        resetSlopeBtn.addEventListener("click", () => {
          this.handleSnapGround("reset_slope");
        });
      }
      const fullscreenHeaderBtn = this.container.querySelector("#floating-btn-fullscreen");
      if (fullscreenHeaderBtn) {
        fullscreenHeaderBtn.addEventListener("click", () => this.openFullscreenEditor());
      }
      const fullscreenBannerBtn = this.container.querySelector("#btn-banner-fullscreen-editor");
      if (fullscreenBannerBtn) {
        fullscreenBannerBtn.addEventListener("click", () => this.openFullscreenEditor());
      }
    }
    /**
     * Mở giao diện toàn màn hình duyệt và chỉnh sửa toàn bộ track của xe (Label Helper Style)
     */
    openFullscreenEditor() {
      if (!this.currentCtx || !this.currentCtx.jobId) {
        this.showToast("Chưa kết nối Job CVAT!", "warning");
        return;
      }
      const firstTrack = this.frameTracks[0];
      const targetUiId = this.selectedUiId !== null ? this.selectedUiId : firstTrack ? firstTrack.uiId : 1;
      const targetServerId = this.selectedServerId || (firstTrack ? firstTrack.serverId : void 0);
      this.trackStudioModal.open(
        this.currentCtx,
        targetUiId,
        targetServerId,
        this.frameTracks
      );
    }
    destroy() {
      if (this.pollInterval) {
        clearInterval(this.pollInterval);
        this.pollInterval = null;
      }
      if (this.toastTimer) {
        clearTimeout(this.toastTimer);
        this.toastTimer = null;
      }
      if (this.container && this.container.parentNode) {
        this.container.parentNode.removeChild(this.container);
        this.container = null;
      }
      if (this.miniPill && this.miniPill.parentNode) {
        this.miniPill.parentNode.removeChild(this.miniPill);
        this.miniPill = null;
      }
    }
  }
  console.log("[CVAT 3D Suite] Đang khởi động cửa sổ nổi Floating shadcn/ui...");
  const panel = new FloatingPanel();
  function updateContext() {
    const ctx = detectCVAT();
    if (!ctx.isCVAT) {
      panel.destroy();
      return;
    }
    panel.render(ctx);
  }
  function setupGlobalHotkeys() {
    window.addEventListener("keydown", (e) => {
      const target = e.target;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        return;
      }
      if (e.key === "`") {
        e.preventDefault();
        panel.toggleMinimize();
        return;
      }
      if (e.shiftKey && (e.key === "M" || e.key === "m")) {
        e.preventDefault();
        console.log("[CVAT 3D Suite] Phím tắt Shift+M: Mở Fullscreen Track Editor");
        panel.openFullscreenEditor();
        return;
      }
      if (e.shiftKey && (e.key === "F" || e.key === "f")) {
        e.preventDefault();
        console.log("[CVAT 3D Suite] Phím tắt Shift+F: Lật toàn bộ Track");
        panel.handleFlipYaw(false);
        return;
      }
      if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === "F" || e.key === "f")) {
        e.preventDefault();
        console.log("[CVAT 3D Suite] Phím tắt F: Lật Frame hiện tại");
        panel.handleFlipYaw(true);
        return;
      }
      if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === "[") {
        e.preventDefault();
        panel.selectPrevTrack();
        return;
      }
      if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === "]") {
        e.preventDefault();
        panel.selectNextTrack();
        return;
      }
      if (e.altKey && (e.key === "G" || e.key === "g")) {
        e.preventDefault();
        console.log("[CVAT 3D Suite] Phím tắt Alt+G: Ghim Nền Vỉa Hè (+15cm)");
        panel.handleSnapGround("curb", { curbHeight: 0.15 });
        return;
      }
      if (e.shiftKey && (e.key === "G" || e.key === "g")) {
        e.preventDefault();
        console.log("[CVAT 3D Suite] Phím tắt Shift+G: Xe Gác Lề Vỉa Hè");
        panel.handleSnapGround("half_curb", { curbHeight: 0.15 });
        return;
      }
      if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === "G" || e.key === "g")) {
        e.preventDefault();
        console.log("[CVAT 3D Suite] Phím tắt G: Ghim Mặt Đường");
        panel.handleSnapGround("road");
        return;
      }
      if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === "T" || e.key === "t")) {
        e.preventDefault();
        console.log("[CVAT 3D Suite] Phím tắt T: Ôm Sát Cụm Điểm (Tight Fit)");
        panel.handleTightFit();
        return;
      }
      if (e.shiftKey && (e.key === "B" || e.key === "b")) {
        e.preventDefault();
        console.log("[CVAT 3D Suite] Phím tắt Shift+B: Khớp Chuẩn Catalog");
        panel.handleCatalogFit();
        return;
      }
      if (e.key === "PageUp") {
        e.preventDefault();
        panel.handleSnapGround("micro_adjust", { deltaCm: 1 });
        return;
      }
      if (e.key === "PageDown") {
        e.preventDefault();
        panel.handleSnapGround("micro_adjust", { deltaCm: -1 });
        return;
      }
    });
  }
  function bootstrap() {
    updateContext();
    setupGlobalHotkeys();
    window.addEventListener("popstate", updateContext);
    const originalPushState = history.pushState;
    history.pushState = function(...args) {
      originalPushState.apply(this, args);
      setTimeout(updateContext, 300);
    };
    const originalReplaceState = history.replaceState;
    history.replaceState = function(...args) {
      originalReplaceState.apply(this, args);
      setTimeout(updateContext, 300);
    };
    let checkCount = 0;
    const interval = setInterval(() => {
      checkCount++;
      updateContext();
      if (checkCount >= 8) {
        clearInterval(interval);
      }
    }, 1200);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();
