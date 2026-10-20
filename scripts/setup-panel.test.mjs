import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function fixture() {
  const source = fs.readFileSync(new URL('../src/setup-panel.ts', import.meta.url), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', output)(exports);
  let focused = null;
  class Node extends EventTarget {
    attributes = new Map();
    hidden = false;
    disabled = false;
    open = false;
    tabIndex = 0;
    dataset = {};
    textContent = '';
    constructor(id, tag = 'BUTTON') { super(); this.id = id; this.tagName = tag; }
    setAttribute(name, value) { this.attributes.set(name, value); }
    getAttribute(name) { return this.attributes.get(name); }
    focus() { focused = this; }
    showModal() { this.open = true; }
    close() { this.open = false; }
    closest(selector) {
      return selector.split(',').some((tag) => tag.trim().toUpperCase() === this.tagName) ? this : null;
    }
    click() { this.dispatchEvent(new Event('click')); }
  }
  const tabs = ['play', 'settings', 'controls'].map((name) => {
    const tab = new Node(`tab-${name}`);
    tab.setAttribute('aria-controls', `panel-${name}`);
    return tab;
  });
  const panels = tabs.map((tab) => new Node(tab.getAttribute('aria-controls'), 'SECTION'));
  const seed = new Node('run-seed', 'INPUT');
  const start = new Node('boot-start');
  const back = new Node('setup-back');
  const title = new Node('setup-title', 'H2');
  const description = new Node('setup-description', 'P');
  const dialog = new Node('setup-dialog', 'DIALOG');
  const nodes = [...tabs, ...panels, seed, start, back, title, description];
  dialog.querySelector = (selector) => nodes.find((node) => selector === `#${node.id}`);
  dialog.querySelectorAll = (selector) => selector === '[role="tab"]' ? tabs : panels;
  let starts = 0;
  let closes = 0;
  let shortcuts = 0;
  let resumes = 0;
  const panel = new exports.SetupPanel(dialog, {
    start: () => { starts++; },
    close: () => { closes++; },
    shortcut: () => { shortcuts++; },
    resume: () => { resumes++; },
  });
  function key(target, key, eventTarget = target) {
    const event = new Event('keydown', { cancelable: true });
    Object.defineProperties(event, { key: { value: key }, target: { value: eventTarget } });
    target.dispatchEvent(event);
    return event;
  }
  return { panel, dialog, tabs, panels, seed, start, back, key, Node,
    state: () => ({ starts, closes, shortcuts, resumes, focused }) };
}

test('main menu exposes run choices without starting or resuming the paused run', () => {
  const f = fixture();
  f.panel.open('main-menu');
  assert.equal(f.tabs[0].hidden, false);
  assert.equal(f.seed.disabled, false);
  assert.deepEqual(f.panels.map((panel) => panel.hidden), [false, true, true]);
  assert.equal(f.start.textContent, 'START NEW GAME');
  assert.equal(f.back.hidden, false);
  assert.deepEqual([f.state().starts, f.state().resumes, f.state().closes], [0, 0, 0]);
  f.tabs[1].click();
  f.start.click();
  assert.deepEqual([f.state().starts, f.state().resumes], [1, 0]);
});

for (const action of ['Back to Game', 'Escape']) {
  test(`main menu ${action} resumes the existing run without starting another`, () => {
    const f = fixture();
    f.panel.open('main-menu');
    f.panel.select('settings');
    if (action === 'Back to Game') f.back.click();
    else f.dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    assert.equal(f.dialog.open, false);
    assert.deepEqual([f.state().starts, f.state().resumes, f.state().closes], [0, 1, 0]);
  });
}

test('Back to Game is hidden outside the main menu and paused settings stay locked', () => {
  const f = fixture();
  f.panel.open('main-menu');
  f.panel.open('startup');
  assert.equal(f.back.hidden, true);
  assert.equal(f.start.textContent, 'START GAME');
  f.panel.open('paused-settings');
  assert.equal(f.back.hidden, true);
  assert.equal(f.tabs[0].hidden, true);
  assert.equal(f.seed.disabled, true);
  assert.equal(f.start.textContent, 'BACK TO PAUSE');
});

test('setup opens on Play and switches exactly one accessible tab at a time', () => {
  const f = fixture();
  f.panel.open('startup');
  assert.equal(f.dialog.open, true);
  assert.equal(f.tabs[0].getAttribute('aria-selected'), 'true');
  assert.equal(f.seed.disabled, false);
  f.tabs[1].click();
  assert.deepEqual(f.panels.map((panel) => panel.hidden), [true, false, true]);
  assert.deepEqual(f.tabs.map((tab) => tab.tabIndex), [-1, 0, -1]);
  assert.equal(f.tabs[1].getAttribute('aria-selected'), 'true');
  f.start.click();
  assert.equal(f.state().starts, 1);
});

test('tab keyboard navigation wraps and supports Home and End', () => {
  const f = fixture();
  f.panel.open('startup');
  assert.equal(f.key(f.tabs[0], 'ArrowLeft').defaultPrevented, true);
  assert.equal(f.state().focused, f.tabs[2]);
  f.key(f.tabs[2], 'Home');
  assert.equal(f.state().focused, f.tabs[0]);
  f.key(f.tabs[0], 'End');
  assert.equal(f.state().focused, f.tabs[2]);
});

test('paused settings hide Play, lock the seed, and close without starting or resuming', () => {
  const f = fixture();
  f.panel.open('paused-settings');
  assert.equal(f.tabs[0].hidden, true);
  assert.equal(f.seed.disabled, true);
  assert.deepEqual(f.panels.map((panel) => panel.hidden), [true, false, true]);
  f.key(f.tabs[1], 'ArrowLeft');
  assert.equal(f.state().focused, f.tabs[2]);
  f.panel.select('play');
  assert.equal(f.panels[0].hidden, true, 'locked Play cannot be opened programmatically');
  f.start.click();
  assert.equal(f.dialog.open, false);
  assert.deepEqual([f.state().starts, f.state().closes], [0, 1]);
});

test('Escape keeps startup open but returns paused settings to the pause screen', () => {
  const f = fixture();
  f.panel.open('startup');
  f.panel.select('settings');
  const cancel = new Event('cancel', { cancelable: true });
  f.dialog.dispatchEvent(cancel);
  assert.equal(cancel.defaultPrevented, true);
  assert.equal(f.dialog.open, true);
  assert.equal(f.panels[0].hidden, false);
  f.panel.open('paused-settings');
  f.dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
  assert.equal(f.dialog.open, false);
  assert.equal(f.state().closes, 1);
});

test('buttons, sliders, text fields, and disclosures keep native activation keys', () => {
  const f = fixture();
  f.panel.open('startup');
  for (const tag of ['BUTTON', 'INPUT', 'SUMMARY', 'SELECT', 'TEXTAREA', 'A']) {
    for (const key of ['Enter', ' ']) f.key(f.dialog, key, new f.Node('control', tag));
  }
  assert.equal(f.state().shortcuts, 0);
  f.key(f.dialog, '1', f.tabs[0]);
  assert.equal(f.state().shortcuts, 1);
});

test('Space scrolls setup content instead of starting a run', () => {
  const f = fixture();
  f.panel.open('startup');
  f.key(f.dialog, ' ', f.panels[0]);
  assert.equal(f.state().shortcuts, 0);
});
