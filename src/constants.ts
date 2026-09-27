// CIRCUIT BREAKER — global constants

// Board
export const COLS = 10;
export const ROWS = 20;
export const HIDDEN_ROWS = 2; // spawn area above visible board
export const TOTAL_ROWS = ROWS + HIDDEN_ROWS;

// Rendering (pixel sizes)
export const CELL = 30;
export const BOARD_PX_W = COLS * CELL;   // 300
export const BOARD_PX_H = ROWS * CELL;   // 600
export const SIDE_PANEL_W = 200;
export const HUD_PADDING = 20;
// Vertical strip above the board where Kong paces and throws pieces down.
// Sized to fit the sprite-rendered Kong (KONG_HEIGHT = 100 canvas px) plus a
// small margin above his crown.
export const KONG_LEDGE_H = 112;

export const CANVAS_W = SIDE_PANEL_W + HUD_PADDING * 2 + BOARD_PX_W + HUD_PADDING * 2 + SIDE_PANEL_W;
export const CANVAS_H = BOARD_PX_H + HUD_PADDING * 2 + 60 + KONG_LEDGE_H; // extra top room for Kong

// Timings (ms)
export const LOCK_DELAY_MS = 500;
// Guideline-style cap on lock-delay resets per piece: wiggling a landed piece
// can only buy ~15 extra half-seconds, never an infinite stall.
export const LOCK_RESET_LIMIT = 15;
export const DAS_MS = 150; // delayed auto-shift
export const ARR_MS = 40;  // auto-repeat rate
export const DAS_MIN_MS = 50;
export const DAS_MAX_MS = 300;
export const ARR_MIN_MS = 10;
export const ARR_MAX_MS = 100;
export const SOFT_DROP_FACTOR = 20;

// Boss attack telegraph: warning shown before the attack lands.
export const ATTACK_WARNING_MS = 1000;

// Danger state: stack entering this many rows of the visible top triggers
// the red vignette + warning tick.
export const DANGER_ROWS_FROM_TOP = 5;
export const DANGER_TICK_MS = 1500; // min gap between warning ticks

// Gravity curve per level (ms per row)
export const GRAVITY_TABLE: number[] = [
  0,     // level 0 unused
  1000, 900, 800, 700, 600,
  500, 420, 350, 290, 240,
  200, 170, 140, 115, 95,
  78, 65, 55, 45, 38, 32,
];
export function gravityFor(level: number): number {
  const idx = Math.min(level, GRAVITY_TABLE.length - 1);
  return GRAVITY_TABLE[idx] ?? 32;
}

// Scoring (guideline-ish)
export const LINE_SCORE: Record<number, number> = { 1: 100, 2: 300, 3: 500, 4: 800 };
export const SOFT_DROP_POINTS = 1;
export const HARD_DROP_POINTS = 2;
export const LINES_PER_LEVEL = 10;

// Boss damage per line clear (× amperage combo, × back-to-back, × tier scale).
// Retuned 2026-09: total boss HP dropped 275 → 193 and damage now scales with
// voltage tier so a skilled victory run lands around 10–12 minutes.
export const BOSS_DAMAGE: Record<number, number> = { 1: 1, 2: 3, 3: 5, 4: 10 };
// T-spin boss damage follows the same multipliers. T-spins are "difficult"
// clears, so they hit harder than the equivalent line count.
export const TSPIN_BOSS_DAMAGE: Record<number, number> = { 1: 8, 2: 12, 3: 16 };
// +10% boss damage per voltage tier above 1 — the late game accelerates.
export const BOSS_DAMAGE_TIER_SCALE = 0.1;

// T-spin line-clear scores (guideline-ish). Back-to-back ×1.5 applies on top.
export const TSPIN_SCORE: Record<number, number> = { 1: 800, 2: 1200, 3: 1600 };
export const BACK_TO_BACK_MULTIPLIER = 1.5;

// Perfect clear: board completely empty after a lock. Big flat bonus × level.
export const PERFECT_CLEAR_BASE = 2000;
export const PERFECT_CLEAR_BOSS_DAMAGE = 15;

// Difficulty presets. Gravity scale multiplies the ms-per-row (higher = slower).
export const DIFFICULTY = {
  chill: { gravityScale: 1.3, attackIntervalScale: 1.5, label: 'CHILL' },
  normal: { gravityScale: 1.0, attackIntervalScale: 1.0, label: 'NORMAL' },
  overdrive: { gravityScale: 0.8, attackIntervalScale: 0.7, label: 'OVERDRIVE' },
} as const;

// High-voltage palette
export const COLORS = {
  bg: '#05010f',
  grid: 'rgba(0, 240, 255, 0.06)',
  copperTrace: 'rgba(140, 80, 20, 0.18)',
  panelBg: 'rgba(10, 5, 24, 0.85)',
  panelBorder: 'rgba(0, 240, 255, 0.3)',
  hudText: '#e6f8ff',
  hudDim: '#7aa9b8',
  bossHp: '#ff2b4a',
  bossHpLow: '#ffe600',
  warn: '#ffe600',
  cyan: '#00f0ff',
  magenta: '#ff2bd6',
} as const;

export const PIECE_COLORS: Record<string, string> = {
  I: '#00f0ff', // cyan
  O: '#ffe600', // yellow
  T: '#a970ff', // purple
  S: '#7cff5c', // lime
  Z: '#ff2b4a', // red
  J: '#2b8bff', // blue
  L: '#ff9a1f', // orange
  G: '#5a5f6b', // garbage
} as const;

// Attack timings
export const BOSS_ATTACK_INTERVAL_MS = 12000;
export const BLACKOUT_DURATION_MS = 10000;
export const SPIKE_DURATION_MS = 6000;
export const SPIKE_MULTIPLIER = 2;
export const LOW_HP_THRESHOLD = 0.25;

// Storage keys
export const STORAGE_HISCORE = 'cb.hiscore';
export const STORAGE_VOLUMES = 'cb.volumes';
export const STORAGE_MUTED = 'cb.muted';
export const STORAGE_DAS = 'cb.das';
export const STORAGE_ARR = 'cb.arr';
export const STORAGE_RUNS = 'cb.runs';
