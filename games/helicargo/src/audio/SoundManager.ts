export class SoundManager {
  private ctx: AudioContext | null = null;
  private rotorOsc: OscillatorNode | null = null;
  private rotorGain: GainNode | null = null;
  private muted = false;

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.rotorGain && this.ctx) {
      this.rotorGain.gain.setTargetAtTime(muted ? 0 : 0.025, this.ctx.currentTime, 0.04);
    }
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  startRotor(): void {
    this.unlock();
    if (!this.ctx || this.rotorOsc) return;
    try {
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.value = 34;

      filter.type = 'lowpass';
      filter.frequency.value = 135;

      gain.gain.value = this.muted ? 0 : 0.025;

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();

      this.rotorOsc = osc;
      this.rotorGain = gain;
    } catch {
      // Ignore audio errors on restricted environments
    }
  }

  updateRotor(speedNorm: number, active: boolean): void {
    if (!this.ctx || !this.rotorOsc || !this.rotorGain) return;
    const now = this.ctx.currentTime;
    const targetFreq = 32 + Math.min(1, speedNorm) * 16;
    const targetGain = !active || this.muted ? 0 : 0.022 + Math.min(1, speedNorm) * 0.016;
    this.rotorOsc.frequency.setTargetAtTime(targetFreq, now, 0.08);
    this.rotorGain.gain.setTargetAtTime(targetGain, now, 0.06);
  }

  stopRotor(): void {
    if (this.rotorGain && this.ctx) {
      this.rotorGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.04);
    }
  }

  playTone(freq: number, endFreq: number, duration: number, type: OscillatorType = 'triangle', volume = 0.12): void {
    if (this.muted || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);

      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + duration);
    } catch {
      // Ignore
    }
  }

  playStar(swingCatch: boolean): void {
    if (swingCatch) {
      this.playTone(660, 1320, 0.14, 'triangle', 0.14);
      setTimeout(() => this.playTone(990, 1760, 0.18, 'sine', 0.12), 65);
    } else {
      this.playTone(587, 880, 0.14, 'triangle', 0.12);
    }
  }

  playFuel(): void {
    this.playTone(440, 660, 0.1, 'sine', 0.12);
    setTimeout(() => this.playTone(660, 990, 0.15, 'sine', 0.12), 80);
  }

  playNearMiss(): void {
    this.playTone(740, 1180, 0.11, 'sine', 0.09);
  }

  playDamage(isCage: boolean): void {
    if (isCage) {
      this.playTone(320, 140, 0.22, 'sawtooth', 0.16);
      setTimeout(() => this.playTone(220, 410, 0.14, 'triangle', 0.11), 60);
    } else {
      this.playTone(170, 52, 0.28, 'sawtooth', 0.2);
    }
  }

  playRelayClear(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, idx) => {
      setTimeout(() => this.playTone(n, n * 1.02, 0.18, 'triangle', 0.13), idx * 75);
    });
  }

  playLowFuelBeep(): void {
    this.playTone(880, 740, 0.09, 'square', 0.05);
  }
}
