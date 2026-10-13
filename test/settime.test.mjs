/* 改服务器时间。拨错一个小时,测出来的结论就全是错的,所以夏令时边界都钉住。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  offsetMin, toWall, fromWall, wallText, offsetText, offsetLabel, command,
  nextBoundary, beforeNext, parseLocal, serverNow, validZone, PRESETS, ZONES,
} from '../src/lib/settime.js';

const at = (iso) => Date.parse(iso);

test('固定偏移和 IANA 时区都认', () => {
  assert.equal(offsetMin('UTC+7', 0), 420);
  assert.equal(offsetMin('UTC-3:30', 0), -210);
  assert.equal(offsetMin('Asia/Ho_Chi_Minh', at('2026-10-13T00:00Z')), 420);
  assert.equal(offsetMin('Europe/Istanbul', at('2026-01-01T00:00Z')), 180, '土耳其全年 +3');
  assert.equal(offsetMin('Asia/Singapore', at('2026-07-01T00:00Z')), 480);
  assert.ok(validZone('Europe/Paris') && validZone('UTC+8') && !validZone('Mars/Base'));
  for (const p of PRESETS) assert.ok(validZone(p.zone), p.name);
  for (const [z] of ZONES) assert.ok(validZone(z), z);
});

test('德国、法国的夏令时按那一天现算', () => {
  assert.equal(offsetMin('Europe/Berlin', at('2026-10-24T12:00Z')), 120, '10 月 25 日前是夏令时 +2');
  assert.equal(offsetMin('Europe/Berlin', at('2026-10-26T12:00Z')), 60, '之后是冬令时 +1');
  assert.equal(offsetMin('Europe/Paris', at('2026-07-01T00:00Z')), 120);
  assert.equal(command('Europe/Berlin', at('2026-10-24T21:59:50Z')), 'sudo date -s "2026-10-24 23:59:50 +0200"');
  assert.equal(command('Europe/Berlin', at('2026-10-26T22:59:50Z')), 'sudo date -s "2026-10-26 23:59:50 +0100"');
});

test('夏令时切换那一小时:不存在的钟点顺延,出现两次的取第一次', () => {
  const gap = fromWall('Europe/Berlin', { y: 2026, mo: 3, d: 29, h: 2, mi: 30, s: 0 });
  assert.equal(gap.status, 'gap');
  assert.equal(wallText(toWall('Europe/Berlin', gap.ms)), '2026-03-29 03:30:00');
  const ov = fromWall('Europe/Berlin', { y: 2026, mo: 10, d: 25, h: 2, mi: 30, s: 0 });
  assert.equal(ov.status, 'overlap');
  assert.equal(ov.ms, at('2026-10-25T00:30Z'), '第一次 02:30 还在夏令时');
  assert.equal(fromWall('Asia/Ho_Chi_Minh', { y: 2026, mo: 10, d: 15, h: 23, mi: 59, s: 50 }).status, 'ok');
});

test('命令格式:带时区和不带', () => {
  const ms = at('2026-10-15T16:59:50Z');
  assert.equal(command('Asia/Ho_Chi_Minh', ms), 'sudo date -s "2026-10-15 23:59:50 +0700"');
  assert.equal(command('Asia/Ho_Chi_Minh', ms, false), 'sudo date -s "2026-10-15 23:59:50"');
  assert.equal(offsetText(-210), '-0330');
  assert.equal(offsetLabel(420), 'UTC+7');
  assert.equal(offsetLabel(330), 'UTC+5:30');
});

test('下一个 0 点 / 周一 / 月初,都按服的时区', () => {
  const now = at('2026-10-13T02:00Z');                         // 越南 09:00,周二
  const z = 'Asia/Ho_Chi_Minh';
  assert.equal(wallText(toWall(z, nextBoundary('day', z, now))), '2026-10-14 00:00:00');
  assert.equal(wallText(toWall(z, nextBoundary('week', z, now))), '2026-10-19 00:00:00');
  assert.equal(wallText(toWall(z, nextBoundary('month', z, now))), '2026-11-01 00:00:00');
  const mon = fromWall(z, { y: 2026, mo: 10, d: 19, h: 8 }).ms;  // 已经是周一,就去下周一
  assert.equal(wallText(toWall(z, nextBoundary('week', z, mon))), '2026-10-26 00:00:00');
  const dec = fromWall(z, { y: 2026, mo: 12, d: 5 }).ms;
  assert.equal(wallText(toWall(z, nextBoundary('month', z, dec))), '2027-01-01 00:00:00', '跨年');
});

test('「0 点前 N 秒」永远在现在之后,时间不往回拨', () => {
  const z = 'Asia/Ho_Chi_Minh';
  const now = at('2026-10-13T02:00Z');
  assert.equal(command(z, beforeNext('day', z, now, 10)), 'sudo date -s "2026-10-13 23:59:50 +0700"');
  // 已经拨到 23:59:55,再要「0 点前 10 秒」只能是明天的
  const late = fromWall(z, { y: 2026, mo: 10, d: 13, h: 23, mi: 59, s: 55 }).ms;
  assert.equal(command(z, beforeNext('day', z, late, 10)), 'sudo date -s "2026-10-14 23:59:50 +0700"');
  assert.ok(beforeNext('month', z, late, 10) > late);
});

test('手填时间按服的时区解释;服务器现在几点会往前走', () => {
  const r = parseLocal('Europe/Istanbul', '2026-10-15T23:59:50');
  assert.equal(r.ms, at('2026-10-15T20:59:50Z'));
  assert.equal(parseLocal('Asia/Singapore', '2026-10-15T08:00').ms, at('2026-10-15T00:00Z'), '不带秒也行');
  assert.throws(() => parseLocal('Asia/Singapore', '明天'), /格式/);
  assert.equal(serverNow(null, 1000), 1000);
  assert.equal(serverNow({ target: 5000, at: 1000 }, 4000), 8000, '拨完过了 3 秒,服务器也走了 3 秒');
});
