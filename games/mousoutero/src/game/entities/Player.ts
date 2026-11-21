import * as THREE from 'three';
import type { CollisionSystem } from '../CollisionSystem';
import type { WeaponType } from '../../types';
import { WEAPON_SPECS } from '../../types';
import { CharacterRig } from './CharacterMesh';

export interface PlayerAttackEvent {
  type: 'melee' | 'special';
  weapon: WeaponType;
  comboStep: number;
  origin: THREE.Vector3;
  dirX: number;
  dirZ: number;
  damage: number;
  range: number;
  arc: number;
  knockback: number;
  awakened: boolean;
}

export class Player {
  public readonly rig: CharacterRig;
  public readonly pos = new THREE.Vector3(-3.8, 0, 0.85);
  public yaw = Math.PI; // Facing blackboard initially

  public hp = 160;
  public readonly maxHp = 160;
  public delusionGauge = 0; // 0..100
  public awakened = false;
  public awakenedTimer = 0;

  public weapon: WeaponType = 'fist';
  public weaponDurability = 0;
  public weaponMaxDurability = 0;

  public attackCooldown = 0;
  public specialCooldown = 0;
  public dodgeCooldown = 0;

  private attackAnimTimer = 0;
  private attackAnimDuration = 0.24;
  private comboStep = 0;
  private comboResetTimer = 0;

  private spinAnimTimer = 0;
  private dodgeTimer = 0;
  private dodgeDuration = 0.36;
  private dodgeDirX = 0;
  private dodgeDirZ = -1;
  private lungeVx = 0;
  private lungeVz = 0;
  private invulnTimer = 0;
  private parryWindowTimer = 0;

  private auraRing: THREE.Mesh;

