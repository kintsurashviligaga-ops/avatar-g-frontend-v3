/**
 * The job tray over the one task route: a job that runs server-side with no card anywhere (another tab, a reload) shows
 * here, and one the server can stop (an Agent G montage or MP3 extraction) gets a cancel that goes to POST /api/tasks,
 * once; a studio render stays read-only; anything a card in the chat narrates is not drawn twice.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useJobQueue } from '@/store/useJobQueue';
import { mapTaskToTrayJob } from '@/lib/jobs/durableJobs';
import type { TaskView } from '@/lib/tasks/taskView';
import { JobTray } from './JobTray';

const task = (t: Partial<TaskView>): TaskView => ({
  id: 'job-m', kind: 'agent-montage', service: 'film', status: 'running', stage: 'stitch', pct: 55, attempt: 1, result: null,
  error: null, cancellable: true, label: null, position: null, createdAt: null, updatedAt: null, ...t,
});
const montage = mapTaskToTrayJob(task({}), 'en');
const render1 = mapTaskToTrayJob(task({ id: 'prod_1', kind: 'render', stage: 'Rendering scenes 3/6', cancellable: false, label: 'A red car' }), 'en');

// jsdom has no Response: the store only reads `ok` (and the body, through json()).
const reply = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
let fetchMock: jest.Mock;
let answer: () => Promise<Response>;
const cancels = () => fetchMock.mock.calls.filter(([u, init]) => u === '/api/tasks' && init?.method === 'POST');

beforeEach(() => {
  answer = async () => reply(200, { ok: true, task: null });
  fetchMock = jest.fn(async () => answer());
  global.fetch = fetchMock as unknown as typeof fetch;
  useJobQueue.setState({ durableJobs: [montage, render1], inlineJobIds: [] });
});
afterEach(() => {
  act(() => { useJobQueue.setState({ durableJobs: [], inlineJobIds: [] }); });
});

test('an Agent G job shows by name with its stage in words and a cancel; a studio render shows read-only', () => {
  render(<JobTray locale="en" />);
  expect(screen.getByText('Agent G · montage')).toBeTruthy();
  expect(screen.getByText('Joining the shots')).toBeTruthy();
  expect(screen.getByText('A red car')).toBeTruthy();
  // One cancel in the tray: the montage's. The render has no server-side stop, so it offers none.
  expect(screen.getAllByRole('button', { name: 'Cancel' })).toHaveLength(1);
});

test('cancel sends one stop to the task route and gives the button up at once, so a double tap is one stop', async () => {
  let release!: () => void;
  answer = () => new Promise((r) => { release = () => r(reply(200, { ok: true, task: null })); });
  render(<JobTray locale="en" />);
  const btn = screen.getByRole('button', { name: 'Cancel' });
  fireEvent.click(btn);
  fireEvent.click(btn);
  expect(screen.queryAllByRole('button', { name: 'Cancel' })).toHaveLength(0);
  await act(async () => { release(); });
  expect(cancels()).toHaveLength(1);
  expect(JSON.parse(String(cancels()[0]![1].body))).toEqual({ action: 'cancel', id: 'job-m' });
  expect(screen.queryAllByRole('button', { name: 'Cancel' })).toHaveLength(0);
});

test('a stop that does not get through gives the cancel back', async () => {
  answer = async () => reply(409, { ok: false, error: 'not_running' });
  render(<JobTray locale="en" />);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Cancel' })).toHaveLength(1));
  expect(cancels()).toHaveLength(1);
});

test('a job a chat card narrates is left to that card: never drawn twice, and back in the tray when the card lets go', () => {
  render(<JobTray locale="en" />);
  act(() => { useJobQueue.getState().claimInline('job-m'); });
  expect(screen.queryByText('Agent G · montage')).toBeNull();
  expect(screen.getByText('A red car')).toBeTruthy();
  act(() => { useJobQueue.getState().releaseInline('job-m'); });
  expect(screen.getByText('Agent G · montage')).toBeTruthy();
});

test('the store refuses to stop what the server cannot stop, and sends nothing', async () => {
  expect(await useJobQueue.getState().cancelDurable('prod_1')).toBe(false);
  expect(await useJobQueue.getState().cancelDurable('nope')).toBe(false);
  expect(cancels()).toHaveLength(0);
});
