import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const moduleCache = new Map();

function loadTypeScriptModule(filePath) {
  const resolvedPath = path.resolve(filePath);
  const cached = moduleCache.get(resolvedPath);
  if (cached) return cached.exports;
  const module = { exports: {} };
  moduleCache.set(resolvedPath, module);
  const source = fs.readFileSync(resolvedPath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const require = (specifier) => {
    if (!specifier.startsWith('.')) throw new Error(`Unsupported import: ${specifier}`);
    return loadTypeScriptModule(path.resolve(path.dirname(resolvedPath), `${specifier}.ts`));
  };
  new Function('exports', 'require', 'module', output)(module.exports, require, module);
  return module.exports;
}

const {
  Kong,
  makeKongConfig,
  KONG_LADDER_EXTEND_MS,
  KONG_INTRO_CLIMB_MS,
  KONG_LADDER_RETRACT_MS,
  KONG_INTRO_CHEST_MS,
  KONG_WINDUP_MS,
  KONG_THROW_MS,
  KONG_LADDER_STUB_PX,
} = loadTypeScriptModule(path.join(root, 'src/kong.ts'));
const { spawnRangeX, spawnPiece } = loadTypeScriptModule(path.join(root, 'src/piece.ts'));
const { COLS, CELL } = loadTypeScriptModule(path.join(root, 'src/constants.ts'));

// Deterministic RNG helper — fixed sequence so pacing behavior is reproducible.
function seq(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

// Walk Kong through every intro state so tests can start from 'pacing'.
// Each update advances at most one state, so we need one call per phase.
function skipIntro(kong) {
  kong.update(KONG_LADDER_EXTEND_MS + 10);
  kong.update(KONG_INTRO_CLIMB_MS + 10);
  kong.update(KONG_LADDER_RETRACT_MS + 10);
  kong.update(KONG_INTRO_CHEST_MS + 10);
}

test('spawnRangeX keeps all cells on-board for every piece', () => {
  for (const kind of ['I', 'O', 'T', 'S', 'Z', 'J', 'L']) {
    const [minX, maxX] = spawnRangeX(kind);
    // Piece at minX and maxX must produce cells all within [0, COLS-1].
    for (const testX of [minX, maxX]) {
      const p = spawnPiece(kind, testX);
      assert.equal(p.x, testX, `${kind} at ${testX}: spawnPiece should honor override`);
    }
  }
  // Sanity: I-piece has widest bbox so its range is tightest.
  const [iMin, iMax] = spawnRangeX('I');
  assert.equal(iMin, 0);
  assert.equal(iMax, COLS - 4); // = 6 for 10-wide board
});

test('spawnPiece clamps out-of-range xOverride into legal spawn range', () => {
  // I-piece can't spawn at column -5 or column 20.
  const clampedLow = spawnPiece('I', -5);
  assert.equal(clampedLow.x, 0);
  const clampedHigh = spawnPiece('I', 20);
  assert.equal(clampedHigh.x, COLS - 4);
});

test('Kong intro walks ladder-extend → climb → ladder-retract → chest → pacing', () => {
  const cfg = makeKongConfig(100, 100);
  const kong = new Kong(cfg, seq([0.3, 0.7, 0.2]));
  assert.equal(kong.state, 'intro-ladder-extend');
  kong.update(KONG_LADDER_EXTEND_MS + 10);
  assert.equal(kong.state, 'intro-climb');
  kong.update(KONG_INTRO_CLIMB_MS + 10);
  assert.equal(kong.state, 'intro-ladder-retract');
  kong.update(KONG_LADDER_RETRACT_MS + 10);
  assert.equal(kong.state, 'intro-chest');
  kong.update(KONG_INTRO_CHEST_MS + 10);
  assert.equal(kong.state, 'pacing');
});

test('Kong ladder length grows during extend and shrinks to stub during retract', () => {
  const cfg = makeKongConfig(100, 100);
  const kong = new Kong(cfg, seq([0.5]));
  const fullLength = cfg.ladderBottomY - cfg.ledgeY;
  // At the start of extend the ladder is at the stub minimum.
  const startLen = kong.ladderLengthPx();
  assert.ok(startLen < fullLength * 0.5, `expected stub at start, got ${startLen}`);
  // Halfway through extend it should be much longer than the stub.
  kong.update(KONG_LADDER_EXTEND_MS / 2);
  const midLen = kong.ladderLengthPx();
  assert.ok(midLen > startLen + 20, `expected growth mid-extend (${startLen} → ${midLen})`);
  // Extend done → full length during climb.
  kong.update(KONG_LADDER_EXTEND_MS / 2 + 10);
  assert.equal(kong.state, 'intro-climb');
  assert.equal(kong.ladderLengthPx(), fullLength);
  // Skip climb, into retract.
  kong.update(KONG_INTRO_CLIMB_MS + 10);
  assert.equal(kong.state, 'intro-ladder-retract');
  assert.equal(kong.ladderLengthPx(), fullLength);
  // Mid-retract length should be dropping.
  kong.update(KONG_LADDER_RETRACT_MS / 2);
  const retractMid = kong.ladderLengthPx();
  assert.ok(retractMid < fullLength, `expected shrinkage mid-retract (${retractMid} vs full ${fullLength})`);
  // Retract done → stub only, and it stays a stub during chest and pacing.
  kong.update(KONG_LADDER_RETRACT_MS / 2 + 10);
  assert.equal(kong.state, 'intro-chest');
  assert.equal(kong.ladderLengthPx(), KONG_LADDER_STUB_PX);
  kong.update(KONG_INTRO_CHEST_MS + 10);
  assert.equal(kong.state, 'pacing');
  assert.equal(kong.ladderLengthPx(), KONG_LADDER_STUB_PX);
});

test('Kong queues throw requests during intro and releases after pacing begins', () => {
  const cfg = makeKongConfig(100, 100);
  const kong = new Kong(cfg, seq([0.5, 0.5, 0.5]));
  // Request during ladder-extend — should be queued, not started.
  kong.requestThrow('T');
  assert.equal(kong.state, 'intro-ladder-extend');
  // Skip through every intro state.
  skipIntro(kong);
  // Next update should transition pacing → winding-up because of queued piece.
  kong.update(16);
  assert.equal(kong.state, 'winding-up');
  // Advance through wind-up and mid-throw — emit should fire.
  kong.update(KONG_WINDUP_MS + 10);
  assert.equal(kong.state, 'throwing');
  kong.update(KONG_THROW_MS * 0.7 + 5);
  const out = kong.takeSpawnRequest();
  assert.ok(out, 'spawn request should be ready after throw peak');
  assert.equal(out.kind, 'T');
  assert.ok(typeof out.column === 'number');
});

test('Kong takeSpawnRequest returns null before emit and only fires once', () => {
  const cfg = makeKongConfig(100, 100);
  const kong = new Kong(cfg, seq([0.5]));
  skipIntro(kong);
  assert.equal(kong.state, 'pacing');
  kong.requestThrow('O');
  assert.equal(kong.takeSpawnRequest(), null);
  // Advance through wind-up, then past the throw emit point.
  kong.update(KONG_WINDUP_MS + 10);
  assert.equal(kong.state, 'throwing');
  kong.update(KONG_THROW_MS * 0.7 + 5);
  const first = kong.takeSpawnRequest();
  assert.ok(first);
  // Second call should not re-emit.
  assert.equal(kong.takeSpawnRequest(), null);
});

test('Kong spawnColumnFor clamps I-piece at ledge edges to legal columns', () => {
  const boardX = 100;
  const cfg = makeKongConfig(boardX, 100);
  const kong = new Kong(cfg, seq([0.5]));
  // Force Kong to leftmost ledge position.
  kong.x = cfg.ledgeLeftX;
  const leftCol = kong.spawnColumnFor('I');
  const [iMin, iMax] = spawnRangeX('I');
  assert.ok(leftCol >= iMin && leftCol <= iMax, `I-piece column ${leftCol} out of range [${iMin},${iMax}]`);
  // Force Kong to rightmost ledge position.
  kong.x = cfg.ledgeRightX;
  const rightCol = kong.spawnColumnFor('I');
  assert.ok(rightCol >= iMin && rightCol <= iMax, `I-piece column ${rightCol} out of range [${iMin},${iMax}]`);
  // Right edge should place I-piece at maxX (rightmost legal position).
  assert.equal(rightCol, iMax);
});

test('Kong pacing keeps x within ledge bounds', () => {
  const cfg = makeKongConfig(100, 100);
  // RNG that always picks extreme targets — Kong should still clamp.
  const kong = new Kong(cfg, seq([0.99, 0.01, 0.99, 0.01, 0.5]));
  skipIntro(kong);
  // Simulate 5 seconds of pacing in 16ms steps.
  for (let t = 0; t < 5000; t += 16) {
    kong.update(16);
    assert.ok(
      kong.x >= cfg.ledgeLeftX - 0.01 && kong.x <= cfg.ledgeRightX + 0.01,
      `Kong x=${kong.x} escaped bounds [${cfg.ledgeLeftX}, ${cfg.ledgeRightX}]`,
    );
  }
});

test('Kong facing flips based on pacing direction', () => {
  const cfg = makeKongConfig(100, 100);
  // Vary RNG so pickNewTarget produces targets on both sides of Kong.
  const kong = new Kong(cfg, seq([0.1, 0.9, 0.2, 0.8, 0.05, 0.95]));
  skipIntro(kong);
  let sawLeft = false;
  let sawRight = false;
  for (let t = 0; t < 8000; t += 16) {
    kong.update(16);
    if (kong.facing === -1) sawLeft = true;
    if (kong.facing === 1) sawRight = true;
    if (sawLeft && sawRight) break;
  }
  assert.ok(sawLeft && sawRight, 'Kong should face both directions during extended pacing');
});
