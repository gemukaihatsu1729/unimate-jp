import { describe, expect, it } from 'vitest';
import {
  CARGO_TYPES,
  CEILING_Y,
  GROUND_Y,
  PIXELS_PER_METER
} from '../data';
import {
  checkObstacleHit,
  createInitialFlightState,
  distPointToSegment,
  getTurbineBladeSegments,
  stepFlightPhysics
} from '../physics/PendulumPhysics';
import { LevelGenerator, MIN_CORRIDOR_GAP } from '../world/LevelGenerator';
import {
  buildShareText,
  computeRank,
  formatDistance,
  formatScore
} from '../game/ResultShare';

const poyo = CARGO_TYPES[0];

describe('PendulumPhysics', () => {
  it('stays near stationary equilibrium with zero thrust and zero wind', () => {
    let state = createInitialFlightState(poyo, 160, 220);
    for (let i = 0; i < 60; i++) {
      const res = stepFlightPhysics(state, { thrustX: 0, thrustY: 0, winch: false }, poyo, 0, 0, 1 / 60);
      state = res.state;
    }
    expect(Math.abs(state.theta)).toBeLessThan(0.01);
    expect(Math.abs(state.omega)).toBeLessThan(0.01);
    expect(Number.isFinite(state.cx)).toBe(true);
    expect(Number.isFinite(state.cy)).toBe(true);
  });

  it('swings the cage backward (negative theta) when accelerating forward, and forward when braking', () => {
    let state = createInitialFlightState(poyo, 160, 220);
    for (let i = 0; i < 20; i++) {
      state = stepFlightPhysics(state, { thrustX: 1, thrustY: 0, winch: false }, poyo, 0, 0, 1 / 60).state;
    }
    expect(state.theta).toBeLessThan(-0.08);

    // Hard brake / reverse thrust should push theta positive over time
    for (let i = 0; i < 45; i++) {
      state = stepFlightPhysics(state, { thrustX: -1, thrustY: 0, winch: false }, poyo, 0, 0, 1 / 60).state;
    }
    expect(state.theta).toBeGreaterThan(0);
  });

  it('shortens rope and damps oscillation faster while winching', () => {
    const start = createInitialFlightState(poyo, 160, 220);
    start.theta = 0.65;

    let freeState = { ...start };
    let winchState = { ...start };

    for (let i = 0; i < 45; i++) {
      freeState = stepFlightPhysics(freeState, { thrustX: 0, thrustY: 0, winch: false }, poyo, 0, 0, 1 / 60).state;
      winchState = stepFlightPhysics(winchState, { thrustX: 0, thrustY: 0, winch: true }, poyo, 0, 0, 1 / 60).state;
    }

    expect(winchState.ropeLen).toBeLessThan(freeState.ropeLen);
    expect(winchState.ropeLen).toBeCloseTo(poyo.ropeWinched, 0);
    expect(winchState.winchStamina).toBeLessThan(100);
    // Winch higher damping reduces swing energy faster
    const freeEnergy = Math.abs(freeState.theta) + Math.abs(freeState.omega) * 0.2;
    const winchEnergy = Math.abs(winchState.theta) + Math.abs(winchState.omega) * 0.2;
    expect(winchEnergy).toBeLessThan(freeEnergy);
  });

  it('remains finite under extreme inputs, gusts, and large dt clamps', () => {
    let state = createInitialFlightState(poyo, 160, CEILING_Y + 5);
    for (let i = 0; i < 40; i++) {
      const res = stepFlightPhysics(
        state,
        { thrustX: i % 2 === 0 ? 1 : -1, thrustY: -1, winch: false },
        poyo,
        500,
        -300,
        0.25
      );
      state = res.state;
      expect(Number.isFinite(state.hx)).toBe(true);
      expect(Number.isFinite(state.hy)).toBe(true);
      expect(Number.isFinite(state.theta)).toBe(true);
      expect(Number.isFinite(state.omega)).toBe(true);
      expect(Math.abs(state.theta)).toBeLessThanOrEqual(1.48);
    }
  });
});

