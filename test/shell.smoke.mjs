import { JSDOM } from 'jsdom';
const dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
for (const k of ['window','document','localStorage','HashChangeEvent','Blob','URL','DocumentFragment','location','Event','Node','history','PopStateEvent'])
  globalThis[k] = k === 'window' ? dom.window : dom.window[k];
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});

const { start } = await import('../src/shell/app.js');
start(document.getElementById('app'));
await new Promise(r => setTimeout(r, 50));

const t = () => document.body.textContent;
console.log('首页:', /工具箱/.test(t()) && /时间戳/.test(t()) && /对比度检查/.test(t()) ? 'ok' : 'FAIL\n'+t());
console.log('无角标    :', !document.querySelector('.offline-badge') && document.querySelector('.search input').placeholder === '搜索工具' ? 'ok' : 'FAIL');

// 搜索:输入「摩斯」应无果,输入「无障碍」应命中对比度检查
const box = document.querySelector('.search input');
const type = (v) => { box.value = v; box.dispatchEvent(new dom.window.Event('input')); };
type('无障碍');
console.log('关键词搜索:', /对比度检查/.test(t()) && !/时间戳/.test(t()) ? 'ok' : 'FAIL\n'+t());

// 粘贴嗅探
type('1757000000');
console.log('粘贴嗅探:', /用「时间戳」处理这段内容/.test(t()) ? 'ok' : 'FAIL\n'+t());

// 点直达 → 进工具 → 带着内容自动出结果
document.querySelector('.sniff').click();
await new Promise(r => setTimeout(r, 80));
console.log('直达并计算:', /本地|UTC/.test(t()) ? 'ok' : 'FAIL\n'+t());
console.log('顶栏改名:', /时间戳/.test(document.querySelector('.bar__title').textContent) ? 'ok' : 'FAIL');

// 返回首页,「最近」应出现
document.querySelector('.bar__back').click();
await new Promise(r => setTimeout(r, 80));
console.log('返回与最近:', /最近/.test(t()) ? 'ok' : 'FAIL\n'+t());

// 自定义 mount 工具
location.hash = '/t/contrast';
await new Promise(r => setTimeout(r, 120));
console.log('自定义工具:', /对比度\s+\d/.test(t()) ? 'ok' : 'FAIL\n'+t());

// 不存在的工具不该炸
location.hash = '/t/nope';
await new Promise(r => setTimeout(r, 60));
console.log('未知路由:', /没有这个工具/.test(t()) ? 'ok' : 'FAIL');

