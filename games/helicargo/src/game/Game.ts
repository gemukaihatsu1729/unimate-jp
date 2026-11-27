import { SoundManager } from '../audio/SoundManager';
import {
  CAGE_HALF_H,
  CAGE_HIT_RADIUS,
  CARGO_TYPES,
  FUEL_DRAIN_PER_SEC,
  GROUND_Y,
  HELI_RX,
  INVULN_DURATION,
  MASCOT_REACTIONS,
  MAX_FUEL,
  PAD_DWELL_SECONDS,
  PIXELS_PER_METER,
  SAFE_GROUND_SCRAPE_SPEED,
  SAFE_PAD_LANDING_SPEED,
  SKY_PALETTES,
  type CargoId,
  type CargoSpec
} from '../data';
import {
  checkObstacleHit,
  computeHookPosition,
  createInitialFlightState,
  stepFlightPhysics,
  type FlightState
} from '../physics/PendulumPhysics';
import {
  Renderer,
  type FloatingCallout,
  type Particle,
  type SpeechBubble
} from '../render/Renderer';
import { LevelGenerator, getRelayMetersForIndex } from '../world/LevelGenerator';
import { InputManager } from './InputManager';
import {
  computeRank,
  formatDistance,
  formatScore,
  loadBestRecord,
  pickDebriefComment,
  saveBestRecord,
  shareNativeOrCopy,
  shareToLine,
  shareToX,
  type FlightResultSummary
} from './ResultShare';

type ScreenPhase = 'title' | 'playing' | 'paused' | 'gameover';

function mustEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing required element #${id}`);
  return el as T;
}

export class Game {
  private readonly renderer: Renderer;
  private readonly sound = new SoundManager();
  private readonly input: InputManager;

  // Screens & modals
  private readonly screenTitle = mustEl<HTMLElement>('screen-title');
  private readonly screenGame = mustEl<HTMLElement>('screen-game');
  private readonly modalPause = mustEl<HTMLElement>('modal-pause');
  private readonly modalGameover = mustEl<HTMLElement>('modal-gameover');
  private readonly hitFlash = mustEl<HTMLElement>('hit-flash');

  // Title UI
  private readonly bestScoreText = mustEl<HTMLElement>('best-score-text');
  private readonly cargoGrid = mustEl<HTMLElement>('grid-cargo');
  private readonly selCargoTagline = mustEl<HTMLElement>('sel-cargo-tagline');
  private readonly cargoBrief = mustEl<HTMLElement>('cargo-brief');
  private readonly stageCargoChip = mustEl<HTMLElement>('stage-cargo-chip');
  private readonly btnStart = mustEl<HTMLButtonElement>('btn-start-game');

  // HUD UI
  private readonly hudHpRow = mustEl<HTMLElement>('hud-hp-row');
  private readonly hudFuelFill = mustEl<HTMLElement>('hud-fuel-fill');
  private readonly hudFuelText = mustEl<HTMLElement>('hud-fuel-text');
  private readonly hudDist = mustEl<HTMLElement>('hud-dist');
  private readonly hudNextRelay = mustEl<HTMLElement>('hud-next-relay');
  private readonly hudScore = mustEl<HTMLElement>('hud-score');
  private readonly hudWindPill = mustEl<HTMLElement>('hud-wind-pill');
  private readonly hudWindText = mustEl<HTMLElement>('hud-wind-text');
  private readonly controlHint = mustEl<HTMLElement>('control-hint');
  private readonly relayBanner = mustEl<HTMLElement>('relay-banner');
  private readonly relayBannerTitle = mustEl<HTMLElement>('rb-title');
  private readonly relayBannerDesc = mustEl<HTMLElement>('rb-desc');
  private readonly winchBtn = mustEl<HTMLButtonElement>('btn-winch');
  private readonly winchFill = mustEl<HTMLElement>('winch-fill-bar');
  private readonly winchText = mustEl<HTMLElement>('winch-btn-text');
  private readonly btnMute = mustEl<HTMLButtonElement>('btn-mute');
  private readonly btnPause = mustEl<HTMLButtonElement>('btn-pause');

