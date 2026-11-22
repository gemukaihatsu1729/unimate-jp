export const ROAD_WIDTH = 11;
export const BLOCK_SIZE = 24;
export const CELL_PITCH = 35;
export const HALF_PITCH = CELL_PITCH * 0.5; // 17.5
export const ACTIVE_RADIUS = 3; // 7x7 = 49 active streaming chunks around player

export type DistrictKind = 'plaza' | 'downtown' | 'park' | 'construction' | 'residential';

export interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
  isBoundary?: boolean;
}

export interface BuildingBox extends AABB {
  district: DistrictKind;
  color: number;
  accentColor: number;
  hasNeonSign: boolean;
  neonColor: number;
  rooftopTrim: boolean;
}

export interface RampZone {
  id: number;
  cx: number;
  cz: number;
  dirX: number;
  dirZ: number;
  width: number;
  length: number;
  height: number;
}

export interface ParkZone {
  cx: number;
  cz: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  fountainX: number;
  fountainZ: number;
  trees: Array<{ x: number; z: number; scale: number; pine: boolean }>;
}

export interface AlleyHint {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  cx: number;
  cz: number;
  axis: 'ns' | 'ew';
  width: number;
}

export interface PropAnchor {
  x: number;
  z: number;
  kind: 'cone' | 'crate' | 'umbrella' | 'sign';
}

export interface PickupAnchor {
  x: number;
  z: number;
  preferKind: 'nitro';
}

export interface CityChunkData {
  key: string;
  bx: number;
  bz: number;
  cx: number;
  cz: number;
  district: DistrictKind;
  buildings: BuildingBox[];
  colliders: AABB[];
  ramps: RampZone[];
  parks: ParkZone[];
  alleys: AlleyHint[];
  propAnchors: PropAnchor[];
  pickupAnchors: PickupAnchor[];
}

export interface ChunkDelta {
  changed: boolean;
  centerBx: number;
  centerBz: number;
  loaded: CityChunkData[];
  unloadedKeys: string[];
}

export interface IntersectionCoord {
  ix: number;
  iz: number;
  x: number;
  z: number;
}

const DOWNTOWN_COLORS = [0x3b4d70, 0x43577d, 0x354769, 0x4b5f85];
const RESIDENTIAL_COLORS = [0x6b7280, 0x7c6f64, 0x64748b, 0x78716c];
const NEON_ACCENTS = [0x38bdf8, 0xf472b6, 0xfbbf24, 0x34d399, 0xa78bfa];

export function chunkKey(bx: number, bz: number): string {
  return `${bx},${bz}`;
}

export function worldToBlock(v: number): number {
  return Math.round(v / CELL_PITCH);
}

export function nearestIntersection(x: number, z: number): IntersectionCoord {
  const ix = Math.floor(x / CELL_PITCH);
  const iz = Math.floor(z / CELL_PITCH);
  return {
    ix,
    iz,
    x: ix * CELL_PITCH + HALF_PITCH,
    z: iz * CELL_PITCH + HALF_PITCH
  };
}

export function intersectionCoords(ix: number, iz: number): IntersectionCoord {
  return {
    ix,
    iz,
    x: ix * CELL_PITCH + HALF_PITCH,
    z: iz * CELL_PITCH + HALF_PITCH
  };
}

