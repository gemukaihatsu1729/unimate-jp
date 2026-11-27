import {
  CAGE_HALF_H,
  CAGE_HALF_W,
  GROUND_Y,
  MIN_WORLD_W,
  PIXELS_PER_METER,
  SKY_PALETTES,
  WORLD_H,
  type CargoSpec,
  type SkyPalette
} from '../data';
import {
  getBalloonCenter,
  getBirdFlockCenter,
  getTurbineBladeSegments,
  type FlightState
} from '../physics/PendulumPhysics';
import type {
  LevelObstacle,
  PickupItem,
  RelayPad,
  WindZone
} from '../world/LevelGenerator';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  kind: 'spark' | 'grass' | 'confetti' | 'wisp';
}

export interface FloatingCallout {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

export interface SpeechBubble {
  text: string;
  life: number;
  maxLife: number;
}

export interface RenderFrameData {
  time: number;
  cameraX: number;
  shakeX: number;
  shakeY: number;
  sectorFloat: number;
  flight: FlightState;
  hookX: number;
  hookY: number;
  cargo: CargoSpec;
  invulnTimer: number;
  obstacles: readonly LevelObstacle[];
  pickups: readonly PickupItem[];
  windZones: readonly WindZone[];
  relayPads: readonly RelayPad[];
  particles: readonly Particle[];
  callouts: readonly FloatingCallout[];
  speech: SpeechBubble | null;
  activeWindAx: number;
}

function parseHexColor(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function lerpColor(a: string, b: string, t: number): string {
  const [r1, g1, b1] = parseHexColor(a);
  const [r2, g2, b2] = parseHexColor(b);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const bl = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r},${g},${bl})`;
}

function blendPalette(sectorFloat: number): SkyPalette {
  const len = SKY_PALETTES.length;
  const idx0 = ((Math.floor(sectorFloat) % len) + len) % len;
  const idx1 = (idx0 + 1) % len;
  const t = sectorFloat - Math.floor(sectorFloat);
  const p0 = SKY_PALETTES[idx0];
  const p1 = SKY_PALETTES[idx1];
  if (t <= 0.001) return p0;
  return {
    name: t < 0.5 ? p0.name : p1.name,
    skyTop: lerpColor(p0.skyTop, p1.skyTop, t),
    skyMid: lerpColor(p0.skyMid, p1.skyMid, t),
    skyHorizon: lerpColor(p0.skyHorizon, p1.skyHorizon, t),
    sunColor: lerpColor(p0.sunColor, p1.sunColor, t),
    sunGlow: t < 0.5 ? p0.sunGlow : p1.sunGlow,
    mountainFar: lerpColor(p0.mountainFar, p1.mountainFar, t),
    mountainNear: lerpColor(p0.mountainNear, p1.mountainNear, t),
    grassTop: lerpColor(p0.grassTop, p1.grassTop, t),
    grassBottom: lerpColor(p0.grassBottom, p1.grassBottom, t),
    starAlpha: p0.starAlpha + (p1.starAlpha - p0.starAlpha) * t
  };
}

export class Renderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private viewW = 800;
  private viewH = 600;
  private dpr = 1;
  private scale = 1;
  private worldOffsetY = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not initialize 2D canvas context');
    }
    this.ctx = context;
    this.resize();
  }

  resize(): { logicalW: number; logicalH: number } {
    const rect = this.canvas.getBoundingClientRect();
    this.viewW = Math.max(320, rect.width || window.innerWidth);
    this.viewH = Math.max(320, rect.height || window.innerHeight);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.canvas.width = Math.round(this.viewW * this.dpr);
    this.canvas.height = Math.round(this.viewH * this.dpr);

    this.scale = Math.min(this.viewW / MIN_WORLD_W, this.viewH / WORLD_H);
    const logicalH = this.viewH / this.scale;
    this.worldOffsetY = (logicalH - WORLD_H) * 0.5;
    return {
      logicalW: this.viewW / this.scale,
      logicalH
    };
  }

  getLogicalWidth(): number {
    return this.viewW / this.scale;
  }

  render(data: RenderFrameData): void {
    const ctx = this.ctx;
    const logicalW = this.viewW / this.scale;
    const logicalH = this.viewH / this.scale;
    const topY = -this.worldOffsetY;
    const bottomY = logicalH - this.worldOffsetY;
    const palette = blendPalette(data.sectorFloat);

    ctx.save();
    ctx.scale(this.dpr * this.scale, this.dpr * this.scale);
    ctx.translate(data.shakeX, this.worldOffsetY + data.shakeY);

    // 1. Sky gradient & sun
    this.drawSkyAndBackdrop(ctx, data, palette, logicalW, topY, bottomY);

    // 2. World-space entities
    ctx.save();
    ctx.translate(-data.cameraX, 0);

    this.drawMeadowForeground(ctx, data.cameraX, logicalW, bottomY, palette);
    this.drawWindZones(ctx, data.windZones, data.cameraX, logicalW, data.time);
    this.drawRelayPads(ctx, data.relayPads, data.cameraX, logicalW, data.time);
    this.drawPickups(ctx, data.pickups, data.cameraX, logicalW, data.time);
    this.drawObstacles(ctx, data.obstacles, data.cameraX, logicalW, data.time);
    this.drawRig(ctx, data);
    this.drawParticles(ctx, data.particles);
    this.drawCallouts(ctx, data.callouts);
    if (data.speech) {
      this.drawSpeechBubble(ctx, data.flight.cx, data.flight.cy - 44, data.speech);
    }

    ctx.restore();

    // 3. Screen-space right-edge bird warnings
    this.drawIncomingWarnings(ctx, data.obstacles, data.cameraX, logicalW, data.time);

    ctx.restore();
  }

  private drawSkyAndBackdrop(
    ctx: CanvasRenderingContext2D,
    data: RenderFrameData,
    palette: SkyPalette,
    logicalW: number,
    topY: number,
    bottomY: number
  ): void {
    const skyGrad = ctx.createLinearGradient(0, topY, 0, GROUND_Y);
    skyGrad.addColorStop(0, palette.skyTop);
    skyGrad.addColorStop(0.55, palette.skyMid);
    skyGrad.addColorStop(1, palette.skyHorizon);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(-30, topY - 30, logicalW + 60, GROUND_Y - topY + 40);

    // Grass base fill extending below GROUND_Y
    const grassGrad = ctx.createLinearGradient(0, GROUND_Y, 0, Math.max(bottomY + 30, GROUND_Y + 80));
    grassGrad.addColorStop(0, palette.grassTop);
    grassGrad.addColorStop(1, palette.grassBottom);
    ctx.fillStyle = grassGrad;
    ctx.fillRect(-30, GROUND_Y, logicalW + 60, Math.max(120, bottomY - GROUND_Y + 40));

    // Twinkling evening stars
    if (palette.starAlpha > 0.05) {
      ctx.save();
      for (let i = 0; i < 28; i++) {
        const sx = ((i * 173 + 41) % Math.max(600, Math.ceil(logicalW))) - (data.cameraX * 0.03) % 600;
        const wx = ((sx % logicalW) + logicalW) % logicalW;
        const sy = topY + 28 + ((i * 97) % 210);
        const pulse = 0.55 + 0.45 * Math.sin(data.time * 2.1 + i * 1.7);
        ctx.fillStyle = `rgba(255,255,255,${(palette.starAlpha * pulse).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(wx, sy, i % 3 === 0 ? 1.8 : 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Setting sun / moon near horizon
    const sunX = logicalW * 0.68;
    const sunY = GROUND_Y - 125;
    const glow = ctx.createRadialGradient(sunX, sunY, 16, sunX, sunY, 175);
    glow.addColorStop(0, palette.sunColor);
    glow.addColorStop(0.35, palette.sunGlow);
    glow.addColorStop(1, 'rgba(255, 180, 90, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 175, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = palette.sunColor;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 44, 0, Math.PI * 2);
    ctx.fill();

    // Soft sunset clouds
    ctx.save();
    for (let i = 0; i < 5; i++) {
      const span = logicalW + 320;
      const rawX = i * 240 - data.cameraX * 0.08 + data.time * 4;
      const cx = (((rawX % span) + span) % span) - 160;
      const cy = 92 + (i % 3) * 58;
      ctx.fillStyle = 'rgba(255, 240, 224, 0.22)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 56, 17, 0, 0, Math.PI * 2);
      ctx.ellipse(cx - 26, cy + 5, 32, 13, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 28, cy + 6, 36, 12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Far parallax mountains
    this.drawMountainLayer(ctx, data.cameraX * 0.14, logicalW, GROUND_Y - 38, 62, 190, palette.mountainFar);
    // Near blurred treeline ridge
    this.drawMountainLayer(ctx, data.cameraX * 0.28, logicalW, GROUND_Y - 10, 38, 120, palette.mountainNear);
  }

  private drawMountainLayer(
    ctx: CanvasRenderingContext2D,
    scrollX: number,
    logicalW: number,
    baseY: number,
    amp: number,
    step: number,
    color: string
  ): void {
    const startIdx = Math.floor(scrollX / step) - 1;
    const count = Math.ceil(logicalW / step) + 4;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-40, GROUND_Y + 4);
    for (let i = 0; i <= count; i++) {
      const idx = startIdx + i;
      const wx = idx * step - scrollX;
      const h = Math.sin(idx * 1.37) * 0.45 + Math.cos(idx * 0.73) * 0.35 + 0.55;
      const wy = baseY - Math.max(0.1, h) * amp;
      ctx.lineTo(wx, wy);
    }
    ctx.lineTo(logicalW + 60, GROUND_Y + 4);
    ctx.closePath();
    ctx.fill();
  }

  private drawMeadowForeground(
    ctx: CanvasRenderingContext2D,
    cameraX: number,
    logicalW: number,
    bottomY: number,
    palette: SkyPalette
  ): void {
    // Horizon highlight strip
    ctx.fillStyle = 'rgba(182, 232, 108, 0.32)';
    ctx.fillRect(cameraX - 30, GROUND_Y - 3, logicalW + 60, 6);

    // Repeating grass blades & wildflowers
    const step = 46;
    const start = Math.floor((cameraX - 40) / step) * step;
    const end = cameraX + logicalW + 60;
    ctx.strokeStyle = 'rgba(163, 230, 53, 0.55)';
    ctx.lineWidth = 2;
    for (let gx = start; gx <= end; gx += step) {
      const seed = Math.abs(Math.sin(gx * 0.13));
      const h = 7 + seed * 8;
      ctx.beginPath();
      ctx.moveTo(gx, GROUND_Y + 2);
      ctx.lineTo(gx - 4, GROUND_Y - h);
      ctx.moveTo(gx + 6, GROUND_Y + 2);
      ctx.lineTo(gx + 10, GROUND_Y - h * 0.85);
      ctx.stroke();

      // Distance signpost every 100m
      const meter = Math.round((gx - 160) / PIXELS_PER_METER);
      if (meter > 0 && meter % 100 === 0 && Math.abs(gx - (160 + meter * PIXELS_PER_METER)) < step * 0.55) {
        const px = 160 + meter * PIXELS_PER_METER;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
        ctx.fillRect(px - 22, GROUND_Y + 12, 44, 18);
        ctx.fillStyle = '#fde68a';
        ctx.font = 'bold 10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${meter}m`, px, GROUND_Y + 25);
      }
    }

    // Subtle darker foreground field band
    ctx.fillStyle = palette.grassBottom;
    ctx.globalAlpha = 0.25;
    ctx.fillRect(cameraX - 30, GROUND_Y + 36, logicalW + 60, Math.max(60, bottomY - GROUND_Y));
    ctx.globalAlpha = 1;
  }

  private drawWindZones(
    ctx: CanvasRenderingContext2D,
    zones: readonly WindZone[],
    cameraX: number,
    logicalW: number,
    time: number
  ): void {
    for (const z of zones) {
      if (z.xEnd < cameraX - 60 || z.xStart > cameraX + logicalW + 60) continue;
      const width = z.xEnd - z.xStart;
      const grad = ctx.createLinearGradient(z.xStart, 0, z.xEnd, 0);
      grad.addColorStop(0, 'rgba(125, 211, 252, 0)');
      grad.addColorStop(0.5, 'rgba(125, 211, 252, 0.14)');
      grad.addColorStop(1, 'rgba(125, 211, 252, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(z.xStart, 45, width, GROUND_Y - 55);

      const dir = z.ax >= 0 ? 1 : -1;
      ctx.strokeStyle = 'rgba(224, 242, 254, 0.45)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const py = 95 + i * 76;
        const flow = (((time * 160 * dir + i * 70) % width) + width) % width;
        const sx = z.xStart + flow;
        ctx.beginPath();
        ctx.moveTo(sx - 24 * dir, py);
        ctx.quadraticCurveTo(sx, py - 8, sx + 24 * dir, py);
        ctx.stroke();
      }
    }
  }

  private drawRelayPads(
    ctx: CanvasRenderingContext2D,
    pads: readonly RelayPad[],
    cameraX: number,
    logicalW: number,
    time: number
  ): void {
    for (const pad of pads) {
      if (pad.x + pad.width < cameraX - 60 || pad.x - pad.width > cameraX + logicalW + 60) continue;
      const left = pad.x - pad.width / 2;
      const pulse = 0.65 + 0.35 * Math.sin(time * 5);

      // Vertical glowing landing beacon
      if (!pad.cleared) {
        const beamGrad = ctx.createLinearGradient(0, GROUND_Y - 220, 0, GROUND_Y);
        beamGrad.addColorStop(0, 'rgba(74, 222, 128, 0)');
        beamGrad.addColorStop(1, `rgba(74, 222, 128, ${(0.24 * pulse).toFixed(3)})`);
        ctx.fillStyle = beamGrad;
        ctx.fillRect(left + 12, GROUND_Y - 220, pad.width - 24, 220);
      }

      // Concrete helipad deck
      ctx.fillStyle = pad.cleared ? '#334155' : '#1e293b';
      ctx.fillRect(left, GROUND_Y - 12, pad.width, 16);
      ctx.strokeStyle = pad.cleared ? '#94a3b8' : '#4ade80';
      ctx.lineWidth = 3;
      ctx.strokeRect(left, GROUND_Y - 12, pad.width, 16);

      // Yellow/Green H marking & guide label
      ctx.fillStyle = pad.cleared ? '#94a3b8' : '#fef08a';
      ctx.font = '900 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(pad.cleared ? 'CLEARED ✓' : `H RELAY #${pad.sector}`, pad.x, GROUND_Y - 20);

      // Dwell progress bar if touching
      if (!pad.cleared && pad.dwellTimer > 0) {
        const pct = Math.min(1, pad.dwellTimer / 0.25);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(pad.x - 42, GROUND_Y - 40, 84, 8);
        ctx.fillStyle = '#4ade80';
        ctx.fillRect(pad.x - 40, GROUND_Y - 38, 80 * pct, 4);
      }
    }
  }

  private drawPickups(
    ctx: CanvasRenderingContext2D,
    pickups: readonly PickupItem[],
    cameraX: number,
    logicalW: number,
    time: number
  ): void {
    for (const item of pickups) {
      if (item.collected) continue;
      if (item.x < cameraX - 50 || item.x > cameraX + logicalW + 50) continue;

      const bob = Math.sin(time * 3.5 + item.id) * 5;
      const py = item.y + bob;

      ctx.save();
      ctx.translate(item.x, py);

      if (item.kind === 'star') {
        // Glowing gold ring + star
        ctx.strokeStyle = 'rgba(253, 224, 71, 0.55)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, item.radius + Math.sin(time * 5 + item.id) * 2, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#facc15';
        ctx.strokeStyle = '#fef9c3';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 === 0 ? 11 : 5;
          const a = (i * Math.PI) / 5 - Math.PI / 2 + time * 1.4;
          const sx = Math.cos(a) * r;
          const sy = Math.sin(a) * r;
          if (i === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        // Red & white Fuel Capsule
        ctx.fillStyle = 'rgba(248, 113, 113, 0.25)';
        ctx.beginPath();
        ctx.arc(0, 0, item.radius + 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ef4444';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(-11, -13, 22, 26, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = '900 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⛽', 0, 1);
      }

      ctx.restore();
    }
  }

  private drawObstacles(
    ctx: CanvasRenderingContext2D,
    obstacles: readonly LevelObstacle[],
    cameraX: number,
    logicalW: number,
    time: number
  ): void {
    for (const obs of obstacles) {
      if (obs.kind === 'birds') {
        const pos = getBirdFlockCenter(obs, time);
        if (pos.x < cameraX - 80 || pos.x > cameraX + logicalW + 80) continue;
        this.drawBirdFlock(ctx, pos.x, pos.y, time, obs.phase);
        continue;
      }

      if (obs.x < cameraX - 140 || obs.x > cameraX + logicalW + 140) continue;

      if (obs.kind === 'pylon') {
        this.drawPylon(ctx, obs.x, obs.width, obs.height, time);
      } else if (obs.kind === 'beam') {
        this.drawOverheadBeam(ctx, obs.x, obs.width, obs.bottomY);
      } else if (obs.kind === 'balloon') {
        const pos = getBalloonCenter(obs, time);
        this.drawBalloon(ctx, pos.x, pos.y, obs.radius, obs.colorIdx);
      } else if (obs.kind === 'turbine') {
        this.drawTurbine(ctx, obs.x, obs.hubY, obs.bladeLen, obs.angularSpeed, obs.phase, time);
      }
    }
  }

  private drawPylon(
    ctx: CanvasRenderingContext2D,
    x: number,
    width: number,
    height: number,
    time: number
  ): void {
    const topY = GROUND_Y - height;
    const hw = width / 2;
    const topHw = hw * 0.42;

    ctx.save();
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 3.5;

    // Outer legs
    ctx.beginPath();
    ctx.moveTo(x - hw, GROUND_Y);
    ctx.lineTo(x - topHw, topY);
    ctx.lineTo(x + topHw, topY);
    ctx.lineTo(x + hw, GROUND_Y);
    ctx.stroke();

    // Cross lattice braces
    ctx.lineWidth = 2;
    const tiers = Math.max(4, Math.floor(height / 36));
    for (let i = 0; i < tiers; i++) {
      const t0 = i / tiers;
      const t1 = (i + 1) / tiers;
      const y0 = GROUND_Y - height * t0;
      const y1 = GROUND_Y - height * t1;
      const w0 = hw + (topHw - hw) * t0;
      const w1 = hw + (topHw - hw) * t1;
      ctx.beginPath();
      ctx.moveTo(x - w0, y0);
      ctx.lineTo(x + w1, y1);
      ctx.moveTo(x + w0, y0);
      ctx.lineTo(x - w1, y1);
      ctx.stroke();
    }

    // Cross-arms & insulators
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 4;
    const armY1 = topY + 26;
    const armY2 = topY + 66;
    ctx.beginPath();
    ctx.moveTo(x - hw * 1.15, armY1);
    ctx.lineTo(x + hw * 1.15, armY1);
    ctx.moveTo(x - hw * 0.92, armY2);
    ctx.lineTo(x + hw * 0.92, armY2);
    ctx.stroke();

    // Blinking red aviation beacon at apex
    const blink = Math.sin(time * 6 + x * 0.05) > 0;
    if (blink) {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
      ctx.beginPath();
      ctx.arc(x, topY - 4, 13, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = blink ? '#ff3b3b' : '#7f1d1d';
    ctx.beginPath();
    ctx.arc(x, topY - 4, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawOverheadBeam(
    ctx: CanvasRenderingContext2D,
    x: number,
    width: number,
    bottomY: number
  ): void {
    const left = x - width / 2;
    ctx.save();
    ctx.fillStyle = '#334155';
    ctx.fillRect(left, -40, width, bottomY + 40);

    // Hazard stripe cap at bottom
    ctx.fillStyle = '#eab308';
    ctx.fillRect(left - 4, bottomY - 22, width + 8, 22);
    ctx.fillStyle = '#0f172a';
    for (let sx = left - 2; sx < left + width; sx += 16) {
      ctx.beginPath();
      ctx.moveTo(sx, bottomY);
      ctx.lineTo(sx + 8, bottomY);
      ctx.lineTo(sx + 14, bottomY - 22);
      ctx.lineTo(sx + 6, bottomY - 22);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  private drawBalloon(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    colorIdx: number
  ): void {
    const palettes = [
      ['#ef4444', '#fde047'],
      ['#38bdf8', '#f8fafc'],
      ['#f97316', '#fef3c7']
    ];
    const [c1, c2] = palettes[colorIdx % palettes.length];

    ctx.save();
    // Envelope
    ctx.fillStyle = c1;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    // Vertical stripe highlight
    ctx.fillStyle = c2;
    ctx.beginPath();
    ctx.ellipse(x, y, radius * 0.45, radius * 0.98, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Ropes & wicker basket
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 10, y + radius - 2);
    ctx.lineTo(x - 8, y + radius + 8);
    ctx.moveTo(x + 10, y + radius - 2);
    ctx.lineTo(x + 8, y + radius + 8);
    ctx.stroke();

    ctx.fillStyle = '#92400e';
    ctx.fillRect(x - 10, y + radius + 7, 20, 14);
    ctx.restore();
  }

  private drawTurbine(
    ctx: CanvasRenderingContext2D,
    x: number,
    hubY: number,
    bladeLen: number,
    angularSpeed: number,
    phase: number,
    time: number
  ): void {
    ctx.save();
    // Tower pole
    const poleGrad = ctx.createLinearGradient(x - 8, 0, x + 8, 0);
    poleGrad.addColorStop(0, '#cbd5e1');
    poleGrad.addColorStop(0.5, '#f8fafc');
    poleGrad.addColorStop(1, '#94a3b8');
    ctx.fillStyle = poleGrad;
    ctx.fillRect(x - 7, hubY, 14, GROUND_Y - hubY);

    // 3 spinning blades
    const blades = getTurbineBladeSegments(x, hubY, bladeLen, angularSpeed, phase, time);
    for (const seg of blades) {
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(seg.x1, seg.y1);
      ctx.lineTo(seg.x2, seg.y2);
      ctx.stroke();

      // Red tip warning paint
      const tipX = seg.x1 + (seg.x2 - seg.x1) * 0.78;
      const tipY = seg.y1 + (seg.y2 - seg.y1) * 0.78;
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(seg.x2, seg.y2);
      ctx.stroke();
    }

    // Center hub
    ctx.fillStyle = '#e2e8f0';
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, hubY, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawBirdFlock(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    time: number,
    phase: number
  ): void {
    ctx.save();
    const offsets = [
      [0, 0],
      [14, -10],
      [16, 10]
    ];
    for (let i = 0; i < offsets.length; i++) {
      const bx = x + offsets[i][0];
      const by = y + offsets[i][1];
      const flap = Math.sin(time * 14 + phase + i) * 6;
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(bx - 10, by - flap);
      ctx.quadraticCurveTo(bx - 4, by - 4, bx, by);
      ctx.quadraticCurveTo(bx + 4, by - 4, bx + 10, by - flap);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawIncomingWarnings(
    ctx: CanvasRenderingContext2D,
    obstacles: readonly LevelObstacle[],
    cameraX: number,
    logicalW: number,
    time: number
  ): void {
    const rightEdge = cameraX + logicalW;
    for (const obs of obstacles) {
      if (obs.kind !== 'birds') continue;
      const pos = getBirdFlockCenter(obs, time);
      if (pos.x > rightEdge + 12 && pos.x < rightEdge + 260) {
        const blink = Math.sin(time * 16) > 0;
        ctx.save();
        ctx.fillStyle = blink ? '#ef4444' : '#f97316';
        ctx.beginPath();
        ctx.arc(logicalW - 24, pos.y, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 15px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', logicalW - 24, pos.y + 1);
        ctx.restore();
      }
    }
  }

  private drawRig(ctx: CanvasRenderingContext2D, data: RenderFrameData): void {
    const { flight, hookX, hookY, cargo, time, invulnTimer } = data;
    const blinkHide = invulnTimer > 0 && Math.floor(invulnTimer * 16) % 2 === 1;

    ctx.save();
    if (blinkHide) {
      ctx.globalAlpha = 0.45;
    }

    // 1. Tow hook + 4 ropes connecting to the wire cage corners
    const cageAngle = flight.theta * 0.45;
    const cosA = Math.cos(cageAngle);
    const sinA = Math.sin(cageAngle);
    const toCageWorld = (lx: number, ly: number): [number, number] => [
      flight.cx + lx * cosA - ly * sinA,
      flight.cy + lx * sinA + ly * cosA
    ];

    const topFL = toCageWorld(-CAGE_HALF_W, -CAGE_HALF_H);
    const topFR = toCageWorld(CAGE_HALF_W, -CAGE_HALF_H);
    const topBL = toCageWorld(-CAGE_HALF_W + 6, -CAGE_HALF_H - 6);
    const topBR = toCageWorld(CAGE_HALF_W - 6, -CAGE_HALF_H - 6);
    const botFL = toCageWorld(-CAGE_HALF_W, CAGE_HALF_H);
    const botFR = toCageWorld(CAGE_HALF_W, CAGE_HALF_H);
    const botBL = toCageWorld(-CAGE_HALF_W + 6, CAGE_HALF_H - 6);
    const botBR = toCageWorld(CAGE_HALF_W - 6, CAGE_HALF_H - 6);

    const hookBottomY = hookY + 9;
    ctx.strokeStyle = flight.winching ? '#fef08a' : 'rgba(248, 250, 252, 0.92)';
    ctx.lineWidth = flight.winching ? 2.2 : 1.7;
    for (const corner of [topBL, topBR, topFL, topFR]) {
      ctx.beginPath();
      ctx.moveTo(hookX, hookBottomY);
      ctx.lineTo(corner[0], corner[1]);
      ctx.stroke();
    }

    // 2. Wire cage back bars + white floor plate
    ctx.strokeStyle = 'rgba(203, 213, 225, 0.72)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(topBL[0], topBL[1]);
    ctx.lineTo(topBR[0], topBR[1]);
    ctx.lineTo(botBR[0], botBR[1]);
    ctx.lineTo(botBL[0], botBL[1]);
    ctx.closePath();
    ctx.stroke();

    // White base platform inside cage (matching sankou.jpg)
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(botFL[0], botFL[1]);
    ctx.lineTo(botFR[0], botFR[1]);
    ctx.lineTo(botBR[0], botBR[1]);
    ctx.lineTo(botBL[0], botBL[1]);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 3. Mascot inside the wire cage
    ctx.save();
    ctx.translate(flight.cx, flight.cy + 4);
    ctx.rotate(cageAngle);
    this.drawMascot(ctx, cargo, flight, time);
    ctx.restore();

    // 4. Wire cage front frame & diagonal tension wires
    ctx.strokeStyle = 'rgba(241, 245, 249, 0.92)';
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    ctx.moveTo(topFL[0], topFL[1]);
    ctx.lineTo(topFR[0], topFR[1]);
    ctx.lineTo(botFR[0], botFR[1]);
    ctx.lineTo(botFL[0], botFL[1]);
    ctx.closePath();
    // Side connectors
    ctx.moveTo(topFL[0], topFL[1]);
    ctx.lineTo(topBL[0], topBL[1]);
    ctx.moveTo(topFR[0], topFR[1]);
    ctx.lineTo(topBR[0], topBR[1]);
    ctx.moveTo(botFL[0], botFL[1]);
    ctx.lineTo(botBL[0], botBL[1]);
    ctx.moveTo(botFR[0], botFR[1]);
    ctx.lineTo(botBR[0], botBR[1]);
    ctx.stroke();

    // Diagonal wire braces
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.45)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(topFL[0], topFL[1]);
    ctx.lineTo(botFR[0], botFR[1]);
    ctx.moveTo(topFR[0], topFR[1]);
    ctx.lineTo(botFL[0], botFL[1]);
    ctx.stroke();

    // 5. Doctor-Heli style Helicopter
    this.drawHelicopter(ctx, flight.hx, flight.hy, flight.pitch, time);

    ctx.restore();
  }

  private drawHelicopter(
    ctx: CanvasRenderingContext2D,
    hx: number,
    hy: number,
    pitch: number,
    time: number
  ): void {
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(pitch);

    // Landing skids
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-22, 18);
    ctx.lineTo(26, 18);
    ctx.moveTo(-12, 10);
    ctx.lineTo(-15, 18);
    ctx.moveTo(12, 10);
    ctx.lineTo(15, 18);
    ctx.stroke();

    // Tow hook below skid
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(0, 18);
    ctx.lineTo(0, 23);
    ctx.arc(0, 26, 3, -Math.PI / 2, Math.PI * 1.15);
    ctx.stroke();

    // Tail boom & red vertical stabilizer
    ctx.fillStyle = '#f1f5f9';
    ctx.beginPath();
    ctx.moveTo(-16, -5);
    ctx.lineTo(-58, -9);
    ctx.lineTo(-58, -3);
    ctx.lineTo(-16, 4);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.moveTo(-60, -21);
    ctx.lineTo(-50, -21);
    ctx.lineTo(-47, -3);
    ctx.lineTo(-58, -3);
    ctx.closePath();
    ctx.fill();

    // Spinning tail rotor
    const tailLen = 9 * Math.sin(time * 38);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-55, -13 - tailLen);
    ctx.lineTo(-55, -13 + tailLen);
    ctx.stroke();

    // Main white fuselage
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(2, -2, 31, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Twin crimson Doctor stripes
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.moveTo(-12, -15);
    ctx.lineTo(-5, -15);
    ctx.lineTo(1, 11);
    ctx.lineTo(-6, 11);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-2, -15);
    ctx.lineTo(2, -15);
    ctx.lineTo(8, 10);
    ctx.lineTo(4, 10);
    ctx.closePath();
    ctx.fill();

    // Tinted front windshield & side windows
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.moveTo(10, -12);
    ctx.quadraticCurveTo(28, -11, 31, -2);
    ctx.lineTo(10, -1);
    ctx.closePath();
    ctx.fill();

    ctx.fillRect(-1, -10, 9, 7);

    // Specular sunset glint on windshield
    ctx.fillStyle = 'rgba(253, 224, 71, 0.45)';
    ctx.beginPath();
    ctx.moveTo(15, -10);
    ctx.lineTo(24, -8);
    ctx.lineTo(21, -4);
    ctx.lineTo(13, -5);
    ctx.closePath();
    ctx.fill();

    // Blue "Doctor" side lettering
    ctx.fillStyle = '#1d4ed8';
    ctx.font = 'italic 900 7px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Doctor', 4, 7);

    // Rotor mast + fast spinning main rotor disc
    ctx.fillStyle = '#475569';
    ctx.fillRect(-3, -22, 6, 8);

    const bladeSpan = 46 * Math.cos(time * 42);
    ctx.fillStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.beginPath();
    ctx.ellipse(0, -22, 48, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-bladeSpan, -22);
    ctx.lineTo(bladeSpan, -22);
    ctx.stroke();

    ctx.restore();
  }

  private drawMascot(
    ctx: CanvasRenderingContext2D,
    cargo: CargoSpec,
    flight: FlightState,
    time: number
  ): void {
    const panic = Math.min(1, Math.abs(flight.theta) * 1.15 + Math.abs(flight.omega) * 0.2);
    const armWave = Math.sin(time * (8 + panic * 10)) * (4 + panic * 6);
    const lookX = Math.max(-1.6, Math.min(1.6, flight.omega * 0.5 + flight.hvx * 0.004));

    if (cargo.id === 'poyo') {
      // Minimalist blue body + red round head abstract character
      const squash = 1 + Math.sin(time * 7 + flight.omega) * 0.04;
      ctx.save();
      ctx.scale(squash, 2 - squash);

      // Stubby waving blue arms
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-7, 4);
      ctx.lineTo(-14, -2 + armWave);
      ctx.moveTo(7, 4);
      ctx.lineTo(14, -2 - armWave);
      ctx.stroke();

      // Smooth rounded blue body
      ctx.fillStyle = '#3b82f6';
      ctx.strokeStyle = '#1d4ed8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(0, 7, 9, 9.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Smooth round red face/head
      ctx.fillStyle = '#ef4444';
      ctx.strokeStyle = '#b91c1c';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, -6.5, 9.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Subtle highlight on head
      ctx.fillStyle = 'rgba(254, 202, 202, 0.55)';
      ctx.beginPath();
      ctx.ellipse(-3.5, -11.5, 3.5, 2, -0.4, 0, Math.PI * 2);
      ctx.fill();

      // 2 minimalist eyes (white sclera + dark pupils, or >< on panic)
      if (panic > 0.65) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(-5.5, -8.5);
        ctx.lineTo(-2.5, -6.5);
        ctx.lineTo(-5.5, -4.5);
        ctx.moveTo(5.5, -8.5);
        ctx.lineTo(2.5, -6.5);
        ctx.lineTo(5.5, -4.5);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-3.6, -6.8, 2.3, 0, Math.PI * 2);
        ctx.arc(3.6, -6.8, 2.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(-3.6 + lookX * 0.55, -6.8, 1.15, 0, Math.PI * 2);
        ctx.arc(3.6 + lookX * 0.55, -6.8, 1.15, 0, Math.PI * 2);
        ctx.fill();
      }

      // Small expressive mouth
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      if (panic > 0.55) {
        ctx.arc(0, -2, 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.arc(0, -3.2, 2.2, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();
      }
      ctx.restore();
    } else if (cargo.id === 'cube') {
      // Minimalist translucent amber jelly cube
      const squash = 1 + Math.sin(time * 9 + flight.omega) * (0.05 + panic * 0.06);
      ctx.save();
      ctx.scale(squash, 2 - squash);

      ctx.fillStyle = '#fbbf24';
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.roundRect(-11, -9, 22, 22, 6);
      ctx.fill();
      ctx.stroke();

      // Inner gloss
      ctx.fillStyle = 'rgba(254, 249, 195, 0.65)';
      ctx.beginPath();
      ctx.roundRect(-8, -6, 7, 4, 2);
      ctx.fill();

      // Minimalist dot eyes + tiny smile
      ctx.fillStyle = '#451a03';
      ctx.beginPath();
      ctx.arc(-4 + lookX * 0.5, 0, 1.7, 0, Math.PI * 2);
      ctx.arc(4 + lookX * 0.5, 0, 1.7, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (panic > 0.6) {
        ctx.arc(0, 5, 2.2, 0, Math.PI * 2);
      } else {
        ctx.arc(0, 3.5, 2.5, 0.15 * Math.PI, 0.85 * Math.PI);
      }
      ctx.stroke();
      ctx.restore();
    } else {
      // Minimalist geometric silver capsule unit
      ctx.fillStyle = '#f8fafc';
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.roundRect(-10, -14, 20, 27, 10);
      ctx.fill();
      ctx.stroke();

      // Metallic belt stripe
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(-9.5, 1, 19, 4);

      // Sleek glowing visor bar
      ctx.fillStyle = panic > 0.65 ? '#ef4444' : '#38bdf8';
      ctx.beginPath();
      ctx.roundRect(-7, -8, 14, 4.5, 2);
      ctx.fill();

      // Minimalist geometric dot antenna
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(0, -19);
      ctx.stroke();
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(0, -20, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D, particles: readonly Particle[]): void {
    for (const p of particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      if (p.kind === 'confetti') {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.life * 8);
        ctx.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private drawCallouts(ctx: CanvasRenderingContext2D, callouts: readonly FloatingCallout[]): void {
    for (const c of callouts) {
      const alpha = Math.min(1, (c.life / c.maxLife) * 1.4);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = '900 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.lineWidth = 4;
      ctx.strokeText(c.text, c.x, c.y);
      ctx.fillStyle = c.color;
      ctx.fillText(c.text, c.x, c.y);
      ctx.restore();
    }
  }

  private drawSpeechBubble(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    speech: SpeechBubble
  ): void {
    const alpha = Math.min(1, speech.life * 3);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 12px system-ui, sans-serif';
    const w = Math.max(66, ctx.measureText(speech.text).width + 18);
    const h = 24;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h, w, h, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(speech.text, x, y - h / 2);
    ctx.restore();
  }
}
