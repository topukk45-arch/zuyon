/* 围棋棋盘与走势图的画法。只管画和点,不懂规则 ——
 * 局面、归属、哪一手是最后一手,都由调用方算好了递进来。
 *
 * 用 canvas 不用 SVG:19 路三百多颗子,手机上重画一次 canvas 更省;
 * 而且 SVG 要写命名空间网址,那会撞上「不联网」那条规矩的正则。 */

import { el } from './index.js';

// 棋子和棋盘是实物的颜色,不随主题变 —— 白子在深色模式下也该是白的。
export const WOODS = [
  { name: '榧木', fill: '#DCB06B', line: '#3D2A12' },
  { name: '浅木', fill: '#EAD1A0', line: '#3D2A12' },
  { name: '深木', fill: '#B98A4F', line: '#2B1D0B' },
  { name: '灰绿', fill: '#B9C4A7', line: '#26301F' },
];
const BLACK = '#1B1B1B', WHITE = '#F5F3EC', LAST = '#C8321F';
export const STONE = { black: BLACK, white: WHITE };

const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function sizeCanvas(canvas, cssW, cssH) {
  const dpr = globalThis.devicePixelRatio || 1;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const g = canvas.getContext?.('2d');
  if (g) g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return g;                                   // jsdom 里是 null,调用方跳过绘制
}

/**
 * 棋盘。onPoint(x, y) 在点中交叉点时调用。
 * 返回 { node, draw(view), resize() }。
 */
