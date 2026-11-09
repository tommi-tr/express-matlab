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

  function walkSeq(sq, parentGroup = null) {
    const { operands, ops } = sq;
    const created = [];
    const innerC = operands.map(() => []);
    const reg = (c, i) => { created.push(c); if (i !== undefined) innerC[i].push(c); return c; };
    const nested = (r, i) => { created.push(...r); innerC[i].push(...r); };

    operands.forEach((x, i) => {
      if (x.t === 'val') {
        if (!isReduced(x)) reg(mk({ kind: 'reduce', stage: 0, req: [x.id], valId: x.id, text: `${vt(x)} ridotta`, calc: () => R(x.n, x.d) }), i);
      } else if (x.t === 'group') {
        nested(walkSeq(x.inner, x), i);
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

    // ---- operazioni tra numeri (anche catene: 2 + 1 − 1, oppure «+ 1 − 1» dentro 2 + 1 − 1) ----
    const isAdd = x => x === '+' || x === '-';
    const inv = x => (x === '+' ? '-' : x === '-' ? '+' : (x === '/' ? '*' : '/'));
    const norm = x => (x === 'imp' ? '*' : x);
    const allInt = vs => vs.every(v => v.d === 1);
    const bin1 = ops.map(() => null);
    const specs = [];
    for (let i = 0; i < operands.length; i++) {
      if (operands[i].t !== 'val') continue;
      for (let j = i + 1; j < operands.length && operands[j].t === 'val'; j++) {
        const seg = ops.slice(i, j);
        const add = isAdd(seg[0].sym);
        if (!seg.every(o => isAdd(o.sym) === add)) break;
        specs.push({ i, j, isA: add });
      }
    }
    specs.sort((x, y) => (y.j - y.i) - (x.j - x.i));
    const made = [];
    for (const { i, j, isA } of specs) {
      const count = j - i;
      const seg = ops.slice(i, j);
      const vals = operands.slice(i, j + 1);
      const prev = i > 0 ? ops[i - 1] : null;
      const next = j < ops.length ? ops[j] : null;
      const flip = !!prev && (isA ? prev.sym === '-' : prev.sym === '/');
      const syms = seg.map(o => (flip ? inv(norm(o.sym)) : norm(o.sym)));
      let r = null;
      let neg = false;
      try {
        r = R(vals[0].n, vals[0].d);
        for (let m = 0; m < syms.length; m++) {
          const v = R(vals[m + 1].n, vals[m + 1].d);
          r = syms[m] === '+' ? add(r, v) : syms[m] === '-' ? sub(r, v) : syms[m] === '*' ? mul(r, v) : div(r, v);
          if (r.n < 0) { neg = true; break; }
        }
      } catch (e) { r = null; }
      if (!r && !neg) continue;
      const c = {
        kind: 'bin', stage: isA ? 4 : 3, leftId: vals[0].id, count, flip, sym: seg[0].sym, opId: seg[0].id,
        canon: count === 1 && !flip && (isA ? i === 0 : (i === 0 || isAdd(prev.sym))),
        req: [], opt: [], i, j,
        text: vals.map((v, m) => (m ? `${SYM_TXT[seg[m - 1].sym]} ` : '') + vt(v)).join(' '),
        calc: () => r,
      };
      c.req = [vals[0].id, ...vals.slice(1).flatMap((v, m) => (seg[m].sym === 'imp' ? [v.id] : [seg[m].id, v.id]))];
      if (prev) c.opt.push(prev.id);
      if (parentGroup && i === 0 && j === operands.length - 1) {
        c.opt.push(parentGroup.id + ':o', parentGroup.id + ':c');
        c.unwrapGroup = parentGroup.id;
      }
      let why = null;
      if (neg) why = { cat: 'segni', msg: 'Così uscirebbe un numero negativo: nei numeri naturali non si può togliere un numero più grande.' };
      else if (isA) {
        if (prev && mulish(prev)) why = { cat: 'moltdiv', side: 'L' };
        else if (next && mulish(next)) why = { cat: 'moltdiv', side: 'R' };
        else if (flip || i > 0 || count > 1) {
          const ops2 = [...ops.slice(0, i), ...ops.slice(j)];
          const op2 = [...operands.slice(0, i), { t: 'val', n: r.n, d: r.d }, ...operands.slice(j + 1)];
          if (!partialsOK(op2, ops2)) why = { cat: 'segni', msg: 'Così uscirebbe un numero negativo: nei numeri naturali non si può togliere un numero più grande.' };
        }
      } else if (i > 0 && mulish(prev) && r.d !== 1 && allInt(vals)) {
        why = { cat: 'ordine', side: 'L' };
      }
      if (why) {
        if (count > 1) continue;
        c.ready = false;
        c.whyInfo = why;
      }
      const cand = mk(c);
      made.push(cand);
      if (count === 1) bin1[i] = cand;
      reg(cand, undefined);
    }
    const firstReady = jj => innerC[jj].find(z => z.ready) || null;
    const pendingKind = x => (x.t === 'pow' ? 'potenze' : 'parentesi');
    made.forEach(c => {
      if (c.ready || !c.whyInfo) return;
      const w = c.whyInfo;
      if (w.msg) { c.why = { cat: w.cat, msg: w.msg }; return; }
      c.whyFn = () => {
        if (w.cat === 'ordine') return mkWhy('ordine', bin1[c.i - 1] || firstReady(c.i - 1) || firstReady(c.i));
        const k = w.side === 'R' ? c.j : c.i - 1; // operatore moltiplicativo adiacente
        const other = w.side === 'R' ? operands[c.j + 1] : operands[c.i - 1];
        if (other.t === 'val') return mkWhy('moltdiv', bin1[k]);
        return mkWhy(pendingKind(other), firstReady(w.side === 'R' ? c.j + 1 : c.i - 1));
      };
    });
    ops.forEach((o, k) => {
      if (bin1[k]) return;
      const j = operands[k].t === 'val' ? k + 1 : k;
      const cat = pendingKind(operands[j]);
      tokWhy.set(o.id, () => mkWhy(cat, firstReady(j)));
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
    if (b.t === 'group') nested(walkSeq(b.inner, b), i);
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
        if (c.unwrapGroup && !(S.has(c.unwrapGroup + ':o') && S.has(c.unwrapGroup + ':c')) && opt.some(x => x.startsWith(c.unwrapGroup + ':'))) continue;
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
  const flagged = list => list.map(c => (c.unwrapGroup && S.has(c.unwrapGroup + ':o') && S.has(c.unwrapGroup + ':c') ? { ...c, withUnwrap: true } : c));
  const okCover = run(an.all.filter(c => c.ready));
  if (okCover) return { ok: true, ops: flagged(okCover) };

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
