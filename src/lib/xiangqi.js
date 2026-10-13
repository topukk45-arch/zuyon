/* 中国象棋规则与记谱。纯函数,node 里直接测。
 *
 * 棋盘:Int8Array(90),下标 = 行 * 9 + 列。第 0 行在上(黑方底线),第 9 行在下(红方底线)。
 * 棋子:1 帅/将 2 仕/士 3 相/象 4 马 5 车 6 炮 7 兵/卒;黑方 +8(9~15),0 是空。
 * 走法:整数 from | (to << 7)。
 * 一方:0 红,1 黑。红先。
 */

export const K = 1, A = 2, B = 3, N = 4, R = 5, C = 6, P = 7;
export const RED = 0, BLACK = 1;

export const rowOf = (s) => (s / 9) | 0;
export const colOf = (s) => s % 9;
export const sideOf = (p) => (p === 0 ? -1 : p > 8 ? BLACK : RED);
export const typeOf = (p) => p & 7;
export const mv = (f, t) => f | (t << 7);
export const mvFrom = (m) => m & 127;
export const mvTo = (m) => m >> 7;

const inBoard = (r, c) => r >= 0 && r < 10 && c >= 0 && c < 9;
const inPalace = (side, r, c) => c >= 3 && c <= 5 && (side === RED ? r >= 7 : r <= 2);
const ownHalf = (side, r) => (side === RED ? r >= 5 : r <= 4);

// ── 预先算好每个格子能去哪 ─────────────────
const KG = [], AD = [], BE = [], KN = [], KNA = [];
for (let s = 0; s < 90; s++) {
  const r = rowOf(s), c = colOf(s);
  KG[s] = [[-1, 0], [1, 0], [0, -1], [0, 1]].filter(([a, b]) => inBoard(r + a, c + b)).map(([a, b]) => (r + a) * 9 + c + b);
  AD[s] = [[-1, -1], [-1, 1], [1, -1], [1, 1]].filter(([a, b]) => inBoard(r + a, c + b)).map(([a, b]) => (r + a) * 9 + c + b);
  BE[s] = [[-2, -2], [-2, 2], [2, -2], [2, 2]].filter(([a, b]) => inBoard(r + a, c + b))
    .map(([a, b]) => [(r + a) * 9 + c + b, (r + a / 2) * 9 + c + b / 2]);
  KN[s] = []; KNA[s] = [];
  for (const [a, b] of [[-2, -1], [-2, 1], [2, -1], [2, 1], [-1, -2], [1, -2], [-1, 2], [1, 2]]) {
    // 马从 s 走 (a,b):马腿在长边方向的第一格
    if (inBoard(r + a, c + b)) KN[s].push([(r + a) * 9 + c + b, Math.abs(a) === 2 ? (r + a / 2) * 9 + c : r * 9 + c + b / 2]);
    // 谁能踢到 s:马在 s-(a,b),它的马腿按它自己的走法算
    const hr = r - a, hc = c - b;
    if (inBoard(hr, hc)) KNA[s].push([hr * 9 + hc, Math.abs(a) === 2 ? (hr + a / 2) * 9 + hc : hr * 9 + hc + b / 2]);
  }
}
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

export const START = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR';
const LETTER = { k: K, a: A, b: B, n: N, r: R, c: C, p: P };

/** FEN 的棋子部分 → 棋盘。只认 START 那种写法。 */
export function fromFen(fen = START) {
  const b = new Int8Array(90);
  fen.split(' ')[0].split('/').forEach((line, r) => {
    let c = 0;
    for (const ch of line) {
      if (/\d/.test(ch)) { c += +ch; continue; }
      const t = LETTER[ch.toLowerCase()];
      if (!t) throw new Error('看不懂的棋子:' + ch);
      b[r * 9 + c++] = t + (ch === ch.toLowerCase() ? 8 : 0);
    }
  });
  return b;
}
export const keyOf = (b, side) => b.join(',') + '|' + side;

