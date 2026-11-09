import { el } from './dom.js';
import { LEVELS, topbar, openModal } from './chrome.js';
import { allExpressions, addCustom, removeExpression, restoreSeeds, exportJSON, importJSON, engineCfg, getSettings, setSettings, hiddenCount } from '../data/store.js';
import { validate } from '../engine/solve.js';
import { parse } from '../engine/parse.js';
import { renderExpr } from './render.js';

export function mount(root) {
  let level = getSettings().level;
  const listEl = el('div', { class: 'dblist' });
  const tabs = el('div', { class: 'chips' });
  const help = el('details', { class: 'dbhelp' }, el('summary', { text: 'Come si scrive in LaTeX' }),
    el('ul', {},
      el('li', {}, el('code', { text: '\\cdot' }), ' moltiplicazione, ', el('code', { text: ':' }), ' divisione'),
      el('li', {}, el('code', { text: '\\frac{3}{4}' }), ' frazione, anche con operazioni: ', el('code', { text: '\\frac{2+4}{3\\cdot2}' })),
      el('li', {}, el('code', { text: '2^3' }), ' o ', el('code', { text: '2^{3}' }), ' potenza; ', el('code', { text: '(2+1)^2' }), ' potenza di una parentesi'),
      el('li', {}, el('code', { text: '( )' }), ' ', el('code', { text: '[ ]' }), ' ', el('code', { text: '\\{ \\}' }), ' parentesi tonde, quadre, graffe; ', el('code', { text: '\\left( \\right)' }), ' va bene'),
      el('li', { text: 'Solo numeri naturali: niente numeri negativi né decimali. Ogni passaggio deve dare un risultato non negativo.' })));

  const area = el('textarea', { class: 'latex-in', rows: '2', placeholder: '\\frac{1}{2}+3\\cdot(4-1)^2', 'aria-label': 'Espressione in LaTeX', spellcheck: 'false' });
  const sel = el('select', { class: 'sel', 'aria-label': 'Livello' }, LEVELS.map(l => el('option', { value: l.n, text: `${l.n} · ${l.name}` })));
  const prev = el('div', { class: 'preview', 'aria-live': 'polite' });
  const msgs = el('ul', { class: 'vmsg' });
  const addBtn = el('button', { class: 'btn primary', type: 'button', text: 'Aggiungi al livello', disabled: true });
  sel.value = level;

  const check = () => {
    const src = area.value.trim();
    prev.replaceChildren(); msgs.replaceChildren(); addBtn.disabled = true;
    if (!src) return;
    const v = validate(src, +sel.value, engineCfg());
    if (v.ast) prev.append(renderExpr(parse(src), { plain: true, colors: getSettings().priorityColors }));
    v.errors.forEach(e => msgs.append(el('li', { class: 'bad', text: e })));
    v.warnings.forEach(e => msgs.append(el('li', { class: 'warn', text: e })));
    if (v.ok) {
      msgs.append(el('li', { class: 'good', text: `Valida: ${v.steps} passaggi, risultato ${v.value}.` }));
      addBtn.disabled = false;
    }
  };
  area.addEventListener('input', check);
  sel.addEventListener('change', check);
  addBtn.addEventListener('click', () => {
    addCustom(area.value.trim(), +sel.value);
    level = +sel.value; area.value = ''; check(); paint();
  });

  function paint() {
    tabs.replaceChildren(...LEVELS.map(l => el('button', {
      class: 'chip lv' + (l.n === level ? ' on' : ''), type: 'button', role: 'radio', 'aria-checked': l.n === level,
      on: { click: () => { level = l.n; setSettings({ level }); sel.value = level; paint(); check(); } },
    }, el('b', { text: l.n }), el('span', { text: `${l.name} · ${allExpressions(l.n).length}` }))));
    const rows = allExpressions(level);
    listEl.replaceChildren(...(rows.length ? rows.map(e => {
      const v = validate(e.latex, e.level, engineCfg());
      let expr = null;
      try { expr = renderExpr(parse(e.latex), { plain: true, colors: false }); } catch (err) { expr = el('span', { text: '—' }); }
      return el('div', { class: 'dbrow' + (v.ok ? '' : ' invalid') },
        el('div', { class: 'dbexpr' }, expr),
        el('code', { class: 'dbcode', text: e.latex }),
        el('span', { class: 'pill', text: v.ok ? `${v.steps} passaggi · = ${v.value}` : v.errors[0] }),
        el('span', { class: 'tagpill', text: e.seed ? 'di serie' : 'tua' }),
        el('button', { class: 'btn ghost icon', type: 'button', 'aria-label': 'Rimuovi', title: e.seed ? 'Nascondi' : 'Elimina', text: '🗑', on: { click: () => { removeExpression(e.id); paint(); } } }));
    }) : [el('p', { class: 'empty', text: 'Nessuna espressione in questo livello. Scrivine una qui sopra.' })]));
  }

  const fileIn = el('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files[0]; if (!f) return;
    try {
      const r = importJSON(await f.text());
      openModal('Importazione', el('p', { text: `Aggiunte ${r.added} espressioni. Scartate ${r.skipped} (già presenti o non valide).` }));
      paint();
    } catch (e) { openModal('Importazione', el('p', { text: 'Il file non è valido: ' + e.message })); }
    fileIn.value = '';
  });
  const download = () => {
    const a = el('a', { href: URL.createObjectURL(new Blob([exportJSON()], { type: 'application/json' })), download: 'espressioni.json' });
    document.body.append(a); a.click(); a.remove();
  };

  root.append(el('div', { class: 'screen db' }, topbar({ title: 'Database di espressioni', levels: false, calc: false }),
    el('main', { class: 'db-main' },
      el('section', { class: 'dbadd' },
        el('h2', { text: 'Aggiungi un\'espressione' }),
        el('div', { class: 'dbform' }, area, sel, addBtn), help, prev, msgs),
      el('section', {},
        tabs,
        listEl,
        el('div', { class: 'dbio' },
          el('button', { class: 'btn ghost', type: 'button', text: 'Esporta (JSON)', on: { click: download } }),
          el('button', { class: 'btn ghost', type: 'button', text: 'Importa (JSON)', on: { click: () => fileIn.click() } }),
          fileIn,
          el('button', { class: 'btn ghost', type: 'button', text: 'Ripristina quelle di serie nascoste', on: { click: () => { restoreSeeds(); paint(); } } }),
          el('small', { text: 'Le espressioni che aggiungi restano salvate in questo browser: per usarle su un altro dispositivo esportale e importale.' }))))));
  paint();
  return () => {};
}
