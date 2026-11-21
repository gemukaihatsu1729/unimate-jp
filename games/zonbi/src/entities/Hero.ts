import * as THREE from 'three';
import { WEAPONS, type RunMods, type WeaponId, type WeaponSpec } from '../data';
import { HeroRig } from './LowPolyRig';

export interface HeroAttackEvent {
  type: 'light' | 'strong';
  weaponId: WeaponId;
  comboStep: number;
  x: number;
  z: number;
  yaw: number;
  damage: number;
  range: number;
  arcHalfAngle: number;
  knockback: number;
  lift: number;
  burn?: boolean;
  stun?: boolean;
  fullCircle?: boolean;
}

export class Hero {
  public readonly rig = new HeroRig();
  public readonly pos = new THREE.Vector3(0, 0, 6.2);
  public readonly radius = 0.58;
  public yaw = Math.PI; // Facing north (-Z) toward incoming horde

  public maxHp = 180;
  public hp = 180;
  public musouGauge = 0; // 0..100
  public weaponId: WeaponId = 'greatsword';

  public strongCooldown = 0;
  public dodgeCooldown = 0;
  public invulnTimer = 0;

  private attackTimer = 0;
  private attackDuration = 0;
  private attackIsStrong = false;
  private comboStep = 0;
  private comboResetTimer = 0;
  private dodgeTimer = 0;
  private dodgeDir = new THREE.Vector2(0, -1);
  private lungeVel = new THREE.Vector2(0, 0);

  constructor(scene: THREE.Scene) {
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.yaw;
    scene.add(this.rig.root);
  }

  setWeapon(id: WeaponId): void {
    this.weaponId = id;
    this.rig.setWeapon(id);
  }

  getSpec(): WeaponSpec {
    return WEAPONS[this.weaponId];
  }

  resetForTitle(): void {
    this.pos.set(0, 0, 7.6);
    this.yaw = Math.PI; // Facing camera (north) with the glowing 3D Shelter Fortress right behind!
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.yaw;
    this.attackTimer = 0;
    this.dodgeTimer = 0;
    this.musouGauge = 0;
  }

  resetForBattle(weaponId: WeaponId): void {
    this.setWeapon(weaponId);
    this.pos.set(0, 0, 5.5);
    this.yaw = Math.PI; // Face north (-Z) toward approaching zombie horde
    this.maxHp = 180;
    this.hp = this.maxHp;
    this.musouGauge = 0;
    this.strongCooldown = 0;
    this.dodgeCooldown = 0;
    this.invulnTimer = 0;
    this.attackTimer = 0;
    this.comboStep = 0;
    this.comboResetTimer = 0;
    this.dodgeTimer = 0;
    this.lungeVel.set(0, 0);
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.yaw;
  }

  playLoadoutFlex(): void {
    this.attackIsStrong = false;
    this.attackDuration = 0.34;
    this.attackTimer = 0.34;
    this.comboStep = (this.comboStep + 1) % 2;
  }

  updateTitle(dt: number, time: number): void {
    if (this.attackTimer > 0) this.attackTimer = Math.max(0, this.attackTimer - dt);
    const prog = this.attackTimer > 0 ? 1 - this.attackTimer / Math.max(0.01, this.attackDuration) : -1;
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = Math.PI + Math.sin(time * 0.7) * 0.26;
    this.rig.animate(dt, 0, prog, this.comboStep, false, false, false, time);
  }

  takeDamage(amount: number): boolean {
    if (this.invulnTimer > 0 || this.dodgeTimer > 0) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.invulnTimer = 0.30;
    return true;
  }

  addMusou(amount: number): void {
    this.musouGauge = Math.min(100, this.musouGauge + amount);
  }

