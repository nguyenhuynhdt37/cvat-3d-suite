/**
 * ⚡ SIÊU TỐI ƯU HIỆU NĂNG 60 FPS: PROTOTYPE RAYCAST GUARD & SCENE.ADD INTERCEPTION
 * Vô hiệu hóa raycast va chạm trên mây 305k điểm LiDAR ở cấp độ Prototype của Three.js
 * Đảm bảo 100% mọi thể hiện THREE.Points ở MỌI FRAME, MỌI VIEW (Perspective, Top, Side, Front)
 * sinh ra bất kỳ lúc nào đều có raycast = () => {} NGAY LẬP TỨC từ miligiây đầu tiên!
 */

export function guardPointsInstance(obj: any): void {
  if (!obj) return;
  if (!(obj as any).__cvat_raycast_guarded__) {
    (obj as any).__cvat_raycast_guarded__ = true;
    obj.raycast = () => {};
  }
  try {
    const proto = Object.getPrototypeOf(obj);
    if (proto && !(proto as any).__cvat_proto_guarded__) {
      (proto as any).__cvat_proto_guarded__ = true;
      proto.raycast = () => {};
    }
    if (obj.constructor && obj.constructor.prototype && !(obj.constructor.prototype as any).__cvat_proto_guarded__) {
      (obj.constructor.prototype as any).__cvat_proto_guarded__ = true;
      obj.constructor.prototype.raycast = () => {};
    }
  } catch (_) {}
}

export function installGlobalThreeRaycastGuard(target?: any, getReduxStore?: () => any): void {
  try {
    const candidates: any[] = [];
    if (target) candidates.push(target);
    if (typeof window !== "undefined") {
      const win = window as any;
      if (win.THREE) candidates.push(win.THREE);
      if (win.__THREE__) candidates.push(win.__THREE__);
    }
    try {
      const store = getReduxStore ? getReduxStore() : (window as any).__cvat_redux_store__;
      const canvas = store?.getState()?.annotation?.canvas?.instance;
      if (canvas?.THREE) candidates.push(canvas.THREE);
      if (canvas?.view?.THREE) candidates.push(canvas.view.THREE);
      if (canvas?.view?.rayCaster) candidates.push(canvas.view.rayCaster);
      if (canvas?.view?.views) {
        for (const k of ["perspective", "top", "side", "front"]) {
          const v = canvas.view.views[k];
          if (v?.THREE) candidates.push(v.THREE);
          if (v?.renderer?.constructor) candidates.push(v.renderer.constructor);
          if (v?.scene) candidates.push(v.scene);
          if (v?.rayCaster) candidates.push(v.rayCaster);
          if (v?.controls?.raycaster) candidates.push(v.controls.raycaster);
        }
      }
    } catch (_) {}

    for (const cand of candidates) {
      if (!cand) continue;

      // A. Xử lý Points Constructor / Prototype
      let PointsCtor = cand.Points;
      if (!PointsCtor) {
        if (typeof cand === "function" && (cand.name === "Points" || cand.prototype?.isPoints)) {
          PointsCtor = cand;
        } else if (cand.isPoints && cand.constructor) {
          PointsCtor = cand.constructor;
        }
      }

      if (PointsCtor && PointsCtor.prototype && !(PointsCtor.prototype as any).__cvat_proto_guarded__) {
        (PointsCtor.prototype as any).__cvat_proto_guarded__ = true;
        PointsCtor.prototype.raycast = () => {};
        try {
          Object.defineProperty(PointsCtor.prototype, "raycast", {
            value: () => {},
            writable: true,
            configurable: true,
          });
        } catch (_) {}
      }

      // B. Xử lý Raycaster Instance & Prototype (Vô hiệu hóa va chạm trên mây 305k điểm)
      let RaycasterCtor = cand.Raycaster;
      if (!RaycasterCtor) {
        if (typeof cand === "function" && cand.name === "Raycaster") {
          RaycasterCtor = cand;
        } else if (cand.intersectObjects && cand.constructor) {
          RaycasterCtor = cand.constructor;
        }
      }

      // Khóa trực tiếp trên Raycaster instance nếu cand là một instance
      if (cand && typeof cand.intersectObject === "function" && !(cand as any).__cvat_instance_guarded__) {
        (cand as any).__cvat_instance_guarded__ = true;
        const origInstIntersectObject = cand.intersectObject;
        cand.intersectObject = function (object: any, recursive?: boolean, optionalTarget?: any) {
          if (object && (object.isPoints || object.type === "Points")) {
            return optionalTarget || [];
          }
          return origInstIntersectObject.call(this, object, recursive, optionalTarget);
        };
        const origInstIntersectObjects = cand.intersectObjects;
        cand.intersectObjects = function (objects: any[], recursive?: boolean, optionalTarget?: any) {
          if (!Array.isArray(objects)) return optionalTarget || [];
          const filtered = objects.filter((o: any) => o && !o.isPoints && o.type !== "Points");
          return origInstIntersectObjects.call(this, filtered, recursive, optionalTarget);
        };
      }

      if (RaycasterCtor && RaycasterCtor.prototype && !(RaycasterCtor.prototype as any).__cvat_proto_guarded__) {
        (RaycasterCtor.prototype as any).__cvat_proto_guarded__ = true;
        const origIntersectObject = RaycasterCtor.prototype.intersectObject;
        RaycasterCtor.prototype.intersectObject = function (object: any, recursive?: boolean, optionalTarget?: any) {
          if (object && (object.isPoints || object.type === "Points")) {
            return optionalTarget || [];
          }
          return origIntersectObject.call(this, object, recursive, optionalTarget);
        };

        const origIntersectObjects = RaycasterCtor.prototype.intersectObjects;
        RaycasterCtor.prototype.intersectObjects = function (objects: any[], recursive?: boolean, optionalTarget?: any) {
          if (!Array.isArray(objects)) return optionalTarget || [];
          const filtered = objects.filter((o: any) => o && !o.isPoints && o.type !== "Points");
          return origIntersectObjects.call(this, filtered, recursive, optionalTarget);
        };
      }
    }
  } catch (_) {}
}

