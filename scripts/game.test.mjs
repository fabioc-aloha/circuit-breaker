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

function createGame() {
  return createGameWithEffects().game;
}

function createGameWithEffects() {
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
  return { game: new Game(effects, sfx, music, () => {}), effects };
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
  game.active.y = 10;
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
  game.active.y = 10;
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
  assert.equal(effects.breakerY, 560);
  assert.equal(effects.breakerSize, 60);
});

test('does not increase voltage tier from cleared-line thresholds', () => {
  const game = createGame();
  game.beginRun();
  game.lines = 9;
  game.active = { kind: 'I', rotation: 0, x: 3, y: 20 };
  game.board.grid[21] = ['J', 'J', 'J', 0, 0, 0, 0, 'J', 'J', 'J'];

  game.lockAndAdvance();

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
