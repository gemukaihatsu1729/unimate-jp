import type { GameMode, RankInfo } from '../types';

export const DEFAULT_PUBLIC_GAME_URL = 'https://unimate-jp.com/games/flashanzan/';

const MODE_LABELS: Record<GameMode, string> = {
  standard: '5問チャレンジ',
  endless: '∞エンドレス'
};

export interface SharePayloadInput {
  mode: GameMode;
  rank: RankInfo;
  score: number;
  correctCount: number;
  totalCount: number;
  maxCombo: number;
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

export function buildShareText(input: SharePayloadInput): string {
  const modeLabel = MODE_LABELS[input.mode];
  return (
    `⚡ 無限フラッシュ暗算【${modeLabel}】\n` +
    `段位：${input.rank.grade}（${input.rank.title}）\n` +
    `スコア：${input.score.toLocaleString()}pt\n` +
    `正答：${input.correctCount}/${input.totalCount}問 ／ 最大コンボ：${input.maxCombo}\n` +
    `高校数学の極限が次々加速する！\n` +
    `#無限フラッシュ暗算 #極限暗算`
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
