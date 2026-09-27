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

const { Game } = loadTypeScriptModule(path.join(root, 'src', 'game.ts'));
const { EffectsManager, gameOverWraithPosition } = loadTypeScriptModule(path.join(root, 'src', 'effects.ts'));
const { BOSSES, bossSilhouetteFor } = loadTypeScriptModule(path.join(root, 'src', 'bosses.ts'));
const { volumeFromPercent } = loadTypeScriptModule(path.join(root, 'src', 'audio', 'audio.ts'));
const { frameDelta } = loadTypeScriptModule(path.join(root, 'src', 'frame-timing.ts'));
const {
  ATTACK_WARNING_MS,
  DANGER_ROWS_FROM_TOP,
  HIDDEN_ROWS,
  LOCK_RESET_LIMIT,
} = loadTypeScriptModule(path.join(root, 'src', 'constants.ts'));

function createGame(opts) {
  return createGameWithEffects(opts).game;
}

function createGameWithEffects(opts) {
  const effects = {
    breakerRuns: 0,
    breakerY: null,
    breakerSize: null,
    wraithRuns: 0,
    flash() {},
    shake() {},
    spawnLineBurst() {},
    showAnnouncement() {},
    spawnGameOverWraith() {
      this.wraithRuns += 1;
    },
    spawnBreakerPacman(_startX, y, _endX, _color, size) {
      this.breakerRuns += 1;
      this.breakerY = y;
      this.breakerSize = size;
    },
    spawnPacman() {},
    spawnSpark() {},
  };
  const sfx = {
    alarm() {},
    dangerTick() {},
    fanfare() {},
    gameOver() {},
    hardDrop() {},
    hold() {},
    lineClear() {},
    lock() {},
    move() {},
    rotate() {},
    softDropTick() {},
    tetrisBoom() {},
    uiBlip() {},
  };
  const music = { setMode() {} };
  return { game: new Game(effects, sfx, music, () => {}, opts), effects };
}

test('creates and expires a transient lightning bolt', () => {
  const effects = new EffectsManager();

  effects.spawnLightning(0, 0, 100, 80);

  assert.equal(effects.lightning.length, 1);
  assert.deepEqual(effects.lightning[0].points[0], { x: 0, y: 0 });
  assert.deepEqual(effects.lightning[0].points.at(-1), { x: 100, y: 80 });

  effects.update(1_000);

  assert.equal(effects.lightning.length, 0);
});

test('caps particle bursts to protect the render loop', () => {
  const effects = new EffectsManager();

  effects.spawnLineBurst(400, 320, 300, '#00f0ff', 1_000);

  assert.equal(effects.particles.length, 600);
});

test('keeps a newly scheduled ambient lightning bolt for at least one frame', () => {
  const effects = new EffectsManager();

  effects.update(2_800, 800, 720);

  assert.equal(effects.lightning.length, 1);
});

test('shows and expires the four-line-clear announcement', () => {
  const effects = new EffectsManager();

  effects.showAnnouncement('MAIN BREAKER TRIPPED', 'FOUR-LINE OVERLOAD', 900);

  assert.deepEqual(effects.currentAnnouncement(), {
    title: 'MAIN BREAKER TRIPPED',
    subtitle: 'FOUR-LINE OVERLOAD',
    remainingMs: 900,
    durationMs: 900,
  });

  effects.update(900);

  assert.equal(effects.currentAnnouncement(), null);
});

test('spawns and expires the game-over Grid Wraith', () => {
  const effects = new EffectsManager();

  effects.spawnGameOverWraith(400, 320, 76, 1_800);

  assert.deepEqual(effects.currentGameOverWraith(), {
    centerX: 400,
    centerY: 320,
    size: 76,
    remainingMs: 1_800,
    durationMs: 1_800,
  });

  effects.update(1_800);

  assert.equal(effects.currentGameOverWraith(), null);
});

