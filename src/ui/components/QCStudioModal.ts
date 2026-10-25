/**
 * src/ui/components/QCStudioModal.ts
 * Cửa sổ toàn màn hình CVAT 3D QC Studio (Datumaro QA TS Edition)
 * - 100% TypeScript thuần, đồng bộ chuẩn xác với datumaro_qa.py
 * - 6 Tab chuẩn: Summary, By Track, By Frame, Matrix, All Issues, Data Issues
 * - Đa luồng nạp dữ liệu: Tự động trích xuất đầy đủ Job từ CVAT & Kéo thả / Chọn file JSON
 * - Xuất báo cáo CSV UTF-8 with BOM (tương thích Microsoft Excel) & Copy TSV (Google Sheets)
 * - 100% Clean White / Light Theme chuẩn GEMINI.md & Flat SVG Icons (src/ui/icons.ts)
 */

import { CVATContext } from "../../core/types";
import { CVATBridge } from "../../cvat/bridge";
import { ICONS } from "../icons";
import {
  loadObjects,
  generateDatumaroQAReport,
  exportReportToCsv,
  exportReportToTsv,
  CHECKS_LIST,
  CHECK_NAME,
  CHECK_CODE,
  sortTrackKey,
  type DatumaroObj,
} from "../../core/qc/qc_engine.ts";
import {
  DEFAULT_DATUMARO_QA_CONFIG,
  type DatumaroQAReport,
  type DatumaroQAConfig,
  type QCIssueRecord,
  type QCDataIssue,
  type QCTrackSummary,
  type QCFrameSummary,
} from "../../core/qc/types.ts";

export type QCStudioTab =
  | "summary"
  | "by_track"
  | "by_frame"
  | "matrix"
  | "all_issues"
  | "data_issues";

export class QCStudioModal {
  private overlay: HTMLDivElement | null = null;
  private currentCtx: CVATContext | null = null;
  private report: DatumaroQAReport | null = null;
  private rawDataset: any = null;
  private config: DatumaroQAConfig = { ...DEFAULT_DATUMARO_QA_CONFIG };
  private isLoading: boolean = false;
  private loadedFileName: string = "";

  // Trạng thái bộ lọc giao diện
  private currentTab: QCStudioTab = "summary";
  private selectedCheckFilter: string = "all";
  private searchKeyword: string = "";

  constructor() {
    this.createOverlay();
    this.attachGlobalHotkeys();
  }

  public isOpen(): boolean {
    return !!(this.overlay && this.overlay.style.display !== "none");
  }

  public async open(ctx: CVATContext): Promise<void> {
    this.currentCtx = ctx;
    if (this.overlay) {
      this.overlay.style.display = "flex";
    }
    if (!this.report) {
      await this.scanJobFromCVAT();
    } else {
      this.render();
    }
  }

  public close(): void {
    if (this.overlay) {
      this.overlay.style.display = "none";
    }
  }

  private createOverlay(): void {
    if (document.getElementById("cvat-3d-qc-studio-modal")) {
      this.overlay = document.getElementById("cvat-3d-qc-studio-modal") as HTMLDivElement;
      return;
    }

    this.overlay = document.createElement("div");
    this.overlay.id = "cvat-3d-qc-studio-modal";
    this.overlay.setAttribute("translate", "no");
    this.overlay.classList.add("notranslate");
    this.overlay.style.position = "fixed";
    this.overlay.style.inset = "0";
    this.overlay.style.zIndex = "999999";
    this.overlay.style.background = "rgba(15, 23, 42, 0.45)";
    this.overlay.style.backdropFilter = "blur(4px)";
    this.overlay.style.display = "none";
    this.overlay.style.alignItems = "center";
    this.overlay.style.justifyContent = "center";
    this.overlay.style.padding = "20px";
    this.overlay.style.fontFamily =
      "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    this.overlay.style.userSelect = "none";

    document.body.appendChild(this.overlay);

    // Hỗ trợ Kéo & Thả (Drag & Drop) file JSON Datumaro
    this.overlay.addEventListener("dragover", (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.showDropOverlay(true);
    });

    this.overlay.addEventListener("dragleave", (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.target === this.overlay || (e as any).relatedTarget === null) {
        this.showDropOverlay(false);
      }
    });

