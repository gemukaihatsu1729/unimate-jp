import type { GameMode, SeriesCategory, SeriesProblem, TermDisplay } from '../types';

export const CATEGORY_LABELS: Record<SeriesCategory, string> = {
  geometric: '等比・循環',
  'mixed-geo': '混合等比',
  trig: '三角関数',
  telescoping: '部分分数',
  logarithm: '対数の和',
  radical: '有理化',
  'arith-geo': '等差×等比',
  fibonacci: 'フィボナッチ',
  factorial: '階乗・e',
  famous: '有名極限',
  divergent: '発散トラップ'
};

export function gcd(a: number, b: number): number {
  let x = Math.abs(Math.trunc(a));
  let y = Math.abs(Math.trunc(b));
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x || 1;
}

function plain(sign: '+' | '-' | '', text: string): TermDisplay {
  return { sign, kind: 'plain', text };
}

function frac(sign: '+' | '-' | '', numerator: string, denominator: string): TermDisplay {
  return { sign, kind: 'fraction', numerator, denominator };
}

export function modPow(base: number, exp: number, mod: number): number {
  let res = 1n;
  let b = BigInt(base) % BigInt(mod);
  let e = BigInt(exp);
  const m = BigInt(mod);
  while (e > 0n) {
    if (e & 1n) res = (res * b) % m;
    b = (b * b) % m;
    e >>= 1n;
  }
  return Number(res);
}

export function formatExpandedInt(val: bigint | number): string {
  if (typeof val === 'bigint') {
    const neg = val < 0n;
    const s = (neg ? -val : val).toString();
    const out = s.length <= 14 ? s : `${s.slice(0, 5)}…${s.slice(-4)}`;
    return neg ? `-${out}` : out;
  }
  const truncated = Math.trunc(val);
  if (!Number.isFinite(truncated)) return '0';
  const neg = truncated < 0;
  const s = Math.abs(truncated).toString();
  const out = s.length <= 14 ? s : `${s.slice(0, 5)}…${s.slice(-4)}`;
  return neg ? `-${out}` : out;
}

export function formatExpandedPower(base: number, exp: number): string {
  if (exp === 0) return '1';
  if (exp === 1) return String(base);

  if (exp * Math.log10(base) < 14) {
    const exact = BigInt(base) ** BigInt(exp);
    const s = exact.toString();
    if (s.length <= 14) return s;
  }

  const logVal = exp * Math.log10(base);
  const fracPart = logVal - Math.floor(logVal);
  const lead = Math.floor(Math.pow(10, fracPart + 4))
    .toString()
    .slice(0, 5);
  const tail = String(modPow(base, exp, 10000)).padStart(4, '0');
  return `${lead}…${tail}`;
}

function fibMod(n: number, mod: number): number {
  // Returns F(n) mod mod where F(0)=0, F(1)=1, F(2)=1
  if (n <= 0) return 0;
  let a = 0n;
  let b = 1n;
  let c = 1n;
  let d = 1n;
  // Base matrix M = [[1, 1], [1, 0]], compute M^n mod m
  // Start with identity R = [[1, 0], [0, 1]]
  let r00 = 1n;
  let r01 = 0n;
  let r10 = 0n;
  let r11 = 1n;
  const m = BigInt(mod);

  a = 1n;
  b = 1n;
  c = 1n;
  d = 0n;
  let k = BigInt(n);

  while (k > 0n) {
    if (k & 1n) {
      const nr00 = (r00 * a + r01 * c) % m;
      const nr01 = (r00 * b + r01 * d) % m;
      const nr10 = (r10 * a + r11 * c) % m;
      const nr11 = (r10 * b + r11 * d) % m;
      r00 = nr00;
      r01 = nr01;
      r10 = nr10;
      r11 = nr11;
    }
    const na = (a * a + b * c) % m;
    const nb = (a * b + b * d) % m;
    const nc = (c * a + d * c) % m;
    const nd = (c * b + d * d) % m;
    a = na;
    b = nb;
    c = nc;
    d = nd;
    k >>= 1n;
  }
  return Number(r01);
}

const PHI = (1 + Math.sqrt(5)) / 2;
const PSI = (1 - Math.sqrt(5)) / 2;
const SQRT5 = Math.sqrt(5);

export function formatFibonacci(n: number): string {
  if (n <= 0) return '0';
  if (n <= 65) {
    let a = 0n;
    let b = 1n;
    for (let i = 2; i <= n; i += 1) {
      const next = a + b;
      a = b;
      b = next;
    }
    return formatExpandedInt(b);
  }

  const logVal = n * Math.log10(PHI) - 0.5 * Math.log10(5);
  const fracPart = logVal - Math.floor(logVal);
  const lead = Math.floor(Math.pow(10, fracPart + 4))
    .toString()
    .slice(0, 5);
  const tail = String(fibMod(n, 10000)).padStart(4, '0');
  return `${lead}…${tail}`;
}

export function formatTrigAngle(num: number, den: number): string {
  if (num === 0) return '0';
  const g = gcd(num, den);
  const rn = num / g;
  const rd = den / g;
  const coef = rn === 1 ? 'π' : `${formatExpandedInt(rn)}π`;
  return rd === 1 ? coef : `${coef}/${rd}`;
}

function reduceRationalDisplay(num: number, den: number): { value: number; display: string } {
  const sign = (num < 0) !== (den < 0) ? -1 : 1;
  const an = Math.abs(num);
  const ad = Math.abs(den);
  const g = gcd(an, ad);
  const rn = (an / g) * sign;
  const rd = ad / g;
  return {
    value: rn / rd,
    display: rd === 1 ? String(rn) : `${rn}/${rd}`
  };
}

function firstPrimes(count: number): number[] {
  const primes: number[] = [];
  let candidate = 2;
  while (primes.length < count) {
    let isPrime = true;
    for (let i = 0; i < primes.length; i += 1) {
      const p = primes[i];
      if (p * p > candidate) break;
      if (candidate % p === 0) {
        isPrime = false;
        break;
      }
    }
    if (isPrime) primes.push(candidate);
    candidate += candidate === 2 ? 1 : 2;
  }
  return primes;
}

const PRIMES = firstPrimes(300);

