/* 象棋棋盘的画法。只管画和点,不懂规则:局面、选中的子、能走的点、上一步,都由调用方给。
 * 棋子和棋盘是实物颜色,不跟深色模式走。 */

import { el } from './index.js';
import { WOODS } from './goBoard.js';
import { PIECE_TEXT, sideOf, rowOf, colOf } from '../lib/xiangqi.js';

export { WOODS };
const RED_INK = '#B3261E', BLACK_INK = '#1B1B1B', FACE = '#F3E6C8', EDGE = '#8A6A3A', MARK = '#2F6B4F';

/**
 * onSquare(sq) 在点中某个交叉点时调用。
 * draw({ board, sel, targets, last, flip, faceToFace, wood })
 *   flip        整盘倒过来看(人执黑时用)
 *   faceToFace  对坐:黑方棋子上的字倒过来,坐对面的人看是正的
 */
export function xqBoardView(onSquare) {
  const canvas = el('canvas', { style: 'width:100%;aspect-ratio:9/10;display:block;touch-action:manipulation;border-radius:var(--radius-sm)' });
  let view = null, geo = null;

  function draw(v = view) {
    view = v;
    if (!view) return;
    const w = canvas.clientWidth;
    if (!w) return;                                           // 还没排版(或在 jsdom 里)
    const h = w * 10 / 9, dpr = globalThis.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    const g = canvas.getContext?.('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cell = w / 9.4, mx = (w - cell * 8) / 2, my = (h - cell * 9) / 2;
    geo = { cell, mx, my, w, h, flip: view.flip };
    const X = (c) => mx + (view.flip ? 8 - c : c) * cell, Y = (r) => my + (view.flip ? 9 - r : r) * cell;
    const wood = view.wood ?? WOODS[0];

    g.fillStyle = wood.fill; g.fillRect(0, 0, w, h);
    g.strokeStyle = wood.line; g.lineWidth = 1;
    for (let r = 0; r < 10; r++) line(g, X(0), Y(r), X(8), Y(r));
    for (let c = 0; c < 9; c++) {
      if (c === 0 || c === 8) line(g, X(c), Y(0), X(c), Y(9));
      else { line(g, X(c), Y(0), X(c), Y(4)); line(g, X(c), Y(5), X(c), Y(9)); }   // 河界断开
    }
    g.lineWidth = 2; g.strokeRect(Math.min(X(0), X(8)) - 3, Math.min(Y(0), Y(9)) - 3, cell * 8 + 6, cell * 9 + 6);
    g.lineWidth = 1;
    for (const [r0, r1] of [[0, 2], [7, 9]]) { line(g, X(3), Y(r0), X(5), Y(r1)); line(g, X(5), Y(r0), X(3), Y(r1)); }
    // 兵位、炮位的小折角
    for (const [r, c] of [[2, 1], [2, 7], [7, 1], [7, 7], [3, 0], [3, 2], [3, 4], [3, 6], [3, 8], [6, 0], [6, 2], [6, 4], [6, 6], [6, 8]]) corner(g, X(c), Y(r), cell * 0.12, c > 0, c < 8);
    g.fillStyle = wood.line; g.font = `${cell * 0.42}px "Songti SC","Noto Serif CJK SC",serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const ry = (Y(4) + Y(5)) / 2;
    g.fillText(view.flip ? '汉  界' : '楚  河', X(view.flip ? 6 : 2), ry);
    g.fillText(view.flip ? '楚  河' : '汉  界', X(view.flip ? 2 : 6), ry);

    if (view.last) for (const s of view.last) bracket(g, X(colOf(s)), Y(rowOf(s)), cell * 0.47);
    const rad = cell * 0.44;
    for (let s = 0; s < 90; s++) {
      const p = view.board[s];
      if (!p) continue;
      const x = X(colOf(s)), y = Y(rowOf(s)), red = sideOf(p) === 0;
      g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.arc(x + 1, y + 2, rad, 0, 7); g.fill();
      g.fillStyle = FACE; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill();
      g.strokeStyle = s === view.sel ? MARK : EDGE; g.lineWidth = s === view.sel ? 3 : 1.2; g.stroke();
      g.strokeStyle = red ? RED_INK : BLACK_INK; g.lineWidth = 1; g.beginPath(); g.arc(x, y, rad * 0.82, 0, 7); g.stroke();
      g.save(); g.translate(x, y);
      if (!red && view.faceToFace && !view.flip) g.rotate(Math.PI);
      g.fillStyle = red ? RED_INK : BLACK_INK; g.font = `bold ${rad * 1.15}px "Songti SC","Noto Serif CJK SC",serif`;
      g.fillText(PIECE_TEXT(p), 0, rad * 0.06);
      g.restore();
    }
    g.fillStyle = MARK;
    for (const t of view.targets ?? []) {
      const x = X(colOf(t)), y = Y(rowOf(t));
      g.beginPath();
      if (view.board[t]) { g.strokeStyle = MARK; g.lineWidth = 3; g.arc(x, y, rad + 2, 0, 7); g.stroke(); }
      else { g.arc(x, y, cell * 0.13, 0, 7); g.fill(); }
    }
  }

  canvas.addEventListener('click', (e) => {
    if (!geo) return;
    const box = canvas.getBoundingClientRect(), k = geo.w / box.width;
    let c = Math.round(((e.clientX - box.left) * k - geo.mx) / geo.cell);
    let r = Math.round(((e.clientY - box.top) * k - geo.my) / geo.cell);
    if (geo.flip) { c = 8 - c; r = 9 - r; }
    if (r >= 0 && r < 10 && c >= 0 && c < 9) onSquare(r * 9 + c);
  });

  return { node: canvas, draw, resize: () => draw() };
}

function line(g, x1, y1, x2, y2) { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
function corner(g, x, y, d, left, right) {
  const gap = d * 0.6;
  for (const sx of [left ? -1 : 0, right ? 1 : 0].filter(Boolean)) for (const sy of [-1, 1]) {
    g.beginPath(); g.moveTo(x + sx * gap, y + sy * (gap + d)); g.lineTo(x + sx * gap, y + sy * gap); g.lineTo(x + sx * (gap + d), y + sy * gap); g.stroke();
  }
}
function bracket(g, x, y, d) {
  g.strokeStyle = MARK; g.lineWidth = 2;
  const k = d * 0.35;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    g.beginPath(); g.moveTo(x + sx * d, y + sy * (d - k)); g.lineTo(x + sx * d, y + sy * d); g.lineTo(x + sx * (d - k), y + sy * d); g.stroke();
  }
}
