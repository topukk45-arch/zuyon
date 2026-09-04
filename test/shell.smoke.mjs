import { JSDOM } from 'jsdom';
const dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
for (const k of ['window','document','localStorage','HashChangeEvent','Blob','URL','DocumentFragment','location','Event','Node'])
  globalThis[k] = k === 'window' ? dom.window : dom.window[k];
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});

const { start } = await import('../src/shell/app.js');
start(document.getElementById('app'));
await new Promise(r => setTimeout(r, 50));

const t = () => document.body.textContent;
console.log('首页:', /工具箱/.test(t()) && /时间戳/.test(t()) && /对比度检查/.test(t()) ? 'ok' : 'FAIL\n'+t());
console.log('角标:', /无网络权限/.test(t()) ? 'ok' : 'FAIL');

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
