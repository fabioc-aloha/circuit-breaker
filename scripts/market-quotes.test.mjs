import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
    createDelayedQuoteService,
    fetchDelayedQuote,
    normalizeYahooQuote,
    QUOTE_RESPONSE_CACHE_CONTROL,
    QUOTE_SYMBOLS,
} from '../api/src/quotes.js';

const root = path.resolve(import.meta.dirname, '..');

test('uses ten configured market symbols', () => {
  assert.deepEqual(QUOTE_SYMBOLS, ['MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'AMD', 'AVGO', 'ORCL', 'PLTR', 'TSM']);
});

test('allows a short public cache for delayed quote responses', () => {
  assert.equal(QUOTE_RESPONSE_CACHE_CONTROL, 'public, max-age=60, s-maxage=60');
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
          regularMarketTime: 1_700_000_000,
        },
      }],
    },
  });

  assert.deepEqual(quote, {
    symbol: 'MSFT',
    price: 410,
    changePercent: 2.5,
    direction: 'up',
    marketTime: '2023-11-14T22:13:20.000Z',
  });
});

test('uses the latest provider market time as the quote response timestamp', async () => {
  const quotes = createDelayedQuoteService({
    fetchImpl: async (_url) => ({
      ok: true,
      async json() {
        return {
          chart: {
            result: [{
              meta: {
                chartPreviousClose: 100,
                regularMarketPrice: 101,
                regularMarketTime: 1_700_000_000,
              },
            }],
          },
        };
      },
    }),
    now: () => 1_800_000_000_000,
  });

  const result = await quotes.getDelayedQuotes();

  assert.equal(result.asOf, '2023-11-14T22:13:20.000Z');
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
    random: () => 0.5,
  });

  assert.equal(quote.symbol, 'MSFT');
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [165, 330]);
});

test('does not retry malformed provider quote data', async () => {
  let attempts = 0;

  await assert.rejects(
    fetchDelayedQuote('MSFT', async () => {
      attempts += 1;
      return {
        ok: true,
        async json() {
          return { chart: { result: [{ meta: { chartPreviousClose: 100 } }] } };
        },
      };
    }, { sleep: async () => {} }),
  );

  assert.equal(attempts, 1);
});

test('limits concurrent provider requests during a refresh', async () => {
  let activeRequests = 0;
  let peakRequests = 0;
  const quotes = createDelayedQuoteService({
    maxConcurrentRequests: 2,
    fetchImpl: async () => {
      activeRequests += 1;
      peakRequests = Math.max(peakRequests, activeRequests);
      await new Promise((resolve) => setTimeout(resolve, 0));
      activeRequests -= 1;
      return {
        ok: true,
        async json() {
          return { chart: { result: [{ meta: { chartPreviousClose: 100, regularMarketPrice: 101 } }] } };
        },
      };
    },
    now: () => 1_000,
  });

  const result = await quotes.getDelayedQuotes();

  assert.equal(result.quotes.length, QUOTE_SYMBOLS.length);
  assert.equal(peakRequests, 2);
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
