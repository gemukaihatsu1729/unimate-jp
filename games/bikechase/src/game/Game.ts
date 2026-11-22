import * as THREE from 'three';
import {
  BIKE_IDS,
  BIKES,
  POLICE_SPECS,
  STORAGE_KEY,
  getWantedLevel,
  type BikeId,
  type PickupKind,
  type PoliceKind
} from '../data';
import { StreamingCity } from '../world/CityLayout';
import { CityBuilder } from '../world/CityBuilder';
import { PlayerBike } from '../entities/PlayerBike';
import { PoliceManager, computeBustedDelta } from '../entities/PoliceAI';
import { CityPropsManager } from '../entities/CityProps';
import { EffectsManager } from '../fx/EffectsManager';
import { AudioManager } from '../audio/AudioManager';
import { SlideInputManager } from './SlideInputManager';
import { CameraController } from './CameraController';
import { MiniMap } from './MiniMap';
import {
  buildLineShareUrl,
  buildShareText,
  buildXShareUrl,
  evaluateEscapeResult,
  formatEscapeTime,
  getGameShareUrl,
  type ResultShareInput
} from './ResultShare';

interface Records {
  bestTime: number;
  bestWrecks: number;
  bestStars: number;
}

interface FloatingPopup {
  el: HTMLDivElement;
  x: number;
  y: number;
  z: number;
  life: number;
  maxLife: number;
}

const START_X = -17.5;
const START_Z = 17.5;
const START_HEADING = Math.PI;

function randomCitySeed(): number {
  return Math.floor(100000 + Math.random() * 899999);
}

function loadRecords(): Records {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        bestTime: Number(p.bestTime) || 0,
        bestWrecks: Number(p.bestWrecks) || 0,
        bestStars: Number(p.bestStars) || 0
      };
    }
  } catch (_) {}
  return { bestTime: 0, bestWrecks: 0, bestStars: 0 };
}

