/**
 * Module: Canvas Interactor & Interactive Watcher (CVAT 3D Suite)
 * Chuyên trách:
 * 1. Ray-OBB Double Click 3D siêu tốc (< 0.05ms) nhận diện và chọn box ngay tức thì.
 * 2. Căn giữa (Center) và tập trung (Focus) cả 4 khung nhìn (Perspective, Top, Side, Front) vào đối tượng.
 * 3. Sticky Track Lock-On: Ghim tâm đối tượng khi tua/chuyển frame, chống nhảy ID.
 * 4. Cập nhật trực tiếp Three.js Cuboid mesh theo thời gian thực (Zero-Lag 60 FPS).
 * 5. Bộ theo dõi tương tác Canvas (Pointer, Keyboard, Box Transform vs Camera Orbit/Pan).
 * 6. Edge Contact Warnings & Live Coordinates broadcast.
 */

import {
  getReduxStore,
  syncSidebarItemHighlight,
  mainWorldLabelsCache,
  updateMainWorldLabels,
  resolveLabelName,
} from "./redux_bridge.ts";
import {
  getAllScenePointsObjects,
  schedulePointCloudColorization,
  currentColorizeBoxed,
  scheduleSingleFrameColorizationAndGround,
  cancelSingleFrameColorization,
} from "./point_cloud_colorizer.ts";
import {
  currentOrthoSlicing,
  updateOrthoClippingPlanes,
} from "./ortho_slicing_engine.ts";
import {
  installGlobalThreeRaycastGuard,
  hookAllScenes,
} from "./three_guard.ts";
import { computeBoxEdgeContacts } from "../../core/geometry/edge_contacts.ts";

export let isCanvasInteracting = false;
export let lastActiveTrackId: number | null = null;
export let persistentActiveTrackId: number | null = null;
export let currentActiveTrackId: number = -1;
export let isFrameTransitioning = false;
let frameTransitionTimer: any = null;
let lockOnActiveTimer: any = null;
let autoCenterOnFrameChange = true;

export function setAutoCenterOnFrameChange(val: boolean): void {
  autoCenterOnFrameChange = val;
}

export function getAutoCenterOnFrameChange(): boolean {
  return autoCenterOnFrameChange;
}

// 🚨 BẢO VỆ CHUYỂN FRAME: Theo dõi và thoát transition tức thì khi nhận thao tác chuột
if (typeof window !== "undefined") {
  const handlePointerTransitionUnblock = (e: Event) => {
    if (e.type === "pointerdown" || e.type === "mousedown") {
      isCanvasInteracting = true;
      (window as any).__cvat_mouse_down__ = true;
      if (isFrameTransitioning) {
        isFrameTransitioning = false;
        if (frameTransitionTimer) {
          clearTimeout(frameTransitionTimer);
          frameTransitionTimer = null;
        }
      }
      if (lockOnActiveTimer) {
        clearTimeout(lockOnActiveTimer);
        lockOnActiveTimer = null;
      }
      cancelSingleFrameColorization();
    }
  };
  window.addEventListener("pointerdown", handlePointerTransitionUnblock, { capture: true, passive: true });
  window.addEventListener("mousedown", handlePointerTransitionUnblock, { capture: true, passive: true });

  window.addEventListener("pointerdown", () => { (window as any).__cvat_mouse_down__ = true; }, { capture: true, passive: true });
  window.addEventListener("mousedown", () => { (window as any).__cvat_mouse_down__ = true; }, { capture: true, passive: true });
  window.addEventListener("pointerup", () => { (window as any).__cvat_mouse_down__ = false; }, { capture: true, passive: true });
  window.addEventListener("mouseup", () => { (window as any).__cvat_mouse_down__ = false; }, { capture: true, passive: true });
  window.addEventListener("pointercancel", () => { (window as any).__cvat_mouse_down__ = false; }, { capture: true, passive: true });
}

/**
 * Trích xuất tọa độ và kích thước thời gian thực (Live 3D Coordinates)
 */
export function extractLivePointsFromDrawnAndState(drawnItem: any, stateOrShape: any): number[] | null {
  const basePoints =
    drawnItem?.data?.points && Array.isArray(drawnItem.data.points) && drawnItem.data.points.length >= 9
      ? drawnItem.data.points
      : stateOrShape?.points && Array.isArray(stateOrShape.points) && stateOrShape.points.length >= 9
      ? stateOrShape.points
      : null;

  if (!basePoints) return null;

  let cx = basePoints[0];
  let cy = basePoints[1];
  let cz = basePoints[2];
  const rx = basePoints[3] || 0;
  const ry = basePoints[4] || 0;
  let yaw = basePoints[5] || 0;
  let l = basePoints[6];
  let w = basePoints[7];
  let h = basePoints[8];

  if (drawnItem && drawnItem.cuboid) {
    const basePos = { x: basePoints[0], y: basePoints[1], z: basePoints[2] };
    const baseYaw = basePoints[5] || 0;
    const baseScale = { l: basePoints[6], w: basePoints[7], h: basePoints[8] };
    const c = drawnItem.cuboid;

    let bestDeltaPos = 0;
    let bestPos: { x: number; y: number; z: number } | null = null;
    const candidateViews = [
      { name: "top", obj: c.top },
      { name: "side", obj: c.side },
      { name: "front", obj: c.front },
      { name: "perspective", obj: c.perspective },
      { name: "root", obj: c },
    ];

    for (const cand of candidateViews) {
      const p = cand.obj?.position;
      if (p && typeof p.x === "number" && typeof p.y === "number" && typeof p.z === "number") {
        let dx = p.x - basePos.x;
        let dy = p.y - basePos.y;
        let dz = p.z - basePos.z;
        if (cand.name === "top") dz = 0;
        if (cand.name === "side") dy = 0;
        if (cand.name === "front") dx = 0;

        const delta = dx * dx + dy * dy + dz * dz;
        if (delta > bestDeltaPos && delta > 1e-4) {
          bestDeltaPos = delta;
          bestPos = {
            x: cand.name === "front" ? basePos.x : p.x,
            y: cand.name === "side" ? basePos.y : p.y,
            z: cand.name === "top" ? basePos.z : p.z,
          };
        }
      }
    }

    if (bestPos) {
      cx = bestPos.x;
      cy = bestPos.y;
      cz = bestPos.z;
    } else {
      const fallbackPos = c.position || c.perspective?.position || c.top?.position;
      if (fallbackPos && typeof fallbackPos.x === "number" && typeof fallbackPos.y === "number" && typeof fallbackPos.z === "number") {
        cx = fallbackPos.x;
        cy = fallbackPos.y;
        cz = fallbackPos.z;
      }
    }

    let bestDeltaYaw = 0;
    let bestYaw: number | null = null;
    for (const cand of candidateViews) {
      const r = cand.obj?.rotation;
      if (r && typeof r.z === "number") {
        const dYaw = Math.abs(r.z - baseYaw);
        if (dYaw > bestDeltaYaw && dYaw > 1e-4) {
          bestDeltaYaw = dYaw;
          bestYaw = r.z;
        }
      }
    }
    if (bestYaw !== null) {
      yaw = bestYaw;
    } else {
      const fallbackRot = c.rotation || c.perspective?.rotation || c.top?.rotation;
      if (fallbackRot && typeof fallbackRot.z === "number") {
        yaw = fallbackRot.z;
      }
    }

    let bestDeltaScale = 0;
    let bestScale: { x: number; y: number; z: number } | null = null;
    for (const cand of candidateViews) {
      const s = cand.obj?.scale;
      if (s && typeof s.x === "number" && s.x > 0) {
        const dl = Math.abs(s.x - baseScale.l);
        const dw = Math.abs(s.y - baseScale.w);
        const dh = Math.abs(s.z - baseScale.h);
        if (cand.name === "top") dh; // no-op
        if (cand.name === "side") dw;
        if (cand.name === "front") dl;

        const delta = dl + dw + dh;
        if (delta > bestDeltaScale && delta > 1e-4) {
          bestDeltaScale = delta;
          bestScale = {
            x: cand.name === "front" ? baseScale.l : s.x,
            y: cand.name === "side" ? baseScale.w : s.y,
            z: cand.name === "top" ? baseScale.h : s.z,
          };
        }
      }
    }
    if (bestScale) {
      l = bestScale.x;
      w = bestScale.y;
      h = bestScale.z;
    } else {
      const fallbackScale = c.scale || c.perspective?.scale || c.top?.scale;
      if (fallbackScale && typeof fallbackScale.x === "number" && fallbackScale.x > 0) {
        l = fallbackScale.x;
        w = fallbackScale.y;
        h = fallbackScale.z;
      }
    }
  }

  const res = [...basePoints];
  res[0] = cx;
  res[1] = cy;
  res[2] = cz;
  res[3] = rx;
  res[4] = ry;
  res[5] = yaw;
  res[6] = l;
  res[7] = w;
  res[8] = h;
  return res;
}

