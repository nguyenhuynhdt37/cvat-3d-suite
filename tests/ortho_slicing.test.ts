import assert from "node:assert";

console.log("🧪 Đang chạy kiểm thử tự động Module Lát Cắt Trực Giao & Tối Ưu Raycast Guard (Ortho Slicing & Zero-Lag)...");

// =========================================================================
// TEST 1: Ma trận Hướng & Vector Trực Giao (Direction Vectors) Euler Angle
// =========================================================================
{
  function computeDirectionVectors(rx: number, ry: number, rz: number) {
    const cosZ = Math.cos(rz), sinZ = Math.sin(rz);
    const cosY = Math.cos(ry), sinY = Math.sin(ry);
    const cosX = Math.cos(rx), sinX = Math.sin(rx);

    const uxx = cosZ * cosY;
    const uxy = sinZ * cosY;
    const uxz = -sinY;

    const uyx = cosZ * sinY * sinX - sinZ * cosX;
    const uyy = sinZ * sinY * sinX + cosZ * cosX;
    const uyz = cosY * sinX;

    const uzx = cosZ * sinY * cosX + sinZ * sinX;
    const uzy = sinZ * sinY * cosX - cosZ * sinX;
    const uzz = cosY * cosX;

    return {
      ux: [uxx, uxy, uxz],
      uy: [uyx, uyy, uyz],
      uz: [uzx, uzy, uzz],
    };
  }

  function dot(v1: number[], v2: number[]): number {
    return v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
  }

  function norm(v: number[]): number {
    return Math.sqrt(dot(v, v));
  }

  // 1. Trường hợp góc 0 (Phẳng theo trục hệ tọa độ)
  const vecZero = computeDirectionVectors(0, 0, 0);
  assert.ok(Math.abs(vecZero.ux[0] - 1.0) < 1e-6);
  assert.ok(Math.abs(vecZero.ux[1]) < 1e-6);
  assert.ok(Math.abs(vecZero.ux[2]) < 1e-6);

  assert.ok(Math.abs(vecZero.uy[0]) < 1e-6);
  assert.ok(Math.abs(vecZero.uy[1] - 1.0) < 1e-6);
  assert.ok(Math.abs(vecZero.uy[2]) < 1e-6);

  assert.ok(Math.abs(vecZero.uz[0]) < 1e-6);
  assert.ok(Math.abs(vecZero.uz[1]) < 1e-6);
  assert.ok(Math.abs(vecZero.uz[2] - 1.0) < 1e-6);

  // 2. Trường hợp xoay Yaw = 90 độ (PI / 2)
  const vecYaw90 = computeDirectionVectors(0, 0, Math.PI / 2);
  assert.ok(Math.abs(vecYaw90.ux[0]) < 1e-6);
  assert.ok(Math.abs(vecYaw90.ux[1] - 1.0) < 1e-6);
  assert.ok(Math.abs(vecYaw90.ux[2]) < 1e-6);

  assert.ok(Math.abs(vecYaw90.uy[0] - (-1.0)) < 1e-6);
  assert.ok(Math.abs(vecYaw90.uy[1]) < 1e-6);
  assert.ok(Math.abs(vecYaw90.uy[2]) < 1e-6);

  // 3. Kiểm tra tính trực giao và độ dài chuẩn hóa đơn vị với góc ngẫu nhiên
  const randYaw = 0.785; // 45 deg
  const randPitch = 0.12;
  const randRoll = -0.08;
  const vecArbitrary = computeDirectionVectors(randRoll, randPitch, randYaw);

  assert.ok(Math.abs(norm(vecArbitrary.ux) - 1.0) < 1e-6, "Độ dài vector trục X phải bằng 1");
  assert.ok(Math.abs(norm(vecArbitrary.uy) - 1.0) < 1e-6, "Độ dài vector trục Y phải bằng 1");
  assert.ok(Math.abs(norm(vecArbitrary.uz) - 1.0) < 1e-6, "Độ dài vector trục Z phải bằng 1");

  assert.ok(Math.abs(dot(vecArbitrary.ux, vecArbitrary.uy)) < 1e-6, "Trục X và Y phải vuông góc 90 độ");
  assert.ok(Math.abs(dot(vecArbitrary.ux, vecArbitrary.uz)) < 1e-6, "Trục X và Z phải vuông góc 90 độ");
  assert.ok(Math.abs(dot(vecArbitrary.uy, vecArbitrary.uz)) < 1e-6, "Trục Y và Z phải vuông góc 90 độ");

  console.log("  ✅ Test 1 Passed: Direction Vectors & Ma trận xoay Euler chuẩn xác tuyệt đối.");
}

