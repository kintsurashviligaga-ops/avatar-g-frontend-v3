/** @jest-environment node */
/**
 * lib/speech/player — one read at a time, every chunk in order, a failed chunk stops the read where it failed (§5.1,
 * §5.3.2, §5.3.5, §5.3.7). A fake element and a hand-driven synthesis: no browser, no network, no spend.
 */
import { chunkSpeech } from './chunk';
import {
  SILENT_WAV,
  SPEECH_AHEAD,
  SPEECH_STALL_GRACE_MS,
  SpeechPlayer,
  isSpeaking,
  type SpeechAudio,
  type SpeechFault,
  type SpeechPlayerDeps,
  type SpeechRequest,
  type SpeechState,
} from './player';
import { wrapPcm16 } from './wav';
import { WAV_DOUBLE_WRAPPED, pcm16Tone } from '../../tests/fixtures/speechAudio';

/** 100 ms of 24 kHz mono: a valid contract WAV. */
const WAV_100MS = wrapPcm16(pcm16Tone({ channels: 1, frames: 2400 }), { sampleRate: 24000, channels: 1 });
const wav = () => new Blob([WAV_100MS], { type: 'audio/wav' });

const SENTENCES = ['The first sentence is here.', 'The second sentence is here.', 'The third sentence is here.', 'The fourth sentence is here.', 'The fifth sentence is here.'];
const TEXT = SENTENCES.join(' ');
const req = (owner = 'a', text = TEXT): SpeechRequest => ({ owner, text, locale: 'en', chunking: { maxChars: 40 } });

class FakeAudio implements SpeechAudio {
  src = '';
  currentSrc = '';
  error: unknown = null;
  currentTime = 0;
  playbackRate = 1;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readonly plays: string[] = [];
  /** The next play() rejects with this. */
  refuse: unknown = null;
  pause = jest.fn();
  play(): Promise<void> {
    this.plays.push(this.src);
    if (this.refuse) {
      const e = this.refuse;
      this.refuse = null;
      return Promise.reject(e);
    }
    return Promise.resolve();
  }
  load(): void {
    this.currentSrc = this.src;
    this.error = null;
    this.currentTime = 0;
  }
  /** The chunk now loaded plays to its end. */
  end(): void {
    this.onended?.();
  }
}

const players: SpeechPlayer[] = [];
afterEach(() => { for (const p of players.splice(0)) p.dispose(); });

interface Call { text: string; signal: AbortSignal; settled: boolean; answer(b: Blob | null): void; throws(e: unknown): void }

function rig(opts: { blocked?: () => SpeechFault | null } = {}) {
  const audio = new FakeAudio();
  const calls: Call[] = [];
  const created: string[] = [];
  const revoked: string[] = [];
  let n = 0;
  const deps: SpeechPlayerDeps = {
    synth: (text, _locale, signal) => new Promise<Blob | null>((resolve, reject) => {
      const call: Call = {
        text,
        signal,
        settled: false,
        answer: (b) => { call.settled = true; resolve(b); },
        throws: (e) => { call.settled = true; reject(e); },
      };
      calls.push(call);
      // Like requestSpeech: an aborted request answers null.
      signal.addEventListener('abort', () => { call.settled = true; resolve(null); });
    }),
    createAudio: () => audio,
    createObjectURL: () => { const u = `blob:${++n}`; created.push(u); return u; },
    revokeObjectURL: (u) => { revoked.push(u); },
    ...(opts.blocked ? { blocked: opts.blocked } : {}),
  };
  const player = new SpeechPlayer(deps);
  players.push(player);
  const states: SpeechState[] = [];
  player.subscribe((s) => states.push(s));
  const open = () => calls.filter((c) => !c.settled);
  const live = () => created.filter((u) => !revoked.includes(u));
  return { player, audio, calls, created, revoked, states, open, live, s: () => player.getState() };
}

const tick = () => new Promise<void>((r) => setTimeout(r, 1));
async function until(cond: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 300; i++) {
    if (cond()) return;
    await tick();
  }
  throw new Error(`timed out waiting for ${label}`);
}

/** Answer chunk `i`'s synthesis (by its text) with `blob`. */
function answer(r: ReturnType<typeof rig>, i: number, blob: Blob | null = wav()) {
  const call = r.calls.find((c) => c.text === SENTENCES[i] && !c.settled);
  if (!call) throw new Error(`no open synthesis for chunk ${i}`);
  call.answer(blob);
}

afterEach(() => { jest.useRealTimers(); });

test('the chunks are lib/speech/chunk\'s, one sentence each here', () => {
  expect(chunkSpeech(TEXT, { maxChars: 40 }).map((c) => c.text)).toEqual(SENTENCES);
});

