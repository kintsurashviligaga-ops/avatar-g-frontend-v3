/**
 * lib/chat/videoDigest.ts — how the chat READS a video: a handful of frames and the start of its soundtrack.
 *
 * A phone clip is 10–200 MB and the platform's request body is ~4.5 MB, so the clip itself can never ride a chat turn.
 * What the model needs to answer "what happens in this video?" or "what is said in it?" is far smaller: frames sampled
 * evenly across the clip (JPEG, ≤ 768 px) and its speech (mono 8 kHz WAV, the first minute). Both are made IN THE BROWSER —
 * no upload, no server work, no provider call — and travel as ordinary images and audio, which Gemini reads natively.
 *
 * The pure half (frame times, resampling, WAV encoding, the budget fit, the note the model reads) is unit-tested; the
 * browser half (`captureVideoDigest`) needs a real <video> and AudioContext and is exercised by tests/chat-attachments.spec.ts.
 * Every browser step fails soft: no decodable audio → frames only; no decodable video (e.g. HEVC in Chrome) → null, and the
 * caller says so instead of sending something unreadable.
 */

export const DIGEST_FRAME_COUNT = 8;
export const DIGEST_FRAME_MAX_DIM = 768;
export const DIGEST_FRAME_QUALITY = 0.72;
export const DIGEST_AUDIO_RATE = 8000;
export const DIGEST_AUDIO_MAX_SEC = 60;
/** What one digest may weigh once base64-encoded: the chat's whole inline budget is ≈ 4 MB, and the NEXT turn re-sends this one. */
export const DIGEST_BUDGET_CHARS = 2_300_000;

export interface DigestFrame { dataUrl: string; timeSec: number }
export interface DigestAudio { dataUrl: string; seconds: number }
export interface VideoDigest { durationSec: number; frames: DigestFrame[]; audio?: DigestAudio }
export interface DigestMedia { dataUrl: string; mimeType: string; name: string }

/** Where to look: the midpoints of `count` equal slices — never the black first frame, never past the end. */
export function planFrameTimes(durationSec: number, count: number = DIGEST_FRAME_COUNT): number[] {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return [];
  // At most one frame per second of a very short clip: a 3 s clip gets 3 frames, not 8 near-copies.
  const n = Math.max(1, Math.min(count, Math.floor(durationSec)));
  const step = durationSec / n;
  return Array.from({ length: n }, (_, i) => {
    const t = Math.min(durationSec - 0.05, step * (i + 0.5));
    return Math.round(Math.max(0, t) * 100) / 100;
  });
}

