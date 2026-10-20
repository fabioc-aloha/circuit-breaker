// CIRCUIT BREAKER — entry point
import { AudioManager, volumeFromPercent } from './audio/audio';
import { Music } from './audio/music';
import { SFX } from './audio/sfx';
import { EffectsManager } from './effects';
import { frameDelta } from './frame-timing';
import { Game } from './game';
import { InputController } from './input';
import { initializeMarketTicker, syncTickerSpeed } from './market-ticker';
import { Renderer } from './renderer';
import { SetupPanel } from './setup-panel';
import type { Volumes } from './storage';
import { loadArr, loadDas, loadReducedEffects, saveArr, saveDas, saveReducedEffects } from './storage';
import { parseSeed } from './random';
import { ARR_MAX_MS, ARR_MIN_MS, DAS_MAX_MS, DAS_MIN_MS } from './constants';
import type { DifficultyId, GameMode } from './types';
import './style.css';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const bootOverlay = document.getElementById('boot')!;
const bootText = document.getElementById('boot-text')!;
const bootMenu = document.getElementById('boot-menu')!;
const muteButton = document.getElementById('audio-mute') as HTMLButtonElement;
const seedInput = document.getElementById('run-seed') as HTMLInputElement;
const reducedEffectsInput = document.getElementById('reduced-effects') as HTMLInputElement;
let reducedEffects = loadReducedEffects();
function syncReducedEffects(): void {
  reducedEffectsInput.checked = reducedEffects;
  document.body.classList.toggle('reduced-effects', reducedEffects);
  if (!reducedEffects) syncTickerSpeed(document.getElementById('ticker-track')!);
}
syncReducedEffects();
reducedEffectsInput.addEventListener('change', () => {
  reducedEffects = reducedEffectsInput.checked;
  saveReducedEffects(reducedEffects);
  syncReducedEffects();
});

// Primary-input detection avoids showing touch controls on touchscreen laptops.
const coarsePointer = window.matchMedia('(pointer: coarse)');

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
const AUDIO_OFFLINE_LINE = '> AUDIO BUS: OFFLINE  (press any key)';
const AUDIO_ONLINE_LINE = '> AUDIO BUS: ONLINE';

/** Flip the stale "AUDIO BUS: OFFLINE" boot line once the audio bus unlocks —
 *  both for lines still to be typed and for the line already on screen. */
function markAudioOnline(): void {
  const idx = BIOS_LINES.indexOf(AUDIO_OFFLINE_LINE);
  if (idx >= 0) BIOS_LINES[idx] = AUDIO_ONLINE_LINE;
  if (bootText.textContent?.includes(AUDIO_OFFLINE_LINE)) {
    bootText.textContent = bootText.textContent.replace(AUDIO_OFFLINE_LINE, AUDIO_ONLINE_LINE);
  }
}

/** Unlock the WebAudio bus (must run inside a user gesture) and refresh the
 *  boot log so it no longer claims the bus is offline. */
function unlockAudio(): void {
  audio.ensure();
  markAudioOnline();
}

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
  muteButton.textContent = audio.muted ? 'Unmute' : 'Mute';
}

for (const control of mixerControls) {
  syncMixerControl(control.input, control.output, audio.volumes[control.channel]);
  control.input.addEventListener('input', () => {
    unlockAudio();
    const volume = volumeFromPercent(control.input.value);
    audio.setVolumes({ [control.channel]: volume } as Partial<Volumes>);
    syncMixerControl(control.input, control.output, volume);
  });
}
syncMuteButton();

type BootPhase = 'typing' | 'menu' | 'done';
let bootPhase: BootPhase = 'typing';
let selMode: GameMode = 'boss-rush';
let selDiff: DifficultyId = 'normal';
let dasMs = loadDas();
let arrMs = loadArr();

function syncBootMenu(): void {
  bootMenu.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => {
    b.classList.toggle('selected', b.dataset.mode === selMode);
    b.setAttribute('aria-pressed', String(b.dataset.mode === selMode));
  });
  bootMenu.querySelectorAll<HTMLButtonElement>('[data-diff]').forEach((b) => {
    b.classList.toggle('selected', b.dataset.diff === selDiff);
    b.setAttribute('aria-pressed', String(b.dataset.diff === selDiff));
  });
  document.getElementById('das-val')!.textContent = `${dasMs}ms`;
  document.getElementById('arr-val')!.textContent = `${arrMs}ms`;
  document.getElementById('run-summary')!.textContent =
    `${selMode === 'boss-rush' ? 'Boss Rush' : 'Free Stack'} / ${selDiff}`;
}

function setDas(v: number): void {
  dasMs = Math.max(DAS_MIN_MS, Math.min(DAS_MAX_MS, Math.round(v)));
  saveDas(dasMs);
  input.setTimings(dasMs, arrMs);
  syncBootMenu();
}

