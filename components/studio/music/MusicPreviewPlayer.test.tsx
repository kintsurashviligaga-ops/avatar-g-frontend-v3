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

test('the real signed audio URL loads without crossOrigin, autoplay or any Web Audio setup', () => {
  render(<MusicPreviewPlayer src={sample} locale="ka" title="ჩემი მუსიკა" durationSec={30} />);
  const audio = screen.getByTestId('music-player');
  expect(audio).toHaveAttribute('src', sample);
  expect(audio).not.toHaveAttribute('crossorigin');
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  expect(screen.getByText('ჩემი მუსიკა')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'დაკვრა' })).toBeInTheDocument();
});

test('volume and mute UI are completely absent on every locale and layout', () => {
  for (const locale of ['ka', 'en', 'ru']) {
    const view = render(<MusicPreviewPlayer src={sample} locale={locale} compact />);
    expect(screen.queryByTestId('music-volume-slider')).not.toBeInTheDocument();
    expect(screen.queryByTestId('music-device-volume')).not.toBeInTheDocument();
    expect(screen.queryByRole('slider', { name: /volume|ხმის|громкость/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mute|unmute|ხმის|звук/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('slider')).toHaveLength(1); // seek, not volume
    view.unmount();
  }
});

test('play, pause, seek, skip and repeat remain connected to the real media element', () => {
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
  fireEvent.change(screen.getByRole('slider', { name: 'Seek' }), { target: { value: '21' } });
  expect(audio.currentTime).toBe(21);
  fireEvent.click(screen.getByRole('button', { name: 'Repeat' }));
  expect(audio.loop).toBe(true);
  expect(screen.getByRole('button', { name: 'Repeat' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.pause(audio);
  expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
});

test('switching tracks resets the player instead of carrying over progress', () => {
  const view = render(<MusicPreviewPlayer src={sample} locale="en" durationSec={30} />);
  const audio = screen.getByTestId('music-player') as HTMLAudioElement;
  audio.currentTime = 12;
  fireEvent.timeUpdate(audio);
  expect(screen.getByText('0:12')).toBeInTheDocument();
  view.rerender(<MusicPreviewPlayer src={sample + '2'} locale="en" durationSec={30} />);
  expect(audio).toHaveAttribute('src', sample + '2');
  expect(screen.getByText('0:00')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
});

test('no extra titles; artwork and Russian playback error still work', () => {
  const view = render(<MusicPreviewPlayer src={sample} locale="ka" title="მუსიკა" />);
  expect(screen.queryByText('MyAvatar Music Studio')).not.toBeInTheDocument();
  expect(screen.queryByText('მუსიკა')).not.toBeInTheDocument();
  expect(screen.queryByText('მუსიკის პრევიუ')).not.toBeInTheDocument();
  view.rerender(<MusicPreviewPlayer src={sample} locale="ru" coverUrl="https://storage.example.test/cover.jpg" />);
  expect(screen.getByRole('button', { name: 'Воспроизвести' })).toBeInTheDocument();
  expect(view.container.querySelector('img')).toHaveAttribute('src', 'https://storage.example.test/cover.jpg');
  fireEvent.error(screen.getByTestId('music-player'));
  expect(screen.getByRole('alert')).toHaveTextContent('Не удалось');
});
