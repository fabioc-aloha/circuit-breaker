import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');

test('exposes a secure Loop Engineering Amazon purchase command', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

  assert.match(html, /href="https:\/\/a\.co\/d\/0i5XuFTn"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /INSERT COIN TO PLAY/);
  assert.match(html, /class="coin-slot-purchase"[\s\S]*LOOP ENGINEERING[\s\S]*BUY THE BOOK/);
  assert.doesNotMatch(html, /Amazon Associate|affiliate-disclosure|sponsored/);
});