function saveRecords(r: Records): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(r));
  } catch (_) {}
}

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;

  private citySeed: number = randomCitySeed();
  private city: StreamingCity;
  private world: CityBuilder;
  private fx: EffectsManager;
  private audio = new AudioManager();
  private player: PlayerBike;
  private police: PoliceManager;
  private props: CityPropsManager;
  private camCtrl: CameraController;
  private input: SlideInputManager;
  private minimap: MiniMap;

  private selectedBikeId: BikeId = 'viper';
  private records: Records = loadRecords();
  private phase: 'title' | 'playing' | 'gameover' = 'title';
  private paused = false;

  // Run Stats (Escape Time Only)
  private time = 0;
  private elapsedSec = 0;
  private wantedStars = 1;
  private maxStars = 1;
  private wreckedCount = 0;
  private nearMissCount = 0;
  private wreckCombo = 0;
  private wreckComboTimer = 0;
  private hitstopTimer = 0;
  private bannerTimer = 0;
  private hitFlashTimer = 0;
  private slideHintTimer = 0;
  private stalledTime = 0;
  private lastNitroTap = 0;
  private lastShareInput: ResultShareInput | null = null;
  private lastFrameMs = 0;

  // Reusable projection & popup pool
  private projVec = new THREE.Vector3();
  private popups: FloatingPopup[] = [];

  // Cached DOM refs
  private screenTitle = document.getElementById('screen-title')!;
  private screenGame = document.getElementById('screen-game')!;
  private bestTimeText = document.getElementById('best-time-text')!;
  private citySeedText = document.getElementById('city-seed-text')!;
  private stageBikeChip = document.getElementById('stage-bike-chip')!;
  private selBikeTagline = document.getElementById('sel-bike-tagline')!;
  private gridBikes = document.getElementById('grid-bikes')!;
  private bikeBrief = document.getElementById('bike-brief')!;

  private hitFlashEl = document.getElementById('hit-flash')!;
  private nitroVignetteEl = document.getElementById('nitro-vignette')!;
  private fxPopupsEl = document.getElementById('fx-popups')!;

  private hudWantedPill = document.getElementById('hud-wanted-pill')!;
  private hudStars = document.getElementById('hud-stars')!;
  private hudTime = document.getElementById('hud-time')!;
  private hudHpRow = document.getElementById('hud-hp-row')!;
  private hudSpeed = document.getElementById('hud-speed')!;
  private hudStateBadge = document.getElementById('hud-state-badge')!;
  private slideHintEl = document.getElementById('slide-hint')!;

  private wantedBanner = document.getElementById('wanted-banner')!;
  private wbStars = document.getElementById('wb-stars')!;
  private wbTitle = document.getElementById('wb-title')!;
  private wbDesc = document.getElementById('wb-desc')!;

  private comboBox = document.getElementById('combo-box')!;
  private comboNum = document.getElementById('combo-num')!;
  private bustedWrap = document.getElementById('busted-wrap')!;
  private bustedFill = document.getElementById('busted-fill')!;

  private btnNitro = document.getElementById('btn-nitro')!;
  private nitroFillBar = document.getElementById('nitro-fill-bar')!;
  private nitroBtnText = document.getElementById('nitro-btn-text')!;
  private btnMute = document.getElementById('btn-mute')!;

  private modalPause = document.getElementById('modal-pause')!;
  private pauseStats = document.getElementById('pause-stats')!;
  private modalGameover = document.getElementById('modal-gameover')!;
  private shareFeedbackEl = document.getElementById('share-feedback')!;

  constructor() {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.4, 260);
    this.camCtrl = new CameraController(this.camera);

    this.city = new StreamingCity(this.citySeed, START_X, START_Z);
    this.world = new CityBuilder(this.scene, this.city);
    this.fx = new EffectsManager(this.scene);
    this.player = new PlayerBike(this.selectedBikeId);
    this.scene.add(this.player.mesh.root);

    this.police = new PoliceManager(this.scene);
    this.props = new CityPropsManager(this.scene, this.city);

    this.minimap = new MiniMap(document.getElementById('minimap-canvas') as HTMLCanvasElement);

    this.input = new SlideInputManager({
      onNitroTrigger: () => this.triggerNitro(),
      onPauseToggle: () => {
        if (this.phase === 'playing') {
          this.setPaused(!this.paused);
        }
      },
      onAnyInput: () => {
        this.audio.unlock();
        if (this.slideHintTimer > 0 && this.input.isTouchSliding) {
          this.slideHintTimer = 0;
          this.slideHintEl.classList.add('hidden');
        }
      }
    });

    this.buildTitleGarageCards();
    this.bindUIEvents();
    this.enterTitleMode(false);

    window.addEventListener('resize', () => this.onResize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.phase === 'playing' && !this.paused) {
        this.setPaused(true);
      }
    });

    this.lastFrameMs = performance.now();
    requestAnimationFrame((now) => this.loop(now));
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camCtrl.updateResponsiveFov(w, h);
  }

  private buildTitleGarageCards(): void {
    this.gridBikes.innerHTML = '';
    const pips = (n: number): string => '●'.repeat(n) + '○'.repeat(5 - n);

    for (const id of BIKE_IDS) {
      const spec = BIKES[id];
      const hex = `#${spec.primaryColor.toString(16).padStart(6, '0')}`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `bike-card${id === this.selectedBikeId ? ' selected' : ''}`;
      btn.dataset.bikeId = id;
      btn.innerHTML = `
        <div class="bc-top">
          <span class="bc-swatch" style="background:${hex}"></span>
          <span class="bc-name">${spec.shortName}</span>
        </div>
        <div class="bc-bars">
          <div class="bc-bar-row"><span>速度</span><span class="bc-pips">${pips(spec.stats.speed)}</span></div>
          <div class="bc-bar-row"><span>旋回</span><span class="bc-pips">${pips(spec.stats.drift)}</span></div>
          <div class="bc-bar-row"><span>耐久</span><span class="bc-pips">${pips(spec.stats.armor)}</span></div>
        </div>
      `;
      btn.addEventListener('click', () => {
        this.audio.unlock();
        this.selectBike(id);
      });
      this.gridBikes.appendChild(btn);
    }

    this.syncTitleInfo();
  }

  private selectBike(id: BikeId): void {
    this.selectedBikeId = id;
    this.player.reset(id, START_X, START_Z, START_HEADING);
    const cards = this.gridBikes.querySelectorAll<HTMLButtonElement>('.bike-card');
    cards.forEach((c) => {
      c.classList.toggle('selected', c.dataset.bikeId === id);
    });
    this.syncTitleInfo();
  }

  private syncTitleInfo(): void {
    const spec = BIKES[this.selectedBikeId];
    this.stageBikeChip.textContent = `🏍️ ${spec.name} 選択中`;
    this.selBikeTagline.textContent = spec.tagline;
    this.bikeBrief.textContent = spec.brief;
    this.bestTimeText.textContent =
      this.records.bestTime > 0 ? formatEscapeTime(this.records.bestTime) : '-';
    this.citySeedText.textContent = `#${this.citySeed}`;
  }

  private regenerateCity(newSeed: number): void {
    this.citySeed = newSeed;
    this.city.reset(this.citySeed, START_X, START_Z);
    this.world.rebuildAll(this.city);
    this.props.rebuildAll(this.city, START_X, START_Z);
    this.syncTitleInfo();
  }

  private bindUIEvents(): void {
    document.getElementById('btn-shuffle-city')!.addEventListener('click', () => {
      this.audio.unlock();
      this.audio.playPickup();
      this.regenerateCity(randomCitySeed());
    });

    document.getElementById('btn-start-game')!.addEventListener('click', () => {
      this.audio.unlock();
      this.startRun(false);
    });

    const handleNitroTap = (ev: Event): void => {
      ev.stopPropagation();
      const now = performance.now();
      if (now - this.lastNitroTap < 140) return;
      this.lastNitroTap = now;
      this.audio.unlock();
      this.triggerNitro();
    };
    this.btnNitro.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      handleNitroTap(ev);
    });
    this.btnNitro.addEventListener('click', handleNitroTap);

    this.btnMute.addEventListener('click', () => {
      this.audio.unlock();
      const muted = this.audio.toggleMute();
      this.btnMute.textContent = muted ? '🔇' : '🔊';
    });

    document.getElementById('btn-pause')!.addEventListener('click', () => {
      if (this.phase === 'playing') this.setPaused(!this.paused);
    });
    document.getElementById('btn-resume')!.addEventListener('click', () => this.setPaused(false));
    document.getElementById('btn-pause-retry')!.addEventListener('click', () => this.startRun(true));
    document.getElementById('btn-pause-title')!.addEventListener('click', () => this.enterTitleMode(true));

    document.getElementById('btn-retry-same')!.addEventListener('click', () => this.startRun(true));
    document.getElementById('btn-back-title')!.addEventListener('click', () => this.enterTitleMode(true));

    document.getElementById('btn-share-x')!.addEventListener('click', () => this.shareOnX());
    document.getElementById('btn-share-line')!.addEventListener('click', () => this.shareOnLine());
    document.getElementById('btn-share-native')!.addEventListener('click', () => {
      void this.shareNativeOrCopy();
    });
  }

  private enterTitleMode(rollNewCity: boolean): void {
    this.phase = 'title';
    this.paused = false;
    this.audio.setEngineActive(false);
    this.input.reset();
    this.fx.reset();
    this.clearPopups();

    if (rollNewCity) {
      this.citySeed = randomCitySeed();
    }
    this.city.reset(this.citySeed, START_X, START_Z);
    this.world.rebuildAll(this.city);
    this.props.rebuildAll(this.city, START_X, START_Z);

    this.player.reset(this.selectedBikeId, START_X, START_Z, START_HEADING);
    this.police.spawnTitleAmbient();
    this.world.updateShadowCenter(START_X, START_Z);

    this.modalPause.classList.add('hidden');
    this.modalGameover.classList.add('hidden');
    this.screenGame.classList.remove('active');
    this.screenTitle.classList.add('active');
    this.syncTitleInfo();
  }

  private startRun(rollNewCity: boolean): void {
    this.phase = 'playing';
    this.paused = false;
    this.elapsedSec = 0;
    this.wantedStars = 1;
    this.maxStars = 1;
    this.wreckedCount = 0;
    this.nearMissCount = 0;
    this.wreckCombo = 0;
    this.wreckComboTimer = 0;
    this.hitstopTimer = 0;
    this.bannerTimer = 0;
    this.hitFlashTimer = 0;
    this.slideHintTimer = 6.0;
    this.stalledTime = 0;

    this.clearPopups();
    this.fx.reset();
    this.police.reset();
    this.input.reset();

    if (rollNewCity) {
      this.citySeed = randomCitySeed();
    }
    this.city.reset(this.citySeed, START_X, START_Z);
    this.world.rebuildAll(this.city);
    this.props.rebuildAll(this.city, START_X, START_Z);

    this.player.reset(this.selectedBikeId, START_X, START_Z, START_HEADING);
    this.camCtrl.resetForChase(this.player);
    this.world.updateShadowCenter(this.player.x, this.player.z);

    this.screenTitle.classList.remove('active');
    this.screenGame.classList.add('active');
    this.modalPause.classList.add('hidden');
    this.modalGameover.classList.add('hidden');
    this.wantedBanner.classList.add('hidden');
    this.comboBox.classList.add('hidden');
    this.bustedWrap.classList.add('hidden');
    this.slideHintEl.classList.remove('hidden');

    this.audio.unlock();
    this.audio.setEngineActive(true);
    this.renderHpPips();
    this.updateHUD();
  }

  private setPaused(pause: boolean): void {
    this.paused = pause;
    this.audio.setEngineActive(!pause && this.phase === 'playing');
    this.modalPause.classList.toggle('hidden', !pause);
    if (pause) {
      this.pauseStats.innerHTML = `
        <div class="res-cell"><span class="rk">逃走タイム</span><span class="rv">${formatEscapeTime(this.elapsedSec)}</span></div>
        <div class="res-cell"><span class="rk">手配度</span><span class="rv">★${this.wantedStars}</span></div>
        <div class="res-cell"><span class="rk">パトカー撃破</span><span class="rv">${this.wreckedCount}台</span></div>
        <div class="res-cell"><span class="rk">ニアミス</span><span class="rv">${this.nearMissCount}回</span></div>
      `;
    }
  }

  private triggerNitro(): void {
    if (this.phase !== 'playing' || this.paused) return;
    if (this.player.triggerOverdrive()) {
      this.audio.playNitroBurst(1.0);
      this.camCtrl.addShake(0.35);
      this.fx.emitBurst(this.player.x, 0.5, this.player.z, 0x38bdf8, 16, 8);
      this.spawnPopup('⚡ OVERDRIVE!!', this.player.x, 2.0, this.player.z, 'cyan');
    }
  }

  private renderHpPips(): void {
    this.hudHpRow.innerHTML = '';
    for (let i = 0; i < this.player.maxHp; i++) {
      const span = document.createElement('span');
      span.className = `hp-pip${i < this.player.hp ? '' : ' lost'}`;
      span.textContent = '🛡️';
      this.hudHpRow.appendChild(span);
    }
  }

  private spawnPopup(
    text: string,
    wx: number,
    wy: number,
    wz: number,
    variant: 'gold' | 'cyan' | 'danger' | 'green' = 'gold'
  ): void {
    if (this.popups.length >= 6) {
      const oldest = this.popups.shift()!;
      oldest.el.remove();
    }
    const el = document.createElement('div');
    el.className = `fx-popup${variant !== 'gold' ? ` ${variant}` : ''}`;
    el.textContent = text;
    this.fxPopupsEl.appendChild(el);
    this.popups.push({
      el,
      x: wx,
      y: wy,
      z: wz,
      life: 0.9,
      maxLife: 0.9
    });
  }

  private clearPopups(): void {
    for (const p of this.popups) p.el.remove();
    this.popups = [];
  }

  private updatePopups(dt: number): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.el.remove();
        this.popups.splice(i, 1);
        continue;
      }
      p.y += dt * 1.9;
      this.projVec.set(p.x, p.y, p.z).project(this.camera);
      if (this.projVec.z > 1) {
        p.el.style.opacity = '0';
        continue;
      }
      const sx = Math.max(w * 0.14, Math.min(w * 0.86, (this.projVec.x * 0.5 + 0.5) * w));
      const sy = Math.max(h * 0.14, Math.min(h * 0.82, (-this.projVec.y * 0.5 + 0.5) * h));
      p.el.style.left = `${sx}px`;
      p.el.style.top = `${sy}px`;
      p.el.style.opacity = `${Math.min(1, (p.life / p.maxLife) * 1.4)}`;
    }
  }

  private updateHUD(): void {
    const starsFilled = '★'.repeat(this.wantedStars) + '☆'.repeat(5 - this.wantedStars);
    this.hudStars.textContent = starsFilled;
    this.hudWantedPill.classList.toggle('hot', this.wantedStars >= 3);

    this.hudTime.textContent = formatEscapeTime(this.elapsedSec);

    const kmh = Math.round(this.player.groundSpeed * 3.8);
    this.hudSpeed.textContent = `${kmh}`;

    if (this.player.isOverdrive) {
      this.hudStateBadge.textContent = 'OVERDRIVE';
      this.hudStateBadge.className = 'state-badge turbo';
    } else if (this.player.isMiniTurbo) {
      this.hudStateBadge.textContent = 'TURBO!';
      this.hudStateBadge.className = 'state-badge turbo';
    } else if (this.player.isDrifting) {
      this.hudStateBadge.textContent = 'DRIFT';
      this.hudStateBadge.className = 'state-badge';
    } else {
      this.hudStateBadge.className = 'state-badge hidden';
    }

    const pct = Math.round(this.player.nitro);
    this.nitroFillBar.style.width = `${pct}%`;
    if (this.player.isOverdrive) {
      this.btnNitro.className = 'nitro-btn active';
      this.nitroBtnText.textContent = 'OVERDRIVE!!';
    } else if (pct >= 60) {
      this.btnNitro.className = 'nitro-btn ready';
      this.nitroBtnText.textContent = 'NITRO READY!';
    } else {
      this.btnNitro.className = 'nitro-btn';
      this.nitroBtnText.textContent = `NITRO ${pct}%`;
    }

    this.nitroVignetteEl.classList.toggle('active', this.player.isOverdrive);
    this.hitFlashEl.classList.toggle('active', this.hitFlashTimer > 0);

    if (this.wreckComboTimer > 0 && this.wreckCombo >= 2) {
      this.comboBox.classList.remove('hidden');
      this.comboNum.textContent = `×${this.wreckCombo}`;
    } else {
      this.comboBox.classList.add('hidden');
    }

    if (this.player.bustedProgress > 0.04) {
      this.bustedWrap.classList.remove('hidden');
      this.bustedFill.style.width = `${Math.min(100, this.player.bustedProgress * 100)}%`;
    } else {
      this.bustedWrap.classList.add('hidden');
    }
  }

  private finishGame(reason: 'hp' | 'busted'): void {
    this.phase = 'gameover';
    this.audio.playGameOver();
    this.input.reset();

    const prevBest = this.records.bestTime;
    const isNewRecord = this.elapsedSec > prevBest;
    if (isNewRecord) this.records.bestTime = this.elapsedSec;
    if (this.wreckedCount > this.records.bestWrecks) this.records.bestWrecks = this.wreckedCount;
    if (this.maxStars > this.records.bestStars) this.records.bestStars = this.maxStars;
    saveRecords(this.records);

    const shareInput: ResultShareInput = {
      elapsedSec: this.elapsedSec,
      wreckedCount: this.wreckedCount,
      nearMissCount: this.nearMissCount,
      maxStars: this.maxStars,
      reason,
      isNewRecord,
      bikeId: this.selectedBikeId
    };
    this.lastShareInput = shareInput;

    const evalRes = evaluateEscapeResult(shareInput);
    document.getElementById('gameover-reason')!.textContent =
      reason === 'busted' ? 'BUSTED — 包囲確保' : 'MACHINE WRECKED — 走行不能';
    document.getElementById('gameover-title')!.textContent = evalRes.headline;
    const stamp = document.getElementById('res-rank-stamp')!;
    stamp.textContent = evalRes.rank;
    stamp.className = `rank-stamp rank-${evalRes.rank}`;

    document.getElementById('new-record-pill')!.classList.toggle('hidden', !isNewRecord);
    document.getElementById('res-comment')!.textContent = evalRes.comment;
    document.getElementById('res-time')!.textContent = formatEscapeTime(this.elapsedSec);
    document.getElementById('res-stars')!.textContent = `★${this.maxStars}`;
    document.getElementById('res-wrecks')!.textContent = `${this.wreckedCount}台`;
    document.getElementById('res-nearmiss')!.textContent = `${this.nearMissCount}回`;
    document.getElementById('res-bike-tag')!.textContent =
      `愛車：${BIKES[this.selectedBikeId].name}（街 #${this.citySeed}）`;

    this.shareFeedbackEl.textContent = '';
    this.modalGameover.classList.remove('hidden');
  }

  private shareOnX(): void {
    if (!this.lastShareInput) return;
    const url = getGameShareUrl();
    const text = buildShareText(this.lastShareInput);
    window.open(buildXShareUrl(text, url), '_blank', 'noopener,noreferrer');
  }

  private shareOnLine(): void {
    if (!this.lastShareInput) return;
    const url = getGameShareUrl();
    const text = buildShareText(this.lastShareInput);
    window.open(buildLineShareUrl(text, url), '_blank', 'noopener,noreferrer');
  }

  private async shareNativeOrCopy(): Promise<void> {
    if (!this.lastShareInput) return;
    const url = getGameShareUrl();
    const text = buildShareText(this.lastShareInput);
    const full = `${text}\n${url}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: 'METRO ESCAPE — 3Dバイク逃走チェイス', text, url });
        this.shareFeedbackEl.textContent = 'シェアしました！';
        return;
      } catch (_) {}
    }

    try {
      await navigator.clipboard.writeText(full);
      this.shareFeedbackEl.textContent = '戦績テキストをコピーしました！';
    } catch (_) {
      this.shareFeedbackEl.textContent = 'コピーに失敗しました';
    }
  }

  private stepPlaying(dt: number): void {
    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      this.fx.update(dt * 0.25);
      this.camCtrl.updateChase(dt, this.player);
      this.updatePopups(dt);
      return;
    }

    this.elapsedSec += dt;
    if (this.wreckComboTimer > 0) {
      this.wreckComboTimer = Math.max(0, this.wreckComboTimer - dt);
      if (this.wreckComboTimer <= 0) this.wreckCombo = 0;
    }
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer = Math.max(0, this.bannerTimer - dt);
      if (this.bannerTimer <= 0) this.wantedBanner.classList.add('hidden');
    }
    if (this.slideHintTimer > 0) {
      this.slideHintTimer = Math.max(0, this.slideHintTimer - dt);
      if (this.slideHintTimer <= 0) this.slideHintEl.classList.add('hidden');
    }

    // 1. Convert 1-finger screen slide vector into world steering direction via camera basis
    const basis = this.camCtrl.getGroundBasis();
    const steerX = basis.rightX * this.input.inputX + basis.forwardX * -this.input.inputY;
    const steerZ = basis.rightZ * this.input.inputX + basis.forwardZ * -this.input.inputY;

    // 2. Step Player Bike physics & stunts
    this.player.update(dt, steerX, steerZ, this.input.strength, this.city, this.fx, this.audio, {
      onLandJump: () => {
        this.camCtrl.addShake(0.25);
        this.spawnPopup('🚀 ジャンプ成功! +NITRO', this.player.x, 1.8, this.player.z, 'cyan');
      },
      onMiniTurbo: () => {
        this.spawnPopup('🔥 ミニターボ!', this.player.x, 1.6, this.player.z);
      },
      onWallSlamDamage: () => {
        this.hitFlashTimer = 0.26;
        this.camCtrl.addShake(0.45);
        this.renderHpPips();
        this.spawnPopup('激突ダメージ!', this.player.x, 1.7, this.player.z, 'danger');
      }
    });

    // 3. Stream procedural city chunks around player position
    const delta = this.city.updateCenter(this.player.x, this.player.z);
    if (delta.changed) {
      this.world.syncWithCity(this.city, delta);
      this.props.syncWithDelta(delta);
    }

    // 4. Check Wanted Level escalation (purely elapsed time)
    const wanted = getWantedLevel(this.elapsedSec);
    if (wanted.stars > this.wantedStars) {
      this.wantedStars = wanted.stars;
      this.maxStars = Math.max(this.maxStars, wanted.stars);
      this.wbStars.textContent = '★'.repeat(wanted.stars) + '☆'.repeat(5 - wanted.stars);
      this.wbTitle.textContent = `手配度 ★${wanted.stars} — ${wanted.label}`;
      this.wbDesc.textContent = wanted.alertText;
      this.wantedBanner.classList.remove('hidden');
      this.bannerTimer = 3.2;
      this.audio.playWantedUp();
    }

    // 5. Step Police AI, Sealed Roadblocks & Helicopter
    const policeSummary = this.police.update(dt, this.player, this.city, wanted, this.fx, this.audio, {
      onPoliceWrecked: (x, z, kind: PoliceKind) => {
        this.wreckedCount += 1;
        this.wreckCombo += 1;
        this.wreckComboTimer = 5.0;
        this.player.addNitro(28);
        this.hitstopTimer = 0.035;
        this.camCtrl.addShake(0.65);
        this.spawnPopup(`💥 ${POLICE_SPECS[kind].name}撃破! +NITRO`, x, 1.9, z);
      },
      onNearMiss: (x, z) => {
        this.nearMissCount += 1;
        this.player.addNitro(14);
        this.audio.playNearMiss();
        this.spawnPopup('⚡ ニアミス! +NITRO', x, 1.5, z, 'cyan');
      },
      onRoadblockSpawned: (x, z) => {
        this.spawnPopup('🚧 前方に封鎖検問!', x, 2.2, z, 'danger');
      },
      onPlayerHit: () => {
        this.hitFlashTimer = 0.28;
        this.camCtrl.addShake(0.55);
        this.renderHpPips();
        this.spawnPopup('体当たり被弾!', this.player.x, 1.8, this.player.z, 'danger');
      }
    });

    // 6. Step Destructible Props & Off-Avenue Nitro Pickups
    this.props.update(dt, this.player, this.city, this.police.units, this.fx, this.audio, {
      onPropSmashed: () => {},
      onPickupCollected: (_kind: PickupKind, x, z) => {
        this.spawnPopup('⚡ NITRO +30%', x, 1.6, z, 'cyan');
      }
    });

    // 7. Busted Logic (true post-collision ground speed), Camera, Minimap & Audio
    if (this.player.groundSpeed < 4.8 && !this.player.airborne) {
      this.stalledTime += dt;
    } else if (this.player.groundSpeed >= 7.0) {
      this.stalledTime = Math.max(0, this.stalledTime - dt * 3);
    }

    const bustedDelta = computeBustedDelta(
      dt,
      this.player.groundSpeed,
      policeSummary.nearestDist,
      this.stalledTime,
      policeSummary.inChopperLight
    );
    this.player.bustedProgress = Math.max(0, Math.min(1, this.player.bustedProgress + bustedDelta));

    this.fx.update(dt);
    this.camCtrl.updateChase(dt, this.player);
    this.world.updateShadowCenter(this.player.x, this.player.z);
    this.minimap.render(
      dt,
      this.player,
      this.city,
      this.police.units,
      this.props.getPickups(),
      this.police.getRoadblocks()
    );
    this.updatePopups(dt);

    const speedNorm = Math.min(1.4, this.player.speed / this.player.spec.maxSpeed);
    this.audio.updateContinuous(
      dt,
      speedNorm,
      this.player.isDrifting,
      this.player.isOverdrive,
      this.player.airborne,
      policeSummary.nearestDist
    );

    this.updateHUD();

    if (this.player.hp <= 0) {
      this.finishGame('hp');
    } else if (this.player.bustedProgress >= 1) {
      this.finishGame('busted');
    }
  }

  private loop(nowMs: number): void {
    const dt = Math.min(0.05, Math.max(0.001, (nowMs - this.lastFrameMs) / 1000));
    this.lastFrameMs = nowMs;
    this.time += dt;

    this.world.update(this.time);

    if (this.phase === 'title') {
      this.police.updateTitleAmbient(dt);
      this.camCtrl.updateTitle(dt, this.player.mesh.root.position);
    } else if (this.phase === 'playing' && !this.paused) {
      this.stepPlaying(dt);
    }

    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame((t) => this.loop(t));
  }
}