test('moves the game-over Grid Wraith around the board center', () => {
  const wraith = {
    centerX: 400,
    centerY: 320,
    size: 76,
    remainingMs: 1_800,
    durationMs: 1_800,
  };

  const firstPosition = gameOverWraithPosition(wraith, 0);
  const laterPosition = gameOverWraithPosition(wraith, 900);

  assert.notDeepEqual(firstPosition, laterPosition);
  assert.ok(Math.abs(firstPosition.x - wraith.centerX) <= 105);
  assert.ok(Math.abs(firstPosition.y - wraith.centerY) <= 210);
  assert.ok(Math.abs(laterPosition.x - wraith.centerX) <= 105);
  assert.ok(Math.abs(laterPosition.y - wraith.centerY) <= 210);
});

test('creates an oversized breaker Pacman for a Tetris', () => {
  const effects = new EffectsManager();

  effects.spawnBreakerPacman(0, 300, 400, '#ffe600', 48);

  assert.equal(effects.pacmen.length, 1);
  assert.equal(effects.pacmen[0].variant, 'breaker');
  assert.equal(effects.pacmen[0].size, 48);
  assert.equal(effects.lightning.length, 3);
  assert.deepEqual(effects.lightning.map((bolt) => bolt.foreground), [true, true, true]);
  assert.deepEqual(effects.lightning.map((bolt) => bolt.color), ['#ffe600', '#00f0ff', '#ff2bd6']);
});

test('assigns each boss a distinct HUD silhouette', () => {
  const silhouettes = BOSSES.map((boss) => bossSilhouetteFor(boss.id));

  assert.equal(new Set(silhouettes).size, BOSSES.length);
});

test('normalizes mixer slider values into persisted audio volumes', () => {
  assert.equal(volumeFromPercent('0'), 0);
  assert.equal(volumeFromPercent('45'), 0.45);
  assert.equal(volumeFromPercent('100'), 1);
  assert.equal(volumeFromPercent('240'), 1);
  assert.equal(volumeFromPercent('invalid'), 0);
});

test('does not advance gameplay before the boot overlay is dismissed', () => {
  const game = createGame();

  game.update(10_000);

  assert.equal(game.phase, 'ready');
  assert.equal(game.active, null);
});

test('advances gravity when a frame delivers more than one row of elapsed time', () => {
  const game = createGame();
  game.beginRun();
  // Kong defers the first piece until his throw animation releases. Seed a piece
  // directly so the gravity test can measure a single-tick drop.
  game.active = { kind: 'T', rotation: 0, x: 3, y: 0 };
  const startingY = game.active.y;

  // Level 1 gravity is 1000 ms; a 1050 ms tick must produce exactly one drop.
  game.update(1_050);

  assert.equal(game.active.y, startingY + 1);
});

test('frameDelta preserves elapsed time and clamps clock skew and pathological stalls', () => {
  assert.equal(frameDelta(1_050, 1_000), 50);
  assert.equal(frameDelta(500, 500), 0);
  assert.equal(frameDelta(0, 500), 0);
  assert.equal(frameDelta(10_000, 0), 750);
});

test('raises the active piece with a garbage attack', () => {
  const game = createGame();
  game.beginRun();
  game.active = { kind: 'T', rotation: 0, x: 3, y: 10 };
  const originalRandom = Math.random;
  Math.random = () => 0;

  try {
    game.executeAttack('garbage');
  } finally {
    Math.random = originalRandom;
  }

  assert.equal(game.active.y, 9);
});

test('allows garbage attacks to raise four rows', () => {
  const game = createGame();
  game.beginRun();
  game.active = { kind: 'T', rotation: 0, x: 3, y: 10 };
  const originalRandom = Math.random;
  Math.random = () => 0.99;

  try {
    game.executeAttack('garbage');
  } finally {
    Math.random = originalRandom;
  }

  assert.equal(game.active.y, 6);
});

test('replaces row Pacmen with one breaker Pacman for a four-line clear', () => {
  const { game, effects } = createGameWithEffects();
  game.beginRun();
  game.active = { kind: 'I', rotation: 1, x: 3, y: 18 };
  for (let row = 18; row <= 21; row++) {
    game.board.grid[row].fill('J');
    game.board.grid[row][5] = 0;
  }

  game.lockAndAdvance();

  assert.equal(effects.breakerRuns, 1);
  // Board origin shifted down by KONG_LEDGE_H (112) to make room for Kong's girder.
  assert.equal(effects.breakerY, 672);
  assert.equal(effects.breakerSize, 60);
});

