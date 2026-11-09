// Una "lavagna" di gioco: mostra l'espressione, gestisce selezione, "=", errori, calcoli, suggerimenti.
import { el } from './dom.js';
import { renderExpr, typeIn } from './render.js';
import { analyze, matchSelection, describeOp, isDone } from '../engine/analyze.js';
import { applyOps } from '../engine/apply.js';
import { pickAll, pickSimple, remainingSteps } from '../engine/solve.js';
import { sfx } from './sound.js';
import * as A from '../engine/ast.js';

const CAT_LABEL = {
  parentesi: 'Parentesi', potenze: 'Potenze', moltdiv: 'Moltiplicazioni e divisioni', ordine: 'Ordine da sinistra a destra',
  segni: 'Segni', selezione: 'Selezione incompleta', calcolo: 'Calcoli',
};
export const catLabel = c => CAT_LABEL[c] || c;

export class Board {
  /**
   * opts: getSettings(), engineCfg(), player: 'p1'|'p2'|null, name, interactive (default true),
   *       hints (bool), progress (bool), onFail(info, board), onDone(summary, board), onStep(board)
   */
  constructor(host, opts) {
    this.o = { interactive: true, ...opts };
    this.host = host;
    this.timers = [];
    this.stopTyping = null;
    this.root = null;
    this.selected = new Set();
    this.busy = false;
    this.locked = false;
    this.frozen = false;
    this.done = false;
    this.history = [];
    this.stats = this.freshStats();
    this.build();
  }

  freshStats() { return { steps: 0, errors: 0, byCat: {}, hints: 0, t0: Date.now(), penaltyMs: 0 }; }
  get cfg() { return this.o.engineCfg(); }
  get S() { return this.o.getSettings(); }

  build() {
    const o = this.o;
    this.head = el('div', { class: 'board-head' },
      el('span', { class: 'who', text: o.name || '' }),
      this.stepsPill = el('span', { class: 'pill', text: '' }),
      this.progress = o.progress ? el('div', { class: 'prog', 'aria-hidden': 'true' }, this.progressBar = el('i')) : null);
    this.lines = el('div', { class: 'lines' });
    this.msg = el('div', { class: 'msg', role: 'status', 'aria-live': 'polite' });
    this.paper = el('div', { class: 'paper' }, this.lines, this.msg);
    this.calcPanel = el('div', { class: 'calc', hidden: true });

    this.btnHint = el('button', { class: 'btn ghost', type: 'button', text: 'Suggerimento', on: { click: () => this.hint() } });
    this.btnClear = el('button', { class: 'btn ghost', type: 'button', text: 'Annulla selezione', on: { click: () => this.clearSelection() } });
    this.btnEq = el('button', { class: 'btn eq', type: 'button', 'aria-label': 'Svolgi le operazioni selezionate', text: '=', on: { click: () => this.equals() } });
    this.foot = el('div', { class: 'board-foot' },
      o.hints ? this.btnHint : null, this.btnClear, this.btnEq);

    this.overlay = el('div', { class: 'lockbox', hidden: true });
    this.root$ = el('div', { class: 'board', data: { player: o.player || '' } },
      this.head, this.paper, this.calcPanel, o.interactive ? this.foot : null, this.overlay);
    this.root$.__board = this; // utile per i test automatici
    this.host.append(this.root$);

    this.lines.addEventListener('click', e => {
      const tk = e.target.closest('[data-tk]');
      if (!tk || !this.o.interactive) return;
      const line = tk.closest('.line');
      if (!line || !line.classList.contains('current')) return;
      this.press(tk.dataset.tk);
    });
    this.onResize = () => this.fit();
    window.addEventListener('resize', this.onResize);
  }

  destroy() {
    this.timers.forEach(clearTimeout);
    this.stopTyping && this.stopTyping();
    window.removeEventListener('resize', this.onResize);
    this.root$.remove();
  }
  later(fn, ms) { const t = setTimeout(fn, ms); this.timers.push(t); return t; }

