'use client';

/**
 * components/studio/montage/media.ts — what the browser can learn about a clip before the server sees it:
 * its length, a filmstrip of frames for the timeline, and an audio waveform.
 *
 * Everything here is BEST EFFORT and bounded. A codec the browser cannot decode (an iPhone HEVC .mov on
 * desktop Chrome is the everyday case) yields a 0 length and no frames — never an error and never a hang:
 * the server decodes with ffmpeg and measures it there (lib/video/surgicalOps resolveSegmentWindows).
 */

const isBlob = (url: string) => url.startsWith('blob:') || url.startsWith('data:');

/** Length of a video (or audio) file in seconds; 0 when unknown. Never hangs: the timeout settles it. */
export function probeDuration(url: string, kind: 'video' | 'audio' = 'video', timeoutMs = 12_000): Promise<number> {
  return new Promise((resolve) => {
    const el = document.createElement(kind);
    let settled = false;
    const done = (d: number) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      el.removeAttribute('src');
      try { el.load(); } catch { /* releasing the decoder is a courtesy */ }
      resolve(Number.isFinite(d) && d > 0 ? d : 0);
    };
    const timer = window.setTimeout(() => done(0), timeoutMs);
    el.preload = 'metadata';
    el.muted = true;
    el.onloadedmetadata = () => done(el.duration);
    el.onerror = () => done(0);
    el.src = url;
  });
}

function once(el: HTMLMediaElement, event: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const t = window.setTimeout(() => { el.removeEventListener(event, ok); resolve(false); }, timeoutMs);
    const ok = () => { window.clearTimeout(t); el.removeEventListener(event, ok); resolve(true); };
    el.addEventListener(event, ok);
  });
}

/**
 * Frames for a clip's filmstrip: `count` small JPEGs spread evenly over the source.
 *
 * A remote (library) video is loaded with crossOrigin="anonymous" — without it the canvas is tainted and
 * toDataURL throws. Storage serves CORS for GET, so that works; when it does not, the strip simply stays
 * empty and the clip is drawn as a plain block.
 */
export async function extractFrames(url: string, durationSec: number, count: number, height = 72): Promise<string[]> {
  if (!url || durationSec <= 0 || count <= 0) return [];
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  if (!isBlob(url)) v.crossOrigin = 'anonymous';
  v.src = url;
  const frames: string[] = [];
  try {
    if (!(await once(v, 'loadeddata', 15_000))) return [];
    const w0 = v.videoWidth || 16;
    const h0 = v.videoHeight || 9;
    const canvas = document.createElement('canvas');
    canvas.height = height;
    canvas.width = Math.max(1, Math.round((height * w0) / h0));
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];
    for (let i = 0; i < count; i += 1) {
      // The middle of each slice, so the first frame is not the (often black) very first one.
      const t = Math.min(durationSec - 0.05, ((i + 0.5) / count) * durationSec);
      v.currentTime = Math.max(0, t);
      if (!(await once(v, 'seeked', 5_000))) break;
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      frames.push(canvas.toDataURL('image/jpeg', 0.6));
    }
  } catch {
    // A tainted canvas or a decoder that gave up mid-way: keep the frames that did come out.
  } finally {
    v.removeAttribute('src');
    try { v.load(); } catch { /* ignore */ }
  }
  return frames;
}

/** ~`buckets` normalized peaks for a waveform. Empty when the file cannot be fetched or decoded. */
export async function decodePeaks(url: string, buckets = 120): Promise<number[]> {
  try {
    const AC = window.AudioContext
      || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return [];
    const res = await fetch(url, isBlob(url) ? {} : { mode: 'cors', credentials: 'omit' });
    if (!res.ok) return [];
    const ctx = new AC();
    try {
      const audio = await ctx.decodeAudioData(await res.arrayBuffer());
      const data = audio.getChannelData(0);
      const block = Math.max(1, Math.floor(data.length / buckets));
      const peaks: number[] = [];
      for (let i = 0; i < buckets; i += 1) {
        let max = 0;
        for (let j = 0; j < block; j += block > 2000 ? 7 : 1) {
          const s = Math.abs(data[i * block + j] || 0);
          if (s > max) max = s;
        }
        peaks.push(max);
      }
      const top = Math.max(...peaks, 0.01);
      return peaks.map((p) => Math.max(0.06, p / top));
    } finally {
      void ctx.close();
    }
  } catch {
    return [];
  }
}

/** What kind of media a picked file is, by MIME type first and extension second (iOS often sends ''). */
export function kindOfFile(f: File): 'video' | 'image' | 'audio' | null {
  const t = (f.type || '').toLowerCase();
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('audio/')) return 'audio';
  const ext = /\.([a-z0-9]+)$/i.exec(f.name)?.[1]?.toLowerCase() ?? '';
  if (['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi', '3gp'].includes(ext)) return 'video';
  if (['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif'].includes(ext)) return 'image';
  if (['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'opus'].includes(ext)) return 'audio';
  return null;
}

/** "0:07" / "1:04" — the editor's clock. Tenths below ten seconds, where a trim is judged by eye. */
export function fmtTime(sec: number, tenths = false): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  if (tenths) return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
  const whole = Math.floor(s);
  return `${m}:${String(whole).padStart(2, '0')}`;
}

/** A clip length for a label: "3.5s" style, localized unit. */
export function fmtSec(sec: number, unit: string): string {
  const v = sec >= 10 ? Math.round(sec) : Math.round(sec * 10) / 10;
  return `${v}${unit}`;
}