test('advances voltage tier every LINES_PER_LEVEL line clears', () => {
  const game = createGame();
  game.beginRun();
  game.lines = 9;
  game.active = { kind: 'I', rotation: 0, x: 3, y: 20 };
  game.board.grid[21] = ['J', 'J', 'J', 0, 0, 0, 0, 'J', 'J', 'J'];

  game.lockAndAdvance();

  assert.equal(game.lines, 10);
  assert.equal(game.level, 2);
});

test('holds voltage tier when a clear does not cross the tier threshold', () => {
  const game = createGame();
  game.beginRun();
  game.lines = 3;
  game.active = { kind: 'I', rotation: 0, x: 3, y: 20 };
  game.board.grid[21] = ['J', 'J', 'J', 0, 0, 0, 0, 'J', 'J', 'J'];

  game.lockAndAdvance();

  assert.equal(game.lines, 4);
  assert.equal(game.level, 1);
});

test('increases voltage tier after defeating a boss', () => {
  const game = createGame();
  game.beginRun();
  game.boss.hp = 1;
  game.active = { kind: 'I', rotation: 1, x: 3, y: 18 };
  for (let row = 18; row <= 21; row++) {
    game.board.grid[row].fill('J');
    game.board.grid[row][5] = 0;
  }

  game.lockAndAdvance();

  assert.equal(game.level, 2);
});

test('flushes a pending line-clear before applying a garbage attack', () => {
  const game = createGame();
  game.beginRun();
  // Set up a completed row that would be pending-cleared, then simulate a
  // boss garbage attack firing before the 260 ms hold expires.
  game.board.grid[21] = ['J', 'J', 'J', 'J', 'J', 'J', 'J', 'J', 'J', 'J'];
  game.pendingLineClear = { rows: [21], remainingMs: 200 };
  game.board.clearingRows.add(21);

  const originalRandom = Math.random;
  Math.random = () => 0.5;
  try {
    game.executeAttack('garbage');
  } finally {
    Math.random = originalRandom;
  }

  // Pending clear resolved: the full row is gone, clearing set empty, and
  // one garbage row now sits at the bottom.
  assert.equal(game.pendingLineClear, null);
  assert.equal(game.board.clearingRows.size, 0);
  assert.equal(game.board.grid[21].filter((v) => v === 'G').length, 9);
  assert.equal(game.board.grid[21].filter((v) => v === 0).length, 1);
});

test('ends the run when garbage displaces blocks above the board', () => {
  const { game, effects } = createGameWithEffects();
  game.beginRun();
  game.board.grid[0][0] = 'T';
  const originalRandom = Math.random;
  Math.random = () => 0;

  try {
    game.executeAttack('garbage');
  } finally {
    Math.random = originalRandom;
  }


  assert.equal(game.phase, 'gameover');
  assert.equal(effects.wraithRuns, 1);
});

test('keeps final-boss victory when the locking board is topped out', () => {
  const game = createGame();
  game.beginRun();
  game.bossIndex = 4;
  game.boss.hp = 1;
  game.active = { kind: 'I', rotation: 0, x: 3, y: 20 };
  game.board.grid[0][0] = 'T';
  game.board.grid[21] = ['J', 'J', 'J', 0, 0, 0, 0, 'J', 'J', 'J'];

  game.lockAndAdvance();

  assert.equal(game.phase, 'victory');
});

test('caps lock-delay resets per piece', () => {
  const game = createGame();
  game.beginRun();
  // O piece resting on the floor — landed, so resets apply.
  game.active = { kind: 'O', rotation: 0, x: 4, y: 20 };

  for (let i = 0; i < LOCK_RESET_LIMIT + 10; i++) {
    game.lockTimer = 400;
    game.resetLockIfLanded();
  }

  assert.equal(game.lockResets, LOCK_RESET_LIMIT);
  // Past the cap the timer is no longer zeroed — the piece must lock.
  game.lockTimer = 400;
  game.resetLockIfLanded();
  assert.equal(game.lockTimer, 400);
});

