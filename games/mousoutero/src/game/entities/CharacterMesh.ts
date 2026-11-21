import * as THREE from 'three';
import type { WeaponType } from '../../types';

export interface CharacterStyle {
  skinColor: number;
  torsoColor: number;
  pantsColor: number;
  hairColor: number;
  accentColor: number;
  scale?: number;
  role: 'hero' | 'grunt' | 'gunner' | 'shield' | 'boss' | 'classmate' | 'heroine' | 'teacher';
}

export class CharacterRig {
  public readonly root = new THREE.Group();
  public readonly bodyPivot = new THREE.Group();
  public readonly headPivot = new THREE.Group();
  public readonly leftArmPivot = new THREE.Group();
  public readonly rightArmPivot = new THREE.Group();
  public readonly leftLegPivot = new THREE.Group();
  public readonly rightLegPivot = new THREE.Group();
  public readonly weaponMount = new THREE.Group();

  private headMesh: THREE.Mesh;
  private originalHeadColor: number;
  private stunRing: THREE.Group;
  private weaponMeshes = new Map<string, THREE.Object3D>();
  private walkPhase = 0;

  constructor(style: CharacterStyle) {
    const scale = style.scale ?? 1;
    this.root.scale.setScalar(scale);

    const flatMat = (color: number, roughness = 0.72, metalness = 0.05) =>
      new THREE.MeshStandardMaterial({ color, flatShading: true, roughness, metalness });

    this.originalHeadColor =
      style.role === 'grunt' || style.role === 'gunner' || style.role === 'shield'
        ? 0x1e222b
        : style.skinColor;

    // Legs
    const legGeo = new THREE.BoxGeometry(0.18, 0.52, 0.2);
    const pantsMat = flatMat(style.pantsColor);
    const shoeMat = flatMat(0x23262e);

    const buildLeg = (pivot: THREE.Group, x: number) => {
      pivot.position.set(x, 0.54, 0);
      const leg = new THREE.Mesh(legGeo, pantsMat);
      leg.position.y = -0.26;
      leg.castShadow = true;
      pivot.add(leg);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.11, 0.28), shoeMat);
      shoe.position.set(0, -0.5, 0.04);
      pivot.add(shoe);
      this.bodyPivot.add(pivot);
    };
    buildLeg(this.leftLegPivot, -0.14);
    buildLeg(this.rightLegPivot, 0.14);

    // Torso
    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.58, 0.28),
      flatMat(style.torsoColor)
    );
    torso.position.y = 0.84;
    torso.castShadow = true;
    this.bodyPivot.add(torso);

    // Accent (tie, tactical vest, ribbon, cape)
    if (style.role === 'hero' || style.role === 'classmate' || style.role === 'heroine') {
      const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.28, 0.3), flatMat(0xf8f9fa));
      shirt.position.set(0, 0.96, 0.01);
      this.bodyPivot.add(shirt);
      const tie = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.24, 0.31),
        flatMat(style.accentColor)
      );
      tie.position.set(0, 0.92, 0.02);
      this.bodyPivot.add(tie);
    } else if (style.role === 'teacher') {
      const tie = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.3), flatMat(0x264653));
      tie.position.set(0, 0.9, 0.01);
      this.bodyPivot.add(tie);
    } else {
      // Tactical vest plates for terrorists
      const vest = new THREE.Mesh(
        new THREE.BoxGeometry(0.54, 0.42, 0.34),
        flatMat(style.accentColor, 0.6, 0.15)
      );
      vest.position.y = 0.86;
      this.bodyPivot.add(vest);
      if (style.role === 'boss') {
        const cape = new THREE.Mesh(
          new THREE.BoxGeometry(0.62, 0.85, 0.06),
          flatMat(0x9b111e, 0.8)
        );
        cape.position.set(0, 0.72, -0.2);
        cape.rotation.x = 0.16;
        this.bodyPivot.add(cape);
      }
    }

    // Head
    this.headPivot.position.set(0, 1.15, 0);
    this.headMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.38, 0.38),
      flatMat(this.originalHeadColor)
    );
    this.headMesh.position.y = 0.2;
    this.headMesh.castShadow = true;
    this.headPivot.add(this.headMesh);

    // Eyes / Goggles / Glasses
    if (style.role === 'grunt' || style.role === 'gunner' || style.role === 'shield') {
      const goggleColor = style.role === 'shield' ? 0x29b6f6 : style.role === 'gunner' ? 0xff9100 : 0xff2a55;
      const goggles = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.11, 0.1),
        new THREE.MeshStandardMaterial({
          color: goggleColor,
          emissive: goggleColor,
          emissiveIntensity: 0.45,
          flatShading: true
        })
      );
      goggles.position.set(0, 0.22, 0.18);
      this.headPivot.add(goggles);
    } else if (style.role === 'boss') {
      const shades = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.1), flatMat(0x111111, 0.2, 0.6));
      shades.position.set(0, 0.22, 0.18);
      this.headPivot.add(shades);
      const beret = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.22, 0.12, 7), flatMat(0xd90429));
      beret.position.set(0.04, 0.42, 0);
      beret.rotation.z = -0.18;
      this.headPivot.add(beret);
    } else {
      const eyeMat = flatMat(0x1b1f2a);
      const leftEye = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.05), eyeMat);
      leftEye.position.set(-0.08, 0.21, 0.18);
      const rightEye = leftEye.clone();
      rightEye.position.x = 0.08;
      this.headPivot.add(leftEye, rightEye);

      // Hair
      const hair = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.17, 0.42), flatMat(style.hairColor));
      hair.position.set(0, 0.36, -0.01);
      this.headPivot.add(hair);

      if (style.role === 'hero') {
        // Spiky anime protagonist tufts!
        const spike1 = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.24, 5), flatMat(style.hairColor));
        spike1.position.set(-0.1, 0.46, 0.14);
        spike1.rotation.x = 0.55;
        const spike2 = spike1.clone();
        spike2.position.set(0.12, 0.47, 0.12);
        spike2.rotation.z = -0.35;
        this.headPivot.add(spike1, spike2);
      } else if (style.role === 'heroine') {
        // Long hair + pink ribbon
        const backHair = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.14), flatMat(style.hairColor));
        backHair.position.set(0, 0.12, -0.18);
        const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.1, 0.08), flatMat(0xff66b2));
        ribbon.position.set(0.14, 0.41, -0.08);
        this.headPivot.add(backHair, ribbon);
      } else if (style.role === 'teacher') {
        // Glasses frame
        const glassMat = flatMat(0xdbeafe, 0.2, 0.5);
        const lLens = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.09, 0.04), glassMat);
        lLens.position.set(-0.09, 0.21, 0.2);
        const rLens = lLens.clone();
        rLens.position.x = 0.09;
        this.headPivot.add(lLens, rLens);
      }
    }
    this.bodyPivot.add(this.headPivot);

    // Arms
    const armGeo = new THREE.BoxGeometry(0.16, 0.48, 0.16);
    const sleeveMat = flatMat(style.torsoColor);
    const handMat = flatMat(style.role === 'grunt' || style.role === 'gunner' || style.role === 'shield' ? 0x22262e : style.skinColor);

    const buildArm = (pivot: THREE.Group, x: number) => {
      pivot.position.set(x, 1.08, 0);
      const arm = new THREE.Mesh(armGeo, sleeveMat);
      arm.position.y = -0.22;
      arm.castShadow = true;
      pivot.add(arm);
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), handMat);
      hand.position.y = -0.46;
      pivot.add(hand);
      this.bodyPivot.add(pivot);
    };
    buildArm(this.leftArmPivot, -0.34);
    buildArm(this.rightArmPivot, 0.34);

    // Weapon mount on right hand
    this.weaponMount.position.set(0, -0.46, 0.14);
    this.rightArmPivot.add(this.weaponMount);

    // Shield on left arm for shield troopers
    if (style.role === 'shield') {
      const shield = new THREE.Mesh(
        new THREE.BoxGeometry(0.76, 1.05, 0.08),
        new THREE.MeshStandardMaterial({
          color: 0x1e3a5f,
          roughness: 0.3,
          metalness: 0.4,
          flatShading: true
        })
      );
      const visor = new THREE.Mesh(
        new THREE.BoxGeometry(0.56, 0.24, 0.09),
        new THREE.MeshStandardMaterial({
          color: 0x80d8ff,
          transparent: true,
          opacity: 0.55,
          roughness: 0.1
        })
      );
      visor.position.y = 0.22;
      shield.add(visor);
      shield.position.set(-0.08, -0.22, 0.26);
      this.leftArmPivot.add(shield);
    }

    // Stun / Dizzy stars above head
    this.stunRing = new THREE.Group();
    this.stunRing.position.set(0, 1.72, 0);
    const starGeo = new THREE.OctahedronGeometry(0.09, 0);
    const starMat = new THREE.MeshStandardMaterial({
      color: 0xffd43b,
      emissive: 0xff9100,
      emissiveIntensity: 0.6,
      flatShading: true
    });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const star = new THREE.Mesh(starGeo, starMat);
      star.position.set(Math.cos(a) * 0.34, 0, Math.sin(a) * 0.34);
      this.stunRing.add(star);
    }
    this.stunRing.visible = false;
    this.bodyPivot.add(this.stunRing);

    this.root.add(this.bodyPivot);

    // Pre-build hero weapon visuals if hero
    if (style.role === 'hero') {
      (['mop', 'shinai', 'extinguisher', 'eraser'] as WeaponType[]).forEach((w) => {
        const mesh = createWeaponMesh(w);
        mesh.visible = false;
        this.weaponMount.add(mesh);
        this.weaponMeshes.set(w, mesh);
      });
    } else if (style.role === 'gunner') {
      const gun = createEnemyGunMesh(false);
      this.weaponMount.add(gun);
    } else if (style.role === 'boss') {
      const gun = createEnemyGunMesh(true);
      this.weaponMount.add(gun);
    } else if (style.role === 'grunt' || style.role === 'shield') {
      const baton = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.04, 0.58, 6),
        flatMat(0x22262e, 0.4, 0.6)
      );
      baton.rotation.x = Math.PI / 2;
      baton.position.z = 0.24;
      this.weaponMount.add(baton);
    } else if (style.role === 'teacher') {
      const chalk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, 0.16, 6),
        flatMat(0xffffff)
      );
      chalk.rotation.x = Math.PI / 2;
      chalk.position.z = 0.08;
      this.weaponMount.add(chalk);
    }
  }

  setHeroWeapon(weapon: WeaponType): void {
    for (const [key, obj] of this.weaponMeshes) {
      obj.visible = key === weapon;
    }
  }

  setChalked(active: boolean): void {
    const mat = this.headMesh.material as THREE.MeshStandardMaterial;
    mat.color.setHex(active ? 0xf8f9fa : this.originalHeadColor);
  }

  setStunned(active: boolean, dt: number): void {
    this.stunRing.visible = active;
    if (active) {
      this.stunRing.rotation.y += dt * 6.5;
    }
  }

  animateIdleOrWalk(dt: number, speed: number): void {
    if (speed > 0.15) {
      this.walkPhase += dt * (6.5 + speed * 1.15);
      const swing = Math.sin(this.walkPhase) * 0.65;
      this.leftLegPivot.rotation.x = swing;
      this.rightLegPivot.rotation.x = -swing;
      this.leftArmPivot.rotation.x = -swing * 0.7;
      this.rightArmPivot.rotation.x = swing * 0.65;
      this.bodyPivot.position.y = Math.abs(Math.cos(this.walkPhase)) * 0.08;
    } else {
      this.walkPhase += dt * 2.5;
      const damp = Math.min(1, dt * 10);
      this.leftLegPivot.rotation.x = THREE.MathUtils.lerp(this.leftLegPivot.rotation.x, 0, damp);
      this.rightLegPivot.rotation.x = THREE.MathUtils.lerp(this.rightLegPivot.rotation.x, 0, damp);
      this.leftArmPivot.rotation.x = THREE.MathUtils.lerp(this.leftArmPivot.rotation.x, 0, damp);
      this.rightArmPivot.rotation.x = THREE.MathUtils.lerp(this.rightArmPivot.rotation.x, -0.15, damp);
      this.bodyPivot.position.y = Math.sin(this.walkPhase) * 0.02;
    }
    this.bodyPivot.rotation.x = THREE.MathUtils.lerp(this.bodyPivot.rotation.x, 0, Math.min(1, dt * 12));
    this.bodyPivot.rotation.z = THREE.MathUtils.lerp(this.bodyPivot.rotation.z, 0, Math.min(1, dt * 12));
    this.rightArmPivot.rotation.z = THREE.MathUtils.lerp(this.rightArmPivot.rotation.z, 0, Math.min(1, dt * 12));
  }

  animateAttackSwing(progress: number, comboStep: number): void {
    // 0..1 attack arc animation
    const sweep = Math.sin(progress * Math.PI);
    if (comboStep === 1) {
      this.rightArmPivot.rotation.x = -1.6 + sweep * 2.4;
      this.rightArmPivot.rotation.z = -0.6 + sweep * 1.1;
      this.bodyPivot.rotation.y = (progress - 0.5) * 0.9;
    } else if (comboStep === 2) {
      this.rightArmPivot.rotation.x = -1.3;
      this.rightArmPivot.rotation.z = 0.8 - sweep * 1.8;
      this.bodyPivot.rotation.y = -(progress - 0.5) * 1.1;
    } else {
      // Heavy overhead/spin finisher
      this.rightArmPivot.rotation.x = -2.2 + sweep * 2.9;
      this.leftArmPivot.rotation.x = -0.8;
      this.bodyPivot.position.y = sweep * 0.25;
      this.bodyPivot.rotation.y = progress * Math.PI * 2;
    }
  }

  animateSpin(dt: number): void {
    this.bodyPivot.rotation.y += dt * 22;
    this.rightArmPivot.rotation.x = -1.45;
    this.leftArmPivot.rotation.x = -1.1;
  }

  animateDodgeRoll(progress: number): void {
    this.bodyPivot.rotation.x = progress * Math.PI * 2;
    this.bodyPivot.position.y = Math.sin(progress * Math.PI) * 0.35;
  }

  animateCower(time: number, sos: boolean): void {
    this.bodyPivot.position.y = -0.22;
    this.bodyPivot.rotation.x = 0.25;
    this.leftArmPivot.rotation.x = sos ? -2.6 + Math.sin(time * 14) * 0.35 : -2.1;
    this.rightArmPivot.rotation.x = sos ? -2.6 - Math.sin(time * 14) * 0.35 : -2.1;
    this.leftLegPivot.rotation.x = -0.5;
    this.rightLegPivot.rotation.x = -0.5;
  }

  animateFainted(dt: number): void {
    this.bodyPivot.position.y = 0.18;
    this.bodyPivot.rotation.x = -Math.PI * 0.45;
    this.setStunned(true, dt);
  }

  animateCheer(time: number): void {
    this.bodyPivot.rotation.x = 0;
    this.bodyPivot.position.y = Math.abs(Math.sin(time * 8)) * 0.22;
    this.leftArmPivot.rotation.x = -2.7;
    this.rightArmPivot.rotation.x = -2.7;
  }

  resetPose(): void {
    this.bodyPivot.position.set(0, 0, 0);
    this.bodyPivot.rotation.set(0, 0, 0);
    this.leftArmPivot.rotation.set(0, 0, 0);
    this.rightArmPivot.rotation.set(0, 0, 0);
    this.leftLegPivot.rotation.set(0, 0, 0);
    this.rightLegPivot.rotation.set(0, 0, 0);
    this.stunRing.visible = false;
    this.setChalked(false);
  }
}

