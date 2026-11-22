import * as THREE from 'three';
import type { PickupKind } from '../data';
import type { ChunkDelta, CityChunkData, PropAnchor, StreamingCity } from '../world/CityLayout';
import type { PlayerBike } from './PlayerBike';
import type { PoliceUnit } from './PoliceAI';
import type { EffectsManager } from '../fx/EffectsManager';
import type { AudioManager } from '../audio/AudioManager';

interface StreetProp {
  mesh: THREE.Group;
  homeX: number;
  homeZ: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  rz: number;
  smashed: boolean;
  respawnTimer: number;
}

export interface ActivePickup {
  kind: PickupKind;
  x: number;
  z: number;
  active: boolean;
  mesh: THREE.Group;
  spinner: THREE.Mesh;
  respawnTimer: number;
}

export interface PropPickupCallbacks {
  onPropSmashed: (x: number, z: number) => void;
  onPickupCollected: (kind: PickupKind, x: number, z: number) => void;
}

const CONE_BASE_GEO = new THREE.BoxGeometry(0.46, 0.08, 0.46);
const CONE_TOP_GEO = new THREE.ConeGeometry(0.2, 0.62, 6);
const CRATE_GEO = new THREE.BoxGeometry(0.68, 0.68, 0.68);
const SIGN_POLE_GEO = new THREE.CylinderGeometry(0.05, 0.06, 1.35, 6);
const SIGN_BOARD_GEO = new THREE.BoxGeometry(0.65, 0.45, 0.1);
const UMBRELLA_STEM_GEO = new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6);
const UMBRELLA_TOP_GEO = new THREE.ConeGeometry(0.85, 0.45, 6);

const CONE_MAT = new THREE.MeshStandardMaterial({ color: 0xf97316, flatShading: true, roughness: 0.7 });
const CRATE_MAT = new THREE.MeshStandardMaterial({ color: 0xd97706, flatShading: true, roughness: 0.8 });
const SIGN_MAT = new THREE.MeshStandardMaterial({ color: 0x38bdf8, flatShading: true, roughness: 0.5 });
const UMBRELLA_MAT = new THREE.MeshStandardMaterial({ color: 0xef4444, flatShading: true, roughness: 0.65 });
const POLE_MAT = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, flatShading: true, roughness: 0.5 });

function buildPropMesh(kind: PropAnchor['kind']): THREE.Group {
  const g = new THREE.Group();
  if (kind === 'cone') {
    const base = new THREE.Mesh(CONE_BASE_GEO, CONE_MAT);
    base.position.y = 0.04;
    const cone = new THREE.Mesh(CONE_TOP_GEO, CONE_MAT);
    cone.position.y = 0.36;
    cone.castShadow = true;
    g.add(base, cone);
  } else if (kind === 'crate') {
    const box = new THREE.Mesh(CRATE_GEO, CRATE_MAT);
    box.position.y = 0.34;
    box.castShadow = true;
    g.add(box);
  } else if (kind === 'sign') {
    const pole = new THREE.Mesh(SIGN_POLE_GEO, POLE_MAT);
    pole.position.y = 0.68;
    const board = new THREE.Mesh(SIGN_BOARD_GEO, SIGN_MAT);
    board.position.y = 1.25;
    board.castShadow = true;
    g.add(pole, board);
  } else {
    const stem = new THREE.Mesh(UMBRELLA_STEM_GEO, POLE_MAT);
    stem.position.y = 0.75;
    const canopy = new THREE.Mesh(UMBRELLA_TOP_GEO, UMBRELLA_MAT);
    canopy.position.y = 1.55;
    canopy.castShadow = true;
    g.add(stem, canopy);
  }
  return g;
}

