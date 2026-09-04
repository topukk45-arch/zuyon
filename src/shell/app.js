/* 应用外壳。顶栏 + 可滚动主体 + toast,路由切换时负责调上一个工具的清理函数。 */

import { el, clear } from '../ui/index.js';
import { byId } from '../core/registry.js';
import { parse, onChange, takePayload, home } from './router.js';
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
