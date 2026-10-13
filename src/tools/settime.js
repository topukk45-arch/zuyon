/* 改服务器时间。生成 sudo date -s 命令,按每个服自己的时区算。
 * 测试服只能往前拨(往回拨要后端清服),所以记住每个服拨到了哪,倒退时拦一下。
 * 时间换算全在 lib/settime.js。 */

import { el, clear } from '../ui/index.js';
import {
  PRESETS, ZONES, validZone, toWall, wallText, offsetLabel, command,
  beforeNext, parseLocal, serverNow,
} from '../lib/settime.js';

const CSS = `
.st .card{background:var(--paper-2);border-radius:var(--radius);padding:var(--s3);display:flex;flex-direction:column;gap:var(--s2)}
.st .lbl{font-size:var(--t-xs);color:var(--ink-3)}
.st .card .input{background:var(--surface);border-color:var(--paper-3)}
.st .chip.on{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}
.st .now{font-family:var(--mono);font-size:var(--t-lg);font-variant-numeric:tabular-nums}
.st .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:var(--s2)}
.st .grid .btn{padding-inline:var(--s1)}
.st .lead{display:flex;align-items:center;gap:var(--s2);font-size:var(--t-sm)}
.st .lead input{max-width:6em}
.st .res{display:flex;flex-direction:column;gap:var(--s2)}
.st .item{background:var(--surface);border:1px solid var(--paper-3);border-radius:var(--radius);padding:var(--s3);display:flex;flex-direction:column;gap:var(--s1)}
.st .item.bad{border-color:var(--warn)}
.st .item.done{opacity:.55}
.st .cmd{font-family:var(--mono);font-size:var(--t-sm);word-break:break-all}
.st .sub{font-size:var(--t-xs);color:var(--ink-3);font-variant-numeric:tabular-nums}
.st .warn{font-size:var(--t-xs);color:var(--warn)}
.st .srv{display:grid;grid-template-columns:1fr 1fr;gap:var(--s2);padding-block:var(--s2);border-bottom:1px dashed var(--paper-3)}
.st .srv .chk{grid-column:1/-1;display:flex;justify-content:space-between;align-items:center;font-size:var(--t-sm)}
.st details summary{cursor:pointer;font-size:var(--t-sm);color:var(--ink-2);padding-block:var(--s2)}
`;

const local = (zone, ms) => wallText(toWall(zone, ms)).replace(' ', 'T');
const BJ = 'Asia/Shanghai';

