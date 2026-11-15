// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { RAIN_HISS, brownNoise, loopable, rainNoise, seededRandom, sleepFadeWindow, volumeToGain } from './noise';

const RATE = 8000;
const peak = (samples: Float32Array) => samples.reduce((max, s) => Math.max(max, Math.abs(s)), 0);
const rms = (samples: Float32Array) => Math.sqrt(samples.reduce((sum, s) => sum + s * s, 0) / samples.length);
/** The largest jump between neighbouring samples. */
const maxStep = (samples: Float32Array) => {
  let max = 0;
  for (let i = 1; i < samples.length; i++) max = Math.max(max, Math.abs((samples[i] ?? 0) - (samples[i - 1] ?? 0)));
  return max;
};

describe('brown noise', () => {
  test('stays in range, peaks at 0.9 and is the same for the same seed', () => {
    const a = brownNoise(RATE * 2, seededRandom(1));
    expect(peak(a)).toBeCloseTo(0.9, 5);
    expect(Array.from(brownNoise(RATE * 2, seededRandom(1)))).toEqual(Array.from(a));
    expect(Array.from(brownNoise(RATE * 2, seededRandom(2)))).not.toEqual(Array.from(a));
  });

  test('moves slowly: neighbouring samples are close together', () => {
    const samples = brownNoise(RATE * 2, seededRandom(3));
    expect(maxStep(samples)).toBeLessThan(0.2);
  });
});

describe('rain', () => {
  test('never clips and is neither silent nor a wall of noise', () => {
    const samples = rainNoise(RATE * 2, RATE, seededRandom(4));
    expect(peak(samples)).toBeLessThanOrEqual(1);
    expect(rms(samples)).toBeGreaterThan(0.1);
    expect(rms(samples)).toBeLessThan(0.4);
  });

  test('drops make it louder than the hiss alone', () => {
    const hiss = rainNoise(RATE * 2, RATE, seededRandom(5), 0);
    const rain = rainNoise(RATE * 2, RATE, seededRandom(5), 45);
    expect(peak(hiss)).toBeLessThanOrEqual(RAIN_HISS);
    expect(rms(rain)).toBeGreaterThan(rms(hiss));
  });
});

describe('looping', () => {
  test('the end runs on into the beginning without a jump', () => {
    const fade = RATE / 2;
    const raw = brownNoise(RATE * 2 + fade, seededRandom(6));
    const loop = loopable(raw, fade);
    expect(loop).toHaveLength(RATE * 2);
    // Across the join the step is no bigger than anywhere else in the sound.
    const join = Math.abs((loop[0] ?? 0) - (loop[loop.length - 1] ?? 0));
    expect(join).toBeLessThanOrEqual(maxStep(raw));
    // Past the crossfade the sound is untouched.
    expect(loop[fade]).toBe(raw[fade]);
    expect(peak(loop)).toBeLessThanOrEqual(0.9 * Math.SQRT2);
  });

  test('a fade that does not fit leaves the sound as it was', () => {
    const raw = brownNoise(100, seededRandom(7));
    expect(Array.from(loopable(raw, 0))).toEqual(Array.from(raw));
    expect(Array.from(loopable(raw, 80))).toEqual(Array.from(raw));
  });
});

describe('volume', () => {
  test('is squared and clamped', () => {
    expect(volumeToGain(0)).toBe(0);
    expect(volumeToGain(0.5)).toBe(0.25);
    expect(volumeToGain(1)).toBe(1);
    expect(volumeToGain(3)).toBe(1);
    expect(volumeToGain(-1)).toBe(0);
    expect(volumeToGain(Number.NaN)).toBe(0);
  });
});

describe('sleep fade', () => {
  test('reaches silence exactly at the chosen minute, after a one-minute fade', () => {
    expect(sleepFadeWindow(15)).toEqual({ holdSeconds: 14 * 60, fadeSeconds: 60 });
    expect(sleepFadeWindow(60)).toEqual({ holdSeconds: 59 * 60, fadeSeconds: 60 });
  });

  test('a very short one fades for half its length', () => {
    expect(sleepFadeWindow(1)).toEqual({ holdSeconds: 30, fadeSeconds: 30 });
  });

  test('off means no fade', () => {
    expect(sleepFadeWindow(0)).toBeNull();
    expect(sleepFadeWindow(-5)).toBeNull();
    expect(sleepFadeWindow(Number.NaN)).toBeNull();
  });
});
