// CIRCUIT BREAKER — tetrominoes + SRS rotation system
import { COLS, HIDDEN_ROWS } from './constants';
import type { ActivePiece, PieceKind, Point, Rotation } from './types';

// Piece shapes at rotation 0 as offsets from piece origin (top-left of bounding box)
// SRS reference: https://tetris.wiki/Super_Rotation_System
// We store all 4 rotation states explicitly for clarity.
type ShapeStates = [Point[], Point[], Point[], Point[]];

const P = (x: number, y: number): Point => ({ x, y });

export const SHAPES: Record<PieceKind, ShapeStates> = {
  // I piece uses a 4x4 bounding box in SRS
  I: [
    [P(0, 1), P(1, 1), P(2, 1), P(3, 1)],
    [P(2, 0), P(2, 1), P(2, 2), P(2, 3)],
    [P(0, 2), P(1, 2), P(2, 2), P(3, 2)],
    [P(1, 0), P(1, 1), P(1, 2), P(1, 3)],
  ],
  O: [
    [P(1, 0), P(2, 0), P(1, 1), P(2, 1)],
    [P(1, 0), P(2, 0), P(1, 1), P(2, 1)],
    [P(1, 0), P(2, 0), P(1, 1), P(2, 1)],
    [P(1, 0), P(2, 0), P(1, 1), P(2, 1)],
  ],
  T: [
    [P(1, 0), P(0, 1), P(1, 1), P(2, 1)],
    [P(1, 0), P(1, 1), P(2, 1), P(1, 2)],
    [P(0, 1), P(1, 1), P(2, 1), P(1, 2)],
    [P(1, 0), P(0, 1), P(1, 1), P(1, 2)],
  ],
  S: [
    [P(1, 0), P(2, 0), P(0, 1), P(1, 1)],
    [P(1, 0), P(1, 1), P(2, 1), P(2, 2)],
    [P(1, 1), P(2, 1), P(0, 2), P(1, 2)],
    [P(0, 0), P(0, 1), P(1, 1), P(1, 2)],
  ],
  Z: [
    [P(0, 0), P(1, 0), P(1, 1), P(2, 1)],
    [P(2, 0), P(1, 1), P(2, 1), P(1, 2)],
    [P(0, 1), P(1, 1), P(1, 2), P(2, 2)],
    [P(1, 0), P(0, 1), P(1, 1), P(0, 2)],
  ],
  J: [
    [P(0, 0), P(0, 1), P(1, 1), P(2, 1)],
    [P(1, 0), P(2, 0), P(1, 1), P(1, 2)],
    [P(0, 1), P(1, 1), P(2, 1), P(2, 2)],
    [P(1, 0), P(1, 1), P(0, 2), P(1, 2)],
  ],
  L: [
    [P(2, 0), P(0, 1), P(1, 1), P(2, 1)],
    [P(1, 0), P(1, 1), P(1, 2), P(2, 2)],
    [P(0, 1), P(1, 1), P(2, 1), P(0, 2)],
    [P(0, 0), P(1, 0), P(1, 1), P(1, 2)],
  ],
};

// SRS wall-kick data. Offsets are [dx, dy] to try in order, board convention.
// Note: in SRS the y-axis is inverted (up positive), but our board has y+ = down.
// We negate y when applying kicks.
const KICKS_JLSTZ: Record<string, Point[]> = {
  '0->1': [P(0, 0), P(-1, 0), P(-1, 1), P(0, -2), P(-1, -2)],
  '1->0': [P(0, 0), P(1, 0), P(1, -1), P(0, 2), P(1, 2)],
  '1->2': [P(0, 0), P(1, 0), P(1, -1), P(0, 2), P(1, 2)],
  '2->1': [P(0, 0), P(-1, 0), P(-1, 1), P(0, -2), P(-1, -2)],
  '2->3': [P(0, 0), P(1, 0), P(1, 1), P(0, -2), P(1, -2)],
  '3->2': [P(0, 0), P(-1, 0), P(-1, -1), P(0, 2), P(-1, 2)],
  '3->0': [P(0, 0), P(-1, 0), P(-1, -1), P(0, 2), P(-1, 2)],
  '0->3': [P(0, 0), P(1, 0), P(1, 1), P(0, -2), P(1, -2)],
};

