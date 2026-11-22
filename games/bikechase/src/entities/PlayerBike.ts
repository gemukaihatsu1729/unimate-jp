import { BIKES, type BikeId, type BikeSpec } from '../data';
import type { StreamingCity } from '../world/CityLayout';
import {
  isInsidePark,
  normalizeAngle,
  resolveCircleWorldCollision,
  sampleRampState
} from '../world/Collision';
import { BikeMesh } from './BikeMesh';
import type { EffectsManager } from '../fx/EffectsManager';
import type { AudioManager } from '../audio/AudioManager';

export interface BikeStepCallbacks {
  onLandJump: (airTime: number) => void;
  onMiniTurbo: () => void;
  onWallSlamDamage: () => void;
}

export class PlayerBike {
  public readonly mesh: BikeMesh;
  public spec: BikeSpec = BIKES.viper;

  public x = 0;
  public y = 0;
  public z = 17.5;
  public vx = 0;
  public vy = 0;
  public vz = 0;
  public heading = Math.PI; // Facing north (-Z) initially
  public speed = 0;
  public groundSpeed = 0;
  public angularVel = 0;
  public lean = 0;
  public pitch = 0;

  public hp = 3;
  public maxHp = 3;
  public nitro = 35; // 0..100
  public driftTime = 0;
  public isDrifting = false;
  public miniTurboTimer = 0;
  public nitroTimer = 0;
  public invulnTimer = 0;
  public bustedProgress = 0; // 0..1

  public airborne = false;
  public airTime = 0;
  public distanceTraveled = 0;
  public readonly radius = 0.62;

  private wasOnRamp = false;
  private lastRampHeight = 0;
  private particleAccum = 0;
  private skidAccum = 0;
  private wallHitCooldown = 0;

  constructor(initialId: BikeId = 'viper') {
    this.mesh = new BikeMesh(initialId);
    this.reset(initialId, 0, 17.5, Math.PI);
  }

  public reset(bikeId: BikeId, x = 0, z = 17.5, heading = Math.PI): void {
    this.spec = BIKES[bikeId];
    this.mesh.setBikeVisual(bikeId);
    this.x = x;
    this.y = 0;
    this.z = z;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.heading = heading;
    this.speed = 11;
    this.groundSpeed = 11;
    this.angularVel = 0;
    this.lean = 0;
    this.pitch = 0;

    this.hp = this.spec.maxHp;
    this.maxHp = this.spec.maxHp;
    this.nitro = 0;
    this.driftTime = 0;
    this.isDrifting = false;
    this.miniTurboTimer = 0;
    this.nitroTimer = 0;
    this.invulnTimer = 0;
    this.bustedProgress = 0;

    this.airborne = false;
    this.airTime = 0;
    this.distanceTraveled = 0;
    this.wasOnRamp = false;
    this.lastRampHeight = 0;
    this.particleAccum = 0;
    this.skidAccum = 0;
    this.wallHitCooldown = 0;

    this.syncMeshTransform(0);
  }

  public get isOverdrive(): boolean {
    return this.nitroTimer > 0;
  }

  public get isMiniTurbo(): boolean {
    return this.miniTurboTimer > 0;
  }

  public triggerOverdrive(): boolean {
    if (this.nitro < 60 || this.nitroTimer > 0.25) return false;
    this.nitro = Math.max(0, this.nitro - 60);
    this.nitroTimer = 1.65;
    return true;
  }

  public addNitro(amount: number): void {
    this.nitro = Math.min(100, this.nitro + amount);
  }

  public takeHit(pushX: number, pushZ: number): boolean {
    if (this.invulnTimer > 0) return false;
    this.hp = Math.max(0, this.hp - 1);
    this.invulnTimer = 1.35;
    const resist = 1 / this.spec.knockbackResist;
    this.vx += pushX * resist;
    this.vz += pushZ * resist;
    this.speed = Math.max(7, this.speed * 0.66);
    return true;
  }

