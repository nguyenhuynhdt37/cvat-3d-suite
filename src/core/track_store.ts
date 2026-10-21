import {
  Box3D,
  pointsToBox,
  boxToPoints,
  interpolatePoints,
} from "./geometry";

export interface ShapeRecord {
  type: string;
  frame: number;
  points: number[];
  outside: boolean;
  occluded?: boolean;
  z_order?: number;
  rotation?: number;
  attributes?: any[];
}

export interface TrackData {
  id: number;
  clientID: number;
  serverID: number | null;
  labelId: number;
  labelName: string;
  labelColor: string;
  shapes: ShapeRecord[];
}

/**
 * Quản lý trạng thái vòng đời của một Track cuboid 3D:
 * - Lưu trữ danh sách keyframes
 * - Nội suy vị trí box tại frame bất kỳ
 * - Hỗ trợ Undo / Redo in-memory lên tới 200 bước
 * - Đánh dấu trạng thái thay đổi dirty
 */
export class TrackState {
  public uiId: number;
  public serverId: number | null;
  public labelId: number;
  public labelName: string;
  public labelColor: string;
  public shapes: ShapeRecord[] = [];
  public undoStack: ShapeRecord[][] = [];
  public redoStack: ShapeRecord[][] = [];
  public dirty: boolean = false;
  private originalShapesJson: string = "";

  constructor(data: TrackData) {
    this.uiId = data.clientID;
    this.serverId = data.serverID;
    this.labelId = data.labelId;
    this.labelName = data.labelName || `Label #${data.labelId}`;
    this.labelColor = data.labelColor || "#38bdf8";
    this.load(data.shapes);
  }

  public load(shapes: ShapeRecord[]): void {
    this.shapes = JSON.parse(JSON.stringify(shapes)).sort(
      (a: ShapeRecord, b: ShapeRecord) => a.frame - b.frame
    );
    this.originalShapesJson = JSON.stringify(this.shapes);
    this.undoStack = [];
    this.redoStack = [];
    this.dirty = false;
  }

  public get firstFrame(): number {
    return this.shapes.length > 0 ? this.shapes[0].frame : 0;
  }

  public get lastFrame(): number {
    return this.shapes.length > 0 ? this.shapes[this.shapes.length - 1].frame : 0;
  }

  public keyframeIndex(frame: number): number {
    return this.shapes.findIndex((s) => s.frame === frame);
  }

  /**
   * Lấy vị trí Box3D tại frame bất kỳ (nội suy tuyến tính nếu nằm giữa các keyframes).
   */
  public at(frame: number): {
    points: number[];
    box: Box3D;
    keyframe: boolean;
    outside: boolean;
  } | null {
    if (this.shapes.length === 0) return null;

    let left: ShapeRecord | null = null;
    let right: ShapeRecord | null = null;

    for (const s of this.shapes) {
      if (s.frame <= frame) {
        left = s;
      } else {
        right = s;
        break;
      }
    }

    // Đúng ngay tại một keyframe
    if (left && left.frame === frame) {
      return {
        points: left.points.slice(),
        box: pointsToBox(left.points),
        keyframe: true,
        outside: !!left.outside,
      };
    }

    // Nằm giữa 2 keyframes -> nội suy chuẩn CVAT
    if (left && right) {
      const offset = (frame - left.frame) / (right.frame - left.frame);
      const points = interpolatePoints(left.points, right.points, offset);
      return {
        points,
        box: pointsToBox(points),
        keyframe: false,
        outside: !!left.outside,
      };
    }

    // Nằm ngoài dải keyframes
    const single = left || right;
    if (!single) return null;

    return {
      points: single.points.slice(),
      box: pointsToBox(single.points),
      keyframe: single.frame === frame,
      outside: single === right ? true : !!single.outside,
    };
  }

