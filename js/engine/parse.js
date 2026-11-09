// Parser di un sottoinsieme di LaTeX: numeri, + - \cdot \times : \div, \frac{}{}, ^{}, ( ) [ ] \{ \}
import * as A from './ast.js';
import { normalize } from './apply.js';

export class ParseError extends Error {}

function tokenize(src) {
  const t = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/\d/.test(c)) {
      let j = i;
      while (j < src.length && /\d/.test(src[j])) j++;
      if ((src[j] === ',' || src[j] === '.') && /\d/.test(src[j + 1] || '')) {
        throw new ParseError('I numeri decimali non sono supportati: usa le frazioni.');
      }
      if (j - i > 6) throw new ParseError('Numero troppo grande.');
      t.push({ k: 'num', v: parseInt(src.slice(i, j), 10) });
      i = j;
      continue;
    }
    if (c === '\\') {
      const m = /^\\([a-zA-Z]+|.)/.exec(src.slice(i));
      if (!m) throw new ParseError('Comando LaTeX incompleto.');
      const name = m[1];
      i += m[0].length;
      switch (name) {
        case 'cdot': case 'times': t.push({ k: 'op', v: '*' }); break;
        case 'div': t.push({ k: 'op', v: '/' }); break;
        case 'frac': case 'dfrac': case 'tfrac': t.push({ k: 'frac' }); break;
        case 'left': case 'right': case 'bigl': case 'bigr': case 'Bigl': case 'Bigr':
        case 'big': case 'Big': case ',': case ';': case '!': case ' ': case ':': case 'quad': case 'qquad':
          break;
        case '{': case 'lbrace': t.push({ k: 'open', v: '{' }); break;
        case '}': case 'rbrace': t.push({ k: 'close', v: '{' }); break;
        case 'lbrack': t.push({ k: 'open', v: '[' }); break;
        case 'rbrack': t.push({ k: 'close', v: '[' }); break;
        default: throw new ParseError(`Comando LaTeX non supportato: \\${name}`);
      }
      continue;
    }
    switch (c) {
      case '+': t.push({ k: 'op', v: '+' }); break;
      case '-': case '−': case '–': t.push({ k: 'op', v: '-' }); break;
      case '*': case '·': case '×': t.push({ k: 'op', v: '*' }); break;
      case ':': case '÷': case '/': t.push({ k: 'op', v: '/' }); break;
      case '(': t.push({ k: 'open', v: '(' }); break;
      case ')': t.push({ k: 'close', v: '(' }); break;
      case '[': t.push({ k: 'open', v: '[' }); break;
      case ']': t.push({ k: 'close', v: '[' }); break;
      case '^': t.push({ k: 'pow' }); break;
      case '{': t.push({ k: 'lb' }); break;
      case '}': t.push({ k: 'rb' }); break;
      default: throw new ParseError(`Carattere non supportato: «${c}»`);
    }
    i++;
  }
  return t;
}

export function parse(src) {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];
  const groupish = n => n.t === 'group' || (n.t === 'pow' && n.base.t === 'group');

  function parseSeq() {
    const operands = [parseOperand()];
    const ops = [];
    for (;;) {
      const t = peek();
      if (!t || t.k === 'close' || t.k === 'rb') break;
      if (t.k === 'op') {
        next();
        ops.push(A.mkOp(t.v));
        operands.push(parseOperand());
        continue;
      }
      const last = operands[operands.length - 1];
      if (t.k === 'open' || (groupish(last) && (t.k === 'num' || t.k === 'frac'))) {
        ops.push(A.mkOp('imp'));
        operands.push(parseOperand());
        continue;
      }
      throw new ParseError('Manca un operatore tra due numeri.');
    }
    return A.mkSeq(operands, ops);
  }

  function parseBraced() {
    const o = next();
    if (!o || o.k !== 'lb') throw new ParseError('Dopo \\frac servono due gruppi {…}{…}.');
    const s = parseSeq();
    const c = next();
    if (!c || c.k !== 'rb') throw new ParseError('Parentesi graffa } mancante.');
    return s;
  }

  function parseOperand() {
    const t = next();
    if (!t) throw new ParseError('Espressione incompleta.');
    if (t.k === 'op') throw new ParseError('Segni iniziali o numeri negativi non sono supportati.');
    let node;
    if (t.k === 'num') node = A.mkVal(t.v);
    else if (t.k === 'open') {
      const inner = parseSeq();
      const c = next();
      if (!c || c.k !== 'close' || c.v !== t.v) throw new ParseError('Parentesi non chiusa o di tipo diverso.');
      node = A.mkGroup(t.v, inner);
    } else if (t.k === 'frac') {
      const num = parseBraced();
      const den = parseBraced();
      const a = A.singleVal(num);
      const b = A.singleVal(den);
      if (a && b && a.d === 1 && b.d === 1) {
        if (b.n === 0) throw new ParseError('Denominatore uguale a zero.');
        node = A.mkVal(a.n, b.n);
      } else node = A.mkFrac(num, den);
    } else throw new ParseError('Mi aspettavo un numero o una parentesi.');

    if (peek() && peek().k === 'pow') {
      next();
      if (!(node.t === 'val' && node.d === 1) && node.t !== 'group') {
        throw new ParseError('La base di una potenza deve essere un numero o una parentesi.');
      }
      let exp;
      if (peek() && peek().k === 'lb') {
        next();
        exp = parseSeq();
        const c = next();
        if (!c || c.k !== 'rb') throw new ParseError('Parentesi graffa } mancante.');
      } else if (peek() && peek().k === 'num') {
        exp = A.seqOf(A.mkVal(next().v));
      } else throw new ParseError('Esponente mancante.');
      node = A.mkPow(node, exp);
      if (peek() && peek().k === 'pow') throw new ParseError('Doppio esponente: usa le parentesi.');
    }
    return node;
  }

  if (!toks.length) throw new ParseError('Scrivi un\'espressione.');
  const root = parseSeq();
  if (p < toks.length) throw new ParseError('Parentesi chiusa in eccesso.');
  return normalize(root);
}

/** Funzioni di utilità per ispezionare le caratteristiche di un'espressione */
export function features(root) {
  const f = { groups: 0, brackets: new Set(), pows: 0, fracs: 0, maxDepth: 0, ops: new Set() };
  const rec = (n, d) => {
    f.maxDepth = Math.max(f.maxDepth, d);
    if (n.t === 'seq') { n.ops.forEach(o => f.ops.add(o.sym)); n.operands.forEach(o => rec(o, d)); }
    else if (n.t === 'group') { f.groups++; f.brackets.add(n.br); rec(n.inner, d + 1); }
    else if (n.t === 'pow') { f.pows++; rec(n.base, d); rec(n.exp, d); }
    else if (n.t === 'frac') { f.fracs++; rec(n.num, d + 1); rec(n.den, d + 1); }
    else if (n.t === 'val' && n.d !== 1) f.fracs++;
  };
  rec(root, 0);
  return f;
}
