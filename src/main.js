import './style.css';
import { ChartCore } from './chart.js';
import { Drawings, TOOLS, PALETTE } from './drawings.js';
import { Scripts, BUILTINS } from './scripts.js';
import { Replay } from './replay.js';
import * as oanda from './oanda.js';
import { ct, ctCfg } from './ctrader.js';
import { store } from './store.js';
import { getBars, putBars, memFresh } from './barcache.js';
import * as sync from './sync.js';
import { PineTS, Indicator } from 'pinets';
import { App as CapApp } from '@capacitor/app';
import { ICON, symIcon } from './icons.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CTYPES = [['candles', 'Candles'], ['hollow', 'Candles vazados'], ['heikin', 'Heikin Ashi'], ['bars', 'Barras'], ['line', 'Linha'], ['area', 'Área']];
const DEFAULT_WATCH = ['EUR_USD', 'GBP_USD', 'USD_JPY', 'AUD_USD', 'USD_CAD', 'USD_CHF', 'NZD_USD', 'GBP_JPY', 'XAU_USD', 'US30_USD', 'NAS100_USD', 'SPX500_USD'];
const RANGES = ['1D', '5D', '1M', '3M', '6M', 'YTD', '1A', '5A', 'Todos'];
const SPEEDS = [10, 7, 5, 3, 1, 0.5, 0.3, 0.1];
const FAV = ['trend', 'hline', 'hray', 'vline', 'fib', 'rect', 'long'];
const TG = [['cursor', ['cursor']], ['lines', ['trend', 'ray', 'extended', 'hline', 'hray', 'vline']], ['fib', ['fib']], ['shapes', ['rect']], ['pos', ['long', 'short']], ['text', ['text']], ['measure', ['measure']]];
const CAT_ORDER = ['Forex', 'Metais', 'Índices', 'Commodities', 'Cripto', 'Títulos', 'Yields'];

// ---------------- estado ----------------
const state = {
  instrument: store.get('instrument', 'EUR_USD'),
  tf: store.get('tf', 'D'),
  watch: store.get('watch', DEFAULT_WATCH),
  favTfs: store.get('favTfs', ['15', '60', '240', 'D', 'W']),
  recent: store.get('recent', []),
  prices: {}, prevClose: {}, shown: {},
};
const layout = () => document.documentElement.dataset.layout;
const isMob = () => layout() === 'mob';
const mqDesk = matchMedia('(min-width: 640px) and (min-aspect-ratio: 1/1)');

// ---------------- UI helpers ----------------
const ui = {
  toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(ui._tt); ui._tt = setTimeout(() => t.classList.remove('on'), 2200); },
  banner(msg, btn, fn) {
    const b = $('#banner'); if (!msg) { b.hidden = true; return; }
    b.innerHTML = esc(msg) + (btn ? ` <button>${esc(btn)}</button>` : ''); b.hidden = false;
    if (btn) b.querySelector('button').onclick = fn;
  },
  onTool() { renderTools(); renderFav(); renderMBot(); },
  onSelect(it) { renderDrawPop(it); },
  onHistory() { updateUndo(); },
  editText(it) { const t = prompt('Texto', it.text || ''); if (t !== null) { drawings.setStyle({ text: t }); } },
  isReplaySelecting: () => replay?.selecting,
  onReplay: () => renderReplayBar(),
  onReplayStep: () => { renderReplayBar(); scheduleScripts(); updateLegend(); updateTradePanel(); },
  onScriptsRendered: () => updateLegend(),
};
function openModal(html, { wide } = {}) {
  closePop();
  const sh = $('#sheet'); sh.className = 'sheet' + (wide ? ' wide' : ''); sh.innerHTML = html; $('#modal').hidden = false;
  sh.querySelectorAll('[data-close]').forEach(b => b.onclick = closeModal);
  return sh;
}
function closeModal() { $('#modal').hidden = true; $('#sheet').innerHTML = ''; }
$('#modal').addEventListener('pointerdown', e => { if (e.target.id === 'modal') closeModal(); });
const head = t => `<div class="sh-head"><span>${t}</span><button data-close>${ICON.x}</button></div>`;

// menu flutuante (estilo TradingView)
let pmCloser = null, pmAnchor = null, pmClosedAt = 0;
function closePop() {
  const m = $('#pmenu'); if (m.hidden) return;
  m.hidden = true; pmClosedAt = Date.now();
  if (pmCloser) document.removeEventListener('pointerdown', pmCloser, true); pmCloser = null;
}
function popMenu(anchor, items, { side = 'below' } = {}) {
  if (pmAnchor === anchor && Date.now() - pmClosedAt < 250) return;
  closePop(); pmAnchor = anchor;
  const m = $('#pmenu');
  m.innerHTML = items.map((it, i) => it.hr ? '<hr>' : it.head ? `<div class="ph">${esc(it.head)}</div>`
    : `<div class="pi ${it.on ? 'on' : ''}" data-i="${i}">${it.icon || ''}<span>${esc(it.label)}</span>${it.right ? `<span class="r ${it.rOn ? 'on' : ''}" data-r="${i}">${it.right}</span>` : ''}</div>`).join('');
  m.hidden = false; m.style.left = '0px'; m.style.top = '0px';
  const r = anchor.getBoundingClientRect(); const mw = m.offsetWidth, mh = m.offsetHeight;
  let x = r.left, y = r.bottom + 4;
  if (side === 'right') { x = r.right + 4; y = r.top; } else if (side === 'above') { y = r.top - mh - 6; }
  m.style.left = Math.max(6, Math.min(innerWidth - mw - 6, x)) + 'px'; m.style.top = Math.max(6, Math.min(innerHeight - mh - 6, y)) + 'px';
  m.onclick = e => {
    const rr = e.target.closest('[data-r]'); if (rr) { items[+rr.dataset.r].onRight?.(); e.stopPropagation(); return; }
    const p = e.target.closest('.pi'); if (!p) return; const it = items[+p.dataset.i]; closePop(); it.onClick?.();
  };
  setTimeout(() => { pmCloser = e => { if (!m.contains(e.target)) closePop(); }; document.addEventListener('pointerdown', pmCloser, true); }, 0);
}
// arrastar um elemento flutuante pelo "pegador"
function makeDraggable(el, handle, key) {
  const wrap = $('#chart-wrap'); let st = null;
  const place = (x, y) => {
    const W = wrap.clientWidth, H = wrap.clientHeight;
    x = Math.max(0, Math.min(W - el.offsetWidth, x)); y = Math.max(0, Math.min(H - el.offsetHeight, y));
    el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.bottom = 'auto'; el.style.transform = 'none'; return { x, y };
  };
  handle.addEventListener('pointerdown', e => { st = { sx: e.clientX, sy: e.clientY, ox: el.offsetLeft, oy: el.offsetTop }; handle.setPointerCapture(e.pointerId); e.preventDefault(); });
  handle.addEventListener('pointermove', e => { if (st) place(st.ox + e.clientX - st.sx, st.oy + e.clientY - st.sy); });
  handle.addEventListener('pointerup', e => { if (!st) return; const p = place(st.ox + e.clientX - st.sx, st.oy + e.clientY - st.sy); store.set(key + ':' + layout(), p); st = null; });
  const saved = store.get(key + ':' + layout(), null);
  if (saved) requestAnimationFrame(() => place(saved.x, saved.y));
}

// ---------------- núcleo ----------------
const core = new ChartCore($('#chart'));
document.documentElement.dataset.theme = core.theme;
const drawings = new Drawings(core, $('#chart'), ui);
const scripts = new Scripts(core, ui);
const replay = new Replay(core, ui);

let scriptTimer = null, lastTickAt = 0;
function scheduleScripts(delay = 120) { clearTimeout(scriptTimer); scriptTimer = setTimeout(() => scripts.runAll(), delay); }
core.on('data', () => { scheduleScripts(80); updateCd(); });
core.on('newBar', () => scheduleScripts(10));
let lastTickRun = 0;
core.on('tick', () => { lastTickAt = Date.now(); updateLegend(); updateCd(); if (rt.pos) updateTradePanel(); const now = Date.now(); if (now - lastTickRun > 5000) { lastTickRun = now; scheduleScripts(300); } });
core.on('range', () => updateCd());
core.on('error', e => ui.toast(e.message));
let liveErrShown = 0;
core.on('liveError', e => { if (Date.now() - liveErrShown > 15000) { liveErrShown = Date.now(); ui.toast('Sem conexão: ' + e.message); } });

async function loadSymbol(instrument, tf = state.tf) {
  if (replay.active) replay.exit();
  instrument = oanda.resolveTicker(instrument);
  state.instrument = instrument; state.tf = tf; store.set('instrument', instrument); store.set('tf', tf);
  state.recent = [{ i: instrument, tf }, ...state.recent.filter(r => !(r.i === instrument && r.tf === tf))].slice(0, 12); store.set('recent', state.recent);
  syncChrome(); renderWatch();
  if (core.instrument !== instrument || core.tf.id !== tf) { scripts.results = {}; scripts.renderAll(); }
  drawings.loadFor(instrument);
  const gen = ++loadGen;
  try {
    await core.load(instrument, tf);
    if (gen !== loadGen) return;
    core.startLive();
  } catch (e) { if (gen === loadGen) ui.toast(e.message); }
  updateLegend(); updateCd();
  schedulePrefetch(gen);
}

// ---------------- pré-carregamento em segundo plano ----------------
let loadGen = 0, prefetchTimer = null;
function schedulePrefetch(gen) {
  clearTimeout(prefetchTimer);
  prefetchTimer = setTimeout(async () => {
    const tfs = [...new Set(['D', '240', '60', 'W', ...state.favTfs])];
    const jobs = [];
    for (const w of state.watch) { const n = oanda.resolveTicker(w); if (n !== state.instrument) jobs.push([n, state.tf]); }
    for (const t of tfs) if (t !== state.tf) jobs.push([state.instrument, t]);
    for (const t of ['D', '240']) for (const w of state.watch) { const n = oanda.resolveTicker(w); if (n !== state.instrument && t !== state.tf) jobs.push([n, t]); }
    for (const [inst, t] of jobs.slice(0, 40)) {
      if (gen !== loadGen || document.hidden || replay.active) return;
      const tfo = oanda.tfById(t); const key = `${oanda.feedName()}|${inst}|${tfo.gran}`;
      if (memFresh(key, 5 * 60e3)) continue;
      try { const rec = await getBars(key); const bars = await ChartCore.fetchFresh(inst, tfo, rec?.bars); putBars(key, { at: Date.now(), bars }); }
      catch { /* sem conexão: tenta depois */ }
      await new Promise(r => setTimeout(r, 120));
    }
  }, 1500);
}

