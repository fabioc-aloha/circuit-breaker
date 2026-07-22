// CIRCUIT BREAKER — procedural SFX (Web Audio API)
import type { AudioManager } from './audio';

function envGain(ctx: AudioContext, dest: AudioNode, attack: number, decay: number, peak = 1): GainNode {
  const g = ctx.createGain();
  const now = ctx.currentTime;
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), now + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);
  g.connect(dest);
  return g;
}

function tone(
  ctx: AudioContext,
  dest: AudioNode,
  type: OscillatorType,
  freq: number,
  attack: number,
  decay: number,
  peak = 0.5,
  freqEnd?: number,
): void {
  const osc = ctx.createOscillator();
  osc.type = type;
  const now = ctx.currentTime;
  osc.frequency.setValueAtTime(freq, now);
  if (freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), now + attack + decay);
  const g = envGain(ctx, dest, attack, decay, peak);
  osc.connect(g);
  osc.start(now);
  osc.stop(now + attack + decay + 0.05);
}

function noiseBurst(
  ctx: AudioContext,
  dest: AudioNode,
  decay: number,
  peak = 0.4,
  filterFreq = 6000,
  filterType: BiquadFilterType = 'bandpass',
  q = 0.9,
): void {
  const bufSize = Math.floor(ctx.sampleRate * (decay + 0.05));
  const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = filterFreq;
  filter.Q.value = q;
  const g = envGain(ctx, dest, 0.005, decay, peak);
  src.connect(filter);
  filter.connect(g);
  src.start();
  src.stop(ctx.currentTime + decay + 0.1);
}

export class SFX {
  constructor(private audio: AudioManager) {}

  private out(): { ctx: AudioContext; dest: AudioNode; verb: AudioNode | null } | null {
    const ctx = this.audio.ctx;
    const dest = this.audio.sfxBus;
    if (!ctx || !dest) return null;
    return { ctx, dest, verb: this.audio.reverbSend };
  }

  move(): void {
    const o = this.out(); if (!o) return;
    tone(o.ctx, o.dest, 'square', 320, 0.005, 0.04, 0.1);
    tone(o.ctx, o.dest, 'triangle', 640, 0.005, 0.03, 0.06);
  }

  rotate(): void {
    const o = this.out(); if (!o) return;
    tone(o.ctx, o.dest, 'triangle', 520, 0.004, 0.06, 0.15, 780);
    tone(o.ctx, o.dest, 'square', 1040, 0.003, 0.03, 0.05, 1300);
  }

  softDropTick(): void {
    const o = this.out(); if (!o) return;
    tone(o.ctx, o.dest, 'square', 180, 0.003, 0.03, 0.05);
  }

  hardDrop(): void {
    const o = this.out(); if (!o) return;
    // Deep boom
    tone(o.ctx, o.dest, 'sine', 90, 0.005, 0.20, 0.55, 45);
    tone(o.ctx, o.dest, 'sawtooth', 220, 0.005, 0.10, 0.32, 60);
    // Electric zap
    noiseBurst(o.ctx, o.dest, 0.14, 0.24, 4500, 'bandpass', 3);
    // High spark
    tone(o.ctx, o.dest, 'square', 2200, 0.002, 0.06, 0.16, 400);
    if (o.verb) noiseBurst(o.ctx, o.verb, 0.2, 0.15, 3500, 'bandpass', 2);
  }

  lock(): void {
    const o = this.out(); if (!o) return;
    tone(o.ctx, o.dest, 'triangle', 260, 0.003, 0.06, 0.14);
    tone(o.ctx, o.dest, 'square', 520, 0.002, 0.04, 0.07);
  }

  lineClear(rows: number): void {
    const o = this.out(); if (!o) return;
    const base = 440 + rows * 120;
    // Arcing zap sweep
    tone(o.ctx, o.dest, 'sawtooth', base, 0.005, 0.22, 0.32, base * 4);
    tone(o.ctx, o.dest, 'square', base * 1.5, 0.003, 0.18, 0.16, base * 3);
    noiseBurst(o.ctx, o.dest, 0.18, 0.18, 5500, 'bandpass', 2);
    // Shimmer to reverb
    if (o.verb) {
      tone(o.ctx, o.verb, 'sine', base * 3, 0.005, 0.4, 0.12, base * 5);
    }
    // Bright ping
    const notes = [880, 1108, 1319][rows - 1] ? [660, 880, 1108, 1319].slice(0, rows) : [880];
    notes.forEach((n, i) => {
      const t = o.ctx.currentTime + i * 0.03;
      const osc = o.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = n;
      const g = o.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      osc.connect(g);
      g.connect(o.dest);
      if (o.verb) g.connect(o.verb);
      osc.start(t);
      osc.stop(t + 0.25);
    });
  }

