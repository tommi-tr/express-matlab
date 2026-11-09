// Analisi di un'espressione: quali operazioni si possono svolgere ora (rispettando le precedenze)
// e, per quelle che non si possono, perché.
import * as A from './ast.js';
import { R, add, sub, mul, div, pw, gcd } from './rational.js';

export const SYM_TXT = { '+': '+', '-': '−', '*': '·', '/': ':', imp: '·' };
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup = n => String(n).split('').map(d => SUP[+d]).join('');
export const vt = v => (v.d === 1 ? String(v.n) : `${v.n}/${v.d}`);
export function termText(x) {
  if (x.t === 'val') return vt(x);
  if (x.t === 'pow') {
    const e = A.singleVal(x.exp);
    const b = x.base.t === 'val' ? x.base : A.singleVal(x.base.inner);
    if (b && e) return `${vt(b)}${sup(e.n)}`;
  }
  return '…';
}
export const isReduced = v => v.d === 1 || gcd(v.n, v.d) === 1;

export const STAGE_NAMES = {
  0: 'Semplificazione',
  1: 'Parentesi',
  2: 'Potenze',
  3: 'Moltiplicazioni e divisioni',
  4: 'Addizioni e sottrazioni',
};

/** valore numerico di un nodo (usa le regole di precedenza) */
export function evalNode(n) {
  switch (n.t) {
    case 'val': return R(n.n, n.d);
    case 'group': return evalNode(n.inner);
    case 'frac': return div(evalNode(n.num), evalNode(n.den));
    case 'pow': {
      const e = evalNode(n.exp);
      if (e.d !== 1 || e.n < 0) throw new RangeError('exp');
      return pw(evalNode(n.base), e.n);
    }
    default: {
      let total = R(0);
      let term = evalNode(n.operands[0]);
      let sign = 1;
      n.ops.forEach((o, k) => {
        const v = evalNode(n.operands[k + 1]);
        if (o.sym === '*' || o.sym === 'imp') term = mul(term, v);
        else if (o.sym === '/') term = div(term, v);
        else {
          total = sign === 1 ? add(total, term) : sub(total, term);
          term = v;
          sign = o.sym === '+' ? 1 : -1;
        }
      });
      return sign === 1 ? add(total, term) : sub(total, term);
    }
  }
}

/** controlla che, svolgendo da sinistra a destra, le somme parziali non diventino negative */
function partialsOK(operands, ops) {
  try {
    let total = R(0);
    let term = evalNode(operands[0]);
    let sign = 1;
    const flush = () => {
      total = sign === 1 ? add(total, term) : sub(total, term);
      return total.n >= 0;
    };
    for (let k = 0; k < ops.length; k++) {
      const v = evalNode(operands[k + 1]);
      const s = ops[k].sym;
      if (s === '*' || s === 'imp') term = mul(term, v);
      else if (s === '/') term = div(term, v);
      else {
        if (!flush()) return false;
        term = v;
        sign = s === '+' ? 1 : -1;
      }
    }
    return flush();
  } catch (e) { return true; }
}

const WHY = {
  parentesi: () => 'Prima si svolgono le parentesi, partendo dalle più interne.',
  potenze: () => 'Le potenze vengono prima di moltiplicazioni, divisioni, somme e sottrazioni.',
  moltdiv: () => 'Moltiplicazioni e divisioni vengono prima di somme e sottrazioni.',
  ordine: () => 'Le operazioni con la stessa priorità si svolgono da sinistra verso destra.',
};
function mkWhy(cat, blocker) {
  let msg = WHY[cat]();
  if (blocker && blocker.text) {
    msg += cat === 'ordine' ? ` Comincia da ${blocker.text}.` : ` Intanto tocca a ${blocker.text}.`;
  }
  return { cat, msg };
}

