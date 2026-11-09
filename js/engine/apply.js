// Applicazione delle operazioni scelte all'albero + normalizzazione.
import * as A from './ast.js';
import { R, add, sub, mul, div, pw } from './rational.js';

const groupish = n => n.t === 'group' || (n.t === 'pow' && n.base.t === 'group');

function norm(n) {
  switch (n.t) {
    case 'seq':
      n.operands = n.operands.map(norm);
      n.ops.forEach((o, k) => {
        if (o.sym === 'imp' && !groupish(n.operands[k]) && !groupish(n.operands[k + 1])) o.sym = '*';
      });
      return n;
    case 'group': n.inner = norm(n.inner); return n;
    case 'pow':
      n.exp = norm(n.exp);
      n.base = norm(n.base);
      if (n.base.t === 'val' && n.base.d !== 1) n.base = A.mkGroup('(', A.seqOf(n.base));
      return n;
    case 'frac': {
      n.num = norm(n.num);
      n.den = norm(n.den);
      const a = A.singleVal(n.num);
      const b = A.singleVal(n.den);
      if (a && b && a.d === 1 && b.d === 1 && b.n !== 0) return A.mkVal(a.n, b.n);
      return n;
    }
    default: return n;
  }
}
export const normalize = root => norm(root);

const valOf = r => A.mkVal(r.n, r.d);
const pv = v => ({ n: v.n, d: v.d });

function applyOne(root, op) {
  switch (op.kind) {
    case 'bin': {
      const f = A.findOperand(root, op.leftId);
      const { seq, i } = f;
      const L = pv(seq.operands[i]); const Rr = pv(seq.operands[i + 1]);
      const s = seq.ops[i].sym;
      let r;
      if (s === '+') r = add(L, Rr);
      else if (s === '-') r = sub(L, Rr);
      else if (s === '/') r = div(L, Rr);
      else r = mul(L, Rr);
      if (r.n < 0) throw new RangeError('negativo');
      seq.operands.splice(i, 2, valOf(r));
      seq.ops.splice(i, 1);
      break;
    }
    case 'powEval': {
      const p = A.find(root, op.powId).node;
      const b = p.base.t === 'val' ? p.base : A.singleVal(p.base.inner);
      const e = A.singleVal(p.exp);
      A.replaceNode(root, p.id, valOf(pw(pv(b), e.n)));
      break;
    }
    case 'reduce': {
      const v = A.find(root, op.valId).node;
      A.replaceNode(root, v.id, valOf(R(v.n, v.d)));
      break;
    }
    case 'unwrap': {
      const f = A.find(root, op.groupId);
      const g = f.node;
      if (f.parent.t === 'pow') { f.parent.base = A.singleVal(g.inner); break; }
      const seq = f.parent;
      const i = f.slot;
      const single = A.singleVal(g.inner);
      if (single) { seq.operands[i] = single; break; }
      const flip = i > 0 && seq.ops[i - 1].sym === '-';
      const inner = g.inner.ops.map(o => (flip ? { ...o, sym: o.sym === '+' ? '-' : '+' } : o));
      seq.operands.splice(i, 1, ...g.inner.operands);
      seq.ops.splice(i, 0, ...inner);
      break;
    }
    case 'prodSameBase': case 'quotSameBase': case 'prodSameExp': case 'quotSameExp': {
      const f = A.findOperand(root, op.xId);
      const { seq, i } = f;
      let np;
      if (op.kind === 'prodSameBase') {
        np = A.mkPow(A.mkVal(op.b1), A.mkSeq([A.mkVal(op.m), A.mkVal(op.n)], [A.mkOp('+')]));
      } else if (op.kind === 'quotSameBase') {
        np = A.mkPow(A.mkVal(op.b1), A.mkSeq([A.mkVal(op.m), A.mkVal(op.n)], [A.mkOp('-')]));
      } else {
        const sym = op.kind === 'prodSameExp' ? '*' : '/';
        const inner = A.mkSeq([A.mkVal(op.b1), A.mkVal(op.b2)], [A.mkOp(sym)]);
        np = A.mkPow(A.mkGroup('(', inner), A.seqOf(A.mkVal(op.m)));
      }
      seq.operands.splice(i, 2, np);
      seq.ops.splice(i, 1);
      break;
    }
    case 'powOfPow': {
      const p = A.find(root, op.powId).node;
      const q = p.base.inner.operands[0];
      const m = A.singleVal(q.exp).n;
      const n = A.singleVal(p.exp).n;
      const np = A.mkPow(A.mkVal(q.base.n), A.mkSeq([A.mkVal(m), A.mkVal(n)], [A.mkOp('*')]));
      A.replaceNode(root, p.id, np);
      break;
    }
    case 'powOfProd': {
      const f = A.findOperand(root, op.powId);
      const { seq, i } = f;
      const p = seq.operands[i];
      const [a, b] = p.base.inner.operands;
      const sym = p.base.inner.ops[0].sym;
      const n = A.singleVal(p.exp).n;
      const pa = A.mkPow(A.mkVal(a.n), A.seqOf(A.mkVal(n)));
      const pb = A.mkPow(A.mkVal(b.n), A.seqOf(A.mkVal(n)));
      if (i > 0 && seq.ops[i - 1].sym === '/') {
        seq.operands[i] = A.mkGroup('(', A.mkSeq([pa, pb], [A.mkOp(sym)]));
      } else {
        seq.operands.splice(i, 1, pa, pb);
        seq.ops.splice(i, 0, A.mkOp(sym));
      }
      break;
    }
    default: throw new Error('operazione sconosciuta ' + op.kind);
  }
}

/** Applica insieme più operazioni (indipendenti). Restituisce un nuovo albero. */
export function applyOps(root, ops) {
  const r = A.clone(root);
  ops.forEach(op => applyOne(r, op));
  return normalize(r);
}
