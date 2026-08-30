/**
 * Web Audio API & Audio file player for authentic Ludo King game sound effects:
 * - Dice roll from user audio file (`dice-roll.mp3`)
 * - Token unlock pop
 * - Token step hops (pitch-shifted wooden/marble tap)
 * - Opponent token capture (punchy impact & slide)
 * - Safe zone star chime
 * - Victory celebration fanfare
 */

import diceRollAudioUrl from '../assets/dice-roll.mp3';

type TLudoSoundEvent =
  | 'dice_roll'
  | 'dice_land'
  | 'token_unlock'
  | 'token_step'
  | 'token_capture'
  | 'token_home'
  | 'game_win';

class LudoSoundService {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;
  private volume = 0.85;
  private isUnlocked = false;
  private diceAudioBuffer: AudioBuffer | null = null;
  private isLoadingBuffer = false;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  private async loadDiceAudio(ctx: AudioContext): Promise<AudioBuffer | null> {
    if (this.diceAudioBuffer) return this.diceAudioBuffer;
    if (this.isLoadingBuffer) return null;
    try {
      this.isLoadingBuffer = true;
      const res = await fetch(diceRollAudioUrl);
      const arrayBuffer = await res.arrayBuffer();
      this.diceAudioBuffer = await ctx.decodeAudioData(arrayBuffer);
      return this.diceAudioBuffer;
    } catch (e) {
      console.warn('Failed to load dice roll audio file, falling back to synth', e);
      return null;
    } finally {
      this.isLoadingBuffer = false;
    }
  }

  unlock() {
    if (this.isUnlocked) return;
    const ctx = this.getContext();
    if (ctx) {
      void this.loadDiceAudio(ctx);
      if (ctx.state === 'suspended') {
        void ctx
          .resume()
          .then(() => {
            this.isUnlocked = true;
          })
          .catch(() => {});
      } else {
        this.isUnlocked = true;
      }
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted;
  }

  setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.master) {
      this.master.gain.value = this.volume;
    }
  }

  play(event: TLudoSoundEvent) {
    if (this.muted || typeof window === 'undefined') return;
    const ctx = this.getContext();
    if (!ctx || !this.master) return;

    if (ctx.state === 'suspended') {
      void ctx
        .resume()
        .then(() => this.synthesize(ctx, event))
        .catch(() => {});
    } else {
      this.synthesize(ctx, event);
    }
  }

  private synthesize(ctx: AudioContext, event: TLudoSoundEvent) {
    const now = ctx.currentTime;
    switch (event) {
      case 'dice_roll':
        this.playDiceRoll(ctx, now);
        break;
      case 'dice_land':
        this.playDiceLand(ctx, now);
        break;
      case 'token_unlock':
        this.playTokenUnlock(ctx, now);
        break;
      case 'token_step':
        this.playTokenStep(ctx, now);
        break;
      case 'token_capture':
        this.playTokenCapture(ctx, now);
        break;
      case 'token_home':
        this.playTokenHome(ctx, now);
        break;
      case 'game_win':
        this.playGameWin(ctx, now);
        break;
    }
  }

  // Play user provided MP3 dice roll sound
  private playDiceRoll(ctx: AudioContext, now: number) {
    if (this.diceAudioBuffer) {
      const source = ctx.createBufferSource();
      source.buffer = this.diceAudioBuffer;
      source.connect(this.master!);
      source.start(now);
      return;
    }

    // Attempt to load and play immediately
    void this.loadDiceAudio(ctx).then((buffer) => {
      if (buffer && !this.muted) {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(this.master!);
        source.start(ctx.currentTime);
      } else {
        this.synthDiceRoll(ctx, now);
      }
    });
  }

  private synthDiceRoll(ctx: AudioContext, now: number) {
    const rattles = [0, 0.08, 0.16, 0.25, 0.35, 0.46, 0.58, 0.72, 0.86];
    for (const delay of rattles) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320 + Math.random() * 260, now + delay);
      osc.frequency.exponentialRampToValueAtTime(80, now + delay + 0.05);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1400 + Math.random() * 600, now + delay);
      filter.Q.setValueAtTime(3.5, now + delay);

      gain.gain.setValueAtTime(0.35 * (1 - delay * 0.5), now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.05);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.master!);

      osc.start(now + delay);
      osc.stop(now + delay + 0.05);
    }
  }

  // Dice landing
  private playDiceLand(ctx: AudioContext, now: number) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(540, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.09);

    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(this.master!);

    osc.start(now);
    osc.stop(now + 0.09);
  }

  // Token pops out of base on a 6
  private playTokenUnlock(ctx: AudioContext, now: number) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(780, now + 0.12);

    gain.gain.setValueAtTime(0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(this.master!);

    osc.start(now);
    osc.stop(now + 0.15);
  }

  // Token hop step (pitch-shifted wooden / marble tap)
  private playTokenStep(ctx: AudioContext, now: number) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.07);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

    osc.connect(gain);
    gain.connect(this.master!);

    osc.start(now);
    osc.stop(now + 0.07);
  }

  // Opponent token capture
  private playTokenCapture(ctx: AudioContext, now: number) {
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(220, now);
    osc1.frequency.exponentialRampToValueAtTime(40, now + 0.25);
    gain1.gain.setValueAtTime(0.6, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc1.connect(gain1);
    gain1.connect(this.master!);
    osc1.start(now);
    osc1.stop(now + 0.25);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(800, now + 0.05);
    osc2.frequency.exponentialRampToValueAtTime(150, now + 0.3);
    gain2.gain.setValueAtTime(0.3, now + 0.05);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc2.connect(gain2);
    gain2.connect(this.master!);
    osc2.start(now + 0.05);
    osc2.stop(now + 0.3);
  }

  // Token reaching center home
  private playTokenHome(ctx: AudioContext, now: number) {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + idx * 0.08;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.4, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

      osc.connect(gain);
      gain.connect(this.master!);

      osc.start(t);
      osc.stop(t + 0.25);
    });
  }

  // Victory Fanfare
  private playGameWin(ctx: AudioContext, now: number) {
    const chords = [
      { notes: [523.25, 659.25, 783.99], time: 0, dur: 0.18 },
      { notes: [587.33, 739.99, 880.0], time: 0.2, dur: 0.18 },
      { notes: [659.25, 830.61, 987.77], time: 0.4, dur: 0.22 },
      { notes: [783.99, 987.77, 1174.66], time: 0.65, dur: 0.22 },
      { notes: [1046.5, 1318.51, 1567.98], time: 0.9, dur: 0.6 },
    ];

    chords.forEach(({ notes, time, dur }) => {
      notes.forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t = now + time;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);

        gain.gain.setValueAtTime(0.25, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

        osc.connect(gain);
        gain.connect(this.master!);

        osc.start(t);
        osc.stop(t + dur);
      });
    });
  }
}

export const ludoSound = new LudoSoundService();
