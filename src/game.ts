// CIRCUIT BREAKER — game state orchestration
import type { Music } from './audio/music';
import type { SFX } from './audio/sfx';
import { Board } from './board';
import { BOSSES, makeActiveBoss } from './bosses';
import {
    ATTACK_WARNING_MS,
    BACK_TO_BACK_MULTIPLIER,
    BLACKOUT_DURATION_MS,
    BOARD_PX_H,
    BOARD_PX_W,
    BOSS_DAMAGE,
    BOSS_DAMAGE_TIER_SCALE,
    CELL,
    COLS,
    DANGER_ROWS_FROM_TOP,
    DANGER_TICK_MS,
    DIFFICULTY,
    gravityFor,
    HARD_DROP_POINTS,
    HIDDEN_ROWS,
    HUD_PADDING,
    KONG_LEDGE_H,
    LINE_SCORE,
    LINES_PER_LEVEL,
    LOCK_DELAY_MS,
    LOCK_RESET_LIMIT,
    LOW_HP_THRESHOLD,
    PAUSE_DEBOUNCE_MS,
    PERFECT_CLEAR_BASE,
    PERFECT_CLEAR_BOSS_DAMAGE,
    PIECE_COLORS,
    SIDE_PANEL_W,
    SOFT_DROP_FACTOR,
    SOFT_DROP_POINTS,
    SPIKE_DURATION_MS,
    SPIKE_MULTIPLIER,
    TOTAL_ROWS,
    TSPIN_BOSS_DAMAGE,
    TSPIN_SCORE,
} from './constants';
import type { EffectsManager } from './effects';
import type { InputActions } from './input';
import { Kong, makeKongConfig } from './kong';
import { Bag, cellsOf, spawnPiece, spawnRangeX } from './piece';
import { incrementRunsCompleted, loadHiScore, loadRunsCompleted, saveHiScore } from './storage';
import type {
    ActiveBoss,
    ActivePiece,
    BossAttackKind,
    CutsceneState,
    DifficultyId,
    GameMode,
    GamePhase,
    PendingAttack,
    PieceKind,
    RunStats,
} from './types';

const BOARD_PIXEL_ORIGIN_X = HUD_PADDING + SIDE_PANEL_W + HUD_PADDING;
const BOARD_PIXEL_ORIGIN_Y = HUD_PADDING + KONG_LEDGE_H;
// Hold cleared rows visible-but-empty for this many ms so the pacman burst
// finishes crossing them before the stack drops. Matches pacman travel time.
const LINE_CLEAR_HOLD_MS = 260;

const TSPIN_LABELS: Record<number, string> = { 1: 'T-SPIN SINGLE', 2: 'T-SPIN DOUBLE', 3: 'T-SPIN TRIPLE' };

function attackWarningLabel(kind: BossAttackKind, rows: number): string {
    switch (kind) {
        case 'garbage': return `${rows} GARBAGE ROW${rows === 1 ? '' : 'S'} INBOUND`;
        case 'spike': return 'VOLTAGE SPIKE INCOMING';
        case 'blackout': return 'SIGNAL JAM INCOMING';
        case 'scramble': return 'COLUMN SCRAMBLE INCOMING';
    }
}

export class Game implements InputActions {
  phase: GamePhase = 'ready';
  mode: GameMode;
  difficulty: DifficultyId;
  board = new Board();
  bag = new Bag();
  active: ActivePiece | null = null;
  hold: PieceKind | null = null;
  holdLocked = false;
  score = 0;
  hiScore = loadHiScore();
  lines = 0;
  level = 1;
  combo = 0;
  backToBack = false; // "difficult"-clear chain (tetris / T-spin) for the ×1.5 bonus
  bossIndex = 0;
  boss: ActiveBoss | null = null;
  cutscene: CutsceneState | null = null;
  // Boss attack telegraph: warning state ticked down before executeAttack runs.
  pendingAttack: PendingAttack | null = null;

