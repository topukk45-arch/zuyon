/* 0.9 之后查出来的几处:路由竞态、复制被拒、围棋换大小导入、改时区后旧命令。
 * 每一条都是「不报错地做错事」或「在手机上才炸」,单测碰不到,在 jsdom 里整条走一遍。 */
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
for (const k of ['window','document','localStorage','HashChangeEvent','Blob','URL','DocumentFragment','location','Event','Node','Image','FileReader','history','PopStateEvent','MouseEvent'])
  globalThis[k] = k === 'window' ? dom.window : dom.window[k];
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);

// 记活着的定时器:漏掉的清理函数最常见的表现就是定时器还在跑
const live = new Set();
const si = globalThis.setInterval, ci = globalThis.clearInterval;
globalThis.setInterval = (...a) => { const id = si(...a); live.add(id); return id; };
globalThis.clearInterval = (id) => { live.delete(id); return ci(id); };

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${name}: ${ok ? 'ok' : 'FAIL ' + extra}`); if (!ok) failed++; };

// ── 1. 路由竞态 ──
// node 里读本地文件太快,窗口根本打不开;手机上解析一个工具要几十上百毫秒。把加载拖慢来模拟。
const tools = (await import('../src/core/registry.js')).default;
for (const t of tools) { const load = t.load; t.load = async () => { await wait(60); return load(); }; }
const { start } = await import('../src/shell/app.js');
const { openTool } = await import('../src/shell/router.js');
const app = document.getElementById('app');
start(app);
await wait(30);

location.hash = '/t/xiangqi';
await wait(0);                        // hashchange 到了、模块还在加载
location.hash = '/';
await wait(300);
check('进工具马上返回,停在首页', !!app.querySelector('.home-head') && !app.querySelector('.xq'),
  `首页 ${!!app.querySelector('.home-head')} 象棋 ${!!app.querySelector('.xq')}`);

openTool('settime');
openTool('settime');                  // 连点
await wait(300);
check('连点只挂一份', app.querySelectorAll('.st').length === 1, `挂了 ${app.querySelectorAll('.st').length} 份`);
check('连点不漏定时器', live.size === 1, `活着 ${live.size} 个`);
location.hash = '/';
await wait(100);
check('离开后定时器清零', live.size === 0, `活着 ${live.size} 个`);

// ── 2. 复制被拒:返回 false 或走兜底,不能往外抛 ──
const platform = await import('../src/core/platform.js');
Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('NotAllowedError')) } });
document.execCommand = () => true;
let r1;
try { r1 = await platform.copy('x'); } catch (e) { r1 = 'threw: ' + e.message; }
check('writeText 被拒时走兜底', r1 === true, String(r1));
document.execCommand = () => { throw new Error('nope'); };
let r2;
try { r2 = await platform.copy('x'); } catch (e) { r2 = 'threw: ' + e.message; }
check('兜底也不行时返回 false', r2 === false, String(r2));
check('兜底的临时输入框不留在页面上', !document.querySelector('body > textarea'));

// ── 3. 围棋:19 路点了一下待确认,再导入 9 路棋谱 ──
const W = 300;
Object.defineProperty(dom.window.HTMLCanvasElement.prototype, 'clientWidth', { configurable: true, get: () => W });
dom.window.HTMLCanvasElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: W, height: W });
const noop = new Proxy(() => {}, { get: () => noop, set: () => true, apply: () => noop });
dom.window.HTMLCanvasElement.prototype.getContext = () => noop;

const { mountTool } = await import('../src/core/shapes.js');
const { scoped } = await import('../src/core/storage.js');
const toasts = [];
const ctx = (id) => ({
  storage: scoped(id), toast: (m) => toasts.push(m), initial: null, back() {},
  platform: { can: () => false, copy: async () => true, readClipboard: async () => null, pickFile: async () => null, saveFile: async () => false, share: async () => false },
});

scoped('go').set('state', { size: 19, moves: [], cursor: 0, confirm: true });
const goRoot = document.createElement('div'); document.body.append(goRoot);
const goMod = (await import('../src/tools/go.js')).default;
const errs = [];
const onErr = (e) => errs.push(e.error?.message ?? e.message);
dom.window.addEventListener('error', onErr);
const unmountGo = mountTool(goMod, goRoot, ctx('go'));
const canvas = goRoot.querySelector('canvas');
const m = W * 0.055, cell = (W - 2 * m) / 18, at = m + 15 * cell;   // 19 路的 (15,15),9 路上没有
canvas.dispatchEvent(new MouseEvent('click', { clientX: at, clientY: at, bubbles: true }));
goRoot.querySelector('textarea[placeholder*="SGF"]').value = '(;SZ[9];B[cc];W[gg])';
[...goRoot.querySelectorAll('button')].find((b) => b.textContent === '导入').click();
check('换大小导入不崩', toasts.at(-1) === '导入了 2 手' && !errs.length, `${toasts.at(-1)} ${errs.join(';')}`);
unmountGo();
dom.window.removeEventListener('error', onErr);

// ── 4. 改服务器时间:生成命令后改当前服的时区,旧命令要清掉 ──
const stRoot = document.createElement('div'); document.body.append(stRoot);
const stMod = (await import('../src/tools/settime.js')).default;
const unmountSt = mountTool(stMod, stRoot, ctx('settime-t'));
const items = () => stRoot.querySelectorAll('.item').length;
[...stRoot.querySelectorAll('button')].find((b) => b.textContent === '下一个 0 点').click();
check('先生成出一条命令', items() === 1, `有 ${items()} 条`);
const zone = stRoot.querySelector('select[aria-label="时区"]');
zone.value = 'Europe/Istanbul';
zone.dispatchEvent(new Event('change'));
check('改了当前服时区,旧命令清掉', items() === 0, `还剩 ${items()} 条`);
[...stRoot.querySelectorAll('button')].find((b) => b.textContent === '下一个 0 点').click();
[...stRoot.querySelectorAll('button')].find((b) => b.textContent === '添加').click();
check('添加新服(自动切过去),旧命令清掉', items() === 0, `还剩 ${items()} 条`);
unmountSt();

if (failed) { console.log(`\n${failed} 条没过`); process.exit(1); }
console.log('\n回归: ok');
process.exit(0);
