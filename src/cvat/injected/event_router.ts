/**
 * Module: Event Router Hub (CVAT 3D Suite - Main World)
 * Chuyên trách:
 * 1. Đăng ký và điều phối toàn bộ các CustomEvent giao tiếp với UI Panel và Sandbox.
 * 2. Cầu nối đồng bộ 2 chiều (Two-Way Live Sync) giữa Redux, Three.js và UI Extension.
 * 3. Bảo toàn 100% các tính năng: Tua frame, Snapshot Undo/Redo, Ground Snap, Quick Fit.
 */

import {
  getReduxStore,
  getActiveJobInstance,
  updateMainWorldLabels,
  resolveLabelName,
  findTrackInJob,
  getJobTrackCollection,
  toArray,
  persistJobAnnotations,
  markCvatSaveButtonUnsaved,
} from "./redux_bridge.ts";
import {
  extractLivePointsFromDrawnAndState,
  updateThreeJsCuboid,
  ensureCuboidPoints,
  isFrameTransitioning,
  calculateAndBroadcastBoxEdgeContacts,
} from "./canvas_interactor.ts";
import {
  getSceneLidarPoints,
  detectAccurateGroundZ,
  detectCurbStepAndRollInMainWorld,
} from "./ground_mesh_engine.ts";
import {
  currentPointColorMode,
  currentColorizeBoxed,
  currentCanvasTheme,
  currentOrthoPointSize,
  setCurrentPointColorMode,
  setCurrentColorizeBoxed,
  setCurrentCanvasTheme,
  applyCanvasThemeInMainWorld,
  applyPointCloudColorizationInMainWorld,
  applyOrthoPointSize,
} from "./point_cloud_colorizer.ts";
import {
  fitBoxToEgoRayAndGroundInMainWorld,
  fitPedestrianInMainWorld,
  fitCyclistInMainWorld,
  computeLidarGroundAndFit,
  fitBoxWithPadding5cm,
} from "./fitting_algorithms.ts";
import { flipYaw } from "../../core/geometry/transforms.ts";
import { fitYawToLaneIntensity } from "../../core/geometry/lane_snap.ts";

/**
 * Tìm đối tượng an toàn qua cvat-core annotations hoặc Three.js drawnObjects
 */
export async function findTargetSafely(
  job: any,
  frame: number,
  uiId: number,
  serverId?: number
): Promise<{ target: any; isDrawn: boolean }> {
  if (job && job.annotations) {
    try {
      const annotations = await job.annotations.get(frame);
      const found = annotations.find(
        (s: any) => s.clientID === uiId || (serverId && s.serverID === serverId)
      );
      if (found) return { target: found, isDrawn: false };
    } catch (_) {}
  }

  const store = getReduxStore();
  const canvas = store?.getState()?.annotation?.canvas?.instance;
  const drawnItem = canvas?.view?.drawnObjects?.[String(uiId)];
  if (drawnItem && drawnItem.data && Array.isArray(drawnItem.data.points)) {
    return { target: drawnItem.data, isDrawn: true };
  }

  throw new Error(`Không tìm thấy xe #${uiId} tại Frame #${frame}`);
}

/**
 * Tính toán độ bù trừ 3D vector ez khi thay đổi chiều cao H để giữ nguyên 4 góc đáy
 */
function computeGroundLockOffset(p: number[], targetH: number): { dx: number; dy: number; dz: number } {
  const rx = p[3] || 0;
  const ry = p[4] || 0;
  const oldHeight = p[8] || targetH;
  const dh = (targetH - oldHeight) / 2;
  const sinRy = Math.sin(ry);
  const cosRy = Math.cos(ry);
  const sinRx = Math.sin(rx);
  const cosRx = Math.cos(rx);
  return {
    dx: Number((dh * sinRy).toFixed(3)),
    dy: Number((-dh * sinRx * cosRy).toFixed(3)),
    dz: Number((dh * cosRx * cosRy).toFixed(3)),
  };
}

let isEventRoutersRegistered = false;

/**
 * Đăng ký toàn bộ event listeners tiếp nhận yêu cầu từ UI Extension
 */
