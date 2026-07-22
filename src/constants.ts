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
export const DAS_MS = 150; // delayed auto-shift
export const ARR_MS = 40;  // auto-repeat rate
export const SOFT_DROP_FACTOR = 20;

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

// Boss damage per line clear (× amperage combo)
export const BOSS_DAMAGE: Record<number, number> = { 1: 1, 2: 3, 3: 5, 4: 10 };

// High-voltage palette
export const COLORS = {
  bg: '#05010f',
  grid: 'rgba(0, 240, 255, 0.06)',
  gridStrong: 'rgba(0, 240, 255, 0.12)',
  copperTrace: 'rgba(140, 80, 20, 0.18)',
  panelBg: 'rgba(10, 5, 24, 0.85)',
  panelBorder: 'rgba(0, 240, 255, 0.3)',
  hudText: '#e6f8ff',
  hudDim: '#7aa9b8',
  ghost: 'rgba(255, 255, 255, 0.14)',
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
