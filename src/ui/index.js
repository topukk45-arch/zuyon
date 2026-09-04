/* 共用 DOM 组件。
 *
 * 这一层的存在理由:「tools/ 不许 import tools/」和「lib/ 不许有 document」
 * 两条规矩一夹,拖放区、结果框、复制按钮这类既要复用又必然碰 DOM 的东西
 * 就没有落脚点了。它们住这里。
 *
 * 纪律:只碰 DOM 和事件。不含业务逻辑,不 import platform
 * (需要平台能力就通过参数收 ctx),不 import tools/。
 */

/** 极小的元素构造器。el('div', {class:'x'}, child, child) */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function clear(node) { while (node.firstChild) node.firstChild.remove(); }

/** 只读结果框,带空态与错误态。 */
export function resultBox(placeholder = '') {
  const node = el('div', { class: 'result', 'data-empty': 'true' }, placeholder);
  let value = '';
  return {
    node,
    get value() { return value; },
    show(text) {
      value = text;
      node.textContent = text;
      node.dataset.empty = 'false';
      node.dataset.error = 'false';
    },
    fail(msg) {
      value = '';
      node.textContent = msg;
      node.dataset.empty = 'false';
      node.dataset.error = 'true';
    },
    clear() {
      value = '';
      node.textContent = placeholder;
      node.dataset.empty = 'true';
      node.dataset.error = 'false';
    },
  };
}

/** 粘贴按钮。剪贴板读不到就退化成提示,不报错。 */
export function pasteButton(ctx, onText) {
  if (!ctx.platform.can('readClipboard')) return null;
  return el('button', {
    class: 'btn',
    onclick: async () => {
      const text = await ctx.platform.readClipboard();
      if (text) onText(text);
      else ctx.toast('剪贴板读不到,长按输入框粘贴');
    },
  }, '粘贴');
}

/** 复制按钮。getText 延迟求值,拿的是点击那一刻的结果。 */
export function copyButton(ctx, getText, label = '复制结果') {
  return el('button', {
    class: 'btn btn--primary',
    onclick: async () => {
      const text = getText();
      if (!text) { ctx.toast('还没有结果'); return; }
      ctx.toast(await ctx.platform.copy(text) ? '已复制' : '复制失败');
    },
  }, label);
}

/** 拖放 + 点选的文件区。图片类工具共用。 */
export function fileDrop(ctx, { accept = 'image/*', hint = '拖进来,或点击选择' }, onFile) {
  const node = el('button', { class: 'result', style: 'text-align:center' }, hint);
  node.addEventListener('click', async () => {
    const f = await ctx.platform.pickFile({ accept });
    if (f) onFile(f);
  });
  node.addEventListener('dragover', (e) => { e.preventDefault(); node.dataset.error = 'false'; });
  node.addEventListener('drop', (e) => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f) onFile(f);
  });
  return node;
}
