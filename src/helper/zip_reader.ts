/**
 * ZIP Reader — Đọc file zip (chunk dữ liệu CVAT) bằng DecompressionStream.
 * Thứ tự entry giữ nguyên như trong zip — CVAT (JSZip) dùng thứ tự này để đánh số frame.
 * Hỗ trợ ZIP64, method Stored (0) và Deflate (8).
 */

/** Một entry trong file ZIP */
export interface ZipEntry {
  /** Tên file (đường dẫn tương đối bên trong zip) */
  name: string;
  /** Đọc và giải nén nội dung entry */
  read(): Promise<Uint8Array>;
}

/**
 * Giải nén deflate-raw bằng DecompressionStream có sẵn của trình duyệt.
 */
async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Tìm vị trí End of Central Directory (EOCD) record.
 * Duyệt ngược từ cuối file, tối đa 65557 byte (EOCD + comment tối đa 65535).
 */
function findEOCD(view: DataView): number {
  const min = Math.max(0, view.byteLength - 65557);
  for (let i = view.byteLength - 22; i >= min; i--) {
    if (view.getUint32(i, true) === 0x06054b50) return i;
  }
  throw new Error('Không phải file zip hợp lệ');
}

/**
 * Liệt kê các entry trong file ZIP.
 *
 * Đọc Central Directory, hỗ trợ ZIP64 extra field cho các file lớn.
 * Bỏ qua các entry là thư mục (tên kết thúc bằng '/').
 *
 * @param buffer  Toàn bộ nội dung file ZIP dưới dạng ArrayBuffer
 * @returns Mảng ZipEntry, mỗi entry có `.name` và `.read()` trả về nội dung giải nén
 */
export function listZipEntries(buffer: ArrayBuffer): ZipEntry[] {
  const view = new DataView(buffer);
  const eocd = findEOCD(view);

  let count = view.getUint16(eocd + 10, true);
  let cdOffset = view.getUint32(eocd + 16, true);

  // ── Xử lý ZIP64 ──
  if (cdOffset === 0xffffffff || count === 0xffff) {
    const locator = eocd - 20;
    if (locator >= 0 && view.getUint32(locator, true) === 0x07064b50) {
      const z64 = Number(view.getBigUint64(locator + 8, true));
      count = Number(view.getBigUint64(z64 + 32, true));
      cdOffset = Number(view.getBigUint64(z64 + 48, true));
    }
  }

  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  let p = cdOffset;

  for (let n = 0; n < count; n++) {
    // ── Kiểm tra Central Directory signature ──
    if (view.getUint32(p, true) !== 0x02014b50) {
      throw new Error('Central directory zip bị hỏng');
    }

    const method = view.getUint16(p + 10, true);
    let compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    let localOffset = view.getUint32(p + 42, true);
    const name = decoder.decode(new Uint8Array(buffer, p + 46, nameLen));

    // ── Xử lý ZIP64 extra field (tag 0x0001) ──
    let e = p + 46 + nameLen;
    const eEnd = e + extraLen;
    while (e + 4 <= eEnd) {
      const id = view.getUint16(e, true);
      const size = view.getUint16(e + 2, true);
      if (id === 0x0001) {
        let q = e + 4;
        // Uncompressed size (nếu marker 0xFFFFFFFF)
        if (view.getUint32(p + 24, true) === 0xffffffff) {
          q += 8;
        }
        // Compressed size
        if (compSize === 0xffffffff) {
          compSize = Number(view.getBigUint64(q, true));
          q += 8;
        }
        // Local header offset
        if (localOffset === 0xffffffff) {
          localOffset = Number(view.getBigUint64(q, true));
        }
      }
      e += 4 + size;
    }

    p = eEnd + commentLen;

    // Bỏ qua thư mục
    if (name.endsWith('/')) continue;

    // Capture biến cho closure
    const capturedCompSize = compSize;
    const capturedLocalOffset = localOffset;
    const capturedMethod = method;
    const capturedName = name;

    entries.push({
      name,
      async read(): Promise<Uint8Array> {
        const lNameLen = view.getUint16(capturedLocalOffset + 26, true);
        const lExtraLen = view.getUint16(capturedLocalOffset + 28, true);
        const start = capturedLocalOffset + 30 + lNameLen + lExtraLen;
        const data = new Uint8Array(buffer, start, capturedCompSize);

        if (capturedMethod === 0) {
          // Stored — không nén
          return data.slice();
        }
        if (capturedMethod === 8) {
          // Deflate
          return inflateRaw(data);
        }
        throw new Error(
          `Zip method ${capturedMethod} chưa hỗ trợ (${capturedName})`,
        );
      },
    });
  }

  return entries;
}
