// CIRCUIT BREAKER — Web Audio manager
import { loadMuted, loadVolumes, saveMuted, saveVolumes, type Volumes } from '../storage';

export class AudioManager {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  sfxBus: GainNode | null = null;
  bgmBus: GainNode | null = null;
  reverbSend: GainNode | null = null;
  reverbReturn: GainNode | null = null;
  compressor: DynamicsCompressorNode | null = null;
  volumes: Volumes;
  muted: boolean;
  private initialized = false;

  constructor() {
    this.volumes = loadVolumes();
    this.muted = loadMuted();
  }

  /** Must be called from a user gesture. */
  ensure(): AudioContext {
    if (this.ctx && this.initialized) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    }
    const Ctor: typeof AudioContext =
      (window.AudioContext as typeof AudioContext | undefined) ??
      ((window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext as typeof AudioContext);
    this.ctx = new Ctor();

    this.master = this.ctx.createGain();
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -14;
    this.compressor.knee.value = 20;
    this.compressor.ratio.value = 6;
    this.compressor.attack.value = 0.005;
    this.compressor.release.value = 0.18;

    this.sfxBus = this.ctx.createGain();
    this.bgmBus = this.ctx.createGain();

    // Reverb send/return using a synthesized convolution IR
    this.reverbSend = this.ctx.createGain();
    this.reverbSend.gain.value = 0.28;
    this.reverbReturn = this.ctx.createGain();
    this.reverbReturn.gain.value = 0.55;
    const convolver = this.ctx.createConvolver();
    convolver.buffer = this.buildImpulseResponse(2.4, 3.0);
    this.reverbSend.connect(convolver);
    convolver.connect(this.reverbReturn);
    this.reverbReturn.connect(this.master);

    this.sfxBus.connect(this.master);
    this.bgmBus.connect(this.master);
    this.master.connect(this.compressor);
    this.compressor.connect(this.ctx.destination);

    this.applyVolumes();
    this.initialized = true;
    return this.ctx;
  }

  private buildImpulseResponse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        const t = i / length;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      }
    }
    return buf;
  }

  setVolumes(v: Partial<Volumes>): void {
    this.volumes = { ...this.volumes, ...v };
    saveVolumes(this.volumes);
    this.applyVolumes();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    saveMuted(this.muted);
    this.applyVolumes();
    return this.muted;
  }

  private applyVolumes(): void {
    if (!this.master || !this.sfxBus || !this.bgmBus) return;
    const now = this.ctx?.currentTime ?? 0;
    const m = this.muted ? 0 : this.volumes.master;
    this.master.gain.setTargetAtTime(m, now, 0.02);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx, now, 0.02);
    this.bgmBus.gain.setTargetAtTime(this.volumes.bgm, now, 0.02);
  }
}
