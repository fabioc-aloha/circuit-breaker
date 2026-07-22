// CIRCUIT BREAKER — Kong: the pixel-art gorilla who paces the top girder
// and hurls tetrominoes down into the well. Owns his own state machine so
// the game loop only needs to ask "ready to spawn?" and "which column?".
import { BOARD_PX_W, CELL, COLS, PIECE_COLORS } from './constants';
import { SHAPES, spawnRangeX } from './piece';
import type { PieceKind } from './types';

export type KongState =
  | 'intro-ladder-extend'  // ladder animates down from a stub at the girder
  | 'intro-climb'          // Kong scales the fully-extended ladder
  | 'intro-ladder-retract' // ladder shrinks back to a stub at the top
  | 'intro-chest'          // triumphant chest-beat before pacing
  | 'pacing'               // organic walk along the girder
  | 'winding-up'           // stopped, arm cocked back holding the piece
  | 'throwing'             // release frame; piece emitted at throw-frame midpoint
  | 'celebrating';         // permanent victory chest-beat when the run ends

export interface KongConfig {
  ledgeLeftX: number;   // canvas-px: leftmost x kong may occupy
  ledgeRightX: number;  // canvas-px: rightmost x kong may occupy
  ledgeY: number;       // canvas-px: y of the girder top (kong's feet rest here)
  ladderX: number;      // canvas-px: x of the ladder kong climbs on intro
  ladderBottomY: number;// canvas-px: bottom rung y (fully extended)
}

// Timings tuned so the intro feels ceremonious without stalling gameplay.
export const KONG_LADDER_EXTEND_MS = 550;
export const KONG_INTRO_CLIMB_MS = 1200;
export const KONG_LADDER_RETRACT_MS = 450;
export const KONG_INTRO_CHEST_MS = 800;
export const KONG_WINDUP_MS = 320;
export const KONG_THROW_MS = 260;
// After retract the ladder leaves a small stub attached to the girder so
// the girder-mount point stays visible during play.
export const KONG_LADDER_STUB_PX = 12;
// Piece emits near the peak of the release swing so the tetromino appearing
// on the board reads as "just left the hand", not "popped out of thin air".
const THROW_EMIT_FRACTION = 0.65;

// Kong is rendered from a licensed sprite sheet (see CREDITS.md). We use
// the polished hero pose on the right of the sheet; walk / throw / chest-beat
// motion is added via canvas transforms and per-frame animation. Vite serves
// the file from /kong-sprite.png (PNG already has alpha — no white-keying).
export const KONG_WIDTH = 90;   // canvas-px bounding box width (rendered size)
export const KONG_HEIGHT = 100; // canvas-px bounding box height (feet at HEIGHT)
// Kept exported for tests that reference the old constant name.
export const KONG_PIXEL_SCALE = 3;

const SPRITE_URL = '/kong-sprite.png';
// Frame rectangles measured from the sprite sheet (3088×3040). The sheet is
// hand-laid-out with variable-sized poses, so frames are hardcoded from a
// one-off flood-fill measurement pass rather than derived from a rigid grid.
// Frame picks below are PROVISIONAL — a numbered preview grid is available
// via scripts/kong-frame-preview to swap in specific frames per state.
interface FrameSpec { sx: number; sy: number; sw: number; sh: number; rowH: number; }
// Reference heights — scale factor within a set uses the tallest frame in
// that set as the canonical size so animation frames don't jitter.
const ROW_H_SMALL = 155;  // row-1 short standing poses
const ROW_H_TALL = 210;   // row-1 tall action/throw poses

