// Impostazioni e database di espressioni (salvati nel browser).
import { SEED } from './seed.js';
import { validate } from '../engine/solve.js';
import { generate } from '../engine/gen.js';

export const DEFAULTS = {
  level: 1,
  calc: false,            // i risultati li scrive l'utente
  writeSpeed: 80,         // ms per simbolo (0 = istantaneo)
  penalty: 2,             // secondi di penalità in Sfida
  rounds: 3,              // round in Sfida
  perSession: 5,          // espressioni per sessione di Esercitati
  autoUnwrap: false,      // toglie da sé le parentesi con un solo numero
  forceProps: true,       // proprietà delle potenze obbligatorie
  signUnwrap: true,       // permette di togliere le parentesi cambiando i segni
  priorityColors: true,   // colori in base alla priorità
  hints: true,            // suggerimenti in Esercitati
  showHistory: true,      // mostra i passaggi precedenti
  source: 'db',           // db | gen | both
  fontScale: 1,
  theme: 'light',
  sound: true,
  rotateRight: false,
  p1: 'Giocatore 1',
  p2: 'Giocatore 2',
};

const K = { settings: 'espr.settings.v1', custom: 'espr.custom.v1', hidden: 'espr.hidden.v1' };
const read = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } };

let settings = { ...DEFAULTS, ...read(K.settings, {}) };
export const getSettings = () => settings;
export function setSettings(patch) {
  settings = { ...settings, ...patch };
  write(K.settings, settings);
  document.dispatchEvent(new CustomEvent('settings', { detail: patch }));
}
export function resetSettings() { settings = { ...DEFAULTS }; write(K.settings, settings); document.dispatchEvent(new CustomEvent('settings', { detail: {} })); }

// ---- database ----
let custom = read(K.custom, []);
let hidden = new Set(read(K.hidden, []));
export const engineCfg = () => ({ signUnwrap: settings.signUnwrap, autoUnwrap: settings.autoUnwrap, forceProps: settings.forceProps });

export function allExpressions(level) {
  const base = SEED.filter(e => !hidden.has(e.id)).map(e => ({ ...e, seed: true }));
  const mine = custom.map(e => ({ ...e, seed: false }));
  const list = [...base, ...mine];
  return level ? list.filter(e => e.level === level) : list;
}
export const hiddenCount = () => hidden.size;

export function addCustom(latex, level) {
  const id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  custom.push({ id, latex, level });
  write(K.custom, custom);
  return id;
}
export function removeExpression(id) {
  if (custom.some(e => e.id === id)) { custom = custom.filter(e => e.id !== id); write(K.custom, custom); }
  else { hidden.add(id); write(K.hidden, [...hidden]); }
}
export function restoreSeeds() { hidden = new Set(); write(K.hidden, []); }
export function exportJSON() {
  return JSON.stringify({ versione: 1, espressioni: allExpressions().map(({ latex, level }) => ({ latex, level })) }, null, 2);
}
export function importJSON(text) {
  const data = JSON.parse(text);
  const list = Array.isArray(data) ? data : data.espressioni;
  if (!Array.isArray(list)) throw new Error('File non valido.');
  const have = new Set(allExpressions().map(e => e.latex));
  let added = 0; let skipped = 0;
  for (const e of list) {
    const level = Number(e.level);
    if (!e.latex || !(level >= 1 && level <= 4) || have.has(e.latex)) { skipped++; continue; }
    if (!validate(e.latex, level, engineCfg()).ok) { skipped++; continue; }
    addCustom(e.latex, level); have.add(e.latex); added++;
  }
  return { added, skipped };
}

// ---- scelta delle espressioni da proporre ----
const bags = {};
function nextFromBag(level) {
  const pool = allExpressions(level).filter(e => validate(e.latex, level, engineCfg()).ok);
  if (!pool.length) return null;
  const b = bags[level] || (bags[level] = []);
  if (!b.length) {
    const ids = pool.map(e => e.id).sort(() => Math.random() - 0.5);
    b.push(...ids);
  }
  const id = b.pop();
  return pool.find(e => e.id === id) || pool[0];
}
const meta = e => ({ ...e, steps: validate(e.latex, e.level, engineCfg()).steps });

export function nextExpression(level, exclude = []) {
  const src = settings.source;
  const useGen = src === 'gen' || (src === 'both' && Math.random() < 0.5);
  if (useGen) { const g = generate(level); if (g) return meta({ id: 'g' + Math.random().toString(36).slice(2), level, latex: g.latex }); }
  for (let i = 0; i < 6; i++) {
    const e = nextFromBag(level);
    if (e && !exclude.includes(e.latex)) return meta(e);
  }
  const g = generate(level);
  return g ? meta({ id: 'g' + Math.random().toString(36).slice(2), level, latex: g.latex }) : null;
}

/** Due espressioni diverse con lo stesso livello (e, se possibile, lo stesso numero di passaggi). */
export function nextPair(level, exclude = []) {
  const a = nextExpression(level, exclude);
  let best = null;
  const pool = allExpressions(level).filter(e => e.latex !== a.latex && !exclude.includes(e.latex) && validate(e.latex, level, engineCfg()).ok).map(meta);
  for (const tol of [0, 1, 99]) {
    const c = pool.filter(e => Math.abs(e.steps - a.steps) <= tol);
    if (c.length) { best = c[Math.floor(Math.random() * c.length)]; break; }
  }
  if (!best) { const g = generate(level); if (g) best = meta({ id: 'g' + Math.random().toString(36).slice(2), level, latex: g.latex }); }
  return [a, best || nextExpression(level, [a.latex, ...exclude])];
}
