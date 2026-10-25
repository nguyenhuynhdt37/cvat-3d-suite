/**
 * src/core/qc/qc_engine.ts
 * Bộ máy kiểm định chất lượng dữ liệu 3D LiDAR (CVAT 3D QC Suite)
 * Port chuẩn xác 100% toàn bộ thuật toán toán học và logic từ datumaro_qa.py
 */

import {
  DEFAULT_DATUMARO_QA_CONFIG,
  DEFAULT_QC_CONFIG,
  CHECK_NAME,
  CHECK_CODE,
  CHECKS_LIST,
  type DatumaroQAConfig,
  type QCConfig,
  type DatumaroDataset,
  type QCIssueRecord,
  type QCDataIssue,
  type QCTrackSummary,
  type QCFrameSummary,
  type QCMatrixRow,
  type QCMatrixCellInfo,
  type QCSummaryData,
  type DatumaroQAReport,
  type QCObjectInstance,
  type QCIssue,
  type QCJobReport,
  type QCSingleObjectSummary,
  type QCCheckCode,
  type QCSeverity,
} from "./types.ts";

export { CHECK_NAME, CHECK_CODE, CHECKS_LIST, DEFAULT_QC_CONFIG };

import { bevOverlap, rectCorners, polyArea, clipConvex } from "./bev_overlap.ts";
import {
  countPointsInsideBox,
  checkEmptyOrSparseBox,
  checkGroundMismatch,
  checkMotionYawMismatch,
} from "./lidar_qc.ts";

export {
  bevOverlap,
  rectCorners,
  polyArea,
  clipConvex,
  countPointsInsideBox,
  checkEmptyOrSparseBox,
  checkGroundMismatch,
  checkMotionYawMismatch,
};

// ============================================================================
// TIỆN ÍCH CƠ BẢN (KHỚP 100% datumaro_qa.py)
// ============================================================================

export const AXES = ["length", "width", "height"] as const;

export function deepMerge<T extends Record<string, any>>(base: T, override: Partial<T>): T {
  const out = JSON.parse(JSON.stringify(base)) as T;
  for (const [k, v] of Object.entries(override || {})) {
    if (v !== undefined) {
      if (typeof v === "object" && v !== null && !Array.isArray(v) && typeof (out as any)[k] === "object") {
        (out as any)[k] = deepMerge((out as any)[k], v);
      } else {
        (out as any)[k] = v;
      }
    }
  }
  return out;
}

export function normName(s: any): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeLabelName(label: string): string {
  return normName(label);
}

export type DetectedCategory = "car" | "pedestrian" | "cyclist";

/**
 * Nhận diện loại đối tượng ("car" | "pedestrian" | "cyclist") từ chuỗi nhãn bất kỳ
 * Hỗ trợ đa ngôn ngữ, không phân biệt hoa thường, chống typo và tương thích ngược hoàn hảo
 */
export function detectObjectCategory(label: string): DetectedCategory {
  const raw = String(label || "").trim();
  if (!raw) return "car";

  const l = raw.toLowerCase();
  const spaced = l.replace(/[\s_\-\.\/]+/g, " ").trim();
  const unaccented = spaced
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d");
  const compact = unaccented.replace(/\s+/g, "");

  // 1. Phân loại NGƯỜI ĐI BỘ (Ưu tiên kiểm tra, phòng vệ loại trừ moped)
  const isPedMatch =
    /\b(ped|peds|pedestrian|pedestrians|person|persons|people|human|humans|walker|walkers|walking|child|children|kid|kids|baby|babies|infant|infants|toddler|toddlers|stroller|strollers|pram|prams|bystander|bystanders|jogger|joggers|runner|runners)\b/i.test(spaced) ||
    unaccented.includes("pedestrian") ||
    unaccented.includes("nguoi di bo") ||
    unaccented.includes("khach bo hanh") ||
    unaccented.includes("bo hanh") ||
    compact.includes("nguoidibo") ||
    (unaccented.includes("nguoi") && !unaccented.includes("lai") && !unaccented.includes("may")) ||
    ((l.startsWith("ped_") || l.startsWith("ped-") || l.startsWith("ped.") || l === "ped" || l === "peds") && !l.includes("moped"));

  if (isPedMatch && !l.includes("moped")) {
    return "pedestrian";
  }

  // 2. Phân loại XE 2 BÁNH (Cyclist / Two-Wheeler / Motorcycle / Bicycle)
  const isTwoWheelCombo =
    /(?:two|tow|2)[\s_\-\.]*(?:wheels?|wheelers?|wheeled|whels?)/i.test(l) ||
    compact.includes("twowheel") ||
    compact.includes("towwheel") ||
    compact.includes("twowhel") ||
    compact.includes("towwhel") ||
    compact.includes("2wheel");

  const isCyclistMatch =
    isTwoWheelCombo ||
    /\b(cyclist|cyclists|cycling|cycle|cycles|bicycle|bicycles|bike|bikes|biking|motorcycle|motorcycles|motorbike|motorbikes|motobike|motobikes|moto|motos|scooter|scooters|moped|mopeds|rider|riders|tricycle|trike)\b/i.test(spaced) ||
    compact.includes("motorcycle") ||
    compact.includes("motorbike") ||
    compact.includes("motobike") ||
    compact.includes("moped") ||
    compact.includes("scooter") ||
    compact.includes("escooter") ||
    compact.includes("ebike") ||
    unaccented.includes("xe may") ||
    compact.includes("xemay") ||
    unaccented.includes("xe dap") ||
    compact.includes("xedap") ||
    unaccented.includes("xe 2 banh") ||
    compact.includes("xe2banh") ||
    unaccented.includes("xe hai banh") ||
    compact.includes("xehaibanh");

  if (isCyclistMatch) {
    return "cyclist";
  }

  return "car";
}

/**
 * Phân loại tên nhãn vào nhóm class: "vehicle" | "two_wheel" | "pedestrian" | "other"
 * Khớp 100% classify(label, lookup) trong datumaro_qa.py
 */
export function classify(label: string, lookup: Record<string, string>): string | null {
  const n = normName(label);
  if (lookup[n]) return lookup[n];
  if (n.endsWith("s") && lookup[n.slice(0, -1)]) {
    return lookup[n.slice(0, -1)];
  }
  return null;
}

export function classifyLabelGroup(
  label: string,
  cfg: DatumaroQAConfig | QCConfig = DEFAULT_DATUMARO_QA_CONFIG
): "vehicle" | "two_wheel" | "pedestrian" | "other" {
  const classGroups = cfg.class_groups || (cfg as any).classGroups || DEFAULT_DATUMARO_QA_CONFIG.class_groups;
  const lookup: Record<string, string> = {};
  for (const [grp, names] of Object.entries(classGroups)) {
    lookup[normName(grp)] = grp;
    for (const n of names) {
      lookup[normName(n)] = grp;
    }
  }

  const grp = classify(label, lookup);
  if (grp === "vehicle" || grp === "two_wheel" || grp === "pedestrian") {
    return grp;
  }

  // Fallback qua bộ phân loại thông minh
  const detected = detectObjectCategory(label);
  if (detected === "pedestrian") return "pedestrian";
  if (detected === "cyclist") return "two_wheel";
  if (detected === "car") {
    const norm = normName(label);
    if (
      norm.includes("car") ||
      norm.includes("truck") ||
      norm.includes("bus") ||
      norm.includes("van") ||
      norm.includes("vehicle") ||
      norm.includes("suv")
    ) {
      return "vehicle";
    }
  }

  return "other";
}

/**
 * Nén mảng frame thành chuỗi ngắn gọn [1,2,3,7,9,10] -> '1-3, 7, 9-10'
 * Khớp 100% compress_frames(frames) trong datumaro_qa.py
 */
export function compressFrames(frames: Iterable<number>): string {
  const fs = Array.from(new Set(frames)).sort((a, b) => a - b);
  if (fs.length === 0) return "";
  const parts: string[] = [];
  let i = 0;
  while (i < fs.length) {
    let j = i;
    while (j + 1 < fs.length && fs[j + 1] === fs[j] + 1) {
      j += 1;
    }
    parts.push(i === j ? String(fs[i]) : `${fs[i]}-${fs[j]}`);
    i = j + 1;
  }
  return parts.join(", ");
}

/**
 * Định dạng kích thước L x W x H
 */
export function fmtSize(s: [number, number, number] | number[]): string {
  return `${s[0].toFixed(2)} x ${s[1].toFixed(2)} x ${s[2].toFixed(2)}`;
}

export function formatSize(l: number, w: number, h: number): string {
  return `${l.toFixed(2)} x ${w.toFixed(2)} x ${h.toFixed(2)}`;
}

/**
 * Trích xuất chỉ số frame từ item Datumaro
 * Khớp 100% frame_of(item, idx) trong datumaro_qa.py
 */
