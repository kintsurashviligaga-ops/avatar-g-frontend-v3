/**
 * @jest-environment jsdom
 *
 * OnboardingTour — the first-run tour, against a stand-in studio (an anchored composer, an anchored Avatar row).
 *
 *  · a first visit gets it once the studio has been still: a labelled dialog pointing at the composer, focus inside;
 *  · Escape / Skip / Got it close it FOR GOOD (a remount — the next visit — shows nothing), focus goes back;
 *  · a step whose anchor is not showing (the phone's closed drawer) is skipped; the twin only with its flag;
 *  · it never starts over another dialog or before the first-login welcome is done, and never interrupts someone who
 *    is already using the page (that visit is simply skipped — NOT marked seen);
 *  · non-modal: a tap elsewhere ends it quietly; a layer opening over it sends it back to waiting;
 *  · blocked storage still means once per page.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import OnboardingTour from './OnboardingTour';
import { TOUR_SEEN_KEY, resetTourMemory } from '@/lib/onboarding/tour';

// framer-motion schedules on the requestAnimationFrame it captured at import — the REAL one, which fake timers cannot
// advance — so enter/exit would never settle here. Motion is not what is under test: plain elements stand in, with
// reduced motion reported on (the component's own reduced-motion branch).
jest.mock('framer-motion', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react') as typeof import('react');
  const cache: Record<string, unknown> = {};
  const motion = new Proxy({}, {
    get: (_t, tag: string) => {
      cache[tag] ??= React.forwardRef(function MotionStub(props: Record<string, unknown>, ref: unknown) {
        const { initial: _i, animate: _a, exit: _e, transition: _tr, ...rest } = props;
        return React.createElement(tag, { ...rest, ref });
      });
      return cache[tag];
    },
  });
  return {
    __esModule: true,
    motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    useReducedMotion: () => true,
  };
});

type R = { top: number; left: number; width: number; height: number };
const rects = new Map<Element, R>();
const place = (el: Element | null, r: R) => { if (el) rects.set(el, r); };
const OFF: R = { top: 450, left: -279, width: 270, height: 44 };

function Studio({ twin = false }: { twin?: boolean }) {
  return (
    <>
      <button type="button" data-testid="elsewhere">elsewhere</button>
      <button type="button" data-tour="tool-avatar" data-testid="avatar-row">Avatar</button>
      {twin && <button type="button" data-tour="twin" data-testid="twin-row">Create my twin</button>}
      <div data-tour="composer" data-testid="composer"><textarea aria-label="prompt" /></div>
    </>
  );
}

function layout({ avatar = true, twin = false }: { avatar?: boolean; twin?: boolean } = {}) {
  place(screen.getByTestId('composer'), { top: 404, left: 392, width: 784, height: 64 });
  place(screen.getByTestId('avatar-row'), avatar ? { top: 450, left: 9, width: 270, height: 44 } : OFF);
  if (twin) place(screen.getByTestId('twin-row'), { top: 300, left: 9, width: 270, height: 44 });
}

/**
 * Time passes (by default long enough for the tour to appear: TOUR_START_DELAY_MS + a poll or two). Twice, because the
 * focus move is scheduled by the render that the first batch of timers caused.
 */
const settle = (ms = 1500) => {
  act(() => { jest.advanceTimersByTime(ms); });
  act(() => { jest.advanceTimersByTime(50); });
};
const tour = () => screen.queryByTestId('onboarding-tour');
const focus = (el: HTMLElement) => act(() => { el.focus(); });

function mount(opts: { twin?: boolean; avatar?: boolean; locale?: string } = {}) {
  const utils = render(<><Studio twin={opts.twin} /><OnboardingTour locale={opts.locale ?? 'en'} /></>);
  layout({ avatar: opts.avatar ?? true, twin: opts.twin ?? false });
  return utils;
}

beforeAll(() => {
  // Reduced motion: every transition is 0 s, so enter/exit settle on the next frames.
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: /prefers-reduced-motion/.test(query), media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    }),
  });
});