/**
 * Căn giữa (Center) và tập trung (Focus) View 3D vào đối tượng tức thì
 */
export function center3DViewOnObject(uiId: number, targetPos?: { x: number; y: number; z: number }): boolean {
  if (isCanvasInteracting || (window as any).__cvat_mouse_down__) {
    return false;
  }
  try {
    const store = getReduxStore();
    const canvas = store?.getState()?.annotation?.canvas?.instance;
    if (!canvas || !canvas.view) return false;

    try {
      if (typeof (canvas as any).center === "function") {
        (canvas as any).center(uiId);
      }
      if (typeof (canvas.view as any)?.center === "function") {
        (canvas.view as any).center(uiId);
      }
      if (typeof (canvas.view as any)?.focus === "function") {
        (canvas.view as any).focus(uiId);
      }
    } catch (_) {}

    let pos = targetPos;
    if (!pos) {
      const drawn = canvas.view?.drawnObjects?.[String(uiId)];
      if (drawn?.data?.points && Array.isArray(drawn.data.points)) {
        pos = {
          x: drawn.data.points[0],
          y: drawn.data.points[1],
          z: drawn.data.points[2],
        };
      } else {
        const drawnObjects = canvas.view?.drawnObjects || {};
        for (const k of Object.keys(drawnObjects)) {
          const item = drawnObjects[k];
          const d = item?.data;
          if (d && Array.isArray(d.points)) {
            if (
              Number(k) === uiId ||
              Number(d.clientID) === uiId ||
              Number(d.parentID) === uiId ||
              Number(d.trackID) === uiId ||
              Number(d.serverID) === uiId
            ) {
              pos = { x: d.points[0], y: d.points[1], z: d.points[2] };
              break;
            }
          }
        }
      }

      if (!pos) {
        const states = store?.getState()?.annotation?.annotations?.states || [];
        const matched = states.find(
          (s: any) =>
            Number(s.clientID) === uiId ||
            Number(s.id) === uiId ||
            Number(s.parentID) === uiId ||
            Number(s.trackID) === uiId ||
            Number(s.serverID) === uiId
        );
        if (matched && Array.isArray(matched.points)) {
          pos = { x: matched.points[0], y: matched.points[1], z: matched.points[2] };
        }
      }
    }

    if (!pos || typeof pos.x !== "number" || isNaN(pos.x)) return false;

    const views = canvas.view.views;
    if (views) {
      const pView = views.perspective;
      if (pView?.controls?.target) {
        const curTarget = pView.controls.target;
        const deltaX = pos.x - curTarget.x;
        const deltaY = pos.y - curTarget.y;
        const deltaZ = pos.z - curTarget.z;

        curTarget.set(pos.x, pos.y, pos.z);

        if (pView.camera) {
          pView.camera.position.x += deltaX;
          pView.camera.position.y += deltaY;
          pView.camera.position.z += deltaZ;
          pView.camera.lookAt(pos.x, pos.y, pos.z);
        }
        if (typeof pView.controls.update === "function") {
          pView.controls.update();
        }
      }

      for (const viewName of ["top", "side", "front"]) {
        const oView = views[viewName];
        if (oView) {
          if (oView.controls?.target) {
            const curTarget = oView.controls.target;
            const deltaX = pos.x - curTarget.x;
            const deltaY = pos.y - curTarget.y;
            const deltaZ = pos.z - curTarget.z;

            if (oView.camera) {
              oView.camera.position.x += deltaX;
              oView.camera.position.y += deltaY;
              oView.camera.position.z += deltaZ;
            }

            curTarget.set(pos.x, pos.y, pos.z);
            if (typeof oView.controls.update === "function") {
              oView.controls.update();
            }
          }
          if (typeof oView.updateControls === "function") {
            oView.updateControls();
          }
        }
      }

      if (typeof canvas.render === "function") {
        canvas.render();
      }
    }

    return true;
  } catch (err) {
    console.warn("[CVAT 3D Suite] Lỗi center3DViewOnObject:", err);
    return false;
  }
}

/**
 * Cập nhật Track ID bền vững khi chọn đối tượng
 */
export function updateLockedTrackId(clientId: number): void {
  if (clientId === null || clientId === undefined || isNaN(clientId)) return;
  try {
    const store = getReduxStore();
    const states = store?.getState()?.annotation?.annotations?.states || [];
    const st = states.find((s: any) => Number(s.clientID) === Number(clientId));
    if (st) {
      const tid = st.parentID ?? st.trackID ?? st.parent?.clientID;
      if (tid !== undefined && tid !== null && !isNaN(Number(tid))) {
        persistentActiveTrackId = Number(tid);
        return;
      }
    }
  } catch (_) {}
  persistentActiveTrackId = Number(clientId);
}

/**
 * Dò tìm tọa độ và ghim tâm đối tượng đang active khi chuyển frame (Sticky Track Lock-On)
 */
export function lockOnActiveObjectAtFrame(targetId: number, targetFrame: number, attempt: number = 0): void {
  if (lockOnActiveTimer) {
    clearTimeout(lockOnActiveTimer);
    lockOnActiveTimer = null;
  }

  try {
    const store = getReduxStore();
    const anno = store?.getState()?.annotation;
    const canvas = anno?.canvas?.instance;
    const states = anno?.annotations?.states || [];

    const isFetching = !!anno?.annotations?.fetching;
    const isStaleStates =
      isFetching ||
      states.length === 0 ||
      (states.length > 0 && typeof states[0].frame === "number" && states[0].frame !== targetFrame);

    let matchedState: any = null;
    const trackIdToFind = persistentActiveTrackId !== null ? persistentActiveTrackId : targetId;

    if (!isStaleStates && trackIdToFind !== null && trackIdToFind !== undefined && !isNaN(trackIdToFind)) {
      matchedState = states.find(
        (s: any) =>
          Number(s.parentID ?? s.trackID ?? s.parent?.clientID) === Number(trackIdToFind) &&
          (typeof s.frame !== "number" || s.frame === targetFrame) &&
          !s.outside
      );
      if (!matchedState) {
        matchedState = states.find(
          (s: any) =>
            Number(s.clientID) === Number(trackIdToFind) &&
            (s.parentID === undefined || s.parentID === null) &&
            (typeof s.frame !== "number" || s.frame === targetFrame) &&
            !s.outside
        );
      }
    }

    if (!matchedState) {
      const delays = [60, 140, 260, 480, 800];
      if (attempt < delays.length) {
        lockOnActiveTimer = setTimeout(() => {
          lockOnActiveTimer = null;
          const curF = anno?.player?.frame?.number ?? store?.getState()?.annotation?.job?.instance?.frame;
          if (curF === targetFrame) {
            lockOnActiveObjectAtFrame(targetId, targetFrame, attempt + 1);
          }
        }, delays[attempt]);
      } else {
        window.dispatchEvent(new CustomEvent("CVAT_EXT_RES_OBJECT_DEACTIVATED"));
      }
      return;
    }

    const activeIdToUse = Number(matchedState.clientID);
    let foundPos: { x: number; y: number; z: number } | null = null;
    if (Array.isArray(matchedState.points) && matchedState.points.length >= 3) {
      foundPos = {
        x: matchedState.points[0],
        y: matchedState.points[1],
        z: matchedState.points[2],
      };
    }

    const isMeshReady = !!canvas?.view?.drawnObjects?.[String(activeIdToUse)];

    if (foundPos && typeof foundPos.x === "number" && !isNaN(foundPos.x)) {
      lastActiveTrackId = activeIdToUse;

      if (canvas && typeof canvas.activate === "function") {
        try {
          canvas.activate(activeIdToUse);
        } catch (_) {}
      }

      if (store && typeof store.dispatch === "function") {
        try {
          const currentStoreActiveId =
            store.getState()?.annotation?.annotations?.activatedStateClientID ??
            store.getState()?.annotation?.canvas?.instance?.view?.activatedElementID;
          if (Number(currentStoreActiveId) !== Number(activeIdToUse)) {
            store.dispatch({
              type: "ACTIVATE_OBJECT",
              payload: { activatedStateClientID: activeIdToUse, activatedElementID: activeIdToUse },
            });
          }
        } catch (_) {}
      }

      if (autoCenterOnFrameChange) {
        center3DViewOnObject(activeIdToUse, foundPos);
      }

      syncSidebarItemHighlight(Number(activeIdToUse));

      if (typeof canvas.render === "function") {
        canvas.render();
      }

      const details = extractObjectDetails(activeIdToUse);
      updateOrthoClippingPlanes(details);
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_OBJECT_ACTIVATED", {
          detail: { clientId: activeIdToUse, trackId: persistentActiveTrackId, details },
        })
      );
    }

    if (!isMeshReady && attempt < 3) {
      const delays = [60, 150, 300];
      lockOnActiveTimer = setTimeout(() => {
        lockOnActiveTimer = null;
        const curF = anno?.player?.frame?.number ?? store?.getState()?.annotation?.job?.instance?.frame;
        if (curF === targetFrame) {
          lockOnActiveObjectAtFrame(targetId, targetFrame, attempt + 1);
        }
      }, delays[attempt]);
    }
  } catch (err) {
    console.warn("[CVAT 3D Suite] Lỗi lockOnActiveObjectAtFrame:", err);
  }
}