// Provisional idle cycle — first four row-1 frames (subtle head-turn variants).
const F_IDLE: FrameSpec[] = [
  { sx: 1,   sy: 1, sw: 160, sh: 153, rowH: ROW_H_SMALL },
  { sx: 163, sy: 1, sw: 166, sh: 149, rowH: ROW_H_SMALL },
  { sx: 331, sy: 1, sw: 167, sh: 143, rowH: ROW_H_SMALL },
  { sx: 500, sy: 1, sw: 172, sh: 144, rowH: ROW_H_SMALL },
];
// Walk cycle — narrow row-1 frames (consistent 149px width, slight height
// variation from foot lift). Selected because arms stay in a neutral swing
// stance, so walking doesn't look like throwing.
const F_WALK: FrameSpec[] = [
  { sx: 840,  sy: 1, sw: 149, sh: 140, rowH: ROW_H_SMALL },
  { sx: 991,  sy: 1, sw: 149, sh: 135, rowH: ROW_H_SMALL },
  { sx: 1142, sy: 1, sw: 149, sh: 130, rowH: ROW_H_SMALL },
  { sx: 991,  sy: 1, sw: 149, sh: 135, rowH: ROW_H_SMALL }, // ping-pong back through mid frame
];
// Throw poses — arm-raised tall frames. Only used in wind-up + throwing states.
const F_THROW: FrameSpec[] = [
  { sx: 1691, sy: 1, sw: 206, sh: 199, rowH: ROW_H_TALL },
  { sx: 1899, sy: 1, sw: 209, sh: 189, rowH: ROW_H_TALL },
  { sx: 2110, sy: 1, sw: 167, sh: 169, rowH: ROW_H_TALL },
  { sx: 2279, sy: 1, sw: 161, sh: 187, rowH: ROW_H_TALL },
];
// Chest-beat — alternate two row-1 frames with different arm positions.
const F_CHEST: FrameSpec[] = [
  { sx: 674, sy: 1, sw: 164, sh: 149, rowH: ROW_H_SMALL },
  { sx: 2442, sy: 1, sw: 193, sh: 190, rowH: ROW_H_TALL }, // wider arm-out variant
];

// Module-level cache: load the sprite bitmap once, share across Kong instances.
// PNG has native alpha so we can hand the decoded Image straight to drawImage
// without any pre-processing.
let cachedSprite: HTMLImageElement | null = null;
let spriteLoadStarted = false;

function loadSprite(): void {
  if (spriteLoadStarted) return;
  spriteLoadStarted = true;
  const img = new Image();
  img.onload = () => { cachedSprite = img; };
  img.onerror = () => {
    // eslint-disable-next-line no-console
    console.error('[Kong] sprite load failed:', SPRITE_URL);
  };
  img.src = SPRITE_URL;
}

// Fire the load immediately at module init so the sprite is warm by the time
// the first Kong instance is drawn.
if (typeof window !== 'undefined') {
  void loadSprite();
}

export class Kong {
  state: KongState = 'intro-ladder-extend';
  // Canvas-pixel position of Kong's *center-of-feet* anchor. x moves horizontally
  // along the girder; y is fixed on the ledge once climb finishes.
  x: number;
  y: number;
  facing: 1 | -1 = 1; // 1 = facing/moving right, -1 = left
  // Animation phase in ms since state entry. Used for climb progress, chest beat,
  // wind-up, throw release, and walk-cycle frame selection.
  stateElapsed = 0;
  // Rolling ms clock for walk-cycle animation (independent of state resets).
  walkClock = 0;

  // Pacing target and organic wander noise seeds. We update targetX at
  // unpredictable-but-bounded intervals so direction changes look natural.
  private targetX: number;
  private nextTargetChangeMs: number;
  // Base walk speed (px/sec). Kong's actual speed lerps toward this so
  // direction changes don't snap.
  private currentSpeed = 0;
  private readonly baseSpeed = 55; // px/sec — slow enough to read

  // Throw request lifecycle. Game calls requestThrow(kind); Kong sets
  // pendingKind and enters winding-up. When throw peaks, emitReady flips true
  // and the game consumes it via takeSpawnRequest().
  private pendingKind: PieceKind | null = null;
  private emitReady = false;
  // Column where the throw will land. Locked at wind-up start so the piece
  // spawns under Kong's *starting* hand position, not where he drifts during release.
  private throwColumn = 0;

  constructor(private cfg: KongConfig, private rng: () => number = Math.random) {
    this.x = cfg.ladderX;
    this.y = cfg.ladderBottomY;
    this.targetX = cfg.ledgeLeftX + (cfg.ledgeRightX - cfg.ledgeLeftX) * 0.5;
    this.nextTargetChangeMs = 1500;
  }

