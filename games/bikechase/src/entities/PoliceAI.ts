import * as THREE from 'three';
import { POLICE_SPECS, type PoliceKind, type WantedLevelSpec } from '../data';
import {
  CELL_PITCH,
  HALF_PITCH,
  intersectionCoords,
  nearestIntersection,
  type IntersectionCoord,
  type StreamingCity
} from '../world/CityLayout';
import {
  hasLineOfSight,
  normalizeAngle,
  resolveCircleWorldCollision
} from '../world/Collision';
import {
  applyWreckVisual,
  createHelicopterRig,
  createPoliceRig,
  createRoadblockBarrierVisual,
  type HelicopterRig,
  type PoliceRig
} from './PoliceMesh';
import type { PlayerBike } from './PlayerBike';
import type { EffectsManager } from '../fx/EffectsManager';
import type { AudioManager } from '../audio/AudioManager';

export interface PoliceUnit {
  id: number;
  kind: PoliceKind;
  rig: PoliceRig;
  x: number;
  z: number;
  vx: number;
  vz: number;
  heading: number;
  speed: number;
  lean: number;
  radius: number;
  wrecked: boolean;
  wreckTimer: number;
  stuckTimer: number;
  reverseTimer: number;
  reverseTurnSign: number;
  nextIx: number;
  nextIz: number;
  flankBiasX: number;
  flankBiasZ: number;
  nearMissCooldown: number;
  spawnGrace: number;
}

export interface RoadblockSummary {
  centerX: number;
  centerZ: number;
  axis: 'ns' | 'ew';
}

interface RoadblockUnit extends RoadblockSummary {
  group: THREE.Group;
  blockers: Array<{ x: number; z: number; radius: number }>;
  life: number;
}

export interface PoliceStepCallbacks {
  onPoliceWrecked: (x: number, z: number, kind: PoliceKind) => void;
  onNearMiss: (x: number, z: number) => void;
  onRoadblockSpawned?: (x: number, z: number) => void;
  onPlayerHit: (x: number, z: number) => void;
}

export interface PoliceStepSummary {
  nearestDist: number;
  isPinned: boolean;
  activeCount: number;
  inChopperLight: boolean;
}

const NEIGHBOR_DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
];

export function chooseNextIntersectionStep(
  fromIx: number,
  fromIz: number,
  targetIx: number,
  targetIz: number,
  flankBiasX = 0,
  flankBiasZ = 0
): IntersectionCoord {
  if (fromIx === targetIx && fromIz === targetIz) {
    return intersectionCoords(targetIx, targetIz);
  }
  const targetPos = intersectionCoords(targetIx, targetIz);
  const tx = targetPos.x + flankBiasX;
  const tz = targetPos.z + flankBiasZ;

  let bestIx = fromIx;
  let bestIz = fromIz;
  let bestScore = Infinity;

  for (let i = 0; i < NEIGHBOR_DIRS.length; i++) {
    const nix = fromIx + NEIGHBOR_DIRS[i][0];
    const niz = fromIz + NEIGHBOR_DIRS[i][1];
    const pos = intersectionCoords(nix, niz);
    const score = Math.abs(pos.x - tx) + Math.abs(pos.z - tz);
    if (score < bestScore) {
      bestScore = score;
      bestIx = nix;
      bestIz = niz;
    }
  }
  return intersectionCoords(bestIx, bestIz);
}

export function computeBustedDelta(
  dt: number,
  groundSpeed: number,
  nearestPoliceDist: number,
  stalledTime: number,
  inChopperLight: boolean
): number {
  if (nearestPoliceDist < 5.8 && groundSpeed < 6.5) {
    return dt / 1.65;
  }
  if ((nearestPoliceDist < 22 || inChopperLight) && groundSpeed < 4.8) {
    return dt / 2.3;
  }
  if (stalledTime > 1.4 && groundSpeed < 4.5 && nearestPoliceDist < 42) {
    return dt / 2.8;
  }
  return -dt * 1.1;
}

export class PoliceManager {
  public units: PoliceUnit[] = [];
  private roadblocks: RoadblockUnit[] = [];
  private heli: HelicopterRig;
  private heliX = 0;
  private heliZ = -35;
  private heliActive = false;

