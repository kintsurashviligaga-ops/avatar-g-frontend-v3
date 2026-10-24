import { IDLE_SPEECH, SpeechPlayer, speechPlayer, type SpeechAudio, type SpeechFault, type SpeechPlayerDeps } from '@/lib/speech/player';
import { wrapPcm16 } from '@/lib/speech/wav';
import { pcm16Tone } from '../../../tests/fixtures/speechAudio';
import { createReadAloud, READ_ALOUD_MAX_CHARS, readerSnapshot } from './readAloud';

// The controls on a player whose voice and <audio> are fakes: every synthesis is recorded and answered by the test.
const WAV = wrapPcm16(pcm16Tone({ channels: 1, frames: 2400 }), { sampleRate: 24000, channels: 1 });
class FakeAudio implements SpeechAudio {
  src = ''; currentSrc = ''; error: unknown = null; currentTime = 0; playbackRate = 1;
  onended: (() => void) | null = null; onerror: (() => void) | null = null;
  plays: string[] = [];
  pause = jest.fn();
  play() { this.plays.push(this.src); return Promise.resolve(); }
  load() { this.currentSrc = this.src; }
}
interface Call { text: string; settled: boolean; answer(ok?: boolean): void }
const players: SpeechPlayer[] = [];
afterEach(() => { for (const p of players.splice(0)) p.dispose(); });

function harness(opts: { blocked?: () => SpeechFault | null } = {}) {
  const audio = new FakeAudio();
  const calls: Call[] = [];
  const created: string[] = [];
  const deps: SpeechPlayerDeps = {
    synth: (text, _locale, signal) => new Promise((resolve) => {
      const call: Call = { text, settled: false, answer: (ok = true) => { call.settled = true; resolve(ok ? new Blob([WAV]) : null); } };
      calls.push(call);
      signal.addEventListener('abort', () => { call.settled = true; resolve(null); });
    }),
    createAudio: () => audio,
    createObjectURL: () => { const u = `blob:${created.length + 1}`; created.push(u); return u; },
    revokeObjectURL: () => undefined,
    ...(opts.blocked ? { blocked: opts.blocked } : {}),
  };
  const player = new SpeechPlayer(deps);
  players.push(player);
  const reader = createReadAloud('controls:1', 'en', player);
  const snap = (speed = 1) => readerSnapshot(player.getState(), 'controls:1', speed);
  const open = () => calls.find((c) => !c.settled);
  return { player, reader, audio, calls, created, snap, open };
}
const tick = () => new Promise<void>((r) => setTimeout(r, 1));
async function until(cond: () => boolean, label: string) {
  for (let i = 0; i < 300; i++) { if (cond()) return; await tick(); }
  throw new Error(`timed out waiting for ${label}`);
}

const LONG = Array.from({ length: 30 }, (_, i) => `Sentence ${i + 1} of the reply 😀 links to https://example.test/${i} and **stays** whole.`).join(' ');

test('the whole message is read, in order, every character once — never cut at 600 characters or mid-word', async () => {
  expect(LONG.length).toBeGreaterThan(1300);
  const h = harness();
  expect(h.reader.play(LONG)).toBe(true);
  while (h.snap().status !== 'completed') {
    await until(() => !!h.open() || h.snap().status === 'playing', 'a request or a chunk');
    if (h.snap().status === 'playing') { h.audio.onended?.(); await tick(); continue; }
    h.open()!.answer();
    await tick();
  }
  const sent = h.calls.map((c) => c.text);
  expect(sent.join(' ')).toBe(LONG);
  for (const s of sent) expect(s.length).toBeLessThanOrEqual(600);
  for (const s of sent.slice(0, -1)) expect(s).toMatch(/whole\.$/); // cut at sentence ends
  expect(h.snap()).toMatchObject({ status: 'completed', chunk: sent.length, total: sent.length });
});

test('pause, resume and speed do not re-synthesize or restart the text', async () => {
  const h = harness();
  h.reader.play('Hello.', 1.25);
  h.open()!.answer();
  await until(() => h.snap().status === 'playing', 'playing');
  expect(h.audio.playbackRate).toBe(1.25);
  h.reader.pause();
  expect(h.snap(1.25).status).toBe('paused');
  h.reader.setSpeed(1.5);
  expect(h.audio.playbackRate).toBe(1.5);
  h.reader.resume();
  expect(h.snap().status).toBe('playing');
  expect(h.calls).toHaveLength(1);
});

