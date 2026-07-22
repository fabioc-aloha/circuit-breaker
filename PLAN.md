# ⚡ CIRCUIT BREAKER — Plan

## Implementation tracker

**Last assessed:** 2026-07-22

| Status | Area | Evidence or next action |
| --- | --- | --- |
| Complete | Core block-stacker | Seven-bag, SRS, collision, hold, ghost, scoring, gravity, pause, restart, and local high score are implemented. |
| Complete | Boss Rush | Five bosses, boss-driven voltage tiers, distinct HUD silhouettes, integrity, damage, attacks, cutscenes, victory, and terminal-state regression coverage are implemented. |
| Complete | Audio baseline | Procedural SFX/BGM, mute persistence, boss-low mode, and autoplay-safe boot are implemented. |
| Complete | Visual baseline | Responsive cabinet framing, HUD hierarchy, bezel reflection and screws, circuit-grid background, ambient and boot lightning, neon blocks, scanlines, particles, flash, shake, row Pacmen, the giant Tetris breaker Pacman with foreground lightning arcs, the top-layer board-roaming game-over Grid Wraith, boot text, and favicon are implemented. |
| Complete | Delivery | Vite build, Static Web Apps quote API, static deployment configuration, SEO assets, privacy-safe visit instrumentation, and the local validation gate are implemented. |
| Complete | Audio controls | Master, SFX, and BGM sliders persist through `AudioManager.setVolumes()`; the mute control stays synchronized with the `M` shortcut. |
| Complete | Tetris feedback | Four-line clears trigger the visible `MAIN BREAKER TRIPPED` / `FOUR-LINE OVERLOAD` announcement, giant breaker Pacman, flash, shake, and boom. |
| Complete | Garbage tuning | Garbage attacks now use the planned 1-4 row range, with maximum-displacement regression coverage. |
| Decided | Tooling | ESLint and Prettier are excluded: strict TypeScript, focused Node tests, and the built-site validator provide the current quality gate without extra dependencies. |

**Next sequence:** the implementation plan is complete. Revisit the accepted
soundtrack decision only if a non-boss gameplay phase is added.

Run `npm run check` after every implementation update. For tracker, SEO, CSP,
cache, URL, or browser-storage changes, also follow the production verification
steps in [`INSTRUMENTATION.md`](INSTRUMENTATION.md).

## Accepted Design Decision

| Decision | Current behavior | Rationale |
| --- | --- | --- |
| Boss Rush soundtrack | Every level is a boss encounter, so the 132 BPM boss mix begins at run start; the 100 BPM main mix plays after victory. | The game has no normal-play phase. Revisit only if one is introduced. |

## 🎯 Scope

A browser-playable **high-voltage cyberpunk block-stacker with Boss Rush mode**, rendered on HTML5 `<canvas>` and built with Vite.

**Title:** ⚡ **CIRCUIT BREAKER**
**Tagline:** *Stack the current. Trip the mainframe.*

## 🎨 Theme: High-Voltage Cyberpunk + Boss Rush

### Visual style

- **Palette:** pitch black + faint copper trace lines; blocks glow in electric cyan, hot magenta, high-voltage yellow, plasma purple, lime, orange, red
- **Blocks =** charged capacitors / circuit nodes with a subtle electric hum glow
- **Line clears =** "short circuit" — arcing electricity flashes across the row before it vanishes
- **Tetris (4-line) =** "MAIN BREAKER TRIPPED" — screen flashes white, sparks, deeper bass thump
- **Effects:** scanlines, bloom/glow on active piece, chromatic aberration on clears, spark/lightning particle bursts
- **Background:** subtle animated circuit traces pulsing with current; occasional lightning arcs across the void
- **Font:** monospace / pixel, all-caps HUD labels

### Boss Rush layer — Rogue AIs / Power Grid Threats

- Each **level = one boss** with a name, silhouette, and **BOSS INTEGRITY** bar (jagged voltage-meter style) in the side panel
- Line clears deal damage: single=1, double=3, triple=5, **Tetris=10** (× **AMPERAGE ×N** combo multiplier)
- Bosses **attack back** on a timer:
  - **Blown fuses** — garbage lines rise from bottom (1–4 rows with a random hole)
  - **Voltage spike** — gravity temporarily doubles
  - **Blackout** — cuts your sensor feed (hides next-piece preview ~10s)
  - **Signal interference** — scrambles two columns
- Defeat boss → short cutscene text → next boss loads → **VOLTAGE TIER** increases
- Final boss combines multiple attack patterns

### Boss roster

1. **SURGE.exe** — voltage spikes
2. **BLACKOUT** — blackout attacks
3. **SHORTFUSE** — blown fuses (garbage)
4. **FEEDBACK LOOP** — signal interference (column scrambles)
5. **THE MAINFRAME** — final boss, all attacks combined

### Flavor labels

- HP → **BOSS INTEGRITY**
- Combo → **AMPERAGE ×N**
- Level → **VOLTAGE TIER**
- Game over → **⚡ CIRCUIT BROKEN ⚡**
- Boot: fake BIOS/POST text scrolls, then title drops in with a lightning crack

