/* 围棋规则。规则错了,复盘就全错,所以提子、打劫、禁着点每条都钉住。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyBoard, play, replay, toMove, estimate, score, winProb, winSeries,
  starPoints, coordName, recordText, toSgf, parseSgf,
} from '../src/lib/go.js';

// 'ee' 这种 SGF 坐标写法,测试里读起来最省事
const pt = (s) => ({ x: s.charCodeAt(0) - 97, y: s.charCodeAt(1) - 97 });
const game = (size, list) => ({
  size,
  moves: list.map((p, i) => (p === '' ? { c: i % 2 ? -1 : 1, pass: true } : { c: i % 2 ? -1 : 1, ...pt(p) })),
});

test('提子:四面围住就拿掉,提子数记给下的一方', () => {
  // 黑 D5 F5 E4 E6 围白 E5
  const g = game(9, ['de', 'ee', 'fe', 'ai', 'ef', 'ah', 'ed']);
  const r = replay(g);
  assert.equal(r.board[4][4], 0, '白子应被提');
  assert.equal(r.caps[1], 1);
  assert.equal(r.caps[-1], 0);
  assert.deepEqual(r.capList, [0, 0, 0, 0, 0, 0, 1]);
});

test('禁着点:自己没气又提不了子,不许下', () => {
  let b = emptyBoard(9);
  for (const [x, y] of [[1, 0], [0, 1]]) b = play(b, 1, x, y).board;   // 黑围住角上 A9
  assert.match(play(b, -1, 0, 0).error, /禁着点/);
  assert.ok(play(b, 1, 0, 0).board, '自己的眼自己可以填');
});

test('打劫:不许立刻提回,隔一手可以', () => {
  // 黑 B8 A7 B6 C7,白 C8 D7 C6 B7 —— 第 8 手白 B7 提掉黑 C7,形成劫
  const ko = game(9, ['bb', 'cb', 'ac', 'dc', 'bd', 'cd', 'cc', 'bc']);
  const k = replay(ko);
  assert.equal(k.valid, 8);
  assert.equal(k.caps[-1], 1, '白提了一子');
  const back = play(k.board, 1, 2, 2, k.prevKey);                      // 黑立刻提回 C7
  assert.match(back.error, /打劫/);
  // 黑先找劫材,白应一手,黑再提就可以
  const g2 = { size: 9, moves: [...ko.moves, { c: 1, x: 8, y: 8 }, { c: -1, x: 8, y: 0 }, { c: 1, x: 2, y: 2 }] };
  assert.equal(replay(g2).valid, 11);
});

test('replay 遇到违规的一手就停,不抛', () => {
  const g = game(9, ['ee', 'ee', 'ff']);
  assert.equal(replay(g).valid, 1);
});

test('轮谁下:停一手也算一手', () => {
  const g = game(9, ['ee', '']);
  assert.equal(toMove(g, 0), 1);
  assert.equal(toMove(g, 1), -1);
  assert.equal(toMove(g, 2), 1);
});

test('估算:围起来的空地整块归属,两种规则都算得通', () => {
  // 黑在 9 路左边竖一道墙(C 列),左边两列应归黑
  const b = emptyBoard(9);
  for (let y = 0; y < 9; y++) b[y][2] = 1;
  const est = estimate(b);
  assert.ok(est.terrB >= 18, '墙左边 18 格至少都归黑');
  assert.equal(est.areaB, est.terrB + 9);
  const caps = { 1: 2, '-1': 0 };
  assert.equal(score(est, caps, { rule: 'cn', komi: 7 }), est.areaB - est.areaW - 7);
  assert.equal(score(est, caps, { rule: 'jp', komi: 6.5 }), est.terrB + 2 - est.terrW - 6.5);
});

test('胜率:空盘 50%,领先越多越高,且在 0~1 之间', () => {
  assert.equal(winProb(-7, 0, 9), 0.5);
  assert.ok(winProb(10, 40, 9) > winProb(2, 40, 9));
  assert.ok(winProb(-30, 70, 19) < 0.5 && winProb(-30, 70, 19) > 0);
  const s = winSeries(game(9, ['ee', 'cc', 'gg']), { rule: 'cn', komi: 7 });
  assert.equal(s.length, 4, '含第 0 手');
});

test('星位与坐标', () => {
  assert.equal(starPoints(9).length, 5);
  assert.equal(starPoints(13).length, 9);
  assert.equal(starPoints(19).length, 9);
  assert.equal(coordName({ x: 0, y: 0 }, 19), 'A19');
  assert.equal(coordName({ x: 8, y: 0 }, 19), 'J19', '跳过 I');
  assert.equal(coordName({ x: 4, y: 4 }, 9), 'E5');
  assert.equal(coordName({ pass: true }, 9), '停一手');
});

test('走子记录带提子与注释', () => {
  const g = game(9, ['de', 'ee', 'fe', 'ai', 'ef', 'ah', 'ed']);
  g.moves[0].note = '先占\n要点';
  const t = recordText(g, { black: '甲', white: '乙' });
  assert.match(t, /^9 路 {2}黑:甲 {2}白:乙/);
  assert.match(t, /1\. 黑 D5 {2}\(先占 要点\)/);
  assert.match(t, /7\. 黑 E6 提1/);
});

test('SGF 往返:名字、贴目、规则、注释、停一手都不丢', () => {
  const g = game(13, ['dd', 'jj', '', 'gg']);
  g.moves[1].note = '这里有 ] 和 \\ 也要转义';
  const sgf = toSgf(g, { black: '黑[1]', white: '白', komi: 6.5, rule: 'jp' });
  const back = parseSgf(sgf);
  assert.equal(back.game.size, 13);
  assert.deepEqual(back.game.moves, g.moves);
  assert.equal(back.black, '黑[1]');
  assert.equal(back.komi, 6.5);
  assert.equal(back.rule, 'jp');
});

test('SGF:分支只读第一条,怪尺寸和让子报清楚', () => {
  const r = parseSgf('(;GM[1]SZ[9];B[ee];W[cc](;B[gg];W[gc])(;B[aa]))');
  assert.deepEqual(r.game.moves.map((m) => m.x + ',' + m.y), ['4,4', '2,2', '6,6', '6,2']);
  assert.throws(() => parseSgf('(;SZ[15];B[aa])'), /15 路/);
  assert.throws(() => parseSgf('(;SZ[19]AB[dd][pp];W[qd])'), /让子/);
  assert.throws(() => parseSgf('随便一段字'), /开头/);
  assert.equal(parseSgf('(;B[dd])').game.size, 19, '不写 SZ 默认 19 路');
});
