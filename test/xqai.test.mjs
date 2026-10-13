/* 象棋电脑。不追求它多强,只钉住「该杀的杀、白给的吃、不走不合规则的棋、按时交棋」。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { think } from '../src/lib/xqai.js';
import { fromFen, START, legalMoves, status, make, inCheck, replay, historyOf, RED, BLACK, mv } from '../src/lib/xiangqi.js';

const sq = (s) => (9 - +s[1]) * 9 + (s.charCodeAt(0) - 97);

test('一步杀:看得见', () => {
  // 红车 a8 走到 a9 将死(b8 车封住上一路,帅照着 e 路)
  const b = fromFen('3k5/R8/1R7/9/9/9/9/9/9/4K4');
  const r = think({ board: b, side: RED, level: 'mid' });
  make(b, r.move);
  const s = status(b, BLACK);
  assert.ok(s.over && s.winner === RED, '应当一步将死');
});

test('白给的车要吃', () => {
  // 黑车送到红炮嘴边(隔着兵),红该吃
  const b = fromFen('3k5/9/9/9/4r4/9/9/4P4/4C4/4K4');
  const r = think({ board: b, side: RED, level: 'mid' });
  assert.equal(r.move, mv(sq('e1'), sq('e5')));
});

test('开局走的是合规则的棋,三档都按时交棋', () => {
  for (const level of ['easy', 'mid', 'hard']) {
    const b = fromFen(START);
    const t = Date.now();
    const r = think({ board: b, side: RED, level });
    const used = Date.now() - t;
    assert.ok(legalMoves(fromFen(START), RED).includes(r.move), level + ' 走法合法');
    assert.ok(used < { easy: 1500, mid: 2500, hard: 4500 }[level], `${level} 用了 ${used}ms`);
  }
});

test('没棋可走时返回 0,不抛错', () => {
  const b = fromFen('R2k5/1R7/9/9/9/9/9/9/9/4K4');               // 黑被将死
  assert.equal(think({ board: b, side: BLACK }).move, 0);
});

test('入门档会放水:同一局面多试几次,不总走同一步', () => {
  const seen = new Set();
  let x = 1;
  for (let i = 0; i < 8; i++) {
    const random = () => { x = (x * 16807) % 2147483647; return x / 2147483647; };
    seen.add(think({ board: fromFen(START), side: RED, level: 'easy', random }).move);
  }
  assert.ok(seen.size > 1);
});

// ── 重复局面:电脑和裁判(judgeRepeat)按同一条规矩 ─────────
// 红车在第 2 行左右横移,步步将军;黑将在 3、4 路之间躲。黑多一匹马,红有理由想逼和。
// 走法:A(红车 e 路将,黑走)→ B(将到 d 路,红走)→ C(车到 d 路将,黑走)→ D(将回 e 路,红走)
const rep = (k, r) => fromFen([k, '9', r, '9', 'n8', '9', '6r2', '9', '9', '5K3'].join('/'));
const A = rep('4k4', '4R4'), B = rep('3k5', '4R4'), C = rep('3k5', '3R5'), D = rep('4k4', '3R5');
const at = (b, side) => ({ board: Array.from(b), side, check: inCheck(b, side) });
const SHUTTLE = mv(2 * 9 + 3, 2 * 9 + 4);                  // 车 (2,3)→(2,4),走回 A

test('不知道历史时,红会去长将(对照组:证明下面那条测的是真东西)', () => {
  const r = think({ board: D, side: RED, level: 'mid' });
  assert.equal(r.move, SHUTTLE);
});

test('知道这一圈已经将过一轮,红不再长将(长将判负),三档都一样', () => {
  for (const level of ['easy', 'mid', 'hard']) {
    const r = think({ board: D, side: RED, level, random: () => 0.5, history: [at(A, BLACK), at(B, RED), at(C, BLACK)] });
    assert.notEqual(r.move, SHUTTLE, level);
    assert.ok(legalMoves(D, RED).includes(r.move), level);
  }
});

test('被长将的一方:走回重复局面就是对方判负,电脑算得出这是赢', () => {
  const history = [at(B, RED), at(C, BLACK), at(D, RED), at(A, BLACK), at(B, RED)];
  const r = think({ board: C, side: BLACK, level: 'mid', history });
  assert.equal(r.move, mv(3, 4));                          // 将 (0,3)→(0,4),走回 D
  assert.ok(r.score >= 15000, `分数 ${r.score}`);
});

test('historyOf:从对局里取出的历史和手摆的一致(轮到谁、是不是被将)', () => {
  const g = replay([mv(7 * 9 + 7, 7 * 9 + 4), mv(0 * 9 + 7, 2 * 9 + 6)]);  // 炮二平五 马8进7
  const h = historyOf(g);
  assert.equal(h.length, 2);
  assert.deepEqual(h.map((x) => x.side), [RED, BLACK]);
  assert.deepEqual(h[0].board, Array.from(fromFen(START)));
  assert.ok(h.every((x) => x.check === false));
});
