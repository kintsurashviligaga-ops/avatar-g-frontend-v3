import { CHUNK_MAX_CHARS, planAnswerSpeech, planReportSpeech, ReadAloudPlayer, READ_MAX_CHARS, SILENT_WAV, type AudioLike, type PlayerState, type SpeechDeps } from './speech';

const tick = (ms = 0) => new Promise<void>((r) => setTimeout(r, ms));
async function until(cond: () => boolean, label = 'condition'): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (cond()) return;
    await tick(1);
  }
  throw new Error(`timed out waiting for ${label}`);
}

describe('planReportSpeech — the text a voice can read', () => {
  const md = [
    '# Electric cars in the Caucasus',
    '',
    'Sales grew **fast** in 2025 [1], driven by tax cuts ([source](https://example.com/a)).',
    '',
    '| Country | Share |',
    '|---|---|',
    '| Georgia | 12% |',
    '',
    '```js',
    'const secret = 1;',
    '```',
    '',
    '- Armenia followed a similar path.',
  ].join('\n');

  test('no marks, no URLs, no citation markers, no code — but the words are all there', () => {
    const { chunks } = planReportSpeech(md);
    const spoken = chunks.join(' ');
    expect(spoken).toContain('Electric cars in the Caucasus');
    expect(spoken).toContain('Sales grew fast in 2025');
    expect(spoken).toContain('Georgia, 12%');
    expect(spoken).toContain('Armenia followed a similar path');
    for (const bad of ['**', 'https://', '[1]', 'const secret', '```', '|---|']) expect(spoken).not.toContain(bad);
  });

  test('every chunk fits one request', () => {
    const long = Array.from({ length: 80 }, (_, i) => `Sentence number ${i} says something moderately long about the market.`).join(' ');
    for (const ch of planReportSpeech(long).chunks) expect(ch.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
  });

  test('a long report is read from the start, capped, and says so', () => {
    const long = Array.from({ length: 4000 }, (_, i) => `Finding ${i} is stated plainly.`).join(' ');
    const plan = planReportSpeech(long);
    expect(plan.partial).toBe(true);
    const total = plan.chunks.reduce((n, c) => n + c.length, 0);
    expect(total).toBeLessThanOrEqual(READ_MAX_CHARS);
    expect(total).toBeGreaterThan(READ_MAX_CHARS * 0.6);
    expect(plan.chunks[0]).toContain('Finding 0');
    // the cut lands on a sentence end, never mid-word
    expect(plan.chunks[plan.chunks.length - 1]).toMatch(/\.$/);
  });

  test('a short text is read whole; an empty one has no chunks', () => {
    expect(planReportSpeech('One short line.').partial).toBe(false);
    expect(planReportSpeech('   ').chunks).toEqual([]);
    expect(planAnswerSpeech('**Key point:** it grew.').chunks.join(' ')).toBe('Key point: it grew.');
  });

  test('Georgian text is chunked on its own sentence ends', () => {
    const ka = 'ბაზარი სწრაფად იზრდება. ' .repeat(120);
    const { chunks } = planReportSpeech(ka);
    expect(chunks.length).toBeGreaterThan(1);
    for (const ch of chunks) expect(ch.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
  });
});

// ─── the player ───────────────────────────────────────────────────────────────────────────────────────────────

class FakeAudio implements AudioLike {
  src = '';
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  currentSrc: string | undefined;
  error: unknown = null;
  plays: string[] = [];
  pauses = 0;
  play() {
    this.currentSrc = this.src;
    this.plays.push(this.src);
    return Promise.resolve();
  }
  pause() { this.pauses++; }
  load() { this.currentSrc = this.src; }
  finish() { this.onended?.(); }
}

function rig(opts: { fail?: (text: string) => boolean; slow?: boolean } = {}) {
  const audio = new FakeAudio();
  const synthCalls: string[] = [];
  const created: string[] = [];
  const revoked: string[] = [];
  let n = 0;
  const states: PlayerState[] = [];
  const deps: SpeechDeps = {
    async synth(text, signal) {
      synthCalls.push(text);
      if (opts.slow) await new Promise<void>((r) => setTimeout(r, 25));
      if (signal.aborted) return null;
      return opts.fail?.(text) ? null : new Blob([text]);
    },
    createAudio: () => audio,
    createObjectURL: () => { const u = `blob:${++n}`; created.push(u); return u; },
    revokeObjectURL: (u) => { revoked.push(u); },
  };
  const player = new ReadAloudPlayer(deps, (s) => states.push(s));
  return { player, audio, synthCalls, created, revoked, states };
}

describe('ReadAloudPlayer', () => {
  test('primes the element with the silent clip INSIDE start() — before any await — so a later play() is already unlocked', () => {
    const r = rig();
    r.player.start(['One.']);
    expect(r.audio.plays).toEqual([SILENT_WAV]);
    r.player.stop();
  });

  test('reads the chunks in order, synthesising the next while the current one plays, then ends "done" with every URL revoked', async () => {
    const r = rig();
    r.player.start(['One.', 'Two.', 'Three.']);
    await until(() => r.audio.plays.length === 2, 'chunk 1 playing');
    // chunk 2's synthesis has already been requested while chunk 1 plays
    expect(r.synthCalls).toEqual(['One.', 'Two.']);
    expect(r.player.getState()).toMatchObject({ status: 'playing', index: 0, total: 3 });
    r.audio.finish();
    await until(() => r.audio.plays.length === 3, 'chunk 2 playing');
    expect(r.player.getState().index).toBe(1);
    r.audio.finish();
    await until(() => r.audio.plays.length === 4, 'chunk 3 playing');
    r.audio.finish();
    await until(() => r.player.getState().status === 'done', 'done');
    expect(r.synthCalls).toEqual(['One.', 'Two.', 'Three.']);
    expect(r.revoked.sort()).toEqual(r.created.sort());
  });

  test('a chunk that fails is skipped and the rest are still read', async () => {
    const r = rig({ fail: (t) => t === 'Two.' });
    r.player.start(['One.', 'Two.', 'Three.']);
    await until(() => r.audio.plays.length === 2);
    r.audio.finish();
    await until(() => r.audio.plays.length === 3);
    expect(r.audio.plays[2]).toBe('blob:2'); // the third chunk's URL — the failed second never made one
    r.audio.finish();
    await until(() => r.player.getState().status === 'done');
  });

  test('three failures in a row end the read in an error — never a silent stall', async () => {
    const r = rig({ fail: () => true });
    r.player.start(['A.', 'B.', 'C.', 'D.']);
    await until(() => r.player.getState().status === 'error', 'error');
    expect(r.audio.plays).toEqual([SILENT_WAV]);
  });

  test('pause, resume, stop', async () => {
    const r = rig();
    r.player.start(['One.', 'Two.']);
    await until(() => r.audio.plays.length === 2);
    const pausesBefore = r.audio.pauses;
    r.player.pause();
    expect(r.player.getState().status).toBe('paused');
    expect(r.audio.pauses).toBe(pausesBefore + 1);
    r.player.resume();
    expect(r.player.getState().status).toBe('playing');
    expect(r.audio.plays.length).toBe(3); // play() again on the same element
    r.player.stop();
    expect(r.player.getState()).toEqual({ status: 'idle', index: 0, total: 0 });
    expect(r.revoked).toContain('blob:1');
    // a stopped read never starts the chunk that was being prepared
    await tick(40);
    expect(r.audio.plays.length).toBe(3);
  });

  test('stopping while a chunk is still being synthesised abandons it (it is never played)', async () => {
    const r = rig({ slow: true });
    r.player.start(['One.', 'Two.']);
    r.player.stop();
    await tick(80);
    expect(r.audio.plays).toEqual([SILENT_WAV]);
    expect(r.created).toEqual([]);
  });

  test('starting a new read replaces the old one', async () => {
    const r = rig();
    r.player.start(['Old one.', 'Old two.']);
    await until(() => r.audio.plays.length === 2);
    r.player.start(['New one.']);
    await until(() => r.audio.plays.length >= 4, 'new chunk playing');
    expect(r.synthCalls).toContain('New one.');
    r.audio.finish();
    await until(() => r.player.getState().status === 'done');
  });

  test('an empty plan is "done" at once', () => {
    const r = rig();
    r.player.start(['  ', '']);
    expect(r.player.getState().status).toBe('done');
  });

  test('a stale error from a superseded source does not end the current chunk', async () => {
    const r = rig();
    r.player.start(['One.', 'Two.']);
    await until(() => r.audio.plays.length === 2);
    r.audio.error = new Error('aborted load');
    r.audio.currentSrc = 'blob:other';
    r.audio.onerror?.();
    await tick(10);
    expect(r.audio.plays.length).toBe(2);
    expect(r.player.getState().index).toBe(0);
    r.player.stop();
  });
});
