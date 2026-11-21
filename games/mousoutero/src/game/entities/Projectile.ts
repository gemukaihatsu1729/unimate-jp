import * as THREE from 'three';

export type ProjectileKind = 'enemy_bullet' | 'reflected_bullet' | 'eraser_bomb' | 'teacher_chalk';

export interface ProjectileEntity {
  kind: ProjectileKind;
  mesh: THREE.Object3D;
  pos: THREE.Vector3;
  vx: number;
  vy: number;
  vz: number;
  damage: number;
  life: number;
  active: boolean;
}

export class ProjectileManager {
  public readonly items: ProjectileEntity[] = [];
  private group = new THREE.Group();

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  spawnEnemyBullet(
    x: number,
    y: number,
    z: number,
    dirX: number,
    dirZ: number,
    speed = 13.5,
    damage = 14
  ): void {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.1, 0.52),
      new THREE.MeshStandardMaterial({
        color: 0xffd43b,
        emissive: 0xff5722,
        emissiveIntensity: 1.1,
        flatShading: true
      })
    );
    mesh.position.set(x, y, z);
    mesh.rotation.y = Math.atan2(dirX, dirZ);
    this.group.add(mesh);

    this.items.push({
      kind: 'enemy_bullet',
      mesh,
      pos: new THREE.Vector3(x, y, z),
      vx: dirX * speed,
      vy: 0,
      vz: dirZ * speed,
      damage,
      life: 2.6,
      active: true
    });
  }

  spawnEraserBomb(
    x: number,
    y: number,
    z: number,
    dirX: number,
    dirZ: number,
    damage: number
  ): void {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.14, 0.34),
      new THREE.MeshStandardMaterial({ color: 0xff7043, flatShading: true })
    );
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.08, 0.32),
      new THREE.MeshStandardMaterial({ color: 0xd99b52, flatShading: true })
    );
    top.position.y = 0.08;
    g.add(body, top);
    g.position.set(x, y, z);
    this.group.add(g);

    this.items.push({
      kind: 'eraser_bomb',
      mesh: g,
      pos: new THREE.Vector3(x, y, z),
      vx: dirX * 14.5,
      vy: 4.2,
      vz: dirZ * 14.5,
      damage,
      life: 1.4,
      active: true
    });
  }

  spawnTeacherChalk(start: THREE.Vector3, target: THREE.Vector3): void {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 0.38, 8),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xdddddd,
        emissiveIntensity: 0.45,
        flatShading: true
      })
    );
    mesh.position.copy(start);
    const dir = target.clone().sub(start).normalize();
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    this.group.add(mesh);

    this.items.push({
      kind: 'teacher_chalk',
      mesh,
      pos: start.clone(),
      vx: dir.x * 16,
      vy: dir.y * 16,
      vz: dir.z * 16,
      damage: 0,
      life: 1.5,
      active: true
    });
  }

  reflectBullet(proj: ProjectileEntity, dirX: number, dirZ: number): void {
    proj.kind = 'reflected_bullet';
    const spd = 22;
    proj.vx = dirX * spd;
    proj.vz = dirZ * spd;
    proj.damage = 75;
    proj.life = 1.6;
    const mesh = proj.mesh as THREE.Mesh;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    mat.color.setHex(0x2ee6ff);
    mat.emissive.setHex(0x00bcd4);
    mesh.rotation.y = Math.atan2(dirX, dirZ);
  }

  removeItem(item: ProjectileEntity): void {
    item.active = false;
    this.group.remove(item.mesh);
  }

  clear(): void {
    for (const item of this.items) {
      this.group.remove(item.mesh);
    }
    this.items.length = 0;
  }
}