test('unlocks the element with the silent clip inside the tap, before any await', () => {
  const r = rig();
  r.player.play(req());
  expect(r.audio.plays).toEqual([SILENT_WAV]);
  expect(r.s()).toMatchObject({ status: 'loading', owner: 'a', index: 0, total: 5, offset: 0, fault: null, rate: 1 });
});

test('reads every chunk in order, at most 2 syntheses in flight and 2 ahead, then done; every URL revoked', async () => {
  const r = rig();
  r.player.play(req());
  expect(r.calls.map((c) => c.text)).toEqual(SENTENCES.slice(0, SPEECH_AHEAD));

  answer(r, 0);
  await until(() => r.s().status === 'playing', 'chunk 0 playing');
  // While chunk 0 plays, chunks 1 and 2 are being fetched, and no more.
  expect(r.calls.map((c) => c.text)).toEqual(SENTENCES.slice(0, 3));
  expect(r.open()).toHaveLength(2);

  answer(r, 1);
  answer(r, 2);
  await until(() => r.calls.length === 3, 'settled');
  await tick();
  // Two are ready ahead of the one playing: the window is full, nothing more is asked for.
  expect(r.calls).toHaveLength(3);

  for (let i = 0; i < SENTENCES.length; i++) {
    await until(() => r.s().status === 'playing' && r.s().index === i, `chunk ${i} playing`);
    expect(r.s().offset).toBe(TEXT.indexOf(SENTENCES[i]!));
    expect(r.live()).toHaveLength(1);
    expect(r.open().length).toBeLessThanOrEqual(SPEECH_AHEAD);
    for (const c of r.open()) c.answer(wav());
    expect(r.s().status).not.toBe('done');
    r.audio.end();
  }
  await until(() => r.s().status === 'done', 'done');
  expect(r.calls.map((c) => c.text)).toEqual(SENTENCES);
  expect(r.audio.plays.slice(1)).toEqual(r.created);
  expect(r.live()).toEqual([]);
  expect(r.s()).toMatchObject({ status: 'done', owner: 'a', index: 4 });
});

test('a failed chunk in the middle stops the read THERE, never skips it; retry reads on from it, reusing audio already fetched', async () => {
  const r = rig();
  r.player.play(req());
  answer(r, 0);
  await until(() => r.s().status === 'playing', 'chunk 0 playing');
  answer(r, 2);
  answer(r, 1, null); // chunk 1: the route sent no audio
  await tick();
  r.audio.end();
  await until(() => r.s().status === 'failed', 'failed');
  expect(r.s()).toMatchObject({ status: 'failed', owner: 'a', index: 1, offset: TEXT.indexOf(SENTENCES[1]!), fault: 'synthesis' });
  expect(r.audio.plays.slice(1)).toHaveLength(1); // chunk 0 only: chunk 2 was NOT played after the gap
  expect(r.open()).toEqual([]);
  expect(r.live()).toEqual([]);

  const before = r.calls.length;
  r.player.retry();
  expect(r.audio.plays[r.audio.plays.length - 1]).toBe(SILENT_WAV); // the retry tap unlocks again
  // Chunk 1 is asked for again; chunk 2 is already here, so the next request is chunk 3.
  expect(r.calls.slice(before).map((c) => c.text)).toEqual([SENTENCES[1], SENTENCES[3]]);
  answer(r, 1);
  await until(() => r.s().status === 'playing' && r.s().index === 1, 'chunk 1 playing');
  r.audio.end();
  await until(() => r.s().index === 2 && r.s().status === 'playing', 'chunk 2 playing without a new request');
  expect(r.calls.filter((c) => c.text === SENTENCES[2])).toHaveLength(1);
  answer(r, 3);
  r.audio.end();
  await until(() => r.s().index === 3 && r.s().status === 'playing', 'chunk 3 playing');
  answer(r, 4);
  r.audio.end();
  await until(() => r.s().index === 4 && r.s().status === 'playing', 'chunk 4 playing');
  r.audio.end();
  await until(() => r.s().status === 'done', 'done');
});

test('a failed LAST chunk is failed, not done', async () => {
  const r = rig();
  r.player.play(req('a', SENTENCES.slice(0, 2).join(' ')));
  answer(r, 0);
  answer(r, 1, null);
  await until(() => r.s().status === 'playing', 'chunk 0 playing');
  r.audio.end();
  await until(() => r.s().status === 'failed', 'failed');
  expect(r.s()).toMatchObject({ index: 1, fault: 'synthesis' });
  expect(r.states.some((s) => s.status === 'done')).toBe(false);
});

