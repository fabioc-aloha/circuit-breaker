# Instrumentation Standards for Circuit Breaker

**Purpose.** This document defines how `cb.correax.com` emits telemetry to the
CorreaX Constellation Tracker and which game data must remain local.

Read this before changing tracker scripts, production activation, Content Security
Policy, client cache headers, URLs, or browser storage.

Last updated: 2026-07-22.

## Portfolio Setup

- The tracker server accepts `siteKey: circuit-breaker`.
- The dashboard labels the site `Circuit Breaker` and uses chart series 10.
- Production events post to `https://tracker.correax.com/api/collect`.
- Aggregate reports are Entra-protected and restricted by a server allow-list.
- Events expire after 90 days through the tracker lifecycle function.

## Site Role

Circuit Breaker is a one-page browser game. It has no accounts, forms, cloud saves,
or client-side router. Tracking exists to measure discovery of the public homepage,
not gameplay. Its only backend endpoint is a cached delayed-market-data feed used for
the decorative arcade ticker.

## Delayed Market Data

- The browser requests only the first-party `/api/quotes` endpoint.
- The endpoint fetches delayed quotes server-side, applies a three-second request
  deadline and bounded exponential retries, caches normalized results for five
  minutes, and returns only symbol, price, percentage change, direction, and timestamp.
- The browser never contacts the quote provider directly and no provider key is exposed.
- Quote fetch failures retain the normal arcade crawl; they do not block or change play.
- The ticker has no event telemetry. Quote symbols, values, or ticker interaction must
  never be attached to the tracker payload.

## Payload Contract

Every event follows the D1 Alt contract.

| Field | Requirement |
| --- | --- |
| `schemaVersion` | Exactly `1` |
| `siteKey` | Exactly `circuit-breaker` |
| `eventName` | Exactly `page_view` for this site |
| `path` | Site-relative path without query or fragment |
| `referrer` | Optional browser referrer; server stores the domain only |
| `utmSource` | Optional campaign source |
| `utmMedium` | Optional campaign medium |
| `utmCampaign` | Optional campaign name |
| `screenWidth` | Optional integer from 1 through 10000 |

Unknown fields are rejected. The request body limit is 1024 bytes.

## Approved Events

Circuit Breaker emits one `page_view` after a production page load. It does not emit
route-change events because the game has one canonical route. It does not use the
portfolio's retail-click event, including for the external Loop Engineering purchase link.

## Data That Must Never Leave the Browser

- Current or high score.
- Lines cleared, combo, level, boss, boss integrity, attacks, or victory state.
- Piece sequence, movement, rotation, hold, drop, pause, restart, or mute actions.
- Audio volume and mute preferences.
- Timing, frame rate, or session duration.
- Any local-storage value other than tracker consent state.
- Market-ticker request timing, errors, quote values, or ticker interaction.
- Query parameters other than the three approved UTM fields.
- URL fragments, full URLs, credentials, or visitor identity.

The game stores high score and audio preferences locally. Tracker code must never read
those storage keys.

## Consent and Failure Behavior

- US and Canadian visitors track automatically unless Do Not Track is enabled.
- EEA, UK, and Swiss browser time zones require explicit consent. Circuit Breaker has
  no consent UI, so those visits remain untracked.
- Unavailable storage, malformed browser values, the kill switch, and network errors
  fail closed.
- Consent classification remains in the browser and is not part of the payload.

Revisit the consent UI if qualified EEA, UK, and Swiss traffic exceeds 5 percent.

## Production Activation

Source HTML contains only a stable marker. Vite inserts the enabled tracker meta tag
and two deferred scripts when `CB_TRACKER_ENABLED=true`.

- Production pushes set the variable to `true`.
- Pull-request previews omit tracker activation.
- Local builds omit tracker activation unless the operator opts in explicitly.

The validator fails if preview and production activation states are mixed.

## Security and Caching

`public/staticwebapp.config.json` owns the production headers.

- CSP allows collection only to `tracker.correax.com`.
- Tracker scripts under `/client/*` use `Cache-Control: no-store`.
- Vite-hashed assets use immutable caching.
- Inline JSON-LD is allowed by one source hash. Any JSON-LD byte change requires a new
  CSP hash before deployment.
- Unknown routes remain 404 responses. There is no navigation fallback.

## Incident Response

Disable tracking immediately if a payload contains gameplay data, identity, or an
unapproved field, or if the tracker causes a game regression.

1. Remove production tracker activation by setting the workflow build flag to false or
   removing the generated markup path.
2. Deploy the site and verify that no request reaches the collection endpoint.
3. Investigate stored events and coordinate any backend action with the tracker owner.
4. Keep crawl assets and security headers deployed during tracker rollback.

## Change Management

- Game-only changes ship normally when tracker tests remain green.
- Changes to paths, storage, CSP, tracker scripts, or activation require the full local
  validation gate.
- Changes to the delayed quote provider, cache policy, or API response contract require
  the full local validation gate and must preserve the first-party browser boundary.
- New events, fields, retention, joins, or identity require a portfolio contract change
  in `seo-correax` and `analytics-correax` before site implementation.
- Do not fork the server payload contract in this repository.

## Verification

Run locally:

```powershell
npm run typecheck
npm test
$env:CB_TRACKER_ENABLED = 'true'
npm run build
npm run validate -- --tracking-enabled
Remove-Item Env:CB_TRACKER_ENABLED
```

After deployment verify:

- The homepage includes one enabled tracker meta tag and two deferred client scripts.
- A synthetic minimal `circuit-breaker` payload returns HTTP 204.
- A US page load emits one page view and no gameplay events.
- EEA and Do Not Track sessions emit nothing.
- Client scripts return `Cache-Control: no-store`.
- The dashboard filter shows Circuit Breaker.

## References

- Portfolio contract: `seo-correax/SEO-AND-TRACKING-PLAN.md`
- Portfolio data handling: `seo-correax/docs/DATA-HANDLING.md`
- Tracker validation: `analytics-correax/src/validate.js`
- Site tests: `scripts/constellation-tracker-client.test.mjs`
- Built-site validator: `scripts/validate-site.mjs`
