import {
  DEBRIEF_COMMENTS,
  RANK_RULES,
  type CargoSpec,
  type RankGrade
} from '../data';

const BEST_SCORE_KEY = 'helicargo_best_record_v1';
const GAME_URL = 'https://unimate-jp.com/games/helicargo/';

export interface BestRecord {
  bestScore: number;
  bestDistance: number;
}

export interface FlightResultSummary {
  score: number;
  distanceMeters: number;
  relaysCleared: number;
  swingCatches: number;
  nearMisses: number;
  cargo: CargoSpec;
  reason: 'crash' | 'fuel';
}

export function computeRank(score: number, distanceMeters: number): RankGrade {
  for (const rule of RANK_RULES) {
    if (score >= rule.minScore || distanceMeters >= rule.minDistance) {
      return rule.rank;
    }
  }
  return 'C';
}

export function formatDistance(meters: number): string {
  const rounded = Math.max(0, Math.floor(meters));
  return `${rounded.toLocaleString('en-US')} m`;
}

export function formatScore(score: number): string {
  return Math.max(0, Math.floor(score)).toLocaleString('en-US');
}

export function pickDebriefComment(rank: RankGrade, seed: number): string {
  const pool = DEBRIEF_COMMENTS[rank];
  const idx = Math.abs(Math.floor(seed)) % pool.length;
  return pool[idx];
}

export function loadBestRecord(): BestRecord {
  try {
    const raw = window.localStorage.getItem(BEST_SCORE_KEY);
    if (!raw) return { bestScore: 0, bestDistance: 0 };
    const parsed = JSON.parse(raw) as Partial<BestRecord>;
    return {
      bestScore: typeof parsed.bestScore === 'number' && Number.isFinite(parsed.bestScore) ? parsed.bestScore : 0,
      bestDistance: typeof parsed.bestDistance === 'number' && Number.isFinite(parsed.bestDistance) ? parsed.bestDistance : 0
    };
  } catch {
    return { bestScore: 0, bestDistance: 0 };
  }
}

export function saveBestRecord(score: number, distanceMeters: number): {
  record: BestRecord;
  isNewRecord: boolean;
} {
  const prev = loadBestRecord();
  const cleanScore = Math.max(0, Math.floor(score));
  const cleanDist = Math.max(0, Math.floor(distanceMeters));
  const isNewRecord = cleanScore > prev.bestScore;
  const next: BestRecord = {
    bestScore: Math.max(prev.bestScore, cleanScore),
    bestDistance: Math.max(prev.bestDistance, cleanDist)
  };
  try {
    window.localStorage.setItem(BEST_SCORE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota or private browsing errors
  }
  return { record: next, isNewRecord };
}

export function buildShareText(result: FlightResultSummary): string {
  const rank = computeRank(result.score, result.distanceMeters);
  return [
    `🚁【DOCTOR CARGO】ランク ${rank}！`,
    `${result.cargo.emoji} ${result.cargo.name}を ${formatDistance(result.distanceMeters)} 移送（スコア ${formatScore(result.score)} pt / 中継 ${result.relaysCleared}回）！`,
    `夕焼け空をヘリの振り子で運ぶ2Dアクション👇`,
    GAME_URL,
    `#DoctorCargo #UnimateJP`
  ].join('\n');
}

export function shareToX(result: FlightResultSummary): void {
  const text = buildShareText(result);
  const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function shareToLine(result: FlightResultSummary): void {
  const text = buildShareText(result);
  const url = `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(GAME_URL)}&text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

export async function shareNativeOrCopy(result: FlightResultSummary): Promise<'shared' | 'copied' | 'failed'> {
  const text = buildShareText(result);
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: 'DOCTOR CARGO — 夕焼けヘリ振り子移送アクション',
        text,
        url: GAME_URL
      });
      return 'shared';
    } catch {
      // User cancelled or share unsupported; fall back to clipboard
    }
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return 'copied';
    } catch {
      return 'failed';
    }
  }
  return 'failed';
}
