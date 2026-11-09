import { getSettings } from './data/store.js';
import * as home from './ui/home.js';
import * as practice from './ui/practice.js';
import * as challenge from './ui/challenge.js';
import * as demo from './ui/demo.js';
import * as database from './ui/database.js';

const routes = { '': home, esercitati: practice, sfida: challenge, dimostrazione: demo, database };
const app = document.getElementById('app');
let unmount = null;

function applyLook() {
  const s = getSettings();
  document.documentElement.dataset.theme = s.theme;
  document.documentElement.style.setProperty('--fs', s.fontScale);
}

function route() {
  const key = (location.hash.replace(/^#\/?/, '').split('?')[0]) || '';
  const mod = routes[key] || home;
  if (unmount) { try { unmount(); } catch (e) { console.error(e); } }
  document.querySelectorAll('.backdrop').forEach(b => b.remove());
  app.replaceChildren();
  unmount = mod.mount(app);
  window.scrollTo(0, 0);
}

document.addEventListener('settings', applyLook);
window.addEventListener('hashchange', route);
applyLook();
route();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