export function analyze(root, cfg = {}) {
  const signUnwrap = cfg.signUnwrap !== false;
  const all = [];
  const tokenSeq = new Map();
  const seqWhy = new Map();
  let nid = 0;
  const push = o => {
    o.key = 'op' + (nid++);
    o.opt = o.opt || [];
    o.ready = o.ready === undefined ? false : o.ready;
    all.push(o);
    return o;
  };

  function unwrapCand(sq, i, g) {
    const inner = g.inner;
    const prev = i > 0 ? sq.ops[i - 1] : null;
    const next = i < sq.ops.length ? sq.ops[i] : null;
    const additive = s => !s || s.sym === '+' || s.sym === '-';
    const single = A.singleVal(inner);
    const o = {
      kind: 'unwrap', stage: 1, groupId: g.id, flip: false,
      req: [g.id + ':o', g.id + ':c'], opt: [], text: 'le parentesi', ready: true,
    };
    if (single) {
      if (prev) o.opt.push(prev.id);
      return o;
    }
    if (!signUnwrap || !additive(prev) || !additive(next)) return null;
    if (!inner.ops.every(x => x.sym === '+' || x.sym === '-')) return null;
    if (!inner.operands.every(x => x.t === 'val' || x.t === 'pow')) return null;
    const flip = !!(prev && prev.sym === '-' && inner.ops.length > 0);
    const ops2 = [...sq.ops];
    ops2.splice(i, 0, ...inner.ops.map(x => ({ ...x, sym: flip ? (x.sym === '+' ? '-' : '+') : x.sym })));
    const operands2 = [...sq.operands];
    operands2.splice(i, 1, ...inner.operands);
    o.flip = flip;
    o.signs = { first: termText(inner.operands[0]), items: inner.ops.map((x, k) => ({ from: x.sym, to: x.sym === '+' ? '-' : '+', term: termText(inner.operands[k + 1]) })) };
    o.text = flip ? 'le parentesi (cambiando i segni)' : 'le parentesi';
    if (flip) o.req.push(prev.id); else if (prev) o.opt.push(prev.id);
    if (!partialsOK(operands2, ops2)) {
      o.ready = false;
      o.why = { cat: 'segni', msg: 'Così resterebbe una sottrazione impossibile (nei numeri naturali non si toglie un numero più grande). Svolgi prima la parentesi.' };
    }
    return o;
  }

  function powStuff(sq, i, x, stage1, own, extra) {
    const b = x.base;
    const e = x.exp;
    tokenSeq.set(x.id, sq.id);
    if (b.t === 'group') {
      tokenSeq.set(b.id + ':o', sq.id); tokenSeq.set(b.id + ':c', sq.id);
      const r = walkSeq(b.inner);
      stage1.push(...r.r); extra.push(...r.x);
    } else if (!isReduced(b)) {
      extra.push(push({ kind: 'reduce', stage: 0, ready: true, req: [b.id], valId: b.id, text: `${vt(b)} ridotta` }));
    }
    const re = walkSeq(e);
    stage1.push(...re.r); extra.push(...re.x);

    const eVal = A.singleVal(e);
    const bVal = b.t === 'val' ? b : (b.t === 'group' ? A.singleVal(b.inner) : null);
    const eInt = eVal && eVal.d === 1 && eVal.n >= 0;
    const parens = b.t === 'group' ? [b.id + ':o', b.id + ':c'] : [];

    if (eInt && bVal) {
      own.push(push({
        kind: 'powEval', stage: 2, powId: x.id, req: [bVal.id, eVal.id], opt: parens,
        text: `${vt(bVal)}${sup(eVal.n)}`,
        calc: () => pw(R(bVal.n, bVal.d), eVal.n),
      }));
    }
    if (b.t === 'group' && bVal && bVal.d === 1) {
      stage1.push(push({
        kind: 'unwrap', stage: 1, ready: true, groupId: b.id, flip: false,
        req: [b.id + ':o', b.id + ':c'], text: 'le parentesi',
      }));
    }
    if (b.t === 'group' && eInt) {
      const inner = b.inner;
      if (inner.operands.length === 1 && inner.operands[0].t === 'pow') {
        const q = inner.operands[0];
        const qb = q.base;
        const qe = A.singleVal(q.exp);
        if (qb.t === 'val' && qb.d === 1 && qe && qe.d === 1) {
          stage1.push(push({
            kind: 'powOfPow', stage: 1, ready: true, powId: x.id,
            req: [qb.id, qe.id, eVal.id], opt: parens,
            text: `(${qb.n}${sup(qe.n)})${sup(eVal.n)}`,
          }));
        }
      }
      if (inner.operands.length === 2 && (inner.ops[0].sym === '*' || inner.ops[0].sym === '/') &&
          inner.operands.every(v => v.t === 'val' && v.d === 1)) {
        const [va, vb] = inner.operands;
        stage1.push(push({
          kind: 'powOfProd', stage: 1, ready: true, powId: x.id, sym: inner.ops[0].sym,
          req: [va.id, inner.ops[0].id, vb.id, eVal.id], opt: parens,
          text: `(${va.n} ${SYM_TXT[inner.ops[0].sym]} ${vb.n})${sup(eVal.n)}`,
        }));
      }
    }
  }

  function walkSeq(sq) {
    const { operands, ops } = sq;
    const stage1 = [];
    const extra = [];
    const own = [];
    tokenSeq.set(sq.id, sq.id);

    operands.forEach((x, i) => {
      tokenSeq.set(x.id, sq.id);
      if (x.t === 'val') {
        if (!isReduced(x)) {
          extra.push(push({ kind: 'reduce', stage: 0, ready: true, req: [x.id], valId: x.id, text: `${vt(x)} ridotta`, calc: () => R(x.n, x.d) }));
        }
      } else if (x.t === 'group') {
        tokenSeq.set(x.id + ':o', sq.id); tokenSeq.set(x.id + ':c', sq.id);
        const r = walkSeq(x.inner);
        stage1.push(...r.r); extra.push(...r.x);
        const u = unwrapCand(sq, i, x);
        if (u) { push(u); if (u.ready) stage1.push(u); }
      } else if (x.t === 'frac') {
        const a = walkSeq(x.num);
        const b = walkSeq(x.den);
        stage1.push(...a.r, ...b.r); extra.push(...a.x, ...b.x);
      } else if (x.t === 'pow') {
        powStuff(sq, i, x, stage1, own, extra);
      }
    });

    ops.forEach((o, k) => {
      tokenSeq.set(o.id, sq.id);
      const L = operands[k];
      const Rr = operands[k + 1];
      if (L.t === 'val' && Rr.t === 'val') {
        const mulish = o.sym === '*' || o.sym === '/' || o.sym === 'imp';
        own.push(push({
          kind: 'bin', stage: mulish ? 3 : 4, opIndex: k, opId: o.id, leftId: L.id, rightId: Rr.id, sym: o.sym,
          req: o.sym === 'imp' ? [L.id, Rr.id] : [L.id, o.id, Rr.id],
          text: `${vt(L)} ${SYM_TXT[o.sym]} ${vt(Rr)}`,
          calc: () => {
            const a = R(L.n, L.d); const b = R(Rr.n, Rr.d);
            if (o.sym === '+') return add(a, b);
            if (o.sym === '-') return sub(a, b);
            if (o.sym === '/') return div(a, b);
            return mul(a, b);
          },
        }));
      }
    });

    // proprietà delle potenze: prodotto/quoziente di potenze
    ops.forEach((o, k) => {
      if (o.sym !== '*' && o.sym !== '/') return;
      if (k > 0 && ops[k - 1].sym === '/') return;
      const X = operands[k];
      const Y = operands[k + 1];
      if (X.t !== 'pow' || Y.t !== 'pow') return;
      const xe = A.singleVal(X.exp);
      const ye = A.singleVal(Y.exp);
      if (!(X.base.t === 'val' && X.base.d === 1 && Y.base.t === 'val' && Y.base.d === 1 && xe && ye)) return;
      if (xe.d !== 1 || ye.d !== 1) return;
      const b1 = X.base.n; const b2 = Y.base.n; const m = xe.n; const n = ye.n;
      const req = [X.base.id, xe.id, o.id, Y.base.id, ye.id];
      const base = { stage: 2, xId: X.id, yId: Y.id, opId: o.id, b1, b2, m, n, req, text: `${b1}${sup(m)} ${SYM_TXT[o.sym]} ${b2}${sup(n)}` };
      if (o.sym === '*') {
        if (b1 === b2) own.push(push({ ...base, kind: 'prodSameBase' }));
        if (m === n) own.push(push({ ...base, kind: 'prodSameExp' }));
      } else {
        if (b1 === b2 && m >= n) own.push(push({ ...base, kind: 'quotSameBase' }));
        if (m === n && b2 !== 0 && b1 % b2 === 0) own.push(push({ ...base, kind: 'quotSameExp' }));
      }
    });

    // --- priorità dentro questa catena ---
    let why = null;
    const readyOwn = [];
    if (stage1.length > 0) {
      why = mkWhy('parentesi', stage1[0]);
      own.forEach(c => { c.ready = false; c.why = why; });
    } else if (own.length) {
      const m = Math.min(...own.map(c => c.stage));
      const isLeft = c => c.opIndex === 0 ||
        (m === 3 && (ops[c.opIndex - 1].sym === '+' || ops[c.opIndex - 1].sym === '-'));
      const first = own.filter(c => c.stage === m && (m === 2 || isLeft(c)));
      const blockerOf = first[0];
      own.forEach(c => {
        if (c.stage > m) {
          c.ready = false;
          c.why = mkWhy(m === 2 ? 'potenze' : 'moltdiv', blockerOf);
          why = why || c.why;
        } else if (m === 2) {
          c.ready = true;
        } else {
          const leftmost = isLeft(c);
          c.ready = leftmost;
          if (!leftmost) {
            c.why = mkWhy('ordine', first[0]);
            why = why || c.why;
          }
        }
      });
      own.forEach(c => { if (c.ready) readyOwn.push(c); });
    }
    seqWhy.set(sq.id, why);
    return { r: [...stage1, ...readyOwn], x: extra };
  }

  const res = walkSeq(root);
  const ready = [...res.r, ...res.x];
  return { ready, all, tokenSeq, seqWhy };
}

