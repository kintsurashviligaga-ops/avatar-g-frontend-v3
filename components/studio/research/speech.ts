/**
 * components/studio/research/speech.ts — read a report (or an answer about it) aloud: the chunker and a small player.
 *
 * THE TEXT. `plainTextForSpeech` (lib/research/report) turns Markdown into lines a voice can read (no marks, no URLs, no code,
 * tables as sentences, citation markers dropped). `chunkForTts` (lib/audio/ttsChunks) cuts it at sentence ends into pieces of
 * at most CHUNK_MAX_CHARS so a long text is never one request. A whole report is not read: the read is CAPPED at
 * READ_MAX_CHARS (the start of the report — its summary and first sections) and the screen says so; the rest is what
 * "Summarize" and the Live call are for. The cap bounds the TTS spend per tap and the per-user daily allowance.
 *
 * THE PLAYER. One <audio> element is REUSED for every chunk and primed with a silent clip INSIDE the tap (iOS/Safari block
 * a first play() that comes after an awaited fetch). The next chunk is synthesised while the current one plays. A chunk that
 * fails is skipped; three failures in a row end the read with an error — never a silent stall. Stop / pause / resume work at
 * any moment, stop abandons in-flight synthesis and revokes every blob URL. Audio, fetch and URL APIs are injected so the
 * state machine is tested without a browser (speech.test.ts).
 */
import { chunkForTts } from '@/lib/audio/ttsChunks';
import { plainTextForSpeech } from '@/lib/research/report';

/** One TTS request's text. Shorter than the route's 2,000-character ceiling; sentence-sized so the first sound is fast. */
export const CHUNK_MAX_CHARS = 600;
/** How much of a report one "Read aloud" tap speaks (≈ 7–9 minutes). */
export const READ_MAX_CHARS = 7_200;
/** Chunks in a row that may fail before the read is abandoned. */
export const MAX_CONSECUTIVE_FAILURES = 3;

export interface SpeechPlan {
  chunks: string[];
  /** The text was longer than READ_MAX_CHARS — the screen says only the start is read. */
  partial: boolean;
}

/** The chunks for a REPORT: speech text, capped, cut at sentence ends. */
export function planReportSpeech(markdown: string, opts: { maxChars?: number; chunkChars?: number } = {}): SpeechPlan {
  const cap = opts.maxChars ?? READ_MAX_CHARS;
  const text = plainTextForSpeech(markdown ?? '');
  const partial = text.length > cap;
  const chunks = chunkForTts(partial ? cutAtSentence(text, cap) : text, opts.chunkChars ?? CHUNK_MAX_CHARS);
  return { chunks, partial };
}

/** The chunks for a short ANSWER (already plain-ish Markdown): speech text, never capped below a few thousand characters. */
export function planAnswerSpeech(markdown: string): SpeechPlan {
  return planReportSpeech(markdown, { maxChars: 4_000 });
}

function cutAtSentence(text: string, max: number): string {
  const slice = text.slice(0, max);
  const end = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('.\n'), slice.lastIndexOf('! '), slice.lastIndexOf('? '));
  return end > max * 0.6 ? slice.slice(0, end + 1) : slice;
}

// ─── the player ───────────────────────────────────────────────────────────────────────────────────────────────

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'done' | 'error';
export interface PlayerState {
  status: PlayerStatus;
  /** 0-based index of the chunk now loading or playing. */
  index: number;
  total: number;
}

export interface AudioLike {
  src: string;
  onended: (() => void) | null;
  onerror: (() => void) | null;
  currentSrc?: string;
  error?: unknown;
  play(): Promise<void> | void;
  pause(): void;
  load?(): void;
}

export interface SpeechDeps {
  /** Synthesise one chunk; null on any miss (never throws is not assumed — a throw counts as a miss). */
  synth(text: string, signal: AbortSignal): Promise<Blob | null>;
  createAudio(): AudioLike;
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
}

/** A 0.001 s silent WAV: playing it inside the tap is what unlocks the element for the plays that follow the fetch. */
export const SILENT_WAV = 'data:audio/wav;base64,UklGRiwAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQgAAACAgICAgICAgA==';

export class ReadAloudPlayer {
  private audio: AudioLike | null = null;
  private gen = 0;
  private state: PlayerState = { status: 'idle', index: 0, total: 0 };
  private ctrl: AbortController | null = null;
  private resolveCurrent: (() => void) | null = null;
  private currentUrl: string | null = null;

  constructor(private readonly deps: SpeechDeps, private readonly onState: (s: PlayerState) => void = () => undefined) {}

  getState(): PlayerState {
    return this.state;
  }

  private set(next: Partial<PlayerState>): void {
    this.state = { ...this.state, ...next };
    this.onState(this.state);
  }

  /**
   * Unlock the element for later plays. Call it SYNCHRONOUSLY inside a tap that will start a read AFTER an await (a spoken
   * answer arrives from the network; by then the tap's user activation is spent). `start()` primes too — this is for the gap.
   */
  prime(): void {
    if (!this.audio) this.audio = this.deps.createAudio();
    try {
      this.audio.src = SILENT_WAV;
      void Promise.resolve(this.audio.play()).catch(() => undefined);
    } catch {
      /* best-effort */
    }
  }

