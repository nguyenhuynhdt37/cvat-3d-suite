/**
 * Khung chính của CVAT Helper Overlay:
 * - Overlay toàn màn hình (Clean White Theme)
 * - Tabs: Case 1 (Sửa L/W/H hàng loạt) & Case 2 (Duyệt theo ID)
 * - Lưu / Hoàn tác / Tải lại
 * - Modal stack xếp tầng
 * - Tự động nạp live bridge plugin nếu có thể
 *
 * Port từ cvat-helper/content/app.js (523 dòng) sang TypeScript strict.
 */

import { HelperJobStore } from './helper_store';
import { FrameData } from './frame_data';
import { mountCase1, type CaseMount } from './case1';
import { mountCase2 } from './case2';
import {
  openImageViewer as openViewerImpl,
  type ImageItem,
  type ModalHandle,
  type ModalOpts,
  type OpenModalFn,
} from './image_viewer';
import { HELPER_CSS } from './styles';
import { getHelperBridgeMainScript } from './live_bridge';
import {
  cloneBox,
  resizeKeepBottom,
  snapToGround,
  type Box3D,
} from '../core/geometry';

export interface HelperApp {
  store: HelperJobStore | null;
  frames: FrameData | null;
  settings: {
    sizeMode: 'bottom' | 'center' | 'ground';
    [key: string]: unknown;
  };
  getFrames(): FrameData;
  resizeBox(
    box: Box3D,
    size: number[],
    frame: number,
    mode?: string
  ): Promise<{ box: Box3D; ok: boolean }>;
  snapshot(ids: number[]): void;
  dropLastSnapshot(): void;
  undo(): boolean;
  redo(): boolean;
  changed(): void;
  setStatus(text: string, kind?: string): void;
  showBanner(text: string, actions?: HTMLElement[]): void;
  switchTab(id: string, arg?: unknown): void;
  openModal: OpenModalFn;
  openImageViewer(list: ImageItem[], start?: number): ModalHandle;
}

type Props = Record<string, unknown>;

