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

test('lets the end-game ghost hover for four seconds by default', () => {
  const effects = new EffectsManager();
  effects.spawnGameOverWraith(400, 320);

  assert.equal(effects.currentGameOverWraith().durationMs, 4_000);
  effects.update(1_800);
  assert.equal(effects.currentGameOverWraith().remainingMs, 2_200);
  effects.update(2_199);
  assert.equal(effects.currentGameOverWraith().remainingMs, 1);
  effects.update(1);
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

for (const [spawn, frames] of [['spawnPacman', 20], ['spawnBreakerPacman', 28]]) {
  test(`${spawn} uses the slightly slower sweep in either direction`, () => {
    for (const [start, end] of [[0, 400], [400, 0]]) {
      const effects = new EffectsManager();
      effects[spawn](start, 300, end, '#ffe600');

      effects.update(frames / 2 * 16.6667);

      assert.ok(Math.abs(effects.pacmen[0].x - 200) < 0.001);
      effects.update(frames / 2 * 16.6667);
      assert.ok(Math.abs(effects.pacmen[0].x - end) < 0.001);
    }
  });
}

test('holds cleared rows for the slower ordinary Pacman sweep', () => {
  const game = createGame();
  game.beginRun();
  game.active = { kind: 'I', rotation: 0, x: 3, y: 20 };
  game.board.grid[21] = ['J', 'J', 'J', 0, 0, 0, 0, 'J', 'J', 'J'];

  game.lockAndAdvance();

  assert.ok(Math.abs(game.pendingLineClear.remainingMs - 1000 / 3) < 0.001);
  game.update(300);
  assert.ok(game.pendingLineClear);
  game.update(34);
  assert.equal(game.pendingLineClear, null);
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
  game.executeAttack({ kind: 'garbage', holes: [0], remainingMs: 0 });

  assert.equal(game.active.y, 9);
});

test('allows garbage attacks to raise four rows', () => {
  const game = createGame();
  game.beginRun();
  game.active = { kind: 'T', rotation: 0, x: 3, y: 10 };
  game.executeAttack({ kind: 'garbage', holes: [9, 9, 9, 9], remainingMs: 0 });

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
  // boss garbage attack firing before the row-clear hold expires.
  game.board.grid[21] = ['J', 'J', 'J', 'J', 'J', 'J', 'J', 'J', 'J', 'J'];
  game.pendingLineClear = { rows: [21], remainingMs: 200 };
  game.board.clearingRows.add(21);

  game.executeAttack({ kind: 'garbage', holes: [5, 5, 5], remainingMs: 0 });

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
  game.executeAttack({ kind: 'garbage', holes: [0], remainingMs: 0 });


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
  assert.equal(game.pendingAttack.remainingMs, ATTACK_WARNING_MS);
  assert.equal(game.isSpike(), false);

  game.update(ATTACK_WARNING_MS);

  assert.equal(game.pendingAttack, null);
  assert.equal(game.isSpike(), true); // SURGE.exe's spike went off
});

test('holds garbage rows back until the telegraph window expires', () => {
  const game = createGame();
  game.beginRun();
  game.active = { kind: 'T', rotation: 0, x: 3, y: 10 };
  game.pendingAttack = { kind: 'garbage', holes: [2, 7], remainingMs: 500 };

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

  game.update(game.pendingLineClear.remainingMs); // resolve the deferred clear -> perfect clear

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

test('pause toggles between playing and paused', async () => {
  const game = createGame();
  game.beginRun();
  assert.equal(game.phase, 'playing');

  game.pause();
  assert.equal(game.phase, 'paused');

  // The debounce window must expire before the toggle is accepted again.
  await new Promise((r) => setTimeout(r, 250));
  game.pause();
  assert.equal(game.phase, 'playing');
});

test('explicit resume returns to the same run even immediately after pausing', () => {
  const game = createGame({ seed: 42 });
  game.beginRun();
  const board = game.board;
  game.pause();
  game.resume();
  assert.equal(game.phase, 'playing');
  assert.equal(game.seed, 42);
  assert.equal(game.board, board);
  game.resume();
  assert.equal(game.phase, 'playing', 'repeated resume must not toggle back to pause');
});

test('explicit resume preserves a paused cutscene', () => {
  const game = createGame();
  game.beginRun();
  game.phase = 'cutscene';
  game.cutscene = { text: 'NEXT BOSS', timer: 700 };
  game.suspend();
  game.resume();
  assert.equal(game.phase, 'cutscene');
  assert.equal(game.cutscene.timer, 700);
});

test('explicit resume does not start a ready or ended run', () => {
  const game = createGame();
  for (const phase of ['ready', 'gameover', 'victory']) {
    game.phase = phase;
    game.resume();
    assert.equal(game.phase, phase);
  }
});

test('pause swallows duplicate toggles inside the debounce window', () => {
  const game = createGame();
  game.beginRun();

  game.pause();
  assert.equal(game.phase, 'paused');
  // A duplicate keydown arriving ~instantly (flaky driver/BIOS) must not
  // toggle straight back to playing.
  game.pause();
  assert.equal(game.phase, 'paused');
});

test('pause is a no-op outside playing/paused phases', () => {
  const game = createGame();
  assert.equal(game.phase, 'ready');
  game.pause();
  assert.equal(game.phase, 'ready');
});

test('run time counts playing updates, not pauses or cutscenes', () => {
  const game = createGame();
  game.beginRun();
  game.update(100);
  game.phase = 'paused';
  game.update(10_000);
  game.phase = 'cutscene';
  game.update(1000);
  assert.equal(game.runStats.timeMs, 100);
});

test('run summary stops changing after game over or victory', () => {
  for (const end of ['gameOver', 'victory']) {
    const game = createGame();
    game.beginRun();
    game.update(500);
    game[end]();
    const stats = game.runStats;
    game.update(5000);
    assert.deepEqual(game.runStats, stats);
    assert.equal(game.runStats.timeMs, 500);
  }
});

test('status effects consume only active gameplay time', () => {
  const game = createGame();
  game.beginRun();
  game.executeAttack({ kind: 'spike', remainingMs: 0 });
  game.executeAttack({ kind: 'blackout', remainingMs: 0 });
  game.phase = 'paused';
  game.update(20_000);
  assert.equal(game.isSpike(), true);
  assert.equal(game.isBlackout(), true);
  game.phase = 'playing';
  game.update(6000);
  assert.equal(game.isSpike(), false);
  assert.equal(game.isBlackout(), true);
  game.update(4000);
  assert.equal(game.isBlackout(), false);
});

test('focus suspension is idempotent and preserves the paused phase', () => {
  const game = createGame();
  game.beginRun();
  game.suspend();
  game.suspend();
  assert.equal(game.phase, 'paused');
  game.update(5000);
  assert.equal(game.runStats.timeMs, 0);
});

test('resuming a suspended cutscene preserves its remaining duration', () => {
  const game = createGame();
  game.beginRun();
  game.phase = 'cutscene';
  game.cutscene = { text: ['NEXT BOSS'], timer: 1000 };
  game.suspend();
  game.update(5000);
  assert.equal(game.cutscene.timer, 1000);
  game.lastPauseToggleMs = -Infinity;
  game.pause();
  assert.equal(game.phase, 'cutscene');
});

const { InputController } = loadTypeScriptModule(path.join(root, 'src', 'input.ts'));

function withInput(run, actions = {}) {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousHTMLElement = globalThis.HTMLElement;
  globalThis.HTMLElement ??= class {};
  globalThis.window = new EventTarget();
  globalThis.document = new EventTarget();
  globalThis.document.hidden = false;
  let moves = 0;
  let suspended = 0;
  let dropping = false;
  const input = new InputController({
    moveLeft: () => { moves++; },
    moveRight: () => { moves++; },
    softDrop: (held) => { dropping = held; },
    suspend: () => { suspended++; },
    ...actions,
  });
  try {
    run(input, () => ({ moves, suspended, dropping }));
  } finally {
    input.destroy();
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    globalThis.HTMLElement = previousHTMLElement;
  }
}

test('setup and pause clicks do not skip a just-resumed cutscene', () => {
  const previousHTMLElement = globalThis.HTMLElement;
  globalThis.HTMLElement = class {
    constructor(ui) { this.ui = ui; }
    closest(selector) { return selector === '[data-game-ui]' && this.ui ? this : null; }
  };
  let starts = 0;
  let skips = 0;
  try {
    withInput(() => {
      for (const ui of [true, false]) {
        const event = new Event('click');
        Object.defineProperty(event, 'target', { value: new HTMLElement(ui) });
        window.dispatchEvent(event);
        assert.equal(starts, ui ? 0 : 1);
        assert.equal(skips, ui ? 0 : 1);
      }
    }, {
      start: () => { starts++; },
      skipCutscene: () => { skips++; },
    });
  } finally {
    globalThis.HTMLElement = previousHTMLElement;
  }
});

test('input reset releases movement and soft drop', () => withInput((input, state) => {
  input.setLeftHeld(true);
  input.setSoftDropHeld(true);
  input.reset();
  input.update(1000);
  assert.deepEqual(state(), { moves: 1, suspended: 0, dropping: false });
}));

test('input repeat uses only time after the DAS threshold', () => withInput((input, state) => {
  input.setTimings(150, 40);
  input.setLeftHeld(true);
  input.update(140);
  input.update(20);
  assert.equal(state().moves, 1);
  input.update(30);
  assert.equal(state().moves, 2);
}));

test('input repeat caps catch-up work after a stalled frame', () => withInput((input, state) => {
  input.setTimings(50, 10);
  input.setLeftHeld(true);
  input.lastFrame = performance.now() - 60_000;
  input.update(60_000);
  assert.ok(state().moves <= 11);
}));

test('blur and hidden document clear inputs and suspend without auto-resuming', () => withInput((input, state) => {
  input.setLeftHeld(true);
  input.setSoftDropHeld(true);
  window.dispatchEvent(new Event('blur'));
  document.hidden = true;
  document.dispatchEvent(new Event('visibilitychange'));
  document.hidden = false;
  document.dispatchEvent(new Event('visibilitychange'));
  input.update(1000);
  assert.deepEqual(state(), { moves: 1, suspended: 2, dropping: false });
}));

test('garbage execution uses the exact holes scheduled in the warning', () => {
  const game = createGame();
  game.beginRun();
  game.pendingAttack = { kind: 'garbage', holes: [2, 7], remainingMs: 1 };
  game.update(1);
  assert.equal(game.board.grid[20][2], 0);
  assert.equal(game.board.grid[21][7], 0);
  assert.equal(game.board.grid[20].filter((v) => v === 'G').length, 9);
  assert.equal(game.board.grid[21].filter((v) => v === 'G').length, 9);
});

function clearSingle(game) {
  game.active = { kind: 'I', rotation: 0, x: 0, y: 20 };
  game.board.grid[21] = [0, 0, 0, 0, 'J', 'J', 'J', 'J', 'J', 'J'];
  game.lockAndAdvance();
}

test('a single clear cancels the earliest incoming garbage row', () => {
  const game = createGame();
  game.beginRun();
  game.pendingAttack = { kind: 'garbage', holes: [2, 7, 5], remainingMs: 900 };
  clearSingle(game);
  assert.deepEqual(game.pendingAttack, { kind: 'garbage', holes: [7, 5], remainingMs: 900 });
});

test('cancelling all incoming garbage removes its warning without adding rows', () => {
  const game = createGame();
  game.beginRun();
  game.pendingAttack = { kind: 'garbage', holes: [2], remainingMs: 900 };
  clearSingle(game);
  assert.equal(game.pendingAttack, null);
  game.update(1000);
  assert.equal(game.board.grid.flat().includes('G'), false);
});

test('a large frame cannot consume a newly scheduled warning', () => {
  const game = createGame();
  game.beginRun();
  game.boss.attackTimer = 0;
  game.update(1000);
  assert.equal(game.isSpike(), false);
  assert.equal(game.pendingAttack.remainingMs, ATTACK_WARNING_MS);
});

test('unsafe scramble is deferred atomically until the active piece clears', () => {
  const game = createGame();
  game.beginRun();
  game.active = { kind: 'O', rotation: 0, x: 3, y: 10 };
  game.board.grid[10][0] = 'J';
  const before = structuredClone(game.board.grid);
  game.pendingAttack = { kind: 'scramble', columns: [0, 4], remainingMs: 0 };
  game.update(0);
  assert.deepEqual(game.board.grid, before);
  assert.ok(game.pendingAttack);
  assert.equal(game.board.collides(game.active), false);
  game.active = null;
  game.update(0);
  assert.equal(game.pendingAttack, null);
  assert.equal(game.board.grid[10][4], 'J');
});

test('fatal garbage stops the current update before further gravity or locking', () => {
  const game = createGame();
  game.beginRun();
  game.board.grid[0][0] = 'J';
  game.active = { kind: 'O', rotation: 0, x: 3, y: 10 };
  game.gravityTimer = 999;
  game.pendingAttack = { kind: 'garbage', holes: [0], remainingMs: 1 };
  game.update(100);
  assert.equal(game.phase, 'gameover');
  assert.equal(game.active.y, 9);
  assert.equal(game.piecesPlaced, 0);
});

test('identical run seeds reproduce pieces, boss payloads, and Kong targets', () => {
  const a = createGame({ seed: 12345 });
  const b = createGame({ seed: 12345 });
  a.beginRun();
  b.beginRun();
  assert.equal(a.seed, 12345);
  assert.equal(b.seed, 12345);
  for (let i = 0; i < 30; i++) {
    assert.equal(a.bag.next(), b.bag.next());
    assert.deepEqual(a.makeAttack('garbage'), b.makeAttack('garbage'));
    assert.deepEqual(a.makeAttack('scramble'), b.makeAttack('scramble'));
    a.kong.pickNewTarget();
    b.kong.pickNewTarget();
    assert.equal(a.kong.targetX, b.kong.targetX);
  }
});

test('queue peeks and cosmetic randomness cannot perturb gameplay streams', () => {
  const a = createGame({ seed: 22 });
  const b = createGame({ seed: 22 });
  a.beginRun();
  b.beginRun();
  a.bag.peek(100);
  const effects = new EffectsManager();
  effects.spawnSpark(0, 0, '#fff', 30);
  for (let i = 0; i < 20; i++) {
    a.makeAttack('garbage');
    a.kong.pickNewTarget();
  }
  assert.deepEqual(Array.from({ length: 70 }, () => a.bag.next()), Array.from({ length: 70 }, () => b.bag.next()));
  assert.deepEqual(a.makeAttack('scramble'), b.makeAttack('scramble'));
});

test('seeded restart restores the original random sequences', () => {
  const game = createGame({ seed: 72 });
  game.beginRun();
  const queue = game.bag.peek(14);
  const attack = game.makeAttack('garbage');
  game.restart();
  assert.equal(game.seed, 72);
  assert.deepEqual(game.bag.peek(14), queue);
  assert.deepEqual(game.makeAttack('garbage'), attack);
});

test('seed parsing rejects malformed or out-of-range numbers without coercion', () => {
  const { parseSeed } = loadTypeScriptModule(path.join(root, 'src', 'random.ts'));
  assert.equal(parseSeed(''), null);
  assert.equal(parseSeed('0'), 0);
  assert.equal(parseSeed('4294967295'), 4294967295);
  for (const bad of ['-1', '1.5', 'NaN', '4294967296', '1e3', 'abc']) {
    assert.throws(() => parseSeed(bad), RangeError);
  }
});

const storageModule = loadTypeScriptModule(path.join(root, 'src', 'storage.ts'));
function withStorage(run) {
  const previous = globalThis.localStorage;
  const previousWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  const entries = new Map();
  globalThis.localStorage = {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
  };
  try { run(entries, warnings); } finally {
    globalThis.localStorage = previous;
    console.warn = previousWarn;
  }
}

test('records separate modes and difficulties while preserving legacy high scores', () => withStorage((entries) => {
  entries.set('cb.hiscore', '9000');
  storageModule.saveRunRecord('boss-rush', 'normal', 100, null);
  storageModule.saveRunRecord('free-stack', 'normal', 200, null);
  storageModule.saveRunRecord('boss-rush', 'chill', 300, null);
  assert.equal(storageModule.loadRunRecord('boss-rush', 'normal').score, 100);
  assert.equal(storageModule.loadRunRecord('free-stack', 'normal').score, 200);
  assert.equal(storageModule.loadRunRecord('boss-rush', 'chill').score, 300);
  assert.equal(storageModule.loadRunRecord('boss-rush', 'overdrive').score, 0);
  assert.equal(entries.get('cb.hiscore'), '9000');
}));

test('records retain best score and fastest successful Boss Rush time', () => withStorage(() => {
  storageModule.saveRunRecord('boss-rush', 'normal', 200, 600_000);
  storageModule.saveRunRecord('boss-rush', 'normal', 100, 650_000);
  storageModule.saveRunRecord('boss-rush', 'normal', 150, 550_000);
  storageModule.saveRunRecord('boss-rush', 'normal', 90, null);
  assert.deepEqual(storageModule.loadRunRecord('boss-rush', 'normal'), { score: 200, fastestWinMs: 550_000 });
}));

test('record reads reject malformed persisted values', () => withStorage((entries, warnings) => {
  for (const raw of ['null', '[]', '{"score":-1,"fastestWinMs":-5}', '{"score":"oops","fastestWinMs":"600"}', '{']) {
    entries.set('cb.records.boss-rush.normal', raw);
    assert.deepEqual(storageModule.loadRunRecord('boss-rush', 'normal'), { score: 0, fastestWinMs: null });
  }
  assert.equal(warnings.length, 5);
}));

test('Game records completed runs under their selected ruleset', () => withStorage(() => {
  const game = createGame({ mode: 'boss-rush', difficulty: 'chill' });
  game.beginRun();
  game.elapsedMs = 120_000;
  game.score = 456;
  game.victory();
  assert.deepEqual(storageModule.loadRunRecord('boss-rush', 'chill'), { score: 456, fastestWinMs: 120_000 });
  assert.equal(storageModule.loadRunRecord('boss-rush', 'normal').score, 0);
}));

test('full effects are the default until a reduced-effects preference is saved', () => withStorage((entries, warnings) => {
  assert.equal(storageModule.loadReducedEffects(), false);
  storageModule.saveReducedEffects(false);
  assert.equal(storageModule.loadReducedEffects(), false);
  storageModule.saveReducedEffects(true);
  assert.equal(storageModule.loadReducedEffects(), true);
  entries.set('cb.reducedEffects', 'invalid');
  assert.equal(storageModule.loadReducedEffects(), false);
  assert.equal(warnings.length, 1);
}));

test('fresh settings default to Boss Rush, Normal, random seed, full effects, and the standard mix and timings', () => withStorage(() => {
  const game = createGame();
  const { parseSeed } = loadTypeScriptModule(path.join(root, 'src', 'random.ts'));
  assert.equal(game.mode, 'boss-rush');
  assert.equal(game.difficulty, 'normal');
  assert.equal(parseSeed(''), null);
  assert.equal(storageModule.loadReducedEffects(), false);
  assert.equal(storageModule.loadMuted(), false);
  assert.deepEqual(storageModule.loadVolumes(), { master: 0.7, sfx: 0.7, bgm: 0.45 });
  assert.equal(storageModule.loadDas(), 150);
  assert.equal(storageModule.loadArr(), 40);
}));

test('saved preferences survive audio initialization without being replaced by defaults', () => withStorage((entries) => {
  const { AudioManager } = loadTypeScriptModule(path.join(root, 'src', 'audio', 'audio.ts'));
  storageModule.saveVolumes({ master: 0.25, sfx: 0, bgm: 1 });
  storageModule.saveMuted(true);
  storageModule.saveReducedEffects(true);
  storageModule.saveDas(230);
  storageModule.saveArr(15);
  const before = new Map(entries);
  const audio = new AudioManager();
  assert.deepEqual(audio.volumes, { master: 0.25, sfx: 0, bgm: 1 });
  assert.equal(audio.muted, true);
  assert.equal(storageModule.loadReducedEffects(), true);
  assert.equal(storageModule.loadDas(), 230);
  assert.equal(storageModule.loadArr(), 15);
  assert.deepEqual(entries, before);
}));

test('invalid saved audio channels fall back individually instead of producing invalid gain values', () => withStorage((entries, warnings) => {
  for (const value of ['bad', true, {}, [], null]) {
    entries.set('cb.volumes', JSON.stringify({ master: value, sfx: 0.2, bgm: 0.35 }));
    assert.deepEqual(storageModule.loadVolumes(), { master: 0.7, sfx: 0.2, bgm: 0.35 });
  }
  entries.set('cb.volumes', '{"master":1e999,"sfx":0.2,"bgm":0.35}');
  assert.deepEqual(storageModule.loadVolumes(), { master: 0.7, sfx: 0.2, bgm: 0.35 });
  assert.equal(warnings.length, 6);
}));

test('malformed audio settings restore defaults with a warning', () => withStorage((entries, warnings) => {
  for (const raw of ['null', '[]', '12', '"bad"', '{']) {
    entries.set('cb.volumes', raw);
    assert.deepEqual(storageModule.loadVolumes(), { master: 0.7, sfx: 0.7, bgm: 0.45 });
  }
  assert.equal(warnings.length, 5);
}));

test('partial audio settings preserve valid silence and clamp finite values', () => withStorage((entries, warnings) => {
  entries.set('cb.volumes', '{"sfx":0}');
  assert.deepEqual(storageModule.loadVolumes(), { master: 0.7, sfx: 0, bgm: 0.45 });
  entries.set('cb.volumes', '{"master":-0.5,"sfx":1.5,"bgm":1}');
  assert.deepEqual(storageModule.loadVolumes(), { master: 0, sfx: 1, bgm: 1 });
  assert.equal(warnings.length, 0);
}));

test('audio channels drive their own gain nodes and mute preserves the mix', () => withStorage(() => {
  const { AudioManager } = loadTypeScriptModule(path.join(root, 'src', 'audio', 'audio.ts'));
  const audio = new AudioManager();
  const gains = {};
  for (const [node, channel] of [['master', 'master'], ['sfxBus', 'sfx'], ['bgmBus', 'bgm']]) {
    audio[node] = { gain: { setTargetAtTime(value) { gains[channel] = value; } } };
  }
  audio.setVolumes({ master: 0.3, sfx: 0.6, bgm: 0.9 });
  assert.deepEqual(gains, { master: 0.3, sfx: 0.6, bgm: 0.9 });
  audio.toggleMute();
  assert.deepEqual(gains, { master: 0, sfx: 0.6, bgm: 0.9 });
  assert.equal(storageModule.loadMuted(), true);
  audio.setVolumes({ master: 0.4 });
  assert.equal(gains.master, 0);
  audio.toggleMute();
  assert.deepEqual(gains, { master: 0.4, sfx: 0.6, bgm: 0.9 });
  assert.deepEqual(storageModule.loadVolumes(), audio.volumes);
}));

test('saved input timings honor their supported bounds', () => withStorage(() => {
  for (const [save, load, min, max] of [
    [storageModule.saveDas, storageModule.loadDas, 50, 300],
    [storageModule.saveArr, storageModule.loadArr, 10, 100],
  ]) {
    save(-100);
    assert.equal(load(), min);
    save(9999);
    assert.equal(load(), max);
  }
}));

test('Kong aim preview uses the same collision adjustment as the actual spawn', () => {
  const game = createGame({ seed: 5 });
  game.beginRun();
  game.kong.state = 'winding-up';
  game.kong.pendingKind = 'T';
  game.kong.throwColumn = 5;
  for (let y = 0; y < 2; y++) {
    for (let x = 3; x < 10; x++) game.board.grid[y][x] = 'J';
  }
  const preview = game.spawnPreview;
  assert.ok(preview);
  assert.equal(preview.adjusted, true);
  assert.deepEqual(preview.piece, game.resolveSpawn('T', 5));
  assert.deepEqual(game.spawnPreview, preview); // Reading cannot consume a throw.
  game.kong.emitReady = true;
  game.update(0);
  assert.deepEqual(game.active, preview.piece);
  assert.equal(game.spawnPreview, null);
});

const { Renderer } = loadTypeScriptModule(path.join(root, 'src', 'renderer.ts'));
function recordingRenderer() {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (_target, method) => (...args) => calls.push([method, ...args]),
    set: () => true,
  });
  const renderer = Object.create(Renderer.prototype);
  Object.assign(renderer, { ctx, boardX: 240, boardY: 132 });
  return { renderer, calls };
}

test('garbage warning draws every scheduled hole in its future row', () => {
  const { renderer, calls } = recordingRenderer();
  renderer.drawAttackWarning({ kind: 'garbage', holes: [2, 7], remainingMs: 900 }, 0);
  assert.ok(calls.some(([method, x, y]) => method === 'strokeRect' && x === 300.5 && y === 672.5));
  assert.ok(calls.some(([method, x, y]) => method === 'strokeRect' && x === 450.5 && y === 702.5));
  assert.ok(calls.some(([method, text]) => method === 'fillText' && text.includes('CLEAR LINES TO CANCEL')));
});

test('scramble warning highlights the fixed pair and explains a deferred attack', () => {
  const { renderer, calls } = recordingRenderer();
  renderer.drawAttackWarning({ kind: 'scramble', columns: [0, 4], remainingMs: 0 }, 0);
  assert.ok(calls.some(([method, x]) => method === 'strokeRect' && x === 240.5));
  assert.ok(calls.some(([method, x]) => method === 'strokeRect' && x === 360.5));
  assert.ok(calls.some(([method, text]) => method === 'fillText' && text.includes('WAITING FOR CLEARANCE')));
});

test('reduced-effects rendering suppresses shake, flashes, and foreground flourishes but keeps gameplay cues', () => {
  const { renderer, calls } = recordingRenderer();
  const draws = [];
  for (const name of ['drawBackground', 'drawLightning', 'drawLeftPanel', 'drawBoard', 'drawRightPanel',
    'drawKongLedge', 'drawPacmen', 'drawParticles', 'drawScanlines', 'drawAnnouncement',
    'drawAttackWarning', 'drawDangerVignette', 'drawHint', 'drawGameOverWraith', 'drawSpawnPreview']) {
    renderer[name] = () => draws.push(name);
  }
  renderer.effects = { currentShake: () => ({ x: 5, y: 6 }), currentFlash: () => 1, currentAnnouncement: () => null };
  renderer.render({
    reducedEffects: true, time: 100, danger: true,
    kong: { draw() {}, drawThrownPiece() {} },
    attackWarning: { kind: 'spike', remainingMs: 500 },
    spawnPreview: { piece: { kind: 'T', x: 3, y: 0, rotation: 0 }, adjusted: false },
  });
  assert.ok(calls.some(([method, x, y]) => method === 'translate' && x === 0 && y === 0));
  assert.equal(calls.some(([method]) => method === 'fillRect'), false);
  for (const name of ['drawLightning', 'drawPacmen', 'drawParticles', 'drawGameOverWraith']) assert.equal(draws.includes(name), false);
  for (const name of ['drawBoard', 'drawAttackWarning', 'drawDangerVignette', 'drawSpawnPreview']) assert.ok(draws.includes(name));
});

test('boot and cabinet expose accessible seed and reduced-effects controls', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /id="run-seed"/);
  assert.match(html, /for="run-seed"/);
  assert.match(html, /id="reduced-effects"[^>]*type="checkbox"/);
  assert.match(html, /for="reduced-effects"/);
});

