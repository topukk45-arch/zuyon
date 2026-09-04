/* 验错误面板真的会把原因显示出来。
 * 这条测试的价值在于:它守住的是「出问题时能看见原因」这个能力本身。 */
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
for (const k of ['window','document','localStorage','HashChangeEvent','Blob','URL','DocumentFragment','location','Event','Node','Image','FileReader','history','PopStateEvent','ErrorEvent'])
  globalThis[k] = k === 'window' ? dom.window : dom.window[k];
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});

const { errorPanel, installGlobalErrorHandler } = await import('../src/shell/errors.js');

// 1) 面板要包含错误原文
const panel = errorPanel('测试标题', new TypeError('导入失败了'));
const txt = panel.textContent;
console.log('显示标题:', /测试标题/.test(txt) ? 'ok' : 'FAIL');
console.log('显示原因:', /TypeError: 导入失败了/.test(txt) ? 'ok' : 'FAIL');
console.log('给排查线索:', /chrome:\/\/inspect/.test(txt) ? 'ok' : 'FAIL');
console.log('可选中复制:', panel.querySelector('.u-selectable') ? 'ok' : 'FAIL');

// 2) 工具加载失败要显示原因,而不是一句「没加载出来」
const root = document.getElementById('app');
installGlobalErrorHandler(root);
dom.window.dispatchEvent(new dom.window.ErrorEvent('error', { message: '炸了', error: new Error('炸了') }));
await new Promise(r => setTimeout(r, 20));
console.log('全局兜底渲染:', /炸了/.test(root.textContent) ? 'ok' : 'FAIL');

// 3) 只显示第一个,不刷屏
dom.window.dispatchEvent(new dom.window.ErrorEvent('error', { message: '第二个', error: new Error('第二个') }));
await new Promise(r => setTimeout(r, 20));
console.log('不刷屏:', !/第二个/.test(root.textContent) ? 'ok' : 'FAIL');
