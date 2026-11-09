import { el } from './dom.js';
import { topbar, LEVELS } from './chrome.js';
import { Board, catLabel } from './board.js';
import { getSettings, engineCfg, nextExpression } from '../data/store.js';
import { validate } from '../engine/solve.js';
import { sfx } from './sound.js';

const ADVICE = {
  parentesi: 'Ripassa: le parentesi si svolgono per prime, partendo dalle più interne (tonde, poi quadre, poi graffe).',
  potenze: 'Ripassa: le potenze si calcolano prima di moltiplicazioni, divisioni, somme e sottrazioni.',
  moltdiv: 'Ripassa: moltiplicazioni e divisioni vengono prima di somme e sottrazioni.',
  ordine: 'Ripassa: a parità di priorità si procede da sinistra a destra, nell\'ordine in cui si legge.',
  segni: 'Ripassa: se davanti alla parentesi c\'è il segno meno, tutti i segni dentro cambiano.',
  calcolo: 'Ripassa i calcoli: tabelline, frazioni e potenze.',
  selezione: 'Ricorda di toccare tutti gli elementi di un\'operazione, simbolo compreso.',
};
export const fmtTime = ms => { const s = Math.round(ms / 1000); return s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`; };

export function mount(root) {
  const S = () => getSettings();
  let board = null; let n = 0; let results = []; let seen = []; let alive = true;
  const stage = el('div', { class: 'stage' });
  const info = el('span', { class: 'pinfo' });
  const skip = el('button', { class: 'btn ghost', type: 'button', text: 'Salta questa', on: { click: () => next(true) } });
  const bar = topbar({ title: 'Esercitati', onLevel: () => restart() });
  const screen = el('div', { class: 'screen practice' }, bar, stage, el('footer', { class: 'statusbar' }, info, skip));
  root.append(screen);

  function overlay(content) {
    stage.querySelectorAll('.card-ov').forEach(x => x.remove());
    const ov = el('div', { class: 'card-ov' }, el('div', { class: 'card' }, content));
    stage.append(ov);
    ov.querySelector('button')?.focus();
    return ov;
  }

  function restart() { n = 0; results = []; seen = []; next(); }

  function next() {
    stage.querySelectorAll('.card-ov').forEach(x => x.remove());
    if (board) board.destroy();
    const e = nextExpression(S().level, seen.slice(-6));
    if (!e) { overlay(el('p', { text: 'Non ci sono espressioni valide per questo livello. Aggiungine dal Database.' })); return; }
    seen.push(e.latex);
    n++;
    info.textContent = `Espressione ${n} di ${S().perSession} · livello ${S().level} ${LEVELS[S().level - 1].name}`;
    board = new Board(stage, {
      getSettings, engineCfg, hints: S().hints,
      onDone: stats => { results.push(stats); sfx.win(); setTimeout(() => alive && showDone(stats), 450); },
    });
    board.load(validate(e.latex, e.level, engineCfg()).ast);
  }

  function showDone(stats) {
    const last = n >= S().perSession;
    overlay(el('div', { class: 'done-card' },
      el('h2', { text: stats.errors === 0 ? 'Perfetto!' : 'Risolta!' }),
      el('p', { class: 'big', text: `${stats.steps} passaggi · ${stats.errors} ${stats.errors === 1 ? 'errore' : 'errori'}${stats.hints ? ` · ${stats.hints} suggerimenti` : ''}` }),
      el('p', { class: 'sub', text: `Tempo: ${fmtTime(stats.ms)}` }),
      el('div', { class: 'row' },
        last ? el('button', { class: 'btn primary', type: 'button', text: 'Vedi il riepilogo', on: { click: showSummary } })
          : el('button', { class: 'btn primary', type: 'button', text: 'Prossima espressione', on: { click: () => next() } }))));
  }

  function showSummary() {
    const tot = results.reduce((a, r) => ({ steps: a.steps + r.steps, errors: a.errors + r.errors, hints: a.hints + r.hints, ms: a.ms + r.ms }), { steps: 0, errors: 0, hints: 0, ms: 0 });
    const cats = {};
    results.forEach(r => Object.entries(r.byCat).forEach(([c, k]) => { cats[c] = (cats[c] || 0) + k; }));
    const sorted = Object.entries(cats).sort((a, b) => b[1] - a[1]);
    const max = sorted.length ? sorted[0][1] : 1;
    const perfect = results.filter(r => r.errors === 0).length;
    overlay(el('div', { class: 'summary' },
      el('h2', { text: 'Riepilogo' }),
      el('div', { class: 'stats' },
        el('div', {}, el('b', { text: results.length }), el('span', { text: 'espressioni' })),
        el('div', {}, el('b', { text: perfect }), el('span', { text: 'senza errori' })),
        el('div', {}, el('b', { text: tot.errors }), el('span', { text: 'errori' })),
        el('div', {}, el('b', { text: tot.hints }), el('span', { text: 'suggerimenti' })),
        el('div', {}, el('b', { text: fmtTime(tot.ms) }), el('span', { text: 'tempo' }))),
      sorted.length
        ? el('div', { class: 'errs' }, el('h3', { text: 'Dove si è sbagliato' }),
          sorted.map(([c, k]) => el('div', { class: 'ebar' }, el('span', { text: catLabel(c) }), el('i', { style: `--w:${Math.round((k / max) * 100)}%` }), el('b', { text: k }))),
          el('p', { class: 'advice', text: ADVICE[sorted[0][0]] || '' }))
        : el('p', { class: 'advice', text: 'Nessun errore: hai rispettato tutte le priorità.' }),
      el('div', { class: 'row' },
        el('button', { class: 'btn primary', type: 'button', text: 'Ricomincia', on: { click: restart } }),
        el('a', { class: 'btn ghost', href: '#/', text: 'Torna alla home' }))));
  }

  const onKey = e => {
    if (!alive || document.querySelector('.backdrop')) return;
    if (e.key === 'Enter' && board && !stage.querySelector('.card-ov') && !/INPUT|BUTTON|A|TEXTAREA/.test(document.activeElement.tagName)) board.equals();
    if (e.key === 'Escape' && board) board.clearSelection();
  };
  document.addEventListener('keydown', onKey);
  restart();
  return () => { alive = false; document.removeEventListener('keydown', onKey); board && board.destroy(); };
}