  /** Ask Kong to throw a piece. Ignored if he's already handling one or still in intro. */
  requestThrow(kind: PieceKind): void {
    if (this.pendingKind !== null) return;
    if (this.state === 'celebrating') return; // party's on, no more work
    if (this.isIntroState()) {
      // Queue the piece for after intro; enter windup as soon as pacing starts.
      this.pendingKind = kind;
      // Fresh throw: clear any leftover emit flag from the previous cycle so
      // the game loop doesn't immediately consume this queued piece the moment
      // pacing hands off to winding-up.
      this.emitReady = false;
      return;
    }
    this.pendingKind = kind;
    this.state = 'winding-up';
    this.stateElapsed = 0;
    this.throwColumn = this.computeSpawnColumn(kind);
    // Same reason as above: previous throw's emitReady flag might still be
    // true if takeSpawnRequest hasn't been polled yet. Reset explicitly so
    // the game doesn't consume this piece before its wind-up animation runs.
    this.emitReady = false;
  }

  /**
   * Switch Kong into permanent victory chest-beat mode. Cancels any pending
   * throw, clears the emit flag so no phantom piece appears, and locks him
   * into the celebrating state until the next `beginRun()` builds a fresh
   * Kong. The game calls this on game-over AND on victory — the monkey
   * always wins, regardless of what happens to the player.
   */
  startCelebration(): void {
    if (this.state === 'celebrating') return;
    this.pendingKind = null;
    this.emitReady = false;
    this.currentSpeed = 0;
    this.state = 'celebrating';
    this.stateElapsed = 0;
  }

  private isIntroState(): boolean {
    return (
      this.state === 'intro-ladder-extend' ||
      this.state === 'intro-climb' ||
      this.state === 'intro-ladder-retract' ||
      this.state === 'intro-chest'
    );
  }

  /**
   * Current visible ladder length in canvas pixels. Grows during extend,
   * stays at full during climb, shrinks to KONG_LADDER_STUB_PX during retract,
   * and remains at stub for the rest of the run.
   */
  ladderLengthPx(): number {
    const fullLength = this.cfg.ladderBottomY - this.cfg.ledgeY;
    switch (this.state) {
      case 'intro-ladder-extend': {
        // Ease-out: fast start, gentle landing when it "clangs" into place.
        const t = Math.min(1, this.stateElapsed / KONG_LADDER_EXTEND_MS);
        const eased = 1 - Math.pow(1 - t, 3);
        return KONG_LADDER_STUB_PX + (fullLength - KONG_LADDER_STUB_PX) * eased;
      }
      case 'intro-climb':
        return fullLength;
      case 'intro-ladder-retract': {
        // Ease-in: slow start then whip up.
        const t = Math.min(1, this.stateElapsed / KONG_LADDER_RETRACT_MS);
        const eased = Math.pow(t, 2);
        return fullLength - (fullLength - KONG_LADDER_STUB_PX) * eased;
      }
      default:
        return KONG_LADDER_STUB_PX;
    }
  }

  /** Returns and clears a pending spawn instruction, or null if none ready. */
  takeSpawnRequest(): { kind: PieceKind; column: number } | null {
    if (!this.emitReady || this.pendingKind === null) return null;
    const out = { kind: this.pendingKind, column: this.throwColumn };
    this.emitReady = false;
    this.pendingKind = null;
    return out;
  }

