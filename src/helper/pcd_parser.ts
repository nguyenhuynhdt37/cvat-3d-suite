/**
 * PCD Parser — Đọc file .pcd (ascii / binary / binary_compressed) → Float32Array [x,y,z,x,y,z,...]
 * Port từ CVATHelper pcd.js sang TypeScript type-safe.
 */

/**
 * Giải nén LZF (dùng cho binary_compressed PCD).
 * @param input  Dữ liệu nén LZF
 * @param outLength  Kích thước output đã biết trước (từ header)
 * @returns Mảng byte đã giải nén
 */
export function lzfDecompress(input: Uint8Array, outLength: number): Uint8Array {
  const out = new Uint8Array(outLength);
  let ip = 0;
  let op = 0;

  while (ip < input.length) {
    let ctrl = input[ip++];

    if (ctrl < 32) {
      // Literal run: copy (ctrl + 1) bytes nguyên bản
      ctrl += 1;
      if (op + ctrl > outLength) {
        throw new Error('LZF: dữ liệu hỏng (literal overflow)');
      }
      out.set(input.subarray(ip, ip + ctrl), op);
      ip += ctrl;
      op += ctrl;
    } else {
      // Back-reference: copy từ vùng đã giải nén trước đó
      let len = ctrl >> 5;
      let ref = op - ((ctrl & 0x1f) << 8) - 1;

      if (len === 7) {
        len += input[ip++];
      }
      ref -= input[ip++];
      len += 2;

      if (ref < 0 || op + len > outLength) {
        throw new Error('LZF: dữ liệu hỏng (back-reference overflow)');
      }
      for (let k = 0; k < len; k++) {
        out[op++] = out[ref++];
      }
    }
  }

  return out;
}

/** Kiểu dữ liệu PCD: F = float, I = signed int, U = unsigned int */
type PCDFieldType = 'F' | 'I' | 'U';

/** Tạo hàm đọc giá trị số từ DataView theo kiểu dữ liệu và kích thước byte */
function createReader(
  view: DataView,
  type: PCDFieldType,
  size: number,
): (offset: number) => number {
  if (type === 'F' && size === 4) return (o) => view.getFloat32(o, true);
  if (type === 'F' && size === 8) return (o) => view.getFloat64(o, true);
  if (type === 'I' && size === 1) return (o) => view.getInt8(o);
  if (type === 'I' && size === 2) return (o) => view.getInt16(o, true);
  if (type === 'I' && size === 4) return (o) => view.getInt32(o, true);
  if (type === 'U' && size === 1) return (o) => view.getUint8(o);
  if (type === 'U' && size === 2) return (o) => view.getUint16(o, true);
  if (type === 'U' && size === 4) return (o) => view.getUint32(o, true);
  throw new Error(`PCD: kiểu ${type}${size} chưa hỗ trợ`);
}

/** Header PCD đã parse */
interface PCDHeader {
  [key: string]: string[];
}

/**
 * Parse file PCD từ mảng byte thô → Float32Array chứa tọa độ [x,y,z,x,y,z,...].
 *
 * Hỗ trợ cả 3 chế độ DATA: ascii, binary, binary_compressed.
 * Chỉ trích xuất 3 field x, y, z; bỏ qua các field khác (intensity, rgb, normal...).
 *
 * @param bytes  Nội dung file .pcd dưới dạng Uint8Array
 * @returns Float32Array chứa tọa độ điểm, mỗi điểm 3 giá trị liên tiếp [x, y, z]
 */
export function parsePCD(bytes: Uint8Array): Float32Array {
  // ── Parse header ASCII (kết thúc ở dòng DATA) ──
  let headerEnd = -1;
  const limit = Math.min(bytes.length, 65536);
  let lineStart = 0;
  const header: PCDHeader = {};
  const td = new TextDecoder();

  for (let i = 0; i < limit; i++) {
    if (bytes[i] !== 10) continue; // 10 = '\n'

    const line = td.decode(bytes.subarray(lineStart, i)).trim();
    lineStart = i + 1;

    if (!line || line.startsWith('#')) continue;

    const [key, ...rest] = line.split(/\s+/);
    header[key.toUpperCase()] = rest;

    if (key.toUpperCase() === 'DATA') {
      headerEnd = i + 1;
      break;
    }
  }

  if (headerEnd < 0) {
    throw new Error('PCD: không tìm thấy header DATA');
  }

  // ── Trích xuất thông tin field từ header ──
  const fields = header.FIELDS;
  const sizes = header.SIZE.map(Number);
  const types = header.TYPE as PCDFieldType[];
  const counts = header.COUNT ? header.COUNT.map(Number) : fields.map(() => 1);

  const pointsRaw = header.POINTS?.[0];
  const points = Number(
    pointsRaw ?? (Number(header.WIDTH[0]) * Number(header.HEIGHT?.[0] ?? 1)),
  );

  const mode = header.DATA[0].toLowerCase();

  // ── Tìm vị trí field x, y, z ──
  const idx = (['x', 'y', 'z'] as const).map((f) => fields.indexOf(f));
  if (idx.some((v) => v < 0)) {
    throw new Error('PCD: thiếu field x/y/z');
  }

  const out = new Float32Array(points * 3);
  let n = 0;

  // ── Chế độ ASCII ──
  if (mode === 'ascii') {
    const text = td.decode(bytes.subarray(headerEnd));
    // Tính vị trí cột dựa trên count (mỗi field có thể chiếm nhiều cột)
    const col: number[] = [];
    let c = 0;
    fields.forEach((_, k) => {
      col.push(c);
      c += counts[k];
    });

    for (const line of text.split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < c) continue;

      const x = +parts[col[idx[0]]];
      const y = +parts[col[idx[1]]];
      const z = +parts[col[idx[2]]];

      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
        out[n++] = x;
        out[n++] = y;
        out[n++] = z;
      }
    }
    return out.subarray(0, n);
  }

  // ── Chế độ binary / binary_compressed ──
  let data: Uint8Array;
  let offsetOf: (field: number, pointIndex: number) => number;

  if (mode === 'binary') {
    data = bytes.subarray(headerEnd);
    const stride = sizes.reduce((s, sz, k) => s + sz * counts[k], 0);
    const fieldOff: number[] = [];
    let o = 0;
    fields.forEach((_, k) => {
      fieldOff.push(o);
      o += sizes[k] * counts[k];
    });
    offsetOf = (field, i) => i * stride + fieldOff[field];
  } else if (mode === 'binary_compressed') {
    const hv = new DataView(bytes.buffer, bytes.byteOffset + headerEnd, 8);
    const compressed = hv.getUint32(0, true);
    const uncompressed = hv.getUint32(4, true);
    data = lzfDecompress(
      bytes.subarray(headerEnd + 8, headerEnd + 8 + compressed),
      uncompressed,
    );
    const fieldOff: number[] = [];
    let o = 0;
    fields.forEach((_, k) => {
      fieldOff.push(o);
      o += sizes[k] * counts[k] * points;
    });
    offsetOf = (field, i) => fieldOff[field] + i * sizes[field] * counts[field];
  } else {
    throw new Error(`PCD: DATA ${mode} chưa hỗ trợ`);
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const rd = idx.map((f) => createReader(view, types[f], sizes[f]));

  for (let i = 0; i < points; i++) {
    const x = rd[0](offsetOf(idx[0], i));
    const y = rd[1](offsetOf(idx[1], i));
    const z = rd[2](offsetOf(idx[2], i));

    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
      out[n++] = x;
      out[n++] = y;
      out[n++] = z;
    }
  }

  return out.subarray(0, n);
}
