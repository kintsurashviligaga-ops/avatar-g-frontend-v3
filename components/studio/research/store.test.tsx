/**
 * @jest-environment jsdom
 *
 * The research store and the doors into it: the capability gate (nothing is offered until the server says so), the toast
 * rule (one per settled job, ever), the „+" sheet's rows, the sidebar row and the account switch.
 */
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useResearchToolExtras } from './launch';
import { ResearchSidebarRow } from './ResearchSidebarRow';
import { getResearchState, researchActions, resetResearchStoreForTests, useResearchAvailable } from './store';
import { done, job } from './testing';
import { NOTIFIED_KEY } from './watcher';

const jsonRes = (body: unknown, status = 200) => Promise.resolve({ status, ok: status < 400, json: async () => body } as Response);
const AVAILABLE = { available: true, credits: 120, filesAvailable: true, maxActive: 1 };

beforeEach(() => {
  resetResearchStoreForTests();
  try { window.localStorage.clear(); } catch { /* ignore */ }
  document.documentElement.dataset.authed = '1';
});
afterEach(() => { jest.restoreAllMocks(); });

function mockCaps(body: unknown, status = 200) {
  const f = jest.fn(() => jsonRes(body, status));
  (global as unknown as { fetch: typeof fetch }).fetch = f as unknown as typeof fetch;
  return f;
}

