// Cache das barras: memória + IndexedDB (sobrevive ao fechar o app). Mostra na hora e atualiza só o fim.
const mem = new Map();
let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open('gfx-bars2', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('b');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }).catch(() => null);
  return dbp;
}
export async function getBars(key) {
  if (mem.has(key)) return mem.get(key);
  const d = await db(); if (!d) return null;
  const v = await new Promise(res => { try { const q = d.transaction('b').objectStore('b').get(key); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); } catch { res(null); } });
  if (v && !mem.has(key)) mem.set(key, v);
  return mem.get(key) || null;
}
export function putBars(key, rec) {
  mem.set(key, rec);
  db().then(d => { if (!d) return; try { d.transaction('b', 'readwrite').objectStore('b').put({ ...rec, bars: rec.bars.slice(-4000) }, key); } catch { /* */ } });
}
export function memFresh(key, ms) { const r = mem.get(key); return !!r && Date.now() - r.at < ms; }
