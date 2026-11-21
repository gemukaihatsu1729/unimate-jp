import type { GameMode, GamePhase, MathSymbol, QuestionResult, SeriesProblem } from '../types';
import { AudioManager } from './AudioManager';
import { checkAnswer, parseAnswerExpression } from './answerParser';
import { FlashEngine, type FlashTickPayload } from './FlashEngine';
import { buildLineShareUrl, buildShareText, buildXShareUrl, getGameShareUrl } from './ResultShare';
import {
  calculateQuestionScore,
  getRankForScore,
  ScoreManager
} from './ScoreManager';
import {
  ALL_SERIES,
  buildSessionProblems,
  CATEGORY_LABELS,
  pickNextEndlessProblem
} from './seriesBank';
import { createConvergenceChartSvg } from '../ui/ConvergenceChart';
import { renderTermInto } from '../ui/TermRenderer';

const MODE_NAMES: Record<GameMode, string> = {
  standard: '5問チャレンジ',
  endless: '∞ エンドレスサバイバル'
};

export class GameController {
  private readonly audio = new AudioManager();
  private readonly flashEngine = new FlashEngine();
  private readonly scoreManager = new ScoreManager();

  private phase: GamePhase = 'title';
  private mode: GameMode = 'standard';
  private problems: SeriesProblem[] = [];
  private questionIndex = 0;
  private results: QuestionResult[] = [];
  private recentEndlessIds = new Set<string>();

  private totalScore = 0;
  private combo = 0;
  private maxCombo = 0;
  private earlyCount = 0;
  private lives = 3;

  private inputString = '';
  private answeredEarly = false;
  private usedReplay = false;
  private answerOpenedAtMs = 0;
  private lastBeepStep = -1;

  private countdownTimerId: number | null = null;
  private demoTimerId: number | null = null;
  private demoStep = 0;

  // Cached DOM references
  private readonly titleScreen = this.req('title-screen');
  private readonly gameScreen = this.req('game-screen');
  private readonly resultScreen = this.req('result-screen');
  private readonly codexModal = this.req('codex-modal');
  private readonly feedbackModal = this.req('feedback-modal');

  private readonly demoTermEl = this.req('demo-term');
  private readonly demoSpeedEl = this.req('demo-speed');
  private readonly codexCountEl = this.req('codex-count');
  private readonly codexListEl = this.req('codex-list');

  private readonly btnTitleMute = this.req('btn-title-mute');
  private readonly btnGameMute = this.req('btn-game-mute');

  private readonly hudProgress = this.req('hud-progress');
  private readonly hudCombo = this.req('hud-combo');
  private readonly hudScore = this.req('hud-score');

  private readonly flashMonitor = this.req('flash-monitor');
  private readonly monitorTermCount = this.req('monitor-term-count');
  private readonly monitorSpeedBadge = this.req('monitor-speed-badge');
  private readonly monitorInfinityNote = this.req('monitor-infinity-note');
  private readonly countdownDisplay = this.req('countdown-display');
  private readonly termDisplay = this.req('term-display');

  private readonly preAnswerBar = this.req('pre-answer-bar');
  private readonly flashHint = this.req('flash-hint');
  private readonly btnEarlyAnswer = this.req('btn-early-answer') as HTMLButtonElement;

  private readonly answerConsole = this.req('answer-console');
  private readonly answerDisplay = this.req('answer-display');
  private readonly answerPreview = this.req('answer-preview');
  private readonly answerError = this.req('answer-error');
  private readonly symbolStrip = this.req('symbol-strip');

  private readonly fbStatusBadge = this.req('fb-status-badge');
  private readonly fbTitle = this.req('fb-title');
  private readonly fbFormula = this.req('fb-formula');
  private readonly fbYourAnswer = this.req('fb-your-answer');
  private readonly fbCorrectAnswer = this.req('fb-correct-answer');
  private readonly fbChartContainer = this.req('fb-chart-container');
  private readonly fbExplanation = this.req('fb-explanation');
  private readonly fbPointsRow = this.req('fb-points-row');
  private readonly btnNextQuestion = this.req('btn-next-question');

