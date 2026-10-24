import {
  Box3D,
  axes,
  worldToLocal,
  localToWorld,
  boxCorners,
  BOX_EDGES,
  cloneBox,
} from "../../core/geometry";
import {
  OrthoInteractionEngine,
  OrthoViewType,
  ViewCellState,
  DragSession,
  VIEWS_DEF,
  HANDLE_RADIUS,
} from "../../core/grid_interaction";

export interface FrameColumnData {
  frame: number;
  box: Box3D;
  keyframe: boolean;
  outside: boolean;
  labelColor: string;
  points: Float32Array | null;
}

export type BoxChangeCallback = (newBox: Box3D, isLiveSync: boolean) => void;
export type FrameSelectCallback = (frame: number) => void;

/**
 * Trình biên tập Toàn Cảnh Đa Khung Hình (Multi-Frame Orthographic Studio):
 * - Hiển thị đồng thời 5 frames liên tiếp của Track ID hiện tại.
 * - Mỗi frame gồm đầy đủ 3 góc chiếu 2D trực giao: TOP (X - Y), SIDE (X - Z), FRONT (Y - Z).
 * - Tổng cộng 15 khung nhìn trực quan đồng bộ giúp người dùng quan sát toàn diện chuỗi chuyển động.
 * - Tương tác chuột trực tiếp trên Active Frame: kéo thân Move, 4 góc đỏ + 4 cạnh trắng Resize, chấm vàng xoay Yaw.
 * - Cuộn chuột Zoom, chuột phải để Pan.
 * - Click vào bất kỳ frame nào để đổi sang làm Active Frame tức thì.
 */
export class OrthoEditorPanel {
  private container: HTMLDivElement | null = null;
  private framesData: FrameColumnData[] = [];
  private activeFrame: number = -1;

  private onBoxChangeCallback: BoxChangeCallback | null = null;
  private onSelectFrameCallback: FrameSelectCallback | null = null;

  // Lưu trữ trạng thái từng cell: key là `${frame}_${view}`
  private cells: Map<string, ViewCellState> = new Map();
  private globalZoom: Record<OrthoViewType, number> = { top: 1, side: 1, front: 1 };
  private pointSize: number = 2.0;
  private isContextMode: boolean = true;
  private slabThickness: number = 2.0;

  private activeDrag: DragSession | null = null;
  private activePan: { key: string; startX: number; startY: number; pan0: [number, number] } | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor(
    onBoxChange: BoxChangeCallback,
    onSelectFrame?: FrameSelectCallback
  ) {
    this.onBoxChangeCallback = onBoxChange;
    this.onSelectFrameCallback = onSelectFrame || null;
    this.handleGlobalPointerMove = this.handleGlobalPointerMove.bind(this);
    this.handleGlobalPointerUp = this.handleGlobalPointerUp.bind(this);
  }

