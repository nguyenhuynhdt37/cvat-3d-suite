/**
 * API Client — Gọi CVAT bằng đúng phiên đăng nhập của tab hiện tại (cookie + CSRF).
 * Mọi request đều đi tới `location.origin` — không bao giờ tới host khác.
 */

// ─── Response Types ───

export interface CvatJob {
  id: number;
  dimension: string;
  [key: string]: unknown;
}

export interface CvatMeta {
  frames: unknown[];
  [key: string]: unknown;
}

export interface CvatAnnotations {
  version: number;
  tags: unknown[];
  shapes: unknown[];
  tracks: unknown[];
  [key: string]: unknown;
}

export interface CvatLabel {
  id: number;
  name: string;
  color: string;
  [key: string]: unknown;
}

export interface CvatPaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// ─── Progress Callback ───

export type ProgressCallback = (loaded: number, total: number) => void;

// ─── Internal Helpers ───

/** Lấy giá trị cookie theo tên */
function cookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

/** Lấy slug tổ chức hiện tại từ localStorage */
function orgSlug(): string {
  try {
    return localStorage.getItem('currentOrganization') || '';
  } catch {
    return '';
  }
}

/** Xây dựng URL an toàn (chặn request ra ngoài origin) */
function buildUrl(
  path: string,
  params?: Record<string, string | number | undefined | null>,
  withOrg?: boolean,
): URL {
  const url = new URL(path, location.origin);
  if (url.origin !== location.origin) {
    throw new Error(`Chặn request ra ngoài: ${url.origin}`);
  }
  const all: Record<string, string | number | undefined | null> = {
    ...(withOrg ? { org: orgSlug() } : {}),
    ...(params || {}),
  };
  for (const [k, v] of Object.entries(all)) {
    if (v !== undefined && v !== null) {
      url.searchParams.set(k, String(v));
    }
  }
  return url;
}

// ─── Response Type ───

type ResponseType = 'json' | 'arraybuffer';

interface RequestOptions {
  params?: Record<string, string | number | undefined | null>;
  body?: unknown;
  responseType?: ResponseType;
  withOrg?: boolean;
  onProgress?: ProgressCallback;
}

/**
 * Đọc body theo luồng để báo tiến độ.
 * @param res       Response từ fetch
 * @param onProgress  Callback (loaded, total). total = 0 nếu server không gửi Content-Length
 * @returns ArrayBuffer chứa toàn bộ body
 */
export async function readWithProgress(
  res: Response,
  onProgress?: ProgressCallback,
): Promise<ArrayBuffer> {
  if (!onProgress || !res.body) {
    return res.arrayBuffer();
  }

  const total = Number(res.headers.get('Content-Length')) || 0;
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let loaded = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    loaded += value.length;
    onProgress(loaded, total);
  }

  const out = new Uint8Array(loaded);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out.buffer;
}

/**
 * Gửi request tới CVAT API (same-origin, CSRF token tự động).
 */
async function request(
  method: string,
  path: string,
  opts: RequestOptions = {},
): Promise<unknown> {
  const {
    params,
    body,
    responseType = 'json',
    withOrg = true,
    onProgress,
  } = opts;

  const headers: Record<string, string> = {
    Accept: 'application/vnd.cvat+json, application/json, */*',
  };
  const csrf = cookie('csrftoken');
  if (csrf) {
    headers['X-CSRFToken'] = csrf;
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(buildUrl(path, params, withOrg), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
    cache: 'no-store',
    referrerPolicy: 'same-origin',
  });

  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 300);
    } catch {
      /* bỏ qua */
    }
    throw new Error(`${method} ${path} → HTTP ${res.status} ${detail}`);
  }

  if (responseType === 'arraybuffer') {
    return readWithProgress(res, onProgress);
  }
  if (res.status === 204) {
    return null;
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ─── Public API Object ───

export const helperApi = {
  /** Lấy thông tin job */
  getJob(jid: number): Promise<CvatJob> {
    return request('GET', `/api/jobs/${jid}`, { withOrg: false }) as Promise<CvatJob>;
  },

  /** Lấy metadata (danh sách frame, chunk info) */
  getMeta(jid: number): Promise<CvatMeta> {
    return request('GET', `/api/jobs/${jid}/data/meta`) as Promise<CvatMeta>;
  },

  /** Lấy toàn bộ annotation (tags, shapes, tracks) */
  getAnnotations(jid: number): Promise<CvatAnnotations> {
    return request('GET', `/api/jobs/${jid}/annotations`) as Promise<CvatAnnotations>;
  },

  /** Cập nhật (PATCH) danh sách tracks */
  updateTracks(jid: number, tracks: unknown[]): Promise<unknown> {
    return request('PATCH', `/api/jobs/${jid}/annotations`, {
      params: { action: 'update' },
      body: { version: 0, tags: [], shapes: [], tracks },
    });
  },

  /** Tải chunk point cloud (arraybuffer) với progress callback */
  getChunk(
    jid: number,
    index: number,
    quality: string,
    onProgress?: ProgressCallback,
  ): Promise<ArrayBuffer> {
    return request('GET', `/api/jobs/${jid}/data`, {
      params: { type: 'chunk', index, quality },
      responseType: 'arraybuffer',
      onProgress,
    }) as Promise<ArrayBuffer>;
  },

  /** Tải ảnh context (camera images) cho 1 frame */
  getContextImages(jid: number, frame: number): Promise<ArrayBuffer> {
    return request('GET', `/api/jobs/${jid}/data`, {
      params: {
        type: 'context_image',
        number: frame,
        quality: 'original',
      },
      responseType: 'arraybuffer',
    }) as Promise<ArrayBuffer>;
  },

  /** Lấy danh sách label của job (phân trang tự động) */
  async getLabels(jid: number): Promise<CvatLabel[]> {
    const out: CvatLabel[] = [];
    let page = 1;

    for (;;) {
      const data = (await request('GET', '/api/labels', {
        params: { job_id: jid, page_size: 500, page },
      })) as CvatPaginatedResponse<CvatLabel>;

      out.push(...(data.results || []));
      if (!data.next) break;
      page += 1;
    }

    return out;
  },
};
