/**
 * lib/voice/avatarAudio.ts — the talking avatar's VOICE through the call's Web Audio output, not through its <video>.
 *
 * ⚠️ GG 2026-10-25 18:17Z (iPhone): both avatars spoke much more quietly than a voice call. The stream is not quiet
 * (Vertex's own clip: speech ≈ −16 LUFS momentary, true peak −4.5 dBFS); a <video>'s sound plays low while the call's
 * microphone is open, and a voice call plays through Web Audio. Safari cannot route an MSE <video> into Web Audio
 * (createMediaElementSource gives silence for a MediaSource, WebKit bug 266922), so the AAC frames are decoded here
 * (WebCodecs AudioDecoder), lifted AVATAR_AUDIO_GAIN through a limiter and played on the call's own output (where the
 * voice answers play, so the level meter and the echo canceller hear them too). The <video> plays muted and shows the
 * face. Without AudioDecoder or the codec nothing changes: the <video> keeps its own sound.
 *
 *  • Lips: a frame plays when the <video> shows its time (ctx time = now + frameTime − video.currentTime); frames that
 *    follow each other play back to back, and the clock is read again once they drift more than RESYNC_S from it.
 *  • A seek (an interrupted answer jumps to the live edge), a stall or a pause stops what was scheduled; it plays again
 *    from the picture's time, so the voice never runs ahead of a frozen face.
 */
import { aacTrack, fragmentSamples, type AacTrack } from './fmp4';

/** The call's speaker path: its AudioContext and the node the voice answers play into. */
export interface AvatarAudioOutput { ctx: AudioContext; node: AudioNode }

type DecoderCtor = {
  new (init: AudioDecoderInit): AudioDecoder;
  isConfigSupported(config: AudioDecoderConfig): Promise<AudioDecoderSupport>;
};
type ChunkCtor = new (init: EncodedAudioChunkInit) => EncodedAudioChunk;

export interface AvatarAudioDeps {
  AudioDecoder: DecoderCtor | null;
  EncodedAudioChunk: ChunkCtor | null;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (id: unknown) => void;
}

export function defaultAvatarAudioDeps(): AvatarAudioDeps {
  const g = globalThis as { AudioDecoder?: DecoderCtor; EncodedAudioChunk?: ChunkCtor };
  return {
    AudioDecoder: typeof g.AudioDecoder === 'function' ? g.AudioDecoder : null,
    EncodedAudioChunk: typeof g.EncodedAudioChunk === 'function' ? g.EncodedAudioChunk : null,
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
  };
}

/** +4 dB over the stream; the limiter below keeps the peaks (−4.5 dBFS measured) from clipping. */
export const AVATAR_AUDIO_GAIN = 1.6;
/** Frames are scheduled this far ahead of the picture (s). */
export const LOOKAHEAD_S = 0.4;
/** Back-to-back frames this far (s) from the picture's clock → read the clock again. */
export const RESYNC_S = 0.08;
/** Decoded frames (and fragments waiting for the decoder) kept at most: ≈ 25 s of 43 ms frames. */
export const MAX_QUEUED = 600;
/** How often (ms) frames beyond the lookahead are looked at again. */
const TICK_MS = 100;
/** HTMLMediaElement.HAVE_FUTURE_DATA: the picture is moving. */
const HAVE_FUTURE_DATA = 3;

interface Frame { t: number; buffer: AudioBuffer }
interface Scheduled { frame: Frame; src: AudioBufferSourceNode; end: number }

