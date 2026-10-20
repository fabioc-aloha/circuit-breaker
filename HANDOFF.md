# Circuit Breaker handoff

Last updated: 2026-10-20.

## Current state

Production: [cb.correax.com](https://cb.correax.com/). Successful
[main deployment runs](https://github.com/fabioc-aloha/circuit-breaker/actions/workflows/azure-static-web-apps.yml?query=branch%3Amain)
identify released commits; this file's date does not establish deployment.

Previously verified release:
[`8bb9021`](https://github.com/fabioc-aloha/circuit-breaker/commit/8bb902157a9eaac1b111417f4500f69a9017166f),
deployed by [successful run 39479568006](https://github.com/fabioc-aloha/circuit-breaker/actions/runs/39479568006).
Live JavaScript and CSS matched the production build; the Apple touch PNG and
quotes API also responded successfully.

This release contains the Main Menu follow-up, documentation refresh, and sitemap
modification-date correction. Use `git status` for working-tree state rather than assuming
`main` is checked out. [PLAN.md](PLAN.md) owns implementation history, regression
safeguards, and open work.

Desktop browser and keyboard are the primary target. Phone/touch is secondary;
the user plans to test those controls and report findings.

## Next action

For a requested release, commit on the current worktree branch followed by a normal
`HEAD:main` push, without a pull request. The Azure workflow deploys both `dist/`
and `api/`; do not upload only the client.
Confirm the exact commit's successful workflow and live assets before treating
the release as delivered. Open work remains in PLAN rather than this handoff.

## Resume context

- `src/setup-panel.ts` distinguishes startup, paused settings, and Main Menu.
  Main Menu leaves the run paused while editing a new configuration.
- `src/main.ts` applies mode, difficulty, and seed only on Start New Game.
  Back to Game or Escape discards those draft choices and resumes the old run.
  Audio, effects, and input preferences still apply immediately and persist.
- `src/game.ts` provides an explicit, idempotent resume action; `src/input.ts`
  excludes UI clicks from global start and skip-cutscene handlers.
- [PLAN.md](PLAN.md#open-work-and-decisions) owns remaining decisions, including
  physical-device feedback and the unapproved permanent browser-smoke proposal.

## Verification

For implementation changes, run `npm run check`. Also build with
`CB_TRACKER_ENABLED=true` and run `npm run validate -- --tracking-enabled`
before release. [README.md](README.md#-deploy) gives the PowerShell commands;
[INSTRUMENTATION.md](INSTRUMENTATION.md) owns tracker-specific checks.

The Main Menu implementation passed `npm run check` (typecheck, Node tests,
preview build, and artifact validation). A fresh build with
`CB_TRACKER_ENABLED=true` also passed `npm run validate -- --tracking-enabled`.
The existing no-dependency Markdown conversion preflight passed for PLAN and
HANDOFF; it is not a full Markdownlint check.

Browser checks preserved a scored board and seed through Main Menu and Back to
Game, applied a replacement ruleset only on Start New Game, rejected invalid
seeds, and resumed a cutscene without skipping it. Controls remained reachable
at 1366x768, 320x480, and 844x390. These were Chromium and touch-emulation checks,
not physical iOS Safari. No uncaught application errors were captured.
Owned test contexts were closed; the existing local dev server was left running.

Full Markdownlint was unavailable because npm's `EALLOWREMOTE` policy blocked
the required package downloads. No package-policy settings or dependency
manifests were changed.

## Historical notes

The earlier UAT inventory, responsive-layout and ticker measurements, blocked
hidden-tab checks, and older session links are preserved in the
[released handoff](https://github.com/fabioc-aloha/circuit-breaker/blob/8bb902157a9eaac1b111417f4500f69a9017166f/HANDOFF.md).
They are historical evidence, not a second backlog. The Main Menu lessons are
in [PLAN.md](PLAN.md#regression-safeguards), not in new episodic or memory files.
