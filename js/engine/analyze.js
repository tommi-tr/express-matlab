// Analisi di un'espressione: quali operazioni si possono svolgere ora (rispettando le precedenze)
// e, per quelle che non si possono, perché.
//
// Regola: un'operazione si può svolgere se nessuna delle sue parti "appartiene" a un'operazione con
// priorità più alta (o più a sinistra, a parità di priorità). Operazioni che non si toccano si possono
// quindi svolgere insieme (es. 5² − 5·3: la potenza e il prodotto).
import * as A from './ast.js';
import { R, add, sub, mul, div, pw, gcd } from './rational.js';

export const SYM_TXT = { '+': '+', '-': '−', '*': '·', '/': ':', imp: '·' };
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup = n => String(n).split('').map(d => SUP[+d]).join('');
export const vt = v => (v.d === 1 ? String(v.n) : `${v.n}/${v.d}`);
export const isReduced = v => v.d === 1 || gcd(v.n, v.d) === 1;

export function termText(x) {
  if (x.t === 'val') return vt(x);
  if (x.t === 'pow') {
    const e = A.singleVal(x.exp);
    const b = x.base.t === 'val' ? x.base : A.singleVal(x.base.inner);
    if (b && e) return `${vt(b)}${sup(e.n)}`;
  }
  return '…';
}

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
  parentesi: 'Quell\'operazione ha una parentesi (o una frazione) da svolgere prima.',
  potenze: 'Le potenze vengono prima di moltiplicazioni, divisioni, somme e sottrazioni.',
  moltdiv: 'Moltiplicazioni e divisioni vengono prima di somme e sottrazioni.',
  ordine: 'Le operazioni con la stessa priorità si svolgono da sinistra verso destra.',
};
function mkWhy(cat, blocker) {
  let msg = WHY[cat];
  if (blocker) msg += ` ${cat === 'ordine' ? 'Comincia da' : 'Intanto puoi svolgere'} ${blocker.label || blocker.text}.`;
  return { cat, msg };
}
const UNWRAP_LABEL = 'le parentesi (tocca quella che si apre e quella che si chiude)';
const PROP_HINT = {
  prod: 'Qui vale la proprietà delle potenze: stessa base, si sommano gli esponenti.',
  quot: 'Qui vale la proprietà delle potenze: stessa base, si sottraggono gli esponenti.',
  pp: 'Qui vale la proprietà delle potenze: potenza di potenza, si moltiplicano gli esponenti.',
};

/** potenza "riconoscibile" per le proprietà: a^m con a intero, oppure un intero (a^1) */
function powInfo(x) {
  if (x.t === 'pow' && x.base.t === 'val' && x.base.d === 1) {
    const ev = A.singleVal(x.exp);
    const known = !!(ev && ev.d === 1 && ev.n >= 0);
    return { node: x, id: x.id, base: x.base.n, m: known ? ev.n : null, tokens: known ? [x.base.id, ev.id] : null, isVal: false };
  }
  if (x.t === 'val' && x.d === 1 && x.n >= 2) return { node: x, id: x.id, base: x.n, m: 1, tokens: [x.id], isVal: true };
  return null;
}