// ---------------- legenda ----------------
let crossIdx = null, legendCollapsed = false;
let crossT = null;
core.on('crosshair', p => {
  crossIdx = p && p.logical !== undefined && p.time !== undefined ? Math.round(p.logical) : null; updateLegend();
  clearTimeout(crossT);
  if (crossIdx !== null && isMob()) crossT = setTimeout(() => { crossIdx = null; try { core.chart.clearCrosshairPosition(); } catch { /* */ } updateLegend(); }, 2500);
});
function fmtVal(v, prec) {
  if (typeof v !== 'number' || !isFinite(v)) return 'n/a';
  const a = Math.abs(v); if (a >= 1e6) return (v / 1e6).toFixed(2) + 'M'; if (a >= 1e4) return (v / 1e3).toFixed(1) + 'K';
  return v.toFixed(prec ?? (a < 0.01 ? 5 : a < 100 ? 3 : 2));
}
function statusPill() {
  if (replay.active) return ['Replay', ''];
  if (!oanda.hasOanda()) return ['Demo', ''];
  return Date.now() - lastTickAt < 25000 ? ['Ao vivo', 'live'] : ['Fechado', ''];
}
const quoteUnit = n => /10Y$/.test(n) ? '%' : (/_([A-Z]{3})$/.exec(n)?.[1] || 'USD');
function updateLegend() {
  const v = core.view(); if (!v.length) return;
  const mob = isMob();
  const i = crossIdx !== null && crossIdx >= 0 && crossIdx < v.length ? crossIdx : v.length - 1;
  const b = v[i], pb = v[i - 1]; const info = oanda.instInfo(core.instrument); const prec = info.prec ?? 5;
  const ch = pb ? b.close - pb.close : 0; const cls = ch >= 0 ? 'up' : 'down';
  const chTxt = `${ch >= 0 ? '+' : ''}${ch.toFixed(prec)} (${pb ? (ch / pb.close * 100).toFixed(2) : '0.00'}%)`;
  const ohlc = `<span class="k">A</span><span class="v ${cls}">${b.open.toFixed(prec)}</span><span class="k">M</span><span class="v ${cls}">${b.high.toFixed(prec)}</span><span class="k">Mí</span><span class="v ${cls}">${b.low.toFixed(prec)}</span><span class="k">F</span><span class="v ${cls}">${b.close.toFixed(prec)}</span>`;
  const [pl, pc] = statusPill(); const name = info.display || oanda.short(core.instrument);
  let html;
  if (!mob) html = `<div class="row"><span class="title">${symIcon(core.instrument, 18)}<span>${esc(name)} · ${esc(core.tf.label)} · ${oanda.feedName()}</span></span><span class="pill ${pc}"><i></i>${pl}</span>${ohlc}<span class="v ${cls}">${chTxt}</span></div>`;
  else html = `<div class="mh" data-act="symbol">${symIcon(core.instrument, 28)}<span class="nm">${esc(name)}</span><span class="pill ${pc}"><i></i>${pl}</span><span class="unit">${esc(quoteUnit(core.instrument))}${ICON.chevD}</span></div>
    <div class="mchg ${crossIdx !== null ? '' : cls}">${crossIdx !== null ? `<span class="row">${ohlc}</span>` : chTxt}</div>`;
  const vals = scripts.valuesAt(i);
  if (!legendCollapsed) for (const s of scripts.active) {
    const r = vals[s.id]; const nm = r?.title || s.name;
    html += `<div class="ind ${s.visible ? '' : 'off'}" data-id="${s.id}"><span class="nm">${esc(nm)}</span>`;
    if (r?.error) html += `<span class="err">erro: ${esc(r.error)}</span>`;
    else if (!r) html += `<span class="k">…</span>`;
    else html += r.vals.slice(0, 5).map(x => `<span class="v" style="color:${x.color}">${fmtVal(x.v, r.overlay ? prec : undefined)}</span>`).join('');
    html += `<button class="eyeb" data-a="eye" title="Mostrar/ocultar">${s.visible ? ICON.eye : ICON.eyeOff}</button><span class="acts"><button data-a="eye" title="Mostrar/ocultar">${ICON.eye}</button><button data-a="set" title="Configurar">${ICON.gear}</button><button data-a="code" title="Código">${ICON.code}</button><button data-a="del" title="Remover">${ICON.trash}</button></span></div>`;
  }
  if (scripts.active.length) html += `<button class="collapse" data-a="collapse">${legendCollapsed ? ICON.chevD : ICON.chevU}</button>`;
  $('#legend').innerHTML = html;
}

// ---------------- contagem regressiva sob o preço ----------------
function updateCd() {
  const cd = $('#cd'); const v = core.view();
  if (!v.length || replay.active || !core.main) { cd.hidden = true; return; }
  const last = v.at(-1); const y = core.main.priceToCoordinate(last.close);
  if (y === null || y === undefined) { cd.hidden = true; return; }
  const rem = Math.max(0, (last.time + core.tf.sec) * 1000 - Date.now()) / 1000;
  const d = Math.floor(rem / 86400), h = Math.floor(rem % 86400 / 3600), m = Math.floor(rem % 3600 / 60), s = Math.floor(rem % 60);
  const p2 = n => String(n).padStart(2, '0');
  cd.textContent = d ? `${d}d ${p2(h)}h` : `${p2(h)}:${p2(m)}:${p2(s)}`;
  cd.style.width = core.chart.priceScale('right').width() + 'px'; cd.style.top = (y + 9) + 'px';
  cd.style.background = last.close >= last.open ? 'var(--up)' : 'var(--down)'; cd.hidden = false;
}
setInterval(updateCd, 500);

// ---------------- barra de ferramentas de desenho ----------------
const toolDef = id => TOOLS.find(t => t.id === id);
const toolSvg = id => `<svg viewBox="0 0 24 24">${toolDef(id).icon}</svg>`;
function renderTools() {
  const el = $('#tools'); if (!el) return; const last = store.get('toolLast', {});
  el.innerHTML = TG.map(([g, ids]) => {
    const act = ids.includes(drawings.tool); const cur = act ? drawings.tool : (ids.includes(last[g]) ? last[g] : ids[0]);
    return `<button class="tool ${act ? 'on' : ''}" data-g="${g}" title="${esc(toolDef(cur).name)}">${toolSvg(cur)}${ids.length > 1 ? '<i class="tri"></i>' : ''}</button>`;
  }).join('') + `<hr><button class="tool" data-act="zoomin" title="Aproximar">${ICON.zoom}</button><hr>
    <button class="tool ${drawings.magnet ? 'on' : ''}" data-act="magnet" title="Ímã (gruda no OHLC)">${ICON.magnet}</button>
    <button class="tool ${drawings.hidden ? 'on' : ''}" data-act="hide" title="Ocultar desenhos">${drawings.hidden ? ICON.eyeOff : ICON.eye}</button><span class="gap"></span>
    <button class="tool" data-act="clear" title="Apagar todos os desenhos">${ICON.trash}</button>`;
}
function pickTool(g, id) { const last = store.get('toolLast', {}); last[g] = id; store.set('toolLast', last); drawings.setTool(id); }
function toggleTool(id) { drawings.setTool(drawings.tool === id ? 'cursor' : id); }
function renderFav() {
  const el = $('#favbar'); if (!el) return;
  el.innerHTML = `<span class="grip" id="fav-grip">${ICON.grip}</span>` + FAV.map(id => `<button data-tool="${id}" class="${drawings.tool === id ? 'on' : ''}" title="${esc(toolDef(id).name)}">${toolSvg(id)}</button>`).join('');
  makeDraggable(el, $('#fav-grip'), 'favPos');
}
function renderDrawPop(it) {
  const pop = $('#draw-pop'); if (!it) { pop.hidden = true; return; }
  pop.innerHTML = `<button data-a="color" title="Cor"><span class="sw" style="background:${it.color}"></span></button>
    <button data-a="width" title="Espessura"><b>${it.width}px</b></button>
    ${it.type === 'text' ? `<button data-a="text" title="Editar texto">${ICON.edit}</button>` : ''}
    <button data-a="clone" title="Duplicar"><svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/></svg></button>
    <button data-a="del" title="Apagar">${ICON.trash}</button>`;
  pop.style.left = '50%'; pop.style.top = 'auto'; pop.style.bottom = '40px'; pop.style.transform = 'translateX(-50%)'; pop.hidden = false;
  pop.onclick = e => {
    const a = e.target.closest('button')?.dataset.a; if (!a) return;
    if (a === 'del') drawings.remove(it);
    if (a === 'width') { drawings.setStyle({ width: it.width % 4 + 1 }); renderDrawPop(it); }
    if (a === 'text') ui.editText(it);
    if (a === 'clone') { const c = JSON.parse(JSON.stringify(it)); c.id = Math.random().toString(36).slice(2); c.pts.forEach(p => p.p *= 1.001); drawings.items.push(c); drawings.save(); drawings.select(c); }
    if (a === 'color') {
      pop.innerHTML = PALETTE.map(c => `<button data-c="${c}"><span class="sw" style="background:${c}"></span></button>`).join('');
      pop.onclick = ev => { const c = ev.target.closest('button')?.dataset.c; if (c) { drawings.setStyle({ color: c }); renderDrawPop(it); } };
    }
  };
}
function updateUndo() {
  document.querySelectorAll('[data-act="undo"]').forEach(b => b.classList.toggle('dis', !drawings.canUndo()));
  document.querySelectorAll('[data-act="redo"]').forEach(b => b.classList.toggle('dis', !drawings.canRedo()));
}

