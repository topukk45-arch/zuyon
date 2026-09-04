/* 把错误显示在屏幕上。
 *
 * 手机上没有控制台。一个被吞掉的异常表现为空白页,只能靠猜;
 * 显示出来就是一句可以截图发出去的话。诊断成本的差别是十倍。 */

import { el } from '../ui/index.js';

/** 一块可选中、可复制的错误面板 */
export function errorPanel(title, err) {
  const detail = [
    err?.name && err?.message ? `${err.name}: ${err.message}` : String(err),
    err?.stack ? String(err.stack).split('\n').slice(0, 6).join('\n') : '',
  ].filter(Boolean).join('\n\n');

  return el('div', { class: 'tool-body' },
    el('p', { style: 'font-weight:600' }, title),
    // 这里特意可选中 —— 就是给人复制出来用的
    el('pre', {
      class: 'result u-selectable',
      style: 'white-space:pre-wrap;font-size:var(--t-xs);line-height:1.6',
      'data-error': 'true',
    }, detail || '没有更多信息'),
    el('p', { class: 'section-label' },
      '数据线连电脑，Chrome 开 chrome://inspect，Console 里有完整信息。'),
  );
}

/**
 * 全局兜底:任何没被接住的异常和 Promise 拒绝都渲染到屏幕上。
 * 不这么做的话,外壳自己出错就是一片白,连"哪一步炸的"都不知道。
 */
export function installGlobalErrorHandler(root) {
  let shown = false;

  const show = (title, err) => {
    if (shown) return;           // 只显示第一个,后面的多半是连锁反应
    shown = true;
    const box = el('div', { style: 'padding:var(--s4)' }, errorPanel(title, err));
    root.prepend(box);
  };

  window.addEventListener('error', (e) => {
    show('页面出错了', e.error ?? new Error(e.message));
  });
  window.addEventListener('unhandledrejection', (e) => {
    show('有一步没接住', e.reason);
  });

  // CSP 挡东西时浏览器不报常规错误,只发这个事件。
  // 不听它的话,「被自己的 CSP 挡住」的表现就是一片空白 —— 这个坑踩过两次了。
  window.addEventListener('securitypolicyviolation', (e) => {
    show('被 CSP 挡住了', new Error(
      `指令 ${e.violatedDirective} 挡住了 ${e.blockedURI || '(内联)'}\n` +
      `生效策略 ${e.originalPolicy}`,
    ));
  });
}
