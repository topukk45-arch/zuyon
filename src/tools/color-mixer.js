/* 调色台。三个混色模型并排对比。
 * 算法全在 lib/color.js,这里只负责 DOM。 */

import { el, clear } from '../ui/index.js';
import { imagePicker } from '../ui/imagePicker.js';
import {
  parseHex, toHex, tryParseHex, readableOn, normalize,
  mixPigment, mixLight, mixAverage, hueRelation, hslHex,
} from '../lib/color.js';

const DEFAULT = [
  { hex: '#903CC1', w: 33.3 },
  { hex: '#478B30', w: 33.3 },
  { hex: '#1D70B6', w: 33.3 },
];

const PRESETS = [
  { label: '紫 · 绿 · 黄', hexes: ['#800080', '#008000', '#FFFF00'] },
  { label: '紫 · 绿 · 蓝', hexes: ['#903CC1', '#478B30', '#1D70B6'] },
];

const RELATION_TEXT = {
  complementary: (d) => `含近互补对(最大色相差 ${d}°),颜料这边容易调脏`,
  analogous:     (d) => `邻近色(最大色相差 ${d}°),混合后色相稳定`,
  medium:        (d) => `最大色相差 ${d}°,中等张力`,
  unknown:       () => '色相太少,判断不了关系',
};

