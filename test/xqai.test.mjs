/* 象棋电脑。不追求它多强,只钉住「该杀的杀、白给的吃、不走不合规则的棋、按时交棋」。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { think } from '../src/lib/xqai.js';
import { fromFen, START, legalMoves, status, make, RED, BLACK, mv } from '../src/lib/xiangqi.js';

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