  // ---------- caricamento ----------
  clear() {
    this.timers.forEach(clearTimeout); this.timers = [];
    this.stopTyping && this.stopTyping();
    this.lines.replaceChildren();
    this.msg.textContent = ''; this.msg.className = 'msg';
    this.calcPanel.hidden = true; this.calcPanel.replaceChildren();
    this.overlay.hidden = true;
    this.root = null; this.selected = new Set(); this.busy = false; this.locked = false; this.frozen = false; this.done = false;
    this.root$.classList.remove('done', 'shake', 'locked');
    this.stepsPill.textContent = '';
    if (this.progressBar) this.progressBar.style.width = '0%';
    this.lines.style.removeProperty('--efs');
  }

  load(ast) {
    this.clear();
    this.root = A.clone(ast);
    if (this.cfg.autoUnwrap) this.root = applyOps(this.root, [], this.cfg);
    this.total = Math.max(1, remainingSteps(this.root, this.cfg));
    this.stats = this.freshStats();
    this.history = [this.root];
    this.addLine(this.root, false);
    this.refreshAnalysis();
    this.updateMeta();
  }

  refreshAnalysis() { this.an = analyze(this.root, this.cfg); }

  updateMeta() {
    this.stepsPill.textContent = this.stats.steps ? `${this.stats.steps} ${this.stats.steps === 1 ? 'passaggio' : 'passaggi'}` : '';
    if (this.progressBar) {
      const left = this.done ? 0 : remainingSteps(this.root, this.cfg);
      this.progressBar.style.width = `${Math.round((1 - left / Math.max(this.total, left)) * 100)}%`;
    }
  }

  addLine(root, animate) {
    this.root$.classList.toggle('nohist', !this.S.showHistory);
    this.lines.querySelectorAll('.line.current').forEach(l => {
      l.classList.remove('current'); l.classList.add('past');
      l.querySelectorAll('.sel, .err, .hint').forEach(t => t.classList.remove('sel', 'err', 'hint'));
    });
    const expr = renderExpr(root, { colors: this.S.priorityColors });
    const line = el('div', { class: 'line current' }, el('span', { class: 'eq', text: this.history.length > 1 ? '=' : '' }), expr);
    this.lines.append(line);
    this.curExpr = expr;
    this.fit();
    this.lines.scrollTop = this.lines.scrollHeight;
    if (animate) {
      this.busy = true;
      const speed = this.S.writeSpeed;
      this.stopTyping = typeIn(expr, speed, () => { this.busy = false; this.afterTyped(); });
      if (!speed) { this.busy = false; this.afterTyped(); }
    }
  }

  fit() {
    const line = this.lines.querySelector('.line.current');
    if (!line) return;
    this.lines.style.removeProperty('--efs');
    const avail = this.lines.clientWidth - 24;
    const need = line.scrollWidth;
    if (need > avail && avail > 0) {
      const cur = parseFloat(getComputedStyle(line).fontSize);
      this.lines.style.setProperty('--efs', `${Math.max(14, cur * (avail / need) * 0.96)}px`);
    }
  }

  // ---------- selezione ----------
  allTokens() { return [...this.curExpr.querySelectorAll('[data-tk]')]; }
  paintSelection() {
    for (const t of this.allTokens()) {
      t.classList.toggle('sel', this.selected.has(t.dataset.tk));
      t.classList.remove('err', 'hint');
    }
  }
  press(id) {
    if (this.busy || this.locked || this.frozen || this.done || !this.calcPanel.hidden) return;
    if (this.selected.has(id)) this.selected.delete(id); else this.selected.add(id);
    sfx.tap();
    this.say('');
    this.paintSelection();
  }
  clearSelection() {
    if (this.locked || this.frozen) return;
    this.selected = new Set();
    this.say('');
    if (this.curExpr) this.paintSelection();
  }
  say(text, kind = '') {
    this.msg.textContent = text;
    this.msg.className = 'msg' + (kind ? ' ' + kind : '');
  }

