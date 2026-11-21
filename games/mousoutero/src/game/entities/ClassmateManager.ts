import * as THREE from 'three';
import { CharacterRig } from './CharacterMesh';

export interface ClassmateEntity {
  id: string;
  name: string;
  isHeroine: boolean;
  isFemale: boolean;
  rig: CharacterRig;
  seatPos: THREE.Vector3;
  hidePos: THREE.Vector3;
  pos: THREE.Vector3;
  hp: number;
  maxHp: number;
  fainted: boolean;
  sos: boolean;
  sosCooldown: number;
  rescueHealCooldown: number;
}

const CLASSMATE_CONFIGS = [
  {
    id: 'cm-sakura',
    name: 'さくら',
    isHeroine: true,
    isFemale: true,
    hairColor: 0x5c3a21,
    accentColor: 0xff66b2,
    seat: [-1.3, 0.3],
    hide: [-5.3, -2.2]
  },
  {
    id: 'cm-kenta',
    name: 'ケンタ',
    isHeroine: false,
    isFemale: false,
    hairColor: 0x262626,
    accentColor: 0x228be6,
    seat: [-1.3, 2.6],
    hide: [-5.3, 3.1]
  },
  {
    id: 'cm-misaki',
    name: 'ミサキ',
    isHeroine: false,
    isFemale: true,
    hairColor: 0x1e293b,
    accentColor: 0xf06595,
    seat: [-3.8, -2.0],
    hide: [-4.6, -4.3]
  },
  {
    id: 'cm-yuto',
    name: 'ユウト',
    isHeroine: false,
    isFemale: false,
    hairColor: 0x4a3420,
    accentColor: 0x15aabf,
    seat: [1.3, -2.0],
    hide: [3.9, -4.3]
  },
  {
    id: 'cm-rina',
    name: 'リナ',
    isHeroine: false,
    isFemale: true,
    hairColor: 0x9c6644,
    accentColor: 0xff922b,
    seat: [1.3, 2.6],
    hide: [-2.2, 4.1]
  },
  {
    id: 'cm-shota',
    name: 'ショウタ',
    isHeroine: false,
    isFemale: false,
    hairColor: 0x2c2c2c,
    accentColor: 0x40c057,
    seat: [3.8, 0.3],
    hide: [3.2, 4.1]
  }
] as const;

export class ClassmateManager {
  public readonly classmates: ClassmateEntity[] = [];
  private group = new THREE.Group();

  constructor(scene: THREE.Scene) {
    for (const cfg of CLASSMATE_CONFIGS) {
      const rig = new CharacterRig({
        skinColor: 0xf7ceb0,
        torsoColor: 0x23314c,
        pantsColor: cfg.isFemale ? 0x3b4d70 : 0x2a3447,
        hairColor: cfg.hairColor,
        accentColor: cfg.accentColor,
        scale: cfg.isHeroine ? 0.94 : 0.96,
        role: cfg.isHeroine ? 'heroine' : 'classmate'
      });

      const seatPos = new THREE.Vector3(cfg.seat[0], 0, cfg.seat[1] + 0.55);
      const hidePos = new THREE.Vector3(cfg.hide[0], 0, cfg.hide[1]);
      rig.root.position.copy(seatPos);
      this.group.add(rig.root);

      this.classmates.push({
        id: cfg.id,
        name: cfg.name,
        isHeroine: cfg.isHeroine,
        isFemale: cfg.isFemale,
        rig,
        seatPos,
        hidePos,
        pos: seatPos.clone(),
        hp: 120,
        maxHp: 120,
        fainted: false,
        sos: false,
        sosCooldown: 0,
        rescueHealCooldown: 0
      });
    }
    scene.add(this.group);
  }

