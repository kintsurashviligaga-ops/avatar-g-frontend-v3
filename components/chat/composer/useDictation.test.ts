/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import {
  MAX_RECORD_SEC,
  SILENCE_HOLD_MS,
  TICK_MS,
  WAV_SAMPLE_RATE,
  buildWavBytes,
  concatInt16,
  dictationWarning,
  downsampleTo16k,
  isAppleSpeechEngine,
  speechLangFor,
  useDictation,
  type CaptureFactory,
  type DictationDeps,
  type SREvent,
  type SpeechRecognitionLike,
  type UseDictationOptions,
} from './useDictation';

// ─── Fakes ───────────────────────────────────────────────────────────────────────────────────────────────

const CHROME_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
const SAFARI_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0 Mobile/15E148 Safari/604.1';

class FakeSR implements SpeechRecognitionLike {
  static instances: FakeSR[] = [];
  lang = '';
  continuous = false;
  interimResults = false;
  onresult: ((e: SREvent) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: { error?: string }) => void) | null = null;
  onspeechstart: (() => void) | null = null;
  start = jest.fn();
  // Like the browser, stop() ends the session (here synchronously).
  stop = jest.fn(() => { this.onend?.(); });
  constructor() { FakeSR.instances.push(this); }
  emit(text: string, isFinal = true) {
    const results = { length: 1, 0: { isFinal, length: 1, 0: { transcript: text } } };
    this.onresult?.({ resultIndex: 0, results } as unknown as SREvent);
  }
}

/** jsdom has no `Response`; the hook reads ok/status/json(). */
const jsonRes = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

function fakeStream() {
  const track = { stop: jest.fn() };
  return { stream: { getTracks: () => [track] } as unknown as MediaStream, track };
}

function fakeCapture(bytes = 20_000) {
  const blob = new Blob([new Uint8Array(bytes)], { type: 'audio/wav' });
  const state = { onLevel: null as null | ((rms: number) => void), finished: 0, seconds: 1, snapshots: 0 };
  const factory: CaptureFactory = async (_stream, onLevel) => {
    state.onLevel = onLevel;
    return {
      engine: 'wav',
      mimeType: 'audio/wav',
      minBytes: 100,
      seconds: () => state.seconds,
      snapshot: () => { state.snapshots += 1; return blob; },
      finish: async () => { state.finished += 1; return blob; },
    };
  };
  return { factory, state, blob };
}

interface HarnessOpts extends Partial<Omit<UseDictationOptions, 'deps' | 'value' | 'setValue'>> {
  initial?: string;
  deps?: Partial<DictationDeps>;
}

function harness(opts: HarnessOpts = {}) {
  const { initial = '', deps = {}, ...rest } = opts;
  const { stream, track } = fakeStream();
  const getUserMedia = jest.fn(async () => stream);
  const fetchMock = jest.fn(async (..._args: unknown[]) => jsonRes({ text: 'გამარჯობა' }));
  const onAuthRequired = jest.fn();
  let now = 0;
  const cap = fakeCapture();
  const allDeps: Partial<DictationDeps> = {
    speechRecognition: () => FakeSR,
    userAgent: () => CHROME_UA,
    getUserMedia,
    captureFactories: [cap.factory],
    fetch: fetchMock as unknown as typeof fetch,
    now: () => now,
    isGuest: () => false,
    ...deps,
  };
  const hook = renderHook(() => {
    const [value, setValue] = useState(initial);
    const d = useDictation({ locale: 'ka', value, setValue, onAuthRequired, deps: allDeps, ...rest });
    return { value, setValue, d };
  });
  return { ...hook, getUserMedia, fetchMock, onAuthRequired, track, cap, setNow: (t: number) => { now = t; } };
}

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

beforeEach(() => { FakeSR.instances = []; });
afterEach(() => { jest.useRealTimers(); delete document.documentElement.dataset.authed; });

// ─── Pure helpers ────────────────────────────────────────────────────────────────────────────────────────