  tetrisBoom(): void {
    const o = this.out(); if (!o) return;
    // Sub bass drop
    tone(o.ctx, o.dest, 'sine', 110, 0.005, 0.45, 0.6, 35);
    tone(o.ctx, o.dest, 'sawtooth', 90, 0.005, 0.4, 0.42, 40);
    // Big electric BOOM
    tone(o.ctx, o.dest, 'square', 240, 0.005, 0.3, 0.32, 900);
    tone(o.ctx, o.dest, 'square', 360, 0.005, 0.28, 0.22, 1300);
    // White-noise burst
    noiseBurst(o.ctx, o.dest, 0.4, 0.3, 2500, 'bandpass', 0.8);
    noiseBurst(o.ctx, o.dest, 0.25, 0.18, 8000, 'highpass', 1);
    // Reverb tail
    if (o.verb) {
      noiseBurst(o.ctx, o.verb, 0.5, 0.28, 2000, 'bandpass', 1.5);
      tone(o.ctx, o.verb, 'sine', 660, 0.01, 0.6, 0.18, 1320);
    }
    // Rising fanfare stab
    [523.25, 659.25, 783.99].forEach((f, i) => {
      const t = o.ctx.currentTime + 0.05 + i * 0.04;
      const osc = o.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      const g = o.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      osc.connect(g);
      g.connect(o.dest);
      if (o.verb) g.connect(o.verb);
      osc.start(t);
      osc.stop(t + 0.35);
    });
  }

  hold(): void {
    const o = this.out(); if (!o) return;
    tone(o.ctx, o.dest, 'triangle', 300, 0.02, 0.12, 0.18, 600);
    tone(o.ctx, o.dest, 'sine', 600, 0.005, 0.15, 0.1, 1200);
  }

  fanfare(): void {
    const o = this.out(); if (!o) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      const start = o.ctx.currentTime + i * 0.08;
      // Sawtooth lead
      const osc = o.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      const detune = o.ctx.createOscillator();
      detune.type = 'sawtooth';
      detune.frequency.value = f * 1.007;
      const filter = o.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(3000, start);
      filter.frequency.exponentialRampToValueAtTime(800, start + 0.3);
      filter.Q.value = 6;
      const g = o.ctx.createGain();
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.28, start + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.34);
      osc.connect(filter);
      detune.connect(filter);
      filter.connect(g);
      g.connect(o.dest);
      if (o.verb) g.connect(o.verb);
      osc.start(start);
      detune.start(start);
      osc.stop(start + 0.4);
      detune.stop(start + 0.4);
    });
  }

  alarm(): void {
    const o = this.out(); if (!o) return;
    for (let i = 0; i < 3; i++) {
      const start = o.ctx.currentTime + i * 0.16;
      const osc = o.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(920, start);
      osc.frequency.linearRampToValueAtTime(460, start + 0.14);
      const filter = o.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1400;
      filter.Q.value = 4;
      const g = o.ctx.createGain();
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.28, start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.15);
      osc.connect(filter);
      filter.connect(g);
      g.connect(o.dest);
      if (o.verb) g.connect(o.verb);
      osc.start(start);
      osc.stop(start + 0.17);
    }
  }

  gameOver(): void {
    const o = this.out(); if (!o) return;
    // Power-down whine
    const osc = o.ctx.createOscillator();
    osc.type = 'sawtooth';
    const now = o.ctx.currentTime;
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 1.4);
    const filter = o.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3000, now);
    filter.frequency.exponentialRampToValueAtTime(300, now + 1.4);
    const g = o.ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.38, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.5);
    osc.connect(filter);
    filter.connect(g);
    g.connect(o.dest);
    if (o.verb) g.connect(o.verb);
    osc.start(now);
    osc.stop(now + 1.6);
    noiseBurst(o.ctx, o.dest, 1.2, 0.14, 1200, 'lowpass', 1);
  }

  uiBlip(): void {
    const o = this.out(); if (!o) return;
    tone(o.ctx, o.dest, 'square', 660, 0.003, 0.05, 0.14);
    tone(o.ctx, o.dest, 'sine', 1320, 0.002, 0.04, 0.06);
  }
}
