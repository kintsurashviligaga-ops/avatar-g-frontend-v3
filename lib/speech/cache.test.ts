/** @jest-environment node */
/**
 * lib/speech/cache — hearing a reply again sends no request, and nothing is replayed for another account, another
 * text, or audio the route now makes another way (§5.3.1, §5.3.6; GG's decision 3). A Map stands in for IndexedDB and a
 * jest.fn for the route: no browser, no network, no spend.
 */
import { createHash } from 'node:crypto';
import { SpeechCache, type FetchSpeech, type SpeechCacheLimits } from './cache';
import type { SpeechLocale } from './contract';
import { SpeechPlayer, type SpeechAudio } from './player';
import type { SpeechStore, StoredSpeech } from './store';
import { wrapPcm16 } from './wav';
import { WAV_DOUBLE_WRAPPED, pcm16Tone } from '../../tests/fixtures/speechAudio';

const P1 = 'c1|p1;lang=en-US|gemini-2.5-flash-preview-tts|Aoede|24000x1';
const P2 = 'c1|p1;lang=en-US|gemini-2.5-pro-preview-tts|Aoede|24000x1';
/** A valid contract WAV whose samples are `seed`, so two answers can be told apart by their bytes. */
const wavOf = (seed: number, frames = 2400) =>
  wrapPcm16(pcm16Tone({ channels: 1, frames, peak: 1000 + seed }), { sampleRate: 24000, channels: 1 });
const sha256 = (s: string) => Promise.resolve(createHash('sha256').update(s).digest('hex'));
const bytesOf = async (b: Blob | null) => (b ? new Uint8Array(await b.arrayBuffer()) : null);
const tick = () => new Promise<void>((r) => setTimeout(r, 1));
/** Lets the cache's background write land. */
const settle = async () => { for (let i = 0; i < 5; i++) await tick(); };

/** IndexedDB stand-in: the same contract (LRU cap on put, purge by locale+profile), plus counters. */
function mapStore() {
  const rows = new Map<string, StoredSpeech & { usedAt: number }>();
  const profiles = new Map<string, string>();
  let clock = 0;
  const store: SpeechStore & { rows: typeof rows; profiles: typeof profiles; hang: boolean } = {
    rows,
    profiles,
    hang: false,
    get: jest.fn(async (key: string) => {
      if (store.hang) return new Promise<never>(() => undefined);
      const r = rows.get(key);
      if (!r) return null;
      r.usedAt = ++clock;
      return r.bytes;
    }),
    put: jest.fn(async (entry: StoredSpeech, maxBytes: number) => {
      rows.set(entry.key, { ...entry, usedAt: ++clock });
      let kept = 0;
      for (const r of [...rows.values()].sort((a, b) => b.usedAt - a.usedAt)) {
        kept += r.bytes.byteLength;
        if (kept > maxBytes && r.key !== entry.key) rows.delete(r.key);
      }
    }),
    delete: jest.fn(async (key: string) => { rows.delete(key); }),
    purge: jest.fn(async (locale: SpeechLocale, profile: string) => {
      for (const [k, r] of rows) if (r.locale === locale && r.profile !== profile) rows.delete(k);
    }),
    getProfile: jest.fn(async (locale: SpeechLocale) => {
      if (store.hang) return new Promise<never>(() => undefined);
      return profiles.get(locale) ?? null;
    }),
    setProfile: jest.fn(async (locale: SpeechLocale, profile: string) => { profiles.set(locale, profile); }),
    clear: jest.fn(async () => { rows.clear(); profiles.clear(); }),
  };
  return store;
}

/** The route: answers each text with its own WAV and profile P1, unless told otherwise. */
function route() {
  let n = 0;
  const answers = new Map<string, { bytes: Uint8Array; profile: string | null }>();
  const fetch = jest.fn<ReturnType<FetchSpeech>, Parameters<FetchSpeech>>(async (text) => {
    const a = answers.get(text) ?? { bytes: wavOf(++n), profile: P1 };
    return { blob: new Blob([a.bytes as BlobPart], { type: 'audio/wav' }), profile: a.profile };
  });
  return { fetch, answers };
}

function rig(opts: { user?: string | null; store?: SpeechStore | null; limits?: Partial<SpeechCacheLimits>; hash?: typeof sha256 | null } = {}) {
  let user: string | null = opts.user === undefined ? 'user-a' : opts.user;
  const store = opts.store === undefined ? mapStore() : opts.store;
  const hash = opts.hash === undefined ? sha256 : opts.hash;
  const make = () => new SpeechCache(
    { userId: () => user, sha256: (s) => (hash ? hash(s) : null), store },
    { memoryBytes: 24 * 1024 * 1024, deviceBytes: 50 * 1024 * 1024, timeoutMs: 50, ...opts.limits },
  );
  const r = route();
  let cache = make();
  const read = (text: string, locale: SpeechLocale = 'en', signal = new AbortController().signal) => cache.synth(text, locale, signal, r.fetch);
  return {
    ...r,
    store,
    read,
    get cache() { return cache; },
    /** A new page on the same device: memory is gone, the device store is not. */
    reload: () => { cache = make(); },
    signIn: (u: string | null) => { user = u; },
  };
}

