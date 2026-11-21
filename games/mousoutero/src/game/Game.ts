import * as THREE from 'three';
import type { ContextPrompt, EnemyKind, GamePhase, HudSnapshot, ScoreInput } from '../types';
import { WEAPON_SPECS } from '../types';
import { AudioManager } from './AudioManager';
import { CameraController } from './CameraController';
import { CollisionSystem } from './CollisionSystem';
import { ParticleSystem } from './ParticleSystem';
import {
  RankingManager,
  calculateScoreBreakdown,
  sanitizePlayerName
} from './RankingManager';
import { TouchInputManager } from './TouchInputManager';
import { WaveManager } from './WaveManager';
import { SchoolWorld } from '../world/SchoolBuilder';
import { ClassmateManager } from './entities/ClassmateManager';
import { PropManager } from './entities/PropManager';
import { Player, type PlayerAttackEvent } from './entities/Player';
import { Enemy } from './entities/Enemy';
import { ProjectileManager } from './entities/Projectile';
import { HudManager } from '../ui/HudManager';

const HIT_ONOMATOPOEIA = ['バキッ!!', 'ドゴォ!!', 'ズバッ!!', 'ボコォ!!', 'ガツン!!'];

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;

  private audio = new AudioManager();
  private collision = new CollisionSystem();
  private ranking = new RankingManager();
  private particles: ParticleSystem;
  private cameraCtrl: CameraController;
  private world: SchoolWorld;
  private classmates: ClassmateManager;
  private props: PropManager;
  private projectiles: ProjectileManager;
  private player: Player;
  private waves = new WaveManager();
  private input: TouchInputManager;
  private hud: HudManager;

  private enemies: Enemy[] = [];
  private phase: GamePhase = 'title';
  private playerName = '俺';

  private elapsed = 0;
  private phaseTimer = 0;
  private introStage = 0;
  private ochiStage = 0;
  private waveClearDelay = 0;

  private hitstopTimer = 0;
  private slowmoTimer = 0;

  // Score & Combat Run Stats
  private killsGrunt = 0;
  private killsGunner = 0;
  private killsShield = 0;
  private killsBoss = 0;
  private techBonus = 0;
  private combo = 0;
  private maxCombo = 0;
  private comboTimer = 0;
  private lastChatterTime = 0;
  private teacherOchiPos = new THREE.Vector3();

  private lastFrameTime = performance.now();
  private rafId = 0;

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
    this.renderer.toneMappingExposure = 1.06;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(56, window.innerWidth / window.innerHeight, 0.1, 80);

    this.cameraCtrl = new CameraController(this.camera);
    this.particles = new ParticleSystem(this.scene, 190);
    this.world = new SchoolWorld(this.scene, this.collision);
    this.classmates = new ClassmateManager(this.scene);
    this.props = new PropManager(this.scene, this.collision);
    this.projectiles = new ProjectileManager(this.scene);
    this.player = new Player(this.scene);

    this.input = new TouchInputManager(() => this.audio.unlock());

    this.hud = new HudManager({
      onStart: (rawName) => this.startNewRun(rawName),
      onOpenRanking: () => {
        this.audio.unlock();
        this.hud.renderRankingModal(this.ranking.getRankings());
      },
      onRetry: () => this.startNewRun(this.playerName),
      onBackTitle: () => this.enterTitle(),
      onSkipIntro: () => this.handleSkipScene(),
      onToggleMute: () => {
        this.audio.unlock();
        const muted = this.audio.toggleMute();
        if (!muted && this.phase === 'playing') {
          this.audio.startActionBgm();
        }
      }
    });

    const savedName = this.ranking.getSavedPlayerName();
    if (savedName) {
      this.playerName = savedName;
      this.hud.setInitialName(savedName);
    }

    window.addEventListener('resize', this.handleResize);
    this.enterTitle();
    this.lastFrameTime = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  private handleResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.cameraCtrl.updateResponsiveFov(w, h);
  };

  private clearEnemies(): void {
    for (const e of this.enemies) {
      e.dispose(this.scene);
    }
    this.enemies = [];
  }

  private enterTitle(): void {
    this.phase = 'title';
    this.audio.stopBgm();
    this.clearEnemies();
    this.projectiles.clear();
    this.particles.clear();
    this.props.setPickupsVisible(false);
    this.props.resetAll();
    this.world.setHallwayUnlocked(false);
    this.world.setLightingMode('reality');
    this.classmates.setMode('seated');
    this.player.resetForIntro();
    this.input.reset();
    this.hud.setWhiteout(0);
    this.hud.setSlowmoFx(false);
    this.hud.setAwakenedFx(false);
    this.hud.clearChatter();
    this.hud.setPhase('title');
  }

  private startNewRun(rawName: string): void {
    this.audio.unlock();
    this.playerName = this.ranking.savePlayerName(sanitizePlayerName(rawName));
    this.hud.setInitialName(this.playerName);
    this.hud.setPlayerNameLabel(this.playerName);

    // Reset all entities & stats
    this.clearEnemies();
    this.projectiles.clear();
    this.particles.clear();
    this.props.setPickupsVisible(false);
    this.props.resetAll();
    this.world.setHallwayUnlocked(false);
    this.world.setLightingMode('reality');
    this.classmates.setMode('seated');
    this.player.resetForIntro();
    this.waves.reset(this.playerName);
    this.input.reset();

    this.killsGrunt = 0;
    this.killsGunner = 0;
    this.killsShield = 0;
    this.killsBoss = 0;
    this.techBonus = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.comboTimer = 0;
    this.hitstopTimer = 0;
    this.slowmoTimer = 0;
    this.waveClearDelay = 0;

    this.hud.clearChatter();
    this.hud.setWhiteout(0);
    this.hud.setSlowmoFx(false);
    this.hud.setAwakenedFx(false);

    // Start Classroom Intro!
    this.phase = 'intro';
    this.phaseTimer = 0;
    this.introStage = 0;
    this.hud.setPhase('intro');
    this.audio.playSchoolChime();
    this.hud.showDialogue(
      '鬼塚先生',
      '……というわけで、この二次方程式の解の公式は期末テストに出るぞ。',
      true
    );
  }

  private handleSkipScene(): void {
    if (this.phase === 'intro') {
      this.beginDelusionBattle();
    } else if (this.phase === 'victory_ochi' || this.phase === 'defeat_ochi') {
      this.finishToResult(this.phase === 'victory_ochi');
    }
  }

  private beginDelusionBattle(): void {
    this.phase = 'playing';
    this.phaseTimer = 0;
    this.world.setLightingMode('delusion');
    this.world.setHallwayUnlocked(false);
    this.props.setPickupsVisible(true);
    this.classmates.setMode('hiding');
    this.player.startBattlePose();
    this.cameraCtrl.resetForBattle();
    this.hud.setPhase('playing');
    this.audio.startActionBgm();

    this.startNextWave();
  }

  private startNextWave(): void {
    const cfg = this.waves.startNextWave();
    if (!cfg) {
      this.triggerVictoryOchi();
      return;
    }

    if (cfg.unlocksHallway) {
      this.world.setHallwayUnlocked(true);
      this.particles.spawnDoorExplosion(6.7, 1.2, 2.5);
      this.particles.spawnDoorExplosion(6.7, 1.2, -2.4);
      this.audio.playExplosion();
      this.cameraCtrl.addShake(0.45);
      this.player.heal(35);
      this.hud.pushChatter(
        'さくら',
        `${this.playerName}くん！廊下の封鎖が破られたよ！竹刀と消火器があるはず！`,
        'heroine'
      );
    } else {
      this.hud.pushChatter(
        'さくら',
        `キャーッ！テロリスト！？${this.playerName}くん、気をつけて！`,
        'heroine'
      );
      this.hud.pushChatter(
        'ケンタ',
        `マジかよ！後ろのモップと黒板消し、机も使え${this.playerName}！`,
        'normal'
      );
    }

    this.hud.showCutin(cfg.cutinKicker, cfg.cutinTitle, cfg.cutinSub, 1900);
  }

  private triggerVictoryOchi(): void {
    if (this.phase !== 'playing') return;
    this.phase = 'victory_ochi';
    this.phaseTimer = 0;
    this.ochiStage = 0;
    this.slowmoTimer = 0;
    this.hud.setSlowmoFx(false);
    this.hud.setAwakenedFx(false);
    this.audio.stopBgm();
    this.projectiles.clear();
    this.input.reset();
    this.hud.setPhase('victory_ochi');

    this.hud.showDialogue(
      'さくら',
      `${this.playerName}くん…みんなを守ってくれてありがとう！すっごくカッコよかったよ///`,
      true
    );
  }

  private triggerDefeatOchi(): void {
    if (this.phase !== 'playing') return;
    this.phase = 'defeat_ochi';
    this.phaseTimer = 0;
    this.ochiStage = 0;
    this.slowmoTimer = 0;
    this.hud.setSlowmoFx(false);
    this.hud.setAwakenedFx(false);
    this.audio.stopBgm();
    this.projectiles.clear();
    this.input.reset();
    this.hud.setPhase('defeat_ochi');

    this.hud.showDialogue(
      this.playerName,
      'ぐっ……ここまでか……！みんな、俺のことは置いて逃げてくれ……！',
      true
    );
  }

  private switchBackToRealityClassroom(): void {
    this.clearEnemies();
    this.projectiles.clear();
    this.particles.clear();
    this.props.setPickupsVisible(false);
    this.props.resetAll();
    this.world.setHallwayUnlocked(false);
    this.world.setLightingMode('reality');
    this.classmates.setMode('seated');
    this.player.resetForIntro();
    this.teacherOchiPos = this.world.positionTeacherForOchi(this.player.pos);
  }

  private finishToResult(cleared: boolean): void {
    this.hud.setWhiteout(0);
    this.hud.hideDialogue();
    this.phase = 'result';

    const scoreInput = this.buildCurrentScoreInput(cleared);
    const breakdown = calculateScoreBreakdown(scoreInput);
    const recorded = this.ranking.recordRun(
      this.playerName,
      breakdown,
      this.maxCombo,
      cleared
    );

    this.hud.showResult({
      cleared,
      playerName: this.playerName,
      breakdown,
      maxCombo: this.maxCombo,
      rankings: recorded.rankings,
      currentEntryId: recorded.entry.id,
      rankPosition: recorded.position
    });
  }

  private buildCurrentScoreInput(cleared: boolean): ScoreInput {
    return {
      killsGrunt: this.killsGrunt,
      killsGunner: this.killsGunner,
      killsShield: this.killsShield,
      killsBoss: this.killsBoss,
      survivorsAlive: this.classmates.getAliveCount(),
      totalSurvivors: this.classmates.getTotalCount(),
      maxCombo: this.maxCombo,
      techBonus: this.techBonus,
      cleared
    };
  }

  private loop = (now: number): void => {
    this.rafId = requestAnimationFrame(this.loop);
    const rawDt = Math.min(0.05, Math.max(0.001, (now - this.lastFrameTime) / 1000));
    this.lastFrameTime = now;
    this.elapsed += rawDt;

    if (this.phase === 'title' || this.phase === 'result') {
      this.world.update(rawDt, this.elapsed);
      this.world.updateCutaway(rawDt, false, this.camera.position, this.player.pos);
      this.classmates.update(rawDt, this.elapsed, 'seated', []);
      if (this.phase === 'title') {
        this.cameraCtrl.updateTitle(rawDt);
      } else {
        this.cameraCtrl.updateRealityOchi(rawDt, this.teacherOchiPos);
      }
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (this.phase === 'intro') {
      this.world.updateCutaway(rawDt, false, this.camera.position, this.player.pos);
      this.updateIntro(rawDt);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (this.phase === 'victory_ochi') {
      this.world.updateCutaway(rawDt, false, this.camera.position, this.player.pos);
      this.updateVictoryOchi(rawDt);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (this.phase === 'defeat_ochi') {
      this.world.updateCutaway(rawDt, false, this.camera.position, this.player.pos);
      this.updateDefeatOchi(rawDt);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // Playing phase with Hitstop & Just-Dodge Slowmo timescale
    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= rawDt;
      this.renderer.render(this.scene, this.camera);
      return;
    }

    let timeScale = 1.0;
    if (this.slowmoTimer > 0) {
      this.slowmoTimer = Math.max(0, this.slowmoTimer - rawDt);
      timeScale = 0.38;
      this.hud.setSlowmoFx(this.slowmoTimer > 0);
    }

    const dt = rawDt * timeScale;
    this.updatePlaying(dt, rawDt);
    this.renderer.render(this.scene, this.camera);
  };

  private updateIntro(dt: number): void {
    this.phaseTimer += dt;
    this.world.update(dt, this.elapsed);
    this.classmates.update(dt, this.elapsed, 'seated', []);
    this.particles.update(dt);

    if (this.introStage === 0 && this.phaseTimer > 1.7) {
      this.introStage = 1;
      this.hud.showDialogue(
        '鬼塚先生',
        `おい${this.playerName}！窓の外ばかり見てボーッとするな！聞いてるのか！？`,
        true
      );
    } else if (this.introStage === 1 && this.phaseTimer > 3.1) {
      this.introStage = 2;
      this.world.setLightingMode('delusion');
      this.particles.spawnDoorExplosion(6.2, 1.2, -2.4);
      this.audio.playExplosion();
      this.audio.playAlarm();
      this.cameraCtrl.addShake(0.6);
      this.hud.showDialogue(
        '謎の覆面テロリスト',
        '「全員動くな！この校舎は我々が占拠した！！」',
        true
      );
    } else if (this.phaseTimer > 4.35) {
      this.beginDelusionBattle();
      return;
    }

    this.cameraCtrl.updateIntro(dt, Math.max(0, (this.phaseTimer - 2.9) / 1.4));
  }

  private updateVictoryOchi(dt: number): void {
    this.phaseTimer += dt;
    this.particles.update(dt);
    this.world.update(dt, this.elapsed);

    if (this.ochiStage === 0) {
      // Hero cheering pose + classmates clapping
      this.classmates.update(dt, this.elapsed, 'cheering', []);
      this.player.rig.animateCheer(this.elapsed);
      this.cameraCtrl.updateVictoryPose(dt, this.player.pos, this.player.yaw);

      if (this.phaseTimer > 1.9) {
        this.ochiStage = 1;
        // Spawn giant flying teacher chalk right toward the camera!
        const start = this.player.pos.clone().add(new THREE.Vector3(0, 1.5, 0));
        this.projectiles.spawnTeacherChalk(start, this.camera.position.clone());
      }
    } else if (this.ochiStage === 1) {
      this.classmates.update(dt, this.elapsed, 'cheering', []);
      for (const proj of this.projectiles.items) {
        if (!proj.active) continue;
        proj.pos.x += proj.vx * dt;
        proj.pos.y += proj.vy * dt;
        proj.pos.z += proj.vz * dt;
        proj.mesh.position.copy(proj.pos);
        proj.mesh.rotation.x += dt * 18;
      }
      if (this.phaseTimer > 2.45) {
        this.ochiStage = 2;
        this.audio.playChalkSmack();
        this.cameraCtrl.addShake(0.65);
        this.hud.setWhiteout(1);
        this.hud.spawnFloatingPopup(
          this.player.pos.clone().add(new THREE.Vector3(0, 1.6, 0)),
          this.camera,
          'ビシッ!!（チョーク直撃）',
          '#ffffff',
          26
        );
      }
    } else if (this.ochiStage === 2) {
      if (this.phaseTimer > 2.85) {
        this.ochiStage = 3;
        this.switchBackToRealityClassroom();
        this.hud.setWhiteout(0);
        this.hud.showDialogue(
          '鬼塚先生',
          `おい${this.playerName}！！授業中に机蹴り倒して「俺が守る！」とか何叫んでるんだ！廊下に立ってろ！！`,
          true
        );
      }
    } else {
      this.classmates.update(dt, this.elapsed, 'seated', []);
      this.cameraCtrl.updateRealityOchi(dt, this.teacherOchiPos);
      if (this.phaseTimer > 5.4) {
        this.finishToResult(true);
      }
    }
  }

  private updateDefeatOchi(dt: number): void {
    this.phaseTimer += dt;
    this.world.update(dt, this.elapsed);

    if (this.ochiStage === 0) {
      this.player.rig.animateFainted(dt);
      if (this.phaseTimer > 1.15) {
        this.ochiStage = 1;
        this.hud.setWhiteout(1);
        this.audio.playChalkSmack();
      }
    } else if (this.ochiStage === 1) {
      if (this.phaseTimer > 1.55) {
        this.ochiStage = 2;
        this.switchBackToRealityClassroom();
        this.hud.setWhiteout(0);
        this.hud.showDialogue(
          '鬼塚先生',
          `おい${this.playerName}！爆睡して椅子から転げ落ちるな！みんな笑ってるぞ、ほら起きろ！`,
          true
        );
      }
    } else {
      this.classmates.update(dt, this.elapsed, 'seated', []);
      this.cameraCtrl.updateRealityOchi(dt, this.teacherOchiPos);
      if (this.phaseTimer > 3.8) {
        this.finishToResult(false);
      }
    }
  }

  private updatePlaying(dt: number, rawDt: number): void {
    const input = this.input.consumeState();
    this.cameraCtrl.addYaw(input.cameraDeltaYaw);

    // Combo decay
    if (this.combo > 0) {
      this.comboTimer -= rawDt;
      if (this.comboTimer <= 0) {
        this.combo = 0;
      }
    }

    // Convert joystick axes to world XZ using camera basis
    const fwd = this.cameraCtrl.getCameraForwardXZ();
    const right = this.cameraCtrl.getCameraRightXZ();
    const moveWorldX = right.x * input.moveX + fwd.x * input.moveY;
    const moveWorldZ = right.y * input.moveX + fwd.y * input.moveY;

    // Awakening trigger
    if (input.awakenPressed && this.player.activateAwakening()) {
      this.audio.playAwaken();
      this.particles.spawnAwakenBurst(this.player.pos.x, 1.0, this.player.pos.z);
      this.cameraCtrl.addShake(0.35);
      this.techBonus += 400;
      this.hud.showCutin(
        'DELUSION LIMIT BREAK',
        `【妄想覚醒】${this.playerName}、本気モード！`,
        '攻撃力・スピード大幅アップ！全員ブッ飛ばせ！',
        1350
      );
      this.hud.pushChatter('ユウト', `やべぇ、${this.playerName}の目つきが変わったぞ！！`, 'normal');
    }

    // Dodge trigger (with Just-Dodge detection!)
    if (input.dodgePressed && this.player.tryDodge(moveWorldX, moveWorldZ)) {
      const just = this.checkJustDodge();
      this.audio.playDodge(just);
      if (just) {
        this.slowmoTimer = 1.35;
        this.player.addDelusion(24);
        this.techBonus += 300;
        this.hud.spawnFloatingPopup(
          this.player.pos.clone().add(new THREE.Vector3(0, 1.85, 0)),
          this.camera,
          '⚡ 見切った…！（ジャスト回避）',
          '#2ee6ff',
          20
        );
        this.maybeChatter('リナ', `えっ今の避け方マンガじゃん！${this.playerName}やばっ！`, 'normal');
      }
    }

    // Context action (Pickup / Rescue / Desk Barricade / Desk Kick)
    const context = this.computeContextAction();
    if (input.contextPressed && context) {
      this.executeContextAction(context);
    }

    // Attack & Special with strong mobile auto-target
    const autoTarget = this.findAutoTargetEnemy(5.8);
    if (input.attackPressed) {
      const ev = this.player.tryAttack(autoTarget ? autoTarget.pos : null);
      if (ev) this.handlePlayerAttack(ev);
    }
    if (input.specialPressed) {
      const ev = this.player.trySpecial(autoTarget ? autoTarget.pos : null);
      if (ev) this.handlePlayerSpecial(ev);
    }

    // Update Player
    this.player.update(dt, moveWorldX, moveWorldZ, input.sprinting, this.collision);

    // Spawn Wave Enemies
    this.waves.update(dt, (def) => {
      const enemy = new Enemy(this.scene, def.kind, def.pos, def.prefersClassmate ?? false);
      this.enemies.push(enemy);
    });

    // Update Props (Pickups & Kicked Sliding Desks)
    this.props.update(
      dt,
      this.elapsed,
      (slidingDesk) => {
        for (const e of this.enemies) {
          if (e.dead || slidingDesk.hitEnemyIds.has(e.id)) continue;
          if (Math.hypot(e.pos.x - slidingDesk.pos.x, e.pos.z - slidingDesk.pos.z) < 1.25) {
            slidingDesk.hitEnemyIds.add(e.id);
            const len = Math.hypot(slidingDesk.vx, slidingDesk.vz) || 1;
            const res = e.applyHit({
              damage: 78,
              knockX: slidingDesk.vx / len,
              knockZ: slidingDesk.vz / len,
              knockForce: 17,
              stunSeconds: 2.2,
              bypassShield: true
            });
            this.audio.playDeskCrash();
            this.particles.spawnWoodChips(e.pos.x, 0.9, e.pos.z, 12);
            this.cameraCtrl.addShake(0.28);
            this.techBonus += 250;
            this.registerComboHit(e.pos, '机ストライク!!', '#ff922b', res.killed, e.kind);
            if (res.killed) {
              this.maybeChatter('ショウタ', `机でボーリングしやがったwww ${this.playerName}最高！`, 'normal');
            }
          }
        }
      },
      (crashPos) => {
        this.audio.playDeskCrash();
        this.particles.spawnWoodChips(crashPos.x, 0.6, crashPos.z, 14);
      }
    );

    // Update Enemies
    const smokeZones = this.particles.getActiveSmokeZones();
    const aliveEnemyPositions: THREE.Vector3[] = [];
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.dead) aliveEnemyPositions.push(e.pos);
      const nearestCm = this.classmates.findNearestAlive(e.pos.x, e.pos.z);

      e.update(dt, this.player.pos, nearestCm, smokeZones, this.collision, this.camera.position, {
        onMeleePlayer: (attacker, dmg) => {
          const dist = Math.hypot(attacker.pos.x - this.player.pos.x, attacker.pos.z - this.player.pos.z);
          if (dist < 1.95) {
            this.damagePlayer(dmg);
          }
        },
        onShootBullet: (_attacker, ox, oy, oz, dx, dz, spd, dmg) => {
          this.audio.playGunshot();
          this.particles.spawnHitSparks(ox, oy, oz, 0xffd43b, 4);
          this.projectiles.spawnEnemyBullet(ox, oy, oz, dx, dz, spd, dmg);
        },
        onAttackClassmate: (_attacker, cm, dmg) => {
          this.classmates.damageClassmate(
            cm,
            dmg,
            (called) => {
              const sosLine = called.isFemale
                ? `キャー！${this.playerName}くん助けてーー！！`
                : `うわぁっ！${this.playerName}、助けてくれー！！`;
              this.hud.pushChatter(called.name, sosLine, 'sos');
            },
            (fainted) => {
              this.hud.pushChatter(
                fainted.name,
                'うぅ…もうダメ…（気絶）',
                'sos'
              );
              this.hud.spawnFloatingPopup(
                fainted.pos.clone().add(new THREE.Vector3(0, 1.7, 0)),
                this.camera,
                `${fainted.name} 気絶！`,
                '#ff5252',
                17
              );
            }
          );
        }
      });

      if (e.removeReady) {
        e.dispose(this.scene);
        this.enemies.splice(i, 1);
      }
    }

    // Update Projectiles (Bullets, Reflected Bullets, Thrown Chalk Eraser Bombs)
    this.updateProjectiles(dt);

    // Update World, Classmates, Particles, Camera
    this.world.update(dt, this.elapsed);
    this.classmates.update(dt, this.elapsed, 'battle', aliveEnemyPositions);
    this.particles.update(dt);

    const nearestEnemy = this.findAutoTargetEnemy(12);
    this.cameraCtrl.updateBattle(dt, this.player.pos, this.collision, nearestEnemy ? nearestEnemy.pos : null);
    this.world.updateCutaway(rawDt, true, this.camera.position, this.player.pos);

    // Wave completion check
    const aliveEnemies = this.enemies.filter((e) => !e.dead);
    if (aliveEnemies.length === 0 && this.waves.getRemainingSpawnsCount() === 0) {
      this.waveClearDelay += rawDt;
      if (this.waveClearDelay > 1.15) {
        this.waveClearDelay = 0;
        this.startNextWave();
      }
    } else {
      this.waveClearDelay = 0;
    }

    // Update HUD & SOS 3D markers
    this.hud.updateSosMarkers(this.classmates.classmates, this.camera);
    this.hud.updateHud(this.buildHudSnapshot(context?.prompt ?? null, aliveEnemies));
  }

  private handlePlayerAttack(ev: PlayerAttackEvent): void {
    this.audio.playSwing();
    let hitAny = false;

    // Shinai can deflect nearby enemy bullets even on regular attacks!
    if (ev.weapon === 'shinai') {
      this.tryParryBullets(ev.dirX, ev.dirZ, 3.0);
    }

    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.pos.x - ev.origin.x;
      const dz = e.pos.z - ev.origin.z;
      const dist = Math.hypot(dx, dz);
      if (dist > ev.range) continue;

      const nx = dist > 0.01 ? dx / dist : ev.dirX;
      const nz = dist > 0.01 ? dz / dist : ev.dirZ;
      const dot = nx * ev.dirX + nz * ev.dirZ;
      if (dist > 1.0 && dot < Math.cos(ev.arc)) continue;

      hitAny = true;
      const res = e.applyHit({
        damage: ev.damage,
        knockX: nx,
        knockZ: nz,
        knockForce: ev.knockback,
        stunSeconds: ev.comboStep === 3 ? 0.65 : ev.weapon === 'extinguisher' ? 0.75 : 0.2,
        chalked: ev.weapon === 'eraser',
        bypassShield: ev.awakened || ev.comboStep === 3
      });

      this.particles.spawnHitSparks(
        e.pos.x,
        1.1,
        e.pos.z,
        res.blockedByShield ? 0x80d8ff : ev.awakened ? 0xff3355 : 0xffd43b,
        ev.comboStep === 3 ? 14 : 8
      );
      if (ev.weapon === 'eraser') {
        this.particles.spawnChalkBurst(e.pos.x, 1.3, e.pos.z);
      }

      const label = res.blockedByShield
        ? `盾ガード ${res.actualDamage}`
        : `${HIT_ONOMATOPOEIA[(this.combo + ev.comboStep) % HIT_ONOMATOPOEIA.length]} ${res.actualDamage}`;

      this.registerComboHit(
        e.pos,
        label,
        res.blockedByShield ? '#80d8ff' : ev.comboStep === 3 ? '#ff5252' : '#ffd43b',
        res.killed,
        e.kind
      );

      if (res.bossPhase2) {
        this.hud.showCutin(
          'BOSS ENRAGED',
          'ブラック・ファントム「小僧…ただの高校生ではないな！」',
          'ボスの連射が激化！回避＆備品技で畳みかけろ！',
          1600
        );
      }
    }

    if (hitAny) {
      this.audio.playHit(ev.comboStep === 3 || ev.weapon === 'extinguisher');
      this.hitstopTimer = ev.comboStep === 3 ? 0.055 : 0.032;
      this.cameraCtrl.addShake(ev.comboStep === 3 ? 0.24 : 0.11);
      const broke = this.player.consumeDurability(1);
      if (broke) {
        this.hud.spawnFloatingPopup(
          this.player.pos.clone().add(new THREE.Vector3(0, 1.8, 0)),
          this.camera,
          '備品が壊れた！（素手へ）',
          '#ff9800',
          15
        );
      }
    }
  }

  private handlePlayerSpecial(ev: PlayerAttackEvent): void {
    if (ev.weapon === 'extinguisher') {
      // High-pressure white smoke spray!
      this.audio.playExtinguisher();
      this.particles.spawnExtinguisherSpray(ev.origin.x, 1.05, ev.origin.z, ev.dirX, ev.dirZ);
      this.cameraCtrl.addShake(0.2);

      let hitCount = 0;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const dx = e.pos.x - ev.origin.x;
        const dz = e.pos.z - ev.origin.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 5.2) continue;
        const dot = (dx / (dist || 1)) * ev.dirX + (dz / (dist || 1)) * ev.dirZ;
        if (dist > 1.2 && dot < 0.25) continue;

        hitCount++;
        const res = e.applyHit({
          damage: ev.damage,
          knockX: dx / (dist || 1),
          knockZ: dz / (dist || 1),
          knockForce: 8,
          stunSeconds: 3.4,
          bypassShield: true
        });
        this.registerComboHit(e.pos, 'ゴホッ! 煙幕スタン!', '#e3f2fd', res.killed, e.kind);
      }
      if (hitCount > 0) {
        this.techBonus += hitCount * 180;
        this.maybeChatter('ミサキ', `消火器で煙幕戦術とか${this.playerName}プロすぎない！？`, 'normal');
      }
      this.player.consumeDurability(2);
      return;
    }

    if (ev.weapon === 'eraser') {
      // Throw chalkboard eraser bomb!
      this.audio.playSwing();
      this.projectiles.spawnEraserBomb(
        ev.origin.x + ev.dirX * 0.5,
        1.25,
        ev.origin.z + ev.dirZ * 0.5,
        ev.dirX,
        ev.dirZ,
        ev.damage
      );
      this.player.consumeDurability(2);
      return;
    }

    // Melee specials: Mop Hurricane / Shinai Flash Parry Thrust / Fist Tackle
    if (ev.weapon === 'shinai') {
      this.tryParryBullets(ev.dirX, ev.dirZ, 4.5);
    }
    this.audio.playHit(true);
    this.cameraCtrl.addShake(0.32);

    let hitCount = 0;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.pos.x - ev.origin.x;
      const dz = e.pos.z - ev.origin.z;
      const dist = Math.hypot(dx, dz);
      if (dist > ev.range) continue;

      const nx = dist > 0.01 ? dx / dist : ev.dirX;
      const nz = dist > 0.01 ? dz / dist : ev.dirZ;
      if (ev.weapon !== 'mop') {
        const dot = nx * ev.dirX + nz * ev.dirZ;
        if (dist > 1.1 && dot < Math.cos(ev.arc)) continue;
      }

      hitCount++;
      const res = e.applyHit({
        damage: ev.damage,
        knockX: nx,
        knockZ: nz,
        knockForce: ev.knockback,
        stunSeconds: 1.35,
        bypassShield: true
      });
      this.particles.spawnHitSparks(e.pos.x, 1.1, e.pos.z, 0xff8c24, 15);
      const specName = WEAPON_SPECS[ev.weapon].specialName;
      this.registerComboHit(e.pos, `${specName}!!`, '#ff922b', res.killed, e.kind);
    }

    if (hitCount >= 2) {
      this.techBonus += hitCount * 150;
      this.maybeChatter('さくら', `すごっ…！${this.playerName}くん、まとめて吹き飛ばしたよ！`, 'heroine');
    }
    if (hitCount > 0) {
      this.hitstopTimer = 0.06;
      this.player.consumeDurability(2);
    }
  }

  private tryParryBullets(dirX: number, dirZ: number, radius: number): void {
    for (const proj of this.projectiles.items) {
      if (!proj.active || proj.kind !== 'enemy_bullet') continue;
      const dist = Math.hypot(proj.pos.x - this.player.pos.x, proj.pos.z - this.player.pos.z);
      if (dist <= radius) {
        this.projectiles.reflectBullet(proj, dirX, dirZ);
        this.audio.playParry();
        this.particles.spawnHitSparks(proj.pos.x, proj.pos.y, proj.pos.z, 0x2ee6ff, 14);
        this.hitstopTimer = 0.065;
        this.player.addDelusion(22);
        this.techBonus += 450;
        this.hud.spawnFloatingPopup(
          proj.pos.clone(),
          this.camera,
          '⚔️ 弾丸パリィ反射!!',
          '#2ee6ff',
          22
        );
        this.maybeChatter('ケンタ', `ウソだろ！？${this.playerName}、竹刀で銃弾を弾き返したぞ！！`, 'normal');
      }
    }
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.items.length - 1; i >= 0; i--) {
      const p = this.projectiles.items[i];
      if (!p.active) {
        this.projectiles.items.splice(i, 1);
        continue;
      }

      p.life -= dt;
      if (p.life <= 0) {
        this.projectiles.removeItem(p);
        this.projectiles.items.splice(i, 1);
        continue;
      }

      if (p.kind === 'eraser_bomb') {
        p.vy -= 14.5 * dt;
      }

      const stepX = p.vx * dt;
      const stepY = p.vy * dt;
      const stepZ = p.vz * dt;
      const stepLen = Math.hypot(stepX, stepY, stepZ);

      // Raycast against desks & walls!
      if (stepLen > 0.001 && (p.kind === 'enemy_bullet' || p.kind === 'reflected_bullet')) {
        const hit = this.collision.raycast(
          p.pos.x,
          p.pos.y,
          p.pos.z,
          stepX / stepLen,
          stepY / stepLen,
          stepZ / stepLen,
          stepLen + 0.15,
          'bullet'
        );
        if (hit.hit) {
          if (hit.colliderId && hit.colliderId.startsWith('desk-')) {
            this.props.damageDeskByColliderId(hit.colliderId, 18);
            this.particles.spawnWoodChips(hit.pointX, hit.pointY, hit.pointZ, 7);
            this.audio.playDeskCrash();
          } else {
            this.particles.spawnHitSparks(hit.pointX, hit.pointY, hit.pointZ, 0xffd43b, 4);
          }
          this.projectiles.removeItem(p);
          this.projectiles.items.splice(i, 1);
          continue;
        }
      }

      p.pos.x += stepX;
      p.pos.y += stepY;
      p.pos.z += stepZ;
      p.mesh.position.copy(p.pos);

      if (p.kind === 'enemy_bullet') {
        // Automatic Shinai parry window reflection
        const distPlayer = Math.hypot(p.pos.x - this.player.pos.x, p.pos.z - this.player.pos.z);
        if (this.player.isParryWindowActive() && distPlayer < 2.2) {
          this.projectiles.reflectBullet(p, Math.sin(this.player.yaw), Math.cos(this.player.yaw));
          this.audio.playParry();
          this.techBonus += 450;
          this.hud.spawnFloatingPopup(p.pos.clone(), this.camera, '⚔️ パリィ反射!', '#2ee6ff', 21);
          continue;
        }

        if (distPlayer < 0.65) {
          this.damagePlayer(p.damage);
          this.projectiles.removeItem(p);
          this.projectiles.items.splice(i, 1);
          continue;
        }
      } else if (p.kind === 'reflected_bullet') {
        let hitEnemy = false;
        for (const e of this.enemies) {
          if (e.dead) continue;
          if (Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < 0.95) {
            const spd = Math.hypot(p.vx, p.vz) || 1;
            const res = e.applyHit({
              damage: p.damage,
              knockX: p.vx / spd,
              knockZ: p.vz / spd,
              knockForce: 14,
              stunSeconds: 1.2,
              bypassShield: true
            });
            this.audio.playHit(true);
            this.particles.spawnHitSparks(e.pos.x, 1.1, e.pos.z, 0x2ee6ff, 14);
            this.registerComboHit(e.pos, '反射直撃!!', '#2ee6ff', res.killed, e.kind);
            hitEnemy = true;
            break;
          }
        }
        if (hitEnemy) {
          this.projectiles.removeItem(p);
          this.projectiles.items.splice(i, 1);
          continue;
        }
      } else if (p.kind === 'eraser_bomb') {
        p.mesh.rotation.x += dt * 11;
        p.mesh.rotation.z += dt * 7;
        let detonate = p.pos.y <= 0.18;
        if (!detonate) {
          for (const e of this.enemies) {
            if (!e.dead && Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < 0.95) {
              detonate = true;
              break;
            }
          }
        }
        if (detonate) {
          this.detonateEraserBomb(p.pos, p.damage);
          this.projectiles.removeItem(p);
          this.projectiles.items.splice(i, 1);
        }
      }
    }
  }

  private detonateEraserBomb(pos: THREE.Vector3, damage: number): void {
    this.audio.playChalkSmack();
    this.particles.spawnChalkBurst(pos.x, 0.9, pos.z);
    this.cameraCtrl.addShake(0.24);

    let hitCount = 0;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.pos.x - pos.x;
      const dz = e.pos.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 3.5) continue;

      hitCount++;
      const res = e.applyHit({
        damage,
        knockX: dx / (dist || 1),
        knockZ: dz / (dist || 1),
        knockForce: 9.5,
        stunSeconds: 3.2,
        chalked: true,
        bypassShield: true
      });
      this.registerComboHit(e.pos, 'チョーク目潰し!!', '#ffffff', res.killed, e.kind);
    }

    if (hitCount > 0) {
      this.techBonus += hitCount * 200;
      this.maybeChatter('ショウタ', `テロリストの頭まっ白じゃんwww ナイス${this.playerName}！`, 'normal');
    }
  }

  private damagePlayer(dmg: number): void {
    const res = this.player.takeDamage(dmg);
    if (!res.tookDamage) return;

    this.audio.playHit(false);
    this.hud.flashDamage();
    this.cameraCtrl.addShake(0.28);
    this.hud.spawnFloatingPopup(
      this.player.pos.clone().add(new THREE.Vector3(0, 1.75, 0)),
      this.camera,
      `-${dmg}`,
      '#ff3355',
      18
    );

    if (res.dead) {
      this.triggerDefeatOchi();
    }
  }

  private registerComboHit(
    worldPos: THREE.Vector3,
    label: string,
    color: string,
    killed: boolean,
    kind: EnemyKind
  ): void {
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.comboTimer = 3.2;
    this.player.addDelusion(killed ? 14 : 6);

    this.hud.spawnFloatingPopup(
      worldPos.clone().add(new THREE.Vector3(0, 1.55, 0)),
      this.camera,
      label,
      color,
      killed ? 21 : 17
    );

    if (killed) {
      if (kind === 'grunt') this.killsGrunt++;
      else if (kind === 'gunner') this.killsGunner++;
      else if (kind === 'shield') this.killsShield++;
      else if (kind === 'boss') this.killsBoss++;

      if (this.combo === 6 || this.combo === 12 || this.combo === 18) {
        this.maybeChatter(
          'さくら',
          `${this.playerName}くん${this.combo}コンボ！？本当にクラスメイトなの…！？`,
          'heroine'
        );
      }
    }
  }

  private checkJustDodge(): boolean {
    for (const p of this.projectiles.items) {
      if (p.active && p.kind === 'enemy_bullet') {
        if (Math.hypot(p.pos.x - this.player.pos.x, p.pos.z - this.player.pos.z) < 2.6) {
          return true;
        }
      }
    }
    for (const e of this.enemies) {
      if (e.isTelegraphingNear(this.player.pos.x, this.player.pos.z, 2.7)) {
        return true;
      }
    }
    return false;
  }

  private findAutoTargetEnemy(maxRadius: number): Enemy | null {
    let best: Enemy | null = null;
    let bestScore = Infinity;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dist = Math.hypot(e.pos.x - this.player.pos.x, e.pos.z - this.player.pos.z);
      if (dist > maxRadius) continue;
      if (dist < bestScore) {
        bestScore = dist;
        best = e;
      }
    }
    return best;
  }

  private computeContextAction():
    | {
        prompt: ContextPrompt;
        run: () => void;
      }
    | null {
    // 1. Nearby weapon pickup (prefer if different weapon or durability below 80%)
    const pickup = this.props.findNearestPickup(this.player.pos.x, this.player.pos.z, 2.1);
    if (
      pickup &&
      (pickup.weapon !== this.player.weapon ||
        this.player.weaponDurability < this.player.weaponMaxDurability * 0.75)
    ) {
      const spec = WEAPON_SPECS[pickup.weapon];
      return {
        prompt: {
          label: `${spec.icon} ${spec.shortName}`,
          sublabel: '拾って装備',
          kind: 'pickup',
          highlight: true
        },
        run: () => {
          const weapon = this.props.takePickup(pickup);
          this.player.equipWeapon(weapon);
          this.audio.playPickup();
          this.hud.spawnFloatingPopup(
            this.player.pos.clone().add(new THREE.Vector3(0, 1.8, 0)),
            this.camera,
            `${WEAPON_SPECS[weapon].name} 装備！`,
            '#ffd43b',
            18
          );
        }
      };
    }

    // 2. Nearby injured / SOS classmate -> Rescue & Encourage!
    const cm = this.classmates.findRescuableNear(this.player.pos.x, this.player.pos.z, 2.5);
    if (cm) {
      return {
        prompt: {
          label: `🤝 ${cm.name}を救出`,
          sublabel: '回復＆鼓舞',
          kind: 'rescue',
          highlight: true
        },
        run: () => {
          this.classmates.encourageClassmate(cm);
          this.audio.playPickup();
          this.player.addDelusion(16);
          this.techBonus += 250;
          this.hud.spawnFloatingPopup(
            cm.pos.clone().add(new THREE.Vector3(0, 1.85, 0)),
            this.camera,
            `✨ ${cm.name} 安心した！`,
            '#69db7c',
            18
          );
          this.hud.pushChatter(
            cm.name,
            `ありがとう${this.playerName}くん！もう怖くないよ！`,
            cm.isHeroine ? 'heroine' : 'normal'
          );
        }
      };
    }

    // 3. Nearby school desk -> Barricade or Desk Kick!
    const desk = this.props.findNearestDesk(this.player.pos.x, this.player.pos.z, 2.15);
    if (desk) {
      if (desk.state === 'barricade') {
        return {
          prompt: {
            label: '💥 机キック!',
            sublabel: '吹き飛ばす',
            kind: 'desk_kick',
            highlight: true
          },
          run: () => {
            const target = this.findAutoTargetEnemy(10);
            let dirX = Math.sin(this.player.yaw);
            let dirZ = Math.cos(this.player.yaw);
            if (target) {
              const dx = target.pos.x - desk.pos.x;
              const dz = target.pos.z - desk.pos.z;
              const len = Math.hypot(dx, dz) || 1;
              dirX = dx / len;
              dirZ = dz / len;
              this.player.yaw = Math.atan2(dirX, dirZ);
            }
            this.props.kickDesk(desk, dirX, dirZ);
            this.audio.playDeskCrash();
            this.cameraCtrl.addShake(0.22);
            this.hud.spawnFloatingPopup(
              desk.pos.clone().add(new THREE.Vector3(0, 1.2, 0)),
              this.camera,
              '机キック発射!!',
              '#ff922b',
              19
            );
          }
        };
      }

      return {
        prompt: {
          label: '🛡️ 机を倒す',
          sublabel: 'カバー化',
          kind: 'desk_barricade',
          highlight: false
        },
        run: () => {
          this.props.flipDeskToBarricade(desk, this.player.yaw);
          this.audio.playDeskCrash();
          this.particles.spawnWoodChips(desk.pos.x, 0.7, desk.pos.z, 6);
          this.techBonus += 100;
          this.hud.spawnFloatingPopup(
            desk.pos.clone().add(new THREE.Vector3(0, 1.3, 0)),
            this.camera,
            '即席バリケード!!',
            '#ffd43b',
            17
          );
        }
      };
    }

    return null;
  }

  private executeContextAction(ctx: { prompt: ContextPrompt; run: () => void }): void {
    ctx.run();
  }

  private maybeChatter(speaker: string, text: string, tone: 'normal' | 'heroine' | 'sos'): void {
    if (this.elapsed - this.lastChatterTime < 4.5) return;
    this.lastChatterTime = this.elapsed;
    this.hud.pushChatter(speaker, text, tone);
  }

  private buildHudSnapshot(
    contextPrompt: ContextPrompt | null,
    aliveEnemies: Enemy[]
  ): HudSnapshot {
    const waveCfg = this.waves.getCurrentWave();
    const boss = aliveEnemies.find((e) => e.kind === 'boss') ?? null;
    const scoreNow = calculateScoreBreakdown(this.buildCurrentScoreInput(false)).totalScore;

    return {
      hp: this.player.hp,
      maxHp: this.player.maxHp,
      delusionGauge: this.player.delusionGauge,
      awakened: this.player.awakened,
      awakenedTimeLeft: this.player.awakenedTimer,
      weapon: this.player.weapon,
      weaponDurability: this.player.weaponDurability,
      weaponMaxDurability: this.player.weaponMaxDurability,
      specialCooldownRatio: this.player.getSpecialCooldownRatio(),
      dodgeCooldownRatio: this.player.getDodgeCooldownRatio(),
      combo: this.combo,
      comboTimerRatio: this.combo > 0 ? Math.max(0, this.comboTimer / 3.2) : 0,
      score: scoreNow,
      kills: this.killsGrunt + this.killsGunner + this.killsShield + this.killsBoss,
      survivorsAlive: this.classmates.getAliveCount(),
      totalSurvivors: this.classmates.getTotalCount(),
      wave: waveCfg?.wave ?? 1,
      waveTitle: waveCfg?.title ?? '',
      enemiesRemaining: aliveEnemies.length + this.waves.getRemainingSpawnsCount(),
      bossHpRatio: boss ? boss.hp / boss.maxHp : null,
      bossName: '首領 ブラック・ファントム',
      contextPrompt,
      sosCount: this.classmates.getSosClassmates().length,
      muted: this.audio.isMuted()
    };
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.handleResize);
    this.audio.stopBgm();
    this.renderer.dispose();
  }
}
