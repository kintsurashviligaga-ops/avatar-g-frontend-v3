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
