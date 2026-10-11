/**
 * The composer mic's latency summaries: timings and enums only, the same allow-list in the browser and on the server,
 * and p50 / p95 computed only from dictations that actually reached each step (owner, 2026-10-11 PART 4: never report a
 * target as a measurement).
 */
import {
  DICTATION_METRICS_EVENT,
  DICTATION_METRICS_MAX_PASSES,
  DICTATION_METRICS_MAX_REPORTS,
  DICTATION_METRICS_RING,
  DICTATION_METRICS_URL,
  __resetDictationMetricsBudget,
  percentile,
  readDictationMetrics,
  reportDictationMetrics,
  sanitizeDictationMetrics,
  serverTimingMs,
  summarizeDictationLatency,
  type DictationMetrics,
} from './dictationMetrics';

const BASE: DictationMetrics = {
  v: 1, engine: 'recorder', lang: 'ka-GE', outcome: 'text', capture: 'wav', warm: true,
  tapToListeningMs: 180, listeningToFirstTextMs: 1500, stopToFinalMs: 900, listenMs: 4000,
  passes: 3, passMs: [850, 900, 880], serverSttMs: [600, 640, 610], finalPassMs: 880,
  aborted: 1, deferred: 0, failed: 0, restarts: 0,
};

type W = { __myavatarDictationMetrics?: DictationMetrics[] };
const ring = () => (window as unknown as W).__myavatarDictationMetrics;

beforeEach(() => {
  delete (window as unknown as W).__myavatarDictationMetrics;
  __resetDictationMetricsBudget();
});

describe('sanitizeDictationMetrics', () => {
  test('a real summary passes unchanged', () => {
    expect(sanitizeDictationMetrics(BASE)).toEqual(BASE);
  });

  test('free-form fields never survive: unknown keys are dropped, enums outside the lists are dropped or refused', () => {
    const m = sanitizeDictationMetrics({ ...BASE, transcript: 'გამარჯობა', url: 'https://x.test', errorCode: 'Error: boom', capture: 'mp3' });
    expect(m).not.toHaveProperty('transcript');
    expect(m).not.toHaveProperty('url');
    expect(m).not.toHaveProperty('errorCode');
    expect(m).not.toHaveProperty('capture');
    expect(JSON.stringify(m)).not.toMatch(/გამარჯობა|x\.test|boom/);
  });

  test('not a summary: null', () => {
    expect(sanitizeDictationMetrics(null)).toBeNull();
    expect(sanitizeDictationMetrics([BASE])).toBeNull();
    expect(sanitizeDictationMetrics({ ...BASE, v: 2 })).toBeNull();
    expect(sanitizeDictationMetrics({ ...BASE, engine: 'whisper' })).toBeNull();
    expect(sanitizeDictationMetrics({ ...BASE, lang: 'fr-FR' })).toBeNull();
    expect(sanitizeDictationMetrics({ ...BASE, outcome: 'great' })).toBeNull();
  });

  test('numbers are rounded and clamped, garbage becomes absent (never zero), arrays are cut', () => {
    const m = sanitizeDictationMetrics({
      ...BASE,
      tapToListeningMs: 212.6,
      stopToFinalMs: -5,
      listenMs: 9e9,
      listeningToFirstTextMs: 'fast',
      finalPassMs: Number.NaN,
      passMs: [1.4, 'x', 2.6, ...Array.from({ length: 30 }, () => 100)],
      passes: 1e9,
      warm: 'yes',
    })!;
    expect(m.tapToListeningMs).toBe(213);
    expect(m.stopToFinalMs).toBe(0);
    expect(m.listenMs).toBe(600_000);
    expect(m).not.toHaveProperty('listeningToFirstTextMs');
    expect(m).not.toHaveProperty('finalPassMs');
    expect(m).not.toHaveProperty('warm');
    expect(m.passMs.length).toBeLessThanOrEqual(DICTATION_METRICS_MAX_PASSES);
    expect(m.passMs.slice(0, 2)).toEqual([1, 3]);
    expect(m.passes).toBe(10_000);
  });
});