/** 不考虑送将的全部走法。capturesOnly 只要吃子。 */
export function genMoves(b, side, capturesOnly = false) {
  const out = [];
  const ok = (to) => { const q = b[to]; return capturesOnly ? q !== 0 && sideOf(q) !== side : q === 0 || sideOf(q) !== side; };
  for (let s = 0; s < 90; s++) {
    const p = b[s];
    if (p === 0 || sideOf(p) !== side) continue;
    const r = rowOf(s), c = colOf(s);
    switch (typeOf(p)) {
      case K: for (const t of KG[s]) if (inPalace(side, rowOf(t), colOf(t)) && ok(t)) out.push(mv(s, t)); break;
      case A: for (const t of AD[s]) if (inPalace(side, rowOf(t), colOf(t)) && ok(t)) out.push(mv(s, t)); break;
      case B: for (const [t, eye] of BE[s]) if (ownHalf(side, rowOf(t)) && b[eye] === 0 && ok(t)) out.push(mv(s, t)); break;
      case N: for (const [t, leg] of KN[s]) if (b[leg] === 0 && ok(t)) out.push(mv(s, t)); break;
      case R:
        for (const [dr, dc] of DIRS) {
          for (let rr = r + dr, cc = c + dc; inBoard(rr, cc); rr += dr, cc += dc) {
            const t = rr * 9 + cc;
            if (b[t] === 0) { if (!capturesOnly) out.push(mv(s, t)); continue; }
            if (sideOf(b[t]) !== side) out.push(mv(s, t));
            break;
          }
        }
        break;
      case C:
        for (const [dr, dc] of DIRS) {
          let screen = false;
          for (let rr = r + dr, cc = c + dc; inBoard(rr, cc); rr += dr, cc += dc) {
            const t = rr * 9 + cc;
            if (!screen) {
              if (b[t] === 0) { if (!capturesOnly) out.push(mv(s, t)); } else screen = true;
            } else if (b[t] !== 0) { if (sideOf(b[t]) !== side) out.push(mv(s, t)); break; }
          }
        }
        break;
      case P: {
        const fr = side === RED ? r - 1 : r + 1;
        if (inBoard(fr, c) && ok(fr * 9 + c)) out.push(mv(s, fr * 9 + c));
        if (!ownHalf(side, r)) for (const cc of [c - 1, c + 1]) if (inBoard(r, cc) && ok(r * 9 + cc)) out.push(mv(s, r * 9 + cc));
        break;
      }
    }
  }
  return out;
}

export function kingSquare(b, side) {
  const k = side === RED ? K : K + 8;
  for (let s = side === RED ? 66 : 0; s < (side === RED ? 90 : 27); s++) if (b[s] === k) return s;
  return -1;
}

/** side 的将(帅)是不是被将着。将帅照面也算。 */
export function inCheck(b, side) {
  const k = kingSquare(b, side);
  if (k < 0) return true;
  const e = 1 - side, eo = e === BLACK ? 8 : 0, r = rowOf(k), c = colOf(k);
  for (const [dr, dc] of DIRS) {
    let screen = false;
    for (let rr = r + dr, cc = c + dc; inBoard(rr, cc); rr += dr, cc += dc) {
      const q = b[rr * 9 + cc];
      if (q === 0) continue;
      if (!screen) {
        if (q === R + eo || (q === K + eo && dc === 0)) return true;
        screen = true;
      } else { if (q === C + eo) return true; break; }
    }
  }
  for (const [h, leg] of KNA[k]) if (b[h] === N + eo && b[leg] === 0) return true;
  const pr = side === RED ? r - 1 : r + 1;                     // 对方的兵从我前面拱过来
  if (inBoard(pr, c) && b[pr * 9 + c] === P + eo) return true;
  for (const cc of [c - 1, c + 1]) if (inBoard(r, cc) && b[r * 9 + cc] === P + eo) return true;   // 九宫在对方过河后,横着也能拱
  return false;
}

/** 走一步,返回被吃的子,方便撤回。 */
export function make(b, m) { const f = mvFrom(m), t = mvTo(m), cap = b[t]; b[t] = b[f]; b[f] = 0; return cap; }
export function unmake(b, m, cap) { const f = mvFrom(m), t = mvTo(m); b[f] = b[t]; b[t] = cap; }

/** 合法走法:走完自己不能被将。 */
export function legalMoves(b, side) {
  return genMoves(b, side).filter((m) => {
    const cap = make(b, m), bad = inCheck(b, side);
    unmake(b, m, cap);
    return !bad;
  });
}

