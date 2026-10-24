/**
 * lib/speech/player.ts — the one owner of read-aloud playback in the browser (MASTER TASK v3.1 §5.1, §5.3.2, §5.3.5,
 * §5.3.7).
 *
 * Before this there were four players, and none knew about the others: the studio chat's speaker icon (OmniStudio), the
 * older chat screens (lib/audio/premium-tts, which cut the text at 800 characters), the research report reader, and the
 * read-aloud controls. Two of them skipped a chunk whose synthesis failed and read on, so a sentence could vanish from the
 * middle of a reply without a word. Two could play at once.
 *
 * Here there is one player and one <audio> element for the whole page:
 * - `play` stops whatever is being read, whoever started it, and reads the new text. `toggle` is what a Stop button
 *   does: the same owner's tap stops its read, a failed read is tried again, anything else starts. `playPause` is a
 *   Pause button: the same owner's tap pauses its read and the next one goes on from there.
 * - The text is cut by lib/speech/chunk, so every character is read once, in order: a short first sentence, then chunks
 *   that grow (SPEECH_CHUNK_RAMP), so each request is small next to the audio already on its way. At most SPEECH_AHEAD
 *   syntheses are in flight at once, and at most that many chunks are fetched ahead of the one playing.
 * - A chunk that fails (no audio, bytes that are not a valid WAV, an element error, a stall, the browser refusing to
 *   play) is never skipped. The read stops there as `failed`, with the chunk's offset in the text, and `retry` reads on
 *   from that chunk. Audio already fetched for the chunks after it is kept for the retry.
 * - "done" comes only after the last chunk has ended.
 * - A read is voiced in its text's language (lib/speech/locale), whatever the page's: one voice for the whole read.
 * - Every object URL is revoked when its chunk ends or the read stops; only one exists at a time.
 * - The element is unlocked with a silent clip synchronously inside the tap (iOS/Safari block a first play() that comes
 *   after an awaited fetch), and reused for every chunk, so later plays are allowed.
 * - A stale `ended` / `error` from the previous source never ends the current chunk.
 * - playbackRate is 1 unless the read asks for another speed (the read-aloud controls offer one); a speed belongs to its
 *   read, so no other read is ever sped up by it. A rate never corrects audio: the WAV states its rate (lib/speech/wav),
 *   and a WAV that does not is refused.
 * - A read does not start while a call has the speakers (Gemini Live, or the voice call that stands in for it), and a
 *   call starting stops it (browser wiring: Live takes the microphone, the voice call stops the player itself).
 * - Hearing a reply again sends no request: the browser wiring reads each chunk through the replay cache
 *   (lib/speech/cache), and signing out stops the read and clears the cache.
 *
 * Audio, synthesis and URL APIs are injected (SpeechPlayerDeps), so the state machine is tested without a browser.
 */
import { blobBytes } from './blob';
import { browserSpeechCache, type SpeechCache } from './cache';
import { SPEECH_CHUNK_RAMP, chunkSpeech, type SpeechChunk, type SpeechChunkOptions } from './chunk';
import type { SpeechLocale } from './contract';
import { speechLocaleOf } from './locale';
import { fetchSpeech, requestSpeech, speechResult, type SpeechMiss } from './request';
import { speechTrialModel, speechTrialRecorder, wavAudioMs } from './trial';
import { inspectWav } from './wav';
import { SESSION_CLEARED_EVENT } from '@/lib/auth/sessionCleanup';
import { MIC_RELEASE_EVENT } from '@/lib/voice/micBus';

/**
 * Syntheses in flight at once, and chunks fetched ahead of the one playing. ⚠️ It was 2 until GG heard the read stop
 * and go on (Production 2026-10-24): every request pays a fixed wait before any audio, and with 2 the third chunk was
 * asked for only once the first one played, so a short first chunk left the third one late. With 3 the first three are
 * asked for at once, and chunk k is asked for when chunk k − 3 starts. Billing is unchanged: the same text is sent,
 * only sooner.
 */
