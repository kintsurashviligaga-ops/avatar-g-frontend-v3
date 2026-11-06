/** @jest-environment node */
/**
 * lib/speech/timing — the route's phases, sent as Server-Timing to the owner's listening trial and read back on the card
 * (GG 2026-11-06: about 4 s per chunk before any audio, not yet split between our checks, Google and the network).
 */
import { SPEECH_PHASES, SpeechClock, parseSpeechTiming, speechTimingRow } from './timing';

/** A clock the test moves by hand. */
function manual(start = 1_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

test('each lap gives the time since the previous one to its phase; the total runs from the start', () => {
  const m = manual();
  const clock = new SpeechClock(m.now);
  m.advance(12); clock.lap('limit');
  m.advance(3); clock.lap('body');
  m.advance(180); clock.lap('auth');
  m.advance(40); clock.lap('quota');
  m.advance(1); clock.lap('model');
  m.advance(320); clock.lap('budget');
  m.advance(2); clock.lap('token');
  clock.attempt();
  m.advance(3_600); clock.lap('google');
  m.advance(15); clock.lap('decode');
  m.advance(140); clock.lap('book');
  expect(clock.header()).toBe(
    'limit;dur=12, body;dur=3, auth;dur=180, quota;dur=40, model;dur=1, budget;dur=320, token;dur=2, google;dur=3600, decode;dur=15, book;dur=140, total;dur=4313',
  );
});

test('two Google attempts add up, the retry pause is its own phase, and the attempts are named', () => {
  const m = manual();
  const clock = new SpeechClock(m.now);
  clock.attempt();
  m.advance(2_000); clock.lap('google');
  m.advance(500); clock.lap('wait');
  clock.attempt();
  m.advance(3_000); clock.lap('google');
  expect(clock.header()).toBe('google;dur=5000;desc="2", wait;dur=500, total;dur=5500');
});

test('the header reads back as the same phases, total and attempts', () => {
  const m = manual();
  const clock = new SpeechClock(m.now);
  m.advance(200); clock.lap('auth');
  clock.attempt(); clock.attempt();
  m.advance(4_000); clock.lap('google');
  m.advance(100); clock.lap('wait');
  expect(parseSpeechTiming(clock.header())).toEqual({ phases: { auth: 200, google: 4_000, wait: 100 }, totalMs: 4_300, attempts: 2 });
});

test.each([
  ['nothing', null],
  ['an empty header', ''],
  ['no total', 'auth;dur=10, google;dur=3000'],
  ['another server\'s names only, no total', 'cdn-cache;desc=HIT, edge;dur=4'],
  ['an absurdly long header', `${'x;dur=1, '.repeat(200)}total;dur=5`],
])('%s is no timing', (_why, header) => {
  expect(parseSpeechTiming(header)).toBeNull();
});

test('names it does not know, bad durations and a bad attempt count are skipped', () => {
  expect(parseSpeechTiming('cdn;dur=9, Auth;dur=20, google;dur=-1, budget;dur=abc, google;dur=3000;desc="x", total;dur=3100')).toEqual({
    phases: { auth: 20, google: 3_000 },
    totalMs: 3_100,
    attempts: 1,
  });
});

test('the card row: Google (with a retry pause), our steps, the network, and our slow steps longest first', () => {
  const timing = parseSpeechTiming('limit;dur=10, auth;dur=180, quota;dur=30, budget;dur=320, google;dur=3500;desc="2", wait;dur=500, book;dur=140, total;dur=4680')!;
  expect(speechTimingRow(timing, 5_200)).toEqual({
    googleMs: 4_000,
    attempts: 2,
    oursMs: 680,
    networkMs: 520,
    steps: [
      { phase: 'budget', ms: 320 },
      { phase: 'auth', ms: 180 },
      { phase: 'book', ms: 140 },
    ],
  });
});

test('a browser measure shorter than the route\'s total gives no network figure', () => {
  const timing = parseSpeechTiming('google;dur=1000, total;dur=1200')!;
  expect(speechTimingRow(timing, 1_100).networkMs).toBeNull();
});

test('the phases are the route\'s steps in order, and every one round-trips', () => {
  expect(SPEECH_PHASES).toEqual(['limit', 'body', 'auth', 'quota', 'model', 'budget', 'token', 'google', 'wait', 'decode', 'book']);
  const m = manual();
  const clock = new SpeechClock(m.now);
  for (const p of SPEECH_PHASES) { m.advance(1); clock.lap(p); }
  expect(Object.keys(parseSpeechTiming(clock.header())!.phases)).toEqual([...SPEECH_PHASES]);
});

// GG's card 2026-11-06: 1.5–3.1 s of a chunk was "network". A fresh instance loading the route is part of that.
test('a cold start is named in the header, read back, and carried to the row as part of the network', () => {
  const m = manual();
  const clock = new SpeechClock(m.now);
  clock.cold(812.4);
  m.advance(200); clock.lap('auth');
  m.advance(3_000); clock.lap('google');
  expect(clock.header()).toBe('auth;dur=200, google;dur=3000, cold;dur=812, total;dur=3200');
  const timing = parseSpeechTiming(clock.header())!;
  expect(timing).toEqual({ phases: { auth: 200, google: 3_000 }, totalMs: 3_200, attempts: 1, coldMs: 812 });
  const row = speechTimingRow(timing, 5_000);
  expect(row).toMatchObject({ googleMs: 3_000, oursMs: 200, networkMs: 1_800, coldMs: 812 });
  // A warm request says nothing of it.
  const warm = parseSpeechTiming('auth;dur=200, total;dur=3200')!;
  expect(warm).not.toHaveProperty('coldMs');
  expect(speechTimingRow(warm, 5_000)).not.toHaveProperty('coldMs');
});
