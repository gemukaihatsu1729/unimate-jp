import * as THREE from 'three';
import type {
  GamePhase,
  HudSnapshot,
  RankingEntry,
  ScoreBreakdown
} from '../types';
import { WEAPON_SPECS } from '../types';
import type { ClassmateEntity } from '../game/entities/ClassmateManager';
import {
  buildLineShareUrl,
  buildShareText,
  buildXShareUrl,
  getGameShareUrl,
  getResultCommentary
} from '../game/ResultShare';

export class HudManager {
  private titleScreen = document.getElementById('title-screen')!;
  private rankingModal = document.getElementById('ranking-modal')!;
  private resultScreen = document.getElementById('result-screen')!;
  private hudRoot = document.getElementById('hud-root')!;
  private cutinOverlay = document.getElementById('cutin-overlay')!;
  private dialogueOverlay = document.getElementById('dialogue-overlay')!;
  private popupsLayer = document.getElementById('popups-layer')!;

  private nameInput = document.getElementById('player-name-input') as HTMLInputElement;
  private modalRankingList = document.getElementById('modal-ranking-list')!;
  private resultRankingList = document.getElementById('result-ranking-list')!;

  private hudPlayerName = document.getElementById('hud-player-name')!;
  private hudHpText = document.getElementById('hud-hp-text')!;
  private hudHpFill = document.getElementById('hud-hp-fill')!;
  private hudDelusionFill = document.getElementById('hud-delusion-fill')!;
  private hudDelusionLabel = document.getElementById('hud-delusion-label')!;
  private hudWaveBadge = document.getElementById('hud-wave-badge')!;
  private hudWaveTitle = document.getElementById('hud-wave-title')!;
  private hudSurvivors = document.getElementById('hud-survivors')!;
  private hudSurvivorChip = document.getElementById('hud-survivor-chip')!;
  private hudKills = document.getElementById('hud-kills')!;
  private hudScore = document.getElementById('hud-score')!;
  private btnMute = document.getElementById('btn-toggle-mute')!;

  private bossBarWrap = document.getElementById('boss-bar-wrap')!;
  private bossNameLabel = document.getElementById('boss-name-label')!;
  private bossHpFill = document.getElementById('boss-hp-fill')!;

  private comboWrap = document.getElementById('combo-wrap')!;
  private comboCount = document.getElementById('combo-count')!;
  private comboTimerFill = document.getElementById('combo-timer-fill')!;
  private chatterFeed = document.getElementById('chatter-feed')!;

  private weaponIcon = document.getElementById('hud-weapon-icon')!;
  private weaponName = document.getElementById('hud-weapon-name')!;
  private weaponDurability = document.getElementById('hud-weapon-durability')!;

  private btnAwaken = document.getElementById('btn-awaken')!;
  private btnContext = document.getElementById('btn-context')!;
  private btnContextLabel = document.getElementById('btn-context-label')!;
  private btnContextSub = document.getElementById('btn-context-sub')!;
  private btnSpecialIcon = document.getElementById('btn-special-icon')!;
  private btnSpecialLabel = document.getElementById('btn-special-label')!;
  private cdSpecial = document.getElementById('cd-special')!;
  private cdDodge = document.getElementById('cd-dodge')!;

  private cutinKicker = document.getElementById('cutin-kicker')!;
  private cutinTitle = document.getElementById('cutin-title')!;
  private cutinSub = document.getElementById('cutin-sub')!;

  private dialogueSpeaker = document.getElementById('dialogue-speaker')!;
  private dialogueText = document.getElementById('dialogue-text')!;
  private btnSkipIntro = document.getElementById('btn-skip-intro')!;

  private fxDamage = document.getElementById('fx-damage')!;
  private fxSlowmo = document.getElementById('fx-slowmo')!;
  private fxAwakened = document.getElementById('fx-awakened')!;
  private fxWhiteout = document.getElementById('fx-whiteout')!;

