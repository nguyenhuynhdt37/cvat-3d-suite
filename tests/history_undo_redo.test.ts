import assert from "node:assert/strict";

interface HistorySnapshot {
  uiId: number;
  serverId: number | null;
  frame: number;
  applyToTrack: boolean;
  boxPoints: number[];
  trackShapesBackup?: Array<{ frame: number; outside?: boolean; points: number[] }>;
  afterBoxPoints?: number[];
  afterTrackShapes?: Array<{ frame: number; outside?: boolean; points: number[] }>;
  actionName: string;
}

class MockHistoryManager {
  public undoStack: HistorySnapshot[] = [];
  public redoStack: HistorySnapshot[] = [];
  public readonly maxSteps = 30;

  // Giả lập trạng thái hiện tại của box trong engine
  public currentPoints: number[] = [10, 20, 1, 0, 0, 0, 4.5, 1.8, 1.5, 0, 0, 0, 0, 0, 0, 0];
  public currentShapes: Array<{ frame: number; outside?: boolean; points: number[] }> = [
    { frame: 0, outside: false, points: [10, 20, 1, 0, 0, 0, 4.5, 1.8, 1.5] },
    { frame: 1, outside: false, points: [11, 20, 1, 0, 0, 0, 4.5, 1.8, 1.5] },
  ];

  public pushSnapshot(actionName: string, forTrack: boolean = false): void {
    this.undoStack.push({
      uiId: 1,
      serverId: 101,
      frame: 0,
      applyToTrack: forTrack,
      boxPoints: [...this.currentPoints],
      trackShapesBackup: forTrack ? this.currentShapes.map((s) => ({ ...s, points: [...s.points] })) : undefined,
      actionName,
    });

    if (this.undoStack.length > this.maxSteps) {
      this.undoStack.shift();
    }

    // Khi có thao tác mới, luôn xóa sạch redo stack
    this.redoStack = [];
  }

  public undo(): boolean {
    if (this.undoStack.length === 0) return false;
    const snapshot = this.undoStack.pop()!;

    // Chụp lại trạng thái hiện tại làm after trước khi khôi phục
    snapshot.afterBoxPoints = [...this.currentPoints];
    if (snapshot.applyToTrack) {
      snapshot.afterTrackShapes = this.currentShapes.map((s) => ({ ...s, points: [...s.points] }));
    }

    // Khôi phục trạng thái cũ (before)
    this.currentPoints = [...snapshot.boxPoints];
    if (snapshot.trackShapesBackup) {
      this.currentShapes = snapshot.trackShapesBackup.map((s) => ({ ...s, points: [...s.points] }));
    }

    // Đẩy vào redo stack
    this.redoStack.push(snapshot);
    if (this.redoStack.length > this.maxSteps) {
      this.redoStack.shift();
    }
    return true;
  }

  public redo(): boolean {
    if (this.redoStack.length === 0) return false;
    const snapshot = this.redoStack.pop()!;

    const targetPoints = snapshot.afterBoxPoints || snapshot.boxPoints;
    const targetShapes = snapshot.afterTrackShapes || snapshot.trackShapesBackup;

    // Khôi phục trạng thái mới (after)
    this.currentPoints = [...targetPoints];
    if (targetShapes) {
      this.currentShapes = targetShapes.map((s) => ({ ...s, points: [...s.points] }));
    }

    // Đẩy trở lại undo stack
    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.maxSteps) {
      this.undoStack.shift();
    }
    return true;
  }
}

console.log("🧪 Đang chạy kiểm thử tự động Module History Undo / Redo...");

// Test 1: Khởi tạo rỗng
const mgr = new MockHistoryManager();
assert.equal(mgr.undoStack.length, 0);
assert.equal(mgr.redoStack.length, 0);
assert.equal(mgr.undo(), false, "Undo khi stack rỗng phải trả về false");
assert.equal(mgr.redo(), false, "Redo khi stack rỗng phải trả về false");
console.log("✅ Test 1: Khởi tạo và phòng vệ stack rỗng (Pass)");

// Test 2: Thao tác đơn lẻ (1 Frame) - Push, Thay đổi, Undo, Redo
const initialYaw = mgr.currentPoints[5]; // 0 rad
mgr.pushSnapshot("Xoay Yaw 90°", false);

