// Soluzione canonica, validazione di una espressione LaTeX, livello suggerito.
import { analyze, isDone, evalNode, vt } from './analyze.js';
import { applyOps } from './apply.js';
import { parse, features, ParseError } from './parse.js';
import * as A from './ast.js';

const PREF = { bin: 0, powEval: 0, unwrap: 1, reduce: 2 };

/** sceglie le operazioni "naturali" del prossimo passo: tutte quelle pronte della priorità più alta */
export function pickCanonical(ready) {
  const main = ready.filter(o => o.kind !== 'reduce');
  if (!main.length) return ready;
  const m = Math.min(...main.map(o => o.stage));
  const cands = main
    .filter(o => o.stage === m)
    .sort((a, b) => ((PREF[a.kind] ?? 3) + (a.flip ? 1 : 0)) - ((PREF[b.kind] ?? 3) + (b.flip ? 1 : 0)));
  const used = new Set();
  const out = [];
  for (const c of cands) {
    const toks = [...c.req, ...c.opt];
    if (toks.some(t => used.has(t))) continue;
    // le operazioni "con cambio di segno" si evitano quando c'è altro da fare
    if (c.flip && cands.some(x => !x.flip && x !== c)) continue;
    toks.forEach(t => used.add(t));
    out.push(c);
  }
  return out;
}

export function solve(root, cfg = {}) {
  const states = [root];
  const stepOps = [];
  let cur = root;
  for (let g = 0; g < 200 && !isDone(cur); g++) {
    const an = analyze(cur, cfg);
    if (!an.ready.length) throw new Error('Nessuna operazione disponibile (blocco).');
    const pick = pickCanonical(an.ready);
    stepOps.push(pick);
    cur = applyOps(cur, pick);
    states.push(cur);
  }
  if (!isDone(cur)) throw new Error('Troppi passaggi.');
  return { states, stepOps, steps: states.length - 1 };
}

/** passaggi che mancano alla fine (per la barra di avanzamento) */
export function remainingSteps(root, cfg = {}) {
  try { return solve(root, cfg).steps; } catch (e) { return 0; }
}

export function suggestLevel(f) {
  if (!f.groups && !f.pows && !f.fracs) return 1;
  if (!f.pows && !f.fracs && f.brackets.size === 1 && f.brackets.has('(')) return 2;
  if (f.fracs >= 3 || f.pows >= 3 && f.fracs >= 1) return 4;
  return 3;
}

const cache = new Map();

/** Valida una espressione LaTeX per un certo livello. */
export function validate(latex, level, cfg = {}) {
  const key = `${latex}|${level}`;
  if (cache.has(key)) return cache.get(key);
  const out = { ok: false, errors: [], warnings: [], latex, level };
  try {
    const root = parse(latex);
    const f = features(root);
    const sol = solve(root, cfg);
    out.ast = root;
    out.steps = sol.steps;
    out.features = f;
    out.suggested = suggestLevel(f);
    const final = evalNode(root);
    out.value = vt(final);
    const intOnly = level <= 2;
    for (const st of sol.states) {
      A.walk(st, n => {
        if (n.t === 'val') {
          if (n.n < 0) out.errors.push('Compare un numero negativo durante i calcoli.');
          if (intOnly && n.d !== 1) out.errors.push('Compare una frazione (livelli 1 e 2 usano solo numeri naturali).');
        }
      });
    }
    if (sol.steps > 14) out.warnings.push('Espressione molto lunga (più di 14 passaggi).');
    if ((level <= 2 && out.suggested > level) || (level >= 3 && out.suggested <= 2)) out.warnings.push(`Per le sue caratteristiche sembra di livello ${out.suggested}.`);
    out.errors = [...new Set(out.errors)];
    out.ok = out.errors.length === 0;
  } catch (e) {
    if (e instanceof ParseError) out.errors.push(e.message);
    else if (e instanceof RangeError) out.errors.push(e.message === 'div0' ? 'Divisione per zero.' : e.message === 'negativo' ? 'Compare un risultato negativo.' : 'Numeri troppo grandi.');
    else out.errors.push(e.message || String(e));
  }
  cache.set(key, out);
  return out;
}
