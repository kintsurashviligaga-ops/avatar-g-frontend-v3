/**
 * lib/speech/cache.ts — the read-aloud replay cache (MASTER TASK v3.1 §5.3.1, §5.3.6; GG's decision 3, 2026-10-24).
 *
 * Hearing a reply again sends no request. Each chunk's audio is kept in this tab's memory and in the device's
 * IndexedDB (lib/speech/store), for the account that heard it. Nothing is stored on the server.
 *
 * The key is a SHA-256 of everything that makes the audio:
 * - the speech contract version of this page, so a page of another version never takes this one's audio;
 * - the account (the uid ChatChrome publishes on <html>). Nothing is kept or found for a guest;
 * - the locale;
 * - the profile: pacing, model, voice and PCM layout, as the route last reported them for that locale
 *   (lib/speech/contract speechProfile);
 * - the revision: the exact text of the chunk when it is read. An edited message is new text, so its old audio can
 *   never play for it.
 *
 * The route reports the profile with every answer, and the cache keeps the last one per locale. When an answer reports
 * another (a new model, voice or pacing), the old audio for that locale is dropped and no key reaches it again.
 * ⚠️ The profile is learned from answers. Until this browser gets one fresh answer after such a change, a text it has
 * already heard replays as it sounded then.
 *
 * Limits: 24 MB in memory and 50 MB on the device; the least recently used audio goes first. Audio is kept only after
 * it passes the WAV check (lib/speech/wav), and is checked again when read back. A damaged entry is a miss, never a
 * failed chunk that "try again" would replay.
 *
 * Sign-out (lib/auth/sessionCleanup SESSION_CLEARED_EVENT, wired in lib/speech/player) clears both copies, and audio
 * that arrives after it is not kept. If the device store hangs (Safari has hung IndexedDB opens), it gets
 * SPEECH_STORE_TIMEOUT_MS; after that the cache works from memory only for the rest of the page.
 */
import { blobBytes } from './blob';
import { SPEECH_CONTRACT_VERSION, SPEECH_RESPONSE_MIME, type SpeechLocale } from './contract';
import type { SpeechAnswer } from './request';
import { indexedDbSpeechStore, type SpeechStore } from './store';
import { inspectWav } from './wav';

export const SPEECH_CACHE_MEMORY_BYTES = 24 * 1024 * 1024;
export const SPEECH_CACHE_DEVICE_BYTES = 50 * 1024 * 1024;
/** How long a read from the device store may take before the chunk goes to the network instead. */
export const SPEECH_STORE_TIMEOUT_MS = 300;

export interface SpeechCacheDeps {
  /** The signed-in account, or null (a guest, or not known yet). */
  userId(): string | null;
  /** Hex SHA-256 of `text`, or null where the page cannot hash (an insecure origin): then nothing is kept. */
  sha256(text: string): Promise<string> | null;
  /** The device copy; null keeps memory only. */
  store: SpeechStore | null;
}

export interface SpeechCacheLimits {
  readonly memoryBytes: number;
  readonly deviceBytes: number;
  readonly timeoutMs: number;
}

/** One chunk from the route (lib/speech/request fetchSpeech). */
export type FetchSpeech = (text: string, locale: SpeechLocale, signal: AbortSignal) => Promise<SpeechAnswer | null>;

interface MemoryEntry {
  readonly blob: Blob;
  readonly locale: SpeechLocale;
  readonly profile: string;
}

const TIMED_OUT = Symbol('timed out');

export class SpeechCache {
  /** Insertion order is use order: the first entry is the least recently used. */
  private readonly memory = new Map<string, MemoryEntry>();
  private memoryBytes = 0;
  private readonly profiles = new Map<SpeechLocale, string>();
  private readonly profileReads = new Map<SpeechLocale, Promise<string | null>>();
  /** Bumped by clear(): work that started before it keeps nothing. */
  private epoch = 0;
  private store: SpeechStore | null;

  constructor(
    private readonly deps: SpeechCacheDeps,
    private readonly limits: SpeechCacheLimits = {
      memoryBytes: SPEECH_CACHE_MEMORY_BYTES,
      deviceBytes: SPEECH_CACHE_DEVICE_BYTES,
      timeoutMs: SPEECH_STORE_TIMEOUT_MS,
    },
  ) {
    this.store = deps.store;
  }

  /**
   * One chunk's audio. From the cache when this account heard this text made this way before; otherwise from `fetch`,
   * and then kept.
   */
  async synth(text: string, locale: SpeechLocale, signal: AbortSignal, fetch: FetchSpeech): Promise<Blob | null> {
    const epoch = this.epoch;
    const user = this.deps.userId();
    if (user) {
      const hit = await this.find(user, locale, text, epoch).catch(() => null);
      if (hit) return signal.aborted ? null : hit;
    }
    if (signal.aborted) return null;
    const answer = await fetch(text, locale, signal);
    if (!answer) return null;
    if (user && answer.profile) void this.keep(user, locale, text, answer.blob, answer.profile, epoch).catch(() => undefined);
    return answer.blob;
  }

  /** Forget everything, in memory and on the device (sign-out). Audio that arrives after this is not kept. */
  async clear(): Promise<void> {
    this.epoch++;
    this.memory.clear();
    this.memoryBytes = 0;
    this.profiles.clear();
    this.profileReads.clear();
    await this.device((s) => s.clear(), false);
  }