test('awards a T-spin single via the 3-corner rule', () => {
  const game = createGame();
  game.beginRun();
  // Pocket: row 20 has a 3-wide slot; row 21 keeps walls at cols 4 and 6;
  // overhangs at row 19 fill the other two diagonal corners around the T
  // center, so only row 20 completes (single-line clear).
  game.board.grid[21] = ['J', 'J', 'J', 'J', 'J', 0, 'J', 'J', 'J', 'J'];
  game.board.grid[20] = ['J', 'J', 'J', 'J', 0, 0, 0, 'J', 'J', 'J'];
  game.board.grid[19][4] = 'J';
  game.board.grid[19][6] = 'J';
  game.active = { kind: 'T', rotation: 0, x: 4, y: 19 };
  game.lastActionWasRotate = true;

  game.lockAndAdvance();

  assert.equal(game.tspins, 1);
  // T-spin single: 800 x level 1 x combo 1 = 800.
  assert.equal(game.score, 800);
  assert.equal(game.lines, 1);
});

test('does not count a T-slot lock without a final rotation', () => {
  const game = createGame();
  game.beginRun();
  game.board.grid[21] = ['J', 'J', 'J', 'J', 'J', 0, 'J', 'J', 'J', 'J'];
  game.board.grid[20] = ['J', 'J', 'J', 'J', 0, 0, 0, 'J', 'J', 'J'];
  game.board.grid[19][4] = 'J';
  game.board.grid[19][6] = 'J';
  game.active = { kind: 'T', rotation: 0, x: 4, y: 19 };
  game.lastActionWasRotate = false; // slid in, never rotated

  game.lockAndAdvance();

  assert.equal(game.tspins, 0);
  // Plain single: 100 x level 1 = 100.
  assert.equal(game.score, 100);
});

test('applies the back-to-back x1.5 multiplier on consecutive tetrises', () => {
  const game = createGame();
  game.beginRun();
  const setupTetris = () => {
    game.active = { kind: 'I', rotation: 1, x: 3, y: 18 };
    for (let row = 18; row <= 21; row++) {
      game.board.grid[row].fill('J');
      game.board.grid[row][5] = 0;
    }
  };

  setupTetris();
  game.lockAndAdvance();
  assert.equal(game.backToBack, true);
  assert.equal(game.score, 800); // 800 x L1 x combo1, no B2B yet

  // Resolve the deferred clear so the second setup starts from an empty well.
  game.board.removeRows(game.pendingLineClear.rows);
  game.pendingLineClear = null;
  setupTetris();
  game.lockAndAdvance();
  // 800 x L1 x combo2 x B2B1.5 = 2400; total 3200.
  assert.equal(game.score, 3200);

  // A lesser clear breaks the chain.
  game.board.removeRows(game.pendingLineClear.rows);
  game.pendingLineClear = null;
  game.active = { kind: 'O', rotation: 0, x: 7, y: 20 };
  game.board.grid[21] = ['J', 'J', 'J', 'J', 'J', 'J', 'J', 'J', 0, 0];
  game.lockAndAdvance();
  assert.equal(game.backToBack, false);
});

test('nudges a colliding Kong throw to the nearest free column', () => {
  const game = createGame();
  game.beginRun();
  // Spawn zone (rows 0-1) blocked except columns 0-2.
  for (let y = 0; y < 2; y++) {
    for (let x = 3; x < 10; x++) game.board.grid[y][x] = 'J';
  }

  const piece = game.resolveSpawn('T', 5);

  assert.ok(piece);
  assert.equal(game.board.collides(piece), false);
  assert.ok(Math.abs(piece.x - 5) > 0); // moved away from the blocked column
});

