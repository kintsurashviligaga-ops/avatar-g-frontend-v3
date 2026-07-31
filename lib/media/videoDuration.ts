/**
 * Measure a picked video BEFORE it is uploaded, and decide whether it is within the service's limit.
 *
 * ⚠️ WHAT THIS FIXES. The dubbing route enforces `MAX_SOURCE_SEC = 300` and bills
 * `dubbingMinutes(durationSec)` — but it reads that number from the request body, and the chat panel
 * never sent it. The route's own fallback took over:
 *
 *   const durationSec = Number.isFinite(declared) && declared > 0 ? declared : 60;
 *
 * So every dub from the panel declared exactly sixty seconds. Two consequences, both bad:
 *
 *   · THE FIVE-MINUTE CAP WAS DEAD. A twenty-minute video sailed past the check and went into a
 *     pipeline sized for five, where it either ran until the function timed out or cost many times
 *     what was reserved for it.
 *   · EVERY DUB BILLED AS ONE MINUTE. Length is the entire cost driver here — one ElevenLabs call per
 *     line of dialogue plus two ffmpeg passes — so a long source was rendered at a fraction of its price.
 *
 * Measuring in the browser, from the local File, is what makes the promise the UI already prints —
 * "up to 5 minutes" — actually true. It also means an over-length video is refused BEFORE a 50MB upload
 * rather than after it, which is the difference between an instant answer and a wasted minute on a phone.
 *
 * The measurement is best-effort by nature: a container the browser cannot decode yields no duration. In
 * that case the caller sends nothing and the server falls back as before — no worse than today, and the
 * pipeline still re-measures with ffmpeg. What we must never do is GUESS a number, because a guess would
 * be billed as if it were measured.
 */

/** The dubbing pipeline's ceiling, mirrored from the route so the UI can refuse early. */
export const MAX_DUB_SOURCE_SEC = 300;

export interface DurationVerdict {
  ok: boolean;
  /** Present only when over the limit — already formatted for display. */
  message?: string;
}

const mmss = (sec: number): string => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Pure verdict, so the arithmetic is testable without a DOM.
 *
 * A null duration passes: we could not measure, and refusing a video because OUR measurement failed
 * would block a perfectly valid source. The server still holds the real limit.
 */
export function checkSourceDuration(
  durationSec: number | null,
  lang: 'ka' | 'en' | 'ru',
  maxSec: number = MAX_DUB_SOURCE_SEC,
): DurationVerdict {
  if (durationSec === null || !Number.isFinite(durationSec) || durationSec <= 0) return { ok: true };
  if (durationSec <= maxSec) return { ok: true };
  const got = mmss(durationSec);
  const max = `${Math.round(maxSec / 60)}`;
  const message =
    lang === 'en'
      ? `This video is ${got} — dubbing handles up to ${max} minutes. Trim it or split it into parts.`
      : lang === 'ru'
        ? `Это видео ${got} — дубляж обрабатывает до ${max} минут. Обрежьте или разделите на части.`
        : `ეს ვიდეო ${got}-ია — დუბლირება მაქსიმუმ ${max} წუთს ამუშავებს. შეამოკლე ან ნაწილებად დაყავი.`;
  return { ok: false, message };
}

/**
 * Read a local file's duration via a detached <video>. Resolves null rather than rejecting — an
 * unmeasurable file is a normal outcome here, not an error worth surfacing.
 *
 * The object URL is revoked on every exit path; leaking one pins the whole file in memory, which on a
 * phone with a 50MB video is exactly the allocation you cannot afford.
 */
export function readVideoDurationSec(file: Blob, timeoutMs = 8000): Promise<number | null> {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement('video');
    let done = false;
    const finish = (v: number | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      el.removeAttribute('src');
      try { el.load(); } catch { /* detached element — nothing to abort */ }
      URL.revokeObjectURL(url);
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    el.preload = 'metadata';
    el.muted = true;
    el.onloadedmetadata = () => {
      const d = el.duration;
      // A stream with an unknown length reports Infinity; that is "unmeasured", not "very long".
      finish(Number.isFinite(d) && d > 0 ? d : null);
    };
    el.onerror = () => finish(null);
    el.src = url;
  });
}
