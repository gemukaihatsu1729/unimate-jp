import * as THREE from 'three';
import { TURRETS, type RunMods, type TurretId } from '../data';
import type { PadLocation } from '../world/BattlefieldBuilder';
import type { ZombieEntity } from './Zombie';
import type { EffectsManager } from '../fx/EffectsManager';
import type { AudioManager } from '../audio/AudioManager';

export interface BuiltTurret {
  typeId: TurretId;
  level: 1 | 2 | 3;
  totalInvested: number;
  cooldown: number;
  yaw: number;
  root: THREE.Group;
  headPivot: THREE.Group;
  starGroup: THREE.Group;
}

export interface DefensePad {
  index: number;
  x: number;
  z: number;
  baseGroup: THREE.Group;
  ringMesh: THREE.Mesh;
  hitMesh: THREE.Mesh;
  turret: BuiltTurret | null;
}

interface TurretProjectile {
  mesh: THREE.Mesh;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  speed: number;
  damage: number;
  splash: number;
  isMissile: boolean;
  target: ZombieEntity | null;
  life: number;
}

function flatMat(color: number, roughness = 0.65, metalness = 0.25, emissive = 0x000000, emissiveIntensity = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness, metalness, emissive, emissiveIntensity });
}

export class TurretManager {
  public readonly pads: DefensePad[] = [];
  private projectiles: TurretProjectile[] = [];
  private rangePreview: THREE.Mesh;
  private bulletGeo = new THREE.BoxGeometry(0.14, 0.14, 0.65);
  private missileGeo = new THREE.ConeGeometry(0.18, 0.72, 5);

  constructor(private scene: THREE.Scene, locations: PadLocation[]) {
    this.missileGeo.rotateX(Math.PI / 2);

    // Range preview circle when a pad is selected
    this.rangePreview = new THREE.Mesh(
      new THREE.RingGeometry(0.94, 1.0, 40),
      new THREE.MeshBasicMaterial({
        color: 0xfde047,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.65
      })
    );
    this.rangePreview.rotation.x = -Math.PI / 2;
    this.rangePreview.position.y = 0.18;
    this.rangePreview.visible = false;
    this.scene.add(this.rangePreview);

    for (const loc of locations) {
      const baseGroup = new THREE.Group();
      baseGroup.position.set(loc.x, 0, loc.z);

      // Raised octagonal steel bastion pedestal
      const ped = new THREE.Mesh(
        new THREE.CylinderGeometry(1.18, 1.38, 0.34, 8),
        flatMat(0x283548, 0.7, 0.35)
      );
      ped.position.y = 0.17;
      ped.receiveShadow = true;
      ped.castShadow = true;
      baseGroup.add(ped);

      // Glowing beacon ring on top of pad
      const ringMesh = new THREE.Mesh(
        new THREE.RingGeometry(0.75, 1.04, 8),
        new THREE.MeshBasicMaterial({
          color: 0xfbbf24,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.65
        })
      );
      ringMesh.rotation.x = -Math.PI / 2;
      ringMesh.position.y = 0.36;
      baseGroup.add(ringMesh);

      // Generous invisible touch raycast collider for smartphone tapping
      const hitMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(2.25, 2.25, 2.6, 8),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hitMesh.position.y = 1.0;
      hitMesh.userData.padIndex = loc.index;
      baseGroup.add(hitMesh);

      this.scene.add(baseGroup);
      this.pads.push({
        index: loc.index,
        x: loc.x,
        z: loc.z,
        baseGroup,
        ringMesh,
        hitMesh,
        turret: null
      });
    }
  }

  getRaycastMeshes(): THREE.Object3D[] {
    return this.pads.map((p) => p.hitMesh);
  }