/** 83 → "1:23". */
export function formatClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Mono, `dstRate`, 16-bit, at most `maxSec` seconds: each output sample is the mean of the source samples (all channels) it spans. */
export function downmixAndResample(channels: ReadonlyArray<ArrayLike<number>>, srcRate: number, dstRate: number, maxSec: number): Int16Array {
  const ch = channels.filter((c) => c && c.length > 0);
  if (!ch.length || !(srcRate > 0) || !(dstRate > 0)) return new Int16Array(0);
  const len = Math.min(...ch.map((c) => c.length));
  const ratio = srcRate / dstRate;
  const outLen = Math.min(Math.floor(len / ratio), Math.floor(maxSec * dstRate));
  const out = new Int16Array(Math.max(0, outLen));
  for (let i = 0; i < out.length; i++) {
    const from = Math.floor(i * ratio);
    const to = Math.max(from + 1, Math.min(len, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let k = from; k < to; k++) for (let c = 0; c < ch.length; c++) sum += ch[c]![k] ?? 0;
    const mean = sum / ((to - from) * ch.length);
    out[i] = Math.round(Math.max(-1, Math.min(1, mean)) * 32767);
  }
  return out;
}

/** 16-bit mono PCM → a canonical 44-byte-header WAV. */
export function encodeWav(samples: Int16Array, sampleRate: number): Uint8Array {
  const dataBytes = samples.length * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const tag = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  tag(0, 'RIFF'); v.setUint32(4, 36 + dataBytes, true); tag(8, 'WAVE');
  tag(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  tag(36, 'data'); v.setUint32(40, dataBytes, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, samples[i]!, true);
  return new Uint8Array(buf);
}

export function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64');
  return `data:${mime};base64,${b64}`;
}

/** The note the model reads with the frames (a text file part: it never touches the reply-language detection). */
export function digestNote(name: string, d: VideoDigest): string {
  const times = d.frames.map((f) => formatClock(f.timeSec)).join(', ');
  return [
    `Video "${name}", length ${formatClock(d.durationSec)}.`,
    `${d.frames.length} image(s) follow: frames sampled evenly across the video, in order, at ${times}.`,
    d.audio ? `The audio file is the video's soundtrack (its first ${formatClock(d.audio.seconds)}); speech in it is what is said in the video.` : 'There is no readable soundtrack: describe only what is visible.',
    'Answer the user from the frames and the audio together. If something happens between frames, say it is inferred.',
  ].join('\n');
}

/** Drops the soundtrack first, then every other frame, until the digest fits `budgetChars` once encoded. */
export function fitDigest(d: VideoDigest, budgetChars: number = DIGEST_BUDGET_CHARS): VideoDigest {
  const weight = (x: VideoDigest) => x.frames.reduce((s, f) => s + f.dataUrl.length, 0) + (x.audio?.dataUrl.length ?? 0);
  let cur: VideoDigest = { ...d, frames: [...d.frames] };
  if (weight(cur) > budgetChars && cur.audio) cur = { durationSec: cur.durationSec, frames: cur.frames };
  while (weight(cur) > budgetChars && cur.frames.length > 2) cur = { ...cur, frames: cur.frames.filter((_, i) => i % 2 === 0) };
  return cur;
}

/** The parts that travel with the question, in the order the note promises them. */
export function digestToMedia(name: string, d: VideoDigest): DigestMedia[] {
  const note = bytesToDataUrl(new TextEncoder().encode(digestNote(name, d)), 'text/plain');
  return [
    { dataUrl: note, mimeType: 'text/plain', name: `${name} — video info.txt` },
    ...d.frames.map((f, i) => ({ dataUrl: f.dataUrl, mimeType: 'image/jpeg', name: `${name} — frame ${i + 1}/${d.frames.length} @${formatClock(f.timeSec)}` })),
    ...(d.audio ? [{ dataUrl: d.audio.dataUrl, mimeType: 'audio/wav', name: `${name} — soundtrack` }] : []),
  ];
}

// ─── Browser half ───────────────────────────────────────────────────────────────────────────────────────

function waitFor(target: EventTarget, ok: string, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (v: boolean) => { clearTimeout(timer); target.removeEventListener(ok, onOk); target.removeEventListener('error', onErr); resolve(v); };
    const onOk = () => done(true);
    const onErr = () => done(false);
    const timer = setTimeout(() => done(false), ms);
    target.addEventListener(ok, onOk, { once: true });
    target.addEventListener('error', onErr, { once: true });
  });
}

/** Frames + soundtrack of a video Blob. Null when the browser cannot decode the video at all. */
export async function captureVideoDigest(
  blob: Blob,
  opts: { frameCount?: number; maxDim?: number; quality?: number; audioMaxSec?: number } = {},
): Promise<VideoDigest | null> {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return null;
  const url = URL.createObjectURL(blob);
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;
    if (!(await waitFor(video, 'loadedmetadata', 15_000))) return null;
    let duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) return null;
    if (!video.videoWidth || !video.videoHeight) return null;

    const maxDim = opts.maxDim ?? DIGEST_FRAME_MAX_DIM;
    const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const g = canvas.getContext('2d');
    if (!g) return null;

    const frames: DigestFrame[] = [];
    for (const t of planFrameTimes(duration, opts.frameCount ?? DIGEST_FRAME_COUNT)) {
      video.currentTime = t;
      if (!(await waitFor(video, 'seeked', 10_000))) continue;
      g.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', opts.quality ?? DIGEST_FRAME_QUALITY);
      if (dataUrl.startsWith('data:image/jpeg')) frames.push({ dataUrl, timeSec: t });
    }
    if (!frames.length) return null;

    let audio: DigestAudio | undefined;
    try {
      const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC) {
        const ctx = new AC();
        try {
          const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
          const chans = Array.from({ length: decoded.numberOfChannels }, (_, c) => decoded.getChannelData(c));
          const pcm = downmixAndResample(chans, decoded.sampleRate, DIGEST_AUDIO_RATE, opts.audioMaxSec ?? DIGEST_AUDIO_MAX_SEC);
          // Silence (an all-zero track) is not worth sending: the model would be asked to listen to nothing.
          if (pcm.length > DIGEST_AUDIO_RATE && pcm.some((s) => Math.abs(s) > 64)) {
            audio = { dataUrl: bytesToDataUrl(encodeWav(pcm, DIGEST_AUDIO_RATE), 'audio/wav'), seconds: pcm.length / DIGEST_AUDIO_RATE };
          }
        } finally {
          try { await ctx.close(); } catch { /* already closed */ }
        }
      }
    } catch { /* no decodable soundtrack: frames only */ }

    duration = Math.round(duration * 10) / 10;
    return { durationSec: duration, frames, ...(audio ? { audio } : {}) };
  } finally {
    URL.revokeObjectURL(url);
  }
}
