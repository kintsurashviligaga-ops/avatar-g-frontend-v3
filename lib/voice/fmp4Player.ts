/**
 * lib/voice/fmp4Player.ts — plays a Gemini 3.8 Live talking avatar (fragmented MP4 pieces, lib/voice/fmp4) in a <video>
 * through Media Source Extensions: ManagedMediaSource on iPhone (Safari 17.1+, which has no plain MediaSource), MediaSource
 * elsewhere.
 *
 *  • An init segment (once per Live session) opens a NEW MediaSource: a resumed or renewed session restarts its timeline,
 *    and appending a second init with its own clock into the old buffer would play stale or overlapping frames.
 *  • 'segments' mode: video and audio arrive in SEPARATE fragments, and 'sequence' would lay them end to end.
 *  • Live edge: playback starts at the first buffered frame, skips a gap it stalls at, and jumps ahead only when it is more
 *    than MAX_LAG_S behind (a background tab, a long stall) or when the answer was interrupted. Never on a normal answer:
 *    the server may send speech ahead of real time, and dropping it would cut words.
 *  • Memory: what was played more than KEEP_BEHIND_S ago is removed; on QuotaExceededError more is removed and the append
 *    retried once, then the piece is dropped.
 *  • Sound: with the call's speaker path (options.audioOutput) and a browser that decodes the codec, the voice plays
 *    through Web Audio (lib/voice/avatarAudio) and the <video> plays muted — on iPhone a <video>'s sound is low while
 *    the microphone is open. Otherwise play() unmuted first; where the browser refuses without a tap (NotAllowedError),
 *    the avatar plays muted and the state says 'muted' so the screen can offer "tap for sound" (unlock() in that tap).
 */
import { AvatarAudio, type AvatarAudioDeps, type AvatarAudioOutput } from './avatarAudio';
import { base64ToBytes, isInitSegment, mseMimeFor } from './fmp4';

export type AvatarPlayerState = 'idle' | 'buffering' | 'playing' | 'muted' | 'blocked' | 'unsupported' | 'error';

type MediaSourceCtor = { new (): MediaSource; isTypeSupported(type: string): boolean };

export interface Fmp4PlayerDeps {
  /** ManagedMediaSource where it exists (iPhone), else MediaSource; null = no MSE at all. */
  MediaSource: MediaSourceCtor | null;
  /** ManagedMediaSource: needs disableRemotePlayback (or an AirPlay source) to attach at all. */
  managed: boolean;
  createObjectURL: (source: MediaSource) => string;
  revokeObjectURL: (url: string) => void;
}

export function defaultPlayerDeps(): Fmp4PlayerDeps {
  const w = (typeof window !== 'undefined' ? window : {}) as { ManagedMediaSource?: MediaSourceCtor; MediaSource?: MediaSourceCtor };
  const managed = typeof w.ManagedMediaSource === 'function';
  return {
    MediaSource: (managed ? w.ManagedMediaSource : w.MediaSource) ?? null,
    managed,
    createObjectURL: (s) => URL.createObjectURL(s),
    revokeObjectURL: (u) => URL.revokeObjectURL(u),
  };
}

/** Whether this browser can play the avatar at all (the codecs the probe measured). */
export function avatarPlaybackSupported(type: string, deps: Fmp4PlayerDeps = defaultPlayerDeps()): boolean {
  try { return !!deps.MediaSource && deps.MediaSource.isTypeSupported(type); } catch { return false; }
}

/** More than this behind the newest frame (s) = a stall or a background tab: jump ahead. */
export const MAX_LAG_S = 10;
/** Where a jump lands, behind the newest frame (s). */
export const LIVE_EDGE_S = 0.25;
/** Played video kept for this long (s); older is removed once it exceeds EVICT_AFTER_S. */
export const KEEP_BEHIND_S = 10;
export const EVICT_AFTER_S = 30;
/** Pieces waiting for the SourceBuffer at most (a stalled decoder must not grow memory without end). */
export const MAX_QUEUE = 240;

export interface Fmp4PlayerOptions {
  /** The call's speaker path; with it the voice plays through Web Audio where the browser can decode it. */
  audioOutput?: () => AvatarAudioOutput | null;
  audioDeps?: AvatarAudioDeps;
}