export function createWeaponMesh(type: WeaponType): THREE.Group {
  const group = new THREE.Group();
  const flat = (color: number, roughness = 0.7) =>
    new THREE.MeshStandardMaterial({ color, flatShading: true, roughness });

  if (type === 'mop') {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 1.65, 6), flat(0xd2a679));
    pole.rotation.x = Math.PI / 2;
    pole.position.z = 0.55;
    const headBase = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.09, 0.14), flat(0x29b6f6));
    headBase.position.z = 1.38;
    const bristles = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.14, 0.24), flat(0xeef2f6));
    bristles.position.set(0, -0.02, 1.46);
    group.add(pole, headBase, bristles);
  } else if (type === 'shinai') {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.038, 0.36, 6), flat(0xf8f9fa));
    handle.rotation.x = Math.PI / 2;
    handle.position.z = 0.08;
    const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.03, 8), flat(0x5d4037));
    guard.rotation.x = Math.PI / 2;
    guard.position.z = 0.26;
    const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.035, 1.28, 6), flat(0xf3d299));
    blade.rotation.x = Math.PI / 2;
    blade.position.z = 0.9;
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.14, 6), flat(0xffffff));
    tip.rotation.x = Math.PI / 2;
    tip.position.z = 1.5;
    group.add(handle, guard, blade, tip);
  } else if (type === 'extinguisher') {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.56, 8), flat(0xe53935, 0.35));
    tank.rotation.x = Math.PI / 2.6;
    tank.position.set(0, 0.04, 0.28);
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.144, 0.144, 0.16, 8), flat(0xffeb3b));
    label.rotation.x = Math.PI / 2.6;
    label.position.set(0, 0.04, 0.28);
    const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.24, 6), flat(0x212121));
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.set(0, 0.14, 0.54);
    group.add(tank, label, nozzle);
  } else if (type === 'eraser') {
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.09, 0.3), flat(0xd99b52));
    back.position.set(0, 0.04, 0.14);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.09, 0.32), flat(0xff7043));
    pad.position.set(0, -0.03, 0.14);
    const felt = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.32), flat(0xf5f5f5));
    felt.position.set(0, -0.09, 0.14);
    group.add(back, pad, felt);
  }

  return group;
}

function createEnemyGunMesh(heavy: boolean): THREE.Group {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({
    color: heavy ? 0x263238 : 0x2f3542,
    flatShading: true,
    roughness: 0.45,
    metalness: 0.55
  });
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(heavy ? 0.16 : 0.09, heavy ? 0.18 : 0.12, heavy ? 0.78 : 0.45),
    metal
  );
  body.position.set(0, 0.02, heavy ? 0.35 : 0.2);
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(heavy ? 0.055 : 0.028, heavy ? 0.055 : 0.028, heavy ? 0.55 : 0.3, 6),
    metal
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.05, heavy ? 0.85 : 0.48);
  g.add(body, barrel);

  if (heavy) {
    const laserTip = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.06, 0.08),
      new THREE.MeshStandardMaterial({ color: 0xff1744, emissive: 0xff1744 })
    );
    laserTip.position.set(0, -0.04, 0.72);
    g.add(laserTip);
  }
  return g;
}
