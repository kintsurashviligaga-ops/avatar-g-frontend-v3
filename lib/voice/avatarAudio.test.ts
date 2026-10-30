import { AVATAR_AUDIO_GAIN, AvatarAudio, LOOKAHEAD_S, type AvatarAudioDeps } from './avatarAudio';
import { vertexFragment, vertexInit } from './testing/fmp4Fixtures';

const FRAME_S = 1024 / 24000; // one AAC frame of Vertex's 24 kHz voice

class FakeChunk {
  constructor(public init: EncodedAudioChunkInit) {}
}

class FakeDecoder {
  static support: boolean | 'throw' | 'reject' = true;
  static instances: FakeDecoder[] = [];
  static isConfigSupported(config: AudioDecoderConfig): Promise<{ supported: boolean; config: AudioDecoderConfig }> {
    if (FakeDecoder.support === 'throw') throw new TypeError('bad config');
    if (FakeDecoder.support === 'reject') return Promise.reject(new TypeError('bad config'));
    return Promise.resolve({ supported: FakeDecoder.support, config });
  }
  state = 'unconfigured';
  config: AudioDecoderConfig | null = null;
  chunks: EncodedAudioChunkInit[] = [];
  close = jest.fn(() => { this.state = 'closed'; });
  constructor(public init: AudioDecoderInit) { FakeDecoder.instances.push(this); }
  configure(c: AudioDecoderConfig): void { this.config = c; this.state = 'configured'; }
  decode(c: FakeChunk): void { this.chunks.push(c.init); }
  /** The decoder hands out one frame of `frames` samples at `t` seconds. */
  emit(t: number, frames = 1024): { close: jest.Mock } {
    const data = {
      numberOfFrames: frames,
      numberOfChannels: 1,
      sampleRate: 24000,
      timestamp: Math.round(t * 1e6),
      copyTo: jest.fn(),
      close: jest.fn(),
    };
    this.init.output(data as unknown as AudioData);
    return data;
  }
}

function fakeNode() {
  return { connect: jest.fn(), disconnect: jest.fn() };
}

function fakeCtx() {
  const sources: Array<ReturnType<typeof source>> = [];
  const source = () => ({
    ...fakeNode(),
    buffer: null as { duration: number } | null,
    start: jest.fn(),
    stop: jest.fn(),
    onended: null as (() => void) | null,
  });
  const ctx = {
    currentTime: 10,
    state: 'running',
    sources,
    gains: [] as Array<ReturnType<typeof fakeNode> & { gain: { value: number } }>,
    limiters: [] as Array<ReturnType<typeof fakeNode>>,
    createGain() { const g = { ...fakeNode(), gain: { value: 1 } }; ctx.gains.push(g); return g; },
    createDynamicsCompressor() {
      const p = () => ({ value: 0 });
      const l = { ...fakeNode(), threshold: p(), knee: p(), ratio: p(), attack: p(), release: p() };
      ctx.limiters.push(l);
      return l;
    },
    createBuffer: jest.fn((_ch: number, frames: number, rate: number) => ({ duration: frames / rate, copyToChannel: jest.fn() })),
    createBufferSource() { const s = source(); sources.push(s); return s; },
  };
  return ctx;
}

function fakeVideo() {
  const listeners = new Map<string, Set<() => void>>();
  const v = {
    currentTime: 0,
    paused: false,
    seeking: false,
    readyState: 4,
    addEventListener: jest.fn((t: string, f: () => void) => { if (!listeners.has(t)) listeners.set(t, new Set()); listeners.get(t)!.add(f); }),
    removeEventListener: jest.fn((t: string, f: () => void) => { listeners.get(t)?.delete(f); }),
    fire(t: string) { for (const f of listeners.get(t) ?? []) f(); },
    listening: () => [...listeners.values()].reduce((n, s) => n + s.size, 0),
  };
  return v;
}

