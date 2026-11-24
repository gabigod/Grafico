// Execução nativa (rápida) dos indicadores do Tem que vêm prontos no app.
// O PineTS re-executa o script inteiro para cada request.security; com 28 pares isso leva
// dezenas de segundos no celular. Aqui a mesma lógica do Pine roda direto em JS, em milissegundos.
// Só é usado quando o código é exatamente o original; se o código for editado, volta para o PineTS.
import { Indicator } from 'pinets';
import srcCSA from './pine/currency-strength-atr-yield.pine?raw';
import srcYSA from './pine/yield-strength-agregado.pine?raw';
import srcYSP from './pine/yield-strength-par.pine?raw';

const norm = s => String(s || '').replace(/\r\n?/g, '\n').trim();
const C = { gray: '#787B86', blue: '#2196F3', red: '#F23645', lime: '#00E676', yellow: '#FFEB3B', aqua: '#00BCD4', silver: '#B2B5BE', orange: '#FF9800', white: '#FFFFFF' };
const withAlpha = (hex, transp) => hex + Math.round(255 * (1 - transp / 100)).toString(16).padStart(2, '0').toUpperCase();
const CURS = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF'];
const YC = { USD: 'US', EUR: 'DE', JPY: 'JP', GBP: 'GB', CHF: 'CH', AUD: 'AU', NZD: 'NZ', CAD: 'CA' };
const na = v => v === null || v === undefined || Number.isNaN(v);

// ---------- ta.* (mesma definição do Pine) ----------
function sma(src, len) {
  const out = new Array(src.length).fill(NaN); let sum = 0, bad = 0;
  for (let i = 0; i < src.length; i++) {
    const v = src[i]; if (na(v)) bad++; else sum += v;
    if (i >= len) { const o = src[i - len]; if (na(o)) bad--; else sum -= o; }
    if (i >= len - 1 && !bad) out[i] = sum / len;
  }
  return out;
}
// ema/rma: semente = sma(len) quando o valor anterior é na
function expAvg(src, len, alpha) {
  const s = sma(src, len); const out = new Array(src.length).fill(NaN);
  for (let i = 0; i < src.length; i++) {
    const prev = i ? out[i - 1] : NaN;
    out[i] = na(prev) ? s[i] : (na(src[i]) ? NaN : alpha * src[i] + (1 - alpha) * prev);
  }
  return out;
}
const ema = (src, len) => expAvg(src, len, 2 / (len + 1));
const rma = (src, len) => expAvg(src, len, 1 / len);
function wma(src, len) {
  const out = new Array(src.length).fill(NaN); const den = len * (len + 1) / 2;
  for (let i = len - 1; i < src.length; i++) {
    let s = 0, ok = true;
    for (let j = 0; j < len; j++) { const v = src[i - j]; if (na(v)) { ok = false; break; } s += v * (len - j); }
    if (ok) out[i] = s / den;
  }
  return out;
}
const maOf = (src, len, type) => type === 'EMA' ? ema(src, len) : sma(src, len);
const smooth = (src, len, type) => type === 'SMA' ? sma(src, len) : type === 'EMA' ? ema(src, len) : type === 'WMA' ? wma(src, len) : rma(src, len);
function trueRange(b) { return b.map((x, i) => i === 0 ? x.high - x.low : Math.max(x.high - x.low, Math.abs(x.high - b[i - 1].close), Math.abs(x.low - b[i - 1].close))); }

// ---------- request.security: liga as barras de outro ativo/timeframe às do gráfico ----------
// Mesma regra do PineTS (lookahead desligado): timeframe maior → barra que já fechou (ou a atual, na barra ao vivo);
// timeframe menor → a última barra intradiária dentro da barra do gráfico.
function secIndex(chart, other, lower) {
  const idx = new Int32Array(chart.length).fill(-1); if (!other.length) return idx;
  const now = Date.now(); let a = 0;
  for (let i = 0; i < chart.length; i++) {
    const co = chart[i].openTime, cc = chart[i].closeTime;
    if (lower) {
      while (a + 1 < other.length && other[a + 1].closeTime <= cc) a++;
      if (other[a].closeTime <= cc && other[a].openTime >= co) idx[i] = a;
    } else {
      while (a < other.length && other[a].closeTime <= co) a++;
      if (a < other.length && other[a].openTime <= co && co < other[a].closeTime) {
        const live = i === chart.length - 1 && cc > now;
        idx[i] = live || cc >= other[a].closeTime ? a : a - 1;
      }
    }
  }
  return idx;
}
const pick = (vals, idx) => Array.from(idx, j => j < 0 ? NaN : vals[j]);

