/**
 * @jest-environment jsdom
 *
 * "Create film": the whole-film check first (nothing charged), then each scene renders on its own card; a failed scene
 * shows "refunded" and a Re-render button that renders only that scene. The network is faked.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { emptyScene, type DwProject, type DwScene } from '@/lib/video/directorsWorkflow';
import { DirectorStudio, type fetchRunDeps } from './DirectorStudio';

const board = (): DwProject => ({
  id: 'p1', title: 'T', logline: 'L', aspect: '9:16', resolution: '720p', characters: [],
  scenes: [
    { ...emptyScene('s1'), order: 1, title: 'One', action: 'A fox in snow.', firstFrame: 'none' },
    { ...emptyScene('s2'), order: 2, title: 'Two', action: 'A crow on a branch.', firstFrame: 'none' },
  ],
  status: 'draft', version: 1,
});

function fakeDeps(failOnce: string[]) {
  const started: string[] = [];
  const failing = new Set(failOnce);
  const deps: typeof fetchRunDeps = () => ({
    start: async (s: DwScene) => { started.push(s.id); return { ok: true as const, jobId: `job-${s.id}`, credits: 10 }; },
    poll: async (jobId: string) => {
      const id = jobId.slice(4);
      if (failing.has(id)) { failing.delete(id); return { state: 'failed' as const, error: 'safety', refunded: true }; }
      return { state: 'ready' as const, videoUrl: `https://cdn/${id}.mp4` };
    },
    wait: async () => {},
  });
  return { deps, started };
}

let fetchMock: jest.Mock;
beforeEach(() => {
  fetchMock = jest.fn(async () => ({ ok: true, json: async () => ({ success: true, version: 1 }) }));
  (global as unknown as { fetch: unknown }).fetch = fetchMock;
});

test('approve checks the whole film, renders each scene, and re-renders only the failed one', async () => {
  const f = fakeDeps(['s2']);
  render(<DirectorStudio locale="en" onClose={() => {}} deps={f.deps} initial={board()} />);
  await act(async () => { fireEvent.click(screen.getByTestId('dw-approve')); });
  await waitFor(() => expect(screen.getAllByTestId('dw-scene-run').map((n) => n.getAttribute('data-state'))).toEqual(['done', 'failed']));
  expect(fetchMock).toHaveBeenCalledWith('/api/video/director-workflow/approve', expect.objectContaining({ method: 'POST' }));
  const second = screen.getAllByTestId('dw-scene')[1]!;
  expect(within(second).getByTestId('dw-scene-run').textContent).toMatch(/refunded/i);
  await act(async () => { fireEvent.click(within(second).getByTestId('dw-rerun')); });
  await waitFor(() => expect(screen.getAllByTestId('dw-scene-run').map((n) => n.getAttribute('data-state'))).toEqual(['done', 'done']));
  expect(f.started).toEqual(['s1', 's2', 's2']);
});

test('a short balance stops before any scene starts', async () => {
  fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ success: false, error: 'insufficient_credits' }) });
  const f = fakeDeps([]);
  render(<DirectorStudio locale="en" onClose={() => {}} deps={f.deps} initial={board()} />);
  await act(async () => { fireEvent.click(screen.getByTestId('dw-approve')); });
  expect(screen.getByTestId('dw-notice').textContent).toMatch(/Not enough credits/);
  expect(f.started).toEqual([]);
});

test('once every scene is delivered: a free final cut, or one with a priced music bed, saved to the Library', async () => {
  const f = fakeDeps([]);
  fetchMock.mockImplementation(async (url: string, init?: { body?: string }) => {
    if (url === '/api/video/director-workflow/cut') {
      const b = JSON.parse(init?.body ?? '{}');
      if (b.quote) return { ok: true, json: async () => ({ success: true, musicCredits: 3, bedSeconds: 30, musicAvailable: true }) };
      return { ok: true, json: async () => ({ success: true, url: 'https://cdn/film.mp4', savedToLibrary: true, musicCredits: b.music ? 3 : 0 }) };
    }
    return { ok: true, json: async () => ({ success: true, version: 1 }) };
  });
  render(<DirectorStudio locale="en" onClose={() => {}} deps={f.deps} initial={board()} />);
  expect(screen.queryByTestId('dw-final-cut')).toBeNull();
  await act(async () => { fireEvent.click(screen.getByTestId('dw-approve')); });
  await waitFor(() => expect(screen.getByTestId('dw-final-cut')).toBeTruthy());
  expect(screen.getByTestId('dw-cut').textContent).toMatch(/Final cut · free/);

  // Music: the price comes from the server before anything is charged.
  await act(async () => { fireEvent.click(screen.getByTestId('dw-music')); });
  await act(async () => { fireEvent.change(screen.getByTestId('dw-music-style'), { target: { value: 'Add cinematic music to the whole film' } }); });
  await waitFor(() => expect(screen.getByTestId('dw-cut').textContent).toMatch(/music ✦3/));
  await act(async () => { fireEvent.click(screen.getByTestId('dw-cut')); });
  await waitFor(() => expect(screen.getByTestId('dw-film').getAttribute('src')).toBe('https://cdn/film.mp4'));
  expect(screen.getByTestId('dw-film-saved').textContent).toMatch(/Library/);

  const cutCall = fetchMock.mock.calls.map((c) => [c[0], JSON.parse(c[1]?.body ?? '{}')]).find(([u, b]) => u === '/api/video/director-workflow/cut' && !b.quote)![1];
  expect(cutCall.clips).toEqual([{ sceneId: 's1', url: 'https://cdn/s1.mp4' }, { sceneId: 's2', url: 'https://cdn/s2.mp4' }]);
  expect(cutCall.music).toEqual({ prompt: 'cinematic music' });
  expect(cutCall.expectedCredits).toBe(3);
});

test('Phase 8.24: a double tap on Create film starts the film once (the button waits while the balance is checked)', async () => {
  let release: (v: unknown) => void = () => {};
  fetchMock.mockImplementationOnce(() => new Promise((r) => { release = r; }));
  const f = fakeDeps([]);
  render(<DirectorStudio locale="ka" onClose={() => {}} deps={f.deps} initial={board()} />);
  const btn = screen.getByTestId('dw-approve') as HTMLButtonElement;
  fireEvent.click(btn);
  fireEvent.click(btn);
  expect(btn.disabled).toBe(true);
  expect(btn.textContent).toBe('ბალანსი მოწმდება…');
  await act(async () => { release({ ok: true, json: async () => ({ success: true, version: 1 }) }); });
  await waitFor(() => expect(f.started).toEqual(['s1', 's2']));
  expect(fetchMock.mock.calls.filter((c) => c[0] === '/api/video/director-workflow/approve')).toHaveLength(1);
});
