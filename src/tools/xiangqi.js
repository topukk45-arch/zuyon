/* 中国象棋。人机或同一部手机两人对下。
 * 规则与记谱在 lib/xiangqi.js,电脑在 lib/xqai.js(经 workers/xqai.js 在后台算),画棋盘在 ui/xqBoard.js。 */

import { el, clear } from '../ui/index.js';
import { xqBoardView, WOODS } from '../ui/xqBoard.js';
import { clack } from '../ui/goBoard.js';
import { replay, historyOf, status, judgeRepeat, legalMoves, mvFrom, mvTo, sideOf, RED } from '../lib/xiangqi.js';
import { think, LEVELS } from '../lib/xqai.js';

const CSS = `
.xq .seg{display:flex} .xq .seg .btn{flex:1;border-radius:0;margin-left:-1px;padding-inline:var(--s1)}
.xq .seg .btn:first-child{border-radius:var(--radius-sm) 0 0 var(--radius-sm);margin-left:0}
.xq .seg .btn:last-child{border-radius:0 var(--radius-sm) var(--radius-sm) 0}
.xq .top{display:flex;gap:var(--s2);align-items:center} .xq .top .seg{flex:1}
.xq .newgame{min-width:40px;min-height:40px;padding:0;border-radius:50%;font-size:var(--t-lg);color:var(--ink-2)}
.xq .ask{border:1px solid var(--warn);border-radius:var(--radius);padding:var(--s2) var(--s3)}
.xq .ask:not([hidden]){display:flex;flex-wrap:wrap;gap:var(--s2);align-items:center} .xq .ask span{flex:1;min-width:10em;font-size:var(--t-sm)}
.xq .lead{font-size:var(--t-lg);font-weight:600;text-align:center;min-height:1.6em}
.xq .lead.end{color:var(--accent)} .xq .lead.chk{color:var(--warn)}
.xq .card{background:var(--paper-2);border-radius:var(--radius);padding:var(--s3);display:flex;flex-direction:column;gap:var(--s2)}
.xq .lbl{font-size:var(--t-xs);color:var(--ink-3)}
.xq .rec{display:grid;grid-template-columns:2.2em 1fr 1fr;gap:2px var(--s2);max-height:12em;overflow-y:auto;font-size:var(--t-sm);font-variant-numeric:tabular-nums}
.xq .rec span:nth-child(3n+1){color:var(--ink-3);text-align:end}
.xq .chk{display:flex;gap:var(--s2);align-items:center;font-size:var(--t-sm);min-height:32px}
.xq details summary{cursor:pointer;font-size:var(--t-sm);color:var(--ink-2);padding-block:var(--s2)}
`;
const DEFAULTS = { mode: 'ai', human: RED, level: 'mid', undoLimit: 3, undoUsed: 0, moves: [], faceToFace: false, sound: true, wood: 0 };
const UNDO_OPTS = [[0, '不许'], [3, '3 次'], [5, '5 次'], [-1, '不限']];
const sideName = (s) => (s === RED ? '红方' : '黑方');

