import { STORAGE_HISCORE, STORAGE_MUTED, STORAGE_VOLUMES } from './constants';

export function loadHiScore(): number {
  try {
    const v = localStorage.getItem(STORAGE_HISCORE);
    return v ? Math.max(0, parseInt(v, 10) || 0) : 0;
  } catch {
    return 0;
  }
}

export function saveHiScore(score: number): void {
  try {
    localStorage.setItem(STORAGE_HISCORE, String(Math.floor(score)));
  } catch {
    /* ignore */
  }
}

export interface Volumes {
  master: number;
  sfx: number;
  bgm: number;
}

const DEFAULT_VOLUMES: Volumes = { master: 0.7, sfx: 0.7, bgm: 0.45 };

export function loadVolumes(): Volumes {
  try {
    const raw = localStorage.getItem(STORAGE_VOLUMES);
    if (!raw) return { ...DEFAULT_VOLUMES };
    const parsed = JSON.parse(raw) as Partial<Volumes>;
    return {
      master: clamp01(parsed.master ?? DEFAULT_VOLUMES.master),
      sfx: clamp01(parsed.sfx ?? DEFAULT_VOLUMES.sfx),
      bgm: clamp01(parsed.bgm ?? DEFAULT_VOLUMES.bgm),
    };
  } catch {
    return { ...DEFAULT_VOLUMES };
  }
}

export function saveVolumes(v: Volumes): void {
  try {
    localStorage.setItem(STORAGE_VOLUMES, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

export function loadMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_MUTED) === '1';
  } catch {
    return false;
  }
}

export function saveMuted(muted: boolean): void {
  try {
    localStorage.setItem(STORAGE_MUTED, muted ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
