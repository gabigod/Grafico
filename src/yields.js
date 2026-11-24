// Yields de títulos do governo (2, 5 e 10 anos) das 8 moedas principais, pela CNBC (intraday).
// A CNBC não tem API oficial: usamos os mesmos endereços que o site dela usa. Se falhar, não há yields.
import { store } from './store.js';

const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
export const COUNTRIES = {
  US: { cur: 'USD', name: 'EUA' }, DE: { cur: 'EUR', name: 'Alemanha' }, GB: { cur: 'GBP', name: 'Reino Unido' },
  JP: { cur: 'JPY', name: 'Japão' }, AU: { cur: 'AUD', name: 'Austrália' }, CA: { cur: 'CAD', name: 'Canadá' },
  CH: { cur: 'CHF', name: 'Suíça' }, NZ: { cur: 'NZD', name: 'Nova Zelândia' },
};
const MATS = ['10'];
export const LIST = Object.entries(COUNTRIES).flatMap(([c, v]) => MATS.map(m => ({
  name: `${c}${m}Y`, display: `${v.name} ${+m} anos (${v.cur})`, type: 'YIELD', prec: 3, pip: -2,
})));
export const isYield = n => /^(US|DE|GB|JP|AU|CA|CH|NZ)10Y$/.test(n || '');

// nomes usados no TradingView → nossos
export function resolveYield(t) {
  let k = String(t || '').split(':').pop().toUpperCase().replace(/[^A-Z0-9]/g, '');
  k = k.replace(/^EU(?=\d)/, 'DE').replace(/^UK(?=\d)/, 'GB').replace(/^GER(?=\d)/, 'DE');
  const m = /^(US|DE|GB|JP|AU|CA|CH|NZ)(\d{1,2})Y?$/.exec(k);
  if (!m) return null;
  const n = m[1] + m[2].padStart(2, '0') + 'Y';
  return isYield(n) ? n : null;
}

// símbolo da CNBC: US10Y, US2Y; outros países com sufixo (DE10Y-DE). Testa variações e lembra a que funcionou.
function cnbcCandidates(n) {
  const c = n.slice(0, 2), m = String(+n.slice(2, 4));
  if (c === 'US') return [`US${m}Y`];
  const alt = c === 'GB' ? ['GB', 'UK'] : [c];
  const out = [];
  for (const a of alt) out.push(`${a}${m}Y-${c}`, `${a}${m}Y-${a}`, `${a}${m}Y`);
  return [...new Set(out)];
}
const symMap = store.get('cnbc:sym', {});

