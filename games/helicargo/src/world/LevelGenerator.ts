import { CEILING_Y, GROUND_Y, PIXELS_PER_METER } from '../data';

export type LevelObstacle =
  | {
      id: number;
      kind: 'pylon';
      x: number;
      width: number;
      height: number;
      nearMissed: boolean;
    }
  | {
      id: number;
      kind: 'beam';
      x: number;
      width: number;
      bottomY: number;
      nearMissed: boolean;
    }
  | {
      id: number;
      kind: 'balloon';
      x: number;
      baseY: number;
      radius: number;
      bobAmp: number;
      bobSpeed: number;
      phase: number;
      colorIdx: number;
      nearMissed: boolean;
    }
  | {
      id: number;
      kind: 'turbine';
      x: number;
      hubY: number;
      bladeLen: number;
      angularSpeed: number;
      phase: number;
      nearMissed: boolean;
    }
  | {
      id: number;
      kind: 'birds';
      x: number;
      baseY: number;
      radius: number;
      vx: number;
      phase: number;
      spawnTime: number;
      triggered: boolean;
      nearMissed: boolean;
    };

export interface PickupItem {
  id: number;
  kind: 'star' | 'fuel';
  x: number;
  y: number;
  radius: number;
  collected: boolean;
}

export interface WindZone {
  id: number;
  xStart: number;
  xEnd: number;
  ax: number;
  ay: number;
  label: string;
}

export interface RelayPad {
  id: number;
  sector: number;
  x: number;
  width: number;
  cleared: boolean;
  dwellTimer: number;
}

export const MIN_CORRIDOR_GAP = 190;
const RELAY_METERS = [450, 950, 1500, 2100];

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function getRelayMetersForIndex(index: number): number {
  if (index < RELAY_METERS.length) {
    return RELAY_METERS[index];
  }
  const lastBase = RELAY_METERS[RELAY_METERS.length - 1];
  return lastBase + (index - RELAY_METERS.length + 1) * 650;
}

export class LevelGenerator {
  private readonly rand: () => number;
  private nextId = 1;
  private generatedUpToX = 480;
  private nextRelayIndex = 0;

  readonly obstacles: LevelObstacle[] = [];
  readonly pickups: PickupItem[] = [];
  readonly windZones: WindZone[] = [];
  readonly relayPads: RelayPad[] = [];

  constructor(seed = 20261127) {
    this.rand = mulberry32(seed);
    // Initial welcoming star rings in the starter zone
    this.pickups.push(
      { id: this.nextId++, kind: 'star', x: 340, y: 295, radius: 18, collected: false },
      { id: this.nextId++, kind: 'star', x: 430, y: 340, radius: 18, collected: false }
    );
  }

  private nextRand(min: number, max: number): number {
    return min + this.rand() * (max - min);
  }

  generateAhead(cameraRightX: number): void {
    const targetX = cameraRightX + 950;

    // Ensure relay pads are placed in range first so obstacle spawning keeps a clear buffer
    while (true) {
      const relayMeter = getRelayMetersForIndex(this.nextRelayIndex);
      const relayX = 160 + relayMeter * PIXELS_PER_METER;
      if (relayX > targetX + 350) break;

      this.relayPads.push({
        id: this.nextId++,
        sector: this.nextRelayIndex + 1,
        x: relayX,
        width: 148,
        cleared: false,
        dwellTimer: 0
      });

      // Place a celebratory star before the relay pad
      this.pickups.push({
        id: this.nextId++,
        kind: 'star',
        x: relayX - 115,
        y: 355,
        radius: 18,
        collected: false
      });

      this.nextRelayIndex += 1;
    }

    while (this.generatedUpToX < targetX) {
      const stepDist = this.nextRand(225, 315);
      const x = this.generatedUpToX + stepDist;
      this.generatedUpToX = x;

      const distMeters = Math.max(0, (x - 160) / PIXELS_PER_METER);

      // Keep ±175 logical units clear around every relay helipad
      const nearPad = this.relayPads.some((p) => Math.abs(x - p.x) < 175);
      if (nearPad) {
        continue;
      }

      this.spawnPatternAt(x, distMeters);
    }
  }

