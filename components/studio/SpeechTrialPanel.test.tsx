/**
 * @jest-environment jsdom
 *
 * The owner's read-aloud trial panel: nothing without a `?tts=` trial; with one, the model and what each read took.
 */
import { act, render, screen } from '@testing-library/react';
import { SpeechTrialPanel } from './SpeechTrialPanel';
import { speechTrialRecorder } from '../../lib/speech/trial';

afterEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState({}, '', '/');
});

test('renders nothing without a trial (every ordinary visit)', () => {
  const { container } = render(<SpeechTrialPanel locale="ka" />);
  expect(container.innerHTML).toBe('');
});

test('with a trial: the model, a hint, then the first sound, the waits and each chunk', () => {
  window.history.replaceState({}, '', '/ka/dashboard?tts=gemini-3.8-flash-lite-tts');
  render(<SpeechTrialPanel locale="ka" />);
  expect(screen.getByText(/ხმის ტესტი: gemini-3\.8-flash-lite-tts/)).toBeTruthy();
  expect(screen.getByText('დააჭირე დინამიკს რომელიმე პასუხზე')).toBeTruthy();

  const rec = speechTrialRecorder();
  const now = jest.spyOn(Date, 'now');
  act(() => {
    now.mockReturnValue(10_000);
    rec.onState({ status: 'loading', owner: 'omni:c:0', index: 0 });
    rec.onChunk({ chars: 10, synthMs: 1_900, audioMs: 800 });
    now.mockReturnValue(12_100);
    rec.onState({ status: 'playing', owner: 'omni:c:0', index: 0 });
  });
  expect(screen.getByText('პირველი ხმა: 2.1 s · შეჩერება: 0 (0.0 s)')).toBeTruthy();
  expect(screen.getByText('#1 10 სიმბ. → 1.9 s · აუდიო 0.8 s')).toBeTruthy();
  now.mockRestore();
});

test("a chunk that came back without audio says why (the owner's 3.8 trial read nothing, 2026-10-24)", () => {
  window.history.replaceState({}, '', '/ka/dashboard?tts=gemini-3.8-flash-tts');
  render(<SpeechTrialPanel locale="ka" />);
  const rec = speechTrialRecorder();
  act(() => {
    rec.onState({ status: 'loading', owner: 'omni:c:2', index: 0 });
    rec.onChunk({ chars: 81, synthMs: 1_200, audioMs: null, miss: '502 tts_failed · Google 404 NOT_FOUND: Publisher Model … was not found' });
  });
  expect(screen.getByText('#1 81 სიმბ. → 1.2 s · ✗')).toBeTruthy();
  expect(screen.getByText('502 tts_failed · Google 404 NOT_FOUND: Publisher Model … was not found')).toBeTruthy();
});

test('the labels follow the studio language', () => {
  window.history.replaceState({}, '', '/en/dashboard?tts=gemini-3.8-flash-tts');
  render(<SpeechTrialPanel locale="en" />);
  expect(screen.getByText(/^Voice trial:/)).toBeTruthy();
});

test('GG 2026-11-06: under the first chunks, where the time went (Google, our server, the network, our slow steps)', () => {
  window.history.replaceState({}, '', '/ka/dashboard?tts=gemini-2.5-flash-preview-tts');
  render(<SpeechTrialPanel locale="ka" />);
  const rec = speechTrialRecorder();
  const timing = {
    googleMs: 3_900,
    attempts: 1,
    oursMs: 640,
    networkMs: 260,
    steps: [{ phase: 'budget' as const, ms: 320 }, { phase: 'auth' as const, ms: 180 }],
  };
  act(() => {
    rec.onState({ status: 'loading', owner: 'omni:c:3', index: 0 });
    for (let i = 0; i < 4; i++) rec.onChunk({ chars: 23, synthMs: 4_800, audioMs: 2_100, timing: { ...timing, attempts: i + 1 } });
  });
  expect(screen.getByText('Google 3.9 s · სერვერი 0.6 s · ქსელი 0.3 s')).toBeTruthy();
  expect(screen.getByText('Google 3.9 s (2×) · სერვერი 0.6 s · ქსელი 0.3 s')).toBeTruthy();
  expect(screen.getAllByText('budget 0.3 · auth 0.2')).toHaveLength(3);
  // Only the first three rows carry it: the card stays small on a phone.
  expect(screen.queryByText('Google 3.9 s (4×) · სერვერი 0.6 s · ქსელი 0.3 s')).toBeNull();
});

test('GG 2026-11-06: rows are numbered by their place in the read, not by the order the answers came in', () => {
  window.history.replaceState({}, '', '/ka/studio?tts=gemini-2.5-flash-preview-tts');
  render(<SpeechTrialPanel locale="ka" />);
  const rec = speechTrialRecorder();
  act(() => {
    rec.onState({ status: 'loading', owner: 'omni:c:7', index: 0 });
    rec.onChunk({ index: 1, chars: 61, synthMs: 6_400, audioMs: 4_700 });
    rec.onChunk({ index: 0, chars: 43, synthMs: 7_900, audioMs: 4_600 });
  });
  const rows = screen.getAllByText(/^#\d/).map((el) => el.textContent ?? '');
  expect(rows[0]).toMatch(/^#1 43 სიმბ\. → 7\.9 s/);
  expect(rows[1]).toMatch(/^#2 61 სიმბ\. → 6\.4 s/);
});

test('a chunk served by a fresh instance says how long the route took to load, inside the network figure', () => {
  window.history.replaceState({}, '', '/ka/studio?tts=gemini-2.5-flash-preview-tts');
  render(<SpeechTrialPanel locale="ka" />);
  const rec = speechTrialRecorder();
  const timing = { googleMs: 3_200, attempts: 1, oursMs: 900, networkMs: 2_900, steps: [] };
  act(() => {
    rec.onState({ status: 'loading', owner: 'omni:c:8', index: 0 });
    rec.onChunk({ index: 0, chars: 43, synthMs: 7_000, audioMs: 4_600, timing: { ...timing, coldMs: 1_200 } });
    rec.onChunk({ index: 1, chars: 61, synthMs: 6_400, audioMs: 4_700, timing });
  });
  expect(screen.getByText('Google 3.2 s · სერვერი 0.9 s · ქსელი 2.9 s (ცივი სტარტი 1.2 s)')).toBeTruthy();
  expect(screen.getByText('Google 3.2 s · სერვერი 0.9 s · ქსელი 2.9 s')).toBeTruthy();
});