  public update(
    dt: number,
    steerX: number,
    steerZ: number,
    steerStrength: number,
    city: StreamingCity,
    fx: EffectsManager,
    audio: AudioManager,
    callbacks: BikeStepCallbacks
  ): void {
    if (this.invulnTimer > 0) this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    if (this.miniTurboTimer > 0) this.miniTurboTimer = Math.max(0, this.miniTurboTimer - dt);
    if (this.nitroTimer > 0) this.nitroTimer = Math.max(0, this.nitroTimer - dt);
    if (this.wallHitCooldown > 0) this.wallHitCooldown = Math.max(0, this.wallHitCooldown - dt);

    const prevHeading = this.heading;

    // 1. Steering toward target world vector
    let angleError = 0;
    if (steerStrength > 0.08) {
      const targetHeading = Math.atan2(steerX, steerZ);
      angleError = normalizeAngle(targetHeading - this.heading);
      const turnMult = this.airborne ? 0.35 : this.isDrifting ? 1.16 : 1.0;
      const maxTurn = this.spec.turnRate * turnMult * dt;
      const step = Math.max(-maxTurn, Math.min(maxTurn, angleError));
      this.heading = normalizeAngle(this.heading + step);
    }

    const dYaw = normalizeAngle(this.heading - prevHeading);
    this.angularVel = dt > 1e-4 ? dYaw / dt : 0;

    // 2. Drift state & automatic Mini-Turbo
    const sharpTurn = steerStrength > 0.25 && Math.abs(angleError) > 0.62 && this.speed > 13 && !this.airborne;
    if (sharpTurn) {
      this.isDrifting = true;
      this.driftTime += dt;
      this.addNitro(dt * 12.5);
    } else {
      if (this.isDrifting && this.driftTime >= 0.55) {
        this.miniTurboTimer = 0.85;
        callbacks.onMiniTurbo();
        audio.playNitroBurst(0.65);
        fx.emitBurst(this.x, this.y + 0.35, this.z, 0xf97316, 10, 5.5);
      }
      this.isDrifting = false;
      this.driftTime = 0;
    }

    // 3. Target forward speed & traction
    const inPark = !this.airborne && isInsidePark(this.x, this.z, city.queryParksNear(this.x, this.z));
    const surfaceMult = inPark ? this.spec.offroadGrip : 1.0;
    let targetSpeed = this.spec.maxSpeed * surfaceMult;
    if (this.isDrifting) {
      targetSpeed *= this.spec.driftGrip;
    }
    if (this.isMiniTurbo) {
      targetSpeed *= 1.28;
    }
    if (this.isOverdrive) {
      targetSpeed = this.spec.maxSpeed * 1.38;
    }

    const accelRate = this.isOverdrive ? this.spec.accel * 2.2 : this.spec.accel;
    if (this.speed < targetSpeed) {
      this.speed = Math.min(targetSpeed, this.speed + accelRate * dt);
    } else {
      this.speed = Math.max(targetSpeed, this.speed - 16 * dt);
    }

    const fwdX = Math.sin(this.heading);
    const fwdZ = Math.cos(this.heading);
    const desiredVx = fwdX * this.speed;
    const desiredVz = fwdZ * this.speed;

    // Velocity alignment: drifts allow satisfying lateral slip before snapping back
    const grip = this.airborne ? 1.5 : this.isDrifting ? 4.4 : 11.5;
    const blend = 1 - Math.exp(-grip * dt);
    this.vx += (desiredVx - this.vx) * blend;
    this.vz += (desiredVz - this.vz) * blend;

    const prevX = this.x;
    const prevZ = this.z;
    this.x += this.vx * dt;
    this.z += this.vz * dt;

    // 4. World collision & smooth wall slide (unbounded infinite city)
    const nearColliders = city.queryCollidersNear(this.x, this.z, 1);
    const col = resolveCircleWorldCollision(
      this.x,
      this.z,
      this.vx,
      this.vz,
      this.radius,
      nearColliders,
      null
    );
    this.x = col.x;
    this.z = col.z;
    this.vx = col.vx;
    this.vz = col.vz;

    if (col.hit && col.impactSpeed > 4.2) {
      const actualSpeed = Math.hypot(this.vx, this.vz);
      this.speed = Math.max(0, Math.min(this.speed, actualSpeed + 1.2));
      if (this.wallHitCooldown <= 0) {
        this.wallHitCooldown = 0.25;
        fx.emitSparks(
          this.x - col.normalX * 0.4,
          this.y + 0.45,
          this.z - col.normalZ * 0.4,
          8
        );
        if (col.impactSpeed > 18.5 && this.invulnTimer <= 0) {
          if (this.takeHit(col.normalX * 7, col.normalZ * 7)) {
            callbacks.onWallSlamDamage();
            audio.playDamage();
          }
        } else {
          audio.playScrape();
        }
      }
    }

    const stepMoved = Math.hypot(this.x - prevX, this.z - prevZ);
    const movedSpeed = dt > 1e-4 ? stepMoved / dt : 0;
    this.groundSpeed += (movedSpeed - this.groundSpeed) * (1 - Math.exp(-12 * dt));
    this.distanceTraveled += stepMoved;

    // 5. Ramp physics & jump airtime
    const nearRamps = city.queryRampsNear(this.x, this.z);
    const rampSample = sampleRampState(this.x, this.z, fwdX, fwdZ, nearRamps);
    if (!this.airborne) {
      if (rampSample.onRamp) {
        this.y = rampSample.rampHeight;
        this.wasOnRamp = true;
        this.lastRampHeight = rampSample.rampHeight;
        this.pitch = 0.28;
        if (rampSample.atCrest && this.speed > 13.5) {
          this.airborne = true;
          this.airTime = 0;
          this.vy = 7.4 + (this.speed / this.spec.maxSpeed) * 2.8;
          this.wasOnRamp = false;
          audio.playJumpWhoosh();
        }
      } else {
        if (this.wasOnRamp && this.lastRampHeight > 0.7 && this.speed > 13) {
          this.airborne = true;
          this.airTime = 0;
          this.vy = 7.2 + (this.speed / this.spec.maxSpeed) * 2.5;
          audio.playJumpWhoosh();
        } else {
          this.y = Math.max(0, this.y - 12 * dt);
        }
        this.wasOnRamp = false;
        this.lastRampHeight = 0;
      }
    } else {
      this.airTime += dt;
      this.vy -= 23.5 * dt;
      this.y += this.vy * dt;
      const floorH = rampSample.onRamp ? rampSample.rampHeight : 0;
      if (this.y <= floorH) {
        this.y = floorH;
        this.vy = 0;
        this.airborne = false;
        if (this.airTime >= 0.34) {
          this.miniTurboTimer = Math.max(this.miniTurboTimer, 0.9);
          this.addNitro(18);
          callbacks.onLandJump(this.airTime);
          fx.emitBurst(this.x, 0.2, this.z, 0xfbbf24, 14, 7);
          audio.playJumpLand();
        }
        this.airTime = 0;
      }
    }

    // 6. Visual lean & pitch
    const leanTarget = this.airborne
      ? 0
      : Math.max(-0.56, Math.min(0.56, -this.angularVel * 0.16));
    this.lean += (leanTarget - this.lean) * (1 - Math.exp(-14 * dt));

    const pitchTarget = this.airborne
      ? Math.max(-0.28, Math.min(0.35, this.vy * 0.04))
      : this.isOverdrive || this.isMiniTurbo
        ? 0.12
        : rampSample.onRamp
          ? 0.26
          : 0;
    this.pitch += (pitchTarget - this.pitch) * (1 - Math.exp(-10 * dt));

    // 7. Tire skid marks, drift smoke & nitro trails
    if (this.isDrifting && !this.airborne) {
      this.skidAccum += dt;
      this.particleAccum += dt;
      if (this.skidAccum >= 0.032) {
        this.skidAccum = 0;
        fx.spawnSkid(this.x - fwdX * 0.65, this.z - fwdZ * 0.65, this.heading, 0.28);
      }
      if (this.particleAccum >= 0.045) {
        this.particleAccum = 0;
        fx.emitSmoke(this.x - fwdX * 0.75, 0.2, this.z - fwdZ * 0.75, 0xe2e8f0, 1);
      }
    } else if (this.isOverdrive || this.isMiniTurbo) {
      this.particleAccum += dt;
      if (this.particleAccum >= 0.035) {
        this.particleAccum = 0;
        fx.emitBurst(
          this.x - fwdX * 0.9,
          this.y + 0.42,
          this.z - fwdZ * 0.9,
          this.isOverdrive ? 0x38bdf8 : 0xf97316,
          2,
          3.2
        );
      }
    }

    this.syncMeshTransform(dt);
  }

  public syncMeshTransform(dt: number): void {
    this.mesh.root.position.set(this.x, 0, this.z);
    this.mesh.root.rotation.y = this.heading;
    this.mesh.updateVisuals(
      dt,
      this.speed,
      this.lean,
      this.pitch,
      this.isDrifting,
      this.isMiniTurbo,
      this.isOverdrive,
      this.invulnTimer,
      this.y
    );
  }
}