/**
 * Can thiệp trực tiếp Three.js Canvas3D để xoay, co giãn và di chuyển cuboid tức thì
 */
export function updateThreeJsCuboid(
  uiId: number,
  newYaw?: number,
  newPos?: { x: number; y: number; z: number },
  newScale?: { l: number; w: number; h: number },
  newRot?: { rx: number; ry: number; rz: number }
): boolean {
  try {
    const store = getReduxStore();
    const canvas = store?.getState()?.annotation?.canvas?.instance;
    if (!canvas || !canvas.view || !canvas.view.drawnObjects) {
      return false;
    }

    const drawnItem = canvas.view.drawnObjects[String(uiId)];
    if (!drawnItem) {
      return false;
    }

    if (drawnItem.data && Array.isArray(drawnItem.data.points)) {
      if (newYaw !== undefined) {
        drawnItem.data.points[5] = newYaw;
      }
      if (newRot) {
        drawnItem.data.points[3] = newRot.rx;
        drawnItem.data.points[4] = newRot.ry;
        drawnItem.data.points[5] = newRot.rz;
      }
      if (newPos) {
        drawnItem.data.points[0] = newPos.x;
        drawnItem.data.points[1] = newPos.y;
        drawnItem.data.points[2] = newPos.z;
      }
      if (newScale) {
        drawnItem.data.points[6] = newScale.l;
        drawnItem.data.points[7] = newScale.w;
        drawnItem.data.points[8] = newScale.h;
      }
      drawnItem.data.updated = true;
    }

    const cuboid = drawnItem.cuboid;
    if (cuboid) {
      if (newRot && typeof cuboid.setRotation === "function") {
        cuboid.setRotation(newRot.rx, newRot.ry, newRot.rz);
      } else if (newYaw !== undefined && typeof cuboid.setRotation === "function") {
        const curRot = cuboid.perspective?.rotation;
        const rx = curRot ? curRot.x : 0;
        const ry = curRot ? curRot.y : 0;
        cuboid.setRotation(rx, ry, newYaw);
      }

      if (newScale && typeof cuboid.setScale === "function") {
        cuboid.setScale(newScale.l, newScale.w, newScale.h);
      }

      if (newPos && typeof cuboid.setPosition === "function") {
        cuboid.setPosition(newPos.x, newPos.y, newPos.z);
      }
    }

    if (newPos) {
      center3DViewOnObject(uiId, newPos);
    } else {
      center3DViewOnObject(uiId);
    }

    if (typeof canvas.render === "function") {
      canvas.render();
    }

    if (currentColorizeBoxed) {
      schedulePointCloudColorization(0);
    }
    calculateAndBroadcastBoxEdgeContacts();
    updateOrthoClippingPlanes();

    return true;
  } catch (err) {
    console.warn("[CVAT 3D Suite] Lỗi cập nhật trực tiếp Three.js:", err);
    return false;
  }
}

/**
 * Phân tích và trích xuất attributes của đối tượng từ cvat-core / Redux
 */
export function parseObjectAttributes(rawAttrs: any): Record<string, any> {
  const res: Record<string, any> = {};
  if (!rawAttrs) return res;
  if (typeof rawAttrs === "object") {
    for (const k of Object.keys(rawAttrs)) {
      const val = rawAttrs[k];
      if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
        res[String(k).toLowerCase()] = val;
        if (typeof val === "string") {
          res[val.toLowerCase()] = true;
        }
      } else if (val && typeof val === "object" && val.value !== undefined) {
        res[String(k).toLowerCase()] = val.value;
        if (typeof val.value === "string") {
          res[String(val.value).toLowerCase()] = true;
        }
      }
    }
  }
  return res;
}

/**
 * Trích xuất chi tiết thời gian thực của đối tượng từ WebGL drawnObjects hoặc Redux States
 */
export function extractObjectDetails(clientId: number): any {
  try {
    const store = getReduxStore();
    const anno = store?.getState()?.annotation;
    const canvas = anno?.canvas?.instance;

    if (mainWorldLabelsCache.size === 0) {
      updateMainWorldLabels();
    }

    const drawnItem = canvas?.view?.drawnObjects?.[String(clientId)];
    const states = anno?.annotations?.states || [];
    const matched = states.find((s: any) => s.clientID === clientId);

    const p = extractLivePointsFromDrawnAndState(drawnItem, matched);
    if (p && p.length >= 9) {
      const resolved = resolveLabelName(drawnItem?.data || matched);
      const attrs = parseObjectAttributes(
        drawnItem?.data?.attributes ||
        drawnItem?.data?.attributeValues ||
        matched?.attributes ||
        matched?.attributeValues
      );
      const persistentTid =
        matched?.parentID ??
        matched?.trackID ??
        matched?.parent?.clientID ??
        drawnItem?.data?.parentID ??
        drawnItem?.data?.trackID ??
        clientId;
      return {
        clientId,
        trackId: Number(persistentTid),
        serverId: drawnItem?.data?.serverID || matched?.serverID || null,
        label: resolved.name,
        color: resolved.color,
        x: Number(p[0].toFixed(2)),
        y: Number(p[1].toFixed(2)),
        z: Number(p[2].toFixed(3)),
        yawDeg: Math.round((p[5] * 180) / Math.PI),
        l: Number(p[6].toFixed(2)),
        w: Number(p[7].toFixed(2)),
        h: Number(p[8].toFixed(2)),
        points: [...p],
        attributes: attrs,
      };
    }
  } catch (e) {}
  return null;
}

/**
 * Tính toán và phát sự kiện Cảnh Báo Viền Chạm Point (Edge Contact HUD) cho Active Box
 */
