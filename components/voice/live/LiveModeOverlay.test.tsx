/**
 * The Live screen: localized (ka/en/ru) 44 px controls, toggle state for assistive tech, error + retry, Escape ends
 * the call; captions expose only closed lines to screen readers; the agent's logo alone in the middle (the owner's PRD of
 * 2026-10-18), pulsing by status: it follows the right level per state, beats while thinking, breathes while connecting,
 * runs on requestAnimationFrame with transforms only, and stands still under prefers-reduced-motion.
 * Gemini Live frame: portalled onto <body>, pinned dark, above every toast/tray; a mic failure names the MICROPHONE
 * (never "connection dropped") with the browser's error name; captions toggle (off at the start); the dock's waveform.
 */
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';

import LiveCaptions, { tailText } from './LiveCaptions';
import { LIVE_DOCK_STRINGS } from './LiveDock';
import LiveModeOverlay, { LIVE_OVERLAY_STRINGS, liveErrorHeadline } from './LiveModeOverlay';
import LiveOrb, {
  CONNECT_BREATH_MS, LIVE_LOGO_SRC, LiveWaveform, PULSE_DEPTH, THINK_BEAT_MS, WAVE_REST, connectBreath, orbScale, orbStateFor, orbTarget,
  thinkBeat, waveLevel,
} from './LiveOrb';
import type { LiveCaption, LiveErrorCode } from './useGeminiLiveSession';

const ALL_CODES: LiveErrorCode[] = [
  'mic_denied', 'mic_system_denied', 'mic_not_found', 'mic_busy', 'mic_in_app', 'mic_insecure', 'mic_lost', 'mic_unavailable',
  'auth', 'rate_limited', 'unavailable', 'mint_failed', 'setup_failed', 'connection_lost', 'unsupported',
];
const MIC_CODES = ALL_CODES.filter((c) => c.startsWith('mic_'));

const handlers = () => ({ onToggleMute: jest.fn(), onToggleCamera: jest.fn(), onFlipCamera: jest.fn(), onEnd: jest.fn(), onRetry: jest.fn() });