  update(dtMs: number): void {
    this.stateElapsed += dtMs;
    this.walkClock += dtMs;
    switch (this.state) {
      case 'intro-ladder-extend':
        this.updateIntroLadderExtend();
        break;
      case 'intro-climb':
        this.updateIntroClimb();
        break;
      case 'intro-ladder-retract':
        this.updateIntroLadderRetract();
        break;
      case 'intro-chest':
        this.updateIntroChest();
        break;
      case 'pacing':
        this.updatePacing(dtMs);
        // If a throw was queued during intro, kick off wind-up now.
        if (this.pendingKind !== null) {
          this.state = 'winding-up';
          this.stateElapsed = 0;
          this.throwColumn = this.computeSpawnColumn(this.pendingKind);
        }
        break;
      case 'winding-up':
        // Stand still during wind-up. Face the direction of the throw column
        // so the arm points naturally toward the target.
        if (this.stateElapsed >= KONG_WINDUP_MS) {
          this.state = 'throwing';
          this.stateElapsed = 0;
        }
        break;
      case 'throwing':
        if (!this.emitReady && this.stateElapsed >= KONG_THROW_MS * THROW_EMIT_FRACTION) {
          this.emitReady = true;
        }
        if (this.stateElapsed >= KONG_THROW_MS) {
          this.state = 'pacing';
          this.stateElapsed = 0;
        }
        break;
    }
  }

  private updateIntroLadderExtend(): void {
    // Kong stays parked at the ladder base (hidden from render) while the
    // ladder animates in. When extension completes, climbing begins.
    this.x = this.cfg.ladderX;
    this.y = this.cfg.ladderBottomY;
    if (this.stateElapsed >= KONG_LADDER_EXTEND_MS) {
      this.state = 'intro-climb';
      this.stateElapsed = 0;
    }
  }

  private updateIntroLadderRetract(): void {
    // Kong is on the girder while the ladder shrinks beneath him.
    this.x = this.cfg.ladderX;
    this.y = this.cfg.ledgeY;
    if (this.stateElapsed >= KONG_LADDER_RETRACT_MS) {
      this.state = 'intro-chest';
      this.stateElapsed = 0;
    }
  }

  private updateIntroClimb(): void {
    const t = Math.min(1, this.stateElapsed / KONG_INTRO_CLIMB_MS);
    // Ease-out so the last few rungs feel weighty.
    const eased = 1 - Math.pow(1 - t, 2);
    this.x = this.cfg.ladderX;
    this.y = this.cfg.ladderBottomY + (this.cfg.ledgeY - this.cfg.ladderBottomY) * eased;
    if (t >= 1) {
      this.state = 'intro-ladder-retract';
      this.stateElapsed = 0;
      this.y = this.cfg.ledgeY;
    }
  }

  private updateIntroChest(): void {
    if (this.stateElapsed >= KONG_INTRO_CHEST_MS) {
      this.state = 'pacing';
      this.stateElapsed = 0;
      // Pick an initial pacing target away from the ladder.
      this.pickNewTarget();
    }
  }

  private updatePacing(dtMs: number): void {
    // Smoothly lerp current speed toward target speed for organic accel/decel.
    const dir = Math.sign(this.targetX - this.x);
    if (dir !== 0) this.facing = dir as 1 | -1;
    const targetSpeed = this.baseSpeed * dir;
    // Simple exponential smoothing.
    const smoothing = Math.min(1, dtMs / 200);
    this.currentSpeed += (targetSpeed - this.currentSpeed) * smoothing;
    this.x += (this.currentSpeed * dtMs) / 1000;

    // Clamp to ledge bounds.
    if (this.x < this.cfg.ledgeLeftX) {
      this.x = this.cfg.ledgeLeftX;
      this.currentSpeed = 0;
      this.pickNewTarget();
    } else if (this.x > this.cfg.ledgeRightX) {
      this.x = this.cfg.ledgeRightX;
      this.currentSpeed = 0;
      this.pickNewTarget();
    }

    // Organic direction changes: pick a fresh target after a random interval,
    // even if we haven't reached the current one. This is what makes his path
    // feel unpredictable instead of ping-pong.
    this.nextTargetChangeMs -= dtMs;
    if (this.nextTargetChangeMs <= 0 || Math.abs(this.x - this.targetX) < 4) {
      this.pickNewTarget();
    }
  }

