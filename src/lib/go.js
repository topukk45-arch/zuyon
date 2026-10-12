/* 围棋规则与估算。纯函数,不碰 DOM,node 里直接测。
 *
 * 坐标:x 从左到右 0..n-1,y 从上到下 0..n-1(与 SGF 一致)。
 * 颜色:黑 1,白 -1,空 0。
 * 一局棋:{ size, moves: [{ c, x, y, note? } | { c, pass: true, note? }] }
 */

export const SIZES = [9, 13, 19];
const LETTERS = 'ABCDEFGHJKLMNOPQRST';   // 不用 I,这是棋盘坐标的惯例

export const emptyBoard = (n) => Array.from({ length: n }, () => Array(n).fill(0));
const keyOf = (b) => b.map((r) => r.join('')).join('/');

function neighbors(n, x, y) {
  const r = [];
  if (x > 0) r.push([x - 1, y]);
  if (x < n - 1) r.push([x + 1, y]);
  if (y > 0) r.push([x, y - 1]);
  if (y < n - 1) r.push([x, y + 1]);
  return r;
}

/** 一块棋的子与气数。 */
export function group(b, x, y) {
  const n = b.length, c = b[y][x];
  const seen = new Set([x + ',' + y]), stack = [[x, y]], stones = [], libs = new Set();
  while (stack.length) {
    const [cx, cy] = stack.pop();
    stones.push([cx, cy]);
    for (const [nx, ny] of neighbors(n, cx, cy)) {
      const v = b[ny][nx];
      if (v === 0) libs.add(nx + ',' + ny);
      else if (v === c && !seen.has(nx + ',' + ny)) { seen.add(nx + ',' + ny); stack.push([nx, ny]); }
    }
  }
  return { stones, libs: libs.size };
}

/**
 * 落一子。prevKey 是上一手之前的局面,用来判打劫(只查一步,不做全局同形)。
 * @returns {{board, captured} | {error}}
 */
export function play(b, c, x, y, prevKey = null) {
  const n = b.length;
  if (b[y][x] !== 0) return { error: '这里已经有子了' };
  const nb = b.map((r) => r.slice());
  nb[y][x] = c;
  let captured = 0;
  for (const [nx, ny] of neighbors(n, x, y)) {
    if (nb[ny][nx] !== -c) continue;
    const g = group(nb, nx, ny);
    if (g.libs === 0) { for (const [sx, sy] of g.stones) nb[sy][sx] = 0; captured += g.stones.length; }
  }
  if (group(nb, x, y).libs === 0) return { error: '禁着点:这步下去自己没有气' };
  if (prevKey && keyOf(nb) === prevKey) return { error: '打劫:要先在别处下一手才能提回' };
  return { board: nb, captured };
}

/**
 * 从头摆到第 upto 手。遇到不合规则的一手就停,valid 告诉调用方停在哪。
 * each(i, board, caps) 每一步之后调用一次(含第 0 步),走势图用它。
 */
export function replay(game, upto = game.moves.length, each = null) {
  const n = game.size;
  let b = emptyBoard(n), prev = null, last = null, valid = 0;
  const caps = { 1: 0, '-1': 0 }, nums = emptyBoard(n), capList = [];
  if (each) each(0, b, caps);
  for (let i = 0; i < upto; i++) {
    const m = game.moves[i];
    if (m.pass) { prev = keyOf(b); last = null; capList[i] = 0; }
    else {
      const r = play(b, m.c, m.x, m.y, prev);
      if (r.error) break;
      prev = keyOf(b); b = r.board; caps[m.c] += r.captured;
      nums[m.y][m.x] = i + 1; last = [m.x, m.y]; capList[i] = r.captured;
    }
    valid = i + 1;
    if (each) each(i + 1, b, caps);
  }
  return { board: b, caps, prevKey: prev, last, nums, capList, valid };
}

export const toMove = (game, upto) => (upto === 0 ? 1 : -game.moves[upto - 1].c);
export const countStones = (b) => b.reduce((s, r) => s + r.filter((v) => v).length, 0);

