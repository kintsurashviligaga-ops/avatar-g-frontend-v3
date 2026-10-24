/**
 * lib/speech/trial.ts — the owner's listening trial of the read-aloud models (Phase 4, after the 2026-10-24 listening).
 *
 * ⚠️ The owner heard the default model (gemini-2.5-flash-preview-tts) on production start late and sound robotic in
 * ka/en/ru, and agreed to hear the same texts read by Gemini 3.8 Flash TTS and 3.8 Flash-Lite TTS. A link with
 * `?tts=<model id>` picks the model for this browser tab (sessionStorage, so it ends with the tab); `?tts=off` ends it
 * at once. The read-aloud request then names that model (lib/speech/request), and the route honours it for an ADMIN
 * account only (app/api/tts/gemini modelFor); for anyone else the request is read with the usual model. While a trial
 * is on, the replay cache is bypassed (lib/speech/player browserSpeechDeps): it would replay audio of another model,
 * and a replay would also make the model under trial sound faster than it is.
 */

/** The models the trial can pick: the default, so its timing is heard without the cache, and the two 3.8 ones. */
export const SPEECH_TRIAL_MODELS: readonly string[] = [
  'gemini-2.5-flash-preview-tts',
  'gemini-3.8-flash-tts',
  'gemini-3.8-flash-lite-tts',
];

export const SPEECH_TRIAL_PARAM = 'tts';
export const SPEECH_TRIAL_KEY = 'myavatar:tts-trial';

/** What the trial reads: the page's query string and the tab's storage (null where there is none). */
export interface SpeechTrialEnv {
  readonly search: string;
  readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
}

function browserEnv(): SpeechTrialEnv | null {
  if (typeof window === 'undefined') return null;
  let storage: SpeechTrialEnv['storage'] = null;
  try {
    storage = window.sessionStorage;
  } catch {
    // Storage refused (private mode, blocked site data): the link still works for the page it opened.
  }
  return { search: window.location?.search ?? '', storage };
}

const allowed = (raw: string | null | undefined): string | null => {
  const id = (raw ?? '').trim().toLowerCase();
  return SPEECH_TRIAL_MODELS.includes(id) ? id : null;
};

/** The model the trial asks for, or null when no trial is on (the normal case, and always on the server). */
export function speechTrialModel(env: SpeechTrialEnv | null = browserEnv()): string | null {
  if (!env) return null;
  const param = new URLSearchParams(env.search).get(SPEECH_TRIAL_PARAM);
  if (param !== null) {
    const id = allowed(param);
    try {
      if (id) env.storage?.setItem(SPEECH_TRIAL_KEY, id);
      else env.storage?.removeItem(SPEECH_TRIAL_KEY);
    } catch {
      /* not kept: this page still uses the link's choice */
    }
    return id;
  }
  try {
    return allowed(env.storage?.getItem(SPEECH_TRIAL_KEY));
  } catch {
    return null;
  }
}

// ─── what the trial measured ─────────────────────────────────────────────────────────────────────────────────

/** One chunk of a trial read: its length, how long the route took, and how much audio it sent. */
export interface SpeechTrialChunk {
  readonly chars: number;
  readonly synthMs: number;
  /** null when no audio came back. */
  readonly audioMs: number | null;
  /**
   * Why no audio came back, when none did: the route's status and code, then what it said beyond them ("502
   * tts_failed · Google 404 NOT_FOUND: …"). ⚠️ The card used to show only "audio …" for a chunk that failed, so the
   * owner's 3.8 trial (2026-10-24) read nothing and the screenshot could not say why.
   */
  readonly miss?: string;
}

/**
 * One trial read, as the owner heard it: how long from the tap to the first sound, and how often (and how long) the
 * read had to wait for its next chunk. These are the numbers that say whether a model starts late or stops in the
 * middle, and they size the chunks (lib/speech/chunk): no TTS model's speed has been measured anywhere else.
 */
export interface SpeechTrialRead {
  readonly model: string;
  readonly firstSoundMs: number | null;
  readonly waits: number;
  readonly waitMs: number;
  readonly chunks: readonly SpeechTrialChunk[];
  readonly done: boolean;
}

/** The status fields of the player's state that the recorder reads (lib/speech/player SpeechState). */
interface PlayerStateLike {
  readonly status: string;
  readonly owner: string | null;
  readonly index: number;
}

/** A wait shorter than this is the next chunk being opened, not a pause anyone hears. */
const AUDIBLE_WAIT_MS = 150;

export class SpeechTrialRecorder {
  private current: SpeechTrialRead | null = null;
  private startedAt = 0;
  private waitFrom: number | null = null;
  private last = 'idle';
  private lastOwner: string | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  /** Every state the player publishes. */
  onState(s: PlayerStateLike, model: string | null = speechTrialModel()): void {
    const t = this.now();
    const was = this.last;
    const another = s.owner !== this.lastOwner;
    this.last = s.status;
    this.lastOwner = s.owner;
    if (s.status === 'loading' && s.index === 0 && (another || (was !== 'loading' && was !== 'paused'))) {
      if (!model) return;
      this.startedAt = t;
      this.waitFrom = null;
      return this.set({ model, firstSoundMs: null, waits: 0, waitMs: 0, chunks: [], done: false });
    }
    const r = this.current;
    if (!r || r.done) return;
    if (s.status === 'playing') {
      if (r.firstSoundMs === null) return this.set({ ...r, firstSoundMs: t - this.startedAt });
      if (this.waitFrom !== null) {
        const ms = t - this.waitFrom;
        this.waitFrom = null;
        if (ms >= AUDIBLE_WAIT_MS) this.set({ ...r, waits: r.waits + 1, waitMs: r.waitMs + ms });
      }
      return;
    }
    if (s.status === 'loading' && s.index > 0 && was === 'playing') this.waitFrom = t;
    else if (s.status === 'paused') this.waitFrom = null;
    else if (s.status === 'done' || s.status === 'failed' || s.status === 'idle') this.set({ ...r, done: true });
  }

  /** One chunk's answer, in the order they were asked for. */
  onChunk(chunk: SpeechTrialChunk): void {
    const r = this.current;
    if (r && !r.done) this.set({ ...r, chunks: [...r.chunks, chunk] });
  }

  /** The latest trial read (under way or finished), or null before the first. */
  snapshot = (): SpeechTrialRead | null => this.current;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };

  private set(next: SpeechTrialRead): void {
    this.current = next;
    for (const fn of [...this.listeners]) {
      try { fn(); } catch { /* a listener's failure must not break the read */ }
    }
  }
}

/** Audio length of a contract WAV (one 44-byte header, 16-bit PCM) from its size and its profile's "<rate>x<channels>". */
export function wavAudioMs(bytes: number, profile: string | null): number | null {
  const m = /\|(\d+)x(\d+)$/.exec(profile ?? '');
  if (!m || bytes <= 44) return null;
  const rate = Number(m[1]);
  const channels = Number(m[2]);
  if (!rate || !channels) return null;
  return Math.round(((bytes - 44) / (2 * channels * rate)) * 1000);
}

let recorder: SpeechTrialRecorder | null = null;

/** The page's one recorder. */
export function speechTrialRecorder(): SpeechTrialRecorder {
  return (recorder ??= new SpeechTrialRecorder());
}

// The link is also read as the page loads: the studio may change its address (a new chat) before the first tap.
if (typeof window !== 'undefined') speechTrialModel();