export function frameOf(item: any, idx: number): number {
  const attr = item?.attr || {};
  if (attr.frame !== undefined && attr.frame !== null) {
    const parsed = parseInt(String(attr.frame), 10);
    if (!isNaN(parsed)) return parsed;
  }
  const idStr = String(item?.id || "");
  const m = idStr.match(/(\d+)(?!.*\d)/);
  if (m) {
    const parsed = parseInt(m[1], 10);
    if (!isNaN(parsed)) return parsed;
  }
  return idx;
}

/**
 * Chuyển đổi track_id sang chuỗi hiển thị khớp CVAT
 * Khớp 100% display_track_id(tid, offset) trong datumaro_qa.py
 */
export function displayTrackId(tid: any, offset: number): string {
  try {
    const s = String(tid ?? "").trim();
    if (/^-?\d+$/.test(s)) {
      return String(parseInt(s, 10) + offset);
    }
    return s;
  } catch (_) {
    return String(tid);
  }
}

/**
 * Tính chênh lệch góc giữa 2 góc (radian), trả về độ dương [0, 180]
 * Khớp 100% angle_diff_deg(a, b) trong datumaro_qa.py (floored modulo)
 */
export function calcAngleDiffDeg(a: number, b: number): number {
  const twoPi = 2 * Math.PI;
  let rem = (b - a + Math.PI) % twoPi;
  if (rem < 0) rem += twoPi;
  const d = rem - Math.PI;
  return Math.abs(d * (180 / Math.PI));
}

// ============================================================================
// LỚP ĐỐI TƯỢNG CUBOID CHUẨN DATUMARO (DatumaroObj)
// ============================================================================

export class DatumaroObj {
  public frame: number;
  public item_id: string;
  public ann_id: string | number;
  public track: string;
  public has_track: boolean;
  public label: string;
  public group: string | null;
  public pos: [number, number, number];
  public rot: [number, number, number];
  public scale: [number, number, number];

  constructor(
    frame: number,
    item_id: string,
    ann_id: string | number,
    track: string,
    has_track: boolean,
    label: string,
    group: string | null,
    pos: [number, number, number],
    rot: [number, number, number],
    scale: [number, number, number]
  ) {
    this.frame = frame;
    this.item_id = item_id;
    this.ann_id = ann_id;
    this.track = track;
    this.has_track = has_track;
    this.label = label;
    this.group = group;
    this.pos = pos;
    this.rot = rot;
    this.scale = scale;
  }

  public get yaw(): number {
    return this.rot[2];
  }
}

// ============================================================================
// ĐỌC VÀ CHUẨN HÓA DỮ LIỆU DATUMARO 1.0 (loadObjects)
// ============================================================================

export function buildLookup(cfg: DatumaroQAConfig): Record<string, string> {
  const lookup: Record<string, string> = {};
  for (const [grp, names] of Object.entries(cfg.class_groups)) {
    lookup[normName(grp)] = grp;
    for (const n of names) {
      lookup[normName(n)] = grp;
    }
  }
  return lookup;
}

export function loadObjects(
  data: DatumaroDataset | any,
  cfg: DatumaroQAConfig = DEFAULT_DATUMARO_QA_CONFIG
): { objs: DatumaroObj[]; issues: QCDataIssue[]; meta: any } {
  if (!data || typeof data !== "object") {
    throw new Error("Dữ liệu đầu vào không phải là đối tượng JSON Datumaro hợp lệ");
  }

  const version = String(data.dm_format_version || "") || "(không có)";
  const labels: string[] = ((data.categories?.label?.labels as any[]) || []).map(
    (c: any) => c?.name || ""
  );

  const lookup = buildLookup(cfg);
  const objs: DatumaroObj[] = [];
  const issues: QCDataIssue[] = [];
  const unknownLabels = new Map<string, number>();
  const frameItems: Record<number, string> = {};
  let nItems = 0;

  const items = Array.isArray(data.items) ? data.items : [];
  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    nItems += 1;
    const frame = frameOf(item, idx);
    const itemId = String(item?.id ?? "");
    frameItems[frame] = itemId;

    const annotations = Array.isArray(item?.annotations) ? item.annotations : [];
    for (const ann of annotations) {
      if (ann?.type !== "cuboid_3d") {
        continue;
      }
      const attrs = ann?.attributes || {};
      if (attrs.outside) {
        continue;
      }
      const annId = ann?.id ?? "";

      let pos: [number, number, number];
      let rot: [number, number, number];
      let scl: [number, number, number];

      try {
        if (!Array.isArray(ann.position) || !Array.isArray(ann.rotation) || !Array.isArray(ann.scale)) {
          throw new Error("cần đủ position, rotation, scale dạng mảng");
        }
        pos = [Number(ann.position[0]), Number(ann.position[1]), Number(ann.position[2])];
        rot = [Number(ann.rotation[0]), Number(ann.rotation[1]), Number(ann.rotation[2])];
        scl = [
          Math.abs(Number(ann.scale[0])),
          Math.abs(Number(ann.scale[1])),
          Math.abs(Number(ann.scale[2])),
        ];

        if (
          pos.some(isNaN) ||
          rot.some(isNaN) ||
          scl.some(isNaN) ||
          pos.length < 3 ||
          rot.length < 3 ||
          scl.length < 3
        ) {
          throw new Error("cần đủ 3 giá trị số hợp lệ");
        }
      } catch (e: any) {
        issues.push({
          kind: "Cuboid lỗi",
          frame,
          item_id: itemId,
          ann_id: annId,
          detail: `position/rotation/scale không hợp lệ: ${e?.message || e}`,
        });
        continue;
      }

      if (cfg.rotation_unit === "deg") {
        rot = [
          (rot[0] * Math.PI) / 180,
          (rot[1] * Math.PI) / 180,
          (rot[2] * Math.PI) / 180,
        ];
      }

      const lid = ann.label_id;
      const label =
        typeof lid === "number" && lid >= 0 && lid < labels.length
          ? labels[lid]
          : `label_${lid}`;
      const group = classify(label, lookup);
      if (group === null) {
        unknownLabels.set(label, (unknownLabels.get(label) || 0) + 1);
      }

      const tid = attrs.track_id;
      const hasTrack = tid !== undefined && tid !== null && String(tid).trim() !== "";
      const track = hasTrack
        ? displayTrackId(tid, cfg.track_id_offset)
        : `(no_track)#${annId}@${frame}`;

      if (!hasTrack) {
        issues.push({
          kind: "Thiếu track_id",
          frame,
          item_id: itemId,
          ann_id: annId,
          detail: `label=${label}`,
        });
      }

      objs.push(
        new DatumaroObj(
          frame,
          itemId,
          annId,
          track,
          hasTrack,
          label,
          group,
          pos,
          rot,
          scl
        )
      );
    }
  }

  for (const [lb, n] of unknownLabels.entries()) {
    issues.push({
      kind: "Class không nhận dạng",
      frame: "",
      item_id: "",
      ann_id: "",
      detail: `label '${lb}' (${n} obj) không thuộc nhóm nào trong class_groups -> bỏ qua các kiểm tra theo class`,
    });
  }

  // track_id trùng trong 1 frame
  const seen = new Map<string, DatumaroObj[]>();
  for (const o of objs) {
    if (o.has_track) {
      const key = `${o.frame}__${o.track}`;
      const arr = seen.get(key) || [];
      arr.push(o);
      seen.set(key, arr);
    }
  }

  for (const [key, lst] of seen.entries()) {
    if (lst.length > 1) {
      const [fStr, tr] = key.split("__");
      issues.push({
        kind: "track_id trùng trong 1 frame",
        frame: parseInt(fStr, 10),
        item_id: lst[0].item_id,
        ann_id: lst.map((x) => x.ann_id).join(","),
        detail: `track ${tr} xuất hiện ${lst.length} lần trong frame`,
      });
    }
  }

  const uniqueTracks = new Set(objs.filter((o) => o.has_track).map((o) => o.track));
  const meta = {
    version,
    n_items: nItems,
    n_objs: objs.length,
    frame_items: frameItems,
    n_tracks: uniqueTracks.size,
  };

  return { objs, issues, meta };
}

export function groupTracks(objs: DatumaroObj[]): Map<string, DatumaroObj[]> {
  const tracks = new Map<string, DatumaroObj[]>();
  for (const o of objs) {
    const arr = tracks.get(o.track) || [];
    arr.push(o);
    tracks.set(o.track, arr);
  }
  for (const lst of tracks.values()) {
    lst.sort((a, b) => a.frame - b.frame);
  }
  return tracks;
}