  // timers (ms)
  gravityTimer = 0;
  lockTimer = 0;
  lockResets = 0; // lock-delay resets used by the current piece (capped)
  softDropTimer = 0;
  softDropHeld = false;
  spikeUntil = 0;
  blackoutUntil = 0;
  // True when the last successful action on the active piece was a rotation —
  // feeds the T-spin 3-corner check at lock time. Lateral moves clear it;
  // gravity/soft/hard drops do not (spin-then-drop still counts).
  lastActionWasRotate = false;
  // Row indices held visible-empty during a line-clear animation. When the
  // timer expires, board.removeRows is called and the stack falls.
  private pendingLineClear: { rows: number[]; remainingMs: number } | null = null;

  // Per-run stats for the game-over / victory summary.
  piecesPlaced = 0;
  maxCombo = 0;
  tspins = 0;
  bossesDefeated = 0;
  runStartMs = 0;
  private dangerTickAt = 0;
  private runsCompleted: number;
  // Guards the pause toggle against duplicate keydown events (see pause()).
  private lastPauseToggleMs = 0;

  // Kong paces the girder above the board and throws each new piece down
  // from his current column. Constructed here so tests can inspect state.
  kong = new Kong(makeKongConfig(BOARD_PIXEL_ORIGIN_X, BOARD_PIXEL_ORIGIN_Y));

  constructor(
    private effects: EffectsManager,
    private sfx: SFX,
    private music: Music,
    private onMuteToggle: () => void,
    opts?: { mode?: GameMode; difficulty?: DifficultyId },
  ) {
    this.mode = opts?.mode ?? 'boss-rush';
    this.difficulty = opts?.difficulty ?? 'normal';
    this.runsCompleted = loadRunsCompleted();
  }

  private musicForPlay(): 'boss' | 'main' {
    return this.mode === 'boss-rush' ? 'boss' : 'main';
  }

  /** True when any column's stack reaches within DANGER_ROWS_FROM_TOP of the
   *  visible top — drives the red vignette + warning tick in the renderer. */
  get danger(): boolean {
    const topRow = HIDDEN_ROWS + DANGER_ROWS_FROM_TOP;
    for (let y = HIDDEN_ROWS; y < topRow; y++) {
      for (let x = 0; x < COLS; x++) {
        if (this.board.grid[y][x] !== 0) return true;
      }
    }
    return false;
  }

  get runStats(): RunStats {
    return {
      pieces: this.piecesPlaced,
      maxCombo: this.maxCombo,
      timeMs: Math.max(0, performance.now() - this.runStartMs),
      tspins: this.tspins,
      bosses: this.bossesDefeated,
      lines: this.lines,
    };
  }

  /** First-run hint toasts: shown during the first 30 s of a run, for the
   *  player's first few runs (persisted count in localStorage). */
  hintText(): string | null {
    if (this.runsCompleted >= 3 || this.phase !== 'playing') return null;
    const elapsed = performance.now() - this.runStartMs;
    if (elapsed > 30_000) return null;
    const hints = ['SHIFT — HOLD PIECE', 'SPACE — HARD DROP', 'A — 180° SPIN', 'P — PAUSE'];
    return hints[Math.floor(elapsed / 7500) % hints.length];
  }