function h(tag: string, props: Props = {}, ...children: unknown[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (k === 'class') {
      el.className = v as string;
    } else if (k === 'style' && typeof v === 'object') {
      Object.assign(el.style, v);
    } else if (k in el && typeof v !== 'string') {
      (el as any)[k] = v;
    } else {
      el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of (children as unknown[]).flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export class HelperOverlay implements HelperApp {
  private static instance: HelperOverlay | null = null;

  public store: HelperJobStore | null = null;
  public frames: FrameData | null = null;
  public settings = {
    sizeMode: 'bottom' as 'bottom' | 'center' | 'ground',
  };

  private host: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;
  private overlay: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private modeEl: HTMLElement | null = null;
  private saveBtn: HTMLButtonElement | null = null;
  private undoBtn: HTMLButtonElement | null = null;
  private redoBtn: HTMLButtonElement | null = null;
  private bannerEl: HTMLElement | null = null;
  private bodyEl: HTMLElement | null = null;
  private tabBtns: Record<string, HTMLElement> = {};

  private currentTab: string = 'case1';
  private mounted: CaseMount | null = null;
  private modalStack: Array<{ modal: HTMLElement; opts: ModalOpts; titleEl: HTMLElement }> = [];

  private history: number[][] = [];
  private redoHistory: number[][] = [];
  private savedCount: number = 0;

  public static getInstance(): HelperOverlay {
    if (!HelperOverlay.instance) {
      HelperOverlay.instance = new HelperOverlay();
    }
    return HelperOverlay.instance;
  }

  constructor() {
    this.ensureMainWorldBridge();
  }

  private ensureMainWorldBridge(): void {
    if (typeof window === 'undefined') return;
    if ((window as any).__cvatHelperBridgeInjected) return;
    (window as any).__cvatHelperBridgeInjected = true;

    try {
      const script = document.createElement('script');
      script.textContent = getHelperBridgeMainScript();
      (document.head || document.documentElement).appendChild(script);
      script.remove();
    } catch (e) {
      console.warn('[CVAT Helper] Không thể inject live bridge script:', e);
    }
  }

  public isOpen(): boolean {
    return this.overlay !== null;
  }

  public getFrames(): FrameData {
    if (this.frames && this.store && this.frames.store.jid !== this.store.jid) {
      this.frames.dispose();
      this.frames = null;
    }
    if (!this.frames && this.store) {
      this.frames = new FrameData(this.store);
    }
    if (this.frames && this.store) {
      this.frames.store = this.store;
    }
    return this.frames!;
  }

  public async resizeBox(
    box: Box3D,
    size: number[],
    frame: number,
    mode: string = this.settings.sizeMode
  ): Promise<{ box: Box3D; ok: boolean }> {
    if (mode === 'center') {
      return { box: { ...cloneBox(box), s: [size[0], size[1], size[2]] }, ok: true };
    }
    const kept = resizeKeepBottom(box, size);
    if (mode === 'bottom') return { box: kept, ok: true };

    const cloud = await this.getFrames().cloud(frame);
    const snapped = snapToGround(cloud, kept);
    return snapped ? { box: snapped.box, ok: true } : { box: kept, ok: false };
  }

  public snapshot(ids: number[]): void {
    if (!this.store) return;
    for (const id of ids) {
      this.store.track(id)?.snapshot();
    }
    this.history.push(ids);
    this.redoHistory = [];
  }

  public dropLastSnapshot(): void {
    const ids = this.history.pop();
    if (!ids || !this.store) return;
    for (const id of ids) {
      this.store.track(id)?.undoStack.pop();
    }
  }

  public undo(): boolean {
    const ids = this.history.pop();
    if (!ids || !this.store) return false;
    for (const id of ids) {
      this.store.track(id)?.undo();
    }
    this.redoHistory.push(ids);
    this.changed();
    return true;
  }

  public redo(): boolean {
    const ids = this.redoHistory.pop();
    if (!ids || !this.store) return false;
    for (const id of ids) {
      this.store.track(id)?.redo();
    }
    this.history.push(ids);
    this.changed();
    return true;
  }

  public setStatus(text: string, kind: string = ''): void {
    if (!this.statusEl) return;
    this.statusEl.textContent = text;
    this.statusEl.className = `status ${kind}`;
  }

  public showBanner(text: string, actions: HTMLElement[] = []): void {
    if (!this.bannerEl) return;
    this.bannerEl.replaceChildren(
      h(
        'div',
        { class: 'banner' },
        h('span', {}, text),
        ...actions,
        h('button', { class: 'small', onclick: () => this.bannerEl?.replaceChildren() }, '✕')
      )
    );
  }

  public changed(): void {
    if (!this.store) return;
    const n = this.store.dirtyTracks().length;
    const label = this.store.mode === 'live' ? 'Lưu vào CVAT' : 'Lưu lên CVAT';
    if (this.saveBtn) {
      this.saveBtn.textContent = n ? `${label} (${n} track)` : label;
      this.saveBtn.disabled = !n;
    }
    if (this.undoBtn) this.undoBtn.disabled = !this.history.length;
    if (this.redoBtn) this.redoBtn.disabled = !this.redoHistory.length;
    this.mounted?.refresh?.();
  }

  public switchTab(id: string, arg?: unknown): void {
    this.mounted?.unmount?.();
    if (this.bodyEl) this.bodyEl.replaceChildren();
    this.currentTab = id;
    for (const [k, b] of Object.entries(this.tabBtns)) {
      b.classList.toggle('active', k === id);
    }
    if (id === 'case1') {
      this.mounted = mountCase1(this, this.bodyEl!);
    } else if (id === 'case2') {
      this.mounted = mountCase2(this, this.bodyEl!, arg as number | undefined);
    }
    this.changed();
  }

  public openModal(title: string, content: HTMLElement, opts: ModalOpts = {}): ModalHandle {
    const titleEl = h('b', {}, title);
    const entry = {
      modal: null as any,
      opts,
      titleEl,
    };
    const modal = h(
      'div',
      {
        class: 'modal',
        tabindex: '-1',
        onclick: (e: MouseEvent) => {
          if (e.target === modal) this.closeTopModal();
        },
      },
      h(
        'div',
        { class: 'bar' },
        titleEl,
        ...(opts.tools || []),
        h('span', { class: 'grow' }),
        h('button', { class: 'close', onclick: () => this.closeModalEntry(entry) }, '✕ Đóng (Esc)')
      ),
      content
    );
    entry.modal = modal;
    this.modalStack.push(entry);
    this.shadow?.append(modal);
    modal.focus({ preventScroll: true });

    return {
      modal,
      setTitle: (t: string) => {
        titleEl.textContent = t;
      },
      close: () => this.closeModalEntry(entry),
    };
  }

  public openImageViewer(list: ImageItem[], start: number = 0): ModalHandle {
    return openViewerImpl(list, start, (title, content, opts) => this.openModal(title, content, opts));
  }

  private closeModalEntry(entry: { modal: HTMLElement; opts: ModalOpts }): void {
    const i = this.modalStack.indexOf(entry as any);
    if (i < 0) return;
    this.modalStack.splice(i, 1);
    entry.modal.remove();
    entry.opts.onClose?.();
    (this.modalStack.length ? this.modalStack[this.modalStack.length - 1].modal : this.overlay)?.focus({
      preventScroll: true,
    });
  }

  private closeTopModal(): void {
    if (this.modalStack.length) {
      this.closeModalEntry(this.modalStack[this.modalStack.length - 1]);
    }
  }

  private ensureHost(): void {
    if (this.host) return;
    this.host = h('div', { id: 'cvat-helper-overlay-root' });
    this.shadow = this.host.attachShadow({ mode: 'open' });
    this.shadow.append(h('style', {}, HELPER_CSS));

    for (const type of ['keydown', 'keyup', 'keypress']) {
      this.host.addEventListener(type, (e: Event) => {
        if (this.overlay && type === 'keydown') this.onKey(e as KeyboardEvent);
        e.stopPropagation();
      });
    }
    document.documentElement.append(this.host);
  }

  private onKey(e: KeyboardEvent): void {
    const k = e.key.toLowerCase();
    const typing = (e.composedPath()[0] as HTMLElement)?.tagName === 'INPUT';
    if ((e.ctrlKey || e.metaKey) && k === 's') {
      e.preventDefault();
      this.save();
      return;
    }
    if (!typing && (e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey) {
      e.preventDefault();
      this.undo();
      return;
    }
    if (!typing && (e.ctrlKey || e.metaKey) && (k === 'y' || (k === 'z' && e.shiftKey))) {
      e.preventDefault();
      this.redo();
      return;
    }
    if (this.modalStack.length) {
      if (k === 'escape') {
        e.preventDefault();
        this.closeTopModal();
        return;
      }
      this.modalStack[this.modalStack.length - 1].opts.onKey?.(e);
      return;
    }
    if (k === 'escape') {
      this.close();
      return;
    }
    this.mounted?.onKey?.(e);
  }

  public async open(jobId: number, initialTrackId?: number): Promise<void> {
    if (this.overlay) return;
    this.ensureHost();

    this.overlay = h('div', { class: 'overlay', tabindex: '-1' });
    this.statusEl = h('span', { class: 'status' });
    this.modeEl = h('span');
    this.saveBtn = h('button', { class: 'primary', onclick: () => this.save(), disabled: true }, 'Lưu lên CVAT') as HTMLButtonElement;
    this.undoBtn = h('button', { onclick: () => this.undo(), disabled: true, title: 'Ctrl+Z' }, '↶ Hoàn tác') as HTMLButtonElement;
    this.redoBtn = h('button', { onclick: () => this.redo(), disabled: true, title: 'Ctrl+Y' }, '↷ Làm lại') as HTMLButtonElement;
    this.bannerEl = h('div');
    this.bodyEl = h('div', { class: 'body' });
    this.tabBtns = {};

    const tabsDef: Record<string, string> = {
      case1: 'Case 1 · Sửa L/W/H',
      case2: 'Case 2 · Duyệt theo ID',
    };

    const tabsEl = h(
      'span',
      {},
      ...Object.entries(tabsDef).map(([id, title]) => {
        const btn = h('button', { class: 'tab', onclick: () => this.switchTab(id) }, title);
        this.tabBtns[id] = btn;
        return btn;
      })
    );

    this.overlay.append(
      h(
        'div',
        { class: 'bar' },
        h('span', { class: 'title' }, `🧰 Helper Studio · Job #${jobId}`),
        tabsEl,
        h('span', { class: 'grow' }),
        this.modeEl,
        this.statusEl,
        this.undoBtn,
        this.redoBtn,
        h('button', { onclick: () => this.reload(), title: 'Bỏ thay đổi, tải lại annotation từ CVAT' }, '⟳ Tải lại'),
        this.saveBtn,
        h('button', { onclick: () => this.close() }, '✕ Đóng')
      ),
      this.bannerEl,
      this.bodyEl
    );

    this.shadow?.append(this.overlay);
    this.overlay.focus();

    this.store = new HelperJobStore(jobId);
    this.history = [];
    this.redoHistory = [];
    this.setStatus('Đang tải annotation…');

    try {
      await this.store.load();
      this.setStatus(`${this.store.tracks.size} track cuboid · ${this.store.frames.length} frame`, 'ok');
      this.modeEl.replaceChildren(
        this.store.mode === 'live'
          ? h('span', { class: 'kf on', title: 'Đọc/ghi thẳng vào CVAT đang mở – không cần reload' }, '● LIVE')
          : h('span', { class: 'kf out', title: 'Lưu qua REST API – cần reload CVAT sau khi lưu' }, '● API')
      );
      if (this.store.mode !== 'live') {
        this.showBanner('Chế độ API: lưu qua REST API. Lưu xong cần reload lại CVAT.');
      }
      this.switchTab(initialTrackId ? 'case2' : 'case1', initialTrackId);
    } catch (err: any) {
      console.error('[CVAT Helper]', err);
      this.setStatus(`Lỗi tải dữ liệu: ${err.message}`, 'err');
    }
  }

  public async save(): Promise<void> {
    if (!this.store || !this.store.dirtyTracks().length) return;
    if (this.saveBtn) this.saveBtn.disabled = true;
    this.setStatus('Đang lưu…');
    try {
      let res: any = await this.store.save();
      if (res.conflicts) {
        const ok = confirm(
          `Track ID ${res.conflicts.join(', ')} đã bị thay đổi trên CVAT kể từ lúc tool tải về.\n\nOK = ghi đè\nCancel = hủy`
        );
        if (!ok) {
          this.setStatus('Chưa lưu – có xung đột.', 'err');
          this.changed();
          return;
        }
        res = await this.store.save({ force: true });
      }
      this.setStatus(`Đã lưu ${res.saved} track lúc ${new Date().toLocaleTimeString()}`, 'ok');
      if (res.live) {
        this.bannerEl?.replaceChildren();
        this.changed();
        return;
      }
      this.savedCount += res.saved;
      this.showBanner(
        'Đã lưu lên server. Reload CVAT để cập nhật canvas Three.js.',
        [h('button', { class: 'small primary', onclick: () => location.reload() }, 'Reload CVAT ngay')]
      );
    } catch (err: any) {
      console.error('[CVAT Helper]', err);
      this.setStatus(`Lỗi lưu: ${err.message}`, 'err');
    }
    this.changed();
  }

  public async reload(): Promise<void> {
    if (this.store?.dirtyTracks().length && !confirm('Bỏ mọi thay đổi chưa lưu và tải lại từ CVAT?')) return;
    const tab = this.currentTab;
    const jid = this.store?.jid;
    this.teardown();
    this.currentTab = tab;
    if (jid) this.open(jid);
  }

  private teardown(): void {
    this.mounted?.unmount?.();
    this.mounted = null;
    this.store = null;
    this.overlay?.remove();
    this.overlay = null;
    while (this.modalStack.length) this.closeTopModal();
  }

  public close(): void {
    if (this.store?.dirtyTracks().length && !confirm('Còn thay đổi CHƯA LƯU. Đóng và bỏ các thay đổi này?')) return;
    const saved = this.savedCount;
    this.teardown();
    if (saved && confirm('Bạn đã lưu thay đổi. Reload trang CVAT bây giờ để thấy dữ liệu mới trên Canvas?')) {
      location.reload();
    }
  }
}
