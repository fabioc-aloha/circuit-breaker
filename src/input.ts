// CIRCUIT BREAKER — keyboard input with DAS/ARR
import { ARR_MS, DAS_MS } from './constants';

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
  restart(): void;
  toggleMute(): void;
  start(): void; // any-key start / boot dismiss
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
  private lastFrame = 0;

  constructor(actions: InputActions) {
    this.actions = actions;
    this.lastFrame = performance.now();
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('pointerdown', this.onPointerDown, { once: false });
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
    window.removeEventListener('pointerdown', this.onPointerDown);
  }

  /** Call each frame to service DAS/ARR + soft-drop hold. */
  update(): void {
    const now = performance.now();
    const dt = now - this.lastFrame;
    this.lastFrame = now;

    if (this.leftDown) {
      this.leftHeldMs += dt;
      if (this.leftHeldMs >= this.dasMs) {
        this.leftRepeatMs += dt;
        while (this.leftRepeatMs >= this.arrMs) {
          this.actions.moveLeft();
          this.leftRepeatMs -= this.arrMs;
        }
      }
    }
    if (this.rightDown) {
      this.rightHeldMs += dt;
      if (this.rightHeldMs >= this.dasMs) {
        this.rightRepeatMs += dt;
        while (this.rightRepeatMs >= this.arrMs) {
          this.actions.moveRight();
          this.rightRepeatMs -= this.arrMs;
        }
      }
    }
    this.actions.softDrop(this.downDown);
  }

  private onPointerDown = (): void => {
    this.actions.start();
    this.actions.skipCutscene();
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    // Prevent scrolling with space/arrows.
    if ([' ', 'ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp'].includes(e.key)) e.preventDefault();
    if (e.repeat) return;
    this.actions.menuKey(e.key, e);
    this.actions.start();
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
