import type { TurretId, WeaponId } from '../data';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private lastPlayed = new Map<string, number>();

  unlock(): void {
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.buildNoise();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  private buildNoise(): void {
    if (!this.ctx) return;
    const len = Math.floor(this.ctx.sampleRate * 0.5);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  private ok(key: string, gapMs: number): boolean {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return false;
    const now = performance.now();
    const prev = this.lastPlayed.get(key) ?? 0;
    if (now - prev < gapMs) return false;
    this.lastPlayed.set(key, now);
    return true;
  }

  playTap(): void {
    if (!this.ok('tap', 35)) return;
    this.tone(540, 820, 0.05, 'triangle', 0.08);
  }

  playSlash(weapon: WeaponId, step: number): void {
    if (!this.ok('slash', 65)) return;
    const pitchBoost = 1 + step * 0.08;
    if (weapon === 'greatsword') {
      this.noise(0.11, 950 * pitchBoost, 'bandpass', 0.14);
      this.tone(320 * pitchBoost, 110, 0.12, 'sawtooth', 0.09);
    } else if (weapon === 'twinblade') {
      this.noise(0.065, 2200 * pitchBoost, 'highpass', 0.11);
      this.tone(680 * pitchBoost, 280, 0.065, 'triangle', 0.08);
    } else {
      this.noise(0.14, 520 * pitchBoost, 'lowpass', 0.18);
      this.tone(190 * pitchBoost, 62, 0.15, 'triangle', 0.15);
    }
  }

  playHit(multiCount: number): void {
    if (!this.ok('hit', 42)) return;
    const boost = Math.min(1.6, 1 + multiCount * 0.08);
    this.tone(240 * boost, 75, 0.08, 'sawtooth', 0.12);
    this.noise(0.06, 1400, 'bandpass', 0.11);
  }

  playStrong(weapon: WeaponId): void {
    if (!this.ok('strong', 120)) return;
    const t = this.ctx!.currentTime;
    if (weapon === 'hammer') {
      this.noise(0.32, 340, 'lowpass', 0.25);
      this.toneAt(t, 160, 38, 0.3, 'sawtooth', 0.2);
      this.toneAt(t + 0.03, 920, 260, 0.18, 'sine', 0.12);
    } else if (weapon === 'greatsword') {
      this.noise(0.26, 750, 'bandpass', 0.22);
      this.toneAt(t, 440, 120, 0.24, 'sawtooth', 0.16);
    } else {
      this.noise(0.2, 2000, 'bandpass', 0.18);
      this.toneAt(t, 880, 360, 0.15, 'triangle', 0.14);
      this.toneAt(t + 0.08, 1080, 420, 0.14, 'triangle', 0.12);
    }
  }

  playDodge(): void {
    if (!this.ok('dodge', 90)) return;
    this.noise(0.1, 1600, 'bandpass', 0.11);
    this.tone(360, 740, 0.09, 'sine', 0.07);
  }

  playMusou(): void {
    if (!this.ok('musou', 300)) return;
    const t = this.ctx!.currentTime;
    this.toneAt(t, 330, 660, 0.18, 'sawtooth', 0.16);
    this.toneAt(t + 0.12, 440, 880, 0.22, 'sawtooth', 0.17);
    this.toneAt(t + 0.22, 660, 1320, 0.35, 'triangle', 0.18);
    this.noise(0.42, 460, 'lowpass', 0.24);
  }

  playExplosion(big: boolean): void {
    if (!this.ok(big ? 'big_boom' : 'boom', big ? 95 : 70)) return;
    this.noise(big ? 0.38 : 0.22, big ? 360 : 540, 'lowpass', big ? 0.25 : 0.15);
    this.tone(big ? 120 : 150, 28, big ? 0.32 : 0.18, 'sine', big ? 0.22 : 0.13);
  }

  playTurret(id: TurretId): void {
    if (!this.ok('turret_' + id, id === 'flame' ? 140 : 95)) return;
    if (id === 'sentry') {
      this.noise(0.035, 2200, 'bandpass', 0.055);
    } else if (id === 'flame') {
      this.noise(0.13, 520, 'bandpass', 0.06);
    } else if (id === 'tesla') {
      this.tone(980, 340, 0.09, 'sawtooth', 0.065);
    } else {
      this.noise(0.11, 1200, 'bandpass', 0.075);
      this.tone(250, 560, 0.1, 'triangle', 0.055);
    }
  }

  playBuild(): void {
    if (!this.ok('build', 60)) return;
    const t = this.ctx!.currentTime;
    this.toneAt(t, 340, 480, 0.08, 'triangle', 0.12);
    this.toneAt(t + 0.08, 480, 740, 0.11, 'triangle', 0.13);
  }

  playShelterHit(): void {
    if (!this.ok('shelter_hit', 180)) return;
    this.tone(105, 42, 0.14, 'sawtooth', 0.15);
    this.noise(0.09, 420, 'lowpass', 0.11);
  }

  playWaveStart(isBoss: boolean): void {
    if (!this.ok('wave', 300)) return;
    const t = this.ctx!.currentTime;
    if (isBoss) {
      this.toneAt(t, 190, 125, 0.35, 'sawtooth', 0.16);
      this.toneAt(t + 0.26, 170, 95, 0.45, 'sawtooth', 0.17);
    } else {
      this.toneAt(t, 380, 570, 0.14, 'triangle', 0.11);
      this.toneAt(t + 0.14, 570, 760, 0.18, 'triangle', 0.11);
    }
  }

  playGameOver(): void {
    if (!this.ok('gameover', 400)) return;
    const t = this.ctx!.currentTime;
    this.toneAt(t, 280, 210, 0.24, 'sawtooth', 0.14);
    this.toneAt(t + 0.24, 200, 130, 0.3, 'sawtooth', 0.14);
    this.toneAt(t + 0.52, 125, 58, 0.48, 'sawtooth', 0.16);
  }

  private tone(f1: number, f2: number, dur: number, type: OscillatorType, vol: number): void {
    if (!this.ctx) return;
    this.toneAt(this.ctx.currentTime, f1, f2, dur, type, vol);
  }

  private toneAt(t: number, f1: number, f2: number, dur: number, type: OscillatorType, vol: number): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f1, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.01);
  }

  private noise(dur: number, freq: number, type: BiquadFilterType, vol: number): void {
    if (!this.ctx || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const flt = this.ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.setValueAtTime(freq, t);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(flt).connect(g).connect(this.ctx.destination);
    src.start(t);
    src.stop(t + dur + 0.01);
  }
}