// ---------------- barra superior (PC) ----------------
const ctIcon = () => ICON[core.ctype] || ICON.candles;
function renderTop() {
  const el = $('#top'); if (!el) return;
  el.innerHTML = `<button class="tb sym" data-act="symbol" title="Buscar ativo">${ICON.search}<span>${esc(oanda.short(state.instrument))}</span></button>
    <span class="sep"></span>
    <div class="tfq">${state.favTfs.map(t => `<button class="tb tf ${t === state.tf ? 'on' : ''}" data-act="tfset" data-tf="${t}">${oanda.tfById(t).label}</button>`).join('')}</div>
    <button class="tb ic" data-act="tf" title="Timeframe">${ICON.chevD}</button>
    <span class="sep"></span>
    <button class="tb ic" data-act="ctype" title="Tipo de gráfico">${ctIcon()}${ICON.chevD}</button>
    <span class="sep"></span>
    <button class="tb" data-act="ind">${ICON.indicators}<span>Indicadores</span></button>
    <button class="tb ${replay.active ? 'on' : ''}" data-act="replay">${ICON.replay}<span>Replay</span></button>
    <span class="sep"></span>
    <button class="tb ic ${drawings.canUndo() ? '' : 'dis'}" data-act="undo" title="Desfazer">${ICON.undo}</button>
    <button class="tb ic ${drawings.canRedo() ? '' : 'dis'}" data-act="redo" title="Refazer">${ICON.redo}</button>
    <span class="grow"></span>
    <button class="tb ic" data-act="theme" title="Tema">${core.theme === 'dark' ? ICON.moon : ICON.sun}</button>
    <button class="tb ic" data-act="settings" title="Configurações">${ICON.gear}</button>`;
}
function renderRbar() {
  const el = $('#rbar'); if (!el) return; const open = !$('#watch').hidden;
  el.innerHTML = `<button class="${open ? 'on' : ''}" data-act="watch" title="Lista de ativos">${ICON.bookmark}</button>
    <button data-act="ind" title="Indicadores e scripts">${ICON.scripts}</button>
    <button data-act="sync" title="Sincronizar">${ICON.sync}</button>`;
}
function renderBot() {
  const el = $('#bot'); if (!el) return; const sc = core.chart.priceScale('right').options();
  el.innerHTML = RANGES.map(r => `<button data-act="range" data-r="${r}">${r}</button>`).join('') + `<span class="sep"></span><button data-act="goto" title="Ir para data">${ICON.calendar}</button>
    <span class="grow"></span><span class="clock" id="clock"></span><span class="sep"></span>
    <button data-act="pct" class="${sc.mode === 2 ? 'on' : ''}" title="Escala em porcentagem">%</button>
    <button data-act="log" class="${sc.mode === 1 ? 'on' : ''}" title="Escala logarítmica">log</button>
    <button data-act="auto" class="${sc.autoScale ? 'on' : ''}" title="Escala automática">auto</button>`;
  tickClock();
}
function tickClock() {
  const c = $('#clock'); if (!c) return;
  try {
    const f = new Intl.DateTimeFormat('pt-BR', { timeZone: core.tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const z = new Intl.DateTimeFormat('en-US', { timeZone: core.tz, timeZoneName: 'shortOffset' }).formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value || '';
    c.textContent = `${f.format(new Date())} ${z.replace('GMT', 'UTC') || 'UTC'}`;
  } catch { c.textContent = new Date().toLocaleTimeString('pt-BR'); }
}
setInterval(tickClock, 1000);
function applyRange(k) {
  const v = core.view(); if (!v.length) return; const n = v.length; const sec = core.tf.sec;
  if (k === 'Todos') { core.chart.timeScale().fitContent(); return; }
  const f = sec < 604800 ? 5 / 7 : 1; let bars;
  if (k === 'YTD') bars = (v.at(-1).time - Date.UTC(new Date().getUTCFullYear(), 0, 1) / 1000) / sec * f;
  else bars = { '1D': 1, '5D': 5, '1M': 30, '3M': 91, '6M': 182, '1A': 365, '5A': 1826 }[k] * 86400 / sec * f;
  bars = Math.max(12, Math.round(bars));
  core.chart.timeScale().setVisibleLogicalRange({ from: n - 1 - bars, to: n + 6 });
}
function gotoDate(t) {
  const first = core.bars[0]; if (first && t < first.time) { ui.toast('Dia fora do histórico carregado — role para a esquerda'); return; }
  const l = Math.round(core.timeToLogical(t)); core.chart.timeScale().setVisibleLogicalRange({ from: l - 70, to: l + 25 });
}
function openGoto() {
  const sh = openModal(head('Ir para a data') + `<div class="sh-body"><label class="fld"><span>Data</span><input class="inp" type="date" id="g-d"></label>
    <div class="btns"><button class="btn" id="g-go">Ir</button></div></div>`);
  sh.querySelector('#g-go').onclick = () => { const d = sh.querySelector('#g-d').value; if (d) { gotoDate(Date.parse(d + 'T12:00:00Z') / 1000); closeModal(); } };
}

// ---------------- celular em pé ----------------
function renderMBot() {
  const el = $('#mbot'); if (!el) return;
  const cur = state.recent[0] || { i: state.instrument, tf: state.tf };
  const p = state.recent[2], n = state.recent[1];
  const row = (r, c) => r ? `<button class="it ${c}" data-act="recent" data-i="${r.i}" data-tf="${r.tf}">${esc(oanda.short(r.i))}<span>${esc(oanda.tfById(r.tf).label)}</span></button>` : '';
  el.innerHTML = `<div class="mrec">${row(p, 'p')}<div class="it cur"><span data-act="symbol">${esc(oanda.short(cur.i))}</span><span class="tfb" data-act="tf">${esc(oanda.tfById(cur.tf).label)}</span></div>${row(n, 'n')}</div>
    <div class="mtools"><button class="${drawings.tool !== 'cursor' ? 'on' : ''}" data-act="mdraw" title="Desenhar">${ICON.pencil}</button>
    <button data-act="ind" title="Indicadores">${ICON.fx}</button><button data-act="mmore" title="Mais">${ICON.dots}</button><span class="sep"></span>
    <button class="${drawings.canUndo() ? '' : 'dis'}" data-act="undo">${ICON.undo}</button><button class="${drawings.canRedo() ? '' : 'dis'}" data-act="redo">${ICON.redo}</button></div>`;
}
function renderMTabs() {
  const el = $('#mtabs'); if (!el) return; const tab = $('#app').dataset.tab;
  const t = (id, ic, lb, on) => `<button class="${on ? 'on' : ''}" data-act="tab" data-t="${id}"><span class="ic">${ic}</span><span class="lb">${lb}</span></button>`;
  el.innerHTML = t('watch', ICON.bookmark, 'Lista de obs.', tab === 'watch') + t('chart', ICON.chartTab, 'Gráfico', tab === 'chart' && !replay.active) + t('replay', ICON.replay, 'Replay', replay.active) + t('scripts', ICON.scripts, 'Scripts', false) + t('menu', ICON.menuTab, 'Menu', false);
}
function setTab(t) {
  $('#app').dataset.tab = t; renderMTabs();
  if (t === 'watch') { renderWatch(); pollWatch(); } else setTimeout(() => core.chart.timeScale().applyOptions({}), 0);
}
function openMDraw() {
  const sh = openModal(head('Ferramentas de desenho') + `<div class="sh-body"><div class="tgrid">${TOOLS.filter(t => !t.sep).map(t => `<button data-tool="${t.id}" class="${drawings.tool === t.id ? 'on' : ''}"><svg viewBox="0 0 24 24">${t.icon}</svg>${esc(t.name)}</button>`).join('')}</div>
    <div class="sec-t">Ajustes</div>
    <div class="mrow" data-m="magnet">${ICON.magnet}<span>Ímã (gruda no OHLC)</span><span class="r">${drawings.magnet ? 'ligado' : 'desligado'}</span></div>
    <div class="mrow" data-m="hide">${ICON.eyeOff}<span>Ocultar desenhos</span><span class="r">${drawings.hidden ? 'sim' : 'não'}</span></div>
    <div class="mrow" data-m="clear">${ICON.trash}<span>Apagar todos os desenhos</span></div></div>`);
  sh.onclick = e => {
    const t = e.target.closest('[data-tool]'); if (t) { closeModal(); drawings.setTool(t.dataset.tool === drawings.tool ? 'cursor' : t.dataset.tool); if (drawings.tool !== 'cursor') ui.toast('Toque no gráfico para desenhar'); return; }
    const m = e.target.closest('[data-m]')?.dataset.m; if (!m) return; closeModal(); ACT[m]?.();
  };
}
function openMMore() {
  const rows = [['tf', ICON.calendar, 'Timeframe', oanda.tfById(state.tf).label], ['ctype', ctIcon(), 'Tipo de gráfico', CTYPES.find(c => c[0] === core.ctype)?.[1]], ['replay', ICON.replay, 'Replay', replay.active ? 'ativo' : ''],
    ['goto', ICON.calendar, 'Ir para a data', ''], ['range', ICON.zoom, 'Mostrar tudo', ''], ['theme', core.theme === 'dark' ? ICON.sun : ICON.moon, 'Tema claro/escuro', ''], ['sync', ICON.sync, 'Sincronizar agora', ''], ['settings', ICON.gear, 'Configurações', '']];
  const sh = openModal(head('Mais') + `<div class="sh-body">${rows.map(r => `<div class="mrow" data-m="${r[0]}">${r[1]}<span>${r[2]}</span><span class="r">${esc(r[3] || '')}</span></div>`).join('')}</div>`);
  sh.onclick = e => { const m = e.target.closest('[data-m]')?.dataset.m; if (!m) return; closeModal(); if (m === 'range') applyRange('Todos'); else ACT[m]?.(document.body); };
}

// ---------------- replay ----------------
const rt = { pos: null, qty: 1, total: 0, line: null };
function shortDate(ts) { return core.fmtTime(ts, true); }
function renderReplayBar() {
  const bar = $('#replay-bar'); const app = $('#app');
  document.querySelectorAll('[data-act="replay"]').forEach(b => b.classList.toggle('on', replay.active));
  $('#chart').classList.toggle('selecting', !!replay.selecting);
  if (app) { if (replay.active) app.dataset.replay = '1'; else delete app.dataset.replay; }
  renderMTabs();
  if (!replay.active) { bar.hidden = true; hideSel(); updateTradePanel(); return; }
  if (!replay.selecting) hideSel();
  const last = core.view().at(-1); const sel = replay.selecting; const mob = isMob();
  bar.hidden = false;
  bar.innerHTML = `<button class="pick" data-r="pick" title="Escolher barra inicial">${ICON.pickbar}${mob ? '' : `<span>${sel ? 'Selecione a barra' : (last ? esc(shortDate(last.time)) : 'Barra')}</span>${ICON.chevD}`}</button>
    <button data-r="play" ${sel ? 'disabled' : ''} title="Reproduzir/pausar">${replay.playing ? ICON.pauseF : ICON.playF}</button>
    <button data-r="step" ${sel ? 'disabled' : ''} title="Avançar uma barra">${ICON.step}</button>
    <button data-r="speed" title="Velocidade">${replay.speed}x</button>
    <button data-r="tf" title="Timeframe">${esc(core.tf.label)}</button>
    <button data-r="jump" title="Ir ao tempo real">${ICON.jump}</button>
    ${mob ? `<button data-r="gear">${ICON.gear}</button>` : ''}
    <button class="x" data-r="exit" title="Sair do replay">${ICON.x}</button>`;
}
function replayAct(a, el) {
  if (a === 'pick') popMenu(el, [
    { label: 'Selecionar barra', icon: ICON.pickbar, onClick: () => { replay.pause(); replay.startSelect(); } },
    { label: 'Barra aleatória', icon: ICON.swap, onClick: () => { const n = core.bars.length; if (n < 60) return; const i = Math.floor(n * 0.15 + Math.random() * n * 0.7); replay.pause(); replay.startSelect(); replay.jumpToTime(core.bars[i].time); } },
    { label: 'Ir para a data…', icon: ICON.calendar, onClick: () => openReplayDate() }], { side: isMob() ? 'above' : 'below' });
  if (a === 'play') replay.playing ? replay.pause() : replay.play();
  if (a === 'step') { replay.pause(); replay.step(1); }
  if (a === 'speed') popMenu(el, SPEEDS.map(s => ({ label: `${s}x`, on: s === replay.speed, icon: '', right: `${(1 / s).toFixed(1)}s`, onClick: () => { replay.setSpeed(s); renderReplayBar(); } })), { side: 'above' });
  if (a === 'tf') ui.toast('Saia do replay para trocar o timeframe');
  if (a === 'jump' || a === 'exit') replay.exit();
  if (a === 'gear') openSettings();
}
function openReplayDate() {
  const sh = openModal(head('Replay a partir da data') + `<div class="sh-body"><label class="fld"><span>Data</span><input class="inp" type="date" id="rp-d"></label>
    <p class="hint">Barras carregadas desde ${esc(core.fmtTime(core.bars[0].time))}. Role o gráfico para a esquerda para carregar mais histórico.</p>
    <div class="btns"><button class="btn" id="rp-go">Começar</button></div></div>`);
  sh.querySelector('#rp-go').onclick = () => { const d = sh.querySelector('#rp-d').value; if (d) { replay.jumpToTime(Date.parse(d + 'T00:00:00Z') / 1000); closeModal(); } };
}
function toggleReplay() { if (replay.active) replay.exit(); else { if ($('#app').dataset.tab !== 'chart') setTab('chart'); replay.startSelect(); } }

// linha azul de seleção (tesoura)
let selDown = false;
function showSel(clientX, clientY) {
  const chart = $('#chart'); const r = chart.getBoundingClientRect(); let x = clientX - r.left; const y = clientY - r.top;
  const v = core.view(); if (!v.length) return null;
  let hit = core.barAtX(x); if (!hit) { const l = core.chart.timeScale().coordinateToLogical(x); hit = { i: l !== null && l < 0 ? 0 : v.length - 1 }; hit.bar = v[hit.i]; }
  const bx = core.xOfLogical(hit.i); if (bx !== null) x = bx;
  const tsH = core.chart.timeScale().height(); const psW = core.chart.priceScale('right').width();
  const line = $('#rp-line'), dim = $('#rp-dim');
  line.hidden = false; line.style.left = x + 'px'; line.style.bottom = tsH + 'px'; line.style.setProperty('--ts', tsH + 'px'); line.style.setProperty('--y', Math.max(10, Math.min(r.height - tsH - 10, y)) + 'px');
  line.querySelector('.rp-sc').innerHTML = ICON.scissors; $('#rp-chip').textContent = 'Re: ' + shortDate(hit.bar.time);
  dim.hidden = false; dim.style.left = x + 'px'; dim.style.right = psW + 'px'; dim.style.bottom = tsH + 'px';
  return x;
}
function hideSel() { $('#rp-line').hidden = true; $('#rp-dim').hidden = true; selDown = false; }
function bindSelect() {
  const el = $('#chart');
  ['touchstart', 'touchmove', 'mousedown', 'mousemove', 'wheel', 'click'].forEach(t => el.addEventListener(t, e => {
    if (!replay.selecting) return; e.stopPropagation(); if (e.cancelable && t.startsWith('touch')) e.preventDefault();
  }, { capture: true, passive: false }));
  el.addEventListener('pointermove', e => { if (replay.selecting && (e.pointerType === 'mouse' || selDown)) showSel(e.clientX, e.clientY); }, { capture: true });
  el.addEventListener('pointerdown', e => { if (!replay.selecting) return; selDown = true; showSel(e.clientX, e.clientY); }, { capture: true });
  el.addEventListener('pointerup', e => {
    if (!replay.selecting || !selDown) return; selDown = false;
    const r = el.getBoundingClientRect(); const x = showSel(e.clientX, e.clientY);
    if (x !== null && replay.pickAt(x)) hideSel(); else ui.toast('Escolha uma barra dentro do histórico');
  }, { capture: true });
}

// replay trading (simulação)
const pipOf = () => Math.pow(10, oanda.instInfo(core.instrument).pip ?? -4);
function clearPos() { if (rt.line) { try { core.main.removePriceLine(rt.line); } catch { /* */ } rt.line = null; } rt.pos = null; }
function updateTradePanel() {
  const el = $('#rp-trade'); if (!el) return;
  if (!replay.active || replay.selecting) { el.hidden = true; if (!replay.active) { clearPos(); rt.total = 0; } return; }
  const last = core.view().at(-1); let pnl = null;
  if (rt.pos && last) pnl = (last.close - rt.pos.entry) * (rt.pos.side === 'buy' ? 1 : -1) / pipOf() * rt.pos.qty;
  const wasHidden = el.hidden; el.hidden = false;
  el.innerHTML = `<span class="grip" id="rt-grip">${ICON.grip}</span><button class="sell" data-t="sell">Baixa</button><button class="qty" data-t="qty">${rt.qty}</button><button class="buy" data-t="buy">Alta</button>
    ${rt.pos ? `<span class="pos ${pnl >= 0 ? 'up' : 'down'}">${pnl >= 0 ? '+' : ''}${pnl.toFixed(1)} pips</span>` : ''}<button class="flat" data-t="flat">Zerar</button>`;
  makeDraggable(el, $('#rt-grip'), 'rtPos');
  void wasHidden;
}
function tradeAct(t) {
  const last = core.view().at(-1); if (!last) return;
  if (t === 'qty') { const q = [1, 2, 3, 5, 10]; rt.qty = q[(q.indexOf(rt.qty) + 1) % q.length]; }
  else if (t === 'flat') {
    if (!rt.pos) return;
    const pnl = (last.close - rt.pos.entry) * (rt.pos.side === 'buy' ? 1 : -1) / pipOf() * rt.pos.qty; rt.total += pnl; clearPos();
    ui.toast(`Resultado ${pnl >= 0 ? '+' : ''}${pnl.toFixed(1)} pips · total ${rt.total >= 0 ? '+' : ''}${rt.total.toFixed(1)}`);
  } else {
    if (rt.pos && rt.pos.side === t) { ui.toast('Já está posicionado'); return; }
    if (rt.pos) tradeAct('flat');
    const prec = oanda.instInfo(core.instrument).prec ?? 5;
    rt.pos = { side: t, entry: last.close, qty: rt.qty };
    rt.line = core.main.createPriceLine({ price: last.close, color: t === 'buy' ? '#2962ff' : '#f23645', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: `${t === 'buy' ? 'Alta' : 'Baixa'} ${rt.qty}` });
    ui.toast(`${t === 'buy' ? 'Compra' : 'Venda'} a ${last.close.toFixed(prec)}`);
  }
  updateTradePanel();
}

// ---------------- busca de ativo ----------------
async function openSymbol() {
  const sh = openModal(head('Buscar ativo') + `<div class="sh-body"><input class="search" id="q" placeholder="EURUSD, ouro, US30, US10Y…" autocomplete="off">
    <div class="tabs" id="cats"></div><div class="list" id="res"><p class="hint">Carregando…</p></div></div>`);
  let list = []; try { list = await oanda.instruments(); } catch (e) { sh.querySelector('#res').innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
  const cats = ['Todos', ...new Set(list.map(oanda.category))]; let cat = 'Todos';
  const draw = () => {
    const q = sh.querySelector('#q').value.trim().toUpperCase().replace(/[/_ ]/g, '');
    const words = { OURO: 'XAU', PRATA: 'XAG', PETROLEO: 'WTICO', DOW: 'US30', NASDAQ: 'NAS100', SP500: 'SPX500', DAX: 'DE30' };
    const qq = words[q] || q;
    const rows = list.filter(i => (cat === 'Todos' || oanda.category(i) === cat) && (!qq || i.name.replace('_', '').includes(qq) || i.display.toUpperCase().replace(/[/ ]/g, '').includes(qq))).slice(0, 200);
    sh.querySelector('#res').innerHTML = rows.map(i => `<div class="it" data-n="${i.name}"><div style="display:flex;gap:10px;align-items:center">${symIcon(i.name, 26)}<div><div class="a">${esc(oanda.short(i.name))}</div><div class="b">${esc(i.display)} · ${oanda.category(i)}</div></div></div>
      <div class="r"><button data-w="${i.name}">${state.watch.includes(i.name) ? '★' : '☆'}</button></div></div>`).join('') || '<p class="hint">Nada encontrado.</p>';
  };
  sh.querySelector('#cats').innerHTML = cats.map(c => `<button class="${c === cat ? 'on' : ''}" data-c="${c}">${c}</button>`).join('');
  sh.querySelector('#cats').onclick = e => { const c = e.target.dataset.c; if (!c) return; cat = c; sh.querySelectorAll('#cats button').forEach(b => b.classList.toggle('on', b.dataset.c === c)); draw(); };
  sh.querySelector('#q').oninput = draw;
  sh.querySelector('#res').onclick = e => {
    const w = e.target.closest('[data-w]');
    if (w) { toggleWatch(w.dataset.w); w.textContent = state.watch.includes(w.dataset.w) ? '★' : '☆'; return; }
    const it = e.target.closest('.it'); if (it) { closeModal(); if (isMob()) setTab('chart'); loadSymbol(it.dataset.n); }
  };
  draw(); setTimeout(() => sh.querySelector('#q').focus(), 50);
}

// ---------------- timeframe / tipo de gráfico ----------------
function openTf(anchor) {
  if (!isMob() && anchor && anchor.getBoundingClientRect) {
    const groups = [['Minutos', oanda.TFS.filter(t => t.sec < 3600)], ['Horas', oanda.TFS.filter(t => t.sec >= 3600 && t.sec < 86400)], ['Dias e mais', oanda.TFS.filter(t => t.sec >= 86400)]];
    const items = []; groups.forEach(([h, arr]) => { if (!arr.length) return; items.push({ head: h }); arr.forEach(t => items.push({ label: t.label, on: t.id === state.tf, right: state.favTfs.includes(t.id) ? ICON.starF : ICON.star, rOn: state.favTfs.includes(t.id),
      onRight: () => { state.favTfs = state.favTfs.includes(t.id) ? state.favTfs.filter(x => x !== t.id) : [...state.favTfs, t.id]; store.set('favTfs', state.favTfs); renderTop(); openTf(anchor); },
      onClick: () => loadSymbol(state.instrument, t.id) })); });
    popMenu(anchor, items); return;
  }
  const sh = openModal(head('Timeframe') + `<div class="sh-body"><div class="grid-tf">${oanda.TFS.map(t => `<button data-tf="${t.id}" class="${t.id === state.tf ? 'on' : ''}">${t.label}</button>`).join('')}</div>
    <p class="hint" style="margin-top:12px">As barras diárias fecham às 17h de Nova York.</p></div>`);
  sh.querySelector('.grid-tf').onclick = e => { const t = e.target.dataset.tf; if (t) { closeModal(); loadSymbol(state.instrument, t); } };
}
function openCtype(anchor) {
  if (!isMob() && anchor && anchor.getBoundingClientRect) { popMenu(anchor, CTYPES.map(([id, n]) => ({ label: n, icon: ICON[id] || ICON.candles, on: core.ctype === id, onClick: () => { core.setChartType(id); syncChrome(); } }))); return; }
  const sh = openModal(head('Tipo de gráfico') + `<div class="sh-body list">${CTYPES.map(([id, n]) => `<div class="it" data-t="${id}"><span class="a">${n}</span>${core.ctype === id ? '<span class="ok">✓</span>' : ''}</div>`).join('')}</div>`);
  sh.querySelector('.list').onclick = e => { const it = e.target.closest('.it'); if (it) { core.setChartType(it.dataset.t); closeModal(); syncChrome(); } };
}

// ---------------- lista de ativos (watchlist) ----------------
function fmtSup(n, prec) { const s = Number(n).toFixed(prec); return prec >= 2 ? `${s.slice(0, -1)}<sup>${s.slice(-1)}</sup>` : s; }
function toggleWatch(n) { state.watch = state.watch.includes(n) ? state.watch.filter(x => x !== n) : [...state.watch, n]; store.set('watch', state.watch); renderWatch(); }
function toggleWatchPanel() {
  const w = $('#watch'); w.hidden = !w.hidden; store.set('watchOpen', !w.hidden); renderWatch(); renderRbar();
  if (!w.hidden) pollWatch(); setTimeout(() => core.chart.timeScale().applyOptions({}), 0);
}
const watchVisible = () => isMob() ? $('#app').dataset.tab === 'watch' : !$('#watch').hidden;
function renderWatch() {
  const w = $('#watch'); if (!w || (!isMob() && w.hidden)) return;
  const shut = store.get('wshut', {}); const groups = {};
  state.watch.forEach(raw => { const n = oanda.resolveTicker(raw); const info = oanda.instInfo(n); const cat = oanda.category({ name: n, type: info.type }); (groups[cat] ||= []).push(n); });
  const cats = [...CAT_ORDER.filter(c => groups[c]), ...Object.keys(groups).filter(c => !CAT_ORDER.includes(c))];
  const row = n => {
    const p = state.prices[n]; const pc = state.prevClose[n]; const info = oanda.instInfo(n); const prec = info.prec ?? 5;
    const abs = p && pc ? p.mid - pc : null; const pct = abs !== null ? abs / pc * 100 : null; const cls = abs === null ? '' : abs >= 0 ? 'up' : 'down';
    const prev = state.shown[n]; const fl = p && prev !== undefined && p.mid !== prev ? (p.mid > prev ? 'flashU' : 'flashD') : ''; if (p) state.shown[n] = p.mid;
    return `<div class="wrow ${n === state.instrument ? 'cur' : ''}" data-n="${n}">${symIcon(n, isMob() ? 44 : 18)}<div class="wn"><span class="s">${esc(oanda.short(n))}</span><span class="d">${esc(info.display || '')}</span></div>
      <div class="wp"><span class="pr ${fl}">${p ? fmtSup(p.mid, prec) : '–'}</span><span class="chg ${cls}"><span class="abs">${abs === null ? '' : (abs >= 0 ? '+' : '') + abs.toFixed(prec)}</span><span class="pct">${pct === null ? '' : (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%'}</span></span></div></div>`;
  };
  const body = cats.map(c => `<div class="wsec ${shut[c] ? 'shut' : ''}" data-cat="${esc(c)}">${ICON.chevD}<span>${esc(c)}</span></div>${shut[c] ? '' : groups[c].map(row).join('')}`).join('');
  let det = '';
  if (!isMob()) {
    const v = core.view(); const lb = v.at(-1); const info = oanda.instInfo(state.instrument); const prec = info.prec ?? 5; const pb = v.at(-2);
    if (lb) { const ch = pb ? lb.close - pb.close : 0; const cls = ch >= 0 ? 'up' : 'down';
      det = `<div class="wdet"><div class="t">${symIcon(state.instrument, 22)}<span>${esc(oanda.short(state.instrument))}</span></div><div class="dd">${esc(info.display || '')} · ${oanda.feedName()}</div>
        <div class="big">${fmtSup(lb.close, prec)}<small class="${cls}">${ch >= 0 ? '+' : ''}${ch.toFixed(prec)} ${pb ? (ch >= 0 ? '+' : '') + (ch / pb.close * 100).toFixed(2) + '%' : ''}</small></div>
        <div class="ohlc"><span>Abertura<b>${lb.open.toFixed(prec)}</b></span><span>Máxima<b>${lb.high.toFixed(prec)}</b></span><span>Mínima<b>${lb.low.toFixed(prec)}</b></span><span>Fech.<b>${lb.close.toFixed(prec)}</b></span></div></div>`; }
  }
  const keep = w.querySelector('.wl')?.scrollTop || 0;
  w.innerHTML = `<div class="wh"><span class="wt">${isMob() ? 'Lista de observação' : 'Lista'}</span><span class="wacts"><button data-act="wadd" title="Adicionar ativo">${ICON.plus}</button>${isMob() ? `<button data-act="symbol">${ICON.search}</button>` : `<button data-act="watch" title="Fechar">${ICON.x}</button>`}</span></div>
    <div class="wcols"><span>Símbolo</span><span>Preço</span><span>Var%</span></div><div class="wl">${body}</div>${det}`;
  const wl = w.querySelector('.wl'); if (wl) wl.scrollTop = keep;
}
async function pollWatch() {
  if (!watchVisible() || !state.watch.length) return;
  try {
    const names = state.watch.map(oanda.resolveTicker);
    const ps = await oanda.pricing(names); ps.forEach(p => { state.prices[p.instrument] = p; if (p.sessionClose) state.prevClose[p.instrument] = p.sessionClose; });
    const missing = names.filter(n => state.prevClose[n] === undefined);
    await Promise.all(missing.slice(0, 6).map(async n => { try { const d = await oanda.candles(n, 'D', { count: 2 }); state.prevClose[n] = d.length > 1 ? d[d.length - 2].close : d[0]?.open; } catch { state.prevClose[n] = null; } }));
    renderWatch();
  } catch { /* offline */ }
}
setInterval(pollWatch, 3000);

// ---------------- cursor (cruz / seta) ----------------
function setCross(mode) { store.set('cross', mode); core.chart.applyOptions({ crosshair: { mode: mode === 'arrow' ? 2 : mode === 'dot' ? 1 : 0 } }); }
function openCursorMenu(el) {
  const cur = store.get('cross', 'cross');
  popMenu(el, [{ label: 'Cruz', icon: toolSvg('cursor').replace(/<path[^>]*\/>/, '<path d="M12 4v16M4 12h16"/>'), on: cur === 'cross', onClick: () => { setCross('cross'); drawings.setTool('cursor'); } },
    { label: 'Ponto (gruda no preço)', icon: ICON.magnet, on: cur === 'dot', onClick: () => { setCross('dot'); drawings.setTool('cursor'); } },
    { label: 'Seta', icon: toolSvg('cursor'), on: cur === 'arrow', onClick: () => { setCross('arrow'); drawings.setTool('cursor'); } }], { side: 'right' });
}

// ---------------- ações (cliques nos botões das barras) ----------------
const ACT = {
  symbol: () => openSymbol(),
  tf: el => openTf(el),
  tfset: el => loadSymbol(state.instrument, el.dataset.tf),
  ctype: el => openCtype(el),
  ind: () => openIndicators(),
  replay: () => toggleReplay(),
  undo: () => drawings.undo(),
  redo: () => drawings.redo(),
  theme: () => { const t = core.theme === 'dark' ? 'light' : 'dark'; core.applyTheme(t); document.documentElement.dataset.theme = t; drawings.update(); syncChrome(); },
  settings: () => openSettings(),
  watch: () => toggleWatchPanel(),
  tab: el => {
    const t = el.dataset.t;
    if (t === 'watch' || t === 'chart') setTab(t); else if (t === 'replay') toggleReplay(); else if (t === 'scripts') openIndicators(); else if (t === 'menu') openSettings();
  },
  range: el => applyRange(el.dataset.r),
  goto: () => openGoto(),
  pct: () => { const p = core.chart.priceScale('right'); p.applyOptions({ mode: p.options().mode === 2 ? 0 : 2 }); renderBot(); },
  log: () => { const p = core.chart.priceScale('right'); p.applyOptions({ mode: p.options().mode === 1 ? 0 : 1 }); renderBot(); },
  auto: () => { const p = core.chart.priceScale('right'); p.applyOptions({ autoScale: !p.options().autoScale }); renderBot(); },
  zoomin: () => { const ts = core.chart.timeScale(); ts.applyOptions({ barSpacing: Math.min(60, ts.options().barSpacing * 1.4) }); },
  magnet: () => { drawings.magnet = !drawings.magnet; store.set('magnet', drawings.magnet); renderTools(); ui.toast(drawings.magnet ? 'Ímã ligado' : 'Ímã desligado'); },
  hide: () => { drawings.hidden = !drawings.hidden; drawings.update(); renderTools(); },
  clear: () => { if (drawings.items.length && confirm('Apagar todos os desenhos deste ativo?')) drawings.clearAll(); },
  mdraw: () => { if (drawings.tool !== 'cursor') drawings.setTool('cursor'); else openMDraw(); },
  mmore: () => openMMore(),
  sync: () => {
    if (!sync.enabled()) { openSettings(); return; }
    ui.toast('Sincronizando…'); sync.sync().then(ch => ui.toast(ch ? 'Sincronizado' : 'Tudo em dia')).catch(e => ui.toast(e.message));
  },
  recent: el => { if (isMob()) setTab('chart'); loadSymbol(el.dataset.i, el.dataset.tf); },
  wadd: () => openSymbol(),
};
function bindEvents() {
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-act]'); if (t && !t.closest('#sheet')) { const f = ACT[t.dataset.act]; if (f) { f(t, e); return; } }
    const g = e.target.closest('.tool[data-g]');
    if (g) {
      const gid = g.dataset.g; const ids = TG.find(x => x[0] === gid)[1];
      if (gid === 'cursor') { if (drawings.tool !== 'cursor') drawings.setTool('cursor'); else openCursorMenu(g); return; }
      if (ids.length === 1) { toggleTool(ids[0]); return; }
      popMenu(g, ids.map(id => ({ label: toolDef(id).name, icon: toolSvg(id), on: drawings.tool === id, onClick: () => pickTool(gid, id) })), { side: 'right' }); return;
    }
    const ft = e.target.closest('.favbar [data-tool]'); if (ft) { toggleTool(ft.dataset.tool); return; }
  });
  $('#replay-bar').addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (b) replayAct(b.dataset.r, b); });
  $('#rp-trade').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (b) tradeAct(b.dataset.t); });
  $('#legend').addEventListener('click', e => {
    if (e.target.closest('[data-act]')) return;
    if (e.target.closest('[data-a="collapse"]')) { legendCollapsed = !legendCollapsed; updateLegend(); return; }
    const row = e.target.closest('.ind'); if (!row) return; const id = row.dataset.id; const btn = e.target.closest('button');
    if (!btn) { document.querySelectorAll('.legend .ind').forEach(x => x.classList.toggle('sel', x === row && !x.classList.contains('sel'))); return; }
    const s = scripts.active.find(x => x.id === id); if (!s) return;
    const a = btn.dataset.a;
    if (a === 'eye') scripts.toggle(id);
    if (a === 'del') { scripts.remove(id); updateLegend(); }
    if (a === 'set') openInputs(s);
    if (a === 'code') openEditor({ name: s.name, source: s.source, activeId: s.id });
  });
  $('#watch').addEventListener('click', e => {
    if (e.target.closest('[data-act]')) return;
    const sec = e.target.closest('.wsec'); if (sec) { const sh = store.get('wshut', {}); sh[sec.dataset.cat] = !sh[sec.dataset.cat]; store.set('wshut', sh); renderWatch(); return; }
    const r = e.target.closest('.wrow'); if (r) { if (isMob()) setTab('chart'); loadSymbol(r.dataset.n); }
  });
  $('#watch').addEventListener('contextmenu', e => { const r = e.target.closest('.wrow'); if (!r) return; e.preventDefault(); popMenu(r, [{ label: 'Remover da lista', icon: ICON.trash, onClick: () => toggleWatch(r.dataset.n) }]); });
}

