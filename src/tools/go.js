/* 围棋摆棋。规则、估算、SGF 都在 lib/go.js,画棋盘在 ui/goBoard.js,
 * 这里只把它们拼成一页,并管状态和存取。 */

import { el, clear } from '../ui/index.js';
import { boardView, trendView, clack, WOODS, STONE } from '../ui/goBoard.js';
import {
  SIZES, replay, play, toMove, estimate, score, winProb, winSeries, countStones,
  starPoints, coordName, recordText, toSgf, parseSgf,
} from '../lib/go.js';

const CSS = `
.go{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
.go input,.go textarea{-webkit-user-select:text;user-select:text}
.go .card{background:var(--paper-2);border-radius:var(--radius);padding:var(--s3);display:flex;flex-direction:column;gap:var(--s2)}
.go .lbl{font-size:var(--t-xs);color:var(--ink-3)}
.go .players{display:grid;grid-template-columns:1fr 1fr auto;gap:var(--s2);align-items:center}
.go .newgame{min-width:40px;min-height:40px;padding:0;border-radius:50%;font-size:var(--t-lg);color:var(--ink-2)}
.go .ask{border:1px solid var(--warn);border-radius:var(--radius);padding:var(--s2) var(--s3)} .go .ask:not([hidden]){display:flex;flex-wrap:wrap;gap:var(--s2);align-items:center} .go .ask span{flex:1;min-width:10em;font-size:var(--t-sm)}
.go .pl{display:flex;align-items:center;gap:var(--s2);min-width:0;padding:var(--s1) var(--s2);border-radius:var(--radius-sm);border:1px solid transparent}
.go .pl.on{border-color:var(--accent)}
.go .pl input{flex:1;min-width:0;border:none;background:none;font-size:var(--t-sm);padding:var(--s1) 0}
.go .pl small{font-size:var(--t-xs);color:var(--ink-3);white-space:nowrap}
.go .dot{width:14px;height:14px;border-radius:50%;flex:none;border:1px solid var(--ink-3)}
.go .nav{display:grid;grid-template-columns:repeat(5,1fr);gap:var(--s2)}
.go .nav .btn{padding-inline:0;min-height:40px}
.go .btn[disabled]{opacity:.4}
.go input[type=range]{width:100%;accent-color:var(--accent)}
.go .meta{display:flex;justify-content:space-between;font-size:var(--t-xs);color:var(--ink-3);font-variant-numeric:tabular-nums}
.go .msg{font-size:var(--t-sm);color:var(--warn);min-height:1.3em;text-align:center}
.go .lead{font-size:var(--t-lg);font-weight:600}
.go .meter{display:flex;height:10px;border-radius:5px;overflow:hidden;border:1px solid var(--paper-3)}
.go .meter i{display:block}
.go .rec{display:grid;grid-template-columns:repeat(3,1fr);gap:2px var(--s1);max-height:14em;overflow-y:auto;font-size:var(--t-sm);font-variant-numeric:tabular-nums}
.go .rec button{display:flex;gap:var(--s1);align-items:center;padding:var(--s1);border-radius:var(--radius-sm);text-align:start;min-width:0}
.go .rec button.cur{background:var(--accent);color:var(--accent-ink)}
.go .rec button.after{opacity:.45}
.go .rec em{font-style:normal;font-size:var(--t-xs);color:var(--warn)}
.go .rec .cur em{color:inherit}
.go .seg{display:flex} .go .seg .btn{flex:1;border-radius:0;margin-left:-1px}
.go .seg .btn:first-child{border-radius:var(--radius-sm) 0 0 var(--radius-sm);margin-left:0}
.go .seg .btn:last-child{border-radius:0 var(--radius-sm) var(--radius-sm) 0}
.go .chk{display:flex;gap:var(--s2);align-items:center;font-size:var(--t-sm);min-height:32px}
.go details summary{cursor:pointer;font-size:var(--t-sm);color:var(--ink-2);padding-block:var(--s2)}
`;

