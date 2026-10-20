export function parseSeed(value: string): number | null {
  if (value.trim() === '') return null;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > 0xffffffff) {
    throw new RangeError('Seed must be a whole number from 0 to 4294967295.');
  }
  return Number(value);
}

export function newRunSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

/** Mulberry32 with a stable stream salt; cosmetic draws never share this state. */
export function seededRandom(seed: number, stream: string): () => number {
  let state = seed >>> 0;
  for (const char of stream) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
