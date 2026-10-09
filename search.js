// Buscador "inteligente": intenciones ES/EN + coincidencia difusa sin acentos
import { TOOLS, CATEGORIES, INTENTS } from './tools.js';

export const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9ñ\s.\-]/g, ' ').replace(/\s+/g, ' ').trim();

const STOP = new Set('a al algo como con de del el en es esta este la las lo los me mi mis para por que quiero quisiera necesito puedo hacer hago una un uno unos unas y o u se su sus tu tus mas muy sin donde ver the to a an of for in on my i want need how do can with and or from is it'.split(' '));

function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const m = a.length, n = b.length; let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
// raíz simple: quita plurales / terminaciones verbales comunes
const stem = w => w.length > 4 ? w.replace(/(es|s)$/, '').replace(/(ar|er|ir)$/, '') : w;

const catName = Object.fromEntries(CATEGORIES.map(c => [c.id, c.name]));
const INDEX = TOOLS.map(t => {
  const words = new Set(norm(`${t.name} ${t.url.replace(/https?:\/\/(www\.)?/, '')} ${t.desc} ${t.kw} ${catName[t.cat]}`).split(' ').filter(w => w.length > 1));
  return { t, words: [...words], stems: [...words].map(stem), name: norm(t.name) };
});
const INTENT_N = INTENTS.map(([phr, ids]) => [phr.split('|').map(norm), ids]);

function tokMatch(q, words, stems) {
  let best = 0; const qs = stem(q);
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w === q) return 3;
    if (stems[i] === qs) best = Math.max(best, 2.6);
    else if (q.length >= 3 && w.startsWith(q)) best = Math.max(best, 2);
    else if (q.length >= 4 && (lev(q, w) <= (q.length >= 7 ? 2 : 1))) best = Math.max(best, 1.4);
  }
  return best;
}

export function search(query, limit = 8) {
  const q = norm(query);
  if (!q) return [];
  const scores = new Map();
  const add = (id, s) => scores.set(id, (scores.get(id) || 0) + s);
  const qtoks = q.split(' ').filter(w => w && !STOP.has(w));
  // 1) intenciones (frases), con tolerancia a errores por palabra
  for (const [phrases, ids] of INTENT_N) {
    for (const p of phrases) {
      const pw = p.split(' ').filter(w => !STOP.has(w));
      if (!pw.length) continue;
      const hit = q.includes(p) || pw.every(w => q.split(' ').some(x => x === w || stem(x) === stem(w) || (w.length >= 6 && lev(x, w) <= 1)));
      if (hit) { ids.forEach((id, i) => add(id, (10 + pw.length * 2) - i * 1.5)); break; }
    }
  }
  // 2) palabras clave difusas
  for (const e of INDEX) {
    if (e.name === q || e.t.id === q) add(e.t.id, 20);
    else if (q.length >= 2 && e.name.startsWith(q)) add(e.t.id, 8);
    let s = 0, matched = 0;
    for (const w of qtoks) { const m = tokMatch(w, e.words, e.stems); if (m) { s += m; matched++; } }
    if (matched) add(e.t.id, s * (matched / Math.max(1, qtoks.length)));
  }
  const top = Math.max(0, ...scores.values());
  return [...scores.entries()].filter(([, s]) => s >= 1.4 && s >= top * 0.25).sort((a, b) => b[1] - a[1]).slice(0, limit)
    .map(([id, score]) => ({ tool: TOOLS.find(t => t.id === id), score }));
}