  private pickNewTarget(): void {
    const span = this.cfg.ledgeRightX - this.cfg.ledgeLeftX;
    const minDistance = span * 0.2;
    // Bias new target away from current position so Kong actually moves.
    // Bounded retries — a deterministic RNG stuck near Kong's x would spin
    // forever otherwise. If we can't find a good candidate, fall through with
    // whatever we last drew (Kong will pick a fresh target next interval).
    let candidate = this.cfg.ledgeLeftX + this.rng() * span;
    for (let attempts = 0; attempts < 6 && Math.abs(candidate - this.x) < minDistance; attempts++) {
      candidate = this.cfg.ledgeLeftX + this.rng() * span;
    }
    this.targetX = candidate;
    // Random interval 900–2200 ms — feels alive without being twitchy.
    this.nextTargetChangeMs = 900 + this.rng() * 1300;
  }

  /** Map Kong's canvas-x to a valid spawn column for the given piece kind. */
  spawnColumnFor(kind: PieceKind): number {
    return this.computeSpawnColumn(kind);
  }

  /** Map Kong's canvas-x to a valid spawn column for the given piece kind. */
  private computeSpawnColumn(kind: PieceKind): number {
    const boardX = this.cfg.ledgeLeftX; // ledge left edge is board left edge
    const rawCol = Math.round((this.x - boardX) / CELL) - 1; // -1 to roughly center piece
    const [minX, maxX] = spawnRangeX(kind);
    if (rawCol < minX) return minX;
    if (rawCol > maxX) return maxX;
    return rawCol;
  }

  // ---------------- rendering ----------------

  draw(ctx: CanvasRenderingContext2D): void {
    // Kong is off-stage while the ladder animates in — nothing to draw yet.
    if (this.state === 'intro-ladder-extend') return;
    // Sprite still loading (or load failed) — skip. Ladder + throw logic run
    // regardless, so gameplay isn't blocked on the asset.
    if (!cachedSprite) return;

    const sprite = cachedSprite;

    ctx.save();
    // Anchor is bottom-center (feet). Translate to top-left of bounding box.
    const originX = Math.round(this.x - KONG_WIDTH / 2);
    const originY = Math.round(this.y - KONG_HEIGHT);
    ctx.translate(originX + KONG_WIDTH / 2, originY + KONG_HEIGHT);

    // Facing flip.
    const facingScale = this.facing === -1 ? -1 : 1;

    // Per-state transforms — layered on top of the base sprite.
    let scaleX = 1;
    let scaleY = 1;
    let bobY = 0;
    let tiltRad = 0;

    switch (this.state) {
      case 'pacing': {
        // Subtle walk bob when Kong is actually moving.
        if (Math.abs(this.currentSpeed) > 5) {
          bobY = Math.sin(this.walkClock / 120) * 1.5;
        }
        break;
      }
      case 'intro-chest': {
        // Chest-beat pulse: brief horizontal squash every ~140ms.
        const beatPhase = (this.stateElapsed % 280) / 280;
        scaleX = 1 + Math.sin(beatPhase * Math.PI * 2) * 0.08;
        scaleY = 1 - Math.sin(beatPhase * Math.PI * 2) * 0.04;
        break;
      }
      case 'celebrating': {
        // Slightly bigger, faster chest-beat than the intro version — this
        // is the victory lap, not a warm-up. Adds a small vertical hop on
        // every beat so he looks like he's genuinely gloating.
        const beatPhase = (this.stateElapsed % 240) / 240;
        scaleX = 1 + Math.sin(beatPhase * Math.PI * 2) * 0.12;
        scaleY = 1 - Math.sin(beatPhase * Math.PI * 2) * 0.06;
        bobY = -Math.abs(Math.sin(beatPhase * Math.PI * 2)) * 4;
        break;
      }
      case 'intro-climb': {
        // Slight climb wobble as Kong ascends the ladder.
        tiltRad = Math.sin(this.stateElapsed / 220) * 0.06;
        break;
      }
      case 'winding-up': {
        // Lean back and up as Kong cocks the arm.
        const p = Math.min(1, this.stateElapsed / KONG_WINDUP_MS);
        tiltRad = -p * 0.18;
        break;
      }
      case 'throwing': {
        // Lean forward through the release, then relax.
        const p = Math.min(1, this.stateElapsed / KONG_THROW_MS);
        tiltRad = -0.18 + p * 0.35;
        break;
      }
      default:
        break;
    }

    ctx.translate(0, bobY);
    ctx.scale(facingScale * scaleX, scaleY);
    if (tiltRad !== 0) {
      // Rotate around Kong's feet so the tilt looks like a body lean, not a spin.
      ctx.translate(0, 0);
      ctx.rotate(tiltRad);
    }

    // Pick the current animation frame from the sprite sheet based on state.
    const frame = this.currentFrame();
    // Scale by the row's canonical height so different-width frames within a
    // row render at consistent size. Anchor at feet (dest y=0 after translate).
    const scale = KONG_HEIGHT / frame.rowH;
    const destW = frame.sw * scale;
    const destH = frame.sh * scale;
    ctx.drawImage(
      sprite,
      frame.sx,
      frame.sy,
      frame.sw,
      frame.sh,
      -destW / 2,
      -destH,
      destW,
      destH,
    );

    ctx.restore();

    // Note: the flying tetromino is rendered separately via drawThrownPiece()
    // so the renderer can call it after ALL other layers (top z-order),
    // guaranteeing the projectile is always visible in the well.
  }