  // Pause & Result UI
  private readonly pauseStats = mustEl<HTMLElement>('pause-stats');
  private readonly btnResume = mustEl<HTMLButtonElement>('btn-resume');
  private readonly btnPauseRetry = mustEl<HTMLButtonElement>('btn-pause-retry');
  private readonly btnPauseTitle = mustEl<HTMLButtonElement>('btn-pause-title');

  private readonly gameoverReason = mustEl<HTMLElement>('gameover-reason');
  private readonly gameoverTitle = mustEl<HTMLElement>('gameover-title');
  private readonly resRankStamp = mustEl<HTMLElement>('res-rank-stamp');
  private readonly newRecordPill = mustEl<HTMLElement>('new-record-pill');
  private readonly resComment = mustEl<HTMLElement>('res-comment');
  private readonly resScore = mustEl<HTMLElement>('res-score');
  private readonly resDist = mustEl<HTMLElement>('res-dist');
  private readonly resRelays = mustEl<HTMLElement>('res-relays');
  private readonly resSwings = mustEl<HTMLElement>('res-swings');
  private readonly resCargoTag = mustEl<HTMLElement>('res-cargo-tag');
  private readonly btnShareX = mustEl<HTMLButtonElement>('btn-share-x');
  private readonly btnShareLine = mustEl<HTMLButtonElement>('btn-share-line');
  private readonly btnShareNative = mustEl<HTMLButtonElement>('btn-share-native');
  private readonly shareFeedback = mustEl<HTMLElement>('share-feedback');
  private readonly btnRetrySame = mustEl<HTMLButtonElement>('btn-retry-same');
  private readonly btnBackTitle = mustEl<HTMLButtonElement>('btn-back-title');

  private phase: ScreenPhase = 'title';
  private selectedCargoId: CargoId = 'poyo';
  private activeCargo: CargoSpec = CARGO_TYPES[0];
  private flight: FlightState = createInitialFlightState(CARGO_TYPES[0], 160, 220);
  private hookX = 160;
  private hookY = 240;

  private level = new LevelGenerator(20261127);
  private cameraX = 0;
  private time = 0;
  private runTime = 0;
  private maxReachedX = 160;
  private bonusScore = 0;
  private hp = 3;
  private fuel = MAX_FUEL;
  private invulnTimer = 0;
  private relaysCleared = 0;
  private swingCatches = 0;
  private nearMisses = 0;
  private nearMissCombo = 0;
  private sectorFloat = 0;
  private targetSectorFloat = 0;

  private shakeTimer = 0;
  private shakeIntensity = 0;
  private lowFuelBeepTimer = 0;
  private groundScrapeTimer = 0;
  private relayBannerTimer = 0;
  private hintTimer = 0;
  private speechTimer = 0;

  private particles: Particle[] = [];
  private callouts: FloatingCallout[] = [];
  private speech: SpeechBubble | null = null;
  private lastResult: FlightResultSummary | null = null;
  private lastFrameMs = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.input = new InputManager(
      mustEl<HTMLElement>('touch-zone'),
      mustEl<HTMLElement>('stick-base'),
      mustEl<HTMLElement>('stick-knob'),
      this.winchBtn,
      () => {
        this.sound.unlock();
        if (this.phase === 'playing') {
          this.sound.startRotor();
        }
      }
    );

    this.renderCargoSelector();
    this.refreshBestRecordUI();
    this.bindUIEvents();
    this.enterTitleMode();

