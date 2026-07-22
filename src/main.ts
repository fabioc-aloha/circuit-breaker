// CIRCUIT BREAKER — entry point
import { AudioManager, volumeFromPercent } from './audio/audio';
import { Music } from './audio/music';
import { SFX } from './audio/sfx';
import { EffectsManager } from './effects';
import { Game } from './game';
import { InputController } from './input';
import { initializeMarketTicker } from './market-ticker';
import { Renderer } from './renderer';
import type { Volumes } from './storage';
import './style.css';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const bootOverlay = document.getElementById('boot')!;
const bootText = document.getElementById('boot-text')!;
const hint = document.getElementById('hint')!;
const muteButton = document.getElementById('audio-mute') as HTMLButtonElement;

void initializeMarketTicker();

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
const mixerControls = [
  {
    channel: 'master' as const,
    input: document.getElementById('volume-master') as HTMLInputElement,
    output: document.getElementById('volume-master-value') as HTMLOutputElement,
  },
  {
    channel: 'sfx' as const,
    input: document.getElementById('volume-sfx') as HTMLInputElement,
    output: document.getElementById('volume-sfx-value') as HTMLOutputElement,
  },
  {
    channel: 'bgm' as const,
    input: document.getElementById('volume-bgm') as HTMLInputElement,
    output: document.getElementById('volume-bgm-value') as HTMLOutputElement,
  },
];

function syncMixerControl(input: HTMLInputElement, output: HTMLOutputElement, volume: number): void {
  const percent = Math.round(volume * 100);
  input.value = String(percent);
  output.value = `${percent}%`;
  output.textContent = `${percent}%`;
}

function syncMuteButton(): void {
  const label = audio.muted ? 'Unmute audio (M)' : 'Mute audio (M)';
  muteButton.setAttribute('aria-label', label);
  muteButton.setAttribute('aria-pressed', String(audio.muted));
  muteButton.title = label;
  muteButton.textContent = audio.muted ? '🔇' : '🔊';
}

for (const control of mixerControls) {
  syncMixerControl(control.input, control.output, audio.volumes[control.channel]);
  control.input.addEventListener('input', () => {
    const volume = volumeFromPercent(control.input.value);
    audio.setVolumes({ [control.channel]: volume } as Partial<Volumes>);
    syncMixerControl(control.input, control.output, volume);
  });
}
syncMuteButton();

let dismissed = false;
function dismissBoot(): void {
  if (dismissed) return;
  dismissed = true;
  audio.ensure();
  effects.spawnLightning(canvas.width * 0.15, 0, canvas.width * 0.65, canvas.height * 0.8, '#ffffff', 2.5);
  effects.flash(0.9, 180);
  effects.shake(6, 240);
  game.beginRun();
  bootOverlay.classList.add('done');
  hint.classList.add('hidden');
  setTimeout(() => bootOverlay.remove(), 600);
}

const game = new Game(effects, sfx, music, () => {
  const muted = audio.toggleMute();
  syncMuteButton();
  sfx.uiBlip();
  if (muted) music.stop();
  else {
    music.start();
    music.setMode('main');
  }
});

muteButton.addEventListener('click', () => game.toggleMute());

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
  effects.update(dt, canvas.width, canvas.height);
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
