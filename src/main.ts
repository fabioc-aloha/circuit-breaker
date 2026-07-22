// CIRCUIT BREAKER — entry point
import './style.css';
import { Game } from './game';
import { EffectsManager } from './effects';
import { Renderer } from './renderer';
import { InputController } from './input';
import { AudioManager } from './audio/audio';
import { SFX } from './audio/sfx';
import { Music } from './audio/music';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const bootOverlay = document.getElementById('boot')!;
const bootText = document.getElementById('boot-text')!;
const hint = document.getElementById('hint')!;

const BIOS_LINES = [
  '> CIRCUIT BREAKER v0.1  BIOS/POST',
  '> INITIALIZING GRID SUBSYSTEMS......... OK',
  '> LOADING TETROMINO REGISTRY........... OK',
  '> CALIBRATING VOLTAGE ROUTER........... OK',
  '> ARMING BOSS INTRUSION DETECTOR....... OK',
  '> AUDIO BUS: OFFLINE  (press any key)',
  '',
  '> READY.',
];

let bootIdx = 0;
function typeBoot(): void {
  if (bootIdx >= BIOS_LINES.length) return;
  bootText.textContent = (bootText.textContent ?? '') + BIOS_LINES[bootIdx] + '\n';
  bootIdx += 1;
  setTimeout(typeBoot, 180);
}
typeBoot();

const effects = new EffectsManager();
const audio = new AudioManager();
const sfx = new SFX(audio);
const music = new Music(audio);
const renderer = new Renderer(canvas, effects);

let dismissed = false;
function dismissBoot(): void {
  if (dismissed) return;
  dismissed = true;
  audio.ensure();
  music.start();
  music.setMode('main');
  bootOverlay.classList.add('done');
  hint.classList.add('hidden');
  setTimeout(() => bootOverlay.remove(), 600);
}

const game = new Game(effects, sfx, music, () => {
  const muted = audio.toggleMute();
  sfx.uiBlip();
  if (muted) music.stop();
  else {
    music.start();
    music.setMode('main');
  }
});

const input = new InputController({
  moveLeft: () => game.moveLeft(),
  moveRight: () => game.moveRight(),
  softDrop: (h) => game.softDrop(h),
  hardDrop: () => game.hardDrop(),
  rotateCW: () => game.rotateCW(),
  rotateCCW: () => game.rotateCCW(),
  holdPiece: () => game.holdPiece(),
  pause: () => game.pause(),
  restart: () => game.restart(),
  toggleMute: () => game.toggleMute(),
  start: () => dismissBoot(),
});

let last = performance.now();
function loop(now: number): void {
  const dt = Math.min(100, now - last);
  last = now;
  input.update();
  game.update(dt);
  effects.update(dt);
  const ghost = game.active ? game.board.ghostFor(game.active) : null;
  renderer.render({
    board: game.board,
    active: game.active,
    ghost,
    hold: game.hold,
    holdLocked: game.holdLocked,
    nextQueue: game.nextQueuePreview(3),
    score: game.score,
    hiScore: game.hiScore,
    lines: game.lines,
    level: game.level,
    combo: game.combo,
    boss: game.boss,
    blackout: game.isBlackout(),
    spike: game.isSpike(),
    paused: game.phase === 'paused',
    gameOver: game.phase === 'gameover',
    victory: game.phase === 'victory',
    bootText: null,
    cutsceneText: game.cutscene?.text ?? null,
    muted: audio.muted,
    time: now,
  });
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
