// Piccole utilità per costruire il DOM.
export function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn);
    else if (k === 'style') e.style.cssText = v;
    else if (k === 'data') Object.assign(e.dataset, v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  kids.flat().forEach(c => { if (c !== null && c !== undefined && c !== false) e.append(c.nodeType ? c : document.createTextNode(c)); });
  return e;
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Tocco immediato: reagisce subito al contatto (anche con più dita sulla lavagna) invece di aspettare il «click».
 *  Il click da tastiera o da codice (detail 0) funziona comunque. */
export function tap(node, fn) {
  node.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    fn(e);
  });
  node.addEventListener('click', e => { if (e.detail === 0) fn(e); });
  return node;
}
