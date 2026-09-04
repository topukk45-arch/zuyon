/* 应用外壳。顶栏 + 可滚动主体 + toast,路由切换时负责调上一个工具的清理函数。 */

import { el, clear } from '../ui/index.js';
import { byId } from '../core/registry.js';
import { parse, onChange, takePayload, home } from './router.js';
import { onBack } from '../core/platform.js';
import { renderHome } from './home.js';
import { renderTool } from './toolhost.js';

export function start(root) {
  const title = el('h1', { class: 'bar__title u-ellipsis' }, '工具箱');
  const back = el('button', { class: 'bar__back', onclick: home, 'aria-label': '返回' }, '‹');
  const badge = el('span', { class: 'offline-badge' }, '无网络权限');
  const bar = el('header', { class: 'bar' }, back, title, badge);
  const scroll = el('main', { class: 'scroll' });

  root.append(bar, scroll);

  let cleanup = () => {};

  const ctx = { toast };

  async function render() {
    try { cleanup(); } catch { /* 工具的清理函数炸了不该拖垮外壳 */ }
    cleanup = () => {};
    clear(scroll);
    scroll.scrollTop = 0;

    const route = parse();
    if (route.name === 'home') {
      back.style.display = 'none';
      badge.style.display = '';
      title.textContent = '工具箱';
      renderHome(scroll, ctx);
    } else {
      back.style.display = '';
      badge.style.display = 'none';
      title.textContent = byId(route.id)?.name ?? '工具';
      cleanup = await renderTool(scroll, route.id, takePayload(), ctx);
    }
  }

  // 接管系统返回:在工具里就回首页,已经在首页才允许退出。
  // 包一层 try —— 这是个可选增强,它挂了顶多返回键行为退化,
  // 不该让整个外壳起不来。(0.3 就是栽在这里:平台 API 形态猜错,
  // 异常从 start() 同步抛出,表现为全白。)
  try {
    onBack(() => {
      if (parse().name === 'home') return false;
      home();
      return true;
    });
  } catch (e) {
    console.warn('返回键接管失败，退化为系统默认行为', e);
  }

  onChange(render);
  render();
}

let toastTimer;
function toast(msg) {
  document.querySelector('.toast')?.remove();
  const node = el('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(node);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.remove(), 1800);
}
