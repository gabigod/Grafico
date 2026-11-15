// Cliente da API v20 da OANDA + gerador de dados de demonstração.
// No APK o fetch passa pelo HTTP nativo do Capacitor (CapacitorHttp), então não há bloqueio de CORS.
import { store } from './store.js';
import { ct, ctReady, key as ckey } from './ctrader.js';

export const TFS = [
  { id: '1',   label: '1m',  gran: 'M1',  sec: 60 },
  { id: '5',   label: '5m',  gran: 'M5',  sec: 300 },
  { id: '15',  label: '15m', gran: 'M15', sec: 900 },
  { id: '30',  label: '30m', gran: 'M30', sec: 1800 },
  { id: '60',  label: '1h',  gran: 'H1',  sec: 3600 },
  { id: '240', label: '4h',  gran: 'H4',  sec: 14400 },
  { id: 'D',   label: '1D',  gran: 'D',   sec: 86400 },
  { id: 'W',   label: '1S',  gran: 'W',   sec: 604800 },
  { id: 'M',   label: '1M',  gran: 'M',   sec: 2592000 },
];
export const tfById = id => TFS.find(t => t.id === id) || TFS[6];
// Timeframe mais fino usado para montar a barra parcial no replay.
export const finerOf = { '5': 'M1', '15': 'M1', '30': 'M5', '60': 'M5', '240': 'M15', 'D': 'H1', 'W': 'H4', 'M': 'D' };

const HOSTS = { practice: 'https://api-fxpractice.oanda.com', live: 'https://api-fxtrade.oanda.com' };

export function cfg() { return store.get('oanda', { token: '', env: 'practice', account: '' }); }
export function provider() { return store.get('provider', 'ctrader'); }
export function oandaReady() { const c = cfg(); return !!(c.token && c.account); }
const useCt = () => provider() === 'ctrader' && ctReady();
const useOanda = () => provider() === 'oanda' && oandaReady();
// "conectado a uma fonte de preços real"
export function hasOanda() { return useCt() || useOanda(); }
export function feedName() { return useCt() ? 'cTrader' : useOanda() ? 'OANDA' : 'Demo'; }

async function api(path, params) {
  const c = cfg();
  const q = params ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null)).toString() : '';
  const res = await fetch(HOSTS[c.env] + path + q, {
    headers: { Authorization: 'Bearer ' + c.token, 'Accept-Datetime-Format': 'UNIX', 'Content-Type': 'application/json' },
  });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = { errorMessage: text }; }
  if (!res.ok) {
    const msg = body.errorMessage || ('HTTP ' + res.status);
    const e = new Error(res.status === 401 ? 'Token da OANDA inválido ou sem permissão.' : msg);
    e.status = res.status; throw e;
  }
  return body;
}

export async function testConnection(token, env) {
  const prev = cfg();
  store.set('oanda', { ...prev, token, env });
  try { const r = await api('/v3/accounts'); return r.accounts || []; }
  catch (e) { store.set('oanda', prev); throw e; }
}

// Normaliza o horário das barras D/S/M para meia-noite UTC do dia de negociação (como o TradingView mostra).
function normTime(ot, gran) {
  if (gran === 'D' || gran === 'M') return Math.floor((ot + 12 * 3600) / 86400) * 86400;
  if (gran === 'W') return Math.floor((ot + 60 * 3600) / 86400) * 86400;
  return ot;
}
function mapCandle(c, gran) {
  const m = c.mid; const ot = Math.round(parseFloat(c.time));
  return { time: normTime(ot, gran), ot, open: +m.o, high: +m.h, low: +m.l, close: +m.c, volume: c.volume, complete: c.complete };
}

