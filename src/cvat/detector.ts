import { CVATContext } from "../core/types";

/**
 * Danh sách các domain CVAT cục bộ / mặc định.
 */
const KNOWN_CVAT_DOMAINS = [
  "localhost",
  "127.0.0.1",
];

/**
 * Kiểm tra xem hostname có thuộc danh sách CVAT ưu tiên không.
 */
function isKnownCVATDomain(hostname: string): boolean {
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
function parseUrlIds(pathname: string): { taskId: number | null; jobId: number | null } {
  let taskId: number | null = null;
  let jobId: number | null = null;

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

/**
 * Kiểm tra các dấu hiệu đặc trưng trong DOM để xác định trang web có phải là CVAT không.
 */
function checkDOMMarkers(): boolean {
  // 1. Kiểm tra các class/id đặc thù của CVAT
  const cvatSelectors = [
    "#cvat_canvas_wrapper",
    "#cvat-objects-sidebar",
    ".cvat-header",
    ".cvat-annotation-header",
    ".cvat-player",
    ".cvat-canvas-container",
    ".cvat-canvas3d-perspective",
  ];

  for (const selector of cvatSelectors) {
    if (document.querySelector(selector)) {
      return true;
    }
  }

  // 2. Kiểm tra tiêu đề trang (Title) hoặc meta
  const title = document.title || "";
  if (/cvat|computer vision annotation/i.test(title)) {
    return true;
  }

  // 3. Kiểm tra biến window.cvat nếu có
  const win = window as unknown as { cvat?: unknown };
  if (typeof win.cvat !== "undefined") {
    return true;
  }

  return false;
}

/**
 * Kiểm tra xem Job hiện tại có phải là không gian 3D Point Cloud không.
 */
function checkIf3DWorkspace(): boolean {
  // 1. Kiểm tra selector canvas 3D của CVAT
  const selectors3D = [
    ".cvat-canvas3d-perspective",
    ".cvat-canvas3d-topview",
    ".cvat-canvas3d-sideview",
    ".cvat-canvas3d-frontview",
    "[id^='cvat_canvas3d']",
  ];

  for (const selector of selectors3D) {
    if (document.querySelector(selector)) {
      return true;
    }
  }

  // 2. Kiểm tra xem có chứa canvas WebGL hỗ trợ 3D không
  const canvasElements = document.querySelectorAll("canvas");
  for (const canvas of canvasElements) {
    if (canvas.classList.contains("cvat-canvas3d") || canvas.id.includes("3d")) {
      return true;
    }
  }

  return false;
}

/**
 * Nhận diện toàn diện ngữ cảnh CVAT hiện tại.
 */
export function detectCVAT(): CVATContext {
  const origin = window.location.origin;
  const hostname = window.location.hostname;
  const pathname = window.location.pathname;
  const { taskId, jobId } = parseUrlIds(pathname);

  const isKnownDomain = isKnownCVATDomain(hostname);
  const hasUrlPattern = jobId !== null || pathname.includes("/tasks/") || pathname.includes("/jobs/");
  const hasDOMMarker = checkDOMMarkers();

  // Xác định xem có phải CVAT không: ưu tiên domain đã biết trước
  const isCVAT = isKnownDomain || hasUrlPattern || hasDOMMarker;

  if (!isCVAT) {
    return {
      isCVAT: false,
      isJob: false,
      is3D: false,
      baseUrl: origin,
      taskId: null,
      jobId: null,
      statusMessage: "Không phát hiện CVAT trên trang web này.",
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
    statusMessage,
  };
}