  private nextId = 1;
  private spawnTimer = 0.8;
  private roadblockTimer = 5.5;
  private strobeClock = 0;
  private straightTime = 0;
  private lastCheckHeading = Math.PI;

  constructor(private scene: THREE.Scene) {
    this.heli = createHelicopterRig();
    this.heli.root.visible = false;
    this.scene.add(this.heli.root);
  }

  public getRoadblocks(): readonly RoadblockSummary[] {
    return this.roadblocks;
  }

  public reset(): void {
    for (const u of this.units) {
      this.scene.remove(u.rig.root);
    }
    this.units = [];

    for (const rb of this.roadblocks) {
      this.scene.remove(rb.group);
    }
    this.roadblocks = [];

    this.heliActive = false;
    this.heli.root.visible = false;
    this.heliX = 0;
    this.heliZ = -45;
    this.spawnTimer = 0.8;
    this.roadblockTimer = 5.5;
    this.straightTime = 0;
    this.lastCheckHeading = Math.PI;
  }

  public spawnTitleAmbient(): void {
    this.reset();
    this.spawnSpecificUnit('patrol', -19.5, 36, Math.PI, 8);
    this.spawnSpecificUnit('moto', -15.4, 34, Math.PI + 0.08, 8);
  }

  private spawnSpecificUnit(
    kind: PoliceKind,
    x: number,
    z: number,
    heading: number,
    initialSpeed = 18
  ): PoliceUnit {
    const spec = POLICE_SPECS[kind];
    const rig = createPoliceRig(kind);
    rig.root.position.set(x, 0, z);
    rig.root.rotation.y = heading;
    this.scene.add(rig.root);

    const startInt = nearestIntersection(x, z);
    const id = this.nextId++;
    const flankAngle = (id % 4) * (Math.PI * 0.5);
    const unit: PoliceUnit = {
      id,
      kind,
      rig,
      x,
      z,
      vx: Math.sin(heading) * initialSpeed,
      vz: Math.cos(heading) * initialSpeed,
      heading,
      speed: initialSpeed,
      lean: 0,
      radius: spec.radius,
      wrecked: false,
      wreckTimer: 0,
      stuckTimer: 0,
      reverseTimer: 0,
      reverseTurnSign: id % 2 === 0 ? 1 : -1,
      nextIx: startInt.ix,
      nextIz: startInt.iz,
      flankBiasX: kind === 'interceptor' ? Math.cos(flankAngle) * 18 : 0,
      flankBiasZ: kind === 'interceptor' ? Math.sin(flankAngle) * 18 : 0,
      nearMissCooldown: 0,
      spawnGrace: 1.4
    };
    this.units.push(unit);
    return unit;
  }

  public updateTitleAmbient(dt: number): void {
    this.strobeClock += dt;
    this.updateLightbars();
  }

