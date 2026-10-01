/**
 * @jest-environment jsdom
 *
 * TrackPlayer's provenance line carries the music route's `controls.mode` as a note (components/studio/ui/
 * musicControlsCopy `musicControlsNote`): a Lyria track whose sliders were moved says they were approximate.
 */
import { render, screen } from '@testing-library/react';
import { TrackPlayer } from './TrackPlayer';
import { musicControlsNote } from './ui/musicControlsCopy';

beforeEach(() => {
  // jsdom has no canvas; the visualiser bails out when getContext returns null.
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => jest.restoreAllMocks());

test('the note follows the engine on the provenance line', () => {
  const note = musicControlsNote('prompt', { weirdness: 90, styleInfluence: 50 }, 'en');
  const { container } = render(<TrackPlayer url="https://storage.example/t.mp3" label="Music" engine="Lyria" note={note} />);
  expect(screen.getByText('Generated with Lyria')).toBeTruthy();
  expect(container.querySelector('[data-track-note]')!.textContent).toBe('· ≈ sliders approximate');
});

test('no note when the sliders were left alone — the line reads exactly as before', () => {
  const note = musicControlsNote('prompt', { weirdness: 50, styleInfluence: 50 }, 'en');
  const { container } = render(<TrackPlayer url="https://storage.example/t.mp3" label="Music" engine="Lyria" note={note} />);
  expect(screen.getByText('Generated with Lyria')).toBeTruthy();
  expect(container.querySelector('[data-track-note]')).toBeNull();
});
