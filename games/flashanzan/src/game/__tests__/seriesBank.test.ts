import { describe, expect, it } from 'vitest';
import {
  ALL_SERIES,
  buildSessionProblems,
  generateHighSchoolSeriesProblem
} from '../seriesBank';

const POWER_NOTATION_RE = /[⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ^]|×10/;

describe('seriesBank high-school math accuracy and power-free formatting', () => {
  it('has 35 curated problems with zero power notation in formulas or explanations', () => {
    expect(ALL_SERIES).toHaveLength(35);
    for (const problem of ALL_SERIES) {
      expect(problem.formulaLatexLike, `${problem.id} formula`).not.toMatch(POWER_NOTATION_RE);
      expect(problem.explanation, `${problem.id} explanation`).not.toMatch(POWER_NOTATION_RE);
    }
  });

  it('verifies all finite series converge toward expected.value', () => {
    const finiteSeries = ALL_SERIES.filter((s) => s.expected.kind === 'finite');
    expect(finiteSeries.length).toBeGreaterThanOrEqual(28);

    const terms = 50_000;
    for (const problem of finiteSeries) {
      if (problem.expected.kind !== 'finite') continue;
      let sum = 0;
      for (let i = 0; i < terms; i += 1) {
        sum += problem.getNumericTerm(i);
      }
      if (problem.id === 'rad-tele-conv') {
        const exactPartial = 1 - 1 / Math.sqrt(terms + 1);
        expect(Math.abs(sum - exactPartial)).toBeLessThan(1e-10);
        expect(sum).toBeGreaterThan(0.99);
      } else {
        expect(
          Math.abs(sum - problem.expected.value),
          `${problem.id} partial sum ${sum} vs expected ${problem.expected.value}`
        ).toBeLessThan(2e-4);
      }
    }
  });

  it('verifies all infinite series diverge monotonically', () => {
    const divergentSeries = ALL_SERIES.filter((s) => s.expected.kind === 'infinity');
    expect(divergentSeries.length).toBe(6);

    for (const problem of divergentSeries) {
      let sum100 = 0;
      let sum50000 = 0;
      for (let i = 0; i < 50_000; i += 1) {
        const t = problem.getNumericTerm(i);
        expect(t).toBeGreaterThan(0);
        if (i < 100) sum100 += t;
        sum50000 += t;
      }
      expect(sum50000, `${problem.id} should keep growing`).toBeGreaterThan(sum100);
      const minExpected = problem.id === 'div-primes' ? 2.8 : 5.0;
      expect(sum50000, `${problem.id} should exceed ${minExpected}`).toBeGreaterThan(minExpected);
    }
  });

  it('never emits power notation, NaN, Infinity, or empty strings for huge indices', () => {
    const indices = [0, 1, 2, 10, 50, 1000, 1_000_000];
    for (const problem of ALL_SERIES) {
      for (const idx of indices) {
        const term = problem.getTerm(idx);
        const text =
          term.kind === 'plain'
            ? (term.text ?? '')
            : `${term.numerator ?? ''}/${term.denominator ?? ''}`;
        expect(text.length, `${problem.id} @ ${idx}`).toBeGreaterThan(0);
        expect(text, `${problem.id} @ ${idx}`).not.toContain('NaN');
        expect(text, `${problem.id} @ ${idx}`).not.toContain('Infinity');
        expect(text, `${problem.id} @ ${idx}`).not.toContain('undefined');
        expect(text, `${problem.id} @ ${idx} power notation`).not.toMatch(POWER_NOTATION_RE);

        const numeric = problem.getNumericTerm(idx);
        expect(Number.isNaN(numeric), `${problem.id} numeric @ ${idx}`).toBe(false);
      }
    }
  });

  it('generates diverse power-free procedural high-school math series across 30 seeds', () => {
    const categoriesSeen = new Set<string>();
    const indices = [0, 1, 2, 10, 50, 1000, 1_000_000];

    for (let seed = 1; seed <= 30; seed += 1) {
      const p = generateHighSchoolSeriesProblem(seed);
      categoriesSeen.add(p.category);
      expect(p.formulaLatexLike).not.toMatch(POWER_NOTATION_RE);
      expect(p.explanation).not.toMatch(POWER_NOTATION_RE);

      for (const idx of indices) {
        const term = p.getTerm(idx);
        const text =
          term.kind === 'plain'
            ? (term.text ?? '')
            : `${term.numerator ?? ''}/${term.denominator ?? ''}`;
        expect(text.length).toBeGreaterThan(0);
        expect(text).not.toMatch(POWER_NOTATION_RE);
      }

      if (p.expected.kind === 'finite') {
        let sum = 0;
        for (let i = 0; i < 50_000; i += 1) {
          sum += p.getNumericTerm(i);
        }
        expect(
          Math.abs(sum - p.expected.value),
          `${p.id} partial sum ${sum} vs ${p.expected.value}`
        ).toBeLessThan(2e-4);
      }
    }

    expect(categoriesSeen.size).toBeGreaterThanOrEqual(4);
  });

  it('builds varied non-monotonous sessions without category repetition', () => {
    const firstRun = buildSessionProblems('standard', true);
    expect(firstRun).toHaveLength(5);
    expect(firstRun[0].id).toBe('geo-half');
    expect(new Set(firstRun.map((p) => p.category)).size).toBe(5);

    const laterRun = buildSessionProblems('standard', false);
    expect(laterRun).toHaveLength(5);
    expect(new Set(laterRun.map((p) => p.category)).size).toBe(5);

    const endlessRun = buildSessionProblems('endless', false);
    for (let i = 1; i < endlessRun.length; i += 1) {
      expect(endlessRun[i].category).not.toBe(endlessRun[i - 1].category);
    }
  });
});
