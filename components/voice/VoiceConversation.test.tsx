/**
 * The ElevenLabs fallback (tier 3 of ChatChrome's voice cascade) wears the Gemini Live call's screen: the rocket orb
 * with the large faint rocket behind it, „ცოცხალი ზარი“, the status line with the waveform, the captions, and the round
 * glass row (Mute · End) — portalled, pinned dark, a dialog. The session underneath is unchanged: auto-start on a
 * running context (else one tap), tap-to-end-turn, transcribe → chat → TTS through the context, hands-free re-arm.
 * Mute switches the mic track off. Driven through a fake Web Audio + MediaRecorder + fetch.
 */
import '@testing-library/jest-dom';
import { StrictMode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { LIVE_OVERLAY_STRINGS } from './live/LiveModeOverlay';
import VoiceConversation, { VOICE_CONVERSATION_STRINGS, voiceOrbState } from './VoiceConversation';

// ── Fakes ───────────────────────────────────────────────────────────────────────────────────────────────────────

class FakeAnalyser {
  fftSize = 2048;
  smoothingTimeConstant = 0;
  get frequencyBinCount() { return this.fftSize / 2; }
  connect = jest.fn();
  getByteFrequencyData(buf: Uint8Array) { buf.fill(120); }
  getByteTimeDomainData(buf: Uint8Array) { buf.fill(128); }
}

let ctxState: AudioContextState = 'running';
let sourceThrows = false;
const sources: Array<{ start: jest.Mock; stop: jest.Mock }> = [];

class FakeAudioContext {
  state: AudioContextState = ctxState;
  destination = {};
  resume = jest.fn(async () => { this.state = 'running'; });
  close = jest.fn(async () => { this.state = 'closed'; });
  createMediaStreamSource = jest.fn(() => {
    if (sourceThrows) throw new Error('no graph');
    return { connect: jest.fn(), disconnect: jest.fn() };
  });
  createAnalyser = jest.fn(() => new FakeAnalyser());
  createBufferSource = jest.fn(() => {
    const src = { buffer: null as unknown, connect: jest.fn(), disconnect: jest.fn(), start: jest.fn(), stop: jest.fn(), onended: null as null | (() => void) };
    sources.push(src);
    return src;
  });
  decodeAudioData = jest.fn(async () => ({ duration: 1 }));
}

class FakeRecorder {
  static isTypeSupported = () => true;
  state: 'inactive' | 'recording' = 'inactive';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() { this.state = 'recording'; }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['x'.repeat(4096)], { type: 'audio/webm' }) });
    this.onstop?.();
  }
}

const track = { enabled: true, readyState: 'live', stop: jest.fn() };
const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
const getUserMedia = jest.fn(async () => stream as unknown as MediaStream);

const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body, arrayBuffer: async () => new ArrayBuffer(0) });
const fetchMock = jest.fn(async (url: string) => {
  if (url === '/api/voice/transcribe') return json(200, { text: 'გამარჯობა', language: 'ka' });
  if (url === '/api/voice/chat') return json(200, { reply: 'სალამი, რით დაგეხმარო?', locale: 'ka' });
  if (url === '/api/tts/gemini') return { ok: true, status: 200, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(2048) };
  return json(404, {});
});

const w = window as unknown as Record<string, unknown>;
const realTimeout = (AbortSignal as unknown as { timeout?: unknown }).timeout;

beforeEach(() => {
  ctxState = 'running';
  sourceThrows = false;
  sources.length = 0;
  track.enabled = true;
  track.stop.mockClear();
  getUserMedia.mockClear();
  getUserMedia.mockImplementation(async () => stream as unknown as MediaStream);
  fetchMock.mockClear();
  w.AudioContext = FakeAudioContext;
  w.MediaRecorder = FakeRecorder;
  (globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeRecorder;
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  if (typeof realTimeout !== 'function') {
    (AbortSignal as unknown as { timeout: (ms: number) => AbortSignal }).timeout = () => new AbortController().signal;
  }
});

afterEach(() => {
  delete w.AudioContext;
  delete w.MediaRecorder;
  delete (globalThis as unknown as { MediaRecorder?: unknown }).MediaRecorder;
  delete (globalThis as unknown as { fetch?: unknown }).fetch;
  if (typeof realTimeout !== 'function') delete (AbortSignal as unknown as { timeout?: unknown }).timeout;
});

const flush = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };

async function renderVoice(locale: 'ka' | 'en' | 'ru' = 'ka', onClose = jest.fn()) {
  const utils = render(<VoiceConversation locale={locale} onClose={onClose} />);
  await flush();
  return { ...utils, onClose };
}

// ── The screen ──────────────────────────────────────────────────────────────────────────────────────────────────