// ---------- dados ----------
class Env {
  constructor(api, chart, chartTf, ticker) { this.api = api; this.chart = chart; this.chartTf = chartTf; this.ticker = ticker; this.memo = new Map(); }
  same(a, b) { return !a || !b || a === b || this.api.key(a) === this.api.key(b); }
  async bars(sym, tf) {
    if (this.same(sym, this.ticker) && tf === this.chartTf) return this.chart;
    const k = sym + '|' + tf; if (!this.memo.has(k)) this.memo.set(k, this.api.get(sym, tf).catch(() => []));
    return this.memo.get(k);
  }
  // série de "close" (ou outra coisa) de sym@tf ligada a um conjunto de barras base (base@baseTf)
  async on(base, baseTf, baseSym, sym, tf, fn) {
    if (this.same(sym, baseSym) && tf === baseTf) return fn(base);
    const o = await this.bars(sym, tf); if (!o.length) return new Array(base.length).fill(NaN);
    return pick(fn(o), secIndex(base, o, this.api.tfSec(tf) < this.api.tfSec(baseTf)));
  }
}

// ---------- saída no formato do PineTS (ctx.plots) ----------
class Out {
  constructor(chart, title) { this.t = chart.map(b => b.openTime); this.plots = {}; this.n = 0; this.title = title; }
  line(title, vals, color, lw = 1) {
    const key = title || '#' + this.n; this.n++;
    const col = typeof color === 'function' ? color : () => color;
    this.plots[key] = { options: { color: col(this.t.length - 1), linewidth: lw, overlay: true }, data: this.t.map((time, i) => ({ time, value: na(vals[i]) ? NaN : vals[i], options: { color: col(i) } })) };
  }
  shape(title, cond, { location, shape, color, size }) {
    this.n++;
    this.plots[title] = { options: { location, style: 'shape', color, size, shape, overlay: true }, data: this.t.map((time, i) => ({ title, time, value: !!cond[i] })) };
  }
  barcolor(title, cols) { this.plots[title || 'barcolor#0'] = { options: { color: null, style: 'barcolor' }, data: this.t.map((time, i) => ({ time, value: cols[i] ? true : null, options: { color: cols[i] || null } })) }; }
  ctx() { return { indicator: { title: this.title, overlay: true }, plots: this.plots }; }
}

// moedas + yields agregados (média das outras 7) para um conjunto de barras base
async function yieldsOn(env, base, baseTf, baseSym, yieldTf, mat) {
  const y = {};
  await Promise.all(CURS.map(async c => { y[c] = await env.on(base, baseTf, baseSym, 'TVC:' + YC[c] + mat, yieldTf, b => b.map(x => x.close)); }));
  return y;
}
// trendCalc do Pine: contador "var" de barras viradas (sobe/desce); na mantém o contador
function trendCalc(src, fast, slow, minB, useEma) {
  const e1 = useEma ? ema(src, fast) : null, e2 = useEma ? ema(src, slow) : null;
  let up = 0, dn = 0; const U = [], D = [];
  for (let i = 0; i < src.length; i++) {
    const rising = useEma ? e1[i] > e2[i] : i > 0 && src[i] > src[i - 1];
    const falling = useEma ? e1[i] < e2[i] : i > 0 && src[i] < src[i - 1];
    if (rising) { up++; dn = 0; } else if (falling) { dn++; up = 0; }
    U.push(up >= minB); D.push(dn >= minB);
  }
  return [U, D];
}

// timeframe menor que o do gráfico sobe para o do gráfico: a CNBC só tem poucos dias de yield intradiário,
// e o fechamento da última barra de 1h do dia é o próprio fechamento diário
const atLeastChart = (env, tf) => (!tf || env.api.tfSec(tf) < env.api.tfSec(env.chartTf) ? env.chartTf : tf);
const agg = (y, m) => { const own = y[m]; if (!own) return y.USD.map(() => NaN); const others = CURS.filter(c => c !== m); return own.map((v, i) => v - others.reduce((s, c) => s + y[c][i], 0) / 7); };

