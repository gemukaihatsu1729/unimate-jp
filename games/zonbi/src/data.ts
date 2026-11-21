export type WeaponId = 'greatsword' | 'twinblade' | 'hammer';
export type TurretId = 'sentry' | 'flame' | 'tesla' | 'missile';
export type SpecialTurretId = 'flame' | 'tesla' | 'missile';
export type UltimateId = 'cluster' | 'blizzard' | 'aegis';
export type ZombieKind = 'walker' | 'runner' | 'brute' | 'bomber' | 'boss';

export interface LoadoutConfig {
  weaponId: WeaponId;
  turretId: SpecialTurretId;
  ultimateId: UltimateId;
}

export interface WeaponSpec {
  id: WeaponId;
  name: string;
  shortName: string;
  icon: string;
  sub: string;
  desc: string;
  color: number;
  slashHex: number;
  damage: number;
  strongDamage: number;
  range: number;
  strongRange: number;
  arcHalfAngle: number; // radians
  comboCadence: number; // seconds per swing
  strongCooldown: number;
  moveSpeed: number;
  knockback: number;
  strongKnockback: number;
  strongStyle: 'whirlwind' | 'dash_flurry' | 'thunder_slam';
}

export interface TurretLevelSpec {
  damage: number;
  fireRate: number;
  range: number;
  splash?: number;
  chains?: number;
  burnDps?: number;
}

export interface TurretSpec {
  id: TurretId;
  name: string;
  shortName: string;
  icon: string;
  sub: string;
  desc: string;
  cost: number;
  upgradeCosts: [number, number];
  color: number;
  accent: number;
  levels: [TurretLevelSpec, TurretLevelSpec, TurretLevelSpec];
}

export interface UltimateSpec {
  id: UltimateId;
  name: string;
  shortName: string;
  icon: string;
  sub: string;
  desc: string;
  color: number;
}

export interface ZombieSpec {
  kind: ZombieKind;
  name: string;
  hp: number;
  speed: number;
  radius: number;
  scale: number;
  damage: number;
  shelterDamage: number;
  attackRate: number;
  scrap: number;
  skinColor: number;
  shirtColor: number;
  pantsColor: number;
  eyeColor: number;
  explodes?: boolean;
  isBoss?: boolean;
}

export interface WaveDefinition {
  wave: number;
  isBossWave: boolean;
  bossCount: number;
  queue: ZombieKind[];
  totalZombies: number;
  hpMult: number;
  speedMult: number;
  dmgMult: number;
  spawnInterval: number;
  clearBonus: number;
}

export interface RunMods {
  heroDamage: number;
  heroRange: number;
  turretDamage: number;
  turretRate: number;
  musouGain: number;
  scrapMult: number;
}

export interface PerkDef {
  id: string;
  icon: string;
  title: string;
  desc: string;
  apply: (mods: RunMods, helpers: { boostShelter: (addMax: number, heal: number) => void; giveScrap: (n: number) => void; fillMusou: () => void }) => void;
}

