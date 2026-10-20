# Changelog

This changelog starts with the October 20, 2026 changes recorded in Git.
Earlier project history has not been backfilled. Dates identify source changes,
not independently verified production deployments.

## Unreleased

### Fixed

These local fixes are covered by the
[gameplay regression tests](scripts/game.test.mjs); they are not a deployment record.

- Winning line clears now finish their animation and remove the cleared rows.
  Perfect-clear bonuses count toward the final score and saved record exactly once.
- Defeating a boss with perfect-clear damage now advances the voltage tier.
- `P` and `Esc` now pause boss cutscenes without skipping them; resuming preserves
  the remaining duration.
- Difficulty now scales each boss's first attack interval as well as subsequent
  intervals.

## 2026-10-20

### Added

- The start screen now groups Play, Settings, and Controls in one responsive dialog. Choose a mode, difficulty, or run seed, and adjust audio, effects, and input timing. ([commit](https://github.com/fabioc-aloha/circuit-breaker/commit/1ae996ca81ea8a2fd017ae425d40e2122041bfba))
- From Pause, open Main Menu to set up your next run without losing the current one. Back to Game resumes it; Start New Game applies your new mode, difficulty, and seed. ([commit](https://github.com/fabioc-aloha/circuit-breaker/commit/c1385744667d52e764c0ba580bf8bddca60fb79f))
- Added a lightning-bolt icon for iOS Home Screen shortcuts. ([commit](https://github.com/fabioc-aloha/circuit-breaker/commit/4c12e2b3ef304ae273e065209b5a977d1ce1d31c))
- Added local best scores by mode and difficulty, fastest Boss Rush wins by difficulty, and a separate legacy high score. ([commit](https://github.com/fabioc-aloha/circuit-breaker/commit/4f2eb70dacf8178ec104ecbf090c9e0ac224e277))
- Added a saved reduced-effects setting that hides the ticker and suppresses decorative effects while keeping essential gameplay cues visible. ([commit](https://github.com/fabioc-aloha/circuit-breaker/commit/4f2eb70dacf8178ec104ecbf090c9e0ac224e277))

### Updated

- Seeded runs now repeat the same piece, boss-attack, and Kong random sequences. Boss attacks show exact previews, and Kong's aim preview shows his target column. ([commit](https://github.com/fabioc-aloha/circuit-breaker/commit/4f2eb70dacf8178ec104ecbf090c9e0ac224e277))
- Clearing lines during a garbage warning cancels one incoming row per line cleared. Column scrambles wait until they can execute without overlapping the falling piece. ([commit](https://github.com/fabioc-aloha/circuit-breaker/commit/4f2eb70dacf8178ec104ecbf090c9e0ac224e277))
- The ticker covers a larger AI-focused stock basket, brings quotes in from the right, and calculates daily changes from the previous market session's close. Reduced-effects mode hides it. ([commit](https://github.com/fabioc-aloha/circuit-breaker/commit/4f2eb70dacf8178ec104ecbf090c9e0ac224e277))
- Touch controls and pause actions fit narrow screens. The ticker keeps its position when quotes, fonts, or viewport size change. Pac-Man line-clear sweeps are slower, and the end-of-run Grid Wraith stays visible for four seconds. ([commit](https://github.com/fabioc-aloha/circuit-breaker/commit/8bb902157a9eaac1b111417f4500f69a9017166f))

### Fixed

- Opening setup no longer lets the same pointer gesture activate an option that just appeared. ([commit](https://github.com/fabioc-aloha/circuit-breaker/commit/8bd0fbf7dcf38f6d3d42e42da0837e597ca155af))
- The game pauses when the window loses focus and clears held inputs. ([commit](https://github.com/fabioc-aloha/circuit-breaker/commit/4f2eb70dacf8178ec104ecbf090c9e0ac224e277))
