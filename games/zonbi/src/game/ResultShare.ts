import { TURRETS, ULTIMATES, WEAPONS, type LoadoutConfig } from '../data';

export const DEFAULT_PUBLIC_GAME_URL = 'https://unimate-jp.com/games/zonbi/';

export type DefenseRank = 'SS' | 'S' | 'A' | 'B' | 'C';

export interface ResultShareInput {
  wave: number;
  kills: number;
  maxCombo: number;
  reason: 'shelter' | 'hero';
  isNewRecord: boolean;
  loadout: LoadoutConfig;
}

export interface ResultEvaluation {
  rank: DefenseRank;
  headline: string;
  comment: string;
  shareTagline: string;
}

export function evaluateDefenseResult(input: ResultShareInput): ResultEvaluation {
  const { wave, kills, reason } = input;

  if (wave >= 12 || kills >= 500) {
    return {
      rank: 'SS',
      headline: '👑 人類最終防衛ラインの伝説！！',
      comment: '司令部「信じられん…タイタンの大群を相手にここまで持ちこたえるとは！貴公こそ人類最強の無双英雄だ！」',
      shareTagline: 'タイタンの大群を薙ぎ払い人類最終防衛ラインの伝説に！'
    };
  }
  if (wave >= 8 || kills >= 280) {
    return {
      rank: 'S',
      headline: '🔥 圧倒的戦果！歴戦の無双防衛官！',
      comment: '司令部「見事なタレット陣形と無双斬撃だ！避難所の市民たちが貴公の奮戦に歓声を上げているぞ！」',
      shareTagline: '圧倒的な無双斬撃と防衛陣形でゾンビ大群を撃退！'
    };
  }
  if (wave >= 5 || kills >= 140) {
    return {
      rank: 'A',
      headline: '⚔️ 激戦突破！頼れるシェルター守護者！',
      comment: '司令部「ボスの猛攻にも怯まずよく戦った！次の出撃ではさらにタレット強化を急げば記録を狙えるぞ！」',
      shareTagline: '激戦の末にゾンビ群を多数撃破！次はさらなる高みへ'
    };
  }
  if (wave >= 3 || kills >= 60) {
    return {
      rank: 'B',
      headline: '💥 奮戦するもゾンビの大波に呑まれる…',
      comment:
        reason === 'shelter'
          ? '司令部「左右から回り込むランナーと自爆ボマーに防衛線を破られたな…タレット配置と強撃で押し返せ！」'
          : '司令部「前線で囲まれすぎたな！ボマーの自爆には回避ダッシュを使って距離を取るんだ！」',
      shareTagline: '押し寄せるゾンビと自爆ボマーの猛攻に大苦戦！'
    };
  }
  return {
    rank: 'C',
    headline: '😱 序盤のゾンビラッシュで防衛線崩壊…',
    comment:
      reason === 'shelter'
        ? '司令部「避難所が早々に突破された！まずはオート機銃を設置して、接近するランナーを優先撃破せよ！」'
        : '司令部「開幕から無茶をしすぎだ！攻撃ボタン長押しの4連コンボと回避を使い分けて生き延びろ！」',
    shareTagline: '開幕ゾンビラッシュの洗礼を受けました…リベンジ必至！'
  };
}

export function getGameShareUrl(): string {
  if (typeof window !== 'undefined' && /^https?:\/\//.test(window.location.origin)) {
    const isLocal =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.startsWith('192.168.');
    if (!isLocal) {
      return `${window.location.origin}${window.location.pathname}`;
    }
  }
  return DEFAULT_PUBLIC_GAME_URL;
}

export function buildShareText(input: ResultShareInput): string {
  const evalRes = evaluateDefenseResult(input);
  const w = WEAPONS[input.loadout.weaponId];
  const t = TURRETS[input.loadout.turretId];
  const u = ULTIMATES[input.loadout.ultimateId];
  const recordTag = input.isNewRecord ? ' 🏆自己ベスト更新！' : '';

  return (
    `🧟 SHELTER MUSOU — 3Dゾンビ無双防衛\n` +
    `防衛ランク【${evalRes.rank}】到達：WAVE ${input.wave}${recordTag}\n` +
    `💀 総撃破：${input.kills}体 ／ 🔥 最大COMBO：${input.maxCombo}\n` +
    `⚔️ 装備：${w.icon}${w.shortName}・${t.icon}${t.shortName}・${u.icon}${u.shortName}\n` +
    `💬 ${evalRes.shareTagline}\n` +
    `#SHELTER_MUSOU #ゾンビ無双`
  );
}

export function buildXShareUrl(text: string, url: string): string {
  const params = new URLSearchParams({ text, url });
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

export function buildLineShareUrl(text: string, url: string): string {
  const full = `${text}\n${url}`;
  return `https://line.me/R/share?text=${encodeURIComponent(full)}`;
}
