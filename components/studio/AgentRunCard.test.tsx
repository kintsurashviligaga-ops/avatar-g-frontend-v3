/**
 * @jest-environment jsdom
 *
 * The run card in the chat: the plan offers Start (with its price) and Cancel; a running run offers Stop, and a step
 * waiting for the user's yes offers that yes with its own price and quote; a run that ended without every result offers
 * Retry at the price of what is left; the credits line and „what Agent G did" sit under the steps; the card stays.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { AgentRunCard } from './AgentRunCard';
import type { AgentRunState } from '@/lib/agent/run/runCard';
import type { RunPlanView } from '@/lib/agent/run/runClient';
import type { TaskStepView, TaskView } from '@/lib/tasks/taskView';

const PLAN: RunPlanView = { runId: 'run-1', credits: 6, expiresAt: 9, steps: [{ id: 'sound', tool: 'audio_extract', credits: 0 }, { id: 'cut', tool: 'montage', credits: 6 }] };
const step = (id: string, tool: TaskStepView['tool'], over: Partial<TaskStepView> = {}): TaskStepView => ({
  id, tool, capability: tool === 'montage' ? 'agent.montage' : 'agent.audio-extract',
  status: 'queued', taskId: null, stage: null, pct: null, result: null, error: null, reused: false, approval: null, credits: null, ...over,
});
const task = (status: TaskView['status'], steps: TaskStepView[]): TaskView => ({
  id: 'run-1', kind: 'agent-run', service: 'film', status, stage: null, pct: null, attempt: null, result: null, error: null,
  cancellable: true, label: null, position: null, createdAt: null, updatedAt: null, steps,
  events: [{ seq: 1, at: 1, type: 'run.created' }, { seq: 2, at: 2, type: 'step.completed', step: 'sound' }],
});
const base = (over: Partial<AgentRunState>): AgentRunState => ({
  phase: 'planned', chain: { kind: 'sound-cut', source: { index: 0 }, clips: [1, 2] }, names: ['a.mp4', 'b.mp4', 'c.mp4'], total: 3, uploaded: 3, plan: PLAN, t0: Date.now(), ...over,
});
const handlers = () => ({ onStart: jest.fn(), onCancel: jest.fn(), onApprove: jest.fn(), onRetry: jest.fn() });

test('the plan: Start with its price, and Cancel; no Stop, no Retry', () => {
  const h = handlers();
  render(<AgentRunCard state={base({})} locale="en" {...h} />);
  expect(screen.getByTestId('agent-run-card').getAttribute('data-phase')).toBe('planned');
  const start = screen.getByTestId('agent-run-start');
  expect(start.getAttribute('data-price')).toBe('6');
  fireEvent.click(start);
  fireEvent.click(screen.getByTestId('agent-run-cancel'));
  expect(h.onStart).toHaveBeenCalledTimes(1);
  expect(h.onCancel).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId('agent-run-stop')).toBeNull();
  expect(screen.queryByTestId('agent-run-retry')).toBeNull();
  expect(screen.getByTestId('agent-run-credits').textContent).toBe('✦ 0 spent · up to ✦ 6');
});

test('running, a step waits for the yes: the yes names that step and its quote; Stop stays', () => {
  const h = handlers();
  const waiting = task('awaiting_approval', [
    step('sound', 'audio_extract', { status: 'completed', taskId: 't1', credits: 0, result: { url: 'https://x/a.mp3', media: 'audio' } }),
    step('cut', 'montage', { status: 'awaiting_approval', approval: { credits: 9, quoteId: 'q-9', expiresAt: 9 } }),
  ]);
  render(<AgentRunCard state={base({ phase: 'running', runId: 'run-1', task: waiting, t0: Date.now() - 60_000 })} locale="en" {...h} />);
  const yes = screen.getByTestId('agent-run-approve');
  expect(yes.getAttribute('data-step')).toBe('cut');
  expect(yes.getAttribute('data-price')).toBe('9');
  fireEvent.click(yes);
  expect(h.onApprove).toHaveBeenCalledWith('cut', 'q-9');
  expect(screen.getByTestId('agent-run-stop')).toBeTruthy();
  expect(screen.queryByTestId('agent-run-start')).toBeNull();
});

test('ended part-way: Retry at the price of what is left; the log says what Agent G did', () => {
  const h = handlers();
  const partial = task('partially_completed', [
    step('sound', 'audio_extract', { status: 'completed', taskId: 't1', credits: 0, result: { url: 'https://x/a.mp3', media: 'audio' } }),
    step('cut', 'montage', { status: 'failed', taskId: 't2', error: 'render_failed' }),
  ]);
  render(<AgentRunCard state={base({ phase: 'ended', runId: 'run-1', task: partial, events: partial.events, t1: Date.now() })} locale="en" {...h} />);
  const retry = screen.getByTestId('agent-run-retry');
  expect(retry.getAttribute('data-price')).toBe('6');
  fireEvent.click(retry);
  expect(h.onRetry).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('agent-run-log').textContent).toMatch(/What Agent G did/);
  expect(screen.queryByTestId('agent-run-stop')).toBeNull();
});

test('done: the whole list stays, ticked, with no buttons (ka)', () => {
  const done = task('completed', [
    step('sound', 'audio_extract', { status: 'completed', taskId: 't1', credits: 0, result: { url: 'https://x/a.mp3', media: 'audio' } }),
    step('cut', 'montage', { status: 'completed', taskId: 't2', credits: 6, result: { url: 'https://x/m.mp4', media: 'video', aspect: '16:9' } }),
  ]);
  render(<AgentRunCard state={base({ phase: 'ended', runId: 'run-1', task: done, t1: Date.now() })} locale="ka" {...handlers()} />);
  const states = Array.from(document.querySelectorAll('li[data-step]')).map((li) => li.getAttribute('data-state'));
  expect(states.every((s) => s === 'done')).toBe(true);
  expect(screen.queryByRole('button', { name: /დაწყება|შეჩერება|თავიდან ცდა/ })).toBeNull();
  expect(screen.getByTestId('agent-run-credits').textContent).toBe('დაიხარჯა ✦ 6 · მაქსიმუმ ✦ 6');
});