describe('LiveModeOverlay', () => {
  it.each(['ka', 'en', 'ru'] as const)('%s: every control has a localized name and a ≥ 44 px target; the bottom row is 56 px round buttons with their word', (locale) => {
    const s = LIVE_OVERLAY_STRINGS[locale];
    render(<LiveModeOverlay locale={locale} status="speaking" captions={[]} muted={false} cameraOn {...handlers()} onStopSpeaking={jest.fn()} />);
    expect(screen.getByRole('dialog', { name: s.title })).toBeTruthy();
    // The bottom row: a 56 px circle per control, the whole column the target.
    const row = screen.getByTestId('live-controls');
    const controls = Array.from(row.querySelectorAll<HTMLButtonElement>('button[data-control]'));
    expect(controls).toHaveLength(4); // camera · stop-speaking · mute · End
    for (const b of controls) {
      expect(b.className).toMatch(/min-h-\[56px\]/);
      expect(b.className).toMatch(/min-w-\[56px\]/);
      // In px: the app's root font is 17 px, so a rem-sized circle would not be 56 px.
      expect(b.querySelector('[data-circle]')!.className).toMatch(/\bh-\[56px\] w-\[56px\]/);
      // The word under it is in its accessible name (WCAG 2.5.3) …
      expect(b.getAttribute('aria-label')!.toLocaleLowerCase()).toContain(b.textContent!.toLocaleLowerCase());
      // … and it appears from 360 px (icons alone fit a 320 px phone).
      expect(b.lastElementChild!.className).toMatch(/\bhidden\b.*min-\[360px\]:block/);
    }
    for (const name of [s.mute, s.camera, s.end, LIVE_DOCK_STRINGS[locale].stopSpeaking]) expect(row).toContainElement(screen.getByRole('button', { name }));
    // Flip and captions sit in the top bar.
    for (const name of [s.flip, s.captions]) {
      const cls = screen.getByRole('button', { name }).className;
      expect(cls).toMatch(/\bh-11\b/);
      expect(cls).toMatch(/\bw-11\b/);
    }
    expect(screen.getByText(s.status.speaking)).toBeTruthy();
    // End: a solid red circle with a phone-down icon and its word.
    const end = screen.getByRole('button', { name: s.end });
    expect(end.querySelector('[data-circle]')!.className).toMatch(/\bbg-app-danger\b/);
    expect(end.querySelector('[data-circle] svg')).not.toBeNull();
    expect(end.textContent).toBe(s.endShort);
    expect(s.end).toContain(s.endShort);
  });

  it.each([
    ['ka', 'უკავშირდება…', 'ცოცხალი ზარი'],
    ['en', 'Connecting…', 'Live call'],
    ['ru', 'Подключение…', 'Живой звонок'],
  ] as const)('%s: connecting is read in the UI language (to screen readers) while the logo breathes', (locale, connecting, label) => {
    expect(LIVE_OVERLAY_STRINGS[locale].status.connecting).toBe(connecting);
    render(<LiveModeOverlay locale={locale} status="connecting" captions={[]} muted={false} cameraOn={false} {...handlers()} />);
    const status = screen.getByTestId('live-status');
    expect(status.textContent).toBe(connecting);
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.className).toMatch(/\bsr-only\b/); // on screen the logo says it
    expect(screen.getByTestId('live-call-label').textContent).toBe(label);
    expect(screen.getByRole('img', { name: connecting }).getAttribute('data-state')).toBe('connecting');
  });

  it('stop-speaking joins the row only while the agent speaks', () => {
    const onStopSpeaking = jest.fn();
    const { rerender } = render(<LiveModeOverlay locale="en" status="listening" captions={[]} muted={false} cameraOn={false} {...handlers()} onStopSpeaking={onStopSpeaking} />);
    expect(screen.queryByTestId('live-stop-speaking')).toBeNull();
    rerender(<LiveModeOverlay locale="en" status="speaking" captions={[]} muted={false} cameraOn={false} {...handlers()} onStopSpeaking={onStopSpeaking} />);
    fireEvent.click(screen.getByTestId('live-stop-speaking'));
    expect(onStopSpeaking).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('live-stop-speaking').textContent).toBe(LIVE_OVERLAY_STRINGS.en.stopShort);
  });

  it('only the agent\'s logo on screen (the PRD of 2026-10-18): the sphere, whole; no backdrop, waveform, words or photo', () => {
    const caps: LiveCaption[] = [{ id: 'a0', role: 'assistant', text: 'hello there', final: true }];
    const { rerender } = render(<LiveModeOverlay locale="en" status="speaking" captions={caps} muted={false} cameraOn={false} {...handlers()} />);
    const dialog = screen.getByRole('dialog');
    const logo = dialog.querySelector<HTMLImageElement>('[data-testid="live-orb-logo"]')!;
    expect(logo.getAttribute('src')).toBe(LIVE_LOGO_SRC);
    expect(logo.getAttribute('srcset')).toBe('/brand/agent-orb-256.webp 256w, /brand/agent-orb-512.webp 512w');
    expect(logo.className).toMatch(/\bobject-contain\b/);
    // The one picture on the call is the logo: no faint rocket behind it, no enrolled-avatar photo.
    expect(Array.from(dialog.querySelectorAll('img')).map((i) => i.getAttribute('src'))).toEqual([LIVE_LOGO_SRC]);
    expect(dialog.querySelector('[data-testid="live-orb-backdrop"]')).toBeNull();
    expect(dialog.querySelector('[data-testid="live-orb-arc"]')).toBeNull();
    expect(dialog.querySelector('[data-testid="live-waveform"]')).toBeNull();
    // No words in the middle until asked for: the captions start off.
    expect(screen.queryByText('hello there')).toBeNull();
    // With the camera on, the camera is the background and the logo stays.
    rerender(<LiveModeOverlay locale="en" status="listening" captions={[]} muted={false} cameraOn {...handlers()} />);
    expect(screen.getByRole('dialog').querySelector('[data-testid="live-orb-logo"]')).not.toBeNull();
  });

  it('toggles expose aria-pressed and call their handlers; flip only while the camera is on', () => {
    const h = handlers();
    const s = LIVE_OVERLAY_STRINGS.en;
    const { rerender } = render(<LiveModeOverlay locale="en" status="speaking" captions={[]} muted cameraOn={false} {...h} />);
    const mute = screen.getByRole('button', { name: s.mute });
    expect(mute.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: s.camera }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByRole('button', { name: s.flip })).toBeNull();
    fireEvent.click(mute);
    fireEvent.click(screen.getByRole('button', { name: s.camera }));
    fireEvent.click(screen.getByRole('button', { name: s.end }));
    expect(h.onToggleMute).toHaveBeenCalledTimes(1);
    expect(h.onToggleCamera).toHaveBeenCalledTimes(1);
    expect(h.onEnd).toHaveBeenCalledTimes(1);

    rerender(<LiveModeOverlay locale="en" status="speaking" captions={[]} muted={false} cameraOn {...h} />);
    fireEvent.click(screen.getByRole('button', { name: s.flip }));
    expect(h.onFlipCamera).toHaveBeenCalledTimes(1);
  });

  it('error: localized reason + a retry button; no stale captions', () => {
    const h = handlers();
    const s = LIVE_OVERLAY_STRINGS.ka;
    const caps: LiveCaption[] = [{ id: 'a0', role: 'assistant', text: 'ძველი', final: true }];
    render(<LiveModeOverlay locale="ka" status="error" error="mic_denied" captions={caps} muted={false} cameraOn={false} {...h} />);
    expect(screen.getByRole('alert').textContent).toBe(s.errors.mic_denied);
    fireEvent.click(screen.getByRole('button', { name: s.retry }));
    expect(h.onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('ძველი')).toBeNull();
  });

  it.each(MIC_CODES)('%s: the headline names the MICROPHONE, never "connection dropped"; the browser error name is shown', (code) => {
    const s = LIVE_OVERLAY_STRINGS.ka;
    render(<LiveModeOverlay locale="ka" status="error" error={code} errorDetail={{ name: 'NotReadableError', message: 'x' }} captions={[]} muted={false} cameraOn={false} {...handlers()} />);
    expect(screen.getByRole('heading').textContent).toBe(s.micHeadline);
    expect(screen.queryByText(s.status.error)).toBeNull(); // „კავშირი შეწყდა“
    expect(screen.getByRole('alert').textContent).toBe(s.errors[code]);
    expect(screen.getByTestId('live-error-name').textContent).toBe('NotReadableError');
  });

  it('connection failures keep "connection dropped"; other failures say Live could not start', () => {
    expect(liveErrorHeadline('connection_lost', 'ka')).toBe('კავშირი შეწყდა');
    expect(liveErrorHeadline('setup_failed', 'en')).toBe(LIVE_OVERLAY_STRINGS.en.status.error);
    expect(liveErrorHeadline('auth', 'ru')).toBe(LIVE_OVERLAY_STRINGS.ru.startFailed);
    expect(liveErrorHeadline('mic_busy', 'en')).toBe('Microphone unavailable');
  });

  it.each(['ka', 'en', 'ru'] as const)('%s: every error code has copy, and the screen-level strings exist', (locale) => {
    const s = LIVE_OVERLAY_STRINGS[locale];
    for (const code of ALL_CODES) expect(s.errors[code].trim().length).toBeGreaterThan(0);
    for (const v of [s.micHeadline, s.startFailed, s.endShort, s.captions, s.copyLink, s.copied, s.openInBrowser, s.tapToStart, s.live]) {
      expect(v.trim().length).toBeGreaterThan(0);
    }
    for (const hint of Object.values(s.hints)) expect((hint ?? '').trim().length).toBeGreaterThan(0);
  });

  it('a hint explains how to fix a denied mic', () => {
    const s = LIVE_OVERLAY_STRINGS.en;
    render(<LiveModeOverlay locale="en" status="error" error="mic_denied" captions={[]} muted={false} cameraOn={false} {...handlers()} />);
    expect(screen.getByText(s.hints.mic_denied!)).toBeTruthy();
  });

  it('on the error screen only End stays in the control pill', () => {
    const s = LIVE_OVERLAY_STRINGS.en;
    render(<LiveModeOverlay locale="en" status="error" error="connection_lost" captions={[]} muted={false} cameraOn {...handlers()} extraControls={<button type="button">voice</button>} />);
    expect(screen.queryByRole('button', { name: s.mute })).toBeNull();
    expect(screen.queryByRole('button', { name: s.camera })).toBeNull();
    expect(screen.queryByRole('button', { name: 'voice' })).toBeNull();
    expect(screen.getByRole('button', { name: s.end })).toBeTruthy();
    expect(screen.queryByRole('button', { name: s.captions })).toBeNull();
  });

  it('mic_in_app offers a way out: copy the link (clipboard) and, on Android, open it in Chrome', async () => {
    const s = LIVE_OVERLAY_STRINGS.en;
    const writeText = jest.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const ua = jest.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 14; wv) Chrome/129 Instagram 300');
    try {
      render(<LiveModeOverlay locale="en" status="error" error="mic_in_app" captions={[]} muted={false} cameraOn={false} {...handlers()} />);
      const open = screen.getByRole('link', { name: s.openInBrowser });
      expect(open.getAttribute('href')).toMatch(/^intent:\/\/.*voice=1.*#Intent;scheme=https;package=com\.android\.chrome;end$/);
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: s.copyLink })); await Promise.resolve(); });
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('voice=1'));
      expect(screen.getByText(s.copied)).toBeTruthy();
    } finally {
      ua.mockRestore();
      delete (navigator as unknown as { clipboard?: unknown }).clipboard;
    }
  });

  it('is portalled onto <body>, pinned dark, and layered above toasts and the job tray', () => {
    const { container } = render(<LiveModeOverlay status="listening" captions={[]} muted={false} cameraOn={false} {...handlers()} />);
    const dialog = screen.getByRole('dialog');
    expect(container.contains(dialog)).toBe(false);
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog.getAttribute('data-theme')).toBe('dark');
    expect(dialog.className).toMatch(/\bz-\[130\]/);
  });

  it('captions toggle: off at the start (the logo alone), on shows the captions; absent without captions', () => {
    const s = LIVE_OVERLAY_STRINGS.en;
    const caps: LiveCaption[] = [{ id: 'a0', role: 'assistant', text: 'hello there', final: true }];
    const { rerender } = render(<LiveModeOverlay locale="en" status="speaking" captions={caps} muted={false} cameraOn={false} {...handlers()} />);
    const toggle = screen.getByRole('button', { name: s.captions });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByText('hello there')).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('hello there')).toBeTruthy();
    fireEvent.click(toggle);
    expect(screen.queryByText('hello there')).toBeNull();
    rerender(<LiveModeOverlay locale="en" status="speaking" captions={caps} muted={false} cameraOn={false} {...handlers()} showCaptions={false} />);
    expect(screen.queryByRole('button', { name: s.captions })).toBeNull();
  });

  it('mute inverts when active (the toggle grammar), and the logo rests instead of listening', () => {
    const s = LIVE_OVERLAY_STRINGS.en;
    const logoState = () => screen.getByRole('img', { name: s.status.listening }).getAttribute('data-state');
    const { rerender } = render(<LiveModeOverlay locale="en" status="listening" captions={[]} muted cameraOn={false} {...handlers()} />);
    const circle = () => screen.getByRole('button', { name: s.mute }).querySelector('[data-circle]')!.className;
    expect(circle()).toMatch(/\bbg-app-text\b.*\btext-app-bg\b/);
    expect(logoState()).toBe('idle');
    rerender(<LiveModeOverlay locale="en" status="listening" captions={[]} muted={false} cameraOn={false} {...handlers()} />);
    expect(circle()).not.toMatch(/\bbg-app-text\b/);
    expect(circle()).toMatch(/bg-white\/\[0\.09\]/); // glass when off
    expect(logoState()).toBe('listening');
    // Muted, the agent's own voice still moves it.
    rerender(<LiveModeOverlay locale="en" status="speaking" captions={[]} muted cameraOn={false} {...handlers()} />);
    expect(screen.getByRole('img', { name: s.status.speaking }).getAttribute('data-state')).toBe('speaking');
  });

  it('a blocked audio context shows "tap to turn on sound", which resumes it inside the tap', () => {
    const s = LIVE_OVERLAY_STRINGS.en;
    const onResumeAudio = jest.fn();
    render(<LiveModeOverlay locale="en" status="listening" captions={[]} muted={false} cameraOn={false} {...handlers()} audioBlocked onResumeAudio={onResumeAudio} />);
    fireEvent.click(screen.getByRole('button', { name: s.tapToStart }));
    expect(onResumeAudio).toHaveBeenCalledTimes(1);
  });

  it('Escape ends the call (dialog keyboard contract)', () => {
    const h = handlers();
    render(<LiveModeOverlay status="listening" captions={[]} muted={false} cameraOn={false} {...h} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(h.onEnd).toHaveBeenCalledTimes(1);
  });

  it('host extras render in the control bar', () => {
    render(<LiveModeOverlay status="listening" captions={[]} muted={false} cameraOn={false} {...handlers()} extraControls={<button type="button">voice</button>} />);
    expect(screen.getByRole('button', { name: 'voice' })).toBeTruthy();
  });
});

