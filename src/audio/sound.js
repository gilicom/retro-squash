/**
 * @module audio/sound
 * Procedural sound effects with the Web Audio API. No audio files are
 * needed: racket pops, wall thuds and floor bounces are short filtered noise
 * bursts plus a sine thump whose pitch and volume follow the ball speed.
 *
 * The AudioContext is created lazily on the first user gesture (browsers
 * block audio before that).
 */
export class Sound {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.master = null;
  }

  /** Create / resume the context. Call from a user gesture handler. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.8 : 0;
  }

  _noise(duration, freq, q, gain) {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    src.connect(filter).connect(g).connect(this.master);
    src.start();
  }

  _tone(freq, duration, gain, type = 'sine', slide = 0.6) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), ctx.currentTime + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    o.connect(g).connect(this.master);
    o.start();
    o.stop(ctx.currentTime + duration);
  }

  _ok() {
    return this.enabled && this.ctx && this.ctx.state === 'running';
  }

  /** Racket contact. Louder and brighter with speed. */
  racket(speed) {
    if (!this._ok()) return;
    const v = Math.min(1, speed / 35);
    this._noise(0.06, 1800 + v * 1500, 1.2, 0.5 + v * 0.5);
    this._tone(320 + v * 200, 0.08, 0.35, 'triangle', 0.5);
  }

  /** Ball hitting a wall. */
  wall(speed) {
    if (!this._ok()) return;
    const v = Math.min(1, speed / 30);
    this._noise(0.08, 500 + v * 400, 0.8, 0.35 + v * 0.4);
    this._tone(140 + v * 60, 0.12, 0.3, 'sine', 0.5);
  }

  /** Ball bouncing on the floor. */
  floor(speed) {
    if (!this._ok()) return;
    const v = Math.min(1, speed / 20);
    this._noise(0.05, 900, 1, 0.15 + v * 0.25);
    this._tone(220, 0.07, 0.15 + v * 0.1, 'sine', 0.6);
  }

  /** Rally won by the human. */
  pointWon() {
    if (!this._ok()) return;
    this._tone(660, 0.12, 0.2, 'square', 1);
    setTimeout(() => this._ok() && this._tone(880, 0.18, 0.2, 'square', 1), 110);
  }

  /** Rally lost by the human. */
  pointLost() {
    if (!this._ok()) return;
    this._tone(300, 0.25, 0.22, 'sawtooth', 0.6);
  }

  /** Game / match won fanfare. */
  fanfare() {
    if (!this._ok()) return;
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this._ok() && this._tone(f, 0.25, 0.22, 'square', 1), i * 130));
  }

  /** UI click. */
  click() {
    if (!this._ok()) return;
    this._tone(900, 0.05, 0.12, 'square', 0.9);
  }
}
