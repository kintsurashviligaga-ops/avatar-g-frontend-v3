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

test('premium fluid canvas pauses and resumes with the actual audio element', () => {
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


test('premium fluid renderer replaces the MP4 and mechanical diamond with pure canvas', () => {
  render(<MusicPreviewPlayer src={src} locale="en" durationSec={30} />);
  const orb = screen.getByTestId('music-smoke-orb');
  expect(orb).toBeInTheDocument();
  expect(screen.getByTestId('music-equalizer')).toHaveAttribute('data-renderer', 'fluid-silk-canvas');
  expect(screen.getByTestId('music-particle-canvas')).toBeInTheDocument();
  expect(screen.queryByTestId('music-smoke-video')).not.toBeInTheDocument();
  expect(document.querySelector('video')).toBeNull();
  expect(screen.getByTestId('music-player')).toHaveAttribute('src', src);
});

test('the progress rail contains only one neutral hairline, no blue stripes', () => {
  render(<MusicPreviewPlayer src={src} locale="en" durationSec={30} />);
  const track = screen.getByTestId('music-seek-track');
  expect(track).toBeInTheDocument();
  expect(screen.getByTestId('music-seek-fill')).toHaveClass('bg-[#b6bfcc]');
  expect(screen.getByTestId('music-seek-thumb')).toHaveClass('bg-[#f0f3f8]');
  expect(track.querySelectorAll('input[type="range"]')).toHaveLength(1);
  expect(track.querySelectorAll('div')).toHaveLength(3);
  expect(screen.getByRole('slider', { name: 'Seek' })).toBeInTheDocument();
  expect(screen.getByTestId('music-seek-slider')).not.toHaveClass('music-preview-seek');
});

test('fluid canvas listens to the real audio play/pause, never changes the signed source', () => {
  render(<MusicPreviewPlayer src={src} locale="en" durationSec={30} />);
  const audio = screen.getByTestId('music-player');
  expect(screen.getByTestId('music-equalizer')).toHaveAttribute('data-playing', 'false');
  fireEvent.play(audio);
  expect(screen.getByTestId('music-equalizer')).toHaveAttribute('data-playing', 'true');
  fireEvent.pause(audio);
  expect(screen.getByTestId('music-equalizer')).toHaveAttribute('data-playing', 'false');
  expect(audio).toHaveAttribute('src', src);
  expect(audio).not.toHaveAttribute('crossorigin');
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


test('fluid preview stays ambient-only without accessible PCM, and has no bar or video widgets', () => {
  render(<MusicPreviewPlayer src={src} locale="ka" compact durationSec={30} />);
  const canvas = screen.getByTestId('music-particle-canvas');
  expect(canvas).toBeInTheDocument();
  expect(screen.getByTestId('music-equalizer')).toHaveAttribute('data-audio-reactive', 'ambient-only');
  expect(screen.queryByTestId('music-smoke-video')).not.toBeInTheDocument();
  expect(document.querySelector('video')).not.toBeInTheDocument();
  expect(document.querySelector('svg[data-equalizer-bar]')).not.toBeInTheDocument();
  expect(screen.getAllByRole('slider')).toHaveLength(1);
});
