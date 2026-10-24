/**
 * Tải point cloud (.pcd trong chunk zip) và ảnh camera (context image) của job.
 * Tất cả chỉ giữ trong RAM của tab; gọi dispose() khi đóng tool.
 * Port từ cvat-helper/content/frames.js sang TypeScript strict.
 */

import { parsePCD } from './pcd_parser';
import { listZipEntries } from './zip_reader';
import { helperApi } from './api_client';
import { PointCloudDiskStorage } from './point_cloud_cache';
import type { HelperJobStore } from './helper_store';

// ──────────────────────────────────────────────────────────
// MIME lookup cho context images
// ──────────────────────────────────────────────────────────

const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  bmp: 'image/bmp',
  webp: 'image/webp',
};

// ──────────────────────────────────────────────────────────
// Progress callback type
// ──────────────────────────────────────────────────────────

export interface PreloadProgress {
  done: number;
  total: number;
  fraction: number;
  loadedBytes: number;
  chunk: number | null;
  diskCount: number;
}

export interface ContextImage {
  name: string;
  url: string;
}

// ──────────────────────────────────────────────────────────
// FrameData
// ──────────────────────────────────────────────────────────

export interface FrameDataOptions {
  quality?: string;
}

export class FrameData {
  public clouds: Map<number, Float32Array> = new Map();

  public store: HelperJobStore;
  private quality: string;
  private chunkSize: number;
  private chunks: Map<number, Promise<void>> = new Map();
  private images: Map<number, Promise<ContextImage[]>> = new Map();
  private urls: string[] = [];

  constructor(store: HelperJobStore, opts: FrameDataOptions = {}) {
    this.store = store;
    this.quality = opts.quality || 'compressed';
    const meta = store.meta as Record<string, unknown> | null;
    this.chunkSize = ((meta?.chunk_size as number) || 1);
  }

  /**
   * Tính vị trí chunk và offset cho frame.
   */
  private position(frame: number): { chunk: number; offset: number } {
    const k = this.store.frames.indexOf(frame);
    if (k < 0) throw new Error(`Frame ${frame} không thuộc job`);
    return {
      chunk: Math.floor(k / this.chunkSize),
      offset: k % this.chunkSize,
    };
  }

  /**
   * Tải chunk (nếu chưa tải):
   * 1. Ưu tiên kiểm tra ổ cứng (IndexedDB Cache) -> Nếu có, nạp ngay trong vài ms!
   * 2. Nếu chưa có -> Tải qua mạng -> Tự động lưu vĩnh viễn xuống ổ cứng cho lần sau.
   */
  private loadChunk(
    index: number,
    onBytes?: (loaded: number, total: number) => void,
    onSource?: (fromDisk: boolean) => void,
  ): Promise<void> {
    if (!this.chunks.has(index)) {
      const p = (async () => {
        // 1. Kiểm tra cache trên ổ cứng
        let buf = await PointCloudDiskStorage.getDiskChunk(
          this.store.jid,
          index,
          this.quality,
        );

        if (buf) {
          onSource?.(true);
          onBytes?.(buf.byteLength, buf.byteLength);
        } else {
          onSource?.(false);
          // 2. Chưa có trên ổ cứng -> Tải từ server CVAT
          buf = await helperApi.getChunk(
            this.store.jid,
            index,
            this.quality,
            onBytes,
          );
          // 3. Tự động lưu xuống ổ cứng vĩnh viễn
          PointCloudDiskStorage.saveDiskChunk(
            this.store.jid,
            index,
            this.quality,
            buf,
          );
        }

        const entries = listZipEntries(buf);
        const base = index * this.chunkSize;
        await Promise.all(
          entries.map(async (entry, i) => {
            const frame = this.store.frames[base + i];
            if (frame === undefined) return;
            this.clouds.set(frame, parsePCD(await entry.read()));
          }),
        );
      })();
      p.catch(() => this.chunks.delete(index));
      this.chunks.set(index, p);
    }
    return this.chunks.get(index)!;
  }

