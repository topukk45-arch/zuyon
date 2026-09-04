/* 验返回接管:在工具里返回应该回首页,在首页返回才允许退出。
 * 这条在浏览器里走 history 分支,安卓走 Capacitor App 插件分支,
 * 两边都测,免得只有一边是对的。 */
import { JSDOM } from 'jsdom';

/* mode: 'web' | 'handle'(Capacitor 6，同步返回) | 'promise'(Capacitor 5 及更早) */
async function run(mode) {
  const withCapacitor = mode !== 'web';
  const dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  for (const k of ['window','document','localStorage','HashChangeEvent','Blob','URL','DocumentFragment','location','Event','Node','Image','FileReader','history','PopStateEvent'])
    globalThis[k] = k === 'window' ? dom.window : dom.window[k];
  Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});

  let exited = false;
  let fire = null;
  delete globalThis.Capacitor;
  if (withCapacitor) {
    const handle = { remove(){} };
    globalThis.Capacitor = dom.window.Capacitor = { isNativePlatform: () => true, Plugins: { App: {
      // 两种形态都要撑住。0.3 只 mock 了 promise 形态，
      // 于是测试验证的是「我的错误假设」，真机上当场炸。
      addListener: (_, cb) => {
        fire = cb;
        return mode === 'promise' ? Promise.resolve(handle) : handle;
      },
      exitApp: () => { exited = true; },
    } } };
  }

  const { start } = await import(`../src/shell/app.js?v=${mode}`);
  start(document.getElementById('app'));
  await new Promise(r => setTimeout(r, 60));

  if (!withCapacitor) {
    // 浏览器分支:不该注册任何返回处理器。
    // 曾经这里挂过 popstate 兜底,导致进工具立刻被弹回首页 —— 回归测试守住它。
    location.hash = '/t/timestamp';
    await new Promise(r => setTimeout(r, 80));
    console.log('浏览器 · 进工具不被弹回:', location.hash === '#/t/timestamp' ? 'ok' : `FAIL(${location.hash})`);
    return;
  }

  // 安卓分支:工具里返回该回首页,不该退出
  location.hash = '/t/timestamp';
  await new Promise(r => setTimeout(r, 80));
  fire();
  await new Promise(r => setTimeout(r, 80));
  const backToHome = location.hash === '' || location.hash === '#/';
  console.log(`安卓(${mode}) · 工具里返回回首页:`, backToHome && !exited ? 'ok' : `FAIL(hash=${location.hash} exited=${exited})`);

  // 已经在首页再返回 → 该退出
  fire();
  await new Promise(r => setTimeout(r, 40));
  console.log(`安卓(${mode}) · 首页返回才退出:`, exited ? 'ok' : 'FAIL');
}

await run('web');
await run('handle');    // Capacitor 6
await run('promise');   // Capacitor 5 及更早

/* 隔离验证:返回接管彻底失败时,外壳必须照常启动。
 * 0.3 就是栽在这里 —— 一个可选增强把整个应用拖成了白屏。 */
{
  const dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  for (const k of ['window','document','localStorage','HashChangeEvent','Blob','URL','DocumentFragment','location','Event','Node','Image','FileReader','history','PopStateEvent'])
    globalThis[k] = k === 'window' ? dom.window : dom.window[k];
  Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});

  globalThis.Capacitor = { isNativePlatform: () => true, Plugins: { App: {
    addListener() { throw new Error('插件坏了'); },
    exitApp() {},
  } } };

  const { start } = await import('../src/shell/app.js?v=broken');
  start(document.getElementById('app'));
  await new Promise(r => setTimeout(r, 60));
  const ok = /工具箱/.test(document.body.textContent) && /时间戳/.test(document.body.textContent);
  console.log('返回接管炸了外壳仍启动:', ok ? 'ok' : 'FAIL');
}
