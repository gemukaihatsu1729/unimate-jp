import { describe, expect, it } from 'vitest';
import { checkAnswer, normalizeAnswerInput, parseAnswerExpression } from '../answerParser';

describe('normalizeAnswerInput', () => {
  it('normalizes full-width numbers, operators, and aliases', () => {
    expect(normalizeAnswerInput(' １＋１／２ ')).toBe('1+1/2');
    expect(normalizeAnswerInput('pi^2/6')).toBe('π^2/6');
    expect(normalizeAnswerInput('２＋sqrt(2)')).toBe('2+√(2)');
    expect(normalizeAnswerInput('ln(2)')).toBe('ln2');
    expect(normalizeAnswerInput('発散')).toBe('∞');
  });
});

describe('parseAnswerExpression', () => {
  it('parses integers, decimals, and fractions', () => {
    expect(parseAnswerExpression('2')).toEqual({ ok: true, kind: 'finite', value: 2 });
    expect(parseAnswerExpression('1.5')).toEqual({ ok: true, kind: 'finite', value: 1.5 });
    expect(parseAnswerExpression('3/2')).toEqual({ ok: true, kind: 'finite', value: 1.5 });
    expect(parseAnswerExpression('-4/5')).toEqual({ ok: true, kind: 'finite', value: -0.8 });
  });

  it('parses constants, roots, powers, and implicit multiplication', () => {
    const piOver4 = parseAnswerExpression('π/4');
    expect(piOver4.ok && piOver4.kind === 'finite' && Math.abs(piOver4.value - Math.PI / 4) < 1e-12).toBe(true);

    const basel = parseAnswerExpression('π²/6');
    expect(basel.ok && basel.kind === 'finite' && Math.abs(basel.value - (Math.PI ** 2) / 6) < 1e-12).toBe(true);

    const baselAscii = parseAnswerExpression('pi^2/6');
    expect(baselAscii.ok && baselAscii.kind === 'finite' && Math.abs(baselAscii.value - (Math.PI ** 2) / 6) < 1e-12).toBe(true);

    const eMinus1 = parseAnswerExpression('e-1');
    expect(eMinus1.ok && eMinus1.kind === 'finite' && Math.abs(eMinus1.value - (Math.E - 1)) < 1e-12).toBe(true);

    const ln2 = parseAnswerExpression('ln2');
    expect(ln2.ok && ln2.kind === 'finite' && Math.abs(ln2.value - Math.LN2) < 1e-12).toBe(true);

    const twoPlusSqrt2 = parseAnswerExpression('2+√2');
    expect(
      twoPlusSqrt2.ok && twoPlusSqrt2.kind === 'finite' && Math.abs(twoPlusSqrt2.value - (2 + Math.SQRT2)) < 1e-12
    ).toBe(true);

    const implicitMul = parseAnswerExpression('2√2');
    expect(
      implicitMul.ok && implicitMul.kind === 'finite' && Math.abs(implicitMul.value - 2 * Math.SQRT2) < 1e-12
    ).toBe(true);

    const parenMul = parseAnswerExpression('2(1+√2)');
    expect(
      parenMul.ok && parenMul.kind === 'finite' && Math.abs(parenMul.value - 2 * (1 + Math.SQRT2)) < 1e-12
    ).toBe(true);
  });

  it('parses infinity and rejects invalid expressions', () => {
    expect(parseAnswerExpression('∞')).toEqual({ ok: true, kind: 'infinity' });
    expect(parseAnswerExpression('inf')).toEqual({ ok: true, kind: 'infinity' });

    expect(parseAnswerExpression('').ok).toBe(false);
    expect(parseAnswerExpression('1/0').ok).toBe(false);
    expect(parseAnswerExpression('√-1').ok).toBe(false);
    expect(parseAnswerExpression('2+').ok).toBe(false);
    expect(parseAnswerExpression('1+∞').ok).toBe(false);
    expect(parseAnswerExpression('((2)').ok).toBe(false);
    expect(parseAnswerExpression('2..5').ok).toBe(false);
  });
});

describe('checkAnswer', () => {
  it('accepts mathematically equivalent expressions and rejects rough approximations', () => {
    const threeHalves = { kind: 'finite' as const, value: 1.5, display: '3/2' };
    expect(checkAnswer('3/2', threeHalves).correct).toBe(true);
    expect(checkAnswer('1.5', threeHalves).correct).toBe(true);
    expect(checkAnswer('1+1/2', threeHalves).correct).toBe(true);
    expect(checkAnswer('1.49', threeHalves).correct).toBe(false);

    const oneThird = { kind: 'finite' as const, value: 1 / 3, display: '1/3' };
    expect(checkAnswer('1/3', oneThird).correct).toBe(true);
    expect(checkAnswer('0.33', oneThird).correct).toBe(false);

    const basel = { kind: 'finite' as const, value: (Math.PI * Math.PI) / 6, display: 'π²/6' };
    expect(checkAnswer('π²/6', basel).correct).toBe(true);
    expect(checkAnswer('pi^2/6', basel).correct).toBe(true);

    const div = { kind: 'infinity' as const, display: '∞' as const };
    expect(checkAnswer('∞', div).correct).toBe(true);
    expect(checkAnswer('999999', div).correct).toBe(false);
  });
});