  private readonly resModeLabel = this.req('res-mode-label');
  private readonly resRankGrade = this.req('res-rank-grade');
  private readonly resRankTitle = this.req('res-rank-title');
  private readonly resScore = this.req('res-score');
  private readonly resNewRecord = this.req('res-new-record');
  private readonly resAccuracy = this.req('res-accuracy');
  private readonly resMaxCombo = this.req('res-max-combo');
  private readonly resEarlyCount = this.req('res-early-count');
  private readonly resHistoryList = this.req('res-history-list');
  private readonly shareFeedback = this.req('share-feedback');

  init(): void {
    this.bindEvents();
    this.syncMuteButtons();
    this.refreshTitleStats();
    this.showScreen('title');
    this.startTitleDemo();
  }

  private req(id: string): HTMLElement {
    const el = document.getElementById(id);
    if (!el) {
      throw new Error(`Missing required element #${id}`);
    }
    return el;
  }

  private bindEvents(): void {
    const unlockOnce = (): void => {
      this.audio.unlock();
    };
    window.addEventListener('pointerdown', unlockOnce, { passive: true });

    // Mode selection buttons
    document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode as GameMode | undefined;
        if (!mode) return;
        this.audio.unlock();
        this.audio.playKeyTap();
        this.startRun(mode);
      });
    });

    // Mute buttons
    const handleMute = (): void => {
      this.audio.unlock();
      this.audio.toggleMute();
      this.syncMuteButtons();
    };
    this.btnTitleMute.addEventListener('click', handleMute);
    this.btnGameMute.addEventListener('click', handleMute);

    // Codex modal
    this.req('btn-open-codex').addEventListener('click', () => {
      this.audio.playKeyTap();
      this.renderCodex();
      this.codexModal.classList.add('active');
      this.codexModal.setAttribute('aria-hidden', 'false');
    });
    this.req('btn-close-codex').addEventListener('click', () => {
      this.audio.playKeyTap();
      this.codexModal.classList.remove('active');
      this.codexModal.setAttribute('aria-hidden', 'true');
    });

    // Quit game back to title
    this.req('btn-quit-game').addEventListener('click', () => {
      this.audio.playKeyTap();
      this.abortToTitle();
    });

    // Early answer button
    this.btnEarlyAnswer.addEventListener('click', () => {
      if (this.phase !== 'flashing') return;
      this.audio.playKeyTap();
      this.answeredEarly = true;
      this.enterAnsweringPhase();
    });

    // Clear & Replay buttons
    this.req('btn-clear-input').addEventListener('click', () => {
      this.audio.playKeyTap();
      this.inputString = '';
      this.updateInputUi();
    });

    this.req('btn-replay').addEventListener('click', () => {
      if (this.phase !== 'answering') return;
      this.audio.playKeyTap();
      this.usedReplay = true;
      this.lastBeepStep = -1;
      this.flashEngine.restartFromBeginning(true);
    });

    // Numpad delegation
    this.req('numpad-grid').addEventListener('click', (ev) => {
      if (this.phase !== 'answering') return;
      const target = (ev.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!target) return;

      const key = target.dataset.key;
      const action = target.dataset.action;

      if (key) {
        this.audio.playKeyTap();
        this.appendInput(key);
      } else if (action === 'backspace') {
        this.audio.playKeyTap();
        this.backspaceInput();
      } else if (action === 'submit') {
        this.submitCurrentAnswer();
      }
    });

    // Symbol strip delegation
    this.symbolStrip.addEventListener('click', (ev) => {
      if (this.phase !== 'answering') return;
      const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-sym]');
      if (!btn) return;
      const sym = btn.dataset.sym;
      if (!sym) return;
      this.audio.playKeyTap();
      if (sym === '∞') {
        this.inputString = '∞';
        this.updateInputUi();
      } else {
        this.appendInput(sym);
      }
    });

    // Feedback next button
    this.btnNextQuestion.addEventListener('click', () => {
      if (this.phase !== 'feedback') return;
      this.audio.playKeyTap();
      this.advanceFromFeedback();
    });

    // Result screen actions
    this.req('btn-retry').addEventListener('click', () => {
      this.audio.playKeyTap();
      this.startRun(this.mode);
    });
    this.req('btn-back-title').addEventListener('click', () => {
      this.audio.playKeyTap();
      this.abortToTitle();
    });

    // Share actions
    this.req('btn-share-x').addEventListener('click', () => {
      const text = this.buildCurrentShareText();
      const url = getGameShareUrl();
      window.open(buildXShareUrl(text, url), '_blank', 'noopener,noreferrer');
    });
    this.req('btn-share-line').addEventListener('click', () => {
      const text = this.buildCurrentShareText();
      const url = getGameShareUrl();
      window.open(buildLineShareUrl(text, url), '_blank', 'noopener,noreferrer');
    });
    this.req('btn-share-copy').addEventListener('click', () => {
      void this.handleNativeOrCopyShare();
    });

    // Desktop keyboard support
    window.addEventListener('keydown', (ev) => this.handleKeyDown(ev));
  }

  private handleKeyDown(ev: KeyboardEvent): void {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;

    if (this.phase === 'flashing') {
      if (ev.key === ' ' || ev.key === 'Enter') {
        if (!this.btnEarlyAnswer.disabled) {
          ev.preventDefault();
          this.answeredEarly = true;
          this.enterAnsweringPhase();
        }
      }
      return;
    }

    if (this.phase === 'feedback') {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        this.advanceFromFeedback();
      }
      return;
    }

    if (this.phase !== 'answering') return;

    if ((ev.key >= '0' && ev.key <= '9') || ev.key === '.' || ev.key === '/' || ev.key === '+' || ev.key === '-' || ev.key === '(' || ev.key === ')') {
      ev.preventDefault();
      this.appendInput(ev.key);
    } else if (ev.key === 'Backspace') {
      ev.preventDefault();
      this.backspaceInput();
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      this.inputString = '';
      this.updateInputUi();
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      this.submitCurrentAnswer();
    } else if (ev.key === 'p' || ev.key === 'P') {
      ev.preventDefault();
      this.appendInput('π');
    } else if (ev.key === 'e' || ev.key === 'E') {
      ev.preventDefault();
      this.appendInput('e');
    } else if (ev.key === 'l' || ev.key === 'L') {
      ev.preventDefault();
      this.appendInput('ln2');
    } else if (ev.key === 'r' || ev.key === 'R') {
      ev.preventDefault();
      this.appendInput('√');
    } else if (ev.key === 'i' || ev.key === 'I') {
      ev.preventDefault();
      this.inputString = '∞';
      this.updateInputUi();
    }
  }

  private showScreen(target: 'title' | 'game' | 'result'): void {
    this.titleScreen.classList.toggle('active', target === 'title');
    this.gameScreen.classList.toggle('active', target === 'game');
    this.resultScreen.classList.toggle('active', target === 'result');
  }

  private syncMuteButtons(): void {
    const icon = this.audio.isMuted() ? '🔇' : '🔊';
    this.btnTitleMute.textContent = icon;
    this.btnGameMute.textContent = icon;
  }

  private startTitleDemo(): void {
    this.stopTitleDemo();
    const frames = [
      { text: '1', speed: '1.0×' },
      { text: '+ 1/2', speed: '1.3×' },
      { text: '+ 1/4', speed: '1.7×' },
      { text: '+ 1/8', speed: '2.3×' },
      { text: '+ 1/16', speed: '3.0×' },
      { text: '+ 1/32', speed: '4.0×' },
      { text: '+ 1/64', speed: '7.0×' },
      { text: '+ 1/1024', speed: '∞ OVERDRIVE' },
      { text: '+ 1/65536', speed: '∞ OVERDRIVE' }
    ];
    this.demoStep = 0;
    const render = (): void => {
      const f = frames[this.demoStep % frames.length];
      this.demoTermEl.textContent = f.text;
      this.demoSpeedEl.textContent = f.speed;
      this.demoStep += 1;
    };
    render();
    this.demoTimerId = window.setInterval(render, 620);
  }

  private stopTitleDemo(): void {
    if (this.demoTimerId !== null) {
      window.clearInterval(this.demoTimerId);
      this.demoTimerId = null;
    }
  }

  private refreshTitleStats(): void {
    const progress = this.scoreManager.getProgress();
    (['standard', 'endless'] as GameMode[]).forEach((mode) => {
      const stats = progress.modes[mode];
      this.req(`best-${mode}`).textContent = `${stats.bestScore.toLocaleString()} pt`;
      this.req(`grade-${mode}`).textContent = stats.bestGrade;
    });
    this.codexCountEl.textContent = `${progress.discoveredSeriesIds.length}/${ALL_SERIES.length}`;
  }

  private renderCodex(): void {
    const discovered = new Set(this.scoreManager.getProgress().discoveredSeriesIds);
    this.codexListEl.replaceChildren();

    for (const s of ALL_SERIES) {
      const isFound = discovered.has(s.id);
      const card = document.createElement('div');
      card.className = isFound ? 'codex-item' : 'codex-item is-locked';

      const head = document.createElement('div');
      head.className = 'codex-item-head';

      const tag = document.createElement('span');
      tag.className = s.category === 'divergent' ? 'mode-tag tag-cat is-divergent' : 'mode-tag tag-cat';
      tag.textContent = CATEGORY_LABELS[s.category];

      const title = document.createElement('span');
      title.className = 'codex-item-title';
      title.textContent = isFound ? s.title : '???（未発見の級数）';

      head.append(tag, title);
      card.appendChild(head);

      if (isFound) {
        const formula = document.createElement('div');
        formula.className = 'codex-item-formula';
        formula.textContent = s.formulaLatexLike;

        const desc = document.createElement('p');
        desc.className = 'codex-item-desc';
        desc.textContent = s.explanation;

        card.append(formula, desc);
      } else {
        const hint = document.createElement('p');
        hint.className = 'codex-item-desc';
        hint.textContent = `【${CATEGORY_LABELS[s.category]}】で遭遇すると解放されます`;
        card.appendChild(hint);
      }

      this.codexListEl.appendChild(card);
    }
  }

  private startRun(mode: GameMode): void {
    this.stopTitleDemo();
    this.clearCountdown();
    this.flashEngine.stop();

    const progress = this.scoreManager.getProgress();
    const isFirstPlay = progress.modes.standard.plays === 0 && progress.modes.endless.plays === 0;

    this.mode = mode;
    this.problems = buildSessionProblems(mode, isFirstPlay);
    this.questionIndex = 0;
    this.results = [];
    this.recentEndlessIds = new Set(this.problems.map((p) => p.id));
    this.totalScore = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.earlyCount = 0;
    this.lives = 3;

    this.feedbackModal.classList.remove('active');
    this.feedbackModal.setAttribute('aria-hidden', 'true');
    this.showScreen('game');
    this.startQuestion();
  }

  private abortToTitle(): void {
    this.clearCountdown();
    this.flashEngine.stop();
    this.feedbackModal.classList.remove('active');
    this.feedbackModal.setAttribute('aria-hidden', 'true');
    this.phase = 'title';
    this.refreshTitleStats();
    this.showScreen('title');
    this.startTitleDemo();
  }

  private clearCountdown(): void {
    if (this.countdownTimerId !== null) {
      window.clearTimeout(this.countdownTimerId);
      this.countdownTimerId = null;
    }
  }

  private getCurrentProblem(): SeriesProblem {
    return this.problems[this.questionIndex];
  }

  private updateHud(): void {
    if (this.mode === 'endless') {
      const hearts = '♥'.repeat(Math.max(0, this.lives)) + '♡'.repeat(Math.max(0, 3 - this.lives));
      this.hudProgress.textContent = `Q ${this.questionIndex + 1}  ${hearts}`;
    } else {
      this.hudProgress.textContent = `Q ${this.questionIndex + 1}/${this.problems.length}`;
    }

    if (this.combo >= 2) {
      this.hudCombo.textContent = `${this.combo}連続`;
      this.hudCombo.classList.add('active');
    } else {
      this.hudCombo.classList.remove('active');
    }

    this.hudScore.textContent = `${this.totalScore.toLocaleString()} pt`;
  }

  private startQuestion(): void {
    this.clearCountdown();
    this.flashEngine.stop();
    this.phase = 'countdown';

    this.inputString = '';
    this.answeredEarly = false;
    this.usedReplay = false;
    this.lastBeepStep = -1;

    this.updateHud();
    this.flashMonitor.classList.remove('is-compact', 'is-overdrive');
    this.monitorSpeedBadge.classList.remove('is-overdrive');
    this.monitorTermCount.textContent = 'READY';
    this.monitorSpeedBadge.textContent = '1.0×';
    this.monitorInfinityNote.textContent = '∞ 級数は終わりなく続く…';

    this.termDisplay.replaceChildren();
    this.termDisplay.classList.remove('is-blank');

    this.answerConsole.classList.remove('active');
    this.preAnswerBar.classList.remove('hidden');
    this.btnEarlyAnswer.disabled = true;
    this.flashHint.textContent = '規則性を見抜いて極限を考えよう…';

    const steps = ['3', '2', '1'];
    let idx = 0;

    const tickCountdown = (): void => {
      if (this.phase !== 'countdown') return;
      if (idx < steps.length) {
        this.countdownDisplay.textContent = steps[idx];
        this.countdownDisplay.classList.add('active');
        this.audio.playCountdown(false);
        idx += 1;
        this.countdownTimerId = window.setTimeout(tickCountdown, 420);
      } else {
        this.countdownDisplay.classList.remove('active');
        this.countdownDisplay.textContent = '';
        this.audio.playCountdown(true);
        this.beginFlashing();
      }
    };

    tickCountdown();
  }

  private beginFlashing(): void {
    this.phase = 'flashing';
    const problem = this.getCurrentProblem();

    this.flashEngine.start(problem, {
      onTick: (tick) => this.handleFlashTick(tick),
      onEarlyAnswerReady: () => {
        if (this.phase === 'flashing') {
          this.btnEarlyAnswer.disabled = false;
          this.flashHint.textContent = 'わかったらすぐ「極限を答える」をタップ！';
        }
      },
      onAutoOpenKeypad: () => {
        if (this.phase === 'flashing') {
          this.answeredEarly = false;
          this.enterAnsweringPhase();
        }
      }
    });
  }

  private handleFlashTick(tick: FlashTickPayload): void {
    renderTermInto(this.termDisplay, tick.term, tick.inBlankGap);

    if (!tick.inBlankGap && tick.step !== this.lastBeepStep) {
      this.lastBeepStep = tick.step;
      this.audio.playFlashBeep(tick.step, tick.isOverdrive);
    }

    if (tick.isOverdrive) {
      this.monitorTermCount.textContent = `n = ${tick.termNumber.toLocaleString()} → ∞`;
      this.monitorSpeedBadge.textContent = '∞ OVERDRIVE';
      this.monitorSpeedBadge.classList.add('is-overdrive');
      this.flashMonitor.classList.add('is-overdrive');
      this.monitorInfinityNote.textContent = '⚡ 極限に向けて無限加速中！';
    } else {
      this.monitorTermCount.textContent = `n = ${tick.termNumber}`;
      this.monitorSpeedBadge.textContent = `${tick.speedMultiplier.toFixed(1)}×`;
      this.monitorSpeedBadge.classList.remove('is-overdrive');
      this.flashMonitor.classList.remove('is-overdrive');
      this.monitorInfinityNote.textContent = '∞ 級数は終わりなく続く…';
    }
  }

  private enterAnsweringPhase(): void {
    this.phase = 'answering';
    this.answerOpenedAtMs = performance.now();

    this.flashMonitor.classList.add('is-compact');
    this.preAnswerBar.classList.add('hidden');
    this.answerConsole.classList.add('active');

    this.renderSymbolStrip();
    this.updateInputUi();
  }

  private renderSymbolStrip(): void {
    this.symbolStrip.replaceChildren();

    const symbols: MathSymbol[] = ['π', 'e', 'ln2', '√', '∞'];
    for (const sym of symbols) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = sym === '∞' ? 'sym-key is-infinity' : 'sym-key';
      btn.dataset.sym = sym;
      btn.textContent = sym;
      this.symbolStrip.appendChild(btn);
    }
  }

  private appendInput(token: string): void {
    if (this.inputString === '∞') {
      this.inputString = '';
    }
    if (this.inputString.length + token.length > 24) return;
    this.inputString += token;
    this.updateInputUi();
  }

  private backspaceInput(): void {
    if (!this.inputString) return;
    if (this.inputString.endsWith('ln2')) {
      this.inputString = this.inputString.slice(0, -3);
    } else {
      this.inputString = this.inputString.slice(0, -1);
    }
    this.updateInputUi();
  }

  private updateInputUi(): void {
    this.answerError.textContent = '';

    if (!this.inputString) {
      this.answerDisplay.textContent = '答えを入力';
      this.answerDisplay.classList.add('is-placeholder');
      this.answerPreview.textContent = '';
      return;
    }

    this.answerDisplay.textContent = this.inputString;
    this.answerDisplay.classList.remove('is-placeholder');

    const parsed = parseAnswerExpression(this.inputString);
    if (!parsed.ok) {
      this.answerPreview.textContent = '';
      return;
    }

    if (parsed.kind === 'infinity') {
      this.answerPreview.textContent = '発散';
      return;
    }

    const plainNum = /^-?\d+(\.\d+)?$/.test(this.inputString);
    if (plainNum) {
      this.answerPreview.textContent = '';
    } else {
      const rounded = Number(parsed.value.toFixed(4));
      this.answerPreview.textContent = `≈ ${rounded}`;
    }
  }

  private submitCurrentAnswer(): void {
    const problem = this.getCurrentProblem();
    const res = checkAnswer(this.inputString, problem.expected);

    if (!res.valid) {
      this.answerError.textContent = res.error ?? '式を確認してください';
      this.audio.playWrong();
      return;
    }

    this.flashEngine.stop();
    const answerTimeMs = Math.max(0, performance.now() - this.answerOpenedAtMs);

    if (res.correct) {
      this.combo += 1;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      if (this.answeredEarly && !this.usedReplay) {
        this.earlyCount += 1;
      }
      this.audio.playCorrect(this.combo);
    } else {
      this.combo = 0;
      if (this.mode === 'endless') {
        this.lives = Math.max(0, this.lives - 1);
      }
      this.audio.playWrong();
    }

    const scored = calculateQuestionScore({
      correct: res.correct,
      comboAfterAnswer: this.combo,
      answeredEarly: this.answeredEarly,
      answerTimeMs,
      usedReplay: this.usedReplay
    });

    this.totalScore += scored.pointsEarned;
    this.scoreManager.recordDiscoveredSeries(problem.id);

    const record: QuestionResult = {
      problem,
      userInput: this.inputString,
      correct: res.correct,
      pointsEarned: scored.pointsEarned,
      basePoints: scored.basePoints,
      speedBonus: scored.speedBonus,
      comboMultiplier: scored.comboMultiplier,
      answerTimeMs,
      usedReplay: this.usedReplay
    };
    this.results.push(record);

    this.updateHud();
    this.showFeedbackModal(record);
  }

  private isRunCompleteAfterCurrent(): boolean {
    if (this.mode === 'endless') {
      return this.lives <= 0;
    }
    return this.questionIndex + 1 >= this.problems.length;
  }

  private showFeedbackModal(result: QuestionResult): void {
    this.phase = 'feedback';

    this.fbStatusBadge.className = result.correct
      ? 'fb-status-badge is-correct'
      : 'fb-status-badge is-wrong';
    this.fbStatusBadge.textContent = result.correct ? '✨ 正解！極限到達！' : '💥 不正解…';

    this.fbTitle.textContent = result.problem.title;
    this.fbFormula.textContent = result.problem.formulaLatexLike;
    this.fbYourAnswer.textContent = result.userInput;
    this.fbCorrectAnswer.textContent = result.problem.expected.display;
    this.fbChartContainer.innerHTML = createConvergenceChartSvg(result.problem);
    this.fbExplanation.textContent = result.problem.explanation;

    if (result.correct) {
      const parts = [`基本 ${result.basePoints}`];
      if (result.speedBonus > 0) parts.push(`神速 +${result.speedBonus}`);
      if (result.comboMultiplier > 1) parts.push(`×コンボ ${result.comboMultiplier.toFixed(2)}`);
      this.fbPointsRow.textContent = `+${result.pointsEarned.toLocaleString()} pt（${parts.join(' / ')}）`;
    } else if (this.mode === 'endless') {
      this.fbPointsRow.textContent = `残りライフ: ${this.lives}/3`;
    } else {
      this.fbPointsRow.textContent = 'コンボリセット（0 pt）';
    }

    this.btnNextQuestion.textContent = this.isRunCompleteAfterCurrent()
      ? '結果を見る 🏆'
      : '次の問題へ →';

    this.feedbackModal.classList.add('active');
    this.feedbackModal.setAttribute('aria-hidden', 'false');
  }

  private advanceFromFeedback(): void {
    this.feedbackModal.classList.remove('active');
    this.feedbackModal.setAttribute('aria-hidden', 'true');

    if (this.isRunCompleteAfterCurrent()) {
      this.showResultScreen();
      return;
    }

    this.questionIndex += 1;
    if (this.mode === 'endless' && this.questionIndex >= this.problems.length) {
      const lastCategory = this.problems[this.problems.length - 1]?.category ?? null;
      const next = pickNextEndlessProblem(lastCategory, this.recentEndlessIds);
      this.problems.push(next);
      this.recentEndlessIds.add(next.id);
    }

    this.startQuestion();
  }

  private showResultScreen(): void {
    this.phase = 'result';
    this.flashEngine.stop();
    this.audio.playFanfare();

    const rank = getRankForScore(this.totalScore, this.mode);
    const { isNewRecord } = this.scoreManager.recordRun(this.mode, this.totalScore, rank);

    const correctCount = this.results.filter((r) => r.correct).length;
    this.resModeLabel.textContent = MODE_NAMES[this.mode];
    this.resRankGrade.textContent = rank.grade;
    this.resRankTitle.textContent = rank.title;
    this.resScore.textContent = `${this.totalScore.toLocaleString()} pt`;
    this.resNewRecord.classList.toggle('active', isNewRecord && this.totalScore > 0);
    this.resAccuracy.textContent = `${correctCount}/${this.results.length}`;
    this.resMaxCombo.textContent = `${this.maxCombo}連`;
    this.resEarlyCount.textContent = `${this.earlyCount}回`;
    this.shareFeedback.textContent = '';

    this.resHistoryList.replaceChildren();
    for (const r of this.results) {
      const row = document.createElement('div');
      row.className = 'history-item';

      const formula = document.createElement('span');
      formula.className = 'history-item-formula';
      formula.textContent = r.problem.formulaLatexLike;

      const status = document.createElement('span');
      status.className = r.correct ? 'history-item-status ok' : 'history-item-status ng';
      status.textContent = r.correct ? `○ +${r.pointsEarned}` : `× (${r.problem.expected.display})`;

      row.append(formula, status);
      this.resHistoryList.appendChild(row);
    }

    this.showScreen('result');
  }

  private buildCurrentShareText(): string {
    const rank = getRankForScore(this.totalScore, this.mode);
    const correctCount = this.results.filter((r) => r.correct).length;
    return buildShareText({
      mode: this.mode,
      rank,
      score: this.totalScore,
      correctCount,
      totalCount: this.results.length,
      maxCombo: this.maxCombo
    });
  }

  private async handleNativeOrCopyShare(): Promise<void> {
    const text = this.buildCurrentShareText();
    const url = getGameShareUrl();

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: '無限フラッシュ暗算', text, url });
        this.shareFeedback.textContent = '共有しました！';
        return;
      } catch {
        // User canceled or unsupported, fall through to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      this.shareFeedback.textContent = '結果をクリップボードにコピーしました！';
    } catch {
      this.shareFeedback.textContent = 'コピーできませんでした';
    }
  }
}
