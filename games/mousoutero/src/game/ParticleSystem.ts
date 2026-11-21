import * as THREE from 'three';

interface ParticleItem {
  mesh: THREE.Mesh;
  active: boolean;
  vx: number;
  vy: number;
  vz: number;
  gravity: number;
  life: number;
  maxLife: number;
  startScale: number;
  endScale: number;
  rotSpeed: number;
}

export interface SmokeZone {
  x: number;
  z: number;
  radius: number;
  life: number;
}

export class ParticleSystem {
  private pool: ParticleItem[] = [];
  private smokeZones: SmokeZone[] = [];
  private group = new THREE.Group();
  private sharedGeo: THREE.BufferGeometry;

  constructor(scene: THREE.Scene, poolSize = 180) {
    this.sharedGeo = new THREE.DodecahedronGeometry(0.18, 0);
    for (let i = 0; i < poolSize; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        flatShading: true,
        roughness: 0.75,
        transparent: true,
        opacity: 1
      });
      const mesh = new THREE.Mesh(this.sharedGeo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.pool.push({
        mesh,
        active: false,
        vx: 0,
        vy: 0,
        vz: 0,
        gravity: 9.8,
        life: 0,
        maxLife: 1,
        startScale: 1,
        endScale: 0,
        rotSpeed: 4
      });
    }
    scene.add(this.group);
  }

  private spawnOne(opts: {
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    color: number;
    life: number;
    startScale: number;
    endScale: number;
    gravity: number;
    emissive?: number;
  }): void {
    const item = this.pool.find((p) => !p.active);
    if (!item) return;

    item.active = true;
    item.vx = opts.vx;
    item.vy = opts.vy;
    item.vz = opts.vz;
    item.gravity = opts.gravity;
    item.life = opts.life;
    item.maxLife = opts.life;
    item.startScale = opts.startScale;
    item.endScale = opts.endScale;
    item.rotSpeed = (Math.random() - 0.5) * 10;

    item.mesh.position.set(opts.x, opts.y, opts.z);
    item.mesh.scale.setScalar(opts.startScale);
    const mat = item.mesh.material as THREE.MeshStandardMaterial;
    mat.color.setHex(opts.color);
    mat.emissive.setHex(opts.emissive ?? 0x000000);
    mat.opacity = 1;
    item.mesh.visible = true;
  }

  spawnHitSparks(x: number, y: number, z: number, color = 0xffd43b, count = 10): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 2.5 + Math.random() * 5.5;
      this.spawnOne({
        x,
        y,
        z,
        vx: Math.cos(a) * spd,
        vy: 2.0 + Math.random() * 4.5,
        vz: Math.sin(a) * spd,
        color,
        emissive: color,
        life: 0.28 + Math.random() * 0.22,
        startScale: 0.65 + Math.random() * 0.45,
        endScale: 0.05,
        gravity: 13
      });
    }
  }

  spawnWoodChips(x: number, y: number, z: number, count = 10): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 2.0 + Math.random() * 4.5;
      this.spawnOne({
        x,
        y,
        z,
        vx: Math.cos(a) * spd,
        vy: 2.2 + Math.random() * 3.8,
        vz: Math.sin(a) * spd,
        color: i % 2 === 0 ? 0xd4a36a : 0x9c6b3b,
        life: 0.42 + Math.random() * 0.28,
        startScale: 0.55 + Math.random() * 0.35,
        endScale: 0.1,
        gravity: 16
      });
    }
  }

  spawnChalkBurst(x: number, y: number, z: number): void {
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 1.2 + Math.random() * 5.2;
      this.spawnOne({
        x: x + (Math.random() - 0.5) * 0.4,
        y: y + (Math.random() - 0.5) * 0.3,
        z: z + (Math.random() - 0.5) * 0.4,
        vx: Math.cos(a) * spd,
        vy: 0.8 + Math.random() * 3.2,
        vz: Math.sin(a) * spd,
        color: i % 5 === 0 ? 0xe3f2fd : 0xffffff,
        emissive: 0x333333,
        life: 0.75 + Math.random() * 0.55,
        startScale: 1.0 + Math.random() * 0.8,
        endScale: 2.6,
        gravity: 1.2
      });
    }
  }

  spawnExtinguisherSpray(
    ox: number,
    oy: number,
    oz: number,
    dirX: number,
    dirZ: number
  ): void {
    // Visual high-pressure white foam/smoke cone
    for (let i = 0; i < 32; i++) {
      const spread = (Math.random() - 0.5) * 0.75;
      const cos = Math.cos(spread);
      const sin = Math.sin(spread);
      const rx = dirX * cos - dirZ * sin;
      const rz = dirX * sin + dirZ * cos;
      const spd = 3.5 + Math.random() * 7.5;

      this.spawnOne({
        x: ox + dirX * 0.6,
        y: oy,
        z: oz + dirZ * 0.6,
        vx: rx * spd,
        vy: (Math.random() - 0.2) * 1.8,
        vz: rz * spd,
        color: 0xf4f9ff,
        emissive: 0x222a33,
        life: 0.9 + Math.random() * 0.9,
        startScale: 0.85,
        endScale: 3.4,
        gravity: -0.4
      });
    }

    // Persistent smoke zone in front of player
    this.smokeZones.push({
      x: ox + dirX * 2.8,
      z: oz + dirZ * 2.8,
      radius: 3.2,
      life: 4.5
    });
  }

  spawnDoorExplosion(x: number, y: number, z: number): void {
    for (let i = 0; i < 28; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 3.5 + Math.random() * 8.0;
      const isFire = i % 3 !== 0;
      this.spawnOne({
        x,
        y: y + Math.random() * 1.2,
        z,
        vx: Math.cos(a) * spd,
        vy: 1.8 + Math.random() * 6.0,
        vz: Math.sin(a) * spd,
        color: isFire ? (i % 2 === 0 ? 0xff5722 : 0xffd54f) : 0x555555,
        emissive: isFire ? 0xff3d00 : 0x000000,
        life: 0.5 + Math.random() * 0.55,
        startScale: isFire ? 1.1 : 1.4,
        endScale: isFire ? 0.1 : 2.8,
        gravity: isFire ? 8 : -1.2
      });
    }
  }

  spawnAwakenBurst(x: number, y: number, z: number): void {
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      this.spawnOne({
        x,
        y,
        z,
        vx: Math.cos(a) * 6.5,
        vy: 1.5 + Math.random() * 4.5,
        vz: Math.sin(a) * 6.5,
        color: i % 2 === 0 ? 0xffd43b : 0xff3355,
        emissive: 0xff6d00,
        life: 0.55,
        startScale: 1.0,
        endScale: 0.1,
        gravity: 3.5
      });
    }
  }

  getActiveSmokeZones(): readonly SmokeZone[] {
    return this.smokeZones;
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }

      p.vy -= p.gravity * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      if (p.mesh.position.y < 0.08) {
        p.mesh.position.y = 0.08;
        p.vy *= -0.25;
        p.vx *= 0.7;
        p.vz *= 0.7;
      }

      p.mesh.rotation.x += p.rotSpeed * dt;
      p.mesh.rotation.y += p.rotSpeed * dt;

      const t = 1 - p.life / p.maxLife;
      const scale = p.startScale + (p.endScale - p.startScale) * t;
      p.mesh.scale.setScalar(Math.max(0.01, scale));
      const mat = p.mesh.material as THREE.MeshStandardMaterial;
      mat.opacity = Math.max(0, 1 - t * t);
    }

    // Maintain smoke zones & puff ambient smoke while alive
    for (let i = this.smokeZones.length - 1; i >= 0; i--) {
      const zone = this.smokeZones[i];
      zone.life -= dt;
      if (zone.life <= 0) {
        this.smokeZones.splice(i, 1);
        continue;
      }
      if (Math.random() < dt * 14) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * zone.radius * 0.75;
        this.spawnOne({
          x: zone.x + Math.cos(a) * r,
          y: 0.4 + Math.random() * 0.8,
          z: zone.z + Math.sin(a) * r,
          vx: (Math.random() - 0.5) * 0.8,
          vy: 0.7 + Math.random() * 0.6,
          vz: (Math.random() - 0.5) * 0.8,
          color: 0xf0f6ff,
          emissive: 0x1a222b,
          life: 0.85,
          startScale: 1.5,
          endScale: 3.6,
          gravity: -0.3
        });
      }
    }
  }

  clear(): void {
    for (const p of this.pool) {
      p.active = false;
      p.mesh.visible = false;
    }
    this.smokeZones = [];
  }
}