// Giả lập thực hiện chỉnh sửa sang 90° (~1.57 rad)
mgr.currentPoints[5] = Math.PI / 2;
assert.equal(mgr.undoStack.length, 1);
assert.equal(mgr.redoStack.length, 0);

// Bấm Undo
assert.equal(mgr.undo(), true);
assert.equal(mgr.currentPoints[5], initialYaw, "Góc Yaw phải trở về 0 sau khi Undo");
assert.equal(mgr.undoStack.length, 0);
assert.equal(mgr.redoStack.length, 1);
console.log("✅ Test 2a: Undo 1 frame khôi phục chính xác trạng thái ban đầu");

// Bấm Redo
assert.equal(mgr.redo(), true);
assert.equal(mgr.currentPoints[5], Math.PI / 2, "Góc Yaw phải khôi phục lại 90° sau khi Redo");
assert.equal(mgr.undoStack.length, 1);
assert.equal(mgr.redoStack.length, 0);
console.log("✅ Test 2b: Redo 1 frame khôi phục chính xác trạng thái sau chỉnh sửa");

// Test 3: Thao tác Toàn Track (Multi-frame)
mgr.pushSnapshot("Cập nhật Kích Thước Toàn Track", true);
// Sửa kích thước từ 4.5m -> 5.0m trên cả 2 frame
mgr.currentPoints[6] = 5.0;
mgr.currentShapes[0].points[6] = 5.0;
mgr.currentShapes[1].points[6] = 5.0;

// Bấm Undo
assert.equal(mgr.undo(), true);
assert.equal(mgr.currentPoints[6], 4.5, "Frame hiện tại phải về 4.5m");
assert.equal(mgr.currentShapes[0].points[6], 4.5, "Frame 0 trong track phải về 4.5m");
assert.equal(mgr.currentShapes[1].points[6], 4.5, "Frame 1 trong track phải về 4.5m");

// Bấm Redo
assert.equal(mgr.redo(), true);
assert.equal(mgr.currentPoints[6], 5.0, "Frame hiện tại phải về lại 5.0m");
assert.equal(mgr.currentShapes[0].points[6], 5.0, "Frame 0 trong track phải về lại 5.0m");
assert.equal(mgr.currentShapes[1].points[6], 5.0, "Frame 1 trong track phải về lại 5.0m");
console.log("✅ Test 3: Thao tác Toàn Track bảo toàn 100% tất cả các frame qua Undo & Redo");

// Test 4: Reset Redo Stack khi có thao tác mới sau khi Undo
// Hiện tại undoStack có 2 snapshot (Yaw và Size). Bấm Undo 1 lần:
assert.equal(mgr.undo(), true); // Hoàn tác thao tác Size
assert.equal(mgr.redoStack.length, 1);

// Người dùng thực hiện thao tác mới (ví dụ vi chỉnh Center)
mgr.pushSnapshot("Vi Chỉnh Center +5cm", false);
mgr.currentPoints[0] += 0.05;

assert.equal(mgr.redoStack.length, 0, "Redo stack bắt buộc phải bị xóa sạch khi có thao tác mới");
assert.equal(mgr.redo(), false, "Không thể redo khi vừa có edit mới");
console.log("✅ Test 4: Xóa sạch Redo Stack khi có thao tác mới sau khi Undo (Chuẩn UX Quốc Tế)");

// Test 5: Giới hạn tối đa 30 bước (Memory Cap Protection)
for (let i = 0; i < 40; i++) {
  mgr.pushSnapshot(`Thao tác bước #${i}`);
  mgr.currentPoints[0] = i;
}
assert.equal(mgr.undoStack.length, 30, "Độ sâu undoStack không được vượt quá 30 bước");
assert.equal(mgr.undoStack[mgr.undoStack.length - 1].actionName, "Thao tác bước #39");
console.log("✅ Test 5: Giới hạn độ sâu 30 bước ngăn ngừa rò rỉ và tràn bộ nhớ RAM WebGL");

console.log("\n🎉 TẤT CẢ 5/5 BÀI KIỂM THỬ BIDIRECTIONAL HISTORY UNDO / REDO ĐÃ ĐẠT 100%!");
