/* 角色卡解析。现场拼一张合法 PNG,不依赖任何素材文件。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isPng, parseChunks, textChunks, readCard, readCardFromText,
  normalizeCard, describeEntry, estimateTokens, weigh,
} from '../src/lib/charcard.js';

const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** 拼一个块:长度(4) 类型(4) 数据 CRC(4)。CRC 填零 —— 解析侧不校验。 */
function chunk(type, data) {
  const body = new Uint8Array(data);
  const out = new Uint8Array(12 + body.length);
  new DataView(out.buffer).setUint32(0, body.length);
  out.set([...type].map((c) => c.charCodeAt(0)), 4);
  out.set(body, 8);
  return out;
}

function png(...chunks) {
  const parts = [new Uint8Array(SIG), ...chunks, chunk('IEND', [])];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

function textChunk(keyword, value) {
  const kw = [...keyword].map((c) => c.charCodeAt(0));
  const v = [...value].map((c) => c.charCodeAt(0));
  return chunk('tEXt', [...kw, 0, ...v]);
}

/* 裸 JSON 的卡里,中文是以 UTF-8 字节躺在块里的。
 * 上面那个 textChunk 用 charCodeAt 逐字符写,超过 255 会被截断 ——
 * 只适合写 base64 那种纯 ASCII 的值。中文走这个。 */
function utf8TextChunk(keyword, value) {
  const kw = [...keyword].map((c) => c.charCodeAt(0));
  return chunk('tEXt', [...kw, 0, ...new TextEncoder().encode(value)]);
}

const b64 = (s) => Buffer.from(s, 'utf-8').toString('base64');

const SAMPLE = {
  spec: 'chara_card_v2',
  spec_version: '2.0',
  data: {
    name: '殷紫萍',
    creator: '杜云康',
    character_version: 'v13',
    tags: ['原创'],
    description: '南京。修行者。',
    first_mes: '你来了。',
    character_book: {
      entries: [
        {
          name: '世界观', keys: [], content: '苍蓝界。', constant: true,
          insertion_order: 100, position: 'after_char', extensions: { position: 1 },
        },
        {
          name: '文风指导', keys: ['文风'], content: '不写心理独白。',
          insertion_order: 100, extensions: { position: 4, depth: 4, probability: 100, useProbability: true, role: 0 },
        },
      ],
    },
  },
};

test('认得 PNG 文件头', () => {
  assert.equal(isPng(png()), true);
  assert.equal(isPng(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])), false);
});

test('按块切开,IEND 为止', () => {
  const chunks = parseChunks(png(textChunk('chara', 'AAA')));
  assert.deepEqual(chunks.map((c) => c.type), ['tEXt', 'IEND']);
});

test('挑出文本块的关键字', () => {
  const t = textChunks(parseChunks(png(textChunk('chara', 'AAA'), textChunk('Software', 'x'))));
  assert.deepEqual(t.map((x) => x.keyword), ['chara', 'Software']);
});

test('从 PNG 读出整张卡', async () => {
  const card = await readCard(png(textChunk('chara', b64(JSON.stringify(SAMPLE)))));
  assert.equal(card.name, '殷紫萍');
  assert.equal(card.spec, 'chara_card_v2');
  assert.equal(card.keyword, 'chara');
  assert.equal(card.fields.find((f) => f.key === 'description').text, '南京。修行者。');
  assert.equal(card.book.entries.length, 2);
});

test('V3 的 ccv3 优先于 chara', async () => {
  const v3 = { spec: 'chara_card_v3', spec_version: '3.0', data: { name: '新的' } };
  const card = await readCard(png(
    textChunk('chara', b64(JSON.stringify(SAMPLE))),
    textChunk('ccv3', b64(JSON.stringify(v3))),
  ));
  assert.equal(card.name, '新的');
});

test('压缩过的 zTXt 块也解得开', async () => {
  const { deflateSync } = await import('node:zlib');
  const payload = deflateSync(Buffer.from(b64(JSON.stringify(SAMPLE)), 'latin1'));
  const kw = [...'chara'].map((c) => c.charCodeAt(0));
  const z = chunk('zTXt', [...kw, 0, 0, ...payload]);
  const card = await readCard(png(z));
  assert.equal(card.name, '殷紫萍');
});

