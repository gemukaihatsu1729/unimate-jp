import { describe, expect, it } from 'vitest';
import { POLICE_SPECS, WANTED_LEVELS, getWantedLevel } from '../data';
import { PlayerBike } from '../entities/PlayerBike';
import {
  ACTIVE_RADIUS,
  CELL_PITCH,
  HALF_PITCH,
  ROAD_WIDTH,
  StreamingCity,
  generateCityBlock,
  nearestIntersection
} from '../world/CityLayout';
import {
  hasLineOfSight,
  resolveCircleWorldCollision,
  sampleRampState
} from '../world/Collision';
import { chooseNextIntersectionStep, computeBustedDelta } from '../entities/PoliceAI';
import type { EffectsManager } from '../fx/EffectsManager';
import type { AudioManager } from '../audio/AudioManager';
import {
  buildLineShareUrl,
  buildShareText,
  buildXShareUrl,
  evaluateEscapeResult,
  formatEscapeTime,
  type ResultShareInput
} from '../game/ResultShare';

describe('Infinite Procedural CityGenerator & StreamingCity', () => {
  it('generates identical blocks deterministically for the same seed and differs across seeds', () => {
    const a1 = generateCityBlock(123456, 3, -2);
    const a2 = generateCityBlock(123456, 3, -2);
    expect(a1).toEqual(a2);

    let diffCount = 0;
    for (let bz = -2; bz <= 2; bz++) {
      for (let bx = -2; bx <= 2; bx++) {
        const b1 = generateCityBlock(123456, bx, bz);
        const b2 = generateCityBlock(654321, bx, bz);
        if (b1.district !== b2.district || b1.buildings.length !== b2.buildings.length) {
          diffCount++;
        }
      }
    }
    expect(diffCount).toBeGreaterThan(5);
  });

  it('keeps colliders off avenues, obeys height cap, keeps alleys passable, and emits nitro-only pickups', () => {
    const seeds = [111111, 482910, 987654];
    const roadHalfClear = ROAD_WIDTH * 0.5 - 0.1;
    let alleyCount = 0;

    for (const seed of seeds) {
      for (let bz = -4; bz <= 4; bz++) {
        for (let bx = -4; bx <= 4; bx++) {
          const chunk = generateCityBlock(seed, bx, bz);
          const minBoundX = chunk.cx - (CELL_PITCH * 0.5 - roadHalfClear);
          const maxBoundX = chunk.cx + (CELL_PITCH * 0.5 - roadHalfClear);
          const minBoundZ = chunk.cz - (CELL_PITCH * 0.5 - roadHalfClear);
          const maxBoundZ = chunk.cz + (CELL_PITCH * 0.5 - roadHalfClear);

          for (const c of chunk.colliders) {
            expect(c.minX).toBeGreaterThanOrEqual(minBoundX);
            expect(c.maxX).toBeLessThanOrEqual(maxBoundX);
            expect(c.minZ).toBeGreaterThanOrEqual(minBoundZ);
            expect(c.maxZ).toBeLessThanOrEqual(maxBoundZ);
          }

          for (const b of chunk.buildings) {
            if (b.maxZ > chunk.cz + 0.5 && b.district !== 'construction') {
              expect(b.height).toBeLessThanOrEqual(9.7);
            }
          }

          for (const pk of chunk.pickupAnchors) {
            expect(pk.preferKind).toBe('nitro');
          }

          for (const alley of chunk.alleys) {
            alleyCount++;
            expect(alley.width).toBeGreaterThanOrEqual(3.8);
            expect(hasLineOfSight(alley.x1, alley.z1, alley.x2, alley.z2, chunk.colliders, 0.7)).toBe(
              true
            );
          }
        }
      }
    }
    expect(alleyCount).toBeGreaterThan(20);
  });

  it('streams a 7x7 chunk window cleanly around arbitrary far coordinates', () => {
    const city = new StreamingCity(482910, 0, 0);
    const expectedCount = (ACTIVE_RADIUS * 2 + 1) ** 2;
    expect(city.activeChunkCount).toBe(expectedCount);

    const delta = city.updateCenter(420, -315);
    expect(delta.changed).toBe(true);
    expect(city.activeChunkCount).toBe(expectedCount);
    expect(city.centerBx).toBe(12);
    expect(city.centerBz).toBe(-9);
    expect(delta.loaded.length).toBe(expectedCount);
    expect(delta.unloadedKeys.length).toBe(expectedCount);

    const sameDelta = city.updateCenter(423, -312);
    expect(sameDelta.changed).toBe(false);
    expect(sameDelta.loaded).toHaveLength(0);
    expect(sameDelta.unloadedKeys).toHaveLength(0);
  });
});

