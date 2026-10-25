/**
 * TẦNG CẦU NỐI REDUX STORE & REACT FIBER NATIVE CVAT
 * Cung cấp các hàm tương tác trực tiếp với Redux Store, Annotation Job Instance,
 * cập nhật Sidebar DOM O(1) và đánh dấu trạng thái Unsaved chuẩn xác.
 */

let cachedReduxStore: any = null;

/**
 * Lấy Redux Store từ React Fiber root container (Cache O(1) chống quét DOM Fiber nhiều lần)
 */
export function getReduxStore(): any {
  if (cachedReduxStore && typeof cachedReduxStore.getState === "function") {
    return cachedReduxStore;
  }
  if (typeof window !== "undefined" && (window as any).__cvat_redux_store__) {
    cachedReduxStore = (window as any).__cvat_redux_store__;
    return cachedReduxStore;
  }
  if (typeof document === "undefined") return null;
  const rootEl = document.getElementById("root");
  if (!rootEl) return null;
  const rKey = Object.keys(rootEl).find(
    (k) => k.startsWith("__reactContainer$") || k.startsWith("__reactFiber$")
  );
  if (!rKey) return null;
  let rNode = (rootEl as any)[rKey];
  while (rNode) {
    if (rNode.memoizedProps?.store) {
      cachedReduxStore = rNode.memoizedProps.store;
      return cachedReduxStore;
    }
    if (rNode.stateNode?.store) {
      cachedReduxStore = rNode.stateNode.store;
      return cachedReduxStore;
    }
    rNode = rNode.child;
  }
  return null;
}

/**
 * Lấy Job Instance thật đang gắn liền với ứng dụng CVAT UI
 */
export async function getActiveJobInstance(_jobId?: number): Promise<any> {
  const store = getReduxStore();
  const storeJob = store?.getState()?.annotation?.job?.instance;
  if (storeJob) {
    return storeJob;
  }
  return null;
}

export const mainWorldLabelsCache = new Map<number, { name: string; color: string }>();

let lastHighlightedSidebarItem: HTMLElement | null = null;

/**
 * Tối ưu O(1) Class Swap cho DOM Sidebar của CVAT (Loại bỏ hoàn toàn querySelectorAll trên cả danh sách)
 */
