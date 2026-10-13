/* 象棋电脑。传统办法:往后算几步(alpha-beta),局面好坏按子力 + 位置打分。
 * 不用神经网络,手机上离线跑。在 Worker 里算,不卡界面;没有 Worker 时也能直接调。
 *
 * 加速手段都是教科书上的:迭代加深、置换表、吃子优先排序、杀手着法、
 * 叶子上只再看吃子(静态搜索)、被将时多算一层。
 */

import {
  K, A, B, N, R, C, P, RED, genMoves, inCheck, make, unmake, mvFrom, mvTo, sideOf, typeOf,
} from './xiangqi.js';

const VAL = [0, 0, 120, 120, 270, 600, 285, 30];
const MATE = 30000;

// ── 位置分:按红方视角写,黑方上下镜像 ──────────
const PST = [null];
for (let t = 1; t <= 7; t++) {
  const tab = new Int16Array(90);
  for (let s = 0; s < 90; s++) {
    const r = (s / 9) | 0, c = s % 9, mid = Math.abs(c - 4);
    let v = 0;
    if (t === P) v = r >= 5 ? 0 : [15, 45, 40, 30, 20][r] + (mid <= 1 ? 10 : mid === 2 ? 4 : 0);
    if (t === N) v = 12 - 3 * mid - (r === 9 ? 12 : 0) + (r >= 2 && r <= 4 ? 10 : 0) - (c === 0 || c === 8 ? 8 : 0);
    if (t === R) v = (r <= 4 ? 8 : 0) + (mid === 1 ? 4 : 0) - (r === 9 && (c === 0 || c === 8) ? 6 : 0);
    if (t === C) v = (c === 4 ? 10 : 0) + (r === 7 ? 4 : 0) - (r <= 1 ? 6 : 0);
    if (t === K) v = (c === 4 ? 6 : 0) - (r !== 9 ? 8 : 0);
    if (t === A || t === B) v = c === 4 ? 4 : 0;
    tab[s] = v;
  }
  PST[t] = tab;
}
const mirror = (s) => (9 - ((s / 9) | 0)) * 9 + (s % 9);
/** 一个子在某格值多少(红正黑负)。 */
const pv = (p, s) => (sideOf(p) === RED ? VAL[typeOf(p)] + PST[typeOf(p)][s] : -(VAL[typeOf(p)] + PST[typeOf(p)][mirror(s)]));

// ── 局面指纹(置换表用),两组 32 位随机数 ──────────
let seed = 0x9e3779b9;
const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; };
const Z1 = [], Z2 = [];
for (let p = 0; p < 16; p++) { Z1[p] = Int32Array.from({ length: 90 }, rnd); Z2[p] = Int32Array.from({ length: 90 }, rnd); }
const ZS1 = rnd(), ZS2 = rnd();

const TT_BITS = 18, TT_SIZE = 1 << TT_BITS, TT_MASK = TT_SIZE - 1;

/** 三档难度:最多算几层、最多想多久、要不要故意放点水。 */
export const LEVELS = {
  easy: { name: '入门', depth: 2, ms: 300, noise: 60 },
  mid: { name: '业余', depth: 5, ms: 800, noise: 0 },
  hard: { name: '高手', depth: 30, ms: 2500, noise: 0 },
};

/**
 * 给局面找一步。board 是 Int8Array(90) 或普通数组,side 是该谁走。
 * history:之前出现过的局面指纹,遇到就当和棋(防止电脑自己绕圈)。这里只用本次搜索路径。
 * @returns {{ move:number, score:number, depth:number, nodes:number }}  move 为 0 表示无棋可走
 */