  /**
   * Lấy point cloud cho frame (tải chunk nếu cần).
   */
  async cloud(frame: number): Promise<Float32Array> {
    if (this.clouds.has(frame)) return this.clouds.get(frame)!;
    await this.loadChunk(this.position(frame).chunk);
    return this.clouds.get(frame) || new Float32Array(0);
  }

  /**
   * Tải trước point cloud cho dải frame (song song `concurrency` chunk), báo tiến độ.
   */
  async preload(
    frames: number[],
    onProgress?: (progress: PreloadProgress) => void,
    concurrency: number = 3,
  ): Promise<void> {
    const needed = [
      ...new Set(frames.map((f) => this.position(f).chunk)),
    ];

    // tỉ lệ đã tải của chunk: null = đã có sẵn, 0 = chưa tải
    const parts = new Map<number, number | null>(
      needed.map((c) => [c, this.chunks.has(c) ? null : 0]),
    );
    let done = 0;
    let diskCount = 0;
    let loadedBytes = 0;
    const bytes = new Map<number, number>();

    const report = (chunk: number | null = null): void => {
      let partial = 0;
      for (const v of parts.values()) if (v) partial += v;
      onProgress?.({
        done,
        total: needed.length,
        loadedBytes,
        chunk,
        diskCount,
        fraction: needed.length
          ? Math.min(1, (done + partial) / needed.length)
          : 1,
      });
    };

    report();

    const queue = needed.slice();
    const worker = async (): Promise<void> => {
      while (queue.length) {
        const c = queue.shift()!;
        let isFromDisk = false;
        await this.loadChunk(
          c,
          (loaded: number, total: number) => {
            loadedBytes += loaded - (bytes.get(c) || 0);
            bytes.set(c, loaded);
            parts.set(c, total ? Math.min(0.99, loaded / total) : 0);
            report();
          },
          (fromDisk: boolean) => {
            if (fromDisk) {
              isFromDisk = true;
              diskCount += 1;
            }
          },
        );
        parts.set(c, null);
        done += 1;
        report(c);
      }
    };

    await Promise.all(
      Array.from(
        { length: Math.min(concurrency, needed.length) },
        () => worker(),
      ),
    );
  }

  /**
   * Lấy context images (ảnh camera) cho frame.
   */
  contextImages(frame: number): Promise<ContextImage[]> {
    if (!this.images.has(frame)) {
      const p = (async (): Promise<ContextImage[]> => {
        const meta = this.store.meta as Record<string, unknown> | null;
        const framesArr = (meta?.frames as Array<Record<string, unknown>>) || [];
        const frameIndex = this.store.frames.indexOf(frame);
        const frameMeta = framesArr[frameIndex] || framesArr[0];
        if (frameMeta && (frameMeta.related_files as number) === 0) return [];

        const buf = await helperApi.getContextImages(this.store.jid, frame);
        const entries = listZipEntries(buf);
        const out: ContextImage[] = [];

        for (const entry of entries) {
          const ext = entry.name.split('.').pop()!.toLowerCase();
          const rawBytes = await entry.read();
          const url = URL.createObjectURL(
            new Blob([rawBytes.buffer as ArrayBuffer], {
              type: MIME[ext] || 'application/octet-stream',
            }),
          );
          this.urls.push(url);
          out.push({ name: entry.name.split('/').pop()!, url });
        }

        return out;
      })();

      p.catch(() => this.images.delete(frame));
      this.images.set(frame, p);
    }

    return this.images.get(frame)!;
  }

  /**
   * Giải phóng toàn bộ tài nguyên (Object URLs, clouds, chunks, images).
   */
  dispose(): void {
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls = [];
    this.clouds.clear();
    this.chunks.clear();
    this.images.clear();
  }
}
