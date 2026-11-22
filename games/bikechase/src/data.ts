export type BikeId = 'viper' | 'volt' | 'ranger';

export interface BikeSpec {
  id: BikeId;
  name: string;
  shortName: string;
  tagline: string;
  brief: string;
  primaryColor: number;
  accentColor: number;
  wheelAccent: number;
  maxSpeed: number;
  accel: number;
  turnRate: number;
  driftGrip: number;
  offroadGrip: number;
  maxHp: number;
  knockbackResist: number;
  stats: {
    speed: number;
    drift: number;
    armor: number;
  };
}

export const BIKE_IDS: BikeId[] = ['viper', 'volt', 'ranger'];

export const BIKES: Record<BikeId, BikeSpec> = {
  viper: {
    id: 'viper',
    name: 'レッドバイパー',
    shortName: 'バイパー',
    tagline: 'バランス型スーパーバイク',
    brief: '扱いやすい旋回性能と力強い加速を両立。街角の連続ドリフト＆路地裏抜けで包囲網を切り裂く王道マシン。',
    primaryColor: 0xef4444,
    accentColor: 0xf8fafc,
    wheelAccent: 0xfbbf24,
    maxSpeed: 29.5,
    accel: 30,
    turnRate: 3.45,
    driftGrip: 0.92,
    offroadGrip: 0.78,
    maxHp: 3,
    knockbackResist: 1.0,
    stats: { speed: 4, drift: 4, armor: 3 }
  },
  volt: {
    id: 'volt',
    name: 'サイバーボルト',
    shortName: 'ボルト',
    tagline: '最速ドリフト・ストリート',
    brief: '全車トップの最高速と鋭いキレのドリフトを誇る電脳マシン。連続ドリフトでニトロを溜めて追手を撒け！',
    primaryColor: 0x06b6d4,
    accentColor: 0xfef08a,
    wheelAccent: 0x38bdf8,
    maxSpeed: 32.5,
    accel: 33,
    turnRate: 3.75,
    driftGrip: 0.96,
    offroadGrip: 0.72,
    maxHp: 3,
    knockbackResist: 0.88,
    stats: { speed: 5, drift: 5, armor: 2 }
  },
  ranger: {
    id: 'ranger',
    name: 'アイアンレンジャー',
    shortName: 'レンジャー',
    tagline: '高耐久オフロード装甲',
    brief: 'HP4の頑丈なフレームで接触に強く、公園の芝生や工事現場のジャンプ台でも失速しないタフネス機。',
    primaryColor: 0xf59e0b,
    accentColor: 0x1e293b,
    wheelAccent: 0x34d399,
    maxSpeed: 27.8,
    accel: 28,
    turnRate: 3.25,
    driftGrip: 0.88,
    offroadGrip: 0.96,
    maxHp: 4,
    knockbackResist: 1.35,
    stats: { speed: 3, drift: 3, armor: 5 }
  }
};

export type PoliceKind = 'patrol' | 'moto' | 'interceptor' | 'swat';

export interface PoliceSpec {
  kind: PoliceKind;
  name: string;
  maxSpeed: number;
  accel: number;
  turnRate: number;
  radius: number;
  heavy: boolean;
}

export const POLICE_SPECS: Record<PoliceKind, PoliceSpec> = {
  patrol: {
    kind: 'patrol',
    name: 'パトカー',
    maxSpeed: 27.5,
    accel: 24,
    turnRate: 3.05,
    radius: 1.16,
    heavy: false
  },
  moto: {
    kind: 'moto',
    name: '白バイ',
    maxSpeed: 31.2,
    accel: 32,
    turnRate: 4.15,
    radius: 0.68,
    heavy: false
  },
  interceptor: {
    kind: 'interceptor',
    name: 'インターセプター',
    maxSpeed: 33.5,
    accel: 30,
    turnRate: 3.45,
    radius: 1.12,
    heavy: false
  },
  swat: {
    kind: 'swat',
    name: '機動隊SUV',
    maxSpeed: 26.2,
    accel: 21,
    turnRate: 2.6,
    radius: 1.34,
    heavy: true
  }
};

export interface WantedLevelSpec {
  stars: number;
  minTimeSec: number;
  label: string;
  alertText: string;
  maxUnits: number;
  allowedKinds: PoliceKind[];
  roadblockCount: number;
  hasHelicopter: boolean;
  spawnInterval: number;
}

export const WANTED_LEVELS: WantedLevelSpec[] = [
  {
    stars: 1,
    minTimeSec: 0,
    label: '初動追跡',
    alertText: 'パトカー＆白バイ部隊が緊急出動！',
    maxUnits: 3,
    allowedKinds: ['patrol', 'moto'],
    roadblockCount: 0,
    hasHelicopter: false,
    spawnInterval: 2.5
  },
  {
    stars: 2,
    minTimeSec: 15,
    label: '包囲網＆検問',
    alertText: '高速インターセプター＆全面封鎖検問を展開！',
    maxUnits: 5,
    allowedKinds: ['patrol', 'moto', 'interceptor'],
    roadblockCount: 2,
    hasHelicopter: false,
    spawnInterval: 2.1
  },
  {
    stars: 3,
    minTimeSec: 35,
    label: '機動隊突入',
    alertText: '機動隊SUV投入！正面突破は危険だ！',
    maxUnits: 6,
    allowedKinds: ['patrol', 'moto', 'interceptor', 'swat'],
    roadblockCount: 3,
    hasHelicopter: false,
    spawnInterval: 1.8
  },
  {
    stars: 4,
    minTimeSec: 60,
    label: '空陸立体追跡',
    alertText: '警察ヘリが上空からサーチライト照射！',
    maxUnits: 7,
    allowedKinds: ['patrol', 'moto', 'moto', 'interceptor', 'swat'],
    roadblockCount: 4,
    hasHelicopter: true,
    spawnInterval: 1.55
  },
  {
    stars: 5,
    minTimeSec: 95,
    label: '都市完全封鎖',
    alertText: '全警察部隊による総力包囲網!!',
    maxUnits: 9,
    allowedKinds: ['patrol', 'moto', 'moto', 'interceptor', 'swat'],
    roadblockCount: 5,
    hasHelicopter: true,
    spawnInterval: 1.3
  }
];

export function getWantedLevel(elapsedSec: number): WantedLevelSpec {
  let result = WANTED_LEVELS[0];
  for (const level of WANTED_LEVELS) {
    if (elapsedSec >= level.minTimeSec) {
      result = level;
    }
  }
  return result;
}

export type PickupKind = 'nitro';

export const STORAGE_KEY = 'metro_escape_records_v2';