const KICKS_I: Record<string, Point[]> = {
  '0->1': [P(0, 0), P(-2, 0), P(1, 0), P(-2, -1), P(1, 2)],
  '1->0': [P(0, 0), P(2, 0), P(-1, 0), P(2, 1), P(-1, -2)],
  '1->2': [P(0, 0), P(-1, 0), P(2, 0), P(-1, 2), P(2, -1)],
  '2->1': [P(0, 0), P(1, 0), P(-2, 0), P(1, -2), P(-2, 1)],
  '2->3': [P(0, 0), P(2, 0), P(-1, 0), P(2, 1), P(-1, -2)],
  '3->2': [P(0, 0), P(-2, 0), P(1, 0), P(-2, -1), P(1, 2)],
  '3->0': [P(0, 0), P(1, 0), P(-2, 0), P(1, -2), P(-2, 1)],
  '0->3': [P(0, 0), P(-1, 0), P(2, 0), P(-1, 2), P(2, -1)],
};

export function cellsOf(piece: ActivePiece): Point[] {
  const shape = SHAPES[piece.kind][piece.rotation];
  return shape.map((c) => P(piece.x + c.x, piece.y + c.y));
}

export function cellsAtRotation(piece: ActivePiece, rot: Rotation): Point[] {
  const shape = SHAPES[piece.kind][rot];
  return shape.map((c) => P(piece.x + c.x, piece.y + c.y));
}

/** Get wall-kick offsets to try, converting SRS (y+ = up) to board (y+ = down). */
export function kicksFor(kind: PieceKind, from: Rotation, to: Rotation): Point[] {
  if (kind === 'O') return [P(0, 0)];
  const table = kind === 'I' ? KICKS_I : KICKS_JLSTZ;
  const key = `${from}->${to}`;
  const kicks = table[key];
  if (!kicks) return [P(0, 0)];
  // Negate y for board coord system
  return kicks.map((k) => P(k.x, -k.y));
}

export function spawnPiece(kind: PieceKind, xOverride?: number): ActivePiece {
  // Spawn horizontally centered in the hidden rows so I fits properly.
  const spawnY = HIDDEN_ROWS - 2; // pieces begin partially in hidden area
  const defaultX = Math.floor((COLS - 4) / 2); // 3 for 10-wide board
  const spawnX = xOverride !== undefined ? clampSpawnX(kind, xOverride) : defaultX;
  return { kind, rotation: 0, x: spawnX, y: spawnY };
}

/**
 * Returns [minX, maxX] — the inclusive range of piece.x values that keep every
 * cell of the piece (at rotation 0) inside the board horizontally.
 */
export function spawnRangeX(kind: PieceKind): [number, number] {
  const shape = SHAPES[kind][0];
  let minCell = Infinity;
  let maxCell = -Infinity;
  for (const c of shape) {
    if (c.x < minCell) minCell = c.x;
    if (c.x > maxCell) maxCell = c.x;
  }
  // `+ 0` normalizes negative zero to positive zero so callers/tests using
  // Object.is-style equality don't trip on `-0 !== 0`.
  return [-minCell + 0, COLS - 1 - maxCell];
}

function clampSpawnX(kind: PieceKind, x: number): number {
  const [minX, maxX] = spawnRangeX(kind);
  if (x < minX) return minX;
  if (x > maxX) return maxX;
  return x;
}

/** 7-bag randomizer. */
export class Bag {
  private queue: PieceKind[] = [];
  constructor(private rng: () => number = Math.random) {}
  next(): PieceKind {
    if (this.queue.length === 0) this.refill();
    return this.queue.shift()!;
  }
  peek(n: number): PieceKind[] {
    while (this.queue.length < n) this.refill();
    return this.queue.slice(0, n);
  }
  private refill(): void {
    const bag: PieceKind[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
    // Fisher-Yates
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    this.queue.push(...bag);
  }
}
