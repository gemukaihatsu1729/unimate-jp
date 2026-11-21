import * as THREE from 'three';
import type { EnemyKind } from '../types';

export interface WaveSpawnDef {
  kind: EnemyKind;
  pos: THREE.Vector3;
  delay: number;
  prefersClassmate?: boolean;
}

export interface WaveConfig {
  wave: number;
  title: string;
  cutinKicker: string;
  cutinTitle: string;
  cutinSub: string;
  unlocksHallway: boolean;
  spawns: WaveSpawnDef[];
}

export function createWaveConfigs(playerName: string): WaveConfig[] {
  return [
    {
      wave: 1,
      title: '教室突入！',
      cutinKicker: 'WAVE 1 — CLASSROOM CRISIS',
      cutinTitle: '【妄想発動】2年B組 襲撃！',
      cutinSub: `${playerName}「みんな伏せてろ！俺がやる…！」`,
      unlocksHallway: false,
      spawns: [
        { kind: 'grunt', pos: new THREE.Vector3(5.8, 0, -2.4), delay: 0.2 },
        { kind: 'grunt', pos: new THREE.Vector3(5.8, 0, 2.5), delay: 0.7, prefersClassmate: true },
        { kind: 'gunner', pos: new THREE.Vector3(5.7, 0, -1.9), delay: 1.8 },
        { kind: 'grunt', pos: new THREE.Vector3(5.8, 0, 2.8), delay: 3.0, prefersClassmate: true },
        { kind: 'grunt', pos: new THREE.Vector3(5.7, 0, -2.7), delay: 4.5 },
        { kind: 'gunner', pos: new THREE.Vector3(5.8, 0, 2.1), delay: 6.0 },
        { kind: 'grunt', pos: new THREE.Vector3(5.8, 0, -2.2), delay: 7.5, prefersClassmate: true }
      ]
    },
    {
      wave: 2,
      title: '廊下防衛戦！',
      cutinKicker: 'WAVE 2 — HALLWAY BREAKOUT',
      cutinTitle: '廊下封鎖突破！盾部隊が出現！',
      cutinSub: '消火器スモーク・竹刀・机キックでブチ抜け！',
      unlocksHallway: true,
      spawns: [
        { kind: 'shield', pos: new THREE.Vector3(9.4, 0, -2.5), delay: 0.4 },
        { kind: 'grunt', pos: new THREE.Vector3(9.5, 0, 2.8), delay: 0.9, prefersClassmate: true },
        { kind: 'gunner', pos: new THREE.Vector3(11.4, 0, -4.5), delay: 1.6 },
        { kind: 'grunt', pos: new THREE.Vector3(10.6, 0, 5.2), delay: 2.8 },
        { kind: 'shield', pos: new THREE.Vector3(10.2, 0, -6.5), delay: 4.2 },
        { kind: 'gunner', pos: new THREE.Vector3(11.8, 0, 3.8), delay: 5.5 },
        { kind: 'grunt', pos: new THREE.Vector3(8.5, 0, -3.5), delay: 6.8, prefersClassmate: true },
        { kind: 'gunner', pos: new THREE.Vector3(11.5, 0, -1.0), delay: 7.8 }
      ]
    },
    {
      wave: 3,
      title: '首領降臨！',
      cutinKicker: 'FINAL WAVE — BOSS BATTLE',
      cutinTitle: '首領『ブラック・ファントム』降臨！',
      cutinSub: `${playerName}の伝説がいま決まる！！`,
      unlocksHallway: true,
      spawns: [
        { kind: 'boss', pos: new THREE.Vector3(10.0, 0, -8.8), delay: 0.4 },
        { kind: 'grunt', pos: new THREE.Vector3(8.2, 0, -5.5), delay: 1.2, prefersClassmate: true },
        { kind: 'gunner', pos: new THREE.Vector3(12.0, 0, -5.0), delay: 2.2 },
        { kind: 'shield', pos: new THREE.Vector3(9.6, 0, 5.5), delay: 4.5 },
        { kind: 'grunt', pos: new THREE.Vector3(7.4, 0, 2.5), delay: 6.5, prefersClassmate: true },
        { kind: 'gunner', pos: new THREE.Vector3(11.8, 0, 2.2), delay: 8.0 }
      ]
    }
  ];
}

export class WaveManager {
  private waves: WaveConfig[] = [];
  private currentIndex = -1;
  private pendingSpawns: WaveSpawnDef[] = [];
  private waveElapsed = 0;

  reset(playerName: string): void {
    this.waves = createWaveConfigs(playerName);
    this.currentIndex = -1;
    this.pendingSpawns = [];
    this.waveElapsed = 0;
  }

  startNextWave(): WaveConfig | null {
    this.currentIndex++;
    if (this.currentIndex >= this.waves.length) {
      return null;
    }
    const cfg = this.waves[this.currentIndex];
    this.pendingSpawns = [...cfg.spawns];
    this.waveElapsed = 0;
    return cfg;
  }

  getCurrentWave(): WaveConfig | null {
    return this.waves[this.currentIndex] ?? null;
  }

  getRemainingSpawnsCount(): number {
    return this.pendingSpawns.length;
  }

  isAllWavesDone(): boolean {
    return this.currentIndex >= this.waves.length - 1 && this.pendingSpawns.length === 0;
  }

  update(dt: number, onSpawn: (def: WaveSpawnDef) => void): void {
    if (this.pendingSpawns.length === 0) return;
    this.waveElapsed += dt;
    for (let i = this.pendingSpawns.length - 1; i >= 0; i--) {
      if (this.waveElapsed >= this.pendingSpawns[i].delay) {
        const def = this.pendingSpawns.splice(i, 1)[0];
        onSpawn(def);
      }
    }
  }
}
