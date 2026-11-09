import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../js/engine/parse.js';
import { analyze, matchSelection, isDone } from '../js/engine/analyze.js';
import { applyOps } from '../js/engine/apply.js';
import { solve, validate } from '../js/engine/solve.js';
import { SEED } from '../js/data/seed.js';
import * as A from '../js/engine/ast.js';

const readyTexts = (src, cfg) => analyze(parse(src), cfg).ready.map(o => o.text).sort();
const tokensOf = (an, text) => an.all.find(o => o.text === text);

test('moltiplicazione prima della somma', () => {
  assert.deepEqual(readyTexts('3+2\\cdot4'), ['2 · 4']);
});
test('parentesi per prime', () => {
  assert.deepEqual(readyTexts('(8-2)\\cdot3+4'), ['8 − 2']);
});
test('da sinistra a destra', () => {
  assert.ok(readyTexts('20-3-2').includes('20 − 3'));
  assert.deepEqual(readyTexts('12:3\\cdot2+5'), ['12 : 3', '12 : 3 · 2']);
  assert.ok(!readyTexts('12:3\\cdot2+5').includes('3 · 2'));
});
const selTexts = (src, toks) => {
  const root = parse(src); const an = analyze(root);
  const ids = [];
  root.operands.forEach((v, k) => { ids.push(v.id); if (root.ops[k]) ids.push(root.ops[k].id); });
  return { root, an, ids, m: matchSelection(toks(root, an, ids), an) };
};
test('catena di somme e sottrazioni tutta insieme', () => {
  const { root, m } = selTexts('2+1-1', (r, an, ids) => ids);
  assert.ok(m.ok);
  const out = applyOps(root, m.ops);
  assert.equal(out.operands[0].n, 2);
  assert.equal(out.operands.length, 1);
});
test('anche «+1-1» in 2+1-1 si può fare', () => {
  const { root, m, ids } = selTexts('2+1-1', (r, an, ids) => ids.slice(1));
  assert.ok(m.ok, m.msg);
  const out = applyOps(root, m.ops);
  assert.deepEqual(out.operands.map(v => v.n), [2, 0]);
});
test('sottrazione: 10-3+2 selezionando 3+2 cambia il segno', () => {
  const { root, m } = selTexts('10-3+2', (r, an, ids) => ids.slice(1));
  assert.ok(m.ok, m.msg);
  const out = applyOps(root, m.ops);
  assert.deepEqual(out.operands.map(v => v.n), [10, 1]);
  const bad = selTexts('10-3+20', (r, an, ids) => ids.slice(1));
  assert.equal(bad.m.ok, false);
});
test('somma dentro parentesi con le parentesi selezionate', () => {
  const root = parse('(3+2)\\cdot4');
  const an = analyze(root);
  const g = root.operands[0];
  const sel = [...g.inner.operands.map(o => o.id), g.inner.ops[0].id, g.id + ':o', g.id + ':c'];
  const m = matchSelection(sel, an);
  assert.ok(m.ok, m.msg);
  const out = applyOps(root, m.ops);
  assert.equal(out.operands[0].t, 'val');
  assert.equal(out.operands[0].n, 5);
});
test('potenza e prodotto insieme', () => {
  assert.deepEqual(readyTexts('5^2-5\\cdot3'), ['5 · 3', '5²']);
  assert.deepEqual(readyTexts('1+2+3\\cdot4'), ['1 + 2', '3 · 4']);
  assert.deepEqual(readyTexts('(4+1)\\cdot2+3\\cdot5'), ['3 · 5', '4 + 1']);
});
test('potenza con parentesi come base', () => {
  const an = analyze(parse('(2)^3'));
  const sel = ['2', '3'].length && an.all.find(o => o.kind === 'powEval');
  assert.ok(sel);
  const m = matchSelection([...sel.req, ...sel.opt], an);
  assert.ok(m.ok);
});
test('proprietà obbligatorie in frazione', () => {
  const an = analyze(parse('\\frac{2^7}{2^5}'));
  assert.ok(an.ready.some(o => o.kind === 'fracSameBase'));
  assert.ok(!an.ready.some(o => o.kind === 'powEval'));
  const an2 = analyze(parse('\\frac{2^{4+3}}{2^5}'));
  assert.ok(!an2.ready.some(o => o.kind === 'powEval' && o.text === '2⁵'));
  assert.ok(an2.ready.some(o => o.text === '4 + 3'));
  const off = analyze(parse('2^3\\cdot2^4'), { forceProps: false });
  assert.ok(off.ready.some(o => o.kind === 'powEval'));
});
test('catene indipendenti insieme', () => {
  assert.deepEqual(readyTexts('2+3\\cdot4+5\\cdot6'), ['3 · 4', '5 · 6']);
});
test('potenze prima di moltiplicazioni', () => {
  assert.deepEqual(readyTexts('2\\cdot3^2+4^2'), ['3²', '4²']);
});
test('togliere le parentesi con cambio segno è un passaggio', () => {
  const t = readyTexts('10-(3+2)');
  assert.ok(t.includes('3 + 2'));
  assert.ok(t.includes('le parentesi (cambiando i segni)'));
  const root = parse('10-(3+2)');
  const an = analyze(root);
  const op = an.ready.find(o => o.kind === 'unwrap');
  const r = applyOps(root, [op]);
  assert.equal(r.ops.map(o => o.sym).join(''), '--');
});
test('parentesi con un solo numero: va tolta dall\'utente', () => {
  const root = parse('(8-2)\\cdot3');
  const r1 = applyOps(root, analyze(root).ready);
  const an = analyze(r1);
  assert.deepEqual(an.ready.map(o => o.kind), ['unwrap']);
  const r2 = applyOps(r1, an.ready);
  assert.equal(analyze(r2).ready[0].text, '6 · 3');
});
test('selezione valida e errori con spiegazione', () => {
  const root = parse('3+2\\cdot4');
  const an = analyze(root);
  const good = an.ready[0];
  assert.ok(matchSelection(good.req, an).ok);
  const wrong = tokensOf(an, '3 + 2');
  const m = matchSelection(wrong.req, an);
  assert.equal(m.ok, false);
  assert.equal(m.cat, 'moltdiv');
  assert.match(m.msg, /2 · 4/);
  assert.equal(matchSelection([], an).empty, true);
  assert.equal(matchSelection([good.req[0]], an).ok, false); // incompleta
});
test('più operazioni insieme', () => {
  const root = parse('2+3\\cdot4+5\\cdot6');
  const an = analyze(root);
  const sel = an.ready.flatMap(o => o.req);
  const m = matchSelection(sel, an);
  assert.ok(m.ok);
  assert.equal(m.ops.length, 2);
});
test('proprietà delle potenze', () => {
  const root = parse('2^3\\cdot2^4');
  const an = analyze(root);
  const prop = an.ready.find(o => o.kind === 'prodSameBase');
  assert.ok(prop);
  const r = applyOps(root, [prop]);
  assert.equal(analyze(r).ready[0].text, '3 + 4');
});
test('frazioni', () => {
  const s = solve(parse('\\frac{1}{2}+\\frac{1}{3}'));
  const last = s.states.at(-1).operands[0];
  assert.deepEqual([last.n, last.d], [5, 6]);
});
test('tutte le espressioni del database sono valide', () => {
  for (const e of SEED) {
    const v = validate(e.latex, e.level);
    assert.ok(v.ok, `${e.id} ${e.latex}: ${v.errors.join(' ')}`);
  }
});
test('nessuna selezione casuale porta al blocco: ogni stato non finito ha operazioni pronte', () => {
  for (const e of SEED) {
    let cur = parse(e.latex);
    for (let i = 0; i < 100 && !isDone(cur); i++) {
      const an = analyze(cur);
      assert.ok(an.ready.length > 0, e.latex);
      const op = an.ready[Math.floor(Math.random() * an.ready.length)];
      cur = applyOps(cur, [op]);
    }
    assert.ok(isDone(cur), e.latex);
  }
});
test('parser: errori comprensibili', () => {
  assert.equal(validate('3+', 1).ok, false);
  assert.equal(validate('2,5+1', 1).ok, false);
  assert.equal(validate('3-5', 1).ok, false); // negativo
  assert.equal(validate('(1+2', 1).ok, false);
});
test('modalità errori: la riga sbagliata è diversa da quella giusta', async () => {
  const { corrupt } = await import('../js/engine/mistake.js');
  let made = 0;
  for (const e of SEED) {
    let cur = parse(e.latex);
    for (let i = 0; i < 40 && !isDone(cur); i++) {
      const an = analyze(cur);
      const ops = [an.ready[Math.floor(Math.random() * an.ready.length)]];
      const nxt = applyOps(cur, ops);
      const bad = corrupt(cur, nxt, ops);
      if (bad) {
        made++;
        assert.notEqual(JSON.stringify(bad, (k, v) => (k === 'id' ? undefined : v)), JSON.stringify(nxt, (k, v) => (k === 'id' ? undefined : v)));
      }
      cur = nxt;
    }
  }
  assert.ok(made > 50);
});
