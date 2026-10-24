/** @jest-environment node */
import { parseServerTiming, serverTiming, SPAN_NAMES, TRACE_HEADER, traceIdFrom } from './serverTiming';

const TRACE = '0123456789abcdef0123456789abcdef';
const traced = (id: string | null = TRACE) => ({ headers: new Headers(id === null ? {} : { [TRACE_HEADER]: id }) });

/** A clock the test moves by hand. */
function clock(start = 1000) {
  let t = start;
  return { now: () => t, tick: (ms: number) => { t += ms; } };
}

describe('opting in', () => {
  test('only a bare 16–32 hex id opts in', () => {
    expect(traceIdFrom(traced().headers)).toBe(TRACE);
    expect(traceIdFrom(traced('0123456789abcdef').headers)).toBe('0123456789abcdef');
    for (const bad of ['', 'abc', 'ZZZZZZZZZZZZZZZZ', `${TRACE}00`, '0123456789abcdef; desc="hi"', 'how do I make a film?']) {
      expect(traceIdFrom(traced(bad).headers)).toBeNull();
    }
    expect(traceIdFrom(traced(null).headers)).toBeNull();
  });

  test('without a trace nothing is recorded or written, and time() hands back the same promise', async () => {
    const t = serverTiming(traced(null));
    const work = Promise.resolve(42);
    expect(t.time('db', work)).toBe(work);
    t.since('ttft');
    t.add('rate', 5);
    expect(t.header()).toBeNull();
    expect(t.headers()).toEqual({});
    expect(t.sseComment()).toBeNull();
    await expect(work).resolves.toBe(42);
  });
});

describe('spans', () => {
  test('a timed promise records its own duration, in call order, and the end span closes the header', async () => {
    const c = clock();
    const t = serverTiming(traced(), c.now);
    c.tick(3);
    let release!: (v: string) => void;
    const auth = t.time('auth', new Promise<string>((r) => { release = r; }));
    c.tick(40);
    release('user');
    await expect(auth).resolves.toBe('user');
    c.tick(7);
    await t.time('db', Promise.resolve([]));
    expect(t.header()).toBe('auth;dur=40, db;dur=0, total;dur=50');
    expect(t.headers('respond')).toEqual({ 'Server-Timing': 'auth;dur=40, db;dur=0, respond;dur=50', [TRACE_HEADER]: TRACE });
  });

  test('a rejection is timed and still rejects', async () => {
    const c = clock();
    const t = serverTiming(traced(), c.now);
    const failing = t.time('sign', (async () => { await null; c.tick(12); throw new Error('storage down'); })());
    await expect(failing).rejects.toThrow('storage down');
    expect(t.header()).toBe('sign;dur=12, total;dur=12');
  });

  test('a name timed twice adds up; since() keeps its first value', () => {
    const c = clock();
    const t = serverTiming(traced(), c.now);
    t.add('rate', 1.25);
    t.add('rate', 2);
    c.tick(300);
    t.since('ttft');
    c.tick(500);
    t.since('ttft');
    expect(t.header()).toBe('rate;dur=3.3, ttft;dur=300, total;dur=800');
  });

  test('durations are clamped to 0–10 min and rounded to 0.1 ms', () => {
    const t = serverTiming(traced(), () => 0);
    t.add('db', -5);
    t.add('sign', 99_999_999);
    t.add('proof', Number.NaN);
    expect(t.header()).toBe('db;dur=0, sign;dur=600000, total;dur=0');
  });

  test('the SSE comment is one comment event every SSE parser drops', () => {
    const c = clock();
    const t = serverTiming(traced(), c.now);
    t.add('budget', 9);
    c.tick(20);
    expect(t.sseComment()).toBe(': server-timing budget;dur=9, total;dur=20\n\n');
  });
});

describe('nothing but names and numbers', () => {
  test('the header grammar admits no text: every entry is <known name>;dur=<number>', async () => {
    const c = clock();
    const t = serverTiming(traced(), c.now);
    for (const name of SPAN_NAMES) {
      c.tick(1);
      await t.time(name, Promise.resolve('https://example.supabase.co/storage/v1/object/sign/renders/a.mp4?token=secret and a prompt'));
    }
    const header = t.header()!;
    for (const entry of header.split(', ')) expect(entry).toMatch(/^[a-z]+;dur=\d+(\.\d)?$/);
    expect(header).not.toMatch(/token|https|supabase|desc|"/);
  });
});

describe('parseServerTiming', () => {
  test('round-trips a header and an SSE comment, keeping known names only', () => {
    expect(parseServerTiming('auth;dur=40, db;dur=0.5, total;dur=50')).toEqual({ auth: 40, db: 0.5, total: 50 });
    expect(parseServerTiming(': server-timing budget;dur=9, total;dur=20\n\n')).toEqual({ budget: 9, total: 20 });
    expect(parseServerTiming('cdn-cache;desc=HIT, edge;dur=3, db ; dur=7 ; desc="x"')).toEqual({ db: 7 });
    expect(parseServerTiming(null)).toEqual({});
  });
});
