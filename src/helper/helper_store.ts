/**
 * Trạng thái annotation của job đang mở: tải, nội suy giống CVAT, sửa, undo, lưu.
 * Port từ cvat-helper/content/store.js sang TypeScript strict.
 */

import {
  pointsToBox,
  boxToPoints,
  interpolatePoints as geomInterpolatePoints,
  findAngleDiff as geomFindAngleDiff,
  type Box3D,
} from '../core/geometry';

import { helperApi } from './api_client';
import { helperLiveBridge } from './live_bridge';

// ──────────────────────────────────────────────────────────
// Utility
// ──────────────────────────────────────────────────────────

const deepClone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

// ──────────────────────────────────────────────────────────
// Re-export interpolation & angle helpers
// ──────────────────────────────────────────────────────────

/**
 * Tìm khoảng chênh lệch góc giữa 2 góc (tính theo độ) trong khoảng [-180, 180].
 * Sao chép nguyên văn từ cvat-core/src/object-utils.ts.
 */
export function findAngleDiff(rightAngle: number, leftAngle: number): number {
  return geomFindAngleDiff(rightAngle, leftAngle);
}

/**
 * Giống CuboidTrack.interpolatePosition (3D) của cvat-core.
 * Nội suy tuyến tính vị trí 3D giữa 2 keyframes.
 */
export function interpolatePoints(
  left: number[],
  right: number[],
  offset: number,
): number[] {
  return geomInterpolatePoints(left, right, offset);
}

// ──────────────────────────────────────────────────────────
// Shape interface (CVAT cuboid shape payload)
// ──────────────────────────────────────────────────────────

export interface CuboidShape {
  type: string;
  frame: number;
  points: number[];
  outside: boolean;
  occluded: boolean;
  z_order: number;
  rotation: number;
  attributes: Array<Record<string, unknown>>;
}

export interface ServerTrack {
  id?: number | null;
  label_id: number;
  frame: number;
  shapes: CuboidShape[];
  [key: string]: unknown;
}

export interface PositionResult {
  points: number[];
  box: Box3D;
  keyframe: boolean;
  outside: boolean;
  left: CuboidShape;
}

// ──────────────────────────────────────────────────────────
// HelperTrackState (port từ TrackState trong store.js)
// ──────────────────────────────────────────────────────────

const MAX_UNDO = 200;

export class HelperTrackState {
  public uiId: number | string;
  public key: number | string;
  public server!: ServerTrack;
  public shapes!: CuboidShape[];
  public undoStack!: CuboidShape[][];
  public redoStack!: CuboidShape[][];
  public dirty!: boolean;

  constructor(serverTrack: ServerTrack, uiId: number | string, key: number | string) {
    this.uiId = uiId;
    this.key = key;
    this.load(serverTrack);
  }

  load(serverTrack: ServerTrack): void {
    this.server = deepClone(serverTrack);
    this.shapes = deepClone(serverTrack.shapes).sort((a, b) => a.frame - b.frame);
    this.undoStack = [];
    this.redoStack = [];
    this.dirty = false;
  }

  get id(): number | string {
    return this.key;
  }

  get serverId(): number | null {
    return this.server.id ?? null;
  }

  get labelId(): number {
    return this.server.label_id;
  }

  get firstFrame(): number {
    return this.shapes.length ? this.shapes[0].frame : this.server.frame;
  }

  get lastFrame(): number {
    return this.shapes.length ? this.shapes[this.shapes.length - 1].frame : this.server.frame;
  }

  keyframeIndex(frame: number): number {
    return this.shapes.findIndex((s) => s.frame === frame);
  }

