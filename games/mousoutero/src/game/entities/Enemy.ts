import * as THREE from 'three';
import type { CollisionSystem } from '../CollisionSystem';
import type { EnemyKind } from '../../types';
import { CharacterRig } from './CharacterMesh';
import type { ClassmateEntity } from './ClassmateManager';
import type { SmokeZone } from '../ParticleSystem';

export interface EnemyCallbacks {
  onMeleePlayer: (enemy: Enemy, damage: number) => void;
  onShootBullet: (
    enemy: Enemy,
    ox: number,
    oy: number,
    oz: number,
    dirX: number,
    dirZ: number,
    speed: number,
    damage: number
  ) => void;
  onAttackClassmate: (enemy: Enemy, classmate: ClassmateEntity, damage: number) => void;
}

let enemyIdCounter = 1;

export class Enemy {
  public readonly id: string;
  public readonly kind: EnemyKind;
  public readonly rig: CharacterRig;
  public readonly pos: THREE.Vector3;
  public yaw = 0;

  public hp: number;
  public readonly maxHp: number;
  public dead = false;
  public removeReady = false;

  public stunTimer = 0;
  public chalkedTimer = 0;
  private knockVx = 0;
  private knockVz = 0;
  private knockVy = 0;

  private attackTimer = 0.8;
  private telegraphTimer = 0;
  private telegraphDirX = 0;
  private telegraphDirZ = -1;
  private bossBurstLeft = 0;
  private bossBurstDelay = 0;
  private bossPhase2Triggered = false;
  private prefersClassmate: boolean;
  private deathTimer = 0;

  private hpBarGroup: THREE.Group;
  private hpFillMesh: THREE.Mesh;
  private aimLine: THREE.Line;