// ---------------- layout (PC deitado / celular em pé) ----------------
function syncChrome() { renderTop(); renderMBot(); renderMTabs(); renderRbar(); updateUndo(); }
function applyLayout(force) {
  const l = mqDesk.matches ? 'desk' : 'mob'; const changed = document.documentElement.dataset.layout !== l;
  document.documentElement.dataset.layout = l;
  if (!changed && !force) return;
  const w = $('#watch');
  if (l === 'desk') { w.hidden = !store.get('watchOpen', innerWidth >= 1000); $('#app').dataset.tab = 'chart'; } else { w.hidden = false; }
  renderTop(); renderTools(); renderFav(); renderRbar(); renderBot(); renderMBot(); renderMTabs(); renderWatch(); updateLegend(); renderReplayBar(); updateTradePanel(); updateUndo(); updateCd();
  setTimeout(() => core.chart.timeScale().applyOptions({}), 0);
}
mqDesk.addEventListener('change', () => applyLayout());

// ---------------- indicadores ----------------
function openIndicators() {
  const sh = openModal(head('Indicadores e scripts') + `<div class="sh-body">
    <div class="btns" style="justify-content:flex-start;margin-top:0"><button class="btn" id="new-script">${'+ Novo script Pine'}</button><button class="btn ghost" id="paste-script">Colar script do TradingView</button></div>
    <div class="sec-t">No gráfico</div><div class="list" id="act"></div>
    <div class="sec-t">Meus scripts</div><div class="list" id="mine"></div>
    <div class="sec-t">Padrões</div><div class="list" id="blt"></div></div>`);
  const draw = () => {
    sh.querySelector('#act').innerHTML = scripts.active.map(s => `<div class="it" data-id="${s.id}"><div><div class="a">${esc(s.name)}</div>${scripts.results[s.id]?.error ? `<div class="b bad">${esc(scripts.results[s.id].error)}</div>` : ''}</div>
      <div class="r"><button data-a="set">Ajustes</button><button data-a="code">Código</button><button data-a="del">Remover</button></div></div>`).join('') || '<p class="hint">Nenhum indicador.</p>';
    sh.querySelector('#mine').innerHTML = scripts.lib.map((s, k) => `<div class="it" data-k="${k}"><div class="a">${esc(s.name)}</div><div class="r"><button data-a="add">Adicionar</button><button data-a="code">Editar</button><button data-a="del">Apagar</button></div></div>`).join('') || '<p class="hint">Os scripts que você salvar aparecem aqui.</p>';
    sh.querySelector('#blt').innerHTML = BUILTINS.map((s, k) => `<div class="it" data-b="${k}"><div class="a">${esc(s.name)}</div><div class="r"><button data-a="add">Adicionar</button></div></div>`).join('');
  };
  draw();
  sh.querySelector('#new-script').onclick = () => openEditor({ name: 'Meu script', source: `//@version=5\nindicator("Meu script", overlay=true)\nplot(ta.ema(close, 20), "EMA 20", color=color.orange)\n` });
  sh.querySelector('#paste-script').onclick = () => openEditor({ name: '', source: '' });
  sh.querySelector('.sh-body').onclick = e => {
    const btn = e.target.closest('button[data-a]'); if (!btn) return; const row = btn.closest('.it'); const a = btn.dataset.a;
    if (row.dataset.id) {
      const s = scripts.active.find(x => x.id === row.dataset.id);
      if (a === 'del') { scripts.remove(s.id); draw(); updateLegend(); }
      if (a === 'set') openInputs(s);
      if (a === 'code') openEditor({ name: s.name, source: s.source, activeId: s.id });
    } else if (row.dataset.k !== undefined) {
      const s = scripts.lib[+row.dataset.k];
      if (a === 'add') { scripts.add(s.name, s.source); ui.toast('Adicionado: ' + s.name); draw(); }
      if (a === 'code') openEditor({ name: s.name, source: s.source, libIndex: +row.dataset.k });
      if (a === 'del' && confirm('Apagar "' + s.name + '"?')) { scripts.lib.splice(+row.dataset.k, 1); scripts.saveLib(); draw(); }
    } else if (row.dataset.b !== undefined) {
      const s = BUILTINS[+row.dataset.b]; scripts.add(s.name, s.source); ui.toast('Adicionado: ' + s.name); draw();
    }
  };
}
function scriptTitle(src) { const m = /(?:indicator|strategy|study)\s*\(\s*(?:title\s*=\s*)?["']([^"']+)["']/.exec(src); return m ? m[1] : null; }
function openEditor({ name, source, activeId, libIndex }) {
  const sh = openModal(head('Editor Pine Script') + `<div class="sh-body"><div class="ed-wrap">
    <input class="inp" id="ed-name" placeholder="Nome do script" value="${esc(name)}">
    <textarea class="editor" id="ed-src" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="Cole aqui o código Pine Script (v5 ou v6) copiado do TradingView">${esc(source)}</textarea>
    <div class="ed-err" id="ed-err"></div>
    <div class="btns" style="margin-top:0"><button class="btn ghost" id="ed-save">Salvar em Meus scripts</button><button class="btn" id="ed-apply">${activeId ? 'Atualizar no gráfico' : 'Adicionar ao gráfico'}</button></div>
  </div></div>`, { wide: true });
  const ta = sh.querySelector('#ed-src');
  ta.addEventListener('keydown', e => { if (e.key === 'Tab') { e.preventDefault(); const s = ta.selectionStart; ta.setRangeText('    ', s, ta.selectionEnd, 'end'); } });
  const getName = () => sh.querySelector('#ed-name').value.trim() || scriptTitle(ta.value) || 'Script';
  const check = async () => {
    const src = ta.value; if (!src.trim()) { sh.querySelector('#ed-err').textContent = 'O script está vazio.'; return false; }
    sh.querySelector('#ed-err').textContent = 'Testando…';
    try {
      const v = core.view(); const pine = new PineTS(scripts.provider(), oanda.short(core.instrument), core.tf.id, Math.min(v.length, 600));
      await pine.run(new Indicator(src)); sh.querySelector('#ed-err').textContent = ''; return true;
    } catch (e) { sh.querySelector('#ed-err').textContent = 'Erro: ' + (e.message || e); return false; }
  };
  sh.querySelector('#ed-save').onclick = () => {
    const item = { name: getName(), source: ta.value };
    if (libIndex !== undefined) scripts.lib[libIndex] = item; else scripts.lib.push(item);
    scripts.saveLib(); ui.toast('Salvo em Meus scripts');
  };
  sh.querySelector('#ed-apply').onclick = async () => {
    if (!(await check())) return;
    if (activeId) { const s = scripts.active.find(x => x.id === activeId); if (s) { s.source = ta.value; s.name = getName(); s.inputs = {}; scripts.saveActive(); scripts.runAll(); } }
    else scripts.add(getName(), ta.value);
    closeModal(); ui.toast('Script aplicado');
  };
}
function openInputs(s) {
  const meta = scripts.inputsMeta(s.source).filter(m => m.type !== 'session' && m.type !== 'time');
  const key = m => m.title || m.id;
  const val = m => s.inputs?.[key(m)] ?? m.defval;
  const field = (m, k) => {
    const v = val(m); const lbl = esc(m.title || m.name || m.id);
    if (m.type === 'bool') return `<label class="chk"><input type="checkbox" data-k="${k}" ${v ? 'checked' : ''}> ${lbl}</label>`;
    if (m.options?.length) return `<label class="fld"><span>${lbl}</span><select class="inp" data-k="${k}">${m.options.map(o => `<option ${String(o) === String(v) ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
    if (m.type === 'source') return `<label class="fld"><span>${lbl}</span><select class="inp" data-k="${k}">${['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4', 'hlcc4'].map(o => `<option ${o === String(v) ? 'selected' : ''}>${o}</option>`).join('')}</select></label>`;
    if (m.type === 'color') return `<label class="fld"><span>${lbl}</span><input type="color" class="color-in" data-k="${k}" value="${String(v).slice(0, 7)}"></label>`;
    if (m.type === 'int' || m.type === 'float' || m.type === 'price') return `<label class="fld"><span>${lbl}</span><input class="inp" type="number" data-k="${k}" value="${esc(v)}" step="${m.step || (m.type === 'int' ? 1 : 'any')}" ${m.minval !== undefined ? `min="${m.minval}"` : ''} ${m.maxval !== undefined ? `max="${m.maxval}"` : ''}></label>`;
    if (m.type === 'timeframe') return `<label class="fld"><span>${lbl}</span><select class="inp" data-k="${k}"><option value="" ${!v ? 'selected' : ''}>Do gráfico</option>${oanda.TFS.map(t => `<option value="${t.id}" ${t.id === String(v) ? 'selected' : ''}>${t.label}</option>`).join('')}</select></label>`;
    return `<label class="fld"><span>${lbl}</span><input class="inp" data-k="${k}" value="${esc(v)}"></label>`;
  };
  const groups = {}; meta.forEach((m, k) => (groups[m.group || ''] ||= []).push(field(m, k)));
  const body = Object.entries(groups).map(([g, f]) => (g ? `<div class="sec-t">${esc(g)}</div>` : '') + f.join('')).join('') || '<p class="hint">Este script não tem entradas configuráveis.</p>';
  const sh = openModal(head('Ajustes · ' + esc(s.name)) + `<div class="sh-body">${body}<div class="btns"><button class="btn ghost" id="in-reset">Padrão</button><button class="btn" id="in-ok">Aplicar</button></div></div>`);
  sh.querySelector('#in-reset').onclick = () => { scripts.setInputs(s.id, {}); closeModal(); };
  sh.querySelector('#in-ok').onclick = () => {
    const out = {};
    sh.querySelectorAll('[data-k]').forEach(el => {
      const m = meta[+el.dataset.k]; let v = el.type === 'checkbox' ? el.checked : el.value;
      if (m.type === 'int') v = parseInt(v); else if (m.type === 'float' || m.type === 'price') v = parseFloat(v);
      if (v !== m.defval && !(typeof v === 'number' && isNaN(v))) out[key(m)] = v;
    });
    scripts.setInputs(s.id, out); closeModal();
  };
}

// ---------------- configurações ----------------
function openSettings() {
  const c = oanda.cfg(); const k = ctCfg(); const prov = oanda.provider(); const tzs = ['America/Sao_Paulo', 'America/Bahia', 'America/New_York', 'Europe/London', 'UTC'];
  const sh = openModal(head('Configurações') + `<div class="sh-body">
    <div class="sec-t">Fonte de preços</div>
    <label class="fld"><select class="inp" id="s-prov"><option value="ctrader" ${prov === 'ctrader' ? 'selected' : ''}>cTrader (Open API)</option><option value="oanda" ${prov === 'oanda' ? 'selected' : ''}>OANDA (v20)</option></select></label>
    <div id="p-ct" ${prov === 'ctrader' ? '' : 'hidden'}>
      <p class="hint">Dados do app criado em openapi.ctrader.com → Applications. O token e o refresh token saem do botão Playground. Tudo fica salvo só neste aparelho.</p>
      <div class="row2"><label class="fld"><span>Client ID</span><input class="inp" id="c-id" value="${esc(k.clientId)}" autocomplete="off"></label>
      <label class="fld"><span>Client Secret</span><input class="inp" id="c-sec" type="password" value="${esc(k.clientSecret)}" autocomplete="off"></label></div>
      <div class="row2"><label class="fld"><span>Access token</span><input class="inp" id="c-tok" type="password" value="${esc(k.accessToken)}" autocomplete="off"></label>
      <label class="fld"><span>Refresh token</span><input class="inp" id="c-ref" type="password" value="${esc(k.refreshToken)}" autocomplete="off"></label></div>
      <label class="fld"><span>Conta</span><select class="inp" id="c-acc">${k.accountId ? `<option value="${esc(k.accountId)}">${esc(k.accountId)}</option>` : '<option value="">— toque em Conectar —</option>'}</select></label>
      <div class="btns" style="justify-content:flex-start"><button class="btn" id="c-go">Conectar</button>${k.accessToken ? '<button class="btn danger" id="c-out">Desconectar</button>' : ''}</div>
    </div>
    <div id="p-oa" ${prov === 'oanda' ? '' : 'hidden'}>
      <p class="hint">Token criado em OANDA → Minha conta → "Gerenciar acesso à API" (só contas v20). Fica salvo só neste aparelho.</p>
      <div class="row2"><label class="fld"><span>Tipo de conta</span><select class="inp" id="s-env"><option value="practice" ${c.env === 'practice' ? 'selected' : ''}>Demo (practice)</option><option value="live" ${c.env === 'live' ? 'selected' : ''}>Real (live)</option></select></label>
      <label class="fld"><span>Conta</span><select class="inp" id="s-acc">${c.account ? `<option>${esc(c.account)}</option>` : '<option value="">—</option>'}</select></label></div>
      <label class="fld"><span>Token da API</span><input class="inp" id="s-tok" type="password" value="${esc(c.token)}" placeholder="cole o token aqui" autocomplete="off"></label>
      <div class="btns" style="justify-content:flex-start"><button class="btn" id="s-test">Conectar</button>${c.token ? '<button class="btn danger" id="s-out">Desconectar</button>' : ''}</div>
    </div>
    <div id="s-msg" class="hint">${oanda.hasOanda() ? `<span class="ok">Conectado à ${oanda.feedName()}.</span>` : 'Sem conta conectada: o app está em modo demonstração (preços simulados).'}</div>
    <div class="sec-t">Sincronizar entre aparelhos</div>
    <p class="hint">Desenhos, scripts, lista de ativos e ajustes ficam num Gist secreto do seu GitHub. Tokens das corretoras não são enviados.
    Crie o token em github.com/settings/personal-access-tokens/new → <b>Account permissions → Gists: Read and write</b>. Use o mesmo token nos outros aparelhos.</p>
    ${sync.enabled() ? `<div class="hint"><span class="ok">Sincronização ligada.</span> Última: ${sync.cfg().last ? new Date(sync.cfg().last).toLocaleString('pt-BR') : '—'}</div>
      <div class="btns" style="justify-content:flex-start"><button class="btn" id="y-now">Sincronizar agora</button><button class="btn danger" id="y-off">Desligar</button></div>`
    : `<label class="fld"><span>Token do GitHub</span><input class="inp" id="y-tok" type="password" autocomplete="off" placeholder="github_pat_…"></label>
      <div class="btns" style="justify-content:flex-start"><button class="btn" id="y-on">Ligar sincronização</button></div>`}
    <div id="y-msg" class="hint"></div>
    <div class="sec-t">Yields (CNBC)</div>
    <p class="hint">Yields de 10 anos vêm do site da CNBC (não oficial). Se pararem de funcionar, teste aqui e mande um print.</p>
    <div class="btns" style="justify-content:flex-start"><button class="btn ghost" id="s-ytest">Testar yields</button></div>
    <div id="s-yres" class="hint"></div>
    <div class="sec-t">Aparência</div>
    <div class="row2"><label class="fld"><span>Tema</span><select class="inp" id="s-theme"><option value="dark" ${core.theme === 'dark' ? 'selected' : ''}>Escuro</option><option value="light" ${core.theme === 'light' ? 'selected' : ''}>Claro</option></select></label>
    <label class="fld"><span>Fuso horário (intraday)</span><select class="inp" id="s-tz">${[...new Set([core.tz, ...tzs])].map(t => `<option ${t === core.tz ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
    <div class="sec-t">Backup</div>
    <div class="btns" style="justify-content:flex-start"><button class="btn ghost" id="s-exp">Exportar desenhos e scripts</button><button class="btn ghost" id="s-imp">Importar</button></div>
    <p class="hint" style="margin-top:14px">Gráficos por TradingView Lightweight Charts™ · scripts Pine executados com PineTS.</p></div>`);
  const msg = sh.querySelector('#s-msg');
  sh.querySelector('#s-prov').onchange = e => {
    const v = e.target.value; sh.querySelector('#p-ct').hidden = v !== 'ctrader'; sh.querySelector('#p-oa').hidden = v !== 'oanda';
    store.set('provider', v); msg.textContent = 'Fonte alterada. Conecte a conta abaixo (o app recarrega ao conectar).';
  };
  sh.querySelector('#c-go').onclick = async () => {
    const val = id => sh.querySelector(id).value.trim();
    const conf = { clientId: val('#c-id'), clientSecret: val('#c-sec'), accessToken: val('#c-tok'), refreshToken: val('#c-ref'), accountId: '', isLive: false };
    if (!conf.clientId || !conf.clientSecret || !conf.accessToken) { msg.innerHTML = '<span class="bad">Preencha Client ID, Client Secret e Access token.</span>'; return; }
    msg.textContent = 'Conectando à cTrader…';
    const prev = ctCfg(); store.set('ctrader', conf); ct.close();
    try {
      const accs = await ct.login({ accountsOnly: true }); ct.close();
      if (!accs.length) throw new Error('Nenhuma conta cTrader ligada a esse token.');
      const sel = sh.querySelector('#c-acc');
      sel.innerHTML = accs.map(a => `<option value="${a.id}" data-live="${a.isLive ? 1 : 0}">${a.isLive ? 'Real' : 'Demo'} · ${esc(a.broker)} · ${esc(a.login)}</option>`).join('');
      const save = () => { const o = sel.selectedOptions[0]; store.set('ctrader', { ...ctCfg(), accountId: o.value, isLive: o.dataset.live === '1' }); store.set('provider', 'ctrader'); store.del('ct:symbols'); location.reload(); };
      sel.onchange = save;
      if (accs.length === 1) save(); else msg.innerHTML = '<span class="ok">Token OK.</span> Escolha a conta acima.';
    } catch (e) { ct.close(); store.set('ctrader', prev); msg.innerHTML = `<span class="bad">${esc(e.message)}</span>`; }
  };
  sh.querySelector('#c-out')?.addEventListener('click', () => { if (confirm('Remover os dados da cTrader deste aparelho?')) { store.del('ctrader'); store.del('ct:symbols'); location.reload(); } });
  sh.querySelector('#s-test').onclick = async () => {
    const tok = sh.querySelector('#s-tok').value.trim(); const env = sh.querySelector('#s-env').value;
    if (!tok) { msg.innerHTML = '<span class="bad">Cole o token primeiro.</span>'; return; }
    msg.textContent = 'Conectando…';
    try {
      const accs = await oanda.testConnection(tok, env);
      if (!accs.length) throw new Error('Nenhuma conta encontrada para esse token.');
      const sel = sh.querySelector('#s-acc'); sel.innerHTML = accs.map(a => `<option>${esc(a.id)}</option>`).join('');
      const save = () => { store.set('oanda', { token: tok, env, account: sel.value }); store.set('provider', 'oanda'); store.del('instruments'); location.reload(); };
      sel.onchange = save;
      if (accs.length === 1) save(); else msg.innerHTML = '<span class="ok">Token OK.</span> Escolha a conta acima.';
    } catch (e) { msg.innerHTML = `<span class="bad">${esc(e.message)}</span>`; }
  };
  sh.querySelector('#s-out')?.addEventListener('click', () => { if (confirm('Remover o token deste aparelho?')) { store.del('oanda'); store.del('instruments'); location.reload(); } });
  const ymsg = sh.querySelector('#y-msg');
  sh.querySelector('#y-on')?.addEventListener('click', async () => {
    const tok = sh.querySelector('#y-tok').value.trim(); if (!tok) { ymsg.innerHTML = '<span class="bad">Cole o token.</span>'; return; }
    ymsg.textContent = 'Conectando ao GitHub…';
    try { await sync.connect(tok); closeModal(); ui.toast('Sincronização ligada ✓'); } catch (e) { sync.disconnect(); ymsg.innerHTML = `<span class="bad">${esc(e.message)}</span>`; }
  });
  sh.querySelector('#y-now')?.addEventListener('click', async () => {
    ymsg.textContent = 'Sincronizando…';
    try { const ch = await sync.sync(); ymsg.innerHTML = `<span class="ok">${ch ? 'Atualizado com o outro aparelho.' : 'Tudo em dia.'}</span>`; } catch (e) { ymsg.innerHTML = `<span class="bad">${esc(e.message)}</span>`; }
  });
  sh.querySelector('#y-off')?.addEventListener('click', () => { if (confirm('Desligar a sincronização neste aparelho?')) { sync.disconnect(); closeModal(); ui.toast('Sincronização desligada'); } });
  sh.querySelector('#s-ytest').onclick = async () => {
    const box = sh.querySelector('#s-yres'); box.textContent = 'Testando os yields de 10 anos…';
    const { test } = await import('./yields.js');
    const r = await test();
    box.innerHTML = r.map(x => `<div><b>${x.name}</b> <span class="${x.ok ? 'ok' : 'bad'}">${esc(x.info)}</span></div>`).join('');
  };
  sh.querySelector('#s-theme').onchange = e => { core.applyTheme(e.target.value); document.documentElement.dataset.theme = e.target.value; drawings.update(); syncChrome(); };
  sh.querySelector('#s-tz').onchange = e => { core.setTz(e.target.value); };
  sh.querySelector('#s-exp').onclick = async () => {
    const data = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('gfx:') && k !== 'gfx:oanda' && k !== 'gfx:ctrader') data[k] = localStorage.getItem(k); }
    const txt = JSON.stringify(data);
    try { await navigator.clipboard.writeText(txt); ui.toast('Backup copiado para a área de transferência'); } catch { prompt('Copie o backup:', txt); }
  };
  sh.querySelector('#s-imp').onclick = () => {
    const txt = prompt('Cole o backup:'); if (!txt) return;
    try { const d = JSON.parse(txt); Object.entries(d).forEach(([k, v]) => k.startsWith('gfx:') && k !== 'gfx:oanda' && k !== 'gfx:ctrader' && localStorage.setItem(k, v)); location.reload(); } catch { ui.toast('Backup inválido'); }
  };
}


// ---------------- início ----------------
bindSelect(); bindEvents();
setCross(store.get('cross', 'cross'));
applyLayout(true);
pollWatch();
if (!oanda.hasOanda()) ui.banner('Modo demonstração — conecte sua conta cTrader para preços reais', 'Conectar', () => { ui.banner(null); openSettings(); });
loadSymbol(state.instrument, state.tf);
document.addEventListener('visibilitychange', () => { if (document.hidden) core.stopLive(); else if (!replay.active) core.startLive(); });
// botão voltar do Android: fecha janelas antes de sair do app
try {
  CapApp.addListener('backButton', () => {
    if (!$('#pmenu').hidden) closePop();
    else if (!$('#modal').hidden) closeModal();
    else if (isMob() && $('#app').dataset.tab === 'watch') setTab('chart');
    else if (replay.selecting) replay.exit();
    else if (drawings.sel) drawings.select(null);
    else if (drawings.tool !== 'cursor') drawings.setTool('cursor');
    else if (!isMob() && !$('#watch').hidden) toggleWatchPanel();
    else if (replay.active) replay.exit();
    else CapApp.minimizeApp();
  });
} catch { /* navegador */ }
// link vindo do Diário de Trades: graficosfx://open?symbol=EURUSD&date=2026-11-12&result=WIN&r=2
async function openFromLink(url) {
  try {
    const u = new URL(url); const q = u.searchParams;
    const sym = q.get('symbol'); if (!sym) return;
    if (isMob()) setTab('chart');
    await loadSymbol(sym, q.get('tf') || state.tf || 'D');
    const date = q.get('date'); if (!date) return;
    const t = Date.parse(date + 'T12:00:00Z') / 1000; if (!isFinite(t)) return;
    const first = core.bars[0];
    if (first && t < first.time) { ui.toast('Dia fora do histórico carregado — role para a esquerda'); return; }
    const l = Math.round(core.timeToLogical(t));
    core.chart.timeScale().setVisibleLogicalRange({ from: l - 70, to: l + 25 });
    const bar = core.view()[Math.max(0, Math.min(l, core.view().length - 1))];
    if (bar) {
      const res = q.get('result') || ''; const r = q.get('r');
      const label = `${res}${r ? ' ' + (+r > 0 ? '+' : '') + r + 'R' : ''}`.trim();
      drawings.items.push({ id: '__trade__', type: 'vline', color: '#ffb84d', width: 1, pts: [{ t: bar.time, p: bar.close }] });
      if (label) drawings.items.push({ id: '__trade_t__', type: 'text', color: '#ffb84d', width: 2, text: label, pts: [{ t: bar.time, p: bar.high * 1.004 }] });
      drawings.update(); // marcação temporária: não é salva
    }
  } catch { /* link inválido */ }
}
try {
  CapApp.addListener('appUrlOpen', e => openFromLink(e.url));
  CapApp.getLaunchUrl().then(r => { if (r && r.url) openFromLink(r.url); }).catch(() => { });
} catch { /* navegador */ }
// sincronização: ao abrir, ao voltar para o app e a cada 2 min
sync.hooks({
  onRemote: keys => {
    if (keys.some(k => k === 'draw:' + state.instrument)) drawings.loadFor(state.instrument);
    if (keys.some(k => k.startsWith('scripts:'))) { scripts.active = store.get('scripts:active', []); scripts.lib = store.get('scripts:lib', []); scripts.runAll(); }
    if (keys.includes('watch')) { state.watch = store.get('watch', state.watch); renderWatch(); }
    if (keys.includes('favTfs')) { state.favTfs = store.get('favTfs', state.favTfs); renderTop(); }
    ui.toast('Sincronizado com o outro aparelho');
  },
});
const doSync = () => { if (sync.enabled() && !document.hidden) sync.sync().catch(() => { }); };
setTimeout(doSync, 1500); setInterval(doSync, 120000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) doSync(); });
window.__app = { core, drawings, scripts, replay, loadSymbol, openFromLink, state, setTab, applyLayout };
