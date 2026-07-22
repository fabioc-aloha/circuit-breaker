// CIRCUIT BREAKER — shared types

export type PieceKind = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
export type CellValue = 0 | PieceKind | 'G'; // 'G' = garbage

export type Rotation = 0 | 1 | 2 | 3;

export interface ActivePiece {
  kind: PieceKind;
  rotation: Rotation;
  x: number; // top-left origin in board coords
  y: number;
}

export interface Point {
  x: number;
  y: number;
}

export type GamePhase =
  | 'boot'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'cutscene'
  | 'victory'
  | 'gameover';

export type BossAttackKind = 'garbage' | 'spike' | 'blackout' | 'scramble';

export interface BossDef {
  id: string;
  name: string;
  hp: number;
  attackKinds: BossAttackKind[];
  attackIntervalMs: number;
  color: string;
  taunt: string;
  defeatQuote: string;
}

export interface ActiveBoss {
  def: BossDef;
  hp: number;
  maxHp: number;
  attackTimer: number; // ms until next attack
}

export interface EffectFlags {
  blackoutUntil: number; // performance.now() ms
  spikeUntil: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // 0..1
  color: string;
  size: number;
}

export interface CutsceneState {
  text: string[];
  timer: number; // ms remaining
}
