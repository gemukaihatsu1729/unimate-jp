import type { SeriesProblem, TermDisplay } from '../types';

export interface FlashTickPayload {
  term: TermDisplay;
  termNumber: number; // 1-based index of the displayed term
  step: number;
  intervalMs: number;
  speedMultiplier: number;
  isOverdrive: boolean;
  inBlankGap: boolean;
}

export interface FlashEngineCallbacks {
  onTick: (payload: FlashTickPayload) => void;
  onEarlyAnswerReady: () => void;
  onAutoOpenKeypad: () => void;
}

export class FlashEngine {
  private rafId: number | null = null;
  private running = false;
  private problem: SeriesProblem | null = null;
  private callbacks: FlashEngineCallbacks | null = null;

  private step = 0;
  private termIndex = 0;
  private stepStartMs = 0;
  private startTimeMs = 0;
  private inBlankGap = false;
  private earlyReadyFired = false;
  private overdriveStartMs: number | null = null;
  private autoOpenFired = false;
  private suppressAutoOpen = false;

  static intervalForStep(step: number): number {
    return Math.max(28, Math.round(950 * Math.pow(0.76, step)));
  }

  start(problem: SeriesProblem, callbacks: FlashEngineCallbacks, suppressAutoOpen = false): void {
    this.stop();
    this.problem = problem;
    this.callbacks = callbacks;
    this.suppressAutoOpen = suppressAutoOpen;
    this.resetState(performance.now());
    this.running = true;
    this.emitCurrentTick();
    this.scheduleNextFrame();
  }

  restartFromBeginning(suppressAutoOpen = true): void {
    if (!this.problem || !this.callbacks) return;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.suppressAutoOpen = suppressAutoOpen;
    this.resetState(performance.now());
    this.running = true;
    this.emitCurrentTick();
    this.scheduleNextFrame();
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  getElapsedSinceStartMs(): number {
    if (this.startTimeMs === 0) return 0;
    return Math.max(0, performance.now() - this.startTimeMs);
  }

  isOverdrive(): boolean {
    return this.step >= 12;
  }

  private resetState(now: number): void {
    this.step = 0;
    this.termIndex = 0;
    this.stepStartMs = now;
    this.startTimeMs = now;
    this.inBlankGap = false;
    this.earlyReadyFired = false;
    this.overdriveStartMs = null;
    this.autoOpenFired = false;
  }

  private scheduleNextFrame(): void {
    if (!this.running) return;
    this.rafId = requestAnimationFrame((now) => this.onFrame(now));
  }

  private onFrame(now: number): void {
    if (!this.running || !this.problem || !this.callbacks) return;

    let stepInterval = FlashEngine.intervalForStep(this.step);
    let elapsedInStep = now - this.stepStartMs;
    let advanced = false;

    // Advance steps if frame delta spanned one or more intervals (e.g., high overdrive)
    let guard = 0;
    while (elapsedInStep >= stepInterval && guard < 8) {
      this.stepStartMs += stepInterval;
      elapsedInStep -= stepInterval;
      this.step += 1;

      if (this.step < 12) {
        this.termIndex = this.step;
      } else {
        if (this.overdriveStartMs === null) {
          this.overdriveStartMs = now;
        }
        const delta = Math.max(
          1,
          Math.min(48731, Math.round(Math.pow(1.09, this.step - 12)))
        );
        this.termIndex += delta;
      }

      stepInterval = FlashEngine.intervalForStep(this.step);
      advanced = true;
      guard += 1;
    }

    if (guard >= 8) {
      // Catch up cleanly after tab backgrounding
      this.stepStartMs = now;
      elapsedInStep = 0;
    }

    const shouldBlank = stepInterval >= 90 && elapsedInStep >= stepInterval * 0.82;
    if (advanced || shouldBlank !== this.inBlankGap) {
      this.inBlankGap = shouldBlank;
      this.emitCurrentTick();
    }

    if (!this.earlyReadyFired && this.step >= 3) {
      this.earlyReadyFired = true;
      this.callbacks.onEarlyAnswerReady();
    }

    if (
      !this.suppressAutoOpen &&
      !this.autoOpenFired &&
      this.overdriveStartMs !== null &&
      now - this.overdriveStartMs >= 1400
    ) {
      this.autoOpenFired = true;
      this.callbacks.onAutoOpenKeypad();
    }

    this.scheduleNextFrame();
  }

  private emitCurrentTick(): void {
    if (!this.problem || !this.callbacks) return;
    const intervalMs = FlashEngine.intervalForStep(this.step);
    const speedMultiplier = Math.round((950 / intervalMs) * 10) / 10;
    this.callbacks.onTick({
      term: this.problem.getTerm(this.termIndex),
      termNumber: this.termIndex + 1,
      step: this.step,
      intervalMs,
      speedMultiplier,
      isOverdrive: this.step >= 12,
      inBlankGap: this.inBlankGap
    });
  }
}
