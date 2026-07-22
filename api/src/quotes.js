export const QUOTE_SYMBOLS = ['MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'AMD', 'AVGO', 'ORCL', 'PLTR', 'TSM'];

const CACHE_TTL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 3_000;
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 150;
const MAX_CONCURRENT_REQUESTS = 2;
export const QUOTE_RESPONSE_CACHE_CONTROL = 'public, max-age=60, s-maxage=60';

export function normalizeYahooQuote(symbol, payload) {
  const meta = payload?.chart?.result?.[0]?.meta;
  const price = Number(meta?.regularMarketPrice);
  const previousClose = Number(meta?.chartPreviousClose);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(previousClose) || previousClose <= 0) {
    throw new Error(`Invalid delayed quote for ${symbol}`);
  }

  const changePercent = Number((((price - previousClose) / previousClose) * 100).toFixed(2));
  return {
    symbol,
    price: Number(price.toFixed(2)),
    changePercent,
    direction: changePercent > 0 ? 'up' : changePercent < 0 ? 'down' : 'flat',
  };
}

function quoteUrl(symbol) {
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
}

function wait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function providerError(status) {
  const error = new Error(`Quote provider returned ${status}`);
  error.retryable = status === 429 || status >= 500;
  return error;
}

async function mapWithConcurrency(values, maxConcurrentRequests, mapper) {
  const results = new Array(values.length);
  let nextIndex = 0;
  const workerCount = Math.min(maxConcurrentRequests, values.length);

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = { status: 'fulfilled', value: await mapper(values[index]) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

export async function fetchDelayedQuote(symbol, fetchImpl = fetch, options = {}) {
  const {
    sleep = wait,
    timeoutMs = REQUEST_TIMEOUT_MS,
    maxAttempts = MAX_ATTEMPTS,
    baseDelayMs = BASE_BACKOFF_MS,
    random = Math.random,
  } = options;
  let lastError;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetchImpl(quoteUrl(symbol), {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw providerError(response.status);
      return normalizeYahooQuote(symbol, await response.json());
    } catch (error) {
      lastError = error;
      const retryable = !(error && error.retryable === false);
      if (!retryable || attempt === maxAttempts - 1) throw error;
      const exponentialDelay = baseDelayMs * 2 ** attempt;
      await sleep(Math.round(exponentialDelay * (1 + random() * 0.2)));
    }
  }

  throw lastError;
}

export function createDelayedQuoteService(options = {}) {
  const {
    fetchImpl = fetch,
    now = () => Date.now(),
    sleep = wait,
    timeoutMs = REQUEST_TIMEOUT_MS,
    maxAttempts = MAX_ATTEMPTS,
    baseDelayMs = BASE_BACKOFF_MS,
    maxConcurrentRequests = MAX_CONCURRENT_REQUESTS,
    random = Math.random,
  } = options;
  let cachedQuotes = null;
  let inFlightRefresh = null;

  async function refresh() {
    const results = await mapWithConcurrency(
      QUOTE_SYMBOLS,
      maxConcurrentRequests,
      (symbol) => fetchDelayedQuote(symbol, fetchImpl, {
        sleep,
        timeoutMs,
        maxAttempts,
        baseDelayMs,
        random,
      }),
    );
    const quotes = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
    if (quotes.length === 0) throw new Error('No delayed quotes available');

    const value = {
      quotes,
      delayed: true,
      asOf: new Date(now()).toISOString(),
    };
    cachedQuotes = { cachedAt: now(), value };
    return value;
  }

  async function getDelayedQuotes() {
    if (cachedQuotes && now() - cachedQuotes.cachedAt < CACHE_TTL_MS) return cachedQuotes.value;
    if (!inFlightRefresh) {
      inFlightRefresh = refresh().finally(() => {
        inFlightRefresh = null;
      });
    }
    return inFlightRefresh;
  }

  return { getDelayedQuotes };
}

const defaultQuoteService = createDelayedQuoteService();

export function getDelayedQuotes() {
  return defaultQuoteService.getDelayedQuotes();
}