describe('Collision & Geometry', () => {
  it('detects pylon collision separately for heli and cage and computes near-miss distance', () => {
    const pylon = { id: 1, kind: 'pylon' as const, x: 500, width: 44, height: 220, nearMissed: false };
    const topY = GROUND_Y - 220;

    // Heli hits top of pylon while cage hangs clear to the left
    const heliCrash = checkObstacleHit(500, topY + 5, 420, topY + 80, pylon, 0);
    expect(heliCrash.heliHit).toBe(true);
    expect(heliCrash.cageHit).toBe(false);

    // Heli flies safely over pylon while cage grazes within near-miss range
    const nearMiss = checkObstacleHit(500, topY - 120, 445, topY + 20, pylon, 0);
    expect(nearMiss.heliHit).toBe(false);
    expect(nearMiss.cageHit).toBe(false);
    expect(nearMiss.cageNearMissDist).toBeLessThan(26);
  });

  it('detects rotating wind turbine blade hits via point-to-segment distance', () => {
    const segs = getTurbineBladeSegments(600, 340, 90, 0, 0, 0);
    expect(segs).toHaveLength(3);
    // First blade points along +x from (608, 340) to (690, 340)
    expect(distPointToSegment(650, 340, segs[0].x1, segs[0].y1, segs[0].x2, segs[0].y2)).toBeCloseTo(0, 4);

    const turbine = {
      id: 2,
      kind: 'turbine' as const,
      x: 600,
      hubY: 340,
      bladeLen: 90,
      angularSpeed: 0,
      phase: 0,
      nearMissed: false
    };
    const hit = checkObstacleHit(500, 200, 650, 345, turbine, 0);
    expect(hit.heliHit).toBe(false);
    expect(hit.cageHit).toBe(true);
  });
});

describe('LevelGenerator', () => {
  it('is deterministic for a given seed and preserves navigable corridors and relay buffers', () => {
    const genA = new LevelGenerator(12345);
    const genB = new LevelGenerator(12345);
    genA.generateAhead(160 + 2600 * PIXELS_PER_METER);
    genB.generateAhead(160 + 2600 * PIXELS_PER_METER);

    expect(genA.obstacles.length).toBe(genB.obstacles.length);
    expect(genA.relayPads.length).toBeGreaterThanOrEqual(4);
    expect(genA.obstacles.map((o) => o.kind)).toEqual(genB.obstacles.map((o) => o.kind));

    for (const obs of genA.obstacles) {
      // Clear buffer around every relay pad
      for (const pad of genA.relayPads) {
        expect(Math.abs(obs.x - pad.x)).toBeGreaterThanOrEqual(175);
      }

      if (obs.kind === 'pylon') {
        const clearGap = GROUND_Y - obs.height - CEILING_Y;
        expect(clearGap).toBeGreaterThanOrEqual(MIN_CORRIDOR_GAP);
      } else if (obs.kind === 'beam') {
        const clearGap = GROUND_Y - obs.bottomY;
        expect(clearGap).toBeGreaterThanOrEqual(MIN_CORRIDOR_GAP);
      }
    }
  });
});

describe('ResultShare', () => {
  it('computes ranks accurately across score and distance thresholds', () => {
    expect(computeRank(18000, 1200)).toBe('SS');
    expect(computeRank(9000, 2050)).toBe('SS');
    expect(computeRank(11500, 1100)).toBe('S');
    expect(computeRank(6400, 700)).toBe('A');
    expect(computeRank(2600, 300)).toBe('B');
    expect(computeRank(900, 120)).toBe('C');
  });

  it('formats distance, score, and share text cleanly', () => {
    expect(formatDistance(1234.8)).toBe('1,234 m');
    expect(formatScore(15420.2)).toBe('15,420');
    const text = buildShareText({
      score: 12450,
      distanceMeters: 980,
      relaysCleared: 2,
      swingCatches: 4,
      nearMisses: 6,
      cargo: poyo,
      reason: 'crash'
    });
    expect(text).toContain('DOCTOR CARGO');
    expect(text).toContain('ランク S');
    expect(text).toContain('https://unimate-jp.com/games/helicargo/');
  });
});
