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
  const bar = el('header', { class: 'bar' }, back, title);
  const scroll = el('main', { class: 'scroll' });

  root.append(bar, scroll);

  let cleanup = () => {};

  const ctx = { toast };

  // 工具模块要等加载,等的时候路由可能已经又变了(点进去马上返回、连点两下)。
  // 每次渲染领一个号,加载完发现号不是最新的就什么都不碰 —— 否则旧工具会盖掉
  // 新页面,或者同一个工具挂两遍、前一遍的清理函数丢失(定时器、监听、后台线程漏掉)。
  let seq = 0, inflight = null;

  async function render() {
    const my = ++seq;
    try { cleanup(); } catch { /* 工具的清理函数炸了不该拖垮外壳 */ }
    cleanup = () => {};
    clear(scroll);
    scroll.scrollTop = 0;

    const route = parse();
    if (route.name === 'home') {
      inflight = null;
      root.classList.add('is-home');
      title.textContent = '工具箱';
      renderHome(scroll, ctx);
    } else {
      root.classList.remove('is-home');
      title.textContent = byId(route.id)?.name ?? '工具';
      // 连点同一个工具时,带进来的内容被第一次渲染取走了,这次接着用
      let payload = takePayload();
      if (!payload && inflight?.id === route.id) payload = inflight.payload;
      inflight = { id: route.id, payload };
      const c = await renderTool(scroll, route.id, payload, ctx, () => my === seq);
      if (my === seq) { cleanup = c; inflight = null; }
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