test('hearing a chunk again sends no request and plays the same bytes', async () => {
  const r = rig();
  const first = await bytesOf(await r.read('Hello there.'));
  await settle();
  const again = await bytesOf(await r.read('Hello there.'));
  expect(r.fetch).toHaveBeenCalledTimes(1);
  expect(again).toEqual(first);
});

test('a new page on the same device replays from IndexedDB with no request; the profile is read back from it too', async () => {
  const r = rig();
  const first = await bytesOf(await r.read('Hello there.'));
  await settle();
  r.reload();
  const again = await bytesOf(await r.read('Hello there.'));
  expect(r.fetch).toHaveBeenCalledTimes(1);
  expect(again).toEqual(first);
});

test('a guest keeps and finds nothing', async () => {
  const r = rig({ user: null });
  await r.read('Hello there.');
  await settle();
  await r.read('Hello there.');
  expect(r.fetch).toHaveBeenCalledTimes(2);
  expect((r.store as ReturnType<typeof mapStore>).rows.size).toBe(0);
});

test('another account on the same device never hears the first account\'s audio', async () => {
  const r = rig();
  await r.read('Hello there.');
  await settle();
  r.signIn('user-b');
  await r.read('Hello there.');
  expect(r.fetch).toHaveBeenCalledTimes(2);
});

test('another locale, or an edited text (a new revision), is a miss', async () => {
  const r = rig();
  await r.read('Hello there.', 'en');
  await settle();
  await r.read('Hello there.', 'ru');
  await r.read('Hello there!', 'en');
  expect(r.fetch).toHaveBeenCalledTimes(3);
});

test('audio whose headers do not say how it was made is played but never kept', async () => {
  const r = rig();
  r.answers.set('Hello there.', { bytes: wavOf(7), profile: null });
  expect(await r.read('Hello there.')).not.toBeNull();
  await settle();
  await r.read('Hello there.');
  expect(r.fetch).toHaveBeenCalledTimes(2);
});

test('bytes that are not a contract WAV are handed on (the player refuses them) but never kept', async () => {
  const r = rig();
  r.answers.set('Hello there.', { bytes: WAV_DOUBLE_WRAPPED, profile: P1 });
  expect(await r.read('Hello there.')).not.toBeNull();
  await settle();
  await r.read('Hello there.');
  expect(r.fetch).toHaveBeenCalledTimes(2);
  expect((r.store as ReturnType<typeof mapStore>).rows.size).toBe(0);
});

test('when the route reports another model, voice or pacing, audio made the old way is dropped and never replayed', async () => {
  const r = rig();
  await r.read('Old one.');
  await settle();
  // A new text answers with the new profile (e.g. GEMINI_TTS_MODEL changed).
  r.answers.set('Fresh one.', { bytes: wavOf(9), profile: P2 });
  await r.read('Fresh one.');
  await settle();
  const store = r.store as ReturnType<typeof mapStore>;
  expect(store.purge).toHaveBeenCalledWith('en', P2);
  expect([...store.rows.values()].map((x) => x.profile)).toEqual([P2]);
  // The old text is synthesised again, in the new way.
  await r.read('Old one.');
  expect(r.fetch).toHaveBeenCalledTimes(3);
  // Other locales keep theirs.
  expect(store.purge).not.toHaveBeenCalledWith('ka', expect.anything());
});

test('a damaged entry on the device is a miss, and is deleted (never a failed read that "try again" would repeat)', async () => {
  const r = rig();
  await r.read('Hello there.');
  await settle();
  const store = r.store as ReturnType<typeof mapStore>;
  const [row] = [...store.rows.values()];
  store.rows.set(row!.key, { ...row!, bytes: new Uint8Array([1, 2, 3]).buffer });
  r.reload();
  expect(await r.read('Hello there.')).not.toBeNull();
  expect(r.fetch).toHaveBeenCalledTimes(2);
  expect(store.delete).toHaveBeenCalledWith(row!.key);
});

test('a device store that hangs costs one short wait, then the page works from memory and the network', async () => {
  const store = mapStore();
  const r = rig({ store });
  await r.read('Hello there.');
  await settle();
  r.reload();
  store.hang = true;
  const t0 = Date.now();
  expect(await r.read('Hello there.')).not.toBeNull();
  expect(Date.now() - t0).toBeGreaterThanOrEqual(45);
  expect(r.fetch).toHaveBeenCalledTimes(2);
  const calls = (store.getProfile as jest.Mock).mock.calls.length + (store.get as jest.Mock).mock.calls.length;
  // The store is given up: the next read does not wait on it again, and memory now serves the replay.
  const t1 = Date.now();
  await settle();
  expect(await r.read('Hello there.')).not.toBeNull();
  expect(Date.now() - t1).toBeLessThan(45);
  expect(r.fetch).toHaveBeenCalledTimes(2);
  expect((store.getProfile as jest.Mock).mock.calls.length + (store.get as jest.Mock).mock.calls.length).toBe(calls);
});