export function rec(
  o: DatumaroObj,
  check: "scale" | "size" | "z" | "rot" | "overlap" | "dist",
  detail: string,
  value: string | number = "",
  ref: string = "",
  other: string = ""
): QCIssueRecord {
  return {
    frame: o.frame,
    item_id: o.item_id,
    track: o.track,
    label: o.label,
    check,
    detail,
    value,
    ref,
    other,
  };
}

// ============================================================================
// 6 BÀI KIỂM ĐỊNH TOÁN HỌC CHUẨN (100% THEO datumaro_qa.py)
// ============================================================================

/**
 * 1. SCALE SYNC: Kiểm tra đồng bộ kích thước qua các frame của 1 track
 * Chuẩn = trung vị (median) theo từng trục.
 */
export function fmtSigned(val: number): string {
  const rounded = val.toFixed(2);
  if (rounded === "-0.00" || rounded === "0.00") return "+0.00";
  return val > 0 ? `+${rounded}` : rounded;
}

export function checkScaleSync(
  tracks: Map<string, DatumaroObj[]>,
  cfg: DatumaroQAConfig
): QCIssueRecord[] {
  const recs: QCIssueRecord[] = [];
  const tol = cfg.scale_sync_tol + 1e-9;

  for (const [, fullLst] of tracks.entries()) {
    const lst = fullLst.filter((o) => o.group && cfg.scale_sync_groups.includes(o.group));
    if (lst.length < 2) continue;

    const ref: [number, number, number] = [0, 1, 2].map((a) => {
      const sortedVals = lst.map((o) => o.scale[a]).sort((x, y) => x - y);
      return sortedVals[Math.floor(lst.length / 2)];
    }) as [number, number, number];

    for (const o of lst) {
      const d = [o.scale[0] - ref[0], o.scale[1] - ref[1], o.scale[2] - ref[2]];
      if (Math.abs(d[0]) > tol || Math.abs(d[1]) > tol || Math.abs(d[2]) > tol) {
        recs.push(
          rec(
            o,
            "scale",
            `Scale lệch so với kích thước chuẩn của track (chênh L ${fmtSigned(d[0])}, W ${fmtSigned(d[1])}, H ${fmtSigned(d[2])} m)`,
            fmtSize(o.scale),
            fmtSize(ref)
          )
        );
      }
    }
  }

  return recs;
}

/**
 * 2. SIZE RANGE: Kiểm tra kích thước ngoài dải catalog của class
 */
export function checkSize(
  objs: DatumaroObj[],
  cfg: DatumaroQAConfig
): QCIssueRecord[] {
  const eps = cfg.size_eps;
  const recs: QCIssueRecord[] = [];

  for (const o of objs) {
    if (!o.group) continue;
    const lim = cfg.size_limits[o.group];
    if (!lim) continue;

    const parts: string[] = [];
    let over = false;
    let under = false;

    for (let ai = 0; ai < 3; ai++) {
      const axisName = AXES[ai];
      const [lo, hi] = lim[axisName];
      const v = o.scale[ai];
      const capAxis = axisName.charAt(0).toUpperCase() + axisName.slice(1);
      if (v > hi + eps) {
        parts.push(`${capAxis} ${v.toFixed(2)} > ${hi}`);
        over = true;
      } else if (v < lo - eps) {
        parts.push(`${capAxis} ${v.toFixed(2)} < ${lo}`);
        under = true;
      }
    }

    if (parts.length === 0) continue;

    const hint = cfg.size_over_hint[o.group];
    const notes: string[] = [];
    if (over) {
      notes.push("lớn hơn ngưỡng - " + (hint ? hint : "cần kiểm tra kích thước"));
    }
    if (under) {
      notes.push("nhỏ hơn ngưỡng - cần kiểm tra kích thước");
    }

    const ref = `L ${lim.length[0]}~${lim.length[1]}, W ${lim.width[0]}~${lim.width[1]}, H ${lim.height[0]}~${lim.height[1]}`;
    recs.push(
      rec(
        o,
        "size",
        `${parts.join("; ")} (${notes.join("; ")})`,
        fmtSize(o.scale),
        ref
      )
    );
  }

  return recs;
}

/**
 * 3. Z RANGE: Kiểm tra cao độ Z ngoài khoảng [-3.0, 3.0]
 */
export function checkZ(
  objs: DatumaroObj[],
  cfg: DatumaroQAConfig
): QCIssueRecord[] {
  const recs: QCIssueRecord[] = [];

  for (const o of objs) {
    const z = o.pos[2];
    let d = "";
    if (z > cfg.z_max) {
      d = `z = ${z.toFixed(2)} > ${cfg.z_max}: obj cao hơn mặt đường`;
    } else if (z < cfg.z_min) {
      d = `z = ${z.toFixed(2)} < ${cfg.z_min}: obj thấp hơn mặt đường`;
    } else {
      continue;
    }

    recs.push(
      rec(
        o,
        "z",
        d,
        Math.round(z * 1000) / 1000,
        `${cfg.z_min} ~ ${cfg.z_max}`
      )
    );
  }

  return recs;
}

/**
 * 4. ROTATION JUMP: Kiểm tra Yaw đổi hướng đột ngột > 75 độ
 */
export function checkRotation(
  tracks: Map<string, DatumaroObj[]>,
  cfg: DatumaroQAConfig
): QCIssueRecord[] {
  const recs: QCIssueRecord[] = [];
  const thr = cfg.max_rotation_jump_deg;
  const gap = cfg.max_frame_gap;

  for (const [, fullLst] of tracks.entries()) {
    const lst = fullLst.filter((o) => o.group && cfg.rotation_check_groups.includes(o.group));
    for (let i = 0; i < lst.length - 1; i++) {
      const prev = lst[i];
      const cur = lst[i + 1];
      if (cur.frame - prev.frame > gap) {
        continue;
      }
      const d = calcAngleDiffDeg(prev.yaw, cur.yaw);
      if (d > thr) {
        const prevDeg = (prev.yaw * 180) / Math.PI;
        const curDeg = (cur.yaw * 180) / Math.PI;
        recs.push(
          rec(
            cur,
            "rot",
            `Obj thay đổi hướng đột ngột ${d.toFixed(1)}° (yaw ${prevDeg.toFixed(1)}° ở frame ${prev.frame} -> ${curDeg.toFixed(1)}° ở frame ${cur.frame})`,
            Math.round(d * 100) / 100,
            `≤ ${thr}°`
          )
        );
      }
    }
  }

  return recs;
}

/**
 * 5. OVERLAP: Chồng lấn đa giác BEV (IoU / IoA)
 * Mỗi cặp chồng lấn tạo 2 issue (1 cho mỗi track) để không sót khi lọc theo track.
 */
export function checkOverlap(
  objs: DatumaroObj[],
  cfg: DatumaroQAConfig
): QCIssueRecord[] {
  const byFrame = new Map<number, DatumaroObj[]>();
  for (const o of objs) {
    if (o.group && o.group in cfg.overlap_allowed) {
      const arr = byFrame.get(o.frame) || [];
      arr.push(o);
      byFrame.set(o.frame, arr);
    }
  }

  const metric = (cfg.overlap_metric || "iou").toLowerCase();
  const recs: QCIssueRecord[] = [];

  for (const [, lst] of byFrame.entries()) {
    const n = lst.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = lst[i];
        const b = lst[j];

        const { intersectionArea: inter, iou, ioa } = bevOverlap(a, b);
        if (inter < cfg.overlap_min_area) {
          continue;
        }

        const allowedA = cfg.overlap_allowed[a.group!] ?? 0.0;
        const allowedB = cfg.overlap_allowed[b.group!] ?? 0.0;
        const allowed = Math.min(allowedA, allowedB);
        const val = metric === "ioa" ? ioa : iou;

        if (allowed > 0 && val <= allowed) {
          continue;
        }

        const rule =
          allowed <= 0
            ? "Không cho phép chồng lấn"
            : `Cho phép tối đa ${(allowed * 100).toFixed(0)}% (${metric.toUpperCase()})`;
        const stats = `IoU ${iou.toFixed(3)}, IoA ${ioa.toFixed(3)}, diện tích giao ${inter.toFixed(3)} m²`;

        recs.push(
          rec(
            a,
            "overlap",
            `Chồng lấn với track ${b.track} (${b.label}): ${stats}`,
            Math.round(val * 10000) / 10000,
            rule,
            b.track
          )
        );
        recs.push(
          rec(
            b,
            "overlap",
            `Chồng lấn với track ${a.track} (${a.label}): ${stats}`,
            Math.round(val * 10000) / 10000,
            rule,
            a.track
          )
        );
      }
    }
  }

  return recs;
}

/**
 * 6. DISTANCE: Kiểm tra cự ly 3D từ gốc tọa độ > 100m
 */
