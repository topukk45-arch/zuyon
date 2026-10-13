/* 改服务器时间。纯函数:时区换算、找下一个 0 点/周一/月初、拼 date 命令。
 *
 * 所有时间内部都用毫秒时间戳(绝对时刻);「墙上时间」是某个时区里钟面上的读数。
 * 时区两种写法:
 *   - IANA 名,如 'Europe/Berlin',带夏令时,偏移按那一刻现算
 *   - 固定偏移,如 'UTC+7'、'UTC-3:30',不随季节变
 */

const FIXED = /^UTC([+-])(\d{1,2})(?::?(\d{2}))?$/;
const pad = (n, w = 2) => String(n).padStart(w, '0');

/** 某时区在某一刻比 UTC 快多少分钟。 */
export function offsetMin(zone, ms) {
  const m = FIXED.exec(zone);
  if (m) return (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +(m[3] ?? 0));
  const p = {};
  for (const x of fmt(zone).formatToParts(new Date(ms))) p[x.type] = x.value;
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
}

const cache = new Map();
function fmt(zone) {
  if (!cache.has(zone)) {
    cache.set(zone, new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    }));
  }
  return cache.get(zone);
}

/** 这个时区名能不能用。 */
export function validZone(zone) {
  if (FIXED.test(zone)) return true;
  try { fmt(zone); return true; } catch { return false; }
}

/** 绝对时刻 → 该时区的墙上时间。 */
export function toWall(zone, ms) {
  const off = offsetMin(zone, ms);
  const d = new Date(ms + off * 60000);
  return {
    y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(),
    h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds(), off,
  };
}

/**
 * 墙上时间 → 绝对时刻。
 * status: 'ok' | 'gap'(夏令时拨快,这个钟点不存在,顺延到之后) | 'overlap'(拨慢,钟点出现两次,取第一次)
 */
export function fromWall(zone, w) {
  const naive = Date.UTC(w.y, w.mo - 1, w.d, w.h ?? 0, w.mi ?? 0, w.s ?? 0);
  // 用前后两个可能的偏移各试一次
  const offs = [...new Set([offsetMin(zone, naive - 864e5), offsetMin(zone, naive + 864e5), offsetMin(zone, naive)])];
  const hits = offs.map((o) => naive - o * 60000).filter((ms) => offsetMin(zone, ms) === Math.round((naive - ms) / 60000));
  if (hits.length === 0) {
    // 落在拨快的那一段里:按切换前的偏移算,得到的就是切换之后的那个时刻
    const before = offsetMin(zone, naive - 864e5);
    return { ms: naive - before * 60000, status: 'gap' };
  }
  const uniq = [...new Set(hits)].sort((a, b) => a - b);
  return { ms: uniq[0], status: uniq.length > 1 ? 'overlap' : 'ok' };
}

export const wallText = (w) => `${w.y}-${pad(w.mo)}-${pad(w.d)} ${pad(w.h)}:${pad(w.mi)}:${pad(w.s)}`;
export const offsetText = (min) => `${min < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(min) / 60))}${pad(Math.abs(min) % 60)}`;
export function offsetLabel(min) {
  const a = Math.abs(min), h = Math.floor(a / 60), m = a % 60;
  return `UTC${min < 0 ? '-' : '+'}${h}${m ? ':' + pad(m) : ''}`;
}

/** sudo date -s "…"。带时区时机器设成哪个时区都拨得对。 */
export function command(zone, ms, withTz = true) {
  const w = toWall(zone, ms);
  return `sudo date -s "${wallText(w)}${withTz ? ' ' + offsetText(w.off) : ''}"`;
}

// ── 找下一个时间点 ──────────────────────────

const addDays = (w, n) => {
  const d = new Date(Date.UTC(w.y, w.mo - 1, w.d + n));
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: 0, mi: 0, s: 0 };
};

/** 严格晚于 fromMs 的下一个边界(该时区的 0 点)。 */
export function nextBoundary(kind, zone, fromMs) {
  const w = toWall(zone, fromMs);
  let cand;
  if (kind === 'day') cand = addDays(w, 1);
  else if (kind === 'week') {
    const dow = new Date(Date.UTC(w.y, w.mo - 1, w.d)).getUTCDay();   // 0 是周日
    cand = addDays(w, ((8 - dow) % 7) || 7);
  } else if (kind === 'month') cand = { y: w.mo === 12 ? w.y + 1 : w.y, mo: w.mo === 12 ? 1 : w.mo + 1, d: 1, h: 0, mi: 0, s: 0 };
  else throw new Error('不认识的时间点:' + kind);
  return fromWall(zone, cand).ms;
}

/**
 * 「下一个 X 前 lead 秒」。如果离边界已经不足 lead 秒,就跳到再下一个,
 * 保证拨过去的时间一定在 fromMs 之后 —— 时间不能往回拨。
 */
export function beforeNext(kind, zone, fromMs, lead) {
  let b = nextBoundary(kind, zone, fromMs);
  while (b - lead * 1000 <= fromMs) b = nextBoundary(kind, zone, b);
  return b - lead * 1000;
}

/** 'YYYY-MM-DDTHH:MM(:SS)' 这种 datetime-local 的值,按该时区解释。 */
export function parseLocal(zone, value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(value ?? '');
  if (!m) throw new Error('时间格式不对,要像 2026-10-15 23:59:50 这样');
  return fromWall(zone, { y: +m[1], mo: +m[2], d: +m[3], h: +m[4], mi: +m[5], s: +(m[6] ?? 0) });
}

/** 服务器现在大约几点:上次拨到的时间 + 拨完之后过去的真实时间。没拨过就是现在。 */
export const serverNow = (rec, now) => (rec ? rec.target + (now - rec.at) : now);

/** 内置的服。改名、改时区、增删都在工具里做。 */
export const PRESETS = [
  { id: 'sea', name: '东南亚', zone: 'Asia/Singapore' },
  { id: 'vn', name: '越南', zone: 'Asia/Ho_Chi_Minh' },
  { id: 'de', name: '德语', zone: 'Europe/Berlin' },
  { id: 'fr', name: '法语', zone: 'Europe/Paris' },
  { id: 'tr', name: '土耳其', zone: 'Europe/Istanbul' },
];

/** 新建服时可选的时区。带夏令时的标出来。 */
export const ZONES = [
  ['Asia/Shanghai', '北京'], ['Asia/Singapore', '新加坡/东南亚'], ['Asia/Taipei', '台北'],
  ['Asia/Ho_Chi_Minh', '越南'], ['Asia/Bangkok', '泰国'], ['Asia/Jakarta', '印尼(西部)'],
  ['Asia/Manila', '菲律宾'], ['Asia/Tokyo', '东京'], ['Asia/Seoul', '首尔'],
  ['Europe/Istanbul', '土耳其'], ['Europe/Berlin', '德国(夏令时)'], ['Europe/Paris', '法国(夏令时)'],
  ['Europe/London', '英国(夏令时)'], ['Europe/Moscow', '莫斯科'],
  ['America/New_York', '美东(夏令时)'], ['America/Los_Angeles', '美西(夏令时)'], ['UTC+0', 'UTC'],
];
