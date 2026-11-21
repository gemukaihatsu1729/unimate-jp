import * as THREE from 'three';
import type { CollisionSystem } from '../CollisionSystem';
import type { WeaponType } from '../../types';
import { WEAPON_SPECS } from '../../types';
import { createWeaponMesh } from './CharacterMesh';

export type DeskState = 'normal' | 'barricade' | 'sliding' | 'broken';

export interface DeskEntity {
  id: string;
  mesh: THREE.Group;
  originPos: THREE.Vector3;
  pos: THREE.Vector3;
  state: DeskState;
  vx: number;
  vz: number;
  slideTimer: number;
  hp: number;
  hitEnemyIds: Set<string>;
}

export interface WeaponPickup {
  id: string;
  weapon: WeaponType;
  pos: THREE.Vector3;
  group: THREE.Group;
  available: boolean;
  respawnTimer: number;
}

const DESK_COORDS: [number, number][] = [
  // Classroom 4x3 grid (wide 1.45m+ walkways)
  [-3.8, -2.0], [-1.3, -2.0], [1.3, -2.0], [3.8, -2.0],
  [-3.8, 0.3],  [-1.3, 0.3],  [1.3, 0.3],  [3.8, 0.3],
  [-3.8, 2.6],  [-1.3, 2.6],  [1.3, 2.6],  [3.8, 2.6],
  // Hallway spare desks for corridor bowling!
  [8.4, -4.6],
  [11.4, 3.8]
];

const PICKUP_CONFIGS: { weapon: WeaponType; x: number; z: number }[] = [
  // Classroom weapons
  { weapon: 'mop', x: -2.0, z: 4.35 },
  { weapon: 'eraser', x: -1.7, z: -3.7 },
  { weapon: 'eraser', x: 1.9, z: -3.7 },
  { weapon: 'extinguisher', x: 5.2, z: 4.35 },
  { weapon: 'shinai', x: 5.2, z: -4.2 },
  // Hallway weapons (Wave 2 & 3)
  { weapon: 'shinai', x: 8.1, z: -6.2 },
  { weapon: 'extinguisher', x: 12.1, z: -0.2 },
  { weapon: 'extinguisher', x: 12.1, z: -7.5 },
  { weapon: 'mop', x: 12.1, z: 6.2 },
  { weapon: 'shinai', x: 8.6, z: 6.8 }
];

export class PropManager {
  public readonly desks: DeskEntity[] = [];
  public readonly pickups: WeaponPickup[] = [];
  private group = new THREE.Group();
  private pickupsVisible = false;

  constructor(scene: THREE.Scene, private collision: CollisionSystem) {
    this.buildDesks();
    this.buildPickups();
    this.setPickupsVisible(false);
    scene.add(this.group);
  }

  setPickupsVisible(visible: boolean): void {
    this.pickupsVisible = visible;
    for (const p of this.pickups) {
      p.group.visible = visible && p.available;
    }
  }