describe('VoiceConversation — the Live call screen', () => {
  it('is the Live frame: portalled onto <body>, pinned dark, above toasts, a named dialog', async () => {
    const { container } = await renderVoice('en');
    const dialog = screen.getByRole('dialog', { name: VOICE_CONVERSATION_STRINGS.en.title });
    expect(container.contains(dialog)).toBe(false);
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog.getAttribute('data-theme')).toBe('dark');
    expect(dialog.className).toMatch(/\bz-\[130\]/);
  });

  it.each(['ka', 'en', 'ru'] as const)('%s: the rocket is the agent — in the orb and large and faint behind it; „Live call“ top-left', async (locale) => {
    await renderVoice(locale);
    const dialog = screen.getByRole('dialog');
    expect(screen.getByTestId('live-call-label').textContent).toBe(LIVE_OVERLAY_STRINGS[locale].live);
    expect(dialog.querySelector('[data-testid="live-orb-rocket"]')?.getAttribute('src')).toBe('/brand/rocket-mark-512.png');
    expect(dialog.querySelector('[data-testid="live-orb-backdrop"] img')?.getAttribute('src')).toBe('/brand/rocket-mark-512.png');
    for (const img of Array.from(dialog.querySelectorAll('img'))) expect(img.getAttribute('src')).toMatch(/^\/brand\/rocket-mark/);
  });

  it('the metaball canvas and its crimson / violet are gone: one hue, one halo', async () => {
    await renderVoice('en');
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('canvas')).toBeNull();
    expect(dialog.innerHTML).not.toMatch(/rose-|violet|purple|fuchsia|crimson|255,\s*0,\s*60|209,\s*0,\s*209/);
    expect(dialog.querySelectorAll('.blur-3xl')).toHaveLength(1);
  });

  it('auto-starts on a running context and listens: the status line, the waveform, Mute · End', async () => {
    await renderVoice('ka');
    const live = LIVE_OVERLAY_STRINGS.ka;
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog').getAttribute('data-voice-status')).toBe('listening');
    expect(screen.getByTestId('live-status').textContent).toBe(live.status.listening);
    expect(screen.getByTestId('live-waveform').querySelector('[data-state]')?.getAttribute('data-state')).toBe('listening');
    const row = screen.getByTestId('live-controls');
    const controls = Array.from(row.querySelectorAll<HTMLButtonElement>('button[data-control]'));
    expect(controls.map((b) => b.getAttribute('aria-label'))).toEqual([live.mute, live.end]);
    for (const b of controls) expect(b.querySelector('[data-circle]')!.className).toMatch(/\bh-\[56px\] w-\[56px\]/);
    expect(screen.getByRole('button', { name: live.end }).querySelector('[data-circle]')!.className).toMatch(/\bbg-app-danger\b/);
    // The hands-free hint, until the first turn — Georgian at its 16 px floor.
    expect(screen.getByText(VOICE_CONVERSATION_STRINGS.ka.hint).className).toMatch(/text-\[16px\]/);
  });

  it('connecting: „უკავშირდება…“ under the breathing rocket while the context comes up', async () => {
    ctxState = 'suspended';
    const pending = new Promise<void>(() => {});
    const Ctx = class extends FakeAudioContext { resume = jest.fn(() => pending); };
    w.AudioContext = Ctx;
    render(<VoiceConversation locale="ka" onClose={jest.fn()} />);
    await flush();
    expect(screen.getByTestId('live-status').textContent).toBe('უკავშირდება…');
    // The orb is decoration while connecting (the status line speaks); it carries the state and the breath.
    expect(screen.getByTestId('voice-orb').querySelector('[role="img"]')!.getAttribute('data-state')).toBe('connecting');
    expect(screen.getByTestId('live-orb-arc').className).toMatch(/\bopacity-100\b/);
  });

  it('a suspended context (iOS) waits for one tap: Ready + „Tap to start“, and the tap starts the session', async () => {
    ctxState = 'suspended';
    const Ctx = class extends FakeAudioContext { resume = jest.fn(async () => { /* still suspended without a gesture */ }); };
    w.AudioContext = Ctx;
    await renderVoice('en');
    const t = VOICE_CONVERSATION_STRINGS.en;
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(screen.getByTestId('live-status').textContent).toBe(LIVE_OVERLAY_STRINGS.en.status.idle);
    // The orb answers a tap too, but the labelled button is the control (no duplicate name for assistive tech).
    expect(screen.getByTestId('voice-orb').getAttribute('aria-hidden')).toBe('true');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: t.tapToStart })); });
    await flush();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('live-status').textContent).toBe(LIVE_OVERLAY_STRINGS.en.status.listening);
  });

  it('mute switches the mic track off (and back), inverts the button and stills the waveform', async () => {
    await renderVoice('en');
    const live = LIVE_OVERLAY_STRINGS.en;
    const mute = screen.getByRole('button', { name: live.mute });
    expect(mute.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(mute);
    expect(track.enabled).toBe(false);
    expect(mute.getAttribute('aria-pressed')).toBe('true');
    expect(mute.querySelector('[data-circle]')!.className).toMatch(/\bbg-app-text\b.*\btext-app-bg\b/);
    expect(screen.getByTestId('live-waveform').querySelector('[data-state]')?.getAttribute('data-state')).toBe('idle');
    fireEvent.click(mute);
    expect(track.enabled).toBe(true);
  });

  it('End and Escape both hang up', async () => {
    const { onClose } = await renderVoice('en');
    fireEvent.click(screen.getByRole('button', { name: LIVE_OVERLAY_STRINGS.en.end }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('a microphone failure names the microphone, offers Retry, and leaves only End in the row', async () => {
    getUserMedia.mockImplementation(async () => { throw new DOMException('denied', 'NotAllowedError'); });
    await renderVoice('ka');
    const t = VOICE_CONVERSATION_STRINGS.ka;
    const live = LIVE_OVERLAY_STRINGS.ka;
    expect(screen.getByRole('heading').textContent).toBe(live.micHeadline);
    expect(screen.getByRole('alert').textContent).toBe(t.micDenied);
    expect(screen.queryByText(live.status.error)).toBeNull(); // never „კავშირი შეწყდა“ for a mic
    const row = screen.getByTestId('live-controls');
    expect(Array.from(row.querySelectorAll('button[data-control]')).map((b) => b.getAttribute('aria-label'))).toEqual([live.end]);
    getUserMedia.mockImplementation(async () => stream as unknown as MediaStream);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: t.retry })); });
    await flush();
    expect(screen.getByTestId('live-status').textContent).toBe(live.status.listening);
  });

  it('a turn, tap-to-end: the tap ends the turn, the reply is spoken through the context, the captions show both lines', async () => {
    sourceThrows = true; // no VAD graph → the tap-to-talk fallback (the orb's tap is the endpoint)
    await renderVoice('ka');
    const t = VOICE_CONVERSATION_STRINGS.ka;
    const live = LIVE_OVERLAY_STRINGS.ka;
    const orb = screen.getByRole('button', { name: t.endTurn });
    await act(async () => { fireEvent.click(orb); });
    await flush();
    await flush();
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(['/api/voice/transcribe', '/api/voice/chat', '/api/tts/gemini']);
    expect(sources).toHaveLength(1);
    expect(sources[0]!.start).toHaveBeenCalled();
    expect(screen.getByTestId('live-status').textContent).toBe(live.status.speaking);
    const log = screen.getByRole('log');
    expect(log).toHaveTextContent('გამარჯობა');
    expect(log).toHaveTextContent('სალამი, რით დაგეხმარო?');
    expect(log.querySelector('[data-role="assistant"]')!.className).toMatch(/text-\[20px\]/);
    // While the reply plays, the orb is not a control (barge-in is the voice, not a tap).
    expect(screen.getByTestId('voice-orb')).toBeDisabled();
    // The reply ends → hands-free: listening again.
    await act(async () => { sources[0]!.onended?.(); });
    await flush();
    expect(screen.getByTestId('live-status').textContent).toBe(live.status.listening);
  });

  it('a rate limit stops the loop with its own reason', async () => {
    sourceThrows = true;
    fetchMock.mockImplementationOnce(async () => json(429, {}));
    await renderVoice('en');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: VOICE_CONVERSATION_STRINGS.en.endTurn })); });
    await flush();
    expect(screen.getByRole('heading').textContent).toBe(VOICE_CONVERSATION_STRINGS.en.stopped);
    expect(screen.getByRole('alert').textContent).toBe(VOICE_CONVERSATION_STRINGS.en.rateLimited);
  });

  it('survives the development double-mount (Strict Mode): one live mic, listening — not stuck on connecting', async () => {
    render(<StrictMode><VoiceConversation locale="en" onClose={jest.fn()} /></StrictMode>);
    await flush();
    expect(screen.getByTestId('live-status').textContent).toBe(LIVE_OVERLAY_STRINGS.en.status.listening);
    // The first mount's boot ran on a context its cleanup closed; it gave its stream back.
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(track.stop).toHaveBeenCalled();
  });

  it('maps the session to the orb: not started and paused look idle', () => {
    expect(voiceOrbState('connecting')).toBe('connecting');
    expect(voiceOrbState('listening')).toBe('listening');
    expect(voiceOrbState('speaking')).toBe('speaking');
    expect(voiceOrbState('off')).toBe('idle');
    expect(voiceOrbState('resume')).toBe('idle');
    expect(voiceOrbState('error')).toBe('error');
  });

  it.each(['ka', 'en', 'ru'] as const)('%s: every string of this screen exists', (locale) => {
    for (const v of Object.values(VOICE_CONVERSATION_STRINGS[locale])) expect(v.trim().length).toBeGreaterThan(0);
  });
});
