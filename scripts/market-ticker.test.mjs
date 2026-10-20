import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import { QUOTE_SYMBOLS } from '../api/src/quotes.js';

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

const { buildTickerLoops, buildTickerSegments, initializeMarketTicker, syncTickerSpeed, QUOTE_FETCH_OPTIONS, tickerDurationForWidth, TICKER_PX_PER_SEC } = loadTypeScriptModule(path.join(root, 'src', 'market-ticker.ts'));

test('keeps a constant crawl speed regardless of content width', () => {
  // One full -50% loop of a 1400px-wide track at 70px/s takes 10 seconds.
  assert.equal(TICKER_PX_PER_SEC, 70);
  assert.equal(tickerDurationForWidth(1400), 10);
  assert.equal(tickerDurationForWidth(700), 5);
  // Degenerate widths still get a sane minimum duration.
  assert.equal(tickerDurationForWidth(100), 4);
});

test('allows browser caching for delayed quote responses', () => {
  assert.deepEqual(QUOTE_FETCH_OPTIONS, { cache: 'default' });
});

test('reduced effects hide the ticker rather than leaving a frozen stock list', () => {
  const css = fs.readFileSync(path.join(root, 'src', 'style.css'), 'utf8');
  assert.ok(/body\.reduced-effects\s+\.ticker\s*\{[^}]*display:\s*none\s*;/.test(css));
});

test('recalculates ticker entry and speed when a hidden ticker becomes visible', () => {
  const track = {
    scrollWidth: 0,
    parentElement: { clientWidth: 0 },
    style: { setProperty(name, value) { this[name] = value; } },
  };
  syncTickerSpeed(track);
  assert.equal(track.style.animationDuration, undefined);
  track.scrollWidth = 1400;
  track.parentElement.clientWidth = 700;
  syncTickerSpeed(track);
  assert.equal(track.style.animationDuration, '10s, 10s');
  assert.equal(track.style['--ticker-entry-offset'], '700px');
});

test('uses the comfortable thirty-two-second ticker crawl', () => {
  const css = fs.readFileSync(path.join(root, 'src', 'style.css'), 'utf8');

  assert.match(css, /scroll-x\s+32s\s+linear\s+infinite/);
});

