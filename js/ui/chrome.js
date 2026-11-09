// Elementi comuni: barra in alto, finestre (impostazioni, schema), livelli.
import { el } from './dom.js';
import { getSettings, setSettings, resetSettings } from '../data/store.js';
import { parse } from '../engine/parse.js';
import { renderExpr } from './render.js';

export const LEVELS = [
  { n: 1, name: 'Base', desc: 'Numeri naturali con + − · : e senza parentesi' },
  { n: 2, name: 'Parentesi', desc: 'Parentesi tonde, anche una dentro l\'altra' },
  { n: 3, name: 'Avanzato', desc: 'Tonde, quadre e graffe, potenze e qualche frazione' },
  { n: 4, name: 'Esperto', desc: 'Più frazioni e proprietà delle potenze' },
];

export function levelChips(onChange) {
  const wrap = el('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Livello di difficoltà' });
  const paint = () => [...wrap.children].forEach((b, i) => {
    const on = getSettings().level === i + 1;
    b.setAttribute('aria-checked', on);
    b.classList.toggle('on', on);
  });
  LEVELS.forEach(l => wrap.append(el('button', {
    class: 'chip lv', type: 'button', role: 'radio', title: l.desc,
    on: { click: () => { setSettings({ level: l.n }); paint(); onChange && onChange(l.n); } },
  }, el('b', { text: l.n }), el('span', { text: l.name }))));
  paint();
  return wrap;
}

export function calcToggle() {
  const b = el('button', { class: 'chip tog', type: 'button', role: 'switch', title: 'Scrivi tu i risultati delle operazioni' }, el('i', { class: 'knob' }), el('span', { text: 'Calcoli' }));
  const paint = () => { const on = getSettings().calc; b.setAttribute('aria-checked', on); b.classList.toggle('on', on); };
  b.addEventListener('click', () => setSettings({ calc: !getSettings().calc }));
  document.addEventListener('settings', paint);
  paint();
  return b;
}

export function errToggle() {
  const b = el('button', { class: 'chip tog', type: 'button', role: 'switch', title: 'Ogni tanto compare un errore: riconoscilo e correggilo' }, el('i', { class: 'knob' }), el('span', { text: 'Errori' }));
  const paint = () => { const on = getSettings().errorMode; b.setAttribute('aria-checked', on); b.classList.toggle('on', on); };
  b.addEventListener('click', () => setSettings({ errorMode: !getSettings().errorMode }));
  document.addEventListener('settings', paint);
  paint();
  return b;
}

export function fullscreenBtn() {
  if (!document.fullscreenEnabled) return null;
  const b = el('button', { class: 'btn ghost icon fsbtn', type: 'button', 'aria-label': 'Schermo intero', title: 'Schermo intero', html: '⛶' });
  const upd = () => { const on = !!document.fullscreenElement; b.setAttribute('aria-pressed', on); b.title = on ? 'Esci dallo schermo intero' : 'Schermo intero'; b.classList.toggle('active', on); };
  b.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  });
  document.addEventListener('fullscreenchange', upd);
  upd();
  return b;
}

export function topbar({ title, levels = true, calc = true, onLevel, back = true }) {
  const bar = el('header', { class: 'topbar' },
    back ? el('a', { class: 'btn ghost back', href: '#/', 'aria-label': 'Torna alla home' }, '‹ Home') : null,
    el('h1', { class: 'ttl', text: title }),
    el('div', { class: 'spacer' }),
    levels ? levelChips(onLevel) : null,
    calc ? calcToggle() : null,
    calc ? errToggle() : null,
    el('button', { class: 'btn ghost', type: 'button', text: 'Schema', on: { click: () => openSchema() } }),
    fullscreenBtn(),
    el('button', { class: 'btn ghost icon', type: 'button', 'aria-label': 'Impostazioni', title: 'Impostazioni', html: '⚙', on: { click: () => openSettings() } }));
  return bar;
}

