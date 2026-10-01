/**
 * @jest-environment jsdom
 *
 * TwinCapture as a person meets it, with the camera, microphone, canvas and storage faked: consent gates everything,
 * 3-2-1 takes the photo, a blocked or missing camera falls back to an upload, the voice step reads the server's digits
 * with a 12 s minimum and a 30 s auto-stop, a double tap never opens a second mic, Save PUTs straight to storage and
 * commits with the consent record — and closing releases every device.
 */
const mockUpload = jest.fn(async (..._args: unknown[]) => ({ data: { path: 'p' }, error: null as null | { message: string } }));
jest.mock('../../lib/supabase/browser', () => ({
  createBrowserClient: () => ({ storage: { from: (bucket: string) => ({ uploadToSignedUrl: (...a: unknown[]) => mockUpload(bucket, ...a) }) } }),
}));

import { act, fireEvent, render, screen } from '@testing-library/react';
import TwinCapture from './TwinCapture';
import { TWIN_CONSENT } from '@/lib/legal/content';

// ── device fakes ──────────────────────────────────────────────────────────────────────────────────────────────────
type Track = { stop: jest.Mock; kind: string };
let tracks: Track[] = [];
function fakeStream(kind: string): MediaStream {
  const tr: Track = { stop: jest.fn(), kind };
  tracks.push(tr);
  return { getTracks: () => [tr] } as unknown as MediaStream;
}
let gum: jest.Mock;

class FakeRecorder {
  static instances: FakeRecorder[] = [];
  static isTypeSupported = (t: string) => t === 'audio/webm;codecs=opus';
  state: 'inactive' | 'recording' = 'inactive';
  mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(_s: MediaStream, opts?: { mimeType?: string }) {
    this.mimeType = opts?.mimeType ?? '';
    FakeRecorder.instances.push(this);
  }
  start = jest.fn(() => { this.state = 'recording'; });
  stop = jest.fn(() => {
    if (this.state === 'inactive') return;
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob([new Uint8Array(30_000)], { type: this.mimeType }) });
    this.onstop?.();
  });
}

class FakeAudioContext {
  createAnalyser() { return { fftSize: 1024, getByteTimeDomainData: (b: Uint8Array) => b.fill(170) }; }
  createMediaStreamSource() { return { connect: jest.fn() }; }
  close = jest.fn(async () => undefined);
}

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 900;
  naturalHeight = 1200;
  set src(_v: string) { void Promise.resolve().then(() => this.onload?.()); }
}

// ── network fakes ─────────────────────────────────────────────────────────────────────────────────────────────────
const UPLOADS = {
  front: { path: 'twins/u/staging/front.jpg', token: 't-front' },
  left: { path: 'twins/u/staging/left.jpg', token: 't-left' },
  right: { path: 'twins/u/staging/right.jpg', token: 't-right' },
  voice: { path: 'twins/u/staging/voice.webm', token: 't-voice' },
};
/** A minimal fetch Response (jsdom has no Response class): only what the component reads. */
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
let fetchMock: jest.Mock;
const callsTo = (url: string) => fetchMock.mock.calls.filter(([u]) => u === url);
const bodyOf = (url: string, i = 0) => JSON.parse(String((callsTo(url)[i]![1] as RequestInit).body));

