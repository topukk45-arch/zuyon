/* 角色卡解析。纯函数,不碰 DOM,能在 node 里直接测。
 *
 * 角色卡是一张普通 PNG,JSON 藏在 PNG 规范允许的辅助文本块里:
 *
 *   文件头 8 字节 | 块 | 块 | ... | IEND
 *   每个块 = 长度(4) 类型(4) 数据(长度) CRC(4)
 *
 * 看图软件不认识 tEXt 就跳过,所以图片照常显示,数据搭便车。
 * 关键字 chara 是 V1/V2,ccv3 是 V3,值都是 base64 后的 UTF-8 JSON。
 *
 * tEXt 规定只能装 Latin-1,中文塞不进去 —— 这就是为什么一定要先 base64。
 * 少数卡用 zTXt(压缩)或 iTXt(原生 UTF-8),两种都收。
 */

const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const CARD_KEYS = ['ccv3', 'chara'];

export const isPng = (bytes) => SIG.every((b, i) => bytes[i] === b);

const ascii = (bytes) => Array.from(bytes, (b) => String.fromCharCode(b)).join('');

/** 按 PNG 块结构切开。文件被截断也返回已读到的部分,不整个失败。 */
export function parseChunks(bytes) {
  if (!isPng(bytes)) throw new Error('不是 PNG 文件');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = [];
  let pos = 8;
  while (pos + 8 <= bytes.length) {
    const len = view.getUint32(pos);
    const type = ascii(bytes.subarray(pos + 4, pos + 8));
    const end = pos + 8 + len;
    if (end > bytes.length) break;
    out.push({ type, data: bytes.subarray(pos + 8, end) });
    if (type === 'IEND') break;
    pos = end + 4;
  }
  return out;
}

/** 挑出三种文本块,统一成 { keyword, body, compressed, utf8 }。 */
export function textChunks(chunks) {
  const out = [];
  for (const c of chunks) {
    const nul = c.data.indexOf(0);
    if (nul < 0) continue;
    const keyword = ascii(c.data.subarray(0, nul));

    if (c.type === 'tEXt') {
      out.push({ keyword, body: c.data.subarray(nul + 1), compressed: false, utf8: false });
    } else if (c.type === 'zTXt') {
      // 关键字 NUL 压缩方法(1) 压缩数据
      out.push({ keyword, body: c.data.subarray(nul + 2), compressed: true, utf8: false });
    } else if (c.type === 'iTXt') {
      // 关键字 NUL 压缩标志(1) 压缩方法(1) 语言标签 NUL 翻译关键字 NUL 文本
      const compressed = c.data[nul + 1] === 1;
      let p = nul + 3;
      let seen = 0;
      while (p < c.data.length && seen < 2) { if (c.data[p] === 0) seen += 1; p += 1; }
      out.push({ keyword, body: c.data.subarray(p), compressed, utf8: true });
    }
  }
  return out;
}

/** zlib 解压。DecompressionStream 在安卓 WebView 和 node 里都有,不引第三方库。 */
export async function inflate(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('这个 WebView 太老,解不开压缩过的文本块');
  }
  const ds = new DecompressionStream('deflate');
  const writer = ds.writable.getWriter();
  // 不 await write:读写要并发,否则小缓冲区上会自己锁死自己
  writer.write(bytes).then(() => writer.close()).catch(() => {});
  const reader = ds.readable.getReader();
  const parts = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    parts.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

/** base64 → UTF-8 字符串。先按字节还原,再交给 TextDecoder,否则中文会碎。 */
export function b64ToUtf8(b64) {
  const clean = b64.replace(/[\s\u0000]/g, '');
  let bin;
  try {
    bin = atob(clean);
  } catch {
    throw new Error('base64 解不开 —— 数据块可能在传输中被截断了');
  }
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

/** 一段文本 → 卡片。既吃 base64 也吃裸 JSON。 */
export function readCardFromText(text) {
  const trimmed = text.trim();
  const json = trimmed.startsWith('{') ? trimmed : b64ToUtf8(trimmed);
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new Error(`卡里的 JSON 是坏的:${e.message}`);
  }
  return normalizeCard(parsed);
}

/**
 * 一张 PNG → 卡片。
 * 找不到卡数据时抛的错要说清是哪一种情况 —— 群里传来传去的图,
 * 十有八九是被截图或压缩工具重存过,文本块在那一步就没了。
 */
export async function readCard(bytes) {
  const texts = textChunks(parseChunks(bytes));
  if (!texts.length) {
    throw new Error('这张 PNG 里一个文本块都没有。多半是普通图片,或者被截图、压缩、重新导出过 —— 卡数据在那一步被丢掉了,要回去找原图');
  }
  const hit = CARD_KEYS.map((k) => texts.find((t) => t.keyword === k)).find(Boolean);
  if (!hit) {
    const found = texts.map((t) => t.keyword).join('、');
    throw new Error(`有文本块,但没有角色卡。图里的关键字是:${found}`);
  }
  const raw = hit.compressed ? await inflate(hit.body) : hit.body;
  // 按内容判,不按块类型判。tEXt 规定只能装 Latin-1,所以标准做法是 base64,
  // 但确实有工具往 tEXt 里直接塞 ASCII 的裸 JSON。以前这里只在 iTXt 分支判,
  // 于是那种卡会撞上 b64ToUtf8 抛的「可能在传输中被截断了」——
  // 数据明明是好的,却把人引去重新找原图。报错报错了方向比不报还费事。
  const text = isProbablyB64(raw)
    ? b64ToUtf8(ascii(raw))
    : new TextDecoder('utf-8').decode(raw);
  const card = readCardFromText(text);
  card.keyword = hit.keyword;
  return card;
}

