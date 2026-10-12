/* 首页。搜索优先,不用分类网格。
 * 假设你知道自己要干什么,而不是假设你知道自己要找哪一类。 */

import tools from '../core/registry.js';
import { el, clear } from '../ui/index.js';
import { search, sniff } from './search.js';
import { openTool } from './router.js';
import { shellStore } from '../core/storage.js';
import { VERSION } from '../core/version.js';

export function renderHome(scroll, ctx) {
  const box = el('input', {
    type: 'search',
    placeholder: '搜工具,或直接粘贴内容',
    autocomplete: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
  });

  const results = el('div', { style: 'display:flex;flex-direction:column;gap:var(--s4)' });

  const draw = () => {
    clear(results);
    const q = box.value;

    // 粘贴进来的内容能被某个工具认领,就先给直达
    const hit = q.trim().length >= 3 ? sniff(q) : null;
    if (hit) {
      results.append(el('button', {
        class: 'sniff',
        onclick: () => openTool(hit.tool.id, { initial: q.trim() }),
      }, el('strong', {}, hit.tool.name), el('span', {}, `用「${hit.tool.name}」处理这段内容`)));
    }

    if (!q.trim()) { results.append(recentAndAll(ctx)); return; }

    const found = search(q);
    if (!found.length && !hit) {
      results.append(el('p', { class: 'empty' }, `没有能处理「${q}」的工具。`));
      return;
    }
    results.append(el('section', { class: 'panel' },
      el('div', { class: 'panel__head' }, el('h2', {}, '搜索结果'), el('span', {}, `${found.length} 个`)),
      list(found)));
  };

  box.addEventListener('input', draw);
  draw();

  scroll.append(
    el('section', { class: 'home-head' },
      el('div', { class: 'home-head__title' }, el('h1', {}, '足用'), el('span', {}, `工具箱 · ${tools.length} 个工具`)),
      el('div', { class: 'search' }, box),
    ),
    results,
  );
}

function recentAndAll(ctx) {
  const frag = document.createDocumentFragment();
  const recent = (shellStore.get('recent', []) ?? [])
    .map((id) => tools.find((t) => t.id === id))
    .filter(Boolean);

  if (recent.length) {
    frag.append(
      el('section', { class: 'panel' },
        el('div', { class: 'panel__head' }, el('h2', {}, '最近')),
        el('div', { class: 'chips', style: 'padding-bottom:var(--s2)' }, recent.map((t) =>
          el('button', { class: 'chip', onclick: () => openTool(t.id) }, t.name))),
      ),
    );
  }

  frag.append(
    el('section', { class: 'panel' },
      el('div', { class: 'panel__head' }, el('h2', {}, '全部工具'), el('span', {}, `共 ${tools.length} 个`)),
      list(tools),
    ),
    // 不联网是产品的根,但不必在顶上挂个角标喊出来;页脚说一句就够
    el('p', { class: 'home-foot' }, `足用 ${VERSION} · 纯本地,不联网`),
  );
  return frag;
}

function list(items) {
  return el('ul', { class: 'tool-list', role: 'list' }, items.map((t) =>
    el('li', {},
      el('button', { class: 'tool-item', onclick: () => openTool(t.id) },
        el('span', { class: 'tool-item__text' },
          el('div', { class: 'tool-item__name' }, t.name),
          el('div', { class: 'tool-item__desc' }, t.desc),
        ),
      ),
    ),
  ));
}