export const WEAPONS: Record<WeaponId, WeaponSpec> = {
  greatsword: {
    id: 'greatsword',
    name: 'ブレイズ大剣',
    shortName: 'ブレイズ大剣',
    icon: '🔥',
    sub: '広範囲・炎上無双',
    desc: '圧倒的リーチの炎上斬撃でゾンビの大群を一気に薙ぎ払う大剣。強撃で360°炎の大回転斬り！',
    color: 0xff6d00,
    slashHex: 0xff9100,
    damage: 34,
    strongDamage: 78,
    range: 4.1,
    strongRange: 5.2,
    arcHalfAngle: 1.42,
    comboCadence: 0.28,
    strongCooldown: 3.4,
    moveSpeed: 8.2,
    knockback: 6.2,
    strongKnockback: 11.5,
    strongStyle: 'whirlwind'
  },
  twinblade: {
    id: 'twinblade',
    name: '疾風ツインブレード',
    shortName: 'ツイン刃',
    icon: '⚔️',
    sub: '超速連撃・機動MAX',
    desc: '目にも止まらぬ超高速連撃でコンボと無双ゲージを素早くチャージ！強撃で敵陣を切り裂く突進乱舞！',
    color: 0xff2a6d,
    slashHex: 0xff4d8d,
    damage: 22,
    strongDamage: 66,
    range: 3.3,
    strongRange: 4.6,
    arcHalfAngle: 1.2,
    comboCadence: 0.17,
    strongCooldown: 2.8,
    moveSpeed: 9.8,
    knockback: 4.5,
    strongKnockback: 9.0,
    strongStyle: 'dash_flurry'
  },
  hammer: {
    id: 'hammer',
    name: 'サンダーハンマー',
    shortName: '雷ハンマー',
    icon: '⚡',
    sub: '超吹飛・電撃粉砕',
    desc: '重厚な一撃でゾンビ群を空高く吹っ飛ばす電磁戦槌！強撃で広範囲を感電凍結させる大地粉砕！',
    color: 0x00d4ff,
    slashHex: 0x38bdf8,
    damage: 52,
    strongDamage: 108,
    range: 3.8,
    strongRange: 5.8,
    arcHalfAngle: 1.55,
    comboCadence: 0.39,
    strongCooldown: 3.8,
    moveSpeed: 7.6,
    knockback: 10.0,
    strongKnockback: 15.0,
    strongStyle: 'thunder_slam'
  }
};

export const TURRETS: Record<TurretId, TurretSpec> = {
  sentry: {
    id: 'sentry',
    name: 'オート機銃',
    shortName: '機銃',
    icon: '🎯',
    sub: '低コスト速射',
    desc: '安価に設置できる自動連射砲塔。序盤の避難所防衛ラインを素早く構築。',
    cost: 55,
    upgradeCosts: [85, 145],
    color: 0x64748b,
    accent: 0xfde047,
    levels: [
      { damage: 13, fireRate: 4.0, range: 9.5 },
      { damage: 22, fireRate: 5.0, range: 10.8 },
      { damage: 35, fireRate: 6.2, range: 12.0 }
    ]
  },
  flame: {
    id: 'flame',
    name: '火炎放射塔',
    shortName: '火炎塔',
    icon: '🔥',
    sub: '前方焼却・炎上',
    desc: '接近するゾンビの群れを業火でまとめて焼き払い、継続炎上ダメージを与える防衛塔。',
    cost: 95,
    upgradeCosts: [130, 210],
    color: 0xea580c,
    accent: 0xfdba74,
    levels: [
      { damage: 11, fireRate: 5.2, range: 8.0, burnDps: 12 },
      { damage: 19, fireRate: 6.2, range: 9.0, burnDps: 20 },
      { damage: 30, fireRate: 7.2, range: 10.2, burnDps: 32 }
    ]
  },
  tesla: {
    id: 'tesla',
    name: 'テスラ電撃塔',
    shortName: '電撃塔',
    icon: '🌩️',
    sub: '連鎖電撃・減速',
    desc: '最大5体のゾンビに連鎖する高圧電撃を放ち、足止め減速で避難所への接近を阻止。',
    cost: 100,
    upgradeCosts: [135, 220],
    color: 0x0284c7,
    accent: 0x7dd3fc,
    levels: [
      { damage: 24, fireRate: 1.5, range: 10.5, chains: 3 },
      { damage: 40, fireRate: 1.8, range: 11.8, chains: 4 },
      { damage: 64, fireRate: 2.1, range: 13.0, chains: 5 }
    ]
  },
  missile: {
    id: 'missile',
    name: 'ミサイル砲塔',
    shortName: 'ミサイル',
    icon: '🚀',
    sub: '長射程・広域爆撃',
    desc: '広範囲を射程に収める誘導ミサイルを発射し、着弾爆発で周囲の群れを吹き飛ばす。',
    cost: 110,
    upgradeCosts: [145, 235],
    color: 0xdc2626,
    accent: 0xfca5a5,
    levels: [
      { damage: 48, fireRate: 0.8, range: 14.5, splash: 3.6 },
      { damage: 78, fireRate: 1.0, range: 16.0, splash: 4.2 },
      { damage: 125, fireRate: 1.25, range: 17.5, splash: 5.0 }
    ]
  }
};

