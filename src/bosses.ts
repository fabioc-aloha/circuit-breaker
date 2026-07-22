// CIRCUIT BREAKER — boss roster
import type { ActiveBoss, BossDef } from './types';

export type BossSilhouette = 'bolt' | 'eclipse' | 'fuse' | 'loop' | 'core';

export const BOSSES: BossDef[] = [
  {
    id: 'surge',
    name: 'SURGE.exe',
    hp: 25,
    attackKinds: ['spike'],
    attackIntervalMs: 10000,
    color: '#ffe600',
    taunt: 'FEEL THE CURRENT.',
    defeatQuote: 'BREAKER... TRIPPED.',
  },
  {
    id: 'blackout',
    name: 'BLACKOUT',
    hp: 35,
    attackKinds: ['blackout'],
    attackIntervalMs: 11000,
    color: '#a970ff',
    taunt: 'LIGHTS OUT, RUNNER.',
    defeatQuote: 'SIGNAL... RESTORED.',
  },
  {
    id: 'shortfuse',
    name: 'SHORTFUSE',
    hp: 50,
    attackKinds: ['garbage'],
    attackIntervalMs: 9000,
    color: '#ff9a1f',
    taunt: 'BLOW A FUSE.',
    defeatQuote: 'FUSES... HOLDING.',
  },
  {
    id: 'feedback',
    name: 'FEEDBACK LOOP',
    hp: 65,
    attackKinds: ['scramble', 'garbage'],
    attackIntervalMs: 8500,
    color: '#00f0ff',
    taunt: 'REROUTING... EVERYTHING.',
    defeatQuote: 'CHANNELS... CLEAR.',
  },
  {
    id: 'mainframe',
    name: 'THE MAINFRAME',
    hp: 100,
    attackKinds: ['garbage', 'spike', 'blackout', 'scramble'],
    attackIntervalMs: 7000,
    color: '#ff2bd6',
    taunt: 'I AM THE GRID.',
    defeatQuote: 'GRID... OFFLINE.',
  },
];

export function makeActiveBoss(def: BossDef): ActiveBoss {
  return { def, hp: def.hp, maxHp: def.hp, attackTimer: def.attackIntervalMs };
}

export function bossSilhouetteFor(id: string): BossSilhouette {
  switch (id) {
    case 'surge':
      return 'bolt';
    case 'blackout':
      return 'eclipse';
    case 'shortfuse':
      return 'fuse';
    case 'feedback':
      return 'loop';
    case 'mainframe':
      return 'core';
    default:
      throw new Error(`Unknown boss silhouette: ${id}`);
  }
}
