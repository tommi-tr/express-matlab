import { el, sleep } from './dom.js';
import { topbar } from './chrome.js';
import { Board } from './board.js';
import { getSettings, engineCfg, nextExpression } from '../data/store.js';
import { validate } from '../engine/solve.js';

export function mount(root) {
  let alive = true; let running = false; let board = null;
  const stage = el('div', { class: 'stage' });
  const bStep = el('button', { class: 'btn primary', type: 'button', text: 'Passo ▸', on: { click: () => step() } });
  const bAuto = el('button', { class: 'btn', type: 'button', text: 'Svolgi tutto', on: { click: () => auto() } });
  const bNew = el('button', { class: 'btn ghost', type: 'button', text: 'Altra espressione', on: { click: () => start() } });
  const bar = topbar({ title: 'Dimostrazione', calc: false, onLevel: () => start() });
  root.append(el('div', { class: 'screen demo' }, bar, stage, el('footer', { class: 'statusbar demo-ctl' }, bNew, bStep, bAuto)));

  function start() {
    running = false; bAuto.textContent = 'Svolgi tutto';
    if (board) board.destroy();
    board = new Board(stage, { getSettings, engineCfg, interactive: false });
    let latex = null;
    try { latex = sessionStorage.getItem('demo.latex'); sessionStorage.removeItem('demo.latex'); } catch (e) { /* ignore */ }
    const lvl = getSettings().level;
    const e = latex ? { latex, level: lvl } : nextExpression(lvl);
    board.load(validate(e.latex, e.level, engineCfg()).ast);
    board.say('Premi «Passo» per vedere cosa si fa per primo, oppure «Svolgi tutto».', 'info');
  }
  async function waitIdle() { while (alive && board.busy) await sleep(60); }
  async function step() {
    if (board.done) return;
    await waitIdle();
    await board.demoStep();
    await waitIdle();
  }
  async function auto() {
    if (running) { running = false; bAuto.textContent = 'Svolgi tutto'; return; }
    running = true; bAuto.textContent = 'Ferma';
    while (alive && running && !board.done) { await step(); await sleep(700); }
    running = false; bAuto.textContent = 'Svolgi tutto';
  }
  start();
  return () => { alive = false; running = false; board && board.destroy(); };
}
