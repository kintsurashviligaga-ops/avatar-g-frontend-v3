/**
 * The Live screen: localized (ka/en/ru) 44 px controls, toggle state for assistive tech, error + retry, Escape ends
 * the call; captions expose only closed lines to screen readers; the orb follows the right level per state, runs
 * on requestAnimationFrame with transforms only, and stands still under prefers-reduced-motion.
 * Gemini Live frame: portalled onto <body>, pinned dark, above every toast/tray; a mic failure names the MICROPHONE
 * (never "connection dropped") with the browser's error name; captions toggle; the audio-driven waveform.
 */
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';

import LiveCaptions, { tailText } from './LiveCaptions';
import { LIVE_DOCK_STRINGS } from './LiveDock';
import LiveModeOverlay, { LIVE_OVERLAY_STRINGS, liveErrorHeadline } from './LiveModeOverlay';
import LiveOrb, {
  CONNECT_BREATH_DEPTH, CONNECT_BREATH_MS, LiveWaveform, WAVE_REST, connectBreath, connectProgress, orbStateFor, orbTarget, waveLevel,
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
  ] as const)('%s: connecting reads in the UI language, beside the waveform, under the breathing rocket', (locale, connecting, label) => {
    expect(LIVE_OVERLAY_STRINGS[locale].status.connecting).toBe(connecting);
    render(<LiveModeOverlay locale={locale} status="connecting" captions={[]} muted={false} cameraOn={false} {...handlers()} />);
    expect(screen.getByTestId('live-status').textContent).toBe(connecting);
    expect(screen.getByTestId('live-call-label').textContent).toBe(label);
    expect(screen.getByRole('img', { name: connecting }).getAttribute('data-state')).toBe('connecting');
    expect(screen.getByTestId('live-orb-arc').className).toMatch(/\bopacity-100\b/);
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

  it('the agent is the rocket: in the orb (whole, centred, never cropped) and large and faint behind it — no photo', () => {
    const { rerender } = render(<LiveModeOverlay locale="en" status="listening" captions={[]} muted={false} cameraOn={false} {...handlers()} />);
    const dialog = screen.getByRole('dialog');
    const rocket = dialog.querySelector<HTMLImageElement>('[data-testid="live-orb-rocket"]')!;
    expect(rocket.getAttribute('src')).toBe('/brand/rocket-mark-512.png');
    expect(rocket.getAttribute('srcset')).toBe('/brand/rocket-mark.png 256w, /brand/rocket-mark-512.png 512w');
    expect(rocket.className).toMatch(/\bobject-contain\b/);
    expect(rocket.className).toMatch(/inset-\[15%\].*h-\[70%\].*w-\[70%\]/);
    const backdrop = dialog.querySelector('[data-testid="live-orb-backdrop"]')!;
    expect(backdrop).not.toBeNull();
    expect(backdrop.className).toMatch(/aspect-square/);
    expect(backdrop.className).toMatch(/w-\[min\(92vw,34rem\)\]/); // always whole on a phone
    expect(backdrop.querySelector('img')!.getAttribute('src')).toBe('/brand/rocket-mark-512.png');
    expect(backdrop.querySelector('img')!.className).toMatch(/\bobject-contain\b/);
    // Every picture on the call is the rocket (the enrolled-avatar photo is gone).
    for (const img of Array.from(dialog.querySelectorAll('img'))) expect(img.getAttribute('src')).toMatch(/^\/brand\/rocket-mark/);
    // With the camera on, the camera is the background.
    rerender(<LiveModeOverlay locale="en" status="listening" captions={[]} muted={false} cameraOn {...handlers()} />);
    expect(screen.getByRole('dialog').querySelector('[data-testid="live-orb-backdrop"]')).toBeNull();
    expect(screen.getByRole('dialog').querySelector('[data-testid="live-orb-rocket"]')).not.toBeNull();
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

  it('captions toggle: pressed by default, hides the captions when off; absent without captions', () => {
    const s = LIVE_OVERLAY_STRINGS.en;
    const caps: LiveCaption[] = [{ id: 'a0', role: 'assistant', text: 'hello there', final: true }];
    const { rerender } = render(<LiveModeOverlay locale="en" status="speaking" captions={caps} muted={false} cameraOn={false} {...handlers()} />);
    const toggle = screen.getByRole('button', { name: s.captions });
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('hello there')).toBeTruthy();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByText('hello there')).toBeNull();
    rerender(<LiveModeOverlay locale="en" status="speaking" captions={caps} muted={false} cameraOn={false} {...handlers()} showCaptions={false} />);
    expect(screen.queryByRole('button', { name: s.captions })).toBeNull();
  });

  it('mute inverts when active (the toggle grammar), and the waveform goes still', () => {
    const s = LIVE_OVERLAY_STRINGS.en;
    const { rerender } = render(<LiveModeOverlay locale="en" status="listening" captions={[]} muted cameraOn={false} {...handlers()} />);
    const circle = () => screen.getByRole('button', { name: s.mute }).querySelector('[data-circle]')!.className;
    expect(circle()).toMatch(/\bbg-app-text\b.*\btext-app-bg\b/);
    expect(screen.getByTestId('live-waveform').querySelector('[data-state]')?.getAttribute('data-state')).toBe('idle');
    rerender(<LiveModeOverlay locale="en" status="listening" captions={[]} muted={false} cameraOn={false} {...handlers()} />);
    expect(circle()).not.toMatch(/\bbg-app-text\b/);
    expect(circle()).toMatch(/bg-white\/\[0\.09\]/); // glass when off
    expect(screen.getByTestId('live-waveform').querySelector('[data-state]')?.getAttribute('data-state')).toBe('listening');
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

  it('maps call status to orb state', () => {
    expect(orbStateFor('reconnecting')).toBe('connecting');
    expect(orbStateFor('closed')).toBe('idle');
    expect(orbStateFor('speaking')).toBe('speaking');
    expect(orbStateFor('error')).toBe('error');
  });

  it('follows the INPUT level while listening and the OUTPUT level while speaking', () => {
    const lv = { input: 0.7, output: 0.3 };
    expect(orbTarget('listening', lv, 0)).toBe(0.7);
    expect(orbTarget('speaking', lv, 0)).toBe(0.3);
    expect(orbTarget('speaking', { input: 1, output: 0 }, 0)).toBeGreaterThan(0); // alive between syllables
    expect(orbTarget('idle', lv, 0)).toBe(0);
    expect(orbTarget('error', lv, 0)).toBe(0);
  });

  it('animates with requestAnimationFrame writing transforms only', () => {
    mockReducedMotion(false);
    const frames: FrameRequestCallback[] = [];
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { frames.push(cb); return frames.length; });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    const { container, unmount } = render(<LiveOrb state="listening" getLevels={() => ({ input: 1, output: 0 })} label="Listening" />);
    expect(frames.length).toBeGreaterThan(0);
    act(() => { for (let i = 0; i < 5; i++) frames[frames.length - 1]!(16 * (i + 1)); });
    const layers = Array.from(container.querySelectorAll<HTMLDivElement>('[aria-hidden]'));
    const scaled = layers.map((l) => l.style.transform).filter((t) => /scale\(1\.\d*[1-9]/.test(t));
    expect(scaled.length).toBeGreaterThanOrEqual(2); // halo + core grew with the voice
    for (const l of layers) {
      expect(l.style.width).toBe('');
      expect(l.style.height).toBe('');
      expect(l.style.opacity).toBe('');
    }
    unmount();
  });

  it('stands still under prefers-reduced-motion (no animation frame is ever requested)', () => {
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
    expect(raf).not.toHaveBeenCalled();
  });

  it('one hue, one glow: the core has no shadow; the single halo is the blurred accent; the disc is lit by the accent', () => {
    mockReducedMotion(true);
    const { container } = render(<LiveOrb state="speaking" label="Speaking" />);
    const layers = Array.from(container.querySelectorAll<HTMLDivElement>('[aria-hidden]'));
    expect(layers.filter((l) => /\bblur-3xl\b/.test(l.className))).toHaveLength(1);
    expect(layers.some((l) => /shadow-/.test(l.className))).toBe(false);
    expect(container.innerHTML).toMatch(/rgb\(var\(--app-accent\)\/0\.42\)/);
  });

  it.each([36, 40, 88, 136, 168, 208])('the rocket sits whole on the disc at %i px, and asks for the raster it needs', (size) => {
    mockReducedMotion(true);
    const { container } = render(<LiveOrb state="listening" size={size} label="Listening" />);
    const rocket = container.querySelector<HTMLImageElement>('[data-testid="live-orb-rocket"]')!;
    expect(rocket.getAttribute('src')).toBe('/brand/rocket-mark-512.png');
    expect(rocket.getAttribute('alt')).toBe('');
    // 70 % of the core, centred, object-contain: the corner-to-corner mark stays inside the circle at every size.
    expect(rocket.className).toMatch(/\bobject-contain\b/);
    expect(rocket.className).toMatch(/inset-\[15%\]/);
    expect(rocket.getAttribute('sizes')).toBe(`${Math.max(16, Math.round(size * 0.76 * 0.7))}px`);
    expect(rocket.closest('[aria-hidden]')!.className).toMatch(/\boverflow-hidden\b.*\brounded-full\b/);
    expect((container.firstElementChild as HTMLElement).style.width).toBe(`${size}px`);
    // No backdrop unless asked (the dock has none).
    expect(container.querySelector('[data-testid="live-orb-backdrop"]')).toBeNull();
  });

  it('connecting breathes: a 2 s cycle, at rest at both ends, never past 3 %', () => {
    expect(CONNECT_BREATH_MS).toBe(2000);
    expect(CONNECT_BREATH_DEPTH).toBeLessThanOrEqual(0.03);
    expect(connectBreath(0)).toBeCloseTo(0, 10);
    expect(connectBreath(1000)).toBeCloseTo(1, 10);
    expect(connectBreath(2000)).toBeCloseTo(0, 10);
    for (let ts = 0; ts <= 4000; ts += 37) {
      expect(connectBreath(ts)).toBeGreaterThanOrEqual(0);
      expect(connectBreath(ts)).toBeLessThanOrEqual(1);
    }
    expect(connectBreath(Number.NaN)).toBe(0);
  });

  it('the connecting arc shows progress: a tenth at once, growing with the wait, held at 92 %', () => {
    expect(connectProgress(0)).toBeCloseTo(0.1, 5);
    let prev = 0;
    for (const ms of [0, 250, 1000, 3000, 6000, 12_000, 60_000]) {
      const p = connectProgress(ms);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
    expect(connectProgress(3000)).toBeGreaterThan(0.55);
    expect(connectProgress(600_000)).toBeLessThanOrEqual(0.92);
    expect(connectProgress(-5)).toBeCloseTo(0.1, 5);
  });

  it('connecting: the orb swells and brightens within 3 % and the arc grows over its track (paint and transform only)', () => {
    mockReducedMotion(false);
    const frames: FrameRequestCallback[] = [];
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { frames.push(cb); return frames.length; });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    const { container, rerender, unmount } = render(<LiveOrb state="connecting" label="Connecting" />);
    const arc = () => container.querySelector('[data-testid="live-orb-arc"] circle:last-child')!;
    const arcLength = () => Number(arc().getAttribute('stroke-dasharray')!.split(' ')[0]);
    const core = () => container.querySelector('[data-testid="live-orb-rocket"]')!.parentElement as HTMLElement;
    const scales: number[] = [];
    const opacities: number[] = [];
    act(() => {
      for (let i = 0; i <= 150; i++) {
        frames[frames.length - 1]!(i * 40); // 6 s at 25 fps: three breaths
        scales.push(Number(/scale\(([\d.]+)\)/.exec(core().style.transform)![1]));
        opacities.push(Number(core().style.opacity));
      }
    });
    expect(Math.max(...scales)).toBeLessThanOrEqual(1.03 + 1e-9);
    expect(Math.max(...scales)).toBeGreaterThan(1.02); // it does breathe
    expect(Math.min(...opacities)).toBeGreaterThanOrEqual(0.97 - 1e-9);
    expect(Math.max(...opacities)).toBeLessThanOrEqual(1);
    expect(arcLength()).toBeGreaterThan(70); // ~6 s in: most of the ring
    expect(arcLength()).toBeLessThanOrEqual(92);
    // The faint track is on while connecting, and the whole ring is one hue (the accent).
    expect(container.querySelector('[data-testid="live-orb-arc"] circle')!.getAttribute('class')).toMatch(/stroke-app-accent\/15.*opacity-100/);
    expect(arc().getAttribute('class')).toMatch(/stroke-app-accent\/80/);
    // Connected: the breath settles back and lets go of the opacity; the arc goes back to a quarter and hides.
    rerender(<LiveOrb state="listening" label="Listening" getLevels={() => ({ input: 0, output: 0 })} />);
    act(() => { for (let i = 0; i < 80; i++) frames[frames.length - 1]!(7000 + i * 16); });
    expect(core().style.opacity).toBe('');
    expect(arcLength()).toBe(25);
    expect(container.querySelector('[data-testid="live-orb-arc"]')!.className).toMatch(/\bopacity-0\b/);
    unmount();
  });

  it('connecting under prefers-reduced-motion: no breath, no frame, a still quarter arc on its track', () => {
    mockReducedMotion(true);
    const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    const { container } = render(<LiveOrb state="connecting" label="Connecting" />);
    expect(raf).not.toHaveBeenCalled();
    const ring = container.querySelector('[data-testid="live-orb-arc"]')!;
    expect(ring.className).toMatch(/\bopacity-100\b/);
    expect(ring.querySelector('circle:last-child')!.getAttribute('stroke-dasharray')).toBe('25.0 100');
    expect((container.querySelector('[data-testid="live-orb-rocket"]')!.parentElement as HTMLElement).style.opacity).toBe('');
  });

  it('idle dims the rocket and an error greys it; live states show it in full', () => {
    mockReducedMotion(true);
    const rocketCls = (state: 'idle' | 'error' | 'speaking') => {
      const { container, unmount } = render(<LiveOrb state={state} label={state} />);
      const cls = container.querySelector('[data-testid="live-orb-rocket"]')!.className;
      unmount();
      return cls;
    };
    expect(rocketCls('idle')).toMatch(/opacity-60/);
    expect(rocketCls('error')).toMatch(/\bgrayscale\b/);
    expect(rocketCls('speaking')).not.toMatch(/opacity-|grayscale/);
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