describe('serverTimingMs', () => {
  test('reads the named metric, quoted or not, among others', () => {
    expect(serverTimingMs('stt;dur=642.7', 'stt')).toBe(643);
    expect(serverTimingMs('db;dur=3, stt;desc="gemini";dur="812"', 'stt')).toBe(812);
    expect(serverTimingMs('cache;desc=hit', 'stt')).toBeUndefined();
    expect(serverTimingMs('stt;desc=x', 'stt')).toBeUndefined();
    expect(serverTimingMs(null, 'stt')).toBeUndefined();
    expect(serverTimingMs('', 'stt')).toBeUndefined();
  });
});

describe('percentile and the latency summary', () => {
  test('nearest-rank percentile', () => {
    expect(percentile([], 50)).toBeNull();
    expect(percentile([7], 95)).toBe(7);
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3);
    expect(percentile(Array.from({ length: 20 }, (_, i) => i + 1), 95)).toBe(19);
    expect(percentile([1, 2, Number.NaN, 3], 100)).toBe(3);
  });

  test('a step a dictation never reached is left out, not counted as zero', () => {
    const list: DictationMetrics[] = [
      BASE,
      { ...BASE, tapToListeningMs: 220, listeningToFirstTextMs: 1700, stopToFinalMs: 1100 },
      { ...BASE, outcome: 'cancelled', tapToListeningMs: 300, listeningToFirstTextMs: undefined, stopToFinalMs: undefined },
      { ...BASE, outcome: 'denied', tapToListeningMs: undefined, listeningToFirstTextMs: undefined, stopToFinalMs: undefined },
    ];
    const s = summarizeDictationLatency(list);
    expect(s.dictations).toBe(4);
    expect(s.tapToListening).toEqual({ n: 3, p50: 220, p95: 300 });
    expect(s.listeningToFirstText).toEqual({ n: 2, p50: 1500, p95: 1700 });
    expect(s.stopToFinal).toEqual({ n: 2, p50: 900, p95: 1100 });
  });

  test('no dictations: nothing measured', () => {
    expect(summarizeDictationLatency([])).toEqual({
      dictations: 0,
      tapToListening: { n: 0, p50: null, p95: null },
      listeningToFirstText: { n: 0, p50: null, p95: null },
      stopToFinal: { n: 0, p50: null, p95: null },
    });
  });
});

describe('reportDictationMetrics', () => {
  const beacon = jest.fn((_url: string, _body?: BodyInit | null) => true);
  beforeEach(() => {
    beacon.mockClear();
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true, writable: true });
  });

  test('keeps the sanitized summary on window, announces it, and beacons it once', () => {
    const seen = jest.fn();
    window.addEventListener(DICTATION_METRICS_EVENT, seen);
    reportDictationMetrics({ ...BASE, transcript: 'secret words' } as DictationMetrics);
    window.removeEventListener(DICTATION_METRICS_EVENT, seen);
    expect(ring()).toEqual([BASE]);
    expect(readDictationMetrics()).toEqual([BASE]);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beacon.mock.calls[0]![0]).toBe(DICTATION_METRICS_URL);
    expect(String(beacon.mock.calls[0]![1])).not.toMatch(/secret/);
  });

  test('not a summary: nothing kept, nothing sent', () => {
    reportDictationMetrics({ ...BASE, v: 9 } as unknown as DictationMetrics);
    expect(ring()).toBeUndefined();
    expect(beacon).not.toHaveBeenCalled();
  });

  test('the ring keeps the newest summaries; beacons stop at the per-page budget', () => {
    for (let i = 0; i < DICTATION_METRICS_MAX_REPORTS + 5; i += 1) reportDictationMetrics({ ...BASE, passes: i });
    expect(ring()).toHaveLength(DICTATION_METRICS_RING);
    expect(ring()!.at(-1)!.passes).toBe(DICTATION_METRICS_MAX_REPORTS + 4);
    expect(beacon).toHaveBeenCalledTimes(DICTATION_METRICS_MAX_REPORTS);
  });

  test('a refused beacon falls back to fetch keepalive; a throwing one never reaches the caller', () => {
    beacon.mockReturnValueOnce(false);
    const fetchMock = jest.fn(async () => new Response(null, { status: 204 }));
    const realFetch = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;
    try {
      reportDictationMetrics(BASE);
      expect(fetchMock).toHaveBeenCalledWith(DICTATION_METRICS_URL, expect.objectContaining({ method: 'POST', keepalive: true }));
      beacon.mockImplementationOnce(() => { throw new Error('blocked'); });
      expect(() => reportDictationMetrics(BASE)).not.toThrow();
    } finally {
      global.fetch = realFetch;
    }
  });
});
