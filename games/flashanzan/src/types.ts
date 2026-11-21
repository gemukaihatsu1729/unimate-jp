export type GameMode = 'standard' | 'endless';

export type SeriesCategory =
  | 'geometric'
  | 'mixed-geo'
  | 'trig'
  | 'telescoping'
  | 'logarithm'
  | 'radical'
  | 'arith-geo'
  | 'fibonacci'
  | 'factorial'
  | 'famous'
  | 'divergent';

export type MathSymbol = 'π' | 'e' | 'ln2' | '√' | '∞';

export interface TermDisplay {
  sign: '+' | '-' | '';
  kind: 'plain' | 'fraction';
  text?: string;
  numerator?: string;
  denominator?: string;
}

export type ExpectedAnswer =
  | {
      kind: 'finite';
      value: number;
      display: string;
      acceptedNotes?: string;
    }
  | {
      kind: 'infinity';
      display: '∞';
    };

export interface SeriesProblem {
  id: string;
  category: SeriesCategory;
  title: string;
  formulaLatexLike: string;
  explanation: string;
  expected: ExpectedAnswer;
  requiredSymbols: MathSymbol[];
  getTerm: (index: number) => TermDisplay;
  getNumericTerm: (index: number) => number;
}

export interface QuestionResult {
  problem: SeriesProblem;
  userInput: string;
  correct: boolean;
  pointsEarned: number;
  basePoints: number;
  speedBonus: number;
  comboMultiplier: number;
  answerTimeMs: number;
  usedReplay: boolean;
}

export interface RankInfo {
  grade: string;
  title: string;
  badgeColor: string;
}

export interface ModeStats {
  bestScore: number;
  bestGrade: string;
  plays: number;
}

export interface StoredProgress {
  modes: Record<GameMode, ModeStats>;
  highestGrade: string;
  discoveredSeriesIds: string[];
}

export type GamePhase =
  | 'title'
  | 'countdown'
  | 'flashing'
  | 'answering'
  | 'feedback'
  | 'result';
