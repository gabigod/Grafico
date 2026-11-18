// Guarda dados no próprio aparelho (localStorage do app). Avisa quem quiser saber das mudanças (sincronização).
const listeners = [];
const notify = (k, deleted) => { if (!k.startsWith('sync:')) listeners.forEach(f => { try { f(k, deleted); } catch { /* */ } }); };
export const store = {
  get(k, def) { try { const v = localStorage.getItem('gfx:' + k); return v === null ? def : JSON.parse(v); } catch { return def; } },
  set(k, v) { try { localStorage.setItem('gfx:' + k, JSON.stringify(v)); notify(k, false); } catch { /* sem espaço */ } },
  del(k) { try { localStorage.removeItem('gfx:' + k); notify(k, true); } catch { /* */ } },
  onChange(f) { listeners.push(f); },
};
export const uid = () => Math.random().toString(36).slice(2, 10);
