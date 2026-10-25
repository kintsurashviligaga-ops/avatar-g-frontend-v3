import type { AvatarAudioDeps } from './avatarAudio';
import { EVICT_AFTER_S, Fmp4Player, LIVE_EDGE_S, MAX_LAG_S, type AvatarPlayerState, type Fmp4PlayerDeps } from './fmp4Player';
import { toBase64, vertexFragment, vertexInit } from './testing/fmp4Fixtures';

// A minimal init (ftyp + moov) and fragment (moof + mdat); the codec sniffing itself is covered by fmp4.test.ts.
const box = (type: string, body: number[] = []): number[] => {
  const n = 8 + body.length;
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff, ...Array.from(type, (c) => c.charCodeAt(0)), ...body];
};
const b64 = (bytes: number[]): string => Buffer.from(bytes).toString('base64');
const INIT = b64([...box('ftyp', [0, 0, 0, 0]), ...box('moov', box('mvhd', [0, 0, 0, 0]))]);
const FRAG = (n: number): string => b64([...box('moof', [n]), ...box('mdat', [n, n])]);

class FakeRanges {
  constructor(public r: Array<[number, number]> = []) {}
  get length(): number { return this.r.length; }
  start(i: number): number { return this.r[i]![0]; }
  end(i: number): number { return this.r[i]![1]; }
}

class FakeSourceBuffer {
  mode = 'sequence';
  updating = false;
  appended: Uint8Array[] = [];
  removed: Array<[number, number]> = [];
  throwOnAppend: string | null = null;
  private listeners: Array<() => void> = [];
  addEventListener(_t: string, f: () => void): void { this.listeners.push(f); }
  appendBuffer(b: Uint8Array): void {
    if (this.throwOnAppend) { const name = this.throwOnAppend; this.throwOnAppend = null; throw Object.assign(new Error(name), { name }); }
    this.appended.push(b);
    this.updating = true;
  }
  remove(a: number, b: number): void { this.removed.push([a, b]); this.updating = true; }
  finish(): void { this.updating = false; for (const f of this.listeners) f(); }
}

class FakeMediaSource {
  static supported = true;
  static instances: FakeMediaSource[] = [];
  static isTypeSupported(): boolean { return FakeMediaSource.supported; }
  readyState = 'closed';
  types: string[] = [];
  sb = new FakeSourceBuffer();
  private open: Array<() => void> = [];
  constructor() { FakeMediaSource.instances.push(this); }
  addEventListener(_t: string, f: () => void): void { this.open.push(f); }
  addSourceBuffer(type: string): FakeSourceBuffer { this.types.push(type); return this.sb; }
  fireOpen(): void { this.readyState = 'open'; for (const f of this.open) f(); }
}

function fakeVideo() {
  const v = {
    buffered: new FakeRanges(),
    currentTime: 0,
    muted: false,
    playsInline: false,
    disableRemotePlayback: false,
    src: '',
    attrs: {} as Record<string, string>,
    playResult: (): Promise<void> => Promise.resolve(),
    play: jest.fn((): Promise<void> => v.playResult()),
    load: jest.fn(),
    setAttribute(k: string, val: string) { v.attrs[k] = val; },
    removeAttribute(k: string) { delete v.attrs[k]; v.src = ''; },
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  };
  return v;
}

/** The call's speaker path for the voice-through-Web-Audio tests; `decodes` = the browser's AudioDecoder takes AAC. */
function callOutput(decodes: boolean) {
  const node = () => ({ connect: jest.fn(), disconnect: jest.fn(), gain: { value: 1 }, threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 }, attack: { value: 0 }, release: { value: 0 } });
  const ctx = { currentTime: 0, state: 'running', createGain: node, createDynamicsCompressor: node };
  const decoded: unknown[] = [];
  class Decoder {
    static isConfigSupported = () => Promise.resolve({ supported: decodes });
    state = 'configured';
    configure(): void {}
    decode(c: unknown): void { decoded.push(c); }
    close(): void {}
  }
  const audioDeps: AvatarAudioDeps = {
    AudioDecoder: Decoder as unknown as AvatarAudioDeps['AudioDecoder'],
    EncodedAudioChunk: class { constructor(public init: unknown) {} } as unknown as AvatarAudioDeps['EncodedAudioChunk'],
    setInterval: () => 1,
    clearInterval: () => {},
  };
  return { audioOutput: () => ({ ctx: ctx as unknown as AudioContext, node: node() as unknown as AudioNode }), audioDeps, decoded };
}