export async function candles(instrument, gran, { count, from, to } = {}) {
  if (useCt()) return ct.candles(resolveTicker(instrument), gran, { count, from, to });
  if (!useOanda()) return demoCandles(instrument, gran, { count, to });
  const params = { price: 'M', granularity: gran, dailyAlignment: 17, alignmentTimezone: 'America/New_York' };
  if (from) params.from = from;
  if (to) params.to = to;
  if (count && !(from && to)) params.count = Math.min(count, 5000);
  const r = await api(`/v3/instruments/${instrument}/candles`, params);
  return (r.candles || []).map(c => mapCandle(c, gran));
}

export async function pricing(instruments, live) {
  if (useCt()) return ct.pricing(instruments.map(resolveTicker), live && { name: resolveTicker(live.name), gran: live.gran });
  if (!useOanda()) return demoPricing(instruments);
  const r = await api(`/v3/accounts/${cfg().account}/pricing`, { instruments: instruments.join(',') });
  return (r.prices || []).map(p => ({
    instrument: p.instrument, time: parseFloat(p.time),
    bid: +p.bids?.[0]?.price, ask: +p.asks?.[0]?.price,
    mid: (+p.bids?.[0]?.price + +p.asks?.[0]?.price) / 2, tradeable: p.tradeable,
  }));
}

let instCache = null;
export async function instruments() {
  if (instCache) return instCache;
  if (useCt()) { instCache = (await ct.loadSymbols()).map(({ name, display, type, prec, pip }) => ({ name, display, type, prec, pip })); return instCache; }
  const saved = store.get('instruments', null);
  if (!useOanda()) { instCache = DEMO_INSTRUMENTS; return instCache; }
  try {
    const r = await api(`/v3/accounts/${cfg().account}/instruments`);
    instCache = r.instruments.map(i => ({ name: i.name, display: i.displayName, type: i.type, prec: i.displayPrecision, pip: i.pipLocation }))
      .sort((a, b) => a.name.localeCompare(b.name));
    store.set('instruments', instCache);
  } catch (e) { if (saved) instCache = saved; else throw e; }
  return instCache;
}
function knownList() {
  if (useCt()) return instCache || ct.cachedSymbols() || [];
  return instCache || (useOanda() && store.get('instruments', null)) || DEMO_INSTRUMENTS;
}
export function instInfo(name) {
  const list = knownList();
  return list.find(i => i.name === name) || { name, display: name.replace('_', '/'), type: 'CURRENCY', prec: name.includes('JPY') ? 3 : 5, pip: name.includes('JPY') ? -2 : -4 };
}
export const short = name => name.replace('_', '');
export function category(i) {
  const n = i.name;
  if (i.type === 'CURRENCY') return 'Forex';
  if (/^(XAU|XAG|XPT|XPD|XCU)/.test(n)) return 'Metais';
  if (/(WTICO|BCO|NATGAS|CORN|WHEAT|SOYBN|SUGAR|OIL|BRENT|WTI|XTI|XBR|XNG)/.test(n)) return 'Commodities';
  if (/(USB|DE10YB|UK10YB|BUND)/.test(n)) return 'Títulos';
  if (/(BTC|ETH|LTC|BCH|XRP|SOL|ADA|DOGE)/.test(n)) return 'Cripto';
  return 'Índices';
}

