import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');

function loadTypeScriptModule(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} };
  new Function('exports', 'module', output)(module.exports, module);
  return module.exports;
}

const { buildTickerLoops, buildTickerSegments } = loadTypeScriptModule(path.join(root, 'src', 'market-ticker.ts'));

test('uses the readable twenty-eight-second ticker crawl', () => {
  const css = fs.readFileSync(path.join(root, 'src', 'style.css'), 'utf8');

  assert.match(css, /animation:\s*scroll-x\s+28s\s+linear\s+infinite/);
});

test('uses loop gap instead of terminal segment padding for a seamless reset', () => {
  const css = fs.readFileSync(path.join(root, 'src', 'style.css'), 'utf8');

  assert.match(css, /\.ticker-loop\s*\{[\s\S]*?gap:\s*18px/);
  assert.doesNotMatch(css, /\.ticker-segment\s*\{[\s\S]*?padding-right/);
});

test('uses the ten-phrase arcade cycle in the fallback crawl', () => {
  const phrases = buildTickerSegments([]).map((segment) => segment.text);

  assert.deepEqual(phrases, [
    'INSERT COIN TO CONTINUE',
    'VIBE CODE DEPLOYED',
    'LOOP ENGINEERING ACTIVE',
    'PROMPT STACK OVERCLOCKED',
    'AGENT MODE ENGAGED',
    'TOKEN BUDGET CRITICAL',
    'CONTEXT WINDOW MAXED',
    'INFERENCE ENGINE HOT',
    'RAG PIPELINE ARMED',
    'HUMAN IN THE LOOP',
  ]);
  assert.equal(phrases.length, 10);
});

test('alternates arcade phrases and delayed quotes', () => {
  const segments = buildTickerSegments([
    { symbol: 'MSFT', price: 410, changePercent: 2.5, direction: 'up' },
    { symbol: 'AAPL', price: 200, changePercent: -1.5, direction: 'down' },
  ]);

  assert.equal(segments.length, 4);
  assert.deepEqual(segments.map((segment) => segment.type), ['phrase', 'quote', 'phrase', 'quote']);
  assert.deepEqual(segments[1], {
    type: 'quote',
    text: 'MSFT 410.00 ▲ +2.50%',
    direction: 'up',
  });
  assert.deepEqual(segments[3], {
    type: 'quote',
    text: 'AAPL 200.00 ▼ -1.50%',
    direction: 'down',
  });
});

test('creates two identical ticker loops for seamless scrolling', () => {
  const segments = buildTickerSegments([
    { symbol: 'MSFT', price: 410, changePercent: 2.5, direction: 'up' },
  ]);

  const loops = buildTickerLoops(segments);

  assert.equal(loops.length, 2);
  assert.deepEqual(loops[0], loops[1]);
});
