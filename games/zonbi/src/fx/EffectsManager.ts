import * as THREE from 'three';

interface PolyParticle {
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

interface SlashFx {
  group: THREE.Group;
  life: number;
  maxLife: number;
  spinSpeed: number;
  startScale: number;
  endScale: number;
}

interface RingFx {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  maxRadius: number;
}

interface BoltFx {
  line: THREE.Line;
  life: number;
  maxLife: number;
}

export class EffectsManager {
  private group = new THREE.Group();
  private particles: PolyParticle[] = [];
  private slashes: SlashFx[] = [];
  private rings: RingFx[] = [];
  private bolts: BoltFx[] = [];
  private sharedPolyGeo = new THREE.DodecahedronGeometry(0.18, 0);
  private sharedRingGeo = new THREE.RingGeometry(0.75, 1.0, 28);

  constructor(scene: THREE.Scene, poolSize = 220) {
    for (let i = 0; i < poolSize; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        flatShading: true,
        roughness: 0.6,
        transparent: true,
        opacity: 1
      });
      const mesh = new THREE.Mesh(this.sharedPolyGeo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.particles.push({
        mesh,
        active: false,
        vx: 0,
        vy: 0,
        vz: 0,
        gravity: 14,
        life: 0,
        maxLife: 1,
        startScale: 1,
        endScale: 0,
        rotSpeed: 5
      });
    }
    scene.add(this.group);
  }

  private spawnParticle(opts: {
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    color: number;
    emissive?: number;
    life: number;
    startScale: number;
    endScale: number;
    gravity: number;
  }): void {
    const p = this.particles.find((item) => !item.active);
    if (!p) return;
    p.active = true;
    p.vx = opts.vx;
    p.vy = opts.vy;
    p.vz = opts.vz;
    p.gravity = opts.gravity;
    p.life = opts.life;
    p.maxLife = opts.life;
    p.startScale = opts.startScale;
    p.endScale = opts.endScale;
    p.rotSpeed = (Math.random() - 0.5) * 12;

    p.mesh.position.set(opts.x, opts.y, opts.z);
    p.mesh.scale.setScalar(opts.startScale);
    const mat = p.mesh.material as THREE.MeshStandardMaterial;
    mat.color.setHex(opts.color);
    mat.emissive.setHex(opts.emissive ?? 0x000000);
    mat.emissiveIntensity = opts.emissive ? 0.9 : 0;
    mat.opacity = 1;
    p.mesh.visible = true;
  }

  /**
   * Iconic Zelda Musou glowing 3D crescent blade wave!
   */
  spawnSlashArc(
    x: number,
    y: number,
    z: number,
    yaw: number,
    radius: number,
    color: number,
    arcRadians = Math.PI * 1.1,
    tilt = 0,
    spinDir = 1
  ): void {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.order = 'YXZ';
    g.rotation.y = yaw;
    g.rotation.z = tilt;

    const outerGeo = new THREE.RingGeometry(radius * 0.48, radius, 22, 1, -arcRadians * 0.5, arcRadians);
    const outerMat = new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const outer = new THREE.Mesh(outerGeo, outerMat);
    outer.rotation.x = -Math.PI / 2;
    outer.rotation.z = Math.PI / 2;
    g.add(outer);

    const coreGeo = new THREE.RingGeometry(radius * 0.72, radius * 0.96, 22, 1, -arcRadians * 0.42, arcRadians * 0.84);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.rotation.x = -Math.PI / 2;
    core.rotation.z = Math.PI / 2;
    core.position.y = 0.03;
    g.add(core);

    this.group.add(g);
    this.slashes.push({
      group: g,
      life: 0.30,
      maxLife: 0.30,
      spinSpeed: spinDir * 5.2,
      startScale: 0.78,
      endScale: 1.3
    });
  }

  spawnShockwave(x: number, z: number, maxRadius: number, color: number, duration = 0.38): void {
    const mat = new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(this.sharedRingGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.14, z);
    mesh.scale.setScalar(0.3);
    this.group.add(mesh);
    this.rings.push({ mesh, life: duration, maxLife: duration, maxRadius });
  }