function makeGeometricProblem(opts: {
  id: string;
  title: string;
  formulaLatexLike: string;
  explanation: string;
  aNum: number;
  aDen?: number;
  rNum: number;
  rDen: number;
}): SeriesProblem {
  const aDen = opts.aDen ?? 1;
  const rAbsNum = Math.abs(opts.rNum);
  const rSignNeg = opts.rNum < 0;

  const expected = reduceRationalDisplay(opts.aNum * opts.rDen, aDen * (opts.rDen - opts.rNum));

  return {
    id: opts.id,
    category: 'geometric',
    title: opts.title,
    formulaLatexLike: opts.formulaLatexLike,
    explanation: opts.explanation,
    expected: { kind: 'finite', value: expected.value, display: expected.display },
    requiredSymbols: [],
    getTerm: (index: number): TermDisplay => {
      const isNegative = rSignNeg && index % 2 === 1;
      const sign: '+' | '-' | '' = index === 0 ? '' : isNegative ? '-' : '+';

      if (index === 0) {
        return aDen === 1 ? plain(sign, String(opts.aNum)) : frac(sign, String(opts.aNum), String(aDen));
      }

      if (index <= 20) {
        const numBig = BigInt(opts.aNum) * BigInt(rAbsNum) ** BigInt(index);
        const denBig = BigInt(aDen) * BigInt(opts.rDen) ** BigInt(index);
        // Reduce small values cleanly
        let x = numBig;
        let y = denBig;
        while (y !== 0n) {
          const t = x % y;
          x = y;
          y = t;
        }
        const rn = numBig / (x || 1n);
        const rd = denBig / (x || 1n);
        if (rd === 1n) return plain(sign, formatExpandedInt(rn));
        return frac(sign, formatExpandedInt(rn), formatExpandedInt(rd));
      }

      // Deep overdrive: factor out common gcd of (aNum, aDen) or base terms without powers
      let numStr: string;
      if (rAbsNum === 1) {
        numStr = String(opts.aNum);
      } else if (opts.aNum === 1) {
        numStr = formatExpandedPower(rAbsNum, index);
      } else {
        numStr = `${opts.aNum}·${formatExpandedPower(rAbsNum, index)}`;
      }
      const denStr =
        aDen === 1
          ? formatExpandedPower(opts.rDen, index)
          : `${aDen}·${formatExpandedPower(opts.rDen, index)}`;
      return frac(sign, numStr, denStr);
    },
    getNumericTerm: (index: number): number => (opts.aNum / aDen) * Math.pow(opts.rNum / opts.rDen, index)
  };
}

function makeMixedGeoProblem(opts: {
  id: string;
  title: string;
  aNum: number;
  aDen: number;
  bNum: number;
  bDen: number;
  bSign: 1 | -1;
}): SeriesProblem {
  // Even terms (2k): aNum / aDen^(k+1) -> sum = aNum / (aDen - 1)
  // Odd terms (2k+1): bSign * bNum / bDen^(k+1) -> sum = bSign * bNum / (bDen - 1)
  const expected = reduceRationalDisplay(
    opts.aNum * (opts.bDen - 1) + opts.bSign * opts.bNum * (opts.aDen - 1),
    (opts.aDen - 1) * (opts.bDen - 1)
  );
  const op = opts.bSign === -1 ? '-' : '+';
  const preview = `${opts.aNum}/${opts.aDen} ${op} ${opts.bNum}/${opts.bDen} + ${opts.aNum}/${opts.aDen * opts.aDen} ${op} ${opts.bNum}/${opts.bDen * opts.bDen} + … = ${expected.display}`;

  return {
    id: opts.id,
    category: 'mixed-geo',
    title: opts.title,
    formulaLatexLike: preview,
    explanation: `偶数番目 (${opts.aNum}/${opts.aDen} + ${opts.aNum}/${opts.aDen * opts.aDen} + …) と奇数番目 (${op}${opts.bNum}/${opts.bDen} ${op} ${opts.bNum}/${opts.bDen * opts.bDen} …) の2つの無限等比級数に分解して足し合わせると ${expected.display} になります。`,
    expected: { kind: 'finite', value: expected.value, display: expected.display },
    requiredSymbols: [],
    getTerm: (index: number): TermDisplay => {
      const k = Math.floor(index / 2) + 1;
      if (index % 2 === 0) {
        return frac(index === 0 ? '' : '+', String(opts.aNum), formatExpandedPower(opts.aDen, k));
      }
      return frac(opts.bSign === -1 ? '-' : '+', String(opts.bNum), formatExpandedPower(opts.bDen, k));
    },
    getNumericTerm: (index: number): number => {
      const k = Math.floor(index / 2) + 1;
      return index % 2 === 0
        ? opts.aNum / Math.pow(opts.aDen, k)
        : (opts.bSign * opts.bNum) / Math.pow(opts.bDen, k);
    }
  };
}

function makeTrigSeriesProblem(opts: {
  id: string;
  title: string;
  fn: 'cos' | 'sin';
  a: number;
  angleStepNum: number;
  angleStepDen: number;
  angleOffsetNum: number;
  q: number;
  startPower: number;
  expectedNum: number;
  expectedDen: number;
  explanation: string;
}): SeriesProblem {
  const expected = reduceRationalDisplay(opts.expectedNum, opts.expectedDen);

  const previewTerms: string[] = [];
  for (let i = 0; i < 4; i += 1) {
    const angle = formatTrigAngle(opts.angleOffsetNum + i * opts.angleStepNum, opts.angleStepDen);
    const fnStr = opts.a === 1 ? `${opts.fn}(${angle})` : `${opts.a}${opts.fn}(${angle})`;
    const p = i + opts.startPower;
    previewTerms.push(p === 0 ? fnStr : `${fnStr}/${Math.pow(opts.q, p)}`);
  }

  return {
    id: opts.id,
    category: 'trig',
    title: opts.title,
    formulaLatexLike: `${previewTerms.join(' + ')} + … = ${expected.display}`,
    explanation: opts.explanation,
    expected: { kind: 'finite', value: expected.value, display: expected.display },
    requiredSymbols: [],
    getTerm: (index: number): TermDisplay => {
      const sign: '+' | '' = index === 0 ? '' : '+';
      const angle = formatTrigAngle(opts.angleOffsetNum + index * opts.angleStepNum, opts.angleStepDen);
      const fnStr = opts.a === 1 ? `${opts.fn}(${angle})` : `${opts.a}${opts.fn}(${angle})`;
      const p = index + opts.startPower;
      if (p === 0) return plain(sign, fnStr);
      return frac(sign, fnStr, formatExpandedPower(opts.q, p));
    },
    getNumericTerm: (index: number): number => {
      const theta = ((opts.angleOffsetNum + index * opts.angleStepNum) * Math.PI) / opts.angleStepDen;
      const trigVal = opts.fn === 'cos' ? Math.cos(theta) : Math.sin(theta);
      return (opts.a * trigVal) / Math.pow(opts.q, index + opts.startPower);
    }
  };
}

