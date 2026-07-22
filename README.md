# Circuit Breaker

![Circuit Breaker cyberpunk arcade banner](docs/banner.png)

[![Play now](https://img.shields.io/badge/PLAY%20NOW-cb.correax.com-ff00e5?style=for-the-badge&labelColor=05010f)](https://cb.correax.com)
![TypeScript, Canvas, and WebAudio](https://img.shields.io/badge/stack-TypeScript%20%2B%20Canvas%20%2B%20WebAudio-00f0ff?style=for-the-badge&labelColor=05010f)
![Zero runtime dependencies](https://img.shields.io/badge/deps-zero-ffe066?style=for-the-badge&labelColor=05010f)

*A high-voltage cyberpunk block-stacker with **Boss Rush** mode. Stack the
current. Trip the mainframe.*

---

## ⚡ Play

Live in a browser near you: **[cb.correax.com](https://cb.correax.com)**

Or run it locally:

```bash
npm install
npm run dev          # http://localhost:5173
```

Ship a static bundle:

```bash
npm run build        # → dist/
npm run preview
```

## 🎮 Controls

| Key           | Action          |
|---------------|-----------------|
| ← / →         | Move            |
| ↓             | Soft drop       |
| Space         | Hard drop       |
| ↑ / X         | Rotate CW       |
| Z             | Rotate CCW      |
| Shift / C     | Hold piece      |
| P             | Pause / resume  |
| M             | Mute audio      |
| R             | Restart run     |

Click or press any key to boot up the cabinet -- the browser needs a user gesture before the audio graph starts.

## 🕹️ Features

### Modern block-stacker fundamentals

- 7 tetrominoes with full **SRS rotation + wall-kick tables** (JLSTZ + I)
- **7-bag randomizer**, hold piece (one-swap-per-drop), ghost preview, next-3 queue
- Combo tracker (⚡ **AMPERAGE ×N**), boss-driven voltage tiers and gravity, local high score

### Boss Rush

Five rogue AIs stand between you and the mainframe:

1. **SURGE.exe** -- the warm-up, occasional voltage spikes
2. **BLACKOUT** -- hides your NEXT preview at random intervals
3. **SHORTFUSE** -- dumps garbage lines when you dawdle
4. **FEEDBACK LOOP** -- scrambles columns
5. **THE MAINFRAME** -- every attack, twice as fast

Each fight tracks **BOSS INTEGRITY**. Defeating a boss advances the **VOLTAGE TIER**
and gravity curve; the BGM drops to a frantic *boss-low* mix under 25% HP.

### Audio (100% procedural, no assets)

- Web Audio graph with reverb send/return bus + master DynamicsCompressor
- Synthwave sequencer: chord progressions, detuned-saw lead, ambient pad, real drum kit
- Punchy layered SFX: hard-drop sub boom, chromatic line-clear zaps, tetris BOOM with fanfare stab
- Persisted master, SFX, and BGM mixer controls plus `M` mute shortcut

### The look

- Circuit-trace animated background, CRT scanlines, screen shake, chromatic flash
- **Neon Pacman line-clear** -- one chomping cyberpunk Pacman per cleared row, alternating direction, RGB-split, glowing pellet trail; a Tetris summons a giant breaker Pacman with three foreground lightning arcs
- `MAIN BREAKER TRIPPED` four-line-clear banner, circuit lightning, particles, screen shake, and chromatic flash
- A large top-layer Grid Wraith roams the board briefly when a run ends, then dissolves into the cabinet glow
- Responsive arcade cabinet chrome with animated marquee, chase lights, scrolling ticker, bezel reflection, and corner screws

## 🛠️ Tech

- **TypeScript** (strict) + **HTML5 Canvas 2D** + **Web Audio API**
- **Vite** for dev / build (about 49 KB JavaScript, about 15 KB gzipped)
- **Zero runtime dependencies**
- Deployed on **Azure Static Web Apps** (Standard tier, custom domain w/ managed TLS)

## 📂 Project layout

```text
src/
├── main.ts           # boot, game loop, wiring
├── game.ts           # phase machine, scoring, boss orchestration
├── board.ts          # grid + line-clear
├── piece.ts          # tetromino shapes, SRS wall-kicks, 7-bag
├── bosses.ts         # boss definitions and attack patterns
├── effects.ts        # particles, lightning, announcements, Pacman runs
├── renderer.ts       # canvas draw pipeline
├── input.ts          # keyboard + DAS/ARR
├── audio/
│   ├── audio.ts      # graph, mixer persistence, reverb bus, compressor
│   ├── music.ts      # synthwave sequencer
│   └── sfx.ts        # procedural SFX bank
└── ...
```

## 🚀 Deploy

The live site uses Azure Static Web Apps. A push to `main` runs typecheck, tests,
production build, artifact validation, and deployment through
`.github/workflows/azure-static-web-apps.yml`.

Pull requests deploy tracker-disabled preview environments. Production pushes set
`CB_TRACKER_ENABLED=true` so only the default environment emits page views.

Run the complete local gate before a release:

```bash
npm run check
```

For emergency recovery when GitHub Actions is unavailable:

```bash
npm run build
npx @azure/static-web-apps-cli deploy ./dist \
  --deployment-token $env:SWA_TOKEN \
  --env production
```

The manual command is a recovery path, not the normal release process.

## 📜 License

MIT -- hack it, remix it, ship your own arcade cabinet.
