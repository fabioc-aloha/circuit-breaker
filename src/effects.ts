// CIRCUIT BREAKER — visual effects (particles, screen shake, chromatic flash)
import type { Particle } from './types';

export interface LightningBolt {
  points: { x: number; y: number }[];
  life: number;
  color: string;
  width: number;
  foreground: boolean;
}

export interface Announcement {
  title: string;
  subtitle: string;
  remainingMs: number;
  durationMs: number;
}

export interface GameOverWraith {
  centerX: number;
  centerY: number;
  size: number;
  remainingMs: number;
  durationMs: number;
}

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
  variant: 'standard' | 'breaker';
}

export class EffectsManager {
  particles: Particle[] = [];
  pacmen: PacmanRun[] = [];
  lightning: LightningBolt[] = [];
  announcement: Announcement | null = null;
  gameOverWraith: GameOverWraith | null = null;
  shakeAmp = 0;
  shakeUntil = 0;
  flashAmp = 0;
  flashUntil = 0;
  private ambientLightningTimer = 2800;

  spawnLightning(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    color = '#e6f8ff',
    width = 1.5,
    foreground = false,
  ): void {
    const distance = Math.hypot(endX - startX, endY - startY);
    const segments = Math.max(3, Math.ceil(distance / 28));
    const perpendicularX = -(endY - startY) / distance;
    const perpendicularY = (endX - startX) / distance;
    const jitter = Math.min(28, distance * 0.12);
    const points = [{ x: startX, y: startY }];

    for (let index = 1; index < segments; index++) {
      const progress = index / segments;
      const offset = (Math.random() - 0.5) * jitter;
      points.push({
        x: startX + (endX - startX) * progress + perpendicularX * offset,
        y: startY + (endY - startY) * progress + perpendicularY * offset,
      });
    }
    points.push({ x: endX, y: endY });
    this.lightning.push({ points, life: 1, color, width, foreground });
  }

  showAnnouncement(title: string, subtitle: string, durationMs: number): void {
    this.announcement = { title, subtitle, remainingMs: durationMs, durationMs };
  }

  spawnGameOverWraith(centerX: number, centerY: number, size = 76, durationMs = 1_800): void {
    this.gameOverWraith = { centerX, centerY, size, remainingMs: durationMs, durationMs };
  }

  spawnPacman(startX: number, y: number, endX: number, color: string, size = 14): void {
    this.createPacman(startX, y, endX, color, size, 'standard', 30);
  }

  spawnBreakerPacman(startX: number, y: number, endX: number, color: string, size = 48): void {
    this.createPacman(startX, y, endX, color, size, 'breaker', 42);
    const boltOffsets = [-size / 2, 0, size / 2];
    const boltColors = [color, '#00f0ff', '#ff2bd6'];
    for (let index = 0; index < boltOffsets.length; index++) {
      this.spawnLightning(startX, y + boltOffsets[index], endX, y + boltOffsets[index], boltColors[index], 2.2, true);
    }
  }

  private createPacman(
    startX: number,
    y: number,
    endX: number,
    color: string,
    size: number,
    variant: PacmanRun['variant'],
    durationFrames: number,
  ): void {
    const reverse = endX < startX;
    const distance = Math.abs(endX - startX);
    const vx = (reverse ? -1 : 1) * (distance / durationFrames);
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
      variant,
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

  update(dtMs: number, canvasWidth = 800, canvasHeight = 720): void {
    const dt = dtMs / 16.6667; // normalized to 60fps ticks
    if (this.announcement) {
      this.announcement.remainingMs -= dtMs;
      if (this.announcement.remainingMs <= 0) this.announcement = null;
    }
    if (this.gameOverWraith) {
      this.gameOverWraith.remainingMs -= dtMs;
      if (this.gameOverWraith.remainingMs <= 0) this.gameOverWraith = null;
    }

    for (const bolt of this.lightning) bolt.life -= 0.045 * dt;
    this.lightning = this.lightning.filter((bolt) => bolt.life > 0);

    this.ambientLightningTimer -= dtMs;
    if (this.ambientLightningTimer <= 0) {
      const startX = Math.random() < 0.5 ? -20 : canvasWidth + 20;
      const startY = Math.random() * canvasHeight * 0.6;
      const endX = canvasWidth * (0.25 + Math.random() * 0.5);
      const endY = canvasHeight * (0.2 + Math.random() * 0.65);
      this.spawnLightning(startX, startY, endX, endY, '#8de8ff', 1.25);
      this.ambientLightningTimer = 3500 + Math.random() * 4500;
    }

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
        const pelletSize = pm.variant === 'breaker' ? 4 + Math.random() * 2 : 2 + Math.random() * 1.5;
        pm.pellets.push({ x: pm.x, y: pm.y, life: 1, size: pelletSize });
        pm.lastPelletX = pm.x;
      }
      for (const pel of pm.pellets) pel.life -= 0.04 * dt;
      pm.pellets = pm.pellets.filter((pel) => pel.life > 0);
      pm.life -= 0.02 * dt;
    }
    this.pacmen = this.pacmen.filter((pm) => pm.life > 0 || pm.pellets.length > 0);
  }

  currentAnnouncement(): Announcement | null {
    return this.announcement;
  }

  currentGameOverWraith(): GameOverWraith | null {
    return this.gameOverWraith;
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
