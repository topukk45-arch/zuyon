/* lib/ 是纯函数,在 node 里直接跑,不需要浏览器也不需要真机。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStamp, formatUTC, relative } from '../src/lib/time.js';
import {
  parseHex, toHex, tryParseHex, luminance, contrastRatio, wcagLevels, readableOn,
  mixPigment, mixLight, mixAverage, normalize, hue, chroma, hueDelta, hueRelation,
  hslHex, dominantColor,
} from '../src/lib/color.js';

test('10 位当秒,13 位当毫秒', () => {
  assert.equal(formatUTC(parseStamp('1757000000')), '2025-09-04 15:33:20');
  assert.equal(parseStamp('1757000000123').getTime(), 1757000000123);
  assert.throws(() => parseStamp('123'), /10 位/);
});

test('相对时间', () => {
  const now = new Date('2026-09-04T00:00:00Z');
  assert.equal(relative(new Date('2026-09-03T00:00:00Z'), now), '1天前');
  assert.equal(relative(new Date('2026-09-04T02:00:00Z'), now), '2小时后');
});

test('颜色解析与回写', () => {
  assert.deepEqual(parseHex('#abc'), [0xaa, 0xbb, 0xcc]);
  assert.deepEqual(parseHex('EFEDE4'), [239, 237, 228]);
  assert.equal(toHex([29, 27, 22]), '#1D1B16');
  assert.equal(toHex([-5, 300, 22]), '#00FF16', '越界要夹住');
  assert.throws(() => parseHex('#12'), /RRGGBB/);
  assert.equal(tryParseHex('乱写'), null, '宽松版不抛');
});

test('对比度与 WCAG', () => {
  assert.equal(contrastRatio([0, 0, 0], [255, 255, 255]).toFixed(2), '21.00');
  assert.equal(contrastRatio([1, 2, 3], [1, 2, 3]).toFixed(2), '1.00');
  assert.ok(luminance([255, 255, 255]) > luminance([0, 0, 0]));
  const r = contrastRatio(parseHex('#1D1B16'), parseHex('#EFEDE4'));
  assert.ok(wcagLevels(r).normalAAA, `默认配色只有 ${r.toFixed(2)}`);
  assert.equal(readableOn([255, 255, 0]), '#111111', '黄底上要压黑字');
  assert.equal(readableOn([0, 0, 128]), '#FFFFFF', '深蓝底上要压白字');
});

test('三个混色模型 · 对齐原版 color-mixer 的输出', () => {
  const cols = ['#903CC1', '#478B30', '#1D70B6'].map(parseHex);
  const ws = normalize([33.3, 33.3, 33.3]);
  assert.equal(toHex(mixPigment(cols, ws)), '#30564F');
  assert.equal(toHex(mixLight(cols, ws)),   '#A1B6FF');
  assert.equal(toHex(mixAverage(cols, ws)), '#51688D');
});

test('混色模型的性质', () => {
  const w2 = [0.5, 0.5];
  // 颜料和算术平均:同色自混还是自己
  for (const mix of [mixPigment, mixAverage]) {
    const out = mix([[120, 80, 40], [120, 80, 40]], w2);
    out.forEach((v, i) => assert.ok(Math.abs(v - [120, 80, 40][i]) <= 2, `${mix.name} 同色自混偏了`));
  }
  // 光混合故意不幂等:两盏同色灯打在一处应该更亮,这是模型的物理含义
  assert.ok(luminance(mixLight([[120, 80, 40], [120, 80, 40]], w2)) > luminance([120, 80, 40]));
  // 颜料混合会变暗(互补相遇调脏),光混合会变亮
  const pair = [parseHex('#FF0000'), parseHex('#00FF00')];
  assert.ok(luminance(mixPigment(pair, w2)) < luminance(mixAverage(pair, w2)));
  assert.ok(luminance(mixLight(pair, w2))   > luminance(mixAverage(pair, w2)));
});

test('权重归一化', () => {
  assert.deepEqual(normalize([1, 1, 2]), [0.25, 0.25, 0.5]);
  assert.deepEqual(normalize([0, 0]), [0.5, 0.5], '全零时退化成平均');
});

test('色相与彩度', () => {
  assert.equal(hue([255, 0, 0]), 0);
  assert.equal(Math.round(hue([0, 255, 0])), 120);
  assert.equal(Math.round(hue([0, 0, 255])), 240);
  assert.equal(hue([128, 128, 128]), null, '灰色没有色相');
  assert.equal(chroma([255, 0, 0]), 1);
  assert.equal(chroma([100, 100, 100]), 0);
  assert.equal(hueDelta(350, 10), 20, '跨 0° 要走短边');
});

test('色相关系判断的阈值', () => {
  const rel = (hexes) => {
    const cols = hexes.map(parseHex);
    return hueRelation(cols, mixPigment(cols, normalize(cols.map(() => 1))));
  };
  assert.equal(rel(['#FF0000', '#00FFFF']).kind, 'complementary');
  assert.equal(rel(['#FF0000', '#FF8000']).kind, 'analogous');
  assert.equal(rel(['#FF0000', '#00FF00']).kind, 'medium', '120° 落在中间档');
  assert.equal(rel(['#888888', '#8A8A8A']).kind, 'unknown', '全是灰,判断不了');
  // 截图里那组:最大色差 173°,彩度 44%
  const r = rel(['#903CC1', '#478B30', '#1D70B6']);
  assert.equal(r.maxDelta.toFixed(0), '173');
  assert.equal((r.chroma * 100).toFixed(0), '44');
});

test('HSL 生成', () => {
  assert.equal(hslHex(0, 1, 0.5), '#FF0000');
  assert.equal(hslHex(120, 1, 0.5), '#00FF00');
  assert.equal(hslHex(0, 0, 1), '#FFFFFF');
});

test('整图主色 · 跳过近灰近黑与透明', () => {
  const px = (...list) => Uint8ClampedArray.from(list.flat());
  // 两个纯红 + 一个灰(会被跳过)
  assert.deepEqual(
    dominantColor(px([200, 20, 20, 255], [200, 20, 20, 255], [128, 128, 128, 255])),
    [200, 20, 20],
  );
  // 透明像素不计
  assert.deepEqual(
    dominantColor(px([200, 20, 20, 255], [0, 200, 0, 10])),
    [200, 20, 20],
  );
  // 全是灰 → null,调用方据此提示「试试单击取色」
  assert.equal(dominantColor(px([128, 128, 128, 255], [10, 10, 10, 255])), null);
});
