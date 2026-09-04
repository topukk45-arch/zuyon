/* 验工具契约里最容易悄悄漏掉的一环:离开工具时,全局监听有没有被摘干净。
 * 漏一个 paste 监听不会报错,只会在你用了十分钟后开始互相打架。 */
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
for (const k of ['window','document','localStorage','HashChangeEvent','Blob','URL','DocumentFragment','location','Event','Node','Image','FileReader'])
  globalThis[k] = k === 'window' ? dom.window : dom.window[k];
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});

// 数一数 window 上的监听
const live = new Map();
const add = dom.window.addEventListener.bind(dom.window);
const rm = dom.window.removeEventListener.bind(dom.window);
dom.window.addEventListener = (t, f, o) => { live.set(f, t); return add(t, f, o); };
dom.window.removeEventListener = (t, f, o) => { live.delete(f); return rm(t, f, o); };
const countPaste = () => [...live.values()].filter((t) => t === 'paste').length;

const { start } = await import('../src/shell/app.js');
start(document.getElementById('app'));
await new Promise(r => setTimeout(r, 50));
const base = countPaste();

for (const id of ['color-mixer', 'color-picker', 'color-mixer', 'contrast']) {
  location.hash = '/t/' + id;
  await new Promise(r => setTimeout(r, 120));
}
location.hash = '/';
await new Promise(r => setTimeout(r, 120));

const leaked = countPaste() - base;
console.log('反复进出四个工具后泄漏的 paste 监听:', leaked);
if (leaked !== 0) { console.log('FAIL —— 某个工具的清理函数没摘干净'); process.exit(1); }
console.log('清理函数: ok');