  /**
   * Khởi tạo container gắn vào DOM cha
   */
  public mount(parentEl: HTMLElement): void {
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

  public unmount(): void {
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
  public setFrames(frames: FrameColumnData[], activeFrame: number): void {
    this.framesData = frames;
    this.activeFrame = activeFrame;

    if (!this.container) return;

    // Cập nhật số cột theo số lượng frame thực tế (tối đa 5)
    const colCount = Math.max(1, frames.length);
    this.container.style.gridTemplateColumns = `repeat(${colCount}, minmax(0, 1fr))`;

    // Tái cấu trúc DOM các cột nếu số lượng frame hoặc danh sách frame thay đổi
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
      // Cập nhật style viền Active cho các cột hiện có
      this.container.querySelectorAll<HTMLElement>(".frame-column-card").forEach((col) => {
        const f = parseInt(col.dataset.frame || "-1", 10);
        const isActive = f === this.activeFrame;
        col.style.border = isActive ? "2px solid #2563eb" : "1px solid #1e293b";
        col.style.boxShadow = isActive ? "0 0 10px rgba(37, 99, 235, 0.45)" : "none";
        col.style.background = isActive ? "#0f172a" : "#020617";

        const badgeActive = col.querySelector<HTMLElement>(".badge-active-indicator");
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
  private createFrameColumn(fData: FrameColumnData): HTMLElement {
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

    // 1. Header của cột Frame
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
    const h = fData.box.s[2].toFixed(2);

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
      <span style="font-size: 9px; color: #64748b; font-family: monospace;">${l}×${w}×${h}</span>
    `;

    col.appendChild(header);

    // 2. Khu vực chứa 3 Viewports: xếp dọc TOP -> SIDE -> FRONT
    const viewsWrap = document.createElement("div");
    viewsWrap.style.flex = "1";
    viewsWrap.style.minHeight = "0";
    viewsWrap.style.display = "grid";
    viewsWrap.style.gridTemplateRows = "repeat(3, 1fr)";
    viewsWrap.style.gap = "4px";
    viewsWrap.style.padding = "4px";
    viewsWrap.style.boxSizing = "border-box";

    const viewTypes: OrthoViewType[] = ["top", "side", "front"];
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
  private createViewportCell(frame: number, view: OrthoViewType): HTMLElement {
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

    // Badge nhãn góc nhìn (TOP / SIDE / FRONT) ở góc trên
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
    const cellState: ViewCellState = {
      canvas,
      frame,
      view,
      zoom: 1,
      pan: [0, 0],
    };
    this.cells.set(cellKey, cellState);

    this.attachCanvasListeners(canvas, cellKey, frame, view);

    return card;
  }

  /**
   * Vẽ lại toàn bộ 15 khung nhìn (5 frames x 3 views)
   */
  public renderAll(): void {
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
  private renderCell(cell: ViewCellState, fData: FrameColumnData): void {
    const canvas = cell.canvas;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const w = Math.max(10, Math.floor(rect.width));
    const h = Math.max(10, Math.floor(rect.height));

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    const isActive = cell.frame === this.activeFrame;

    // 1. Nền canvas
    ctx.fillStyle = isActive ? "#09090b" : "#020617";
    ctx.fillRect(0, 0, w, h);

    const box = fData.box;
    const refSize: [number, number, number] = [box.s[0], box.s[1], box.s[2]];
    const ppm = OrthoInteractionEngine.calculatePpm(
      cell,
      w,
      h,
      refSize,
      this.globalZoom,
      this.isContextMode
    );
    const cam = OrthoInteractionEngine.getCamera(cell, box);

    // 2. Vẽ lưới 1m
    this.drawSubtleGrid(ctx, cam, cell.view, { w, h }, ppm, isActive);

    // 3. Vẽ mây điểm LiDAR
    this.drawLidarPoints(ctx, cell, box, fData.points, cam, { w, h }, ppm);

    // 4. Vẽ Bounding Box 3D
    this.drawBoundingBox(
      ctx,
      cell,
      box,
      fData.keyframe,
      fData.outside,
      fData.labelColor,
      cam,
      { w, h },
      ppm,
      isActive
    );
  }

  private drawSubtleGrid(
    ctx: CanvasRenderingContext2D,
    cam: any,
    view: OrthoViewType,
    rect: { w: number; h: number },
    ppm: number,
    isActive: boolean
  ): void {
    ctx.strokeStyle = isActive ? "rgba(51, 65, 85, 0.4)" : "rgba(30, 41, 59, 0.3)";
    ctx.lineWidth = 0.5;

    const stepPixels = 1.0 * ppm;
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

    // 2 trục chữ thập tại tâm xe
    ctx.strokeStyle = isActive ? "rgba(56, 189, 248, 0.3)" : "rgba(56, 189, 248, 0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, rect.h);
    ctx.moveTo(0, cy);
    ctx.lineTo(rect.w, cy);
    ctx.stroke();
  }

  private drawLidarPoints(
    ctx: CanvasRenderingContext2D,
    cell: ViewCellState,
    box: Box3D,
    pts: Float32Array | null,
    cam: any,
    rect: { w: number; h: number },
    ppm: number
  ): void {
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
      if (
        screenP[0] < -8 ||
        screenP[0] > rect.w + 8 ||
        screenP[1] < -8 ||
        screenP[1] > rect.h + 8
      ) {
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

  private drawBoundingBox(
    ctx: CanvasRenderingContext2D,
    cell: ViewCellState,
    box: Box3D,
    keyframe: boolean,
    outside: boolean,
    labelColor: string,
    cam: any,
    rect: { w: number; h: number },
    ppm: number,
    isActive: boolean
  ): void {
    const corners = boxCorners(box).map((p: [number, number, number]) =>
      OrthoInteractionEngine.project(p, cam, cell.view, rect, ppm)
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

    // Mũi tên chỉ hướng đầu xe ở Top View (vẽ trên mọi frame)
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

    // Chỉ Active Frame mới vẽ các Handles tương tác chuột (tránh làm rối các frame khác)
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
  private attachCanvasListeners(
    canvas: HTMLCanvasElement,
    cellKey: string,
    frame: number,
    view: OrthoViewType
  ): void {
    canvas.addEventListener("pointerdown", (e: PointerEvent) => {
      // 1. Nếu click vào frame khác -> Chuyển active sang frame đó ngay
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

      // Chuột phải hoặc Alt + click: Pan
      if (e.button === 2 || e.altKey) {
        e.preventDefault();
        this.activePan = {
          key: cellKey,
          startX: e.clientX,
          startY: e.clientY,
          pan0: [...cell.pan],
        };
        canvas.style.cursor = "grabbing";
        return;
      }

      if (e.button !== 0) return;

      const box = fData.box;
      const refSize: [number, number, number] = [box.s[0], box.s[1], box.s[2]];
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
          moved: false,
        };
      }
    });

    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    // Cuộn chuột zoom
    canvas.addEventListener(
      "wheel",
      (e: WheelEvent) => {
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

  private handleGlobalPointerMove(e: PointerEvent): void {
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

    // Cập nhật dữ liệu in-memory cho active frame
    const fData = this.framesData.find((f) => f.frame === this.activeFrame);
    if (fData) {
      fData.box = cloneBox(newBox);
    }

    this.renderAll();

    if (this.onBoxChangeCallback) {
      this.onBoxChangeCallback(newBox, true);
    }
  }

  private handleGlobalPointerUp(e: PointerEvent): void {
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
    } catch (err) {}

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
