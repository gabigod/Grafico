// Sincroniza desenhos, scripts, lista de ativos e ajustes entre aparelhos usando um Gist secreto do seu GitHub.
// Tokens das corretoras nunca são enviados.
import { store } from './store.js';

const FILE = 'graficos-fx-sync.json';
const DESC = 'Gráficos FX — sincronização entre aparelhos (gerado pelo app)';
const EXCL = /^(oanda|ctrader|instruments|ct:|cnbc:|sync:|yld:|instrument$|tf$|watchOpen$|provider$)/;
let applying = false, timer = null, running = null, onRemote = () => { }, onStatus = () => { };

export const cfg = () => store.get('sync:cfg', { token: '', gist: '', last: 0 });
const setCfg = p => store.set('sync:cfg', { ...cfg(), ...p });
const meta = () => store.get('sync:meta', {});
export const enabled = () => !!(cfg().token && cfg().gist);

store.onChange(k => {
  if (applying || EXCL.test(k)) return;
  const m = meta(); m[k] = Date.now(); store.set('sync:meta', m);
  if (enabled()) { clearTimeout(timer); timer = setTimeout(() => sync().catch(() => { }), 4000); }
});

async function api(method, path, body, token = cfg().token) {
  const r = await fetch('https://api.github.com' + path, {
    method, headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* */ }
  if (!r.ok) {
    const msg = r.status === 401 ? 'Token do GitHub inválido ou vencido.' : r.status === 403 || r.status === 404 ? 'O token não tem permissão de Gists (leitura e escrita).' : (j?.message || 'GitHub HTTP ' + r.status);
    throw new Error(msg);
  }
  return j;
}

function localSnapshot() {
  const m = meta(); const keys = {};
  for (let i = 0; i < localStorage.length; i++) {
    const full = localStorage.key(i); if (!full.startsWith('gfx:')) continue;
    const k = full.slice(4); if (EXCL.test(k)) continue;
    keys[k] = { v: localStorage.getItem(full), t: m[k] || 0 };
  }
  for (const [k, t] of Object.entries(m)) if (!(k in keys) && !EXCL.test(k)) keys[k] = { v: null, t }; // apagados
  return keys;
}

async function readGist(id) {
  const g = await api('GET', '/gists/' + id);
  const f = g.files?.[FILE]; if (!f) return {};
  let content = f.content;
  if (f.truncated && f.raw_url) content = await (await fetch(f.raw_url)).text();
  try { return JSON.parse(content).keys || {}; } catch { return {}; }
}

// conecta com um token: acha o gist do app ou cria um novo
export async function connect(token) {
  const list = await api('GET', '/gists?per_page=100', null, token);
  let g = (list || []).find(x => x.files && x.files[FILE]);
  if (!g) {
    // primeiro aparelho: o que está aqui vira a versão inicial
    const m = meta(); const now = Date.now();
    for (let i = 0; i < localStorage.length; i++) { const f = localStorage.key(i); if (f.startsWith('gfx:') && !EXCL.test(f.slice(4)) && !m[f.slice(4)]) m[f.slice(4)] = now; }
    store.set('sync:meta', m);
    g = await api('POST', '/gists', { description: DESC, public: false, files: { [FILE]: { content: JSON.stringify({ keys: {} }) } } }, token);
  }
  store.set('sync:cfg', { token, gist: g.id, last: 0 });
  return sync();
}
export function disconnect() { store.del('sync:cfg'); }
export function hooks(h) { if (h.onRemote) onRemote = h.onRemote; if (h.onStatus) onStatus = h.onStatus; }

// junta o que está no GitHub com o deste aparelho (vale o mais recente de cada item) e envia o resultado
export function sync() {
  if (!enabled()) return Promise.resolve(false);
  if (running) return running;
  running = (async () => {
    onStatus('sincronizando');
    const remote = await readGist(cfg().gist);
    const local = localSnapshot(); const m = meta();
    const changed = [];
    applying = true;
    try {
      for (const [k, r] of Object.entries(remote)) {
        if (EXCL.test(k)) continue;
        const l = local[k];
        if (!l || r.t > l.t) {
          if (r.v === null) localStorage.removeItem('gfx:' + k); else localStorage.setItem('gfx:' + k, r.v);
          m[k] = r.t; local[k] = r; changed.push(k);
        }
      }
    } finally { applying = false; }
    store.set('sync:meta', m);
    const needPush = Object.entries(local).some(([k, l]) => !remote[k] || l.t > remote[k].t);
    if (needPush) await api('PATCH', '/gists/' + cfg().gist, { files: { [FILE]: { content: JSON.stringify({ app: 'graficos-fx', at: Date.now(), keys: local }) } } });
    setCfg({ last: Date.now() });
    onStatus('ok');
    if (changed.length) onRemote(changed);
    return changed.length > 0;
  })().catch(e => { onStatus('erro', e); throw e; }).finally(() => { running = null; });
  return running;
}
