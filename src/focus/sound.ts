/**
 * Ambient sound, made on the device with the Web Audio API: rain, brown noise and a soft
 * hum. No audio files and no network. This is the only module that touches Web Audio.
 *
 * The chain is: voice (one sound) -> master (volume) -> sleep (the sleep fade)
 * -> hold (pause and resume) -> speakers. Fades are scheduled on the audio clock, so
 * they stay smooth when the page's own timers are throttled.
 */
import type { SoundChoice, SoundKind } from './config';
import { brownNoise, loopable, rainNoise, sleepFadeWindow, volumeToGain, type Random } from './noise';

export interface Ambient {
  /**
   * Call from a tap. Browsers only let sound start from a user gesture, so nothing is
   * created or played until this has been called once; what was asked for is remembered.
   */
  unlock(): void;
  /** Says what should be sounding right now. Safe to call as often as anything changes. */
  set(next: { kind: SoundChoice; volume: number; playing: boolean }): void;
  /** Starts the sleep fade from now: silent after this many minutes. 0 clears it. */
  sleepAfter(minutes: number): void;
  /** A soft two-note chime, at a fixed gentle level. */
  chime(): void;
}

interface Voice {
  /** Fades the voice in and out; starts silent. */
  level: GainNode;
  stop(): void;
}

const LOOP_SECONDS = 10;
const LOOP_FADE_SECONDS = 1;

function noiseBuffer(ctx: BaseAudioContext, make: (length: number) => Float32Array): AudioBuffer {
  const fade = Math.round(LOOP_FADE_SECONDS * ctx.sampleRate);
  const length = Math.round(LOOP_SECONDS * ctx.sampleRate);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  // Each ear gets its own noise, so the sound sits around the head and not inside it.
  for (let channel = 0; channel < 2; channel++) {
    buffer.getChannelData(channel).set(loopable(make(length + fade), fade));
  }
  return buffer;
}

/** A very slow swell, so the sound breathes a little and does not sit perfectly still. */
function swell(
  ctx: BaseAudioContext,
  base: number,
  depth: number,
  hertz: number,
): { node: GainNode; lfo: OscillatorNode } {
  const node = ctx.createGain();
  node.gain.value = base;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = hertz;
  const amount = ctx.createGain();
  amount.gain.value = depth;
  lfo.connect(amount).connect(node.gain);
  lfo.start();
  return { node, lfo };
}

/**
 * Builds one sound and connects it to `out`. It starts silent: raise `level.gain` to hear
 * it. Takes any audio context, so a sound can also be rendered offline and measured.
 */
export function buildVoice(
  ctx: BaseAudioContext,
  kind: SoundKind,
  out: AudioNode,
  random: Random = Math.random,
): Voice {
  const level = ctx.createGain();
  level.gain.value = 0;
  level.connect(out);
  const sources: AudioScheduledSourceNode[] = [];

  if (kind === 'hum') {
    // A low open fifth. Two close notes at the bottom beat slowly against each other.
    const partials: readonly [hertz: number, gain: number][] = [
      [110, 0.5],
      [110.4, 0.35],
      [164.8, 0.24],
      [220.3, 0.2],
      [329.6, 0.07],
    ];
    const mix = ctx.createGain();
    mix.gain.value = 0.3;
    const soften = ctx.createBiquadFilter();
    soften.type = 'lowpass';
    soften.frequency.value = 700;
    const breath = swell(ctx, 0.85, 0.15, 0.07);
    for (const [hertz, gain] of partials) {
      const osc = ctx.createOscillator();
      osc.frequency.value = hertz;
      const g = ctx.createGain();
      g.gain.value = gain;
      osc.connect(g).connect(mix);
      osc.start();
      sources.push(osc);
    }
    mix.connect(soften).connect(breath.node).connect(level);
    sources.push(breath.lfo);
  } else {
    const source = ctx.createBufferSource();
    source.loop = true;
    sources.push(source);
    if (kind === 'rain') {
      source.buffer = noiseBuffer(ctx, (length) => rainNoise(length, ctx.sampleRate, random));
      const low = ctx.createBiquadFilter();
      low.type = 'highpass';
      low.frequency.value = 350;
      const high = ctx.createBiquadFilter();
      high.type = 'lowpass';
      high.frequency.value = 7000;
      high.Q.value = 0.5;
      const gusts = swell(ctx, 0.8, 0.08, 0.11);
      source.connect(low).connect(high).connect(gusts.node).connect(level);
      sources.push(gusts.lfo);
    } else {
      source.buffer = noiseBuffer(ctx, (length) => brownNoise(length, random));
      const soften = ctx.createBiquadFilter();
      soften.type = 'lowpass';
      soften.frequency.value = 900;
      const gain = ctx.createGain();
      gain.gain.value = 0.9;
      source.connect(soften).connect(gain).connect(level);
    }
    source.start();
  }

  return {
    level,
    stop() {
      for (const s of sources) {
        try {
          s.stop();
        } catch {
          // already stopped
        }
      }
      level.disconnect();
    },
  };
}

