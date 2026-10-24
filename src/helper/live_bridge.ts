/**
 * Bridge 2 chiều: phía tool (isolated world) gọi sang bridge-main.js
 * chạy trong trang CVAT.
 * Port từ cvat-helper/content/bridge.js + bridge-main.js sang TypeScript strict.
 */

// ──────────────────────────────────────────────────────────
// Bridge phía tool (isolated world → main world)
// ──────────────────────────────────────────────────────────

const REQ_EVENT = 'cvat-helper:req';
const RES_EVENT = 'cvat-helper:res';

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const pending = new Map<string, PendingCall>();
let seq = 0;

/**
 * Lắng nghe phản hồi từ bridge-main qua CustomEvent trên document.
 */
function initResponseListener(): void {
  document.addEventListener(RES_EVENT, ((e: CustomEvent<string>) => {
    let msg: { id?: string; ok?: boolean; result?: unknown; error?: string };
    try {
      msg = JSON.parse(e.detail);
    } catch {
      return;
    }
    const p = pending.get(msg?.id ?? '');
    if (!p) return;
    pending.delete(msg.id!);
    clearTimeout(p.timer);
    if (msg.ok) p.resolve(msg.result);
    else p.reject(new Error(msg.error || 'Bridge error'));
  }) as EventListener);
}

let listenerInited = false;

/**
 * Gọi phương thức trên bridge-main.js qua CustomEvent.
 */