  /**
   * Draw the in-flight tetromino during wind-up + throw. Called by the
   * renderer AFTER every other layer so the projectile sits at top z-order
   * and can never be occluded by particles, the girder, scanlines, etc.
   * No-op unless Kong is winding up or mid-throw before emit.
   */
  drawThrownPiece(ctx: CanvasRenderingContext2D): void {
    if (this.pendingKind === null) return;
    if (this.state !== 'winding-up' && this.state !== 'throwing') return;
    // Once the piece has been emitted onto the board, the real active piece
    // takes over; stop drawing the ghost projectile.
    if (this.state === 'throwing' && this.emitReady) return;

    const kind = this.pendingKind;
    const shape = SHAPES[kind][0];
    const color = PIECE_COLORS[kind] ?? '#ffffff';

    // Mini-cell size — piece is drawn smaller than a board cell so it reads
    // as a projectile in flight rather than a full grid block.
    const mini = Math.round(CELL * 0.55);
    // Bounding-box dims in mini-cells (max 4x4 for I; most fit in 3x3).
    let minX = 4, minY = 4, maxX = 0, maxY = 0;
    for (const c of shape) {
      if (c.x < minX) minX = c.x;
      if (c.y < minY) minY = c.y;
      if (c.x > maxX) maxX = c.x;
      if (c.y > maxY) maxY = c.y;
    }
    const bboxW = (maxX - minX + 1) * mini;
    const bboxH = (maxY - minY + 1) * mini;

    // Hand position (start of throw) — offset from Kong's feet toward his
    // facing direction, roughly at shoulder height.
    const handX = this.x + this.facing * KONG_WIDTH * 0.28;
    const handY = this.y - KONG_HEIGHT * 0.58;

    // Landing position (piece drop point) — center of the spawn column at
    // the very top of the board (just below the girder).
    const boardTopX = this.cfg.ledgeLeftX + (this.throwColumn + 1.5) * CELL;
    const boardTopY = this.cfg.ledgeY + CELL * 0.5;

    // ONE continuous progress value across wind-up + release-to-emit so the
    // piece moves monotonically from hand to board with no discontinuity at
    // the state boundary. Wind-up occupies [0..windupSpan) and the piece
    // stays parked in the hand; release fills [windupSpan..1] and arcs to
    // the board. Fast rotation + small overlays were the flicker culprit —
    // rotation is now clamped to a single quarter-turn and there is no
    // multi-frame wobble.
    const releaseSpan = KONG_THROW_MS * THROW_EMIT_FRACTION;
    const totalSpan = KONG_WINDUP_MS + releaseSpan;
    const elapsed = this.state === 'winding-up'
      ? this.stateElapsed
      : KONG_WINDUP_MS + this.stateElapsed;
    const g = Math.min(1, elapsed / totalSpan);
    const windupSpan = KONG_WINDUP_MS / totalSpan;

    let cx: number;
    let cy: number;
    let spin: number;
    if (g < windupSpan) {
      // Held steady in the hand. No wobble — it was reading as flicker on
      // a piece this small at 60fps.
      cx = handX;
      cy = handY;
      spin = 0;
    } else {
      // Release progress 0..1 mapped from the tail of the global timeline.
      const p = (g - windupSpan) / (1 - windupSpan);
      // Ease-out on horizontal (piece leaves fast then coasts), single arc
      // for vertical (slight lift on release, then falls to landing).
      const ex = 1 - Math.pow(1 - p, 2);
      cx = handX + (boardTopX - handX) * ex;
      const linearY = handY + (boardTopY - handY) * p;
      const arcLift = -Math.sin(p * Math.PI) * 14;
      cy = linearY + arcLift;
      // A single controlled quarter-turn across the arc, not multi-turn
      // spinning — spinning small blocks at 60fps looks like strobing.
      spin = p * (Math.PI * 0.5) * this.facing;
    }

    ctx.save();
    ctx.translate(cx, cy);
    if (spin !== 0) ctx.rotate(spin);

    // Draw the tetromino cells centered on the bounding box. No shadowBlur:
    // it was adding a fuzzy halo that shifted every frame with the rotation
    // and contributed to the flicker perception.
    const originX = -bboxW / 2 - minX * mini;
    const originY = -bboxH / 2 - minY * mini;
    ctx.fillStyle = color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    for (const c of shape) {
      const x = originX + c.x * mini;
      const y = originY + c.y * mini;
      ctx.fillRect(x, y, mini, mini);
      ctx.strokeRect(x + 0.5, y + 0.5, mini - 1, mini - 1);
    }

    ctx.restore();
  }