function setArr(v: number): void {
  arrMs = Math.max(ARR_MIN_MS, Math.min(ARR_MAX_MS, Math.round(v)));
  saveArr(arrMs);
  input.setTimings(dasMs, arrMs);
  syncBootMenu();
}

const setupPanel = new SetupPanel(document.getElementById('setup-dialog') as HTMLDialogElement, {
  start: () => dismissBoot(),
  close: () => input.reset(),
  shortcut: (key, event) => handleMenuKey(key, event),
});

/** Finish the BIOS type-out instantly and show the loadout menu. */
function finishTyping(): void {
  if (bootPhase !== 'typing') return;
  bootIdx = BIOS_LINES.length; // halt the typeBoot chain
  bootText.textContent = BIOS_LINES.join('\n') + '\n';
  bootPhase = 'menu';
  bootOverlay.hidden = true;
  syncBootMenu();
  setupPanel.open(false);
}

function handleMenuKey(key: string, ev: KeyboardEvent): void {
  if (bootPhase !== 'menu') return;
  // Focused controls keep their native activation; the setup panel only routes
  // shortcuts from non-editable content here.
  if (key === 'Enter' || key === ' ') {
    ev.preventDefault();
    dismissBoot();
    return;
  }
  unlockAudio(); // keydown is a user gesture — unlock audio for menu blips
  switch (key) {
    case '1': selMode = 'boss-rush'; break;
    case '2': selMode = 'free-stack'; break;
    case '3': selDiff = 'chill'; break;
    case '4': selDiff = 'normal'; break;
    case '5': selDiff = 'overdrive'; break;
    case '[': setDas(dasMs - 10); return;
    case ']': setDas(dasMs + 10); return;
    case ';': setArr(arrMs - 5); return;
    case "'": setArr(arrMs + 5); return;
    default: return;
  }
  sfx.uiBlip();
  syncBootMenu();
}

function dismissBoot(): void {
  if (bootPhase === 'done') return;
  let seed: number | null;
  try {
    seed = parseSeed(seedInput.value);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    setupPanel.select('settings');
    (document.getElementById('advanced-settings') as HTMLDetailsElement).open = true;
    seedInput.setCustomValidity(error.message);
    seedInput.focus();
    seedInput.reportValidity();
    return;
  }
  bootPhase = 'done';
  unlockAudio();
  game.mode = selMode;
  game.difficulty = selDiff;
  setupPanel.close();
  bootOverlay.remove();
  effects.spawnLightning(canvas.width * 0.15, 0, canvas.width * 0.65, canvas.height * 0.8, '#ffffff', 2.5);
  effects.flash(0.9, 180);
  effects.shake(6, 240);
  game.beginRun(seed ?? undefined);
  seedInput.value = String(game.seed);
  canvas.focus({ preventScroll: true });
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

muteButton.addEventListener('click', () => {
  unlockAudio();
  game.toggleMute();
});

const input = new InputController({
  moveLeft: () => game.moveLeft(),
  moveRight: () => game.moveRight(),
  softDrop: (h) => game.softDrop(h),
  hardDrop: () => game.hardDrop(),
  rotateCW: () => game.rotateCW(),
  rotateCCW: () => game.rotateCCW(),
  rotate180: () => game.rotate180(),
  holdPiece: () => game.holdPiece(),
  pause: () => { input.reset(); game.pause(); },
  suspend: () => { game.suspend(); syncPauseOverlay(); },
  restart: () => { input.reset(); game.restart(); },
  toggleMute: () => game.toggleMute(),
  start: (event) => {
    // Typing phase: any key skips to the loadout menu. Menu phase: keys are
    // handled by menuKey / the on-screen buttons — don't dismiss early.
    if (bootPhase === 'typing') {
      event.preventDefault();
      finishTyping();
    }
  },
  menuKey: (key, ev) => handleMenuKey(key, ev),
  skipCutscene: () => game.skipCutscene(),
});
input.setTimings(dasMs, arrMs);

// Boot-menu buttons (mouse / touch friendly).
bootMenu.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => {
  b.addEventListener('click', () => {
    selMode = b.dataset.mode as GameMode;
    unlockAudio();
    sfx.uiBlip();
    syncBootMenu();
  });
});
bootMenu.querySelectorAll<HTMLButtonElement>('[data-diff]').forEach((b) => {
  b.addEventListener('click', () => {
    selDiff = b.dataset.diff as DifficultyId;
    unlockAudio();
    sfx.uiBlip();
    syncBootMenu();
  });
});
document.getElementById('das-down')!.addEventListener('click', () => setDas(dasMs - 10));
document.getElementById('das-up')!.addEventListener('click', () => setDas(dasMs + 10));
document.getElementById('arr-down')!.addEventListener('click', () => setArr(arrMs - 5));
document.getElementById('arr-up')!.addEventListener('click', () => setArr(arrMs + 5));
seedInput.addEventListener('input', () => seedInput.setCustomValidity(''));
seedInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    dismissBoot();
  }
});