export const SPECIAL_TURRET_IDS: SpecialTurretId[] = ['flame', 'tesla', 'missile'];

export const ULTIMATES: Record<UltimateId, UltimateSpec> = {
  cluster: {
    id: 'cluster',
    name: 'クラスター爆撃',
    shortName: '爆撃無双',
    icon: '☄️',
    sub: '戦場全域・連続爆発',
    desc: '【無双奥義】周囲一帯に超巨大な連続クラスター爆撃を叩き込み、大群を一瞬で吹き飛ばす！',
    color: 0xf97316
  },
  blizzard: {
    id: 'blizzard',
    name: '絶対零度ノヴァ',
    shortName: '氷結無双',
    icon: '❄️',
    sub: '広域凍結・粉砕',
    desc: '【無双奥義】戦場全域を絶対零度の嵐で包み込み、全ゾンビを完全凍結させ大ダメージ！',
    color: 0x38bdf8
  },
  aegis: {
    id: 'aegis',
    name: 'イージス回復波',
    shortName: '聖域無双',
    icon: '🛡️',
    sub: '避難所回復＋衝撃波',
    desc: '【無双奥義】避難所＆ヒーローHPを大幅回復しつつ、黄金の衝撃波で全敵を吹き飛ばす！',
    color: 0x4ade80
  }
};

export const ZOMBIES: Record<ZombieKind, ZombieSpec> = {
  walker: {
    kind: 'walker',
    name: 'ウォーカー',
    hp: 85,
    speed: 3.6,
    radius: 0.55,
    scale: 1.0,
    damage: 15,
    shelterDamage: 18,
    attackRate: 1.1,
    scrap: 4,
    skinColor: 0x6b9e32,
    shirtColor: 0x3e4c3a,
    pantsColor: 0x262f2b,
    eyeColor: 0xd9f99d
  },
  runner: {
    kind: 'runner',
    name: 'ランナー',
    hp: 55,
    speed: 6.8,
    radius: 0.48,
    scale: 0.9,
    damage: 14,
    shelterDamage: 16,
    attackRate: 1.6,
    scrap: 5,
    skinColor: 0xdc2626,
    shirtColor: 0x5c1f24,
    pantsColor: 0x1e1b24,
    eyeColor: 0xfef08a
  },
  brute: {
    kind: 'brute',
    name: 'ブルート',
    hp: 340,
    speed: 2.65,
    radius: 0.85,
    scale: 1.42,
    damage: 34,
    shelterDamage: 45,
    attackRate: 0.85,
    scrap: 11,
    skinColor: 0x4d7c0f,
    shirtColor: 0x334155,
    pantsColor: 0x1e293b,
    eyeColor: 0xfacc15
  },
  bomber: {
    kind: 'bomber',
    name: 'ボマー',
    hp: 125,
    speed: 4.8,
    radius: 0.64,
    scale: 1.12,
    damage: 45,
    shelterDamage: 95,
    attackRate: 1.1,
    scrap: 9,
    skinColor: 0xf97316,
    shirtColor: 0x7c2d12,
    pantsColor: 0x292524,
    eyeColor: 0xfef08a,
    explodes: true
  },
  boss: {
    kind: 'boss',
    name: 'タイタン・ボス',
    hp: 2200,
    speed: 2.45,
    radius: 1.35,
    scale: 2.15,
    damage: 52,
    shelterDamage: 95,
    attackRate: 0.78,
    scrap: 60,
    skinColor: 0x991b1b,
    shirtColor: 0x1f2937,
    pantsColor: 0x111827,
    eyeColor: 0xfde047,
    isBoss: true
  }
};

