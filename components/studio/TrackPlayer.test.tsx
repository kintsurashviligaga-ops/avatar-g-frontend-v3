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


test('primary Music Create player renders the new preview card, not the retired giant note artwork', () => {
  render(<TrackPlayer url="https://storage.example/new-music.mp3" label="მუსიკა" locale="ka" engine="Lyria" />);
  expect(screen.getByTestId('music-primary-result-player')).toBeTruthy();
  expect(screen.getByTestId('music-preview-card')).toBeTruthy();
  expect(screen.getByTestId('music-player').getAttribute('src')).toBe('https://storage.example/new-music.mp3');
  expect(screen.getByRole('button', { name: 'დაკვრა' })).toBeTruthy();
  expect(screen.getByRole('slider', { name: 'ხმა' })).toBeTruthy();
  expect(screen.getByText('Generated with Lyria')).toBeTruthy();
});

test('English labels, supplied cover and real signed URL survive primary-player handoff', () => {
  const url = 'https://storage.example/song.mp3?token=private';
  const { container } = render(<TrackPlayer url={url} label="Music" locale="en" coverUrl="https://storage.example/art.jpg" />);
  expect(screen.getByTestId('music-player')).toHaveAttribute('src', url);
  expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
  expect(container.querySelector('img')).toHaveAttribute('src', 'https://storage.example/art.jpg');
});