  constructor(scene: THREE.Scene) {
    this.rig = new CharacterRig({
      skinColor: 0xf7ceb0,
      torsoColor: 0x1d293f, // Classic school blazer / gakuran dark navy
      pantsColor: 0x182030,
      hairColor: 0x18181f,
      accentColor: 0xe63946, // Protagonist crimson tie!
      scale: 1.02,
      role: 'hero'
    });

    // Subtle ground indicator ring so player is always crystal clear on mobile screens
    this.auraRing = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.56, 20),
      new THREE.MeshBasicMaterial({
        color: 0x2ee6ff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.6
      })
    );
    this.auraRing.rotation.x = -Math.PI / 2;
    this.auraRing.position.y = 0.03;
    this.rig.root.add(this.auraRing);

    scene.add(this.rig.root);
    this.resetForIntro();
  }

  resetForIntro(): void {
    this.hp = this.maxHp;
    this.delusionGauge = 20; // Start with a little hype!
    this.awakened = false;
    this.awakenedTimer = 0;
    this.equipWeapon('fist');
    this.attackCooldown = 0;
    this.specialCooldown = 0;
    this.dodgeCooldown = 0;
    this.attackAnimTimer = 0;
    this.spinAnimTimer = 0;
    this.dodgeTimer = 0;
    this.invulnTimer = 0;
    this.parryWindowTimer = 0;
    this.comboStep = 0;
    this.lungeVx = 0;
    this.lungeVz = 0;

    // Window seat (2nd row from back)
    this.pos.set(-3.8, 0, 0.85);
    this.yaw = Math.PI;
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.yaw;
    this.rig.resetPose();
    this.auraRing.visible = false;
  }

  startBattlePose(): void {
    this.pos.set(-3.8, 0, 1.35);
    this.yaw = Math.PI * 0.35; // Facing front doors!
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.yaw;
    this.rig.resetPose();
    this.auraRing.visible = true;
  }

  equipWeapon(type: WeaponType): void {
    this.weapon = type;
    const spec = WEAPON_SPECS[type];
    this.weaponMaxDurability = spec.maxDurability;
    this.weaponDurability = spec.maxDurability;
    this.rig.setHeroWeapon(type);
  }

  consumeDurability(cost = 1): boolean {
    if (this.weapon === 'fist' || this.weaponMaxDurability === 0) return false;
    this.weaponDurability = Math.max(0, this.weaponDurability - cost);
    if (this.weaponDurability <= 0) {
      this.equipWeapon('fist');
      return true; // weapon broke -> back to fists
    }
    return false;
  }

  addDelusion(amount: number): void {
    if (this.awakened) return;
    this.delusionGauge = Math.min(100, this.delusionGauge + amount);
  }

  heal(amount: number): void {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  isInvulnerable(): boolean {
    return this.invulnTimer > 0 || this.dodgeTimer > 0;
  }

  isDodging(): boolean {
    return this.dodgeTimer > 0;
  }

  isParryWindowActive(): boolean {
    return this.parryWindowTimer > 0;
  }

  canAwaken(): boolean {
    return !this.awakened && this.delusionGauge >= 100;
  }

  activateAwakening(): boolean {
    if (!this.canAwaken()) return false;
    this.awakened = true;
    this.awakenedTimer = 8.5;
    this.delusionGauge = 100;
    this.invulnTimer = 0.8;
    this.heal(35);
    return true;
  }

  tryAttack(autoTargetPos: THREE.Vector3 | null): PlayerAttackEvent | null {
    if (this.attackCooldown > 0 || this.dodgeTimer > 0) return null;

    const spec = WEAPON_SPECS[this.weapon];
    this.comboStep = this.comboResetTimer > 0 ? (this.comboStep % 3) + 1 : 1;
    this.comboResetTimer = 0.95;

    const speedMult = this.awakened ? 0.78 : 1;
    this.attackCooldown = spec.attackCooldown * speedMult;
    this.attackAnimDuration = Math.max(0.18, this.attackCooldown * 0.92);
    this.attackAnimTimer = this.attackAnimDuration;

    // Auto-face nearest enemy for ultra-satisfying mobile action feel
    if (autoTargetPos) {
      const dx = autoTargetPos.x - this.pos.x;
      const dz = autoTargetPos.z - this.pos.z;
      if (Math.hypot(dx, dz) > 0.15) {
        this.yaw = Math.atan2(dx, dz);
      }
    }

    const dirX = Math.sin(this.yaw);
    const dirZ = Math.cos(this.yaw);

    // Subtle forward lunge on each swing
    const lungeSpd = this.comboStep === 3 ? 6.8 : 4.2;
    this.lungeVx = dirX * lungeSpd;
    this.lungeVz = dirZ * lungeSpd;

    const dmgMult = (this.comboStep === 3 ? 1.45 : 1.0) * (this.awakened ? 1.65 : 1.0);

    return {
      type: 'melee',
      weapon: this.weapon,
      comboStep: this.comboStep,
      origin: this.pos.clone(),
      dirX,
      dirZ,
      damage: Math.round(spec.attackDamage * dmgMult),
      range: spec.attackRange * (this.awakened ? 1.18 : 1),
      arc: spec.attackArc,
      knockback: spec.knockback * (this.comboStep === 3 ? 1.45 : 1),
      awakened: this.awakened
    };
  }

  trySpecial(autoTargetPos: THREE.Vector3 | null): PlayerAttackEvent | null {
    if (this.specialCooldown > 0 || this.dodgeTimer > 0) return null;

    const spec = WEAPON_SPECS[this.weapon];
    this.specialCooldown = spec.specialCooldown * (this.awakened ? 0.65 : 1);

    if (autoTargetPos) {
      const dx = autoTargetPos.x - this.pos.x;
      const dz = autoTargetPos.z - this.pos.z;
      if (Math.hypot(dx, dz) > 0.15) {
        this.yaw = Math.atan2(dx, dz);
      }
    }

    const dirX = Math.sin(this.yaw);
    const dirZ = Math.cos(this.yaw);

    if (this.weapon === 'mop') {
      this.spinAnimTimer = 0.48;
      this.lungeVx = dirX * 3.5;
      this.lungeVz = dirZ * 3.5;
    } else if (this.weapon === 'shinai') {
      this.attackAnimDuration = 0.3;
      this.attackAnimTimer = 0.3;
      this.parryWindowTimer = 0.45; // Reflects bullets!
      this.lungeVx = dirX * 14.0;
      this.lungeVz = dirZ * 14.0;
    } else if (this.weapon === 'fist') {
      this.attackAnimDuration = 0.3;
      this.attackAnimTimer = 0.3;
      this.lungeVx = dirX * 13.0;
      this.lungeVz = dirZ * 13.0;
    } else {
      this.attackAnimDuration = 0.28;
      this.attackAnimTimer = 0.28;
    }

    return {
      type: 'special',
      weapon: this.weapon,
      comboStep: 3,
      origin: this.pos.clone(),
      dirX,
      dirZ,
      damage: Math.round(spec.specialDamage * (this.awakened ? 1.5 : 1)),
      range: this.weapon === 'mop' ? 4.2 : this.weapon === 'shinai' ? 4.3 : 3.6,
      arc: this.weapon === 'mop' ? Math.PI : Math.PI * 0.55,
      knockback: 16,
      awakened: this.awakened
    };
  }

  tryDodge(moveDirX: number, moveDirZ: number): boolean {
    if (this.dodgeCooldown > 0 || this.dodgeTimer > 0) return false;
    this.dodgeCooldown = 0.9;
    this.dodgeTimer = this.dodgeDuration;
    this.invulnTimer = this.dodgeDuration + 0.08;

    const len = Math.hypot(moveDirX, moveDirZ);
    if (len > 0.1) {
      this.dodgeDirX = moveDirX / len;
      this.dodgeDirZ = moveDirZ / len;
      this.yaw = Math.atan2(this.dodgeDirX, this.dodgeDirZ);
    } else {
      this.dodgeDirX = Math.sin(this.yaw);
      this.dodgeDirZ = Math.cos(this.yaw);
    }
    return true;
  }

  takeDamage(amount: number): { tookDamage: boolean; dead: boolean } {
    if (this.isInvulnerable()) {
      return { tookDamage: false, dead: false };
    }
    const reduced = this.awakened ? Math.round(amount * 0.45) : amount;
    this.hp = Math.max(0, this.hp - reduced);
    this.invulnTimer = 0.55;
    return { tookDamage: true, dead: this.hp <= 0 };
  }

  update(
    dt: number,
    moveWorldX: number,
    moveWorldZ: number,
    sprinting: boolean,
    collision: CollisionSystem
  ): void {
    if (this.attackCooldown > 0) this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    if (this.specialCooldown > 0) this.specialCooldown = Math.max(0, this.specialCooldown - dt);
    if (this.dodgeCooldown > 0) this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    if (this.comboResetTimer > 0) this.comboResetTimer = Math.max(0, this.comboResetTimer - dt);
    if (this.invulnTimer > 0) this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    if (this.parryWindowTimer > 0) this.parryWindowTimer = Math.max(0, this.parryWindowTimer - dt);

    if (this.awakened) {
      this.awakenedTimer -= dt;
      this.delusionGauge = Math.max(0, (this.awakenedTimer / 8.5) * 100);
      if (this.awakenedTimer <= 0) {
        this.awakened = false;
        this.delusionGauge = 0;
      }
    }

    let vx = 0;
    let vz = 0;
    const baseSpeed = (sprinting ? 7.6 : 5.8) * (this.awakened ? 1.28 : 1);

    if (this.dodgeTimer > 0) {
      this.dodgeTimer = Math.max(0, this.dodgeTimer - dt);
      vx = this.dodgeDirX * 13.0;
      vz = this.dodgeDirZ * 13.0;
      const progress = 1 - this.dodgeTimer / this.dodgeDuration;
      this.rig.animateDodgeRoll(progress);
    } else {
      const moveLen = Math.hypot(moveWorldX, moveWorldZ);
      if (moveLen > 0.05) {
        const clamped = Math.min(1, moveLen);
        vx = (moveWorldX / moveLen) * baseSpeed * clamped;
        vz = (moveWorldZ / moveLen) * baseSpeed * clamped;
        if (this.attackAnimTimer <= 0 && this.spinAnimTimer <= 0) {
          const targetYaw = Math.atan2(vx, vz);
          this.yaw = lerpAngle(this.yaw, targetYaw, Math.min(1, dt * 16));
        }
      }

      // Add melee lunge velocity
      vx += this.lungeVx;
      vz += this.lungeVz;
      const damp = Math.exp(-12 * dt);
      this.lungeVx *= damp;
      this.lungeVz *= damp;

      if (this.spinAnimTimer > 0) {
        this.spinAnimTimer = Math.max(0, this.spinAnimTimer - dt);
        this.rig.animateSpin(dt);
      } else if (this.attackAnimTimer > 0) {
        this.attackAnimTimer = Math.max(0, this.attackAnimTimer - dt);
        const p = 1 - this.attackAnimTimer / this.attackAnimDuration;
        this.rig.animateAttackSwing(p, this.comboStep);
      } else {
        this.rig.bodyPivot.rotation.y = THREE.MathUtils.lerp(
          this.rig.bodyPivot.rotation.y,
          0,
          Math.min(1, dt * 14)
        );
        this.rig.animateIdleOrWalk(dt, Math.hypot(vx, vz));
      }
    }

    const nextX = this.pos.x + vx * dt;
    const nextZ = this.pos.z + vz * dt;
    const resolved = collision.resolveCircleAABB(nextX, nextZ, 0.42);
    this.pos.set(resolved.x, 0, resolved.z);

    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.yaw;

    // Aura ring visual feedback
    const ringMat = this.auraRing.material as THREE.MeshBasicMaterial;
    if (this.awakened) {
      ringMat.color.setHex(0xffd43b);
      ringMat.opacity = 0.9;
      this.auraRing.scale.setScalar(1.2 + Math.sin(performance.now() * 0.015) * 0.14);
    } else if (this.parryWindowTimer > 0) {
      ringMat.color.setHex(0xffffff);
      ringMat.opacity = 0.95;
      this.auraRing.scale.setScalar(1.35);
    } else {
      ringMat.color.setHex(0x2ee6ff);
      ringMat.opacity = 0.55;
      this.auraRing.scale.setScalar(1.0);
    }
  }

  getSpecialCooldownRatio(): number {
    const maxCd = WEAPON_SPECS[this.weapon].specialCooldown;
    return maxCd > 0 ? Math.min(1, this.specialCooldown / maxCd) : 0;
  }

  getDodgeCooldownRatio(): number {
    return Math.min(1, this.dodgeCooldown / 0.9);
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}
