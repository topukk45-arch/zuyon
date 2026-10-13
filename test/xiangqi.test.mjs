/* 象棋规则。走法生成用公认的 perft 数钉住:开局 1 层 44、2 层 1920、3 层 79666,
 * 差一个就说明某个子的走法写错了。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fromFen, START, perft, legalMoves, inCheck, moveName, status, judgeRepeat, replay,
  mv, RED, BLACK,
} from '../src/lib/xiangqi.js';

// 'h2e2' 这种坐标:列 a~i 从左到右,行 0~9 从下(红方底线)往上
const sq = (s) => (9 - +s[1]) * 9 + (s.charCodeAt(0) - 97);
const M = (s) => mv(sq(s.slice(0, 2)), sq(s.slice(2, 4)));

test('perft:开局 1~3 层的走法数和公认值一致', () => {
  const b = fromFen(START);
  assert.equal(perft(b, RED, 1), 44);
  assert.equal(perft(b, RED, 2), 1920);
  assert.equal(perft(b, RED, 3), 79666);
});

test('蹩马腿、塞象眼', () => {
  const b = fromFen(START);
  const fromB1 = legalMoves(b, RED).filter((m) => (m & 127) === sq('b0'));
  assert.deepEqual(fromB1.map((m) => m >> 7).sort((x, y) => x - y), [sq('c2'), sq('a2')].sort((x, y) => x - y), '马 b0 只能跳 a2、c2');
  const leg = fromFen('4k4/9/9/9/9/9/9/9/1P7/1N1K5');           // b1 有兵,b0 的马往上跳被蹩
  assert.ok(!legalMoves(leg, RED).some((m) => (m & 127) === sq('b0') && (m >> 7) === sq('a2')), '被蹩马腿');
  const eye = fromFen('4k4/9/9/9/9/9/9/9/3P5/2BK5');               // d1 有子,c0 的相去 e2 被塞象眼
  assert.ok(!legalMoves(eye, RED).some((m) => (m & 127) === sq('c0') && (m >> 7) === sq('e2')));
});

test('将帅不能照面;不能送将', () => {
  const b = fromFen('4k4/9/9/9/9/9/9/9/9/3K5');
  assert.ok(!legalMoves(b, RED).some((m) => (m >> 7) === sq('e0')), '帅不能走到将的正对面');
  const pin = fromFen('4k4/9/9/9/4r4/9/9/9/4R4/4K4');             // 红车挡在两车之间,不能横走
  assert.ok(legalMoves(pin, RED).every((m) => (m & 127) !== sq('e1') || ((m >> 7) % 9) === 4));
  assert.ok(inCheck(fromFen('4k4/9/9/9/9/9/9/9/9/4K4'), RED), '中间没子,照面算将');
});

test('炮隔一个子打', () => {
  const b = fromFen('4k4/9/9/9/4p4/9/9/4P4/4C4/4K4');
  assert.ok(legalMoves(b, RED).some((m) => (m & 127) === sq('e1') && (m >> 7) === sq('e5')), '隔着兵打卒');
  assert.ok(inCheck(fromFen('4k4/9/9/9/4p4/9/9/9/4C4/3K5'), BLACK), '炮隔卒将军');
});

test('记谱:红用中文数字、黑用阿拉伯数字,前后区分同一路的子', () => {
  const b = fromFen(START);
  assert.equal(moveName(b, M('h2e2')), '炮二平五');
  assert.equal(moveName(b, M('b0c2')), '马八进七');
  assert.equal(moveName(b, M('h9g7')), '马8进7');
  assert.equal(moveName(b, M('a0a1')), '车九进一');
  assert.equal(moveName(b, M('c3c4')), '兵七进一');
  assert.equal(moveName(b, M('g6g5')), '卒7进1');
  assert.equal(moveName(b, M('c0e2')), '相七进五');
  assert.equal(moveName(b, M('f0e1')), '仕四进五');
  const two = fromFen('4k4/9/9/9/9/9/9/4R4/9/4RK3');
  assert.equal(moveName(two, M('e2d2')), '前车平六');
  assert.equal(moveName(two, M('e0d0')), '后车平六');
  const rook = fromFen('4k4/9/9/9/9/9/9/9/9/R3K4');
  assert.equal(moveName(rook, M('a0a5')), '车九进五');
});

test('绝杀和困毙都是输', () => {
  // 黑将在底线被红车将住,上一路也被另一个车封死
  const b = fromFen('R2k5/1R7/9/9/9/9/9/9/9/4K4');
  const s = status(b, BLACK);
  assert.equal(s.reason, '绝杀'); assert.equal(s.winner, RED);
  // 没被将,但 e9 会和帅照面、d8 被车管着,走不动
  const st = status(fromFen('3k5/R8/9/9/9/9/9/9/9/4K4'), BLACK);
  assert.ok(st.over && !st.check, '被照面和车封死,走不动');
  assert.equal(st.reason, '困毙');
  assert.equal(st.winner, RED);
  assert.ok(!status(fromFen(START), RED).over);
});

test('长将判负,其他重复判和', () => {
  // 红每步都将,黑每步都应将:同一局面第三次出现时,红长将判负
  const keys = ['A', 'B', 'C', 'D', 'A', 'B', 'C', 'D', 'A'];
  const checks = [false, true, false, true, false, true, false, true, false];
  assert.deepEqual(judgeRepeat(keys, checks), { winner: BLACK, reason: '红方长将判负' });
  assert.equal(judgeRepeat(keys, checks.map(() => false)).winner, -1, '都没将军就是和棋');
  assert.equal(judgeRepeat(['A', 'B', 'A'], [false, false, false]), null, '只出现两次还不判');
});

test('replay 摆一遍,遇到不合规则的就停', () => {
  const r = replay([M('h2e2'), M('h9g7'), M('h0g2'), M('e9e8'), M('e2e9')]);
  assert.deepEqual(r.names, ['炮二平五', '马8进7', '马二进三', '将5进1']);
  assert.equal(r.valid, 4, '炮不能隔两个子打');
  assert.equal(r.side, RED);
});
