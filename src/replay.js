// Replay de barras: escolhe um ponto no passado e avança barra por barra.
export class Replay {
  constructor(core, ui) {
    this.core = core; this.ui = ui; this.active = false; this.selecting = false; this.playing = false; this.speed = 1; this.timer = null;
  }
  get pos() { return this.core.viewLen || this.core.bars.length; }
  startSelect() {
    if (this.playing) this.pause();
    this.selecting = true; this.active = true; this.core.stopLive();
    this.ui.onReplay();
    this.ui.banner('Toque no gráfico para escolher onde o replay começa', 'Cancelar', () => this.exit());
  }
  pickAt(x) {
    const hit = this.core.barAtX(x); if (!hit) return false;
    const n = Math.max(20, hit.i + 1);
    this.selecting = false; this.ui.banner(null);
    this.core.setViewLen(n, { full: true }); this.sync();
    const ts = this.core.chart.timeScale(); const r = ts.getVisibleLogicalRange();
    if (r) { const w = r.to - r.from; ts.setVisibleLogicalRange({ from: n - w * 0.75, to: n + w * 0.25 }); }
    this.ui.onReplay(); return true;
  }
  jumpToTime(sec) {
    const i = this.core.bars.findIndex(b => b.time >= sec);
    if (i < 0) return;
    this.selecting = false; this.ui.banner(null);
    this.core.setViewLen(Math.max(20, i + 1), { full: true }); this.sync(); this.core.showLast(100); this.ui.onReplay();
  }
  step(dir = 1) {
    const c = this.core; if (this.selecting) return;
    let n = this.pos + dir;
    if (n < 2) return;
    if (n > c.bars.length) { this.pause(); this.ui.toast('Fim do histórico — voltando ao ao vivo'); this.exit(); return; }
    if (dir > 0) { c.setViewLen(n); c.main.update(c.dataPoint(c.bars, n - 1)); }
    else c.setViewLen(n, { full: true });
    this.sync();
  }
  sync() {
    const c = this.core; const last = c.view().at(-1);
    c.replayCutReal = c.viewLen && last ? last.ot + c.tf.sec : null;
    this.ui.onReplayStep();
  }
  play() {
    if (this.selecting) return;
    this.playing = true; clearInterval(this.timer);
    this.timer = setInterval(() => this.step(1), Math.round(1000 / this.speed)); this.ui.onReplay();
  }
  pause() { this.playing = false; clearInterval(this.timer); this.ui.onReplay(); }
  setSpeed(s) { this.speed = s; if (this.playing) this.play(); }
  exit() {
    this.pause(); this.active = false; this.selecting = false; this.ui.banner(null);
    const c = this.core; c.replayCutReal = null; c.setViewLen(c.bars.length, { full: true }); c.startLive();
    this.ui.onReplay(); this.ui.onReplayStep();
  }
}
