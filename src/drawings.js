// Ferramentas de desenho (linhas, retângulo, Fibonacci, posição comprada/vendida, texto...).
import { store, uid } from './store.js';
import { instInfo } from './oanda.js';

export const TOOLS = [
  { id: 'cursor', name: 'Cursor', icon: '<path d="M5 3l14 8-6 1.5L10 19z"/>' },
  { id: 'trend', name: 'Linha de tendência', pts: 2, icon: '<path d="M4 19L20 5"/><circle cx="4" cy="19" r="1.6"/><circle cx="20" cy="5" r="1.6"/>' },
  { id: 'ray', name: 'Raio', pts: 2, icon: '<path d="M4 19L21 4"/><circle cx="4" cy="19" r="1.6"/><circle cx="11" cy="13" r="1.6"/>' },
  { id: 'extended', name: 'Linha estendida', pts: 2, icon: '<path d="M2 21L22 3"/><circle cx="9" cy="15" r="1.6"/><circle cx="15" cy="9" r="1.6"/>' },
  { id: 'hline', name: 'Linha horizontal', pts: 1, icon: '<path d="M2 12h20"/><circle cx="12" cy="12" r="1.6"/>' },
  { id: 'hray', name: 'Raio horizontal', pts: 1, icon: '<path d="M6 12h16"/><circle cx="6" cy="12" r="1.6"/>' },
  { id: 'vline', name: 'Linha vertical', pts: 1, icon: '<path d="M12 2v20"/><circle cx="12" cy="12" r="1.6"/>' },
  { sep: true },
  { id: 'rect', name: 'Retângulo', pts: 2, icon: '<rect x="4" y="6" width="16" height="12" rx="1"/>' },
  { id: 'fib', name: 'Retração de Fibonacci', pts: 2, icon: '<path d="M3 5h18M3 10h18M3 14h18M3 19h18" /><path d="M5 19L19 5" stroke-dasharray="2 2"/>' },
  { id: 'long', name: 'Posição comprada', pts: 1, icon: '<rect x="4" y="4" width="16" height="9" fill="currentColor" fill-opacity=".25"/><rect x="4" y="13" width="16" height="7"/><path d="M4 13h16"/>' },
  { id: 'short', name: 'Posição vendida', pts: 1, icon: '<rect x="4" y="4" width="16" height="7"/><rect x="4" y="11" width="16" height="9" fill="currentColor" fill-opacity=".25"/><path d="M4 11h16"/>' },
  { id: 'measure', name: 'Medir', pts: 2, icon: '<path d="M4 20V8M4 20h12"/><path d="M8 16l10-10M14 6h4v4"/>' },
  { id: 'text', name: 'Texto', pts: 1, icon: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>' },
];
export const PALETTE = ['#2962ff', '#f23645', '#089981', '#ff9800', '#9c27b0', '#00bcd4', '#ffeb3b', '#787b86', '#ffffff', '#000000'];
const FIB = [[0, '#787b86'], [0.236, '#f23645'], [0.382, '#ff9800'], [0.5, '#4caf50'], [0.618, '#089981'], [0.786, '#00bcd4'], [1, '#787b86'], [1.618, '#2962ff']];
const defColor = { rect: '#2962ff', fib: '#787b86', text: '#d1d4dc', measure: '#2962ff' };

export class Drawings {
  constructor(core, el, ui) {
    this.core = core; this.el = el; this.ui = ui;
    this.items = []; this.sel = null; this.tool = 'cursor'; this.magnet = store.get('magnet', true); this.hidden = false;
    this.draft = null; this.drag = null; this.capturing = false;
    this.primitive = this.makePrimitive();
    core.on('beforeMainRemove', s => { try { s.detachPrimitive(this.primitive); } catch { /* */ } });
    core.on('mainSeries', s => s.attachPrimitive(this.primitive));
    core.main.attachPrimitive(this.primitive);
    this.bindEvents();
  }

  // ---------- persistência ----------
  loadFor(instrument) { this.instrument = instrument; this.items = store.get('draw:' + instrument, []); this.sel = null; this.ui.onSelect(null); this.update(); }
  save() { store.set('draw:' + this.instrument, this.items); }
  update() { this.requestUpdate?.(); }
  setTool(id) { this.tool = id; this.draft = null; this.ui.onTool(id); if (id !== 'cursor') this.select(null); this.update(); }
  select(it) { this.sel = it; this.ui.onSelect(it); this.update(); }
  remove(it) { this.items = this.items.filter(x => x !== it); if (this.sel === it) this.select(null); this.save(); this.update(); }
  clearAll() { this.items = []; this.select(null); this.save(); this.update(); }
  setStyle(patch) { if (!this.sel) return; Object.assign(this.sel, patch); this.save(); this.update(); }

  // ---------- primitive do lightweight-charts ----------
  makePrimitive() {
    const self = this;
    const renderer = { draw(target) { target.useBitmapCoordinateSpace(s => self.render(s.context, s.horizontalPixelRatio, s.verticalPixelRatio, s.bitmapSize)); } };
    const view = { zOrder: () => 'top', renderer: () => renderer };
    return {
      attached(p) { self.requestUpdate = p.requestUpdate; },
      detached() { },
      updateAllViews() { },
      paneViews() { return [view]; },
    };
  }

  // ---------- geometria ----------
  P(pt) { return { x: this.core.xOf(pt.t), y: this.core.yOf(pt.p) }; }
  pointAt(x, y, snap = true) {
    let t = this.core.tOfX(x), p = this.core.pOfY(y);
    if (t === null || p === null) return null;
    if (snap && this.magnet) {
      const hit = this.core.barAtX(x);
      if (hit) {
        const b = hit.bar; let best = p, bd = Infinity;
        for (const v of [b.open, b.high, b.low, b.close]) { const d = Math.abs(this.core.yOf(v) - y); if (d < bd) { bd = d; best = v; } }
        if (bd < 40) p = best;
      }
    }
    return { t, p };
  }
  handles(it) {
    const pts = it.pts.map(pt => this.P(pt));
    if (it.type === 'hline') return [{ x: this.el.clientWidth / 2, y: pts[0].y }];
    if (it.type === 'vline') return [{ x: pts[0].x, y: this.el.clientHeight / 2 }];
    if (it.type === 'long' || it.type === 'short') {
      const [e, s, g] = pts; const xm = (e.x + s.x) / 2;
      return [{ x: e.x, y: e.y }, { x: xm, y: s.y }, { x: xm, y: g.y }, { x: s.x, y: e.y }];
    }
    return pts;
  }
  hit(x, y) {
    const tol = 14;
    if (this.sel) { const hs = this.handles(this.sel); for (let i = 0; i < hs.length; i++) if (Math.hypot(hs[i].x - x, hs[i].y - y) < tol + 4) return { it: this.sel, h: i }; }
    for (let k = this.items.length - 1; k >= 0; k--) { const it = this.items[k]; if (this.onShape(it, x, y, tol)) return { it, h: -1 }; }
    return null;
  }
  onShape(it, x, y, tol) {
    const W = this.el.clientWidth;
    const pts = it.pts.map(pt => this.P(pt)); const [a, b] = pts;
    const seg = (p, q) => { const dx = q.x - p.x, dy = q.y - p.y, L = dx * dx + dy * dy || 1; let u = ((x - p.x) * dx + (y - p.y) * dy) / L; u = Math.max(0, Math.min(1, u)); return Math.hypot(p.x + u * dx - x, p.y + u * dy - y); };
    switch (it.type) {
      case 'trend': case 'measure': return seg(a, b) < tol;
      case 'ray': case 'extended': { const [p, q] = this.extend(a, b, it.type === 'extended', W); return seg(p, q) < tol; }
      case 'hline': return Math.abs(a.y - y) < tol;
      case 'hray': return x >= a.x - tol && Math.abs(a.y - y) < tol;
      case 'vline': return Math.abs(a.x - x) < tol;
      case 'text': return Math.abs(a.x - x) < 60 && Math.abs(a.y - y) < 16;
      case 'rect': case 'fib': case 'long': case 'short': {
        const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
        return x > Math.min(...xs) - tol && x < Math.max(...xs) + tol && y > Math.min(...ys) - tol && y < Math.max(...ys) + tol;
      }
    }
    return false;
  }
  extend(a, b, both, W) {
    const dx = b.x - a.x, dy = b.y - a.y; if (Math.abs(dx) < 1e-6) return [a, { x: a.x, y: dy > 0 ? 1e5 : -1e5 }];
    const k = dy / dx; const far = dx > 0 ? W + 50 : -50;
    const end = { x: far, y: a.y + k * (far - a.x) };
    if (!both) return [a, end];
    const near = dx > 0 ? -50 : W + 50; return [{ x: near, y: a.y + k * (near - a.x) }, end];
  }

  // ---------- criação ----------
  newItem(type, pt) {
    const it = { id: uid(), type, color: defColor[type] || '#2962ff', width: 2, pts: [pt] };
    if (type === 'long' || type === 'short') {
      const v = this.core.view(); const n = v.length; const k = Math.min(14, n);
      let rng = 0; for (let i = n - k; i < n; i++) rng += v[i].high - v[i].low; rng = rng / k || pt.p * 0.005;
      const dir = type === 'long' ? 1 : -1; const tEnd = this.core.logicalToTime(this.core.timeToLogical(pt.t) + 20);
      it.pts = [pt, { t: tEnd, p: pt.p - dir * rng }, { t: tEnd, p: pt.p + dir * rng * 2 }];
    }
    return it;
  }
  commit(it) { this.items.push(it); this.save(); this.setTool('cursor'); this.select(it); if (it.type === 'text' && !it.text) this.ui.editText(it); }

  // ---------- eventos ----------
  bindEvents() {
    const el = this.el;
    const block = e => { if (this.capturing) { e.stopPropagation(); if (e.cancelable && e.type.startsWith('touch')) e.preventDefault(); } };
    ['touchstart', 'touchmove', 'mousedown', 'mousemove', 'wheel'].forEach(t => el.addEventListener(t, block, { capture: true, passive: false }));
    const local = e => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    el.addEventListener('pointerdown', e => {
      if (this.ui.isReplaySelecting() || e.button > 0) return;
      const { x, y } = local(e);
      if (x > el.clientWidth - this.core.chart.priceScale('right').width()) return; // escala de preço
      const tool = TOOLS.find(t => t.id === this.tool);
      if (this.tool !== 'cursor' && !this.hidden) {
        const pt = this.pointAt(x, y); if (!pt) return;
        this.capturing = true; e.stopPropagation();
        if (tool.pts === 1) { this.commit(this.newItem(this.tool, pt)); this.endCapture(); return; }
        if (this.draft && this.draft.waiting) { this.draft.it.pts[1] = pt; this.commit(this.draft.it); this.draft = null; this.endCapture(); return; }
        const it = this.newItem(this.tool, pt); it.pts[1] = { ...pt };
        this.draft = { it, sx: x, sy: y, moved: false }; this.update(); return;
      }
      const h = this.hidden ? null : this.hit(x, y);
      if (h) {
        this.capturing = true; e.stopPropagation();
        if (this.sel !== h.it) this.select(h.it);
        this.drag = { it: h.it, h: h.h, sx: x, sy: y, orig: h.it.pts.map(p => ({ ...p })), moved: false };
        return;
      }
      if (this.sel) this.select(null);
    }, { capture: true });
    window.addEventListener('pointermove', e => {
      if (!this.capturing) return;
      const { x, y } = local(e);
      if (this.draft) {
        if (Math.hypot(x - this.draft.sx, y - this.draft.sy) > 6) this.draft.moved = true;
        const pt = this.pointAt(x, y); if (pt) { this.draft.it.pts[1] = pt; this.update(); }
      } else if (this.drag) { this.dragTo(x, y); }
    });
    const up = () => {
      if (!this.capturing) return;
      if (this.draft) {
        if (this.draft.moved) { this.commit(this.draft.it); this.draft = null; }
        else this.draft.waiting = true; // espera o segundo toque
      } else if (this.drag) { if (this.drag.moved) this.save(); this.drag = null; }
      this.endCapture();
    };
    window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  }
  endCapture() { setTimeout(() => { this.capturing = false; }, 0); }
  dragTo(x, y) {
    const d = this.drag; const it = d.it;
    if (Math.hypot(x - d.sx, y - d.sy) > 3) d.moved = true;
    if (d.h >= 0) {
      const pt = this.pointAt(x, y); if (!pt) return;
      if (it.type === 'long' || it.type === 'short') {
        if (d.h === 0) { it.pts[0] = pt; }
        else if (d.h === 1) it.pts[1].p = pt.p;
        else if (d.h === 2) it.pts[2].p = pt.p;
        else { it.pts[1].t = pt.t; it.pts[2].t = pt.t; }
      } else if (it.type === 'hline') it.pts[0].p = pt.p;
      else if (it.type === 'vline') it.pts[0].t = pt.t;
      else it.pts[d.h] = pt;
    } else {
      const l0 = this.core.chart.timeScale().coordinateToLogical(d.sx), l1 = this.core.chart.timeScale().coordinateToLogical(x);
      const p0 = this.core.pOfY(d.sy), p1 = this.core.pOfY(y); if (l0 === null || l1 === null || p0 === null || p1 === null) return;
      const dl = Math.round(l1 - l0), dp = p1 - p0;
      it.pts = d.orig.map(o => ({ t: this.core.logicalToTime(Math.round(this.core.timeToLogical(o.t)) + dl), p: o.p + dp }));
    }
    this.update();
  }

  // ---------- desenho ----------
  render(ctx, hr, vr, size) {
    if (this.hidden) return;
    const list = this.draft ? [...this.items, this.draft.it] : this.items;
    ctx.save(); ctx.scale(hr, vr);
    for (const it of list) { try { this.renderItem(ctx, it); } catch { /* ponto fora da tela */ } }
    if (this.sel && !this.draft) {
      for (const h of this.handles(this.sel)) {
        ctx.beginPath(); ctx.arc(h.x, h.y, 5.5, 0, Math.PI * 2);
        ctx.fillStyle = this.core.theme === 'dark' ? '#131722' : '#fff'; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = this.sel.color; ctx.stroke();
      }
    }
    ctx.restore();
  }
  fmt(p) { return p.toFixed(instInfo(this.core.instrument).prec ?? 5); }
  pips(d) { return d / Math.pow(10, instInfo(this.core.instrument).pip ?? -4); }
  label(ctx, text, x, y, bg, fg = '#fff', align = 'center') {
    ctx.font = '600 11px -apple-system, Roboto, sans-serif'; const w = ctx.measureText(text).width + 10;
    const lx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(lx, y - 9, w, 18, 3); ctx.fill();
    ctx.fillStyle = fg; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText(text, lx + 5, y + 0.5);
  }
  renderItem(ctx, it) {
    const W = this.el.clientWidth, H = this.el.clientHeight;
    const pts = it.pts.map(pt => this.P(pt)); const [a, b] = pts;
    if (pts.some(p => p.x === null || p.y === null)) return;
    ctx.strokeStyle = it.color; ctx.lineWidth = it.width; ctx.setLineDash([]);
    const line = (p, q) => { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); };
    switch (it.type) {
      case 'trend': line(a, b); break;
      case 'ray': case 'extended': { const [p, q] = this.extend(a, b, it.type === 'extended', W); line(p, q); break; }
      case 'hline': line({ x: 0, y: a.y }, { x: W, y: a.y }); this.label(ctx, this.fmt(it.pts[0].p), W - 4, a.y, it.color, '#fff', 'right'); break;
      case 'hray': line(a, { x: W, y: a.y }); this.label(ctx, this.fmt(it.pts[0].p), W - 4, a.y, it.color, '#fff', 'right'); break;
      case 'vline': line({ x: a.x, y: 0 }, { x: a.x, y: H }); break;
      case 'rect': {
        ctx.fillStyle = it.color + '33'; ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
        ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)); break;
      }
      case 'fib': {
        const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x); const p1 = it.pts[0].p, p2 = it.pts[1].p;
        let prevY = null;
        ctx.lineWidth = 1;
        for (const [lv, c] of FIB) {
          const price = p2 + (p1 - p2) * lv; const y = this.core.yOf(price); if (y === null) continue;
          if (prevY !== null) { ctx.fillStyle = c + '1f'; ctx.fillRect(x1, Math.min(prevY, y), x2 - x1, Math.abs(y - prevY)); }
          ctx.strokeStyle = c; line({ x: x1, y }, { x: x2, y });
          ctx.fillStyle = c; ctx.font = '11px -apple-system, Roboto, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
          ctx.fillText(`${lv} (${this.fmt(price)})`, x1 - 4, y); prevY = y;
        }
        ctx.setLineDash([4, 4]); ctx.strokeStyle = '#787b86'; line(a, b); ctx.setLineDash([]); break;
      }
      case 'long': case 'short': {
        const [e, s, g] = pts; const x1 = Math.min(e.x, s.x), w = Math.abs(s.x - e.x);
        ctx.fillStyle = 'rgba(8,153,129,0.22)'; ctx.fillRect(x1, Math.min(e.y, g.y), w, Math.abs(g.y - e.y));
        ctx.fillStyle = 'rgba(242,54,69,0.22)'; ctx.fillRect(x1, Math.min(e.y, s.y), w, Math.abs(s.y - e.y));
        ctx.strokeStyle = '#787b86'; ctx.lineWidth = 1; line({ x: x1, y: e.y }, { x: x1 + w, y: e.y });
        const ep = it.pts[0].p, sp = it.pts[1].p, tp = it.pts[2].p; const risk = Math.abs(ep - sp), rew = Math.abs(tp - ep);
        const rr = risk ? (rew / risk).toFixed(2) : '–'; const xm = x1 + w / 2;
        this.label(ctx, `Alvo ${this.fmt(tp)} · ${this.pips(rew).toFixed(1)} pips · ${(rew / ep * 100).toFixed(2)}%`, xm, g.y + (g.y < e.y ? -12 : 12), '#089981');
        this.label(ctx, `Stop ${this.fmt(sp)} · ${this.pips(risk).toFixed(1)} pips`, xm, s.y + (s.y < e.y ? -12 : 12), '#f23645');
        this.label(ctx, `${it.type === 'long' ? 'Compra' : 'Venda'} ${this.fmt(ep)} · R:R ${rr}`, xm, e.y, '#363a45'); break;
      }
      case 'measure': {
        const up = it.pts[1].p >= it.pts[0].p; const c = up ? '#2962ff' : '#f23645';
        ctx.fillStyle = c + '26'; ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
        ctx.strokeStyle = c; ctx.lineWidth = 1; line({ x: (a.x + b.x) / 2, y: a.y }, { x: (a.x + b.x) / 2, y: b.y }); line({ x: a.x, y: (a.y + b.y) / 2 }, { x: b.x, y: (a.y + b.y) / 2 });
        const d = it.pts[1].p - it.pts[0].p; const bars = Math.round(this.core.timeToLogical(it.pts[1].t) - this.core.timeToLogical(it.pts[0].t));
        this.label(ctx, `${d >= 0 ? '+' : ''}${this.fmt(d)} (${(d / it.pts[0].p * 100).toFixed(2)}%) · ${this.pips(d).toFixed(1)} pips · ${bars} barras`, (a.x + b.x) / 2, Math.min(a.y, b.y) - 14, c); break;
      }
      case 'text': {
        ctx.font = '600 13px -apple-system, Roboto, sans-serif'; ctx.fillStyle = it.color; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(it.text || 'Texto', a.x, a.y); break;
      }
    }
  }
}
