/**
 * The raw material for the ambient sounds, as pure functions: no audio objects here,
 * only arrays of samples and a little arithmetic, so all of it can be unit-tested.
 * Nothing is downloaded or bundled; every sound is made on the device.
 */

/** A source of numbers in [0, 1), like `Math.random`. */
export type Random = () => number;

/** A small seeded generator, for tests that need the same noise twice. */
export function seededRandom(seed: number): Random {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Brown noise: white noise run through a leaky integrator, so it rumbles low like a
 * distant waterfall. Scaled so its loudest sample is 0.9.
 */
export function brownNoise(length: number, random: Random): Float32Array {
  const out = new Float32Array(length);
  let last = 0;
  let peak = 0;
  for (let i = 0; i < length; i++) {
    last = (last + 0.02 * (random() * 2 - 1)) / 1.02;
    out[i] = last;
    peak = Math.max(peak, Math.abs(last));
  }
  if (peak > 0) {
    const scale = 0.9 / peak;
    for (let i = 0; i < length; i++) out[i] = (out[i] ?? 0) * scale;
  }
  return out;
}

/** How loud the steady hiss under the rain drops is, as a peak. */
export const RAIN_HISS = 0.28;

/**
 * Rain: a steady hiss with drops landing on top. Each drop is a tiny burst of noise
 * that dies away in a few milliseconds; about `dropsPerSecond` of them land each second.
 */
export function rainNoise(length: number, sampleRate: number, random: Random, dropsPerSecond = 45): Float32Array {
  const out = new Float32Array(length);
  const chance = dropsPerSecond / sampleRate;
  const decay = Math.exp(-1 / (0.004 * sampleRate));
  let drop = 0;
  for (let i = 0; i < length; i++) {
    if (random() < chance) drop = Math.max(drop, 0.2 + 0.5 * random());
    const sample = RAIN_HISS * (random() * 2 - 1) + drop * (random() * 2 - 1);
    out[i] = Math.max(-1, Math.min(1, sample));
    drop *= decay;
  }
  return out;
}

/**
 * Makes a stretch of sound loop without a click: the last `fade` samples are folded into
 * the first `fade`, so the end of the result runs straight on into its beginning.
 * The result is `fade` samples shorter than the input.
 */
export function loopable(samples: Float32Array, fade: number): Float32Array {
  const length = samples.length - fade;
  if (fade <= 0 || length <= fade) return samples.slice();
  const out = samples.slice(0, length);
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    // Equal-power crossfade keeps the loudness even through the join.
    out[i] = (samples[i] ?? 0) * Math.sqrt(t) + (samples[length + i] ?? 0) * Math.sqrt(1 - t);
  }
  return out;
}

/** Slider position (0 to 1) to loudness. Squared, because ears hear loudness that way. */
export function volumeToGain(volume: number): number {
  const v = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 0));
  return v * v;
}

/**
 * The sleep fade: the sound holds, then fades to silence, reaching it exactly `minutes`
 * after it began. The fade takes a minute, or half the time for anything shorter than two.
 * Null when there is no sleep fade.
 */
export function sleepFadeWindow(minutes: number): { holdSeconds: number; fadeSeconds: number } | null {
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  const total = minutes * 60;
  const fadeSeconds = Math.min(60, total / 2);
  return { holdSeconds: total - fadeSeconds, fadeSeconds };
}
