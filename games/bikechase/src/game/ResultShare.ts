import { BIKES, type BikeId } from '../data';

export const DEFAULT_PUBLIC_GAME_URL = 'https://unimate-jp.com/games/bikechase/';

export type EscapeRank = 'SS' | 'S' | 'A' | 'B' | 'C';

export interface ResultShareInput {
  elapsedSec: number;
  wreckedCount: number;
  nearMissCount: number;
  maxStars: number;
  reason: 'hp' | 'busted';
  isNewRecord: boolean;
  bikeId: BikeId;
}

export interface ResultEvaluation {
  rank: EscapeRank;
  headline: string;
  comment: string;
  shareTagline: string;
}

export function formatEscapeTime(sec: number): string {
  const safe = Math.max(0, sec);
  const tenths = Math.floor(safe * 10) % 10;
  const totalSec = Math.floor(safe);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}.${tenths}`;
}

export function evaluateEscapeResult(input: ResultShareInput): ResultEvaluation {
  const { elapsedSec, reason } = input;

  if (elapsedSec >= 120) {
    return {
      rank: 'SS',
      headline: '👑 伝説のメトロ・ファントム！！',
      comment:
        '警察本部「全面検問も警察ヘリも振り切られた…！路地裏と角の切り返しだけで2分以上逃げ切るとは怪物だ！」',
      shareTagline: '全面封鎖と警察ヘリの包囲網を完全突破し都市伝説に！'
    };
  }
  if (elapsedSec >= 75) {
    return {
      rank: 'S',
      headline: '🔥 神業逃走！都市伝説の疾走ライダー！',
      comment:
        '警察本部「機動隊の検問を察知して路地へ逃げ込む判断が早すぎる！インターセプターでも追いつけん！」',
      shareTagline: '封鎖検問と警察ヘリの包囲網をかいくぐり激走記録を達成！'
    };
  }
  if (elapsedSec >= 45) {
    return {
      rank: 'A',
      headline: '🏍️ ナイス逃走！鋭い切り返し！',
      comment:
        '警察本部「大通りの直進を諦めて裏通りへ逃げる巧みな走りだ…次は★4の警察ヘリ展開を超えて生き残れるか？」',
      shareTagline: '路地裏抜けとドリフトターボで警察包囲網をかいくぐった！'
    };
  }
  if (elapsedSec >= 22) {
    return {
      rank: 'B',
      headline: '🚨 激しい追走劇の末、包囲される…',
      comment:
        reason === 'busted'
          ? '警察本部「足が止まった瞬間を確保したぞ！直進ばかりでは検問と先回り部隊に塞がれる、ミニマップを見て曲がれ！」'
          : '警察本部「耐久回復なしのマシンが限界を迎えたな！正面の検問や対向パトカーは角を曲がって回避しろ！」',
      shareTagline: 'インターセプターと封鎖検問の猛追に大激走！'
    };
  }
  return {
    rank: 'C',
    headline: '🚓 開幕スクランブルでスピード検挙…',
    comment:
      reason === 'busted'
        ? '警察本部「スピードが落ちれば即確保だ！指1本のスライドで鋭く曲がり続け、ドリフト後の自動ターボで振り切れ！」'
        : '警察本部「修復手段はないぞ！同じ大通りをまっすぐ走ると検問と先回りパトカーに挟まれる、路地や交差点へ逃げろ！」',
    shareTagline: '無修理サバイバルの警察チェイスで惜しくも確保…即リベンジ！'
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
  const evalRes = evaluateEscapeResult(input);
  const bike = BIKES[input.bikeId];
  const recordTag = input.isNewRecord ? ' 🏆自己ベスト更新！' : '';
  const stars = '★'.repeat(Math.max(1, Math.min(5, input.maxStars)));

  return (
    `🏍️ METRO ESCAPE — 3Dバイク逃走チェイス\n` +
    `逃走ランク【${evalRes.rank}】逃走タイム：${formatEscapeTime(input.elapsedSec)}${recordTag}\n` +
    `🚨 最大手配 ${stars} ／ 💥 パトカー撃破 ${input.wreckedCount}台 ／ ⚡ ニアミス ${input.nearMissCount}回\n` +
    `🔥 愛車：${bike.name}\n` +
    `💬 ${evalRes.shareTagline}\n` +
    `#METRO_ESCAPE #3Dバイクチェイス`
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