let urlN = 0;
beforeAll(() => {
  // Browsers have had AbortSignal.timeout since 2022; give jsdom one if it lacks it (the component bounds every call).
  const AS = AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal };
  if (typeof AS.timeout !== 'function') AS.timeout = () => new AbortController().signal;
});
beforeEach(() => {
  tracks = [];
  FakeRecorder.instances = [];
  mockUpload.mockClear();
  gum = jest.fn(async (c: MediaStreamConstraints) => fakeStream(c.video ? 'video' : 'audio'));
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: gum } });
  (globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeRecorder;
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
  (globalThis as unknown as { Image: unknown }).Image = FakeImage;
  URL.createObjectURL = jest.fn(() => `blob:fake/${(urlN += 1)}`);
  URL.revokeObjectURL = jest.fn();
  jest.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async () => undefined);
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 1280 });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 720 });
  HTMLCanvasElement.prototype.getContext = jest.fn(() => ({ drawImage: jest.fn() })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.toBlob = function toBlob(cb: BlobCallback) { cb(new Blob([new Uint8Array(5_000)], { type: 'image/jpeg' })); };
  fetchMock = jest.fn(async (url: string) => {
    if (url === '/api/twin/upload-url') return json(200, { bucket: 'twins', uploads: UPLOADS, digits: '40917263', ticket: 'tw1.ticket.sig', expiresAt: '2026-10-02T12:00:00.000Z' });
    if (url === '/api/twin/commit') return json(200, { ok: true, committedAt: '2026-10-02T10:00:00.000Z', hasVoice: true });
    if (url === '/api/twin') return json(200, { status: 'none' });
    return json(404, {});
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const flush = () => act(async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); });

async function agreeAndBegin() {
  fireEvent.click(screen.getByTestId('twin-consent-agree'));
  await act(async () => { fireEvent.click(screen.getByTestId('twin-continue')); });
  await flush();
}

/** Take the current slot's photo through the upload fallback (no timers involved). */
async function uploadPhoto() {
  await act(async () => {
    fireEvent.change(screen.getByTestId('twin-photo-input'), { target: { files: [new File(['x'], 'me.jpg', { type: 'image/jpeg' })] } });
  });
  await flush();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Use this photo' })); });
  await flush();
}

describe('consent comes first', () => {
  test.each(['ka', 'en', 'ru'] as const)('(%s) the consent text, marked as a draft, and nothing starts until the box is ticked', async (locale) => {
    render(<TwinCapture locale={locale} onClose={jest.fn()} handoffToken="tok" />);
    expect(screen.getByText(TWIN_CONSENT.title[locale])).toBeTruthy();
    for (const p of TWIN_CONSENT.points[locale]) expect(screen.getByText(p)).toBeTruthy();
    expect(screen.getByTestId('twin-consent-draft').textContent).toBe(TWIN_CONSENT.draftNotice[locale]);
    const go = screen.getByTestId('twin-continue') as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    fireEvent.click(screen.getByTestId('twin-consent-agree'));
    expect(go.disabled).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled(); // the phone has no session: no GET /api/twin either
  });

  test('Continue asks for the uploads — photo types, the recordable voice type, and the phone link', async () => {
    render(<TwinCapture locale="en" onClose={jest.fn()} handoffToken="tok" />);
    await agreeAndBegin();
    expect(bodyOf('/api/twin/upload-url')).toEqual({
      slots: { front: 'image/jpeg', left: 'image/jpeg', right: 'image/jpeg', voice: 'audio/webm;codecs=opus' },
      handoffToken: 'tok',
    });
    expect(screen.getByTestId('twin-step').textContent).toBe('1/5 · Front');
  });

  test('a spent or expired phone link says so on the consent screen', async () => {
    fetchMock.mockImplementationOnce(async () => json(401, { error: 'link_already_used' }));
    render(<TwinCapture locale="en" onClose={jest.fn()} handoffToken="tok" />);
    await agreeAndBegin();
    expect(screen.getByRole('alert').textContent).toMatch(/already used or has expired/);
    expect(screen.getByTestId('twin-consent')).toBeTruthy();
  });
});

describe('photos — oval, 3-2-1, and graceful fallbacks', () => {
  test('3-2-1 then the shot; the camera is released once the preview shows', async () => {
    jest.useFakeTimers();
    render(<TwinCapture locale="en" onClose={jest.fn()} handoffToken="tok" />);
    await agreeAndBegin();
    await flush();
    expect(gum).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('twin-capture'));
    expect(screen.getByText('3')).toBeTruthy();
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(screen.getByText('2')).toBeTruthy();
    await act(async () => { jest.advanceTimersByTime(2000); });
    await flush();
    expect(screen.getByRole('img', { name: 'Front' })).toBeTruthy();
    expect(tracks.find((t) => t.kind === 'video')!.stop).toHaveBeenCalled();
  });

  test('camera blocked → it says so, and an uploaded photo still works', async () => {
    gum.mockRejectedValue(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
    render(<TwinCapture locale="en" onClose={jest.fn()} handoffToken="tok" />);
    await agreeAndBegin();
    await flush();
    expect(screen.getByTestId('twin-camera-error').textContent).toMatch(/Camera access is blocked/);
    await uploadPhoto();
    expect(screen.getByTestId('twin-step').textContent).toBe('2/5 · Left');
  });

  test('no camera API at all → "upload a photo instead"', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    render(<TwinCapture locale="en" onClose={jest.fn()} handoffToken="tok" />);
    await agreeAndBegin();
    await flush();
    expect(screen.getByTestId('twin-camera-error').textContent).toMatch(/No camera found/);
  });
});

