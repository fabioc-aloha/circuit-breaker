# Circuit Breaker handoff

Last updated: 2026-10-20.

## Current state

Production: [cb.correax.com](https://cb.correax.com/). The
[production deployment history](https://github.com/fabioc-aloha/circuit-breaker/actions/workflows/azure-static-web-apps.yml?query=branch%3Amain)
records each deployed commit and its outcome; use a successful production run,
not this file's commit date, to identify the live release.

Previously verified baseline: commit
[`4c12e2b`](https://github.com/fabioc-aloha/circuit-breaker/commit/4c12e2b3ef304ae273e065209b5a977d1ce1d31c).
It includes the consolidated settings dialog, startup click-through fix, and
Apple touch icon. The user confirmed that the iOS icon works.

This release refreshes documentation, moves the `INSERT COIN` /
`BUY THE BOOK` box into startup Play only, fixes the two responsive-layout UAT
findings, preserves ticker motion through quote and geometry changes, and slows
both Pacman sweeps by about 20% with a matching ordinary row-clear hold.
The end-game ghost now hovers for four seconds instead of 1.8 seconds.
See [PLAN.md](PLAN.md) for implementation and regression safeguards. Confirm
deployment through the production workflow and live-site checks.
Use `git status` for the actual working-tree state rather than assuming `main`
is checked out.

Desktop browser and keyboard are the primary target. Phone/touch is secondary;
the user plans to test those controls and report findings.

## Next action

The requested layout, ticker, and animation changes are implemented. Physical iPhone
gameplay and perceived ticker smoothness still need the user's device feedback.
For a release, commit the intended files on the current
worktree branch and push `HEAD:main` without a pull request.
The Azure workflow deploys both `dist/` and `api/`; do not upload only the client.

Use [PLAN.md](PLAN.md) for delivery status, regression safeguards, and open
decisions, rather than reconstructing a backlog from the historical handoff.
Its browser-smoke proposal is not approved implementation work.

## Verification

For implementation changes, run `npm run check`. Also build with
`CB_TRACKER_ENABLED=true` and run `npm run validate -- --tracking-enabled`
before release. [README.md](README.md#-deploy) gives the PowerShell commands;
[INSTRUMENTATION.md](INSTRUMENTATION.md) owns tracker-specific checks.

The final local implementation passed `npm run check` (typecheck, Node tests,
preview build, and artifact validation). A fresh build with
`CB_TRACKER_ENABLED=true` also passed `npm run validate -- --tracking-enabled`.
The existing no-dependency Markdown conversion preflight passed for PLAN and
HANDOFF; it is not a full Markdownlint check.

The initial browser UAT on 2026-10-20 completed 71 checks: 63 passed, six layout
checks failed across two findings, and two background-tab checks were blocked
because automation did not produce a genuine hidden-tab transition.
Actual window-blur auto-pause was verified independently. Tested desktop
viewports were 1440x1000, 1280x720, 1366x768, and 1920x1080; touch viewports
were 390x844, 320x480, and 844x390.

Startup, tab navigation, seed validation, saved preferences, reduced effects,
pause/settings/resume, retry, and startup-only book visibility passed. Keyboard
and touch hold/drop actions visibly changed the board, hold slot, and score.
No uncaught JavaScript errors were captured.

After the fixes, browser geometry checks passed at all seven viewport sizes:
the full canvas fits without touch-bar overlap, its aspect ratio is preserved,
and all nine touch controls fit with targets at least 44x44 CSS pixels and
uncovered centers. Another 40 scoped interface checks passed across keyboard and
touch contexts. A further 320x480 pause-overlap regression was reproduced, fixed,
and rechecked: the gameplay touch bar now hides while the pause menu is open.
Actual keyboard and touch hold/drop runs with seed 42 each changed score from
0 to 40. Owned test contexts were closed; the existing dev server remains running.

Ticker checks covered delayed quote arrival, unchanged-geometry synchronization,
font/viewport resize, full quote lists, portfolio-only fallback, and loop seams.
Sampled steady velocity was 70px/s, with a 40ms seam crossing moving approximately
2.8px as expected. Delayed quote arrival preserved position within 0.03px of
elapsed-time motion in the measured run. Chromium already accelerated the old
steady animation; this is evidence for removing restart/seam jumps, not a promise
of hitch-free rendering on every device. Sample callbacks still had occasional
40-50ms gaps, and physical iOS rendering remains unverified.

These browser checks used Chromium and touch emulation, not physical iOS Safari.
The user's iOS confirmation covers the Home Screen icon; phone gameplay controls
still await their feedback.

Markdownlint could not run: both CLI variants were blocked by npm's
`EALLOWREMOTE` policy when the required package proxy returned remote tarballs.
No npm security settings or dependency manifests were changed. Documentation
link and drift checks passed before the meditation updates; that is not a full
Markdownlint result.

For the local book-box change, check that it is usable on startup, absent during
play and paused settings, and does not overflow the desktop or phone setup panel.

## Historical notes

Earlier session records, including the old uncommitted-work snapshot and editor
recommendations, are preserved in the
[commit-pinned handoff](https://github.com/fabioc-aloha/circuit-breaker/blob/4c12e2b3ef304ae273e065209b5a977d1ce1d31c/HANDOFF.md).
They are historical evidence, not instructions to commit already-released work.
