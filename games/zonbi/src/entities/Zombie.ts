import * as THREE from 'three';
import { ZOMBIES, type ZombieKind, type ZombieSpec } from '../data';
import { ZombieRig } from './LowPolyRig';

export interface ZombieAttackHit {
  target: 'shelter' | 'hero';
  damage: number;
  x: number;
  z: number;
  isExplosion?: boolean;
}

export class ZombieEntity {
  public readonly spec: ZombieSpec;
  public readonly rig: ZombieRig;
  public readonly pos = new THREE.Vector3();
  public readonly vel = new THREE.Vector3();

  public hp: number;
  public maxHp: number;
  public speed: number;
  public damage: number;
  public shelterDamage: number;
  public dead = false;

  public hitFlash = 0;
  public burnTimer = 0;
  public burnDps = 0;
  public slowTimer = 0;
  public slowRatio = 1;
  public freezeTimer = 0;
  public stunTimer = 0;

  private attackTimer = 0.25;
  private targetLaneX: number;
  private wobblePhase = Math.random() * Math.PI * 2;

  constructor(
    scene: THREE.Scene,
    kind: ZombieKind,
    x: number,
    z: number,
    hpMult: number,
    speedMult: number,
    dmgMult: number
  ) {
    this.spec = ZOMBIES[kind];
    this.rig = new ZombieRig(this.spec);
    this.pos.set(x, 0, z);
    this.targetLaneX = THREE.MathUtils.clamp(x * 0.78 + (Math.random() - 0.5) * 4.6, -7.8, 7.8);

    this.maxHp = Math.round(this.spec.hp * hpMult);
    this.hp = this.maxHp;
    this.speed = this.spec.speed * speedMult * (0.94 + Math.random() * 0.16);
    this.damage = this.spec.damage * dmgMult;
    this.shelterDamage = this.spec.shelterDamage * dmgMult;

    this.rig.root.position.copy(this.pos);
    scene.add(this.rig.root);
  }

  applyKnockback(dirX: number, dirZ: number, force: number, lift = 2.8): void {
    const resist = this.spec.isBoss ? 0.08 : this.spec.kind === 'brute' ? 0.28 : 0.85;
    this.vel.x += dirX * force * resist;
    this.vel.z += dirZ * force * resist;
    this.vel.y = Math.max(this.vel.y, lift * resist);
    this.stunTimer = Math.max(this.stunTimer, 0.12 * resist);
  }

  update(
    dt: number,
    heroPos: THREE.Vector3,
    heroRadius: number,
    southWallZ: number,
    arenaHalfW: number,
    cameraQuat: THREE.Quaternion,
    onBurnTick: (dmg: number) => void
  ): ZombieAttackHit | null {
    if (this.dead) return null;

    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt);

    // Burn DoT
    if (this.burnTimer > 0) {
      this.burnTimer -= dt;
      onBurnTick(this.burnDps * dt);
      if (this.dead) return null;
    }

    // Slow / Freeze
    let spdFactor = 1;
    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      spdFactor = this.slowRatio;
    } else {
      this.slowRatio = 1;
    }

    const frozen = this.freezeTimer > 0;
    if (frozen) {
      this.freezeTimer -= dt;
    }

    // Knockback / Launch physics (Zelda Musou flying zombies!)
    const airborne = this.pos.y > 0.05 || this.vel.y > 0.1 || Math.hypot(this.vel.x, this.vel.z) > 2.2;
    if (this.pos.y > 0 || this.vel.y !== 0 || Math.abs(this.vel.x) > 0.05 || Math.abs(this.vel.z) > 0.05) {
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      this.pos.y += this.vel.y * dt;
      this.vel.y -= 24 * dt;

      if (this.pos.y <= 0) {
        this.pos.y = 0;
        if (this.vel.y < -3) {
          this.vel.y = -this.vel.y * 0.25;
        } else {
          this.vel.y = 0;
        }
      }
      const damp = Math.exp(-8.5 * dt);
      this.vel.x *= damp;
      this.vel.z *= damp;
    }

    let attackHit: ZombieAttackHit | null = null;
    let moving = false;
    let attackingShelter = false;

    if (this.stunTimer > 0) {
      this.stunTimer -= dt;
    } else if (!frozen && this.pos.y <= 0.05) {
      const distHero = Math.hypot(heroPos.x - this.pos.x, heroPos.z - this.pos.z);
      const stopWallZ = southWallZ - this.spec.radius - 0.15;

      // Priority 1: Attack Shelter Wall once reached!
      if (this.pos.z >= stopWallZ) {
        attackingShelter = true;
        this.rig.root.rotation.y = 0; // Facing south (+Z) toward Shelter Gate
        if (this.spec.explodes) {
          this.dead = true;
          attackHit = {
            target: 'shelter',
            damage: this.shelterDamage,
            x: this.pos.x,
            z: this.pos.z,
            isExplosion: true
          };
        } else {
          this.attackTimer -= dt;
          if (this.attackTimer <= 0) {
            this.attackTimer = 1 / this.spec.attackRate;
            attackHit = {
              target: 'shelter',
              damage: this.shelterDamage,
              x: this.pos.x,
              z: this.pos.z
            };
          }
        }
      } else if (distHero < this.spec.radius + heroRadius + 0.65) {
        // Priority 2: Hero is directly blocking us -> melee swipe or suicide explosion!
        this.rig.root.rotation.y = Math.atan2(heroPos.x - this.pos.x, heroPos.z - this.pos.z);
        this.attackTimer -= dt;
        if (this.attackTimer <= 0) {
          if (this.spec.explodes) {
            this.dead = true;
            attackHit = {
              target: 'hero',
              damage: this.damage,
              x: this.pos.x,
              z: this.pos.z,
              isExplosion: true
            };
          } else {
            this.attackTimer = 1 / this.spec.attackRate;
            attackHit = {
              target: 'hero',
              damage: this.damage,
              x: this.pos.x,
              z: this.pos.z
            };
          }
        }
      } else {
        // March relentlessly toward the Shelter Gate (or aggressively hunt Hero if close)
        moving = true;
        this.wobblePhase += dt * 3.6;
        let tx = this.targetLaneX + Math.sin(this.wobblePhase) * 0.75;
        let tz = stopWallZ + 1.0;

        if (distHero < 5.5 && this.pos.z < southWallZ - 2.8) {
          // Nearby zombies aggressively pressure hero while outer flanks rush the Shelter!
          tx = THREE.MathUtils.lerp(tx, heroPos.x, 0.72);
          tz = THREE.MathUtils.lerp(tz, heroPos.z, 0.65);
        }

        const dx = tx - this.pos.x;
        const dz = tz - this.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        const step = this.speed * spdFactor * dt;
        this.pos.x += (dx / d) * step;
        this.pos.z += (dz / d) * step;
        this.rig.root.rotation.y = Math.atan2(dx, dz);
      }
    }

    // Keep inside arena walls
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -arenaHalfW + this.spec.radius, arenaHalfW - this.spec.radius);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -21, southWallZ - this.spec.radius * 0.7);

    this.rig.root.position.copy(this.pos);
    this.rig.updateVisuals(
      dt,
      moving,
      this.hitFlash,
      frozen,
      this.burnTimer > 0,
      this.hp / this.maxHp,
      cameraQuat,
      airborne ? 1 : 0,
      attackingShelter
    );

    return attackHit;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.rig.root);
    this.rig.dispose();
  }
}