  /**
   * Vị trí box tại frame, giống Track.getPosition của cvat-core.
   * Trả về PositionResult hoặc null nếu frame trước keyframe đầu.
   */
  at(frame: number): PositionResult | null {
    let left: CuboidShape | null = null;
    let right: CuboidShape | null = null;

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
        left,
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
        left,
      };
    }

    const single = left || right;
    if (!single) return null;

    return {
      points: single.points.slice(),
      box: pointsToBox(single.points),
      keyframe: single.frame === frame,
      outside: single === right ? true : single.outside,
      left: single,
    };
  }

  snapshot(): void {
    this.undoStack.push(deepClone(this.shapes));
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.redoStack = [];
  }

  undo(): boolean {
    if (!this.undoStack.length) return false;
    this.redoStack.push(deepClone(this.shapes));
    this.shapes = this.undoStack.pop()!;
    this.dirty =
      JSON.stringify(this.shapes) !== JSON.stringify(this.serverShapesSorted());
    return true;
  }

  redo(): boolean {
    if (!this.redoStack.length) return false;
    this.undoStack.push(deepClone(this.shapes));
    this.shapes = this.redoStack.pop()!;
    this.dirty = true;
    return true;
  }

  serverShapesSorted(): CuboidShape[] {
    return deepClone(this.server.shapes).sort((a, b) => a.frame - b.frame);
  }

  /**
   * Ghi box vào frame. Nếu frame chưa là keyframe thì tạo keyframe mới
   * (giống khi sửa trên CVAT).
   */
  setBox(frame: number, box: Box3D): void {
    const idx = this.keyframeIndex(frame);
    if (idx >= 0) {
      this.shapes[idx].points = boxToPoints(box, this.shapes[idx].points);
    } else {
      const pos = this.at(frame);
      const base = pos ? pos.left : this.shapes[0];
      const shape: CuboidShape = {
        type: 'cuboid',
        frame,
        points: boxToPoints(box, pos ? pos.points : base.points),
        outside: false,
        occluded: base ? base.occluded : false,
        z_order: base ? base.z_order : 0,
        rotation: 0,
        attributes: base ? deepClone(base.attributes || []) : [],
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
  setOutside(frame: number, outside: boolean): void {
    const idx = this.keyframeIndex(frame);
    if (idx >= 0) {
      this.shapes[idx].outside = outside;
    } else {
      const pos = this.at(frame);
      if (!pos) return;
      const base = pos.left;
      this.shapes.push({
        type: 'cuboid',
        frame,
        points: pos.points.slice(),
        outside,
        occluded: base.occluded,
        z_order: base.z_order,
        rotation: 0,
        attributes: deepClone(base.attributes || []),
      });
      this.shapes.sort((a, b) => a.frame - b.frame);
    }
    this.dirty = true;
  }

  /**
   * Payload gửi lên CVAT (PATCH action=update):
   * nguyên track từ server + shapes đã sửa.
   */
  toServer(): ServerTrack {
    const t = deepClone(this.server);
    t.shapes = deepClone(this.shapes);
    return t;
  }
}

// ──────────────────────────────────────────────────────────
// Label interface
// ──────────────────────────────────────────────────────────

interface LabelInfo {
  id: number;
  name: string;
  color: string;
  [key: string]: unknown;
}

// ──────────────────────────────────────────────────────────
// Live track payload (từ bridge readTracks)
// ──────────────────────────────────────────────────────────

interface LiveTrackPayload {
  clientID: number;
  serverID: number | null;
  labelId: number;
  shapes: CuboidShape[];
}

// ──────────────────────────────────────────────────────────
// HelperJobStore (port từ JobStore trong store.js)
// ──────────────────────────────────────────────────────────

export type StoreMode = 'live' | 'api';
export type StoreListener = (what: string) => void;

export class HelperJobStore {
  public jid: number;
  public job: Record<string, unknown> | null = null;
  public meta: Record<string, unknown> | null = null;
  public labels: Map<number, LabelInfo> = new Map();
  public frames: number[] = [];
  public tracks: Map<number | string, HelperTrackState> = new Map();
  public mode: StoreMode = 'api';
  public extraShapes: number = 0;

  private listeners: Set<StoreListener> = new Set();

  constructor(jid: number) {
    this.jid = jid;
  }

  on(cb: StoreListener): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  emit(what: string): void {
    for (const cb of this.listeners) cb(what);
  }

  /**
   * mode 'live': đọc/ghi thẳng bộ nhớ trang CVAT qua plugin bridge (không cần reload).
   * mode 'api' : dự phòng khi không kết nối được bridge – đọc/ghi qua REST, phải reload CVAT sau khi lưu.
   */
  async load(): Promise<void> {
    const [job, meta, labels, live] = await Promise.all([
      helperApi.getJob(this.jid),
      helperApi.getMeta(this.jid),
      helperApi.getLabels(this.jid),
      helperLiveBridge.connect(this.jid),
    ]);

    this.job = job;
    this.meta = meta;
    this.labels = new Map(
      (labels as LabelInfo[]).map((l) => [l.id, l]),
    );
    this.frames = this.computeFrames();
    this.mode = live ? 'live' : 'api';

    if (live) {
      const liveTracks = await helperLiveBridge.call('readTracks', { frames: this.frames }) as LiveTrackPayload[];
      this.setLiveTracks(liveTracks);
    } else {
      const ann = await helperApi.getAnnotations(this.jid);
      this.setAnnotations(ann);
    }

    this.emit('load');
  }

  private setLiveTracks(list: LiveTrackPayload[]): void {
    this.extraShapes = 0;
    this.tracks = new Map();
    for (const t of list) {
      const serverTrack: ServerTrack = {
        id: t.serverID,
        label_id: t.labelId,
        frame: t.shapes[0].frame,
        shapes: t.shapes,
      };
      this.tracks.set(
        t.clientID,
        new HelperTrackState(serverTrack, t.clientID, t.clientID),
      );
    }
  }

  /**
   * Danh sách số frame (tuyệt đối, theo task) thuộc job, theo đúng thứ tự trong chunk.
   */
  private computeFrames(): number[] {
    const m = this.meta as Record<string, unknown> | null;
    if (!m) return [];

    const included = m.included_frames as number[] | undefined;
    if (Array.isArray(included) && included.length) {
      return included.slice().sort((a, b) => a - b);
    }

    const frameFilter = (m.frame_filter as string) || '';
    const stepMatch = /step\s*=\s*(\d+)/.exec(frameFilter);
    const step = stepMatch ? Number(stepMatch[1]) : 1;
    const startFrame = (m.start_frame as number) ?? 0;
    const stopFrame = (m.stop_frame as number) ?? startFrame;
    const out: number[] = [];
    for (let f = startFrame; f <= stopFrame; f += step) out.push(f);
    return out;
  }

  private setAnnotations(ann: Record<string, unknown>): void {
    const tags = (ann.tags as unknown[]) || [];
    const shapes = (ann.shapes as Array<Record<string, unknown>>) || [];
    const before = tags.length + shapes.length;
    this.extraShapes = shapes.filter(
      (s) => s.type === 'cuboid',
    ).length;
    this.tracks = new Map();
    const tracks = (ann.tracks as ServerTrack[]) || [];
    tracks.forEach((t, i) => {
      if (!t.shapes || !t.shapes.length) return;
      if (t.shapes[0].type !== 'cuboid') return;
      this.tracks.set(
        t.id!,
        new HelperTrackState(t, before + i + 1, t.id!),
      );
    });
  }

  track(id: number | string): HelperTrackState | undefined {
    return this.tracks.get(id);
  }

  labelName(labelId: number): string {
    return this.labels.get(labelId)?.name ?? `label ${labelId}`;
  }

  labelColor(labelId: number): string {
    return this.labels.get(labelId)?.color || '#5ad17a';
  }

  dirtyTracks(): HelperTrackState[] {
    return [...this.tracks.values()].filter((t) => t.dirty);
  }

  /**
   * Lưu các track đã sửa. Trước khi ghi, kiểm tra track trên server
   * có bị đổi từ lúc tải không.
   */
  async save(opts: { force?: boolean } = {}): Promise<
    { saved: number; changed?: number; live?: boolean } | { conflicts: (number | string)[] }
  > {
    const dirty = this.dirtyTracks();
    if (!dirty.length) return { saved: 0 };

    if (this.mode === 'live') return this.saveLive(dirty);

    const fresh = await helperApi.getAnnotations(this.jid);
    const freshTracks = (fresh.tracks as ServerTrack[]) || [];
    const freshById = new Map(freshTracks.map((t) => [t.id, t]));

    const conflicts = dirty.filter((t) => {
      const f = freshById.get(t.serverId);
      if (!f) return true;
      const a = JSON.stringify(
        deepClone(f.shapes)
          .sort((x, y) => x.frame - y.frame)
          .map((s) => [s.frame, s.points, s.outside]),
      );
      const b = JSON.stringify(
        t.serverShapesSorted().map((s) => [s.frame, s.points, s.outside]),
      );
      return a !== b;
    });

    if (conflicts.length && !opts.force) {
      return { conflicts: conflicts.map((t) => t.uiId) };
    }

    await helperApi.updateTracks(
      this.jid,
      dirty.map((t) => t.toServer()),
    );

    const after = await helperApi.getAnnotations(this.jid);
    const afterTracks = (after.tracks as ServerTrack[]) || [];
    const afterById = new Map(afterTracks.map((t) => [t.id, t]));

    // Giữ undo history, chỉ cập nhật bản gốc server.
    for (const t of dirty) {
      const srv = afterById.get(t.serverId);
      if (!srv) continue;
      const undo = t.undoStack;
      const redo = t.redoStack;
      t.load(srv);
      t.undoStack = undo;
      t.redoStack = redo;
    }

    this.emit('saved');
    return { saved: dirty.length };
  }

  /**
   * Ghi vào bộ nhớ CVAT rồi bấm Save của CVAT. CVAT tự vẽ lại → không cần reload.
   */
  private async saveLive(
    dirty: HelperTrackState[],
  ): Promise<{ saved: number; changed: number; live: boolean }> {
    let changed = 0;
    for (const t of dirty) {
      const res = (await helperLiveBridge.call('applyTrack', {
        clientID: t.key,
        shapes: t.shapes,
        current: t.serverShapesSorted(),
      })) as { changed: number };
      changed += res.changed;
    }

    await helperLiveBridge.call('saveCvat', {});

    const freshList = (await helperLiveBridge.call('readTracks', {
      frames: this.frames,
    })) as LiveTrackPayload[];
    const freshMap = new Map(freshList.map((t) => [t.clientID, t]));

    for (const t of dirty) {
      const f = freshMap.get(t.key as number);
      if (!f) continue;
      const undo = t.undoStack;
      const redo = t.redoStack;
      t.load({
        ...t.server,
        id: f.serverID,
        shapes: f.shapes,
      });
      t.undoStack = undo;
      t.redoStack = redo;
    }

    this.emit('saved');
    return { saved: dirty.length, changed, live: true };
  }
}
