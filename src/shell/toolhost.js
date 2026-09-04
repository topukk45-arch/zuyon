/* 工具宿主。负责:动态加载、造 ctx、挂载、卸载时收尾、记入「最近」。
 * shell 只认识 registry,这里也不 import 任何具体工具。 */

import { byId } from '../core/registry.js';
import { mountTool } from '../core/shapes.js';
import { scoped, shellStore } from '../core/storage.js';
import * as platform from '../core/platform.js';
import { el } from '../ui/index.js';
import { home } from './router.js';
import { errorPanel } from './errors.js';

export async function renderTool(scroll, id, payload, ctx) {
  const meta = byId(id);
  if (!meta) {
    scroll.append(el('p', { class: 'empty' }, '没有这个工具。'));
    return () => {};
  }

  scroll.append(el('p', { class: 'empty' }, '加载中'));
  let mod;
  try {
    mod = (await meta.load()).default;
    if (!mod) throw new Error('模块加载了，但没有 default 导出');
  } catch (e) {
    // 把原因显示出来。手机上没有控制台，吞掉错误等于让人对着空白页猜。
    scroll.textContent = '';
    scroll.append(errorPanel(`工具「${meta.name}」没加载出来`, e));
    return () => {};
  }
  scroll.textContent = '';

  // 工具能拿到的东西被限死在这个对象里
  const toolCtx = {
    storage: scoped(id),
    platform: {
      can: platform.can,
      copy: platform.copy,
      readClipboard: platform.readClipboard,
      pickFile: platform.pickFile,
      saveFile: platform.saveFile,
      share: platform.share,
    },
    toast: ctx.toast,
    back: home,
    initial: payload?.initial ?? null,
  };

  remember(id);

  let cleanup = () => {};
  try {
    cleanup = mountTool(mod, scroll, toolCtx) ?? (() => {});
  } catch (e) {
    scroll.append(errorPanel(`工具「${meta.name}」运行时出错`, e));
  }
  return cleanup;
}

function remember(id) {
  const prev = (shellStore.get('recent', []) ?? []).filter((x) => x !== id);
  shellStore.set('recent', [id, ...prev].slice(0, 6));
}