test.each([
  ['a throw from the synthesis', (r: ReturnType<typeof rig>) => r.calls[0]!.throws(new TypeError('fetch failed')), 'synthesis'],
  ['an empty body', (r: ReturnType<typeof rig>) => answer(r, 0, new Blob([])), 'synthesis'],
  ['bytes that are not a contract WAV', (r: ReturnType<typeof rig>) => answer(r, 0, new Blob([WAV_DOUBLE_WRAPPED])), 'bad_audio'],
  ['text bytes', (r: ReturnType<typeof rig>) => answer(r, 0, new Blob(['{"error":"x"}'])), 'bad_audio'],
] as const)('%s fails the chunk (%#) and nothing is played', async (_why, act, fault) => {
  const r = rig();
  r.player.play(req());
  act(r);
  await until(() => r.s().status === 'failed', 'failed');
  expect(r.s()).toMatchObject({ index: 0, fault });
  expect(r.audio.plays).toEqual([SILENT_WAV]);
  expect(r.live()).toEqual([]);
});

test('an element error for THIS chunk fails it; a stale error from the previous source does not', async () => {
  const r = rig();
  r.player.play(req());
  answer(r, 0);
  answer(r, 1);
  await until(() => r.s().status === 'playing', 'chunk 0 playing');
  r.audio.end();
  await until(() => r.s().index === 1 && r.s().status === 'playing', 'chunk 1 playing');
  // The abort of chunk 0's load reports late, while the element already works on chunk 1.
  r.audio.error = { code: 1 };
  const current = r.audio.currentSrc;
  (r.audio as { currentSrc: string }).currentSrc = r.created[0]!;
  r.audio.onerror?.();
  (r.audio as { currentSrc: string }).currentSrc = current;
  expect(r.s().status).toBe('playing');
  r.audio.onerror?.();
  await until(() => r.s().status === 'failed', 'failed');
  expect(r.s()).toMatchObject({ index: 1, fault: 'playback' });
});

test('a browser that refuses to play is "blocked"; an AbortError from an interrupted play() is not a failure', async () => {
  const r = rig();
  r.player.play(req());
  answer(r, 0);
  answer(r, 1);
  r.audio.refuse = Object.assign(new Error('interrupted'), { name: 'AbortError' });
  await until(() => r.s().status === 'playing', 'chunk 0 playing');
  await tick();
  expect(r.s().status).toBe('playing');
  r.audio.end();
  r.audio.refuse = Object.assign(new Error('no gesture'), { name: 'NotAllowedError' });
  await until(() => r.s().status === 'failed', 'failed');
  expect(r.s()).toMatchObject({ index: 1, fault: 'blocked' });
});

describe('a chunk that never ends', () => {
  beforeEach(() => { jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] }); });

  async function playing(r: ReturnType<typeof rig>) {
    r.player.play(req());
    answer(r, 0);
    answer(r, 1);
    for (let i = 0; i < 50 && r.s().status !== 'playing'; i++) await jest.advanceTimersByTimeAsync(0);
    expect(r.s().status).toBe('playing');
  }

  test('stuck short of its end: failed as playback once its duration and the grace have passed', async () => {
    const r = rig();
    await playing(r);
    r.audio.currentTime = 0.02;
    await jest.advanceTimersByTimeAsync(100 + SPEECH_STALL_GRACE_MS - 1);
    expect(r.s().status).toBe('playing');
    await jest.advanceTimersByTimeAsync(2);
    expect(r.s()).toMatchObject({ status: 'failed', index: 0, fault: 'playback' });
  });

  test('played to its end with the `ended` event lost: the read goes on', async () => {
    const r = rig();
    await playing(r);
    r.audio.currentTime = 0.1;
    await jest.advanceTimersByTimeAsync(100 + SPEECH_STALL_GRACE_MS);
    for (let i = 0; i < 50 && r.s().index !== 1; i++) await jest.advanceTimersByTimeAsync(0);
    expect(r.s()).toMatchObject({ status: 'playing', index: 1 });
  });

  test('paused, it is never called a stall', async () => {
    const r = rig();
    await playing(r);
    r.player.pause();
    await jest.advanceTimersByTimeAsync(10 * SPEECH_STALL_GRACE_MS);
    expect(r.s().status).toBe('paused');
  });
});

