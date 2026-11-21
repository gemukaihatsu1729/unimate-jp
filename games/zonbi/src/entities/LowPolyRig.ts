import * as THREE from 'three';
import type { WeaponId, ZombieSpec } from '../data';

function flatMat(
  color: number,
  roughness = 0.72,
  metalness = 0.08,
  emissive = 0x000000,
  emissiveIntensity = 0
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    flatShading: true,
    roughness,
    metalness,
    emissive,
    emissiveIntensity
  });
}

// Shared low-poly geometries for blazing 60fps mobile WebGL performance across 60+ zombies
const SHARED_GEO = {
  leg: new THREE.BoxGeometry(0.19, 0.52, 0.2),
  shoe: new THREE.BoxGeometry(0.21, 0.12, 0.28),
  torso: new THREE.BoxGeometry(0.52, 0.58, 0.29),
  arm: new THREE.BoxGeometry(0.16, 0.5, 0.16),
  head: new THREE.BoxGeometry(0.4, 0.4, 0.4),
  eye: new THREE.BoxGeometry(0.075, 0.075, 0.05),
  iceCrystal: new THREE.OctahedronGeometry(0.75, 0),
  hpBg: new THREE.PlaneGeometry(0.9, 0.13),
  hpFill: new THREE.PlaneGeometry(0.86, 0.09),
  dangerRing: new THREE.RingGeometry(0.55, 0.86, 18)
};

export class HeroRig {
  public readonly root = new THREE.Group();
  public readonly bodyPivot = new THREE.Group();
  public readonly headPivot = new THREE.Group();
  public readonly leftArmPivot = new THREE.Group();
  public readonly rightArmPivot = new THREE.Group();
  public readonly leftLegPivot = new THREE.Group();
  public readonly rightLegPivot = new THREE.Group();
  public readonly rightWeaponMount = new THREE.Group();
  public readonly leftWeaponMount = new THREE.Group();
  private scarfMesh: THREE.Mesh;
  private auraRing: THREE.Mesh;

  private weaponGroups = new Map<WeaponId, THREE.Object3D[]>();
  private walkPhase = 0;