  private updateLightbars(): void {
    const phaseA = Math.floor(this.strobeClock * 8) % 2 === 0;
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      if (u.wrecked) continue;
      const flip = i % 2 === 0 ? phaseA : !phaseA;
      u.rig.redLightMat.color.setHex(flip ? 0xff2233 : 0x450a0a);
      if (u.kind === 'patrol' || u.kind === 'moto') {
        u.rig.blueLightMat.color.setHex(flip ? 0x450a0a : 0xff2233);
        u.rig.glowMat.color.setHex(0xef4444);
      } else {
        u.rig.blueLightMat.color.setHex(flip ? 0x0c4a6e : 0x38bdf8);
        u.rig.glowMat.color.setHex(flip ? 0xef4444 : 0x38bdf8);
      }
      u.rig.glowMat.opacity = flip ? 0.3 : 0.22;
    }
  }

  private trySpawnPursuer(bike: PlayerBike, wanted: WantedLevelSpec): void {
    const activeUnits = this.units.filter((u) => !u.wrecked);
    if (activeUnits.length >= wanted.maxUnits) return;

    const pInt = nearestIntersection(bike.x, bike.z);
    const fwdX = Math.sin(bike.heading);
    const fwdZ = Math.cos(bike.heading);
    const aheadCandidates: IntersectionCoord[] = [];
    const otherCandidates: IntersectionCoord[] = [];

    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (dx === 0 && dz === 0) continue;
        const cand = intersectionCoords(pInt.ix + dx, pInt.iz + dz);
        const rx = cand.x - bike.x;
        const rz = cand.z - bike.z;
        const dist = Math.hypot(rx, rz);
        if (dist < 28 || dist > 72) continue;
        const forwardDot = (rx * fwdX + rz * fwdZ) / dist;
        if (forwardDot > 0.22) {
          aheadCandidates.push(cand);
        } else {
          otherCandidates.push(cand);
        }
      }
    }

    const pool =
      aheadCandidates.length > 0 && (Math.random() < 0.72 || otherCandidates.length === 0)
        ? aheadCandidates
        : otherCandidates.length > 0
          ? otherCandidates
          : aheadCandidates;
    if (pool.length === 0) return;

    const chosen = pool[Math.floor(Math.random() * pool.length)];
    for (const u of activeUnits) {
      if (Math.hypot(u.x - chosen.x, u.z - chosen.z) < 4.5) return;
    }

    const kind = wanted.allowedKinds[Math.floor(Math.random() * wanted.allowedKinds.length)];
    const interceptX = bike.x + bike.vx * 0.65;
    const interceptZ = bike.z + bike.vz * 0.65;
    const heading = Math.atan2(interceptX - chosen.x, interceptZ - chosen.z);
    this.spawnSpecificUnit(kind, chosen.x, chosen.z, heading, 18);
  }

  private trySpawnRoadblock(
    bike: PlayerBike,
    wanted: WantedLevelSpec,
    callbacks: PoliceStepCallbacks
  ): void {
    if (wanted.roadblockCount <= 0 || this.roadblocks.length >= wanted.roadblockCount) return;

    const fwdX = Math.sin(bike.heading);
    const fwdZ = Math.cos(bike.heading);
    const lookDist = 62;
    const targetX = bike.x + fwdX * lookDist;
    const targetZ = bike.z + fwdZ * lookDist;

    // Snap onto nearest infinite avenue centerline (n * 35 + 17.5) & mid-block coordinate (n * 35)
    // so the player always passes an intersection before hitting the full-width roadblock
    const snapRoadX = Math.floor(targetX / CELL_PITCH) * CELL_PITCH + HALF_PITCH;
    const snapRoadZ = Math.floor(targetZ / CELL_PITCH) * CELL_PITCH + HALF_PITCH;

    const axis: 'ns' | 'ew' = Math.abs(fwdZ) >= Math.abs(fwdX) ? 'ns' : 'ew';
    const cx = axis === 'ns' ? snapRoadX : Math.round(targetX / CELL_PITCH) * CELL_PITCH;
    const cz = axis === 'ns' ? Math.round(targetZ / CELL_PITCH) * CELL_PITCH : snapRoadZ;

    const dist = Math.hypot(cx - bike.x, cz - bike.z);
    if (dist < 40) return;
    for (const rb of this.roadblocks) {
      if (Math.hypot(rb.centerX - cx, rb.centerZ - cz) < 28) return;
    }

    const group = new THREE.Group();

    // 3 parked police cruisers wall-to-wall across the 11m road (-3.4, 0, +3.4)
    for (const offset of [-3.4, 0, 3.4]) {
      const px = axis === 'ns' ? cx + offset : cx;
      const pz = axis === 'ns' ? cz : cz + offset;
      const heading = axis === 'ns' ? Math.PI / 2 : 0;

      const rig = createPoliceRig('patrol');
      rig.root.position.set(px, 0, pz);
      rig.root.rotation.y = heading;
      rig.redLightMat.color.setHex(0xff2233);
      rig.blueLightMat.color.setHex(0x38bdf8);
      group.add(rig.root);
    }

    // 5 overlapping collision circles spanning [-3.8..+3.8] with radius 1.25 -> ZERO gap!
    const blockers: RoadblockUnit['blockers'] = [];
    for (const offset of [-3.8, -1.9, 0, 1.9, 3.8]) {
      blockers.push({
        x: axis === 'ns' ? cx + offset : cx,
        z: axis === 'ns' ? cz : cz + offset,
        radius: 1.25
      });
    }

    const barrier = createRoadblockBarrierVisual();
    barrier.position.set(cx, 0, cz);
    if (axis === 'ew') {
      barrier.rotation.y = Math.PI / 2;
    } else if (fwdZ > 0) {
      barrier.rotation.y = Math.PI;
    }
    if (axis === 'ew' && fwdX > 0) {
      barrier.rotation.y = -Math.PI / 2;
    }
    group.add(barrier);

    this.scene.add(group);
    this.roadblocks.push({
      group,
      blockers,
      centerX: cx,
      centerZ: cz,
      axis,
      life: 22
    });
    callbacks.onRoadblockSpawned?.(cx, cz);
  }

  private wreckUnit(
    unit: PoliceUnit,
    fx: EffectsManager,
    audio: AudioManager,
    callbacks: PoliceStepCallbacks
  ): void {
    if (unit.wrecked) return;
    unit.wrecked = true;
    unit.wreckTimer = 6.5;
    unit.vx *= 0.25;
    unit.vz *= 0.25;
    unit.speed = 0;
    applyWreckVisual(unit.rig, unit.kind === 'moto');
    fx.emitExplosion(unit.x, 0.7, unit.z);
    audio.playExplosion();
    callbacks.onPoliceWrecked(unit.x, unit.z, unit.kind);
  }

  public update(
    dt: number,
    bike: PlayerBike,
    city: StreamingCity,
    wanted: WantedLevelSpec,
    fx: EffectsManager,
    audio: AudioManager,
    callbacks: PoliceStepCallbacks
  ): PoliceStepSummary {
    this.strobeClock += dt;
    this.updateLightbars();

    // Straight-line pressure tracker: riding straight too long deploys roadblocks faster
    if (bike.speed > 12 && Math.abs(normalizeAngle(bike.heading - this.lastCheckHeading)) < 0.28) {
      this.straightTime += dt;
    } else {
      this.straightTime = Math.max(0, this.straightTime - dt * 2.5);
      this.lastCheckHeading = bike.heading;
    }

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = wanted.spawnInterval;
      this.trySpawnPursuer(bike, wanted);
    }

    this.roadblockTimer -= dt;
    if (this.straightTime >= 3.2 && wanted.roadblockCount > 0) {
      this.roadblockTimer = Math.min(this.roadblockTimer, 0.35);
    }
    if (this.roadblockTimer <= 0) {
      this.roadblockTimer = 6.8;
      this.trySpawnRoadblock(bike, wanted, callbacks);
    }

    // Helicopter (★4+)
    let inChopperLight = false;
    if (wanted.hasHelicopter) {
      if (!this.heliActive) {
        this.heliActive = true;
        this.heli.root.visible = true;
        this.heliX = bike.x;
        this.heliZ = bike.z - 42;
      }
      const orbitOffsetX = Math.sin(this.strobeClock * 0.7) * 5.0;
      const orbitOffsetZ = Math.cos(this.strobeClock * 0.55) * 5.0;
      const goalX = bike.x + orbitOffsetX;
      const goalZ = bike.z + orbitOffsetZ;
      const dx = goalX - this.heliX;
      const dz = goalZ - this.heliZ;
      const dist = Math.hypot(dx, dz);
      const followSpeed = Math.min(26, dist * 1.5);
      if (dist > 0.2) {
        this.heliX += (dx / dist) * followSpeed * dt;
        this.heliZ += (dz / dist) * followSpeed * dt;
      }
      this.heli.root.position.set(this.heliX, 0, this.heliZ);
      this.heli.body.position.y = 15.8 + Math.sin(this.strobeClock * 2.2) * 0.35;
      this.heli.body.rotation.y = Math.atan2(bike.x - this.heliX, bike.z - this.heliZ);
      this.heli.body.rotation.x = 0.14;
      this.heli.spotlightMesh.position.y = this.heli.body.position.y;
      this.heli.mainRotor.rotation.y += dt * 24;
      this.heli.tailRotor.rotation.x += dt * 32;

      inChopperLight = Math.hypot(bike.x - this.heliX, bike.z - this.heliZ) < 4.9;
    } else {
      this.heliActive = false;
      this.heli.root.visible = false;
    }

    // Sealed Roadblocks collision & lifecycle
    for (let i = this.roadblocks.length - 1; i >= 0; i--) {
      const rb = this.roadblocks[i];
      rb.life -= dt;
      const distToBike = Math.hypot(bike.x - rb.centerX, bike.z - rb.centerZ);

      if (bike.y <= 1.45) {
        for (const b of rb.blockers) {
          const dx = bike.x - b.x;
          const dz = bike.z - b.z;
          const d = Math.hypot(dx, dz);
          const minDist = bike.radius + b.radius;
          if (d < minDist && d > 1e-4) {
            const nx = dx / d;
            const nz = dz / d;
            bike.x = b.x + nx * minDist;
            bike.z = b.z + nz * minDist;
            bike.speed = 6;
            if (bike.takeHit(nx * 14, nz * 14)) {
              fx.emitSparks(bike.x, 0.5, bike.z, 12);
              audio.playDamage();
              callbacks.onPlayerHit(bike.x, bike.z);
            }
          }
        }
      }

      if (rb.life <= 0 || distToBike > 110) {
        this.scene.remove(rb.group);
        this.roadblocks.splice(i, 1);
      }
    }

    // Police Units Steering, Movement & World Collision
    const playerInt = nearestIntersection(bike.x, bike.z);
    let nearestDist = 999;
    let activeCount = 0;

    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      if (u.nearMissCooldown > 0) u.nearMissCooldown = Math.max(0, u.nearMissCooldown - dt);
      if (u.spawnGrace > 0) u.spawnGrace = Math.max(0, u.spawnGrace - dt);

      if (u.wrecked) {
        u.wreckTimer -= dt;
        u.vx *= Math.exp(-5 * dt);
        u.vz *= Math.exp(-5 * dt);
        u.x += u.vx * dt;
        u.z += u.vz * dt;
        u.rig.root.position.set(u.x, 0, u.z);
        if (Math.random() < dt * 7) {
          fx.emitSmoke(u.x, 0.75, u.z, 0x1e293b, 1);
        }
        if (u.wreckTimer <= 0) {
          this.scene.remove(u.rig.root);
          this.units.splice(i, 1);
        }
        continue;
      }

      activeCount++;
      const spec = POLICE_SPECS[u.kind];
      const dxToBike = bike.x - u.x;
      const dzToBike = bike.z - u.z;
      const distToBike = Math.hypot(dxToBike, dzToBike);
      nearestDist = Math.min(nearestDist, distToBike);

      if (distToBike > 108) {
        this.scene.remove(u.rig.root);
        this.units.splice(i, 1);
        continue;
      }

      const localColliders = city.queryCollidersNear(u.x, u.z, 1);
      const isMoto = u.kind === 'moto';
      const prevHeading = u.heading;

      let aimX = bike.x;
      let aimZ = bike.z;

      const losLimit = isMoto ? 44 : 38;
      const losPad = isMoto ? 0.42 : 0.7;
      const hasLOS =
        distToBike < losLimit && hasLineOfSight(u.x, u.z, bike.x, bike.z, localColliders, losPad);
      if (hasLOS) {
        if (u.kind === 'interceptor' && distToBike > 7) {
          aimX = bike.x + bike.vx * 0.48;
          aimZ = bike.z + bike.vz * 0.48;
        } else if (isMoto && distToBike > 6) {
          aimX = bike.x + bike.vx * 0.25;
          aimZ = bike.z + bike.vz * 0.25;
        }
      } else {
        let routedAlley = false;
        if (isMoto) {
          const playerChunk = city.getChunkAt(bike.x, bike.z);
          if (playerChunk && playerChunk.alleys.length > 0) {
            const alley = playerChunk.alleys[0];
            const d1 = Math.hypot(alley.x1 - u.x, alley.z1 - u.z);
            const d2 = Math.hypot(alley.x2 - u.x, alley.z2 - u.z);
            const eX = d1 <= d2 ? alley.x1 : alley.x2;
            const eZ = d1 <= d2 ? alley.z1 : alley.z2;
            const eDist = Math.min(d1, d2);
            if (eDist < 34 && hasLineOfSight(u.x, u.z, eX, eZ, localColliders, 0.35)) {
              aimX = eX;
              aimZ = eZ;
              routedAlley = true;
            }
          }
        }

        if (!routedAlley) {
          const myInt = nearestIntersection(u.x, u.z);
          const curNext = intersectionCoords(u.nextIx, u.nextIz);
          if (
            Math.hypot(u.x - curNext.x, u.z - curNext.z) < 7.5 ||
            (u.nextIx === myInt.ix && u.nextIz === myInt.iz)
          ) {
            const step = chooseNextIntersectionStep(
              myInt.ix,
              myInt.iz,
              playerInt.ix,
              playerInt.iz,
              u.flankBiasX,
              u.flankBiasZ
            );
            u.nextIx = step.ix;
            u.nextIz = step.iz;
          }
          const targetPos = intersectionCoords(u.nextIx, u.nextIz);
          aimX = targetPos.x;
          aimZ = targetPos.z;
        }
      }

      if (u.reverseTimer > 0) {
        u.reverseTimer -= dt;
        u.heading = normalizeAngle(u.heading + u.reverseTurnSign * spec.turnRate * 0.85 * dt);
        const fwdX = Math.sin(u.heading);
        const fwdZ = Math.cos(u.heading);
        u.vx = -fwdX * 8.0;
        u.vz = -fwdZ * 8.0;
        u.x += u.vx * dt;
        u.z += u.vz * dt;
      } else {
        let desiredHeading = Math.atan2(aimX - u.x, aimZ - u.z);

        const feelerLen = isMoto ? 4.6 : 6.2;
        const feelerPad = isMoto ? 0.38 : 0.65;
        const feelerSidePad = isMoto ? 0.35 : 0.6;
        const leftHeading = desiredHeading + 0.48;
        const rightHeading = desiredHeading - 0.48;
        const centerClear = hasLineOfSight(
          u.x,
          u.z,
          u.x + Math.sin(desiredHeading) * feelerLen,
          u.z + Math.cos(desiredHeading) * feelerLen,
          localColliders,
          feelerPad
        );
        if (!centerClear) {
          const leftClear = hasLineOfSight(
            u.x,
            u.z,
            u.x + Math.sin(leftHeading) * feelerLen,
            u.z + Math.cos(leftHeading) * feelerLen,
            localColliders,
            feelerSidePad
          );
          const rightClear = hasLineOfSight(
            u.x,
            u.z,
            u.x + Math.sin(rightHeading) * feelerLen,
            u.z + Math.cos(rightHeading) * feelerLen,
            localColliders,
            feelerSidePad
          );
          if (leftClear && !rightClear) desiredHeading += 0.52;
          else if (rightClear && !leftClear) desiredHeading -= 0.52;
          else desiredHeading += u.reverseTurnSign * 0.42;
        }

        const err = normalizeAngle(desiredHeading - u.heading);
        const maxTurn = spec.turnRate * dt;
        u.heading = normalizeAngle(u.heading + Math.max(-maxTurn, Math.min(maxTurn, err)));

        const catchupBoost = distToBike > 24 ? (inChopperLight ? 1.24 : 1.18) : 1.02;
        const targetSpd = spec.maxSpeed * catchupBoost * (Math.abs(err) > 1.1 ? 0.72 : 1.0);
        if (u.speed < targetSpd) {
          u.speed = Math.min(targetSpd, u.speed + spec.accel * dt);
        } else {
          u.speed = Math.max(targetSpd, u.speed - 14 * dt);
        }

        const fwdX = Math.sin(u.heading);
        const fwdZ = Math.cos(u.heading);
        const blend = 1 - Math.exp(-(isMoto ? 10.5 : 7.0) * dt);
        u.vx += (fwdX * u.speed - u.vx) * blend;
        u.vz += (fwdZ * u.speed - u.vz) * blend;

        u.x += u.vx * dt;
        u.z += u.vz * dt;
      }

      const col = resolveCircleWorldCollision(
        u.x,
        u.z,
        u.vx,
        u.vz,
        u.radius,
        localColliders,
        null
      );
      u.x = col.x;
      u.z = col.z;
      u.vx = col.vx;
      u.vz = col.vz;

      const actualSpeed = Math.hypot(u.vx, u.vz);
      const crashThreshold = spec.heavy ? 18.0 : isMoto ? 12.2 : 14.2;
      if (col.hit && col.impactSpeed > crashThreshold && u.spawnGrace <= 0) {
        this.wreckUnit(u, fx, audio, callbacks);
      } else if (actualSpeed < 3.0 && u.reverseTimer <= 0) {
        u.stuckTimer += dt;
        if (u.stuckTimer > 1.35) {
          u.stuckTimer = 0;
          u.reverseTimer = 0.72;
          u.reverseTurnSign *= -1;
        }
      } else {
        u.stuckTimer = Math.max(0, u.stuckTimer - dt * 2);
      }

      for (const w of u.rig.wheels) {
        w.rotation.x += (actualSpeed / 0.36) * dt;
      }
      u.rig.root.position.set(u.x, 0, u.z);
      u.rig.root.rotation.y = u.heading;
      if (isMoto) {
        const angVel = dt > 1e-4 ? normalizeAngle(u.heading - prevHeading) / dt : 0;
        const leanTarget = Math.max(-0.52, Math.min(0.52, -angVel * 0.16));
        u.lean += (leanTarget - u.lean) * (1 - Math.exp(-12 * dt));
        u.rig.bodyGroup.rotation.z = u.lean;
      } else {
        u.rig.bodyGroup.rotation.z = Math.max(-0.14, Math.min(0.14, -u.vx * 0.004));
      }
    }

    // Police-vs-Police collisions
    for (let i = 0; i < this.units.length; i++) {
      const a = this.units[i];
      if (a.wrecked) continue;
      for (let j = i + 1; j < this.units.length; j++) {
        const b = this.units[j];
        if (b.wrecked) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const minDist = a.radius + b.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= minDist * minDist || d2 < 1e-6) continue;

        const d = Math.sqrt(d2);
        const nx = dx / d;
        const nz = dz / d;
        const overlap = (minDist - d) * 0.5;
        a.x -= nx * overlap;
        a.z -= nz * overlap;
        b.x += nx * overlap;
        b.z += nz * overlap;

        const relVx = b.vx - a.vx;
        const relVz = b.vz - a.vz;
        const approach = -(relVx * nx + relVz * nz);

        if (approach > 13.0 && a.spawnGrace <= 0 && b.spawnGrace <= 0) {
          if (!POLICE_SPECS[a.kind].heavy) this.wreckUnit(a, fx, audio, callbacks);
          if (!POLICE_SPECS[b.kind].heavy) this.wreckUnit(b, fx, audio, callbacks);
        } else if (approach > 0) {
          a.vx -= nx * approach * 0.5;
          a.vz -= nz * approach * 0.5;
          b.vx += nx * approach * 0.5;
          b.vz += nz * approach * 0.5;
        }
      }
    }

    // Player-vs-Police collision & Near-Miss detection (Nitro gives NO invulnerability)
    let isPinned = false;
    for (const u of this.units) {
      if (u.wrecked) continue;
      const dx = bike.x - u.x;
      const dz = bike.z - u.z;
      const d = Math.hypot(dx, dz);

      if (d < 4.1) {
        isPinned = true;
      }

      if (bike.y > 1.45) {
        if (d < 3.2 && u.nearMissCooldown <= 0) {
          u.nearMissCooldown = 2.6;
          callbacks.onNearMiss(bike.x, bike.z);
        }
        continue;
      }

      const hitDist = bike.radius + u.radius;
      if (d < hitDist && d > 1e-4) {
        const nx = dx / d;
        const nz = dz / d;
        bike.x = u.x + nx * hitDist;
        bike.z = u.z + nz * hitDist;

        u.vx -= nx * 6;
        u.vz -= nz * 6;
        u.speed = Math.max(4, u.speed * 0.55);
        if (bike.takeHit(nx * 12, nz * 12)) {
          fx.emitSparks(bike.x, 0.5, bike.z, 12);
          audio.playDamage();
          callbacks.onPlayerHit(bike.x, bike.z);
        }
      } else if (d < 3.2 && !bike.airborne && bike.speed > 13.5 && u.nearMissCooldown <= 0) {
        u.nearMissCooldown = 2.5;
        callbacks.onNearMiss(bike.x, bike.z);
      }
    }

    return {
      nearestDist,
      isPinned,
      activeCount,
      inChopperLight
    };
  }
}