  // ---------- "=" ----------
  equals() {
    if (this.busy || this.locked || this.frozen || this.done || !this.calcPanel.hidden || !this.root) return;
    const m = matchSelection([...this.selected], this.an);
    if (m.empty) { this.say(m.msg, 'info'); return; }
    if (!m.ok) { this.fail(m); return; }
    if (this.S.calc) {
      const prompts = m.ops.filter(op => op.calc || (op.kind === 'unwrap' && op.flip));
      if (prompts.length) { this.openCalc(m.ops, prompts); return; }
    }
    this.commit(m.ops);
  }

  fail(info) {
    this.stats.errors++;
    this.stats.byCat[info.cat] = (this.stats.byCat[info.cat] || 0) + 1;
    for (const t of this.allTokens()) if (this.selected.has(t.dataset.tk)) t.classList.add('err');
    this.root$.classList.remove('shake');
    void this.root$.offsetWidth;
    this.root$.classList.add('shake');
    this.later(() => this.root$.classList.remove('shake'), 650);
    sfx.err();
    this.say(info.msg, 'err');
    this.o.onFail && this.o.onFail(info, this);
  }

  commit(ops) {
    this.calcPanel.hidden = true; this.calcPanel.replaceChildren();
    this.selected = new Set();
    this.say('');
    this.root = applyOps(this.root, ops, this.cfg);
    this.history.push(this.root);
    this.stats.steps++;
    sfx.ok();
    this.addLine(this.root, true);
    this.refreshAnalysis();
    this.updateMeta();
    this.o.onStep && this.o.onStep(this);
  }

  afterTyped() {
    if (!this.done && isDone(this.root)) this.finish();
  }

  finish() {
    this.done = true;
    this.stats.ms = Date.now() - this.stats.t0;
    this.root$.classList.add('done');
    this.updateMeta();
    this.o.onDone && this.o.onDone({ ...this.stats }, this);
  }

  // ---------- suggerimento ----------
  hint() {
    if (this.busy || this.locked || this.frozen || this.done || !this.root) return;
    const picks = pickSimple(this.an.ready);
    const op = picks[Math.floor(Math.random() * picks.length)];
    if (!op) return;
    this.stats.hints++;
    this.selected = new Set();
    this.paintSelection();
    for (const t of this.allTokens()) if (op.req.includes(t.dataset.tk)) t.classList.add('hint');
    this.say(`Suggerimento · ${describeOp(op)}`, 'info');
  }