export function think({ board, side, level = 'mid', now = () => Date.now(), random = Math.random }) {
  const L = LEVELS[level] ?? LEVELS.mid;
  const b = Int8Array.from(board);
  let h1 = 0, h2 = 0, score = 0;
  for (let s = 0; s < 90; s++) if (b[s]) { h1 ^= Z1[b[s]][s]; h2 ^= Z2[b[s]][s]; score += pv(b[s], s); }
  if (side !== RED) { h1 ^= ZS1; h2 ^= ZS2; }

  const tKey = new Int32Array(TT_SIZE), tMove = new Int32Array(TT_SIZE), tScore = new Int16Array(TT_SIZE);
  const tDepth = new Int8Array(TT_SIZE).fill(-1), tFlag = new Int8Array(TT_SIZE);
  const killers = [], hist = new Int32Array(1 << 14), path = [];
  const deadline = now() + L.ms;
  let nodes = 0, stop = false, stm = side;

  const doMove = (m) => {
    const f = mvFrom(m), t = mvTo(m), p = b[f], cap = b[t];
    h1 ^= Z1[p][f] ^ Z1[p][t] ^ ZS1; h2 ^= Z2[p][f] ^ Z2[p][t] ^ ZS2;
    score += pv(p, t) - pv(p, f);
    if (cap) { h1 ^= Z1[cap][t]; h2 ^= Z2[cap][t]; score -= pv(cap, t); }
    make(b, m); stm = 1 - stm;
    return cap;
  };
  const undoMove = (m, cap) => {
    unmake(b, m, cap); stm = 1 - stm;
    const f = mvFrom(m), t = mvTo(m), p = b[f];
    h1 ^= Z1[p][f] ^ Z1[p][t] ^ ZS1; h2 ^= Z2[p][f] ^ Z2[p][t] ^ ZS2;
    score -= pv(p, t) - pv(p, f);
    if (cap) { h1 ^= Z1[cap][t]; h2 ^= Z2[cap][t]; score += pv(cap, t); }
  };
  const evalSide = () => (stm === RED ? score : -score);
  const mvv = (m) => { const v = b[mvTo(m)]; return v ? VAL[typeOf(v)] * 16 - VAL[typeOf(b[mvFrom(m)])] / 8 : 0; };

  function order(moves, ttMove, ply) {
    const k = killers[ply] ?? [];
    const key = (m) => (m === ttMove ? 1e9 : b[mvTo(m)] ? 1e6 + mvv(m) : m === k[0] ? 9e5 : m === k[1] ? 8e5 : hist[m & 16383]);
    return moves.map((m) => [key(m), m]).sort((x, y) => y[0] - x[0]).map((x) => x[1]);
  }

  function quiesce(alpha, beta, ply) {
    if ((++nodes & 2047) === 0 && now() > deadline) stop = true;
    const stand = evalSide();
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    if (ply > 40) return stand;
    for (const m of order(genMoves(b, stm, true), 0, ply)) {
      if (typeOf(b[mvTo(m)]) === K) return MATE - ply;
      const me = stm, cap = doMove(m);
      if (inCheck(b, me)) { undoMove(m, cap); continue; }
      const v = -quiesce(-beta, -alpha, ply + 1);
      undoMove(m, cap);
      if (stop) return 0;
      if (v >= beta) return v;
      if (v > alpha) alpha = v;
    }
    return alpha;
  }

  function search(depth, alpha, beta, ply) {
    if (ply > 0 && path.includes(h1)) return 0;               // 自己绕回来了,当和棋
    const chk = inCheck(b, stm);
    if (chk && ply < 24) depth++;                            // 被将时多算一层,免得看漏杀棋
    if (depth <= 0) return quiesce(alpha, beta, ply);
    if ((++nodes & 2047) === 0 && now() > deadline) stop = true;
    if (stop) return 0;

    const slot = h1 & TT_MASK, a0 = alpha;
    let ttMove = 0;
    if (tKey[slot] === h2 && tDepth[slot] >= 0) {
      ttMove = tMove[slot];
      if (ply > 0 && tDepth[slot] >= depth) {
        const v = tScore[slot], f = tFlag[slot];
        if (f === 0 || (f === 1 && v >= beta) || (f === 2 && v <= alpha)) return v;
      }
    }

    let best = -MATE, bestMove = 0, legal = 0;
    path.push(h1);
    for (const m of order(genMoves(b, stm), ttMove, ply)) {
      const me = stm, cap = doMove(m);
      if (inCheck(b, me)) { undoMove(m, cap); continue; }
      legal++;
      const v = -search(depth - 1, -beta, -alpha, ply + 1);
      undoMove(m, cap);
      if (stop) { path.pop(); return 0; }
      if (v > best) { best = v; bestMove = m; }
      if (v > alpha) alpha = v;
      if (alpha >= beta) {
        if (!cap) { const k = (killers[ply] ??= [0, 0]); if (k[0] !== m) { k[1] = k[0]; k[0] = m; } hist[m & 16383] += depth * depth; }
        break;
      }
    }
    path.pop();
    if (!legal) return -MATE + ply;                           // 走不动:绝杀和困毙都是输
    tKey[slot] = h2; tMove[slot] = bestMove; tScore[slot] = best; tDepth[slot] = depth;
    tFlag[slot] = best <= a0 ? 2 : best >= beta ? 1 : 0;
    return best;
  }

  // 根节点:逐层加深,时间到了就用上一层算完的结果
  let rootMoves = genMoves(b, stm).filter((m) => { const me = stm, cap = doMove(m); const ok = !inCheck(b, me); undoMove(m, cap); return ok; });
  if (!rootMoves.length) return { move: 0, score: -MATE, depth: 0, nodes };
  let bestMove = rootMoves[0], bestScore = -MATE, done = 0;
  for (let d = 1; d <= L.depth; d++) {
    const scored = [];
    let alpha = -MATE - 1;
    for (const m of rootMoves) {
      const cap = doMove(m);
      // 放水时每步都用全窗口算出真实分再加噪声;不能拿加过噪声的分去收窄窗口,否则误差会一路累加
      let v = -search(d - 1, -MATE - 1, L.noise ? MATE + 1 : -alpha, 1);
      undoMove(m, cap);
      if (stop) break;
      if (L.noise) v += Math.round((random() * 2 - 1) * L.noise);
      else if (v > alpha) alpha = v;
      scored.push([v, m]);
    }
    if (stop && scored.length < rootMoves.length) {
      // 这一层没算完:只有它已经算出更好的才采用
      const top = scored.sort((x, y) => y[0] - x[0])[0];
      if (top && top[1] === bestMove && top[0] > bestScore) bestScore = top[0];
      break;
    }
    scored.sort((x, y) => y[0] - x[0]);
    bestMove = scored[0][1]; bestScore = scored[0][0]; done = d;
    rootMoves = scored.map((x) => x[1]);                      // 下一层先算这一层最好的
    if (bestScore > MATE - 100 || now() > deadline) break;
  }
  return { move: bestMove, score: bestScore, depth: done, nodes };
}