describe('one read at a time', () => {
  test('the same owner\'s toggle stops its read and cancels the syntheses in flight', async () => {
    const r = rig();
    r.player.toggle(req('a'));
    answer(r, 0);
    await until(() => r.s().status === 'playing', 'playing');
    r.player.toggle(req('a'));
    expect(r.s()).toMatchObject({ status: 'idle', owner: null });
    expect(r.calls.every((c) => c.signal.aborted || c.settled)).toBe(true);
    expect(r.live()).toEqual([]);
    expect(r.audio.pause).toHaveBeenCalled();
  });

  test('another owner\'s read replaces the first; nothing of the first plays late', async () => {
    const r = rig();
    r.player.play(req('a'));
    const first = r.calls.slice();
    r.player.play(req('b', 'Something else entirely.'));
    expect(first.every((c) => c.signal.aborted)).toBe(true);
    expect(r.s()).toMatchObject({ status: 'loading', owner: 'b', total: 1 });
    r.calls[r.calls.length - 1]!.answer(wav());
    await until(() => r.s().status === 'playing', 'b playing');
    expect(r.audio.plays.filter((p) => p !== SILENT_WAV)).toHaveLength(1);
    expect(r.created).toHaveLength(1);
  });

  test('a stop during loading: the late answer is never played and no URL is made for it', async () => {
    const r = rig();
    r.player.play(req());
    const call = r.calls[0]!;
    r.player.stop();
    call.answer(wav());
    await tick();
    expect(r.created).toEqual([]);
    expect(r.s().status).toBe('idle');
  });

  test('stop(owner) stops only that owner\'s read', async () => {
    const r = rig();
    r.player.play(req('a'));
    r.player.stop('b');
    expect(r.s().owner).toBe('a');
    r.player.stop('a');
    expect(r.s().status).toBe('idle');
  });

  test('toggle on a failed read of the same text retries it; with other text it starts afresh', async () => {
    const r = rig();
    r.player.toggle(req('a'));
    answer(r, 0, null);
    await until(() => r.s().status === 'failed', 'failed');
    const retry = jest.spyOn(r.player, 'retry');
    r.player.toggle(req('a'));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(r.s()).toMatchObject({ status: 'loading', index: 0 });
    answer(r, 0, null);
    await until(() => r.s().status === 'failed', 'failed again');
    r.player.toggle(req('a', 'An edited reply.'));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(r.s()).toMatchObject({ status: 'loading', total: 1 });
  });
});

describe('playPause: a Pause button', () => {
  test('a tap while it plays pauses the read where it is; the next tap goes on from there, not from the start', async () => {
    const r = rig();
    r.player.playPause(req('a'));
    answer(r, 0);
    await until(() => r.s().status === 'playing', 'playing');
    r.audio.currentTime = 0.05;
    r.player.playPause(req('a'));
    expect(r.s()).toMatchObject({ status: 'paused', owner: 'a', index: 0 });
    expect(r.audio.pause).toHaveBeenCalled();
    const asked = r.calls.length;
    const plays = r.audio.plays.length;
    r.player.playPause(req('a'));
    expect(r.s()).toMatchObject({ status: 'playing', owner: 'a', index: 0 });
    // The same chunk plays on: no new synthesis, no new source, the element keeps its position.
    expect(r.calls).toHaveLength(asked);
    expect(r.created).toHaveLength(1);
    expect(r.audio.plays).toHaveLength(plays + 1);
    expect(r.audio.plays[plays]).toBe('blob:1');
    expect(r.audio.currentTime).toBe(0.05);
    r.audio.end();
    answer(r, 1);
    await until(() => r.s().status === 'playing' && r.s().index === 1, 'chunk 1 playing');
  });

  test('paused between chunks, the next tap plays the next chunk once it is in', async () => {
    const r = rig();
    r.player.playPause(req('a'));
    answer(r, 0);
    await until(() => r.s().status === 'playing', 'playing');
    r.audio.end();
    await until(() => r.s().status === 'loading' && r.s().index === 1, 'loading chunk 1');
    r.player.playPause(req('a'));
    expect(r.s()).toMatchObject({ status: 'paused', index: 1 });
    answer(r, 1);
    await until(() => r.created.length === 2, 'chunk 1 loaded');
    await tick();
    expect(r.s().status).toBe('paused');
    r.player.playPause(req('a'));
    expect(r.s()).toMatchObject({ status: 'playing', index: 1 });
  });

  test('a tap before anything was heard stops the read: there is nothing to go on from', () => {
    const r = rig();
    r.player.playPause(req('a'));
    expect(r.s()).toMatchObject({ status: 'loading', index: 0 });
    r.player.playPause(req('a'));
    expect(r.s()).toMatchObject({ status: 'idle', owner: null });
    expect(r.calls.every((c) => c.signal.aborted || c.settled)).toBe(true);
  });

  test('a failed read is tried again; another reply, or an edited one, starts afresh', async () => {
    const r = rig();
    r.player.playPause(req('a'));
    answer(r, 0, null);
    await until(() => r.s().status === 'failed', 'failed');
    const retry = jest.spyOn(r.player, 'retry');
    r.player.playPause(req('a'));
    expect(retry).toHaveBeenCalledTimes(1);
    answer(r, 0);
    await until(() => r.s().status === 'playing', 'playing');
    r.player.playPause(req('b', 'Another reply.'));
    expect(r.s()).toMatchObject({ status: 'loading', owner: 'b', total: 1 });
  });
});

