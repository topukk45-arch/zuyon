/* 工具宿主。负责:动态加载、造 ctx、挂载、卸载时收尾、记入「最近」。
 * shell 只认识 registry,这里也不 import 任何具体工具。 */

import { byId } from '../core/registry.js';
import { mountTool } from '../core/shapes.js';
import { scoped, shellStore } from '../core/storage.js';
import * as platform from '../core/platform.js';
import { el } from '../ui/index.js';
import { home } from './router.js';

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
  } catch {
    scroll.textContent = '';
    scroll.append(el('p', { class: 'empty' }, '这个工具没加载出来。返回首页再试一次。'));
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
    scroll.append(el('p', { class: 'empty' }, `这个工具挂了:${e.message}`));
  }
  return cleanup;
}

function remember(id) {
  const prev = (shellStore.get('recent', []) ?? []).filter((x) => x !== id);
  shellStore.set('recent', [id, ...prev].slice(0, 6));
}
