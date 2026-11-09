import { el, sleep } from './dom.js';
import { topbar, LEVELS } from './chrome.js';
import { Board } from './board.js';
import { getSettings, engineCfg, nextPair } from '../data/store.js';
import { validate } from '../engine/solve.js';
import { fmtTime } from './practice.js';
import { sfx } from './sound.js';

// Sfida: ognuno procede per conto suo attraverso N espressioni. Vince chi finisce per primo,
// ma l'altro può continuare fino in fondo.
export function mount(root) {
  const S = () => getSettings();
  let alive = true; let token = 0;
  const names = () => [S().p1, S().p2];

  const scoreEl = el('div', { class: 'scorebar' });
  const arena = el('div', { class: 'arena' });
  const ov = el('div', { class: 'arena-ov', hidden: true });
  const screen = el('div', { class: 'screen challenge' }, topbar({ title: 'Sfida a due', onLevel: () => intro() }), scoreEl, el('div', { class: 'arena-wrap' }, arena, ov));
  root.append(screen);

  let boards = [];
  let pairs = [];
  let pl = [];
  let over = true;
  let order = [];

  const mk = i => {
    const holder = el('div', { class: 'half', data: { player: 'p' + (i + 1) } });
    arena.append(holder);
    if (i === 1 && S().rotateRight) holder.classList.add('rot');
    return new Board(holder, {
      getSettings, engineCfg, player: 'p' + (i + 1), name: names()[i], progress: true, hints: false,
      onFail: (info, b) => { const p = S().penalty; if (p > 0) b.lock(p, info.msg); },
      onDone: stats => finished(i, stats),
    });
  };
  const fresh = () => ({ idx: 0, done: false, finishAt: 0, rows: [], t0: 0, errors: 0, penaltyMs: 0 });
  function build() {
    boards.forEach(b => b.destroy());
    arena.replaceChildren();
    boards = [mk(0), mk(1)];
    pl = [fresh(), fresh()];
    order = [];
    paintScore();
  }
  const N = () => Math.max(1, S().rounds);

  function dots(i) {
    const d = el('span', { class: 'dots', 'aria-label': `${pl[i]?.idx || 0} di ${N()}` });
    for (let k = 0; k < N(); k++) d.append(el('i', { class: (pl[i] && k < pl[i].idx ? 'on ' : '') + (pl[i] && !pl[i].done && k === pl[i].idx && !over ? 'cur' : '') }));
    return d;
  }
  function paintScore() {
    const first = order[0];
    const mid = el('div', { class: 'sc mid' },
      el('span', { text: `${N()} ${N() === 1 ? 'espressione' : 'espressioni'} a testa` }),
      el('small', { text: `livello ${S().level} ${LEVELS[S().level - 1].name} · penalità ${S().penalty} s` }));
    if (!over && first !== undefined) {
      mid.append(el('button', { class: 'btn ghost', type: 'button', text: 'Termina ora', on: { click: () => results() } }));
    }
    scoreEl.replaceChildren(
      el('div', { class: 'sc p1' }, el('span', { text: names()[0] }), dots(0), first === 0 ? el('span', { class: 'fin', text: 'ha finito' }) : null),
      mid,
      el('div', { class: 'sc p2' }, first === 1 ? el('span', { class: 'fin', text: 'ha finito' }) : null, dots(1), el('span', { text: names()[1] })));
  }
  function show(content, cls = '', plain = false) {
    ov.className = 'arena-ov ' + cls + (plain ? ' plain' : '');
    ov.hidden = false;
    ov.replaceChildren(plain ? content : el('div', { class: 'card' }, content));
    ov.querySelector('button')?.focus();
  }
  function hide() { ov.hidden = true; }

  function intro() {
    token++;
    over = true;
    build();
    show(el('div', { class: 'intro' },
      el('h2', { text: 'Sfida a due' }),
      el('ul', { class: 'rules' },
        el('li', { text: `Ognuno ha la sua metà dello schermo e ${N()} ${N() === 1 ? 'espressione' : 'espressioni'} da svolgere, dello stesso livello.` }),
        el('li', { text: 'Tocca i numeri e il simbolo di ogni operazione da svolgere, poi premi «=».' }),
        el('li', { text: `Se scegli un'operazione che non ha la precedenza, aspetti ${S().penalty} secondi.` }),
        el('li', { text: 'Vince chi finisce per primo, ma l\'altro può arrivare comunque in fondo.' })),
      el('button', { class: 'btn primary big', type: 'button', text: 'Pronti', on: { click: start } })));
  }

  function loadFor(i) {
    const e = pairs[pl[i].idx][i];
    const b = boards[i];
    b.load(validate(e.latex, e.level, engineCfg()).ast);
    pl[i].t0 = Date.now();
    paintScore();
  }

  async function start() {
    const my = ++token;
    build();
    const used = [];
    pairs = [];
    for (let k = 0; k < N(); k++) {
      const pr = nextPair(S().level, used);
      pr.forEach(e => used.push(e.latex));
      pairs.push(pr);
    }
    for (const c of ['3', '2', '1']) {
      if (!alive || my !== token) return;
      show(el('div', { class: 'count', text: c }), '', true); sfx.tick(); await sleep(800);
    }
    if (!alive || my !== token) return;
    show(el('div', { class: 'count go', text: 'Via!' }), '', true); sfx.go();
    over = false;
    loadFor(0); loadFor(1);
    await sleep(500);
    if (my === token) hide();
  }

  function finished(i, stats) {
    if (over) return;
    const p = pl[i];
    const now = Date.now();
    p.rows.push({ ms: now - p.t0, steps: stats.steps, errors: stats.errors, penaltyMs: stats.penaltyMs });
    p.errors += stats.errors; p.penaltyMs += stats.penaltyMs;
    p.idx++;
    const my = token;
    if (p.idx < N()) {
      sfx.ok();
      boards[i].banner('Fatto!', `${p.idx} di ${N()}`, 'ok', 900, () => { if (alive && my === token && !over) loadFor(i); });
      paintScore();
      return;
    }
    p.done = true; p.finishAt = now; order.push(i);
    boards[i].freeze();
    sfx.win();
    const other = pl[1 - i];
    if (other.done) {
      boards[i].banner('Finito!', '', 'ok');
      paintScore();
      setTimeout(() => alive && my === token && results(), 900);
    } else {
      boards[i].banner('Hai finito!', `Per primo. Aspetta ${names()[1 - i]}…`, 'ok');
      paintScore();
    }
  }

  function results() {
    if (over) return;
    over = true; token++;
    boards.forEach(b => b.freeze());
    const fin = pl.map(p => p.done);
    let w = -1;
    if (fin[0] && fin[1]) w = pl[0].finishAt <= pl[1].finishAt ? 0 : 1;
    else if (fin[0]) w = 0; else if (fin[1]) w = 1;
    paintScore();
    const total = i => pl[i].rows.reduce((a, r) => a + r.ms, 0);
    const rows = [];
    for (let k = 0; k < N(); k++) {
      rows.push(el('tr', {}, el('td', { text: `Espr. ${k + 1}` }),
        ...[0, 1].map(i => el('td', { text: pl[i].rows[k] ? fmtTime(pl[i].rows[k].ms) : '—' }))));
    }
    const table = el('table', { class: 'rtable' },
      el('tr', {}, el('th'), el('th', { text: names()[0] }), el('th', { text: names()[1] })),
      el('tr', {}, el('td', { text: 'Completate' }), ...[0, 1].map(i => el('td', { text: `${pl[i].idx} / ${N()}` }))),
      ...rows,
      el('tr', {}, el('td', { text: 'Errori' }), ...[0, 1].map(i => el('td', { text: pl[i].errors + boards[i].stats.errors * (pl[i].done ? 0 : 1) }))),
      el('tr', {}, el('td', { text: 'Penalità' }), ...[0, 1].map(i => el('td', { text: `${Math.round((pl[i].penaltyMs + (pl[i].done ? 0 : boards[i].stats.penaltyMs)) / 1000)} s` }))),
      el('tr', {}, el('td', { text: 'Tempo totale' }), ...[0, 1].map(i => el('td', { text: fin[i] ? fmtTime(total(i)) : '—' }))));
    show(el('div', { class: 'result final' },
      el('h2', { text: w < 0 ? 'Nessuno ha finito' : `Vince ${names()[w]}!` }),
      table,
      el('div', { class: 'row' },
        el('button', { class: 'btn primary big', type: 'button', text: 'Rivincita', on: { click: start } }),
        el('a', { class: 'btn ghost', href: '#/', text: 'Home' }))), w < 0 ? '' : 'p' + (w + 1));
  }

  const onKey = e => { if (e.key === 'Escape') boards.forEach(b => b.clearSelection()); };
  document.addEventListener('keydown', onKey);
  const onSettings = e => { if (e.detail && ('p1' in e.detail || 'p2' in e.detail)) paintScore(); };
  document.addEventListener('settings', onSettings);
  intro();
  return () => { alive = false; token++; document.removeEventListener('keydown', onKey); document.removeEventListener('settings', onSettings); boards.forEach(b => b.destroy()); };
}
