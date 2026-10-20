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

Local `main` was fast-forwarded to
[`c138574`](https://github.com/fabioc-aloha/circuit-breaker/commit/c1385744667d52e764c0ba580bf8bddca60fb79f),
which contains the Main Menu follow-up, documentation refresh, and sitemap
modification-date correction. Its production deployment was not checked in this
session. Use `git status` for the current branch and working-tree state.
[PLAN.md](PLAN.md) owns regression safeguards and open work;
[CHANGELOG.md](CHANGELOG.md) records completed player-visible changes.

The old ACT Edition `.github/` contents are preserved in the ignored
`.github-backup/` directory. All 168 backup files matched their original SHA-256
hashes. The active folder retains the deployment workflow, Dependabot and
contribution templates unchanged, plus project-specific guidance.
Alex ACT ONE 0.5.0's user bootstrap preview preserved all 15 instruction files
and its receipt, with no active workspace overlaps.

The approved project bootstrap created [AGENTS.md](AGENTS.md),
[CLAUDE.md](CLAUDE.md), [GEMINI.md](GEMINI.md),
[episodic guidance](.github/episodic/README.md), and
[workspace settings](.vscode/settings.json); a second preview had no pending
changes. No episodic summaries were written. This release candidate includes
the migration, new changelog, documentation corrections, and gameplay review
fixes. Use `git status` and the exact commit's workflow run to determine whether
it has been committed, pushed, and deployed.

Desktop browser and keyboard are the primary target. Phone/touch is secondary;
the user plans to test those controls and report findings.

## Next action

The user authorized commit, push, and deployment. Verify the release commit's
successful workflow and live assets before reporting it delivered.
Keep `.github-backup/` intact and ignored until the user authorizes its removal.
Do not restore its old framework instructions, skills, or updater into the active
folder. Start a new chat to avoid retaining the old instructions loaded earlier
in this conversation.

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
  excludes UI clicks from global start and skip-cutscene handlers. Keyboard
  pause keys preserve cutscenes rather than skipping them first.
- Winning clears include perfect-clear scoring before saving the final record,
  then finish row removal without changing that result. Perfect-clear boss
  defeats advance the tier, and opening boss timers honor difficulty.
- [PLAN.md](PLAN.md#open-work-and-decisions) owns remaining decisions, including
  physical-device feedback and the unapproved permanent browser-smoke proposal.

## Verification

For implementation changes, run `npm run check`. Also build with
`CB_TRACKER_ENABLED=true` and run `npm run validate -- --tracking-enabled`
before release. [README.md](README.md#-deploy) gives the PowerShell commands;
[INSTRUMENTATION.md](INSTRUMENTATION.md) owns tracker-specific checks.

For the gameplay review fixes, new regressions first failed on missing winning
bonuses and row cleanup, delayed tier progression, keyboard cutscene loss, and
unscaled opening attack timers. After the fixes,
`node --test scripts/game.test.mjs` passed all 96 tests, and `npm run check`
passed typechecking, all 170 tests, the production build, and preview artifact
validation. No browser or live deployment checks were rerun for these fixes.
The release preflight reran `npm run check` successfully, then built with
`CB_TRACKER_ENABLED=true` and passed
`npm run validate -- --tracking-enabled` (production).
Editor diagnostics reported no errors in the modified source, tests, or
documents. `git diff --check` passed, and all 41 local link targets in the four
updated documents resolved.

The preceding documentation-only corrections passed
`node --test scripts/book-link.test.mjs` (both tests), `git diff --check`, and
resolution of all 48 local link/image targets across 12 active Markdown documents.

The prior Main Menu implementation passed `npm run check` (typecheck, Node tests,
preview build, and artifact validation). A fresh build with
`CB_TRACKER_ENABLED=true` also passed `npm run validate -- --tracking-enabled`.
Its no-dependency Markdown conversion preflight passed for PLAN and HANDOFF;
that is historical evidence, not a current check or a full Markdownlint check.

Browser checks preserved a scored board and seed through Main Menu and Back to
Game, applied a replacement ruleset only on Start New Game, rejected invalid
seeds, and resumed a cutscene without skipping it. Controls remained reachable
at 1366x768, 320x480, and 844x390. These were Chromium and touch-emulation checks,
not physical iOS Safari. No uncaught application errors were captured.
Those test contexts were closed. The prior session left a local dev server
running; its current process state has not been verified.

Full Markdownlint was unavailable because npm's `EALLOWREMOTE` policy blocked
the required package downloads. No package-policy settings or dependency
manifests were changed.

## Historical notes

The earlier UAT inventory, responsive-layout and ticker measurements, blocked
hidden-tab checks, and older session links are preserved in the
[released handoff](https://github.com/fabioc-aloha/circuit-breaker/blob/8bb902157a9eaac1b111417f4500f69a9017166f/HANDOFF.md).
They are historical evidence, not a second backlog. The Main Menu lessons are
in [PLAN.md](PLAN.md#regression-safeguards), not in new episodic or memory files.