/** Moves a gain smoothly from wherever it is now to `to`. */
function ramp(ctx: BaseAudioContext, param: AudioParam, to: number, seconds: number): void {
  const now = ctx.currentTime;
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(to, now + seconds);
}

const VOICE_IN_SECONDS = 1.5;
const VOICE_OUT_SECONDS = 1.2;
const HOLD_SECONDS = 0.6;

export function createAmbient(): Ambient {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let sleep: GainNode | null = null;
  let hold: GainNode | null = null;
  let voice: { kind: SoundKind; node: Voice } | null = null;
  let sounding = false;
  let idleTimer: number | undefined;
  /** What was last asked for, so it can be applied once the first tap allows sound. */
  let wanted: Parameters<Ambient['set']>[0] = { kind: 'off', volume: 0, playing: false };
  let wantedSleep: { minutes: number; askedAt: number } | null = null;

  /** The audio context, made on first use. Null where Web Audio does not exist. */
  function ensure(): AudioContext | null {
    if (ctx) return ctx;
    if (typeof AudioContext === 'undefined') return null;
    try {
      ctx = new AudioContext({ latencyHint: 'playback' });
    } catch {
      return null;
    }
    master = ctx.createGain();
    sleep = ctx.createGain();
    hold = ctx.createGain();
    hold.gain.value = 0;
    master.connect(sleep).connect(hold).connect(ctx.destination);
    return ctx;
  }

  const wake = (c: AudioContext) => {
    window.clearTimeout(idleTimer);
    if (c.state !== 'running') void c.resume().catch(() => undefined);
  };

  /** Lets the audio hardware rest once nothing is sounding, after any fade has finished. */
  const restLater = (c: AudioContext, afterMs: number) => {
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      if (!sounding && c.state === 'running') void c.suspend().catch(() => undefined);
    }, afterMs);
  };

  const dropVoice = (c: AudioContext) => {
    if (!voice) return;
    const old = voice.node;
    voice = null;
    ramp(c, old.level.gain, 0, VOICE_OUT_SECONDS);
    window.setTimeout(() => old.stop(), VOICE_OUT_SECONDS * 1000 + 200);
  };

  const applySleep = (c: AudioContext, minutes: number) => {
    if (!sleep) return;
    const now = c.currentTime;
    sleep.gain.cancelScheduledValues(now);
    sleep.gain.setValueAtTime(1, now);
    const fade = sleepFadeWindow(minutes);
    if (!fade) return;
    sleep.gain.setValueAtTime(1, now + fade.holdSeconds);
    sleep.gain.linearRampToValueAtTime(0, now + fade.holdSeconds + fade.fadeSeconds);
  };

  const ambient: Ambient = {
    unlock() {
      const first = ctx === null;
      const c = ensure();
      if (!c) return;
      if (first) {
        // Sound asked for before the first tap (a session picked up after a restart) starts now.
        if (wantedSleep) applySleep(c, Math.max(0, wantedSleep.minutes - (Date.now() - wantedSleep.askedAt) / 60_000));
        ambient.set(wanted);
      }
      if (sounding) wake(c);
    },

    set(next) {
      wanted = next;
      const { kind, volume, playing } = next;
      const c = ctx;
      if (!c || !master || !hold) return;
      master.gain.setTargetAtTime(volumeToGain(volume), c.currentTime, 0.08);

      if (kind === 'off') {
        dropVoice(c);
      } else if (voice?.kind !== kind) {
        dropVoice(c);
        const node = buildVoice(c, kind, master);
        ramp(c, node.level.gain, 1, VOICE_IN_SECONDS);
        voice = { kind, node };
      }

      if (playing && kind !== 'off') {
        sounding = true;
        wake(c);
        ramp(c, hold.gain, 1, HOLD_SECONDS);
      } else if (sounding) {
        sounding = false;
        ramp(c, hold.gain, 0, HOLD_SECONDS);
        restLater(c, (kind === 'off' ? VOICE_OUT_SECONDS : HOLD_SECONDS) * 1000 + 400);
      }
    },

    sleepAfter(minutes) {
      wantedSleep = minutes > 0 ? { minutes, askedAt: Date.now() } : null;
      if (ctx) applySleep(ctx, minutes);
    },

    chime() {
      // Without a tap first there is no sound to ring; the done card says it all anyway.
      const c = ctx;
      if (!c) return;
      wake(c);
      const start = c.currentTime + 0.05;
      // A fifth, the second note a moment after the first, each dying away slowly.
      const notes: readonly [hertz: number, delay: number][] = [
        [528, 0],
        [792, 0.4],
      ];
      for (const [hertz, delay] of notes) {
        const at = start + delay;
        const gain = c.createGain();
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.09, at + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 2.8);
        gain.connect(c.destination);
        for (const [multiple, level] of [
          [1, 1],
          [2.01, 0.18],
        ] as const) {
          const osc = c.createOscillator();
          osc.frequency.value = hertz * multiple;
          const partial = c.createGain();
          partial.gain.value = level;
          osc.connect(partial).connect(gain);
          osc.start(at);
          osc.stop(at + 3);
        }
      }
      if (!sounding) restLater(c, 4000);
    },
  };
  return ambient;
}