// Touch controls — shown only when touch is the primary input, so they never
// appear on desktop (including touchscreen laptops).
const touchControls = document.getElementById('touch-controls')!;
function syncTouchControls(): void {
  const touchFirst = coarsePointer.matches;
  touchControls.hidden = !touchFirst;
  // Lifts the cabinet so the fixed button bar never covers the canvas.
  document.body.classList.toggle('has-touch', touchFirst);
}
if (typeof coarsePointer.addEventListener === 'function') {
  coarsePointer.addEventListener('change', syncTouchControls);
}
syncTouchControls();

// Holdable buttons (move/soft-drop) share the keyboard DAS/ARR state machine.
touchControls.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
  const kind = btn.dataset.t ?? '';
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    unlockAudio();
    switch (kind) {
      case 'left': input.setLeftHeld(true); break;
      case 'right': input.setRightHeld(true); break;
      case 'down': input.setSoftDropHeld(true); break;
      case 'cw': game.rotateCW(); break;
      case 'ccw': game.rotateCCW(); break;
      case 'r180': game.rotate180(); break;
      case 'hold': game.holdPiece(); break;
      case 'drop': game.hardDrop(); break;
      case 'pause': input.reset(); game.pause(); break;
    }
  });
  const release = (e: PointerEvent): void => {
    e.preventDefault();
    if (kind === 'left') input.setLeftHeld(false);
    else if (kind === 'right') input.setRightHeld(false);
    else if (kind === 'down') input.setSoftDropHeld(false);
  };
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointercancel', release);
  btn.addEventListener('pointerleave', release);
});

// Pause overlay — DOM buttons so pausing never depends on keyboard focus.
const pauseOverlay = document.getElementById('pause-overlay')!;
document.getElementById('pause-resume')!.addEventListener('click', () => {
  input.reset();
  if (game.phase === 'paused') game.pause();
  canvas.focus({ preventScroll: true });
});
document.getElementById('pause-restart')!.addEventListener('click', () => {
  input.reset();
  game.restart();
  canvas.focus({ preventScroll: true });
});
document.getElementById('pause-settings')!.addEventListener('click', () => {
  if (game.phase !== 'paused') return;
  input.reset();
  setupPanel.open(true);
});
pauseOverlay.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  if (['p', 'P', 'Escape'].includes(event.key)) {
    event.preventDefault();
    document.getElementById('pause-resume')!.click();
  } else if (['r', 'R'].includes(event.key)) {
    event.preventDefault();
    document.getElementById('pause-restart')!.click();
  } else if (['m', 'M'].includes(event.key)) {
    event.preventDefault();
    game.toggleMute();
  }
});
let pauseOverlayShown = false;
function syncPauseOverlay(): void {
  const show = game.phase === 'paused';
  if (show !== pauseOverlayShown) {
    pauseOverlayShown = show;
    pauseOverlay.hidden = !show;
    if (show) document.getElementById('pause-resume')!.focus({ preventScroll: true });
  }
}

let last = performance.now();
// Resetting on tab reactivation prevents rAF from delivering a giant catch-up
// dt after a long hidden-tab pause. The listener lives for the page lifetime;
// there is no unit test because it depends on the real Document visibility API.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  last = performance.now();
});

function loop(now: number): void {
  const dt = frameDelta(now, last);
  last = now;
  input.update(dt);
  game.update(dt);
  effects.update(dt, canvas.width, canvas.height);
  syncPauseOverlay();
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
    legacyHiScore: game.legacyHiScore,
    fastestWinMs: game.fastestWinMs,
    seed: game.seed,
    mode: game.mode,
    difficulty: game.difficulty,
    reducedEffects,
    spawnPreview: game.spawnPreview,
    lines: game.lines,
    level: game.level,
    combo: game.combo,
    boss: game.boss,
    blackout: game.isBlackout(),
    spike: game.isSpike(),
    paused: game.phase === 'paused',
    gameOver: game.phase === 'gameover',
    victory: game.phase === 'victory',
    cutsceneText: game.cutscene?.text ?? null,
    muted: audio.muted,
    kong: game.kong,
    time: now,
    danger: game.danger,
    attackWarning: game.pendingAttack,
    stats: game.phase === 'gameover' || game.phase === 'victory' ? game.runStats : null,
    hint: game.hintText(),
  });
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
