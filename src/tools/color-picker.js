/* 图片取色。独立入口:只要一个色号,不需要整个调色台。
 * 跟调色台共用 ui/imagePicker.js,算法共用 lib/color.js。 */

import { el, copyButton } from '../ui/index.js';
import { imagePicker } from '../ui/imagePicker.js';
import { toHex, dominantColor, readableOn, parseHex } from '../lib/color.js';

const MAX_HISTORY = 8;

export default {
  mount(root, ctx) {
    let current = '';
    let history = ctx.storage.get('history', []);

    const swatch = el('div', {
      class: 'result',
      style: 'min-height:5em;display:grid;place-items:center;font-family:var(--mono);font-size:var(--t-xl);font-weight:600',
    }, '还没取色');

    const strip = el('div', { class: 'chips' });

    function take(rgb) {
      current = toHex(rgb);
      swatch.style.background = current;
      swatch.style.color = readableOn(rgb);
      swatch.textContent = current;
      swatch.dataset.empty = 'false';
      history = [current, ...history.filter((h) => h !== current)].slice(0, MAX_HISTORY);
      ctx.storage.set('history', history);
      drawHistory();
    }

    function drawHistory() {
      strip.textContent = '';
      if (!history.length) return;
      strip.append(el('span', { class: 'section-label', style: 'margin:0;align-self:center' }, '取过的'));
      for (const hex of history) {
        strip.append(el('button', {
          class: 'chip',
          style: `background:${hex};color:${readableOn(parseHex(hex))};border-color:transparent;font-family:var(--mono)`,
          onclick: () => take(parseHex(hex)),
        }, hex));
      }
    }

    const picker = imagePicker(ctx, { hint: '把图片拖到这里,或粘贴、点击选择' }, take);

    const domBtn = el('button', {
      class: 'btn',
      onclick: () => {
        const px = picker.getPixels();
        if (!px) { ctx.toast('先放一张图片'); return; }
        const rgb = dominantColor(px);
        if (!rgb) { picker.say('图里没有足够鲜艳的像素,试试单击取色'); return; }
        take(rgb);
      },
    }, '取整图主色');

    root.append(el('div', { class: 'tool-body' },
      swatch,
      strip,
      picker.node,
      el('div', { class: 'row' }, domBtn, copyButton(ctx, () => current, '复制色号')),
    ));

    drawHistory();
    return () => picker.destroy();
  },
};
