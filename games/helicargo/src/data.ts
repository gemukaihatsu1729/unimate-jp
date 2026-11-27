export const WORLD_H = 640;
export const CEILING_Y = 38;
export const GROUND_Y = 588;
export const PIXELS_PER_METER = 18;
export const MIN_WORLD_W = 540;

export const HELI_RX = 34;
export const HELI_RY = 15;
export const CAGE_HALF_W = 20;
export const CAGE_HALF_H = 22;
export const CAGE_HIT_RADIUS = 19;

export const GRAVITY = 560;
export const MAX_FUEL = 100;
export const FUEL_DRAIN_PER_SEC = 2.6; // ~38.5s full tank without pickups
export const INVULN_DURATION = 1.35;
export const SAFE_GROUND_SCRAPE_SPEED = 165;
export const SAFE_PAD_LANDING_SPEED = 245;
export const PAD_DWELL_SECONDS = 0.25;

export type CargoId = 'poyo' | 'cube' | 'capsule';

export interface CargoSpec {
  id: CargoId;
  emoji: string;
  name: string;
  tagline: string;
  description: string;
  ropeBase: number;
  ropeWinched: number;
  maxHp: number;
  mass: number;
  dampingBase: number;
  dampingWinch: number;
  windSusceptibility: number;
  scoreMult: number;
  accentColor: string;
}

export const CARGO_TYPES: readonly CargoSpec[] = [
  {
    id: 'poyo',
    emoji: '🔵',
    name: 'ポヨまる',
    tagline: 'バランス型・抽象マスコット',
    description:
      '青いボディと赤い丸い顔のミニマルな抽象キャラクター。揺れに合わせて表情が変わる王道タイプ。',
    ropeBase: 116,
    ropeWinched: 58,
    maxHp: 3,
    mass: 1.0,
    dampingBase: 0.68,
    dampingWinch: 2.7,
    windSusceptibility: 1.0,
    scoreMult: 1.0,
    accentColor: '#3b82f6'
  },
  {
    id: 'cube',
    emoji: '🟡',
    name: 'ぷるんキューブ',
    tagline: '高スコア・長ロープ＆よく揺れる',
    description:
      'ぷるぷる弾む半透明の幾何学キューブ。ロープが長く大きく揺れるスリル満点タイプだが、スコア倍率 1.25倍 で高ランクを狙いやすい。',
    ropeBase: 132,
    ropeWinched: 64,
    maxHp: 3,
    mass: 0.85,
    dampingBase: 0.56,
    dampingWinch: 2.45,
    windSusceptibility: 1.18,
    scoreMult: 1.25,
    accentColor: '#fbbf24'
  },
  {
    id: 'capsule',
    emoji: '⚪',
    name: 'メカカプセル',
    tagline: '安定重視・HP4＆強風に強い',
    description:
      'シンプルで重厚なシルバーカプセル型ユニット。短いロープと高重量で揺れと突風をものともせず、耐久HP4で安定して長距離移送できる。',
    ropeBase: 102,
    ropeWinched: 54,
    maxHp: 4,
    mass: 1.32,
    dampingBase: 0.86,
    dampingWinch: 3.05,
    windSusceptibility: 0.68,
    scoreMult: 0.95,
    accentColor: '#94a3b8'
  }
] as const;

export interface SkyPalette {
  name: string;
  skyTop: string;
  skyMid: string;
  skyHorizon: string;
  sunColor: string;
  sunGlow: string;
  mountainFar: string;
  mountainNear: string;
  grassTop: string;
  grassBottom: string;
  starAlpha: number;
}

