import test from 'node:test';
import assert from 'node:assert/strict';
import { volumePoint } from '../src/chart.js';
import { category, candles, instruments } from '../src/oanda.js';
import { symIcon } from '../src/icons.js';
import { Replay } from '../src/replay.js';

test('volume usa os dados da barra e acompanha a direção do candle', () => {
  const bar = { time: 10, open: 1, close: 2, volume: 1500 };
  assert.deepEqual(volumePoint(bar), { time: 10, value: 1500, color: 'rgba(8,153,129,0.48)' });
  assert.equal(volumePoint({ ...bar, close: 0.5 }).color, 'rgba(242,54,69,0.48)');
  assert.equal(volumePoint({ ...bar, volume: 0 }).value, 0);
  for (const volume of [undefined, null, -1, NaN]) {
    assert.deepEqual(volumePoint({ ...bar, volume }), { time: 10 });
  }
});

test('instrumentos e barras de demonstração preservam categorias e volume', async () => {
  const list = await instruments();
  assert.equal(category(list.find(i => i.name === 'EUR_USD')), 'Forex');
  assert.equal(category(list.find(i => i.name === 'XAU_USD')), 'Metais');
  assert.equal(category(list.find(i => i.name === 'US30_USD')), 'Índices');
  const bars = await candles('EUR_USD', 'D', { count: 20 });
  assert.equal(bars.length, 20);
  assert.ok(bars.every(b => Number.isFinite(b.volume) && b.volume >= 0));
  assert.ok(bars.every(b => b.high >= Math.max(b.open, b.close) && b.low <= Math.min(b.open, b.close)));
});

test('ícones de moedas são locais e não incorporam marcação do símbolo', () => {
  assert.match(symIcon('EUR_USD'), /<svg/);
  assert.doesNotMatch(symIcon('<script>alert(1)</script>'), /<script>/);
});

test('replay limita a janela histórica e restaura o tempo real', () => {
  const bars = Array.from({ length: 40 }, (_, time) => ({ time, ot: time, close: time, volume: time }));
  const core = {
    bars, viewLen: 0, tf: { sec: 1 }, main: { update() {} },
    view() { return this.viewLen ? this.bars.slice(0, this.viewLen) : this.bars; },
    setViewLen(n) { this.viewLen = n >= this.bars.length ? 0 : n; },
    dataPoint(_bars, i) { return this.bars[i]; },
    stopLive() { this.stopped = true; }, startLive() { this.started = true; }, showLast() {},
  };
  const ui = { onReplay() {}, onReplayStep() {}, banner() {}, toast() {} };
  const replay = new Replay(core, ui);
  replay.startSelect();
  assert.equal(core.stopped, true);
  replay.jumpToTime(25);
  assert.equal(core.view().length, 26);
  assert.equal(core.replayCutReal, 26);
  replay.step();
  assert.equal(core.view().length, 27);
  assert.equal(core.replayCutReal, 27);
  replay.exit();
  assert.equal(core.view().length, 40);
  assert.equal(core.replayCutReal, null);
  assert.equal(core.started, true);
});