// Tickers usados em scripts do TradingView -> instrumento da OANDA.
const ALIASES = {
  US30: 'US30_USD', DJI: 'US30_USD', US100: 'NAS100_USD', NAS100: 'NAS100_USD', NDX: 'NAS100_USD', US500: 'SPX500_USD', SPX500: 'SPX500_USD', SPX: 'SPX500_USD',
  DE40: 'DE30_EUR', GER40: 'DE30_EUR', DE30: 'DE30_EUR', DAX: 'DE30_EUR', UK100: 'UK100_GBP', JP225: 'JP225_USD', NI225: 'JP225_USD', HK40: 'HK33_HKD', HK33: 'HK33_HKD',
  XAUUSD: 'XAU_USD', GOLD: 'XAU_USD', XAGUSD: 'XAG_USD', SILVER: 'XAG_USD', XCUUSD: 'XCU_USD', COPPER: 'XCU_USD',
  USOIL: 'WTICO_USD', WTICOUSD: 'WTICO_USD', OILUSD: 'WTICO_USD', UKOIL: 'BCO_USD', BCOUSD: 'BCO_USD', EU50: 'EU50_EUR', FR40: 'FR40_EUR', AU200: 'AU200_AUD',
};
const GROUPS = [
  ['US30', 'US30USD', 'DJI', 'DJ30', 'WS30', 'USA30', 'DOW', 'WALLSTREET30', 'USWALLST30'], ['NAS100', 'US100', 'NDX', 'USTEC', 'NAS100USD', 'USA100', 'USTECH', 'USTECH100', 'USNAS100'],
  ['US500', 'SPX500', 'SPX', 'SPX500USD', 'USA500', 'US500USD', 'USSPX500'], ['DE40', 'GER40', 'DE30', 'DAX', 'DE30EUR', 'GERMANY40', 'GER30', 'DE40EUR'],
  ['UK100', 'UK100GBP', 'FTSE', 'FTSE100'], ['JP225', 'JPN225', 'NI225', 'JP225USD', 'JAPAN225'], ['HK50', 'HK33', 'HK33HKD', 'HSI', 'HONGKONG50'], ['EU50', 'EU50EUR', 'STOXX50', 'EUSTX50'],
  ['FR40', 'FR40EUR', 'FRA40', 'CAC40', 'FRANCE40'], ['AU200', 'AUS200', 'AU200AUD'],
  ['XAUUSD', 'GOLD', 'XAUUSD'], ['XAGUSD', 'SILVER'], ['USOIL', 'WTI', 'WTICOUSD', 'XTIUSD', 'OILUSD', 'SPOTCRUDE', 'CRUDEOIL', 'USCRUDE'], ['UKOIL', 'BRENT', 'BCOUSD', 'XBRUSD', 'SPOTBRENT'],
];
function resolveCt(t) {
  const k = ckey(String(t || '').split(':').pop()); if (!k) return t;
  const list = ct.cachedSymbols() || [];
  const hit = list.find(s => ckey(s.name) === k); if (hit) return hit.name;
  const g = GROUPS.find(gr => gr.includes(k));
  if (g) { const h = list.find(s => g.includes(ckey(s.name))); if (h) return h.name; }
  const pre = list.find(s => ckey(s.name).startsWith(k) && ckey(s.name).length <= k.length + 2); if (pre) return pre.name;
  return k;
}
export function resolveTicker(t) {
  if (useCt()) return resolveCt(t);
  let s = String(t || '').split(':').pop().toUpperCase().replace(/[^A-Z0-9_]/g, '');
  if (s.includes('_')) return s;
  if (ALIASES[s]) return ALIASES[s];
  const list = knownList();
  const hit = list.find(i => i.name.replace('_', '') === s);
  if (hit) return hit.name;
  if (/^[A-Z]{6}$/.test(s)) return s.slice(0, 3) + '_' + s.slice(3);
  return s;
}

// DXY sintético a partir dos pares da OANDA (fórmula oficial do índice).
const DXY_W = [['EUR_USD', -0.576], ['USD_JPY', 0.136], ['GBP_USD', -0.119], ['USD_CAD', 0.091], ['USD_SEK', 0.042], ['USD_CHF', 0.036]];
export async function dxyCandles(gran, opts) {
  const sets = await Promise.all(DXY_W.map(([i]) => candles(i, gran, opts)));
  const maps = sets.map(s => new Map(s.map(c => [c.time, c])));
  const out = [];
  for (const c0 of sets[0]) {
    const parts = maps.map(m => m.get(c0.time)); if (parts.some(p => !p)) continue;
    const f = k => 50.14348112 * parts.reduce((acc, p, j) => acc * Math.pow(p[k], DXY_W[j][1]), 1);
    const o = f('open'), c = f('close'), a = f('high'), b = f('low');
    out.push({ time: c0.time, ot: c0.ot, open: o, close: c, high: Math.max(o, c, a, b), low: Math.min(o, c, a, b), volume: c0.volume, complete: c0.complete });
  }
  return out;
}