test('ticker entry moves from the right edge to the seamless loop start', () => {
  const css = fs.readFileSync(path.join(root, 'src', 'style.css'), 'utf8');
  assert.match(css, /animation:\s*ticker-enter\s+0s\s+linear,\s*scroll-x/);
  assert.match(css, /@keyframes ticker-enter\s*\{\s*from\s*\{\s*transform:\s*translateX\(var\(--ticker-entry-offset,\s*0px\)\)/);
  assert.match(css, /@keyframes ticker-enter[\s\S]*?to\s*\{\s*transform:\s*translateX\(0\)/);
});

test('uses loop gap instead of terminal segment padding for a seamless reset', () => {
  const css = fs.readFileSync(path.join(root, 'src', 'style.css'), 'utf8');

  assert.match(css, /\.ticker-loop\s*\{[\s\S]*?gap:\s*18px/);
  assert.doesNotMatch(css, /\.ticker-segment\s*\{[\s\S]*?padding-right/);
});

test('quotes have no boxed separators or extra side padding', () => {
  const css = fs.readFileSync(path.join(root, 'src', 'style.css'), 'utf8');
  const quoteRule = css.match(/\.ticker-quote\s*\{([^}]*)\}/)?.[1];
  assert.ok(quoteRule);
  assert.doesNotMatch(quoteRule, /\b(?:border|padding)(?:-[a-z-]+)?\s*:/);
});

test('uses one divider between adjacent stocks instead of boxing every quote', () => {
  const css = fs.readFileSync(path.join(root, 'src', 'style.css'), 'utf8');
  const dividerRule = css.match(/\.ticker-quote\s*\+\s*\.ticker-quote\s*\{([^}]*)\}/)?.[1];
  assert.ok(dividerRule);
  assert.match(dividerRule, /border-left:\s*1px solid/);
  assert.doesNotMatch(dividerRule, /\bborder(?:-(?:right|top|bottom))?\s*:/);
});

test('separates the portfolio name from the first stock with the same divider', () => {
  const css = fs.readFileSync(path.join(root, 'src', 'style.css'), 'utf8');
  const dividerRule = css.match(/\.ticker-phrase\s*\+\s*\.ticker-quote\s*,\s*\.ticker-quote\s*\+\s*\.ticker-quote\s*\{([^}]*)\}/)?.[1];
  assert.ok(dividerRule);
  assert.match(dividerRule, /border-left:\s*1px solid/);
});

test('shows only the portfolio name when quotes are unavailable', () => {
  assert.deepEqual(buildTickerSegments([]), [
    { type: 'phrase', text: 'Circuit Breaker AI Portfolio' },
  ]);
});

test('places the portfolio name before quotes without interleaved messages', () => {
  const segments = buildTickerSegments([
    { symbol: 'MSFT', price: 410, changePercent: 2.5, direction: 'up' },
    { symbol: 'AAPL', price: 200, changePercent: -1.5, direction: 'down' },
  ]);

  assert.equal(segments.length, 3);
  assert.deepEqual(segments.map((segment) => segment.type), ['phrase', 'quote', 'quote']);
  assert.equal(segments[0].text, 'Circuit Breaker AI Portfolio');
  assert.deepEqual(segments[1], {
    type: 'quote',
    text: 'MSFT 410.00 ▲ +2.50%',
    direction: 'up',
  });
  assert.deepEqual(segments[2], {
    type: 'quote',
    text: 'AAPL 200.00 ▼ -1.50%',
    direction: 'down',
  });
});

test('repeats the portfolio name only after the complete configured stock list', () => {
  const quotes = QUOTE_SYMBOLS.map((symbol) => ({ symbol, price: 100, changePercent: 0, direction: 'flat' }));
  const loops = buildTickerLoops(buildTickerSegments(quotes));
  for (const loop of loops) {
    assert.equal(loop[0].text, 'Circuit Breaker AI Portfolio');
    assert.equal(loop.filter((segment) => segment.type === 'phrase').length, 1);
    assert.deepEqual(loop.slice(1).map((segment) => segment.text.split(' ')[0]), QUOTE_SYMBOLS);
  }
});

test('static ticker fallback matches the portfolio-only message', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const loops = [...html.matchAll(/<div class="ticker-loop"[^>]*>([^<]*)<\/div>/g)];
  assert.deepEqual(loops.map((match) => match[1].trim()), [
    'Circuit Breaker AI Portfolio',
    'Circuit Breaker AI Portfolio',
  ]);
});

test('renders only the portfolio name and quotes without leftover phrase separators', async () => {
  const previousDocument = globalThis.document;
  const previousFetch = globalThis.fetch;
  const element = () => ({
    children: [],
    style: { setProperty(name, value) { this[name] = value; } },
    parentElement: { clientWidth: 700 },
    scrollWidth: 1400,
    setAttribute() {},
    append(child) { this.children.push(child); },
    replaceChildren() { this.children = []; },
  });
  const track = element();
  globalThis.document = {
    getElementById: () => track,
    createElement: element,
  };
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ quotes: [
      { symbol: 'MSFT', price: 410, changePercent: 2.5, direction: 'up' },
      { symbol: 'MU', price: 100, changePercent: -1, direction: 'down' },
    ] }),
  });
  try {
    await initializeMarketTicker();
    assert.equal(track.style['--ticker-entry-offset'], '700px');
    assert.equal(track.style.animationDuration, '10s, 10s');
    assert.equal(track.style.animationDelay, '0s, 10s');
    assert.equal(track.children.length, 2);
    for (const loop of track.children) {
      assert.deepEqual(loop.children.map((item) => item.textContent), [
        'Circuit Breaker AI Portfolio',
        'MSFT 410.00 ▲ +2.50%',
        'MU 100.00 ▼ -1.00%',
      ]);
    }
  } finally {
    globalThis.document = previousDocument;
    globalThis.fetch = previousFetch;
  }
});

test('creates two identical ticker loops for seamless scrolling', () => {
  const segments = buildTickerSegments([
    { symbol: 'MSFT', price: 410, changePercent: 2.5, direction: 'up' },
  ]);

  const loops = buildTickerLoops(segments);

  assert.equal(loops.length, 2);
  assert.deepEqual(loops[0], loops[1]);
});
