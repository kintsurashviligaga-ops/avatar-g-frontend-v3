/**
 * @jest-environment jsdom
 *
 * The analysis card under Agent G's answer: while it reads, the steps and no details; once done, the scenes as chips (the
 * whole line in the chip's title), the best moments, who speaks, the transcript folded, and what it cost the user.
 */
import { render, screen } from '@testing-library/react';
import { AgentAnalyzeCard } from './AgentAnalyzeCard';
import type { AgentAnalyzeState } from '@/lib/agent/media/analyzeChat';

const ANALYSIS = {
  summary: 'Two people talk.', language: 'en',
  scenes: [{ startSec: 0, endSec: 12, description: 'A street at night with long neon reflections on wet stones' }],
  moments: [{ atSec: 40, why: 'The laugh' }],
  transcript: [{ startSec: 3, speaker: 'A', text: 'Hello there.' }],
  speakers: [{ id: 'A', description: 'a woman in a red coat' }],
  objects: ['car'], answer: null, dropped: 0,
};

test('reading: the steps, the card working, no details yet', () => {
  const s: AgentAnalyzeState = { phase: 'reading', source: 'file', name: 'clip.mp4', uploaded: true, t0: Date.now() };
  render(<AgentAnalyzeCard state={s} locale="en" />);
  expect(screen.getByTestId('agent-analyze-card').getAttribute('data-phase')).toBe('reading');
  expect(screen.getByText('Gemini reads the whole file')).toBeTruthy();
  expect(screen.queryByTestId('agent-analyze-details')).toBeNull();
});

test('done: scenes as chips, moments, speakers, the folded transcript and the note', () => {
  const s: AgentAnalyzeState = { phase: 'done', source: 'file', name: 'clip.mp4', uploaded: true, answer: { analysis: ANALYSIS, type: 'video', durationSec: 75 }, t0: 1, t1: 2 };
  render(<AgentAnalyzeCard state={s} locale="en" />);
  const chip = screen.getByTestId('agent-analyze-scenes').querySelector('li')!;
  expect(chip.textContent).toContain('0:00–0:12');
  expect(chip.getAttribute('title')).toBe('A street at night with long neon reflections on wet stones');
  expect(screen.getByTestId('agent-analyze-moments').textContent).toContain('0:40 · The laugh');
  expect(screen.getByText('A: a woman in a red coat')).toBeTruthy();
  const transcript = screen.getByTestId('agent-analyze-transcript');
  expect(transcript.tagName).toBe('DETAILS');
  expect(transcript.hasAttribute('open')).toBe(false);
  expect(screen.getByTestId('agent-analyze-note').textContent).toBe('Free for you (within a daily limit)');
});

test('failed (ka): the reason on the step, no details', () => {
  render(<AgentAnalyzeCard state={{ phase: 'failed', source: 'youtube', name: 'YouTube', error: 'rate_limited' }} locale="ka" />);
  expect(screen.getByTestId('agent-analyze-card').textContent).toContain('დღეს ბევრი ანალიზი გააკეთე');
  expect(screen.queryByTestId('agent-analyze-details')).toBeNull();
});