export function perft(b, side, depth) {
  if (depth === 0) return 1;
  let n = 0;
  for (const m of legalMoves(b, side)) { const cap = make(b, m); n += perft(b, 1 - side, depth - 1); unmake(b, m, cap); }
  return n;
}

// ── 记谱 ───────────────────────────────────
const NAMES = [null, ['帅', '将'], ['仕', '士'], ['相', '象'], ['马', '马'], ['车', '车'], ['炮', '炮'], ['兵', '卒']];
const CN = '一二三四五六七八九';
const num = (side, n) => (side === RED ? CN[n - 1] : String(n));
const fileOf = (side, c) => (side === RED ? 9 - c : c + 1);

/** 走之前的局面 + 这一步 → 「炮二平五」「马8进7」「前车进一」。 */
export function moveName(b, m) {
  const f = mvFrom(m), t = mvTo(m), p = b[f], side = sideOf(p), ty = typeOf(p);
  const fr = rowOf(f), fc = colOf(f), tr = rowOf(t), tc = colOf(t);
  const name = NAMES[ty][side];
  let head = name + num(side, fileOf(side, fc));
  if (ty !== A && ty !== B) {
    // 同一路上有两个以上同样的子:用前后区分
    const rows = [];
    for (let r = 0; r < 10; r++) if (b[r * 9 + fc] === p) rows.push(r);
    if (rows.length > 1) {
      rows.sort((x, y) => (side === RED ? x - y : y - x));    // 靠前的在前
      const i = rows.indexOf(fr);
      const tag = rows.length === 2 ? ['前', '后'][i] : rows.length === 3 ? ['前', '中', '后'][i] : CN[i];
      head = tag + name;
    }
  }
  if (fr === tr) return head + '平' + num(side, fileOf(side, tc));
  const fwd = side === RED ? tr < fr : tr > fr;
  const amount = ty === N || ty === B || ty === A ? fileOf(side, tc) : Math.abs(tr - fr);
  return head + (fwd ? '进' : '退') + num(side, amount);
}

/** 轮到 side 走时局面怎么样:走不动就输(被将死叫绝杀,没被将叫困毙)。 */
export function status(b, side) {
  const moves = legalMoves(b, side), check = inCheck(b, side);
  if (moves.length) return { over: false, check, moves };
  return { over: true, check, moves, winner: 1 - side, reason: check ? '绝杀' : '困毙' };
}

/**
 * 重复局面。keys[i] 是第 i 手之后的局面(keys[0] 开局),checks[i] 是第 i 手是不是将军。
 * 同一局面出现第三次时判:这一段里一方步步将军、另一方不是 → 将军的一方长将判负;否则和棋。
 * 长捉不判(规则太复杂,正式比赛都常有争议),按和棋算。
 */
export function judgeRepeat(keys, checks) {
  const n = keys.length - 1, last = keys[n];
  const seen = [];
  for (let i = n; i >= 0; i--) if (keys[i] === last) seen.push(i);
  if (seen.length < 3) return null;
  const from = seen[2];
  const all = [true, true];
  for (let ply = from + 1; ply <= n; ply++) if (!checks[ply]) all[(ply - 1) % 2] = false;
  if (all[0] !== all[1]) {
    const loser = all[0] ? RED : BLACK;
    return { winner: 1 - loser, reason: `${loser === RED ? '红' : '黑'}方长将判负` };
  }
  return { winner: -1, reason: '重复局面,和棋' };
}

/** 从头摆一遍。返回最终局面和每一手的记谱、是否将军;遇到不合规则的走法就停。 */
export function replay(moves) {
  const b = fromFen(START), names = [], keys = [keyOf(b, RED)], checks = [false];
  let side = RED, valid = 0;
  for (const m of moves) {
    if (!legalMoves(b, side).includes(m)) break;
    names.push(moveName(b, m)); make(b, m); side = 1 - side;
    keys.push(keyOf(b, side)); checks.push(inCheck(b, side)); valid++;
  }
  return { board: b, side, names, keys, checks, valid };
}

export const PIECE_TEXT = (p) => NAMES[typeOf(p)][sideOf(p)];
