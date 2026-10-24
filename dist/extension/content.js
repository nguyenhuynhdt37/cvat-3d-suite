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
    // Điều hướng Track
    chevronLeft: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`,
    chevronRight: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`,
    refresh: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`,
    flip: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 7 5 5-5 5V7"/><path d="m21 7-5 5 5 5V7"/><path d="M12 20v2"/><path d="M12 14v2"/><path d="M12 8v2"/><path d="M12 2v2"/></svg>`,
    // Thao tác Kích thước & Fit
    save: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg>`,
    sparkles: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/></svg>`,
    // Địa hình & Ghim mặt đất
    road: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19 8 5"/><path d="m16 5 4 14"/><path d="M12 8v2"/><path d="M12 14v2"/></svg>`,
    // Cửa sổ & Điều khiển
    minimize: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/></svg>`,
    // Trạng thái Toast
    checkCircle: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>`,
    infoCircle: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
    alertCircle: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>`,
    xCircle: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>`,
    // Phân loại đối tượng & Tinh chỉnh
    car: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>`,
    user: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
    bicycle: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>`,
    chevronDown: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
    chevronUp: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>`,
    sliders: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="1" x2="7" y1="14" y2="14"/><line x1="9" x2="15" y1="8" y2="8"/><line x1="17" x2="23" y1="16" y2="16"/></svg>`,
    // Icon định hướng Fit phẳng 2D (Thay thế emoji 🔝, ↔️, ↕️)
    arrowUp: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>`,
    arrowRightLeft: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>`,
    arrowUpDown: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/><path d="m21 16-4 4-4-4"/><path d="M17 20V4"/></svg>`,
    // Điều khiển Modal & Lọc dữ liệu
    close: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
    undo: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>`,
    eyeOff: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>`,
    eye: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
    camera: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>`,
    cameraFocus: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3"/></svg>`,
    box3d: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 16-9 5-9-5V8l9-5 9 5v8Z"/><path d="M3.27 6.96 12 12.01l8.73-5.05"/><path d="M12 22.08V12"/></svg>`,
    target: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`
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
  function normalizeAngle(rad) {
    let angle = rad;
    while (angle > Math.PI) {
      angle -= 2 * Math.PI;
    }
    while (angle < -Math.PI) {
      angle += 2 * Math.PI;
    }
    return angle;
  }
  function radToDeg(rad) {
    return Number((rad * 180 / Math.PI).toFixed(2));
  }
  function filterDenseConnectedCluster1D(pts, axis, maxGap = 0.22, centerBias = 0) {
    if (pts.length < 8) return pts;
    const sorted = [...pts].sort((a, b) => a[axis] - b[axis]);
    const clusters = [];
    let currentCluster = [sorted[0]];
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
  function detectAdaptiveBounds(sortedValues, isYAxis = false) {
    const n = sortedValues.length;
    if (n < 8) {
      return { min: sortedValues[0] ?? 0, max: sortedValues[n - 1] ?? 0 };
    }
    const pMinIdx = Math.max(0, Math.floor(n * 5e-3));
    const pMaxIdx = Math.min(n - 1, Math.floor(n * 0.995));
    let minVal = sortedValues[pMinIdx];
    let maxVal = sortedValues[pMaxIdx];
    const minGap = isYAxis ? 0.14 : 0.25;
    const maxNoisePoints = Math.max(2, Math.min(12, Math.floor(n * 0.06)));
    for (let i = n - 1; i >= Math.floor(n * 0.65); i--) {
      const gap = sortedValues[i] - sortedValues[i - 1];
      const pointsAfter = n - i;
      if (gap >= minGap && pointsAfter <= maxNoisePoints) {
        maxVal = sortedValues[i - 1];
        break;
      }
    }
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
      max: Number(maxVal.toFixed(2))
    };
  }
  function detectLateralWallBoundsWithStatus(pts, halfW, visibleLateral, binSize = 0.025) {
    const isLeft = visibleLateral === "left";
    const sidePts = pts.filter((p) => isLeft ? p.ly > 0 : p.ly < 0);
    if (sidePts.length < 4) {
      return { edge: isLeft ? halfW : -halfW, found: false, peakCount: 0 };
    }
    const minRange = Math.max(0.1, halfW - 0.35);
    const maxRange = halfW + 0.35;
    const numBins = Math.ceil(maxRange / binSize) + 1;
    const bins = new Array(numBins).fill(0);
    const binMaxLy = new Array(numBins).fill(-Infinity);
    const binMinLy = new Array(numBins).fill(Infinity);
    for (const p of sidePts) {
      const absLy = Math.abs(p.ly);
      if (absLy <= maxRange) {
        const idx = Math.min(numBins - 1, Math.floor(absLy / binSize));
        bins[idx]++;
        if (p.ly > binMaxLy[idx]) binMaxLy[idx] = p.ly;
        if (p.ly < binMinLy[idx]) binMinLy[idx] = p.ly;
      }
    }
    const startBin = Math.floor(minRange / binSize);
    const endBin = Math.min(numBins - 1, Math.floor(maxRange / binSize));
    let peakCount = 0;
    let peakIdx = startBin;
    for (let i = startBin; i <= endBin; i++) {
      if (bins[i] >= peakCount && bins[i] > 0) {
        peakCount = bins[i];
        peakIdx = i;
      }
    }
    if (peakCount < 2) {
      return { edge: isLeft ? halfW : -halfW, found: false, peakCount };
    }
    const minWallDensity = Math.max(2, Math.floor(peakCount * 0.12));
    let wallIdx = peakIdx;
    for (let i = peakIdx; i <= endBin; i++) {
      if (bins[i] >= minWallDensity) {
        wallIdx = i;
      } else {
        break;
      }
    }
    const edge = isLeft ? binMaxLy[wallIdx] !== -Infinity ? Number(binMaxLy[wallIdx].toFixed(3)) : halfW : binMinLy[wallIdx] !== Infinity ? Number(binMinLy[wallIdx].toFixed(3)) : -halfW;
    return { edge, found: true, peakCount };
  }
  function detectLateralWallBounds(pts, halfW, visibleLateral, binSize = 0.025) {
    return detectLateralWallBoundsWithStatus(pts, halfW, visibleLateral, binSize).edge;
  }
  function computeIntensityWeights(pts) {
    const n = pts.length;
    if (n === 0) {
      return { weights: [], hasValidIntensity: false, highIntensityThreshold: 0 };
    }
    const intensities = [];
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
        weights: new Array(n).fill(1),
        hasValidIntensity: false,
        highIntensityThreshold: 0
      };
    }
    const sorted = [...intensities].sort((a, b) => a - b);
    const minI = sorted[0];
    const maxI = sorted[sorted.length - 1];
    if (maxI - minI < 15) {
      return {
        weights: new Array(n).fill(1),
        hasValidIntensity: false,
        highIntensityThreshold: maxI
      };
    }
    const p75Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.75));
    const highIntensityThreshold = Math.max(minI + 15, sorted[p75Idx]);
    const range = maxI - minI;
    const weights = new Array(n);
    for (let i = 0; i < n; i++) {
      const norm = Math.max(0, Math.min(1, (intensities[i] - minI) / range));
      weights[i] = 1 + 1.5 * norm;
    }
    return {
      weights,
      hasValidIntensity: true,
      highIntensityThreshold
    };
  }
  function detectDominantWallEdgeWithValleyCutoff(pts, axis, direction, nominalHalf, options = {}) {
    const isPos = direction === "positive";
    const orthAxis = axis === "ly" ? "lx" : "ly";
    const binSize = options.binSize ?? 0.03;
    const minSpanOrth = options.minSpanOrthogonal ?? (axis === "ly" ? 0.7 : 0.6);
    const maxSearchExt = options.maxSearchExtension ?? 0.35;
    const candidatePts = pts.filter((p) => isPos ? p[axis] > 0.02 : p[axis] < -0.02);
    if (candidatePts.length < 3) {
      return {
        edge: isPos ? nominalHalf : -nominalHalf,
        wallPoints: candidatePts,
        peakDensity: candidatePts.length
      };
    }
    const intensityData = options.useIntensity !== false ? computeIntensityWeights(candidatePts) : null;
    const weights = (intensityData == null ? void 0 : intensityData.weights) || new Array(candidatePts.length).fill(1);
    const highThreshold = (intensityData == null ? void 0 : intensityData.highIntensityThreshold) ?? Infinity;
    const hasValidIntensity = (intensityData == null ? void 0 : intensityData.hasValidIntensity) ?? false;
    const maxDist = nominalHalf + maxSearchExt;
    const numBins = Math.ceil(maxDist / binSize) + 2;
    const bins = Array.from(
      { length: numBins },
      () => []
    );
    const binWeights = new Array(numBins).fill(0);
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
    if (maxWeight < 2) {
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
        peakDensity: 0
      };
    }
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
    const collectedWallPoints = [];
    for (let b = 0; b <= outerWallBin; b++) {
      for (const item of bins[b]) {
        collectedWallPoints.push(item.pt);
      }
    }
    const outerEdgeItems = [];
    const edgeStartBin = Math.max(0, outerWallBin - 3);
    for (let b = edgeStartBin; b <= outerWallBin; b++) {
      for (const item of bins[b]) {
        outerEdgeItems.push(item);
      }
    }
    if (outerEdgeItems.length >= 3) {
      const brightItems = outerEdgeItems.filter((i) => i.isBright);
      const targetItems = brightItems.length >= 2 ? brightItems : outerEdgeItems;
      const dists = targetItems.map((item) => isPos ? item.pt[axis] : -item.pt[axis]).sort((a, b) => a - b);
      const pIdx = Math.max(0, Math.min(dists.length - 1, Math.floor(dists.length * 0.95)));
      const chosenDist = dists[pIdx];
      const edge2 = isPos ? Number(chosenDist.toFixed(3)) : Number((-chosenDist).toFixed(3));
      return {
        edge: edge2,
        wallPoints: collectedWallPoints,
        peakDensity: Math.round(maxWeight)
      };
    }
    const fallbackDist = (outerWallBin + 1) * binSize;
    const edge = isPos ? Number(fallbackDist.toFixed(3)) : Number((-fallbackDist).toFixed(3));
    return {
      edge,
      wallPoints: collectedWallPoints.length > 0 ? collectedWallPoints : candidatePts,
      peakDensity: Math.round(maxWeight)
    };
  }
  function straightenYawFromBoundaryEdge(pts, currentYaw, _L, _W, visibleLateral, options = {}) {
    const maxAdjDeg = options.maxAdjustmentDeg ?? 8;
    const maxAdjRad = maxAdjDeg * Math.PI / 180;
    const intensityData = options.useIntensity !== false ? computeIntensityWeights(pts) : null;
    const highThreshold = (intensityData == null ? void 0 : intensityData.highIntensityThreshold) ?? Infinity;
    const hasValidIntensity = (intensityData == null ? void 0 : intensityData.hasValidIntensity) ?? false;
    const leftPts = pts.filter((p) => p.ly > 0);
    const rightPts = pts.filter((p) => p.ly < 0);
    let sidePts;
    let isTargetLeft;
    if (leftPts.length >= 8 && leftPts.length > rightPts.length * 1.3) {
      sidePts = leftPts;
      isTargetLeft = true;
    } else if (rightPts.length >= 8 && rightPts.length > leftPts.length * 1.3) {
      sidePts = rightPts;
      isTargetLeft = false;
    } else {
      const isLeft = visibleLateral === "left";
      const preferredPts = isLeft ? leftPts : rightPts;
      if (preferredPts.length >= 8) {
        sidePts = preferredPts;
        isTargetLeft = isLeft;
      } else {
        sidePts = pts;
        isTargetLeft = isLeft;
      }
    }
    if (sidePts.length < 8) {
      return {
        newYawRad: currentYaw,
        newYawDeg: Number((currentYaw * 180 / Math.PI).toFixed(2)),
        deltaYawDeg: 0,
        slope: 0
      };
    }
    const sortedLx = sidePts.map((p) => p.lx).sort((a, b) => a - b);
    const minLxBound = sortedLx[Math.floor(sortedLx.length * 0.05)];
    const maxLxBound = sortedLx[Math.min(sortedLx.length - 1, Math.floor(sortedLx.length * 0.95))];
    const spanLx = maxLxBound - minLxBound;
    if (spanLx < 0.5) {
      return {
        newYawRad: currentYaw,
        newYawDeg: Number((currentYaw * 180 / Math.PI).toFixed(2)),
        deltaYawDeg: 0,
        slope: 0
      };
    }
    const numSlices = 10;
    const sliceWidth = spanLx / numSlices;
    const slicePoints = [];
    for (let s = 0; s < numSlices; s++) {
      const sMin = minLxBound + s * sliceWidth;
      const sMax = sMin + sliceWidth;
      const inSlice = sidePts.filter((p) => p.lx >= sMin && p.lx < sMax);
      if (inSlice.length >= 1) {
        const brightInSlice = hasValidIntensity ? inSlice.filter((p) => typeof p.intensity === "number" && p.intensity >= highThreshold) : [];
        const targetSlicePts = brightInSlice.length >= 1 ? brightInSlice : inSlice;
        const sliceWeight = brightInSlice.length >= 1 ? 2 : 1;
        const sortedLy = targetSlicePts.map((p) => p.ly).sort((a, b) => a - b);
        if (isTargetLeft) {
          const pIdx = Math.max(0, Math.floor(sortedLy.length * 0.9));
          slicePoints.push({ lx: (sMin + sMax) / 2, ly: sortedLy[pIdx], weight: sliceWeight });
        } else {
          const pIdx = Math.min(sortedLy.length - 1, Math.floor(sortedLy.length * 0.1));
          slicePoints.push({ lx: (sMin + sMax) / 2, ly: sortedLy[pIdx], weight: sliceWeight });
        }
      }
    }
    if (slicePoints.length < 4) {
      return {
        newYawRad: currentYaw,
        newYawDeg: Number((currentYaw * 180 / Math.PI).toFixed(2)),
        deltaYawDeg: 0,
        slope: 0
      };
    }
    const slopesWithWeights = [];
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
      let sumLx = 0;
      let sumLy = 0;
      let sumLxLy = 0;
      let sumLx2 = 0;
      const m = slicePoints.length;
      for (const p of slicePoints) {
        sumLx += p.lx;
        sumLy += p.ly;
        sumLxLy += p.lx * p.ly;
        sumLx2 += p.lx * p.lx;
      }
      const denom = m * sumLx2 - sumLx * sumLx;
      slope = Math.abs(denom) > 1e-6 ? (m * sumLxLy - sumLx * sumLy) / denom : 0;
    }
    let deltaYaw = Math.atan(slope);
    deltaYaw = Math.max(-maxAdjRad, Math.min(maxAdjRad, deltaYaw));
    let deltaYawDeg = Number((deltaYaw * 180 / Math.PI).toFixed(2));
    if (Math.abs(deltaYawDeg) < 0.25) {
      deltaYaw = 0;
      deltaYawDeg = 0;
    }
    let newYaw = currentYaw + deltaYaw;
    while (newYaw > Math.PI) newYaw -= 2 * Math.PI;
    while (newYaw < -Math.PI) newYaw += 2 * Math.PI;
    const newYawDeg = Number((newYaw * 180 / Math.PI).toFixed(2));
    return {
      newYawRad: Number(newYaw.toFixed(5)),
      newYawDeg,
      deltaYawDeg,
      slope: Number(slope.toFixed(4))
    };
  }
  function detectLongitudinalBumperBounds(pts, halfL, visibleLongitudinal) {
    const isFront = visibleLongitudinal === "front";
    if (pts.length < 4) {
      return isFront ? halfL : -halfL;
    }
    const robustBounds = computeDensityRobustBounds(pts);
    return isFront ? robustBounds.lxMax : robustBounds.lxMin;
  }
  function filterSparseNoiseByLocalDensity(pts, options = {}) {
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
        if (dx * dx + dy * dy + dz * dz <= r2) {
          count++;
        }
      }
      densities[i] = count;
    }
    const sortedDensities = Array.from(densities).sort((a, b) => a - b);
    const medianDensity = sortedDensities[Math.floor(n / 2)];
    const adaptiveRatio = options.adaptiveRatio ?? 0.25;
    const userMin = options.minCoreNeighbors ?? 3;
    const coreThreshold = Math.max(userMin, Math.floor(medianDensity * adaptiveRatio));
    const corePts = [];
    for (let i = 0; i < n; i++) {
      if (densities[i] >= coreThreshold) {
        corePts.push(pts[i]);
      }
    }
    if (corePts.length >= 6 && corePts.length >= n * 0.4) {
      return corePts;
    }
    return pts;
  }
  function detectRoofTopBounds(pts, expectedRoofZ) {
    if (pts.length === 0) return expectedRoofZ ?? 0;
    const zValues = pts.map((p) => p.z).sort((a, b) => a - b);
    const n = zValues.length;
    if (n < 6) {
      return zValues[n - 1];
    }
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
  function computeDensityRobustBounds(pts, options = {}) {
    if (pts.length === 0) {
      return { lxMin: 0, lxMax: 0, lyMin: 0, lyMax: 0, zTop: 0, validPointsCount: 0 };
    }
    const cleanPts = filterSparseNoiseByLocalDensity(pts, {
      radius: options.rorRadius ?? 0.25,
      minCoreNeighbors: options.rorMinNeighbors ?? 2
    });
    const allLx = cleanPts.map((p) => p.lx).sort((a, b) => a - b);
    const allLy = cleanPts.map((p) => p.ly).sort((a, b) => a - b);
    const fallbackLxMin = allLx[0];
    const fallbackLxMax = allLx[allLx.length - 1];
    const fallbackLyMin = allLy[0];
    const fallbackLyMax = allLy[allLy.length - 1];
    const zTop = detectRoofTopBounds(cleanPts);
    if (cleanPts.length < 10) {
      return {
        lxMin: fallbackLxMin,
        lxMax: fallbackLxMax,
        lyMin: fallbackLyMin,
        lyMax: fallbackLyMax,
        zTop,
        validPointsCount: cleanPts.length
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
      validPointsCount: cleanPts.length
    };
  }
  function detectTrueHeadZ(zArr, maxGap = 0.15, groundZ, maxNormalHeight = 1.75) {
    if (zArr.length === 0) return 0;
    if (zArr.length === 1) return zArr[0];
    const sorted = [...zArr].sort((a, b) => a - b);
    const baseZ = groundZ !== void 0 ? groundZ : sorted[0];
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
    return clusterPts[clusterPts.length - 1];
  }
  function estimateEgoRoadGroundZ(pts, egoPos = { x: 0, y: 0, z: 0 }, options = {}) {
    const minR = options.minRadius ?? 0.8;
    const maxR = options.maxRadius ?? 15;
    const defaultZ = options.defaultZ ?? -1.75;
    const minRSq = minR * minR;
    const maxRSq = maxR * maxR;
    const groundZArr = [];
    if (Array.isArray(pts) && pts.length > 0 && typeof pts[0].x === "number") {
      const arr = pts;
      for (let i = 0; i < arr.length; i++) {
        const p = arr[i];
        const dx = p.x - egoPos.x;
        const dy = p.y - egoPos.y;
        const distSq = dx * dx + dy * dy;
        if (distSq >= minRSq && distSq <= maxRSq) {
          if (p.z >= egoPos.z - 3.5 && p.z <= egoPos.z + 0.5) {
            groundZArr.push(p.z);
          }
        }
      }
    } else {
      const raw = pts;
      const len = raw.length;
      for (let i = 0; i < len; i += 3) {
        const x = raw[i];
        const y = raw[i + 1];
        const z = raw[i + 2];
        const dx = x - egoPos.x;
        const dy = y - egoPos.y;
        const distSq = dx * dx + dy * dy;
        if (distSq >= minRSq && distSq <= maxRSq) {
          if (z >= egoPos.z - 3.5 && z <= egoPos.z + 0.5) {
            groundZArr.push(z);
          }
        }
      }
    }
    if (groundZArr.length < 8) {
      return defaultZ;
    }
    groundZArr.sort((a, b) => a - b);
    const cutLow = Math.floor(groundZArr.length * 0.01);
    const validZ = groundZArr.slice(cutLow);
    const p15Idx = Math.floor(validZ.length * 0.15);
    return Number(validZ[p15Idx].toFixed(3));
  }
  function computeGroundSlopesAndZ(pts, cx, cy, cz, yaw, halfL, halfW, ceilingZ, options = {}) {
    const cosY = Math.cos(-yaw);
    const sinY = Math.sin(-yaw);
    const outerL = halfL + 0.55;
    const outerW = halfW + 0.45;
    const innerL = Math.max(0.15, halfL - 0.35);
    const innerW = Math.max(0.15, halfW - 0.35);
    const maxZ = ceilingZ !== void 0 ? ceilingZ : cz + 0.2;
    const minZ = cz - 4.5;
    const groundPts = [];
    for (const p of pts) {
      if (p.z > maxZ || p.z < minZ) continue;
      const dx = p.x - cx;
      const dy = p.y - cy;
      const lx = dx * cosY - dy * sinY;
      const ly = dx * sinY + dy * cosY;
      const inOuter = Math.abs(lx) <= outerL && Math.abs(ly) <= outerW;
      const inCore = Math.abs(lx) < innerL && Math.abs(ly) < innerW;
      if (inOuter && !inCore) {
        groundPts.push({ lx, ly, z: p.z });
      }
    }
    if (groundPts.length < 8) {
      const extOuterL = outerL + 0.25;
      const extOuterW = outerW + 0.25;
      for (const p of pts) {
        if (p.z > maxZ || p.z < minZ) continue;
        const dx = p.x - cx;
        const dy = p.y - cy;
        const lx = dx * cosY - dy * sinY;
        const ly = dx * sinY + dy * cosY;
        if (Math.abs(lx) <= extOuterL && Math.abs(ly) <= extOuterW) {
          if (!groundPts.some((gp) => Math.abs(gp.lx - lx) < 1e-3 && Math.abs(gp.ly - ly) < 1e-3)) {
            groundPts.push({ lx, ly, z: p.z });
          }
        }
      }
    }
    const resolvedEgoRoadZ = options.egoRoadZ !== void 0 ? options.egoRoadZ : pts && pts.length >= 8 ? estimateEgoRoadGroundZ(pts, options.egoPos, { defaultZ: -1.75 }) : -1.75;
    const hH = options.halfH ?? 0.8;
    const curObjH = hH * 2;
    const currentBaseZ = cz - hH;
    const computeSmartFallbackGroundZ = () => {
      const searchL = halfL + 0.35;
      const searchW = halfW + 0.25;
      const bodyPtsZ = [];
      if (Array.isArray(pts) && pts.length > 0 && typeof pts[0].x === "number") {
        const arr = pts;
        for (let i = 0; i < arr.length; i++) {
          const p = arr[i];
          if (p.z < cz - hH - 0.4 || p.z > cz + hH + 0.4) continue;
          const dx = p.x - cx;
          const dy = p.y - cy;
          const lx = dx * cosY - dy * sinY;
          const ly = dx * sinY + dy * cosY;
          if (Math.abs(lx) <= searchL && Math.abs(ly) <= searchW) {
            bodyPtsZ.push(p.z);
          }
        }
      }
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
      if (options.egoRoadZ !== void 0 || !pts || pts.length === 0) {
        return Number(resolvedEgoRoadZ.toFixed(3));
      }
      if (pts && pts.length >= 8 && Math.abs(resolvedEgoRoadZ - currentBaseZ) <= 0.5) {
        return Number(resolvedEgoRoadZ.toFixed(3));
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
        curbHeightCm: 0
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
    if (inliers.length >= 6 && inliers.length >= sorted.length * 0.2) {
      validPts = inliers;
    }
    const qFL = [];
    const qFR = [];
    const qRL = [];
    const qRR = [];
    for (const p of validPts) {
      if (p.lx >= 0 && p.ly >= 0) qFL.push(p);
      else if (p.lx >= 0 && p.ly < 0) qFR.push(p);
      else if (p.lx < 0 && p.ly >= 0) qRL.push(p);
      else qRR.push(p);
    }
    const fitPts = [];
    const takeRatio = 0.45;
    const addLowestFromQuadrant = (q) => {
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
        curbHeightCm: 0
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
    const maxPitchRad = 20 * Math.PI / 180;
    const maxRollRad = 25 * Math.PI / 180;
    if (Math.abs(det) > 1e-4) {
      const a = (covLxZ * varLy - covLyZ * covLxLy) / det;
      const b = (covLyZ * varLx - covLxZ * covLxLy) / det;
      pitchRad = Math.max(-maxPitchRad, Math.min(maxPitchRad, -Math.atan(a)));
      rollRad = Math.max(-maxRollRad, Math.min(maxRollRad, Math.atan(b)));
      c0 = meanZ - a * meanLx - b * meanLy;
    } else {
      const pIdx = Math.floor(finalPts.length * 0.15);
      c0 = finalPts[pIdx].z;
    }
    if (Math.abs(det) > 1e-4) {
      let sumRes = 0;
      for (const p of finalPts) {
        const a = (covLxZ * varLy - covLyZ * covLxLy) / det;
        const b = (covLyZ * varLx - covLxZ * covLxLy) / det;
        const expectedZ = meanZ + a * (p.lx - meanLx) + b * (p.ly - meanLy);
        sumRes += Math.abs(p.z - expectedZ);
      }
      sumRes / finalPts.length;
    }
    const p12Idx = Math.max(0, Math.floor(sorted.length * 0.12));
    const lowestRoadZ = sorted[p12Idx].z;
    const leftPtsZ = sorted.filter((p) => p.ly > 0.15).map((p) => p.z).sort((a, b) => a - b);
    const rightPtsZ = sorted.filter((p) => p.ly < -0.15).map((p) => p.z).sort((a, b) => a - b);
    let isCurbOrRamp = options.lockRollFlat === true;
    let isHalfCurb = false;
    let halfCurbSide = "none";
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
      (p) => p.ly >= -halfW - 0.45 && p.ly <= -halfW + W * 0.3
    );
    const edgeLeftPts = sorted.filter(
      (p) => p.ly >= halfW - W * 0.3 && p.ly <= halfW + 0.45
    );
    if (edgeRightPts.length >= 2 && edgeLeftPts.length >= 2) {
      const aSlope = -Math.tan(pitchRad);
      const baseFloorZ = sorted[0].z;
      const extractEdgeZ = (edgePts) => {
        const transPts = edgePts.map((p) => ({ lx: p.lx, ly: p.ly, zTrans: p.z - aSlope * p.lx })).sort((a, b) => a.zTrans - b.zTrans);
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
      const hasEgoRef = options.egoRoadZ !== void 0;
      const egoZ = resolvedEgoRoadZ;
      const diffLeftEgo = zLeft - egoZ;
      const diffRightEgo = zRight - egoZ;
      if (hasEgoRef && absDeltaZ >= 0.07 && absDeltaZ <= 0.35) {
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
          const roadPts = validPts.filter((p) => p.z <= lowestRoadZ + 0.1);
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
      (p) => p.lx >= halfL - L * 0.3 && p.lx <= halfL + 0.45
    );
    const edgeRearPts = sorted.filter(
      (p) => p.lx >= -halfL - 0.45 && p.lx <= -halfL + L * 0.3
    );
    if (!isCurbOrRamp && !isHalfCurb && edgeFrontPts.length >= 2 && edgeRearPts.length >= 2) {
      const bSlope = Math.tan(rollRad);
      const extractSideZ = (edgePts) => {
        const transPts = edgePts.map((p) => ({ lx: p.lx, ly: p.ly, zTrans: p.z - bSlope * p.ly })).sort((a, b) => a.zTrans - b.zTrans);
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
    if (!isCurbOrRamp && !isHalfCurb && options.egoRoadZ !== void 0) {
      const egoZ = options.egoRoadZ;
      if (c0 >= egoZ + 0.08 && c0 <= egoZ + 0.35) {
        isCurbGround = true;
        curbHeightCm = Math.round((c0 - egoZ) * 100);
        if (Math.abs(rollRad) < 5 * Math.PI / 180) {
          rollRad = 0;
        }
      } else if (c0 < egoZ - 0.25 && validPts.length < 15) {
        c0 = egoZ;
        rollRad = 0;
        pitchRad = 0;
      }
    }
    let pitchRadVal = Number(pitchRad.toFixed(5));
    let rollRadVal = Number(rollRad.toFixed(5));
    let pitchDegVal = Number((pitchRad * 180 / Math.PI).toFixed(2));
    let rollDegVal = Number((rollRad * 180 / Math.PI).toFixed(2));
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
      curbHeightCm
    };
  }
  function determineBumperByDensity(pts, L, egoLocalX, egoLocalY) {
    if (pts.length === 0) {
      return {
        visibleBumper: egoLocalX >= 0 ? "front" : "rear",
        isParallelBalanced: false,
        nFront20: 0,
        nRear20: 0,
        nMiddle60: 0
      };
    }
    const allLx = pts.map((p) => p.lx).sort((a, b) => a - b);
    const pMinIdx = allLx.length >= 15 ? Math.floor(allLx.length * 0.015) : 0;
    const pMaxIdx = allLx.length >= 15 ? Math.min(allLx.length - 1, Math.floor(allLx.length * 0.985)) : allLx.length - 1;
    const lxMin = allLx[pMinIdx];
    const lxMax = allLx[pMaxIdx];
    const zoneSpan = Math.max(0.4, L * 0.2);
    const span = lxMax - lxMin;
    let nFront20 = 0;
    let nRear20 = 0;
    let nMiddle60 = 0;
    if (span < zoneSpan * 1.5) {
      const meanLx = pts.reduce((sum, p) => sum + p.lx, 0) / pts.length;
      const threshold = Math.max(0.35, L * 0.2);
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
    const isFrontDominant = nFront20 >= 6 && nRear20 <= 4 || nFront20 >= 8 && nFront20 >= nRear20 * 2.5;
    const isRearDominant = nRear20 >= 6 && nFront20 <= 4 || nRear20 >= 8 && nRear20 >= nFront20 * 2.5;
    if (isFrontDominant) {
      return {
        visibleBumper: "front",
        isParallelBalanced: false,
        nFront20,
        nRear20,
        nMiddle60
      };
    }
    if (isRearDominant) {
      return {
        visibleBumper: "rear",
        isParallelBalanced: false,
        nFront20,
        nRear20,
        nMiddle60
      };
    }
    const tan25 = 0.466;
    const isEgoParallel = Math.abs(egoLocalX) <= Math.abs(egoLocalY) * tan25;
    const isSymmetricBothEnds = Math.abs(nFront20 - nRear20) <= 2 && nFront20 >= 2 && nRear20 >= 2 && nMiddle60 >= 3;
    if ((isEgoParallel || isSymmetricBothEnds) && pts.length >= 4) {
      return {
        visibleBumper: egoLocalX >= 0 ? "front" : "rear",
        isParallelBalanced: true,
        nFront20,
        nRear20,
        nMiddle60
      };
    }
    let visibleBumper = egoLocalX >= 0 ? "front" : "rear";
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
      nMiddle60
    };
  }
  function fitBoxToEgoRayAndGround(pts, cx, cy, cz, yaw, L, W, H, egoPos = { x: 0, y: 0, z: 0 }, options = {}) {
    const ceilingZ = cz - Math.max(0.15, H / 2 * 0.4);
    const groundInfo = computeGroundSlopesAndZ(pts, cx, cy, cz, yaw, L / 2, W / 2, ceilingZ, { lockRollFlat: false });
    const groundZ = groundInfo.groundZ !== null ? groundInfo.groundZ : 0;
    const pitchRad = groundInfo.pitchRad;
    const rollRad = groundInfo.rollRad;
    const pitchDeg = groundInfo.pitchDeg;
    const rollDeg = groundInfo.rollDeg;
    const cosY = Math.cos(-yaw);
    const sinY = Math.sin(-yaw);
    const effectiveGroundZ = groundInfo.groundZ !== null && !groundInfo.isFallbackZeroGround ? groundInfo.groundZ : cz - H / 2;
    const minBodyZ = effectiveGroundZ + 0.22;
    const maxRoofZ = effectiveGroundZ + H + 0.55;
    const fitStep = options.fitStep ?? "all";
    const outerL = L / 2 + 0.45;
    const outerW = W / 2 + 0.35;
    const rawBodyPts = [];
    for (const p of pts) {
      if (p.z < minBodyZ || p.z > maxRoofZ) continue;
      const dx = p.x - cx;
      const dy = p.y - cy;
      const lx = dx * cosY - dy * sinY;
      const ly = dx * sinY + dy * cosY;
      if (Math.abs(lx) <= outerL && Math.abs(ly) <= outerW) {
        rawBodyPts.push({ lx, ly, z: p.z });
      }
    }
    const denseCoreBodyPts = filterSparseNoiseByLocalDensity(rawBodyPts, { radius: 0.22, minCoreNeighbors: 2 });
    const clusterLy = filterDenseConnectedCluster1D(denseCoreBodyPts, "ly", 0.22, 0);
    const bodyPts = filterDenseConnectedCluster1D(clusterLy, "lx", 0.22, 0);
    const dxEgo = cx - egoPos.x;
    const dyEgo = cy - egoPos.y;
    const vLocalX = -dxEgo * cosY + dyEgo * sinY;
    const vLocalY = -dxEgo * sinY - dyEgo * cosY;
    let visibleLongitudinal = vLocalX >= 0 ? "front" : "rear";
    let visibleLateral = vLocalY >= 0 ? "left" : "right";
    let shiftLx = 0;
    let shiftLy = 0;
    let isSideParallelBalanced = false;
    let roofTopZ = groundZ + H;
    let newH = H;
    let newL = L;
    let newW = W;
    const preserveDimensions = options.preserveDimensions ?? true;
    const alignMode = options.alignMode ?? "both";
    const validBodyPts = bodyPts.length >= 4 ? bodyPts : denseCoreBodyPts.length >= 4 ? denseCoreBodyPts : rawBodyPts;
    let straightYawResult = {
      newYawRad: yaw,
      newYawDeg: Number((yaw * 180 / Math.PI).toFixed(1)),
      deltaYawDeg: 0
    };
    let finalYaw = yaw;
    if (validBodyPts.length >= 4) {
      if (fitStep === "top") {
        const expectedRoofZ = groundZ + H;
        roofTopZ = detectRoofTopBounds(validBodyPts, expectedRoofZ);
        const wallDet = detectDominantWallEdgeWithValleyCutoff(
          validBodyPts,
          "ly",
          visibleLateral === "left" ? "positive" : "negative",
          W / 2,
          { minSpanOrthogonal: 0.7 }
        );
        const activePtsForYaw = wallDet.wallPoints.length >= 6 ? wallDet.wallPoints : validBodyPts;
        straightYawResult = straightenYawFromBoundaryEdge(activePtsForYaw, yaw, L, W, visibleLateral, { maxAdjustmentDeg: 12 });
        finalYaw = straightYawResult.newYawRad;
        shiftLx = 0;
        shiftLy = 0;
      } else if (fitStep === "side") {
        finalYaw = yaw;
        const toEgoX = egoPos.x - cx;
        const toEgoY = egoPos.y - cy;
        const egoLocalX = toEgoX * Math.cos(yaw) + toEgoY * Math.sin(yaw);
        const egoLocalY = -toEgoX * Math.sin(yaw) + toEgoY * Math.cos(yaw);
        const edgePadding = options.edgePadding ?? 0.05;
        const densityDecision = determineBumperByDensity(validBodyPts, L, egoLocalX, egoLocalY);
        if (densityDecision.isParallelBalanced && validBodyPts.length >= 4) {
          isSideParallelBalanced = true;
          const allLx = validBodyPts.map((p) => p.lx).sort((a, b) => a - b);
          const pMinIdx = allLx.length >= 15 ? Math.floor(allLx.length * 0.015) : 0;
          const pMaxIdx = allLx.length >= 15 ? Math.min(allLx.length - 1, Math.floor(allLx.length * 0.985)) : allLx.length - 1;
          const lxMin = allLx[pMinIdx];
          const lxMax = allLx[pMaxIdx];
          shiftLx = (lxMin + lxMax) / 2;
          visibleLongitudinal = densityDecision.visibleBumper;
        } else {
          const visibleBumper = densityDecision.visibleBumper;
          visibleLongitudinal = visibleBumper;
          const targetBumperPts = validBodyPts.filter((p) => Math.abs(p.ly) <= W / 2 + 0.15);
          const activePtsForL = targetBumperPts.length >= 4 ? targetBumperPts : validBodyPts;
          const bumperCloudPts = activePtsForL.filter((p) => visibleBumper === "front" ? p.lx > 0 : p.lx < 0);
          const cleanBumperPts = filterSparseNoiseByLocalDensity(bumperCloudPts, { radius: 0.15, minCoreNeighbors: 2 });
          const finalBumperPts = cleanBumperPts.length >= 3 ? cleanBumperPts : bumperCloudPts;
          let bumperEdge;
          if (finalBumperPts.length >= 3) {
            const wallDet = detectDominantWallEdgeWithValleyCutoff(
              finalBumperPts,
              "lx",
              visibleBumper === "front" ? "positive" : "negative",
              L / 2,
              { minSpanOrthogonal: 0.6 }
            );
            bumperEdge = wallDet.edge;
          } else {
            bumperEdge = visibleBumper === "front" ? L / 2 : -L / 2;
          }
          if (visibleBumper === "front") {
            shiftLx = bumperEdge + edgePadding - L / 2;
          } else {
            shiftLx = bumperEdge - edgePadding + L / 2;
          }
        }
        const maxShiftL = Math.min(0.4, L * 0.25);
        shiftLx = Math.max(-maxShiftL, Math.min(maxShiftL, shiftLx));
        if (Math.abs(shiftLx) < 0.01) shiftLx = 0;
        shiftLy = 0;
      } else if (fitStep === "front") {
        finalYaw = yaw;
        const toEgoX = egoPos.x - cx;
        const toEgoY = egoPos.y - cy;
        const egoLocalY = -toEgoX * Math.sin(yaw) + toEgoY * Math.cos(yaw);
        const leftSidePts = validBodyPts.filter((p) => p.ly > 0.05);
        const rightSidePts = validBodyPts.filter((p) => p.ly < -0.05);
        let visibleSide;
        if (leftSidePts.length >= rightSidePts.length + 3) {
          visibleSide = "left";
        } else if (rightSidePts.length >= leftSidePts.length + 3) {
          visibleSide = "right";
        } else {
          visibleSide = egoLocalY >= 0 ? "left" : "right";
        }
        visibleLateral = visibleSide;
        const targetSidePts = validBodyPts.filter((p) => Math.abs(p.lx) <= L / 2 + 0.15);
        const activePtsForW = targetSidePts.length >= 4 ? targetSidePts : validBodyPts;
        const sideCloudPts = activePtsForW.filter((p) => visibleSide === "left" ? p.ly > 0 : p.ly < 0);
        const cleanSidePts = filterSparseNoiseByLocalDensity(sideCloudPts, { radius: 0.15, minCoreNeighbors: 2 });
        const finalSidePts = cleanSidePts.length >= 3 ? cleanSidePts : sideCloudPts;
        let boundaryEdge;
        if (finalSidePts.length >= 3) {
          const wallDet = detectDominantWallEdgeWithValleyCutoff(
            finalSidePts,
            "ly",
            visibleSide === "left" ? "positive" : "negative",
            W / 2,
            { minSpanOrthogonal: 0.7 }
          );
          boundaryEdge = wallDet.edge;
        } else {
          boundaryEdge = visibleSide === "left" ? W / 2 : -W / 2;
        }
        const edgePadding = options.edgePadding ?? 0.05;
        if (visibleSide === "left") {
          shiftLy = boundaryEdge + edgePadding - W / 2;
        } else {
          shiftLy = boundaryEdge - edgePadding + W / 2;
        }
        const maxShiftW = Math.min(0.4, W * 0.3);
        shiftLy = Math.max(-maxShiftW, Math.min(maxShiftW, shiftLy));
        if (Math.abs(shiftLy) < 0.01) shiftLy = 0;
        shiftLx = 0;
      } else {
        const expectedRoofZ = groundZ + H;
        const detectedRoofZ = detectRoofTopBounds(validBodyPts, expectedRoofZ);
        roofTopZ = detectedRoofZ;
        const cleanRoofBodyPts = validBodyPts.filter((p) => p.z <= roofTopZ + 0.05);
        const activeBodyPts = cleanRoofBodyPts.length >= 4 ? cleanRoofBodyPts : validBodyPts;
        straightYawResult = straightenYawFromBoundaryEdge(activeBodyPts, yaw, L, W, visibleLateral);
        finalYaw = straightYawResult.newYawRad;
        let alignedPts = activeBodyPts;
        if (Math.abs(straightYawResult.deltaYawDeg) >= 0.05) {
          const cosFinal = Math.cos(-finalYaw);
          const sinFinal = Math.sin(-finalYaw);
          const reprojected = [];
          for (const p of pts) {
            if (p.z < minBodyZ || p.z > roofTopZ + 0.05) continue;
            const dx = p.x - cx;
            const dy = p.y - cy;
            const lx = dx * cosFinal - dy * sinFinal;
            const ly = dx * sinFinal + dy * cosFinal;
            if (Math.abs(lx) <= outerL && Math.abs(ly) <= outerW) {
              reprojected.push({ lx, ly, z: p.z });
            }
          }
          if (reprojected.length >= 4) {
            alignedPts = reprojected;
          }
        }
        const distToEgo = Math.hypot(dxEgo, dyEgo);
        if (distToEgo < 0.5) {
          const meanLy = alignedPts.reduce((acc, p) => acc + p.ly, 0) / alignedPts.length;
          const meanLx = alignedPts.reduce((acc, p) => acc + p.lx, 0) / alignedPts.length;
          if (meanLy < -0.12) visibleLateral = "right";
          else if (meanLy > 0.12) visibleLateral = "left";
          if (meanLx > 0.2) visibleLongitudinal = "front";
          else if (meanLx < -0.2) visibleLongitudinal = "rear";
        }
        const innerBodyPtsForW = alignedPts.filter((p) => Math.abs(p.lx) <= L / 2 - 0.05);
        const targetSidePts = innerBodyPtsForW.length >= 4 ? innerBodyPtsForW : alignedPts;
        const sideWallEdge = detectLateralWallBounds(targetSidePts, W / 2, visibleLateral);
        if (visibleLateral === "left") {
          shiftLy = sideWallEdge - W / 2;
        } else {
          shiftLy = sideWallEdge + W / 2;
        }
        if (alignMode === "w_only") {
          shiftLx = 0;
        } else {
          const bumperDecAll = determineBumperByDensity(alignedPts, L, vLocalX, vLocalY);
          visibleLongitudinal = bumperDecAll.visibleBumper;
          const innerBodyPtsForX = alignedPts.filter((p) => Math.abs(p.ly) <= W / 2 + 0.1);
          const targetBumperPts = innerBodyPtsForX.length >= 4 ? innerBodyPtsForX : alignedPts;
          const bumperEdge = detectLongitudinalBumperBounds(targetBumperPts, L / 2, visibleLongitudinal);
          if (visibleLongitudinal === "front") {
            shiftLx = bumperEdge - L / 2;
          } else {
            shiftLx = bumperEdge + L / 2;
          }
        }
      }
      if (fitStep === "top") {
        shiftLx = 0;
        shiftLy = 0;
      } else {
        const maxShiftL = Math.max(0.65, L * 0.35);
        const maxShiftW = Math.max(0.45, W * 0.35);
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
    const cosWorld = Math.cos(finalYaw);
    const sinWorld = Math.sin(finalYaw);
    const newCenterX = Number((cx + shiftLx * cosWorld - shiftLy * sinWorld).toFixed(3));
    const newCenterY = Number((cy + shiftLx * sinWorld + shiftLy * cosWorld).toFixed(3));
    const cosPitch = Math.cos(pitchRad);
    const cosRoll = Math.cos(rollRad);
    let newCenterZ = Number((groundZ + newH / 2 * cosPitch * cosRoll).toFixed(3));
    if (fitStep === "top" || fitStep === "side" || fitStep === "front") {
      newCenterZ = cz;
    }
    const faceTextLong = visibleLongitudinal === "front" ? "Mặt Trước" : "Mặt Sau";
    const faceTextLat = visibleLateral === "left" ? "Sườn Trái" : "Sườn Phải";
    let msg = `Đã căn thẳng Top (Yaw: ${straightYawResult.newYawDeg}°), Side [${faceTextLong}], Front [${faceTextLat}] & Ghim Đất (Z: ${newCenterZ}m, H: ${newH}m)`;
    if (fitStep === "top") {
      const deltaSign = straightYawResult.deltaYawDeg >= 0 ? "+" : "";
      msg = `Đã căn TOP: Xoay Yaw (${straightYawResult.newYawDeg}°, Δ=${deltaSign}${straightYawResult.deltaYawDeg}°) song song sườn đón tia [${faceTextLat}], khóa tâm X/Y/Z (giữ nguyên cao độ Z)`;
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
      newCenterX,
      newCenterY,
      newCenterZ,
      newYawRad: finalYaw,
      newYawDeg: straightYawResult.newYawDeg,
      deltaYawDeg: straightYawResult.deltaYawDeg,
      newL,
      newW,
      newH,
      pitchRad,
      rollRad,
      pitchDeg,
      rollDeg,
      groundZ,
      roofTopZ,
      shiftLx: Number(shiftLx.toFixed(3)),
      shiftLy: Number(shiftLy.toFixed(3)),
      visibleLongitudinal,
      visibleLateral,
      visibleFaces: {
        longitudinal: visibleLongitudinal,
        lateral: visibleLateral
      },
      dominantEdge: {
        edgeSide: visibleLateral,
        bumperSide: visibleLongitudinal,
        sideWallEdge: Number(shiftLy.toFixed(3)),
        bumperEdge: Number(shiftLx.toFixed(3))
      },
      pointsCount: bodyPts.length,
      message: msg
    };
  }
  function fitPedestrianBox(pts, cx, cy, cz, yaw, curL = 0.65, curW = 0.65, curH = 1.7, options = {}, stepParam = "all") {
    const step = options.step ?? stepParam;
    const headBuffer = options.headBuffer ?? 0.05;
    const margin = options.margin ?? 0.15;
    const footRadius = Math.max(0.35, Math.max(curL, curW) / 2 + margin);
    const footGroundPts = [];
    const maxFootGroundZ = cz - curH / 2 + 0.35;
    const minFootGroundZ = cz - 4;
    for (const p of pts) {
      if (p.z > maxFootGroundZ || p.z < minFootGroundZ) continue;
      const dx = p.x - cx;
      const dy = p.y - cy;
      if (dx * dx + dy * dy <= footRadius * footRadius) {
        footGroundPts.push(p.z);
      }
    }
    let groundZ = cz - curH / 2;
    if (footGroundPts.length >= 3) {
      footGroundPts.sort((a, b) => a - b);
      groundZ = footGroundPts[Math.max(0, Math.floor(footGroundPts.length * 0.15))];
    }
    const minCoreZ = groundZ + 0.3;
    const maxBodyZ = groundZ + 2;
    const minFootZ = step === "side" || step === "front" ? groundZ + 0.02 : groundZ + 0.08;
    const outerL = Math.max(0.45, curL / 2 + 0.25);
    const outerW = Math.max(0.4, curW / 2 + 0.25);
    const cosY = Math.cos(-yaw);
    const sinY = Math.sin(-yaw);
    const coreBodyPts = [];
    const footPts = [];
    for (const p of pts) {
      if (p.z < minFootZ || p.z > maxBodyZ) continue;
      const dx = p.x - cx;
      const dy = p.y - cy;
      const lx = dx * cosY - dy * sinY;
      const ly = dx * sinY + dy * cosY;
      if (Math.abs(lx) <= outerL && Math.abs(ly) <= outerW) {
        if (p.z >= minCoreZ) {
          coreBodyPts.push({ lx, ly, z: p.z });
        } else {
          if (Math.abs(lx) <= Math.max(0.35, curL / 2 + 0.12) && Math.abs(ly) <= Math.max(0.3, curW / 2 + 0.12)) {
            footPts.push({ lx, ly, z: p.z });
          }
        }
      }
    }
    let rawBodyPts;
    if (step === "side" || step === "front") {
      rawBodyPts = [...coreBodyPts, ...footPts];
    } else {
      rawBodyPts = coreBodyPts.length >= 8 ? coreBodyPts : [...coreBodyPts, ...footPts];
    }
    const isSparse = rawBodyPts.length <= 12;
    const maxGapLy = step === "front" || isSparse ? 0.3 : 0.22;
    const maxGapLx = step === "side" || isSparse ? 0.32 : 0.22;
    const clusterLy = filterDenseConnectedCluster1D(rawBodyPts, "ly", maxGapLy, 0);
    const bodyPts = filterDenseConnectedCluster1D(clusterLy, "lx", maxGapLx, 0);
    let newCenterX = cx;
    let newCenterY = cy;
    let newCenterZ = cz;
    let newYawRad = yaw;
    let newYawDeg = radToDeg(yaw);
    let deltaYawDeg = 0;
    let newL = curL;
    let newW = curW;
    let newH = curH;
    let shiftLx = 0;
    let shiftLy = 0;
    let roofTopZ = groundZ + curH;
    let msg = "";
    if (bodyPts.length < 3) {
      return {
        newCenterX,
        newCenterY,
        newCenterZ,
        newYawRad,
        newYawDeg,
        deltaYawDeg: 0,
        newL,
        newW,
        newH,
        pitchRad: 0,
        rollRad: 0,
        pitchDeg: 0,
        rollDeg: 0,
        groundZ: Number(groundZ.toFixed(3)),
        roofTopZ: Number(roofTopZ.toFixed(3)),
        pointsCount: bodyPts.length,
        step,
        message: `Không đủ điểm LiDAR thân người (${bodyPts.length} điểm), giữ nguyên box`
      };
    }
    const allLx = bodyPts.map((p) => p.lx).sort((a, b) => a - b);
    const allLy = bodyPts.map((p) => p.ly).sort((a, b) => a - b);
    const allZ = bodyPts.map((p) => p.z).sort((a, b) => a - b);
    const pMinIdx = !isSparse && bodyPts.length >= 25 ? Math.floor(bodyPts.length * 0.01) : 0;
    const pMaxIdx = !isSparse && bodyPts.length >= 25 ? Math.min(bodyPts.length - 1, Math.floor(bodyPts.length * 0.99)) : bodyPts.length - 1;
    const lxMin = allLx[pMinIdx];
    const lxMax = allLx[pMaxIdx];
    const lyMin = allLy[pMinIdx];
    const lyMax = allLy[pMaxIdx];
    const highestPtZ = detectTrueHeadZ(allZ, 0.15, groundZ, 1.78);
    if (step === "top") {
      const headingRes = estimateTwoWheelerHeading(bodyPts, yaw);
      if (Math.abs(headingRes.deltaYawDeg) <= 25) {
        newYawRad = headingRes.newYawRad;
        newYawDeg = headingRes.newYawDeg;
        deltaYawDeg = headingRes.deltaYawDeg;
      } else {
        newYawRad = yaw;
        newYawDeg = radToDeg(yaw);
        deltaYawDeg = 0;
      }
      newCenterX = cx;
      newCenterY = cy;
      newCenterZ = cz;
      newL = curL;
      newW = curW;
      newH = curH;
      const deltaSign = deltaYawDeg >= 0 ? "+" : "";
      msg = `Đã căn TOP Người đi bộ: Xoay Yaw (${newYawDeg}°, Δ=${deltaSign}${deltaYawDeg.toFixed(1)}°), khóa tâm X/Y/Z và kích thước (kháng dính đám đông)`;
    } else if (step === "side") {
      newYawRad = yaw;
      newYawDeg = radToDeg(yaw);
      deltaYawDeg = 0;
      newL = curL;
      newW = curW;
      newH = curH;
      newCenterZ = cz;
      shiftLx = 0;
      let bumperLabel = "Cân đối";
      if (options.egoPos) {
        const toEgoX = options.egoPos.x - cx;
        const toEgoY = options.egoPos.y - cy;
        const egoLocalX = toEgoX * Math.cos(yaw) + toEgoY * Math.sin(yaw);
        const egoLocalY = -toEgoX * Math.sin(yaw) + toEgoY * Math.cos(yaw);
        const isSideBeamParallel = Math.abs(egoLocalX) <= Math.abs(egoLocalY) * 0.466;
        if (isSideBeamParallel) {
          shiftLx = (lxMin + lxMax) / 2;
          bumperLabel = "Chiếu ngang sườn (Dàn đều trước - sau)";
        } else if (egoLocalX < 0) {
          shiftLx = lxMin - 0.02 + curL / 2;
          bumperLabel = "Mặt sau";
        } else {
          shiftLx = lxMax + 0.02 - curL / 2;
          bumperLabel = "Mặt trước";
        }
      } else {
        const frontCount = bodyPts.filter((p) => p.lx > 0).length;
        const rearCount = bodyPts.filter((p) => p.lx <= 0).length;
        if (frontCount > rearCount * 1.5) {
          shiftLx = lxMax + 0.02 - curL / 2;
          bumperLabel = "Mặt trước";
        } else if (rearCount > frontCount * 1.5) {
          shiftLx = lxMin - 0.02 + curL / 2;
          bumperLabel = "Mặt sau";
        } else {
          shiftLx = (lxMin + lxMax) / 2;
          bumperLabel = "Cân đối";
        }
      }
      shiftLx = Math.max(-0.35, Math.min(0.35, shiftLx));
      if (Math.abs(shiftLx) < 5e-3) shiftLx = 0;
      newCenterX = Number((cx + shiftLx * Math.cos(yaw)).toFixed(3));
      newCenterY = Number((cy + shiftLx * Math.sin(yaw)).toFixed(3));
      const deltaXSign = shiftLx >= 0 ? "+" : "";
      msg = `Đã căn SIDE Người đi bộ: [${bumperLabel}] bám mép đón tia (ΔX: ${deltaXSign}${(shiftLx * 100).toFixed(1)}cm, giữ nguyên Z), Khóa size ${curL}x${curW}x${curH}m`;
    } else if (step === "front") {
      newYawRad = yaw;
      newYawDeg = radToDeg(yaw);
      deltaYawDeg = 0;
      newL = curL;
      newW = curW;
      newH = curH;
      newCenterZ = cz;
      let visibleSide = "center";
      shiftLy = 0;
      const edgePadding = 0.025;
      if (options.egoPos) {
        const toEgoX = options.egoPos.x - cx;
        const toEgoY = options.egoPos.y - cy;
        const egoLocalX = toEgoX * Math.cos(yaw) + toEgoY * Math.sin(yaw);
        const egoLocalY = -toEgoX * Math.sin(yaw) + toEgoY * Math.cos(yaw);
        if (Math.abs(egoLocalY) <= Math.abs(egoLocalX) * 0.15 && Math.abs(egoLocalY) < 0.1) {
          visibleSide = "center";
          shiftLy = (lyMin + lyMax) / 2;
        } else if (egoLocalY >= 0) {
          visibleSide = "left";
          shiftLy = lyMax + edgePadding - curW / 2;
        } else {
          visibleSide = "right";
          shiftLy = lyMin - edgePadding + curW / 2;
        }
      } else {
        const leftCount = bodyPts.filter((p) => p.ly > 0.03).length;
        const rightCount = bodyPts.filter((p) => p.ly < -0.03).length;
        if (leftCount > rightCount * 1.3) {
          visibleSide = "left";
          shiftLy = lyMax + edgePadding - curW / 2;
        } else if (rightCount > leftCount * 1.3) {
          visibleSide = "right";
          shiftLy = lyMin - edgePadding + curW / 2;
        } else {
          visibleSide = "center";
          shiftLy = (lyMin + lyMax) / 2;
        }
      }
      shiftLy = Math.max(-0.35, Math.min(0.35, shiftLy));
      if (Math.abs(shiftLy) < 5e-3) shiftLy = 0;
      newCenterX = Number((cx - shiftLy * Math.sin(yaw)).toFixed(3));
      newCenterY = Number((cy + shiftLy * Math.cos(yaw)).toFixed(3));
      const deltaYSign = shiftLy >= 0 ? "+" : "";
      const sideText = visibleSide === "left" ? "Sườn Trái đón tia Ego" : visibleSide === "right" ? "Sườn Phải đón tia Ego" : "Cân đối 2 sườn";
      msg = `Đã căn FRONT Người đi bộ: [${sideText}] ôm sát viền đón tia (ΔY: ${deltaYSign}${(shiftLy * 100).toFixed(1)}cm, giữ nguyên Z), Khóa size ${curL}x${curW}x${curH}m`;
    } else if (step === "l") {
      newYawRad = yaw;
      newYawDeg = radToDeg(yaw);
      deltaYawDeg = 0;
      newW = curW;
      newH = curH;
      newCenterZ = cz;
      const spanL = lxMax - lxMin + 0.05;
      shiftLx = 0;
      if (spanL > 0.78) {
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
            shiftLx = lxMin - 0.02 + newL / 2;
          } else {
            shiftLx = lxMax + 0.02 - newL / 2;
          }
        } else {
          shiftLx = (lxMin + lxMax) / 2;
        }
      } else {
        newL = Number(Math.max(0.35, Math.min(0.78, spanL)).toFixed(2));
        shiftLx = (lxMin + lxMax) / 2;
      }
      shiftLx = Math.max(-0.35, Math.min(0.35, shiftLx));
      newCenterX = Number((cx + shiftLx * Math.cos(yaw)).toFixed(3));
      newCenterY = Number((cy + shiftLx * Math.sin(yaw)).toFixed(3));
      const deltaXSign = shiftLx >= 0 ? "+" : "";
      msg = `Đã fix Chiều Dài (L) Người đi bộ: L=${newL}m (căn tâm X: ${deltaXSign}${(shiftLx * 100).toFixed(1)}cm, kháng ghosting), giữ nguyên W, H & Z`;
    } else if (step === "w") {
      newYawRad = yaw;
      newYawDeg = radToDeg(yaw);
      deltaYawDeg = 0;
      newL = curL;
      newH = curH;
      newCenterZ = cz;
      const spanW = lyMax - lyMin + 0.04;
      shiftLy = 0;
      if (spanW > 0.68) {
        newW = 0.68;
        if (options.egoPos) {
          const toEgoX = options.egoPos.x - cx;
          const toEgoY = options.egoPos.y - cy;
          const egoLocalY = -toEgoX * Math.sin(yaw) + toEgoY * Math.cos(yaw);
          if (egoLocalY > 0.04) {
            shiftLy = lyMax + 0.01 - newW / 2;
          } else if (egoLocalY < -0.04) {
            shiftLy = lyMin - 0.01 + newW / 2;
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
      newCenterX = Number((cx - shiftLy * Math.sin(yaw)).toFixed(3));
      newCenterY = Number((cy + shiftLy * Math.cos(yaw)).toFixed(3));
      const deltaYSign = shiftLy >= 0 ? "+" : "";
      msg = `Đã fix Chiều Rộng (W) Người đi bộ: W=${newW}m (căn tâm Y: ${deltaYSign}${(shiftLy * 100).toFixed(1)}cm, vừa khít vai), giữ nguyên L, H & Z`;
    } else if (step === "h") {
      newYawRad = yaw;
      newYawDeg = radToDeg(yaw);
      deltaYawDeg = 0;
      newL = curL;
      newW = curW;
      newCenterX = cx;
      newCenterY = cy;
      const currentBaseZ = cz - curH / 2;
      const effectiveBaseZ = Math.abs(currentBaseZ - groundZ) <= 0.35 ? currentBaseZ : groundZ;
      roofTopZ = highestPtZ + headBuffer;
      const maxCapPedH = options.headBuffer !== void 0 ? 1.95 : 1.78;
      newH = Number(Math.max(1, Math.min(maxCapPedH, roofTopZ - effectiveBaseZ)).toFixed(2));
      newCenterZ = Number((effectiveBaseZ + newH / 2).toFixed(3));
      msg = `Đã fix Chiều Cao (H) Người đi bộ: H=${newH}m (Đáy bám sàn Z=${effectiveBaseZ.toFixed(2)}m cố định, nở lên đỉnh đầu +${Math.round(headBuffer * 100)}cm gọn gàng), giữ nguyên L, W & XY`;
    } else {
      newL = Number(Math.max(0.4, Math.min(0.78, lxMax - lxMin + 0.05)).toFixed(2));
      newW = Number(Math.max(0.38, Math.min(0.68, lyMax - lyMin + 0.04)).toFixed(2));
      roofTopZ = highestPtZ + headBuffer;
      const maxCapPedH = options.headBuffer !== void 0 ? 1.95 : 1.78;
      newH = Number(Math.max(1.05, Math.min(maxCapPedH, roofTopZ - groundZ)).toFixed(2));
      shiftLx = (lxMin + lxMax) / 2;
      shiftLy = (lyMin + lyMax) / 2;
      const maxShift = 0.4;
      shiftLx = Math.max(-maxShift, Math.min(maxShift, shiftLx));
      shiftLy = Math.max(-maxShift, Math.min(maxShift, shiftLy));
      const cosWorld = Math.cos(yaw);
      const sinWorld = Math.sin(yaw);
      newCenterX = Number((cx + shiftLx * cosWorld - shiftLy * sinWorld).toFixed(3));
      newCenterY = Number((cy + shiftLx * sinWorld + shiftLy * cosWorld).toFixed(3));
      newCenterZ = Number((groundZ + newH / 2).toFixed(3));
      msg = `Đã fit Người Đi Bộ: ${newL}x${newW}x${newH}m (Khóa thẳng đứng 0°, Ghim đất Z: ${newCenterZ}m, Bù đỉnh đầu +${Math.round(headBuffer * 100)}cm)`;
    }
    return {
      newCenterX,
      newCenterY,
      newCenterZ,
      newYawRad,
      newYawDeg,
      deltaYawDeg,
      newL,
      newW,
      newH,
      pitchRad: 0,
      rollRad: 0,
      pitchDeg: 0,
      rollDeg: 0,
      groundZ: Number(groundZ.toFixed(3)),
      roofTopZ: Number(roofTopZ.toFixed(3)),
      shiftLx: Number(shiftLx.toFixed(3)),
      shiftLy: Number(shiftLy.toFixed(3)),
      pointsCount: bodyPts.length,
      step,
      message: msg
    };
  }
  function estimateTwoWheelerHeading(bodyPts, curYaw) {
    if (bodyPts.length < 4) {
      return { deltaYawRad: 0, deltaYawDeg: 0, newYawRad: curYaw, newYawDeg: radToDeg(curYaw) };
    }
    const n = bodyPts.length;
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
    const sortedByLx = [...bodyPts].sort((a, b) => a.lx - b.lx);
    const sliceCount = Math.max(1, Math.floor(n * 0.3));
    const rearSlice = sortedByLx.slice(0, sliceCount);
    const frontSlice = sortedByLx.slice(Math.max(sliceCount, n - sliceCount));
    const rearLx = rearSlice.reduce((s, p) => s + p.lx, 0) / rearSlice.length;
    const rearLy = rearSlice.reduce((s, p) => s + p.ly, 0) / rearSlice.length;
    const frontLx = frontSlice.reduce((s, p) => s + p.lx, 0) / frontSlice.length;
    const frontLy = frontSlice.reduce((s, p) => s + p.ly, 0) / frontSlice.length;
    const dLx = frontLx - rearLx;
    const dLy = frontLy - rearLy;
    let deltaThetaExt = deltaThetaPca;
    if (dLx >= 0.3) {
      deltaThetaExt = Math.atan2(dLy, dLx);
    }
    let deltaTheta = Math.abs(deltaThetaPca - deltaThetaExt) < 0.2 ? 0.7 * deltaThetaPca + 0.3 * deltaThetaExt : deltaThetaPca;
    const maxDeltaRad = Math.PI / 4;
    deltaTheta = Math.max(-maxDeltaRad, Math.min(maxDeltaRad, deltaTheta));
    const newYawRad = normalizeAngle(curYaw + deltaTheta);
    const deltaYawDeg = radToDeg(deltaTheta);
    const newYawDeg = radToDeg(newYawRad);
    return { deltaYawRad: deltaTheta, deltaYawDeg, newYawRad, newYawDeg };
  }
  function fitTwoWheelerBox(pts, cx, cy, cz, yaw, curL = 1.75, curW = 0.65, curH = 1.55, options = {}, stepParam = "all") {
    const step = options.step ?? stepParam;
    const headBuffer = options.headBuffer ?? 0.05;
    const margin = options.margin ?? 0.2;
    const footRadius = Math.max(0.6, curL / 2 + margin);
    const groundPts = [];
    const maxGroundZ = cz - curH / 2 + 0.35;
    const minGroundZ = cz - 4;
    for (const p of pts) {
      if (p.z > maxGroundZ || p.z < minGroundZ) continue;
      const dx = p.x - cx;
      const dy = p.y - cy;
      if (dx * dx + dy * dy <= footRadius * footRadius) {
        groundPts.push(p.z);
      }
    }
    let groundZ = cz - curH / 2;
    if (groundPts.length >= 3) {
      groundPts.sort((a, b) => a - b);
      groundZ = groundPts[Math.max(0, Math.floor(groundPts.length * 0.15))];
    }
    const minCoreZ = groundZ + 0.25;
    const maxBodyZ = groundZ + 2;
    const minWheelZ = step === "side" || step === "front" ? groundZ + 0.02 : groundZ + 0.08;
    const outerL = curL / 2 + 0.45;
    const outerW = Math.max(curW, 0.85) / 2 + 0.45;
    const cosY = Math.cos(-yaw);
    const sinY = Math.sin(-yaw);
    const corePts = [];
    const wheelPts = [];
    for (const p of pts) {
      if (p.z < minWheelZ || p.z > maxBodyZ) continue;
      const dx = p.x - cx;
      const dy = p.y - cy;
      const lx = dx * cosY - dy * sinY;
      const ly = dx * sinY + dy * cosY;
      if (Math.abs(lx) <= outerL && Math.abs(ly) <= outerW) {
        if (p.z >= minCoreZ) {
          corePts.push({ lx, ly, z: p.z });
        } else {
          if (Math.abs(ly) <= Math.max(0.25, curW / 2 + 0.08)) {
            wheelPts.push({ lx, ly, z: p.z });
          }
        }
      }
    }
    let rawPts;
    if (step === "side" || step === "front") {
      rawPts = [...corePts, ...wheelPts];
    } else {
      rawPts = corePts.length >= 8 ? corePts : [...corePts, ...wheelPts];
    }
    const isSparse = rawPts.length <= 12;
    const maxGapLx = step === "side" || isSparse ? 0.38 : 0.28;
    const maxGapLy = step === "front" || isSparse ? 0.35 : 0.24;
    const clusterLy = filterDenseConnectedCluster1D(rawPts, "ly", maxGapLy, 0);
    const bodyPts = filterDenseConnectedCluster1D(clusterLy, "lx", maxGapLx, 0);
    let newCenterX = cx;
    let newCenterY = cy;
    let newCenterZ = cz;
    let newYawRad = yaw;
    let newYawDeg = radToDeg(yaw);
    let deltaYawDeg = 0;
    let newL = curL;
    let newW = curW;
    let newH = curH;
    let shiftLx = 0;
    let shiftLy = 0;
    let roofTopZ = groundZ + curH;
    let msg = "";
    if (bodyPts.length < 3) {
      return {
        newCenterX,
        newCenterY,
        newCenterZ,
        newYawRad,
        newYawDeg,
        deltaYawDeg: 0,
        newL,
        newW,
        newH,
        pitchRad: 0,
        rollRad: 0,
        pitchDeg: 0,
        rollDeg: 0,
        groundZ: Number(groundZ.toFixed(3)),
        roofTopZ: Number(roofTopZ.toFixed(3)),
        pointsCount: bodyPts.length,
        step,
        message: `Không đủ điểm LiDAR xe 2 bánh (${bodyPts.length} điểm), giữ nguyên box`
      };
    }
    const allLx = bodyPts.map((p) => p.lx).sort((a, b) => a - b);
    const allLy = bodyPts.map((p) => p.ly).sort((a, b) => a - b);
    const allZ = bodyPts.map((p) => p.z).sort((a, b) => a - b);
    const pMinIdx = !isSparse && bodyPts.length >= 30 ? Math.floor(bodyPts.length * 0.015) : 0;
    const pMaxIdx = !isSparse && bodyPts.length >= 30 ? Math.min(bodyPts.length - 1, Math.floor(bodyPts.length * 0.985)) : bodyPts.length - 1;
    const lxMin = allLx[pMinIdx];
    const lxMax = allLx[pMaxIdx];
    const lyMin = allLy[pMinIdx];
    const lyMax = allLy[pMaxIdx];
    const highestPtZ = detectTrueHeadZ(allZ, 0.15, groundZ, 1.6);
    if (step === "top") {
      const headingRes = estimateTwoWheelerHeading(bodyPts, yaw);
      newYawRad = headingRes.newYawRad;
      newYawDeg = headingRes.newYawDeg;
      deltaYawDeg = headingRes.deltaYawDeg;
      newCenterX = cx;
      newCenterY = cy;
      newCenterZ = cz;
      newL = curL;
      newW = curW;
      newH = curH;
      const deltaSign = deltaYawDeg >= 0 ? "+" : "";
      msg = `Đã căn TOP Xe 2 bánh: Xoay Yaw (${newYawDeg}°, Δ=${deltaSign}${deltaYawDeg.toFixed(1)}°) theo trục Đầu - Đuôi, khóa tâm X/Y/Z và kích thước`;
    } else if (step === "side") {
      newYawRad = yaw;
      newYawDeg = radToDeg(yaw);
      deltaYawDeg = 0;
      newL = curL;
      newW = curW;
      newH = curH;
      shiftLx = 0;
      let bumperLabel = "Đón tia";
      const riderPts = bodyPts.filter((p) => p.z >= groundZ + 0.65);
      const hasRider = riderPts.length >= 2;
      let lxRider = 0;
      if (hasRider) {
        const sortedRiderLx = riderPts.map((p) => p.lx).sort((a, b) => a - b);
        lxRider = sortedRiderLx[Math.floor(sortedRiderLx.length / 2)];
      }
      const distFront = hasRider ? lxMax - lxRider : curL / 2;
      const distRear = hasRider ? lxRider - lxMin : curL / 2;
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
        isSideBeamParallel = Math.abs(egoLocalX) <= Math.abs(egoLocalY) * 0.466;
      }
      if (isMissingFront && isMissingRear) {
        shiftLx = lxRider - 0.08 * curL;
        bumperLabel = "Người lái 42% (Mất cả 2 bánh)";
      } else if (isMissingFront) {
        const estFrontEdge = lxRider + 0.42 * curL;
        if (hasEgo && !isSideBeamParallel && egoLocalX < 0) {
          shiftLx = lxMin - 0.02 + curL / 2;
          bumperLabel = "Cản sau (Mất bánh trước)";
        } else {
          shiftLx = (lxMin + estFrontEdge) / 2;
          bumperLabel = "Người lái 42% + Bánh sau (Mất bánh trước)";
        }
      } else if (isMissingRear) {
        const estRearEdge = lxRider - 0.58 * curL;
        if (hasEgo && !isSideBeamParallel && egoLocalX > 0) {
          shiftLx = lxMax + 0.02 - curL / 2;
          bumperLabel = "Cản trước (Mất bánh sau)";
        } else {
          shiftLx = (estRearEdge + lxMax) / 2;
          bumperLabel = "Người lái 42% + Bánh trước (Mất bánh sau)";
        }
      } else {
        if (hasEgo) {
          if (isSideBeamParallel) {
            shiftLx = (lxMin + lxMax) / 2;
            bumperLabel = "Chiếu ngang sườn (Dàn đều 2 bánh)";
          } else if (egoLocalX < 0) {
            shiftLx = lxMin - 0.03 + curL / 2;
            bumperLabel = "Cản/Bánh sau đón tia";
          } else {
            shiftLx = lxMax + 0.03 - curL / 2;
            bumperLabel = "Cản/Bánh trước đón tia";
          }
        } else {
          const frontCount = bodyPts.filter((p) => p.lx > 0).length;
          const rearCount = bodyPts.filter((p) => p.lx <= 0).length;
          if (frontCount > rearCount * 1.5) {
            shiftLx = lxMax + 0.03 - curL / 2;
            bumperLabel = "Cản trước";
          } else if (rearCount > frontCount * 1.5) {
            shiftLx = lxMin - 0.03 + curL / 2;
            bumperLabel = "Cản sau";
          } else {
            shiftLx = (lxMin + lxMax) / 2;
            bumperLabel = "Cân đối";
          }
        }
      }
      shiftLx = Math.max(-0.6, Math.min(0.6, shiftLx));
      if (Math.abs(shiftLx) < 5e-3) shiftLx = 0;
      newCenterZ = cz;
      newCenterX = Number((cx + shiftLx * Math.cos(yaw)).toFixed(3));
      newCenterY = Number((cy + shiftLx * Math.sin(yaw)).toFixed(3));
      const deltaXSign = shiftLx >= 0 ? "+" : "";
      msg = `Đã căn SIDE Xe 2 bánh: [${bumperLabel}] bám vệt lốp (ΔX: ${deltaXSign}${(shiftLx * 100).toFixed(1)}cm, giữ nguyên cao độ Z), Khóa L: ${newL}m`;
    } else if (step === "front") {
      newYawRad = yaw;
      newYawDeg = radToDeg(yaw);
      deltaYawDeg = 0;
      newL = curL;
      newW = curW;
      newH = curH;
      newCenterZ = cz;
      let visibleSide = "center";
      const edgePadding = 0.03;
      shiftLy = 0;
      if (options.egoPos) {
        const toEgoX = options.egoPos.x - cx;
        const toEgoY = options.egoPos.y - cy;
        const egoLocalX = toEgoX * Math.cos(yaw) + toEgoY * Math.sin(yaw);
        const egoLocalY = -toEgoX * Math.sin(yaw) + toEgoY * Math.cos(yaw);
        if (Math.abs(egoLocalY) <= Math.abs(egoLocalX) * 0.15 && Math.abs(egoLocalY) < 0.15) {
          visibleSide = "center";
          shiftLy = (lyMin + lyMax) / 2;
        } else if (egoLocalY >= 0) {
          visibleSide = "left";
          shiftLy = lyMax + edgePadding - curW / 2;
        } else {
          visibleSide = "right";
          shiftLy = lyMin - edgePadding + curW / 2;
        }
      } else {
        const leftCount = bodyPts.filter((p) => p.ly > 0.05).length;
        const rightCount = bodyPts.filter((p) => p.ly < -0.05).length;
        if (leftCount > rightCount * 1.3) {
          visibleSide = "left";
          shiftLy = lyMax + edgePadding - curW / 2;
        } else if (rightCount > leftCount * 1.3) {
          visibleSide = "right";
          shiftLy = lyMin - edgePadding + curW / 2;
        } else {
          visibleSide = "center";
          shiftLy = (lyMin + lyMax) / 2;
        }
      }
      shiftLy = Math.max(-0.35, Math.min(0.35, shiftLy));
      if (Math.abs(shiftLy) < 5e-3) shiftLy = 0;
      newCenterX = Number((cx - shiftLy * Math.sin(yaw)).toFixed(3));
      newCenterY = Number((cy + shiftLy * Math.cos(yaw)).toFixed(3));
      const deltaYSign = shiftLy >= 0 ? "+" : "";
      const sideText = visibleSide === "left" ? "Sườn Trái" : visibleSide === "right" ? "Sườn Phải" : "Cân đối 2 sườn";
      msg = `Đã căn FRONT Xe 2 bánh: [${sideText}] đón tia ăn khít phương W (ΔY: ${deltaYSign}${(shiftLy * 100).toFixed(1)}cm), giữ nguyên cao độ Z và kích thước (chuẩn Car)`;
    } else if (step === "w") {
      newYawRad = yaw;
      newYawDeg = radToDeg(yaw);
      deltaYawDeg = 0;
      newL = curL;
      newH = curH;
      newCenterZ = cz;
      shiftLy = 0;
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
      if (measuredW > 0.85) {
        newW = 0.85;
        if (options.egoPos) {
          const toEgoX = options.egoPos.x - cx;
          const toEgoY = options.egoPos.y - cy;
          const egoLocalY = -toEgoX * Math.sin(yaw) + toEgoY * Math.cos(yaw);
          if (egoLocalY > 0.05) {
            shiftLy = lyMax + 0.03 - newW / 2;
          } else if (egoLocalY < -0.05) {
            shiftLy = lyMin - 0.03 + newW / 2;
          }
        }
      } else {
        newW = Number(Math.max(0.55, Math.min(0.85, measuredW)).toFixed(2));
      }
      shiftLy = Math.max(-0.35, Math.min(0.35, shiftLy));
      newCenterX = Number((cx - shiftLy * Math.sin(yaw)).toFixed(3));
      newCenterY = Number((cy + shiftLy * Math.cos(yaw)).toFixed(3));
      const deltaYSign = shiftLy >= 0 ? "+" : "";
      msg = `Đã fit Rộng (W) Xe 2 bánh: W=${newW}m (Đệm +3cm vừa khít gương/tay lái), căn Y: ${deltaYSign}${(shiftLy * 100).toFixed(1)}cm, giữ nguyên L, H & Z`;
    } else if (step === "h") {
      newYawRad = yaw;
      newYawDeg = radToDeg(yaw);
      deltaYawDeg = 0;
      newL = curL;
      newW = curW;
      newCenterX = cx;
      newCenterY = cy;
      const currentBaseZ = cz - curH / 2;
      const effectiveBaseZ = Math.abs(currentBaseZ - groundZ) <= 0.35 ? currentBaseZ : groundZ;
      const roofTopZ2 = highestPtZ + headBuffer;
      const maxCap2WH = options.headBuffer !== void 0 ? 1.85 : 1.68;
      newH = Number(Math.max(1.05, Math.min(maxCap2WH, roofTopZ2 - effectiveBaseZ)).toFixed(2));
      newCenterZ = Number((effectiveBaseZ + newH / 2).toFixed(3));
      msg = `Đã fit Cao (H) Xe 2 bánh: H=${newH}m (Đáy bám sàn Z=${effectiveBaseZ.toFixed(2)}m cố định, nở lên nóc +${Math.round(headBuffer * 100)}cm gọn gàng), giữ nguyên L, W & XY`;
    } else {
      const headingRes = estimateTwoWheelerHeading(bodyPts, yaw);
      newYawRad = headingRes.newYawRad;
      newYawDeg = headingRes.newYawDeg;
      deltaYawDeg = headingRes.deltaYawDeg;
      newL = curL;
      shiftLx = 0;
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
      shiftLy = 0;
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
      roofTopZ = highestPtZ + headBuffer;
      const maxCap2WH = options.headBuffer !== void 0 ? 1.85 : 1.68;
      newH = Number(Math.max(1.05, Math.min(maxCap2WH, roofTopZ - groundZ)).toFixed(2));
      newCenterZ = Number((groundZ + newH / 2).toFixed(3));
      const cosWorld = Math.cos(newYawRad);
      const sinWorld = Math.sin(newYawRad);
      newCenterX = Number((cx + shiftLx * cosWorld - shiftLy * sinWorld).toFixed(3));
      newCenterY = Number((cy + shiftLx * sinWorld + shiftLy * cosWorld).toFixed(3));
      msg = `Đã fit toàn diện Xe 2 bánh: ${newL}x${newW}x${newH}m (Khóa L, Xoay Yaw ${newYawDeg}°, Ghim đất Z: ${newCenterZ}m)`;
    }
    return {
      newCenterX,
      newCenterY,
      newCenterZ,
      newYawRad,
      newYawDeg,
      deltaYawDeg,
      newL,
      newW,
      newH,
      pitchRad: 0,
      rollRad: 0,
      pitchDeg: 0,
      rollDeg: 0,
      groundZ: Number(groundZ.toFixed(3)),
      roofTopZ: Number(roofTopZ.toFixed(3)),
      shiftLx: Number(shiftLx.toFixed(3)),
      shiftLy: Number(shiftLy.toFixed(3)),
      pointsCount: bodyPts.length,
      step,
      message: msg
    };
  }
  function fitPedestrianLength(pts, cx, cy, cz, yaw, curL = 0.65, curW = 0.65, curH = 1.7, options = {}) {
    return fitPedestrianBox(pts, cx, cy, cz, yaw, curL, curW, curH, options, "l");
  }
  function fitPedestrianWidth(pts, cx, cy, cz, yaw, curL = 0.65, curW = 0.65, curH = 1.7, options = {}) {
    return fitPedestrianBox(pts, cx, cy, cz, yaw, curL, curW, curH, options, "w");
  }
  function fitPedestrianHeight(pts, cx, cy, cz, yaw, curL = 0.65, curW = 0.65, curH = 1.7, options = {}) {
    return fitPedestrianBox(pts, cx, cy, cz, yaw, curL, curW, curH, options, "h");
  }
  function fitCyclistBox(pts, cx, cy, cz, yaw, curL = 1.75, curW = 0.65, curH = 1.55, options = {}, step = "all") {
    const mergedOptions = { headBuffer: options.headBuffer ?? 0.1, ...options };
    return fitTwoWheelerBox(pts, cx, cy, cz, yaw, curL, curW, curH, mergedOptions, step);
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
  function axesToEuler(ax) {
    const m11 = ax.ex[0], m12 = ax.ey[0], m13 = ax.ez[0];
    const m22 = ax.ey[1], m23 = ax.ez[1];
    const m32 = ax.ey[2], m33 = ax.ez[2];
    const y = Math.asin(Math.min(1, Math.max(-1, m13)));
    if (Math.abs(m13) < 0.9999999) {
      return [Math.atan2(-m23, m33), y, Math.atan2(-m12, m11)];
    }
    return [Math.atan2(m32, m22), y, 0];
  }
  function rotateLocal(r, axis, angle) {
    const ax = axes(r);
    const keys = ["ex", "ey", "ez"];
    const j = keys[(axis + 1) % 3];
    const k = keys[(axis + 2) % 3];
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const ej = ax[j];
    const ek = ax[k];
    const out = { ...ax };
    out[j] = [0, 1, 2].map((i) => c * ej[i] + s * ek[i]);
    out[k] = [0, 1, 2].map((i) => -s * ej[i] + c * ek[i]);
    return axesToEuler(out);
  }
  const dotVec$1 = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const addVec$1 = (u, v) => [
    u[0] + v[0],
    u[1] + v[1],
    u[2] + v[2]
  ];
  const subVec$1 = (u, v) => [
    u[0] - v[0],
    u[1] - v[1],
    u[2] - v[2]
  ];
  const scaleVec$1 = (u, k) => [
    u[0] * k,
    u[1] * k,
    u[2] * k
  ];
  function worldToLocal(p, c, ax) {
    const v = subVec$1(p, c);
    return [dotVec$1(v, ax.ex), dotVec$1(v, ax.ey), dotVec$1(v, ax.ez)];
  }
  function localToWorld(q, c, ax) {
    return addVec$1(
      c,
      addVec$1(
        scaleVec$1(ax.ex, q[0]),
        addVec$1(scaleVec$1(ax.ey, q[1]), scaleVec$1(ax.ez, q[2]))
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
    out.c = addVec$1(box.c, scaleVec$1(ax.ez, dh));
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
  function interpolatePoints$1(left, right, offset) {
    const out = left.map((v, i) => v + (right[i] - v) * offset);
    const angles = left.slice(3, 6).concat(right.slice(3, 6)).map((a) => a < 0 ? a + Math.PI * 2 : a).map((a) => a * (180 / Math.PI));
    for (let i = 0; i < 3; i++) {
      let angle = (angles[i] + findAngleDiff(angles[i + 3], angles[i]) * offset) * (Math.PI / 180);
      if (angle > Math.PI) angle -= Math.PI * 2;
      out[3 + i] = angle;
    }
    return out;
  }
  function percentile(sorted, p) {
    if (!sorted.length) return NaN;
    const i = Math.min(
      sorted.length - 1,
      Math.max(0, Math.round((sorted.length - 1) * p))
    );
    return sorted[i];
  }
  function estimateGround(xyz, box, opts = {}) {
    if (!xyz || !xyz.length || xyz.length < 3) return null;
    const minPoints = opts.minPoints ?? 4;
    const margin = opts.margin ?? 0.45;
    const below = opts.below ?? 4;
    const above = opts.above ?? 0.35;
    const ax = axes(box.r);
    const ix = box.s[0] / 2;
    const iy = box.s[1] / 2;
    const hx = ix + margin;
    const hy = iy + margin;
    const bottom = -box.s[2] / 2;
    const ring = [];
    const inner = [];
    const c = box.c;
    for (let i = 0; i < xyz.length; i += 3) {
      const vx = xyz[i] - c[0];
      const vy = xyz[i + 1] - c[1];
      const vz = xyz[i + 2] - c[2];
      const qx = vx * ax.ex[0] + vy * ax.ex[1] + vz * ax.ex[2];
      if (qx < -hx || qx > hx) continue;
      const qy = vx * ax.ey[0] + vy * ax.ey[1] + vz * ax.ey[2];
      if (qy < -hy || qy > hy) continue;
      const qz = vx * ax.ez[0] + vy * ax.ez[1] + vz * ax.ez[2];
      if (qz < bottom - below || qz > bottom + above) continue;
      if (Math.abs(qx) > ix || Math.abs(qy) > iy) {
        ring.push(qz);
      } else {
        inner.push(qz);
      }
    }
    if (ring.length >= minPoints) {
      const bin = 0.02;
      const lo = bottom - below;
      const binCount = Math.ceil((below + above) / bin) + 1;
      const bins = new Float64Array(binCount);
      for (const z of ring) {
        const idx = Math.min(bins.length - 1, Math.max(0, Math.floor((z - lo) / bin)));
        bins[idx] += 1;
      }
      let best = 0;
      let bestScore = -1;
      for (let i = 0; i < bins.length; i++) {
        const score = bins[i] + 0.5 * ((bins[i - 1] || 0) + (bins[i + 1] || 0));
        if (score > bestScore) {
          bestScore = score;
          best = i;
        }
      }
      const peak = lo + (best + 0.5) * bin;
      const near = ring.filter((z) => Math.abs(z - peak) <= 0.05).sort((p, q) => p - q);
      if (near.length >= minPoints) {
        return { localZ: percentile(near, 0.5), count: near.length };
      }
    }
    const all = ring.concat(inner).sort((p, q) => p - q);
    if (all.length >= minPoints) {
      return { localZ: percentile(all, 0.15), count: all.length };
    }
    if (margin < 0.8 && xyz.length >= 3) {
      return estimateGround(xyz, box, { ...opts, margin: 0.85, below: 4.5, minPoints: 3 });
    }
    return null;
  }
  function snapToGround(xyz, box, opts) {
    if (!xyz || !xyz.length) return null;
    const g = estimateGround(xyz, box, opts);
    if (!g) return null;
    const ax = axes(box.r);
    const shift = g.localZ + box.s[2] / 2;
    const out = cloneBox(box);
    out.c = addVec$1(box.c, scaleVec$1(ax.ez, shift));
    return { box: out, shift, count: g.count };
  }
  function fitYawToLaneIntensity$1(pts, cx, cy, cz, curYaw, curL = 4.6, curW = 1.85, curH = 1.5, options = {}) {
    const defaultYawDeg = radToDeg(curYaw);
    const fallbackResult = (msg2) => ({
      hasLane: false,
      laneYawRad: curYaw,
      laneYawDeg: defaultYawDeg,
      deltaYawDeg: 0,
      newYawRad: curYaw,
      newYawDeg: defaultYawDeg,
      inliersCount: 0,
      confidence: 0,
      message: msg2
    });
    if (!pts || pts.length < 30) {
      return fallbackResult("Không đủ điểm mây LiDAR để quét vạch sơn mặt đường");
    }
    const groundZ = options.groundZ !== void 0 ? options.groundZ : cz - curH / 2;
    const searchX = options.maxSearchRadiusX ?? 12;
    const searchY = options.maxSearchRadiusY ?? 4.5;
    const maxAngleDiffDeg = options.maxAngleDiffDeg ?? 35;
    const intensityPercentile = options.intensityPercentile ?? 0.85;
    const ransacIters = options.ransacIterations ?? 80;
    const distThreshold = options.distanceThreshold ?? 0.1;
    const minInliers = options.minInliers ?? 12;
    const cosY = Math.cos(-curYaw);
    const sinY = Math.sin(-curYaw);
    const groundPts = [];
    for (const p of pts) {
      const dz = Math.abs(p.z - groundZ);
      if (dz > 0.12) continue;
      const dx = p.x - cx;
      const dy = p.y - cy;
      const lx = dx * cosY - dy * sinY;
      const ly = dx * sinY + dy * cosY;
      if (Math.abs(lx) <= searchX && Math.abs(ly) <= searchY) {
        const intensity = typeof p.intensity === "number" ? p.intensity : 0;
        groundPts.push({ x: p.x, y: p.y, z: p.z, lx, ly, intensity });
      }
    }
    if (groundPts.length < 25) {
      return fallbackResult(`Số điểm mặt sàn xung quanh quá ít (${groundPts.length} điểm)`);
    }
    const intensities = groundPts.map((p) => p.intensity).sort((a, b) => a - b);
    const maxIntensity = intensities[intensities.length - 1];
    const minIntensity = intensities[0];
    if (maxIntensity < 20 || maxIntensity - minIntensity < 15) {
      return fallbackResult("Mây điểm không chứa kênh cường độ phản xạ (Intensity) rõ nét của vạch sơn");
    }
    const pIdx = Math.min(intensities.length - 1, Math.floor(intensities.length * intensityPercentile));
    const intensityThreshold = Math.max(35, intensities[pIdx]);
    const candidatePts = groundPts.filter((p) => p.intensity >= intensityThreshold);
    if (candidatePts.length < minInliers) {
      return fallbackResult(`Số điểm hạt giống vạch sơn quá ít (${candidatePts.length} điểm < ${minInliers})`);
    }
    let bestInliers = [];
    const nCandidates = candidatePts.length;
    for (let iter = 0; iter < ransacIters; iter++) {
      const idx1 = Math.floor(Math.random() * nCandidates);
      let idx2 = Math.floor(Math.random() * nCandidates);
      let attempts = 0;
      while (idx2 === idx1 && attempts++ < 10) {
        idx2 = Math.floor(Math.random() * nCandidates);
      }
      if (idx1 === idx2) continue;
      const p1 = candidatePts[idx1];
      const p2 = candidatePts[idx2];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const segLenSq = dx * dx + dy * dy;
      if (segLenSq < 1.44) continue;
      const segLen = Math.sqrt(segLenSq);
      const A = -dy / segLen;
      const B = dx / segLen;
      const C = -(A * p1.x + B * p1.y);
      const currentInliers = [];
      for (let i = 0; i < nCandidates; i++) {
        const pt = candidatePts[i];
        const dist = Math.abs(A * pt.x + B * pt.y + C);
        if (dist <= distThreshold) {
          currentInliers.push(pt);
        }
      }
      if (currentInliers.length > bestInliers.length) {
        bestInliers = currentInliers;
      }
    }
    if (bestInliers.length < minInliers) {
      return fallbackResult(`Không tìm thấy vệt đường thẳng vạch sơn đủ tin cậy (${bestInliers.length} inliers < ${minInliers})`);
    }
    let sumX = 0, sumY = 0;
    for (const p of bestInliers) {
      sumX += p.x;
      sumY += p.y;
    }
    const meanX = sumX / bestInliers.length;
    const meanY = sumY / bestInliers.length;
    let sxx = 0, syy = 0, sxy = 0;
    for (const p of bestInliers) {
      const dx = p.x - meanX;
      const dy = p.y - meanY;
      sxx += dx * dx;
      syy += dy * dy;
      sxy += dx * dy;
    }
    const laneHeading = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const norm = (r) => {
      let a = r;
      while (a > Math.PI) a -= 2 * Math.PI;
      while (a < -Math.PI) a += 2 * Math.PI;
      return a;
    };
    const candYaw1 = norm(laneHeading);
    const candYaw2 = norm(laneHeading + Math.PI);
    const diff1 = Math.abs(norm(curYaw - candYaw1));
    const diff2 = Math.abs(norm(curYaw - candYaw2));
    const chosenYaw = diff1 <= diff2 ? candYaw1 : candYaw2;
    const deltaYawRad = norm(chosenYaw - curYaw);
    const deltaYawDeg = radToDeg(deltaYawRad);
    if (Math.abs(deltaYawDeg) > maxAngleDiffDeg) {
      return fallbackResult(
        `Góc lệch xe so với vạch làn quá lớn (${Math.abs(deltaYawDeg).toFixed(1)}° > ${maxAngleDiffDeg}°), hủy căn làn để bảo vệ góc rẽ thật của xe`
      );
    }
    const newYawRad = Number(chosenYaw.toFixed(5));
    const newYawDeg = Number(radToDeg(newYawRad).toFixed(2));
    const confidence = Math.min(100, Math.max(50, Math.round(bestInliers.length / candidatePts.length * 100)));
    const sign = deltaYawDeg >= 0 ? "+" : "";
    const msg = `Đã căn Yaw theo vạch kẻ làn đường 3D (${newYawDeg}°, ΔYaw: ${sign}${deltaYawDeg.toFixed(1)}°, Độ tin cậy: ${confidence}%, ${bestInliers.length} điểm vạch sơn)`;
    return {
      hasLane: true,
      laneYawRad: Number(laneHeading.toFixed(5)),
      laneYawDeg: Number(radToDeg(laneHeading).toFixed(2)),
      deltaYawDeg: Number(deltaYawDeg.toFixed(2)),
      newYawRad,
      newYawDeg,
      inliersCount: bestInliers.length,
      confidence,
      message: msg
    };
  }
  function isPointInsideBox3D(px, py, pz, box) {
    const dx = px - box.cx;
    const dy = py - box.cy;
    const dz = pz - box.cz;
    const maxR = Math.max(box.l, box.w, box.h) * 0.75;
    if (Math.abs(dx) > maxR || Math.abs(dy) > maxR || Math.abs(dz) > maxR) {
      return false;
    }
    const cosY = Math.cos(-box.rz);
    const sinY = Math.sin(-box.rz);
    let lx = dx * cosY - dy * sinY;
    let ly = dx * sinY + dy * cosY;
    let lz = dz;
    if (box.rx || box.ry) {
      const rx = box.rx || 0;
      const ry = box.ry || 0;
      const cosP = Math.cos(-ry);
      const sinP = Math.sin(-ry);
      const lx2 = lx * cosP + lz * sinP;
      const lz2 = -lx * sinP + lz * cosP;
      const cosR = Math.cos(-rx);
      const sinR = Math.sin(-rx);
      const ly2 = ly * cosR - lz2 * sinR;
      const lz3 = ly * sinR + lz2 * cosR;
      lx = lx2;
      ly = ly2;
      lz = lz3;
    }
    const halfL = box.l / 2;
    const halfW = box.w / 2;
    const halfH = box.h / 2;
    return Math.abs(lx) <= halfL && Math.abs(ly) <= halfW && Math.abs(lz) <= halfH;
  }
  const DEFAULT_LABEL_COLORS = {
    car: { r: 0.96, g: 0.62, b: 0.04 },
    // Cam hổ phách ấm (#f59e0b)
    pedestrian: { r: 0.51, g: 0.55, b: 0.97 },
    // Xanh tím Indigo (#818cf8)
    cyclist: { r: 0.06, g: 0.73, b: 0.51 },
    // Xanh lục Emerald (#10b981)
    truck: { r: 0.94, g: 0.38, b: 0.57 },
    // Hồng Ruby (#f43f5e)
    bus: { r: 0.65, g: 0.43, b: 0.95 },
    // Tím tím Purple (#a855f7)
    active: { r: 0.98, g: 0.8, b: 0.08 }
    // Vàng chanh Neon (#facc15)
  };
  function computePointCloudColors(positions, intensities, boxes, options, outColors) {
    var _a, _b, _c;
    const count = Math.floor(positions.length / 3);
    const colors = outColors && outColors.length === count * 3 ? outColors : new Float32Array(count * 3);
    const isPlainMode = options.mode === "plain";
    const colorizeBoxed = options.colorizeBoxed !== false && boxes.length > 0;
    const plainR = ((_a = options.plainColor) == null ? void 0 : _a.r) ?? 0.72;
    const plainG = ((_b = options.plainColor) == null ? void 0 : _b.g) ?? 0.76;
    const plainB = ((_c = options.plainColor) == null ? void 0 : _c.b) ?? 0.82;
    const fastBoxes = [];
    if (colorizeBoxed) {
      for (const b of boxes) {
        if (!b || b.l <= 0 || b.w <= 0 || b.h <= 0) continue;
        const cosY = Math.cos(-b.rz);
        const sinY = Math.sin(-b.rz);
        const maxR = Math.max(b.l, b.w, b.h) * 0.75;
        let c = b.color;
        if (!c) {
          if (b.isActive) {
            c = DEFAULT_LABEL_COLORS.active;
          } else {
            const cat = (b.category || "car").toLowerCase();
            c = DEFAULT_LABEL_COLORS[cat] || DEFAULT_LABEL_COLORS.car;
          }
        }
        fastBoxes.push({
          cx: b.cx,
          cy: b.cy,
          cz: b.cz,
          rx: b.rx || 0,
          ry: b.ry || 0,
          rz: b.rz,
          cosY,
          sinY,
          halfL: b.l / 2,
          halfW: b.w / 2,
          halfH: b.h / 2,
          maxR,
          colorR: c.r,
          colorG: c.g,
          colorB: c.b
        });
      }
    }
    const numBoxes = fastBoxes.length;
    for (let i = 0; i < count; i++) {
      const idx3 = i * 3;
      const px = positions[idx3];
      const py = positions[idx3 + 1];
      const pz = positions[idx3 + 2];
      let v = 0.5;
      if (intensities && i < intensities.length) {
        const rawInt = intensities[i];
        v = rawInt <= 1 ? rawInt : Math.min(1, rawInt / 255);
      }
      let matchedBox = null;
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
            matchedBox = b;
            break;
          }
        }
      }
      if (matchedBox) {
        const factor = isPlainMode ? 0.9 : 0.4 + 0.6 * v;
        colors[idx3] = matchedBox.colorR * factor;
        colors[idx3 + 1] = matchedBox.colorG * factor;
        colors[idx3 + 2] = matchedBox.colorB * factor;
      } else {
        if (isPlainMode) {
          colors[idx3] = plainR;
          colors[idx3 + 1] = plainG;
          colors[idx3 + 2] = plainB;
        } else {
          const boostV = Math.min(1, v * 1.25);
          if (v >= 0.7) {
            colors[idx3] = 1;
            colors[idx3 + 1] = 0.96;
            colors[idx3 + 2] = 0.5 + 0.5 * boostV;
          } else {
            colors[idx3] = boostV;
            colors[idx3 + 1] = boostV;
            colors[idx3 + 2] = boostV;
          }
        }
      }
    }
    return colors;
  }
  if (typeof globalThis !== "undefined") {
    globalThis.boxCorners = boxCorners;
    globalThis.BOX_EDGES = BOX_EDGES;
    globalThis.fitBoxToEgoRayAndGround = fitBoxToEgoRayAndGround;
    globalThis.fitPedestrianBox = fitPedestrianBox;
    globalThis.fitPedestrianLength = fitPedestrianLength;
    globalThis.fitPedestrianWidth = fitPedestrianWidth;
    globalThis.fitPedestrianHeight = fitPedestrianHeight;
    globalThis.fitCyclistBox = fitCyclistBox;
    globalThis.fitTwoWheelerBox = fitTwoWheelerBox;
    globalThis.estimateTwoWheelerHeading = estimateTwoWheelerHeading;
    globalThis.estimateEgoRoadGroundZ = estimateEgoRoadGroundZ;
    globalThis.detectTrueHeadZ = detectTrueHeadZ;
    globalThis.computeGroundSlopesAndZ = computeGroundSlopesAndZ;
    globalThis.fitYawToLaneIntensity = fitYawToLaneIntensity$1;
    globalThis.isPointInsideBox3D = isPointInsideBox3D;
    globalThis.computePointCloudColors = computePointCloudColors;
  }
  if (typeof window !== "undefined") {
    window.boxCorners = boxCorners;
    window.BOX_EDGES = BOX_EDGES;
    window.fitBoxToEgoRayAndGround = fitBoxToEgoRayAndGround;
    window.fitPedestrianBox = fitPedestrianBox;
    window.fitPedestrianLength = fitPedestrianLength;
    window.fitPedestrianWidth = fitPedestrianWidth;
    window.fitPedestrianHeight = fitPedestrianHeight;
    window.fitCyclistBox = fitCyclistBox;
    window.fitTwoWheelerBox = fitTwoWheelerBox;
    window.estimateTwoWheelerHeading = estimateTwoWheelerHeading;
    window.estimateEgoRoadGroundZ = estimateEgoRoadGroundZ;
    window.detectTrueHeadZ = detectTrueHeadZ;
    window.computeGroundSlopesAndZ = computeGroundSlopesAndZ;
    window.fitYawToLaneIntensity = fitYawToLaneIntensity$1;
    window.isPointInsideBox3D = isPointInsideBox3D;
    window.computePointCloudColors = computePointCloudColors;
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
      return null;
    }
    function getSceneLidarPoints() {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r;
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
        const posAttr = (_h = (_g = found.geometry) == null ? void 0 : _g.attributes) == null ? void 0 : _h.position;
        if (!posAttr || !posAttr.array) return null;
        const count = posAttr.count;
        const array = posAttr.array;
        const intensityAttr = (_m = ((_j = (_i = found.geometry) == null ? void 0 : _i.attributes) == null ? void 0 : _j.intensity) || ((_l = (_k = found.geometry) == null ? void 0 : _k.attributes) == null ? void 0 : _l.intensities)) == null ? void 0 : _m.array;
        const colorAttr = (_r = ((_o = (_n = found.geometry) == null ? void 0 : _n.attributes) == null ? void 0 : _o.color) || ((_q = (_p = found.geometry) == null ? void 0 : _p.attributes) == null ? void 0 : _q.colors)) == null ? void 0 : _r.array;
        const getIntensityAt = (idx) => {
          if (intensityAttr && idx < intensityAttr.length) {
            const val = intensityAttr[idx];
            return val <= 1 ? val * 255 : val;
          }
          if (colorAttr && idx * 3 + 2 < colorAttr.length) {
            const r = colorAttr[idx * 3];
            const g = colorAttr[idx * 3 + 1];
            const b = colorAttr[idx * 3 + 2];
            const l = 0.299 * r + 0.587 * g + 0.114 * b;
            return r <= 1 && g <= 1 && b <= 1 ? l * 255 : l;
          }
          return 0;
        };
        return {
          count,
          array,
          intensity: intensityAttr || null,
          color: colorAttr || null,
          getIntensityAt
        };
      } catch (e) {
        console.warn("[CVAT 3D Suite] Không thể trích xuất LiDAR points:", e);
        return null;
      }
    }
    let currentPointColorMode = "intensity";
    let currentColorizeBoxed = true;
    function getAllScenePointsObjects() {
      var _a, _b, _c;
      try {
        const store = getReduxStore();
        const canvas = (_c = (_b = (_a = store == null ? void 0 : store.getState()) == null ? void 0 : _a.annotation) == null ? void 0 : _b.canvas) == null ? void 0 : _c.instance;
        if (!canvas || !canvas.view || !canvas.view.views) return [];
        const pointsObjects = [];
        const views = canvas.view.views;
        const viewKeys = ["perspective", "top", "side", "front"];
        for (const key of viewKeys) {
          const v = views[key];
          const scene = v == null ? void 0 : v.scene;
          if (!scene) continue;
          scene.traverse((obj) => {
            var _a2, _b2, _c2;
            if ((obj.isPoints || obj.type === "Points") && ((_c2 = (_b2 = (_a2 = obj.geometry) == null ? void 0 : _a2.attributes) == null ? void 0 : _b2.position) == null ? void 0 : _c2.count) > 5e3 && !pointsObjects.includes(obj)) {
              pointsObjects.push(obj);
            }
          });
        }
        return pointsObjects;
      } catch (e) {
        return [];
      }
    }
    function applyPointCloudColorizationInMainWorld(options) {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k;
      try {
        if (options == null ? void 0 : options.mode) currentPointColorMode = options.mode;
        if ((options == null ? void 0 : options.colorizeBoxed) !== void 0) currentColorizeBoxed = !!options.colorizeBoxed;
        const store = getReduxStore();
        const canvas = (_c = (_b = (_a = store == null ? void 0 : store.getState()) == null ? void 0 : _a.annotation) == null ? void 0 : _b.canvas) == null ? void 0 : _c.instance;
        if (!canvas) return false;
        const ptsObjs = getAllScenePointsObjects();
        if (ptsObjs.length === 0) return false;
        const defaultColors = {
          car: { r: 0.96, g: 0.62, b: 0.04 },
          // Cam hổ phách (#f59e0b)
          pedestrian: { r: 0.51, g: 0.55, b: 0.97 },
          // Xanh tím Indigo (#818cf8)
          cyclist: { r: 0.06, g: 0.73, b: 0.51 },
          // Xanh lục Emerald (#10b981)
          truck: { r: 0.94, g: 0.38, b: 0.57 },
          // Hồng Ruby (#f43f5e)
          bus: { r: 0.65, g: 0.43, b: 0.95 },
          // Tím tím Purple (#a855f7)
          active: { r: 0.98, g: 0.8, b: 0.08 }
          // Vàng chanh Neon (#facc15)
        };
        const fastBoxes = [];
        if (currentColorizeBoxed) {
          const drawnObjects = ((_d = canvas.view) == null ? void 0 : _d.drawnObjects) || {};
          const activeClientId = ((_e = canvas.view) == null ? void 0 : _e.activatedElementID) || ((_h = (_g = (_f = store == null ? void 0 : store.getState()) == null ? void 0 : _f.annotation) == null ? void 0 : _g.annotations) == null ? void 0 : _h.activatedStateClientID);
          for (const idStr of Object.keys(drawnObjects)) {
            const drawnItem = drawnObjects[idStr];
            const data = drawnItem == null ? void 0 : drawnItem.data;
            if (data && Array.isArray(data.points) && data.points.length >= 9 && !data.outside) {
              const pts = data.points;
              const l = pts[6];
              const w = pts[7];
              const h2 = pts[8];
              if (l <= 0 || w <= 0 || h2 <= 0) continue;
              const clientId = Number(idStr);
              const isActive = clientId === Number(activeClientId);
              const labelName = (((_i = data.label) == null ? void 0 : _i.name) || "").toLowerCase();
              let c = defaultColors.car;
              if (isActive) {
                c = defaultColors.active;
              } else if (labelName.includes("pedestrian") || labelName.includes("walker") || labelName.includes("person")) {
                c = defaultColors.pedestrian;
              } else if (labelName.includes("cyclist") || labelName.includes("bicycle") || labelName.includes("motorcycle") || labelName.includes("bike")) {
                c = defaultColors.cyclist;
              } else if (labelName.includes("truck")) {
                c = defaultColors.truck;
              } else if (labelName.includes("bus")) {
                c = defaultColors.bus;
              }
              const yaw = pts[5] || 0;
              fastBoxes.push({
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
                halfH: h2 / 2,
                maxR: Math.max(l, w, h2) * 0.75,
                colorR: c.r,
                colorG: c.g,
                colorB: c.b
              });
            }
          }
        }
        const numBoxes = fastBoxes.length;
        const isPlain = currentPointColorMode === "plain";
        const plainR = 0.72;
        const plainG = 0.76;
        const plainB = 0.82;
        let anyUpdated = false;
        for (const obj of ptsObjs) {
          const geom = obj.geometry;
          const posAttr = (_j = geom == null ? void 0 : geom.attributes) == null ? void 0 : _j.position;
          if (!posAttr || !posAttr.array) continue;
          const count = posAttr.count;
          const posArray = posAttr.array;
          const intensityAttr = (_k = geom.attributes.intensity || geom.attributes.intensities) == null ? void 0 : _k.array;
          let colorAttr = geom.attributes.color;
          let colorArray;
          const winThree = window.THREE;
          if (!colorAttr || !colorAttr.array || colorAttr.array.length !== count * 3) {
            colorArray = new Float32Array(count * 3);
            if (winThree && typeof winThree.BufferAttribute === "function") {
              geom.setAttribute("color", new winThree.BufferAttribute(colorArray, 3));
              colorAttr = geom.attributes.color;
            } else {
              colorAttr = {
                array: colorArray,
                count,
                itemSize: 3,
                needsUpdate: true
              };
              geom.attributes.color = colorAttr;
            }
          } else {
            colorArray = colorAttr.array;
          }
          for (let i = 0; i < count; i++) {
            const idx3 = i * 3;
            const px = posArray[idx3];
            const py = posArray[idx3 + 1];
            const pz = posArray[idx3 + 2];
            let v = 0.5;
            if (intensityAttr && i < intensityAttr.length) {
              const rawInt = intensityAttr[i];
              v = rawInt <= 1 ? rawInt : Math.min(1, rawInt / 255);
            }
            let matched = null;
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
                  matched = b;
                  break;
                }
              }
            }
            if (matched) {
              const factor = isPlain ? 0.9 : 0.4 + 0.6 * v;
              colorArray[idx3] = matched.colorR * factor;
              colorArray[idx3 + 1] = matched.colorG * factor;
              colorArray[idx3 + 2] = matched.colorB * factor;
            } else {
              if (isPlain) {
                colorArray[idx3] = plainR;
                colorArray[idx3 + 1] = plainG;
                colorArray[idx3 + 2] = plainB;
              } else {
                const boostV = Math.min(1, v * 1.25);
                if (v >= 0.7) {
                  colorArray[idx3] = 1;
                  colorArray[idx3 + 1] = 0.96;
                  colorArray[idx3 + 2] = 0.5 + 0.5 * boostV;
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
          canvas.render();
        }
        return anyUpdated;
      } catch (err) {
        console.warn("[CVAT 3D Suite] Lỗi applyPointCloudColorizationInMainWorld:", err);
        return false;
      }
    }
    function getEgoRoadGroundZInMainWorld(egoPos = { x: 0, y: 0, z: 0 }) {
      const lidar = getSceneLidarPoints();
      if (!lidar || lidar.count === 0) return -1.75;
      const { count, array } = lidar;
      const minRSq = 0.8 * 0.8;
      const maxRSq = 15 * 15;
      const zArr = [];
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
    function detectAccurateGroundZ(cx, cy, cz, yaw, halfL, halfW, halfH = 0.8, isInitialBox = false, lockRollFlat = false, egoRoadZ) {
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
          curbHeightCm: 0
        };
      }
      const { count, array } = lidar;
      const cosY = Math.cos(-yaw);
      const sinY = Math.sin(-yaw);
      const groundPts = [];
      const outerL = isInitialBox ? 3 : halfL + 0.55;
      const outerW = isInitialBox ? 2 : halfW + 0.45;
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
      const resolvedEgoRoadZ = getEgoRoadGroundZInMainWorld();
      const computeSmartFallbackGroundZ = () => {
        const curObjH = halfH * 2;
        const searchL = halfL + 0.35;
        const searchW = halfW + 0.25;
        const bodyPtsZ = [];
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
          bodyPtsZ.sort((a2, b2) => a2 - b2);
          const zRoof = bodyPtsZ[Math.floor(bodyPtsZ.length * 0.95)];
          const zLowest = bodyPtsZ[Math.floor(bodyPtsZ.length * 0.05)];
          const zFromRoof = zRoof - curObjH;
          const zFromLowest = zLowest - 0.18;
          const estimatedZ = Math.min(zFromRoof, zFromLowest);
          if (Math.abs(estimatedZ - currentBaseZ) <= 0.45) {
            return Number(estimatedZ.toFixed(3));
          }
        }
        const localGround = [];
        const minRSq = (halfL + 0.4) * (halfL + 0.4);
        const maxRSq = 5 * 5;
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
          localGround.sort((a2, b2) => a2 - b2);
          const p20 = localGround[Math.floor(localGround.length * 0.2)];
          if (Math.abs(p20 - currentBaseZ) <= 0.4) {
            return Number(p20.toFixed(3));
          }
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
          curbHeightCm: 0
        };
      }
      groundPts.sort((a2, b2) => a2.z - b2.z);
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
      if (inliers.length >= 6 && inliers.length >= sorted.length * 0.2) {
        validPts = inliers;
      }
      const qFL = [];
      const qFR = [];
      const qRL = [];
      const qRR = [];
      for (const p of validPts) {
        if (p.lx >= 0 && p.ly >= 0) qFL.push(p);
        else if (p.lx >= 0 && p.ly < 0) qFR.push(p);
        else if (p.lx < 0 && p.ly >= 0) qRL.push(p);
        else qRR.push(p);
      }
      const fitPts = [];
      const takeRatio = 0.45;
      const addLowestFromQuadrant = (q) => {
        if (q.length === 0) return;
        const count2 = Math.max(1, Math.floor(q.length * takeRatio));
        fitPts.push(...q.slice(0, count2));
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
          curbHeightCm: 0
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
      const maxPitchRad = 20 * Math.PI / 180;
      const maxRollRad = 25 * Math.PI / 180;
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
      if (Math.abs(det) > 1e-4) {
        let sumRes = 0;
        for (const p of finalPts) {
          const expectedZ = a * p.lx + b * p.ly + c0;
          sumRes += Math.abs(p.z - expectedZ);
        }
        sumRes / finalPts.length;
      }
      const p12Idx = Math.max(0, Math.floor(sorted.length * 0.12));
      const lowestRoadZ = sorted[p12Idx].z;
      const leftPtsZ = sorted.filter((p) => p.ly > 0.15).map((p) => p.z).sort((a2, b2) => a2 - b2);
      const rightPtsZ = sorted.filter((p) => p.ly < -0.15).map((p) => p.z).sort((a2, b2) => a2 - b2);
      let isCurbOrRamp = lockRollFlat === true;
      let isHalfCurb = false;
      let halfCurbSide = "none";
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
        (p) => p.ly >= -halfW - 0.45 && p.ly <= -halfW + W * 0.3
      );
      const edgeLeftPts = sorted.filter(
        (p) => p.ly >= halfW - W * 0.3 && p.ly <= halfW + 0.45
      );
      if (edgeRightPts.length >= 2 && edgeLeftPts.length >= 2) {
        const aSlope = -Math.tan(pitchRad);
        const baseFloorZ = sorted[0].z;
        const extractEdgeZ = (edgePts) => {
          const transPts = edgePts.map((p) => ({ lx: p.lx, ly: p.ly, zTrans: p.z - aSlope * p.lx })).sort((a2, b2) => a2.zTrans - b2.zTrans);
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
            const roadPts = validPts.filter((p) => p.z <= lowestRoadZ + 0.1);
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
        (p) => p.lx >= halfL - L * 0.3 && p.lx <= halfL + 0.45
      );
      const edgeRearPts = sorted.filter(
        (p) => p.lx >= -halfL - 0.45 && p.lx <= -halfL + L * 0.3
      );
      if (!isCurbOrRamp && !isHalfCurb && edgeFrontPts.length >= 2 && edgeRearPts.length >= 2) {
        const bSlope = Math.tan(rollRad);
        const extractSideZ = (edgePts) => {
          const transPts = edgePts.map((p) => ({ lx: p.lx, ly: p.ly, zTrans: p.z - bSlope * p.ly })).sort((a2, b2) => a2.zTrans - b2.zTrans);
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
      const refEgoZ = getEgoRoadGroundZInMainWorld();
      if (!isCurbOrRamp && !isHalfCurb) {
        if (c0 >= refEgoZ + 0.08 && c0 <= refEgoZ + 0.35) {
          isCurbGround = true;
          curbHeightCm = Math.round((c0 - refEgoZ) * 100);
          if (Math.abs(rollRad) < 5 * Math.PI / 180) {
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
      let pitchDegVal = Number((pitchRad * 180 / Math.PI).toFixed(2));
      let rollDegVal = Number((rollRad * 180 / Math.PI).toFixed(2));
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
        curbHeightCm
      };
    }
    function detectCurbStepAndRollInMainWorld(cx, cy, cz, yaw, halfL, halfW, trackW) {
      const lidar = getSceneLidarPoints();
      if (!lidar || lidar.count === 0) {
        return { hasCurb: false, side: "none", curbHeight: 0.15, curbHeightCm: 15, rollRad: 0, rollDeg: 0, roadGroundZ: cz - 0.7, deltaCenterZ: 0.075 };
      }
      const { count, array } = lidar;
      const cosY = Math.cos(-yaw);
      const sinY = Math.sin(-yaw);
      const effectiveW = trackW !== void 0 ? trackW : halfW * 2;
      const minLy = Math.max(0.2, halfW * 0.7);
      const maxLy = halfW + 0.85;
      const maxLx = halfL + 0.55;
      const maxZ = cz - 0.15;
      const minZ = cz - 4.5;
      const leftPts = [];
      const rightPts = [];
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
        const rollDeg = Number((rollRad * 180 / Math.PI).toFixed(2));
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
          deltaCenterZ
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
        deltaCenterZ: 0
      };
    }
    function detectTrueHeadZInMainWorld(zArr, maxGap = 0.15, groundZ, maxNormalHeight = 1.75) {
      if (zArr.length === 0) return 0;
      if (zArr.length === 1) return zArr[0];
      const sorted = [...zArr].sort((a, b) => a - b);
      const baseZ = groundZ !== void 0 ? groundZ : sorted[0];
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
    function filterDenseConnectedCluster1D2(pts, axis, maxGap = 0.22, centerBias = 0) {
      if (pts.length < 8) return pts;
      const sorted = [...pts].sort((a, b) => a[axis] - b[axis]);
      const clusters = [];
      let currentCluster = [sorted[0]];
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
    function detectAdaptiveBounds2(sortedValues, isYAxis = false) {
      const n = sortedValues.length;
      if (n < 8) {
        return { min: sortedValues[0] ?? 0, max: sortedValues[n - 1] ?? 0 };
      }
      const pMinIdx = Math.max(0, Math.floor(n * 5e-3));
      const pMaxIdx = Math.min(n - 1, Math.floor(n * 0.995));
      let minVal = sortedValues[pMinIdx];
      let maxVal = sortedValues[pMaxIdx];
      const minGap = isYAxis ? 0.14 : 0.25;
      const maxNoisePoints = Math.max(2, Math.min(12, Math.floor(n * 0.06)));
      for (let i = n - 1; i >= Math.floor(n * 0.65); i--) {
        const gap = sortedValues[i] - sortedValues[i - 1];
        const pointsAfter = n - i;
        if (gap >= minGap && pointsAfter <= maxNoisePoints) {
          maxVal = sortedValues[i - 1];
          break;
        }
      }
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
        max: Number(maxVal.toFixed(2))
      };
    }
    function computeDensityRobustBounds2(pts, options = {}) {
      if (pts.length === 0) {
        return { lxMin: 0, lxMax: 0, lyMin: 0, lyMax: 0, zTop: 0, validPointsCount: 0 };
      }
      const rorRadius = options.rorRadius ?? 0.35;
      const rorMinNeighbors = options.rorMinNeighbors ?? 1;
      let cleanPts = pts;
      if (pts.length >= 12) {
        const rorFiltered = [];
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
          validPointsCount: cleanPts.length
        };
      }
      const boundsX = detectAdaptiveBounds2(allLx, false);
      const boundsY = detectAdaptiveBounds2(allLy, true);
      return {
        lxMin: boundsX.min,
        lxMax: boundsX.max,
        lyMin: boundsY.min,
        lyMax: boundsY.max,
        zTop,
        validPointsCount: cleanPts.length
      };
    }
    function filterSparseNoiseByLocalDensity2(pts, options = {}) {
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
      const corePts = [];
      for (let i = 0; i < n; i++) {
        if (densities[i] >= coreThreshold) corePts.push(pts[i]);
      }
      if (corePts.length >= 6 && corePts.length >= n * 0.4) return corePts;
      return pts;
    }
    function computeIntensityWeights2(pts) {
      const n = pts.length;
      if (n === 0) {
        return { weights: [], hasValidIntensity: false, highIntensityThreshold: 0 };
      }
      const intensities = [];
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
          weights: new Array(n).fill(1),
          hasValidIntensity: false,
          highIntensityThreshold: 0
        };
      }
      const sorted = [...intensities].sort((a, b) => a - b);
      const minI = sorted[0];
      const maxI = sorted[sorted.length - 1];
      if (maxI - minI < 15) {
        return {
          weights: new Array(n).fill(1),
          hasValidIntensity: false,
          highIntensityThreshold: maxI
        };
      }
      const p75Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.75));
      const highIntensityThreshold = Math.max(minI + 15, sorted[p75Idx]);
      const range = maxI - minI;
      const weights = new Array(n);
      for (let i = 0; i < n; i++) {
        const norm = Math.max(0, Math.min(1, (intensities[i] - minI) / range));
        weights[i] = 1 + 1.5 * norm;
      }
      return {
        weights,
        hasValidIntensity: true,
        highIntensityThreshold
      };
    }
    function detectDominantWallEdgeWithValleyCutoff2(pts, axis, direction, nominalHalf, options = {}) {
      const isPos = direction === "positive";
      const orthAxis = axis === "ly" ? "lx" : "ly";
      const binSize = options.binSize ?? 0.03;
      const minSpanOrth = options.minSpanOrthogonal ?? (axis === "ly" ? 0.7 : 0.6);
      const maxSearchExt = options.maxSearchExtension ?? 0.35;
      const candidatePts = pts.filter((p) => isPos ? p[axis] > 0.02 : p[axis] < -0.02);
      if (candidatePts.length < 3) {
        return {
          edge: isPos ? nominalHalf : -nominalHalf,
          wallPoints: candidatePts,
          peakDensity: candidatePts.length
        };
      }
      const intensityData = options.useIntensity !== false ? computeIntensityWeights2(candidatePts) : null;
      const weights = (intensityData == null ? void 0 : intensityData.weights) || new Array(candidatePts.length).fill(1);
      const highThreshold = (intensityData == null ? void 0 : intensityData.highIntensityThreshold) ?? Infinity;
      const hasValidIntensity = (intensityData == null ? void 0 : intensityData.hasValidIntensity) ?? false;
      const maxDist = nominalHalf + maxSearchExt;
      const numBins = Math.ceil(maxDist / binSize) + 2;
      const bins = Array.from(
        { length: numBins },
        () => []
      );
      const binWeights = new Array(numBins).fill(0);
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
      if (maxWeight < 2) {
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
          peakDensity: 0
        };
      }
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
      const collectedWallPoints = [];
      for (let b = 0; b <= outerWallBin; b++) {
        for (const item of bins[b]) {
          collectedWallPoints.push(item.pt);
        }
      }
      const outerEdgeItems = [];
      const edgeStartBin = Math.max(0, outerWallBin - 3);
      for (let b = edgeStartBin; b <= outerWallBin; b++) {
        for (const item of bins[b]) {
          outerEdgeItems.push(item);
        }
      }
      if (outerEdgeItems.length >= 3) {
        const brightItems = outerEdgeItems.filter((i) => i.isBright);
        const targetItems = brightItems.length >= 2 ? brightItems : outerEdgeItems;
        const dists = targetItems.map((item) => isPos ? item.pt[axis] : -item.pt[axis]).sort((a, b) => a - b);
        const pIdx = Math.max(0, Math.min(dists.length - 1, Math.floor(dists.length * 0.95)));
        const chosenDist = dists[pIdx];
        const edge2 = isPos ? Number(chosenDist.toFixed(3)) : Number((-chosenDist).toFixed(3));
        return {
          edge: edge2,
          wallPoints: collectedWallPoints,
          peakDensity: Math.round(maxWeight)
        };
      }
      const fallbackDist = (outerWallBin + 1) * binSize;
      const edge = isPos ? Number(fallbackDist.toFixed(3)) : Number((-fallbackDist).toFixed(3));
      return {
        edge,
        wallPoints: collectedWallPoints.length > 0 ? collectedWallPoints : candidatePts,
        peakDensity: Math.round(maxWeight)
      };
    }
    function detectRoofTopBounds2(pts, expectedRoofZ) {
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
    function straightenYawFromBoundaryEdge2(pts, currentYaw, L, _W, visibleLateral, options = {}) {
      const maxAdjDeg = options.maxAdjustmentDeg ?? 8;
      const maxAdjRad = maxAdjDeg * Math.PI / 180;
      const intensityData = options.useIntensity !== false ? computeIntensityWeights2(pts) : null;
      const highThreshold = (intensityData == null ? void 0 : intensityData.highIntensityThreshold) ?? Infinity;
      const hasValidIntensity = (intensityData == null ? void 0 : intensityData.hasValidIntensity) ?? false;
      const isLeft = visibleLateral === "left";
      const sidePts = pts.filter((p) => (isLeft ? p.ly > 0 : p.ly < 0) && Math.abs(p.lx) <= L / 2);
      if (sidePts.length < 8) {
        return {
          newYawRad: currentYaw,
          newYawDeg: Number((currentYaw * 180 / Math.PI).toFixed(2)),
          deltaYawDeg: 0,
          slope: 0
        };
      }
      const numSlices = 10;
      const sliceWidth = L / numSlices;
      const slicePoints = [];
      for (let s = 0; s < numSlices; s++) {
        const minLx = -L / 2 + s * sliceWidth;
        const maxLx = minLx + sliceWidth;
        const inSlice = sidePts.filter((p) => p.lx >= minLx && p.lx < maxLx);
        if (inSlice.length >= 1) {
          const brightInSlice = hasValidIntensity ? inSlice.filter((p) => typeof p.intensity === "number" && p.intensity >= highThreshold) : [];
          const targetSlicePts = brightInSlice.length >= 1 ? brightInSlice : inSlice;
          const sliceWeight = brightInSlice.length >= 1 ? 2 : 1;
          if (isLeft) {
            const sortedLy = targetSlicePts.map((p) => p.ly).sort((a, b) => a - b);
            const pIdx = Math.max(0, Math.floor(sortedLy.length * 0.9));
            const medianLx = (minLx + maxLx) / 2;
            slicePoints.push({ lx: medianLx, ly: sortedLy[pIdx], weight: sliceWeight });
          } else {
            const sortedLy = targetSlicePts.map((p) => p.ly).sort((a, b) => a - b);
            const pIdx = Math.min(sortedLy.length - 1, Math.floor(sortedLy.length * 0.1));
            const medianLx = (minLx + maxLx) / 2;
            slicePoints.push({ lx: medianLx, ly: sortedLy[pIdx], weight: sliceWeight });
          }
        }
      }
      if (slicePoints.length < 4) {
        return {
          newYawRad: currentYaw,
          newYawDeg: Number((currentYaw * 180 / Math.PI).toFixed(2)),
          deltaYawDeg: 0,
          slope: 0
        };
      }
      const slopesWithWeights = [];
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
          sumLx += p.lx;
          sumLy += p.ly;
          sumLxLy += p.lx * p.ly;
          sumLx2 += p.lx * p.lx;
        }
        const denom = m * sumLx2 - sumLx * sumLx;
        slope = Math.abs(denom) > 1e-6 ? (m * sumLxLy - sumLx * sumLy) / denom : 0;
      }
      let deltaYaw = Math.atan(slope);
      deltaYaw = Math.max(-maxAdjRad, Math.min(maxAdjRad, deltaYaw));
      let deltaYawDeg = Number((deltaYaw * 180 / Math.PI).toFixed(2));
      if (Math.abs(deltaYawDeg) < 0.25) {
        deltaYaw = 0;
        deltaYawDeg = 0;
      }
      let newYaw = currentYaw + deltaYaw;
      while (newYaw > Math.PI) newYaw -= 2 * Math.PI;
      while (newYaw < -Math.PI) newYaw += 2 * Math.PI;
      return {
        newYawRad: Number(newYaw.toFixed(5)),
        newYawDeg: Number((newYaw * 180 / Math.PI).toFixed(2)),
        deltaYawDeg,
        slope: Number(slope.toFixed(4))
      };
    }
    function determineBumperByDensity2(pts, L, egoLocalX, egoLocalY) {
      if (pts.length === 0) {
        return {
          visibleBumper: egoLocalX >= 0 ? "front" : "rear",
          isParallelBalanced: false,
          nFront20: 0,
          nRear20: 0,
          nMiddle60: 0
        };
      }
      const allLx = pts.map((p) => p.lx).sort((a, b) => a - b);
      const pMinIdx = allLx.length >= 15 ? Math.floor(allLx.length * 0.015) : 0;
      const pMaxIdx = allLx.length >= 15 ? Math.min(allLx.length - 1, Math.floor(allLx.length * 0.985)) : allLx.length - 1;
      const lxMin = allLx[pMinIdx];
      const lxMax = allLx[pMaxIdx];
      const zoneSpan = Math.max(0.4, L * 0.2);
      const span = lxMax - lxMin;
      let nFront20 = 0;
      let nRear20 = 0;
      let nMiddle60 = 0;
      if (span < zoneSpan * 1.5) {
        const meanLx = pts.reduce((sum, p) => sum + p.lx, 0) / pts.length;
        const threshold = Math.max(0.35, L * 0.2);
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
      const isFrontDominant = nFront20 >= 6 && nRear20 <= 4 || nFront20 >= 8 && nFront20 >= nRear20 * 2.5;
      const isRearDominant = nRear20 >= 6 && nFront20 <= 4 || nRear20 >= 8 && nRear20 >= nFront20 * 2.5;
      if (isFrontDominant) {
        return {
          visibleBumper: "front",
          isParallelBalanced: false,
          nFront20,
          nRear20,
          nMiddle60
        };
      }
      if (isRearDominant) {
        return {
          visibleBumper: "rear",
          isParallelBalanced: false,
          nFront20,
          nRear20,
          nMiddle60
        };
      }
      const tan25 = 0.466;
      const isEgoParallel = Math.abs(egoLocalX) <= Math.abs(egoLocalY) * tan25;
      const isSymmetricBothEnds = Math.abs(nFront20 - nRear20) <= 2 && nFront20 >= 2 && nRear20 >= 2 && nMiddle60 >= 3;
      if ((isEgoParallel || isSymmetricBothEnds) && pts.length >= 4) {
        return {
          visibleBumper: egoLocalX >= 0 ? "front" : "rear",
          isParallelBalanced: true,
          nFront20,
          nRear20,
          nMiddle60
        };
      }
      let visibleBumper = egoLocalX >= 0 ? "front" : "rear";
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
        nMiddle60
      };
    }
    function fitBoxToEgoRayAndGroundInMainWorld(points, egoPos = { x: 0, y: 0, z: 0 }, options = {}) {
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
          newYawDeg: Number((yaw * 180 / Math.PI).toFixed(2)),
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
          message: "Không tìm thấy điểm LiDAR trong scene"
        };
      }
      const { count, array } = lidar;
      const groundInfo = detectAccurateGroundZ(cx, cy, cz, yaw, L / 2, W / 2, H / 2, false, false);
      const groundZ = groundInfo.groundZ !== null ? groundInfo.groundZ : 0;
      const pitchRad = groundInfo.pitchRad;
      const rollRad = groundInfo.rollRad;
      const cosY = Math.cos(-yaw);
      const sinY = Math.sin(-yaw);
      const minBodyZ = groundZ + 0.22;
      const maxRoofZ = groundZ + H + 0.55;
      const fitStep = options.fitStep ?? "all";
      const outerL = L / 2 + 0.45;
      const outerW = W / 2 + 0.35;
      const rawBodyPts = [];
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
      const denseCorePts = filterSparseNoiseByLocalDensity2(rawBodyPts, { radius: 0.12, minCoreNeighbors: 2 });
      const clusterLy = filterDenseConnectedCluster1D2(denseCorePts, "ly", 0.22, 0);
      const bodyPts = filterDenseConnectedCluster1D2(clusterLy, "lx", 0.22, 0);
      const dxEgo = cx - egoPos.x;
      const dyEgo = cy - egoPos.y;
      const vLocalX = -dxEgo * cosY + dyEgo * sinY;
      const vLocalY = -dxEgo * sinY - dyEgo * cosY;
      let visibleLongitudinal = vLocalX >= 0 ? "front" : "rear";
      let visibleLateral = vLocalY >= 0 ? "left" : "right";
      let shiftLx = 0;
      let shiftLy = 0;
      let roofTopZ = groundZ + H;
      let newH = H;
      let newL = L;
      let newW = W;
      let finalYaw = yaw;
      let straightYawDeg = Number((yaw * 180 / Math.PI).toFixed(2));
      let deltaYawDeg = 0;
      let isSideParallelBalanced = false;
      const preserveDimensions = options.preserveDimensions ?? true;
      const validBodyPts = bodyPts.length >= 4 ? bodyPts : denseCorePts.length >= 4 ? denseCorePts : rawBodyPts;
      if (validBodyPts.length >= 4) {
        const computeSideShift = (pts, targetL, targetW, currentYaw, center_x, center_y, ego_pos) => {
          const toEgoX = ego_pos.x - center_x;
          const toEgoY = ego_pos.y - center_y;
          const egoLocalX = toEgoX * Math.cos(currentYaw) + toEgoY * Math.sin(currentYaw);
          const egoLocalY = -toEgoX * Math.sin(currentYaw) + toEgoY * Math.cos(currentYaw);
          const edgePadding = options.edgePadding ?? 0.05;
          const densityDecision = determineBumperByDensity2(pts, targetL, egoLocalX, egoLocalY);
          if (densityDecision.isParallelBalanced && pts.length >= 4) {
            const allLx = pts.map((p) => p.lx).sort((a, b) => a - b);
            const pMinIdx = allLx.length >= 15 ? Math.floor(allLx.length * 0.015) : 0;
            const pMaxIdx = allLx.length >= 15 ? Math.min(allLx.length - 1, Math.floor(allLx.length * 0.985)) : allLx.length - 1;
            const lxMin = allLx[pMinIdx];
            const lxMax = allLx[pMaxIdx];
            let sLx2 = (lxMin + lxMax) / 2;
            const maxShiftL2 = Math.min(0.4, targetL * 0.25);
            sLx2 = Math.max(-maxShiftL2, Math.min(maxShiftL2, sLx2));
            if (Math.abs(sLx2) < 0.01) sLx2 = 0;
            return { shiftLx: sLx2, visibleBumper: densityDecision.visibleBumper, isBalanced: true };
          }
          const visibleBumper = densityDecision.visibleBumper;
          const targetBumperPts = pts.filter((p) => Math.abs(p.ly) <= targetW / 2 + 0.15);
          const activePtsForL = targetBumperPts.length >= 4 ? targetBumperPts : pts;
          const bumperCloudPts = activePtsForL.filter((p) => visibleBumper === "front" ? p.lx > 0 : p.lx < 0);
          const cleanBumperPts = filterSparseNoiseByLocalDensity2(bumperCloudPts, { radius: 0.15, minCoreNeighbors: 2 });
          const finalBumperPts = cleanBumperPts.length >= 3 ? cleanBumperPts : bumperCloudPts;
          let bumperEdge;
          if (finalBumperPts.length >= 3) {
            const wallDet = detectDominantWallEdgeWithValleyCutoff2(
              finalBumperPts,
              "lx",
              visibleBumper === "front" ? "positive" : "negative",
              targetL / 2,
              { minSpanOrthogonal: 0.6 }
            );
            bumperEdge = wallDet.edge;
          } else {
            bumperEdge = visibleBumper === "front" ? targetL / 2 : -targetL / 2;
          }
          let sLx = 0;
          if (visibleBumper === "front") {
            sLx = bumperEdge + edgePadding - targetL / 2;
          } else {
            sLx = bumperEdge - edgePadding + targetL / 2;
          }
          const maxShiftL = Math.min(0.4, targetL * 0.25);
          sLx = Math.max(-maxShiftL, Math.min(maxShiftL, sLx));
          if (Math.abs(sLx) < 0.01) sLx = 0;
          return { shiftLx: sLx, visibleBumper, isBalanced: false };
        };
        const computeTopYaw = (pts, currentYaw, targetL, targetW, visibleSide) => {
          const wallDet = detectDominantWallEdgeWithValleyCutoff2(
            pts,
            "ly",
            visibleSide === "left" ? "positive" : "negative",
            targetW / 2,
            { minSpanOrthogonal: 0.7 }
          );
          const activePtsForYaw = wallDet.wallPoints.length >= 6 ? wallDet.wallPoints : pts;
          return straightenYawFromBoundaryEdge2(activePtsForYaw, currentYaw, targetL, targetW, visibleSide, { maxAdjustmentDeg: 12 });
        };
        const computeFrontShift = (pts, targetW, targetL, currentYaw, center_x, center_y, ego_pos) => {
          const toEgoX = ego_pos.x - center_x;
          const toEgoY = ego_pos.y - center_y;
          const egoLocalY = -toEgoX * Math.sin(currentYaw) + toEgoY * Math.cos(currentYaw);
          const leftSidePts = pts.filter((p) => p.ly > 0.05);
          const rightSidePts = pts.filter((p) => p.ly < -0.05);
          let visibleSide;
          if (leftSidePts.length >= rightSidePts.length + 3) {
            visibleSide = "left";
          } else if (rightSidePts.length >= leftSidePts.length + 3) {
            visibleSide = "right";
          } else {
            visibleSide = egoLocalY >= 0 ? "left" : "right";
          }
          const targetSidePts = pts.filter((p) => Math.abs(p.lx) <= targetL / 2 + 0.15);
          const activePtsForW = targetSidePts.length >= 4 ? targetSidePts : pts;
          const sideCloudPts = activePtsForW.filter((p) => visibleSide === "left" ? p.ly > 0 : p.ly < 0);
          const cleanSidePts = filterSparseNoiseByLocalDensity2(sideCloudPts, { radius: 0.15, minCoreNeighbors: 2 });
          const finalSidePts = cleanSidePts.length >= 3 ? cleanSidePts : sideCloudPts;
          let boundaryEdge;
          if (finalSidePts.length >= 3) {
            const wallDet = detectDominantWallEdgeWithValleyCutoff2(
              finalSidePts,
              "ly",
              visibleSide === "left" ? "positive" : "negative",
              targetW / 2,
              { minSpanOrthogonal: 0.7 }
            );
            boundaryEdge = wallDet.edge;
          } else {
            boundaryEdge = visibleSide === "left" ? targetW / 2 : -targetW / 2;
          }
          const edgePadding = options.edgePadding ?? 0.05;
          let sLy = 0;
          if (visibleSide === "left") {
            sLy = boundaryEdge + edgePadding - targetW / 2;
          } else {
            sLy = boundaryEdge - edgePadding + targetW / 2;
          }
          const maxShiftW = Math.min(0.4, targetW * 0.3);
          sLy = Math.max(-maxShiftW, Math.min(maxShiftW, sLy));
          if (Math.abs(sLy) < 0.01) sLy = 0;
          return { shiftLy: sLy, visibleSide };
        };
        if (fitStep === "top") {
          const expectedRoofZ = groundZ + H;
          roofTopZ = detectRoofTopBounds2(validBodyPts, expectedRoofZ);
          const frontDet = computeFrontShift(validBodyPts, W, L, yaw, cx, cy, egoPos);
          visibleLateral = frontDet.visibleSide;
          const straightYawResult = computeTopYaw(validBodyPts, yaw, L, W, visibleLateral);
          finalYaw = straightYawResult.newYawRad;
          straightYawDeg = straightYawResult.newYawDeg;
          deltaYawDeg = straightYawResult.deltaYawDeg;
          shiftLx = 0;
          shiftLy = 0;
        } else if (fitStep === "side") {
          finalYaw = yaw;
          straightYawDeg = Number((yaw * 180 / Math.PI).toFixed(2));
          deltaYawDeg = 0;
          const sideRes = computeSideShift(validBodyPts, L, W, yaw, cx, cy, egoPos);
          shiftLx = sideRes.shiftLx;
          visibleLongitudinal = sideRes.visibleBumper;
          isSideParallelBalanced = sideRes.isBalanced;
          shiftLy = 0;
        } else if (fitStep === "front") {
          finalYaw = yaw;
          straightYawDeg = Number((yaw * 180 / Math.PI).toFixed(2));
          deltaYawDeg = 0;
          const frontRes = computeFrontShift(validBodyPts, W, L, yaw, cx, cy, egoPos);
          shiftLy = frontRes.shiftLy;
          visibleLateral = frontRes.visibleSide;
          shiftLx = 0;
        } else {
          const expectedRoofZ = groundZ + H;
          roofTopZ = detectRoofTopBounds2(validBodyPts, expectedRoofZ);
          let curCx = cx;
          let curCy = cy;
          let curYaw = yaw;
          const toLocalPts = (cCenter_x, cCenter_y, cYaw) => {
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
                ly: dx * sY + dy * cY
              };
            });
          };
          const applyShift = (sLx, sLy, cYaw) => {
            const cW = Math.cos(cYaw);
            const sW = Math.sin(cYaw);
            curCx = Number((curCx + sLx * cW - sLy * sW).toFixed(3));
            curCy = Number((curCy + sLx * sW + sLy * cW).toFixed(3));
          };
          let localPts = toLocalPts(curCx, curCy, curYaw);
          const side1 = computeSideShift(localPts, L, W, curYaw, curCx, curCy, egoPos);
          applyShift(side1.shiftLx, 0, curYaw);
          visibleLongitudinal = side1.visibleBumper;
          localPts = toLocalPts(curCx, curCy, curYaw);
          const frontDet1 = computeFrontShift(localPts, W, L, curYaw, curCx, curCy, egoPos);
          const top1 = computeTopYaw(localPts, curYaw, L, W, frontDet1.visibleSide);
          curYaw = top1.newYawRad;
          localPts = toLocalPts(curCx, curCy, curYaw);
          const front1 = computeFrontShift(localPts, W, L, curYaw, curCx, curCy, egoPos);
          applyShift(0, front1.shiftLy, curYaw);
          visibleLateral = front1.visibleSide;
          localPts = toLocalPts(curCx, curCy, curYaw);
          const side2 = computeSideShift(localPts, L, W, curYaw, curCx, curCy, egoPos);
          applyShift(side2.shiftLx, 0, curYaw);
          visibleLongitudinal = side2.visibleBumper;
          localPts = toLocalPts(curCx, curCy, curYaw);
          const top2 = computeTopYaw(localPts, curYaw, L, W, visibleLateral);
          curYaw = top2.newYawRad;
          localPts = toLocalPts(curCx, curCy, curYaw);
          const front2 = computeFrontShift(localPts, W, L, curYaw, curCx, curCy, egoPos);
          applyShift(0, front2.shiftLy, curYaw);
          visibleLateral = front2.visibleSide;
          finalYaw = curYaw;
          straightYawDeg = Number((finalYaw * 180 / Math.PI).toFixed(2));
          deltaYawDeg = Number(((finalYaw - yaw) * 180 / Math.PI).toFixed(2));
          while (deltaYawDeg > 180) deltaYawDeg -= 360;
          while (deltaYawDeg < -180) deltaYawDeg += 360;
          const cFinal = Math.cos(-finalYaw);
          const sFinal = Math.sin(-finalYaw);
          const totalDx = curCx - cx;
          const totalDy = curCy - cy;
          shiftLx = Number((totalDx * cFinal - totalDy * sFinal).toFixed(3));
          shiftLy = Number((totalDx * sFinal + totalDy * cFinal).toFixed(3));
        }
        if (fitStep === "top") {
          shiftLx = 0;
          shiftLy = 0;
        } else {
          const maxShiftL = Math.min(0.4, L * 0.25);
          const maxShiftW = Math.min(0.4, W * 0.3);
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
      const cosWorld = Math.cos(finalYaw);
      const sinWorld = Math.sin(finalYaw);
      const newX = Number((cx + shiftLx * cosWorld - shiftLy * sinWorld).toFixed(3));
      const newY = Number((cy + shiftLx * sinWorld + shiftLy * cosWorld).toFixed(3));
      const cosPitch = Math.cos(pitchRad);
      const cosRoll = Math.cos(rollRad);
      let newZ = Number((groundZ + newH / 2 * cosPitch * cosRoll).toFixed(3));
      let finalPitch = pitchRad;
      let finalRoll = rollRad;
      if (fitStep === "top" || fitStep === "side" || fitStep === "front") {
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
        pitchDeg: Number((finalPitch * 180 / Math.PI).toFixed(2)),
        rollDeg: Number((finalRoll * 180 / Math.PI).toFixed(2)),
        groundZ,
        roofTopZ,
        shiftLx: Number(shiftLx.toFixed(3)),
        shiftLy: Number(shiftLy.toFixed(3)),
        visibleFaces: {
          longitudinal: visibleLongitudinal,
          lateral: visibleLateral
        },
        dominantEdge: {
          edgeSide: visibleLateral,
          bumperSide: visibleLongitudinal,
          sideWallEdge: Number(shiftLy.toFixed(3)),
          bumperEdge: Number(shiftLx.toFixed(3))
        },
        pointsCount: bodyPts.length,
        message: msg
      };
    }
    function fitPedestrianInMainWorld(points, options = {}) {
      const cx = points[0];
      const cy = points[1];
      const cz = points[2];
      const yaw = points[5];
      const curL = points[6] || 0.65;
      const curW = points[7] || 0.65;
      const curH = points[8] || 1.7;
      const step = options.step ?? "all";
      const curYawDeg = Number((yaw * 180 / Math.PI).toFixed(2));
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
          message: "Không tìm thấy điểm LiDAR trong scene"
        };
      }
      const { count, array } = lidar;
      const headBuffer = options.headBuffer ?? 0.02;
      const margin = options.margin ?? 0.15;
      const footRadius = Math.max(0.35, Math.max(curL, curW) / 2 + margin);
      const footGroundPts = [];
      const maxFootGroundZ = cz - curH / 2 + 0.35;
      const minFootGroundZ = cz - 4;
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
      const minCoreZ = groundZ + 0.3;
      const maxBodyZ = groundZ + 2;
      const minFootZ = step === "side" || step === "front" ? groundZ + 0.02 : groundZ + 0.08;
      const outerL = Math.max(0.45, curL / 2 + 0.25);
      const outerW = Math.max(0.4, curW / 2 + 0.25);
      const cosY = Math.cos(-yaw);
      const sinY = Math.sin(-yaw);
      const coreBodyPts = [];
      const footPts = [];
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
            if (Math.abs(lx) <= Math.max(0.35, curL / 2 + 0.12) && Math.abs(ly) <= Math.max(0.3, curW / 2 + 0.12)) {
              footPts.push({ lx, ly, z, intensity });
            }
          }
        }
      }
      let rawBodyPts;
      if (step === "side" || step === "front") {
        rawBodyPts = [...coreBodyPts, ...footPts];
      } else {
        rawBodyPts = coreBodyPts.length >= 8 ? coreBodyPts : [...coreBodyPts, ...footPts];
      }
      const isSparse = rawBodyPts.length <= 12;
      const maxGapLx = step === "side" || isSparse ? 0.32 : 0.22;
      const maxGapLy = step === "front" || isSparse ? 0.3 : 0.22;
      const clusterLy = filterDenseConnectedCluster1D2(rawBodyPts, "ly", maxGapLy, 0);
      const bodyPts = filterDenseConnectedCluster1D2(clusterLy, "lx", maxGapLx, 0);
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
          message: `Không đủ điểm LiDAR thân người (${bodyPts.length} điểm), giữ nguyên box`
        };
      }
      const allLx = bodyPts.map((p) => p.lx).sort((a, b) => a - b);
      const allLy = bodyPts.map((p) => p.ly).sort((a, b) => a - b);
      const allZ = bodyPts.map((p) => p.z).sort((a, b) => a - b);
      const pMinIdx = !isSparse && bodyPts.length >= 25 ? Math.floor(bodyPts.length * 0.01) : 0;
      const pMaxIdx = !isSparse && bodyPts.length >= 25 ? Math.min(bodyPts.length - 1, Math.floor(bodyPts.length * 0.99)) : bodyPts.length - 1;
      const lxMin = allLx[pMinIdx];
      const lxMax = allLx[pMaxIdx];
      const lyMin = allLy[pMinIdx];
      const lyMax = allLy[pMaxIdx];
      const highestPtZ = detectTrueHeadZInMainWorld(allZ, 0.15, groundZ, 1.78);
      const normalizeRad = (r) => {
        let a = r;
        while (a > Math.PI) a -= 2 * Math.PI;
        while (a < -Math.PI) a += 2 * Math.PI;
        return a;
      };
      if (step === "top") {
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
        const dThetaDeg = dTheta * 180 / Math.PI;
        if (Math.abs(dThetaDeg) <= 25) {
          newYaw = normalizeRad(yaw + dTheta);
          newYawDeg = Number((newYaw * 180 / Math.PI).toFixed(2));
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
          const isSideBeamParallel = Math.abs(egoLocalX) <= Math.abs(egoLocalY) * 0.466;
          if (isSideBeamParallel) {
            shiftLx = (lxMin + lxMax) / 2;
            bumperName = "Chiếu ngang sườn (Dàn đều trước - sau)";
          } else if (egoLocalX < 0) {
            shiftLx = lxMin - 0.02 + curL / 2;
            bumperName = "Mặt sau";
          } else {
            shiftLx = lxMax + 0.02 - curL / 2;
            bumperName = "Mặt trước";
          }
        } else {
          const frontCount = bodyPts.filter((p) => p.lx > 0).length;
          const rearCount = bodyPts.filter((p) => p.lx <= 0).length;
          if (frontCount > rearCount * 1.5) {
            shiftLx = lxMax + 0.02 - curL / 2;
            bumperName = "Mặt trước";
          } else if (rearCount > frontCount * 1.5) {
            shiftLx = lxMin - 0.02 + curL / 2;
            bumperName = "Mặt sau";
          } else {
            shiftLx = (lxMin + lxMax) / 2;
            bumperName = "Cân đối";
          }
        }
        shiftLx = Math.max(-0.35, Math.min(0.35, shiftLx));
        if (Math.abs(shiftLx) < 5e-3) shiftLx = 0;
        newX = Number((cx + shiftLx * Math.cos(yaw)).toFixed(3));
        newY = Number((cy + shiftLx * Math.sin(yaw)).toFixed(3));
        const signX = shiftLx >= 0 ? "+" : "";
        msg = `Đã căn SIDE Người đi bộ: [${bumperName}] bám mép đón tia (ΔX: ${signX}${(shiftLx * 100).toFixed(1)}cm, giữ nguyên Z), Khóa size ${curL}x${curW}x${curH}m`;
      } else if (step === "front") {
        newYaw = yaw;
        newYawDeg = curYawDeg;
        deltaYawDeg = 0;
        newL = curL;
        newW = curW;
        newH = curH;
        newZ = cz;
        let visibleSide = "center";
        let shiftLy = 0;
        const edgePadding = 0.025;
        if (options.egoPos) {
          const toEgoX = options.egoPos.x - cx;
          const toEgoY = options.egoPos.y - cy;
          const egoLocalX = toEgoX * Math.cos(yaw) + toEgoY * Math.sin(yaw);
          const egoLocalY = -toEgoX * Math.sin(yaw) + toEgoY * Math.cos(yaw);
          if (Math.abs(egoLocalY) <= Math.abs(egoLocalX) * 0.15 && Math.abs(egoLocalY) < 0.1) {
            visibleSide = "center";
            shiftLy = (lyMin + lyMax) / 2;
          } else if (egoLocalY >= 0) {
            visibleSide = "left";
            shiftLy = lyMax + edgePadding - curW / 2;
          } else {
            visibleSide = "right";
            shiftLy = lyMin - edgePadding + curW / 2;
          }
        } else {
          const leftCount = bodyPts.filter((p) => p.ly > 0.03).length;
          const rightCount = bodyPts.filter((p) => p.ly < -0.03).length;
          if (leftCount > rightCount * 1.3) {
            visibleSide = "left";
            shiftLy = lyMax + edgePadding - curW / 2;
          } else if (rightCount > leftCount * 1.3) {
            visibleSide = "right";
            shiftLy = lyMin - edgePadding + curW / 2;
          } else {
            visibleSide = "center";
            shiftLy = (lyMin + lyMax) / 2;
          }
        }
        shiftLy = Math.max(-0.35, Math.min(0.35, shiftLy));
        if (Math.abs(shiftLy) < 5e-3) shiftLy = 0;
        newX = Number((cx - shiftLy * Math.sin(yaw)).toFixed(3));
        newY = Number((cy + shiftLy * Math.cos(yaw)).toFixed(3));
        const signY = shiftLy >= 0 ? "+" : "";
        const sideText = visibleSide === "left" ? "Sườn Trái đón tia Ego" : visibleSide === "right" ? "Sườn Phải đón tia Ego" : "Cân đối 2 sườn";
        msg = `Đã căn FRONT Người đi bộ: [${sideText}] ôm sát viền đón tia (ΔY: ${signY}${(shiftLy * 100).toFixed(1)}cm, giữ nguyên Z), Khóa size ${curL}x${curW}x${curH}m`;
      } else if (step === "l") {
        newYaw = yaw;
        newYawDeg = curYawDeg;
        deltaYawDeg = 0;
        newW = curW;
        newH = curH;
        newZ = cz;
        const spanL = lxMax - lxMin + 0.05;
        let shiftLx = 0;
        if (spanL > 0.78) {
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
              shiftLx = lxMin - 0.02 + newL / 2;
            } else {
              shiftLx = lxMax + 0.02 - newL / 2;
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
        newYaw = yaw;
        newYawDeg = curYawDeg;
        deltaYawDeg = 0;
        newL = curL;
        newH = curH;
        newZ = cz;
        const spanW = lyMax - lyMin + 0.04;
        let shiftLy = 0;
        if (spanW > 0.68) {
          newW = 0.68;
          if (options.egoPos) {
            const toEgoX = options.egoPos.x - cx;
            const toEgoY = options.egoPos.y - cy;
            const egoLocalY = -toEgoX * Math.sin(yaw) + toEgoY * Math.cos(yaw);
            if (egoLocalY > 0.04) {
              shiftLy = lyMax + 0.01 - newW / 2;
            } else if (egoLocalY < -0.04) {
              shiftLy = lyMin - 0.01 + newW / 2;
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
        const maxCapPedH = options.headBuffer !== void 0 ? 1.95 : 1.78;
        newH = Number(Math.max(1, Math.min(maxCapPedH, roofTopZ - effectiveBaseZ)).toFixed(2));
        newZ = Number((effectiveBaseZ + newH / 2).toFixed(3));
        msg = `Đã fix Chiều Cao (H) Người đi bộ: H=${newH}m (Đáy bám sàn Z=${effectiveBaseZ.toFixed(2)}m cố định, nở lên đỉnh đầu +${Math.round(headBuffer * 100)}cm gọn gàng), giữ nguyên L, W & XY`;
      } else {
        const spanL = lxMax - lxMin + 0.05;
        newL = Number(Math.max(0.4, Math.min(0.78, spanL)).toFixed(2));
        const spanW = lyMax - lyMin + 0.04;
        newW = Number(Math.max(0.38, Math.min(0.68, spanW)).toFixed(2));
        const roofTopZ = highestPtZ + headBuffer;
        const maxCapPedH = options.headBuffer !== void 0 ? 1.95 : 1.78;
        newH = Number(Math.max(1.05, Math.min(maxCapPedH, roofTopZ - groundZ)).toFixed(2));
        let shiftLx = (lxMin + lxMax) / 2;
        let shiftLy = (lyMin + lyMax) / 2;
        const maxShift = 0.4;
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
        message: msg
      };
    }
    function fitCyclistInMainWorld(points, options = {}) {
      const cx = points[0];
      const cy = points[1];
      const cz = points[2];
      const yaw = points[5];
      const curL = points[6] || 1.75;
      const curW = points[7] || 0.65;
      const curH = points[8] || 1.55;
      const step = options.step ?? "all";
      const curYawDeg = Number((yaw * 180 / Math.PI).toFixed(2));
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
          message: "Không tìm thấy điểm LiDAR trong scene"
        };
      }
      const { count, array } = lidar;
      const headBuffer = options.headBuffer ?? 0.02;
      const margin = options.margin ?? 0.2;
      const footRadius = Math.max(0.6, curL / 2 + margin);
      const groundPts = [];
      const maxGroundZ = cz - curH / 2 + 0.35;
      const minGroundZ = cz - 4;
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
      const minCoreZ = groundZ + 0.25;
      const maxBodyZ = groundZ + 2;
      const minWheelZ = step === "side" || step === "front" ? groundZ + 0.02 : groundZ + 0.08;
      const outerL = curL / 2 + 0.45;
      const outerW = Math.max(curW, 0.85) / 2 + 0.45;
      const cosY = Math.cos(-yaw);
      const sinY = Math.sin(-yaw);
      const corePts = [];
      const wheelPts = [];
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
            if (Math.abs(ly) <= Math.max(0.25, curW / 2 + 0.08)) {
              wheelPts.push({ lx, ly, z, intensity });
            }
          }
        }
      }
      let rawPts;
      if (step === "side" || step === "front") {
        rawPts = [...corePts, ...wheelPts];
      } else {
        rawPts = corePts.length >= 8 ? corePts : [...corePts, ...wheelPts];
      }
      const isSparse = rawPts.length <= 12;
      const maxGapLx = step === "side" || isSparse ? 0.38 : 0.28;
      const maxGapLy = step === "front" || isSparse ? 0.35 : 0.24;
      const clusterLy = filterDenseConnectedCluster1D2(rawPts, "ly", maxGapLy, 0);
      const bodyPts = filterDenseConnectedCluster1D2(clusterLy, "lx", maxGapLx, 0);
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
          message: `Không đủ điểm LiDAR xe 2 bánh (${bodyPts.length} điểm)`
        };
      }
      const allLx = bodyPts.map((p) => p.lx).sort((a, b) => a - b);
      const allLy = bodyPts.map((p) => p.ly).sort((a, b) => a - b);
      const allZ = bodyPts.map((p) => p.z).sort((a, b) => a - b);
      const pMinIdx = !isSparse && bodyPts.length >= 35 ? Math.floor(bodyPts.length * 0.01) : 0;
      const pMaxIdx = !isSparse && bodyPts.length >= 35 ? Math.min(bodyPts.length - 1, Math.floor(bodyPts.length * 0.99)) : bodyPts.length - 1;
      const lxMin = allLx[pMinIdx];
      const lxMax = allLx[pMaxIdx];
      const lyMin = allLy[pMinIdx];
      const lyMax = allLy[pMaxIdx];
      const highestPtZ = detectTrueHeadZInMainWorld(allZ, 0.15, groundZ, 1.6);
      const normalizeRad = (r) => {
        let a = r;
        while (a > Math.PI) a -= 2 * Math.PI;
        while (a < -Math.PI) a += 2 * Math.PI;
        return a;
      };
      const calcHeadingDelta = () => {
        const n = bodyPts.length;
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
        const sorted = [...bodyPts].sort((a, b) => a.lx - b.lx);
        const sliceCount = Math.max(1, Math.floor(n * 0.3));
        const rearSlice = sorted.slice(0, sliceCount);
        const frontSlice = sorted.slice(Math.max(sliceCount, n - sliceCount));
        const rearLx = rearSlice.reduce((s, p) => s + p.lx, 0) / rearSlice.length;
        const rearLy = rearSlice.reduce((s, p) => s + p.ly, 0) / rearSlice.length;
        const frontLx = frontSlice.reduce((s, p) => s + p.lx, 0) / frontSlice.length;
        const frontLy = frontSlice.reduce((s, p) => s + p.ly, 0) / frontSlice.length;
        const dLx = frontLx - rearLx;
        const dLy = frontLy - rearLy;
        let deltaThetaExt = deltaThetaPca;
        if (dLx >= 0.3) {
          deltaThetaExt = Math.atan2(dLy, dLx);
        }
        let dTheta = Math.abs(deltaThetaPca - deltaThetaExt) < 0.2 ? 0.7 * deltaThetaPca + 0.3 * deltaThetaExt : deltaThetaPca;
        return Math.max(-Math.PI / 4, Math.min(Math.PI / 4, dTheta));
      };
      if (step === "top") {
        const dTheta = calcHeadingDelta();
        newYaw = normalizeRad(yaw + dTheta);
        newYawDeg = Number((newYaw * 180 / Math.PI).toFixed(2));
        deltaYawDeg = Number((dTheta * 180 / Math.PI).toFixed(2));
        newX = cx;
        newY = cy;
        newZ = cz;
        newL = curL;
        newW = curW;
        newH = curH;
        const sign = deltaYawDeg >= 0 ? "+" : "";
        msg = `Đã căn TOP Xe 2 bánh: Xoay Yaw (${newYawDeg}°, Δ=${sign}${deltaYawDeg}°) theo trục Đầu - Đuôi, khóa tâm X/Y/Z & L/W/H`;
      } else if (step === "side") {
        newYaw = yaw;
        newYawDeg = curYawDeg;
        deltaYawDeg = 0;
        newL = curL;
        newW = curW;
        newH = curH;
        let shiftLx = 0;
        let bumperName = "Đón tia";
        const riderPts = bodyPts.filter((p) => p.z >= groundZ + 0.65);
        const hasRider = riderPts.length >= 2;
        let lxRider = 0;
        if (hasRider) {
          const sortedRiderLx = riderPts.map((p) => p.lx).sort((a, b) => a - b);
          lxRider = sortedRiderLx[Math.floor(sortedRiderLx.length / 2)];
        }
        const distFront = hasRider ? lxMax - lxRider : curL / 2;
        const distRear = hasRider ? lxRider - lxMin : curL / 2;
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
          isSideBeamParallel = Math.abs(egoLocalX) <= Math.abs(egoLocalY) * 0.466;
        }
        if (isMissingFront && isMissingRear) {
          shiftLx = lxRider - 0.08 * curL;
          bumperName = "Người lái 42% (Mất cả 2 bánh)";
        } else if (isMissingFront) {
          const estFrontEdge = lxRider + 0.42 * curL;
          if (hasEgo && !isSideBeamParallel && egoLocalX < 0) {
            shiftLx = lxMin - 0.02 + curL / 2;
            bumperName = "Cản sau (Mất bánh trước)";
          } else {
            shiftLx = (lxMin + estFrontEdge) / 2;
            bumperName = "Người lái 42% + Bánh sau (Mất bánh trước)";
          }
        } else if (isMissingRear) {
          const estRearEdge = lxRider - 0.58 * curL;
          if (hasEgo && !isSideBeamParallel && egoLocalX > 0) {
            shiftLx = lxMax + 0.02 - curL / 2;
            bumperName = "Cản trước (Mất bánh sau)";
          } else {
            shiftLx = (estRearEdge + lxMax) / 2;
            bumperName = "Người lái 42% + Bánh trước (Mất bánh sau)";
          }
        } else {
          if (hasEgo) {
            if (isSideBeamParallel) {
              shiftLx = (lxMin + lxMax) / 2;
              bumperName = "Chiếu ngang sườn (Dàn đều 2 bánh)";
            } else if (egoLocalX < 0) {
              shiftLx = lxMin - 0.03 + curL / 2;
              bumperName = "Cản/Bánh sau đón tia";
            } else {
              shiftLx = lxMax + 0.03 - curL / 2;
              bumperName = "Cản/Bánh trước đón tia";
            }
          } else {
            const frontCount = bodyPts.filter((p) => p.lx > 0).length;
            const rearCount = bodyPts.filter((p) => p.lx <= 0).length;
            if (frontCount > rearCount * 1.5) {
              shiftLx = lxMax + 0.03 - curL / 2;
              bumperName = "Cản trước";
            } else if (rearCount > frontCount * 1.5) {
              shiftLx = lxMin - 0.03 + curL / 2;
              bumperName = "Cản sau";
            } else {
              shiftLx = (lxMin + lxMax) / 2;
              bumperName = "Cân đối";
            }
          }
        }
        shiftLx = Math.max(-0.6, Math.min(0.6, shiftLx));
        if (Math.abs(shiftLx) < 5e-3) shiftLx = 0;
        newZ = cz;
        newX = Number((cx + shiftLx * Math.cos(yaw)).toFixed(3));
        newY = Number((cy + shiftLx * Math.sin(yaw)).toFixed(3));
        const signX = shiftLx >= 0 ? "+" : "";
        msg = `Đã căn SIDE Xe 2 bánh: [${bumperName}] bám vệt lốp (ΔX: ${signX}${(shiftLx * 100).toFixed(1)}cm, giữ nguyên cao độ Z), Khóa L: ${newL}m`;
      } else if (step === "front") {
        newYaw = yaw;
        newYawDeg = curYawDeg;
        deltaYawDeg = 0;
        newL = curL;
        newW = curW;
        newH = curH;
        newZ = cz;
        let visibleSide = "center";
        const edgePadding = 0.03;
        let shiftLy = 0;
        if (options.egoPos) {
          const toEgoX = options.egoPos.x - cx;
          const toEgoY = options.egoPos.y - cy;
          const egoLocalX = toEgoX * Math.cos(yaw) + toEgoY * Math.sin(yaw);
          const egoLocalY = -toEgoX * Math.sin(yaw) + toEgoY * Math.cos(yaw);
          if (Math.abs(egoLocalY) <= Math.abs(egoLocalX) * 0.15 && Math.abs(egoLocalY) < 0.15) {
            visibleSide = "center";
            shiftLy = (lyMin + lyMax) / 2;
          } else if (egoLocalY >= 0) {
            visibleSide = "left";
            shiftLy = lyMax + edgePadding - curW / 2;
          } else {
            visibleSide = "right";
            shiftLy = lyMin - edgePadding + curW / 2;
          }
        } else {
          const leftCount = bodyPts.filter((p) => p.ly > 0.05).length;
          const rightCount = bodyPts.filter((p) => p.ly < -0.05).length;
          if (leftCount > rightCount * 1.3) {
            visibleSide = "left";
            shiftLy = lyMax + edgePadding - curW / 2;
          } else if (rightCount > leftCount * 1.3) {
            visibleSide = "right";
            shiftLy = lyMin - edgePadding + curW / 2;
          } else {
            visibleSide = "center";
            shiftLy = (lyMin + lyMax) / 2;
          }
        }
        shiftLy = Math.max(-0.35, Math.min(0.35, shiftLy));
        if (Math.abs(shiftLy) < 5e-3) shiftLy = 0;
        newX = Number((cx - shiftLy * Math.sin(yaw)).toFixed(3));
        newY = Number((cy + shiftLy * Math.cos(yaw)).toFixed(3));
        const signY = shiftLy >= 0 ? "+" : "";
        const sideText = visibleSide === "left" ? "Sườn Trái" : visibleSide === "right" ? "Sườn Phải" : "Cân đối 2 sườn";
        msg = `Đã căn FRONT Xe 2 bánh: [${sideText}] đón tia ăn khít phương W (ΔY: ${signY}${(shiftLy * 100).toFixed(1)}cm), giữ nguyên cao độ Z và kích thước (chuẩn Car)`;
      } else if (step === "w") {
        newYaw = yaw;
        newYawDeg = curYawDeg;
        deltaYawDeg = 0;
        newL = curL;
        newH = curH;
        newZ = cz;
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
        if (measuredW > 0.85) {
          newW = 0.85;
          if (options.egoPos) {
            const toEgoX = options.egoPos.x - cx;
            const toEgoY = options.egoPos.y - cy;
            const egoLocalY = -toEgoX * Math.sin(yaw) + toEgoY * Math.cos(yaw);
            if (egoLocalY > 0.05) {
              shiftLy = lyMax + 0.03 - newW / 2;
            } else if (egoLocalY < -0.05) {
              shiftLy = lyMin - 0.03 + newW / 2;
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
        const maxCap2WH = options.headBuffer !== void 0 ? 1.85 : 1.68;
        newH = Number(Math.max(1.05, Math.min(maxCap2WH, roofTopZ - effectiveBaseZ)).toFixed(2));
        newZ = Number((effectiveBaseZ + newH / 2).toFixed(3));
        msg = `Đã fit Cao (H) Xe 2 bánh: H=${newH}m (Đáy bám sàn Z=${effectiveBaseZ.toFixed(2)}m cố định, nở lên nóc +${Math.round(headBuffer * 100)}cm gọn gàng), giữ nguyên L, W & XY`;
      } else {
        const dTheta = calcHeadingDelta();
        newYaw = normalizeRad(yaw + dTheta);
        newYawDeg = Number((newYaw * 180 / Math.PI).toFixed(2));
        deltaYawDeg = Number((dTheta * 180 / Math.PI).toFixed(2));
        newL = curL;
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
        const maxCap2WH = options.headBuffer !== void 0 ? 1.85 : 1.68;
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
        message: msg
      };
    }
    function computeLidarGroundAndFit(points, fitMode = "tight") {
      const cx = points[0];
      const cy = points[1];
      const cz = points[2];
      let yaw = points[5];
      let l = points[6];
      let w = points[7];
      let h2 = points[8];
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
          newH: h2,
          pointsCount: 0
        };
      }
      const { count, array } = lidar;
      const isInitialBox = l <= 2.2 || w <= 1.3;
      const halfL = isInitialBox ? 3 : l / 2 + 0.35;
      const halfW = isInitialBox ? 2 : w / 2 + 0.35;
      const groundInfo = detectAccurateGroundZ(cx, cy, cz, yaw, l / 2, w / 2, h2 / 2, isInitialBox, false);
      const detectedGroundZ = groundInfo.groundZ;
      const effectiveGroundZ = detectedGroundZ !== null ? detectedGroundZ : 0;
      let cosY = Math.cos(-yaw);
      let sinY = Math.sin(-yaw);
      const candidateBodyPts = [];
      const maxRoofZ = effectiveGroundZ + 2.7;
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
      let newZ = Number((effectiveGroundZ + h2 / 2).toFixed(3));
      let newYaw = yaw;
      let newL = l;
      let newW = w;
      let newH = h2;
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
        const rawLocalBodyPts = [];
        for (const p of candidateBodyPts) {
          const dx = p.x - cx;
          const dy = p.y - cy;
          const lx = dx * cosY - dy * sinY;
          const ly = dx * sinY + dy * cosY;
          rawLocalBodyPts.push({ lx, ly, z: p.z });
        }
        const filteredLy = filterDenseConnectedCluster1D2(rawLocalBodyPts, "ly", 0.22, 0);
        const localBodyPts = filterDenseConnectedCluster1D2(filteredLy, "lx", 0.22, 0);
        const robustBounds = computeDensityRobustBounds2(localBodyPts);
        const lxMin = robustBounds.lxMin;
        const lxMax = robustBounds.lxMax;
        const lyMin = robustBounds.lyMin;
        const lyMax = robustBounds.lyMax;
        const zTop = robustBounds.zTop;
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
    const mainWorldLabelsCache = /* @__PURE__ */ new Map();
    function updateMainWorldLabels(job) {
      var _a, _b, _c, _d, _e, _f, _g;
      try {
        const store = getReduxStore();
        const storeJob = ((_c = (_b = (_a = store == null ? void 0 : store.getState()) == null ? void 0 : _a.annotation) == null ? void 0 : _b.job) == null ? void 0 : _c.instance) || job;
        const labels = (storeJob == null ? void 0 : storeJob.labels) || ((_d = storeJob == null ? void 0 : storeJob.task) == null ? void 0 : _d.labels) || ((_g = (_f = (_e = store == null ? void 0 : store.getState()) == null ? void 0 : _e.annotation) == null ? void 0 : _f.job) == null ? void 0 : _g.labels);
        if (Array.isArray(labels)) {
          for (const l of labels) {
            if (l && l.id !== void 0) {
              mainWorldLabelsCache.set(Number(l.id), {
                name: l.name || "Object",
                color: l.color || "#3b82f6"
              });
            }
          }
        }
      } catch (_) {
      }
    }
    function resolveLabelName(stateOrShape) {
      if ((stateOrShape == null ? void 0 : stateOrShape.label) && typeof stateOrShape.label.name === "string" && stateOrShape.label.name.trim()) {
        return {
          name: stateOrShape.label.name.trim(),
          color: stateOrShape.label.color || "#22c55e"
        };
      }
      const lblId = (stateOrShape == null ? void 0 : stateOrShape.labelID) ?? (stateOrShape == null ? void 0 : stateOrShape.labelId) ?? (stateOrShape == null ? void 0 : stateOrShape.label_id);
      if (lblId !== void 0 && mainWorldLabelsCache.has(Number(lblId))) {
        return mainWorldLabelsCache.get(Number(lblId));
      }
      return { name: "Car", color: "#22c55e" };
    }
    function center3DViewOnObject(uiId, targetPos) {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
      try {
        const store = getReduxStore();
        const canvas = (_c = (_b = (_a = store == null ? void 0 : store.getState()) == null ? void 0 : _a.annotation) == null ? void 0 : _b.canvas) == null ? void 0 : _c.instance;
        if (!canvas || !canvas.view) return false;
        try {
          if (typeof canvas.center === "function") {
            canvas.center(uiId);
          }
          if (typeof ((_d = canvas.view) == null ? void 0 : _d.center) === "function") {
            canvas.view.center(uiId);
          }
          if (typeof ((_e = canvas.view) == null ? void 0 : _e.focus) === "function") {
            canvas.view.focus(uiId);
          }
        } catch (_) {
        }
        let pos = targetPos;
        if (!pos) {
          const drawn = (_g = (_f = canvas.view) == null ? void 0 : _f.drawnObjects) == null ? void 0 : _g[String(uiId)];
          if (((_h = drawn == null ? void 0 : drawn.data) == null ? void 0 : _h.points) && Array.isArray(drawn.data.points)) {
            pos = {
              x: drawn.data.points[0],
              y: drawn.data.points[1],
              z: drawn.data.points[2]
            };
          }
        }
        if (!pos || typeof pos.x !== "number" || isNaN(pos.x)) return false;
        const views = canvas.view.views;
        if (views) {
          const pView = views.perspective;
          if ((_i = pView == null ? void 0 : pView.controls) == null ? void 0 : _i.target) {
            const curTarget = pView.controls.target;
            const deltaX = pos.x - curTarget.x;
            const deltaY = pos.y - curTarget.y;
            const deltaZ = pos.z - curTarget.z;
            curTarget.set(pos.x, pos.y, pos.z);
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
          for (const viewName of ["top", "side", "front"]) {
            const oView = views[viewName];
            if (oView) {
              if ((_j = oView.controls) == null ? void 0 : _j.target) {
                oView.controls.target.set(pos.x, pos.y, pos.z);
                if (typeof oView.controls.update === "function") {
                  oView.controls.update();
                }
              }
              if (typeof oView.updateControls === "function") {
                oView.updateControls();
              }
            }
          }
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
    let autoCenterOnFrameChange = true;
    let lastActiveTrackId = null;
    function lockOnActiveObjectAtFrame(targetId, targetFrame, attempt = 0) {
      var _a, _b, _c, _d, _e, _f;
      if (!autoCenterOnFrameChange) return;
      if (targetId === null || targetId === void 0 || isNaN(targetId)) return;
      try {
        const store = getReduxStore();
        const anno = (_a = store == null ? void 0 : store.getState()) == null ? void 0 : _a.annotation;
        const canvas = (_b = anno == null ? void 0 : anno.canvas) == null ? void 0 : _b.instance;
        let foundPos = null;
        const drawnItem = (_d = (_c = canvas == null ? void 0 : canvas.view) == null ? void 0 : _c.drawnObjects) == null ? void 0 : _d[String(targetId)];
        if (((_e = drawnItem == null ? void 0 : drawnItem.data) == null ? void 0 : _e.points) && Array.isArray(drawnItem.data.points)) {
          foundPos = {
            x: drawnItem.data.points[0],
            y: drawnItem.data.points[1],
            z: drawnItem.data.points[2]
          };
        }
        if (!foundPos) {
          const states = ((_f = anno == null ? void 0 : anno.annotations) == null ? void 0 : _f.states) || [];
          const matched = states.find(
            (s) => s.clientID === targetId || s.parentID === targetId || s.trackID === targetId
          );
          if (matched && Array.isArray(matched.points) && matched.points.length >= 3) {
            foundPos = {
              x: matched.points[0],
              y: matched.points[1],
              z: matched.points[2]
            };
          }
        }
        if (foundPos && typeof foundPos.x === "number" && !isNaN(foundPos.x)) {
          center3DViewOnObject(targetId, foundPos);
          if (canvas && typeof canvas.activate === "function") {
            try {
              canvas.activate(targetId);
              if (typeof canvas.render === "function") {
                canvas.render();
              }
            } catch (_) {
            }
          }
          return;
        }
        const delays = [30, 70, 140, 250];
        if (attempt < delays.length) {
          setTimeout(() => {
            var _a2, _b2, _c2, _d2, _e2, _f2;
            const curF = ((_b2 = (_a2 = anno == null ? void 0 : anno.player) == null ? void 0 : _a2.frame) == null ? void 0 : _b2.number) ?? ((_f2 = (_e2 = (_d2 = (_c2 = store == null ? void 0 : store.getState()) == null ? void 0 : _c2.annotation) == null ? void 0 : _d2.job) == null ? void 0 : _e2.instance) == null ? void 0 : _f2.frame);
            if (curF === targetFrame) {
              lockOnActiveObjectAtFrame(targetId, targetFrame, attempt + 1);
            }
          }, delays[attempt]);
        }
      } catch (err) {
        console.warn("[CVAT 3D Suite] Lỗi lockOnActiveObjectAtFrame:", err);
      }
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
    function extractObjectDetails(clientId) {
      var _a, _b, _c, _d, _e;
      try {
        const store = getReduxStore();
        const anno = (_a = store == null ? void 0 : store.getState()) == null ? void 0 : _a.annotation;
        const canvas = (_b = anno == null ? void 0 : anno.canvas) == null ? void 0 : _b.instance;
        updateMainWorldLabels();
        const drawnItem = (_d = (_c = canvas == null ? void 0 : canvas.view) == null ? void 0 : _c.drawnObjects) == null ? void 0 : _d[String(clientId)];
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
            yawDeg: Math.round(p[5] * 180 / Math.PI),
            l: Number(p[6].toFixed(2)),
            w: Number(p[7].toFixed(2)),
            h: Number(p[8].toFixed(2)),
            points: [...p]
          };
        }
        const states = ((_e = anno == null ? void 0 : anno.annotations) == null ? void 0 : _e.states) || [];
        const matched = states.find((s) => s.clientID === clientId);
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
    function ensureCuboidPoints(newValues, existingPoints) {
      let result;
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
      if (!parentID && job.annotations) {
        try {
          const curFrame = typeof job.frame === "number" ? job.frame : 0;
          const curStates = await job.annotations.get(curFrame);
          if (Array.isArray(curStates)) {
            const curSt = curStates.find(
              (s) => Number(s.clientID) === Number(uiId) || serverId && Number(s.serverID) === Number(serverId)
            );
            if (curSt) {
              parentID = curSt.parentID || curSt.trackID || curSt.parent && curSt.parent.clientID;
            }
          }
        } catch (e) {
        }
      }
      const tracks = getJobTrackCollection(job);
      if (tracks && tracks.length > 0) {
        let found = tracks.find(
          (t) => Number(t.clientID) === Number(uiId) || Number(t.id) === Number(uiId) || String(t.clientID) === String(uiId)
        );
        if (found) return found;
        if (serverId) {
          found = tracks.find(
            (t) => Number(t.serverID) === Number(serverId) || String(t.serverID) === String(serverId)
          );
          if (found) return found;
        }
        if (parentID) {
          found = tracks.find(
            (t) => Number(t.clientID) === Number(parentID) || Number(t.id) === Number(parentID) || String(t.clientID) === String(parentID)
          );
          if (found) return found;
        }
        found = tracks.find((t) => {
          const shList = toArray(t.shapes || t.keyframes || t._shapes);
          return shList.some(
            (sh) => Number(sh.clientID) === Number(uiId) || serverId && Number(sh.serverID) === Number(serverId) || sh.parentID && Number(sh.parentID) === Number(uiId)
          );
        });
        if (found) return found;
      }
      if (job.annotations) {
        try {
          const allObjects = await job.annotations.get(null, true);
          if (Array.isArray(allObjects)) {
            let found = allObjects.find(
              (t) => Number(t.clientID) === Number(uiId) || Number(t.id) === Number(uiId) || serverId && Number(t.serverID) === Number(serverId) || parentID && (Number(t.clientID) === Number(parentID) || Number(t.id) === Number(parentID))
            );
            if (found) return found;
          }
        } catch (e) {
        }
        try {
          const defaultTracks = await job.annotations.get();
          if (Array.isArray(defaultTracks)) {
            let found = defaultTracks.find(
              (t) => Number(t.clientID) === Number(uiId) || Number(t.id) === Number(uiId) || serverId && Number(t.serverID) === Number(serverId) || parentID && (Number(t.clientID) === Number(parentID) || Number(t.id) === Number(parentID))
            );
            if (found) return found;
          }
        } catch (e) {
        }
      }
      return null;
    }
    function markCvatSaveButtonUnsaved() {
      try {
        window.__CVAT_HAS_UNSAVED_CHANGES__ = true;
        const cvatSaveBtn = document.querySelector(
          "button.cvat-annotation-header-save-button, .cvat-annotation-header-save-button, button[aria-label='Save annotations']"
        );
        if (cvatSaveBtn) {
          cvatSaveBtn.disabled = false;
          cvatSaveBtn.removeAttribute("disabled");
          cvatSaveBtn.classList.remove("cvat-disabled-button");
          cvatSaveBtn.style.opacity = "1";
          cvatSaveBtn.style.cursor = "pointer";
        }
      } catch (e) {
      }
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
    let isCanvasAutoSelectAttached = false;
    function setupCanvasAutoSelect(retryCount = 0) {
      if (isCanvasAutoSelectAttached) return;
      const store = getReduxStore();
      const canvasContainers = document.querySelectorAll(
        ".cvat-canvas-container, .cvat-canvas3d-orthographic-view"
      );
      if ((canvasContainers.length === 0 || !store) && retryCount < 15) {
        setTimeout(() => setupCanvasAutoSelect(retryCount + 1), 1e3);
        return;
      }
      isCanvasAutoSelectAttached = true;
      canvasContainers.forEach((container) => {
        container.addEventListener("pointerup", () => {
          setTimeout(() => {
            var _a, _b, _c, _d, _e, _f, _g;
            try {
              const currentStore = getReduxStore() || store;
              const canvas = (_c = (_b = (_a = currentStore == null ? void 0 : currentStore.getState()) == null ? void 0 : _a.annotation) == null ? void 0 : _b.canvas) == null ? void 0 : _c.instance;
              const activeId = ((_d = canvas == null ? void 0 : canvas.view) == null ? void 0 : _d.activatedElementID) || ((_g = (_f = (_e = currentStore == null ? void 0 : currentStore.getState()) == null ? void 0 : _e.annotation) == null ? void 0 : _f.annotations) == null ? void 0 : _g.activatedStateClientID);
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
        const store2 = getReduxStore();
        if (store2) {
          let prevActiveId = null;
          let prevStatesLen = 0;
          let prevFrame = null;
          let activeDebounceTimer = null;
          let dirtyDebounceTimer = null;
          store2.subscribe(() => {
            var _a, _b, _c, _d, _e, _f, _g, _h;
            try {
              const anno = (_a = store2.getState()) == null ? void 0 : _a.annotation;
              const curActiveId = (_b = anno == null ? void 0 : anno.annotations) == null ? void 0 : _b.activatedStateClientID;
              const curStatesLen = ((_d = (_c = anno == null ? void 0 : anno.annotations) == null ? void 0 : _c.states) == null ? void 0 : _d.length) || 0;
              const curFrame = ((_f = (_e = anno == null ? void 0 : anno.player) == null ? void 0 : _e.frame) == null ? void 0 : _f.number) ?? ((_h = (_g = anno == null ? void 0 : anno.job) == null ? void 0 : _g.instance) == null ? void 0 : _h.frame);
              if (curFrame !== void 0 && curFrame !== null && curFrame !== prevFrame) {
                const oldFrame = prevFrame;
                prevFrame = curFrame;
                if (oldFrame !== null) {
                  window.dispatchEvent(
                    new CustomEvent("CVAT_EXT_RES_FRAME_CHANGED", {
                      detail: { frame: curFrame, prevFrame: oldFrame }
                    })
                  );
                  const activeIdToLock = curActiveId !== null && curActiveId !== void 0 ? Number(curActiveId) : lastActiveTrackId;
                  if (activeIdToLock !== null && !isNaN(activeIdToLock)) {
                    lockOnActiveObjectAtFrame(activeIdToLock, curFrame);
                  }
                  setTimeout(() => {
                    applyPointCloudColorizationInMainWorld();
                  }, 150);
                }
              }
              if (curActiveId !== prevActiveId) {
                prevActiveId = curActiveId;
                if (curActiveId !== null && curActiveId !== void 0) {
                  lastActiveTrackId = Number(curActiveId);
                  if (activeDebounceTimer) clearTimeout(activeDebounceTimer);
                  activeDebounceTimer = setTimeout(() => {
                    activeDebounceTimer = null;
                    const details = extractObjectDetails(Number(curActiveId));
                    window.dispatchEvent(
                      new CustomEvent("CVAT_EXT_RES_OBJECT_ACTIVATED", {
                        detail: { clientId: Number(curActiveId), details }
                      })
                    );
                    applyPointCloudColorizationInMainWorld();
                  }, 80);
                }
              }
              if (curStatesLen !== prevStatesLen) {
                prevStatesLen = curStatesLen;
                if (dirtyDebounceTimer) clearTimeout(dirtyDebounceTimer);
                dirtyDebounceTimer = setTimeout(() => {
                  dirtyDebounceTimer = null;
                  window.dispatchEvent(new CustomEvent("CVAT_EXT_RES_FRAME_TRACKS_DIRTY"));
                  applyPointCloudColorizationInMainWorld();
                }, 400);
              }
            } catch (err) {
            }
          });
        }
      } catch (sErr) {
      }
      window.addEventListener("CVAT_EXT_REQ_ACTIVATE_OBJECT", (e) => {
        var _a, _b, _c, _d, _e, _f, _g;
        const { clientId, pos } = e.detail || {};
        if (clientId === void 0 || clientId === null) return;
        const numId = Number(clientId);
        lastActiveTrackId = numId;
        try {
          const store2 = getReduxStore();
          const canvas = (_c = (_b = (_a = store2 == null ? void 0 : store2.getState()) == null ? void 0 : _a.annotation) == null ? void 0 : _b.canvas) == null ? void 0 : _c.instance;
          if (canvas && typeof canvas.activate === "function") {
            const curActive = ((_d = canvas.view) == null ? void 0 : _d.activatedElementID) || ((_g = (_f = (_e = store2 == null ? void 0 : store2.getState()) == null ? void 0 : _e.annotation) == null ? void 0 : _f.annotations) == null ? void 0 : _g.activatedStateClientID);
            if (curActive !== numId) {
              canvas.activate(numId);
              if (typeof canvas.render === "function") {
                canvas.render();
              }
            }
          }
          if (store2 && typeof store2.dispatch === "function") {
            try {
              store2.dispatch({
                type: "ACTIVATE_OBJECT",
                payload: { activatedStateClientID: numId, activatedElementID: numId }
              });
            } catch (_) {
            }
          }
          try {
            const sidebarItem = document.querySelector(`#cvat-objects-sidebar-state-item-${numId}`) || document.querySelector(`[data-cvat-state-item-id="${numId}"]`) || document.querySelector(`[class*="cvat-objects-sidebar-state-item"][id*="${numId}"]`);
            if (sidebarItem) {
              sidebarItem.scrollIntoView({ block: "nearest", behavior: "smooth" });
              const allItems = document.querySelectorAll("[class*='cvat-objects-sidebar-state-item']");
              allItems.forEach((el) => el.classList.remove("cvat-objects-sidebar-state-item-active", "selected"));
              sidebarItem.classList.add("cvat-objects-sidebar-state-item-active", "selected");
            }
          } catch (_) {
          }
          center3DViewOnObject(numId, pos);
        } catch (err) {
        }
      });
      window.addEventListener("CVAT_EXT_REQ_SET_ACTIVE_TRACK", (e) => {
        const { trackId } = e.detail || {};
        if (trackId !== void 0 && trackId !== null && !isNaN(Number(trackId))) {
          lastActiveTrackId = Number(trackId);
        }
      });
      window.addEventListener("CVAT_EXT_REQ_SET_AUTO_CENTER_FRAME", (e) => {
        const { enabled } = e.detail || {};
        if (typeof enabled === "boolean") {
          autoCenterOnFrameChange = enabled;
          console.log(`[CVAT 3D Suite] Đã ${enabled ? "BẬT" : "TẮT"} tính năng Ghim Tâm khi tua frame.`);
        }
      });
      window.addEventListener("CVAT_EXT_REQ_CENTER_OBJECT", (e) => {
        const { clientId, pos } = e.detail || {};
        if (clientId !== void 0 && clientId !== null) {
          center3DViewOnObject(Number(clientId), pos);
        }
      });
    }
    setTimeout(() => setupCanvasAutoSelect(), 1500);
    window.addEventListener("CVAT_EXT_REQ_FRAME_TRACKS", async (e) => {
      var _a, _b, _c;
      const { jobId, frame } = e.detail || {};
      try {
        let job = await getActiveJobInstance(jobId);
        let annotations = [];
        if (job) {
          updateMainWorldLabels(job);
          try {
            annotations = await job.annotations.get(frame);
          } catch (fErr) {
            annotations = [];
          }
        } else {
          const store = getReduxStore();
          const reduxStates = (_c = (_b = (_a = store == null ? void 0 : store.getState()) == null ? void 0 : _a.annotation) == null ? void 0 : _b.annotations) == null ? void 0 : _c.states;
          if (Array.isArray(reduxStates) && reduxStates.length > 0) {
            annotations = reduxStates;
          } else {
            window.dispatchEvent(
              new CustomEvent("CVAT_EXT_RES_FRAME_TRACKS", {
                detail: { success: false, loading: true, frame, list: [] }
              })
            );
            return;
          }
        }
        const list = annotations.filter((s) => s && s.shapeType === "cuboid" && Array.isArray(s.points) && s.points.length >= 9 && typeof s.clientID === "number").map((s) => {
          const p = s.points;
          const resolved = resolveLabelName(s);
          return {
            uiId: s.clientID,
            // SỐ CLIENT_ID HIỂN THỊ CHUẨN XÁC 100% TRÊN GIAO DIỆN!
            serverId: s.serverID,
            // SỐ SERVER_ID LƯU DƯỚI CƠ SỞ DỮ LIỆU
            label: resolved.name,
            color: resolved.color,
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
      const { jobId, uiId, serverId } = e.detail || {};
      try {
        const job = await getActiveJobInstance(jobId);
        if (!job) throw new Error("Không tìm thấy Job Instance của CVAT");
        updateMainWorldLabels(job);
        const framesMap = /* @__PURE__ */ new Map();
        const parentTrack = await findTrackInJob(job, uiId, serverId);
        const trackLabel = resolveLabelName(parentTrack).name;
        if (parentTrack) {
          const shapes = toArray(parentTrack.shapes || parentTrack.keyframes);
          for (const sh of shapes) {
            if (sh.shapeType === "cuboid" && Array.isArray(sh.points) && sh.points.length >= 9) {
              framesMap.set(sh.frame, {
                frame: sh.frame,
                isKeyframe: true,
                outside: !!sh.outside,
                points: [...sh.points],
                label: resolveLabelName(sh).name || trackLabel
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
                  label: resolveLabelName(st).name || trackLabel
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
    window.addEventListener("CVAT_EXT_REQ_GET_ROI_LIDAR_POINTS", (e) => {
      try {
        const { center, radius = 4, maxPoints = 25e3 } = e.detail || {};
        const lidar = getSceneLidarPoints();
        if (!lidar || !lidar.array) {
          window.dispatchEvent(
            new CustomEvent("CVAT_EXT_RES_GET_ROI_LIDAR_POINTS", {
              detail: { success: false, error: "Không tìm thấy buffer điểm LiDAR trong Three.js scene" }
            })
          );
          return;
        }
        const arr = lidar.array;
        const count = lidar.count;
        const sampled = [];
        if (Array.isArray(center) && center.length >= 3) {
          const [cx, cy, cz] = center;
          const rSq = radius * radius;
          const maxDz = Math.max(3, radius * 0.85);
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
            detail: { success: true, points: sampled, totalCount: sampled.length / 3 }
          })
        );
      } catch (err) {
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_RES_GET_ROI_LIDAR_POINTS", {
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
    window.addEventListener("CVAT_EXT_REQ_SNAP_YAW_TO_LANE", async (e) => {
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
        const ptsWithIntensity = [];
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
          if (Math.abs(lx) <= 15 && Math.abs(ly) <= 6) {
            ptsWithIntensity.push({
              x,
              y,
              z,
              intensity: lidar.getIntensityAt(i)
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
                message: res.message || "Không tìm thấy vạch sơn làn đường rõ nét, giữ nguyên góc Yaw"
              }
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
              message: res.message
            }
          })
        );
      } catch (err) {
        console.error("[CVAT 3D Suite] Lỗi căn Yaw theo làn đường:", err);
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_RES_SNAP_YAW_TO_LANE", {
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
        markCvatSaveButtonUnsaved();
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
      const { jobId, frame, uiId, serverId, l, w, h: h2, applyToTrack } = e.detail || {};
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
        const offset = computeGroundLockOffset(newPoints, h2);
        newPoints[0] = Number((newPoints[0] + offset.dx).toFixed(3));
        newPoints[1] = Number((newPoints[1] + offset.dy).toFixed(3));
        newPoints[2] = Number((newPoints[2] + offset.dz).toFixed(3));
        newPoints[6] = l;
        newPoints[7] = w;
        newPoints[8] = h2;
        target.points = newPoints;
        if (!isDrawn && typeof target.save === "function") {
          await target.save();
        }
        updateThreeJsCuboid(
          uiId,
          void 0,
          { x: newPoints[0], y: newPoints[1], z: newPoints[2] },
          { l, w, h: h2 }
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
                  const shOffset = computeGroundLockOffset(shPoints, h2);
                  shPoints[0] = Number((shPoints[0] + shOffset.dx).toFixed(3));
                  shPoints[1] = Number((shPoints[1] + shOffset.dy).toFixed(3));
                  shPoints[2] = Number((shPoints[2] + shOffset.dz).toFixed(3));
                  shPoints[6] = l;
                  shPoints[7] = w;
                  shPoints[8] = h2;
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
                    const stOffset = computeGroundLockOffset(p, h2);
                    p[0] = Number((p[0] + stOffset.dx).toFixed(3));
                    p[1] = Number((p[1] + stOffset.dy).toFixed(3));
                    p[2] = Number((p[2] + stOffset.dz).toFixed(3));
                    p[6] = l;
                    p[7] = w;
                    p[8] = h2;
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
        markCvatSaveButtonUnsaved();
        const scopeText = applyToTrack ? `toàn bộ track (từ Frame #${startF} ➔ #${stopF}, ${trackCount} frames, Realtime)` : `chỉ frame #${frame}`;
        const msg = `Đã cập nhật xe #${uiId} kích thước ${l}x${w}x${h2}m cho ${scopeText}`;
        console.log(`[CVAT 3D Suite] ${msg} (Three.js Re-rendered Realtime)`);
        const newZ = newPoints[2];
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_RES_UPDATE_DIMENSIONS", {
            detail: { success: true, uiId, newZ, l, w, h: h2, applyToTrack, message: msg }
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
          const curL = newPoints[6] || 4.6;
          const curW2 = newPoints[7] || 1.85;
          const groundInfo = detectAccurateGroundZ(curX, curY, curZ, curRz, curL / 2, curW2 / 2, curH / 2, false, false);
          if (groundInfo.isFallbackZeroGround || groundInfo.groundPointsCount < 10) {
            const baseZ = groundInfo.groundZ !== null ? groundInfo.groundZ : curZ - curH / 2;
            newRotX = 0;
            newRotY = 0;
            newZ = Number((baseZ + curH / 2).toFixed(3));
            if (Math.abs(newZ - curZ) > 0.5) {
              newZ = curZ;
            }
            msg = `Point mặt đất ít (${groundInfo.groundPointsCount} điểm) ➔ Khóa chuẩn 0° phẳng (Tâm Z: ${newZ}m, Khóa Roll 0°, Pitch 0°)`;
          } else if (groundInfo.groundZ !== null) {
            const cosPitch = Math.cos(groundInfo.pitchRad);
            const cosRoll = Math.cos(groundInfo.rollRad);
            newRotY = groundInfo.pitchRad;
            if (groundInfo.isHalfCurb) {
              newRotX = groundInfo.rollRad;
              newZ = Number((groundInfo.groundZ + curH / 2 * cosPitch * cosRoll).toFixed(3));
              const sideText = groundInfo.halfCurbSide === "left" ? "bên TRÁI" : "bên PHẢI";
              msg = `Đã tự động nhận diện xe #${uiId} gác lề ${sideText} (Bậc vỉa hè: +${groundInfo.curbHeightCm}cm, Nghiêng Front Roll: ${groundInfo.rollDeg}°, Tâm Z: ${newZ}m)`;
            } else if (groundInfo.isCurbGround) {
              newRotX = 0;
              newZ = Number((groundInfo.groundZ + curH / 2 * cosPitch).toFixed(3));
              msg = `Đã tự động nhận diện xe #${uiId} đỗ trên nền vỉa hè (+${groundInfo.curbHeightCm || 15}cm so với Ego, Khóa Roll 0°, Tâm Z: ${newZ}m)`;
            } else {
              newRotX = groundInfo.rollRad;
              newZ = Number((groundInfo.groundZ + curH / 2 * cosPitch * cosRoll).toFixed(3));
              msg = `Đã ghim đáy xe #${uiId} bám sát mặt đường (Z: ${newZ}m, Roll: ${groundInfo.rollDeg}°, Pitch: ${groundInfo.pitchDeg}°)`;
            }
          } else {
            newRotX = 0;
            newRotY = 0;
            newZ = curZ;
            msg = `Không có điểm mặt đất ➔ Khóa chuẩn 0° phẳng (Tâm Z: ${newZ}m, Khóa Roll 0°, Pitch 0°)`;
          }
        } else if (mode === "curb") {
          const curL = newPoints[6] || 4.6;
          const autoCurb = detectCurbStepAndRollInMainWorld(curX, curY, curZ, curRz, curL / 2, curW / 2, curW);
          const offset = curbHeight !== void 0 ? curbHeight : autoCurb.hasCurb ? autoCurb.curbHeight : 0.15;
          newZ = Number((curZ + offset).toFixed(3));
          msg = autoCurb.hasCurb ? `Đã tự động nhận diện nền vỉa hè cao +${autoCurb.curbHeightCm}cm từ LiDAR ➔ Z: ${newZ}m` : `Đã nâng đáy xe #${uiId} lên nền vỉa hè (+${Math.round(offset * 100)}cm ➔ Z: ${newZ}m)`;
        } else if (mode === "half_curb") {
          const curL = newPoints[6] || 4.6;
          const autoCurb = detectCurbStepAndRollInMainWorld(curX, curY, curZ, curRz, curL / 2, curW / 2, curW);
          if (autoCurb.hasCurb && autoCurb.side !== "none") {
            newRotX = autoCurb.rollRad;
            const deltaZ = autoCurb.deltaCenterZ;
            newZ = Number((curZ + deltaZ).toFixed(3));
            const sideText = autoCurb.side === "left" ? "bên TRÁI" : "bên PHẢI";
            msg = `Đã tự động nhận diện gác lề ${sideText} (Bậc vỉa hè: +${autoCurb.curbHeightCm}cm, Nghiêng Front Roll: ${autoCurb.rollDeg}°, Nâng Z: +${Math.round(deltaZ * 100)}cm)`;
          } else {
            const cH = curbHeight !== void 0 ? curbHeight : 0.15;
            const ratio = Math.max(-1, Math.min(1, cH / curW));
            const rollRad = Math.asin(ratio);
            const deltaZ = cH / 2;
            newZ = Number((curZ + deltaZ).toFixed(3));
            newRotX = Number(rollRad.toFixed(5));
            const rollDeg = Math.round(rollRad * 180 / Math.PI);
            msg = `Đã gác lề xe #${uiId} (Nghiêng Roll: ${rollDeg}°, Nâng Z: +${Math.round(deltaZ * 100)}cm)`;
          }
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
        let framesSnapped = 1;
        if (applyToTrack) {
          try {
            const deltaZ = newZ - curZ;
            const parentTrack = await findTrackInJob(job, uiId, serverId, target.parentID);
            if (parentTrack) {
              const shapesList = toArray(parentTrack.shapes || parentTrack.keyframes || parentTrack._shapes);
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
          void 0,
          { x: curX, y: curY, z: newZ },
          void 0,
          { rx: newRotX, ry: newRotY, rz: curRz }
        );
        markCvatSaveButtonUnsaved();
        console.log(`[CVAT 3D Suite] ${msg} (Three.js Side/Front Re-rendered Realtime)`);
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_RES_SNAP_GROUND", {
            detail: { success: true, uiId, newZ, mode, applyToTrack, message: msg }
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
        newPoints[3] = 0;
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
        markCvatSaveButtonUnsaved();
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
        const groundInfo = detectAccurateGroundZ(curX, curY, curZ, curYaw, curL / 2, curW / 2, curH / 2, false, false);
        const effectiveGroundZ = groundInfo.groundZ !== null ? groundInfo.groundZ : 0;
        const { count, array } = lidar;
        const cosY = Math.cos(-curYaw);
        const sinY = Math.sin(-curYaw);
        const halfL = curL / 2 + 0.35;
        const halfW = curW / 2 + 0.3;
        const minBodyZ = effectiveGroundZ + 0.22;
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
        const filteredLy = filterDenseConnectedCluster1D2(bodyPts, "ly", 0.22, 0);
        const cleanBodyPts = filterDenseConnectedCluster1D2(filteredLy, "lx", 0.22, 0);
        if (cleanBodyPts.length < 4) {
          throw new Error(`Không đủ điểm LiDAR trên thân xe #${uiId} (tìm thấy ${cleanBodyPts.length} điểm)`);
        }
        const robustBounds = computeDensityRobustBounds2(cleanBodyPts);
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
        const newRotX = 0;
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
    window.addEventListener("CVAT_EXT_REQ_EGO_RAY_FIT", async (e) => {
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
        const newYaw = fit.newYawRad !== void 0 ? fit.newYawRad : target.points[5];
        const newPoints = [...target.points];
        newPoints[0] = fit.newX;
        newPoints[1] = fit.newY;
        newPoints[2] = fit.newZ;
        newPoints[3] = fit.rollRad;
        newPoints[4] = fit.pitchRad;
        newPoints[5] = newYaw;
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
              message: fit.message
            }
          })
        );
      } catch (err) {
        console.error("[CVAT 3D Suite] Lỗi Ego Ray Fit:", err);
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_RES_EGO_RAY_FIT", {
            detail: { success: false, error: err.message || String(err) }
          })
        );
      }
    });
    window.addEventListener("CVAT_EXT_REQ_FIT_PEDESTRIAN", async (e) => {
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
        newPoints[3] = 0;
        newPoints[4] = 0;
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
        let trackCount = 1;
        const startF = typeof (job == null ? void 0 : job.startFrame) === "number" ? job.startFrame : 0;
        const stopF = typeof (job == null ? void 0 : job.stopFrame) === "number" ? job.stopFrame : startF + 100;
        try {
          const parentTrack = await findTrackInJob(job, uiId, serverId, target.parentID);
          if (parentTrack) {
            const shapes = toArray(parentTrack.shapes || parentTrack.keyframes);
            for (const sh of shapes) {
              if (sh.shapeType === "cuboid" && Array.isArray(sh.points) && sh.points.length >= 9) {
                if (sh.frame === frame) {
                  sh.points = [...newPoints];
                } else if (applyToTrack === true) {
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
          if (applyToTrack === true && job) {
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
              } catch (e2) {
              }
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
              message: fit.message
            }
          })
        );
      } catch (err) {
        console.error("[CVAT 3D Suite] Lỗi Fit Pedestrian:", err);
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_RES_FIT_PEDESTRIAN", {
            detail: { success: false, error: err.message || String(err) }
          })
        );
      }
    });
    window.addEventListener("CVAT_EXT_REQ_FIT_CYCLIST", async (e) => {
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
        let trackCount = 1;
        const startF = typeof (job == null ? void 0 : job.startFrame) === "number" ? job.startFrame : 0;
        const stopF = typeof (job == null ? void 0 : job.stopFrame) === "number" ? job.stopFrame : startF + 100;
        try {
          const parentTrack = await findTrackInJob(job, uiId, serverId, target.parentID);
          if (parentTrack) {
            const shapes = toArray(parentTrack.shapes || parentTrack.keyframes);
            for (const sh of shapes) {
              if (sh.shapeType === "cuboid" && Array.isArray(sh.points) && sh.points.length >= 9) {
                if (sh.frame === frame) {
                  sh.points = [...newPoints];
                } else if (applyToTrack === true) {
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
          if (applyToTrack === true && job) {
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
              } catch (e2) {
              }
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
              message: fit.message
            }
          })
        );
      } catch (err) {
        console.error("[CVAT 3D Suite] Lỗi Fit Cyclist:", err);
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_RES_FIT_CYCLIST", {
            detail: { success: false, error: err.message || String(err) }
          })
        );
      }
    });
    function fitBoxWithPadding5cm(points) {
      const cx = points[0];
      const cy = points[1];
      const cz = points[2];
      const yaw = points[5];
      const l = points[6] || 4.65;
      const w = points[7] || 1.85;
      const h2 = points[8] || 1.45;
      const lidar = getSceneLidarPoints();
      if (!lidar || lidar.count === 0) {
        throw new Error("Không trích xuất được điểm LiDAR từ Three.js scene!");
      }
      const { count, array } = lidar;
      const groundInfo = detectAccurateGroundZ(cx, cy, cz, yaw, l / 2, w / 2, h2 / 2, false, false);
      const groundZ = groundInfo.groundZ !== null ? groundInfo.groundZ : cz - h2 / 2;
      const cosY = Math.cos(-yaw);
      const sinY = Math.sin(-yaw);
      const minBodyZ = groundZ + 0.22;
      const maxRoofZ = groundZ + 3.5;
      const searchHalfL = l / 2 + 0.55;
      const searchHalfW = w / 2 + 0.45;
      const rawBodyPts = [];
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
      const clLy = filterDenseConnectedCluster1D2(rawBodyPts, "ly", 0.2, 0);
      const bodyPts = filterDenseConnectedCluster1D2(clLy, "lx", 0.2, 0);
      const finalPts = bodyPts.length >= 5 ? bodyPts : rawBodyPts;
      const frontWall = detectDominantWallEdgeWithValleyCutoff2(finalPts, "lx", "positive", l / 2, { binSize: 0.04 });
      const rearWall = detectDominantWallEdgeWithValleyCutoff2(finalPts, "lx", "negative", l / 2, { binSize: 0.04 });
      const measuredL = Math.max(0.5, Math.min(15, Number((frontWall.edge - rearWall.edge).toFixed(3))));
      const leftWall = detectDominantWallEdgeWithValleyCutoff2(finalPts, "ly", "positive", w / 2, { binSize: 0.03 });
      const rightWall = detectDominantWallEdgeWithValleyCutoff2(finalPts, "ly", "negative", w / 2, { binSize: 0.03 });
      const measuredW = Math.max(0.4, Math.min(3.5, Number((leftWall.edge - rightWall.edge).toFixed(3))));
      const zList = finalPts.map((p) => p.z).sort((a, b) => a - b);
      const zRoof = zList[Math.floor(zList.length * 0.95)];
      const measuredH = Math.max(0.4, Math.min(4, Number((zRoof - groundZ).toFixed(3))));
      const newL = Number((measuredL + 0.1).toFixed(2));
      const newW = Number((measuredW + 0.1).toFixed(2));
      const newH = Number((measuredH + 0.05).toFixed(2));
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
        groundZ
      };
    }
    window.addEventListener("CVAT_EXT_REQ_FIT_CURRENT_BOX", async (e) => {
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
            const shapesList = toArray(parentTrack.shapes || parentTrack.keyframes || parentTrack._shapes);
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
              message: msg
            }
          })
        );
      } catch (err) {
        console.error("[CVAT 3D Suite] Lỗi Fit Box Hiện Tại:", err);
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_RES_FIT_CURRENT_BOX", {
            detail: { success: false, error: err.message || String(err) }
          })
        );
      }
    });
    window.addEventListener("CVAT_EXT_REQ_SET_TRACK_OUTSIDE", async (e) => {
      var _a, _b, _c, _d, _e, _f, _g;
      const { jobId, frame, uiId, serverId, outside = true } = e.detail || {};
      try {
        const job = await getActiveJobInstance(jobId);
        if (!job) throw new Error("Không tìm thấy Job Instance của CVAT");
        const currentFrame = typeof frame === "number" ? frame : typeof job.frame === "number" ? job.frame : 0;
        let currentTarget = null;
        try {
          const res = await findTargetSafely(job, currentFrame, uiId, serverId);
          currentTarget = res.target;
        } catch (e2) {
        }
        const parentID = (currentTarget == null ? void 0 : currentTarget.parentID) || (currentTarget == null ? void 0 : currentTarget.trackID) || (currentTarget == null ? void 0 : currentTarget.parent) && currentTarget.parent.clientID;
        let parentTrack = await findTrackInJob(job, uiId, serverId, parentID);
        const previousStates = [];
        let countModified = 0;
        if (parentTrack) {
          const shapesList = toArray(parentTrack.shapes || parentTrack.keyframes || parentTrack._shapes);
          if (shapesList.length > 0) {
            for (const sh of shapesList) {
              previousStates.push({
                frame: sh.frame,
                outside: !!sh.outside,
                points: Array.isArray(sh.points) ? [...sh.points] : []
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
        const startF = typeof job.startFrame === "number" ? job.startFrame : 0;
        const stopF = typeof job.stopFrame === "number" ? job.stopFrame : startF + 300;
        for (let f = startF; f <= stopF; f++) {
          try {
            const states = await job.annotations.get(f);
            if (Array.isArray(states)) {
              const st = states.find(
                (s) => Number(s.clientID) === Number(uiId) || serverId && Number(s.serverID) === Number(serverId) || parentID && (Number(s.clientID) === Number(parentID) || Number(s.parentID) === Number(parentID))
              );
              if (st) {
                if (!previousStates.some((ps) => ps.frame === f)) {
                  previousStates.push({
                    frame: f,
                    outside: !!st.outside,
                    points: Array.isArray(st.points) ? [...st.points] : []
                  });
                }
                st.outside = !!outside;
                if (typeof st.save === "function") {
                  try {
                    await st.save();
                  } catch (stErr) {
                  }
                }
                countModified++;
              }
            }
          } catch (e2) {
          }
        }
        if (currentTarget) {
          currentTarget.outside = !!outside;
          if (typeof currentTarget.save === "function") {
            try {
              await currentTarget.save();
            } catch (cErr) {
            }
          }
        }
        if (countModified === 0) {
          throw new Error(`Không tìm thấy Track hoặc Shape #${uiId} trong toàn bộ Job`);
        }
        const store = getReduxStore();
        const canvas = (_c = (_b = (_a = store == null ? void 0 : store.getState()) == null ? void 0 : _a.annotation) == null ? void 0 : _b.canvas) == null ? void 0 : _c.instance;
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
          const activeId = (_d = canvas.view) == null ? void 0 : _d.activatedElementID;
          if (outside && (Number(activeId) === Number(uiId) || String(activeId) === String(uiId))) {
            if (typeof canvas.activate === "function") {
              try {
                canvas.activate(null);
              } catch (aErr) {
              }
            }
          }
        }
        try {
          const reduxStates = (_g = (_f = (_e = store == null ? void 0 : store.getState()) == null ? void 0 : _e.annotation) == null ? void 0 : _f.annotations) == null ? void 0 : _g.states;
          if (Array.isArray(reduxStates)) {
            const matchedState = reduxStates.find((s) => Number(s.clientID) === Number(uiId));
            if (matchedState) {
              matchedState.outside = !!outside;
            }
          }
        } catch (rErr) {
        }
        markCvatSaveButtonUnsaved();
        if (canvas && typeof canvas.render === "function") {
          canvas.render();
        }
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
              message: msg
            }
          })
        );
      } catch (err) {
        console.error("[CVAT 3D Suite] Lỗi Set Track Outside:", err);
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_RES_SET_TRACK_OUTSIDE", {
            detail: { success: false, error: err.message || String(err) }
          })
        );
      }
    });
    window.addEventListener("CVAT_EXT_REQ_RESTORE_BOX", async (e) => {
      var _a, _b, _c, _d, _e, _f;
      const { jobId, frame, uiId, serverId, applyToTrack, boxPoints, trackShapesBackup } = e.detail || {};
      try {
        const job = await getActiveJobInstance(jobId);
        if (!job) throw new Error("Không tìm thấy Job Instance của CVAT");
        const currentFrame = typeof frame === "number" ? frame : typeof job.frame === "number" ? job.frame : 0;
        let currentTarget = null;
        try {
          const res = await findTargetSafely(job, currentFrame, uiId, serverId);
          currentTarget = res.target;
        } catch (e2) {
        }
        const parentID = (currentTarget == null ? void 0 : currentTarget.parentID) || (currentTarget == null ? void 0 : currentTarget.trackID) || (currentTarget == null ? void 0 : currentTarget.parent) && currentTarget.parent.clientID;
        const parentTrack = await findTrackInJob(job, uiId, serverId, parentID);
        if (applyToTrack && Array.isArray(trackShapesBackup) && trackShapesBackup.length > 0) {
          if (parentTrack) {
            const shapesList = toArray(parentTrack.shapes || parentTrack.keyframes || parentTrack._shapes);
            for (const bk of trackShapesBackup) {
              const sh = shapesList.find((s) => s.frame === bk.frame);
              if (sh) {
                if (bk.outside !== void 0) sh.outside = bk.outside;
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
          for (const bk of trackShapesBackup) {
            try {
              const states = await job.annotations.get(bk.frame);
              if (Array.isArray(states)) {
                const st = states.find(
                  (s) => Number(s.clientID) === Number(uiId) || serverId && Number(s.serverID) === Number(serverId) || parentID && (Number(s.clientID) === Number(parentID) || Number(s.parentID) === Number(parentID))
                );
                if (st) {
                  if (bk.outside !== void 0) st.outside = bk.outside;
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
            } catch (e2) {
            }
          }
        }
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
        const currentBackup = trackShapesBackup == null ? void 0 : trackShapesBackup.find((b) => b.frame === currentFrame);
        if (currentBackup && currentBackup.outside !== void 0) {
          const store2 = getReduxStore();
          const canvas2 = (_c = (_b = (_a = store2 == null ? void 0 : store2.getState()) == null ? void 0 : _a.annotation) == null ? void 0 : _b.canvas) == null ? void 0 : _c.instance;
          if (canvas2 && canvas2.view && canvas2.view.drawnObjects) {
            const drawnItem = canvas2.view.drawnObjects[String(uiId)];
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
        const canvas = (_f = (_e = (_d = store == null ? void 0 : store.getState()) == null ? void 0 : _d.annotation) == null ? void 0 : _e.canvas) == null ? void 0 : _f.instance;
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
              message: msg
            }
          })
        );
      } catch (err) {
        console.error("[CVAT 3D Suite] Lỗi Restore Box (Pre):", err);
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_RES_RESTORE_BOX", {
            detail: { success: false, error: err.message || String(err) }
          })
        );
      }
    });
    window.addEventListener("CVAT_EXT_REQ_SHIFT_CENTER", async (e) => {
      const { jobId, frame, uiId, serverId, deltaXLocal = 0, deltaYLocal = 0, deltaZ = 0, applyToTrack = false, isWorld = false } = e.detail || {};
      try {
        const job = await getActiveJobInstance(jobId);
        const { target, isDrawn } = await findTargetSafely(job, frame, uiId, serverId);
        const yaw = target.points[5] || 0;
        const cosYaw = Math.cos(yaw);
        const sinYaw = Math.sin(yaw);
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
        const msg = `Đã vi chỉnh Center (${isWorld ? "Screen Space" : "Local"} ΔX: ${deltaXWorld > 0 ? "+" : ""}${(deltaXWorld * 100).toFixed(1)}cm, ΔY: ${deltaYWorld > 0 ? "+" : ""}${(deltaYWorld * 100).toFixed(1)}cm, ΔZ: ${deltaZ > 0 ? "+" : ""}${(deltaZ * 100).toFixed(1)}cm) cho ${scopeText}`;
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
              message: msg
            }
          })
        );
      } catch (err) {
        console.error("[CVAT 3D Suite] Lỗi vi chỉnh Center:", err);
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_RES_SHIFT_CENTER", {
            detail: { success: false, error: err.message || String(err) }
          })
        );
      }
    });
    window.addEventListener("CVAT_EXT_REQ_FIT_DIMENSION", async (e) => {
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
        const minBodyZ = groundZ + 0.2;
        const maxRoofZ = groundZ + 4;
        const searchHalfL = curL / 2 + 0.55;
        const searchHalfW = curW / 2 + 0.45;
        const rawBodyPts = [];
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
        const clLy = filterDenseConnectedCluster1D2(rawBodyPts, "ly", 0.2, 0);
        const bodyPts = filterDenseConnectedCluster1D2(clLy, "lx", 0.2, 0);
        const finalPts = bodyPts.length >= 5 ? bodyPts : rawBodyPts;
        let newL = curL;
        let newW = curW;
        let newH = curH;
        let newX = cx;
        let newY = cy;
        let newZ = cz;
        let dimMessage = "";
        if (dimension === "w") {
          const leftWall = detectDominantWallEdgeWithValleyCutoff2(finalPts, "ly", "positive", curW / 2, { binSize: 0.03 });
          const rightWall = detectDominantWallEdgeWithValleyCutoff2(finalPts, "ly", "negative", curW / 2, { binSize: 0.03 });
          const measuredW = Math.max(0.4, Math.min(3.5, Number((leftWall.edge - rightWall.edge).toFixed(3))));
          newW = Number((measuredW + 0.08).toFixed(2));
          const shiftLy = Number(((leftWall.edge + rightWall.edge) / 2).toFixed(3));
          if (Math.abs(shiftLy) < 0.2) {
            newX = Number((cx - shiftLy * sinY).toFixed(3));
            newY = Number((cy + shiftLy * cosY).toFixed(3));
          }
          dimMessage = `Fit Rộng W=${newW}m (đo ${measuredW}m + 8cm đệm)`;
        } else {
          const zList = finalPts.map((p) => p.z).sort((a, b) => a - b);
          const zRoof = zList[Math.floor(zList.length * 0.95)];
          const measuredH = Math.max(0.4, Math.min(4.5, Number((zRoof - groundZ).toFixed(3))));
          newH = Number((measuredH + 0.05).toFixed(2));
          newZ = Number((groundZ + newH / 2).toFixed(3));
          dimMessage = `Fit Cao H=${newH}m [Ground-Lock nở nóc] (đo nóc ${zRoof.toFixed(2)}m, đáy ${groundZ.toFixed(2)}m)`;
        }
        let framesSynced = 1;
        if (applyToTrack) {
          const parentTrack = await findTrackInJob(job, uiId, serverId, target.parentID);
          if (parentTrack) {
            const shapesList = toArray(parentTrack.shapes || parentTrack.keyframes || parentTrack._shapes);
            for (const sh of shapesList) {
              if (sh.shapeType === "cuboid" && Array.isArray(sh.points) && sh.points.length >= 9) {
                const pts = [...sh.points];
                if (dimension === "w") {
                  pts[7] = newW;
                } else {
                  const sOldZ = pts[2];
                  const sOldH = pts[8];
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
              message: msg
            }
          })
        );
      } catch (err) {
        console.error("[CVAT 3D Suite] Lỗi Fit Dimension:", err);
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_RES_FIT_DIMENSION", {
            detail: { success: false, error: err.message || String(err) }
          })
        );
      }
    });
    window.addEventListener("CVAT_EXT_REQ_SET_POINT_COLOR_MODE", (e) => {
      const { mode, colorizeBoxed } = e.detail || {};
      if (mode === "intensity" || mode === "plain") {
        currentPointColorMode = mode;
      }
      if (colorizeBoxed !== void 0) {
        currentColorizeBoxed = !!colorizeBoxed;
      }
      applyPointCloudColorizationInMainWorld({
        mode: currentPointColorMode,
        colorizeBoxed: currentColorizeBoxed
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
            message: msg
          }
        })
      );
    });
    window.addEventListener("CVAT_EXT_REQ_GET_POINT_COLOR_MODE", () => {
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_GET_POINT_COLOR_MODE", {
          detail: {
            mode: currentPointColorMode,
            colorizeBoxed: currentColorizeBoxed
          }
        })
      );
    });
    setTimeout(() => {
      applyPointCloudColorizationInMainWorld();
    }, 1500);
  }
  class CVATBridge {
    /**
     * Lấy từ điển nhãn của Task để map ID -> Label Name & Color chuẩn xác 100%
     */
    static async fetchTaskLabels(taskId) {
      if (this.cachedLabelsTaskId === taskId && this.cachedTaskLabels.size > 0) {
        return this.cachedTaskLabels;
      }
      try {
        const response = await fetch(`/api/tasks/${taskId}`, {
          credentials: "include",
          headers: { "Content-Type": "application/json" }
        });
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data.labels)) {
            this.cachedTaskLabels.clear();
            this.cachedLabelsTaskId = taskId;
            for (const lbl of data.labels) {
              if (lbl && lbl.id !== void 0) {
                this.cachedTaskLabels.set(Number(lbl.id), {
                  name: lbl.name || "Object",
                  color: lbl.color || "#3b82f6"
                });
              }
            }
          }
        }
      } catch (_) {
      }
      return this.cachedTaskLabels;
    }
    /**
     * Khởi tạo cầu nối vào Main World của CVAT
     */
    static ensureMainWorldBridge() {
      if (this.isBridgeInjected || window.__CVAT_3D_SUITE_INJECTED__ || document.getElementById("cvat-3d-suite-main-bridge")) {
        this.isBridgeInjected = true;
        return;
      }
      try {
        if (typeof mainWorldScript === "function") {
          mainWorldScript();
          this.isBridgeInjected = true;
          return;
        }
      } catch (e) {
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
     * Ưu tiên 1: input chính xác cvat-player-frame-selector của Player CVAT
     * Ưu tiên 2: URL query string ?frame=...
     * Tuyệt đối không quét mù quáng các input số khác (như frame step = 5) làm nhảy frame!
     */
    static getCurrentFrame() {
      const frameInput = document.querySelector(
        ".cvat-player-frame-selector input, input.cvat-player-frame-selector, input[aria-label='Frame selector']"
      );
      if (frameInput && frameInput.value !== void 0 && frameInput.value !== "") {
        const val = parseInt(frameInput.value, 10);
        if (!isNaN(val) && val >= 0) return val;
      }
      const urlParams = new URLSearchParams(window.location.search);
      const frameParam = urlParams.get("frame");
      if (frameParam && !isNaN(parseInt(frameParam, 10))) {
        return parseInt(frameParam, 10);
      }
      return 0;
    }
    /**
     * Tải toàn bộ danh sách các Track trong Job từ API CVAT (với phòng vệ lỗi mạng).
     */
    static async fetchJobAnnotations(jobId, forceRefresh = false) {
      const now = Date.now();
      if (!forceRefresh && this.cachedAnnotations && this.cachedJobId === jobId && now - this.lastFetchTime < 3e3) {
        return this.cachedAnnotations;
      }
      try {
        const url = `${window.location.origin}/api/jobs/${jobId}/annotations`;
        let response = await fetch(url, {
          method: "GET",
          headers: this.getApiHeaders(false),
          credentials: "include"
        });
        if (!response.ok && (response.status === 404 || response.status === 301)) {
          response = await fetch(`${url}/`, {
            method: "GET",
            headers: this.getApiHeaders(false),
            credentials: "include"
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
      }
      return this.cachedAnnotations || { tracks: [] };
    }
    /**
     * Lấy danh sách TẤT CẢ các Track ID CÓ MẶT TẠI FRAME HIỆN TẠI.
     * Ưu tiên 1: Main World Bridge (được phản hồi là trả về ngay, dù rỗng [] hay có xe).
     * Ưu tiên 2: window.cvat SDK nội bộ của trang web.
     * Ưu tiên 3: REST API fallback an toàn với ID -> Label Name & Color mapping.
     */
    static async getTracksInCurrentFrame(jobId, frame) {
      this.ensureMainWorldBridge();
      const taskMatch = window.location.pathname.match(/\/tasks\/(\d+)/);
      const taskId = taskMatch ? parseInt(taskMatch[1], 10) : null;
      if (taskId) {
        await this.fetchTaskLabels(taskId);
      }
      const promise = new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 600);
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
      if (Array.isArray(mainWorldList)) {
        return mainWorldList;
      }
      return [];
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
     * Căn góc xoay Yaw theo vạch kẻ làn đường 3D (LiDAR Intensity Lane Snap)
     */
    static async snapYawToLane(jobId, uiId, serverId, currentFrameOnly = true) {
      this.ensureMainWorldBridge();
      const currentFrame = this.getCurrentFrame();
      const mainWorldPromise = new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 1200);
        const onResponse = (e) => {
          clearTimeout(timeout);
          window.removeEventListener("CVAT_EXT_RES_SNAP_YAW_TO_LANE", onResponse);
          if (e.detail) {
            resolve(e.detail);
          } else {
            resolve(null);
          }
        };
        window.addEventListener("CVAT_EXT_RES_SNAP_YAW_TO_LANE", onResponse);
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_REQ_SNAP_YAW_TO_LANE", {
            detail: { jobId, frame: currentFrame, uiId, serverId, currentFrameOnly }
          })
        );
      });
      const mwRes = await mainWorldPromise;
      if (mwRes && mwRes.success) {
        return {
          success: true,
          hasLane: mwRes.hasLane,
          newYawDeg: mwRes.newYawDeg,
          deltaYawDeg: mwRes.deltaYawDeg,
          confidence: mwRes.confidence,
          message: mwRes.message || `Đã căn Yaw theo làn cho xe #${uiId}`
        };
      }
      return {
        success: false,
        hasLane: false,
        message: (mwRes == null ? void 0 : mwRes.message) || "Không tìm thấy vạch sơn làn đường rõ nét quanh xe, giữ nguyên góc Yaw"
      };
    }
    /**
     * Cập nhật kích thước (L, W, H) linh hoạt cho xe:
     * Hỗ trợ áp dụng chỉ Frame hiện tại hoặc Đồng bộ cho Toàn bộ Track.
     * Dữ liệu được lưu trực tiếp vào cvat-core thông qua Main World Bridge (Realtime 100%).
     */
    static async updateTrackDimensions(jobId, uiId, serverId, l, w, h2, applyToTrack = false) {
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
            detail: { jobId, frame: currentFrame, uiId, serverId, l, w, h: h2, applyToTrack }
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
        h: h2,
        message: (mwRes == null ? void 0 : mwRes.message) || `Đã cập nhật xe #${uiId} (${l}x${w}x${h2}m cho ${scope})`
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
              targetGroundZ: params == null ? void 0 : params.targetGroundZ,
              applyToTrack: (params == null ? void 0 : params.applyToTrack) ?? false
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
     * FIT GÓC ĐÓN TIA EGO (RAY-CAST L-SHAPE FIT) & GHIM ĐẤT 3D (CẢ SIDE VIEW VÀ FRONT VIEW).
     * Tia laser từ Ego chiếu tới góc nào thì mép box đón tia (Side View & Front View) ép sát điểm ngoài cùng,
     * đồng thời đáy chạm khít mặt đất và góc trên của box ôm sát nóc xe!
     */
    static async fitBoxToEgoRayAndGround(jobId, uiId, serverId, applyToTrack = false, preserveDimensions = true, fitStep = "all", egoPos = { x: 0, y: 0, z: 0 }) {
      this.ensureMainWorldBridge();
      const currentFrame = this.getCurrentFrame();
      const mwPromise = new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 1500);
        const onResponse = (e) => {
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
              fitStep
            }
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
        message: mwRes.message || "Đã fit góc đón tia Ego và ghim đất thành công"
      };
    }
    /**
     * Căn Top độc lập: Căn thẳng góc Yaw theo viền xe, lọc nóc & Auto Ghim Đất
     */
    static async fitBoxTop(jobId, uiId, serverId, applyToTrack = false) {
      return this.fitBoxToEgoRayAndGround(jobId, uiId, serverId, applyToTrack, true, "top");
    }
    /**
     * Căn Side độc lập: Căn cản trước/sau theo trục dọc X & Auto Ghim Đất
     */
    static async fitBoxSide(jobId, uiId, serverId, applyToTrack = false) {
      return this.fitBoxToEgoRayAndGround(jobId, uiId, serverId, applyToTrack, true, "side");
    }
    /**
     * Căn Front độc lập: Căn bức tường thành xe theo trục ngang Y/W & Auto Ghim Đất
     */
    static async fitBoxFront(jobId, uiId, serverId, applyToTrack = false) {
      return this.fitBoxToEgoRayAndGround(jobId, uiId, serverId, applyToTrack, true, "front");
    }
    /**
     * FIT CHUYÊN BIỆT CHO NGƯỜI ĐI BỘ (PEDESTRIAN FIT).
     * Hỗ trợ 3 bước căn độc lập (TOP - SIDE - FRONT), 3 nút Fix Size (L, W, H) hoặc toàn chu trình (ALL).
     * Khóa đứng Roll = 0°, Pitch = 0° tuyệt đối.
     * Bù đỉnh đầu +12cm chống cắt ngang trán người.
     */
    static async fitPedestrian(jobId, uiId, serverId, headBuffer = 0.12, step = "all", applyToTrack = false) {
      this.ensureMainWorldBridge();
      const currentFrame = this.getCurrentFrame();
      const mwPromise = new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 2500);
        const onResponse = (e) => {
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
            detail: { jobId, frame: currentFrame, uiId, serverId, headBuffer, step, applyToTrack }
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
        message: mwRes.message || "Đã fit Người Đi Bộ thành công"
      };
    }
    /**
     * FIT CHUYÊN BIỆT CHO XE 2 BÁNH (CYCLIST / MOTORCYCLE).
     * Hỗ trợ 3 bước căn độc lập (TOP - SIDE - FRONT) hoặc toàn chu trình (ALL).
     * Chiều dài L luôn được bảo toàn 100% không bị co ngắn.
     */
    static async fitCyclist(jobId, uiId, serverId, headBuffer = 0.1, step = "all", applyToTrack = false) {
      this.ensureMainWorldBridge();
      const currentFrame = this.getCurrentFrame();
      const mwPromise = new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 2500);
        const onResponse = (e) => {
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
            detail: { jobId, frame: currentFrame, uiId, serverId, headBuffer, step, applyToTrack }
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
        message: mwRes.message || "Đã fit Xe 2 Bánh thành công"
      };
    }
    /**
     * Quét mốc chuẩn đẹp nhất và tự động fit đồng bộ toàn bộ track.
     */
    static async smartAnchorTrackFit(jobId, uiId, serverId) {
      this.ensureMainWorldBridge();
      const currentFrame = this.getCurrentFrame();
      const mwPromise = new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 4500);
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
            detail: { jobId, frame: currentFrame, uiId, serverId, scanOnly: false }
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
     * Fit Box trực tiếp tại Frame Hiện Tại với Padding 5cm mỗi bên:
     * +10cm cho L, +10cm cho W, +5cm cho H (nóc xe, đáy bám sàn cố định).
     * Hỗ trợ đồng bộ toàn bộ track nếu applyToTrack = true.
     */
    static async fitCurrentBox(jobId, uiId, serverId, applyToTrack = false) {
      this.ensureMainWorldBridge();
      const currentFrame = this.getCurrentFrame();
      const mwPromise = new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 6e3);
        const onResponse = (e) => {
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
            detail: { jobId, frame: currentFrame, uiId, serverId, applyToTrack }
          })
        );
      });
      const mwRes = await mwPromise;
      if (!mwRes || !mwRes.success) {
        return { success: false, message: (mwRes == null ? void 0 : mwRes.error) || "Không thể Fit Box với frame hiện tại!" };
      }
      return {
        success: true,
        newL: mwRes.newL,
        newW: mwRes.newW,
        newH: mwRes.newH,
        newZ: mwRes.newZ,
        pointsCount: mwRes.pointsCount,
        framesSynced: mwRes.framesSynced,
        message: mwRes.message
      };
    }
    /**
     * Vi chỉnh Center theo trục cục bộ của xe hoặc Screen Space / World (isWorld = true).
     * Hỗ trợ dịch chuyển dàn đều cho toàn bộ track (applyToTrack = true).
     */
    static async shiftTrackCenter(jobId, uiId, serverId, deltaXLocal, deltaYLocal, deltaZ = 0, applyToTrack = false, isWorld = false) {
      this.ensureMainWorldBridge();
      const currentFrame = this.getCurrentFrame();
      const mwPromise = new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 2500);
        const onResponse = (e) => {
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
              deltaZ,
              applyToTrack,
              isWorld
            }
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
        newZ: mwRes.newZ,
        framesShifted: mwRes.framesShifted,
        message: mwRes.message
      };
    }
    /**
     * Fit riêng Chiều Rộng (W) hoặc Chiều Cao (H) theo mây điểm LiDAR.
     * - W (Phím 4): Giữ nguyên L, H, Z, chỉ co giãn W bám khít mây điểm.
     * - H (Phím 5): Chuẩn Ground-Lock, đáy bám sàn cố định tại groundZ, chiều cao chỉ nở lên nóc.
     */
    static async fitDimension(jobId, uiId, serverId, dimension, applyToTrack = false) {
      this.ensureMainWorldBridge();
      const currentFrame = this.getCurrentFrame();
      const mwPromise = new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 3e3);
        const onResponse = (e) => {
          clearTimeout(timeout);
          window.removeEventListener("CVAT_EXT_RES_FIT_DIMENSION", onResponse);
          if (e.detail && e.detail.success) {
            resolve(e.detail);
          } else {
            resolve(null);
          }
        };
        window.addEventListener("CVAT_EXT_RES_FIT_DIMENSION", onResponse);
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_REQ_FIT_DIMENSION", {
            detail: {
              jobId,
              frame: currentFrame,
              uiId,
              serverId,
              dimension,
              applyToTrack
            }
          })
        );
      });
      const mwRes = await mwPromise;
      if (!mwRes) {
        return { success: false, message: `Không thể fit chiều ${dimension.toUpperCase()} của đối tượng!` };
      }
      return {
        success: true,
        newL: mwRes.newL,
        newW: mwRes.newW,
        newH: mwRes.newH,
        newX: mwRes.newX,
        newY: mwRes.newY,
        newZ: mwRes.newZ,
        pointsCount: mwRes.pointsCount,
        framesSynced: mwRes.framesSynced,
        message: mwRes.message
      };
    }
    /**
     * Kích hoạt highlight sáng viền đối tượng trên Three.js Canvas3D và đồng bộ 4 tầng
     */
    static activateCanvasTrack(uiId, pos) {
      this.ensureMainWorldBridge();
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_REQ_ACTIVATE_OBJECT", {
          detail: { clientId: uiId, pos }
        })
      );
    }
    /**
     * Căn giữa và tập trung View 3D Three.js vào Track ID chỉ định (0ms Realtime)
     */
    static centerCanvas3DOnTrack(uiId, pos) {
      this.ensureMainWorldBridge();
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_REQ_CENTER_OBJECT", {
          detail: { clientId: uiId, pos }
        })
      );
    }
    /**
     * Bật/Tắt tính năng Tự động Ghim Tâm (Lock-On Camera Tracking) khi tua frame
     */
    static setAutoCenterOnFrameChange(enabled) {
      this.ensureMainWorldBridge();
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_REQ_SET_AUTO_CENTER_FRAME", {
          detail: { enabled }
        })
      );
    }
    /**
     * Đồng bộ ID của Track đang chọn tới Main World
     */
    static setActiveTrackIdInMainWorld(trackId) {
      this.ensureMainWorldBridge();
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_REQ_SET_ACTIVE_TRACK", {
          detail: { trackId }
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
     * Lấy nhanh đám mây điểm LiDAR trong vùng quan tâm (ROI) quanh vật thể
     */
    static async getRoiLidarPoints(center, radius = 4, maxPoints = 25e3) {
      this.ensureMainWorldBridge();
      const promise = new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 1200);
        const onResponse = (e) => {
          clearTimeout(timeout);
          window.removeEventListener("CVAT_EXT_RES_GET_ROI_LIDAR_POINTS", onResponse);
          if (e.detail && e.detail.success && Array.isArray(e.detail.points)) {
            resolve(e.detail.points);
          } else {
            resolve(null);
          }
        };
        window.addEventListener("CVAT_EXT_RES_GET_ROI_LIDAR_POINTS", onResponse);
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_REQ_GET_ROI_LIDAR_POINTS", {
            detail: { center, radius, maxPoints }
          })
        );
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
    /**
     * Đánh dấu Outside (ẩn) hoặc Inside cho toàn bộ các frame của một Track.
     */
    static async setTrackOutside(jobId, uiId, serverId, outside = true, frame) {
      this.ensureMainWorldBridge();
      const currentFrame = typeof frame === "number" ? frame : this.getCurrentFrame();
      const mwPromise = new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 12e3);
        const onResponse = (e) => {
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
            detail: { jobId, frame: currentFrame, uiId, serverId, outside }
          })
        );
      });
      const mwRes = await mwPromise;
      if (!mwRes || !mwRes.success) {
        return { success: false, message: (mwRes == null ? void 0 : mwRes.error) || `Không thể đánh dấu Outside cho track #${uiId}!` };
      }
      return {
        success: true,
        count: mwRes.count,
        previousStates: mwRes.previousStates,
        message: mwRes.message
      };
    }
    /**
     * Khôi phục (Undo / Pre) trạng thái trước đó của một Track hoặc Box ở frame hiện tại.
     */
    static async restoreTrackSnapshot(jobId, uiId, serverId, snapshot) {
      this.ensureMainWorldBridge();
      const mwPromise = new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 8e3);
        const onResponse = (e) => {
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
              trackShapesBackup: snapshot.trackShapesBackup
            }
          })
        );
      });
      const mwRes = await mwPromise;
      if (!mwRes) {
        return { success: false, message: `Không thể hoàn tác (Pre) cho xe #${uiId}!` };
      }
      return {
        success: true,
        message: mwRes.message
      };
    }
    /**
     * Tự động fetch calibration VinFast từ endpoint Day14 overlay plugin
     * hoặc từ file calib_diagnostic.json hardcoded.
     */
    static async fetchVinCalibration() {
      if (this.vinCalibCache) return this.vinCalibCache.data;
      try {
        const res = await fetch(`${window.location.origin}/d14-overlay/private/config.json`, {
          credentials: "same-origin",
          cache: "no-store"
        });
        if (res.ok) {
          const cfg = await res.json();
          if (cfg.calibration) {
            console.log("[VinCalib] Đã tải calibration từ Day14 overlay plugin");
            this.vinCalibCache = { data: cfg.calibration };
            return cfg.calibration;
          }
        }
      } catch (_) {
      }
      const fallbackCalib = {
        pcd_frame: "lidar",
        lidar: {
          sensor2ego: [
            [0.999848, -0.017452, 0, 0],
            [0.017452, 0.999848, 0, 0],
            [0, 0, 1, 0],
            [0, 0, 0, 1]
          ]
        },
        cameras: {
          CAM_P_F: {
            K: [
              [1842.5042844353281, 0, 953.8468015854089],
              [0, 1842.3052782411678, 780.7314324894343],
              [0, 0, 1]
            ],
            dist: [-0.494617, 0.254457, -2633e-6, -1096e-6, -0.078763],
            ego2cam: [
              [-1396e-6, -0.999929, 0.011868, -0.019678],
              [0.020751, -0.011894, -0.999714, 1.755513],
              [0.999784, -1149e-6, 0.020766, -1.047623],
              [0, 0, 0, 1]
            ],
            image_size: [1920, 1536]
          }
        }
      };
      console.log("[VinCalib] Dùng calibration diagnostic hardcoded (CAM_P_F)");
      this.vinCalibCache = { data: fallbackCalib };
      return fallbackCalib;
    }
    /**
     * Tải ảnh Context Images (8 camera) từ CVAT REST API cho frame hiện tại.
     */
    static async fetchContextImages(jobId, frame) {
      const cacheKey = `${jobId}:${frame}`;
      if (this.contextImageCache && this.contextImageCache.key === cacheKey) {
        return this.contextImageCache.images;
      }
      if (this.contextImageCache) {
        for (const url of this.contextImageCache.images.values()) {
          try {
            URL.revokeObjectURL(url);
          } catch (_) {
          }
        }
        this.contextImageCache = null;
      }
      const result = /* @__PURE__ */ new Map();
      try {
        const baseUrl = `${window.location.origin}/api/jobs/${jobId}/data`;
        const urls = [
          `${baseUrl}?type=context_image&quality=original&number=${frame}`,
          `${baseUrl}?type=context_image&frame=${frame}&number=0`
        ];
        console.log(`[Camera HUD] Fetch context images: jobId=${jobId}, frame=${frame}`);
        let response = null;
        for (const url of urls) {
          try {
            const res = await fetch(url, {
              method: "GET",
              headers: { Accept: "*/*" },
              credentials: "include"
            });
            if (res.ok) {
              response = res;
              break;
            }
          } catch (_) {
          }
        }
        if (!response) return result;
        const blob = await response.blob();
        console.log(`[Camera HUD] Response: ${blob.size} bytes, type="${blob.type}"`);
        const headerBytes = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
        const isZip = headerBytes[0] === 80 && headerBytes[1] === 75 && headerBytes[2] === 3 && headerBytes[3] === 4;
        if (isZip) {
          const zipBuffer = await blob.arrayBuffer();
          const extractedFiles = await this.parseZipArchive(new Uint8Array(zipBuffer));
          console.log(`[Camera HUD] ZIP: ${extractedFiles.length} files`);
          extractedFiles.sort((a, b) => a.filename.localeCompare(b.filename));
          for (const file of extractedFiles) {
            const camIdx = this.mapFilenameToCameraIndex(file.filename);
            if (camIdx >= 0 && camIdx < 8) {
              const buf = file.data.buffer.slice(file.data.byteOffset, file.data.byteOffset + file.data.byteLength);
              const imgBlob = new Blob([buf], { type: this.guessMimeType(file.filename) });
              result.set(camIdx, URL.createObjectURL(imgBlob));
            }
          }
        } else if (blob.type.startsWith("image/")) {
          result.set(0, URL.createObjectURL(blob));
        } else if (blob.size > 1e3) {
          try {
            const zipBuffer = await blob.arrayBuffer();
            const extractedFiles = await this.parseZipArchive(new Uint8Array(zipBuffer));
            if (extractedFiles.length > 0) {
              extractedFiles.sort((a, b) => a.filename.localeCompare(b.filename));
              for (const file of extractedFiles) {
                const camIdx = this.mapFilenameToCameraIndex(file.filename);
                if (camIdx >= 0 && camIdx < 8) {
                  const buf = file.data.buffer.slice(file.data.byteOffset, file.data.byteOffset + file.data.byteLength);
                  result.set(camIdx, URL.createObjectURL(new Blob([buf], { type: this.guessMimeType(file.filename) })));
                }
              }
            }
          } catch (_) {
          }
        }
        console.log(`[Camera HUD] Loaded ${result.size} camera images for frame ${frame}`);
      } catch (err) {
        console.error("[Camera HUD] Fetch error:", err);
      }
      this.contextImageCache = { key: cacheKey, images: result };
      return result;
    }
    static mapFilenameToCameraIndex(filename) {
      var _a;
      const basename = ((_a = filename.split("/").pop()) == null ? void 0 : _a.toLowerCase()) || "";
      const numMatch = basename.match(/image[_-]?(\d+)\.\w+$/);
      if (numMatch) return parseInt(numMatch[1], 10);
      const nameMap = {
        "cam_front": 0,
        "front": 0,
        "cam_p_f": 1,
        "cam_front_left": 1,
        "front_left": 1,
        "cam_front_right": 2,
        "front_right": 2,
        "cam_side_left": 3,
        "side_left": 3,
        "cam_side_right": 4,
        "side_right": 4,
        "cam_back_left": 5,
        "back_left": 5,
        "cam_back_right": 6,
        "back_right": 6,
        "cam_back": 7,
        "back": 7,
        "cam_rear": 7
      };
      const nameOnly = basename.replace(/\.\w+$/, "");
      if (nameMap[nameOnly] !== void 0) return nameMap[nameOnly];
      const fallbackMatch = basename.match(/(\d+)\.\w+$/);
      if (fallbackMatch) return parseInt(fallbackMatch[1], 10) % 8;
      return -1;
    }
    static guessMimeType(filename) {
      var _a;
      const ext = ((_a = filename.split(".").pop()) == null ? void 0 : _a.toLowerCase()) || "";
      if (ext === "png") return "image/png";
      if (ext === "webp") return "image/webp";
      return "image/jpeg";
    }
    // INLINE ZIP PARSER
    static async parseZipArchive(zipData) {
      const results = [];
      const view = new DataView(zipData.buffer, zipData.byteOffset, zipData.byteLength);
      let offset = 0;
      while (offset + 30 <= zipData.length) {
        const sig = view.getUint32(offset, true);
        if (sig !== 67324752) break;
        const gpFlag = view.getUint16(offset + 6, true);
        const compressionMethod = view.getUint16(offset + 8, true);
        const compressedSize = view.getUint32(offset + 18, true);
        const filenameLen = view.getUint16(offset + 26, true);
        const extraLen = view.getUint16(offset + 28, true);
        const filenameBytes = zipData.subarray(offset + 30, offset + 30 + filenameLen);
        const filename = new TextDecoder("utf-8").decode(filenameBytes);
        const dataStart = offset + 30 + filenameLen + extraLen;
        const dataEnd = dataStart + compressedSize;
        const isDir = filename.endsWith("/") || compressedSize === 0;
        const isImage = /\.(jpe?g|png|bmp|webp)$/i.test(filename);
        if (!isDir && isImage && dataEnd <= zipData.length) {
          const compressedData = zipData.subarray(dataStart, dataEnd);
          if (compressionMethod === 0) {
            results.push({ filename, data: new Uint8Array(compressedData) });
          } else if (compressionMethod === 8) {
            try {
              const decompressed = await this.inflateDeflateRaw(compressedData);
              results.push({ filename, data: decompressed });
            } catch (_) {
            }
          }
        }
        offset = dataEnd;
        if ((gpFlag & 8) !== 0 && offset + 16 <= zipData.length) {
          const descSig = view.getUint32(offset, true);
          offset += descSig === 134695760 ? 16 : 12;
        }
      }
      return results;
    }
    static async inflateDeflateRaw(compressedData) {
      if (typeof DecompressionStream !== "undefined") {
        const ds = new DecompressionStream("deflate-raw");
        const writer = ds.writable.getWriter();
        const reader = ds.readable.getReader();
        const buf = compressedData.buffer.slice(compressedData.byteOffset, compressedData.byteOffset + compressedData.byteLength);
        writer.write(new Uint8Array(buf));
        writer.close();
        const chunks = [];
        let totalLen = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          totalLen += value.byteLength;
        }
        const result = new Uint8Array(totalLen);
        let pos = 0;
        for (const chunk of chunks) {
          result.set(chunk, pos);
          pos += chunk.byteLength;
        }
        return result;
      }
      throw new Error("DecompressionStream not available");
    }
    /**
     * Cấu hình chế độ màu mây điểm LiDAR (Intensity vs Plain & Nhuộm màu điểm trong xe bọc).
     */
    static async setPointCloudColorMode(mode, colorizeBoxed) {
      this.ensureMainWorldBridge();
      return new Promise((resolve) => {
        const timeout = setTimeout(
          () => resolve({ success: false, mode, colorizeBoxed: colorizeBoxed ?? true, message: "Hết thời gian chờ" }),
          800
        );
        const onRes = (e) => {
          clearTimeout(timeout);
          window.removeEventListener("CVAT_EXT_RES_SET_POINT_COLOR_MODE", onRes);
          resolve(e.detail || { success: true, mode, colorizeBoxed: colorizeBoxed ?? true, message: "OK" });
        };
        window.addEventListener("CVAT_EXT_RES_SET_POINT_COLOR_MODE", onRes);
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_REQ_SET_POINT_COLOR_MODE", {
            detail: { mode, colorizeBoxed }
          })
        );
      });
    }
  }
  __publicField(CVATBridge, "cachedAnnotations", null);
  __publicField(CVATBridge, "cachedJobId", null);
  __publicField(CVATBridge, "lastFetchTime", 0);
  __publicField(CVATBridge, "isBridgeInjected", false);
  __publicField(CVATBridge, "cachedTaskLabels", /* @__PURE__ */ new Map());
  __publicField(CVATBridge, "cachedLabelsTaskId", null);
  // ===========================================================================
  // VINFAST CALIBRATION AUTO-FETCH
  // ===========================================================================
  __publicField(CVATBridge, "vinCalibCache", null);
  // ===========================================================================
  // CONTEXT IMAGES FETCHER + INLINE ZIP PARSER
  // ===========================================================================
  __publicField(CVATBridge, "contextImageCache", null);
  const CAR_PRESETS = [
    {
      id: "compact_car",
      name: "Compact Car",
      category: "car",
      l: 4.4,
      w: 1.78,
      h: 1.43,
      description: "Xe cỡ nhỏ (Civic, Mazda 3, Vios, i10)"
    },
    {
      id: "mid_sedan",
      name: "Sedan",
      category: "car",
      l: 4.7,
      w: 1.82,
      h: 1.45,
      description: "Sedan thông dụng (Camry, Accord, C-Class)"
    },
    {
      id: "mid_suv",
      name: "SUV 5 Chỗ",
      category: "suv",
      l: 4.65,
      w: 1.85,
      h: 1.68,
      description: "Crossover/SUV 5 chỗ (CR-V, CX-5, Tucson)"
    },
    {
      id: "full_suv",
      name: "SUV 7 Chỗ",
      category: "suv",
      l: 5,
      w: 1.95,
      h: 1.8,
      description: "SUV 7 chỗ cỡ lớn (Land Cruiser, Everest, Fortuner)"
    },
    {
      id: "pickup",
      name: "Bán Tải",
      category: "truck",
      l: 5.35,
      w: 1.9,
      h: 1.82,
      description: "Xe bán tải (Ford Ranger, Hilux, Triton)"
    },
    {
      id: "van",
      name: "Van / MPV",
      category: "van",
      l: 5.15,
      w: 1.95,
      h: 1.85,
      description: "Xe 7 chỗ / Van (Carnival, Transit, Innova)"
    },
    {
      id: "small_truck",
      name: "Tải Nhỏ",
      category: "truck",
      l: 4.8,
      w: 1.85,
      h: 2.1,
      description: "Xe tải nhỏ 1-2.5 tấn (Kia K200, Porter)"
    },
    {
      id: "box_truck",
      name: "Tải Thùng",
      category: "truck",
      l: 6.5,
      w: 2.25,
      h: 2.8,
      description: "Xe tải thùng trung bình (Hino, Isuzu 5 tấn)"
    },
    {
      id: "bus",
      name: "City Bus",
      category: "bus",
      l: 10.5,
      w: 2.5,
      h: 3.2,
      description: "Xe buýt đô thị"
    }
  ];
  const CYCLIST_PRESETS = [
    {
      id: "motorcycle_only",
      name: "Xe Máy",
      category: "cycle",
      l: 1.9,
      w: 0.7,
      h: 1.15,
      description: "Xe máy dựng chân chống (Vision, Wave, Lead)"
    },
    {
      id: "motorcycle_rider",
      name: "Xe Máy + Người",
      category: "cycle",
      l: 1.95,
      w: 0.75,
      h: 1.55,
      description: "Người ngồi lái xe máy (Đội nón bảo hiểm)"
    },
    {
      id: "bicycle_only",
      name: "Xe Đạp",
      category: "cycle",
      l: 1.75,
      w: 0.5,
      h: 1.05,
      description: "Xe đạp khung tiêu chuẩn"
    },
    {
      id: "bicycle_rider",
      name: "Xe Đạp + Người",
      category: "cycle",
      l: 1.75,
      w: 0.6,
      h: 1.65,
      description: "Người đang đạp xe đạp"
    },
    {
      id: "big_moto",
      name: "Mô Tô Lớn",
      category: "cycle",
      l: 2.15,
      w: 0.85,
      h: 1.25,
      description: "Xe phân khối lớn / Cruiser / Touring"
    },
    {
      id: "delivery_moto",
      name: "Xe Chở Hàng",
      category: "cycle",
      l: 2.05,
      w: 0.8,
      h: 1.6,
      description: "Shipper xe máy có thùng hàng phía sau"
    }
  ];
  const PEDESTRIAN_PRESETS = [
    {
      id: "ped_standing",
      name: "Người Đứng",
      category: "pedestrian",
      l: 0.55,
      w: 0.5,
      h: 1.7,
      description: "Người lớn đứng yên"
    },
    {
      id: "ped_walking",
      name: "Người Đi Bộ",
      category: "pedestrian",
      l: 0.8,
      w: 0.6,
      h: 1.7,
      description: "Người lớn sải chân bước đi"
    },
    {
      id: "ped_child",
      name: "Trẻ Em",
      category: "pedestrian",
      l: 0.45,
      w: 0.4,
      h: 1.2,
      description: "Trẻ em chiều cao thấp"
    },
    {
      id: "ped_backpack",
      name: "Mang Balo / Vali",
      category: "pedestrian",
      l: 0.75,
      w: 0.65,
      h: 1.72,
      description: "Người mang balo to hoặc kéo vali"
    },
    {
      id: "ped_sitting",
      name: "Khom / Ngồi",
      category: "pedestrian",
      l: 0.7,
      w: 0.6,
      h: 1.25,
      description: "Người ngồi ghế hoặc khom cúi người"
    }
  ];
  const STANDARD_VEHICLE_CATALOG = [
    ...CAR_PRESETS,
    ...CYCLIST_PRESETS,
    ...PEDESTRIAN_PRESETS
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
        const points = interpolatePoints$1(left.points, right.points, offset);
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
  const VIEWS_DEF = {
    top: { u: "ex", v: "ey", d: "ez", ui: 0, vi: 1, di: 2 },
    side: { u: "ex", v: "ez", d: "ey", ui: 0, vi: 2, di: 1 },
    front: { u: "ey", v: "ez", d: "ex", ui: 1, vi: 2, di: 0 }
  };
  const HANDLE_RADIUS = 7;
  class OrthoInteractionEngine {
    /**
     * Tính tỷ lệ điểm ảnh trên mét (Pixels Per Meter - PPM).
     */
    static calculatePpm(cell, w, h2, refSize, globalViewZoom, isContextMode = true) {
      const V = VIEWS_DEF[cell.view];
      const fitFactor = isContextMode ? 2.6 : 1.7;
      const k = Math.min(
        w / (Math.max(0.3, refSize[V.ui]) * fitFactor),
        h2 / (Math.max(0.3, refSize[V.vi]) * fitFactor)
      );
      return k * (globalViewZoom[cell.view] || 1) * (cell.zoom || 1);
    }
    /**
     * Trích xuất camera state cố định trong phiên kéo để tránh giật hình.
     */
    static getCamera(cell, box) {
      const ax = axes(box.r);
      return {
        c: [box.c[0], box.c[1], box.c[2]],
        ax,
        half: [box.s[0] / 2, box.s[1] / 2, box.s[2] / 2],
        pan: [cell.pan[0], cell.pan[1]]
      };
    }
    /**
     * Chuyển tọa độ thế giới (world x, y, z) sang tọa độ pixel trong Canvas.
     */
    static project(p, cam, view, rect, ppm) {
      const V = VIEWS_DEF[view];
      const w = subVec$1(p, cam.c);
      return [
        rect.w / 2 + cam.pan[0] + dotVec$1(w, cam.ax[V.u]) * ppm,
        rect.h / 2 + cam.pan[1] - dotVec$1(w, cam.ax[V.v]) * ppm
      ];
    }
    /**
     * Chuyển tọa độ pixel trong Canvas về tọa độ thế giới (world) trên mặt phẳng cắt đi qua tâm.
     */
    static unproject(px, py, cam, view, rect, ppm) {
      const V = VIEWS_DEF[view];
      const u = (px - rect.w / 2 - cam.pan[0]) / ppm;
      const v = -(py - rect.h / 2 - cam.pan[1]) / ppm;
      return addVec$1(
        cam.c,
        addVec$1(scaleVec$1(cam.ax[V.u], u), scaleVec$1(cam.ax[V.v], v))
      );
    }
    /**
     * Tính toán vị trí các tay cầm (Handles): 4 góc đỏ, 4 cạnh giữa trắng, chấm vàng xoay.
     */
    static calculateHandles(box, cam, view, rect, ppm) {
      const V = VIEWS_DEF[view];
      const ax = axes(box.r);
      const h2 = [box.s[0] / 2, box.s[1] / 2, box.s[2] / 2];
      const P = (a, b) => {
        const q = [0, 0, 0];
        q[V.ui] = a * h2[V.ui];
        q[V.vi] = b * h2[V.vi];
        const worldP = localToWorld(q, box.c, ax);
        return this.project(worldP, cam, view, rect, ppm);
      };
      const list = [];
      for (const a of [-1, 0, 1]) {
        for (const b of [-1, 0, 1]) {
          if (a === 0 && b === 0) continue;
          list.push({ kind: "resize", a, b, p: P(a, b) });
        }
      }
      const center = P(0, 0);
      const top = P(0, 1);
      const dx = top[0] - center[0];
      const dy = top[1] - center[1];
      const len = Math.hypot(dx, dy) || 1;
      const rot = [
        top[0] + dx / len * 22,
        top[1] + dy / len * 22
      ];
      return { list, center, top, rot, P };
    }
    /**
     * Nhận diện phần tử mà chuột click trúng (Hit-Test).
     */
    static hitTest(mx, my, cell, box, rect, ppm, allowTilt = false) {
      const cam = this.getCamera(cell, box);
      const hs = this.calculateHandles(box, cam, cell.view, rect, ppm);
      const canRotate = cell.view === "top" || allowTilt;
      if (canRotate && Math.hypot(mx - hs.rot[0], my - hs.rot[1]) <= HANDLE_RADIUS + 2) {
        return { kind: "rotate", box, cam, rect, ppm, hs };
      }
      let bestHd = null;
      for (const hd of hs.list) {
        const d = Math.hypot(mx - hd.p[0], my - hd.p[1]);
        if (d <= HANDLE_RADIUS && (!bestHd || d < bestHd.d)) {
          bestHd = { ...hd, d };
        }
      }
      if (bestHd) {
        return {
          kind: "resize",
          a: bestHd.a,
          b: bestHd.b,
          box,
          cam,
          rect,
          ppm,
          hs
        };
      }
      const V = VIEWS_DEF[cell.view];
      const ax = axes(box.r);
      const p = this.unproject(mx, my, cam, cell.view, rect, ppm);
      const q = worldToLocal(p, box.c, ax);
      const hu = box.s[V.ui] / 2;
      const hv = box.s[V.vi] / 2;
      const tol = 5 / ppm;
      const inU = Math.abs(q[V.ui]) <= hu + tol;
      const inV = Math.abs(q[V.vi]) <= hv + tol;
      if (inV && Math.abs(Math.abs(q[V.ui]) - hu) <= tol) {
        return {
          kind: "resize",
          a: Math.sign(q[V.ui]) || 1,
          b: 0,
          box,
          cam,
          rect,
          ppm,
          hs
        };
      }
      if (inU && Math.abs(Math.abs(q[V.vi]) - hv) <= tol) {
        return {
          kind: "resize",
          a: 0,
          b: Math.sign(q[V.vi]) || 1,
          box,
          cam,
          rect,
          ppm,
          hs
        };
      }
      if (Math.abs(q[V.ui]) < hu && Math.abs(q[V.vi]) < hv) {
        return { kind: "move", box, cam, rect, ppm, hs };
      }
      return null;
    }
    /**
     * Tính toán box mới khi người dùng đang kéo chuột (PointerMove).
     */
    static computeDragUpdate(session, mx, my, isShiftPressed = false) {
      const { cell, kind, a, b, startBox, cam, rect, ppm, p0, ang0 } = session;
      const V = VIEWS_DEF[cell.view];
      const box = cloneBox(startBox);
      const p = this.unproject(mx, my, cam, cell.view, rect, ppm);
      if (kind === "move") {
        const deltaWorld = subVec$1(p, p0);
        box.c = addVec$1(startBox.c, deltaWorld);
      } else if (kind === "resize") {
        const ax = axes(startBox.r);
        const q = worldToLocal(p, startBox.c, ax);
        const shift = [0, 0, 0];
        const axesToAdjust = [
          [V.ui, a],
          [V.vi, b]
        ];
        for (const [axis, sign] of axesToAdjust) {
          if (!sign) continue;
          const half = startBox.s[axis] / 2;
          const newSize = Math.max(0.05, sign * q[axis] + half);
          shift[axis] = sign * (newSize - startBox.s[axis]) / 2;
          box.s[axis] = Number(newSize.toFixed(4));
        }
        box.c = localToWorld(shift, startBox.c, ax);
      } else if (kind === "rotate") {
        const center = this.project(startBox.c, cam, cell.view, rect, ppm);
        const ang = Math.atan2(-(my - center[1]), mx - center[0]);
        let delta = ang - ang0;
        if (isShiftPressed) {
          const step = Math.PI / 36;
          delta = Math.round(delta / step) * step;
        }
        if (cell.view === "top") {
          if (!startBox.r[0] && !startBox.r[1]) {
            box.r[2] = startBox.r[2] + delta;
          } else {
            box.r = rotateLocal(startBox.r, 2, delta);
          }
        } else if (cell.view === "side") {
          box.r = rotateLocal(startBox.r, 1, -delta);
        } else {
          box.r = rotateLocal(startBox.r, 0, delta);
        }
      }
      return box;
    }
  }
  class OrthoEditorPanel {
    constructor(onBoxChange, onSelectFrame) {
      __publicField(this, "container", null);
      __publicField(this, "framesData", []);
      __publicField(this, "activeFrame", -1);
      __publicField(this, "onBoxChangeCallback", null);
      __publicField(this, "onSelectFrameCallback", null);
      // Lưu trữ trạng thái từng cell: key là `${frame}_${view}`
      __publicField(this, "cells", /* @__PURE__ */ new Map());
      __publicField(this, "globalZoom", { top: 1, side: 1, front: 1 });
      __publicField(this, "pointSize", 2);
      __publicField(this, "isContextMode", true);
      __publicField(this, "slabThickness", 2);
      __publicField(this, "activeDrag", null);
      __publicField(this, "activePan", null);
      __publicField(this, "resizeObserver", null);
      this.onBoxChangeCallback = onBoxChange;
      this.onSelectFrameCallback = onSelectFrame || null;
      this.handleGlobalPointerMove = this.handleGlobalPointerMove.bind(this);
      this.handleGlobalPointerUp = this.handleGlobalPointerUp.bind(this);
    }
    /**
     * Khởi tạo container gắn vào DOM cha
     */
    mount(parentEl) {
      this.container = document.createElement("div");
      this.container.className = "ortho-multi-frame-panel-container";
      this.container.style.display = "grid";
      this.container.style.gridTemplateColumns = "repeat(5, minmax(0, 1fr))";
      this.container.style.gap = "6px";
      this.container.style.width = "100%";
      this.container.style.height = "100%";
      this.container.style.minHeight = "460px";
      this.container.style.background = "#09090b";
      this.container.style.padding = "6px";
      this.container.style.boxSizing = "border-box";
      this.container.style.borderRadius = "8px";
      this.container.style.overflow = "hidden";
      parentEl.appendChild(this.container);
      window.addEventListener("pointermove", this.handleGlobalPointerMove);
      window.addEventListener("pointerup", this.handleGlobalPointerUp);
      if (typeof ResizeObserver !== "undefined") {
        this.resizeObserver = new ResizeObserver(() => {
          this.renderAll();
        });
        this.resizeObserver.observe(this.container);
      }
    }
    unmount() {
      window.removeEventListener("pointermove", this.handleGlobalPointerMove);
      window.removeEventListener("pointerup", this.handleGlobalPointerUp);
      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
        this.resizeObserver = null;
      }
      if (this.container && this.container.parentNode) {
        this.container.parentNode.removeChild(this.container);
      }
      this.container = null;
      this.cells.clear();
    }
    /**
     * Cập nhật danh sách 5 frames hiển thị và frame đang được chọn
     */
    setFrames(frames, activeFrame) {
      this.framesData = frames;
      this.activeFrame = activeFrame;
      if (!this.container) return;
      const colCount = Math.max(1, frames.length);
      this.container.style.gridTemplateColumns = `repeat(${colCount}, minmax(0, 1fr))`;
      const currentFrameKeys = frames.map((f) => f.frame).join(",");
      const existingFrameKeys = this.container.getAttribute("data-frame-keys") || "";
      if (currentFrameKeys !== existingFrameKeys) {
        this.container.setAttribute("data-frame-keys", currentFrameKeys);
        this.container.innerHTML = "";
        this.cells.clear();
        for (const fData of frames) {
          const colEl = this.createFrameColumn(fData);
          this.container.appendChild(colEl);
        }
      } else {
        this.container.querySelectorAll(".frame-column-card").forEach((col) => {
          const f = parseInt(col.dataset.frame || "-1", 10);
          const isActive = f === this.activeFrame;
          col.style.border = isActive ? "2px solid #2563eb" : "1px solid #1e293b";
          col.style.boxShadow = isActive ? "0 0 10px rgba(37, 99, 235, 0.45)" : "none";
          col.style.background = isActive ? "#0f172a" : "#020617";
          const badgeActive = col.querySelector(".badge-active-indicator");
          if (badgeActive) {
            badgeActive.style.display = isActive ? "inline-block" : "none";
          }
        });
      }
      this.renderAll();
    }
    /**
     * Tạo một cột hiển thị cho 1 frame (chứa Header + 3 Viewports: TOP, SIDE, FRONT)
     */
    createFrameColumn(fData) {
      const f = fData.frame;
      const isActive = f === this.activeFrame;
      const col = document.createElement("div");
      col.className = "frame-column-card";
      col.dataset.frame = String(f);
      col.style.display = "flex";
      col.style.flexDirection = "column";
      col.style.background = isActive ? "#0f172a" : "#020617";
      col.style.border = isActive ? "2px solid #2563eb" : "1px solid #1e293b";
      col.style.borderRadius = "6px";
      col.style.overflow = "hidden";
      col.style.position = "relative";
      col.style.minWidth = "0";
      col.style.minHeight = "0";
      col.style.boxShadow = isActive ? "0 0 10px rgba(37, 99, 235, 0.45)" : "none";
      col.style.transition = "border-color 0.15s, box-shadow 0.15s";
      const header = document.createElement("div");
      header.style.display = "flex";
      header.style.alignItems = "center";
      header.style.justifyContent = "space-between";
      header.style.padding = "4px 8px";
      header.style.background = isActive ? "#1e293b" : "#0b0f19";
      header.style.borderBottom = "1px solid #1e293b";
      header.style.cursor = "pointer";
      header.title = `Click để chọn Frame #${f}`;
      header.addEventListener("click", () => {
        if (this.activeFrame !== f && this.onSelectFrameCallback) {
          this.onSelectFrameCallback(f);
        }
      });
      const l = fData.box.s[0].toFixed(2);
      const w = fData.box.s[1].toFixed(2);
      const h2 = fData.box.s[2].toFixed(2);
      header.innerHTML = `
      <div style="display: flex; align-items: center; gap: 4px; overflow: hidden;">
        <span style="font-size: 11px; font-weight: bold; font-family: monospace; color: ${isActive ? "#38bdf8" : "#94a3b8"};">#${f}</span>
        <span style="
          font-size: 9px;
          font-weight: bold;
          padding: 1px 4px;
          border-radius: 3px;
          background: ${fData.outside ? "#fee2e2" : "#ecfdf5"};
          color: ${fData.outside ? "#dc2626" : "#059669"};
        ">${fData.outside ? "OUT" : "KF"}</span>
        <span class="badge-active-indicator" style="
          display: ${isActive ? "inline-block" : "none"};
          font-size: 8px;
          font-weight: bold;
          background: #2563eb;
          color: white;
          padding: 1px 4px;
          border-radius: 3px;
        ">ACTIVE</span>
      </div>
      <span style="font-size: 9px; color: #64748b; font-family: monospace;">${l}×${w}×${h2}</span>
    `;
      col.appendChild(header);
      const viewsWrap = document.createElement("div");
      viewsWrap.style.flex = "1";
      viewsWrap.style.minHeight = "0";
      viewsWrap.style.display = "grid";
      viewsWrap.style.gridTemplateRows = "repeat(3, 1fr)";
      viewsWrap.style.gap = "4px";
      viewsWrap.style.padding = "4px";
      viewsWrap.style.boxSizing = "border-box";
      const viewTypes = ["top", "side", "front"];
      for (const vType of viewTypes) {
        const vEl = this.createViewportCell(f, vType);
        viewsWrap.appendChild(vEl);
      }
      col.appendChild(viewsWrap);
      return col;
    }
    /**
     * Tạo ô Canvas cho một khung nhìn cụ thể của frame
     */
    createViewportCell(frame, view) {
      const card = document.createElement("div");
      card.style.position = "relative";
      card.style.background = "#05070d";
      card.style.border = "1px solid #1e293b";
      card.style.borderRadius = "4px";
      card.style.overflow = "hidden";
      card.style.minWidth = "0";
      card.style.minHeight = "0";
      const canvas = document.createElement("canvas");
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.display = "block";
      canvas.style.cursor = "crosshair";
      card.appendChild(canvas);
      const labelBadge = document.createElement("span");
      labelBadge.textContent = view.toUpperCase();
      labelBadge.style.position = "absolute";
      labelBadge.style.top = "2px";
      labelBadge.style.left = "4px";
      labelBadge.style.fontSize = "9px";
      labelBadge.style.fontWeight = "bold";
      labelBadge.style.fontFamily = "monospace";
      labelBadge.style.color = "rgba(56, 189, 248, 0.75)";
      labelBadge.style.pointerEvents = "none";
      labelBadge.style.textShadow = "0 1px 2px #000";
      card.appendChild(labelBadge);
      const cellKey = `${frame}_${view}`;
      const cellState = {
        canvas,
        frame,
        view,
        zoom: 1,
        pan: [0, 0]
      };
      this.cells.set(cellKey, cellState);
      this.attachCanvasListeners(canvas, cellKey, frame, view);
      return card;
    }
    /**
     * Vẽ lại toàn bộ 15 khung nhìn (5 frames x 3 views)
     */
    renderAll() {
      for (const [key, cell] of this.cells.entries()) {
        const fData = this.framesData.find((f) => f.frame === cell.frame);
        if (fData) {
          this.renderCell(cell, fData);
        }
      }
    }
    /**
     * Vẽ 1 khung nhìn cụ thể
     */
    renderCell(cell, fData) {
      const canvas = cell.canvas;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(10, Math.floor(rect.width));
      const h2 = Math.max(10, Math.floor(rect.height));
      if (canvas.width !== w || canvas.height !== h2) {
        canvas.width = w;
        canvas.height = h2;
      }
      const isActive = cell.frame === this.activeFrame;
      ctx.fillStyle = isActive ? "#09090b" : "#020617";
      ctx.fillRect(0, 0, w, h2);
      const box = fData.box;
      const refSize = [box.s[0], box.s[1], box.s[2]];
      const ppm = OrthoInteractionEngine.calculatePpm(
        cell,
        w,
        h2,
        refSize,
        this.globalZoom,
        this.isContextMode
      );
      const cam = OrthoInteractionEngine.getCamera(cell, box);
      this.drawSubtleGrid(ctx, cam, cell.view, { w, h: h2 }, ppm, isActive);
      this.drawLidarPoints(ctx, cell, box, fData.points, cam, { w, h: h2 }, ppm);
      this.drawBoundingBox(
        ctx,
        cell,
        box,
        fData.keyframe,
        fData.outside,
        fData.labelColor,
        cam,
        { w, h: h2 },
        ppm,
        isActive
      );
    }
    drawSubtleGrid(ctx, cam, view, rect, ppm, isActive) {
      ctx.strokeStyle = isActive ? "rgba(51, 65, 85, 0.4)" : "rgba(30, 41, 59, 0.3)";
      ctx.lineWidth = 0.5;
      const stepPixels = 1 * ppm;
      if (stepPixels < 12) return;
      const cx = rect.w / 2 + cam.pan[0];
      const cy = rect.h / 2 + cam.pan[1];
      ctx.beginPath();
      for (let x = cx % stepPixels; x < rect.w; x += stepPixels) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, rect.h);
      }
      for (let y = cy % stepPixels; y < rect.h; y += stepPixels) {
        ctx.moveTo(0, y);
        ctx.lineTo(rect.w, y);
      }
      ctx.stroke();
      ctx.strokeStyle = isActive ? "rgba(56, 189, 248, 0.3)" : "rgba(56, 189, 248, 0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, rect.h);
      ctx.moveTo(0, cy);
      ctx.lineTo(rect.w, cy);
      ctx.stroke();
    }
    drawLidarPoints(ctx, cell, box, pts, cam, rect, ppm) {
      if (!pts || pts.length === 0) return;
      const V = VIEWS_DEF[cell.view];
      const ax = cam.ax;
      const c = box.c;
      const half = [box.s[0] / 2 + 0.04, box.s[1] / 2 + 0.04, box.s[2] / 2 + 0.04];
      const slab = this.slabThickness;
      const hd = cam.half[V.di];
      const totalPoints = pts.length / 3;
      for (let i = 0; i < totalPoints; i++) {
        const px = pts[i * 3];
        const py = pts[i * 3 + 1];
        const pz = pts[i * 3 + 2];
        const dx = px - cam.c[0];
        const dy = py - cam.c[1];
        const dz = pz - cam.c[2];
        const depth = dx * cam.ax[V.d][0] + dy * cam.ax[V.d][1] + dz * cam.ax[V.d][2];
        if (depth < -hd - slab || depth > hd + slab) continue;
        const screenP = OrthoInteractionEngine.project([px, py, pz], cam, cell.view, rect, ppm);
        if (screenP[0] < -8 || screenP[0] > rect.w + 8 || screenP[1] < -8 || screenP[1] > rect.h + 8) {
          continue;
        }
        const bx = px - c[0];
        const by = py - c[1];
        const bz = pz - c[2];
        const qx = Math.abs(bx * ax.ex[0] + by * ax.ex[1] + bz * ax.ex[2]);
        const qy = Math.abs(bx * ax.ey[0] + by * ax.ey[1] + bz * ax.ey[2]);
        const qz = Math.abs(bx * ax.ez[0] + by * ax.ez[1] + bz * ax.ez[2]);
        const isInside = qx <= half[0] && qy <= half[1] && qz <= half[2];
        ctx.fillStyle = isInside ? "#38bdf8" : "rgba(148, 163, 184, 0.4)";
        ctx.fillRect(screenP[0] - 1, screenP[1] - 1, this.pointSize, this.pointSize);
      }
    }
    drawBoundingBox(ctx, cell, box, keyframe, outside, labelColor, cam, rect, ppm, isActive) {
      const corners = boxCorners(box).map(
        (p) => OrthoInteractionEngine.project(p, cam, cell.view, rect, ppm)
      );
      ctx.lineWidth = isActive ? 1.8 : 1.2;
      ctx.strokeStyle = outside ? "#64748b" : labelColor || "#38bdf8";
      ctx.setLineDash(keyframe ? [] : [4, 4]);
      ctx.beginPath();
      for (const [i, j] of BOX_EDGES) {
        ctx.moveTo(corners[i][0], corners[i][1]);
        ctx.lineTo(corners[j][0], corners[j][1]);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      if (outside) return;
      const hs = OrthoInteractionEngine.calculateHandles(box, cam, cell.view, rect, ppm);
      if (cell.view === "top") {
        const front = hs.P(1, 0);
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = isActive ? 2.2 : 1.5;
        ctx.beginPath();
        ctx.moveTo(hs.center[0], hs.center[1]);
        ctx.lineTo(front[0], front[1]);
        ctx.stroke();
        const dx = front[0] - hs.center[0];
        const dy = front[1] - hs.center[1];
        const len = Math.hypot(dx, dy);
        if (len > 8) {
          const ux = dx / len;
          const uy = dy / len;
          const arrowLen = 8;
          const arrowW = 4;
          ctx.fillStyle = "#ef4444";
          ctx.beginPath();
          ctx.moveTo(front[0], front[1]);
          ctx.lineTo(front[0] - ux * arrowLen - uy * arrowW, front[1] - uy * arrowLen + ux * arrowW);
          ctx.lineTo(front[0] - ux * arrowLen + uy * arrowW, front[1] - uy * arrowLen - ux * arrowW);
          ctx.closePath();
          ctx.fill();
        }
      }
      if (isActive) {
        if (cell.view === "top") {
          ctx.strokeStyle = "#38bdf8";
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(hs.top[0], hs.top[1]);
          ctx.lineTo(hs.rot[0], hs.rot[1]);
          ctx.stroke();
          ctx.fillStyle = "#fbbf24";
          ctx.beginPath();
          ctx.arc(hs.rot[0], hs.rot[1], 5.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#09090b";
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
        for (const hd of hs.list) {
          const isCorner = hd.a !== 0 && hd.b !== 0;
          ctx.fillStyle = isCorner ? "#ef4444" : "#ffffff";
          ctx.fillRect(hd.p[0] - 3.5, hd.p[1] - 3.5, 7, 7);
          ctx.strokeStyle = "#09090b";
          ctx.lineWidth = 1;
          ctx.strokeRect(hd.p[0] - 3.5, hd.p[1] - 3.5, 7, 7);
        }
      }
    }
    /**
     * Gắn sự kiện chuột trên từng Canvas
     */
    attachCanvasListeners(canvas, cellKey, frame, view) {
      canvas.addEventListener("pointerdown", (e) => {
        if (frame !== this.activeFrame) {
          if (this.onSelectFrameCallback) {
            this.onSelectFrameCallback(frame);
          }
          return;
        }
        const cell = this.cells.get(cellKey);
        const fData = this.framesData.find((f) => f.frame === frame);
        if (!cell || !fData) return;
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        if (e.button === 2 || e.altKey) {
          e.preventDefault();
          this.activePan = {
            key: cellKey,
            startX: e.clientX,
            startY: e.clientY,
            pan0: [...cell.pan]
          };
          canvas.style.cursor = "grabbing";
          return;
        }
        if (e.button !== 0) return;
        const box = fData.box;
        const refSize = [box.s[0], box.s[1], box.s[2]];
        const ppm = OrthoInteractionEngine.calculatePpm(
          cell,
          rect.width,
          rect.height,
          refSize,
          this.globalZoom,
          this.isContextMode
        );
        const hit = OrthoInteractionEngine.hitTest(
          mx,
          my,
          cell,
          box,
          { w: rect.width, h: rect.height },
          ppm,
          false
        );
        if (hit) {
          e.preventDefault();
          canvas.setPointerCapture(e.pointerId);
          const cam = OrthoInteractionEngine.getCamera(cell, box);
          const p0 = OrthoInteractionEngine.unproject(
            mx,
            my,
            cam,
            cell.view,
            { w: rect.width, h: rect.height },
            ppm
          );
          let ang0 = 0;
          if (hit.kind === "rotate") {
            const center = OrthoInteractionEngine.project(
              box.c,
              cam,
              cell.view,
              { w: rect.width, h: rect.height },
              ppm
            );
            ang0 = Math.atan2(-(my - center[1]), mx - center[0]);
          }
          this.activeDrag = {
            cell,
            kind: hit.kind,
            a: hit.a,
            b: hit.b,
            startBox: cloneBox(box),
            cam,
            rect: { w: rect.width, h: rect.height },
            ppm,
            p0,
            ang0,
            moved: false
          };
        }
      });
      canvas.addEventListener("contextmenu", (e) => e.preventDefault());
      canvas.addEventListener(
        "wheel",
        (e) => {
          e.preventDefault();
          const cell = this.cells.get(cellKey);
          if (!cell) return;
          const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
          cell.zoom = Math.max(0.2, Math.min(10, (cell.zoom || 1) * factor));
          this.globalZoom[view] = cell.zoom;
          this.renderAll();
        },
        { passive: false }
      );
    }
    handleGlobalPointerMove(e) {
      if (this.activePan) {
        const cell = this.cells.get(this.activePan.key);
        if (cell) {
          const dx = e.clientX - this.activePan.startX;
          const dy = e.clientY - this.activePan.startY;
          cell.pan = [this.activePan.pan0[0] + dx, this.activePan.pan0[1] + dy];
          this.renderAll();
        }
        return;
      }
      if (!this.activeDrag) return;
      const drag = this.activeDrag;
      const canvas = drag.cell.canvas;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const newBox = OrthoInteractionEngine.applyDrag(drag, mx, my, { lockBottom: true });
      drag.moved = true;
      const fData = this.framesData.find((f) => f.frame === this.activeFrame);
      if (fData) {
        fData.box = cloneBox(newBox);
      }
      this.renderAll();
      if (this.onBoxChangeCallback) {
        this.onBoxChangeCallback(newBox, true);
      }
    }
    handleGlobalPointerUp(e) {
      if (this.activePan) {
        const cell = this.cells.get(this.activePan.key);
        if (cell && cell.canvas) {
          cell.canvas.style.cursor = "crosshair";
        }
        this.activePan = null;
      }
      if (!this.activeDrag) return;
      const drag = this.activeDrag;
      const canvas = drag.cell.canvas;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch (err) {
      }
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const finalBox = OrthoInteractionEngine.applyDrag(drag, mx, my, { lockBottom: true });
      this.activeDrag = null;
      const fData = this.framesData.find((f) => f.frame === this.activeFrame);
      if (fData) {
        fData.box = cloneBox(finalBox);
      }
      this.renderAll();
      if (this.onBoxChangeCallback) {
        this.onBoxChangeCallback(finalBox, false);
      }
    }
  }
  class TrackPointManager {
    constructor() {
      __publicField(this, "activeTrackId", -1);
      // Lưu trữ các điểm LiDAR thô (World coordinates) theo từng frame
      __publicField(this, "framePointsCache", /* @__PURE__ */ new Map());
      // Lưu trữ Box3D tương ứng tại frame đã lưu điểm để nội suy chuyển hệ tọa độ
      __publicField(this, "frameBoxCache", /* @__PURE__ */ new Map());
      __publicField(this, "isScanning", false);
      __publicField(this, "abortScanFlag", false);
    }
    /**
     * Đặt Track ID hiện tại. Nếu đổi xe khác thì reset cache
     */
    setActiveTrack(trackId) {
      if (this.activeTrackId !== trackId) {
        this.clear();
        this.activeTrackId = trackId;
      }
    }
    /**
     * Xóa toàn bộ cache mây điểm
     */
    clear() {
      this.abortScan();
      this.framePointsCache.clear();
      this.frameBoxCache.clear();
    }
    /**
     * Lưu các điểm LiDAR của frame cụ thể vào cache
     */
    setFramePoints(frame, points, box) {
      const arr = points instanceof Float32Array ? points : new Float32Array(points);
      this.framePointsCache.set(frame, arr);
      this.frameBoxCache.set(frame, {
        c: [...box.c],
        s: [...box.s],
        r: [...box.r]
      });
    }
    /**
     * Lấy điểm LiDAR riêng của một frame
     */
    getFramePoints(frame) {
      return this.framePointsCache.get(frame) || null;
    }
    /**
     * Kiểm tra frame đã có mây điểm trong cache chưa
     */
    hasFrame(frame) {
      return this.framePointsCache.has(frame);
    }
    /**
     * Đếm tổng số frame đã được nạp mây điểm
     */
    get loadedFramesCount() {
      return this.framePointsCache.size;
    }
    /**
     * Lấy danh sách các frame đã có dữ liệu mây điểm
     */
    getLoadedFrames() {
      return Array.from(this.framePointsCache.keys()).sort((a, b) => a - b);
    }
    /**
     * Thuật toán GỘP MÂY ĐIỂM TOÀN TRACK (Dense Multi-Frame Accumulation):
     * Biến đổi tọa độ các điểm từ mọi frame trong cache về hệ quy chiếu của box ở frame mục tiêu.
     */
    getAccumulatedPoints(currentFrame, targetBox) {
      if (this.framePointsCache.size === 0) return null;
      const targetAxes = axes(targetBox.r);
      const totalAccumulated = [];
      const maxTotalPoints = 65e3;
      const curPts = this.framePointsCache.get(currentFrame);
      if (curPts && curPts.length > 0) {
        const curCount = curPts.length / 3;
        for (let i = 0; i < curCount; i++) {
          totalAccumulated.push(curPts[i * 3], curPts[i * 3 + 1], curPts[i * 3 + 2]);
        }
      }
      for (const [f, pts] of this.framePointsCache.entries()) {
        if (f === currentFrame) continue;
        if (totalAccumulated.length / 3 >= maxTotalPoints) break;
        const srcBox = this.frameBoxCache.get(f);
        if (!srcBox) continue;
        const srcAxes = axes(srcBox.r);
        const ptCount = pts.length / 3;
        const step = ptCount > 3e3 ? 2 : 1;
        for (let i = 0; i < ptCount; i += step) {
          if (totalAccumulated.length / 3 >= maxTotalPoints) break;
          const wx = pts[i * 3];
          const wy = pts[i * 3 + 1];
          const wz = pts[i * 3 + 2];
          const localP = worldToLocal([wx, wy, wz], srcBox.c, srcAxes);
          const targetWorldP = localToWorld(localP, targetBox.c, targetAxes);
          totalAccumulated.push(targetWorldP[0], targetWorldP[1], targetWorldP[2]);
        }
      }
      if (totalAccumulated.length === 0) return null;
      return new Float32Array(totalAccumulated);
    }
    /**
     * Quét tự động tải toàn bộ curpoint của toàn track:
     * Duyệt qua dải frame của track, lấy ROI point cloud từ Three.js scene và nạp vào cache.
     */
    async scanTrackCurpoints(track2, onProgress, onComplete) {
      if (this.isScanning) return;
      this.isScanning = true;
      this.abortScanFlag = false;
      const shapes = [...track2.shapes].sort((a, b) => a.frame - b.frame);
      if (shapes.length === 0) {
        this.isScanning = false;
        onComplete(false, 0);
        return;
      }
      const firstF = shapes[0].frame;
      const lastF = shapes[shapes.length - 1].frame;
      const framesToScan = [];
      for (let f = firstF; f <= lastF; f++) {
        const pos = track2.at(f);
        if (pos && !pos.outside) {
          framesToScan.push(f);
        }
      }
      const total = framesToScan.length;
      let loaded = 0;
      for (let i = 0; i < total; i++) {
        if (this.abortScanFlag) {
          break;
        }
        const f = framesToScan[i];
        const pos = track2.at(f);
        if (!pos) continue;
        onProgress(i + 1, total, f);
        if (this.framePointsCache.has(f)) {
          loaded++;
          continue;
        }
        try {
          CVATBridge.jumpToFrame(f);
          await new Promise((res) => setTimeout(res, 160));
          if (this.abortScanFlag) break;
          const diag = Math.hypot(pos.box.s[0], pos.box.s[1]);
          const radius = Math.max(3.2, diag / 2 + 1.2);
          const rawPoints = await CVATBridge.getRoiLidarPoints(pos.box.c, radius, 12e3);
          if (rawPoints && rawPoints.length > 0) {
            this.setFramePoints(f, rawPoints, pos.box);
            loaded++;
          }
        } catch (err) {
          console.warn(`[CVAT 3D Suite] Lỗi khi tải điểm LiDAR frame #${f}:`, err);
        }
      }
      this.isScanning = false;
      onComplete(!this.abortScanFlag, loaded);
    }
    /**
     * Hủy tiến trình quét tự động
     */
    abortScan() {
      if (this.isScanning) {
        this.abortScanFlag = true;
        this.isScanning = false;
      }
    }
    get isScanActive() {
      return this.isScanning;
    }
  }
  function float32ToVec3Array(arr) {
    const count = Math.floor(arr.length / 3);
    const res = [];
    for (let i = 0; i < count; i++) {
      res.push({ x: arr[i * 3], y: arr[i * 3 + 1], z: arr[i * 3 + 2] });
    }
    return res;
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
      // Thành phần 3D Ortho Editor và Mây Điểm
      __publicField(this, "orthoEditor", null);
      __publicField(this, "pointManager", new TrackPointManager());
      __publicField(this, "showAllPoints", false);
      __publicField(this, "applyToAllFrames", false);
      __publicField(this, "isPlaying", false);
      __publicField(this, "playInterval", null);
      this.createOverlay();
      this.attachGlobalHotkeys();
    }
    async open(ctx, activeTrackId, _activeServerId, allJobTracks = []) {
      this.currentCtx = ctx;
      this.activeTrackId = activeTrackId;
      this.allJobTracks = allJobTracks;
      this.selectedFrame = CVATBridge.getCurrentFrame();
      this.currentTab = "active_track";
      this.pointManager.setActiveTrack(activeTrackId);
      if (this.overlay) {
        this.overlay.style.display = "flex";
      }
      await this.loadInitialData();
    }
    close() {
      this.stopPlayback();
      this.pointManager.abortScan();
      if (this.orthoEditor) {
        this.orthoEditor.unmount();
        this.orthoEditor = null;
      }
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
      this.overlay.setAttribute("translate", "no");
      this.overlay.classList.add("notranslate");
      this.overlay.style.position = "fixed";
      this.overlay.style.inset = "0";
      this.overlay.style.zIndex = "999999";
      this.overlay.style.background = "#ffffff";
      this.overlay.style.color = "#09090b";
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
          if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
            e.preventDefault();
            this.triggerUndo();
            return;
          }
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y" || (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z") {
            e.preventDefault();
            this.triggerRedo();
            return;
          }
          const target = e.target;
          if (target && (target.tagName === "INPUT" || target.tagName === "SELECT")) return;
          if (e.code === "Space" && this.currentTab === "active_track") {
            e.preventDefault();
            this.togglePlayback();
            return;
          }
          if ((e.key === "ArrowLeft" || e.key.toLowerCase() === "a") && this.currentTab === "active_track") {
            e.preventDefault();
            this.stepFrame(-1);
            return;
          }
          if ((e.key === "ArrowRight" || e.key.toLowerCase() === "d") && this.currentTab === "active_track") {
            e.preventDefault();
            this.stepFrame(1);
            return;
          }
          if (e.key.toLowerCase() === "o" && this.currentTab === "active_track") {
            e.preventDefault();
            this.toggleOutsideFrame(this.selectedFrame);
            return;
          }
          if (e.key === "[" && this.currentTab === "active_track") {
            e.preventDefault();
            this.switchPrevTrack();
            return;
          }
          if (e.key === "]" && this.currentTab === "active_track") {
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
        if (this.currentTab === "active_track") {
          this.updateOrthoEditorState(track);
          await this.preloadPointsForVisibleFrames(track);
        }
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
      <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; background: #ffffff;">
        <div style="width: 36px; height: 36px; border: 3px solid #e2e8f0; border-top-color: #0284c7; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
        <span style="font-size: 13px; color: #64748b; font-family: monospace;">Đang đồng bộ dữ liệu xe từ Three.js CVAT native...</span>
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
        background: #ffffff;
        border-bottom: 1px solid #e2e8f0;
        padding: 8px 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 48px;
        box-sizing: border-box;
      ">
        <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
          <!-- Badge Studio -->
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="background: #2563eb; color: white; padding: 3px 8px; border-radius: 5px; font-size: 11px; font-weight: bold; letter-spacing: 0.5px;">ORTHO 3D STUDIO</span>
            <span style="font-size: 13px; font-weight: bold; color: #09090b;">Job #${this.currentCtx.jobId}</span>
          </div>

          <!-- Tab Switcher -->
          <div style="display: flex; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 6px; padding: 2px;">
            <button id="studio-tab-active" style="
              border: none;
              background: ${this.currentTab === "active_track" ? "#ffffff" : "transparent"};
              color: ${this.currentTab === "active_track" ? "#09090b" : "#64748b"};
              box-shadow: ${this.currentTab === "active_track" ? "0 1px 3px rgba(0,0,0,0.08)" : "none"};
              padding: 4px 12px;
              font-size: 11px;
              font-weight: 600;
              cursor: pointer;
              border-radius: 4px;
              transition: all 0.15s;
            ">Duyệt Track (Xe #${this.activeTrackId})</button>

            <button id="studio-tab-batch" style="
              border: none;
              background: ${this.currentTab === "batch_all" ? "#ffffff" : "transparent"};
              color: ${this.currentTab === "batch_all" ? "#09090b" : "#64748b"};
              box-shadow: ${this.currentTab === "batch_all" ? "0 1px 3px rgba(0,0,0,0.08)" : "none"};
              padding: 4px 12px;
              font-size: 11px;
              font-weight: 600;
              cursor: pointer;
              border-radius: 4px;
              transition: all 0.15s;
            ">Tất Cả Track ID (${allTracks.length})</button>
          </div>

          <!-- Quick Track Selector Dropdown -->
          <div style="display: flex; align-items: center; gap: 4px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 2px 6px;">
            <span style="font-size: 11px; color: #64748b; font-weight: 600;">Track:</span>
            <select id="studio-quick-track-select" style="
              background: transparent;
              border: none;
              color: #0284c7;
              font-size: 11px;
              font-weight: bold;
              cursor: pointer;
              outline: none;
              padding: 2px 4px;
              max-width: 180px;
            ">
              ${allTracks.map(
        (t) => `
                <option value="${t.uiId}" ${t.uiId === this.activeTrackId ? "selected" : ""} style="background: #ffffff; color: #09090b;">
                  #${t.uiId} · ${t.labelName} (${t.shapes.length}f)
                </option>
              `
      ).join("")}
            </select>
            <button id="btn-quick-prev-track" title="Xe trước (phím [)" style="
              background: #ffffff; border: 1px solid #cbd5e1; color: #334155; font-size: 10px; padding: 2px 6px; border-radius: 4px; cursor: pointer;
            ">◀</button>
            <button id="btn-quick-next-track" title="Xe sau (phím ])" style="
              background: #ffffff; border: 1px solid #cbd5e1; color: #334155; font-size: 10px; padding: 2px 6px; border-radius: 4px; cursor: pointer;
            ">▶</button>
          </div>

          <!-- Undo / Redo Buttons -->
          <div style="display: flex; align-items: center; gap: 3px;">
            <button id="btn-studio-undo" title="Hoàn tác (Ctrl+Z)" style="
              background: #f8fafc; border: 1px solid #cbd5e1; color: #334155; font-size: 11px; padding: 3px 8px; border-radius: 4px; cursor: pointer;
            ">↶ Undo</button>
            <button id="btn-studio-redo" title="Làm lại (Ctrl+Y)" style="
              background: #f8fafc; border: 1px solid #cbd5e1; color: #334155; font-size: 11px; padding: 3px 8px; border-radius: 4px; cursor: pointer;
            ">↷ Redo</button>
          </div>
        </div>

        <!-- Right Action Controls -->
        <div style="display: flex; align-items: center; gap: 8px;">
          <!-- Nút Lưu vào CVAT -->
          <button id="btn-studio-commit-save" style="
            background: ${dirtyCount > 0 ? "#ea580c" : "#059669"};
            border: 1px solid ${dirtyCount > 0 ? "#ea580c" : "#059669"};
            color: white;
            font-size: 11px;
            font-weight: 600;
            padding: 5px 14px;
            border-radius: 5px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 5px;
            box-shadow: 0 1px 4px ${dirtyCount > 0 ? "rgba(234, 88, 12, 0.2)" : "rgba(5, 150, 105, 0.2)"};
            transition: all 0.2s;
          ">
            <span style="display: flex; align-items: center;">${ICONS.save}</span>
            <span>${this.isSaving ? "Đang lưu..." : dirtyCount > 0 ? `Lưu vào CVAT (${dirtyCount} track)` : "Lưu vào CVAT"}</span>
            <span style="font-size: 9px; opacity: 0.85; font-family: monospace;">(Ctrl+S)</span>
          </button>

          <!-- Nút Đóng -->
          <button id="btn-studio-close" style="
            background: #f1f5f9;
            border: 1px solid #e2e8f0;
            color: #334155;
            font-size: 11px;
            font-weight: 600;
            padding: 5px 10px;
            border-radius: 5px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 4px;
          ">
            <span style="display: flex; align-items: center;">${ICONS.close}</span>
            <span>Đóng (Esc)</span>
          </button>
        </div>
      </div>

      <!-- 2. NỘI DUNG CHÍNH (TAB 1 HOẶC TAB 2) -->
      <div id="studio-main-content-area" style="flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden;">
        ${this.currentTab === "active_track" ? this.renderActiveTrackHtml(activeTrack) : this.renderBatchAllHtml(allTracks)}
      </div>
    `;
      this.attachHeaderListeners();
      if (this.currentTab === "active_track") {
        this.attachActiveTrackListeners(activeTrack);
        this.mountOrthoEditor(activeTrack);
      } else {
        this.attachBatchAllListeners();
      }
    }
    // =========================================================================
    // TAB 2: ACTIVE TRACK ORTHOGRAPHIC STUDIO (TOP / SIDE / FRONT)
    // =========================================================================
    renderActiveTrackHtml(track2) {
      if (!track2) {
        return `
        <div style="flex: 1; display: flex; align-items: center; justify-content: center; color: #71717a;">
          Chưa chọn xe nào để duyệt. Vui lòng chuyển sang tab danh sách xe.
        </div>
      `;
      }
      const pos = track2.at(this.selectedFrame);
      const box = pos ? pos.box : { c: [0, 0, 0], s: [4, 1.8, 1.5], r: [0, 0, 0] };
      const yawDeg = Math.round(box.r[2] * 180 / Math.PI);
      const sortedShapes = [...track2.shapes].sort((a, b) => a.frame - b.frame);
      const firstF = sortedShapes.length > 0 ? sortedShapes[0].frame : 0;
      const lastF = sortedShapes.length > 0 ? sortedShapes[sortedShapes.length - 1].frame : 0;
      const filmstripCardsHtml = sortedShapes.map((sh) => {
        const f = sh.frame;
        const isSel = f === this.selectedFrame;
        const pts = sh.points;
        const l = (pts[6] || 0).toFixed(2);
        const w = (pts[7] || 0).toFixed(2);
        const h2 = (pts[8] || 0).toFixed(2);
        return `
          <div class="filmstrip-card ${isSel ? "active" : ""}" data-frame="${f}" style="
            display: inline-flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: ${isSel ? "#eff6ff" : sh.outside ? "#f8fafc" : "#ffffff"};
            border: 1.5px solid ${isSel ? "#2563eb" : sh.outside ? "#e2e8f0" : "#cbd5e1"};
            border-radius: 6px;
            padding: 4px 8px;
            min-width: 68px;
            cursor: pointer;
            transition: all 0.12s;
            box-shadow: ${isSel ? "0 2px 6px rgba(37, 99, 235, 0.2)" : "none"};
          ">
            <div style="display: flex; align-items: center; gap: 4px; width: 100%; justify-content: space-between;">
              <span style="font-size: 11px; font-weight: bold; font-family: monospace; color: ${isSel ? "#1d4ed8" : "#0f172a"};">#${f}</span>
              <span style="
                font-size: 9px;
                font-weight: bold;
                padding: 1px 4px;
                border-radius: 3px;
                background: ${sh.outside ? "#fee2e2" : "#ecfdf5"};
                color: ${sh.outside ? "#dc2626" : "#059669"};
              ">${sh.outside ? "OUT" : "KF"}</span>
            </div>
            <span style="font-size: 10px; color: #64748b; font-family: monospace; margin-top: 2px;">${l}×${w}×${h2}</span>
          </div>
        `;
      }).join("");
      return `
      <div style="flex: 1; min-height: 0; display: flex; flex-direction: column; background: #f8fafc;">
        <!-- KHU VỰC TRÊN: 3 ORTHO VIEWS (75%) + SIDEBAR ĐIỀU KHIỂN & VI CHỈNH (25%) -->
        <div style="flex: 1; min-height: 0; display: flex; gap: 8px; padding: 8px;">
          <!-- Khung chứa 3 Canvas Trực Giao TOP / SIDE / FRONT -->
          <div id="ortho-canvas-mount-point" style="flex: 1; min-width: 0; min-height: 0; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.06);"></div>

          <!-- Sidebar Điều Khiển Nhanh & Vi Chỉnh Số Liệu -->
          <div style="
            width: 280px;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 10px;
            display: flex;
            flex-direction: column;
            gap: 10px;
            overflow-y: auto;
            box-sizing: border-box;
          ">
            <!-- Thông tin Track & Frame Hiện Tại -->
            <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="width: 8px; height: 8px; border-radius: 50%; background: ${track2.labelColor};"></span>
                <span style="font-size: 13px; font-weight: bold; color: #09090b;">${track2.labelName} #${track2.uiId}</span>
              </div>
              <span style="font-size: 12px; font-weight: bold; font-family: monospace; color: #2563eb; background: #eff6ff; padding: 2px 6px; border-radius: 4px;">Frame #${this.selectedFrame}</span>
            </div>

            <!-- Tọa độ Tâm X, Y, Z -->
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px;">
              <span style="font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase;">Tọa Độ Tâm (Center)</span>
              <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; margin-top: 4px;">
                <div>
                  <span style="font-size: 10px; color: #64748b;">X (dọc)</span>
                  <input id="input-center-x" type="number" step="0.01" value="${box.c[0].toFixed(2)}" style="width: 100%; font-size: 11px; padding: 3px; font-family: monospace; border: 1px solid #cbd5e1; border-radius: 4px; text-align: center; box-sizing: border-box;" />
                </div>
                <div>
                  <span style="font-size: 10px; color: #64748b;">Y (ngang)</span>
                  <input id="input-center-y" type="number" step="0.01" value="${box.c[1].toFixed(2)}" style="width: 100%; font-size: 11px; padding: 3px; font-family: monospace; border: 1px solid #cbd5e1; border-radius: 4px; text-align: center; box-sizing: border-box;" />
                </div>
                <div>
                  <span style="font-size: 10px; color: #64748b;">Z (cao)</span>
                  <input id="input-center-z" type="number" step="0.01" value="${box.c[2].toFixed(2)}" style="width: 100%; font-size: 11px; padding: 3px; font-family: monospace; border: 1px solid #cbd5e1; border-radius: 4px; text-align: center; box-sizing: border-box;" />
                </div>
              </div>

              <!-- Nút Stepper vi chỉnh nhanh X/Y/Z -->
              <div style="display: flex; gap: 4px; margin-top: 6px; justify-content: space-between;">
                <button class="btn-step-move" data-axis="x" data-val="-0.02" style="font-size: 10px; padding: 2px 4px; background: white; border: 1px solid #cbd5e1; border-radius: 3px; cursor: pointer;">-2cm X</button>
                <button class="btn-step-move" data-axis="x" data-val="0.02" style="font-size: 10px; padding: 2px 4px; background: white; border: 1px solid #cbd5e1; border-radius: 3px; cursor: pointer;">+2cm X</button>
                <button class="btn-step-move" data-axis="y" data-val="-0.02" style="font-size: 10px; padding: 2px 4px; background: white; border: 1px solid #cbd5e1; border-radius: 3px; cursor: pointer;">-2cm Y</button>
                <button class="btn-step-move" data-axis="y" data-val="0.02" style="font-size: 10px; padding: 2px 4px; background: white; border: 1px solid #cbd5e1; border-radius: 3px; cursor: pointer;">+2cm Y</button>
              </div>
            </div>

            <!-- Kích thước L, W, H & Góc Yaw -->
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px;">
              <span style="font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase;">Kích Thước & Hướng</span>
              <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin-top: 4px;">
                <div>
                  <span style="font-size: 10px; color: #64748b;">Dài L</span>
                  <input id="input-dim-l" type="number" step="0.02" value="${box.s[0].toFixed(2)}" style="width: 100%; font-size: 11px; padding: 3px; font-family: monospace; border: 1px solid #cbd5e1; border-radius: 4px; text-align: center; box-sizing: border-box;" />
                </div>
                <div>
                  <span style="font-size: 10px; color: #64748b;">Rộng W</span>
                  <input id="input-dim-w" type="number" step="0.02" value="${box.s[1].toFixed(2)}" style="width: 100%; font-size: 11px; padding: 3px; font-family: monospace; border: 1px solid #cbd5e1; border-radius: 4px; text-align: center; box-sizing: border-box;" />
                </div>
                <div>
                  <span style="font-size: 10px; color: #64748b;">Cao H</span>
                  <input id="input-dim-h" type="number" step="0.02" value="${box.s[2].toFixed(2)}" title="Ground-Lock nở lên trên" style="width: 100%; font-size: 11px; padding: 3px; font-family: monospace; border: 1px solid #cbd5e1; border-radius: 4px; text-align: center; box-sizing: border-box;" />
                </div>
                <div>
                  <span style="font-size: 10px; color: #64748b;">Yaw°</span>
                  <input id="input-dim-yaw" type="number" step="1" value="${yawDeg}" style="width: 100%; font-size: 11px; padding: 3px; font-family: monospace; border: 1px solid #cbd5e1; border-radius: 4px; text-align: center; box-sizing: border-box;" />
                </div>
              </div>

              <!-- Checkbox Áp dụng cho Toàn Track -->
              <div style="margin-top: 8px; display: flex; align-items: center; gap: 6px;">
                <input id="chk-apply-all-frames" type="checkbox" ${this.applyToAllFrames ? "checked" : ""} style="cursor: pointer;" />
                <label for="chk-apply-all-frames" style="font-size: 11px; font-weight: 600; color: #0f172a; cursor: pointer;">Áp dụng cho Toàn Track</label>
              </div>
            </div>

            <!-- Bộ Nút Auto-Fit Nhanh (GEMINI.md Standard) -->
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <span style="font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase;">Căn Chỉnh Nhanh (Auto-Fit)</span>
              <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px;">
                <button id="btn-fit-top" title="Căn góc xoay Yaw ôm viền đón tia" style="background: #f0fdf4; border: 1px solid #bbf7d0; color: #15803d; font-size: 11px; font-weight: bold; padding: 5px; border-radius: 4px; cursor: pointer;">TOP</button>
                <button id="btn-fit-side" title="Căn cản trước/sau trục X (giữ nguyên Z)" style="background: #f0fdf4; border: 1px solid #bbf7d0; color: #15803d; font-size: 11px; font-weight: bold; padding: 5px; border-radius: 4px; cursor: pointer;">SIDE</button>
                <button id="btn-fit-front" title="Áp sát sườn đón tia laser trục Y (giữ nguyên Z)" style="background: #f0fdf4; border: 1px solid #bbf7d0; color: #15803d; font-size: 11px; font-weight: bold; padding: 5px; border-radius: 4px; cursor: pointer;">FRONT</button>
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-top: 2px;">
                <button id="btn-fit-ground" title="Ghim đáy xe bám sát mặt đất (Ground-Lock)" style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; font-size: 11px; font-weight: 600; padding: 5px; border-radius: 4px; cursor: pointer;">⇩ Ghim Đất</button>
                <button id="btn-fit-flip-180" title="Lật ngược đầu xe 180°" style="background: #fffbeb; border: 1px solid #fde68a; color: #b45309; font-size: 11px; font-weight: 600; padding: 5px; border-radius: 4px; cursor: pointer;">🔄 Lật 180°</button>
              </div>
            </div>

            <!-- Nút Toggle Outside tại Frame hiện tại -->
            <button id="btn-toggle-outside-cur" style="
              background: ${(pos == null ? void 0 : pos.outside) ? "#fee2e2" : "#f1f5f9"};
              border: 1px solid ${(pos == null ? void 0 : pos.outside) ? "#fca5a5" : "#cbd5e1"};
              color: ${(pos == null ? void 0 : pos.outside) ? "#dc2626" : "#334155"};
              font-size: 11px;
              font-weight: 600;
              padding: 6px;
              border-radius: 4px;
              cursor: pointer;
              margin-top: auto;
            ">${(pos == null ? void 0 : pos.outside) ? "Đang Ẩn (Outside) - Bấm để Hiện" : "Đang Hiện - Bấm để Ẩn (Phím O)"}</button>
          </div>
        </div>

        <!-- KHU VỰC DƯỚI: TIMELINE CONTROLS & DẢI PHIM FILMSTRIP TOÀN BỘ CÁC FRAME -->
        <div style="
          background: #ffffff;
          border-top: 1px solid #e2e8f0;
          padding: 8px 12px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        ">
          <!-- Hàng 1: Bộ điều khiển Timeline & Mây điểm -->
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
            <!-- Bộ điều khiển phát & chuyển frame -->
            <div style="display: flex; align-items: center; gap: 4px;">
              <button id="btn-timeline-prev5" title="Lùi 5 frames" style="background: #f1f5f9; border: 1px solid #cbd5e1; color: #334155; font-size: 11px; padding: 4px 6px; border-radius: 4px; cursor: pointer;">◀◀ -5f</button>
              <button id="btn-timeline-prev" title="Frame trước (phím A hoặc ◀)" style="background: #f1f5f9; border: 1px solid #cbd5e1; color: #334155; font-size: 11px; padding: 4px 8px; border-radius: 4px; cursor: pointer;">◀ Prev</button>
              <button id="btn-timeline-play" title="Phát lướt tự động (Space)" style="background: #2563eb; border: none; color: white; font-size: 11px; font-weight: bold; padding: 4px 10px; border-radius: 4px; cursor: pointer;">${this.isPlaying ? "❚❚ Pause" : "▶ Play"}</button>
              <button id="btn-timeline-next" title="Frame sau (phím D hoặc ▶)" style="background: #f1f5f9; border: 1px solid #cbd5e1; color: #334155; font-size: 11px; padding: 4px 8px; border-radius: 4px; cursor: pointer;">Next ▶</button>
              <button id="btn-timeline-next5" title="Tiến 5 frames" style="background: #f1f5f9; border: 1px solid #cbd5e1; color: #334155; font-size: 11px; padding: 4px 6px; border-radius: 4px; cursor: pointer;">+5f ▶▶</button>

              <!-- Slider kéo nhanh frame -->
              <div style="display: flex; align-items: center; gap: 6px; margin-left: 8px;">
                <span style="font-size: 11px; color: #64748b; font-family: monospace;">f#${firstF}</span>
                <input id="timeline-slider" type="range" min="${firstF}" max="${lastF}" value="${this.selectedFrame}" style="width: 180px; cursor: pointer;" />
                <span style="font-size: 11px; color: #64748b; font-family: monospace;">f#${lastF}</span>
              </div>
            </div>

            <!-- Tải Toàn Bộ Curpoint & Show All Point Cloud -->
            <div style="display: flex; align-items: center; gap: 8px;">
              <!-- Nút Tải Toàn Bộ Curpoint -->
              <button id="btn-scan-all-curpoints" style="
                background: ${this.pointManager.isScanActive ? "#ea580c" : "#0284c7"};
                border: 1px solid ${this.pointManager.isScanActive ? "#ea580c" : "#0284c7"};
                color: white;
                font-size: 11px;
                font-weight: 600;
                padding: 4px 10px;
                border-radius: 5px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 5px;
                transition: all 0.15s;
              ">
                <span>📥</span>
                <span id="lbl-scan-progress">${this.pointManager.isScanActive ? "Đang quét..." : "Tải Toàn Bộ Curpoint"}</span>
              </button>

              <!-- Toggle Xem Mây Điểm: Frame Này vs Gộp Toàn Track -->
              <div style="display: flex; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; padding: 2px;">
                <button id="btn-point-mode-single" style="
                  border: none;
                  background: ${!this.showAllPoints ? "#ffffff" : "transparent"};
                  color: ${!this.showAllPoints ? "#0284c7" : "#64748b"};
                  font-weight: ${!this.showAllPoints ? "bold" : "normal"};
                  padding: 3px 8px;
                  font-size: 10px;
                  border-radius: 4px;
                  cursor: pointer;
                ">Frame Này</button>

                <button id="btn-point-mode-all" style="
                  border: none;
                  background: ${this.showAllPoints ? "#059669" : "transparent"};
                  color: ${this.showAllPoints ? "white" : "#64748b"};
                  font-weight: ${this.showAllPoints ? "bold" : "normal"};
                  padding: 3px 8px;
                  font-size: 10px;
                  border-radius: 4px;
                  cursor: pointer;
                ">Show All Point Cloud (${this.pointManager.loadedFramesCount}f)</button>
              </div>
            </div>
          </div>

          <!-- Hàng 2: Dải phim cuộn ngang Filmstrip (Hiển thị tất cả các frame của ID đó) -->
          <div id="filmstrip-scroll-container" style="
            display: flex;
            gap: 6px;
            overflow-x: auto;
            padding: 4px 2px;
            scroll-behavior: smooth;
          ">
            ${filmstripCardsHtml}
          </div>
        </div>
      </div>
    `;
    }
    /**
     * Lấy dải 5 frames liên tiếp xung quanh frame đang chọn (Sliding Window)
     */
    getVisible5Frames(track2) {
      const sortedShapes = [...track2.shapes].sort((a, b) => a.frame - b.frame);
      const allFrames = sortedShapes.map((s) => s.frame);
      if (allFrames.length === 0) return [this.selectedFrame];
      if (allFrames.length <= 5) return allFrames;
      const curIdx = allFrames.indexOf(this.selectedFrame);
      const idx = curIdx >= 0 ? curIdx : 0;
      let startIdx = idx - 2;
      if (startIdx < 0) startIdx = 0;
      if (startIdx + 5 > allFrames.length) startIdx = Math.max(0, allFrames.length - 5);
      return allFrames.slice(startIdx, startIdx + 5);
    }
    /**
     * Khởi tạo và gắn component 5 Frames x 3 Ortho Viewports vào DOM
     */
    mountOrthoEditor(track2) {
      var _a;
      const mountEl = (_a = this.overlay) == null ? void 0 : _a.querySelector("#ortho-canvas-mount-point");
      if (!mountEl || !track2) return;
      if (this.orthoEditor) {
        this.orthoEditor.unmount();
        this.orthoEditor = null;
      }
      this.orthoEditor = new OrthoEditorPanel(
        (newBox, isLiveSync) => {
          this.handleBoxChangedFromOrtho(track2, newBox, isLiveSync);
        },
        (frame) => {
          this.selectFrame(frame);
        }
      );
      this.orthoEditor.mount(mountEl);
      this.updateOrthoEditorState(track2);
      this.preloadPointsForVisibleFrames(track2);
    }
    /**
     * Cập nhật Box và Point Cloud cho 5 Frames của OrthoEditor
     */
    updateOrthoEditorState(track2) {
      if (!this.orthoEditor || !track2) return;
      const visibleFrames = this.getVisible5Frames(track2);
      const framesData = visibleFrames.map((f) => {
        const pos = track2.at(f);
        const box = pos ? pos.box : { c: [0, 0, 0], s: [4, 1.8, 1.5], r: [0, 0, 0] };
        const keyframe = pos ? pos.keyframe : false;
        const outside = pos ? pos.outside : false;
        let points = null;
        if (this.showAllPoints) {
          points = this.pointManager.getAccumulatedPoints(f, box);
        } else {
          points = this.pointManager.getFramePoints(f);
        }
        return {
          frame: f,
          box,
          keyframe,
          outside,
          labelColor: track2.labelColor,
          points
        };
      });
      this.orthoEditor.setFrames(framesData, this.selectedFrame);
    }
    /**
     * Tự động tải trước mây điểm cho toàn bộ 5 frames đang hiển thị
     */
    async preloadPointsForVisibleFrames(track2) {
      const visibleFrames = this.getVisible5Frames(track2);
      let hasNewPoints = false;
      for (const f of visibleFrames) {
        if (!this.pointManager.hasFrame(f)) {
          const pos = track2.at(f);
          if (pos && !pos.outside) {
            try {
              const diag = Math.hypot(pos.box.s[0], pos.box.s[1]);
              const radius = Math.max(3.5, diag / 2 + 1.2);
              const pts = await CVATBridge.getRoiLidarPoints(pos.box.c, radius, 15e3);
              if (pts && pts.length > 0) {
                this.pointManager.setFramePoints(f, pts, pos.box);
                hasNewPoints = true;
              }
            } catch (e) {
              console.warn(`[CVAT 3D Studio] Không thể tải điểm frame #${f}:`, e);
            }
          }
        }
      }
      if (hasNewPoints) {
        this.updateOrthoEditorState(track2);
      }
    }
    /**
     * Tự động tải mây điểm cho frame hiện tại nếu chưa có trong cache
     */
    async loadPointsForCurrentFrame() {
      if (!this.store) return;
      const track2 = this.store.getTrack(this.activeTrackId);
      if (!track2) return;
      await this.preloadPointsForVisibleFrames(track2);
    }
    /**
     * Xử lý khi người dùng tương tác kéo chuột chỉnh box trên Ortho Canvas (In-Memory Only)
     */
    handleBoxChangedFromOrtho(track2, newBox, isLiveSync) {
      const f = this.selectedFrame;
      if (isLiveSync) {
        track2.setBox(f, newBox);
        this.updateSidebarInputs(newBox);
      } else {
        track2.snapshot();
        if (this.applyToAllFrames) {
          this.applySizeToWholeTrack(track2.uiId, [newBox.s[0], newBox.s[1], newBox.s[2]]);
        } else {
          track2.setBox(f, newBox);
        }
        track2.dirty = true;
        this.updateHeaderDirtyState();
        this.updateOrthoEditorState(track2);
      }
    }
    updateSidebarInputs(box) {
      var _a, _b, _c, _d, _e, _f, _g;
      const inpX = (_a = this.overlay) == null ? void 0 : _a.querySelector("#input-center-x");
      const inpY = (_b = this.overlay) == null ? void 0 : _b.querySelector("#input-center-y");
      const inpZ = (_c = this.overlay) == null ? void 0 : _c.querySelector("#input-center-z");
      const inpL = (_d = this.overlay) == null ? void 0 : _d.querySelector("#input-dim-l");
      const inpW = (_e = this.overlay) == null ? void 0 : _e.querySelector("#input-dim-w");
      const inpH = (_f = this.overlay) == null ? void 0 : _f.querySelector("#input-dim-h");
      const inpYaw = (_g = this.overlay) == null ? void 0 : _g.querySelector("#input-dim-yaw");
      if (inpX) inpX.value = box.c[0].toFixed(2);
      if (inpY) inpY.value = box.c[1].toFixed(2);
      if (inpZ) inpZ.value = box.c[2].toFixed(2);
      if (inpL) inpL.value = box.s[0].toFixed(2);
      if (inpW) inpW.value = box.s[1].toFixed(2);
      if (inpH) inpH.value = box.s[2].toFixed(2);
      if (inpYaw) inpYaw.value = String(Math.round(box.r[2] * 180 / Math.PI));
    }
    updateHeaderDirtyState() {
      var _a;
      if (!this.store) return;
      const dirtyCount = this.store.getDirtyTracks().length;
      const btn = (_a = this.overlay) == null ? void 0 : _a.querySelector("#btn-studio-commit-save");
      if (btn) {
        btn.style.background = dirtyCount > 0 ? "#ea580c" : "#059669";
        btn.style.borderColor = dirtyCount > 0 ? "#ea580c" : "#059669";
        const span = btn.querySelector("span:nth-child(2)");
        if (span) {
          span.textContent = dirtyCount > 0 ? `Lưu vào CVAT (${dirtyCount} track)` : "Lưu vào CVAT";
        }
      }
    }
    attachActiveTrackListeners(track2) {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n;
      if (!this.overlay || !track2 || !this.store || !((_a = this.currentCtx) == null ? void 0 : _a.jobId)) return;
      this.currentCtx.jobId;
      this.overlay.querySelectorAll(".filmstrip-card").forEach((card) => {
        card.addEventListener("click", () => {
          const f = parseInt(card.dataset.frame || "0", 10);
          this.selectFrame(f);
        });
      });
      const slider = this.overlay.querySelector("#timeline-slider");
      slider == null ? void 0 : slider.addEventListener("input", (e) => {
        const f = parseInt(e.target.value, 10);
        this.selectFrame(f, false);
      });
      (_b = this.overlay.querySelector("#btn-timeline-prev5")) == null ? void 0 : _b.addEventListener("click", () => {
        this.stepFrame(-5);
      });
      (_c = this.overlay.querySelector("#btn-timeline-prev")) == null ? void 0 : _c.addEventListener("click", () => {
        this.stepFrame(-1);
      });
      (_d = this.overlay.querySelector("#btn-timeline-next")) == null ? void 0 : _d.addEventListener("click", () => {
        this.stepFrame(1);
      });
      (_e = this.overlay.querySelector("#btn-timeline-next5")) == null ? void 0 : _e.addEventListener("click", () => {
        this.stepFrame(5);
      });
      (_f = this.overlay.querySelector("#btn-timeline-play")) == null ? void 0 : _f.addEventListener("click", () => {
        this.togglePlayback();
      });
      const btnScan = this.overlay.querySelector("#btn-scan-all-curpoints");
      btnScan == null ? void 0 : btnScan.addEventListener("click", () => {
        var _a2;
        if (this.pointManager.isScanActive) {
          this.pointManager.abortScan();
          return;
        }
        const lbl = (_a2 = this.overlay) == null ? void 0 : _a2.querySelector("#lbl-scan-progress");
        this.pointManager.scanTrackCurpoints(
          track2,
          (cur, total, f) => {
            if (lbl) lbl.textContent = `Đang tải: f#${f} (${cur}/${total})... [Hủy]`;
            this.selectedFrame = f;
            this.updateOrthoEditorState(track2);
          },
          (success, count) => {
            if (lbl) lbl.textContent = success ? `Đã tải ${count} frames!` : "Tải Toàn Bộ Curpoint";
            if (success) {
              this.showAllPoints = true;
              this.updatePointModeButtons();
              this.updateOrthoEditorState(track2);
            }
          }
        );
      });
      (_g = this.overlay.querySelector("#btn-point-mode-single")) == null ? void 0 : _g.addEventListener("click", () => {
        this.showAllPoints = false;
        this.updatePointModeButtons();
        this.updateOrthoEditorState(track2);
      });
      (_h = this.overlay.querySelector("#btn-point-mode-all")) == null ? void 0 : _h.addEventListener("click", () => {
        this.showAllPoints = true;
        this.updatePointModeButtons();
        this.updateOrthoEditorState(track2);
      });
      const chkAll = this.overlay.querySelector("#chk-apply-all-frames");
      chkAll == null ? void 0 : chkAll.addEventListener("change", (e) => {
        this.applyToAllFrames = e.target.checked;
      });
      const handleInputBoxChange = () => {
        var _a2, _b2, _c2, _d2, _e2, _f2, _g2, _h2, _i2, _j2, _k2, _l2, _m2, _n2, _o;
        const inpX = parseFloat(((_b2 = (_a2 = this.overlay) == null ? void 0 : _a2.querySelector("#input-center-x")) == null ? void 0 : _b2.value) || "0");
        const inpY = parseFloat(((_d2 = (_c2 = this.overlay) == null ? void 0 : _c2.querySelector("#input-center-y")) == null ? void 0 : _d2.value) || "0");
        const inpZ = parseFloat(((_f2 = (_e2 = this.overlay) == null ? void 0 : _e2.querySelector("#input-center-z")) == null ? void 0 : _f2.value) || "0");
        const inpL = parseFloat(((_h2 = (_g2 = this.overlay) == null ? void 0 : _g2.querySelector("#input-dim-l")) == null ? void 0 : _h2.value) || "0");
        const inpW = parseFloat(((_j2 = (_i2 = this.overlay) == null ? void 0 : _i2.querySelector("#input-dim-w")) == null ? void 0 : _j2.value) || "0");
        const inpH = parseFloat(((_l2 = (_k2 = this.overlay) == null ? void 0 : _k2.querySelector("#input-dim-h")) == null ? void 0 : _l2.value) || "0");
        const inpYaw = parseFloat(((_n2 = (_m2 = this.overlay) == null ? void 0 : _m2.querySelector("#input-dim-yaw")) == null ? void 0 : _n2.value) || "0");
        if (inpL > 0 && inpW > 0 && inpH > 0) {
          const curBox = (_o = track2.at(this.selectedFrame)) == null ? void 0 : _o.box;
          const newBox = {
            c: [inpX, inpY, inpZ],
            s: [inpL, inpW, inpH],
            r: curBox ? [curBox.r[0], curBox.r[1], inpYaw * Math.PI / 180] : [0, 0, inpYaw * Math.PI / 180]
          };
          this.handleBoxChangedFromOrtho(track2, newBox, false);
          this.updateOrthoEditorState(track2);
        }
      };
      [
        "#input-center-x",
        "#input-center-y",
        "#input-center-z",
        "#input-dim-l",
        "#input-dim-w",
        "#input-dim-h",
        "#input-dim-yaw"
      ].forEach((id) => {
        var _a2, _b2;
        (_b2 = (_a2 = this.overlay) == null ? void 0 : _a2.querySelector(id)) == null ? void 0 : _b2.addEventListener("change", handleInputBoxChange);
      });
      this.overlay.querySelectorAll(".btn-step-move").forEach((btn) => {
        btn.addEventListener("click", () => {
          const axis = btn.dataset.axis;
          const val = parseFloat(btn.dataset.val || "0");
          const curPos = track2.at(this.selectedFrame);
          if (!curPos) return;
          const newBox = cloneBox(curPos.box);
          if (axis === "x") newBox.c[0] += val;
          else if (axis === "y") newBox.c[1] += val;
          else if (axis === "z") newBox.c[2] += val;
          this.handleBoxChangedFromOrtho(track2, newBox, false);
          this.updateOrthoEditorState(track2);
          this.updateSidebarInputs(newBox);
        });
      });
      (_i = this.overlay.querySelector("#btn-fit-top")) == null ? void 0 : _i.addEventListener("click", () => {
        this.executeInMemoryFit("top");
      });
      (_j = this.overlay.querySelector("#btn-fit-side")) == null ? void 0 : _j.addEventListener("click", () => {
        this.executeInMemoryFit("side");
      });
      (_k = this.overlay.querySelector("#btn-fit-front")) == null ? void 0 : _k.addEventListener("click", () => {
        this.executeInMemoryFit("front");
      });
      (_l = this.overlay.querySelector("#btn-fit-ground")) == null ? void 0 : _l.addEventListener("click", () => {
        this.executeInMemoryGroundSnap();
      });
      (_m = this.overlay.querySelector("#btn-fit-flip-180")) == null ? void 0 : _m.addEventListener("click", () => {
        this.executeInMemoryFlip180();
      });
      (_n = this.overlay.querySelector("#btn-toggle-outside-cur")) == null ? void 0 : _n.addEventListener("click", () => {
        this.toggleOutsideFrame(this.selectedFrame);
      });
    }
    /**
     * Chạy thuật toán Auto-Fit (TOP, SIDE, FRONT) trực tiếp In-Memory (Không ghi đè sang CVAT)
     */
    executeInMemoryFit(step) {
      if (!this.store) return;
      const track2 = this.store.getTrack(this.activeTrackId);
      if (!track2) return;
      const curPos = track2.at(this.selectedFrame);
      if (!curPos) return;
      const b = curPos.box;
      const ptsArr = this.showAllPoints ? this.pointManager.getAccumulatedPoints(this.selectedFrame, b) : this.pointManager.getFramePoints(this.selectedFrame);
      const pts = ptsArr ? float32ToVec3Array(ptsArr) : [];
      if (pts.length > 0) {
        track2.snapshot();
        const fitRes = fitBoxToEgoRayAndGround(
          pts,
          b.c[0],
          b.c[1],
          b.c[2],
          b.r[2],
          b.s[0],
          b.s[1],
          b.s[2],
          { x: 0, y: 0 },
          { fitStep: step, preserveDimensions: true }
        );
        const newBox = {
          c: [fitRes.newCenterX, fitRes.newCenterY, fitRes.newCenterZ],
          s: [fitRes.newL, fitRes.newW, fitRes.newH],
          r: [b.r[0], b.r[1], fitRes.newYaw]
        };
        if (this.applyToAllFrames) {
          this.applySizeToWholeTrack(track2.uiId, [newBox.s[0], newBox.s[1], newBox.s[2]]);
        } else {
          track2.setBox(this.selectedFrame, newBox);
        }
        track2.dirty = true;
        this.updateSidebarInputs(newBox);
        this.updateOrthoEditorState(track2);
        this.updateHeaderDirtyState();
      }
    }
    /**
     * Ghim đáy xe bám sát mặt đất In-Memory theo Footprint Ground Snap (Fallback Ego Z 0° nếu ít điểm)
     */
    executeInMemoryGroundSnap() {
      if (!this.store) return;
      const track2 = this.store.getTrack(this.activeTrackId);
      if (!track2) return;
      const curPos = track2.at(this.selectedFrame);
      if (!curPos) return;
      const b = curPos.box;
      const ptsArr = this.pointManager.getFramePoints(this.selectedFrame);
      const pts = ptsArr ? float32ToVec3Array(ptsArr) : [];
      track2.snapshot();
      const groundRes = computeGroundSlopesAndZ(
        pts,
        b.c[0],
        b.c[1],
        b.c[2],
        b.r[2],
        b.s[0] / 2,
        b.s[1] / 2
      );
      const baseZ = groundRes.groundZ !== null ? groundRes.groundZ : -1.75;
      const newBox = cloneBox(b);
      newBox.r[0] = groundRes.rollRad;
      newBox.r[1] = groundRes.pitchRad;
      newBox.c[2] = Number(
        (baseZ + b.s[2] / 2 * Math.cos(groundRes.pitchRad) * Math.cos(groundRes.rollRad)).toFixed(3)
      );
      track2.setBox(this.selectedFrame, newBox);
      track2.dirty = true;
      this.updateSidebarInputs(newBox);
      this.updateOrthoEditorState(track2);
      this.updateHeaderDirtyState();
    }
    /**
     * Lật ngược đầu xe 180° In-Memory quanh trục Z
     */
    executeInMemoryFlip180() {
      if (!this.store) return;
      const track2 = this.store.getTrack(this.activeTrackId);
      if (!track2) return;
      const curPos = track2.at(this.selectedFrame);
      if (!curPos) return;
      track2.snapshot();
      const rotated = rotateLocal(curPos.box, 0, 0);
      track2.setBox(this.selectedFrame, rotated);
      track2.dirty = true;
      this.updateSidebarInputs(rotated);
      this.updateOrthoEditorState(track2);
      this.updateHeaderDirtyState();
    }
    updatePointModeButtons() {
      var _a, _b;
      const btnSingle = (_a = this.overlay) == null ? void 0 : _a.querySelector("#btn-point-mode-single");
      const btnAll = (_b = this.overlay) == null ? void 0 : _b.querySelector("#btn-point-mode-all");
      if (btnSingle && btnAll) {
        btnSingle.style.background = !this.showAllPoints ? "#ffffff" : "transparent";
        btnSingle.style.color = !this.showAllPoints ? "#0284c7" : "#64748b";
        btnSingle.style.fontWeight = !this.showAllPoints ? "bold" : "normal";
        btnAll.style.background = this.showAllPoints ? "#059669" : "transparent";
        btnAll.style.color = this.showAllPoints ? "white" : "#64748b";
        btnAll.style.fontWeight = this.showAllPoints ? "bold" : "normal";
        btnAll.textContent = `Show All Point Cloud (${this.pointManager.loadedFramesCount}f)`;
      }
    }
    async selectFrame(f, updateSlider = true) {
      var _a, _b;
      if (this.selectedFrame === f) return;
      this.selectedFrame = f;
      this.jumpToCVATFrame(f);
      if (updateSlider) {
        const slider = (_a = this.overlay) == null ? void 0 : _a.querySelector("#timeline-slider");
        if (slider) slider.value = String(f);
      }
      (_b = this.overlay) == null ? void 0 : _b.querySelectorAll(".filmstrip-card").forEach((c) => {
        const cardF = parseInt(c.dataset.frame || "-1", 10);
        if (cardF === f) {
          c.classList.add("active");
          c.style.borderColor = "#2563eb";
          c.style.background = "#eff6ff";
          c.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        } else {
          c.classList.remove("active");
          c.style.borderColor = "#cbd5e1";
          c.style.background = "#ffffff";
        }
      });
      if (!this.store) return;
      const track2 = this.store.getTrack(this.activeTrackId);
      if (!track2) return;
      const pos = track2.at(f);
      if (pos) {
        this.updateSidebarInputs(pos.box);
      }
      this.updateOrthoEditorState(track2);
      await this.preloadPointsForVisibleFrames(track2);
    }
    stepFrame(delta) {
      if (!this.store) return;
      const track2 = this.store.getTrack(this.activeTrackId);
      if (!track2 || track2.shapes.length === 0) return;
      const frames = track2.shapes.map((s) => s.frame).sort((a, b) => a - b);
      const curIdx = frames.indexOf(this.selectedFrame);
      if (curIdx >= 0) {
        const nextIdx = Math.max(0, Math.min(frames.length - 1, curIdx + delta));
        this.selectFrame(frames[nextIdx]);
      } else {
        this.selectFrame(frames[0]);
      }
    }
    togglePlayback() {
      if (this.isPlaying) {
        this.stopPlayback();
      } else {
        this.startPlayback();
      }
    }
    startPlayback() {
      var _a;
      this.isPlaying = true;
      const btn = (_a = this.overlay) == null ? void 0 : _a.querySelector("#btn-timeline-play");
      if (btn) btn.textContent = "❚❚ Pause";
      this.playInterval = setInterval(() => {
        if (!this.store) return;
        const track2 = this.store.getTrack(this.activeTrackId);
        if (!track2 || track2.shapes.length === 0) return;
        const frames = track2.shapes.map((s) => s.frame).sort((a, b) => a - b);
        const curIdx = frames.indexOf(this.selectedFrame);
        const nextIdx = curIdx + 1 >= frames.length ? 0 : curIdx + 1;
        this.selectFrame(frames[nextIdx]);
      }, 250);
    }
    stopPlayback() {
      var _a;
      this.isPlaying = false;
      if (this.playInterval) {
        clearInterval(this.playInterval);
        this.playInterval = null;
      }
      const btn = (_a = this.overlay) == null ? void 0 : _a.querySelector("#btn-timeline-play");
      if (btn) btn.textContent = "▶ Play";
    }
    async refreshCurrentFrameAfterFit() {
      var _a;
      if (!((_a = this.currentCtx) == null ? void 0 : _a.jobId)) return;
      await this.loadInitialData();
    }
    // =========================================================================
    // TAB 1: BATCH SIZE MANAGER
    // =========================================================================
    renderBatchAllHtml(allTracks) {
      const rowsHtml = allTracks.map((t) => {
        const sizes = t.shapes.map((s) => s.points.slice(6, 9));
        const medL = this.median(sizes.map((s) => s[0]));
        const medW = this.median(sizes.map((s) => s[1]));
        const medH = this.median(sizes.map((s) => s[2]));
        return `
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px 14px; font-weight: bold;">
              <span style="color: ${t.labelColor};">#${t.uiId}</span> · ${t.labelName}
            </td>
            <td style="padding: 10px 14px; font-family: monospace;">${t.firstFrame} ➔ ${t.lastFrame} (${t.shapes.length}f)</td>
            <td style="padding: 10px 14px; font-family: monospace; font-weight: bold; color: #0284c7;">
              ${medL.toFixed(2)} × ${medW.toFixed(2)} × ${medH.toFixed(2)}m
            </td>
            <td style="padding: 10px 14px; text-align: right;">
              <button class="btn-jump-track-studio" data-tid="${t.uiId}" style="
                background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 4px; cursor: pointer;
              ">Mở Studio ➔</button>
            </td>
          </tr>
        `;
      }).join("");
      return `
      <div style="flex: 1; overflow: auto; padding: 16px 20px; background: #ffffff;">
        <h3 style="margin: 0 0 12px 0; font-size: 14px; color: #09090b;">Danh Sách Kích Thước Tất Cả Track Trong Job</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
          <thead>
            <tr style="border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 11px; background: #f8fafc;">
              <th style="padding: 8px 14px;">Track ID & Nhãn</th>
              <th style="padding: 8px 14px;">Vòng Đời Frames</th>
              <th style="padding: 8px 14px;">Kích Thước Trung Vị (L × W × H)</th>
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
    attachBatchAllListeners() {
      if (!this.overlay) return;
      this.overlay.querySelectorAll(".btn-jump-track-studio").forEach((btn) => {
        btn.addEventListener("click", () => {
          const tid = parseInt(btn.dataset.tid || "0", 10);
          if (tid) this.switchActiveTrack(tid);
        });
      });
    }
    // =========================================================================
    // CÁC HÀM ĐIỀU HƯỚNG & HỖ TRỢ TOÀN CỤC
    // =========================================================================
    attachHeaderListeners() {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i;
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
      (_f = this.overlay.querySelector("#btn-studio-undo")) == null ? void 0 : _f.addEventListener("click", () => {
        this.triggerUndo();
      });
      (_g = this.overlay.querySelector("#btn-studio-redo")) == null ? void 0 : _g.addEventListener("click", () => {
        this.triggerRedo();
      });
      (_h = this.overlay.querySelector("#btn-studio-close")) == null ? void 0 : _h.addEventListener("click", () => {
        this.close();
      });
      (_i = this.overlay.querySelector("#btn-studio-commit-save")) == null ? void 0 : _i.addEventListener("click", () => {
        this.triggerCommitSave();
      });
    }
    triggerUndo() {
      if (!this.store) return;
      const track2 = this.store.getTrack(this.activeTrackId);
      if (track2 && track2.undo()) {
        track2.dirty = true;
        this.render();
        this.updateHeaderDirtyState();
      }
    }
    triggerRedo() {
      if (!this.store) return;
      const track2 = this.store.getTrack(this.activeTrackId);
      if (track2 && track2.redo()) {
        track2.dirty = true;
        this.render();
        this.updateHeaderDirtyState();
      }
    }
    switchActiveTrack(newTrackId) {
      this.stopPlayback();
      this.activeTrackId = newTrackId;
      this.pointManager.setActiveTrack(newTrackId);
      this.currentTab = "active_track";
      if (this.store) {
        const track2 = this.store.getTrack(newTrackId);
        if (track2 && track2.shapes.length > 0) {
          this.selectedFrame = track2.shapes[0].frame;
        }
      }
      this.render();
      this.loadPointsForCurrentFrame();
    }
    switchPrevTrack() {
      if (!this.store) return;
      const tracks = this.store.getAllTracks();
      const idx = tracks.findIndex((t) => t.uiId === this.activeTrackId);
      if (idx > 0) {
        this.switchActiveTrack(tracks[idx - 1].uiId);
      }
    }
    switchNextTrack() {
      if (!this.store) return;
      const tracks = this.store.getAllTracks();
      const idx = tracks.findIndex((t) => t.uiId === this.activeTrackId);
      if (idx >= 0 && idx < tracks.length - 1) {
        this.switchActiveTrack(tracks[idx + 1].uiId);
      }
    }
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
    toggleOutsideFrame(frame) {
      if (!this.store) return;
      const track2 = this.store.getTrack(this.activeTrackId);
      if (!track2) return;
      const sh = track2.shapes.find((s) => s.frame === frame);
      if (sh) {
        track2.snapshot();
        sh.outside = !sh.outside;
        track2.dirty = true;
        this.render();
      }
    }
    applySizeToWholeTrack(trackId, newSize) {
      var _a, _b;
      if (!this.store || !((_a = this.currentCtx) == null ? void 0 : _a.jobId)) return;
      const track2 = this.store.getTrack(trackId);
      if (!track2) return;
      for (const sh of track2.shapes) {
        if (!sh.outside) {
          const curBox = (_b = track2.at(sh.frame)) == null ? void 0 : _b.box;
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
      track2.dirty = true;
      this.updateHeaderDirtyState();
      this.updateOrthoEditorState(track2);
    }
    async triggerCommitSave() {
      var _a;
      if (!((_a = this.currentCtx) == null ? void 0 : _a.jobId) || !this.store || this.isSaving) return;
      this.isSaving = true;
      this.updateHeaderDirtyState();
      try {
        const dirtyTracks = this.store.getDirtyTracks();
        for (const track2 of dirtyTracks) {
          for (const sh of track2.shapes) {
            if (!sh.outside && sh.points) {
              await CVATBridge.updateLiveBox(
                this.currentCtx.jobId,
                sh.frame,
                track2.uiId,
                track2.serverId,
                sh.points,
                true
              );
            }
          }
        }
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
        this.updateHeaderDirtyState();
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
  const DEFAULT_VINFAST_ADAS_CAMERAS = [
    // 0: CAM_FRONT (Trước chính diện)
    {
      id: 0,
      name: "CAM_FRONT",
      imageWidth: 1920,
      imageHeight: 1080,
      distortionModel: "radtan",
      intrinsics: {
        fx: 1250,
        fy: 1250,
        cx: 960,
        cy: 540,
        k1: -0.12,
        k2: 0.03,
        p1: 5e-4,
        p2: -5e-4,
        k3: 0
      },
      extrinsics: {
        // Camera nhìn thẳng về phía trước X: X_cam = -Y_lidar, Y_cam = -Z_lidar, Z_cam = X_lidar
        rotation: [
          0,
          -1,
          0,
          0,
          0,
          -1,
          1,
          0,
          0
        ],
        translation: [1.8, 0, 1.4]
        // Đặt tại kính lái trước
      }
    },
    // 1: CAM_FRONT_LEFT (Trước góc chéo trái ~45°)
    {
      id: 1,
      name: "CAM_FRONT_LEFT",
      imageWidth: 1920,
      imageHeight: 1080,
      distortionModel: "radtan",
      intrinsics: {
        fx: 1100,
        fy: 1100,
        cx: 960,
        cy: 540,
        k1: -0.14,
        k2: 0.04,
        p1: 8e-4,
        p2: -8e-4
      },
      extrinsics: {
        // Quay sang trái 45°: cos(45) ~ 0.7071
        rotation: [
          0.7071,
          -0.7071,
          0,
          0,
          0,
          -1,
          0.7071,
          0.7071,
          0
        ],
        translation: [1.6, 0.7, 1.3]
      }
    },
    // 2: CAM_FRONT_RIGHT (Trước góc chéo phải ~45°)
    {
      id: 2,
      name: "CAM_FRONT_RIGHT",
      imageWidth: 1920,
      imageHeight: 1080,
      distortionModel: "radtan",
      intrinsics: {
        fx: 1100,
        fy: 1100,
        cx: 960,
        cy: 540,
        k1: -0.14,
        k2: 0.04,
        p1: 8e-4,
        p2: -8e-4
      },
      extrinsics: {
        // Quay sang phải 45°
        rotation: [
          -0.7071,
          -0.7071,
          0,
          0,
          0,
          -1,
          0.7071,
          -0.7071,
          0
        ],
        translation: [1.6, -0.7, 1.3]
      }
    },
    // 3: CAM_SIDE_LEFT (Gương sườn trái 90° - Mắt cá Fisheye)
    {
      id: 3,
      name: "CAM_SIDE_LEFT",
      imageWidth: 1920,
      imageHeight: 1080,
      distortionModel: "fisheye",
      intrinsics: {
        fx: 850,
        fy: 850,
        cx: 960,
        cy: 540,
        k1: 0.04,
        k2: -0.015,
        k3: 3e-3,
        k4: -5e-4
      },
      extrinsics: {
        // Nhìn ngang sang trái 90°
        rotation: [
          1,
          0,
          0,
          0,
          0,
          -1,
          0,
          1,
          0
        ],
        translation: [0.5, 0.95, 1.1]
      }
    },
    // 4: CAM_SIDE_RIGHT (Gương sườn phải 90° - Mắt cá Fisheye)
    {
      id: 4,
      name: "CAM_SIDE_RIGHT",
      imageWidth: 1920,
      imageHeight: 1080,
      distortionModel: "fisheye",
      intrinsics: {
        fx: 850,
        fy: 850,
        cx: 960,
        cy: 540,
        k1: 0.04,
        k2: -0.015,
        k3: 3e-3,
        k4: -5e-4
      },
      extrinsics: {
        // Nhìn ngang sang phải 90°
        rotation: [
          -1,
          0,
          0,
          0,
          0,
          -1,
          0,
          -1,
          0
        ],
        translation: [0.5, -0.95, 1.1]
      }
    },
    // 5: CAM_BACK_LEFT (Sau góc chéo trái ~135°)
    {
      id: 5,
      name: "CAM_BACK_LEFT",
      imageWidth: 1920,
      imageHeight: 1080,
      distortionModel: "radtan",
      intrinsics: {
        fx: 1100,
        fy: 1100,
        cx: 960,
        cy: 540,
        k1: -0.14,
        k2: 0.04
      },
      extrinsics: {
        rotation: [
          0.7071,
          0.7071,
          0,
          0,
          0,
          -1,
          -0.7071,
          0.7071,
          0
        ],
        translation: [-1.2, 0.7, 1.2]
      }
    },
    // 6: CAM_BACK_RIGHT (Sau góc chéo phải ~135°)
    {
      id: 6,
      name: "CAM_BACK_RIGHT",
      imageWidth: 1920,
      imageHeight: 1080,
      distortionModel: "radtan",
      intrinsics: {
        fx: 1100,
        fy: 1100,
        cx: 960,
        cy: 540,
        k1: -0.14,
        k2: 0.04
      },
      extrinsics: {
        rotation: [
          -0.7071,
          0.7071,
          0,
          0,
          0,
          -1,
          -0.7071,
          -0.7071,
          0
        ],
        translation: [-1.2, -0.7, 1.2]
      }
    },
    // 7: CAM_BACK (Đuôi xe chính diện - Camera lùi)
    {
      id: 7,
      name: "CAM_BACK",
      imageWidth: 1920,
      imageHeight: 1080,
      distortionModel: "fisheye",
      intrinsics: {
        fx: 800,
        fy: 800,
        cx: 960,
        cy: 540,
        k1: 0.05,
        k2: -0.02,
        k3: 4e-3,
        k4: -6e-4
      },
      extrinsics: {
        // Nhìn thẳng về phía sau -X
        rotation: [
          0,
          1,
          0,
          0,
          0,
          -1,
          -1,
          0,
          0
        ],
        translation: [-1.8, 0, 1.2]
      }
    }
  ];
  function validateCameraConfig(config) {
    if (!config || typeof config !== "object") {
      return { isValid: false, error: "Cấu hình camera phải là một đối tượng JSON" };
    }
    if (typeof config.id !== "number") {
      return { isValid: false, error: "Thiếu hoặc sai trường 'id' (phải là số từ 0 đến 7)" };
    }
    if (!config.name || typeof config.name !== "string") {
      return { isValid: false, error: `Camera ${config.id}: Thiếu hoặc sai trường 'name'` };
    }
    const intr = config.intrinsics;
    if (!intr || typeof intr.fx !== "number" || typeof intr.fy !== "number" || typeof intr.cx !== "number" || typeof intr.cy !== "number") {
      return { isValid: false, error: `Camera ${config.name}: Thiếu hoặc sai thông số Intrinsics (fx, fy, cx, cy)` };
    }
    const extr = config.extrinsics;
    if (!extr || !Array.isArray(extr.rotation) || extr.rotation.length !== 9 && extr.rotation.length !== 16) {
      return { isValid: false, error: `Camera ${config.name}: Extrinsics.rotation phải là mảng 9 hoặc 16 số` };
    }
    if (!Array.isArray(extr.translation) || extr.translation.length !== 3) {
      return { isValid: false, error: `Camera ${config.name}: Extrinsics.translation phải là mảng 3 số [tx, ty, tz]` };
    }
    return { isValid: true };
  }
  function parseCalibrationJSON(rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      const list = Array.isArray(parsed) ? parsed : parsed.cameras || [parsed];
      if (!Array.isArray(list) || list.length === 0) {
        return { configs: [], error: "Dữ liệu JSON không chứa danh sách camera hợp lệ" };
      }
      const configs = [];
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        const valid = validateCameraConfig(item);
        if (!valid.isValid) {
          return { configs: [], error: `Mục #${i}: ${valid.error}` };
        }
        configs.push({
          id: item.id,
          name: String(item.name),
          imageWidth: Number(item.imageWidth || 1920),
          imageHeight: Number(item.imageHeight || 1080),
          distortionModel: item.distortionModel === "radtan" || item.distortionModel === "fisheye" ? item.distortionModel : "none",
          intrinsics: {
            fx: Number(item.intrinsics.fx),
            fy: Number(item.intrinsics.fy),
            cx: Number(item.intrinsics.cx),
            cy: Number(item.intrinsics.cy),
            k1: item.intrinsics.k1 !== void 0 ? Number(item.intrinsics.k1) : void 0,
            k2: item.intrinsics.k2 !== void 0 ? Number(item.intrinsics.k2) : void 0,
            p1: item.intrinsics.p1 !== void 0 ? Number(item.intrinsics.p1) : void 0,
            p2: item.intrinsics.p2 !== void 0 ? Number(item.intrinsics.p2) : void 0,
            k3: item.intrinsics.k3 !== void 0 ? Number(item.intrinsics.k3) : void 0,
            k4: item.intrinsics.k4 !== void 0 ? Number(item.intrinsics.k4) : void 0
          },
          extrinsics: {
            rotation: item.extrinsics.rotation.map(Number),
            translation: [
              Number(item.extrinsics.translation[0]),
              Number(item.extrinsics.translation[1]),
              Number(item.extrinsics.translation[2])
            ]
          }
        });
      }
      return { configs };
    } catch (err) {
      return { configs: [], error: `Lỗi cú pháp JSON: ${err.message}` };
    }
  }
  function getStorageKey(taskId) {
    return taskId ? `CVAT_3D_SUITE_CALIB_TASK_${taskId}` : "CVAT_3D_SUITE_CALIB_DEFAULT";
  }
  function getActiveCameras(taskId) {
    try {
      if (typeof localStorage !== "undefined") {
        const saved = localStorage.getItem(getStorageKey(taskId));
        if (saved) {
          const { configs, error } = parseCalibrationJSON(saved);
          if (!error && configs.length > 0) {
            return configs;
          }
        }
      }
    } catch (e) {
      console.warn("[CVAT 3D Suite] Không thể đọc localStorage:", e);
    }
    return DEFAULT_VINFAST_ADAS_CAMERAS;
  }
  const NEAR_Z = 0.1;
  const EDGE_STEPS = 16;
  const D14_UNIT = [
    [0.5, -0.5, -0.5],
    [0.5, 0.5, -0.5],
    [-0.5, 0.5, -0.5],
    [-0.5, -0.5, -0.5],
    [0.5, -0.5, 0.5],
    [0.5, 0.5, 0.5],
    [-0.5, 0.5, 0.5],
    [-0.5, -0.5, 0.5]
  ];
  const D14_EDGES = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7]
  ];
  const FRONT_SET = /* @__PURE__ */ new Set(["0-1", "1-5", "5-4", "4-0", "1-0", "5-1", "4-5", "0-4"]);
  function eulerXYZ(rx, ry, rz) {
    const [cx, sx, cy, sy, cz, sz] = [
      Math.cos(rx),
      Math.sin(rx),
      Math.cos(ry),
      Math.sin(ry),
      Math.cos(rz),
      Math.sin(rz)
    ];
    return [
      [cy * cz, -cy * sz, sy],
      [sx * sy * cz + cx * sz, -sx * sy * sz + cx * cz, -sx * cy],
      [-cx * sy * cz + sx * sz, cx * sy * sz + sx * cz, cx * cy]
    ];
  }
  function d14BoxCorners(position, rotation, scale) {
    const R = eulerXYZ(rotation[0], rotation[1], rotation[2]);
    return D14_UNIT.map((u) => {
      const p = [u[0] * scale[0], u[1] * scale[1], u[2] * scale[2]];
      return [0, 1, 2].map((r) => R[r][0] * p[0] + R[r][1] * p[1] + R[r][2] * p[2] + position[r]);
    });
  }
  function d14Transform(p, T) {
    return [0, 1, 2].map((r) => T[r][0] * p[0] + T[r][1] * p[1] + T[r][2] * p[2] + T[r][3]);
  }
  function d14DistCoeffs(dist) {
    const d = [0, 0, 0, 0, 0];
    (dist || []).slice(0, 5).forEach((v, i) => {
      d[i] = Number(v);
    });
    return d;
  }
  function d14RadialFoldR2(dist) {
    const d = d14DistCoeffs(dist);
    const c = [1, 3 * d[0], 5 * d[1], 7 * d[4]];
    let deg2 = 3;
    while (deg2 > 0 && c[deg2] === 0) deg2 -= 1;
    if (deg2 === 0) return Infinity;
    const g = (s) => c[0] + s * (c[1] + s * (c[2] + s * c[3]));
    let top = 0;
    for (let i = 0; i < deg2; i += 1) top = Math.max(top, Math.abs(c[i]));
    const bound = 1 + top / Math.abs(c[deg2]);
    let crit = [];
    const [qa, qb, qc] = [3 * c[3], 2 * c[2], c[1]];
    if (qa !== 0) {
      const disc = qb * qb - 4 * qa * qc;
      if (disc >= 0) {
        const sq = Math.sqrt(disc);
        crit = [(-qb - sq) / (2 * qa), (-qb + sq) / (2 * qa)];
      }
    } else if (qb !== 0) {
      crit = [-qc / qb];
    }
    const knots = [0, bound, ...crit.filter((s) => s > 0 && s < bound)].sort((x, y) => x - y);
    for (let k = 0; k + 1 < knots.length; k += 1) {
      let [lo, hi] = [knots[k], knots[k + 1]];
      if (g(hi) > 0) continue;
      for (let it = 0; it < 200; it += 1) {
        const mid = 0.5 * (lo + hi);
        if (mid <= lo || mid >= hi) break;
        if (g(mid) > 0) lo = mid;
        else hi = mid;
      }
      return lo;
    }
    return Infinity;
  }
  function d14MaxR2(cam) {
    if (cam._foldR2 === void 0) cam._foldR2 = d14RadialFoldR2(cam.dist || []);
    return cam._foldR2;
  }
  function d14DistortToPixel(xn, yn, cam) {
    const [k1, k2, p1, p2, k3] = d14DistCoeffs(cam.dist);
    const r2 = xn * xn + yn * yn;
    const radial = 1 + k1 * r2 + k2 * r2 * r2 + k3 * r2 * r2 * r2;
    const xd = xn * radial + 2 * p1 * xn * yn + p2 * (r2 + 2 * xn * xn);
    const yd = yn * radial + p1 * (r2 + 2 * yn * yn) + 2 * p2 * xn * yn;
    return [cam.K[0][0] * xd + cam.K[0][2], cam.K[1][1] * yd + cam.K[1][2]];
  }
  function d14ClipEdgeView(a, b, m) {
    if (a[2] <= NEAR_Z && b[2] <= NEAR_Z) return null;
    let [t0, t1] = [0, 1];
    if (a[2] <= NEAR_Z || b[2] <= NEAR_Z) {
      const t = (NEAR_Z - a[2]) / (b[2] - a[2]);
      if (a[2] > NEAR_Z) t1 = t;
      else t0 = t;
    }
    if (m === Infinity) return [t0, t1];
    const [dx, dy, dz] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const qa = dx * dx + dy * dy - m * dz * dz;
    const qb = 2 * (a[0] * dx + a[1] * dy - m * a[2] * dz);
    const qc = a[0] * a[0] + a[1] * a[1] - m * a[2] * a[2];
    let roots = [];
    if (qa !== 0) {
      const disc = qb * qb - 4 * qa * qc;
      if (disc > 0) {
        const sq = Math.sqrt(disc);
        const h2 = qb >= 0 ? -0.5 * (qb + sq) : -0.5 * (qb - sq);
        roots = [h2 / qa, qc / h2];
      }
    } else if (qb !== 0) {
      roots = [-qc / qb];
    }
    const knots = [t0, t1, ...roots.filter((r) => r > t0 && r < t1)].sort((x, y) => x - y);
    const inside = [];
    for (let k = 0; k + 1 < knots.length; k += 1) {
      const mid = 0.5 * (knots[k] + knots[k + 1]);
      if ((qa * mid + qb) * mid + qc <= 0) inside.push([knots[k], knots[k + 1]]);
    }
    if (!inside.length || inside[inside.length - 1][1] <= inside[0][0]) return null;
    return [inside[0][0], inside[inside.length - 1][1]];
  }
  function d14EdgePolyline(a, b, cam) {
    const span = d14ClipEdgeView(a, b, d14MaxR2(cam));
    if (!span) return null;
    const [t0, t1] = span;
    const pts = [];
    for (let k = 0; k <= EDGE_STEPS; k += 1) {
      const t = t0 + (t1 - t0) * k / EDGE_STEPS;
      const p = [0, 1, 2].map((i) => a[i] + t * (b[i] - a[i]));
      pts.push(d14DistortToPixel(p[0] / p[2], p[1] / p[2], cam));
    }
    return pts;
  }
  let storedVinCalib = null;
  function setVinCalibForOverlay(calib) {
    storedVinCalib = calib;
  }
  function getStoredVinCalib() {
    return storedVinCalib;
  }
  const VIN_CAMERA_NAME_MAP = {
    // id=1 (CAM_FRONT_LEFT slot) chứa image_1 = CAM_P_F (đã xác nhận từ Day14 config)
    "CAM_FRONT_LEFT": "CAM_P_F"
    // Các camera khác chưa có calibration → KHÔNG map → không vẽ wireframe
    // Khi có thêm calibration, thêm mapping vào đây:
    // "CAM_FRONT": "CAM_P_??",         // image_0
    // "CAM_FRONT_RIGHT": "CAM_P_FR",   // image_2
    // "CAM_SIDE_LEFT": "CAM_P_SL",     // image_3
    // "CAM_SIDE_RIGHT": "CAM_P_SR",    // image_4
    // "CAM_BACK_LEFT": "CAM_P_BL",     // image_5
    // "CAM_BACK_RIGHT": "CAM_P_BR",    // image_6
    // "CAM_BACK": "CAM_P_B",           // image_7
  };
  function resolveVinCameraName(camName) {
    if (!storedVinCalib) return null;
    if (storedVinCalib.cameras[camName]) return camName;
    const mapped = VIN_CAMERA_NAME_MAP[camName];
    if (mapped && storedVinCalib.cameras[mapped]) return mapped;
    return null;
  }
  function renderDay14WireframeOnContext(ctx, canvasW, canvasH, box, cameraName) {
    if (!storedVinCalib) return false;
    const resolvedName = resolveVinCameraName(cameraName);
    if (!resolvedName) return false;
    const camCalib = storedVinCalib.cameras[resolvedName];
    if (!camCalib) return false;
    const cornersLidar = d14BoxCorners(box.c, box.r, box.s);
    console.log(`[Day14 Proj] cam=${cameraName}, pos=[${box.c.map((v) => v.toFixed(2))}], rot=[${box.r.map((v) => v.toFixed(3))}], scale=[${box.s.map((v) => v.toFixed(2))}]`);
    const cornersCam = cornersLidar.map((p) => {
      const ego = storedVinCalib.pcd_frame === "ego" ? p : d14Transform(p, storedVinCalib.lidar.sensor2ego);
      return d14Transform(ego, camCalib.ego2cam);
    });
    const [W, H] = camCalib.image_size;
    const maxR2 = d14MaxR2(camCalib);
    const projected = cornersCam.map((pc) => {
      const front = pc[2] > NEAR_Z;
      const z = front ? pc[2] : 1;
      const xn = pc[0] / z;
      const yn = pc[1] / z;
      const [u, v] = d14DistortToPixel(xn, yn, camCalib);
      return { u, v, valid: front && xn * xn + yn * yn <= maxR2 };
    });
    const inImage = projected.filter((q) => q.valid && q.u >= 0 && q.u < W && q.v >= 0 && q.v < H).length;
    console.log(`[Day14 Proj] → inImage=${inImage}/8, pixel[0]=(${projected[0].u.toFixed(0)}, ${projected[0].v.toFixed(0)})`);
    if (inImage === 0) return false;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const base = Math.max(2, W / 480);
    for (const [i, j] of D14_EDGES) {
      const pts = d14EdgePolyline(cornersCam[i], cornersCam[j], camCalib);
      if (!pts) continue;
      const isFrontEdge = FRONT_SET.has(`${i}-${j}`);
      ctx.lineWidth = isFrontEdge ? base * 2.5 : base * 1.5;
      ctx.strokeStyle = isFrontEdge ? "#ef4444" : "#22c55e";
      ctx.beginPath();
      pts.forEach(([u, v], k) => k ? ctx.lineTo(u, v) : ctx.moveTo(u, v));
      ctx.stroke();
    }
    ctx.fillStyle = "#ffffff";
    for (const q of projected) {
      if (q.valid && q.u >= 0 && q.u < W && q.v >= 0 && q.v < H) {
        ctx.beginPath();
        ctx.arc(q.u, q.v, base * 2, 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    const validPts = projected.filter((q) => q.valid && q.u >= 0 && q.u < W && q.v >= 0 && q.v < H);
    if (validPts.length >= 2) {
      const uMin = Math.min(...validPts.map((p) => p.u));
      const uMax = Math.max(...validPts.map((p) => p.u));
      const vMin = Math.min(...validPts.map((p) => p.v));
      const labelX = (uMin + uMax) / 2;
      const labelY = Math.max(30, vMin - 12);
      const text = `L:${box.s[0].toFixed(2)}m W:${box.s[1].toFixed(2)}m H:${box.s[2].toFixed(2)}m`;
      ctx.font = `bold ${Math.max(14, base * 5)}px -apple-system, BlinkMacSystemFont, sans-serif`;
      const textMetrics = ctx.measureText(text);
      const pad = 6;
      ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
      ctx.fillRect(labelX - textMetrics.width / 2 - pad, labelY - 16, textMetrics.width + 2 * pad, 24);
      ctx.fillStyle = "#facc15";
      ctx.textAlign = "center";
      ctx.fillText(text, labelX, labelY);
    }
    return true;
  }
  const _CameraOverlayManager = class _CameraOverlayManager {
    constructor() {
      __publicField(this, "container", null);
      __publicField(this, "isEnabled", true);
      __publicField(this, "isCollapsed", false);
      __publicField(this, "activeBox", null);
      __publicField(this, "activeCameras", []);
      __publicField(this, "viewports", /* @__PURE__ */ new Map());
      // Callback mở modal Focus
      __publicField(this, "onCameraFocusRequested");
      this.activeCameras = getActiveCameras();
    }
    static getInstance() {
      if (!_CameraOverlayManager.instance) {
        _CameraOverlayManager.instance = new _CameraOverlayManager();
      }
      return _CameraOverlayManager.instance;
    }
    /**
     * Khởi tạo HUD giao diện 8 Camera Thumbnail tại góc phải dưới màn hình CVAT
     */
    mount() {
      if (document.getElementById("cvat-3d-suite-camera-hud")) {
        return;
      }
      this.container = document.createElement("div");
      this.container.id = "cvat-3d-suite-camera-hud";
      this.container.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 360px;
      z-index: 9998;
      background: rgba(255, 255, 255, 0.96);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1px solid #e4e4e7;
      border-radius: 12px;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
      width: 480px;
      max-height: 420px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      transition: all 0.25s ease-in-out;
    `;
      this.container.innerHTML = `
      <!-- Header HUD -->
      <div style="
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        background: #f8fafc;
        border-bottom: 1px solid #f1f5f9;
        user-select: none;
      ">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="color: #0284c7; display: flex;">${ICONS.camera}</span>
          <span style="font-weight: 700; font-size: 12px; color: #0f172a;">Camera 2D Wireframe HUD</span>
          <span id="cvat-cam-hud-counter" style="
            font-size: 10px;
            font-weight: 600;
            color: #64748b;
            background: #e2e8f0;
            padding: 2px 6px;
            border-radius: 9999px;
          ">8 Cams</span>
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <button id="cvat-cam-hud-toggle-btn" title="Bật/Tắt Vẽ Khung 2D" style="
            background: #f1f5f9;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            cursor: pointer;
            padding: 3px 6px;
            display: flex;
            align-items: center;
            font-size: 11px;
            color: #334155;
          ">${ICONS.eye}</button>
          <button id="cvat-cam-hud-collapse-btn" title="Thu gọn/Mở rộng" style="
            background: transparent;
            border: none;
            cursor: pointer;
            padding: 2px;
            display: flex;
            color: #64748b;
          ">${ICONS.chevronDown}</button>
        </div>
      </div>

      <!-- Grid 8 Camera Views -->
      <div id="cvat-cam-hud-grid" style="
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 6px;
        padding: 8px;
        background: #09090b;
        overflow-y: auto;
        max-height: 360px;
      "></div>
    `;
      document.body.appendChild(this.container);
      console.log("[Camera HUD] mount() - HUD container đã append vào document.body, cameras:", this.activeCameras.length);
      this.buildCameraViewports();
      const collapseBtn = this.container.querySelector("#cvat-cam-hud-collapse-btn");
      const gridEl = this.container.querySelector("#cvat-cam-hud-grid");
      collapseBtn == null ? void 0 : collapseBtn.addEventListener("click", () => {
        this.isCollapsed = !this.isCollapsed;
        if (gridEl) {
          gridEl.style.display = this.isCollapsed ? "none" : "grid";
        }
        if (collapseBtn) {
          collapseBtn.innerHTML = this.isCollapsed ? ICONS.chevronUp : ICONS.chevronDown;
        }
      });
      const toggleBtn = this.container.querySelector("#cvat-cam-hud-toggle-btn");
      toggleBtn == null ? void 0 : toggleBtn.addEventListener("click", () => {
        this.isEnabled = !this.isEnabled;
        if (toggleBtn) {
          toggleBtn.innerHTML = this.isEnabled ? ICONS.eye : ICONS.eyeOff;
          toggleBtn.style.color = this.isEnabled ? "#0284c7" : "#94a3b8";
        }
        this.clearAllCanvases();
        if (this.isEnabled && this.activeBox) {
          this.renderBox(this.activeBox);
        }
      });
    }
    /**
     * Tạo 8 khung ảnh kèm canvas overlay
     */
    buildCameraViewports() {
      var _a;
      const grid = (_a = this.container) == null ? void 0 : _a.querySelector("#cvat-cam-hud-grid");
      if (!grid) return;
      grid.innerHTML = "";
      this.viewports.clear();
      for (const cam of this.activeCameras) {
        const card = document.createElement("div");
        card.className = "cvat-cam-card";
        card.id = `cvat-cam-card-${cam.id}`;
        card.title = `Click đúp để xem phóng to ${cam.name}`;
        card.style.cssText = `
        position: relative;
        background: #18181b;
        border: 2px solid #27272a;
        border-radius: 6px;
        overflow: hidden;
        cursor: pointer;
        aspect-ratio: 16 / 9;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease-in-out;
      `;
        const img = document.createElement("img");
        img.style.cssText = `
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      `;
        img.alt = cam.name;
        img.src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90" viewBox="0 0 160 90"><rect width="100%" height="100%" fill="%2327272a"/><text x="50%" y="50%" fill="%2371717a" font-size="10" font-family="sans-serif" dominant-baseline="middle" text-anchor="middle">${cam.name}</text></svg>`;
        const canvas = document.createElement("canvas");
        canvas.width = cam.imageWidth || 1920;
        canvas.height = cam.imageHeight || 1080;
        canvas.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
      `;
        const ctx = canvas.getContext("2d");
        const badge = document.createElement("span");
        badge.style.cssText = `
        position: absolute;
        top: 3px;
        left: 3px;
        font-size: 9px;
        font-weight: 700;
        padding: 1px 4px;
        border-radius: 4px;
        background: rgba(0, 0, 0, 0.75);
        color: #f1f5f9;
        pointer-events: none;
        letter-spacing: 0.3px;
      `;
        badge.innerText = cam.name;
        card.appendChild(img);
        card.appendChild(canvas);
        card.appendChild(badge);
        grid.appendChild(card);
        this.viewports.set(cam.id, {
          container: card,
          img,
          canvas,
          ctx,
          badge
        });
        card.addEventListener("click", () => {
          if (typeof this.onCameraFocusRequested === "function") {
            this.onCameraFocusRequested(cam.id, cam.name);
          }
        });
      }
    }
    /**
     * Lấy URL ảnh hiện tại của một camera (dùng để truyền sang FocusModal)
     */
    getCameraImageSrc(cameraId) {
      const vp = this.viewports.get(cameraId);
      if (vp && vp.img.src && !vp.img.src.startsWith("data:image/svg+xml")) {
        return vp.img.src;
      }
      return null;
    }
    /**
     * Cập nhật nguồn ảnh của Camera từ ImageElement hoặc URL
     */
    updateCameraImage(cameraId, imageSrc) {
      const vp = this.viewports.get(cameraId);
      if (vp && imageSrc) {
        vp.img.src = imageSrc;
        console.log(`[Camera HUD] updateCameraImage() cam=${cameraId}, src=${imageSrc.substring(0, 60)}...`);
      }
    }
    /**
     * Xóa sạch các nét vẽ trên toàn bộ 8 canvas
     */
    clearAllCanvases() {
      for (const vp of this.viewports.values()) {
        vp.ctx.clearRect(0, 0, vp.canvas.width, vp.canvas.height);
        vp.container.style.borderColor = "#27272a";
        vp.container.style.opacity = "1";
        vp.badge.style.background = "rgba(0, 0, 0, 0.75)";
        vp.badge.style.color = "#f1f5f9";
        vp.badge.innerText = vp.img.alt;
      }
    }
    /**
     * Vẽ khung dây 3D lên camera dùng CHÍNH XÁC engine Day14 overlay (đã chứng minh đúng với VinFast).
     * Pipeline: eulerXYZ → boxCorners → sensor2ego → ego2cam → distort+K → pixel
     */
    renderBox(box) {
      this.activeBox = box;
      if (!this.isEnabled) return;
      if (storedVinCalib) {
        this.renderBoxDay14(box);
        return;
      }
      for (const cam of this.activeCameras) {
        const vp = this.viewports.get(cam.id);
        if (!vp) continue;
        vp.ctx.clearRect(0, 0, vp.canvas.width, vp.canvas.height);
        vp.container.style.borderColor = "#27272a";
        vp.container.style.opacity = "0.35";
        vp.badge.innerText = cam.name + " (No calib)";
      }
    }
    /**
     * Render wireframe dùng chính xác Day14 projection pipeline (port từ d14-projection-overlay.js).
     * Delegate sang hàm dùng chung renderDay14WireframeOnContext() cho mỗi camera.
     */
    renderBoxDay14(box) {
      if (!storedVinCalib) return;
      for (const cam of this.activeCameras) {
        const vp = this.viewports.get(cam.id);
        if (!vp) continue;
        vp.ctx.clearRect(0, 0, vp.canvas.width, vp.canvas.height);
        const resolvedName = resolveVinCameraName(cam.name);
        if (!resolvedName) {
          vp.container.style.borderColor = "#27272a";
          vp.container.style.opacity = "0.35";
          vp.badge.innerText = cam.name;
          continue;
        }
        const camCalib = storedVinCalib.cameras[resolvedName];
        const isVisible = renderDay14WireframeOnContext(
          vp.ctx,
          vp.canvas.width,
          vp.canvas.height,
          box,
          cam.name
        );
        if (!isVisible) {
          vp.container.style.borderColor = "#27272a";
          vp.container.style.boxShadow = "none";
          vp.container.style.opacity = "0.35";
          vp.badge.style.background = "rgba(0, 0, 0, 0.75)";
          vp.badge.style.color = "#94a3b8";
          vp.badge.innerText = cam.name;
          continue;
        }
        const cornersLidar = d14BoxCorners(box.c, box.r, box.s);
        const [W, H] = camCalib.image_size;
        const maxR2 = d14MaxR2(camCalib);
        let inImage = 0;
        for (const p of cornersLidar) {
          const ego = storedVinCalib.pcd_frame === "ego" ? p : d14Transform(p, storedVinCalib.lidar.sensor2ego);
          const pc = d14Transform(ego, camCalib.ego2cam);
          if (pc[2] > NEAR_Z) {
            const xn = pc[0] / pc[2];
            const yn = pc[1] / pc[2];
            if (xn * xn + yn * yn <= maxR2) {
              const [u, v] = d14DistortToPixel(xn, yn, camCalib);
              if (u >= 0 && u < W && v >= 0 && v < H) inImage++;
            }
          }
        }
        const coverage = Math.round(inImage / 8 * 100);
        if (coverage >= 50) {
          vp.container.style.borderColor = "#22c55e";
          vp.container.style.boxShadow = "0 0 10px rgba(34, 197, 94, 0.4)";
          vp.container.style.opacity = "1";
          vp.badge.style.background = "#22c55e";
          vp.badge.style.color = "#000000";
          vp.badge.innerText = `${cam.name} (${coverage}% CHÍNH)`;
        } else {
          vp.container.style.borderColor = "#eab308";
          vp.container.style.boxShadow = "0 0 8px rgba(234, 179, 8, 0.3)";
          vp.container.style.opacity = "1";
          vp.badge.style.background = "#eab308";
          vp.badge.style.color = "#000000";
          vp.badge.innerText = `${cam.name} (${coverage}% MÉP)`;
        }
      }
    }
    /**
     * Cập nhật danh sách cấu hình Camera mới
     */
    updateCameras(newCameras) {
      this.activeCameras = newCameras;
      this.buildCameraViewports();
      if (this.activeBox) {
        this.renderBox(this.activeBox);
      }
    }
    /**
     * Ẩn toàn bộ Camera HUD khi tắt Suite
     */
    hide() {
      if (this.container) {
        this.container.style.display = "none";
      }
    }
    /**
     * Hiện lại Camera HUD khi bật Suite
     */
    show() {
      if (this.container) {
        this.container.style.display = "flex";
      }
    }
    /**
     * Hủy bỏ HUD khi rời khỏi trang
     */
    destroy() {
      var _a;
      (_a = this.container) == null ? void 0 : _a.remove();
      this.container = null;
      this.viewports.clear();
    }
  };
  __publicField(_CameraOverlayManager, "instance", null);
  let CameraOverlayManager = _CameraOverlayManager;
  function lidarToCamera(pointLidar, extrinsics) {
    const [lx, ly, lz] = pointLidar;
    const R = extrinsics.rotation;
    const [tx, ty, tz] = extrinsics.translation;
    const r00 = R[0], r01 = R[1], r02 = R[2];
    const r10 = R[3] !== void 0 ? R.length >= 16 ? R[4] : R[3] : 0;
    const r11 = R[4] !== void 0 ? R.length >= 16 ? R[5] : R[4] : 1;
    const r12 = R[5] !== void 0 ? R.length >= 16 ? R[6] : R[5] : 0;
    const r20 = R[6] !== void 0 ? R.length >= 16 ? R[8] : R[6] : 0;
    const r21 = R[7] !== void 0 ? R.length >= 16 ? R[9] : R[7] : 0;
    const r22 = R[8] !== void 0 ? R.length >= 16 ? R[10] : R[8] : 1;
    const cx = r00 * lx + r01 * ly + r02 * lz + tx;
    const cy = r10 * lx + r11 * ly + r12 * lz + ty;
    const cz = r20 * lx + r21 * ly + r22 * lz + tz;
    return [cx, cy, cz];
  }
  function projectPointToPixel(pointCam, intrinsics, distortionModel = "none", imageWidth = 1920, imageHeight = 1080) {
    const [x, y, z] = pointCam;
    if (z <= 0.05) {
      return { u: -9999, v: -9999, isValid: false };
    }
    const fx = intrinsics.fx;
    const fy = intrinsics.fy;
    const cx = intrinsics.cx;
    const cy = intrinsics.cy;
    const xn = x / z;
    const yn = y / z;
    let u = 0;
    let v = 0;
    if (distortionModel === "none") {
      u = fx * xn + cx;
      v = fy * yn + cy;
    } else if (distortionModel === "radtan") {
      const k1 = intrinsics.k1 || 0;
      const k2 = intrinsics.k2 || 0;
      const p1 = intrinsics.p1 || 0;
      const p2 = intrinsics.p2 || 0;
      const k3 = intrinsics.k3 || 0;
      const r2 = xn * xn + yn * yn;
      const r4 = r2 * r2;
      const r6 = r4 * r2;
      const radial = 1 + k1 * r2 + k2 * r4 + k3 * r6;
      const xDist = xn * radial + 2 * p1 * xn * yn + p2 * (r2 + 2 * xn * xn);
      const yDist = yn * radial + p1 * (r2 + 2 * yn * yn) + 2 * p2 * xn * yn;
      u = fx * xDist + cx;
      v = fy * yDist + cy;
    } else if (distortionModel === "fisheye") {
      const k1 = intrinsics.k1 || 0;
      const k2 = intrinsics.k2 || 0;
      const k3 = intrinsics.k3 || 0;
      const k4 = intrinsics.k4 || 0;
      const r = Math.sqrt(xn * xn + yn * yn);
      if (r < 1e-8) {
        u = cx;
        v = cy;
      } else {
        const theta = Math.atan(r);
        if (theta > Math.PI / 2 + 0.15) {
          return { u: -9999, v: -9999, isValid: false };
        }
        const theta2 = theta * theta;
        const theta4 = theta2 * theta2;
        const theta6 = theta4 * theta2;
        const theta8 = theta4 * theta4;
        const thetaD = theta * (1 + k1 * theta2 + k2 * theta4 + k3 * theta6 + k4 * theta8);
        const scale = thetaD / r;
        const xDist = scale * xn;
        const yDist = scale * yn;
        u = fx * xDist + cx;
        v = fy * yDist + cy;
      }
    }
    const isValid = u >= 0 && u <= imageWidth && v >= 0 && v <= imageHeight;
    return {
      u: Number(u.toFixed(2)),
      v: Number(v.toFixed(2)),
      isValid
    };
  }
  function clipSegmentNearPlane(p1, p2, nearPlane = 0.1) {
    const z1 = p1[2];
    const z2 = p2[2];
    if (z1 < nearPlane && z2 < nearPlane) {
      return { p1Clipped: p1, p2Clipped: p2, isVisible: false };
    }
    if (z1 >= nearPlane && z2 >= nearPlane) {
      return { p1Clipped: p1, p2Clipped: p2, isVisible: true };
    }
    const t = (nearPlane - z1) / (z2 - z1);
    const intersectX = p1[0] + t * (p2[0] - p1[0]);
    const intersectY = p1[1] + t * (p2[1] - p1[1]);
    const intersectZ = nearPlane;
    const clipped = [intersectX, intersectY, intersectZ];
    if (z1 < nearPlane) {
      return { p1Clipped: clipped, p2Clipped: p2, isVisible: true };
    } else {
      return { p1Clipped: p1, p2Clipped: clipped, isVisible: true };
    }
  }
  function getEdgeColorAndFace(idxA, idxB) {
    const isFront = (idxA === 4 || idxA === 5 || idxA === 6 || idxA === 7) && (idxB === 4 || idxB === 5 || idxB === 6 || idxB === 7);
    const isRear = (idxA === 0 || idxA === 1 || idxA === 2 || idxA === 3) && (idxB === 0 || idxB === 1 || idxB === 2 || idxB === 3);
    const isTop = idxA % 2 === 1 && idxB % 2 === 1;
    const isBottom = idxA % 2 === 0 && idxB % 2 === 0;
    const isLeft = (idxA === 2 || idxA === 3 || idxA === 6 || idxA === 7) && (idxB === 2 || idxB === 3 || idxB === 6 || idxB === 7);
    const isRight = (idxA === 0 || idxA === 1 || idxA === 4 || idxA === 5) && (idxB === 0 || idxB === 1 || idxB === 4 || idxB === 5);
    if (isFront) return { color: "#ef4444", faceType: "front" };
    if (isRear) return { color: "#3b82f6", faceType: "rear" };
    if (isLeft) return { color: "#22c55e", faceType: "left" };
    if (isRight) return { color: "#06b6d4", faceType: "right" };
    if (isTop) return { color: "#eab308", faceType: "top" };
    if (isBottom) return { color: "#71717a", faceType: "bottom" };
    return { color: "#a1a1aa", faceType: "vertical" };
  }
  function project3DBoxToCamera(box, cameraConfig, subdivisionSegments = 8) {
    const cornersLidar = boxCorners(box);
    const cornersCam = cornersLidar.map(
      (pt) => lidarToCamera(pt, cameraConfig.extrinsics)
    );
    const corners2D = cornersCam.map(
      (ptCam) => projectPointToPixel(
        ptCam,
        cameraConfig.intrinsics,
        cameraConfig.distortionModel,
        cameraConfig.imageWidth,
        cameraConfig.imageHeight
      )
    );
    const edges = [];
    let minU = Infinity, maxU = -Infinity;
    let minV = Infinity, maxV = -Infinity;
    for (let edgeIdx = 0; edgeIdx < BOX_EDGES.length; edgeIdx++) {
      const [startIdx, endIdx] = BOX_EDGES[edgeIdx];
      const p1Cam = cornersCam[startIdx];
      const p2Cam = cornersCam[endIdx];
      const { p1Clipped, p2Clipped, isVisible } = clipSegmentNearPlane(p1Cam, p2Cam, 0.1);
      if (!isVisible) {
        continue;
      }
      const { color, faceType } = getEdgeColorAndFace(startIdx, endIdx);
      const edgePoints = [];
      const segCount = Math.max(1, subdivisionSegments);
      for (let step = 0; step <= segCount; step++) {
        const frac = step / segCount;
        const interpCam = [
          p1Clipped[0] + frac * (p2Clipped[0] - p1Clipped[0]),
          p1Clipped[1] + frac * (p2Clipped[1] - p1Clipped[1]),
          p1Clipped[2] + frac * (p2Clipped[2] - p1Clipped[2])
        ];
        const pt2D = projectPointToPixel(
          interpCam,
          cameraConfig.intrinsics,
          cameraConfig.distortionModel,
          cameraConfig.imageWidth,
          cameraConfig.imageHeight
        );
        if (pt2D.isValid) {
          minU = Math.min(minU, pt2D.u);
          maxU = Math.max(maxU, pt2D.u);
          minV = Math.min(minV, pt2D.v);
          maxV = Math.max(maxV, pt2D.v);
        }
        edgePoints.push(pt2D);
      }
      edges.push({
        edgeIndex: edgeIdx,
        startCornerIndex: startIdx,
        endCornerIndex: endIdx,
        points: edgePoints,
        color,
        faceType,
        isVisible: edgePoints.some((p) => p.isValid)
      });
    }
    let bbox2D = null;
    let visibilityCoverage = 0;
    const visibleCornersCount = corners2D.filter((c) => c.isValid).length;
    if (minU < maxU && minV < maxV) {
      const clampedMinU = Math.max(0, minU);
      const clampedMinV = Math.max(0, minV);
      const clampedMaxU = Math.min(cameraConfig.imageWidth, maxU);
      const clampedMaxV = Math.min(cameraConfig.imageHeight, maxV);
      bbox2D = [clampedMinU, clampedMinV, clampedMaxU, clampedMaxV];
      const boxArea = Math.max(1, (maxU - minU) * (maxV - minV));
      const intersectArea = Math.max(0, clampedMaxU - clampedMinU) * Math.max(0, clampedMaxV - clampedMinV);
      visibilityCoverage = Number((intersectArea / boxArea * 100).toFixed(1));
    }
    let role = "out_of_view";
    if (visibilityCoverage >= 25 || visibleCornersCount >= 4) {
      role = "primary";
    } else if (visibilityCoverage > 0 || visibleCornersCount > 0) {
      role = "secondary";
    }
    return {
      cameraId: cameraConfig.id,
      cameraName: cameraConfig.name,
      corners2D,
      edges,
      bbox2D,
      visibilityCoverage,
      visibleCornersCount,
      isVisible: visibilityCoverage > 0 || visibleCornersCount > 0,
      role
    };
  }
  const _CameraFocusModal = class _CameraFocusModal {
    constructor() {
      __publicField(this, "overlay", null);
      __publicField(this, "currentCameraId", 0);
      __publicField(this, "activeBox", null);
      __publicField(this, "activeCameras", []);
      // Thuộc tính Zoom & Pan
      __publicField(this, "scale", 1);
      __publicField(this, "panX", 0);
      __publicField(this, "panY", 0);
      __publicField(this, "isDragging", false);
      __publicField(this, "dragStartX", 0);
      __publicField(this, "dragStartY", 0);
      // Tham chiếu DOM
      __publicField(this, "imgEl", null);
      __publicField(this, "canvasEl", null);
      __publicField(this, "ctx", null);
      __publicField(this, "titleEl", null);
      __publicField(this, "infoBadgeEl", null);
      __publicField(this, "transformContainer", null);
      this.activeCameras = getActiveCameras();
    }
    static getInstance() {
      if (!_CameraFocusModal.instance) {
        _CameraFocusModal.instance = new _CameraFocusModal();
      }
      return _CameraFocusModal.instance;
    }
    /**
     * Mở Focus Modal cho một camera cụ thể
     */
    open(cameraId, box, imageSrc) {
      this.currentCameraId = cameraId;
      if (box) this.activeBox = box;
      this.activeCameras = getActiveCameras();
      this.scale = 1;
      this.panX = 0;
      this.panY = 0;
      if (!this.overlay) {
        this.createModalDOM();
      }
      if (this.overlay) {
        this.overlay.style.display = "flex";
      }
      if (imageSrc && this.imgEl) {
        this.imgEl.src = imageSrc;
      }
      this.updateViewport();
    }
    /**
     * Đóng Focus Modal
     */
    close() {
      if (this.overlay) {
        this.overlay.style.display = "none";
      }
    }
    /**
     * Cập nhật Box đang chọn và vẽ lại
     */
    setBox(box) {
      this.activeBox = box;
      this.renderWireframe();
    }
    createModalDOM() {
      var _a, _b, _c, _d;
      this.overlay = document.createElement("div");
      this.overlay.id = "cvat-camera-focus-modal";
      this.overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      z-index: 99999;
      display: none;
      align-items: center;
      justify-content: center;
      user-select: none;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;
      this.overlay.innerHTML = `
      <div style="
        position: relative;
        width: 90vw;
        height: 88vh;
        background: #09090b;
        border: 1px solid #27272a;
        border-radius: 12px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      ">
        <!-- Header -->
        <div style="
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 16px;
          background: #18181b;
          border-bottom: 1px solid #27272a;
          color: #f1f5f9;
        ">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="color: #38bdf8; display: flex;">${ICONS.cameraFocus}</span>
            <span id="cvat-focus-modal-title" style="font-weight: 700; font-size: 14px;">Camera Focus Viewer</span>
            <span id="cvat-focus-modal-badge" style="
              font-size: 11px;
              font-weight: 600;
              padding: 2px 8px;
              border-radius: 9999px;
              background: #27272a;
              color: #a1a1aa;
            ">100% Zoom</span>
          </div>

          <!-- Controls -->
          <div style="display: flex; align-items: center; gap: 8px;">
            <button id="cvat-focus-prev-btn" title="Camera trước" style="
              background: #27272a;
              border: 1px solid #3f3f46;
              color: #f1f5f9;
              border-radius: 6px;
              cursor: pointer;
              padding: 4px 8px;
              display: flex;
              align-items: center;
              font-size: 12px;
            ">${ICONS.chevronLeft} Trước</button>

            <button id="cvat-focus-next-btn" title="Camera tiếp theo" style="
              background: #27272a;
              border: 1px solid #3f3f46;
              color: #f1f5f9;
              border-radius: 6px;
              cursor: pointer;
              padding: 4px 8px;
              display: flex;
              align-items: center;
              font-size: 12px;
            ">Sau ${ICONS.chevronRight}</button>

            <button id="cvat-focus-reset-zoom-btn" title="Đặt lại Zoom (100%)" style="
              background: #27272a;
              border: 1px solid #3f3f46;
              color: #f1f5f9;
              border-radius: 6px;
              cursor: pointer;
              padding: 4px 8px;
              font-size: 12px;
              font-weight: 600;
            ">1:1</button>

            <button id="cvat-focus-close-btn" title="Đóng (Esc)" style="
              background: #ef4444;
              border: none;
              color: #ffffff;
              border-radius: 6px;
              cursor: pointer;
              padding: 5px 8px;
              display: flex;
              align-items: center;
              margin-left: 8px;
            ">${ICONS.close}</button>
          </div>
        </div>

        <!-- Viewport Canvas Area -->
        <div id="cvat-focus-viewport-area" style="
          flex: 1;
          position: relative;
          background: #000000;
          overflow: hidden;
          cursor: grab;
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <div id="cvat-focus-transform-container" style="
            position: absolute;
            transform-origin: center center;
            transition: transform 0.05s linear;
            display: flex;
            align-items: center;
            justify-content: center;
          ">
            <img id="cvat-focus-img" style="
              max-width: 85vw;
              max-height: 78vh;
              object-fit: contain;
              display: block;
              user-select: none;
              pointer-events: none;
            " />
            <canvas id="cvat-focus-canvas" style="
              position: absolute;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              pointer-events: none;
            "></canvas>
          </div>
        </div>

        <!-- Footer Guide -->
        <div style="
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 16px;
          background: #18181b;
          border-top: 1px solid #27272a;
          color: #71717a;
          font-size: 11px;
        ">
          <span>💡 Lăn chuột để Phóng to/Thu nhỏ (Zoom) • Giữ chuột trái kéo để Di chuyển (Pan)</span>
          <span style="display: flex; gap: 12px;">
            <span style="color: #ef4444;">■ Mặt trước</span>
            <span style="color: #3b82f6;">■ Mặt sau</span>
            <span style="color: #22c55e;">■ Sườn trái</span>
            <span style="color: #06b6d4;">■ Sườn phải</span>
            <span style="color: #eab308;">■ Nóc xe</span>
          </span>
        </div>
      </div>
    `;
      document.body.appendChild(this.overlay);
      this.titleEl = this.overlay.querySelector("#cvat-focus-modal-title");
      this.infoBadgeEl = this.overlay.querySelector("#cvat-focus-modal-badge");
      this.imgEl = this.overlay.querySelector("#cvat-focus-img");
      this.canvasEl = this.overlay.querySelector("#cvat-focus-canvas");
      this.transformContainer = this.overlay.querySelector("#cvat-focus-transform-container");
      if (this.canvasEl) {
        this.ctx = this.canvasEl.getContext("2d");
      }
      (_a = this.overlay.querySelector("#cvat-focus-close-btn")) == null ? void 0 : _a.addEventListener("click", () => this.close());
      window.addEventListener("keydown", (e) => {
        var _a2;
        if (e.key === "Escape" && ((_a2 = this.overlay) == null ? void 0 : _a2.style.display) === "flex") {
          this.close();
        }
      });
      (_b = this.overlay.querySelector("#cvat-focus-prev-btn")) == null ? void 0 : _b.addEventListener("click", () => {
        this.currentCameraId = (this.currentCameraId - 1 + this.activeCameras.length) % this.activeCameras.length;
        this.updateViewport();
      });
      (_c = this.overlay.querySelector("#cvat-focus-next-btn")) == null ? void 0 : _c.addEventListener("click", () => {
        this.currentCameraId = (this.currentCameraId + 1) % this.activeCameras.length;
        this.updateViewport();
      });
      (_d = this.overlay.querySelector("#cvat-focus-reset-zoom-btn")) == null ? void 0 : _d.addEventListener("click", () => {
        this.scale = 1;
        this.panX = 0;
        this.panY = 0;
        this.applyTransform();
      });
      const viewArea = this.overlay.querySelector("#cvat-focus-viewport-area");
      viewArea == null ? void 0 : viewArea.addEventListener("wheel", (e) => {
        e.preventDefault();
        const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
        this.scale = Math.max(0.5, Math.min(6, this.scale * zoomFactor));
        this.applyTransform();
      });
      viewArea == null ? void 0 : viewArea.addEventListener("mousedown", (e) => {
        if (e.button === 0) {
          this.isDragging = true;
          this.dragStartX = e.clientX - this.panX;
          this.dragStartY = e.clientY - this.panY;
          viewArea.style.cursor = "grabbing";
        }
      });
      window.addEventListener("mousemove", (e) => {
        if (this.isDragging) {
          this.panX = e.clientX - this.dragStartX;
          this.panY = e.clientY - this.dragStartY;
          this.applyTransform();
        }
      });
      window.addEventListener("mouseup", () => {
        if (this.isDragging) {
          this.isDragging = false;
          if (viewArea) viewArea.style.cursor = "grab";
        }
      });
    }
    applyTransform() {
      if (this.transformContainer) {
        this.transformContainer.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
      }
      if (this.infoBadgeEl) {
        this.infoBadgeEl.innerText = `${Math.round(this.scale * 100)}% Zoom`;
      }
    }
    updateViewport() {
      const cam = this.activeCameras.find((c) => c.id === this.currentCameraId) || this.activeCameras[0];
      if (!cam) return;
      if (this.titleEl) {
        this.titleEl.innerText = `${cam.name} (Camera #${cam.id}) - ${cam.distortionModel.toUpperCase()}`;
      }
      if (this.canvasEl) {
        this.canvasEl.width = cam.imageWidth || 1920;
        this.canvasEl.height = cam.imageHeight || 1080;
      }
      if (this.imgEl) {
        const imgSrc = CameraOverlayManager.getInstance().getCameraImageSrc(cam.id);
        if (imgSrc) {
          this.imgEl.src = imgSrc;
        }
      }
      this.applyTransform();
      this.renderWireframe();
    }
    renderWireframe() {
      if (!this.ctx || !this.canvasEl || !this.activeBox) return;
      const cam = this.activeCameras.find((c) => c.id === this.currentCameraId);
      if (!cam) return;
      this.ctx.clearRect(0, 0, this.canvasEl.width, this.canvasEl.height);
      const vinCalib = getStoredVinCalib();
      if (vinCalib) {
        const camNames = Object.keys(vinCalib.cameras);
        for (const vinCamName of camNames) {
          const camCalib = vinCalib.cameras[vinCamName];
          if (camCalib && camCalib.image_size) {
            this.canvasEl.width = camCalib.image_size[0];
            this.canvasEl.height = camCalib.image_size[1];
            break;
          }
        }
        const drawn = renderDay14WireframeOnContext(
          this.ctx,
          this.canvasEl.width,
          this.canvasEl.height,
          this.activeBox,
          cam.name
        );
        if (drawn) return;
      }
      const proj = project3DBoxToCamera(this.activeBox, cam, 12);
      if (proj.isVisible) {
        this.ctx.lineWidth = 3.5;
        this.ctx.lineCap = "round";
        this.ctx.lineJoin = "round";
        for (const edge of proj.edges) {
          if (!edge.isVisible || edge.points.length < 2) continue;
          this.ctx.beginPath();
          this.ctx.strokeStyle = edge.color;
          let isFirst = true;
          for (const pt of edge.points) {
            if (pt.isValid) {
              if (isFirst) {
                this.ctx.moveTo(pt.u, pt.v);
                isFirst = false;
              } else {
                this.ctx.lineTo(pt.u, pt.v);
              }
            }
          }
          this.ctx.stroke();
        }
        this.ctx.fillStyle = "#ffffff";
        for (const c of proj.corners2D) {
          if (c.isValid) {
            this.ctx.beginPath();
            this.ctx.arc(c.u, c.v, 5, 0, 2 * Math.PI);
            this.ctx.fill();
            this.ctx.strokeStyle = "#000000";
            this.ctx.lineWidth = 1.5;
            this.ctx.stroke();
          }
        }
        if (proj.bbox2D) {
          const [uMin, vMin, uMax] = proj.bbox2D;
          const labelX = (uMin + uMax) / 2;
          const labelY = Math.max(30, vMin - 12);
          const text = `L:${this.activeBox.s[0].toFixed(2)}m W:${this.activeBox.s[1].toFixed(2)}m H:${this.activeBox.s[2].toFixed(2)}m`;
          this.ctx.font = "bold 18px -apple-system, BlinkMacSystemFont, sans-serif";
          const textMetrics = this.ctx.measureText(text);
          const pad = 6;
          this.ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
          this.ctx.fillRect(labelX - textMetrics.width / 2 - pad, labelY - 16, textMetrics.width + 2 * pad, 24);
          this.ctx.fillStyle = "#facc15";
          this.ctx.textAlign = "center";
          this.ctx.fillText(text, labelX, labelY);
        }
      }
    }
  };
  __publicField(_CameraFocusModal, "instance", null);
  let CameraFocusModal = _CameraFocusModal;
  const _HeaderSuiteButton = class _HeaderSuiteButton {
    constructor() {
      __publicField(this, "observer", null);
      __publicField(this, "callbacks", /* @__PURE__ */ new Set());
      __publicField(this, "isMounted", false);
      this.initObserver();
    }
    static getInstance() {
      if (!_HeaderSuiteButton.instance) {
        _HeaderSuiteButton.instance = new _HeaderSuiteButton();
      }
      return _HeaderSuiteButton.instance;
    }
    /**
     * Kiểm tra trạng thái kích hoạt hiện tại của Suite.
     * Mặc định là TRUE nếu chưa từng được người dùng bấm tắt (Auto-boot).
     */
    static isSuiteEnabled() {
      const val = localStorage.getItem(_HeaderSuiteButton.STORAGE_KEY);
      return val !== "false";
    }
    /**
     * Thiết lập trạng thái Bật/Tắt của Suite và lưu vào localStorage.
     */
    setSuiteEnabled(enabled) {
      localStorage.setItem(_HeaderSuiteButton.STORAGE_KEY, String(enabled));
      this.updateButtonUI(enabled);
      this.notifyCallbacks(enabled);
    }
    /**
     * Đăng ký lắng nghe sự kiện khi người dùng nhấn chuyển trạng thái Bật/Tắt.
     */
    onToggle(callback) {
      this.callbacks.add(callback);
      return () => this.callbacks.delete(callback);
    }
    notifyCallbacks(enabled) {
      this.callbacks.forEach((cb) => {
        try {
          cb(enabled);
        } catch (err) {
          console.error("[CVAT 3D Suite] Lỗi callback Header toggle:", err);
        }
      });
    }
    /**
     * Tự động theo dõi DOM để gắn nút vào Header ngay khi Header xuất hiện hoặc re-render.
     */
    initObserver() {
      if (this.observer) return;
      this.observer = new MutationObserver(() => {
        this.tryMount();
      });
      this.observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      this.tryMount();
    }
    /**
     * Cố gắng mount nút vào Header của CVAT nếu chưa tồn tại.
     */
    tryMount() {
      const existing = document.getElementById(_HeaderSuiteButton.BUTTON_ID);
      if (existing && existing.isConnected) {
        this.isMounted = true;
        return true;
      }
      const targetHeader = document.querySelector(".cvat-annotation-header-left-group") || document.querySelector(".cvat-annotation-header") || document.querySelector(".cvat-header") || document.querySelector("header.ant-layout-header");
      if (!targetHeader) {
        return false;
      }
      const btn = document.createElement("button");
      btn.id = _HeaderSuiteButton.BUTTON_ID;
      btn.type = "button";
      btn.setAttribute("aria-label", "Toggle CVAT 3D Suite");
      btn.style.display = "inline-flex";
      btn.style.alignItems = "center";
      btn.style.gap = "6px";
      btn.style.height = "28px";
      btn.style.padding = "0 10px";
      btn.style.marginLeft = "8px";
      btn.style.marginRight = "4px";
      btn.style.background = "#ffffff";
      btn.style.border = "1px solid #e2e8f0";
      btn.style.borderRadius = "6px";
      btn.style.cursor = "pointer";
      btn.style.fontSize = "11px";
      btn.style.fontWeight = "600";
      btn.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      btn.style.boxShadow = "0 1px 2px rgba(0, 0, 0, 0.05)";
      btn.style.transition = "all 0.15s ease";
      btn.style.userSelect = "none";
      btn.style.verticalAlign = "middle";
      btn.addEventListener("mouseenter", () => {
        btn.style.borderColor = "#cbd5e1";
        btn.style.background = "#f8fafc";
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.borderColor = "#e2e8f0";
        btn.style.background = "#ffffff";
      });
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const current = _HeaderSuiteButton.isSuiteEnabled();
        this.setSuiteEnabled(!current);
      });
      targetHeader.appendChild(btn);
      this.isMounted = true;
      this.updateButtonUI(_HeaderSuiteButton.isSuiteEnabled());
      return true;
    }
    /**
     * Cập nhật nội dung hiển thị của nút (Icon, Indicator Dot, Badge ON/OFF, Tooltip)
     */
    updateButtonUI(enabled) {
      const btn = document.getElementById(_HeaderSuiteButton.BUTTON_ID);
      if (!btn) return;
      btn.title = `CVAT 3D Suite (Đang ${enabled ? "BẬT" : "TẮT"} - Nhấn để ${enabled ? "TẮT" : "BẬT"})`;
      const dotColor = enabled ? "#10b981" : "#94a3b8";
      const dotShadow = enabled ? "box-shadow: 0 0 6px rgba(16, 185, 129, 0.6);" : "";
      const badgeColor = enabled ? "#047857" : "#64748b";
      const badgeBg = enabled ? "#ecfdf5" : "#f1f5f9";
      const badgeBorder = enabled ? "#a7f3d0" : "#e2e8f0";
      const iconColor = enabled ? "#0f172a" : "#64748b";
      btn.innerHTML = `
      <span style="display: flex; align-items: center; color: ${iconColor};">
        ${ICONS.box3d}
      </span>
      <span style="color: #0f172a; font-weight: 600; letter-spacing: -0.2px;">3D Suite</span>
      <span style="
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 1px 5px;
        background: ${badgeBg};
        border: 1px solid ${badgeBorder};
        border-radius: 4px;
        font-size: 10px;
        font-weight: 700;
        color: ${badgeColor};
        font-family: ui-monospace, monospace;
      ">
        <span style="
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: ${dotColor};
          ${dotShadow}
          display: inline-block;
        "></span>
        ${enabled ? "ON" : "OFF"}
      </span>
    `;
    }
    destroy() {
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }
      const btn = document.getElementById(_HeaderSuiteButton.BUTTON_ID);
      if (btn && btn.parentNode) {
        btn.parentNode.removeChild(btn);
      }
      this.isMounted = false;
    }
  };
  __publicField(_HeaderSuiteButton, "instance", null);
  __publicField(_HeaderSuiteButton, "STORAGE_KEY", "CVAT_3D_SUITE_AUTO_ENABLED");
  __publicField(_HeaderSuiteButton, "BUTTON_ID", "cvat-3d-suite-header-btn");
  let HeaderSuiteButton = _HeaderSuiteButton;
  function cookie(name) {
    const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function orgSlug() {
    try {
      return localStorage.getItem("currentOrganization") || "";
    } catch {
      return "";
    }
  }
  function buildUrl(path, params, withOrg) {
    const url = new URL(path, location.origin);
    if (url.origin !== location.origin) {
      throw new Error(`Chặn request ra ngoài: ${url.origin}`);
    }
    const all = {
      ...withOrg ? { org: orgSlug() } : {},
      ...params || {}
    };
    for (const [k, v] of Object.entries(all)) {
      if (v !== void 0 && v !== null) {
        url.searchParams.set(k, String(v));
      }
    }
    return url;
  }
  async function readWithProgress(res, onProgress) {
    if (!onProgress || !res.body) {
      return res.arrayBuffer();
    }
    const total = Number(res.headers.get("Content-Length")) || 0;
    const reader = res.body.getReader();
    const parts = [];
    let loaded = 0;
    for (; ; ) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      loaded += value.length;
      onProgress(loaded, total);
    }
    const out = new Uint8Array(loaded);
    let o = 0;
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
    }
    return out.buffer;
  }
  async function request(method, path, opts = {}) {
    const {
      params,
      body,
      responseType = "json",
      withOrg = true,
      onProgress
    } = opts;
    const headers = {
      Accept: "application/vnd.cvat+json, application/json, */*"
    };
    const csrf = cookie("csrftoken");
    if (csrf) {
      headers["X-CSRFToken"] = csrf;
    }
    if (body !== void 0) {
      headers["Content-Type"] = "application/json";
    }
    const res = await fetch(buildUrl(path, params, withOrg), {
      method,
      headers,
      body: body === void 0 ? void 0 : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
      referrerPolicy: "same-origin"
    });
    if (!res.ok) {
      let detail = "";
      try {
        detail = (await res.text()).slice(0, 300);
      } catch {
      }
      throw new Error(`${method} ${path} → HTTP ${res.status} ${detail}`);
    }
    if (responseType === "arraybuffer") {
      return readWithProgress(res, onProgress);
    }
    if (res.status === 204) {
      return null;
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }
  const helperApi = {
    /** Lấy thông tin job */
    getJob(jid) {
      return request("GET", `/api/jobs/${jid}`, { withOrg: false });
    },
    /** Lấy metadata (danh sách frame, chunk info) */
    getMeta(jid) {
      return request("GET", `/api/jobs/${jid}/data/meta`);
    },
    /** Lấy toàn bộ annotation (tags, shapes, tracks) */
    getAnnotations(jid) {
      return request("GET", `/api/jobs/${jid}/annotations`);
    },
    /** Cập nhật (PATCH) danh sách tracks */
    updateTracks(jid, tracks) {
      return request("PATCH", `/api/jobs/${jid}/annotations`, {
        params: { action: "update" },
        body: { version: 0, tags: [], shapes: [], tracks }
      });
    },
    /** Tải chunk point cloud (arraybuffer) với progress callback */
    getChunk(jid, index, quality, onProgress) {
      return request("GET", `/api/jobs/${jid}/data`, {
        params: { type: "chunk", index, quality },
        responseType: "arraybuffer",
        onProgress
      });
    },
    /** Tải ảnh context (camera images) cho 1 frame */
    getContextImages(jid, frame) {
      return request("GET", `/api/jobs/${jid}/data`, {
        params: {
          type: "context_image",
          number: frame,
          quality: "original"
        },
        responseType: "arraybuffer"
      });
    },
    /** Lấy danh sách label của job (phân trang tự động) */
    async getLabels(jid) {
      const out = [];
      let page = 1;
      for (; ; ) {
        const data = await request("GET", "/api/labels", {
          params: { job_id: jid, page_size: 500, page }
        });
        out.push(...data.results || []);
        if (!data.next) break;
        page += 1;
      }
      return out;
    }
  };
  const REQ_EVENT = "cvat-helper:req";
  const RES_EVENT = "cvat-helper:res";
  const pending = /* @__PURE__ */ new Map();
  let seq = 0;
  function initResponseListener() {
    document.addEventListener(RES_EVENT, (e) => {
      let msg;
      try {
        msg = JSON.parse(e.detail);
      } catch {
        return;
      }
      const p = pending.get((msg == null ? void 0 : msg.id) ?? "");
      if (!p) return;
      pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.ok) p.resolve(msg.result);
      else p.reject(new Error(msg.error || "Bridge error"));
    });
  }
  let listenerInited = false;
  function call(method, args, timeoutMs = 12e4) {
    if (!listenerInited) {
      initResponseListener();
      listenerInited = true;
    }
    const id = `${Date.now()}-${++seq}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Bridge CVAT không phản hồi (${method})`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      document.dispatchEvent(
        new CustomEvent(REQ_EVENT, {
          detail: JSON.stringify({ id, method, args })
        })
      );
    });
  }
  async function connect(jid) {
    try {
      const st = await call("status", {}, 1500);
      return !!(st && st.ready && st.jobId === jid);
    } catch {
      return false;
    }
  }
  const helperLiveBridge = {
    call,
    connect
  };
  function getHelperBridgeMainScript() {
    return `(function() {
  if (window.__cvatHelperBridge) return;
  window.__cvatHelperBridge = true;

  var REQ = 'cvat-helper:req';
  var RES = 'cvat-helper:res';
  var ctx = null;

  function register() {
    if (ctx || !window.cvatUI || typeof window.cvatUI.registerComponent !== 'function') return !!ctx;
    window.cvatUI.registerComponent(function(args) {
      ctx = args;
      return { name: 'CVAT 3D Label Helper', destructor: function() { ctx = null; } };
    });
    return !!ctx;
  }

  if (!register()) {
    document.addEventListener('plugins.ready', register);
    var tries = 0;
    var timer = setInterval(function() { if (register() || ++tries > 120) clearInterval(timer); }, 500);
  }

  function annotationState() {
    if (!ctx) throw new Error('Chưa kết nối được plugin CVAT');
    var st = ctx.store.getState().annotation;
    var job = st && st.job && st.job.instance;
    if (!job) throw new Error('Chưa mở job trên CVAT');
    return { job: job, frame: st.player.frame.number };
  }

  function trackStatesAt(job, frame) {
    return job.annotations.get(frame, true, [])
      .then(function(states) {
        return states.filter(function(s) {
          return s.objectType === 'track' && s.shapeType === 'cuboid';
        });
      });
  }

  var methods = {
    status: function() {
      if (!ctx) return Promise.resolve({ ready: false });
      var st = ctx.store.getState().annotation;
      var job = st && st.job && st.job.instance;
      return Promise.resolve({
        ready: !!job,
        jobId: job ? job.id : null,
        dimension: job ? job.dimension : null,
        unsaved: job ? job.annotations.hasUnsavedChanges() : false
      });
    },

    readTracks: function(args) {
      var frames = args.frames;
      var result = annotationState();
      var job = result.job;
      var tracks = new Map();
      var work = Promise.resolve();
      frames.forEach(function(frame) {
        work = work.then(function() {
          return trackStatesAt(job, frame).then(function(states) {
            states.forEach(function(s) {
              var t = tracks.get(s.clientID);
              if (!t) {
                t = { clientID: s.clientID, serverID: s.serverID || null, labelId: s.label.id, shapes: [] };
                tracks.set(s.clientID, t);
              }
              if (s.keyframe) {
                t.shapes.push({
                  type: 'cuboid', frame: frame, points: Array.from(s.points), outside: !!s.outside,
                  occluded: !!s.occluded, z_order: s.zOrder || 0, rotation: 0, attributes: []
                });
              }
            });
          }).catch(function() {});
        });
      });
      return work.then(function() {
        var out = [];
        tracks.forEach(function(t) { if (t.shapes.length) out.push(t); });
        return out;
      });
    },

    applyTrack: function(args) {
      var clientID = args.clientID;
      var shapes = args.shapes;
      var current = args.current;
      var result = annotationState();
      var job = result.job;
      var want = new Map(shapes.map(function(s) { return [s.frame, s]; }));
      var have = new Map(current.map(function(s) { return [s.frame, s]; }));
      var same = function(a, b) {
        return a.length === b.length && a.every(function(v, i) { return Math.abs(v - b[i]) < 1e-9; });
      };
      var changed = 0;
      var work = Promise.resolve();

      want.forEach(function(s, frame) {
        work = work.then(function() {
          var old = have.get(frame);
          if (old && same(old.points, s.points) && old.outside === s.outside) return;
          return trackStatesAt(job, frame).then(function(states) {
            var state = states.find(function(x) { return x.clientID === clientID; });
            if (!state) throw new Error('Không tìm thấy track ' + clientID + ' ở frame ' + frame);
            if (!old || !same(old.points, s.points)) state.points = s.points;
            if (!old || old.outside !== s.outside) state.outside = s.outside;
            return state.save();
          }).then(function() { changed += 1; });
        });
      });

      have.forEach(function(_v, frame) {
        if (want.has(frame)) return;
        work = work.then(function() {
          return trackStatesAt(job, frame).then(function(states) {
            var state = states.find(function(x) { return x.clientID === clientID; });
            if (!state) return;
            state.keyframe = false;
            return state.save();
          }).then(function() { changed += 1; });
        });
      });

      return work.then(function() { return { changed: changed }; });
    },

    refresh: function() {
      var result = annotationState();
      return ctx.dispatch(ctx.actionCreators.changeFrameAsync(result.frame, undefined, undefined, true))
        .then(function() { return true; });
    },

    saveCvat: function() {
      var result = annotationState();
      var job = result.job;
      var btn = document.querySelector('.cvat-annotation-header-save-button');
      if (btn && !btn.classList.contains('cvat-annotation-disabled-header-button')) {
        btn.click();
        var attempts = 0;
        return new Promise(function(resolve, reject) {
          var check = setInterval(function() {
            attempts++;
            if (!job.annotations.hasUnsavedChanges()) {
              clearInterval(check);
              resolve({ saved: true, via: 'button' });
            } else if (attempts >= 600) {
              clearInterval(check);
              reject(new Error('CVAT lưu quá lâu (60s) – kiểm tra lại trên CVAT'));
            }
          }, 100);
        });
      }
      return job.annotations.save().then(function() {
        return methods.refresh();
      }).then(function() {
        return { saved: true, via: 'core' };
      });
    }
  };

  document.addEventListener(REQ, function(e) {
    var msg;
    try { msg = JSON.parse(e.detail); } catch(_) { return; }
    if (!msg || !methods[msg.method]) return;
    var reply;
    Promise.resolve().then(function() {
      return methods[msg.method](msg.args || {});
    }).then(function(result) {
      reply = { id: msg.id, ok: true, result: result };
    }).catch(function(err) {
      reply = { id: msg.id, ok: false, error: String((err && err.message) || err) };
    }).then(function() {
      document.dispatchEvent(new CustomEvent(RES, { detail: JSON.stringify(reply) }));
    });
  });
})();`;
  }
  const deepClone = (v) => JSON.parse(JSON.stringify(v));
  function interpolatePoints(left, right, offset) {
    return interpolatePoints$1(left, right, offset);
  }
  const MAX_UNDO = 200;
  class HelperTrackState {
    constructor(serverTrack, uiId, key) {
      __publicField(this, "uiId");
      __publicField(this, "key");
      __publicField(this, "server");
      __publicField(this, "shapes");
      __publicField(this, "undoStack");
      __publicField(this, "redoStack");
      __publicField(this, "dirty");
      this.uiId = uiId;
      this.key = key;
      this.load(serverTrack);
    }
    load(serverTrack) {
      this.server = deepClone(serverTrack);
      this.shapes = deepClone(serverTrack.shapes).sort((a, b) => a.frame - b.frame);
      this.undoStack = [];
      this.redoStack = [];
      this.dirty = false;
    }
    get id() {
      return this.key;
    }
    get serverId() {
      return this.server.id ?? null;
    }
    get labelId() {
      return this.server.label_id;
    }
    get firstFrame() {
      return this.shapes.length ? this.shapes[0].frame : this.server.frame;
    }
    get lastFrame() {
      return this.shapes.length ? this.shapes[this.shapes.length - 1].frame : this.server.frame;
    }
    keyframeIndex(frame) {
      return this.shapes.findIndex((s) => s.frame === frame);
    }
    /**
     * Vị trí box tại frame, giống Track.getPosition của cvat-core.
     * Trả về PositionResult hoặc null nếu frame trước keyframe đầu.
     */
    at(frame) {
      let left = null;
      let right = null;
      for (const s of this.shapes) {
        if (s.frame <= frame) left = s;
        else {
          right = s;
          break;
        }
      }
      if (left && left.frame === frame) {
        return {
          points: left.points.slice(),
          box: pointsToBox(left.points),
          keyframe: true,
          outside: left.outside,
          left
        };
      }
      if (left && right) {
        const offset = (frame - left.frame) / (right.frame - left.frame);
        const points = interpolatePoints(left.points, right.points, offset);
        return {
          points,
          box: pointsToBox(points),
          keyframe: left.frame === frame,
          outside: left.outside,
          left
        };
      }
      const single = left || right;
      if (!single) return null;
      return {
        points: single.points.slice(),
        box: pointsToBox(single.points),
        keyframe: single.frame === frame,
        outside: single === right ? true : single.outside,
        left: single
      };
    }
    snapshot() {
      this.undoStack.push(deepClone(this.shapes));
      if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
      this.redoStack = [];
    }
    undo() {
      if (!this.undoStack.length) return false;
      this.redoStack.push(deepClone(this.shapes));
      this.shapes = this.undoStack.pop();
      this.dirty = JSON.stringify(this.shapes) !== JSON.stringify(this.serverShapesSorted());
      return true;
    }
    redo() {
      if (!this.redoStack.length) return false;
      this.undoStack.push(deepClone(this.shapes));
      this.shapes = this.redoStack.pop();
      this.dirty = true;
      return true;
    }
    serverShapesSorted() {
      return deepClone(this.server.shapes).sort((a, b) => a.frame - b.frame);
    }
    /**
     * Ghi box vào frame. Nếu frame chưa là keyframe thì tạo keyframe mới
     * (giống khi sửa trên CVAT).
     */
    setBox(frame, box) {
      const idx = this.keyframeIndex(frame);
      if (idx >= 0) {
        this.shapes[idx].points = boxToPoints(box, this.shapes[idx].points);
      } else {
        const pos = this.at(frame);
        const base = pos ? pos.left : this.shapes[0];
        const shape = {
          type: "cuboid",
          frame,
          points: boxToPoints(box, pos ? pos.points : base.points),
          outside: false,
          occluded: base ? base.occluded : false,
          z_order: base ? base.z_order : 0,
          rotation: 0,
          attributes: base ? deepClone(base.attributes || []) : []
        };
        this.shapes.push(shape);
        this.shapes.sort((a, b) => a.frame - b.frame);
      }
      this.dirty = true;
    }
    /**
     * Bật/tắt outside tại frame (giống phím O của CVAT):
     * tạo keyframe tại frame nếu chưa có.
     */
    setOutside(frame, outside) {
      const idx = this.keyframeIndex(frame);
      if (idx >= 0) {
        this.shapes[idx].outside = outside;
      } else {
        const pos = this.at(frame);
        if (!pos) return;
        const base = pos.left;
        this.shapes.push({
          type: "cuboid",
          frame,
          points: pos.points.slice(),
          outside,
          occluded: base.occluded,
          z_order: base.z_order,
          rotation: 0,
          attributes: deepClone(base.attributes || [])
        });
        this.shapes.sort((a, b) => a.frame - b.frame);
      }
      this.dirty = true;
    }
    /**
     * Payload gửi lên CVAT (PATCH action=update):
     * nguyên track từ server + shapes đã sửa.
     */
    toServer() {
      const t = deepClone(this.server);
      t.shapes = deepClone(this.shapes);
      return t;
    }
  }
  class HelperJobStore {
    constructor(jid) {
      __publicField(this, "jid");
      __publicField(this, "job", null);
      __publicField(this, "meta", null);
      __publicField(this, "labels", /* @__PURE__ */ new Map());
      __publicField(this, "frames", []);
      __publicField(this, "tracks", /* @__PURE__ */ new Map());
      __publicField(this, "mode", "api");
      __publicField(this, "extraShapes", 0);
      __publicField(this, "listeners", /* @__PURE__ */ new Set());
      this.jid = jid;
    }
    on(cb) {
      this.listeners.add(cb);
      return () => {
        this.listeners.delete(cb);
      };
    }
    emit(what) {
      for (const cb of this.listeners) cb(what);
    }
    /**
     * mode 'live': đọc/ghi thẳng bộ nhớ trang CVAT qua plugin bridge (không cần reload).
     * mode 'api' : dự phòng khi không kết nối được bridge – đọc/ghi qua REST, phải reload CVAT sau khi lưu.
     */
    async load() {
      const [job, meta, labels, live] = await Promise.all([
        helperApi.getJob(this.jid),
        helperApi.getMeta(this.jid),
        helperApi.getLabels(this.jid),
        helperLiveBridge.connect(this.jid)
      ]);
      this.job = job;
      this.meta = meta;
      this.labels = new Map(
        labels.map((l) => [l.id, l])
      );
      this.frames = this.computeFrames();
      this.mode = live ? "live" : "api";
      if (live) {
        const liveTracks = await helperLiveBridge.call("readTracks", { frames: this.frames });
        this.setLiveTracks(liveTracks);
      } else {
        const ann = await helperApi.getAnnotations(this.jid);
        this.setAnnotations(ann);
      }
      this.emit("load");
    }
    setLiveTracks(list) {
      this.extraShapes = 0;
      this.tracks = /* @__PURE__ */ new Map();
      for (const t of list) {
        const serverTrack = {
          id: t.serverID,
          label_id: t.labelId,
          frame: t.shapes[0].frame,
          shapes: t.shapes
        };
        this.tracks.set(
          t.clientID,
          new HelperTrackState(serverTrack, t.clientID, t.clientID)
        );
      }
    }
    /**
     * Danh sách số frame (tuyệt đối, theo task) thuộc job, theo đúng thứ tự trong chunk.
     */
    computeFrames() {
      const m = this.meta;
      if (!m) return [];
      const included = m.included_frames;
      if (Array.isArray(included) && included.length) {
        return included.slice().sort((a, b) => a - b);
      }
      const frameFilter = m.frame_filter || "";
      const stepMatch = /step\s*=\s*(\d+)/.exec(frameFilter);
      const step = stepMatch ? Number(stepMatch[1]) : 1;
      const startFrame = m.start_frame ?? 0;
      const stopFrame = m.stop_frame ?? startFrame;
      const out = [];
      for (let f = startFrame; f <= stopFrame; f += step) out.push(f);
      return out;
    }
    setAnnotations(ann) {
      const tags = ann.tags || [];
      const shapes = ann.shapes || [];
      const before = tags.length + shapes.length;
      this.extraShapes = shapes.filter(
        (s) => s.type === "cuboid"
      ).length;
      this.tracks = /* @__PURE__ */ new Map();
      const tracks = ann.tracks || [];
      tracks.forEach((t, i) => {
        if (!t.shapes || !t.shapes.length) return;
        if (t.shapes[0].type !== "cuboid") return;
        this.tracks.set(
          t.id,
          new HelperTrackState(t, before + i + 1, t.id)
        );
      });
    }
    track(id) {
      return this.tracks.get(id);
    }
    labelName(labelId) {
      var _a;
      return ((_a = this.labels.get(labelId)) == null ? void 0 : _a.name) ?? `label ${labelId}`;
    }
    labelColor(labelId) {
      var _a;
      return ((_a = this.labels.get(labelId)) == null ? void 0 : _a.color) || "#5ad17a";
    }
    dirtyTracks() {
      return [...this.tracks.values()].filter((t) => t.dirty);
    }
    /**
     * Lưu các track đã sửa. Trước khi ghi, kiểm tra track trên server
     * có bị đổi từ lúc tải không.
     */
    async save(opts = {}) {
      const dirty = this.dirtyTracks();
      if (!dirty.length) return { saved: 0 };
      if (this.mode === "live") return this.saveLive(dirty);
      const fresh = await helperApi.getAnnotations(this.jid);
      const freshTracks = fresh.tracks || [];
      const freshById = new Map(freshTracks.map((t) => [t.id, t]));
      const conflicts = dirty.filter((t) => {
        const f = freshById.get(t.serverId);
        if (!f) return true;
        const a = JSON.stringify(
          deepClone(f.shapes).sort((x, y) => x.frame - y.frame).map((s) => [s.frame, s.points, s.outside])
        );
        const b = JSON.stringify(
          t.serverShapesSorted().map((s) => [s.frame, s.points, s.outside])
        );
        return a !== b;
      });
      if (conflicts.length && !opts.force) {
        return { conflicts: conflicts.map((t) => t.uiId) };
      }
      await helperApi.updateTracks(
        this.jid,
        dirty.map((t) => t.toServer())
      );
      const after = await helperApi.getAnnotations(this.jid);
      const afterTracks = after.tracks || [];
      const afterById = new Map(afterTracks.map((t) => [t.id, t]));
      for (const t of dirty) {
        const srv = afterById.get(t.serverId);
        if (!srv) continue;
        const undo = t.undoStack;
        const redo = t.redoStack;
        t.load(srv);
        t.undoStack = undo;
        t.redoStack = redo;
      }
      this.emit("saved");
      return { saved: dirty.length };
    }
    /**
     * Ghi vào bộ nhớ CVAT rồi bấm Save của CVAT. CVAT tự vẽ lại → không cần reload.
     */
    async saveLive(dirty) {
      let changed = 0;
      for (const t of dirty) {
        const res = await helperLiveBridge.call("applyTrack", {
          clientID: t.key,
          shapes: t.shapes,
          current: t.serverShapesSorted()
        });
        changed += res.changed;
      }
      await helperLiveBridge.call("saveCvat", {});
      const freshList = await helperLiveBridge.call("readTracks", {
        frames: this.frames
      });
      const freshMap = new Map(freshList.map((t) => [t.clientID, t]));
      for (const t of dirty) {
        const f = freshMap.get(t.key);
        if (!f) continue;
        const undo = t.undoStack;
        const redo = t.redoStack;
        t.load({
          ...t.server,
          id: f.serverID,
          shapes: f.shapes
        });
        t.undoStack = undo;
        t.redoStack = redo;
      }
      this.emit("saved");
      return { saved: dirty.length, changed, live: true };
    }
  }
  function lzfDecompress(input, outLength) {
    const out = new Uint8Array(outLength);
    let ip = 0;
    let op = 0;
    while (ip < input.length) {
      let ctrl = input[ip++];
      if (ctrl < 32) {
        ctrl += 1;
        if (op + ctrl > outLength) {
          throw new Error("LZF: dữ liệu hỏng (literal overflow)");
        }
        out.set(input.subarray(ip, ip + ctrl), op);
        ip += ctrl;
        op += ctrl;
      } else {
        let len = ctrl >> 5;
        let ref = op - ((ctrl & 31) << 8) - 1;
        if (len === 7) {
          len += input[ip++];
        }
        ref -= input[ip++];
        len += 2;
        if (ref < 0 || op + len > outLength) {
          throw new Error("LZF: dữ liệu hỏng (back-reference overflow)");
        }
        for (let k = 0; k < len; k++) {
          out[op++] = out[ref++];
        }
      }
    }
    return out;
  }
  function createReader(view, type, size) {
    if (type === "F" && size === 4) return (o) => view.getFloat32(o, true);
    if (type === "F" && size === 8) return (o) => view.getFloat64(o, true);
    if (type === "I" && size === 1) return (o) => view.getInt8(o);
    if (type === "I" && size === 2) return (o) => view.getInt16(o, true);
    if (type === "I" && size === 4) return (o) => view.getInt32(o, true);
    if (type === "U" && size === 1) return (o) => view.getUint8(o);
    if (type === "U" && size === 2) return (o) => view.getUint16(o, true);
    if (type === "U" && size === 4) return (o) => view.getUint32(o, true);
    throw new Error(`PCD: kiểu ${type}${size} chưa hỗ trợ`);
  }
  function parsePCD(bytes) {
    var _a, _b;
    let headerEnd = -1;
    const limit = Math.min(bytes.length, 65536);
    let lineStart = 0;
    const header = {};
    const td = new TextDecoder();
    for (let i = 0; i < limit; i++) {
      if (bytes[i] !== 10) continue;
      const line = td.decode(bytes.subarray(lineStart, i)).trim();
      lineStart = i + 1;
      if (!line || line.startsWith("#")) continue;
      const [key, ...rest] = line.split(/\s+/);
      header[key.toUpperCase()] = rest;
      if (key.toUpperCase() === "DATA") {
        headerEnd = i + 1;
        break;
      }
    }
    if (headerEnd < 0) {
      throw new Error("PCD: không tìm thấy header DATA");
    }
    const fields = header.FIELDS;
    const sizes = header.SIZE.map(Number);
    const types = header.TYPE;
    const counts = header.COUNT ? header.COUNT.map(Number) : fields.map(() => 1);
    const pointsRaw = (_a = header.POINTS) == null ? void 0 : _a[0];
    const points = Number(
      pointsRaw ?? Number(header.WIDTH[0]) * Number(((_b = header.HEIGHT) == null ? void 0 : _b[0]) ?? 1)
    );
    const mode = header.DATA[0].toLowerCase();
    const idx = ["x", "y", "z"].map((f) => fields.indexOf(f));
    if (idx.some((v) => v < 0)) {
      throw new Error("PCD: thiếu field x/y/z");
    }
    const out = new Float32Array(points * 3);
    let n = 0;
    if (mode === "ascii") {
      const text = td.decode(bytes.subarray(headerEnd));
      const col = [];
      let c = 0;
      fields.forEach((_, k) => {
        col.push(c);
        c += counts[k];
      });
      for (const line of text.split("\n")) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < c) continue;
        const x = +parts[col[idx[0]]];
        const y = +parts[col[idx[1]]];
        const z = +parts[col[idx[2]]];
        if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
          out[n++] = x;
          out[n++] = y;
          out[n++] = z;
        }
      }
      return out.subarray(0, n);
    }
    let data;
    let offsetOf;
    if (mode === "binary") {
      data = bytes.subarray(headerEnd);
      const stride = sizes.reduce((s, sz, k) => s + sz * counts[k], 0);
      const fieldOff = [];
      let o = 0;
      fields.forEach((_, k) => {
        fieldOff.push(o);
        o += sizes[k] * counts[k];
      });
      offsetOf = (field, i) => i * stride + fieldOff[field];
    } else if (mode === "binary_compressed") {
      const hv = new DataView(bytes.buffer, bytes.byteOffset + headerEnd, 8);
      const compressed = hv.getUint32(0, true);
      const uncompressed = hv.getUint32(4, true);
      data = lzfDecompress(
        bytes.subarray(headerEnd + 8, headerEnd + 8 + compressed),
        uncompressed
      );
      const fieldOff = [];
      let o = 0;
      fields.forEach((_, k) => {
        fieldOff.push(o);
        o += sizes[k] * counts[k] * points;
      });
      offsetOf = (field, i) => fieldOff[field] + i * sizes[field] * counts[field];
    } else {
      throw new Error(`PCD: DATA ${mode} chưa hỗ trợ`);
    }
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const rd = idx.map((f) => createReader(view, types[f], sizes[f]));
    for (let i = 0; i < points; i++) {
      const x = rd[0](offsetOf(idx[0], i));
      const y = rd[1](offsetOf(idx[1], i));
      const z = rd[2](offsetOf(idx[2], i));
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
        out[n++] = x;
        out[n++] = y;
        out[n++] = z;
      }
    }
    return out.subarray(0, n);
  }
  async function inflateRaw(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  function findEOCD(view) {
    const min = Math.max(0, view.byteLength - 65557);
    for (let i = view.byteLength - 22; i >= min; i--) {
      if (view.getUint32(i, true) === 101010256) return i;
    }
    throw new Error("Không phải file zip hợp lệ");
  }
  function listZipEntries(buffer) {
    const view = new DataView(buffer);
    const eocd = findEOCD(view);
    let count = view.getUint16(eocd + 10, true);
    let cdOffset = view.getUint32(eocd + 16, true);
    if (cdOffset === 4294967295 || count === 65535) {
      const locator = eocd - 20;
      if (locator >= 0 && view.getUint32(locator, true) === 117853008) {
        const z64 = Number(view.getBigUint64(locator + 8, true));
        count = Number(view.getBigUint64(z64 + 32, true));
        cdOffset = Number(view.getBigUint64(z64 + 48, true));
      }
    }
    const decoder = new TextDecoder();
    const entries = [];
    let p = cdOffset;
    for (let n = 0; n < count; n++) {
      if (view.getUint32(p, true) !== 33639248) {
        throw new Error("Central directory zip bị hỏng");
      }
      const method = view.getUint16(p + 10, true);
      let compSize = view.getUint32(p + 20, true);
      const nameLen = view.getUint16(p + 28, true);
      const extraLen = view.getUint16(p + 30, true);
      const commentLen = view.getUint16(p + 32, true);
      let localOffset = view.getUint32(p + 42, true);
      const name = decoder.decode(new Uint8Array(buffer, p + 46, nameLen));
      let e = p + 46 + nameLen;
      const eEnd = e + extraLen;
      while (e + 4 <= eEnd) {
        const id = view.getUint16(e, true);
        const size = view.getUint16(e + 2, true);
        if (id === 1) {
          let q = e + 4;
          if (view.getUint32(p + 24, true) === 4294967295) {
            q += 8;
          }
          if (compSize === 4294967295) {
            compSize = Number(view.getBigUint64(q, true));
            q += 8;
          }
          if (localOffset === 4294967295) {
            localOffset = Number(view.getBigUint64(q, true));
          }
        }
        e += 4 + size;
      }
      p = eEnd + commentLen;
      if (name.endsWith("/")) continue;
      const capturedCompSize = compSize;
      const capturedLocalOffset = localOffset;
      const capturedMethod = method;
      const capturedName = name;
      entries.push({
        name,
        async read() {
          const lNameLen = view.getUint16(capturedLocalOffset + 26, true);
          const lExtraLen = view.getUint16(capturedLocalOffset + 28, true);
          const start = capturedLocalOffset + 30 + lNameLen + lExtraLen;
          const data = new Uint8Array(buffer, start, capturedCompSize);
          if (capturedMethod === 0) {
            return data.slice();
          }
          if (capturedMethod === 8) {
            return inflateRaw(data);
          }
          throw new Error(
            `Zip method ${capturedMethod} chưa hỗ trợ (${capturedName})`
          );
        }
      });
    }
    return entries;
  }
  const DB_NAME = "CVAT_3D_SUITE_CACHE";
  const DB_VERSION = 1;
  const CHUNK_STORE = "chunks";
  class PointCloudDiskStorageManager {
    constructor() {
      __publicField(this, "dbPromise", null);
    }
    /**
     * Khởi tạo hoặc mở kết nối IndexedDB.
     */
    getDb() {
      if (this.dbPromise) return this.dbPromise;
      this.dbPromise = new Promise((resolve, reject) => {
        if (typeof indexedDB === "undefined") {
          reject(new Error("Trình duyệt không hỗ trợ IndexedDB"));
          return;
        }
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(CHUNK_STORE)) {
            const store = db.createObjectStore(CHUNK_STORE, { keyPath: "key" });
            store.createIndex("by_jid", "jid", { unique: false });
          }
        };
        req.onsuccess = () => {
          resolve(req.result);
        };
        req.onerror = () => {
          this.dbPromise = null;
          reject(req.error || new Error("Lỗi mở IndexedDB"));
        };
      });
      return this.dbPromise;
    }
    makeKey(jid, chunkIndex, quality) {
      return `${jid}_chunk_${chunkIndex}_${quality}`;
    }
    /**
     * Lấy dữ liệu chunk nhị phân (.zip) đã lưu trên ổ cứng.
     * Trả về ArrayBuffer nếu có, null nếu chưa cache.
     */
    async getDiskChunk(jid, chunkIndex, quality) {
      try {
        const db = await this.getDb();
        return await new Promise((resolve) => {
          const tx = db.transaction(CHUNK_STORE, "readonly");
          const store = tx.objectStore(CHUNK_STORE);
          const req = store.get(this.makeKey(jid, chunkIndex, quality));
          req.onsuccess = () => {
            const record = req.result;
            resolve(record && record.data ? record.data : null);
          };
          req.onerror = () => {
            resolve(null);
          };
        });
      } catch (err) {
        console.warn("[Cache] Không thể đọc từ IndexedDB:", err);
        return null;
      }
    }
    /**
     * Kiểm tra nhanh xem chunk đã được lưu trên ổ cứng chưa.
     */
    async hasDiskChunk(jid, chunkIndex, quality) {
      try {
        const db = await this.getDb();
        return await new Promise((resolve) => {
          const tx = db.transaction(CHUNK_STORE, "readonly");
          const store = tx.objectStore(CHUNK_STORE);
          const req = store.count(this.makeKey(jid, chunkIndex, quality));
          req.onsuccess = () => {
            resolve(req.result > 0);
          };
          req.onerror = () => {
            resolve(false);
          };
        });
      } catch {
        return false;
      }
    }
    /**
     * Lưu dữ liệu chunk nhị phân (.zip) xuống ổ cứng.
     */
    async saveDiskChunk(jid, chunkIndex, quality, data) {
      try {
        const db = await this.getDb();
        await new Promise((resolve, reject) => {
          const tx = db.transaction(CHUNK_STORE, "readwrite");
          const store = tx.objectStore(CHUNK_STORE);
          const record = {
            key: this.makeKey(jid, chunkIndex, quality),
            jid,
            chunkIndex,
            quality,
            data,
            byteSize: data.byteLength,
            savedAt: Date.now()
          };
          const req = store.put(record);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
      } catch (err) {
        console.warn("[Cache] Không thể ghi xuống IndexedDB:", err);
      }
    }
    /**
     * Lấy thống kê dung lượng cache đã lưu cho Job này (hoặc toàn bộ nếu jid <= 0).
     */
    async getCacheStats(jid) {
      try {
        const db = await this.getDb();
        return await new Promise((resolve) => {
          const tx = db.transaction(CHUNK_STORE, "readonly");
          const store = tx.objectStore(CHUNK_STORE);
          let count = 0;
          let totalBytes = 0;
          const cursorReq = jid && jid > 0 ? store.index("by_jid").openCursor(IDBKeyRange.only(jid)) : store.openCursor();
          cursorReq.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
              count += 1;
              totalBytes += cursor.value.byteSize || 0;
              cursor.continue();
            } else {
              resolve({ count, totalBytes });
            }
          };
          cursorReq.onerror = () => {
            resolve({ count, totalBytes });
          };
        });
      } catch {
        return { count: 0, totalBytes: 0 };
      }
    }
    /**
     * Xóa cache của 1 Job cụ thể hoặc xóa toàn bộ database cache.
     */
    async clearCache(jid) {
      try {
        const db = await this.getDb();
        await new Promise((resolve, reject) => {
          const tx = db.transaction(CHUNK_STORE, "readwrite");
          const store = tx.objectStore(CHUNK_STORE);
          if (jid && jid > 0) {
            const index = store.index("by_jid");
            const req = index.openCursor(IDBKeyRange.only(jid));
            req.onsuccess = (e) => {
              const cursor = e.target.result;
              if (cursor) {
                cursor.delete();
                cursor.continue();
              } else {
                resolve();
              }
            };
            req.onerror = () => reject(req.error);
          } else {
            const req = store.clear();
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
          }
        });
      } catch (err) {
        console.warn("[Cache] Lỗi dọn cache:", err);
      }
    }
  }
  const PointCloudDiskStorage = new PointCloudDiskStorageManager();
  const MIME = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    bmp: "image/bmp",
    webp: "image/webp"
  };
  class FrameData {
    constructor(store, opts = {}) {
      __publicField(this, "clouds", /* @__PURE__ */ new Map());
      __publicField(this, "store");
      __publicField(this, "quality");
      __publicField(this, "chunkSize");
      __publicField(this, "chunks", /* @__PURE__ */ new Map());
      __publicField(this, "images", /* @__PURE__ */ new Map());
      __publicField(this, "urls", []);
      this.store = store;
      this.quality = opts.quality || "compressed";
      const meta = store.meta;
      this.chunkSize = (meta == null ? void 0 : meta.chunk_size) || 1;
    }
    /**
     * Tính vị trí chunk và offset cho frame.
     */
    position(frame) {
      const k = this.store.frames.indexOf(frame);
      if (k < 0) throw new Error(`Frame ${frame} không thuộc job`);
      return {
        chunk: Math.floor(k / this.chunkSize),
        offset: k % this.chunkSize
      };
    }
    /**
     * Tải chunk (nếu chưa tải):
     * 1. Ưu tiên kiểm tra ổ cứng (IndexedDB Cache) -> Nếu có, nạp ngay trong vài ms!
     * 2. Nếu chưa có -> Tải qua mạng -> Tự động lưu vĩnh viễn xuống ổ cứng cho lần sau.
     */
    loadChunk(index, onBytes, onSource) {
      if (!this.chunks.has(index)) {
        const p = (async () => {
          let buf = await PointCloudDiskStorage.getDiskChunk(
            this.store.jid,
            index,
            this.quality
          );
          if (buf) {
            onSource == null ? void 0 : onSource(true);
            onBytes == null ? void 0 : onBytes(buf.byteLength, buf.byteLength);
          } else {
            onSource == null ? void 0 : onSource(false);
            buf = await helperApi.getChunk(
              this.store.jid,
              index,
              this.quality,
              onBytes
            );
            PointCloudDiskStorage.saveDiskChunk(
              this.store.jid,
              index,
              this.quality,
              buf
            );
          }
          const entries = listZipEntries(buf);
          const base = index * this.chunkSize;
          await Promise.all(
            entries.map(async (entry, i) => {
              const frame = this.store.frames[base + i];
              if (frame === void 0) return;
              this.clouds.set(frame, parsePCD(await entry.read()));
            })
          );
        })();
        p.catch(() => this.chunks.delete(index));
        this.chunks.set(index, p);
      }
      return this.chunks.get(index);
    }
    /**
     * Lấy point cloud cho frame (tải chunk nếu cần).
     */
    async cloud(frame) {
      if (this.clouds.has(frame)) return this.clouds.get(frame);
      await this.loadChunk(this.position(frame).chunk);
      return this.clouds.get(frame) || new Float32Array(0);
    }
    /**
     * Tải trước point cloud cho dải frame (song song `concurrency` chunk), báo tiến độ.
     */
    async preload(frames, onProgress, concurrency = 3) {
      const needed = [
        ...new Set(frames.map((f) => this.position(f).chunk))
      ];
      const parts = new Map(
        needed.map((c) => [c, this.chunks.has(c) ? null : 0])
      );
      let done = 0;
      let diskCount = 0;
      let loadedBytes = 0;
      const bytes = /* @__PURE__ */ new Map();
      const report = (chunk = null) => {
        let partial = 0;
        for (const v of parts.values()) if (v) partial += v;
        onProgress == null ? void 0 : onProgress({
          done,
          total: needed.length,
          loadedBytes,
          chunk,
          diskCount,
          fraction: needed.length ? Math.min(1, (done + partial) / needed.length) : 1
        });
      };
      report();
      const queue = needed.slice();
      const worker = async () => {
        while (queue.length) {
          const c = queue.shift();
          await this.loadChunk(
            c,
            (loaded, total) => {
              loadedBytes += loaded - (bytes.get(c) || 0);
              bytes.set(c, loaded);
              parts.set(c, total ? Math.min(0.99, loaded / total) : 0);
              report();
            },
            (fromDisk) => {
              if (fromDisk) {
                diskCount += 1;
              }
            }
          );
          parts.set(c, null);
          done += 1;
          report(c);
        }
      };
      await Promise.all(
        Array.from(
          { length: Math.min(concurrency, needed.length) },
          () => worker()
        )
      );
    }
    /**
     * Lấy context images (ảnh camera) cho frame.
     */
    contextImages(frame) {
      if (!this.images.has(frame)) {
        const p = (async () => {
          const meta = this.store.meta;
          const framesArr = (meta == null ? void 0 : meta.frames) || [];
          const frameIndex = this.store.frames.indexOf(frame);
          const frameMeta = framesArr[frameIndex] || framesArr[0];
          if (frameMeta && frameMeta.related_files === 0) return [];
          const buf = await helperApi.getContextImages(this.store.jid, frame);
          const entries = listZipEntries(buf);
          const out = [];
          for (const entry of entries) {
            const ext = entry.name.split(".").pop().toLowerCase();
            const rawBytes = await entry.read();
            const url = URL.createObjectURL(
              new Blob([rawBytes.buffer], {
                type: MIME[ext] || "application/octet-stream"
              })
            );
            this.urls.push(url);
            out.push({ name: entry.name.split("/").pop(), url });
          }
          return out;
        })();
        p.catch(() => this.images.delete(frame));
        this.images.set(frame, p);
      }
      return this.images.get(frame);
    }
    /**
     * Giải phóng toàn bộ tài nguyên (Object URLs, clouds, chunks, images).
     */
    dispose() {
      for (const url of this.urls) URL.revokeObjectURL(url);
      this.urls = [];
      this.clouds.clear();
      this.chunks.clear();
      this.images.clear();
    }
  }
  function h$3(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props ?? {})) {
      if (v === void 0 || v === null || v === false) continue;
      if (k.startsWith("on") && typeof v === "function") {
        el.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === "class") {
        el.className = v;
      } else if (k === "style" && typeof v === "object") {
        Object.assign(el.style, v);
      } else if (k in el && typeof v !== "string") {
        el[k] = v;
      } else {
        el.setAttribute(k, v === true ? "" : String(v));
      }
    }
    for (const c of children.flat()) {
      if (c === null || c === void 0 || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }
  const MODES = [
    ["bottom", "Giữ đáy box (khuyên dùng)"],
    ["center", "Giữ tâm box (giống CVAT)"],
    ["ground", "Bám mặt đất theo point cloud"]
  ];
  function median(values) {
    const s = values.slice().sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)] : NaN;
  }
  function fmt$1(v, n = 2) {
    return Number.isFinite(v) ? v.toFixed(n) : "–";
  }
  function mountCase1(app, root) {
    const store = app.store;
    const frames = store.frames;
    const range = { from: frames[0], to: frames[frames.length - 1] };
    const inputs = /* @__PURE__ */ new Map();
    const modeSel = h$3(
      "select",
      { onchange: () => {
        app.settings.sizeMode = modeSel.value;
      } },
      ...MODES.map(
        ([v, t]) => h$3("option", { value: v, selected: app.settings.sizeMode === v }, t)
      )
    );
    const fromIn = h$3("input", {
      type: "number",
      value: String(range.from),
      min: String(frames[0]),
      max: String(frames[frames.length - 1]),
      onchange: () => {
        range.from = Number(fromIn.value);
      }
    });
    const toIn = h$3("input", {
      type: "number",
      value: String(range.to),
      min: String(frames[0]),
      max: String(frames[frames.length - 1]),
      onchange: () => {
        range.to = Number(toIn.value);
      }
    });
    const progress = h$3("span", { class: "progress" });
    const tbody = h$3("tbody");
    const table = h$3(
      "table",
      {},
      h$3(
        "thead",
        {},
        h$3(
          "tr",
          {},
          ...[
            "ID",
            "Label",
            "Frame",
            "Keyframe",
            "L / W / H hiện tại (trung vị)",
            "L mới",
            "W mới",
            "H mới",
            "Lấy kích thước từ frame",
            "",
            ""
          ].map(
            (t) => h$3("th", {}, t)
          )
        )
      ),
      tbody
    );
    root.append(
      h$3(
        "div",
        { class: "bar" },
        h$3("label", {}, "Khi đổi kích thước:", modeSel),
        h$3("label", {}, "Áp dụng cho frame", fromIn, "→", toIn),
        progress
      ),
      h$3(
        "div",
        { class: "bar help" },
        "Giữ đáy: đổi H thì đáy box đứng yên, chỉ nóc box dịch chuyển. ",
        "Bám mặt đất: đặt đáy box lên mặt đất ước lượng từ point cloud quanh box (tải point cloud, chậm hơn). ",
        'Chỉ keyframe được sửa – frame nội suy tự đi theo. Thay đổi chỉ nằm trong tool cho tới khi bấm "Lưu lên CVAT".'
      ),
      h$3("div", { class: "scroll" }, table)
    );
    function inRange(f) {
      return f >= Math.min(range.from, range.to) && f <= Math.max(range.from, range.to);
    }
    async function apply(track2, size) {
      const keyframes = track2.shapes.filter((s) => inRange(s.frame));
      if (!keyframes.length) {
        app.setStatus("Không có keyframe nào trong dải frame.", "err");
        return;
      }
      const mode = app.settings.sizeMode;
      if (mode === "ground") {
        await app.getFrames().preload(
          keyframes.map((s) => s.frame),
          (p) => {
            progress.textContent = `Tải point cloud ${Math.round(p.fraction * 100)}% (${p.done}/${p.total} chunk)…`;
          }
        );
      }
      app.snapshot([track2.id]);
      let failed = 0;
      for (const shape of keyframes) {
        const box = pointsToBox(shape.points);
        const res = await app.resizeBox(box, size, shape.frame, mode);
        if (!res.ok) failed += 1;
        shape.points = boxToPoints(res.box, shape.points);
      }
      track2.dirty = true;
      progress.textContent = "";
      app.setStatus(
        `ID ${track2.uiId}: đã sửa ${keyframes.length} keyframe (chưa lưu)` + (failed ? ` · ${failed} frame không đủ điểm mặt đất → giữ đáy` : ""),
        failed ? "err" : "ok"
      );
      app.changed();
    }
    async function snapOnly(track2) {
      const keyframes = track2.shapes.filter((s) => inRange(s.frame) && !s.outside);
      await app.getFrames().preload(
        keyframes.map((s) => s.frame),
        (p) => {
          progress.textContent = `Tải point cloud ${Math.round(p.fraction * 100)}% (${p.done}/${p.total} chunk)…`;
        }
      );
      app.snapshot([track2.id]);
      let failed = 0;
      for (const shape of keyframes) {
        const cloud = await app.getFrames().cloud(shape.frame);
        const res = snapToGround(cloud, pointsToBox(shape.points));
        if (!res) {
          failed += 1;
          continue;
        }
        shape.points = boxToPoints(res.box, shape.points);
      }
      track2.dirty = true;
      progress.textContent = "";
      app.setStatus(
        `ID ${track2.uiId}: đã đặt ${keyframes.length - failed} keyframe chạm đất` + (failed ? ` · ${failed} frame không đủ điểm` : ""),
        failed ? "err" : "ok"
      );
      app.changed();
    }
    function render() {
      tbody.replaceChildren();
      const tracks = [...store.tracks.values()].sort((a, b) => a.uiId - b.uiId);
      if (!tracks.length) {
        tbody.append(
          h$3("tr", {}, h$3("td", { colSpan: "11", class: "muted" }, "Job không có track cuboid nào."))
        );
        return;
      }
      for (const t of tracks) {
        const sizes = t.shapes.map((s) => s.points.slice(6, 9));
        const med = [0, 1, 2].map((i) => median(sizes.map((s) => s[i])));
        const lo = [0, 1, 2].map((i) => Math.min(...sizes.map((s) => s[i])));
        const hi = [0, 1, 2].map((i) => Math.max(...sizes.map((s) => s[i])));
        const varies = [0, 1, 2].some((i) => hi[i] - lo[i] > 5e-3);
        const state = inputs.get(t.id) || { L: "", W: "", H: "", from: t.firstFrame };
        inputs.set(t.id, state);
        const mk = (key) => {
          const input = h$3("input", {
            type: "number",
            step: "0.01",
            min: "0.05",
            value: state[key],
            placeholder: fmt$1(med["LWH".indexOf(key)]),
            oninput: (e) => {
              state[key] = e.target.value;
            }
          });
          return input;
        };
        const L = mk("L");
        const W = mk("W");
        const H = mk("H");
        const fromFrame = h$3("input", {
          type: "number",
          value: String(state.from),
          min: String(t.firstFrame),
          max: String(t.lastFrame),
          oninput: (e) => {
            state.from = Number(e.target.value);
          }
        });
        const pick = () => {
          const pos = t.at(Number(fromFrame.value));
          if (!pos) return;
          [state.L, state.W, state.H] = pos.box.s.map((v) => v.toFixed(3));
          L.value = state.L;
          W.value = state.W;
          H.value = state.H;
        };
        const applyBtn = h$3(
          "button",
          {
            class: "primary small",
            onclick: async () => {
              const size = [L, W, H].map(
                (el, i) => el.value === "" ? med[i] : Number(el.value)
              );
              if (size.some((v) => !Number.isFinite(v) || v <= 0)) {
                app.setStatus("L/W/H không hợp lệ", "err");
                return;
              }
              applyBtn.disabled = true;
              try {
                await apply(t, size);
              } catch (err) {
                app.setStatus(`Lỗi: ${err.message}`, "err");
              } finally {
                applyBtn.disabled = false;
              }
            }
          },
          "Áp dụng"
        );
        const kfCount = t.shapes.length;
        tbody.append(
          h$3(
            "tr",
            { class: t.dirty ? "dirty" : "" },
            h$3(
              "td",
              {},
              h$3("b", {}, `#${t.uiId}`),
              h$3("span", { class: "muted" }, t.serverId ? ` (server ${t.serverId})` : " (mới)")
            ),
            h$3(
              "td",
              {},
              h$3("span", { class: "dot", style: { background: store.labelColor(t.labelId) } }),
              store.labelName(t.labelId)
            ),
            h$3("td", {}, `f${t.firstFrame} → f${t.lastFrame}`),
            h$3("td", {}, String(kfCount)),
            h$3(
              "td",
              {
                title: varies ? `min ${lo.map((v) => fmt$1(v)).join(" / ")}
max ${hi.map((v) => fmt$1(v)).join(" / ")}` : ""
              },
              med.map((v) => fmt$1(v)).join(" / "),
              varies ? h$3("span", { class: "kf out", style: { marginLeft: "6px" } }, "không đều") : null
            ),
            h$3("td", {}, L),
            h$3("td", {}, W),
            h$3("td", {}, H),
            h$3(
              "td",
              {},
              fromFrame,
              " ",
              h$3("button", { class: "small", onclick: pick }, "⤵ lấy")
            ),
            h$3(
              "td",
              {},
              applyBtn,
              " ",
              h$3(
                "button",
                {
                  class: "small",
                  title: "Chỉ nâng/hạ box cho đáy chạm đất, không đổi kích thước",
                  onclick: () => snapOnly(t).catch(
                    (err) => app.setStatus(`Lỗi: ${err.message}`, "err")
                  )
                },
                "⇩ Chạm đất"
              )
            ),
            h$3(
              "td",
              {},
              h$3(
                "button",
                { class: "small", onclick: () => app.switchTab("case2", t.id) },
                "Mở Case 2 →"
              )
            )
          )
        );
      }
    }
    render();
    return {
      refresh: render,
      unmount() {
      }
    };
  }
  const VIEWS = {
    // u = trục ngang màn hình, v = trục dọc (lên trên), d = trục chiều sâu (đều là trục cục bộ của box)
    top: { u: "ex", v: "ey", d: "ez", ui: 0, vi: 1, di: 2 },
    side: { u: "ex", v: "ez", d: "ey", ui: 0, vi: 2, di: 1 },
    front: { u: "ey", v: "ez", d: "ex", ui: 1, vi: 2, di: 0 }
  };
  const VS = `#version 300 es
  in vec3 aPos;
  uniform vec3 uC, uU, uV, uD;
  uniform vec2 uScale, uDepth, uPan;
  uniform float uPointSize;
  uniform vec3 uBC, uBx, uBy, uBz, uBHalf;
  uniform vec3 uColIn, uColOut;
  out vec3 vCol;
  void main() {
    vec3 w = aPos - uC;
    float d = dot(w, uD);
    if (d < uDepth.x || d > uDepth.y) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      vCol = vec3(0.0);
      return;
    }
    gl_Position = vec4(dot(w, uU) * uScale.x + uPan.x, dot(w, uV) * uScale.y + uPan.y, 0.0, 1.0);
    gl_PointSize = uPointSize;
    vec3 b = aPos - uBC;
    vec3 q = vec3(dot(b, uBx), dot(b, uBy), dot(b, uBz));
    vCol = all(lessThanEqual(abs(q), uBHalf)) ? uColIn : uColOut;
  }`;
  const FS = `#version 300 es
  precision mediump float;
  in vec3 vCol;
  out vec4 outColor;
  void main() { outColor = vec4(vCol, 1.0); }`;
  function compile(gl, type, src) {
    const s = gl.createShader(type);
    if (!s) throw new Error("Không thể tạo WebGL shader");
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error(info || "Lỗi biên dịch shader");
    }
    return s;
  }
  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex || "");
    return m ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255] : [0.35, 0.82, 0.48];
  }
  const HANDLE_R = 7;
  const dotVec = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const addVec = (u, v) => [u[0] + v[0], u[1] + v[1], u[2] + v[2]];
  const subVec = (u, v) => [u[0] - v[0], u[1] - v[1], u[2] - v[2]];
  const scaleVec = (u, k) => [u[0] * k, u[1] * k, u[2] * k];
  function localToWorldVec(q, c, ax) {
    return addVec(c, addVec(scaleVec(ax.ex, q[0]), addVec(scaleVec(ax.ey, q[1]), scaleVec(ax.ez, q[2]))));
  }
  function worldToLocalVec(p, c, ax) {
    const v = subVec(p, c);
    return [dotVec(v, ax.ex), dotVec(v, ax.ey), dotVec(v, ax.ez)];
  }
  class GridViewWebGL {
    constructor(opts) {
      __publicField(this, "wrap");
      __publicField(this, "scroller");
      __publicField(this, "getCloud");
      __publicField(this, "getBox");
      __publicField(this, "onEditStart");
      __publicField(this, "onEdit");
      __publicField(this, "onEditEnd");
      __publicField(this, "onEditCancel");
      __publicField(this, "onZoom");
      __publicField(this, "settings");
      __publicField(this, "cells", /* @__PURE__ */ new Set());
      __publicField(this, "buffers", /* @__PURE__ */ new Map());
      __publicField(this, "drag", null);
      __publicField(this, "pending", false);
      __publicField(this, "dpr", 1);
      __publicField(this, "glCanvas");
      __publicField(this, "uiCanvas");
      __publicField(this, "gl");
      __publicField(this, "ctx");
      __publicField(this, "prog");
      __publicField(this, "loc", {});
      __publicField(this, "aPos");
      __publicField(this, "vao");
      __publicField(this, "onScroll");
      __publicField(this, "resizeObs");
      this.wrap = opts.wrap;
      this.scroller = opts.scroller;
      this.getCloud = opts.getCloud;
      this.getBox = opts.getBox;
      this.onEditStart = opts.onEditStart;
      this.onEdit = opts.onEdit;
      this.onEditEnd = opts.onEditEnd;
      this.onEditCancel = opts.onEditCancel;
      this.onZoom = opts.onZoom;
      this.settings = opts.settings;
      this.glCanvas = document.createElement("canvas");
      this.uiCanvas = document.createElement("canvas");
      for (const c of [this.uiCanvas, this.glCanvas]) {
        Object.assign(c.style, { position: "absolute", left: "0", top: "0", pointerEvents: "none" });
        this.wrap.insertBefore(c, this.wrap.firstChild);
      }
      if (getComputedStyle(this.scroller).position === "static") {
        this.scroller.style.position = "relative";
      }
      this.scroller.style.zIndex = "1";
      const gl = this.glCanvas.getContext("webgl2", {
        antialias: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false
      });
      if (!gl) throw new Error("Trình duyệt không hỗ trợ WebGL2");
      this.gl = gl;
      const ctx = this.uiCanvas.getContext("2d");
      if (!ctx) throw new Error("Không thể khởi tạo 2D Context");
      this.ctx = ctx;
      const prog = gl.createProgram();
      if (!prog) throw new Error("Không thể tạo WebGL Program");
      gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(prog) || "Lỗi link shader");
      }
      this.prog = prog;
      for (const n of [
        "uC",
        "uU",
        "uV",
        "uD",
        "uScale",
        "uDepth",
        "uPan",
        "uPointSize",
        "uBC",
        "uBx",
        "uBy",
        "uBz",
        "uBHalf",
        "uColIn",
        "uColOut"
      ]) {
        this.loc[n] = gl.getUniformLocation(prog, n);
      }
      this.aPos = gl.getAttribLocation(prog, "aPos");
      this.vao = gl.createVertexArray();
      this.onScroll = () => this.requestRender();
      this.scroller.addEventListener("scroll", this.onScroll, { passive: true });
      this.resizeObs = new ResizeObserver(() => this.resize());
      this.resizeObs.observe(this.wrap);
      this.resize();
    }
    destroy() {
      var _a;
      this.scroller.removeEventListener("scroll", this.onScroll);
      this.resizeObs.disconnect();
      for (const b of this.buffers.values()) {
        this.gl.deleteBuffer(b.buf);
      }
      this.buffers.clear();
      (_a = this.gl.getExtension("WEBGL_lose_context")) == null ? void 0 : _a.loseContext();
      this.glCanvas.remove();
      this.uiCanvas.remove();
    }
    resize() {
      const dpr = window.devicePixelRatio || 1;
      const w = this.wrap.clientWidth;
      const h2 = this.wrap.clientHeight;
      this.dpr = dpr;
      for (const c of [this.glCanvas, this.uiCanvas]) {
        c.width = Math.max(1, Math.round(w * dpr));
        c.height = Math.max(1, Math.round(h2 * dpr));
        c.style.width = `${w}px`;
        c.style.height = `${h2}px`;
      }
      this.requestRender();
    }
    addCell(el, frame, view) {
      const cell = { el, frame, view, zoom: 1, pan: [0, 0] };
      this.cells.add(cell);
      el.addEventListener("pointerdown", (e) => this.pointerDown(e, cell));
      el.addEventListener("pointermove", (e) => this.pointerHover(e, cell));
      el.addEventListener("wheel", (e) => this.wheel(e, cell), { passive: false });
      el.addEventListener("contextmenu", (e) => e.preventDefault());
      el.addEventListener("dblclick", (e) => {
        const r = el.getBoundingClientRect();
        if (!this.hit(cell, e.clientX - r.left, e.clientY - r.top)) {
          this.resetCell(cell);
        }
      });
      return cell;
    }
    removeCell(cell) {
      this.cells.delete(cell);
      this.requestRender();
    }
    zoomCell(cell, k, mx, my) {
      var _a;
      const rect = this.cellRect(cell);
      if (mx === void 0) mx = rect.w / 2;
      if (my === void 0) my = rect.h / 2;
      const nz = Math.min(30, Math.max(0.1, cell.zoom * k));
      k = nz / cell.zoom;
      cell.pan[0] = mx - rect.w / 2 - (mx - rect.w / 2 - cell.pan[0]) * k;
      cell.pan[1] = my - rect.h / 2 - (my - rect.h / 2 - cell.pan[1]) * k;
      cell.zoom = nz;
      (_a = this.onZoom) == null ? void 0 : _a.call(this, cell);
      this.requestRender();
    }
    resetCell(cell) {
      var _a;
      cell.zoom = 1;
      cell.pan = [0, 0];
      (_a = this.onZoom) == null ? void 0 : _a.call(this, cell);
      this.requestRender();
    }
    clearCells() {
      this.cells.clear();
    }
    invalidateCloud(frame) {
      const b = this.buffers.get(frame);
      if (b) {
        this.gl.deleteBuffer(b.buf);
        this.buffers.delete(frame);
      }
      this.requestRender();
    }
    requestRender() {
      if (this.pending) return;
      this.pending = true;
      requestAnimationFrame(() => {
        this.pending = false;
        this.render();
      });
    }
    // ---------- camera ----------
    ppm(cell, w, h2) {
      const S = this.settings;
      let k;
      if (S.sceneSpan) {
        k = w / S.sceneSpan;
      } else {
        const s = S.refSize;
        const V = VIEWS[cell.view];
        const fit = S.context ? 2.6 : 1.7;
        k = Math.min(w / (s[V.ui] * fit), h2 / (s[V.vi] * fit));
      }
      return k * (S.zoom[cell.view] || 1) * (cell.zoom || 1);
    }
    camera(cell, pos) {
      if (this.drag && this.drag.cell === cell && this.drag.cam) return this.drag.cam;
      return {
        c: [pos.box.c[0], pos.box.c[1], pos.box.c[2]],
        ax: axes(pos.box.r),
        half: [pos.box.s[0] / 2, pos.box.s[1] / 2, pos.box.s[2] / 2],
        pan: cell.pan
      };
    }
    cellRect(cell) {
      const r = cell.el.getBoundingClientRect();
      const wr = this.wrap.getBoundingClientRect();
      return { x: r.left - wr.left, y: r.top - wr.top, w: r.width, h: r.height };
    }
    visibleRect() {
      const sr = this.scroller.getBoundingClientRect();
      const wr = this.wrap.getBoundingClientRect();
      return {
        x: sr.left - wr.left,
        y: sr.top - wr.top,
        w: this.scroller.clientWidth,
        h: this.scroller.clientHeight
      };
    }
    project(p, cam, view, rect, ppm) {
      const V = VIEWS[view];
      const w = subVec(p, cam.c);
      return [
        rect.w / 2 + cam.pan[0] + dotVec(w, cam.ax[V.u]) * ppm,
        rect.h / 2 + cam.pan[1] - dotVec(w, cam.ax[V.v]) * ppm
      ];
    }
    unproject(px, py, cam, view, rect, ppm) {
      const V = VIEWS[view];
      const u = (px - rect.w / 2 - cam.pan[0]) / ppm;
      const v = -(py - rect.h / 2 - cam.pan[1]) / ppm;
      return addVec(cam.c, addVec(scaleVec(cam.ax[V.u], u), scaleVec(cam.ax[V.v], v)));
    }
    // ---------- render ----------
    uploadCloud(frame) {
      const array = this.getCloud(frame);
      if (!array) return null;
      let b = this.buffers.get(frame);
      if (b && b.array === array) return b;
      const gl = this.gl;
      if (b) gl.deleteBuffer(b.buf);
      const buf = gl.createBuffer();
      if (!buf) return null;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, array, gl.STATIC_DRAW);
      b = { array, buf, count: array.length / 3 };
      this.buffers.set(frame, b);
      return b;
    }
    render() {
      const gl = this.gl;
      const ctx = this.ctx;
      const dpr = this.dpr;
      const H = this.glCanvas.height;
      const vis = this.visibleRect();
      const S = this.settings;
      const colIn = hexToRgb(S.color);
      const colOut = [0.78, 0.78, 0.78];
      gl.disable(gl.SCISSOR_TEST);
      gl.viewport(0, 0, this.glCanvas.width, H);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.uiCanvas.width, this.uiCanvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      gl.useProgram(this.prog);
      gl.bindVertexArray(this.vao);
      gl.enable(gl.SCISSOR_TEST);
      for (const cell of this.cells) {
        const r = this.cellRect(cell);
        const x0 = Math.max(r.x, vis.x);
        const y0 = Math.max(r.y, vis.y);
        const x1 = Math.min(r.x + r.w, vis.x + vis.w);
        const y1 = Math.min(r.y + r.h, vis.y + vis.h);
        if (x1 <= x0 || y1 <= y0) continue;
        const pos = this.getBox(cell.frame);
        gl.scissor(
          Math.round(x0 * dpr),
          Math.round(H - y1 * dpr),
          Math.round((x1 - x0) * dpr),
          Math.round((y1 - y0) * dpr)
        );
        gl.viewport(
          Math.round(r.x * dpr),
          Math.round(H - (r.y + r.h) * dpr),
          Math.round(r.w * dpr),
          Math.round(r.h * dpr)
        );
        gl.clearColor(0.02, 0.02, 0.03, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        if (!pos) continue;
        const V = VIEWS[cell.view];
        const cam = this.camera(cell, pos);
        const ppm = this.ppm(cell, r.w, r.h);
        const buf = this.uploadCloud(cell.frame);
        if (buf && buf.count) {
          const slab = S.slab;
          const hd = cam.half[V.di];
          let depth;
          if (cell.view === "top") {
            if (S.topAll || S.context) {
              depth = [S.hideGround ? -cam.half[2] + 0.12 : -1e6, 1e6];
            } else {
              depth = [S.hideGround ? -cam.half[2] + 0.12 : -cam.half[2] - 1.5, cam.half[2] + 0.5];
            }
          } else {
            depth = [-hd - slab, hd + slab];
          }
          const bax = axes(pos.box.r);
          const l = this.loc;
          gl.uniform3fv(l.uC, cam.c);
          gl.uniform3fv(l.uU, cam.ax[V.u]);
          gl.uniform3fv(l.uV, cam.ax[V.v]);
          gl.uniform3fv(l.uD, cam.ax[V.d]);
          gl.uniform2f(l.uScale, 2 * ppm / r.w, 2 * ppm / r.h);
          gl.uniform2f(l.uPan, 2 * cam.pan[0] / r.w, -2 * cam.pan[1] / r.h);
          gl.uniform2f(l.uDepth, depth[0], depth[1]);
          gl.uniform1f(l.uPointSize, S.pointSize * dpr);
          gl.uniform3fv(l.uBC, pos.box.c);
          gl.uniform3fv(l.uBx, bax.ex);
          gl.uniform3fv(l.uBy, bax.ey);
          gl.uniform3fv(l.uBz, bax.ez);
          gl.uniform3fv(l.uBHalf, [pos.box.s[0] / 2 + 0.02, pos.box.s[1] / 2 + 0.02, pos.box.s[2] / 2 + 0.02]);
          gl.uniform3fv(l.uColIn, colIn);
          gl.uniform3fv(l.uColOut, colOut);
          gl.bindBuffer(gl.ARRAY_BUFFER, buf.buf);
          gl.enableVertexAttribArray(this.aPos);
          gl.vertexAttribPointer(this.aPos, 3, gl.FLOAT, false, 0, 0);
          gl.drawArrays(gl.POINTS, 0, buf.count);
        }
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0, y0, x1 - x0, y1 - y0);
        ctx.clip();
        ctx.translate(r.x, r.y);
        this.drawBox(ctx, cell, pos, cam, r, ppm, !buf);
        ctx.restore();
      }
      gl.disable(gl.SCISSOR_TEST);
    }
    handles(cell, pos, cam, rect, ppm) {
      const V = VIEWS[cell.view];
      const box = pos.box;
      const ax = axes(box.r);
      const h2 = [box.s[0] / 2, box.s[1] / 2, box.s[2] / 2];
      const P = (a, b) => {
        const q = [0, 0, 0];
        q[V.ui] = a * h2[V.ui];
        q[V.vi] = b * h2[V.vi];
        return this.project(localToWorldVec(q, box.c, ax), cam, cell.view, rect, ppm);
      };
      const list = [];
      for (const a of [-1, 0, 1]) {
        for (const b of [-1, 0, 1]) {
          if (a === 0 && b === 0) continue;
          list.push({ kind: "resize", a, b, p: P(a, b) });
        }
      }
      const center = P(0, 0);
      const top = P(0, 1);
      const dx = top[0] - center[0];
      const dy = top[1] - center[1];
      const len = Math.hypot(dx, dy) || 1;
      const rot = [top[0] + dx / len * 22, top[1] + dy / len * 22];
      return { list, center, top, rot, P };
    }
    drawBox(ctx, cell, pos, cam, rect, ppm, noCloud) {
      const color = pos.outside ? "#888888" : this.settings.color;
      const corners = boxCorners(pos.box).map(
        (p) => this.project([p[0], p[1], p[2]], cam, cell.view, rect, ppm)
      );
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = color;
      ctx.setLineDash(pos.keyframe ? [] : [5, 4]);
      ctx.beginPath();
      for (const [i, j] of BOX_EDGES) {
        ctx.moveTo(corners[i][0], corners[i][1]);
        ctx.lineTo(corners[j][0], corners[j][1]);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillStyle = "#dddddd";
      ctx.fillText(cell.view.toUpperCase(), 6, 14);
      if (pos.outside) {
        ctx.fillStyle = "#f0a020";
        ctx.fillText("OUTSIDE", 6, 28);
      }
      if (noCloud) {
        ctx.fillStyle = "#aaaaaa";
        ctx.fillText("đang tải point cloud…", 6, rect.h - 8);
      }
      if (pos.outside) return;
      const hs = this.handles(cell, pos, cam, rect, ppm);
      const canRotate = cell.view === "top" || this.settings.allowTilt;
      if (canRotate) {
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(hs.top[0], hs.top[1]);
        ctx.lineTo(hs.rot[0], hs.rot[1]);
        ctx.stroke();
        ctx.fillStyle = "#ffd33d";
        ctx.beginPath();
        ctx.arc(hs.rot[0], hs.rot[1], 5, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const hd of hs.list) {
        ctx.fillStyle = hd.a !== 0 && hd.b !== 0 ? "#ff4d4d" : "#ffffff";
        ctx.fillRect(hd.p[0] - 3, hd.p[1] - 3, 6, 6);
      }
      if (cell.view === "top") {
        const front = hs.P(1, 0);
        ctx.strokeStyle = "#ff4d4d";
        ctx.beginPath();
        ctx.moveTo(hs.center[0], hs.center[1]);
        ctx.lineTo(front[0], front[1]);
        ctx.stroke();
      }
    }
    // ---------- interaction ----------
    hit(cell, mx, my) {
      const pos = this.getBox(cell.frame);
      if (!pos || pos.outside) return null;
      const rect = this.cellRect(cell);
      const cam = this.camera(cell, pos);
      const ppm = this.ppm(cell, rect.w, rect.h);
      const hs = this.handles(cell, pos, cam, rect, ppm);
      const canRotate = cell.view === "top" || this.settings.allowTilt;
      if (canRotate && Math.hypot(mx - hs.rot[0], my - hs.rot[1]) <= HANDLE_R + 2) {
        return { kind: "rotate", pos, cam, rect, ppm, hs };
      }
      let best = null;
      for (const hd of hs.list) {
        const d = Math.hypot(mx - hd.p[0], my - hd.p[1]);
        if (d <= HANDLE_R && (!best || d < best.d)) {
          best = { a: hd.a, b: hd.b, d };
        }
      }
      if (best) {
        return { kind: "resize", a: best.a, b: best.b, pos, cam, rect, ppm, hs };
      }
      const V = VIEWS[cell.view];
      const ax = axes(pos.box.r);
      const p = this.unproject(mx, my, cam, cell.view, rect, ppm);
      const q = worldToLocalVec(p, pos.box.c, ax);
      const hu = pos.box.s[V.ui] / 2;
      const hv = pos.box.s[V.vi] / 2;
      const tol = 5 / ppm;
      const inU = Math.abs(q[V.ui]) <= hu + tol;
      const inV = Math.abs(q[V.vi]) <= hv + tol;
      if (inV && Math.abs(Math.abs(q[V.ui]) - hu) <= tol) {
        return { kind: "resize", a: Math.sign(q[V.ui]) || 1, b: 0, pos, cam, rect, ppm, hs };
      }
      if (inU && Math.abs(Math.abs(q[V.vi]) - hv) <= tol) {
        return { kind: "resize", a: 0, b: Math.sign(q[V.vi]) || 1, pos, cam, rect, ppm, hs };
      }
      if (Math.abs(q[V.ui]) < hu && Math.abs(q[V.vi]) < hv) {
        return { kind: "move", pos, cam, rect, ppm, hs };
      }
      return null;
    }
    pointerHover(e, cell) {
      if (this.drag) return;
      const r = cell.el.getBoundingClientRect();
      const h2 = this.hit(cell, e.clientX - r.left, e.clientY - r.top);
      let cursor = "grab";
      if (h2) {
        if (h2.kind === "move") cursor = "move";
        else if (h2.kind === "rotate") cursor = "grab";
        else if (h2.a && h2.b) cursor = "nwse-resize";
        else cursor = h2.a ? "ew-resize" : "ns-resize";
      }
      cell.el.style.cursor = cursor;
    }
    panDrag(e, cell) {
      e.preventDefault();
      cell.el.setPointerCapture(e.pointerId);
      cell.el.style.cursor = "grabbing";
      let lx = e.clientX;
      let ly = e.clientY;
      const move = (ev) => {
        cell.pan[0] += ev.clientX - lx;
        cell.pan[1] += ev.clientY - ly;
        lx = ev.clientX;
        ly = ev.clientY;
        this.requestRender();
      };
      const up = () => {
        cell.el.style.cursor = "";
        cell.el.removeEventListener("pointermove", move);
        cell.el.removeEventListener("pointerup", up);
        cell.el.removeEventListener("pointercancel", up);
      };
      cell.el.addEventListener("pointermove", move);
      cell.el.addEventListener("pointerup", up);
      cell.el.addEventListener("pointercancel", up);
    }
    pointerDown(e, cell) {
      var _a;
      if (e.target !== cell.el) return;
      const r = cell.el.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      if (e.button === 1 || e.button === 2) {
        this.panDrag(e, cell);
        return;
      }
      if (e.button !== 0) return;
      const h2 = this.hit(cell, mx, my);
      if (!h2) {
        this.panDrag(e, cell);
        return;
      }
      e.preventDefault();
      cell.el.setPointerCapture(e.pointerId);
      const startBox = cloneBox(h2.pos.box);
      const cam = {
        c: [h2.cam.c[0], h2.cam.c[1], h2.cam.c[2]],
        ax: h2.cam.ax,
        half: [h2.cam.half[0], h2.cam.half[1], h2.cam.half[2]],
        pan: [h2.cam.pan[0], h2.cam.pan[1]]
      };
      this.drag = {
        cell,
        kind: h2.kind,
        a: h2.a,
        b: h2.b,
        startBox,
        cam,
        rect: h2.rect,
        ppm: h2.ppm,
        p0: this.unproject(mx, my, cam, cell.view, h2.rect, h2.ppm),
        ang0: Math.atan2(-(my - h2.hs.center[1]), mx - h2.hs.center[0]),
        moved: false
      };
      (_a = this.onEditStart) == null ? void 0 : _a.call(this, cell.frame);
      const move = (ev) => this.pointerMove(ev, cell);
      const up = () => {
        var _a2, _b;
        cell.el.removeEventListener("pointermove", move);
        cell.el.removeEventListener("pointerup", up);
        cell.el.removeEventListener("pointercancel", up);
        const d = this.drag;
        this.drag = null;
        if (d) {
          if (d.moved) {
            const currentPos = this.getBox(cell.frame);
            if (currentPos) {
              (_a2 = this.onEditEnd) == null ? void 0 : _a2.call(this, cell.frame, d.startBox, currentPos.box);
            }
          } else {
            (_b = this.onEditCancel) == null ? void 0 : _b.call(this, cell.frame);
          }
        }
        this.requestRender();
      };
      cell.el.addEventListener("pointermove", move);
      cell.el.addEventListener("pointerup", up);
      cell.el.addEventListener("pointercancel", up);
    }
    pointerMove(e, cell) {
      var _a;
      const d = this.drag;
      if (!d || d.cell !== cell) return;
      const r = cell.el.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const V = VIEWS[cell.view];
      const box = cloneBox(d.startBox);
      const p = this.unproject(mx, my, d.cam, cell.view, d.rect, d.ppm);
      if (d.kind === "move") {
        box.c = addVec(d.startBox.c, subVec(p, d.p0));
      } else if (d.kind === "resize") {
        const ax = axes(d.startBox.r);
        const q = worldToLocalVec(p, d.startBox.c, ax);
        const shift = [0, 0, 0];
        for (const [axis, sign] of [
          [V.ui, d.a],
          [V.vi, d.b]
        ]) {
          if (!sign) continue;
          const half = d.startBox.s[axis] / 2;
          const size = Math.max(0.05, sign * q[axis] + half);
          shift[axis] = sign * (size - d.startBox.s[axis]) / 2;
          box.s[axis] = size;
        }
        box.c = localToWorldVec(shift, d.startBox.c, ax);
      } else if (d.kind === "rotate") {
        const center = this.project(d.startBox.c, d.cam, cell.view, d.rect, d.ppm);
        const ang = Math.atan2(-(my - center[1]), mx - center[0]);
        let delta = ang - d.ang0;
        if (e.shiftKey) delta = Math.round(delta / (Math.PI / 36)) * (Math.PI / 36);
        if (cell.view === "top") {
          if (!d.startBox.r[0] && !d.startBox.r[1]) {
            box.r[2] = d.startBox.r[2] + delta;
          } else {
            box.r = rotateLocal(d.startBox.r, 2, delta);
          }
        } else if (cell.view === "side") {
          box.r = rotateLocal(d.startBox.r, 1, -delta);
        } else {
          box.r = rotateLocal(d.startBox.r, 0, delta);
        }
      }
      d.moved = true;
      (_a = this.onEdit) == null ? void 0 : _a.call(this, cell.frame, box);
      this.requestRender();
    }
    wheel(e, cell) {
      var _a;
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY || e.deltaX;
      if (!delta) return;
      const k = delta < 0 ? 1.15 : 1 / 1.15;
      if (e.shiftKey) {
        const z = this.settings.zoom;
        z[cell.view] = Math.min(20, Math.max(0.2, (z[cell.view] || 1) * k));
        (_a = this.onZoom) == null ? void 0 : _a.call(this);
        this.requestRender();
        return;
      }
      const r = cell.el.getBoundingClientRect();
      this.zoomCell(cell, k, e.clientX - r.left, e.clientY - r.top);
    }
  }
  const HELPER_CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; }

  .fab {
    position: fixed; left: 12px; bottom: 12px; z-index: 2147483000;
    font: 600 13px system-ui, sans-serif;
    background: #2563eb; color: #fff; border: 0; border-radius: 20px;
    padding: 8px 14px; cursor: pointer;
    box-shadow: 0 2px 8px rgba(0,0,0,.12);
  }
  .fab:hover { background: #3b82f6; }

  .overlay {
    position: fixed; inset: 0; z-index: 2147483001;
    background: rgba(255, 255, 255, 0.98); color: #09090b;
    font: 13px/1.4 system-ui, sans-serif;
    display: flex; flex-direction: column;
  }

  .bar {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 12px; background: #fafafa;
    border-bottom: 1px solid #e4e4e7; flex-wrap: wrap;
  }
  .bar .title { font-weight: 700; margin-right: 8px; }

  .grow { flex: 1; }

  button, select, input { font: inherit; color: inherit; }

  button {
    background: #f4f4f5; border: 1px solid #e4e4e7; border-radius: 6px;
    padding: 5px 10px; cursor: pointer;
  }
  button:hover:not(:disabled) { background: #e4e4e7; }
  button:disabled { opacity: .45; cursor: default; }

  button.primary { background: #2563eb; border-color: #2563eb; color: #fff; }
  button.primary:hover:not(:disabled) { background: #3b82f6; }

  button.warn { background: #fef2f2; border-color: #fecaca; color: #dc2626; }

  button.small { padding: 2px 6px; font-size: 12px; }

  button.tab { border-radius: 6px 6px 0 0; }
  button.tab.active { background: #2563eb; border-color: #2563eb; color: #fff; }

  select, input {
    background: #ffffff; border: 1px solid #d4d4d8;
    border-radius: 5px; padding: 4px 6px;
  }
  input[type=number] { width: 72px; }
  input[type=checkbox] { accent-color: #2563eb; }

  label { display: inline-flex; align-items: center; gap: 4px; }

  .status { color: #71717a; }
  .status.err { color: #dc2626; }
  .status.ok { color: #16a34a; }

  .body { flex: 1; min-height: 0; display: flex; flex-direction: column; }

  .banner {
    background: #fefce8; color: #854d0e;
    border-bottom: 1px solid #fef08a;
    padding: 6px 12px; display: flex; gap: 10px; align-items: center;
  }

  .muted { color: #71717a; }

  .kf {
    display: inline-block; padding: 0 5px; border-radius: 4px;
    font-size: 11px; font-weight: 700;
  }
  .kf.on { background: #16a34a; color: #fff; }
  .kf.off { background: #f4f4f5; color: #71717a; }
  .kf.out { background: #f59e0b; color: #fff; }

  .dot {
    display: inline-block; width: 10px; height: 10px;
    border-radius: 50%; margin-right: 6px; vertical-align: middle;
  }

  table { border-collapse: collapse; width: 100%; }
  th, td {
    padding: 6px 8px; border-bottom: 1px solid #e4e4e7;
    text-align: left; white-space: nowrap;
  }
  th {
    position: sticky; top: 0; background: #fafafa;
    z-index: 1; font-weight: 600;
  }
  tr.dirty td { background: #f0fdf4; }

  .scroll { overflow: auto; flex: 1; min-height: 0; }

  .modal {
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 2147483002;
    display: flex; flex-direction: column;
    padding: 16px; gap: 8px;
    font: 13px/1.4 system-ui, sans-serif; color: #09090b;
  }
  .modal:focus, .overlay:focus { outline: none; }
  .modal > .bar { border-radius: 6px; }

  .modal .bar button.close {
    background: #09090b; color: #fff;
    border-color: #09090b; font-weight: 700;
  }
  .modal .bar button.close:hover { background: #27272a; }

  .modal .imgs {
    flex: 1; min-height: 0;
    display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 10px; overflow: auto; padding: 4px;
    align-content: start; align-items: start;
  }

  .imgbox {
    position: relative; margin: 0;
    border: 2px solid transparent; border-radius: 6px;
    overflow: hidden; background: #f4f4f5;
    transition: border-color .1s;
  }
  .imgbox:hover {
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.25);
  }
  .imgbox img { width: 100%; height: auto; display: block; cursor: zoom-in; }
  .imgbox figcaption { padding: 4px 8px; color: #52525b; font-size: 12px; }

  .imgbox .max {
    position: absolute; top: 6px; right: 6px; opacity: 0;
    transition: opacity .1s;
    background: rgba(255, 255, 255, 0.95); color: #09090b;
    border: 1px solid #e4e4e7; font-weight: 700;
  }
  .imgbox:hover .max { opacity: 1; }

  .viewer {
    position: relative; flex: 1; min-height: 0;
    background: #f8fafc; border: 1px solid #e4e4e7;
    border-radius: 6px; overflow: hidden;
    cursor: grab; touch-action: none;
  }
  .viewer.dragging { cursor: grabbing; }
  .viewer canvas { position: absolute; inset: 0; }

  .zoomlbl { min-width: 52px; text-align: center; color: #52525b; }
  .help { color: #71717a; font-size: 12px; }
  .progress { color: #2563eb; }
`;
  const CASE2_CSS = `
  .c2-head, .c2-row {
    display: grid;
    grid-template-columns: 190px var(--img-col) 1fr 1fr 1fr;
    gap: 4px;
  }
  .c2-head {
    padding: 4px 8px; background: #fafafa;
    border-bottom: 1px solid #e4e4e7; font-weight: 600;
  }

  .c2-wrap { position: relative; flex: 1; min-height: 0; }
  .c2-scroll {
    position: absolute; inset: 0;
    overflow-y: auto; overflow-x: hidden; padding: 4px 8px;
  }

  .c2-row { height: var(--row-h); margin-bottom: 4px; }
  .c2-row.sel .c2-info { outline: 2px solid #2563eb; }

  .c2-info {
    background: #fafafa; border: 1px solid #e4e4e7; border-radius: 4px;
    padding: 6px; display: flex; flex-direction: column;
    gap: 4px; overflow: hidden;
  }
  .c2-info .head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .c2-info .grid {
    display: grid; grid-template-columns: auto 1fr;
    gap: 2px 6px; align-items: center;
  }
  .c2-info input[type=number] { width: 100%; padding: 1px 4px; }
  .c2-info .btns { display: flex; flex-wrap: wrap; gap: 3px; margin-top: auto; }

  .c2-img {
    background: #f4f4f5; border: 1px solid #e4e4e7; border-radius: 4px;
    overflow: hidden; display: flex; align-items: center;
    justify-content: center; cursor: zoom-in;
    color: #71717a; font-size: 12px;
  }
  .c2-img img { max-width: 100%; max-height: 100%; object-fit: contain; }

  .c2-view {
    position: relative; border-radius: 4px;
    background: transparent; touch-action: none; user-select: none;
    outline: 1px solid transparent;
  }
  .c2-view:hover { outline-color: #3b82f6; }

  .vtools {
    position: absolute; top: 4px; right: 4px;
    display: flex; gap: 3px;
    opacity: 0; transition: opacity .12s;
  }
  .c2-view:hover .vtools { opacity: 1; }
  .vtools button {
    padding: 1px 7px; font-size: 13px; line-height: 18px;
    background: rgba(255, 255, 255, 0.95); color: #09090b;
    border: 1px solid #e4e4e7; border-radius: 4px;
  }
  .vtools button:hover { background: #fff; }

  .osw {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 1px 8px 1px 3px; border-radius: 10px;
    font-size: 11px; font-weight: 700;
    border: 1px solid #e4e4e7; background: #f4f4f5;
    color: #71717a; cursor: pointer;
  }
  .osw .knob {
    width: 14px; height: 14px; border-radius: 50%; background: #a1a1aa;
  }
  .osw.on {
    background: #fefce8; border-color: #facc15; color: #854d0e;
  }
  .osw.on .knob { background: #f59e0b; }

  .pbar {
    position: relative; width: 300px; height: 20px;
    background: #f4f4f5; border: 1px solid #d4d4d8;
    border-radius: 10px; overflow: hidden;
  }
  .pbar .fill {
    position: absolute; left: 0; top: 0; bottom: 0; width: 0;
    background: linear-gradient(90deg, #2563eb, #16a34a);
    transition: width .2s;
  }
  .pbar .ptext {
    position: relative; display: block; text-align: center;
    font-size: 11px; line-height: 18px; color: #09090b;
  }

  .big-wrap {
    position: relative; flex: 1; min-height: 0;
    background: #f8fafc; border: 1px solid #e4e4e7;
    border-radius: 6px; overflow: hidden;
  }
  .big-inner { position: absolute; inset: 0; }
  .big-cell {
    position: absolute; inset: 0;
    touch-action: none; user-select: none;
  }

  .seg button.active { background: #2563eb; border-color: #2563eb; color: #fff; }
`;
  function h$2(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props ?? {})) {
      if (v === void 0 || v === null || v === false) continue;
      if (k.startsWith("on") && typeof v === "function") {
        el.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === "class") {
        el.className = v;
      } else if (k === "style" && typeof v === "object") {
        Object.assign(el.style, v);
      } else if (k in el && typeof v !== "string") {
        el[k] = v;
      } else {
        el.setAttribute(k, v === true ? "" : String(v));
      }
    }
    for (const c of children.flat()) {
      if (c === null || c === void 0 || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }
  const fmt = (v, n = 2) => Number.isFinite(v) ? v.toFixed(n) : "–";
  const deg = (rad) => rad * 180 / Math.PI;
  const VIEW_NAMES = { top: "Top", side: "Side", front: "Front" };
  const BIG = { fullScene: true, sceneSpan: 40, slab: 3 };
  function mountCase2(app, root, initialTrackId) {
    var _a;
    const store = app.store;
    const frameData = app.getFrames();
    const tracks = [...store.tracks.values()].sort((a, b) => Number(a.uiId) - Number(b.uiId));
    const S = (_a = app.settings).case2 || (_a.case2 = {
      zoom: { top: 1, side: 1, front: 1 },
      pointSize: 2,
      slab: 1,
      hideGround: false,
      allowTilt: false,
      context: true,
      syncSize: false,
      rowH: 230,
      camera: 0,
      showImage: true
    });
    root.append(h$2("style", {}, CASE2_CSS));
    if (!tracks.length) {
      root.append(h$2("div", { class: "bar muted" }, "Job không có track cuboid nào."));
      return {
        refresh() {
        },
        unmount() {
        },
        onKey() {
        }
      };
    }
    let track2 = (initialTrackId ? store.track(initialTrackId) : null) || tracks[0];
    let range = null;
    let grid = null;
    const extraGrids = /* @__PURE__ */ new Set();
    let rows = /* @__PURE__ */ new Map();
    let crops = /* @__PURE__ */ new Map();
    let observer = null;
    let cameraNames = [];
    const settings = {
      ...S,
      refSize: [1, 1, 1],
      color: "#2563eb"
    };
    settings.zoom = S.zoom;
    const trackSel = h$2(
      "select",
      { onchange: () => openTrack(store.track(Number(trackSel.value))) },
      ...tracks.map(
        (t) => h$2(
          "option",
          { value: String(t.id), selected: t.id === track2.id },
          `#${t.uiId} · ${store.labelName(t.labelId)} · f${t.firstFrame}–f${t.lastFrame}`
        )
      )
    );
    const fromIn = h$2("input", { type: "number" });
    const toIn = h$2("input", { type: "number" });
    const gotoIn = h$2("input", { type: "number", placeholder: "frame" });
    const camSel = h$2("select", {
      onchange: () => {
        S.camera = Number(camSel.value);
        reloadImages();
      }
    });
    const pfill = h$2("div", { class: "fill" });
    const ptext = h$2("span", { class: "ptext" });
    const pbar = h$2("div", { class: "pbar", hidden: true, title: "Tiến độ tải point cloud" }, pfill, ptext);
    const check = (key, text, title, after) => h$2(
      "label",
      { title },
      h$2("input", {
        type: "checkbox",
        checked: !!S[key],
        onchange: (e) => {
          S[key] = e.target.checked;
          settings[key] = S[key];
          after == null ? void 0 : after();
          renderAll();
        }
      }),
      text
    );
    const num = (key, text, step, min, max, after) => h$2(
      "label",
      {},
      text,
      h$2("input", {
        type: "number",
        value: String(S[key]),
        step: String(step),
        min: String(min),
        max: String(max),
        style: { width: "60px" },
        onchange: (e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) {
            S[key] = v;
            settings[key] = v;
            after == null ? void 0 : after();
            renderAll();
          }
        }
      })
    );
    const head = h$2(
      "div",
      { class: "c2-head" },
      h$2("span", {}, "Frame"),
      h$2("span", {}, "Camera"),
      h$2("span", {}, "Top"),
      h$2("span", {}, "Side"),
      h$2("span", {}, "Front")
    );
    const scroller = h$2("div", { class: "c2-scroll" });
    const wrap = h$2("div", { class: "c2-wrap" }, scroller);
    function applyLayout() {
      root.style.setProperty("--row-h", `${S.rowH}px`);
      root.style.setProperty("--img-col", S.showImage ? "1.15fr" : "0px");
      grid == null ? void 0 : grid.resize();
    }
    root.append(
      h$2(
        "div",
        { class: "bar" },
        h$2("label", {}, "ID", trackSel),
        h$2("label", {}, "Frame", fromIn, "→", toIn),
        h$2("button", { class: "small", onclick: () => buildRows() }, "Hiện"),
        h$2("label", {}, "Đi tới", gotoIn),
        h$2("label", {}, "Camera", camSel),
        check("showImage", "Ảnh", "Hiện cột ảnh camera", applyLayout),
        num("rowH", "Cao dòng", 10, 120, 600, applyLayout),
        h$2("button", { class: "small", onclick: fitZoom, title: "Đặt lại zoom mọi ô cho vừa box" }, "Fit"),
        pbar
      ),
      h$2(
        "div",
        { class: "bar" },
        check(
          "syncSize",
          "Đồng bộ L/W/H cho cả track",
          "Khi đổi kích thước ở 1 frame, áp kích thước đó cho mọi keyframe (theo chế độ giữ đáy/giữ tâm/bám đất ở Case 1)"
        ),
        check(
          "context",
          "Hiện xung quanh (giống CVAT)",
          "Bật: mỗi ô hiện cả mặt đất và vật xung quanh. Tắt: chỉ vùng sát box",
          () => {
            crops = /* @__PURE__ */ new Map();
          }
        ),
        check("hideGround", "Top: ẩn mặt đất", "Top view chỉ hiện điểm cao hơn đáy box 12cm"),
        check("allowTilt", "Cho xoay pitch/roll", "Cho phép xoay ở Side/Front (mặc định khoá, chỉ xoay yaw ở Top)"),
        num("slab", "Lát cắt ±m", 0.1, 0, 5),
        num("pointSize", "Cỡ điểm", 0.5, 1, 8),
        h$2(
          "span",
          { class: "help" },
          "Kéo box = di chuyển · kéo cạnh/góc = đổi size · chấm vàng = xoay (Shift: 5°) · kéo vùng trống = pan · Cuộn chuột = zoom ô (Shift: mọi ô) · ⛶ phóng to · O = outside · ↑/↓ chọn frame"
        )
      ),
      head,
      wrap
    );
    applyLayout();
    gotoIn.addEventListener("change", () => {
      const r = rows.get(Number(gotoIn.value));
      if (r) {
        r.el.scrollIntoView({ block: "center" });
        select(Number(gotoIn.value));
      }
    });
    function renderAll() {
      grid == null ? void 0 : grid.requestRender();
      for (const g of extraGrids) g.requestRender();
    }
    function refSizeOf(t) {
      const s = [0, 0, 0];
      for (const sh of t.shapes) {
        for (let i = 0; i < 3; i++) s[i] = Math.max(s[i], sh.points[6 + i]);
      }
      return [Math.max(s[0], 0.3), Math.max(s[1], 0.3), Math.max(s[2], 0.3)];
    }
    function getCloud(frame) {
      const full = frameData.clouds.get(frame);
      if (!full) return null;
      const pos = track2.at(frame);
      if (!pos) return null;
      const c = pos.box.c;
      const old = crops.get(frame);
      if (old && Math.hypot(old.center[0] - c[0], old.center[1] - c[1], old.center[2] - c[2]) < 1.5) {
        return old.arr;
      }
      const ref = settings.refSize;
      const rh = Math.max(ref[0], ref[1]) / 2 + (settings.context ? 15 : 4);
      const rv = ref[2] / 2 + (settings.context ? 8 : 3);
      const out = new Float32Array(full.length);
      let n = 0;
      for (let i = 0; i < full.length; i += 3) {
        const dx = full[i] - c[0];
        const dy = full[i + 1] - c[1];
        const dz = full[i + 2] - c[2];
        if (dx * dx + dy * dy > rh * rh || Math.abs(dz) > rv) continue;
        out[n++] = full[i];
        out[n++] = full[i + 1];
        out[n++] = full[i + 2];
      }
      const arr = out.slice(0, n);
      crops.set(frame, { arr, center: [c[0], c[1], c[2]] });
      return arr;
    }
    let selected = null;
    function select(frame) {
      var _a2, _b;
      if (selected !== null) (_a2 = rows.get(selected)) == null ? void 0 : _a2.el.classList.remove("sel");
      selected = frame;
      (_b = rows.get(frame)) == null ? void 0 : _b.el.classList.add("sel");
    }
    function editBox(frame, mutate, { sync = false } = {}) {
      const pos = track2.at(frame);
      if (!pos || pos.outside) return;
      app.snapshot([Number(track2.id)]);
      const box = cloneBox(pos.box);
      mutate(box);
      track2.setBox(frame, box);
      const sizeChanged = box.s.some((v, i) => Math.abs(v - pos.box.s[i]) > 1e-6);
      if (sync && sizeChanged) syncSize(frame, box.s).then(afterEdit);
      else afterEdit();
    }
    function toggleOutside(frame) {
      const pos = track2.at(frame);
      if (!pos) return;
      app.snapshot([Number(track2.id)]);
      track2.setOutside(frame, !pos.outside);
      app.setStatus(`f${frame}: outside ${pos.outside ? "TẮT" : "BẬT"}`, "ok");
      afterEdit();
    }
    async function syncSize(frame, size) {
      let failed = 0;
      for (const shape of track2.shapes) {
        if (shape.frame === frame) continue;
        const res = await app.resizeBox(
          { c: [shape.points[0], shape.points[1], shape.points[2]], r: [shape.points[3], shape.points[4], shape.points[5]], s: [shape.points[6], shape.points[7], shape.points[8]] },
          size,
          shape.frame
        );
        if (!res.ok) failed += 1;
        shape.points[6] = res.box.s[0];
        shape.points[7] = res.box.s[1];
        shape.points[8] = res.box.s[2];
        shape.points[0] = res.box.c[0];
        shape.points[1] = res.box.c[1];
        shape.points[2] = res.box.c[2];
      }
      track2.dirty = true;
      app.setStatus(
        `Đã đồng bộ L/W/H cho ${track2.shapes.length} keyframe` + (failed ? ` · ${failed} frame không đủ điểm mặt đất → giữ đáy` : ""),
        failed ? "err" : "ok"
      );
    }
    function afterEdit() {
      for (const r of rows.values()) r.refresh();
      renderAll();
      app.changed();
    }
    const editCallbacks = {
      getCloud,
      getBox: (frame) => {
        const pos = track2.at(frame);
        return pos ? { box: pos.box, keyframe: pos.keyframe, outside: pos.outside } : null;
      },
      onEditStart: () => app.snapshot([Number(track2.id)]),
      onEdit: (frame, box) => {
        var _a2;
        track2.setBox(frame, box);
        (_a2 = rows.get(frame)) == null ? void 0 : _a2.refresh();
        select(frame);
        renderAll();
      },
      onEditEnd: async (frame, startBox, endBox) => {
        const sizeChanged = endBox.s.some((v, i) => Math.abs(v - startBox.s[i]) > 1e-6);
        if (S.syncSize && sizeChanged) await syncSize(frame, endBox.s);
        afterEdit();
      },
      onEditCancel: () => app.dropLastSnapshot()
    };
    function outsideSwitch(getFrame) {
      const el = h$2(
        "button",
        {
          class: "osw",
          title: "Bật/tắt outside tại frame này (phím O)",
          onclick: (e) => {
            e.stopPropagation();
            toggleOutside(getFrame());
          }
        },
        h$2("span", { class: "knob" }),
        h$2("span", { class: "lbl" }, "Outside")
      );
      el.update = (outside) => {
        el.classList.toggle("on", !!outside);
        const lbl = el.querySelector(".lbl");
        if (lbl) lbl.textContent = outside ? "Outside: BẬT" : "Outside: tắt";
      };
      return el;
    }
    function buildRow(frame) {
      const kfBadge = h$2("span", { class: "kf" });
      const osw = outsideSwitch(() => frame);
      const field = (title, get, set, step = "0.01") => {
        const input = h$2("input", {
          type: "number",
          step,
          title,
          onchange: () => {
            const v = Number(input.value);
            if (!Number.isFinite(v)) return;
            editBox(frame, (box) => set(box, v), {
              sync: S.syncSize && ["L", "W", "H"].includes(title)
            });
          }
        });
        return { input, get };
      };
      const fields = [
        field("L", (b) => b.s[0], (b, v) => {
          b.s[0] = Math.max(0.05, v);
        }),
        field("W", (b) => b.s[1], (b, v) => {
          b.s[1] = Math.max(0.05, v);
        }),
        field("H", (b) => b.s[2], (b, v) => {
          Object.assign(b, resizeKeepBottom(b, [b.s[0], b.s[1], Math.max(0.05, v)]));
        }),
        field(
          "Yaw°",
          (b) => deg(b.r[2]),
          (b, v) => {
            const delta = v * Math.PI / 180 - b.r[2];
            if (!b.r[0] && !b.r[1]) b.r[2] += delta;
            else b.r = rotateLocal(b.r, 2, delta);
          },
          "0.5"
        ),
        field("z", (b) => b.c[2], (b, v) => {
          b.c[2] = v;
        })
      ];
      const kfDel = h$2(
        "button",
        {
          class: "small",
          title: "Xoá keyframe này (frame sẽ nội suy lại)",
          onclick: () => {
            const idx = track2.keyframeIndex(frame);
            if (idx <= 0) {
              app.setStatus("Không xoá được keyframe đầu tiên của track", "err");
              return;
            }
            app.snapshot([Number(track2.id)]);
            track2.shapes.splice(idx, 1);
            track2.dirty = true;
            afterEdit();
          }
        },
        "✕ KF"
      );
      const ground = h$2(
        "button",
        {
          class: "small",
          title: "Nâng/hạ box cho đáy chạm mặt đất (point cloud)",
          onclick: () => {
            const cloud = frameData.clouds.get(frame);
            if (!cloud) {
              app.setStatus("Point cloud frame này chưa tải xong", "err");
              return;
            }
            const pos = track2.at(frame);
            if (!pos || pos.outside) return;
            const res = snapToGround(cloud, pos.box);
            if (!res) {
              app.setStatus(`f${frame}: không đủ điểm mặt đất quanh box`, "err");
              return;
            }
            editBox(frame, (b) => {
              b.c = res.box.c;
            });
            app.setStatus(`f${frame}: dịch ${fmt(res.shift * 100, 1)} cm theo trục z`, "ok");
          }
        },
        "⇩ Đất"
      );
      const info = h$2(
        "div",
        { class: "c2-info", onclick: () => select(frame) },
        h$2("div", { class: "head" }, h$2("b", {}, `f${frame}`), kfBadge, osw),
        h$2(
          "div",
          { class: "grid" },
          ...fields.flatMap((f, i) => [
            h$2("span", { class: "muted" }, ["L", "W", "H", "Yaw°", "z"][i]),
            f.input
          ])
        ),
        h$2(
          "div",
          { class: "btns" },
          ground,
          h$2(
            "button",
            {
              class: "small",
              title: "Áp L/W/H của frame này cho mọi keyframe của track",
              onclick: async () => {
                const pos = track2.at(frame);
                if (!pos) return;
                app.snapshot([Number(track2.id)]);
                await syncSize(frame, pos.box.s);
                afterEdit();
              }
            },
            "L/W/H → tất cả"
          ),
          kfDel
        )
      );
      const img = h$2("div", { class: "c2-img", onclick: () => showAllImages(frame) }, "…");
      const views = ["top", "side", "front"].map(() => h$2("div", { class: "c2-view" }));
      const el = h$2("div", { class: "c2-row" }, info, img, ...views);
      el.dataset.frame = String(frame);
      const refresh = () => {
        var _a2;
        const pos = track2.at(frame);
        if (!pos) {
          kfBadge.className = "kf off";
          kfBadge.textContent = "ngoài track";
          return;
        }
        kfBadge.className = `kf ${pos.outside ? "out" : pos.keyframe ? "on" : "off"}`;
        kfBadge.textContent = pos.outside ? "OUTSIDE" : pos.keyframe ? "KEYFRAME" : "nội suy";
        osw.update(pos.outside);
        for (const f of fields) {
          if (f.input === ((_a2 = f.input.getRootNode()) == null ? void 0 : _a2.activeElement)) continue;
          f.input.value = f.get(pos.box).toFixed(f.input.step === "0.5" ? 1 : 3);
          f.input.disabled = pos.outside;
        }
        ground.disabled = pos.outside;
        kfDel.disabled = !pos.keyframe || track2.keyframeIndex(frame) <= 0;
      };
      refresh();
      return { el, info, img, views, refresh, imgLoaded: false };
    }
    function attachViewTools(el, cell) {
      el.append(
        h$2(
          "div",
          { class: "vtools" },
          h$2(
            "button",
            {
              title: "Phóng to toàn cảnh để sửa",
              onclick: (e) => {
                e.stopPropagation();
                openBigView(cell.frame, cell.view);
              }
            },
            "⛶"
          )
        )
      );
    }
    function openBigView(frame, view) {
      const frames = [...rows.keys()];
      const cellEl = h$2("div", { class: "big-cell" });
      const inner = h$2("div", { class: "big-inner" }, cellEl);
      const bwrap = h$2("div", { class: "big-wrap" }, inner);
      const bigSettings = Object.create(settings);
      Object.assign(bigSettings, BIG);
      bigSettings.zoom = { top: 1, side: 1, front: 1 };
      const applyScene = () => {
        bigSettings.sceneSpan = BIG.fullScene ? BIG.sceneSpan : 0;
        bigSettings.topAll = BIG.fullScene;
        bigSettings.hideGround = BIG.fullScene ? false : settings.hideGround;
        bigSettings.slab = BIG.fullScene ? BIG.slab : settings.slab;
      };
      applyScene();
      const big = new GridViewWebGL({
        wrap: bwrap,
        scroller: inner,
        settings: bigSettings,
        ...editCallbacks,
        getCloud: (f) => BIG.fullScene ? frameData.clouds.get(f) || null : getCloud(f),
        onZoom: () => updateBar()
      });
      extraGrids.add(big);
      const cell = big.addCell(cellEl, frame, view);
      const frameLbl = h$2("b", { style: { minWidth: "48px", textAlign: "center" } });
      const kfBadge = h$2("span", { class: "kf" });
      const zoomLbl = h$2("span", { class: "zoomlbl" });
      const osw = outsideSwitch(() => cell.frame);
      const viewBtns = Object.keys(VIEW_NAMES).map(
        (v) => h$2("button", { class: "small", onclick: () => setView(v) }, VIEW_NAMES[v])
      );
      function updateBar() {
        frameLbl.textContent = `f${cell.frame}`;
        const pos = track2.at(cell.frame);
        kfBadge.className = `kf ${!pos ? "off" : pos.outside ? "out" : pos.keyframe ? "on" : "off"}`;
        kfBadge.textContent = !pos ? "–" : pos.outside ? "OUTSIDE" : pos.keyframe ? "KEYFRAME" : "nội suy";
        osw.update(!!(pos && pos.outside));
        zoomLbl.textContent = `${Math.round(cell.zoom * 100)}%`;
        Object.keys(VIEW_NAMES).forEach(
          (v, i) => viewBtns[i].classList.toggle("active", v === cell.view)
        );
        ui.setTitle(`ID #${track2.uiId} · ${VIEW_NAMES[cell.view]}`);
      }
      function setFrame(f) {
        var _a2;
        cell.frame = f;
        select(f);
        (_a2 = rows.get(f)) == null ? void 0 : _a2.el.scrollIntoView({ block: "nearest" });
        updateBar();
        big.requestRender();
      }
      function step(d) {
        const i = frames.indexOf(cell.frame);
        const j = Math.min(frames.length - 1, Math.max(0, i + d));
        if (j !== i) setFrame(frames[j]);
      }
      function setView(v) {
        cell.view = v;
        big.resetCell(cell);
        updateBar();
      }
      const ui = app.openModal("", bwrap, {
        tools: [
          h$2("button", { class: "small", onclick: () => step(-1), title: "←" }, "◀"),
          frameLbl,
          h$2("button", { class: "small", onclick: () => step(1), title: "→" }, "▶"),
          kfBadge,
          osw,
          h$2("span", { class: "seg" }, ...viewBtns),
          h$2("button", { class: "small", onclick: () => big.zoomCell(cell, 1 / 1.25) }, "−"),
          zoomLbl,
          h$2("button", { class: "small", onclick: () => big.zoomCell(cell, 1.25) }, "+"),
          h$2("button", { class: "small", onclick: () => big.resetCell(cell) }, "Vừa khung"),
          h$2(
            "label",
            { title: "Hiện toàn bộ point cloud như view phóng to của CVAT" },
            h$2("input", {
              type: "checkbox",
              checked: BIG.fullScene,
              onchange: (e) => {
                BIG.fullScene = e.target.checked;
                applyScene();
                big.resetCell(cell);
              }
            }),
            "Toàn cảnh"
          ),
          h$2(
            "label",
            { title: "Side/Front: chỉ hiện điểm cách box ± bao nhiêu mét theo chiều sâu" },
            "Lát cắt ±m",
            h$2("input", {
              type: "number",
              value: String(BIG.slab),
              step: "0.5",
              min: "0",
              max: "100",
              style: { width: "56px" },
              onchange: (e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) {
                  BIG.slab = v;
                  applyScene();
                  big.requestRender();
                }
              }
            })
          ),
          h$2(
            "span",
            { class: "help" },
            "Cuộn = zoom · kéo = pan · ←/→ frame · 1/2/3 = Top/Side/Front · O = outside"
          )
        ],
        onKey: (e) => {
          var _a2;
          const k = e.key.toLowerCase();
          if (((_a2 = e.composedPath()[0]) == null ? void 0 : _a2.tagName) === "INPUT") return;
          if (k === "arrowleft") step(-1);
          else if (k === "arrowright") step(1);
          else if (k === "1") setView("top");
          else if (k === "2") setView("side");
          else if (k === "3") setView("front");
          else if (k === "o") toggleOutside(cell.frame);
          else if (k === "+" || k === "=") big.zoomCell(cell, 1.25);
          else if (k === "-") big.zoomCell(cell, 1 / 1.25);
          else if (k === "0") big.resetCell(cell);
        },
        onClose: () => {
          extraGrids.delete(big);
          bigViews.delete(ui);
          big.destroy();
        }
      });
      ui.updateBar = updateBar;
      bigViews.add(ui);
      updateBar();
      big.resize();
    }
    const bigViews = /* @__PURE__ */ new Set();
    async function loadImage(frame) {
      const r = rows.get(frame);
      if (!r || r.imgLoaded || !S.showImage) return;
      r.imgLoaded = true;
      try {
        const list = await frameData.contextImages(frame);
        if (!cameraNames.length && list.length) {
          cameraNames = list.map((x) => x.name);
          camSel.replaceChildren(
            ...cameraNames.map(
              (n, i) => h$2("option", { value: String(i), selected: i === S.camera }, n)
            )
          );
        }
        const pick = list[Math.min(S.camera, list.length - 1)];
        r.img.replaceChildren(
          pick ? h$2("img", { src: pick.url, alt: pick.name }) : "không có ảnh"
        );
      } catch {
        r.img.textContent = "lỗi tải ảnh";
        r.imgLoaded = false;
      }
    }
    function reloadImages() {
      for (const r of rows.values()) r.imgLoaded = false;
      for (const [frame, r] of rows) {
        const rect = r.el.getBoundingClientRect();
        const sr = scroller.getBoundingClientRect();
        if (rect.bottom > sr.top - 300 && rect.top < sr.bottom + 300) loadImage(frame);
      }
    }
    async function showAllImages(frame) {
      const list = (await frameData.contextImages(frame).catch(() => [])).map((x) => ({
        ...x,
        title: `f${frame} · ${x.name}`
      }));
      const view = (i) => {
        app.openImageViewer(list, i);
      };
      app.openModal(
        `f${frame} · ${list.length} ảnh camera`,
        h$2(
          "div",
          { class: "imgs" },
          ...list.map(
            (x, i) => h$2(
              "figure",
              { class: "imgbox" },
              h$2("img", { src: x.url, alt: x.name, onclick: () => view(i) }),
              h$2(
                "button",
                { class: "small max", title: "Phóng to (zoom, kéo ảnh)", onclick: () => view(i) },
                "⛶ Phóng to"
              ),
              h$2("figcaption", {}, x.name)
            )
          )
        )
      );
    }
    function fitZoom() {
      settings.refSize = refSizeOf(track2);
      S.zoom.top = S.zoom.side = S.zoom.front = 1;
      for (const c of (grid == null ? void 0 : grid.cells) || []) {
        c.zoom = 1;
        c.pan = [0, 0];
      }
      renderAll();
    }
    function showProgress(p) {
      const pct = Math.round(p.fraction * 100);
      if (p.done >= p.total) {
        pfill.style.width = "100%";
        ptext.textContent = "Point cloud: đã tải xong";
        setTimeout(() => {
          if (p.done >= p.total) pbar.hidden = true;
        }, 800);
        return;
      }
      pbar.hidden = false;
      pfill.style.width = `${pct}%`;
      const mb = p.loadedBytes / 1048576;
      ptext.textContent = `Point cloud ${pct}% · ${p.done}/${p.total} chunk${mb >= 0.1 ? ` · ${mb.toFixed(1)} MB` : ""}`;
    }
    function buildRows() {
      const from = Number(fromIn.value);
      const to = Number(toIn.value);
      range = [Math.min(from, to), Math.max(from, to)];
      grid == null ? void 0 : grid.clearCells();
      observer == null ? void 0 : observer.disconnect();
      rows = /* @__PURE__ */ new Map();
      scroller.replaceChildren();
      observer = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) loadImage(Number(e.target.dataset.frame));
          }
        },
        { root: scroller, rootMargin: "300px" }
      );
      const list = store.frames.filter((f) => f >= range[0] && f <= range[1]);
      for (const frame of list) {
        const r = buildRow(frame);
        rows.set(frame, r);
        scroller.append(r.el);
        ["top", "side", "front"].forEach(
          (v, i) => attachViewTools(r.views[i], grid.addCell(r.views[i], frame, v))
        );
        observer.observe(r.el);
      }
      renderAll();
      frameData.preload(list, (p) => {
        showProgress(p);
        if (p.chunk !== null) renderAll();
      }).catch((err) => {
        pbar.hidden = true;
        app.setStatus(`Lỗi tải point cloud: ${err.message}`, "err");
      });
    }
    function openTrack(t) {
      track2 = t;
      trackSel.value = String(t.id);
      crops = /* @__PURE__ */ new Map();
      settings.refSize = refSizeOf(t);
      settings.color = store.labelColor(t.labelId);
      const first = Math.max(t.firstFrame, store.frames[0]);
      const last = store.frames[store.frames.length - 1];
      fromIn.value = String(first);
      toIn.value = String(last);
      grid == null ? void 0 : grid.destroy();
      grid = new GridViewWebGL({
        wrap,
        scroller,
        settings,
        ...editCallbacks
      });
      buildRows();
    }
    openTrack(track2);
    return {
      refresh() {
        var _a2;
        for (const r of rows.values()) r.refresh();
        for (const b of bigViews) (_a2 = b.updateBar) == null ? void 0 : _a2.call(b);
        renderAll();
      },
      onKey(e) {
        var _a2, _b;
        if (((_a2 = e.composedPath()[0]) == null ? void 0 : _a2.tagName) === "INPUT" || e.ctrlKey || e.metaKey) return;
        const k = e.key.toLowerCase();
        const frames = [...rows.keys()];
        if (k === "o" && selected !== null) {
          toggleOutside(selected);
          return;
        }
        if ((k === "arrowdown" || k === "arrowup") && frames.length) {
          e.preventDefault();
          const i = selected === null ? -1 : frames.indexOf(selected);
          const j = Math.min(frames.length - 1, Math.max(0, i + (k === "arrowdown" ? 1 : -1)));
          select(frames[j]);
          (_b = rows.get(frames[j])) == null ? void 0 : _b.el.scrollIntoView({ block: "nearest" });
        }
      },
      unmount() {
        observer == null ? void 0 : observer.disconnect();
        grid == null ? void 0 : grid.destroy();
        grid = null;
      }
    };
  }
  function h$1(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props ?? {})) {
      if (v === void 0 || v === null || v === false) continue;
      if (k.startsWith("on") && typeof v === "function") {
        el.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === "class") {
        el.className = v;
      } else if (k === "style" && typeof v === "object") {
        Object.assign(el.style, v);
      } else if (k in el && typeof v !== "string") {
        el[k] = v;
      } else {
        el.setAttribute(k, v === true ? "" : String(v));
      }
    }
    for (const c of children.flat()) {
      if (c === null || c === void 0 || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }
  function openImageViewer(list, startIndex, openModalFn) {
    let index = startIndex;
    let img = null;
    let s = 1;
    let tx = 0;
    let ty = 0;
    let fitted = true;
    const canvas = h$1("canvas");
    const area = h$1("div", { class: "viewer" }, canvas);
    const zoomLbl = h$1("span", { class: "zoomlbl" });
    const ctx = canvas.getContext("2d");
    function draw() {
      const dpr = window.devicePixelRatio || 1;
      const W = area.clientWidth;
      const H = area.clientHeight;
      const rW = Math.round(W * dpr);
      const rH = Math.round(H * dpr);
      if (canvas.width !== rW || canvas.height !== rH) {
        canvas.width = rW;
        canvas.height = rH;
        canvas.style.width = `${W}px`;
        canvas.style.height = `${H}px`;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      if (!img) return;
      ctx.imageSmoothingEnabled = s < 3;
      ctx.drawImage(img, tx, ty, img.width * s, img.height * s);
      zoomLbl.textContent = `${Math.round(s * 100)}%`;
    }
    function fit() {
      if (!img) return;
      const W = area.clientWidth;
      const H = area.clientHeight;
      s = Math.min(W / img.width, H / img.height);
      tx = (W - img.width * s) / 2;
      ty = (H - img.height * s) / 2;
      fitted = true;
      draw();
    }
    function zoomAt(k, mx, my) {
      const ns = Math.min(40, Math.max(0.05, s * k));
      const ratio = ns / s;
      tx = mx - (mx - tx) * ratio;
      ty = my - (my - ty) * ratio;
      s = ns;
      fitted = false;
      draw();
    }
    function load(i) {
      index = (i % list.length + list.length) % list.length;
      ui.setTitle(
        `${list[index].title || list[index].name} · ${index + 1}/${list.length}`
      );
      const im = new Image();
      im.onload = () => {
        img = im;
        fit();
      };
      im.src = list[index].url;
    }
    area.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const r = area.getBoundingClientRect();
        zoomAt(
          e.deltaY < 0 ? 1.2 : 1 / 1.2,
          e.clientX - r.left,
          e.clientY - r.top
        );
      },
      { passive: false }
    );
    area.addEventListener("pointerdown", (e) => {
      area.setPointerCapture(e.pointerId);
      area.classList.add("dragging");
      let lx = e.clientX;
      let ly = e.clientY;
      const move = (ev) => {
        tx += ev.clientX - lx;
        ty += ev.clientY - ly;
        lx = ev.clientX;
        ly = ev.clientY;
        fitted = false;
        draw();
      };
      const up = () => {
        area.classList.remove("dragging");
        area.removeEventListener("pointermove", move);
        area.removeEventListener("pointerup", up);
      };
      area.addEventListener("pointermove", move);
      area.addEventListener("pointerup", up);
    });
    area.addEventListener("dblclick", fit);
    const center = (k) => zoomAt(k, area.clientWidth / 2, area.clientHeight / 2);
    const tools = [
      h$1("button", { class: "small", onclick: () => load(index - 1), title: "←" }, "◀"),
      h$1("button", { class: "small", onclick: () => load(index + 1), title: "→" }, "▶"),
      h$1("button", { class: "small", onclick: () => center(1 / 1.25), title: "-" }, "−"),
      zoomLbl,
      h$1("button", { class: "small", onclick: () => center(1.25), title: "+" }, "+"),
      h$1(
        "button",
        { class: "small", onclick: fit, title: "Vừa khung (double-click)" },
        "Vừa khung"
      ),
      h$1(
        "button",
        {
          class: "small",
          onclick: () => {
            if (!img) return;
            const W = area.clientWidth;
            const H = area.clientHeight;
            s = 1;
            tx = (W - img.width) / 2;
            ty = (H - img.height) / 2;
            fitted = false;
            draw();
          }
        },
        "1:1"
      ),
      h$1(
        "span",
        { class: "help" },
        "Cuộn = zoom · kéo = di chuyển · double-click = vừa khung · ←/→ đổi ảnh"
      )
    ];
    const ro = new ResizeObserver(() => fitted ? fit() : draw());
    const ui = openModalFn("", area, {
      tools,
      onKey: (e) => {
        if (e.key === "ArrowLeft") load(index - 1);
        else if (e.key === "ArrowRight") load(index + 1);
        else if (e.key === "+" || e.key === "=") center(1.25);
        else if (e.key === "-") center(1 / 1.25);
        else if (e.key === "0") fit();
      },
      onClose: () => ro.disconnect()
    });
    ro.observe(area);
    load(index);
    return ui;
  }
  function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props ?? {})) {
      if (v === void 0 || v === null || v === false) continue;
      if (k.startsWith("on") && typeof v === "function") {
        el.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === "class") {
        el.className = v;
      } else if (k === "style" && typeof v === "object") {
        Object.assign(el.style, v);
      } else if (k in el && typeof v !== "string") {
        el[k] = v;
      } else {
        el.setAttribute(k, v === true ? "" : String(v));
      }
    }
    for (const c of children.flat()) {
      if (c === null || c === void 0 || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }
  const _HelperOverlay = class _HelperOverlay {
    constructor() {
      __publicField(this, "store", null);
      __publicField(this, "frames", null);
      __publicField(this, "settings", {
        sizeMode: "bottom"
      });
      __publicField(this, "host", null);
      __publicField(this, "shadow", null);
      __publicField(this, "overlay", null);
      __publicField(this, "statusEl", null);
      __publicField(this, "modeEl", null);
      __publicField(this, "saveBtn", null);
      __publicField(this, "undoBtn", null);
      __publicField(this, "redoBtn", null);
      __publicField(this, "bannerEl", null);
      __publicField(this, "bodyEl", null);
      __publicField(this, "tabBtns", {});
      __publicField(this, "currentTab", "case1");
      __publicField(this, "mounted", null);
      __publicField(this, "modalStack", []);
      __publicField(this, "history", []);
      __publicField(this, "redoHistory", []);
      __publicField(this, "savedCount", 0);
      this.ensureMainWorldBridge();
    }
    static getInstance() {
      if (!_HelperOverlay.instance) {
        _HelperOverlay.instance = new _HelperOverlay();
      }
      return _HelperOverlay.instance;
    }
    ensureMainWorldBridge() {
      if (typeof window === "undefined") return;
      if (window.__cvatHelperBridgeInjected) return;
      window.__cvatHelperBridgeInjected = true;
      try {
        const script = document.createElement("script");
        script.textContent = getHelperBridgeMainScript();
        (document.head || document.documentElement).appendChild(script);
        script.remove();
      } catch (e) {
        console.warn("[CVAT Helper] Không thể inject live bridge script:", e);
      }
    }
    isOpen() {
      return this.overlay !== null;
    }
    getFrames() {
      if (this.frames && this.store && this.frames.store.jid !== this.store.jid) {
        this.frames.dispose();
        this.frames = null;
      }
      if (!this.frames && this.store) {
        this.frames = new FrameData(this.store);
      }
      if (this.frames && this.store) {
        this.frames.store = this.store;
      }
      return this.frames;
    }
    async resizeBox(box, size, frame, mode = this.settings.sizeMode) {
      if (mode === "center") {
        return { box: { ...cloneBox(box), s: [size[0], size[1], size[2]] }, ok: true };
      }
      const kept = resizeKeepBottom(box, size);
      if (mode === "bottom") return { box: kept, ok: true };
      const cloud = await this.getFrames().cloud(frame);
      const snapped = snapToGround(cloud, kept);
      return snapped ? { box: snapped.box, ok: true } : { box: kept, ok: false };
    }
    snapshot(ids) {
      var _a;
      if (!this.store) return;
      for (const id of ids) {
        (_a = this.store.track(id)) == null ? void 0 : _a.snapshot();
      }
      this.history.push(ids);
      this.redoHistory = [];
    }
    dropLastSnapshot() {
      var _a;
      const ids = this.history.pop();
      if (!ids || !this.store) return;
      for (const id of ids) {
        (_a = this.store.track(id)) == null ? void 0 : _a.undoStack.pop();
      }
    }
    undo() {
      var _a;
      const ids = this.history.pop();
      if (!ids || !this.store) return false;
      for (const id of ids) {
        (_a = this.store.track(id)) == null ? void 0 : _a.undo();
      }
      this.redoHistory.push(ids);
      this.changed();
      return true;
    }
    redo() {
      var _a;
      const ids = this.redoHistory.pop();
      if (!ids || !this.store) return false;
      for (const id of ids) {
        (_a = this.store.track(id)) == null ? void 0 : _a.redo();
      }
      this.history.push(ids);
      this.changed();
      return true;
    }
    setStatus(text, kind = "") {
      if (!this.statusEl) return;
      this.statusEl.textContent = text;
      this.statusEl.className = `status ${kind}`;
    }
    showBanner(text, actions = []) {
      if (!this.bannerEl) return;
      this.bannerEl.replaceChildren(
        h(
          "div",
          { class: "banner" },
          h("span", {}, text),
          ...actions,
          h("button", { class: "small", onclick: () => {
            var _a;
            return (_a = this.bannerEl) == null ? void 0 : _a.replaceChildren();
          } }, "✕")
        )
      );
    }
    changed() {
      var _a, _b;
      if (!this.store) return;
      const n = this.store.dirtyTracks().length;
      const label = this.store.mode === "live" ? "Lưu vào CVAT" : "Lưu lên CVAT";
      if (this.saveBtn) {
        this.saveBtn.textContent = n ? `${label} (${n} track)` : label;
        this.saveBtn.disabled = !n;
      }
      if (this.undoBtn) this.undoBtn.disabled = !this.history.length;
      if (this.redoBtn) this.redoBtn.disabled = !this.redoHistory.length;
      (_b = (_a = this.mounted) == null ? void 0 : _a.refresh) == null ? void 0 : _b.call(_a);
    }
    switchTab(id, arg) {
      var _a, _b;
      (_b = (_a = this.mounted) == null ? void 0 : _a.unmount) == null ? void 0 : _b.call(_a);
      if (this.bodyEl) this.bodyEl.replaceChildren();
      this.currentTab = id;
      for (const [k, b] of Object.entries(this.tabBtns)) {
        b.classList.toggle("active", k === id);
      }
      if (id === "case1") {
        this.mounted = mountCase1(this, this.bodyEl);
      } else if (id === "case2") {
        this.mounted = mountCase2(this, this.bodyEl, arg);
      }
      this.changed();
    }
    openModal(title, content, opts = {}) {
      var _a;
      const titleEl = h("b", {}, title);
      const entry = {
        modal: null,
        opts,
        titleEl
      };
      const modal = h(
        "div",
        {
          class: "modal",
          tabindex: "-1",
          onclick: (e) => {
            if (e.target === modal) this.closeTopModal();
          }
        },
        h(
          "div",
          { class: "bar" },
          titleEl,
          ...opts.tools || [],
          h("span", { class: "grow" }),
          h("button", { class: "close", onclick: () => this.closeModalEntry(entry) }, "✕ Đóng (Esc)")
        ),
        content
      );
      entry.modal = modal;
      this.modalStack.push(entry);
      (_a = this.shadow) == null ? void 0 : _a.append(modal);
      modal.focus({ preventScroll: true });
      return {
        modal,
        setTitle: (t) => {
          titleEl.textContent = t;
        },
        close: () => this.closeModalEntry(entry)
      };
    }
    openImageViewer(list, start = 0) {
      return openImageViewer(list, start, (title, content, opts) => this.openModal(title, content, opts));
    }
    closeModalEntry(entry) {
      var _a, _b, _c;
      const i = this.modalStack.indexOf(entry);
      if (i < 0) return;
      this.modalStack.splice(i, 1);
      entry.modal.remove();
      (_b = (_a = entry.opts).onClose) == null ? void 0 : _b.call(_a);
      (_c = this.modalStack.length ? this.modalStack[this.modalStack.length - 1].modal : this.overlay) == null ? void 0 : _c.focus({
        preventScroll: true
      });
    }
    closeTopModal() {
      if (this.modalStack.length) {
        this.closeModalEntry(this.modalStack[this.modalStack.length - 1]);
      }
    }
    ensureHost() {
      if (this.host) return;
      this.host = h("div", { id: "cvat-helper-overlay-root" });
      this.shadow = this.host.attachShadow({ mode: "open" });
      this.shadow.append(h("style", {}, HELPER_CSS));
      for (const type of ["keydown", "keyup", "keypress"]) {
        this.host.addEventListener(type, (e) => {
          if (this.overlay && type === "keydown") this.onKey(e);
          e.stopPropagation();
        });
      }
      document.documentElement.append(this.host);
    }
    onKey(e) {
      var _a, _b, _c, _d, _e;
      const k = e.key.toLowerCase();
      const typing = ((_a = e.composedPath()[0]) == null ? void 0 : _a.tagName) === "INPUT";
      if ((e.ctrlKey || e.metaKey) && k === "s") {
        e.preventDefault();
        this.save();
        return;
      }
      if (!typing && (e.ctrlKey || e.metaKey) && k === "z" && !e.shiftKey) {
        e.preventDefault();
        this.undo();
        return;
      }
      if (!typing && (e.ctrlKey || e.metaKey) && (k === "y" || k === "z" && e.shiftKey)) {
        e.preventDefault();
        this.redo();
        return;
      }
      if (this.modalStack.length) {
        if (k === "escape") {
          e.preventDefault();
          this.closeTopModal();
          return;
        }
        (_c = (_b = this.modalStack[this.modalStack.length - 1].opts).onKey) == null ? void 0 : _c.call(_b, e);
        return;
      }
      if (k === "escape") {
        this.close();
        return;
      }
      (_e = (_d = this.mounted) == null ? void 0 : _d.onKey) == null ? void 0 : _e.call(_d, e);
    }
    async open(jobId, initialTrackId) {
      var _a;
      if (this.overlay) return;
      this.ensureHost();
      this.overlay = h("div", { class: "overlay", tabindex: "-1" });
      this.statusEl = h("span", { class: "status" });
      this.modeEl = h("span");
      this.saveBtn = h("button", { class: "primary", onclick: () => this.save(), disabled: true }, "Lưu lên CVAT");
      this.undoBtn = h("button", { onclick: () => this.undo(), disabled: true, title: "Ctrl+Z" }, "↶ Hoàn tác");
      this.redoBtn = h("button", { onclick: () => this.redo(), disabled: true, title: "Ctrl+Y" }, "↷ Làm lại");
      this.bannerEl = h("div");
      this.bodyEl = h("div", { class: "body" });
      this.tabBtns = {};
      const tabsDef = {
        case1: "Case 1 · Sửa L/W/H",
        case2: "Case 2 · Duyệt theo ID"
      };
      const tabsEl = h(
        "span",
        {},
        ...Object.entries(tabsDef).map(([id, title]) => {
          const btn = h("button", { class: "tab", onclick: () => this.switchTab(id) }, title);
          this.tabBtns[id] = btn;
          return btn;
        })
      );
      this.overlay.append(
        h(
          "div",
          { class: "bar" },
          h("span", { class: "title" }, `🧰 Helper Studio · Job #${jobId}`),
          tabsEl,
          h("span", { class: "grow" }),
          this.modeEl,
          this.statusEl,
          this.undoBtn,
          this.redoBtn,
          h("button", { onclick: () => this.reload(), title: "Bỏ thay đổi, tải lại annotation từ CVAT" }, "⟳ Tải lại"),
          this.saveBtn,
          h("button", { onclick: () => this.close() }, "✕ Đóng")
        ),
        this.bannerEl,
        this.bodyEl
      );
      (_a = this.shadow) == null ? void 0 : _a.append(this.overlay);
      this.overlay.focus();
      this.store = new HelperJobStore(jobId);
      this.history = [];
      this.redoHistory = [];
      this.setStatus("Đang tải annotation…");
      try {
        await this.store.load();
        this.setStatus(`${this.store.tracks.size} track cuboid · ${this.store.frames.length} frame`, "ok");
        this.modeEl.replaceChildren(
          this.store.mode === "live" ? h("span", { class: "kf on", title: "Đọc/ghi thẳng vào CVAT đang mở – không cần reload" }, "● LIVE") : h("span", { class: "kf out", title: "Lưu qua REST API – cần reload CVAT sau khi lưu" }, "● API")
        );
        if (this.store.mode !== "live") {
          this.showBanner("Chế độ API: lưu qua REST API. Lưu xong cần reload lại CVAT.");
        }
        this.switchTab(initialTrackId ? "case2" : "case1", initialTrackId);
      } catch (err) {
        console.error("[CVAT Helper]", err);
        this.setStatus(`Lỗi tải dữ liệu: ${err.message}`, "err");
      }
    }
    async save() {
      var _a;
      if (!this.store || !this.store.dirtyTracks().length) return;
      if (this.saveBtn) this.saveBtn.disabled = true;
      this.setStatus("Đang lưu…");
      try {
        let res = await this.store.save();
        if (res.conflicts) {
          const ok = confirm(
            `Track ID ${res.conflicts.join(", ")} đã bị thay đổi trên CVAT kể từ lúc tool tải về.

OK = ghi đè
Cancel = hủy`
          );
          if (!ok) {
            this.setStatus("Chưa lưu – có xung đột.", "err");
            this.changed();
            return;
          }
          res = await this.store.save({ force: true });
        }
        this.setStatus(`Đã lưu ${res.saved} track lúc ${(/* @__PURE__ */ new Date()).toLocaleTimeString()}`, "ok");
        if (res.live) {
          (_a = this.bannerEl) == null ? void 0 : _a.replaceChildren();
          this.changed();
          return;
        }
        this.savedCount += res.saved;
        this.showBanner(
          "Đã lưu lên server. Reload CVAT để cập nhật canvas Three.js.",
          [h("button", { class: "small primary", onclick: () => location.reload() }, "Reload CVAT ngay")]
        );
      } catch (err) {
        console.error("[CVAT Helper]", err);
        this.setStatus(`Lỗi lưu: ${err.message}`, "err");
      }
      this.changed();
    }
    async reload() {
      var _a, _b;
      if (((_a = this.store) == null ? void 0 : _a.dirtyTracks().length) && !confirm("Bỏ mọi thay đổi chưa lưu và tải lại từ CVAT?")) return;
      const tab = this.currentTab;
      const jid = (_b = this.store) == null ? void 0 : _b.jid;
      this.teardown();
      this.currentTab = tab;
      if (jid) this.open(jid);
    }
    teardown() {
      var _a, _b, _c;
      (_b = (_a = this.mounted) == null ? void 0 : _a.unmount) == null ? void 0 : _b.call(_a);
      this.mounted = null;
      this.store = null;
      (_c = this.overlay) == null ? void 0 : _c.remove();
      this.overlay = null;
      while (this.modalStack.length) this.closeTopModal();
    }
    close() {
      var _a;
      if (((_a = this.store) == null ? void 0 : _a.dirtyTracks().length) && !confirm("Còn thay đổi CHƯA LƯU. Đóng và bỏ các thay đổi này?")) return;
      const saved = this.savedCount;
      this.teardown();
      if (saved && confirm("Bạn đã lưu thay đổi. Reload trang CVAT bây giờ để thấy dữ liệu mới trên Canvas?")) {
        location.reload();
      }
    }
  };
  __publicField(_HelperOverlay, "instance", null);
  let HelperOverlay = _HelperOverlay;
  class FloatingPanel {
    constructor() {
      __publicField(this, "container", null);
      __publicField(this, "miniPill", null);
      __publicField(this, "toastOverlay", null);
      __publicField(this, "toastTimer", null);
      __publicField(this, "isMinimized", false);
      __publicField(this, "trackStudioModal", new TrackStudioModal());
      // Ngăn xếp hoàn tác thao tác (Undo / Pre Stack)
      __publicField(this, "undoStack", []);
      // Chế độ phân loại đối tượng nhanh: "car" | "pedestrian" | "cyclist"
      __publicField(this, "selectedCategory", "car");
      // Trạng thái mở rộng accordion tinh chỉnh nâng cao
      __publicField(this, "isAdvancedOpen", false);
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
      __publicField(this, "currentRawPoints", null);
      // Lưu trữ mảng điểm nguyên bản (16 điểm) từ CVAT
      // Giá trị đang chỉnh sửa trên ô input (L, W, H)
      __publicField(this, "editL", 0);
      __publicField(this, "editW", 0);
      __publicField(this, "editH", 0);
      // Danh sách các xe ĐANG CÓ MẶT TẠI FRAME HIỆN TẠI
      __publicField(this, "currentFrameNumber", 0);
      __publicField(this, "lastContextImageFrame", -1);
      __publicField(this, "frameTracks", []);
      // Trạng thái Dropdown Select & Tìm kiếm
      __publicField(this, "isDropdownOpen", false);
      __publicField(this, "searchKeyword", "");
      __publicField(this, "autoSelectListenerAttached", false);
      __publicField(this, "autoCenterOnFrame", localStorage.getItem("CVAT_3D_SUITE_AUTO_CENTER_FRAME") !== "false");
      // Cấu hình Chế độ màu mây điểm LiDAR & Nhuộm màu xe bọc
      __publicField(this, "pointColorMode", localStorage.getItem("cvat_3d_point_color_mode") || "intensity");
      __publicField(this, "colorizeBoxedPoints", localStorage.getItem("cvat_3d_colorize_boxed") !== "false");
      // Thống kê vòng đời của Track ID đang chọn
      __publicField(this, "trackStats", null);
      __publicField(this, "trackStatsLoading", false);
      // Trạng thái xử lý
      __publicField(this, "isProcessing", false);
      __publicField(this, "isHelpModalOpen", false);
      __publicField(this, "helpModalContainer", null);
      // Tọa độ kéo thả
      __publicField(this, "isDragging", false);
      __publicField(this, "startX", 0);
      __publicField(this, "startY", 0);
      // Khung nhìn đang active (Top, Side, Front, hoặc Perspective 3D) để điều khiển WASD
      __publicField(this, "currentActiveView", "top");
      __publicField(this, "currentCtx", null);
      __publicField(this, "pollInterval", null);
      __publicField(this, "updatePending", false);
      __publicField(this, "lastRenderedHash", "");
    }
    /**
     * Cập nhật khung nhìn đang focus (được gọi từ trình theo dõi chuột trên Canvas)
     */
    setActiveView(view) {
      if (this.currentActiveView !== view) {
        this.currentActiveView = view;
        this.scheduleUpdate();
      }
    }
    /**
     * Lên lịch cập nhật giao diện bằng requestAnimationFrame (gộp nhiều lần gọi dồn dập, chống nháy DOM).
     */
    scheduleUpdate() {
      if (this.updatePending) return;
      this.updatePending = true;
      requestAnimationFrame(() => {
        this.updatePending = false;
        this.updateContent();
      });
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
        const camOverlay = CameraOverlayManager.getInstance();
        camOverlay.mount();
        camOverlay.onCameraFocusRequested = (camId) => {
          const box = this.getCurrentBox3D();
          const imgSrc = CameraOverlayManager.getInstance().getCameraImageSrc(camId);
          CameraFocusModal.getInstance().open(camId, box, imgSrc || void 0);
        };
        this.loadVinCalibration();
        CVATBridge.setAutoCenterOnFrameChange(this.autoCenterOnFrame);
        CVATBridge.setPointCloudColorMode(this.pointColorMode, this.colorizeBoxedPoints);
      }
      this.scheduleUpdate();
      if (!HeaderSuiteButton.isSuiteEnabled()) {
        this.setSuiteVisible(false);
      }
    }
    /**
     * Bật hoặc Tắt hiển thị Suite Panel và Camera Overlay (Được kích hoạt từ nút Header hoặc API)
     */
    setSuiteVisible(visible) {
      if (!visible) {
        if (this.container) {
          this.container.style.display = "none";
        }
        try {
          CameraOverlayManager.getInstance().hide();
        } catch (_) {
        }
      } else {
        if (this.container) {
          this.container.style.display = "flex";
        }
        try {
          CameraOverlayManager.getInstance().show();
        } catch (_) {
        }
        this.scheduleUpdate();
      }
    }
    /**
     * Trích xuất đối tượng Box3D hiện thời của đối tượng đang chọn
     */
    /**
     * Trích xuất đối tượng Box3D hiện thời của đối tượng đang chọn.
     * Ưu tiên dùng rawPoints gốc (chính xác nhất) để chiếu 2D chuẩn.
     */
    getCurrentBox3D() {
      if (this.selectedUiId === null || this.currentL <= 0) return null;
      if (this.currentRawPoints && this.currentRawPoints.length >= 9) {
        return {
          c: [this.currentRawPoints[0], this.currentRawPoints[1], this.currentRawPoints[2]],
          s: [this.currentRawPoints[6], this.currentRawPoints[7], this.currentRawPoints[8]],
          r: [this.currentRawPoints[3], this.currentRawPoints[4], this.currentRawPoints[5]]
        };
      }
      const rx = 0;
      const ry = 0;
      const rz = this.currentYawDeg * Math.PI / 180;
      return {
        c: [this.currentX, this.currentY, this.currentZ],
        s: [this.currentL, this.currentW, this.currentH],
        r: [rx, ry, rz]
      };
    }
    /**
     * Tự động tải calibration VinFast từ CVAT Day14 overlay hoặc hardcoded fallback.
     * Chỉ truyền raw VinCalib cho Day14 engine, KHÔNG thay thế grid 8 camera mặc định.
     */
    async loadVinCalibration() {
      try {
        const vinCalib = await CVATBridge.fetchVinCalibration();
        if (!vinCalib || !vinCalib.cameras) return;
        setVinCalibForOverlay(vinCalib);
        const camNames = Object.keys(vinCalib.cameras);
        console.log(`[VinCalib] Đã load VinFast calibration: ${camNames.length} cameras [${camNames.join(", ")}] (Day14 engine active)`);
      } catch (e) {
        console.warn("[VinCalib] Lỗi load calibration:", e);
      }
    }
    createContainer() {
      this.container = document.createElement("div");
      this.container.id = "cvat-3d-suite-floating";
      this.container.setAttribute("translate", "no");
      this.container.classList.add("notranslate");
      this.container.style.position = "fixed";
      this.container.style.top = "70px";
      this.container.style.right = "24px";
      this.container.style.width = "360px";
      this.container.style.maxHeight = "calc(100vh - 90px)";
      this.container.style.zIndex = "999995";
      this.container.style.fontFamily = "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      this.container.style.backgroundColor = "rgba(255, 255, 255, 0.98)";
      this.container.style.backdropFilter = "blur(16px)";
      this.container.style.border = "1px solid #e2e8f0";
      this.container.style.borderRadius = "12px";
      this.container.style.boxShadow = "0 10px 30px -5px rgba(0, 0, 0, 0.1), 0 0 1px 1px rgba(0, 0, 0, 0.05)";
      this.container.style.color = "#09090b";
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
      this.miniPill.style.backgroundColor = "rgba(255, 255, 255, 0.98)";
      this.miniPill.style.backdropFilter = "blur(12px)";
      this.miniPill.style.border = "1px solid #e4e4e7";
      this.miniPill.style.borderRadius = "9999px";
      this.miniPill.style.padding = "8px 14px";
      this.miniPill.style.color = "#09090b";
      this.miniPill.style.fontSize = "12px";
      this.miniPill.style.fontWeight = "600";
      this.miniPill.style.display = "none";
      this.miniPill.style.alignItems = "center";
      this.miniPill.style.gap = "8px";
      this.miniPill.style.boxShadow = "0 10px 25px -5px rgba(0, 0, 0, 0.08)";
      this.miniPill.style.cursor = "pointer";
      this.miniPill.style.userSelect = "none";
      this.miniPill.innerHTML = `
      <span style="width: 8px; height: 8px; border-radius: 50%; background: #10b981; box-shadow: 0 0 6px #10b981;"></span>
      <span>3D Suite</span>
      <span style="font-size: 10px; font-family: monospace; color: #71717a; background: #f4f4f5; border: 1px solid #e4e4e7; padding: 2px 6px; border-radius: 4px;">\`</span>
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
      let bgColor = "#059669";
      let textColor = "#ffffff";
      let iconSvg = ICONS.checkCircle;
      if (type === "info") {
        bgColor = "#0284c7";
        iconSvg = ICONS.infoCircle;
      } else if (type === "warning") {
        bgColor = "#d97706";
        textColor = "#ffffff";
        iconSvg = ICONS.alertCircle;
      } else if (type === "error") {
        bgColor = "#dc2626";
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
        box-shadow: 0 10px 25px -4px rgba(0, 0, 0, 0.18), 0 0 1px 1px rgba(0, 0, 0, 0.06);
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
          if (this.isDocked && this.cvatOrigChildrenEl) {
            this.cvatOrigChildrenEl.style.visibility = "visible";
            this.cvatOrigChildrenEl.style.pointerEvents = "auto";
          }
        } else {
          this.container.style.display = "flex";
          this.miniPill.style.display = "none";
          if (this.isDocked && this.cvatOrigChildrenEl && !this.isShowingCVATOrigSidebar) {
            this.cvatOrigChildrenEl.style.visibility = "hidden";
            this.cvatOrigChildrenEl.style.pointerEvents = "none";
          }
        }
      }
    }
    /**
     * Kéo thả cửa sổ nổi
     */
    setupDraggable() {
      if (!this.container) return;
      const onMouseDown = (e) => {
        if (this.isDocked) return;
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
          this.currentRawPoints = Array.isArray(details.points) ? [...details.points] : null;
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
          if (!this.trackStats || this.trackStats.uiId !== details.clientId) {
            this.loadTrackStats(details.clientId);
          }
          this.scheduleUpdate();
        } else if (clientId && clientId !== this.selectedUiId) {
          console.log(`[CVAT 3D Suite] Tự động chọn xe #${clientId} từ click Canvas 3D`);
          this.selectTrackByUiId(clientId, void 0, false);
        }
      });
      window.addEventListener("CVAT_EXT_RES_FRAME_TRACKS_DIRTY", () => {
        this.syncFrameTracks();
      });
      window.addEventListener("CVAT_EXT_RES_FRAME_CHANGED", (e) => {
        const { frame } = e.detail || {};
        if (typeof frame === "number" && frame !== this.currentFrameNumber) {
          this.currentFrameNumber = frame;
          this.syncFrameTracks();
        }
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
          const isTrackInCurrentFrame = this.frameTracks.some((t) => t.uiId === active.id);
          if (isTrackInCurrentFrame) {
            await this.selectTrackByUiId(active.id, void 0, false);
          }
        }
      }, 800);
      setTimeout(() => this.syncFrameTracks(), 1200);
    }
    /**
     * Vi chỉnh nhanh Box 3D bằng tổ hợp phím Shift + WASD theo Screen Space trực quan (độc lập với góc xoay của xe)
     * - Phím Shift + A: Luôn luôn dịch sang TRÁI màn hình (Chỉ Frame Hiện Tại)
     * - Phím Shift + D: Luôn luôn dịch sang PHẢI màn hình (Chỉ Frame Hiện Tại)
     * - Phím Shift + W: Luôn luôn dịch LÊN TRÊN màn hình (Chỉ Frame Hiện Tại)
     * - Phím Shift + S: Luôn luôn dịch XUỐNG DƯỚI màn hình (Chỉ Frame Hiện Tại)
     * 🚨 QUY TẮC BẮT BUỘC: TUYỆT ĐỐI KHÔNG ÁP DỤNG TOÀN BỘ TRACK KHI DÙNG SHIFT+WASD (Chỉ tác động Frame này).
     * @param key Phím bấm ('w', 'a', 's', 'd')
     */
    async handleNudgeByView(key) {
      var _a;
      const activeId = await this.ensureActiveTrackSelected();
      if (!activeId || !((_a = this.currentCtx) == null ? void 0 : _a.jobId)) {
        this.showToast("Chưa chọn đối tượng để vi chỉnh!", "warning");
        return;
      }
      const step = 0.02;
      let deltaXWorld = 0;
      let deltaYWorld = 0;
      let deltaZWorld = 0;
      const view = this.currentActiveView;
      switch (view) {
        case "side":
          if (key === "w") deltaZWorld = step;
          if (key === "s") deltaZWorld = -step;
          if (key === "a") deltaXWorld = -step;
          if (key === "d") deltaXWorld = step;
          break;
        case "front":
          if (key === "w") deltaZWorld = step;
          if (key === "s") deltaZWorld = -step;
          if (key === "a") deltaYWorld = step;
          if (key === "d") deltaYWorld = -step;
          break;
        case "top":
        case "perspective":
        default:
          if (key === "w") deltaXWorld = step;
          if (key === "s") deltaXWorld = -step;
          if (key === "a") deltaYWorld = step;
          if (key === "d") deltaYWorld = -step;
          break;
      }
      try {
        await this.pushUndoSnapshot(
          `Shift+WASD Nudge [${view.toUpperCase()}]: ${key.toUpperCase()}`,
          false
        );
        const res = await CVATBridge.shiftTrackCenter(
          this.currentCtx.jobId,
          activeId,
          this.selectedServerId,
          deltaXWorld,
          deltaYWorld,
          deltaZWorld,
          false,
          true
        );
        if (res.success) {
          if (res.newX !== void 0) this.currentX = res.newX;
          if (res.newY !== void 0) this.currentY = res.newY;
          if (res.newZ !== void 0) this.currentZ = res.newZ;
          this.scheduleUpdate();
        }
      } catch (err) {
        console.warn("[CVAT 3D Suite] Lỗi vi chỉnh WASD:", err);
      }
    }
    /**
     * Đảm bảo luôn có đối tượng được chọn trước khi thực hiện thao tác phím tắt hoặc nút bấm.
     * Nếu selectedUiId đang null, tự động quét từ Sidebar hoặc lấy xe đầu tiên trong Frame.
     */
    async ensureActiveTrackSelected() {
      var _a;
      if (this.selectedUiId !== null) return this.selectedUiId;
      const active = CVATBridge.getActiveTrackId();
      if (active.id !== null) {
        console.log(`[CVAT 3D Suite] Tự động chọn xe active #${active.id} từ Sidebar`);
        await this.selectTrackByUiId(active.id, void 0, false);
        return this.selectedUiId;
      }
      if (this.frameTracks.length > 0) {
        console.log(`[CVAT 3D Suite] Tự động chọn xe đầu tiên #${this.frameTracks[0].uiId} trong frame`);
        await this.selectTrackByUiId(this.frameTracks[0].uiId, void 0, false);
        return this.selectedUiId;
      }
      if ((_a = this.currentCtx) == null ? void 0 : _a.jobId) {
        await this.syncFrameTracks();
        if (this.frameTracks.length > 0) {
          console.log(`[CVAT 3D Suite] Tự động đồng bộ và chọn xe #${this.frameTracks[0].uiId}`);
          await this.selectTrackByUiId(this.frameTracks[0].uiId, void 0, false);
          return this.selectedUiId;
        }
      }
      return null;
    }
    /**
     * Đồng bộ danh sách xe có mặt tại Frame hiện tại
     */
    async syncFrameTracks() {
      if (!this.currentCtx || !this.currentCtx.jobId) return;
      this.currentFrameNumber = CVATBridge.getCurrentFrame();
      const tracks = await CVATBridge.getTracksInCurrentFrame(this.currentCtx.jobId, this.currentFrameNumber);
      this.frameTracks = tracks;
      if (this.currentFrameNumber !== this.lastContextImageFrame) {
        this.lastContextImageFrame = this.currentFrameNumber;
        CVATBridge.fetchContextImages(this.currentCtx.jobId, this.currentFrameNumber).then((images) => {
          if (images.size > 0) {
            images.forEach((blobUrl, camIdx) => {
              CameraOverlayManager.getInstance().updateCameraImage(camIdx, blobUrl);
            });
          }
        }).catch(() => {
        });
      }
      const isCurrentTrackInFrame = tracks.some((t) => t.uiId === this.selectedUiId);
      if (!isCurrentTrackInFrame && tracks.length > 0) {
        await this.selectTrackByUiId(tracks[0].uiId, void 0, false);
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
        if (this.selectedUiId && (!this.trackStats || this.trackStats.uiId !== this.selectedUiId)) {
          this.loadTrackStats(this.selectedUiId);
        }
        this.scheduleUpdate();
      } else if (tracks.length === 0 && this.selectedUiId !== null) {
        this.selectedUiId = null;
        this.selectedServerId = null;
        this.currentLabel = "Chưa chọn đối tượng";
        this.scheduleUpdate();
      }
    }
    syncCategoryFromLabel(label) {
      const l = (label || "").toLowerCase();
      if (l.includes("pedestrian") || l.includes("person") || l.includes("walker") || l.includes("human")) {
        this.selectedCategory = "pedestrian";
      } else if (l.includes("cyclist") || l.includes("bicycle") || l.includes("motorcycle") || l.includes("motorbike") || l.includes("motobike") || l.includes("bike") || l.includes("rider") || l.includes("scooter") || l.includes("moped") || l.includes("two_wheeler") || l.includes("two-wheeler") || l.includes("twowheeler") || l.includes("2_wheeler") || l.includes("2-wheeler") || l.includes("2wheeler") || l.includes("motor") || l.includes("cycle") || l.includes("xe máy") || l.includes("xe_may") || l.includes("xemay") || l.includes("xe đạp") || l.includes("xe_dap") || l.includes("xedap") || l.includes("xe 2 bánh") || l.includes("xe_2_banh")) {
        this.selectedCategory = "cyclist";
      } else {
        this.selectedCategory = "car";
      }
    }
    /**
     * Chọn xe theo UI ID (#1, #2...) và kích hoạt highlight trên Canvas
     * @param activateCanvas Chỉ bật khi người dùng chủ động click hoặc dùng hotkey, không bật khi sync ngầm lúc F5!
     */
    async selectTrackByUiId(uiId, details, activateCanvas = true) {
      this.selectedUiId = uiId;
      CVATBridge.setActiveTrackIdInMainWorld(uiId);
      if (!this.trackStats || this.trackStats.uiId !== uiId) {
        this.loadTrackStats(uiId);
      }
      let targetPos;
      if (details) {
        targetPos = { x: details.x, y: details.y, z: details.z };
      } else {
        const foundInFrame2 = this.frameTracks.find((t) => t.uiId === uiId);
        if (foundInFrame2) {
          targetPos = { x: foundInFrame2.x, y: foundInFrame2.y, z: foundInFrame2.z };
        }
      }
      if (activateCanvas) {
        CVATBridge.activateCanvasTrack(uiId, targetPos);
        CVATBridge.centerCanvas3DOnTrack(uiId, targetPos);
      }
      if (details) {
        this.selectedServerId = details.serverId || null;
        this.currentLabel = details.label || `Xe #${uiId}`;
        this.syncCategoryFromLabel(this.currentLabel);
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
        this.currentRawPoints = Array.isArray(details.points) ? [...details.points] : null;
        if (activateCanvas && targetPos) {
          CVATBridge.centerCanvas3DOnTrack(uiId, targetPos);
        }
        this.scheduleUpdate();
        return;
      }
      const foundInFrame = this.frameTracks.find((t) => t.uiId === uiId);
      if (foundInFrame) {
        this.selectedServerId = foundInFrame.serverId;
        this.currentLabel = foundInFrame.label;
        this.syncCategoryFromLabel(this.currentLabel);
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
        if (activateCanvas) {
          CVATBridge.centerCanvas3DOnTrack(uiId, { x: foundInFrame.x, y: foundInFrame.y, z: foundInFrame.z });
        }
        this.scheduleUpdate();
        return;
      }
      await this.syncFrameTracks();
    }
    selectPrevTrack() {
      if (this.frameTracks.length === 0) return;
      const idx = this.frameTracks.findIndex((t) => t.uiId === this.selectedUiId);
      if (idx > 0) {
        this.selectTrackByUiId(this.frameTracks[idx - 1].uiId, void 0, true);
      } else {
        this.selectTrackByUiId(this.frameTracks[this.frameTracks.length - 1].uiId, void 0, true);
      }
    }
    selectNextTrack() {
      if (this.frameTracks.length === 0) return;
      const idx = this.frameTracks.findIndex((t) => t.uiId === this.selectedUiId);
      if (idx !== -1 && idx < this.frameTracks.length - 1) {
        this.selectTrackByUiId(this.frameTracks[idx + 1].uiId, void 0, true);
      } else {
        this.selectTrackByUiId(this.frameTracks[0].uiId, void 0, true);
      }
    }
    /**
     * Căn giữa tức thì View 3D vào xe đang chọn
     */
    handleCenterCurrentTrack() {
      if (this.selectedUiId !== null) {
        CVATBridge.centerCanvas3DOnTrack(this.selectedUiId);
        this.showToast(`Đã căn giữa xe #${this.selectedUiId}`, "info");
      } else {
        this.showToast("Chưa chọn đối tượng để căn giữa!", "warning");
      }
    }
    /**
     * Lưu snapshot trạng thái trước khi thực hiện thao tác để người dùng có thể bấm Hoàn Tác (Pre).
     */
    async pushUndoSnapshot(actionName, forTrack = false) {
      if (!this.currentCtx || !this.currentCtx.jobId || this.selectedUiId === null) return;
      try {
        let currentBoxPoints;
        if (Array.isArray(this.currentRawPoints) && this.currentRawPoints.length >= 16) {
          currentBoxPoints = [...this.currentRawPoints];
          currentBoxPoints[0] = this.currentX;
          currentBoxPoints[1] = this.currentY;
          currentBoxPoints[2] = this.currentZ;
          currentBoxPoints[3] = 0;
          currentBoxPoints[4] = 0;
          currentBoxPoints[5] = this.currentYawDeg * Math.PI / 180;
          currentBoxPoints[6] = this.currentL;
          currentBoxPoints[7] = this.currentW;
          currentBoxPoints[8] = this.currentH;
        } else {
          currentBoxPoints = [
            this.currentX,
            this.currentY,
            this.currentZ,
            0,
            0,
            this.currentYawDeg * Math.PI / 180,
            this.currentL,
            this.currentW,
            this.currentH
          ];
          while (currentBoxPoints.length < 16) {
            currentBoxPoints.push(0);
          }
        }
        let trackShapesBackup = void 0;
        if (forTrack || this.applyToTrack) {
          const serverId = this.selectedServerId || this.selectedUiId;
          const allFrames = await CVATBridge.getTrackAllFrames(this.currentCtx.jobId, this.selectedUiId, serverId);
          if (allFrames && allFrames.length > 0) {
            trackShapesBackup = allFrames.map((f) => ({
              frame: f.frame,
              outside: f.outside,
              points: [...f.points]
            }));
          }
        }
        this.undoStack.push({
          uiId: this.selectedUiId,
          serverId: this.selectedServerId,
          frame: this.currentFrameNumber,
          applyToTrack: forTrack || this.applyToTrack,
          boxPoints: currentBoxPoints,
          trackShapesBackup,
          actionName
        });
        if (this.undoStack.length > 25) {
          this.undoStack.shift();
        }
      } catch (err) {
        console.warn("[CVAT 3D Suite] Lỗi lưu Undo Snapshot:", err);
      }
    }
    /**
     * Hoàn tác (Pre) thao tác vừa thực hiện
     */
    async handleUndo() {
      if (this.undoStack.length === 0) {
        this.showToast("Không có thao tác nào để hoàn tác (Pre)!", "info");
        return;
      }
      if (this.isProcessing) return;
      this.isProcessing = true;
      const snapshot = this.undoStack.pop();
      this.showToast(`Đang hoàn tác: ${snapshot.actionName}...`, "info");
      try {
        const res = await CVATBridge.restoreTrackSnapshot(
          this.currentCtx.jobId,
          snapshot.uiId,
          snapshot.serverId,
          {
            frame: snapshot.frame,
            applyToTrack: snapshot.applyToTrack,
            boxPoints: snapshot.boxPoints,
            trackShapesBackup: snapshot.trackShapesBackup
          }
        );
        if (res.success) {
          if (Array.isArray(snapshot.boxPoints) && snapshot.boxPoints.length >= 9) {
            this.currentX = snapshot.boxPoints[0];
            this.currentY = snapshot.boxPoints[1];
            this.currentZ = snapshot.boxPoints[2];
            this.currentYawDeg = Math.round(snapshot.boxPoints[5] * 180 / Math.PI);
            this.currentL = snapshot.boxPoints[6];
            this.currentW = snapshot.boxPoints[7];
            this.currentH = snapshot.boxPoints[8];
            this.editL = this.currentL;
            this.editW = this.currentW;
            this.editH = this.currentH;
            this.currentRawPoints = [...snapshot.boxPoints];
          }
          this.showToast(`Đã hoàn tác: ${snapshot.actionName}`, "success");
          await this.syncFrameTracks();
        } else {
          this.showToast(res.message || "Không thể hoàn tác!", "error");
        }
      } catch (err) {
        this.showToast(`Lỗi hoàn tác: ${err.message || err}`, "error");
      } finally {
        this.isProcessing = false;
        this.updateContent();
      }
    }
    /**
     * Đánh dấu Outside (ẩn) cho toàn bộ các frame của Track đang chọn
     */
    async handleSetTrackOutside(outside = true) {
      if (!this.currentCtx || !this.currentCtx.jobId) {
        this.showToast("Chưa kết nối Job CVAT!", "warning");
        return;
      }
      if (this.selectedUiId === null) {
        this.showToast("Vui lòng chọn xe trước!", "warning");
        return;
      }
      if (this.isProcessing) return;
      await this.pushUndoSnapshot(`${outside ? "Outside (Ẩn)" : "Inside (Hiện)"} Toàn Track #${this.selectedUiId}`, true);
      this.isProcessing = true;
      this.showToast(`Đang đánh dấu ${outside ? "Outside" : "Inside"} cho toàn bộ Track #${this.selectedUiId}...`, "info");
      try {
        const serverId = this.selectedServerId || this.selectedUiId;
        const res = await CVATBridge.setTrackOutside(
          this.currentCtx.jobId,
          this.selectedUiId,
          serverId,
          outside,
          this.currentFrameNumber
        );
        if (res.success) {
          this.showToast(
            `Đã đánh dấu ${outside ? "Outside (Ẩn)" : "Inside (Hiện)"} cho ${res.count || "toàn bộ"} frame của Track #${this.selectedUiId}! Bấm Pre để hoàn tác.`,
            "success"
          );
          await this.syncFrameTracks();
          await this.loadTrackStats(this.selectedUiId);
        } else {
          this.showToast(res.message || "Không thể đổi trạng thái Outside!", "error");
        }
      } catch (err) {
        this.showToast(`Lỗi đánh dấu Outside: ${err.message || err}`, "error");
      } finally {
        this.isProcessing = false;
        this.updateContent();
      }
    }
    /**
     * Tải ngầm thống kê toàn bộ vòng đời của Track ID (Total frames, Active, Outside, Dải frame)
     */
    async loadTrackStats(uiId) {
      var _a, _b;
      if (uiId === null || !((_a = this.currentCtx) == null ? void 0 : _a.jobId)) {
        this.trackStats = null;
        this.updateContent();
        return;
      }
      try {
        this.trackStatsLoading = true;
        const serverId = this.selectedServerId || uiId;
        const allFrames = await CVATBridge.getTrackAllFrames(this.currentCtx.jobId, uiId, serverId);
        if (this.selectedUiId !== uiId) return;
        if (Array.isArray(allFrames) && allFrames.length > 0) {
          const totalFrames = allFrames.length;
          const startFrame = allFrames[0].frame;
          const endFrame = allFrames[allFrames.length - 1].frame;
          const outsideCount = allFrames.filter((f) => !!f.outside).length;
          const activeCount = totalFrames - outsideCount;
          const isFullyOutside = outsideCount === totalFrames;
          const isFullyActive = outsideCount === 0;
          this.trackStats = {
            uiId,
            totalFrames,
            startFrame,
            endFrame,
            activeCount,
            outsideCount,
            isFullyOutside,
            isFullyActive,
            label: ((_b = allFrames[0]) == null ? void 0 : _b.label) || this.currentLabel
          };
        } else {
          this.trackStats = null;
        }
      } catch (err) {
        console.warn("[CVAT 3D Suite] Lỗi loadTrackStats:", err);
        this.trackStats = null;
      } finally {
        this.trackStatsLoading = false;
        this.updateContent();
      }
    }
    /**
     * Hiển thị dải Sub-Header thống kê Track ID ngay tại cụm tiêu đề Floating Panel
     */
    renderTrackStatsSubHeader() {
      if (this.selectedUiId === null) {
        return "";
      }
      const stats = this.trackStats;
      const isLoading = this.trackStatsLoading && !stats;
      if (isLoading) {
        return `
        <div style="
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
          padding: 4px 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 10px;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          color: #64748b;
        ">
          <div style="display: flex; align-items: center; gap: 5px;">
            <span style="font-weight: 700; color: #0284c7;">Track #${this.selectedUiId}</span>
            <span style="font-size: 9px; color: #94a3b8;">Đang tải thống kê track...</span>
          </div>
        </div>
      `;
      }
      if (!stats) {
        return `
        <div style="
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
          padding: 4px 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 10px;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          color: #64748b;
        ">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-weight: 700; color: #0284c7;">Track #${this.selectedUiId}</span>
            <span style="color: #64748b; font-size: 9.5px;">${this.currentLabel}</span>
          </div>
          <span style="font-size: 9px; color: #94a3b8;">F#${this.currentFrameNumber}</span>
        </div>
      `;
      }
      const { totalFrames, startFrame, endFrame, activeCount, outsideCount, isFullyOutside, isFullyActive } = stats;
      let badgeHtml = "";
      if (isFullyOutside) {
        badgeHtml = `
        <span style="
          background: #fee2e2;
          border: 1px solid #fecdd3;
          color: #e11d48;
          padding: 1px 6px;
          border-radius: 4px;
          font-weight: 700;
          font-size: 9.5px;
          display: inline-flex;
          align-items: center;
          gap: 3px;
        ">
          ${ICONS.eyeOff}
          <span>Ẩn Toàn Bộ (${totalFrames}f)</span>
        </span>
      `;
      } else if (isFullyActive) {
        badgeHtml = `
        <span style="
          background: #ecfdf5;
          border: 1px solid #a7f3d0;
          color: #059669;
          padding: 1px 6px;
          border-radius: 4px;
          font-weight: 600;
          font-size: 9.5px;
          display: inline-flex;
          align-items: center;
          gap: 3px;
        ">
          ${ICONS.eye}
          <span>Hiện Toàn Bộ (${totalFrames}f)</span>
        </span>
      `;
      } else {
        badgeHtml = `
        <div style="display: flex; align-items: center; gap: 4px; font-size: 9.5px; font-weight: 600;">
          <span style="color: #059669; background: #ecfdf5; border: 1px solid #a7f3d0; padding: 1px 5px; border-radius: 4px; display: inline-flex; align-items: center; gap: 2px;">
            ${ICONS.eye} ${activeCount} Hiện
          </span>
          <span style="color: #e11d48; background: #fee2e2; border: 1px solid #fecdd3; padding: 1px 5px; border-radius: 4px; display: inline-flex; align-items: center; gap: 2px;">
            ${ICONS.eyeOff} ${outsideCount} Ẩn
          </span>
        </div>
      `;
      }
      return `
      <div style="
        background: ${isFullyOutside ? "#fff5f5" : "#f8fafc"};
        border-bottom: 1px solid ${isFullyOutside ? "#fed7aa" : "#e2e8f0"};
        padding: 4px 10px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 10px;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        transition: background 0.15s;
      ">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="font-weight: 700; color: ${isFullyOutside ? "#e11d48" : "#0284c7"};">Track #${this.selectedUiId}</span>
          <span style="color: #64748b; font-size: 9.5px;">
            ${totalFrames} frames (F#${startFrame} ➔ F#${endFrame})
          </span>
        </div>
        <div>
          ${badgeHtml}
        </div>
      </div>
    `;
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
        await this.ensureActiveTrackSelected();
      }
      if (this.selectedUiId === null) {
        this.showToast("Vui lòng chọn xe từ danh sách!", "warning");
        return;
      }
      if (this.isProcessing) return;
      await this.pushUndoSnapshot(currentFrameOnly ? "Lật 180° Frame" : "Lật 180° Track", !currentFrameOnly);
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
        if (this.selectedUiId !== null) {
          CVATBridge.centerCanvas3DOnTrack(this.selectedUiId, { x: this.currentX, y: this.currentY, z: this.currentZ });
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
    async handleUpdateDimensions(l, w, h2, applyToTrack) {
      if (!this.currentCtx || !this.currentCtx.jobId) {
        this.showToast("Chưa kết nối Job CVAT!", "warning");
        return;
      }
      if (this.selectedUiId === null) {
        this.showToast("Vui lòng chọn xe trước!", "warning");
        return;
      }
      if (l <= 0 || w <= 0 || h2 <= 0) {
        this.showToast("Kích thước không hợp lệ!", "warning");
        return;
      }
      if (this.isProcessing) return;
      await this.pushUndoSnapshot("Cập nhật Kích Thước", applyToTrack);
      this.isProcessing = true;
      const scopeMsg = applyToTrack ? "toàn bộ track" : "frame này";
      this.showToast(`Đang lưu ${l}x${w}x${h2}m cho ${scopeMsg}...`, "info");
      try {
        const serverId = this.selectedServerId || this.selectedUiId;
        const res = await CVATBridge.updateTrackDimensions(
          this.currentCtx.jobId,
          this.selectedUiId,
          serverId,
          l,
          w,
          h2,
          applyToTrack
        );
        this.currentL = l;
        this.currentW = w;
        this.currentH = h2;
        this.editL = l;
        this.editW = w;
        this.editH = h2;
        this.currentZ = res.newZ;
        const targetItem = this.frameTracks.find((t) => t.uiId === this.selectedUiId);
        if (targetItem) {
          targetItem.l = l;
          targetItem.w = w;
          targetItem.h = h2;
          targetItem.z = res.newZ;
        }
        if (this.selectedUiId !== null) {
          CVATBridge.centerCanvas3DOnTrack(this.selectedUiId, { x: this.currentX, y: this.currentY, z: this.currentZ });
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
     * Xoay vi chỉnh góc Yaw tương đối một lượng deltaDeg (ví dụ: -1°, +1°, -5°, +5°)
     */
    async rotateYawByDelta(deg2) {
      if (!this.currentCtx || !this.currentCtx.jobId) return;
      if (this.selectedUiId === null) {
        await this.ensureActiveTrackSelected();
      }
      if (this.selectedUiId === null) {
        this.showToast("Vui lòng chọn xe trước!", "warning");
        return;
      }
      let newDeg = Math.round(this.currentYawDeg + deg2);
      while (newDeg > 180) newDeg -= 360;
      while (newDeg < -180) newDeg += 360;
      const rad = newDeg * Math.PI / 180;
      await this.pushUndoSnapshot(`Xoay Yaw ${deg2 > 0 ? "+" : ""}${deg2}°`, this.applyToTrack);
      this.currentYawDeg = newDeg;
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
      const sign = deg2 > 0 ? "+" : "";
      if (this.selectedUiId !== null) {
        CVATBridge.centerCanvas3DOnTrack(this.selectedUiId, { x: this.currentX, y: this.currentY, z: this.currentZ });
      }
      this.showToast(`Xoay Yaw ${sign}${deg2}° ➔ ${newDeg}°`, "info");
      this.updateContent();
    }
    /**
     * Chuyển đổi giữa 2 phạm vi: Chỉ Frame Này <-> Toàn Bộ Track
     */
    toggleScope() {
      this.applyToTrack = !this.applyToTrack;
      this.updateContent();
      this.showToast(`Phạm vi: ${this.applyToTrack ? "Toàn Bộ Track" : "Chỉ Frame Này"}`, "info");
    }
    /**
     * 1-Click Smart Fit hoàn chỉnh toàn diện (TOP -> SIDE -> FRONT)
     */
    async handleSmartFitAll() {
      if (this.selectedCategory === "cyclist") {
        await this.handleFitCyclist("all");
      } else if (this.selectedCategory === "pedestrian") {
        await this.handleFitPedestrian("all");
      } else {
        await this.handleEgoRayFit("all");
      }
    }
    /**
     * Fit Box trực tiếp tại Frame Hiện Tại với Padding 5cm mỗi bên (+10cm L, +10cm W, +5cm H, Đáy bám sàn cố định)
     */
    async handleFitCurrentBox() {
      var _a, _b, _c;
      if (!this.currentCtx || !this.currentCtx.jobId) {
        this.showToast("Chưa kết nối Job CVAT!", "warning");
        return;
      }
      if (this.selectedUiId === null) {
        this.showToast("Vui lòng chọn đối tượng trước!", "warning");
        return;
      }
      if (this.isProcessing) return;
      await this.pushUndoSnapshot("Fit Box Hiện Tại (+5cm Pad)", this.applyToTrack);
      this.isProcessing = true;
      this.showToast("Đang đo mây điểm & Fit Box hiện tại (+5cm Pad)...", "info");
      try {
        const serverId = this.selectedServerId || this.selectedUiId;
        const res = await CVATBridge.fitCurrentBox(
          this.currentCtx.jobId,
          this.selectedUiId,
          serverId,
          this.applyToTrack
        );
        if (res.success && res.newL && res.newW && res.newH) {
          this.currentL = res.newL;
          this.currentW = res.newW;
          this.currentH = res.newH;
          this.editL = res.newL;
          this.editW = res.newW;
          this.editH = res.newH;
          if (res.newZ !== void 0) this.currentZ = res.newZ;
          const targetItem = this.frameTracks.find((t) => t.uiId === this.selectedUiId);
          if (targetItem) {
            targetItem.l = res.newL;
            targetItem.w = res.newW;
            targetItem.h = res.newH;
            if (res.newZ !== void 0) targetItem.z = res.newZ;
          }
          const inputL = (_a = this.container) == null ? void 0 : _a.querySelector("#input-dim-l");
          const inputW = (_b = this.container) == null ? void 0 : _b.querySelector("#input-dim-w");
          const inputH = (_c = this.container) == null ? void 0 : _c.querySelector("#input-dim-h");
          if (inputL) inputL.value = String(res.newL);
          if (inputW) inputW.value = String(res.newW);
          if (inputH) inputH.value = String(res.newH);
          this.showToast(res.message, "success");
        } else {
          this.showToast(res.message || "Không thể Fit Box với frame hiện tại!", "warning");
        }
      } catch (err) {
        this.showToast(`Lỗi Fit Box: ${err.message || err}`, "error");
      } finally {
        this.isProcessing = false;
        this.updateContent();
      }
    }
    /**
     * Áp dụng kích thước chuẩn từ Preset mẫu (1-click)
     */
    async handleApplyPreset(preset) {
      if (!this.currentCtx || !this.currentCtx.jobId) {
        this.showToast("Chưa kết nối Job CVAT!", "warning");
        return;
      }
      if (this.selectedUiId === null) {
        this.showToast("Vui lòng chọn đối tượng trước!", "warning");
        return;
      }
      this.editL = preset.l;
      this.editW = preset.w;
      this.editH = preset.h;
      this.showToast(`Áp dụng mẫu: ${preset.name} (${preset.l}x${preset.w}x${preset.h}m)...`, "info");
      await this.handleUpdateDimensions(preset.l, preset.w, preset.h, this.applyToTrack);
    }
    /**
     * Vi chỉnh Center theo trục cục bộ xe:
     * deltaXLocal: Trục dọc xe (Side View, tiến/lùi)
     * deltaYLocal: Trục ngang xe (Front View, trái/phải)
     */
    async handleShiftCenter(deltaXLocal, deltaYLocal) {
      if (!this.currentCtx || !this.currentCtx.jobId) {
        this.showToast("Chưa kết nối Job CVAT!", "warning");
        return;
      }
      if (this.selectedUiId === null) {
        this.showToast("Vui lòng chọn xe trước!", "warning");
        return;
      }
      if (this.isProcessing) return;
      await this.pushUndoSnapshot("Vi Chỉnh Center", this.applyToTrack);
      this.isProcessing = true;
      try {
        const serverId = this.selectedServerId || this.selectedUiId;
        const res = await CVATBridge.shiftTrackCenter(
          this.currentCtx.jobId,
          this.selectedUiId,
          serverId,
          deltaXLocal,
          deltaYLocal,
          this.applyToTrack
        );
        if (res.success) {
          if (res.newX !== void 0) this.currentX = res.newX;
          if (res.newY !== void 0) this.currentY = res.newY;
          const targetItem = this.frameTracks.find((t) => t.uiId === this.selectedUiId);
          if (targetItem) {
            if (res.newX !== void 0) targetItem.x = res.newX;
            if (res.newY !== void 0) targetItem.y = res.newY;
          }
          if (this.selectedUiId !== null) {
            CVATBridge.centerCanvas3DOnTrack(this.selectedUiId, { x: this.currentX, y: this.currentY, z: this.currentZ });
          }
          this.showToast(res.message, "success");
        } else {
          this.showToast(res.message || "Lỗi khi vi chỉnh Center!", "error");
        }
      } catch (err) {
        this.showToast(`Lỗi vi chỉnh Center: ${err.message || err}`, "error");
      } finally {
        this.isProcessing = false;
        this.updateContent();
      }
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
        await this.ensureActiveTrackSelected();
      }
      if (this.selectedUiId === null) {
        this.showToast("Vui lòng chọn xe trước!", "warning");
        return;
      }
      const forTrack = (params == null ? void 0 : params.applyToTrack) === true;
      if (this.isProcessing) return;
      await this.pushUndoSnapshot(`Ghim Đất ${forTrack ? "Toàn Track " : ""}(${mode})`, forTrack);
      this.isProcessing = true;
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
        if (this.selectedUiId !== null) {
          CVATBridge.centerCanvas3DOnTrack(this.selectedUiId, { x: this.currentX, y: this.currentY, z: this.currentZ });
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
     * Nút Riêng: Ghim toàn bộ các frame của Track hiện tại xuống mặt đất
     */
    async handleSnapGroundTrack() {
      await this.handleSnapGround("road", { applyToTrack: true });
    }
    /**
     * Căn góc xoay Yaw theo vạch kẻ làn đường 3D (LiDAR Intensity Lane Snap)
     */
    async handleSnapYawToLane() {
      if (!this.currentCtx || !this.currentCtx.jobId) {
        this.showToast("Chưa kết nối Job CVAT!", "warning");
        return;
      }
      if (this.selectedUiId === null) {
        await this.ensureActiveTrackSelected();
      }
      if (this.selectedUiId === null) {
        this.showToast("Vui lòng chọn xe trước!", "warning");
        return;
      }
      if (this.isProcessing) return;
      await this.pushUndoSnapshot("Căn Yaw Theo Làn 3D", this.applyToTrack);
      this.isProcessing = true;
      this.showToast("Đang quét vạch sơn phản quang 3D để căn Yaw...", "info");
      try {
        const serverId = this.selectedServerId || this.selectedUiId;
        const res = await CVATBridge.snapYawToLane(
          this.currentCtx.jobId,
          this.selectedUiId,
          serverId,
          !this.applyToTrack
        );
        if (res.success && res.newYawDeg !== void 0) {
          this.currentYawDeg = res.newYawDeg;
          if (this.selectedUiId !== null) {
            CVATBridge.centerCanvas3DOnTrack(this.selectedUiId, { x: this.currentX, y: this.currentY, z: this.currentZ });
          }
          this.showToast(res.message, "success");
        } else {
          this.showToast(res.message || "Không tìm thấy vạch sơn rõ nét!", "warning");
        }
      } catch (err) {
        this.showToast(`Lỗi căn Yaw theo làn: ${err.message || err}`, "error");
      } finally {
        this.isProcessing = false;
        this.updateContent();
      }
    }
    /**
     * Xử lý FIT XE: Hỗ trợ CĂN TOP, CĂN SIDE, CĂN FRONT hoặc GHÉP CHU TRÌNH HOÀN CHỈNH (TOP ➔ SIDE ➔ FRONT)
     */
    async handleEgoRayFit(step = "all") {
      if (!this.currentCtx || !this.currentCtx.jobId) {
        this.showToast("Chưa kết nối Job CVAT!", "warning");
        return;
      }
      if (this.selectedUiId === null) {
        await this.ensureActiveTrackSelected();
      }
      if (this.selectedUiId === null) {
        this.showToast("Vui lòng chọn xe trước!", "warning");
        return;
      }
      if (this.isProcessing) return;
      await this.pushUndoSnapshot("Fit Toàn Track", true);
      this.isProcessing = true;
      const stepLabel = step === "top" ? "Căn TOP (Yaw & Nóc)" : step === "side" ? "Căn SIDE (Cản X)" : step === "front" ? "Căn FRONT (Sườn Y)" : "Fit toàn diện";
      this.showToast(`Đang ${stepLabel}...`, "info");
      try {
        const serverId = this.selectedServerId || this.selectedUiId;
        const res = await CVATBridge.fitBoxToEgoRayAndGround(
          this.currentCtx.jobId,
          this.selectedUiId,
          serverId,
          this.applyToTrack,
          true,
          // BẢO TOÀN TUYỆT ĐỐI 100% KÍCH THƯỚC L, W, H THEO YÊU CẦU NGƯỜI DÙNG!
          step
        );
        if (res.success) {
          if (res.newX !== void 0) this.currentX = res.newX;
          if (res.newY !== void 0) this.currentY = res.newY;
          if (res.newZ !== void 0) this.currentZ = res.newZ;
          if (res.newYawDeg !== void 0) this.currentYawDeg = res.newYawDeg;
          const targetItem = this.frameTracks.find((t) => t.uiId === this.selectedUiId);
          if (targetItem) {
            if (res.newX !== void 0) targetItem.x = res.newX;
            if (res.newY !== void 0) targetItem.y = res.newY;
            if (res.newZ !== void 0) targetItem.z = res.newZ;
            if (res.newYawDeg !== void 0) targetItem.yawDeg = res.newYawDeg;
          }
          if (this.selectedUiId !== null) {
            CVATBridge.centerCanvas3DOnTrack(this.selectedUiId, { x: this.currentX, y: this.currentY, z: this.currentZ });
          }
          this.showToast(res.message, "success");
        } else {
          this.showToast(res.message, "error");
        }
      } catch (err) {
        this.showToast(`Lỗi ${stepLabel}: ${err.message || err}`, "error");
      } finally {
        this.isProcessing = false;
        this.updateContent();
      }
    }
    async handleFitTop() {
      if (this.selectedCategory === "cyclist") {
        await this.handleFitCyclist("top");
      } else if (this.selectedCategory === "pedestrian") {
        await this.handleFitPedestrian("top");
      } else {
        await this.handleEgoRayFit("top");
      }
    }
    async handleFitSide() {
      if (this.selectedCategory === "cyclist") {
        await this.handleFitCyclist("side");
      } else if (this.selectedCategory === "pedestrian") {
        await this.handleFitPedestrian("side");
      } else {
        await this.handleEgoRayFit("side");
      }
    }
    async handleFitFront() {
      if (this.selectedCategory === "cyclist") {
        await this.handleFitCyclist("front");
      } else if (this.selectedCategory === "pedestrian") {
        await this.handleFitPedestrian("front");
      } else {
        await this.handleEgoRayFit("front");
      }
    }
    /**
     * Fit riêng Chiều Rộng W (Phím 4):
     * Tự động điều hướng theo loại đối tượng:
     * - Pedestrian: Fit vai/ngực người
     * - Cyclist: Fit tay lái / gương xe (+5cm pad)
     * - Car: Fit riêng bề rộng W (+8cm pad)
     */
    async handleFitWidth() {
      if (this.selectedCategory === "pedestrian") {
        await this.handleFitPedestrian("w");
      } else if (this.selectedCategory === "cyclist") {
        await this.handleFitCyclist("w");
      } else {
        await this.handleFitCarDimension("w");
      }
    }
    /**
     * Fit riêng Chiều Cao H (Phím 5) - CHUẨN GROUND-LOCK:
     * Mặt đáy tiếp đất bám sàn cố định tại groundZ, chiều cao nở lên nóc xe.
     * Tự động điều hướng theo loại đối tượng:
     * - Pedestrian: Fit đỉnh đầu (+12cm đệm)
     * - Cyclist: Fit nón bảo hiểm (+12cm đệm)
     * - Car: Fit nóc xe (+5cm đệm)
     */
    async handleFitHeight() {
      if (this.selectedCategory === "pedestrian") {
        await this.handleFitPedestrian("h");
      } else if (this.selectedCategory === "cyclist") {
        await this.handleFitCyclist("h");
      } else {
        await this.handleFitCarDimension("h");
      }
    }
    /**
     * Fit riêng Chiều Rộng (W) hoặc Chiều Cao (H Ground-Lock) cho Xe Ô tô (Car) hoặc đối tượng chung
     */
    async handleFitCarDimension(dimension) {
      var _a, _b;
      if (!this.currentCtx || !this.currentCtx.jobId) {
        this.showToast("Chưa kết nối Job CVAT!", "warning");
        return;
      }
      const activeId = await this.ensureActiveTrackSelected();
      if (!activeId) {
        this.showToast("Chưa chọn đối tượng để fit kích thước!", "warning");
        return;
      }
      if (this.isProcessing) return;
      const dimLabel = dimension === "w" ? "Rộng (W) [Phím 4]" : "Cao (H) [Phím 5 - Ground-Lock]";
      await this.pushUndoSnapshot(`Fit ${dimLabel}`, this.applyToTrack);
      this.isProcessing = true;
      this.showToast(`Đang đo mây điểm & Fit ${dimLabel}...`, "info");
      try {
        const serverId = this.selectedServerId || activeId;
        const res = await CVATBridge.fitDimension(
          this.currentCtx.jobId,
          activeId,
          serverId,
          dimension,
          this.applyToTrack
        );
        if (res.success) {
          if (res.newW !== void 0) {
            this.currentW = res.newW;
            this.editW = res.newW;
          }
          if (res.newH !== void 0) {
            this.currentH = res.newH;
            this.editH = res.newH;
          }
          if (res.newX !== void 0) this.currentX = res.newX;
          if (res.newY !== void 0) this.currentY = res.newY;
          if (res.newZ !== void 0) this.currentZ = res.newZ;
          const targetItem = this.frameTracks.find((t) => t.uiId === activeId);
          if (targetItem) {
            if (res.newW !== void 0) targetItem.w = res.newW;
            if (res.newH !== void 0) targetItem.h = res.newH;
            if (res.newX !== void 0) targetItem.x = res.newX;
            if (res.newY !== void 0) targetItem.y = res.newY;
            if (res.newZ !== void 0) targetItem.z = res.newZ;
          }
          const inputW = (_a = this.container) == null ? void 0 : _a.querySelector("#input-dim-w");
          const inputH = (_b = this.container) == null ? void 0 : _b.querySelector("#input-dim-h");
          if (inputW && res.newW !== void 0) inputW.value = String(res.newW);
          if (inputH && res.newH !== void 0) inputH.value = String(res.newH);
          this.showToast(res.message, "success");
          this.scheduleUpdate();
        } else {
          this.showToast(res.message, "error");
        }
      } catch (err) {
        this.showToast(`Lỗi fit ${dimLabel}: ${err.message || String(err)}`, "error");
      } finally {
        this.isProcessing = false;
        this.updateContent();
      }
    }
    /**
     * Xử lý FIT CHUYÊN BIỆT CHO NGƯỜI ĐI BỘ (PEDESTRIAN FIT)
     * - Hỗ trợ 3 chiều độc lập (TOP - SIDE - FRONT)
     * - Hỗ trợ 3 nút Fix Size linh hoạt: Dài (L), Rộng (W), Cao (H)
     * - Hỗ trợ chu trình hoàn chỉnh toàn diện (ALL)
     * - Khóa thẳng đứng Roll = 0, Pitch = 0
     * - Quét chân siêu hẹp +15cm tránh vỉa hè
     * - Bù đỉnh đầu +12cm chống cắt ngang trán
     */
    async handleFitPedestrian(step = "all") {
      if (!this.currentCtx || !this.currentCtx.jobId) {
        this.showToast("Chưa kết nối Job CVAT!", "warning");
        return;
      }
      if (this.selectedUiId === null) {
        await this.ensureActiveTrackSelected();
      }
      if (this.selectedUiId === null) {
        this.showToast("Vui lòng chọn người trước!", "warning");
        return;
      }
      if (this.isProcessing) return;
      const stepLabel = step === "top" ? "Căn TOP (Yaw Trục người)" : step === "side" ? "Căn SIDE (Cản X đón tia, Khóa Size & Z)" : step === "front" ? "Căn FRONT (Sườn Y đón tia, Khóa Size & Z)" : step === "l" ? "Fix Dài L (Co giãn ôm thân, giữ W/H/Z)" : step === "w" ? "Fix Rộng W (Co giãn ôm vai/ngực, giữ L/H/Z)" : step === "h" ? "Fix Cao H (Bám sàn cố định, nở đỉnh đầu +12cm)" : "Fit Người Đi Bộ toàn diện";
      await this.pushUndoSnapshot(stepLabel, false);
      this.isProcessing = true;
      this.showToast(`Đang ${stepLabel}...`, "info");
      try {
        const serverId = this.selectedServerId || this.selectedUiId;
        const res = await CVATBridge.fitPedestrian(
          this.currentCtx.jobId,
          this.selectedUiId,
          serverId,
          0.12,
          step,
          this.applyToTrack
        );
        if (res.success) {
          if (res.newX !== void 0) this.currentX = res.newX;
          if (res.newY !== void 0) this.currentY = res.newY;
          if (res.newZ !== void 0) this.currentZ = res.newZ;
          if (res.newYawDeg !== void 0) this.currentYawDeg = res.newYawDeg;
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
          const inputW = this.container.querySelector("#input-dim-w");
          if (inputW && res.newW !== void 0) {
            inputW.value = String(res.newW);
          }
          const inputH = this.container.querySelector("#input-dim-h");
          if (inputH && res.newH !== void 0) {
            inputH.value = String(res.newH);
          }
          const inputL = this.container.querySelector("#input-dim-l");
          if (inputL && res.newL !== void 0) {
            inputL.value = String(res.newL);
          }
          const targetItem = this.frameTracks.find((t) => t.uiId === this.selectedUiId);
          if (targetItem) {
            if (res.newX !== void 0) targetItem.x = res.newX;
            if (res.newY !== void 0) targetItem.y = res.newY;
            if (res.newZ !== void 0) targetItem.z = res.newZ;
            if (res.newYawDeg !== void 0) targetItem.yawDeg = res.newYawDeg;
            if (res.newL !== void 0) targetItem.l = res.newL;
            if (res.newW !== void 0) targetItem.w = res.newW;
            if (res.newH !== void 0) targetItem.h = res.newH;
          }
          this.showToast(res.message, "success");
        } else {
          this.showToast(res.message, "error");
        }
      } catch (err) {
        this.showToast(`Lỗi ${stepLabel}: ${err.message || err}`, "error");
      } finally {
        this.isProcessing = false;
        this.updateContent();
      }
    }
    /**
     * Xử lý FIT CHUYÊN BIỆT CHO XE 2 BÁNH (CYCLIST / TWO-WHEELER FIT)
     * Hỗ trợ 3 chiều độc lập (TOP - SIDE - FRONT) hoặc toàn chu trình (ALL).
     * Bảo toàn 100% kích thước L cố định theo quy chuẩn.
     */
    async handleFitCyclist(step = "all") {
      if (!this.currentCtx || !this.currentCtx.jobId) {
        this.showToast("Chưa kết nối Job CVAT!", "warning");
        return;
      }
      if (this.selectedUiId === null) {
        await this.ensureActiveTrackSelected();
      }
      if (this.selectedUiId === null) {
        this.showToast("Vui lòng chọn xe trước!", "warning");
        return;
      }
      if (this.isProcessing) return;
      const stepLabel = step === "top" ? "Căn TOP (Yaw Đầu - Đuôi)" : step === "side" ? "Căn SIDE (Cản X & Sàn, Khóa L)" : step === "front" ? "Căn FRONT (Sườn Y đón tia, Giữ Size)" : step === "w" ? "Fit Rộng W (Bắt gương xe +5cm Pad)" : step === "h" ? "Fit Cao H (Bám sàn cố định, nở nóc)" : "Fit Xe 2 Bánh toàn diện";
      await this.pushUndoSnapshot(stepLabel, false);
      this.isProcessing = true;
      this.showToast(`Đang ${stepLabel}...`, "info");
      try {
        const serverId = this.selectedServerId || this.selectedUiId;
        const res = await CVATBridge.fitCyclist(
          this.currentCtx.jobId,
          this.selectedUiId,
          serverId,
          0.1,
          step,
          this.applyToTrack
        );
        if (res.success) {
          if (res.newX !== void 0) this.currentX = res.newX;
          if (res.newY !== void 0) this.currentY = res.newY;
          if (res.newZ !== void 0) this.currentZ = res.newZ;
          if (res.newYawDeg !== void 0) this.currentYawDeg = res.newYawDeg;
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
          const inputW = this.container.querySelector("#input-dim-w");
          if (inputW && res.newW !== void 0) {
            inputW.value = String(res.newW);
          }
          const inputH = this.container.querySelector("#input-dim-h");
          if (inputH && res.newH !== void 0) {
            inputH.value = String(res.newH);
          }
          const inputL = this.container.querySelector("#input-dim-l");
          if (inputL && res.newL !== void 0) {
            inputL.value = String(res.newL);
          }
          const targetItem = this.frameTracks.find((t) => t.uiId === this.selectedUiId);
          if (targetItem) {
            if (res.newX !== void 0) targetItem.x = res.newX;
            if (res.newY !== void 0) targetItem.y = res.newY;
            if (res.newZ !== void 0) targetItem.z = res.newZ;
            if (res.newYawDeg !== void 0) targetItem.yawDeg = res.newYawDeg;
            if (res.newL !== void 0) targetItem.l = res.newL;
            if (res.newW !== void 0) targetItem.w = res.newW;
            if (res.newH !== void 0) targetItem.h = res.newH;
          }
          this.showToast(res.message, "success");
        } else {
          this.showToast(res.message, "error");
        }
      } catch (err) {
        this.showToast(`Lỗi ${stepLabel}: ${err.message || err}`, "error");
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
      await this.pushUndoSnapshot("Căn Hộp Bám Điểm", false);
      this.isProcessing = true;
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
      await this.pushUndoSnapshot("Khớp Kích Thước Catalog", this.applyToTrack);
      this.isProcessing = true;
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
      await this.pushUndoSnapshot("Fit Toàn Track", true);
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
      const stateHash = [
        this.selectedUiId,
        this.currentFrameNumber,
        this.currentX,
        this.currentY,
        this.currentZ,
        this.currentYawDeg,
        this.currentL,
        this.currentW,
        this.currentH,
        this.editL,
        this.editW,
        this.editH,
        this.frameTracks.length,
        this.isDropdownOpen,
        this.searchKeyword,
        this.selectedCategory,
        this.isAdvancedOpen,
        this.applyToTrack,
        this.currentActiveView,
        this.pointColorMode,
        this.colorizeBoxedPoints
      ].join("|");
      if (stateHash === this.lastRenderedHash && this.container.children.length > 0) {
        return;
      }
      this.lastRenderedHash = stateHash;
      const jobText = this.currentCtx.jobId ? `#${this.currentCtx.jobId}` : "OFFLINE";
      let viewText = "VIEW: TOP";
      let viewBg = "#f0fdfa";
      let viewBorder = "#99f6e4";
      let viewColor = "#0f766e";
      if (this.currentActiveView === "side") {
        viewText = "VIEW: SIDE";
        viewBg = "#eff6ff";
        viewBorder = "#bfdbfe";
        viewColor = "#1d4ed8";
      } else if (this.currentActiveView === "front") {
        viewText = "VIEW: FRONT";
        viewBg = "#faf5ff";
        viewBorder = "#e9d5ff";
        viewColor = "#7e22ce";
      } else if (this.currentActiveView === "perspective") {
        viewText = "VIEW: 3D";
        viewBg = "#f8fafc";
        viewBorder = "#cbd5e1";
        viewColor = "#475569";
      }
      const filteredTracks = this.frameTracks.filter((t) => {
        if (!this.searchKeyword.trim()) return true;
        const kw = this.searchKeyword.trim().toLowerCase().replace("#", "");
        return String(t.uiId).includes(kw) || t.label.toLowerCase().includes(kw);
      });
      let dropdownItemsHtml = "";
      if (filteredTracks.length > 0) {
        dropdownItemsHtml = filteredTracks.map((t) => {
          const isSelected = t.uiId === this.selectedUiId;
          const badgeColor = t.color || "#3b82f6";
          return `
            <div class="dropdown-track-item" data-uiid="${t.uiId}" style="
              padding: 6px 10px;
              border-radius: 6px;
              background: ${isSelected ? "#ecfdf5" : "transparent"};
              border: 1px solid ${isSelected ? "#a7f3d0" : "transparent"};
              color: ${isSelected ? "#047857" : "#0f172a"};
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: space-between;
              font-family: ui-monospace, monospace;
              font-size: 11px;
              transition: background 0.12s;
            ">
              <span style="display: flex; align-items: center; gap: 8px;">
                <span style="font-weight: 700; color: ${isSelected ? "#059669" : "#64748b"}; font-size: 11px;">#${t.uiId}</span>
                <span style="
                  display: inline-flex;
                  align-items: center;
                  gap: 4px;
                  padding: 1px 6px;
                  border-radius: 4px;
                  background: ${badgeColor}18;
                  border: 1px solid ${badgeColor}40;
                  color: ${badgeColor};
                  font-weight: 600;
                  font-size: 10px;
                ">
                  <span style="width: 5px; height: 5px; border-radius: 50%; background: ${badgeColor}; display: inline-block;"></span>
                  ${t.label}
                </span>
              </span>
              <span style="font-size: 10px; color: #64748b;">
                Z: ${t.z}m • ${t.yawDeg}°
                ${isSelected ? `<span style="color: #059669; margin-left: 4px;">●</span>` : ""}
              </span>
            </div>
          `;
        }).join("");
      } else {
        dropdownItemsHtml = `
        <div style="font-size: 11px; color: #64748b; padding: 8px; text-align: center; font-style: italic;">
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
      const activePresets = this.selectedCategory === "pedestrian" ? PEDESTRIAN_PRESETS : this.selectedCategory === "cyclist" ? CYCLIST_PRESETS : CAR_PRESETS;
      if (this.selectedCategory === "pedestrian") ;
      else if (this.selectedCategory === "cyclist") ;
      let advancedContentHtml = "";
      if (this.isAdvancedOpen) {
        advancedContentHtml = `
        <div style="
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        ">
          <!-- VI CHỈNH ĐỘ CAO Z -->
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <span style="font-size: 10px; color: #64748b; font-family: ui-monospace, monospace; font-weight: 500;">Vi chỉnh Z (cm):</span>
            <div style="display: flex; gap: 4px;">
              <button class="btn-micro-z" data-delta="-5" title="Hạ 5cm" style="background: #ffffff; border: 1px solid #cbd5e1; color: #334155; font-size: 10px; font-family: monospace; padding: 4px 7px; border-radius: 5px; cursor: pointer;">-5</button>
              <button class="btn-micro-z" data-delta="-1" title="Hạ 1cm" style="background: #ffffff; border: 1px solid #cbd5e1; color: #334155; font-size: 10px; font-family: monospace; padding: 4px 7px; border-radius: 5px; cursor: pointer;">-1</button>
              <button class="btn-micro-z" data-delta="1" title="Nâng 1cm" style="background: #ffffff; border: 1px solid #a7f3d0; color: #059669; font-size: 10px; font-family: monospace; padding: 4px 7px; border-radius: 5px; cursor: pointer; font-weight: 600;">+1</button>
              <button class="btn-micro-z" data-delta="5" title="Nâng 5cm" style="background: #ffffff; border: 1px solid #a7f3d0; color: #059669; font-size: 10px; font-family: monospace; padding: 4px 7px; border-radius: 5px; cursor: pointer; font-weight: 600;">+5</button>
            </div>
          </div>

          <!-- DỐC DỌC PITCH & NGHIÊNG NGANG ROLL -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
            <div style="background: #ffffff; padding: 6px; border-radius: 6px; border: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 4px;">
              <span style="font-size: 9px; color: #0284c7; font-family: monospace; font-weight: 600; display: flex; align-items: center; gap: 4px;">
                ${ICONS.arrowUpDown}
                <span>Dốc Side (Pitch)</span>
              </span>
              <div style="display: flex; gap: 3px;">
                <button class="btn-micro-pitch" data-delta="-1" style="flex: 1; background: #f8fafc; border: 1px solid #cbd5e1; color: #334155; font-size: 9px; padding: 3px 0; border-radius: 4px; cursor: pointer;">-1°</button>
                <button class="btn-micro-pitch" data-delta="1" style="flex: 1; background: #f0f9ff; border: 1px solid #bae6fd; color: #0284c7; font-size: 9px; padding: 3px 0; border-radius: 4px; cursor: pointer; font-weight: 600;">+1°</button>
              </div>
            </div>

            <div style="background: #ffffff; padding: 6px; border-radius: 6px; border: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 4px;">
              <span style="font-size: 9px; color: #e11d48; font-family: monospace; font-weight: 600; display: flex; align-items: center; gap: 4px;">
                ${ICONS.arrowRightLeft}
                <span>Nghiêng (Roll)</span>
              </span>
              <div style="display: flex; gap: 3px;">
                <button class="btn-micro-roll" data-delta="-1" style="flex: 1; background: #f8fafc; border: 1px solid #cbd5e1; color: #334155; font-size: 9px; padding: 3px 0; border-radius: 4px; cursor: pointer;">-1°</button>
                <button class="btn-micro-roll" data-delta="1" style="flex: 1; background: #fff1f2; border: 1px solid #fecdd3; color: #e11d48; font-size: 9px; padding: 3px 0; border-radius: 4px; cursor: pointer; font-weight: 600;">+1°</button>
                <button id="btn-reset-slope" title="Đặt lại dốc phẳng 0°" style="background: #f1f5f9; border: 1px solid #cbd5e1; color: #334155; font-size: 9px; padding: 3px 6px; border-radius: 4px; cursor: pointer; font-weight: 600;">0°</button>
              </div>
            </div>
          </div>

          <!-- VI CHỈNH GÓC YAW & CĂN THEO VẠCH KẺ LÀN ĐƯỜNG 3D -->
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 9px; color: #64748b; font-family: monospace; font-weight: 500;">Xoay góc Yaw:</span>
              <button id="btn-snap-yaw-lane" title="Quét vạch sơn phản quang 3D dưới lòng đường để khóa góc Yaw thẳng theo tim đường (Phím L)" style="
                background: #f0fdf4;
                border: 1px solid #86efac;
                color: #15803d;
                font-size: 9px;
                font-weight: 600;
                padding: 2px 7px;
                border-radius: 4px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 4px;
                transition: all 0.12s;
              ">
                <span style="display: flex; align-items: center; color: #16a34a;">${ICONS.road}</span>
                <span>Căn Theo Làn (LiDAR)</span>
              </button>
            </div>
            <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 3px;">
              <button class="btn-rot" data-deg="-90" style="background: #ffffff; border: 1px solid #cbd5e1; color: #334155; font-size: 9px; font-family: monospace; padding: 4px 0; border-radius: 4px; cursor: pointer;">-90°</button>
              <button class="btn-rot" data-deg="-15" style="background: #ffffff; border: 1px solid #cbd5e1; color: #334155; font-size: 9px; font-family: monospace; padding: 4px 0; border-radius: 4px; cursor: pointer;">-15°</button>
              <button class="btn-rot" data-deg="-5" style="background: #ffffff; border: 1px solid #cbd5e1; color: #334155; font-size: 9px; font-family: monospace; padding: 4px 0; border-radius: 4px; cursor: pointer;">-5°</button>
              <button class="btn-rot" data-deg="5" style="background: #ffffff; border: 1px solid #a7f3d0; color: #059669; font-size: 9px; font-family: monospace; padding: 4px 0; border-radius: 4px; cursor: pointer; font-weight: 600;">+5°</button>
              <button class="btn-rot" data-deg="15" style="background: #ffffff; border: 1px solid #a7f3d0; color: #059669; font-size: 9px; font-family: monospace; padding: 4px 0; border-radius: 4px; cursor: pointer; font-weight: 600;">+15°</button>
              <button class="btn-rot" data-deg="90" style="background: #ffffff; border: 1px solid #a7f3d0; color: #059669; font-size: 9px; font-family: monospace; padding: 4px 0; border-radius: 4px; cursor: pointer; font-weight: 600;">+90°</button>
            </div>
          </div>

          <!-- PRESET CATALOG XE NHANH -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-top: 2px;">
            ${STANDARD_VEHICLE_CATALOG.slice(0, 4).map(
          (item) => `
              <button class="catalog-btn" data-l="${item.l}" data-w="${item.w}" data-h="${item.h}" data-name="${item.name}" style="
                background: #ffffff;
                border: 1px solid #e2e8f0;
                color: #1e293b;
                padding: 4px 6px;
                border-radius: 5px;
                font-size: 9px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: space-between;
              ">
                <span style="font-weight: 600;">${item.name}</span>
                <span style="font-size: 8px; font-family: monospace; color: #64748b;">${item.l}x${item.w}m</span>
              </button>
            `
        ).join("")}
          </div>
        </div>
      `;
      }
      this.container.innerHTML = `
      <!-- HEADER CHUẨN SHADCN (LIGHT) -->
      <div id="floating-drag-header" style="
        padding: 9px 12px;
        border-bottom: 1px solid #e2e8f0;
        background: #ffffff;
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: grab;
      ">
        <div style="display: flex; align-items: center; gap: 7px;">
          <span style="color: #94a3b8; display: flex;">${ICONS.grip}</span>
          <span style="color: #10b981; display: flex;">${ICONS.box}</span>
          <span style="font-weight: 700; font-size: 13px; letter-spacing: -0.2px; color: #09090b;">CVAT 3D Suite</span>
          <span style="
            font-size: 9px;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            background: #f1f5f9;
            color: #059669;
            padding: 2px 5px;
            border-radius: 5px;
            border: 1px solid #e2e8f0;
            font-weight: 600;
          ">${jobText}</span>
          <span id="floating-badge-view" title="Khung nhìn đang active. Giữ Shift + WASD để vi chỉnh 2cm theo màn hình (Chỉ Frame Hiện Tại)" style="
            display: inline-flex;
            align-items: center;
            gap: 3px;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 9.5px;
            font-weight: 700;
            font-family: ui-monospace, monospace;
            background: ${viewBg};
            border: 1px solid ${viewBorder};
            color: ${viewColor};
            cursor: pointer;
            transition: all 0.12s;
          ">${viewText}</span>
        </div>

        <div style="display: flex; align-items: center; gap: 3px;">
          <button id="floating-btn-undo" title="Hoàn tác thao tác vừa thực hiện (Ctrl+Z / Cmd+Z)" style="
            background: #ffffff;
            border: 1px solid #e2e8f0;
            color: #0f172a;
            cursor: pointer;
            padding: 3px 6px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 10px;
            font-weight: 600;
            box-shadow: 0 1px 2px rgba(0,0,0,0.03);
            transition: all 0.12s;
          ">
            <span style="display: flex; align-items: center;">${ICONS.undo}</span>
            <span>Pre</span>
          </button>
          <button id="floating-btn-fullscreen" title="Mở Rộng Toàn Màn Hình · Duyệt Toàn Bộ Track ID (Shift+M)" style="
            background: #eff6ff;
            border: 1px solid #bfdbfe;
            color: #2563eb;
            cursor: pointer;
            padding: 3px 6px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 10px;
            font-weight: 600;
          ">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
            <span>Full</span>
          </button>
          <button id="floating-btn-sync-frame" title="Quét lại xe frame này" style="
            background: transparent;
            border: none;
            color: #64748b;
            cursor: pointer;
            padding: 3px;
            border-radius: 4px;
            display: flex;
            align-items: center;
          ">
            ${ICONS.refresh}
          </button>
          <button id="floating-btn-help" title="Bảng tra cứu phím tắt (?)" style="
            background: transparent;
            border: none;
            color: #64748b;
            cursor: pointer;
            padding: 3px;
            border-radius: 4px;
            display: flex;
            align-items: center;
          ">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </button>
          <button id="floating-btn-minimize" title="Thu nhỏ (\`)" style="
            background: transparent;
            border: none;
            color: #64748b;
            cursor: pointer;
            padding: 3px;
            border-radius: 4px;
            display: flex;
            align-items: center;
          ">
            ${ICONS.minimize}
          </button>
        </div>
      </div>

      <!-- DẢI SUB-HEADER THỐNG KÊ TRACK ID (CỤM TIÊU ĐỀ) -->
      ${this.renderTrackStatsSubHeader()}

      <!-- MAIN CONTAINER BODY (LIGHT) -->
      <div style="
        padding: 10px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 8px;
        flex: 1;
        max-height: calc(100vh - 120px);
      ">
        <!-- KHỐI 1: CHỌN XE & THÔNG SỐ TÓM TẮT -->
        <div style="
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 8px 10px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          position: relative;
        ">
          <!-- THANH CHỌN XE & PREV/NEXT -->
          <div style="display: flex; gap: 5px; align-items: center;">
            <button id="btn-dropdown-toggle" style="
              flex: 1;
              background: #ffffff;
              border: 1px solid ${this.isDropdownOpen ? "#10b981" : "#e2e8f0"};
              color: #09090b;
              padding: 6px 10px;
              border-radius: 7px;
              font-size: 11px;
              font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
              font-weight: 600;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: space-between;
              transition: all 0.15s;
            ">
              <span style="display: flex; align-items: center; gap: 6px;">
                <span style="color: #059669; font-weight: 700;">${this.selectedUiId ? `#${this.selectedUiId}` : "#0"}</span>
                <span style="font-weight: 600; font-size: 11px; color: #09090b;">${this.selectedUiId ? this.currentLabel : "Chưa chọn đối tượng"}</span>
              </span>
              <span style="color: #64748b; font-size: 9px;">${this.isDropdownOpen ? "▲" : "▼"}</span>
            </button>

            <!-- NÚT PREV / NEXT -->
            <button id="btn-prev-frame-track" title="Đối tượng trước (Phím [)" style="
              background: #ffffff;
              border: 1px solid #e2e8f0;
              color: #334155;
              padding: 6px 8px;
              border-radius: 6px;
              cursor: pointer;
              display: flex;
              align-items: center;
            ">
              ${ICONS.chevronLeft}
            </button>
            <button id="btn-next-frame-track" title="Đối tượng kế (Phím ])" style="
              background: #ffffff;
              border: 1px solid #e2e8f0;
              color: #334155;
              padding: 6px 8px;
              border-radius: 6px;
              cursor: pointer;
              display: flex;
              align-items: center;
            ">
              ${ICONS.chevronRight}
            </button>

            <!-- NÚT GHIM TÂM KHI TUA FRAME (LOCK-ON CAMERA TRACKING) -->
            <button id="btn-toggle-auto-center" title="Tự động ghim đối tượng đang chọn ở chính giữa màn hình khi tua frame. Nhấn để Bật/Tắt." style="
              background: ${this.autoCenterOnFrame ? "#ecfdf5" : "#ffffff"};
              border: 1px solid ${this.autoCenterOnFrame ? "#a7f3d0" : "#e2e8f0"};
              color: ${this.autoCenterOnFrame ? "#047857" : "#64748b"};
              padding: 6px 8px;
              border-radius: 6px;
              cursor: pointer;
              display: flex;
              align-items: center;
              gap: 4px;
              font-size: 11px;
              font-weight: 600;
              transition: all 0.12s;
              box-shadow: ${this.autoCenterOnFrame ? "0 1px 2px rgba(16, 185, 129, 0.12)" : "none"};
              white-space: nowrap;
            ">
              <span style="display: flex; align-items: center; color: ${this.autoCenterOnFrame ? "#10b981" : "#94a3b8"};">
                ${ICONS.target}
              </span>
              <span>${this.autoCenterOnFrame ? "Ghim" : "Tự do"}</span>
            </button>
          </div>

          <!-- CỤM ĐIỀU KHIỂN MÀU MÂY ĐIỂM LIDAR (INTENSITY VS PLAIN & ĐIỂM XE BỌC) -->
          <div style="
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 6px;
            background: #f8fafc;
            padding: 4px 8px;
            border-radius: 7px;
            border: 1px solid #e2e8f0;
            font-size: 11px;
          ">
            <div style="display: flex; align-items: center; gap: 4px; font-weight: 600; color: #475569;">
              <span style="display: flex; align-items: center; color: #64748b;">${ICONS.eye}</span>
              <span>Màu Point:</span>
            </div>

            <div style="display: flex; align-items: center; gap: 4px;">
              <!-- NÚT CHUYỂN ĐỔI CHẾ ĐỘ MÀU: INTENSITY VS PLAIN -->
              <button id="btn-toggle-point-color-mode" title="Chuyển đổi giữa chế độ Độ phản xạ (Intensity - Soi vạch sơn, biển báo) và Màu phẳng không xét intensity (Plain - Rõ khối 3D)" style="
                background: ${this.pointColorMode === "intensity" ? "#eff6ff" : "#ffffff"};
                border: 1px solid ${this.pointColorMode === "intensity" ? "#93c5fd" : "#cbd5e1"};
                color: ${this.pointColorMode === "intensity" ? "#1d4ed8" : "#475569"};
                padding: 3px 7px;
                border-radius: 5px;
                cursor: pointer;
                font-size: 10px;
                font-weight: 600;
                display: flex;
                align-items: center;
                gap: 3px;
                transition: all 0.12s;
              ">
                <span>${this.pointColorMode === "intensity" ? "⚡ Intensity" : "⚪ Plain"}</span>
              </button>

              <!-- NÚT TOGGLE NHUỘM MÀU XE BỌC -->
              <button id="btn-toggle-colorize-boxed" title="Bật/Tắt nhuộm màu riêng cho các điểm LiDAR nằm trong 3D Box của xe" style="
                background: ${this.colorizeBoxedPoints ? "#ecfdf5" : "#ffffff"};
                border: 1px solid ${this.colorizeBoxedPoints ? "#a7f3d0" : "#cbd5e1"};
                color: ${this.colorizeBoxedPoints ? "#047857" : "#64748b"};
                padding: 3px 7px;
                border-radius: 5px;
                cursor: pointer;
                font-size: 10px;
                font-weight: 600;
                display: flex;
                align-items: center;
                gap: 3px;
                transition: all 0.12s;
              ">
                <span>📦 Xe bọc: ${this.colorizeBoxedPoints ? "BẬT" : "TẮT"}</span>
              </button>
            </div>
          </div>

          <!-- DROPDOWN POPOVER MENU (NẾU ĐANG MỞ) -->
          ${this.isDropdownOpen ? `
            <div id="dropdown-menu-popover" style="
              background: #ffffff;
              border: 1px solid #e2e8f0;
              border-radius: 8px;
              padding: 6px;
              box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08);
              display: flex;
              flex-direction: column;
              gap: 4px;
              max-height: 200px;
              overflow-y: auto;
              z-index: 1000;
            ">
              <!-- Ô TÌM KIẾM NHANH -->
              <input id="input-dropdown-search" type="text" placeholder="Tìm ID (#1) hoặc loại xe..." value="${this.searchKeyword}" style="
                background: #f8fafc;
                border: 1px solid #cbd5e1;
                border-radius: 6px;
                color: #09090b;
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

          <!-- PHÂN LOẠI ĐỐI TƯỢNG (CATEGORY CHIPS) -->
          <div style="
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 4px;
            background: #f1f5f9;
            padding: 3px;
            border-radius: 7px;
            border: 1px solid #e2e8f0;
          ">
            <button class="btn-category-chip" data-cat="car" style="
              background: ${this.selectedCategory === "car" ? "#ffffff" : "transparent"};
              border: 1px solid ${this.selectedCategory === "car" ? "#10b981" : "transparent"};
              color: ${this.selectedCategory === "car" ? "#059669" : "#64748b"};
              box-shadow: ${this.selectedCategory === "car" ? "0 1px 3px rgba(0,0,0,0.06)" : "none"};
              padding: 5px 6px;
              border-radius: 5px;
              font-size: 11px;
              font-weight: 600;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 5px;
              transition: all 0.12s;
            ">
              <span style="display: flex; align-items: center;">${ICONS.car}</span>
              <span>Ô tô</span>
            </button>

            <button class="btn-category-chip" data-cat="pedestrian" style="
              background: ${this.selectedCategory === "pedestrian" ? "#ffffff" : "transparent"};
              border: 1px solid ${this.selectedCategory === "pedestrian" ? "#a855f7" : "transparent"};
              color: ${this.selectedCategory === "pedestrian" ? "#7e22ce" : "#64748b"};
              box-shadow: ${this.selectedCategory === "pedestrian" ? "0 1px 3px rgba(0,0,0,0.06)" : "none"};
              padding: 5px 6px;
              border-radius: 5px;
              font-size: 11px;
              font-weight: 600;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 5px;
              transition: all 0.12s;
            ">
              <span style="display: flex; align-items: center;">${ICONS.user}</span>
              <span>Người</span>
            </button>

            <button class="btn-category-chip" data-cat="cyclist" style="
              background: ${this.selectedCategory === "cyclist" ? "#ffffff" : "transparent"};
              border: 1px solid ${this.selectedCategory === "cyclist" ? "#f59e0b" : "transparent"};
              color: ${this.selectedCategory === "cyclist" ? "#d97706" : "#64748b"};
              box-shadow: ${this.selectedCategory === "cyclist" ? "0 1px 3px rgba(0,0,0,0.06)" : "none"};
              padding: 5px 6px;
              border-radius: 5px;
              font-size: 11px;
              font-weight: 600;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 5px;
              transition: all 0.12s;
            ">
              <span style="display: flex; align-items: center;">${ICONS.bicycle}</span>
              <span>Xe 2 bánh</span>
            </button>
          </div>

          <!-- THÔNG SỐ TÓM TẮT X, Y, Z, YAW -->
          <div style="
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 4px;
            font-size: 10px;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            background: #f8fafc;
            padding: 4px 6px;
            border-radius: 6px;
            border: 1px solid #e2e8f0;
            color: #475569;
            text-align: center;
          ">
            <div><span style="color: #64748b;">X:</span> ${this.currentX}</div>
            <div><span style="color: #64748b;">Y:</span> ${this.currentY}</div>
            <div><span style="color: #64748b;">Z:</span> ${this.currentZ}</div>
            <div><span style="color: #64748b;">Yaw:</span> <span style="color: #059669; font-weight: bold;">${this.currentYawDeg}°</span></div>
          </div>
        </div>

        <!-- KHỐI 2: ĐIỀU KHIỂN CĂN CHỈNH 2D/3D & THAO TÁC NHANH -->
        <div style="
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 8px 10px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        ">
          ${this.selectedCategory === "car" ? `
            <!-- THANH 3 NÚT FIT ĐỘC LẬP THEO 3 CHIỀU (TOP - SIDE - FRONT) -->
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 5px;">
              <!-- 1. FIT TOP -->
              <button id="btn-fit-top" title="Căn góc xoay Yaw quanh tâm xe & Auto Ghim Đất (Phím 1 hoặc T)" style="
                background: #f0fdfa;
                border: 1px solid #99f6e4;
                color: #0f766e;
                padding: 7px 5px;
                border-radius: 8px;
                cursor: pointer;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 2px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.04);
                transition: all 0.12s;
              ">
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                  <span style="font-size: 11px; font-weight: 700; letter-spacing: -0.2px; display: flex; align-items: center; gap: 3px;">
                    ${ICONS.arrowUp}
                    <span>TOP</span>
                  </span>
                  <kbd style="font-size: 8.5px; font-family: monospace; background: #ffffff; padding: 1px 4px; border-radius: 3px; border: 1px solid #ccfbf1; color: #0f766e;">1</kbd>
                </div>
                <span style="font-size: 9px; opacity: 0.9; text-align: center; white-space: nowrap;">Thẳng Yaw</span>
              </button>

              <!-- 2. FIT SIDE -->
              <button id="btn-fit-side" title="Căn cản trước/sau theo trục dọc X & Auto Ghim Đất (Phím 2 hoặc S)" style="
                background: #eff6ff;
                border: 1px solid #bfdbfe;
                color: #1d4ed8;
                padding: 7px 5px;
                border-radius: 8px;
                cursor: pointer;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 2px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.04);
                transition: all 0.12s;
              ">
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                  <span style="font-size: 11px; font-weight: 700; letter-spacing: -0.2px; display: flex; align-items: center; gap: 3px;">
                    ${ICONS.arrowRightLeft}
                    <span>SIDE</span>
                  </span>
                  <kbd style="font-size: 8.5px; font-family: monospace; background: #ffffff; padding: 1px 4px; border-radius: 3px; border: 1px solid #dbeafe; color: #1d4ed8;">2</kbd>
                </div>
                <span style="font-size: 9px; opacity: 0.9; text-align: center; white-space: nowrap;">Cản đón tia X</span>
              </button>

              <!-- 3. FIT FRONT -->
              <button id="btn-fit-front" title="Căn mép sườn xe ăn khít phương W (Giữ nguyên cao độ Z, không ghim đất) (Phím 3 hoặc W)" style="
                background: #faf5ff;
                border: 1px solid #e9d5ff;
                color: #7e22ce;
                padding: 7px 5px;
                border-radius: 8px;
                cursor: pointer;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 2px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.04);
                transition: all 0.12s;
              ">
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                  <span style="font-size: 11px; font-weight: 700; letter-spacing: -0.2px; display: flex; align-items: center; gap: 3px;">
                    ${ICONS.arrowUpDown}
                    <span>FRONT</span>
                  </span>
                  <kbd style="font-size: 8.5px; font-family: monospace; background: #ffffff; padding: 1px 4px; border-radius: 3px; border: 1px solid #f3e8ff; color: #7e22ce;">3</kbd>
                </div>
                <span style="font-size: 9px; opacity: 0.9; text-align: center; white-space: nowrap;">Sườn xe W</span>
              </button>
            </div>

            <!-- THANH 2 NÚT TÁCH BIỆT CHO CAR: FIT RỘNG (W) & FIT CAO (H GROUND-LOCK) -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px;">
              <!-- 1. NÚT FIT RỘNG W -->
              <button id="btn-fit-car-w" title="Tự động đo mây điểm và fit riêng chiều rộng W (bám khít 2 sườn xe +8cm đệm), giữ nguyên L, H và Z (Phím 4)" style="
                background: #faf5ff;
                border: 1px solid #d8b4fe;
                color: #7e22ce;
                padding: 6px 8px;
                border-radius: 7px;
                font-size: 10px;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 2px;
                transition: all 0.12s;
                box-shadow: 0 1px 2px rgba(0,0,0,0.03);
              ">
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                  <span style="display: flex; align-items: center; gap: 4px; font-weight: 700;">
                    ${ICONS.sparkles}
                    <span>Fit Rộng (W)</span>
                  </span>
                  <kbd style="font-size: 8.5px; font-family: monospace; background: #ffffff; padding: 1px 4px; border-radius: 3px; border: 1px solid #e9d5ff; color: #7e22ce;">4</kbd>
                </div>
                <span style="font-size: 8.5px; opacity: 0.85;">+8cm đệm vỏ</span>
              </button>

              <!-- 2. NÚT FIT CAO H -->
              <button id="btn-fit-car-h" title="Tự động đo mây điểm nóc xe và fit riêng chiều cao H (Mặt đáy tiếp đất bám sàn cố định tại groundZ, nở lên nóc xe +5cm), giữ nguyên L, W và XY (Phím 5)" style="
                background: #fff7ed;
                border: 1px solid #fdba74;
                color: #c2410c;
                padding: 6px 8px;
                border-radius: 7px;
                font-size: 10px;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 2px;
                transition: all 0.12s;
                box-shadow: 0 1px 2px rgba(0,0,0,0.03);
              ">
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                  <span style="display: flex; align-items: center; gap: 4px; font-weight: 700;">
                    ${ICONS.arrowUpDown}
                    <span>Fit Cao (H)</span>
                  </span>
                  <kbd style="font-size: 8.5px; font-family: monospace; background: #ffffff; padding: 1px 4px; border-radius: 3px; border: 1px solid #fed7aa; color: #c2410c;">5</kbd>
                </div>
                <span style="font-size: 8.5px; opacity: 0.85;">Ground-Lock nở nóc</span>
              </button>
            </div>
          ` : this.selectedCategory === "cyclist" ? `
            <!-- THANH 3 NÚT FIT ĐỘC LẬP CHO XE 2 BÁNH (TOP - SIDE - FRONT) -->
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 5px;">
              <!-- 1. FIT TOP XE 2 BÁNH -->
              <button id="btn-fit-top" title="Căn Yaw theo trục dài nối Cực Đuôi -> Cực Đầu (Bánh sau - Bánh trước), khóa tâm X/Y/Z và kích thước (Phím 1 hoặc T)" style="
                background: #fffbeb;
                border: 1px solid #fcd34d;
                color: #b45309;
                padding: 7px 5px;
                border-radius: 8px;
                cursor: pointer;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 2px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.04);
                transition: all 0.12s;
              ">
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                  <span style="font-size: 11px; font-weight: 700; letter-spacing: -0.2px; display: flex; align-items: center; gap: 3px;">
                    ${ICONS.arrowUp}
                    <span>TOP</span>
                  </span>
                  <kbd style="font-size: 8.5px; font-family: monospace; background: #ffffff; padding: 1px 4px; border-radius: 3px; border: 1px solid #fde68a; color: #b45309;">1</kbd>
                </div>
                <span style="font-size: 9px; opacity: 0.9; text-align: center; white-space: nowrap;">Trục đầu-đuôi</span>
              </button>

              <!-- 2. FIT SIDE XE 2 BÁNH -->
              <button id="btn-fit-side" title="Căn cản trước/sau đón tia theo trục dọc X & Ghim đất đáy xe. KHÓA 100% CHIỀU DÀI L (Phím 2 hoặc S)" style="
                background: #fef3c7;
                border: 1px solid #f59e0b;
                color: #92400e;
                padding: 7px 5px;
                border-radius: 8px;
                cursor: pointer;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 2px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.04);
                transition: all 0.12s;
              ">
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                  <span style="font-size: 11px; font-weight: 700; letter-spacing: -0.2px; display: flex; align-items: center; gap: 3px;">
                    ${ICONS.arrowRightLeft}
                    <span>SIDE</span>
                  </span>
                  <kbd style="font-size: 8.5px; font-family: monospace; background: #ffffff; padding: 1px 4px; border-radius: 3px; border: 1px solid #fcd34d; color: #92400e;">2</kbd>
                </div>
                <span style="font-size: 9px; opacity: 0.9; text-align: center; white-space: nowrap;">Cản đón tia (Khóa L)</span>
              </button>

              <!-- 3. FIT FRONT XE 2 BÁNH (CHUẨN THEO CAR, GIỮ NGUYÊN CAO ĐỘ Z & KÍCH THƯỚC) -->
              <button id="btn-fit-front" title="Căn sườn xe ăn khít phương W theo mép đón tia (Giữ nguyên cao độ Z & kích thước L, W, H) (Phím 3 hoặc W)" style="
                background: #faf5ff;
                border: 1px solid #e9d5ff;
                color: #7e22ce;
                padding: 7px 5px;
                border-radius: 8px;
                cursor: pointer;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 2px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.04);
                transition: all 0.12s;
              ">
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                  <span style="font-size: 11px; font-weight: 700; letter-spacing: -0.2px; display: flex; align-items: center; gap: 3px;">
                    ${ICONS.arrowUpDown}
                    <span>FRONT</span>
                  </span>
                  <kbd style="font-size: 8.5px; font-family: monospace; background: #ffffff; padding: 1px 4px; border-radius: 3px; border: 1px solid #f3e8ff; color: #7e22ce;">3</kbd>
                </div>
                <span style="font-size: 9px; opacity: 0.9; text-align: center; white-space: nowrap;">Sườn xe W (Giữ Size)</span>
              </button>
            </div>

            <!-- THANH 2 NÚT TÁCH BIỆT: FIT RỘNG (W) & FIT CAO (H) CHO XE 2 BÁNH -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px;">
              <!-- 1. NÚT FIT RỘNG W -->
              <button id="btn-fit-cyclist-w" title="Tự động đo mây điểm và fit riêng chiều rộng W (bắt trọn gương chiếu hậu, tay lái, đệm +5cm mỗi bên), giữ nguyên L, H và Z (Phím 4)" style="
                background: #fffbeb;
                border: 1px solid #fcd34d;
                color: #b45309;
                padding: 6px 8px;
                border-radius: 7px;
                font-size: 10px;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 4px;
                transition: all 0.12s;
                box-shadow: 0 1px 2px rgba(0,0,0,0.03);
              ">
                <span style="display: flex; align-items: center; gap: 4px;">
                  <span style="display: flex; align-items: center; color: #d97706;">${ICONS.sparkles}</span>
                  <span>Fit Rộng (W)</span>
                </span>
                <kbd style="font-size: 8.5px; font-family: monospace; background: #ffffff; padding: 1px 4px; border-radius: 3px; border: 1px solid #fde68a; color: #b45309;">4</kbd>
              </button>

              <!-- 2. NÚT FIT CAO H -->
              <button id="btn-fit-cyclist-h" title="Tự động đo đỉnh nón bảo hiểm và fit riêng chiều cao H (Mặt đáy tiếp đất giữ nguyên cố định 100%, nở lên nóc +12cm), giữ nguyên L, W và XY (Phím 5)" style="
                background: #fff7ed;
                border: 1px solid #fdba74;
                color: #c2410c;
                padding: 6px 8px;
                border-radius: 7px;
                font-size: 10px;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 4px;
                transition: all 0.12s;
                box-shadow: 0 1px 2px rgba(0,0,0,0.03);
              ">
                <span style="display: flex; align-items: center; gap: 4px;">
                  <span style="display: flex; align-items: center; color: #ea580c;">${ICONS.arrowUpDown}</span>
                  <span>Fit Cao (H)</span>
                </span>
                <kbd style="font-size: 8.5px; font-family: monospace; background: #ffffff; padding: 1px 4px; border-radius: 3px; border: 1px solid #fed7aa; color: #c2410c;">5</kbd>
              </button>
            </div>

            <!-- NÚT FIT TOÀN DIỆN CHO XE 2 BÁNH (1-CHẠM CHU TRÌNH HOÀN CHỈNH) -->
            <button id="btn-fit-cyclist-all" title="Chạy chu trình fit hoàn chỉnh Xe 2 bánh: TOP ➔ SIDE ➔ FRONT (Khóa cứng L)" style="
              width: 100%;
              background: #fffbeb;
              border: 1px dashed #f59e0b;
              color: #b45309;
              padding: 4px 8px;
              border-radius: 6px;
              font-size: 10px;
              font-weight: 600;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: space-between;
              transition: all 0.12s;
            ">
              <span style="display: flex; align-items: center; gap: 5px;">
                ${ICONS.bicycle}
                <span>Fit Toàn Diện Xe 2 Bánh (TOP ➔ SIDE ➔ FRONT)</span>
              </span>
              <kbd style="font-size: 8.5px; font-family: monospace; background: #ffffff; border: 1px solid #fde68a; padding: 1px 4px; border-radius: 3px;">Shift+C</kbd>
            </button>
          ` : `
            <!-- THANH 3 NÚT FIT ĐỘC LẬP CHO NGƯỜI ĐI BỘ (TOP - SIDE - FRONT) -->
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 5px;">
              <!-- 1. FIT TOP NGƯỜI -->
              <button id="btn-fit-top" title="Căn góc xoay Yaw theo trục cơ thể người, khóa tâm X/Y/Z và kích thước (Phím 1 hoặc T)" style="
                background: #faf5ff;
                border: 1px solid #d8b4fe;
                color: #7e22ce;
                padding: 7px 5px;
                border-radius: 8px;
                cursor: pointer;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 2px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.04);
                transition: all 0.12s;
              ">
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                  <span style="font-size: 11px; font-weight: 700; letter-spacing: -0.2px; display: flex; align-items: center; gap: 3px;">
                    ${ICONS.arrowUp}
                    <span>TOP</span>
                  </span>
                  <kbd style="font-size: 8.5px; font-family: monospace; background: #ffffff; padding: 1px 4px; border-radius: 3px; border: 1px solid #f3e8ff; color: #7e22ce;">1</kbd>
                </div>
                <span style="font-size: 9px; opacity: 0.9; text-align: center; white-space: nowrap;">Trục thân người</span>
              </button>

              <!-- 2. FIT SIDE NGƯỜI -->
              <button id="btn-fit-side" title="Căn mép trước/sau đón tia theo trục dọc X (Giữ nguyên Z và kích thước L, W, H) (Phím 2 hoặc S)" style="
                background: #fdf4ff;
                border: 1px solid #f0abfc;
                color: #a21caf;
                padding: 7px 5px;
                border-radius: 8px;
                cursor: pointer;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 2px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.04);
                transition: all 0.12s;
              ">
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                  <span style="font-size: 11px; font-weight: 700; letter-spacing: -0.2px; display: flex; align-items: center; gap: 3px;">
                    ${ICONS.arrowRightLeft}
                    <span>SIDE</span>
                  </span>
                  <kbd style="font-size: 8.5px; font-family: monospace; background: #ffffff; padding: 1px 4px; border-radius: 3px; border: 1px solid #fae8ff; color: #a21caf;">2</kbd>
                </div>
                <span style="font-size: 9px; opacity: 0.9; text-align: center; white-space: nowrap;">Cản đón tia X</span>
              </button>

              <!-- 3. FIT FRONT NGƯỜI -->
              <button id="btn-fit-front" title="Căn sườn trái/phải đón tia theo trục ngang Y (Giữ nguyên Z và kích thước L, W, H) (Phím 3 hoặc W)" style="
                background: #f5f3ff;
                border: 1px solid #c4b5fd;
                color: #6d28d9;
                padding: 7px 5px;
                border-radius: 8px;
                cursor: pointer;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 2px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.04);
                transition: all 0.12s;
              ">
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                  <span style="font-size: 11px; font-weight: 700; letter-spacing: -0.2px; display: flex; align-items: center; gap: 3px;">
                    ${ICONS.arrowUpDown}
                    <span>FRONT</span>
                  </span>
                  <kbd style="font-size: 8.5px; font-family: monospace; background: #ffffff; padding: 1px 4px; border-radius: 3px; border: 1px solid #ede9fe; color: #6d28d9;">3</kbd>
                </div>
                <span style="font-size: 9px; opacity: 0.9; text-align: center; white-space: nowrap;">Sườn đón tia Y</span>
              </button>
            </div>

            <!-- THANH 3 NÚT TÁCH BIỆT: FIX DÀI (L) - FIX RỘNG (W) - FIX CAO (H) CHO NGƯỜI ĐI BỘ -->
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px;">
              <!-- 1. NÚT FIX DÀI L -->
              <button id="btn-fit-ped-l" title="Tự động đo và co giãn riêng Chiều Dài L ôm thân người (giữ nguyên W, H & Z)" style="
                background: #fdf4ff;
                border: 1px solid #f0abfc;
                color: #a21caf;
                padding: 6px 4px;
                border-radius: 7px;
                font-size: 9.5px;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 3px;
                transition: all 0.12s;
                box-shadow: 0 1px 2px rgba(0,0,0,0.03);
              ">
                <span style="display: flex; align-items: center; color: #c026d3;">${ICONS.arrowRightLeft}</span>
                <span>Fit Dài (L)</span>
              </button>

              <!-- 2. NÚT FIX RỘNG W -->
              <button id="btn-fit-ped-w" title="Tự động đo và co giãn riêng Chiều Rộng W ôm vai/ngực (giữ nguyên L, H & Z) (Phím 4)" style="
                background: #faf5ff;
                border: 1px solid #d8b4fe;
                color: #7e22ce;
                padding: 6px 4px;
                border-radius: 7px;
                font-size: 9.5px;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 2px;
                transition: all 0.12s;
                box-shadow: 0 1px 2px rgba(0,0,0,0.03);
              ">
                <span style="display: flex; align-items: center; gap: 2px;">
                  <span style="display: flex; align-items: center; color: #9333ea;">${ICONS.sparkles}</span>
                  <span>Fit Rộng</span>
                </span>
                <kbd style="font-size: 8px; font-family: monospace; background: #ffffff; padding: 1px 3px; border-radius: 3px; border: 1px solid #e9d5ff; color: #7e22ce;">4</kbd>
              </button>

              <!-- 3. NÚT FIX CAO H -->
              <button id="btn-fit-ped-h" title="Tự động đo đỉnh đầu và fit riêng Chiều Cao H (Đáy tiếp đất giữ nguyên cố định, đỉnh đầu nở lên +12cm), giữ nguyên L, W và XY (Phím 5)" style="
                background: #fff7ed;
                border: 1px solid #fdba74;
                color: #c2410c;
                padding: 6px 4px;
                border-radius: 7px;
                font-size: 9.5px;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 2px;
                transition: all 0.12s;
                box-shadow: 0 1px 2px rgba(0,0,0,0.03);
              ">
                <span style="display: flex; align-items: center; gap: 2px;">
                  <span style="display: flex; align-items: center; color: #ea580c;">${ICONS.arrowUpDown}</span>
                  <span>Fit Cao</span>
                </span>
                <kbd style="font-size: 8px; font-family: monospace; background: #ffffff; padding: 1px 3px; border-radius: 3px; border: 1px solid #fed7aa; color: #c2410c;">5</kbd>
              </button>
                <span style="display: flex; align-items: center; color: #ea580c;">${ICONS.arrowUpDown}</span>
                <span>Fit Cao (H)</span>
              </button>
            </div>

            <!-- NÚT FIT TOÀN DIỆN CHO NGƯỜI ĐI BỘ (1-CHẠM CHU TRÌNH HOÀN CHỈNH) -->
            <button id="btn-fit-ped-all" title="Fit Người Đi Bộ toàn diện: Khóa đứng 0° • Bù đỉnh đầu +12cm • Co giãn dáng người (Phím P)" style="
              width: 100%;
              background: linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%);
              border: 1px dashed #c084fc;
              color: #6b21a8;
              padding: 5px 8px;
              border-radius: 6px;
              font-size: 10px;
              font-weight: 600;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: space-between;
              transition: all 0.12s;
            ">
              <span style="display: flex; align-items: center; gap: 5px;">
                ${ICONS.user}
                <span>Fit Toàn Diện Người Đi Bộ (ALL)</span>
              </span>
              <kbd style="font-size: 8.5px; font-family: monospace; background: #ffffff; border: 1px solid #e9d5ff; padding: 1px 5px; border-radius: 3px; color: #6b21a8;">P</kbd>
            </button>
          `}

          <!-- THAO TÁC 1-CHẠM THƯỜNG DÙNG: GHIM ĐẤT (G) & LẬT ĐẦU 180° (F) -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px;">
            <!-- GHIM MẶT ĐẤT -->
            <button id="btn-quick-ground" title="Tự động nhận diện mặt đường, vỉa hè & gác lề. Chưa đủ điểm tự fit theo Ego (Phím G)" style="
              background: #f0fdf4;
              border: 1px solid #bbf7d0;
              color: #15803d;
              padding: 6px 10px;
              border-radius: 7px;
              font-size: 11px;
              font-weight: 600;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: space-between;
              transition: all 0.12s;
              box-shadow: 0 1px 2px rgba(0,0,0,0.03);
            ">
              <span style="display: flex; align-items: center; gap: 5px;">
                <span style="display: flex; align-items: center; color: #16a34a;">${ICONS.road}</span>
                <span>Ghim Đất</span>
              </span>
              <kbd style="font-size: 9px; font-family: monospace; background: #dcfce7; border: 1px solid #bbf7d0; padding: 1px 4px; border-radius: 3px; color: #15803d;">G</kbd>
            </button>

            <!-- LẬT ĐẦU 180° -->
            <button id="btn-quick-flip" title="Lật ngược đầu xe 180° tức thì (Phím F)" style="
              background: #ffffff;
              border: 1px solid #e2e8f0;
              color: #0f172a;
              padding: 6px 10px;
              border-radius: 7px;
              font-size: 11px;
              font-weight: 600;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: space-between;
              transition: all 0.12s;
              box-shadow: 0 1px 2px rgba(0,0,0,0.03);
            ">
              <span style="display: flex; align-items: center; gap: 5px;">
                <span style="display: flex; align-items: center; color: #64748b;">${ICONS.flip}</span>
                <span>Lật Đầu 180°</span>
              </span>
              <kbd style="font-size: 9px; font-family: monospace; background: #f1f5f9; border: 1px solid #e2e8f0; padding: 1px 4px; border-radius: 3px; color: #64748b;">F</kbd>
            </button>
          </div>

          <!-- NÚT RIÊNG: GHIM ĐẤT TOÀN TRACK -->
          <div style="margin-top: 5px;">
            <button id="btn-snap-ground-track" title="Tự động ghim đất & vỉa hè cho TẤT CẢ các frame theo Track ID #${this.selectedUiId !== null ? this.selectedUiId : "N/A"} (Phím Shift+G)" style="
              width: 100%;
              background: #f0fdf4;
              border: 1px solid #86efac;
              color: #15803d;
              padding: 6px 10px;
              border-radius: 7px;
              font-size: 11px;
              font-weight: 600;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: space-between;
              transition: all 0.12s;
              box-shadow: 0 1px 2px rgba(0,0,0,0.03);
            ">
              <span style="display: flex; align-items: center; gap: 5px;">
                <span style="display: flex; align-items: center; color: #16a34a;">${ICONS.road}</span>
                <span>Ghim Đất Toàn Track</span>
              </span>
              <span style="display: flex; align-items: center; gap: 4px;">
                <span style="font-size: 9px; background: #dcfce7; color: #15803d; padding: 1px 6px; border-radius: 4px; font-weight: 700; border: 1px solid #bbf7d0;">All Track</span>
              </span>
            </button>
          </div>
        </div>

        <!-- KHỐI 3: BỘ ĐIỀU CHỈNH KÍCH THƯỚC & CENTER (COMPACT STEPPER - LIGHT) -->
        <div style="
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 8px 10px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        ">
          <!-- HEADER & TOGGLE PHẠM VI -->
          <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 4px; border-bottom: 1px solid #f1f5f9;">
            <span style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase;">Kích thước hộp & Center:</span>
            <div id="btn-toggle-scope" style="
              background: #f1f5f9;
              border: 1px solid #e2e8f0;
              border-radius: 5px;
              display: flex;
              padding: 2px;
              cursor: pointer;
              font-size: 9.5px;
              font-family: ui-monospace, monospace;
            ">
              <span style="
                padding: 2px 7px;
                border-radius: 4px;
                background: ${!this.applyToTrack ? "#ffffff" : "transparent"};
                color: ${!this.applyToTrack ? "#059669" : "#64748b"};
                font-weight: ${!this.applyToTrack ? "600" : "normal"};
                box-shadow: ${!this.applyToTrack ? "0 1px 2px rgba(0,0,0,0.06)" : "none"};
              ">Frame Này</span>
              <span style="
                padding: 2px 7px;
                border-radius: 4px;
                background: ${this.applyToTrack ? "#fee2e2" : "transparent"};
                color: ${this.applyToTrack ? "#dc2626" : "#64748b"};
                font-weight: ${this.applyToTrack ? "600" : "normal"};
                box-shadow: ${this.applyToTrack ? "0 1px 2px rgba(0,0,0,0.06)" : "none"};
              ">Toàn Track</span>
            </div>
          </div>

          <!-- NÚT FIT BOX HIỆN TẠI VỚI PADDING 5CM (BÁM SÀN CỐ ĐỊNH) -->
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 5px;">
            <button id="btn-fit-current-box" title="Fit kích thước L, W, H theo mây điểm tại frame này (Padding +5cm mỗi bên, ghim sàn giữ cố định đáy, chỉ nở lên nóc). ${this.applyToTrack ? "Áp dụng Toàn Track" : "Chỉ Frame Này"}" style="
              width: 100%;
              background: #f0fdf4;
              border: 1px solid #86efac;
              color: #15803d;
              padding: 6px 10px;
              border-radius: 7px;
              font-size: 11px;
              font-weight: 600;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: space-between;
              transition: all 0.12s;
              box-shadow: 0 1px 2px rgba(0,0,0,0.03);
            ">
              <span style="display: flex; align-items: center; gap: 6px;">
                <span style="display: flex; align-items: center; color: #16a34a;">${ICONS.sparkles}</span>
                <span>Fit Box Hiện Tại (+5cm Pad)</span>
              </span>
              <span style="font-size: 9px; font-family: monospace; background: #dcfce7; border: 1px solid #bbf7d0; padding: 1px 5px; border-radius: 4px; color: #15803d; font-weight: 700;">
                +5cm Pad
              </span>
            </button>
          </div>

          <!-- GỢI Ý MẪU KÍCH THƯỚC CHUẨN (1-CLICK ÁP DỤNG) -->
          <div style="display: flex; flex-direction: column; gap: 4px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 7px; padding: 5px 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 9.5px; font-weight: 600; color: #475569;">
                Mẫu ${this.selectedCategory === "pedestrian" ? "Người đi bộ" : this.selectedCategory === "cyclist" ? "Xe 2 bánh" : "Ô tô"} chuẩn:
              </span>
              <span style="font-size: 8.5px; color: #94a3b8; font-family: monospace;">1-Click áp dụng</span>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 4px; max-height: 80px; overflow-y: auto; padding-right: 2px;">
              ${activePresets.map(
        (preset, pIdx) => `
                <button class="btn-preset-chip" data-idx="${pIdx}" title="${preset.name} - ${preset.description || ""} (${preset.l} x ${preset.w} x ${preset.h}m)" style="
                  background: #ffffff;
                  border: 1px solid #cbd5e1;
                  color: #334155;
                  padding: 2px 6px;
                  border-radius: 4px;
                  font-size: 9px;
                  cursor: pointer;
                  display: flex;
                  align-items: center;
                  gap: 3px;
                  transition: all 0.12s;
                  white-space: nowrap;
                ">
                  <span style="font-weight: 600;">${preset.name}</span>
                  <span style="font-size: 8px; font-family: monospace; color: #64748b;">${preset.l}x${preset.w}x${preset.h}</span>
                </button>
              `
      ).join("")}
            </div>
          </div>

          <!-- CẶP NÚT ẨN / HIỆN TOÀN TRACK -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
            <!-- NÚT ẨN TOÀN TRACK (OUTSIDE) -->
            <button id="btn-outside-entire-track" title="Đánh dấu Outside (ẩn) cho toàn bộ frame của Track này (Shift+O)" style="
              width: 100%;
              background: #fff1f2;
              border: 1px solid #fecdd3;
              color: #e11d48;
              padding: 5px 8px;
              border-radius: 6px;
              font-size: 10px;
              font-weight: 600;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: space-between;
              transition: all 0.12s;
              box-shadow: 0 1px 2px rgba(0,0,0,0.02);
            ">
              <span style="display: flex; align-items: center; gap: 4px;">
                <span style="display: flex; align-items: center;">${ICONS.eyeOff}</span>
                <span>Ẩn Toàn Track</span>
              </span>
              <kbd style="font-size: 8.5px; font-family: monospace; background: #ffffff; border: 1px solid #fecdd3; padding: 1px 4px; border-radius: 3px; color: #e11d48;">⇧O</kbd>
            </button>

            <!-- NÚT HIỆN TOÀN TRACK (INSIDE) -->
            <button id="btn-inside-entire-track" title="Đánh dấu Inside (hiện lại) cho toàn bộ frame của Track này (Shift+I)" style="
              width: 100%;
              background: #ecfdf5;
              border: 1px solid #a7f3d0;
              color: #059669;
              padding: 5px 8px;
              border-radius: 6px;
              font-size: 10px;
              font-weight: 600;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: space-between;
              transition: all 0.12s;
              box-shadow: 0 1px 2px rgba(0,0,0,0.02);
            ">
              <span style="display: flex; align-items: center; gap: 4px;">
                <span style="display: flex; align-items: center;">${ICONS.eye}</span>
                <span>Hiện Toàn Track</span>
              </span>
              <kbd style="font-size: 8.5px; font-family: monospace; background: #ffffff; border: 1px solid #a7f3d0; padding: 1px 4px; border-radius: 3px; color: #059669;">⇧I</kbd>
            </button>
          </div>

          <!-- 3 STEPPER: DÀI (L) [2D Side], RỘNG (W) [2D Front], CAO (H) [Đáy Ghim Sàn] -->
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 5px;">
            <!-- Chiều Dài L -->
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <span style="font-size: 9px; color: ${this.selectedCategory === "cyclist" ? "#b45309" : "#64748b"}; font-family: monospace; font-weight: ${this.selectedCategory === "cyclist" ? "700" : "500"};">
                ${this.selectedCategory === "cyclist" ? "Dài (L) [🔒 Khóa]:" : "Dài (L) [Side]:"}
              </span>
              <div style="display: flex; align-items: center; background: #f8fafc; border: 1px solid ${this.selectedCategory === "cyclist" ? "#fcd34d" : "#cbd5e1"}; border-radius: 6px;">
                <button class="btn-step" data-axis="l" data-delta="-0.05" style="border: none; background: transparent; color: #475569; padding: 3px 5px; cursor: pointer; font-weight: bold;">-</button>
                <input id="input-dim-l" type="number" step="0.05" value="${this.editL || this.currentL}" style="width: 100%; border: none; background: transparent; color: ${this.selectedCategory === "cyclist" ? "#b45309" : "#0284c7"}; font-size: 11px; font-weight: bold; text-align: center; outline: none; font-family: monospace;" />
                <button class="btn-step" data-axis="l" data-delta="0.05" style="border: none; background: transparent; color: #475569; padding: 3px 5px; cursor: pointer; font-weight: bold;">+</button>
              </div>
            </div>

            <!-- Chiều Rộng W -->
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <span style="font-size: 9px; color: #64748b; font-family: monospace; font-weight: 500;">Rộng (W) [Front]:</span>
              <div style="display: flex; align-items: center; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px;">
                <button class="btn-step" data-axis="w" data-delta="-0.05" style="border: none; background: transparent; color: #475569; padding: 3px 5px; cursor: pointer; font-weight: bold;">-</button>
                <input id="input-dim-w" type="number" step="0.05" value="${this.editW || this.currentW}" style="width: 100%; border: none; background: transparent; color: #0284c7; font-size: 11px; font-weight: bold; text-align: center; outline: none; font-family: monospace;" />
                <button class="btn-step" data-axis="w" data-delta="0.05" style="border: none; background: transparent; color: #475569; padding: 3px 5px; cursor: pointer; font-weight: bold;">+</button>
              </div>
            </div>

            <!-- Chiều Cao H -->
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <span style="font-size: 9px; color: #64748b; font-family: monospace; font-weight: 500;">Cao (H) [Fit Lên]:</span>
              <div style="display: flex; align-items: center; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px;">
                <button class="btn-step" data-axis="h" data-delta="-0.05" style="border: none; background: transparent; color: #475569; padding: 3px 5px; cursor: pointer; font-weight: bold;">-</button>
                <input id="input-dim-h" type="number" step="0.05" value="${this.editH || this.currentH}" style="width: 100%; border: none; background: transparent; color: #0284c7; font-size: 11px; font-weight: bold; text-align: center; outline: none; font-family: monospace;" />
                <button class="btn-step" data-axis="h" data-delta="0.05" style="border: none; background: transparent; color: #475569; padding: 3px 5px; cursor: pointer; font-weight: bold;">+</button>
              </div>
            </div>
          </div>

          <!-- BỘ VI CHỈNH CENTER 2D DÀN ĐỀU (TIẾN/LÙI DỌC X & TRÁI/PHẢI NGANG Y) -->
          <div style="
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 5px 7px;
            display: flex;
            flex-direction: column;
            gap: 4px;
          ">
            <!-- Trục Dọc X (Tiến / Lùi - Side View) -->
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 9px; font-weight: 600; color: #475569; font-family: monospace;">Tâm X (Side):</span>
              <div style="display: flex; gap: 3px;">
                <button class="btn-shift-center" data-dx="-0.05" data-dy="0" title="Lùi tâm 5cm" style="border: 1px solid #cbd5e1; background: #ffffff; color: #334155; padding: 1px 5px; border-radius: 3px; font-size: 8.5px; font-family: monospace; cursor: pointer;">-5cm</button>
                <button class="btn-shift-center" data-dx="-0.01" data-dy="0" title="Lùi tâm 1cm" style="border: 1px solid #cbd5e1; background: #ffffff; color: #334155; padding: 1px 5px; border-radius: 3px; font-size: 8.5px; font-family: monospace; cursor: pointer;">-1cm</button>
                <button class="btn-shift-center" data-dx="0.01" data-dy="0" title="Tiến tâm 1cm" style="border: 1px solid #cbd5e1; background: #ffffff; color: #334155; padding: 1px 5px; border-radius: 3px; font-size: 8.5px; font-family: monospace; cursor: pointer;">+1cm</button>
                <button class="btn-shift-center" data-dx="0.05" data-dy="0" title="Tiến tâm 5cm" style="border: 1px solid #cbd5e1; background: #ffffff; color: #334155; padding: 1px 5px; border-radius: 3px; font-size: 8.5px; font-family: monospace; cursor: pointer;">+5cm</button>
              </div>
            </div>

            <!-- Trục Ngang Y (Trái / Phải - Front View) -->
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 9px; font-weight: 600; color: #475569; font-family: monospace;">Tâm Y (Front):</span>
              <div style="display: flex; gap: 3px;">
                <button class="btn-shift-center" data-dx="0" data-dy="-0.05" title="Dời tâm sang phải 5cm" style="border: 1px solid #cbd5e1; background: #ffffff; color: #334155; padding: 1px 5px; border-radius: 3px; font-size: 8.5px; font-family: monospace; cursor: pointer;">-5cm</button>
                <button class="btn-shift-center" data-dx="0" data-dy="-0.01" title="Dời tâm sang phải 1cm" style="border: 1px solid #cbd5e1; background: #ffffff; color: #334155; padding: 1px 5px; border-radius: 3px; font-size: 8.5px; font-family: monospace; cursor: pointer;">-1cm</button>
                <button class="btn-shift-center" data-dx="0" data-dy="0.01" title="Dời tâm sang trái 1cm" style="border: 1px solid #cbd5e1; background: #ffffff; color: #334155; padding: 1px 5px; border-radius: 3px; font-size: 8.5px; font-family: monospace; cursor: pointer;">+1cm</button>
                <button class="btn-shift-center" data-dx="0" data-dy="0.05" title="Dời tâm sang trái 5cm" style="border: 1px solid #cbd5e1; background: #ffffff; color: #334155; padding: 1px 5px; border-radius: 3px; font-size: 8.5px; font-family: monospace; cursor: pointer;">+5cm</button>
              </div>
            </div>
          </div>

          <!-- GỢI Ý DÒNG XE CATALOG & NÚT LƯU KÍCH THƯỚC -->
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 2px;">
            <span style="font-size: 9.5px; color: #64748b; font-family: ui-monospace, monospace;">
              Khớp: <strong style="color: #059669;">${bestFit.matchedItem.name}</strong> (${bestFit.confidence}%)
              <button class="catalog-btn" data-l="${bestFit.recommendedL}" data-w="${bestFit.recommendedW}" data-h="${bestFit.recommendedH}" data-name="${bestFit.matchedItem.name}" style="
                border: none;
                background: transparent;
                color: #0284c7;
                font-size: 9.5px;
                cursor: pointer;
                text-decoration: underline;
                padding-left: 4px;
                font-weight: 600;
              ">Áp dụng</button>
            </span>

            <button id="btn-apply-dimensions" style="
              background: #0f172a;
              border: 1px solid #0f172a;
              color: #ffffff;
              padding: 4px 10px;
              border-radius: 5px;
              font-size: 10px;
              font-weight: 600;
              cursor: pointer;
              display: flex;
              align-items: center;
              gap: 4px;
              transition: background 0.12s;
            ">
              ${ICONS.save}
              <span>Lưu</span>
            </button>
          </div>
        </div>

        <!-- KHỐI 4: ACCORDION TINH CHỈNH NÂNG CAO (COLLAPSIBLE - LIGHT) -->
        <button id="btn-toggle-advanced" style="
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          color: #334155;
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
            <span style="display: flex; align-items: center; color: #64748b;">${ICONS.sliders}</span>
            <span style="color: #09090b; font-weight: 600;">Tinh Chỉnh Nâng Cao</span>
          </span>
          <span style="display: flex; align-items: center; gap: 4px; font-size: 10px; color: #64748b;">
            <span>${this.isAdvancedOpen ? "Thu gọn" : "Mở rộng"}</span>
            <span style="display: flex; align-items: center;">${this.isAdvancedOpen ? ICONS.chevronUp : ICONS.chevronDown}</span>
          </span>
        </button>

        ${advancedContentHtml}

        <!-- KHỐI 5: NÚT MỞ RỘNG FULLSCREEN TRACK STUDIO (DUYỆT THEO ID) -->
        <button id="btn-banner-fullscreen-editor" title="Mở Rộng Toàn Màn Hình · Duyệt Toàn Bộ Track ID (Shift+M)" style="
          background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
          border: 1px solid #bfdbfe;
          color: #1d4ed8;
          padding: 6px 10px;
          border-radius: 8px;
          font-size: 10.5px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: space-between;
          transition: all 0.15s;
        ">
          <span style="display: flex; align-items: center; gap: 6px;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
            <span>Duyệt Toàn Track ID (Full Screen)</span>
          </span>
          <kbd style="font-size: 9px; font-family: monospace; background: #ffffff; border: 1px solid #bfdbfe; padding: 1px 4px; border-radius: 3px; color: #1d4ed8;">⇧M</kbd>
        </button>
      </div>

      <!-- CARD FOOTER (LIGHT) -->
      <div style="
        padding: 6px 12px;
        background: #f8fafc;
        border-top: 1px solid #e2e8f0;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 9.5px;
        color: #64748b;
        font-family: ui-monospace, monospace;
      ">
        <span>300K LIDAR FIT</span>
        <span style="color: #059669; display: flex; align-items: center; gap: 4px; font-weight: 600;">
          <span style="width: 5px; height: 5px; border-radius: 50%; background: #10b981;"></span>
          CANVAS AUTO-SELECT
        </span>
      </div>
    `;
      if (this.toastOverlay) {
        this.container.appendChild(this.toastOverlay);
      }
      const catChips = this.container.querySelectorAll(".btn-category-chip");
      catChips.forEach((btn) => {
        btn.addEventListener("click", () => {
          const cat = btn.dataset.cat;
          if (cat && cat !== this.selectedCategory) {
            this.selectedCategory = cat;
            this.updateContent();
            this.showToast(`Chế độ: ${cat === "car" ? "Ô tô" : cat === "pedestrian" ? "Người đi bộ" : "Xe 2 bánh"}`, "info");
          }
        });
      });
      const fitTopBtn = this.container.querySelector("#btn-fit-top");
      if (fitTopBtn) fitTopBtn.addEventListener("click", () => this.handleFitTop());
      const fitSideBtn = this.container.querySelector("#btn-fit-side");
      if (fitSideBtn) fitSideBtn.addEventListener("click", () => this.handleFitSide());
      const fitFrontBtn = this.container.querySelector("#btn-fit-front");
      if (fitFrontBtn) fitFrontBtn.addEventListener("click", () => this.handleFitFront());
      const fitCarWBtn = this.container.querySelector("#btn-fit-car-w");
      if (fitCarWBtn) fitCarWBtn.addEventListener("click", () => this.handleFitWidth());
      const fitCarHBtn = this.container.querySelector("#btn-fit-car-h");
      if (fitCarHBtn) fitCarHBtn.addEventListener("click", () => this.handleFitHeight());
      const heroBtn = this.container.querySelector("#btn-hero-smart-fit");
      if (heroBtn) {
        heroBtn.addEventListener("click", () => {
          if (this.selectedCategory === "pedestrian") {
            this.handleFitPedestrian();
          } else if (this.selectedCategory === "cyclist") {
            this.handleFitCyclist();
          }
        });
      }
      const fitPedAllBtn = this.container.querySelector("#btn-fit-ped-all");
      if (fitPedAllBtn) {
        fitPedAllBtn.addEventListener("click", () => this.handleFitPedestrian("all"));
      }
      const fitPedLBtn = this.container.querySelector("#btn-fit-ped-l");
      if (fitPedLBtn) {
        fitPedLBtn.addEventListener("click", () => this.handleFitPedestrian("l"));
      }
      const fitPedWBtn = this.container.querySelector("#btn-fit-ped-w");
      if (fitPedWBtn) {
        fitPedWBtn.addEventListener("click", () => this.handleFitPedestrian("w"));
      }
      const fitPedHBtn = this.container.querySelector("#btn-fit-ped-h");
      if (fitPedHBtn) {
        fitPedHBtn.addEventListener("click", () => this.handleFitPedestrian("h"));
      }
      const fitCyclistAllBtn = this.container.querySelector("#btn-fit-cyclist-all");
      if (fitCyclistAllBtn) {
        fitCyclistAllBtn.addEventListener("click", () => this.handleFitCyclist("all"));
      }
      const fitCyclistWBtn = this.container.querySelector("#btn-fit-cyclist-w");
      if (fitCyclistWBtn) {
        fitCyclistWBtn.addEventListener("click", () => this.handleFitCyclist("w"));
      }
      const fitCyclistHBtn = this.container.querySelector("#btn-fit-cyclist-h");
      if (fitCyclistHBtn) {
        fitCyclistHBtn.addEventListener("click", () => this.handleFitCyclist("h"));
      }
      const quickFlipBtn = this.container.querySelector("#btn-quick-flip");
      if (quickFlipBtn) quickFlipBtn.addEventListener("click", () => this.handleFlipYaw(true));
      const quickGroundBtn = this.container.querySelector("#btn-quick-ground");
      if (quickGroundBtn) quickGroundBtn.addEventListener("click", () => this.handleSnapGround("road"));
      const quickGroundTrackBtn = this.container.querySelector("#btn-snap-ground-track");
      if (quickGroundTrackBtn) quickGroundTrackBtn.addEventListener("click", () => this.handleSnapGroundTrack());
      const toggleAdvancedBtn = this.container.querySelector("#btn-toggle-advanced");
      if (toggleAdvancedBtn) {
        toggleAdvancedBtn.addEventListener("click", () => {
          this.isAdvancedOpen = !this.isAdvancedOpen;
          this.updateContent();
        });
      }
      const undoBtn = this.container.querySelector("#floating-btn-undo");
      if (undoBtn) undoBtn.addEventListener("click", () => this.handleUndo());
      const minBtn = this.container.querySelector("#floating-btn-minimize");
      if (minBtn) minBtn.addEventListener("click", () => this.toggleMinimize());
      const badgeView = this.container.querySelector("#floating-badge-view");
      if (badgeView) {
        badgeView.addEventListener("click", () => {
          const views = ["top", "side", "front", "perspective"];
          const nextIdx = (views.indexOf(this.currentActiveView) + 1) % views.length;
          this.setActiveView(views[nextIdx]);
          this.showToast(`Khung nhìn WASD: ${views[nextIdx].toUpperCase()}`, "info");
        });
      }
      const helpBtn = this.container.querySelector("#floating-btn-help");
      if (helpBtn) helpBtn.addEventListener("click", () => this.toggleHotkeysHelpModal());
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
                const badgeColor = t.color || "#3b82f6";
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
                      <span style="font-weight: 700; color: ${isSelected ? "#10b981" : "#a1a1aa"}; font-size: 11px;">#${t.uiId}</span>
                      <span style="
                        display: inline-flex;
                        align-items: center;
                        gap: 4px;
                        padding: 1px 6px;
                        border-radius: 4px;
                        background: ${badgeColor}25;
                        border: 1px solid ${badgeColor}60;
                        color: ${badgeColor};
                        font-weight: 600;
                        font-size: 10px;
                      ">
                        <span style="width: 5px; height: 5px; border-radius: 50%; background: ${badgeColor}; display: inline-block;"></span>
                        ${t.label}
                      </span>
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
      const autoCenterBtn = this.container.querySelector("#btn-toggle-auto-center");
      if (autoCenterBtn) {
        autoCenterBtn.addEventListener("click", () => {
          this.autoCenterOnFrame = !this.autoCenterOnFrame;
          localStorage.setItem("CVAT_3D_SUITE_AUTO_CENTER_FRAME", String(this.autoCenterOnFrame));
          CVATBridge.setAutoCenterOnFrameChange(this.autoCenterOnFrame);
          this.showToast(
            `Đã ${this.autoCenterOnFrame ? "BẬT Ghim Tâm (Lock-On)" : "TẮT Ghim Tâm (Tự do)"} khi tua frame`,
            this.autoCenterOnFrame ? "success" : "info"
          );
          if (this.autoCenterOnFrame && this.selectedUiId !== null) {
            CVATBridge.centerCanvas3DOnTrack(this.selectedUiId);
          }
          this.updateContent();
        });
      }
      const colorModeBtn = this.container.querySelector("#btn-toggle-point-color-mode");
      if (colorModeBtn) {
        colorModeBtn.addEventListener("click", async () => {
          this.pointColorMode = this.pointColorMode === "intensity" ? "plain" : "intensity";
          localStorage.setItem("cvat_3d_point_color_mode", this.pointColorMode);
          await CVATBridge.setPointCloudColorMode(this.pointColorMode, this.colorizeBoxedPoints);
          this.showToast(
            this.pointColorMode === "intensity" ? "Màu Point: Độ phản xạ (Intensity - Soi vạch sơn)" : "Màu Point: Màu phẳng (Plain - Rõ hình khối 3D)",
            "info"
          );
          this.updateContent();
        });
      }
      const colorizeBoxedBtn = this.container.querySelector("#btn-toggle-colorize-boxed");
      if (colorizeBoxedBtn) {
        colorizeBoxedBtn.addEventListener("click", async () => {
          this.colorizeBoxedPoints = !this.colorizeBoxedPoints;
          localStorage.setItem("cvat_3d_colorize_boxed", String(this.colorizeBoxedPoints));
          await CVATBridge.setPointCloudColorMode(this.pointColorMode, this.colorizeBoxedPoints);
          this.showToast(
            `Đã ${this.colorizeBoxedPoints ? "BẬT" : "TẮT"} nhuộm màu điểm trong xe bọc`,
            this.colorizeBoxedPoints ? "success" : "info"
          );
          this.updateContent();
        });
      }
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
          const h2 = inpH ? parseFloat(inpH.value) : this.editH;
          this.handleUpdateDimensions(l, w, h2, this.applyToTrack);
        });
      }
      const fitCurrentBoxBtn = this.container.querySelector("#btn-fit-current-box");
      if (fitCurrentBoxBtn) {
        fitCurrentBoxBtn.addEventListener("click", () => this.handleFitCurrentBox());
      }
      const presetChips = this.container.querySelectorAll(".btn-preset-chip");
      presetChips.forEach((btn) => {
        btn.addEventListener("click", () => {
          const idx = parseInt(btn.dataset.idx || "0", 10);
          const preset = activePresets[idx];
          if (preset) {
            this.handleApplyPreset(preset);
          }
        });
      });
      const outsideTrackBtn = this.container.querySelector("#btn-outside-entire-track");
      if (outsideTrackBtn) {
        outsideTrackBtn.addEventListener("click", () => this.handleSetTrackOutside(true));
      }
      const insideTrackBtn = this.container.querySelector("#btn-inside-entire-track");
      if (insideTrackBtn) {
        insideTrackBtn.addEventListener("click", () => this.handleSetTrackOutside(false));
      }
      const shiftCenterBtns = this.container.querySelectorAll(".btn-shift-center");
      shiftCenterBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
          const dx = parseFloat(btn.dataset.dx || "0");
          const dy = parseFloat(btn.dataset.dy || "0");
          if (dx !== 0 || dy !== 0) {
            this.handleShiftCenter(dx, dy);
          }
        });
      });
      const catalogBtns = this.container.querySelectorAll(".catalog-btn");
      catalogBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
          const l = parseFloat(btn.dataset.l || "0");
          const w = parseFloat(btn.dataset.w || "0");
          const h2 = parseFloat(btn.dataset.h || "0");
          if (l > 0 && w > 0 && h2 > 0) {
            this.handleUpdateDimensions(l, w, h2, this.applyToTrack);
          }
        });
      });
      const snapYawLaneBtn = this.container.querySelector("#btn-snap-yaw-lane");
      if (snapYawLaneBtn) {
        snapYawLaneBtn.addEventListener("click", () => this.handleSnapYawToLane());
      }
      const rotBtns = this.container.querySelectorAll(".btn-rot");
      rotBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
          var _a;
          const deg2 = parseInt(btn.dataset.deg || "0", 10);
          if (deg2 !== 0) {
            let newDeg = Math.round(this.currentYawDeg + deg2);
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
              this.showToast(`Xoay ${deg2 > 0 ? "+" : ""}${deg2}° ➔ Yaw: ${newDeg}°`, "success");
              this.updateContent();
            }
          }
        });
      });
      const snapRoadBtn = this.container.querySelector("#btn-snap-road");
      if (snapRoadBtn) snapRoadBtn.addEventListener("click", () => this.handleSnapGround("road"));
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
      const activeBox = this.getCurrentBox3D();
      if (activeBox) {
        CameraOverlayManager.getInstance().renderBox(activeBox);
        CameraFocusModal.getInstance().setBox(activeBox);
      } else {
        CameraOverlayManager.getInstance().clearAllCanvases();
        CameraFocusModal.getInstance().setBox(null);
      }
    }
    /**
     * Mở giao diện toàn màn hình duyệt và chỉnh sửa toàn bộ track của xe (CVAT Helper Studio)
     */
    openFullscreenEditor() {
      if (!this.currentCtx || !this.currentCtx.jobId) {
        this.showToast("Chưa kết nối Job CVAT!", "warning");
        return;
      }
      const firstTrack = this.frameTracks[0];
      const targetUiId = this.selectedUiId !== null ? this.selectedUiId : firstTrack ? firstTrack.uiId : void 0;
      HelperOverlay.getInstance().open(this.currentCtx.jobId, targetUiId);
    }
    /**
     * Bật / Tắt bảng hướng dẫn phím tắt nổi (Speedrun Hotkeys Cheatsheet Modal)
     */
    toggleHotkeysHelpModal() {
      if (this.isHelpModalOpen) {
        if (this.helpModalContainer && this.helpModalContainer.parentNode) {
          this.helpModalContainer.parentNode.removeChild(this.helpModalContainer);
        }
        this.helpModalContainer = null;
        this.isHelpModalOpen = false;
        return;
      }
      this.isHelpModalOpen = true;
      this.helpModalContainer = document.createElement("div");
      this.helpModalContainer.id = "cvat-3d-suite-hotkeys-modal";
      this.helpModalContainer.style.position = "fixed";
      this.helpModalContainer.style.top = "0";
      this.helpModalContainer.style.left = "0";
      this.helpModalContainer.style.width = "100vw";
      this.helpModalContainer.style.height = "100vh";
      this.helpModalContainer.style.backgroundColor = "rgba(15, 23, 42, 0.55)";
      this.helpModalContainer.style.backdropFilter = "blur(6px)";
      this.helpModalContainer.style.zIndex = "1000000";
      this.helpModalContainer.style.display = "flex";
      this.helpModalContainer.style.alignItems = "center";
      this.helpModalContainer.style.justifyContent = "center";
      this.helpModalContainer.style.userSelect = "none";
      this.helpModalContainer.style.fontFamily = "ui-sans-serif, system-ui, -apple-system, sans-serif";
      this.helpModalContainer.innerHTML = `
      <div style="
        background: #ffffff;
        border-radius: 16px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        border: 1px solid #e2e8f0;
        width: 92%;
        max-width: 660px;
        max-height: 88vh;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        color: #0f172a;
      ">
        <!-- HEADER -->
        <div style="
          padding: 14px 18px;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #f8fafc;
          border-radius: 16px 16px 0 0;
        ">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 16px;">⌨️</span>
            <div>
              <div style="font-size: 13px; font-weight: 700; color: #0f172a;">BẢNG PHÍM TẮT SPEEDRUN (TAY TRÁI SIÊU TỐC)</div>
              <div style="font-size: 10px; color: #64748b;">Tay phải giữ nguyên chuột 3D · 100% phím bấm nằm gọn ở bàn tay trái</div>
            </div>
          </div>
          <button id="btn-close-help-modal" style="
            background: transparent;
            border: none;
            color: #64748b;
            cursor: pointer;
            font-size: 16px;
            padding: 4px 8px;
            border-radius: 6px;
          ">✕</button>
        </div>

        <!-- CONTENT MATRIX -->
        <div style="padding: 14px 18px; display: flex; flex-direction: column; gap: 12px; font-size: 11px;">
          <!-- HÀNG 1: 3 CHIỀU & HƯỚNG XE -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <!-- CỘT 1 -->
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 6px;">
              <div style="font-weight: 700; color: #0f766e; font-size: 11px; margin-bottom: 2px;">🎯 CĂN CHỈNH 3 CHIỀU & FIT SIZE</div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Căn TOP (Yaw & Nóc quanh tâm)</span>
                <div><kbd style="background: #f0fdfa; border: 1px solid #99f6e4; color: #0f766e; padding: 1px 5px; border-radius: 4px; font-weight: 700;">1</kbd> / <kbd style="background: #f0fdfa; border: 1px solid #99f6e4; color: #0f766e; padding: 1px 5px; border-radius: 4px; font-weight: 700;">T</kbd></div>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Căn SIDE (Cản trước/sau trục X)</span>
                <kbd style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; padding: 1px 5px; border-radius: 4px; font-weight: 700;">2</kbd>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Căn FRONT (Sườn ngang W, giữ Z)</span>
                <kbd style="background: #faf5ff; border: 1px solid #e9d5ff; color: #7e22ce; padding: 1px 5px; border-radius: 4px; font-weight: 700;">3</kbd>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Fit Rộng (W) [Mọi đối tượng]</span>
                <kbd style="background: #faf5ff; border: 1px solid #d8b4fe; color: #7e22ce; padding: 1px 5px; border-radius: 4px; font-weight: 700;">4</kbd>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Fit Cao (H) [Ground-Lock nở nóc]</span>
                <kbd style="background: #fff7ed; border: 1px solid #fdba74; color: #c2410c; padding: 1px 5px; border-radius: 4px; font-weight: 700;">5</kbd>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Căn giữa (Center / Focus) xe đang chọn</span>
                <kbd style="background: #ecfdf5; border: 1px solid #a7f3d0; color: #047857; padding: 1px 6px; border-radius: 4px; font-weight: 700;">Z</kbd>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed #cbd5e1; padding-top: 4px; margin-top: 2px;">
                <span style="font-weight: 600; color: #64748b; font-size: 10px;">Nguyên tắc Front/Side/Fit H</span>
                <span style="font-size: 9.5px; color: #059669; font-weight: 600;">Khóa Z & Đáy Bám Sàn</span>
              </div>
            </div>

            <!-- CỘT 2 -->
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 6px;">
              <div style="font-weight: 700; color: #1d4ed8; font-size: 11px; margin-bottom: 2px;">🛣️ HƯỚNG XE, LÀN ĐƯỜNG & YAW</div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Căn theo Vạch Kẻ Làn Đường 3D</span>
                <kbd style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; padding: 1px 6px; border-radius: 4px; font-weight: 700;">L</kbd>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Lật ngược đầu xe 180° (Frame này)</span>
                <kbd style="background: #ffffff; border: 1px solid #cbd5e1; color: #0f172a; padding: 1px 6px; border-radius: 4px; font-weight: 700;">F</kbd>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Lật ngược đầu xe (Toàn bộ Track)</span>
                <kbd style="background: #ffffff; border: 1px solid #cbd5e1; color: #0f172a; padding: 1px 5px; border-radius: 4px; font-weight: 700;">Shift+F</kbd>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Vi chỉnh Xoay Trái / Phải ±1°</span>
                <div><kbd style="background: #ffffff; border: 1px solid #cbd5e1; padding: 1px 5px; border-radius: 4px;">Q</kbd> / <kbd style="background: #ffffff; border: 1px solid #cbd5e1; padding: 1px 5px; border-radius: 4px;">E</kbd></div>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Xoay nhanh Trái / Phải ±5°</span>
                <div><kbd style="background: #ffffff; border: 1px solid #cbd5e1; padding: 1px 4px; border-radius: 4px;">Shift+Q/E</kbd></div>
              </div>
            </div>
          </div>

          <!-- HÀNG 2: MẶT ĐẤT & ĐIỀU HƯỚNG -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <!-- CỘT 3 -->
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 6px;">
              <div style="font-weight: 700; color: #b45309; font-size: 11px; margin-bottom: 2px;">⛰️ MẶT ĐẤT, VỈA HÈ & DỐC (TỰ ĐỘNG)</div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Ghim Đất (Tự nhận diện vỉa hè/gác lề)</span>
                <kbd style="background: #fef3c7; border: 1px solid #fde68a; color: #92400e; padding: 1px 6px; border-radius: 4px; font-weight: 700;">G</kbd>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Ghim Đất & Vỉa Hè Toàn Bộ Track</span>
                <kbd style="background: #fef3c7; border: 1px solid #fde68a; color: #92400e; padding: 1px 5px; border-radius: 4px; font-weight: 700;">Shift+G</kbd>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Đặt lại Dốc 0° (Reset phẳng hoàn toàn)</span>
                <kbd style="background: #ffffff; border: 1px solid #cbd5e1; padding: 1px 4px; border-radius: 4px;">Alt+R</kbd>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed #cbd5e1; padding-top: 4px; margin-top: 2px;">
                <span style="font-size: 9.5px; color: #64748b;">Chưa đủ điểm mặt đất</span>
                <span style="font-size: 9.5px; color: #b45309; font-weight: 600;">Fit cao & góc thẳng theo Ego</span>
              </div>
            </div>

            <!-- CỘT 4 -->
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 6px;">
              <div style="font-weight: 700; color: #4338ca; font-size: 11px; margin-bottom: 2px;">⚡ VI CHỈNH SHIFT + WASD (SCREEN SPACE)</div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Shift + A: Trái | Shift + D: Phải</span>
                <div><kbd style="background: #ecfdf5; border: 1px solid #a7f3d0; color: #047857; padding: 1px 4px; border-radius: 4px; font-weight: 700;">Shift</kbd> + <kbd style="background: #ecfdf5; border: 1px solid #a7f3d0; color: #047857; padding: 1px 4px; border-radius: 4px; font-weight: 700;">A/D</kbd></div>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Shift + W: Lên | Shift + S: Xuống</span>
                <div><kbd style="background: #ecfdf5; border: 1px solid #a7f3d0; color: #047857; padding: 1px 4px; border-radius: 4px; font-weight: 700;">Shift</kbd> + <kbd style="background: #ecfdf5; border: 1px solid #a7f3d0; color: #047857; padding: 1px 4px; border-radius: 4px; font-weight: 700;">W/S</kbd></div>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 9.5px; color: #64748b;">Bước nhảy: 2cm / lần bấm</span>
                <span style="font-size: 9px; color: #059669; font-weight: 600;">Chỉ Frame này (Không đổi cả Track)</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed #cbd5e1; padding-top: 4px; margin-top: 2px;">
                <span>Xe Liền Trước / Xe Kế Tiếp</span>
                <div><kbd style="background: #e0e7ff; border: 1px solid #c7d2fe; color: #3730a3; padding: 1px 5px; border-radius: 4px; font-weight: 700;">[</kbd> / <kbd style="background: #e0e7ff; border: 1px solid #c7d2fe; color: #3730a3; padding: 1px 5px; border-radius: 4px; font-weight: 700;">]</kbd></div>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Đổi Phạm Vi: Frame Này ⟷ Toàn Track</span>
                <div><kbd style="background: #ffffff; border: 1px solid #cbd5e1; padding: 1px 4px; border-radius: 4px;">Tab</kbd> / <kbd style="background: #ffffff; border: 1px solid #cbd5e1; padding: 1px 4px; border-radius: 4px;">X</kbd></div>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Hoàn Tác Thao Tác Vừa Làm (Pre)</span>
                <kbd style="background: #ffffff; border: 1px solid #cbd5e1; padding: 1px 4px; border-radius: 4px; font-weight: 700;">Ctrl+Z</kbd>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Ẩn / Hiện Toàn Bộ Track</span>
                <div><kbd style="background: #fff1f2; border: 1px solid #fecdd3; color: #e11d48; padding: 1px 4px; border-radius: 4px; font-weight: 700;">Shift+O</kbd> / <kbd style="background: #ecfdf5; border: 1px solid #a7f3d0; color: #059669; padding: 1px 4px; border-radius: 4px; font-weight: 700;">Shift+I</kbd></div>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Fit Người Đi Bộ / Xe 2 Bánh</span>
                <div><kbd style="background: #ffffff; border: 1px solid #cbd5e1; padding: 1px 5px; border-radius: 4px;">P</kbd> / <kbd style="background: #ffffff; border: 1px solid #cbd5e1; padding: 1px 5px; border-radius: 4px;">C</kbd></div>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>Khớp Chuẩn Kích Thước Catalog</span>
                <kbd style="background: #ffffff; border: 1px solid #cbd5e1; padding: 1px 6px; border-radius: 4px; font-weight: 700;">B</kbd>
              </div>
            </div>
          </div>
        </div>

        <!-- FOOTER -->
        <div style="
          padding: 10px 18px;
          border-top: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #f8fafc;
          border-radius: 0 0 16px 16px;
        ">
          <span style="font-size: 10px; color: #64748b;">Mẹo: Bấm <strong>?</strong> bất cứ lúc nào để mở/đóng bảng này</span>
          <button id="btn-close-help-footer" style="
            background: #0f172a;
            border: none;
            color: #ffffff;
            padding: 5px 14px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
          ">Đóng (Esc)</button>
        </div>
      </div>
    `;
      document.body.appendChild(this.helpModalContainer);
      const closeBtn = this.helpModalContainer.querySelector("#btn-close-help-modal");
      if (closeBtn) closeBtn.addEventListener("click", () => this.toggleHotkeysHelpModal());
      const footerCloseBtn = this.helpModalContainer.querySelector("#btn-close-help-footer");
      if (footerCloseBtn) footerCloseBtn.addEventListener("click", () => this.toggleHotkeysHelpModal());
      this.helpModalContainer.addEventListener("click", (e) => {
        if (e.target === this.helpModalContainer) {
          this.toggleHotkeysHelpModal();
        }
      });
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
  if (window.__CVAT_3D_SUITE_INITIALIZED__) {
    console.log("[CVAT 3D Suite] Đã có một phiên bản Suite đang chạy trên trang, bỏ qua khởi tạo trùng lặp.");
  } else {
    let updateContext = function() {
      const ctx = detectCVAT();
      if (!ctx.isCVAT) {
        panel.destroy();
        return;
      }
      panel.render(ctx);
    }, setupGlobalHotkeys = function() {
      const isInputElement = (target) => {
        if (!target) return false;
        const tagName = target.tagName || "";
        return ["INPUT", "TEXTAREA", "SELECT"].includes(tagName) || !!target.isContentEditable;
      };
      const blockCvatKeyLeak = (e) => {
        if (isInputElement(e.target)) return;
        const key = (e.key || "").toLowerCase();
        const code = e.code || "";
        if (key === "w" || code === "KeyW" || key === "ư" || key === "a" || code === "KeyA" || key === "á" || key === "à" || key === "â" || key === "s" || code === "KeyS" || key === "d" || code === "KeyD" || key === "đ" || key === "backspace" || code === "Backspace" || key === "delete" || code === "Delete" || key === "1" || code === "Digit1" || code === "Numpad1" || key === "2" || code === "Digit2" || code === "Numpad2" || key === "3" || code === "Digit3" || code === "Numpad3" || key === "4" || code === "Digit4" || code === "Numpad4" || key === "5" || code === "Digit5" || code === "Numpad5") {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
        }
      };
      window.addEventListener("keyup", blockCvatKeyLeak, { capture: true, passive: false });
      window.addEventListener("keypress", blockCvatKeyLeak, { capture: true, passive: false });
      window.addEventListener(
        "keydown",
        (e) => {
          const target = e.target;
          if (isInputElement(target)) {
            return;
          }
          const key = (e.key || "").toLowerCase();
          const code = e.code || "";
          const consume = () => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
          };
          if (key === "backspace" || code === "Backspace" || key === "delete" || code === "Delete") {
            consume();
            return;
          }
          if (key === "`" || key === "~" || code === "Backquote") {
            consume();
            panel.toggleMinimize();
            return;
          }
          if (key === "?" || e.shiftKey && (key === "/" || code === "Slash")) {
            consume();
            panel.toggleHotkeysHelpModal();
            return;
          }
          if ((key === "escape" || code === "Escape") && panel.isHelpModalOpen) {
            consume();
            panel.toggleHotkeysHelpModal();
            return;
          }
          if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (key === "z" || code === "KeyZ")) {
            consume();
            console.log("[CVAT 3D Suite] Phím tắt Ctrl/Cmd+Z: Hoàn tác (Pre)");
            panel.handleUndo();
            return;
          }
          if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && (key === "z" || code === "KeyZ")) {
            consume();
            console.log("[CVAT 3D Suite] Phím tắt Z: Căn giữa View 3D vào xe đang chọn");
            panel.handleCenterCurrentTrack();
            return;
          }
          if (!e.ctrlKey && !e.metaKey && !e.altKey && (key === "tab" || code === "Tab" || key === "x" || code === "KeyX")) {
            consume();
            panel.toggleScope();
            return;
          }
          if (e.shiftKey && (key === "o" || code === "KeyO")) {
            consume();
            console.log("[CVAT 3D Suite] Phím tắt Shift+O: Đánh dấu Outside toàn bộ Track");
            panel.handleSetTrackOutside(true);
            return;
          }
          if (e.shiftKey && (key === "i" || code === "KeyI")) {
            consume();
            console.log("[CVAT 3D Suite] Phím tắt Shift+I: Đánh dấu Inside (Hiện lại) toàn bộ Track");
            panel.handleSetTrackOutside(false);
            return;
          }
          if (e.shiftKey && (key === "m" || code === "KeyM")) {
            consume();
            console.log("[CVAT 3D Suite] Phím tắt Shift+M: Mở Fullscreen Track Editor");
            panel.openFullscreenEditor();
            return;
          }
          if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (key === "f" || code === "KeyF")) {
            consume();
            console.log("[CVAT 3D Suite] Phím tắt Shift+F: Lật toàn bộ Track");
            panel.handleFlipYaw(false);
            return;
          }
          if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (key === "f" || code === "KeyF")) {
            consume();
            console.log("[CVAT 3D Suite] Phím tắt F: Lật Frame hiện tại");
            panel.handleFlipYaw(true);
            return;
          }
          const isKeyW = key === "w" || code === "KeyW" || key === "ư";
          const isKeyA = key === "a" || code === "KeyA" || ["á", "à", "ả", "ã", "ạ", "â", "ă"].includes(key);
          const isKeyS = key === "s" || code === "KeyS";
          const isKeyD = key === "d" || code === "KeyD" || key === "đ";
          if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (isKeyW || isKeyA || isKeyS || isKeyD)) {
            consume();
            const nudgeKey = isKeyW ? "w" : isKeyA ? "a" : isKeyS ? "s" : "d";
            panel.handleNudgeByView(nudgeKey);
            return;
          }
          if (!e.ctrlKey && !e.metaKey && !e.altKey && (key === "[" || code === "BracketLeft")) {
            consume();
            panel.selectPrevTrack();
            return;
          }
          if (!e.ctrlKey && !e.metaKey && !e.altKey && (key === "]" || code === "BracketRight")) {
            consume();
            panel.selectNextTrack();
            return;
          }
          if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (key === "q" || code === "KeyQ")) {
            consume();
            panel.rotateYawByDelta(-5);
            return;
          }
          if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (key === "e" || code === "KeyE")) {
            consume();
            panel.rotateYawByDelta(5);
            return;
          }
          if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (key === "q" || code === "KeyQ")) {
            consume();
            panel.rotateYawByDelta(-1);
            return;
          }
          if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (key === "e" || code === "KeyE")) {
            consume();
            panel.rotateYawByDelta(1);
            return;
          }
          if (e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && (key === "g" || code === "KeyG")) {
            consume();
            console.log("[CVAT 3D Suite] Phím tắt Shift+G: Ghim Đất & Vỉa Hè Toàn Bộ Track");
            panel.handleSnapGroundTrack();
            return;
          }
          if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (key === "g" || code === "KeyG")) {
            consume();
            console.log("[CVAT 3D Suite] Phím tắt G: Ghim Mặt Đất, Vỉa Hè & Gác Lề Tự Động");
            panel.handleSnapGround("road");
            return;
          }
          if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && (key === "r" || code === "KeyR")) {
            consume();
            console.log("[CVAT 3D Suite] Phím tắt Alt+R: Đặt lại dốc phẳng 0°");
            panel.handleSnapGround("reset_slope");
            return;
          }
          if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (key === "1" || code === "Digit1" || code === "Numpad1" || key === "t" || code === "KeyT")) {
            consume();
            console.log("[CVAT 3D Suite] Phím tắt 1/T: Căn TOP");
            panel.handleFitTop();
            return;
          }
          if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (key === "2" || code === "Digit2" || code === "Numpad2")) {
            consume();
            console.log("[CVAT 3D Suite] Phím tắt 2: Căn SIDE");
            panel.handleFitSide();
            return;
          }
          if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (key === "3" || code === "Digit3" || code === "Numpad3")) {
            consume();
            console.log("[CVAT 3D Suite] Phím tắt 3: Căn FRONT");
            panel.handleFitFront();
            return;
          }
          if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (key === "4" || code === "Digit4" || code === "Numpad4")) {
            consume();
            console.log("[CVAT 3D Suite] Phím tắt 4: Fit Rộng (W)");
            panel.handleFitWidth();
            return;
          }
          if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (key === "5" || code === "Digit5" || code === "Numpad5")) {
            consume();
            console.log("[CVAT 3D Suite] Phím tắt 5: Fit Cao (H) [Ground-Lock]");
            panel.handleFitHeight();
            return;
          }
          if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (key === "p" || code === "KeyP")) {
            consume();
            console.log("[CVAT 3D Suite] Phím tắt Shift+P: Fix Cao H Người");
            panel.handleFitPedestrian("h");
            return;
          }
          if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (key === "p" || code === "KeyP")) {
            consume();
            console.log("[CVAT 3D Suite] Phím tắt P: Fit Người Đi Bộ Toàn Diện");
            panel.handleFitPedestrian("all");
            return;
          }
          if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (key === "c" || code === "KeyC")) {
            consume();
            console.log("[CVAT 3D Suite] Phím tắt Shift+C: Fit Rộng W Xe 2 Bánh");
            panel.handleFitCyclist("w");
            return;
          }
          if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (key === "c" || code === "KeyC")) {
            consume();
            console.log("[CVAT 3D Suite] Phím tắt C: Fit Toàn Diện Xe 2 Bánh");
            panel.handleFitCyclist("all");
            return;
          }
          if (!e.ctrlKey && !e.metaKey && !e.altKey && (key === "b" || code === "KeyB")) {
            consume();
            console.log("[CVAT 3D Suite] Phím tắt B: Khớp Chuẩn Catalog");
            panel.handleCatalogFit();
            return;
          }
          if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (key === "l" || code === "KeyL")) {
            consume();
            console.log("[CVAT 3D Suite] Phím tắt L: Căn Yaw theo Vạch Kẻ Làn Đường 3D");
            panel.handleSnapYawToLane();
            return;
          }
          if (e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && (code === "ArrowUp" || key === "arrowup")) {
            consume();
            panel.handleStepDimension("l", 0.1);
            return;
          }
          if (e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && (code === "ArrowDown" || key === "arrowdown")) {
            consume();
            panel.handleStepDimension("l", -0.1);
            return;
          }
          if (e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && (code === "ArrowRight" || key === "arrowright")) {
            consume();
            panel.handleStepDimension("w", 0.1);
            return;
          }
          if (e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && (code === "ArrowLeft" || key === "arrowleft")) {
            consume();
            panel.handleStepDimension("w", -0.1);
            return;
          }
          if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && (code === "ArrowUp" || key === "arrowup")) {
            consume();
            panel.handleStepDimension("h", 0.05);
            return;
          }
          if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && (code === "ArrowDown" || key === "arrowdown")) {
            consume();
            panel.handleStepDimension("h", -0.05);
            return;
          }
          if (key === "pageup" || code === "PageUp") {
            consume();
            panel.handleSnapGround("micro_adjust", { deltaCm: 1 });
            return;
          }
          if (key === "pagedown" || code === "PageDown") {
            consume();
            panel.handleSnapGround("micro_adjust", { deltaCm: -1 });
            return;
          }
        },
        { capture: true, passive: false }
      );
    }, setupViewTracker = function() {
      let lastCheck = 0;
      window.addEventListener(
        "pointermove",
        (e) => {
          const now = Date.now();
          if (now - lastCheck < 60) return;
          lastCheck = now;
          const target = e.target;
          if (!target) return;
          if (target.closest(".cvat-canvas3d-topview, [id*='topview']")) {
            panel.setActiveView("top");
          } else if (target.closest(".cvat-canvas3d-sideview, [id*='sideview']")) {
            panel.setActiveView("side");
          } else if (target.closest(".cvat-canvas3d-frontview, [id*='frontview']")) {
            panel.setActiveView("front");
          } else if (target.closest(".cvat-canvas3d-perspective, [id*='perspective']")) {
            panel.setActiveView("perspective");
          }
        },
        { capture: true, passive: true }
      );
    }, bootstrap = function() {
      updateContext();
      setupGlobalHotkeys();
      setupViewTracker();
      const headerBtn = HeaderSuiteButton.getInstance();
      headerBtn.onToggle((enabled) => {
        panel.setSuiteVisible(enabled);
      });
      let lastPathname = window.location.pathname;
      let navDebounceTimer = null;
      function handleUrlChange() {
        const currentPathname = window.location.pathname;
        if (currentPathname === lastPathname) {
          return;
        }
        lastPathname = currentPathname;
        if (navDebounceTimer) clearTimeout(navDebounceTimer);
        navDebounceTimer = setTimeout(() => {
          navDebounceTimer = null;
          headerBtn.tryMount();
          updateContext();
        }, 250);
      }
      window.addEventListener("popstate", handleUrlChange);
      const originalPushState = history.pushState;
      history.pushState = function(...args) {
        originalPushState.apply(this, args);
        handleUrlChange();
      };
      const originalReplaceState = history.replaceState;
      history.replaceState = function(...args) {
        originalReplaceState.apply(this, args);
        handleUrlChange();
      };
    };
    window.__CVAT_3D_SUITE_INITIALIZED__ = true;
    console.log("[CVAT 3D Suite] Đang khởi động cửa sổ nổi Floating shadcn/ui...");
    const existingContainer = document.getElementById("cvat-3d-suite-floating");
    if (existingContainer && existingContainer.parentNode) {
      existingContainer.parentNode.removeChild(existingContainer);
    }
    const existingPill = document.getElementById("cvat-3d-suite-pill");
    if (existingPill && existingPill.parentNode) {
      existingPill.parentNode.removeChild(existingPill);
    }
    const panel = new FloatingPanel();
    window.__CVAT_3D_SUITE_PANEL_INSTANCE__ = panel;
    CVATBridge.ensureMainWorldBridge();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", bootstrap);
    } else {
      bootstrap();
    }
  }
})();