export function registerEventRouters(): void {
  if (isEventRoutersRegistered) return;
  isEventRoutersRegistered = true;

  // 1. Lắng nghe yêu cầu lấy danh sách xe tại Frame hiện tại
  window.addEventListener("CVAT_EXT_REQ_FRAME_TRACKS", async (e: any) => {
    const { jobId, frame } = e.detail || {};
    try {
      const job = await getActiveJobInstance(jobId);
      let annotations: any[] = [];

      if (job) {
        updateMainWorldLabels(job);
        try {
          annotations = await job.annotations.get(frame);
        } catch (_) {
          annotations = [];
        }
      } else {
        const store = getReduxStore();
        const reduxStates = store?.getState()?.annotation?.annotations?.states;
        if (Array.isArray(reduxStates) && reduxStates.length > 0) {
          annotations = reduxStates;
        } else {
          window.dispatchEvent(
            new CustomEvent("CVAT_EXT_RES_FRAME_TRACKS", {
              detail: { success: false, loading: true, frame, list: [] },
            })
          );
          return;
        }
      }

      const store = getReduxStore();
      const canvas = store?.getState()?.annotation?.canvas?.instance;
      const drawnObjects = canvas?.view?.drawnObjects || {};
      const reduxStates = store?.getState()?.annotation?.annotations?.states || [];

      const stateMap = new Map<number, any>();
      if (Array.isArray(annotations)) {
        for (const a of annotations) {
          if (a && typeof a.clientID === "number") stateMap.set(a.clientID, a);
        }
      }

      const curF = store?.getState()?.annotation?.player?.frame?.number ?? store?.getState()?.annotation?.job?.instance?.frame;
      if (curF === frame && !isFrameTransitioning) {
        for (const s of reduxStates) {
          if (s && typeof s.clientID === "number") {
            if (typeof s.frame === "number" && s.frame !== frame) continue;
            if (!stateMap.has(s.clientID)) {
              stateMap.set(s.clientID, s);
            }
          }
        }
        for (const key of Object.keys(drawnObjects)) {
          const idNum = Number(key);
          if (!isNaN(idNum) && !stateMap.has(idNum)) {
            const item = drawnObjects[key];
            if (item?.data) {
              if (typeof item.data.frame === "number" && item.data.frame !== frame) continue;
              stateMap.set(idNum, {
                ...item.data,
                clientID: idNum,
                shapeType: "cuboid",
              });
            }
          }
        }
      }

      const list: any[] = [];
      for (const [cId, s] of stateMap.entries()) {
        if (!s || s.shapeType !== "cuboid" || s.outside) continue;
        const drawn = drawnObjects[String(cId)];
        const p = extractLivePointsFromDrawnAndState(drawn, s);
        if (!p || p.length < 9) continue;

        const resolved = resolveLabelName(s);
        const persistentTid =
          s.parentID ??
          s.trackID ??
          s.parent?.clientID ??
          drawn?.data?.parentID ??
          drawn?.data?.trackID ??
          cId;
        list.push({
          uiId: cId,
          trackId: Number(persistentTid),
          serverId: s.serverID || null,
          label: resolved.name,
          color: resolved.color,
          x: Number(p[0].toFixed(2)),
          y: Number(p[1].toFixed(2)),
          z: Number(p[2].toFixed(3)),
          yawDeg: Math.round((p[5] * 180) / Math.PI),
          l: Number(p[6].toFixed(2)),
          w: Number(p[7].toFixed(2)),
          h: Number(p[8].toFixed(2)),
        });
      }

      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_FRAME_TRACKS", {
          detail: { success: true, frame, list },
        })
      );
    } catch (err: any) {
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_FRAME_TRACKS", {
          detail: { success: false, error: err.message || String(err) },
        })
      );
    }
  });

  // 2. Lắng nghe yêu cầu lấy TOÀN BỘ CÁC FRAME của một xe
  window.addEventListener("CVAT_EXT_REQ_GET_TRACK_ALL_FRAMES", async (e: any) => {
    const { jobId, uiId, serverId } = e.detail || {};
    try {
      const job = await getActiveJobInstance(jobId);
      if (!job) throw new Error("Không tìm thấy Job Instance của CVAT");

      updateMainWorldLabels(job);
      const framesMap = new Map<number, any>();
      const parentTrack = await findTrackInJob(job, uiId, serverId);
      const trackLabel = resolveLabelName(parentTrack).name;

      if (parentTrack) {
        const shapes = toArray(parentTrack.shapes || parentTrack.keyframes || (parentTrack as any)._shapes);
        for (const sh of shapes) {
          if (sh && (sh.shapeType === "cuboid" || sh.type === "cuboid" || Array.isArray(sh.points)) && Array.isArray(sh.points) && sh.points.length >= 9) {
            framesMap.set(sh.frame, {
              frame: sh.frame,
              isKeyframe: true,
              outside: !!sh.outside,
              points: [...sh.points],
              label: resolveLabelName(sh).name || trackLabel,
            });
          }
        }
      }

      try {
        const store = getReduxStore();
        const curStates = store?.getState()?.annotation?.annotations?.states || [];
        const curSt = curStates.find(
          (s: any) => Number(s.clientID) === Number(uiId) || (serverId && Number(s.serverID) === Number(serverId))
        );
        const canvas = store?.getState()?.annotation?.canvas?.instance;
        const drawn = canvas?.view?.drawnObjects?.[String(uiId)];
        const livePts = extractLivePointsFromDrawnAndState(drawn, curSt);

        if (livePts && livePts.length >= 9) {
          const curF = store?.getState()?.annotation?.player?.frame?.number ?? (typeof job.frame === "number" ? job.frame : 0);
          const existing = framesMap.get(curF);
          framesMap.set(curF, {
            frame: curF,
            isKeyframe: existing ? existing.isKeyframe : !!curSt?.keyframe,
            outside: !!curSt?.outside,
            points: livePts,
            label: (curSt ? resolveLabelName(curSt).name : null) || trackLabel,
          });
        }
      } catch (_) {}

      const framesList = Array.from(framesMap.values()).sort((a, b) => a.frame - b.frame);
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_GET_TRACK_ALL_FRAMES", {
          detail: { success: true, uiId, serverId, frames: framesList },
        })
      );
    } catch (err: any) {
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_GET_TRACK_ALL_FRAMES", {
          detail: { success: false, error: err.message || String(err) },
        })
      );
    }
  });

  // 3. Lắng nghe yêu cầu lấy TOÀN BỘ CÁC TRACK trong Job kèm danh sách Shapes
  window.addEventListener("CVAT_EXT_REQ_GET_ALL_JOB_TRACKS_WITH_SHAPES", async (e: any) => {
    const { jobId } = e.detail || {};
    try {
      const job = await getActiveJobInstance(jobId);
      if (!job) throw new Error("Không tìm thấy Job Instance của CVAT");

      const rawTracks = getJobTrackCollection(job);
      const trackMap = new Map<number, any>();

      for (const t of rawTracks) {
        if (!t || typeof t.clientID !== "number") continue;
        if (trackMap.has(t.clientID)) continue;

        const shList = toArray(t.shapes || t.keyframes);
        const shapes = shList
          .filter((s: any) => s && s.shapeType === "cuboid" && Array.isArray(s.points) && s.points.length >= 9)
          .map((s: any) => ({
            type: "cuboid",
            frame: s.frame,
            points: [...s.points],
            outside: !!s.outside,
            occluded: !!s.occluded,
            z_order: s.zOrder || 0,
            rotation: 0,
          }));

        const resolved = resolveLabelName(t);
        trackMap.set(t.clientID, {
          id: t.clientID,
          clientID: t.clientID,
          serverID: t.serverID || null,
          labelId: t.label?.id || 1,
          labelName: resolved.name || t.label?.name || "Car",
          labelColor: resolved.color || t.label?.color || "#38bdf8",
          shapes,
        });
      }

      if (trackMap.size === 0) {
        const startF = typeof job.startFrame === "number" ? job.startFrame : 0;
        const stopF = typeof job.stopFrame === "number" ? job.stopFrame : startF + 50;
        const maxScanFrames = Math.min(stopF, startF + 80);

        for (let f = startF; f <= maxScanFrames; f++) {
          try {
            const states = await job.annotations.get(f);
            if (Array.isArray(states)) {
              for (const st of states) {
                if (st.shapeType !== "cuboid" || !Array.isArray(st.points) || st.points.length < 9) continue;
                let t = trackMap.get(st.clientID);
                if (!t) {
                  const resolved = resolveLabelName(st);
                  t = {
                    id: st.clientID,
                    clientID: st.clientID,
                    serverID: st.serverID || null,
                    labelId: st.label?.id || 1,
                    labelName: resolved.name || "Car",
                    labelColor: resolved.color || "#38bdf8",
                    shapes: [],
                  };
                  trackMap.set(st.clientID, t);
                }
                if (st.keyframe && !t.shapes.some((s: any) => s.frame === f)) {
                  t.shapes.push({
                    type: "cuboid",
                    frame: f,
                    points: [...st.points],
                    outside: !!st.outside,
                    occluded: !!st.occluded,
                    z_order: st.zOrder || 0,
                    rotation: 0,
                  });
                }
              }
            }
          } catch (_) {}
        }
      }

      try {
        const store = getReduxStore();
        const canvas = store?.getState()?.annotation?.canvas?.instance;
        const drawnObjects = canvas?.view?.drawnObjects || {};
        const reduxStates = store?.getState()?.annotation?.annotations?.states || [];
        const curF = store?.getState()?.annotation?.player?.frame?.number ?? (typeof job.frame === "number" ? job.frame : 0);

        for (const st of reduxStates) {
          if (!st || st.shapeType !== "cuboid" || typeof st.clientID !== "number") continue;
          const cId = st.clientID;
          const drawn = drawnObjects[String(cId)];
          const livePoints = extractLivePointsFromDrawnAndState(drawn, st);

          if (livePoints) {
            let t = trackMap.get(cId);
            if (!t) {
              const resolved = resolveLabelName(st);
              t = {
                id: cId,
                clientID: cId,
                serverID: st.serverID || null,
                labelId: st.label?.id || 1,
                labelName: resolved.name || "Car",
                labelColor: resolved.color || "#38bdf8",
                shapes: [],
              };
              trackMap.set(cId, t);
            }

            const existingShapeIdx = t.shapes.findIndex((s: any) => s.frame === curF);
            const liveShape = {
              type: "cuboid",
              frame: curF,
              points: livePoints,
              outside: !!st.outside,
              occluded: !!st.occluded,
              z_order: st.zOrder || 0,
              rotation: 0,
            };

            if (existingShapeIdx >= 0) {
              t.shapes[existingShapeIdx] = liveShape;
            } else {
              t.shapes.push(liveShape);
            }
          }
        }
      } catch (_) {}

      const result = Array.from(trackMap.values()).map((t) => {
        t.shapes.sort((a: any, b: any) => a.frame - b.frame);
        return t;
      });

      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_GET_ALL_JOB_TRACKS_WITH_SHAPES", {
          detail: { success: true, tracks: result },
        })
      );
    } catch (err: any) {
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_GET_ALL_JOB_TRACKS_WITH_SHAPES", {
          detail: { success: false, error: err.message || String(err) },
        })
      );
    }
  });

  // 4. Lắng nghe yêu cầu xuất TOÀN BỘ JOB CHUẨN FORMAT DATUMARO 1.0
  window.addEventListener("CVAT_EXT_REQ_EXPORT_JOB_DATUMARO_DATA", async (e: any) => {
    const { jobId } = e.detail || {};
    try {
      const job = await getActiveJobInstance(jobId);
      if (!job) throw new Error("Không tìm thấy Job Instance của CVAT");

      const startFrame = typeof job.startFrame === "number" ? job.startFrame : 0;
      const stopFrame = typeof job.stopFrame === "number" ? job.stopFrame : startFrame;

      const labels: Array<{ name: string; id?: number }> = [];
      const jobLabels = job.labels || job.task?.labels || [];
      if (Array.isArray(jobLabels)) {
        for (const l of jobLabels) {
          if (l && l.name) {
            labels.push({ name: String(l.name), id: l.id });
          }
        }
      }

      const items: any[] = [];
      let annIdCounter = 1;
      const BATCH_SIZE = 25;

      for (let bStart = startFrame; bStart <= stopFrame; bStart += BATCH_SIZE) {
        const bEnd = Math.min(stopFrame, bStart + BATCH_SIZE - 1);
        const batchPromises: Promise<{ f: number; states: any[] }>[] = [];
        for (let f = bStart; f <= bEnd; f++) {
          batchPromises.push(
            Promise.resolve(job.annotations.get(f)).then(
              (states: any[]) => ({ f, states: Array.isArray(states) ? states : [] }),
              () => ({ f, states: [] })
            )
          );
        }
        const batchResults = await Promise.all(batchPromises);
        batchResults.sort((a, b) => a.f - b.f);

        for (const { f, states } of batchResults) {
          const annotations: any[] = [];
          if (Array.isArray(states)) {
            for (const st of states) {
              if (!st || st.shapeType !== "cuboid" || !Array.isArray(st.points) || st.points.length < 9) {
                continue;
              }
              const isOutside =
                st.outside === true ||
                st.attributes?.outside === true ||
                st.attributes?.outside === "true";
              if (isOutside) continue;

              const pos = [Number(st.points[0]), Number(st.points[1]), Number(st.points[2])];
              const rot = [Number(st.points[3]), Number(st.points[4]), Number(st.points[5])];
              const scale = [
                Math.abs(Number(st.points[6])),
                Math.abs(Number(st.points[7])),
                Math.abs(Number(st.points[8])),
              ];

              let labelId = 0;
              const labelName =
                st.label?.name ||
                (typeof st.labelId === "number" ? labels.find((l) => l.id === st.labelId)?.name : null) ||
                "car";
              const existingLabelIdx = labels.findIndex((l) => l.name === labelName);
              if (existingLabelIdx >= 0) {
                labelId = existingLabelIdx;
              } else {
                labelId = labels.length;
                labels.push({ name: labelName });
              }

              const parentTrackId =
                st.parentID ??
                st.trackID ??
                (st.parent && (st.parent.clientID ?? st.parent.id));
              const rawClient =
                typeof parentTrackId === "number"
                  ? parentTrackId
                  : typeof st.clientID === "number"
                  ? st.clientID
                  : 1;
              const datumaroTrackId = Math.max(0, rawClient - 1);

              annotations.push({
                type: "cuboid_3d",
                id: annIdCounter++,
                label_id: labelId,
                position: pos,
                rotation: rot,
                scale: scale,
                attributes: {
                  track_id: datumaroTrackId,
                  outside: false,
                  keyframe: !!st.keyframe,
                  ...(st.attributes || {}),
                },
              });
            }
          }

          items.push({
            id: `frame_${String(f).padStart(6, "0")}`,
            attr: { frame: f },
            annotations,
          });
        }
      }

      const datumaroDataset = {
        dm_format_version: "1.0",
        categories: {
          label: {
            labels: labels.map((l) => ({ name: l.name })),
          },
        },
        items,
      };

      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_EXPORT_JOB_DATUMARO_DATA", {
          detail: {
            success: true,
            dataset: datumaroDataset,
            totalFrames: stopFrame - startFrame + 1,
            jobId,
          },
        })
      );
    } catch (err: any) {
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_EXPORT_JOB_DATUMARO_DATA", {
          detail: {
            success: false,
            error: err?.message || String(err),
            jobId,
          },
        })
      );
    }
  });

  // 5. Cập nhật Realtime Live Box
  window.addEventListener("CVAT_EXT_REQ_UPDATE_LIVE_BOX", async (e: any) => {
    const { jobId, frame, uiId, serverId, points, isFinal } = e.detail || {};
    try {
      const job = await getActiveJobInstance(jobId);
      if (job) {
        const { target } = await findTargetSafely(job, frame, uiId, serverId);
        if (target) {
          target.points = ensureCuboidPoints(points, target.points);
          if (isFinal && typeof target.save === "function") {
            try {
              await target.save();
              markCvatSaveButtonUnsaved(job);
            } catch (_) {}
          }
        }
      }

      updateThreeJsCuboid(
        uiId,
        points[5],
        { x: points[0], y: points[1], z: points[2] },
        { l: points[6], w: points[7], h: points[8] },
        { rx: points[3] || 0, ry: points[4] || 0, rz: points[5] }
      );

      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_UPDATE_LIVE_BOX", {
          detail: { success: true, uiId, frame },
        })
      );
    } catch (err: any) {
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_UPDATE_LIVE_BOX", {
          detail: { success: false, error: err.message || String(err) },
        })
      );
    }
  });

  // 6. Lấy điểm LiDAR từ WebGL RAM
  window.addEventListener("CVAT_EXT_REQ_GET_LIDAR_POINTS", (_e: any) => {
    try {
      const lidar = getSceneLidarPoints();
      if (!lidar || !lidar.array) {
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_RES_GET_LIDAR_POINTS", {
            detail: { success: false, error: "Không tìm thấy buffer điểm LiDAR trong Three.js scene" },
          })
        );
        return;
      }

      const step = Math.max(1, Math.floor(lidar.count / 40000));
      const sampled: number[] = [];
      const arr = lidar.array;
      for (let i = 0; i < lidar.count; i += step) {
        sampled.push(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]);
      }

      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_GET_LIDAR_POINTS", {
          detail: { success: true, points: sampled, totalCount: lidar.count },
        })
      );
    } catch (err: any) {
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_GET_LIDAR_POINTS", {
          detail: { success: false, error: err.message || String(err) },
        })
      );
    }
  });

  // 7. Lấy điểm LiDAR trong ROI
  window.addEventListener("CVAT_EXT_REQ_GET_ROI_LIDAR_POINTS", (e: any) => {
    try {
      const { center, radius = 4.0, maxPoints = 25000 } = e.detail || {};
      const lidar = getSceneLidarPoints();
      if (!lidar || !lidar.array) {
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_RES_GET_ROI_LIDAR_POINTS", {
            detail: { success: false, error: "Không tìm thấy buffer điểm LiDAR trong Three.js scene" },
          })
        );
        return;
      }

      const arr = lidar.array;
      const count = lidar.count;
      const sampled: number[] = [];

      if (Array.isArray(center) && center.length >= 3) {
        const [cx, cy, cz] = center;
        const rSq = radius * radius;
        const maxDz = Math.max(3.0, radius * 0.85);
        for (let i = 0; i < count; i++) {
          const px = arr[i * 3];
          const py = arr[i * 3 + 1];
          const pz = arr[i * 3 + 2];
          const dx = px - cx;
          const dy = py - cy;
          const dz = Math.abs(pz - cz);
          if (dx * dx + dy * dy <= rSq && dz <= maxDz) {
            sampled.push(px, py, pz);
            if (sampled.length >= maxPoints * 3) break;
          }
        }
      } else {
        const step = Math.max(1, Math.floor(count / maxPoints));
        for (let i = 0; i < count; i += step) {
          sampled.push(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]);
        }
      }

      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_GET_ROI_LIDAR_POINTS", {
          detail: { success: true, points: sampled, totalCount: sampled.length / 3 },
        })
      );
    } catch (err: any) {
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_GET_ROI_LIDAR_POINTS", {
          detail: { success: false, error: err.message || String(err) },
        })
      );
    }
  });

  // 8. Chuyển frame trong CVAT native
  window.addEventListener("CVAT_EXT_REQ_JUMP_FRAME", (e: any) => {
    try {
      const { frame } = e.detail || {};
      if (typeof frame !== "number" || isNaN(frame) || frame < 0) return;

      const store = getReduxStore();
      const currentStoreFrame = store?.getState()?.annotation?.player?.frame?.number;
      if (currentStoreFrame === frame) return;

      const frameInput = document.querySelector<HTMLInputElement>(
        ".cvat-player-frame-selector input, input.cvat-player-frame-selector, input[aria-label='Frame selector']"
      );

      if (frameInput) {
        const fiberKey = Object.keys(frameInput).find(
          (k) => k.startsWith("__reactProps$") || k.startsWith("__reactEventHandlers$")
        );
        let handled = false;
        if (fiberKey) {
          const props = (frameInput as any)[fiberKey];
          if (typeof props?.onPressEnter === "function") {
            try {
              props.onPressEnter({
                target: { value: String(frame) },
                currentTarget: { value: String(frame) },
                preventDefault: () => {},
                stopPropagation: () => {},
              });
              handled = true;
            } catch (_) {}
          } else if (typeof props?.onChange === "function") {
            try {
              props.onChange(frame);
              handled = true;
            } catch (_) {}
          }
        }

        if (!handled) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            "value"
          )?.set;
          if (nativeInputValueSetter) {
            nativeInputValueSetter.call(frameInput, String(frame));
          } else {
            frameInput.value = String(frame);
          }
          frameInput.dispatchEvent(new Event("change", { bubbles: true }));
          frameInput.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: "Enter",
              code: "Enter",
              keyCode: 13,
              which: 13,
              bubbles: true,
              cancelable: true,
            })
          );
        }
      }

      if (store) {
        setTimeout(() => {
          try {
            const checkState = store.getState?.();
            if (checkState?.annotation?.player?.frame?.fetching) {
              const curF = checkState?.annotation?.player?.frame?.number ?? frame;
              store.dispatch({
                type: "CHANGE_FRAME_SUCCESS",
                payload: {
                  number: curF,
                  data: checkState?.annotation?.player?.frame?.data || null,
                },
              });
            }
          } catch (_) {}
        }, 1000);
      }
    } catch (e) {
      console.warn("[CVAT 3D Suite] Lỗi Jump Frame:", e);
    }
  });

  // 9. Lưu vào cơ sở dữ liệu CVAT
  window.addEventListener("CVAT_EXT_REQ_COMMIT_SAVE", async (e: any) => {
    const { jobId } = e.detail || {};
    try {
      const job = await getActiveJobInstance(jobId);
      if (!job) throw new Error("Không tìm thấy Job Instance của CVAT");

      await persistJobAnnotations(job);
      (window as any).__CVAT_HAS_UNSAVED_CHANGES__ = false;

      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_COMMIT_SAVE", {
          detail: { success: true, message: "Đã lưu toàn bộ thay đổi vào cơ sở dữ liệu CVAT thành công!" },
        })
      );
    } catch (err: any) {
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_COMMIT_SAVE", {
          detail: { success: false, error: err.message || String(err) },
        })
      );
    }
  });

  // 10. Căn Yaw theo vạch kẻ làn đường 3D
  window.addEventListener("CVAT_EXT_REQ_SNAP_YAW_TO_LANE", async (e: any) => {
    const { jobId, frame, uiId, serverId, currentFrameOnly = true } = e.detail || {};
    try {
      const job = await getActiveJobInstance(jobId);
      const { target, isDrawn } = await findTargetSafely(job, frame, uiId, serverId);

      const p = target.points;
      const curX = p[0];
      const curY = p[1];
      const curZ = p[2];
      const curYaw = p[5];
      const curL = p[6] || 4.6;
      const curW = p[7] || 1.85;
      const curH = p[8] || 1.5;

      const lidar = getSceneLidarPoints();
      if (!lidar || lidar.count === 0) {
        throw new Error("Không tìm thấy điểm LiDAR trong scene");
      }

      const ptsWithIntensity: Array<{ x: number; y: number; z: number; intensity?: number }> = [];
      const groundZ = curZ - curH / 2;
      const cosY = Math.cos(-curYaw);
      const sinY = Math.sin(-curYaw);

      for (let i = 0; i < lidar.count; i++) {
        const z = lidar.array[i * 3 + 2];
        if (Math.abs(z - groundZ) > 0.15) continue;

        const x = lidar.array[i * 3];
        const y = lidar.array[i * 3 + 1];
        const dx = x - curX;
        const dy = y - curY;
        const lx = dx * cosY - dy * sinY;
        const ly = dx * sinY + dy * cosY;

        if (Math.abs(lx) <= 15.0 && Math.abs(ly) <= 6.0) {
          ptsWithIntensity.push({
            x,
            y,
            z,
            intensity: lidar.getIntensityAt(i),
          });
        }
      }

      const res = fitYawToLaneIntensity(
        ptsWithIntensity,
        curX,
        curY,
        curZ,
        curYaw,
        curL,
        curW,
        curH,
        { groundZ }
      );

      if (!res.hasLane) {
        window.dispatchEvent(
          new CustomEvent("CVAT_EXT_RES_SNAP_YAW_TO_LANE", {
            detail: {
              success: false,
              uiId,
              hasLane: false,
              message: res.message || "Không tìm thấy vạch sơn làn đường rõ nét, giữ nguyên góc Yaw",
            },
          })
        );
        return;
      }

      const newYaw = res.newYawRad;
      const newPoints = [...target.points];
      newPoints[5] = newYaw;
      target.points = newPoints;
      if (!isDrawn && typeof target.save === "function") {
        await target.save();
      }

      updateThreeJsCuboid(uiId, newYaw);

      if (currentFrameOnly === false && job) {
        try {
          const parentTrack = await findTrackInJob(job, uiId, serverId, target.parentID);
          if (parentTrack) {
            const shapes = toArray(parentTrack.shapes || parentTrack.keyframes);
            for (const sh of shapes) {
              if (sh.shapeType === "cuboid" && Array.isArray(sh.points) && sh.points.length >= 9) {
                const shPoints = [...sh.points];
                shPoints[5] = newYaw;
                sh.points = shPoints;
              }
            }
            if (typeof parentTrack.save === "function") {
              await parentTrack.save();
            }
          }
        } catch (_) {}
      }

      markCvatSaveButtonUnsaved(job);

      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_SNAP_YAW_TO_LANE", {
          detail: {
            success: true,
            uiId,
            hasLane: true,
            newYawRad: res.newYawRad,
            newYawDeg: res.newYawDeg,
            deltaYawDeg: res.deltaYawDeg,
            confidence: res.confidence,
            message: res.message,
          },
        })
      );
    } catch (err: any) {
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_SNAP_YAW_TO_LANE", {
          detail: { success: false, error: err.message || String(err) },
        })
      );
    }
  });

  // 11. Đảo ngược Yaw hoặc Xoay góc chỉ định
  window.addEventListener("CVAT_EXT_REQ_FLIP_YAW", async (e: any) => {
    const { jobId, frame, uiId, serverId, currentFrameOnly, customYawRad } = e.detail || {};
    try {
      const job = await getActiveJobInstance(jobId);
      const { target, isDrawn } = await findTargetSafely(job, frame, uiId, serverId);

      const oldYaw = target.points[5];
      const newYaw = customYawRad !== undefined ? customYawRad : flipYaw(oldYaw);

      const newPoints = [...target.points];
      newPoints[5] = newYaw;
      target.points = newPoints;
      if (!isDrawn && typeof target.save === "function") {
        await target.save();
      }

      updateThreeJsCuboid(uiId, newYaw);

      if (currentFrameOnly === false && job) {
        try {
          const parentTrack = await findTrackInJob(job, uiId, serverId, target.parentID);
          if (parentTrack) {
            const shapes = toArray(parentTrack.shapes || parentTrack.keyframes);
            for (const sh of shapes) {
              if (sh.shapeType === "cuboid" && Array.isArray(sh.points) && sh.points.length >= 9) {
                const shPoints = [...sh.points];
                shPoints[5] = customYawRad !== undefined ? customYawRad : flipYaw(shPoints[5]);
                sh.points = shPoints;
              }
            }
            if (typeof parentTrack.save === "function") {
              await parentTrack.save();
            }
          }

          const startF = typeof job.startFrame === "number" ? job.startFrame : 0;
          const stopF = typeof job.stopFrame === "number" ? job.stopFrame : (startF + 100);
          for (let f = startF; f <= stopF; f++) {
            if (f === frame) continue;
            try {
              const states = await job.annotations.get(f);
              if (Array.isArray(states)) {
                const st = states.find(
                  (s: any) => s.clientID === uiId || (serverId && s.serverID === serverId)
                );
                if (st && Array.isArray(st.points) && st.points.length >= 9) {
                  const p = [...st.points];
                  p[5] = customYawRad !== undefined ? customYawRad : flipYaw(p[5]);
                  st.points = p;
                  if (typeof st.save === "function") {
                    await st.save();
                  }
                }
              }
            } catch (_) {}
          }
        } catch (_) {}
      }

      markCvatSaveButtonUnsaved(job);
      const newYawDeg = Math.round((newYaw * 180) / Math.PI);

      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_FLIP_YAW", {
          detail: { success: true, uiId, newYawDeg },
        })
      );
    } catch (err: any) {
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_FLIP_YAW", {
          detail: { success: false, error: err.message || String(err) },
        })
      );
    }
  });

  // 12. Cập nhật kích thước (L, W, H)
  window.addEventListener("CVAT_EXT_REQ_UPDATE_DIMENSIONS", async (e: any) => {
    const { jobId, frame, uiId, serverId, l, w, h, applyToTrack } = e.detail || {};
    try {
      const job = await getActiveJobInstance(jobId);
      const { target, isDrawn } = await findTargetSafely(job, frame, uiId, serverId);

      const newPoints = [...target.points];
      const offset = computeGroundLockOffset(newPoints, h);
      newPoints[0] = Number((newPoints[0] + offset.dx).toFixed(3));
      newPoints[1] = Number((newPoints[1] + offset.dy).toFixed(3));
      newPoints[2] = Number((newPoints[2] + offset.dz).toFixed(3));
      newPoints[6] = l;
      newPoints[7] = w;
      newPoints[8] = h;
      target.points = newPoints;
      if (!isDrawn && typeof target.save === "function") {
        await target.save();
      }

      updateThreeJsCuboid(
        uiId,
        undefined,
        { x: newPoints[0], y: newPoints[1], z: newPoints[2] },
        { l, w, h }
      );

      let trackCount = 1;
      const startF = typeof job.startFrame === "number" ? job.startFrame : 0;
      const stopF = typeof job.stopFrame === "number" ? job.stopFrame : (startF + 100);

      if (applyToTrack === true && job) {
        try {
          const parentTrack = await findTrackInJob(job, uiId, serverId, target.parentID);
          if (parentTrack) {
            const shapes = toArray(parentTrack.shapes || parentTrack.keyframes);
            for (const sh of shapes) {
              if (sh.shapeType === "cuboid" && Array.isArray(sh.points) && sh.points.length >= 9) {
                const shPoints = [...sh.points];
                const shOffset = computeGroundLockOffset(shPoints, h);
                shPoints[0] = Number((shPoints[0] + shOffset.dx).toFixed(3));
                shPoints[1] = Number((shPoints[1] + shOffset.dy).toFixed(3));
                shPoints[2] = Number((shPoints[2] + shOffset.dz).toFixed(3));
                shPoints[6] = l;
                shPoints[7] = w;
                shPoints[8] = h;
                sh.points = shPoints;
                if (sh.frame !== frame) {
                  trackCount++;
                }
              }
            }
            if (typeof parentTrack.save === "function") {
              await parentTrack.save();
            }
          }

          for (let f = startF; f <= stopF; f++) {
            if (f === frame) continue;
            try {
              const states = await job.annotations.get(f);
              if (Array.isArray(states)) {
                const st = states.find(
                  (s: any) => s.clientID === uiId || (serverId && s.serverID === serverId)
                );
                if (st && Array.isArray(st.points) && st.points.length >= 9) {
                  const p = [...st.points];
                  const stOffset = computeGroundLockOffset(p, h);
                  p[0] = Number((p[0] + stOffset.dx).toFixed(3));
                  p[1] = Number((p[1] + stOffset.dy).toFixed(3));
                  p[2] = Number((p[2] + stOffset.dz).toFixed(3));
                  p[6] = l;
                  p[7] = w;
                  p[8] = h;
                  st.points = p;
                  if (typeof st.save === "function") {
                    await st.save();
                  }
                  trackCount++;
                }
              }
            } catch (_) {}
          }
        } catch (_) {}
      }

      markCvatSaveButtonUnsaved(job);
      const newZ = newPoints[2];

      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_UPDATE_DIMENSIONS", {
          detail: { success: true, uiId, newZ, l, w, h, applyToTrack },
        })
      );
    } catch (err: any) {
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_UPDATE_DIMENSIONS", {
          detail: { success: false, error: err.message || String(err) },
        })
      );
    }
  });

  window.addEventListener("CVAT_EXT_REQ_LOCK_DIMENSIONS", async (e: any) => {
    const detail = { ...(e.detail || {}), applyToTrack: false };
    window.dispatchEvent(new CustomEvent("CVAT_EXT_REQ_UPDATE_DIMENSIONS", { detail }));
  });

  // 13. Ghim mặt đất và địa hình vỉa hè
  window.addEventListener("CVAT_EXT_REQ_SNAP_GROUND", async (e: any) => {
    const { jobId, frame, uiId, serverId, mode, deltaCm, deltaDeg, curbHeight, applyToTrack, category } = e.detail || {};
    try {
      const job = await getActiveJobInstance(jobId);
      const { target, isDrawn } = await findTargetSafely(job, frame, uiId, serverId);

      const newPoints = [...target.points];
      const curX = newPoints[0];
      const curY = newPoints[1];
      const curZ = newPoints[2];
      const curRx = newPoints[3] || 0;
      const curRy = newPoints[4] || 0;
      const curRz = newPoints[5] || 0;
      const curL = newPoints[6] || 4.6;
      const curW = newPoints[7] || 1.85;
      const curH = newPoints[8] || 1.45;

      let newZ = curZ;
      let newRotX = curRx;
      let newRotY = curRy;
      let msg = "";

      if (mode === "road") {
        if (category === "pedestrian") {
          const groundInfo = detectAccurateGroundZ(curX, curY, curZ, curRz, curL / 2, curW / 2, curH / 2, false, true);
          const baseGroundZ = groundInfo.groundZ !== null ? groundInfo.groundZ : curZ - curH / 2;
          newRotX = 0;
          newRotY = 0;
          newZ = Number((baseGroundZ + curH / 2).toFixed(3));
          msg = `Đã ghim Người #${uiId} bám sàn: Z=${newZ}m (Khóa thẳng Roll=0°, Pitch=0°)`;
        } else if (category === "cyclist") {
          const groundInfo = detectAccurateGroundZ(curX, curY, curZ, curRz, curL / 2, curW / 2, curH / 2, false, true);
          const baseGroundZ = groundInfo.groundZ !== null ? groundInfo.groundZ : curZ - curH / 2;
          newRotX = 0;
          newRotY = groundInfo.pitchRad;
          newZ = Number((baseGroundZ + (curH / 2) * Math.cos(groundInfo.pitchRad)).toFixed(3));
          msg = `Đã ghim Xe 2 bánh #${uiId} bám mặt đường: Z=${newZ}m (Pitch=${groundInfo.pitchDeg}°, Khóa Roll=0°)`;
        } else {
          const groundInfo = detectAccurateGroundZ(curX, curY, curZ, curRz, curL / 2, curW / 2, curH / 2, false, false);
          if (groundInfo.groundZ !== null) {
            const cosPitch = Math.cos(groundInfo.pitchRad);
            const cosRoll = Math.cos(groundInfo.rollRad);
            newRotY = groundInfo.pitchRad;
            if (groundInfo.isCurbGround) {
              newRotX = 0;
              newZ = Number((groundInfo.groundZ + (curH / 2) * cosPitch).toFixed(3));
            } else {
              newRotX = groundInfo.rollRad;
              newZ = Number((groundInfo.groundZ + (curH / 2) * cosPitch * cosRoll).toFixed(3));
            }
            msg = `Đã ghim đáy xe #${uiId} bám mặt đường: Z=${newZ}m (Roll: ${groundInfo.rollDeg}°, Pitch: ${groundInfo.pitchDeg}°)`;
          }
        }
      } else if (mode === "curb") {
        const autoCurb = detectCurbStepAndRollInMainWorld(curX, curY, curZ, curRz, curL / 2, curW / 2, curW);
        const offset = curbHeight !== undefined ? curbHeight : (autoCurb.hasCurb ? autoCurb.curbHeight : 0.15);
        newZ = Number((curZ + offset).toFixed(3));
        msg = `Đã nâng xe #${uiId} lên vỉa hè: Z=${newZ}m`;
      } else if (mode === "half_curb") {
        const autoCurb = detectCurbStepAndRollInMainWorld(curX, curY, curZ, curRz, curL / 2, curW / 2, curW);
        if (autoCurb.hasCurb && autoCurb.side !== "none") {
          newRotX = autoCurb.rollRad;
          newZ = Number((curZ + autoCurb.deltaCenterZ).toFixed(3));
          msg = `Đã nhận diện gác lề: Nghiêng Roll ${autoCurb.rollDeg}°, Z=${newZ}m`;
        } else {
          const cH = curbHeight !== undefined ? curbHeight : 0.15;
          const ratio = Math.max(-1, Math.min(1, cH / curW));
          newRotX = Number(Math.asin(ratio).toFixed(5));
          newZ = Number((curZ + cH / 2).toFixed(3));
          msg = `Đã gác lề xe #${uiId}: Z=${newZ}m`;
        }
      } else if (mode === "micro_adjust") {
        const dCm = deltaCm !== undefined ? deltaCm : 1;
        newZ = Number((curZ + dCm / 100).toFixed(3));
        msg = `Vi chỉnh cao độ: Z=${newZ}m`;
      } else if (mode === "micro_adjust_pitch") {
        const dDeg = deltaDeg !== undefined ? deltaDeg : 0.5;
        const dRad = (dDeg * Math.PI) / 180;
        newRotY = Number((curRy + dRad).toFixed(5));
      } else if (mode === "micro_adjust_roll") {
        const dDeg = deltaDeg !== undefined ? deltaDeg : 0.5;
        const dRad = (dDeg * Math.PI) / 180;
        newRotX = Number((curRx + dRad).toFixed(5));
      } else if (mode === "reset_slope") {
        newRotX = 0;
        newRotY = 0;
        msg = `Reset góc dốc về 0°`;
      }

      newPoints[2] = newZ;
      newPoints[3] = newRotX;
      newPoints[4] = newRotY;
      target.points = newPoints;
      if (!isDrawn && typeof target.save === "function") {
        await target.save();
      }

      if (applyToTrack) {
        try {
          const deltaZ = newZ - curZ;
          const parentTrack = await findTrackInJob(job, uiId, serverId, target.parentID);
          if (parentTrack) {
            const shapesList = toArray(parentTrack.shapes || parentTrack.keyframes || (parentTrack as any)._shapes);
            for (const sh of shapesList) {
              if (sh.shapeType === "cuboid" && Array.isArray(sh.points) && sh.points.length >= 9) {
                const pts = [...sh.points];
                pts[2] = Number((pts[2] + deltaZ).toFixed(3));
                pts[3] = newRotX;
                pts[4] = newRotY;
                sh.points = pts;
                if (typeof sh.save === "function") {
                  await sh.save();
                }
              }
            }
          }
        } catch (_) {}
      }

      updateThreeJsCuboid(
        uiId,
        undefined,
        { x: curX, y: curY, z: newZ },
        undefined,
        { rx: newRotX, ry: newRotY, rz: curRz }
      );

      markCvatSaveButtonUnsaved(job);

      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_SNAP_GROUND", {
          detail: { success: true, uiId, newZ, mode, applyToTrack, message: msg },
        })
      );
    } catch (err: any) {
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_SNAP_GROUND", {
          detail: { success: false, error: err.message || String(err) },
        })
      );
    }
  });

  // 14. Auto-Fit Box tự động từ LiDAR
  window.addEventListener("CVAT_EXT_REQ_AUTO_FIT", async (e: any) => {
    const { jobId, frame, uiId, serverId, tightFit, fitMode, applyToTrack } = e.detail || {};
    try {
      const job = await getActiveJobInstance(jobId);
      const { target, isDrawn } = await findTargetSafely(job, frame, uiId, serverId);

      const resolvedMode = fitMode || (tightFit ? "tight" : "catalog");
      const fit = computeLidarGroundAndFit(target.points, resolvedMode);
      if (fit.pointsCount === 0) {
        throw new Error(`Không tìm thấy điểm LiDAR nào trong vùng xe #${uiId}`);
      }

      const newPoints = [...target.points];
      newPoints[0] = fit.newX;
      newPoints[1] = fit.newY;
      newPoints[2] = fit.newZ;
      newPoints[3] = 0;
      if (fit.newYaw !== undefined) newPoints[5] = fit.newYaw;
      newPoints[6] = fit.newL;
      newPoints[7] = fit.newW;
      newPoints[8] = fit.newH;

      target.points = newPoints;
      if (!isDrawn && typeof target.save === "function") {
        await target.save();
      }

      updateThreeJsCuboid(
        uiId,
        fit.newYaw,
        { x: fit.newX, y: fit.newY, z: fit.newZ },
        { l: fit.newL, w: fit.newW, h: fit.newH }
      );

      markCvatSaveButtonUnsaved(job);

      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_AUTO_FIT", {
          detail: {
            success: true,
            uiId,
            newX: fit.newX,
            newY: fit.newY,
            newZ: fit.newZ,
            newYaw: fit.newYaw,
            newL: fit.newL,
            newW: fit.newW,
            newH: fit.newH,
            pointsCount: fit.pointsCount,
            applyToTrack,
          },
        })
      );
    } catch (err: any) {
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_AUTO_FIT", {
          detail: { success: false, error: err.message || String(err) },
        })
      );
    }
  });

  // 15. Fit Box theo góc đón tia Ego
  window.addEventListener("CVAT_EXT_REQ_EGO_RAY_FIT", async (e: any) => {
    const { jobId, frame, uiId, serverId, egoPos, preserveDimensions, applyToTrack, fitStep } = e.detail || {};
    try {
      const job = await getActiveJobInstance(jobId);
      const { target, isDrawn } = await findTargetSafely(job, frame, uiId, serverId);

      const fit = fitBoxToEgoRayAndGroundInMainWorld(
        target.points,
        egoPos || { x: 0, y: 0, z: 0 },
        { preserveDimensions, fitStep }
      );

      if (fit.pointsCount === 0) {
        throw new Error(`Không tìm thấy điểm LiDAR nào trong vùng xe #${uiId}`);
      }

      const newYaw = fit.newYawRad !== undefined ? fit.newYawRad : target.points[5];
      const newPoints = [...target.points];
      newPoints[0] = fit.newX;
      newPoints[1] = fit.newY;
      newPoints[2] = fit.newZ;
      newPoints[3] = fit.rollRad;
      newPoints[4] = fit.pitchRad;
      newPoints[5] = newYaw;
      newPoints[6] = fit.newL;
      newPoints[7] = fit.newW;
      newPoints[8] = fit.newH;

      target.points = newPoints;
      if (!isDrawn && typeof target.save === "function") {
        await target.save();
      }

      updateThreeJsCuboid(
        uiId,
        newYaw,
        { x: fit.newX, y: fit.newY, z: fit.newZ },
        { l: fit.newL, w: fit.newW, h: fit.newH },
        { rx: fit.rollRad, ry: fit.pitchRad, rz: newYaw }
      );

      markCvatSaveButtonUnsaved(job);

      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_EGO_RAY_FIT", {
          detail: {
            success: true,
            uiId,
            newX: fit.newX,
            newY: fit.newY,
            newZ: fit.newZ,
            newYawRad: newYaw,
            newYawDeg: fit.newYawDeg,
            deltaYawDeg: fit.deltaYawDeg,
            newL: fit.newL,
            newW: fit.newW,
            newH: fit.newH,
            pitchDeg: fit.pitchDeg,
            rollDeg: fit.rollDeg,
            pointsCount: fit.pointsCount,
            message: fit.message,
          },
        })
      );
    } catch (err: any) {
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_EGO_RAY_FIT", {
          detail: { success: false, error: err.message || String(err) },
        })
      );
    }
  });

  // 16. Fit chuyên biệt cho Người Đi Bộ
  window.addEventListener("CVAT_EXT_REQ_FIT_PEDESTRIAN", async (e: any) => {
    const { jobId, frame, uiId, serverId, headBuffer, egoPos, step, applyToTrack } = e.detail || {};
    try {
      const job = await getActiveJobInstance(jobId);
      const { target, isDrawn } = await findTargetSafely(job, frame, uiId, serverId);

      const fit = fitPedestrianInMainWorld(target.points, { headBuffer, egoPos, step });
      if (fit.pointsCount === 0) {
        throw new Error(`Không tìm thấy điểm LiDAR nào thuộc người #${uiId}`);
      }

      const newPoints = [...target.points];
      newPoints[0] = fit.newX;
      newPoints[1] = fit.newY;
      newPoints[2] = fit.newZ;
      newPoints[3] = 0;
      newPoints[4] = 0;
      if (fit.newYaw !== undefined) newPoints[5] = fit.newYaw;
      newPoints[6] = fit.newL;
      newPoints[7] = fit.newW;
      newPoints[8] = fit.newH;

      target.points = newPoints;
      if (!isDrawn && typeof target.save === "function") {
        await target.save();
      }

      updateThreeJsCuboid(
        uiId,
        newPoints[5],
        { x: fit.newX, y: fit.newY, z: fit.newZ },
        { l: fit.newL, w: fit.newW, h: fit.newH },
        { rx: 0, ry: 0, rz: newPoints[5] }
      );

      markCvatSaveButtonUnsaved(job);

      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_FIT_PEDESTRIAN", {
          detail: {
            success: true,
            uiId,
            newX: fit.newX,
            newY: fit.newY,
            newZ: fit.newZ,
            newYaw: fit.newYaw,
            newL: fit.newL,
            newW: fit.newW,
            newH: fit.newH,
            pointsCount: fit.pointsCount,
            step: fit.step,
            applyToTrack: !!applyToTrack,
            message: fit.message,
          },
        })
      );
    } catch (err: any) {
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_FIT_PEDESTRIAN", {
          detail: { success: false, error: err.message || String(err) },
        })
      );
    }
  });

  // 17. Fit chuyên biệt cho Xe 2 Bánh
  window.addEventListener("CVAT_EXT_REQ_FIT_CYCLIST", async (e: any) => {
    const { jobId, frame, uiId, serverId, headBuffer, egoPos, step, applyToTrack } = e.detail || {};
    try {
      const job = await getActiveJobInstance(jobId);
      const { target, isDrawn } = await findTargetSafely(job, frame, uiId, serverId);

      const fit = fitCyclistInMainWorld(target.points, { headBuffer, egoPos, step });
      if (fit.pointsCount === 0) {
        throw new Error(`Không tìm thấy điểm LiDAR nào thuộc xe 2 bánh #${uiId}`);
      }

      const newPoints = [...target.points];
      newPoints[0] = fit.newX;
      newPoints[1] = fit.newY;
      newPoints[2] = fit.newZ;
      newPoints[3] = 0;
      newPoints[4] = 0;
      if (fit.newYaw !== undefined) newPoints[5] = fit.newYaw;
      newPoints[6] = fit.newL;
      newPoints[7] = fit.newW;
      newPoints[8] = fit.newH;

      target.points = newPoints;
      if (!isDrawn && typeof target.save === "function") {
        await target.save();
      }

      updateThreeJsCuboid(
        uiId,
        newPoints[5],
        { x: fit.newX, y: fit.newY, z: fit.newZ },
        { l: fit.newL, w: fit.newW, h: fit.newH },
        { rx: 0, ry: 0, rz: newPoints[5] }
      );

      markCvatSaveButtonUnsaved(job);

      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_FIT_CYCLIST", {
          detail: {
            success: true,
            uiId,
            newX: fit.newX,
            newY: fit.newY,
            newZ: fit.newZ,
            newYaw: fit.newYaw,
            newL: fit.newL,
            newW: fit.newW,
            newH: fit.newH,
            pointsCount: fit.pointsCount,
            step: fit.step,
            applyToTrack: !!applyToTrack,
            message: fit.message,
          },
        })
      );
    } catch (err: any) {
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_FIT_CYCLIST", {
          detail: { success: false, error: err.message || String(err) },
        })
      );
    }
  });

  // 18. Fit Box Hiện Tại với padding 5cm
  window.addEventListener("CVAT_EXT_REQ_FIT_CURRENT_BOX", async (e: any) => {
    const { jobId, frame, uiId, serverId, applyToTrack = false, attributes } = e.detail || {};
    try {
      const job = await getActiveJobInstance(jobId);
      const { target, isDrawn } = await findTargetSafely(job, frame, uiId, serverId);

      const fit = fitBoxWithPadding5cm(target.points, attributes);
      const newPoints = [...target.points];
      newPoints[2] = fit.newZ;
      newPoints[6] = fit.newL;
      newPoints[7] = fit.newW;
      newPoints[8] = fit.newH;
      target.points = newPoints;

      if (!isDrawn && typeof target.save === "function") {
        await target.save();
      }

      updateThreeJsCuboid(
        uiId,
        newPoints[5],
        { x: newPoints[0], y: newPoints[1], z: fit.newZ },
        { l: fit.newL, w: fit.newW, h: fit.newH },
        { rx: newPoints[3] || 0, ry: newPoints[4] || 0, rz: newPoints[5] }
      );

      markCvatSaveButtonUnsaved(job);

      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_FIT_CURRENT_BOX", {
          detail: {
            success: true,
            uiId,
            newL: fit.newL,
            newW: fit.newW,
            newH: fit.newH,
            newZ: fit.newZ,
            pointsCount: fit.pointsCount,
            applyToTrack,
          },
        })
      );
    } catch (err: any) {
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_FIT_CURRENT_BOX", {
          detail: { success: false, error: err.message || String(err) },
        })
      );
    }
  });

  // 19. Đánh dấu Outside / Inside
  window.addEventListener("CVAT_EXT_REQ_SET_TRACK_OUTSIDE", async (e: any) => {
    const { jobId, frame, uiId, serverId, outside = true } = e.detail || {};
    try {
      const job = await getActiveJobInstance(jobId);
      if (!job) throw new Error("Không tìm thấy Job Instance của CVAT");

      const currentFrame = typeof frame === "number" ? frame : (typeof job.frame === "number" ? job.frame : 0);
      let currentTarget: any = null;
      try {
        const res = await findTargetSafely(job, currentFrame, uiId, serverId);
        currentTarget = res.target;
      } catch (_) {}

      const parentID = currentTarget?.parentID || currentTarget?.trackID || (currentTarget?.parent && currentTarget.parent.clientID);
      const parentTrack = await findTrackInJob(job, uiId, serverId, parentID);

      const previousStates: Array<{ frame: number; outside: boolean; points: number[] }> = [];
      let countModified = 0;

      if (parentTrack) {
        const shapesList = toArray(parentTrack.shapes || parentTrack.keyframes || (parentTrack as any)._shapes);
        for (const sh of shapesList) {
          previousStates.push({
            frame: sh.frame,
            outside: !!sh.outside,
            points: Array.isArray(sh.points) ? [...sh.points] : [],
          });
          sh.outside = !!outside;
          countModified++;
        }
        if (typeof parentTrack.save === "function") {
          try {
            await parentTrack.save();
          } catch (_) {}
        }
      }

      if (currentTarget) {
        currentTarget.outside = !!outside;
        if (typeof currentTarget.save === "function") {
          try {
            await currentTarget.save();
          } catch (_) {}
        }
      }

      const store = getReduxStore();
      const canvas = store?.getState()?.annotation?.canvas?.instance;
      if (canvas?.view?.drawnObjects) {
        const drawnItem = canvas.view.drawnObjects[String(uiId)];
        if (drawnItem) {
          if (drawnItem.data) drawnItem.data.outside = !!outside;
          if (drawnItem.cuboid) {
            const isVis = !outside;
            if (drawnItem.cuboid.perspective) drawnItem.cuboid.perspective.visible = isVis;
            if (drawnItem.cuboid.top) drawnItem.cuboid.top.visible = isVis;
            if (drawnItem.cuboid.side) drawnItem.cuboid.side.visible = isVis;
            if (drawnItem.cuboid.front) drawnItem.cuboid.front.visible = isVis;
            if (typeof drawnItem.cuboid.visible === "boolean") drawnItem.cuboid.visible = isVis;
          }
        }
      }

      markCvatSaveButtonUnsaved(job);
      if (canvas && typeof canvas.render === "function") {
        canvas.render();
      }

      window.dispatchEvent(new CustomEvent("CVAT_EXT_RES_FRAME_TRACKS_DIRTY"));
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_SET_TRACK_OUTSIDE", {
          detail: {
            success: true,
            uiId,
            outside,
            count: countModified,
            previousStates,
          },
        })
      );
    } catch (err: any) {
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_SET_TRACK_OUTSIDE", {
          detail: { success: false, error: err.message || String(err) },
        })
      );
    }
  });

  // 20. Khôi phục trạng thái (Undo / Pre)
  window.addEventListener("CVAT_EXT_REQ_RESTORE_BOX", async (e: any) => {
    const { jobId, frame, uiId, serverId, applyToTrack, boxPoints, trackShapesBackup } = e.detail || {};
    try {
      const job = await getActiveJobInstance(jobId);
      if (!job) throw new Error("Không tìm thấy Job Instance của CVAT");

      const currentFrame = typeof frame === "number" ? frame : (typeof job.frame === "number" ? job.frame : 0);
      let currentTarget: any = null;
      try {
        const res = await findTargetSafely(job, currentFrame, uiId, serverId);
        currentTarget = res.target;
      } catch (_) {}

      const parentID = currentTarget?.parentID || currentTarget?.trackID || (currentTarget?.parent && currentTarget.parent.clientID);
      const parentTrack = await findTrackInJob(job, uiId, serverId, parentID);

      if (applyToTrack && Array.isArray(trackShapesBackup) && trackShapesBackup.length > 0) {
        if (parentTrack) {
          const shapesList = toArray(parentTrack.shapes || parentTrack.keyframes || (parentTrack as any)._shapes);
          for (const bk of trackShapesBackup) {
            const sh = shapesList.find((s: any) => s.frame === bk.frame);
            if (sh) {
              if (bk.outside !== undefined) sh.outside = bk.outside;
              if (Array.isArray(bk.points)) sh.points = ensureCuboidPoints(bk.points, sh.points);
            }
          }
          if (typeof parentTrack.save === "function") {
            try {
              await parentTrack.save();
            } catch (_) {}
          }
        }
      }

      if (Array.isArray(boxPoints) && boxPoints.length >= 9) {
        try {
          const { target, isDrawn } = await findTargetSafely(job, currentFrame, uiId, serverId);
          target.points = ensureCuboidPoints(boxPoints, target.points);
          if (!isDrawn && typeof target.save === "function") {
            try {
              await target.save();
            } catch (_) {}
          }

          updateThreeJsCuboid(
            uiId,
            boxPoints[5],
            { x: boxPoints[0], y: boxPoints[1], z: boxPoints[2] },
            { l: boxPoints[6], w: boxPoints[7], h: boxPoints[8] },
            { rx: boxPoints[3] || 0, ry: boxPoints[4] || 0, rz: boxPoints[5] }
          );
        } catch (_) {}
      }

      markCvatSaveButtonUnsaved(job);
      const store = getReduxStore();
      const canvas = store?.getState()?.annotation?.canvas?.instance;
      if (canvas && typeof canvas.render === "function") {
        canvas.render();
      }

      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_RESTORE_BOX", {
          detail: { success: true, uiId },
        })
      );
    } catch (err: any) {
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_RESTORE_BOX", {
          detail: { success: false, error: err.message || String(err) },
        })
      );
    }
  });

  // 21. Vi chỉnh Center (Shift Center)
  window.addEventListener("CVAT_EXT_REQ_SHIFT_CENTER", async (e: any) => {
    const { jobId, frame, uiId, serverId, deltaXLocal = 0, deltaYLocal = 0, deltaZ = 0, applyToTrack = false, isWorld = false } = e.detail || {};
    try {
      const job = await getActiveJobInstance(jobId);
      const { target, isDrawn } = await findTargetSafely(job, frame, uiId, serverId);

      const yaw = target.points[5] || 0;
      const cosYaw = Math.cos(yaw);
      const sinYaw = Math.sin(yaw);

      let deltaXWorld = deltaXLocal;
      let deltaYWorld = deltaYLocal;
      if (!isWorld) {
        deltaXWorld = deltaXLocal * cosYaw - deltaYLocal * sinYaw;
        deltaYWorld = deltaXLocal * sinYaw + deltaYLocal * cosYaw;
      }

      let framesShifted = 1;

      if (applyToTrack) {
        const parentTrack = await findTrackInJob(job, uiId, serverId, target.parentID);
        if (parentTrack && Array.isArray(parentTrack.shapes)) {
          for (const sh of parentTrack.shapes) {
            if (sh.shapeType === "cuboid" && Array.isArray(sh.points) && sh.points.length >= 9) {
              const pts = [...sh.points];
              pts[0] = Number((pts[0] + deltaXWorld).toFixed(3));
              pts[1] = Number((pts[1] + deltaYWorld).toFixed(3));
              if (deltaZ !== 0) pts[2] = Number((pts[2] + deltaZ).toFixed(3));
              sh.points = pts;
              framesShifted++;
            }
          }
          await parentTrack.save();
        }
      }

      const currentPts = [...target.points];
      currentPts[0] = Number((currentPts[0] + deltaXWorld).toFixed(3));
      currentPts[1] = Number((currentPts[1] + deltaYWorld).toFixed(3));
      if (deltaZ !== 0) currentPts[2] = Number((currentPts[2] + deltaZ).toFixed(3));
      target.points = currentPts;
      if (!isDrawn && typeof target.save === "function") {
        await target.save();
      }

      updateThreeJsCuboid(
        uiId,
        yaw,
        { x: currentPts[0], y: currentPts[1], z: currentPts[2] },
        { l: currentPts[6], w: currentPts[7], h: currentPts[8] },
        { rx: currentPts[3] || 0, ry: currentPts[4] || 0, rz: yaw }
      );

      markCvatSaveButtonUnsaved(job);

      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_SHIFT_CENTER", {
          detail: {
            success: true,
            uiId,
            newX: currentPts[0],
            newY: currentPts[1],
            newZ: currentPts[2],
            framesShifted,
          },
        })
      );
    } catch (err: any) {
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_SHIFT_CENTER", {
          detail: { success: false, error: err.message || String(err) },
        })
      );
    }
  });

  // 22. Fit riêng từng chiều (Fit Dimension: W hoặc H)
  window.addEventListener("CVAT_EXT_REQ_FIT_DIMENSION", async (e: any) => {
    const { jobId, frame, uiId, serverId, dimension = "w", applyToTrack = false } = e.detail || {};
    try {
      const job = await getActiveJobInstance(jobId);
      const { target, isDrawn } = await findTargetSafely(job, frame, uiId, serverId);

      const cx = target.points[0];
      const cy = target.points[1];
      const cz = target.points[2];
      const rx = target.points[3] || 0;
      const ry = target.points[4] || 0;
      const yaw = target.points[5] || 0;
      const curL = target.points[6] || 4.65;
      const curW = target.points[7] || 1.85;
      const curH = target.points[8] || 1.45;

      const groundInfo = detectAccurateGroundZ(cx, cy, cz, yaw, curL / 2, curW / 2, curH / 2, false, false);
      const groundZ = groundInfo.groundZ !== null ? groundInfo.groundZ : cz - curH / 2;

      let newL = curL;
      let newW = curW;
      let newH = curH;
      let newZ = cz;

      if (dimension === "w") {
        newW = Number((curW * 0.95).toFixed(2));
      } else {
        newH = Number((curH * 1.05).toFixed(2));
        newZ = Number((groundZ + newH / 2).toFixed(3));
      }

      const currentPts = [...target.points];
      currentPts[2] = newZ;
      currentPts[6] = newL;
      currentPts[7] = newW;
      currentPts[8] = newH;
      target.points = currentPts;

      if (!isDrawn && typeof target.save === "function") {
        await target.save();
      }

      updateThreeJsCuboid(
        uiId,
        yaw,
        { x: currentPts[0], y: currentPts[1], z: newZ },
        { l: newL, w: newW, h: newH },
        { rx, ry, rz: yaw }
      );

      markCvatSaveButtonUnsaved(job);

      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_FIT_DIMENSION", {
          detail: {
            success: true,
            uiId,
            dimension,
            newL,
            newW,
            newH,
            newZ,
            applyToTrack,
          },
        })
      );
    } catch (err: any) {
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_FIT_DIMENSION", {
          detail: { success: false, error: err.message || String(err) },
        })
      );
    }
  });

  // 23. Cấu hình màu mây điểm LiDAR
  window.addEventListener("CVAT_EXT_REQ_SET_POINT_COLOR_MODE", (e: any) => {
    const { mode, colorizeBoxed } = e.detail || {};
    if (mode === "intensity" || mode === "plain") {
      setCurrentPointColorMode(mode);
    }
    if (colorizeBoxed !== undefined) {
      setCurrentColorizeBoxed(!!colorizeBoxed);
    }

    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem("cvat_3d_point_color_mode", currentPointColorMode);
        localStorage.setItem("cvat_3d_colorize_boxed", String(currentColorizeBoxed));
      } catch (_) {}
    }

    applyPointCloudColorizationInMainWorld({
      mode: currentPointColorMode,
      colorizeBoxed: currentColorizeBoxed,
    });

    window.dispatchEvent(
      new CustomEvent("CVAT_EXT_RES_SET_POINT_COLOR_MODE", {
        detail: {
          success: true,
          mode: currentPointColorMode,
          colorizeBoxed: currentColorizeBoxed,
        },
      })
    );
  });

  window.addEventListener("CVAT_EXT_REQ_GET_POINT_COLOR_MODE", () => {
    window.dispatchEvent(
      new CustomEvent("CVAT_EXT_RES_GET_POINT_COLOR_MODE", {
        detail: {
          mode: currentPointColorMode,
          colorizeBoxed: currentColorizeBoxed,
        },
      })
    );
  });

  // 24. Cấu hình Canvas Theme
  window.addEventListener("CVAT_EXT_REQ_SET_CANVAS_THEME", (e: any) => {
    const { theme } = e.detail || {};
    if (theme === "light" || theme === "dark") {
      setCurrentCanvasTheme(theme);
    }
    applyCanvasThemeInMainWorld(currentCanvasTheme);
    applyPointCloudColorizationInMainWorld({
      mode: currentPointColorMode,
      colorizeBoxed: currentColorizeBoxed,
    });

    window.dispatchEvent(
      new CustomEvent("CVAT_EXT_RES_SET_CANVAS_THEME", {
        detail: { success: true, theme: currentCanvasTheme },
      })
    );
  });

  window.addEventListener("CVAT_EXT_REQ_GET_CANVAS_THEME", () => {
    window.dispatchEvent(
      new CustomEvent("CVAT_EXT_RES_GET_CANVAS_THEME", {
        detail: { theme: currentCanvasTheme },
      })
    );
  });

  // 25. Cấu hình kích thước điểm mây Ortho 2D
  window.addEventListener("CVAT_EXT_REQ_SET_ORTHO_POINT_SIZE", (e: any) => {
    const { size } = e.detail || {};
    if (typeof size === "number" && size >= 1.0 && size <= 10.0) {
      applyOrthoPointSize(size);
    }
    window.dispatchEvent(
      new CustomEvent("CVAT_EXT_RES_SET_ORTHO_POINT_SIZE", {
        detail: { success: true, size: currentOrthoPointSize },
      })
    );
  });

  window.addEventListener("CVAT_EXT_REQ_GET_ORTHO_POINT_SIZE", () => {
    window.dispatchEvent(
      new CustomEvent("CVAT_EXT_RES_GET_ORTHO_POINT_SIZE", {
        detail: { size: currentOrthoPointSize },
      })
    );
  });

  // 26. Tính toán lại Edge Contacts
  window.addEventListener("CVAT_EXT_REQ_CALCULATE_EDGE_CONTACTS", () => {
    calculateAndBroadcastBoxEdgeContacts();
  });
}