  beginRun(): void {
    this.board.reset();
    this.bag = new Bag();
    this.hold = null;
    this.holdLocked = false;
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.combo = 0;
    this.backToBack = false;
    this.bossIndex = 0;
    // Free Stack mode: no boss, no attacks, tier advances by lines only.
    this.boss = this.mode === 'boss-rush' ? makeActiveBoss(BOSSES[0]) : null;
    this.cutscene = null;
    this.pendingAttack = null;
    this.gravityTimer = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.lastActionWasRotate = false;
    this.softDropTimer = 0;
    this.softDropHeld = false;
    this.spikeUntil = 0;
    this.blackoutUntil = 0;
    this.pendingLineClear = null;
    this.active = null;
    // Run stats.
    this.piecesPlaced = 0;
    this.maxCombo = 0;
    this.tspins = 0;
    this.bossesDefeated = 0;
    this.runStartMs = performance.now();
    this.dangerTickAt = 0;
    // Fresh Kong for this run — he climbs the ladder and beats his chest
    // before the first piece drops. Piece queued now, released after intro.
    this.kong = new Kong(makeKongConfig(BOARD_PIXEL_ORIGIN_X, BOARD_PIXEL_ORIGIN_Y));
    this.requestSpawn();
    this.phase = 'playing';
    this.music.setMode(this.musicForPlay());
  }

  update(dtMs: number): void {
    // Tick the deferred line-clear regardless of phase so a boss-defeat
    // cutscene doesn't strand the board with permanently-empty rows.
    if (this.pendingLineClear && this.phase !== 'paused') {
      this.pendingLineClear.remainingMs -= dtMs;
      if (this.pendingLineClear.remainingMs <= 0) {
        this.board.removeRows(this.pendingLineClear.rows);
        this.pendingLineClear = null;
        this.checkPerfectClear();
      }
    }

    if (this.phase !== 'playing') {
      if (this.cutscene) {
        this.cutscene.timer -= dtMs;
        if (this.cutscene.timer <= 0) {
          this.cutscene = null;
          if (this.phase === 'cutscene') this.phase = 'playing';
        }
      }
      // Cutscenes still let Kong pace so he doesn't freeze mid-stride, but
      // an explicit pause freezes EVERYTHING (including Kong) so screenshots
      // can capture him mid-throw without motion smearing the frame.
      if (this.phase !== 'paused') {
        this.kong.update(dtMs);
      }
      return;
    }

    // Kong animates + processes any pending throw request.
    this.kong.update(dtMs);
    const throwOut = this.kong.takeSpawnRequest();
    if (throwOut && !this.active) {
      // Kong aims at his current column, but a colliding spawn nudges to the
      // nearest free column instead of ending the run — only a genuinely full
      // spawn zone is a game over.
      const piece = this.resolveSpawn(throwOut.kind, throwOut.column);
      if (!piece) {
        this.gameOver();
        return;
      }
      this.active = piece;
      this.lockTimer = 0;
      this.lockResets = 0;
      this.lastActionWasRotate = false;
      this.gravityTimer = 0;
    }

    // Skip gravity while waiting for Kong to release the next piece.
    // (Boss attack timers tick regardless — a throw gap shouldn't stall them.)
    const hasActive = !!this.active;

    // Boss attacks — telegraphed: the warning fires first, the attack lands
    // ATTACK_WARNING_MS later so garbage/scramble never feel instant.
    if (this.boss && this.mode === 'boss-rush' && !this.pendingAttack) {
      this.boss.attackTimer -= dtMs;
      if (this.boss.attackTimer <= 0) {
        const kind = this.pickAttack(this.boss);
        const rows = kind === 'garbage' ? 1 + Math.floor(Math.random() * 4) : 0;
        this.pendingAttack = { kind, rows, remainingMs: ATTACK_WARNING_MS };
        this.sfx.alarm();
        this.effects.showAnnouncement('⚠ INCOMING', attackWarningLabel(kind, rows), ATTACK_WARNING_MS);
        this.boss.attackTimer =
          this.boss.def.attackIntervalMs * DIFFICULTY[this.difficulty].attackIntervalScale;
      }
    }
    if (this.pendingAttack) {
      this.pendingAttack.remainingMs -= dtMs;
      if (this.pendingAttack.remainingMs <= 0) {
        const atk = this.pendingAttack;
        this.pendingAttack = null;
        this.executeAttack(atk.kind, atk.rows);
      }
    }

    if (!hasActive) return;

    // Gravity (difficulty scales the ms-per-row: chill is slower).
    const gravityBase = gravityFor(this.level) * DIFFICULTY[this.difficulty].gravityScale;
    const gravity = this.isSpike() ? gravityBase / SPIKE_MULTIPLIER : gravityBase;
    this.gravityTimer += dtMs;
    while (this.gravityTimer >= gravity) {
      this.gravityTimer -= gravity;
      this.stepGravity();
    }

    // Soft drop is polled via InputController every frame; ticking here with
    // the real frame dt keeps drop rate stable across refresh rates.
    if (this.softDropHeld && this.active) {
      this.softDropTimer += dtMs;
      const interval = Math.max(20, gravityBase / SOFT_DROP_FACTOR);
      while (this.softDropTimer >= interval) {
        this.softDropTimer -= interval;
        if (this.board.softDrop(this.active)) {
          this.score += SOFT_DROP_POINTS;
          this.sfx.softDropTick();
        } else break;
      }
    } else {
      this.softDropTimer = 0;
    }

    // Danger warning tick (throttled) while the stack rides high.
    if (this.active && this.danger) {
      const now = performance.now();
      if (now - this.dangerTickAt >= DANGER_TICK_MS) {
        this.dangerTickAt = now;
        this.sfx.dangerTick();
      }
    }

    // Lock delay
    if (this.active && this.pieceLanded()) {
      this.lockTimer += dtMs;
      if (this.lockTimer >= LOCK_DELAY_MS) this.lockAndAdvance();
    } else {
      this.lockTimer = 0;
    }

    this.updateMusicMode();
  }