describe('LiveCaptions', () => {
  it('shows the last lines; only CLOSED lines are exposed to assistive tech', () => {
    const caps: LiveCaption[] = [
      { id: 'u0', role: 'user', text: 'one', final: true },
      { id: 'a0', role: 'assistant', text: 'two', final: true },
      { id: 'u1', role: 'user', text: 'three', final: true },
      { id: 'a1', role: 'assistant', text: 'four…', final: false },
    ];
    const { container } = render(<LiveCaptions captions={caps} locale="en" maxItems={3} />);
    expect(screen.getByRole('log', { name: 'Conversation captions' })).toBeTruthy();
    const lines = Array.from(container.querySelectorAll('p'));
    expect(lines.map((p) => p.textContent)).toEqual(['MyAvatar: two', 'You: three', 'MyAvatar: four…']);
    expect(lines.map((p) => p.getAttribute('aria-hidden'))).toEqual([null, null, 'true']);
  });

  it('the answer reads large (20 px); the user line is quieter, with a 16 px floor for Georgian', () => {
    const caps: LiveCaption[] = [
      { id: 'u0', role: 'user', text: 'გამარჯობა', final: true },
      { id: 'a0', role: 'assistant', text: 'სალამი', final: true },
    ];
    const { container, rerender } = render(<LiveCaptions captions={caps} locale="ka" />);
    const [user, model] = Array.from(container.querySelectorAll('p'));
    expect(model!.className).toMatch(/text-\[20px\]/);
    expect(user!.className).toMatch(/text-\[16px\].*leading-\[1\.6\]/);
    rerender(<LiveCaptions captions={caps} locale="en" />);
    expect(container.querySelector('p')!.className).toMatch(/text-\[15px\]/);
  });

  it('tailText keeps the newest words of a long answer', () => {
    expect(tailText('short')).toBe('short');
    const long = `${'word '.repeat(80)}END`;
    const t = tailText(long, 50);
    expect(t.startsWith('…')).toBe(true);
    expect(t.endsWith('END')).toBe(true);
    expect(t.length).toBeLessThanOrEqual(51);
  });
});

