interface SetupActions {
  start(): void;
  close(): void;
  resume(): void;
  shortcut(key: string, event: KeyboardEvent): void;
}

type SetupContext = 'startup' | 'paused-settings' | 'main-menu';

export class SetupPanel {
  private tabs: HTMLButtonElement[];
  private panels: HTMLElement[];
  private context: SetupContext = 'startup';

  constructor(private dialog: HTMLDialogElement, private actions: SetupActions) {
    this.tabs = Array.from(dialog.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    this.panels = Array.from(dialog.querySelectorAll<HTMLElement>('[role="tabpanel"]'));
    for (const tab of this.tabs) {
      tab.addEventListener('click', () => this.select(tab.id.slice(4)));
      tab.addEventListener('keydown', (event) => {
        const visible = this.tabs.filter((candidate) => !candidate.hidden);
        const index = visible.indexOf(tab);
        let next: number;
        switch (event.key) {
          case 'ArrowRight': next = (index + 1) % visible.length; break;
          case 'ArrowLeft': next = (index + visible.length - 1) % visible.length; break;
          case 'Home': next = 0; break;
          case 'End': next = visible.length - 1; break;
          default: return;
        }
        event.preventDefault();
        this.select(visible[next].id.slice(4));
        visible[next].focus();
      });
    }
    dialog.addEventListener('keydown', (event) => {
      if (event.defaultPrevented || event.key === ' ') return;
      const target = event.target as HTMLElement;
      if (target.closest('input, select, textarea')) return;
      if (['Enter', ' '].includes(event.key) && target.closest('button, summary, a')) return;
      this.actions.shortcut(event.key, event);
    });
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      if (this.context === 'main-menu') this.returnToGame();
      else if (this.context === 'paused-settings') this.returnToPause();
      else this.select('play');
    });
    dialog.querySelector<HTMLButtonElement>('#boot-start')!.addEventListener('click', () => {
      if (this.context === 'paused-settings') this.returnToPause();
      else this.actions.start();
    });
    dialog.querySelector<HTMLButtonElement>('#setup-back')!.addEventListener('click', () => {
      if (this.context === 'main-menu') this.returnToGame();
    });
  }

  select(name: string): void {
    const selected = this.tabs.find((tab) => tab.id === `tab-${name}` && !tab.hidden);
    if (!selected) return;
    for (const tab of this.tabs) {
      tab.setAttribute('aria-selected', String(tab === selected));
      tab.tabIndex = tab === selected ? 0 : -1;
    }
    for (const panel of this.panels) panel.hidden = panel.id !== selected.getAttribute('aria-controls');
  }

  open(context: SetupContext): void {
    this.context = context;
    const paused = context === 'paused-settings';
    const mainMenu = context === 'main-menu';
    this.tabs[0].hidden = paused;
    this.dialog.querySelector<HTMLInputElement>('#run-seed')!.disabled = paused;
    this.dialog.querySelector('#setup-title')!.textContent = paused ? 'Settings' : 'Make it your game';
    this.dialog.querySelector('#setup-description')!.textContent = paused
      ? 'Adjust sound, effects, and handling. Your run stays paused.'
      : mainMenu
        ? 'Your run stays paused. Start a new game to apply mode and difficulty changes.'
        : 'Choose your challenge. Fine-tune the rest in Settings.';
    this.dialog.querySelector('#boot-start')!.textContent = paused
      ? 'BACK TO PAUSE'
      : mainMenu ? 'START NEW GAME' : 'START GAME';
    this.dialog.querySelector<HTMLButtonElement>('#setup-back')!.hidden = !mainMenu;
    this.select(paused ? 'settings' : 'play');
    if (!this.dialog.open) this.dialog.showModal();
  }

  close(): void {
    this.dialog.close();
  }

  private returnToPause(): void {
    this.close();
    this.actions.close();
  }

  private returnToGame(): void {
    this.close();
    this.actions.resume();
  }
}