  private updateMusicMode(): void {
    if (this.phase !== 'playing') return;
    if (this.boss && this.boss.hp / this.boss.maxHp < LOW_HP_THRESHOLD) this.music.setMode('boss-low');
    else this.music.setMode(this.musicForPlay());
  }

  private stepGravity(): void {
    if (!this.active) return;
    if (!this.board.softDrop(this.active)) {
      // hit ground; lock delay handled elsewhere
    }
  }

  private pieceLanded(): boolean {
    if (!this.active) return false;
    return this.board.hardDropDistance(this.active) === 0;
  }

  private lockAndAdvance(): void {
    if (!this.active) return;
    this.piecesPlaced += 1;
    this.board.lock(this.active);
    this.sfx.lock();
    // Detect full rows but leave them in the grid — the renderer hides them
    // via board.clearingRows so the pacman burst crosses empty space, and
    // pendingLineClear will remove them once the animation window closes.
    const cleared = this.board.getFullRows();
    const rows = cleared.length;
    if (rows > 0) {
      for (const r of cleared) this.board.clearingRows.add(r);
      this.combo += 1;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      // T-spin: the last successful action was a rotation and the 3-corner
      // rule holds at lock time. Mini T-spins are not distinguished.
      const tspin = this.active.kind === 'T' && this.lastActionWasRotate && this.isTSpin(this.active);
      if (tspin) this.tspins += 1;
      // "Difficult" clears (tetris / any T-spin) sustain the back-to-back
      // chain for a ×1.5 bonus; lesser clears break it.
      const difficult = rows === 4 || tspin;
      const b2bBonus = difficult && this.backToBack;
      const comboMult = this.combo > 1 ? this.combo : 1;
      const base = tspin ? (TSPIN_SCORE[rows] ?? 0) : (LINE_SCORE[rows] ?? 0);
      const gained = Math.round(
        base * this.level * comboMult * (b2bBonus ? BACK_TO_BACK_MULTIPLIER : 1),
      );
      this.score += gained;
      this.lines += rows;
      this.effects.flash(rows === 4 ? 0.9 : 0.35, rows === 4 ? 300 : 180);
      this.effects.shake(rows === 4 ? 8 : 3, rows === 4 ? 400 : 200);
      const centerX = BOARD_PIXEL_ORIGIN_X + BOARD_PX_W / 2;
      const NEON_COLORS = ['#00f0ff', '#ff00e5', '#ffe066', '#00ff9f'];
      const tetrisY = rows === 4
        ? cleared.reduce(
          (sum, rowIdx) => sum + BOARD_PIXEL_ORIGIN_Y + (rowIdx - HIDDEN_ROWS) * CELL + CELL / 2,
          0,
        ) / rows
        : 0;
      for (let i = 0; i < cleared.length; i++) {
        const rowIdx = cleared[i];
        const y = BOARD_PIXEL_ORIGIN_Y + (rowIdx - HIDDEN_ROWS) * CELL + CELL / 2;
        this.effects.spawnLineBurst(centerX, y, BOARD_PX_W, '#00f0ff', rows === 4 ? 60 : 30);
        if (rows < 4) {
          // Cyberpunk Pacmen zip across ordinary clears — direction alternates per row.
          const reverse = i % 2 === 1;
          const startX = reverse ? BOARD_PIXEL_ORIGIN_X + BOARD_PX_W + 20 : BOARD_PIXEL_ORIGIN_X - 20;
          const endX = reverse ? BOARD_PIXEL_ORIGIN_X - 20 : BOARD_PIXEL_ORIGIN_X + BOARD_PX_W + 20;
          const color = NEON_COLORS[i % NEON_COLORS.length];
          this.effects.spawnPacman(startX, y, endX, color, Math.floor(CELL * 0.55));
        }
      }
      if (rows === 4) {
        this.sfx.tetrisBoom();
        this.effects.showAnnouncement('MAIN BREAKER TRIPPED', 'FOUR-LINE OVERLOAD', 900);
        this.effects.spawnBreakerPacman(
          BOARD_PIXEL_ORIGIN_X - 60,
          tetrisY,
          BOARD_PIXEL_ORIGIN_X + BOARD_PX_W + 60,
          '#ffe600',
          CELL * 2,
        );
      } else if (tspin) {
        this.sfx.tetrisBoom();
        this.effects.showAnnouncement(
          TSPIN_LABELS[rows] ?? 'T-SPIN',
          b2bBonus ? 'BACK-TO-BACK ×1.5' : `+${gained}`,
          900,
        );
      } else {
        this.sfx.lineClear(rows);
      }
      // Boss damage scales with combo, back-to-back, and voltage tier so the
      // late game accelerates toward the 10–12 minute victory target.
      if (this.boss) {
        const dmgBase = tspin ? (TSPIN_BOSS_DAMAGE[rows] ?? 0) : (BOSS_DAMAGE[rows] ?? 0);
        const tierScale = 1 + BOSS_DAMAGE_TIER_SCALE * (this.level - 1);
        const dmg = Math.max(
          1,
          Math.round(dmgBase * comboMult * (b2bBonus ? BACK_TO_BACK_MULTIPLIER : 1) * tierScale),
        );
        this.damageBoss(dmg);
      }
      this.backToBack = difficult;
      if (this.phase === 'victory') return;
      // Schedule the actual grid mutation so the pacman burst can finish
      // crossing the empty rows before the stack drops.
      this.pendingLineClear = { rows: cleared, remainingMs: LINE_CLEAR_HOLD_MS };
      // Tier advances by lines OR boss stage, whichever is higher. Boss defeat
      // bumps bossIndex inside damageBoss above, so the max() picks it up here.
      const nextLevel = Math.max(
        1 + Math.floor(this.lines / LINES_PER_LEVEL),
        this.bossIndex + 1,
      );
      if (nextLevel > this.level) {
        this.level = nextLevel;
        this.effects.flash(0.35, 220);
        this.sfx.uiBlip();
        // On a tetris the MAIN BREAKER banner is already flashing; don't
        // stomp it with the tier callout.
        if (rows < 4) this.effects.showAnnouncement('VOLTAGE TIER UP', `TIER ${this.level} ONLINE`, 900);
      }
    } else {
      this.combo = 0;
    }

    if (this.board.isToppedOut()) {
      this.gameOver();
      return;
    }
    this.holdLocked = false;
    // Ask Kong to throw the next piece. It becomes active when he releases it.
    this.active = null;
    this.requestSpawn();
    this.lockTimer = 0;
    this.lockResets = 0;
    this.lastActionWasRotate = false;
    this.gravityTimer = 0;
  }

