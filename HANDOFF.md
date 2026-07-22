# Session Handoff

Last updated: 2026-07-22

## Just shipped

- `927ad94` fix(ticker): clarify indicative quote freshness — retain provider market timestamps, avoid retrying malformed payloads, align docs across `README.md`, `INSTRUMENTATION.md`, `PLAN.md`, `public/llms.txt`, `index.html`.
- `08a2349` fix(loop): preserve frame time and cap pathological stalls — new `src/frame-timing.ts` with `MAX_DELTA_MS = 750`, `visibilitychange` reset in `src/main.ts`, decoupled gravity regression test.
- Both deployed via Azure Static Web Apps: workflow runs `29895969734` and `29896566692`, both success.

## Current state

- `main` and `origin/main` at `08a2349`.
- Working tree clean; `npm run check` reports 50/50 tests, typecheck clean, build clean, site validation PASS.
- Production live at [cb.correax.com](https://cb.correax.com).

## Backlog / notes for next session

- `MAX_DELTA_MS = 750` in [src/frame-timing.ts](src/frame-timing.ts) assumes max level 5 (gravity 600 ms). If a future mode extends past THE MAINFRAME with higher gravity tiers, revisit the cap or make it gravity-adaptive.
- The `/api/quotes` `asOf` value uses the latest provider `marketTime` when available, otherwise the cache refresh time. If the provider ever drops `regularMarketTime`, the response quietly falls back to cache time — reviewers should not read `asOf` as authoritative freshness without checking whether the underlying quotes carry `marketTime`.
- Ticker crawl runs at a 32-second cycle; marquee lights blink stationary. Cadence lives in [src/style.css](src/style.css).
- Direct Amazon purchase slot (`INSERT COIN` faceplate) links to *Loop Engineering*; no purchase interaction is tracked, no revenue attribution logic.

## Resume point

No open work. Session closed after adversarial code review, applied fixes, deploy verification, and meditation.
