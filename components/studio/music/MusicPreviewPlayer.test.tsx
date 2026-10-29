/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { MusicPreviewPlayer } from './MusicPreviewPlayer';

const src = 'https://storage.example.test/track.mp3?signature=private';

beforeEach(() => {
  jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  // jsdom doesn't implement 2D canvas; the canvas visualizer safely no-ops.
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => jest.restoreAllMocks());

test('inline borderless preview uses the REAL signed URL, without autoplay/CORS or provider calls', () => {
  render(<MusicPreviewPlayer src={src} locale="ka" title="ჩემი სიმღერა" durationSec={30} />);
  expect(screen.getByTestId('music-player')).toHaveAttribute('src', src);
  expect(screen.getByTestId('music-player')).not.toHaveAttribute('crossorigin');
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  expect(screen.getByText('ჩემი სიმღერა')).toBeInTheDocument();
  expect(screen.getByTestId('music-preview-card')).not.toHaveClass('rounded-[22px]');
  expect(screen.getByTestId('music-particle-canvas')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'დაკვრა' })).toBeInTheDocument();
});

test('hero particle diamond pauses and resumes with the actual audio element', () => {
  render(<MusicPreviewPlayer src={src} locale="en" durationSec={30} />);
  const audio = screen.getByTestId('music-player');
  const visual = screen.getByTestId('music-equalizer');
  expect(visual).toHaveAttribute('data-playing', 'false');
  fireEvent.click(screen.getByRole('button', { name: 'Play' }));
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  fireEvent.play(audio);
  expect(visual).toHaveAttribute('data-playing', 'true');
  expect(screen.getByRole('button', { name: 'Pause' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.pause(audio);
  expect(visual).toHaveAttribute('data-playing', 'false');
});

test('time pill and seek control work on generated tracks', () => {
  render(<MusicPreviewPlayer src={src} locale="en" durationSec={62} />);
  const audio = screen.getByTestId('music-player') as HTMLAudioElement;
  expect(screen.getByTestId('music-time-pill')).toHaveTextContent('00:00 / 01:02');
  audio.currentTime = 13;
  fireEvent.timeUpdate(audio);
  expect(screen.getByTestId('music-time-pill')).toHaveTextContent('00:13 / 01:02');
  fireEvent.change(screen.getByRole('slider', { name: 'Seek' }), { target: { value: '24' } });
  expect(audio.currentTime).toBe(24);
});

test('all languages and compact mode have exactly one slider, never fake volume or repeat controls', () => {
  for (const locale of ['ka', 'en', 'ru']) {
    const rendered = render(<MusicPreviewPlayer src={src} locale={locale} compact />);
    expect(screen.getAllByRole('slider')).toHaveLength(1);
    expect(screen.queryByTestId('music-volume-slider')).not.toBeInTheDocument();
    expect(screen.queryByTestId('music-repeat-toggle')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mute|unmute|volume|ხმა|звук|repeat|გამეორება|повтор/i })).not.toBeInTheDocument();
    rendered.unmount();
  }
});

test('switching track URL resets play state and progress', () => {
  const view = render(<MusicPreviewPlayer src={src} locale="en" durationSec={30} />);
  const audio = screen.getByTestId('music-player') as HTMLAudioElement;
  audio.currentTime = 18;
  fireEvent.timeUpdate(audio);
  expect(screen.getByTestId('music-time-pill')).toHaveTextContent('00:18');
  view.rerender(<MusicPreviewPlayer src={src + '2'} locale="en" durationSec={30} />);
  expect(audio).toHaveAttribute('src', src + '2');
  expect(screen.getByTestId('music-time-pill')).toHaveTextContent('00:00 / 00:30');
  expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
});

test('generic labels are not repeated; playback errors are shown and localized', () => {
  const view = render(<MusicPreviewPlayer src={src} locale="ka" title="მუსიკა" />);
  expect(screen.queryByText('მუსიკა')).not.toBeInTheDocument();
  view.rerender(<MusicPreviewPlayer src={src} locale="ru" />);
  fireEvent.error(screen.getByTestId('music-player'));
  expect(screen.getByRole('alert')).toHaveTextContent('Не удалось');
  expect(screen.getByRole('button', { name: 'Воспроизвести' })).toBeInTheDocument();
});


test('owner reference replaces the diamond with muted, looping, inline smoke video', () => {
  render(<MusicPreviewPlayer src={src} locale="en" durationSec={30} />);
  const clip = screen.getByTestId('music-smoke-video') as HTMLVideoElement;
  expect(clip).toHaveAttribute('src', '/media/smoke-orb-preview.mp4');
  expect(clip.muted).toBe(true);
  expect(clip.loop).toBe(true);
  expect(clip).toHaveAttribute('playsinline');
  expect(clip).not.toHaveAttribute('controls');
  expect(screen.getByTestId('music-player')).toHaveAttribute('src', src);
  expect(screen.getByTestId('music-smoke-orb')).toBeInTheDocument();
  expect(screen.getByTestId('music-particle-canvas')).toBeInTheDocument();
});

test('decoration follows real audio play and pause but never overrides the signed audio source', () => {
  render(<MusicPreviewPlayer src={src} locale="en" durationSec={30} />);
  const audio = screen.getByTestId('music-player');
  const video = screen.getByTestId('music-smoke-video') as HTMLVideoElement;
  expect(screen.getByTestId('music-equalizer')).toHaveAttribute('data-playing', 'false');
  fireEvent.play(audio);
  expect(screen.getByTestId('music-equalizer')).toHaveAttribute('data-playing', 'true');
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  fireEvent.pause(audio);
  expect(screen.getByTestId('music-equalizer')).toHaveAttribute('data-playing', 'false');
  expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  expect(video.muted).toBe(true);
  expect(audio).toHaveAttribute('src', src);
});

test('seeking changes the real song and retains a single progress slider', () => {
  render(<MusicPreviewPlayer src={src} locale="ka" durationSec={62} />);
  const audio = screen.getByTestId('music-player') as HTMLAudioElement;
  fireEvent.change(screen.getByRole('slider', { name: 'გადახვევა' }), { target: { value: '42' } });
  expect(audio.currentTime).toBe(42);
  expect(screen.getByTestId('music-time-pill')).toHaveTextContent('00:42 / 01:02');
  expect(screen.getAllByRole('slider')).toHaveLength(1);
  expect(screen.queryByTestId('music-volume-slider')).not.toBeInTheDocument();
});