export const PERKS: PerkDef[] = [
  {
    id: 'musou_power',
    icon: '⚔️',
    title: '無双の剛力',
    desc: 'ヒーローの全攻撃ダメージ +18%',
    apply: (m) => { m.heroDamage *= 1.18; }
  },
  {
    id: 'wide_cleave',
    icon: '🌀',
    title: '極大斬撃波',
    desc: '斬撃・強撃の攻撃範囲 +16% ＆ ダメージ +8%',
    apply: (m) => {
      m.heroRange *= 1.16;
      m.heroDamage *= 1.08;
    }
  },
  {
    id: 'turret_ai',
    icon: '🏗️',
    title: '防衛砲塔オーバークロック',
    desc: '全タレット攻撃力 +18% ＆ 連射速度 +12%',
    apply: (m) => {
      m.turretDamage *= 1.18;
      m.turretRate *= 1.12;
    }
  },
  {
    id: 'shelter_wall',
    icon: '🛡️',
    title: '避難所チタン装甲',
    desc: '避難所最大HP +140 ＆ 耐久度を180回復',
    apply: (_m, h) => { h.boostShelter(140, 180); }
  },
  {
    id: 'musou_charge',
    icon: '⚡',
    title: '無双ソウル覚醒',
    desc: '無双ゲージ増加量 +25% ＆ 即座にゲージ100%充填！',
    apply: (m, h) => {
      m.musouGain *= 1.25;
      h.fillMusou();
    }
  },
  {
    id: 'scrap_rush',
    icon: '⚙️',
    title: '物資回収ドローン',
    desc: 'スクラップ獲得 +20% ＆ 今すぐ 45⚙️ 支給',
    apply: (m, h) => {
      m.scrapMult *= 1.20;
      h.giveScrap(45);
    }
  }
];

/**
 * Endless Wave Generator:
 * High-tension survival scaling where fierce hordes, fast runners, explosive bombers,
 * and Titan Bosses pressure the shelter from Wave 1 onward.
 */
export function generateWave(wave: number): WaveDefinition {
  const count = Math.floor(22 + wave * 9.5 + Math.pow(wave, 1.55));
  const isBossWave = wave % 3 === 0;
  const bossCount = isBossWave
    ? Math.min(5, 1 + Math.floor((wave - 3) / 4))
    : wave >= 7 && wave % 2 === 1
      ? 1
      : 0;

  const hpMult = 1 + (wave - 1) * 0.28 + Math.pow(Math.max(0, wave - 2), 1.55) * 0.08;
  const speedMult = Math.min(2.15, 1 + (wave - 1) * 0.045);
  const dmgMult = 1 + (wave - 1) * 0.18 + Math.pow(Math.max(0, wave - 3), 1.35) * 0.04;
  const spawnInterval = Math.max(0.06, 0.34 / (1 + (wave - 1) * 0.22));

  const weights: Array<{ kind: ZombieKind; w: number }> = [
    { kind: 'walker', w: Math.max(18, 68 - wave * 3.2) },
    { kind: 'runner', w: Math.min(38, 16 + wave * 2.4) }
  ];
  if (wave >= 2) weights.push({ kind: 'brute', w: Math.min(26, 9 + wave * 1.6) });
  if (wave >= 3) weights.push({ kind: 'bomber', w: Math.min(22, 8 + (wave - 2) * 1.5) });

  const totalW = weights.reduce((s, item) => s + item.w, 0);
  const queue: ZombieKind[] = [];
  for (let i = 0; i < count; i++) {
    let r = Math.random() * totalW;
    let pick: ZombieKind = 'walker';
    for (const item of weights) {
      r -= item.w;
      if (r <= 0) {
        pick = item.kind;
        break;
      }
    }
    queue.push(pick);
  }

  for (let b = 0; b < bossCount; b++) {
    const idx = Math.floor(queue.length * (0.35 + (b * 0.4) / Math.max(1, bossCount)));
    queue.splice(idx, 0, 'boss');
  }

  return {
    wave,
    isBossWave: isBossWave || bossCount > 0,
    bossCount,
    queue,
    totalZombies: queue.length,
    hpMult,
    speedMult,
    dmgMult,
    spawnInterval,
    clearBonus: Math.floor(20 + wave * 6)
  };
}