function setup(opts: { decoder?: boolean; output?: boolean } = {}) {
  FakeDecoder.instances = [];
  FakeDecoder.support = true;
  const video = fakeVideo();
  const ctx = fakeCtx();
  const node = fakeNode();
  const active: boolean[] = [];
  const deps: AvatarAudioDeps = {
    AudioDecoder: opts.decoder === false ? null : (FakeDecoder as unknown as AvatarAudioDeps['AudioDecoder']),
    EncodedAudioChunk: FakeChunk as unknown as AvatarAudioDeps['EncodedAudioChunk'],
    setInterval: jest.fn(() => 7),
    clearInterval: jest.fn(),
  };
  const output = () => (opts.output === false ? null : { ctx: ctx as unknown as AudioContext, node: node as unknown as AudioNode });
  const audio = new AvatarAudio(video as unknown as HTMLVideoElement, output, (on) => active.push(on), deps);
  return { audio, video, ctx, node, active, deps };
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const startsOf = (ctx: ReturnType<typeof fakeCtx>) => ctx.sources.filter((s) => s.start.mock.calls.length > 0).map((s) => s.start.mock.calls[0] as number[]);

describe('AvatarAudio', () => {
  it('moves the voice to the call output: AAC config from the init, +gain into a limiter, waiting fragments decoded', async () => {
    const { audio, ctx, node, active, deps } = setup();
    audio.open(vertexInit());
    audio.push(vertexFragment(2, 2048, [0x01, 0x40, 0x22])); // arrives while the codec is being checked
    expect(FakeDecoder.instances).toHaveLength(0);
    await flush();
    expect(active).toEqual([true]);
    expect(audio.active).toBe(true);
    const dec = FakeDecoder.instances[0]!;
    expect(dec.config).toMatchObject({ codec: 'mp4a.40.2', sampleRate: 24000, numberOfChannels: 1 });
    expect(Array.from(new Uint8Array(dec.config!.description as Uint8Array))).toEqual([0x13, 0x08]);
    expect(ctx.gains[0]!.gain.value).toBe(AVATAR_AUDIO_GAIN);
    expect(ctx.gains[0]!.connect).toHaveBeenCalledWith(ctx.limiters[0]);
    expect(ctx.limiters[0]!.connect).toHaveBeenCalledWith(node);
    expect(deps.setInterval).toHaveBeenCalledTimes(1);
    expect(dec.chunks).toHaveLength(1);
    expect(dec.chunks[0]).toMatchObject({ type: 'key', timestamp: Math.round((2048 / 24000) * 1e6), duration: Math.round(FRAME_S * 1e6) });
    audio.push(vertexFragment(1, 7680, [9, 9, 9], 3750)); // the picture's own fragments are not for the decoder
    audio.push(vertexFragment(2, 3072, [0x01, 0x40]));
    expect(dec.chunks.map((c) => c.timestamp)).toEqual([85333, 128000]);
  });

  it('plays each frame when the picture shows its time, and following frames back to back', async () => {
    const { audio, video, ctx } = setup();
    audio.open(vertexInit());
    await flush();
    const dec = FakeDecoder.instances[0]!;
    const data = dec.emit(0);
    expect(data.close).toHaveBeenCalled(); // every AudioData is released
    dec.emit(FRAME_S);
    expect(startsOf(ctx)).toEqual([[10, 0], [10 + FRAME_S, 0]]);
    // Beyond the lookahead: waits for a later tick.
    dec.emit(0.5);
    expect(ctx.sources).toHaveLength(2);
    ctx.currentTime = 10.2;
    video.currentTime = 0.2;
    video.fire('timeupdate');
    expect(startsOf(ctx)[2]![0]).toBeCloseTo(10.5, 6);
    expect(startsOf(ctx)[2]![0]! - ctx.currentTime).toBeLessThanOrEqual(LOOKAHEAD_S);
    // Every source plays into the gain stage, not straight to the speaker.
    for (const s of ctx.sources) expect(s.connect).toHaveBeenCalledWith(ctx.gains[0]);
  });

  it('skips what the picture already passed and starts a late frame part-way', async () => {
    const { audio, video, ctx } = setup();
    audio.open(vertexInit());
    await flush();
    const dec = FakeDecoder.instances[0]!;
    video.currentTime = 1;
    dec.emit(0); // long gone
    dec.emit(0.98); // 20 ms of it are left
    expect(ctx.sources).toHaveLength(1);
    const [at, offset] = startsOf(ctx)[0]!;
    expect(at).toBe(10);
    expect(offset).toBeCloseTo(0.02, 6);
  });

  it('reads the picture clock again when back-to-back drifts from it', async () => {
    const { audio, video, ctx } = setup();
    audio.open(vertexInit());
    await flush();
    const dec = FakeDecoder.instances[0]!;
    dec.emit(0);
    ctx.currentTime = 10.2; // the picture stood still for 200 ms without a 'waiting'
    video.currentTime = 0;
    dec.emit(FRAME_S);
    expect(startsOf(ctx)[1]![0]).toBeCloseTo(10.2 + FRAME_S, 6);
  });

  it('a seek stops what was scheduled; what was not heard plays again from the new picture time', async () => {
    const { audio, video, ctx } = setup();
    audio.open(vertexInit());
    await flush();
    const dec = FakeDecoder.instances[0]!;
    dec.emit(2);
    dec.emit(2 + FRAME_S);
    expect(ctx.sources).toHaveLength(0); // the picture is at 0: 2 s ahead
    video.currentTime = 1.9;
    video.fire('timeupdate');
    expect(ctx.sources).toHaveLength(2);
    video.seeking = true;
    video.fire('seeking');
    expect(ctx.sources.every((s) => s.stop.mock.calls.length === 1)).toBe(true);
    video.fire('timeupdate'); // still seeking: nothing
    expect(ctx.sources).toHaveLength(2);
    video.seeking = false;
    video.currentTime = 2;
    video.fire('playing');
    expect(startsOf(ctx).slice(2)).toEqual([[10, 0], [10 + FRAME_S, 0]]);
  });

  it('holds the voice while the picture is paused, starved or the call output is suspended', async () => {
    const { audio, video, ctx } = setup();
    audio.open(vertexInit());
    await flush();
    const dec = FakeDecoder.instances[0]!;
    video.paused = true;
    dec.emit(0);
    video.paused = false;
    video.readyState = 2;
    video.fire('timeupdate');
    video.readyState = 4;
    ctx.state = 'suspended';
    video.fire('timeupdate');
    expect(ctx.sources).toHaveLength(0);
    ctx.state = 'running';
    video.fire('playing');
    expect(startsOf(ctx)).toEqual([[10, 0]]);
  });

  it('leaves the voice in the video when the browser cannot decode it, or the decoder fails', async () => {
    for (const support of [false, 'throw', 'reject'] as const) {
      const { audio, active } = setup();
      FakeDecoder.support = support;
      audio.open(vertexInit());
      await flush();
      expect(active).toEqual([]); // was never moved: nothing to say
      expect(audio.active).toBe(false);
      expect(FakeDecoder.instances).toHaveLength(0);
    }
    for (const opts of [{ decoder: false }, { output: false }]) {
      const { audio } = setup(opts);
      audio.open(vertexInit());
      await flush();
      expect(audio.active).toBe(false);
    }
    const { audio, active, deps } = setup();
    audio.open(vertexInit());
    await flush();
    FakeDecoder.instances[0]!.init.error(new DOMException('decode', 'EncodingError'));
    expect(active).toEqual([true, false]);
    expect(FakeDecoder.instances[0]!.close).toHaveBeenCalled();
    expect(deps.clearInterval).toHaveBeenCalledWith(7);
  });

  it('every session decides again: a new init re-announces, an unsupported one hands the voice back', async () => {
    const { audio, active } = setup();
    audio.open(vertexInit());
    await flush();
    audio.open(vertexInit()); // the host may have unmuted the video since (a new session's tap)
    await flush();
    expect(active).toEqual([true, true]);
    FakeDecoder.support = false;
    audio.open(vertexInit());
    await flush();
    expect(active).toEqual([true, true, false]);
  });

  it('a check that finishes after a newer init does nothing', async () => {
    const { audio, active } = setup();
    audio.open(vertexInit());
    audio.open(vertexInit());
    await flush();
    expect(FakeDecoder.instances).toHaveLength(1);
    expect(active).toEqual([true]);
  });

  it('an init without an AAC track keeps the voice in the video', async () => {
    const { audio, active } = setup();
    audio.open(vertexInit());
    await flush();
    audio.open(new Uint8Array([0, 0, 0, 8, 0x6d, 0x6f, 0x6f, 0x76])); // an empty moov
    expect(active).toEqual([true, false]);
  });

  it('reset drops the session; destroy also lets go of the video', async () => {
    const { audio, video, ctx, deps } = setup();
    audio.open(vertexInit());
    await flush();
    const dec = FakeDecoder.instances[0]!;
    video.currentTime = 1.9;
    dec.emit(2);
    expect(ctx.sources).toHaveLength(1);
    audio.reset();
    expect(ctx.sources[0]!.stop).toHaveBeenCalled();
    expect(dec.close).toHaveBeenCalled();
    expect(ctx.gains[0]!.disconnect).toHaveBeenCalled();
    expect(deps.clearInterval).toHaveBeenCalledWith(7);
    audio.push(vertexFragment(2, 0, [1])); // no session: ignored
    expect(dec.chunks).toHaveLength(0);
    expect(video.listening()).toBe(5);
    audio.destroy();
    expect(video.listening()).toBe(0);
    audio.open(vertexInit());
    await flush();
    expect(FakeDecoder.instances).toHaveLength(1);
  });
});
