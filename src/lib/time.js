/* 纯函数。不许出现 document 和 window —— 破一次例,node 测试就废了。 */

/** 秒或毫秒的时间戳 → Date。10 位当秒,13 位当毫秒。 */
export function parseStamp(input) {
  const s = String(input).trim();
  if (!/^\d{10}$|^\d{13}$/.test(s)) throw new Error('时间戳应为 10 位(秒)或 13 位(毫秒)');
  return new Date(s.length === 10 ? Number(s) * 1000 : Number(s));
}

const pad = (n, w = 2) => String(n).padStart(w, '0');

/** 按本地时区格式化为 YYYY-MM-DD HH:mm:ss */
export function formatLocal(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
         `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** UTC 版本 */
export function formatUTC(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
         `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

/** 宽松解析日期文本 → Date */
export function parseDateText(text) {
  const s = String(text).trim().replace(/\//g, '-');
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) throw new Error('看不懂这个日期');
  return d;
}

/** 相对现在的中文描述 */
export function relative(date, now = new Date()) {
  const diff = Math.round((date - now) / 1000);
  const abs = Math.abs(diff);
  const units = [[31536000, '年'], [2592000, '个月'], [86400, '天'], [3600, '小时'], [60, '分钟'], [1, '秒']];
  for (const [sec, label] of units) {
    if (abs >= sec) {
      const n = Math.floor(abs / sec);
      return diff < 0 ? `${n}${label}前` : `${n}${label}后`;
    }
  }
  return '刚刚';
}
