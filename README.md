# ⚡ CIRCUIT BREAKER

A high-voltage cyberpunk block-stacker with **Boss Rush** mode.
Stack the current. Trip the mainframe.

## Play

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

Or build a static bundle:

```bash
npm run build
npm run preview
```

## Controls

| Key         | Action        |
|-------------|---------------|
| ← / →       | Move          |
| ↓           | Soft drop     |
| Space       | Hard drop     |
| ↑ / X       | Rotate CW     |
| Z           | Rotate CCW    |
| Shift / C   | Hold piece    |
| P           | Pause         |
| M           | Mute audio    |
| R           | Restart       |

## Features

- 7 tetrominoes with SRS rotation + wall kicks
- 7-bag randomizer, hold piece, ghost preview, next-3 queue
- Neon glow, particles, scanlines, screen shake, chromatic flash
- **Boss Rush** across 5 rogue AIs: SURGE.exe → BLACKOUT → SHORTFUSE → FEEDBACK LOOP → THE MAINFRAME
- Boss attacks: **blown fuses** (garbage), **voltage spike** (2× gravity), **blackout** (hides next preview), **signal interference** (column scramble)
- Procedural Web Audio SFX + synthwave BGM (main / boss / low-HP variants)
- Local high score in localStorage

## Tech

- TypeScript + HTML5 Canvas 2D + Web Audio API
- Vite dev server + static build
- **Zero runtime dependencies**
