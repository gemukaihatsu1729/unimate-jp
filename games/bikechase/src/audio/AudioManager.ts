import type { PickupKind } from '../data';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted = false;

  // Continuous synthesis nodes
  private engineOsc1: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;

  private sirenOsc: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;

  private driftNoise: AudioBufferSourceNode | null = null;
  private driftFilter: BiquadFilterNode | null = null;
  private driftGain: GainNode | null = null;

  private engineActive = false;
  private sirenPhase = 0;

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(mute ? 0 : 0.72, this.ctx.currentTime, 0.04);
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  public unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.72;
      this.masterGain.connect(this.ctx.destination);
      this.setupContinuousLoops();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
  }

  private setupContinuousLoops(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    // 1. Motorcycle Engine Hum (sawtooth + triangle -> lowpass)
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 340;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;

    this.engineOsc1 = this.ctx.createOscillator();
    this.engineOsc1.type = 'sawtooth';
    this.engineOsc1.frequency.value = 72;

    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc2.type = 'triangle';
    this.engineOsc2.frequency.value = 144;

    this.engineOsc1.connect(this.engineFilter);
    this.engineOsc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.masterGain);
    this.engineOsc1.start(now);
    this.engineOsc2.start(now);

    // 2. Distance-modulated Police Siren
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'sine';
    this.sirenOsc.frequency.value = 660;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.masterGain);
    this.sirenOsc.start(now);

    // 3. Drift Tire Screech (bandpass filtered looping noise buffer)
    const bufLen = this.ctx.sampleRate;
    const noiseBuf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.driftNoise = this.ctx.createBufferSource();
    this.driftNoise.buffer = noiseBuf;
    this.driftNoise.loop = true;

    this.driftFilter = this.ctx.createBiquadFilter();
    this.driftFilter.type = 'bandpass';
    this.driftFilter.frequency.value = 1450;
    this.driftFilter.Q.value = 4.2;

    this.driftGain = this.ctx.createGain();
    this.driftGain.gain.value = 0;

    this.driftNoise.connect(this.driftFilter);
    this.driftFilter.connect(this.driftGain);
    this.driftGain.connect(this.masterGain);
    this.driftNoise.start(now);
  }

  public setEngineActive(active: boolean): void {
    this.engineActive = active;
    if (!active && this.ctx) {
      const t = this.ctx.currentTime;
      this.engineGain?.gain.setTargetAtTime(0, t, 0.06);
      this.sirenGain?.gain.setTargetAtTime(0, t, 0.06);
      this.driftGain?.gain.setTargetAtTime(0, t, 0.05);
    }
  }

  public updateContinuous(
    dt: number,
    speedNorm: number,
    isDrifting: boolean,
    isOverdrive: boolean,
    airborne: boolean,
    nearestPoliceDist: number
  ): void {
    if (!this.ctx || !this.engineActive || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    // Engine pitch & timbre
    const baseFreq = 58 + speedNorm * 95 + (isOverdrive ? 38 : 0) + (airborne ? 18 : 0);
    this.engineOsc1?.frequency.setTargetAtTime(baseFreq, now, 0.05);
    this.engineOsc2?.frequency.setTargetAtTime(baseFreq * 2.01, now, 0.05);
    this.engineFilter?.frequency.setTargetAtTime(
      260 + speedNorm * 580 + (isOverdrive ? 520 : 0),
      now,
      0.06
    );
    this.engineGain?.gain.setTargetAtTime(0.085 + speedNorm * 0.04, now, 0.06);

    // Police siren wail scaled by proximity
    this.sirenPhase += dt * 4.2;
    const sirenFreq = 720 + Math.sin(this.sirenPhase) * 185;
    this.sirenOsc?.frequency.setTargetAtTime(sirenFreq, now, 0.04);
    const proximity = Math.max(0, 1 - nearestPoliceDist / 56);
    this.sirenGain?.gain.setTargetAtTime(proximity * proximity * 0.055, now, 0.08);

    // Drift tire screech
    this.driftGain?.gain.setTargetAtTime(isDrifting && !airborne ? 0.075 : 0, now, 0.04);
  }

  private playTone(
    freqStart: number,
    freqEnd: number,
    duration: number,
    type: OscillatorType,
    volume: number
  ): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  public playNitroBurst(power = 1): void {
    this.playTone(190, 620, 0.32 * power, 'sawtooth', 0.16 * power);
    this.playTone(110, 340, 0.28 * power, 'triangle', 0.14 * power);
  }

  public playExplosion(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const dur = 0.45;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(480, now);
    filter.frequency.exponentialRampToValueAtTime(75, now + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(now);
    this.playTone(130, 36, 0.36, 'triangle', 0.24);
  }

  public playNearMiss(): void {
    this.playTone(540, 1180, 0.12, 'sine', 0.12);
    setTimeout(() => this.playTone(980, 420, 0.14, 'triangle', 0.1), 50);
  }

  public playPropSmash(): void {
    this.playTone(260, 120, 0.09, 'square', 0.08);
  }

  public playScrape(): void {
    this.playTone(320, 180, 0.09, 'sawtooth', 0.09);
  }

  public playJumpWhoosh(): void {
    this.playTone(220, 560, 0.22, 'sine', 0.12);
  }

  public playJumpLand(): void {
    this.playTone(180, 75, 0.16, 'triangle', 0.16);
    this.playTone(440, 880, 0.18, 'sine', 0.1);
  }

  public playPickup(_kind?: PickupKind): void {
    this.playTone(520, 1040, 0.18, 'triangle', 0.14);
  }

  public playDamage(): void {
    this.playTone(180, 52, 0.24, 'sawtooth', 0.24);
  }

  public playWantedUp(): void {
    this.playTone(523, 523, 0.1, 'square', 0.11);
    setTimeout(() => this.playTone(659, 659, 0.1, 'square', 0.11), 100);
    setTimeout(() => this.playTone(784, 1046, 0.22, 'square', 0.12), 200);
  }

  public playGameOver(): void {
    this.setEngineActive(false);
    this.playTone(392, 293, 0.22, 'sawtooth', 0.16);
    setTimeout(() => this.playTone(293, 146, 0.38, 'sawtooth', 0.18), 210);
  }
}