// ================= Currency Strength + ATR + Yield Arrows =================
async function runCSA(env, I) {
  const ch = env.chart, T = env.chartTf, me = env.ticker, sym = env.api.short(me);
  const tfMa = I.ma_tf === '' ? T : I.ma_tf;
  const base = sym.length >= 6 ? sym.slice(0, 3) : 'USD', quote = sym.length >= 6 ? sym.slice(3, 6) : 'USD';
  const out = new Out(ch, 'Currency Strength + ATR + Yield Arrows');
  const close = ch.map(b => b.close);
  const yTf = atLeastChart(env, I.yield_tf), eTf = atLeastChart(env, I.yield_ema_tf);

  const ctxP = env.bars(me, eTf);
  const [ma1, ma2, ma3] = await Promise.all([0, 1, 2].map(k => env.on(ch, T, me, me, tfMa, b => maOf(b.map(x => x.close), I['emaLength' + (k + 1)], I['maType' + (k + 1)]))));

  const tr = trueRange(ch);
  const band = (len, mult, type) => { const a = smooth(tr, len, type); return [close.map((c, i) => c + a[i] * mult), close.map((c, i) => c - a[i] * mult)]; };
  const [u1, l1] = band(I.atr_len, I.atr_mult, I.atr_smoothing), [u2, l2] = band(I.atr_len2, I.atr_mult2, I.atr_smoothing2);
  out.line('ATR1 Upper Band', I.show_atr_bands ? u1 : [], withAlpha(C.silver, 40));
  out.line('ATR1 Lower Band', I.show_atr_bands ? l1 : [], withAlpha(C.silver, 40));
  out.line('ATR2 Upper Band', I.show_atr_bands2 ? u2 : [], withAlpha(C.orange, 40));
  out.line('ATR2 Lower Band', I.show_atr_bands2 ? l2 : [], withAlpha(C.orange, 40));
  const brk = (u, l, wick) => [ch.map((b, i) => b.close < b.open && (wick ? b.high > u[i] : b.close > u[i])), ch.map((b, i) => b.close > b.open && (wick ? b.low < l[i] : b.close < l[i]))];
  const [bu1, bl1] = brk(u1, l1, I.atr_break_use_wick), [bu2, bl2] = brk(u2, l2, I.atr_break_use_wick2);

  // yields no contexto do timeframe da EMA
  const ctxB = await ctxP;
  const yC = await yieldsOn(env, ctxB, eTf, me, yTf, I.maturity);
  const useEma = I.yield_mode === 'Média (EMA)';
  const onCtx = s => ctxB === ch ? s : pick(s, secIndex(ch, ctxB, env.api.tfSec(eTf) < env.api.tfSec(T)));
  const tc = src => trendCalc(src, I.yield_ema_fast, I.yield_ema_slow, I.yield_minBars, useEma).map(onCtx);
  const nan = () => new Array(ctxB.length).fill(NaN);
  const [bUp, bDn] = tc(agg(yC, base)), [qUp, qDn] = tc(agg(yC, quote));
  const yb = yC[base] || nan(), yq = yC[quote] || nan();
  const [dUp, dDn] = tc(yb.map((v, i) => v - yq[i]));

  const maColor = i => dUp[i] === true ? C.lime : dDn[i] === true ? C.red : C.gray;
  out.line(null, ma1, maColor, 2); out.line(null, ma2, maColor, 3); out.line(null, ma3, maColor, 1);

  const b1 = I.barcolor_source === 'Band 1';
  out.barcolor(null, ch.map((_, i) => b1
    ? (I.show_atr_break && bu1[i] ? C.yellow : I.show_atr_break && bl1[i] ? C.aqua : null)
    : (I.show_atr_break2 && bu2[i] ? C.yellow : I.show_atr_break2 && bl2[i] ? C.aqua : null)));

  const tiny = (title, cond, location, up, color) => out.shape(title, cond, { location, shape: up ? 'shape_triangle_up' : 'shape_triangle_down', color, size: 'tiny' });
  tiny('Yield Base Subindo', bUp, 'BelowBar', true, C.lime); tiny('Yield Base Caindo', bDn, 'BelowBar', false, C.red);
  tiny('Yield Quote Subindo', qUp, 'AboveBar', true, C.lime); tiny('Yield Quote Caindo', qDn, 'AboveBar', false, C.red);
  return out.ctx();
}

