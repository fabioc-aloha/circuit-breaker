// CIRCUIT BREAKER — canvas rendering pipeline
import {
  BOARD_PX_H,
  BOARD_PX_W,
  CANVAS_H,
  CANVAS_W,
  CELL,
  COLORS,
  COLS,
  HIDDEN_ROWS,
  HUD_PADDING,
  PIECE_COLORS,
  ROWS,
  SIDE_PANEL_W,
} from './constants';
import type { ActiveBoss, ActivePiece, CellValue, PieceKind } from './types';
import type { Board } from './board';
import type { EffectsManager } from './effects';
import { cellsOf, SHAPES } from './piece';

export interface RenderState {
  board: Board;
  active: ActivePiece | null;
  ghost: ActivePiece | null;
  hold: PieceKind | null;
  holdLocked: boolean;
  nextQueue: PieceKind[];
  score: number;
  hiScore: number;
  lines: number;
  level: number;
  combo: number;
  boss: ActiveBoss | null;
  blackout: boolean;
  spike: boolean;
  paused: boolean;
  gameOver: boolean;
  victory: boolean;
  bootText: string | null;
  cutsceneText: string[] | null;
  muted: boolean;
  time: number; // performance.now()
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private boardX: number;
  private boardY: number;
  private leftPanelX: number;
  private rightPanelX: number;

  constructor(canvas: HTMLCanvasElement, private effects: EffectsManager) {
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D unsupported');
    this.ctx = ctx;
    this.leftPanelX = HUD_PADDING;
    this.boardX = HUD_PADDING + SIDE_PANEL_W + HUD_PADDING;
    this.boardY = HUD_PADDING;
    this.rightPanelX = this.boardX + BOARD_PX_W + HUD_PADDING;
  }