const isQuota = (e: unknown): boolean => !!e && typeof e === 'object' && (e as { name?: unknown }).name === 'QuotaExceededError';

export class Fmp4Player {
  private ms: MediaSource | null = null;
  private sb: SourceBuffer | null = null;
  private url: string | null = null;
  private queue: Uint8Array[] = [];
  private generation = 0;
  private started = false;
  private quotaRetry = false;
  private destroyed = false;
  private state: AvatarPlayerState = 'idle';
  private readonly audio: AvatarAudio | null;
  private externalAudio = false; // the voice plays through Web Audio: the <video> is muted on purpose
  private readonly onWaiting = (): void => { this.followLiveEdge(); };

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly onState: (state: AvatarPlayerState) => void = () => {},
    private readonly d: Fmp4PlayerDeps = defaultPlayerDeps(),
    options: Fmp4PlayerOptions = {},
  ) {
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    if (d.managed) (video as HTMLVideoElement & { disableRemotePlayback: boolean }).disableRemotePlayback = true;
    video.addEventListener('waiting', this.onWaiting);
    this.audio = options.audioOutput ? new AvatarAudio(video, options.audioOutput, (on) => this.onExternalAudio(on), options.audioDeps) : null;
  }

  get current(): AvatarPlayerState { return this.state; }

  /** One base64 piece from the Live session (an init segment or a fragment). */
  push(b64: string): void {
    if (this.destroyed) return;
    const bytes = base64ToBytes(b64);
    if (bytes.length === 0) return;
    if (isInitSegment(bytes)) { this.open(bytes); this.audio?.open(bytes); return; }
    if (!this.ms) return; // a fragment with no init before it cannot be decoded
    this.audio?.push(bytes);
    this.queue.push(bytes);
    if (this.queue.length > MAX_QUEUE) this.queue.splice(1, this.queue.length - MAX_QUEUE); // keep the head (maybe the init)
    this.pump();
  }

  /** The answer was interrupted: show what the avatar does now, not the rest of the cut-off answer. */
  jumpToLive(): void {
    const b = this.buffered();
    if (!b || b.length === 0) return;
    const end = b.end(b.length - 1);
    this.seek(Math.max(b.start(b.length - 1), end - LIVE_EDGE_S));
  }

  /** Inside a tap: sound on and playing. */
  unlock(): void {
    if (this.destroyed) return;
    this.video.muted = this.externalAudio;
    this.play(true);
  }

  /** Drop the session's stream (a new call or a voice-only session follows). */
  reset(): void {
    const hadSource = this.url !== null;
    this.audio?.reset();
    this.closeSource();
    if (hadSource) {
      this.video.removeAttribute('src');
      try { this.video.load(); } catch { /* noop */ }
    }
    this.setState('idle');
  }

  destroy(): void {
    if (this.destroyed) return;
    this.reset();
    this.destroyed = true;
    this.audio?.destroy();
    this.video.removeEventListener('waiting', this.onWaiting);
  }

  // ── internals ──

  /** The voice moved to Web Audio (the <video> goes quiet) or back to the <video>. */
  private onExternalAudio(on: boolean): void {
    if (this.destroyed) return;
    this.externalAudio = on;
    const v = this.video;
    if (on) {
      v.muted = true;
      if (this.started && (this.state === 'muted' || this.state === 'blocked')) this.play(false); // muted needs no tap
    } else if (v.muted) {
      v.muted = false;
      if (this.started) this.play(true);
    }
  }

  private setState(s: AvatarPlayerState): void {
    if (s === this.state) return;
    this.state = s;
    try { this.onState(s); } catch { /* a host bug must not stop playback */ }
  }

  private buffered(): TimeRanges | null {
    try { return this.video.buffered; } catch { return null; }
  }

  private seek(t: number): void {
    try { if (Number.isFinite(t) && Math.abs(this.video.currentTime - t) > 0.05) this.video.currentTime = t; } catch { /* not seekable yet */ }
  }

  private closeSource(): void {
    this.generation += 1;
    this.queue = [];
    this.sb = null;
    this.ms = null;
    this.started = false;
    this.quotaRetry = false;
    if (this.url) { try { this.d.revokeObjectURL(this.url); } catch { /* noop */ } this.url = null; }
  }

  private open(init: Uint8Array): void {
    this.closeSource();
    const Ctor = this.d.MediaSource;
    const type = mseMimeFor(init);
    if (!Ctor || !avatarPlaybackSupported(type, this.d)) { this.setState('unsupported'); return; }
    const gen = this.generation;
    let ms: MediaSource;
    try { ms = new Ctor(); } catch { this.setState('error'); return; }
    this.ms = ms;
    this.queue = [init];
    ms.addEventListener('sourceopen', () => {
      if (gen !== this.generation || this.destroyed) return;
      try {
        const sb = ms.addSourceBuffer(type);
        sb.mode = 'segments';
        sb.addEventListener('updateend', () => { if (gen === this.generation) this.afterUpdate(); });
        this.sb = sb;
      } catch {
        this.setState('error');
        return;
      }
      this.pump();
    }, { once: true });
    this.url = this.d.createObjectURL(ms);
    this.video.src = this.url;
    this.setState('buffering');
  }

  private pump(): void {
    const sb = this.sb;
    if (!sb || sb.updating || this.queue.length === 0 || this.ms?.readyState !== 'open') return;
    const next = this.queue[0]!;
    try {
      sb.appendBuffer(next as Uint8Array<ArrayBuffer>);
      this.queue.shift();
      this.quotaRetry = false;
    } catch (e) {
      if (isQuota(e) && !this.quotaRetry && this.evict(true)) { this.quotaRetry = true; return; } // retried after the remove
      this.queue.shift(); // a piece the buffer refuses: skip it rather than block every later one
      this.quotaRetry = false;
      if (this.queue.length) queueMicrotask(() => this.pump());
    }
  }

  private afterUpdate(): void {
    if (!this.started) {
      const b = this.buffered();
      if (b && b.length > 0) {
        this.started = true;
        this.seek(b.start(0));
        this.play(true);
      }
    } else {
      this.followLiveEdge();
    }
    if (this.evictDue() && this.evict(false)) return;
    this.pump();
  }

  /** Stalled at a gap → the next range; far behind → near the newest frame. */
  private followLiveEdge(): void {
    const b = this.buffered();
    if (!b || b.length === 0) return;
    const t = this.video.currentTime;
    const end = b.end(b.length - 1);
    if (end - t > MAX_LAG_S) { this.seek(end - LIVE_EDGE_S); return; }
    for (let i = 0; i < b.length; i += 1) {
      if (t < b.start(i)) {
        if (i === 0 || t >= b.end(i - 1) - 0.1) this.seek(b.start(i));
        return;
      }
    }
  }

  private evictDue(): boolean {
    const b = this.buffered();
    return !!b && b.length > 0 && this.video.currentTime - b.start(0) > EVICT_AFTER_S;
  }

  /** Removes played video; true when a remove started (its updateend continues the queue). */
  private evict(hard: boolean): boolean {
    const sb = this.sb;
    const b = this.buffered();
    if (!sb || sb.updating || !b || b.length === 0) return false;
    const upTo = this.video.currentTime - (hard ? 2 : KEEP_BEHIND_S);
    if (upTo <= b.start(0)) return false;
    try { sb.remove(b.start(0), upTo); return true; } catch { return false; }
  }

  private play(allowMutedFallback: boolean): void {
    const v = this.video;
    let p: Promise<void> | undefined;
    try { p = v.play(); } catch (e) { p = Promise.reject(e); }
    const heard = (): AvatarPlayerState => (v.muted && !this.externalAudio ? 'muted' : 'playing');
    if (!p || typeof p.then !== 'function') { this.setState(heard()); return; }
    const gen = this.generation;
    p.then(
      () => { if (!this.destroyed) this.setState(heard()); },
      (err: unknown) => {
        if (this.destroyed || gen !== this.generation) return;
        const name = err && typeof err === 'object' ? (err as { name?: unknown }).name : undefined;
        if (name === 'AbortError') return; // a new source replaced this one
        if (name === 'NotAllowedError' && allowMutedFallback && !v.muted) {
          v.muted = true; // muted inline playback needs no tap: the face shows, the sound waits for one
          this.play(false);
          return;
        }
        this.setState('blocked'); // nothing plays until a tap (unlock)
      },
    );
  }
}
