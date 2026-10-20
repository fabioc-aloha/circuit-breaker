// CIRCUIT BREAKER — keyboard input with DAS/ARR
import { ARR_MS, COLS, DAS_MS } from './constants';
import { frameDelta } from './frame-timing';

export interface InputActions {
  moveLeft(): void;
  moveRight(): void;
  softDrop(hold: boolean): void;
  hardDrop(): void;
  rotateCW(): void;
  rotateCCW(): void;
  rotate180(): void;
  holdPiece(): void;
  pause(): void;
  suspend(): void;
  restart(): void;
  toggleMute(): void;
  start(event: Event): void; // any-key start / boot dismiss
  menuKey(key: string, ev: KeyboardEvent): void; // boot-menu navigation (no-op in game)
  skipCutscene(): void; // dismiss inter-boss cutscene early
}

export class InputController {
  private actions: InputActions;
  private dasMs: number = DAS_MS;
  private arrMs: number = ARR_MS;
  private leftDown = false;
  private rightDown = false;
  private downDown = false;
  private leftHeldMs = 0;
  private rightHeldMs = 0;
  private leftRepeatMs = 0;
  private rightRepeatMs = 0;

  constructor(actions: InputActions) {
    this.actions = actions;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('click', this.onClick);
    window.addEventListener('blur', this.onFocusLost);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  /** Tune auto-shift / auto-repeat (persisted; adjustable on the boot screen). */
  setTimings(dasMs: number, arrMs: number): void {
    this.dasMs = dasMs;
    this.arrMs = arrMs;
  }

  /** Touch-button hooks — share the keyboard DAS/ARR state machine. */
  setLeftHeld(down: boolean): void {
    if (down && !this.leftDown) {
      this.leftHeldMs = 0;
      this.leftRepeatMs = 0;
      this.actions.moveLeft();
    }
    this.leftDown = down;
  }
  setRightHeld(down: boolean): void {
    if (down && !this.rightDown) {
      this.rightHeldMs = 0;
      this.rightRepeatMs = 0;
      this.actions.moveRight();
    }
    this.rightDown = down;
  }
  setSoftDropHeld(down: boolean): void {
    this.downDown = down;
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('click', this.onClick);
    window.removeEventListener('blur', this.onFocusLost);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.reset();
  }

  reset(): void {
    this.leftDown = this.rightDown = this.downDown = false;
    this.leftHeldMs = this.rightHeldMs = 0;
    this.leftRepeatMs = this.rightRepeatMs = 0;
    this.actions.softDrop(false);
  }

  private onFocusLost = (): void => {
    this.reset();
    this.actions.suspend();
  };

  private onVisibilityChange = (): void => {
    if (document.hidden) this.onFocusLost();
  };

  /** Call each frame to service DAS/ARR + soft-drop hold. */
  update(elapsedMs: number): void {
    const dt = frameDelta(elapsedMs, 0);

    if (this.leftDown) {
      const previous = this.leftHeldMs;
      this.leftHeldMs += dt;
      if (this.leftHeldMs >= this.dasMs) {
        this.leftRepeatMs += Math.max(0, this.leftHeldMs - this.dasMs) - Math.max(0, previous - this.dasMs);
        const repeats = Math.min(COLS, Math.floor(this.leftRepeatMs / this.arrMs));
        this.leftRepeatMs %= this.arrMs;
        for (let i = 0; i < repeats; i++) {
          this.actions.moveLeft();
        }
      }
    }
    if (this.rightDown) {
      const previous = this.rightHeldMs;
      this.rightHeldMs += dt;
      if (this.rightHeldMs >= this.dasMs) {
        this.rightRepeatMs += Math.max(0, this.rightHeldMs - this.dasMs) - Math.max(0, previous - this.dasMs);
        const repeats = Math.min(COLS, Math.floor(this.rightRepeatMs / this.arrMs));
        this.rightRepeatMs %= this.arrMs;
        for (let i = 0; i < repeats; i++) {
          this.actions.moveRight();
        }
      }
    }
    this.actions.softDrop(this.downDown);
  }

  private onClick = (event: MouseEvent): void => {
    this.actions.start(event);
    this.actions.skipCutscene();
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.target instanceof HTMLElement && e.target.closest('input, select, textarea, [contenteditable="true"], [data-game-ui]')) return;
    // Prevent scrolling with space/arrows.
    if ([' ', 'ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp'].includes(e.key)) e.preventDefault();
    if (e.repeat) return;
    this.actions.menuKey(e.key, e);
    this.actions.start(e);
    this.actions.skipCutscene();
    switch (e.key) {
      case 'ArrowLeft':
        if (!this.leftDown) {
          this.leftDown = true;
          this.leftHeldMs = 0;
          this.leftRepeatMs = 0;
          this.actions.moveLeft();
        }
        break;
      case 'ArrowRight':
        if (!this.rightDown) {
          this.rightDown = true;
          this.rightHeldMs = 0;
          this.rightRepeatMs = 0;
          this.actions.moveRight();
        }
        break;
      case 'ArrowDown':
        this.downDown = true;
        break;
      case ' ':
        this.actions.hardDrop();
        break;
      case 'ArrowUp':
      case 'x':
      case 'X':
        this.actions.rotateCW();
        break;
      case 'z':
      case 'Z':
        this.actions.rotateCCW();
        break;
      case 'a':
      case 'A':
        this.actions.rotate180();
        break;
      case 'Shift':
      case 'c':
      case 'C':
        this.actions.holdPiece();
        break;
      case 'p':
      case 'P':
        this.actions.pause();
        break;
      case 'Escape':
        // Second way out of (and into) pause — same toggle as P.
        this.actions.pause();
        break;
      case 'r':
      case 'R':
        this.actions.restart();
        break;
      case 'm':
      case 'M':
        this.actions.toggleMute();
        break;
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    switch (e.key) {
      case 'ArrowLeft':
        this.leftDown = false;
        break;
      case 'ArrowRight':
        this.rightDown = false;
        break;
      case 'ArrowDown':
        this.downDown = false;
        break;
    }
  };
}
