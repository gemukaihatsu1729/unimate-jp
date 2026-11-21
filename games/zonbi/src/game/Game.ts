import * as THREE from 'three';
import {
  PERKS,
  SPECIAL_TURRET_IDS,
  TURRETS,
  ULTIMATES,
  WEAPONS,
  generateWave,
  type LoadoutConfig,
  type RunMods,
  type TurretId,
  type UltimateId,
  type WaveDefinition,
  type WeaponId,
  type ZombieKind
} from '../data';
import { AudioManager } from '../audio/AudioManager';
import { BattlefieldWorld } from '../world/BattlefieldBuilder';
import { EffectsManager } from '../fx/EffectsManager';
import { Hero, type HeroAttackEvent } from '../entities/Hero';
import { ZombieEntity } from '../entities/Zombie';
import { TurretManager } from '../entities/TurretManager';
import { TouchInputManager } from './TouchInputManager';
import { CameraController } from './CameraController';
import {
  buildLineShareUrl,
  buildShareText,
  buildXShareUrl,
  evaluateDefenseResult,
  getGameShareUrl
} from './ResultShare';

const STORAGE_KEY = 'shelter_musou_records_v1';
const REPAIR_COST = 65;
const HIT_SFX_TEXT = ['ズバッ!!', 'バッサリ!!', 'ドゴォ!!', '粉砕!!', '一掃!!', '撃破!!'];

interface Records {
  bestWave: number;
  bestKills: number;
  bestCombo: number;
}

interface PendingBlast {
  delay: number;
  x: number;
  z: number;
  radius: number;
  damage: number;
  color: number;
  big: boolean;
}