export default {
  mount(root, ctx) {
    let state = ctx.storage.get('colors', DEFAULT).map((c) => ({ ...c }));
    let selected = 0;
    let last = { pig: '', add: '', avg: '' };

    // ── 结果区 ──
    const slabPig = slab('颜料混合', 'Kubelka–Munk 反射率模型,接近真实油漆和水粉', () => last.pig);
    const slabAdd = slab('光的混合', '各灯按比例叠加亮度,超出部分削顶', () => last.add);
    const avgSwatch = el('i', { style: 'width:18px;height:18px;border-radius:4px;flex:none;display:block' });
    const avgHex = el('span', { style: 'font-family:var(--mono);font-size:var(--t-sm)' });
    const avgRow = el('button', {
      class: 'btn',
      style: 'display:flex;align-items:center;gap:var(--s2)',
      onclick: () => copy(last.avg),
    }, avgSwatch, el('span', {}, '算术平均'), avgHex);
    const verdict = el('p', { class: 'section-label', style: 'margin:0' });

    // ── 颜色行 ──
    const rows = el('div');
    const count = el('span', { class: 'section-label', style: 'margin:0;align-self:center' });

    // ── 取色 ──
    const picker = imagePicker(ctx, {}, (rgb) => {
      state[selected].hex = toHex(rgb);
      renderRows(); compute();
      picker.say(`${toHex(rgb)} → 已填入第 ${selected + 1} 行`);
    });
    const domBtn = el('button', {
      class: 'btn',
      onclick: async () => {
        const px = picker.getPixels();
        if (!px) { ctx.toast('先放一张图片'); return; }
        const { dominantColor } = await import('../lib/color.js');
        const rgb = dominantColor(px);
        if (!rgb) { picker.say('图里没有足够鲜艳的像素,试试单击取色'); return; }
        state[selected].hex = toHex(rgb);
        renderRows(); compute();
        picker.say(`${toHex(rgb)} → 已填入第 ${selected + 1} 行`);
      },
    }, '取整图主色');

    async function copy(hex) {
      if (!hex) return;
      ctx.toast(await ctx.platform.copy(hex) ? `已复制 ${hex}` : '复制失败');
    }

    function select(i) {
      selected = i;
      [...rows.children].forEach((r, j) => {
        r.querySelector('.dot').style.opacity = j === i ? '1' : '0';
      });
      if (picker.hasImage) picker.say(`单击图片,取的色会填进第 ${i + 1} 行`);
    }

    function renderRows() {
      clear(rows);
      state.forEach((c, i) => {
        const swatch = el('input', {
          type: 'color', value: c.hex,
          style: 'width:36px;height:36px;min-height:36px;border:none;background:none;padding:0;flex:none',
          'aria-label': `第${i + 1}个颜色`,
        });
        const hexIn = el('input', {
          class: 'input', value: c.hex, maxlength: '7',
          style: 'flex:none;width:8.5em;min-height:36px',
          'aria-label': `第${i + 1}个色值`,
        });
        const range = el('input', {
          type: 'range', min: '0', max: '100', step: '0.5', value: String(c.w),
          style: 'flex:1;min-width:5em', 'aria-label': `第${i + 1}个比例`,
        });
        const pct = el('span', { class: 'section-label', style: 'margin:0;flex:none;width:4em;text-align:end' });
        const del = el('button', {
          class: 'btn', style: 'flex:none;padding-inline:var(--s3)',
          disabled: state.length <= 2, 'aria-label': `删除第${i + 1}个颜色`,
        }, '×');
        const dot = el('span', {
          class: 'dot',
          style: 'width:6px;height:6px;border-radius:50%;background:var(--ink);flex:none;opacity:0',
        });

        swatch.addEventListener('input', () => {
          state[i].hex = swatch.value.toUpperCase();
          hexIn.value = state[i].hex;
          compute();
        });
        hexIn.addEventListener('change', () => {
          const rgb = tryParseHex(hexIn.value);
          if (rgb) { state[i].hex = toHex(rgb); swatch.value = state[i].hex; }
          hexIn.value = state[i].hex;
          compute();
        });
        range.addEventListener('input', () => { state[i].w = parseFloat(range.value); compute(); });
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          if (state.length <= 2) return;
          state.splice(i, 1);
          if (selected >= state.length) selected = state.length - 1;
          renderRows(); compute();
        });

        const row = el('div', {
          class: 'row',
          style: 'flex-wrap:nowrap;align-items:center;padding-block:var(--s2);border-bottom:1px solid var(--paper-3)',
          onmousedown: () => select(i),
          onfocusin: () => select(i),
        }, dot, swatch, hexIn, range, pct, del);
        row._pct = pct;
        rows.append(row);
      });
      select(Math.min(selected, state.length - 1));
      count.textContent = `${state.length} 个颜色`;
    }

    function compute() {
      const cols = state.map((c) => parseHex(c.hex));
      const ws = normalize(state.map((c) => c.w));
      [...rows.children].forEach((r, i) => { r._pct.textContent = `${(ws[i] * 100).toFixed(1)}%`; });

      const pig = mixPigment(cols, ws), add = mixLight(cols, ws), avg = mixAverage(cols, ws);
      last = { pig: toHex(pig), add: toHex(add), avg: toHex(avg) };

      slabPig.paint(last.pig, readableOn(pig), pig);
      slabAdd.paint(last.add, readableOn(add), add);
      avgSwatch.style.background = last.avg;
      avgHex.textContent = last.avg;

      const rel = hueRelation(cols, pig);
      const d = rel.maxDelta === null ? '' : rel.maxDelta.toFixed(0);
      verdict.textContent = RELATION_TEXT[rel.kind](d)
        + (rel.kind === 'unknown' ? '' : ` · 结果彩度 ${(rel.chroma * 100).toFixed(0)}%`);

      ctx.storage.set('colors', state);
    }

    root.append(el('div', { class: 'tool-body' },
      el('p', { class: 'section-label', style: 'margin:0' },
        '同一组颜色,按颜料混合和按光混合会得到完全不同的结果。改比例看差别。'),
      el('div', { class: 'row', style: 'flex-wrap:wrap' }, slabPig.node, slabAdd.node),
      el('div', { class: 'row', style: 'align-items:center' }, avgRow, verdict),
      rows,
      el('div', { class: 'row' },
        el('button', {
          class: 'btn', onclick: () => {
            if (state.length >= 6) { ctx.toast('最多 6 个'); return; }
            state.push({ hex: hslHex(Math.random() * 360, 0.6, 0.5), w: 0 });
            evenOut(); selected = state.length - 1; renderRows(); compute();
          },
        }, '添加颜色'),
        el('button', { class: 'btn', onclick: () => { evenOut(); renderRows(); compute(); } }, '平均分配'),
        ...PRESETS.map((p) => el('button', {
          class: 'btn',
          onclick: () => {
            state = p.hexes.map((h) => ({ hex: h, w: 33.3 }));
            selected = 0; renderRows(); compute();
          },
        }, p.label)),
        el('button', {
          class: 'btn', onclick: () => {
            state = state.map(() => ({
              hex: hslHex(Math.random() * 360, 0.45 + Math.random() * 0.45, 0.35 + Math.random() * 0.3),
              w: 100 / state.length,
            }));
            renderRows(); compute();
          },
        }, '随机'),
        count,
      ),
      el('p', { class: 'section-label', style: 'margin:0' }, '从图片取色,填进带圆点的那一行'),
      picker.node,
      el('div', { class: 'row' }, domBtn),
    ));

    function evenOut() {
      const v = +(100 / state.length).toFixed(1);
      state.forEach((c) => { c.w = v; });
    }

    renderRows();
    compute();

    return () => picker.destroy();
  },
};

/** 大色块。点一下复制。 */
function slab(title, sub, getHex) {
  const hexEl = el('div', { style: 'font-family:var(--mono);font-size:var(--t-xl);font-weight:600' });
  const rgbEl = el('div', { style: 'font-family:var(--mono);font-size:var(--t-xs);opacity:.75' });
  const node = el('button', {
    class: 'result',
    style: 'flex:1;min-width:12em;display:flex;flex-direction:column;gap:var(--s4);text-align:start;padding:var(--s4)',
  },
    el('div', {},
      el('div', { style: 'font-weight:600' }, title),
      el('div', { style: 'font-size:var(--t-xs);opacity:.75' }, sub),
    ),
    el('div', {}, hexEl, rgbEl),
  );
  node.dataset.empty = 'false';
  return {
    node,
    paint(hex, ink, rgb) {
      node.style.background = hex;
      node.style.color = ink;
      hexEl.textContent = hex;
      rgbEl.textContent = rgb.join(', ');
    },
  };
}
