/**
 * @jest-environment jsdom
 *
 * Agent G's cards as task panels: every phase draws the whole list (the card no longer vanishes when the work ends), the
 * buttons are the ones the step in front of the user needs, and folding hides the steps but never Stop.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { AgentMontageCard } from './AgentMontageCard';
import { AgentAudioCard } from './AgentAudioCard';
import { peaksOf } from './ChatAudioPlayer';
import type { MontageQuote } from '@/lib/agent/media/montageExec';
import type { AudioQuote } from '@/lib/agent/media/audioExtract';

const NAMES = ['a.mp4', 'b.mp4', 'c.mp4', 'song.mp3'];
const MQ: MontageQuote = { jobId: 'job-m', credits: 0, totalSec: 10.57, shots: 6, clips: 3, aspect: '16:9', beatSynced: true, bpm: 119, musicStartSec: 0, unusedFiles: [], expiresAt: 1 };
const AQ: AudioQuote = { jobId: 'job-a', credits: 0, source: 'file', host: null, name: 'clip.mp3', bytes: 2_000_000, contentType: 'video/mp4', rights: { status: 'own' }, bitrateKbps: 192, maxSec: 3600, expiresAt: 1 };
const noop = () => {};
const stepStates = () => Array.from(document.querySelectorAll('li[data-step]')).map((li) => li.getAttribute('data-state'));

test('the montage card is there from the first second, counting the uploads', () => {
  render(<AgentMontageCard state={{ phase: 'reading', names: NAMES, uploaded: 2, t0: Date.now() }} locale="en" onStart={noop} onCancel={noop} />);
  expect(screen.getByTestId('agent-montage-card').getAttribute('data-phase')).toBe('reading');
  expect(screen.getByText('0/8 steps')).toBeTruthy();
  expect(stepStates()).toEqual(['active', 'pending', 'pending', 'pending', 'pending', 'pending', 'pending', 'pending']);
  expect(screen.getByText('2/4')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Start/ })).toBeNull();
});

test('the plan offers Start and Cancel; a run offers Stop; done keeps every step ticked and no buttons', () => {
  const start = jest.fn();
  const { rerender } = render(<AgentMontageCard state={{ phase: 'quoted', names: NAMES, quote: MQ }} locale="en" onStart={start} onCancel={noop} />);
  fireEvent.click(screen.getByTestId('agent-montage-start'));
  expect(start).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('agent-montage-cancel')).toBeTruthy();
  expect(screen.getByText('Waiting for Start')).toBeTruthy();

  rerender(<AgentMontageCard state={{ phase: 'running', names: NAMES, quote: MQ, stage: 'normalize', pct: 40, t0: Date.now() }} locale="en" onStart={noop} onCancel={noop} />);
  expect(screen.getByTestId('agent-montage-stop')).toBeTruthy();
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('40');
  expect(document.querySelector('[aria-current="step"]')!.getAttribute('data-step')).toBe('normalize');

  rerender(<AgentMontageCard state={{ phase: 'done', names: NAMES, quote: MQ, stage: 'completed', t0: 1_000, t1: 73_000 }} locale="en" onStart={noop} onCancel={noop} />);
  expect(screen.getByTestId('agent-montage-card').getAttribute('data-phase')).toBe('done');
  expect(stepStates().every((s) => s === 'done')).toBe(true);
  expect(screen.getByText('8/8 steps')).toBeTruthy();
  expect(screen.getByText('1:12')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Stop|Start|Cancel/ })).toBeNull();
});

test('folding hides the steps, never the Stop button', () => {
  render(<AgentMontageCard state={{ phase: 'running', names: NAMES, quote: MQ, stage: 'stitch', t0: Date.now() }} locale="ka" onStart={noop} onCancel={noop} />);
  const header = screen.getByRole('button', { expanded: true });
  fireEvent.click(header);
  expect(screen.getByRole('button', { expanded: false })).toBeTruthy();
  expect(document.getElementById('agent-montage-card-steps')!.hidden).toBe(true);
  expect(screen.getByTestId('agent-montage-stop')).toBeTruthy();
});

test('the MP3 card names the user file and its rights, and offers the upload after a refused link', () => {
  const { rerender } = render(<AgentAudioCard state={{ phase: 'quoted', quote: AQ }} locale="en" onStart={noop} onCancel={noop} onUpload={noop} />);
  expect(screen.getByTestId('agent-audio-rights').getAttribute('data-rights')).toBe('own');
  expect(screen.getByTestId('agent-audio-rights').textContent).toBe('yours');
  expect(screen.getByTestId('agent-audio-start').textContent).toContain('free');

  const upload = jest.fn();
  rerender(<AgentAudioCard state={{ phase: 'failed', source: 'link', error: 'platform', offerUpload: true }} locale="en" onStart={noop} onCancel={noop} onUpload={upload} />);
  expect(stepStates()[0]).toBe('failed');
  fireEvent.click(screen.getByTestId('agent-audio-upload'));
  expect(upload).toHaveBeenCalledTimes(1);
});

test('the audio row draws the real loudness: each slice its loudest sample, the loudest slice full height', () => {
  const data = new Float32Array([0, 0.1, -0.5, 0.2, 0.05, -0.05, 0.25, 0]);
  const peaks = peaksOf(data, 4);
  [0.2, 1, 0.12, 0.5].forEach((v, i) => expect(peaks[i]).toBeCloseTo(v, 5));
});

test('a card stopped or failed while it ran offers Retry when the studio can ask again; the credits line says what it cost', () => {
  const retry = jest.fn();
  const { unmount } = render(<AgentMontageCard state={{ phase: 'failed', names: NAMES, quote: MQ, stage: 'stitch', error: 'render_failed', t0: 1, t1: 2 }} locale="en" onStart={noop} onCancel={noop} onRetry={retry} />);
  fireEvent.click(screen.getByTestId('agent-montage-retry'));
  expect(retry).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('agent-montage-credits').textContent).toBe('Free, nothing is charged');
  unmount();
  // No Retry offered (the studio could not ask again): none drawn; a plan still shows its own buttons, no credits line.
  const { unmount: u2 } = render(<AgentAudioCard state={{ phase: 'cancelled', source: 'file', quote: AQ, t0: 1, t1: 2 }} locale="en" onStart={noop} onCancel={noop} onUpload={noop} />);
  expect(screen.queryByTestId('agent-audio-retry')).toBeNull();
  u2();
  render(<AgentMontageCard state={{ phase: 'quoted', names: NAMES, quote: MQ }} locale="en" onStart={noop} onCancel={noop} onRetry={retry} />);
  expect(screen.queryByTestId('agent-montage-retry')).toBeNull();
  expect(screen.queryByTestId('agent-montage-credits')).toBeNull();
});
