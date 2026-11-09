import { el, sleep } from './dom.js';
import { topbar, LEVELS } from './chrome.js';
import { Board } from './board.js';
import { getSettings, engineCfg, nextPair } from '../data/store.js';
import { validate } from '../engine/solve.js';
import { fmtTime } from './practice.js';
import { sfx } from './sound.js';

export function mount(root) {
  const S = () => getSettings();
  let alive = true; let scores = [0, 0]; let round = 0; let roundOver = true; let token = 0;
  const names = () => [S().p1, S().p2];

  const scoreEl = el('div', { class: 'scorebar' });
  const arena = el('div', { class: 'arena' });
  const ov = el('div', { class: 'arena-ov', hidden: true });
  const screen = el('div', { class: 'screen challenge' }, topbar({ title: 'Sfida a due', onLevel: () => intro() }), scoreEl, el('div', { class: 'arena-wrap' }, arena, ov));
  root.append(screen);

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
  let boards = [];
  function build() {
    boards.forEach(b => b.destroy());
    arena.replaceChildren();
    boards = [mk(0), mk(1)];
    paintScore();
  }
  function paintScore() {
    const need = Math.floor(S().rounds / 2) + 1;
    scoreEl.replaceChildren(
      el('div', { class: 'sc p1' }, el('span', { text: names()[0] }), el('b', { text: scores[0] })),
      el('div', { class: 'sc mid' }, el('span', { text: round ? `Round ${Math.min(round, S().rounds)} di ${S().rounds}` : `Al meglio di ${S().rounds}` }), el('small', { text: `livello ${S().level} ${LEVELS[S().level - 1].name} · penalità ${S().penalty} s${S().rounds > 1 ? ` · ne servono ${need}` : ''}` })),
      el('div', { class: 'sc p2' }, el('b', { text: scores[1] }), el('span', { text: names()[1] })));
  }
  function show(content, cls = '') { ov.className = 'arena-ov ' + cls; ov.hidden = false; ov.replaceChildren(el('div', { class: 'card' }, content)); ov.querySelector('button')?.focus(); }
  function hide() { ov.hidden = true; }

  function intro() {
    token++;
    scores = [0, 0]; round = 0; roundOver = true;
    build();
    show(el('div', { class: 'intro' },
      el('h2', { text: 'Sfida a due' }),
      el('ul', { class: 'rules' },
        el('li', { text: 'Ognuno ha la sua metà dello schermo e un\'espressione diversa, dello stesso livello.' }),
        el('li', { text: 'Tocca i numeri e il simbolo di ogni operazione da svolgere, poi premi «=».' }),
        el('li', { text: `Se scegli un'operazione che non ha la precedenza, aspetti ${S().penalty} secondi.` }),
        el('li', { text: 'Vince il round chi arriva per primo al risultato.' })),
      el('button', { class: 'btn primary big', type: 'button', text: 'Pronti', on: { click: nextRound } })));
  }

  async function nextRound() {
    const my = ++token;
    round++; roundOver = true; paintScore();
    build();
    const pair = nextPair(S().level);
    for (const c of ['3', '2', '1']) {
      if (!alive || my !== token) return;
      show(el('div', { class: 'count', text: c })); sfx.tick(); await sleep(800);
    }
    if (!alive || my !== token) return;
    show(el('div', { class: 'count go', text: 'Via!' })); sfx.go();
    boards.forEach((b, i) => b.load(validate(pair[i].latex, pair[i].level, engineCfg()).ast));
    roundOver = false;
    await sleep(500);
    if (my === token) hide();
  }

  function finished(i, stats) {
    if (roundOver) return;
    roundOver = true;
    boards[1 - i].freeze();
    scores[i]++; paintScore(); sfx.win();
    const need = Math.floor(S().rounds / 2) + 1;
    const matchOver = scores[i] >= need || round >= S().rounds;
    setTimeout(() => {
      if (!alive) return;
      const st = boards.map(b => b.stats);
      const table = el('table', { class: 'rtable' },
        el('tr', {}, el('th'), el('th', { text: names()[0] }), el('th', { text: names()[1] })),
        el('tr', {}, el('td', { text: 'Passaggi' }), el('td', { text: st[0].steps }), el('td', { text: st[1].steps })),
        el('tr', {}, el('td', { text: 'Errori' }), el('td', { text: st[0].errors }), el('td', { text: st[1].errors })),
        el('tr', {}, el('td', { text: 'Tempo' }), el('td', { text: fmtTime(Date.now() - st[0].t0) }), el('td', { text: fmtTime(Date.now() - st[1].t0) })));
      if (!matchOver) {
        show(el('div', { class: 'result' }, el('h2', { text: `Punto per ${names()[i]}` }), table,
          el('button', { class: 'btn primary big', type: 'button', text: 'Prossimo round', on: { click: nextRound } })), 'p' + (i + 1));
      } else {
        const w = scores[0] === scores[1] ? -1 : scores[0] > scores[1] ? 0 : 1;
        show(el('div', { class: 'result final' },
          el('h2', { text: w < 0 ? 'Pareggio!' : `Vince ${names()[w]}!` }),
          el('p', { class: 'big', text: `${scores[0]} – ${scores[1]}` }), table,
          el('div', { class: 'row' },
            el('button', { class: 'btn primary big', type: 'button', text: 'Rivincita', on: { click: intro } }),
            el('a', { class: 'btn ghost', href: '#/', text: 'Home' }))), w < 0 ? '' : 'p' + (w + 1));
      }
    }, 900);
  }

  const onKey = e => { if (e.key === 'Escape') boards.forEach(b => b.clearSelection()); };
  document.addEventListener('keydown', onKey);
  const onSettings = e => { if (e.detail && ('p1' in e.detail || 'p2' in e.detail)) paintScore(); };
  document.addEventListener('settings', onSettings);
  intro();
  return () => { alive = false; token++; document.removeEventListener('keydown', onKey); document.removeEventListener('settings', onSettings); boards.forEach(b => b.destroy()); };
}
