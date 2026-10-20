# Circuit Breaker delivery record

Last reviewed against the implementation: 2026-10-20.

This is the current delivery record. [README.md](README.md) owns player and
developer guidance; [HANDOFF.md](HANDOFF.md) owns restart state and the next action.
The implementation table and historical links record completed work. Pending
work and decisions live below, rather than in a separate task list.
The original design is preserved under [Historical material](#historical-material).

## Implementation status

| Area | Current implementation |
| --- | --- |
| Core block-stacker | Seven-bag randomization, SRS, collision, hold, ghost, next queue, scoring, gravity, and bounded lock resets. |
| Scoring | T-spins, back-to-back multipliers, combos, and perfect-clear bonuses. |
| Modes and difficulty | Boss Rush and Free Stack, with Chill, Normal, and Overdrive difficulty. |
| Boss fairness | Timed attack warnings, exact garbage-hole previews, cancellation through line clears, deferred unsafe scrambles, and collision-adjusted spawns. |
| Progression | Boss integrity and attacks, line-driven voltage tiers, boss-defeat progression, skippable cutscenes, victory, and frozen end-of-run summaries. |
| Timing and input | Elapsed-time gravity and soft drop, bounded input catch-up, focus-loss suspension, and explicit resume. |
| Reproducible runs | Separate seeded streams for pieces, boss attacks, and Kong; retry preserves the run seed. Matching a run also requires matching inputs and timing. |
| Local records | Best scores by mode and difficulty, fastest successful Boss Rush times, and a separate legacy high score. |
| Setup and pause | Shared Play, Settings, and Controls dialog; paused settings lock run configuration and return to pause without resuming. |
| Responsive layout | Height-constrained, aspect-preserving canvas; touch controls reserve their actual bar height, fit narrow phones, and use one row in short landscape windows. |
| Preferences | Persistent audio mix, mute, reduced effects, and DAS/ARR; invalid restored audio values fall back to valid defaults. |
| Effects and audio | Canvas gameplay effects, CSS cabinet presentation, credited Kong sprites, and procedural Web Audio music and effects. |
| Ticker | Portfolio name followed by configured stocks, right-edge entry, constant 70px/s motion with position-preserving retiming, daily regular-session percentage changes, and first-party cached quotes fetched once per page load. Reduced effects hides it. |
| iOS icon | Opaque 180x180 PNG, explicit Apple touch icon declaration, and artifact-validation coverage. |
| Delivery | TypeScript, Node tests, preview/production artifact checks, and Azure Static Web Apps deployment of the client and quote API. |
| Instrumentation | Production-only homepage page views with the privacy and consent boundaries in [INSTRUMENTATION.md](INSTRUMENTATION.md). |

This release includes the start-screen-only book link, documentation refresh,
responsive-layout fixes, ticker-motion changes, and animation pacing adjustments.
Production deployment evidence is linked from the handoff, not duplicated here.

## Design decisions

| Decision | Current direction |
| --- | --- |
| Primary platform | Desktop browser with keyboard input. Phone and touch support are secondary. |
| Soundtrack | Boss Rush uses the boss mix, with a low-integrity variant. Free Stack and victory use the main mix. |
| Audio assets | Music and sound effects are synthesized; Kong artwork is a separate, credited image asset. |
| Dependencies | The browser bundle has no runtime package dependencies. The quote API uses `@azure/functions`. |
| Quality gate | Strict TypeScript, focused Node tests, and the built-site validator. ESLint and Prettier are not configured. |
| Release path | Commit and push directly to `main` when a release is requested. Actions builds and deploys both the site and API. |

Run `npm run check` for implementation changes. The production build flag must be
set before building; see [the release instructions](README.md#-deploy).

## Regression safeguards

- Startup waits for a completed `click`, rather than opening setup on
  `pointerdown`. Otherwise the same gesture can click a newly revealed control.
  [Input regressions](scripts/game.test.mjs) cover the event boundary and consuming
  the Enter key that opened setup.
- Daily quote changes use `previousClose`, not the range-dependent
  `chartPreviousClose`. A correct price does not prove the percentage is correct.
  [Quote regressions](scripts/market-quotes.test.mjs) deliberately give those
  fields different values, including a closed-market example.
- Apple icon validation covers the built HTML, not just the source declaration.
  Vite rewrites the icon URL to a relative path.
  [Artifact regressions](scripts/validate-site.test.mjs) accept that output while
  still rejecting a missing declaration or asset.
- The book box belongs inside the startup Play panel, so existing dialog and
  tab visibility controls it without another visibility flag.
  [Placement coverage](scripts/book-link.test.mjs) prevents a duplicate or an
  exterior gameplay box.
- Ticker timing uses fractional geometry and preserves the current pixel offset
  when quotes, fonts, or viewport dimensions change. Unchanged geometry does not
  restart the animation, and each fallback loop covers the viewport.
  [Ticker regressions](scripts/market-ticker.test.mjs) cover velocity and phase.

## UI and animation follow-up

This release addresses the responsive defects found in the initial 2026-10-20 UAT:

- **Canvas fit:** the cabinet allocates its remaining height to the screen,
  rather than letting the short-window breakpoint force a full-width canvas
  beyond the viewport. The canvas preserves its aspect ratio and fits above
  the touch bar.
- **Touch controls:** shared sizing variables keep the reserved space and fixed
  bar consistent. Narrow-phone buttons remain at least 44x44 CSS pixels;
  short landscape windows use a single row. Gameplay controls hide while paused
  so they cannot cover the pause menu.
- **Ticker motion:** quote arrival and geometry changes retain the current
  position rather than replaying the right-edge entry. Fractional measurements
  maintain 70px/s, and viewport-width fallback loops avoid a visible reset gap.
- **Pacman pacing:** regular row-clear sweeps take about 333ms instead of 267ms;
  four-line-clear sweeps take about 467ms instead of 367ms. The ordinary sweep
  and row-clear hold share the same timing constant.
- **End-game ghost:** hovers for four seconds instead of 1.8 seconds, with its
  existing movement and fade behavior.

Browser rechecks covered desktop 1280x720, 1366x768, 1440x1000, and 1920x1080,
plus touch 320x480, 390x844, and 844x390. Canvas bounds, aspect ratio, complete
touch-button bounds, minimum target sizes, and button-center hit targets passed.
Follow-up checks also covered setup scrolling, reduced effects, seed rejection,
startup-only book visibility, pause/settings/resume, retry, and actual hold/drop
input. Chromium emulation is not physical iOS Safari.

## Open work and decisions

- Proposed, not approved: add an isolated browser smoke flow for keyboard
  startup, opening gestures, settings, reduced effects, play, and pause. It would
  complement the current Node tests with actual DOM event ordering and visibility.
  Confirm CI browser support and package-policy compatibility before adding
  dependencies or automation.
- The README has described the code as MIT, but no standalone license file is
  tracked. Adding one requires the owner's licensing decision.
- Third-party sprite permissions remain subject to [CREDITS.md](CREDITS.md).
- The old handoff proposed restoring editor-extension recommendations. No
  `.vscode` configuration is currently tracked; confirm the desired editor
  tooling before reviving that proposal.

Running UAT and fixing its findings does not approve the separate proposal to
add permanent browser-test automation.

## Historical material

The original design and earlier implementation notes are preserved without being
presented as current requirements:

- [Original plan and delivery history](https://github.com/fabioc-aloha/circuit-breaker/blob/4c12e2b3ef304ae273e065209b5a977d1ce1d31c/PLAN.md)
- [Earlier session notes and historical tooling proposals](https://github.com/fabioc-aloha/circuit-breaker/blob/4c12e2b3ef304ae273e065209b5a977d1ce1d31c/HANDOFF.md)