async function get(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json, text/plain, */*', Referer: 'https://www.cnbc.com/', Origin: 'https://www.cnbc.com' } });
  const t = await r.text();
  if (!r.ok || /Access Denied/i.test(t)) throw new Error(r.ok ? 'CNBC bloqueou o acesso' : 'CNBC HTTP ' + r.status);
  return t;
}

// ---------- gráfico: ts-api.cnbc.com ----------
// cada faixa tem uma resolução diferente; juntamos as mais finas com as mais longas
async function rangeBars(sym, range) {
  const t = await get(`https://ts-api.cnbc.com/harmony/app/charts/${range}.json?symbol=${encodeURIComponent(sym)}`);
  const j = JSON.parse(t);
  const pb = j?.barData?.priceBars || [];
  return pb.map(b => ({ t: Math.round(+b.tradeTimeinMills / 1000), o: +b.open, h: +b.high, l: +b.low, c: +b.close }))
    .filter(b => isFinite(b.t) && isFinite(b.c));
}
const mem = {}; const inflight = {};
const TTL = { '1D': 60e3, '5D': 3e5, '1M': 9e5, '3M': 36e5, '1Y': 36e5, '5Y': 6 * 36e5, 'ALL': 24 * 36e5 };
const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] || 86400; };
async function getRange(n, range) {
  const key = n + '|' + range; const now = Date.now();
  if (mem[key] && now - mem[key].at < TTL[range]) return mem[key];
  if (inflight[key]) return inflight[key];
  inflight[key] = (async () => {
    const cands = symMap[n] ? [symMap[n], ...cnbcCandidates(n).filter(x => x !== symMap[n])] : cnbcCandidates(n);
    let lastErr;
    for (const s of cands) {
      try {
        const bars = await rangeBars(s, range);
        if (!bars.length) { lastErr = new Error('sem dados para ' + s); continue; }
        if (symMap[n] !== s) { symMap[n] = s; store.set('cnbc:sym', symMap); }
        bars.sort((a, b) => a.t - b.t);
        const iv = bars.length > 2 ? median(bars.slice(1).map((b, i) => b.t - bars[i].t)) : 86400;
        const rec = { at: Date.now(), bars, iv }; mem[key] = rec; return rec;
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('sem dados');
  })().finally(() => { delete inflight[key]; });
  return inflight[key];
}

function bucket(t, gran, sec) {
  if (gran === 'M') { const d = new Date(t * 1000); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000; }
  if (gran === 'W') { const d0 = Math.floor(t / 86400) * 86400; const wd = new Date(d0 * 1000).getUTCDay(); return d0 - wd * 86400; }
  if (gran === 'D') return Math.floor(t / 86400) * 86400;
  return Math.floor(t / sec) * sec;
}

// barras no timeframe pedido, a partir das faixas da CNBC
export async function candles(name, gran, { count = 2000, to, chartTimes } = {}) {
  const tfSec = { M1: 60, M5: 300, M15: 900, M30: 1800, H1: 3600, H4: 14400, D: 86400, W: 604800, M: 2592000 }[gran] || 86400;
  const need = tfSec < 3600 ? ['1D', '5D', '1M'] : tfSec < 86400 ? ['5D', '1M', '3M', '1Y'] : ['1M', '1Y', '5Y', 'ALL'];
  const res = await Promise.allSettled(need.map(r => getRange(name, r)));
  const got = res.filter(x => x.status === 'fulfilled').map(x => x.value);
  if (!got.length) throw new Error('Yields CNBC: ' + (res[0].reason?.message || 'falhou'));
  // usa só faixas com resolução ≤ timeframe; a mais fina tem prioridade em cada bucket
  const srcs = got.filter(g => g.iv <= tfSec * 1.01).sort((a, b) => a.iv - b.iv);
  const use = srcs.length ? srcs : [got.sort((a, b) => a.iv - b.iv)[0]];
  const map = new Map();
  for (const g of use) {
    const local = new Map();
    for (const b of g.bars) {
      const k = bucket(b.t, gran, tfSec); const x = local.get(k);
      if (!x) local.set(k, { time: k, ot: k, open: b.o, high: b.h, low: b.l, close: b.c, volume: 0, complete: true });
      else { x.high = Math.max(x.high, b.h); x.low = Math.min(x.low, b.l); x.close = b.c; }
    }
    for (const [k, v] of local) if (!map.has(k)) map.set(k, v);
  }
  // a CNBC só tem poucos dias de dados intradiários: o passado mais antigo vem das faixas mais longas (diário)
  if (map.size) {
    let first = Math.min(...map.keys());
    for (const g of got.filter(x => !use.includes(x)).sort((a, b) => a.iv - b.iv)) {
      let added = 0;
      for (const b of g.bars) { const k = bucket(b.t, gran, tfSec); if (k < first && !map.has(k)) { map.set(k, { time: k, ot: k, open: b.o, high: b.h, low: b.l, close: b.c, volume: 0, complete: true }); added++; } }
      if (added) first = Math.min(...map.keys());
    }
  }
  let bars = [...map.values()].sort((a, b) => a.time - b.time);
  if (chartTimes) {
    // alinhado às barras do gráfico, repetindo o último valor (gaps_off do TradingView)
    const out = []; let j = 0, last = null;
    for (const t of chartTimes) {
      while (j < bars.length && bars[j].time <= t) { last = bars[j]; j++; }
      if (last) out.push(last.time === t ? last : { ...last, time: t, ot: t, open: last.close, high: last.close, low: last.close });
    }
    bars = out;
  }
  if (to) bars = bars.filter(b => b.ot < to);
  if (bars.length) bars[bars.length - 1].complete = false;
  return bars.slice(-count);
}

// ---------- cotação ao vivo: quote.cnbc.com ----------
export async function quotes(names) {
  const syms = names.map(n => symMap[n] || cnbcCandidates(n)[0]);
  const t = await get(`https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=${encodeURIComponent(syms.join('|'))}&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json&events=1`);
  const j = JSON.parse(t); let q = j?.FormattedQuoteResult?.FormattedQuote || [];
  if (!Array.isArray(q)) q = [q];
  const pct = v => parseFloat(String(v ?? '').replace('%', ''));
  return names.map((n, i) => {
    const r = q.find(x => x.symbol === syms[i]); if (!r) return null;
    const last = pct(r.last); if (!isFinite(last)) return null;
    const ch = pct(r.change);
    return { instrument: n, time: Date.now() / 1000, bid: last, ask: last, mid: last, sessionClose: isFinite(ch) ? last - ch : undefined, tradeable: false };
  }).filter(Boolean);
}

// diagnóstico para a tela de Ajustes
export async function test() {
  const out = [];
  for (const it of LIST) {
    try {
      const g = await getRange(it.name, '1M'); const l = g.bars.at(-1);
      out.push({ name: it.name, ok: true, info: `${symMap[it.name]} · ${l.c.toFixed(3)}% · ${new Date(l.t * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` });
    } catch (e) { out.push({ name: it.name, ok: false, info: e.message }); }
  }
  return out;
}