export function checkDistance(
  objs: DatumaroObj[],
  cfg: DatumaroQAConfig
): QCIssueRecord[] {
  const recs: QCIssueRecord[] = [];
  const lim = cfg.max_distance;

  for (const o of objs) {
    const d = Math.sqrt(o.pos[0] * o.pos[0] + o.pos[1] * o.pos[1] + o.pos[2] * o.pos[2]);
    if (d > lim) {
      recs.push(
        rec(
          o,
          "dist",
          `Cách gốc tọa độ ${d.toFixed(2)} m (> ${lim} m): obj ở quá xa, cần kiểm tra`,
          Math.round(d * 100) / 100,
          `≤ ${lim} m`
        )
      );
    }
  }

  return recs;
}

/**
 * Sắp xếp các track theo thứ tự số (hoặc chuỗi nếu không phải số)
 */
export function sortTrackKey(a: string | number, b: string | number): number {
  const sa = String(a).trim();
  const sb = String(b).trim();
  const isNumA = /^\d+$/.test(sa);
  const isNumB = /^\d+$/.test(sb);
  if (isNumA && isNumB) {
    return parseInt(sa, 10) - parseInt(sb, 10);
  }
  if (isNumA && !isNumB) return -1;
  if (!isNumA && isNumB) return 1;
  return sa.localeCompare(sb);
}

// ============================================================================
// TỔNG HỢP TOÀN BỘ BÁO CÁO DATUMARO QA (generateDatumaroQAReport)
// ============================================================================

export function runChecks(
  objs: DatumaroObj[],
  issues: QCDataIssue[],
  cfg: DatumaroQAConfig
): {
  scale: QCIssueRecord[];
  size: QCIssueRecord[];
  z: QCIssueRecord[];
  rot: QCIssueRecord[];
  overlap: QCIssueRecord[];
  dist: QCIssueRecord[];
  issues: QCDataIssue[];
} {
  const tracks = groupTracks(objs);
  return {
    scale: checkScaleSync(tracks, cfg),
    size: checkSize(objs, cfg),
    z: checkZ(objs, cfg),
    rot: checkRotation(tracks, cfg),
    overlap: checkOverlap(objs, cfg),
    dist: checkDistance(objs, cfg),
    issues,
  };
}

export function generateDatumaroQAReport(
  objs: DatumaroObj[],
  issues: QCDataIssue[],
  meta: any,
  cfg: DatumaroQAConfig = DEFAULT_DATUMARO_QA_CONFIG,
  inPath: string = "in-memory-cvat-job.json"
): DatumaroQAReport {
  const results = runChecks(objs, issues, cfg);

  const orderMap: Record<string, number> = {
    scale: 0,
    size: 1,
    z: 2,
    rot: 3,
    overlap: 4,
    dist: 5,
  };

  const codeOrderMap: Record<string, number> = {
    S: 0,
    K: 1,
    Z: 2,
    H: 3,
    O: 4,
    D: 5,
  };

  const rawRecs: QCIssueRecord[] = [
    ...results.scale,
    ...results.size,
    ...results.z,
    ...results.rot,
    ...results.overlap,
    ...results.dist,
  ];

  rawRecs.sort((a, b) => {
    const tCmp = sortTrackKey(a.track, b.track);
    if (tCmp !== 0) return tCmp;
    if (a.frame !== b.frame) return a.frame - b.frame;
    return (orderMap[a.check] ?? 99) - (orderMap[b.check] ?? 99);
  });

  const presence = new Map<string, Set<number>>();
  const labelOf = new Map<string, string>();
  const frameSet = new Set<number>();
  if (meta?.frame_items) {
    for (const f of Object.keys(meta.frame_items)) {
      frameSet.add(parseInt(f, 10));
    }
  }

  const objsPerFrame = new Map<number, number>();
  for (const o of objs) {
    let pr = presence.get(o.track);
    if (!pr) {
      pr = new Set<number>();
      presence.set(o.track, pr);
    }
    pr.add(o.frame);
    if (!labelOf.has(o.track)) {
      labelOf.set(o.track, o.label);
    }
    frameSet.add(o.frame);
    objsPerFrame.set(o.frame, (objsPerFrame.get(o.frame) || 0) + 1);
  }

  for (const r of rawRecs) {
    frameSet.add(r.frame);
  }
  const allFrames = Array.from(frameSet).sort((a, b) => a - b);

  // byTrack: track -> check -> Set<frame>
  const byTrackMap = new Map<string, Map<string, Set<number>>>();
  const trackN = new Map<string, number>();
  // byFrame: frame -> check -> string[]
  const byFrameMap = new Map<number, Map<string, string[]>>();
  const frameN = new Map<number, number>();
  const frameTracks = new Map<number, Set<string>>();
  // codes: `${track}__${frame}` -> Set<symbol>
  const codesMap = new Map<string, Set<string>>();

  for (const r of rawRecs) {
    const t = r.track;
    const f = r.frame;
    const k = r.check;

    let trChecks = byTrackMap.get(t);
    if (!trChecks) {
      trChecks = new Map<string, Set<number>>();
      byTrackMap.set(t, trChecks);
    }
    let fSet = trChecks.get(k);
    if (!fSet) {
      fSet = new Set<number>();
      trChecks.set(k, fSet);
    }
    fSet.add(f);

    trackN.set(t, (trackN.get(t) || 0) + 1);
    frameN.set(f, (frameN.get(f) || 0) + 1);

    let frTrs = frameTracks.get(f);
    if (!frTrs) {
      frTrs = new Set<string>();
      frameTracks.set(f, frTrs);
    }
    frTrs.add(t);

    const tfKey = `${t}__${f}`;
    let cSet = codesMap.get(tfKey);
    if (!cSet) {
      cSet = new Set<string>();
      codesMap.set(tfKey, cSet);
    }
    cSet.add(CHECK_CODE[k]);

    let frChecks = byFrameMap.get(f);
    if (!frChecks) {
      frChecks = new Map<string, string[]>();
      byFrameMap.set(f, frChecks);
    }
    let frItems = frChecks.get(k);
    if (!frItems) {
      frItems = [];
      frChecks.set(k, frItems);
    }

    if (k === "overlap") {
      const pair = [String(t), String(r.other)].sort(sortTrackKey).join("&");
      if (!frItems.includes(pair)) {
        frItems.push(pair);
      }
    } else if (!frItems.includes(String(t))) {
      frItems.push(String(t));
    }
  }

  // 1. By_Track
  const byTrackRows: QCTrackSummary[] = [];
  const sortedTrackKeys = Array.from(byTrackMap.keys()).sort(sortTrackKey);
  for (const t of sortedTrackKeys) {
    const prArr = Array.from(presence.get(t) || []).sort((a, b) => a - b);
    const trChecks = byTrackMap.get(t)!;
    const checkFrames: Record<string, string> = {};
    const allIssueFrames = new Set<number>();

    for (const { key } of CHECKS_LIST) {
      const fs = trChecks.get(key);
      if (fs && fs.size > 0) {
        checkFrames[key] = `${compressFrames(fs)} (${fs.size})`;
        for (const frameNum of fs) allIssueFrames.add(frameNum);
      } else {
        checkFrames[key] = "";
      }
    }

    byTrackRows.push({
      track: t,
      label: labelOf.get(t) || "",
      presenceCount: prArr.length,
      firstFrame: prArr.length > 0 ? prArr[0] : null,
      lastFrame: prArr.length > 0 ? prArr[prArr.length - 1] : null,
      totalIssues: trackN.get(t) || 0,
      issueFramesCount: allIssueFrames.size,
      checkFrames,
    });
  }

  // 2. By_Frame
  const byFrameRows: QCFrameSummary[] = [];
  const sortedFrames = Array.from(byFrameMap.keys()).sort((a, b) => a - b);
  for (const f of sortedFrames) {
    const frChecks = byFrameMap.get(f)!;
    const checkTracks: Record<string, string> = {};

    for (const { key } of CHECKS_LIST) {
      const items = frChecks.get(key) || [];
      if (key === "overlap") {
        const sortedItems = [...items].sort((p1, p2) => {
          const [a1, b1] = p1.split("&");
          const [a2, b2] = p2.split("&");
          const c1 = sortTrackKey(a1, a2);
          return c1 !== 0 ? c1 : sortTrackKey(b1, b2);
        });
        checkTracks[key] = sortedItems.join("; ");
      } else {
        const sortedItems = [...items].sort(sortTrackKey);
        checkTracks[key] = sortedItems.join(", ");
      }
    }

    byFrameRows.push({
      frame: f,
      itemId: meta?.frame_items?.[f] || "",
      objCount: objsPerFrame.get(f) || 0,
      totalIssues: frameN.get(f) || 0,
      issueTracksCount: frameTracks.get(f)?.size || 0,
      checkTracks,
    });
  }

  // 3. Matrix
  const matrixRows: QCMatrixRow[] = [];
  const allMatrixTrackKeys = Array.from(
    new Set([...presence.keys(), ...byTrackMap.keys()])
  ).sort(sortTrackKey);

  for (const t of allMatrixTrackKeys) {
    const cells: Record<number, QCMatrixCellInfo> = {};
    const presSet = presence.get(t) || new Set<number>();

    for (const f of allFrames) {
      const tfKey = `${t}__${f}`;
      const cs = codesMap.get(tfKey);
      if (cs && cs.size > 0) {
        const sortedCodes = Array.from(cs).sort(
          (c1, c2) => (codeOrderMap[c1] ?? 99) - (codeOrderMap[c2] ?? 99)
        );
        cells[f] = {
          present: true,
          codes: sortedCodes,
          severity: cs.size >= 2 ? "error" : "warning",
        };
      } else if (presSet.has(f)) {
        cells[f] = {
          present: true,
          codes: [],
          severity: "clean",
        };
      } else {
        cells[f] = {
          present: false,
          codes: [],
          severity: "clean",
        };
      }
    }

    matrixRows.push({
      track: t,
      label: labelOf.get(t) || "",
      totalIssues: trackN.get(t) || 0,
      cells,
    });
  }

  // 4. Summary
  const off = cfg.track_id_offset;
  const trackOffsetInfo =
    off !== 0
      ? `= track_id trong JSON + ${off} (khớp số thứ tự trên CVAT)`
      : `= track_id trong JSON`;

  const checkStats = CHECKS_LIST.map(({ key, name, code }) => {
    const rs = ((results as any)[key] || []) as QCIssueRecord[];
    const trSet = new Set(rs.map((r) => r.track));
    const frSet = new Set(rs.map((r) => r.frame));
    return {
      key,
      name,
      code,
      issueCount: rs.length,
      trackCount: trSet.size,
      frameCount: frSet.size,
    };
  });

  const now = new Date();
  const runTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

  const summary: QCSummaryData = {
    inPath,
    runTime,
    version: meta.version,
    nItems: meta.n_items,
    nObjs: meta.n_objs,
    nTracks: meta.n_tracks,
    trackOffsetInfo,
    checkStats,
    dataIssueCount: results.issues.length,
    activeConfig: cfg,
  };

  return {
    meta,
    results,
    allIssues: rawRecs,
    dataIssues: results.issues,
    byTrack: byTrackRows,
    byFrame: byFrameRows,
    matrix: {
      allFrames,
      rows: matrixRows,
    },
    summary,
  };
}

