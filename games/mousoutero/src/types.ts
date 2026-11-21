export type GamePhase =
  | 'title'
  | 'intro'
  | 'cutin'
  | 'playing'
  | 'victory_ochi'
  | 'defeat_ochi'
  | 'result';

export type WeaponType = 'fist' | 'mop' | 'shinai' | 'extinguisher' | 'eraser';

export type EnemyKind = 'grunt' | 'gunner' | 'shield' | 'boss';

export type RankGrade = 'SS' | 'S' | 'A' | 'B' | 'C';

export interface WeaponSpec {
  id: WeaponType;
  name: string;
  shortName: string;
  icon: string;
  specialName: string;
  specialButtonLabel: string;
  attackDamage: number;
  attackRange: number;
  attackArc: number; // radians (half-angle)
  attackCooldown: number;
  knockback: number;
  specialCooldown: number;
  specialDamage: number;
  maxDurability: number; // 0 = infinite
  color: string;
}

export const WEAPON_SPECS: Record<WeaponType, WeaponSpec> = {
  fist: {
    id: 'fist',
    name: '素手（気合）',
    shortName: '素手',
    icon: '👊',
    specialName: '気合タックル',
    specialButtonLabel: 'タックル',
    attackDamage: 28,
    attackRange: 2.45,
    attackArc: Math.PI * 0.58,
    attackCooldown: 0.23,
    knockback: 8.2,
    specialCooldown: 2.5,
    specialDamage: 52,
    maxDurability: 0,
    color: '#ff9800'
  },
  mop: {
    id: 'mop',
    name: '教室のモップ',
    shortName: 'モップ',
    icon: '🧹',
    specialName: 'モップハリケーン',
    specialButtonLabel: '回転斬り',
    attackDamage: 38,
    attackRange: 3.55,
    attackArc: Math.PI * 0.74,
    attackCooldown: 0.29,
    knockback: 12.0,
    specialCooldown: 3.0,
    specialDamage: 66,
    maxDurability: 24,
    color: '#29b6f6'
  },
  shinai: {
    id: 'shinai',
    name: '部活の竹刀',
    shortName: '竹刀',
    icon: '⚔️',
    specialName: '閃光パリィ突き',
    specialButtonLabel: 'パリィ突き',
    attackDamage: 48,
    attackRange: 3.2,
    attackArc: Math.PI * 0.6,
    attackCooldown: 0.22,
    knockback: 10.0,
    specialCooldown: 2.6,
    specialDamage: 82,
    maxDurability: 26,
    color: '#ffd54f'
  },
  extinguisher: {
    id: 'extinguisher',
    name: '大型消火器',
    shortName: '消火器',
    icon: '🧯',
    specialName: '高圧スモーク噴射',
    specialButtonLabel: '煙幕噴射',
    attackDamage: 44,
    attackRange: 2.75,
    attackArc: Math.PI * 0.58,
    attackCooldown: 0.33,
    knockback: 13.5,
    specialCooldown: 3.2,
    specialDamage: 32,
    maxDurability: 20,
    color: '#ef5350'
  },
  eraser: {
    id: 'eraser',
    name: '黒板消し',
    shortName: '黒板消し',
    icon: '🧽',
    specialName: 'チョーク爆弾スロー',
    specialButtonLabel: 'チョーク弾',
    attackDamage: 32,
    attackRange: 2.6,
    attackArc: Math.PI * 0.62,
    attackCooldown: 0.24,
    knockback: 9.0,
    specialCooldown: 2.1,
    specialDamage: 58,
    maxDurability: 16,
    color: '#eeeeee'
  }
};

export interface AABBCollider {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
  blocksMovement: boolean;
  blocksBullets: boolean;
  blocksCamera: boolean;
  isCover?: boolean;
}

export interface ScoreInput {
  killsGrunt: number;
  killsGunner: number;
  killsShield: number;
  killsBoss: number;
  survivorsAlive: number;
  totalSurvivors: number;
  maxCombo: number;
  techBonus: number;
  cleared: boolean;
}

export interface ScoreBreakdown {
  killScore: number;
  survivorScore: number;
  perfectDefenseBonus: number;
  comboScore: number;
  techBonus: number;
  clearBonus: number;
  totalScore: number;
  totalKills: number;
  survivorsAlive: number;
  totalSurvivors: number;
  rank: RankGrade;
}

export interface RankingEntry {
  id: string;
  playerName: string;
  score: number;
  kills: number;
  survivorsAlive: number;
  totalSurvivors: number;
  maxCombo: number;
  rank: RankGrade;
  cleared: boolean;
  isPreset?: boolean;
  createdAt: number;
}

export interface ContextPrompt {
  label: string;
  sublabel?: string;
  kind: 'pickup' | 'desk_barricade' | 'desk_kick' | 'rescue';
  highlight: boolean;
}

export interface HudSnapshot {
  hp: number;
  maxHp: number;
  delusionGauge: number; // 0..100
  awakened: boolean;
  awakenedTimeLeft: number;
  weapon: WeaponType;
  weaponDurability: number;
  weaponMaxDurability: number;
  specialCooldownRatio: number; // 0 = ready, 1 = full cooldown
  dodgeCooldownRatio: number;
  combo: number;
  comboTimerRatio: number;
  score: number;
  kills: number;
  survivorsAlive: number;
  totalSurvivors: number;
  wave: number;
  waveTitle: string;
  enemiesRemaining: number;
  bossHpRatio: number | null;
  bossName: string;
  contextPrompt: ContextPrompt | null;
  sosCount: number;
  muted: boolean;
}

export interface FloatingPop {
  text: string;
  worldX: number;
  worldY: number;
  worldZ: number;
  color: string;
  scale?: number;
}