  render(s: RenderState): void {
    const ctx = this.ctx;
    const shake = this.effects.currentShake();
    ctx.save();
    ctx.translate(shake.x, shake.y);

    this.drawBackground(s);
    this.drawLeftPanel(s);
    this.drawBoard(s);
    this.drawRightPanel(s);
    this.drawPacmen(s.time);
    this.drawParticles();
    this.drawScanlines();

    ctx.restore();

    // Flash overlay (not shaken)
    const flash = this.effects.currentFlash();
    if (flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(0.8, flash)})`;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }

    if (s.paused) this.drawCenterBanner('⏸ PAUSED', 'PRESS P TO RESUME');
    if (s.gameOver) this.drawCenterBanner('⚡ CIRCUIT BROKEN ⚡', 'PRESS R TO REBOOT');
    if (s.victory) this.drawCenterBanner('▲ GRID CLEARED ▲', 'PRESS R FOR NEW RUN');
    if (s.cutsceneText) this.drawCutscene(s.cutsceneText);
    if (s.muted) this.drawMuteBadge();
  }

  // ----- background -----
  private drawBackground(s: RenderState): void {
    const ctx = this.ctx;
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    // Animated circuit-trace grid
    ctx.strokeStyle = COLORS.copperTrace;
    ctx.lineWidth = 1;
    const t = s.time / 4000;
    for (let x = 0; x < CANVAS_W; x += 40) {
      const off = ((t * 20 + x) % 40) - 20;
      ctx.beginPath();
      ctx.moveTo(x + off, 0);
      ctx.lineTo(x + off, CANVAS_H);
      ctx.stroke();
    }
    for (let y = 0; y < CANVAS_H; y += 40) {
      const off = ((t * 15 + y) % 40) - 20;
      ctx.beginPath();
      ctx.moveTo(0, y + off);
      ctx.lineTo(CANVAS_W, y + off);
      ctx.stroke();
    }
  }

  // ----- board -----
  private drawBoard(s: RenderState): void {
    const ctx = this.ctx;
    // Panel bg + border
    this.drawPanel(this.boardX - 4, this.boardY - 4, BOARD_PX_W + 8, BOARD_PX_H + 8);

    // Grid
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(this.boardX + x * CELL + 0.5, this.boardY);
      ctx.lineTo(this.boardX + x * CELL + 0.5, this.boardY + BOARD_PX_H);
      ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(this.boardX, this.boardY + y * CELL + 0.5);
      ctx.lineTo(this.boardX + BOARD_PX_W, this.boardY + y * CELL + 0.5);
      ctx.stroke();
    }

    // Locked cells
    for (let y = HIDDEN_ROWS; y < HIDDEN_ROWS + ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const v = s.board.grid[y][x];
        if (v !== 0) {
          this.drawCell(x, y - HIDDEN_ROWS, this.colorForCell(v), false);
        }
      }
    }

    // Ghost
    if (s.ghost && !s.gameOver) {
      for (const c of cellsOf(s.ghost)) {
        if (c.y >= HIDDEN_ROWS) this.drawGhostCell(c.x, c.y - HIDDEN_ROWS);
      }
    }
    // Active piece
    if (s.active && !s.gameOver) {
      const color = PIECE_COLORS[s.active.kind];
      for (const c of cellsOf(s.active)) {
        if (c.y >= HIDDEN_ROWS) this.drawCell(c.x, c.y - HIDDEN_ROWS, color, true);
      }
    }
  }

  private colorForCell(v: CellValue): string {
    if (v === 0) return COLORS.bg;
    if (v === 'G') return PIECE_COLORS.G;
    return PIECE_COLORS[v];
  }

  private drawCell(bx: number, by: number, color: string, glow: boolean): void {
    const ctx = this.ctx;
    const x = this.boardX + bx * CELL;
    const y = this.boardY + by * CELL;
    ctx.save();
    if (glow) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
    }
    ctx.fillStyle = color;
    ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
    ctx.restore();
    // Inner highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 2.5, y + 2.5, CELL - 5, CELL - 5);
    // Dark inset
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.strokeRect(x + 4.5, y + 4.5, CELL - 9, CELL - 9);
  }

  private drawGhostCell(bx: number, by: number): void {
    const ctx = this.ctx;
    const x = this.boardX + bx * CELL;
    const y = this.boardY + by * CELL;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(x + 2.5, y + 2.5, CELL - 5, CELL - 5);
    ctx.setLineDash([]);
  }

  // ----- side panels -----
  private drawLeftPanel(s: RenderState): void {
    const ctx = this.ctx;
    const x = this.leftPanelX;
    const y = HUD_PADDING;
    this.drawPanel(x, y, SIDE_PANEL_W, 160);
    this.drawLabel(x + 12, y + 22, 'HOLD');
    this.drawMiniPiece(x + SIDE_PANEL_W / 2, y + 90, s.hold, s.holdLocked);

    // Boss panel below
    const by = y + 180;
    this.drawPanel(x, by, SIDE_PANEL_W, 220);
    this.drawLabel(x + 12, by + 22, 'BOSS');
    if (s.boss) {
      const b = s.boss;
      ctx.fillStyle = b.def.color;
      ctx.shadowColor = b.def.color;
      ctx.shadowBlur = 8;
      ctx.font = 'bold 16px Consolas, monospace';
      ctx.fillText(b.def.name, x + 12, by + 50);
      ctx.shadowBlur = 0;
      // Integrity bar
      const bx = x + 12;
      const bw = SIDE_PANEL_W - 24;
      const bh = 14;
      const by2 = by + 66;
      ctx.strokeStyle = COLORS.panelBorder;
      ctx.strokeRect(bx + 0.5, by2 + 0.5, bw, bh);
      const frac = Math.max(0, b.hp / b.maxHp);
      const barColor = frac < 0.25 ? COLORS.bossHpLow : COLORS.bossHp;
      ctx.fillStyle = barColor;
      ctx.shadowColor = barColor;
      ctx.shadowBlur = 8;
      // Jagged voltage-meter style: fill with vertical zaps
      const barW = Math.floor(bw * frac);
      ctx.fillRect(bx + 1, by2 + 2, Math.max(0, barW - 2), bh - 3);
      ctx.shadowBlur = 0;
      ctx.fillStyle = COLORS.hudDim;
      ctx.font = '11px Consolas, monospace';
      ctx.fillText(`INTEGRITY ${Math.max(0, b.hp)}/${b.maxHp}`, bx, by2 + bh + 14);
      // Taunt
      ctx.fillStyle = COLORS.hudText;
      this.wrapText(b.def.taunt, bx, by2 + bh + 36, bw, 14);
      // Attack timer
      const secs = Math.max(0, b.attackTimer / 1000);
      ctx.fillStyle = secs < 3 ? COLORS.warn : COLORS.hudDim;
      ctx.font = '11px Consolas, monospace';
      ctx.fillText(`NEXT ATTACK ${secs.toFixed(1)}s`, bx, by + 200);
    } else {
      ctx.fillStyle = COLORS.hudDim;
      ctx.font = '12px Consolas, monospace';
      ctx.fillText('NO TARGET', x + 12, by + 60);
    }
  }

  private drawRightPanel(s: RenderState): void {
    const ctx = this.ctx;
    const x = this.rightPanelX;
    const y = HUD_PADDING;
    // NEXT panel
    this.drawPanel(x, y, SIDE_PANEL_W, 260);
    this.drawLabel(x + 12, y + 22, 'NEXT');
    if (s.blackout) {
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.fillRect(x + 8, y + 32, SIDE_PANEL_W - 16, 220);
      ctx.fillStyle = COLORS.warn;
      ctx.font = 'bold 14px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('⚠ BLACKOUT', x + SIDE_PANEL_W / 2, y + 140);
      ctx.textAlign = 'start';
    } else {
      for (let i = 0; i < Math.min(3, s.nextQueue.length); i++) {
        this.drawMiniPiece(x + SIDE_PANEL_W / 2, y + 80 + i * 70, s.nextQueue[i], false);
      }
    }

    // Stats
    const sy = y + 280;
    this.drawPanel(x, sy, SIDE_PANEL_W, 200);
    this.drawStat(x + 12, sy + 24, 'SCORE', s.score.toString());
    this.drawStat(x + 12, sy + 60, 'HI-SCORE', s.hiScore.toString());
    this.drawStat(x + 12, sy + 96, 'VOLTAGE TIER', s.level.toString());
    this.drawStat(x + 12, sy + 132, 'LINES', s.lines.toString());
    if (s.combo > 1) {
      ctx.fillStyle = COLORS.warn;
      ctx.shadowColor = COLORS.warn;
      ctx.shadowBlur = 8;
      ctx.font = 'bold 14px Consolas, monospace';
      ctx.fillText(`AMPERAGE ×${s.combo}`, x + 12, sy + 170);
      ctx.shadowBlur = 0;
    }
    if (s.spike) {
      ctx.fillStyle = COLORS.warn;
      ctx.font = 'bold 12px Consolas, monospace';
      ctx.fillText('⚡ VOLTAGE SPIKE', x + 12, sy + 190);
    }
  }

  private drawPanel(x: number, y: number, w: number, h: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = COLORS.panelBg;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = COLORS.panelBorder;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  private drawLabel(x: number, y: number, text: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = COLORS.cyan;
    ctx.shadowColor = COLORS.cyan;
    ctx.shadowBlur = 6;
    ctx.font = 'bold 12px Consolas, monospace';
    ctx.fillText(text, x, y);
    ctx.shadowBlur = 0;
  }

  private drawStat(x: number, y: number, label: string, value: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = COLORS.hudDim;
    ctx.font = '10px Consolas, monospace';
    ctx.fillText(label, x, y);
    ctx.fillStyle = COLORS.hudText;
    ctx.shadowColor = COLORS.cyan;
    ctx.shadowBlur = 4;
    ctx.font = 'bold 18px Consolas, monospace';
    ctx.fillText(value, x, y + 20);
    ctx.shadowBlur = 0;
  }

  private drawMiniPiece(cx: number, cy: number, kind: PieceKind | null, dim: boolean): void {
    if (!kind) return;
    const shape = SHAPES[kind][0];
    const size = 16;
    const minX = Math.min(...shape.map((p) => p.x));
    const maxX = Math.max(...shape.map((p) => p.x));
    const minY = Math.min(...shape.map((p) => p.y));
    const maxY = Math.max(...shape.map((p) => p.y));
    const w = (maxX - minX + 1) * size;
    const h = (maxY - minY + 1) * size;
    const ox = cx - w / 2 - minX * size;
    const oy = cy - h / 2 - minY * size;
    const color = dim ? '#5a5f6b' : PIECE_COLORS[kind];
    const ctx = this.ctx;
    for (const c of shape) {
      const x = ox + c.x * size;
      const y = oy + c.y * size;
      ctx.save();
      if (!dim) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
      }
      ctx.fillStyle = color;
      ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.strokeRect(x + 1.5, y + 1.5, size - 3, size - 3);
    }
  }

  // ----- overlays -----
  private drawPacmen(timeMs: number): void {
    const ctx = this.ctx;
    for (const pm of this.effects.pacmen) {
      // Pellet trail
      for (const pel of pm.pellets) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, pel.life) * 0.9;
        ctx.shadowColor = pm.color;
        ctx.shadowBlur = 10;
        ctx.fillStyle = pm.color;
        ctx.beginPath();
        ctx.arc(pel.x, pel.y, pel.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      if (pm.life <= 0) continue;

      // Chomp animation: mouth opens/closes at ~10Hz
      const chomp = 0.5 + 0.5 * Math.sin(timeMs * 0.02);
      const maxMouth = Math.PI / 3.2;
      const mouthAngle = chomp * maxMouth;
      const facing = pm.reverse ? Math.PI : 0; // face left when reversed

      const drawBody = (offsetX: number, offsetY: number, tint: string, alpha: number): void => {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.shadowColor = tint;
        ctx.shadowBlur = 18;
        ctx.fillStyle = tint;
        ctx.beginPath();
        ctx.moveTo(pm.x + offsetX, pm.y + offsetY);
        ctx.arc(
          pm.x + offsetX,
          pm.y + offsetY,
          pm.size,
          facing + mouthAngle,
          facing + Math.PI * 2 - mouthAngle,
        );
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      };

      // RGB split — cyan and magenta ghost copies for chromatic aberration
      drawBody(-2, 0, '#00f0ff', 0.4);
      drawBody(2, 0, '#ff00e5', 0.4);
      // Main neon body
      drawBody(0, 0, pm.color, Math.max(0, pm.life));

      // Digital scan strip across the body — cyberpunk data-corruption vibe
      ctx.save();
      ctx.globalAlpha = 0.35 * Math.max(0, pm.life);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      const stripY = pm.y + ((timeMs * 0.08) % (pm.size * 2)) - pm.size;
      ctx.beginPath();
      ctx.moveTo(pm.x - pm.size, stripY);
      ctx.lineTo(pm.x + pm.size, stripY);
      ctx.stroke();
      ctx.restore();

      // Eye — glowing dot above center
      ctx.save();
      ctx.globalAlpha = Math.max(0, pm.life);
      ctx.fillStyle = '#0a0018';
      const eyeX = pm.x + (pm.reverse ? -pm.size * 0.25 : pm.size * 0.25);
      const eyeY = pm.y - pm.size * 0.35;
      ctx.beginPath();
      ctx.arc(eyeX, eyeY, pm.size * 0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 6;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(eyeX + (pm.reverse ? -1 : 1), eyeY, pm.size * 0.07, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawParticles(): void {
    const ctx = this.ctx;
    for (const p of this.effects.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      ctx.restore();
    }
  }

  private drawScanlines(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#000';
    for (let y = 0; y < CANVAS_H; y += 3) ctx.fillRect(0, y, CANVAS_W, 1);
    ctx.restore();
  }

  private drawCenterBanner(title: string, sub: string): void {
    const ctx = this.ctx;
    const cx = this.boardX + BOARD_PX_W / 2;
    const cy = this.boardY + BOARD_PX_H / 2;
    ctx.fillStyle = 'rgba(5,1,15,0.75)';
    ctx.fillRect(this.boardX, cy - 60, BOARD_PX_W, 120);
    ctx.strokeStyle = COLORS.cyan;
    ctx.strokeRect(this.boardX + 0.5, cy - 60 + 0.5, BOARD_PX_W - 1, 120 - 1);
    ctx.fillStyle = COLORS.cyan;
    ctx.shadowColor = COLORS.cyan;
    ctx.shadowBlur = 12;
    ctx.textAlign = 'center';
    ctx.font = 'bold 22px Consolas, monospace';
    ctx.fillText(title, cx, cy - 8);
    ctx.font = '13px Consolas, monospace';
    ctx.shadowBlur = 4;
    ctx.fillText(sub, cx, cy + 22);
    ctx.textAlign = 'start';
    ctx.shadowBlur = 0;
  }

  private drawCutscene(lines: string[]): void {
    const ctx = this.ctx;
    const cx = this.boardX + BOARD_PX_W / 2;
    const cy = this.boardY + BOARD_PX_H / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(this.boardX, cy - 80, BOARD_PX_W, 160);
    ctx.strokeStyle = COLORS.magenta;
    ctx.strokeRect(this.boardX + 0.5, cy - 80 + 0.5, BOARD_PX_W - 1, 160 - 1);
    ctx.fillStyle = COLORS.magenta;
    ctx.shadowColor = COLORS.magenta;
    ctx.shadowBlur = 10;
    ctx.textAlign = 'center';
    ctx.font = 'bold 14px Consolas, monospace';
    let y = cy - 50;
    for (const line of lines) {
      ctx.fillText(line, cx, y);
      y += 26;
    }
    ctx.textAlign = 'start';
    ctx.shadowBlur = 0;
  }

  private drawMuteBadge(): void {
    const ctx = this.ctx;
    ctx.fillStyle = COLORS.warn;
    ctx.font = 'bold 11px Consolas, monospace';
    ctx.fillText('🔇 MUTED (M)', HUD_PADDING + 6, CANVAS_H - 8);
  }

  private wrapText(text: string, x: number, y: number, maxW: number, lineH: number): void {
    const ctx = this.ctx;
    ctx.font = '11px Consolas, monospace';
    const words = text.split(' ');
    let line = '';
    let yy = y;
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, yy);
        yy += lineH;
        line = w;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, yy);
  }
}