export class AvatarAudio {
  private track: AacTrack | null = null;
  private decoder: AudioDecoder | null = null;
  private out: AvatarAudioOutput | null = null;
  private input: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private waiting: Uint8Array[] = []; // fragments that came while the codec was being checked
  private frames: Frame[] = []; // decoded, not scheduled yet, by time
  private scheduled: Scheduled[] = [];
  private cursor: { at: number; t: number } | null = null; // where the last scheduled frame ends: ctx time, media time
  private generation = 0;
  private timer: unknown = null;
  private on = false;
  private destroyed = false;
  private readonly kick = (): void => { this.schedule(); };
  private readonly halt = (): void => { this.cancel(); };

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly output: () => AvatarAudioOutput | null,
    private readonly onActive: (active: boolean) => void,
    private readonly d: AvatarAudioDeps = defaultAvatarAudioDeps(),
  ) {
    video.addEventListener('playing', this.kick);
    video.addEventListener('timeupdate', this.kick);
    video.addEventListener('seeking', this.halt);
    video.addEventListener('waiting', this.halt);
    video.addEventListener('pause', this.halt);
  }

  /** Whether the voice plays here (the <video> is muted) rather than in the <video>. */
  get active(): boolean { return this.on; }

  /** A Live session's init segment: a new timeline and, when this browser decodes the codec, the voice moves here. */
  open(init: Uint8Array): void {
    if (this.destroyed) return;
    this.reset();
    const gen = this.generation;
    const track = aacTrack(init);
    const out = this.output();
    const Decoder = this.d.AudioDecoder;
    if (!track || !out || !Decoder || !this.d.EncodedAudioChunk) { this.setActive(false); return; }
    this.track = track;
    const config: AudioDecoderConfig = { codec: track.codec, sampleRate: track.sampleRate, numberOfChannels: track.channels, description: track.asc };
    let check: Promise<AudioDecoderSupport>;
    try { check = Decoder.isConfigSupported(config); } catch { this.giveUp(); return; }
    Promise.resolve(check).then(
      (r) => { if (gen === this.generation) { if (r?.supported) this.start(Decoder, config, out); else this.giveUp(); } },
      () => { if (gen === this.generation) this.giveUp(); },
    );
  }

  /** A media fragment of the session (video fragments are ignored here). */
  push(fragment: Uint8Array): void {
    if (this.destroyed || !this.track) return;
    if (!this.decoder) {
      if (this.waiting.length < MAX_QUEUED) this.waiting.push(fragment);
      return;
    }
    this.decode(fragment);
  }

  /** Drops the session's voice; whether the next one plays here is decided by its init segment. */
  reset(): void {
    this.generation += 1;
    this.cancel();
    this.frames = [];
    this.waiting = [];
    this.track = null;
    if (this.decoder) { try { this.decoder.close(); } catch { /* already closed */ } this.decoder = null; }
    try { this.input?.disconnect(); } catch { /* noop */ }
    try { this.limiter?.disconnect(); } catch { /* noop */ }
    this.input = null;
    this.limiter = null;
    this.out = null;
    if (this.timer !== null) { this.d.clearInterval(this.timer); this.timer = null; }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.reset();
    this.destroyed = true;
    this.video.removeEventListener('playing', this.kick);
    this.video.removeEventListener('timeupdate', this.kick);
    this.video.removeEventListener('seeking', this.halt);
    this.video.removeEventListener('waiting', this.halt);
    this.video.removeEventListener('pause', this.halt);
  }

  // ── internals ──

  /** `force`: say it again — the host may have unmuted the <video> since (a new avatar session's tap). */
  private setActive(on: boolean, force = false): void {
    if (on === this.on && !force) return;
    this.on = on;
    try { this.onActive(on); } catch { /* a host bug must not stop the voice */ }
  }

  /** This session's voice stays in the <video>. */
  private giveUp(): void {
    this.reset();
    this.setActive(false);
  }

  private start(Decoder: DecoderCtor, config: AudioDecoderConfig, out: AvatarAudioOutput): void {
    const gen = this.generation;
    try {
      const decoder = new Decoder({
        output: (data) => { if (gen === this.generation) this.onDecoded(data); else data.close(); },
        error: () => { if (gen === this.generation) this.giveUp(); },
      });
      decoder.configure(config);
      const input = out.ctx.createGain();
      input.gain.value = AVATAR_AUDIO_GAIN;
      const limiter = out.ctx.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.knee.value = 4;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.12;
      input.connect(limiter);
      limiter.connect(out.node);
      this.decoder = decoder;
      this.out = out;
      this.input = input;
      this.limiter = limiter;
    } catch {
      this.giveUp();
      return;
    }
    this.timer = this.d.setInterval(this.kick, TICK_MS);
    this.setActive(true, true);
    const waiting = this.waiting;
    this.waiting = [];
    for (const f of waiting) this.decode(f);
  }

  private decode(fragment: Uint8Array): void {
    const track = this.track;
    const decoder = this.decoder;
    const Chunk = this.d.EncodedAudioChunk;
    if (!track || !decoder || !Chunk || decoder.state !== 'configured') return;
    for (const s of fragmentSamples(fragment)) {
      if (s.trackId !== track.trackId) continue;
      try {
        decoder.decode(new Chunk({
          type: 'key', // every AAC-LC frame decodes on its own
          timestamp: Math.round((s.time * 1e6) / track.timescale),
          duration: Math.round((s.duration * 1e6) / track.timescale),
          data: s.data,
        }));
      } catch { /* one bad frame: skip it */ }
    }
  }

  private onDecoded(data: AudioData): void {
    const out = this.out;
    try {
      const frames = data.numberOfFrames;
      const channels = data.numberOfChannels;
      if (!out || !frames || !channels) return;
      const buffer = out.ctx.createBuffer(channels, frames, data.sampleRate);
      for (let c = 0; c < channels; c += 1) {
        const plane = new Float32Array(frames);
        data.copyTo(plane, { planeIndex: c, format: 'f32-planar' });
        buffer.copyToChannel(plane, c);
      }
      const frame = { t: data.timestamp / 1e6, buffer };
      const last = this.frames[this.frames.length - 1];
      this.frames.push(frame);
      if (last && last.t > frame.t) this.frames.sort((a, b) => a.t - b.t);
      if (this.frames.length > MAX_QUEUED) this.frames.splice(0, this.frames.length - MAX_QUEUED);
    } catch {
      return; // a frame that cannot be copied is skipped
    } finally {
      data.close();
    }
    this.schedule();
  }

  private schedule(): void {
    const out = this.out;
    const input = this.input;
    const v = this.video;
    if (!this.on || !out || !input || this.frames.length === 0) return;
    if (v.paused || v.seeking || v.readyState < HAVE_FUTURE_DATA || out.ctx.state !== 'running') return;
    const ctx = out.ctx;
    const now = ctx.currentTime;
    const vt = v.currentTime;
    while (this.frames.length > 0) {
      const f = this.frames[0]!;
      const length = f.buffer.duration;
      if (f.t + length <= vt) { this.frames.shift(); continue; } // the picture is past it
      const ideal = now + (f.t - vt);
      const c = this.cursor;
      let at = c && Math.abs(f.t - c.t) < 0.002 && Math.abs(c.at - ideal) <= RESYNC_S ? c.at : ideal;
      if (at - now > LOOKAHEAD_S) break;
      this.frames.shift();
      let offset = 0;
      if (at < now) { offset = now - at; at = now; }
      if (offset >= length) continue;
      const src = ctx.createBufferSource();
      src.buffer = f.buffer;
      src.connect(input);
      try { src.start(at, offset); } catch { continue; }
      const entry: Scheduled = { frame: f, src, end: at + length - offset };
      this.scheduled.push(entry);
      src.onended = () => { this.scheduled = this.scheduled.filter((x) => x !== entry); };
      this.cursor = { at: entry.end, t: f.t + length };
    }
  }

  /** Stops what was scheduled; what was not heard yet goes back to play from the picture's time. */
  private cancel(): void {
    const now = this.out?.ctx.currentTime ?? 0;
    const back: Frame[] = [];
    for (const s of this.scheduled) {
      s.src.onended = null;
      try { s.src.stop(); } catch { /* not started */ }
      try { s.src.disconnect(); } catch { /* noop */ }
      if (s.end > now) back.push(s.frame);
    }
    this.scheduled = [];
    this.cursor = null;
    if (back.length > 0) this.frames = [...back, ...this.frames].sort((a, b) => a.t - b.t);
  }
}
