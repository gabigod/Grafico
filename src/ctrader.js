// Cliente da cTrader Open API (JSON sobre WebSocket, porta 5036).
import { store } from './store.js';

const PT = {
  HEARTBEAT: 51, APP_AUTH: 2100, APP_AUTH_RES: 2101, ACC_AUTH: 2102, ACC_AUTH_RES: 2103,
  SYMBOLS: 2114, SYMBOLS_RES: 2115, SYMBOL_BY_ID: 2116, SYMBOL_BY_ID_RES: 2117,
  SUB_SPOTS: 2127, SUB_SPOTS_RES: 2128, SPOT: 2131, SUB_LIVE_BAR: 2135, UNSUB_LIVE_BAR: 2136,
  TRENDBARS: 2137, TRENDBARS_RES: 2138, ERROR: 2142, TOKEN_INVALID: 2147, DISCONNECT: 2148,
  ACCOUNTS: 2149, ACCOUNTS_RES: 2150, REFRESH: 2173, REFRESH_RES: 2174, SUB_LIVE_BAR_RES: 2165,
};
export const PERIOD = { M1: 1, M5: 5, M15: 7, M30: 8, H1: 9, H4: 10, D: 12, W: 13, M: 14 };
const PERIOD_MS = { M1: 6e4, M5: 3e5, M15: 9e5, M30: 18e5, H1: 36e5, H4: 144e5, D: 864e5, W: 6048e5, M: 2592e6 };
// janela máxima por pedido (a API limita a distância entre from e to)
const WINDOW_MS = { M1: 7 * 864e5, M5: 30 * 864e5, M15: 60 * 864e5, M30: 120 * 864e5, H1: 180 * 864e5, H4: 365 * 864e5, D: 5 * 365 * 864e5, W: 20 * 365 * 864e5, M: 40 * 365 * 864e5 };
const HOST = { demo: 'wss://demo.ctraderapi.com:5036', live: 'wss://live.ctraderapi.com:5036' };

export function ctCfg() { return store.get('ctrader', { clientId: '', clientSecret: '', accessToken: '', refreshToken: '', accountId: '', isLive: false }); }
export function ctReady() { const c = ctCfg(); return !!(c.clientId && c.clientSecret && c.accessToken && c.accountId); }

const ISO = new Set('USD EUR GBP JPY AUD NZD CAD CHF SEK NOK DKK SGD HKD MXN ZAR TRY PLN HUF CZK CNH ILS THB RUB BRL'.split(' '));
const normTime = ot => Math.floor((ot + 12 * 3600) / 86400) * 86400;

class CTrader {
  constructor() {
    this.ws = null; this.pending = new Map(); this.seq = 0; this.ready = null; this.symbols = null; this.byName = new Map(); this.byId = new Map();
    this.spots = new Map(); this.subscribed = new Set(); this.liveBars = new Map(); this.liveSub = null; this.hb = null; this.lastHist = 0;
  }
  log(...a) { if (window.__ctdebug) console.log('[ct]', ...a); }

