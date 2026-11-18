// Yields de títulos do governo (2, 5 e 10 anos) das 8 moedas principais.
// Fontes oficiais e grátis; valor diário de fechamento. No APK o fetch passa pelo HTTP nativo (sem CORS).
import { store } from './store.js';

const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const FROM = '2000-01-01';
export const COUNTRIES = {
  US: { cur: 'USD', name: 'EUA', mats: ['02', '05', '10'] },
  DE: { cur: 'EUR', name: 'Alemanha', mats: ['02', '05', '10'] },
  GB: { cur: 'GBP', name: 'Reino Unido', mats: ['05', '10'] },
  JP: { cur: 'JPY', name: 'Japão', mats: ['02', '05', '10'] },
  AU: { cur: 'AUD', name: 'Austrália', mats: ['02', '05', '10'] },
  CA: { cur: 'CAD', name: 'Canadá', mats: ['02', '05', '10'] },
  CH: { cur: 'CHF', name: 'Suíça', mats: ['02', '05', '10'] },
  NZ: { cur: 'NZD', name: 'Nova Zelândia', mats: ['10'] },
};
export const NOTES = {
  CH: 'Suíça: o SNB publica os dados diários com até ~1 mês de atraso.',
  NZ: 'Nova Zelândia: só 10 anos, valor mensal (o RBNZ bloqueia download automático).',
  GB: 'Reino Unido: o Banco da Inglaterra não publica o de 2 anos.',
};
export const LIST = Object.entries(COUNTRIES).flatMap(([c, v]) => v.mats.map(m => ({
  name: `${c}${m}Y`, display: `${v.name} ${+m} anos (${v.cur})`, type: 'YIELD', prec: 3, pip: -2,
})));
export const isYield = n => { const m = /^(US|DE|GB|JP|AU|CA|CH|NZ)(02|05|10)Y$/.exec(n || ''); return !!m && COUNTRIES[m[1]].mats.includes(m[2]); };

// nomes usados no TradingView → nossos
export function resolveYield(t) {
  let k = String(t || '').split(':').pop().toUpperCase().replace(/[^A-Z0-9]/g, '');
  k = k.replace(/^EU(?=\d)/, 'DE').replace(/^UK(?=\d)/, 'GB').replace(/^GER(?=\d)/, 'DE');
  const m = /^(US|DE|GB|JP|AU|CA|CH|NZ)(\d{1,2})Y?$/.exec(k);
  if (!m) return null;
  const mat = m[2].padStart(2, '0');
  return isYield(m[1] + mat + 'Y') ? m[1] + mat + 'Y' : null;
}