export default {
  mount(root, ctx) {
    const st = { ...DEFAULTS, ...ctx.storage.get('state', {}) };
    const save = () => ctx.storage.set('state', st);
    let sel = -1, targets = [], thinking = false, reqId = 0, worker = null, g = null, result = null;

    const board = xqBoardView(onSquare);
    const lead = el('div', { class: 'lead', role: 'status' });
    const askBox = el('div', { class: 'ask', hidden: true });
    const rec = el('div', { class: 'rec' });
    const btn = (label, fn, cls = 'btn') => el('button', { class: cls, onclick: fn }, label);
    const seg = (opts, get, set) => {
      const box = el('div', { class: 'seg' }, opts.map(([v, label]) => el('button', { class: 'btn', 'data-v': String(v), onclick: () => set(v) }, label)));
      box.sync = () => box.querySelectorAll('.btn').forEach((b) => b.classList.toggle('btn--primary', b.dataset.v === String(get())));
      return box;
    };
    const modeSeg = seg([['ai', '人机'], ['pvp', '双人']], () => st.mode, (v) => { if (v !== st.mode) ask(`换成${v === 'ai' ? '人机' : '双人'}会重新开一盘`, () => { st.mode = v; reset(); }); });
    const newBtn = btn('↺', () => ask('重新开一盘?', reset), 'btn newgame');
    newBtn.title = '新对局';
    const undoBtn = btn('悔棋', undo);
    const humanSeg = seg([[RED, '执红(先走)'], [1, '执黑']], () => st.human, (v) => { if (v !== st.human) ask('换边会重新开一盘', () => { st.human = v; reset(); }); });
    const levelSeg = seg(Object.entries(LEVELS).map(([k, l]) => [k, l.name]), () => st.level, (v) => { st.level = v; render(); });
    const undoSeg = seg(UNDO_OPTS, () => st.undoLimit, (v) => { st.undoLimit = v; render(); });
    const woodSeg = seg(WOODS.map((w, i) => [i, w.name]), () => st.wood, (v) => { st.wood = v; render(); });
    const check = (key, label) => {
      const box = el('input', { type: 'checkbox' }); box.checked = st[key];
      box.addEventListener('change', () => { st[key] = box.checked; render(); });
      return el('label', { class: 'chk' }, box, label);
    };
    const aiOpts = el('div', { class: 'card' }, el('span', { class: 'lbl' }, '人机:我执'), humanSeg,
      el('span', { class: 'lbl' }, '电脑水平'), levelSeg, el('span', { class: 'lbl' }, '每盘悔棋次数'), undoSeg);
    const pvpOpts = el('div', { class: 'card' }, check('faceToFace', '对坐模式:黑方的字倒过来,手机平放在两人中间'),
      el('span', { class: 'lbl' }, '双人模式悔棋不限次数,每次退一步'));

    root.append(el('style', {}, CSS), el('div', { class: 'tool-body xq' },
      el('div', { class: 'top' }, modeSeg, newBtn), askBox, lead, board.node,
      el('div', { class: 'row' }, undoBtn),
      el('div', { class: 'card' }, el('span', { class: 'lbl' }, '棋谱'), rec,
        el('div', { class: 'row' }, el('button', { class: 'btn', onclick: async () => ctx.toast(await ctx.platform.copy(recordText()) ? '已复制' : '复制失败') }, '复制棋谱'))),
      el('details', {}, el('summary', {}, '设置'), el('div', { class: 'tool-body' }, aiOpts, pvpOpts,
        el('div', { class: 'card' }, el('span', { class: 'lbl' }, '棋盘颜色'), woodSeg, check('sound', '落子声音')))),
    ));

    function ask(text, onYes) {
      if (!st.moves.length) { onYes(); return; }
      clear(askBox);
      askBox.append(el('span', {}, text), btn('确定', () => { askBox.hidden = true; onYes(); }, 'btn btn--primary'), btn('取消', () => { askBox.hidden = true; }));
      askBox.hidden = false;
    }
    function reset() { cancelAi(); Object.assign(st, { moves: [], undoUsed: 0 }); sel = -1; targets = []; render(); }

    // ── 下棋 ──
    const aiTurn = () => st.mode === 'ai' && !result && g.side !== st.human;
    function onSquare(s) {
      if (result || thinking || aiTurn()) return;
      if (sel >= 0 && targets.includes(s)) { play(legalMoves(g.board, g.side).find((m) => mvFrom(m) === sel && mvTo(m) === s)); return; }
      if (g.board[s] && sideOf(g.board[s]) === g.side) {
        sel = s; targets = legalMoves(g.board, g.side).filter((m) => mvFrom(m) === s).map(mvTo);
      } else { sel = -1; targets = []; }
      render();
    }
    function play(m) {
      st.moves.push(m); sel = -1; targets = [];
      if (st.sound) clack();
      render();
    }
    function cancelAi() { reqId++; thinking = false; }
    // 电脑要知道这盘棋之前走过哪些局面,才不会自己走进长将判负、或把赢棋绕成重复和棋
    let lastMsg = null;
    const aiDone = (r) => { if (r.id !== reqId) return; thinking = false; if (r.move) play(r.move); else render(); };
    const aiLocal = (msg) => setTimeout(() => aiDone({ id: msg.id, ...think(msg) }), 30);   // 没有后台线程就在这里算,会卡一下
    function startAi() {
      thinking = true;
      const msg = lastMsg = { id: ++reqId, board: Array.from(g.board), side: g.side, level: st.level, history: historyOf(g) };
      try {
        if (!worker && typeof Worker !== 'undefined') {
          worker = new Worker(new URL('../workers/xqai.js', import.meta.url), { type: 'module' });
          worker.onmessage = (e) => aiDone(e.data);
          // 用最近这一次的请求兜底。以前绑的是第一次的,编号对不上,结果被丢掉,电脑就卡在「思考中」
          worker.onerror = () => { worker?.terminate(); worker = null; if (thinking && lastMsg) aiLocal(lastMsg); };
        }
        if (worker) worker.postMessage(msg); else aiLocal(msg);
      } catch { worker = null; aiLocal(msg); }
    }
    function undo() {
      if (!canUndo()) return;
      if (st.mode === 'ai') {
        cancelAi();
        st.moves.pop();
        if (st.moves.length % 2 !== (st.human === RED ? 0 : 1)) st.moves.pop();   // 退回到轮我走
        st.undoUsed++;
      } else st.moves.pop();
      sel = -1; targets = []; render();
    }
    function canUndo() {
      if (st.mode === 'pvp') return st.moves.length > 0;
      const mine = st.human === RED ? st.moves.length > 0 : st.moves.length > 1;
      return mine && (st.undoLimit < 0 || st.undoUsed < st.undoLimit);
    }

    function recordText() {
      const head = st.mode === 'ai'
        ? `象棋 · 人机(${LEVELS[st.level].name})  红:${st.human === RED ? '我' : '电脑'}  黑:${st.human === RED ? '电脑' : '我'}`
        : '象棋 · 双人';
      const lines = [];
      for (let i = 0; i < g.names.length; i += 2) lines.push(`${i / 2 + 1}. ${g.names[i]}  ${g.names[i + 1] ?? ''}`.trimEnd());
      return [head, ...lines, result ? `结果:${result.text}` : ''].filter(Boolean).join('\n');
    }

    function render() {
      g = replay(st.moves);
      if (g.valid < st.moves.length) st.moves.length = g.valid;    // 存档被改坏了,截到合法的那一手
      const s = status(g.board, g.side), rep = judgeRepeat(g.keys, g.checks);
      result = s.over ? { winner: s.winner, text: `${sideName(s.winner)}胜 · ${s.reason}` }
        : rep ? { winner: rep.winner, text: rep.winner < 0 ? rep.reason : `${sideName(rep.winner)}胜 · ${rep.reason}` } : null;
      if (result) { cancelAi(); sel = -1; targets = []; }

      const last = st.moves.length ? [mvFrom(st.moves.at(-1)), mvTo(st.moves.at(-1))] : null;
      board.draw({ board: g.board, sel, targets, last, flip: st.mode === 'ai' && st.human !== RED,
        faceToFace: st.mode === 'pvp' && st.faceToFace, wood: WOODS[st.wood] ?? WOODS[0] });

      const who = st.mode === 'ai' ? (g.side === st.human ? '轮到你走' : '电脑思考中…') : `轮到${sideName(g.side)}`;
      lead.textContent = result ? result.text : (s.check ? '将军!' : '') + (s.check ? ' ' : '') + who;
      lead.className = 'lead' + (result ? ' end' : s.check ? ' chk' : '');

      clear(rec);
      for (let i = 0; i < g.names.length; i += 2) rec.append(el('span', {}, `${i / 2 + 1}.`), el('span', {}, g.names[i]), el('span', {}, g.names[i + 1] ?? ''));
      if (!g.names.length) rec.append(el('span', {}), el('span', { class: 'lbl' }, '还没开始'));
      rec.scrollTop = rec.scrollHeight;

      const left = st.undoLimit < 0 ? '不限' : `剩 ${Math.max(0, st.undoLimit - st.undoUsed)} 次`;
      undoBtn.textContent = st.mode === 'ai' ? `悔棋(${left})` : '悔棋';
      undoBtn.disabled = !canUndo();
      newBtn.hidden = !st.moves.length;
      aiOpts.hidden = st.mode !== 'ai'; pvpOpts.hidden = st.mode !== 'pvp';
      [modeSeg, humanSeg, levelSeg, undoSeg, woodSeg].forEach((x) => x.sync());
      save();
      if (aiTurn() && !thinking) startAi();
    }

    render();
    const onResize = () => board.resize();
    window.addEventListener('resize', onResize);
    const raf = window.requestAnimationFrame?.(onResize);
    return () => {
      cancelAi(); worker?.terminate();
      window.removeEventListener('resize', onResize);
      if (raf) window.cancelAnimationFrame?.(raf);
    };
  },
};
