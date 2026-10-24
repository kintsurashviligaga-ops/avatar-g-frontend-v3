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