    this.overlay.addEventListener("drop", (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.showDropOverlay(false);

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (file.name.toLowerCase().endsWith(".json") || file.type === "application/json") {
          this.loadJsonFile(file);
        } else {
          this.showToast("Vui lòng chỉ thả file định dạng JSON (.json)!");
        }
      }
    });
  }

  private showDropOverlay(show: boolean): void {
    if (!this.overlay) return;
    let dropZone = this.overlay.querySelector("#qc-drop-zone-overlay") as HTMLDivElement;
    if (show) {
      if (!dropZone) {
        dropZone = document.createElement("div");
        dropZone.id = "qc-drop-zone-overlay";
        dropZone.style.position = "absolute";
        dropZone.style.inset = "16px";
        dropZone.style.zIndex = "1000000";
        dropZone.style.background = "rgba(240, 249, 255, 0.95)";
        dropZone.style.border = "3px dashed #0284c7";
        dropZone.style.borderRadius = "16px";
        dropZone.style.display = "flex";
        dropZone.style.flexDirection = "column";
        dropZone.style.alignItems = "center";
        dropZone.style.justifyContent = "center";
        dropZone.style.color = "#0369a1";
        dropZone.style.pointerEvents = "none";
        dropZone.innerHTML = `
          <div style="margin-bottom: 12px;">${ICONS.database}</div>
          <div style="font-size: 18px; font-weight: 700; margin-bottom: 6px;">Thả file JSON Datumaro vào đây</div>
          <div style="font-size: 13px; color: #0284c7;">Hệ thống sẽ tự động phân tích và chạy 6 bài kiểm định chất lượng</div>
        `;
        this.overlay.appendChild(dropZone);
      }
      dropZone.style.display = "flex";
    } else {
      if (dropZone) {
        dropZone.style.display = "none";
      }
    }
  }

  private attachGlobalHotkeys(): void {
    window.addEventListener("keydown", (e: KeyboardEvent) => {
      if (!this.isOpen()) return;
      if (e.key === "Escape") {
        this.close();
      }
    });
  }

  /**
   * Quét tự động toàn bộ Job từ CVAT
   */
  public async scanJobFromCVAT(): Promise<void> {
    if (!this.currentCtx?.jobId) return;

    this.isLoading = true;
    this.loadedFileName = `CVAT Job #${this.currentCtx.jobId}`;
    this.renderLoading("Đang trích xuất toàn bộ Job từ CVAT (kể cả frame nội suy)...");

    try {
      // 1. Thử gọi API trích xuất Datumaro đầy đủ từ Main World
      let dataset = await CVATBridge.exportJobDatumaroData(this.currentCtx.jobId);

      // 2. Fallback sang quét tracks in-memory nếu chưa nạp bridge kịp
      if (!dataset || !Array.isArray(dataset.items) || dataset.items.length === 0) {
        const tracksData = await CVATBridge.getAllJobTracksWithShapes(this.currentCtx.jobId);
        dataset = this.convertTracksToDatumaro(tracksData);
      }

      this.rawDataset = dataset;
      this.processDataset(dataset, this.loadedFileName);
    } catch (err: any) {
      console.error("[QCStudioModal] Lỗi khi quét Job:", err);
      this.showToast(`Lỗi khi quét Job: ${err?.message || err}`);
    } finally {
      this.isLoading = false;
      this.render();
    }
  }

  /**
   * Xử lý file JSON được người dùng nạp vào
   */
  public loadJsonFile(file: File): void {
    this.isLoading = true;
    this.loadedFileName = file.name;
    this.renderLoading(`Đang đọc file ${file.name}...`);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const dataset = JSON.parse(text);
        this.rawDataset = dataset;
        this.processDataset(dataset, file.name);
      } catch (err: any) {
        alert(`Không thể đọc file JSON: ${err?.message || err}`);
      } finally {
        this.isLoading = false;
        this.render();
      }
    };
    reader.onerror = () => {
      this.isLoading = false;
      alert("Đã xảy ra lỗi khi đọc file từ đĩa");
      this.render();
    };
    reader.readAsText(file);
  }

  private processDataset(dataset: any, sourceName: string): void {
    const { objs, issues, meta } = loadObjects(dataset, this.config);
    this.report = generateDatumaroQAReport(objs, issues, meta, this.config, sourceName);
  }

  private convertTracksToDatumaro(tracksData: any[]): any {
    const labelsMap = new Map<string, number>();
    const labelsList: Array<{ name: string }> = [];
    const frameItemsMap = new Map<number, any[]>();

    let annCounter = 1;
    for (const t of tracksData) {
      const labelName = t.labelName || "car";
      if (!labelsMap.has(labelName)) {
        labelsMap.set(labelName, labelsList.length);
        labelsList.push({ name: labelName });
      }
      const labelId = labelsMap.get(labelName)!;
      const tid = typeof t.clientID === "number" ? Math.max(0, t.clientID - 1) : 0;

      for (const s of t.shapes || []) {
        if (!Array.isArray(s.points) || s.points.length < 9) continue;
        if (s.outside) continue;

        const p = s.points;
        const ann = {
          type: "cuboid_3d",
          id: annCounter++,
          label_id: labelId,
          position: [Number(p[0]), Number(p[1]), Number(p[2])],
          rotation: [Number(p[3]), Number(p[4]), Number(p[5])],
          scale: [Math.abs(Number(p[6])), Math.abs(Number(p[7])), Math.abs(Number(p[8]))],
          attributes: {
            track_id: tid,
            outside: false,
            keyframe: !!s.keyframe,
          },
        };

        const list = frameItemsMap.get(s.frame) || [];
        list.push(ann);
        frameItemsMap.set(s.frame, list);
      }
    }

    const items: any[] = [];
    const sortedFrames = Array.from(frameItemsMap.keys()).sort((a, b) => a - b);
    for (const f of sortedFrames) {
      items.push({
        id: `frame_${String(f).padStart(6, "0")}`,
        attr: { frame: f },
        annotations: frameItemsMap.get(f) || [],
      });
    }

    return {
      dm_format_version: "1.0",
      categories: {
        label: {
          labels: labelsList,
        },
      },
      items,
    };
  }

  private renderLoading(message: string): void {
    if (!this.overlay) return;
    this.overlay.innerHTML = `
      <div style="
        background: #ffffff;
        border-radius: 12px;
        padding: 32px 48px;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
        text-align: center;
        color: #0f172a;
        border: 1px solid #e2e8f0;
      ">
        <div style="margin-bottom: 16px; color: #0284c7; display: flex; justify-content: center;">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
        </div>
        <div style="font-size: 15px; font-weight: 600; margin-bottom: 6px;">${message}</div>
        <div style="font-size: 12px; color: #64748b;">Thuật toán Datumaro QA đang chạy (Scale, Size, Z, Rotation, Overlap, Distance)</div>
        <style>@keyframes spin { 100% { transform: rotate(360deg); } }</style>
      </div>
    `;
  }

  private render(): void {
    if (!this.overlay) return;
    if (!this.report) {
      this.overlay.innerHTML = `
        <div style="background: #ffffff; padding: 32px; border-radius: 12px; border: 1px solid #e2e8f0; text-align: center;">
          <div style="font-size: 15px; font-weight: 600; margin-bottom: 12px;">Chưa có dữ liệu kiểm định</div>
          <button id="qc-re-scan-btn" style="padding: 8px 16px; background: #0284c7; color: #ffffff; border-radius: 6px; border: none; cursor: pointer; font-weight: 500;">
            Quét Lại Từ CVAT
          </button>
        </div>
      `;
      const btn = this.overlay.querySelector("#qc-re-scan-btn");
      btn?.addEventListener("click", () => this.scanJobFromCVAT());
      return;
    }

    const rep = this.report;
    const totalIssues = rep.allIssues.length;
    const isClean = totalIssues === 0 && rep.dataIssues.length === 0;

    this.overlay.innerHTML = `
      <div style="
        width: 96vw;
        height: 92vh;
        max-width: 1440px;
        background: #ffffff;
        border-radius: 12px;
        border: 1px solid #e2e8f0;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      ">
        <!-- HEADER BAR -->
        <div style="
          padding: 12px 20px;
          background: #ffffff;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
        ">
          <!-- TIÊU ĐỀ & TRẠNG THÁI TỔNG THỂ -->
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="
              width: 34px;
              height: 34px;
              border-radius: 8px;
              background: ${isClean ? "#ecfdf5" : "#fef2f2"};
              color: ${isClean ? "#059669" : "#dc2626"};
              display: flex;
              align-items: center;
              justify-content: center;
            ">
              ${isClean ? ICONS.shieldCheck : ICONS.shieldAlert}
            </div>
            <div>
              <div style="font-size: 14px; font-weight: 700; color: #09090b; display: flex; align-items: center; gap: 8px;">
                CVAT 3D QC Studio · ${this.loadedFileName}
                <span style="
                  font-size: 11px;
                  font-weight: 600;
                  padding: 2px 8px;
                  border-radius: 12px;
                  background: ${isClean ? "#ecfdf5" : "#fef2f2"};
                  color: ${isClean ? "#059669" : "#dc2626"};
                  border: 1px solid ${isClean ? "#a7f3d0" : "#fecaca"};
                ">
                  ${isClean ? "ĐẠT CHUẨN 100%" : `${totalIssues} ISSUES`}
                </span>
                ${
                  rep.dataIssues.length > 0
                    ? `<span style="font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 12px; background: #fffbeb; color: #b45309; border: 1px solid #fde68a;">${rep.dataIssues.length} DATA ISSUES</span>`
                    : ""
                }
              </div>
              <div style="font-size: 11px; color: #64748b; margin-top: 2px;">
                Định dạng: Datumaro ${rep.meta.version} · ${rep.meta.n_tracks} Tracks · ${rep.meta.n_items} Frames · ${rep.meta.n_objs} Cuboids
              </div>
            </div>
          </div>

          <!-- NHÓM NÚT HÀNH ĐỘNG -->
          <div style="display: flex; align-items: center; gap: 8px;">
            <input type="file" id="qc-json-file-input" accept=".json" style="display: none;" />
            <button id="qc-open-file-btn" style="
              display: flex; align-items: center; gap: 6px; padding: 6px 12px; font-size: 12px; font-weight: 600;
              background: #ffffff; color: #334155; border: 1px solid #cbd5e1; border-radius: 6px; cursor: pointer;
            ">
              ${ICONS.database} Nạp File JSON
            </button>

            <button id="qc-rescan-job-btn" style="
              display: flex; align-items: center; gap: 6px; padding: 6px 12px; font-size: 12px; font-weight: 600;
              background: #0284c7; color: #ffffff; border: none; border-radius: 6px; cursor: pointer;
            ">
              ${ICONS.refresh} Quét Lại Job
            </button>

            <button id="qc-download-csv-btn" style="
              display: flex; align-items: center; gap: 6px; padding: 6px 12px; font-size: 12px; font-weight: 600;
              background: #059669; color: #ffffff; border: none; border-radius: 6px; cursor: pointer;
            ">
              ${ICONS.download} Xuất CSV Excel
            </button>

            <button id="qc-copy-tsv-btn" style="
              display: flex; align-items: center; gap: 6px; padding: 6px 12px; font-size: 12px; font-weight: 600;
              background: #ffffff; color: #059669; border: 1px solid #059669; border-radius: 6px; cursor: pointer;
            ">
              ${ICONS.copy} Copy TSV
            </button>

            <button id="qc-close-btn" style="
              width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
              background: transparent; color: #64748b; border: 1px solid #e2e8f0; border-radius: 6px; cursor: pointer;
            ">
              ${ICONS.close}
            </button>
          </div>
        </div>

        <!-- 6 TAB NAVIGATION -->
        <div style="
          display: flex;
          align-items: center;
          padding: 0 20px;
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
          gap: 4px;
        ">
          ${this.renderTabBtn("summary", "Summary (Tổng Quan)", ICONS.activity, 0)}
          ${this.renderTabBtn("by_track", "By Track", ICONS.listCheck, rep.byTrack.length)}
          ${this.renderTabBtn("by_frame", "By Frame", ICONS.ruler, rep.byFrame.length)}
          ${this.renderTabBtn("matrix", "Matrix (Ma Trận 2D)", ICONS.matrix, totalIssues)}
          ${this.renderTabBtn("all_issues", "All Issues (Chi Tiết)", ICONS.filter, totalIssues)}
          ${this.renderTabBtn("data_issues", "Data Issues", ICONS.shieldAlert, rep.dataIssues.length)}
        </div>

        <!-- TAB CONTENT CONTAINER -->
        <div id="qc-tab-content" style="
          flex: 1;
          overflow: auto;
          background: #ffffff;
          padding: 20px;
        ">
          ${this.renderActiveTabContent()}
        </div>
      </div>
    `;

    this.attachEvents();
  }

  private renderTabBtn(
    tabId: QCStudioTab,
    title: string,
    iconSvg: string,
    badgeCount: number
  ): string {
    const isActive = this.currentTab === tabId;
    return `
      <button class="qc-tab-btn" data-tab="${tabId}" style="
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 10px 14px;
        font-size: 12px;
        font-weight: ${isActive ? "700" : "500"};
        color: ${isActive ? "#0284c7" : "#64748b"};
        background: transparent;
        border: none;
        border-bottom: 2px solid ${isActive ? "#0284c7" : "transparent"};
        cursor: pointer;
        transition: all 0.15s ease;
      ">
        ${iconSvg}
        <span>${title}</span>
        ${
          badgeCount > 0
            ? `<span style="
                font-size: 10px;
                padding: 1px 6px;
                border-radius: 10px;
                background: ${isActive ? "#e0f2fe" : "#e2e8f0"};
                color: ${isActive ? "#0369a1" : "#475569"};
                font-weight: 600;
              ">${badgeCount}</span>`
            : ""
        }
      </button>
    `;
  }

  private renderActiveTabContent(): string {
    if (!this.report) return "";
    switch (this.currentTab) {
      case "summary":
        return this.renderSummaryTab();
      case "by_track":
        return this.renderByTrackTab();
      case "by_frame":
        return this.renderByFrameTab();
      case "matrix":
        return this.renderMatrixTab();
      case "all_issues":
        return this.renderAllIssuesTab();
      case "data_issues":
        return this.renderDataIssuesTab();
      default:
        return "";
    }
  }

  // ==========================================================================
  // TAB 1: SUMMARY
  // ==========================================================================
  private renderSummaryTab(): string {
    const rep = this.report!;
    const sum = rep.summary;

    return `
      <div style="max-width: 1100px; margin: 0 auto; display: flex; flex-direction: column; gap: 24px;">
        <!-- THÔNG TIN CHUNG -->
        <div style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
          <div style="padding: 10px 16px; background: #1F4E78; color: #ffffff; font-weight: 700; font-size: 13px;">
            BÁO CÁO KIỂM TRA CHẤT LƯỢNG DỮ LIỆU 3D (Datumaro QA)
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; padding: 16px; background: #ffffff;">
            <div><strong style="color: #64748b;">Nguồn / File:</strong> <span style="font-weight: 600; color: #09090b;">${sum.inPath}</span></div>
            <div><strong style="color: #64748b;">Thời gian chạy:</strong> <span>${sum.runTime}</span></div>
            <div><strong style="color: #64748b;">Phiên bản Datumaro:</strong> <span>${sum.version}</span></div>
            <div><strong style="color: #64748b;">Số Frame (Items):</strong> <span>${sum.nItems}</span></div>
            <div><strong style="color: #64748b;">Số Cuboid 3D:</strong> <span>${sum.nObjs}</span></div>
            <div><strong style="color: #64748b;">Số Track ID:</strong> <span>${sum.nTracks}</span></div>
            <div><strong style="color: #64748b;">Track ID Hiển Thị:</strong> <span>${sum.trackOffsetInfo}</span></div>
          </div>
        </div>

        <!-- BẢNG THỐNG KÊ 6 BÀI KIỂM ĐỊNH -->
        <div style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
          <div style="padding: 10px 16px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-weight: 700; font-size: 13px; color: #0f172a;">
            Thống Kê Theo Từng Bài Kiểm Tra
          </div>
          <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 12px;">
            <thead>
              <tr style="background: #1F4E78; color: #ffffff;">
                <th style="padding: 8px 12px; border: 1px solid #cbd5e1;">Kiểm tra</th>
                <th style="padding: 8px 12px; border: 1px solid #cbd5e1; text-align: center;">Ký hiệu (Matrix)</th>
                <th style="padding: 8px 12px; border: 1px solid #cbd5e1; text-align: right;">Số issue (track × frame)</th>
                <th style="padding: 8px 12px; border: 1px solid #cbd5e1; text-align: right;">Số track bị ảnh hưởng</th>
                <th style="padding: 8px 12px; border: 1px solid #cbd5e1; text-align: right;">Số frame bị ảnh hưởng</th>
              </tr>
            </thead>
            <tbody>
              ${sum.checkStats
                .map(
                  (s, idx) => `
                <tr style="background: ${idx % 2 === 0 ? "#ffffff" : "#f8fafc"};">
                  <td style="padding: 8px 12px; border: 1px solid #e2e8f0; font-weight: 600;">${s.name}</td>
                  <td style="padding: 8px 12px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0284c7;">${s.code}</td>
                  <td style="padding: 8px 12px; border: 1px solid #e2e8f0; text-align: right; font-weight: ${s.issueCount > 0 ? "700" : "400"}; color: ${s.issueCount > 0 ? "#dc2626" : "#475569"};">${s.issueCount}</td>
                  <td style="padding: 8px 12px; border: 1px solid #e2e8f0; text-align: right;">${s.trackCount}</td>
                  <td style="padding: 8px 12px; border: 1px solid #e2e8f0; text-align: right;">${s.frameCount}</td>
                </tr>
              `
                )
                .join("")}
              <tr style="background: #fffbeb;">
                <td style="padding: 8px 12px; border: 1px solid #e2e8f0; font-weight: 600; color: #b45309;">Lỗi dữ liệu (Data_Issues)</td>
                <td style="padding: 8px 12px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #b45309;">!</td>
                <td style="padding: 8px 12px; border: 1px solid #e2e8f0; text-align: right; font-weight: 700; color: #b45309;">${sum.dataIssueCount}</td>
                <td style="padding: 8px 12px; border: 1px solid #e2e8f0; text-align: right; color: #94a3b8;">-</td>
                <td style="padding: 8px 12px; border: 1px solid #e2e8f0; text-align: right; color: #94a3b8;">-</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- BẢNG CẤU HÌNH THAM SỐ ĐANG DÙNG -->
        <div style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
          <div style="padding: 10px 16px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-weight: 700; font-size: 13px; color: #0f172a;">
            Tham Số Ngưỡng Kiểm Định (Active Config)
          </div>
          <div style="padding: 12px; max-height: 240px; overflow-y: auto; background: #ffffff; font-family: monospace; font-size: 11px;">
            <pre style="margin: 0; white-space: pre-wrap;">${JSON.stringify(sum.activeConfig, null, 2)}</pre>
          </div>
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // TAB 2: BY TRACK
  // ==========================================================================
  private renderByTrackTab(): string {
    const rep = this.report!;
    if (rep.byTrack.length === 0) {
      return `<div style="text-align: center; padding: 40px; color: #059669; font-weight: 600;">Không có track nào gặp lỗi!</div>`;
    }

    return `
      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
          <thead>
            <tr style="background: #1F4E78; color: #ffffff;">
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1;">Track ID</th>
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1;">Class</th>
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1; text-align: center;">Số frame</th>
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1; text-align: center;">Đầu</th>
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1; text-align: center;">Cuối</th>
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1; text-align: right;">Tổng lỗi</th>
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1; text-align: right;">Số frame lỗi</th>
              ${CHECKS_LIST.map((c) => `<th style="padding: 8px 10px; border: 1px solid #cbd5e1;">${c.name}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${rep.byTrack
              .map(
                (t, idx) => `
              <tr style="background: ${idx % 2 === 0 ? "#ffffff" : "#f8fafc"};">
                <td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-weight: 700; color: #0284c7;">${t.track}</td>
                <td style="padding: 6px 10px; border: 1px solid #e2e8f0;">${t.label}</td>
                <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center;">${t.presenceCount}</td>
                <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center;">${t.firstFrame ?? ""}</td>
                <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center;">${t.lastFrame ?? ""}</td>
                <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: right; font-weight: 700; color: #dc2626;">${t.totalIssues}</td>
                <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: right;">${t.issueFramesCount}</td>
                ${CHECKS_LIST.map((c) => {
                  const val = t.checkFrames[c.key] || "";
                  return `<td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-size: 11px;">${this.renderClickableFrameList(t.track, val)}</td>`;
                }).join("")}
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  // ==========================================================================
  // TAB 3: BY FRAME
  // ==========================================================================
  private renderByFrameTab(): string {
    const rep = this.report!;
    if (rep.byFrame.length === 0) {
      return `<div style="text-align: center; padding: 40px; color: #059669; font-weight: 600;">Không có frame nào gặp lỗi!</div>`;
    }

    return `
      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
          <thead>
            <tr style="background: #1F4E78; color: #ffffff;">
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1;">Frame</th>
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1;">Item ID</th>
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1; text-align: center;">Số obj</th>
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1; text-align: right;">Tổng lỗi</th>
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1; text-align: right;">Số track lỗi</th>
              ${CHECKS_LIST.map((c) => `<th style="padding: 8px 10px; border: 1px solid #cbd5e1;">${c.name}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${rep.byFrame
              .map(
                (f, idx) => `
              <tr style="background: ${idx % 2 === 0 ? "#ffffff" : "#f8fafc"};">
                <td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-weight: 700; color: #0284c7;">
                  <a href="javascript:void(0)" class="qc-jump-frame-link" data-frame="${f.frame}" style="color: #0284c7; text-decoration: underline;">
                    Frame ${f.frame}
                  </a>
                </td>
                <td style="padding: 6px 10px; border: 1px solid #e2e8f0; color: #64748b;">${f.itemId}</td>
                <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center;">${f.objCount}</td>
                <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: right; font-weight: 700; color: #dc2626;">${f.totalIssues}</td>
                <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: right;">${f.issueTracksCount}</td>
                ${CHECKS_LIST.map((c) => {
                  const val = f.checkTracks[c.key] || "";
                  return `<td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-size: 11px;">${this.renderClickableTrackList(f.frame, val)}</td>`;
                }).join("")}
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  // ==========================================================================
  // TAB 4: MATRIX (MA TRẬN 2D TRACK × FRAME)
  // ==========================================================================
  private renderMatrixTab(): string {
    const rep = this.report!;
    const allFrames = rep.matrix.allFrames;
    const rows = rep.matrix.rows;

    return `
      <div>
        <!-- CHÚ THÍCH KÝ HIỆU & MÀU SẮC (KHỚP 100% EXCEL datumaro_qa.py) -->
        <div style="
          margin-bottom: 14px; padding: 10px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;
          display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; font-size: 11px;
        ">
          <div>
            <strong>Ký hiệu lỗi:</strong>
            ${CHECKS_LIST.map((c) => `<span style="margin-left: 8px;"><strong>${c.code}</strong> = ${c.name}</span>`).join(" | ")}
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="display: inline-flex; align-items: center; gap: 4px;">
              <span style="width: 14px; height: 14px; background: #E2EFDA; border: 1px solid #cbd5e1; border-radius: 2px;"></span> Có mặt, sạch
            </span>
            <span style="display: inline-flex; align-items: center; gap: 4px;">
              <span style="width: 14px; height: 14px; background: #FFE699; border: 1px solid #cbd5e1; border-radius: 2px;"></span> 1 loại issue
            </span>
            <span style="display: inline-flex; align-items: center; gap: 4px;">
              <span style="width: 14px; height: 14px; background: #F4B084; border: 1px solid #cbd5e1; border-radius: 2px;"></span> ≥ 2 loại issue
            </span>
            <span style="display: inline-flex; align-items: center; gap: 4px;">
              <span style="width: 14px; height: 14px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 2px;"></span> Không có mặt
            </span>
          </div>
        </div>

        <!-- BẢNG MA TRẬN CUỘN NGANG -->
        <div style="overflow-x: auto; max-height: calc(92vh - 220px); border: 1px solid #e2e8f0; border-radius: 6px;">
          <table style="border-collapse: separate; border-spacing: 0; font-size: 11px; text-align: center;">
            <thead>
              <tr style="position: sticky; top: 0; z-index: 20; background: #1F4E78; color: #ffffff;">
                <th style="position: sticky; left: 0; z-index: 30; background: #1F4E78; padding: 6px 10px; border: 1px solid #475569; min-width: 70px;">Track</th>
                <th style="position: sticky; left: 70px; z-index: 30; background: #1F4E78; padding: 6px 10px; border: 1px solid #475569; min-width: 90px;">Class</th>
                <th style="position: sticky; left: 160px; z-index: 30; background: #1F4E78; padding: 6px 8px; border: 1px solid #475569; min-width: 60px;">Tổng lỗi</th>
                ${allFrames.map((f) => `<th style="padding: 6px 4px; border: 1px solid #475569; min-width: 32px;">${f}</th>`).join("")}
              </tr>
            </thead>
            <tbody>
              ${rows
                .map((r, rIdx) => {
                  const bgSticky = rIdx % 2 === 0 ? "#ffffff" : "#f8fafc";
                  return `
                  <tr>
                    <td style="position: sticky; left: 0; z-index: 10; background: ${bgSticky}; padding: 6px 10px; border: 1px solid #e2e8f0; font-weight: 700; color: #0284c7;">
                      ${r.track}
                    </td>
                    <td style="position: sticky; left: 70px; z-index: 10; background: ${bgSticky}; padding: 6px 10px; border: 1px solid #e2e8f0; text-align: left; white-space: nowrap;">
                      ${r.label}
                    </td>
                    <td style="position: sticky; left: 160px; z-index: 10; background: ${bgSticky}; padding: 6px 8px; border: 1px solid #e2e8f0; font-weight: 700; color: ${r.totalIssues > 0 ? "#dc2626" : "#475569"};">
                      ${r.totalIssues}
                    </td>
                    ${allFrames
                      .map((f) => {
                        const cell = r.cells[f];
                        if (!cell || !cell.present) {
                          return `<td style="padding: 4px; border: 1px solid #f1f5f9; background: #ffffff;"></td>`;
                        }
                        if (cell.codes.length === 0) {
                          return `<td class="qc-matrix-cell" data-track="${r.track}" data-frame="${f}" style="padding: 4px; border: 1px solid #e2e8f0; background: #E2EFDA; cursor: pointer;" title="Track ${r.track} tại Frame ${f}: Sạch"></td>`;
                        }
                        const cellBg = cell.codes.length >= 2 ? "#F4B084" : "#FFE699";
                        return `
                          <td class="qc-matrix-cell" data-track="${r.track}" data-frame="${f}" style="
                            padding: 4px; border: 1px solid #cbd5e1; background: ${cellBg}; font-weight: 700; color: #000000; cursor: pointer;
                          " title="Track ${r.track} tại Frame ${f}: ${cell.codes.join(", ")} (Click nhảy tới CVAT)">
                            ${cell.codes.join("")}
                          </td>
                        `;
                      })
                      .join("")}
                  </tr>
                `;
                })
                .join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // TAB 5: ALL ISSUES (BẢNG TOÀN BỘ LỖI CHI TIẾT)
  // ==========================================================================
  private renderAllIssuesTab(): string {
    const rep = this.report!;
    let issues = rep.allIssues;

    // Lọc theo loại kiểm tra
    if (this.selectedCheckFilter !== "all") {
      issues = issues.filter((i) => i.check === this.selectedCheckFilter);
    }

    // Lọc theo từ khóa tìm kiếm
    if (this.searchKeyword.trim() !== "") {
      const kw = this.searchKeyword.toLowerCase().trim();
      issues = issues.filter(
        (i) =>
          String(i.track).toLowerCase().includes(kw) ||
          String(i.frame).toLowerCase().includes(kw) ||
          i.label.toLowerCase().includes(kw) ||
          i.detail.toLowerCase().includes(kw) ||
          String(i.other).toLowerCase().includes(kw)
      );
    }

    return `
      <div>
        <!-- THANH CÔNG CỤ LỌC & TÌM KIẾM -->
        <div style="margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <input
              type="text"
              id="qc-search-kw-input"
              value="${this.searchKeyword}"
              placeholder="Tìm theo Track ID, Frame, Label, Mô tả..."
              style="padding: 6px 12px; font-size: 12px; border: 1px solid #cbd5e1; border-radius: 6px; width: 260px;"
            />
            <select id="qc-check-filter-select" style="padding: 6px 10px; font-size: 12px; border: 1px solid #cbd5e1; border-radius: 6px;">
              <option value="all" ${this.selectedCheckFilter === "all" ? "selected" : ""}>Tất cả kiểm tra (${rep.allIssues.length})</option>
              ${CHECKS_LIST.map(
                (c) => `
                <option value="${c.key}" ${this.selectedCheckFilter === c.key ? "selected" : ""}>
                  ${c.code} - ${c.name} (${rep.allIssues.filter((i) => i.check === c.key).length})
                </option>
              `
              ).join("")}
            </select>
          </div>

          <div style="font-size: 12px; color: #64748b;">
            Hiển thị <strong>${issues.length}</strong> / ${rep.allIssues.length} issues
          </div>
        </div>

        <!-- BẢNG DANH SÁCH CHI TIẾT -->
        <div style="overflow-x: auto; max-height: calc(92vh - 220px); border: 1px solid #e2e8f0; border-radius: 6px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
            <thead>
              <tr style="position: sticky; top: 0; z-index: 10; background: #1F4E78; color: #ffffff;">
                <th style="padding: 8px 10px; border: 1px solid #475569;">Frame</th>
                <th style="padding: 8px 10px; border: 1px solid #475569;">Item ID</th>
                <th style="padding: 8px 10px; border: 1px solid #475569;">Track ID</th>
                <th style="padding: 8px 10px; border: 1px solid #475569;">Class</th>
                <th style="padding: 8px 10px; border: 1px solid #475569;">Loại kiểm tra</th>
                <th style="padding: 8px 10px; border: 1px solid #475569;">Mô tả</th>
                <th style="padding: 8px 10px; border: 1px solid #475569;">Giá trị</th>
                <th style="padding: 8px 10px; border: 1px solid #475569;">Ngưỡng / Chuẩn</th>
                <th style="padding: 8px 10px; border: 1px solid #475569;">Track liên quan</th>
              </tr>
            </thead>
            <tbody>
              ${
                issues.length === 0
                  ? `<tr><td colspan="9" style="text-align: center; padding: 30px; color: #64748b;">Không tìm thấy issue nào khớp với bộ lọc</td></tr>`
                  : issues
                      .map(
                        (r, idx) => `
                    <tr class="qc-issue-row" data-track="${r.track}" data-frame="${r.frame}" style="
                      background: ${idx % 2 === 0 ? "#ffffff" : "#f8fafc"}; cursor: pointer; transition: background 0.1s ease;
                    ">
                      <td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-weight: 700; color: #0284c7;">${r.frame}</td>
                      <td style="padding: 6px 10px; border: 1px solid #e2e8f0; color: #64748b;">${r.item_id}</td>
                      <td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-weight: 700;">${r.track}</td>
                      <td style="padding: 6px 10px; border: 1px solid #e2e8f0;">${r.label}</td>
                      <td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-weight: 600; color: #0369a1;">${CHECK_NAME[r.check] || r.check}</td>
                      <td style="padding: 6px 10px; border: 1px solid #e2e8f0;">${r.detail}</td>
                      <td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-family: monospace;">${r.value}</td>
                      <td style="padding: 6px 10px; border: 1px solid #e2e8f0; color: #64748b;">${r.ref}</td>
                      <td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-weight: 600; color: #b45309;">${r.other}</td>
                    </tr>
                  `
                      )
                      .join("")
              }
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // TAB 6: DATA ISSUES
  // ==========================================================================
  private renderDataIssuesTab(): string {
    const rep = this.report!;
    if (rep.dataIssues.length === 0) {
      return `<div style="text-align: center; padding: 40px; color: #059669; font-weight: 600;">Không có lỗi dữ liệu cấu trúc (Data Issues Clean 100%)!</div>`;
    }

    return `
      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
          <thead>
            <tr style="background: #1F4E78; color: #ffffff;">
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1;">Loại</th>
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1; text-align: center;">Frame</th>
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1;">Item ID</th>
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1;">Annotation ID</th>
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1;">Chi tiết</th>
            </tr>
          </thead>
          <tbody>
            ${rep.dataIssues
              .map(
                (i, idx) => `
              <tr style="background: ${idx % 2 === 0 ? "#ffffff" : "#f8fafc"};">
                <td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-weight: 700; color: #b45309;">${i.kind}</td>
                <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 600;">${i.frame}</td>
                <td style="padding: 6px 10px; border: 1px solid #e2e8f0; color: #64748b;">${i.item_id}</td>
                <td style="padding: 6px 10px; border: 1px solid #e2e8f0;">${i.ann_id}</td>
                <td style="padding: 6px 10px; border: 1px solid #e2e8f0;">${i.detail}</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  // ==========================================================================
  // CÁC HÀM TIỆN ÍCH HIỂN THỊ LINK & GẮN SỰ KIỆN TƯƠNG TÁC
  // ==========================================================================

  private renderClickableFrameList(track: string, compressedStr: string): string {
    if (!compressedStr) return "";
    // Ví dụ compressedStr: "1-3, 7 (4)"
    const match = compressedStr.match(/^(.*?)\s*\((\d+)\)$/);
    if (!match) return compressedStr;

    const ranges = match[1].split(",");
    const count = match[2];

    const links = ranges.map((r) => {
      const trimmed = r.trim();
      const parts = trimmed.split("-");
      const firstFrame = parseInt(parts[0], 10);
      return `<a href="javascript:void(0)" class="qc-jump-track-frame" data-track="${track}" data-frame="${firstFrame}" style="color: #0284c7; text-decoration: underline;" title="Nhảy tới Frame ${firstFrame}">${trimmed}</a>`;
    });

    return `${links.join(", ")} <span style="color: #64748b;">(${count})</span>`;
  }

  private renderClickableTrackList(frame: number, tracksStr: string): string {
    if (!tracksStr) return "";
    // Chồng lấn: "1&2; 3&4", các loại khác: "1, 2"
    if (tracksStr.includes(";")) {
      const pairs = tracksStr.split(";").map((p) => p.trim());
      const res = pairs.map((pair) => {
        const parts = pair.split("&").map((t) => t.trim());
        const tLinks = parts.map(
          (t) =>
            `<a href="javascript:void(0)" class="qc-jump-track-frame" data-track="${t}" data-frame="${frame}" style="color: #0284c7; text-decoration: underline;">#${t}</a>`
        );
        return tLinks.join("&");
      });
      return res.join("; ");
    } else {
      const items = tracksStr.split(",").map((t) => t.trim());
      const res = items.map(
        (t) =>
          `<a href="javascript:void(0)" class="qc-jump-track-frame" data-track="${t}" data-frame="${frame}" style="color: #0284c7; text-decoration: underline;">#${t}</a>`
      );
      return res.join(", ");
    }
  }

  private attachEvents(): void {
    if (!this.overlay) return;

    // Nút Đóng Modal
    this.overlay.querySelector("#qc-close-btn")?.addEventListener("click", () => this.close());

    // Nạp file JSON
    const fileInput = this.overlay.querySelector("#qc-json-file-input") as HTMLInputElement;
    this.overlay.querySelector("#qc-open-file-btn")?.addEventListener("click", () => fileInput?.click());
    fileInput?.addEventListener("change", (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) this.loadJsonFile(file);
    });

    // Quét lại Job từ CVAT
    this.overlay.querySelector("#qc-rescan-job-btn")?.addEventListener("click", () => this.scanJobFromCVAT());

    // Xuất CSV Excel
    this.overlay.querySelector("#qc-download-csv-btn")?.addEventListener("click", () => this.downloadCsvReport());

    // Copy TSV Google Sheets
    this.overlay.querySelector("#qc-copy-tsv-btn")?.addEventListener("click", () => this.copyTsvReport());

    // Chuyển Tab
    this.overlay.querySelectorAll(".qc-tab-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const tab = (e.currentTarget as HTMLElement).getAttribute("data-tab") as QCStudioTab;
        if (tab) {
          this.currentTab = tab;
          this.render();
        }
      });
    });

    // Tìm kiếm trong Tab All Issues
    const searchInput = this.overlay.querySelector("#qc-search-kw-input") as HTMLInputElement;
    searchInput?.addEventListener("input", (e) => {
      this.searchKeyword = (e.target as HTMLInputElement).value;
      const content = this.overlay?.querySelector("#qc-tab-content");
      if (content) content.innerHTML = this.renderActiveTabContent();
      this.attachContentEvents();
    });

    // Lọc loại kiểm tra trong Tab All Issues
    const checkSelect = this.overlay.querySelector("#qc-check-filter-select") as HTMLSelectElement;
    checkSelect?.addEventListener("change", (e) => {
      this.selectedCheckFilter = (e.target as HTMLSelectElement).value;
      const content = this.overlay?.querySelector("#qc-tab-content");
      if (content) content.innerHTML = this.renderActiveTabContent();
      this.attachContentEvents();
    });

    this.attachContentEvents();
  }

  private attachContentEvents(): void {
    if (!this.overlay) return;

    // Click link nhảy frame
    this.overlay.querySelectorAll(".qc-jump-frame-link").forEach((link) => {
      link.addEventListener("click", (e) => {
        const f = Number((e.currentTarget as HTMLElement).getAttribute("data-frame"));
        if (!isNaN(f)) this.navigateToFrame(f);
      });
    });

    // Click link nhảy Track và Frame
    this.overlay.querySelectorAll(".qc-jump-track-frame").forEach((link) => {
      link.addEventListener("click", (e) => {
        const el = e.currentTarget as HTMLElement;
        const track = Number(el.getAttribute("data-track"));
        const frame = Number(el.getAttribute("data-frame"));
        if (!isNaN(frame)) {
          this.navigateToTrackAndFrame(!isNaN(track) ? track : 1, frame);
        }
      });
    });

    // Click ô trong Ma trận Matrix
    this.overlay.querySelectorAll(".qc-matrix-cell").forEach((cell) => {
      cell.addEventListener("click", (e) => {
        const el = e.currentTarget as HTMLElement;
        const track = Number(el.getAttribute("data-track"));
        const frame = Number(el.getAttribute("data-frame"));
        if (!isNaN(frame)) {
          this.navigateToTrackAndFrame(!isNaN(track) ? track : 1, frame);
        }
      });
    });

    // Click hàng trong All Issues
    this.overlay.querySelectorAll(".qc-issue-row").forEach((row) => {
      row.addEventListener("click", (e) => {
        const el = e.currentTarget as HTMLElement;
        const track = Number(el.getAttribute("data-track"));
        const frame = Number(el.getAttribute("data-frame"));
        if (!isNaN(frame)) {
          this.navigateToTrackAndFrame(!isNaN(track) ? track : 1, frame);
        }
      });
    });
  }

  private getActiveSheetName(): "All_Issues" | "By_Track" | "By_Frame" | "Summary" | "Data_Issues" | "Matrix" {
    switch (this.currentTab) {
      case "by_track":
        return "By_Track";
      case "by_frame":
        return "By_Frame";
      case "matrix":
        return "Matrix";
      case "summary":
        return "Summary";
      case "data_issues":
        return "Data_Issues";
      case "all_issues":
      default:
        return "All_Issues";
    }
  }

  /**
   * Tải xuống báo cáo CSV UTF-8 kèm BOM theo Sheet tương ứng với Tab hiện tại
   */
  private downloadCsvReport(): void {
    if (!this.report) return;
    const sheet = this.getActiveSheetName();
    const csvContent = exportReportToCsv(this.report, sheet);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `datumaro_qa_${sheet.toLowerCase()}_${this.currentCtx?.jobId || "export"}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.showToast(`Đã xuất sheet ${sheet} dạng CSV UTF-8 with BOM (Excel)`);
  }

  /**
   * Sao chép TSV vào Clipboard theo Sheet tương ứng với Tab hiện tại để dán 1-click vào Google Sheets
   */
  private copyTsvReport(): void {
    if (!this.report) return;
    const sheet = this.getActiveSheetName();
    const tsvContent = exportReportToTsv(this.report, sheet);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(tsvContent)
        .then(() => {
          this.showToast(`Đã copy sheet ${sheet} (TSV)! Bạn có thể dán (Ctrl+V) thẳng vào Google Sheets.`);
        })
        .catch(() => {
          this.fallbackCopyText(tsvContent);
        });
    } else {
      this.fallbackCopyText(tsvContent);
    }
  }

  private fallbackCopyText(text: string): void {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    this.showToast("Đã copy TSV vào Clipboard!");
  }

  private navigateToFrame(frame: number): void {
    CVATBridge.jumpToFrame(frame);
    this.close();
    this.showToast(`Đã chuyển tới Frame #${frame}`);
  }

  private navigateToTrackAndFrame(trackId: number, frame: number): void {
    CVATBridge.jumpToFrame(frame);
    CVATBridge.activateObject(trackId);
    CVATBridge.centerCanvas3DOnTrack(trackId);
    this.close();
    this.showToast(`Đã chuyển tới Frame #${frame} & Focus Track #${trackId}`);
  }

  private showToast(msg: string): void {
    try {
      let toast = document.getElementById("cvat-3d-qc-studio-floating-toast");
      if (!toast) {
        toast = document.createElement("div");
        toast.id = "cvat-3d-qc-studio-floating-toast";
        toast.style.position = "fixed";
        toast.style.bottom = "24px";
        toast.style.left = "50%";
        toast.style.transform = "translateX(-50%)";
        toast.style.zIndex = "9999999";
        toast.style.background = "#0f172a";
        toast.style.color = "#ffffff";
        toast.style.padding = "8px 18px";
        toast.style.borderRadius = "9999px";
        toast.style.fontSize = "12px";
        toast.style.fontWeight = "600";
        toast.style.boxShadow = "0 10px 25px -4px rgba(0, 0, 0, 0.25)";
        toast.style.pointerEvents = "none";
        toast.style.transition = "opacity 0.3s ease";
        document.body.appendChild(toast);
      }
      toast.textContent = msg;
      toast.style.opacity = "1";
      setTimeout(() => {
        if (toast) toast.style.opacity = "0";
      }, 2500);
    } catch (_) {}
  }
}