describe('pure helpers', () => {
  test('speechLangFor maps the UI locale (Georgian by default)', () => {
    expect(speechLangFor('ka')).toBe('ka-GE');
    expect(speechLangFor('en')).toBe('en-US');
    expect(speechLangFor('ru')).toBe('ru-RU');
    expect(speechLangFor(undefined)).toBe('ka-GE');
  });

  test('isAppleSpeechEngine is about the ENGINE: iOS (any browser) and macOS Safari, not Chrome', () => {
    expect(isAppleSpeechEngine(IPHONE_UA)).toBe(true);
    expect(isAppleSpeechEngine(SAFARI_UA)).toBe(true);
    expect(isAppleSpeechEngine(CHROME_UA)).toBe(false);
  });

  test('buildWavBytes writes a valid 16 kHz mono 16-bit RIFF header', () => {
    const pcm = new Int16Array([0, 1000, -1000, 32767, -32768]);
    const bytes = buildWavBytes(pcm, WAV_SAMPLE_RATE);
    const v = new DataView(bytes.buffer);
    const str = (o: number, n: number) => String.fromCharCode(...Array.from(bytes.subarray(o, o + n)));
    expect(bytes.length).toBe(44 + pcm.length * 2);
    expect(str(0, 4)).toBe('RIFF');
    expect(v.getUint32(4, true)).toBe(36 + pcm.length * 2);
    expect(str(8, 4)).toBe('WAVE');
    expect(str(12, 4)).toBe('fmt ');
    expect(v.getUint16(20, true)).toBe(1); // PCM
    expect(v.getUint16(22, true)).toBe(1); // mono
    expect(v.getUint32(24, true)).toBe(16000);
    expect(v.getUint32(28, true)).toBe(32000);
    expect(v.getUint16(34, true)).toBe(16);
    expect(str(36, 4)).toBe('data');
    expect(v.getUint32(40, true)).toBe(pcm.length * 2);
    expect(v.getInt16(44 + 3 * 2, true)).toBe(32767);
    expect(v.getInt16(44 + 4 * 2, true)).toBe(-32768);
  });

  test('downsampleTo16k averages each window (48 kHz → 16 kHz = 3:1)', () => {
    const input = new Int16Array([3, 6, 9, 30, 60, 90, 0, 0, 0]);
    expect(Array.from(downsampleTo16k(input, 48000))).toEqual([6, 60, 0]);
    // 44.1 kHz: a non-integer ratio still yields the right length.
    expect(downsampleTo16k(new Int16Array(44100), 44100).length).toBe(16000);
    // Already 16 kHz: untouched.
    const same = new Int16Array([1, 2]);
    expect(downsampleTo16k(same, 16000)).toBe(same);
  });

  test('concatInt16 joins frames', () => {
    expect(Array.from(concatInt16([new Int16Array([1, 2]), new Int16Array([3])]))).toEqual([1, 2, 3]);
  });

  test('warnings are localized', () => {
    expect(dictationWarning('transcription', 'en')).toMatch(/not responding/);
    expect(dictationWarning('mic', 'ru')).toMatch(/микрофон/);
    expect(dictationWarning('transcription', 'ka')).toMatch(/ტრანსკრიფცია/);
  });
});

// ─── Guests ──────────────────────────────────────────────────────────────────────────────────────────────

describe('guests', () => {
  test('authed=false: onAuthRequired instead of recording', async () => {
    const h = harness({ authed: false });
    await act(async () => { await h.result.current.d.toggle(); });
    expect(h.onAuthRequired).toHaveBeenCalledTimes(1);
    expect(h.getUserMedia).not.toHaveBeenCalled();
    expect(FakeSR.instances).toHaveLength(0);
    expect(h.result.current.d.recording).toBe(false);
  });

  test('without `authed`, <html data-authed="0"> (ChatChrome\'s flag) means guest', async () => {
    document.documentElement.dataset.authed = '0';
    // `isGuest: undefined` = use the hook's default, which reads the DOM flag.
    const h = harness({ deps: { isGuest: undefined } });
    await act(async () => { await h.result.current.d.toggle(); });
    expect(h.onAuthRequired).toHaveBeenCalled();
    expect(FakeSR.instances).toHaveLength(0);
  });
});

// ─── Web Speech ──────────────────────────────────────────────────────────────────────────────────────────

