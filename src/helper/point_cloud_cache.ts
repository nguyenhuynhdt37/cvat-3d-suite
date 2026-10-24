/**
 * Quản lý lưu trữ Point Cloud bền vững vào ổ cứng thông qua IndexedDB của trình duyệt.
 * Cho phép nạp tức thì dữ liệu LiDAR của Job/Task mà không cần tải lại qua mạng.
 */

const DB_NAME = 'CVAT_3D_SUITE_CACHE';
const DB_VERSION = 1;
const CHUNK_STORE = 'chunks';

export interface CachedChunkRecord {
  key: string;
  jid: number;
  chunkIndex: number;
  quality: string;
  data: ArrayBuffer;
  byteSize: number;
  savedAt: number;
}

export interface CacheStats {
  count: number;
  totalBytes: number;
}

class PointCloudDiskStorageManager {
  private dbPromise: Promise<IDBDatabase> | null = null;

  /**
   * Khởi tạo hoặc mở kết nối IndexedDB.
   */
  private getDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('Trình duyệt không hỗ trợ IndexedDB'));
        return;
      }

      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(CHUNK_STORE)) {
          const store = db.createObjectStore(CHUNK_STORE, { keyPath: 'key' });
          store.createIndex('by_jid', 'jid', { unique: false });
        }
      };

      req.onsuccess = () => {
        resolve(req.result);
      };

      req.onerror = () => {
        this.dbPromise = null;
        reject(req.error || new Error('Lỗi mở IndexedDB'));
      };
    });

    return this.dbPromise;
  }

  private makeKey(jid: number, chunkIndex: number, quality: string): string {
    return `${jid}_chunk_${chunkIndex}_${quality}`;
  }

  /**
   * Lấy dữ liệu chunk nhị phân (.zip) đã lưu trên ổ cứng.
   * Trả về ArrayBuffer nếu có, null nếu chưa cache.
   */
  public async getDiskChunk(
    jid: number,
    chunkIndex: number,
    quality: string
  ): Promise<ArrayBuffer | null> {
    try {
      const db = await this.getDb();
      return await new Promise<ArrayBuffer | null>((resolve) => {
        const tx = db.transaction(CHUNK_STORE, 'readonly');
        const store = tx.objectStore(CHUNK_STORE);
        const req = store.get(this.makeKey(jid, chunkIndex, quality));

        req.onsuccess = () => {
          const record = req.result as CachedChunkRecord | undefined;
          resolve(record && record.data ? record.data : null);
        };

        req.onerror = () => {
          resolve(null);
        };
      });
    } catch (err) {
      console.warn('[Cache] Không thể đọc từ IndexedDB:', err);
      return null;
    }
  }

  /**
   * Kiểm tra nhanh xem chunk đã được lưu trên ổ cứng chưa.
   */
  public async hasDiskChunk(
    jid: number,
    chunkIndex: number,
    quality: string
  ): Promise<boolean> {
    try {
      const db = await this.getDb();
      return await new Promise<boolean>((resolve) => {
        const tx = db.transaction(CHUNK_STORE, 'readonly');
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
  public async saveDiskChunk(
    jid: number,
    chunkIndex: number,
    quality: string,
    data: ArrayBuffer
  ): Promise<void> {
    try {
      const db = await this.getDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(CHUNK_STORE, 'readwrite');
        const store = tx.objectStore(CHUNK_STORE);

        const record: CachedChunkRecord = {
          key: this.makeKey(jid, chunkIndex, quality),
          jid,
          chunkIndex,
          quality,
          data,
          byteSize: data.byteLength,
          savedAt: Date.now(),
        };

        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('[Cache] Không thể ghi xuống IndexedDB:', err);
    }
  }

  /**
   * Lấy thống kê dung lượng cache đã lưu cho Job này (hoặc toàn bộ nếu jid <= 0).
   */
  public async getCacheStats(jid?: number): Promise<CacheStats> {
    try {
      const db = await this.getDb();
      return await new Promise<CacheStats>((resolve) => {
        const tx = db.transaction(CHUNK_STORE, 'readonly');
        const store = tx.objectStore(CHUNK_STORE);
        let count = 0;
        let totalBytes = 0;

        const cursorReq = jid && jid > 0
          ? store.index('by_jid').openCursor(IDBKeyRange.only(jid))
          : store.openCursor();

        cursorReq.onsuccess = (e) => {
          const cursor = (e.target as IDBRequest).result as IDBCursorWithValue | null;
          if (cursor) {
            count += 1;
            totalBytes += (cursor.value as CachedChunkRecord).byteSize || 0;
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
  public async clearCache(jid?: number): Promise<void> {
    try {
      const db = await this.getDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(CHUNK_STORE, 'readwrite');
        const store = tx.objectStore(CHUNK_STORE);

        if (jid && jid > 0) {
          const index = store.index('by_jid');
          const req = index.openCursor(IDBKeyRange.only(jid));
          req.onsuccess = (e) => {
            const cursor = (e.target as IDBRequest).result as IDBCursor | null;
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
      console.warn('[Cache] Lỗi dọn cache:', err);
    }
  }
}

export const PointCloudDiskStorage = new PointCloudDiskStorageManager();