export function calculateAndBroadcastBoxEdgeContacts(): void {
  try {
    const store = getReduxStore();
    const canvas = store?.getState()?.annotation?.canvas?.instance;
    const activeId =
      canvas?.view?.activatedElementID ??
      store?.getState()?.annotation?.annotations?.activatedStateClientID ??
      lastActiveTrackId;
    if (activeId === null || activeId === undefined || isNaN(Number(activeId))) return;

    const numId = Number(activeId);
    const details = extractObjectDetails(numId);
    if (!details || !Array.isArray(details.points) || details.points.length < 9) return;

    const ptsObjs = getAllScenePointsObjects();
    if (ptsObjs.length === 0) return;

    let mainPtsObj = ptsObjs[0];
    let maxCount = 0;
    for (const obj of ptsObjs) {
      const c = obj.geometry?.attributes?.position?.count || 0;
      if (c > maxCount) {
        maxCount = c;
        mainPtsObj = obj;
      }
    }

    const geom = mainPtsObj?.geometry;
    const posAttr = geom?.attributes?.position;
    if (!posAttr || !posAttr.array) return;

    const posArray = posAttr.array as Float32Array;
    const p = details.points;
    const boxTarget: any = {
      id: numId,
      cx: p[0],
      cy: p[1],
      cz: p[2],
      rx: p[3] || 0,
      ry: p[4] || 0,
      rz: p[5] || 0,
      l: p[6],
      w: p[7],
      h: p[8],
      category: details.label,
      isActive: true,
    };

    const contacts = computeBoxEdgeContacts(posArray, boxTarget);
    window.dispatchEvent(
      new CustomEvent("CVAT_EXT_RES_EDGE_CONTACTS_UPDATED", {
        detail: contacts || { clientId: numId, pointCount: 0 },
      })
    );
  } catch (e) {
    console.warn("[CVAT 3D Suite] Lỗi calculateAndBroadcastBoxEdgeContacts:", e);
  }
}

/**
 * Đảm bảo mảng points của cuboid luôn có tối thiểu 16 phần tử
 */
export function ensureCuboidPoints(newValues: number[], existingPoints?: number[]): number[] {
  let result: number[];
  if (Array.isArray(existingPoints) && existingPoints.length >= 16) {
    result = [...existingPoints];
    for (let i = 0; i < Math.min(newValues.length, 9); i++) {
      result[i] = newValues[i];
    }
  } else {
    result = [...newValues];
    while (result.length < 16) {
      result.push(0);
    }
  }
  return result;
}

let isInteractiveWatcherAttached = false;

/**
 * Thiết lập bộ theo dõi tương tác chuột & bàn phím trên Canvas 3D
 */
export function setupCanvasInteractiveWatcher(): void {
  if (isInteractiveWatcherAttached) return;
  isInteractiveWatcherAttached = true;

  let pointerUpDebounceTimer: any = null;
  let dragRafId: number | null = null;
  let hadBoxTransform = false;
  let clippingRafId: number | null = null;

  const _scheduleOrthoClippingUpdate = () => {
    if (clippingRafId !== null) return;
    clippingRafId = requestAnimationFrame(() => {
      clippingRafId = null;
      if (currentOrthoSlicing.hideGround) {
        updateOrthoClippingPlanes(undefined, false);
      }
    });
  };

  const isCameraNavigating = (): boolean => {
    try {
      const store = getReduxStore();
      const canvas = store?.getState()?.annotation?.canvas?.instance;
      const views = canvas?.view?.views;
      if (!views) return false;
      for (const vKey of ["perspective", "top", "side", "front"]) {
        const v = views[vKey];
        const controls = v?.controls;
        if (controls) {
          if (typeof controls.state === "number" && controls.state !== -1) {
            return true;
          }
          if (typeof (controls as any)._state === "number" && (controls as any)._state !== -1) {
            return true;
          }
          if ((controls as any).isRotating || (controls as any).isPanning) {
            return true;
          }
        }
      }
    } catch (_) {}
    return false;
  };

  const isTargetBoxTransforming = (): boolean => {
    try {
      const store = getReduxStore();
      const canvas = store?.getState()?.annotation?.canvas?.instance;
      const activeId =
        store?.getState()?.annotation?.annotations?.activatedStateClientID ??
        lastActiveTrackId;

      if (!activeId || isNaN(Number(activeId)) || Number(activeId) <= 0) {
        return false;
      }

      const drawnObjects = canvas?.view?.drawnObjects;
      if (!drawnObjects) return false;

      const drawnItem = drawnObjects[String(activeId)];
      if (!drawnItem) return false;

      const data = drawnItem.data;
      const c = drawnItem.cuboid;
      if (!data || !c || !Array.isArray(data.points) || data.points.length < 9 || data.outside) {
        return false;
      }

      const bx = data.points[0];
      const by = data.points[1];
      const bz = data.points[2];
      const bYaw = data.points[5] || 0;
      const bL = data.points[6];
      const bW = data.points[7];
      const bH = data.points[8];

      for (const cand of [c.perspective, c]) {
        const p = cand?.position;
        if (p && typeof p.x === "number") {
          const dx = p.x - bx;
          const dy = p.y - by;
          const dz = p.z - bz;
          if (dx * dx + dy * dy + dz * dz > 1e-4) return true;
        }
      }

      if (c.top?.position) {
        const p = c.top.position;
        if (typeof p.x === "number" && typeof p.y === "number") {
          const dx = p.x - bx;
          const dy = p.y - by;
          if (dx * dx + dy * dy > 1e-4) return true;
        }
      }

      if (c.side?.position) {
        const p = c.side.position;
        if (typeof p.x === "number" && typeof p.z === "number") {
          const dx = p.x - bx;
          const dz = p.z - bz;
          if (dx * dx + dz * dz > 1e-4) return true;
        }
      }

      if (c.front?.position) {
        const p = c.front.position;
        if (typeof p.y === "number" && typeof p.z === "number") {
          const dy = p.y - by;
          const dz = p.z - bz;
          if (dy * dy + dz * dz > 1e-4) return true;
        }
      }

      for (const cand of [c.perspective, c.top, c]) {
        const r = cand?.rotation;
        if (r && typeof r.z === "number") {
          if (Math.abs(r.z - bYaw) > 1e-3) return true;
        }
      }

      for (const cand of [c.perspective, c.top, c.side, c.front, c]) {
        const s = cand?.scale;
        if (s && typeof s.x === "number" && s.x > 0) {
          if (
            Math.abs(s.x - bL) > 1e-3 ||
            Math.abs(s.y - bW) > 1e-3 ||
            Math.abs(s.z - bH) > 1e-3
          ) {
            return true;
          }
        }
      }
    } catch (_) {}
    return false;
  };

  const onPointerMove = (e: PointerEvent) => {
    if (e.buttons === 1 && !isCanvasInteracting) {
      isCanvasInteracting = true;
    }
    if (isCanvasInteracting && e.buttons === 0) {
      onPointerUp();
      return;
    }
    if (!isCanvasInteracting) return;

    if (e.buttons === 2 || e.buttons === 4 || e.altKey) return;
    if (isCameraNavigating()) return;
    if (!isTargetBoxTransforming()) return;

    hadBoxTransform = true;
  };

  const onPointerUp = () => {
    if (dragRafId) {
      cancelAnimationFrame(dragRafId);
      dragRafId = null;
    }
    if (clippingRafId !== null) {
      cancelAnimationFrame(clippingRafId);
      clippingRafId = null;
    }
    if (!isCanvasInteracting) return;
    isCanvasInteracting = false;

    if (hadBoxTransform) {
      hadBoxTransform = false;

      try {
        const store = getReduxStore();
        const activeId =
          store?.getState()?.annotation?.annotations?.activatedStateClientID ??
          lastActiveTrackId;
        if (activeId !== null && activeId !== undefined && !isNaN(Number(activeId))) {
          const numId = Number(activeId);
          const details = extractObjectDetails(numId);
          if (details) {
            window.dispatchEvent(
              new CustomEvent("CVAT_EXT_RES_LIVE_TRANSFORM_CHANGED", {
                detail: { clientId: numId, details },
              })
            );
          }
        }
      } catch (_) {}

      if (pointerUpDebounceTimer) clearTimeout(pointerUpDebounceTimer);
      pointerUpDebounceTimer = setTimeout(() => {
        pointerUpDebounceTimer = null;
        if (currentColorizeBoxed) {
          schedulePointCloudColorization(0);
        }
        calculateAndBroadcastBoxEdgeContacts();
        updateOrthoClippingPlanes(undefined, true);
      }, 60);
    }
  };

  window.addEventListener(
    "pointerdown",
    (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (target && target.closest && target.closest(".cvat-canvas-container, .cvat-canvas3d-orthographic-view, [class*='cvat-canvas3d'], canvas")) {
        isCanvasInteracting = true;
      }
    },
    { capture: true, passive: true }
  );
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerup", onPointerUp, { passive: true });
  window.addEventListener("pointercancel", onPointerUp, { passive: true });

  const attachPointerDown = () => {
    const canvasElements = document.querySelectorAll<HTMLElement>(
      ".cvat-canvas-container, .cvat-canvas3d-orthographic-view, [class*='cvat-canvas3d'], canvas"
    );
    canvasElements.forEach((el) => {
      if ((el as any)._hasColorDragWatcher) return;
      (el as any)._hasColorDragWatcher = true;
      el.addEventListener(
        "pointerdown",
        () => {
          isCanvasInteracting = true;
          try {
            const store = getReduxStore();
            const activeId = store?.getState()?.annotation?.annotations?.activatedStateClientID;
            if (activeId !== null && activeId !== undefined) {
              updateLockedTrackId(Number(activeId));
            }
          } catch (_) {}
        },
        { passive: true }
      );
    });
  };

  attachPointerDown();
  setInterval(attachPointerDown, 2000);

  let keyDebounceTimer: any = null;
  window.addEventListener(
    "keydown",
    (e: KeyboardEvent) => {
      if (!currentColorizeBoxed) return;
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || (target as any).isContentEditable)) {
        return;
      }

      const relevantKeys = [
        "KeyW", "KeyA", "KeyS", "KeyD",
        "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
        "KeyQ", "KeyE", "KeyR", "KeyT", "KeyF", "KeyZ", "KeyX", "KeyC",
      ];
      if (relevantKeys.includes(e.code) || e.ctrlKey || e.altKey || e.shiftKey) {
        if (keyDebounceTimer) clearTimeout(keyDebounceTimer);
        keyDebounceTimer = setTimeout(() => {
          keyDebounceTimer = null;
          schedulePointCloudColorization(0);
          calculateAndBroadcastBoxEdgeContacts();
        }, 60);
      }
    },
    { passive: true }
  );
}

