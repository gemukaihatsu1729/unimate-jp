import type { ExpectedAnswer } from '../types';

export type ParseResult =
  | { ok: true; kind: 'infinity' }
  | { ok: true; kind: 'finite'; value: number }
  | { ok: false; error: string };

export interface AnswerCheckResult {
  valid: boolean;
  correct: boolean;
  parsedKind?: 'finite' | 'infinity';
  parsedValue?: number;
  error?: string;
}

type Token =
  | { type: 'NUMBER'; value: number }
  | { type: 'CONST'; value: number; name: string }
  | { type: 'OP'; op: '+' | '-' | '*' | '/' | '^' }
  | { type: 'SQRT' }
  | { type: 'SQ' }
  | { type: 'LPAREN' }
  | { type: 'RPAREN' };

const FULLWIDTH_MAP: Record<string, string> = {
  '０': '0',
  '１': '1',
  '２': '2',
  '３': '3',
  '４': '4',
  '５': '5',
  '６': '6',
  '７': '7',
  '８': '8',
  '９': '9',
  '．': '.',
  '。': '.',
  '／': '/',
  '÷': '/',
  '＋': '+',
  '－': '-',
  '−': '-',
  'ー': '-',
  '‐': '-',
  '＊': '*',
  '×': '*',
  '（': '(',
  '）': ')',
  '＾': '^'
};

export function normalizeAnswerInput(raw: string): string {
  let out = '';
  for (const ch of raw.trim()) {
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '　') {
      continue;
    }
    out += FULLWIDTH_MAP[ch] ?? ch;
  }

  // Normalize text aliases (case-insensitive)
  out = out
    .replace(/発散/g, '∞')
    .replace(/infinity/gi, '∞')
    .replace(/inf/gi, '∞')
    .replace(/sqrt/gi, '√')
    .replace(/ln\s*\(\s*2\s*\)/gi, 'ln2')
    .replace(/log\s*\(\s*2\s*\)/gi, 'ln2')
    .replace(/log2/gi, 'ln2')
    .replace(/ln2/gi, 'ln2')
    .replace(/pi/gi, 'π')
    .replace(/E/g, 'e');

  return out;
}

function tokenize(expr: string): { ok: true; tokens: Token[] } | { ok: false; error: string } {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expr.length) {
    const ch = expr[i];

    if (ch >= '0' && ch <= '9' || ch === '.') {
      const start = i;
      let dotCount = 0;
      while (i < expr.length && ((expr[i] >= '0' && expr[i] <= '9') || expr[i] === '.')) {
        if (expr[i] === '.') {
          dotCount += 1;
        }
        i += 1;
      }
      const numStr = expr.slice(start, i);
      if (dotCount > 1 || numStr === '.') {
        return { ok: false, error: '数値の形式が正しくありません' };
      }
      const value = Number(numStr);
      if (!Number.isFinite(value)) {
        return { ok: false, error: '数値が大きすぎます' };
      }
      tokens.push({ type: 'NUMBER', value });
      continue;
    }

    if (expr.startsWith('ln2', i)) {
      tokens.push({ type: 'CONST', value: Math.LN2, name: 'ln2' });
      i += 3;
      continue;
    }

    if (ch === 'π') {
      tokens.push({ type: 'CONST', value: Math.PI, name: 'π' });
      i += 1;
      continue;
    }

    if (ch === 'e') {
      tokens.push({ type: 'CONST', value: Math.E, name: 'e' });
      i += 1;
      continue;
    }

    if (ch === '√') {
      tokens.push({ type: 'SQRT' });
      i += 1;
      continue;
    }

    if (ch === '²') {
      tokens.push({ type: 'SQ' });
      i += 1;
      continue;
    }

    if (ch === '(') {
      tokens.push({ type: 'LPAREN' });
      i += 1;
      continue;
    }

    if (ch === ')') {
      tokens.push({ type: 'RPAREN' });
      i += 1;
      continue;
    }

    if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '^') {
      tokens.push({ type: 'OP', op: ch });
      i += 1;
      continue;
    }

    return { ok: false, error: `使用できない文字「${ch}」が含まれています` };
  }

  return { ok: true, tokens };
}

