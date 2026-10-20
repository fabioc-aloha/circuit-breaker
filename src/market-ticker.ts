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
// showing the portfolio name alone or a full board of live quotes. The CSS
// keeps a 32s fallback duration for first paint / no-JS; once the track is
// measured we override animation-duration inline.
export const TICKER_PX_PER_SEC = 70;

const tickerGeometry = new WeakMap<HTMLElement, { width: number; viewportWidth: number }>();

/** Seconds for one full -50% loop of a track `trackWidthPx` wide. */
export function tickerDurationForWidth(trackWidthPx: number): number {
  return trackWidthPx / 2 / TICKER_PX_PER_SEC;
}

function tickerOffset(track: HTMLElement): number | undefined {
  const viewport = track.parentElement;
  const geometry = tickerGeometry.get(track);
  if (!viewport || !geometry) return undefined;
  const rect = track.getBoundingClientRect();
  const offset = rect.left
    - viewport.getBoundingClientRect().left - viewport.clientLeft;
  // Percentage loop transforms have already scaled to the new font/width.
  return offset < 0 && rect.width > 0 ? offset * geometry.width / rect.width : offset;
}

/** Retime changed geometry without sending an in-flight title back to the right. */
export function syncTickerSpeed(track: HTMLElement, offset = tickerOffset(track)): void {
  const viewportWidth = track.parentElement?.clientWidth ?? 0;
  if (!(viewportWidth > 0)) {
    tickerGeometry.delete(track);
    return;
  }
  track.style.setProperty('--ticker-viewport-width', `${viewportWidth}px`);
  const width = track.getBoundingClientRect().width;
  if (!(width > 0)) return;
  const previous = tickerGeometry.get(track);
  if (previous?.width === width && previous.viewportWidth === viewportWidth) return;

  const position = offset ?? viewportWidth;
  const entryWidth = Math.max(0, position);
  const entrySeconds = entryWidth / TICKER_PX_PER_SEC;
  const loopOffset = Math.min(0, position) % (width / 2);
  track.style.setProperty('--ticker-entry-offset', `${entryWidth}px`);
  track.style.animationDuration = `${entrySeconds}s, ${tickerDurationForWidth(width)}s`;
  track.style.animationDelay = `0s, ${entrySeconds + loopOffset / TICKER_PX_PER_SEC}s`;
  track.style.animationName = 'none';
  // Apply the new timeline at the old pixel position, including mid-loop.
  void track.offsetWidth;
  track.style.animationName = '';
  tickerGeometry.set(track, { width, viewportWidth });
}

const PORTFOLIO_NAME = 'Circuit Breaker AI Portfolio';

function formatQuote(quote: MarketQuote): string {
  const arrow = quote.direction === 'up' ? '▲' : quote.direction === 'down' ? '▼' : '◆';
  const change = `${quote.changePercent >= 0 ? '+' : ''}${quote.changePercent.toFixed(2)}%`;
  return `${quote.symbol} ${quote.price.toFixed(2)} ${arrow} ${change}`;
}

export function buildTickerSegments(quotes: MarketQuote[]): TickerSegment[] {
  const segments: TickerSegment[] = [{ type: 'phrase', text: PORTFOLIO_NAME }];
  for (const quote of quotes) {
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
  const offset = tickerOffset(track);
  track.replaceChildren();
  const loops = buildTickerLoops(segments);
  for (let loopIndex = 0; loopIndex < loops.length; loopIndex++) {
    const loop = document.createElement('div');
    loop.className = 'ticker-loop';
    if (loopIndex > 0) loop.setAttribute('aria-hidden', 'true');
    for (const segment of loops[loopIndex]) {
      const item = document.createElement('span');
      item.className = `ticker-segment ticker-${segment.type}${segment.direction ? ` ticker-${segment.direction}` : ''}`;
      item.textContent = segment.text;
      if (segment.type === 'quote') {
        item.title = segment.marketTime
          ? `Indicative quote as of ${new Date(segment.marketTime).toLocaleString()}`
          : 'Indicative market quote';
      }
      loop.append(item);
    }
    track.append(loop);
  }
  syncTickerSpeed(track, offset);
}

export async function initializeMarketTicker(): Promise<void> {
  const track = document.getElementById('ticker-track');
  if (!track) return;

  renderTicker(track, buildTickerSegments([]));
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(() => syncTickerSpeed(track));
    observer.observe(track);
    if (track.parentElement) observer.observe(track.parentElement);
  }
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
    // Keep the portfolio name visible when delayed quote data is unavailable.
  }
}
