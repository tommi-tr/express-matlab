// Modalità «errori da trovare»: dopo un passaggio corretto, a volte si mostra una riga con un errore tipico.
import * as A from './ast.js';

const pick = a => a[Math.floor(Math.random() * a.length)];

function idsOf(root) {
  const s = new Set();
  A.walk(root, n => { s.add(n.id); if (n.t === 'seq') n.ops.forEach(o => s.add(o.id)); });
  return s;
}
function findOp(root, id) {
  let res = null;
  A.walk(root, n => { if (!res && n.t === 'seq') { const o = n.ops.find(x => x.id === id); if (o) res = o; } });
  return res;
}

/** Restituisce una copia di newRoot con un errore plausibile, oppure null. */
export function corrupt(oldRoot, newRoot, ops) {
  const old = idsOf(oldRoot);
  const cands = [];
  A.walk(newRoot, (n, parent) => {
    if (n.t === 'val' && !old.has(n.id) && !(parent && parent.t === 'seq' && parent.operands.length === 1 && false)) cands.push({ type: 'val', id: n.id });
    if (n.t === 'pow' && !old.has(n.id) && n.exp.t === 'seq' && n.exp.ops.length === 1) cands.push({ type: 'exp', id: n.exp.ops[0].id });
  });
  for (const o of ops) {
    if (o.kind === 'unwrap' && o.flip) {
      const g = A.find(oldRoot, o.groupId);
      if (g) g.node.inner.ops.forEach(io => cands.push({ type: 'sign', id: io.id, weight: 3 }));
    }
  }
  if (!cands.length) return null;
  const weighted = cands.flatMap(c => Array(c.weight || 1).fill(c));
  const c = pick(weighted);
  const bad = A.clone(newRoot);
  if (c.type === 'val') {
    const f = A.find(bad, c.id).node;
    const deltas = [1, -1, 2, -2, 10, -10, 3].filter(d => f.d === 1 ? f.n + d >= 0 && f.n + d !== f.n : f.n + d > 0);
    if (!deltas.length) return null;
    f.n += pick(deltas);
  } else if (c.type === 'exp') {
    const o = findOp(bad, c.id);
    if (!o) return null;
    o.sym = o.sym === '+' ? '*' : o.sym === '-' ? '/' : o.sym === '*' ? '+' : '*';
  } else {
    // errore sui segni: la parentesi è stata tolta senza cambiare un segno
    const o = findOp(bad, c.id);
    const before = findOp(oldRoot, c.id);
    if (!o || !before) return null;
    o.sym = before.sym;
  }
  return bad;
}
