/* 样板二:自定义 mount 的工具。
 * 需要实时预览、非文本输入的工具走这条路。
 * 注意它拿到的只有 ctx 里那几样东西 —— 够不着全局状态、别的工具、路由、document.body。 */

import { el, resultBox } from '../ui/index.js';
import { parseHex, toHex, contrastRatio, wcagLevels } from '../lib/color.js';

export default {
  mount(root, ctx) {
    const saved = ctx.storage.get('pair', { fg: '#1D1B16', bg: '#EFEDE4' });
    if (ctx.initial) saved.fg = ctx.initial.trim();

    const preview = el('div', {
      class: 'result',
      style: 'display:grid;place-items:center;min-height:6em;font-size:1.25rem',
    }, '取次花丛懒回顾');

    const out = resultBox('');
    const fg = colorField('前景', saved.fg);
    const bg = colorField('背景', saved.bg);

    const update = () => {
      try {
        const a = parseHex(fg.value), b = parseHex(bg.value);
        const ratio = contrastRatio(a, b);
        const w = wcagLevels(ratio);
        preview.style.color = toHex(a);
        preview.style.background = toHex(b);
        out.show([
          `对比度  ${ratio.toFixed(2)} : 1`,
          `正文    AA ${mark(w.normalAA)}   AAA ${mark(w.normalAAA)}`,
          `大字    AA ${mark(w.largeAA)}   AAA ${mark(w.largeAAA)}`,
        ].join('\n'));
        ctx.storage.set('pair', { fg: fg.value, bg: bg.value });
      } catch (e) {
        out.fail(e.message);
      }
    };

    fg.on(update);
    bg.on(update);

    root.append(el('div', { class: 'tool-body' },
      preview,
      el('div', { class: 'row' }, fg.node, bg.node),
      out.node,
      el('button', {
        class: 'btn',
        onclick: () => { const t = fg.value; fg.set(bg.value); bg.set(t); update(); },
      }, '前景背景对调'),
    ));

    update();

    // 卸载时清理。这个工具没有定时器和全局监听,所以是空的 —— 但契约要求返回。
    return () => {};
  },
};

const mark = (ok) => (ok ? '通过' : '未过');

function colorField(label, initial) {
  const swatch = el('input', { type: 'color', value: initial, style: 'width:44px;height:44px;border:none;background:none;padding:0' });
  const text = el('input', { class: 'input', value: initial, style: 'flex:1;min-width:6em' });
  const node = el('div', { class: 'field', style: 'flex:1;min-width:9em' },
    el('label', {}, label),
    el('div', { class: 'row', style: 'flex-wrap:nowrap' }, swatch, text),
  );
  const handlers = [];
  const fire = () => handlers.forEach((h) => h());
  swatch.addEventListener('input', () => { text.value = swatch.value; fire(); });
  text.addEventListener('input', () => {
    if (/^#[0-9a-f]{6}$/i.test(text.value)) swatch.value = text.value;
    fire();
  });
  return {
    node,
    get value() { return text.value; },
    set(v) { text.value = v; if (/^#[0-9a-f]{6}$/i.test(v)) swatch.value = v; },
    on(h) { handlers.push(h); },
  };
}