test('sign-out (clear) empties memory and the device; audio that arrives after it is not kept', async () => {
  const r = rig();
  await r.read('Hello there.');
  await settle();
  let release!: () => void;
  r.fetch.mockImplementationOnce(async () => {
    await new Promise<void>((res) => { release = res; });
    return { blob: new Blob([wavOf(5) as BlobPart], { type: 'audio/wav' }), profile: P1 };
  });
  const late = r.read('Arrives late.');
  await settle();
  await r.cache.clear();
  const store = r.store as ReturnType<typeof mapStore>;
  expect(store.rows.size).toBe(0);
  expect(store.profiles.size).toBe(0);
  release();
  await late;
  await settle();
  expect(store.rows.size).toBe(0);
  // Nothing from before the sign-out is replayed either.
  await r.read('Hello there.');
  expect(r.fetch).toHaveBeenCalledTimes(3);
});

test('an account change while a chunk is arriving keeps nothing for either account', async () => {
  const r = rig();
  let release!: () => void;
  r.fetch.mockImplementationOnce(async () => {
    await new Promise<void>((res) => { release = res; });
    return { blob: new Blob([wavOf(5) as BlobPart], { type: 'audio/wav' }), profile: P1 };
  });
  const pending = r.read('Hello there.');
  await settle();
  r.signIn('user-b');
  release();
  await pending;
  await settle();
  expect((r.store as ReturnType<typeof mapStore>).rows.size).toBe(0);
});

test('memory keeps the most recently heard audio within its limit; the device keeps within its own', async () => {
  const one = wavOf(1).byteLength;
  const r = rig({ store: null, limits: { memoryBytes: one * 2 } });
  await r.read('First.');
  await r.read('Second.');
  await settle();
  await r.read('First.'); // heard again: now the most recent
  await r.read('Third.');
  await settle();
  r.fetch.mockClear();
  await r.read('First.');
  await r.read('Third.');
  expect(r.fetch).not.toHaveBeenCalled();
  await r.read('Second.'); // the least recently heard went
  expect(r.fetch).toHaveBeenCalledTimes(1);

  const d = rig({ limits: { deviceBytes: 12_345 } });
  await d.read('First.');
  await settle();
  expect((d.store as ReturnType<typeof mapStore>).put).toHaveBeenCalledWith(expect.objectContaining({ locale: 'en', profile: P1 }), 12_345);
});

test('a read that was cancelled answers null without a request; a page that cannot hash keeps nothing', async () => {
  const r = rig();
  const ctrl = new AbortController();
  ctrl.abort();
  expect(await r.read('Hello there.', 'en', ctrl.signal)).toBeNull();
  expect(r.fetch).not.toHaveBeenCalled();

  const h = rig({ hash: null });
  await h.read('Hello there.');
  await settle();
  await h.read('Hello there.');
  expect(h.fetch).toHaveBeenCalledTimes(2);
});

test('the key is a hash: neither the text nor the account id is written to the device', async () => {
  const r = rig();
  await r.read('A private sentence.');
  await settle();
  const [row] = [...(r.store as ReturnType<typeof mapStore>).rows.values()];
  expect(row!.key).toMatch(/^[0-9a-f]{64}$/);
  expect(JSON.stringify({ ...row, bytes: undefined })).not.toMatch(/private|user-a/);
});

describe('with the player', () => {
  class FakeAudio implements SpeechAudio {
    src = '';
    currentSrc = '';
    error: unknown = null;
    currentTime = 0;
    playbackRate = 1;
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    pause = jest.fn();
    play(): Promise<void> {
      // Every real chunk ends a moment after it starts.
      if (this.src.startsWith('blob:')) setTimeout(() => this.onended?.(), 1);
      return Promise.resolve();
    }
    load(): void { this.currentSrc = this.src; }
  }

  test('a whole reply heard twice: the second time sends no request at all', async () => {
    const r = rig();
    let n = 0;
    const player = new SpeechPlayer({
      synth: (text, locale, signal) => r.cache.synth(text, locale, signal, r.fetch),
      createAudio: () => new FakeAudio(),
      createObjectURL: () => `blob:${++n}`,
      revokeObjectURL: () => undefined,
    });
    const text = 'The first sentence is here. The second sentence is here. The third sentence is here.';
    const req = { owner: 'omni:c1:2', text, locale: 'en' as const, chunking: { maxChars: 30 } };
    player.play(req);
    for (let i = 0; i < 300 && player.getState().status !== 'done'; i++) await tick();
    expect(player.getState().status).toBe('done');
    const asked = r.fetch.mock.calls.length;
    expect(asked).toBe(3);
    await settle();
    player.play(req);
    for (let i = 0; i < 300 && player.getState().status !== 'done'; i++) await tick();
    expect(player.getState().status).toBe('done');
    expect(r.fetch).toHaveBeenCalledTimes(asked);
    player.dispose();
  });
});