describe('Web Speech path (Chrome)', () => {
  test('streams text after the existing box text, tags the input as voice, and never sends', async () => {
    const h = harness({ initial: 'მოკლედ' });
    await act(async () => { await h.result.current.d.toggle(); });
    const sr = FakeSR.instances[0]!;
    expect(sr.lang).toBe('ka-GE');
    expect(sr.continuous).toBe(true);
    expect(sr.interimResults).toBe(true);
    expect(sr.start).toHaveBeenCalledTimes(1);
    expect(h.result.current.d.recording).toBe(true);
    expect(h.result.current.d.engine).toBe('webspeech');

    act(() => sr.emit('გამარჯობა', false));
    expect(h.result.current.value).toBe('მოკლედ გამარჯობა');
    act(() => sr.emit('გამარჯობა სამყარო'));
    expect(h.result.current.value).toBe('მოკლედ გამარჯობა სამყარო');
    expect(h.result.current.d.inputSourceRef.current).toBe('voice');
    expect(h.getUserMedia).not.toHaveBeenCalled();
  });

  test("Chrome's own onend restarts; the user's stop does not", async () => {
    const h = harness();
    await act(async () => { await h.result.current.d.toggle(); });
    const sr = FakeSR.instances[0]!;
    act(() => { sr.onend?.(); });
    expect(sr.start).toHaveBeenCalledTimes(2);
    expect(h.result.current.d.recording).toBe(true);
    await act(async () => { await h.result.current.d.toggle(); });
    expect(sr.stop).toHaveBeenCalled();
    expect(sr.start).toHaveBeenCalledTimes(2);
    expect(h.result.current.d.recording).toBe(false);
  });

  test("'no-speech' is not fatal", async () => {
    const h = harness();
    await act(async () => { await h.result.current.d.toggle(); });
    act(() => FakeSR.instances[0]!.onerror?.({ error: 'no-speech' }));
    expect(h.result.current.d.recording).toBe(true);
    expect(h.getUserMedia).not.toHaveBeenCalled();
  });

  test("'language-not-supported' falls to the recorder and is remembered for the session", async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const h = harness();
    await act(async () => { await h.result.current.d.toggle(); });
    await act(async () => { FakeSR.instances[0]!.onerror?.({ error: 'language-not-supported' }); await flush(); });
    expect(h.getUserMedia).toHaveBeenCalledTimes(1);
    expect(h.result.current.d.engine).toBe('wav');
    await act(async () => { h.result.current.d.stop(); await flush(); });
    // Next dictation: straight to the recorder, no second Web Speech attempt.
    await act(async () => { await h.result.current.d.toggle(); await flush(); });
    expect(FakeSR.instances).toHaveLength(1);
    expect(h.getUserMedia).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('lang=ka-GE (language-not-supported)'));
    warn.mockRestore();
  });

  test('a silent engine falls to the recorder after the 8 s watchdog', async () => {
    jest.useFakeTimers();
    const h = harness();
    await act(async () => { await h.result.current.d.toggle(); });
    expect(h.getUserMedia).not.toHaveBeenCalled();
    await act(async () => { await jest.advanceTimersByTimeAsync(8000); });
    expect(h.getUserMedia).toHaveBeenCalledTimes(1);
    expect(h.result.current.d.engine).toBe('wav');
  });

  test('after onspeechstart the watchdog is 2.5 s', async () => {
    jest.useFakeTimers();
    const h = harness();
    await act(async () => { await h.result.current.d.toggle(); });
    act(() => FakeSR.instances[0]!.onspeechstart?.());
    await act(async () => { await jest.advanceTimersByTimeAsync(2600); });
    expect(h.getUserMedia).toHaveBeenCalledTimes(1);
  });

  test('stopEcho stops the recognizer for good (no restart) and blurs the box', async () => {
    const blur = jest.fn();
    const textareaRef = { current: { blur } as unknown as HTMLTextAreaElement };
    const h = harness({ textareaRef });
    await act(async () => { await h.result.current.d.toggle(); });
    const sr = FakeSR.instances[0]!;
    act(() => sr.emit('გაგზავნე'));
    act(() => h.result.current.d.stopEcho());
    expect(sr.stop).toHaveBeenCalled();
    expect(sr.start).toHaveBeenCalledTimes(1); // onend did NOT restart it
    expect(blur).toHaveBeenCalled();
    expect(h.result.current.d.recording).toBe(false);
    // A late result from the dying session is discarded.
    act(() => { h.result.current.setValue(''); });
    act(() => sr.emit('გვიან'));
    expect(h.result.current.value).toBe('');
  });
});

