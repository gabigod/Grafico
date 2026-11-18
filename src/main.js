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

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICON = {
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>',
  code: '<svg viewBox="0 0 24 24"><path d="M8 7l-5 5 5 5M16 7l5 5-5 5"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M7 4h3v16H7zM14 4h3v16h-3z" fill="currentColor"/></svg>',
  fwd: '<svg viewBox="0 0 24 24"><path d="M5 5l9 7-9 7z" fill="currentColor"/><path d="M18 5v14"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M19 5l-9 7 9 7z" fill="currentColor"/><path d="M6 5v14"/></svg>',
  magnet: '<svg viewBox="0 0 24 24"><path d="M6 3v8a6 6 0 0 0 12 0V3h-4v8a2 2 0 0 1-4 0V3z"/><path d="M6 7h4M14 7h4"/></svg>',
  hide: '<svg viewBox="0 0 24 24"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A9.6 9.6 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7a9.4 9.4 0 0 0 5.4-1.6"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
};
const CTYPES = [['candles', 'Candles'], ['hollow', 'Candles vazados'], ['heikin', 'Heikin Ashi'], ['bars', 'Barras'], ['line', 'Linha'], ['area', 'Área']];
const DEFAULT_WATCH = ['EUR_USD', 'GBP_USD', 'USD_JPY', 'AUD_USD', 'USD_CAD', 'USD_CHF', 'NZD_USD', 'GBP_JPY', 'XAU_USD', 'US30_USD', 'NAS100_USD', 'SPX500_USD'];

// ---------------- estado ----------------
const state = {
  instrument: store.get('instrument', 'EUR_USD'),
  tf: store.get('tf', 'D'),
  watch: store.get('watch', DEFAULT_WATCH),
  favTfs: store.get('favTfs', ['15', '60', '240', 'D', 'W']),
  prices: {}, prevClose: {},
};