beforeEach(() => {
  jest.useFakeTimers();
  resetTourMemory();
  rects.clear();
  localStorage.clear();
  delete document.documentElement.dataset.authed;
  delete process.env.NEXT_PUBLIC_TWIN_ENABLED;
  jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const r = rects.get(this) ?? { top: 0, left: 0, width: 0, height: 0 };
    return { ...r, x: r.left, y: r.top, right: r.left + r.width, bottom: r.top + r.height, toJSON: () => r } as DOMRect;
  });
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
});
afterEach(() => {
  act(() => { jest.runOnlyPendingTimers(); });
  jest.useRealTimers();
  jest.restoreAllMocks();
  delete (document as { elementFromPoint?: unknown }).elementFromPoint;
});

describe('first visit', () => {
  it('appears once the studio has been still: a labelled, described dialog on the composer, with focus inside', () => {
    mount();
    expect(tour()).toBeNull(); // not on the first frame
    settle();
    const dialog = screen.getByRole('dialog', { name: 'Start here' });
    expect(dialog.getAttribute('data-tour-step')).toBe('composer');
    expect(dialog.getAttribute('aria-modal')).toBeNull(); // non-modal: nothing behind it is blocked
    const described = (dialog.getAttribute('aria-describedby') ?? '').split(' ').map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
    expect(described).toContain('Describe what you want to create');
    expect(described).toContain('Step 1 of 2');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('button', { name: 'Skip' })).toBeTruthy();
  });

  it.each([
    ['ka', 'დაიწყე აქ', 'გამოტოვება'],
    ['ru', 'Начните здесь', 'Пропустить'],
  ])('speaks %s', (locale, title, skip) => {
    mount({ locale });
    settle();
    expect(screen.getByRole('dialog', { name: title })).toBeTruthy();
    expect(screen.getByRole('button', { name: skip })).toBeTruthy();
  });

  it('a highlight ring sits on the anchor, outside the accessibility tree', () => {
    mount();
    settle();
    const ring = document.querySelector('[data-tour-ring]') as HTMLElement;
    expect(ring.getAttribute('aria-hidden')).toBe('true');
    expect(ring.className).toContain('pointer-events-none');
    expect(ring.style.top).toBe(`${404 - 4}px`);
    expect(ring.style.width).toBe(`${784 + 8}px`);
  });
});

describe('closing', () => {
  it('Escape closes it for good and puts focus back where it was', () => {
    mount();
    const before = screen.getByTestId('elsewhere');
    focus(before); // a non-field focus is not "using the page"
    settle();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Next' }));
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    settle(100);
    expect(tour()).toBeNull();
    expect(localStorage.getItem(TOUR_SEEN_KEY)).toBe('1');
    expect(document.activeElement).toBe(before);
  });

  it('Skip closes it, and the next visit (a remount) shows nothing', () => {
    const { unmount } = mount();
    settle();
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    settle(100);
    expect(tour()).toBeNull();
    unmount();
    resetTourMemory(); // a new page: only localStorage remembers
    mount();
    settle(5000);
    expect(tour()).toBeNull();
  });

  it('Next goes to the Avatar tool; Got it ends it', () => {
    mount();
    settle();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    settle(100);
    const second = screen.getByRole('dialog', { name: 'Make a photo talk' });
    expect(second.getAttribute('data-tour-step')).toBe('tool-avatar');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Got it' }));
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    settle(100);
    expect(tour()).toBeNull();
    expect(localStorage.getItem(TOUR_SEEN_KEY)).toBe('1');
  });

  it('a tap elsewhere ends it quietly — marked seen, focus left where the tap put it', () => {
    mount();
    settle();
    const other = screen.getByTestId('elsewhere');
    fireEvent.pointerDown(other);
    focus(other);
    settle(100);
    expect(tour()).toBeNull();
    expect(localStorage.getItem(TOUR_SEEN_KEY)).toBe('1');
    expect(document.activeElement).toBe(other);
  });

  it('focusing the composer (starting to type) ends it and leaves the caret there', () => {
    mount();
    settle();
    const box = screen.getByLabelText('prompt');
    focus(box);
    settle(100);
    expect(tour()).toBeNull();
    expect(document.activeElement).toBe(box);
  });
});