  // ---------- conexão ----------
  open(host) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(host); let opened = false;
      ws.onopen = () => { opened = true; resolve(ws); };
      ws.onerror = () => { if (!opened) reject(new Error('Não foi possível conectar à cTrader.')); };
      ws.onclose = () => { this.onClose(ws); if (!opened) reject(new Error('Conexão com a cTrader recusada.')); };
      ws.onmessage = ev => this.onMessage(ev.data);
    });
  }
  onClose(ws) {
    if (ws !== this.ws) return;
    clearInterval(this.hb); this.ws = null; this.ready = null; this.subscribed.clear(); this.liveSub = null;
    for (const [, p] of this.pending) p.reject(new Error('Conexão com a cTrader caiu.'));
    this.pending.clear();
  }
  onMessage(raw) {
    let m; try { m = JSON.parse(raw); } catch { return; }
    const pt = m.payloadType; const pl = m.payload || {};
    if (pt === PT.HEARTBEAT) return;
    if (pt === PT.SPOT) return this.onSpot(pl);
    if (pt === PT.TOKEN_INVALID || pt === PT.DISCONNECT) { this.log('desconectado', pl); try { this.ws?.close(); } catch { /* */ } return; }
    const p = m.clientMsgId && this.pending.get(m.clientMsgId);
    if (!p) return;
    this.pending.delete(m.clientMsgId); clearTimeout(p.timer);
    if (pt === PT.ERROR || pt === 50) { const e = new Error(errText(pl)); e.code = pl.errorCode; p.reject(e); }
    else p.resolve(pl);
  }
  send(payloadType, payload = {}, timeout = 20000) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== 1) return reject(new Error('Sem conexão com a cTrader.'));
      const id = 'm' + (++this.seq);
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('A cTrader não respondeu.')); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ clientMsgId: id, payloadType, payload }));
    });
  }
  async login({ accountsOnly } = {}) {
    const c = ctCfg();
    const ws = await this.open(store.get('ct:hostOverride', null) || (c.isLive ? HOST.live : HOST.demo));
    this.ws = ws;
    this.hb = setInterval(() => { try { ws.send(JSON.stringify({ payloadType: PT.HEARTBEAT, payload: {} })); } catch { /* */ } }, 10000);
    await this.send(PT.APP_AUTH, { clientId: c.clientId, clientSecret: c.clientSecret });
    let accounts;
    try { accounts = await this.send(PT.ACCOUNTS, { accessToken: c.accessToken }); }
    catch (e) { if (!c.refreshToken) throw e; await this.refresh(); accounts = await this.send(PT.ACCOUNTS, { accessToken: ctCfg().accessToken }); }
    const list = (accounts.ctidTraderAccount || []).map(a => ({ id: String(a.ctidTraderAccountId), isLive: !!a.isLive, login: a.traderLogin, broker: a.brokerTitleShort || '' }));
    if (accountsOnly) return list;
    const acc = list.find(a => a.id === String(c.accountId));
    if (!acc) throw new Error('A conta escolhida não aparece para esse token.');
    if (acc.isLive !== !!c.isLive) { store.set('ctrader', { ...c, isLive: acc.isLive }); try { ws.close(); } catch { /* */ } return this.login(); }
    try { await this.send(PT.ACC_AUTH, { ctidTraderAccountId: +c.accountId, accessToken: ctCfg().accessToken }); }
    catch (e) {
      if (!c.refreshToken || !/TOKEN|AUTH/i.test(e.code || '')) throw e;
      await this.refresh(); await this.send(PT.ACC_AUTH, { ctidTraderAccountId: +c.accountId, accessToken: ctCfg().accessToken });
    }
    return list;
  }
  async refresh() {
    const c = ctCfg();
    const r = await this.send(PT.REFRESH, { refreshToken: c.refreshToken });
    store.set('ctrader', { ...ctCfg(), accessToken: r.accessToken, refreshToken: r.refreshToken });
  }
  ensure() {
    if (this.ws && this.ws.readyState === 1 && this.ready) return this.ready;
    if (!this.ready) this.ready = this.login().catch(e => { this.ready = null; try { this.ws?.close(); } catch { /* */ } throw e; });
    return this.ready;
  }
  close() { try { this.ws?.close(); } catch { /* */ } this.ws = null; this.ready = null; }
  get acc() { return +ctCfg().accountId; }

  // ---------- ativos ----------
  async loadSymbols() {
    if (this.symbols) return this.symbols;
    await this.ensure();
    const r = await this.send(PT.SYMBOLS, { ctidTraderAccountId: this.acc });
    const light = (r.symbol || []).filter(s => s.enabled !== false && s.symbolName);
    const details = new Map();
    for (let i = 0; i < light.length; i += 100) {
      const ids = light.slice(i, i + 100).map(s => +s.symbolId);
      try { const d = await this.send(PT.SYMBOL_BY_ID, { ctidTraderAccountId: this.acc, symbolId: ids }); (d.symbol || []).forEach(s => details.set(String(s.symbolId), s)); } catch { /* */ }
    }
    this.symbols = light.map(s => {
      const d = details.get(String(s.symbolId)) || {};
      const name = s.symbolName.trim(); const k = key(name);
      const fx = /^[A-Z]{6}$/.test(k) && ISO.has(k.slice(0, 3)) && ISO.has(k.slice(3));
      return { id: +s.symbolId, name, display: s.description || name, type: fx ? 'CURRENCY' : 'CFD', prec: d.digits ?? 5, pip: -(d.pipPosition ?? 4), sort: s.sortingNumber ?? 1e9 };
    }).sort((a, b) => a.name.localeCompare(b.name));
    this.byName = new Map(this.symbols.map(s => [s.name, s])); this.byId = new Map(this.symbols.map(s => [s.id, s]));
    store.set('ct:symbols', this.symbols.map(({ id, name, display, type, prec, pip }) => ({ id, name, display, type, prec, pip })));
    return this.symbols;
  }
  cachedSymbols() { return this.symbols || store.get('ct:symbols', null); }
  // usa a lista salva na hora e atualiza em segundo plano (evita ~1 s a cada abertura)
  async needSymbols() {
    if (this.symbols) return;
    const c = store.get('ct:symbols', null);
    if (c?.length) {
      this.symbols = c; this.byName = new Map(c.map(s => [s.name, s])); this.byId = new Map(c.map(s => [s.id, s]));
      if (!this.symRefresh) this.symRefresh = setTimeout(() => { const keep = this.symbols; this.symbols = null; this.loadSymbols().catch(() => { this.symbols = keep; }); }, 8000);
      return;
    }
    await this.loadSymbols();
  }
  sym(name) { const s = this.byName.get(name) || (this.cachedSymbols() || []).find(x => x.name === name); return s; }

  // ---------- barras ----------
  async histGap() { const wait = this.lastHist + 230 - Date.now(); if (wait > 0) await new Promise(r => setTimeout(r, wait)); this.lastHist = Date.now(); }
  async candles(name, gran, { count = 500, from, to } = {}) {
    await this.ensure(); await this.needSymbols();
    const s = this.sym(name); if (!s) throw new Error('Ativo não encontrado na cTrader: ' + name);
    const period = PERIOD[gran]; const win = WINDOW_MS[gran]; const pms = PERIOD_MS[gran];
    let end = to ? to * 1000 : Date.now() + pms; const start = from ? from * 1000 : 0;
    const out = new Map(); let empty = 0;
    for (let k = 0; k < 12 && out.size < count && end > start; k++) {
      const begin = Math.max(start, end - win);
      await this.histGap();
      const r = await this.send(PT.TRENDBARS, { ctidTraderAccountId: this.acc, symbolId: s.id, period, fromTimestamp: Math.floor(begin), toTimestamp: Math.floor(end), count: Math.min(count, 5000) });
      const bars = (r.trendbar || []).map(b => this.bar(b, s, gran));
      if (!bars.length) { if (++empty >= 2) break; } else empty = 0;
      bars.forEach(b => out.set(b.ot, b));
      const oldest = bars.length ? Math.min(...bars.map(b => b.ot)) * 1000 : begin;
      end = Math.min(begin, oldest) - 1;
    }
    let list = [...out.values()].sort((a, b) => a.ot - b.ot);
    if (to) list = list.filter(b => b.ot < to);
    list = list.slice(-count);
    const nowS = Date.now() / 1000;
    for (const b of list) b.complete = b.ot + pms / 1000 <= nowS;
    // dedupe por horário normalizado (barras D/S/M)
    const seen = new Map(); for (const b of list) seen.set(b.time, b);
    return [...seen.values()];
  }
  bar(b, s, gran) {
    const f = v => +(v / 100000).toFixed(s.prec);
    const low = +b.low; const ot = (+b.utcTimestampInMinutes) * 60;
    return { ot, time: ['D', 'W', 'M'].includes(gran) ? normTime(ot) : ot, open: f(low + +(b.deltaOpen || 0)), high: f(low + +(b.deltaHigh || 0)), low: f(low), close: f(low + +(b.deltaClose || 0)), volume: +b.volume || 0, complete: true };
  }

  // ---------- preços ao vivo ----------
  onSpot(pl) {
    const id = +pl.symbolId; const s = this.byId.get(id); if (!s) return;
    const cur = this.spots.get(id) || {};
    const r = v => +(v / 100000).toFixed(s.prec);
    const bid = pl.bid !== undefined ? r(+pl.bid) : cur.bid; const ask = pl.ask !== undefined ? r(+pl.ask) : cur.ask;
    const spot = { bid, ask, time: pl.timestamp ? +pl.timestamp / 1000 : Date.now() / 1000, sessionClose: pl.sessionClose !== undefined ? +pl.sessionClose / 100000 : cur.sessionClose };
    this.spots.set(id, spot);
    if (pl.trendbar?.length && this.liveSub && this.liveSub.id === id) {
      const tb = pl.trendbar.find(t => !t.period || +t.period === this.liveSub.period) || pl.trendbar.at(-1);
      this.liveBars.set(id, this.bar(tb, s, this.liveSub.gran));
    }
  }
  async subscribe(names) {
    await this.ensure(); await this.needSymbols();
    const ids = names.map(n => this.sym(n)?.id).filter(id => id && !this.subscribed.has(id));
    if (!ids.length) return;
    ids.forEach(id => this.subscribed.add(id));
    try { await this.send(PT.SUB_SPOTS, { ctidTraderAccountId: this.acc, symbolId: ids, subscribeToSpotTimestamp: true }); }
    catch (e) { if (!/ALREADY/i.test(e.code || '')) { ids.forEach(id => this.subscribed.delete(id)); throw e; } }
  }
  async liveBar(name, gran) {
    const s = this.sym(name); if (!s) return;
    const period = PERIOD[gran];
    if (this.liveSub && this.liveSub.id === s.id && this.liveSub.period === period) return;
    if (this.liveSub) { try { await this.send(PT.UNSUB_LIVE_BAR, { ctidTraderAccountId: this.acc, symbolId: this.liveSub.id, period: this.liveSub.period }); } catch { /* */ } }
    this.liveBars.delete(s.id);
    this.liveSub = { id: s.id, period, gran };
    try { await this.send(PT.SUB_LIVE_BAR, { ctidTraderAccountId: this.acc, symbolId: s.id, period }); } catch (e) { this.liveSub = null; if (!/ALREADY/i.test(e.code || '')) throw e; }
  }
  async pricing(names, live) {
    await this.subscribe(names);
    if (live) await this.liveBar(live.name, live.gran);
    return names.map(n => {
      const s = this.sym(n); const sp = s && this.spots.get(s.id); if (!sp || !isFinite(sp.bid)) return null;
      return { instrument: n, time: sp.time, bid: sp.bid, ask: sp.ask, mid: sp.bid, sessionClose: sp.sessionClose, liveBar: live && live.name === n ? this.liveBars.get(s.id) : undefined, tradeable: true };
    }).filter(Boolean);
  }
}

export const key = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
function errText(pl) {
  const c = pl.errorCode || '';
  if (/CH_CLIENT_AUTH_FAILURE/.test(c)) return 'Client ID ou Client Secret da cTrader incorretos (ou app ainda não aprovado).';
  if (/ACCESS_TOKEN_INVALID|TOKEN_EXPIRED/.test(c)) return 'Token da cTrader inválido ou vencido. Gere outro no Playground.';
  if (/BLOCKED_PAYLOAD_TYPE/.test(c)) return 'Muitos pedidos seguidos à cTrader; tente de novo em alguns segundos.';
  return (pl.description || c || 'Erro da cTrader');
}

export const ct = new CTrader();
