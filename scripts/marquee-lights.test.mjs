import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');

test('uses occasional blinking instead of crawling marquee lights', () => {
  const css = fs.readFileSync(path.join(root, 'src', 'style.css'), 'utf8');

  assert.match(css, /animation:\s*marquee-blink\s+5s\s+steps\(1, end\)\s+infinite/);
  assert.doesNotMatch(css, /animation:\s*chase\s+/);
  assert.doesNotMatch(css, /@keyframes chase/);
});
