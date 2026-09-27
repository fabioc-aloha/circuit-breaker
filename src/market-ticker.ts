export interface MarketQuote {
  symbol: string;
  price: number;
  changePercent: number;
  direction: 'up' | 'down' | 'flat';
  marketTime?: string;
}

export interface TickerSegment {
  type: 'phrase' | 'quote';
  text: string;
  direction?: MarketQuote['direction'];
  marketTime?: string;
}

export const QUOTE_FETCH_OPTIONS = { cache: 'default' } as const;

// Constant crawl speed (px/sec) so the ticker reads the same whether it's
// showing the 10-phrase fallback or a full board of live quotes. The CSS
// keeps a 32s fallback duration for first paint / no-JS; once the track is
// measured we override animation-duration inline.
export const TICKER_PX_PER_SEC = 70;

/** Seconds for one full -50% loop of a track `trackWidthPx` wide. */
export function tickerDurationForWidth(trackWidthPx: number): number {
  return Math.max(4, trackWidthPx / 2 / TICKER_PX_PER_SEC);
}

/**
 * Pin the CSS animation duration to the measured content width and restart
 * the animation so the -50% loop seam stays aligned with the fresh content.
 * Without the restart, replacing children mid-flight moves the seam and the
 * crawl visibly pops when quotes arrive.
 */
function syncTickerSpeed(track: HTMLElement): void {
  const half = track.scrollWidth / 2;
  if (!(half > 0)) return;
  track.style.animationDuration = `${tickerDurationForWidth(track.scrollWidth)}s`;
  track.style.animationName = 'none';
  // Force reflow so the animation-name toggle takes effect.
  void track.offsetWidth;
  track.style.animationName = '';
}

const ARCADE_PHRASES = [
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
];

function formatQuote(quote: MarketQuote): string {
  const arrow = quote.direction === 'up' ? '▲' : quote.direction === 'down' ? '▼' : '◆';
  const change = `${quote.changePercent >= 0 ? '+' : ''}${quote.changePercent.toFixed(2)}%`;
  return `${quote.symbol} ${quote.price.toFixed(2)} ${arrow} ${change}`;
}

export function buildTickerSegments(quotes: MarketQuote[]): TickerSegment[] {
  if (quotes.length === 0) return ARCADE_PHRASES.map((text) => ({ type: 'phrase', text }));

  const segments: TickerSegment[] = [];
  for (let quoteIndex = 0; quoteIndex < quotes.length; quoteIndex++) {
    const text = ARCADE_PHRASES[quoteIndex % ARCADE_PHRASES.length];
    segments.push({ type: 'phrase', text });
    const quote = quotes[quoteIndex];
    segments.push({
      type: 'quote',
      text: formatQuote(quote),
      direction: quote.direction,
      ...(quote.marketTime ? { marketTime: quote.marketTime } : {}),
    });
  }
  return segments;
}

export function buildTickerLoops(segments: TickerSegment[]): [TickerSegment[], TickerSegment[]] {
  return [segments, segments];
}

function isMarketQuote(value: unknown): value is MarketQuote {
  if (!value || typeof value !== 'object') return false;
  const quote = value as Record<string, unknown>;
  return typeof quote.symbol === 'string'
    && typeof quote.price === 'number'
    && Number.isFinite(quote.price)
    && typeof quote.changePercent === 'number'
    && Number.isFinite(quote.changePercent)
    && (quote.direction === 'up' || quote.direction === 'down' || quote.direction === 'flat')
    && (quote.marketTime === undefined || typeof quote.marketTime === 'string');
}

function renderTicker(track: HTMLElement, segments: TickerSegment[]): void {
  track.replaceChildren();
  const loops = buildTickerLoops(segments);
  for (let loopIndex = 0; loopIndex < loops.length; loopIndex++) {
    const loop = document.createElement('div');
    loop.className = 'ticker-loop';
    if (loopIndex > 0) loop.setAttribute('aria-hidden', 'true');
    for (const segment of loops[loopIndex]) {
      const item = document.createElement('span');
      item.className = `ticker-segment ticker-${segment.type}${segment.direction ? ` ticker-${segment.direction}` : ''}`;
      item.textContent = `◆ ${segment.text} `;
      if (segment.type === 'quote') {
        item.title = segment.marketTime
          ? `Indicative quote as of ${new Date(segment.marketTime).toLocaleString()}`
          : 'Indicative market quote';
      }
      loop.append(item);
    }
    track.append(loop);
  }
  syncTickerSpeed(track);
}

export async function initializeMarketTicker(): Promise<void> {
  const track = document.getElementById('ticker-track');
  if (!track) return;

  renderTicker(track, buildTickerSegments([]));
  // Webfont arrival changes the measured width — re-pin the speed once fonts
  // settle so the crawl stays at exactly TICKER_PX_PER_SEC.
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    void document.fonts.ready.then(() => syncTickerSpeed(track));
  }
  try {
    const response = await fetch('/api/quotes', QUOTE_FETCH_OPTIONS);
    if (!response.ok) return;
    const payload = await response.json() as { quotes?: unknown };
    if (!Array.isArray(payload.quotes)) return;
    const quotes = payload.quotes.filter(isMarketQuote);
    if (quotes.length > 0) renderTicker(track, buildTickerSegments(quotes));
  } catch {
    // The arcade crawl remains usable when delayed quote data is unavailable.
  }
}
