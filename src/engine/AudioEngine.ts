import type { WeaponId } from '../game/types.ts';

class TacticalAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private volume = 0.75;

  public unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.ctx.destination);
      this.noiseBuffer = this.buildNoiseBuffer(this.ctx);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
    }
  }

  private buildNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = ctx.sampleRate * 1.5;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  public playGunshot(weaponId: WeaponId, suppressed: boolean, distance = 0): void {
    this.unlock();
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;

    const now = this.ctx.currentTime;
    const atten = distance <= 0 ? 1 : Math.max(0.04, 1 / (1 + distance * 0.09));

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = suppressed ? 'bandpass' : 'lowpass';
    const baseFreq =
      weaponId === 'msr7'
        ? suppressed ? 1100 : 2800
        : weaponId === 'vector9'
        ? suppressed ? 1400 : 3800
        : weaponId === 'p220'
        ? suppressed ? 1300 : 3400
        : suppressed ? 1200 : 3200;
    filter.frequency.setValueAtTime(baseFreq, now);
    filter.frequency.exponentialRampToValueAtTime(suppressed ? 340 : 420, now + (weaponId === 'msr7' ? 0.24 : 0.14));

    const noiseGain = this.ctx.createGain();
    const peak = (suppressed ? 0.28 : weaponId === 'msr7' ? 0.72 : 0.54) * atten;
    noiseGain.gain.setValueAtTime(peak, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + (suppressed ? 0.09 : weaponId === 'msr7' ? 0.28 : 0.16));

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    noise.start(now);
    noise.stop(now + 0.32);

    const osc = this.ctx.createOscillator();
    osc.type = suppressed ? 'triangle' : 'sawtooth';
    const startPitch = weaponId === 'msr7' ? 145 : weaponId === 'vector9' ? 220 : 175;
    osc.frequency.setValueAtTime(startPitch, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.08);

    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime((suppressed ? 0.14 : 0.35) * atten, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(oscGain);
    oscGain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  public playHitmarker(kind: 'body' | 'head' | 'kill'): void {
    this.unlock();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    const freq = kind === 'head' ? 1850 : kind === 'kill' ? 1320 : 980;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.65, now + 0.055);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(kind === 'head' ? 0.28 : 0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  public playReloadClick(stage: 'start' | 'end'): void {
    this.unlock();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(stage === 'start' ? 320 : 520, now);
    osc.frequency.exponentialRampToValueAtTime(stage === 'start' ? 180 : 880, now + 0.045);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.055);
  }

  public playFootstep(sprinting: boolean): void {
    this.unlock();
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(sprinting ? 480 : 320, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(sprinting ? 0.085 : 0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start(now);
    noise.stop(now + 0.085);
  }

  public playExplosion(distance: number): void {
    this.unlock();
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const atten = Math.max(0.08, 1 / (1 + distance * 0.05));

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(620, now);
    filter.frequency.exponentialRampToValueAtTime(75, now + 0.65);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.85 * atten, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.72);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start(now);
    noise.stop(now + 0.75);
  }

  public playUiTone(kind: 'loot' | 'exfil' | 'plate' | 'uav' | 'empty'): void {
    this.unlock();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    if (kind === 'empty') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1400, now);
      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.035);
      return;
    }

    osc.type = 'sine';
    const base = kind === 'exfil' ? 660 : kind === 'uav' ? 880 : kind === 'loot' ? 540 : 410;
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.setValueAtTime(base * 1.25, now + 0.08);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.24);
  }
}

export const AudioEngine = new TacticalAudioEngine();
