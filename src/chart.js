// Núcleo do gráfico: série principal, dados, atualização ao vivo e conversão de coordenadas.
import { createChart, CandlestickSeries, BarSeries, LineSeries, AreaSeries, CrosshairMode, LineStyle } from 'lightweight-charts';
import * as oanda from './oanda.js';
import { store } from './store.js';
import { getBars, putBars } from './barcache.js';

export const THEMES = {
  dark: { bg: '#131722', text: '#d1d4dc', grid: 'rgba(42,46,57,0.55)', border: '#2a2e39', up: '#089981', down: '#f23645', cross: '#9598a1', accent: '#2962ff', muted: '#787b86' },
  light: { bg: '#ffffff', text: '#131722', grid: 'rgba(42,46,57,0.06)', border: '#e0e3eb', up: '#089981', down: '#f23645', cross: '#9598a1', accent: '#2962ff', muted: '#787b86' },
};

export class ChartCore {
  constructor(el) {
    this.el = el;
    this.theme = store.get('theme', 'dark');
    this.tz = store.get('tz', Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    this.ctype = store.get('ctype', 'candles');
    this.bars = []; this.viewLen = 0; this.instrument = 'EUR_USD'; this.tf = oanda.tfById('D');
    this.listeners = {}; this.loadSeq = 0; this.loadingMore = false; this.noMoreHistory = false; this.liveTimer = null; this.lastRefresh = 0;
    const t = THEMES[this.theme];
    this.chart = createChart(el, {
      autoSize: true,
      layout: { background: { color: t.bg }, textColor: t.text, fontSize: 11, attributionLogo: true, panes: { separatorColor: t.border, separatorHoverColor: 'rgba(41,98,255,0.3)', enableResize: true } },
      grid: { vertLines: { color: t.grid }, horzLines: { color: t.grid } },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: t.cross, labelBackgroundColor: '#363a45', style: LineStyle.Dashed }, horzLine: { color: t.cross, labelBackgroundColor: '#363a45', style: LineStyle.Dashed } },
      rightPriceScale: { borderColor: t.border, scaleMargins: { top: 0.12, bottom: 0.08 } },
      timeScale: { borderColor: t.border, timeVisible: true, secondsVisible: false, rightOffset: 8, barSpacing: 7, minBarSpacing: 0.5 },
      localization: { locale: 'pt-BR', timeFormatter: ts => this.fmtTime(ts, true) },
      kineticScroll: { touch: true, mouse: false },
    });
    this.chart.applyOptions({ timeScale: { tickMarkFormatter: (ts, type) => this.fmtTick(ts, type) } });
    this.makeMainSeries();
    this.chart.timeScale().subscribeVisibleLogicalRangeChange(r => { if (r && r.from < 30) this.loadMore(); this.emit('range', r); });
    this.chart.subscribeCrosshairMove(p => this.emit('crosshair', p));
  }

  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
  emit(ev, ...a) { (this.listeners[ev] || []).forEach(f => f(...a)); }

  // ---------- formatação de data ----------
  fmtTime(ts, full) {
    const d = new Date(ts * 1000);
    const daily = this.tf.sec >= 86400;
    const o = daily ? { timeZone: 'UTC', day: '2-digit', month: 'short', year: '2-digit', weekday: full ? 'short' : undefined }
      : { timeZone: this.tz, day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit', weekday: full ? 'short' : undefined };
    return new Intl.DateTimeFormat('pt-BR', o).format(d).replace('.', '');
  }
  fmtTick(ts, type) {
    const d = new Date(ts * 1000); const daily = this.tf.sec >= 86400; const tz = daily ? 'UTC' : this.tz;
    const f = o => new Intl.DateTimeFormat('pt-BR', { timeZone: tz, ...o }).format(d).replace('.', '');
    if (type === 0) return f({ year: 'numeric' });
    if (type === 1) return f({ month: 'short' });
    if (type === 2) return f({ day: 'numeric' });
    return f({ hour: '2-digit', minute: '2-digit' });
  }

  // ---------- série principal ----------
  priceFormat() { const p = oanda.instInfo(this.instrument).prec ?? 5; return { type: 'price', precision: p, minMove: Math.pow(10, -p) }; }
  makeMainSeries() {
    const t = THEMES[this.theme]; const pf = this.priceFormat();
    if (this.main) { this.emit('beforeMainRemove', this.main); this.chart.removeSeries(this.main); }
    const common = { priceFormat: pf, lastValueVisible: true, priceLineVisible: true, priceLineStyle: LineStyle.Dotted };
    if (this.ctype === 'bars') this.main = this.chart.addSeries(BarSeries, { ...common, upColor: t.up, downColor: t.down, thinBars: false });
    else if (this.ctype === 'line') this.main = this.chart.addSeries(LineSeries, { ...common, color: t.accent, lineWidth: 2 });
    else if (this.ctype === 'area') this.main = this.chart.addSeries(AreaSeries, { ...common, lineColor: t.accent, topColor: t.accent + '55', bottomColor: t.accent + '05', lineWidth: 2 });
    else if (this.ctype === 'hollow') this.main = this.chart.addSeries(CandlestickSeries, { ...common, upColor: 'rgba(0,0,0,0)', downColor: t.down, borderUpColor: t.up, borderDownColor: t.down, wickUpColor: t.up, wickDownColor: t.down });
    else this.main = this.chart.addSeries(CandlestickSeries, { ...common, upColor: t.up, downColor: t.down, borderVisible: false, wickUpColor: t.up, wickDownColor: t.down });
    if (this.bars.length) this.main.setData(this.seriesData(this.view()));
    this.emit('mainSeries', this.main);
  }
  setChartType(type) { this.ctype = type; store.set('ctype', type); this.makeMainSeries(); }
  applyTheme(theme) {
    this.theme = theme; store.set('theme', theme); const t = THEMES[theme];
    this.chart.applyOptions({ layout: { background: { color: t.bg }, textColor: t.text, panes: { separatorColor: t.border } }, grid: { vertLines: { color: t.grid }, horzLines: { color: t.grid } },
      rightPriceScale: { borderColor: t.border }, timeScale: { borderColor: t.border } });
    this.makeMainSeries();
  }
  setTz(tz) { this.tz = tz; store.set('tz', tz); this.chart.applyOptions({ localization: { timeFormatter: ts => this.fmtTime(ts, true) } }); }

  view() { return this.viewLen ? this.bars.slice(0, this.viewLen) : this.bars; }
  seriesData(bars) {
    if (this.ctype === 'line' || this.ctype === 'area') return bars.map(b => ({ time: b.time, value: b.close }));
    if (this.ctype === 'heikin') {
      const out = []; let po, pc;
      for (const b of bars) {
        const c = (b.open + b.high + b.low + b.close) / 4; const o = po === undefined ? (b.open + b.close) / 2 : (po + pc) / 2;
        out.push({ time: b.time, open: o, close: c, high: Math.max(b.high, o, c), low: Math.min(b.low, o, c) }); po = o; pc = c;
      }
      return out;
    }
    return bars.map(b => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close }));
  }
  dataPoint(bars, i) { return this.seriesData(this.ctype === 'heikin' ? bars.slice(0, i + 1) : [bars[i]]).at(-1); }

  // ---------- carga de dados ----------
  cacheKey(inst = this.instrument, gran = this.tf.gran) { return `${oanda.feedName()}|${inst}|${gran}`; }
  applyBars(bars, { keepRange } = {}) {
    this.bars = bars;
    this.main.applyOptions({ priceFormat: this.priceFormat() });
    this.chart.applyOptions({ timeScale: { timeVisible: this.tf.sec < 86400 } });
    this.main.setData(this.seriesData(bars));
    if (!keepRange) this.showLast(this.defBars());
    this.emit('data', { reset: true });
  }
  // junta barras novas (do fim) com as do cache
  static merge(old, fresh) {
    if (!old.length) return fresh; if (!fresh.length) return old;
    const f0 = fresh[0].time; const keep = old.filter(b => b.time < f0);
    return keep.concat(fresh);
  }
  // busca só o que falta depois do cache; se o buraco for grande, recarrega
  static async fetchFresh(instrument, tf, cached) {
    const last = cached && cached.at(-1);
    if (last) {
      const missing = Math.ceil((Date.now() / 1000 - last.ot) / tf.sec) + 3;
      if (missing <= 1500) {
        const tail = await oanda.candles(instrument, tf.gran, { count: Math.max(5, missing) });
        return ChartCore.merge(cached, tail);
      }
    }
    return oanda.candles(instrument, tf.gran, { count: 1000 });
  }
  async load(instrument, tfId, { keepRange } = {}) {
    this.stopLive();
    const my = ++this.loadSeq;
    this.instrument = instrument; this.tf = oanda.tfById(tfId);
    this.noMoreHistory = false; this.viewLen = 0;
    const key = this.cacheKey(); const tf = this.tf;
    const rec = await getBars(key);
    if (my !== this.loadSeq) return this.bars;
    let cached = rec?.bars ? rec.bars.map(b => ({ ...b })) : null;
    if (cached?.length) this.applyBars(cached, { keepRange }); // aparece na hora
    const fresh = await ChartCore.fetchFresh(instrument, tf, cached);
    if (my !== this.loadSeq) return this.bars;
    putBars(key, { at: Date.now(), bars: fresh });
    if (cached?.length) {
      // mantém a posição do usuário: só troca os dados
      const range = this.chart.timeScale().getVisibleLogicalRange();
      const shift = fresh.length - cached.length;
      this.bars = fresh; this.main.setData(this.seriesData(fresh));
      if (range && Math.abs(shift) < 50) this.chart.timeScale().setVisibleLogicalRange({ from: range.from + shift, to: range.to + shift });
      else if (!keepRange) this.showLast(this.defBars());
      this.emit('data', { reset: true });
    } else this.applyBars(fresh, { keepRange });
    return this.bars;
  }
  defBars() { return Math.max(40, Math.min(150, Math.round((this.el.clientWidth || 800) / 7))); }
  showLast(n) {
    const len = this.view().length; if (!len) return;
    this.chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, len - n), to: len + 6 });
  }
  setViewLen(n, { full } = {}) {
    this.viewLen = n >= this.bars.length ? 0 : n;
    if (full) this.main.setData(this.seriesData(this.view()));
  }
  async loadMore() {
    if (this.loadingMore || this.noMoreHistory || !this.bars.length) return;
    this.loadingMore = true;
    try {
      const first = this.bars[0];
      const older = (await oanda.candles(this.instrument, this.tf.gran, { count: 1500, to: first.ot })).filter(b => b.ot < first.ot);
      if (!older.length) { this.noMoreHistory = true; return; }
      const range = this.chart.timeScale().getVisibleLogicalRange();
      this.bars = older.concat(this.bars);
      if (this.viewLen) this.viewLen += older.length;
      this.main.setData(this.seriesData(this.view()));
      if (range) this.chart.timeScale().setVisibleLogicalRange({ from: range.from + older.length, to: range.to + older.length });
      putBars(this.cacheKey(), { at: Date.now(), bars: this.bars });
      this.emit('data', { prepended: older.length });
    } catch (e) { this.emit('error', e); }
    finally { this.loadingMore = false; }
  }

  // ---------- ao vivo ----------
  startLive() {
    this.stopLive();
    const tick = async () => {
      if (this.viewLen) return; // em replay
      try {
        const [p] = await oanda.pricing([this.instrument], { name: this.instrument, gran: this.tf.gran });
        if (p && isFinite(p.mid)) this.applyTick(p);
        const now = Date.now();
        const last = this.bars.at(-1);
        const due = last && p && p.time >= last.ot + this.tf.sec && this.tf.sec < 86400;
        if (due || now - this.lastRefresh > 20000) { this.lastRefresh = now; await this.refreshTail(); }
      } catch (e) { this.emit('liveError', e); }
    };
    tick(); this.liveTimer = setInterval(tick, 1000);
  }
  stopLive() { clearInterval(this.liveTimer); this.liveTimer = null; }
  applyTick(p) {
    let last = this.bars.at(-1); if (!last) return;
    const lb = p.liveBar;
    if (lb && lb.time > last.time) {
      // barra nova chegou pelo fluxo ao vivo
      last.complete = true; this.bars.push({ ...lb, complete: false });
      if (!this.viewLen) { this.main.setData(this.seriesData(this.bars)); this.emit('newBar'); }
      return;
    }
    if (lb && lb.time === last.time) { Object.assign(last, { open: lb.open, high: Math.max(lb.high, p.mid), low: Math.min(lb.low, p.mid) }); last.complete = false; }
    if (last.complete) return;
    last.close = p.mid; last.high = Math.max(last.high, p.mid); last.low = Math.min(last.low, p.mid);
    if (!oanda.hasOanda()) oanda.demoTick(this.instrument, this.tf.gran, p.mid);
    this.main.update(this.dataPoint(this.bars, this.bars.length - 1));
    this.emit('tick', last, p);
  }
  async refreshTail() {
    const tail = await oanda.candles(this.instrument, this.tf.gran, { count: 3 });
    let added = false;
    for (const b of tail) {
      const i = this.bars.findIndex(x => x.time === b.time);
      if (i >= 0) Object.assign(this.bars[i], b);
      else if (!this.bars.length || b.time > this.bars.at(-1).time) { this.bars.push(b); added = true; }
    }
    if (this.viewLen) return;
    if (added) { this.main.setData(this.seriesData(this.bars)); this.emit('newBar'); }
    else this.main.update(this.dataPoint(this.bars, this.bars.length - 1));
    this.emit('tick', this.bars.at(-1));
  }

  // ---------- coordenadas (tempo <-> índice lógico <-> pixel) ----------
  interval() { const v = this.view(); return v.length > 1 ? v[v.length - 1].time - v[v.length - 2].time : this.tf.sec; }
  timeToLogical(t) {
    const v = this.view(); const n = v.length; if (!n) return 0;
    if (t <= v[0].time) return (t - v[0].time) / this.tf.sec;
    if (t >= v[n - 1].time) return n - 1 + (t - v[n - 1].time) / this.interval();
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (v[m].time <= t) lo = m; else hi = m; }
    return lo + (t - v[lo].time) / ((v[hi].time - v[lo].time) || 1);
  }
  logicalToTime(l) {
    const v = this.view(); const n = v.length; if (!n) return 0;
    const i = Math.round(l);
    if (i < 0) return v[0].time + i * this.tf.sec;
    if (i >= n) return v[n - 1].time + (i - n + 1) * this.interval();
    return v[i].time;
  }
  xOf(t) { return this.chart.timeScale().logicalToCoordinate(this.timeToLogical(t)); }
  xOfLogical(l) { return this.chart.timeScale().logicalToCoordinate(l); }
  tOfX(x) { const l = this.chart.timeScale().coordinateToLogical(x); return l === null ? null : this.logicalToTime(l); }
  yOf(p) { return this.main.priceToCoordinate(p); }
  pOfY(y) { return this.main.coordinateToPrice(y); }
  barAtX(x) { const l = this.chart.timeScale().coordinateToLogical(x); if (l === null) return null; const i = Math.round(l); const v = this.view(); return i >= 0 && i < v.length ? { i, bar: v[i] } : null; }
}
