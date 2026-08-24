type SoundEvent =
  | 'bet_request'
  | 'bet_accepted'
  | 'bet_rejected'
  | 'countdown'
  | 'dice_throw'
  | 'dice_result'
  | 'chips_transfer'
  | 'win'
  | 'loss'
  | 'rotation';

/**
 * Dice audio is synthesised rather than sampled — the repo ships no audio
 * assets, and a filtered noise burst is a close enough stand-in for wood
 * rattling and striking felt.
 */
class SoundService {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private unlockBound = false;
  private muted = false;
  private volume = 0.7;

  setMuted(m: boolean) {
    this.muted = m;
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.volume;
  }

  /** Call on first user gesture so later play() calls are audible. */
  unlock() {
    const ctx = this.context();
    if (ctx?.state === 'suspended') void ctx.resume().catch(() => {});
  }

  play(event: SoundEvent) {
    if (this.muted || typeof window === 'undefined') return;
    const ctx = this.context();
    if (!ctx || !this.master) return;

    const run = () => this.playEvent(ctx, event);
    if (ctx.state === 'suspended') {
      void ctx.resume().then(run).catch(() => {});
      return;
    }
    run();
  }

  private playEvent(ctx: AudioContext, event: SoundEvent) {
    const now = ctx.currentTime;
    switch (event) {
      case 'dice_throw':
        this.rattle(ctx, now);
        break;
      case 'dice_result':
        this.clatter(ctx, now);
        break;
      case 'chips_transfer':
        this.chipClink(ctx, now);
        break;
      case 'win':
        this.winChime(ctx, now);
        break;
      case 'loss':
        this.lossBuzz(ctx, now);
        break;
      default:
        break;
    }
  }

  private context() {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      try {
        this.ctx = new Ctor();
      } catch {
        return null;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this.bindUnlock();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  /** Browsers keep the context suspended until the page sees a gesture. */
  private bindUnlock() {
    if (this.unlockBound) return;
    this.unlockBound = true;
    const resume = () => this.unlock();
    window.addEventListener('pointerdown', resume, { passive: true });
    window.addEventListener('keydown', resume, { passive: true });
  }

  private noiseBuffer(ctx: AudioContext) {
    if (this.noise) return this.noise;
    const frames = Math.floor(ctx.sampleRate * 0.5);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buffer;
    return buffer;
  }

  /**
   * One filtered noise burst. `sweepTo` bends the band upward over the burst,
   * which is what separates a shake from an impact.
   */
  private burst(
    ctx: AudioContext,
    at: number,
    opts: { duration: number; attack: number; freq: number; sweepTo?: number; q: number; gain: number },
  ) {
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx);
    src.loop = true;

    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = opts.q;
    band.frequency.setValueAtTime(opts.freq, at);
    if (opts.sweepTo) band.frequency.exponentialRampToValueAtTime(opts.sweepTo, at + opts.duration);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(opts.gain, at + opts.attack);
    env.gain.exponentialRampToValueAtTime(0.0001, at + opts.duration);

    src.connect(band).connect(env).connect(this.master!);
    src.start(at);
    src.stop(at + opts.duration + 0.02);
  }

  private thud(ctx: AudioContext, at: number, freq: number, gain: number) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, at);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.55, at + 0.09);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.1);

    osc.connect(env).connect(this.master!);
    osc.start(at);
    osc.stop(at + 0.12);
  }

  /** Throw — dice shaken and released. */
  private rattle(ctx: AudioContext, at: number) {
    this.burst(ctx, at, { duration: 0.34, attack: 0.05, freq: 900, sweepTo: 2600, q: 1.1, gain: 0.16 });
    for (let i = 0; i < 3; i++) {
      this.burst(ctx, at + 0.04 + i * 0.075, {
        duration: 0.05,
        attack: 0.004,
        freq: 2100 + i * 260,
        q: 5,
        gain: 0.1,
      });
    }
  }

  /** Landing — two hits on the felt, the second lighter. */
  private clatter(ctx: AudioContext, at: number) {
    this.burst(ctx, at, { duration: 0.07, attack: 0.003, freq: 1750, q: 3.4, gain: 0.26 });
    this.thud(ctx, at, 165, 0.2);
    this.burst(ctx, at + 0.1, { duration: 0.05, attack: 0.003, freq: 2200, q: 4, gain: 0.15 });
    this.thud(ctx, at + 0.1, 140, 0.1);
  }

  /** Chip stack sliding — staggered high-freq clinks. */
  private chipClink(ctx: AudioContext, at: number) {
    for (let i = 0; i < 5; i++) {
      const t = at + i * 0.08;
      this.burst(ctx, t, { duration: 0.05, attack: 0.002, freq: 3600 + i * 350, q: 7, gain: 0.14 });
      this.thud(ctx, t, 300 + i * 35, 0.1);
    }
  }

  /** Win — ascending major chord arpeggio. */
  private winChime(ctx: AudioContext, at: number) {
    const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
    for (let i = 0; i < notes.length; i++) {
      const t = at + i * 0.12;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(notes[i]!, t);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(env).connect(this.master!);
      osc.start(t);
      osc.stop(t + 0.4);
    }
  }

  /** Loss — short low descending tone. */
  private lossBuzz(ctx: AudioContext, at: number) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, at);
    osc.frequency.exponentialRampToValueAtTime(110, at + 0.3);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(0.1, at + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
    osc.connect(env).connect(this.master!);
    osc.start(at);
    osc.stop(at + 0.4);
  }
}

export const soundService = new SoundService();