describe('LiveOrb', () => {
  const realMatchMedia = window.matchMedia;
  afterEach(() => {
    window.matchMedia = realMatchMedia;
    jest.restoreAllMocks();
  });
  const mockReducedMotion = (reduce: boolean) => {
    window.matchMedia = ((q: string) => ({
      matches: reduce && q.includes('reduce'), media: q, addEventListener: jest.fn(), removeEventListener: jest.fn(),
    })) as unknown as typeof window.matchMedia;
  };
  const scaleOf = (el: HTMLElement) => Number(/scale\(([\d.]+)\)/.exec(el.style.transform)?.[1] ?? 'NaN');
  /** Run the orb's loop for `ms` at `fps`, recording the logo's scale each frame. */
  const run = (frames: FrameRequestCallback[], logo: () => HTMLElement, from: number, ms: number, fps = 50) => {
    const out: number[] = [];
    act(() => {
      for (let t = from; t <= from + ms; t += 1000 / fps) {
        frames[frames.length - 1]!(t);
        out.push(scaleOf(logo()));
      }
    });
    return out;
  };

  it('maps call status to orb state', () => {
    expect(orbStateFor('reconnecting')).toBe('connecting');
    expect(orbStateFor('closed')).toBe('idle');
    expect(orbStateFor('speaking')).toBe('speaking');
    expect(orbStateFor('error')).toBe('error');
  });

  it('follows the INPUT level while listening and the OUTPUT level while speaking; its own rhythm otherwise', () => {
    const lv = { input: 0.7, output: 0.3 };
    expect(orbTarget('listening', lv, 0)).toBe(0.7);
    expect(orbTarget('speaking', lv, 0)).toBe(0.3);
    expect(orbTarget('speaking', { input: 1, output: 0 }, 0)).toBeGreaterThan(0); // alive between syllables
    expect(orbTarget('thinking', lv, 90)).toBeCloseTo(thinkBeat(90), 10);
    expect(orbTarget('connecting', lv, 800)).toBeCloseTo(connectBreath(800), 10);
    expect(orbTarget('idle', lv, 0)).toBe(0);
    expect(orbTarget('error', lv, 0)).toBe(0);
  });

  it('pulses by status: the voice moves it most, its own rhythms gently, idle and error not at all', () => {
    expect(PULSE_DEPTH.speaking).toBeGreaterThan(PULSE_DEPTH.listening);
    expect(PULSE_DEPTH.listening).toBeGreaterThan(PULSE_DEPTH.thinking);
    expect(PULSE_DEPTH.thinking).toBeGreaterThan(0);
    expect(PULSE_DEPTH.connecting).toBeGreaterThan(0);
    expect(PULSE_DEPTH.idle).toBe(0);
    expect(PULSE_DEPTH.error).toBe(0);
    expect(orbScale('speaking', 1)).toBeCloseTo(1 + PULSE_DEPTH.speaking, 10);
    expect(orbScale('speaking', 0)).toBe(1);
    expect(orbScale('listening', 5)).toBeCloseTo(1 + PULSE_DEPTH.listening, 10); // clamped
    expect(orbScale('thinking', Number.NaN)).toBe(1);
    expect(orbScale('error', 1)).toBe(1);
  });

  it('connecting breathes: a 1.6 s cycle, at rest at both ends', () => {
    expect(CONNECT_BREATH_MS).toBe(1600);
    expect(connectBreath(0)).toBeCloseTo(0, 10);
    expect(connectBreath(800)).toBeCloseTo(1, 10);
    expect(connectBreath(1600)).toBeCloseTo(0, 10);
    for (let ts = 0; ts <= 4000; ts += 37) {
      expect(connectBreath(ts)).toBeGreaterThanOrEqual(0);
      expect(connectBreath(ts)).toBeLessThanOrEqual(1);
    }
    expect(connectBreath(Number.NaN)).toBe(0);
  });

  it('thinking is a heartbeat: a strong beat, a softer one, then rest, every 1.1 s', () => {
    expect(THINK_BEAT_MS).toBe(1100);
    expect(thinkBeat(90)).toBeGreaterThan(0.95);
    expect(thinkBeat(330)).toBeGreaterThan(0.5);
    expect(thinkBeat(330)).toBeLessThan(thinkBeat(90));
    expect(thinkBeat(210)).toBeLessThan(thinkBeat(330)); // the dip between the two beats
    expect(thinkBeat(800)).toBeLessThan(0.01); // the rest
    expect(thinkBeat(90 + THINK_BEAT_MS)).toBeCloseTo(thinkBeat(90), 10);
    expect(thinkBeat(-1010)).toBeCloseTo(thinkBeat(90), 10);
    expect(thinkBeat(Number.NaN)).toBe(0);
  });

  it('animates with requestAnimationFrame writing transforms only: the logo and its halo swell with the voice', () => {
    mockReducedMotion(false);
    const frames: FrameRequestCallback[] = [];
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { frames.push(cb); return frames.length; });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    const { container, unmount } = render(<LiveOrb state="listening" getLevels={() => ({ input: 1, output: 0 })} label="Listening" />);
    expect(frames.length).toBeGreaterThan(0);
    act(() => { for (let i = 0; i < 8; i++) frames[frames.length - 1]!(16 * (i + 1)); });
    const logo = container.querySelector<HTMLElement>('[data-testid="live-orb-logo"]')!;
    const halo = container.querySelector<HTMLElement>('[data-testid="live-orb-halo"]')!;
    expect(scaleOf(logo)).toBeGreaterThan(1.1);
    expect(scaleOf(logo)).toBeLessThanOrEqual(1 + PULSE_DEPTH.listening + 1e-9);
    expect(scaleOf(halo)).toBeGreaterThan(1.2);
    for (const el of [logo, halo]) {
      expect(el.style.width).toBe('');
      expect(el.style.height).toBe('');
      expect(el.style.opacity).toBe('');
    }
    unmount();
    expect(logo.style.transform).toBe('translateZ(0) scale(1)');
  });

  it('thinking beats twice and rests; connecting swells once per breath — gently, never past its depth', () => {
    mockReducedMotion(false);
    const frames: FrameRequestCallback[] = [];
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { frames.push(cb); return frames.length; });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    const { container, rerender, unmount } = render(<LiveOrb state="thinking" label="Thinking" />);
    const logo = () => container.querySelector<HTMLElement>('[data-testid="live-orb-logo"]')!;
    const beat = run(frames, logo, 0, THINK_BEAT_MS * 3);
    expect(Math.max(...beat)).toBeGreaterThan(1 + PULSE_DEPTH.thinking * 0.7);
    expect(Math.max(...beat)).toBeLessThanOrEqual(1 + PULSE_DEPTH.thinking + 1e-9);
    // It comes back to rest between beats (a pulse, not a held swell).
    expect(Math.min(...beat.slice(beat.length / 3))).toBeLessThan(1.01);
    rerender(<LiveOrb state="connecting" label="Connecting" />);
    const breath = run(frames, logo, 10_000, CONNECT_BREATH_MS * 3);
    expect(Math.max(...breath)).toBeGreaterThan(1 + PULSE_DEPTH.connecting * 0.8);
    expect(Math.max(...breath)).toBeLessThanOrEqual(1 + PULSE_DEPTH.connecting + 1e-9);
    expect(Math.min(...breath.slice(breath.length / 3))).toBeLessThan(1.01);
    unmount();
  });

  it('stands still under prefers-reduced-motion (no animation frame is ever requested); the label still says the state', () => {
    mockReducedMotion(true);
    const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    render(<LiveOrb state="speaking" getLevels={() => ({ input: 0, output: 1 })} label="Speaking" />);
    expect(raf).not.toHaveBeenCalled();
    expect(screen.getByRole('img', { name: 'Speaking' }).getAttribute('data-state')).toBe('speaking');
  });

  it('does not animate idle or error', () => {
    mockReducedMotion(false);
    const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    render(<LiveOrb state="error" label="Error" />);
    render(<LiveOrb state="idle" label="Idle" />);
    expect(raf).not.toHaveBeenCalled();
  });

  it('one glow besides the logo\'s own: a single blurred accent halo, no shadows', () => {
    mockReducedMotion(true);
    const { container } = render(<LiveOrb state="speaking" label="Speaking" />);
    expect(container.querySelectorAll('[class*="blur-"]')).toHaveLength(1);
    expect(container.querySelector('[data-testid="live-orb-halo"]')!.className).toMatch(/\bbg-app-accent\/20\b/);
    expect(container.innerHTML).not.toMatch(/shadow-/);
  });

  it.each([36, 40, 88, 136, 168, 208])('the logo is whole at %i px and asks for the raster it needs', (size) => {
    mockReducedMotion(true);
    const { container } = render(<LiveOrb state="listening" size={size} label="Listening" />);
    const logo = container.querySelector<HTMLImageElement>('[data-testid="live-orb-logo"]')!;
    expect(logo.getAttribute('src')).toBe(LIVE_LOGO_SRC);
    expect(logo.getAttribute('alt')).toBe('');
    expect(logo.className).toMatch(/\bobject-contain\b/);
    expect(logo.className).toMatch(/\binset-0\b.*\bh-full\b.*\bw-full\b/);
    expect(logo.getAttribute('sizes')).toBe(`${size}px`);
    expect((container.firstElementChild as HTMLElement).style.width).toBe(`${size}px`);
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });

  it('idle dims the logo and an error greys it; live states show it in full', () => {
    mockReducedMotion(true);
    const logoCls = (state: 'idle' | 'error' | 'speaking') => {
      const { container, unmount } = render(<LiveOrb state={state} label={state} />);
      const cls = container.querySelector('[data-testid="live-orb-logo"]')!.className;
      unmount();
      return cls;
    };
    expect(logoCls('idle')).toMatch(/opacity-60/);
    expect(logoCls('error')).toMatch(/\bgrayscale\b/);
    expect(logoCls('speaking')).not.toMatch(/opacity-\d|grayscale/);
  });
});