/**
 * 势力估算。每颗子向四周 4 格内辐射,距离每远一格减半;
 * 再把只被一种颜色围住的空地整块划给它。不判死活 —— 死子照样算活的。
 */
export function estimate(b) {
  const n = b.length, inf = emptyBoard(n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const c = b[y][x];
    if (!c) continue;
    for (let yy = Math.max(0, y - 4); yy <= Math.min(n - 1, y + 4); yy++)
      for (let xx = Math.max(0, x - 4); xx <= Math.min(n - 1, x + 4); xx++) {
        const d = Math.abs(xx - x) + Math.abs(yy - y);
        if (d > 0 && d <= 4) inf[yy][xx] += c * 2 ** (1 - d);
      }
  }
  const own = emptyBoard(n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    own[y][x] = b[y][x] || (inf[y][x] > 0.55 ? 1 : inf[y][x] < -0.55 ? -1 : 0);
  }
  const seen = emptyBoard(n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (b[y][x] || seen[y][x]) continue;
    const region = [], stack = [[x, y]], border = new Set();
    seen[y][x] = 1;
    while (stack.length) {
      const [cx, cy] = stack.pop();
      region.push([cx, cy]);
      for (const [nx, ny] of neighbors(n, cx, cy)) {
        if (b[ny][nx]) border.add(b[ny][nx]);
        else if (!seen[ny][nx]) { seen[ny][nx] = 1; stack.push([nx, ny]); }
      }
    }
    if (border.size === 1 && region.length < n * n / 2) {
      const c = [...border][0];
      for (const [rx, ry] of region) own[ry][rx] = c;
    }
  }
  let areaB = 0, areaW = 0, terrB = 0, terrW = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (own[y][x] === 1) { areaB++; if (!b[y][x]) terrB++; }
    else if (own[y][x] === -1) { areaW++; if (!b[y][x]) terrW++; }
  }
  return { own, areaB, areaW, terrB, terrW };
}

/**
 * 黑方领先多少目(负数是白领先)。
 * 中国规则:子 + 地。日本规则:地 + 提掉对方的子。两种都减贴目。
 */
export function score(est, caps, { rule = 'cn', komi = 7 } = {}) {
  if (rule === 'jp') return est.terrB + caps[1] - est.terrW - caps[-1] - komi;
  return est.areaB - est.areaW - komi;
}

/** 由领先目数换算的粗略胜率。棋盘越满越确定,不是 AI 算的。 */
export function winProb(margin, stones, n) {
  if (stones === 0) return 0.5;
  const fill = Math.min(1, stones / (n * n * 0.5));
  return 1 / (1 + Math.exp(-margin / ((2.5 + 9 * (1 - fill)) * n / 9)));
}

/** 整盘的胜率序列,第 i 项是走完 i 手后的黑胜率。 */
export function winSeries(game, opts) {
  const out = [];
  replay(game, game.moves.length, (i, b, caps) => {
    out.push(winProb(score(estimate(b), caps, opts), countStones(b), game.size));
  });
  return out;
}

export function starPoints(n) {
  const lines = { 9: [2, 4, 6], 13: [3, 6, 9], 19: [3, 9, 15] }[n] ?? [];
  const pts = [];
  for (const a of lines) for (const b of lines) {
    if (n === 9 && (a === 4) !== (b === 4)) continue;   // 9 路只有四角和天元
    pts.push([a, b]);
  }
  return pts;
}

export const colName = (x) => LETTERS[x];
export const coordName = (m, n) => (m.pass ? '停一手' : LETTERS[m.x] + (n - m.y));

/** 方便贴到聊天里的走子记录。 */
export function recordText(game, { black = '黑方', white = '白方', komi = 7, rule = 'cn' } = {}) {
  const { capList } = replay(game);
  const head = `${game.size} 路  黑:${black}  白:${white}  贴目:${komi}  `
    + `规则:${rule === 'jp' ? '日本(数目)' : '中国(数子)'}  共 ${game.moves.length} 手`;
  return [head, ...game.moves.map((m, i) =>
    `${i + 1}. ${m.c === 1 ? '黑' : '白'} ${coordName(m, game.size)}`
    + (capList[i] ? ` 提${capList[i]}` : '')
    + (m.note ? `  (${m.note.replace(/\s+/g, ' ')})` : ''))].join('\n');
}

