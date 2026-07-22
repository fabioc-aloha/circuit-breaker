import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  createDelayedQuoteService,
  fetchDelayedQuote,
  normalizeYahooQuote,
  QUOTE_SYMBOLS,
} from '../api/src/quotes.js';

const root = path.resolve(import.meta.dirname, '..');

test('uses ten configured market symbols', () => {
  assert.equal(QUOTE_SYMBOLS.length, 10);
});

test('declares the Azure Functions v4 entry point', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'api', 'package.json'), 'utf8'));

  assert.equal(packageJson.main, 'src/functions/*.js');
});

test('normalizes delayed provider data into a direction-safe quote', () => {
  const quote = normalizeYahooQuote('MSFT', {
    chart: {
      result: [{
        meta: {
          chartPreviousClose: 400,
          regularMarketPrice: 410,
        },
      }],
    },
  });

  assert.deepEqual(quote, {
    symbol: 'MSFT',
    price: 410,
    changePercent: 2.5,
    direction: 'up',
  });
});

test('caches delayed quote provider responses for five minutes', async () => {
  let requests = 0;
  const fetchImpl = async () => {
    requests += 1;
    return {
      ok: true,
      async json() {
        return {
          chart: {
            result: [{ meta: { chartPreviousClose: 100, regularMarketPrice: 101 } }],
          },
        };
      },
    };
  };

  const quotes = createDelayedQuoteService({ fetchImpl, now: () => 1_000 });
  const first = await quotes.getDelayedQuotes();
  const second = await quotes.getDelayedQuotes();

  assert.equal(first.quotes.length, QUOTE_SYMBOLS.length);
  assert.equal(second, first);
  assert.equal(requests, QUOTE_SYMBOLS.length);
});

test('retries transient provider failures with exponential backoff', async () => {
  let attempts = 0;
  const delays = [];
  const quote = await fetchDelayedQuote('MSFT', async (_url, options) => {
    attempts += 1;
    assert.ok(options.signal);
    if (attempts < 3) return { ok: false, status: 503 };
    return {
      ok: true,
      async json() {
        return { chart: { result: [{ meta: { chartPreviousClose: 100, regularMarketPrice: 102 } }] } };
      },
    };
  }, {
    sleep: async (delay) => delays.push(delay),
    timeoutMs: 250,
  });

  assert.equal(quote.symbol, 'MSFT');
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [150, 300]);
});

test('coalesces concurrent cold-cache quote refreshes', async () => {
  let requests = 0;
  const quotes = createDelayedQuoteService({
    fetchImpl: async () => {
      requests += 1;
      return {
        ok: true,
        async json() {
          return { chart: { result: [{ meta: { chartPreviousClose: 100, regularMarketPrice: 101 } }] } };
        },
      };
    },
    now: () => 1_000,
  });

  const [first, second] = await Promise.all([quotes.getDelayedQuotes(), quotes.getDelayedQuotes()]);

  assert.equal(first, second);
  assert.equal(requests, QUOTE_SYMBOLS.length);
});