  constructor() {
    this.root.add(this.bodyPivot);

    // Legs
    const pantsMat = flatMat(0x1e293b);
    const bootMat = flatMat(0x0f172a, 0.55, 0.2);
    const buildLeg = (pivot: THREE.Group, x: number) => {
      pivot.position.set(x, 0.54, 0);
      const leg = new THREE.Mesh(SHARED_GEO.leg, pantsMat);
      leg.position.y = -0.26;
      leg.castShadow = true;
      pivot.add(leg);
      const shoe = new THREE.Mesh(SHARED_GEO.shoe, bootMat);
      shoe.position.set(0, -0.5, 0.04);
      pivot.add(shoe);
      this.bodyPivot.add(pivot);
    };
    buildLeg(this.leftLegPivot, -0.15);
    buildLeg(this.rightLegPivot, 0.15);

    // Torso (Tactical hero jacket + glowing chest plate)
    const torso = new THREE.Mesh(SHARED_GEO.torso, flatMat(0x2563eb, 0.65, 0.12));
    torso.position.y = 0.85;
    torso.castShadow = true;
    this.bodyPivot.add(torso);

    const vest = new THREE.Mesh(
      new THREE.BoxGeometry(0.56, 0.36, 0.34),
      flatMat(0x1e293b, 0.55, 0.25)
    );
    vest.position.set(0, 0.9, 0);
    this.bodyPivot.add(vest);

    // Heroic flowing red-gold scarf/cape
    this.scarfMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.44, 0.68, 0.07),
      flatMat(0xf59e0b, 0.72, 0.05, 0xd97706, 0.25)
    );
    this.scarfMesh.position.set(0, 0.86, -0.22);
    this.scarfMesh.rotation.x = 0.22;
    this.bodyPivot.add(this.scarfMesh);

    // Head + spiky hair + bright hero eyes
    this.headPivot.position.set(0, 1.18, 0);
    const head = new THREE.Mesh(SHARED_GEO.head, flatMat(0xfcd5b5));
    head.position.y = 0.21;
    head.castShadow = true;
    this.headPivot.add(head);

    const hairMat = flatMat(0x111827, 0.8);
    const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.19, 0.46), hairMat);
    hairTop.position.set(0, 0.42, -0.02);
    this.headPivot.add(hairTop);

    const hairSpike = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.32, 4), hairMat);
    hairSpike.position.set(0, 0.54, 0.08);
    hairSpike.rotation.x = 0.38;
    this.headPivot.add(hairSpike);

    // Glowing cyan visor headband
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.09, 0.1),
      flatMat(0x38bdf8, 0.2, 0.2, 0x38bdf8, 0.9)
    );
    visor.position.set(0, 0.27, 0.19);
    this.headPivot.add(visor);
    this.bodyPivot.add(this.headPivot);

    // Arms + Weapon Mounts
    const sleeveMat = flatMat(0x1d4ed8);
    const gloveMat = flatMat(0x0f172a);
    const buildArm = (pivot: THREE.Group, x: number, mount: THREE.Group) => {
      pivot.position.set(x, 1.07, 0);
      const arm = new THREE.Mesh(SHARED_GEO.arm, sleeveMat);
      arm.position.y = -0.22;
      arm.castShadow = true;
      pivot.add(arm);
      const glove = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.15, 0.18), gloveMat);
      glove.position.y = -0.46;
      pivot.add(glove);
      mount.position.set(0, -0.48, 0.08);
      pivot.add(mount);
      this.bodyPivot.add(pivot);
    };
    buildArm(this.leftArmPivot, -0.36, this.leftWeaponMount);
    buildArm(this.rightArmPivot, 0.36, this.rightWeaponMount);

    // Ground selection / Musou aura ring beneath hero
    this.auraRing = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.78, 18),
      new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.45
      })
    );
    this.auraRing.rotation.x = -Math.PI / 2;
    this.auraRing.position.y = 0.06;
    this.root.add(this.auraRing);

    this.buildAllWeapons();
    this.setWeapon('greatsword');
  }

  private buildAllWeapons(): void {
    // 1. Blaze Greatsword (Giant blazing low-poly broadsword)
    const gs = new THREE.Group();
    const gsHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6), flatMat(0x1e293b));
    gsHandle.rotation.x = Math.PI / 2;
    gs.add(gsHandle);
    const gsGuard = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.11, 0.14), flatMat(0xf59e0b, 0.35, 0.6));
    gsGuard.position.z = 0.24;
    gs.add(gsGuard);
    const gsBlade = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.07, 1.85),
      flatMat(0xff6d00, 0.3, 0.45, 0xff5500, 0.85)
    );
    gsBlade.position.z = 1.2;
    gsBlade.castShadow = true;
    gs.add(gsBlade);
    const gsTip = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.42, 4),
      flatMat(0xfde047, 0.2, 0.3, 0xffaa00, 1.1)
    );
    gsTip.rotation.x = Math.PI / 2;
    gsTip.rotation.y = Math.PI / 4;
    gsTip.position.z = 2.3;
    gs.add(gsTip);
    this.rightWeaponMount.add(gs);
    this.weaponGroups.set('greatsword', [gs]);

    // 2. Twin Blades (Dual glowing crimson cyber-katanas in BOTH hands!)
    const makeBlade = () => {
      const tb = new THREE.Group();
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.36, 6), flatMat(0x0f172a));
      handle.rotation.x = Math.PI / 2;
      tb.add(handle);
      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(0.11, 0.05, 1.38),
        flatMat(0xff2a6d, 0.25, 0.4, 0xff2a6d, 0.95)
      );
      edge.position.z = 0.84;
      edge.castShadow = true;
      tb.add(edge);
      return tb;
    };
    const tbR = makeBlade();
    const tbL = makeBlade();
    this.rightWeaponMount.add(tbR);
    this.leftWeaponMount.add(tbL);
    this.weaponGroups.set('twinblade', [tbR, tbL]);

    // 3. Thunder Hammer (Sleek electric warhammer with glowing cyan plasma coils)
    const hm = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.35, 6), flatMat(0x64748b, 0.45, 0.5));
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = 0.56;
    hm.add(shaft);
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.64, 0.42, 0.46),
      flatMat(0x334155, 0.35, 0.55)
    );
    head.position.z = 1.28;
    head.castShadow = true;
    hm.add(head);
    const coil = new THREE.Mesh(
      new THREE.BoxGeometry(0.70, 0.22, 0.28),
      flatMat(0x38bdf8, 0.15, 0.2, 0x00d4ff, 1.35)
    );
    coil.position.z = 1.28;
    hm.add(coil);
    this.rightWeaponMount.add(hm);
    this.weaponGroups.set('hammer', [hm]);
  }

  setWeapon(id: WeaponId): void {
    for (const [wid, objs] of this.weaponGroups) {
      const show = wid === id;
      for (const o of objs) o.visible = show;
    }
    const ringMat = this.auraRing.material as THREE.MeshBasicMaterial;
    ringMat.color.setHex(id === 'greatsword' ? 0xfb923c : id === 'twinblade' ? 0xff4d8d : 0x38bdf8);
  }

  animate(
    dt: number,
    moveRatio: number,
    attackProgress: number, // -1 if idle, 0..1 during swing
    comboStep: number,
    isStrong: boolean,
    isDodging: boolean,
    musouReady: boolean,
    time: number
  ): void {
    // Aura ring pulses gold when Musou is 100% READY
    const ringMat = this.auraRing.material as THREE.MeshBasicMaterial;
    if (musouReady) {
      ringMat.color.setHex(0xfde047);
      ringMat.opacity = 0.55 + Math.sin(time * 10) * 0.28;
      this.auraRing.scale.setScalar(1.08 + Math.sin(time * 10) * 0.1);
    } else {
      ringMat.opacity = 0.32;
      this.auraRing.scale.setScalar(1.0);
    }

    // Leg & body run bounce
    if (moveRatio > 0.05) {
      this.walkPhase += dt * (9.5 + moveRatio * 6);
      const s = Math.sin(this.walkPhase);
      this.leftLegPivot.rotation.x = s * 0.72 * moveRatio;
      this.rightLegPivot.rotation.x = -s * 0.72 * moveRatio;
      this.bodyPivot.position.y = Math.abs(Math.cos(this.walkPhase)) * 0.08 * moveRatio;
      this.scarfMesh.rotation.x = 0.32 + Math.abs(s) * 0.36;
    } else {
      this.leftLegPivot.rotation.x *= 0.8;
      this.rightLegPivot.rotation.x *= 0.8;
      this.bodyPivot.position.y = Math.sin(time * 3.2) * 0.025;
      this.scarfMesh.rotation.x = 0.2 + Math.sin(time * 4) * 0.08;
    }

    if (isDodging) {
      this.bodyPivot.rotation.x = 0.55;
      this.bodyPivot.rotation.y = 0;
      this.rightArmPivot.rotation.set(0.6, 0, -0.4);
      this.leftArmPivot.rotation.set(0.6, 0, 0.4);
      return;
    }

    if (attackProgress >= 0) {
      const p = attackProgress;
      if (isStrong) {
        // Dramatic 360 spin / heavy slam!
        this.bodyPivot.rotation.y = p * Math.PI * 2;
        this.bodyPivot.rotation.x = 0.25 * Math.sin(p * Math.PI);
        this.rightArmPivot.rotation.set(-1.35, 0, -0.9);
        this.leftArmPivot.rotation.set(-1.1, 0, 0.9);
      } else {
        // 4-step Musou alternating broad sweeps!
        const dir = comboStep % 2 === 0 ? 1 : -1;
        const swing = THREE.MathUtils.lerp(-1.55 * dir, 1.55 * dir, Math.min(1, p * 1.35));
        this.bodyPivot.rotation.y = swing * 0.65;
        this.bodyPivot.rotation.x = 0.16;
        this.rightArmPivot.rotation.set(-1.35, swing * 0.6, -0.45);
        this.leftArmPivot.rotation.set(-1.15, -swing * 0.5, 0.45);
      }
    } else {
      this.bodyPivot.rotation.x *= 0.78;
      this.bodyPivot.rotation.y *= 0.78;
      const idleSwing = Math.sin(this.walkPhase) * 0.45 * moveRatio;
      this.rightArmPivot.rotation.set(-0.35 + idleSwing, 0.42, -0.32);
      this.leftArmPivot.rotation.set(-0.35 - idleSwing, -0.3, 0.24);
    }
  }
}