describe('Bike Nitro, Collision & Wanted Progression', () => {
  it('starts with 0 nitro and still takes hit damage during Overdrive Nitro', () => {
    const bike = new PlayerBike('viper');
    expect(bike.nitro).toBe(0);
    expect(bike.triggerOverdrive()).toBe(false);

    bike.addNitro(75);
    expect(bike.triggerOverdrive()).toBe(true);
    expect(bike.isOverdrive).toBe(true);

    const hpBefore = bike.hp;
    expect(bike.takeHit(5, 0)).toBe(true);
    expect(bike.hp).toBe(hpBefore - 1);
  });

  it('escalates wanted levels purely by elapsed escape time', () => {
    expect(getWantedLevel(0).stars).toBe(1);
    expect(getWantedLevel(0).roadblockCount).toBe(0);

    const lv2 = getWantedLevel(15);
    expect(lv2.stars).toBe(2);
    expect(lv2.roadblockCount).toBeGreaterThanOrEqual(2);

    const lv4 = getWantedLevel(60);
    expect(lv4.stars).toBe(4);
    expect(lv4.hasHelicopter).toBe(true);
  });

  it('includes agile narrow-radius police motorcycles (moto) from star 1 through star 5', () => {
    const moto = POLICE_SPECS.moto;
    expect(moto.name).toBe('白バイ');
    expect(moto.radius).toBeLessThan(0.8);
    expect(moto.turnRate).toBeGreaterThan(3.8);
    for (const level of WANTED_LEVELS) {
      expect(level.allowedKinds).toContain('moto');
    }
  });

  it('pushes circle out of AABB and preserves tangential wall-slide velocity', () => {
    const box = { minX: 10, maxX: 20, minZ: 10, maxZ: 20, height: 8 };
    const res = resolveCircleWorldCollision(9.7, 15, 10, 18, 0.62, [box], null);
    expect(res.hit).toBe(true);
    expect(res.x).toBeCloseTo(10 - 0.62, 4);
    expect(res.vx).toBeCloseTo(0, 4);
    expect(res.vz).toBeCloseTo(18, 4);
    expect(res.impactSpeed).toBeCloseTo(10, 4);
  });

  it('allows unbounded movement past old 93m boundary when worldHalf is null', () => {
    const res = resolveCircleWorldCollision(500, -450, 22, -14, 0.62, [], null);
    expect(res.hit).toBe(false);
    expect(res.x).toBe(500);
    expect(res.z).toBe(-450);
  });

  it('computes line-of-sight down avenues vs through buildings and samples ramps', () => {
    const city = new StreamingCity(482910, 0, 0);
    const colliders = city.queryCollidersNear(0, 0, 2);
    expect(hasLineOfSight(-HALF_PITCH, -52.5, -HALF_PITCH, 52.5, colliders, 0.5)).toBe(true);
    expect(hasLineOfSight(-8, -8, 8, 8, colliders, 0.2)).toBe(false);

    const plaza = generateCityBlock(123456, 0, 0);
    const ramp = plaza.ramps[0];
    const baseSample = sampleRampState(
      ramp.cx - ramp.dirX * (ramp.length * 0.4),
      ramp.cz - ramp.dirZ * (ramp.length * 0.4),
      ramp.dirX,
      ramp.dirZ,
      plaza.ramps
    );
    const crestSample = sampleRampState(
      ramp.cx + ramp.dirX * (ramp.length * 0.42),
      ramp.cz + ramp.dirZ * (ramp.length * 0.42),
      ramp.dirX,
      ramp.dirZ,
      plaza.ramps
    );
    expect(baseSample.onRamp).toBe(true);
    expect(crestSample.rampHeight).toBeGreaterThan(baseSample.rampHeight);
    expect(crestSample.atCrest).toBe(true);
  });
});