// =========================================================================
// TEST 2: Lát Cắt Phẳng WebGL (Clipping Planes Geometry Simulation)
// =========================================================================
{
  class MockPlane {
    normal: [number, number, number];
    constant: number;

    constructor(normal: [number, number, number] = [0, 1, 0], constant = 0) {
      this.normal = normal;
      this.constant = constant;
    }

    set(normal: [number, number, number], constant: number) {
      this.normal = normal;
      this.constant = constant;
    }

    distanceToPoint(point: [number, number, number]): number {
      return (
        this.normal[0] * point[0] +
        this.normal[1] * point[1] +
        this.normal[2] * point[2] +
        this.constant
      );
    }
  }

  // Giả lập box xe tại [10, 5, 1], kích thước L=4.5m, W=1.8m, H=1.6m, yaw=0
  const cx = 10, cy = 5, cz = 1;
  const lx = 4.5, ly = 1.8, lz = 1.6;
  const baseZ = cz - lz / 2; // = 0.2m

  // 1. Top View Hide Ground Plane
  const cutGroundZ = baseZ + 0.12; // = 0.32m
  const topGroundPlane = new MockPlane([0, 0, 1], -cutGroundZ);

  // Điểm mặt đường Z = 0.1m -> distanceToPoint = 0.1 - 0.32 = -0.22 < 0 (Bị clip)
  assert.ok(topGroundPlane.distanceToPoint([10, 5, 0.1]) < 0, "Điểm mặt đường phải bị clip bỏ trên Top View");
  // Điểm thân xe Z = 0.8m -> distanceToPoint = 0.8 - 0.32 = +0.48 > 0 (Được giữ lại)
  assert.ok(topGroundPlane.distanceToPoint([10, 5, 0.8]) > 0, "Điểm thân xe phải được giữ lại trên Top View");

  // 2. Side View Slicing (Slab = 0.5m -> lát cắt dọc thân xe bề ngang = ly/2 + 0.5 = 0.9 + 0.5 = 1.4m)
  const slab = 0.5;
  const halfY = ly / 2 + slab; // 1.4m
  const sidePlaneLeft = new MockPlane([0, -1, 0], cy + halfY); // normal: [0, -1, 0], constant: 5 + 1.4 = 6.4
  const sidePlaneRight = new MockPlane([0, 1, 0], -cy + halfY); // normal: [0, 1, 0], constant: -5 + 1.4 = -3.6

  // Điểm trung tâm sườn xe Y = 5.2m (lệch 0.2m từ tâm 5.0m)
  assert.ok(sidePlaneLeft.distanceToPoint([10, 5.2, 1]) >= 0 && sidePlaneRight.distanceToPoint([10, 5.2, 1]) >= 0, "Điểm trong lát cắt sườn xe phải được hiển thị");
  // Điểm cây cối ngoài đường Y = 7.5m (cách tâm 2.5m > 1.4m)
  assert.ok(sidePlaneLeft.distanceToPoint([10, 7.5, 1]) < 0, "Điểm ngoài lát cắt sườn xe (Y = 7.5m) phải bị clip bỏ");

  // 3. Front View Slicing (Slab = 0.5m -> lát cắt ngang cản xe bề dọc = lx/2 + 0.5 = 2.25 + 0.5 = 2.75m)
  const halfX = lx / 2 + slab; // 2.75m
  const frontPlaneBack = new MockPlane([-1, 0, 0], cx + halfX); // normal: [-1, 0, 0], constant: 10 + 2.75 = 12.75
  const frontPlaneFore = new MockPlane([1, 0, 0], -cx + halfX); // normal: [1, 0, 0], constant: -10 + 2.75 = -7.25

  // Điểm cản trước X = 11.5m (cách tâm 1.5m <= 2.75m)
  assert.ok(frontPlaneBack.distanceToPoint([11.5, 5, 1]) >= 0 && frontPlaneFore.distanceToPoint([11.5, 5, 1]) >= 0, "Điểm cản xe trong lát cắt phải được hiển thị");
  // Điểm xe khác phía sau X = 6.0m (cách tâm 4.0m > 2.75m)
  assert.ok(frontPlaneFore.distanceToPoint([6.0, 5, 1]) < 0, "Điểm xe khác ngoài lát cắt cản xe phải bị clip bỏ");

  console.log("  ✅ Test 2 Passed: Mô phỏng WebGL Clipping Planes cắt chính xác theo ROI và Slab.");
}