  setMode(mode: 'seated' | 'hiding' | 'cheering'): void {
    for (const cm of this.classmates) {
      cm.rig.resetPose();
      cm.rig.setStunned(false, 0);
      if (mode === 'seated') {
        cm.hp = cm.maxHp;
        cm.fainted = false;
        cm.sos = false;
        cm.pos.copy(cm.seatPos);
        cm.rig.root.position.copy(cm.seatPos);
        cm.rig.root.rotation.y = Math.PI; // Facing blackboard (-Z)
      } else if (mode === 'hiding') {
        cm.hp = cm.maxHp;
        cm.fainted = false;
        cm.sos = false;
        cm.sosCooldown = 0;
        cm.rescueHealCooldown = 0;
        cm.pos.copy(cm.hidePos);
        cm.rig.root.position.copy(cm.hidePos);
        cm.rig.root.rotation.y = Math.atan2(-cm.hidePos.x, -cm.hidePos.z);
      }
    }
  }

  getAliveCount(): number {
    return this.classmates.filter((c) => !c.fainted).length;
  }

  getTotalCount(): number {
    return this.classmates.length;
  }

  getSosClassmates(): ClassmateEntity[] {
    return this.classmates.filter((c) => !c.fainted && c.sos);
  }

  findNearestAlive(x: number, z: number): ClassmateEntity | null {
    let best: ClassmateEntity | null = null;
    let bestD = Infinity;
    for (const cm of this.classmates) {
      if (cm.fainted) continue;
      const d = Math.hypot(cm.pos.x - x, cm.pos.z - z);
      if (d < bestD) {
        bestD = d;
        best = cm;
      }
    }
    return best;
  }

  findRescuableNear(x: number, z: number, radius = 2.4): ClassmateEntity | null {
    let best: ClassmateEntity | null = null;
    let bestD = radius;
    for (const cm of this.classmates) {
      if (cm.fainted) continue;
      if (cm.hp >= cm.maxHp && !cm.sos) continue;
      if (cm.rescueHealCooldown > 0) continue;
      const d = Math.hypot(cm.pos.x - x, cm.pos.z - z);
      if (d < bestD) {
        bestD = d;
        best = cm;
      }
    }
    return best;
  }

  encourageClassmate(cm: ClassmateEntity): number {
    const healed = Math.min(cm.maxHp - cm.hp, 45);
    cm.hp = Math.min(cm.maxHp, cm.hp + 45);
    cm.sos = false;
    cm.rescueHealCooldown = 4.0;
    return healed;
  }

  damageClassmate(
    cm: ClassmateEntity,
    amount: number,
    onSosCall: (cm: ClassmateEntity) => void,
    onFainted: (cm: ClassmateEntity) => void
  ): void {
    if (cm.fainted) return;
    cm.hp = Math.max(0, cm.hp - amount);
    cm.sos = true;
    if (cm.sosCooldown <= 0) {
      cm.sosCooldown = 5.5;
      onSosCall(cm);
    }
    if (cm.hp <= 0) {
      cm.fainted = true;
      cm.sos = false;
      onFainted(cm);
    }
  }

  update(
    dt: number,
    elapsed: number,
    phase: 'seated' | 'battle' | 'cheering',
    enemyPositions: THREE.Vector3[]
  ): void {
    for (const cm of this.classmates) {
      if (cm.sosCooldown > 0) cm.sosCooldown -= dt;
      if (cm.rescueHealCooldown > 0) cm.rescueHealCooldown -= dt;

      if (phase === 'seated') {
        cm.rig.bodyPivot.position.y = -0.26;
        cm.rig.leftLegPivot.rotation.x = -1.2;
        cm.rig.rightLegPivot.rotation.x = -1.2;
        cm.rig.leftArmPivot.rotation.x = -0.6;
        cm.rig.rightArmPivot.rotation.x = -0.6;
        continue;
      }

      if (cm.fainted) {
        cm.rig.animateFainted(dt);
        continue;
      }

      if (phase === 'cheering') {
        cm.rig.animateCheer(elapsed + cm.pos.x);
        continue;
      }

      // Battle phase: check if any enemy is threatening this classmate
      let threatened = false;
      for (const ep of enemyPositions) {
        if (Math.hypot(ep.x - cm.pos.x, ep.z - cm.pos.z) < 3.2) {
          threatened = true;
          break;
        }
      }
      cm.sos = threatened || cm.hp < cm.maxHp * 0.65;
      cm.rig.animateCower(elapsed + cm.pos.z, cm.sos);
    }
  }
}