describe('Infinite O(1) Police Road Navigation', () => {
  it('routes cleanly between arbitrary far intersections', () => {
    const from = nearestIntersection(500, -400);
    const target = nearestIntersection(620, -290);
    const startDist = Math.abs(from.x - target.x) + Math.abs(from.z - target.z);

    const step = chooseNextIntersectionStep(from.ix, from.iz, target.ix, target.iz);
    const nextDist = Math.abs(step.x - target.x) + Math.abs(step.z - target.z);

    expect(nextDist).toBeLessThan(startDist);
  });

  it('seals non-alley building seams so no 0.3m-2.8m wedge cracks exist on downtown/residential blocks', () => {
    const seeds = [111111, 482910, 987654];
    for (const seed of seeds) {
      for (let bz = -3; bz <= 3; bz++) {
        for (let bx = -3; bx <= 3; bx++) {
          const chunk = generateCityBlock(seed, bx, bz);
          if (chunk.district !== 'downtown' && chunk.district !== 'residential') continue;
          const b = chunk.buildings;
          for (let i = 0; i < b.length; i++) {
            for (let j = i + 1; j < b.length; j++) {
              const overlapX = Math.min(b[i].maxX, b[j].maxX) - Math.max(b[i].minX, b[j].minX);
              const overlapZ = Math.min(b[i].maxZ, b[j].maxZ) - Math.max(b[i].minZ, b[j].minZ);
              if (overlapX > 1) {
                const gapZ = Math.max(b[i].minZ - b[j].maxZ, b[j].minZ - b[i].maxZ);
                if (gapZ > 0) expect(gapZ).toBeGreaterThanOrEqual(3.8);
              }
              if (overlapZ > 1) {
                const gapX = Math.max(b[i].minX - b[j].maxX, b[j].minX - b[i].maxX);
                if (gapX > 0) expect(gapX).toBeGreaterThanOrEqual(3.8);
              }
            }
          }
        }
      }
    }
  });

  it('drops true groundSpeed toward 0 when wedged into a wall and arrests stalled campers via computeBustedDelta', () => {
    const city = new StreamingCity(482910, 0, 0);
    const bike = new PlayerBike('viper');
    bike.reset('viper', 0, 3.0, Math.PI); // Facing north directly into central plaza tower at (0,0)

    const noopFx = {
      emitSparks: () => {},
      emitBurst: () => {},
      emitSmoke: () => {},
      spawnSkid: () => {}
    } as unknown as EffectsManager;
    const noopAudio = {
      playDamage: () => {},
      playScrape: () => {},
      playNitroBurst: () => {},
      playJumpWhoosh: () => {},
      playJumpLand: () => {}
    } as unknown as AudioManager;
    const cbs = { onLandJump: () => {}, onMiniTurbo: () => {}, onWallSlamDamage: () => {} };

    for (let i = 0; i < 30; i++) {
      bike.update(0.02, 0, -1, 1, city, noopFx, noopAudio, cbs);
    }
    expect(bike.groundSpeed).toBeLessThan(1.5);

    // Wedged with police nearby (< 22m) or stalled > 1.4s (< 42m) fills busted gauge quickly
    let progress = 0;
    for (let i = 0; i < 60; i++) {
      progress = Math.max(0, Math.min(1, progress + computeBustedDelta(0.05, bike.groundSpeed, 14, 2.0, false)));
    }
    expect(progress).toBe(1);

    // High-speed moving player drains busted progress cleanly
    expect(computeBustedDelta(0.1, 22, 10, 0, false)).toBeLessThan(0);
  });
});

describe('ResultShare (Escape Time Only)', () => {
  const baseInput: ResultShareInput = {
    elapsedSec: 92.4,
    wreckedCount: 6,
    nearMissCount: 8,
    maxStars: 4,
    reason: 'hp',
    isNewRecord: true,
    bikeId: 'volt'
  };

  it('evaluates escape ranks strictly by elapsedSec', () => {
    expect(evaluateEscapeResult({ ...baseInput, elapsedSec: 125 }).rank).toBe('SS');
    expect(evaluateEscapeResult(baseInput).rank).toBe('S');
    expect(evaluateEscapeResult({ ...baseInput, elapsedSec: 46 }).rank).toBe('A');
    expect(evaluateEscapeResult({ ...baseInput, elapsedSec: 25 }).rank).toBe('B');
    expect(evaluateEscapeResult({ ...baseInput, elapsedSec: 12 }).rank).toBe('C');
  });

  it('formats escape time and builds share text without score', () => {
    expect(formatEscapeTime(92.4)).toBe('1:32.4');
    const text = buildShareText(baseInput);
    expect(text).toContain('METRO ESCAPE');
    expect(text).toContain('1:32.4');
    expect(text).toContain('サイバーボルト');
    expect(text).not.toContain('スコア');

    const xUrl = buildXShareUrl(text, 'https://unimate-jp.com/games/bikechase/');
    const lineUrl = buildLineShareUrl(text, 'https://unimate-jp.com/games/bikechase/');
    expect(xUrl.startsWith('https://twitter.com/intent/tweet?')).toBe(true);
    expect(lineUrl.startsWith('https://line.me/R/share?text=')).toBe(true);
  });
});
