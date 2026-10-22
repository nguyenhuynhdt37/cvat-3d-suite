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
    // Xoay / Lật Yaw
    rotate: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>`,
    flip: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 7 5 5-5 5V7"/><path d="m21 7-5 5 5 5V7"/><path d="M12 20v2"/><path d="M12 14v2"/><path d="M12 8v2"/><path d="M12 2v2"/></svg>`,
    // Thao tác Kích thước & Fit
    save: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg>`,
    sparkles: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/></svg>`,
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
    filter: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`,
    undo: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>`,
    eyeOff: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>`
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
    const maxDist = nominalHalf + maxSearchExt;
    const numBins = Math.ceil(maxDist / binSize) + 2;
    const bins = Array.from(
      { length: numBins },
      () => []
    );
    for (const p of candidatePts) {
      const dist = isPos ? p[axis] : -p[axis];
      if (dist >= 0 && dist <= maxDist) {
        const bIdx = Math.min(numBins - 1, Math.floor(dist / binSize));
        bins[bIdx].push(p);
      }
    }
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
        peakDensity: 0
      };
    }
    const minWallDensity = Math.max(2, Math.floor(maxCount * 0.15));
    let outerWallBin = peakBin;
    let consecutiveEmptyBins = 0;
    for (let b = peakBin + 1; b < numBins; b++) {
      const ptsInBin = bins[b];
      const count = ptsInBin.length;
      if (count === 0) {
        consecutiveEmptyBins++;
        if (consecutiveEmptyBins >= 2) {
          break;
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
    const collectedWallPoints = [];
    for (let b = 0; b <= outerWallBin; b++) {
      for (const p of bins[b]) {
        collectedWallPoints.push(p);
      }
    }
    const outerEdgePts = [];
    const edgeStartBin = Math.max(0, outerWallBin - 3);
    for (let b = edgeStartBin; b <= outerWallBin; b++) {
      for (const p of bins[b]) {
        outerEdgePts.push(p);
      }
    }
    if (outerEdgePts.length >= 3) {
      const dists = outerEdgePts.map((p) => isPos ? p[axis] : -p[axis]).sort((a, b) => a - b);
      const pIdx = Math.max(0, Math.min(dists.length - 1, Math.floor(dists.length * 0.95)));
      const chosenDist = dists[pIdx];
      const edge2 = isPos ? Number(chosenDist.toFixed(3)) : Number((-chosenDist).toFixed(3));
      return {
        edge: edge2,
        wallPoints: collectedWallPoints,
        peakDensity: maxCount
      };
    }
    const fallbackDist = (outerWallBin + 1) * binSize;
    const edge = isPos ? Number(fallbackDist.toFixed(3)) : Number((-fallbackDist).toFixed(3));
    return {
      edge,
      wallPoints: collectedWallPoints.length > 0 ? collectedWallPoints : candidatePts,
      peakDensity: maxCount
    };
  }
  function straightenYawFromBoundaryEdge(pts, currentYaw, _L, _W, visibleLateral, options = {}) {
    const maxAdjDeg = options.maxAdjustmentDeg ?? 8;
    const maxAdjRad = maxAdjDeg * Math.PI / 180;
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
        const sortedLy = inSlice.map((p) => p.ly).sort((a, b) => a - b);
        if (isTargetLeft) {
          const pIdx = Math.max(0, Math.floor(sortedLy.length * 0.9));
          slicePoints.push({ lx: (sMin + sMax) / 2, ly: sortedLy[pIdx] });
        } else {
          const pIdx = Math.min(sortedLy.length - 1, Math.floor(sortedLy.length * 0.1));
          slicePoints.push({ lx: (sMin + sMax) / 2, ly: sortedLy[pIdx] });
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
    const slopes = [];
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
  function estimateEgoRoadGroundZ(pts, egoPos = { x: 0, y: 0, z: 0 }, options = {}) {
    const minR = options.minRadius ?? 1.2;
    const maxR = options.maxRadius ?? 6;
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
    const resolvedEgoRoadZ = options.egoRoadZ !== void 0 ? options.egoRoadZ : pts && pts.length >= 8 ? estimateEgoRoadGroundZ(pts, options.egoPos, { defaultZ: 0 }) : 0;
    if (groundPts.length < 6) {
      return {
        groundZ: Number(resolvedEgoRoadZ.toFixed(3)),
        pitchRad: 0,
        rollRad: 0,
        pitchDeg: 0,
        rollDeg: 0,
        groundPointsCount: groundPts.length,
        isFallbackZeroGround: true,
        isCurbGround: false
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
    const p12Idx = Math.max(0, Math.floor(validPts.length * 0.12));
    const lowestRoadZ = validPts[p12Idx].z;
    const leftPtsZ = validPts.filter((p) => p.ly > 0.15).map((p) => p.z).sort((a, b) => a - b);
    const rightPtsZ = validPts.filter((p) => p.ly < -0.15).map((p) => p.z).sort((a, b) => a - b);
    let isCurbOrRamp = options.lockRollFlat === true;
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
      const W = halfW * 2;
      const edgeRightPts = validPts.filter(
        (p) => p.ly >= -halfW - 0.45 && p.ly <= -halfW + W * 0.2
      );
      const edgeLeftPts = validPts.filter(
        (p) => p.ly >= halfW - W * 0.2 && p.ly <= halfW + 0.45
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
        rollRad = 0;
      }
    }
    let isCurbGround = false;
    if (!isCurbOrRamp && options.egoRoadZ !== void 0) {
      const egoZ = options.egoRoadZ;
      if (c0 >= egoZ + 0.08 && c0 <= egoZ + 0.35) {
        isCurbGround = true;
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
      isCurbGround
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
    const minBodyZ = groundZ + 0.22;
    const maxRoofZ = groundZ + H + 0.55;
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
        const frontBumperPts = validBodyPts.filter((p) => p.lx > 0.05);
        const rearBumperPts = validBodyPts.filter((p) => p.lx < -0.05);
        let visibleBumper;
        if (frontBumperPts.length >= rearBumperPts.length + 3) {
          visibleBumper = "front";
        } else if (rearBumperPts.length >= frontBumperPts.length + 3) {
          visibleBumper = "rear";
        } else {
          visibleBumper = egoLocalX >= 0 ? "front" : "rear";
        }
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
        const edgePadding = options.edgePadding ?? 0.05;
        if (visibleBumper === "front") {
          shiftLx = bumperEdge + edgePadding - L / 2;
        } else {
          shiftLx = bumperEdge - edgePadding + L / 2;
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
      msg = `Đã căn SIDE: Cản [${faceTextLong}] đón tia (ΔX: ${deltaXSign}${shiftLx.toFixed(2)}m, giữ nguyên cao độ Z)`;
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
    const headBuffer = options.headBuffer ?? 0.12;
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
    const maxBodyZ = groundZ + 2.3;
    const minFootZ = groundZ + 0.08;
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
          if (Math.abs(lx) <= 0.28 && Math.abs(ly) <= 0.28) {
            footPts.push({ lx, ly, z: p.z });
          }
        }
      }
    }
    let rawBodyPts = coreBodyPts;
    if (coreBodyPts.length < 8 && footPts.length > 0) {
      rawBodyPts = [...coreBodyPts, ...footPts];
    }
    const isSparse = rawBodyPts.length <= 12;
    const maxClusteringGap = isSparse ? 0.25 : 0.14;
    const clusterLy = filterDenseConnectedCluster1D(rawBodyPts, "ly", maxClusteringGap, 0);
    const bodyPts = filterDenseConnectedCluster1D(clusterLy, "lx", maxClusteringGap, 0);
    let newCenterX = cx;
    let newCenterY = cy;
    let newCenterZ = cz;
    let newYawRad = yaw;
    let newYawDeg = radToDeg(yaw);
    let deltaYawDeg = 0;
    let newL = curL;
    let newW = curW;
    let newH = curH;
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
    const pMinIdx = !isSparse && bodyPts.length >= 8 ? Math.floor(bodyPts.length * 0.02) : 0;
    const pMaxIdx = !isSparse && bodyPts.length >= 8 ? Math.floor(bodyPts.length * 0.98) : bodyPts.length - 1;
    const lxMin = allLx[pMinIdx];
    const lxMax = allLx[pMaxIdx];
    const lyMin = allLy[pMinIdx];
    const lyMax = allLy[pMaxIdx];
    const highestPtZ = allZ[allZ.length - 1];
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
      let shiftLx = 0;
      let bumperLabel = "Đón tia";
      if (options.egoPos) {
        const dxEgo = options.egoPos.x - cx;
        const dyEgo = options.egoPos.y - cy;
        const lxEgo = dxEgo * Math.cos(-yaw) - dyEgo * Math.sin(-yaw);
        if (lxEgo > 0.15) {
          shiftLx = lxMax + 0.01 - curL / 2;
          bumperLabel = "Mặt trước";
        } else if (lxEgo < -0.15) {
          shiftLx = lxMin - 0.01 + curL / 2;
          bumperLabel = "Mặt sau";
        } else {
          shiftLx = (lxMin + lxMax) / 2;
          bumperLabel = "Cân đối";
        }
      } else {
        const frontCount = bodyPts.filter((p) => p.lx > 0).length;
        const rearCount = bodyPts.filter((p) => p.lx <= 0).length;
        if (frontCount > rearCount * 1.5) {
          shiftLx = lxMax + 0.01 - curL / 2;
          bumperLabel = "Mặt trước";
        } else if (rearCount > frontCount * 1.5) {
          shiftLx = lxMin - 0.01 + curL / 2;
          bumperLabel = "Mặt sau";
        } else {
          shiftLx = (lxMin + lxMax) / 2;
          bumperLabel = "Cân đối";
        }
      }
      shiftLx = Math.max(-0.35, Math.min(0.35, shiftLx));
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
        shiftLy = lyMax + 0.01 - curW / 2;
      } else if (visibleSide === "right") {
        shiftLy = lyMin - 0.01 + curW / 2;
      } else {
        shiftLy = (lyMin + lyMax) / 2;
      }
      shiftLy = Math.max(-0.35, Math.min(0.35, shiftLy));
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
      const spanL = lxMax - lxMin + 0.08;
      let shiftLx = 0;
      if (spanL > 0.8) {
        newL = 0.8;
        if (options.egoPos) {
          const dxEgo = options.egoPos.x - cx;
          const dyEgo = options.egoPos.y - cy;
          const lxEgo = dxEgo * Math.cos(-yaw) - dyEgo * Math.sin(-yaw);
          if (lxEgo > 0.15) {
            shiftLx = lxMax + 0.01 - newL / 2;
          } else if (lxEgo < -0.15) {
            shiftLx = lxMin - 0.01 + newL / 2;
          } else {
            shiftLx = (lxMin + lxMax) / 2;
          }
        } else {
          shiftLx = (lxMin + lxMax) / 2;
        }
      } else {
        newL = Number(Math.max(0.35, Math.min(0.8, spanL)).toFixed(2));
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
      const spanW = lyMax - lyMin + 0.08;
      let shiftLy = 0;
      if (spanW > 0.75) {
        newW = 0.75;
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
        newW = Number(Math.max(0.35, Math.min(0.75, spanW)).toFixed(2));
        shiftLy = (lyMin + lyMax) / 2;
      }
      shiftLy = Math.max(-0.35, Math.min(0.35, shiftLy));
      newCenterX = Number((cx - shiftLy * Math.sin(yaw)).toFixed(3));
      newCenterY = Number((cy + shiftLy * Math.cos(yaw)).toFixed(3));
      const deltaYSign = shiftLy >= 0 ? "+" : "";
      msg = `Đã fix Chiều Rộng (W) Người đi bộ: W=${newW}m (căn tâm Y: ${deltaYSign}${(shiftLy * 100).toFixed(1)}cm, kháng ghosting), giữ nguyên L, H & Z`;
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
      roofTopZ = highestPtZ + Math.max(0.12, headBuffer);
      newH = Number(Math.max(1, Math.min(2.15, roofTopZ - effectiveBaseZ)).toFixed(2));
      newCenterZ = Number((effectiveBaseZ + newH / 2).toFixed(3));
      msg = `Đã fix Chiều Cao (H) Người đi bộ: H=${newH}m (Đáy bám sàn Z=${effectiveBaseZ.toFixed(2)}m cố định, nở lên đỉnh đầu +12cm), giữ nguyên L, W & XY`;
    } else {
      newL = Number(Math.max(0.4, Math.min(0.8, lxMax - lxMin + 0.08)).toFixed(2));
      newW = Number(Math.max(0.4, Math.min(0.75, lyMax - lyMin + 0.08)).toFixed(2));
      roofTopZ = highestPtZ + headBuffer;
      newH = Number(Math.max(1.05, Math.min(2.15, roofTopZ - groundZ)).toFixed(2));
      let shiftLx = (lxMin + lxMax) / 2;
      let shiftLy = (lyMin + lyMax) / 2;
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
    const rearSlice = sortedByLx.slice(0, Math.max(1, Math.floor(n * 0.18)));
    const frontSlice = sortedByLx.slice(Math.max(1, Math.floor(n * 0.82)));
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
    const headBuffer = options.headBuffer ?? 0.1;
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
    const maxBodyZ = groundZ + 2.3;
    const minWheelZ = groundZ + 0.08;
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
          if (Math.abs(ly) <= 0.22) {
            wheelPts.push({ lx, ly, z: p.z });
          }
        }
      }
    }
    let rawPts = corePts;
    if (corePts.length < 8 && wheelPts.length > 0) {
      rawPts = [...corePts, ...wheelPts];
    }
    const isSparse = rawPts.length <= 12;
    const maxClusteringGap = isSparse ? 0.28 : 0.16;
    const clusterLy = filterDenseConnectedCluster1D(rawPts, "ly", maxClusteringGap, 0);
    const bodyPts = filterDenseConnectedCluster1D(clusterLy, "lx", maxClusteringGap, 0);
    let newCenterX = cx;
    let newCenterY = cy;
    let newCenterZ = cz;
    let newYawRad = yaw;
    let newYawDeg = radToDeg(yaw);
    let deltaYawDeg = 0;
    let newL = curL;
    let newW = curW;
    let newH = curH;
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
    const highestPtZ = allZ[allZ.length - 1];
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
      let shiftLx = 0;
      let bumperLabel = "Đón tia";
      if (options.egoPos) {
        const dxEgo = options.egoPos.x - cx;
        const dyEgo = options.egoPos.y - cy;
        const lxEgo = dxEgo * Math.cos(-yaw) - dyEgo * Math.sin(-yaw);
        if (lxEgo > 0.4) {
          shiftLx = lxMax - curL / 2;
          bumperLabel = "Cản trước";
        } else if (lxEgo < -0.4) {
          shiftLx = lxMin + curL / 2;
          bumperLabel = "Cản sau";
        } else {
          shiftLx = (lxMin + lxMax) / 2;
          bumperLabel = "Cân đối";
        }
      } else {
        const frontCount = bodyPts.filter((p) => p.lx > 0).length;
        const rearCount = bodyPts.filter((p) => p.lx <= 0).length;
        if (frontCount > rearCount * 1.5) {
          shiftLx = lxMax - curL / 2;
          bumperLabel = "Cản trước";
        } else if (rearCount > frontCount * 1.5) {
          shiftLx = lxMin + curL / 2;
          bumperLabel = "Cản sau";
        } else {
          shiftLx = (lxMin + lxMax) / 2;
          bumperLabel = "Cân đối";
        }
      }
      shiftLx = Math.max(-0.45, Math.min(0.45, shiftLx));
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
      let visibleSide;
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
      const edgePadding = 0.05;
      let shiftLy = 0;
      if (lyMin <= -0.06 && lyMax >= 0.06) {
        shiftLy = (lyMin + lyMax) / 2;
      } else if (visibleSide === "left") {
        shiftLy = lyMax + edgePadding - curW / 2;
      } else {
        shiftLy = lyMin - edgePadding + curW / 2;
      }
      shiftLy = Math.max(-0.35, Math.min(0.35, shiftLy));
      newCenterX = Number((cx - shiftLy * Math.sin(yaw)).toFixed(3));
      newCenterY = Number((cy + shiftLy * Math.cos(yaw)).toFixed(3));
      const deltaYSign = shiftLy >= 0 ? "+" : "";
      const sideText = visibleSide === "left" ? "Sườn Trái" : "Sườn Phải";
      msg = `Đã căn FRONT Xe 2 bánh: [${sideText}] đón tia ăn khít phương W (ΔY: ${deltaYSign}${(shiftLy * 100).toFixed(1)}cm), giữ nguyên cao độ Z và kích thước (chuẩn Car)`;
    } else if (step === "w") {
      newYawRad = yaw;
      newYawDeg = radToDeg(yaw);
      deltaYawDeg = 0;
      newL = curL;
      newH = curH;
      newCenterZ = cz;
      let shiftLy = 0;
      let measuredW = curW;
      if (lyMin <= -0.06 && lyMax >= 0.06) {
        measuredW = lyMax - lyMin + 0.16;
        shiftLy = (lyMin + lyMax) / 2;
        shiftLy = Math.max(-0.35, Math.min(0.35, shiftLy));
      } else if (lyMax > 0 && lyMin > -0.06) {
        measuredW = 2 * (lyMax + 0.1);
        shiftLy = 0;
      } else if (lyMin < 0 && lyMax < 0.06) {
        measuredW = 2 * (Math.abs(lyMin) + 0.1);
        shiftLy = 0;
      } else {
        measuredW = lyMax - lyMin + 0.16;
        shiftLy = (lyMin + lyMax) / 2;
        shiftLy = Math.max(-0.35, Math.min(0.35, shiftLy));
      }
      if (measuredW > 0.95) {
        newW = 0.95;
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
        newW = Number(Math.max(0.55, Math.min(0.95, measuredW)).toFixed(2));
      }
      shiftLy = Math.max(-0.35, Math.min(0.35, shiftLy));
      newCenterX = Number((cx - shiftLy * Math.sin(yaw)).toFixed(3));
      newCenterY = Number((cy + shiftLy * Math.cos(yaw)).toFixed(3));
      const deltaYSign = shiftLy >= 0 ? "+" : "";
      msg = `Đã fit Rộng (W) Xe 2 bánh: W=${newW}m (Đệm +5cm bắt trọn gương/tay lái), căn Y: ${deltaYSign}${(shiftLy * 100).toFixed(1)}cm, giữ nguyên L, H & Z`;
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
      const roofTopZ2 = highestPtZ + Math.max(0.12, headBuffer);
      newH = Number(Math.max(1.15, Math.min(2.2, roofTopZ2 - effectiveBaseZ)).toFixed(2));
      newCenterZ = Number((effectiveBaseZ + newH / 2).toFixed(3));
      msg = `Đã fit Cao (H) Xe 2 bánh: H=${newH}m (Đáy bám sàn Z=${effectiveBaseZ.toFixed(2)}m cố định, nở lên nóc +12cm), giữ nguyên L, W & XY`;
    } else {
      const headingRes = estimateTwoWheelerHeading(bodyPts, yaw);
      newYawRad = headingRes.newYawRad;
      newYawDeg = headingRes.newYawDeg;
      deltaYawDeg = headingRes.deltaYawDeg;
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
      newW = Number(Math.max(0.55, Math.min(0.95, measuredW)).toFixed(2));
      roofTopZ = highestPtZ + headBuffer;
      newH = Number(Math.max(1.15, Math.min(2.2, roofTopZ - groundZ)).toFixed(2));
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
    return fitTwoWheelerBox(pts, cx, cy, cz, yaw, curL, curW, curH, options, step);
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
    globalThis.fitBoxToEgoRayAndGround = fitBoxToEgoRayAndGround;
    globalThis.fitPedestrianBox = fitPedestrianBox;
    globalThis.fitPedestrianLength = fitPedestrianLength;
    globalThis.fitPedestrianWidth = fitPedestrianWidth;
    globalThis.fitPedestrianHeight = fitPedestrianHeight;
    globalThis.fitCyclistBox = fitCyclistBox;
    globalThis.fitTwoWheelerBox = fitTwoWheelerBox;
    globalThis.estimateTwoWheelerHeading = estimateTwoWheelerHeading;
    globalThis.estimateEgoRoadGroundZ = estimateEgoRoadGroundZ;
    globalThis.computeGroundSlopesAndZ = computeGroundSlopesAndZ;
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
    window.computeGroundSlopesAndZ = computeGroundSlopesAndZ;
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
    function getEgoRoadGroundZInMainWorld(egoPos = { x: 0, y: 0, z: 0 }) {
      const lidar = getSceneLidarPoints();
      if (!lidar || lidar.count === 0) return 0;
      const { count, array } = lidar;
      const minRSq = 1.2 * 1.2;
      const maxRSq = 6 * 6;
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
      if (zArr.length < 8) return 0;
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
          groundZ: 0,
          pitchRad: 0,
          rollRad: 0,
          pitchDeg: 0,
          rollDeg: 0,
          groundPointsCount: 0,
          isFallbackZeroGround: true
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
      if (groundPts.length < 6) {
        return {
          groundZ: Number(resolvedEgoRoadZ.toFixed(3)),
          pitchRad: 0,
          rollRad: 0,
          pitchDeg: 0,
          rollDeg: 0,
          groundPointsCount: groundPts.length,
          isFallbackZeroGround: true,
          isCurbGround: false
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
      const p12Idx = Math.max(0, Math.floor(validPts.length * 0.12));
      const lowestRoadZ = validPts[p12Idx].z;
      const leftPtsZ = validPts.filter((p) => p.ly > 0.15).map((p) => p.z).sort((a2, b2) => a2 - b2);
      const rightPtsZ = validPts.filter((p) => p.ly < -0.15).map((p) => p.z).sort((a2, b2) => a2 - b2);
      let isCurbOrRamp = lockRollFlat === true;
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
        const W = halfW * 2;
        const edgeRightPts = validPts.filter(
          (p) => p.ly >= -halfW - 0.45 && p.ly <= -halfW + W * 0.2
        );
        const edgeLeftPts = validPts.filter(
          (p) => p.ly >= halfW - W * 0.2 && p.ly <= halfW + 0.45
        );
        if (edgeRightPts.length >= 2 && edgeLeftPts.length >= 2) {
          const aSlope = -Math.tan(pitchRad);
          const zRightTrans = edgeRightPts.map((p) => p.z - aSlope * p.lx).sort((a2, b2) => a2 - b2);
          const zLeftTrans = edgeLeftPts.map((p) => p.z - aSlope * p.lx).sort((a2, b2) => a2 - b2);
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
          rollRad = 0;
        }
      }
      let isCurbGround = false;
      const refEgoZ = getEgoRoadGroundZInMainWorld();
      if (!isCurbOrRamp && refEgoZ !== 0) {
        if (c0 >= refEgoZ + 0.08 && c0 <= refEgoZ + 0.35) {
          isCurbGround = true;
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
        isCurbGround
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
      const maxDist = nominalHalf + maxSearchExt;
      const numBins = Math.ceil(maxDist / binSize) + 2;
      const bins = Array.from({ length: numBins }, () => []);
      for (const p of candidatePts) {
        const dist = isPos ? p[axis] : -p[axis];
        if (dist >= 0 && dist <= maxDist) {
          const bIdx = Math.min(numBins - 1, Math.floor(dist / binSize));
          bins[bIdx].push(p);
        }
      }
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
          peakDensity: 0
        };
      }
      const minWallDensity = Math.max(2, Math.floor(maxCount * 0.15));
      let outerWallBin = peakBin;
      let consecutiveEmptyBins = 0;
      for (let b = peakBin + 1; b < numBins; b++) {
        const ptsInBin = bins[b];
        const count = ptsInBin.length;
        if (count === 0) {
          consecutiveEmptyBins++;
          if (consecutiveEmptyBins >= 2) {
            break;
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
      const collectedWallPoints = [];
      for (let b = 0; b <= outerWallBin; b++) {
        for (const p of bins[b]) {
          collectedWallPoints.push(p);
        }
      }
      const outerEdgePts = [];
      const edgeStartBin = Math.max(0, outerWallBin - 3);
      for (let b = edgeStartBin; b <= outerWallBin; b++) {
        for (const p of bins[b]) {
          outerEdgePts.push(p);
        }
      }
      if (outerEdgePts.length >= 3) {
        const dists = outerEdgePts.map((p) => isPos ? p[axis] : -p[axis]).sort((a, b) => a - b);
        const pIdx = Math.max(0, Math.min(dists.length - 1, Math.floor(dists.length * 0.95)));
        const chosenDist = dists[pIdx];
        const edge2 = isPos ? Number(chosenDist.toFixed(3)) : Number((-chosenDist).toFixed(3));
        return {
          edge: edge2,
          wallPoints: collectedWallPoints,
          peakDensity: maxCount
        };
      }
      const fallbackDist = (outerWallBin + 1) * binSize;
      const edge = isPos ? Number(fallbackDist.toFixed(3)) : Number((-fallbackDist).toFixed(3));
      return {
        edge,
        wallPoints: collectedWallPoints.length > 0 ? collectedWallPoints : candidatePts,
        peakDensity: maxCount
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
          if (isLeft) {
            const sortedLy = inSlice.map((p) => p.ly).sort((a, b) => a - b);
            const pIdx = Math.max(0, Math.floor(sortedLy.length * 0.9));
            const medianLx = (minLx + maxLx) / 2;
            slicePoints.push({ lx: medianLx, ly: sortedLy[pIdx] });
          } else {
            const sortedLy = inSlice.map((p) => p.ly).sort((a, b) => a - b);
            const pIdx = Math.min(sortedLy.length - 1, Math.floor(sortedLy.length * 0.1));
            const medianLx = (minLx + maxLx) / 2;
            slicePoints.push({ lx: medianLx, ly: sortedLy[pIdx] });
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
      const slopes = [];
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
          rawBodyPts.push({ x, y, z, lx, ly });
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
      const preserveDimensions = options.preserveDimensions ?? true;
      const validBodyPts = bodyPts.length >= 4 ? bodyPts : denseCorePts.length >= 4 ? denseCorePts : rawBodyPts;
      if (validBodyPts.length >= 4) {
        const computeSideShift = (pts, targetL, targetW, currentYaw, center_x, center_y, ego_pos) => {
          const toEgoX = ego_pos.x - center_x;
          const toEgoY = ego_pos.y - center_y;
          const egoLocalX = toEgoX * Math.cos(currentYaw) + toEgoY * Math.sin(currentYaw);
          const frontBumperPts = pts.filter((p) => p.lx > 0.05);
          const rearBumperPts = pts.filter((p) => p.lx < -0.05);
          let visibleBumper;
          if (frontBumperPts.length >= rearBumperPts.length + 3) {
            visibleBumper = "front";
          } else if (rearBumperPts.length >= frontBumperPts.length + 3) {
            visibleBumper = "rear";
          } else {
            visibleBumper = egoLocalX >= 0 ? "front" : "rear";
          }
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
          const edgePadding = options.edgePadding ?? 0.05;
          let sLx = 0;
          if (visibleBumper === "front") {
            sLx = bumperEdge + edgePadding - targetL / 2;
          } else {
            sLx = bumperEdge - edgePadding + targetL / 2;
          }
          const maxShiftL = Math.min(0.4, targetL * 0.25);
          sLx = Math.max(-maxShiftL, Math.min(maxShiftL, sLx));
          if (Math.abs(sLx) < 0.01) sLx = 0;
          return { shiftLx: sLx, visibleBumper };
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
      const headBuffer = options.headBuffer ?? 0.12;
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
      const maxBodyZ = groundZ + 2.3;
      const minFootZ = groundZ + 0.08;
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
        if (Math.abs(lx) <= outerL && Math.abs(ly) <= outerW) {
          if (z >= minCoreZ) {
            coreBodyPts.push({ lx, ly, z });
          } else {
            if (Math.abs(lx) <= 0.28 && Math.abs(ly) <= 0.28) {
              footPts.push({ lx, ly, z });
            }
          }
        }
      }
      let rawBodyPts = coreBodyPts;
      if (coreBodyPts.length < 8 && footPts.length > 0) {
        rawBodyPts = [...coreBodyPts, ...footPts];
      }
      const isSparse = rawBodyPts.length <= 12;
      const maxClusteringGap = isSparse ? 0.25 : 0.14;
      const clusterLy = filterDenseConnectedCluster1D2(rawBodyPts, "ly", maxClusteringGap, 0);
      const bodyPts = filterDenseConnectedCluster1D2(clusterLy, "lx", maxClusteringGap, 0);
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
      const pMinIdx = !isSparse && bodyPts.length >= 8 ? Math.floor(bodyPts.length * 0.02) : 0;
      const pMaxIdx = !isSparse && bodyPts.length >= 8 ? Math.floor(bodyPts.length * 0.98) : bodyPts.length - 1;
      const lxMin = allLx[pMinIdx];
      const lxMax = allLx[pMaxIdx];
      const lyMin = allLy[pMinIdx];
      const lyMax = allLy[pMaxIdx];
      const highestPtZ = allZ[allZ.length - 1];
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
        let bumperName = "Đón tia";
        if (options.egoPos) {
          const dxEgo = options.egoPos.x - cx;
          const dyEgo = options.egoPos.y - cy;
          const lxEgo = dxEgo * Math.cos(-yaw) - dyEgo * Math.sin(-yaw);
          if (lxEgo > 0.15) {
            shiftLx = lxMax + 0.01 - curL / 2;
            bumperName = "Mặt trước";
          } else if (lxEgo < -0.15) {
            shiftLx = lxMin - 0.01 + curL / 2;
            bumperName = "Mặt sau";
          } else {
            shiftLx = (lxMin + lxMax) / 2;
            bumperName = "Cân đối";
          }
        } else {
          const frontCount = bodyPts.filter((p) => p.lx > 0).length;
          const rearCount = bodyPts.filter((p) => p.lx <= 0).length;
          if (frontCount > rearCount * 1.5) {
            shiftLx = lxMax + 0.01 - curL / 2;
            bumperName = "Mặt trước";
          } else if (rearCount > frontCount * 1.5) {
            shiftLx = lxMin - 0.01 + curL / 2;
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
        newYaw = yaw;
        newYawDeg = curYawDeg;
        deltaYawDeg = 0;
        newL = curL;
        newW = curW;
        newH = curH;
        newZ = cz;
        let visibleSide = "center";
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
          shiftLy = lyMax + 0.01 - curW / 2;
        } else if (visibleSide === "right") {
          shiftLy = lyMin - 0.01 + curW / 2;
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
        newYaw = yaw;
        newYawDeg = curYawDeg;
        deltaYawDeg = 0;
        newW = curW;
        newH = curH;
        newZ = cz;
        const spanL = lxMax - lxMin + 0.08;
        let shiftLx = 0;
        if (spanL > 0.8) {
          newL = 0.8;
          if (options.egoPos) {
            const dxEgo = options.egoPos.x - cx;
            const dyEgo = options.egoPos.y - cy;
            const lxEgo = dxEgo * Math.cos(-yaw) - dyEgo * Math.sin(-yaw);
            if (lxEgo > 0.15) {
              shiftLx = lxMax + 0.01 - newL / 2;
            } else if (lxEgo < -0.15) {
              shiftLx = lxMin - 0.01 + newL / 2;
            } else {
              shiftLx = (lxMin + lxMax) / 2;
            }
          } else {
            shiftLx = (lxMin + lxMax) / 2;
          }
        } else {
          newL = Number(Math.max(0.35, Math.min(0.8, spanL)).toFixed(2));
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
        const spanW = lyMax - lyMin + 0.08;
        let shiftLy = 0;
        if (spanW > 0.75) {
          newW = 0.75;
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
          newW = Number(Math.max(0.35, Math.min(0.75, spanW)).toFixed(2));
          shiftLy = (lyMin + lyMax) / 2;
        }
        shiftLy = Math.max(-0.35, Math.min(0.35, shiftLy));
        newX = Number((cx - shiftLy * Math.sin(yaw)).toFixed(3));
        newY = Number((cy + shiftLy * Math.cos(yaw)).toFixed(3));
        const signY = shiftLy >= 0 ? "+" : "";
        msg = `Đã fix Chiều Rộng (W) Người đi bộ: W=${newW}m (căn tâm Y: ${signY}${(shiftLy * 100).toFixed(1)}cm, kháng ghosting), giữ nguyên L, H & Z`;
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
        const roofTopZ = highestPtZ + Math.max(0.12, headBuffer);
        newH = Number(Math.max(1, Math.min(2.15, roofTopZ - effectiveBaseZ)).toFixed(2));
        newZ = Number((effectiveBaseZ + newH / 2).toFixed(3));
        msg = `Đã fix Chiều Cao (H) Người đi bộ: H=${newH}m (Đáy bám sàn Z=${effectiveBaseZ.toFixed(2)}m cố định, nở lên đỉnh đầu +12cm), giữ nguyên L, W & XY`;
      } else {
        const spanL = lxMax - lxMin + 0.08;
        newL = Number(Math.max(0.4, Math.min(0.8, spanL)).toFixed(2));
        const spanW = lyMax - lyMin + 0.08;
        newW = Number(Math.max(0.4, Math.min(0.75, spanW)).toFixed(2));
        const roofTopZ = highestPtZ + headBuffer;
        newH = Number(Math.max(1.05, Math.min(2.15, roofTopZ - groundZ)).toFixed(2));
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
      const headBuffer = options.headBuffer ?? 0.1;
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
      const maxBodyZ = groundZ + 2.3;
      const minWheelZ = groundZ + 0.08;
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
        if (Math.abs(lx) <= outerL && Math.abs(ly) <= outerW) {
          if (z >= minCoreZ) {
            corePts.push({ lx, ly, z });
          } else {
            if (Math.abs(ly) <= 0.22) {
              wheelPts.push({ lx, ly, z });
            }
          }
        }
      }
      let rawPts = corePts;
      if (corePts.length < 8 && wheelPts.length > 0) {
        rawPts = [...corePts, ...wheelPts];
      }
      const isSparse = rawPts.length <= 12;
      const maxClusteringGap = isSparse ? 0.28 : 0.16;
      const clusterLy = filterDenseConnectedCluster1D2(rawPts, "ly", maxClusteringGap, 0);
      const bodyPts = filterDenseConnectedCluster1D2(clusterLy, "lx", maxClusteringGap, 0);
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
      const pMinIdx = !isSparse && bodyPts.length >= 30 ? Math.floor(bodyPts.length * 0.015) : 0;
      const pMaxIdx = !isSparse && bodyPts.length >= 30 ? Math.min(bodyPts.length - 1, Math.floor(bodyPts.length * 0.985)) : bodyPts.length - 1;
      const lxMin = allLx[pMinIdx];
      const lxMax = allLx[pMaxIdx];
      const lyMin = allLy[pMinIdx];
      const lyMax = allLy[pMaxIdx];
      const highestPtZ = allZ[allZ.length - 1];
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
        let visibleSide;
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
        const edgePadding = 0.05;
        let shiftLy = 0;
        if (lyMin <= -0.06 && lyMax >= 0.06) {
          shiftLy = (lyMin + lyMax) / 2;
        } else if (visibleSide === "left") {
          shiftLy = lyMax + edgePadding - curW / 2;
        } else {
          shiftLy = lyMin - edgePadding + curW / 2;
        }
        shiftLy = Math.max(-0.35, Math.min(0.35, shiftLy));
        newX = Number((cx - shiftLy * Math.sin(yaw)).toFixed(3));
        newY = Number((cy + shiftLy * Math.cos(yaw)).toFixed(3));
        const signY = shiftLy >= 0 ? "+" : "";
        const sideText = visibleSide === "left" ? "Sườn Trái" : "Sườn Phải";
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
          measuredW = lyMax - lyMin + 0.16;
          shiftLy = (lyMin + lyMax) / 2;
          shiftLy = Math.max(-0.35, Math.min(0.35, shiftLy));
        } else if (lyMax > 0 && lyMin > -0.06) {
          measuredW = 2 * (lyMax + 0.1);
          shiftLy = 0;
        } else if (lyMin < 0 && lyMax < 0.06) {
          measuredW = 2 * (Math.abs(lyMin) + 0.1);
          shiftLy = 0;
        } else {
          measuredW = lyMax - lyMin + 0.16;
          shiftLy = (lyMin + lyMax) / 2;
          shiftLy = Math.max(-0.35, Math.min(0.35, shiftLy));
        }
        if (measuredW > 0.95) {
          newW = 0.95;
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
          newW = Number(Math.max(0.55, Math.min(0.95, measuredW)).toFixed(2));
        }
        shiftLy = Math.max(-0.35, Math.min(0.35, shiftLy));
        newX = Number((cx - shiftLy * Math.sin(yaw)).toFixed(3));
        newY = Number((cy + shiftLy * Math.cos(yaw)).toFixed(3));
        const signY = shiftLy >= 0 ? "+" : "";
        msg = `Đã fit Rộng (W) Xe 2 bánh: W=${newW}m (Đệm +5cm bắt trọn gương/tay lái), căn Y: ${signY}${(shiftLy * 100).toFixed(1)}cm, giữ nguyên L, H & Z`;
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
        const roofTopZ = highestPtZ + Math.max(0.12, headBuffer);
        newH = Number(Math.max(1.15, Math.min(2.2, roofTopZ - effectiveBaseZ)).toFixed(2));
        newZ = Number((effectiveBaseZ + newH / 2).toFixed(3));
        msg = `Đã fit Cao (H) Xe 2 bánh: H=${newH}m (Đáy bám sàn Z=${effectiveBaseZ.toFixed(2)}m cố định, nở lên nóc +12cm), giữ nguyên L, W & XY`;
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
        newW = Number(Math.max(0.55, Math.min(0.95, measuredW)).toFixed(2));
        const roofTopZ = highestPtZ + headBuffer;
        newH = Number(Math.max(1.15, Math.min(2.2, roofTopZ - groundZ)).toFixed(2));
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
      const groundInfo = detectAccurateGroundZ(cx, cy, cz, yaw, l / 2, w / 2, h / 2, isInitialBox, false);
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
    function setupCanvasAutoSelect() {
      if (isCanvasAutoSelectAttached) return;
      isCanvasAutoSelectAttached = true;
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
          let activeDebounceTimer = null;
          let dirtyDebounceTimer = null;
          store.subscribe(() => {
            var _a, _b, _c, _d;
            try {
              const anno = (_a = store.getState()) == null ? void 0 : _a.annotation;
              const curActiveId = (_b = anno == null ? void 0 : anno.annotations) == null ? void 0 : _b.activatedStateClientID;
              const curStatesLen = ((_d = (_c = anno == null ? void 0 : anno.annotations) == null ? void 0 : _c.states) == null ? void 0 : _d.length) || 0;
              if (curActiveId !== prevActiveId) {
                prevActiveId = curActiveId;
                if (curActiveId !== null && curActiveId !== void 0) {
                  if (activeDebounceTimer) clearTimeout(activeDebounceTimer);
                  activeDebounceTimer = setTimeout(() => {
                    activeDebounceTimer = null;
                    const details = extractObjectDetails(Number(curActiveId));
                    window.dispatchEvent(
                      new CustomEvent("CVAT_EXT_RES_OBJECT_ACTIVATED", {
                        detail: { clientId: Number(curActiveId), details }
                      })
                    );
                  }, 80);
                }
              }
              if (curStatesLen !== prevStatesLen) {
                prevStatesLen = curStatesLen;
                if (dirtyDebounceTimer) clearTimeout(dirtyDebounceTimer);
                dirtyDebounceTimer = setTimeout(() => {
                  dirtyDebounceTimer = null;
                  window.dispatchEvent(new CustomEvent("CVAT_EXT_RES_FRAME_TRACKS_DIRTY"));
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
        const { clientId } = e.detail || {};
        if (!clientId) return;
        try {
          const store = getReduxStore();
          const canvas = (_c = (_b = (_a = store == null ? void 0 : store.getState()) == null ? void 0 : _a.annotation) == null ? void 0 : _b.canvas) == null ? void 0 : _c.instance;
          if (canvas && typeof canvas.activate === "function") {
            const curActive = ((_d = canvas.view) == null ? void 0 : _d.activatedElementID) || ((_g = (_f = (_e = store == null ? void 0 : store.getState()) == null ? void 0 : _e.annotation) == null ? void 0 : _f.annotations) == null ? void 0 : _g.activatedStateClientID);
            if (curActive !== clientId) {
              canvas.activate(clientId);
              if (typeof canvas.render === "function") {
                canvas.render();
              }
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
        markCvatSaveButtonUnsaved();
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
          const curL = newPoints[6] || 4.6;
          const curW2 = newPoints[7] || 1.85;
          const groundInfo = detectAccurateGroundZ(curX, curY, curZ, curRz, curL / 2, curW2 / 2, curH / 2, false, false);
          if (groundInfo.isFallbackZeroGround || groundInfo.groundPointsCount < 6) {
            const baseZ = groundInfo.groundZ !== null ? groundInfo.groundZ : 0;
            newRotX = 0;
            newRotY = 0;
            newZ = Number((baseZ + curH / 2).toFixed(3));
            msg = `Dưới chân ít điểm LiDAR (${groundInfo.groundPointsCount} điểm) ➔ Neo đáy xe theo mốc Ego Road Z: ${baseZ}m (Tâm Z: ${newZ}m, Khóa Roll 0°, Pitch 0°)`;
          } else if (groundInfo.groundZ !== null) {
            const cosPitch = Math.cos(groundInfo.pitchRad);
            const cosRoll = Math.cos(groundInfo.rollRad);
            newZ = Number((groundInfo.groundZ + curH / 2 * cosPitch * cosRoll).toFixed(3));
            newRotX = groundInfo.rollRad;
            newRotY = groundInfo.pitchRad;
            if (groundInfo.isCurbGround) {
              msg = `Đã nhận diện xe #${uiId} đỗ trên nền vỉa hè (Z đất: ${groundInfo.groundZ}m, Tâm Z: ${newZ}m, Khóa Roll: ${groundInfo.rollDeg}°)`;
            } else {
              msg = `Đã ghim đáy xe #${uiId} bám sát mặt đường (Z: ${newZ}m, Roll: ${groundInfo.rollDeg}°, Pitch: ${groundInfo.pitchDeg}°)`;
            }
          } else {
            const egoZ = getEgoRoadGroundZInMainWorld();
            newRotX = 0;
            newRotY = 0;
            newZ = Number((egoZ + curH / 2).toFixed(3));
            msg = `Không có điểm mặt đất ➔ Neo theo mốc Ego Road Z: ${egoZ}m (Tâm Z: ${newZ}m)`;
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
      var _a, _b, _c;
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
              await parentTrack.save();
            }
          }
        }
        if (countModified === 0) {
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
                  previousStates.push({
                    frame: f,
                    outside: !!st.outside,
                    points: Array.isArray(st.points) ? [...st.points] : []
                  });
                  st.outside = !!outside;
                  if (typeof st.save === "function") {
                    await st.save();
                  }
                  countModified++;
                }
              }
            } catch (e2) {
            }
          }
        }
        if (countModified === 0 && currentTarget) {
          previousStates.push({
            frame: currentFrame,
            outside: !!currentTarget.outside,
            points: Array.isArray(currentTarget.points) ? [...currentTarget.points] : []
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
        const canvas = (_c = (_b = (_a = store == null ? void 0 : store.getState()) == null ? void 0 : _a.annotation) == null ? void 0 : _b.canvas) == null ? void 0 : _c.instance;
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
      var _a, _b, _c;
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
        markCvatSaveButtonUnsaved();
        const store = getReduxStore();
        const canvas = (_c = (_b = (_a = store == null ? void 0 : store.getState()) == null ? void 0 : _a.annotation) == null ? void 0 : _b.canvas) == null ? void 0 : _c.instance;
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
      const { jobId, frame, uiId, serverId, deltaXLocal = 0, deltaYLocal = 0, applyToTrack = false } = e.detail || {};
      try {
        const job = await getActiveJobInstance(jobId);
        const { target, isDrawn } = await findTargetSafely(job, frame, uiId, serverId);
        const yaw = target.points[5] || 0;
        const cosYaw = Math.cos(yaw);
        const sinYaw = Math.sin(yaw);
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
  }
  class CVATBridge {
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
     * Ưu tiên 3: REST API fallback an toàn.
     */
    static async getTracksInCurrentFrame(jobId, frame) {
      var _a;
      this.ensureMainWorldBridge();
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
      try {
        const win = window;
        if ((_a = win.cvat) == null ? void 0 : _a.jobs) {
          const jobs = await win.cvat.jobs.get({ jobID: jobId });
          if (jobs && jobs.length > 0) {
            const states = await jobs[0].annotations.get(frame);
            if (Array.isArray(states)) {
              const list = states.filter((s) => s.shapeType === "cuboid" && Array.isArray(s.points) && s.points.length >= 9).map((s) => {
                var _a2;
                return {
                  uiId: s.clientID,
                  serverId: s.serverID,
                  label: ((_a2 = s.label) == null ? void 0 : _a2.name) || "Car",
                  x: Number(s.points[0].toFixed(2)),
                  y: Number(s.points[1].toFixed(2)),
                  z: Number(s.points[2].toFixed(3)),
                  yawDeg: Math.round(s.points[5] * 180 / Math.PI),
                  l: Number(s.points[6].toFixed(2)),
                  w: Number(s.points[7].toFixed(2)),
                  h: Number(s.points[8].toFixed(2))
                };
              });
              return list;
            }
          }
        }
      } catch (sdkErr) {
      }
      try {
        const data = await this.fetchJobAnnotations(jobId);
        const tracks = data.tracks || [];
        const result = [];
        tracks.forEach((t, index) => {
          var _a2;
          const shapes = Array.isArray(t.shapes) ? t.shapes : [];
          const matchShape = shapes.find((s) => s.frame === frame && s.type === "cuboid");
          if (matchShape && Array.isArray(matchShape.points) && matchShape.points.length >= 9) {
            const p = matchShape.points;
            const label = t.label_name || ((_a2 = t.attributes) == null ? void 0 : _a2.label) || `Track #${index + 1}`;
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
              h: Number(p[8].toFixed(2))
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
     * Vi chỉnh Center theo trục cục bộ của xe (deltaXLocal dọc xe, deltaYLocal ngang xe).
     * Hỗ trợ dịch chuyển dàn đều cho toàn bộ track (applyToTrack = true).
     */
    static async shiftTrackCenter(jobId, uiId, serverId, deltaXLocal, deltaYLocal, applyToTrack) {
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
              applyToTrack
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
        framesShifted: mwRes.framesShifted,
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
  }
  __publicField(CVATBridge, "cachedAnnotations", null);
  __publicField(CVATBridge, "cachedJobId", null);
  __publicField(CVATBridge, "lastFetchTime", 0);
  __publicField(CVATBridge, "isBridgeInjected", false);
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
      this.overlay.setAttribute("translate", "no");
      this.overlay.classList.add("notranslate");
      this.overlay.style.position = "fixed";
      this.overlay.style.inset = "0";
      this.overlay.style.zIndex = "999999";
      this.overlay.style.background = "rgba(255, 255, 255, 0.98)";
      this.overlay.style.backdropFilter = "blur(12px)";
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
      <!-- 1. HEADER BAR CHUYÊN NGHIỆP (LIGHT) -->
      <div style="
        background: #ffffff;
        border-bottom: 1px solid #e2e8f0;
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
            <span style="font-size: 14px; font-weight: bold; color: #09090b;">Job #${this.currentCtx.jobId}</span>
          </div>

          <!-- Tab Switcher -->
          <div style="display: flex; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 6px; padding: 2px;">
            <button id="studio-tab-active" style="
              border: none;
              background: ${this.currentTab === "active_track" ? "#ffffff" : "transparent"};
              color: ${this.currentTab === "active_track" ? "#09090b" : "#64748b"};
              box-shadow: ${this.currentTab === "active_track" ? "0 1px 3px rgba(0,0,0,0.08)" : "none"};
              padding: 5px 14px;
              font-size: 12px;
              font-weight: 600;
              cursor: pointer;
              border-radius: 4px;
              transition: all 0.15s;
            ">Duyệt Frame (Xe #${this.activeTrackId})</button>

            <button id="studio-tab-batch" style="
              border: none;
              background: ${this.currentTab === "batch_all" ? "#ffffff" : "transparent"};
              color: ${this.currentTab === "batch_all" ? "#09090b" : "#64748b"};
              box-shadow: ${this.currentTab === "batch_all" ? "0 1px 3px rgba(0,0,0,0.08)" : "none"};
              padding: 5px 14px;
              font-size: 12px;
              font-weight: 600;
              cursor: pointer;
              border-radius: 4px;
              transition: all 0.15s;
            ">Tất Cả Track ID (${allTracks.length})</button>
          </div>

          <!-- Quick Track Selector Dropdown & Switcher -->
          <div style="display: flex; align-items: center; gap: 4px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 2px 6px;">
            <span style="font-size: 11px; color: #64748b; font-weight: 600;">Track:</span>
            <select id="studio-quick-track-select" style="
              background: transparent;
              border: none;
              color: #0284c7;
              font-size: 12px;
              font-weight: bold;
              cursor: pointer;
              outline: none;
              padding: 3px 4px;
              max-width: 200px;
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
              background: #ffffff; border: 1px solid #cbd5e1; color: #334155; font-size: 11px; padding: 2px 7px; border-radius: 4px; cursor: pointer;
            ">◀</button>
            <button id="btn-quick-next-track" title="Xe sau (phím ])" style="
              background: #ffffff; border: 1px solid #cbd5e1; color: #334155; font-size: 11px; padding: 2px 7px; border-radius: 4px; cursor: pointer;
            ">▶</button>
          </div>

          <!-- Status Indicator -->
          <span style="
            font-size: 11px;
            font-family: ui-monospace, monospace;
            background: #ecfdf5;
            color: #059669;
            border: 1px solid #a7f3d0;
            padding: 2px 8px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            gap: 5px;
          ">
            <span style="width: 6px; height: 6px; background: #10b981; border-radius: 50%;"></span>
            <span>THREE.JS NATIVE CONNECTED</span>
          </span>
        </div>

        <!-- Right Action Controls -->
        <div style="display: flex; align-items: center; gap: 10px;">
          <!-- Nút Lưu vào CVAT (TUYỆT ĐỐI KHÔNG TỰ ĐỘNG AUTOSAVE NGẦM) -->
          <button id="btn-studio-commit-save" style="
            background: ${dirtyCount > 0 ? "#ea580c" : "#059669"};
            border: 1px solid ${dirtyCount > 0 ? "#ea580c" : "#059669"};
            color: white;
            font-size: 12px;
            font-weight: 600;
            padding: 6px 16px;
            border-radius: 6px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            box-shadow: 0 2px 8px ${dirtyCount > 0 ? "rgba(234, 88, 12, 0.25)" : "rgba(5, 150, 105, 0.25)"};
            transition: all 0.2s;
          ">
            <span style="display: flex; align-items: center;">${ICONS.save}</span>
            <span>${this.isSaving ? "Đang lưu..." : dirtyCount > 0 ? `Lưu vào CVAT (${dirtyCount} track)` : "Lưu vào CVAT"}</span>
            <span style="font-size: 10px; opacity: 0.85; font-family: monospace;">(Ctrl+S)</span>
          </button>

          <!-- Nút Đóng -->
          <button id="btn-studio-close" style="
            background: #f1f5f9;
            border: 1px solid #e2e8f0;
            color: #334155;
            font-size: 12px;
            font-weight: 600;
            padding: 6px 12px;
            border-radius: 6px;
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
            border-bottom: 1px solid #f1f5f9;
            background: ${isSelected ? "#eff6ff" : sh.outside ? "#f8fafc" : "transparent"};
            cursor: pointer;
            transition: background 0.12s;
          ">
            <!-- Cột 1: Frame Number -->
            <td style="padding: 10px 14px; font-weight: bold; font-family: monospace;">
              <span class="btn-jump-frame" data-frame="${f}" style="
                background: ${isSelected ? "#2563eb" : "#f1f5f9"};
                color: ${isSelected ? "white" : "#0284c7"};
                border: 1px solid ${isSelected ? "#2563eb" : "#cbd5e1"};
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
              <span style="background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; font-size: 10px; font-weight: bold; padding: 2px 6px; border-radius: 4px;">KF</span>
            </td>

            <!-- Cột 3: Outside Toggle -->
            <td style="padding: 10px 14px;">
              <button class="btn-toggle-outside" data-frame="${f}" style="
                border: 1px solid ${sh.outside ? "#fca5a5" : "#a7f3d0"};
                background: ${sh.outside ? "#fee2e2" : "#ecfdf5"};
                color: ${sh.outside ? "#dc2626" : "#059669"};
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
                <input class="input-shape-l" data-frame="${f}" type="number" step="0.02" value="${curL.toFixed(2)}" style="width: 58px; background: #f8fafc; border: 1px solid #cbd5e1; color: #0284c7; padding: 3px; border-radius: 4px; font-size: 11px; text-align: center; font-weight: 600;" />
                <span style="color: #94a3b8;">×</span>
                <input class="input-shape-w" data-frame="${f}" type="number" step="0.02" value="${curW.toFixed(2)}" style="width: 58px; background: #f8fafc; border: 1px solid #cbd5e1; color: #0284c7; padding: 3px; border-radius: 4px; font-size: 11px; text-align: center; font-weight: 600;" />
                <span style="color: #94a3b8;">×</span>
                <input class="input-shape-h" data-frame="${f}" type="number" step="0.02" value="${curH.toFixed(2)}" title="Đổi H giữ nguyên mặt đáy" style="width: 58px; background: #f8fafc; border: 1px solid #cbd5e1; color: #0284c7; padding: 3px; border-radius: 4px; font-size: 11px; text-align: center; font-weight: 600;" />
                <span style="color: #64748b; font-size: 10px;">m</span>
              </div>
            </td>

            <!-- Cột 5: Cao độ Z & Góc Yaw -->
            <td style="padding: 10px 8px; font-family: monospace;">
              <div style="display: flex; align-items: center; gap: 6px; font-size: 11px;">
                <span style="color: #64748b;">Z:</span>
                <input class="input-shape-z" data-frame="${f}" type="number" step="0.02" value="${curZ.toFixed(2)}" style="width: 54px; background: #f8fafc; border: 1px solid #cbd5e1; color: #09090b; padding: 3px; border-radius: 4px; font-size: 11px; text-align: center; font-weight: 600;" />
                <span style="color: #64748b;">Yaw:</span>
                <span style="color: #059669; font-weight: bold;">${curYawDeg}°</span>
              </div>
            </td>

            <!-- Cột 6: Thao tác từng frame -->
            <td style="padding: 10px 14px; text-align: right;">
              <button class="btn-snap-ground-single" data-frame="${f}" title="Hút đáy xe bám sát mặt đất tại frame này" style="
                background: #f0fdf4;
                border: 1px solid #bbf7d0;
                color: #15803d;
                font-size: 11px;
                font-weight: 600;
                padding: 4px 8px;
                border-radius: 4px;
                cursor: pointer;
              ">⇩ Đất</button>

              <button class="btn-apply-size-to-all" data-frame="${f}" title="Lấy kích thước L, W, H của frame này ép cho toàn bộ các frame khác" style="
                background: #ecfdf5;
                border: 1px solid #a7f3d0;
                color: #059669;
                font-size: 11px;
                font-weight: 600;
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
      <!-- Studio Toolbar (LIGHT) -->
      <div style="
        background: #f8fafc;
        border-bottom: 1px solid #e2e8f0;
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
            <span style="font-size: 14px; font-weight: bold; color: #09090b;">${track.labelName} #${track.uiId}</span>
            <span style="font-size: 11px; color: #64748b; font-family: monospace;">(${track.firstFrame} ➔ ${track.lastFrame}, ${track.shapes.length} frames)</span>
          </div>

          <div style="font-size: 12px; color: #334155; font-family: monospace; background: #ffffff; padding: 4px 10px; border-radius: 5px; border: 1px solid #e2e8f0;">
            Trung vị: <b style="color: #0284c7;">${medL.toFixed(2)} × ${medW.toFixed(2)} × ${medH.toFixed(2)}m</b>
          </div>
        </div>

        <!-- Batch Action Buttons For Active Track (FLAT ICONS) -->
        <div style="display: flex; align-items: center; gap: 8px;">
          <button id="btn-batch-snap-ground" style="
            background: #f0fdf4;
            border: 1px solid #bbf7d0;
            color: #15803d;
            font-size: 11px;
            font-weight: 600;
            padding: 5px 10px;
            border-radius: 5px;
            cursor: pointer;
          ">⇩ Ghim Đất Toàn Track</button>

          <button id="btn-batch-flip-yaw" style="
            background: #fffbeb;
            border: 1px solid #fde68a;
            color: #b45309;
            font-size: 11px;
            font-weight: 600;
            padding: 5px 10px;
            border-radius: 5px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 4px;
          ">
            <span style="display: flex; align-items: center;">${ICONS.rotate}</span>
            <span>Lật 180° Toàn Track</span>
          </button>

          <button id="btn-batch-median-size" style="
            background: #faf5ff;
            border: 1px solid #e9d5ff;
            color: #7e22ce;
            font-size: 11px;
            font-weight: 600;
            padding: 5px 10px;
            border-radius: 5px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 4px;
          ">
            <span style="display: flex; align-items: center;">${ICONS.filter}</span>
            <span>Làm Mịn Kích Thước (Median)</span>
          </button>
        </div>
      </div>

      <!-- Danh Sách Các Frame -->
      <div style="flex: 1; overflow: auto; padding: 12px 20px; background: #ffffff;">
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
          <thead>
            <tr style="border-bottom: 1px solid #e2e8f0; color: #64748b; font-weight: 600; font-size: 11px; background: #f8fafc;">
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
          <tr class="batch-track-row" data-track-id="${t.uiId}" style="border-bottom: 1px solid #f1f5f9; cursor: pointer; transition: background 0.15s; background: ${t.uiId === this.activeTrackId ? "#eff6ff" : t.dirty ? "#ecfdf5" : "transparent"};">
            <td style="padding: 10px 14px; font-weight: bold; color: #0284c7; font-family: monospace;">#${t.uiId}</td>
            <td style="padding: 10px 14px;">
              <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${t.labelColor}; margin-right: 6px;"></span>
              <span style="font-weight: 600; color: #09090b;">${t.labelName}</span>
            </td>
            <td style="padding: 10px 14px; font-family: monospace; color: #64748b;">f${t.firstFrame} ➔ f${t.lastFrame}</td>
            <td style="padding: 10px 14px; font-family: monospace; text-align: center; color: #334155;">${t.shapes.length}</td>
            <td style="padding: 10px 14px; font-family: monospace; color: #334155;">
              ${medL.toFixed(2)} / ${medW.toFixed(2)} / ${medH.toFixed(2)}m
              ${varies ? '<span style="margin-left: 6px; font-size: 10px; background: #ffedd5; color: #ea580c; border: 1px solid #fed7aa; padding: 1px 4px; border-radius: 3px; font-weight: 600;">không đều</span>' : ""}
            </td>
            <td style="padding: 10px 8px;">
              <input class="batch-inp-l" data-track-id="${t.uiId}" type="number" step="0.02" placeholder="${medL.toFixed(2)}" style="width: 58px; background: #f8fafc; border: 1px solid #cbd5e1; color: #0284c7; padding: 4px; border-radius: 4px; font-size: 11px; text-align: center; font-weight: 600;" />
            </td>
            <td style="padding: 10px 8px;">
              <input class="batch-inp-w" data-track-id="${t.uiId}" type="number" step="0.02" placeholder="${medW.toFixed(2)}" style="width: 58px; background: #f8fafc; border: 1px solid #cbd5e1; color: #0284c7; padding: 4px; border-radius: 4px; font-size: 11px; text-align: center; font-weight: 600;" />
            </td>
            <td style="padding: 10px 8px;">
              <input class="batch-inp-h" data-track-id="${t.uiId}" type="number" step="0.02" placeholder="${medH.toFixed(2)}" style="width: 58px; background: #f8fafc; border: 1px solid #cbd5e1; color: #0284c7; padding: 4px; border-radius: 4px; font-size: 11px; text-align: center; font-weight: 600;" />
            </td>
            <td style="padding: 10px 14px;">
              <button class="btn-batch-apply" data-track-id="${t.uiId}" style="background: #059669; border: none; color: white; padding: 5px 12px; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer;">Áp dụng</button>
              <button class="btn-batch-snap" data-track-id="${t.uiId}" style="margin-left: 4px; background: #f0fdf4; border: 1px solid #bbf7d0; color: #15803d; padding: 5px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer;">⇩ Đất</button>
            </td>
            <td style="padding: 10px 14px; text-align: right;">
              <button class="btn-open-studio-track" data-track-id="${t.uiId}" style="background: #2563eb; border: 1px solid #2563eb; color: white; padding: 5px 12px; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer;">Duyệt Frame ➔</button>
            </td>
          </tr>
        `;
      }).join("");
      return `
      <!-- Toolbar Tab 1 (LIGHT) -->
      <div style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 10px 20px; display: flex; align-items: center; justify-content: space-between;">
        <span style="font-size: 12px; color: #475569;">
          Áp dụng kích thước mới từ <b>Frame 0 ➔ Frame End</b> với <b>Ground-Lock 3D</b> (Đáy xe cố định tuyệt đối trên mặt đường).
        </span>
        <span style="font-size: 11px; color: #64748b; font-family: monospace;">
          Dữ liệu in-memory, chỉ lưu khi bấm nút "Lưu vào CVAT" (Ctrl+S)
        </span>
      </div>

      <!-- Bảng Danh Sách Xe (LIGHT) -->
      <div style="flex: 1; overflow: auto; padding: 12px 20px; background: #ffffff;">
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
          <thead>
            <tr style="border-bottom: 1px solid #e2e8f0; color: #64748b; font-weight: 600; font-size: 11px; background: #f8fafc;">
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
      __publicField(this, "updatePending", false);
      __publicField(this, "lastRenderedHash", "");
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
      }
      this.scheduleUpdate();
    }
    createContainer() {
      this.container = document.createElement("div");
      this.container.id = "cvat-3d-suite-floating";
      this.container.setAttribute("translate", "no");
      this.container.classList.add("notranslate");
      this.container.style.position = "fixed";
      this.container.style.top = "20px";
      this.container.style.right = "20px";
      this.container.style.width = "370px";
      this.container.style.maxHeight = "calc(100vh - 40px)";
      this.container.style.zIndex = "999995";
      this.container.style.fontFamily = "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      this.container.style.backgroundColor = "rgba(255, 255, 255, 0.98)";
      this.container.style.backdropFilter = "blur(16px)";
      this.container.style.border = "1px solid #e4e4e7";
      this.container.style.borderRadius = "16px";
      this.container.style.boxShadow = "0 20px 40px -15px rgba(0, 0, 0, 0.08), 0 0 1px 1px rgba(0, 0, 0, 0.04)";
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
          this.scheduleUpdate();
        } else if (clientId && clientId !== this.selectedUiId) {
          console.log(`[CVAT 3D Suite] Tự động chọn xe #${clientId} từ click Canvas 3D`);
          this.selectTrackByUiId(clientId, void 0, false);
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
          await this.selectTrackByUiId(active.id, void 0, false);
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
        this.scheduleUpdate();
      } else {
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
      if (activateCanvas) {
        CVATBridge.activateCanvasTrack(uiId);
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
      await this.pushUndoSnapshot(`Outside Toàn Track #${this.selectedUiId}`, true);
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
            `Đã đánh dấu ${outside ? "Outside" : "Inside"} cho ${res.count || "toàn bộ"} frame của Track #${this.selectedUiId}! Bấm Pre để hoàn tác.`,
            "success"
          );
          await this.syncFrameTracks();
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
      await this.pushUndoSnapshot("Cập nhật Kích Thước", applyToTrack);
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
        this.showToast("Vui lòng chọn xe trước!", "warning");
        return;
      }
      if (this.isProcessing) return;
      await this.pushUndoSnapshot(`Ghim Đất (${mode})`, false);
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
        this.showToast(res.message, "success");
      } catch (err) {
        this.showToast(`Lỗi: ${err.message || err}`, "error");
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
        this.applyToTrack
      ].join("|");
      if (stateHash === this.lastRenderedHash && this.container.children.length > 0) {
        return;
      }
      this.lastRenderedHash = stateHash;
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
                <span style="font-weight: 700; color: ${isSelected ? "#059669" : "#64748b"};">#${t.uiId}</span>
                <span style="color: ${isSelected ? "#047857" : "#0f172a"}; font-weight: 500;">${t.label}</span>
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

          <!-- VỈA HÈ & GÁC LỀ -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
            <button id="btn-snap-curb" style="
              background: #fffbeb;
              border: 1px solid #fde68a;
              color: #b45309;
              padding: 6px 8px;
              border-radius: 6px;
              font-size: 10px;
              font-weight: 600;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: space-between;
            ">
              <span style="display: flex; align-items: center; gap: 5px;">
                <span style="display: flex; align-items: center;">${ICONS.curb}</span>
                <span>Vỉa Hè +15cm</span>
              </span>
              <kbd style="font-size: 8px; font-family: monospace; background: #fef3c7; border: 1px solid #fde68a; padding: 1px 4px; border-radius: 3px; color: #92400e;">⌥G</kbd>
            </button>

            <button id="btn-snap-half-curb" style="
              background: #fff1f2;
              border: 1px solid #fecdd3;
              color: #be123c;
              padding: 6px 8px;
              border-radius: 6px;
              font-size: 10px;
              font-weight: 600;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: space-between;
            ">
              <span style="display: flex; align-items: center; gap: 5px;">
                <span style="display: flex; align-items: center;">${ICONS.layers}</span>
                <span>Gác Lề Roll</span>
              </span>
              <kbd style="font-size: 8px; font-family: monospace; background: #ffe4e6; border: 1px solid #fecdd3; padding: 1px 4px; border-radius: 3px; color: #9f1239;">⇧G</kbd>
            </button>
          </div>

          <!-- VI CHỈNH GÓC YAW -->
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <span style="font-size: 9px; color: #64748b; font-family: monospace; font-weight: 500;">Xoay góc Yaw:</span>
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

      <!-- MAIN CONTAINER BODY (LIGHT) -->
      <div style="
        padding: 10px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 8px;
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
              <button id="btn-fit-cyclist-w" title="Tự động đo mây điểm và fit riêng chiều rộng W (bắt trọn gương chiếu hậu, tay lái, đệm +5cm mỗi bên), giữ nguyên L, H và Z" style="
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
                justify-content: center;
                gap: 4px;
                transition: all 0.12s;
                box-shadow: 0 1px 2px rgba(0,0,0,0.03);
              ">
                <span style="display: flex; align-items: center; color: #d97706;">${ICONS.sparkles}</span>
                <span>Fit Rộng (W) [+5cm Pad]</span>
              </button>

              <!-- 2. NÚT FIT CAO H -->
              <button id="btn-fit-cyclist-h" title="Tự động đo đỉnh nón bảo hiểm và fit riêng chiều cao H (Mặt đáy tiếp đất giữ nguyên cố định 100%, nở lên nóc +12cm), giữ nguyên L, W và XY" style="
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
                justify-content: center;
                gap: 4px;
                transition: all 0.12s;
                box-shadow: 0 1px 2px rgba(0,0,0,0.03);
              ">
                <span style="display: flex; align-items: center; color: #ea580c;">${ICONS.arrowUpDown}</span>
                <span>Fit Cao (H) [Nở Nóc]</span>
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
              <button id="btn-fit-ped-w" title="Tự động đo và co giãn riêng Chiều Rộng W ôm vai/ngực (giữ nguyên L, H & Z)" style="
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
                justify-content: center;
                gap: 3px;
                transition: all 0.12s;
                box-shadow: 0 1px 2px rgba(0,0,0,0.03);
              ">
                <span style="display: flex; align-items: center; color: #9333ea;">${ICONS.sparkles}</span>
                <span>Fit Rộng (W)</span>
              </button>

              <!-- 3. NÚT FIX CAO H -->
              <button id="btn-fit-ped-h" title="Tự động đo đỉnh đầu và fit riêng Chiều Cao H (Đáy tiếp đất giữ nguyên cố định, đỉnh đầu nở lên +12cm), giữ nguyên L, W và XY" style="
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
                justify-content: center;
                gap: 3px;
                transition: all 0.12s;
                box-shadow: 0 1px 2px rgba(0,0,0,0.03);
              ">
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
            <button id="btn-quick-ground" title="Đáy xe chạm sát mặt đường chuẩn xác 100%, khóa Roll 0° (Phím G)" style="
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

          <!-- NÚT ĐÁNH DẤU OUTSIDE TOÀN TRACK -->
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 5px;">
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
              <span style="display: flex; align-items: center; gap: 5px;">
                <span style="display: flex; align-items: center;">${ICONS.eyeOff}</span>
                <span>Outside Toàn Track</span>
              </span>
              <kbd style="font-size: 8.5px; font-family: monospace; background: #ffffff; border: 1px solid #fecdd3; padding: 1px 4px; border-radius: 3px; color: #e11d48;">⇧O</kbd>
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
          const h = parseFloat(btn.dataset.h || "0");
          if (l > 0 && w > 0 && h > 0) {
            this.handleUpdateDimensions(l, w, h, this.applyToTrack);
          }
        });
      });
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
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === "z" || e.key === "Z")) {
          e.preventDefault();
          console.log("[CVAT 3D Suite] Phím tắt Ctrl/Cmd+Z: Hoàn tác (Pre)");
          panel.handleUndo();
          return;
        }
        if (e.shiftKey && (e.key === "O" || e.key === "o")) {
          e.preventDefault();
          console.log("[CVAT 3D Suite] Phím tắt Shift+O: Đánh dấu Outside toàn bộ Track");
          panel.handleSetTrackOutside(true);
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
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === "1") {
          e.preventDefault();
          console.log("[CVAT 3D Suite] Phím tắt 1: Căn TOP");
          panel.handleFitTop();
          return;
        }
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === "2") {
          e.preventDefault();
          console.log("[CVAT 3D Suite] Phím tắt 2: Căn SIDE");
          panel.handleFitSide();
          return;
        }
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === "3") {
          e.preventDefault();
          console.log("[CVAT 3D Suite] Phím tắt 3: Căn FRONT");
          panel.handleFitFront();
          return;
        }
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === "T" || e.key === "t")) {
          e.preventDefault();
          console.log("[CVAT 3D Suite] Phím tắt T: Căn TOP");
          panel.handleFitTop();
          return;
        }
        if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === "P" || e.key === "p")) {
          e.preventDefault();
          console.log("[CVAT 3D Suite] Phím tắt P: Fit Người Đi Bộ (Pedestrian Fit)");
          panel.handleFitPedestrian();
          return;
        }
        if (e.shiftKey && (e.key === "C" || e.key === "c")) {
          e.preventDefault();
          console.log("[CVAT 3D Suite] Phím tắt Shift+C: Fit Toàn Diện Xe 2 Bánh");
          panel.handleFitCyclist("all");
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
    }, bootstrap = function() {
      updateContext();
      setupGlobalHotkeys();
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