test('iTXt 里的裸 UTF-8 不走 base64', async () => {
  const json = Buffer.from(JSON.stringify(SAMPLE), 'utf-8');
  const kw = [...'chara'].map((c) => c.charCodeAt(0));
  // 关键字 NUL 压缩标志 压缩方法 语言标签 NUL 翻译关键字 NUL 文本
  const i = chunk('iTXt', [...kw, 0, 0, 0, 0, 0, ...json]);
  const card = await readCard(png(i));
  assert.equal(card.name, '殷紫萍');
});

test('V1 平铺结构也认', () => {
  const card = normalizeCard({ name: '老卡', description: '一段设定' });
  assert.equal(card.spec, 'chara_card_v1');
  assert.equal(card.fields.length, 1);
});

test('找不到卡数据时,错误要说明是哪一种', async () => {
  await assert.rejects(() => readCard(png()), /一个文本块都没有/);
  await assert.rejects(
    () => readCard(png(textChunk('Software', 'x'))),
    /没有角色卡.*Software/s,
  );
  await assert.rejects(() => readCard(png(textChunk('chara', '%%%'))), /base64/);
});

test('裸 JSON 和 base64 都能直接吃', () => {
  assert.equal(readCardFromText(JSON.stringify(SAMPLE)).name, '殷紫萍');
  assert.equal(readCardFromText(b64(JSON.stringify(SAMPLE))).name, '殷紫萍');
  assert.throws(() => readCardFromText('{坏的'), /JSON 是坏的/);
});

test('位置码翻译成人话', () => {
  const [a, b] = SAMPLE.data.character_book.entries.map(describeEntry);
  assert.equal(a.trigger, '常驻');
  assert.equal(a.position, '角色定义后 ↓Char');
  assert.equal(a.depth, null);
  assert.equal(b.trigger, '关键词');
  assert.equal(b.position, '插入深度 @D');
  assert.equal(b.depth, 4);
  assert.equal(b.role, '系统');
  assert.equal(b.enabled, true, 'enabled 缺省视为启用');
});

test('中文按一字一枚粗估', () => {
  assert.equal(estimateTokens('苍蓝界'), 3);
  assert.equal(estimateTokens(''), 0);
  assert.ok(estimateTokens('abcdefg') < 7, '拉丁字母要打折');
});

test('常驻部分单独称重', () => {
  const w = weigh(normalizeCard(SAMPLE));
  assert.equal(w.entries, 2);
  assert.equal(w.constant, estimateTokens('苍蓝界。'), '只算常驻那条');
  assert.ok(w.total > w.resident);
});

test('开场白不算进底噪', () => {
  const w = weigh(normalizeCard(SAMPLE));
  assert.equal(w.resident, estimateTokens('南京。修行者。'), '底噪只有角色描述');
  assert.equal(w.episodic, estimateTokens('你来了。'), '开场白单独列');
  assert.ok(w.total >= w.resident + w.episodic + w.constant, 'total 仍是全卡');
});

/* 0.5 的回归:以前只在 iTXt 分支判「是不是 base64」,tEXt 一律当 base64 解,
 * 于是裸 JSON 的卡会撞上「数据块可能在传输中被截断了」—— 数据是好的,
 * 报错却把人引去重新找原图。判断改成按内容看,不按块类型看。 */
test('tEXt 里的裸 JSON 不当成 base64', async () => {
  const card = await readCard(png(utf8TextChunk('chara', JSON.stringify(SAMPLE))));
  assert.equal(card.name, '殷紫萍');
  assert.equal(card.spec, 'chara_card_v2');
});

test('裸 JSON 前面有换行也认得出来', async () => {
  const card = await readCard(png(utf8TextChunk('chara', `\n  ${JSON.stringify(SAMPLE)}`)));
  assert.equal(card.name, '殷紫萍');
});