describe('steps that cannot be shown', () => {
  it('skips a step whose anchor is not showing (the closed phone drawer): one step, Skip and Got it', () => {
    mount({ avatar: false });
    settle();
    expect(screen.getByRole('dialog', { name: 'Start here' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Got it' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Skip' })).toBeTruthy();
    expect(screen.queryByText('Step 1 of 2')).toBeNull();
  });

  it('with the twin flag OFF it never points at a twin entry, even one on screen', () => {
    mount({ twin: true });
    settle();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    settle(100);
    expect(screen.getByRole('dialog').getAttribute('data-tour-step')).toBe('tool-avatar');
  });

  it('with the twin flag ON a showing twin entry is the second step', () => {
    process.env.NEXT_PUBLIC_TWIN_ENABLED = '1';
    mount({ twin: true });
    settle();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    settle(100);
    const dialog = screen.getByRole('dialog', { name: 'Create my twin' });
    expect(dialog.getAttribute('data-tour-step')).toBe('twin');
  });

  it('does not start while the composer is covered by something on top', () => {
    mount();
    const sheet = document.createElement('div');
    document.body.appendChild(sheet);
    (document as unknown as { elementFromPoint: () => Element }).elementFromPoint = () => sheet;
    settle(5000);
    expect(tour()).toBeNull();
    sheet.remove();
  });
});

describe('never stacked, never in the way', () => {
  it('waits while another dialog (the cookie banner) is on screen, and starts once it is gone', () => {
    mount();
    const banner = document.createElement('div');
    banner.setAttribute('role', 'dialog');
    document.body.appendChild(banner);
    place(banner, { top: 700, left: 900, width: 360, height: 90 });
    settle(5000);
    expect(tour()).toBeNull();
    // Choosing in the banner is not "using the page" — the tour still comes afterwards.
    fireEvent.pointerDown(banner);
    banner.remove();
    settle();
    expect(screen.getByRole('dialog', { name: 'Start here' })).toBeTruthy();
  });

  it('waits for the first-login welcome to be dismissed', () => {
    document.documentElement.dataset.authed = '1';
    mount();
    settle(5000);
    expect(tour()).toBeNull();
    localStorage.setItem('myavatar:welcomed', '1');
    settle();
    expect(screen.getByRole('dialog', { name: 'Start here' })).toBeTruthy();
  });

  it('someone already typing is not interrupted — and the tour is NOT marked seen', () => {
    mount();
    focus(screen.getByLabelText('prompt'));
    settle(5000);
    expect(tour()).toBeNull();
    expect(localStorage.getItem(TOUR_SEEN_KEY)).toBeNull();
  });

  it('a tap before it appears skips this visit only', () => {
    mount();
    fireEvent.pointerDown(screen.getByTestId('elsewhere'));
    settle(5000);
    expect(tour()).toBeNull();
    expect(localStorage.getItem(TOUR_SEEN_KEY)).toBeNull();
  });

  it('a layer opening over it sends it back to waiting (not seen), and it returns when the layer closes', () => {
    mount();
    settle();
    expect(tour()).not.toBeNull();
    const modal = document.createElement('div');
    modal.setAttribute('aria-modal', 'true');
    document.body.appendChild(modal);
    place(modal, { top: 0, left: 0, width: 1280, height: 800 });
    settle(600);
    expect(tour()).toBeNull();
    expect(localStorage.getItem(TOUR_SEEN_KEY)).toBeNull();
    modal.remove();
    settle();
    expect(tour()).not.toBeNull();
  });
});

describe('blocked storage', () => {
  it('shows, closes without throwing, and stays closed for the rest of the page', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('SecurityError'); });
    const { unmount } = mount();
    settle();
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    settle(100);
    expect(tour()).toBeNull();
    unmount();
    mount(); // same page (no resetTourMemory): the in-memory flag holds
    settle(5000);
    expect(tour()).toBeNull();
  });
});