## 🧱 Tech stack

- **TypeScript** — type safety for game state, bosses, SRS tables
- **HTML5 Canvas 2D** for rendering (neon glow via canvas shadows, particles)
- **Web Audio API** for procedural SFX + BGM (zero audio assets)
- **Vite** for dev server, HMR, and static build
- **Zero runtime dependencies** — output is plain HTML/JS/CSS, hostable anywhere
- Dev-only deps: `typescript`, `vite`

## 📁 File structure

```text
tetris/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── README.md
└── src/
    ├── main.ts              # entry, boot, game loop
    ├── game.ts              # GameState orchestration
    ├── board.ts             # grid + line-clear
    ├── piece.ts             # tetrominoes + SRS + wall kicks
    ├── input.ts             # keyboard, DAS/ARR
    ├── renderer.ts          # canvas draw pipeline
    ├── effects.ts           # particles, screen shake, glow passes
    ├── bosses.ts            # roster + attack logic
    ├── audio/
    │   ├── audio.ts         # AudioContext manager
    │   ├── sfx.ts           # procedural SFX
    │   └── music.ts         # BGM sequencer
    ├── storage.ts           # localStorage (hi-score, volumes)
    ├── constants.ts
    └── types.ts
```

## 🎮 Features

### Core

- 7 standard tetrominoes (I, O, T, S, Z, J, L) with neon colors
- Movement, rotation (SRS with wall kicks), soft/hard drop
- Line clears (1–4) with scoring
- Level progression + gravity curve
- Next-piece preview
- Game over + restart

### Nice-to-haves (confirmed)

- Hold piece (Shift/C)
- Ghost piece (shadow at landing spot)
- Pause (P)
- Local high score (localStorage)

### Theme-specific

- Boss Rush progression (5+ bosses)
- Boss HP bar + damage-per-clear
- Boss attack patterns (garbage, speed surge, fog, scramble)
- Neon glow, scanlines, particle FX on clears
- Boss defeat cutscene text

### Audio (procedural — Web Audio API, zero assets)

- **SFX (synthesized):** move blip, rotate click, soft-drop tick, hard-drop thud+zap, lock clink, line-clear zap, Tetris BOOM ("MAIN BREAKER TRIPPED"), hold swoosh, level-up/boss-defeat fanfare, boss-attack alarm, game-over power-down whine, UI blip
- **BGM (synthesized):** driving synthwave arpeggio (~110–120 BPM, minor key)
  - **Main theme** during normal play
  - **Boss theme** — aggressive bassline during boss fights
  - **Low-HP variant** — tempo bumps when BOSS INTEGRITY < 25%
  - Short game-over fade stinger
- **Controls:** `M` mute toggle; separate SFX/BGM sliders; volumes persisted in localStorage
- **Autoplay:** audio starts on first user input (browser policy compliance)

## 🕹️ Controls

| Key      | Action        |
|----------|---------------|
| ← →      | Move          |
| ↓        | Soft drop     |
| Space    | Hard drop     |
| ↑ / X    | Rotate CW     |
| Z        | Rotate CCW    |
| Shift/C  | Hold piece    |
| P        | Pause         |
| M        | Mute audio    |
| R        | Restart       |

## 🖼️ HUD layout

```text
┌─ HOLD ─┐  ┌──── BOARD ────┐  ┌─ NEXT ─┐
│        │  │               │  │        │
└────────┘  │               │  └────────┘
            │               │  SCORE
BOSS: ▓▓▓▓░ │               │  LEVEL
GLITCH.exe  │               │  LINES
            └───────────────┘  HI-SCORE
```

## ✅ Decisions locked

- **Title:** ⚡ CIRCUIT BREAKER
- Feature set: Core + hold, ghost, pause, high score
- Theme: **High-Voltage Cyberpunk + Boss Rush**
- Stack: **TypeScript + HTML5 Canvas + Vite** (Web Audio API for sound), zero runtime deps

## Implementation phases

| Phase | Status | Result |
| --- | --- | --- |
| Scaffold | Complete | Vite and TypeScript are in place; ESLint and Prettier are intentionally excluded by the documented tooling decision. |
| Constants and types | Complete | Board geometry, pieces, SRS, colors, timings, and shared game types are implemented. |
| Core engine | Complete | Board state, collision, locking, clearing, gravity, and fixed animation updates are implemented. |
| Rendering | Complete | Hold, board, next queue, ghost piece, HUD, overlays, boss silhouettes, and responsive cabinet framing are implemented. |
| Input and scoring | Complete | DAS/ARR, drops, rotation, hold, pause, restart, scoring, level progression, and local high score are implemented. |
| Boss Rush | Complete | Five bosses, boss-driven voltage tiers, damage, combo scaling, four attacks, cutscenes, victory, and the planned garbage-row range are implemented. |
| Audio | Complete | Procedural music and effects, mute, persisted volume controls, and autoplay-safe initialization are implemented. |
| Polish | Complete | The arcade visual system, lightning, particles, clear effects, boot sequence, favicon, README, SEO, and instrumentation are complete. |
