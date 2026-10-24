/**
 * Styles — CSS cho Helper overlay (app.js) và Case 2 (case2.js).
 * Chuyển sang Clean White / Light Theme theo quy chuẩn GEMINI.MD.
 */

/**
 * CSS chính cho overlay Helper (app.js).
 *
 * Bảng màu Clean White:
 * - Nền overlay: rgba(255,255,255,0.98)
 * - Text: #09090b
 * - Viền: #e4e4e7
 * - Bar background: #fafafa
 * - Button: #f4f4f5 border #e4e4e7
 * - Primary: #2563eb
 * - Status ok: #16a34a, err: #dc2626, muted: #71717a
 * - Input: #ffffff border #d4d4d8
 * - Banner: #fefce8 border #fef08a text #854d0e
 */
export const HELPER_CSS: string = `
  :host { all: initial; }
  * { box-sizing: border-box; }

  .fab {
    position: fixed; left: 12px; bottom: 12px; z-index: 2147483000;
    font: 600 13px system-ui, sans-serif;
    background: #2563eb; color: #fff; border: 0; border-radius: 20px;
    padding: 8px 14px; cursor: pointer;
    box-shadow: 0 2px 8px rgba(0,0,0,.12);
  }
  .fab:hover { background: #3b82f6; }

  .overlay {
    position: fixed; inset: 0; z-index: 2147483001;
    background: rgba(255, 255, 255, 0.98); color: #09090b;
    font: 13px/1.4 system-ui, sans-serif;
    display: flex; flex-direction: column;
  }

  .bar {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 12px; background: #fafafa;
    border-bottom: 1px solid #e4e4e7; flex-wrap: wrap;
  }
  .bar .title { font-weight: 700; margin-right: 8px; }

  .grow { flex: 1; }

  button, select, input { font: inherit; color: inherit; }

  button {
    background: #f4f4f5; border: 1px solid #e4e4e7; border-radius: 6px;
    padding: 5px 10px; cursor: pointer;
  }
  button:hover:not(:disabled) { background: #e4e4e7; }
  button:disabled { opacity: .45; cursor: default; }

  button.primary { background: #2563eb; border-color: #2563eb; color: #fff; }
  button.primary:hover:not(:disabled) { background: #3b82f6; }

  button.warn { background: #fef2f2; border-color: #fecaca; color: #dc2626; }

  button.small { padding: 2px 6px; font-size: 12px; }

  button.tab { border-radius: 6px 6px 0 0; }
  button.tab.active { background: #2563eb; border-color: #2563eb; color: #fff; }

  select, input {
    background: #ffffff; border: 1px solid #d4d4d8;
    border-radius: 5px; padding: 4px 6px;
  }
  input[type=number] { width: 72px; }
  input[type=checkbox] { accent-color: #2563eb; }

  label { display: inline-flex; align-items: center; gap: 4px; }

  .status { color: #71717a; }
  .status.err { color: #dc2626; }
  .status.ok { color: #16a34a; }

  .body { flex: 1; min-height: 0; display: flex; flex-direction: column; }

  .banner {
    background: #fefce8; color: #854d0e;
    border-bottom: 1px solid #fef08a;
    padding: 6px 12px; display: flex; gap: 10px; align-items: center;
  }

  .muted { color: #71717a; }

  .kf {
    display: inline-block; padding: 0 5px; border-radius: 4px;
    font-size: 11px; font-weight: 700;
  }
  .kf.on { background: #16a34a; color: #fff; }
  .kf.off { background: #f4f4f5; color: #71717a; }
  .kf.out { background: #f59e0b; color: #fff; }

  .dot {
    display: inline-block; width: 10px; height: 10px;
    border-radius: 50%; margin-right: 6px; vertical-align: middle;
  }

  table { border-collapse: collapse; width: 100%; }
  th, td {
    padding: 6px 8px; border-bottom: 1px solid #e4e4e7;
    text-align: left; white-space: nowrap;
  }
  th {
    position: sticky; top: 0; background: #fafafa;
    z-index: 1; font-weight: 600;
  }
  tr.dirty td { background: #f0fdf4; }

  .scroll { overflow: auto; flex: 1; min-height: 0; }

  .modal {
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 2147483002;
    display: flex; flex-direction: column;
    padding: 16px; gap: 8px;
    font: 13px/1.4 system-ui, sans-serif; color: #09090b;
  }
  .modal:focus, .overlay:focus { outline: none; }
  .modal > .bar { border-radius: 6px; }

  .modal .bar button.close {
    background: #09090b; color: #fff;
    border-color: #09090b; font-weight: 700;
  }
  .modal .bar button.close:hover { background: #27272a; }

  .modal .imgs {
    flex: 1; min-height: 0;
    display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 10px; overflow: auto; padding: 4px;
    align-content: start; align-items: start;
  }

  .imgbox {
    position: relative; margin: 0;
    border: 2px solid transparent; border-radius: 6px;
    overflow: hidden; background: #f4f4f5;
    transition: border-color .1s;
  }
  .imgbox:hover {
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.25);
  }
  .imgbox img { width: 100%; height: auto; display: block; cursor: zoom-in; }
  .imgbox figcaption { padding: 4px 8px; color: #52525b; font-size: 12px; }

  .imgbox .max {
    position: absolute; top: 6px; right: 6px; opacity: 0;
    transition: opacity .1s;
    background: rgba(255, 255, 255, 0.95); color: #09090b;
    border: 1px solid #e4e4e7; font-weight: 700;
  }
  .imgbox:hover .max { opacity: 1; }

  .viewer {
    position: relative; flex: 1; min-height: 0;
    background: #f8fafc; border: 1px solid #e4e4e7;
    border-radius: 6px; overflow: hidden;
    cursor: grab; touch-action: none;
  }
  .viewer.dragging { cursor: grabbing; }
  .viewer canvas { position: absolute; inset: 0; }

  .zoomlbl { min-width: 52px; text-align: center; color: #52525b; }
  .help { color: #71717a; font-size: 12px; }
  .progress { color: #2563eb; }
`;