  private cutinTimer: number | null = null;
  private damageFlashTimer: number | null = null;
  private shareFeedbackTimer: number | null = null;
  private latestShareText = '';
  private latestShareUrl = '';
  private shareFeedbackEl = document.getElementById('share-feedback')!;
  private sosElements = new Map<string, HTMLDivElement>();
  private projVec = new THREE.Vector3();

  constructor(callbacks: {
    onStart: (playerName: string) => void;
    onOpenRanking: () => void;
    onRetry: () => void;
    onBackTitle: () => void;
    onSkipIntro: () => void;
    onToggleMute: () => void;
  }) {
    document.getElementById('btn-start-game')!.addEventListener('click', () => {
      callbacks.onStart(this.nameInput.value);
    });
    document.getElementById('btn-open-ranking')!.addEventListener('click', () => {
      callbacks.onOpenRanking();
      this.rankingModal.classList.add('active');
    });
    const closeRanking = () => this.rankingModal.classList.remove('active');
    document.getElementById('btn-close-ranking')!.addEventListener('click', closeRanking);
    document.getElementById('btn-close-ranking-bottom')!.addEventListener('click', closeRanking);

    document.getElementById('btn-retry')!.addEventListener('click', () => callbacks.onRetry());
    document.getElementById('btn-back-title')!.addEventListener('click', () => callbacks.onBackTitle());
    this.btnSkipIntro.addEventListener('click', () => callbacks.onSkipIntro());
    this.btnMute.addEventListener('click', () => callbacks.onToggleMute());

    document.getElementById('btn-share-x')!.addEventListener('click', () => {
      if (!this.latestShareText) return;
      window.open(buildXShareUrl(this.latestShareText, this.latestShareUrl), '_blank', 'noopener,noreferrer');
    });
    document.getElementById('btn-share-line')!.addEventListener('click', () => {
      if (!this.latestShareText) return;
      window.open(buildLineShareUrl(this.latestShareText, this.latestShareUrl), '_blank', 'noopener,noreferrer');
    });
    document.getElementById('btn-share-native')!.addEventListener('click', () => {
      void this.handleNativeOrCopyShare();
    });
  }

