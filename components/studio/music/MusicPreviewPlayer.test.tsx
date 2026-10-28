/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { MusicPreviewPlayer } from './MusicPreviewPlayer';

const sample = 'https://storage.example.test/signed/music.mp3?token=example';

beforeEach(() => {
  jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test('plays the real delivered URL, not a browser-generated demo or automatic paid request', () => {
  render(<MusicPreviewPlayer src={sample} locale="ka" title="ჩემი მუსიკა" durationSec={30} />);
  expect(screen.getByTestId('music-player')).toHaveAttribute('src', sample);
  expect(screen.getByText('ჩემი მუსიკა')).toBeInTheDocument();
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'დაკვრა' })).toBeInTheDocument();
  expect(screen.getByRole('slider', { name: 'ხმა' })).toBeInTheDocument();
});

test('playback state, rewind, seek, repeat and volume are connected to the media element', async () => {
  render(<MusicPreviewPlayer src={sample} locale="en" durationSec={40} />);
  const audio = screen.getByTestId('music-player') as HTMLAudioElement;
  fireEvent.click(screen.getByRole('button', { name: 'Play' }));
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  fireEvent.play(audio);
  expect(screen.getByRole('button', { name: 'Pause' })).toHaveAttribute('aria-pressed', 'true');

  audio.currentTime = 16;
  fireEvent.timeUpdate(audio);
  expect(screen.getByText('0:16')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Back 10 seconds' }));
  expect(audio.currentTime).toBe(6);
  fireEvent.change(screen.getByRole('slider', { name: 'Music preview' }), { target: { value: '21' } });
  expect(audio.currentTime).toBe(21);

  fireEvent.click(screen.getByRole('button', { name: 'Loop' }));
  expect(audio.loop).toBe(true);
  fireEvent.change(screen.getByRole('slider', { name: 'Volume' }), { target: { value: '0.35' } });
  expect(audio.volume).toBeCloseTo(0.35);
});

test('reports playback failures, supports Russian, and uses a compact layout', () => {
  render(<MusicPreviewPlayer src={sample} locale="ru" compact />);
  fireEvent.error(screen.getByTestId('music-player'));
  expect(screen.getByRole('alert')).toHaveTextContent('Не удалось воспроизвести');
  expect(screen.getByRole('button', { name: 'Воспроизвести' })).toBeInTheDocument();
});

test('switching result URL resets playback position and does not keep playing previous track', () => {
  const first = render(<MusicPreviewPlayer src={sample} locale="en" durationSec={30} />);
  const audio = screen.getByTestId('music-player') as HTMLAudioElement;
  audio.currentTime = 12;
  fireEvent.timeUpdate(audio);
  expect(screen.getByText('0:12')).toBeInTheDocument();
  first.rerender(<MusicPreviewPlayer src={sample + '2'} locale="en" durationSec={30} />);
  expect(audio).toHaveAttribute('src', sample + '2');
  expect(screen.getByText('0:00')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
});
