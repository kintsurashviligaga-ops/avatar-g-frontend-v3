/**
 * Live failure telemetry: an allow-listed payload capped at 2 KB (the same sanitizer the /api/log-error route uses),
 * reportError + a beacon (fetch keepalive when there is no sendBeacon), the page URL without its query string, and a
 * per-page budget so a Retry loop cannot flood the sink.
 */
const mockReportError = jest.fn();
jest.mock('../observability/report-error', () => ({ reportError: (...a: unknown[]) => mockReportError(...a) }));

import {
  LIVE_TELEMETRY_MAX_BYTES,
  LIVE_TELEMETRY_MAX_REPORTS,
  __resetLiveTelemetryBudget,
  buildLiveFailurePayload,
  reportLiveFailure,
  sanitizeLiveContext,
  utf8Length,
} from './liveTelemetry';

const FB_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0]';

describe('sanitizeLiveContext', () => {
  test('keeps only allow-listed keys, caps strings, requires a code', () => {
    const p = sanitizeLiveContext({ code: 'mic_busy', name: 'NotReadableError', message: 'm'.repeat(500), ua: 'u'.repeat(900), token: 'secret', transcript: 'words', mints: 2.4, primed: 'yes' });
    expect(p).toMatchObject({ kind: 'live_failure', code: 'mic_busy', name: 'NotReadableError', mints: 2 });
    expect(p!.message).toHaveLength(200);
    expect(p!.ua).toHaveLength(300);
    expect(p).not.toHaveProperty('token');
    expect(p).not.toHaveProperty('transcript');
    expect(p).not.toHaveProperty('primed'); // not a boolean → dropped
    expect(sanitizeLiveContext({ name: 'x' })).toBeNull();
    expect(sanitizeLiveContext('x')).toBeNull();
    expect(sanitizeLiveContext([{ code: 'x' }])).toBeNull();
  });

  test('attempts: at most 8, each {step, name, ms}; dropped entirely if the payload would pass 2 KB', () => {
    const attempts = Array.from({ length: 12 }, (_, i) => ({ step: `s${i}`, name: 'NotReadableError', ms: i, extra: 'x' }));
    const p = sanitizeLiveContext({ code: 'mic_busy', attempts });
    expect(p!.attempts).toHaveLength(8);
    expect(p!.attempts![0]).toEqual({ step: 's0', name: 'NotReadableError', ms: 0 });
    expect(JSON.stringify(p).length).toBeLessThanOrEqual(LIVE_TELEMETRY_MAX_BYTES);

    // Georgian is 3 bytes a character: capped strings can still pass 2 KB together — the attempt list goes first.
    const ka = 'მ'.repeat(400);
    const heavy = sanitizeLiveContext({ code: 'mic_busy', message: ka, ua: ka, name: ka, attempts: attempts.map((a) => ({ ...a, step: ka, name: ka })) });
    expect(heavy).not.toBeNull();
    expect(heavy).not.toHaveProperty('attempts');
    expect(utf8Length(JSON.stringify(heavy))).toBeLessThanOrEqual(LIVE_TELEMETRY_MAX_BYTES);
  });
});

test('utf8Length counts bytes the way the wire does', () => {
  expect(utf8Length('abc')).toBe(3);
  expect(utf8Length('მ')).toBe(3);
  expect(utf8Length('ж')).toBe(2);
  expect(utf8Length('😀')).toBe(4);
});

test('buildLiveFailurePayload flags in-app browsers and records the secure flag', () => {
  const p = buildLiveFailurePayload('mic_in_app', { name: 'TypeError', message: 'x' }, { locale: 'ka', primed: true, mints: 1 }, { secure: true, userAgent: FB_UA });
  expect(p).toMatchObject({ code: 'mic_in_app', name: 'TypeError', inApp: true, secure: true, locale: 'ka', primed: true, mints: 1 });
});

describe('reportLiveFailure', () => {
  const nav = navigator as unknown as { sendBeacon?: unknown };
  const g = globalThis as unknown as { fetch?: unknown };
  let savedFetch: unknown;
  beforeEach(() => {
    __resetLiveTelemetryBudget();
    mockReportError.mockReset();
    savedFetch = g.fetch;
    window.history.replaceState(null, '', '/ka/dashboard?voice=1&ref=campaign');
  });
  afterEach(() => {
    delete nav.sendBeacon;
    g.fetch = savedFetch;
  });

  test('reportError + one beacon to /api/log-error with the path but no query string', () => {
    const beacon = jest.fn(() => true);
    nav.sendBeacon = beacon;
    reportLiveFailure('mic_busy', { name: 'NotReadableError', message: 'Could not start audio source' }, { attempts: [{ step: 'full', name: 'NotReadableError', ms: 3 }] });
    expect(mockReportError).toHaveBeenCalledTimes(1);
    expect(String((mockReportError.mock.calls[0]![0] as Error).message)).toBe('live:mic_busy:NotReadableError');
    expect(beacon).toHaveBeenCalledTimes(1);
    const [url, body] = beacon.mock.calls[0] as unknown as [string, string];
    expect(url).toBe('/api/log-error');
    const parsed = JSON.parse(body);
    expect(parsed.url).toBe(`${window.location.origin}/ka/dashboard`);
    expect(parsed.message).toBe('live mic_busy NotReadableError');
    expect(parsed.context).toMatchObject({ kind: 'live_failure', code: 'mic_busy', attempts: [{ step: 'full', name: 'NotReadableError', ms: 3 }] });
  });

  test('no sendBeacon (or a refused one) → fetch with keepalive', () => {
    const fetchMock = jest.fn(async () => ({ ok: true }));
    g.fetch = fetchMock;
    reportLiveFailure('setup_failed', null, {});
    expect(fetchMock).toHaveBeenCalledWith('/api/log-error', expect.objectContaining({ method: 'POST', keepalive: true }));
  });

  test(`at most ${LIVE_TELEMETRY_MAX_REPORTS} reports per page`, () => {
    const beacon = jest.fn(() => true);
    nav.sendBeacon = beacon;
    for (let i = 0; i < LIVE_TELEMETRY_MAX_REPORTS + 5; i++) reportLiveFailure('mic_busy', null, {});
    expect(beacon).toHaveBeenCalledTimes(LIVE_TELEMETRY_MAX_REPORTS);
  });

  test('never throws, even when every sink does', () => {
    nav.sendBeacon = () => { throw new Error('nope'); };
    mockReportError.mockImplementation(() => { throw new Error('sentry down'); });
    expect(() => reportLiveFailure('mic_lost', null, {})).not.toThrow();
  });
});