/** Trova quali operazioni corrispondono alla selezione dell'utente. */
export function matchSelection(selection, an) {
  const S = new Set(selection);
  if (!S.size) {
    return { ok: false, cat: 'vuoto', empty: true, msg: 'Seleziona almeno un\'operazione, poi premi «=».' };
  }
  const order = [...S];
  const run = cands => {
    let found = null;
    const dfs = (covered, chosen) => {
      const t = order.find(x => !covered.has(x));
      if (t === undefined) { found = chosen.slice(); return true; }
      for (const c of cands) {
        if (chosen.includes(c)) continue;
        const opt = c.opt.filter(x => S.has(x));
        const toks = [...c.req, ...opt];
        if (!toks.includes(t)) continue;
        if (!c.req.every(x => S.has(x))) continue;
        if (toks.some(x => covered.has(x))) continue;
        const nc = new Set(covered);
        toks.forEach(x => nc.add(x));
        chosen.push(c);
        if (dfs(nc, chosen)) return true;
        chosen.pop();
      }
      return false;
    };
    dfs(new Set(), []);
    return found;
  };
  const okCover = run(an.all.filter(c => c.ready));
  if (okCover) return { ok: true, ops: okCover };

  const anyCover = run(an.all);
  if (anyCover) {
    const bad = anyCover.find(c => !c.ready);
    const why = bad.why || { cat: 'ordine', msg: 'Questa operazione non si può fare adesso.' };
    return { ok: false, cat: why.cat, msg: `Hai scelto «${bad.text}». ${why.msg}`, bad };
  }

  // selezione che non corrisponde a un'operazione completa
  for (const t of order) {
    const w = an.seqWhy.get(an.tokenSeq.get(t));
    if (w) {
      return { ok: false, cat: w.cat, msg: `Quella non è ancora un'operazione che puoi svolgere. ${w.msg}` };
    }
  }
  return {
    ok: false, cat: 'selezione',
    msg: 'Per svolgere un\'operazione tocca tutti i suoi elementi: i numeri e il simbolo (+ − · :). Se sono più operazioni, che siano separate.',
  };
}

/** descrizione per suggerimenti e dimostrazione */
export function describeOp(op) {
  switch (op.kind) {
    case 'unwrap': return op.flip
      ? 'Si tolgono le parentesi: davanti c\'è un meno, quindi i segni dentro cambiano.'
      : 'Si tolgono le parentesi, che contengono ormai un solo numero.';
    case 'reduce': return 'Si semplifica la frazione ai minimi termini.';
    case 'powEval': return `Potenza: ${op.text}`;
    case 'prodSameBase': return 'Stessa base: si sommano gli esponenti.';
    case 'quotSameBase': return 'Stessa base: si sottraggono gli esponenti.';
    case 'prodSameExp': return 'Stesso esponente: si moltiplicano le basi.';
    case 'quotSameExp': return 'Stesso esponente: si dividono le basi.';
    case 'powOfPow': return 'Potenza di potenza: si moltiplicano gli esponenti.';
    case 'powOfProd': return 'Potenza di un prodotto o di un quoziente: l\'esponente va su ogni fattore.';
    default: return `${STAGE_NAMES[op.stage]}: ${op.text}`;
  }
}

export function isDone(root) {
  return root.operands.length === 1 && root.operands[0].t === 'val' && isReduced(root.operands[0]);
}
