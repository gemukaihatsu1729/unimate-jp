import { describe, expect, it } from 'vitest';
import {
  ScoreManager,
  calculateQuestionScore,
  getGradeOrder,
  getRankForScore
} from '../ScoreManager';

describe('calculateQuestionScore', () => {
  it('awards 0 on wrong answer', () => {
    const out = calculateQuestionScore({
      correct: false,
      comboAfterAnswer: 0,
      answeredEarly: true,
      answerTimeMs: 500,
      usedReplay: false
    });
    expect(out.pointsEarned).toBe(0);
  });

  it('applies unified base points, early speed bonus, and combo multiplier', () => {
    const first = calculateQuestionScore({
      correct: true,
      comboAfterAnswer: 1,
      answeredEarly: true,
      answerTimeMs: 0,
      usedReplay: false
    });
    expect(first.basePoints).toBe(1500);
    expect(first.speedBonus).toBe(800);
    expect(first.comboMultiplier).toBe(1);
    expect(first.pointsEarned).toBe(2300);

    const thirdCombo = calculateQuestionScore({
      correct: true,
      comboAfterAnswer: 3,
      answeredEarly: false,
      answerTimeMs: 0,
      usedReplay: false
    });
    expect(thirdCombo.basePoints).toBe(1500);
    expect(thirdCombo.speedBonus).toBe(650);
    expect(thirdCombo.comboMultiplier).toBe(1.3);
    expect(thirdCombo.pointsEarned).toBe(Math.round(2150 * 1.3));
  });

  it('removes speed bonus when replay is used and caps combo multiplier at 2.5x', () => {
    const replayed = calculateQuestionScore({
      correct: true,
      comboAfterAnswer: 20,
      answeredEarly: true,
      answerTimeMs: 100,
      usedReplay: true
    });
    expect(replayed.speedBonus).toBe(0);
    expect(replayed.comboMultiplier).toBe(2.5);
    expect(replayed.pointsEarned).toBe(1500 * 2.5);
  });
});

describe('getRankForScore and ScoreManager', () => {
  it('assigns monotonic Dan grades across scores', () => {
    const low = getRankForScore(0, 'standard');
    const mid = getRankForScore(7000, 'standard');
    const top = getRankForScore(14500, 'standard');

    expect(low.grade).toBe('5級');
    expect(top.grade).toBe('∞神');
    expect(getGradeOrder(top.grade)).toBeGreaterThan(getGradeOrder(mid.grade));
    expect(getGradeOrder(mid.grade)).toBeGreaterThan(getGradeOrder(low.grade));
  });

  it('persists records and discovered series without throwing when storage is null', () => {
    const manager = new ScoreManager(null);
    manager.recordDiscoveredSeries('geo-half');
    manager.recordDiscoveredSeries('geo-half');
    manager.recordDiscoveredSeries('proc-geo-1-1-2-99');

    const { isNewRecord, progress } = manager.recordRun(
      'standard',
      9000,
      getRankForScore(9000, 'standard')
    );
    expect(isNewRecord).toBe(true);
    expect(progress.discoveredSeriesIds).toEqual(['geo-half']);
    expect(progress.modes.standard.bestScore).toBe(9000);
    expect(progress.modes.standard.plays).toBe(1);
  });
});