let isCanvasAutoSelectAttached = false;

/**
 * Thiết lập cơ chế tự động chọn xe khi click vào box trên Canvas 3D & Redux Subscriber Realtime
 */
export function setupCanvasAutoSelect(retryCount = 0): void {
  if (isCanvasAutoSelectAttached) return;

  const store = getReduxStore();
  const canvasContainers = document.querySelectorAll<HTMLElement>(
    ".cvat-canvas-container, .cvat-canvas3d-orthographic-view"
  );

  if ((canvasContainers.length === 0 || !store) && retryCount < 15) {
    setTimeout(() => setupCanvasAutoSelect(retryCount + 1), 1000);
    return;
  }

  isCanvasAutoSelectAttached = true;
  setupCanvasInteractiveWatcher();

  function transformVectorInverseEulerLocal(
    v: { x: number; y: number; z: number },
    rx: number = 0,
    ry: number = 0,
    rz: number = 0
  ): { x: number; y: number; z: number } {
    const cosZ = Math.cos(rz), sinZ = Math.sin(rz);
    const x1 = v.x * cosZ + v.y * sinZ;
    const y1 = -v.x * sinZ + v.y * cosZ;
    const z1 = v.z;

    const cosY = Math.cos(ry), sinY = Math.sin(ry);
    const x2 = x1 * cosY - z1 * sinY;
    const y2 = y1;
    const z2 = x1 * sinY + z1 * cosY;

    const cosX = Math.cos(rx), sinX = Math.sin(rx);
    const x3 = x2;
    const y3 = y2 * cosX + z2 * sinX;
    const z3 = -y2 * sinX + z2 * cosX;

    return { x: x3, y: y3, z: z3 };
  }

  function intersectRayWithOBBLocal(
    ray: { origin: { x: number; y: number; z: number }; direction: { x: number; y: number; z: number } },
    box: { x: number; y: number; z: number; l: number; w: number; h: number; yaw: number; pitch?: number; roll?: number },
    padding: number = 0.15
  ): number | null {
    if (box.l <= 0 || box.w <= 0 || box.h <= 0) return null;

    const hx = box.l / 2 + padding;
    const hy = box.w / 2 + padding;
    const hz = box.h / 2 + padding;

    const P = {
      x: ray.origin.x - box.x,
      y: ray.origin.y - box.y,
      z: ray.origin.z - box.z,
    };
    const D = ray.direction;

    const rx = box.roll || 0;
    const ry = box.pitch || 0;
    const rz = box.yaw || 0;

    const Ploc = transformVectorInverseEulerLocal(P, rx, ry, rz);
    const Dloc = transformVectorInverseEulerLocal(D, rx, ry, rz);

    let tMin = -Infinity;
    let tMax = Infinity;

    if (Math.abs(Dloc.x) > 1e-7) {
      let t1 = (-hx - Ploc.x) / Dloc.x;
      let t2 = (hx - Ploc.x) / Dloc.x;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return null;
    } else if (Math.abs(Ploc.x) > hx) {
      return null;
    }

    if (Math.abs(Dloc.y) > 1e-7) {
      let t1 = (-hy - Ploc.y) / Dloc.y;
      let t2 = (hy - Ploc.y) / Dloc.y;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return null;
    } else if (Math.abs(Ploc.y) > hy) {
      return null;
    }

    if (Math.abs(Dloc.z) > 1e-7) {
      let t1 = (-hz - Ploc.z) / Dloc.z;
      let t2 = (hz - Ploc.z) / Dloc.z;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return null;
    } else if (Math.abs(Ploc.z) > hz) {
      return null;
    }

    if (tMax < 0) return null;
    return tMin >= 0 ? tMin : tMax;
  }

  let fastDoubleRaycaster: any = null;

  function findObjectUnderPointer(
    clientX: number,
    clientY: number
  ): { uiId: number; pos: { x: number; y: number; z: number } } | null {
    try {
      const curStore = getReduxStore() || store;
      const canvas = curStore?.getState()?.annotation?.canvas?.instance;
      const views = canvas?.view?.views;
      if (!views) return null;

      let activeView = views.perspective;
      let activeCam = activeView?.camera;
      let activeRenderer = activeView?.renderer;
      let targetCanvas: HTMLCanvasElement | null = activeRenderer?.domElement || null;

      const orthoKeys = ["top", "side", "front"];
      for (const name of orthoKeys) {
        const v = views[name];
        const dom = v?.renderer?.domElement;
        if (dom) {
          const r = dom.getBoundingClientRect();
          if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
            activeView = v;
            activeCam = v.camera;
            activeRenderer = v.renderer;
            targetCanvas = dom;
            break;
          }
        }
      }

      if (!targetCanvas) {
        targetCanvas =
          document.querySelector<HTMLCanvasElement>(".cvat-canvas3d-perspective canvas") ||
          document.querySelector<HTMLCanvasElement>(".cvat-canvas-container canvas");
      }

      if (!activeCam || !targetCanvas) return null;

      const rect = targetCanvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;

      const mouseX = ((clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -((clientY - rect.top) / rect.height) * 2 + 1;

      const winThree = (window as any).THREE || canvas?.view?.THREE;
      if (!winThree) return null;

      if (!fastDoubleRaycaster && typeof winThree.Raycaster === "function") {
        fastDoubleRaycaster = new winThree.Raycaster();
      }
      if (!fastDoubleRaycaster) return null;

      fastDoubleRaycaster.setFromCamera({ x: mouseX, y: mouseY }, activeCam);
      const ray = fastDoubleRaycaster.ray;
      if (!ray || !ray.origin || !ray.direction) return null;

      const drawnObjects = canvas?.view?.drawnObjects || {};
      const states = curStore?.getState()?.annotation?.annotations?.states || [];

      let bestHitDist = Infinity;
      let bestUiId: number | null = null;
      let bestPos: { x: number; y: number; z: number } | null = null;

      const checkedIds = new Set<number>();

      for (const k of Object.keys(drawnObjects)) {
        const item = drawnObjects[k];
        const data = item?.data;
        if (!data || data.outside) continue;
        const uiId = Number(k);
        if (isNaN(uiId) || uiId <= 0) continue;
        checkedIds.add(uiId);

        const pts = extractLivePointsFromDrawnAndState(item, null) || data.points;
        if (!pts || !Array.isArray(pts) || pts.length < 9) continue;

        const box = {
          x: pts[0],
          y: pts[1],
          z: pts[2],
          roll: pts[3] || 0,
          pitch: pts[4] || 0,
          yaw: pts[5] || 0,
          l: pts[6],
          w: pts[7],
          h: pts[8],
        };

        const hitDist = intersectRayWithOBBLocal(ray, box, 0.15);
        if (hitDist !== null && hitDist < bestHitDist) {
          bestHitDist = hitDist;
          bestUiId = uiId;
          bestPos = { x: pts[0], y: pts[1], z: pts[2] };
        }
      }

      for (const st of states) {
        if (!st || st.outside || st.shapeType !== "cuboid") continue;
        const uiId = Number(st.clientID ?? st.id);
        if (isNaN(uiId) || uiId <= 0 || checkedIds.has(uiId)) continue;
        checkedIds.add(uiId);

        const pts = st.points;
        if (!pts || !Array.isArray(pts) || pts.length < 9) continue;

        const box = {
          x: pts[0],
          y: pts[1],
          z: pts[2],
          roll: pts[3] || 0,
          pitch: pts[4] || 0,
          yaw: pts[5] || 0,
          l: pts[6],
          w: pts[7],
          h: pts[8],
        };

        const hitDist = intersectRayWithOBBLocal(ray, box, 0.15);
        if (hitDist !== null && hitDist < bestHitDist) {
          bestHitDist = hitDist;
          bestUiId = uiId;
          bestPos = { x: pts[0], y: pts[1], z: pts[2] };
        }
      }

      if (bestUiId !== null && bestPos !== null) {
        return { uiId: bestUiId, pos: bestPos };
      }

      try {
        const cuboidMeshes: any[] = [];
        const meshToIdMap = new Map<any, number>();
        for (const k of Object.keys(drawnObjects)) {
          const item = drawnObjects[k];
          const uiId = Number(k);
          if (item?.cuboid) {
            const cand = item.cuboid.perspective || item.cuboid;
            if (cand) {
              cuboidMeshes.push(cand);
              meshToIdMap.set(cand, uiId);
            }
          }
        }
        if (cuboidMeshes.length > 0) {
          const intersects = fastDoubleRaycaster.intersectObjects(cuboidMeshes, true);
          if (intersects && intersects.length > 0) {
            const firstHit = intersects[0];
            let curObj = firstHit.object;
            while (curObj) {
              if (meshToIdMap.has(curObj)) {
                const uiId = meshToIdMap.get(curObj)!;
                const d = drawnObjects[String(uiId)]?.data;
                const pos = d && Array.isArray(d.points) ? { x: d.points[0], y: d.points[1], z: d.points[2] } : undefined;
                return { uiId, pos: pos || { x: firstHit.point.x, y: firstHit.point.y, z: firstHit.point.z } };
              }
              curObj = curObj.parent;
            }
          }
        }
      } catch (_) {}

      try {
        let bestScreenDist = 32;
        let screenMatchId: number | null = null;
        let screenMatchPos: { x: number; y: number; z: number } | null = null;

        for (const id of checkedIds) {
          const drawn = drawnObjects[String(id)];
          const pts = extractLivePointsFromDrawnAndState(drawn, null) || drawn?.data?.points;
          if (!pts || !Array.isArray(pts) || pts.length < 3) continue;

          const cx = pts[0], cy = pts[1], cz = pts[2];
          const tempV = new winThree.Vector3(cx, cy, cz);
          tempV.project(activeCam);

          if (tempV.z >= -1 && tempV.z <= 1) {
            const screenX = ((tempV.x + 1) / 2) * rect.width + rect.left;
            const screenY = ((-tempV.y + 1) / 2) * rect.height + rect.top;
            const d = Math.hypot(clientX - screenX, clientY - screenY);
            if (d < bestScreenDist) {
              bestScreenDist = d;
              screenMatchId = id;
              screenMatchPos = { x: cx, y: cy, z: cz };
            }
          }
        }

        if (screenMatchId !== null && screenMatchPos !== null) {
          return { uiId: screenMatchId, pos: screenMatchPos };
        }
      } catch (_) {}

      return null;
    } catch (err) {
      console.warn("[CVAT 3D Suite] Lỗi findObjectUnderPointer:", err);
      return null;
    }
  }

  function activateAndGhimObjectImmediately(
    uiId: number,
    targetPos?: { x: number; y: number; z: number }
  ): void {
    if (uiId === null || uiId === undefined || isNaN(uiId) || uiId <= 0) return;

    lastActiveTrackId = uiId;
    lastDispatchedActiveId = uiId;
    updateLockedTrackId(uiId);

    center3DViewOnObject(uiId, targetPos);

    const details = extractObjectDetails(uiId);

    window.dispatchEvent(
      new CustomEvent("CVAT_EXT_RES_OBJECT_ACTIVATED", {
        detail: { clientId: uiId, details, isHover: false, isDoubleClick: true },
      })
    );

    if (currentColorizeBoxed) {
      schedulePointCloudColorization(0);
    }
    calculateAndBroadcastBoxEdgeContacts();
    updateOrthoClippingPlanes(details);

    try {
      const curStore = getReduxStore() || store;
      const canvas = curStore?.getState()?.annotation?.canvas?.instance;
      if (canvas && typeof canvas.activate === "function") {
        const curCanvasActive =
          canvas.view?.activatedElementID ||
          curStore?.getState()?.annotation?.annotations?.activatedStateClientID;
        if (Number(curCanvasActive) !== uiId) {
          canvas.activate(uiId);
          if (typeof canvas.render === "function") {
            canvas.render();
          }
        }
      }

      if (curStore && typeof curStore.dispatch === "function") {
        const currentStoreActiveId =
          curStore.getState()?.annotation?.annotations?.activatedStateClientID ??
          curStore.getState()?.annotation?.canvas?.instance?.view?.activatedElementID;
        if (Number(currentStoreActiveId) !== uiId) {
          curStore.dispatch({
            type: "ACTIVATE_OBJECT",
            payload: { activatedStateClientID: uiId, activatedElementID: uiId },
          });
        }
      }
    } catch (_) {}

    syncSidebarItemHighlight(uiId);
  }

  let lastHandledDblClickTime = 0;
  function handle3DCanvasDoubleClick(e: MouseEvent | PointerEvent): void {
    if (isFrameTransitioning) return;
    const now = Date.now();
    if (now - lastHandledDblClickTime < 240) return;
    lastHandledDblClickTime = now;

    const hit = findObjectUnderPointer(e.clientX, e.clientY);
    if (hit && hit.uiId > 0) {
      activateAndGhimObjectImmediately(hit.uiId, hit.pos);
      try {
        e.stopPropagation();
      } catch (_) {}
    }
  }

  document.addEventListener(
    "dblclick",
    (e: MouseEvent) => {
      if (isFrameTransitioning) return;
      const target = e.target as HTMLElement;
      if (!target) return;
      if (target.closest("input, textarea, button, select, #cvat-3d-suite-panel, .cvat-3d-suite-modal")) {
        return;
      }
      const canvasContainer = target.closest(
        ".cvat-canvas-container, .cvat-canvas3d-perspective, .cvat-canvas3d-orthographic-view, .cvat-canvas3d-topview, .cvat-canvas3d-sideview, .cvat-canvas3d-frontview"
      );
      if (canvasContainer || target.tagName === "CANVAS") {
        handle3DCanvasDoubleClick(e);
      }
    },
    { capture: true }
  );

  let fastDblLastTime = 0;
  let fastDblLastX = 0;
  let fastDblLastY = 0;

  canvasContainers.forEach((container) => {
    container.addEventListener(
      "pointerup",
      (e: PointerEvent) => {
        if (isFrameTransitioning) return;
        if (e.button !== 0) return;
        const now = Date.now();
        const dt = now - fastDblLastTime;
        const dx = Math.abs(e.clientX - fastDblLastX);
        const dy = Math.abs(e.clientY - fastDblLastY);

        fastDblLastTime = now;
        fastDblLastX = e.clientX;
        fastDblLastY = e.clientY;

        if (dt >= 40 && dt <= 320 && dx <= 8 && dy <= 8) {
          handle3DCanvasDoubleClick(e);
          return;
        }

        if (dx > 4 || dy > 4) return;

        setTimeout(() => {
          if (isFrameTransitioning) return;
          try {
            const currentStore = getReduxStore() || store;
            const activeId = currentStore?.getState()?.annotation?.annotations?.activatedStateClientID;

            if (activeId !== null && activeId !== undefined) {
              const numId = Number(activeId);
              if (numId > 0 && numId !== lastActiveTrackId) {
                updateLockedTrackId(numId);
                triggerFocusOnObject(numId, false);
              }
            }
          } catch (err) {}
        }, 80);
      },
      { capture: true }
    );
  });

  document.addEventListener("click", (e: MouseEvent) => {
    if (isFrameTransitioning) return;
    const target = e.target as HTMLElement;
    const sidebarItem = target.closest<HTMLElement>(
      "[class*='cvat-objects-sidebar-state-item'], [class*='cvat-objects-sidebar-states-list-item'], [data-cvat-state-item-id]"
    );
    if (sidebarItem) {
      setTimeout(() => {
        if (isFrameTransitioning) return;
        let id: number | null = null;
        const dataId = sidebarItem.getAttribute("data-cvat-state-item-id") || sidebarItem.getAttribute("data-item-id");
        if (dataId && /^\d+$/.test(dataId)) {
          id = parseInt(dataId, 10);
        } else {
          const idAttr = sidebarItem.id || sidebarItem.closest("[id*='cvat-objects-sidebar-state-item-']")?.id || "";
          const directMatch = idAttr.match(/cvat-objects-sidebar-state-item-(\d+)/);
          if (directMatch) {
            id = parseInt(directMatch[1], 10);
          } else {
            const textMatch = (sidebarItem.innerText || sidebarItem.textContent || "").match(/#(\d+)/);
            if (textMatch) id = parseInt(textMatch[1], 10);
          }
        }
        if (id && id > 0) {
          updateLockedTrackId(id);
          triggerFocusOnObject(id, true);
        }
      }, 60);
    }
  });

  let focusTriggerDebounceTimer: any = null;
  let isTriggeringFocus = false;
  let lastDispatchedActiveId: number | null = null;

  function triggerFocusOnObject(id: number, forceCenter: boolean = true): void {
    if (id === null || id === undefined || isNaN(id) || id <= 0) return;
    if (isTriggeringFocus) return;

    if (id !== lastDispatchedActiveId) {
      lastDispatchedActiveId = id;
      const details = extractObjectDetails(id);
      window.dispatchEvent(
        new CustomEvent("CVAT_EXT_RES_OBJECT_ACTIVATED", {
          detail: { clientId: id, details, isHover: false },
        })
      );
      calculateAndBroadcastBoxEdgeContacts();
    }

    if (id === lastActiveTrackId && id === persistentActiveTrackId && !forceCenter) return;

    lastActiveTrackId = id;
    updateLockedTrackId(id);

    if (focusTriggerDebounceTimer) clearTimeout(focusTriggerDebounceTimer);
    focusTriggerDebounceTimer = setTimeout(() => {
      focusTriggerDebounceTimer = null;
      isTriggeringFocus = true;

      try {
        if (forceCenter) {
          center3DViewOnObject(id);
        }

        if (currentColorizeBoxed) {
          schedulePointCloudColorization(0);
        }
        calculateAndBroadcastBoxEdgeContacts();
        updateOrthoClippingPlanes();

        try {
          const curStore = getReduxStore();
          const canvas = curStore?.getState()?.annotation?.canvas?.instance;
          if (canvas && typeof canvas.activate === "function") {
            const curCanvasActive =
              canvas.view?.activatedElementID ||
              curStore?.getState()?.annotation?.annotations?.activatedStateClientID;
            if (Number(curCanvasActive) !== id) {
              canvas.activate(id);
              if (typeof canvas.render === "function") {
                canvas.render();
              }
            }
          }

          if (curStore && typeof curStore.dispatch === "function") {
            const currentStoreActiveId =
              curStore.getState()?.annotation?.annotations?.activatedStateClientID ??
              curStore.getState()?.annotation?.canvas?.instance?.view?.activatedElementID;
            if (Number(currentStoreActiveId) !== id) {
              curStore.dispatch({
                type: "ACTIVATE_OBJECT",
                payload: { activatedStateClientID: id, activatedElementID: id },
              });
            }
          }
        } catch (_) {}

        syncSidebarItemHighlight(id);
      } finally {
        isTriggeringFocus = false;
      }
    }, 15);
  }

  let lastObservedSidebarId: number | null = null;
  let sidebarObserverDebounce: any = null;

  function attachSidebarActiveObserver(): void {
    try {
      const sidebarEl =
        document.querySelector("#cvat-objects-sidebar") ||
        document.querySelector(".cvat-objects-sidebar") ||
        document.querySelector("[class*='cvat-objects-sidebar']") ||
        document.body;

      if (!sidebarEl || (sidebarEl as any).__cvat_sidebar_observer_attached__) return;
      (sidebarEl as any).__cvat_sidebar_observer_attached__ = true;

      const observer = new MutationObserver(() => {
        if (isFrameTransitioning) return;
        if (sidebarObserverDebounce) return;
        sidebarObserverDebounce = setTimeout(() => {
          sidebarObserverDebounce = null;
          if (isFrameTransitioning) return;
          try {
            const activeItem = document.querySelector<HTMLElement>(
              ".cvat-objects-sidebar-state-item-active, " +
              ".cvat-objects-sidebar-state-item.selected, " +
              "[class*='sidebar-state-item-active'], " +
              "[data-cvat-state-item-id][class*='selected']"
            );

            if (activeItem) {
              let id: number | null = null;
              const idAttr = activeItem.id || activeItem.closest("[id*='cvat-objects-sidebar-state-item-']")?.id || "";
              const directMatch = idAttr.match(/cvat-objects-sidebar-state-item-(\d+)/) || idAttr.match(/#?(\d+)/);
              if (directMatch) {
                id = parseInt(directMatch[1], 10);
              } else {
                const dataId = activeItem.getAttribute("data-cvat-state-item-id") || activeItem.getAttribute("data-item-id");
                if (dataId && /^\d+$/.test(dataId)) {
                  id = parseInt(dataId, 10);
                } else {
                  const match = (activeItem.innerText || activeItem.textContent || "").match(/#(\d+)/);
                  if (match) id = parseInt(match[1], 10);
                }
              }

              if (id && id > 0 && id !== lastObservedSidebarId) {
                const curReduxActive = getReduxStore()?.getState()?.annotation?.annotations?.activatedStateClientID;
                if (Number(curReduxActive) === id && id !== lastActiveTrackId) {
                  lastObservedSidebarId = id;
                  lastActiveTrackId = id;
                  updateLockedTrackId(id);
                }
              }
            }
          } catch (_) {}
        }, 60);
      });

      observer.observe(sidebarEl, {
        attributes: true,
        attributeFilter: ["class", "data-cvat-state-item-id"],
        subtree: true,
      });
    } catch (_) {}
  }

  attachSidebarActiveObserver();

  try {
    const curStore = getReduxStore();
    if (curStore) {
      let prevActiveId: any = null;
      let prevStatesLen = 0;
      let prevFrame: any = null;
      let prevPointsFingerprint = "";
      let activeDebounceTimer: any = null;
      let dirtyDebounceTimer: any = null;
      let pointsDebounceTimer: any = null;
      let lastFingerprintCalcTime = 0;
      let fingerprintThrottleTimer: any = null;

      const doComputeFingerprint = (states: any[]) => {
        const isMouseDown = typeof window !== "undefined" && (window as any).__cvat_mouse_down__;
        if (isCanvasInteracting || isMouseDown || isFrameTransitioning) return;

        let currentPointsFingerprint = "";
        for (let i = 0; i < states.length; i++) {
          const st = states[i];
          if (st && Array.isArray(st.points) && st.points.length >= 9 && !st.outside) {
            const p = st.points;
            currentPointsFingerprint += `${st.clientID}:${Math.round(p[0] * 50)},${Math.round(p[1] * 50)},${Math.round(p[2] * 50)},${Math.round(p[5] * 50)},${Math.round(p[6] * 50)},${Math.round(p[7] * 50)},${Math.round(p[8] * 50)}|`;
          }
        }

        if (currentPointsFingerprint !== prevPointsFingerprint) {
          const isInit = prevPointsFingerprint === "";
          prevPointsFingerprint = currentPointsFingerprint;
          if (!isInit && !isCanvasInteracting && !isMouseDown && !isFrameTransitioning) {
            if (pointsDebounceTimer) clearTimeout(pointsDebounceTimer);
            pointsDebounceTimer = setTimeout(() => {
              pointsDebounceTimer = null;
              if (isFrameTransitioning) return;
              schedulePointCloudColorization(0);
              calculateAndBroadcastBoxEdgeContacts();

              try {
                const s = getReduxStore();
                const activeId =
                  s?.getState()?.annotation?.annotations?.activatedStateClientID ??
                  lastActiveTrackId;
                if (activeId !== null && activeId !== undefined && !isNaN(Number(activeId))) {
                  const numId = Number(activeId);
                  const details = extractObjectDetails(numId);
                  if (details) {
                    window.dispatchEvent(
                      new CustomEvent("CVAT_EXT_RES_LIVE_TRANSFORM_CHANGED", {
                        detail: { clientId: numId, details },
                      })
                    );
                  }
                }
              } catch (_) {}
            }, 50);
          }
        }
      };

      const checkPointsFingerprintThrottled = (states: any[]) => {
        const isMouseDown = typeof window !== "undefined" && (window as any).__cvat_mouse_down__;
        if (isCanvasInteracting || isMouseDown || isFrameTransitioning) return;

        const now = Date.now();
        const elapsed = now - lastFingerprintCalcTime;
        if (elapsed >= 200) {
          lastFingerprintCalcTime = now;
          if (fingerprintThrottleTimer) {
            clearTimeout(fingerprintThrottleTimer);
            fingerprintThrottleTimer = null;
          }
          doComputeFingerprint(states);
        } else if (!fingerprintThrottleTimer) {
          fingerprintThrottleTimer = setTimeout(() => {
            fingerprintThrottleTimer = null;
            lastFingerprintCalcTime = Date.now();
            const latestStates = getReduxStore()?.getState()?.annotation?.annotations?.states || states;
            doComputeFingerprint(latestStates);
          }, 200 - elapsed);
        }
      };

      curStore.subscribe(() => {
        try {
          const anno = curStore.getState()?.annotation;
          const curActiveId = anno?.annotations?.activatedStateClientID ?? null;
          const curStatesLen = anno?.annotations?.states?.length || 0;
          const curFrame = anno?.player?.frame?.number ?? anno?.job?.instance?.frame;

          if (curFrame !== undefined && curFrame !== null && curFrame !== prevFrame) {
            const oldFrame = prevFrame;
            prevFrame = curFrame;
            prevPointsFingerprint = "";
            lastFingerprintCalcTime = 0;
            lastDispatchedActiveId = null;

            if (frameTransitionTimer) { clearTimeout(frameTransitionTimer); frameTransitionTimer = null; }
            if (lockOnActiveTimer) { clearTimeout(lockOnActiveTimer); lockOnActiveTimer = null; }
            cancelSingleFrameColorization();
            if (activeDebounceTimer) { clearTimeout(activeDebounceTimer); activeDebounceTimer = null; }
            if (dirtyDebounceTimer) { clearTimeout(dirtyDebounceTimer); dirtyDebounceTimer = null; }

            installGlobalThreeRaycastGuard();
            hookAllScenes();

            let scanGuardCount = 0;
            const scanGuardInterval = setInterval(() => {
              scanGuardCount++;
              installGlobalThreeRaycastGuard();
              hookAllScenes();
              if (scanGuardCount >= 30) {
                clearInterval(scanGuardInterval);
              }
            }, 35);

            isFrameTransitioning = true;
            frameTransitionTimer = setTimeout(() => {
              isFrameTransitioning = false;
              frameTransitionTimer = null;
            }, 120);

            if (currentOrthoSlicing.hideGround) {
              setTimeout(() => updateOrthoClippingPlanes(undefined, false), 80);
            }

            scheduleSingleFrameColorizationAndGround(curFrame, 180);

            window.dispatchEvent(
              new CustomEvent("CVAT_EXT_RES_FRAME_CHANGED", {
                detail: { frame: curFrame, prevFrame: oldFrame },
              })
            );

            if (oldFrame !== null) {
              const activeIdToLock =
                persistentActiveTrackId !== null
                  ? persistentActiveTrackId
                  : (curActiveId !== null && curActiveId !== undefined
                      ? Number(curActiveId)
                      : lastActiveTrackId);

              if (activeIdToLock !== null && !isNaN(activeIdToLock)) {
                if (lockOnActiveTimer) clearTimeout(lockOnActiveTimer);
                lockOnActiveTimer = setTimeout(() => {
                  lockOnActiveTimer = null;
                  lockOnActiveObjectAtFrame(activeIdToLock, curFrame, 0);
                }, 60);
              }
            }
          }

          if (curActiveId !== prevActiveId) {
            prevActiveId = curActiveId;
            if (curActiveId !== null && curActiveId !== undefined) {
              const idNum = Number(curActiveId);

              if (isFrameTransitioning) {
                if (persistentActiveTrackId !== null) {
                  const curStates = anno?.annotations?.states || [];
                  const st = curStates.find((s: any) => Number(s.clientID) === idNum);
                  const tid = st ? (st.parentID ?? st.trackID ?? st.parent?.clientID ?? st.clientID) : null;
                  if (tid === null || Number(tid) !== Number(persistentActiveTrackId)) {
                    return;
                  }
                } else {
                  return;
                }
              }

              lastActiveTrackId = idNum;
              currentActiveTrackId = idNum;
              lastDispatchedActiveId = idNum;
              if (!isFrameTransitioning) {
                updateLockedTrackId(idNum);
              }
              const details = extractObjectDetails(idNum);
              window.dispatchEvent(
                new CustomEvent("CVAT_EXT_RES_OBJECT_ACTIVATED", {
                  detail: { clientId: idNum, trackId: persistentActiveTrackId, details, isHover: false },
                })
              );

              if (activeDebounceTimer) clearTimeout(activeDebounceTimer);
              activeDebounceTimer = setTimeout(() => {
                activeDebounceTimer = null;
                triggerFocusOnObject(idNum, true);
              }, 15);
            } else {
              if (isFrameTransitioning) return;

              lastActiveTrackId = null;
              persistentActiveTrackId = null;
              currentActiveTrackId = -1;
              lastDispatchedActiveId = null;
              syncSidebarItemHighlight(null);
              if (activeDebounceTimer) clearTimeout(activeDebounceTimer);
              activeDebounceTimer = setTimeout(() => {
                activeDebounceTimer = null;
                if (isFrameTransitioning) return;
                window.dispatchEvent(new CustomEvent("CVAT_EXT_RES_OBJECT_DEACTIVATED"));
                schedulePointCloudColorization(0);
                updateOrthoClippingPlanes();
              }, 40);
            }
          }

          const states = anno?.annotations?.states || [];
          checkPointsFingerprintThrottled(states);

          if (curStatesLen !== prevStatesLen) {
            prevStatesLen = curStatesLen;
            if (dirtyDebounceTimer) clearTimeout(dirtyDebounceTimer);
            dirtyDebounceTimer = setTimeout(() => {
              dirtyDebounceTimer = null;
              if (isFrameTransitioning) return;
              window.dispatchEvent(new CustomEvent("CVAT_EXT_RES_FRAME_TRACKS_DIRTY"));
              schedulePointCloudColorization(0);
            }, 400);
          }
        } catch (err) {}
      });
    }
  } catch (sErr) {}

  window.addEventListener("CVAT_EXT_REQ_ACTIVATE_OBJECT", (e: any) => {
    try {
      const clientId = e.detail?.clientId;
      const targetPos = e.detail?.pos;
      if (clientId !== null && clientId !== undefined && !isNaN(Number(clientId))) {
        const numId = Number(clientId);
        triggerFocusOnObject(numId, true);
        if (targetPos) {
          center3DViewOnObject(numId, targetPos);
        }
      }
    } catch (_) {}
  });

  window.addEventListener("CVAT_EXT_REQ_SET_STICKY_TRACK_LOCK", (e: any) => {
    try {
      const enabled = e.detail?.enabled;
      if (typeof enabled === "boolean") {
        autoCenterOnFrameChange = enabled;
      }
    } catch (_) {}
  });

  window.addEventListener("CVAT_EXT_REQ_REFRESH_EDGE_CONTACTS", () => {
    calculateAndBroadcastBoxEdgeContacts();
  });
}