describe('LiveWaveform', () => {
  const realMatchMedia = window.matchMedia;
  afterEach(() => {
    window.matchMedia = realMatchMedia;
    jest.restoreAllMocks();
  });
  const mockReducedMotion = (reduce: boolean) => {
    window.matchMedia = ((q: string) => ({
      matches: reduce && q.includes('reduce'), media: q, addEventListener: jest.fn(), removeEventListener: jest.fn(),
    })) as unknown as typeof window.matchMedia;
  };
  const bars = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLSpanElement>('span > span'));

  it('follows the input level while listening and the output while speaking; nothing otherwise', () => {
    const lv = { input: 0.8, output: 0.2 };
    expect(waveLevel('listening', lv)).toBe(0.8);
    expect(waveLevel('speaking', lv)).toBe(0.2);
    expect(waveLevel('thinking', lv)).toBe(0);
    expect(waveLevel('idle', lv)).toBe(0);
  });

  it('five accent bars driven by requestAnimationFrame with scaleY transforms (louder = taller)', () => {
    mockReducedMotion(false);
    const frames: FrameRequestCallback[] = [];
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { frames.push(cb); return frames.length; });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    let level = 0;
    const { container, unmount } = render(<LiveWaveform state="listening" getLevels={() => ({ input: level, output: 0 })} />);
    expect(bars(container)).toHaveLength(5);
    expect(bars(container).every((b) => /\bbg-app-accent\b/.test(b.className))).toBe(true);
    act(() => { for (let i = 0; i < 6; i++) frames[frames.length - 1]!(16 * (i + 1)); });
    const quiet = Number(/scaleY\(([\d.]+)\)/.exec(bars(container)[2]!.style.transform)![1]);
    level = 1;
    act(() => { for (let i = 0; i < 6; i++) frames[frames.length - 1]!(200 + 16 * (i + 1)); });
    const loud = Number(/scaleY\(([\d.]+)\)/.exec(bars(container)[2]!.style.transform)![1]);
    expect(loud).toBeGreaterThan(quiet);
    unmount();
  });

  it('is a still waveform under prefers-reduced-motion', () => {
    mockReducedMotion(true);
    const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    const { container } = render(<LiveWaveform state="speaking" getLevels={() => ({ input: 0, output: 1 })} />);
    expect(raf).not.toHaveBeenCalled();
    expect(bars(container).map((b) => b.style.transform)).toEqual(WAVE_REST.map((h) => `scaleY(${h})`));
  });
});