test('stop during synthesis fences late audio', async () => {
  const h = harness();
  h.reader.play('Old');
  const late = h.open()!;
  h.reader.stop();
  late.answer();
  await tick();
  expect(h.created).toEqual([]);
  expect(h.snap().status).toBe('idle');
});

test('a failed chunk stops the read there — nothing after it is read — and Try again reads on from it', async () => {
  const h = harness();
  h.reader.play('First part.\n\nSecond part.\n\nThird part.');
  const [first, second] = h.calls;
  first!.answer();
  second!.answer(false);
  await until(() => h.snap().status === 'playing', 'first playing');
  h.audio.onended?.();
  await until(() => h.snap().status === 'error', 'error');
  expect(h.snap()).toMatchObject({ chunk: 2, total: 3, error: 'read_failed' });
  expect(h.created).toHaveLength(1);
  const before = h.calls.length;
  h.reader.retry();
  // From the failed chunk on (the one after it was cut off by the failure); the first is never asked for again.
  expect(h.calls.slice(before).map((c) => c.text)).toEqual(['Second part.', 'Third part.']);
  expect(h.snap().status).toBe('loading');
});

test('a Live call blocks the reader before any synthesis', () => {
  const h = harness({ blocked: () => 'live_call' });
  h.reader.play('No overlap');
  expect(h.calls).toHaveLength(0);
  expect(h.snap()).toMatchObject({ status: 'error', error: 'live_call_active' });
});

test("another message's read stops this one, which then shows idle", async () => {
  const h = harness();
  const other = createReadAloud('controls:2', 'en', h.player);
  h.reader.play('One');
  other.play('Two');
  expect(h.snap().status).toBe('idle');
  h.reader.pause(); // not its read: leaves the other alone
  expect(h.player.getState()).toMatchObject({ owner: 'controls:2', status: 'loading' });
});

test('an empty or over-long text is refused, never cut', () => {
  const h = harness();
  expect(h.reader.play('   ')).toBe(false);
  expect(h.reader.play('a'.repeat(READ_ALOUD_MAX_CHARS + 1))).toBe(false);
  expect(h.calls).toHaveLength(0);
});

test('the snapshot counts chunks from 1 and keeps the chosen speed', () => {
  const at = { ...IDLE_SPEECH, owner: 'controls:1', index: 1, total: 4 };
  expect(readerSnapshot({ ...at, status: 'playing' }, 'controls:1', 1.5)).toEqual({ status: 'playing', chunk: 2, total: 4, speed: 1.5 });
  expect(readerSnapshot({ ...at, status: 'done' }, 'controls:1', 1)).toEqual({ status: 'completed', chunk: 4, total: 4, speed: 1 });
  expect(readerSnapshot({ ...at, status: 'playing', owner: 'omni:1' }, 'controls:1', 1)).toEqual({ status: 'idle', chunk: 0, total: 0, speed: 1 });
});

test('Live taking the microphone stops a read on the page\'s player', () => {
  // jsdom has no media playback: the page's <audio> is stubbed.
  const proto = window.HTMLMediaElement.prototype;
  jest.spyOn(proto, 'play').mockImplementation(() => Promise.resolve());
  jest.spyOn(proto, 'pause').mockImplementation(() => undefined);
  jest.spyOn(proto, 'load').mockImplementation(() => undefined);
  (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(() => new Promise(() => undefined));
  const player = speechPlayer();
  try {
    player.play({ owner: 'controls:9', text: 'Read this.', locale: 'en' });
    expect(player.getState().owner).toBe('controls:9');
    window.dispatchEvent(new CustomEvent('myavatar:mic-release', { detail: { reason: 'live' } }));
    expect(player.getState().status).toBe('idle');
  } finally {
    player.dispose();
    delete (globalThis as unknown as { fetch?: unknown }).fetch;
    jest.restoreAllMocks();
  }
});