// ---------- modo demonstração (sem conta conectada) ----------
const DEMO_INSTRUMENTS = [
  ['EUR_USD', 'EUR/USD', 1.085], ['GBP_USD', 'GBP/USD', 1.27], ['USD_JPY', 'USD/JPY', 151.2], ['AUD_USD', 'AUD/USD', 0.66], ['USD_CAD', 'USD/CAD', 1.36],
  ['USD_CHF', 'USD/CHF', 0.88], ['NZD_USD', 'NZD/USD', 0.6], ['EUR_GBP', 'EUR/GBP', 0.855], ['GBP_JPY', 'GBP/JPY', 192.1], ['XAU_USD', 'Gold', 2350],
  ['US30_USD', 'US Wall St 30', 39000], ['NAS100_USD', 'US Nas 100', 18200], ['SPX500_USD', 'US SPX 500', 5200], ['DE30_EUR', 'Germany 30', 18100],
].map(([name, display, base]) => ({ name, display, type: name.includes('_USD') && name.length === 7 || /^[A-Z]{3}_[A-Z]{3}$/.test(name) && !/^(XAU)/.test(name) ? 'CURRENCY' : 'CFD', prec: base > 1000 ? 1 : base > 50 ? 3 : 5, pip: base > 50 ? -2 : -4, base }));
function rnd(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function demoSeries(instrument, gran) {
  const key = instrument + gran; if (demoSeries.c[key]) return demoSeries.c[key];
  const tf = TFS.find(t => t.gran === gran) || TFS[6];
  const info = DEMO_INSTRUMENTS.find(i => i.name === instrument) || { base: 1.1 };
  const r = rnd([...key].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7));
  const n = 3000, now = Math.floor(Date.now() / 1000), step = tf.sec;
  let p = info.base, out = [];
  const vol = { M1: .0004, M5: .0008, M15: .0013, M30: .0018, H1: .0025, H4: .005, D: .009, W: .02, M: .04 }[gran] || .009;
  // gera de trás para frente para que todos os timeframes terminem no mesmo preço
  for (let i = 0; i < n; i++) {
    const ot = Math.floor((now - i * step) / step) * step;
    if (gran === 'D' && new Date(ot * 1000).getUTCDay() === 6) continue;
    const drift = Math.sin(i / 60) * vol * 0.15;
    const c = p; const o = c / (1 + drift + (r() - 0.5) * vol); p = o;
    const h = Math.max(o, c) * (1 + r() * vol * 0.5), l = Math.min(o, c) * (1 - r() * vol * 0.5);
    out.push({ time: normTime(ot, gran), ot, open: o, high: h, low: l, close: c, volume: Math.round(500 + r() * 3000), complete: true });
  }
  out.reverse();
  out[out.length - 1].complete = false;
  return (demoSeries.c[key] = out);
}
demoSeries.c = {};
function demoCandles(instrument, gran, { count = 500, to } = {}) {
  let s = demoSeries(instrument, gran);
  if (to) s = s.filter(c => c.ot < to);
  return Promise.resolve(s.slice(-count).map(c => ({ ...c })));
}
function demoPricing(list) {
  return Promise.resolve(list.map(instrument => {
    const s = demoSeries(instrument, 'M1'); const last = s[s.length - 1];
    const jitter = last.close * (Math.random() - 0.5) * 0.0004;
    last.close += jitter; last.high = Math.max(last.high, last.close); last.low = Math.min(last.low, last.close);
    const spread = last.close * 0.00004;
    return { instrument, time: Date.now() / 1000, bid: last.close - spread, ask: last.close + spread, mid: last.close, tradeable: true };
  }));
}
export function demoTick(instrument, gran, mid) {
  const s = demoSeries(instrument, gran); const last = s[s.length - 1];
  last.close = mid; last.high = Math.max(last.high, mid); last.low = Math.min(last.low, mid);
}