/**
 * CSS cho Case 2 (case2.js).
 *
 * Layout grid 5 cột: Info | Camera | Top | Side | Front.
 * Chuyển sang Clean White theme.
 */
export const CASE2_CSS: string = `
  .c2-head, .c2-row {
    display: grid;
    grid-template-columns: 190px var(--img-col) 1fr 1fr 1fr;
    gap: 4px;
  }
  .c2-head {
    padding: 4px 8px; background: #fafafa;
    border-bottom: 1px solid #e4e4e7; font-weight: 600;
  }

  .c2-wrap { position: relative; flex: 1; min-height: 0; }
  .c2-scroll {
    position: absolute; inset: 0;
    overflow-y: auto; overflow-x: hidden; padding: 4px 8px;
  }

  .c2-row { height: var(--row-h); margin-bottom: 4px; }
  .c2-row.sel .c2-info { outline: 2px solid #2563eb; }

  .c2-info {
    background: #fafafa; border: 1px solid #e4e4e7; border-radius: 4px;
    padding: 6px; display: flex; flex-direction: column;
    gap: 4px; overflow: hidden;
  }
  .c2-info .head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .c2-info .grid {
    display: grid; grid-template-columns: auto 1fr;
    gap: 2px 6px; align-items: center;
  }
  .c2-info input[type=number] { width: 100%; padding: 1px 4px; }
  .c2-info .btns { display: flex; flex-wrap: wrap; gap: 3px; margin-top: auto; }

  .c2-img {
    background: #f4f4f5; border: 1px solid #e4e4e7; border-radius: 4px;
    overflow: hidden; display: flex; align-items: center;
    justify-content: center; cursor: zoom-in;
    color: #71717a; font-size: 12px;
  }
  .c2-img img { max-width: 100%; max-height: 100%; object-fit: contain; }

  .c2-view {
    position: relative; border-radius: 4px;
    background: transparent; touch-action: none; user-select: none;
    outline: 1px solid transparent;
  }
  .c2-view:hover { outline-color: #3b82f6; }

  .vtools {
    position: absolute; top: 4px; right: 4px;
    display: flex; gap: 3px;
    opacity: 0; transition: opacity .12s;
  }
  .c2-view:hover .vtools { opacity: 1; }
  .vtools button {
    padding: 1px 7px; font-size: 13px; line-height: 18px;
    background: rgba(255, 255, 255, 0.95); color: #09090b;
    border: 1px solid #e4e4e7; border-radius: 4px;
  }
  .vtools button:hover { background: #fff; }

  .osw {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 1px 8px 1px 3px; border-radius: 10px;
    font-size: 11px; font-weight: 700;
    border: 1px solid #e4e4e7; background: #f4f4f5;
    color: #71717a; cursor: pointer;
  }
  .osw .knob {
    width: 14px; height: 14px; border-radius: 50%; background: #a1a1aa;
  }
  .osw.on {
    background: #fefce8; border-color: #facc15; color: #854d0e;
  }
  .osw.on .knob { background: #f59e0b; }

  .pbar {
    position: relative; width: 300px; height: 20px;
    background: #f4f4f5; border: 1px solid #d4d4d8;
    border-radius: 10px; overflow: hidden;
  }
  .pbar .fill {
    position: absolute; left: 0; top: 0; bottom: 0; width: 0;
    background: linear-gradient(90deg, #2563eb, #16a34a);
    transition: width .2s;
  }
  .pbar .ptext {
    position: relative; display: block; text-align: center;
    font-size: 11px; line-height: 18px; color: #09090b;
  }

  .big-wrap {
    position: relative; flex: 1; min-height: 0;
    background: #f8fafc; border: 1px solid #e4e4e7;
    border-radius: 6px; overflow: hidden;
  }
  .big-inner { position: absolute; inset: 0; }
  .big-cell {
    position: absolute; inset: 0;
    touch-action: none; user-select: none;
  }

  .seg button.active { background: #2563eb; border-color: #2563eb; color: #fff; }
`;