export function hookSceneForPointsGuard(scene: any): void {
  if (!scene) return;

  // A. Intercept Object3D.prototype.add: Đón đầu 100% mọi thể hiện Points được thêm vào bất kỳ container nào
  try {
    const sceneProto = Object.getPrototypeOf(scene);
    const obj3dProto = sceneProto ? Object.getPrototypeOf(sceneProto) : null;
    if (obj3dProto && typeof obj3dProto.add === "function" && !(obj3dProto as any).__cvat_obj3d_add_guarded__) {
      (obj3dProto as any).__cvat_obj3d_add_guarded__ = true;
      const origObj3dAdd = obj3dProto.add;
      obj3dProto.add = function (...objects: any[]) {
        for (const item of objects) {
          if (item) {
            if (item.isPoints || item.type === "Points") {
              guardPointsInstance(item);
              installGlobalThreeRaycastGuard(item);
            }
            if (typeof item.traverse === "function") {
              item.traverse((child: any) => {
                if (child && (child.isPoints || child.type === "Points")) {
                  guardPointsInstance(child);
                  installGlobalThreeRaycastGuard(child);
                }
              });
            }
          }
        }
        return origObj3dAdd.apply(this, objects);
      };
    }
  } catch (_) {}

  if (typeof scene.traverse === "function") {
    scene.traverse((obj: any) => {
      if (obj && (obj.isPoints || obj.type === "Points")) {
        guardPointsInstance(obj);
        installGlobalThreeRaycastGuard(obj);
      }
    });
  }

  if (typeof scene.add === "function" && !(scene as any).__cvat_add_guarded__) {
    (scene as any).__cvat_add_guarded__ = true;
    const origAdd = scene.add;
    scene.add = function (...objects: any[]) {
      for (const item of objects) {
        if (item) {
          if (item.isPoints || item.type === "Points") {
            guardPointsInstance(item);
            installGlobalThreeRaycastGuard(item);
          }
          if (typeof item.traverse === "function") {
            item.traverse((child: any) => {
              if (child && (child.isPoints || child.type === "Points")) {
                guardPointsInstance(child);
                installGlobalThreeRaycastGuard(child);
              }
            });
          }
        }
      }
      return origAdd.apply(this, objects);
    };
  }
}

export function hookAllScenes(getReduxStore?: () => any): void {
  try {
    const store = getReduxStore ? getReduxStore() : (window as any).__cvat_redux_store__;
    const canvas = store?.getState()?.annotation?.canvas?.instance;
    const scenes: any[] = [];
    if (canvas?.view?.views) {
      for (const k of ["perspective", "top", "side", "front"]) {
        const s = canvas.view.views[k]?.scene;
        if (s && !scenes.includes(s)) scenes.push(s);
      }
    }
    if (canvas?.view?.scene && !scenes.includes(canvas.view.scene)) scenes.push(canvas.view.scene);
    if (canvas?.scene && !scenes.includes(canvas.scene)) scenes.push(canvas.scene);

    for (const sc of scenes) {
      hookSceneForPointsGuard(sc);
    }
  } catch (_) {}
}
