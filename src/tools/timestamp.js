/* 样板一:标准形态的工具。
 * 整个文件没有一行 DOM,输入框、粘贴、复制、错误显示全由 shapes 提供。
 * run 是纯函数,可以在 node 里直接测。 */

import { parseStamp, formatLocal, formatUTC, parseDateText, relative } from '../lib/time.js';

export default {
  shape: 'text->text',
  placeholder: '粘时间戳,或写 2026-09-04 12:00:00',

  run(input) {
    const s = input.trim();

    // 数字 → 当成时间戳
    if (/^\d{10}$|^\d{13}$/.test(s)) {
      const d = parseStamp(s);
      return [
        `本地  ${formatLocal(d)}`,
        `UTC   ${formatUTC(d)}`,
        `相对  ${relative(d)}`,
      ].join('\n');
    }

    // 否则 → 当成日期文本
    const d = parseDateText(s);
    return [
      `秒    ${Math.floor(d.getTime() / 1000)}`,
      `毫秒  ${d.getTime()}`,
      `相对  ${relative(d)}`,
    ].join('\n');
  },
};