  /** Start reading `chunks`. Call it synchronously from the user's tap (the priming play() depends on it). */
  start(chunks: readonly string[]): void {
    this.teardown();
    const list = chunks.filter((c) => c.trim().length > 0);
    if (list.length === 0) {
      this.set({ status: 'done', index: 0, total: 0 });
      return;
    }
    const my = ++this.gen;
    this.ctrl = new AbortController();
    if (!this.audio) this.audio = this.deps.createAudio();
    try {
      this.audio.pause();
      this.audio.src = SILENT_WAV;
      void Promise.resolve(this.audio.play()).catch(() => undefined);
    } catch {
      /* priming is best-effort */
    }
    this.set({ status: 'loading', index: 0, total: list.length });
    void this.run(list, my, this.ctrl.signal);
  }

  pause(): void {
    if (this.state.status !== 'playing' && this.state.status !== 'loading') return;
    try {
      this.audio?.pause();
    } catch {
      /* ignore */
    }
    this.set({ status: 'paused' });
  }

  resume(): void {
    if (this.state.status !== 'paused' || !this.audio) return;
    this.set({ status: this.currentUrl ? 'playing' : 'loading' });
    try {
      void Promise.resolve(this.audio.play()).catch(() => undefined);
    } catch {
      /* ignore */
    }
  }

  stop(): void {
    this.teardown();
    this.set({ status: 'idle', index: 0, total: 0 });
  }

  /** Release everything (unmount). */
  dispose(): void {
    this.teardown();
    this.audio = null;
  }

  private teardown(): void {
    this.gen++;
    this.ctrl?.abort();
    this.ctrl = null;
    try {
      this.audio?.pause();
    } catch {
      /* ignore */
    }
    if (this.audio) {
      this.audio.onended = null;
      this.audio.onerror = null;
    }
    this.resolveCurrent?.();
    this.resolveCurrent = null;
    if (this.currentUrl) {
      this.deps.revokeObjectURL(this.currentUrl);
      this.currentUrl = null;
    }
  }

  private async fetchUrl(text: string, signal: AbortSignal): Promise<string | null> {
    try {
      const blob = await this.deps.synth(text, signal);
      return blob && !signal.aborted ? this.deps.createObjectURL(blob) : null;
    } catch {
      return null;
    }
  }

  private async run(chunks: string[], my: number, signal: AbortSignal): Promise<void> {
    const live = () => my === this.gen;
    let next: Promise<string | null> = this.fetchUrl(chunks[0]!, signal);
    let misses = 0;
    let played = 0;
    for (let i = 0; i < chunks.length; i++) {
      const url = await next;
      if (!live()) {
        if (url) this.deps.revokeObjectURL(url);
        return;
      }
      next = i + 1 < chunks.length ? this.fetchUrl(chunks[i + 1]!, signal) : Promise.resolve(null);
      if (!url) {
        misses++;
        if (misses >= MAX_CONSECUTIVE_FAILURES) {
          void next.then((u) => { if (u) this.deps.revokeObjectURL(u); });
          this.set({ status: 'error' });
          return;
        }
        continue;
      }
      misses = 0;
      const audio = this.audio;
      if (!audio) {
        this.deps.revokeObjectURL(url);
        return;
      }
      this.currentUrl = url;
      audio.src = url;
      try { audio.load?.(); } catch { /* iOS reload hint */ }
      if (this.state.status !== 'paused') this.set({ status: 'playing', index: i });
      else this.set({ index: i });
      await new Promise<void>((resolve) => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          this.resolveCurrent = null;
          audio.onended = null;
          audio.onerror = null;
          resolve();
        };
        this.resolveCurrent = done;
        // A stale event from the PREVIOUS source must not end this chunk (the element is reused and `load()` aborts a pending load).
        const mine = () => !audio.currentSrc || audio.currentSrc === url;
        audio.onended = () => { if (mine()) done(); };
        audio.onerror = () => { if (mine() && audio.error) done(); };
        if (this.state.status !== 'paused') {
          try { void Promise.resolve(audio.play()).catch(done); } catch { done(); }
        }
      });
      if (this.currentUrl === url) {
        this.deps.revokeObjectURL(url);
        this.currentUrl = null;
      }
      if (!live()) {
        void next.then((u) => { if (u) this.deps.revokeObjectURL(u); });
        return;
      }
      played++;
    }
    if (!live()) return;
    this.set({ status: played > 0 ? 'done' : 'error', index: Math.max(0, chunks.length - 1) });
  }
}

/** The browser's wiring for the player: POST /api/tts/gemini, one chunk per request. */
export function browserSpeechDeps(locale: string): SpeechDeps {
  const lang = locale === 'en' || locale === 'ru' ? locale : 'ka';
  return {
    async synth(text, signal) {
      // The caller's signal (stop) plus a ceiling, so a hung synthesis cannot hold the read on "preparing" forever.
      const ctrl = new AbortController();
      const onAbort = () => ctrl.abort();
      signal.addEventListener('abort', onAbort);
      const timer = setTimeout(() => ctrl.abort(), 25_000);
      try {
        const res = await fetch('/api/tts/gemini', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ text, locale: lang }),
          signal: ctrl.signal,
        });
        if (res.status === 401 && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('myavatar:auth-required'));
        return res.ok ? await res.blob() : null;
      } finally {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
      }
    },
    createAudio: () => new Audio() as unknown as AudioLike,
    createObjectURL: (b) => URL.createObjectURL(b),
    revokeObjectURL: (u) => URL.revokeObjectURL(u),
  };
}