  /** Resolve a spawn column near Kong's aim. Spirals outward to the nearest
   *  non-colliding column; returns null only when the spawn zone is truly
   *  full (a real top-out, not a bad throw). */
  private resolveSpawn(kind: PieceKind, column: number): ActivePiece | null {
    const [minX, maxX] = spawnRangeX(kind);
    const start = Math.max(minX, Math.min(maxX, column));
    for (let d = 0; d <= maxX - minX; d++) {
      const cols = d === 0 ? [start] : [start - d, start + d];
      for (const c of cols) {
        if (c < minX || c > maxX) continue;
        const piece = spawnPiece(kind, c);
        if (!this.board.collides(piece)) return piece;
      }
    }
    return null;
  }

  /** 3-corner rule: at least 3 of the 4 diagonal cells around the T piece's
   *  3×3-box center are occupied. Walls and floor count as occupied. */
  private isTSpin(piece: ActivePiece): boolean {
    const cx = piece.x + 1;
    const cy = piece.y + 1;
    let filled = 0;
    const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const;
    for (const [dx, dy] of corners) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || x >= COLS || y < 0 || y >= TOTAL_ROWS || this.board.grid[y][x] !== 0) {
        filled += 1;
      }
    }
    return filled >= 3;
  }

  /** Perfect clear: the deferred line-clear emptied the entire well. */
  private checkPerfectClear(): void {
    if (!this.board.isBoardEmpty()) return;
    const bonus = PERFECT_CLEAR_BASE * this.level;
    this.score += bonus;
    this.effects.showAnnouncement('PERFECT CLEAR', `+${bonus} — WELL PURGED`, 1200);
    this.effects.flash(0.7, 350);
    this.sfx.fanfare();
    if (this.boss) {
      const tierScale = 1 + BOSS_DAMAGE_TIER_SCALE * (this.level - 1);
      this.damageBoss(Math.round(PERFECT_CLEAR_BOSS_DAMAGE * tierScale));
    }
  }

  private requestSpawn(): void {
    const kind = this.bag.next();
    this.kong.requestThrow(kind);
  }

  private damageBoss(dmg: number): void {
    if (!this.boss) return;
    this.boss.hp -= dmg;
    if (this.boss.hp <= 0) {
      const defeated = this.boss.def;
      this.effects.flash(1, 400);
      this.effects.shake(12, 600);
      this.sfx.fanfare();
      this.bossIndex += 1;
      this.bossesDefeated += 1;
      // A pending attack warning fizzles when its boss dies mid-telegraph.
      this.pendingAttack = null;
      if (this.bossIndex >= BOSSES.length) {
        this.victory();
        return;
      }
      const next = BOSSES[this.bossIndex];
      this.boss = makeActiveBoss(next);
      this.cutscene = {
        text: [
          `${defeated.name}: ${defeated.defeatQuote}`,
          '',
          `INCOMING TARGET: ${next.name}`,
          `"${next.taunt}"`,
        ],
        timer: 3200,
      };
      this.phase = 'cutscene';
    }
  }

  /** Dismiss the inter-boss cutscene early (any key / tap). */
  skipCutscene(): void {
    if (this.phase === 'cutscene' && this.cutscene) {
      this.cutscene = null;
      this.phase = 'playing';
      this.sfx.uiBlip();
    }
  }

  private pickAttack(b: ActiveBoss): BossAttackKind {
    const kinds = b.def.attackKinds;
    return kinds[Math.floor(Math.random() * kinds.length)];
  }

  /** Force the deferred line-clear to resolve immediately. Called before boss
   *  attacks that mutate the grid — otherwise the pending row indices would
   *  point at stale rows after a garbage push or a scramble. */
  private flushPendingLineClear(): void {
    if (!this.pendingLineClear) return;
    this.board.removeRows(this.pendingLineClear.rows);
    this.pendingLineClear = null;
  }

  private executeAttack(kind: BossAttackKind, rows = 1 + Math.floor(Math.random() * 4)): void {
    this.effects.shake(4, 300);
    switch (kind) {
      case 'garbage': {
        this.flushPendingLineClear();
        const displacedBlocks = this.board.addGarbage(rows);
        if (this.active) this.active.y -= rows;
        if (displacedBlocks || (this.active && this.board.collides(this.active))) this.gameOver();
        break;
      }
      case 'spike':
        this.spikeUntil = performance.now() + SPIKE_DURATION_MS;
        break;
      case 'blackout':
        this.blackoutUntil = performance.now() + BLACKOUT_DURATION_MS;
        break;
      case 'scramble': {
        this.flushPendingLineClear();
        const a = Math.floor(Math.random() * COLS);
        let b = Math.floor(Math.random() * COLS);
        while (b === a) b = Math.floor(Math.random() * COLS);
        this.board.scrambleColumns(a, b);
        break;
      }
    }
  }

  isSpike(): boolean {
    return performance.now() < this.spikeUntil;
  }
  isBlackout(): boolean {
    return performance.now() < this.blackoutUntil;
  }

  private gameOver(): void {
    if (this.phase === 'gameover') return;
    this.phase = 'gameover';
    this.runsCompleted = incrementRunsCompleted();
    this.effects.spawnGameOverWraith(
      BOARD_PIXEL_ORIGIN_X + BOARD_PX_W / 2,
      BOARD_PIXEL_ORIGIN_Y + BOARD_PX_H / 2,
    );
    this.sfx.gameOver();
    if (this.score > this.hiScore) {
      this.hiScore = this.score;
      saveHiScore(this.hiScore);
    }
    this.music.setMode('silent');
    // Kong doesn't lose — he beats his chest either way.
    this.kong.startCelebration();
  }

  private victory(): void {
    this.phase = 'victory';
    this.boss = null;
    this.sfx.fanfare();
    this.runsCompleted = incrementRunsCompleted();
    // Even on a win, Kong celebrates — he's the one who threw every piece
    // that built the winning stack.
    this.kong.startCelebration();
    if (this.score > this.hiScore) {
      this.hiScore = this.score;
      saveHiScore(this.hiScore);
    }
    this.music.setMode('main');
  }

  // ----- InputActions -----
  moveLeft(): void {
    if (this.phase !== 'playing' || !this.active) return;
    if (this.board.tryMove(this.active, -1, 0)) {
      this.sfx.move();
      this.lastActionWasRotate = false;
      this.resetLockIfLanded();
    }
  }
  moveRight(): void {
    if (this.phase !== 'playing' || !this.active) return;
    if (this.board.tryMove(this.active, 1, 0)) {
      this.sfx.move();
      this.lastActionWasRotate = false;
      this.resetLockIfLanded();
    }
  }
  softDrop(hold: boolean): void {
    if (this.phase !== 'playing' || !this.active) {
      this.softDropHeld = false;
      return;
    }
    this.softDropHeld = hold;
    if (!hold) this.softDropTimer = 0;
  }
  hardDrop(): void {
    if (this.phase !== 'playing' || !this.active) return;
    const dist = this.board.hardDropDistance(this.active);
    this.active.y += dist;
    this.score += dist * HARD_DROP_POINTS;
    this.sfx.hardDrop();
    // Spark burst at landing
    for (const c of cellsOf(this.active)) {
      const px = BOARD_PIXEL_ORIGIN_X + c.x * CELL + CELL / 2;
      const py = BOARD_PIXEL_ORIGIN_Y + (c.y - HIDDEN_ROWS) * CELL + CELL / 2;
      this.effects.spawnSpark(px, py, PIECE_COLORS[this.active.kind], 8, 3);
    }
    // Shake scales with drop distance — a 1-cell tap shouldn't rattle the cab.
    this.effects.shake(Math.min(7, 2 + dist / 5), 150);
    this.lockAndAdvance();
  }
  rotateCW(): void {
    if (this.phase !== 'playing' || !this.active) return;
    if (this.board.tryRotate(this.active, 1)) {
      this.sfx.rotate();
      this.lastActionWasRotate = true;
      this.resetLockIfLanded();
    }
  }
  rotateCCW(): void {
    if (this.phase !== 'playing' || !this.active) return;
    if (this.board.tryRotate(this.active, -1)) {
      this.sfx.rotate();
      this.lastActionWasRotate = true;
      this.resetLockIfLanded();
    }
  }
  rotate180(): void {
    if (this.phase !== 'playing' || !this.active) return;
    if (this.board.tryRotate180(this.active)) {
      this.sfx.rotate();
      this.lastActionWasRotate = true;
      this.resetLockIfLanded();
    }
  }
  holdPiece(): void {
    if (this.phase !== 'playing' || !this.active || this.holdLocked) return;
    const currentKind = this.active.kind;
    // Hold is instant (no Kong throw animation) so the mechanic stays snappy.
    // The swapped piece still appears under Kong's current column for theme.
    const spawnCol = this.kong.spawnColumnFor(this.hold ?? this.bag.peek(1)[0]);
    let next: ActivePiece | null;
    if (this.hold === null) {
      this.hold = currentKind;
      next = this.resolveSpawn(this.bag.next(), spawnCol);
    } else {
      const prev = this.hold;
      this.hold = currentKind;
      next = this.resolveSpawn(prev, spawnCol);
    }
    if (!next) {
      this.gameOver();
      return;
    }
    this.active = next;
    this.holdLocked = true;
    this.lockResets = 0;
    this.lastActionWasRotate = false;
    this.sfx.hold();
  }
  pause(): void {
    // Debounce: some keyboards/drivers deliver duplicate non-repeat keydown
    // events for a single press, which would toggle pause twice (net no-op)
    // and read as a "flaky" pause key. Human double-presses are slower.
    const now = performance.now();
    if (now - this.lastPauseToggleMs < PAUSE_DEBOUNCE_MS) return;
    this.lastPauseToggleMs = now;
    if (this.phase === 'playing') {
      this.phase = 'paused';
      this.music.setMode('silent');
      this.sfx.uiBlip();
    } else if (this.phase === 'paused') {
      this.phase = 'playing';
      this.music.setMode(this.musicForPlay());
      this.sfx.uiBlip();
    }
  }
  restart(): void {
    this.beginRun();
    this.sfx.uiBlip();
  }
  toggleMute(): void {
    this.onMuteToggle();
  }
  start(): void {
    // Used to dismiss boot overlay; handled in main.ts
  }
  menuKey(_key: string, _ev: KeyboardEvent): void {
    // Boot-menu key handling; wired in main.ts. No-op on the game itself.
  }

  private resetLockIfLanded(): void {
    // Capped: each successful move/rotation on a landed piece buys one more
    // lock-delay window, up to LOCK_RESET_LIMIT — then the piece locks.
    if (this.pieceLanded() && this.lockResets < LOCK_RESET_LIMIT) {
      this.lockTimer = 0;
      this.lockResets += 1;
    }
  }

  // ----- helpers for renderer -----
  nextQueuePreview(n: number): PieceKind[] {
    return this.bag.peek(n);
  }
}
