// Generatore casuale di espressioni valide per livello (campionamento con scarto).
import { validate } from './solve.js';

const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const SYM = ['+', '-', '\\cdot', ':'];

function numberFor(level) { return level === 1 ? ri(2, 12) : ri(2, 10); }

function chain(level, n, depth, maxDepth, st) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    parts.push(operand(level, depth, maxDepth, st));
    if (i < n - 1) parts.push(pick(SYM));
  }
  return { parts };
}

// restituisce un albero di stringhe; i tipi di parentesi si decidono dopo, in base all'altezza
function operand(level, depth, maxDepth, st) {
  const r = Math.random();
  if (level >= 2 && depth < maxDepth && r < (depth === 0 ? 0.5 : 0.35)) {
    const inner = chain(level, ri(2, 3), depth + 1, maxDepth, st);
    st.groups++;
    const g = { group: inner };
    if (level >= 3 && Math.random() < 0.18) return { pow: g, exp: 2 };
    return g;
  }
  if (level >= 3 && r > 0.78 && r < 0.93) { st.pows++; return { text: `${ri(2, 5)}^${ri(2, 3)}` }; }
  if (level >= 3 && r >= 0.97 && st.fracs < 1) { st.fracs++; const d = ri(2, 5); return { text: `\\frac{${ri(1, d - 1)}}{${d}}` }; }
  return { text: String(numberFor(level)) };
}

// una parentesi serve solo se cambia l'ordine delle operazioni (o i segni)
function usefulGroups(ch) {
  const parts = ch.parts;
  for (let i = 0; i < parts.length; i += 2) {
    let g = parts[i];
    if (g.pow) g = g.pow;
    if (!g.group) continue;
    const inner = g.group.parts.filter((_, k) => k % 2 === 1);
    const prev = i > 0 ? parts[i - 1] : null;
    const next = i + 1 < parts.length ? parts[i + 1] : null;
    const add = inner.some(x => x === '+' || x === '-');
    const mulNeighbor = [prev, next].some(x => x === '\\cdot' || x === ':');
    const useful = parts[i].pow ? true : add ? (mulNeighbor || prev === '-') : prev === ':';
    if (!useful || !usefulGroups(g.group)) return false;
  }
  return true;
}

function height(n) {
  if (n.pow) return height(n.pow);
  if (n.group) return 1 + Math.max(0, ...n.group.parts.filter(p => typeof p === 'object').map(height));
  return 0;
}
const BR = [['(', ')'], ['[', ']'], ['\\{', '\\}']];
function toLatex(n, level) {
  if (typeof n === 'string') return n;
  if (n.text) return n.text;
  if (n.pow) return `${toLatex(n.pow, level)}^${n.exp}`;
  const h = level >= 3 ? Math.min(2, height(n) - 1) : 0;
  const [o, c] = BR[h];
  return `${o}${n.group.parts.map(p => toLatex(p, level)).join('')}${c}`;
}

const f = () => { const d = ri(2, 6); return `\\frac{${ri(1, d - 1)}}{${d}}`; };
const PIECES = [
  () => { const x = ri(2, 5); return `\\frac{${x}^{${ri(2, 4)}}\\cdot${x}^{${ri(2, 3)}}}{${x}^{${ri(2, 4)}}}`; },
  () => { const x = ri(2, 4); return `\\frac{(${x}^{${ri(2, 3)}})^{${ri(2, 3)}}}{${x}^{${ri(2, 4)}}\\cdot${x}}`; },
  () => `\\left(${f()}\\right)^2:${f()}`,
  () => `\\left(${f()}+${f()}\\right)\\cdot${f()}`,
  () => `${f()}\\cdot\\left(${f()}\\right)^2`,
  () => { const x = ri(2, 4); return `${x}^{${ri(3, 5)}}\\cdot${x}^{${ri(2, 3)}}:${x}^{${ri(2, 4)}}`; },
  () => `\\left[${f()}+${f()}\\cdot\\left(${f()}\\right)^2\\right]:${f()}`,
  () => `\\frac{${ri(2, 5)}+${ri(2, 4)}\\cdot${ri(2, 4)}}{${ri(2, 4)}^2+${ri(1, 3)}}`,
  () => `\\left\\{${f()}+\\left[${f()}-${f()}\\right]\\cdot${ri(2, 5)}\\right\\}:${f()}`,
  () => { const a = ri(2, 4); const b = ri(2, 4); const n = ri(2, 3); return `${a}^${n}\\cdot${b}^${n}:${a * b}^${n}+${f()}`; },
];
const l4 = () => {
  const n = ri(3, 4);
  let out = pick(PIECES)();
  for (let i = 1; i < n; i++) out += pick(['+', '-']) + pick(PIECES)();
  return out;
};

const LIMITS = { 1: [2, 3], 2: [5, 9], 3: [8, 12], 4: [6, 11] };

export function generate(level, tries = 4000) {
  for (let t = 0; t < tries; t++) {
    let latex;
    if (level === 4) latex = l4();
    else {
      const st = { groups: 0, pows: 0, fracs: 0 };
      const maxDepth = level === 1 ? 0 : level === 2 ? 2 : 3;
      const n = level === 1 ? ri(3, 4) : level === 2 ? ri(3, 5) : ri(3, 4);
      const tree = { group: chain(level, n, 0, maxDepth, st) };
      if (!usefulGroups(tree.group)) continue;
      // il livello più esterno non è una parentesi
      latex = tree.group.parts.map(p => toLatex(p, level)).join('');
      if (level === 2 && st.groups < 3) continue;
      if (level === 3 && (st.groups < 3 || st.pows < 1)) continue;
      if (level === 1 && !/\\cdot|:/.test(latex)) continue;
      if (level === 1 && !/[+-]/.test(latex)) continue;
    }
    if (/(^|\D)(\d+)[-:]\2(?!\d)/.test(latex)) continue;
    const v = validate(latex, level);
    if (!v.ok) continue;
    const [lo, hi] = LIMITS[level];
    if (v.steps < lo || v.steps > hi) continue;
    if (/^0$/.test(v.value)) continue;
    if (level < 4 && +v.value > 400) continue;
    return { latex, level, steps: v.steps };
  }
  return null;
}