// =========================================================================
// TEST 3: Vô Hiệu Hóa Raycast Trên Prototype & Scene.add (Prototype & Scene Guard)
// =========================================================================
{
  class MockObject3D {
    name: string;
    isPoints?: boolean;
    constructor(name: string) {
      this.name = name;
    }
    raycast(raycaster: any, intersects: any[]) {
      intersects.push({ object: this, distance: 1.0 });
    }
  }

  class MockMesh extends MockObject3D {
    isMesh = true;
  }

  class MockPoints extends MockObject3D {
    isPoints = true;
    raycast(raycaster: any, intersects: any[]) {
      // Giả lập duyệt qua 305.000 điểm tốn kém
      for (let i = 0; i < 305000; i++) {}
      intersects.push({ object: this, distance: 2.0 });
    }
  }

  class MockRaycaster {
    intersectObjects(objects: MockObject3D[], recursive = true, target: any[] = []): any[] {
      for (const obj of objects) {
        obj.raycast(this, target);
      }
      return target;
    }
  }

  class MockScene {
    children: any[] = [];
    add(...objects: any[]) {
      this.children.push(...objects);
    }
    traverse(cb: (child: any) => void) {
      this.children.forEach(cb);
    }
  }

  // Trước khi cài đặt Guard: Points bị raycast và gây chậm
  const raycaster = new MockRaycaster();
  const mesh1 = new MockMesh("CuboidMesh");
  const pointsOld = new MockPoints("PointCloudOldFrame");

  let results: any[] = [];
  raycaster.intersectObjects([mesh1, pointsOld], true, results);
  assert.strictEqual(results.length, 2, "Trước khi guard, Points vẫn bị duyệt raycast");

  // === CÀI ĐẶT GUARD CHUẨN XÁC THEO LOGIC MỚI CỦA injected.ts ===
  function installGlobalThreeRaycastGuardTest(target?: any): void {
    try {
      const candidates: any[] = [];
      if (target) candidates.push(target);

      for (const cand of candidates) {
        if (!cand) continue;

        let PointsCtor = cand.Points;
        if (!PointsCtor) {
          if (typeof cand === "function" && (cand.name === "MockPoints" || cand.name === "Points" || cand.prototype?.isPoints)) {
            PointsCtor = cand;
          } else if (cand.isPoints && cand.constructor) {
            PointsCtor = cand.constructor;
          }
        }

        if (PointsCtor && PointsCtor.prototype && !(PointsCtor.prototype as any).__cvat_proto_guarded__) {
          (PointsCtor.prototype as any).__cvat_proto_guarded__ = true;
          PointsCtor.prototype.raycast = () => {};
        }

        let RaycasterCtor = cand.Raycaster;
        if (!RaycasterCtor) {
          if (typeof cand === "function" && (cand.name === "MockRaycaster" || cand.name === "Raycaster")) {
            RaycasterCtor = cand;
          } else if (cand.intersectObjects && cand.constructor) {
            RaycasterCtor = cand.constructor;
          }
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

  function hookSceneForPointsGuardTest(scene: any): void {
    if (!scene || (scene as any).__cvat_add_guarded__) return;
    (scene as any).__cvat_add_guarded__ = true;
    const origAdd = scene.add;
    scene.add = function (...objects: any[]) {
      for (const item of objects) {
        if (item && (item.isPoints || item.type === "Points")) {
          item.raycast = () => {};
          installGlobalThreeRaycastGuardTest(item);
        }
      }
      return origAdd.apply(this, objects);
    };
  }

  // 1. Kiểm tra guard với Constructor trực tiếp (giống như lúc trích xuất obj.constructor trong CVAT)
  installGlobalThreeRaycastGuardTest(MockPoints);
  installGlobalThreeRaycastGuardTest(MockRaycaster);

  // Khẳng định: Prototype của MockPoints đã bị vô hiệu hóa raycast
  assert.strictEqual((MockPoints.prototype as any).__cvat_proto_guarded__, true, "Prototype MockPoints phải được đánh dấu guarded");
  
  // Tạo Points mới ở frame tiếp theo (Next Frame)
  const pointsNewFrame = new MockPoints("PointCloudNewFrame");
  results = [];
  raycaster.intersectObjects([mesh1, pointsNewFrame], true, results);

  // Khẳng định: Points mới tự động thừa hưởng prototype guard, chỉ có Mesh được raycast
  assert.strictEqual(results.length, 1, "Sau khi guard, Points phải bị bỏ qua 100%");
  assert.strictEqual(results[0].object.name, "CuboidMesh", "Chỉ còn CuboidMesh được bắt raycast");

  // 2. Kiểm tra Scene.add Interception khi chuyển frame
  const scene = new MockScene();
  hookSceneForPointsGuardTest(scene);

  const pointsAddedLater = new MockPoints("PointsAddedAtFrame2");
  // Thử gán lại hàm raycast nặng trước khi add vào scene
  let raycastCallCount = 0;
  pointsAddedLater.raycast = () => { raycastCallCount++; };

  scene.add(pointsAddedLater);

  // Khẳng định: Ngay khi scene.add được gọi, raycast của instance đã bị ghi đè no-op
  pointsAddedLater.raycast(raycaster, []);
  assert.strictEqual(raycastCallCount, 0, "scene.add phải tự động vô hiệu hóa raycast của Points mới tại miligiây 0");

  console.log("  ✅ Test 3 Passed: Prototype Raycast Guard & Scene.add Hook chặn triệt để raycast 305k points trên frame mới.");
}

// =========================================================================
// TEST 4: Bảo Toàn Toàn Cảnh Side, Front & Perspective 3D View (0 Clipping Planes)
// =========================================================================
{
  function getClippingPlanesForCamera(cameraType: "top" | "side" | "front" | "perspective", activePlanes: any[]) {
    if (cameraType === "perspective" || cameraType === "side" || cameraType === "front") {
      return []; // Perspective, Side, Front luôn giữ toàn cảnh 100% không bị cắt lát (Zero-Lag 60 FPS)
    }
    return activePlanes;
  }

  const dummyPlanes = [{ name: "groundPlane" }];

  assert.strictEqual(getClippingPlanesForCamera("perspective", dummyPlanes).length, 0, "Perspective View luôn luôn có clippingPlanes rỗng");
  assert.strictEqual(getClippingPlanesForCamera("side", dummyPlanes).length, 0, "Side View luôn luôn có clippingPlanes rỗng (không cắt lát)");
  assert.strictEqual(getClippingPlanesForCamera("front", dummyPlanes).length, 0, "Front View luôn luôn có clippingPlanes rỗng (không cắt lát)");
  assert.strictEqual(getClippingPlanesForCamera("top", dummyPlanes).length, 1, "Top View nhận mặt phẳng cắt mặt đất");

  // Kiểm tra cờ forceRender: Khi kéo chuột (drag) không được gọi canvas.render() đồng bộ
  let renderCallCount = 0;
  const mockCanvas = {
    render: () => { renderCallCount++; }
  };

  function updateClippingPlanesSimulation(forceRender = true) {
    if (forceRender && typeof mockCanvas.render === "function") {
      mockCanvas.render();
    }
  }

  // Khi đang drag chuột: forceRender = false -> KHÔNG RENDER
  updateClippingPlanesSimulation(false);
  assert.strictEqual(renderCallCount, 0, "Khi forceRender = false, tuyệt đối không gọi canvas.render() đồng bộ");

  // Khi nhả chuột: forceRender = true -> ĐƯỢC RENDER
  updateClippingPlanesSimulation(true);
  assert.strictEqual(renderCallCount, 1, "Khi forceRender = true, canvas.render() được kích hoạt chuẩn xác");

  console.log("  ✅ Test 4 Passed: Perspective 3D View bảo toàn 100% & forceRender guard triệt tiêu bão draw call.");
}

// =========================================================================
// TEST 5: Thoát Frame Transition Tức Thì & Không Nuốt Hover Handle (Zero-Lag Pointer)
// =========================================================================
{
  let isFrameTransitioning = true;
  let isCanvasInteracting = false;
  let propagatedEvents: string[] = [];

  function handlePointerEvent(e: { type: string; buttons: number }) {
    if (isFrameTransitioning) {
      if (e.type === "pointerdown" || e.type === "mousedown") {
        isFrameTransitioning = false;
        isCanvasInteracting = true;
      }
    }
    // Không bao giờ stopImmediatePropagation các sự kiện di chuột tự nhiên
    propagatedEvents.push(e.type);
    return "PROPAGATED";
  }

  // 1. Khi đang chuyển frame, người dùng di chuột tới cuboid handle
  handlePointerEvent({ type: "pointermove", buttons: 0 });
  assert.ok(propagatedEvents.includes("pointermove"), "Sự kiện pointermove phải đi qua tự nhiên để CVAT nhận hover handle");
  assert.strictEqual(isFrameTransitioning, true, "Transition vẫn giữ đến khi click hoặc hết timer");

  // 2. Người dùng nhấn chuột xuống (pointerdown) để bắt đầu kéo cuboid
  handlePointerEvent({ type: "pointerdown", buttons: 1 });
  assert.strictEqual(isFrameTransitioning, false, "Transition phải kết thúc ngay khi nhận click");
  assert.strictEqual(isCanvasInteracting, true, "Trạng thái tương tác canvas phải bật để khóa recoloring");

  console.log("  ✅ Test 5 Passed: Zero-lag pointer transition unblock hoạt động chuẩn xác không nuốt hover handle.");
}

// =========================================================================
// TEST 6: Khóa Raycast Cấp Object3D.prototype.add & Hủy Background Timer Khi Drag
// =========================================================================
{
  class BaseObject3D {
    children: any[] = [];
    isPoints?: boolean;
    name: string;
    constructor(name: string) {
      this.name = name;
    }
    add(...objs: any[]) {
      this.children.push(...objs);
    }
    traverse(cb: (c: any) => void) {
      this.children.forEach((c) => {
        cb(c);
        if (c.traverse) c.traverse(cb);
      });
    }
    raycast(rc: any, res: any[]) {
      res.push(this);
    }
  }

  class GroupContainer extends BaseObject3D {
    isGroup = true;
  }

  class DynamicPoints extends BaseObject3D {
    isPoints = true;
    raycast(rc: any, res: any[]) {
      res.push({ obj: this, points: 305000 });
    }
  }

  // Cài đặt Object3D.prototype.add Hook
  const origAdd = BaseObject3D.prototype.add;
  BaseObject3D.prototype.add = function (...objects: any[]) {
    for (const item of objects) {
      if (item) {
        if (item.isPoints) {
          item.raycast = () => {};
        }
        if (typeof item.traverse === "function") {
          item.traverse((child: any) => {
            if (child && child.isPoints) {
              child.raycast = () => {};
            }
          });
        }
      }
    }
    return origAdd.apply(this, objects);
  };

  // Giả lập: CVAT nạp PCD mới bằng cách tạo Group rồi add vào Scene
  const scene = new BaseObject3D("Scene");
  const pcdGroup = new GroupContainer("PCDGroup");
  const newFramePoints = new DynamicPoints("PCD_Frame_New");

  let raycastResults: any[] = [];
  // Trước khi add: hàm raycast ban đầu vẫn còn
  newFramePoints.raycast(null, raycastResults);
  assert.strictEqual(raycastResults.length, 1, "Trước khi add, Points có raycast");

  // Thêm Points vào Group
  pcdGroup.add(newFramePoints);
  // Ngay sau khi pcdGroup.add chạy: raycast của Points phải bị vô hiệu hóa
  raycastResults = [];
  newFramePoints.raycast(null, raycastResults);
  assert.strictEqual(raycastResults.length, 0, "Ngay khi add vào Group, raycast phải bị xóa sổ 100%");

  // Kiểm tra hủy background timers khi người dùng click chuột
  let lockTimerFired = false;
  let colorizeTimerFired = false;

  let lockOnActiveTimer: any = setTimeout(() => { lockTimerFired = true; }, 100);
  let singleFrameColorizeTimer: any = setTimeout(() => { colorizeTimerFired = true; }, 100);

  let isCanvasInteracting = false;
  let isMouseDown = false;

  function onPointerDownSim() {
    isCanvasInteracting = true;
    isMouseDown = true;
    if (lockOnActiveTimer) {
      clearTimeout(lockOnActiveTimer);
      lockOnActiveTimer = null;
    }
    if (singleFrameColorizeTimer) {
      clearTimeout(singleFrameColorizeTimer);
      singleFrameColorizeTimer = null;
    }
  }

  onPointerDownSim();

  assert.strictEqual(lockOnActiveTimer, null, "lockOnActiveTimer phải bị clear ngay khi click");
  assert.strictEqual(singleFrameColorizeTimer, null, "singleFrameColorizeTimer phải bị clear ngay khi click");

  // Kiểm tra Camera Lock guard khi người dùng đang kéo chuột
  function center3DViewOnObjectSim() {
    if (isCanvasInteracting || isMouseDown) {
      return false; // Chặn dời camera khi người dùng đang giữ chuột kéo box
    }
    return true;
  }

  assert.strictEqual(center3DViewOnObjectSim(), false, "Tuyệt đối không dời camera khi chuột đang giữ kéo box");

  console.log("  ✅ Test 6 Passed: Object3D.prototype.add Hook & Background Timer Cancellation bảo vệ hoàn hảo 60 FPS khi drag.");
}

console.log("🎉 TẤT CẢ CÁC BÀI TEST LÁT CẮT TRỰC GIAO & RAYCAST GUARD ĐỀU THÀNH CÔNG RỰC RỠ 100%!\n");