function buildNitroPickupVisual(): { group: THREE.Group; spinner: THREE.Mesh } {
  const group = new THREE.Group();
  const color = 0x38bdf8;

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.62, 4.0, 10, 1, true),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  beam.position.y = 2.0;
  group.add(beam);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.65, 0.92, 16),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  group.add(ring);

  const spinner = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.28, 0.82, 8),
    new THREE.MeshStandardMaterial({
      color,
      flatShading: true,
      roughness: 0.25,
      metalness: 0.35,
      emissive: color,
      emissiveIntensity: 0.6
    })
  );
  spinner.position.y = 1.05;
  spinner.castShadow = true;
  group.add(spinner);

  return { group, spinner };
}

export class CityPropsManager {
  private propsByChunk = new Map<string, StreetProp[]>();
  private pickups: ActivePickup[] = [];
  private animClock = 0;

  constructor(private scene: THREE.Scene, city: StreamingCity) {
    // 8 off-avenue Nitro cans placed in alleys, parks, plazas & construction yards
    for (let i = 0; i < 8; i++) {
      const { group, spinner } = buildNitroPickupVisual();
      group.visible = false;
      this.scene.add(group);
      this.pickups.push({
        kind: 'nitro',
        x: 0,
        z: 0,
        active: false,
        mesh: group,
        spinner,
        respawnTimer: 0
      });
    }
    this.rebuildAll(city, 0, 0);
  }

  public getPickups(): readonly ActivePickup[] {
    return this.pickups;
  }

  public rebuildAll(city: StreamingCity, centerX = 0, centerZ = 0): void {
    for (const key of Array.from(this.propsByChunk.keys())) {
      this.unloadChunkProps(key);
    }
    for (const chunk of city.getActiveChunks()) {
      this.loadChunkProps(chunk);
    }
    this.scatterPickups(city, centerX, centerZ);
  }

  public syncWithDelta(delta: ChunkDelta): void {
    if (!delta.changed) return;
    for (const key of delta.unloadedKeys) {
      this.unloadChunkProps(key);
    }
    for (const chunk of delta.loaded) {
      this.loadChunkProps(chunk);
    }
  }

  private loadChunkProps(chunk: CityChunkData): void {
    if (this.propsByChunk.has(chunk.key)) return;
    const list: StreetProp[] = [];
    for (const anchor of chunk.propAnchors) {
      const mesh = buildPropMesh(anchor.kind);
      mesh.position.set(anchor.x, 0, anchor.z);
      this.scene.add(mesh);
      list.push({
        mesh,
        homeX: anchor.x,
        homeZ: anchor.z,
        x: anchor.x,
        y: 0,
        z: anchor.z,
        vx: 0,
        vy: 0,
        vz: 0,
        rx: 0,
        rz: 0,
        smashed: false,
        respawnTimer: 0
      });
    }
    this.propsByChunk.set(chunk.key, list);
  }

  private unloadChunkProps(key: string): void {
    const list = this.propsByChunk.get(key);
    if (!list) return;
    for (const p of list) {
      this.scene.remove(p.mesh);
    }
    this.propsByChunk.delete(key);
  }

  private scatterPickups(city: StreamingCity, refX: number, refZ: number): void {
    const anchors = city.getActivePickupAnchors();
    if (anchors.length === 0) return;

    for (let i = 0; i < this.pickups.length; i++) {
      const pk = this.pickups[i];
      const a = anchors[Math.floor((i * anchors.length) / this.pickups.length)];
      pk.x = a.x;
      pk.z = a.z;
      pk.active = Math.hypot(a.x - refX, a.z - refZ) < 90;
      pk.respawnTimer = 0;
      pk.mesh.position.set(pk.x, 0, pk.z);
      pk.mesh.visible = pk.active;
    }
  }

  private relocatePickup(pk: ActivePickup, city: StreamingCity, bike: PlayerBike): void {
    const anchors = city.getActivePickupAnchors();
    if (anchors.length === 0) return;
    for (let attempt = 0; attempt < 8; attempt++) {
      const cand = anchors[Math.floor(Math.random() * anchors.length)];
      const dist = Math.hypot(cand.x - bike.x, cand.z - bike.z);
      if (dist >= 24 && dist <= 78) {
        pk.x = cand.x;
        pk.z = cand.z;
        pk.active = true;
        pk.respawnTimer = 0;
        pk.mesh.position.set(pk.x, 0, pk.z);
        pk.mesh.visible = true;
        return;
      }
    }
  }

