import type { HistorySnapshot } from "./panel_state";

/**
 * Quản lý lịch sử hoàn tác & làm lại (Bidirectional History Stack: Undo & Redo)
 * Giới hạn tối đa 30 bước để tối ưu RAM và hiệu năng 60 FPS.
 */
export class HistoryManager {
  public undoStack: HistorySnapshot[] = [];
  public redoStack: HistorySnapshot[] = [];
  public readonly maxSteps: number = 30;

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public getLastUndoAction(): string {
    return this.canUndo() ? this.undoStack[this.undoStack.length - 1].actionName : "";
  }

  public getLastRedoAction(): string {
    return this.canRedo() ? this.redoStack[this.redoStack.length - 1].actionName : "";
  }

  public pushSnapshot(snapshot: HistorySnapshot): void {
    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.maxSteps) {
      this.undoStack.shift();
    }
    // Khi có thao tác mới, luôn xóa sạch redo stack
    this.redoStack = [];
  }

  public popUndo(): HistorySnapshot | undefined {
    return this.undoStack.pop();
  }

  public pushRedo(snapshot: HistorySnapshot): void {
    this.redoStack.push(snapshot);
    if (this.redoStack.length > this.maxSteps) {
      this.redoStack.shift();
    }
  }

  public popRedo(): HistorySnapshot | undefined {
    return this.redoStack.pop();
  }

  public pushUndo(snapshot: HistorySnapshot): void {
    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.maxSteps) {
      this.undoStack.shift();
    }
  }

  public clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  /**
   * Cập nhật trạng thái enabled/disabled và tooltip của 2 nút Undo và Redo trên giao diện
   */
  public updateButtonsState(container: HTMLElement | null): void {
    if (!container) return;
    const undoBtn = container.querySelector<HTMLButtonElement>("#floating-btn-undo");
    const redoBtn = container.querySelector<HTMLButtonElement>("#floating-btn-redo");

    if (undoBtn) {
      const hasUndo = this.canUndo();
      undoBtn.style.opacity = hasUndo ? "1" : "0.35";
      undoBtn.style.cursor = hasUndo ? "pointer" : "not-allowed";
      undoBtn.title = hasUndo
        ? `Hoàn tác: ${this.getLastUndoAction()} (Ctrl+Z / Cmd+Z)`
        : "Không có thao tác nào để hoàn tác (Ctrl+Z)";
    }

    if (redoBtn) {
      const hasRedo = this.canRedo();
      redoBtn.style.opacity = hasRedo ? "1" : "0.35";
      redoBtn.style.cursor = hasRedo ? "pointer" : "not-allowed";
      redoBtn.title = hasRedo
        ? `Làm lại: ${this.getLastRedoAction()} (Ctrl+Y / Ctrl+Shift+Z)`
        : "Không có thao tác nào để làm lại (Ctrl+Y / Ctrl+Shift+Z)";
    }
  }
}