// ─── Recorder path ───────────────────────────────────────────────────────────────────────────────────────

describe('recorder path (WAV)', () => {
  test('Apple engine + Georgian skips Web Speech and records', async () => {
    const h = harness({ deps: { userAgent: () => IPHONE_UA } });
    await act(async () => { await h.result.current.d.toggle(); await flush(); });
    expect(FakeSR.instances).toHaveLength(0);
    expect(h.getUserMedia).toHaveBeenCalledTimes(1);
    expect(h.result.current.d.engine).toBe('wav');
  });

  test('Apple engine + English keeps Web Speech', async () => {
    const h = harness({ locale: 'en', deps: { userAgent: () => SAFARI_UA } });
    await act(async () => { await h.result.current.d.toggle(); });
    expect(FakeSR.instances[0]!.lang).toBe('en-US');
  });

  test('Stop runs one final pass: POSTs clip.wav (audio/wav) + language, fills the box, does not send', async () => {
    const h = harness({ initial: 'ტექსტი', deps: { speechRecognition: () => undefined } });
    await act(async () => { await h.result.current.d.toggle(); await flush(); });
    expect(h.result.current.d.recording).toBe(true);
    expect(h.getUserMedia).toHaveBeenCalledWith({ audio: expect.objectContaining({ channelCount: 1, echoCancellation: true }) });

    await act(async () => { h.result.current.d.stop(); await flush(); });
    expect(h.cap.state.finished).toBe(1);
    expect(h.track.stop).toHaveBeenCalled();
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = h.fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/voice/transcribe');
    expect(init.method).toBe('POST');
    const fd = init.body as FormData;
    const audio = fd.get('audio') as File;
    expect(audio.name).toBe('clip.wav');
    expect(audio.type).toBe('audio/wav');
    expect(fd.get('language')).toBe('ka-GE');

    expect(h.result.current.value).toBe('ტექსტი გამარჯობა');
    expect(h.result.current.d.inputSourceRef.current).toBe('voice');
    expect(h.result.current.d.recording).toBe(false);
    expect(h.result.current.d.transcribing).toBe(false);
  });

  test('interim passes run on the tick cadence and stream text in', async () => {
    jest.useFakeTimers();
    const h = harness({ deps: { speechRecognition: () => undefined } });
    await act(async () => { await h.result.current.d.toggle(); });
    await act(async () => { await jest.advanceTimersByTimeAsync(TICK_MS); });
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
    expect(h.result.current.value).toBe('გამარჯობა');
    await act(async () => { await jest.advanceTimersByTimeAsync(TICK_MS); });
    expect(h.fetchMock).toHaveBeenCalledTimes(2); // shouldRunInterim(2, 1)
  });

  test('two failed passes (a 429 counts) show the warning', async () => {
    jest.useFakeTimers();
    const fetchMock = jest.fn(async () => jsonRes({ error: 'rate limited' }, 429));
    const h = harness({ locale: 'en', deps: { speechRecognition: () => undefined, fetch: fetchMock as unknown as typeof fetch } });
    await act(async () => { await h.result.current.d.toggle(); });
    await act(async () => { await jest.advanceTimersByTimeAsync(TICK_MS); });
    expect(h.result.current.d.warn).toBeNull();
    await act(async () => { await jest.advanceTimersByTimeAsync(TICK_MS); });
    expect(h.result.current.d.warn).toMatch(/not responding/);
  });

  test('a 401 asks for sign-in and stops recording', async () => {
    jest.useFakeTimers();
    const fetchMock = jest.fn(async () => jsonRes({ error: 'auth_required' }, 401));
    const h = harness({ deps: { speechRecognition: () => undefined, fetch: fetchMock as unknown as typeof fetch } });
    await act(async () => { await h.result.current.d.toggle(); });
    await act(async () => { await jest.advanceTimersByTimeAsync(TICK_MS); });
    expect(h.onAuthRequired).toHaveBeenCalled();
    expect(h.result.current.d.recording).toBe(false);
    expect(h.result.current.d.warn).toBeNull();
  });

  test('stopEcho during the final pass: the late transcript does not re-fill the emptied box', async () => {
    let resolveFetch!: (r: Response) => void;
    const fetchMock = jest.fn(() => new Promise<Response>((r) => { resolveFetch = r; }));
    const h = harness({ deps: { speechRecognition: () => undefined, fetch: fetchMock as unknown as typeof fetch } });
    await act(async () => { await h.result.current.d.toggle(); await flush(); });
    await act(async () => { h.result.current.d.stop(); await flush(); });
    expect(h.result.current.d.transcribing).toBe(true);
    // The user sends: the parent clears the box and calls stopEcho().
    act(() => { h.result.current.setValue(''); h.result.current.d.stopEcho(); });
    await act(async () => { resolveFetch(jsonRes({ text: 'გვიანი ტექსტი' })); await flush(); });
    expect(h.result.current.value).toBe('');
    expect(h.result.current.d.transcribing).toBe(false);
  });

  test('a keyboard edit after the last write wins over a late pass', async () => {
    let resolveFetch!: (r: Response) => void;
    const fetchMock = jest.fn(() => new Promise<Response>((r) => { resolveFetch = r; }));
    const h = harness({ initial: 'ა', deps: { speechRecognition: () => undefined, fetch: fetchMock as unknown as typeof fetch } });
    await act(async () => { await h.result.current.d.toggle(); await flush(); });
    await act(async () => { h.result.current.d.stop(); await flush(); });
    act(() => { h.result.current.setValue('ჩემი ჩასწორება'); h.result.current.d.markTyped(); });
    await act(async () => { resolveFetch(jsonRes({ text: 'ნაკარნახევი' })); await flush(); });
    expect(h.result.current.value).toBe('ჩემი ჩასწორება');
    expect(h.result.current.d.inputSourceRef.current).toBe('text');
  });

  test('silence after speech stops the recorder by itself (then the final pass)', async () => {
    const h = harness({ deps: { speechRecognition: () => undefined } });
    await act(async () => { await h.result.current.d.toggle(); await flush(); });
    const level = h.cap.state.onLevel!;
    await act(async () => {
      h.setNow(0); level(0.2); // speaking
      h.setNow(100); level(0.001); // quiet starts
      h.setNow(100 + SILENCE_HOLD_MS + 1); level(0.001);
      await flush();
    });
    expect(h.result.current.d.recording).toBe(false);
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
  });

  test(`the clip stops itself at ${MAX_RECORD_SEC} s (WAV size vs the request ceiling)`, async () => {
    jest.useFakeTimers();
    const h = harness({ deps: { speechRecognition: () => undefined } });
    await act(async () => { await h.result.current.d.toggle(); });
    h.cap.state.seconds = MAX_RECORD_SEC;
    await act(async () => { await jest.advanceTimersByTimeAsync(TICK_MS); });
    expect(h.result.current.d.recording).toBe(false);
    expect(h.cap.state.finished).toBe(1);
  });

  test('a blocked mic reverts the UI and says why', async () => {
    const getUserMedia = jest.fn(async () => { throw Object.assign(new Error('denied'), { name: 'NotAllowedError' }); });
    const h = harness({ locale: 'en', deps: { speechRecognition: () => undefined, getUserMedia } });
    await act(async () => { await h.result.current.d.toggle(); });
    expect(h.result.current.d.recording).toBe(false);
    expect(h.result.current.d.warn).toMatch(/Microphone access is blocked/);
  });

  test('the first capture that works wins (AudioWorklet unavailable → MediaRecorder)', async () => {
    const broken: CaptureFactory = async () => { throw new Error('AudioWorklet unavailable'); };
    const good = fakeCapture();
    const recorderLike: CaptureFactory = async (s, l) => ({ ...(await good.factory(s, l)), engine: 'mediarecorder', mimeType: 'audio/webm' });
    const h = harness({ deps: { speechRecognition: () => undefined, captureFactories: [broken, recorderLike] } });
    await act(async () => { await h.result.current.d.toggle(); await flush(); });
    expect(h.result.current.d.engine).toBe('mediarecorder');
  });

  test('returned functions are stable across renders', () => {
    const h = harness();
    const first = h.result.current.d;
    h.rerender();
    expect(h.result.current.d.toggle).toBe(first.toggle);
    expect(h.result.current.d.stopEcho).toBe(first.stopEcho);
    expect(h.result.current.d.markTyped).toBe(first.markTyped);
    expect(h.result.current.d.inputSourceRef).toBe(first.inputSourceRef);
  });
});
