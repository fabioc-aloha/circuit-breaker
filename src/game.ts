// CIRCUIT BREAKER — game state orchestration
import type { Music } from './audio/music';
import type { SFX } from './audio/sfx';
import { Board } from './board';
import { BOSSES, makeActiveBoss } from './bosses';
import {
    BLACKOUT_DURATION_MS,
    BOARD_PX_H,
    BOARD_PX_W,
    BOSS_DAMAGE,
    CELL,
    COLS,
    gravityFor,
    HARD_DROP_POINTS,
    HIDDEN_ROWS,
    HUD_PADDING,
    LINE_SCORE,
    LOCK_DELAY_MS,
    PIECE_COLORS,
    SIDE_PANEL_W,
    SOFT_DROP_POINTS,
    SPIKE_DURATION_MS,
    SPIKE_MULTIPLIER,
} from './constants';
import type { EffectsManager } from './effects';
import type { InputActions } from './input';
import { Bag, cellsOf, spawnPiece } from './piece';
import { loadHiScore, saveHiScore } from './storage';
import type { ActiveBoss, ActivePiece, BossAttackKind, CutsceneState, GamePhase, PieceKind } from './types';

const BOARD_PIXEL_ORIGIN_X = HUD_PADDING + SIDE_PANEL_W + HUD_PADDING;
const BOARD_PIXEL_ORIGIN_Y = HUD_PADDING;

export class Game implements InputActions {
  phase: GamePhase = 'ready';
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
  bossIndex = 0;
  boss: ActiveBoss | null = null;
  cutscene: CutsceneState | null = null;

  // timers (ms)
  gravityTimer = 0;
  lockTimer = 0;
  softDropTimer = 0;
  softDropHeld = false;
  spikeUntil = 0;
  blackoutUntil = 0;

  constructor(
    private effects: EffectsManager,
    private sfx: SFX,
    private music: Music,
    private onMuteToggle: () => void,
  ) {}

  beginRun(): void {
    this.board.reset();
    this.bag = new Bag();
    this.hold = null;
    this.holdLocked = false;
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.combo = 0;
    this.bossIndex = 0;
    this.boss = makeActiveBoss(BOSSES[0]);
    this.cutscene = null;
    this.gravityTimer = 0;
    this.lockTimer = 0;
    this.spikeUntil = 0;
    this.blackoutUntil = 0;
    this.spawnNext();
    this.phase = 'playing';
    this.music.setMode('boss');
  }

  update(dtMs: number): void {
    if (this.phase !== 'playing') {
      if (this.cutscene) {
        this.cutscene.timer -= dtMs;
        if (this.cutscene.timer <= 0) {
          this.cutscene = null;
          if (this.phase === 'cutscene') this.phase = 'playing';
        }
      }
      return;
    }

    // Gravity
    const gravityBase = gravityFor(this.level);
    const gravity = this.isSpike() ? gravityBase / SPIKE_MULTIPLIER : gravityBase;
    this.gravityTimer += dtMs;
    while (this.gravityTimer >= gravity) {
      this.gravityTimer -= gravity;
      this.stepGravity();
    }

    // Boss attacks
    if (this.boss) {
      this.boss.attackTimer -= dtMs;
      if (this.boss.attackTimer <= 0) {
        this.executeAttack(this.pickAttack(this.boss));
        this.boss.attackTimer = this.boss.def.attackIntervalMs;
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
    if (this.boss && this.boss.hp / this.boss.maxHp < 0.25) this.music.setMode('boss-low');
    else this.music.setMode('boss');
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
    this.board.lock(this.active);
    this.sfx.lock();
    // Line clears
    const cleared = this.board.clearLines();
    const rows = cleared.length;
    if (rows > 0) {
      this.combo += 1;
      const base = LINE_SCORE[rows] ?? 0;
      const gained = base * this.level * (this.combo > 1 ? this.combo : 1);
      this.score += gained;
      this.lines += rows;
      this.effects.flash(rows === 4 ? 0.9 : 0.35, rows === 4 ? 300 : 180);
      this.effects.shake(rows === 4 ? 8 : 3, rows === 4 ? 400 : 200);
      const centerX = BOARD_PIXEL_ORIGIN_X + BOARD_PX_W / 2;
      const NEON_COLORS = ['#00f0ff', '#ff00e5', '#ffe066', '#00ff9f'];
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
          BOARD_PIXEL_ORIGIN_Y + BOARD_PX_H * 0.48,
          BOARD_PIXEL_ORIGIN_X + BOARD_PX_W + 60,
          '#ffe600',
          Math.floor(CELL * 1.55),
        );
      } else {
        this.sfx.lineClear(rows);
      }
      // Boss damage
      if (this.boss) this.damageBoss(BOSS_DAMAGE[rows] * (this.combo > 1 ? this.combo : 1));
      if (this.phase === 'victory') return;
    } else {
      this.combo = 0;
    }

    if (this.board.isToppedOut()) {
      this.gameOver();
      return;
    }
    this.holdLocked = false;
    this.spawnNext();
    if (this.active && this.board.collides(this.active)) {
      this.gameOver();
      return;
    }
    this.lockTimer = 0;
    this.gravityTimer = 0;
  }