export const SPEECH_AHEAD = 3;
/** A chunk that has played this long past its own duration without `ended` is a stall, not a slow ending. */
export const SPEECH_STALL_GRACE_MS = 15_000;
/** A 0.001 s silent WAV: playing it inside the tap is what unlocks the element for the plays that follow the fetch. */
export const SILENT_WAV = 'data:audio/wav;base64,UklGRiwAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQgAAACAgICAgICAgA==';

export type SpeechStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'failed' | 'done';
/**
 * Why a read stopped early. synthesis: the route sent no audio. bad_audio: the bytes are not a WAV the contract allows.
 * playback: the element failed or stalled. blocked: the browser refused to play (a retry is a new tap, which it allows).
 * live_call: a call has the speakers (Gemini Live, or the voice call that stands in for it).
 */
export type SpeechFault = 'synthesis' | 'bad_audio' | 'playback' | 'blocked' | 'live_call';

export interface SpeechState {
  readonly status: SpeechStatus;
  /** Who started the read (e.g. "omni:<chat>:3"); kept through failed and done, null when idle. */
  readonly owner: string | null;
  /** The chunk loading, playing, paused or failed (0-based). */
  readonly index: number;
  readonly total: number;
  /** Where that chunk starts in the text (UTF-16 offset): where a retry reads on from. */
  readonly offset: number;
  readonly fault: SpeechFault | null;
  /** Playback speed of this read; 1 unless the user chose another for it. */
  readonly rate: number;
}

export const IDLE_SPEECH: SpeechState = { status: 'idle', owner: null, index: 0, total: 0, offset: 0, fault: null, rate: 1 };

export interface SpeechRequest {
  readonly owner: string;
  readonly text: string;
  /** The page's language. The read is voiced in the text's own (lib/speech/locale); this is kept for a text with none. */
  readonly locale: SpeechLocale;
  /** Default: lib/speech/chunk's 600 characters, with the first short sentence on its own so it is heard sooner. */
  readonly chunking?: SpeechChunkOptions;
  /** The speed the user chose for this read, 0.5 to 2. Default 1. */
  readonly rate?: number;
}

/** The part of HTMLAudioElement the player uses. */
export interface SpeechAudio {
  src: string;
  readonly currentSrc?: string;
  readonly error?: unknown;
  readonly currentTime?: number;
  playbackRate?: number;
  onended: (() => void) | null;
  onerror: (() => void) | null;
  play(): Promise<void> | void;
  pause(): void;
  load?(): void;
}

export interface SpeechPlayerDeps {
  /** One chunk's WAV, or null on any miss. A throw counts as a miss. */
  synth(text: string, locale: SpeechLocale, signal: AbortSignal): Promise<Blob | null>;
  createAudio(): SpeechAudio;
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
  /** Why no read may start right now, or null. */
  blocked?(): SpeechFault | null;
}

type ChunkEnd = 'ended' | 'stopped' | Exclude<SpeechFault, 'synthesis' | 'live_call'>;

interface Read {
  readonly req: SpeechRequest;
  readonly chunks: readonly SpeechChunk[];
  readonly ctrl: AbortController;
  /** Syntheses that answered, by chunk index: the audio not yet played, or null for a miss. Audio survives a failure. */
  readonly answered: Map<number, Blob | null>;
  /** Syntheses in flight, by chunk index. */
  readonly pending: Map<number, Promise<void>>;
  /** The chunk now loading, playing, paused or failed. */
  current: number;
  /** The last chunk whose audio was handed to the element (-1 before the first). */
  taken: number;
}

const ACTIVE: ReadonlySet<SpeechStatus> = new Set(['loading', 'playing', 'paused']);

/** Whether a read is under way (loading, playing or paused). */
export const isSpeaking = (s: SpeechState): boolean => ACTIVE.has(s.status);

const clampRate = (rate: number): number => Math.max(0.5, Math.min(2, rate));

