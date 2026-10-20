# Circuit Breaker project guidance

Circuit Breaker is a TypeScript/Vite browser game with a Canvas 2D renderer,
procedural Web Audio, and an Azure Functions quote API. Desktop keyboard play is
primary; touch support must not compromise desktop controls or layout.

## Project contracts

- Preserve movement, collision, SRS rotation, line clearing, scoring, and boss
  behavior. Cover intentional gameplay changes with focused regression tests.
- Keep the browser client free of runtime dependencies and preserve procedural
  audio unless the requested feature justifies a different approach.
- Follow the existing small-module boundaries in `src/` and the established
  cyberpunk arcade aesthetic.
- Keep telemetry limited to the approved production-only `page_view` contract.
  Never add gameplay, score, storage, identity, or session data to tracking.
  See [INSTRUMENTATION.md](../INSTRUMENTATION.md).
- Preserve the canonical URL, social metadata, JSON-LD, sitemap, robots rules,
  and crawl assets. Validate changes to public URLs or page metadata.
- Keep preview builds tracker-disabled. Production builds must pass the
  tracking-enabled artifact validation before deployment.

## Build and verification

- Use Node.js 22 or 24; CI uses 22.
- Use focused tests in `scripts/*.test.mjs` while developing.
- Run `npm run check` for game or delivery changes. It runs typechecking,
  tests, the production build, and site artifact validation.
- For a tracking-enabled build, run
  `npm run validate -- --tracking-enabled`.
- See [README.md](../README.md) for setup, controls, and build commands.
- Preserve the existing workflow, dependency-update configuration, and
  contribution templates when changing repository tooling.

## Documentation and continuity

- Record completed player-visible changes in [CHANGELOG.md](../CHANGELOG.md),
  using commit or diff evidence rather than invented versions or release dates.
- Use [PLAN.md](../PLAN.md) for the existing project plan and delivery context.
- Keep [HANDOFF.md](../HANDOFF.md) focused on restart-critical state and next
  actions rather than duplicating the changelog.

## ACT integration

Alex ACT ONE supplies shared behavior through the installed plugin and
user-level bootstrap. Keep this folder project-specific; do not copy the old
ACT Edition agents, instructions, prompts, skills, or updater back into it.
The ignored `.github-backup/` directory preserves the previous setup for
recovery only, not as an active instruction or tooling source.