    window.addEventListener('resize', () => this.renderer.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.phase === 'playing') {
        this.pauseGame();
      }
    });

    this.lastFrameMs = performance.now();
    requestAnimationFrame(this.loop);
  }

  private bindUIEvents(): void {
    this.btnStart.addEventListener('click', () => {
      this.sound.unlock();
      this.startNewRun();
    });

    this.btnMute.addEventListener('click', () => {
      this.sound.unlock();
      const muted = this.sound.toggleMute();
      this.btnMute.textContent = muted ? '🔇' : '🔊';
    });

    this.btnPause.addEventListener('click', () => {
      if (this.phase === 'playing') {
        this.pauseGame();
      } else if (this.phase === 'paused') {
        this.resumeGame();
      }
    });

    this.btnResume.addEventListener('click', () => this.resumeGame());
    this.btnPauseRetry.addEventListener('click', () => this.startNewRun());
    this.btnPauseTitle.addEventListener('click', () => this.enterTitleMode());

    this.btnRetrySame.addEventListener('click', () => this.startNewRun());
    this.btnBackTitle.addEventListener('click', () => this.enterTitleMode());

    this.btnShareX.addEventListener('click', () => {
      if (this.lastResult) shareToX(this.lastResult);
    });
    this.btnShareLine.addEventListener('click', () => {
      if (this.lastResult) shareToLine(this.lastResult);
    });
    this.btnShareNative.addEventListener('click', async () => {
      if (!this.lastResult) return;
      const outcome = await shareNativeOrCopy(this.lastResult);
      this.shareFeedback.textContent =
        outcome === 'shared'
          ? '共有しました！'
          : outcome === 'copied'
            ? '結果をクリップボードにコピーしました！'
            : 'コピーに失敗しました';
    });

    window.addEventListener('keydown', (ev) => {
      if (ev.code === 'Escape' || ev.code === 'KeyP') {
        if (this.phase === 'playing') this.pauseGame();
        else if (this.phase === 'paused') this.resumeGame();
      }
    });
  }

  private renderCargoSelector(): void {
    this.cargoGrid.replaceChildren();
    for (const spec of CARGO_TYPES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `cargo-card${spec.id === this.selectedCargoId ? ' is-selected' : ''}`;
      btn.dataset.cargoId = spec.id;
      btn.innerHTML = `
        <span class="cargo-emoji">${spec.emoji}</span>
        <span class="cargo-name">${spec.name}</span>
        <span class="cargo-stats">HP ${spec.maxHp} · ×${spec.scoreMult.toFixed(2)}</span>
      `;
      btn.addEventListener('click', () => {
        this.sound.unlock();
        this.selectedCargoId = spec.id;
        this.activeCargo = spec;
        this.syncSelectedCargoUI();
        this.flight = createInitialFlightState(spec, this.flight.hx, 200);
        this.flight.theta = 0.28;
        this.sound.playTone(520, 680, 0.08, 'triangle', 0.08);
      });
      this.cargoGrid.appendChild(btn);
    }
    this.syncSelectedCargoUI();
  }

  private syncSelectedCargoUI(): void {
    const spec = CARGO_TYPES.find((c) => c.id === this.selectedCargoId) ?? CARGO_TYPES[0];
    this.activeCargo = spec;
    for (const card of Array.from(this.cargoGrid.querySelectorAll<HTMLElement>('.cargo-card'))) {
      card.classList.toggle('is-selected', card.dataset.cargoId === spec.id);
    }
    this.selCargoTagline.textContent = spec.tagline;
    this.cargoBrief.textContent = spec.description;
    this.stageCargoChip.textContent = `${spec.emoji} ${spec.name} 積載中`;
  }

  private refreshBestRecordUI(): void {
    const rec = loadBestRecord();
    this.bestScoreText.textContent = rec.bestScore > 0 ? `${formatScore(rec.bestScore)} pt` : '-';
  }

  private enterTitleMode(): void {
    this.phase = 'title';
    this.sound.stopRotor();
    this.input.resetAll();
    this.screenTitle.classList.add('active');
    this.screenGame.classList.remove('active');
    this.modalPause.classList.add('hidden');
    this.modalGameover.classList.add('hidden');
    this.relayBanner.classList.add('hidden');
    this.particles = [];
    this.callouts = [];
    this.speech = null;
    this.sectorFloat = 0;
    this.targetSectorFloat = 0;
    this.level = new LevelGenerator(20261127);
    this.flight = createInitialFlightState(this.activeCargo, 160, 195);
    this.flight.theta = 0.22;
    this.cameraX = 0;
    this.refreshBestRecordUI();
  }

  private startNewRun(): void {
    const spec = CARGO_TYPES.find((c) => c.id === this.selectedCargoId) ?? CARGO_TYPES[0];
    this.activeCargo = spec;
    this.phase = 'playing';

    this.screenTitle.classList.remove('active');
    this.screenGame.classList.add('active');
    this.modalPause.classList.add('hidden');
    this.modalGameover.classList.add('hidden');
    this.relayBanner.classList.add('hidden');
    this.shareFeedback.textContent = '';

    const seed = Math.floor(Date.now() % 1000000) + 101;
    this.level = new LevelGenerator(seed);
    this.flight = createInitialFlightState(spec, 160, 210);
    const hook = computeHookPosition(this.flight.hx, this.flight.hy, this.flight.pitch);
    this.hookX = hook.hookX;
    this.hookY = hook.hookY;

    this.cameraX = 0;
    this.runTime = 0;
    this.maxReachedX = 160;
    this.bonusScore = 0;
    this.hp = spec.maxHp;
    this.fuel = MAX_FUEL;
    this.invulnTimer = 0;
    this.relaysCleared = 0;
    this.swingCatches = 0;
    this.nearMisses = 0;
    this.nearMissCombo = 0;
    this.sectorFloat = 0;
    this.targetSectorFloat = 0;
    this.shakeTimer = 0;
    this.lowFuelBeepTimer = 0;
    this.groundScrapeTimer = 0;
    this.relayBannerTimer = 0;
    this.hintTimer = 5.5;
    this.controlHint.classList.remove('hidden');

    this.particles = [];
    this.callouts = [];
    this.speech = { text: '出発だー！', life: 1.8, maxLife: 1.8 };
    this.speechTimer = 1.8;

    this.sound.startRotor();
    this.updateHUD();
  }

  private pauseGame(): void {
    if (this.phase !== 'playing') return;
    this.phase = 'paused';
    this.sound.stopRotor();
    this.input.resetAll();
    const dist = this.getDistanceMeters();
    const score = this.getTotalScore();
    this.pauseStats.textContent = `距離 ${formatDistance(dist)} ・ スコア ${formatScore(score)} pt ・ 中継 ${this.relaysCleared}回`;
    this.modalPause.classList.remove('hidden');
  }

  private resumeGame(): void {
    if (this.phase !== 'paused') return;
    this.phase = 'playing';
    this.modalPause.classList.add('hidden');
    this.sound.startRotor();
    this.lastFrameMs = performance.now();
  }

  private getDistanceMeters(): number {
    return Math.max(0, (this.maxReachedX - 160) / PIXELS_PER_METER);
  }

  private getTotalScore(): number {
    const distPoints = this.getDistanceMeters() * 4.5;
    return Math.floor((distPoints + this.bonusScore) * this.activeCargo.scoreMult);
  }

  private loop = (nowMs: number): void => {
    const dt = Math.min(0.05, Math.max(0.001, (nowMs - this.lastFrameMs) / 1000));
    this.lastFrameMs = nowMs;

    if (this.phase === 'title') {
      this.updateTitleDemo(dt);
    } else if (this.phase === 'playing') {
      this.updatePlaying(dt);
    }

    const shakeX = this.shakeTimer > 0 ? (Math.random() - 0.5) * this.shakeIntensity : 0;
    const shakeY = this.shakeTimer > 0 ? (Math.random() - 0.5) * this.shakeIntensity : 0;

    let activeWindAx = 0;
    for (const wz of this.level.windZones) {
      if (this.flight.hx >= wz.xStart && this.flight.hx <= wz.xEnd) {
        activeWindAx = wz.ax;
        break;
      }
    }

    this.renderer.render({
      time: this.time,
      cameraX: this.cameraX,
      shakeX,
      shakeY,
      sectorFloat: this.sectorFloat,
      flight: this.flight,
      hookX: this.hookX,
      hookY: this.hookY,
      cargo: this.activeCargo,
      invulnTimer: this.invulnTimer,
      obstacles: this.level.obstacles,
      pickups: this.level.pickups,
      windZones: this.level.windZones,
      relayPads: this.level.relayPads,
      particles: this.particles,
      callouts: this.callouts,
      speech: this.speech,
      activeWindAx
    });

    requestAnimationFrame(this.loop);
  };

  private updateTitleDemo(dt: number): void {
    this.time += dt;
    const targetY = 175 + Math.sin(this.time * 1.3) * 18;
    const dy = (targetY - this.flight.hy) * 0.04;
    const step = stepFlightPhysics(
      this.flight,
      { thrustX: 0.36, thrustY: dy, winch: false },
      this.activeCargo,
      Math.sin(this.time * 1.1) * 35,
      0,
      dt
    );
    this.flight = step.state;
    this.hookX = step.hookX;
    this.hookY = step.hookY;

    const logicalW = this.renderer.getLogicalWidth();
    this.cameraX = Math.max(0, this.flight.hx - logicalW * 0.32);
    this.level.generateAhead(this.cameraX + logicalW);
    this.level.pruneBehind(this.cameraX - 420);
  }

  private updatePlaying(dt: number): void {
    this.time += dt;
    this.runTime += dt;

    if (this.invulnTimer > 0) this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    if (this.shakeTimer > 0) this.shakeTimer = Math.max(0, this.shakeTimer - dt);
    if (this.groundScrapeTimer > 0) this.groundScrapeTimer = Math.max(0, this.groundScrapeTimer - dt);
    if (this.speechTimer > 0) {
      this.speechTimer -= dt;
      if (this.speech) this.speech.life = this.speechTimer;
      if (this.speechTimer <= 0) this.speech = null;
    }

    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) {
        this.controlHint.classList.add('hidden');
      }
    }

    if (this.relayBannerTimer > 0) {
      this.relayBannerTimer -= dt;
      if (this.relayBannerTimer <= 0) {
        this.relayBanner.classList.add('hidden');
      }
    }

    // Smoothly transition sky palette after clearing a relay sector
    if (this.sectorFloat < this.targetSectorFloat) {
      this.sectorFloat = Math.min(this.targetSectorFloat, this.sectorFloat + dt * 0.45);
    }

    // Check active wind zone
    let windAx = 0;
    let windAy = 0;
    let activeWindLabel = '';
    for (const wz of this.level.windZones) {
      if (this.flight.hx >= wz.xStart && this.flight.hx <= wz.xEnd) {
        windAx = wz.ax;
        windAy = wz.ay;
        activeWindLabel = wz.label;
        break;
      }
    }
    if (activeWindLabel) {
      this.hudWindPill.classList.remove('hidden');
      this.hudWindText.textContent = `${windAx < 0 ? '◀' : '▶'} ${activeWindLabel}`;
    } else {
      this.hudWindPill.classList.add('hidden');
    }

    // Step helicopter & pendulum physics
    const ctrl = this.input.readControl();
    const res = stepFlightPhysics(this.flight, ctrl, this.activeCargo, windAx, windAy, dt);
    this.flight = res.state;
    this.hookX = res.hookX;
    this.hookY = res.hookY;

    // Update camera smoothly so heli sits ~28% from left edge
    const logicalW = this.renderer.getLogicalWidth();
    const desiredCamX = Math.max(0, this.flight.hx - logicalW * 0.28);
    this.cameraX += (desiredCamX - this.cameraX) * Math.min(1, 7.5 * dt);
    if (this.flight.hx > this.maxReachedX) {
      this.maxReachedX = this.flight.hx;
    }

    // Keep helicopter from going off the left screen edge
    if (this.flight.hx < this.cameraX + 46) {
      this.flight.hx = this.cameraX + 46;
      if (this.flight.hvx < 0) this.flight.hvx = 0;
    }

    this.level.generateAhead(this.cameraX + logicalW);
    this.level.pruneBehind(this.cameraX - 450);

    // Update rotor audio
    const speedNorm = Math.hypot(this.flight.hvx, this.flight.hvy) / 300;
    this.sound.updateRotor(speedNorm, true);

    // Fuel consumption
    this.fuel = Math.max(0, this.fuel - FUEL_DRAIN_PER_SEC * dt);
    if (this.fuel > 0 && this.fuel < 22) {
      this.lowFuelBeepTimer -= dt;
      if (this.lowFuelBeepTimer <= 0) {
        this.lowFuelBeepTimer = 1.1;
        this.sound.playLowFuelBeep();
        if (!this.speech) {
          this.showSpeech(MASCOT_REACTIONS.lowFuel[0], 1.2);
        }
      }
    }
    if (this.fuel <= 0) {
      this.triggerGameOver('fuel');
      return;
    }

    // Big swing mascot speech reaction
    if (Math.abs(this.flight.theta) > 1.05 && !this.speech) {
      const pool = MASCOT_REACTIONS.swingBig;
      this.showSpeech(pool[Math.floor(Math.random() * pool.length)], 1.1);
    }

    // Check Relay Helipad landings
    this.checkRelayPads(dt, res.groundContact.impactSpeed);

    // Check Ground scrape / slam (skip damage when gently touching a Relay Pad)
    const overPad = this.level.relayPads.some(
      (p) => Math.abs(this.flight.cx - p.x) <= p.width * 0.52
    );
    if (res.groundContact.touching && !overPad) {
      if (res.groundContact.impactSpeed >= SAFE_GROUND_SCRAPE_SPEED) {
        this.applyDamage(true, '地面に激突！');
      } else if (this.groundScrapeTimer <= 0) {
        this.groundScrapeTimer = 0.14;
        this.spawnBurst(this.flight.cx, GROUND_Y - 2, 5, '#84cc16', 'grass');
      }
    }

    // Trigger approaching bird flocks & check obstacle collisions + near-misses
    this.checkObstacles(logicalW);

    // Check pickups (Star rings & Fuel capsules)
    this.checkPickups();

    // Update particles & floating callouts
    this.updateParticles(dt);
    this.updateCallouts(dt);

    if (this.hp <= 0) {
      this.triggerGameOver('crash');
      return;
    }

    this.updateHUD();
  }

  private checkRelayPads(dt: number, impactSpeed: number): void {
    for (const pad of this.level.relayPads) {
      if (pad.cleared) continue;
      const inX = Math.abs(this.flight.cx - pad.x) <= pad.width * 0.48;
      const nearDeckY = this.flight.cy + CAGE_HALF_H >= GROUND_Y - 22;

      if (inX && nearDeckY) {
        if (impactSpeed <= SAFE_PAD_LANDING_SPEED) {
          pad.dwellTimer += dt;
          if (pad.dwellTimer >= PAD_DWELL_SECONDS) {
            pad.cleared = true;
            this.relaysCleared += 1;
            const bonus = 1000 * pad.sector;
            this.bonusScore += bonus;
            this.fuel = MAX_FUEL;
            if (this.hp < this.activeCargo.maxHp) {
              this.hp += 1;
            }
            this.targetSectorFloat = this.relaysCleared;
            this.sound.playRelayClear();
            this.spawnBurst(pad.x, GROUND_Y - 24, 28, '#fde047', 'confetti');
            this.spawnBurst(pad.x, GROUND_Y - 24, 18, '#4ade80', 'confetti');
            this.addCallout(pad.x, GROUND_Y - 58, `RELAY CLEAR! +${bonus}`, '#4ade80');
            this.showSpeech(
              MASCOT_REACTIONS.relay[this.relaysCleared % MASCOT_REACTIONS.relay.length],
              1.6
            );

            const nextPalette = SKY_PALETTES[this.relaysCleared % SKY_PALETTES.length];
            this.relayBannerTitle.textContent = `RELAY #${pad.sector} 完了！`;
            this.relayBannerDesc.textContent = `燃料100%＆HP回復 ・ 次エリア: ${nextPalette.name}`;
            this.relayBanner.classList.remove('hidden');
            this.relayBannerTimer = 2.6;
          }
        } else {
          pad.dwellTimer = 0;
          this.applyDamage(true, '着陸速度が速すぎ！');
        }
      } else {
        pad.dwellTimer = Math.max(0, pad.dwellTimer - dt * 2);
      }
    }
  }

  private checkObstacles(logicalW: number): void {
    const rightEdge = this.cameraX + logicalW;
    for (const obs of this.level.obstacles) {
      if (obs.kind === 'birds' && !obs.triggered && obs.x <= rightEdge + 220) {
        obs.triggered = true;
        obs.spawnTime = this.time;
      }

      const hit = checkObstacleHit(
        this.flight.hx,
        this.flight.hy,
        this.flight.cx,
        this.flight.cy,
        obs,
        this.time
      );

      if (hit.heliHit || hit.cageHit) {
        this.applyDamage(hit.cageHit && !hit.heliHit, hit.cageHit ? 'カゴが接触！' : '機体が接触！');
      } else if (!obs.nearMissed && hit.cageNearMissDist < 26) {
        const obsRefX = obs.x;
        if (this.flight.cx > obsRefX - 15) {
          obs.nearMissed = true;
          this.nearMisses += 1;
          this.nearMissCombo = Math.min(5, this.nearMissCombo + 1);
          const pts = 150 * this.nearMissCombo;
          this.bonusScore += pts;
          this.sound.playNearMiss();
          this.addCallout(
            this.flight.cx,
            this.flight.cy - 28,
            `CLOSE! +${pts}`,
            '#38bdf8'
          );
          if (!this.speech) {
            const pool = MASCOT_REACTIONS.nearMiss;
            this.showSpeech(pool[Math.floor(Math.random() * pool.length)], 1.0);
          }
        }
      }
    }
  }

  private checkPickups(): void {
    for (const item of this.level.pickups) {
      if (item.collected) continue;
      const cageDist = Math.hypot(this.flight.cx - item.x, this.flight.cy - item.y);
      const heliDist = Math.hypot(this.flight.hx - item.x, this.flight.hy - item.y);
      const hitCage = cageDist <= CAGE_HIT_RADIUS + item.radius + 4;
      const hitHeli = heliDist <= HELI_RX * 0.72 + item.radius;

      if (hitCage || hitHeli) {
        item.collected = true;
        if (item.kind === 'star') {
          const swingBonus = hitCage && !hitHeli;
          const pts = swingBonus ? 350 : 200;
          this.bonusScore += pts;
          this.fuel = Math.min(MAX_FUEL, this.fuel + 10);
          if (swingBonus) this.swingCatches += 1;
          this.sound.playStar(swingBonus);
          this.spawnBurst(item.x, item.y, 12, '#fde047', 'spark');
          this.addCallout(
            item.x,
            item.y - 14,
            swingBonus ? `SWING CATCH! +${pts}` : `+${pts}`,
            swingBonus ? '#fde047' : '#fef08a'
          );
        } else {
          this.fuel = Math.min(MAX_FUEL, this.fuel + 28);
          this.bonusScore += 150;
          this.sound.playFuel();
          this.spawnBurst(item.x, item.y, 12, '#4ade80', 'spark');
          this.addCallout(item.x, item.y - 14, 'FUEL +28%', '#4ade80');
        }
      }
    }
  }

  private applyDamage(isCage: boolean, calloutMsg: string): void {
    if (this.invulnTimer > 0) return;
    this.hp = Math.max(0, this.hp - 1);
    this.invulnTimer = INVULN_DURATION;
    this.nearMissCombo = 0;
    this.shakeTimer = 0.28;
    this.shakeIntensity = 9;
    this.hitFlash.classList.add('active');
    setTimeout(() => this.hitFlash.classList.remove('active'), 160);

    // Gentle bounce away so player doesn't stay stuck inside obstacle
    this.flight.hvx = Math.max(-140, this.flight.hvx * 0.35 - 55);
    this.flight.hvy = -105;
    if (isCage) {
      this.flight.omega = -this.flight.omega * 0.4 + (this.flight.theta >= 0 ? -2.2 : 2.2);
    }

    this.sound.playDamage(isCage);
    this.spawnBurst(
      isCage ? this.flight.cx : this.flight.hx,
      isCage ? this.flight.cy : this.flight.hy,
      16,
      '#f87171',
      'spark'
    );
    this.addCallout(this.flight.hx, this.flight.hy - 32, calloutMsg, '#f87171');
    const pool = MASCOT_REACTIONS.damage;
    this.showSpeech(pool[Math.floor(Math.random() * pool.length)], 1.4);
  }

  private showSpeech(text: string, duration: number): void {
    this.speech = { text, life: duration, maxLife: duration };
    this.speechTimer = duration;
  }

  private spawnBurst(
    x: number,
    y: number,
    count: number,
    color: string,
    kind: Particle['kind']
  ): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 45 + Math.random() * 145;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd - 45,
        life: 0.45 + Math.random() * 0.45,
        maxLife: 0.9,
        size: 2.5 + Math.random() * 3.5,
        color,
        kind
      });
    }
  }

  private addCallout(x: number, y: number, text: string, color: string): void {
    this.callouts.push({
      x,
      y,
      vy: -36,
      text,
      color,
      life: 1.05,
      maxLife: 1.05
    });
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += 260 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  private updateCallouts(dt: number): void {
    for (let i = this.callouts.length - 1; i >= 0; i--) {
      const c = this.callouts[i];
      c.life -= dt;
      if (c.life <= 0) {
        this.callouts.splice(i, 1);
        continue;
      }
      c.y += c.vy * dt;
    }
  }

  private updateHUD(): void {
    // Hearts
    let hearts = '';
    for (let i = 0; i < this.activeCargo.maxHp; i++) {
      hearts += i < this.hp ? '❤️' : '🖤';
    }
    this.hudHpRow.textContent = hearts;

    // Fuel
    const fuelPct = Math.round(this.fuel);
    this.hudFuelFill.style.width = `${fuelPct}%`;
    this.hudFuelFill.classList.toggle('low', fuelPct <= 25);
    this.hudFuelText.textContent = `${fuelPct}%`;

    // Distance & Next Relay
    const dist = Math.floor(this.getDistanceMeters());
    this.hudDist.textContent = `${dist} m`;
    const nextRelayDist = getRelayMetersForIndex(this.relaysCleared);
    const remaining = Math.max(0, Math.ceil(nextRelayDist - dist));
    this.hudNextRelay.textContent = `RELAY ${remaining}m`;

    // Score
    this.hudScore.textContent = formatScore(this.getTotalScore());

    // Winch button gauge
    const stamina = Math.round(this.flight.winchStamina);
    this.winchFill.style.width = `${stamina}%`;
    this.winchBtn.classList.toggle('overheated', this.flight.winchOverheated);
    this.winchBtn.classList.toggle('active', this.flight.winching);
    this.winchText.textContent = this.flight.winchOverheated
      ? `冷却中 ${stamina}%`
      : this.flight.winching
        ? `巻上中 ${stamina}%`
        : `巻上 ${stamina}%`;
  }

  private triggerGameOver(reason: 'crash' | 'fuel'): void {
    this.phase = 'gameover';
    this.sound.stopRotor();
    this.input.resetAll();

    const distanceMeters = this.getDistanceMeters();
    const score = this.getTotalScore();
    const rank = computeRank(score, distanceMeters);
    const { isNewRecord } = saveBestRecord(score, distanceMeters);

    this.lastResult = {
      score,
      distanceMeters,
      relaysCleared: this.relaysCleared,
      swingCatches: this.swingCatches,
      nearMisses: this.nearMisses,
      cargo: this.activeCargo,
      reason
    };

    this.gameoverReason.textContent = reason === 'fuel' ? 'FUEL EMPTY' : 'CARGO DAMAGED';
    this.gameoverTitle.textContent =
      reason === 'fuel' ? '燃料切れで緊急着陸…' : '衝撃で移送失敗…';
    this.resRankStamp.textContent = rank;
    this.resRankStamp.className = `rank-stamp rank-${rank}`;
    this.newRecordPill.classList.toggle('hidden', !isNewRecord);
    this.resComment.textContent = pickDebriefComment(rank, score + distanceMeters);

    this.resScore.textContent = `${formatScore(score)} pt`;
    this.resDist.textContent = formatDistance(distanceMeters);
    this.resRelays.textContent = `${this.relaysCleared} 回`;
    this.resSwings.textContent = `${this.swingCatches} 回`;
    this.resCargoTag.textContent = `積載カーゴ: ${this.activeCargo.emoji} ${this.activeCargo.name}（スコア倍率 ×${this.activeCargo.scoreMult.toFixed(2)}）`;

    this.modalGameover.classList.remove('hidden');
  }
}
