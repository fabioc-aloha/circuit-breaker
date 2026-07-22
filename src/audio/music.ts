// CIRCUIT BREAKER — procedural synthwave BGM sequencer
// Full arrangement: chord pad + arp + bassline + lead + drums, with reverb sends.
import type { AudioManager } from './audio';

type Mode = 'main' | 'boss' | 'boss-low' | 'silent';

interface ModeConfig {
  bpm: number;
  root: number;              // semitone shift from A2 for the mode's key
  chords: number[][];        // 4 chords (one per bar), voiced as offsets from root
  arp: (number | null)[];    // 16 steps, indexes into current chord
  lead: (number | null)[];   // 32 steps across 2 bars, note offsets from root
  bass: (number | null)[];   // 16 steps, offsets from chord root
  kick: boolean[];
  snare: boolean[];
  hats: boolean[];
  claps: boolean[];
  arpVelocity: number;
  leadVelocity: number;
  bassVelocity: number;
}

const _ = null;

// Am - F - C - G  (classic synthwave i-VI-III-VII in Am)
const MAIN_CHORDS = [
  [0, 3, 7, 12],
  [-4, 0, 5, 12],
  [3, 7, 10, 15],
  [-2, 5, 10, 14],
];

// Am - Dm - F - E  (darker, more aggressive)
const BOSS_CHORDS = [
  [0, 3, 7, 12],
  [5, 8, 12, 17],
  [-4, 0, 5, 12],
  [-5, -1, 4, 11],
];

const MODES: Record<Exclude<Mode, 'silent'>, ModeConfig> = {
  main: {
    bpm: 100,
    root: 0,
    chords: MAIN_CHORDS,
    arp: [0, 2, 1, 2, 0, 2, 3, 2, 0, 2, 1, 2, 0, 2, 3, 2],
    lead: [
      12, _, _, 15, _, _, 12, _, 10, _, _, 12, _, 10, 8, _,
      _, _, 7, _, _, 8, _, 10, 12, _, _, 15, _, _, 17, _,
    ],
    bass: [0, _, 0, _, 0, _, 0, _, 0, _, 0, _, 0, _, 0, _],
    kick:  [true,false,false,false, true,false,false,true, true,false,false,false, true,false,true,false],
    snare: [false,false,false,false, true,false,false,false, false,false,false,false, true,false,false,false],
    hats:  [false,true,true,true, false,true,true,true, false,true,true,true, false,true,true,true],
    claps: [false,false,false,false, false,false,false,false, false,false,false,false, false,false,false,false],
    arpVelocity: 0.14,
    leadVelocity: 0.22,
    bassVelocity: 0.28,
  },
  boss: {
    bpm: 132,
    root: 0,
    chords: BOSS_CHORDS,
    arp: [0, 2, 3, 2, 1, 2, 3, 2, 0, 2, 3, 2, 1, 3, 2, 3],
    lead: [
      _, _, _, _, 12, _, 15, _, 14, _, 12, _, 10, _, 12, _,
      _, _, _, _, 17, _, 15, _, 14, _, 12, _, 15, 14, 12, 10,
    ],
    bass: [0, 0, _, 0, _, 0, _, 0, 0, 0, _, 0, _, 0, _, 0],
    kick:  [true,false,false,false, true,false,false,true, true,false,false,false, true,false,false,false],
    snare: [false,false,false,false, true,false,false,false, false,false,false,false, true,false,false,true],
    hats:  [false,true,true,true, false,true,true,true, false,true,true,true, false,true,true,true],
    claps: [false,false,false,false, true,false,false,false, false,false,false,false, true,false,false,false],
    arpVelocity: 0.16,
    leadVelocity: 0.24,
    bassVelocity: 0.32,
  },
  'boss-low': {
    bpm: 150,
    root: 0,
    chords: BOSS_CHORDS,
    arp: [0, 3, 2, 3, 1, 3, 2, 3, 0, 3, 2, 3, 1, 2, 3, 2],
    lead: [
      12, _, 15, _, 17, _, 15, _, 19, _, 17, _, 15, _, 12, _,
      _, 10, 12, 15, _, 17, 15, 12, _, _, 19, _, 17, 15, 12, 10,
    ],
    bass: [0, 0, 0, _, 0, 0, 0, _, 0, 0, 0, _, 0, 0, 0, _],
    kick:  [true,false,false,true, true,false,false,false, true,false,true,false, true,false,false,false],
    snare: [false,false,false,false, true,false,false,false, false,false,false,false, true,false,true,false],
    hats:  [true,true,true,true, true,true,true,true, true,true,true,true, true,true,true,true],
    claps: [false,false,false,false, true,false,false,false, false,false,false,false, true,false,false,false],
    arpVelocity: 0.18,
    leadVelocity: 0.28,
    bassVelocity: 0.38,
  },
};

const A2_HZ = 110;
function hz(semitones: number): number {
  return A2_HZ * Math.pow(2, semitones / 12);
}

