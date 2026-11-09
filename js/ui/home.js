import { el } from './dom.js';
import { schemaView, levelChips, openSettings, fullscreenBtn, LEVELS } from './chrome.js';
import { getSettings } from '../data/store.js';

export function mount(root) {
  const desc = el('p', { class: 'lvdesc' });
  const paint = () => { const l = LEVELS[getSettings().level - 1]; desc.textContent = `Livello ${l.n} · ${l.desc}`; };
  const screen = el('div', { class: 'screen home' },
    el('header', { class: 'home-head' },
      el('div', { class: 'brand' }, el('span', { class: 'logo', html: '<b>(</b>2<i>+</i>3<b>)</b><i>·</i>4' }), el('h1', { text: 'Espressioni' })),
      el('div', { class: 'row' }, fullscreenBtn(), el('button', { class: 'btn ghost icon', type: 'button', 'aria-label': 'Impostazioni', title: 'Impostazioni', html: '⚙', on: { click: () => openSettings() } }))),
    el('main', { class: 'home-main' },
      el('section', { class: 'home-schema' },
        el('h2', { text: 'Che cosa si fa per prima?' }),
        schemaView()),
      el('section', { class: 'home-play' },
        el('h2', { text: 'Gioca' }),
        el('div', { class: 'lvpick' }, el('span', { class: 'lbl', text: 'Livello' }), levelChips(paint), desc),
        el('div', { class: 'cta' },
          el('a', { class: 'btn big primary', href: '#/esercitati' }, el('b', { text: 'Esercitati' }), el('small', { text: 'Svolgi l\'espressione toccando le operazioni' })),
          el('a', { class: 'btn big duel', href: '#/sfida' }, el('b', { text: 'Sfida a due' }), el('small', { text: 'Schermo diviso: vince chi arriva per primo' }))),
        el('div', { class: 'more' },
          el('a', { class: 'btn ghost', href: '#/dimostrazione', text: 'Dimostrazione' }),
          el('a', { class: 'btn ghost', href: '#/database', text: 'Database di espressioni' })))));
  paint();
  root.append(screen);
  return () => {};
}