describe('capabilities', () => {
  test('available: true → the store says so; asked once however many surfaces ask', async () => {
    const f = mockCaps(AVAILABLE);
    await act(async () => { await Promise.all([researchActions.ensureCapabilities(), researchActions.ensureCapabilities()]); });
    expect(f).toHaveBeenCalledTimes(1);
    expect(getResearchState().caps).toEqual({ available: true, credits: 120, filesAvailable: true, maxActive: 1 });
    const { result } = renderHook(() => useResearchAvailable());
    expect(result.current).toBe(true);
  });

  test('available: false, an error status, or a thrown fetch → nothing is offered', async () => {
    mockCaps({ available: false, reason: 'schema', credits: 120, filesAvailable: false, maxActive: 1 });
    await act(async () => { await researchActions.ensureCapabilities(); });
    expect(renderHook(() => useResearchAvailable()).result.current).toBe(false);

    resetResearchStoreForTests();
    mockCaps({ error: 'x' }, 500);
    await act(async () => { await researchActions.ensureCapabilities(); });
    expect(getResearchState().caps).toBeNull();
    expect(renderHook(() => useResearchAvailable()).result.current).toBe(false);

    resetResearchStoreForTests();
    (global as unknown as { fetch: typeof fetch }).fetch = (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;
    await act(async () => { await researchActions.ensureCapabilities(); });
    expect(getResearchState().caps).toBeNull();
  });

  test('a changed price (409 price_changed) replaces the number the button shows', async () => {
    mockCaps(AVAILABLE);
    await act(async () => { await researchActions.ensureCapabilities(); });
    act(() => researchActions.setCredits(150));
    expect(getResearchState().caps?.credits).toBe(150);
    act(() => researchActions.setCredits(0)); // garbage never zeroes the button
    expect(getResearchState().caps?.credits).toBe(150);
  });
});

describe('one toast per settled job — ever', () => {
  test('a finished job toasts once; the next list read (same job) adds nothing; storage remembers across a reload', () => {
    act(() => researchActions.ingestList([done({ id: 'a' })], { announce: true }));
    expect(getResearchState().toasts).toEqual([expect.objectContaining({ kind: 'ready', jobId: 'a' })]);
    act(() => researchActions.ingestList([done({ id: 'a' })], { announce: true }));
    expect(getResearchState().toasts).toHaveLength(1);
    expect(JSON.parse(window.localStorage.getItem(NOTIFIED_KEY)!)).toEqual(['a']);

    // a fresh page: empty memory, same storage
    resetResearchStoreForTests();
    act(() => researchActions.ingestList([done({ id: 'a' })], { announce: true }));
    expect(getResearchState().toasts).toEqual([]);
  });

  test('a failed job toasts as failed; a cancelled one stays quiet; a running one is just remembered', () => {
    act(() => researchActions.ingestList([
      job({ id: 'f', status: 'failed', errorCode: 'provider_failed', completedAt: new Date().toISOString() }),
      job({ id: 'c', status: 'canceled', completedAt: new Date().toISOString() }),
      job({ id: 'r' }),
    ], { announce: true }));
    expect(getResearchState().toasts.map((t) => t.kind)).toEqual(['failed']);
    expect(Object.keys(getResearchState().jobs).sort()).toEqual(['c', 'f', 'r']);
  });

  test('opening a report yourself withdraws its toast and spends the notice', () => {
    act(() => researchActions.ingestList([done({ id: 'a' })], { announce: true }));
    expect(getResearchState().toasts).toHaveLength(1);
    act(() => researchActions.openViewer('a'));
    expect(getResearchState().toasts).toHaveLength(0);
    expect(getResearchState().viewer).toBe('a');
    act(() => researchActions.ingestList([done({ id: 'a' })], { announce: true }));
    expect(getResearchState().toasts).toHaveLength(0);
  });

  test('at most three toasts stack', () => {
    const items = ['a', 'b', 'c', 'd'].map((id) => done({ id }));
    act(() => researchActions.ingestList(items, { announce: true }));
    expect(getResearchState().toasts).toHaveLength(3);
  });

  test('a read without `announce` (the viewer, a card) never toasts', () => {
    act(() => researchActions.ingestList([done({ id: 'a' })]));
    expect(getResearchState().toasts).toEqual([]);
  });
});

describe('jobStarted + the account switch', () => {
  test('a started job is stored, the sheet closes, a one-liner toast shows and the thread is told', () => {
    const heard: unknown[] = [];
    const on = (e: Event) => heard.push((e as CustomEvent).detail);
    window.addEventListener('research:started', on);
    act(() => researchActions.openStart('why?'));
    expect(getResearchState().start).toEqual({ prompt: 'why?' });
    act(() => researchActions.jobStarted(job({ id: 'n' }), 'why?'));
    window.removeEventListener('research:started', on);
    expect(getResearchState().start).toBeNull();
    expect(getResearchState().jobs.n).toBeDefined();
    expect(getResearchState().toasts).toEqual([expect.objectContaining({ kind: 'info', key: 'started' })]);
    expect(heard).toEqual([{ job: expect.objectContaining({ id: 'n' }), prompt: 'why?' }]);
  });

  test('resetUser leaves nothing of the previous account — jobs, sheets, toasts, a live call', () => {
    act(() => {
      researchActions.upsertJob(done({ id: 'a' }));
      researchActions.openViewer('a');
      researchActions.openLive('a');
      researchActions.pushInfo('started');
    });
    expect(getResearchState().live).not.toBeNull();
    act(() => researchActions.resetUser());
    const s = getResearchState();
    expect(s.jobs).toEqual({});
    expect([s.viewer, s.live, s.start]).toEqual([null, null, null]);
    expect([s.list, s.connectors]).toEqual([false, false]);
    expect(s.toasts).toEqual([]);
  });

  test('Live: the viewer steps aside, and comes back when the call ends', () => {
    act(() => { researchActions.openViewer('a'); researchActions.openLive('a'); });
    expect(getResearchState()).toMatchObject({ viewer: null, live: { id: 'a', returnToViewer: true } });
    act(() => researchActions.closeLive());
    expect(getResearchState()).toMatchObject({ viewer: 'a', live: null });
  });
});

describe('the „+" sheet rows (useResearchToolExtras)', () => {
  test('empty until the server says available', async () => {
    mockCaps({ available: false, reason: 'disabled', credits: 120, filesAvailable: false, maxActive: 1 });
    const { result } = renderHook(() => useResearchToolExtras('en', () => ''));
    await act(async () => { await Promise.resolve(); });
    expect(result.current).toEqual([]);
  });

  test('available → Deep Research then Connectors; Deep Research opens the start sheet seeded from the composer', async () => {
    mockCaps(AVAILABLE);
    let text = 'seed from the box';
    const { result } = renderHook(() => useResearchToolExtras('en', () => text));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(result.current.map((r) => r.id)).toEqual(['research', 'connectors']);
    expect(result.current.map((r) => r.title)).toEqual(['Deep Research', 'Connectors']);
    text = 'seed from the box, edited';
    act(() => result.current[0]!.onPick());
    expect(getResearchState().start).toEqual({ prompt: 'seed from the box, edited' });
    act(() => result.current[1]!.onPick());
    expect(getResearchState().connectors).toBe(true);
  });

  test('a guest who picks Deep Research is sent to sign-in, and no sheet opens', async () => {
    mockCaps(AVAILABLE);
    document.documentElement.dataset.authed = '0';
    const heard = jest.fn();
    window.addEventListener('myavatar:auth-required', heard);
    const { result } = renderHook(() => useResearchToolExtras('ka', () => 'q'));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    act(() => result.current[0]!.onPick());
    window.removeEventListener('myavatar:auth-required', heard);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(getResearchState().start).toBeNull();
    expect(result.current[0]!.title).toBe('Deep Research');
    expect(result.current[1]!.title).toBe('კონექტორები');
  });
});

describe('the sidebar row', () => {
  test('drawn only for a signed-in user, and only when the feature exists', async () => {
    mockCaps(AVAILABLE);
    const { rerender } = render(<ResearchSidebarRow locale="en" authed={false} className="row" />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(screen.queryByTestId('sidebar-research')).toBeNull(); // a guest
    rerender(<ResearchSidebarRow locale="en" authed className="row" />);
    expect(screen.getByTestId('sidebar-research')).toBeTruthy();
    const picked = jest.fn();
    rerender(<ResearchSidebarRow locale="en" authed className="row" onPicked={picked} />);
    fireEvent.click(screen.getByTestId('sidebar-research'));
    expect(picked).toHaveBeenCalledTimes(1);
    expect(getResearchState().list).toBe(true);
  });

  test('not drawn when the feature is off', async () => {
    mockCaps({ available: false, reason: 'schema', credits: 120, filesAvailable: false, maxActive: 1 });
    render(<ResearchSidebarRow locale="en" authed className="row" />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(screen.queryByTestId('sidebar-research')).toBeNull();
  });
});