const day = s => Math.floor(Date.parse(s + 'T00:00:00Z') / 1000);
const num = v => { const x = parseFloat(v); return isFinite(x) ? x : null; };
async function get(url, { browser = false } = {}) {
  // só o Banco da Inglaterra exige cara de navegador; o FRED recusa esse cabeçalho
  const r = await fetch(url, { headers: browser ? { 'User-Agent': UA, Accept: '*/*' } : { Accept: '*/*' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.text();
}
const lines = t => t.replace(/\r/g, '').split('\n');
const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const dmy = (d, mon, y) => `${y}-${String(MONTHS[mon.slice(0, 3)]).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

// cada função devolve { '02': [[t, v], ...], '05': [...], '10': [...] }
const FETCH = {
  async US() {
    const t = await get(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS2,DGS5,DGS10&cosd=${FROM}`);
    const out = { '02': [], '05': [], '10': [] };
    for (const l of lines(t).slice(1)) { const [d, a, b, c] = l.split(','); if (!d) continue; const ts = day(d);
      [[a, '02'], [b, '05'], [c, '10']].forEach(([v, k]) => { const x = num(v); if (x !== null) out[k].push([ts, x]); }); }
    return out;
  },
  async DE() {
    const out = {};
    for (const [k, code] of [['02', 'R02XX'], ['05', 'R05XX'], ['10', 'R10XX']]) {
      const t = await get(`https://api.statistiken.bundesbank.de/rest/data/BBSIS/D.I.ZST.ZI.EUR.S1311.B.A604.${code}.R.A.A._Z._Z.A?format=csv&lang=en&startPeriod=${FROM}`);
      out[k] = [];
      for (const l of lines(t)) { const m = /^(\d{4}-\d{2}-\d{2}),([-\d.]+)/.exec(l); if (m) out[k].push([day(m[1]), +m[2]]); }
    }
    return out;
  },
  async GB() {
    const t = await get(`https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=01/Jan/2000&Dateto=now&SeriesCodes=IUDSNPY,IUDMNPY&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N`, { browser: true });
    const ls = lines(t); const head = (ls[0] || '').split(',').map(x => x.trim());
    const i5 = head.indexOf('IUDSNPY'), i10 = head.indexOf('IUDMNPY');
    const out = { '05': [], '10': [] };
    for (const l of ls.slice(1)) { const c = l.split(','); const m = /^(\d{1,2}) (\w{3}) (\d{4})$/.exec((c[0] || '').trim()); if (!m) continue;
      const ts = day(dmy(m[1], m[2], m[3])); const x = num(c[i5]), y = num(c[i10]);
      if (i5 > 0 && x !== null) out['05'].push([ts, x]); if (i10 > 0 && y !== null) out['10'].push([ts, y]); }
    if (!out['10'].length) throw new Error('Banco da Inglaterra não respondeu');
    return out;
  },
  async JP() {
    const out = { '02': [], '05': [], '10': [] }; const seen = new Set();
    const parse = t => { for (const l of lines(t)) { const c = l.split(','); const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(c[0] || ''); if (!m) continue;
      const ds = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`; if (ds < FROM || seen.has(ds)) continue; seen.add(ds); const ts = day(ds);
      [[c[2], '02'], [c[5], '05'], [c[10], '10']].forEach(([v, k]) => { const x = num(v); if (x !== null) out[k].push([ts, x]); }); } };
    parse(await get('https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/jgbcme.csv'));
    parse(await get('https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/historical/jgbcme_all.csv'));
    return out;
  },
  async AU() {
    const t = await get('https://www.rba.gov.au/statistics/tables/csv/f2-data.csv');
    const out = { '02': [], '05': [], '10': [] };
    for (const l of lines(t)) { const c = l.split(','); const m = /^(\d{1,2})-(\w{3})-(\d{4})$/.exec(c[0] || ''); if (!m) continue;
      const ts = day(dmy(m[1], m[2], m[3]));
      [[c[1], '02'], [c[3], '05'], [c[4], '10']].forEach(([v, k]) => { const x = num(v); if (x !== null) out[k].push([ts, x]); }); }
    return out;
  },
  async CA() {
    const s = ['BD.CDN.2YR.DQ.YLD', 'BD.CDN.5YR.DQ.YLD', 'BD.CDN.10YR.DQ.YLD'];
    const j = JSON.parse(await get(`https://www.bankofcanada.ca/valet/observations/${s.join(',')}/json?start_date=${FROM}`));
    const out = { '02': [], '05': [], '10': [] };
    for (const o of j.observations || []) { const ts = day(o.d);
      [[s[0], '02'], [s[1], '05'], [s[2], '10']].forEach(([id, k]) => { const x = num(o[id]?.v); if (x !== null) out[k].push([ts, x]); }); }
    return out;
  },
  async CH() {
    const out = { '02': [], '05': [], '10': [] }; const seen = { '02': new Set(), '05': new Set(), '10': new Set() };
    const add = (k, d, v) => { const x = num(v); if (x === null || seen[k].has(d)) return; seen[k].add(d); out[k].push([day(d), x]); };
    // dados novos (desde 2025, metodologia nova; vêm com histórico)
    const t = await get(`https://data.snb.ch/api/cube/rendeiduebd/data/csv/en?dimSel=D0(CHF),D1(2J,5J,10J)&fromDate=${FROM}`);
    for (const l of lines(t)) { const m = /^"(\d{4}-\d{2}-\d{2})";"CHF";"(\d+)J";"([-\d.]*)"/.exec(l); if (m) add(m[2].padStart(2, '0'), m[1], m[3]); }
    // série antiga para completar o começo, se faltar
    try {
      const t2 = await get(`https://data.snb.ch/api/cube/rendoblid/data/csv/en?dimSel=D0(2J,5J,10J0)&fromDate=${FROM}`);
      for (const l of lines(t2)) { const m = /^"(\d{4}-\d{2}-\d{2})";"(\d+)J0?";"([-\d.]*)"/.exec(l); if (m) add(m[2].padStart(2, '0'), m[1], m[3]); }
    } catch { /* opcional */ }
    for (const k in out) out[k].sort((a, b) => a[0] - b[0]);
    return out;
  },
  async NZ() {
    const t = await get(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=IRLTLT01NZM156N&cosd=${FROM}`);
    const out = { '10': [] };
    for (const l of lines(t).slice(1)) { const [d, v] = l.split(','); const x = num(v); if (d && x !== null) out['10'].push([day(d), x]); }
    return out;
  },
};

const mem = {}; const inflight = {};
const TTL = 4 * 3600 * 1000;
async function country(c) {
  const now = Date.now();
  if (mem[c] && now - mem[c].at < TTL) return mem[c].data;
  const saved = store.get('yld:' + c, null);
  if (saved && now - saved.at < TTL) { mem[c] = saved; return saved.data; }
  if (!inflight[c]) inflight[c] = FETCH[c]().then(data => {
    const min = day(FROM); for (const k in data) data[k] = data[k].filter(r => r[0] >= min).sort((a, b) => a[0] - b[0]);
    const rec = { at: Date.now(), data }; mem[c] = rec; store.set('yld:' + c, rec); return data;
  }).catch(e => { if (saved) { mem[c] = saved; return saved.data; } throw new Error(`Yields ${COUNTRIES[c].name}: ${e.message}`); })
    .finally(() => { delete inflight[c]; });
  return inflight[c];
}

export async function series(name) {
  const c = name.slice(0, 2), k = name.slice(2, 4);
  const data = await country(c);
  return data[k] || [];
}

// barras para o gráfico / Pine. D = valor diário; S e M agregam OHLC; intraday repete o fechamento do dia anterior.
export async function candles(name, gran, { count = 2000, to, chartTimes } = {}) {
  const s = await series(name);
  let bars;
  const mk = (time, o, h, l, c) => ({ time, ot: time, open: o, high: h, low: l, close: c, volume: 0, complete: true });
  if (gran === 'W' || gran === 'M') {
    const key = t => { const d = new Date(t * 1000);
      if (gran === 'M') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000;
      const wd = (d.getUTCDay() + 6) % 7; return t - wd * 86400 - 86400; }; // semana começa no domingo (como o forex)
    const map = new Map();
    for (const [t, v] of s) { const k = key(t); const b = map.get(k); if (!b) map.set(k, mk(k, v, v, v, v)); else { b.high = Math.max(b.high, v); b.low = Math.min(b.low, v); b.close = v; } }
    bars = [...map.values()];
  } else if (!chartTimes) {
    bars = []; let prev = null;
    for (const [t, v] of s) { const o = prev ?? v; bars.push(mk(t, o, Math.max(o, v), Math.min(o, v), v)); prev = v; }
  } else {
    // alinhado às barras do gráfico, repetindo o último valor conhecido (como gaps_off no TradingView).
    // D: valor do próprio dia. Intraday: fechamento do dia anterior — sem olhar o futuro.
    const daily = gran === 'D';
    bars = []; let j = 0; let last = null;
    for (const t of chartTimes) {
      const lim = daily ? t : Math.floor(t / 86400) * 86400 - 1;
      while (j < s.length && s[j][0] <= lim) { last = s[j][1]; j++; }
      if (last !== null) bars.push(mk(t, last, last, last, last));
    }
  }
  if (to) bars = bars.filter(b => b.ot < to);
  if (bars.length) bars[bars.length - 1].complete = false;
  return bars.slice(-count);
}
