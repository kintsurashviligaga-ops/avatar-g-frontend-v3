/**
 * @jest-environment jsdom
 *
 * The first-run tour's rules (lib/onboarding/tour.ts):
 *  · the twin is a candidate ONLY with NEXT_PUBLIC_TWIN_ENABLED on, and even then the Avatar tool is the fallback;
 *  · "seen" survives a throwing localStorage (private mode) as an in-memory flag, and every access is guarded;
 *  · the welcome is pending only for a signed-in user who has not finished it;
 *  · an anchor that is missing, zero-sized, off-canvas (the phone drawer), hidden or covered is NOT showing;
 *  · the card goes beside its anchor — above the phone composer, right of a sidebar row — and fits a 320 px screen.
 */
import {
  TOUR_SEEN_KEY, anchorShowing, findTourAnchor, markTourSeen, otherDialogShowing, placeTourCard, readTourSeen,
  resetTourMemory, resolveTourSteps, tourSteps, welcomePending,
} from './tour';

type R = { top: number; left: number; width: number; height: number };
const rects = new Map<Element, R>();
function rectOf(el: Element, r: R) { rects.set(el, r); }

beforeEach(() => {
  resetTourMemory();
  rects.clear();
  localStorage.clear();
  document.body.innerHTML = '';
  delete document.documentElement.dataset.authed;
  jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const r = rects.get(this) ?? { top: 0, left: 0, width: 0, height: 0 };
    return { ...r, x: r.left, y: r.top, right: r.left + r.width, bottom: r.top + r.height, toJSON: () => r } as DOMRect;
  });
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 812 });
});
afterEach(() => {
  jest.restoreAllMocks();
  delete (document as { elementFromPoint?: unknown }).elementFromPoint;
});

describe('the steps', () => {
  it('without the twin flag the second step can only point at the Avatar tool', () => {
    const steps = tourSteps(false);
    expect(steps.map((s) => s.id)).toEqual(['start', 'avatar']);
    expect(steps[0]!.anchors).toEqual(['composer']);
    expect(steps[1]!.anchors).toEqual(['tool-avatar']);
  });

  it('with the twin flag a twin entry is preferred, the Avatar tool still the fallback', () => {
    expect(tourSteps(true)[1]!.anchors).toEqual(['twin', 'tool-avatar']);
  });

  it('resolves only anchors that are showing, in order — a hidden twin falls back to the Avatar row', () => {
    document.body.innerHTML = '<div data-tour="composer"></div><button data-tour="twin"></button><button data-tour="tool-avatar"></button>';
    const [composer, twin, avatar] = Array.from(document.querySelectorAll('[data-tour]'));
    rectOf(composer!, { top: 700, left: 16, width: 343, height: 64 });
    rectOf(avatar!, { top: 450, left: 9, width: 270, height: 44 });
    void twin; // zero-sized: not showing
    expect(resolveTourSteps(true).map((s) => `${s.id}:${s.anchor}`)).toEqual(['start:composer', 'avatar:tool-avatar']);
    rectOf(twin!, { top: 300, left: 9, width: 270, height: 44 });
    expect(resolveTourSteps(true).map((s) => s.anchor)).toEqual(['composer', 'twin']);
    expect(resolveTourSteps(false).map((s) => s.anchor)).toEqual(['composer', 'tool-avatar']);
  });
});

describe('seen, once per device', () => {
  it('is stored under its key', () => {
    expect(readTourSeen()).toBe(false);
    markTourSeen();
    expect(localStorage.getItem(TOUR_SEEN_KEY)).toBe('1');
    resetTourMemory();
    expect(readTourSeen()).toBe(true);
  });

  it('a throwing storage reads as "not seen", never throws, and the in-memory flag still holds for the page', () => {
    const broken = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceeded'); } } as unknown as Storage;
    expect(readTourSeen(broken)).toBe(false);
    expect(() => markTourSeen(broken)).not.toThrow();
    expect(readTourSeen(broken)).toBe(true);
  });
});

describe('the welcome', () => {
  it('is pending only for a signed-in user who has not finished it', () => {
    const root = document.documentElement;
    expect(welcomePending(root)).toBe(false); // guest
    root.dataset.authed = '1';
    expect(welcomePending(root)).toBe(true);
    localStorage.setItem('myavatar:welcomed', '1');
    expect(welcomePending(root)).toBe(false);
  });

  it('a throwing storage means no welcome (ChatChrome skips it too)', () => {
    document.documentElement.dataset.authed = '1';
    const broken = { getItem: () => { throw new Error('x'); } } as unknown as Storage;
    expect(welcomePending(document.documentElement, broken)).toBe(false);
  });
});

