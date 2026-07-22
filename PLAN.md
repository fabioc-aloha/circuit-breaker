# ⚡ CIRCUIT BREAKER — Plan

## 🎯 Scope
A browser-playable **high-voltage cyberpunk block-stacker with Boss Rush mode**, rendered on HTML5 `<canvas>`. No build tools, no dependencies — open `index.html` and play.

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
- Dev-only deps: `typescript`, `vite`, `@types/*`, `eslint`, `prettier`

## 📁 File structure
```
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
    ├── hud.ts               # score/level/boss integrity panel
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
```
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

## 🚧 Implementation plan (8 phases)

1. **Scaffold** — `npm create vite@latest . -- --template vanilla-ts`, prune boilerplate, add ESLint + Prettier
2. **Constants & types** — board dims, tetromino shapes (SRS), colors, timings, `types.ts` (`Piece`, `Boss`, `GameState`, `Attack`, …)
3. **Core engine** — `Board`, `Piece`, spawn/move/rotate, collision, lock, line detection & clear, gravity + fixed-timestep game loop
4. **Rendering v1** — layout (HOLD | BOARD | NEXT + HUD), block draw, grid, active piece, ghost piece, next/hold previews
5. **Input & scoring** — keyboard mapping, DAS/ARR auto-repeat, soft/hard drop, scoring table, level/lines HUD, game-over + restart
6. **Boss Rush layer** — `bosses.ts` roster, HP, damage-per-clear, combo/AMPERAGE, attack scheduler, all 4 attack implementations, cutscene text between bosses
7. **Audio** — `audio.ts` (AudioContext + gain graph), `sfx.ts` (procedural blips/zaps/booms), `music.ts` (synthwave arpeggio with main/boss/low-HP variants), M mute, volume sliders, localStorage persistence
8. **Polish** — neon glow, scanlines overlay, particle system (sparks/lightning arcs), screen shake, chromatic-aberration flash, BIOS/POST boot intro, animated circuit-trace background, hi-score, favicon, README