function loadRecords(): Records {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        bestWave: Number(p.bestWave) || 0,
        bestKills: Number(p.bestKills) || 0,
        bestCombo: Number(p.bestCombo) || 0
      };
    }
  } catch (_) {}
  return { bestWave: 0, bestKills: 0, bestCombo: 0 };
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
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();

  private audio = new AudioManager();
  private world: BattlefieldWorld;
  private fx: EffectsManager;
  private hero: Hero;
  private turrets: TurretManager;
  private camCtrl: CameraController;
  private input: TouchInputManager;

  private loadout: LoadoutConfig = {
    weaponId: 'greatsword',
    turretId: 'flame',
    ultimateId: 'cluster'
  };
  private records: Records = loadRecords();

  private phase: 'loadout' | 'playing' | 'gameover' = 'loadout';
  private paused = false;
  private perkOpen = false;
  private time = 0;

  // Musou & Tower Defense State
  private wave = 1;
  private waveDef: WaveDefinition | null = null;
  private waveQueue: ZombieKind[] = [];
  private spawnTimer = 0;
  private intermission = 0;
  private zombies: ZombieEntity[] = [];
  private pendingBlasts: PendingBlast[] = [];

  private scrap = 60;
  private kills = 0;
  private combo = 0;
  private maxCombo = 0;
  private comboTimer = 0;

  private shelterMaxHp = 500;
  private shelterHp = 500;
  private shelterAlertTimer = 0;

  private hitstopTimer = 0;
  private hitFlashTimer = 0;
  private musouFlashTimer = 0;
  private bannerTimer = 0;
  private hudSyncTimer = 0;

  private selectedPadIndex: number | null = null;
  private nearestPadIndex: number | null = null;

  private latestShareText = '';
  private latestShareUrl = '';
  private shareFeedbackTimer: number | null = null;

  private mods: RunMods = this.defaultMods();
  private lastTs = performance.now();

  // DOM Cache
  private el = {
    screenLoadout: document.getElementById('screen-loadout')!,
    screenGame: document.getElementById('screen-game')!,
    bestWaveText: document.getElementById('best-wave-text')!,
    stageWeaponChip: document.getElementById('stage-weapon-chip')!,
    selWeaponName: document.getElementById('sel-weapon-name')!,
    selTurretName: document.getElementById('sel-turret-name')!,
    selUltimateName: document.getElementById('sel-ultimate-name')!,
    gridWeapons: document.getElementById('grid-weapons')!,
    gridTurrets: document.getElementById('grid-turrets')!,
    gridUltimates: document.getElementById('grid-ultimates')!,
    equipBrief: document.getElementById('equip-brief')!,
    btnStartGame: document.getElementById('btn-start-game')!,

    hitFlash: document.getElementById('hit-flash')!,
    musouFlash: document.getElementById('musou-flash')!,
    fxPopups: document.getElementById('fx-popups')!,

    hudWave: document.getElementById('hud-wave')!,
    hudRemaining: document.getElementById('hud-remaining')!,
    hudScrap: document.getElementById('hud-scrap')!,
    hudKills: document.getElementById('hud-kills')!,
    hudShelterText: document.getElementById('hud-shelter-text')!,
    hudShelterFill: document.getElementById('hud-shelter-fill')!,
    hudHeroText: document.getElementById('hud-hero-text')!,
    hudHeroFill: document.getElementById('hud-hero-fill')!,

    bossBar: document.getElementById('boss-bar')!,
    bossName: document.getElementById('boss-name')!,
    bossHpText: document.getElementById('boss-hp-text')!,
    bossHpFill: document.getElementById('boss-hp-fill')!,
    shelterAlert: document.getElementById('shelter-alert')!,

    comboBox: document.getElementById('combo-box')!,
    comboNum: document.getElementById('combo-num')!,
    comboRank: document.getElementById('combo-rank')!,

    waveBanner: document.getElementById('wave-banner')!,
    wbSub: document.getElementById('wb-sub')!,
    wbTitle: document.getElementById('wb-title')!,
    wbMeta: document.getElementById('wb-meta')!,

    intermissionBar: document.getElementById('intermission-bar')!,
    intermissionText: document.getElementById('intermission-text')!,
    btnSkipWave: document.getElementById('btn-skip-wave')!,

    btnContextPad: document.getElementById('btn-context-pad')!,
    contextPadLabel: document.getElementById('context-pad-label')!,
    btnRepair: document.getElementById('btn-repair') as HTMLButtonElement,

    padSheet: document.getElementById('pad-sheet')!,
    padSheetTitle: document.getElementById('pad-sheet-title')!,
    padSheetBody: document.getElementById('pad-sheet-body')!,
    btnClosePad: document.getElementById('btn-close-pad')!,

    btnMusou: document.getElementById('btn-musou')!,
    musouFillBar: document.getElementById('musou-fill-bar')!,
    hudUltIcon: document.getElementById('hud-ult-icon')!,
    hudUltLabel: document.getElementById('hud-ult-label')!,
    hudMusouPct: document.getElementById('hud-musou-pct')!,
    hudAtkIcon: document.getElementById('hud-atk-icon')!,
    strongCdOverlay: document.getElementById('strong-cd-overlay')!,
    strongCdText: document.getElementById('strong-cd-text')!,
    dodgeCdOverlay: document.getElementById('dodge-cd-overlay')!,

    btnMute: document.getElementById('btn-mute')!,
    btnPause: document.getElementById('btn-pause')!,

    modalPerk: document.getElementById('modal-perk')!,
    perkList: document.getElementById('perk-list')!,
    modalPause: document.getElementById('modal-pause')!,
    pauseStats: document.getElementById('pause-stats')!,
    btnResume: document.getElementById('btn-resume')!,
    btnPauseRetry: document.getElementById('btn-pause-retry')!,
    btnPauseLoadout: document.getElementById('btn-pause-loadout')!,

    modalGameOver: document.getElementById('modal-gameover')!,
    gameoverReason: document.getElementById('gameover-reason')!,
    gameoverTitle: document.getElementById('gameover-title')!,
    resRankStamp: document.getElementById('res-rank-stamp')!,
    resComment: document.getElementById('res-comment')!,
    newRecordPill: document.getElementById('new-record-pill')!,
    resWave: document.getElementById('res-wave')!,
    resKills: document.getElementById('res-kills')!,
    resCombo: document.getElementById('res-combo')!,
    resLoadout: document.getElementById('res-loadout')!,
    btnShareX: document.getElementById('btn-share-x')!,
    btnShareLine: document.getElementById('btn-share-line')!,
    btnShareNative: document.getElementById('btn-share-native')!,
    shareFeedback: document.getElementById('share-feedback')!,
    btnRetrySame: document.getElementById('btn-retry-same')!,
    btnBackLoadout: document.getElementById('btn-back-loadout')!
  };

  constructor(canvas: HTMLCanvasElement) {
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
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 110);
    this.camCtrl = new CameraController(this.camera);

    this.world = new BattlefieldWorld(this.scene);
    this.fx = new EffectsManager(this.scene, 240);
    this.hero = new Hero(this.scene);
    this.turrets = new TurretManager(this.scene, this.world.padLocations);
    this.input = new TouchInputManager(() => this.audio.unlock());

    this.initLoadoutUI();
    this.bindUIEvents();
    this.enterLoadout();

    window.addEventListener('resize', () => this.handleResize());
    this.lastTs = performance.now();
    requestAnimationFrame(this.loop);
  }

  private defaultMods(): RunMods {
    return {
      heroDamage: 1,
      heroRange: 1,
      turretDamage: 1,
      turretRate: 1,
      musouGain: 1,
      scrapMult: 1
    };
  }

  private handleResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camCtrl.updateResponsiveFov(w, h);
  }

  // =========================================================
  // 1. LOADOUT SCREEN (LIVE 3D WEAPON PREVIEW!)
  // =========================================================
  private initLoadoutUI(): void {
    this.renderCards(this.el.gridWeapons, Object.values(WEAPONS), this.loadout.weaponId, (id) => {
      this.loadout.weaponId = id as WeaponId;
      this.hero.setWeapon(this.loadout.weaponId);
      this.hero.playLoadoutFlex();
      const w = WEAPONS[this.loadout.weaponId];
      this.fx.spawnSlashArc(this.hero.pos.x, 1.0, this.hero.pos.z, this.hero.yaw, 2.3, w.slashHex, Math.PI * 1.15);
      this.audio.playSlash(this.loadout.weaponId, 1);
      this.el.equipBrief.textContent = w.desc;
      this.syncLoadoutLabels();
    });

    const specialTurrets = SPECIAL_TURRET_IDS.map((id) => TURRETS[id]);
    this.renderCards(this.el.gridTurrets, specialTurrets, this.loadout.turretId, (id) => {
      this.loadout.turretId = id as LoadoutConfig['turretId'];
      this.audio.playTap();
      this.el.equipBrief.textContent = TURRETS[this.loadout.turretId].desc;
      this.syncLoadoutLabels();
    });

    this.renderCards(this.el.gridUltimates, Object.values(ULTIMATES), this.loadout.ultimateId, (id) => {
      this.loadout.ultimateId = id as UltimateId;
      this.audio.playTap();
      this.el.equipBrief.textContent = ULTIMATES[this.loadout.ultimateId].desc;
      this.syncLoadoutLabels();
    });

    this.syncLoadoutLabels();
  }

  private renderCards(
    container: HTMLElement,
    items: Array<{ id: string; icon: string; shortName: string; sub: string }>,
    initialId: string,
    onSelect: (id: string) => void
  ): void {
    container.innerHTML = '';
    for (const item of items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'eq-card' + (item.id === initialId ? ' selected' : '');
      btn.dataset.id = item.id;
      btn.innerHTML = `
        <span class="eq-icon">${item.icon}</span>
        <span class="eq-name">${item.shortName}</span>
        <span class="eq-sub">${item.sub}</span>
      `;
      btn.addEventListener('click', () => {
        this.audio.unlock();
        Array.from(container.children).forEach((c) => {
          c.classList.toggle('selected', (c as HTMLElement).dataset.id === item.id);
        });
        onSelect(item.id);
      });
      container.appendChild(btn);
    }
  }

  private syncLoadoutLabels(): void {
    const w = WEAPONS[this.loadout.weaponId];
    const t = TURRETS[this.loadout.turretId];
    const u = ULTIMATES[this.loadout.ultimateId];
    this.el.selWeaponName.textContent = w.name;
    this.el.selTurretName.textContent = t.name;
    this.el.selUltimateName.textContent = u.name;
    this.el.stageWeaponChip.textContent = `${w.icon} ${w.name} 装備中`;
    this.el.bestWaveText.textContent = this.records.bestWave > 0 ? `W${this.records.bestWave}` : '-';
  }

  private bindUIEvents(): void {
    this.el.btnStartGame.addEventListener('click', () => {
      this.audio.unlock();
      this.audio.playBuild();
      this.startBattle();
    });

    this.el.btnMute.addEventListener('click', () => {
      this.audio.unlock();
      const muted = this.audio.toggleMute();
      this.el.btnMute.textContent = muted ? '🔇' : '🔊';
    });

    this.el.btnPause.addEventListener('click', () => {
      if (this.phase !== 'playing' || this.perkOpen) return;
      this.audio.playTap();
      this.paused = true;
      this.input.reset();
      this.el.pauseStats.innerHTML = `
        <span>WAVE <b>${this.wave}</b></span>
        <span>撃破 <b>${this.kills}体</b></span>
        <span>最大COMBO <b>${this.maxCombo}</b></span>
      `;
      this.el.modalPause.classList.remove('hidden');
    });

    this.el.btnResume.addEventListener('click', () => {
      this.audio.playTap();
      this.paused = false;
      this.el.modalPause.classList.add('hidden');
      this.lastTs = performance.now();
    });

    this.el.btnPauseRetry.addEventListener('click', () => {
      this.audio.playBuild();
      this.paused = false;
      this.el.modalPause.classList.add('hidden');
      this.startBattle();
    });

    this.el.btnPauseLoadout.addEventListener('click', () => {
      this.audio.playTap();
      this.enterLoadout();
    });

    this.el.btnRetrySame.addEventListener('click', () => {
      this.audio.unlock();
      this.audio.playBuild();
      this.startBattle();
    });

    this.el.btnBackLoadout.addEventListener('click', () => {
      this.audio.playTap();
      this.enterLoadout();
    });

    this.el.btnShareX.addEventListener('click', () => {
      this.audio.playTap();
      if (!this.latestShareText) return;
      window.open(buildXShareUrl(this.latestShareText, this.latestShareUrl), '_blank', 'noopener,noreferrer');
    });

    this.el.btnShareLine.addEventListener('click', () => {
      this.audio.playTap();
      if (!this.latestShareText) return;
      window.open(buildLineShareUrl(this.latestShareText, this.latestShareUrl), '_blank', 'noopener,noreferrer');
    });

    this.el.btnShareNative.addEventListener('click', () => {
      this.audio.playTap();
      void this.handleNativeOrCopyShare();
    });

    this.el.btnClosePad.addEventListener('click', () => {
      this.audio.playTap();
      this.closePadSheet();
    });

    this.el.btnContextPad.addEventListener('click', () => {
      this.audio.unlock();
      if (this.nearestPadIndex !== null) {
        this.audio.playTap();
        this.openPadSheet(this.nearestPadIndex);
      }
    });

    this.el.btnRepair.addEventListener('click', () => {
      this.audio.unlock();
      this.repairShelter();
    });

    this.el.btnSkipWave.addEventListener('click', () => {
      this.audio.unlock();
      if (this.intermission > 0) {
        this.scrap += 20;
        this.spawnComicPopup('+20⚙️ 早期出撃!', '#fde047', 50, 32, 20);
        this.audio.playBuild();
        this.intermission = 0;
        this.el.intermissionBar.classList.add('hidden');
        this.beginWave(this.wave + 1);
      }
    });
  }

  // =========================================================
  // 2. RUN LIFECYCLE
  // =========================================================
  private enterLoadout(): void {
    this.phase = 'loadout';
    this.paused = false;
    this.perkOpen = false;
    this.clearZombies();
    this.turrets.resetAll();
    this.fx.clear();
    this.pendingBlasts = [];
    this.closePadSheet();
    this.input.reset();

    this.hero.setWeapon(this.loadout.weaponId);
    this.hero.resetForTitle();
    this.world.setBattleView(false);

    this.el.modalGameOver.classList.add('hidden');
    this.el.modalPause.classList.add('hidden');
    this.el.modalPerk.classList.add('hidden');
    this.el.screenGame.classList.remove('active');
    this.el.screenLoadout.classList.add('active');
    this.syncLoadoutLabels();
  }

  private startBattle(): void {
    this.phase = 'playing';
    this.paused = false;
    this.perkOpen = false;
    this.clearZombies();
    this.turrets.resetAll();
    this.fx.clear();
    this.pendingBlasts = [];
    this.closePadSheet();
    this.input.reset();

    this.mods = this.defaultMods();
    this.wave = 1;
    this.kills = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.comboTimer = 0;
    this.scrap = 60;
    this.shelterMaxHp = 500;
    this.shelterHp = 500;
    this.shelterAlertTimer = 0;
    this.intermission = 0;
    this.hitstopTimer = 0;

    this.hero.resetForBattle(this.loadout.weaponId);
    this.camCtrl.resetForBattle();
    this.world.setBattleView(true);

    const w = WEAPONS[this.loadout.weaponId];
    const u = ULTIMATES[this.loadout.ultimateId];
    this.el.hudAtkIcon.textContent = w.icon;
    this.el.hudUltIcon.textContent = u.icon;
    this.el.hudUltLabel.textContent = u.shortName;

    this.el.modalGameOver.classList.add('hidden');
    this.el.modalPause.classList.add('hidden');
    this.el.modalPerk.classList.add('hidden');
    this.el.intermissionBar.classList.add('hidden');
    this.el.shelterAlert.classList.add('hidden');
    this.el.comboBox.classList.add('hidden');
    this.el.screenLoadout.classList.remove('active');
    this.el.screenGame.classList.add('active');

    this.beginWave(1);
    this.syncHUD();
    this.lastTs = performance.now();
  }

  private clearZombies(): void {
    for (const z of this.zombies) z.dispose(this.scene);
    this.zombies = [];
  }

  // =========================================================
  // 3. ENDLESS WAVE SYSTEM
  // =========================================================
  private beginWave(waveNum: number): void {
    this.wave = waveNum;
    this.waveDef = generateWave(waveNum);
    this.waveQueue = this.waveDef.queue.slice();
    this.spawnTimer = 0.4;

    this.audio.playWaveStart(this.waveDef.isBossWave);
    this.el.wbSub.textContent = this.waveDef.isBossWave ? '⚠️ WARNING: TITAN BOSS' : 'INCOMING HORDE';
    this.el.wbTitle.textContent = `WAVE ${waveNum}`;
    this.el.wbMeta.textContent = this.waveDef.isBossWave
      ? `ゾンビ大群 ${this.waveDef.totalZombies}体 ＋ ボス襲来！`
      : `ゾンビ ${this.waveDef.totalZombies}体 接近中！`;
    this.el.waveBanner.classList.toggle('boss', this.waveDef.isBossWave);
    this.el.waveBanner.classList.remove('hidden');
    this.bannerTimer = 2.4;
    this.syncHUD();
  }

  private onWaveCleared(): void {
    const bonus = this.waveDef?.clearBonus ?? 40;
    this.scrap += bonus;
    this.audio.playBuild();
    this.spawnComicPopup(`WAVE ${this.wave} 制圧!! +${bonus}⚙️`, '#4ade80', 50, 34, 22);

    if (this.wave > this.records.bestWave) this.records.bestWave = this.wave;
    if (this.kills > this.records.bestKills) this.records.bestKills = this.kills;
    if (this.maxCombo > this.records.bestCombo) this.records.bestCombo = this.maxCombo;
    saveRecords(this.records);

    if (this.wave % 3 === 0) {
      this.openPerkModal();
    } else {
      this.startIntermission();
    }
  }

  private startIntermission(): void {
    this.intermission = 4.5;
    this.el.intermissionBar.classList.remove('hidden');
    this.el.intermissionText.textContent = `次のウェーブまで ${Math.ceil(this.intermission)}秒`;
  }

  private openPerkModal(): void {
    this.perkOpen = true;
    this.closePadSheet();
    this.input.reset();

    const pool = PERKS.slice();
    const picks = [];
    while (picks.length < 3 && pool.length > 0) {
      picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }

    this.el.perkList.innerHTML = '';
    for (const perk of picks) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'perk-card';
      btn.innerHTML = `
        <span class="perk-ico">${perk.icon}</span>
        <div>
          <span class="perk-t">${perk.title}</span>
          <span class="perk-d">${perk.desc}</span>
        </div>
      `;
      btn.addEventListener('click', () => {
        this.audio.playBuild();
        perk.apply(this.mods, {
          boostShelter: (addMax, heal) => {
            this.shelterMaxHp += addMax;
            this.shelterHp = Math.min(this.shelterMaxHp, this.shelterHp + heal);
            this.hero.hp = this.hero.maxHp;
          },
          giveScrap: (n) => { this.scrap += n; },
          fillMusou: () => { this.hero.musouGauge = 100; }
        });
        this.el.modalPerk.classList.add('hidden');
        this.perkOpen = false;
        this.spawnComicPopup(`${perk.icon} ${perk.title}!`, '#fde047', 50, 38, 22);
        this.startIntermission();
        this.syncHUD();
        this.lastTs = performance.now();
      });
      this.el.perkList.appendChild(btn);
    }
    this.el.modalPerk.classList.remove('hidden');
  }

  private triggerGameOver(reason: 'shelter' | 'hero'): void {
    this.phase = 'gameover';
    this.closePadSheet();
    this.input.reset();
    this.audio.playGameOver();

    const isNew = this.wave > this.records.bestWave;
    if (isNew) this.records.bestWave = this.wave;
    if (this.kills > this.records.bestKills) this.records.bestKills = this.kills;
    if (this.maxCombo > this.records.bestCombo) this.records.bestCombo = this.maxCombo;
    saveRecords(this.records);

    const shareInput = {
      wave: this.wave,
      kills: this.kills,
      maxCombo: this.maxCombo,
      reason,
      isNewRecord: isNew,
      loadout: this.loadout
    };
    const evalRes = evaluateDefenseResult(shareInput);

    this.el.gameoverReason.textContent = reason === 'shelter' ? 'SHELTER BREACHED' : 'HERO FALLEN';
    this.el.gameoverTitle.textContent = evalRes.headline;
    this.el.resRankStamp.textContent = evalRes.rank;
    this.el.resRankStamp.className = `rank-stamp rank-${evalRes.rank}`;
    this.el.resComment.textContent = evalRes.comment;
    this.el.newRecordPill.classList.toggle('hidden', !isNew);
    this.el.resWave.textContent = String(this.wave);
    this.el.resKills.textContent = String(this.kills);
    this.el.resCombo.textContent = String(this.maxCombo);

    const w = WEAPONS[this.loadout.weaponId];
    const t = TURRETS[this.loadout.turretId];
    const u = ULTIMATES[this.loadout.ultimateId];
    this.el.resLoadout.textContent = `${w.icon}${w.shortName} ／ ${t.icon}${t.shortName} ／ ${u.icon}${u.shortName}`;

    this.latestShareUrl = getGameShareUrl();
    this.latestShareText = buildShareText(shareInput);
    this.el.shareFeedback.textContent = '';

    this.el.modalGameOver.classList.remove('hidden');
  }

  private async handleNativeOrCopyShare(): Promise<void> {
    if (!this.latestShareText) return;
    const fullText = `${this.latestShareText}\n${this.latestShareUrl}`;

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'SHELTER MUSOU — 3Dゾンビ無双防衛',
          text: this.latestShareText,
          url: this.latestShareUrl
        });
        this.showShareFeedback('✨ 結果をシェアしました！');
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(fullText);
      this.showShareFeedback('📋 結果テキストとURLをコピーしました！');
    } catch {
      this.showShareFeedback('URL: ' + this.latestShareUrl);
    }
  }

  private showShareFeedback(message: string): void {
    this.el.shareFeedback.textContent = message;
    if (this.shareFeedbackTimer !== null) clearTimeout(this.shareFeedbackTimer);
    this.shareFeedbackTimer = window.setTimeout(() => {
      this.el.shareFeedback.textContent = '';
    }, 3200);
  }

  // =========================================================
  // 4. TOWER DEFENSE TURRET SHEET & REPAIR
  // =========================================================
  private openPadSheet(padIdx: number): void {
    this.selectedPadIndex = padIdx;
    this.turrets.setSelectedPad(padIdx, this.loadout.turretId);
    this.renderPadSheet();
    this.el.padSheet.classList.remove('hidden');
  }

  private closePadSheet(): void {
    this.selectedPadIndex = null;
    this.turrets.setSelectedPad(null, this.loadout.turretId);
    this.el.padSheet.classList.add('hidden');
  }

  private renderPadSheet(): void {
    if (this.selectedPadIndex === null) return;
    const pad = this.turrets.pads[this.selectedPadIndex];
    if (!pad) return;

    if (!pad.turret) {
      const sentry = TURRETS.sentry;
      const spec = TURRETS[this.loadout.turretId];
      this.el.padSheetTitle.textContent = `防衛拠点 #${pad.index + 1} — タレット設置`;
      this.el.padSheetBody.innerHTML = `
        <div class="pad-grid">
          <button type="button" class="pad-btn" data-build="sentry" ${this.scrap < sentry.cost ? 'disabled' : ''}>
            <div class="pad-btn-top"><span>${sentry.icon} ${sentry.name}</span><span class="pad-cost">${sentry.cost}⚙️</span></div>
            <div class="pad-desc">${sentry.sub}</div>
          </button>
          <button type="button" class="pad-btn primary" data-build="${spec.id}" ${this.scrap < spec.cost ? 'disabled' : ''}>
            <div class="pad-btn-top"><span>${spec.icon} ${spec.name}</span><span class="pad-cost">${spec.cost}⚙️</span></div>
            <div class="pad-desc">${spec.sub}</div>
          </button>
        </div>
      `;
      this.el.padSheetBody.querySelectorAll<HTMLButtonElement>('[data-build]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const tid = btn.dataset.build as TurretId;
          const cost = TURRETS[tid].cost;
          if (this.scrap >= cost) {
            this.scrap -= cost;
            this.turrets.buildTurret(pad.index, tid);
            this.audio.playBuild();
            this.fx.spawnHitSparks(pad.x, 1.0, pad.z, TURRETS[tid].accent, 16);
            this.spawnComicPopup(`${TURRETS[tid].icon} 設置完了!`, '#fde047', 50, 44, 20);
            this.closePadSheet();
            this.syncHUD();
          }
        });
      });
    } else {
      const tr = pad.turret;
      const spec = TURRETS[tr.typeId];
      const st = spec.levels[tr.level - 1];
      const isMax = tr.level >= 3;
      const upCost = isMax ? 0 : spec.upgradeCosts[tr.level - 1];
      const refund = Math.round(tr.totalInvested * 0.7);

      this.el.padSheetTitle.textContent = `${spec.icon} ${spec.name} Lv.${tr.level}${isMax ? ' MAX' : ''}`;
      this.el.padSheetBody.innerHTML = `
        <div class="pad-stats">
          <span>攻撃力 <b>${Math.round(st.damage * this.mods.turretDamage)}</b></span>
          <span>連射 <b>${(st.fireRate * this.mods.turretRate).toFixed(1)}/s</b></span>
          <span>射程 <b>${st.range}m</b></span>
        </div>
        <div class="pad-grid">
          <button type="button" class="pad-btn primary" id="pad-up-btn" ${isMax || this.scrap < upCost ? 'disabled' : ''}>
            <div class="pad-btn-top"><span>${isMax ? '★ 最大強化' : `⬆ Lv.${tr.level + 1} 強化`}</span><span class="pad-cost">${isMax ? 'MAX' : `${upCost}⚙️`}</span></div>
            <div class="pad-desc">${isMax ? '最大レベル達成' : '火力＆射程を強化'}</div>
          </button>
          <button type="button" class="pad-btn danger" id="pad-sell-btn">
            <div class="pad-btn-top"><span>♻️ 解体</span><span class="pad-cost">+${refund}⚙️</span></div>
            <div class="pad-desc">スクラップを回収</div>
          </button>
        </div>
      `;

      const upBtn = this.el.padSheetBody.querySelector('#pad-up-btn');
      upBtn?.addEventListener('click', () => {
        if (!isMax && this.scrap >= upCost) {
          this.scrap -= upCost;
          this.turrets.upgradeTurret(pad.index, upCost);
          this.audio.playBuild();
          this.fx.spawnHitSparks(pad.x, 1.4, pad.z, 0xfde047, 18);
          this.spawnComicPopup(`Lv.${tr.level} UP!!`, '#fde047', 50, 44, 21);
          this.closePadSheet();
          this.syncHUD();
        }
      });

      const sellBtn = this.el.padSheetBody.querySelector('#pad-sell-btn');
      sellBtn?.addEventListener('click', () => {
        this.scrap += refund;
        this.turrets.removeTurret(pad.index);
        this.audio.playTap();
        this.closePadSheet();
        this.syncHUD();
      });
    }
  }

  private repairShelter(): void {
    if (this.phase !== 'playing' || this.paused || this.perkOpen) return;
    if (this.scrap < REPAIR_COST || (this.shelterHp >= this.shelterMaxHp && this.hero.hp >= this.hero.maxHp)) return;
    this.scrap -= REPAIR_COST;
    const heal = Math.round(this.shelterMaxHp * 0.22);
    this.shelterHp = Math.min(this.shelterMaxHp, this.shelterHp + heal);
    this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + Math.round(this.hero.maxHp * 0.25));
    this.audio.playBuild();
    this.fx.spawnHealBurst(0, this.world.southWallZ - 0.5);
    this.spawnComicPopup(`🛡️ +${heal} 避難所修理!`, '#4ade80', 50, 42, 20);
    this.syncHUD();
  }

  // =========================================================
  // 5. MUSOU COMBAT & ULTIMATES
  // =========================================================
  private resolveHeroAttack(ev: HeroAttackEvent): void {
    const w = WEAPONS[ev.weaponId];
    if (ev.type === 'strong') {
      this.audio.playStrong(ev.weaponId);
      this.camCtrl.addShake(0.32);
      if (w.strongStyle === 'whirlwind') {
        this.fx.spawnSlashArc(ev.x, 1.05, ev.z, ev.yaw, ev.range, 0xff6d00, Math.PI * 2, 0.08, 1);
        this.fx.spawnShockwave(ev.x, ev.z, ev.range, 0xf97316, 0.42);
      } else if (w.strongStyle === 'dash_flurry') {
        this.fx.spawnSlashArc(ev.x, 1.0, ev.z, ev.yaw, ev.range, 0xff2a6d, Math.PI * 1.85, 0.25, 1);
        this.fx.spawnSlashArc(ev.x, 1.25, ev.z, ev.yaw + 0.5, ev.range * 0.92, 0xf472b6, Math.PI * 1.85, -0.25, -1);
      } else {
        this.fx.spawnExplosion(ev.x, 0.4, ev.z, ev.range, 0x38bdf8);
        for (let i = 0; i < 4; i++) {
          const a = (Math.PI / 2) * i + Math.random() * 0.5;
          this.fx.spawnLightning(ev.x, 1.2, ev.z, ev.x + Math.cos(a) * ev.range, 0.3, ev.z + Math.sin(a) * ev.range, 0x7dd3fc);
        }
      }
    } else {
      this.audio.playSlash(ev.weaponId, ev.comboStep);
      const tilt = ev.comboStep === 0 ? 0.14 : ev.comboStep === 1 ? -0.18 : ev.comboStep === 2 ? 0.06 : 0;
      const spin = ev.comboStep % 2 === 0 ? 1 : -1;
      const arc = ev.fullCircle ? Math.PI * 1.95 : ev.arcHalfAngle * 2;
      this.fx.spawnSlashArc(ev.x, 1.0, ev.z, ev.yaw, ev.range, w.slashHex, arc, tilt, spin);
      if (ev.fullCircle) {
        this.fx.spawnShockwave(ev.x, ev.z, ev.range, w.slashHex, 0.3);
      }
    }

    // Cleave ALL zombies inside the 3D Musou slash cone/circle!
    const fxDir = Math.sin(ev.yaw);
    const fzDir = Math.cos(ev.yaw);
    const cosLimit = ev.fullCircle ? -1.1 : Math.cos(ev.arcHalfAngle);
    let hitCount = 0;

    for (const z of this.zombies) {
      if (z.dead) continue;
      const vx = z.pos.x - ev.x;
      const vz = z.pos.z - ev.z;
      const d = Math.hypot(vx, vz);
      if (d > ev.range + z.spec.radius) continue;

      if (!ev.fullCircle && d > 0.35) {
        const dot = (vx / d) * fxDir + (vz / d) * fzDir;
        if (dot < cosLimit) continue;
      }

      hitCount++;
      const nx = d > 0.05 ? vx / d : fxDir;
      const nz = d > 0.05 ? vz / d : fzDir;

      if (ev.burn) {
        z.burnTimer = Math.max(z.burnTimer, 2.8);
        z.burnDps = Math.max(z.burnDps, 20 * this.mods.heroDamage);
      }
      if (ev.stun) {
        z.freezeTimer = Math.max(z.freezeTimer, z.spec.isBoss ? 0.45 : 1.25);
      }

      this.damageZombie(z, ev.damage, w.slashHex, ev.knockback, nx, nz, ev.lift, true);
    }

    if (hitCount > 0) {
      this.audio.playHit(hitCount);
      if (ev.type === 'strong' || ev.fullCircle || hitCount >= 4) {
        this.hitstopTimer = Math.min(0.055, 0.022 + hitCount * 0.005);
        this.camCtrl.addShake(Math.min(0.45, 0.14 + hitCount * 0.04));
        const text = hitCount >= 7
          ? `一掃!! ×${hitCount}`
          : HIT_SFX_TEXT[Math.floor(Math.random() * HIT_SFX_TEXT.length)];
        this.spawnComicPopup(
          text,
          ev.type === 'strong' ? '#fde047' : '#fb923c',
          44 + Math.random() * 14,
          40 + Math.random() * 12,
          hitCount >= 5 ? 25 : 20
        );
      }
    }
  }

  private triggerMusouUltimate(): void {
    if (this.hero.musouGauge < 100) return;
    this.hero.musouGauge = 0;
    this.hero.invulnTimer = 1.6;
    this.audio.playMusou();
    this.camCtrl.triggerMusouZoom();
    this.camCtrl.addShake(0.65);
    this.musouFlashTimer = 0.35;

    const u = ULTIMATES[this.loadout.ultimateId];
    this.spawnComicPopup(`⚡ ${u.name}!!`, '#fde047', 50, 35, 28);

    const baseDmg = (240 + this.wave * 28) * this.mods.heroDamage;

    if (u.id === 'cluster') {
      // Carpet-bombing cluster explosions centered on hero + across incoming zombie clusters!
      this.explodeWorld(this.hero.pos.x, this.hero.pos.z, 8.5, baseDmg, 0xf97316, true);
      for (let i = 0; i < 6; i++) {
        const ang = (Math.PI * 2 * i) / 6;
        const bx = THREE.MathUtils.clamp(this.hero.pos.x + Math.cos(ang) * 6.0, -8.5, 8.5);
        const bz = THREE.MathUtils.clamp(this.hero.pos.z + Math.sin(ang) * 6.5 - 2.5, -16, 9.5);
        this.pendingBlasts.push({
          delay: 0.12 + i * 0.085,
          x: bx,
          z: bz,
          radius: 5.8,
          damage: baseDmg * 0.72,
          color: i % 2 === 0 ? 0xfde047 : 0xf97316,
          big: true
        });
      }
    } else if (u.id === 'blizzard') {
      // Absolute Zero Nova: freezes & shatters EVERY zombie on the battlefield!
      this.fx.spawnFrostBurst(this.hero.pos.x, this.hero.pos.z, 17);
      this.fx.spawnFrostBurst(0, -4, 15);
      for (const z of this.zombies) {
        if (z.dead) continue;
        z.freezeTimer = Math.max(z.freezeTimer, z.spec.isBoss ? 2.4 : 4.6);
        z.slowTimer = Math.max(z.slowTimer, 7.5);
        z.slowRatio = 0.4;
        this.damageZombie(z, baseDmg * 0.85, 0x38bdf8, 6.0, 0, -1, 4.5, true);
      }
    } else {
      // Aegis Sanctuary Wave: huge Shelter + Hero heal + massive golden knockback shockwave!
      const shelterHeal = Math.round(this.shelterMaxHp * 0.38);
      this.shelterHp = Math.min(this.shelterMaxHp, this.shelterHp + shelterHeal);
      this.hero.hp = this.hero.maxHp;
      this.fx.spawnHealBurst(0, this.world.southWallZ - 1);
      this.fx.spawnShockwave(this.hero.pos.x, this.hero.pos.z, 15, 0xfde047, 0.65);
      this.spawnComicPopup(`🛡️ 避難所 +${shelterHeal} 回復!!`, '#4ade80', 50, 46, 22);
      for (const z of this.zombies) {
        if (z.dead) continue;
        const dx = z.pos.x - this.hero.pos.x;
        const dz = z.pos.z - this.hero.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        this.damageZombie(z, baseDmg * 0.9, 0xfde047, 16.0, dx / d, -1.0, 7.8, true);
      }
    }

    this.syncHUD();
  }

  private explodeWorld(x: number, z: number, radius: number, damage: number, color: number, big: boolean): void {
    this.audio.playExplosion(big);
    this.camCtrl.addShake(big ? 0.5 : 0.25);
    this.fx.spawnExplosion(x, 0.5, z, radius, color);
    for (const zb of this.zombies) {
      if (zb.dead) continue;
      const d = Math.hypot(zb.pos.x - x, zb.pos.z - z);
      if (d <= radius + zb.spec.radius) {
        const nx = d > 0.05 ? (zb.pos.x - x) / d : 0;
        const nz = d > 0.05 ? (zb.pos.z - z) / d : -1;
        const falloff = 1 - (d / (radius + zb.spec.radius)) * 0.32;
        this.damageZombie(zb, damage * falloff, color, big ? 13.5 : 8.5, nx, nz, big ? 7.2 : 4.5, true);
      }
    }
  }

  private damageZombie(
    z: ZombieEntity,
    amount: number,
    sparkColor: number,
    knockForce = 0,
    kx = 0,
    kz = -1,
    lift = 2.6,
    fromHero = false
  ): void {
    if (z.dead) return;
    z.hp -= amount;
    z.hitFlash = 0.09;

    if (knockForce > 0) {
      z.applyKnockback(kx, kz, knockForce, lift);
    }

    if (fromHero) {
      this.addCombo(1);
      this.hero.addMusou(0.55 * this.mods.musouGain);
    }

    if (Math.random() < 0.7) {
      this.fx.spawnHitSparks(z.pos.x, 1.0, z.pos.z, sparkColor, fromHero ? 6 : 3);
    }

    if (z.hp <= 0) {
      z.dead = true;
      this.kills += 1;
      const reward = Math.max(1, Math.round(z.spec.scrap * this.mods.scrapMult));
      this.scrap += reward;
      this.hero.addMusou((z.spec.isBoss ? 18 : 1.1) * this.mods.musouGain);

      this.fx.spawnHitSparks(z.pos.x, 0.9, z.pos.z, z.spec.skinColor, z.spec.isBoss ? 28 : 9);

      if (z.spec.isBoss) {
        this.audio.playExplosion(true);
        this.camCtrl.addShake(0.65);
        this.fx.spawnExplosion(z.pos.x, 1.0, z.pos.z, 6.5, 0xfde047);
        this.spawnComicPopup(`👑 BOSS撃破!! +${reward}⚙️`, '#fde047', 50, 32, 26);
      } else if (z.spec.explodes) {
        // Slaying a Bomber triggers an explosion that hurts surrounding zombies AND careless nearby heroes!
        this.explodeWorld(z.pos.x, z.pos.z, 3.8, 75 * (this.waveDef?.hpMult ?? 1), 0xf97316, false);
        const heroDist = Math.hypot(this.hero.pos.x - z.pos.x, this.hero.pos.z - z.pos.z);
        if (heroDist <= 3.2) {
          const selfBlast = Math.round(22 * (this.waveDef?.dmgMult ?? 1));
          if (this.hero.takeDamage(selfBlast)) {
            this.hitFlashTimer = 0.65;
            this.camCtrl.addShake(0.32);
          }
        }
      }
    }
  }

  private addCombo(n: number): void {
    this.combo += n;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    this.comboTimer = 3.2;
    this.el.comboBox.classList.remove('hidden', 'pop');
    void this.el.comboBox.offsetWidth;
    this.el.comboBox.classList.add('pop');
    this.el.comboNum.textContent = String(this.combo);
    this.el.comboRank.textContent =
      this.combo >= 80 ? 'GODLIKE無双!!' :
      this.combo >= 40 ? '超無双FEVER!' :
      this.combo >= 15 ? 'MUSOU RUSH' : 'COMBO';
  }

  private spawnComicPopup(text: string, color: string, pctX: number, pctY: number, sizePx: number): void {
    if (this.el.fxPopups.childElementCount > 10) {
      this.el.fxPopups.firstElementChild?.remove();
    }
    const el = document.createElement('div');
    el.className = 'comic-pop';
    el.textContent = text;
    el.style.color = color;
    el.style.left = `${pctX}%`;
    el.style.top = `${pctY}%`;
    el.style.fontSize = `${sizePx}px`;
    this.el.fxPopups.appendChild(el);
    setTimeout(() => el.remove(), 730);
  }

  // =========================================================
  // 6. MAIN GAME LOOP
  // =========================================================
  private loop = (ts: number): void => {
    requestAnimationFrame(this.loop);

    const rawDt = Math.min(0.05, Math.max(0.001, (ts - this.lastTs) / 1000));
    this.lastTs = ts;
    this.time += rawDt;

    if (this.phase === 'loadout') {
      this.hero.updateTitle(rawDt, this.time);
      this.world.update(rawDt, 1, this.time);
      this.fx.update(rawDt);
      this.camCtrl.updateTitle(rawDt, this.hero.pos);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (this.phase === 'playing' && !this.paused && !this.perkOpen) {
      if (this.hitstopTimer > 0) {
        this.hitstopTimer = Math.max(0, this.hitstopTimer - rawDt);
      } else {
        const padSlow = this.selectedPadIndex !== null ? 0.2 : 1.0;
        this.updatePlaying(rawDt * padSlow, rawDt);
      }
    }

    this.renderer.render(this.scene, this.camera);
  };

  private updatePlaying(dt: number, rawDt: number): void {
    const touch = this.input.consume();

    // Camera swipe yaw
    if (Math.abs(touch.cameraDeltaYaw) > 0.0001) {
      this.camCtrl.addYaw(touch.cameraDeltaYaw);
    }

    // Direct 3D Tap Raycast on Turret Pads
    if (touch.tapScreenPos) {
      this.handleScreenTap(touch.tapScreenPos.x, touch.tapScreenPos.y);
    }

    // Flash & Banner timers
    if (this.bannerTimer > 0) {
      this.bannerTimer -= rawDt;
      if (this.bannerTimer <= 0) this.el.waveBanner.classList.add('hidden');
    }
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer = Math.max(0, this.hitFlashTimer - rawDt * 2.5);
      this.el.hitFlash.style.opacity = this.hitFlashTimer.toFixed(2);
    }
    if (this.musouFlashTimer > 0) {
      this.musouFlashTimer = Math.max(0, this.musouFlashTimer - rawDt * 2.2);
      this.el.musouFlash.style.opacity = this.musouFlashTimer.toFixed(2);
    }
    if (this.shelterAlertTimer > 0) {
      this.shelterAlertTimer = Math.max(0, this.shelterAlertTimer - rawDt);
      if (this.shelterAlertTimer <= 0) this.el.shelterAlert.classList.add('hidden');
    }

    // Combo decay
    if (this.combo > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 0;
        this.el.comboBox.classList.add('hidden');
      }
    }

    // Musou Ultimate activation
    if (touch.musouPressed && this.hero.musouGauge >= 100) {
      this.triggerMusouUltimate();
    }

    // Pending cluster ultimate sub-explosions
    for (let i = this.pendingBlasts.length - 1; i >= 0; i--) {
      const pb = this.pendingBlasts[i];
      pb.delay -= dt;
      if (pb.delay <= 0) {
        this.pendingBlasts.splice(i, 1);
        this.explodeWorld(pb.x, pb.z, pb.radius, pb.damage, pb.color, pb.big);
      }
    }

    // Wave Spawner / Intermission
    if (this.intermission > 0) {
      this.intermission -= dt;
      this.el.intermissionText.textContent = `次のウェーブまで ${Math.max(1, Math.ceil(this.intermission))}秒`;
      if (this.intermission <= 0) {
        this.intermission = 0;
        this.el.intermissionBar.classList.add('hidden');
        this.beginWave(this.wave + 1);
      }
    } else if (this.waveQueue.length > 0 && this.waveDef) {
      this.spawnTimer -= dt;
      // High-pressure multi-spawn horde cap (76 active 3D zombies at once!)
      if (this.spawnTimer <= 0 && this.zombies.length < 76) {
        const maxBurst = Math.min(3, 1 + Math.floor((this.wave + 1) / 3));
        const burst = Math.min(this.waveQueue.length, 76 - this.zombies.length, 1 + Math.floor(Math.random() * maxBurst));
        for (let b = 0; b < burst; b++) {
          const kind = this.waveQueue.shift()!;
          const sx = (Math.random() - 0.5) * 14.8;
          const sz = this.world.northSpawnZ - Math.random() * 2.2;
          this.zombies.push(
            new ZombieEntity(
              this.scene,
              kind,
              sx,
              sz,
              this.waveDef.hpMult,
              this.waveDef.speedMult,
              this.waveDef.dmgMult
            )
          );
        }
        this.spawnTimer = this.waveDef.spawnInterval * (0.65 + Math.random() * 0.55);
      }
    } else if (this.zombies.length === 0) {
      this.onWaveCleared();
    }

    // Find nearest zombie for Musou soft-magnet targeting
    let nearestPos: THREE.Vector3 | null = null;
    let nearestD = Infinity;
    for (const z of this.zombies) {
      if (z.dead) continue;
      const d = Math.hypot(z.pos.x - this.hero.pos.x, z.pos.z - this.hero.pos.z);
      if (d < nearestD) {
        nearestD = d;
        nearestPos = z.pos;
      }
    }

    // Hero Update & Attack Resolution
    const heroRes = this.hero.updateBattle(
      dt,
      this.time,
      {
        moveX: touch.moveX,
        moveY: touch.moveY,
        attackHeld: touch.attackHeld,
        attackPressed: touch.attackPressed,
        strongPressed: touch.strongPressed,
        dodgePressed: touch.dodgePressed
      },
      this.camCtrl.getForwardXZ(),
      this.camCtrl.getRightXZ(),
      nearestPos,
      this.mods,
      this.world.arenaHalfW,
      this.world.southWallZ
    );

    if (heroRes.dodged) {
      this.audio.playDodge();
      this.fx.spawnHitSparks(this.hero.pos.x, 0.6, this.hero.pos.z, 0x7dd3fc, 8);
    }
    if (heroRes.attackEvent) {
      this.resolveHeroAttack(heroRes.attackEvent);
    }

    // Check nearest defense pad for quick 1-tap build button!
    const nearPad = this.turrets.findNearestPad(this.hero.pos.x, this.hero.pos.z, 3.6);
    this.nearestPadIndex = nearPad ? nearPad.index : null;
    if (nearPad) {
      this.el.btnContextPad.classList.remove('hidden');
      this.el.contextPadLabel.textContent = nearPad.turret
        ? `強化 Lv.${nearPad.turret.level}`
        : `砲塔設置 #${nearPad.index + 1}`;
    } else {
      this.el.btnContextPad.classList.add('hidden');
    }

    // Turrets Update
    this.turrets.update(
      dt,
      this.time,
      this.scrap,
      this.selectedPadIndex,
      this.zombies,
      this.mods,
      this.fx,
      this.audio,
      (z, dmg, col, kb, kx, kz) => this.damageZombie(z, dmg, col, kb ?? 0, kx ?? 0, kz ?? -1, 2.2, false)
    );

    // Zombies Update + Light Flocking Separation
    this.separateZombies(dt);
    for (const z of this.zombies) {
      if (z.dead) continue;
      const hit = z.update(
        dt,
        this.hero.pos,
        this.hero.radius,
        this.world.southWallZ,
        this.world.arenaHalfW,
        this.camera.quaternion,
        (burnDmg) => this.damageZombie(z, burnDmg, 0xf97316, 0, 0, 0, 0, false)
      );
      if (hit) {
        if (hit.target === 'shelter') {
          this.damageShelter(hit.damage, hit.x, hit.z, !!hit.isExplosion);
        } else {
          if (hit.isExplosion) {
            this.audio.playExplosion(false);
            this.fx.spawnExplosion(hit.x, 0.6, hit.z, 3.6, 0xf97316);
            this.camCtrl.addShake(0.42);
            if (hit.z >= this.world.southWallZ - 3.6) {
              this.damageShelter(hit.damage * 0.75, hit.x, hit.z, true);
            }
          }
          if (this.hero.takeDamage(hit.damage)) {
            this.hitFlashTimer = 0.65;
            this.camCtrl.addShake(hit.isExplosion ? 0.45 : 0.24);
            this.audio.playShelterHit();
            if (this.hero.hp <= 0) {
              this.syncHUD();
              this.triggerGameOver('hero');
              return;
            }
          }
        }
      }
    }

    // Cleanup dead zombies cleanly after all loops
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      if (this.zombies[i].dead) {
        this.zombies[i].dispose(this.scene);
        this.zombies.splice(i, 1);
      }
    }

    this.world.update(dt, this.shelterHp / this.shelterMaxHp, this.time);
    this.fx.update(dt);
    this.camCtrl.updateBattle(dt, this.hero.pos);

    this.hudSyncTimer -= rawDt;
    if (this.hudSyncTimer <= 0) {
      this.hudSyncTimer = 0.065;
      this.syncHUD();
    }
  }

  private separateZombies(dt: number): void {
    const n = this.zombies.length;
    for (let i = 0; i < n; i++) {
      const a = this.zombies[i];
      if (a.dead) continue;
      for (let j = i + 1; j < n; j++) {
        const b = this.zombies[j];
        if (b.dead) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const minDist = a.spec.radius + b.spec.radius;
        const dSq = dx * dx + dz * dz;
        if (dSq > 0.0001 && dSq < minDist * minDist) {
          const d = Math.sqrt(dSq);
          const push = (minDist - d) * 4.2 * dt;
          const nx = dx / d;
          const nz = dz / d;
          a.pos.x -= nx * push;
          a.pos.z -= nz * push;
          b.pos.x += nx * push;
          b.pos.z += nz * push;
        }
      }
    }
  }

  private handleScreenTap(clientX: number, clientY: number): void {
    this.ndc.x = (clientX / window.innerWidth) * 2 - 1;
    this.ndc.y = -(clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.turrets.getRaycastMeshes(), false);
    if (hits.length > 0) {
      const idx = hits[0].object.userData.padIndex as number;
      this.audio.playTap();
      if (this.selectedPadIndex === idx) {
        this.closePadSheet();
      } else {
        this.openPadSheet(idx);
      }
      return;
    }
    if (this.selectedPadIndex !== null) {
      this.closePadSheet();
    }
  }

  private damageShelter(amount: number, x: number, z: number, isExplosion: boolean): void {
    if (this.phase !== 'playing') return;
    this.shelterHp = Math.max(0, this.shelterHp - amount);
    this.world.triggerShelterHit();
    this.shelterAlertTimer = 1.8;
    this.el.shelterAlert.classList.remove('hidden');
    this.hitFlashTimer = Math.max(this.hitFlashTimer, 0.5);
    this.camCtrl.addShake(isExplosion ? 0.48 : 0.18);

    if (isExplosion) {
      this.audio.playExplosion(false);
      this.fx.spawnExplosion(x, 0.6, z, 3.8, 0xf97316);
    } else {
      this.audio.playShelterHit();
      this.fx.spawnHitSparks(x, 1.0, z, 0xf87171, 6);
    }

    if (this.shelterHp <= 0) {
      this.syncHUD();
      this.triggerGameOver('shelter');
    } else {
      this.syncHUD();
    }
  }

  // =========================================================
  // 7. HUD SYNCHRONIZATION
  // =========================================================
  private syncHUD(): void {
    this.el.hudWave.textContent = String(this.wave);
    this.el.hudRemaining.textContent = String(this.waveQueue.length + this.zombies.length);
    this.el.hudScrap.textContent = String(Math.floor(this.scrap));
    this.el.hudKills.textContent = String(this.kills);

    // Shelter HP
    const sRatio = Math.max(0, Math.min(1, this.shelterHp / this.shelterMaxHp));
    this.el.hudShelterText.textContent = `${Math.ceil(this.shelterHp)}/${this.shelterMaxHp}`;
    this.el.hudShelterFill.style.width = `${(sRatio * 100).toFixed(1)}%`;
    this.el.hudShelterFill.classList.toggle('warn', sRatio <= 0.55 && sRatio > 0.28);
    this.el.hudShelterFill.classList.toggle('danger', sRatio <= 0.28);

    // Hero HP
    const hRatio = Math.max(0, Math.min(1, this.hero.hp / this.hero.maxHp));
    this.el.hudHeroText.textContent = `${Math.ceil(this.hero.hp)}/${this.hero.maxHp}`;
    this.el.hudHeroFill.style.width = `${(hRatio * 100).toFixed(1)}%`;
    this.el.hudHeroFill.classList.toggle('low', hRatio <= 0.35);

    // Boss Bar
    const bosses = this.zombies.filter((z) => z.spec.isBoss && !z.dead);
    if (bosses.length > 0) {
      const cur = bosses.reduce((s, b) => s + Math.max(0, b.hp), 0);
      const max = bosses.reduce((s, b) => s + b.maxHp, 0);
      this.el.bossBar.classList.remove('hidden');
      this.el.bossName.textContent = bosses.length > 1 ? `☣️ TITAN BOSS ×${bosses.length}` : '☣️ TITAN BOSS';
      this.el.bossHpText.textContent = `${Math.ceil(cur)} / ${max}`;
      this.el.bossHpFill.style.width = `${Math.max(0, Math.min(100, (cur / max) * 100)).toFixed(1)}%`;
    } else {
      this.el.bossBar.classList.add('hidden');
    }

    // Repair button
    const canRepair = this.scrap >= REPAIR_COST && (this.shelterHp < this.shelterMaxHp || this.hero.hp < this.hero.maxHp);
    this.el.btnRepair.disabled = !canRepair;
    this.el.btnRepair.classList.toggle('can-afford', canRepair);

    // Musou Gauge Button
    const pct = Math.floor(this.hero.musouGauge);
    this.el.hudMusouPct.textContent = pct >= 100 ? 'MAX!!' : `${pct}%`;
    this.el.musouFillBar.style.height = `${pct}%`;
    this.el.btnMusou.classList.toggle('ready', pct >= 100);

    // Strong & Dodge Cooldown overlays
    const spec = this.hero.getSpec();
    if (this.hero.strongCooldown > 0) {
      const r = this.hero.strongCooldown / spec.strongCooldown;
      this.el.strongCdOverlay.style.height = `${(r * 100).toFixed(0)}%`;
      this.el.strongCdText.textContent = `${this.hero.strongCooldown.toFixed(1)}s`;
    } else {
      this.el.strongCdOverlay.style.height = '0%';
      this.el.strongCdText.textContent = 'READY';
    }

    const dRatio = this.hero.dodgeCooldown > 0 ? this.hero.dodgeCooldown / 0.95 : 0;
    this.el.dodgeCdOverlay.style.height = `${(dRatio * 100).toFixed(0)}%`;
  }
}