  spawnLightning(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, color = 0x7dd3fc): void {
    const pts: THREE.Vector3[] = [];
    const steps = 6;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const jitter = i === 0 || i === steps ? 0 : 0.45;
      pts.push(new THREE.Vector3(
        THREE.MathUtils.lerp(x1, x2, t) + (Math.random() - 0.5) * jitter,
        THREE.MathUtils.lerp(y1, y2, t) + (Math.random() - 0.5) * jitter,
        THREE.MathUtils.lerp(z1, z2, t) + (Math.random() - 0.5) * jitter
      ));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1 });
    const line = new THREE.Line(geo, mat);
    this.group.add(line);
    this.bolts.push({ line, life: 0.16, maxLife: 0.16 });
  }

  spawnHitSparks(x: number, y: number, z: number, color: number, count = 8): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 2.8 + Math.random() * 6.5;
      this.spawnParticle({
        x,
        y,
        z,
        vx: Math.cos(a) * spd,
        vy: 2.2 + Math.random() * 5.2,
        vz: Math.sin(a) * spd,
        color,
        emissive: color,
        life: 0.25 + Math.random() * 0.22,
        startScale: 0.75 + Math.random() * 0.45,
        endScale: 0.05,
        gravity: 16
      });
    }
  }

  spawnExplosion(x: number, y: number, z: number, radius: number, color = 0xf97316): void {
    this.spawnShockwave(x, z, radius, color, 0.42);
    const count = radius > 5 ? 28 : 16;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 3.0 + Math.random() * (radius * 2.1);
      const isCore = i % 3 === 0;
      this.spawnParticle({
        x,
        y: y + 0.4,
        z,
        vx: Math.cos(a) * spd,
        vy: 2.5 + Math.random() * 7.5,
        vz: Math.sin(a) * spd,
        color: isCore ? 0xfef08a : color,
        emissive: isCore ? 0xfbbf24 : color,
        life: 0.36 + Math.random() * 0.35,
        startScale: 1.0 + Math.random() * 0.8,
        endScale: 0.08,
        gravity: 12
      });
    }
  }

  spawnFlameJet(x: number, y: number, z: number, dirX: number, dirZ: number): void {
    for (let i = 0; i < 4; i++) {
      const spread = (Math.random() - 0.5) * 0.55;
      const cos = Math.cos(spread);
      const sin = Math.sin(spread);
      const vx = (dirX * cos - dirZ * sin) * (7.5 + Math.random() * 5.0);
      const vz = (dirX * sin + dirZ * cos) * (7.5 + Math.random() * 5.0);
      this.spawnParticle({
        x,
        y,
        z,
        vx,
        vy: 0.5 + Math.random() * 1.4,
        vz,
        color: i % 2 === 0 ? 0xf97316 : 0xfde047,
        emissive: 0xff5500,
        life: 0.32 + Math.random() * 0.16,
        startScale: 0.8,
        endScale: 1.9,
        gravity: -1.5
      });
    }
  }

  spawnFrostBurst(x: number, z: number, radius: number): void {
    this.spawnShockwave(x, z, radius, 0x38bdf8, 0.55);
    for (let i = 0; i < 32; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * radius * 0.75;
      this.spawnParticle({
        x: x + Math.cos(a) * d,
        y: 0.5 + Math.random() * 1.5,
        z: z + Math.sin(a) * d,
        vx: Math.cos(a) * 3.5,
        vy: 2.0 + Math.random() * 4.0,
        vz: Math.sin(a) * 3.5,
        color: 0xe0f2fe,
        emissive: 0x38bdf8,
        life: 0.55 + Math.random() * 0.35,
        startScale: 1.0,
        endScale: 0.1,
        gravity: 4
      });
    }
  }

  spawnHealBurst(x: number, z: number): void {
    this.spawnShockwave(x, z, 6.5, 0x4ade80, 0.5);
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 0.5 + Math.random() * 3.5;
      this.spawnParticle({
        x: x + Math.cos(a) * d,
        y: 0.4,
        z: z + Math.sin(a) * d,
        vx: 0,
        vy: 3.5 + Math.random() * 3.5,
        vz: 0,
        color: 0x86efac,
        emissive: 0x22c55e,
        life: 0.65,
        startScale: 0.85,
        endScale: 0.1,
        gravity: -1.2
      });
    }
  }

  update(dt: number): void {
    // Pooled low-poly particles
    for (const p of this.particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }
      p.vy -= p.gravity * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y = Math.max(0.08, p.mesh.position.y + p.vy * dt);
      p.mesh.position.z += p.vz * dt;
      p.mesh.rotation.x += p.rotSpeed * dt;
      p.mesh.rotation.y += p.rotSpeed * 0.7 * dt;

      const t = 1 - p.life / p.maxLife;
      p.mesh.scale.setScalar(THREE.MathUtils.lerp(p.startScale, p.endScale, t));
      (p.mesh.material as THREE.MeshStandardMaterial).opacity = Math.max(0, 1 - t * 0.85);
    }

    // 3D Slash Arcs
    for (let i = this.slashes.length - 1; i >= 0; i--) {
      const s = this.slashes[i];
      s.life -= dt;
      if (s.life <= 0) {
        s.group.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose();
            (obj.material as THREE.Material).dispose();
          }
        });
        this.group.remove(s.group);
        this.slashes.splice(i, 1);
        continue;
      }
      const t = 1 - s.life / s.maxLife;
      s.group.rotation.y += s.spinSpeed * dt;
      s.group.scale.setScalar(THREE.MathUtils.lerp(s.startScale, s.endScale, t));
      s.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          (obj.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - t);
        }
      });
    }

    // Ground Shockwave Rings
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) {
        (r.mesh.material as THREE.Material).dispose();
        this.group.remove(r.mesh);
        this.rings.splice(i, 1);
        continue;
      }
      const t = 1 - r.life / r.maxLife;
      const eased = 1 - Math.pow(1 - t, 3);
      r.mesh.scale.setScalar(Math.max(0.2, r.maxRadius * eased));
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, (1 - t) * 0.9);
    }

    // Lightning Bolts
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt;
      if (b.life <= 0) {
        b.line.geometry.dispose();
        (b.line.material as THREE.Material).dispose();
        this.group.remove(b.line);
        this.bolts.splice(i, 1);
        continue;
      }
      (b.line.material as THREE.LineBasicMaterial).opacity = b.life / b.maxLife;
    }
  }

  clear(): void {
    for (const p of this.particles) {
      p.active = false;
      p.mesh.visible = false;
    }
    for (const s of this.slashes) this.group.remove(s.group);
    this.slashes = [];
    for (const r of this.rings) this.group.remove(r.mesh);
    this.rings = [];
    for (const b of this.bolts) this.group.remove(b.line);
    this.bolts = [];
  }
}
