// CIRCUIT BREAKER — visual effects (particles, screen shake, chromatic flash)
import type { Particle } from './types';

export interface PacmanRun {
  y: number;           // pixel y (center of row)
  x: number;           // current pixel x (center)
  vx: number;          // px/frame (60fps normalized)
  color: string;
  born: number;        // performance.now()
  life: number;        // 1..0
  size: number;        // radius in px
  pellets: { x: number; y: number; life: number; size: number }[];
  lastPelletX: number; // to space pellets
  reverse: boolean;    // right-to-left variant
}

export class EffectsManager {
  particles: Particle[] = [];
  pacmen: PacmanRun[] = [];
  shakeAmp = 0;
  shakeUntil = 0;
  flashAmp = 0;
  flashUntil = 0;

  spawnPacman(startX: number, y: number, endX: number, color: string, size = 14): void {
    const reverse = endX < startX;
    const distance = Math.abs(endX - startX);
    // Complete the run in ~500ms at 60fps → ~30 frames → vx = distance/30
    const vx = (reverse ? -1 : 1) * (distance / 30);
    this.pacmen.push({
      x: startX,
      y,
      vx,
      color,
      born: performance.now(),
      life: 1,
      size,
      pellets: [],
      lastPelletX: startX,
      reverse,
    });
  }

  spawnSpark(x: number, y: number, color: string, count = 12, speed = 4): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.9);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        life: 1,
        color,
        size: 1 + Math.random() * 2.5,
      });
    }
  }

  spawnLineBurst(centerX: number, y: number, width: number, color: string, count = 40): void {
    for (let i = 0; i < count; i++) {
      const x = centerX - width / 2 + Math.random() * width;
      const angle = Math.random() * Math.PI * 2;
      const v = 2 + Math.random() * 5;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v - 1.5,
        life: 1,
        color,
        size: 1 + Math.random() * 3,
      });
    }
  }

  shake(amp: number, durationMs: number): void {
    const until = performance.now() + durationMs;
    if (amp > this.shakeAmp) this.shakeAmp = amp;
    if (until > this.shakeUntil) this.shakeUntil = until;
  }

  flash(amp: number, durationMs: number): void {
    const until = performance.now() + durationMs;
    if (amp > this.flashAmp) this.flashAmp = amp;
    if (until > this.flashUntil) this.flashUntil = until;
  }

  update(dtMs: number): void {
    const dt = dtMs / 16.6667; // normalized to 60fps ticks
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 0.2 * dt; // gravity
      p.vx *= 0.98;
      p.life -= 0.018 * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    for (const pm of this.pacmen) {
      pm.x += pm.vx * dt;
      // Drop pellets every ~14px of travel
      if (Math.abs(pm.x - pm.lastPelletX) > 14) {
        pm.pellets.push({ x: pm.x, y: pm.y, life: 1, size: 2 + Math.random() * 1.5 });
        pm.lastPelletX = pm.x;
      }
      for (const pel of pm.pellets) pel.life -= 0.04 * dt;
      pm.pellets = pm.pellets.filter((pel) => pel.life > 0);
      pm.life -= 0.02 * dt;
    }
    this.pacmen = this.pacmen.filter((pm) => pm.life > 0 || pm.pellets.length > 0);
  }

  currentShake(): { x: number; y: number } {
    const now = performance.now();
    if (now >= this.shakeUntil) {
      this.shakeAmp = 0;
      return { x: 0, y: 0 };
    }
    const remaining = (this.shakeUntil - now) / 250;
    const amp = this.shakeAmp * Math.max(0, Math.min(1, remaining));
    return {
      x: (Math.random() * 2 - 1) * amp,
      y: (Math.random() * 2 - 1) * amp,
    };
  }

  currentFlash(): number {
    const now = performance.now();
    if (now >= this.flashUntil) {
      this.flashAmp = 0;
      return 0;
    }
    const remaining = (this.flashUntil - now) / 250;
    return this.flashAmp * Math.max(0, Math.min(1, remaining));
  }
}