function call(
  method: string,
  args: Record<string, unknown>,
  timeoutMs: number = 120_000,
): Promise<unknown> {
  if (!listenerInited) {
    initResponseListener();
    listenerInited = true;
  }

  const id = `${Date.now()}-${++seq}`;
  return new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Bridge CVAT không phản hồi (${method})`));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    document.dispatchEvent(
      new CustomEvent(REQ_EVENT, {
        detail: JSON.stringify({ id, method, args }),
      }),
    );
  });
}

/**
 * Kết nối trực tiếp được khi CVAT đã nạp plugin và đang mở đúng job.
 */
async function connect(jid: number): Promise<boolean> {
  try {
    const st = (await call('status', {}, 1500)) as {
      ready?: boolean;
      jobId?: number;
    } | null;
    return !!(st && st.ready && st.jobId === jid);
  } catch {
    return false;
  }
}

/**
 * Object bridge phía tool: export để các module khác sử dụng.
 */
export const helperLiveBridge = {
  call,
  connect,
} as const;

// ──────────────────────────────────────────────────────────
// Bridge-main source (inject vào trang CVAT qua <script>)
// ──────────────────────────────────────────────────────────

/**
 * Trả về source code của bridge-main.js dưới dạng string.
 * Code này sẽ được inject vào trang CVAT qua script tag để chạy trong
 * ngữ cảnh trang (world: MAIN). Đăng ký làm plugin qua cổng chính thức
 * `window.cvatUI` của CVAT để đọc/ghi annotation ngay trong bộ nhớ trang
 * – không cần reload.
 */
export function getHelperBridgeMainScript(): string {
  return `(function() {
  if (window.__cvatHelperBridge) return;
  window.__cvatHelperBridge = true;

  var REQ = 'cvat-helper:req';
  var RES = 'cvat-helper:res';
  var ctx = null;

  function register() {
    if (ctx || !window.cvatUI || typeof window.cvatUI.registerComponent !== 'function') return !!ctx;
    window.cvatUI.registerComponent(function(args) {
      ctx = args;
      return { name: 'CVAT 3D Label Helper', destructor: function() { ctx = null; } };
    });
    return !!ctx;
  }

  if (!register()) {
    document.addEventListener('plugins.ready', register);
    var tries = 0;
    var timer = setInterval(function() { if (register() || ++tries > 120) clearInterval(timer); }, 500);
  }

  function annotationState() {
    if (!ctx) throw new Error('Chưa kết nối được plugin CVAT');
    var st = ctx.store.getState().annotation;
    var job = st && st.job && st.job.instance;
    if (!job) throw new Error('Chưa mở job trên CVAT');
    return { job: job, frame: st.player.frame.number };
  }

  function trackStatesAt(job, frame) {
    return job.annotations.get(frame, true, [])
      .then(function(states) {
        return states.filter(function(s) {
          return s.objectType === 'track' && s.shapeType === 'cuboid';
        });
      });
  }

  var methods = {
    status: function() {
      if (!ctx) return Promise.resolve({ ready: false });
      var st = ctx.store.getState().annotation;
      var job = st && st.job && st.job.instance;
      return Promise.resolve({
        ready: !!job,
        jobId: job ? job.id : null,
        dimension: job ? job.dimension : null,
        unsaved: job ? job.annotations.hasUnsavedChanges() : false
      });
    },

    readTracks: function(args) {
      var frames = args.frames;
      var result = annotationState();
      var job = result.job;
      var tracks = new Map();
      var work = Promise.resolve();
      frames.forEach(function(frame) {
        work = work.then(function() {
          return trackStatesAt(job, frame).then(function(states) {
            states.forEach(function(s) {
              var t = tracks.get(s.clientID);
              if (!t) {
                t = { clientID: s.clientID, serverID: s.serverID || null, labelId: s.label.id, shapes: [] };
                tracks.set(s.clientID, t);
              }
              if (s.keyframe) {
                t.shapes.push({
                  type: 'cuboid', frame: frame, points: Array.from(s.points), outside: !!s.outside,
                  occluded: !!s.occluded, z_order: s.zOrder || 0, rotation: 0, attributes: []
                });
              }
            });
          }).catch(function() {});
        });
      });
      return work.then(function() {
        var out = [];
        tracks.forEach(function(t) { if (t.shapes.length) out.push(t); });
        return out;
      });
    },

    applyTrack: function(args) {
      var clientID = args.clientID;
      var shapes = args.shapes;
      var current = args.current;
      var result = annotationState();
      var job = result.job;
      var want = new Map(shapes.map(function(s) { return [s.frame, s]; }));
      var have = new Map(current.map(function(s) { return [s.frame, s]; }));
      var same = function(a, b) {
        return a.length === b.length && a.every(function(v, i) { return Math.abs(v - b[i]) < 1e-9; });
      };
      var changed = 0;
      var work = Promise.resolve();

      want.forEach(function(s, frame) {
        work = work.then(function() {
          var old = have.get(frame);
          if (old && same(old.points, s.points) && old.outside === s.outside) return;
          return trackStatesAt(job, frame).then(function(states) {
            var state = states.find(function(x) { return x.clientID === clientID; });
            if (!state) throw new Error('Không tìm thấy track ' + clientID + ' ở frame ' + frame);
            if (!old || !same(old.points, s.points)) state.points = s.points;
            if (!old || old.outside !== s.outside) state.outside = s.outside;
            return state.save();
          }).then(function() { changed += 1; });
        });
      });

      have.forEach(function(_v, frame) {
        if (want.has(frame)) return;
        work = work.then(function() {
          return trackStatesAt(job, frame).then(function(states) {
            var state = states.find(function(x) { return x.clientID === clientID; });
            if (!state) return;
            state.keyframe = false;
            return state.save();
          }).then(function() { changed += 1; });
        });
      });

      return work.then(function() { return { changed: changed }; });
    },

    refresh: function() {
      var result = annotationState();
      return ctx.dispatch(ctx.actionCreators.changeFrameAsync(result.frame, undefined, undefined, true))
        .then(function() { return true; });
    },

    saveCvat: function() {
      var result = annotationState();
      var job = result.job;
      var btn = document.querySelector('.cvat-annotation-header-save-button');
      if (btn && !btn.classList.contains('cvat-annotation-disabled-header-button')) {
        btn.click();
        var attempts = 0;
        return new Promise(function(resolve, reject) {
          var check = setInterval(function() {
            attempts++;
            if (!job.annotations.hasUnsavedChanges()) {
              clearInterval(check);
              resolve({ saved: true, via: 'button' });
            } else if (attempts >= 600) {
              clearInterval(check);
              reject(new Error('CVAT lưu quá lâu (60s) – kiểm tra lại trên CVAT'));
            }
          }, 100);
        });
      }
      return job.annotations.save().then(function() {
        return methods.refresh();
      }).then(function() {
        return { saved: true, via: 'core' };
      });
    }
  };

  document.addEventListener(REQ, function(e) {
    var msg;
    try { msg = JSON.parse(e.detail); } catch(_) { return; }
    if (!msg || !methods[msg.method]) return;
    var reply;
    Promise.resolve().then(function() {
      return methods[msg.method](msg.args || {});
    }).then(function(result) {
      reply = { id: msg.id, ok: true, result: result };
    }).catch(function(err) {
      reply = { id: msg.id, ok: false, error: String((err && err.message) || err) };
    }).then(function() {
      document.dispatchEvent(new CustomEvent(RES, { detail: JSON.stringify(reply) }));
    });
  });
})();`;
}
