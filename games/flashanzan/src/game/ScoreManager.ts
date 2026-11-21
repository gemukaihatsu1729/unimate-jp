import type { GameMode, RankInfo, StoredProgress } from '../types';

export const PROGRESS_STORAGE_KEY = 'flashanzan_progress_v2';

const UNIFIED_BASE_POINTS = 1500;

export interface ScoreCalculationInput {
  correct: boolean;
  comboAfterAnswer: number; // 1-based combo count if correct, 0 if wrong
  answeredEarly: boolean;
  answerTimeMs: number;
  usedReplay: boolean;
}

export interface ScoreCalculationOutput {
  pointsEarned: number;
  basePoints: number;
  speedBonus: number;
  comboMultiplier: number;
}

export function calculateQuestionScore(input: ScoreCalculationInput): ScoreCalculationOutput {
  if (!input.correct) {
    return {
      pointsEarned: 0,
      basePoints: 0,
      speedBonus: 0,
      comboMultiplier: 1
    };
  }

  const basePoints = UNIFIED_BASE_POINTS;

  let speedBonus = 0;
  if (!input.usedReplay) {
    if (input.answeredEarly) {
      speedBonus = 800;
    } else {
      const ratio = Math.max(0, 1 - input.answerTimeMs / 10000);
      speedBonus = Math.round(650 * ratio);
    }
  }

  const comboIndex = Math.max(0, input.comboAfterAnswer - 1);
  const comboMultiplier = Math.min(2.5, Math.round((1 + Math.min(comboIndex, 10) * 0.15) * 100) / 100);
  const pointsEarned = Math.round((basePoints + speedBonus) * comboMultiplier);

  return {
    pointsEarned,
    basePoints,
    speedBonus,
    comboMultiplier
  };
}

const RANK_LADDER: Array<{ minRatio: number; info: RankInfo }> = [
  { minRatio: 1.0, info: { grade: '∞神', title: '極限到達者', badgeColor: '#facc15' } },
  { minRatio: 0.85, info: { grade: '名人', title: '解析の覇者', badgeColor: '#fb7185' } },
  { minRatio: 0.72, info: { grade: '十段', title: '無限暗算師範', badgeColor: '#c084fc' } },
  { minRatio: 0.58, info: { grade: '八段', title: '超速収束マスター', badgeColor: '#38bdf8' } },
  { minRatio: 0.45, info: { grade: '五段', title: '級数の達人', badgeColor: '#34d399' } },
  { minRatio: 0.34, info: { grade: '三段', title: '高速演算士', badgeColor: '#4ade80' } },
  { minRatio: 0.24, info: { grade: '初段', title: '極限入門者', badgeColor: '#86efac' } },
  { minRatio: 0.14, info: { grade: '1級', title: '暗算見習い', badgeColor: '#94a3b8' } },
  { minRatio: 0, info: { grade: '5級', title: 'そろばんビギナー', badgeColor: '#64748b' } }
];

const MODE_REFERENCE_MAX: Record<GameMode, number> = {
  standard: 14500,
  endless: 32000
};

export function getRankForScore(score: number, mode: GameMode): RankInfo {
  const ref = MODE_REFERENCE_MAX[mode];
  const ratio = score / ref;
  for (const tier of RANK_LADDER) {
    if (ratio >= tier.minRatio) {
      return tier.info;
    }
  }
  return RANK_LADDER[RANK_LADDER.length - 1].info;
}

export function getGradeOrder(grade: string): number {
  const idx = RANK_LADDER.findIndex((r) => r.info.grade === grade);
  return idx === -1 ? -1 : RANK_LADDER.length - idx;
}

export function createDefaultProgress(): StoredProgress {
  return {
    modes: {
      standard: { bestScore: 0, bestGrade: '-', plays: 0 },
      endless: { bestScore: 0, bestGrade: '-', plays: 0 }
    },
    highestGrade: '-',
    discoveredSeriesIds: []
  };
}

export class ScoreManager {
  private progress: StoredProgress;

  constructor(private readonly storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null) {
    this.progress = this.load();
  }

  getProgress(): StoredProgress {
    return this.progress;
  }

  recordDiscoveredSeries(seriesId: string): void {
    if (seriesId.startsWith('proc-')) return;
    if (!this.progress.discoveredSeriesIds.includes(seriesId)) {
      this.progress.discoveredSeriesIds.push(seriesId);
      this.save();
    }
  }

  recordRun(
    mode: GameMode,
    score: number,
    rank: RankInfo
  ): { isNewRecord: boolean; progress: StoredProgress } {
    const modeStats = this.progress.modes[mode];
    modeStats.plays += 1;

    const isNewRecord = score > modeStats.bestScore;
    if (isNewRecord) {
      modeStats.bestScore = score;
    }

    if (modeStats.bestGrade === '-' || getGradeOrder(rank.grade) > getGradeOrder(modeStats.bestGrade)) {
      modeStats.bestGrade = rank.grade;
    }

    if (
      this.progress.highestGrade === '-' ||
      getGradeOrder(rank.grade) > getGradeOrder(this.progress.highestGrade)
    ) {
      this.progress.highestGrade = rank.grade;
    }

    this.save();
    return { isNewRecord, progress: this.progress };
  }

  private load(): StoredProgress {
    const fallback = createDefaultProgress();
    if (!this.storage) return fallback;
    try {
      const raw = this.storage.getItem(PROGRESS_STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as Partial<StoredProgress>;
      return {
        modes: {
          standard: { ...fallback.modes.standard, ...(parsed.modes?.standard ?? {}) },
          endless: { ...fallback.modes.endless, ...(parsed.modes?.endless ?? {}) }
        },
        highestGrade: parsed.highestGrade ?? '-',
        discoveredSeriesIds: Array.isArray(parsed.discoveredSeriesIds) ? parsed.discoveredSeriesIds : []
      };
    } catch {
      return fallback;
    }
  }

  private save(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(this.progress));
    } catch {
      // Ignore quota/storage errors
    }
  }
}