test('setup consolidates run, audio, effects, and controls in one tabbed dialog', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dialog = html.match(/<dialog\b[^>]*id="setup-dialog"[^>]*>([\s\S]*?)<\/dialog>/)?.[1];
  assert.ok(dialog, 'setup uses a modal dialog with native focus containment');
  for (const id of ['boot-menu', 'run-seed', 'volume-master', 'volume-sfx', 'volume-bgm', 'audio-mute', 'reduced-effects', 'boot-start']) {
    assert.match(dialog, new RegExp(`id="${id}"`));
    assert.equal(html.split(`id="${id}"`).length - 1, 1, `${id} must not be duplicated`);
  }
  for (const tab of ['play', 'settings', 'controls']) {
    assert.match(dialog, new RegExp(`id="tab-${tab}"[^>]*role="tab"`));
    assert.match(dialog, new RegExp(`id="panel-${tab}"[^>]*role="tabpanel"`));
  }
  assert.match(html, /id="pause-settings"/);
  assert.doesNotMatch(html, /id="audio-console-toggle"/);
});

test('settings controls retain native keyboard behavior without invoking gameplay', () => withInput((input) => {
  const previousElement = globalThis.HTMLElement;
  class Element {
    closest(selector) { return selector.includes('[data-game-ui]') ? this : null; }
  }
  globalThis.HTMLElement = Element;
  let actions = 0;
  input.actions = new Proxy({}, { get: () => () => { actions++; } });
  try {
    for (const key of ['ArrowLeft', 'ArrowRight', ' ', 'Enter', 'r', 'p', 'm', 'Escape']) {
      let prevented = false;
      input.onKeyDown({
        key, repeat: false, target: new Element(),
        preventDefault() { prevented = true; },
      });
      assert.equal(actions, 0, `${key} must stay inside the settings UI`);
      assert.equal(prevented, false, `${key} must retain its native control behavior`);
    }
  } finally {
    globalThis.HTMLElement = previousElement;
  }
}));

test('startup receives its triggering event so opening setup can consume Enter', () => withInput((input) => {
  const previousElement = globalThis.HTMLElement;
  globalThis.HTMLElement = class {};
  let received;
  const event = { key: 'Enter', target: null, repeat: false, preventDefault() {} };
  input.actions = { ...input.actions, menuKey() {}, start(trigger) { received = trigger; }, skipCutscene() {} };
  try {
    input.onKeyDown(event);
    assert.equal(received, event);
  } finally {
    globalThis.HTMLElement = previousElement;
  }
}));

test('pointer startup waits for click so the opening gesture cannot activate new setup controls', () => withInput((input) => {
  const starts = [];
  input.actions.start = (event) => starts.push(event);
  input.actions.skipCutscene = () => {};
  window.dispatchEvent(new Event('pointerdown'));
  assert.equal(starts.length, 0);
  const click = new Event('click');
  window.dispatchEvent(click);
  assert.deepEqual(starts, [click]);
}));