interface PadVoice {
  osc1: OscillatorNode;
  osc2: OscillatorNode;
  lfo: OscillatorNode;
  gain: GainNode;
}

export class Music {
  private mode: Mode = 'silent';
  private step = 0;
  private bar = 0;
  private nextStepTime = 0;
  private stepDurSec = 0.15;
  private timer: number | null = null;
  private started = false;
  private padVoice: PadVoice | null = null;

  constructor(private audio: AudioManager) {}

  setMode(mode: Mode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    if (mode === 'silent') {
      this.fadeOutPad();
      return;
    }
    if (this.audio.ctx) this.stepDurSec = 60 / MODES[mode].bpm / 4;
    if (!this.started) this.start();
    this.startPad();
  }

  start(): void {
    if (!this.audio.ctx || !this.audio.bgmBus) return;
    if (this.started) return;
    this.started = true;
    this.step = 0;
    this.bar = 0;
    this.nextStepTime = this.audio.ctx.currentTime + 0.1;
    const tick = (): void => {
      this.schedule();
      this.timer = window.setTimeout(tick, 40);
    };
    tick();
  }

  stop(): void {
    this.setMode('silent');
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.started = false;
  }

  private schedule(): void {
    const ctx = this.audio.ctx;
    const bus = this.audio.bgmBus;
    if (!ctx || !bus) return;
    if (this.mode === 'silent') return;
    const now = ctx.currentTime;
    const lookAhead = 0.15;

    // Drift guard: if the main thread stalled (tab defocus, GC, jank) and the
    // scheduler fell far behind, snap forward instead of firing a catch-up
    // burst that sounds like a tempo hiccup.
    if (this.nextStepTime < now - 0.05) {
      const stepsBehind = Math.floor((now - this.nextStepTime) / this.stepDurSec) + 1;
      this.step = (this.step + stepsBehind) % 16;
      this.bar = (this.bar + Math.floor(stepsBehind / 16)) % 4;
      this.nextStepTime = now + 0.02;
    }

    let scheduled = 0;
    while (this.nextStepTime < now + lookAhead && scheduled < 8) {
      this.playStep(ctx, bus, this.nextStepTime);
      this.nextStepTime += this.stepDurSec;
      this.step = (this.step + 1) % 16;
      if (this.step === 0) this.bar = (this.bar + 1) % 4;
      scheduled++;
    }
  }

  private currentChord(cfg: ModeConfig): number[] {
    return cfg.chords[this.bar];
  }

  private playStep(ctx: AudioContext, bus: AudioNode, when: number): void {
    if (this.mode === 'silent') return;
    const cfg = MODES[this.mode];
    const chord = this.currentChord(cfg);
    const chordRoot = chord[0];

    const arpIdx = cfg.arp[this.step];
    if (arpIdx !== null) {
      const note = chord[arpIdx] ?? chord[0];
      this.playArp(ctx, bus, hz(cfg.root + note + 12), when, cfg.arpVelocity);
    }

    const leadStep = (this.bar % 2) * 16 + this.step;
    const leadNote = cfg.lead[leadStep];
    if (leadNote !== null && this.bar % 2 === (this.mode === 'main' ? 1 : 0)) {
      this.playLead(ctx, bus, hz(cfg.root + leadNote), when, cfg.leadVelocity);
    }

    const bassNote = cfg.bass[this.step];
    if (bassNote !== null) {
      this.playBass(ctx, bus, hz(cfg.root + chordRoot + bassNote - 12), when, cfg.bassVelocity);
    }

    if (cfg.kick[this.step]) this.playKick(ctx, bus, when);
    if (cfg.snare[this.step]) this.playSnare(ctx, bus, when);
    if (cfg.hats[this.step]) this.playHat(ctx, bus, when, this.step % 4 === 0 ? 0.06 : 0.09);
    if (cfg.claps[this.step]) this.playClap(ctx, bus, when);
  }

  // ---------- PAD ----------
  private startPad(): void {
    const ctx = this.audio.ctx;
    const bus = this.audio.bgmBus;
    if (!ctx || !bus || this.mode === 'silent') return;
    this.fadeOutPad();
    const cfg = MODES[this.mode];
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';
    osc1.frequency.value = hz(cfg.root);
    osc2.frequency.value = hz(cfg.root) * 1.005;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    filter.Q.value = 4;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.15;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 400;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    const g = ctx.createGain();
    const target = 0.05;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(target, ctx.currentTime + 2.0);
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(g);
    g.connect(bus);
    if (this.audio.reverbSend) g.connect(this.audio.reverbSend);
    osc1.start();
    osc2.start();
    this.padVoice = { osc1, osc2, lfo, gain: g };
  }

  private fadeOutPad(): void {
    const ctx = this.audio.ctx;
    if (!ctx || !this.padVoice) return;
    const p = this.padVoice;
    const now = ctx.currentTime;
    p.gain.gain.cancelScheduledValues(now);
    p.gain.gain.setValueAtTime(p.gain.gain.value, now);
    p.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    p.osc1.stop(now + 0.5);
    p.osc2.stop(now + 0.5);
    p.lfo.stop(now + 0.5);
    this.padVoice = null;
  }