export function syncSidebarItemHighlight(id: number | null): void {
  try {
    if (id === null || id <= 0) {
      if (lastHighlightedSidebarItem) {
        lastHighlightedSidebarItem.classList.remove("cvat-objects-sidebar-state-item-active", "selected");
        lastHighlightedSidebarItem = null;
      }
      return;
    }

    const sidebarItem =
      document.querySelector<HTMLElement>(`#cvat-objects-sidebar-state-item-${id}`) ||
      document.querySelector<HTMLElement>(`[data-cvat-state-item-id="${id}"]`) ||
      document.querySelector<HTMLElement>(`[class*="cvat-objects-sidebar-state-item"][id*="${id}"]`);

    if (sidebarItem) {
      if (lastHighlightedSidebarItem && lastHighlightedSidebarItem !== sidebarItem) {
        lastHighlightedSidebarItem.classList.remove("cvat-objects-sidebar-state-item-active", "selected");
      }
      sidebarItem.classList.add("cvat-objects-sidebar-state-item-active", "selected");
      lastHighlightedSidebarItem = sidebarItem;
      sidebarItem.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  } catch (_) {}
}

/**
 * Cập nhật bộ nhớ đệm nhãn của Main World từ Job / Redux Store
 */
export function updateMainWorldLabels(job?: any): void {
  try {
    const store = getReduxStore();
    const state = store?.getState?.();
    const storeJob = state?.annotation?.job?.instance || job;
    const candidates = [
      storeJob?.labels,
      storeJob?.task?.labels,
      state?.annotation?.job?.labels,
      state?.annotation?.job?.task?.labels,
      state?.annotation?.canvas?.instance?.setup?.labels,
    ];
    for (const labels of candidates) {
      if (Array.isArray(labels)) {
        for (const l of labels) {
          if (l && l.id !== undefined) {
            mainWorldLabelsCache.set(Number(l.id), {
              name: l.name || "Object",
              color: l.color || "#3b82f6",
            });
          }
        }
      }
    }
  } catch (_) {}
}

/**
 * Tra cứu nhãn và màu sắc chuẩn của đối tượng
 */
export function resolveLabelName(stateOrShape: any): { name: string; color: string } {
  if (!stateOrShape) return { name: "Object", color: "#22c55e" };

  if (stateOrShape?.label && typeof stateOrShape.label.name === "string" && stateOrShape.label.name.trim()) {
    return {
      name: stateOrShape.label.name.trim(),
      color: stateOrShape.label.color || "#22c55e",
    };
  }
  if (stateOrShape?.data?.label && typeof stateOrShape.data.label.name === "string" && stateOrShape.data.label.name.trim()) {
    return {
      name: stateOrShape.data.label.name.trim(),
      color: stateOrShape.data.label.color || "#22c55e",
    };
  }

  const lblId =
    stateOrShape?.labelID ??
    stateOrShape?.labelId ??
    stateOrShape?.label_id ??
    stateOrShape?.label?.id ??
    stateOrShape?.data?.labelID ??
    stateOrShape?.data?.labelId ??
    stateOrShape?.data?.label?.id;

  if (lblId !== undefined) {
    if (!mainWorldLabelsCache.has(Number(lblId))) {
      updateMainWorldLabels();
    }
    if (mainWorldLabelsCache.has(Number(lblId))) {
      return mainWorldLabelsCache.get(Number(lblId))!;
    }
  }

  const clientId = stateOrShape?.clientID ?? stateOrShape?.clientId ?? stateOrShape?.id;
  if (clientId !== undefined && typeof document !== "undefined") {
    try {
      const sidebarItem =
        document.querySelector<HTMLElement>(`#cvat-objects-sidebar-state-item-${clientId}`) ||
        document.querySelector<HTMLElement>(`[class*="cvat-objects-sidebar-state-item"][id*="${clientId}"]`);
      if (sidebarItem) {
        const labelEl =
          sidebarItem.querySelector<HTMLElement>(".cvat-objects-sidebar-state-item-label-selector .ant-select-selection-item") ||
          sidebarItem.querySelector<HTMLElement>(".ant-select-selection-item") ||
          sidebarItem.querySelector<HTMLElement>(".cvat-text");
        if (labelEl && labelEl.textContent) {
          return { name: labelEl.textContent.trim(), color: "#22c55e" };
        }
      }
    } catch (_) {}
  }

  return { name: "Object", color: "#22c55e" };
}

/**
 * Chuẩn hóa các cấu trúc đa hình (Array, Map, Set, Object dictionary) thành mảng thuần túy
 */
export function toArray(val: any): any[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (val instanceof Map || val instanceof Set) return Array.from(val.values());
  if (typeof val === "object") {
    const values = Object.values(val);
    if (values.length > 0 && typeof values[0] === "object") return values;
  }
  return [];
}

/**
 * Trích xuất danh sách Track từ Job cvat-core theo cơ chế đa tầng
 */
export function getJobTrackCollection(job: any): any[] {
  if (!job) return [];
  const list: any[] = [];
  const anno = job.annotations;
  if (anno) {
    const col = (anno as any)._collection || (anno as any).collection;
    if (col) {
      list.push(...toArray(col.tracks));
    }
  }
  if ((job as any).tracks) {
    list.push(...toArray((job as any).tracks));
  }

  try {
    const store = getReduxStore();
    const storeJob = store?.getState()?.annotation?.job?.instance;
    const storeCol = storeJob?.annotations?._collection || storeJob?.annotations?.collection;
    if (storeCol) {
      list.push(...toArray(storeCol.tracks));
    }
  } catch (e) {}

  return list;
}

/**
 * Tìm đối tượng Track cha trong Job cvat-core theo mọi tiêu chí nhận diện
 */
export async function findTrackInJob(
  job: any,
  uiId: number,
  serverId?: number,
  parentID?: number
): Promise<any | null> {
  if (!job) return null;

  if (!parentID && job.annotations) {
    try {
      const curFrame = typeof job.frame === "number" ? job.frame : 0;
      const curStates = await job.annotations.get(curFrame);
      if (Array.isArray(curStates)) {
        const curSt = curStates.find(
          (s: any) =>
            Number(s.clientID) === Number(uiId) ||
            (serverId && Number(s.serverID) === Number(serverId))
        );
        if (curSt) {
          parentID = curSt.parentID || curSt.trackID || (curSt.parent && curSt.parent.clientID);
        }
      }
    } catch (e) {}
  }

  const tracks = getJobTrackCollection(job);
  if (tracks && tracks.length > 0) {
    let found = tracks.find(
      (t: any) =>
        Number(t.clientID) === Number(uiId) ||
        Number(t.id) === Number(uiId) ||
        String(t.clientID) === String(uiId)
    );
    if (found) return found;

    if (serverId) {
      found = tracks.find(
        (t: any) =>
          Number(t.serverID) === Number(serverId) ||
          String(t.serverID) === String(serverId)
      );
      if (found) return found;
    }

    if (parentID) {
      found = tracks.find(
        (t: any) =>
          Number(t.clientID) === Number(parentID) ||
          Number(t.id) === Number(parentID) ||
          String(t.clientID) === String(parentID)
      );
      if (found) return found;
    }

    found = tracks.find((t: any) => {
      const shList = toArray(t.shapes || t.keyframes || (t as any)._shapes);
      return shList.some(
        (sh: any) =>
          Number(sh.clientID) === Number(uiId) ||
          (serverId && Number(sh.serverID) === Number(serverId)) ||
          (sh.parentID && Number(sh.parentID) === Number(uiId))
      );
    });
    if (found) return found;
  }

  if (job.annotations) {
    try {
      const allObjects = await job.annotations.get(null, true);
      if (Array.isArray(allObjects)) {
        let found = allObjects.find(
          (t: any) =>
            Number(t.clientID) === Number(uiId) ||
            Number(t.id) === Number(uiId) ||
            (serverId && Number(t.serverID) === Number(serverId)) ||
            (parentID && (Number(t.clientID) === Number(parentID) || Number(t.id) === Number(parentID)))
        );
        if (found) return found;
      }
    } catch (e) {}

    try {
      const defaultTracks = await job.annotations.get();
      if (Array.isArray(defaultTracks)) {
        let found = defaultTracks.find(
          (t: any) =>
            Number(t.clientID) === Number(uiId) ||
            Number(t.id) === Number(uiId) ||
            (serverId && Number(t.serverID) === Number(serverId)) ||
            (parentID && (Number(t.clientID) === Number(parentID) || Number(t.id) === Number(parentID)))
        );
        if (found) return found;
      }
    } catch (e) {}
  }

  return null;
}

/**
 * Kích hoạt chế độ "Đã sửa nhưng chưa lưu" chuẩn xác trên CVAT Native
 */
export function markCvatSaveButtonUnsaved(job?: any): void {
  try {
    (window as any).__CVAT_HAS_UNSAVED_CHANGES__ = true;

    const activeJob = job || getReduxStore()?.getState()?.annotation?.job?.instance;
    if (activeJob && activeJob.annotations) {
      const col = (activeJob.annotations as any)._collection || (activeJob.annotations as any).collection;
      if (col) {
        col._isModified = true;
      }
    }

    const store = getReduxStore();
    if (store && typeof store.dispatch === "function") {
      try {
        const historyState = store.getState()?.annotation?.annotations?.history || {};
        store.dispatch({
          type: "UPDATE_ANNOTATIONS_SUCCESS",
          payload: {
            history: historyState,
          },
        });
      } catch (_) {
        try {
          store.dispatch({ type: "CHANGE_ANNOTATIONS" });
        } catch (__) {}
      }
    }

    const cvatSaveBtn = document.querySelector<HTMLButtonElement>(
      "button.cvat-annotation-header-save-button, .cvat-annotation-header-save-button, button[aria-label='Save annotations']"
    );
    if (cvatSaveBtn) {
      cvatSaveBtn.disabled = false;
      cvatSaveBtn.removeAttribute("disabled");
      cvatSaveBtn.classList.remove("cvat-disabled-button");
      cvatSaveBtn.style.opacity = "1";
      cvatSaveBtn.style.cursor = "pointer";
    }
  } catch (e) {}
}

export const markCvatUnsavedInReduxAndCore = markCvatSaveButtonUnsaved;

/**
 * Đồng bộ và lưu lên cơ sở dữ liệu CVAT bằng cvat-core API
 */
export async function persistJobAnnotations(job: any): Promise<void> {
  try {
    if (job && typeof job.annotations?.save === "function") {
      await job.annotations.save();
      (window as any).__CVAT_HAS_UNSAVED_CHANGES__ = false;
    }
  } catch (err) {
    console.warn("[CVAT 3D Suite] Lỗi lưu annotations:", err);
  }
}

/**
 * Trích xuất attributes dạng Object dictionary
 */
export function parseObjectAttributes(rawAttrs: any): Record<string, any> {
  const result: Record<string, any> = {};
  if (!rawAttrs) return result;
  if (Array.isArray(rawAttrs)) {
    for (const a of rawAttrs) {
      if (a && a.spec && a.spec.name) {
        result[a.spec.name] = a.value;
      } else if (a && a.name) {
        result[a.name] = a.value;
      }
    }
  } else if (typeof rawAttrs === "object") {
    Object.assign(result, rawAttrs);
  }
  return result;
}