/* 跳过前导空白再看首字节:base64 字母表里没有 '{',所以「不以 { 开头」就当 base64。
 * 空白要跳过,不然一个前导换行就能把裸 JSON 误判成 base64。 */
const isProbablyB64 = (bytes) => {
  const i = bytes.findIndex((b) => b !== 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d);
  return i >= 0 && bytes[i] !== 0x7b;
};

/* resident 标的是「每次请求都在上下文里」。
 * 开场白是聊天记录里的一条消息,会随历史往上滚;对话示例在上下文吃紧时
 * 酒馆是优先裁掉的。把这两样算进底噪会系统性高估,而底噪这个数的全部用处
 * 就是提前判断「设定会不会挤掉聊天记录」——高估了,判断就反过来了。 */
const FIELD_LABELS = [
  ['description', '角色描述', true],
  ['personality', '性格摘要', true],
  ['scenario', '场景', true],
  ['first_mes', '开场白', false],
  ['mes_example', '对话示例', false],
  ['system_prompt', '系统提示词覆盖', true],
  ['post_history_instructions', '历史之后的指令', true],
];

/** V1 是平铺的,V2/V3 包了一层 data。归一成同一个形状。 */
export function normalizeCard(json) {
  if (!json || typeof json !== 'object') throw new Error('解出来的不是一个对象');
  const wrapped = !!(json.spec && json.data);
  const d = wrapped ? json.data : json;
  return {
    spec: wrapped ? json.spec : 'chara_card_v1',
    specVersion: wrapped ? (json.spec_version ?? '') : '1.0',
    keyword: '',
    name: d.name ?? d.char_name ?? '',
    creator: d.creator ?? '',
    charVersion: d.character_version ?? '',
    tags: Array.isArray(d.tags) ? d.tags : [],
    notes: d.creator_notes ?? '',
    greetings: Array.isArray(d.alternate_greetings) ? d.alternate_greetings : [],
    fields: FIELD_LABELS
      .map(([key, label, resident]) => ({ key, label, resident, text: String(d[key] ?? '') }))
      .filter((f) => f.text.trim()),
    book: d.character_book ?? null,
    raw: json,
  };
}

/* 位置码来自酒馆的世界书设置,是这套东西里最不直观的一块:
 * 同一条设定放在角色定义旁边还是插进最近几条对话里,
 * 对生成结果的影响比内容本身还大。所以要翻译成人话。 */
const POSITIONS = [
  '角色定义前 ↑Char',
  '角色定义后 ↓Char',
  '作者注之前',
  '作者注之后',
  '插入深度 @D',
  '示例消息前',
  '示例消息后',
];
const ROLES = ['系统', '用户', '角色'];

/** 一条世界书条目 → 能直接显示的描述。 */
export function describeEntry(e) {
  const x = e.extensions ?? {};
  const code = typeof x.position === 'number' ? x.position
    : e.position === 'before_char' ? 0
      : e.position === 'after_char' ? 1 : null;
  const keys = (e.keys ?? []).filter(Boolean);
  return {
    name: e.name || e.comment || '(未命名)',
    keys,
    secondary: (e.secondary_keys ?? []).filter(Boolean),
    constant: !!e.constant,
    enabled: e.enabled !== false,
    trigger: e.constant ? '常驻' : keys.length ? '关键词' : '其他',
    position: code === null ? '未标注' : (POSITIONS[code] ?? `位置码 ${code}`),
    depth: code === 4 ? (x.depth ?? null) : null,
    role: code === 4 ? (ROLES[x.role] ?? null) : null,
    order: e.insertion_order ?? 0,
    probability: x.useProbability === false ? 100 : (x.probability ?? 100),
    content: e.content ?? '',
  };
}

/** 粗估 token。中日韩按一字一枚,其余按三个半字符一枚,只用来看数量级。 */
export function estimateTokens(text) {
  const s = String(text ?? '');
  let cjk = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if ((c >= 0x3040 && c <= 0x30ff) || (c >= 0x3400 && c <= 0x9fff) || (c >= 0xf900 && c <= 0xfaff)) cjk += 1;
  }
  return Math.round(cjk + (s.length - cjk) / 3.5);
}

/**
 * 整张卡的粗估用量。resident + constant 才是「每次请求的底噪」,
 * episodic(开场白、对话示例)单独列 —— 它们会被裁,不该混进底噪。
 */
export function weigh(card) {
  const join = (pred) => card.fields.filter(pred).map((f) => f.text).join('');
  const resident = join((f) => f.resident);
  const episodic = join((f) => !f.resident);
  const entries = (card.book?.entries ?? []).map(describeEntry);
  const constant = entries.filter((e) => e.constant && e.enabled).map((e) => e.content).join('');
  return {
    total: estimateTokens(resident + episodic + entries.map((e) => e.content).join('')),
    resident: estimateTokens(resident),
    episodic: estimateTokens(episodic),
    constant: estimateTokens(constant),
    entries: entries.length,
  };
}
