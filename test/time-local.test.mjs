/* 纯日期按本地 0 点算。必须钉在非 UTC 的时区里测 —— 在 UTC 下旧 bug 根本看不出来。 */
process.env.TZ = 'Asia/Shanghai';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDateText } from '../src/lib/time.js';

const local0 = (y, mo, d) => new Date(y, mo - 1, d).getTime();

test('只写日期:本地 0 点,不是 UTC 0 点(北京早上 8 点)', () => {
  assert.equal(parseDateText('2026-10-15').getTime(), local0(2026, 10, 15));
  assert.equal(parseDateText('2026/10/15').getTime(), local0(2026, 10, 15));
  assert.equal(parseDateText('2026/1/5').getTime(), local0(2026, 1, 5));
});

test('只写日期和写 00:00 是同一个时刻', () => {
  assert.equal(parseDateText('2026-10-15').getTime(), parseDateText('2026-10-15 00:00:00').getTime());
});

test('不存在的日期报错,不悄悄滚到下个月', () => {
  assert.throws(() => parseDateText('2026-02-30'));
  assert.throws(() => parseDateText('2026-13-01'));
});