export class SpeechPlayer {
  private audio: SpeechAudio | null = null;
  private read: Read | null = null;
  private url: string | null = null;
  private state: SpeechState = IDLE_SPEECH;
  private rate = 1;
  /** Ends the chunk now playing (stop, a stall, a refused play). */
  private settle: ((end: ChunkEnd) => void) | null = null;
  private durationMs = 0;
  private guard: ReturnType<typeof setTimeout> | null = null;
  private readonly listeners = new Set<(s: SpeechState) => void>();

  constructor(private readonly deps: SpeechPlayerDeps, private readonly ahead = SPEECH_AHEAD) {}

  getState(): SpeechState {
    return this.state;
  }

  subscribe(fn: (s: SpeechState) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  /**
   * Unlock the element inside a tap whose read starts only after an await (a spoken answer that comes from the network).
   * `play`, `toggle` and `retry` unlock by themselves. Leaves a read that is under way alone.
   */
  prime(): void {
    if (!isSpeaking(this.state)) this.unlock();
  }

  /** Stop whatever is being read and read `req.text`. Call it synchronously from the tap. */
  play(req: SpeechRequest): void {
    this.teardown();
    this.rate = req.rate !== undefined && Number.isFinite(req.rate) ? clampRate(req.rate) : 1;
    const fault = this.deps.blocked?.() ?? null;
    if (fault) {
      this.publish({ ...IDLE_SPEECH, status: 'failed', owner: req.owner, fault, rate: this.rate });
      return;
    }
    const chunks = chunkSpeech(req.text, req.chunking ?? { leadSentence: true, ramp: SPEECH_CHUNK_RAMP });
    if (!chunks.length) {
      this.publish({ ...IDLE_SPEECH, status: 'done', owner: req.owner, rate: this.rate });
      return;
    }
    this.unlock();
    // ⚠️ The text's language, not the page's (GG, production 2026-10-24): an English reply on the Georgian studio was
    // voiced as Georgian. Decided once for the whole text, so every chunk of the read has the same voice.
    const voiced: SpeechRequest = { ...req, locale: speechLocaleOf(req.text, req.locale) };
    const read: Read = { req: voiced, chunks, ctrl: new AbortController(), answered: new Map(), pending: new Map(), current: 0, taken: -1 };
    this.read = read;
    this.publish({ status: 'loading', owner: req.owner, index: 0, total: chunks.length, offset: 0, fault: null, rate: this.rate });
    void this.run(read, 0);
  }

  /** A speaker button: stops its own read, tries its own failed read again, otherwise starts. */
  toggle(req: SpeechRequest): void {
    const s = this.state;
    if (s.owner === req.owner && isSpeaking(s)) return this.stop();
    if (s.owner === req.owner && s.status === 'failed' && this.read?.req.text === req.text) return this.retry();
    this.play(req);
  }

  /**
   * A play / pause button: its own read pauses while it plays, and goes on from the same moment on the next tap. A read
   * that has not been heard yet (its first chunk still loading) is stopped instead: there is nothing to go on from. A
   * failed read is tried again, anything else starts.
   *
   * ⚠️ THE STUDIO'S BUTTON SAID „PAUSE" AND STOPPED THE READ (GG, production 2026-10-24): it called `toggle`, so the next
   * tap read the reply again from the first word. `toggle` stays what a Stop button does (the older chat screens).
   */
  playPause(req: SpeechRequest): void {
    const s = this.state;
    if (s.owner === req.owner && this.read?.req.text === req.text) {
      if (s.status === 'paused') return this.resume();
      if (s.status === 'loading' && s.index === 0) return this.stop();
      if (s.status === 'playing' || s.status === 'loading') return this.pause();
    }
    this.toggle(req);
  }

  /** Read on from the chunk that failed. Call it synchronously from the tap. */
  retry(): void {
    const failed = this.read;
    if (!failed || this.state.status !== 'failed') return;
    const fault = this.deps.blocked?.() ?? null;
    if (fault) {
      this.publish({ fault });
      return;
    }
    this.unlock();
    // The failed chunk is asked for again, and any other miss; audio that arrived for the chunks after it is kept.
    for (const [k, blob] of failed.answered) if (!blob) failed.answered.delete(k);
    const read: Read = { ...failed, ctrl: new AbortController(), pending: new Map(), taken: failed.current - 1 };
    this.read = read;
    this.publish({ status: 'loading', fault: null });
    void this.run(read, failed.current);
  }

  pause(): void {
    if (this.state.status !== 'playing' && this.state.status !== 'loading') return;
    this.clearGuard();
    try { this.audio?.pause(); } catch { /* unavailable media API */ }
    this.publish({ status: 'paused' });
  }

  resume(): void {
    if (this.state.status !== 'paused' || !this.read) return;
    const audio = this.audio;
    const settle = this.settle;
    if (this.url && audio && settle) {
      this.publish({ status: 'playing' });
      this.start(audio, settle);
    } else {
      this.publish({ status: 'loading' });
    }
  }

  /** Stop the read. With `owner`, only when that owner's read is the one under way, failed or done. */
  stop(owner?: string): void {
    if (owner !== undefined && this.state.owner !== owner) return;
    this.teardown();
    this.rate = 1;
    this.publish(IDLE_SPEECH);
  }

  /** The speed the user picked for the read under way, 0.5 to 2. The next read starts at its own request's speed. */
  setRate(rate: number): void {
    if (!Number.isFinite(rate)) return;
    this.rate = clampRate(rate);
    try { if (this.audio) this.audio.playbackRate = this.rate; } catch { /* unavailable media API */ }
    this.publish({ rate: this.rate });
  }

  /** Release everything (tests, a page that goes away). */
  dispose(): void {
    this.teardown();
    this.audio = null;
    this.rate = 1;
    this.state = IDLE_SPEECH;
  }

  // ─── internals ───────────────────────────────────────────────────────────────────────────────────────────────

  private publish(next: Partial<SpeechState>): void {
    this.state = { ...this.state, ...next };
    for (const fn of [...this.listeners]) {
      try { fn(this.state); } catch { /* a listener's failure must not break playback */ }
    }
  }

  private element(): SpeechAudio {
    if (!this.audio) this.audio = this.deps.createAudio();
    return this.audio;
  }

  private unlock(): void {
    const audio = this.element();
    try {
      audio.pause();
      audio.src = SILENT_WAV;
      void Promise.resolve(audio.play()).catch(() => undefined);
    } catch { /* best-effort: the first real play() may still be allowed */ }
  }

  /** Whether `read` is still the read under way: not stopped, replaced, failed or retried. */
  private live(read: Read): boolean {
    return this.read === read && !read.ctrl.signal.aborted;
  }

  private teardown(): void {
    const read = this.read;
    this.read = null;
    read?.ctrl.abort();
    this.clearGuard();
    const settle = this.settle;
    this.settle = null;
    settle?.('stopped');
    if (this.audio) {
      this.audio.onended = null;
      this.audio.onerror = null;
      try { this.audio.pause(); } catch { /* unavailable media API */ }
    }
    this.dropUrl();
  }

  private dropUrl(): void {
    if (!this.url) return;
    this.deps.revokeObjectURL(this.url);
    this.url = null;
  }

  /** Ask for the chunks of the window [current, current + ahead] that are not fetched yet, at most `ahead` at once. */
  private fill(read: Read): void {
    const last = Math.min(read.chunks.length - 1, read.current + this.ahead);
    for (let k = Math.max(read.current, read.taken + 1); k <= last && read.pending.size < this.ahead; k++) {
      if (read.answered.has(k) || read.pending.has(k)) continue;
      const asked = this.deps.synth(read.chunks[k]!.text, read.req.locale, read.ctrl.signal).catch(() => null);
      read.pending.set(k, asked.then((blob) => {
        if (!this.live(read)) return;
        read.pending.delete(k);
        read.answered.set(k, blob && blob.size ? blob : null);
        this.fill(read);
      }));
    }
  }

  private async run(read: Read, from: number): Promise<void> {
    for (let i = from; i < read.chunks.length; i++) {
      if (!this.live(read)) return;
      read.current = i;
      const offset = read.chunks[i]!.start;
      if (!read.answered.has(i)) this.publish(this.state.status === 'paused' ? { index: i, offset } : { status: 'loading', index: i, offset });
      this.fill(read);
      await read.pending.get(i);
      if (!this.live(read)) return;
      const blob = read.answered.get(i);
      if (!blob) return this.fail(read, 'synthesis');
      read.answered.delete(i);
      read.taken = i;
      const end = await this.playChunk(read, blob);
      if (!this.live(read)) return;
      if (end !== 'ended') return this.fail(read, end === 'stopped' ? 'playback' : end);
    }
    this.read = null;
    this.publish({ status: 'done', index: read.chunks.length - 1, offset: read.chunks[read.chunks.length - 1]!.start });
  }

  private fail(read: Read, fault: SpeechFault): void {
    read.ctrl.abort(); // stop the syntheses still in flight; audio that already arrived stays for the retry
    read.pending.clear();
    this.dropUrl();
    this.publish({ status: 'failed', fault, index: read.current, offset: read.chunks[read.current]!.start });
  }

  private async playChunk(read: Read, blob: Blob): Promise<ChunkEnd> {
    let durationMs = -1;
    try {
      const wav = inspectWav(await blobBytes(blob));
      if (wav.ok) durationMs = wav.info.durationMs;
    } catch { /* unreadable bytes */ }
    if (!this.live(read)) return 'stopped';
    if (durationMs < 0) return 'bad_audio';

    const audio = this.element();
    this.dropUrl();
    const url = this.deps.createObjectURL(blob);
    this.url = url;
    audio.src = url;
    try { audio.load?.(); } catch { /* iOS: reload the swapped source fully, or only its first moments play */ }
    try { audio.playbackRate = this.rate; } catch { /* unavailable media API */ }
    this.durationMs = durationMs;
    const paused = this.state.status === 'paused';
    this.publish({ status: paused ? 'paused' : 'playing', index: read.current, offset: read.chunks[read.current]!.start });

    const end = await new Promise<ChunkEnd>((resolve) => {
      let settled = false;
      const settle = (e: ChunkEnd) => {
        if (settled) return;
        settled = true;
        if (this.settle === settle) this.settle = null;
        this.clearGuard();
        audio.onended = null;
        audio.onerror = null;
        resolve(e);
      };
      this.settle = settle;
      // The element is reused, and a source swap aborts the pending load, which fires `error` later: only an event
      // about THIS source counts.
      const mine = () => !audio.currentSrc || audio.currentSrc === url;
      audio.onended = () => { if (mine()) settle('ended'); };
      audio.onerror = () => { if (mine() && audio.error) settle('playback'); };
      if (!paused) this.start(audio, settle);
    });
    if (this.url === url) this.dropUrl();
    return end;
  }

  /** play() the current chunk, and watch that it ends. */
  private start(audio: SpeechAudio, settle: (end: ChunkEnd) => void): void {
    const refused = (e: unknown) => {
      // A pause or a source swap interrupts a pending play() with AbortError; that is not a failure of the chunk.
      if (this.settle !== settle || this.state.status === 'paused') return;
      const name = (e as { name?: unknown } | null)?.name;
      if (name === 'AbortError') return;
      settle(name === 'NotAllowedError' ? 'blocked' : 'playback');
    };
    try {
      void Promise.resolve(audio.play()).catch(refused);
    } catch (e) {
      refused(e);
    }
    this.armGuard(audio, settle);
  }

  /** If neither `ended` nor `error` arrives well after the chunk's own duration, it stalled: never wait for ever. */
  private armGuard(audio: SpeechAudio, settle: (end: ChunkEnd) => void): void {
    this.clearGuard();
    const playedMs = (audio.currentTime ?? 0) * 1000;
    const leftMs = Math.max(0, this.durationMs - playedMs) / this.rate;
    this.guard = setTimeout(() => {
      this.guard = null;
      if (this.settle !== settle) return;
      // Played to the end (within a quarter second) with the `ended` event lost: the chunk was heard. Stuck short of
      // it: a stall.
      const at = audio.currentTime;
      const end = this.durationMs - Math.min(250, this.durationMs * 0.05);
      settle(at !== undefined && at * 1000 >= end ? 'ended' : 'playback');
    }, leftMs + SPEECH_STALL_GRACE_MS);
  }

  private clearGuard(): void {
    if (this.guard) clearTimeout(this.guard);
    this.guard = null;
  }
}

// ─── the browser's one player ────────────────────────────────────────────────────────────────────────────────

/** A trial chunk's miss, as its card row says it: "502 tts_failed · Google 404 NOT_FOUND: …" ("no answer" for none). */
export function trialMiss(miss: SpeechMiss): string {
  const head = miss.status ? [String(miss.status), miss.error].filter(Boolean).join(' ') : 'no answer';
  return miss.cause ? `${head} · ${miss.cause}` : head;
}

/**
 * The browser's wiring: one <audio>, no read during a call, and POST /api/tts/gemini once per chunk (lib/speech/request)
 * unless `cache` already holds that chunk for this account (lib/speech/cache).
 */
export function browserSpeechDeps(cache: SpeechCache | null = null): SpeechPlayerDeps {
  return {
    // A listening trial (lib/speech/trial) skips the replay cache: it holds audio of another model, and a replay would
    // make the model under trial sound faster than it is. Nothing of the trial is kept; what it took is measured.
    synth: async (text, locale, signal) => {
      if (!speechTrialModel()) return cache ? cache.synth(text, locale, signal, fetchSpeech) : requestSpeech(text, locale, signal);
      const askedAt = Date.now();
      const result = await speechResult(text, locale, signal);
      if (!signal.aborted) {
        const synthMs = Date.now() - askedAt;
        speechTrialRecorder().onChunk(
          result.ok
            ? { chars: text.length, synthMs, audioMs: wavAudioMs(result.answer.blob.size, result.answer.profile) }
            : { chars: text.length, synthMs, audioMs: null, miss: trialMiss(result.miss) },
        );
      }
      return result.ok ? result.answer.blob : null;
    },
    createAudio: () => new Audio() as unknown as SpeechAudio,
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
    blocked: () => (onCall() ? 'live_call' : null),
  };
}

/** A call has the speakers: Gemini Live (<html data-live-call>) or the voice call (<html data-voice-call>). */
function onCall(): boolean {
  if (typeof document === 'undefined') return false;
  const root = document.documentElement.dataset;
  return root.liveCall === '1' || root.voiceCall === '1';
}

let shared: SpeechPlayer | null = null;
let sharedCache: SpeechCache | null = null;

/**
 * The page's one player, with the page's replay cache. Live taking the microphone (lib/voice/micBus) stops any read,
 * so two voices never overlap. Signing out (lib/auth/sessionCleanup) stops any read and clears the cache, so nothing
 * of that account is heard or kept after it.
 */
export function speechPlayer(): SpeechPlayer {
  if (!shared) {
    const cache = browserSpeechCache();
    const player = new SpeechPlayer(browserSpeechDeps(cache));
    shared = player;
    sharedCache = cache;
    // The owner's listening trial records each read (what lib/speech/trial's panel shows); nothing else listens.
    if (speechTrialModel()) player.subscribe((s) => speechTrialRecorder().onState(s));
    if (typeof window !== 'undefined') {
      window.addEventListener(MIC_RELEASE_EVENT, () => player.stop());
      window.addEventListener(SESSION_CLEARED_EVENT, () => {
        player.stop();
        void cache.clear();
      });
    }
  }
  return shared;
}

/**
 * The voice call (components/voice/VoiceConversation) has the speakers until the returned release is called: the read
 * under way stops, and no read starts meanwhile (<html data-voice-call>). Gemini Live needs no claim: it takes the
 * microphone, which stops the read, and sets data-live-call itself.
 */
export function claimSpeakersForCall(): () => void {
  if (typeof document === 'undefined') return () => undefined;
  const root = document.documentElement;
  root.dataset.voiceCall = '1';
  speechPlayer().stop();
  return () => { delete root.dataset.voiceCall; };
}

/** The replay cache of the page's player. */
export function speechCache(): SpeechCache {
  speechPlayer();
  return sharedCache!;
}