  updateBattle(
    dt: number,
    time: number,
    input: {
      moveX: number;
      moveY: number;
      attackHeld: boolean;
      attackPressed: boolean;
      strongPressed: boolean;
      dodgePressed: boolean;
    },
    camForward: THREE.Vector2,
    camRight: THREE.Vector2,
    nearestZombiePos: THREE.Vector3 | null,
    mods: RunMods,
    arenaHalfW: number,
    southWallZ: number
  ): { attackEvent: HeroAttackEvent | null; dodged: boolean } {
    const spec = this.getSpec();
    let attackEvent: HeroAttackEvent | null = null;
    let dodged = false;

    if (this.strongCooldown > 0) this.strongCooldown = Math.max(0, this.strongCooldown - dt);
    if (this.dodgeCooldown > 0) this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    if (this.invulnTimer > 0) this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    if (this.attackTimer > 0) this.attackTimer = Math.max(0, this.attackTimer - dt);
    if (this.comboResetTimer > 0) {
      this.comboResetTimer -= dt;
      if (this.comboResetTimer <= 0) this.comboStep = 0;
    }

    // Compute world-space desired movement from camera-relative joystick
    const worldMoveX = camRight.x * input.moveX + camForward.x * input.moveY;
    const worldMoveZ = camRight.y * input.moveX + camForward.y * input.moveY;
    const moveLen = Math.hypot(worldMoveX, worldMoveZ);
    const hasMove = moveLen > 0.08;

    // 1. Dodge Dash (interrupts attacks cleanly!)
    if (input.dodgePressed && this.dodgeCooldown <= 0) {
      this.dodgeCooldown = 0.95;
      this.dodgeTimer = 0.20;
      this.invulnTimer = Math.max(this.invulnTimer, 0.28);
      this.attackTimer = 0;
      if (hasMove) {
        this.dodgeDir.set(worldMoveX / moveLen, worldMoveZ / moveLen);
        this.yaw = Math.atan2(this.dodgeDir.x, this.dodgeDir.y);
      } else {
        this.dodgeDir.set(Math.sin(this.yaw), Math.cos(this.yaw));
      }
      dodged = true;
    }

    // 2. Strong AoE Attack
    if (input.strongPressed && this.strongCooldown <= 0 && this.dodgeTimer <= 0) {
      this.faceNearestOrMove(nearestZombiePos, hasMove ? worldMoveX : 0, hasMove ? worldMoveZ : 0, 9.0);
      this.strongCooldown = spec.strongCooldown;
      this.attackIsStrong = true;
      this.attackDuration = 0.38;
      this.attackTimer = 0.38;
      this.comboStep = 0;

      const fx = Math.sin(this.yaw);
      const fz = Math.cos(this.yaw);
      const lungeSpeed = spec.strongStyle === 'dash_flurry' ? 18.0 : 6.0;
      this.lungeVel.set(fx * lungeSpeed, fz * lungeSpeed);

      attackEvent = {
        type: 'strong',
        weaponId: spec.id,
        comboStep: 3,
        x: this.pos.x + fx * (spec.strongStyle === 'dash_flurry' ? 1.8 : 0.6),
        z: this.pos.z + fz * (spec.strongStyle === 'dash_flurry' ? 1.8 : 0.6),
        yaw: this.yaw,
        damage: spec.strongDamage * mods.heroDamage,
        range: spec.strongRange * mods.heroRange,
        arcHalfAngle: Math.PI, // Full 360° Musou Strong AoE!
        knockback: spec.strongKnockback,
        lift: spec.id === 'hammer' ? 8.2 : 5.6,
        burn: spec.id === 'greatsword',
        stun: spec.id === 'hammer',
        fullCircle: true
      };
    } else if ((input.attackPressed || input.attackHeld) && this.attackTimer <= 0.03 && this.dodgeTimer <= 0) {
      // 3. 4-Hit Musou Light Combo (works by rapid tap OR holding Attack button!)
      this.faceNearestOrMove(nearestZombiePos, hasMove ? worldMoveX : 0, hasMove ? worldMoveZ : 0, 7.5);
      const step = this.comboStep;
      const isFinisher = step === 3;
      this.attackIsStrong = isFinisher;
      this.attackDuration = spec.comboCadence * (isFinisher ? 1.3 : 1.0);
      this.attackTimer = this.attackDuration;
      this.comboStep = (step + 1) % 4;
      this.comboResetTimer = 0.9;

      const fx = Math.sin(this.yaw);
      const fz = Math.cos(this.yaw);
      this.lungeVel.set(fx * (isFinisher ? 7.5 : 4.5), fz * (isFinisher ? 7.5 : 4.5));

      attackEvent = {
        type: 'light',
        weaponId: spec.id,
        comboStep: step,
        x: this.pos.x + fx * 0.8,
        z: this.pos.z + fz * 0.8,
        yaw: this.yaw,
        damage: spec.damage * (isFinisher ? 1.65 : 1 + step * 0.1) * mods.heroDamage,
        range: spec.range * (isFinisher ? 1.25 : 1.0) * mods.heroRange,
        arcHalfAngle: isFinisher ? Math.PI : spec.arcHalfAngle,
        knockback: spec.knockback * (isFinisher ? 1.75 : 1.0),
        lift: isFinisher ? 6.4 : 2.6,
        burn: spec.id === 'greatsword' && isFinisher,
        fullCircle: isFinisher
      };
    }

    // Apply Movement / Dodge / Lunge
    if (this.dodgeTimer > 0) {
      this.dodgeTimer = Math.max(0, this.dodgeTimer - dt);
      const dashSpd = 21.5;
      this.pos.x += this.dodgeDir.x * dashSpd * dt;
      this.pos.z += this.dodgeDir.y * dashSpd * dt;
    } else {
      const attackSlow = this.attackTimer > 0 ? 0.42 : 1.0;
      if (hasMove) {
        const clampedLen = Math.min(1, moveLen);
        const nx = worldMoveX / moveLen;
        const nz = worldMoveZ / moveLen;
        this.pos.x += nx * spec.moveSpeed * clampedLen * attackSlow * dt;
        this.pos.z += nz * spec.moveSpeed * clampedLen * attackSlow * dt;
        if (this.attackTimer <= 0) {
          const targetYaw = Math.atan2(nx, nz);
          let diff = targetYaw - this.yaw;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          this.yaw += diff * Math.min(1, dt * 16);
        }
      }

      if (this.lungeVel.lengthSq() > 0.05) {
        this.pos.x += this.lungeVel.x * dt;
        this.pos.z += this.lungeVel.y * dt;
        this.lungeVel.multiplyScalar(Math.exp(-10 * dt));
      }
    }

    // Slight HP recovery when falling back close to Shelter
    if (this.pos.z > southWallZ - 3.6 && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + 2.5 * dt);
    }

    // Clamp to Arena
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -arenaHalfW + this.radius, arenaHalfW - this.radius);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -18.5, southWallZ - this.radius - 0.1);

    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.yaw;

    const atkProg = this.attackTimer > 0 ? 1 - this.attackTimer / Math.max(0.01, this.attackDuration) : -1;
    this.rig.animate(
      dt,
      hasMove && this.dodgeTimer <= 0 ? Math.min(1, moveLen) : 0,
      atkProg,
      this.comboStep,
      this.attackIsStrong,
      this.dodgeTimer > 0,
      this.musouGauge >= 100,
      time
    );

    return { attackEvent, dodged };
  }

  private faceNearestOrMove(nearest: THREE.Vector3 | null, mx: number, mz: number, maxAutoDist: number): void {
    if (nearest) {
      const dx = nearest.x - this.pos.x;
      const dz = nearest.z - this.pos.z;
      if (Math.hypot(dx, dz) <= maxAutoDist) {
        this.yaw = Math.atan2(dx, dz);
        return;
      }
    }
    if (Math.hypot(mx, mz) > 0.1) {
      this.yaw = Math.atan2(mx, mz);
    }
  }
}