export function boardView(onPoint) {
  const canvas = el('canvas', { style: 'width:100%;aspect-ratio:1;display:block;touch-action:manipulation;border-radius:var(--radius-sm)' });
  let view = null, geo = null, hover = null;

  function geometry(n, w) {
    const margin = w * (n === 19 ? 0.055 : 0.075);
    return { n, w, margin, cell: (w - margin * 2) / (n - 1) };
  }

  function draw(v = view) {
    view = v;
    if (!view) return;
    const w = canvas.clientWidth;
    if (!w) return;                           // 还没排版(或在 jsdom 里),等下一帧
    const g = sizeCanvas(canvas, w, w);
    if (!g) return;
    const { board, own, nums, last, stars, wood, showNums, ghost } = view;
    const n = board.length;
    geo = geometry(n, w);
    const { margin: m, cell } = geo, P = (i) => m + i * cell;

    g.fillStyle = wood.fill; g.fillRect(0, 0, w, w);
    g.strokeStyle = wood.line; g.fillStyle = wood.line;
    for (let i = 0; i < n; i++) {
      g.lineWidth = i === 0 || i === n - 1 ? 1.4 : 0.7;
      g.beginPath(); g.moveTo(P(0), P(i)); g.lineTo(P(n - 1), P(i)); g.stroke();
      g.beginPath(); g.moveTo(P(i), P(0)); g.lineTo(P(i), P(n - 1)); g.stroke();
    }
    g.font = `${Math.max(8, m * 0.38)}px system-ui,sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      g.fillText('ABCDEFGHJKLMNOPQRST'[i], P(i), m * 0.42);
      g.fillText(String(n - i), m * 0.42, P(i));
    }
    for (const [x, y] of stars) { g.beginPath(); g.arc(P(x), P(y), Math.max(1.6, cell * 0.08), 0, 7); g.fill(); }

    if (own) {
      const t = cell * 0.28;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        if (!own[y][x] || board[y][x]) continue;
        g.globalAlpha = 0.55; g.fillStyle = own[y][x] === 1 ? BLACK : WHITE;
        g.fillRect(P(x) - t / 2, P(y) - t / 2, t, t); g.globalAlpha = 1;
      }
    }

    const r = cell * 0.48;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const c = board[y][x];
      if (!c) continue;
      g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.arc(P(x) + r * 0.06, P(y) + r * 0.1, r, 0, 7); g.fill();
      g.fillStyle = c === 1 ? BLACK : WHITE; g.beginPath(); g.arc(P(x), P(y), r, 0, 7); g.fill();
      g.strokeStyle = c === 1 ? '#000' : '#8A8475'; g.lineWidth = 0.6; g.stroke();
      const isLast = last && last[0] === x && last[1] === y;
      if (showNums && nums[y][x]) {
        g.fillStyle = isLast ? LAST : c === 1 ? WHITE : BLACK;
        g.font = `${isLast ? 700 : 500} ${r * (nums[y][x] > 99 ? 0.75 : 0.95)}px system-ui,sans-serif`;
        g.fillText(String(nums[y][x]), P(x), P(y) + r * 0.04);
      }
    }
    if (last) {
      g.strokeStyle = LAST; g.lineWidth = Math.max(1.5, cell * 0.05);
      g.beginPath(); g.arc(P(last[0]), P(last[1]), showNums ? r + 2 : r * 0.36, 0, 7); g.stroke();
    }
    const gh = hover ?? ghost;
    if (gh && !board[gh.y][gh.x]) {
      g.globalAlpha = 0.5; g.fillStyle = gh.c === 1 ? BLACK : WHITE;
      g.beginPath(); g.arc(P(gh.x), P(gh.y), r, 0, 7); g.fill(); g.globalAlpha = 1;
    }
  }

  function pointAt(e) {
    if (!geo) return null;
    const box = canvas.getBoundingClientRect(), s = geo.w / box.width;
    const x = Math.round(((e.clientX - box.left) * s - geo.margin) / geo.cell);
    const y = Math.round(((e.clientY - box.top) * s - geo.margin) / geo.cell);
    return x >= 0 && y >= 0 && x < geo.n && y < geo.n ? { x, y } : null;
  }

  canvas.addEventListener('click', (e) => { const p = pointAt(e); if (p) onPoint(p.x, p.y); });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || !view) return;
    const p = pointAt(e);
    hover = p ? { ...p, c: view.turn } : null;
    draw();
  });
  canvas.addEventListener('pointerleave', () => { hover = null; draw(); });

  return { node: canvas, draw, resize: () => draw() };
}

/** 胜率走势。series[i] 是第 i 手后的黑胜率;onPick(i) 点图跳手。 */
export function trendView(onPick) {
  const canvas = el('canvas', { style: 'width:100%;height:110px;display:block;touch-action:manipulation' });
  let data = null;
  const L = 34, R = 8, T = 8, B = 18;

  function draw(series = data?.series, cursor = data?.cursor) {
    data = { series, cursor };
    if (!series) return;
    const w = canvas.clientWidth, h = 110;
    if (!w) return;
    const g = sizeCanvas(canvas, w, h);
    if (!g) return;
    const ink = token('--ink'), ink3 = token('--ink-3'), line = token('--paper-3'), acc = token('--accent');
    const n = Math.max(1, series.length - 1);
    const X = (i) => L + (w - L - R) * i / n, Y = (p) => T + (h - T - B) * (1 - p);

    g.font = '10px system-ui,sans-serif'; g.textBaseline = 'middle';
    for (const p of [0, 0.5, 1]) {
      g.strokeStyle = line; g.lineWidth = p === 0.5 ? 1.2 : 0.8;
      g.setLineDash(p === 0.5 ? [] : [3, 3]);
      g.beginPath(); g.moveTo(L, Y(p)); g.lineTo(w - R, Y(p)); g.stroke();
      g.fillStyle = ink3; g.textAlign = 'right';
      g.fillText(p === 1 ? '黑 100' : p === 0 ? '白 100' : '50', L - 4, Y(p));
    }
    g.setLineDash([]);
    if (series.length < 2) {
      g.textAlign = 'center'; g.fillText('下几手之后这里会出现走势', (L + w) / 2, h / 2);
      return;
    }
    const step = series.length > 200 ? 50 : series.length > 100 ? 20 : series.length > 40 ? 10 : 5;
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    for (let i = 0; i < series.length; i += step) g.fillText(String(i), X(i), h - 4);

    g.beginPath(); g.moveTo(X(0), Y(0.5));
    series.forEach((p, i) => g.lineTo(X(i), Y(p)));
    g.lineTo(X(series.length - 1), Y(0.5)); g.closePath();
    g.globalAlpha = 0.1; g.fillStyle = ink; g.fill(); g.globalAlpha = 1;
    g.beginPath(); series.forEach((p, i) => (i ? g.lineTo(X(i), Y(p)) : g.moveTo(X(i), Y(p))));
    g.strokeStyle = ink; g.lineWidth = 1.6; g.lineJoin = 'round'; g.stroke();

    g.strokeStyle = acc; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(X(cursor), T); g.lineTo(X(cursor), h - B); g.stroke();
    g.fillStyle = acc; g.beginPath(); g.arc(X(cursor), Y(series[cursor] ?? 0.5), 4, 0, 7); g.fill();
  }

  canvas.addEventListener('click', (e) => {
    const s = data?.series;
    if (!s || s.length < 2) return;
    const box = canvas.getBoundingClientRect();
    const x = (e.clientX - box.left) * (canvas.clientWidth || box.width) / box.width;
    onPick(Math.max(0, Math.min(s.length - 1, Math.round((x - L) / ((box.width - L - R)) * (s.length - 1)))));
  });

  return { node: canvas, draw, resize: () => draw() };
}

/** 落子声。合成一声短促的「啪」,不带音频文件。 */
let audio = null;
export function clack() {
  try {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    audio = audio || new AC();
    const len = 0.06, buf = audio.createBuffer(1, Math.floor(audio.sampleRate * len), audio.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 6;
    const src = audio.createBufferSource(); src.buffer = buf;
    const f = audio.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 1.2;
    src.connect(f).connect(audio.destination); src.start();
  } catch { /* 没声音不影响下棋 */ }
}
