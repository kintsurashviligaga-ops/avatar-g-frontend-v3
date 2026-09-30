/**
 * The Live screen: localized (ka/en/ru) 44 px controls, toggle state for assistive tech, error + retry, Escape ends
 * the call; captions expose only closed lines to screen readers; the orb follows the right level per state, runs
 * on requestAnimationFrame with transforms only, and stands still under prefers-reduced-motion.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';

import LiveCaptions, { tailText } from './LiveCaptions';
import LiveModeOverlay, { LIVE_OVERLAY_STRINGS } from './LiveModeOverlay';
import LiveOrb, { orbStateFor, orbTarget } from './LiveOrb';
import type { LiveCaption } from './useGeminiLiveSession';

const handlers = () => ({ onToggleMute: jest.fn(), onToggleCamera: jest.fn(), onFlipCamera: jest.fn(), onEnd: jest.fn(), onRetry: jest.fn() });

describe('LiveModeOverlay', () => {
  it.each(['ka', 'en', 'ru'] as const)('%s: every control has a localized name and a ≥ 44 px target', (locale) => {
    const s = LIVE_OVERLAY_STRINGS[locale];
    render(<LiveModeOverlay locale={locale} status="listening" captions={[]} muted={false} cameraOn {...handlers()} />);
    expect(screen.getByRole('dialog', { name: s.title })).toBeTruthy();
    for (const name of [s.mute, s.camera, s.flip, s.end]) {
      const cls = screen.getByRole('button', { name }).className;
      expect(cls).toMatch(/\bh-1[24]\b/); // 48 / 56 px
      expect(cls).toMatch(/\bw-1[24]\b/);
    }
    expect(screen.getByText(s.status.listening)).toBeTruthy();
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
});
