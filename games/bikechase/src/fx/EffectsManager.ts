import * as THREE from 'three';

interface Particle {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  gravity: number;
}

interface SkidMark {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  active: boolean;
  life: number;
  maxLife: number;
}

const MAX_PARTICLES = 220;
const MAX_SKIDS = 140;

export class EffectsManager {
  private particles: Particle[] = [];
  private skids: SkidMark[] = [];
  private particleCursor = 0;
  private skidCursor = 0;
  private group = new THREE.Group();

  constructor(scene: THREE.Scene) {
    scene.add(this.group);

    const pGeo = new THREE.OctahedronGeometry(0.18, 0);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 1
      });
      const mesh = new THREE.Mesh(pGeo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.particles.push({
        mesh,
        mat,
        active: false,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 0.5,
        size: 1,
        gravity: 10
      });
    }

    const sGeo = new THREE.PlaneGeometry(0.28, 0.95);
    sGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < MAX_SKIDS; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x0f172a,
        transparent: true,
        opacity: 0.45,
        depthWrite: false
      });
      const mesh = new THREE.Mesh(sGeo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.skids.push({
        mesh,
        mat,
        active: false,
        life: 0,
        maxLife: 2.3
      });
    }
  }

  public reset(): void {
    for (const p of this.particles) {
      p.active = false;
      p.mesh.visible = false;
    }
    for (const s of this.skids) {
      s.active = false;
      s.mesh.visible = false;
    }
  }

  private allocParticle(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    color: number,
    maxLife: number,
    size: number,
    gravity: number
  ): void {
    const p = this.particles[this.particleCursor];
    this.particleCursor = (this.particleCursor + 1) % MAX_PARTICLES;

    p.active = true;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.life = maxLife;
    p.maxLife = maxLife;
    p.size = size;
    p.gravity = gravity;
    p.mat.color.setHex(color);
    p.mat.opacity = 0.95;
    p.mesh.position.set(x, y, z);
    p.mesh.scale.setScalar(size);
    p.mesh.visible = true;
  }

  public emitBurst(
    x: number,
    y: number,
    z: number,
    color: number,
    count: number,
    speed: number
  ): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = speed * (0.35 + Math.random() * 0.75);
      this.allocParticle(
        x,
        y,
        z,
        Math.cos(a) * spd,
        2.0 + Math.random() * speed * 0.65,
        Math.sin(a) * spd,
        color,
        0.35 + Math.random() * 0.25,
        0.7 + Math.random() * 0.6,
        14
      );
    }
  }

  public emitSmoke(x: number, y: number, z: number, color: number, count: number): void {
    for (let i = 0; i < count; i++) {
      this.allocParticle(
        x + (Math.random() - 0.5) * 0.4,
        y,
        z + (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 2.2,
        1.4 + Math.random() * 1.8,
        (Math.random() - 0.5) * 2.2,
        color,
        0.45 + Math.random() * 0.25,
        1.1 + Math.random() * 0.9,
        -2.5
      );
    }
  }

  public emitSparks(x: number, y: number, z: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 4 + Math.random() * 8;
      this.allocParticle(
        x,
        y,
        z,
        Math.cos(a) * spd,
        2.5 + Math.random() * 5,
        Math.sin(a) * spd,
        i % 2 === 0 ? 0xfef08a : 0xf97316,
        0.22 + Math.random() * 0.18,
        0.48 + Math.random() * 0.35,
        20
      );
    }
  }

  public emitExplosion(x: number, y: number, z: number): void {
    const colors = [0xff4500, 0xfbbf24, 0xf97316, 0x334155];
    for (let i = 0; i < 28; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 3 + Math.random() * 11;
      const col = colors[i % colors.length];
      this.allocParticle(
        x,
        y,
        z,
        Math.cos(a) * spd,
        4 + Math.random() * 9,
        Math.sin(a) * spd,
        col,
        0.45 + Math.random() * 0.4,
        1.2 + Math.random() * 1.3,
        16
      );
    }
  }

  public spawnSkid(x: number, z: number, heading: number, widthScale = 1): void {
    const s = this.skids[this.skidCursor];
    this.skidCursor = (this.skidCursor + 1) % MAX_SKIDS;
    s.active = true;
    s.life = s.maxLife;
    s.mat.opacity = 0.48;
    s.mesh.position.set(x, 0.026, z);
    s.mesh.rotation.y = heading;
    s.mesh.scale.set(widthScale + 0.65, 1, 1);
    s.mesh.visible = true;
  }

  public update(dt: number): void {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.06) {
        p.y = 0.06;
        p.vy *= -0.35;
      }
      const ratio = p.life / p.maxLife;
      p.mesh.position.set(p.x, p.y, p.z);
      p.mesh.rotation.x += dt * 7;
      p.mesh.rotation.y += dt * 5;
      p.mesh.scale.setScalar(p.size * (0.4 + 0.6 * ratio));
      p.mat.opacity = Math.min(1, ratio * 1.25);
    }

    for (let i = 0; i < MAX_SKIDS; i++) {
      const s = this.skids[i];
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.active = false;
        s.mesh.visible = false;
        continue;
      }
      s.mat.opacity = 0.45 * (s.life / s.maxLife);
    }
  }
}