function setup(managed = false, options?: ConstructorParameters<typeof Fmp4Player>[3]) {
  FakeMediaSource.instances = [];
  FakeMediaSource.supported = true;
  const video = fakeVideo();
  const states: AvatarPlayerState[] = [];
  const deps: Fmp4PlayerDeps = {
    MediaSource: FakeMediaSource as unknown as Fmp4PlayerDeps['MediaSource'],
    managed,
    createObjectURL: jest.fn(() => `blob:${FakeMediaSource.instances.length}`),
    revokeObjectURL: jest.fn(),
  };
  const player = new Fmp4Player(video as unknown as HTMLVideoElement, (s) => states.push(s), deps, options);
  return { video, states, deps, player };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('Fmp4Player', () => {
  it('opens a MediaSource on the init, appends in order in segments mode, starts at the first frame', async () => {
    const { video, states, player } = setup();
    player.push(FRAG(0)); // before any init: dropped
    player.push(INIT);
    expect(FakeMediaSource.instances).toHaveLength(1);
    expect(video.src).toBe('blob:1');
    player.push(FRAG(1));
    const ms = FakeMediaSource.instances[0]!;
    ms.fireOpen();
    expect(ms.sb.mode).toBe('segments');
    expect(ms.types[0]).toMatch(/^video\/mp4; codecs="avc1/); // unreadable init → the measured codecs
    expect(ms.sb.appended).toHaveLength(1); // the init; the fragment waits for updateend
    video.buffered.r = [[1.5, 1.5]];
    ms.sb.finish();
    expect(ms.sb.appended).toHaveLength(2);
    expect(video.currentTime).toBe(1.5);
    expect(video.play).toHaveBeenCalledTimes(1);
    await flush();
    expect(states).toEqual(['buffering', 'playing']);
  });

  it('a new init (resumed or renewed session) opens a fresh MediaSource and revokes the old URL', () => {
    const { deps, player } = setup();
    player.push(INIT);
    FakeMediaSource.instances[0]!.fireOpen();
    player.push(INIT);
    expect(FakeMediaSource.instances).toHaveLength(2);
    expect(deps.revokeObjectURL).toHaveBeenCalledWith('blob:1');
    // The old source's late events do nothing.
    FakeMediaSource.instances[0]!.sb.finish();
  });

  it('falls back to muted playback when sound needs a tap, and unlock() turns it on', async () => {
    const { video, states, player } = setup(true);
    expect(video.disableRemotePlayback).toBe(true);
    video.playResult = () => (video.muted ? Promise.resolve() : Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' })));
    player.push(INIT);
    const ms = FakeMediaSource.instances[0]!;
    ms.fireOpen();
    video.buffered.r = [[0, 0.5]];
    ms.sb.finish();
    await flush();
    await flush();
    expect(video.muted).toBe(true);
    expect(states[states.length - 1]).toBe('muted');
    video.playResult = () => Promise.resolve();
    player.unlock();
    await flush();
    expect(video.muted).toBe(false);
    expect(states[states.length - 1]).toBe('playing');
  });

  it('jumps to the live edge when interrupted or far behind, and over a gap it stalls at', () => {
    const { video, player } = setup();
    player.push(INIT);
    const ms = FakeMediaSource.instances[0]!;
    ms.fireOpen();
    video.buffered.r = [[0, 1]];
    ms.sb.finish(); // started at 0
    video.currentTime = 2;
    video.buffered.r = [[0, 2], [2.4, 6]];
    player.push(FRAG(2));
    ms.sb.finish();
    expect(video.currentTime).toBe(2.4); // the gap
    video.currentTime = 3;
    video.buffered.r = [[0, 3 + MAX_LAG_S + 1]];
    player.push(FRAG(3));
    ms.sb.finish();
    expect(video.currentTime).toBeCloseTo(3 + MAX_LAG_S + 1 - LIVE_EDGE_S);
    video.currentTime = 1;
    video.buffered.r = [[0, 5]];
    player.jumpToLive();
    expect(video.currentTime).toBeCloseTo(5 - LIVE_EDGE_S);
  });

  it('removes played video and survives QuotaExceededError', () => {
    const { video, player } = setup();
    player.push(INIT);
    const ms = FakeMediaSource.instances[0]!;
    ms.fireOpen();
    video.buffered.r = [[0, 1]];
    ms.sb.finish();
    video.currentTime = EVICT_AFTER_S + 5;
    video.buffered.r = [[0, EVICT_AFTER_S + 6]];
    player.push(FRAG(4)); // appended at once
    ms.sb.finish(); // its updateend: 35 s played → everything older than KEEP_BEHIND_S goes
    expect(ms.sb.removed[0]?.[0]).toBe(0);
    // Quota: a remove first, then the same piece again.
    ms.sb.updating = false;
    video.buffered.r = [[20, EVICT_AFTER_S + 6]];
    ms.sb.throwOnAppend = 'QuotaExceededError';
    const before = ms.sb.appended.length;
    player.push(FRAG(5));
    expect(ms.sb.removed).toHaveLength(2);
    ms.sb.finish();
    expect(ms.sb.appended.length).toBe(before + 1);
  });

  it('says unsupported where there is no MSE for these codecs', () => {
    const { states, player } = setup();
    FakeMediaSource.supported = false;
    player.push(INIT);
    expect(states).toEqual(['unsupported']);
  });

  it('destroy releases the source and ignores later pieces', () => {
    const { video, deps, player } = setup();
    player.push(INIT);
    player.destroy();
    expect(deps.revokeObjectURL).toHaveBeenCalled();
    expect(video.removeEventListener).toHaveBeenCalledWith('waiting', expect.any(Function));
    player.push(INIT);
    expect(FakeMediaSource.instances).toHaveLength(1);
  });

  it('with the call output and a decodable voice: the video plays muted, the voice is decoded, the state says playing', async () => {
    const out = callOutput(true);
    const { video, states, player } = setup(true, out);
    player.push(toBase64(vertexInit()));
    await flush();
    expect(video.muted).toBe(true);
    const ms = FakeMediaSource.instances[0]!;
    ms.fireOpen();
    player.push(toBase64(vertexFragment(2, 0, [1, 2, 3])));
    expect(out.decoded).toHaveLength(1);
    video.buffered.r = [[0, 0.5]];
    ms.sb.finish();
    await flush();
    expect(states[states.length - 1]).toBe('playing'); // heard through the call, not 'muted' (no "tap for sound")
    player.unlock(); // a tap keeps the video muted: the voice must not play twice
    expect(video.muted).toBe(true);
  });

  it('without a decoder for the voice, the video keeps its own sound', async () => {
    const out = callOutput(false);
    const { video, player } = setup(true, out);
    player.push(toBase64(vertexInit()));
    await flush();
    expect(video.muted).toBe(false);
    player.push(toBase64(vertexFragment(2, 0, [1, 2, 3])));
    expect(out.decoded).toHaveLength(0);
  });

  it('when a later session cannot decode the voice, the video gets its sound back', async () => {
    const out = callOutput(true);
    const { video, player } = setup(false, out);
    player.push(toBase64(vertexInit()));
    await flush();
    expect(video.muted).toBe(true);
    player.push(INIT); // no AAC track in this init: the voice goes back to the video
    expect(video.muted).toBe(false);
  });
});