  findNearestPad(x: number, z: number, maxDist: number): DefensePad | null {
    let best: DefensePad | null = null;
    let bestD = maxDist;
    for (const p of this.pads) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  setSelectedPad(index: number | null, previewTurretId: TurretId): void {
    if (index === null) {
      this.rangePreview.visible = false;
      return;
    }
    const pad = this.pads[index];
    if (!pad) return;
    const range = pad.turret
      ? TURRETS[pad.turret.typeId].levels[pad.turret.level - 1].range
      : TURRETS[previewTurretId].levels[0].range;

    this.rangePreview.position.set(pad.x, 0.18, pad.z);
    this.rangePreview.scale.setScalar(range);
    this.rangePreview.visible = true;
  }

  buildTurret(padIndex: number, typeId: TurretId): void {
    const pad = this.pads[padIndex];
    if (!pad) return;
    this.removeTurret(padIndex);

    const spec = TURRETS[typeId];
    const root = new THREE.Group();
    root.position.set(0, 0.34, 0);

    // Lower support column
    const baseCol = new THREE.Mesh(
      new THREE.CylinderGeometry(0.48, 0.68, 0.65, 8),
      flatMat(0x1e293b, 0.6, 0.45)
    );
    baseCol.position.y = 0.32;
    baseCol.castShadow = true;
    root.add(baseCol);

    const headPivot = new THREE.Group();
    headPivot.position.y = 0.85;
    root.add(headPivot);

    if (typeId === 'sentry') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.52, 0.85), flatMat(spec.color, 0.55, 0.4));
      body.castShadow = true;
      headPivot.add(body);
      const barrelMat = flatMat(0xcbd5e1, 0.4, 0.65);
      for (const side of [-0.18, 0.18]) {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.15, 6), barrelMat);
        b.rotation.x = Math.PI / 2;
        b.position.set(side, 0.04, 0.72);
        headPivot.add(b);
      }
    } else if (typeId === 'flame') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.58, 0.82), flatMat(0x7c2d12, 0.6, 0.3));
      body.castShadow = true;
      headPivot.add(body);
      const tankMat = flatMat(0xf97316, 0.4, 0.2, 0xea580c, 0.35);
      for (const side of [-0.46, 0.46]) {
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.72, 7), tankMat);
        tank.rotation.x = Math.PI / 2;
        tank.position.set(side, 0, -0.05);
        headPivot.add(tank);
      }
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.15, 0.85, 6), flatMat(0xe2e8f0, 0.4, 0.6));
      nozzle.rotation.x = Math.PI / 2;
      nozzle.position.set(0, 0, 0.68);
      headPivot.add(nozzle);
    } else if (typeId === 'tesla') {
      const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.32, 1.2, 7), flatMat(0x1e3a5f, 0.4, 0.5));
      spire.position.y = 0.4;
      spire.castShadow = true;
      headPivot.add(spire);
      for (const ry of [0.25, 0.6, 0.92]) {
        const coil = new THREE.Mesh(new THREE.TorusGeometry(0.36 - ry * 0.12, 0.06, 5, 10), flatMat(0x38bdf8, 0.3, 0.6, 0x0284c7, 0.6));
        coil.rotation.x = Math.PI / 2;
        coil.position.y = ry;
        headPivot.add(coil);
      }
      const orb = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.34, 0),
        flatMat(0xe0f2fe, 0.15, 0.2, 0x38bdf8, 1.35)
      );
      orb.position.y = 1.25;
      headPivot.add(orb);
    } else {
      // Missile Quad Pod
      const pod = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.78, 0.9), flatMat(0x334155, 0.55, 0.45));
      pod.castShadow = true;
      headPivot.add(pod);
      const tipMat = flatMat(0xef4444, 0.35, 0.3, 0xdc2626, 0.6);
      for (const ox of [-0.24, 0.24]) {
        for (const oy of [-0.18, 0.18]) {
          const cap = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.32, 5), tipMat);
          cap.rotation.x = Math.PI / 2;
          cap.position.set(ox, oy, 0.55);
          headPivot.add(cap);
        }
      }
    }

    const starGroup = new THREE.Group();
    starGroup.position.y = 0.12;
    root.add(starGroup);

    pad.baseGroup.add(root);
    pad.turret = {
      typeId,
      level: 1,
      totalInvested: spec.cost,
      cooldown: 0.15,
      yaw: Math.PI,
      root,
      headPivot,
      starGroup
    };
    this.rebuildStars(pad.turret);
  }

  upgradeTurret(padIndex: number, cost: number): void {
    const pad = this.pads[padIndex];
    if (!pad || !pad.turret || pad.turret.level >= 3) return;
    pad.turret.level = (pad.turret.level + 1) as 1 | 2 | 3;
    pad.turret.totalInvested += cost;
    pad.turret.root.scale.setScalar(1 + (pad.turret.level - 1) * 0.12);
    this.rebuildStars(pad.turret);
  }

  removeTurret(padIndex: number): void {
    const pad = this.pads[padIndex];
    if (!pad || !pad.turret) return;
    pad.baseGroup.remove(pad.turret.root);
    pad.turret = null;
  }

  private rebuildStars(tr: BuiltTurret): void {
    while (tr.starGroup.children.length > 0) {
      tr.starGroup.remove(tr.starGroup.children[0]);
    }
    const mat = flatMat(0xfde047, 0.2, 0.3, 0xfbbf24, 1.0);
    for (let i = 0; i < tr.level; i++) {
      const pip = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), mat);
      const ang = (i / tr.level) * Math.PI * 2;
      pip.position.set(Math.cos(ang) * 0.92, 0.1, Math.sin(ang) * 0.92);
      tr.starGroup.add(pip);
    }
  }

  update(
    dt: number,
    time: number,
    scrap: number,
    selectedPadIdx: number | null,
    zombies: ZombieEntity[],
    mods: RunMods,
    fx: EffectsManager,
    audio: AudioManager,
    onDamageZombie: (z: ZombieEntity, dmg: number, color: number, knockForce?: number, kx?: number, kz?: number) => void
  ): void {
    const pulse = 0.5 + 0.5 * Math.sin(time * 5.2);
    const canBuildAny = scrap >= TURRETS.sentry.cost;

    for (const pad of this.pads) {
      const ringMat = pad.ringMesh.material as THREE.MeshBasicMaterial;
      if (selectedPadIdx === pad.index) {
        ringMat.color.setHex(0xffffff);
        ringMat.opacity = 0.95;
      } else if (!pad.turret) {
        ringMat.color.setHex(canBuildAny ? 0xfde047 : 0x64748b);
        ringMat.opacity = canBuildAny ? 0.45 + pulse * 0.45 : 0.28;
      } else {
        ringMat.color.setHex(TURRETS[pad.turret.typeId].accent);
        ringMat.opacity = 0.55;
      }

      const tr = pad.turret;
      if (!tr) continue;

      tr.starGroup.rotation.y += dt * 1.8;
      if (tr.cooldown > 0) tr.cooldown -= dt;

      const spec = TURRETS[tr.typeId];
      const st = spec.levels[tr.level - 1];

      // Target zombie closest to Shelter inside range
      let target: ZombieEntity | null = null;
      let bestScore = -999;
      for (const z of zombies) {
        if (z.dead) continue;
        const d = Math.hypot(z.pos.x - pad.x, z.pos.z - pad.z);
        if (d <= st.range + z.spec.radius) {
          const score = z.pos.z + (z.spec.isBoss ? 5 : 0);
          if (score > bestScore) {
            bestScore = score;
            target = z;
          }
        }
      }

      if (!target) continue;

      const desiredYaw = Math.atan2(target.pos.x - pad.x, target.pos.z - pad.z);
      if (tr.typeId !== 'tesla') {
        tr.headPivot.rotation.y = desiredYaw;
      }
      tr.yaw = desiredYaw;

      if (tr.cooldown > 0) continue;
      tr.cooldown = 1 / (st.fireRate * mods.turretRate);
      const dmg = st.damage * mods.turretDamage;

      if (tr.typeId === 'sentry') {
        audio.playTurret('sentry');
        const dx = Math.sin(desiredYaw);
        const dz = Math.cos(desiredYaw);
        this.spawnProjectile(pad.x + dx * 0.9, 1.2, pad.z + dz * 0.9, dx, dz, 34, dmg, 0, false, null);
      } else if (tr.typeId === 'flame') {
        audio.playTurret('flame');
        const dx = Math.sin(desiredYaw);
        const dz = Math.cos(desiredYaw);
        fx.spawnFlameJet(pad.x + dx * 0.95, 1.15, pad.z + dz * 0.95, dx, dz);
        // Burn all zombies in forward cone
        for (const z of zombies) {
          if (z.dead) continue;
          const vx = z.pos.x - pad.x;
          const vz = z.pos.z - pad.z;
          const d = Math.hypot(vx, vz);
          if (d <= st.range + z.spec.radius && d > 0.01) {
            const dot = (vx / d) * dx + (vz / d) * dz;
            if (dot >= 0.72) {
              z.burnTimer = Math.max(z.burnTimer, 3.0);
              z.burnDps = Math.max(z.burnDps, (st.burnDps ?? 18) * mods.turretDamage);
              onDamageZombie(z, dmg, 0xf97316);
            }
          }
        }
      } else if (tr.typeId === 'tesla') {
        audio.playTurret('tesla');
        const chains = st.chains ?? 3;
        const hitList: ZombieEntity[] = [target];
        const visited = new Set<ZombieEntity>([target]);
        let curr = target;
        for (let c = 1; c < chains; c++) {
          let next: ZombieEntity | null = null;
          let bestD = 6.2;
          for (const cand of zombies) {
            if (cand.dead || visited.has(cand)) continue;
            const d = Math.hypot(cand.pos.x - curr.pos.x, cand.pos.z - curr.pos.z);
            if (d < bestD) {
              bestD = d;
              next = cand;
            }
          }
          if (!next) break;
          visited.add(next);
          hitList.push(next);
          curr = next;
        }
        let px = pad.x;
        let py = 2.4;
        let pz = pad.z;
        hitList.forEach((z, idx) => {
          fx.spawnLightning(px, py, pz, z.pos.x, 1.0, z.pos.z, 0x7dd3fc);
          px = z.pos.x;
          py = 1.0;
          pz = z.pos.z;
          z.slowTimer = Math.max(z.slowTimer, 1.8);
          z.slowRatio = Math.min(z.slowRatio, 0.68);
          onDamageZombie(z, dmg * Math.pow(0.85, idx), 0x38bdf8);
        });
      } else if (tr.typeId === 'missile') {
        audio.playTurret('missile');
        const dx = Math.sin(desiredYaw);
        const dz = Math.cos(desiredYaw);
        this.spawnProjectile(pad.x + dx * 0.7, 1.45, pad.z + dz * 0.7, dx, dz, 17, dmg, st.splash ?? 4.2, true, target);
      }
    }

    // Update Turret Projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.removeProjectile(i);
        continue;
      }

      if (p.isMissile) {
        if (!p.target || p.target.dead) {
          p.target = zombies.find((z) => !z.dead) ?? null;
        }
        if (p.target) {
          const dx = p.target.pos.x - p.x;
          const dz = p.target.pos.z - p.z;
          const d = Math.hypot(dx, dz) || 1;
          p.vx = THREE.MathUtils.lerp(p.vx, (dx / d) * p.speed, Math.min(1, dt * 7));
          p.vz = THREE.MathUtils.lerp(p.vz, (dz / d) * p.speed, Math.min(1, dt * 7));
        }
      }

      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.mesh.position.set(p.x, p.y, p.z);
      p.mesh.rotation.y = Math.atan2(p.vx, p.vz);

      let hit = false;
      for (const z of zombies) {
        if (z.dead) continue;
        if (Math.hypot(z.pos.x - p.x, z.pos.z - p.z) <= z.spec.radius + 0.5) {
          if (p.isMissile) {
            audio.playExplosion(false);
            fx.spawnExplosion(p.x, 0.5, p.z, p.splash, 0xf97316);
            for (const other of zombies) {
              if (other.dead) continue;
              const d = Math.hypot(other.pos.x - p.x, other.pos.z - p.z);
              if (d <= p.splash + other.spec.radius) {
                const nx = d > 0.05 ? (other.pos.x - p.x) / d : 0;
                const nz = d > 0.05 ? (other.pos.z - p.z) / d : -1;
                onDamageZombie(other, p.damage * (1 - (d / (p.splash + 1)) * 0.35), 0xf97316, 4.2, nx, nz);
              }
            }
          } else {
            fx.spawnHitSparks(p.x, 1.0, p.z, 0xfde047, 4);
            onDamageZombie(z, p.damage, 0xfde047, 1.2, p.vx / p.speed, p.vz / p.speed);
          }
          hit = true;
          break;
        }
      }

      if (hit) {
        this.removeProjectile(i);
      }
    }
  }

  private spawnProjectile(
    x: number,
    y: number,
    z: number,
    dx: number,
    dz: number,
    speed: number,
    damage: number,
    splash: number,
    isMissile: boolean,
    target: ZombieEntity | null
  ): void {
    const mat = new THREE.MeshBasicMaterial({ color: isMissile ? 0xf87171 : 0xfde047 });
    const mesh = new THREE.Mesh(isMissile ? this.missileGeo : this.bulletGeo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = Math.atan2(dx, dz);
    this.scene.add(mesh);

    this.projectiles.push({
      mesh,
      x,
      y,
      z,
      vx: dx * speed,
      vz: dz * speed,
      speed,
      damage,
      splash,
      isMissile,
      target,
      life: isMissile ? 2.4 : 0.7
    });
  }

  private removeProjectile(idx: number): void {
    const p = this.projectiles[idx];
    this.scene.remove(p.mesh);
    (p.mesh.material as THREE.Material).dispose();
    this.projectiles.splice(idx, 1);
  }

  resetAll(): void {
    for (let i = 0; i < this.pads.length; i++) {
      this.removeTurret(i);
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      this.removeProjectile(i);
    }
    this.rangePreview.visible = false;
  }
}