describe('voice — the server’s digits, a 12 s minimum, a 30 s auto-stop', () => {
  async function toVoiceStep() {
    render(<TwinCapture locale="en" onClose={jest.fn()} handoffToken="tok" />);
    await agreeAndBegin();
    for (let i = 0; i < 3; i += 1) await uploadPhoto();
    expect(screen.getByTestId('twin-step').textContent).toBe('4/5 · Voice');
  }

  test('digits shown in two groups; Stop locked until 12 s; the recorder stops itself at 30 s', async () => {
    await toVoiceStep();
    expect(screen.getByTestId('twin-digits').textContent).toBe('4091 7263');
    jest.useFakeTimers();
    await act(async () => { fireEvent.click(screen.getByTestId('twin-record')); });
    await flush();
    const rec = FakeRecorder.instances[0]!;
    expect(rec.mimeType).toBe('audio/webm;codecs=opus');
    const stop = () => screen.getByTestId('twin-stop') as HTMLButtonElement;
    expect(stop().disabled).toBe(true);
    expect(stop().textContent).toMatch(/Keep talking/);
    await act(async () => { jest.advanceTimersByTime(12_100); });
    expect(stop().disabled).toBe(false);
    expect(rec.stop).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(18_000); });
    expect(rec.stop).toHaveBeenCalled();
    expect(screen.getByTestId('twin-voice-done').textContent).toMatch(/Voice recorded · 30 s/);
    expect(tracks.filter((t) => t.kind === 'audio').every((t) => t.stop.mock.calls.length > 0)).toBe(true);
  });

  test('a double tap on Record opens ONE microphone', async () => {
    await toVoiceStep();
    await act(async () => {
      fireEvent.click(screen.getByTestId('twin-record'));
      fireEvent.click(screen.getByTestId('twin-record'));
    });
    await flush();
    expect(gum.mock.calls.filter(([c]) => (c as MediaStreamConstraints).audio)).toHaveLength(1);
    expect(FakeRecorder.instances).toHaveLength(1);
  });

  test('mic blocked → it says so and offers to continue without a voice sample', async () => {
    await toVoiceStep();
    gum.mockRejectedValueOnce(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
    await act(async () => { fireEvent.click(screen.getByTestId('twin-record')); });
    await flush();
    expect(screen.getByRole('alert').textContent).toMatch(/Microphone access is blocked/);
    await act(async () => { fireEvent.click(screen.getByTestId('twin-skip-voice')); });
    expect(screen.getByTestId('twin-review').textContent).toMatch(/No voice sample/);
  });
});

describe('save — straight to storage, then the commit with the consent record', () => {
  async function captureAll() {
    await agreeAndBegin();
    for (let i = 0; i < 3; i += 1) await uploadPhoto();
    jest.useFakeTimers();
    await act(async () => { fireEvent.click(screen.getByTestId('twin-record')); });
    await flush();
    await act(async () => { jest.advanceTimersByTime(14_000); });
    await act(async () => { fireEvent.click(screen.getByTestId('twin-stop')); });
    jest.useRealTimers();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Next' })); });
  }

  test('every file is PUT through its own signed URL; the commit carries the ticket, the consent record and the link', async () => {
    render(<TwinCapture locale="en" onClose={jest.fn()} handoffToken="tok" />);
    await captureAll();
    await act(async () => { fireEvent.click(screen.getByTestId('twin-save')); });
    await flush();
    expect(mockUpload.mock.calls.map(([bucket, path, token, , opts]) => [bucket, path, token, opts])).toEqual([
      ['twins', UPLOADS.front.path, 't-front', { contentType: 'image/jpeg', upsert: true }],
      ['twins', UPLOADS.left.path, 't-left', { contentType: 'image/jpeg', upsert: true }],
      ['twins', UPLOADS.right.path, 't-right', { contentType: 'image/jpeg', upsert: true }],
      ['twins', UPLOADS.voice.path, 't-voice', { contentType: 'audio/webm;codecs=opus', upsert: true }],
    ]);
    expect(bodyOf('/api/twin/commit')).toEqual({
      ticket: 'tw1.ticket.sig',
      consent: { version: TWIN_CONSENT.version, acceptedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/) },
      voiceSeconds: 14,
      handoffToken: 'tok',
    });
    expect(screen.getByTestId('twin-done').textContent).toMatch(/Return to your computer/);
  });

  test('a photo the server refuses sends the person back to exactly that shot', async () => {
    render(<TwinCapture locale="en" onClose={jest.fn()} handoffToken="tok" />);
    await captureAll();
    fetchMock.mockImplementationOnce(async () => json(415, { error: 'content_mismatch', slot: 'left' }));
    await act(async () => { fireEvent.click(screen.getByTestId('twin-save')); });
    await flush();
    expect(screen.getByTestId('twin-step').textContent).toBe('2/5 · Left');
    expect(screen.getByRole('alert').textContent).toMatch(/left photo could not be used/);
    expect(screen.getByTestId('twin-capture')).toBeTruthy(); // the refused shot is gone: the live view is back
  });

  test('a failed upload never commits', async () => {
    render(<TwinCapture locale="en" onClose={jest.fn()} handoffToken="tok" />);
    await captureAll();
    mockUpload.mockResolvedValueOnce({ data: null as never, error: { message: 'boom' } });
    await act(async () => { fireEvent.click(screen.getByTestId('twin-save')); });
    await flush();
    expect(callsTo('/api/twin/commit')).toHaveLength(0);
    expect(screen.getByRole('alert').textContent).toMatch(/Could not save/);
  });
});