// ---------------- UI helpers ----------------
const ui = {
  toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(ui._tt); ui._tt = setTimeout(() => t.classList.remove('on'), 2200); },
  banner(msg, btn, fn) {
    const b = $('#banner'); if (!msg) { b.hidden = true; return; }
    b.innerHTML = esc(msg) + (btn ? ` <button>${esc(btn)}</button>` : ''); b.hidden = false;
    if (btn) b.querySelector('button').onclick = fn;
  },
  onTool(id) { document.querySelectorAll('.tool[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === id)); },
  onSelect(it) { renderDrawPop(it); },
  editText(it) { const t = prompt('Texto', it.text || ''); if (t !== null) { drawings.setStyle({ text: t }); } },
  isReplaySelecting: () => replay?.selecting,
  onReplay: () => renderReplayBar(),
  onReplayStep: () => { renderReplayBar(); scheduleScripts(); updateLegend(); },
  onScriptsRendered: () => updateLegend(),
};
function openModal(html, { wide } = {}) {
  const sh = $('#sheet'); sh.className = 'sheet' + (wide ? ' wide' : ''); sh.innerHTML = html; $('#modal').hidden = false;
  sh.querySelectorAll('[data-close]').forEach(b => b.onclick = closeModal);
  return sh;
}
function closeModal() { $('#modal').hidden = true; $('#sheet').innerHTML = ''; }
$('#modal').addEventListener('pointerdown', e => { if (e.target.id === 'modal') closeModal(); });
const head = t => `<div class="sh-head"><span>${t}</span><button data-close>${ICON.x}</button></div>`;

// ---------------- núcleo ----------------
const core = new ChartCore($('#chart'));
document.documentElement.dataset.theme = core.theme;
const drawings = new Drawings(core, $('#chart'), ui);
const scripts = new Scripts(core, ui);
const replay = new Replay(core, ui);

let scriptTimer = null;
function scheduleScripts(delay = 120) { clearTimeout(scriptTimer); scriptTimer = setTimeout(() => scripts.runAll(), delay); }
core.on('data', () => scheduleScripts(80));
core.on('newBar', () => scheduleScripts(10));
let lastTickRun = 0;
core.on('tick', () => { updateLegend(); const now = Date.now(); if (now - lastTickRun > 5000) { lastTickRun = now; scheduleScripts(300); } });
core.on('error', e => ui.toast(e.message));
let liveErrShown = 0;
core.on('liveError', e => { if (Date.now() - liveErrShown > 15000) { liveErrShown = Date.now(); ui.toast('Sem conexão: ' + e.message); } });

async function loadSymbol(instrument, tf = state.tf) {
  if (replay.active) replay.exit();
  instrument = oanda.resolveTicker(instrument);
  state.instrument = instrument; state.tf = tf; store.set('instrument', instrument); store.set('tf', tf);
  $('#sym-name').textContent = oanda.short(instrument); $('#tf-name').textContent = oanda.tfById(tf).label;
  renderWatch();
  if (core.instrument !== instrument || core.tf.id !== tf) { scripts.results = {}; scripts.renderAll(); }
  drawings.loadFor(instrument);
  const gen = ++loadGen;
  try {
    await core.load(instrument, tf);
    if (gen !== loadGen) return;
    core.startLive();
  } catch (e) { if (gen === loadGen) ui.toast(e.message); }
  updateLegend();
  schedulePrefetch(gen);
}

// ---------------- pré-carregamento em segundo plano ----------------
// deixa prontos os outros timeframes do ativo e os ativos da lista, para a troca ser instantânea
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
let crossIdx = null;
core.on('crosshair', p => { crossIdx = p && p.logical !== undefined && p.time !== undefined ? Math.round(p.logical) : null; updateLegend(); });
function fmtVal(v, prec) {
  if (typeof v !== 'number' || !isFinite(v)) return 'n/a';
  const a = Math.abs(v); if (a >= 1e6) return (v / 1e6).toFixed(2) + 'M'; if (a >= 1e4) return (v / 1e3).toFixed(1) + 'K';
  return v.toFixed(prec ?? (a < 0.01 ? 5 : a < 100 ? 3 : 2));
}
function updateLegend() {
  const v = core.view(); if (!v.length) return;
  const i = crossIdx !== null && crossIdx >= 0 && crossIdx < v.length ? crossIdx : v.length - 1;
  const b = v[i], pb = v[i - 1]; const prec = oanda.instInfo(core.instrument).prec ?? 5;
  const ch = pb ? b.close - pb.close : 0; const cls = ch >= 0 ? 'up' : 'down';
  const info = oanda.instInfo(core.instrument);
  let html = `<div class="row"><span class="title">${esc(oanda.short(core.instrument))} · ${esc(core.tf.label)} · ${oanda.feedName()}</span>
    <span class="k">A</span><span class="v ${cls}">${b.open.toFixed(prec)}</span><span class="k">M</span><span class="v ${cls}">${b.high.toFixed(prec)}</span>
    <span class="k">Mí</span><span class="v ${cls}">${b.low.toFixed(prec)}</span><span class="k">F</span><span class="v ${cls}">${b.close.toFixed(prec)}</span>
    <span class="v ${cls}">${ch >= 0 ? '+' : ''}${ch.toFixed(prec)} (${pb ? (ch / pb.close * 100).toFixed(2) : '0.00'}%)</span></div>`;
  if (info.display && info.display !== oanda.short(core.instrument)) html = html.replace(`· ${oanda.feedName()}</span>`, `· ${esc(info.display)}</span>`);
  const vals = scripts.valuesAt(i);
  for (const s of scripts.active) {
    const r = vals[s.id]; const name = r?.title || s.name;
    html += `<div class="ind ${s.visible ? '' : 'off'}" data-id="${s.id}"><span class="nm">${esc(name)}</span>`;
    if (r?.error) html += `<span class="err">erro: ${esc(r.error)}</span>`;
    else if (!r) html += `<span class="k">…</span>`;
    else html += r.vals.slice(0, 5).map(x => `<span class="v" style="color:${x.color}">${fmtVal(x.v, r.overlay ? prec : undefined)}</span>`).join('');
    html += `<span class="acts"><button data-a="eye" title="Mostrar/ocultar">${ICON.eye}</button><button data-a="set" title="Configurar">${ICON.gear}</button><button data-a="code" title="Código">${ICON.code}</button><button data-a="del" title="Remover">${ICON.trash}</button></span></div>`;
  }
  $('#legend').innerHTML = html;
}
$('#legend').addEventListener('click', e => {
  const row = e.target.closest('.ind'); if (!row) return; const id = row.dataset.id; const btn = e.target.closest('button');
  if (!btn) { document.querySelectorAll('.legend .ind').forEach(x => x.classList.toggle('sel', x === row && !x.classList.contains('sel'))); return; }
  const s = scripts.active.find(x => x.id === id); if (!s) return;
  const a = btn.dataset.a;
  if (a === 'eye') scripts.toggle(id);
  if (a === 'del') { scripts.remove(id); updateLegend(); }
  if (a === 'set') openInputs(s);
  if (a === 'code') openEditor({ name: s.name, source: s.source, activeId: s.id });
});

// ---------------- barra de ferramentas de desenho ----------------
function renderTools() {
  const el = $('#tools');
  el.innerHTML = TOOLS.map(t => t.sep ? '<hr>' : `<button class="tool" data-tool="${t.id}" title="${esc(t.name)}"><svg viewBox="0 0 24 24">${t.icon}</svg></button>`).join('') +
    `<hr><button class="tool ${drawings.magnet ? 'on' : ''}" id="t-magnet" title="Ímã (gruda no OHLC)">${ICON.magnet}</button>
     <button class="tool" id="t-hide" title="Ocultar desenhos">${ICON.hide}</button>
     <button class="tool" id="t-clear" title="Apagar todos os desenhos">${ICON.trash}</button>`;
  el.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => drawings.setTool(drawings.tool === b.dataset.tool ? 'cursor' : b.dataset.tool));
  $('#t-magnet').onclick = e => { drawings.magnet = !drawings.magnet; store.set('magnet', drawings.magnet); e.currentTarget.classList.toggle('on', drawings.magnet); ui.toast(drawings.magnet ? 'Ímã ligado' : 'Ímã desligado'); };
  $('#t-hide').onclick = e => { drawings.hidden = !drawings.hidden; e.currentTarget.classList.toggle('on', drawings.hidden); drawings.update(); };
  $('#t-clear').onclick = () => { if (drawings.items.length && confirm('Apagar todos os desenhos deste ativo?')) drawings.clearAll(); };
  ui.onTool(drawings.tool);
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

// ---------------- replay ----------------
function renderReplayBar() {
  const bar = $('#replay-bar'); $('#btn-replay').classList.toggle('on', replay.active);
  if (!replay.active) { bar.hidden = true; return; }
  const last = core.view().at(-1);
  bar.hidden = false;
  bar.innerHTML = `<button id="rp-pick" title="Escolher barra inicial"><svg viewBox="0 0 24 24"><path d="M12 3v18M5 8l7-5 7 5"/></svg>Início</button>
    <button id="rp-date" title="Ir para uma data">Data</button>
    <button id="rp-back" title="Voltar uma barra" ${replay.selecting ? 'disabled' : ''}>${ICON.back}</button>
    <button id="rp-play" title="Reproduzir/pausar" ${replay.selecting ? 'disabled' : ''}>${replay.playing ? ICON.pause : ICON.play}</button>
    <button id="rp-fwd" title="Avançar uma barra" ${replay.selecting ? 'disabled' : ''}>${ICON.fwd}</button>
    <select id="rp-speed" title="Velocidade">${[0.5, 1, 2, 3, 5, 10].map(s => `<option value="${s}" ${s === replay.speed ? 'selected' : ''}>${s}x</option>`).join('')}</select>
    <span class="rp-date">${replay.selecting ? 'escolha a barra…' : last ? esc(core.fmtTime(last.time)) : ''}</span>
    <span class="grow"></span>
    <button id="rp-exit" class="exit" title="Sair do replay">${ICON.x}Sair</button>`;
  $('#rp-pick').onclick = () => replay.startSelect();
  $('#rp-back').onclick = () => { replay.pause(); replay.step(-1); };
  $('#rp-fwd').onclick = () => { replay.pause(); replay.step(1); };
  $('#rp-play').onclick = () => replay.playing ? replay.pause() : replay.play();
  $('#rp-speed').onchange = e => replay.setSpeed(+e.target.value);
  $('#rp-exit').onclick = () => replay.exit();
  $('#rp-date').onclick = () => {
    const sh = openModal(head('Replay a partir da data') + `<div class="sh-body"><label class="fld"><span>Data</span><input class="inp" type="date" id="rp-d"></label>
      <p class="hint">Barras carregadas desde ${esc(core.fmtTime(core.bars[0].time))}. Role o gráfico para a esquerda para carregar mais histórico.</p>
      <div class="btns"><button class="btn" id="rp-go">Começar</button></div></div>`);
    sh.querySelector('#rp-go').onclick = () => { const d = sh.querySelector('#rp-d').value; if (d) { replay.jumpToTime(Date.parse(d + 'T00:00:00Z') / 1000); closeModal(); } };
  };
}
$('#btn-replay').onclick = () => replay.active ? replay.exit() : replay.startSelect();
$('#chart').addEventListener('pointerdown', e => {
  if (!replay.selecting) return;
  const r = e.currentTarget.getBoundingClientRect(); e.stopPropagation();
  replay.pickAt(e.clientX - r.left);
}, { capture: true });

// ---------------- busca de ativo ----------------
$('#btn-symbol').onclick = async () => {
  const sh = openModal(head('Buscar ativo') + `<div class="sh-body"><input class="search" id="q" placeholder="EURUSD, ouro, US30…" autocomplete="off">
    <div class="tabs" id="cats"></div><div class="list" id="res"><p class="hint">Carregando…</p></div></div>`);
  let list = []; try { list = await oanda.instruments(); } catch (e) { sh.querySelector('#res').innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
  const cats = ['Todos', ...new Set(list.map(oanda.category))]; let cat = 'Todos';
  const draw = () => {
    const q = sh.querySelector('#q').value.trim().toUpperCase().replace(/[/_ ]/g, '');
    const words = { OURO: 'XAU', PRATA: 'XAG', PETROLEO: 'WTICO', DOW: 'US30', NASDAQ: 'NAS100', SP500: 'SPX500', DAX: 'DE30' };
    const qq = words[q] || q;
    const rows = list.filter(i => (cat === 'Todos' || oanda.category(i) === cat) && (!qq || i.name.replace('_', '').includes(qq) || i.display.toUpperCase().replace(/[/ ]/g, '').includes(qq))).slice(0, 200);
    sh.querySelector('#res').innerHTML = rows.map(i => `<div class="it" data-n="${i.name}"><div><div class="a">${esc(oanda.short(i.name))}</div><div class="b">${esc(i.display)} · ${oanda.category(i)}</div></div>
      <div class="r"><button data-w="${i.name}">${state.watch.includes(i.name) ? '★' : '☆'}</button></div></div>`).join('') || '<p class="hint">Nada encontrado.</p>';
  };
  sh.querySelector('#cats').innerHTML = cats.map(c => `<button class="${c === cat ? 'on' : ''}" data-c="${c}">${c}</button>`).join('');
  sh.querySelector('#cats').onclick = e => { const c = e.target.dataset.c; if (!c) return; cat = c; sh.querySelectorAll('#cats button').forEach(b => b.classList.toggle('on', b.dataset.c === c)); draw(); };
  sh.querySelector('#q').oninput = draw;
  sh.querySelector('#res').onclick = e => {
    const w = e.target.closest('[data-w]');
    if (w) { toggleWatch(w.dataset.w); w.textContent = state.watch.includes(w.dataset.w) ? '★' : '☆'; return; }
    const it = e.target.closest('.it'); if (it) { closeModal(); loadSymbol(it.dataset.n); }
  };
  draw(); setTimeout(() => sh.querySelector('#q').focus(), 50);
};

// ---------------- timeframe ----------------
$('#btn-tf').onclick = () => {
  const sh = openModal(head('Timeframe') + `<div class="sh-body"><div class="grid-tf">${oanda.TFS.map(t => `<button data-tf="${t.id}" class="${t.id === state.tf ? 'on' : ''}">${t.label}</button>`).join('')}</div>
    <p class="hint" style="margin-top:12px">As barras diárias fecham às 17h de Nova York.</p></div>`);
  sh.querySelector('.grid-tf').onclick = e => { const t = e.target.dataset.tf; if (t) { closeModal(); loadSymbol(state.instrument, t); } };
};
$('#btn-ctype').onclick = () => {
  const sh = openModal(head('Tipo de gráfico') + `<div class="sh-body list">${CTYPES.map(([id, n]) => `<div class="it" data-t="${id}"><span class="a">${n}</span>${core.ctype === id ? '<span class="ok">✓</span>' : ''}</div>`).join('')}</div>`);
  sh.querySelector('.list').onclick = e => { const it = e.target.closest('.it'); if (it) { core.setChartType(it.dataset.t); closeModal(); } };
};

// ---------------- indicadores ----------------
$('#btn-ind').onclick = openIndicators;
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

// ---------------- lista de ativos (watchlist) ----------------
function toggleWatch(n) { state.watch = state.watch.includes(n) ? state.watch.filter(x => x !== n) : [...state.watch, n]; store.set('watch', state.watch); renderWatch(); }
$('#btn-watch').onclick = () => { const w = $('#watch'); w.hidden = !w.hidden; $('#btn-watch').classList.toggle('on', !w.hidden); store.set('watchOpen', !w.hidden); if (!w.hidden) pollWatch(); setTimeout(() => core.chart.timeScale().applyOptions({}), 0); };
function renderWatch() {
  const w = $('#watch');
  const rows = state.watch.map(raw => {
    const n = oanda.resolveTicker(raw); const p = state.prices[n]; const pc = state.prevClose[n]; const prec = oanda.instInfo(n).prec ?? 5;
    const ch = p && pc ? (p.mid - pc) / pc * 100 : null;
    return `<div class="wrow ${n === state.instrument ? 'cur' : ''}" data-n="${n}"><span class="s">${oanda.short(n)}</span><span>${p ? p.mid.toFixed(prec) : '–'}</span><span class="ch ${ch === null ? '' : ch >= 0 ? 'up' : 'down'}">${ch === null ? '' : (ch >= 0 ? '+' : '') + ch.toFixed(2) + '%'}</span></div>`;
  }).join('');
  w.innerHTML = `<h3>Lista de ativos <button class="tb-btn" id="w-close">${ICON.x}</button></h3><div class="wl">${rows}</div>`;
  w.querySelector('#w-close').onclick = () => $('#btn-watch').click();
  w.querySelector('.wl').onclick = e => { const r = e.target.closest('.wrow'); if (r) { loadSymbol(r.dataset.n); if (innerWidth < 700) $('#btn-watch').click(); } };
}
async function pollWatch() {
  if ($('#watch').hidden || !state.watch.length) return;
  try {
    const names = state.watch.map(oanda.resolveTicker);
    const ps = await oanda.pricing(names); ps.forEach(p => { state.prices[p.instrument] = p; if (p.sessionClose) state.prevClose[p.instrument] = p.sessionClose; });
    const missing = names.filter(n => state.prevClose[n] === undefined);
    await Promise.all(missing.slice(0, 6).map(async n => { try { const d = await oanda.candles(n, 'D', { count: 2 }); state.prevClose[n] = d.length > 1 ? d[d.length - 2].close : d[0]?.open; } catch { state.prevClose[n] = null; } }));
    renderWatch();
  } catch { /* offline */ }
}
setInterval(pollWatch, 3000);

// ---------------- configurações ----------------
$('#btn-settings').onclick = openSettings;
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
  sh.querySelector('#s-theme').onchange = e => { core.applyTheme(e.target.value); document.documentElement.dataset.theme = e.target.value; drawings.update(); };
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
renderTools();
if (store.get('watchOpen', false) && matchMedia('(min-width: 900px)').matches) { $('#watch').hidden = false; $('#btn-watch').classList.add('on'); }
renderWatch(); pollWatch();
if (!oanda.hasOanda()) ui.banner('Modo demonstração — conecte sua conta cTrader para preços reais', 'Conectar', () => { ui.banner(null); openSettings(); });
loadSymbol(state.instrument, state.tf);
document.addEventListener('visibilitychange', () => { if (document.hidden) core.stopLive(); else if (!replay.active) core.startLive(); });
// botão voltar do Android: fecha janelas antes de sair do app
try {
  CapApp.addListener('backButton', () => {
    if (!$('#modal').hidden) closeModal();
    else if (drawings.sel) drawings.select(null);
    else if (drawings.tool !== 'cursor') drawings.setTool('cursor');
    else if (!$('#watch').hidden) $('#btn-watch').click();
    else if (replay.active) replay.exit();
    else CapApp.minimizeApp();
  });
} catch { /* navegador */ }
// link vindo do Diário de Trades: graficosfx://open?symbol=EURUSD&date=2026-11-12&result=WIN&r=2
async function openFromLink(url) {
  try {
    const u = new URL(url); const q = u.searchParams;
    const sym = q.get('symbol'); if (!sym) return;
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
    if (keys.includes('favTfs')) state.favTfs = store.get('favTfs', state.favTfs);
    ui.toast('Sincronizado com o outro aparelho');
  },
});
const doSync = () => { if (sync.enabled() && !document.hidden) sync.sync().catch(() => { }); };
setTimeout(doSync, 1500); setInterval(doSync, 120000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) doSync(); });
window.__app = { core, drawings, scripts, replay, loadSymbol, openFromLink };
