// CIRCUIT BREAKER — board (grid + collisions + line clears)
import type { ActivePiece, CellValue, PieceKind, Rotation } from './types';
import { COLS, HIDDEN_ROWS, TOTAL_ROWS } from './constants';
import { cellsOf, kicksFor } from './piece';

export class Board {
  // grid[row][col]; row 0 = top; TOTAL_ROWS = ROWS + HIDDEN_ROWS
  grid: CellValue[][];

  constructor() {
    this.grid = Board.emptyGrid();
  }

  static emptyGrid(): CellValue[][] {
    return Array.from({ length: TOTAL_ROWS }, () => Array<CellValue>(COLS).fill(0));
  }

  reset(): void {
    this.grid = Board.emptyGrid();
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < COLS && y >= 0 && y < TOTAL_ROWS;
  }

  isEmpty(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    return this.grid[y][x] === 0;
  }

  /** Check if a piece would collide at its current pose. */
  collides(piece: ActivePiece): boolean {
    for (const c of cellsOf(piece)) {
      if (c.x < 0 || c.x >= COLS) return true;
      if (c.y >= TOTAL_ROWS) return true;
      if (c.y >= 0 && this.grid[c.y][c.x] !== 0) return true;
    }
    return false;
  }

  collidesAt(piece: ActivePiece, x: number, y: number, rot: Rotation): boolean {
    const test: ActivePiece = { ...piece, x, y, rotation: rot };
    return this.collides(test);
  }

  /** Try to move by (dx, dy). Returns true on success and mutates piece. */
  tryMove(piece: ActivePiece, dx: number, dy: number): boolean {
    const nx = piece.x + dx;
    const ny = piece.y + dy;
    if (!this.collidesAt(piece, nx, ny, piece.rotation)) {
      piece.x = nx;
      piece.y = ny;
      return true;
    }
    return false;
  }

  /** Try to rotate with SRS kicks. Returns true on success. */
  tryRotate(piece: ActivePiece, dir: 1 | -1): boolean {
    const from = piece.rotation;
    const to = (((piece.rotation + dir) % 4) + 4) % 4 as Rotation;
    const kicks = kicksFor(piece.kind, from, to);
    for (const k of kicks) {
      const nx = piece.x + k.x;
      const ny = piece.y + k.y;
      if (!this.collidesAt(piece, nx, ny, to)) {
        piece.x = nx;
        piece.y = ny;
        piece.rotation = to;
        return true;
      }
    }
    return false;
  }

  /** Drop by 1 row. Returns false if it locked (couldn't move). */
  softDrop(piece: ActivePiece): boolean {
    return this.tryMove(piece, 0, 1);
  }

  /** Compute how many rows a hard drop would travel. */
  hardDropDistance(piece: ActivePiece): number {
    let d = 0;
    while (!this.collidesAt(piece, piece.x, piece.y + d + 1, piece.rotation)) d++;
    return d;
  }

  /** Lock piece into the grid using its color kind. */
  lock(piece: ActivePiece): void {
    for (const c of cellsOf(piece)) {
      if (c.y >= 0 && c.y < TOTAL_ROWS && c.x >= 0 && c.x < COLS) {
        this.grid[c.y][c.x] = piece.kind as PieceKind;
      }
    }
  }

  /** Ghost piece position (drop preview). */
  ghostFor(piece: ActivePiece): ActivePiece {
    const dist = this.hardDropDistance(piece);
    return { ...piece, y: piece.y + dist };
  }

  /** Detect and clear full lines. Returns cleared row indices (top->bottom order). */
  clearLines(): number[] {
    const cleared: number[] = [];
    for (let y = 0; y < TOTAL_ROWS; y++) {
      if (this.grid[y].every((v) => v !== 0)) cleared.push(y);
    }
    if (cleared.length === 0) return cleared;
    // Remove cleared rows and prepend empty ones so the stack falls.
    const kept = this.grid.filter((_, y) => !cleared.includes(y));
    while (kept.length < TOTAL_ROWS) kept.unshift(Array<CellValue>(COLS).fill(0));
    this.grid = kept;
    return cleared;
  }

  /** Rise N garbage rows from the bottom with a random hole column. */
  addGarbage(rows: number, holeCol?: number): boolean {
    let displacedBlocks = false;
    for (let i = 0; i < rows; i++) {
      if (this.grid[0].some((value) => value !== 0)) displacedBlocks = true;
      const hole = holeCol ?? Math.floor(Math.random() * COLS);
      const row: CellValue[] = Array<CellValue>(COLS).fill('G');
      row[hole] = 0;
      this.grid.push(row);
      this.grid.shift();
    }
    return displacedBlocks;
  }

  /** Swap two columns (FEEDBACK LOOP attack). */
  scrambleColumns(a: number, b: number): void {
    if (a === b) return;
    for (let y = 0; y < TOTAL_ROWS; y++) {
      const tmp = this.grid[y][a];
      this.grid[y][a] = this.grid[y][b];
      this.grid[y][b] = tmp;
    }
  }

  /** True if any cell in hidden rows is filled (topped out). */
  isToppedOut(): boolean {
    for (let y = 0; y < HIDDEN_ROWS; y++) {
      for (let x = 0; x < COLS; x++) if (this.grid[y][x] !== 0) return true;
    }
    return false;
  }
}