function factorial(n: number): number {
  let acc = 1;
  for (let i = 2; i <= n; i += 1) {
    acc *= i;
    if (!Number.isFinite(acc)) return Infinity;
  }
  return acc;
}

export const ALL_SERIES: SeriesProblem[] = [
  // 1. Geometric & Decimals (4)
  makeGeometricProblem({
    id: 'geo-half',
    title: '無限等比級数の原点 (公比 1/2)',
    formulaLatexLike: '1 + 1/2 + 1/4 + 1/8 + … = 2',
    explanation: '初項 a = 1、公比 r = 1/2 の無限等比級数。a/(1-r) = 1/(1-1/2) = 2 に収束します。',
    aNum: 1,
    rNum: 1,
    rDen: 2
  }),
  makeGeometricProblem({
    id: 'geo-alt-half',
    title: '交代等比級数 (公比 -1/2)',
    formulaLatexLike: '1 - 1/2 + 1/4 - 1/8 + … = 2/3',
    explanation: '初項 a = 1、公比 r = -1/2。1 / (1 - (-1/2)) = 2/3 に振動しながら収束します。',
    aNum: 1,
    rNum: -1,
    rDen: 2
  }),
  {
    id: 'dec-nine',
    category: 'geometric',
    title: '循環小数 0.99999… の極限',
    formulaLatexLike: '0.9 + 0.09 + 0.009 + 0.0009 + … = 1',
    explanation: '初項 0.9、公比 0.1 の無限等比級数。0.9 / (1 - 0.1) = 1 と厳密に一致します。',
    expected: { kind: 'finite', value: 1, display: '1' },
    requiredSymbols: [],
    getTerm: (index: number): TermDisplay => {
      const sign: '+' | '' = index === 0 ? '' : '+';
      if (index < 8) {
        return plain(sign, `0.${'0'.repeat(index)}9`);
      }
      return plain(sign, '0.0000…0009');
    },
    getNumericTerm: (index: number): number => 9 * Math.pow(10, -(index + 1))
  },
  {
    id: 'geo-sqrt2',
    category: 'geometric',
    title: '無理数公比 1/√2 の等比級数',
    formulaLatexLike: '1 + 1/√2 + 1/2 + 1/(2√2) + … = 2+√2',
    explanation: '公比 r = 1/√2 の等比級数。有理化すると 1 / (1 - 1/√2) = √2 / (√2 - 1) = 2 + √2 です。',
    expected: { kind: 'finite', value: 2 + Math.SQRT2, display: '2+√2' },
    requiredSymbols: ['√'],
    getTerm: (index: number): TermDisplay => {
      if (index === 0) return plain('', '1');
      if (index % 2 === 0) {
        return frac('+', '1', formatExpandedPower(2, index / 2));
      }
      const k = (index - 1) / 2;
      return k === 0 ? frac('+', '1', '√2') : frac('+', '1', `${formatExpandedPower(2, k)}√2`);
    },
    getNumericTerm: (index: number): number => Math.pow(Math.SQRT1_2, index)
  },

  // 2. Mixed Geometric (3)
  makeMixedGeoProblem({
    id: 'mix-2-3-plus',
    title: '2系統ミックス級数 (1/2系 + 1/3系)',
    aNum: 1,
    aDen: 2,
    bNum: 1,
    bDen: 3,
    bSign: 1
  }),
  makeMixedGeoProblem({
    id: 'mix-2-3-minus',
    title: '2系統ミックス級数 (1/2系 - 1/3系)',
    aNum: 1,
    aDen: 2,
    bNum: 1,
    bDen: 3,
    bSign: -1
  }),
  {
    id: 'mix-1-3-plus',
    category: 'mixed-geo',
    title: '交互合体等比級数 (1 + 1/3 + 1/2 + 1/9…)',
    formulaLatexLike: '1 + 1/3 + 1/2 + 1/9 + 1/4 + 1/27 + … = 5/2',
    explanation: '偶数項 (1 + 1/2 + 1/4 + … = 2) と奇数項 (1/3 + 1/9 + 1/27 + … = 1/2) に分けると 2 + 1/2 = 5/2 になります。',
    expected: { kind: 'finite', value: 2.5, display: '5/2' },
    requiredSymbols: [],
    getTerm: (index: number): TermDisplay => {
      const k = Math.floor(index / 2);
      if (index === 0) return plain('', '1');
      if (index % 2 === 0) return frac('+', '1', formatExpandedPower(2, k));
      return frac('+', '1', formatExpandedPower(3, k + 1));
    },
    getNumericTerm: (index: number): number => {
      const k = Math.floor(index / 2);
      return index % 2 === 0 ? 1 / Math.pow(2, k) : 1 / Math.pow(3, k + 1);
    }
  },

  // 3. Trig × Geometric (4)
  makeTrigSeriesProblem({
    id: 'trig-cos-half',
    title: '三角関数×等比 (cos(kπ/2) / 2の累乗)',
    fn: 'cos',
    a: 1,
    angleStepNum: 1,
    angleStepDen: 2,
    angleOffsetNum: 0,
    q: 2,
    startPower: 0,
    expectedNum: 4,
    expectedDen: 5,
    explanation: 'cos(kπ/2) は 1, 0, -1, 0, 1, 0… を周期4で繰り返します。よって 1 - 1/4 + 1/16 - 1/64 + … = 1 / (1 + 1/4) = 4/5 になります！'
  }),
  makeTrigSeriesProblem({
    id: 'trig-sin-alt',
    title: '三角関数×等比 (sin((2k+1)π/2))',
    fn: 'sin',
    a: 1,
    angleStepNum: 2,
    angleStepDen: 2,
    angleOffsetNum: 1,
    q: 2,
    startPower: 0,
    expectedNum: 2,
    expectedDen: 3,
    explanation: 'sin(π/2)=1, sin(3π/2)=-1, sin(5π/2)=1… と符号が交互に変わるため、1 - 1/2 + 1/4 - 1/8 + … = 2/3 に収束します。'
  }),
  makeTrigSeriesProblem({
    id: 'trig-cos-third',
    title: '三角関数×等比 (cos(kπ) / 3の系)',
    fn: 'cos',
    a: 1,
    angleStepNum: 1,
    angleStepDen: 1,
    angleOffsetNum: 0,
    q: 3,
    startPower: 0,
    expectedNum: 3,
    expectedDen: 4,
    explanation: 'cos(0)=1, cos(π)=-1, cos(2π)=1… なので公比 -1/3 の交代等比級数になり、1 / (1 + 1/3) = 3/4 に収束します。'
  }),
  makeTrigSeriesProblem({
    id: 'trig-sin-half',
    title: '三角関数×等比 (sin((k+1)π/2) / 2の系)',
    fn: 'sin',
    a: 1,
    angleStepNum: 1,
    angleStepDen: 2,
    angleOffsetNum: 1,
    q: 2,
    startPower: 1,
    expectedNum: 2,
    expectedDen: 5,
    explanation: 'sin(π/2)=1, sin(π)=0, sin(3π/2)=-1, sin(2π)=0… より、1/2 - 1/8 + 1/32 - … = (1/2)/(1 + 1/4) = 2/5 です。'
  }),

  // 4. Telescoping (5)
  {
    id: 'tele-expanded',
    category: 'telescoping',
    title: '階差・部分分数分解 (1/2 + 1/6 + 1/12 + …)',
    formulaLatexLike: '1/2 + 1/6 + 1/12 + 1/20 + 1/30 + … = 1',
    explanation: '分母が 1×2, 2×3, 3×4, 4×5… に気づけば 1/k - 1/(k+1) に部分分数分解でき、極限は 1 になります！',
    expected: { kind: 'finite', value: 1, display: '1' },
    requiredSymbols: [],
    getTerm: (index: number): TermDisplay => {
      const k = BigInt(index + 1);
      return frac(index === 0 ? '' : '+', '1', formatExpandedInt(k * (k + 1n)));
    },
    getNumericTerm: (index: number): number => 1 / ((index + 1) * (index + 2))
  },
  {
    id: 'tele-shift',
    category: 'telescoping',
    title: '1/6から始まる部分分数分解',
    formulaLatexLike: '1/6 + 1/12 + 1/20 + 1/30 + 1/42 + … = 1/2',
    explanation: '1/(2×3) + 1/(3×4) + … = (1/2 - 1/3) + (1/3 - 1/4) + … と消え合い、最初の 1/2 だけが残ります。',
    expected: { kind: 'finite', value: 0.5, display: '1/2' },
    requiredSymbols: [],
    getTerm: (index: number): TermDisplay => {
      const k = BigInt(index + 2);
      return frac(index === 0 ? '' : '+', '1', formatExpandedInt(k * (k + 1n)));
    },
    getNumericTerm: (index: number): number => 1 / ((index + 2) * (index + 3))
  },
  {
    id: 'tele-odd',
    category: 'telescoping',
    title: '奇数の積の部分分数分解',
    formulaLatexLike: '1/(1·3) + 1/(3·5) + 1/(5·7) + 1/(7·9) + … = 1/2',
    explanation: '1/((2k-1)(2k+1)) = (1/2)(1/(2k-1) - 1/(2k+1)) に分解でき、すべて相殺して 1/2 になります。',
    expected: { kind: 'finite', value: 0.5, display: '1/2' },
    requiredSymbols: [],
    getTerm: (index: number): TermDisplay => {
      const a = formatExpandedInt(2 * index + 1);
      const b = formatExpandedInt(2 * index + 3);
      return frac(index === 0 ? '' : '+', '1', `${a}·${b}`);
    },
    getNumericTerm: (index: number): number => 1 / ((2 * index + 1) * (2 * index + 3))
  },
  {
    id: 'tele-step2',
    category: 'telescoping',
    title: '2つ飛ばしの部分分数分解',
    formulaLatexLike: '1/(1·3) + 1/(2·4) + 1/(3·5) + 1/(4·6) + … = 3/4',
    explanation: '1/(k(k+2)) = (1/2)(1/k - 1/(k+2)) より、1つ飛ばしで消えずに残る最初の2項 (1/2)(1 + 1/2) = 3/4 に収束します！',
    expected: { kind: 'finite', value: 0.75, display: '3/4' },
    requiredSymbols: [],
    getTerm: (index: number): TermDisplay => {
      const a = formatExpandedInt(index + 1);
      const b = formatExpandedInt(index + 3);
      return frac(index === 0 ? '' : '+', '1', `${a}·${b}`);
    },
    getNumericTerm: (index: number): number => 1 / ((index + 1) * (index + 3))
  },
  {
    id: 'tele-triple',
    category: 'telescoping',
    title: '3連続整数の積の逆数和',
    formulaLatexLike: '1/(1·2·3) + 1/(2·3·4) + 1/(3·4·5) + … = 1/4',
    explanation: '1/(k(k+1)(k+2)) = (1/2)(1/(k(k+1)) - 1/((k+1)(k+2))) に分解すると、最初の 1/(2·1·2) = 1/4 だけが残ります。',
    expected: { kind: 'finite', value: 0.25, display: '1/4' },
    requiredSymbols: [],
    getTerm: (index: number): TermDisplay => {
      const k = index + 1;
      return frac(
        index === 0 ? '' : '+',
        '1',
        `${formatExpandedInt(k)}·${formatExpandedInt(k + 1)}·${formatExpandedInt(k + 2)}`
      );
    },
    getNumericTerm: (index: number): number => 1 / ((index + 1) * (index + 2) * (index + 3))
  },

  // 5. Logarithm (3)
  {
    id: 'log-tele-pos',
    category: 'logarithm',
    title: '対数の無限和 (真数の約分マジック)',
    formulaLatexLike: 'log₂(4/3) + log₂(9/8) + log₂(16/15) + log₂(25/24) + … = 1',
    explanation: 'log₂ の足し算は真数の掛け算！(4/3)×(9/8)×(16/15)×… と斜めに約分されていき、N項で 2N/(N+1) → 2 となるため極限は log₂(2) = 1 です！',
    expected: { kind: 'finite', value: 1, display: '1' },
    requiredSymbols: [],
    getTerm: (index: number): TermDisplay => {
      const k = BigInt(index + 2);
      const num = formatExpandedInt(k * k);
      const den = formatExpandedInt((k - 1n) * (k + 1n));
      return plain(index === 0 ? '' : '+', `log₂(${num}/${den})`);
    },
    getNumericTerm: (index: number): number => {
      const k = index + 2;
      return Math.log2((k * k) / ((k - 1) * (k + 1)));
    }
  },
  {
    id: 'log-tele-neg',
    category: 'logarithm',
    title: '負に収束する対数の無限和',
    formulaLatexLike: 'log₂(3/4) + log₂(8/9) + log₂(15/16) + log₂(24/25) + … = -1',
    explanation: '真数の積 (3/4)×(8/9)×(15/16)×… は (N+1)/(2N) → 1/2 に収束するため、極限は log₂(1/2) = -1 になります。',
    expected: { kind: 'finite', value: -1, display: '-1' },
    requiredSymbols: [],
    getTerm: (index: number): TermDisplay => {
      const k = BigInt(index + 2);
      const num = formatExpandedInt((k - 1n) * (k + 1n));
      const den = formatExpandedInt(k * k);
      return plain(index === 0 ? '' : '+', `log₂(${num}/${den})`);
    },
    getNumericTerm: (index: number): number => {
      const k = index + 2;
      return Math.log2(((k - 1) * (k + 1)) / (k * k));
    }
  },
  {
    id: 'log-tele-div',
    category: 'logarithm',
    title: '対数の無限和の罠！',
    formulaLatexLike: 'log₂(2/1) + log₂(3/2) + log₂(4/3) + log₂(5/4) + … = ∞',
    explanation: '各項は log₂(1 + 1/k) → 0 に近づきますが、N項までの和は log₂((2/1)×(3/2)×…×(N+1)/N) = log₂(N+1) となるため ∞ に発散します！',
    expected: { kind: 'infinity', display: '∞' },
    requiredSymbols: ['∞'],
    getTerm: (index: number): TermDisplay => {
      const k = index + 1;
      return plain(index === 0 ? '' : '+', `log₂(${formatExpandedInt(k + 1)}/${formatExpandedInt(k)})`);
    },
    getNumericTerm: (index: number): number => Math.log2((index + 2) / (index + 1))
  },

  // 6. Radical Rationalization (2)
  {
    id: 'rad-tele-conv',
    category: 'radical',
    title: '分母の有理化で消える級数',
    formulaLatexLike: '1/(1√2+2√1) + 1/(2√3+3√2) + 1/(3√4+4√3) + … = 1',
    explanation: '分母分子に (k+1)√k - k√(k+1) を掛けて有理化すると 1/√k - 1/√(k+1) となり、隣り合う項が打ち消し合って 1 に収束します！',
    expected: { kind: 'finite', value: 1, display: '1' },
    requiredSymbols: [],
    getTerm: (index: number): TermDisplay => {
      const k = formatExpandedInt(index + 1);
      const next = formatExpandedInt(index + 2);
      return frac(index === 0 ? '' : '+', '1', `${k}√${next}+${next}√${k}`);
    },
    getNumericTerm: (index: number): number => {
      const k = index + 1;
      return 1 / (k * Math.sqrt(k + 1) + (k + 1) * Math.sqrt(k));
    }
  },
  {
    id: 'rad-tele-div',
    category: 'radical',
    title: '有理化すると見える発散級数',
    formulaLatexLike: '1/(√1+√2) + 1/(√2+√3) + 1/(√3+√4) + … = ∞',
    explanation: '有理化すると (√2 - √1) + (√3 - √2) + (√4 - √3) + … = √(N+1) - 1 となり、無限大 ∞ へ発散します！',
    expected: { kind: 'infinity', display: '∞' },
    requiredSymbols: ['∞'],
    getTerm: (index: number): TermDisplay => {
      const k = formatExpandedInt(index + 1);
      const next = formatExpandedInt(index + 2);
      return frac(index === 0 ? '' : '+', '1', `√${k}+√${next}`);
    },
    getNumericTerm: (index: number): number => 1 / (Math.sqrt(index + 1) + Math.sqrt(index + 2))
  },

  // 7. Arithmetic × Geometric (3)
  {
    id: 'ag-half',
    category: 'arith-geo',
    title: '等差×等比の無限和 (公比 1/2)',
    formulaLatexLike: '1/2 + 2/4 + 3/8 + 4/16 + 5/32 + … = 2',
    explanation: 'S - (1/2)S を作る定番手法！S/2 = 1/2 + 1/4 + 1/8 + … = 1 となるため、S = 2 が求まります。',
    expected: { kind: 'finite', value: 2, display: '2' },
    requiredSymbols: [],
    getTerm: (index: number): TermDisplay => {
      const n = index + 1;
      return frac(index === 0 ? '' : '+', formatExpandedInt(n), formatExpandedPower(2, n));
    },
    getNumericTerm: (index: number): number => (index + 1) / Math.pow(2, index + 1)
  },
  {
    id: 'ag-third',
    category: 'arith-geo',
    title: '等差×等比の無限和 (公比 1/3)',
    formulaLatexLike: '1/3 + 2/9 + 3/27 + 4/81 + 5/243 + … = 3/4',
    explanation: 'S - (1/3)S = 1/3 + 1/9 + 1/27 + … = 1/2 より、(2/3)S = 1/2 なので S = 3/4 です。',
    expected: { kind: 'finite', value: 0.75, display: '3/4' },
    requiredSymbols: [],
    getTerm: (index: number): TermDisplay => {
      const n = index + 1;
      return frac(index === 0 ? '' : '+', formatExpandedInt(n), formatExpandedPower(3, n));
    },
    getNumericTerm: (index: number): number => (index + 1) / Math.pow(3, index + 1)
  },
  {
    id: 'ag-one',
    category: 'arith-geo',
    title: '等差×等比 (1 + 2/2 + 3/4 + 4/8 + …)',
    formulaLatexLike: '1 + 2/2 + 3/4 + 4/8 + 5/16 + … = 4',
    explanation: 'S - S/2 = 1 + 1/2 + 1/4 + 1/8 + … = 2 より、S = 4 になります！',
    expected: { kind: 'finite', value: 4, display: '4' },
    requiredSymbols: [],
    getTerm: (index: number): TermDisplay => {
      if (index === 0) return plain('', '1');
      return frac('+', formatExpandedInt(index + 1), formatExpandedPower(2, index));
    },
    getNumericTerm: (index: number): number => (index + 1) / Math.pow(2, index)
  },

  // 8. Fibonacci × Geometric (2)
  {
    id: 'fib-half',
    category: 'fibonacci',
    title: 'フィボナッチ数列×等比 (分母 2の系)',
    formulaLatexLike: '1/2 + 1/4 + 2/8 + 3/16 + 5/32 + 8/64 + … = 2',
    explanation: '分子がフィボナッチ数列 (1, 1, 2, 3, 5, 8…)！漸化式 F(n+2)=F(n+1)+F(n) より S = 1/2 + 1/4 + S/2 + S/4 を解くと S = 2 になります！',
    expected: { kind: 'finite', value: 2, display: '2' },
    requiredSymbols: [],
    getTerm: (index: number): TermDisplay => {
      const n = index + 1;
      return frac(index === 0 ? '' : '+', formatFibonacci(n), formatExpandedPower(2, n));
    },
    getNumericTerm: (index: number): number => {
      const n = index + 1;
      return (Math.pow(PHI / 2, n) - Math.pow(PSI / 2, n)) / SQRT5;
    }
  },
  {
    id: 'fib-third',
    category: 'fibonacci',
    title: 'フィボナッチ数列×等比 (分母 3の系)',
    formulaLatexLike: '1/3 + 1/9 + 2/27 + 3/81 + 5/243 + … = 3/5',
    explanation: 'S = 1/3 + 1/9 + S/3 + (S - 1/3 - …) の関係、すなわち S = (1/3) / (1 - 1/3 - 1/9) = 3/5 に収束します！',
    expected: { kind: 'finite', value: 0.6, display: '3/5' },
    requiredSymbols: [],
    getTerm: (index: number): TermDisplay => {
      const n = index + 1;
      return frac(index === 0 ? '' : '+', formatFibonacci(n), formatExpandedPower(3, n));
    },
    getNumericTerm: (index: number): number => {
      const n = index + 1;
      return (Math.pow(PHI / 3, n) - Math.pow(PSI / 3, n)) / SQRT5;
    }
  },

  // 9. Factorial & Napier e (3)
  {
    id: 'fac-tele',
    category: 'factorial',
    title: '階乗の部分分数分解 (k / (k+1)!)',
    formulaLatexLike: '1/2! + 2/3! + 3/4! + 4/5! + … = 1',
    explanation: 'k/(k+1)! = ((k+1) - 1)/(k+1)! = 1/k! - 1/(k+1)! と分解できるため、すべて打ち消し合って 1/1! = 1 に収束します！',
    expected: { kind: 'finite', value: 1, display: '1' },
    requiredSymbols: [],
    getTerm: (index: number): TermDisplay => {
      const k = index + 1;
      return frac(index === 0 ? '' : '+', formatExpandedInt(k), `${formatExpandedInt(k + 1)}!`);
    },
    getNumericTerm: (index: number): number => {
      const k = index + 1;
      return k / factorial(k + 1);
    }
  },
  {
    id: 'fac-e',
    category: 'factorial',
    title: 'ネイピア数 e の無限級数',
    formulaLatexLike: '1 + 1/1! + 1/2! + 1/3! + 1/4! + … = e',
    explanation: '高校数IIIでおなじみ、自然対数の底 e (≈ 2.71828) を表す階乗の逆数和です。',
    expected: { kind: 'finite', value: Math.E, display: 'e' },
    requiredSymbols: ['e'],
    getTerm: (index: number): TermDisplay => {
      if (index === 0) return plain('', '1');
      return frac('+', '1', `${formatExpandedInt(index)}!`);
    },
    getNumericTerm: (index: number): number => 1 / factorial(index)
  },
  {
    id: 'fac-e-minus-1',
    category: 'factorial',
    title: '1抜きの階乗逆数和',
    formulaLatexLike: '1/1! + 1/2! + 1/3! + 1/4! + … = e-1',
    explanation: '1 + 1/1! + 1/2! + … = e から最初の 1 を引いた級数なので、極限は e - 1 になります。',
    expected: { kind: 'finite', value: Math.E - 1, display: 'e-1' },
    requiredSymbols: ['e'],
    getTerm: (index: number): TermDisplay =>
      frac(index === 0 ? '' : '+', '1', `${formatExpandedInt(index + 1)}!`),
    getNumericTerm: (index: number): number => 1 / factorial(index + 1)
  },

  // 10. Famous Limits (2)
  {
    id: 'famous-ln2',
    category: 'famous',
    title: '交代調和級数 (メルカトル級数)',
    formulaLatexLike: '1 - 1/2 + 1/3 - 1/4 + 1/5 - … = ln2',
    explanation: '0から1までの 1/(1+x) の定積分や区分求積でも登場する名作！調和級数を交互に引くと ln2 に収束します。',
    expected: { kind: 'finite', value: Math.LN2, display: 'ln2' },
    requiredSymbols: ['ln2'],
    getTerm: (index: number): TermDisplay => {
      if (index === 0) return plain('', '1');
      return frac(index % 2 === 1 ? '-' : '+', '1', formatExpandedInt(index + 1));
    },
    getNumericTerm: (index: number): number => (index % 2 === 0 ? 1 : -1) / (index + 1)
  },
  {
    id: 'famous-leibniz',
    category: 'famous',
    title: 'ライプニッツの公式',
    formulaLatexLike: '1 - 1/3 + 1/5 - 1/7 + 1/9 - … = π/4',
    explanation: '0から1までの 1/(1+x·x) の定積分が π/4 になることから導かれる円周率級数。奇数の逆数を交互に足し引きすると π/4 に収束します。',
    expected: { kind: 'finite', value: Math.PI / 4, display: 'π/4' },
    requiredSymbols: ['π'],
    getTerm: (index: number): TermDisplay => {
      if (index === 0) return plain('', '1');
      return frac(index % 2 === 1 ? '-' : '+', '1', formatExpandedInt(2 * index + 1));
    },
    getNumericTerm: (index: number): number => (index % 2 === 0 ? 1 : -1) / (2 * index + 1)
  },

  // 11. Divergent Traps (4)
  {
    id: 'div-harmonic',
    category: 'divergent',
    title: '調和級数の罠！',
    formulaLatexLike: '1 + 1/2 + 1/3 + 1/4 + 1/5 + … = ∞',
    explanation: '各項が0に近づいても和は収束しません！2の累乗個ずつまとめると 1/2 以上が無限に現れるため ∞ に発散します。',
    expected: { kind: 'infinity', display: '∞' },
    requiredSymbols: ['∞'],
    getTerm: (index: number): TermDisplay => {
      if (index === 0) return plain('', '1');
      return frac('+', '1', formatExpandedInt(index + 1));
    },
    getNumericTerm: (index: number): number => 1 / (index + 1)
  },
  {
    id: 'div-even-recip',
    category: 'divergent',
    title: '偶数の逆数和 (2の累乗と錯覚注意！)',
    formulaLatexLike: '1/2 + 1/4 + 1/6 + 1/8 + 1/10 + … = ∞',
    explanation: '最初は 1/2, 1/4 に見えますが次は 1/6, 1/8…！調和級数の半分なので ∞ に発散します。',
    expected: { kind: 'infinity', display: '∞' },
    requiredSymbols: ['∞'],
    getTerm: (index: number): TermDisplay =>
      frac(index === 0 ? '' : '+', '1', formatExpandedInt(2 * (index + 1))),
    getNumericTerm: (index: number): number => 1 / (2 * (index + 1))
  },
  {
    id: 'div-p-half',
    category: 'divergent',
    title: '平方根の逆数和 (1/√k)',
    formulaLatexLike: '1/√1 + 1/√2 + 1/√3 + 1/√4 + … = ∞',
    explanation: '1/k より常に大きい正の項を無限に足しているため、調和級数との比較判定法から ∞ に発散します。',
    expected: { kind: 'infinity', display: '∞' },
    requiredSymbols: ['∞'],
    getTerm: (index: number): TermDisplay =>
      frac(index === 0 ? '' : '+', '1', `√${formatExpandedInt(index + 1)}`),
    getNumericTerm: (index: number): number => 1 / Math.sqrt(index + 1)
  },
  {
    id: 'div-primes',
    category: 'divergent',
    title: '素数の逆数和 (オイラーの定理)',
    formulaLatexLike: '1/2 + 1/3 + 1/5 + 1/7 + 1/11 + … = ∞',
    explanation: 'とてもゆっくり増加しますが、素数の逆数和も ∞ に発散することが証明されています！',
    expected: { kind: 'infinity', display: '∞' },
    requiredSymbols: ['∞'],
    getTerm: (index: number): TermDisplay => {
      const sign: '+' | '' = index === 0 ? '' : '+';
      if (index < PRIMES.length) {
        return frac(sign, '1', String(PRIMES[index]));
      }
      const approxPrime = Math.round((index + 1) * Math.log(index + 2));
      return frac(sign, '1', `約${formatExpandedInt(approxPrime)}`);
    },
    getNumericTerm: (index: number): number => {
      if (index < PRIMES.length) return 1 / PRIMES[index];
      return 1 / ((index + 1) * Math.log(index + 2));
    }
  }
];

