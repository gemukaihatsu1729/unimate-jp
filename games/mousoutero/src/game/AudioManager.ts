export class AudioManager {
  private ctx: AudioContext | null = null;
  private muted = false;
  private bgmTimer: number | null = null;
  private bgmStep = 0;
  private bgmPlaying = false;

  unlock(): void {
    try {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
    } catch {
      // Ignore audio failures on restricted devices
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.muted) {
      this.stopBgm();
    }
    return this.muted;
  }

  private ready(): AudioContext | null {
    if (this.muted || !this.ctx) return null;
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  playSchoolChime(): void {
    const ctx = this.ready();
    if (!ctx) return;
    // Westminster chime motif (Kin-Kon-Kan-Kon)
    const notes = [659.25, 523.25, 587.33, 392.0];
    const now = ctx.currentTime;
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.42);
      gain.gain.setValueAtTime(0.001, now + i * 0.42);
      gain.gain.exponentialRampToValueAtTime(0.14, now + i * 0.42 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.42 + 0.39);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.42);
      osc.stop(now + i * 0.42 + 0.42);
    });
  }

  playAlarm(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, now + i * 0.24);
      osc.frequency.linearRampToValueAtTime(640, now + i * 0.24 + 0.18);
      gain.gain.setValueAtTime(0.09, now + i * 0.24);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.24 + 0.21);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.24);
      osc.stop(now + i * 0.24 + 0.22);
    }
  }

  playExplosion(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.playNoiseBurst(0.45, 320, 0.24);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.42);
    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.46);
  }

  playSwing(): void {
    const ctx = this.ready();
    if (!ctx) return;
    this.playNoiseBurst(0.09, 1200, 0.08);
  }

  playHit(heavy = false): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = heavy ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(heavy ? 210 : 280, now);
    osc.frequency.exponentialRampToValueAtTime(heavy ? 52 : 75, now + (heavy ? 0.16 : 0.1));
    gain.gain.setValueAtTime(heavy ? 0.22 : 0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.17 : 0.11));
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.18);
    this.playNoiseBurst(0.06, 950, heavy ? 0.14 : 0.09);
  }

  playParry(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;
    [1320, 1980, 2640].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.015);
      gain.gain.setValueAtTime(0.11, now + idx * 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + idx * 0.015);
      osc.stop(now + 0.36);
    });
  }

  playGunshot(): void {
    const ctx = this.ready();
    if (!ctx) return;
    this.playNoiseBurst(0.08, 1700, 0.14);
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.07);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  playExtinguisher(): void {
    const ctx = this.ready();
    if (!ctx) return;
    this.playNoiseBurst(0.42, 2200, 0.16);
  }

  playDeskCrash(): void {
    const ctx = this.ready();
    if (!ctx) return;
    this.playNoiseBurst(0.16, 650, 0.2);
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.16);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  playPickup(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;
    [523.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.07);
      gain.gain.setValueAtTime(0.12, now + i * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.14);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.07);
      osc.stop(now + i * 0.07 + 0.15);
    });
  }

  playAwaken(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;
    [440, 554.37, 659.25, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + i * 0.06);
      gain.gain.setValueAtTime(0.1, now + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 0.36);
    });
  }

  playChalkSmack(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(920, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.09);
    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
    this.playNoiseBurst(0.08, 2600, 0.2);
  }

  playDodge(just = false): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(just ? 620 : 280, now);
    osc.frequency.exponentialRampToValueAtTime(just ? 1240 : 120, now + 0.14);
    gain.gain.setValueAtTime(just ? 0.14 : 0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  startActionBgm(): void {
    if (this.bgmPlaying) return;
    this.bgmPlaying = true;
    this.bgmStep = 0;

    // Energetic anime-rock style synth pulse loop (145 BPM 8th notes)
    const bassPattern = [110, 110, 130.81, 146.83, 110, 110, 164.81, 146.83];
    const leadPattern = [440, 0, 523.25, 587.33, 659.25, 0, 587.33, 523.25, 440, 0, 392, 440, 523.25, 659.25, 783.99, 0];

    this.bgmTimer = window.setInterval(() => {
      const ctx = this.ready();
      if (!ctx || !this.bgmPlaying) return;
      const now = ctx.currentTime;
      const step = this.bgmStep++;

      // Driving bass
      const bassFreq = bassPattern[step % bassPattern.length];
      const bOsc = ctx.createOscillator();
      const bGain = ctx.createGain();
      bOsc.type = 'sawtooth';
      bOsc.frequency.setValueAtTime(bassFreq, now);
      bGain.gain.setValueAtTime(0.042, now);
      bGain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
      bOsc.connect(bGain).connect(ctx.destination);
      bOsc.start(now);
      bOsc.stop(now + 0.18);

      // Kick on even beats
      if (step % 2 === 0) {
        const kOsc = ctx.createOscillator();
        const kGain = ctx.createGain();
        kOsc.type = 'sine';
        kOsc.frequency.setValueAtTime(120, now);
        kOsc.frequency.exponentialRampToValueAtTime(38, now + 0.09);
        kGain.gain.setValueAtTime(0.08, now);
        kGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        kOsc.connect(kGain).connect(ctx.destination);
        kOsc.start(now);
        kOsc.stop(now + 0.11);
      }

      // Heroic lead melody
      const leadFreq = leadPattern[step % leadPattern.length];
      if (leadFreq > 0) {
        const lOsc = ctx.createOscillator();
        const lGain = ctx.createGain();
        lOsc.type = 'square';
        lOsc.frequency.setValueAtTime(leadFreq, now);
        lGain.gain.setValueAtTime(0.024, now);
        lGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        lOsc.connect(lGain).connect(ctx.destination);
        lOsc.start(now);
        lOsc.stop(now + 0.17);
      }
    }, 205);
  }

  stopBgm(): void {
    this.bgmPlaying = false;
    if (this.bgmTimer !== null) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  private playNoiseBurst(duration: number, filterFreq: number, volume: number): void {
    const ctx = this.ready();
    if (!ctx) return;
    const sampleCount = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;

    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start(now);
    source.stop(now + duration + 0.02);
  }
}