class Parser {
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): number {
    const val = this.parseExpr();
    if (this.pos < this.tokens.length) {
      throw new Error('式の終わり方が正しくありません');
    }
    if (!Number.isFinite(val)) {
      throw new Error('計算結果が有限の値になりません');
    }
    return val;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consume(): Token {
    const t = this.tokens[this.pos];
    this.pos += 1;
    return t;
  }

  private canStartImplicitFactor(t: Token | undefined): boolean {
    if (!t) return false;
    return (
      t.type === 'NUMBER' ||
      t.type === 'CONST' ||
      t.type === 'SQRT' ||
      t.type === 'LPAREN'
    );
  }

  private parseExpr(): number {
    let left = this.parseTerm();
    while (true) {
      const t = this.peek();
      if (t?.type === 'OP' && (t.op === '+' || t.op === '-')) {
        this.consume();
        const right = this.parseTerm();
        left = t.op === '+' ? left + right : left - right;
      } else {
        break;
      }
    }
    return left;
  }

  private parseTerm(): number {
    let left = this.parseUnary();
    while (true) {
      const t = this.peek();
      if (t?.type === 'OP' && (t.op === '*' || t.op === '/')) {
        this.consume();
        const right = this.parseUnary();
        if (t.op === '/') {
          if (Math.abs(right) < 1e-15) {
            throw new Error('0で割ることはできません');
          }
          left = left / right;
        } else {
          left = left * right;
        }
      } else if (this.canStartImplicitFactor(t)) {
        const right = this.parseUnary();
        left = left * right;
      } else {
        break;
      }
    }
    return left;
  }

  private parseUnary(): number {
    const t = this.peek();
    if (t?.type === 'OP' && (t.op === '+' || t.op === '-')) {
      this.consume();
      const val = this.parseUnary();
      return t.op === '-' ? -val : val;
    }
    return this.parsePower();
  }

  private parsePower(): number {
    let base = this.parsePrimary();
    while (true) {
      const t = this.peek();
      if (t?.type === 'SQ') {
        this.consume();
        base = base * base;
      } else if (t?.type === 'OP' && t.op === '^') {
        this.consume();
        const exp = this.parseUnary();
        const result = Math.pow(base, exp);
        if (!Number.isFinite(result)) {
          throw new Error('累乗の値が無効です');
        }
        base = result;
      } else {
        break;
      }
    }
    return base;
  }

  private parsePrimary(): number {
    const t = this.peek();
    if (!t) {
      throw new Error('式が途中で終わっています');
    }

    if (t.type === 'SQRT') {
      this.consume();
      const inner = this.parseUnary();
      if (inner < 0) {
        throw new Error('負の数の平方根は入力できません');
      }
      return Math.sqrt(inner);
    }

    if (t.type === 'NUMBER') {
      this.consume();
      return t.value;
    }

    if (t.type === 'CONST') {
      this.consume();
      return t.value;
    }

    if (t.type === 'LPAREN') {
      this.consume();
      const val = this.parseExpr();
      const close = this.peek();
      if (close?.type !== 'RPAREN') {
        throw new Error('カッコが閉じられていません');
      }
      this.consume();
      return val;
    }

    throw new Error('式を解釈できませんでした');
  }
}

export function parseAnswerExpression(raw: string): ParseResult {
  const normalized = normalizeAnswerInput(raw);
  if (!normalized) {
    return { ok: false, error: '答えを入力してください' };
  }

  if (normalized === '∞' || normalized === '+∞') {
    return { ok: true, kind: 'infinity' };
  }

  if (normalized.includes('∞')) {
    return { ok: false, error: '発散する場合は「∞」のみを入力してください' };
  }

  const tokenized = tokenize(normalized);
  if (!tokenized.ok) {
    return { ok: false, error: tokenized.error };
  }

  try {
    const parser = new Parser(tokenized.tokens);
    const value = parser.parse();
    return { ok: true, kind: 'finite', value };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : '式を解釈できませんでした'
    };
  }
}

export function checkAnswer(input: string, expected: ExpectedAnswer): AnswerCheckResult {
  const parsed = parseAnswerExpression(input);
  if (!parsed.ok) {
    return {
      valid: false,
      correct: false,
      error: parsed.error
    };
  }

  if (expected.kind === 'infinity') {
    return {
      valid: true,
      correct: parsed.kind === 'infinity',
      parsedKind: parsed.kind,
      parsedValue: parsed.kind === 'finite' ? parsed.value : undefined
    };
  }

  if (parsed.kind === 'infinity') {
    return {
      valid: true,
      correct: false,
      parsedKind: 'infinity'
    };
  }

  const correct = Math.abs(parsed.value - expected.value) <= 1e-9;
  return {
    valid: true,
    correct,
    parsedKind: 'finite',
    parsedValue: parsed.value
  };
}