describe('showing', () => {
  it('needs a real size inside the viewport — the off-canvas phone drawer is not showing', () => {
    document.body.innerHTML = '<button data-tour="tool-avatar"></button>';
    const row = document.querySelector('button')!;
    expect(anchorShowing(row)).toBe(false); // 0 × 0
    rectOf(row, { top: 450, left: -279, width: 270, height: 44 }); // translated -100 %
    expect(anchorShowing(row)).toBe(false);
    rectOf(row, { top: 450, left: 9, width: 270, height: 44 });
    expect(anchorShowing(row)).toBe(true);
    row.style.visibility = 'hidden';
    expect(anchorShowing(row)).toBe(false);
  });

  it('is not showing when something sits on top of it (a sheet, a modal, a drawer backdrop)', () => {
    document.body.innerHTML = '<div data-tour="composer"><textarea></textarea></div><div id="sheet"></div>';
    const composer = document.querySelector<HTMLElement>('[data-tour="composer"]')!;
    rectOf(composer, { top: 700, left: 16, width: 343, height: 64 });
    const hit = { el: composer.querySelector('textarea') as Element };
    (document as unknown as { elementFromPoint: () => Element }).elementFromPoint = () => hit.el;
    expect(anchorShowing(composer)).toBe(true); // the textarea is inside the anchor
    hit.el = document.getElementById('sheet')!;
    expect(anchorShowing(composer)).toBe(false);
    expect(findTourAnchor('composer')).toBeNull();
  });

  it('finds the first SHOWING element of an anchor (the sidebar row or the collapsed rail button)', () => {
    document.body.innerHTML = '<button data-tour="tool-avatar" id="row"></button><button data-tour="tool-avatar" id="rail"></button>';
    rectOf(document.getElementById('rail')!, { top: 300, left: 8, width: 44, height: 44 });
    expect(findTourAnchor('tool-avatar')?.id).toBe('rail');
  });

  it('another dialog on screen blocks; a hidden one and the tour card itself do not', () => {
    document.body.innerHTML = '<div role="dialog" id="cookie"></div><div role="dialog" data-tour-card id="card"></div>';
    expect(otherDialogShowing(document)).toBe(false); // zero-sized = hidden
    rectOf(document.getElementById('card')!, { top: 10, left: 10, width: 300, height: 120 });
    expect(otherDialogShowing(document)).toBe(false);
    rectOf(document.getElementById('cookie')!, { top: 700, left: 12, width: 351, height: 100 });
    expect(otherDialogShowing(document)).toBe(true);
  });
});

describe('placing the card', () => {
  const card = { width: 320, height: 150 };

  it('goes ABOVE the phone composer, centred on it and inside the screen', () => {
    const p = placeTourCard({ top: 648, left: 16, width: 343, height: 124 }, card, { width: 375, height: 812 }, ['top', 'bottom']);
    expect(p.side).toBe('top');
    expect(p.top + card.height).toBeLessThanOrEqual(648 - 12);
    expect(p.left).toBeGreaterThanOrEqual(12);
    expect(p.left + card.width).toBeLessThanOrEqual(375 - 12);
  });

  it('flips below when there is no room above', () => {
    const p = placeTourCard({ top: 40, left: 16, width: 343, height: 64 }, card, { width: 375, height: 812 }, ['top', 'bottom']);
    expect(p.side).toBe('bottom');
    expect(p.top).toBe(40 + 64 + 12);
  });

  it('goes to the RIGHT of a sidebar row, vertically centred on it, with the arrow pointing at the row', () => {
    const row = { top: 450, left: 9, width: 270, height: 44 };
    const p = placeTourCard(row, card, { width: 1280, height: 800 }, ['right', 'bottom', 'top']);
    expect(p.side).toBe('right');
    expect(p.left).toBe(9 + 270 + 12);
    expect(p.top + p.arrow).toBe(Math.round(450 + 22));
  });

  it('keeps clear of the safe-area insets and fits whole on a 320 px screen', () => {
    const p = placeTourCard({ top: 600, left: 8, width: 304, height: 64 }, { width: 288, height: 150 }, { width: 320, height: 640 }, ['top'],
      { insets: { top: 44, right: 0, bottom: 34, left: 0 } });
    expect(p.left).toBeGreaterThanOrEqual(12);
    expect(p.left + 288).toBeLessThanOrEqual(320 - 12);
    expect(p.top).toBeGreaterThanOrEqual(44 + 12);
  });

  it('with no room anywhere it takes the roomiest preferred side and still stays on screen', () => {
    const p = placeTourCard({ top: 100, left: 0, width: 375, height: 600 }, card, { width: 375, height: 812 }, ['top', 'bottom']);
    expect(['top', 'bottom']).toContain(p.side);
    expect(p.top).toBeGreaterThanOrEqual(12);
    expect(p.top + card.height).toBeLessThanOrEqual(812 - 12);
  });
});