// ---------- finestre ----------
export function openModal(title, content, { wide = false, onClose } = {}) {
  const prevFocus = document.activeElement;
  const close = () => {
    document.removeEventListener('keydown', onKey);
    back.remove();
    prevFocus && prevFocus.focus && prevFocus.focus();
    onClose && onClose();
  };
  const onKey = e => { if (e.key === 'Escape') close(); };
  const box = el('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    el('div', { class: 'modal-head' }, el('h2', { text: title }), el('button', { class: 'btn ghost icon', type: 'button', 'aria-label': 'Chiudi', text: '✕', on: { click: close } })),
    el('div', { class: 'modal-body' }, content));
  const back = el('div', { class: 'backdrop', on: { click: e => { if (e.target === back) close(); } } }, box);
  document.body.append(back);
  document.addEventListener('keydown', onKey);
  box.querySelector('button')?.focus();
  return { close };
}

// ---------- schema delle priorità ----------
const STEPS = [
  { cls: 'par', sym: '( )  [ ]  { }', name: 'Parentesi', note: 'Prima le tonde più interne, poi le quadre, poi le graffe. Una frazione si comporta come una parentesi: prima numeratore e denominatore.' },
  { cls: 'pow', sym: 'aⁿ', name: 'Potenze', note: 'Prima di moltiplicare, dividere, sommare o sottrarre.' },
  { cls: 'mul', sym: '·   :', name: 'Moltiplicazioni e divisioni', note: 'Hanno la stessa priorità: si fanno da sinistra a destra, come si leggono.' },
  { cls: 'add', sym: '+   −', name: 'Addizioni e sottrazioni', note: 'Anche queste hanno la stessa priorità: da sinistra a destra.' },
];

export function schemaView({ example = true } = {}) {
  const stairs = el('ol', { class: 'stairs' }, STEPS.map((s, i) =>
    el('li', { class: `step ${s.cls}`, style: `--i:${i}` },
      el('span', { class: 'sn', text: i + 1 }),
      el('span', { class: 'ssym', text: s.sym }),
      el('span', { class: 'stxt' }, el('b', { text: s.name }), el('span', { text: s.note })))));
  const wrap = el('div', { class: 'schema' }, stairs);
  if (example) {
    const root = parse('20-[3\\cdot(4+1)^2]:5');
    wrap.append(el('div', { class: 'schema-ex' },
      el('span', { class: 'cap', text: 'Esempio: i colori ricordano la priorità' }),
      renderExpr(root, { plain: true, colors: true })));
  }
  return wrap;
}
export function openSchema() { return openModal('Ordine delle operazioni', schemaView(), { wide: true }); }

// ---------- impostazioni ----------
function seg(key, options, fmt = v => v) {
  const wrap = el('div', { class: 'seg', role: 'radiogroup' });
  const paint = () => [...wrap.children].forEach((b, i) => {
    const on = getSettings()[key] === options[i][0];
    b.setAttribute('aria-checked', on); b.classList.toggle('on', on);
  });
  options.forEach(([v, label]) => wrap.append(el('button', { class: 'segb', type: 'button', role: 'radio', text: fmt(label), on: { click: () => { setSettings({ [key]: v }); paint(); } } })));
  paint();
  return wrap;
}
function toggle(key) {
  const b = el('button', { class: 'switch', type: 'button', role: 'switch' }, el('i'));
  const paint = () => { const on = !!getSettings()[key]; b.setAttribute('aria-checked', on); b.classList.toggle('on', on); };
  b.addEventListener('click', () => { setSettings({ [key]: !getSettings()[key] }); paint(); });
  paint();
  return b;
}
function stepper(key, min, max, step = 1, unit = '', fmt = v => v) {
  const val = el('output', { class: 'sv' });
  const paint = () => { val.textContent = fmt(getSettings()[key]) + unit; };
  const bump = d => { const v = Math.min(max, Math.max(min, Math.round((getSettings()[key] + d) * 100) / 100)); setSettings({ [key]: v }); paint(); };
  paint();
  return el('div', { class: 'stepper' },
    el('button', { class: 'btn ghost icon', type: 'button', 'aria-label': 'Diminuisci', text: '−', on: { click: () => bump(-step) } }), val,
    el('button', { class: 'btn ghost icon', type: 'button', 'aria-label': 'Aumenta', text: '+', on: { click: () => bump(step) } }));
}
function text(key) {
  return el('input', { class: 'txt', type: 'text', maxlength: '18', value: getSettings()[key], on: { input: e => setSettings({ [key]: e.target.value || (key === 'p1' ? 'Giocatore 1' : 'Giocatore 2') }) } });
}
const row = (label, ctl, hint) => el('div', { class: 'srow' }, el('div', { class: 'slab' }, el('b', { text: label }), hint ? el('small', { text: hint }) : null), ctl);
const sect = (t, ...rows) => el('section', { class: 'ssec' }, el('h3', { text: t }), ...rows);

