/**
 * src/core/qc/bev_overlap.ts
 * Thuật toán tính giao cắt đa giác 2D trên mặt phẳng BEV (Bird's Eye View)
 * Sử dụng giải thuật Sutherland-Hodgman Polygon Clipping để tính IoU và IoA chính xác 100%
 * Đồng bộ tuyệt đối từng dòng với rect_corners, poly_area, clip_convex, bev_overlap trong datumaro_qa.py
 */

export interface Point2D {
  x: number;
  y: number;
}

export interface OverlapResult {
  intersectionArea: number;
  iou: number;
  ioa: number; // Tỷ lệ giao chia diện tích đối tượng nhỏ hơn
}

export type PointTuple = [number, number];

/**
 * 4 đỉnh hình chữ nhật (ngược chiều kim đồng hồ) - tâm (x,y), dài l (trục x cục bộ), rộng w, xoay yaw
 * Khớp 100% rect_corners(x, y, l, w, yaw) trong datumaro_qa.py
 */
export function rectCorners(x: number, y: number, l: number, w: number, yaw: number): PointTuple[] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const hl = l / 2.0;
  const hw = w / 2.0;
  return [
    [x + hl * c - hw * s, y + hl * s + hw * c],
    [x - hl * c - hw * s, y - hl * s + hw * c],
    [x - hl * c + hw * s, y - hl * s - hw * c],
    [x + hl * c + hw * s, y + hl * s - hw * c],
  ];
}

/**
 * Tính diện tích đa giác lồi 2D bằng công thức Shoelace (Shoelace formula)
 * Khớp 100% poly_area(pts) trong datumaro_qa.py
 */
export function polyArea(pts: PointTuple[]): number {
  if (pts.length < 3) return 0.0;
  let a = 0.0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const x1 = pts[i][0];
    const y1 = pts[i][1];
    const x2 = pts[(i + 1) % n][0];
    const y2 = pts[(i + 1) % n][1];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2.0;
}

/**
 * Sutherland-Hodgman: giao 2 đa giác lồi (đều ngược chiều kim đồng hồ)
 * Khớp 100% clip_convex(subject, clipper) trong datumaro_qa.py
 */
export function clipConvex(subject: PointTuple[], clipper: PointTuple[]): PointTuple[] {
  function inside(p: PointTuple, a: PointTuple, b: PointTuple): boolean {
    return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= -1e-12;
  }

  function intersect(p: PointTuple, q: PointTuple, a: PointTuple, b: PointTuple): PointTuple {
    const x1 = p[0], y1 = p[1], x2 = q[0], y2 = q[1];
    const x3 = a[0], y3 = a[1], x4 = b[0], y4 = b[1];
    const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(den) < 1e-15) {
      return q;
    }
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
    return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
  }

  let out = [...subject];
  const n = clipper.length;
  for (let i = 0; i < n; i++) {
    const a = clipper[i];
    const b = clipper[(i + 1) % n];
    const inp = out;
    out = [];
    if (inp.length === 0) break;
    let s = inp[inp.length - 1];
    for (const e of inp) {
      if (inside(e, a, b)) {
        if (!inside(s, a, b)) {
          out.push(intersect(s, e, a, b));
        }
        out.push(e);
      } else if (inside(s, a, b)) {
        out.push(intersect(s, e, a, b));
      }
      s = e;
    }
  }
  return out;
}

/**
 * Trả về (diện tích giao, IoU, IoA) của 2 obj trên mặt phẳng BEV
 * Khớp 100% bev_overlap(a, b) trong datumaro_qa.py
 */
export function bevOverlap(
  a: { pos: [number, number, number] | number[]; scale: [number, number, number] | number[]; yaw: number },
  b: { pos: [number, number, number] | number[]; scale: [number, number, number] | number[]; yaw: number }
): OverlapResult {
  const la = a.scale[0], wa = a.scale[1], lb = b.scale[0], wb = b.scale[1];
  const ra = 0.5 * Math.hypot(la, wa);
  const rb = 0.5 * Math.hypot(lb, wb);
  if (Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1]) > ra + rb) {
    return { intersectionArea: 0.0, iou: 0.0, ioa: 0.0 };
  }
  const pa = rectCorners(a.pos[0], a.pos[1], la, wa, a.yaw);
  const pb = rectCorners(b.pos[0], b.pos[1], lb, wb, b.yaw);
  const interPts = clipConvex(pa, pb);
  const inter = interPts.length >= 3 ? polyArea(interPts) : 0.0;
  const areaA = la * wa;
  const areaB = lb * wb;
  const union = areaA + areaB - inter;
  const iou = union > 0 ? inter / union : 0.0;
  const minArea = Math.min(areaA, areaB);
  const ioa = minArea > 0 ? inter / minArea : 0.0;
  return {
    intersectionArea: inter,
    iou,
    ioa,
  };
}

// ============================================================================
// HÀM TƯƠNG THÍCH VỚI POINT2D OBJECT CHO CODEBASE HIỆN CÓ
// ============================================================================

export function getRotatedRectCorners(x: number, y: number, l: number, w: number, yaw: number): Point2D[] {
  const pts = rectCorners(x, y, l, w, yaw);
  return pts.map(([px, py]) => ({ x: px, y: py }));
}

export function polygonArea(pts: Point2D[]): number {
  return polyArea(pts.map(p => [p.x, p.y]));
}

export function clipConvexPolygon(subject: Point2D[], clipper: Point2D[]): Point2D[] {
  const subjTuples: PointTuple[] = subject.map(p => [p.x, p.y]);
  const clipTuples: PointTuple[] = clipper.map(p => [p.x, p.y]);
  const out = clipConvex(subjTuples, clipTuples);
  return out.map(([x, y]) => ({ x, y }));
}

export function computeBevOverlap(
  boxA: { x: number; y: number; l: number; w: number; yaw: number },
  boxB: { x: number; y: number; l: number; w: number; yaw: number }
): OverlapResult {
  return bevOverlap(
    { pos: [boxA.x, boxA.y, 0], scale: [boxA.l, boxA.w, 1], yaw: boxA.yaw },
    { pos: [boxB.x, boxB.y, 0], scale: [boxB.l, boxB.w, 1], yaw: boxB.yaw }
  );
}