export class ZombieRig {
  public readonly root = new THREE.Group();
  public readonly bodyPivot = new THREE.Group();
  private leftArm = new THREE.Group();
  private rightArm = new THREE.Group();
  private leftLeg = new THREE.Group();
  private rightLeg = new THREE.Group();
  private iceMesh: THREE.Mesh;
  private dangerRing: THREE.Mesh;
  private hpGroup = new THREE.Group();
  private hpFillMesh: THREE.Mesh;
  private flashMaterials: THREE.MeshStandardMaterial[] = [];
  private baseEmissives: number[] = [];
  private walkPhase = Math.random() * Math.PI * 2;

  constructor(spec: ZombieSpec) {
    this.root.add(this.bodyPivot);
    this.bodyPivot.scale.setScalar(spec.scale);

    const skinMat = flatMat(spec.skinColor, 0.82);
    const shirtMat = flatMat(spec.shirtColor, 0.88);
    const pantsMat = flatMat(spec.pantsColor, 0.9);
    const eyeMat = flatMat(spec.eyeColor, 0.2, 0.1, spec.eyeColor, 1.1);

    this.flashMaterials.push(skinMat, shirtMat);
    this.baseEmissives.push(0x000000, 0x000000);

    // Legs
    const addLeg = (pivot: THREE.Group, x: number) => {
      pivot.position.set(x, 0.52, 0);
      const m = new THREE.Mesh(SHARED_GEO.leg, pantsMat);
      m.position.y = -0.26;
      pivot.add(m);
      this.bodyPivot.add(pivot);
    };
    addLeg(this.leftLeg, -0.14);
    addLeg(this.rightLeg, 0.14);

    // Torso
    const torso = new THREE.Mesh(SHARED_GEO.torso, shirtMat);
    torso.position.y = 0.84;
    torso.castShadow = true;
    this.bodyPivot.add(torso);

    // Special Archetype Silhouette Features
    if (spec.kind === 'brute' || spec.isBoss) {
      const shoulderMat = flatMat(spec.isBoss ? 0x3f1d2e : 0x475569, 0.5, 0.35);
      for (const side of [-1, 1]) {
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.25, 0.34), shoulderMat);
        pad.position.set(side * 0.36, 1.08, 0);
        this.bodyPivot.add(pad);
      }
    }

    if (spec.explodes) {
      // Glowing volatile orange core on bomber's chest/belly
      const coreMat = flatMat(0xff6d00, 0.3, 0.1, 0xff5500, 1.25);
      const core = new THREE.Mesh(new THREE.DodecahedronGeometry(0.32, 0), coreMat);
      core.position.set(0, 0.84, 0.12);
      this.bodyPivot.add(core);
    }

    if (spec.isBoss) {
      // Boss crimson cape + horns
      const cape = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.9, 0.08), flatMat(0x7f1d1d));
      cape.position.set(0, 0.72, -0.22);
      cape.rotation.x = 0.2;
      this.bodyPivot.add(cape);
    }

    // Head + Glowing Eyes
    const head = new THREE.Mesh(SHARED_GEO.head, skinMat);
    head.position.set(0, 1.34, 0.04);
    head.castShadow = true;
    this.bodyPivot.add(head);

    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(SHARED_GEO.eye, eyeMat);
      eye.position.set(side * 0.09, 1.37, 0.24);
      this.bodyPivot.add(eye);
    }

    if (spec.isBoss) {
      const hornMat = flatMat(0xe2e8f0, 0.4, 0.2);
      for (const side of [-1, 1]) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.35, 4), hornMat);
        horn.position.set(side * 0.22, 1.58, 0.04);
        horn.rotation.z = -side * 0.52;
        this.bodyPivot.add(horn);
      }
    }

    // Outstretched Zombie Arms
    const addArm = (pivot: THREE.Group, x: number) => {
      pivot.position.set(x, 1.05, 0);
      const m = new THREE.Mesh(SHARED_GEO.arm, skinMat);
      m.position.y = -0.22;
      pivot.add(m);
      pivot.rotation.x = -1.25; // Classic reaching zombie arms!
      this.bodyPivot.add(pivot);
    };
    addArm(this.leftArm, -0.35);
    addArm(this.rightArm, 0.35);

    // Translucent Freeze Crystal (hidden unless frozen)
    this.iceMesh = new THREE.Mesh(
      SHARED_GEO.iceCrystal,
      new THREE.MeshStandardMaterial({
        color: 0x7dd3fc,
        emissive: 0x0284c7,
        emissiveIntensity: 0.45,
        flatShading: true,
        transparent: true,
        opacity: 0.58
      })
    );
    this.iceMesh.position.y = 0.9 * spec.scale;
    this.iceMesh.scale.set(spec.scale, spec.scale * 1.4, spec.scale);
    this.iceMesh.visible = false;
    this.root.add(this.iceMesh);

    // Pulsing Red Danger Ring under zombies actively attacking the Shelter Wall
    this.dangerRing = new THREE.Mesh(
      SHARED_GEO.dangerRing,
      new THREE.MeshBasicMaterial({
        color: 0xff2a55,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
        depthWrite: false
      })
    );
    this.dangerRing.rotation.x = -Math.PI / 2;
    this.dangerRing.position.y = 0.08;
    this.dangerRing.scale.setScalar(spec.scale);
    this.dangerRing.visible = false;
    this.root.add(this.dangerRing);

    // Compact 3D Billboard Health Bar
    const bg = new THREE.Mesh(
      SHARED_GEO.hpBg,
      new THREE.MeshBasicMaterial({ color: 0x090d14, side: THREE.DoubleSide })
    );
    this.hpFillMesh = new THREE.Mesh(
      SHARED_GEO.hpFill,
      new THREE.MeshBasicMaterial({ color: spec.isBoss ? 0xf87171 : 0x4ade80, side: THREE.DoubleSide })
    );
    this.hpFillMesh.position.z = 0.01;
    this.hpGroup.add(bg, this.hpFillMesh);
    this.hpGroup.position.y = 1.92 * spec.scale;
    this.hpGroup.scale.setScalar(spec.isBoss ? 1.65 : 1.0);
    this.hpGroup.visible = !!spec.isBoss;
    this.root.add(this.hpGroup);
  }

  updateVisuals(
    dt: number,
    moving: boolean,
    hitFlash: number,
    frozen: boolean,
    burning: boolean,
    hpRatio: number,
    cameraQuat: THREE.Quaternion,
    airborneSpin: number,
    attackingShelter = false
  ): void {
    this.iceMesh.visible = frozen;
    this.dangerRing.visible = attackingShelter && !frozen;
    if (this.dangerRing.visible) {
      this.walkPhase += dt * 11;
      const pulse = 1.0 + 0.18 * Math.sin(this.walkPhase * 1.6);
      this.dangerRing.scale.setScalar(this.bodyPivot.scale.x * pulse);
    }

    // Hit flash, burn glow, or shelter-breach danger highlight
    for (let i = 0; i < this.flashMaterials.length; i++) {
      const m = this.flashMaterials[i];
      if (hitFlash > 0) {
        m.emissive.setHex(0xffffff);
        m.emissiveIntensity = 0.95;
      } else if (burning) {
        m.emissive.setHex(0xf97316);
        m.emissiveIntensity = 0.45;
      } else if (attackingShelter) {
        m.emissive.setHex(0xef4444);
        m.emissiveIntensity = 0.28 + 0.22 * Math.max(0, Math.sin(this.walkPhase * 1.6));
      } else {
        m.emissive.setHex(this.baseEmissives[i]);
        m.emissiveIntensity = 0;
      }
    }

    // Launch ragdoll spin when sent flying by Musou attacks!
    if (airborneSpin > 0.01) {
      this.bodyPivot.rotation.x += dt * 9.5;
      this.bodyPivot.rotation.z += dt * 5.2;
    } else {
      this.bodyPivot.rotation.x *= 0.8;
      this.bodyPivot.rotation.z *= 0.8;
      if (attackingShelter && !frozen) {
        const s = Math.sin(this.walkPhase * 1.5);
        this.leftArm.rotation.x = -1.35 + s * 0.65;
        this.rightArm.rotation.x = -1.35 - s * 0.65;
        this.bodyPivot.rotation.x = Math.max(0, s) * 0.16;
      } else if (moving && !frozen) {
        this.walkPhase += dt * 7.5;
        const s = Math.sin(this.walkPhase);
        this.leftLeg.rotation.x = s * 0.6;
        this.rightLeg.rotation.x = -s * 0.6;
        this.leftArm.rotation.x = -1.25 + s * 0.25;
        this.rightArm.rotation.x = -1.25 - s * 0.25;
        this.bodyPivot.rotation.z = s * 0.08;
      }
    }

    // Health bar billboard (always show when damaged OR when attacking the shelter!)
    if (hpRatio < 0.999 || attackingShelter) {
      this.hpGroup.visible = true;
      const clamped = Math.max(0.01, Math.min(1, hpRatio));
      this.hpFillMesh.scale.x = clamped;
      this.hpFillMesh.position.x = -0.43 * (1 - clamped);
      this.hpGroup.quaternion.copy(cameraQuat);
    }
  }

  dispose(): void {
    for (const m of this.flashMaterials) m.dispose();
    (this.iceMesh.material as THREE.Material).dispose();
    (this.dangerRing.material as THREE.Material).dispose();
    (this.hpFillMesh.material as THREE.Material).dispose();
  }
}
