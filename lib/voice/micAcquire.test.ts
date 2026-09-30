/**
 * The mic ladder, driven through injected deps (no browser): every DOMException name — today's and the legacy ones —
 * lands on the right failure kind; constraints step down; a busy device is released, backed off and retried, then
 * tried by explicit id; "no device" is checked against the device list; an already-denied permission never prompts;
 * the hang guard only runs once permission is granted; cancellation never leaves a hot stream.
 */
import {
  MIC_BUSY_RETRY_DELAYS_MS,
  MIC_CONSTRAINTS,
  acquireMic,
  classifyMicError,
  isInAppBrowser,
  type MicDeps,
} from './micAcquire';

const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
const FB_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0]';
const WEBVIEW_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36';

const domErr = (name: string, message = '') => Object.assign(new Error(message), { name });

function fakeStream() {
  const track = { stop: jest.fn() };
  return { stream: { getTracks: () => [track] } as unknown as MediaStream, track };
}

function deps(over: Partial<MicDeps> = {}) {
  const sleeps: number[] = [];
  const release = jest.fn();
  const d: MicDeps = {
    getUserMedia: jest.fn(async () => fakeStream().stream),
    enumerateDevices: null,
    queryPermission: null,
    isSecureContext: true,
    userAgent: CHROME_UA,
    sleep: jest.fn(async (ms: number) => { sleeps.push(ms); }),
    now: () => 0,
    requestRelease: release,
    ...over,
  };
  return { d, sleeps, release };
}

const input = (deviceId: string) => ({ kind: 'audioinput', deviceId, label: '', groupId: '' }) as MediaDeviceInfo;

describe('classifyMicError', () => {
  it.each([
    ['NotAllowedError', 'Permission denied', 'denied'],
    ['PermissionDeniedError', '', 'denied'],
    ['SecurityError', '', 'denied'],
    ['NotAllowedError', 'Permission denied by system', 'system_denied'],
    ['NotFoundError', 'Requested device not found', 'not_found'],
    ['DevicesNotFoundError', '', 'not_found'],
    ['NotReadableError', 'Could not start audio source', 'busy'],
    ['TrackStartError', '', 'busy'],
    ['AbortError', 'Starting audio failed', 'busy'],
    ['OverconstrainedError', '', 'constraint'],
    ['ConstraintNotSatisfiedError', '', 'constraint'],
    ['TypeError', "Failed to execute 'getUserMedia'", 'constraint'],
    ['TimeoutError', '', 'timeout'],
    ['WeirdError', '', 'unknown'],
  ])('%s (%s) → %s', (name, message, kind) => {
    const c = classifyMicError(domErr(name, message));
    expect(c.kind).toBe(kind);
    expect(c.name).toBe(name);
  });

  it('keeps the message short and survives non-errors', () => {
    expect(classifyMicError(domErr('NotReadableError', 'x'.repeat(500))).message).toHaveLength(200);
    expect(classifyMicError(undefined)).toEqual({ kind: 'unknown', name: 'Error', message: '' });
    expect(classifyMicError('boom').message).toBe('boom');
  });
});

test('isInAppBrowser: social in-app browsers and Android WebViews, not Chrome', () => {
  expect(isInAppBrowser(FB_UA)).toBe(true);
  expect(isInAppBrowser(WEBVIEW_UA)).toBe(true);
  expect(isInAppBrowser('Mozilla/5.0 … Instagram 300.0.0')).toBe(true);
  expect(isInAppBrowser('Mozilla/5.0 … MyAvatarApp')).toBe(true);
  expect(isInAppBrowser(CHROME_UA)).toBe(false);
});

