// Guarda dados no próprio aparelho (localStorage do app).
export const store = {
  get(k, def) { try { const v = localStorage.getItem('gfx:' + k); return v === null ? def : JSON.parse(v); } catch { return def; } },
  set(k, v) { try { localStorage.setItem('gfx:' + k, JSON.stringify(v)); } catch { /* sem espaço */ } },
  del(k) { try { localStorage.removeItem('gfx:' + k); } catch { /* */ } },
};
export const uid = () => Math.random().toString(36).slice(2, 10);
