import type { RankGrade, RankingEntry, ScoreBreakdown, ScoreInput } from '../types';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const RANKING_STORAGE_KEY = 'cdc_delusion_ranking_v1';
const PLAYER_NAME_KEY = 'cdc_player_name_v1';
export const MAX_RANKING_ENTRIES = 100;

export const PRESET_RANKINGS: RankingEntry[] = [
  {
    id: 'preset-1',
    playerName: '剣豪タケル',
    score: 18400,
    kills: 21,
    survivorsAlive: 6,
    totalSurvivors: 6,
    maxCombo: 22,
    rank: 'S',
    cleared: true,
    isPreset: true,
    createdAt: 1700000001000
  },
  {
    id: 'preset-2',
    playerName: 'モップのリュウ',
    score: 14900,
    kills: 21,
    survivorsAlive: 5,
    totalSurvivors: 6,
    maxCombo: 16,
    rank: 'A',
    cleared: true,
    isPreset: true,
    createdAt: 1700000002000
  },
  {
    id: 'preset-3',
    playerName: '消火器ミユ',
    score: 12100,
    kills: 19,
    survivorsAlive: 4,
    totalSurvivors: 6,
    maxCombo: 14,
    rank: 'A',
    cleared: true,
    isPreset: true,
    createdAt: 1700000003000
  },
  {
    id: 'preset-4',
    playerName: '机バリケード健太',
    score: 8800,
    kills: 14,
    survivorsAlive: 4,
    totalSurvivors: 6,
    maxCombo: 9,
    rank: 'B',
    cleared: false,
    isPreset: true,
    createdAt: 1700000004000
  },
  {
    id: 'preset-5',
    playerName: '居眠りダイキ',
    score: 5200,
    kills: 8,
    survivorsAlive: 3,
    totalSurvivors: 6,
    maxCombo: 5,
    rank: 'C',
    cleared: false,
    isPreset: true,
    createdAt: 1700000005000
  }
];

export function sanitizePlayerName(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (!trimmed) return '俺';
  return Array.from(trimmed).slice(0, 10).join('');
}

export function determineRank(score: number, cleared: boolean, perfectSurvivors: boolean): RankGrade {
  if (cleared && score >= 21000 && perfectSurvivors) return 'SS';
  if (score >= 16500) return 'S';
  if (score >= 11500) return 'A';
  if (score >= 7000) return 'B';
  return 'C';
}

export function calculateScoreBreakdown(input: ScoreInput): ScoreBreakdown {
  const killScore =
    input.killsGrunt * 300 +
    input.killsGunner * 350 +
    input.killsShield * 500 +
    input.killsBoss * 2500;

  const survivorsAlive = Math.max(0, Math.min(input.survivorsAlive, input.totalSurvivors));
  const perSurvivorPts = input.cleared ? 1500 : 350;
  const survivorScore = survivorsAlive * perSurvivorPts;
  const perfectDefense = input.totalSurvivors > 0 && survivorsAlive === input.totalSurvivors;
  const perfectDefenseBonus = perfectDefense && input.cleared ? 3000 : 0;
  const comboScore = Math.max(0, input.maxCombo) * 120;
  const techBonus = Math.max(0, Math.round(input.techBonus));
  const clearBonus = input.cleared ? 2000 : 0;

  const totalScore =
    killScore +
    survivorScore +
    perfectDefenseBonus +
    comboScore +
    techBonus +
    clearBonus;

  const totalKills =
    input.killsGrunt + input.killsGunner + input.killsShield + input.killsBoss;

  const rank = determineRank(totalScore, input.cleared, perfectDefense);

  return {
    killScore,
    survivorScore,
    perfectDefenseBonus,
    comboScore,
    techBonus,
    clearBonus,
    totalScore,
    totalKills,
    survivorsAlive,
    totalSurvivors: input.totalSurvivors,
    rank
  };
}

export class RankingManager {
  private storage: StorageLike | null;

  constructor(storage?: StorageLike | null) {
    if (storage !== undefined) {
      this.storage = storage;
    } else {
      this.storage = typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
    }
  }

