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

/** 重复局面里长将的一方判负。比任何子力差都大,但比绝杀小,不会被当成杀棋提前收手。 */
const REP_LOSS = 20000;

const hashOf = (b, side) => {
  let h1 = 0, h2 = 0;
  for (let s = 0; s < 90; s++) if (b[s]) { h1 ^= Z1[b[s]][s]; h2 ^= Z2[b[s]][s]; }
  return side === RED ? [h1, h2] : [h1 ^ ZS1, h2 ^ ZS2];
};
const countPieces = (b) => { let n = 0; for (let s = 0; s < 90; s++) if (b[s]) n++; return n; };

/**
 * 给局面找一步。board 是 Int8Array(90) 或普通数组,side 是该谁走。
 * history:当前局面之前的对局局面,从早到晚,每项 { board, side, check }
 *   (check:轮到 side 走时是不是被将着,也就是上一手是不是将军)。
 *   推演走回这些局面、或走回本次推演里出现过的局面,都按裁判同一条规矩判:
 *   这一圈里一方步步将军、另一方不是,将军的一方输;否则和棋(见 xiangqi.js 的 judgeRepeat)。
 *   不传就只认本次推演里的重复。
 * @returns {{ move:number, score:number, depth:number, nodes:number }}  move 为 0 表示无棋可走
 */
export function think({ board, side, level = 'mid', history = [], now = () => Date.now(), random = Math.random }) {
  const L = LEVELS[level] ?? LEVELS.mid;
  const b = Int8Array.from(board);
  let h1 = 0, h2 = 0, score = 0;
  for (let s = 0; s < 90; s++) if (b[s]) { h1 ^= Z1[b[s]][s]; h2 ^= Z2[b[s]][s]; score += pv(b[s], s); }
  if (side !== RED) { h1 ^= ZS1; h2 ^= ZS2; }

  // 整条线:对局历史 + 当前局面 + 推演路径。第 i 项是一个局面的指纹、子数、轮到的一方是不是被将着。
  // 吃过子的局面回不去,所以历史只留子数和现在一样的那一截。
  let pieces = countPieces(b);
  const LH1 = [], LH2 = [], LP = [], LC = [];
  let from = history.length;
  while (from > 0 && countPieces(history[from - 1].board) === pieces) from--;
  for (let i = from; i < history.length; i++) {
    const [a1, a2] = hashOf(history[i].board, history[i].side);
    LH1.push(a1); LH2.push(a2); LP.push(pieces); LC.push(!!history[i].check);
  }

  const tKey = new Int32Array(TT_SIZE), tMove = new Int32Array(TT_SIZE), tScore = new Int16Array(TT_SIZE);
  const tDepth = new Int8Array(TT_SIZE).fill(-1), tFlag = new Int8Array(TT_SIZE);
  const killers = [], hist = new Int32Array(1 << 14);
  const deadline = now() + L.ms;
  let nodes = 0, stop = false, stm = side;

  const doMove = (m) => {
    const f = mvFrom(m), t = mvTo(m), p = b[f], cap = b[t];
    h1 ^= Z1[p][f] ^ Z1[p][t] ^ ZS1; h2 ^= Z2[p][f] ^ Z2[p][t] ^ ZS2;
    score += pv(p, t) - pv(p, f);
    if (cap) { h1 ^= Z1[cap][t]; h2 ^= Z2[cap][t]; score -= pv(cap, t); pieces--; }
    make(b, m); stm = 1 - stm;
    return cap;
  };
  const undoMove = (m, cap) => {
    unmake(b, m, cap); stm = 1 - stm;
    const f = mvFrom(m), t = mvTo(m), p = b[f];
    h1 ^= Z1[p][f] ^ Z1[p][t] ^ ZS1; h2 ^= Z2[p][f] ^ Z2[p][t] ^ ZS2;
    score -= pv(p, t) - pv(p, f);
    if (cap) { h1 ^= Z1[cap][t]; h2 ^= Z2[cap][t]; score += pv(cap, t); pieces++; }
  };

  /* 当前局面(还没进线,下标就是线长 n)是不是走回了线上的某个局面。
   * 是的话按 judgeRepeat 的规矩给分(站在轮到走的一方看),不是返回 null。
   * 同一方走的局面隔一步出现,一圈至少四步;子数变了往前就不可能再重复。 */
  function repeatScore(chk) {
    const n = LH1.length;
    for (let j = n - 4; j >= 0 && LP[j] === pieces; j -= 2) {
      if (LH1[j] !== h1 || LH2[j] !== h2) continue;
      // 这一圈是 j+1..n 这几步。第 i 步是不是将军 = 走完之后轮到的一方被将着。
      // 第 n 步是对手走的,往前隔一步交替。
      let them = true, me = true;
      for (let i = n; i > j; i--) if (!(i === n ? chk : LC[i])) { if ((n - i) % 2 === 0) them = false; else me = false; }
      if (them !== me) return them ? REP_LOSS : -REP_LOSS;     // 对手长将:我赢;我长将:我输
      return 0;
    }
    return null;
  }
  const enter = (chk) => { LH1.push(h1); LH2.push(h2); LP.push(pieces); LC.push(chk); };
  const leave = () => { LH1.pop(); LH2.pop(); LP.pop(); LC.pop(); };
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
    const chk = inCheck(b, stm);
    const rep = repeatScore(chk);                             // 走回了出现过的局面:按长将 / 和棋判
    if (rep !== null) return rep;
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
    enter(chk);
    for (const m of order(genMoves(b, stm), ttMove, ply)) {
      const me = stm, cap = doMove(m);
      if (inCheck(b, me)) { undoMove(m, cap); continue; }
      legal++;
      const v = -search(depth - 1, -beta, -alpha, ply + 1);
      undoMove(m, cap);
      if (stop) { leave(); return 0; }
      if (v > best) { best = v; bestMove = m; }
      if (v > alpha) alpha = v;
      if (alpha >= beta) {
        if (!cap) { const k = (killers[ply] ??= [0, 0]); if (k[0] !== m) { k[1] = k[0]; k[0] = m; } hist[m & 16383] += depth * depth; }
        break;
      }
    }
    leave();
    if (!legal) return -MATE + ply;                           // 走不动:绝杀和困毙都是输
    tKey[slot] = h2; tMove[slot] = bestMove; tScore[slot] = best; tDepth[slot] = depth;
    tFlag[slot] = best <= a0 ? 2 : best >= beta ? 1 : 0;
    return best;
  }

  // 根节点:逐层加深,时间到了就用上一层算完的结果
  let rootMoves = genMoves(b, stm).filter((m) => { const me = stm, cap = doMove(m); const ok = !inCheck(b, me); undoMove(m, cap); return ok; });
  if (!rootMoves.length) return { move: 0, score: -MATE, depth: 0, nodes };
  enter(inCheck(b, stm));                                    // 当前局面也在线上,走回来同样算重复
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
