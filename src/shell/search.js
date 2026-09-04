/* 搜索与粘贴嗅探。全部在 registry 的元数据上跑,不加载任何工具。 */

import tools from '../core/registry.js';

/** 打分:名称前缀 > 名称包含 > 关键词 > 描述 */
export function search(q) {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const scored = [];
  for (const t of tools) {
    const name = t.name.toLowerCase();
    let score = 0;
    if (name.startsWith(s)) score = 100;
    else if (name.includes(s)) score = 80;
    else if (t.keywords.some((k) => k.toLowerCase().startsWith(s))) score = 60;
    else if (t.keywords.some((k) => k.toLowerCase().includes(s))) score = 40;
    else if (t.desc.toLowerCase().includes(s)) score = 20;
    if (score) scored.push({ tool: t, score });
  }
  return scored.sort((a, b) => b.score - a.score).map((x) => x.tool);
}

/**
 * 内容嗅探:一段粘贴进来的东西,该由谁接管。
 * 这是「或直接粘贴内容」那半句的实现 —— 对手的分类网格结构上做不到。
 * @returns {{tool, confidence}|null}
 */
export function sniff(text) {
  if (!text || text.length > 4096) return null;
  let best = null;
  for (const t of tools) {
    if (!t.sniff) continue;
    const c = t.sniff(text);
    if (c > 0.5 && (!best || c > best.confidence)) best = { tool: t, confidence: c };
  }
  return best;
}
