// Disegna l'albero come DOM. Ogni elemento cliccabile ha data-tk = id del "token".
import { el } from './dom.js';

const SYM = { '+': '+', '-': '−', '*': '·', '/': ':' };

const PATHS = {
  '(': 'M9 2 C 2 25, 2 75, 9 98',
  ')': 'M1 2 C 8 25, 8 75, 1 98',
  '[': 'M9 2 H2.5 V98 H9',
  ']': 'M1 2 H7.5 V98 H1',
  '{': 'M9 2 C 5 2, 5 8, 5 20 C 5 38, 5 42, 1 50 C 5 58, 5 62, 5 80 C 5 92, 5 98, 9 98',
  '}': 'M1 2 C 5 2, 5 8, 5 20 C 5 38, 5 42, 9 50 C 5 58, 5 62, 5 80 C 5 92, 5 98, 1 98',
};
const CLOSE = { '(': ')', '[': ']', '{': '}' };

function bracket(ch, id, plain) {
  const span = el('span', { class: 'leaf br ' + (id ? 'tk' : ''), html:
    `<svg viewBox="0 0 10 100" preserveAspectRatio="none" aria-hidden="true"><path d="${PATHS[ch]}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>` });
  if (id && !plain) span.dataset.tk = id;
  return span;
}

function opEl(op, plain) {
  const s = el('span', { class: `leaf tk op op-${op.sym === '+' || op.sym === '-' ? 'add' : 'mul'}`, text: SYM[op.sym] });
  if (!plain) s.dataset.tk = op.id;
  return s;
}

function ratEl(v, plain) {
  const s = el('span', { class: 'leaf tk val rat' },
    el('span', { class: 'fn', text: v.n }), el('span', { class: 'fbar in' }), el('span', { class: 'fd', text: v.d }));
  if (!plain) s.dataset.tk = v.id;
  return s;
}

export function renderNode(x, plain = false) {
  switch (x.t) {
    case 'val': {
      if (x.d !== 1) return ratEl(x, plain);
      const s = el('span', { class: 'leaf tk val', text: x.n });
      if (!plain) s.dataset.tk = x.id;
      return s;
    }
    case 'group':
      return el('span', { class: `grp grp-${x.br === '(' ? 'r' : x.br === '[' ? 's' : 'g'}` },
        bracket(x.br, x.id + ':o', plain), renderSeq(x.inner, plain), bracket(CLOSE[x.br] === ')' ? ')' : CLOSE[x.br], x.id + ':c', plain));
    case 'pow':
      return el('span', { class: 'pow' }, el('span', { class: 'pbase' }, renderNode(x.base, plain)), el('span', { class: 'pexp' }, renderSeq(x.exp, plain)));
    case 'frac':
      return el('span', { class: 'frac' }, el('span', { class: 'fn' }, renderSeq(x.num, plain)), el('span', { class: 'leaf fbar' }), el('span', { class: 'fd' }, renderSeq(x.den, plain)));
    default: return renderSeq(x, plain);
  }
}

export function renderSeq(sq, plain = false) {
  const s = el('span', { class: 'seq' });
  sq.operands.forEach((x, i) => {
    s.append(renderNode(x, plain));
    const op = sq.ops[i];
    if (op) {
      if (op.sym === 'imp') s.append(el('span', { class: 'imp' }));
      else s.append(opEl(op, plain));
    }
  });
  return s;
}

/** espressione completa (radice) */
export function renderExpr(root, { plain = false, colors = true } = {}) {
  const e = el('span', { class: 'expr' + (colors ? ' pc' : '') });
  e.append(renderSeq(root, plain));
  return e;
}

/** scrittura progressiva da sinistra a destra */
export function typeIn(exprEl, msPerSymbol, done) {
  const leaves = [...exprEl.querySelectorAll('.leaf')].filter(l => !l.parentElement.closest('.leaf'));
  if (!msPerSymbol || !leaves.length) { done && done(); return () => {}; }
  exprEl.classList.add('typing');
  const timers = [];
  leaves.forEach((l, i) => {
    timers.push(setTimeout(() => {
      l.classList.add('shown');
      if (i === leaves.length - 1) { exprEl.classList.remove('typing'); done && done(); }
    }, (i + 1) * msPerSymbol));
  });
  return () => { timers.forEach(clearTimeout); exprEl.classList.remove('typing'); };
}