// ── 调色台:算法结果必须和原版一致 ──
location.hash = '/t/color-mixer';
await new Promise(r => setTimeout(r, 150));
const txt = t();
console.log('调色台数值:', /#30564F/.test(txt) && /#A1B6FF/.test(txt) && /#51688D/.test(txt) ? 'ok' : 'FAIL');
console.log('色相判读  :', /173°/.test(txt) && /彩度 44%/.test(txt) ? 'ok' : 'FAIL');
console.log('预设与行  :', /3 个颜色/.test(txt) && document.querySelectorAll('input[type=range]').length === 3 ? 'ok' : 'FAIL');

// 改一个比例,结果应该跟着变
const rng = document.querySelector('input[type=range]');
rng.value = '0';
rng.dispatchEvent(new dom.window.Event('input'));
await new Promise(r => setTimeout(r, 20));
console.log('比例联动  :', !/#30564F/.test(t()) ? 'ok' : 'FAIL');

// 全局 paste 监听必须在离开时被摘掉
const before = dom.window.__pasteCount ?? 0;
location.hash = '/t/color-picker';
await new Promise(r => setTimeout(r, 150));
console.log('图片取色  :', /还没取色/.test(t()) && /取整图主色/.test(t()) ? 'ok' : 'FAIL');
console.log('搜「取色」:', (await import('../src/shell/search.js')).search('取色').map(x=>x.id).join(',') === 'color-picker' ? 'ok' : 'FAIL');
console.log('搜「配色」:', (await import('../src/shell/search.js')).search('配色').length === 2 ? 'ok' : 'FAIL');

// ── 围棋摆棋:挂得上、能落子、SGF 粘贴能直达 ──
location.hash = '/t/go';
await new Promise(r => setTimeout(r, 150));
console.log('围棋挂载  :', /走子记录/.test(t()) && /还没有落子|第 \d+ 手/.test(t()) && document.querySelector('.go canvas') ? 'ok' : 'FAIL\n'+t());
console.log('搜「围棋」:', (await import('../src/shell/search.js')).search('围棋').map(x=>x.id).join(',') === 'go' ? 'ok' : 'FAIL');
location.hash = '/';
await new Promise(r => setTimeout(r, 80));
const box2 = document.querySelector('.search input');
box2.value = '(;GM[1]SZ[13];B[dd];W[jj])';
box2.dispatchEvent(new dom.window.Event('input'));
document.querySelector('.sniff')?.click();
await new Promise(r => setTimeout(r, 150));
console.log('SGF 直达  :', /共 2 手/.test(t()) && /K4/.test(t()) ? 'ok' : 'FAIL\n'+t());

// 围棋:前进后退不许滚动整页(0.6 用了 scrollIntoView,把棋盘推出屏幕,下一次点击就落空)
let pageScrolls = 0;
dom.window.Element.prototype.scrollIntoView = () => { pageScrolls++; };
location.hash = '/t/go';
await new Promise(r => setTimeout(r, 150));
for (const b of document.querySelectorAll('.go .nav .btn')) b.click();
console.log('不滚整页  :', pageScrolls === 0 ? 'ok' : 'FAIL —— 有 ' + pageScrolls + ' 次 scrollIntoView');

// 最近使用:能清空,清完这张卡就不显示了
location.hash = '/';
await new Promise(r => setTimeout(r, 80));
const hadRecent = /最近使用/.test(t());
document.querySelector('.panel__action')?.click();
await new Promise(r => setTimeout(r, 30));
console.log('清空最近  :', hadRecent && !/最近使用/.test(t()) && /全部工具/.test(t()) ? 'ok' : 'FAIL\n' + t());

// 围棋:没开局时不显示「新对局」;开局后出现,点了先问,确定才清空
location.hash = '/t/go';
await new Promise(r => setTimeout(r, 150));
const ng = () => document.querySelector('.go .newgame');
const navBtns = () => [...document.querySelectorAll('.go .nav .btn')];
for (const b of navBtns()) if (b.textContent === '停一手') b.click();
const shown = !ng().hidden;
ng().click();
const asked = !document.querySelector('.go .ask').hidden && /共 [1-9]\d* 手/.test(t());
[...document.querySelectorAll('.go .ask .btn')].find((b) => b.textContent === '确定').click();
console.log('新对局按钮:', shown && asked && /共 0 手/.test(t()) && ng().hidden ? 'ok' : 'FAIL\n' + t());

// 取消要真的看不见:只设 hidden 属性不够,display:flex 会把它盖掉(0.7.2 的 bug)
for (const b of navBtns()) if (b.textContent === '停一手') b.click();
ng().click();
[...document.querySelectorAll('.go .ask .btn')].find((b) => b.textContent === '取消').click();
const askBox = document.querySelector('.go .ask');
console.log('取消即消失:', askBox.hidden && dom.window.getComputedStyle(askBox).display === 'none' && /共 [1-9]\d* 手/.test(t()) ? 'ok' : 'FAIL —— display=' + dom.window.getComputedStyle(askBox).display);

// 改服务器时间:挂得上,快捷按钮出命令,默认第一个服带 +0800
location.hash = '/t/settime';
await new Promise(r => setTimeout(r, 150));
[...document.querySelectorAll('.st .grid .btn')].find((b) => b.textContent === '下一个 0 点').click();
await new Promise(r => setTimeout(r, 30));
const cmd = document.querySelector('.st .cmd')?.textContent ?? '';
console.log('改时间命令:', /^sudo date -s "\d{4}-\d{2}-\d{2} 23:59:50 \+0800"$/.test(cmd) ? 'ok' : 'FAIL —— ' + cmd);
console.log('搜「改时间」:', (await import('../src/shell/search.js')).search('改时间').map(x=>x.id).join(',') === 'settime' ? 'ok' : 'FAIL');
location.hash = '/';
await new Promise(r => setTimeout(r, 60));