const PROCEDURAL_GEO_RATIOS: Array<[number, number]> = [
  [1, 2],
  [1, 3],
  [2, 3],
  [1, 4],
  [3, 4],
  [1, 5],
  [-1, 2],
  [-1, 3],
  [-1, 4]
];

export function generateHighSchoolSeriesProblem(seed?: number): SeriesProblem {
  let step = 0;
  const rand = (): number => {
    step += 1;
    if (seed !== undefined) {
      const x = Math.sin(seed * 9301 + step * 49297) * 233280;
      return Math.abs(x - Math.floor(x));
    }
    return Math.random();
  };

  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
  const idSuffix = seed !== undefined ? String(seed) : `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const family = pick<'mixed-geo' | 'telescoping' | 'trig' | 'arith-geo' | 'geometric'>([
    'mixed-geo',
    'telescoping',
    'trig',
    'arith-geo',
    'geometric'
  ]);

  if (family === 'mixed-geo') {
    const pairs: Array<[number, number]> = [
      [2, 3],
      [2, 4],
      [3, 4],
      [2, 5],
      [3, 5]
    ];
    const [aDen, bDen] = pick(pairs);
    const aNum = pick([1, 2, 3]);
    const bNum = pick([1, 2, 3]);
    const bSign = pick<1 | -1>([1, -1]);
    return makeMixedGeoProblem({
      id: `proc-mix-${aNum}-${aDen}-${bNum}-${bDen}-${bSign}-${idSuffix}`,
      title: `2系統ミックス等比 (1/${aDen}系 & 1/${bDen}系)`,
      aNum,
      aDen,
      bNum,
      bDen,
      bSign
    });
  }

  if (family === 'telescoping') {
    const d = pick<1 | 2>([1, 2]);
    const start = pick([1, 2, 3]);
    const c = pick([1, 2, 3]);

    if (d === 1) {
      const expected = reduceRationalDisplay(c, start);
      const previewParts = [0, 1, 2, 3].map((i) => `${c}/${(start + i) * (start + i + 1)}`);
      return {
        id: `proc-tele1-${c}-${start}-${idSuffix}`,
        category: 'telescoping',
        title: `部分分数分解 (開始 k=${start})`,
        formulaLatexLike: `${previewParts.join(' + ')} + … = ${expected.display}`,
        explanation: `${c}/(k(k+1)) = ${c}(1/k - 1/(k+1)) に分解すると、最初の項 ${c}/${start} = ${expected.display} に収束します。`,
        expected: { kind: 'finite', value: expected.value, display: expected.display },
        requiredSymbols: [],
        getTerm: (index: number): TermDisplay => {
          const k = BigInt(start + index);
          return frac(index === 0 ? '' : '+', String(c), formatExpandedInt(k * (k + 1n)));
        },
        getNumericTerm: (index: number): number => c / ((start + index) * (start + index + 1))
      };
    }

    const expected = reduceRationalDisplay(c * (2 * start + 1), 2 * start * (start + 1));
    const previewParts = [0, 1, 2].map((i) => `${c}/(${start + i}·${start + i + 2})`);
    return {
      id: `proc-tele2-${c}-${start}-${idSuffix}`,
      category: 'telescoping',
      title: `2つ飛ばしの部分分数分解 (開始 k=${start})`,
      formulaLatexLike: `${previewParts.join(' + ')} + … = ${expected.display}`,
      explanation: `${c}/(k(k+2)) = (${c}/2)(1/k - 1/(k+2)) より、(${c}/2)(1/${start} + 1/${start + 1}) = ${expected.display} に収束します。`,
      expected: { kind: 'finite', value: expected.value, display: expected.display },
      requiredSymbols: [],
      getTerm: (index: number): TermDisplay => {
        const a = formatExpandedInt(start + index);
        const b = formatExpandedInt(start + index + 2);
        return frac(index === 0 ? '' : '+', String(c), `${a}·${b}`);
      },
      getNumericTerm: (index: number): number => c / ((start + index) * (start + index + 2))
    };
  }

  if (family === 'trig') {
    const variant = pick<'cos' | 'sin'>(['cos', 'sin']);
    const q = pick([2, 3]);
    const a = pick([1, 2, 3]);
    if (variant === 'cos') {
      return makeTrigSeriesProblem({
        id: `proc-trig-cos-${a}-${q}-${idSuffix}`,
        title: `三角関数×等比 (${a === 1 ? '' : a}cos(kπ/2) / ${q}の系)`,
        fn: 'cos',
        a,
        angleStepNum: 1,
        angleStepDen: 2,
        angleOffsetNum: 0,
        q,
        startPower: 0,
        expectedNum: a * q * q,
        expectedDen: q * q + 1,
        explanation: `cos(kπ/2) は 1, 0, -1, 0… を周期4で繰り返すため、公比 -1/${q * q} の等比級数になり ${reduceRationalDisplay(a * q * q, q * q + 1).display} に収束します。`
      });
    }
    return makeTrigSeriesProblem({
      id: `proc-trig-sin-${a}-${q}-${idSuffix}`,
      title: `三角関数×等比 (${a === 1 ? '' : a}sin((2k+1)π/2) / ${q}の系)`,
      fn: 'sin',
      a,
      angleStepNum: 2,
      angleStepDen: 2,
      angleOffsetNum: 1,
      q,
      startPower: 0,
      expectedNum: a * q,
      expectedDen: q + 1,
      explanation: `sin((2k+1)π/2) は 1, -1, 1, -1… となるため、公比 -1/${q} の等比級数になり ${reduceRationalDisplay(a * q, q + 1).display} に収束します。`
    });
  }

  if (family === 'arith-geo') {
    const q = pick([2, 3, 4]);
    const c = pick([1, 2]);
    const expected = reduceRationalDisplay(c * q, (q - 1) * (q - 1));
    const preview = [1, 2, 3, 4].map((k) => `${c * k}/${Math.pow(q, k)}`).join(' + ');
    return {
      id: `proc-ag-${c}-${q}-${idSuffix}`,
      category: 'arith-geo',
      title: `等差×等比の級数 (公比 1/${q})`,
      formulaLatexLike: `${preview} + … = ${expected.display}`,
      explanation: `S - (1/${q})S を作ると公比 1/${q} の等比級数に帰着し、極限は ${expected.display} になります。`,
      expected: { kind: 'finite', value: expected.value, display: expected.display },
      requiredSymbols: [],
      getTerm: (index: number): TermDisplay => {
        const n = index + 1;
        return frac(index === 0 ? '' : '+', formatExpandedInt(c * n), formatExpandedPower(q, n));
      },
      getNumericTerm: (index: number): number => (c * (index + 1)) / Math.pow(q, index + 1)
    };
  }

  // Geometric
  const [rNum, rDen] = pick(PROCEDURAL_GEO_RATIOS);
  const aNum = pick([1, 2, 3, 4]);
  const rText = rNum < 0 ? `(${rNum}/${rDen})` : `${rNum}/${rDen}`;
  const expected = reduceRationalDisplay(aNum * rDen, rDen - rNum);
  const previewParts: string[] = [];
  for (let i = 0; i < 4; i += 1) {
    const signNeg = rNum < 0 && i % 2 === 1;
    const prefix = i === 0 ? '' : signNeg ? ' - ' : ' + ';
    const nv = aNum * Math.pow(Math.abs(rNum), i);
    const dv = Math.pow(rDen, i);
    const g = gcd(nv, dv);
    previewParts.push(`${prefix}${dv / g === 1 ? nv / g : `${nv / g}/${dv / g}`}`);
  }
  return makeGeometricProblem({
    id: `proc-geo-${aNum}-${rNum}-${rDen}-${idSuffix}`,
    title: `無限等比級数 (初項 ${aNum}, 公比 ${rText})`,
    formulaLatexLike: `${previewParts.join('')} + … = ${expected.display}`,
    explanation: `初項 ${aNum}、公比 ${rText} の無限等比級数。a/(1-r) = ${expected.display} に収束します。`,
    aNum,
    rNum,
    rDen
  });
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const ALL_CATEGORIES: SeriesCategory[] = [
  'geometric',
  'mixed-geo',
  'trig',
  'telescoping',
  'logarithm',
  'radical',
  'arith-geo',
  'fibonacci',
  'factorial',
  'famous',
  'divergent'
];

function pickOneFromCategory(category: SeriesCategory, allowProcedural: boolean): SeriesProblem {
  const curated = ALL_SERIES.filter((p) => p.category === category);
  if (allowProcedural && Math.random() < 0.3) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = generateHighSchoolSeriesProblem();
      if (candidate.category === category) return candidate;
    }
  }
  return curated[Math.floor(Math.random() * curated.length)];
}

export function buildSessionProblems(mode: GameMode, isFirstPlay = false): SeriesProblem[] {
  if (mode === 'standard') {
    if (isFirstPlay) {
      const first = ALL_SERIES.find((p) => p.id === 'geo-half') ?? ALL_SERIES[0];
      const otherCategories = shuffle(ALL_CATEGORIES.filter((c) => c !== 'geometric')).slice(0, 4);
      const rest = otherCategories.map((cat) => pickOneFromCategory(cat, false));
      return [first, ...rest];
    }

    const pickedCategories = shuffle(ALL_CATEGORIES).slice(0, 5);
    return pickedCategories.map((cat) => pickOneFromCategory(cat, true));
  }

  // Endless mode: rotate across all categories with zero adjacent category repeats
  const cats = shuffle(ALL_CATEGORIES);
  return cats.map((cat, idx) => pickOneFromCategory(cat, idx >= 5));
}

export function pickNextEndlessProblem(
  lastCategory: SeriesCategory | null,
  recentIds: Set<string>
): SeriesProblem {
  const candidateCats = shuffle(ALL_CATEGORIES.filter((c) => c !== lastCategory));
  for (const cat of candidateCats) {
    if (Math.random() < 0.35) {
      const proc = generateHighSchoolSeriesProblem();
      if (proc.category !== lastCategory) return proc;
    }
    const fresh = ALL_SERIES.filter((p) => p.category === cat && !recentIds.has(p.id));
    if (fresh.length > 0) {
      return fresh[Math.floor(Math.random() * fresh.length)];
    }
  }

  const proc = generateHighSchoolSeriesProblem();
  return proc;
}
