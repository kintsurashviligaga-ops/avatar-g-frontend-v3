/**
 * @jest-environment jsdom
 *
 * The overlay only shows what the server decided: it starts the run once, steps it while it is running, and on a
 * failed shot offers exactly retry / edit / cancel (V5). A board the server refuses is listed with every problem and
 * sent back to the editor (V6); nothing is retried or fixed on the client.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { DirectorRunView } from '@/lib/video/director/run';
import type { Storyboard } from '@/lib/video/director/types';
import { DirectorRunOverlay } from './DirectorRunOverlay';

const RUN_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

const board: Storyboard = {
  id: 'board-1',
  title: 'Harbour at dawn',
  totalDurationSeconds: 16,
  shots: [
    { id: 's1', order: 1, description: 'Wide harbour', prompt: 'A harbour at dawn', durationSeconds: 8, aspectRatio: '16:9', quality: 'fast' },
    { id: 's2', order: 2, description: 'Close on the boat', prompt: 'A fishing boat', durationSeconds: 8, aspectRatio: '16:9', quality: 'fast' },
  ],
  consistencyLock: { aspectRatio: '16:9', enforceAcrossShots: true },
  createdAt: '2026-10-08T00:00:00.000Z',
  createdBy: 'user',
  approvedByUser: true,
};

function view(over: Partial<DirectorRunView> = {}, statuses: Array<DirectorRunView['shots'][number]['status']> = ['pending', 'pending']): DirectorRunView {
  return {
    id: RUN_ID,
    state: 'running',
    title: board.title,
    currentIndex: 0,
    totalShots: 2,
    quoteCredits: 38,
    shots: statuses.map((status, i) => ({
      shotId: `s${i + 1}`,
      order: i + 1,
      description: board.shots[i]!.description,
      durationSeconds: 8,
      status,
      attempt: 1,
      credits: 19,
      ...(status === 'done' ? { clipUrl: `https://example.test/clip-${i + 1}.mp4` } : {}),
    })),
    errors: [],
    updatedAt: '2026-10-08T00:00:00.000Z',
    ...over,
  };
}

type Call = { url: string; body: unknown };
let calls: Call[];
let answers: Array<{ status: number; json: unknown }>;

function reply(status: number, json: unknown) {
  answers.push({ status, json });
}

beforeEach(() => {
  calls = [];
  answers = [];
  jest.useFakeTimers();
  global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const next = answers.shift() ?? { status: 500, json: { error: 'no answer queued' } };
    return { ok: next.status < 400, status: next.status, json: async () => next.json } as Response;
  }) as typeof fetch;
});

afterEach(() => {
  jest.useRealTimers();
});

const flush = () => act(async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve(); });
const step = () => act(async () => { jest.advanceTimersByTime(5_000); for (let i = 0; i < 6; i += 1) await Promise.resolve(); });

it('starts the run once with the approved board and steps it while it runs', async () => {
  reply(201, { run: view() });
  reply(200, { run: view({}, ['rendering', 'pending']) });
  reply(200, { run: view({ currentIndex: 1 }, ['done', 'pending']) });

  render(<DirectorRunOverlay storyboard={board} locale="en" onEdit={jest.fn()} onClose={jest.fn()} />);
  await flush();
  expect(calls[0]).toEqual({ url: '/api/video/director/runs', body: { storyboard: board } });
  expect(screen.getAllByTestId('director-shot').map((el) => el.getAttribute('data-status'))).toEqual(['pending', 'pending']);
  expect(screen.getByText(/0\/2 · 38 credits/)).toBeTruthy();

  await step();
  expect(calls[1]!.url).toBe(`/api/video/director/runs/${RUN_ID}/advance`);
  expect(screen.getAllByTestId('director-shot')[0]!.getAttribute('data-status')).toBe('rendering');

  await step();
  expect(screen.getAllByTestId('director-shot')[0]!.getAttribute('data-status')).toBe('done');
  expect(document.querySelector('video')?.getAttribute('src')).toBe('https://example.test/clip-1.mp4');
  expect(calls.filter((c) => c.url === '/api/video/director/runs')).toHaveLength(1);
});

it('stops on a failed shot, steps nothing more, and sends the chosen answer', async () => {
  const failed = view(
    {
      state: 'waiting_for_shot_decision',
      pendingDecision: {
        shotId: 's1',
        shotIndex: 0,
        error: { shotId: 's1', reason: 'safety_filter', message: 'Google refused this shot for safety.', retryable: true },
        options: ['retry', 'edit', 'cancel'],
      },
    },
    ['failed', 'pending'],
  );
  reply(201, { run: failed });
  render(<DirectorRunOverlay storyboard={board} locale="en" onEdit={jest.fn()} onClose={jest.fn()} />);
  await flush();

  expect(screen.getByRole('alert').textContent).toContain('Shot 1 failed');
  expect(screen.getByText('Google refused this shot for safety.')).toBeTruthy();
  expect(screen.queryByText(/skip/i)).toBeNull();

  await step();
  expect(calls).toHaveLength(1); // a run waiting for the user is never stepped

  reply(200, { run: view({}, ['pending', 'pending']) });
  fireEvent.click(screen.getByRole('button', { name: 'Retry this shot' }));
  await flush();
  expect(calls[1]).toEqual({ url: `/api/video/director/runs/${RUN_ID}/decision`, body: { decision: 'retry' } });
  expect(screen.queryByRole('alert')).toBeNull();
});

it('Edit on a failed shot ends the run and goes back to the board', async () => {
  const onEdit = jest.fn();
  reply(201, {
    run: view(
      {
        state: 'waiting_for_shot_decision',
        pendingDecision: { shotId: 's1', shotIndex: 0, error: { shotId: 's1', reason: 'veo_internal', message: 'Veo failed.', retryable: true }, options: ['retry', 'edit', 'cancel'] },
      },
      ['failed', 'pending'],
    ),
  });
  render(<DirectorRunOverlay storyboard={board} locale="en" onEdit={onEdit} onClose={jest.fn()} />);
  await flush();

  reply(200, { run: view({ state: 'cancelled' }, ['failed', 'pending']) });
  fireEvent.click(screen.getByRole('button', { name: 'Edit storyboard' }));
  await flush();
  expect(calls[1]!.body).toEqual({ decision: 'edit' });
  expect(onEdit).toHaveBeenCalledTimes(1);
});

it('lists every rule a refused board breaks and offers only Edit or Close', async () => {
  const onEdit = jest.fn();
  reply(400, { error: 'invalid_storyboard', message: 'The storyboard breaks 2 rules.', problems: ['Shot 1: aspect ratio 1:1 is not supported.', 'Shot 2: a reference image needs 8 s.'] });
  render(<DirectorRunOverlay storyboard={board} locale="en" onEdit={onEdit} onClose={jest.fn()} />);
  await flush();

  expect(screen.getByText('The storyboard breaks 2 rules.')).toBeTruthy();
  expect(screen.getByText('Shot 1: aspect ratio 1:1 is not supported.')).toBeTruthy();
  expect(screen.getByText('Shot 2: a reference image needs 8 s.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Retry this shot' })).toBeNull();

  await step();
  expect(calls).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Edit storyboard' }));
  expect(onEdit).toHaveBeenCalledTimes(1);
});

it('"Stop after this shot" lets the rendering shot finish, then cancels before the next one', async () => {
  reply(201, { run: view({}, ['rendering', 'pending']) });
  render(<DirectorRunOverlay storyboard={board} locale="en" onEdit={jest.fn()} onClose={jest.fn()} />);
  await flush();

  fireEvent.click(screen.getByRole('button', { name: 'Stop after this shot' }));
  expect(screen.getByRole('button', { name: 'Stopping after this shot…' })).toBeTruthy();

  reply(200, { run: view({ currentIndex: 1 }, ['done', 'pending']) });
  await step();
  expect(calls[1]!.url).toBe(`/api/video/director/runs/${RUN_ID}/advance`);

  reply(200, { run: view({ state: 'cancelled', currentIndex: 1 }, ['done', 'pending']) });
  await step();
  expect(calls[2]).toEqual({ url: `/api/video/director/runs/${RUN_ID}/decision`, body: { decision: 'cancel' } });
  expect(screen.getByText('The render stopped. Finished shots are kept above.')).toBeTruthy();
});

it('says so when the connection keeps dropping, and keeps trying', async () => {
  reply(201, { run: view({}, ['rendering', 'pending']) });
  render(<DirectorRunOverlay storyboard={board} locale="en" onEdit={jest.fn()} onClose={jest.fn()} />);
  await flush();

  await step();
  await step();
  expect(screen.queryByText(/connection keeps dropping/)).toBeNull();
  await step();
  expect(screen.getByText(/connection keeps dropping/)).toBeTruthy();

  reply(200, { run: view({ currentIndex: 1 }, ['done', 'pending']) });
  await step();
  expect(screen.queryByText(/connection keeps dropping/)).toBeNull();
  expect(calls.filter((c) => c.url.endsWith('/advance'))).toHaveLength(4);
});