  private buildDesks(): void {
    const woodMat = new THREE.MeshStandardMaterial({ color: 0xd4a36a, flatShading: true, roughness: 0.78 });
    const legMat = new THREE.MeshStandardMaterial({ color: 0x5c6773, flatShading: true, roughness: 0.5, metalness: 0.3 });

    DESK_COORDS.forEach(([x, z], idx) => {
      const id = `desk-${idx}`;
      const deskGroup = new THREE.Group();

      // Tabletop
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.08, 0.68), woodMat);
      top.position.y = 0.74;
      top.castShadow = true;
      top.receiveShadow = true;
      deskGroup.add(top);

      // Under-desk shelf
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.14, 0.56), woodMat);
      shelf.position.y = 0.62;
      deskGroup.add(shelf);

      // 4 legs
      const legGeo = new THREE.BoxGeometry(0.06, 0.7, 0.06);
      [
        [-0.44, -0.28],
        [0.44, -0.28],
        [-0.44, 0.28],
        [0.44, 0.28]
      ].forEach(([lx, lz]) => {
        const leg = new THREE.Mesh(legGeo, legMat);
        leg.position.set(lx, 0.35, lz);
        deskGroup.add(leg);
      });

      deskGroup.position.set(x, 0, z);
      this.group.add(deskGroup);

      const entity: DeskEntity = {
        id,
        mesh: deskGroup,
        originPos: new THREE.Vector3(x, 0, z),
        pos: new THREE.Vector3(x, 0, z),
        state: 'normal',
        vx: 0,
        vz: 0,
        slideTimer: 0,
        hp: 120,
        hitEnemyIds: new Set()
      };
      this.desks.push(entity);
      this.syncDeskCollider(entity);
    });
  }

  private buildPickups(): void {
    PICKUP_CONFIGS.forEach((cfg, idx) => {
      const spec = WEAPON_SPECS[cfg.weapon];
      const holder = new THREE.Group();
      holder.position.set(cfg.x, 0, cfg.z);

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.36, 0.52, 16),
        new THREE.MeshBasicMaterial({
          color: spec.color,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.75
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.04;
      holder.add(ring);

      const modelPivot = new THREE.Group();
      modelPivot.position.y = 0.75;
      const weaponMesh = createWeaponMesh(cfg.weapon);
      weaponMesh.scale.setScalar(0.95);
      weaponMesh.rotation.z = 0.4;
      modelPivot.add(weaponMesh);
      holder.add(modelPivot);
      holder.userData.pivot = modelPivot;

      this.group.add(holder);
      this.pickups.push({
        id: `pickup-${idx}`,
        weapon: cfg.weapon,
        pos: new THREE.Vector3(cfg.x, 0, cfg.z),
        group: holder,
        available: true,
        respawnTimer: 0
      });
    });
  }

  resetAll(): void {
    for (const d of this.desks) {
      d.pos.copy(d.originPos);
      d.state = 'normal';
      d.vx = 0;
      d.vz = 0;
      d.slideTimer = 0;
      d.hp = 120;
      d.hitEnemyIds.clear();
      d.mesh.visible = true;
      d.mesh.position.copy(d.originPos);
      d.mesh.rotation.set(0, 0, 0);
      this.syncDeskCollider(d);
    }

    for (const p of this.pickups) {
      p.available = true;
      p.respawnTimer = 0;
      p.group.visible = this.pickupsVisible;
    }
  }

  syncDeskCollider(desk: DeskEntity): void {
    if (desk.state === 'broken' || desk.state === 'sliding') {
      this.collision.removeCollider(desk.id);
      return;
    }
    const halfW = 0.56;
    const halfD = desk.state === 'barricade' ? 0.38 : 0.36;
    const height = desk.state === 'barricade' ? 1.25 : 0.85;
    this.collision.addCollider({
      id: desk.id,
      minX: desk.pos.x - halfW,
      maxX: desk.pos.x + halfW,
      minZ: desk.pos.z - halfD,
      maxZ: desk.pos.z + halfD,
      height,
      blocksMovement: true,
      blocksBullets: true,
      blocksCamera: false,
      isCover: true
    });
  }

  findNearestPickup(x: number, z: number, radius = 2.0): WeaponPickup | null {
    let best: WeaponPickup | null = null;
    let bestD = radius;
    for (const p of this.pickups) {
      if (!p.available) continue;
      const d = Math.hypot(p.pos.x - x, p.pos.z - z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  takePickup(pickup: WeaponPickup): WeaponType {
    pickup.available = false;
    pickup.respawnTimer = 16;
    pickup.group.visible = false;
    return pickup.weapon;
  }

  findNearestDesk(x: number, z: number, radius = 2.1): DeskEntity | null {
    let best: DeskEntity | null = null;
    let bestD = radius;
    for (const d of this.desks) {
      if (d.state === 'broken' || d.state === 'sliding') continue;
      const dist = Math.hypot(d.pos.x - x, d.pos.z - z);
      if (dist < bestD) {
        bestD = dist;
        best = d;
      }
    }
    return best;
  }

  flipDeskToBarricade(desk: DeskEntity, faceYaw: number): void {
    desk.state = 'barricade';
    desk.mesh.rotation.set(-Math.PI / 2, faceYaw, 0);
    desk.mesh.position.set(desk.pos.x, 0.54, desk.pos.z);
    this.syncDeskCollider(desk);
  }

  kickDesk(desk: DeskEntity, dirX: number, dirZ: number): void {
    desk.state = 'sliding';
    desk.vx = dirX * 15.5;
    desk.vz = dirZ * 15.5;
    desk.slideTimer = 0.85;
    desk.hitEnemyIds.clear();
    desk.mesh.rotation.set(0, Math.atan2(dirX, dirZ), 0);
    desk.mesh.position.y = 0.1;
    this.syncDeskCollider(desk);
  }

  damageDeskByColliderId(colliderId: string, damage: number): THREE.Vector3 | null {
    const desk = this.desks.find((d) => d.id === colliderId);
    if (!desk || desk.state === 'broken') return null;
    desk.hp -= damage;
    if (desk.hp <= 0) {
      desk.state = 'broken';
      desk.mesh.visible = false;
      this.syncDeskCollider(desk);
    }
    return desk.pos.clone();
  }

  update(
    dt: number,
    elapsed: number,
    onSlidingDeskCheck: (desk: DeskEntity) => void,
    onDeskWallCrash: (pos: THREE.Vector3) => void
  ): void {
    // Animate pickups & respawn timers
    for (const p of this.pickups) {
      if (!p.available) {
        p.respawnTimer -= dt;
        if (p.respawnTimer <= 0) {
          p.available = true;
          p.group.visible = this.pickupsVisible;
        }
      } else {
        const pivot = p.group.userData.pivot as THREE.Group;
        pivot.rotation.y = elapsed * 2.2;
        pivot.position.y = 0.72 + Math.sin(elapsed * 3.5 + p.pos.x) * 0.12;
      }
    }

    // Update sliding kicked desks
    for (const d of this.desks) {
      if (d.state !== 'sliding') continue;
      d.slideTimer -= dt;

      const nextX = d.pos.x + d.vx * dt;
      const nextZ = d.pos.z + d.vz * dt;
      const resolved = this.collision.resolveCircleAABB(nextX, nextZ, 0.55);

      d.pos.set(resolved.x, 0, resolved.z);
      d.mesh.position.set(d.pos.x, 0.15, d.pos.z);
      d.mesh.rotation.y += dt * 7.5;

      onSlidingDeskCheck(d);

      // Friction
      d.vx *= Math.max(0, 1 - dt * 2.2);
      d.vz *= Math.max(0, 1 - dt * 2.2);

      if (resolved.collided || d.slideTimer <= 0) {
        if (resolved.collided) {
          onDeskWallCrash(d.pos.clone());
          d.state = 'broken';
          d.mesh.visible = false;
        } else {
          d.state = 'barricade';
          d.mesh.rotation.set(-Math.PI / 2, d.mesh.rotation.y, 0);
          d.mesh.position.set(d.pos.x, 0.54, d.pos.z);
        }
        this.syncDeskCollider(d);
      }
    }
  }
}
