/* 工具形态。
 *
 * 十几个工具里大半本质是「文本进 → 文本出」:编解码、格式化、去重、
 * 字数统计、摩斯、JSON、时间戳。为它们各写一遍输入框、粘贴按钮、
 * 复制按钮、错误显示,是三份浪费加三处不一致。
 *
 * 所以外壳提供壳,工具只交一个 run():
 *
 *   export default {
 *     shape: 'text->text',
 *     run(input, opts) { return '...' }     // 纯函数,可在 node 里直接测
 *   }
 *
 * 需要自定义布局的(调色台、转盘、正则试跑)照旧写 mount(),两条路并存。
 */

import { el, resultBox, pasteButton, copyButton } from '../ui/index.js';

const shapes = {
  /**
   * 文本进,文本出。
   * mod: { placeholder?, options?, run(input, opts) -> string }
   */
  'text->text'(mod, root, ctx) {
    const opts = {};
    (mod.options ?? []).forEach((o) => { opts[o.id] = o.default; });

    const input = el('textarea', {
      class: 'textarea',
      placeholder: mod.placeholder ?? '在这里输入或粘贴',
      spellcheck: 'false',
    });

    const out = resultBox('结果会显示在这里');

    const run = () => {
      const raw = input.value;
      if (!raw.trim()) { out.clear(); return; }
      try {
        out.show(String(mod.run(raw, opts)));
      } catch (e) {
        out.fail(e.message || '输入格式不对');
      }
    };

    input.addEventListener('input', run);

    const controls = el('div', { class: 'row' });
    for (const o of mod.options ?? []) {
      const sel = el('select', { class: 'btn' });
      o.options.forEach((v) => sel.append(el('option', { value: v.value }, v.label)));
      sel.value = o.default;
      sel.addEventListener('change', () => { opts[o.id] = sel.value; run(); });
      controls.append(sel);
    }

    const body = el('div', { class: 'tool-body' },
      el('div', { class: 'field' }, input),
      controls.children.length ? controls : null,
      out.node,
      el('div', { class: 'row' },
        pasteButton(ctx, (text) => { input.value = text; run(); }),
        copyButton(ctx, () => out.value),
      ),
    );

    root.append(body);

    // 带着初始内容进来(从首页粘贴直达)
    if (ctx.initial) { input.value = ctx.initial; run(); }
    else input.focus();

    return () => { input.removeEventListener('input', run); };
  },
};

/** 由 toolhost 调用:有 mount 就用 mount,否则套形态。 */
export function mountTool(mod, root, ctx) {
  if (typeof mod.mount === 'function') return mod.mount(root, ctx);
  const shape = shapes[mod.shape];
  if (!shape) throw new Error(`未知的工具形态: ${mod.shape}`);
  return shape(mod, root, ctx);
}
