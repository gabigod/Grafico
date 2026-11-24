// Motor de indicadores: roda Pine Script (v5/v6) com o PineTS e desenha o resultado no gráfico.
import { PineTS, Indicator } from 'pinets';
import { LineSeries, HistogramSeries, AreaSeries, LineStyle, LineType, createSeriesMarkers } from 'lightweight-charts';
import * as oanda from './oanda.js';
import { store, uid } from './store.js';
import { getBars, putBars } from './barcache.js';
import { hasNative, runNative } from './native.js';
import srcCSA from './pine/currency-strength-atr-yield.pine?raw';
import srcYSA from './pine/yield-strength-agregado.pine?raw';
import srcYSP from './pine/yield-strength-par.pine?raw';
import oldCSA from './pine/legacy/currency-strength-atr-yield.pine?raw';
import oldYSA from './pine/legacy/yield-strength-agregado.pine?raw';
import oldYSP from './pine/legacy/yield-strength-par.pine?raw';

const YF = `f(cur) => cur == "USD" ? "US" : cur == "EUR" ? "DE" : cur == "GBP" ? "GB" : cur == "JPY" ? "JP" : cur == "AUD" ? "AU" : cur == "CAD" ? "CA" : cur == "CHF" ? "CH" : cur == "NZD" ? "NZ" : "US"`;
// indicadores do Tem: vêm prontos no app (o primeiro já entra ativo)
export const MY_DEFAULTS = [
  { name: 'Currency Strength + ATR + Yield Arrows', source: srcCSA, auto: true },
  { name: 'Yield Strength (agregado da moeda)', source: srcYSA },
  { name: 'Yield Strength (spread do par)', source: srcYSP },
];
export const BUILTINS = [
  ...MY_DEFAULTS,
  { name: 'Spread de yield 10 anos do par (base − cotada)', source: `//@version=5
indicator("Spread de yield", format=format.price, precision=3)
mat = "10Y"
len = input.int(20, "EMA", minval=1)
${YF}
b = request.security(f(syminfo.basecurrency) + mat, "D", close)
q = request.security(f(syminfo.currency) + mat, "D", close)
s = b - q
e = ta.ema(s, len)
plot(s, "Spread", color=s >= e ? #089981 : #f23645, linewidth=2)
plot(e, "EMA", color=#787b86)
hline(0, "Zero", color=#787b86)` },
  { name: 'Volume', source: `//@version=5
indicator("Volume", format=format.volume)
plot(volume, "Volume", style=plot.style_columns, color=close >= open ? color.new(#089981, 50) : color.new(#f23645, 50))
plot(ta.sma(volume, 20), "Média", color=#2962ff)` },
  { name: 'Média Móvel Exponencial', source: `//@version=5
indicator("EMA", overlay=true)
len = input.int(21, "Período", minval=1)
src = input.source(close, "Fonte")
plot(ta.ema(src, len), "EMA", color=#ff9800, linewidth=2)` },
  { name: 'Média Móvel Simples', source: `//@version=5
indicator("SMA", overlay=true)
len = input.int(50, "Período", minval=1)
src = input.source(close, "Fonte")
plot(ta.sma(src, len), "SMA", color=#2962ff, linewidth=2)` },
  { name: 'Bandas de Bollinger', source: `//@version=5
indicator("BB", overlay=true)
len = input.int(20, "Período", minval=1)
mult = input.float(2.0, "Desvio", step=0.1)
basis = ta.sma(close, len)
dev = mult * ta.stdev(close, len)
plot(basis, "Base", color=#ff6d00)
u = plot(basis + dev, "Superior", color=#2962ff)
l = plot(basis - dev, "Inferior", color=#2962ff)
fill(u, l, color=color.rgb(33, 150, 243, 95))` },
  { name: 'RSI', source: `//@version=5
indicator("RSI", format=format.price, precision=2)
len = input.int(14, "Período", minval=1)
r = ta.rsi(close, len)
plot(r, "RSI", color=#7e57c2, linewidth=2)
hline(70, "Sobrecompra", color=#787b86)
hline(50, "Meio", color=#787b86)
hline(30, "Sobrevenda", color=#787b86)` },
  { name: 'MACD', source: `//@version=5
indicator("MACD")
fast = input.int(12, "Rápida")
slow = input.int(26, "Lenta")
sig = input.int(9, "Sinal")
[m, s, h] = ta.macd(close, fast, slow, sig)
plot(h, "Histograma", style=plot.style_columns, color=h >= 0 ? (h > h[1] ? #26a69a : #b2dfdb) : (h < h[1] ? #ff5252 : #ffcdd2))
plot(m, "MACD", color=#2962ff)
plot(s, "Sinal", color=#ff6d00)` },
  { name: 'Estocástico', source: `//@version=5
indicator("Stoch")
k = input.int(14, "%K")
d = input.int(3, "%D")
sm = input.int(3, "Suavização")
kk = ta.sma(ta.stoch(close, high, low, k), sm)
plot(kk, "%K", color=#2962ff)
plot(ta.sma(kk, d), "%D", color=#ff6d00)
hline(80, "Alta", color=#787b86)
hline(20, "Baixa", color=#787b86)` },
  { name: 'ATR', source: `//@version=5
indicator("ATR")
len = input.int(14, "Período")
plot(ta.atr(len), "ATR", color=#b71c1c)` },
];