  // ─── internals ───────────────────────────────────────────────────────────────────────────────────────────────

  private async find(user: string, locale: SpeechLocale, text: string, epoch: number): Promise<Blob | null> {
    const profile = await this.profile(locale);
    if (!profile) return null;
    const key = await this.key(user, locale, profile, text);
    if (!key) return null;
    const held = this.memory.get(key);
    if (held) {
      this.memory.delete(key);
      this.memory.set(key, held);
      return held.blob;
    }
    const bytes = await this.device((s) => s.get(key), true);
    if (!bytes || epoch !== this.epoch) return null;
    if (!inspectWav(new Uint8Array(bytes)).ok) {
      void this.device((s) => s.delete(key), false);
      return null;
    }
    const blob = new Blob([bytes], { type: SPEECH_RESPONSE_MIME });
    this.remember(key, { blob, locale, profile });
    return blob;
  }

  private async keep(user: string, locale: SpeechLocale, text: string, blob: Blob, profile: string, epoch: number): Promise<void> {
    const bytes = await blobBytes(blob);
    if (!inspectWav(bytes).ok) return;
    const key = await this.key(user, locale, profile, text);
    // Signed out, or another account signed in, while this was arriving: it is not theirs to keep.
    if (!key || epoch !== this.epoch || this.deps.userId() !== user) return;
    if (this.profiles.get(locale) !== profile) {
      // The route now makes this locale's audio another way: what was made the old way is never played again.
      this.profiles.set(locale, profile);
      for (const [k, e] of this.memory) if (e.locale === locale && e.profile !== profile) this.forget(k);
      void this.device((s) => s.setProfile(locale, profile).then(() => s.purge(locale, profile)), false);
    }
    this.remember(key, { blob, locale, profile });
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    await this.device((s) => s.put({ key, bytes: buffer, locale, profile }, this.limits.deviceBytes), false);
  }

  /** The profile the route last reported for `locale`: in memory, else read once from the device. */
  private async profile(locale: SpeechLocale): Promise<string | null> {
    const known = this.profiles.get(locale);
    if (known) return known;
    let read = this.profileReads.get(locale);
    if (!read) {
      const epoch = this.epoch;
      read = this.device((s) => s.getProfile(locale), true).then((p) => {
        if (p && epoch === this.epoch && !this.profiles.has(locale)) this.profiles.set(locale, p);
        return this.profiles.get(locale) ?? null;
      });
      this.profileReads.set(locale, read);
    }
    return read;
  }

  private async key(user: string, locale: SpeechLocale, profile: string, text: string): Promise<string | null> {
    const digest = this.deps.sha256(JSON.stringify([SPEECH_CONTRACT_VERSION, user, locale, profile, text]));
    return digest ? digest.catch(() => null) : null;
  }

  private remember(key: string, entry: MemoryEntry): void {
    this.forget(key);
    if (entry.blob.size > this.limits.memoryBytes) return;
    this.memory.set(key, entry);
    this.memoryBytes += entry.blob.size;
    for (const [k] of this.memory) {
      if (this.memoryBytes <= this.limits.memoryBytes) break;
      this.forget(k);
    }
  }

  private forget(key: string): void {
    const e = this.memory.get(key);
    if (!e) return;
    this.memory.delete(key);
    this.memoryBytes -= e.blob.size;
  }

  /**
   * A device store call, or null when there is no store or it failed. A read (`bounded`) that takes longer than the
   * limit gives up the store for the rest of the page: a hung store must not delay every chunk.
   */
  private async device<T>(op: (s: SpeechStore) => Promise<T>, bounded: boolean): Promise<T | null> {
    const store = this.store;
    if (!store) return null;
    try {
      if (!bounded) return await op(store);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<typeof TIMED_OUT>((resolve) => { timer = setTimeout(() => resolve(TIMED_OUT), this.limits.timeoutMs); });
      try {
        const out = await Promise.race([op(store), late]);
        if (out !== TIMED_OUT) return out;
        if (this.store === store) this.store = null;
        return null;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return null;
    }
  }
}

// ─── the browser's wiring ────────────────────────────────────────────────────────────────────────────────────

/** Hex SHA-256 with WebCrypto; null where it is missing (crypto.subtle exists only on https and localhost). */
export function browserSha256(text: string): Promise<string> | null {
  const subtle = typeof crypto === 'undefined' ? undefined : crypto.subtle;
  if (!subtle) return null;
  return subtle.digest('SHA-256', new TextEncoder().encode(text)).then((d) =>
    Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join(''),
  );
}

/** The signed-in account ChatChrome publishes on <html> (data-authed="1" and data-uid), or null. */
export function publishedUserId(): string | null {
  if (typeof document === 'undefined') return null;
  const root = document.documentElement.dataset;
  return root.authed === '1' && root.uid ? root.uid : null;
}

/** The cache the page's player uses: the published account, WebCrypto and IndexedDB. */
export function browserSpeechCache(): SpeechCache {
  return new SpeechCache({ userId: publishedUserId, sha256: browserSha256, store: indexedDbSpeechStore() });
}