  private spawnPatternAt(x: number, distMeters: number): void {
    const roll = this.rand();

    if (distMeters < 450) {
      // Zone 1: Power pylons & bobbing balloons
      if (roll < 0.62) {
        const maxH = GROUND_Y - CEILING_Y - MIN_CORRIDOR_GAP;
        const height = Math.min(maxH, this.nextRand(155, 295));
        const pylonTopY = GROUND_Y - height;
        this.obstacles.push({
          id: this.nextId++,
          kind: 'pylon',
          x,
          width: 44,
          height,
          nearMissed: false
        });
        // Star tempting a swing-catch above or just past the pylon
        this.pickups.push({
          id: this.nextId++,
          kind: this.rand() < 0.24 ? 'fuel' : 'star',
          x: x + (this.rand() < 0.5 ? 0 : 75),
          y: Math.max(CEILING_Y + 60, pylonTopY - 78),
          radius: 18,
          collected: false
        });
      } else {
        const baseY = this.nextRand(175, 345);
        this.obstacles.push({
          id: this.nextId++,
          kind: 'balloon',
          x,
          baseY,
          radius: 30,
          bobAmp: this.nextRand(18, 34),
          bobSpeed: this.nextRand(1.2, 1.8),
          phase: this.nextRand(0, Math.PI * 2),
          colorIdx: Math.floor(this.rand() * 3),
          nearMissed: false
        });
        this.pickups.push({
          id: this.nextId++,
          kind: this.rand() < 0.22 ? 'fuel' : 'star',
          x: x + 20,
          y: baseY > 270 ? baseY - 115 : baseY + 115,
          radius: 18,
          collected: false
        });
      }
      return;
    }

    if (distMeters < 950) {
      // Zone 2: Add spinning wind turbines & overhead crane beams
      if (roll < 0.30) {
        const maxH = GROUND_Y - CEILING_Y - MIN_CORRIDOR_GAP;
        const height = Math.min(maxH, this.nextRand(175, 315));
        this.obstacles.push({
          id: this.nextId++,
          kind: 'pylon',
          x,
          width: 44,
          height,
          nearMissed: false
        });
        this.pickups.push({
          id: this.nextId++,
          kind: this.rand() < 0.28 ? 'fuel' : 'star',
          x,
          y: Math.max(CEILING_Y + 55, GROUND_Y - height - 75),
          radius: 18,
          collected: false
        });
      } else if (roll < 0.56) {
        // Overhead crane beam leaving >= MIN_CORRIDOR_GAP clear below
        const maxBottomY = GROUND_Y - MIN_CORRIDOR_GAP;
        const bottomY = Math.min(maxBottomY, this.nextRand(175, 290));
        this.obstacles.push({
          id: this.nextId++,
          kind: 'beam',
          x,
          width: 58,
          bottomY,
          nearMissed: false
        });
        this.pickups.push({
          id: this.nextId++,
          kind: this.rand() < 0.25 ? 'fuel' : 'star',
          x,
          y: Math.min(GROUND_Y - 72, bottomY + 110),
          radius: 18,
          collected: false
        });
      } else if (roll < 0.80) {
        // Wind turbine (high hub so upper or lower corridor stays clear)
        const bladeLen = this.nextRand(76, 94);
        const hubY = this.nextRand(320, 410);
        this.obstacles.push({
          id: this.nextId++,
          kind: 'turbine',
          x,
          hubY,
          bladeLen,
          angularSpeed: (this.rand() < 0.5 ? 1 : -1) * this.nextRand(1.45, 2.05),
          phase: this.nextRand(0, Math.PI * 2),
          nearMissed: false
        });
        this.pickups.push({
          id: this.nextId++,
          kind: this.rand() < 0.28 ? 'fuel' : 'star',
          x,
          y: Math.max(CEILING_Y + 55, hubY - bladeLen - 55),
          radius: 18,
          collected: false
        });
      } else {
        const baseY = this.nextRand(185, 340);
        this.obstacles.push({
          id: this.nextId++,
          kind: 'balloon',
          x,
          baseY,
          radius: 31,
          bobAmp: this.nextRand(24, 42),
          bobSpeed: this.nextRand(1.4, 2.1),
          phase: this.nextRand(0, Math.PI * 2),
          colorIdx: Math.floor(this.rand() * 3),
          nearMissed: false
        });
        this.pickups.push({
          id: this.nextId++,
          kind: 'fuel',
          x: x + 45,
          y: baseY > 270 ? baseY - 120 : baseY + 120,
          radius: 18,
          collected: false
        });
      }
      return;
    }

    // Zone 3+ (950m+): All obstacles + gust wind zones & sunset bird flocks
    if (this.rand() < 0.34) {
      const lastWind = this.windZones[this.windZones.length - 1];
      if (!lastWind || x - lastWind.xEnd > 240) {
        const dir = this.rand() < 0.5 ? -1 : 1;
        const ax = dir * this.nextRand(190, 290);
        const ay = this.nextRand(-55, 35);
        this.windZones.push({
          id: this.nextId++,
          xStart: x - 110,
          xEnd: x + 150,
          ax,
          ay,
          label: dir < 0 ? '向かい突風' : '追い突風'
        });
      }
    }

    if (roll < 0.23) {
      const maxH = GROUND_Y - CEILING_Y - MIN_CORRIDOR_GAP;
      const height = Math.min(maxH, this.nextRand(190, 325));
      this.obstacles.push({
        id: this.nextId++,
        kind: 'pylon',
        x,
        width: 46,
        height,
        nearMissed: false
      });
    } else if (roll < 0.45) {
      const maxBottomY = GROUND_Y - MIN_CORRIDOR_GAP;
      const bottomY = Math.min(maxBottomY, this.nextRand(185, 310));
      this.obstacles.push({
        id: this.nextId++,
        kind: 'beam',
        x,
        width: 60,
        bottomY,
        nearMissed: false
      });
    } else if (roll < 0.69) {
      const bladeLen = this.nextRand(82, 100);
      const hubY = this.nextRand(310, 415);
      this.obstacles.push({
        id: this.nextId++,
        kind: 'turbine',
        x,
        hubY,
        bladeLen,
        angularSpeed: (this.rand() < 0.5 ? 1 : -1) * this.nextRand(1.75, 2.45),
        phase: this.nextRand(0, Math.PI * 2),
        nearMissed: false
      });
    } else if (roll < 0.85) {
      const baseY = this.nextRand(180, 345);
      this.obstacles.push({
        id: this.nextId++,
        kind: 'balloon',
        x,
        baseY,
        radius: 32,
        bobAmp: this.nextRand(26, 46),
        bobSpeed: this.nextRand(1.5, 2.2),
        phase: this.nextRand(0, Math.PI * 2),
        colorIdx: Math.floor(this.rand() * 3),
        nearMissed: false
      });
    } else {
      // Sunset bird flock flying right-to-left once triggered near camera
      const baseY = this.nextRand(150, 390);
      this.obstacles.push({
        id: this.nextId++,
        kind: 'birds',
        x,
        baseY,
        radius: 22,
        vx: -this.nextRand(135, 195),
        phase: this.nextRand(0, Math.PI * 2),
        spawnTime: 0,
        triggered: false,
        nearMissed: false
      });
    }

    // Periodic pickups for fuel & swing catches
    this.pickups.push({
      id: this.nextId++,
      kind: this.rand() < 0.30 ? 'fuel' : 'star',
      x: x + this.nextRand(-35, 70),
      y: this.nextRand(145, 420),
      radius: 18,
      collected: false
    });
  }

  pruneBehind(minKeepX: number): void {
    const pruneArr = <T extends { x?: number; xEnd?: number }>(arr: T[]): void => {
      let writeIdx = 0;
      for (let i = 0; i < arr.length; i++) {
        const item = arr[i];
        const refX = item.xEnd ?? item.x ?? 0;
        if (refX >= minKeepX) {
          arr[writeIdx++] = item;
        }
      }
      arr.length = writeIdx;
    };

    pruneArr(this.obstacles);
    pruneArr(this.pickups);
    pruneArr(this.windZones);
    pruneArr(this.relayPads);
  }
}
