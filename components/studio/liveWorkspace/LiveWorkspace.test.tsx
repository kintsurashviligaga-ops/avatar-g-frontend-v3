/**
 * @jest-environment jsdom
 *
 * Live Agent Workspace (Phase 7, mocked): the run timeline, the approval center and their buttons.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { reduceAll, type TimelineEvent } from '@/lib/agent/liveWorkspace/model';
import { ApprovalCenter } from './ApprovalCenter';
import { LiveWorkspace } from './LiveWorkspace';
import { RunTimeline } from './RunTimeline';
import { WORDS } from './labels';

const T0 = Date.now();
const plan: TimelineEvent = { type: 'run.planned', runId: 'r', at: T0, data: { goal: 'Research', maxCredits: 10, steps: [
  { id: 'a', title: 'Plan', tool: 'gemini' }, { id: 'b', title: 'Search 1', tool: 'search', dependsOn: ['a'] }, { id: 'c', title: 'Search 2', tool: 'search', dependsOn: ['a'] },
] } };

test('the timeline shows state, credits, percent with step count, parallel marks and the right buttons', () => {
  const st = reduceAll([plan, { type: 'step.started', runId: 'r', stepId: 'a', at: T0 }, { type: 'run.cost', runId: 'r', at: T0, data: { creditsSpent: 2 } }]);
  const onPause = jest.fn();
  render(<RunTimeline run={st.runs.r!} w={WORDS.en} onPause={onPause} onCancel={jest.fn()} />);
  expect(screen.getByTestId('run-timeline').getAttribute('data-state')).toBe('running');
  expect(screen.getByTestId('run-credits').textContent).toBe('✦2 / ✦10');
  expect(screen.getByRole('progressbar').getAttribute('aria-valuetext')).toMatch(/0\/3 steps/);
  expect(screen.getAllByTestId('parallel-mark')).toHaveLength(2);
  expect(screen.getByTestId('run-dots').querySelectorAll('li')).toHaveLength(3);
  fireEvent.click(screen.getByTestId('run-pause'));
  expect(onPause).toHaveBeenCalled();
  expect(screen.queryByTestId('run-resume')).toBeNull();
});

test('a finished run has no buttons', () => {
  const st = reduceAll([plan, { type: 'run.delivered', runId: 'r', at: T0, data: { cancelled: true } }]);
  render(<RunTimeline run={st.runs.r!} w={WORDS.ka} onPause={jest.fn()} onCancel={jest.fn()} />);
  expect(screen.queryByTestId('run-cancel')).toBeNull();
  expect(screen.getByText('გაუქმდა')).toBeTruthy();
});

test('the approval center: a sensitive action says it needs a tap; answering calls back once per tap', () => {
  const st = reduceAll([plan, { type: 'step.needs_approval', runId: 'r', stepId: 'b', at: T0, data: { id: 'p1', kind: 'sensitive', title: 'Pay', scope: 'card field', credits: null, reason: 'card field on page', expiresAt: T0 + 60_000 } }]);
  const onAnswer = jest.fn();
  render(<ApprovalCenter state={st} w={WORDS.en} onAnswer={onAnswer} />);
  const card = screen.getByTestId('approval-card');
  expect(card.getAttribute('data-kind')).toBe('sensitive');
  expect(within(card).getByText(WORDS.en.tapToAllow)).toBeTruthy();
  expect(within(card).getByText('no credits')).toBeTruthy();
  expect(screen.getByTestId('approval-count').textContent).toBe('1');
  fireEvent.click(screen.getByTestId('approval-decline'));
  expect(onAnswer).toHaveBeenCalledWith('p1', 'declined');
});

test('empty approval center says nothing is waiting', () => {
  render(<ApprovalCenter state={reduceAll([plan])} w={WORDS.ru} />);
  expect(screen.getByText(WORDS.ru.noApprovals)).toBeTruthy();
});

test('the mocked workspace replays: plan approval appears, a yes starts the parallel searches', () => {
  jest.useFakeTimers();
  try {
    render(<LiveWorkspace locale="en" />);
    expect(screen.getByTestId('mock-banner')).toBeTruthy();
    act(() => { jest.advanceTimersByTime(7000); });
    const cards = screen.getAllByTestId('approval-card');
    expect(cards.map((c) => c.getAttribute('data-approval')).sort()).toEqual(['apr_pay_train', 'apr_plan_wine']);
    const plan = cards.find((c) => c.getAttribute('data-approval') === 'apr_plan_wine')!;
    fireEvent.click(within(plan).getByTestId('approval-approve'));
    act(() => { jest.advanceTimersByTime(1500); });
    const wine = screen.getAllByTestId('run-timeline').find((r) => r.getAttribute('data-run') === 'run_wine')!;
    expect(wine.querySelector('li[data-step="s1"]')!.getAttribute('data-state')).toBe('active');
    expect(wine.querySelector('li[data-step="s2"]')!.getAttribute('data-state')).toBe('active');
  } finally {
    jest.useRealTimers();
  }
});
