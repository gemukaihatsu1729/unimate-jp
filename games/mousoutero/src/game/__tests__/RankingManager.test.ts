import { describe, it, expect } from 'vitest';
import {
  MAX_RANKING_ENTRIES,
  RankingManager,
  calculateScoreBreakdown,
  sanitizePlayerName,
  type StorageLike
} from '../RankingManager';

function createMemoryStorage(): StorageLike & { size: () => number; rawSizeBytes: () => number } {
  const store = new Map<string, string>();
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => {
      store.set(k, v);
    },
    size: () => store.size,
    rawSizeBytes: () => {
      let total = 0;
      for (const v of store.values()) total += v.length;
      return total;
    }
  };
}

describe('RankingManager & Score Calculation', () => {
  it('sanitizes player names with fallback and 10-char limit', () => {
    expect(sanitizePlayerName('   ')).toBe('俺');
    expect(sanitizePlayerName('  タカシ  ')).toBe('タカシ');
    expect(sanitizePlayerName('あいうえおかきくけこさしす')).toBe('あいうえおかきくけこ');
  });

  it('awards perfect defense bonus and SS rank for high-score flawless clear', () => {
    const bd = calculateScoreBreakdown({
      killsGrunt: 10,
      killsGunner: 7,
      killsShield: 3,
      killsBoss: 1,
      survivorsAlive: 6,
      totalSurvivors: 6,
      maxCombo: 20,
      techBonus: 1800,
      cleared: true
    });

    expect(bd.totalKills).toBe(21);
    expect(bd.survivorScore).toBe(9000);
    expect(bd.perfectDefenseBonus).toBe(3000);
    expect(bd.clearBonus).toBe(2000);
    expect(bd.totalScore).toBeGreaterThanOrEqual(21000);
    expect(bd.rank).toBe('SS');
  });

  it('does not grant perfect defense bonus or clear bonus when defeated', () => {
    const bd = calculateScoreBreakdown({
      killsGrunt: 4,
      killsGunner: 1,
      killsShield: 0,
      killsBoss: 0,
      survivorsAlive: 6,
      totalSurvivors: 6,
      maxCombo: 6,
      techBonus: 200,
      cleared: false
    });

    expect(bd.perfectDefenseBonus).toBe(0);
    expect(bd.clearBonus).toBe(0);
    expect(bd.survivorScore).toBe(6 * 350);
    expect(bd.totalScore).toBe(4 * 300 + 350 + 6 * 350 + 6 * 120 + 200);
  });

  it('persists top 100 rankings sorted descending and reports new rank position', () => {
    const mem = createMemoryStorage();
    const mgr = new RankingManager(mem);

    const initial = mgr.getRankings();
    expect(initial.length).toBe(5);
    expect(initial[0].score).toBeGreaterThanOrEqual(initial[1].score);

    const topBreakdown = calculateScoreBreakdown({
      killsGrunt: 10,
      killsGunner: 7,
      killsShield: 3,
      killsBoss: 1,
      survivorsAlive: 6,
      totalSurvivors: 6,
      maxCombo: 25,
      techBonus: 2500,
      cleared: true
    });

    const recorded = mgr.recordRun('伝説のショウ', topBreakdown, 25, true);
    expect(recorded.position).toBe(1);
    expect(recorded.rankings[0].playerName).toBe('伝説のショウ');

    // Verify persistence across instances
    const mgr2 = new RankingManager(mem);
    expect(mgr2.getRankings()[0].playerName).toBe('伝説のショウ');
  });

  it('caps rankings at top 100 and overwrites a single storage key without unbounded growth', () => {
    const mem = createMemoryStorage();
    const mgr = new RankingManager(mem);

    for (let i = 1; i <= 120; i++) {
      const bd = calculateScoreBreakdown({
        killsGrunt: i % 10,
        killsGunner: 1,
        killsShield: 0,
        killsBoss: 0,
        survivorsAlive: 4,
        totalSurvivors: 6,
        maxCombo: 5,
        techBonus: i * 100,
        cleared: false
      });
      mgr.recordRun(`生徒${i}`, bd, 5, false);
    }

    const rankings = mgr.getRankings();
    expect(MAX_RANKING_ENTRIES).toBe(100);
    expect(rankings.length).toBe(100);
    // Only a single storage key is used (overwritten on each update)
    expect(mem.size()).toBe(1);
    // Sorted descending
    for (let i = 1; i < rankings.length; i++) {
      expect(rankings[i - 1].score).toBeGreaterThanOrEqual(rankings[i].score);
    }
    // Lowest-scoring entry that fell out of top 100 should not appear
    const lowBd = calculateScoreBreakdown({
      killsGrunt: 0,
      killsGunner: 0,
      killsShield: 0,
      killsBoss: 0,
      survivorsAlive: 0,
      totalSurvivors: 6,
      maxCombo: 0,
      techBonus: 0,
      cleared: false
    });
    const outOfTop = mgr.recordRun('圏外くん', lowBd, 0, false);
    expect(outOfTop.position).toBeNull();
    expect(outOfTop.rankings.length).toBe(100);
    expect(outOfTop.rankings.some((r) => r.playerName === '圏外くん')).toBe(false);
  });

  it('overwrites the same player record on higher score and avoids duplicates on lower score', () => {
    const mem = createMemoryStorage();
    const mgr = new RankingManager(mem);

    const firstBd = calculateScoreBreakdown({
      killsGrunt: 6,
      killsGunner: 2,
      killsShield: 1,
      killsBoss: 0,
      survivorsAlive: 5,
      totalSurvivors: 6,
      maxCombo: 10,
      techBonus: 500,
      cleared: false
    });
    const r1 = mgr.recordRun('タカシ', firstBd, 10, false);
    expect(r1.position).not.toBeNull();
    const countAfterFirst = r1.rankings.filter((r) => r.playerName === 'タカシ').length;
    expect(countAfterFirst).toBe(1);

    // Lower score should keep personal best and not create a duplicate
    const lowerBd = calculateScoreBreakdown({
      killsGrunt: 1,
      killsGunner: 0,
      killsShield: 0,
      killsBoss: 0,
      survivorsAlive: 2,
      totalSurvivors: 6,
      maxCombo: 2,
      techBonus: 0,
      cleared: false
    });
    const r2 = mgr.recordRun('タカシ', lowerBd, 2, false);
    expect(r2.position).toBeNull();
    const takashiEntriesAfterLower = r2.rankings.filter((r) => r.playerName === 'タカシ');
    expect(takashiEntriesAfterLower.length).toBe(1);
    expect(takashiEntriesAfterLower[0].score).toBe(firstBd.totalScore);

    // Higher score should overwrite previous entry in-place
    const higherBd = calculateScoreBreakdown({
      killsGrunt: 10,
      killsGunner: 7,
      killsShield: 3,
      killsBoss: 1,
      survivorsAlive: 6,
      totalSurvivors: 6,
      maxCombo: 25,
      techBonus: 2500,
      cleared: true
    });
    const r3 = mgr.recordRun('タカシ', higherBd, 25, true);
    expect(r3.position).toBe(1);
    const takashiEntriesAfterHigher = r3.rankings.filter((r) => r.playerName === 'タカシ');
    expect(takashiEntriesAfterHigher.length).toBe(1);
    expect(takashiEntriesAfterHigher[0].score).toBe(higherBd.totalScore);
  });
});