test('pause and resume, while playing and while loading', async () => {
  const r = rig();
  r.player.play(req());
  r.player.pause();
  expect(r.s().status).toBe('paused');
  answer(r, 0);
  await until(() => r.created.length === 1, 'chunk 0 loaded');
  await tick();
  expect(r.s().status).toBe('paused');
  expect(r.audio.plays).toEqual([SILENT_WAV]); // loaded, not played
  r.player.resume();
  expect(r.s().status).toBe('playing');
  expect(r.audio.plays).toHaveLength(2);
  r.player.pause();
  expect(r.audio.pause).toHaveBeenCalled();
  r.player.resume();
  expect(r.audio.plays).toHaveLength(3);
  r.player.pause();
  r.audio.end(); // the element may still report the end of the chunk it had
  await until(() => r.s().index === 1, 'next chunk');
  expect(r.s().status).toBe('paused');
  r.player.resume();
  expect(r.s().status).toBe('loading');
  answer(r, 1);
  await until(() => r.s().status === 'playing' && r.s().index === 1, 'chunk 1 playing');
});

test('no read starts while a Live call has the speakers: no synthesis, no unlock', () => {
  let onCall = true;
  const r = rig({ blocked: () => (onCall ? 'live_call' : null) });
  r.player.toggle(req('a'));
  expect(r.s()).toMatchObject({ status: 'failed', owner: 'a', fault: 'live_call' });
  expect(r.calls).toEqual([]);
  expect(r.audio.plays).toEqual([]);
  expect(isSpeaking(r.s())).toBe(false);
  onCall = false;
  r.player.toggle(req('a'));
  expect(r.s().status).toBe('loading');
});

test('blank text is done at once, with no request', () => {
  const r = rig();
  r.player.play(req('a', ' \n '));
  expect(r.s()).toMatchObject({ status: 'done', owner: 'a', total: 0 });
  expect(r.calls).toEqual([]);
});

test('playback speed is 1 unless the user picks one, and is clamped to 0.5–2', async () => {
  const r = rig();
  r.player.play(req());
  answer(r, 0);
  await until(() => r.s().status === 'playing', 'playing');
  expect(r.audio.playbackRate).toBe(1);
  r.player.setRate(3);
  expect(r.audio.playbackRate).toBe(2);
  expect(r.s().rate).toBe(2);
  r.player.setRate(Number.NaN);
  expect(r.s().rate).toBe(2);
  r.player.setRate(0.1);
  expect(r.s().rate).toBe(0.5);
});

test("a speed belongs to its read: the next read, another owner's, starts at 1", async () => {
  const r = rig();
  r.player.play({ ...req('controls'), rate: 1.5 });
  answer(r, 0);
  await until(() => r.s().status === 'playing', 'playing');
  expect(r.audio.playbackRate).toBe(1.5);
  expect(r.s().rate).toBe(1.5);
  r.player.play(req('omni:1'));
  expect(r.s().rate).toBe(1);
  answer(r, 0);
  await until(() => r.s().status === 'playing', 'second playing');
  expect(r.audio.playbackRate).toBe(1);
  r.player.play({ ...req('controls'), rate: 9 });
  expect(r.s().rate).toBe(2);
  r.player.stop();
  expect(r.s().rate).toBe(1);
});

test('prime unlocks when idle and leaves a read under way alone', async () => {
  const r = rig();
  r.player.prime();
  expect(r.audio.plays).toEqual([SILENT_WAV]);
  r.player.play(req());
  answer(r, 0);
  await until(() => r.s().status === 'playing', 'playing');
  const n = r.audio.plays.length;
  r.player.prime();
  expect(r.audio.plays).toHaveLength(n);
  expect(r.s().status).toBe('playing');
});

test('a listener that throws does not break playback', async () => {
  const r = rig();
  r.player.subscribe(() => { throw new Error('bad listener'); });
  r.player.play(req());
  answer(r, 0);
  await until(() => r.s().status === 'playing', 'playing');
});
