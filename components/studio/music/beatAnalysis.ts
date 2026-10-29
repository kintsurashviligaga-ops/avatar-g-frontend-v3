/**
 * Genuine, seek-stable music energy and beat-envelope extraction.
 *
 * This analyzes the actual decoded PCM from the delivered track. Nothing is
 * "animated to a fixed BPM". The track's audio.currentTime is the only clock.
 * No network calls or browser API required by this pure module.
 */
export const BEAT_FPS = 50;
export const MAX_ANALYZED_SECONDS = 180;

export interface BeatFrame {
  /** normalized broadband RMS (0–1), for fluid, gentle motion */
  energy: number;
  /** normalized sub-180Hz bass power (0–1), for center/radius response */
  bass: number;
  /** detected percussive transient (0–1), with a short post-hit decay */
  beat: number;
}

export interface BeatTrack {
  fps: number;
  duration: number;
  frames: BeatFrame[];
}

const clamp = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));

function percentile(values: number[], ratio: number): number {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!sorted.length) return 0;
  return sorted[Math.floor(Math.min(sorted.length - 1, sorted.length * ratio))] ?? 0;
}

/** Same shape as AudioBuffer for deterministic synthetic-signal unit tests. */
export interface PcmSource {
  sampleRate: number;
  length: number;
  numberOfChannels: number;
  getChannelData(channel: number): Float32Array;
}

export function analyzePcm(audio: PcmSource): BeatTrack {
  const rate = audio.sampleRate;
  if (!Number.isFinite(rate) || rate < 4000 || !audio.length || !audio.numberOfChannels) {
    return { fps: BEAT_FPS, duration: 0, frames: [] };
  }
  const samples = Math.min(audio.length, Math.ceil(rate * MAX_ANALYZED_SECONDS));
  const hop = Math.max(1, Math.round(rate / BEAT_FPS));
  const n = Math.ceil(samples / hop);
  const channelA = audio.getChannelData(0);
  const channelB = audio.numberOfChannels > 1 ? audio.getChannelData(1) : channelA;
  const bass: number[] = [];
  const high: number[] = [];
  const energy: number[] = [];

  // One-pole LP isolates bass and kick; high frequencies help distinguish
  // snare/hi-hat transients. Work on both channels, without any FFT allocation.
  const a = 1 - Math.exp(-2 * Math.PI * 170 / rate);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    let b = 0;
    let h = 0;
    let e = 0;
    const start = i * hop;
    const end = Math.min(samples, start + hop);
    for (let j = start; j < end; j++) {
      const s = 0.5 * ((channelA[j] ?? 0) + (channelB[j] ?? 0));
      lp += a * (s - lp);
      b += lp * lp;
      const hp = s - lp;
      h += hp * hp;
      e += s * s;
    }
    const count = Math.max(1, end - start);
    bass.push(Math.sqrt(b / count));
    high.push(Math.sqrt(h / count));
    energy.push(Math.sqrt(e / count));
  }
  const bRef = Math.max(0.002, percentile(bass, 0.95));
  const hRef = Math.max(0.002, percentile(high, 0.95));
  const eRef = Math.max(0.002, percentile(energy, 0.95));

  const bNorm = bass.map(v => clamp(v / bRef));
  const hNorm = high.map(v => clamp(v / hRef));
  const eNorm = energy.map(v => clamp(v / eRef));

  // Spectral-band positive flux identifies the actual kick/snare attack.
  // Independent gain normalization avoids calling a louder sustained note a beat.
  const novelty = bNorm.map((b, i) => {
    if (!i) return 0;
    const bassBefore = (bNorm[i - 1]! + (bNorm[Math.max(0, i - 2)] ?? 0)) * 0.5;
    const highBefore = (hNorm[i - 1]! + (hNorm[Math.max(0, i - 2)] ?? 0)) * 0.5;
    return Math.max(0, b - bassBefore) * 0.8
      + Math.max(0, hNorm[i]! - highBefore) * 0.3;
  });
  const floor = Math.max(0.018, percentile(novelty, 0.68) * 1.5);
  const peak = Math.max(floor + 0.045, percentile(novelty, 0.98));
  const beat = new Array<number>(n).fill(0);

  for (let i = 2; i < n - 1; i++) {
    const magnitude = novelty[i]!;
    if (magnitude <= floor || magnitude < novelty[i - 1]! || magnitude < novelty[i + 1]!) continue;
    const level = clamp((magnitude - floor) / (peak - floor));
    // 180ms attack trail follows the real transient; seeks remain deterministic.
    for (let offset = 0; offset <= 9 && i + offset < n; offset++) {
      const release = Math.exp(-offset / 3);
      beat[i + offset] = Math.max(beat[i + offset]!, level * release);
    }
  }
  return {
    fps: BEAT_FPS,
    duration: samples / rate,
    frames: beat.map((hit, i) => ({
      bass: bNorm[i]!,
      energy: eNorm[i]!,
      beat: hit,
    })),
  };
}

export function beatAtTime(track: BeatTrack | null, seconds: number): BeatFrame {
  if (!track || !track.frames.length || !Number.isFinite(seconds) || seconds < 0) {
    return { energy: 0, bass: 0, beat: 0 };
  }
  // Linear interpolation avoids visual jumps at the 20ms analysis frame boundary.
  const time = Math.min(seconds * track.fps, track.frames.length - 1);
  const index = Math.floor(time);
  const mix = time - index;
  const x = track.frames[index]!;
  const y = track.frames[Math.min(index + 1, track.frames.length - 1)]!;
  return {
    energy: x.energy + (y.energy - x.energy) * mix,
    bass: x.bass + (y.bass - x.bass) * mix,
    beat: x.beat + (y.beat - x.beat) * mix,
  };
}

/**
 * Bounded, credential-free fetch of the same time-limited media URL already
 * accessible to this user. Does not alter the <audio> element's native loading
 * or set crossOrigin (which can break Safari playback).
 *
 * If the storage host omits CORS headers, this throws; caller MUST expose the
 * unavailable state, rather than pretending a timed cosmetic pulse matches BPM.
 */
export async function loadBeatTrack(
  src: string,
  signal: AbortSignal,
): Promise<BeatTrack> {
  const MAX_BYTES = 24 * 1024 * 1024;
  const url = new URL(src, window.location.href);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.origin === window.location.origin)) {
    throw new Error('media_scheme_unsupported');
  }
  const response = await fetch(url.href, {
    method: 'GET', credentials: 'omit', mode: 'cors', signal,
    cache: 'no-store',
  });
  if (!response.ok || !response.body) throw new Error('audio_not_readable');
  const size = Number(response.headers.get('content-length') ?? 0);
  if (size > MAX_BYTES) throw new Error('audio_too_large');

  const reader = response.body.getReader();
  const buffers: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      if (signal.aborted) throw new Error('audio_aborted');
      const chunk = result.value;
      total += chunk.byteLength;
      if (total > MAX_BYTES) throw new Error('audio_too_large');
      buffers.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  if (!total || signal.aborted) throw new Error('audio_not_readable');
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of buffers) { bytes.set(chunk, offset); offset += chunk.byteLength; }

  // Offline decoder does not reroute or mute the real <audio>. On iOS this
  // avoids restricted AudioContext.createMediaElementSource / CORS silence.
  const OfflineCtx = window.OfflineAudioContext ||
    (window as Window & { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!OfflineCtx) throw new Error('decoder_not_supported');
  const decoder = new OfflineCtx(1, 1, 44_100);
  const decoded = await decoder.decodeAudioData(bytes.buffer);
  if (signal.aborted) throw new Error('audio_aborted');
  return analyzePcm(decoded);
}