// yields no gráfico e no contexto da EMA (os dois já com timeframe ≥ o do gráfico)
async function yieldCtx(env, I) {
  const ch = env.chart, T = env.chartTf, me = env.ticker;
  const yTf = atLeastChart(env, I.yield_tf), eTf = atLeastChart(env, I.ema_tf);
  const [yCh, ctxB] = await Promise.all([yieldsOn(env, ch, T, me, yTf, I.maturity), env.bars(me, eTf)]);
  const yC = ctxB === ch ? yCh : await yieldsOn(env, ctxB, eTf, me, yTf, I.maturity);
  const onCtx = s => ctxB === ch ? s : pick(s, secIndex(ch, ctxB, env.api.tfSec(eTf) < env.api.tfSec(T)));
  return { yCh, yC, onCtx };
}

// ================= Yield Strength (agregado da moeda) =================
async function runYSA(env, I) {
  const ch = env.chart;
  const out = new Out(ch, 'Yield Strength');
  const { yCh, yC, onCtx } = await yieldCtx(env, I);
  const spread = agg(yCh, I.moeda);
  const sC = agg(yC, I.moeda); const e1c = ema(sC, I.ema_fast), e2c = ema(sC, I.ema_slow);
  let up = 0, dn = 0; const U = [], D = [];
  for (let i = 0; i < sC.length; i++) { if (e1c[i] > e2c[i]) { up++; dn = 0; } else { dn++; up = 0; } U.push(up); D.push(dn); }
  const ema1 = onCtx(e1c), ema2 = onCtx(e2c), barsUp = onCtx(U), barsDown = onCtx(D);
  const cu = barsUp.map(v => v >= I.minBars), cd = barsDown.map(v => v >= I.minBars);
  const cur = i => cu[i] ? C.lime : cd[i] ? C.red : C.gray;
  out.line('Agregado', spread, C.gray); out.line('EMA Curta', ema1, cur, 2); out.line('EMA Longa', ema2, cur, 2);
  out.shape('Confirmado Alta', barsUp.map(v => v === I.minBars), { location: 'BelowBar', shape: 'shape_triangle_up', color: C.lime, size: 'small' });
  out.shape('Confirmado Baixa', barsDown.map(v => v === I.minBars), { location: 'AboveBar', shape: 'shape_triangle_down', color: C.red, size: 'small' });
  out.barcolor('Cor do Candle', ch.map((_, i) => cu[i] ? C.lime : cd[i] ? C.red : null));
  return out.ctx();
}

// ================= Yield Strength (spread do par) =================
async function runYSP(env, I) {
  const ch = env.chart, sym = env.api.short(env.ticker);
  const out = new Out(ch, 'Yield Strength');
  const base = sym.slice(0, 3), quote = sym.slice(3, 6);
  const { yCh, yC, onCtx } = await yieldCtx(env, I);
  const pickY = (y, c) => y[CURS.includes(c) ? c : 'CHF'];
  const spread = pickY(yCh, base).map((v, i) => v - pickY(yCh, quote)[i]);
  const sC = pickY(yC, base).map((v, i) => v - pickY(yC, quote)[i]);
  const ema1 = onCtx(ema(sC, I.ema_fast)), ema2 = onCtx(ema(sC, I.ema_slow));
  const cur = i => ema1[i] > ema2[i] ? C.lime : ema1[i] < ema2[i] ? C.red : C.gray;
  out.line('Spread', spread, C.gray); out.line('EMA Curta', ema1, cur, 2); out.line('EMA Longa', ema2, cur, 2);
  return out.ctx();
}

const ENGINES = new Map([[norm(srcCSA), runCSA], [norm(srcYSA), runYSA], [norm(srcYSP), runYSP]]);
export const hasNative = source => ENGINES.has(norm(source));

// entradas: mesmo critério do PineTS (por id, ou pelo título); a leitura das entradas fica em cache
const metaCache = new Map();
function inputsOf(source, given = {}, api) {
  const k = norm(source); if (!metaCache.has(k)) metaCache.set(k, new Indicator(source).getInputsMeta());
  const meta = metaCache.get(k); const I = {};
  for (const m of meta) { let v = given[m.id] ?? given[m.title] ?? m.defval; if (m.type === 'timeframe') v = String(v ?? '') === '' ? '' : api.tfId(v); I[m.varId] = v; }
  return I;
}

// api: { get(sym, tf) → barras {openTime, closeTime, open, high, low, close}, tfSec(tf), short(ticker) }
export async function runNative(source, inputs, { api, chart, chartTf, ticker }) {
  const fn = ENGINES.get(norm(source)); if (!fn) throw new Error('sem motor nativo');
  const env = new Env(api, chart, chartTf, ticker);
  return fn(env, inputsOf(source, inputs, api));
}
