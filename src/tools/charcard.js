/* 角色卡。把 PNG 里藏的角色定义和世界书读出来,不用装酒馆。
 * 解析全在 lib/charcard.js 里,这个文件只管显示。 */

import { el, fileDrop } from '../ui/index.js';
import { isPng, readCard, readCardFromText, describeEntry, estimateTokens, weigh } from '../lib/charcard.js';

const MUTED = 'color:var(--ink-3);font-size:var(--t-sm)';
const CARD = 'background:var(--paper-2);border-radius:var(--radius);padding:var(--s3)';
const PRE = 'white-space:pre-wrap;word-break:break-word;font-family:var(--mono);font-size:var(--t-sm);margin-top:var(--s2)';

export default {
  mount(root, ctx) {
    const out = el('div', { class: 'tool-body' });
    let current = null;

    const drop = fileDrop(
      ctx,
      { accept: 'image/png,application/json', hint: '把角色卡 PNG 拖进来,或点击选择' },
      (file) => load(file),
    );

    async function load(file) {
      show(el('p', { style: MUTED }, '正在读…'));
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const card = isPng(bytes)
          ? await readCard(bytes)
          : readCardFromText(new TextDecoder('utf-8').decode(bytes));
        current = card;
        show(render(card, ctx));
      } catch (e) {
        current = null;
        show(el('div', { class: 'result', 'data-error': 'true' }, e.message));
      }
    }

    function show(node) {
      out.textContent = '';
      out.append(node);
    }

    root.append(el('div', { class: 'tool-body' },
      drop,
      el('p', { style: MUTED }, '数据藏在 PNG 的文本块里。被截图或压缩工具重存过的图,那一块会丢。'),
      out,
    ));

    // 首页粘一段卡片 JSON 直接进来
    if (ctx.initial) {
      try {
        current = readCardFromText(ctx.initial);
        show(render(current, ctx));
      } catch (e) {
        show(el('div', { class: 'result', 'data-error': 'true' }, e.message));
      }
    }

    return () => { current = null; };
  },
};

function render(card, ctx) {
  const w = weigh(card);
  // 先看常驻再看按需,这是理解一张卡的顺序;停用的沉底
  const entries = (card.book?.entries ?? []).map(describeEntry)
    .sort((a, b) => (b.enabled - a.enabled) || (b.constant - a.constant) || (a.order - b.order));

  return el('div', { class: 'tool-body' },
    overview(card, w),
    card.notes ? block('作者备注', el('div', { style: PRE }, card.notes)) : null,
    card.fields.length ? section('角色定义', card.fields.map(fieldRow)) : null,
    card.greetings.length
      ? section(`备用开场白 ${card.greetings.length} 条`,
        card.greetings.map((g, i) => foldable(`第 ${i + 1} 条`, `${estimateTokens(g)} tok`, g)))
      : null,
    entries.length ? bookSection(entries, w) : el('p', { style: MUTED }, '这张卡没带世界书。'),
    section('原始 JSON', [foldable('展开全文', `${JSON.stringify(card.raw).length} 字符`,
      JSON.stringify(card.raw, null, 2))]),
    el('div', { class: 'row' },
      button('复制全部 JSON', () => copy(ctx, JSON.stringify(card.raw, null, 2)), true),
      button('存成 JSON 文件', () => save(ctx, card.raw, `${card.name || 'card'}.json`)),
      card.book ? button('只存世界书', () => save(ctx, card.book, `${card.name || 'card'}-lorebook.json`)) : null,
    ),
  );
}

function overview(card, w) {
  const meta = [
    card.spec.includes('v3') ? 'V3' : card.spec.includes('v2') ? 'V2' : 'V1',
    card.charVersion && `卡版本 ${card.charVersion}`,
    card.creator && `作者 ${card.creator}`,
    card.keyword && `关键字 ${card.keyword}`,
  ].filter(Boolean);

  return el('div', { style: CARD },
    el('div', { style: 'font-size:var(--t-xl);font-weight:600' }, card.name || '(没写名字)'),
    el('div', { style: `${MUTED};margin-top:var(--s1)` }, meta.join('  ·  ')),
    card.tags.length
      ? el('div', { class: 'chips', style: 'margin-top:var(--s3)' },
        card.tags.slice(0, 12).map((t) => el('span', { class: 'chip' }, t)))
      : null,
    el('div', { style: `${MUTED};margin-top:var(--s3)` },
      `世界书 ${w.entries} 条　全卡粗估 ${w.total} tok`),
    el('div', { style: MUTED },
      `每次请求的底噪 ${w.fixed + w.constant} tok(角色定义 ${w.fixed} + 常驻条目 ${w.constant})`),
  );
}

function bookSection(entries, w) {
  const on = entries.filter((e) => e.enabled).length;
  const constant = entries.filter((e) => e.constant && e.enabled).length;
  return section(`世界书 ${entries.length} 条`, [
    el('p', { style: MUTED },
      `启用 ${on} 条,其中常驻 ${constant} 条,每次请求都会进上下文,合计粗估 ${w.constant} tok。`),
    ...entries.map(entryRow),
  ]);
}

function entryRow(e) {
  const bits = [
    e.trigger,
    e.position + (e.depth === null ? '' : ` ${e.depth}`),
    `顺序 ${e.order}`,
    e.probability !== 100 && `触发 ${e.probability}%`,
    e.role && `以${e.role}身份`,
    !e.enabled && '已停用',
  ].filter(Boolean);

  const head = el('div', {},
    el('div', {}, e.name),
    el('div', { style: MUTED }, bits.join('  ·  ')),
    e.keys.length ? el('div', { style: MUTED }, `关键词 ${e.keys.join('、')}`) : null,
    e.secondary.length ? el('div', { style: MUTED }, `次要 ${e.secondary.join('、')}`) : null,
  );

  return el('details', { style: `${CARD};margin-bottom:var(--s2)` },
    el('summary', { style: 'cursor:pointer' }, head),
    el('div', { style: PRE }, e.content || '(空)'),
  );
}

function fieldRow(f) {
  return foldable(f.label, `${estimateTokens(f.text)} tok`, f.text);
}

function foldable(title, note, text) {
  return el('details', { style: `${CARD};margin-bottom:var(--s2)` },
    el('summary', { style: 'cursor:pointer' },
      title,
      el('span', { style: `${MUTED};margin-left:var(--s2)` }, note)),
    el('div', { style: PRE }, text),
  );
}

function section(title, children) {
  return el('div', {},
    el('div', { class: 'section-label' }, title),
    ...[children].flat().filter(Boolean),
  );
}

function block(title, node) {
  return el('div', { style: CARD },
    el('div', { class: 'section-label' }, title),
    node,
  );
}

function button(label, onclick, primary = false) {
  return el('button', { class: primary ? 'btn btn--primary' : 'btn', onclick }, label);
}

async function copy(ctx, text) {
  ctx.toast(await ctx.platform.copy(text) ? '已复制' : '复制失败');
}

async function save(ctx, obj, filename) {
  await ctx.platform.saveFile(JSON.stringify(obj, null, 2), filename);
  ctx.toast(`已保存 ${filename}`);
}
