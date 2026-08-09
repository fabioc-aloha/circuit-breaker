# Session Handoff

Last updated: 2026-08-08 (instrumentation health audit; prior handoff follows)

## 2026-08-08 - Circuit Breaker instrumentation health

Production passed the complete tracker contract: activation, both client assets,
`circuit-breaker` site key, tracker endpoint, CSP, exact-origin preflight, and
collector POST. Both clients return `Cache-Control: no-store`, no gameplay or
score state appears in the tracker payload, and no Umami residue was found. No
Circuit Breaker code or configuration change was needed. The worktree was clean
at audit start; the older uncommitted-work snapshot below is historical.
Portfolio evidence: [2026-08-08 audit](https://github.com/fabioc-aloha/seo-correax/blob/main/reports/2026-08-08-instrumentation-health-audit.md).

## Just shipped (in working tree — not yet committed)

Play + polish pass across game feel, visual seams, and hot-path cost. 11 files
changed, all under `src/` and `scripts/`. No changes to instrumentation,
tracker, CSP, storage keys, or the `/api/quotes` contract.

- **VOLTAGE TIER is now dual-source.** Tier advances every `LINES_PER_LEVEL`
  (10) line clears *and* by boss defeat — whichever is higher wins each round.
  Announcement + `uiBlip` fire on tier up (suppressed during a Tetris so it
  doesn't stomp the MAIN BREAKER banner). Right panel gets a small
  "NEXT TIER IN N" progress bar under the LINES row. Two prior tier tests
  updated to match; added a "holds tier when clear doesn't cross threshold"
  test.
- **Seamless line-clear animation.** `Board.clearLines` split into
  `getFullRows()` + `removeRows()`. Game marks cleared rows in
  `board.clearingRows`, the renderer skips drawing them, and a 260 ms
  `pendingLineClear` timer defers the actual grid mutation. Pacman travel
  tightened from 30 frames → 16 (~267 ms) so it finishes crossing empty
  space right as the stack drops. Breaker pacman 42 → 22 frames.
- **Kong celebration dance fixed.** Frames on `kong-dance.png` are 2 back,
  2 front, 1 side profile; the prior cycle `1→2→3→4→0` opened with Kong's
  back to the player and skipped the side frame between direction changes.
  New `DANCE_ORDER = [3, 2, 0, 2, 4, 2, 1, 2]` reads as a proper 360° spin
  (front → side → back → side → alt-front → side → alt-back → side). Bounce
  switched from `sin*2π` to `|cos|` so it peaks on the pose frames and dips
  through the transitions.
- **Stats panel layout fix.** `⚡ VOLTAGE SPIKE` was overflowing the panel
  bottom (drawn at `sy+198` in a 200 px panel with bold 11 px baseline drop)
  and `NEXT TIER IN N` was clipping the LINES underline. Panel height
  200 → 220, progress label moved below the bar, AMPERAGE + SPIKE share a
  row at `sy+200` — combo left, spike right-aligned via `measureText`.
- **Frame-rate independence for soft drop.** `Game.softDrop` no longer
  accumulates `+= 16` per input-controller tick; the ticker lives inside
  `Game.update(dt)` with real frame delta. Prevents 2× soft-drop speed on
  120 Hz displays. `softDropTimer` and `softDropHeld` now reset in
  `beginRun`.
- **Bug fix in `sfx.lineClear`.** The `[880,1108,1319][rows-1] ? [660,880,
  1108,1319].slice(0, rows) : [880]` fall-through was rewritten to
  `[660, 880, 1108, 1319].slice(0, Math.max(1, Math.min(4, rows)))`.
- **Performance.** Scanlines rendered from a cached 1×3 `CanvasPattern`
  (one `fillRect` per frame instead of 240). Grid strokes in
  `drawBackground` + `drawBoard` batched into one path per orientation
  (~60 fewer stroke calls per frame). `Effects.update` uses in-place
  write-index compaction for `lightning`, `particles`, `pacmen`, and
  `pellets` — no more per-frame `.filter()` reallocation.
- **Dead-code removal.** `COLORS.gridStrong`, `COLORS.ghost`,
  `EffectFlags`, `cellsAtRotation`, `KONG_PIXEL_SCALE`,
  `RenderState.bootText` removed. `LINES_PER_LEVEL`, `LOW_HP_THRESHOLD`,
  `SOFT_DROP_FACTOR` were defined but never imported — now wired up as
  the constants they were always intended to be. Merged
  `Kong.spawnColumnFor` / `computeSpawnColumn` into one method.
- **Race fix**: `Game.flushPendingLineClear()` now runs at the top of the
  `garbage` and `scramble` boss-attack cases, so a boss attack during the
  260 ms line-clear hold applies against the *post-clear* grid instead of
  removing the wrong rows. Regression test in
  [scripts/game.test.mjs](scripts/game.test.mjs) — `flushes a pending
  line-clear before applying a garbage attack`.
- **CREDITS.md attribution filled in**. Kong sprites attributed to
  [JayHyperStarX on DeviantArt](https://www.deviantart.com/jayhyperstarx),
  with an honest carve-out that the underlying character is
  © Nintendo and the sheet itself is displayed without an explicit
  license grant — non-commercial fan-tribute framing with a takedown
  path. If the site scales past personal-portfolio use, contact the
  artist for permission.

## Current state

- Branch: `main`
- Working tree: **11 files modified, uncommitted** (`+202 / −91`)
- Gate: `npm run check` → typecheck ✓, 60/60 tests ✓, build ✓ (62.67 kB
  gzip 19.27 kB), preview and production validators ✓
- Production still at `f6f2dca` (previous session's sitemap `lastmod`
  addition)

## Backlog / notes for next session

- **Commit the play/polish pass**. All changes are gameplay-side and green
  under the full local gate. Suggested split into 3 commits for readable
  history: (1) dead-code removal + wire-up of previously-defined
  constants, (2) tier system + line-clear animation + Kong dance fix +
  stats layout, (3) performance passes.
- **`.vscode/extensions.json` regression to restore** (still pending from
  2026-07-22): five ACT-Edition-aligned entries need to be added back next
  to the Azure Functions recommendation:
  `GitHub.vscode-pull-request-github`,
  `fabioc-aloha.alex-cognitive-architecture`,
  `DavidAnson.vscode-markdownlint`,
  `streetsidesoftware.code-spell-checker`, `redhat.vscode-yaml`.
- **From prior session**: `MAX_DELTA_MS = 750` in
  [src/frame-timing.ts](src/frame-timing.ts) assumes max level 5 gravity
  (600 ms). Revisit if a future mode adds higher gravity tiers.
- **From prior session**: `/api/quotes` `asOf` falls back to cache time if
  the provider drops `regularMarketTime` — reviewers shouldn't read it as
  authoritative freshness without checking the underlying quotes.

## Resume point

Pick up by committing the working tree (see backlog for the suggested
split), then triage the `.vscode/*` cleanup and `CREDITS.md` attribution
TODOs.