describe('acquireMic', () => {
  test('first try uses the full constraints and reports one ok attempt', async () => {
    const { d } = deps();
    const r = await acquireMic(d, () => false);
    expect(r.ok).toBe(true);
    expect(d.getUserMedia).toHaveBeenCalledWith(MIC_CONSTRAINTS.full);
    expect(r.attempts).toEqual([{ step: 'full', name: 'ok', message: '', ms: 0 }]);
  });

  test('preflight: insecure page and missing API are reported without any request', async () => {
    expect(await acquireMic(deps({ isSecureContext: false }).d, () => false)).toMatchObject({ ok: false, kind: 'insecure' });
    expect(await acquireMic(deps({ getUserMedia: null }).d, () => false)).toMatchObject({ ok: false, kind: 'no_api', name: 'NotSupportedError' });
    expect(await acquireMic(deps({ getUserMedia: null, userAgent: FB_UA }).d, () => false)).toMatchObject({ ok: false, kind: 'in_app' });
  });

  test('an already-denied permission is reported without prompting', async () => {
    const { d } = deps({ queryPermission: async () => 'denied' });
    const r = await acquireMic(d, () => false);
    expect(r).toMatchObject({ ok: false, kind: 'denied', permission: 'denied' });
    expect(d.getUserMedia).not.toHaveBeenCalled();
  });

  test('a permission query that never answers does not hold the request (short hint timeout)', async () => {
    jest.useFakeTimers();
    try {
      const { d } = deps({ queryPermission: () => new Promise(() => {}) });
      const p = acquireMic(d, () => false, { permissionTimeoutMs: 300 });
      await jest.advanceTimersByTimeAsync(300);
      const r = await p;
      expect(r.ok).toBe(true);
      expect(r.permission).toBe('unknown');
    } finally {
      jest.useRealTimers();
    }
  });

  test('without a Permissions API the first getUserMedia is called synchronously', () => {
    const { d } = deps();
    void acquireMic(d, () => false);
    expect(d.getUserMedia).toHaveBeenCalledTimes(1);
  });

  test('OverconstrainedError steps down: full → basic → bare', async () => {
    const gum = jest.fn()
      .mockRejectedValueOnce(domErr('OverconstrainedError'))
      .mockRejectedValueOnce(domErr('OverconstrainedError'))
      .mockResolvedValueOnce(fakeStream().stream);
    const { d } = deps({ getUserMedia: gum });
    const r = await acquireMic(d, () => false);
    expect(r.ok).toBe(true);
    expect(gum.mock.calls.map((c) => c[0])).toEqual([MIC_CONSTRAINTS.full, MIC_CONSTRAINTS.basic, MIC_CONSTRAINTS.bare]);
    expect(r.attempts.map((a) => a.step)).toEqual(['full', 'basic', 'bare']);
  });

  test('a synchronous TypeError on every rung: in-app browser → in_app, desktop → constraint (shown as mic_unavailable)', async () => {
    const throwing = () => { throw new TypeError('bad'); };
    expect(await acquireMic(deps({ getUserMedia: throwing, userAgent: FB_UA }).d, () => false)).toMatchObject({ ok: false, kind: 'in_app', name: 'TypeError' });
    expect(await acquireMic(deps({ getUserMedia: throwing }).d, () => false)).toMatchObject({ ok: false, kind: 'constraint', name: 'TypeError' });
  });

  test('busy: release, 400 ms, {audio:true}, then 1 s, retry', async () => {
    const gum = jest.fn()
      .mockRejectedValueOnce(domErr('NotReadableError', 'Could not start audio source'))
      .mockRejectedValueOnce(domErr('NotReadableError'))
      .mockResolvedValueOnce(fakeStream().stream);
    const { d, sleeps, release } = deps({ getUserMedia: gum });
    const r = await acquireMic(d, () => false);
    expect(r.ok).toBe(true);
    expect(release).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([...MIC_BUSY_RETRY_DELAYS_MS]);
    expect(gum.mock.calls.map((c) => c[0])).toEqual([MIC_CONSTRAINTS.full, MIC_CONSTRAINTS.bare, MIC_CONSTRAINTS.bare]);
    expect(r.attempts.map((a) => a.step)).toEqual(['full', 'retry1', 'retry2']);
  });

  test('still busy: an explicit non-default device is tried; all failing → busy with the device count', async () => {
    const gum = jest.fn(async () => { throw domErr('NotReadableError'); });
    const enumerateDevices = jest.fn(async () => [input('default'), input('communications'), input('usb-mic-1'), { kind: 'videoinput', deviceId: 'cam' } as MediaDeviceInfo]);
    const { d } = deps({ getUserMedia: gum, enumerateDevices });
    const r = await acquireMic(d, () => false);
    expect(r).toMatchObject({ ok: false, kind: 'busy', name: 'NotReadableError', audioInputs: 3 });
    expect(gum).toHaveBeenCalledTimes(4);
    expect(gum.mock.calls[3]).toEqual([{ audio: { deviceId: { exact: 'usb-mic-1' } } }]);
    expect(r.attempts.map((a) => a.step)).toEqual(['full', 'retry1', 'retry2', 'device']);
  });

  test('the explicit device can rescue a busy default route', async () => {
    const gum = jest.fn(async (c: MediaStreamConstraints) => {
      if (typeof c.audio === 'object' && c.audio && 'deviceId' in c.audio) return fakeStream().stream;
      throw domErr('NotReadableError');
    });
    const { d } = deps({ getUserMedia: gum, enumerateDevices: async () => [input('default'), input('built-in')] });
    expect((await acquireMic(d, () => false)).ok).toBe(true);
  });

  test('NotFoundError with no inputs → not_found (no extra request)', async () => {
    const gum = jest.fn(async () => { throw domErr('NotFoundError'); });
    const { d } = deps({ getUserMedia: gum, enumerateDevices: async () => [] });
    expect(await acquireMic(d, () => false)).toMatchObject({ ok: false, kind: 'not_found', audioInputs: 0 });
    expect(gum).toHaveBeenCalledTimes(1);
  });

  test('NotFoundError while inputs exist → one bare try', async () => {
    const gum = jest.fn().mockRejectedValueOnce(domErr('DevicesNotFoundError')).mockResolvedValueOnce(fakeStream().stream);
    const { d } = deps({ getUserMedia: gum, enumerateDevices: async () => [input('abc')] });
    const r = await acquireMic(d, () => false);
    expect(r.ok).toBe(true);
    expect(gum.mock.calls[1]).toEqual([MIC_CONSTRAINTS.bare]);
  });

  test('denied by the OS is its own kind', async () => {
    const { d } = deps({ getUserMedia: async () => { throw domErr('NotAllowedError', 'Permission denied by system'); } });
    expect(await acquireMic(d, () => false)).toMatchObject({ ok: false, kind: 'system_denied' });
  });

  test('the hang guard only runs once permission is granted, and stops a stream that arrives late', async () => {
    jest.useFakeTimers();
    try {
      const { stream, track } = fakeStream();
      let resolve!: (s: MediaStream) => void;
      const gum = jest.fn(() => new Promise<MediaStream>((r) => { resolve = r; }));
      const { d } = deps({ getUserMedia: gum, queryPermission: async () => 'granted' });
      const p = acquireMic(d, () => false, { hangTimeoutMs: 15_000 });
      await jest.advanceTimersByTimeAsync(15_000);
      expect(await p).toMatchObject({ ok: false, kind: 'timeout', name: 'TimeoutError', permission: 'granted' });
      resolve(stream);
      await jest.advanceTimersByTimeAsync(0);
      expect(track.stop).toHaveBeenCalled();

      // With a prompt possibly on screen ('prompt'), no timeout ever fires.
      const pending = jest.fn(() => new Promise<MediaStream>(() => {}));
      const settled = jest.fn();
      void acquireMic(deps({ getUserMedia: pending, queryPermission: async () => 'prompt' }).d, () => false, { hangTimeoutMs: 15_000 }).then(settled);
      await jest.advanceTimersByTimeAsync(60_000);
      expect(settled).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  test('cancelled during the busy back-off: no further request, and a late stream is stopped', async () => {
    let cancelled = false;
    const gum = jest.fn(async () => { throw domErr('NotReadableError'); });
    const { d } = deps({ getUserMedia: gum, sleep: async () => { cancelled = true; } });
    const r = await acquireMic(d, () => cancelled);
    expect(r).toMatchObject({ ok: false, cancelled: true });
    expect(gum).toHaveBeenCalledTimes(1);

    const { stream, track } = fakeStream();
    let resolve!: (s: MediaStream) => void;
    let stop = false;
    const p = acquireMic(deps({ getUserMedia: () => new Promise((r) => { resolve = r; }) }).d, () => stop);
    stop = true;
    resolve(stream);
    expect(await p).toMatchObject({ ok: false, cancelled: true });
    expect(track.stop).toHaveBeenCalled();
  });

  test('a primed request stands in for the first rung; its failure continues the ladder', async () => {
    const primedOk = fakeStream();
    const { d } = deps();
    const ok = await acquireMic(d, () => false, { initial: Promise.resolve(primedOk.stream) });
    expect(ok.ok && ok.stream).toBe(primedOk.stream);
    expect(d.getUserMedia).not.toHaveBeenCalled();

    const gum = jest.fn(async () => fakeStream().stream);
    const { d: d2, sleeps } = deps({ getUserMedia: gum });
    const r = await acquireMic(d2, () => false, { initial: Promise.reject(domErr('NotReadableError')) });
    expect(r.ok).toBe(true);
    expect(sleeps).toEqual([400]);
    expect(gum).toHaveBeenCalledWith(MIC_CONSTRAINTS.bare);
    expect(r.attempts.map((a) => a.step)).toEqual(['full', 'retry1']);
  });

  test('a cancelled acquisition stops the primed stream it never used', async () => {
    const primed = fakeStream();
    const { d } = deps({ queryPermission: async () => 'granted' });
    const r = await acquireMic(d, () => true, { initial: Promise.resolve(primed.stream) });
    expect(r).toMatchObject({ ok: false, cancelled: true });
    await Promise.resolve();
    expect(primed.track.stop).toHaveBeenCalled();
  });
});