// ============================================================================
// XUẤT BÁO CÁO CSV UTF-8 WITH BOM & COPY TSV 1-CLICK (CHO GOOGLE SHEETS)
// ============================================================================

function escapeCsvField(val: any): string {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function escapeTsvField(val: any): string {
  if (val === null || val === undefined) return "";
  return String(val).replace(/\t/g, " ").replace(/[\r\n]+/g, " ");
}

/**
 * Xuất dữ liệu sang định dạng CSV UTF-8 có ký tự BOM (\uFEFF)
 */
export function exportReportToCsv(
  report: DatumaroQAReport,
  sheet: "All_Issues" | "By_Track" | "By_Frame" | "Summary" | "Data_Issues" | "Matrix" = "All_Issues"
): string {
  const BOM = "\uFEFF";
  let content = "";

  if (sheet === "All_Issues") {
    const headers = [
      "Frame",
      "Item ID",
      "Track ID",
      "Class",
      "Loại kiểm tra",
      "Mô tả",
      "Giá trị",
      "Ngưỡng / Chuẩn",
      "Track liên quan",
    ];
    const lines = [headers.map(escapeCsvField).join(",")];
    for (const r of report.allIssues) {
      lines.push(
        [
          r.frame,
          r.item_id,
          r.track,
          r.label,
          CHECK_NAME[r.check] || r.check,
          r.detail,
          r.value,
          r.ref,
          r.other,
        ]
          .map(escapeCsvField)
          .join(",")
      );
    }
    content = lines.join("\r\n");
  } else if (sheet === "By_Track") {
    const headers = [
      "Track ID",
      "Class",
      "Số frame có mặt",
      "Frame đầu",
      "Frame cuối",
      "Tổng số issue",
      "Số frame có issue",
      ...CHECKS_LIST.map((c) => c.name),
    ];
    const lines = [headers.map(escapeCsvField).join(",")];
    for (const t of report.byTrack) {
      lines.push(
        [
          t.track,
          t.label,
          t.presenceCount,
          t.firstFrame ?? "",
          t.lastFrame ?? "",
          t.totalIssues,
          t.issueFramesCount,
          ...CHECKS_LIST.map((c) => t.checkFrames[c.key] || ""),
        ]
          .map(escapeCsvField)
          .join(",")
      );
    }
    content = lines.join("\r\n");
  } else if (sheet === "By_Frame") {
    const headers = [
      "Frame",
      "Item ID",
      "Số obj trong frame",
      "Tổng số issue",
      "Số track có issue",
      ...CHECKS_LIST.map((c) => c.name),
    ];
    const lines = [headers.map(escapeCsvField).join(",")];
    for (const f of report.byFrame) {
      lines.push(
        [
          f.frame,
          f.itemId,
          f.objCount,
          f.totalIssues,
          f.issueTracksCount,
          ...CHECKS_LIST.map((c) => f.checkTracks[c.key] || ""),
        ]
          .map(escapeCsvField)
          .join(",")
      );
    }
    content = lines.join("\r\n");
  } else if (sheet === "Matrix") {
    const allFrames = report.matrix.allFrames;
    const headers = ["Track ID", "Class", "Tổng số issue", ...allFrames.map(String)];
    const lines = [headers.map(escapeCsvField).join(",")];
    for (const r of report.matrix.rows) {
      const row: any[] = [r.track, r.label, r.totalIssues];
      for (const f of allFrames) {
        const cell = r.cells[f];
        if (!cell || !cell.present) {
          row.push("");
        } else if (cell.codes.length === 0) {
          row.push("OK");
        } else {
          row.push(cell.codes.join(""));
        }
      }
      lines.push(row.map(escapeCsvField).join(","));
    }
    content = lines.join("\r\n");
  } else if (sheet === "Data_Issues") {
    const headers = ["Loại", "Frame", "Item ID", "Annotation ID", "Chi tiết"];
    const lines = [headers.map(escapeCsvField).join(",")];
    for (const i of report.dataIssues) {
      lines.push(
        [i.kind, i.frame, i.item_id, i.ann_id, i.detail]
          .map(escapeCsvField)
          .join(",")
      );
    }
    content = lines.join("\r\n");
  } else if (sheet === "Summary") {
    const lines = [
      "BÁO CÁO KIỂM TRA CHẤT LƯỢNG DỮ LIỆU 3D (Datumaro)",
      "",
      `File đầu vào,${escapeCsvField(report.summary.inPath)}`,
      `Thời gian chạy,${escapeCsvField(report.summary.runTime)}`,
      `dm_format_version,${escapeCsvField(report.summary.version)}`,
      `Số frame (item),${report.summary.nItems}`,
      `Số cuboid_3d,${report.summary.nObjs}`,
      `Số track id,${report.summary.nTracks}`,
      `Track ID hiển thị,${escapeCsvField(report.summary.trackOffsetInfo)}`,
      "",
      "Kiểm tra,Ký hiệu (Matrix),Số issue (track x frame),Số track bị ảnh hưởng,Số frame bị ảnh hưởng",
    ];
    for (const s of report.summary.checkStats) {
      lines.push(
        [s.name, s.code, s.issueCount, s.trackCount, s.frameCount]
          .map(escapeCsvField)
          .join(",")
      );
    }
    lines.push(
      `Lỗi dữ liệu (Data_Issues),,${report.summary.dataIssueCount},,`
    );
    content = lines.join("\r\n");
  }

  return BOM + content;
}

/**
 * Xuất dữ liệu sang Tab-Separated Values (TSV) để dán 1-click vào Google Sheets
 */
export function exportReportToTsv(
  report: DatumaroQAReport,
  sheet: "All_Issues" | "By_Track" | "By_Frame" | "Summary" | "Data_Issues" | "Matrix" = "All_Issues"
): string {
  if (sheet === "All_Issues") {
    const headers = [
      "Frame",
      "Item ID",
      "Track ID",
      "Class",
      "Loại kiểm tra",
      "Mô tả",
      "Giá trị",
      "Ngưỡng / Chuẩn",
      "Track liên quan",
    ];
    const lines = [headers.join("\t")];
    for (const r of report.allIssues) {
      lines.push(
        [
          r.frame,
          r.item_id,
          r.track,
          r.label,
          CHECK_NAME[r.check] || r.check,
          r.detail,
          r.value,
          r.ref,
          r.other,
        ]
          .map(escapeTsvField)
          .join("\t")
      );
    }
    return lines.join("\n");
  } else if (sheet === "By_Track") {
    const headers = [
      "Track ID",
      "Class",
      "Số frame có mặt",
      "Frame đầu",
      "Frame cuối",
      "Tổng số issue",
      "Số frame có issue",
      ...CHECKS_LIST.map((c) => c.name),
    ];
    const lines = [headers.join("\t")];
    for (const t of report.byTrack) {
      lines.push(
        [
          t.track,
          t.label,
          t.presenceCount,
          t.firstFrame ?? "",
          t.lastFrame ?? "",
          t.totalIssues,
          t.issueFramesCount,
          ...CHECKS_LIST.map((c) => t.checkFrames[c.key] || ""),
        ]
          .map(escapeTsvField)
          .join("\t")
      );
    }
    return lines.join("\n");
  } else if (sheet === "By_Frame") {
    const headers = [
      "Frame",
      "Item ID",
      "Số obj trong frame",
      "Tổng số issue",
      "Số track có issue",
      ...CHECKS_LIST.map((c) => c.name),
    ];
    const lines = [headers.join("\t")];
    for (const f of report.byFrame) {
      lines.push(
        [
          f.frame,
          f.itemId,
          f.objCount,
          f.totalIssues,
          f.issueTracksCount,
          ...CHECKS_LIST.map((c) => f.checkTracks[c.key] || ""),
        ]
          .map(escapeTsvField)
          .join("\t")
      );
    }
    return lines.join("\n");
  } else if (sheet === "Matrix") {
    const allFrames = report.matrix.allFrames;
    const headers = ["Track ID", "Class", "Tổng số issue", ...allFrames.map(String)];
    const lines = [headers.join("\t")];
    for (const r of report.matrix.rows) {
      const row: any[] = [r.track, r.label, r.totalIssues];
      for (const f of allFrames) {
        const cell = r.cells[f];
        if (!cell || !cell.present) {
          row.push("");
        } else if (cell.codes.length === 0) {
          row.push("OK");
        } else {
          row.push(cell.codes.join(""));
        }
      }
      lines.push(row.map(escapeTsvField).join("\t"));
    }
    return lines.join("\n");
  } else if (sheet === "Data_Issues") {
    const headers = ["Loại", "Frame", "Item ID", "Annotation ID", "Chi tiết"];
    const lines = [headers.join("\t")];
    for (const i of report.dataIssues) {
      lines.push(
        [i.kind, i.frame, i.item_id, i.ann_id, i.detail]
          .map(escapeTsvField)
          .join("\t")
      );
    }
    return lines.join("\n");
  }
  return exportReportToCsv(report, sheet).replace(/\uFEFF/, "").replace(/,/g, "\t");
}

export function generateReportCsv(report: QCJobReport | DatumaroQAReport, _jobId: number = 0): string {
  if ("summary" in report && "allIssues" in report) {
    return exportReportToCsv(report as DatumaroQAReport, "All_Issues");
  }
  // Tương thích ngược với QCJobReport
  const jobRep = report as QCJobReport;
  const BOM = "\uFEFF";
  const headers = [
    "Mã Lỗi",
    "Ký Hiệu",
    "Track ID",
    "Frame",
    "Nhãn (Label)",
    "Mức Độ",
    "Mô Tả Chi Tiết",
    "Giá Trị Thực Tế",
    "Ngưỡng / Chuẩn",
    "Track Liên Quan",
  ];
  const lines = [headers.map(escapeCsvField).join(",")];
  for (const iss of jobRep.allIssues || []) {
    lines.push(
      [
        iss.check,
        iss.symbol,
        iss.trackId,
        iss.frame,
        iss.label,
        iss.severity,
        iss.detail,
        iss.value,
        iss.ref,
        iss.otherTrackId ?? "",
      ]
        .map(escapeCsvField)
        .join(",")
    );
  }
  return BOM + lines.join("\r\n");
}

export function generateReportMarkdown(report: QCJobReport, jobId: number = 0): string {
  return [
    `# 📊 Báo Cáo Kiểm Định Chất Lượng 3D LiDAR (Job #${jobId})`,
    "",
    `* **Thời Gian Quét**: ${new Date(report.timestamp).toLocaleString("vi-VN")}`,
    `* **Điểm Sức Khỏe Dữ Liệu**: **${report.healthScore}/100**`,
    `* **Tổng Số Đối Tượng**: ${report.totalObjects} cuboids`,
    `* **Tổng Số Tracks**: ${report.totalTracks}`,
    `* **Tổng Số Lỗi**: ${report.totalIssues}`,
    "",
    "## Bảng Tổng Kết Lỗi",
    "| Kiểm tra | Ký hiệu | Số lỗi |",
    "| :--- | :---: | :---: |",
    ...Object.entries(report.summaryByCheck || {}).map(
      ([code, item]) => `| ${CHECK_NAME[code] || code} | ${CHECK_CODE[code] || code} | ${item.count} |`
    ),
  ].join("\n");
}

// ============================================================================
// LỚP ĐIỀU PHỐI QCEngine (TƯƠNG THÍCH NGƯỢC HOÀN TOÀN CHO FLOATINGPANEL & CASE2)
// ============================================================================

export class QCEngine {
  private config: DatumaroQAConfig;

  constructor(cfg: Partial<DatumaroQAConfig> = {}) {
    this.config = deepMerge(DEFAULT_DATUMARO_QA_CONFIG, cfg);
  }

  public getConfig(): DatumaroQAConfig {
    return this.config;
  }

  public setConfig(cfg: Partial<DatumaroQAConfig>): void {
    this.config = deepMerge(this.config, cfg);
  }

  /**
   * Kiểm tra tính hợp lệ của 1 đối tượng đơn lẻ trong context của Track và Frame hiện tại
   * (Dùng cho FloatingPanel.ts real-time live preview)
   */
  public checkSingleObject(
    obj: QCObjectInstance,
    trackObjects: QCObjectInstance[],
    currentFrameObjects: QCObjectInstance[] = [],
    lidarPoints?: Float32Array | Array<{ x: number; y: number; z: number }>
  ): QCSingleObjectSummary {
    const issues: QCIssue[] = [];
    const checks: Record<
      QCCheckCode,
      { passed: boolean; severity: QCSeverity | "clean"; message: string; value?: string; ref?: string }
    > = {
      scale: { passed: true, severity: "clean", message: "Đồng bộ kích thước đạt chuẩn" },
      size: { passed: true, severity: "clean", message: "Kích thước trong catalog" },
      z: { passed: true, severity: "clean", message: "Cao độ Z bình thường" },
      rot: { passed: true, severity: "clean", message: "Góc quay mượt mà" },
      overlap: { passed: true, severity: "clean", message: "Không chồng lấn" },
      dist: { passed: true, severity: "clean", message: "Cự ly an toàn" },
      data: { passed: true, severity: "clean", message: "Cấu trúc dữ liệu hợp lệ" },
      empty_box: {
        passed: true,
        severity: "clean",
        message: lidarPoints ? "Mật độ mây điểm LiDAR tốt" : "Chưa có mây điểm để kiểm tra",
      },
      ground_mismatch: {
        passed: true,
        severity: "clean",
        message: lidarPoints ? "Đáy xe bám sát mặt đường thực tế" : "Chưa có mây điểm để kiểm tra",
      },
      motion_mismatch: {
        passed: true,
        severity: "clean",
        message: "Đầu xe xuôi theo hướng di chuyển",
      },
    };

    // 1. Scale Sync (S)
    const scaleIssues = this.checkScaleSync(trackObjects);
    const myScaleIssue = scaleIssues.find((iss) => iss.frame === obj.frame);
    if (myScaleIssue) {
      issues.push(myScaleIssue);
      checks.scale = {
        passed: false,
        severity: myScaleIssue.severity,
        message: myScaleIssue.detail,
        value: myScaleIssue.value,
        ref: myScaleIssue.ref,
      };
    }

    // 2. Size Range (K)
    const sizeIssue = this.checkSizeRange(obj);
    if (sizeIssue) {
      issues.push(sizeIssue);
      checks.size = {
        passed: false,
        severity: sizeIssue.severity,
        message: sizeIssue.detail,
        value: sizeIssue.value,
        ref: sizeIssue.ref,
      };
    }

    // 3. Z Range (Z)
    const zIssue = this.checkZRange(obj);
    if (zIssue) {
      issues.push(zIssue);
      checks.z = {
        passed: false,
        severity: zIssue.severity,
        message: zIssue.detail,
        value: zIssue.value,
        ref: zIssue.ref,
      };
    }

    // 4. Rotation Jump (H) & Motion Mismatch (L3)
    const sortedTrack = [...trackObjects].sort((a, b) => a.frame - b.frame);
    const myIdx = sortedTrack.findIndex((o) => o.frame === obj.frame);
    if (myIdx > 0) {
      const prev = sortedTrack[myIdx - 1];
      const rotIssue = this.checkRotationJump(prev, obj);
      if (rotIssue) {
        issues.push(rotIssue);
        checks.rot = {
          passed: false,
          severity: rotIssue.severity,
          message: rotIssue.detail,
          value: rotIssue.value,
          ref: rotIssue.ref,
        };
      }
      const motionIssue = checkMotionYawMismatch(prev, obj, this.config);
      if (motionIssue) {
        issues.push(motionIssue);
        checks.motion_mismatch = {
          passed: false,
          severity: motionIssue.severity,
          message: motionIssue.detail,
          value: motionIssue.value,
          ref: motionIssue.ref,
        };
      }
    }

    // 5. Overlap (O)
    if (currentFrameObjects.length > 1) {
      const frameOverlaps = this.checkFrameOverlaps(currentFrameObjects);
      const myOverlap = frameOverlaps.find(
        (iss) => iss.trackId === obj.trackId && iss.frame === obj.frame
      );
      if (myOverlap) {
        issues.push(myOverlap);
        checks.overlap = {
          passed: false,
          severity: myOverlap.severity,
          message: myOverlap.detail,
          value: myOverlap.value,
          ref: myOverlap.ref,
        };
      }
    }

    // 6. Distance (D)
    const distIssue = this.checkDistance(obj);
    if (distIssue) {
      issues.push(distIssue);
      checks.dist = {
        passed: false,
        severity: distIssue.severity,
        message: distIssue.detail,
        value: distIssue.value,
        ref: distIssue.ref,
      };
    }

    // 7. LiDAR Point Cloud Checks (L1: empty_box, L2: ground_mismatch)
    if (lidarPoints) {
      const emptyIssue = checkEmptyOrSparseBox(obj, lidarPoints, this.config);
      if (emptyIssue) {
        issues.push(emptyIssue);
        checks.empty_box = {
          passed: false,
          severity: emptyIssue.severity,
          message: emptyIssue.detail,
          value: emptyIssue.value,
          ref: emptyIssue.ref,
        };
      }

      const groundIssue = checkGroundMismatch(obj, lidarPoints, this.config);
      if (groundIssue) {
        issues.push(groundIssue);
        checks.ground_mismatch = {
          passed: false,
          severity: groundIssue.severity,
          message: groundIssue.detail,
          value: groundIssue.value,
          ref: groundIssue.ref,
        };
      }
    }

    const hasError = issues.some((iss) => iss.severity === "error");
    const hasWarning = issues.some((iss) => iss.severity === "warning");
    const overallStatus: "clean" | "warning" | "error" = hasError
      ? "error"
      : hasWarning
      ? "warning"
      : "clean";

    return {
      trackId: obj.trackId,
      frame: obj.frame,
      label: obj.label,
      group: obj.group,
      overallStatus,
      issues,
      checks,
    };
  }

  public checkScaleSync(trackObjects: QCObjectInstance[]): QCIssue[] {
    const validObjs = trackObjects.filter(
      (o) => !o.outside && o.group && this.config.scale_sync_groups.includes(o.group)
    );
    if (validObjs.length < 2) return [];

    const tol = this.config.scale_sync_tol + 1e-9;
    const ref: [number, number, number] = [0, 1, 2].map((a) => {
      const prop = a === 0 ? "l" : a === 1 ? "w" : "h";
      const sorted = validObjs.map((o) => o[prop]).sort((x, y) => x - y);
      return sorted[Math.floor(validObjs.length / 2)];
    }) as [number, number, number];

    const issues: QCIssue[] = [];
    for (const o of validObjs) {
      const dl = o.l - ref[0];
      const dw = o.w - ref[1];
      const dh = o.h - ref[2];

      if (Math.abs(dl) > tol || Math.abs(dw) > tol || Math.abs(dh) > tol) {
        issues.push({
          id: `${o.trackId}_${o.frame}_scale`,
          frame: o.frame,
          trackId: o.trackId,
          label: o.label,
          check: "scale",
          symbol: "S",
          name: "Scale không đồng bộ",
          severity: "error",
          detail: `Scale lệch so với kích thước chuẩn của track (chênh L ${fmtSigned(dl)}, W ${fmtSigned(dw)}, H ${fmtSigned(dh)} m)`,
          value: formatSize(o.l, o.w, o.h),
          ref: formatSize(ref[0], ref[1], ref[2]),
        });
      }
    }
    return issues;
  }

  public checkSizeRange(obj: QCObjectInstance): QCIssue | null {
    if (obj.outside || !obj.group) return null;
    const lim = this.config.size_limits[obj.group];
    if (!lim) return null;

    const eps = this.config.size_eps;
    const parts: string[] = [];
    let over = false;
    let under = false;

    if (obj.l > lim.length[1] + eps) {
      parts.push(`Dài (L) ${obj.l.toFixed(2)} > ${lim.length[1]}`);
      over = true;
    } else if (obj.l < lim.length[0] - eps) {
      parts.push(`Dài (L) ${obj.l.toFixed(2)} < ${lim.length[0]}`);
      under = true;
    }

    if (obj.w > lim.width[1] + eps) {
      parts.push(`Rộng (W) ${obj.w.toFixed(2)} > ${lim.width[1]}`);
      over = true;
    } else if (obj.w < lim.width[0] - eps) {
      parts.push(`Rộng (W) ${obj.w.toFixed(2)} < ${lim.width[0]}`);
      under = true;
    }

    if (obj.h > lim.height[1] + eps) {
      parts.push(`Cao (H) ${obj.h.toFixed(2)} > ${lim.height[1]}`);
      over = true;
    } else if (obj.h < lim.height[0] - eps) {
      parts.push(`Cao (H) ${obj.h.toFixed(2)} < ${lim.height[0]}`);
      under = true;
    }

    if (parts.length === 0) return null;

    const hint = this.config.size_over_hint[obj.group];
    const notes: string[] = [];
    if (over) {
      notes.push("lớn hơn ngưỡng - " + (hint ? hint : "cần kiểm tra kích thước"));
    }
    if (under) {
      notes.push("nhỏ hơn ngưỡng - cần kiểm tra kích thước");
    }

    return {
      id: `${obj.trackId}_${obj.frame}_size`,
      frame: obj.frame,
      trackId: obj.trackId,
      label: obj.label,
      check: "size",
      symbol: "K",
      name: "Kích thước ngoài ngưỡng",
      severity: "warning",
      detail: `${parts.join("; ")} (${notes.join("; ")})`,
      value: formatSize(obj.l, obj.w, obj.h),
      ref: `L ${lim.length[0]}~${lim.length[1]}, W ${lim.width[0]}~${lim.width[1]}, H ${lim.height[0]}~${lim.height[1]}`,
    };
  }

  public checkZRange(obj: QCObjectInstance): QCIssue | null {
    if (obj.outside) return null;
    let detail = "";
    if (obj.z > this.config.z_max) {
      detail = `z = ${obj.z.toFixed(2)} > ${this.config.z_max}: obj cao hơn mặt đường`;
    } else if (obj.z < this.config.z_min) {
      detail = `z = ${obj.z.toFixed(2)} < ${this.config.z_min}: obj thấp hơn mặt đường`;
    } else {
      return null;
    }

    return {
      id: `${obj.trackId}_${obj.frame}_z`,
      frame: obj.frame,
      trackId: obj.trackId,
      label: obj.label,
      check: "z",
      symbol: "Z",
      name: "Z ngoài ngưỡng",
      severity: "warning",
      detail,
      value: `${obj.z.toFixed(2)}m`,
      ref: `${this.config.z_min} ~ ${this.config.z_max}`,
    };
  }

  public checkRotationJump(prev: QCObjectInstance, cur: QCObjectInstance): QCIssue | null {
    if (prev.outside || cur.outside) return null;
    if (cur.frame - prev.frame > this.config.max_frame_gap) return null;
    if (!cur.group || !this.config.rotation_check_groups.includes(cur.group)) return null;

    const d = calcAngleDiffDeg(prev.yaw, cur.yaw);
    if (d > this.config.max_rotation_jump_deg) {
      const prevDeg = (prev.yaw * 180) / Math.PI;
      const curDeg = (cur.yaw * 180) / Math.PI;
      return {
        id: `${cur.trackId}_${cur.frame}_rot`,
        frame: cur.frame,
        trackId: cur.trackId,
        label: cur.label,
        check: "rot",
        symbol: "H",
        name: "Đổi hướng đột ngột",
        severity: "error",
        detail: `Obj thay đổi hướng đột ngột ${d.toFixed(1)}° (yaw ${prevDeg.toFixed(1)}° ở frame ${prev.frame} -> ${curDeg.toFixed(1)}° ở frame ${cur.frame})`,
        value: `${d.toFixed(1)}°`,
        ref: `≤ ${this.config.max_rotation_jump_deg}°`,
      };
    }
    return null;
  }

  public checkFrameOverlaps(frameObjs: QCObjectInstance[]): QCIssue[] {
    const validObjs = frameObjs.filter(
      (o) => !o.outside && o.group && o.group in this.config.overlap_allowed
    );
    const issues: QCIssue[] = [];
    const metric = (this.config.overlap_metric || "iou").toLowerCase();

    for (let i = 0; i < validObjs.length; i++) {
      for (let j = i + 1; j < validObjs.length; j++) {
        const a = validObjs[i];
        const b = validObjs[j];

        const { intersectionArea: inter, iou, ioa } = bevOverlap(
          { pos: [a.x, a.y, a.z], scale: [a.l, a.w, a.h], yaw: a.yaw },
          { pos: [b.x, b.y, b.z], scale: [b.l, b.w, b.h], yaw: b.yaw }
        );

        if (inter < this.config.overlap_min_area) continue;

        const allowedA = this.config.overlap_allowed[a.group!] ?? 0.0;
        const allowedB = this.config.overlap_allowed[b.group!] ?? 0.0;
        const allowed = Math.min(allowedA, allowedB);
        const val = metric === "ioa" ? ioa : iou;

        if (allowed > 0 && val <= allowed) continue;

        const rule =
          allowed <= 0
            ? "Không cho phép chồng lấn"
            : `Cho phép tối đa ${(allowed * 100).toFixed(0)}% (${metric.toUpperCase()})`;
        const stats = `IoU ${iou.toFixed(3)}, IoA ${ioa.toFixed(3)}, diện tích giao ${inter.toFixed(3)} m²`;

        issues.push({
          id: `${a.trackId}_${a.frame}_overlap_${b.trackId}`,
          frame: a.frame,
          trackId: a.trackId,
          label: a.label,
          check: "overlap",
          symbol: "O",
          name: "Chồng lấn",
          severity: "error",
          detail: `Chồng lấn với Track #${b.trackId} (${b.label}): ${stats}`,
          value: `${(val * 100).toFixed(1)}%`,
          ref: rule,
          otherTrackId: b.trackId,
        });

        issues.push({
          id: `${b.trackId}_${b.frame}_overlap_${a.trackId}`,
          frame: b.frame,
          trackId: b.trackId,
          label: b.label,
          check: "overlap",
          symbol: "O",
          name: "Chồng lấn",
          severity: "error",
          detail: `Chồng lấn với Track #${a.trackId} (${a.label}): ${stats}`,
          value: `${(val * 100).toFixed(1)}%`,
          ref: rule,
          otherTrackId: a.trackId,
        });
      }
    }
    return issues;
  }

  public checkDistance(obj: QCObjectInstance): QCIssue | null {
    if (obj.outside) return null;
    const d = Math.sqrt(obj.x * obj.x + obj.y * obj.y + obj.z * obj.z);
    if (d > this.config.max_distance) {
      return {
        id: `${obj.trackId}_${obj.frame}_dist`,
        frame: obj.frame,
        trackId: obj.trackId,
        label: obj.label,
        check: "dist",
        symbol: "D",
        name: "Quá xa",
        severity: "info",
        detail: `Cách gốc tọa độ ${d.toFixed(2)} m (> ${this.config.max_distance} m): obj ở quá xa, cần kiểm tra`,
        value: `${d.toFixed(1)}m`,
        ref: `≤ ${this.config.max_distance} m`,
      };
    }
    return null;
  }

  /**
   * Chạy toàn bộ kiểm định cho Job từ mảng QCObjectInstance[]
   */
  public runFullJobQC(dataset: QCObjectInstance[]): QCJobReport {
    // Lọc bỏ 100% các object outside theo chuẩn Datumaro (đã biến mất khỏi scene)
    const validDataset = dataset.filter((o) => !o.outside);

    // Chuyển đổi dataset sang DatumaroObj[]
    const objs: DatumaroObj[] = validDataset.map(
      (o) =>
        new DatumaroObj(
          o.frame,
          `frame_${o.frame}`,
          o.trackId,
          String(o.trackId),
          true,
          o.label,
          o.group,
          [o.x, o.y, o.z],
          [0, 0, o.yaw],
          [o.l, o.w, o.h]
        )
    );

    const frameItems: Record<number, string> = {};
    for (const d of dataset) {
      frameItems[d.frame] = `frame_${d.frame}`;
    }

    const report = generateDatumaroQAReport(
      objs,
      [],
      {
        version: "1.0",
        n_items: Object.keys(frameItems).length,
        n_objs: objs.length,
        n_tracks: new Set(dataset.map((d) => d.trackId)).size,
        frame_items: frameItems,
      },
      this.config
    );

    // Chuyển đổi sang format QCJobReport tương thích ngược
    const allIssues: QCIssue[] = report.allIssues.map((r) => {
      const isErr = r.check === "scale" || r.check === "rot" || r.check === "overlap";
      const isWarn = r.check === "size" || r.check === "z";
      const sev: QCSeverity = isErr ? "error" : isWarn ? "warning" : "info";
      return {
        id: `${r.track}_${r.frame}_${r.check}`,
        frame: r.frame,
        trackId: parseInt(r.track, 10) || 0,
        label: r.label,
        check: r.check as QCCheckCode,
        symbol: CHECK_CODE[r.check] || "!",
        name: CHECK_NAME[r.check] || r.check,
        severity: sev,
        detail: r.detail,
        value: String(r.value),
        ref: r.ref,
        otherTrackId: r.other ? parseInt(r.other, 10) || null : null,
      };
    });

    const summaryByCheck: any = {};
    for (const s of report.summary.checkStats) {
      summaryByCheck[s.key] = {
        count: s.issueCount,
        tracksCount: s.trackCount,
        framesCount: s.frameCount,
      };
    }

    const byTrack: Record<number, any> = {};
    for (const t of report.byTrack) {
      const tid = parseInt(t.track, 10);
      if (!isNaN(tid)) {
        byTrack[tid] = {
          trackId: tid,
          label: t.label,
          issues: allIssues.filter((i) => i.trackId === tid),
          framesWithIssues: [],
        };
      }
    }

    const byFrame: Record<number, any> = {};
    for (const f of report.byFrame) {
      byFrame[f.frame] = {
        frame: f.frame,
        issues: allIssues.filter((i) => i.frame === f.frame),
        tracksWithIssues: [],
      };
    }

    const matrix: Record<number, Record<number, any>> = {};
    for (const r of report.matrix.rows) {
      const tid = parseInt(r.track, 10);
      if (isNaN(tid)) continue;
      matrix[tid] = {};
      for (const [fStr, cell] of Object.entries(r.cells)) {
        const f = parseInt(fStr, 10);
        matrix[tid][f] = {
          hasObject: cell.present,
          issues: allIssues.filter((i) => i.trackId === tid && i.frame === f),
          severity: cell.severity,
          symbols: cell.codes,
        };
      }
    }

    const totalTracks = report.meta.n_tracks;
    const totalFrames = report.meta.n_items;
    const totalObjects = report.meta.n_objs;
    const totalIssues = allIssues.length;

    const errorIssues = allIssues.filter((i) => i.severity === "error").length;
    const warnIssues = allIssues.filter((i) => i.severity === "warning").length;
    const infoIssues = allIssues.filter((i) => i.severity === "info").length;

    const framesWithIssues = new Set(allIssues.map((i) => i.frame));
    const tracksWithIssues = new Set(allIssues.map((i) => i.trackId));

    const cleanFramesCount = Math.max(0, totalFrames - framesWithIssues.size);
    const cleanTracksCount = Math.max(0, totalTracks - tracksWithIssues.size);

    let penalty = errorIssues * 5 + warnIssues * 2 + infoIssues * 0.5;
    const maxPenalty = Math.max(1, totalObjects * 3);
    const healthScore = Math.max(0, Math.min(100, Math.round(100 - (penalty / maxPenalty) * 100)));

    return {
      timestamp: Date.now(),
      totalTracks,
      totalFrames,
      totalObjects,
      totalIssues,
      healthScore,
      cleanFramesCount,
      cleanTracksCount,
      criticalIssuesCount: errorIssues,
      warningIssuesCount: warnIssues,
      infoIssuesCount: infoIssues,
      summaryByCheck,
      allIssues,
      byTrack,
      byFrame,
      matrix,
      framesList: report.matrix.allFrames,
      tracksList: report.matrix.rows.map((r) => parseInt(r.track, 10)).filter((n) => !isNaN(n)),
    };
  }
}
