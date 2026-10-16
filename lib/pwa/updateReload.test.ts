/**
 * lib/pwa/updateReload — a deploy's service worker takeover reloads the tab only when nothing is in progress.
 *
 * ⚠️ 2026-10-16: Production b53c2df landed while the Video panel was being filled for a paid ad test; the instant
 * takeover reload (AppShell) wiped the panel mid-form. These cases pin that a half-filled field, a studio job and a live
 * call all hold the reload, and that a waiting reload runs once the tab is hidden with no work left.
 */
import { createUpdateReloader, pageHasWork, RELOAD_RECHECK_MS } from './updateReload';

let visibility: DocumentVisibilityState = 'visible';
beforeAll(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
});
beforeEach(() => {
  jest.useFakeTimers();
  visibility = 'visible';
  document.body.innerHTML = '';
  delete document.documentElement.dataset.studioWork;
  delete document.documentElement.dataset.liveCall;
});
afterEach(() => jest.useRealTimers());

function hide() {
  visibility = 'hidden';
  document.dispatchEvent(new Event('visibilitychange'));
}

function typedPrompt(text = 'A presenter on a black stage, black-and-white shirt') {
  const area = document.createElement('textarea');
  area.value = text;
  document.body.appendChild(area);
  return area;
}

describe('pageHasWork', () => {
  it('an empty page has none', () => {
    document.body.innerHTML = '<textarea></textarea><input type="text" value="  "><input type="checkbox" checked>';
    expect(pageHasWork(document)).toBe(false);
  });

  it('typed text in a field, a studio job or a live call is work', () => {
    const area = typedPrompt();
    expect(pageHasWork(document)).toBe(true);
    area.remove();
    document.documentElement.dataset.studioWork = '1';
    expect(pageHasWork(document)).toBe(true);
    delete document.documentElement.dataset.studioWork;
    document.documentElement.dataset.liveCall = '1';
    expect(pageHasWork(document)).toBe(true);
  });

  it('a read-only or disabled field does not count', () => {
    document.body.innerHTML = '<textarea readonly>shown text</textarea><input type="text" disabled value="x">';
    expect(pageHasWork(document)).toBe(false);
  });
});

describe('the takeover reload', () => {
  it('an idle tab reloads at once, as before', () => {
    const reload = jest.fn();
    createUpdateReloader(document, window, reload).onTakeover();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('a half-filled panel is never reloaded while the user looks at it (the 2026-10-16 test)', () => {
    const reload = jest.fn();
    const r = createUpdateReloader(document, window, reload);
    const area = typedPrompt();
    r.onTakeover();
    jest.advanceTimersByTime(RELOAD_RECHECK_MS * 10);
    expect(reload).not.toHaveBeenCalled();
    expect(r.isPending()).toBe(true);
    // The work ends while the tab is still in view (the user reads the result): still no reload.
    area.value = '';
    jest.advanceTimersByTime(RELOAD_RECHECK_MS * 2);
    expect(reload).not.toHaveBeenCalled();
    // The tab goes to the background with nothing in progress: now.
    hide();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('a render still running in a hidden tab holds the reload until it ends', () => {
    const reload = jest.fn();
    const r = createUpdateReloader(document, window, reload);
    document.documentElement.dataset.studioWork = '1';
    r.onTakeover();
    hide();
    jest.advanceTimersByTime(RELOAD_RECHECK_MS * 4);
    expect(reload).not.toHaveBeenCalled();
    delete document.documentElement.dataset.studioWork;
    jest.advanceTimersByTime(RELOAD_RECHECK_MS);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('runs once, however many takeovers or quiet moments follow', () => {
    const reload = jest.fn();
    const r = createUpdateReloader(document, window, reload);
    typedPrompt();
    r.onTakeover();
    r.onTakeover();
    document.body.innerHTML = '';
    hide();
    hide();
    jest.advanceTimersByTime(RELOAD_RECHECK_MS * 3);
    r.onTakeover();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('dispose stops a waiting reload', () => {
    const reload = jest.fn();
    const r = createUpdateReloader(document, window, reload);
    typedPrompt();
    r.onTakeover();
    r.dispose();
    document.body.innerHTML = '';
    hide();
    jest.advanceTimersByTime(RELOAD_RECHECK_MS * 3);
    expect(reload).not.toHaveBeenCalled();
  });
});