test('only game-overs on spawn when the spawn zone is truly full', () => {
  const game = createGame();
  game.beginRun();
  for (let y = 0; y < 4; y++) game.board.grid[y].fill('J');

  assert.equal(game.resolveSpawn('O', 4), null);
  assert.equal(game.resolveSpawn('T', 4), null);
});

test('telegraphs a boss attack before executing it', () => {
  const game = createGame();
  game.beginRun();
  game.active = { kind: 'T', rotation: 0, x: 3, y: 10 };
  game.boss.attackTimer = 1;

  game.update(5);

  // Warning is live, attack has not landed yet.
  assert.ok(game.pendingAttack);
  assert.equal(game.pendingAttack.remainingMs, ATTACK_WARNING_MS - 5);
  assert.equal(game.isSpike(), false);

  game.update(ATTACK_WARNING_MS);

  assert.equal(game.pendingAttack, null);
  assert.equal(game.isSpike(), true); // SURGE.exe's spike went off
});

test('holds garbage rows back until the telegraph window expires', () => {
  const game = createGame();
  game.beginRun();
  game.active = { kind: 'T', rotation: 0, x: 3, y: 10 };
  game.pendingAttack = { kind: 'garbage', rows: 2, remainingMs: 500 };

  game.update(499);

  assert.ok(game.pendingAttack);
  assert.equal(game.board.grid[21].every((v) => v === 0), true);

  game.update(1);

  assert.equal(game.pendingAttack, null);
  assert.equal(game.board.grid[21].filter((v) => v === 'G').length, 9);
});

test('flags danger when the stack nears the visible top', () => {
  const game = createGame();
  game.beginRun();

  assert.equal(game.danger, false);
  game.board.grid[HIDDEN_ROWS + DANGER_ROWS_FROM_TOP][0] = 'J';
  assert.equal(game.danger, false);
  game.board.grid[HIDDEN_ROWS + DANGER_ROWS_FROM_TOP - 1][0] = 'J';
  assert.equal(game.danger, true);
});

test('awards a perfect-clear bonus when the well is emptied', () => {
  const game = createGame();
  game.beginRun();
  game.board.grid[21] = [0, 0, 0, 0, 'J', 'J', 'J', 'J', 'J', 'J'];
  game.active = { kind: 'I', rotation: 0, x: 0, y: 20 };

  game.lockAndAdvance();
  assert.ok(game.pendingLineClear);

  game.update(300); // resolve the deferred clear -> perfect clear

  // Single (100) + perfect clear (2000 x level 1).
  assert.equal(game.score, 2100);
  assert.equal(game.pendingLineClear, null);
});

test('rotates 180 degrees and counts it for T-spin detection', () => {
  const game = createGame();
  game.beginRun();
  game.active = { kind: 'T', rotation: 0, x: 3, y: 5 };

  game.rotate180();

  assert.equal(game.active.rotation, 2);
  assert.equal(game.lastActionWasRotate, true);
});

test('skipCutscene dismisses the inter-boss cutscene early', () => {
  const game = createGame();
  game.beginRun();
  game.boss.hp = 1;
  game.active = { kind: 'I', rotation: 1, x: 3, y: 18 };
  for (let row = 18; row <= 21; row++) {
    game.board.grid[row].fill('J');
    game.board.grid[row][5] = 0;
  }

  game.lockAndAdvance();
  assert.equal(game.phase, 'cutscene');

  game.skipCutscene();
  assert.equal(game.phase, 'playing');
  assert.equal(game.cutscene, null);
});

test('free-stack mode runs with no boss and tiers up by lines only', () => {
  const game = createGame({ mode: 'free-stack' });
  game.beginRun();

  assert.equal(game.boss, null);
  game.lines = 9;
  game.active = { kind: 'I', rotation: 0, x: 3, y: 20 };
  game.board.grid[21] = ['J', 'J', 'J', 0, 0, 0, 0, 'J', 'J', 'J'];

  game.lockAndAdvance();
  assert.equal(game.lines, 10);
  assert.equal(game.level, 2);

  game.update(30_000);
  assert.equal(game.pendingAttack, null);
  assert.equal(game.boss, null);
});
