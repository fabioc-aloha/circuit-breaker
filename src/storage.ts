import {
  ARR_MAX_MS,
  ARR_MIN_MS,
  ARR_MS,
  DAS_MAX_MS,
  DAS_MIN_MS,
  DAS_MS,
  STORAGE_ARR,
  STORAGE_DAS,
  STORAGE_HISCORE,
  STORAGE_MUTED,
  STORAGE_RUNS,
  STORAGE_VOLUMES,
} from './constants';

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

function loadClampedInt(key: string, fallback: number, min: number, max: number): number {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  } catch {
    return fallback;
  }
}

function saveInt(key: string, v: number): void {
  try {
    localStorage.setItem(key, String(Math.round(v)));
  } catch {
    /* ignore */
  }
}

/** Delayed auto-shift in ms (tunable on the boot screen). */
export function loadDas(): number {
  return loadClampedInt(STORAGE_DAS, DAS_MS, DAS_MIN_MS, DAS_MAX_MS);
}
export function saveDas(v: number): void {
  saveInt(STORAGE_DAS, Math.max(DAS_MIN_MS, Math.min(DAS_MAX_MS, v)));
}

/** Auto-repeat rate in ms (tunable on the boot screen). */
export function loadArr(): number {
  return loadClampedInt(STORAGE_ARR, ARR_MS, ARR_MIN_MS, ARR_MAX_MS);
}
export function saveArr(v: number): void {
  saveInt(STORAGE_ARR, Math.max(ARR_MIN_MS, Math.min(ARR_MAX_MS, v)));
}

/** Completed runs — drives first-run hint toasts. */
export function loadRunsCompleted(): number {
  return loadClampedInt(STORAGE_RUNS, 0, 0, 1_000_000);
}
export function incrementRunsCompleted(): number {
  const n = loadRunsCompleted() + 1;
  saveInt(STORAGE_RUNS, n);
  return n;
}