describe('desktop extras and cleanup', () => {
  test('an existing twin can be deleted (after a confirmation)', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/twin' && init?.method === 'DELETE') return json(200, { ok: true, removed: { twins: 5, legacy: 1 } });
      if (url === '/api/twin') return json(200, { status: 'ready', committedAt: '2026-09-30T10:00:00.000Z', consentVersion: 'v', voiceVerified: false, expiresIn: 900, urls: {} });
      return json(404, {});
    });
    render(<TwinCapture locale="en" onClose={jest.fn()} />);
    await flush();
    expect(screen.getByTestId('twin-existing').textContent).toMatch(/You already have a twin/);
    fireEvent.click(screen.getByRole('button', { name: 'Delete my twin' }));
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'DELETE')).toBe(false);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Delete' })); });
    await flush();
    expect(fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'DELETE')).toHaveLength(1);
    expect(screen.getByRole('status').textContent).toBe('Your twin was deleted.');
    expect(screen.queryByTestId('twin-existing')).toBeNull();
  });

  test('closing mid-capture releases the camera', async () => {
    const { unmount } = render(<TwinCapture locale="en" onClose={jest.fn()} handoffToken="tok" />);
    await agreeAndBegin();
    await flush();
    const cam = tracks.find((t) => t.kind === 'video')!;
    expect(cam.stop).not.toHaveBeenCalled();
    unmount();
    expect(cam.stop).toHaveBeenCalled();
  });

  test('a camera that answers after the live view ended (a photo was uploaded meanwhile) is stopped, not left hot', async () => {
    let resolve!: (s: MediaStream) => void;
    gum.mockImplementationOnce(() => new Promise<MediaStream>((r) => { resolve = r; }));
    render(<TwinCapture locale="en" onClose={jest.fn()} handoffToken="tok" />);
    await agreeAndBegin();
    await act(async () => {
      fireEvent.change(screen.getByTestId('twin-photo-input'), { target: { files: [new File(['x'], 'me.jpg', { type: 'image/jpeg' })] } });
    });
    await flush();
    expect(screen.getByRole('img', { name: 'Front' })).toBeTruthy();
    await act(async () => { resolve(fakeStream('video')); });
    await flush();
    expect(tracks.at(-1)!.stop).toHaveBeenCalled();
  });

  test('a camera that answers AFTER close is stopped at once (no orphaned hot camera)', async () => {
    let resolve!: (s: MediaStream) => void;
    gum.mockImplementationOnce(() => new Promise<MediaStream>((r) => { resolve = r; }));
    const { unmount } = render(<TwinCapture locale="en" onClose={jest.fn()} handoffToken="tok" />);
    await agreeAndBegin();
    unmount();
    const late = fakeStream('video');
    await act(async () => { resolve(late); });
    await flush();
    expect(tracks.at(-1)!.stop).toHaveBeenCalled();
  });
});