export default {
  mount(root, ctx) {
    const S = ctx.storage;
    let servers = S.get('servers', null) ?? PRESETS.map((p) => ({ ...p, tz: true }));
    let sel = S.get('sel', servers[0]?.id);
    let last = S.get('last', {});
    let lead = S.get('lead', 10);
    let results = [];                       // { label, ms, status, done, confirm }
    const save = () => { S.set('servers', servers); S.set('sel', sel); S.set('last', last); S.set('lead', lead); };
    const cur = () => servers.find((s) => s.id === sel) ?? servers[0];
    const now = () => serverNow(last[cur()?.id], Date.now());

    // ── 选服 ──
    const chips = el('div', { class: 'chips' });
    const nowText = el('div', { class: 'now' }), nowSub = el('div', { class: 'sub' });
    const wipeBtn = el('button', { class: 'btn', onclick: () => {
      delete last[cur().id]; results = []; save(); render(); ctx.toast('已清零,按真实时间重新算');
    } }, '已清服');

    // ── 提前几秒 + 快捷 ──
    const leadIn = el('input', { class: 'input', type: 'number', min: '0', step: '1', value: lead });
    leadIn.addEventListener('input', () => { lead = Math.max(0, parseInt(leadIn.value, 10) || 0); save(); });
    const quick = (kind, name) => el('button', { class: 'btn', onclick: () => {
      const s = cur();
      show([{ label: `${name}前 ${lead} 秒`, ms: beforeNext(kind, s.zone, now(), lead), status: 'ok' }]);
    } }, name);

    // ── 手填 ──
    const at = el('input', { class: 'input', type: 'datetime-local', step: '1' });
    const evStart = el('input', { class: 'input', type: 'datetime-local', step: '1' });
    const evEnd = el('input', { class: 'input', type: 'datetime-local', step: '1' });
    const pick = (label, input, back) => {
      const r = parseLocal(cur().zone, input.value);
      return { label, ms: r.ms - back * 1000, status: r.status };
    };
    const tryShow = (f) => { try { show(f()); } catch (e) { ctx.toast(e.message); } };

    const res = el('div', { class: 'res' });
    const srvList = el('div');

    root.append(el('style', {}, CSS), el('div', { class: 'tool-body st' },
      chips,
      el('div', { class: 'card' },
        el('span', { class: 'lbl' }, '这个服现在大约'),
        nowText, nowSub,
        el('div', { class: 'row' }, wipeBtn)),
      el('div', { class: 'card' },
        el('div', { class: 'lead' }, '提前', leadIn, '秒'),
        el('div', { class: 'grid' }, quick('day', '下一个 0 点'), quick('week', '下周一 0 点'), quick('month', '下月 1 号 0 点'))),
      res,
      el('div', { class: 'card' },
        el('span', { class: 'lbl' }, '拨到指定时间(这个服的当地时间)'), at,
        el('button', { class: 'btn', onclick: () => tryShow(() => [pick('指定时间', at, 0)]) }, '生成')),
      el('div', { class: 'card' },
        el('span', { class: 'lbl' }, '活动测试点:开始和结束前各拨一次'),
        el('span', { class: 'lbl' }, '开始'), evStart, el('span', { class: 'lbl' }, '结束'), evEnd,
        el('button', { class: 'btn', onclick: () => tryShow(() => {
          const a = pick(`开始前 ${lead} 秒`, evStart, lead), b = pick(`结束前 ${lead} 秒`, evEnd, lead);
          if (b.ms <= a.ms) throw new Error('结束时间要晚于开始时间');
          return [a, b];
        }) }, '生成')),
      el('details', {}, el('summary', {}, '管理服务器'), el('div', { class: 'card' }, srvList,
        el('div', { class: 'row' },
          el('button', { class: 'btn', onclick: () => {
            const id = 's' + Date.now().toString(36);
            servers.push({ id, name: '新的服', zone: 'Asia/Shanghai', tz: true }); sel = id; save(); render();
          } }, '添加'),
          el('button', { class: 'btn', onclick: () => {
            servers = PRESETS.map((p) => ({ ...p, tz: true })); sel = servers[0].id; save(); render();
          } }, '恢复默认'))),
      ),
    ));

    function show(list) {
      results = list.map((r) => ({ ...r, done: false, confirm: false })); renderResults();
      res.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });   // 从下面的卡片生成时,把结果带进视野
    }

    async function copyItem(r) {
      const s = cur(), back = r.ms < now() - 1000;
      if (back && !r.confirm) { r.confirm = true; renderResults(); return; }
      if (!(await ctx.platform.copy(command(s.zone, r.ms, s.tz)))) { ctx.toast('复制失败'); return; }
      last[s.id] = { target: r.ms, at: Date.now() }; r.done = true; r.confirm = false;
      at.value = local(s.zone, now());
      save(); renderStatus(); renderResults();
      ctx.toast(`已复制,记为拨到 ${wallText(toWall(s.zone, r.ms))}`);
    }

    function renderResults() {
      clear(res);
      const s = cur(), n = now();
      for (const r of results) {
        const back = r.ms < n - 1000 && !r.done;
        const notes = [];
        if (r.status === 'gap') notes.push('这个钟点因夏令时不存在,已顺延');
        if (r.status === 'overlap') notes.push('这个钟点因夏令时会出现两次,按第一次算');
        if (back) notes.push(`比这个服现在(约 ${wallText(toWall(s.zone, n))})早,时间倒退会出问题`);
        const w = toWall(s.zone, r.ms);
        res.append(el('div', { class: 'item' + (back ? ' bad' : '') + (r.done ? ' done' : '') },
          el('span', { class: 'lbl' }, `${r.label} · ${s.name} ${offsetLabel(w.off)}`),
          el('div', { class: 'cmd u-selectable' }, command(s.zone, r.ms, s.tz)),
          el('div', { class: 'sub' }, `北京时间 ${wallText(toWall(BJ, r.ms))} · 时间戳 ${Math.floor(r.ms / 1000)}`),
          notes.length ? el('div', { class: 'warn' }, notes.join(';')) : null,
          el('button', { class: 'btn' + (back ? '' : ' btn--primary'), onclick: () => copyItem(r) },
            r.done ? '已复制,再复制一次' : r.confirm ? '确定往回拨?再点一次复制' : '复制命令'),
        ));
      }
    }

    function renderStatus() {
      const s = cur(), rec = last[s.id];
      nowText.textContent = wallText(toWall(s.zone, now()));
      nowSub.textContent = rec
        ? `上次拨到 ${wallText(toWall(s.zone, rec.target))},之后按真实时间往前走。复制命令就记为已拨。`
        : `还没拨过,按真实时间算。${s.name} ${offsetLabel(toWall(s.zone, Date.now()).off)}`;
      wipeBtn.hidden = !rec;
    }

    function renderServers() {
      clear(chips);
      for (const s of servers) chips.append(el('button', {
        class: 'chip' + (s.id === sel ? ' on' : ''),
        onclick: () => { sel = s.id; results = []; save(); render(); },
      }, s.name));
      clear(srvList);
      for (const s of servers) {
        const name = el('input', { class: 'input', value: s.name, 'aria-label': '服名' });
        name.addEventListener('change', () => { s.name = name.value.trim() || s.name; save(); render(); });
        const zone = el('select', { class: 'input', 'aria-label': '时区' },
          ZONES.map(([z, n]) => el('option', { value: z }, n)));
        if (!ZONES.some(([z]) => z === s.zone)) zone.append(el('option', { value: s.zone }, s.zone));
        zone.value = s.zone;
        zone.addEventListener('change', () => { if (validZone(zone.value)) { s.zone = zone.value; save(); render(); } });
        const tz = el('input', { type: 'checkbox' }); tz.checked = s.tz;
        tz.addEventListener('change', () => { s.tz = tz.checked; save(); renderResults(); });
        srvList.append(el('div', { class: 'srv' }, name, zone, el('div', { class: 'chk' },
          el('label', { style: 'display:flex;gap:var(--s2);align-items:center' }, tz, '命令末尾带时区'),
          servers.length > 1 ? el('button', { class: 'btn', onclick: () => {
            servers = servers.filter((x) => x !== s); delete last[s.id];
            if (sel === s.id) sel = servers[0].id; save(); render();
          } }, '删除') : null)));
      }
    }

    // 生成的命令是按「当时那个服、那个时区」算的绝对时刻。服或时区一变
    // (切换、改时区、添加、删除、恢复默认),旧结果的钟点就对不上标题了,复制出去就拨错。
    let shownFor = '';
    function render() {
      const key = `${cur()?.id}|${cur()?.zone}`;
      if (key !== shownFor) { shownFor = key; results = []; }
      renderServers(); renderStatus(); renderResults();
      const s = cur(), n = now();
      at.value = local(s.zone, n); evStart.value = evEnd.value = '';
    }

    render();
    const tick = setInterval(renderStatus, 1000);
    return () => clearInterval(tick);
  },
};