  /** Pick the sprite-sheet frame for the current state, cycling through
   *  multi-frame animations by state elapsed time. */
  private currentFrame(): FrameSpec {
    switch (this.state) {
      case 'pacing': {
        // Walk cycle when moving, idle frame when stopped.
        if (Math.abs(this.currentSpeed) > 5) {
          // 6 frames × 100ms each = ~1.6 cycles/sec. Matches ~55 px/sec pace.
          const idx = Math.floor(this.walkClock / 100) % F_WALK.length;
          return F_WALK[idx];
        }
        return F_IDLE[0];
      }
      case 'intro-climb': {
        // Reuse the walk cycle but slower — reads as ladder-climbing motion.
        const idx = Math.floor(this.stateElapsed / 180) % F_WALK.length;
        return F_WALK[idx];
      }
      case 'intro-ladder-retract':
        return F_IDLE[0];
      case 'intro-chest': {
        // Alternate between two chest-beat frames with different arm positions.
        const beatPhase = Math.floor(this.stateElapsed / 140) % 2;
        return F_CHEST[beatPhase];
      }
      case 'celebrating': {
        // Same two chest-beat frames, faster cycle — the victory version.
        const beatPhase = Math.floor(this.stateElapsed / 120) % 2;
        return F_CHEST[beatPhase];
      }
      case 'winding-up': {
        // First throw-prep frame — arms raising.
        return F_THROW[0];
      }
      case 'throwing': {
        // Hold a single release frame for the whole throw duration. Cycling
        // through multiple frames in <300ms reads as jitter, not motion, and
        // makes the sprite's baked-in projectile appear to jump around.
        return F_THROW[F_THROW.length - 1];
      }
      default:
        return F_IDLE[0];
    }
  }
}

/** Convenience: build Kong config from the board's rendered position. */
export function makeKongConfig(boardX: number, boardY: number): KongConfig {
  // Ledge spans the full board width. Kong's feet rest just above the board.
  // Ladder sits at the right edge (visual: he climbs up from the bottom-right).
  const ledgeY = boardY - 2; // 2px gap so sprite doesn't overlap grid line
  return {
    ledgeLeftX: boardX,
    ledgeRightX: boardX + BOARD_PX_W,
    ledgeY,
    ladderX: boardX + BOARD_PX_W - CELL,
    ladderBottomY: ledgeY + CELL * (COLS < 0 ? 0 : 4), // ladder rises 4 cells worth
  };
}
