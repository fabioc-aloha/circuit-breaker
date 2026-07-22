import assert from 'node:assert/strict';
import test from 'node:test';
import { renderTrackerMarkup } from './tracker-markup.mjs';

test('omits tracker activation from preview builds', () => {
  assert.equal(renderTrackerMarkup(false), '');
});

test('emits exactly one production tracker activation block', () => {
  const markup = renderTrackerMarkup(true);
  assert.equal((markup.match(/name="correax-tracker"/g) ?? []).length, 1);
  assert.equal((markup.match(/\/client\/constellation-tracker\.js/g) ?? []).length, 1);
  assert.equal((markup.match(/\/client\/tracker-bootstrap\.js/g) ?? []).length, 1);
  assert.match(markup, /content="enabled"/);
  assert.match(markup, /\bdefer\b/);
});