  private launchProp(p: StreetProp, vx: number, vz: number): void {
    p.smashed = true;
    p.respawnTimer = 18;
    p.vx = vx * 0.55 + (Math.random() - 0.5) * 6;
    p.vy = 5.5 + Math.random() * 4.5;
    p.vz = vz * 0.55 + (Math.random() - 0.5) * 6;
    p.rx = (Math.random() - 0.5) * 14;
    p.rz = (Math.random() - 0.5) * 14;
  }

  public update(
    dt: number,
    bike: PlayerBike,
    city: StreamingCity,
    policeUnits: readonly PoliceUnit[],
    fx: EffectsManager,
    audio: AudioManager,
    callbacks: PropPickupCallbacks
  ): void {
    this.animClock += dt;

    for (const list of this.propsByChunk.values()) {
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (!p.smashed) {
          if (Math.abs(p.x - bike.x) > 42 || Math.abs(p.z - bike.z) > 42) continue;

          if (bike.y < 1.2) {
            const dx = bike.x - p.x;
            const dz = bike.z - p.z;
            if (dx * dx + dz * dz < 1.35 * 1.35) {
              this.launchProp(p, bike.vx, bike.vz);
              audio.playPropSmash();
              callbacks.onPropSmashed(p.x, p.z);
              continue;
            }
          }

          for (let j = 0; j < policeUnits.length; j++) {
            const u = policeUnits[j];
            if (u.wrecked) continue;
            const dx = u.x - p.x;
            const dz = u.z - p.z;
            if (dx * dx + dz * dz < (u.radius + 0.45) * (u.radius + 0.45)) {
              this.launchProp(p, u.vx, u.vz);
              break;
            }
          }
        } else {
          if (p.mesh.visible) {
            p.vy -= 22 * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.z += p.vz * dt;
            p.mesh.position.set(p.x, Math.max(0, p.y), p.z);
            p.mesh.rotation.x += p.rx * dt;
            p.mesh.rotation.z += p.rz * dt;
            if (p.y < -0.1) {
              p.mesh.visible = false;
            }
          }
          p.respawnTimer -= dt;
          if (p.respawnTimer <= 0 && Math.hypot(bike.x - p.homeX, bike.z - p.homeZ) > 25) {
            p.smashed = false;
            p.x = p.homeX;
            p.y = 0;
            p.z = p.homeZ;
            p.mesh.position.set(p.homeX, 0, p.homeZ);
            p.mesh.rotation.set(0, 0, 0);
            p.mesh.visible = true;
          }
        }
      }
    }

    for (let i = 0; i < this.pickups.length; i++) {
      const pk = this.pickups[i];
      if (!pk.active) {
        pk.respawnTimer -= dt;
        if (pk.respawnTimer <= 0) {
          this.relocatePickup(pk, city, bike);
        }
        continue;
      }

      const distToBike = Math.hypot(bike.x - pk.x, bike.z - pk.z);
      if (distToBike > 84) {
        this.relocatePickup(pk, city, bike);
        continue;
      }

      pk.spinner.rotation.y += dt * 2.8;
      pk.spinner.position.y = 1.0 + Math.sin(this.animClock * 3.4 + i) * 0.22;

      if (distToBike < 1.85 && bike.y < 2.2) {
        pk.active = false;
        pk.mesh.visible = false;
        pk.respawnTimer = 9;

        bike.addNitro(30);
        fx.emitBurst(pk.x, 0.9, pk.z, 0x38bdf8, 14, 6);
        audio.playPickup();
        callbacks.onPickupCollected(pk.kind, pk.x, pk.z);
      }
    }
  }
}