  private async handleNativeOrCopyShare(): Promise<void> {
    if (!this.latestShareText) return;
    const fullText = `${this.latestShareText}\n${this.latestShareUrl}`;

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: '授業中妄想クライシス',
          text: this.latestShareText,
          url: this.latestShareUrl
        });
        this.showShareFeedback('✨ 結果をシェアしました！');
        return;
      } catch (err) {
        // Ignore user cancel; fallback to copy on unsupported errors
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
    this.shareFeedbackEl.textContent = message;
    if (this.shareFeedbackTimer !== null) clearTimeout(this.shareFeedbackTimer);
    this.shareFeedbackTimer = window.setTimeout(() => {
      this.shareFeedbackEl.textContent = '';
    }, 3200);
  }

  setInitialName(name: string): void {
    this.nameInput.value = name;
  }

  setPlayerNameLabel(name: string): void {
    this.hudPlayerName.textContent = name;
  }

  setPhase(phase: GamePhase): void {
    this.titleScreen.classList.toggle('active', phase === 'title');
    this.resultScreen.classList.toggle('active', phase === 'result');
    this.hudRoot.classList.toggle('active', phase === 'playing');

    if (phase !== 'intro' && phase !== 'victory_ochi' && phase !== 'defeat_ochi') {
      this.hideDialogue();
    }
    if (phase !== 'playing') {
      this.clearSosMarkers();
    }
  }

  showDialogue(speaker: string, text: string, showSkip: boolean): void {
    this.dialogueSpeaker.textContent = speaker;
    this.dialogueText.textContent = text;
    this.btnSkipIntro.style.display = showSkip ? 'inline-block' : 'none';
    this.dialogueOverlay.classList.add('active');
  }

  hideDialogue(): void {
    this.dialogueOverlay.classList.remove('active');
  }

  showCutin(kicker: string, title: string, sub: string, durationMs = 1750): void {
    this.cutinKicker.textContent = kicker;
    this.cutinTitle.textContent = title;
    this.cutinSub.textContent = sub;
    this.cutinOverlay.classList.add('active');
    if (this.cutinTimer !== null) clearTimeout(this.cutinTimer);
    this.cutinTimer = window.setTimeout(() => {
      this.cutinOverlay.classList.remove('active');
      this.cutinTimer = null;
    }, durationMs);
  }

  pushChatter(speaker: string, text: string, tone: 'normal' | 'heroine' | 'sos' = 'normal'): void {
    const item = document.createElement('div');
    item.className = `chatter-item ${tone !== 'normal' ? tone : ''}`;
    item.textContent = `${speaker}「${text}」`;
    this.chatterFeed.prepend(item);
    while (this.chatterFeed.children.length > 3) {
      this.chatterFeed.lastElementChild?.remove();
    }
    window.setTimeout(() => {
      item.remove();
    }, 4200);
  }

  clearChatter(): void {
    this.chatterFeed.innerHTML = '';
  }

  flashDamage(): void {
    this.fxDamage.style.opacity = '1';
    if (this.damageFlashTimer !== null) clearTimeout(this.damageFlashTimer);
    this.damageFlashTimer = window.setTimeout(() => {
      this.fxDamage.style.opacity = '0';
    }, 180);
  }

  setSlowmoFx(active: boolean): void {
    this.fxSlowmo.style.opacity = active ? '1' : '0';
  }

  setAwakenedFx(active: boolean): void {
    this.fxAwakened.style.opacity = active ? '1' : '0';
  }

  setWhiteout(opacity: number): void {
    this.fxWhiteout.style.opacity = String(opacity);
  }

  spawnFloatingPopup(
    worldPos: THREE.Vector3,
    camera: THREE.Camera,
    text: string,
    color = '#ffd43b',
    fontSize = 18
  ): void {
    this.projVec.copy(worldPos).project(camera);
    if (this.projVec.z > 1) return;
    const x = (this.projVec.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-this.projVec.y * 0.5 + 0.5) * window.innerHeight;

    const el = document.createElement('div');
    el.className = 'floating-pop';
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.color = color;
    el.style.fontSize = `${fontSize}px`;
    this.popupsLayer.appendChild(el);
    window.setTimeout(() => el.remove(), 860);
  }

  updateSosMarkers(classmates: ClassmateEntity[], camera: THREE.Camera): void {
    const activeIds = new Set<string>();
    const w = window.innerWidth;
    const h = window.innerHeight;

    for (const cm of classmates) {
      if (cm.fainted || !cm.sos) continue;
      activeIds.add(cm.id);

      let marker = this.sosElements.get(cm.id);
      if (!marker) {
        marker = document.createElement('div');
        marker.className = 'sos-marker';
        this.popupsLayer.appendChild(marker);
        this.sosElements.set(cm.id, marker);
      }

      this.projVec.set(cm.pos.x, 1.95, cm.pos.z).project(camera);
      let sx = (this.projVec.x * 0.5 + 0.5) * w;
      let sy = (-this.projVec.y * 0.5 + 0.5) * h;

      // Clamp to screen edges if behind or outside viewport so player always knows where SOS is!
      if (this.projVec.z > 1) {
        sx = w - sx;
        sy = h - 180;
      }
      sx = Math.max(58, Math.min(w - 64, sx));
      sy = Math.max(96, Math.min(h - 210, sy));

      marker.style.left = `${sx}px`;
      marker.style.top = `${sy}px`;
      const hpPct = Math.round((cm.hp / cm.maxHp) * 100);
      marker.textContent = `🆘 ${cm.name} ${hpPct}%`;
    }

    for (const [id, el] of this.sosElements) {
      if (!activeIds.has(id)) {
        el.remove();
        this.sosElements.delete(id);
      }
    }
  }

  clearSosMarkers(): void {
    for (const el of this.sosElements.values()) {
      el.remove();
    }
    this.sosElements.clear();
  }

  updateHud(s: HudSnapshot): void {
    const hpPct = Math.max(0, Math.min(100, (s.hp / s.maxHp) * 100));
    this.hudHpText.textContent = `${Math.ceil(s.hp)} / ${s.maxHp}`;
    this.hudHpFill.style.width = `${hpPct}%`;
    this.hudHpFill.classList.toggle('low', hpPct <= 30);

    const delPct = Math.max(0, Math.min(100, s.delusionGauge));
    this.hudDelusionFill.style.width = `${delPct}%`;
    this.hudDelusionLabel.textContent = s.awakened
      ? `⚡ 妄想覚醒中 ${s.awakenedTimeLeft.toFixed(1)}s`
      : delPct >= 100
      ? '⚡ 覚醒READY！'
      : `妄想覚醒 ${Math.floor(delPct)}%`;

    this.btnAwaken.classList.toggle('ready', !s.awakened && delPct >= 100);
    this.setAwakenedFx(s.awakened);

    this.hudWaveBadge.textContent = `WAVE ${s.wave}`;
    this.hudWaveTitle.textContent = `${s.waveTitle} (残${s.enemiesRemaining})`;
    this.hudSurvivors.textContent = `${s.survivorsAlive}/${s.totalSurvivors}`;
    this.hudSurvivorChip.classList.toggle('danger', s.sosCount > 0);
    this.hudKills.textContent = String(s.kills);
    this.hudScore.textContent = s.score.toLocaleString();
    this.btnMute.textContent = s.muted ? '🔇' : '🔊';

    if (s.bossHpRatio !== null) {
      this.bossBarWrap.classList.add('active');
      this.bossNameLabel.textContent = `💀 ${s.bossName}`;
      this.bossHpFill.style.width = `${Math.max(0, s.bossHpRatio * 100)}%`;
    } else {
      this.bossBarWrap.classList.remove('active');
    }

    if (s.combo >= 2) {
      this.comboWrap.classList.add('active');
      this.comboCount.textContent = String(s.combo);
      this.comboTimerFill.style.width = `${Math.max(0, s.comboTimerRatio * 100)}%`;
    } else {
      this.comboWrap.classList.remove('active');
    }

    const spec = WEAPON_SPECS[s.weapon];
    this.weaponIcon.textContent = spec.icon;
    this.weaponName.textContent = spec.name;
    this.weaponDurability.textContent =
      s.weaponMaxDurability === 0 ? '∞ 無限' : `耐久 ${s.weaponDurability} / ${s.weaponMaxDurability}`;

    this.btnSpecialIcon.textContent = spec.icon;
    this.btnSpecialLabel.textContent = spec.specialButtonLabel;
    this.cdSpecial.style.height = `${Math.round(s.specialCooldownRatio * 100)}%`;
    this.cdDodge.style.height = `${Math.round(s.dodgeCooldownRatio * 100)}%`;

    if (s.contextPrompt) {
      this.btnContext.classList.add('visible');
      this.btnContextLabel.textContent = s.contextPrompt.label;
      this.btnContextSub.textContent = s.contextPrompt.sublabel ?? 'タップ';
    } else {
      this.btnContext.classList.remove('visible');
    }
  }

  renderRankingModal(entries: RankingEntry[]): void {
    this.renderRankingInto(this.modalRankingList, entries, null);
  }

  showResult(opts: {
    cleared: boolean;
    playerName: string;
    breakdown: ScoreBreakdown;
    maxCombo: number;
    rankings: RankingEntry[];
    currentEntryId: string;
    rankPosition: number | null;
  }): void {
    const kicker = document.getElementById('result-kicker')!;
    const headline = document.getElementById('result-headline')!;
    const stamp = document.getElementById('result-rank-stamp')!;
    const quote = document.getElementById('result-teacher-quote')!;
    const totalEl = document.getElementById('result-total-score')!;
    const badge = document.getElementById('result-new-rank-badge')!;
    const bdEl = document.getElementById('result-breakdown')!;

    const commentary = getResultCommentary({
      playerName: opts.playerName,
      cleared: opts.cleared,
      survivorsAlive: opts.breakdown.survivorsAlive,
      totalSurvivors: opts.breakdown.totalSurvivors
    });

    kicker.textContent = opts.cleared
      ? `現実復帰レポート（生存 ${opts.breakdown.survivorsAlive}/${opts.breakdown.totalSurvivors}名）`
      : `現実復帰レポート（机から落下・生存 ${opts.breakdown.survivorsAlive}/${opts.breakdown.totalSurvivors}名）`;
    headline.textContent = commentary.headline;

    stamp.textContent = opts.breakdown.rank;
    stamp.className = `rank-stamp rank-${opts.breakdown.rank}`;
    quote.textContent = commentary.teacherQuote;

    this.latestShareUrl = getGameShareUrl();
    this.latestShareText = buildShareText({
      playerName: opts.playerName,
      breakdown: opts.breakdown,
      rankPosition: opts.rankPosition,
      cleared: opts.cleared,
      gameUrl: this.latestShareUrl
    });
    this.shareFeedbackEl.textContent = '';

    totalEl.textContent = opts.breakdown.totalScore.toLocaleString();
    if (opts.rankPosition !== null) {
      badge.textContent =
        opts.rankPosition === 1
          ? '👑 校内妄想ランキング 1位 達成！！'
          : `🏆 ランキング ${opts.rankPosition}位 にランクイン！`;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }

    const b = opts.breakdown;
    const rows: [string, string][] = [
      [`撃破数 (${b.totalKills}体)`, `+${b.killScore.toLocaleString()}`],
      [`生存者 (${b.survivorsAlive}/${b.totalSurvivors}名)`, `+${b.survivorScore.toLocaleString()}`],
      [`最大コンボ (${opts.maxCombo})`, `+${b.comboScore.toLocaleString()}`],
      ['備品・技ボーナス', `+${b.techBonus.toLocaleString()}`]
    ];
    if (b.perfectDefenseBonus > 0) {
      rows.push(['全員生存ボーナス', `+${b.perfectDefenseBonus.toLocaleString()}`]);
    }
    if (b.clearBonus > 0) {
      rows.push(['ボス撃破ボーナス', `+${b.clearBonus.toLocaleString()}`]);
    }

    bdEl.innerHTML = rows
      .map(
        ([label, val]) =>
          `<div class="bd-row"><span class="bd-label">${label}</span><span class="bd-val">${val}</span></div>`
      )
      .join('');

    this.renderRankingInto(this.resultRankingList, opts.rankings, opts.currentEntryId);
    this.setPhase('result');
  }

  private renderRankingInto(
    container: HTMLElement,
    entries: RankingEntry[],
    highlightId: string | null
  ): void {
    container.innerHTML = entries
      .map((entry, idx) => {
        const pos = idx + 1;
        const posClass = pos === 1 ? 'top1' : pos === 2 ? 'top2' : pos === 3 ? 'top3' : '';
        const medal = pos === 1 ? '👑' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : String(pos);
        const isCurrent = highlightId !== null && entry.id === highlightId;
        return `
          <div class="ranking-row ${isCurrent ? 'is-current' : ''}">
            <div class="rank-pos ${posClass}">${medal}</div>
            <div class="rank-info">
              <div class="rank-name">${escapeHtml(entry.playerName)}${isCurrent ? ' ◀ NOW' : ''}</div>
              <div class="rank-meta">撃破 ${entry.kills}体 ／ 生存 ${entry.survivorsAlive}/${entry.totalSurvivors}名${entry.cleared ? ' ／ 制圧' : ''}</div>
            </div>
            <div class="rank-grade-pill rank-${entry.rank}">${entry.rank}</div>
            <div class="rank-score">${entry.score.toLocaleString()}</div>
          </div>
        `;
      })
      .join('');

    if (highlightId !== null) {
      const currentRow = container.querySelector('.ranking-row.is-current');
      if (currentRow && typeof currentRow.scrollIntoView === 'function') {
        currentRow.scrollIntoView({ block: 'nearest' });
      }
    }
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