  // ---------- calcoli scritti dall'utente ----------
  openCalc(allOps, prompts) {
    const rows = prompts.map(op => {
      const row = el('div', { class: 'crow' });
      if (op.calc) {
        const field = el('button', { class: 'cfield', type: 'button', text: '' });
        row.append(el('span', { class: 'clabel', text: `${op.text} =` }), field);
        row.val = ''; row.field = field; row.op = op; row.type = 'num';
        field.addEventListener('click', () => setActive(row));
      } else {
        row.type = 'signs'; row.op = op; row.toggles = [];
        row.append(el('span', { class: 'clabel', text: 'Togli le parentesi: scrivi i nuovi segni' }));
        const seq = el('span', { class: 'csigns' }, el('span', { class: 'cterm', text: op.signs.first }));
        op.signs.items.forEach(it => {
          const b = el('button', { class: 'sgn', type: 'button', text: it.from === '+' ? '+' : '−' });
          b.sym = it.from;
          b.addEventListener('click', () => { b.sym = b.sym === '+' ? '-' : '+'; b.textContent = b.sym === '+' ? '+' : '−'; b.classList.remove('bad'); });
          row.toggles.push({ b, it });
          seq.append(b, el('span', { class: 'cterm', text: it.term }));
        });
        row.append(seq);
      }
      return row;
    });
    let active = rows.find(r => r.type === 'num') || null;
    const setActive = r => { active = r; rows.forEach(x => x.field && x.field.classList.toggle('on', x === r)); };
    const press = k => {
      if (!active) return;
      if (k === 'del') active.val = active.val.slice(0, -1);
      else if (k === '/' ) { if (active.val && !active.val.includes('/')) active.val += '/'; }
      else if (active.val.length < 9) active.val += k;
      active.field.textContent = active.val;
      active.field.classList.remove('bad');
    };
    const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '/', 'del'].map(k =>
      el('button', { class: 'key', type: 'button', text: k === 'del' ? '⌫' : k === '/' ? '⁄' : k, 'aria-label': k === 'del' ? 'Cancella' : k === '/' ? 'Frazione' : k, on: { click: () => { sfx.tap(); press(k); } } }));
    const ok = el('button', { class: 'btn eq conf', type: 'button', text: 'Conferma', on: { click: () => confirm() } });
    const confirm = () => {
      const bad = [];
      let worst = null;
      for (const r of rows) {
        if (r.type === 'num') {
          const m = /^(\d+)(?:\/(\d+))?$/.exec(r.val);
          const ex = r.op.calc();
          let good = false;
          let hint = '';
          if (m) {
            const n = +m[1]; const d = m[2] === undefined ? 1 : +m[2];
            if (d !== 0 && n * ex.d === ex.n * d) {
              if (n === ex.n && d === ex.d) good = true;
              else hint = 'Il valore è giusto, ma la frazione va semplificata ai minimi termini.';
            }
          }
          if (!good) { bad.push(r); worst = worst || hint || `Controlla il calcolo ${r.op.text}.`; r.field.classList.add('bad'); }
        } else {
          const wrong = r.toggles.filter(t => t.b.sym !== t.it.to);
          if (wrong.length) { bad.push(r); wrong.forEach(t => t.b.classList.add('bad')); worst = worst || 'Se davanti alla parentesi c\'è il meno, tutti i segni dentro cambiano: più diventa meno e meno diventa più.'; }
        }
      }
      if (bad.length) {
        this.fail({ ok: false, cat: bad.some(r => r.type === 'signs') ? 'segni' : 'calcolo', msg: worst });
        return;
      }
      this.commit(allOps);
    };
    const kp = el('div', { class: 'keypad' }, keys);
    this.calcPanel.replaceChildren(
      el('div', { class: 'calc-title', text: 'Scrivi i risultati' }),
      el('div', { class: 'crows' }, rows),
      el('div', { class: 'calc-bottom' }, kp, el('div', { class: 'calc-actions' },
        el('button', { class: 'btn ghost', type: 'button', text: 'Torna all\'espressione', on: { click: () => { this.calcPanel.hidden = true; this.say(''); } } }), ok)));
    this.calcPanel.hidden = false;
    if (active) setActive(active);
  }

  // ---------- blocchi ----------
  lock(seconds, text) {
    this.locked = true;
    this.root$.classList.add('locked');
    this.calcPanel.hidden = true;
    this.stats.penaltyMs += seconds * 1000;
    let left = seconds;
    const num = el('div', { class: 'lock-num', text: left });
    this.overlay.replaceChildren(el('div', { class: 'lock-title', text: `Penalità: ${seconds} secondi` }), el('p', { class: 'lock-msg', text }), num);
    this.overlay.hidden = false;
    const tick = () => {
      left--;
      if (left <= 0) { this.unlock(); return; }
      num.textContent = left; sfx.tick();
      this.later(tick, 1000);
    };
    this.later(tick, 1000);
  }
  unlock() {
    this.locked = false;
    this.overlay.hidden = true;
    this.root$.classList.remove('locked');
    this.selected = new Set();
    this.say('');
    if (this.curExpr) this.paintSelection();
  }
  freeze() { this.frozen = true; this.busy = false; this.timers.forEach(clearTimeout); this.stopTyping && this.stopTyping(); this.root$.classList.add('frozen'); }

  // ---------- dimostrazione ----------
  demoStep() {
    if (this.busy || this.done || !this.root) return Promise.resolve(false);
    const ops = pickAll(this.an.ready);
    this.selected = new Set(ops.flatMap(o => o.req));
    this.paintSelection();
    const first = ops[0];
    this.say(`${describeOp(first)}${ops.length > 1 ? ' — e insieme a questa anche le altre con la stessa priorità' : ''}`, 'info');
    return new Promise(res => {
      this.later(() => { this.commit(ops); this.later(() => res(true), 60); }, 1100);
    });
  }
}
