// Albero dell'espressione.
//  seq   : { operands:[nodo], ops:[{id,sym}] }   sym: + - * / imp
//  val   : { n, d }        numero (razionale)
//  group : { br:'('|'['|'{', inner:seq }
//  pow   : { base: val|group, exp: seq }
//  frac  : { num:seq, den:seq }   (frazione con operazioni dentro)
let counter = 0;
export const uid = () => 'n' + (++counter);
export const mkVal = (n, d = 1) => ({ t: 'val', id: uid(), n, d });
export const mkGroup = (br, inner) => ({ t: 'group', id: uid(), br, inner });
export const mkPow = (base, exp) => ({ t: 'pow', id: uid(), base, exp });
export const mkFrac = (num, den) => ({ t: 'frac', id: uid(), num, den });
export const mkOp = sym => ({ id: uid(), sym });
export const mkSeq = (operands, ops = []) => ({ t: 'seq', id: uid(), operands, ops });
export const seqOf = v => mkSeq([v]);
export const clone = o => structuredClone(o);

export function singleVal(seq) {
  return seq.operands.length === 1 && seq.operands[0].t === 'val' ? seq.operands[0] : null;
}

export function walk(node, fn, parent = null, slot = null) {
  fn(node, parent, slot);
  switch (node.t) {
    case 'seq': node.operands.forEach((o, i) => walk(o, fn, node, i)); break;
    case 'group': walk(node.inner, fn, node, 'inner'); break;
    case 'pow': walk(node.base, fn, node, 'base'); walk(node.exp, fn, node, 'exp'); break;
    case 'frac': walk(node.num, fn, node, 'num'); walk(node.den, fn, node, 'den'); break;
    default: break;
  }
}

export function find(root, id) {
  let res = null;
  walk(root, (n, parent, slot) => { if (!res && n.id === id) res = { node: n, parent, slot }; });
  return res;
}

export function replaceNode(root, id, repl) {
  const f = find(root, id);
  if (!f || !f.parent) return false;
  if (f.parent.t === 'seq') f.parent.operands[f.slot] = repl; else f.parent[f.slot] = repl;
  return true;
}

export function findOperand(root, id) {
  let res = null;
  walk(root, n => {
    if (!res && n.t === 'seq') {
      const i = n.operands.findIndex(o => o.id === id);
      if (i >= 0) res = { seq: n, i };
    }
  });
  return res;
}