  private spawnNext(): void {
    const kind = this.bag.next();
    this.active = spawnPiece(kind);
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
      if (this.bossIndex >= BOSSES.length) {
        this.victory();
        return;
      }
      const next = BOSSES[this.bossIndex];
      this.boss = makeActiveBoss(next);
      this.level = this.bossIndex + 1;
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

  private pickAttack(b: ActiveBoss): BossAttackKind {
    const kinds = b.def.attackKinds;
    return kinds[Math.floor(Math.random() * kinds.length)];
  }

  private executeAttack(kind: BossAttackKind): void {
    this.sfx.alarm();
    this.effects.shake(4, 300);
    switch (kind) {
      case 'garbage': {
        const rows = 1 + Math.floor(Math.random() * 4);
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
    this.phase = 'gameover';
    this.sfx.gameOver();
    if (this.score > this.hiScore) {
      this.hiScore = this.score;
      saveHiScore(this.hiScore);
    }
    this.music.setMode('silent');
  }

  private victory(): void {
    this.phase = 'victory';
    this.boss = null;
    this.sfx.fanfare();
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
      this.resetLockIfLanded();
    }
  }
  moveRight(): void {
    if (this.phase !== 'playing' || !this.active) return;
    if (this.board.tryMove(this.active, 1, 0)) {
      this.sfx.move();
      this.resetLockIfLanded();
    }
  }
  softDrop(hold: boolean): void {
    if (this.phase !== 'playing' || !this.active) return;
    this.softDropHeld = hold;
    if (!hold) return;
    this.softDropTimer += 16;
    const interval = Math.max(20, gravityFor(this.level) / 20);
    while (this.softDropTimer >= interval) {
      this.softDropTimer -= interval;
      if (this.board.softDrop(this.active)) {
        this.score += SOFT_DROP_POINTS;
        this.sfx.softDropTick();
      } else break;
    }
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
    this.effects.shake(3, 150);
    this.lockAndAdvance();
  }
  rotateCW(): void {
    if (this.phase !== 'playing' || !this.active) return;
    if (this.board.tryRotate(this.active, 1)) {
      this.sfx.rotate();
      this.resetLockIfLanded();
    }
  }
  rotateCCW(): void {
    if (this.phase !== 'playing' || !this.active) return;
    if (this.board.tryRotate(this.active, -1)) {
      this.sfx.rotate();
      this.resetLockIfLanded();
    }
  }
  holdPiece(): void {
    if (this.phase !== 'playing' || !this.active || this.holdLocked) return;
    const currentKind = this.active.kind;
    if (this.hold === null) {
      this.hold = currentKind;
      this.spawnNext();
    } else {
      const prev = this.hold;
      this.hold = currentKind;
      this.active = spawnPiece(prev);
    }
    this.holdLocked = true;
    this.sfx.hold();
  }
  pause(): void {
    if (this.phase === 'playing') {
      this.phase = 'paused';
      this.music.setMode('silent');
      this.sfx.uiBlip();
    } else if (this.phase === 'paused') {
      this.phase = 'playing';
      this.music.setMode('boss');
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

  private resetLockIfLanded(): void {
    if (this.pieceLanded()) {
      // Reset lock timer with an upper bound (allow ~15 resets by default; here just reset)
      this.lockTimer = 0;
    }
  }

  // ----- helpers for renderer -----
  nextQueuePreview(n: number): PieceKind[] {
    return this.bag.peek(n);
  }
}