export const SKY_PALETTES: readonly SkyPalette[] = [
  {
    name: 'GOLDEN SUNSET',
    skyTop: '#2b3e70',
    skyMid: '#8a86a8',
    skyHorizon: '#ffb86c',
    sunColor: '#fff0b8',
    sunGlow: 'rgba(255, 186, 92, 0.45)',
    mountainFar: '#49536e',
    mountainNear: '#3b4a52',
    grassTop: '#4e8a2c',
    grassBottom: '#35661d',
    starAlpha: 0.08
  },
  {
    name: 'CRIMSON DUSK',
    skyTop: '#2a1f4d',
    skyMid: '#9e3e5c',
    skyHorizon: '#ff7e5f',
    sunColor: '#ffd29d',
    sunGlow: 'rgba(255, 118, 87, 0.48)',
    mountainFar: '#463254',
    mountainNear: '#322940',
    grassTop: '#3e7328',
    grassBottom: '#295219',
    starAlpha: 0.25
  },
  {
    name: 'VIOLET TWILIGHT',
    skyTop: '#161b3a',
    skyMid: '#4c3b73',
    skyHorizon: '#d97b93',
    sunColor: '#ffc4b8',
    sunGlow: 'rgba(217, 123, 147, 0.36)',
    mountainFar: '#2e2b4d',
    mountainNear: '#21223b',
    grassTop: '#2e5c29',
    grassBottom: '#1c401a',
    starAlpha: 0.55
  },
  {
    name: 'STARRY NIGHT',
    skyTop: '#080e24',
    skyMid: '#13224a',
    skyHorizon: '#2a4678',
    sunColor: '#e2e8f0',
    sunGlow: 'rgba(148, 163, 184, 0.28)',
    mountainFar: '#162038',
    mountainNear: '#0f172a',
    grassTop: '#1f4527',
    grassBottom: '#132e1a',
    starAlpha: 0.92
  },
  {
    name: 'MORNING DAWN',
    skyTop: '#2d5a9e',
    skyMid: '#72a8d8',
    skyHorizon: '#ffdca8',
    sunColor: '#fff7d6',
    sunGlow: 'rgba(255, 226, 158, 0.42)',
    mountainFar: '#4e6c8c',
    mountainNear: '#3b5769',
    grassTop: '#589c32',
    grassBottom: '#3c7822',
    starAlpha: 0.04
  }
];

export type RankGrade = 'SS' | 'S' | 'A' | 'B' | 'C';

export interface RankRule {
  rank: RankGrade;
  minScore: number;
  minDistance: number;
  label: string;
}

export const RANK_RULES: readonly RankRule[] = [
  { rank: 'SS', minScore: 18000, minDistance: 2000, label: '伝説のドクターパイロット' },
  { rank: 'S', minScore: 11000, minDistance: Infinity, label: 'エース空輸隊長' },
  { rank: 'A', minScore: 6000, minDistance: Infinity, label: '熟練レスキュー操縦士' },
  { rank: 'B', minScore: 2500, minDistance: Infinity, label: '見習いヘリ運搬員' },
  { rank: 'C', minScore: 0, minDistance: Infinity, label: '振り子修行中' }
];

export const MASCOT_REACTIONS = {
  swingBig: ['ゆれる〜！', 'おおおっ！', '振り子すごっ！', '目が回る〜！'],
  nearMiss: ['ギリギリセーフ！', 'うまいっ！', 'スレスレ！', 'ナイス操縦！'],
  damage: ['いたたた！', 'ぶつかった〜！', 'ケージがっ！', 'ぎゃー！'],
  relay: ['ナイス着地！', 'ほっと一息！', '次も頼むよ！', '完全補給！'],
  winch: ['ぎゅっと収納！', '安定モード！'],
  lowFuel: ['燃料ピンチ！', '急いで補給だ！']
} as const;

export const DEBRIEF_COMMENTS: Record<RankGrade, readonly string[]> = {
  SS: [
    '嵐も鉄塔も振り子で華麗にかわす神業フライト！マスコットもぐっすり昼寝してました。',
    '揺れを自在に操り長距離空輸を達成！まさに夕焼け空の伝説的ドクターパイロットです。'
  ],
  S: [
    '抜群のウインチワークと振り子コントロール！カゴの中の荷物も大喜びのフライトでした。',
    '風車や鳥の群れをスレスレで抜ける職人技！次のセクターもこの調子で制覇しよう。'
  ],
  A: [
    '安定した空輸で中継ヘリポートを突破！スイングキャッチを意識するとさらに S ランクが近づきます。',
    'カゴの揺れをしっかり読み切ったナイス搬送！燃料管理もバッチリです。'
  ],
  B: [
    'ヘリの基本操作は掴めてきた！障害物の手前でウインチを少し巻くと通り抜けやすくなります。',
    '揺れに逆らわず「揺り戻し」に合わせて加速すると、もっと遠くまでスムーズに運べますよ！'
  ],
  C: [
    'カゴが思わぬ方向へブンブン…！まずは右下の「巻上」ボタンで揺れを抑えながら飛んでみよう。',
    '低空での草かすりはセーフだけど、鉄塔と地面への激突には要注意！再出撃だ！'
  ]
};