  /**
   * Lưu snapshot vào undo stack trước khi thực hiện chỉnh sửa.
   */
  public snapshot(): void {
    this.undoStack.push(JSON.parse(JSON.stringify(this.shapes)));
    if (this.undoStack.length > 200) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  /**
   * Hoàn tác thao tác gần nhất (Undo).
   */
  public undo(): boolean {
    if (this.undoStack.length === 0) return false;
    this.redoStack.push(JSON.parse(JSON.stringify(this.shapes)));
    this.shapes = this.undoStack.pop()!;
    this.dirty = JSON.stringify(this.shapes) !== this.originalShapesJson;
    return true;
  }

  /**
   * Làm lại thao tác vừa hoàn tác (Redo).
   */
  public redo(): boolean {
    if (this.redoStack.length === 0) return false;
    this.undoStack.push(JSON.parse(JSON.stringify(this.shapes)));
    this.shapes = this.redoStack.pop()!;
    this.dirty = true;
    return true;
  }

  /**
   * Ghi đè box vào frame cụ thể.
   * Nếu frame đó chưa là keyframe thì tự động tạo keyframe mới tại frame đó.
   */
  public setBox(frame: number, box: Box3D): void {
    const idx = this.keyframeIndex(frame);
    if (idx >= 0) {
      this.shapes[idx].points = boxToPoints(box, this.shapes[idx].points);
    } else {
      const pos = this.at(frame);
      const basePoints = pos ? pos.points : this.shapes[0].points;
      const newPoints = boxToPoints(box, basePoints);
      const newShape: ShapeRecord = {
        type: "cuboid",
        frame,
        points: newPoints,
        outside: false,
        occluded: false,
        z_order: 0,
        rotation: 0,
        attributes: [],
      };
      this.shapes.push(newShape);
      this.shapes.sort((a, b) => a.frame - b.frame);
    }
    this.dirty = true;
  }

  /**
   * Bật/tắt trạng thái Outside tại một frame (phím tắt O).
   */
  public setOutside(frame: number, outside: boolean): void {
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
        attributes: [],
      });
      this.shapes.sort((a, b) => a.frame - b.frame);
    }
    this.dirty = true;
  }

  /**
   * Xóa một keyframe tại frame cụ thể (khóa bảo vệ không cho xóa keyframe đầu tiên).
   */
  public deleteKeyframe(frame: number): boolean {
    const idx = this.keyframeIndex(frame);
    if (idx <= 0) return false; // Không được xóa keyframe đầu tiên
    this.shapes.splice(idx, 1);
    this.dirty = true;
    return true;
  }
}

/**
 * Quản lý kho dữ liệu toàn bộ các Track trong một Job CVAT.
 */
export class JobAnnotationStore {
  public jobId: number;
  public tracks: Map<number, TrackState> = new Map(); // key: uiId
  public history: number[][] = []; // Lưu danh sách uiId của các thao tác để Undo toàn cục
  public redoHistory: number[][] = [];

  constructor(jobId: number) {
    this.jobId = jobId;
  }

  public setTracks(trackList: TrackData[]): void {
    this.tracks.clear();
    for (const t of trackList) {
      this.tracks.set(t.clientID, new TrackState(t));
    }
    this.history = [];
    this.redoHistory = [];
  }

  public getTrack(uiId: number): TrackState | undefined {
    return this.tracks.get(uiId);
  }

  public getAllTracks(): TrackState[] {
    return [...this.tracks.values()].sort((a, b) => a.uiId - b.uiId);
  }

  public getDirtyTracks(): TrackState[] {
    return this.getAllTracks().filter((t) => t.dirty);
  }

  /**
   * Tạo snapshot cho một hoặc nhiều track trước khi chỉnh sửa.
   */
  public snapshot(uiIds: number[]): void {
    for (const id of uiIds) {
      const t = this.tracks.get(id);
      if (t) t.snapshot();
    }
    this.history.push(uiIds.slice());
    this.redoHistory = [];
  }

  public undo(): boolean {
    const ids = this.history.pop();
    if (!ids || ids.length === 0) return false;
    for (const id of ids) {
      const t = this.tracks.get(id);
      if (t) t.undo();
    }
    this.redoHistory.push(ids);
    return true;
  }

  public redo(): boolean {
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
  public markSaved(): void {
    for (const t of this.tracks.values()) {
      t.dirty = false;
    }
  }
}