  // ---------- VOICES ----------
  private playArp(ctx: AudioContext, dest: AudioNode, freq: number, when: number, vel: number): void {
    const dur = this.stepDurSec * 0.9;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;
    const sub = ctx.createOscillator();
    sub.type = 'triangle';
    sub.frequency.value = freq / 2;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(4000, when);
    filter.frequency.exponentialRampToValueAtTime(700, when + dur);
    filter.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vel, when + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(filter);
    sub.connect(filter);
    filter.connect(g);
    g.connect(dest);
    if (this.audio.reverbSend) g.connect(this.audio.reverbSend);
    osc.start(when);
    sub.start(when);
    osc.stop(when + dur + 0.05);
    sub.stop(when + dur + 0.05);
  }

  private playLead(ctx: AudioContext, dest: AudioNode, freq: number, when: number, vel: number): void {
    const dur = this.stepDurSec * 3;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';
    osc1.frequency.value = freq;
    osc2.frequency.value = freq * 1.008;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, when);
    filter.frequency.exponentialRampToValueAtTime(3500, when + 0.05);
    filter.frequency.exponentialRampToValueAtTime(800, when + dur);
    filter.Q.value = 8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vel, when + 0.02);
    g.gain.setTargetAtTime(vel * 0.5, when + 0.05, 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(g);
    g.connect(dest);
    if (this.audio.reverbSend) g.connect(this.audio.reverbSend);
    osc1.start(when);
    osc2.start(when);
    osc1.stop(when + dur + 0.05);
    osc2.stop(when + dur + 0.05);
  }

  private playBass(ctx: AudioContext, dest: AudioNode, freq: number, when: number, vel: number): void {
    const dur = this.stepDurSec * 1.8;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = freq;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, when);
    filter.frequency.exponentialRampToValueAtTime(200, when + dur);
    filter.Q.value = 5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vel, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    const subG = ctx.createGain();
    subG.gain.setValueAtTime(0.0001, when);
    subG.gain.exponentialRampToValueAtTime(vel * 0.9, when + 0.008);
    subG.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(filter);
    filter.connect(g);
    sub.connect(subG);
    subG.connect(dest);
    g.connect(dest);
    osc.start(when);
    sub.start(when);
    osc.stop(when + dur + 0.05);
    sub.stop(when + dur + 0.05);
  }

  private playKick(ctx: AudioContext, dest: AudioNode, when: number): void {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, when);
    osc.frequency.exponentialRampToValueAtTime(38, when + 0.14);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.55, when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.18);
    const click = ctx.createOscillator();
    click.type = 'square';
    click.frequency.value = 1800;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.0001, when);
    cg.gain.exponentialRampToValueAtTime(0.12, when + 0.001);
    cg.gain.exponentialRampToValueAtTime(0.0001, when + 0.02);
    osc.connect(g);
    click.connect(cg);
    g.connect(dest);
    cg.connect(dest);
    osc.start(when);
    click.start(when);
    osc.stop(when + 0.2);
    click.stop(when + 0.03);
  }

  private playSnare(ctx: AudioContext, dest: AudioNode, when: number): void {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 220;
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, when);
    og.gain.exponentialRampToValueAtTime(0.12, when + 0.003);
    og.gain.exponentialRampToValueAtTime(0.0001, when + 0.09);
    const bufSize = Math.floor(ctx.sampleRate * 0.18);
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1800;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, when);
    ng.gain.exponentialRampToValueAtTime(0.28, when + 0.003);
    ng.gain.exponentialRampToValueAtTime(0.0001, when + 0.16);
    osc.connect(og);
    og.connect(dest);
    src.connect(filter);
    filter.connect(ng);
    ng.connect(dest);
    if (this.audio.reverbSend) ng.connect(this.audio.reverbSend);
    osc.start(when);
    src.start(when);
    osc.stop(when + 0.12);
    src.stop(when + 0.2);
  }

  private playHat(ctx: AudioContext, dest: AudioNode, when: number, vel: number): void {
    const bufSize = Math.floor(ctx.sampleRate * 0.06);
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vel, when + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    src.connect(filter);
    filter.connect(g);
    g.connect(dest);
    src.start(when);
    src.stop(when + 0.07);
  }

  private playClap(ctx: AudioContext, dest: AudioNode, when: number): void {
    for (let i = 0; i < 3; i++) {
      const t = when + i * 0.012;
      const bufSize = Math.floor(ctx.sampleRate * 0.05);
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let j = 0; j < bufSize; j++) d[j] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1400;
      filter.Q.value = 1.2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      src.connect(filter);
      filter.connect(g);
      g.connect(dest);
      if (this.audio.reverbSend) g.connect(this.audio.reverbSend);
      src.start(t);
      src.stop(t + 0.06);
    }
  }
}