export function openSettings() {
  const body = el('div', { class: 'settings' },
    sect('Svolgimento',
      row('Errori da trovare', toggle('errorMode'), 'Ogni tanto compare un passaggio sbagliato: va riconosciuto e corretto con il pulsante «C\'è un errore» prima di proseguire.'),
      row('Calcoli', toggle('calc'), 'Scrivi tu il risultato di ogni operazione. Spento: li calcola il sito.'),
      row('Velocità di scrittura', seg('writeSpeed', [[0, 'Subito'], [35, 'Veloce'], [80, 'Normale'], [150, 'Lenta']]), 'Quanto in fretta compare la nuova espressione.'),
      row('Togliere le parentesi cambiando i segni', toggle('signUnwrap'), 'Permette di eliminare una parentesi con somme e sottrazioni dentro (10 − (3 + 2) → 10 − 3 − 2).'),
      row('Togliere automaticamente le parentesi', toggle('autoUnwrap'), 'Le parentesi che racchiudono un solo numero spariscono da sole, senza doverle selezionare.'),
      row('Proprietà delle potenze obbligatorie', toggle('forceProps'), 'Dove si può usare una proprietà (2⁷ : 2⁵, 3² · 3⁴…) bisogna usarla, non calcolare le potenze.'),
      row('Colori delle priorità', toggle('priorityColors'), 'Colora parentesi, potenze, × ÷ e + − come nello schema.'),
      row('Suggerimenti', toggle('hints'), 'Mostra il pulsante Suggerimento in Esercitati.'),
      row('Passaggi precedenti', toggle('showHistory'), 'Lascia visibili le righe già svolte.')),
    sect('Esercitati', row('Espressioni per sessione', stepper('perSession', 3, 15))),
    sect('Sfida',
      row('Penalità per ogni errore', stepper('penalty', 0, 10, 1, ' s'), 'Tempo di attesa dopo un errore. Zero la disattiva.'),
      row('Espressioni a testa', stepper('rounds', 1, 9), 'Ognuno procede per conto suo: vince chi finisce per primo, l\'altro può arrivare in fondo.'),
      row('Giocatore a sinistra', text('p1')), row('Giocatore a destra', text('p2')),
      row('Gira la metà destra', toggle('rotateRight'), 'Per giocare uno di fronte all\'altro su un tavolo.')),
    sect('Espressioni',
      row('Origine', seg('source', [['db', 'Database'], ['gen', 'Generate'], ['both', 'Entrambe']]), 'Il database si gestisce dalla home. Le generate sono casuali dello stesso livello.')),
    sect('Aspetto',
      row('Tema', seg('theme', [['light', 'Quaderno'], ['dark', 'Lavagna']])),
      row('Dimensione', stepper('fontScale', 0.8, 1.6, 0.1, '%', v => Math.round(v * 100))),
      row('Suoni', toggle('sound'))),
    el('div', { class: 'srow end' }, el('button', { class: 'btn ghost', type: 'button', text: 'Ripristina le impostazioni', on: { click: () => { resetSettings(); m.close(); openSettings(); } } })));
  const m = openModal('Impostazioni', body, { wide: true });
  return m;
}