  getSavedPlayerName(): string {
    try {
      const saved = this.storage?.getItem(PLAYER_NAME_KEY);
      return saved ? sanitizePlayerName(saved) : '';
    } catch {
      return '';
    }
  }

  savePlayerName(name: string): string {
    const clean = sanitizePlayerName(name);
    try {
      this.storage?.setItem(PLAYER_NAME_KEY, clean);
    } catch {
      // ignore quota / private mode errors
    }
    return clean;
  }

  getRankings(): RankingEntry[] {
    try {
      const raw = this.storage?.getItem(RANKING_STORAGE_KEY);
      if (!raw) {
        return this.sortEntries([...PRESET_RANKINGS]);
      }
      const parsed = JSON.parse(raw) as RankingEntry[];
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return this.sortEntries([...PRESET_RANKINGS]);
      }
      return this.normalizeEntries(parsed);
    } catch {
      return this.sortEntries([...PRESET_RANKINGS]);
    }
  }

  recordRun(
    playerName: string,
    breakdown: ScoreBreakdown,
    maxCombo: number,
    cleared: boolean
  ): { entry: RankingEntry; position: number | null; rankings: RankingEntry[] } {
    const cleanName = sanitizePlayerName(playerName);
    const entry: RankingEntry = {
      id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      playerName: cleanName,
      score: breakdown.totalScore,
      kills: breakdown.totalKills,
      survivorsAlive: breakdown.survivorsAlive,
      totalSurvivors: breakdown.totalSurvivors,
      maxCombo,
      rank: breakdown.rank,
      cleared,
      isPreset: false,
      createdAt: Date.now()
    };

    const current = this.getRankings();
    const existingIdx = current.findIndex(
      (item) => !item.isPreset && item.playerName === cleanName
    );

    let nextCandidates: RankingEntry[];
    if (existingIdx >= 0) {
      const prev = current[existingIdx];
      if (this.isBetterOrEqualPerformance(entry, prev)) {
        // Overwrite the player's previous record in-place to avoid bloating storage
        nextCandidates = current.map((item, i) => (i === existingIdx ? entry : item));
      } else {
        // Keep the higher personal best without adding a duplicate entry
        nextCandidates = current;
      }
    } else {
      nextCandidates = [...current, entry];
    }

    const merged = this.sortEntries(nextCandidates).slice(0, MAX_RANKING_ENTRIES);
    const idx = merged.findIndex((item) => item.id === entry.id);

    try {
      // Always overwrite the single storage key with at most MAX_RANKING_ENTRIES (100)
      this.storage?.setItem(RANKING_STORAGE_KEY, JSON.stringify(merged));
    } catch {
      // ignore storage errors
    }

    return {
      entry,
      position: idx >= 0 ? idx + 1 : null,
      rankings: merged
    };
  }

  private normalizeEntries(entries: RankingEntry[]): RankingEntry[] {
    const sorted = this.sortEntries(entries);
    const seenPlayers = new Set<string>();
    const deduped: RankingEntry[] = [];
    for (const item of sorted) {
      if (!item.isPreset) {
        if (seenPlayers.has(item.playerName)) continue;
        seenPlayers.add(item.playerName);
      }
      deduped.push(item);
      if (deduped.length >= MAX_RANKING_ENTRIES) break;
    }
    return deduped;
  }

  private isBetterOrEqualPerformance(candidate: RankingEntry, existing: RankingEntry): boolean {
    if (candidate.score !== existing.score) return candidate.score > existing.score;
    if (candidate.survivorsAlive !== existing.survivorsAlive) {
      return candidate.survivorsAlive > existing.survivorsAlive;
    }
    return candidate.kills >= existing.kills;
  }

  private sortEntries(entries: RankingEntry[]): RankingEntry[] {
    return [...entries].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.survivorsAlive !== a.survivorsAlive) return b.survivorsAlive - a.survivorsAlive;
      if (b.kills !== a.kills) return b.kills - a.kills;
      return a.createdAt - b.createdAt;
    });
  }
}