// ── SGF ──────────────────────────────────

const esc = (s) => String(s).replace(/[\]\\]/g, (ch) => '\\' + ch);
const sgfPt = (m) => (m.pass ? '' : String.fromCharCode(97 + m.x) + String.fromCharCode(97 + m.y));

export function toSgf(game, { black = '', white = '', komi = 7, rule = 'cn' } = {}) {
  let s = `(;GM[1]FF[4]CA[UTF-8]SZ[${game.size}]KM[${komi}]RU[${rule === 'jp' ? 'Japanese' : 'Chinese'}]`
    + `PB[${esc(black)}]PW[${esc(white)}]`;
  for (const m of game.moves) {
    s += `;${m.c === 1 ? 'B' : 'W'}[${sgfPt(m)}]`;
    if (m.note) s += `C[${esc(m.note)}]`;
  }
  return s + ')';
}

/** 读主线。遇到分支只取第一条变化。让子、摆子的局面不支持。 */
export function parseSgf(text) {
  const s = String(text);
  let i = s.indexOf('(');
  if (i < 0) throw new Error('没找到棋谱开头的「(」');
  i++;

  const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  const value = () => {
    let v = '';
    i++;                                         // [
    while (i < s.length && s[i] !== ']') { if (s[i] === '\\') i++; v += s[i] ?? ''; i++; }
    i++;                                         // ]
    return v;
  };
  const skipTree = () => {
    let depth = 0;
    do {
      if (s[i] === '[') { value(); continue; }
      if (s[i] === '(') depth++;
      else if (s[i] === ')') depth--;
      i++;
    } while (depth > 0 && i < s.length);
  };
  const sequence = () => {
    const nodes = [];
    while (i < s.length) {
      ws();
      if (s[i] === ';') {
        i++;
        const node = {};
        for (;;) {
          ws();
          const id = /^[A-Za-z]+/.exec(s.slice(i, i + 16));
          if (!id) break;
          i += id[0].length;
          const key = id[0].replace(/[a-z]/g, ''), vals = [];
          for (;;) { ws(); if (s[i] !== '[') break; vals.push(value()); }
          node[key] = vals;
        }
        nodes.push(node);
      } else if (s[i] === '(') {
        i++;
        nodes.push(...sequence());               // 第一条变化当主线
        for (;;) { ws(); if (s[i] === '(') skipTree(); else break; }
        if (s[i] === ')') i++;
        return nodes;
      } else if (s[i] === ')') { i++; return nodes; }
      else i++;
    }
    return nodes;
  };

  const nodes = sequence();
  if (!nodes.length) throw new Error('棋谱是空的');
  const root = nodes[0];
  const size = root.SZ ? parseInt(root.SZ[0], 10) : 19;
  if (!SIZES.includes(size)) throw new Error(`这是 ${root.SZ[0]} 路棋谱,只支持 9、13、19 路`);
  if (root.AB || root.AW) throw new Error('暂不支持让子或摆好的初始局面');

  const moves = [];
  for (const nd of nodes) {
    const v = nd.B ?? nd.W;
    if (!v) continue;
    const m = { c: nd.B ? 1 : -1 };
    const p = v[0] ?? '';
    if (p === '' || p === 'tt') m.pass = true;
    else {
      m.x = p.charCodeAt(0) - 97; m.y = p.charCodeAt(1) - 97;
      if (!(m.x >= 0 && m.x < size && m.y >= 0 && m.y < size)) throw new Error('坐标超出棋盘:' + p);
    }
    if (nd.C?.[0]) m.note = nd.C[0];
    moves.push(m);
  }
  const km = root.KM ? parseFloat(root.KM[0]) : NaN;
  return {
    game: { size, moves },
    black: root.PB?.[0] ?? null,
    white: root.PW?.[0] ?? null,
    komi: Number.isFinite(km) ? km : null,
    rule: root.RU ? (/japan/i.test(root.RU[0]) ? 'jp' : 'cn') : null,
  };
}