export function hashCoords(seed: number, x: number, z: number): number {
  let h = (seed | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (x | 0), 0x85ebca6b);
  h = Math.imul(h ^ (z | 0), 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function createSeededRng(seed: number, bx: number, bz: number): () => number {
  let state = hashCoords(seed, bx, bz) || 1;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickDistrict(seed: number, bx: number, bz: number, rng: () => number): DistrictKind {
  if (bx === 0 && bz === 0) return 'plaza';

  // Macro neighborhood grouping (2x2 block regions) for cohesive districts
  const mx = Math.floor(bx / 2);
  const mz = Math.floor(bz / 2);
  const macroHash = hashCoords(seed + 101, mx, mz) % 100;
  const roll = rng();

  // Keep immediate starting sightline neighbor blocks scenic & recognizable
  if (bx === -1 && bz === 0) return roll < 0.5 ? 'downtown' : 'park';
  if (bx === 1 && bz === 1) return 'construction';

  if (roll < 0.06) return 'plaza';
  if (roll < 0.19) return 'park';
  if (roll < 0.30) return 'construction';
  if (macroHash < 58) {
    return roll < 0.78 ? 'downtown' : 'residential';
  }
  return roll < 0.72 ? 'residential' : 'downtown';
}

export function generateCityBlock(seed: number, bx: number, bz: number): CityChunkData {
  const cx = bx * CELL_PITCH;
  const cz = bz * CELL_PITCH;
  const key = chunkKey(bx, bz);
  const rng = createSeededRng(seed, bx, bz);

  const buildings: BuildingBox[] = [];
  const colliders: AABB[] = [];
  const ramps: RampZone[] = [];
  const parks: ParkZone[] = [];
  const alleys: AlleyHint[] = [];
  const propAnchors: PropAnchor[] = [];
  const pickupAnchors: PickupAnchor[] = [];

  const district = pickDistrict(seed, bx, bz, rng);
  const baseRampId = (hashCoords(seed + 7, bx, bz) & 0x0fffffff);

  const addRamp = (
    offsetIdx: number,
    rx: number,
    rz: number,
    dirX: number,
    dirZ: number,
    width = 3.8,
    length = 7.2,
    height = 2.0
  ): void => {
    ramps.push({
      id: baseRampId + offsetIdx,
      cx: rx,
      cz: rz,
      dirX,
      dirZ,
      width,
      length,
      height
    });
  };

  if (district === 'plaza') {
    const towerHalf = 1.9 + rng() * 0.4;
    const towerBox: BuildingBox = {
      minX: cx - towerHalf,
      maxX: cx + towerHalf,
      minZ: cz - towerHalf,
      maxZ: cz + towerHalf,
      height: 8.2 + rng() * 1.3,
      district: 'plaza',
      color: 0x475569,
      accentColor: 0xfbbf24,
      hasNeonSign: true,
      neonColor: NEON_ACCENTS[Math.floor(rng() * NEON_ACCENTS.length)],
      rooftopTrim: true
    };
    buildings.push(towerBox);
    colliders.push(towerBox);

    const rampSide = rng() < 0.5 ? -1 : 1;
    addRamp(0, cx + rampSide * 7.6, cz + 1.2, 0, -1, 3.6, 6.8, 1.85);

    propAnchors.push(
      { x: cx - 9.8, z: cz - 9.8, kind: 'umbrella' },
      { x: cx + 9.8, z: cz - 9.8, kind: 'umbrella' },
      { x: cx - 9.8, z: cz + 9.8, kind: 'sign' },
      { x: cx + 9.8, z: cz + 9.8, kind: 'sign' }
    );
    pickupAnchors.push({ x: cx - rampSide * 7.0, z: cz - 5.5, preferKind: 'nitro' });
  } else if (district === 'park') {
    const flipX = rng() < 0.5 ? -1 : 1;
    const flipZ = rng() < 0.5 ? -1 : 1;
    const fountainX = cx + flipX * 4.2;
    const fountainZ = cz + flipZ * 4.2;

    colliders.push({
      minX: fountainX - 1.9,
      maxX: fountainX + 1.9,
      minZ: fountainZ - 1.9,
      maxZ: fountainZ + 1.9,
      height: 1.5
    });

    const treeOffsets = [
      { dx: -8.6, dz: -8.6, scale: 1.05 + rng() * 0.2, pine: rng() < 0.5 },
      { dx: 8.6, dz: -8.6, scale: 0.95 + rng() * 0.2, pine: rng() < 0.5 },
      { dx: -8.6, dz: 8.6, scale: 0.95 + rng() * 0.2, pine: rng() < 0.5 },
      { dx: 8.6, dz: 8.6, scale: 1.05 + rng() * 0.2, pine: rng() < 0.5 }
    ];
    const trees: ParkZone['trees'] = [];
    for (const t of treeOffsets) {
      const tx = cx + t.dx;
      const tz = cz + t.dz;
      trees.push({ x: tx, z: tz, scale: t.scale, pine: t.pine });
      colliders.push({
        minX: tx - 0.65,
        maxX: tx + 0.65,
        minZ: tz - 0.65,
        maxZ: tz + 0.65,
        height: 3.5
      });
    }

    parks.push({
      cx,
      cz,
      minX: cx - 11.4,
      maxX: cx + 11.4,
      minZ: cz - 11.4,
      maxZ: cz + 11.4,
      fountainX,
      fountainZ,
      trees
    });

    if (rng() < 0.65) {
      addRamp(0, cx - flipX * 4.4, cz + 1.8, 0, -1, 3.8, 7.2, 1.95);
      pickupAnchors.push({ x: cx - flipX * 4.4, z: cz - 5.8, preferKind: 'nitro' });
    } else {
      pickupAnchors.push({ x: cx - flipX * 4.0, z: cz, preferKind: 'nitro' });
    }
    propAnchors.push(
      { x: cx - flipX * 10.4, z: cz - 5.5, kind: 'cone' },
      { x: cx, z: cz + 10.5, kind: 'cone' }
    );
  } else if (district === 'construction') {
    const mirror = rng() < 0.5 ? 1 : -1;
    const containers: BuildingBox[] = [
      {
        minX: cx - 9.8,
        maxX: cx - 2.6,
        minZ: cz - 9.4,
        maxZ: cz - 6.0,
        height: 3.2,
        district: 'construction',
        color: rng() < 0.5 ? 0xd97706 : 0xb45309,
        accentColor: 0xfef08a,
        hasNeonSign: false,
        neonColor: 0xf59e0b,
        rooftopTrim: false
      },
      {
        minX: cx + 3.2,
        maxX: cx + 9.8,
        minZ: cz - 9.4,
        maxZ: cz - 6.0,
        height: 3.2,
        district: 'construction',
        color: 0x0284c7,
        accentColor: 0xe2e8f0,
        hasNeonSign: false,
        neonColor: 0x38bdf8,
        rooftopTrim: false
      },
      {
        minX: mirror > 0 ? cx - 9.6 : cx + 6.8,
        maxX: mirror > 0 ? cx - 6.8 : cx + 9.6,
        minZ: cz + 3.2,
        maxZ: cz + 9.6,
        height: 3.4,
        district: 'construction',
        color: 0xb45309,
        accentColor: 0xfbbf24,
        hasNeonSign: false,
        neonColor: 0xfbbf24,
        rooftopTrim: false
      },
      {
        minX: mirror > 0 ? cx + 5.8 : cx - 8.6,
        maxX: mirror > 0 ? cx + 8.6 : cx - 5.8,
        minZ: cz + 5.6,
        maxZ: cz + 8.4,
        height: 11.4,
        district: 'construction',
        color: 0xeab308,
        accentColor: 0x1e293b,
        hasNeonSign: false,
        neonColor: 0xfbbf24,
        rooftopTrim: false
      }
    ];
    for (const c of containers) {
      buildings.push(c);
      colliders.push(c);
    }

    addRamp(0, cx - mirror * 2.4, cz + 2.8, 0, -1, 4.0, 7.2, 2.2);
    addRamp(1, cx + mirror * 3.6, cz - 2.5, mirror, 0, 3.6, 6.8, 1.9);

    propAnchors.push(
      { x: cx - 10.6, z: cz, kind: 'cone' },
      { x: cx + 10.6, z: cz + 1.5, kind: 'cone' },
      { x: cx - 4.5, z: cz + 9.2, kind: 'crate' },
      { x: cx + 1.0, z: cz - 9.5, kind: 'crate' }
    );
    pickupAnchors.push({ x: cx - mirror * 2.4, z: cz - 4.4, preferKind: 'nitro' });
  } else {
    // Downtown Neon & Residential blocks
    const isDowntown = district === 'downtown';
    const palette = isDowntown ? DOWNTOWN_COLORS : RESIDENTIAL_COLORS;
    const baseColor = palette[Math.floor(rng() * palette.length)];
    const altColor = palette[Math.floor(rng() * palette.length)];
    const neonA = NEON_ACCENTS[Math.floor(rng() * NEON_ACCENTS.length)];
    const neonB = NEON_ACCENTS[Math.floor(rng() * NEON_ACCENTS.length)];

    // ~54% of city blocks split cleanly with a 4.4m bike-only shortcut alley
    const hasAlley = rng() < 0.54;
    const alleyAxis: 'ns' | 'ew' = rng() < 0.5 ? 'ns' : 'ew';

    if (hasAlley) {
      if (alleyAxis === 'ns') {
        const splitZ = (rng() - 0.5) * 0.9; // keeps north towers strictly north of cz + 0.5
        const h1 = isDowntown ? 8.2 + rng() * 3.8 : 5.6 + rng() * 3.2;
        const h2 = isDowntown ? 7.4 + rng() * 2.0 : 5.2 + rng() * 2.6;
        const h3 = isDowntown ? 8.4 + rng() * 3.8 : 5.8 + rng() * 3.2;
        const h4 = isDowntown ? 7.2 + rng() * 2.1 : 5.4 + rng() * 2.4;

        const bWN: BuildingBox = {
          minX: cx - 10.0,
          maxX: cx - 2.2,
          minZ: cz - 10.0,
          maxZ: cz + splitZ,
          height: Math.min(isDowntown ? 12.2 : 9.4, h1),
          district,
          color: baseColor,
          accentColor: 0xe2e8f0,
          hasNeonSign: isDowntown && rng() < 0.85,
          neonColor: neonA,
          rooftopTrim: true
        };
        const bWS: BuildingBox = {
          minX: cx - 9.94,
          maxX: cx - 2.26,
          minZ: cz + splitZ,
          maxZ: cz + 9.8,
          height: Math.min(9.6, h2),
          district,
          color: altColor,
          accentColor: 0xcbd5e1,
          hasNeonSign: isDowntown && rng() < 0.55,
          neonColor: neonB,
          rooftopTrim: isDowntown
        };
        const bEN: BuildingBox = {
          minX: cx + 2.2,
          maxX: cx + 10.0,
          minZ: cz - 10.0,
          maxZ: cz - splitZ,
          height: Math.min(isDowntown ? 12.2 : 9.4, h3),
          district,
          color: altColor,
          accentColor: 0xe2e8f0,
          hasNeonSign: isDowntown && rng() < 0.85,
          neonColor: neonB,
          rooftopTrim: true
        };
        const bES: BuildingBox = {
          minX: cx + 2.26,
          maxX: cx + 9.94,
          minZ: cz - splitZ,
          maxZ: cz + 9.8,
          height: Math.min(9.6, h4),
          district,
          color: baseColor,
          accentColor: 0xcbd5e1,
          hasNeonSign: false,
          neonColor: neonA,
          rooftopTrim: false
        };

        for (const b of [bWN, bWS, bEN, bES]) {
          buildings.push(b);
          colliders.push(b);
        }
        alleys.push({
          x1: cx,
          z1: cz - 11.5,
          x2: cx,
          z2: cz + 11.5,
          cx,
          cz,
          axis: 'ns',
          width: 4.4
        });
        pickupAnchors.push({ x: cx, z: cz, preferKind: 'nitro' });
      } else {
        const splitX = (rng() - 0.5) * 1.4;
        const h1 = isDowntown ? 8.6 + rng() * 3.6 : 5.8 + rng() * 3.0;
        const h2 = isDowntown ? 8.4 + rng() * 3.6 : 5.6 + rng() * 3.0;
        const h3 = isDowntown ? 7.2 + rng() * 2.2 : 5.2 + rng() * 2.4;
        const h4 = isDowntown ? 7.4 + rng() * 2.1 : 5.4 + rng() * 2.5;

        const bNW: BuildingBox = {
          minX: cx - 10.0,
          maxX: cx + splitX,
          minZ: cz - 10.0,
          maxZ: cz - 2.2,
          height: Math.min(isDowntown ? 12.2 : 9.4, h1),
          district,
          color: baseColor,
          accentColor: 0xe2e8f0,
          hasNeonSign: isDowntown && rng() < 0.85,
          neonColor: neonA,
          rooftopTrim: true
        };
        const bNE: BuildingBox = {
          minX: cx + splitX,
          maxX: cx + 10.0,
          minZ: cz - 9.94,
          maxZ: cz - 2.26,
          height: Math.min(isDowntown ? 12.0 : 9.2, h2),
          district,
          color: altColor,
          accentColor: 0xf1f5f9,
          hasNeonSign: isDowntown && rng() < 0.85,
          neonColor: neonB,
          rooftopTrim: true
        };
        const bSW: BuildingBox = {
          minX: cx - 10.0,
          maxX: cx - splitX,
          minZ: cz + 2.2,
          maxZ: cz + 9.8,
          height: Math.min(9.6, h3),
          district,
          color: altColor,
          accentColor: 0xcbd5e1,
          hasNeonSign: false,
          neonColor: neonA,
          rooftopTrim: false
        };
        const bSE: BuildingBox = {
          minX: cx - splitX,
          maxX: cx + 10.0,
          minZ: cz + 2.26,
          maxZ: cz + 9.74,
          height: Math.min(9.6, h4),
          district,
          color: baseColor,
          accentColor: 0xe2e8f0,
          hasNeonSign: isDowntown && rng() < 0.55,
          neonColor: neonB,
          rooftopTrim: isDowntown
        };

        for (const b of [bNW, bNE, bSW, bSE]) {
          buildings.push(b);
          colliders.push(b);
        }
        alleys.push({
          x1: cx - 11.5,
          z1: cz,
          x2: cx + 11.5,
          z2: cz,
          cx,
          cz,
          axis: 'ew',
          width: 4.4
        });
        pickupAnchors.push({ x: cx, z: cz, preferKind: 'nitro' });
      }
    } else {
      // Solid two-tier block with generous sidewalks (flush mid-block seam)
      const bN: BuildingBox = {
        minX: cx - 9.8,
        maxX: cx + 9.8,
        minZ: cz - 9.8,
        maxZ: cz,
        height: Math.min(isDowntown ? 12.2 : 9.4, (isDowntown ? 9.0 : 6.2) + rng() * 3.2),
        district,
        color: baseColor,
        accentColor: 0xe2e8f0,
        hasNeonSign: isDowntown,
        neonColor: neonA,
        rooftopTrim: true
      };
      const bS: BuildingBox = {
        minX: cx - 9.4,
        maxX: cx + 9.4,
        minZ: cz,
        maxZ: cz + 9.6,
        height: Math.min(9.6, (isDowntown ? 7.2 : 5.4) + rng() * 2.2),
        district,
        color: altColor,
        accentColor: 0xf1f5f9,
        hasNeonSign: isDowntown && rng() < 0.7,
        neonColor: neonB,
        rooftopTrim: isDowntown
      };
      buildings.push(bN, bS);
      colliders.push(bN, bS);
    }

    const propA: PropAnchor['kind'] = isDowntown ? 'sign' : 'umbrella';
    const propB: PropAnchor['kind'] = rng() < 0.5 ? 'cone' : 'crate';
    propAnchors.push(
      { x: cx - 10.9, z: cz - 7.5, kind: propA },
      { x: cx + 10.9, z: cz + 7.5, kind: propB },
      { x: cx + (rng() < 0.5 ? -7.5 : 7.5), z: cz + 10.9, kind: propA }
    );
  }

  return {
    key,
    bx,
    bz,
    cx,
    cz,
    district,
    buildings,
    colliders,
    ramps,
    parks,
    alleys,
    propAnchors,
    pickupAnchors
  };
}

export class StreamingCity {
  public seed = 1;
  public centerBx = 0;
  public centerBz = 0;
  private chunks = new Map<string, CityChunkData>();

  private colliderScratch: AABB[] = [];
  private rampScratch: RampZone[] = [];
  private parkScratch: ParkZone[] = [];
  private pickupScratch: PickupAnchor[] = [];

  constructor(initialSeed = 104729, startX = 0, startZ = 0) {
    this.reset(initialSeed, startX, startZ);
  }

  public get activeChunkCount(): number {
    return this.chunks.size;
  }

  public getActiveChunks(): IterableIterator<CityChunkData> {
    return this.chunks.values();
  }

  public getChunkAt(x: number, z: number): CityChunkData | undefined {
    return this.chunks.get(chunkKey(worldToBlock(x), worldToBlock(z)));
  }

  public reset(seed: number, centerX = 0, centerZ = 0): ChunkDelta {
    this.seed = seed;
    this.chunks.clear();
    this.centerBx = worldToBlock(centerX);
    this.centerBz = worldToBlock(centerZ);

    const loaded: CityChunkData[] = [];
    for (let dz = -ACTIVE_RADIUS; dz <= ACTIVE_RADIUS; dz++) {
      for (let dx = -ACTIVE_RADIUS; dx <= ACTIVE_RADIUS; dx++) {
        const bx = this.centerBx + dx;
        const bz = this.centerBz + dz;
        const chunk = generateCityBlock(this.seed, bx, bz);
        this.chunks.set(chunk.key, chunk);
        loaded.push(chunk);
      }
    }

    return {
      changed: true,
      centerBx: this.centerBx,
      centerBz: this.centerBz,
      loaded,
      unloadedKeys: []
    };
  }

  public updateCenter(worldX: number, worldZ: number): ChunkDelta {
    const nbx = worldToBlock(worldX);
    const nbz = worldToBlock(worldZ);
    if (nbx === this.centerBx && nbz === this.centerBz) {
      return {
        changed: false,
        centerBx: this.centerBx,
        centerBz: this.centerBz,
        loaded: [],
        unloadedKeys: []
      };
    }

    this.centerBx = nbx;
    this.centerBz = nbz;

    const unloadedKeys: string[] = [];
    for (const [key, chunk] of this.chunks.entries()) {
      if (
        Math.abs(chunk.bx - nbx) > ACTIVE_RADIUS ||
        Math.abs(chunk.bz - nbz) > ACTIVE_RADIUS
      ) {
        unloadedKeys.push(key);
      }
    }
    for (const key of unloadedKeys) {
      this.chunks.delete(key);
    }

    const loaded: CityChunkData[] = [];
    for (let dz = -ACTIVE_RADIUS; dz <= ACTIVE_RADIUS; dz++) {
      for (let dx = -ACTIVE_RADIUS; dx <= ACTIVE_RADIUS; dx++) {
        const bx = nbx + dx;
        const bz = nbz + dz;
        const key = chunkKey(bx, bz);
        if (!this.chunks.has(key)) {
          const chunk = generateCityBlock(this.seed, bx, bz);
          this.chunks.set(key, chunk);
          loaded.push(chunk);
        }
      }
    }

    return {
      changed: true,
      centerBx: nbx,
      centerBz: nbz,
      loaded,
      unloadedKeys
    };
  }

  /**
   * Returns colliders from chunks within `blockSpan` of `(x, z)` using an internal reusable buffer.
   * Callers should consume the returned array synchronously before calling this again.
   */
  public queryCollidersNear(x: number, z: number, blockSpan = 1): readonly AABB[] {
    this.colliderScratch.length = 0;
    const cbx = worldToBlock(x);
    const cbz = worldToBlock(z);
    for (let dz = -blockSpan; dz <= blockSpan; dz++) {
      for (let dx = -blockSpan; dx <= blockSpan; dx++) {
        const chunk = this.chunks.get(chunkKey(cbx + dx, cbz + dz));
        if (!chunk) continue;
        for (let i = 0; i < chunk.colliders.length; i++) {
          this.colliderScratch.push(chunk.colliders[i]);
        }
      }
    }
    return this.colliderScratch;
  }

  public queryRampsNear(x: number, z: number): readonly RampZone[] {
    this.rampScratch.length = 0;
    const cbx = worldToBlock(x);
    const cbz = worldToBlock(z);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const chunk = this.chunks.get(chunkKey(cbx + dx, cbz + dz));
        if (!chunk) continue;
        for (let i = 0; i < chunk.ramps.length; i++) {
          this.rampScratch.push(chunk.ramps[i]);
        }
      }
    }
    return this.rampScratch;
  }

  public queryParksNear(x: number, z: number): readonly ParkZone[] {
    this.parkScratch.length = 0;
    const cbx = worldToBlock(x);
    const cbz = worldToBlock(z);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const chunk = this.chunks.get(chunkKey(cbx + dx, cbz + dz));
        if (!chunk) continue;
        for (let i = 0; i < chunk.parks.length; i++) {
          this.parkScratch.push(chunk.parks[i]);
        }
      }
    }
    return this.parkScratch;
  }

  public getActivePickupAnchors(): readonly PickupAnchor[] {
    this.pickupScratch.length = 0;
    for (const chunk of this.chunks.values()) {
      for (let i = 0; i < chunk.pickupAnchors.length; i++) {
        this.pickupScratch.push(chunk.pickupAnchors[i]);
      }
    }
    return this.pickupScratch;
  }
}