  constructor(
    scene: THREE.Scene,
    kind: EnemyKind,
    spawnPos: THREE.Vector3,
    prefersClassmate = false
  ) {
    this.id = `enemy-${enemyIdCounter++}`;
    this.kind = kind;
    this.pos = spawnPos.clone();
    this.prefersClassmate = prefersClassmate;

    const specs: Record<EnemyKind, { hp: number; scale: number; torso: number; accent: number }> = {
      grunt: { hp: 68, scale: 0.98, torso: 0x242933, accent: 0x3b4252 },
      gunner: { hp: 58, scale: 0.96, torso: 0x2c303a, accent: 0x5c4033 },
      shield: { hp: 115, scale: 1.06, torso: 0x1e2c42, accent: 0x2b4c7e },
      boss: { hp: 520, scale: 1.28, torso: 0x1a1a22, accent: 0x9b111e }
    };

    const s = specs[kind];
    this.hp = s.hp;
    this.maxHp = s.hp;

    this.rig = new CharacterRig({
      skinColor: 0xe6b89c,
      torsoColor: s.torso,
      pantsColor: 0x161920,
      hairColor: 0x111111,
      accentColor: s.accent,
      scale: s.scale,
      role: kind
    });
    this.rig.root.position.copy(this.pos);

    // Floating compact 3D HP bar above enemy
    this.hpBarGroup = new THREE.Group();
    this.hpBarGroup.position.set(0, 1.82 * s.scale, 0);
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.12),
      new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.DoubleSide })
    );
    this.hpFillMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.84, 0.08),
      new THREE.MeshBasicMaterial({
        color: kind === 'boss' ? 0xff1744 : 0xff5252,
        side: THREE.DoubleSide
      })
    );
    this.hpFillMesh.position.z = 0.005;
    this.hpBarGroup.add(bg, this.hpFillMesh);
    this.hpBarGroup.visible = false;
    this.rig.root.add(this.hpBarGroup);

    // Red telegraph laser line for gunners & boss
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 1.05, 0),
      new THREE.Vector3(0, 1.05, 9)
    ]);
    this.aimLine = new THREE.Line(
      lineGeo,
      new THREE.LineBasicMaterial({ color: 0xff1744, transparent: true, opacity: 0.85 })
    );
    this.aimLine.visible = false;
    scene.add(this.aimLine);

    scene.add(this.rig.root);
  }

  applyHit(opts: {
    damage: number;
    knockX: number;
    knockZ: number;
    knockForce: number;
    stunSeconds?: number;
    chalked?: boolean;
    bypassShield?: boolean;
  }): { actualDamage: number; blockedByShield: boolean; killed: boolean; bossPhase2: boolean } {
    if (this.dead) {
      return { actualDamage: 0, blockedByShield: false, killed: false, bossPhase2: false };
    }

    let dmg = opts.damage;
    let blockedByShield = false;

    // Shield reduces frontal non-bypass damage when not stunned
    if (this.kind === 'shield' && !opts.bypassShield && this.stunTimer <= 0) {
      const fwdX = Math.sin(this.yaw);
      const fwdZ = Math.cos(this.yaw);
      const dot = fwdX * opts.knockX + fwdZ * opts.knockZ;
      if (dot < -0.25) {
        blockedByShield = true;
        dmg = Math.max(8, Math.round(dmg * 0.4));
      }
    }

    this.hp = Math.max(0, this.hp - dmg);
    const forceScale = blockedByShield ? 0.35 : this.kind === 'boss' ? 0.45 : 1.0;
    this.knockVx = opts.knockX * opts.knockForce * forceScale;
    this.knockVz = opts.knockZ * opts.knockForce * forceScale;

    if (opts.stunSeconds && opts.stunSeconds > 0 && !blockedByShield) {
      this.stunTimer = Math.max(this.stunTimer, this.kind === 'boss' ? opts.stunSeconds * 0.55 : opts.stunSeconds);
      this.telegraphTimer = 0;
      this.aimLine.visible = false;
    }

    if (opts.chalked) {
      this.chalkedTimer = 5.0;
      this.rig.setChalked(true);
    }

    // Update HP bar
    if (this.kind !== 'boss') {
      this.hpBarGroup.visible = this.hp < this.maxHp && this.hp > 0;
      const ratio = Math.max(0.01, this.hp / this.maxHp);
      this.hpFillMesh.scale.x = ratio;
      this.hpFillMesh.position.x = -(1 - ratio) * 0.42;
    }

    let bossPhase2 = false;
    if (this.kind === 'boss' && !this.bossPhase2Triggered && this.hp > 0 && this.hp <= this.maxHp * 0.5) {
      this.bossPhase2Triggered = true;
      bossPhase2 = true;
    }

    if (this.hp <= 0) {
      this.dead = true;
      this.deathTimer = 0.72;
      this.knockVx = opts.knockX * Math.max(10, opts.knockForce * 1.15);
      this.knockVz = opts.knockZ * Math.max(10, opts.knockForce * 1.15);
      this.knockVy = 5.8;
      this.aimLine.visible = false;
      this.hpBarGroup.visible = false;
      return { actualDamage: dmg, blockedByShield, killed: true, bossPhase2: false };
    }

    return { actualDamage: dmg, blockedByShield, killed: false, bossPhase2 };
  }

  isTelegraphingNear(x: number, z: number, dist: number): boolean {
    if (this.dead || this.stunTimer > 0) return false;
    if (this.telegraphTimer > 0 && this.telegraphTimer < 0.35) {
      return Math.hypot(this.pos.x - x, this.pos.z - z) < dist + 6;
    }
    return this.attackTimer < 0.25 && Math.hypot(this.pos.x - x, this.pos.z - z) < dist;
  }

  update(
    dt: number,
    playerPos: THREE.Vector3,
    targetClassmate: ClassmateEntity | null,
    smokeZones: readonly SmokeZone[],
    collision: CollisionSystem,
    cameraPos: THREE.Vector3,
    callbacks: EnemyCallbacks
  ): void {
    if (this.dead) {
      this.deathTimer -= dt;
      this.knockVy -= 18 * dt;
      this.pos.x += this.knockVx * dt;
      this.pos.y = Math.max(0, this.pos.y + this.knockVy * dt);
      this.pos.z += this.knockVz * dt;
      this.rig.root.position.copy(this.pos);
      this.rig.bodyPivot.rotation.x -= dt * 9.5;
      this.rig.bodyPivot.rotation.z += dt * 5.2;
      if (this.deathTimer <= 0) {
        this.removeReady = true;
      }
      return;
    }

    // Billboard HP bar toward camera
    if (this.hpBarGroup.visible) {
      this.hpBarGroup.lookAt(cameraPos);
    }

    // Chalk visual expiry
    if (this.chalkedTimer > 0) {
      this.chalkedTimer -= dt;
      if (this.chalkedTimer <= 0) {
        this.rig.setChalked(false);
      }
    }

    // Smoke zone coughing stun!
    for (const zone of smokeZones) {
      if (Math.hypot(this.pos.x - zone.x, this.pos.z - zone.z) < zone.radius) {
        this.stunTimer = Math.max(this.stunTimer, 1.35);
        this.telegraphTimer = 0;
        this.aimLine.visible = false;
        break;
      }
    }

    // Knockback physics
    let moveVx = this.knockVx;
    let moveVz = this.knockVz;
    const damp = Math.exp(-8.5 * dt);
    this.knockVx *= damp;
    this.knockVz *= damp;

    if (this.stunTimer > 0) {
      this.stunTimer = Math.max(0, this.stunTimer - dt);
      this.rig.setStunned(true, dt);
      this.rig.bodyPivot.rotation.z = Math.sin(performance.now() * 0.025) * 0.22;
      this.aimLine.visible = false;
    } else {
      this.rig.setStunned(false, dt);
      this.attackTimer = Math.max(0, this.attackTimer - dt);

      // Decide target: either threatened classmate or player
      const distToPlayer = Math.hypot(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
      const chaseClassmate =
        this.prefersClassmate &&
        targetClassmate !== null &&
        !targetClassmate.fainted &&
        distToPlayer > 3.6;

      const targetX = chaseClassmate ? targetClassmate!.pos.x : playerPos.x;
      const targetZ = chaseClassmate ? targetClassmate!.pos.z : playerPos.z;
      const dx = targetX - this.pos.x;
      const dz = targetZ - this.pos.z;
      const dist = Math.hypot(dx, dz) || 0.001;
      const dirX = dx / dist;
      const dirZ = dz / dist;

      this.yaw = Math.atan2(dirX, dirZ);

      if (this.kind === 'gunner' || this.kind === 'boss') {
        this.updateRangedAI(
          dt,
          dist,
          dirX,
          dirZ,
          collision,
          callbacks,
          (vx, vz) => {
            moveVx += vx;
            moveVz += vz;
          }
        );
      } else {
        // Melee AI (Grunt & Shield)
        const speed = this.kind === 'shield' ? 2.85 : 3.75;
        if (dist > 1.35) {
          moveVx += dirX * speed;
          moveVz += dirZ * speed;
          this.rig.animateIdleOrWalk(dt, speed);
        } else {
          this.rig.animateIdleOrWalk(dt, 0);
          if (this.attackTimer <= 0) {
            this.attackTimer = this.kind === 'shield' ? 1.55 : 1.25;
            this.rig.rightArmPivot.rotation.x = -1.9;
            if (chaseClassmate && targetClassmate) {
              callbacks.onAttackClassmate(this, targetClassmate, 9);
            } else {
              callbacks.onMeleePlayer(this, this.kind === 'shield' ? 14 : 11);
            }
          }
        }
      }
    }

    const resolved = collision.resolveCircleAABB(
      this.pos.x + moveVx * dt,
      this.pos.z + moveVz * dt,
      this.kind === 'boss' ? 0.56 : 0.42
    );
    this.pos.set(resolved.x, 0, resolved.z);
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.yaw;
  }

  private updateRangedAI(
    dt: number,
    dist: number,
    dirX: number,
    dirZ: number,
    collision: CollisionSystem,
    callbacks: EnemyCallbacks,
    addMove: (vx: number, vz: number) => void
  ): void {
    const isBoss = this.kind === 'boss';
    const preferredDist = isBoss ? 6.4 : 5.8;
    const speed = isBoss ? (this.bossPhase2Triggered ? 4.2 : 3.4) : 3.0;

    // Boss 3-round burst execution
    if (this.bossBurstLeft > 0) {
      this.bossBurstDelay -= dt;
      if (this.bossBurstDelay <= 0) {
        this.bossBurstLeft--;
        this.bossBurstDelay = 0.14;
        const spread = (Math.random() - 0.5) * 0.12;
        const c = Math.cos(spread);
        const s = Math.sin(spread);
        const rx = this.telegraphDirX * c - this.telegraphDirZ * s;
        const rz = this.telegraphDirX * s + this.telegraphDirZ * c;
        callbacks.onShootBullet(
          this,
          this.pos.x + rx * 0.7,
          1.12,
          this.pos.z + rz * 0.7,
          rx,
          rz,
          15.5,
          15
        );
      }
    }

    if (this.telegraphTimer > 0) {
      this.telegraphTimer -= dt;
      this.rig.animateIdleOrWalk(dt, 0);
      this.rig.rightArmPivot.rotation.x = -1.5;

      // Update laser sight line
      const hit = collision.raycast(
        this.pos.x,
        1.1,
        this.pos.z,
        this.telegraphDirX,
        0,
        this.telegraphDirZ,
        14,
        'bullet'
      );
      const len = hit.hit ? hit.distance : 14;
      const posAttr = this.aimLine.geometry.getAttribute('position') as THREE.BufferAttribute;
      posAttr.setXYZ(0, this.pos.x, 1.1, this.pos.z);
      posAttr.setXYZ(
        1,
        this.pos.x + this.telegraphDirX * len,
        1.1,
        this.pos.z + this.telegraphDirZ * len
      );
      posAttr.needsUpdate = true;
      this.aimLine.visible = true;

      if (this.telegraphTimer <= 0) {
        this.aimLine.visible = false;
        if (isBoss) {
          this.bossBurstLeft = this.bossPhase2Triggered ? 4 : 3;
          this.bossBurstDelay = 0;
          this.attackTimer = this.bossPhase2Triggered ? 1.55 : 2.1;
        } else {
          callbacks.onShootBullet(
            this,
            this.pos.x + this.telegraphDirX * 0.6,
            1.05,
            this.pos.z + this.telegraphDirZ * 0.6,
            this.telegraphDirX,
            this.telegraphDirZ,
            12.8,
            12
          );
          this.attackTimer = 2.2;
        }
      }
      return;
    }

    this.aimLine.visible = false;

    if (dist > preferredDist + 1.2) {
      addMove(dirX * speed, dirZ * speed);
      this.rig.animateIdleOrWalk(dt, speed);
    } else if (dist < 2.2 && !isBoss) {
      addMove(-dirX * speed * 0.7, -dirZ * speed * 0.7);
      this.rig.animateIdleOrWalk(dt, speed * 0.7);
    } else {
      // Strafe slightly
      addMove(-dirZ * speed * 0.45, dirX * speed * 0.45);
      this.rig.animateIdleOrWalk(dt, speed * 0.5);
    }

    if (isBoss && dist < 1.85 && this.attackTimer <= 0) {
      this.attackTimer = 1.1;
      callbacks.onMeleePlayer(this, 18);
      return;
    }

    if (this.attackTimer <= 0 && dist < 13) {
      this.telegraphDirX = dirX;
      this.telegraphDirZ = dirZ;
      this.telegraphTimer = isBoss ? 0.65 : 0.78;
    }
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.rig.root);
    scene.remove(this.aimLine);
  }
}