export function analyze(root, cfg = {}) {
  const signUnwrap = cfg.signUnwrap !== false;
  const forceProps = cfg.forceProps !== false;
  const all = [];
  const tokWhy = new Map();
  const potCover = new Map();
  let nid = 0;
  const mk = o => {
    o.key = 'op' + (nid++);
    o.opt = o.opt || [];
    if (o.ready === undefined) o.ready = true;
    all.push(o);
    return o;
  };
  const mulish = o => o.sym === '*' || o.sym === '/' || o.sym === 'imp';
  const cover = (ids, hint) => ids.forEach(id => { if (!potCover.has(id)) potCover.set(id, hint); });

  function unwrapCand(sq, i, g) {
    const inner = g.inner;
    const prev = i > 0 ? sq.ops[i - 1] : null;
    const next = i < sq.ops.length ? sq.ops[i] : null;
    const additive = s => !s || s.sym === '+' || s.sym === '-';
    const single = A.singleVal(inner);
    const o = {
      kind: 'unwrap', stage: 1, groupId: g.id, flip: false,
      req: [g.id + ':o', g.id + ':c'], opt: [], text: 'le parentesi', label: UNWRAP_LABEL,
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
    o.signs = {
      first: termText(inner.operands[0]),
      items: inner.ops.map((x, k) => ({ from: x.sym, to: x.sym === '+' ? '-' : '+', term: termText(inner.operands[k + 1]) })),
    };
    o.text = flip ? 'le parentesi (cambiando i segni)' : 'le parentesi';
    o.label = flip ? 'togliere le parentesi cambiando i segni' : 'togliere le parentesi';
    if (flip) o.req.push(prev.id); else if (prev) o.opt.push(prev.id);
    if (!partialsOK(operands2, ops2)) {
      o.ready = false;
      o.why = { cat: 'segni', msg: 'Così resterebbe una sottrazione impossibile (nei numeri naturali non si toglie un numero più grande). Svolgi prima la parentesi.' };
    }
    return o;
  }

  function walkSeq(sq) {
    const { operands, ops } = sq;
    const created = [];
    const innerC = operands.map(() => []);
    const reg = (c, i) => { created.push(c); if (i !== undefined) innerC[i].push(c); return c; };
    const nested = (r, i) => { created.push(...r); innerC[i].push(...r); };

    operands.forEach((x, i) => {
      if (x.t === 'val') {
        if (!isReduced(x)) reg(mk({ kind: 'reduce', stage: 0, req: [x.id], valId: x.id, text: `${vt(x)} ridotta`, calc: () => R(x.n, x.d) }), i);
      } else if (x.t === 'group') {
        nested(walkSeq(x.inner), i);
        const u = unwrapCand(sq, i, x);
        if (u) reg(mk(u), i);
      } else if (x.t === 'frac') {
        nested(walkSeq(x.num), i);
        nested(walkSeq(x.den), i);
        fracCand(x, i, reg);
      } else if (x.t === 'pow') {
        powStuff(x, i, reg, nested);
      }
    });

    // ---- operazioni binarie ----
    const binC = ops.map((o, k) => {
      const L = operands[k];
      const Rr = operands[k + 1];
      if (!(L.t === 'val' && Rr.t === 'val')) return null;
      return reg(mk({
        kind: 'bin', stage: mulish(o) ? 3 : 4, opIndex: k, opId: o.id, leftId: L.id, rightId: Rr.id, sym: o.sym,
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
    });
    const firstReady = j => innerC[j].find(z => z.ready) || null;
    const pendingKind = x => (x.t === 'pow' ? 'potenze' : 'parentesi');

    ops.forEach((o, k) => {
      const c = binC[k];
      if (!c) {
        const j = operands[k].t === 'val' ? k + 1 : k;
        const cat = pendingKind(operands[j]);
        tokWhy.set(o.id, () => mkWhy(cat, firstReady(j)));
        return;
      }
      if (mulish(o)) {
        if (k > 0 && mulish(ops[k - 1])) {
          c.ready = false;
          c.whyFn = () => mkWhy('ordine', binC[k - 1] || firstReady(k - 1) || firstReady(k));
        }
        return;
      }
      // addizione/sottrazione
      if (k + 1 < ops.length && mulish(ops[k + 1])) {
        c.ready = false;
        const other = operands[k + 2];
        c.whyFn = () => (other.t === 'val' ? mkWhy('moltdiv', binC[k + 1]) : mkWhy(pendingKind(other), firstReady(k + 2)));
      } else if (k > 0 && mulish(ops[k - 1])) {
        c.ready = false;
        const other = operands[k - 1];
        c.whyFn = () => (other.t === 'val' ? mkWhy('moltdiv', binC[k - 1]) : mkWhy(pendingKind(other), firstReady(k - 1)));
      } else if (k > 0) {
        c.ready = false;
        c.whyFn = () => mkWhy('ordine', binC[0] || firstReady(0) || firstReady(1));
      }
    });

    // ---- proprietà delle potenze (prodotto e quoziente) ----
    ops.forEach((o, k) => {
      if (o.sym !== '*' && o.sym !== '/') return;
      if (k > 0 && ops[k - 1].sym === '/') return;
      const X = powInfo(operands[k]);
      const Y = powInfo(operands[k + 1]);
      if (!X || !Y || (X.isVal && Y.isVal)) return;
      const known = X.tokens && Y.tokens;
      const sameBase = X.base === Y.base;
      const pows = [X, Y].filter(z => !z.isVal).map(z => z.id);
      if (sameBase && (o.sym === '*' || !known || X.m >= Y.m)) cover(pows, o.sym === '*' ? PROP_HINT.prod : PROP_HINT.quot);
      if (!known) return;
      const base = {
        stage: 2, xId: X.id, yId: Y.id, opId: o.id, b1: X.base, b2: Y.base, m: X.m, n: Y.m,
        req: [...X.tokens, o.id, ...Y.tokens], covers: pows,
        text: `${X.base}${X.isVal ? '' : sup(X.m)} ${SYM_TXT[o.sym]} ${Y.base}${Y.isVal ? '' : sup(Y.m)}`,
      };
      if (o.sym === '*') {
        if (sameBase) reg(mk({ ...base, kind: 'prodSameBase', label: 'la proprietà delle potenze (stessa base)' }));
        if (!X.isVal && !Y.isVal && X.m === Y.m) reg(mk({ ...base, kind: 'prodSameExp', label: 'la proprietà delle potenze (stesso esponente)' }));
      } else {
        if (sameBase && X.m >= Y.m) reg(mk({ ...base, kind: 'quotSameBase', label: 'la proprietà delle potenze (stessa base)' }));
        if (!X.isVal && !Y.isVal && X.m === Y.m && Y.base !== 0 && X.base % Y.base === 0) reg(mk({ ...base, kind: 'quotSameExp', label: 'la proprietà delle potenze (stesso esponente)' }));
      }
    });
    return created;
  }

  function fracCand(x, i, reg) {
    if (x.num.operands.length !== 1 || x.den.operands.length !== 1) return;
    const X = powInfo(x.num.operands[0]);
    const Y = powInfo(x.den.operands[0]);
    if (!X || !Y || (X.isVal && Y.isVal) || X.base !== Y.base) return;
    const known = X.tokens && Y.tokens;
    if (known && X.m < Y.m) return;
    cover([X, Y].filter(z => !z.isVal).map(z => z.id), PROP_HINT.quot);
    if (!known) return;
    reg(mk({
      kind: 'fracSameBase', stage: 2, fracId: x.id, b1: X.base, m: X.m, n: Y.m, req: [...X.tokens, ...Y.tokens],
      covers: [X, Y].filter(z => !z.isVal).map(z => z.id),
      text: `${X.base}${X.isVal ? '' : sup(X.m)} / ${Y.base}${Y.isVal ? '' : sup(Y.m)}`, label: 'la proprietà delle potenze (stessa base)',
    }), i);
  }

  function powStuff(x, i, reg, nested) {
    const b = x.base;
    const e = x.exp;
    if (b.t === 'group') nested(walkSeq(b.inner), i);
    else if (!isReduced(b)) reg(mk({ kind: 'reduce', stage: 0, req: [b.id], valId: b.id, text: `${vt(b)} ridotta`, calc: () => R(b.n, b.d) }), i);
    nested(walkSeq(e), i);

    const eVal = A.singleVal(e);
    const bVal = b.t === 'val' ? b : (b.t === 'group' ? A.singleVal(b.inner) : null);
    const eInt = !!(eVal && eVal.d === 1 && eVal.n >= 0);
    const parens = b.t === 'group' ? [b.id + ':o', b.id + ':c'] : [];

    if (eInt && bVal) {
      reg(mk({
        kind: 'powEval', stage: 2, powId: x.id, req: [bVal.id, eVal.id], opt: parens,
        text: `${vt(bVal)}${sup(eVal.n)}`,
        calc: () => pw(R(bVal.n, bVal.d), eVal.n),
      }), i);
    }
    if (b.t !== 'group') return;
    if (bVal && bVal.d === 1) {
      reg(mk({ kind: 'unwrap', stage: 1, groupId: b.id, flip: false, req: [b.id + ':o', b.id + ':c'], text: 'le parentesi', label: UNWRAP_LABEL }), i);
    }
    const inner = b.inner;
    if (inner.operands.length === 1 && inner.operands[0].t === 'pow') {
      const q = inner.operands[0];
      const qb = q.base;
      const qe = A.singleVal(q.exp);
      if (qb.t === 'val' && qb.d === 1) {
        const qKnown = !!(qe && qe.d === 1);
        cover([x.id, q.id], PROP_HINT.pp);
        if (qKnown && eInt) {
          reg(mk({
            kind: 'powOfPow', stage: 1, powId: x.id, covers: [x.id, q.id],
            req: [qb.id, qe.id, eVal.id], opt: parens, text: `(${qb.n}${sup(qe.n)})${sup(eVal.n)}`,
            label: 'la proprietà delle potenze (potenza di potenza)',
          }), i);
        }
      }
    }
    if (eInt && inner.operands.length === 2 && (inner.ops[0].sym === '*' || inner.ops[0].sym === '/') &&
        inner.operands.every(v => v.t === 'val' && v.d === 1)) {
      const [va, vb] = inner.operands;
      reg(mk({
        kind: 'powOfProd', stage: 1, powId: x.id, sym: inner.ops[0].sym,
        req: [va.id, inner.ops[0].id, vb.id, eVal.id], opt: parens,
        text: `(${va.n} ${SYM_TXT[inner.ops[0].sym]} ${vb.n})${sup(eVal.n)}`,
        label: 'la proprietà delle potenze (potenza di un prodotto)',
      }), i);
    }
  }

  walkSeq(root);

  // le proprietà delle potenze vanno usate quando si può: il calcolo diretto delle potenze coinvolte si blocca
  if (forceProps) {
    all.forEach(c => {
      if (c.kind === 'powEval' && potCover.has(c.powId)) {
        c.ready = false;
        const msg = potCover.get(c.powId);
        c.why = { cat: 'proprieta', msg };
      }
    });
  }
  all.forEach(c => { if (!c.ready && !c.why && c.whyFn) c.why = c.whyFn(); });
  const ready = all.filter(c => c.ready);
  return { ready, all, tokWhy };
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

  for (const t of order) {
    const fn = an.tokWhy.get(t);
    if (fn) {
      const w = fn();
      return { ok: false, cat: w.cat, msg: `Quella non è ancora un'operazione che puoi svolgere. ${w.msg}` };
    }
  }
  return {
    ok: false, cat: 'selezione',
    msg: 'Per svolgere un\'operazione tocca tutti i suoi elementi: i numeri e il simbolo (+ − · :). Più operazioni si possono svolgere insieme, se sono separate.',
  };
}

/** descrizione per suggerimenti e dimostrazione */
export function describeOp(op) {
  switch (op.kind) {
    case 'unwrap': return op.flip
      ? 'Si tolgono le parentesi: davanti c\'è un meno, quindi i segni dentro cambiano.'
      : 'Si tolgono le parentesi, che contengono ormai un solo numero.';
    case 'reduce': return 'Si semplifica la frazione ai minimi termini.';
    case 'powEval': return `Potenze: ${op.text}`;
    case 'prodSameBase': return 'Proprietà delle potenze: stessa base, si sommano gli esponenti.';
    case 'quotSameBase': case 'fracSameBase': return 'Proprietà delle potenze: stessa base, si sottraggono gli esponenti.';
    case 'prodSameExp': return 'Proprietà delle potenze: stesso esponente, si moltiplicano le basi.';
    case 'quotSameExp': return 'Proprietà delle potenze: stesso esponente, si dividono le basi.';
    case 'powOfPow': return 'Proprietà delle potenze: potenza di potenza, si moltiplicano gli esponenti.';
    case 'powOfProd': return 'Proprietà delle potenze: l\'esponente va su ogni fattore.';
    default: return `${STAGE_NAMES[op.stage]}: ${op.text}`;
  }
}

export function isDone(root) {
  return root.operands.length === 1 && root.operands[0].t === 'val' && isReduced(root.operands[0]);
}
