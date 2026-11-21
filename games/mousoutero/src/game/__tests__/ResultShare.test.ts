import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PUBLIC_GAME_URL,
  buildLineShareUrl,
  buildShareText,
  buildXShareUrl,
  getResultCommentary
} from '../ResultShare';
import { calculateScoreBreakdown } from '../RankingManager';

describe('ResultShare (Survivor Commentary & SNS Share)', () => {
  it('returns distinct survivor-specific comments across all cleared survival tiers', () => {
    const tiers = [6, 5, 4, 2, 0];
    const quotes = tiers.map((alive) =>
      getResultCommentary({
        playerName: 'アオイ',
        cleared: true,
        survivorsAlive: alive,
        totalSurvivors: 6
      })
    );

    const uniqueQuotes = new Set(quotes.map((q) => q.teacherQuote));
    expect(uniqueQuotes.size).toBe(5);
    expect(quotes[0].headline).toContain('完全防衛');
    expect(quotes[4].headline).toContain('全員気絶');
    for (const q of quotes) {
      expect(q.teacherQuote).toContain('アオイ');
    }
  });

  it('returns distinct survivor-specific comments across defeat survival tiers', () => {
    const tiers = [6, 5, 2, 0];
    const quotes = tiers.map((alive) =>
      getResultCommentary({
        playerName: 'タカシ',
        cleared: false,
        survivorsAlive: alive,
        totalSurvivors: 6
      })
    );

    const uniqueQuotes = new Set(quotes.map((q) => q.teacherQuote));
    expect(uniqueQuotes.size).toBe(4);
    expect(quotes[0].headline).toContain('爆睡落下');
    expect(quotes[3].headline).toContain('壊滅');
  });

  it('builds formatted SNS share text and valid X / LINE share URLs', () => {
    const breakdown = calculateScoreBreakdown({
      killsGrunt: 10,
      killsGunner: 7,
      killsShield: 3,
      killsBoss: 1,
      survivorsAlive: 6,
      totalSurvivors: 6,
      maxCombo: 22,
      techBonus: 1800,
      cleared: true
    });

    const text = buildShareText({
      playerName: 'アオイ',
      breakdown,
      rankPosition: 1,
      cleared: true
    });

    expect(text).toContain('アオイ');
    expect(text).toContain('撃破：21体');
    expect(text).toContain('生存：6/6名');
    expect(text).toContain('校内ランキング 1位');
    expect(text).toContain('#授業中妄想クライシス');

    const xUrl = buildXShareUrl(text, DEFAULT_PUBLIC_GAME_URL);
    expect(xUrl).toContain('https://twitter.com/intent/tweet?');
    expect(xUrl).toContain(encodeURIComponent(DEFAULT_PUBLIC_GAME_URL));

    const lineUrl = buildLineShareUrl(text, DEFAULT_PUBLIC_GAME_URL);
    expect(lineUrl).toContain('https://line.me/R/share?text=');
  });
});
