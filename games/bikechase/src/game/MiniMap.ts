import {
  CELL_PITCH,
  HALF_PITCH,
  type StreamingCity
} from '../world/CityLayout';
import type { PlayerBike } from '../entities/PlayerBike';
import type { PoliceUnit, RoadblockSummary } from '../entities/PoliceAI';
import type { ActivePickup } from '../entities/CityProps';

const SIZE = 172; // 2x DPR for 86x86 CSS box
const RADAR_HALF_M = 84; // Player-centered +-84m radar view
const SCALE = SIZE / (RADAR_HALF_M * 2);

export class MiniMap {
  private ctx: CanvasRenderingContext2D | null;
  private blinkClock = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.canvas.width = SIZE;
    this.canvas.height = SIZE;
    this.ctx = this.canvas.getContext('2d');
  }

  private toMapX(wx: number, px: number): number {
    return SIZE * 0.5 + (wx - px) * SCALE;
  }

  private toMapY(wz: number, pz: number): number {
    return SIZE * 0.5 + (wz - pz) * SCALE;
  }

  public render(
    dt: number,
    bike: PlayerBike,
    city: StreamingCity,
    policeUnits: readonly PoliceUnit[],
    pickups: readonly ActivePickup[],
    roadblocks: readonly RoadblockSummary[]
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.blinkClock += dt;

    ctx.clearRect(0, 0, SIZE, SIZE);

    // Background
    ctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Park & Construction district patches from streaming chunks
    for (const chunk of city.getActiveChunks()) {
      if (chunk.district === 'park') {
        ctx.fillStyle = 'rgba(34, 197, 94, 0.28)';
      } else if (chunk.district === 'construction') {
        ctx.fillStyle = 'rgba(245, 158, 11, 0.22)';
      } else if (chunk.district === 'plaza') {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.22)';
      } else {
        continue;
      }
      const x1 = this.toMapX(chunk.cx - 12, bike.x);
      const y1 = this.toMapY(chunk.cz - 12, bike.z);
      const span = 24 * SCALE;
      ctx.fillRect(x1, y1, span, span);
    }

    // Scrolling infinite avenue grid lines around player
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.42)';
    ctx.lineWidth = 5;
    const minIx = Math.floor((bike.x - RADAR_HALF_M) / CELL_PITCH) - 1;
    const maxIx = Math.ceil((bike.x + RADAR_HALF_M) / CELL_PITCH) + 1;
    for (let ix = minIx; ix <= maxIx; ix++) {
      const mx = this.toMapX(ix * CELL_PITCH + HALF_PITCH, bike.x);
      ctx.beginPath();
      ctx.moveTo(mx, 0);
      ctx.lineTo(mx, SIZE);
      ctx.stroke();
    }
    const minIz = Math.floor((bike.z - RADAR_HALF_M) / CELL_PITCH) - 1;
    const maxIz = Math.ceil((bike.z + RADAR_HALF_M) / CELL_PITCH) + 1;
    for (let iz = minIz; iz <= maxIz; iz++) {
      const my = this.toMapY(iz * CELL_PITCH + HALF_PITCH, bike.z);
      ctx.beginPath();
      ctx.moveTo(0, my);
      ctx.lineTo(SIZE, my);
      ctx.stroke();
    }

    // Sealed Roadblocks (bold red/orange crossbars across the blocked road)
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 4;
    for (let i = 0; i < roadblocks.length; i++) {
      const rb = roadblocks[i];
      const mx = this.toMapX(rb.centerX, bike.x);
      const my = this.toMapY(rb.centerZ, bike.z);
      if (mx < -8 || mx > SIZE + 8 || my < -8 || my > SIZE + 8) continue;
      ctx.beginPath();
      if (rb.axis === 'ns') {
        ctx.moveTo(mx - 6, my);
        ctx.lineTo(mx + 6, my);
      } else {
        ctx.moveTo(mx, my - 6);
        ctx.lineTo(mx, my + 6);
      }
      ctx.stroke();
    }

    // Active Nitro Pickups (cyan dots in alleys/parks/plazas)
    ctx.fillStyle = '#38bdf8';
    for (let i = 0; i < pickups.length; i++) {
      const pk = pickups[i];
      if (!pk.active) continue;
      const mx = this.toMapX(pk.x, bike.x);
      const my = this.toMapY(pk.z, bike.z);
      if (mx < 4 || mx > SIZE - 4 || my < 4 || my > SIZE - 4) continue;
      ctx.beginPath();
      ctx.arc(mx, my, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Active Police Units (白バイ = white core with pulsing red ring; cars = red/blue flashing dot)
    const flash = Math.floor(this.blinkClock * 7) % 2 === 0;
    for (let i = 0; i < policeUnits.length; i++) {
      const u = policeUnits[i];
      if (u.wrecked) continue;
      const mx = Math.max(5, Math.min(SIZE - 5, this.toMapX(u.x, bike.x)));
      const my = Math.max(5, Math.min(SIZE - 5, this.toMapY(u.z, bike.z)));
      if (u.kind === 'moto') {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = flash ? '#ef4444' : '#f87171';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(mx, my, 3.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillStyle = (i + (flash ? 0 : 1)) % 2 === 0 ? '#ef4444' : '#38bdf8';
        ctx.beginPath();
        ctx.arc(mx, my, 4.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Player directional triangle centered on radar
    const cx = SIZE * 0.5;
    const cy = SIZE * 0.5;
    const fx = Math.sin(bike.heading);
    const fz = Math.cos(bike.heading);
    const rx = -fz;
    const rz = fx;

    ctx.fillStyle = bike.isOverdrive ? '#38bdf8' : '#fef08a';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + fx * 9, cy + fz * 9);
    ctx.lineTo(cx - fx * 6 + rx * 5.5, cy - fz * 6 + rz * 5.5);
    ctx.lineTo(cx - fx * 6 - rx * 5.5, cy - fz * 6 - rz * 5.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}