const SHAPE = { shape_triangle_up: 'arrowUp', shape_arrow_up: 'arrowUp', shape_label_up: 'arrowUp', shape_triangle_down: 'arrowDown', shape_arrow_down: 'arrowDown', shape_label_down: 'arrowDown', shape_circle: 'circle', shape_square: 'square', shape_diamond: 'square', shape_xcross: 'circle', shape_cross: 'circle', shape_flag: 'square' };
const POS = { AboveBar: 'aboveBar', BelowBar: 'belowBar', Top: 'aboveBar', Bottom: 'belowBar', Absolute: 'inBar' };
const SIZE = { tiny: 0.5, small: 0.8, normal: 1, large: 1.5, huge: 2, auto: 1 };

export function toRgba(c, fallback = 'rgba(0,0,0,0)') {
  if (c === null || c === undefined || (typeof c === 'number' && isNaN(c))) return fallback;
  c = String(c);
  if (/^#[0-9a-f]{8}$/i.test(c)) { const n = parseInt(c.slice(1), 16); return `rgba(${(n >>> 24) & 255},${(n >>> 16) & 255},${(n >>> 8) & 255},${((n & 255) / 255).toFixed(3)})`; }
  return c;
}
const isNA = v => v === null || v === undefined || (typeof v === 'number' && isNaN(v));
const tfToId = tf => {
  const s = String(tf || '').toUpperCase();
  if (['D', '1D'].includes(s)) return 'D'; if (['W', '1W'].includes(s)) return 'W'; if (['M', '1M'].includes(s)) return 'M';
  if (s.endsWith('H')) return String(parseInt(s) * 60);
  return String(parseInt(s) || 'D');
};

export class Scripts {
  constructor(core, ui) {
    this.core = core; this.ui = ui;
    this.active = store.get('scripts:active', null) ?? [];
    this.lib = store.get('scripts:lib', []);
    this.results = {}; this.rendered = []; this.mainMarkers = null; this.runId = 0; this.cache = new Map(); this.missing = new Set();
    if (!store.get('pinedefaults:v1', false)) {
      for (const d of MY_DEFAULTS.filter(x => x.auto)) if (!this.active.some(a => a.name === d.name)) this.active.push({ id: uid(), name: d.name, source: d.source, inputs: {}, visible: true });
      store.set('pinedefaults:v1', true); this.saveActive();
    }
    // v2: versões enxutas (sem tabelas/placar de força). Troca o código antigo pelo novo, mantendo os ajustes.
    if (!store.get('pinedefaults:v2', false)) {
      const n = x => String(x || '').replace(/\r\n?/g, '\n').trim();
      const map = [[oldCSA, srcCSA], [oldYSA, srcYSA], [oldYSP, srcYSP]];
      for (const a of this.active) {
        const hit = map.find(([o]) => n(o) === n(a.source)) || (MY_DEFAULTS.find(d => d.name === a.name) && [null, MY_DEFAULTS.find(d => d.name === a.name).source]);
        if (hit) a.source = hit[1];
      }
      store.set('pinedefaults:v2', true); this.saveActive();
    }
    core.on('beforeMainRemove', () => { this.mainMarkers?.detach?.(); this.mainMarkers = null; this.clearRendered(); });
    core.on('mainSeries', () => this.renderAll());
    core.on('range', () => requestAnimationFrame(() => this.placeTables()));
    window.addEventListener('resize', () => setTimeout(() => this.placeTables(), 80));
  }
  saveActive() { store.set('scripts:active', this.active.map(({ id, name, source, inputs, visible, styles, tfs }) => ({ id, name, source, inputs, visible, styles, tfs }))); }
  saveLib() { store.set('scripts:lib', this.lib); }

  add(name, source) { const s = { id: uid(), name, source, inputs: {}, visible: true }; this.active.push(s); this.saveActive(); this.runAll(); return s; }
  remove(id) { this.active = this.active.filter(s => s.id !== id); delete this.results[id]; this.saveActive(); this.renderAll(); }
  toggle(id) { const s = this.active.find(x => x.id === id); if (s) { s.visible = !s.visible; this.saveActive(); this.renderAll(); } }
  setInputs(id, inputs) { const s = this.active.find(x => x.id === id); if (s) { s.inputs = inputs; this.saveActive(); this.runAll(); } }
  inputsMeta(source) { try { return new Indicator(source).getInputsMeta(); } catch { return []; } }

  kl(b, sec) { return { openTime: b.time * 1000, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume || 0, closeTime: (b.time + sec) * 1000 - 1 }; }
  // dados para o motor nativo (indicadores prontos do app)
  nativeApi() {
    const kl = (b, sec) => this.kl(b, sec);
    return {
      get: async (sym, tf) => { try { return await this.fetchFor(sym, tf, undefined, undefined, kl); } catch { this.missing.add(String(sym).split(':').pop() || '?'); return []; } },
      tfSec: tf => oanda.tfById(tfToId(tf)).sec, tfId: tf => oanda.tfById(tfToId(tf)).id,
      short: t => oanda.short(oanda.resolveTicker(t)).replace(/[^A-Z0-9]/gi, '').toUpperCase(),
      key: t => oanda.resolveTicker(t),
    };
  }

  // ---------- dados para o PineTS ----------
  provider() {
    const core = this.core;
    const kl = (b, sec) => this.kl(b, sec);
    return {
      configure() { },
      getSymbolInfo: async t => {
        const name = oanda.resolveTicker(t); const i = oanda.instInfo(name); const prec = i.prec ?? 5; const kk = name.replace(/[^A-Z]/gi, '').toUpperCase();
        let [base, quote] = name.split('_'); if (!quote && /^[A-Z]{6}$/.test(kk)) { base = kk.slice(0, 3); quote = kk.slice(3); }
        return { ticker: oanda.short(name), tickerid: 'OANDA:' + oanda.short(name), description: i.display, type: i.type === 'CURRENCY' ? 'forex' : i.type === 'YIELD' ? 'bond' : 'cfd', basecurrency: base, currency: quote || 'USD',
          mintick: Math.pow(10, -prec), pricescale: Math.pow(10, prec), minmove: 1, pointvalue: 1, timezone: 'America/New_York', session: '24x7', root: base, prefix: 'OANDA', main_tickerid: 'OANDA:' + oanda.short(name) };
      },
      getMarketData: async (ticker, tf, limit, sDate, eDate) => {
        // ativo sem dados (ex.: yield que a CNBC não entregou) vira na, como no TradingView, sem derrubar o script inteiro
        try { return await this.fetchFor(ticker, tf, sDate, eDate, kl); }
        catch (e) { this.missing.add(String(ticker).split(':').pop() || '?'); return []; }
      },
    };
  }
  async fetchFor(ticker, tf, sDate, eDate, kl) {
        const core = this.core;
        if (!String(ticker || '').trim()) throw new Error('símbolo vazio');
        {
        const inst = oanda.resolveTicker(ticker); const tfo = oanda.tfById(tfToId(tf));
        const cut = core.replayCutReal;
        if (inst === core.instrument && tfo.id === core.tf.id) {
          let v = core.view(); if (eDate) v = v.filter(b => b.time * 1000 <= eDate);
          return v.map(b => kl(b, tfo.sec));
        }
        const key = `${inst}|${tfo.gran}|${cut || ''}|${tfo.sec < 86400 ? core.view().length : ''}`;
        const hit = this.cache.get(key);
        let bars;
        if (hit && Date.now() - hit.at < 30000) bars = hit.bars;
        else {
          const opts = { count: 2000, to: cut || undefined, chartTimes: tfo.id === core.tf.id ? core.view().map(b => b.time) : undefined };
          const isY = oanda.isYield(inst);
          if (inst === 'DXY' || /DXY$/.test(inst)) bars = await oanda.dxyCandles(tfo.gran, opts);
          else if (isY || cut) bars = await oanda.candles(inst, tfo.gran, opts);
          else {
            // mesmo cache do gráfico: só busca o que falta
            const ck = `${oanda.feedName()}|${inst}|${tfo.gran}`; const rec = await getBars(ck);
            if (rec && Date.now() - rec.at < 30000) bars = rec.bars;
            else { const { ChartCore } = await import('./chart.js'); bars = await ChartCore.fetchFresh(inst, tfo, rec?.bars); putBars(ck, { at: Date.now(), bars }); }
          }
          this.cache.set(key, { at: Date.now(), bars });
        }
        if (cut) bars = bars.filter(b => b.ot < cut);
        if (eDate) bars = bars.filter(b => b.time * 1000 <= eDate);
        if (sDate) bars = bars.filter(b => b.time * 1000 >= sDate);
        return bars.map(b => kl(b, tfo.sec));
        }
  }

  // ---------- execução ----------
  async runAll() {
    const my = ++this.runId; const view = this.core.view(); if (!view.length) return;
    const prov = this.provider(); const ticker = 'OANDA:' + oanda.short(this.core.instrument);
    for (const s of this.active) {
      if (my !== this.runId) return;
      try {
        this.missing = new Set(); let ctx;
        if (hasNative(s.source)) ctx = await runNative(s.source, s.inputs || {}, { api: this.nativeApi(), chart: view.map(b => this.kl(b, this.core.tf.sec)), chartTf: this.core.tf.id, ticker });
        else {
          const ind = new Indicator(s.source, s.inputs || {});
          const pine = new PineTS(prov, ticker, this.core.tf.id, view.length);
          ctx = await pine.run(ind);
        }
        const miss = [...this.missing];
        this.results[s.id] = { ctx, error: null, warn: miss.length ? 'Sem dados: ' + miss.slice(0, 6).join(', ') + (miss.length > 6 ? '…' : '') : null, len: view.length };
      } catch (e) {
        this.results[s.id] = { ctx: null, error: (e && (e.message || String(e))).split('\n')[0].slice(0, 160) };
      }
    }
    if (my === this.runId) this.renderAll();
  }

  clearRendered() {
    const chart = this.core.chart;
    for (const r of this.rendered) {
      try { r.prim && r.target.detachPrimitive(r.prim); } catch { /* */ }
      try { r.markers?.detach?.(); } catch { /* */ }
      for (const s of r.series) { try { chart.removeSeries(s); } catch { /* */ } }
    }
    this.rendered = [];
    try { while (chart.panes().length > 1) chart.removePane(chart.panes().length - 1); } catch { /* */ }
  }

  renderAll() {
    this.clearRendered();
    const chart = this.core.chart; const mainMk = []; const barCols = new Map(); const tables = [];
    const pr = priceRange(this.core.view());
    let pane = 1;
    for (const s of this.active) {
      const res = this.results[s.id]; if (!res || !res.ctx || !s.visible) continue;
      if (s.tfs && s.tfs.length < 5) { const sec = this.core.tf.sec; const g = sec < 3600 ? 'min' : sec < 86400 ? 'hour' : sec < 604800 ? 'day' : sec < 2e6 ? 'week' : 'month'; if (!s.tfs.includes(g)) continue; }
      const ovAll = s.styles || {};
      const ctx = res.ctx; const overlay = !!ctx.indicator?.overlay; const pIdx = overlay ? 0 : pane++;
      const r = { id: s.id, series: [], byTitle: {}, target: null, prim: null, markers: null, overlay };
      const plots = Object.entries(ctx.plots || {});
      const markers = []; const bands = []; const fills = [];
      const pf = overlay ? this.core.priceFormat() : { type: 'price', precision: 2, minMove: 0.01 };
      for (const [title, p] of plots) {
        if (title.startsWith('__')) continue;
        const ov = ovAll[title] || {}; if (ov.hidden) continue;
        const style = p.options?.style; const data = p.data || [];
        if (style === 'shape' || style === 'char' || style === 'arrow' || style === 'label') {
          for (const d of data) {
            if (isNA(d.value) || d.value === false || d.value === 0) continue;
            const o = { ...p.options, ...(d.options || {}) };
            markers.push({ time: d.time / 1000, position: POS[o.location] || 'aboveBar', shape: style === 'char' ? 'circle' : (SHAPE[o.shape] || 'circle'), color: toRgba(o.color, '#2962ff'), size: style === 'char' ? 0 : (SIZE[o.size] || 1), text: style === 'char' ? (o.char || '•') : (o.text || '') });
          }
          continue;
        }
        if (style === 'background') { for (const d of data) if (!isNA(d.value) && d.options?.color) bands.push({ time: d.time / 1000, color: toRgba(d.options.color) }); continue; }
        if (style === 'fill') { fills.push({ a: p.options.plot1, b: p.options.plot2, colors: data.map(d => toRgba(d.options?.color ?? p.options.color)) }); continue; }
        if (style === 'barcolor') {
          for (const d of data) { const c = d.options?.color ?? (d.value !== true && typeof d.value === 'string' ? d.value : null); if (!isNA(d.value) && d.value !== false && c) barCols.set(d.time / 1000, toRgba(c)); }
          continue;
        }
        const vals = data.map(d => d.value);
        const fin = vals.filter(v => typeof v === 'number' && isFinite(v));
        const constant = fin.length > 5 && fin.every(v => v === fin[0]);
        // overlay com valores longe do preço (ex.: spread de yield): escala própria, para não achatar os candles
        const ownScale = overlay && pr && fin.length > 5 && offPrice(fin, pr);
        const baseColor = ov.color || toRgba(p.options?.color, '#2962ff');
        const lw = ov.width || Math.max(1, Math.min(4, p.options?.linewidth || 1));
        const lsty = ov.style === 'dashed' ? LineStyle.Dashed : ov.style === 'dotted' ? LineStyle.Dotted : null;
        let series, rows;
        if (style === 'style_histogram' || style === 'style_columns') {
          series = chart.addSeries(HistogramSeries, { priceFormat: pf, lastValueVisible: true, priceLineVisible: false, base: 0 }, pIdx);
          rows = data.map(d => isNA(d.value) ? { time: d.time / 1000 } : { time: d.time / 1000, value: d.value, color: ov.color || toRgba(d.options?.color, baseColor) });
        } else if (style === 'style_area' || style === 'style_areabr') {
          series = chart.addSeries(AreaSeries, { priceFormat: pf, lineColor: baseColor, topColor: baseColor.replace(/[\d.]+\)$/, '0.3)'), bottomColor: 'rgba(0,0,0,0)', lineWidth: lw, priceLineVisible: false }, pIdx);
          rows = data.map(d => isNA(d.value) ? { time: d.time / 1000 } : { time: d.time / 1000, value: d.value });
        } else {
          const dots = style === 'style_circles' || style === 'style_cross';
          series = chart.addSeries(LineSeries, {
            ...(ownScale ? { priceScaleId: 'own-' + s.id + '-' + title } : {}),
            priceFormat: ownScale ? { type: 'price', precision: 3, minMove: 0.001 } : pf, color: baseColor, lineWidth: constant && !ov.width ? 1 : lw, lineStyle: lsty ?? (constant ? LineStyle.Dashed : LineStyle.Solid),
            lineType: style === 'style_stepline' ? LineType.WithSteps : LineType.Simple, lineVisible: !dots, pointMarkersVisible: dots, pointMarkersRadius: dots ? 2 : undefined,
            lastValueVisible: !constant && !ownScale, priceLineVisible: false, crosshairMarkerVisible: !constant, crosshairMarkerRadius: 3,
          }, pIdx);
          rows = data.map(d => isNA(d.value) ? { time: d.time / 1000 } : { time: d.time / 1000, value: d.value, color: !ov.color && d.options && 'color' in d.options ? toRgba(d.options.color) : undefined });
        }
        if (ownScale) { try { series.priceScale().applyOptions({ scaleMargins: { top: 0.15, bottom: 0.15 } }); } catch { /* */ } }
        try { series.setData(rows); } catch { series.setData(dedupe(rows)); }
        r.series.push(series); r.byTitle[title] = { series, vals };
      }
      const draw = (k) => ctx.plots[k]?.data?.[0]?.value?.filter?.(o => !o._deleted) || [];
      for (const t of draw('__tables__')) tables.push(t);
      const objs = { lines: draw('__lines__'), boxes: draw('__boxes__'), labels: draw('__labels__') };
      r.target = overlay ? this.core.main : r.series[0];
      if (r.target && (bands.length || fills.length || objs.lines.length || objs.boxes.length || objs.labels.length)) {
        r.prim = makeOverlay(this.core, r, { bands, fills, ...objs }); r.target.attachPrimitive(r.prim);
      }
      if (markers.length) {
        if (overlay) mainMk.push(...markers);
        else if (r.series[0]) r.markers = createSeriesMarkers(r.series[0], markers.sort((a, b) => a.time - b.time));
      }
      this.rendered.push(r);
    }
    try {
      const panes = chart.panes();
      panes[0].setStretchFactor(panes.length > 2 ? 2.2 : 3);
      for (let i = 1; i < panes.length; i++) panes[i].setStretchFactor(1);
    } catch { /* */ }
    this.core.setBarColors(barCols);
    this.renderTables(tables);
    this.mainMarkers?.detach?.();
    this.mainMarkers = mainMk.length ? createSeriesMarkers(this.core.main, mainMk.sort((a, b) => a.time - b.time)) : null;
    this.ui.onScriptsRendered?.();
  }

  // table.new / table.cell do Pine, desenhada por cima do gráfico (posição igual à do TradingView)
  renderTables(tables) {
    const host = this.core.el.parentElement; if (!host) return;
    let box = host.querySelector(':scope > .ptables');
    if (!tables.length) { box?.remove(); return; }
    if (!box) { box = document.createElement('div'); box.className = 'ptables'; host.appendChild(box); }
    this.placeTables(box);
    const SZ = { tiny: 9, small: 10.5, normal: 12, large: 15, huge: 19, auto: 12 };
    const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const col = (c, d) => { const v = toRgba(c, ''); return v || d; };
    box.innerHTML = tables.map(t => {
      const pos = String(t.position || 'top_right').replace('position.', '');
      const rows = (t.cells || []).map(r => (r || []).filter(Boolean)).filter(r => r.some(c => c && String(c.text ?? '') !== ''));
      const bw = t.border_width ? `${t.border_width}px solid ${col(t.border_color, 'rgba(120,123,134,.35)')}` : '0';
      const html = rows.map(r => '<tr>' + r.map(c => {
        if (c._merged) return '';
        const bg = col(c.bgcolor, ''); let tc = col(c.text_color, 'var(--text)');
        if (!bg && /^(#000000|#000|rgba\(0,0,0,1(\.0+)?\))$/i.test(tc)) tc = 'var(--text)'; // preto padrão do Pine sumiria no fundo preto
        return `<td style="${bg ? 'background:' + bg + ';' : ''}color:${tc};font-size:${SZ[c.text_size] || 12}px;text-align:${String(c.text_halign || 'center').replace(/.*_/, '')};border:${bw}">${esc(c.text)}</td>`;
      }).join('') + '</tr>').join('');
      return `<table class="pt ${pos}" style="${t.bgcolor ? 'background:' + col(t.bgcolor, '') + ';' : ''}${t.frame_width ? `outline:${t.frame_width}px solid ${col(t.frame_color, 'transparent')};` : ''}">${html}</table>`;
    }).join('');
  }

  placeTables(box = this.core.el.parentElement?.querySelector(':scope > .ptables')) {
    if (!box) return;
    const chart = this.core.chart; let rw = 60, th = 28, ph = null;
    try { rw = chart.priceScale('right').width(); th = chart.timeScale().height(); ph = chart.panes()[0].getHeight(); } catch { /* */ }
    box.style.right = rw + 'px'; box.style.bottom = (ph ? Math.max(0, this.core.el.clientHeight - ph) : th) + 'px';
  }

  // valores para a legenda no índice i
  valuesAt(i) {
    const out = {};
    for (const s of this.active) {
      const res = this.results[s.id]; if (!res) continue;
      if (res.error) { out[s.id] = { error: res.error }; continue; }
      const vals = [];
      for (const [title, p] of Object.entries(res.ctx.plots || {})) {
        if (title.startsWith('__') || ['shape', 'char', 'background', 'fill', 'barcolor', 'label', 'arrow'].includes(p.options?.style)) continue;
        const d = p.data?.[i ?? p.data.length - 1]; if (!d) continue;
        vals.push({ v: d.value, color: toRgba(d.options?.color ?? p.options?.color, '#2962ff') });
      }
      out[s.id] = { title: res.ctx.indicator?.shorttitle || res.ctx.indicator?.title || s.name, vals, overlay: !!res.ctx.indicator?.overlay, warn: res.warn };
    }
    return out;
  }
}

function priceRange(view) {
  if (!view.length) return null; let lo = Infinity, hi = -Infinity;
  for (const b of view) { if (b.low < lo) lo = b.low; if (b.high > hi) hi = b.high; }
  return isFinite(lo) && isFinite(hi) ? { lo, hi } : null;
}
// a mediana da série cai bem fora da faixa de preço do gráfico?
function offPrice(vals, { lo, hi }) {
  const sorted = [...vals].sort((a, b) => a - b); const med = sorted[Math.floor(sorted.length / 2)];
  const span = Math.max(hi - lo, Math.abs(hi) * 0.01);
  return med < lo - span * 0.5 || med > hi + span * 0.5;
}
function dedupe(rows) { const m = new Map(); for (const r of rows) m.set(r.time, r); return [...m.values()].sort((a, b) => a.time - b.time); }

// Primitive que desenha bgcolor, fill, line.new, box.new e label.new do Pine.
function makeOverlay(core, r, d) {
  const conv = { x: (xv, xloc) => xloc === 'bt' ? core.xOf(xv / 1000) : core.xOfLogical(xv), y: p => r.target.priceToCoordinate(p) };
  const renderer = {
    draw(target) {
      target.useBitmapCoordinateSpace(sc => {
        const ctx = sc.context; ctx.save(); ctx.scale(sc.horizontalPixelRatio, sc.verticalPixelRatio);
        const H = sc.mediaSize.height, W = sc.mediaSize.width;
        const range = core.chart.timeScale().getVisibleLogicalRange(); if (!range) { ctx.restore(); return; }
        const from = Math.max(0, Math.floor(range.from) - 1), to = Math.ceil(range.to) + 1;
        const view = core.view(); const half = (core.xOfLogical(1) - core.xOfLogical(0)) / 2;
        if (d.bands.length) {
          const idx = new Map(view.map((b, i) => [b.time, i]));
          for (const b of d.bands) { const i = idx.get(b.time); if (i === undefined || i < from || i > to) continue; const x = core.xOfLogical(i); ctx.fillStyle = b.color; ctx.fillRect(x - half, 0, half * 2 + 0.5, H); }
        }
        for (const f of d.fills) {
          const A = r.byTitle[f.a]?.vals, B = r.byTitle[f.b]?.vals; if (!A || !B) continue;
          for (let i = Math.max(from, 0); i < Math.min(to, A.length - 1); i++) {
            const a0 = A[i], a1 = A[i + 1], b0 = B[i], b1 = B[i + 1];
            if ([a0, a1, b0, b1].some(v => typeof v !== 'number' || !isFinite(v))) continue;
            const x0 = core.xOfLogical(i), x1 = core.xOfLogical(i + 1);
            ctx.fillStyle = f.colors[i] || 'rgba(41,98,255,0.1)'; ctx.beginPath();
            ctx.moveTo(x0, conv.y(a0)); ctx.lineTo(x1, conv.y(a1)); ctx.lineTo(x1, conv.y(b1)); ctx.lineTo(x0, conv.y(b0)); ctx.closePath(); ctx.fill();
          }
        }
        for (const b of d.boxes) {
          const x1 = conv.x(b.left, b.xloc), x2 = b.extend === 'right' || b.extend === 'both' ? W : conv.x(b.right, b.xloc), y1 = conv.y(b.top), y2 = conv.y(b.bottom);
          if ([x1, x2, y1, y2].some(v => v === null)) continue;
          ctx.fillStyle = toRgba(b.bgcolor, 'rgba(41,98,255,0.15)'); ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
          if (b.border_width) { ctx.strokeStyle = toRgba(b.border_color, '#2962ff'); ctx.lineWidth = b.border_width; ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)); }
          if (b.text) { ctx.fillStyle = toRgba(b.text_color, '#fff'); ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(b.text, (x1 + x2) / 2, (y1 + y2) / 2); }
        }
        for (const l of d.lines) {
          let x1 = conv.x(l.x1, l.xloc), x2 = conv.x(l.x2, l.xloc), y1 = conv.y(l.y1), y2 = conv.y(l.y2);
          if ([x1, x2, y1, y2].some(v => v === null)) continue;
          if (l.extend && l.extend !== 'none' && x2 !== x1) {
            const k = (y2 - y1) / (x2 - x1);
            if (l.extend === 'right' || l.extend === 'both') { y2 = y1 + k * (W - x1); x2 = W; }
            if (l.extend === 'left' || l.extend === 'both') { y1 = y1 - k * x1; x1 = 0; }
          }
          ctx.strokeStyle = toRgba(l.color, '#2962ff'); ctx.lineWidth = l.width || 1;
          ctx.setLineDash(l.style === 'style_dashed' ? [6, 4] : l.style === 'style_dotted' ? [2, 3] : []);
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]);
        }
        for (const lb of d.labels) {
          const x = conv.x(lb.x, lb.xloc); let y = conv.y(lb.y); if (x === null || y === null || !lb.text) continue;
          ctx.font = '600 11px sans-serif'; const w = ctx.measureText(lb.text).width + 10; const down = /down/.test(lb.style || '');
          const by = down ? y - 26 : y + 8;
          ctx.fillStyle = toRgba(lb.color, '#2962ff'); ctx.beginPath(); ctx.roundRect(x - w / 2, by, w, 18, 3); ctx.fill();
          ctx.fillStyle = toRgba(lb.textcolor, '#fff'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(lb.text, x, by + 9);
        }
        ctx.restore();
      });
    },
  };
  const view = { zOrder: () => 'bottom', renderer: () => renderer };
  return { attached() { }, detached() { }, updateAllViews() { }, paneViews: () => [view] };
}
