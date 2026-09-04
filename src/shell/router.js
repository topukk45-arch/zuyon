/* 极简 hash 路由。
 * '#/'           首页
 * '#/t/<id>'     某个工具
 * 携带内容(粘贴直达)不走 URL,放内存里,免得长文本塞进地址栏。 */

let payload = null;

export function parse() {
  const h = location.hash.replace(/^#/, '') || '/';
  const m = h.match(/^\/t\/([\w-]+)$/);
  return m ? { name: 'tool', id: m[1] } : { name: 'home' };
}

export function go(path, data = null) {
  payload = data;
  if (location.hash === '#' + path) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = path;
}

export function home() { go('/'); }
export function openTool(id, data = null) { go(`/t/${id}`, data); }

/** 取一次就清空,防止返回再进时旧内容复现 */
export function takePayload() {
  const p = payload;
  payload = null;
  return p;
}

export function onChange(fn) {
  window.addEventListener('hashchange', fn);
  return () => window.removeEventListener('hashchange', fn);
}