const dot = (c, size) => {
  const d = el('span', { class: 'dot', style: size ? `width:${size};height:${size}` : null });
  d.style.background = c === 1 ? STONE.black : STONE.white;
  return d;
};

const DEFAULTS = {
  size: 9, moves: [], cursor: 0, black: '黑方', white: '白方', komi: 7, rule: 'cn',
  showNums: false, showTer: true, sound: true, confirm: true, wood: 0,
};

export default {
  mount(root, ctx) {
    const st = { ...DEFAULTS, ...ctx.storage.get('state', {}) };
    const game = () => ({ size: st.size, moves: st.moves });
    const opts = () => ({ rule: st.rule, komi: st.komi });
    const save = () => ctx.storage.set('state', st);
    let series = [], pending = null, askNew = null, recDirty = true;

    const style = el('style', {}, CSS);
    const board = boardView(onPoint);
    const trend = trendView((i) => go(i));
    const msg = el('div', { class: 'msg', role: 'status' });
    const say = (t = '') => { msg.textContent = t; };

    // ── 双方 ──
    const player = (c) => {
      const input = el('input', { value: c === 1 ? st.black : st.white, maxlength: '20', 'aria-label': c === 1 ? '黑方名字' : '白方名字' });
      input.addEventListener('input', () => { st[c === 1 ? 'black' : 'white'] = input.value; render(); });
      const cap = el('small');
      return { node: el('div', { class: 'pl' }, dot(c), input, cap), cap };
    };
    const pB = player(1), pW = player(-1);

    // ── 导航 ──
    const btn = (label, fn, title) => el('button', { class: 'btn', onclick: fn, title }, label);
    const bFirst = btn('⏮', () => go(0), '回到开局'), bPrev = btn('◀', () => go(st.cursor - 1), '后退一手');
    const bNext = btn('▶', () => go(st.cursor + 1), '前进一手'), bLast = btn('⏭', () => go(st.moves.length), '到最新');
    const bPass = btn('停一手', () => { commit({ c: toMove(game(), st.cursor), pass: true }); say('停一手'); });
    const slider = el('input', { type: 'range', min: '0', max: '0', value: '0', 'aria-label': '手数' });
    slider.addEventListener('input', () => go(+slider.value));
    const moveLbl = el('span'), turnLbl = el('span');

    // ── 形势 ──
    const lead = el('div', { class: 'lead' }), barB = el('i'), barW = el('i');
    barB.style.background = STONE.black; barW.style.background = STONE.white;
    const pct = el('div', { class: 'meta' }), area = el('div', { class: 'meta' });

    // ── 注释与记录 ──
    const note = el('textarea', { class: 'textarea', rows: '2', placeholder: '记下这手的想法', style: 'min-height:3.5em;font-family:var(--sans)' });
    note.addEventListener('input', () => {
      const m = st.moves[st.cursor - 1];
      if (!m) return;
      if (note.value.trim()) m.note = note.value; else delete m.note;
      save();
      const i = st.cursor - 1, old = rec.children[i];   // 只换这一条,打字时不重建整张记录
      if (old) { const nu = recItem(m, i, replay(game(), st.cursor).capList[i]); nu.className = old.className; old.replaceWith(nu); }
    });
    const noteLbl = el('span', { class: 'lbl' }), rec = el('div', { class: 'rec' });
    const copyBtn = (label, get) => el('button', { class: 'btn', onclick: async () => ctx.toast(await ctx.platform.copy(get()) ? '已复制' : '复制失败') }, label);
    const meta = () => ({ black: st.black, white: st.white, komi: st.komi, rule: st.rule });

    // ── 设置 ──
    const sizeSeg = el('div', { class: 'seg' }, SIZES.map((n) => el('button', { class: 'btn', 'data-n': n, onclick: () => changeSize(n) }, `${n} 路`)));
    const confirmRow = el('div', { class: 'row', hidden: true });
    // 开局后才出现的「新对局」。放在双方名字那一行的最右边,不占棋盘和按钮的位置
    const topAsk = el('div', { class: 'ask', hidden: true });
    const newBtn = el('button', { class: 'btn newgame', title: '新对局', 'aria-label': '新对局',
      onclick: () => ask(st.size, '清空当前棋局,重新开始?', topAsk) }, '↺');
    const check = (key, label) => {
      const box = el('input', { type: 'checkbox' }); box.checked = st[key];
      box.addEventListener('change', () => { st[key] = box.checked; render(); });
      return el('label', { class: 'chk' }, box, label);
    };
    const ruleSel = el('select', { class: 'input', style: 'font-family:var(--sans)' },
      el('option', { value: 'cn' }, '中国规则:数子(子 + 地)'), el('option', { value: 'jp' }, '日本规则:数目(地 + 提子)'));
    ruleSel.value = st.rule;
    ruleSel.addEventListener('change', () => {
      st.rule = ruleSel.value;
      if (st.rule === 'jp' && st.komi === 7) st.komi = 6.5; else if (st.rule === 'cn' && st.komi === 6.5) st.komi = 7;
      komiIn.value = st.komi; recompute(); render();
    });
    const komiIn = el('input', { class: 'input', type: 'number', step: '0.5', value: st.komi, style: 'max-width:7em' });
    komiIn.addEventListener('input', () => { st.komi = parseFloat(komiIn.value) || 0; recompute(); render(); });
    const woodSeg = el('div', { class: 'seg' }, WOODS.map((w, i) => el('button', { class: 'btn', onclick: () => { st.wood = i; render(); } }, w.name)));
    const sgfIn = el('textarea', { class: 'textarea', placeholder: '粘贴 9、13、19 路的 SGF 棋谱', style: 'min-height:5em' });

    root.append(style, el('div', { class: 'tool-body go' },
      el('div', { class: 'players' }, pB.node, pW.node, newBtn),
      topAsk,
      board.node,
      el('div', { class: 'nav' }, bFirst, bPrev, bNext, bLast, bPass),
      slider,
      el('div', { class: 'meta' }, moveLbl, turnLbl),
      msg,
      el('div', { class: 'card' }, el('span', { class: 'lbl' }, '形势判断(粗估,不判死活)'), lead,
        el('div', { class: 'meter' }, barB, barW), pct, area),
      el('div', { class: 'card' }, el('span', { class: 'lbl' }, '胜率走势 · 点图跳到那一手'), trend.node),
      el('div', { class: 'card' }, noteLbl, note),
      el('div', { class: 'card' }, el('span', { class: 'lbl' }, '走子记录'), rec,
        el('div', { class: 'row' }, copyBtn('复制走子记录', () => recordText(game(), meta())), copyBtn('复制 SGF', () => toSgf(game(), meta())))),
      el('details', {},
        el('summary', {}, '设置与棋谱'),
        el('div', { class: 'card' },
          el('span', { class: 'lbl' }, '棋盘大小'), sizeSeg, confirmRow,
          el('span', { class: 'lbl' }, '计分规则'), ruleSel,
          el('span', { class: 'lbl' }, '贴目(黑贴给白)'), komiIn,
          el('span', { class: 'lbl' }, '棋盘颜色'), woodSeg,
          check('showNums', '显示手数'), check('showTer', '显示地盘估算'),
          check('confirm', '点两次才落子(防误触)'), check('sound', '落子声音'),
          el('span', { class: 'lbl' }, '导入棋谱'), sgfIn,
          el('div', { class: 'row' }, btn('导入', importSgf), btn('新对局', () => ask(st.size, '清空当前棋局?'))),
        )),
    ));

    // ── 行为 ──
    function onPoint(x, y) {
      const c = toMove(game(), st.cursor);
      if (st.confirm && (!pending || pending.x !== x || pending.y !== y)) {
        pending = { x, y, c }; say('再点一次同一个点落子'); render(); return;
      }
      pending = null;
      const r = replay(game(), st.cursor);
      const res = play(r.board, c, x, y, r.prevKey);
      if (res.error) { say(res.error); render(); return; }
      commit({ c, x, y });
      say(res.captured ? `提掉 ${res.captured} 子` : '');
      if (st.sound) clack();
    }
    function commit(m) {
      const append = st.cursor === st.moves.length && rec.querySelectorAll('button').length === st.moves.length;
      st.moves = st.moves.slice(0, st.cursor); st.moves.push(m); st.cursor++;
      // 走势只补算新的这一手,不从头重算 —— 几百手时每一手都全算一遍会越下越卡
      series = series.slice(0, st.cursor);
      const r = replay(game());
      series.push(winProb(score(estimate(r.board), r.caps, opts()), countStones(r.board), st.size));
      // 在末尾接着下,记录只追加一条;从中间改下才整个重建
      if (append && !recDirty) {
        if (st.moves.length === 1) clear(rec);
        rec.append(recItem(m, st.moves.length - 1, r.capList[st.moves.length - 1]));
      } else recDirty = true;
      pending = null; render();
    }
    function go(i) { st.cursor = Math.max(0, Math.min(st.moves.length, i)); pending = null; say(); render(); }
    function recompute() { series = winSeries(game(), opts()); recDirty = true; }
    function ask(n, text, where = confirmRow) {
      if (!st.moves.length) { reset(n); return; }
      askNew = n;
      for (const box of [confirmRow, topAsk]) box.hidden = true;   // 同一时间只留一个确认框
      clear(where);
      where.append(el('span', { class: where === topAsk ? '' : 'lbl' }, text),
        el('button', { class: 'btn btn--primary', onclick: () => reset(askNew) }, '确定'),
        btn('取消', () => { where.hidden = true; })); where.hidden = false;
    }
    function changeSize(n) { if (n !== st.size) ask(n, `换成 ${n} 路会清空当前棋局`); }
    function reset(n) {
      Object.assign(st, { size: n, moves: [], cursor: 0 }); confirmRow.hidden = topAsk.hidden = true;
      pending = null; say(); recompute(); render();
    }
    function importSgf() {
      try {
        const r = parseSgf(sgfIn.value);
        const valid = replay(r.game).valid;
        Object.assign(st, { size: r.game.size, moves: r.game.moves.slice(0, valid), cursor: valid });
        if (r.black) st.black = pB.node.querySelector('input').value = r.black;
        if (r.white) st.white = pW.node.querySelector('input').value = r.white;
        if (r.komi !== null) komiIn.value = st.komi = r.komi;
        if (r.rule) ruleSel.value = st.rule = r.rule;
        recompute(); render();
        ctx.toast(valid < r.game.moves.length ? `导入前 ${valid} 手,第 ${valid + 1} 手不合规则` : `导入了 ${valid} 手`);
      } catch (e) { ctx.toast('导入失败:' + e.message); }
    }

    function recItem(m, i, cap) {
      return el('button', { title: m.note ?? '', onclick: () => go(i + 1) },
        el('span', { style: 'opacity:.6;min-width:1.8em;text-align:end' }, i + 1),
        dot(m.c, '9px'),
        coordName(m, st.size), cap ? el('em', {}, `提${cap}`) : null, m.note ? el('em', {}, '注') : null);
    }
    // 棋谱变了才重建;只是前进后退,就改高亮。19 路几百手,每步都重建在手机上会卡
    function renderRecord() {
      if (recDirty) {
        recDirty = false;
        const { capList } = replay(game());
        clear(rec);
        st.moves.forEach((m, i) => rec.append(recItem(m, i, capList[i])));
        if (!st.moves.length) rec.append(el('span', { class: 'lbl' }, '还没有落子'));
      }
      [...rec.children].forEach((b, i) => {
        b.classList.toggle('cur', i === st.cursor - 1);
        b.classList.toggle('after', i >= st.cursor && i < st.moves.length);
      });
      // 只滚记录框自己。scrollIntoView 会连整页一起滚,棋盘被推出屏幕,下一次点击就落空了
      const cur = rec.querySelector('.cur');
      if (cur) {
        const top = cur.offsetTop - rec.offsetTop;
        if (top < rec.scrollTop || top > rec.scrollTop + rec.clientHeight - cur.offsetHeight) rec.scrollTop = top - rec.clientHeight / 2;
      }
    }

    function render() {
      const g = game(), r = replay(g, st.cursor), est = estimate(r.board);
      const turn = toMove(g, st.cursor), stones = countStones(r.board);
      board.draw({
        board: r.board, nums: r.nums, last: r.last, stars: starPoints(st.size), wood: WOODS[st.wood] ?? WOODS[0],
        own: st.showTer ? est.own : null, showNums: st.showNums, turn, ghost: pending,
      });
      trend.draw(series, st.cursor);

      pB.cap.textContent = `提 ${r.caps[1]}`; pW.cap.textContent = `提 ${r.caps[-1]}`;
      pB.node.classList.toggle('on', turn === 1); pW.node.classList.toggle('on', turn === -1);
      const ended = st.cursor >= 2 && st.moves[st.cursor - 1].pass && st.moves[st.cursor - 2].pass;
      turnLbl.textContent = ended ? '双方都停了一手,对局结束' : `轮到${turn === 1 ? '黑' : '白'}`;
      moveLbl.textContent = `第 ${st.cursor} 手 / 共 ${st.moves.length} 手`;
      slider.max = st.moves.length; slider.value = st.cursor;
      newBtn.hidden = !st.moves.length;
      bFirst.disabled = bPrev.disabled = st.cursor === 0;
      bNext.disabled = bLast.disabled = st.cursor === st.moves.length;

      const margin = score(est, r.caps, opts()), nb = st.black || '黑方', nw = st.white || '白方';
      lead.textContent = stones === 0 ? `开局,白方有贴目 ${st.komi} 目`
        : margin > 0 ? `${nb} 约领先 ${margin.toFixed(1)} 目` : margin < 0 ? `${nw} 约领先 ${(-margin).toFixed(1)} 目` : '双方大致持平';
      const p = Math.round(winProb(margin, stones, st.size) * 100);
      barB.style.width = p + '%'; barW.style.width = 100 - p + '%';
      pct.replaceChildren(el('span', {}, `${nb} ${p}%`), el('span', {}, `${100 - p}% ${nw}`));
      area.replaceChildren(...(st.rule === 'jp'
        ? [el('span', {}, `黑 地${est.terrB} + 提${r.caps[1]}`), el('span', {}, `白 地${est.terrW} + 提${r.caps[-1]} + 贴${st.komi}`)]
        : [el('span', {}, `黑 ${est.areaB}(子+地)`), el('span', {}, `白 ${est.areaW}(子+地)+ 贴${st.komi}`)]));

      const m = st.moves[st.cursor - 1];
      note.disabled = !m;
      noteLbl.textContent = m ? `第 ${st.cursor} 手注释(${m.c === 1 ? '黑' : '白'} ${coordName(m, st.size)})` : '本手注释';
      if (document.activeElement !== note) note.value = m?.note ?? '';
      sizeSeg.querySelectorAll('.btn').forEach((b) => b.classList.toggle('btn--primary', +b.dataset.n === st.size));
      woodSeg.querySelectorAll('.btn').forEach((b, i) => b.classList.toggle('btn--primary', i === st.wood));
      renderRecord();
      save();
    }

    // 读回来的棋谱可能被手改过,先按规则截一遍
    st.cursor = Math.min(st.cursor, replay(game()).valid);
    st.moves = st.moves.slice(0, replay(game()).valid);
    if (ctx.initial) { sgfIn.value = ctx.initial; importSgf(); }
    recompute(); render();

    const onResize = () => { board.resize(); trend.resize(); };
    window.addEventListener('resize', onResize);
    // 首次挂载时 canvas 可能还没有宽度,等一帧再画
    const raf = window.requestAnimationFrame?.(onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (raf) window.cancelAnimationFrame?.(raf);
    };
  },
};
