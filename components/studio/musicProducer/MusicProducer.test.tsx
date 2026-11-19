import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ProducerControls } from './ProducerControls';
import { WaveformPlayer } from './WaveformPlayer';
import { LyricsPane } from './LyricsPane';
import { MusicCard, type MusicCardTrack } from './MusicCard';
import { MusicProducerPanel, type ProducerPost } from './MusicProducerPanel';
import { DEFAULT_SPEC, type ProducerSpec } from '@/lib/music/producer/spec';
import type { ProducerMeta } from '@/lib/music/producer/library';

const lines = [
  { text: 'first line', start: 2, end: 6, section: 'Verse 1' },
  { text: 'second line', start: 6, end: 10, section: 'Verse 1' },
  { text: 'chorus line', start: 10, end: 16, section: 'Chorus' },
];
const meta = (over: Partial<ProducerMeta> = {}): ProducerMeta => ({
  v: 1, kind: 'music-producer', id: 'trk-00000001', action: 'generate',
  spec: { ...DEFAULT_SPEC, genre: 'pop', moods: ['happy'], vocals: true, lengthSec: 30 }, model: 'lyria-3-clip-preview', input: '',
  lyrics: '', lines, timeline: [], durationSec: 30, bpm: 110, part: 0, parentId: null, credits: 6, book: 'v8',
  audioPath: 'music-producer/u1/trk-00000001.mp3', mime: 'audio/mpeg', createdAt: '2026-11-15T07:00:00Z', ...over,
});
const track = (over: Partial<ProducerMeta> = {}): MusicCardTrack => ({ id: 'trk-00000001', url: 'https://x/t.mp3', meta: meta(over) });
const peaks = Array.from({ length: 10 }, (_, i) => (i + 1) / 10);

beforeAll(() => {
  Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: jest.fn().mockResolvedValue(undefined) });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: jest.fn() });
});

describe('ProducerControls', () => {
  it('prices every length (v8: 30 s ✦6, 1/2/3 min ✦11) and caps moods at 2', () => {
    const onChange = jest.fn();
    const spec: ProducerSpec = { ...DEFAULT_SPEC, moods: ['happy', 'sad'] };
    render(<ProducerControls value={spec} onChange={onChange} book="v8" lang="en" />);
    expect(screen.getByTestId('mp-length-30')).toHaveTextContent('✦6');
    expect(screen.getByTestId('mp-length-60')).toHaveTextContent('✦11');
    expect(screen.getByTestId('mp-length-180')).toHaveTextContent('✦11');
    expect(screen.getByTestId('mp-mood-calm')).toBeDisabled();
    fireEvent.click(screen.getByTestId('mp-length-120'));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ lengthSec: 120 }));
  });
  it('today book shows the live prices', () => {
    render(<ProducerControls value={DEFAULT_SPEC} onChange={jest.fn()} book="today" lang="en" />);
    expect(screen.getByTestId('mp-length-30')).toHaveTextContent('✦3');
  });
  it('tempo is Auto until set, then a target BPM', () => {
    const onChange = jest.fn();
    const { rerender } = render(<ProducerControls value={DEFAULT_SPEC} onChange={onChange} book="v8" lang="en" />);
    expect(screen.getByTestId('mp-bpm')).toBeDisabled();
    fireEvent.click(screen.getByTestId('mp-bpm-auto'));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ bpm: 100 }));
    rerender(<ProducerControls value={{ ...DEFAULT_SPEC, bpm: 100 }} onChange={onChange} book="v8" lang="en" />);
    fireEvent.change(screen.getByTestId('mp-bpm'), { target: { value: '72' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ bpm: 72 }));
  });
  it('Georgian carries a small Beta tag, stays selectable; no stems control anywhere', () => {
    const onChange = jest.fn();
    render(<ProducerControls value={{ ...DEFAULT_SPEC, vocals: true }} onChange={onChange} book="v8" lang="ka" />);
    expect(screen.getByTestId('mp-lang-ka')).toContainElement(screen.getByTestId('mp-georgian-beta'));
    expect(screen.getByTestId('mp-georgian-beta')).toHaveTextContent('ბეტა');
    fireEvent.click(screen.getByTestId('mp-lang-ka'));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ language: 'ka' }));
    expect(screen.queryByText(/stem/i)).toBeNull();
  });
  it('Georgian script with language Auto shows Beta on the Vocals chip', () => {
    render(<ProducerControls value={{ ...DEFAULT_SPEC, vocals: true, brief: 'სიყვარულის სიმღერა' }} onChange={jest.fn()} book="v8" lang="en" />);
    expect(screen.getByTestId('mp-georgian-beta-auto')).toBeInTheDocument();
  });
  it('Instrumental clears lyrics and hides the lyric/voice/language rows', () => {
    const onChange = jest.fn();
    render(<ProducerControls value={{ ...DEFAULT_SPEC, vocals: true, autoLyrics: false, lyrics: '[Verse] x' }} onChange={onChange} book="v8" lang="en" />);
    expect(screen.getByTestId('mp-lyrics')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mp-instrumental'));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ vocals: false, lyrics: '', autoLyrics: false }));
  });
});

describe('WaveformPlayer (mocked audio)', () => {
  it('draws the given peaks, seeks on click, keys move 5 s, play toggles', () => {
    const onTime = jest.fn();
    render(<WaveformPlayer url="https://x/t.mp3" durationSec={40} peaks={peaks} onTime={onTime} label="song" />);
    const wave = screen.getByTestId('mp-wave');
    expect(wave.querySelectorAll('span')).toHaveLength(10);
    jest.spyOn(wave, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 200, top: 0, height: 48, right: 200, bottom: 48, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.click(wave, { clientX: 100 });
    expect(onTime).toHaveBeenLastCalledWith(20);
    expect(screen.getByTestId('mp-time')).toHaveTextContent('0:20 / 0:40');
    expect(wave.querySelectorAll('[data-played="1"]')).toHaveLength(5);
    fireEvent.keyDown(wave, { key: 'ArrowRight' });
    expect(onTime).toHaveBeenLastCalledWith(25);
    fireEvent.keyDown(wave, { key: 'ArrowLeft' });
    fireEvent.keyDown(wave, { key: 'ArrowLeft' });
    expect(onTime).toHaveBeenLastCalledWith(15);
    fireEvent.click(screen.getByTestId('mp-play'));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });
  it('follows the audio element\'s time', () => {
    const onTime = jest.fn();
    const { container } = render(<WaveformPlayer url="https://x/t.mp3" durationSec={30} peaks={peaks} onTime={onTime} label="song" />);
    const audio = container.querySelector('audio') as HTMLAudioElement;
    Object.defineProperty(audio, 'currentTime', { configurable: true, value: 12, writable: true });
    fireEvent.timeUpdate(audio);
    expect(onTime).toHaveBeenLastCalledWith(12);
  });
});

describe('LyricsPane (lyric sync)', () => {
  it('lights the line being sung, says "Synced by section", a click seeks', () => {
    const onSeek = jest.fn();
    const { rerender } = render(<LyricsPane lines={lines} time={7} onSeek={onSeek} lang="en" />);
    expect(screen.getByTestId('mp-synced')).toHaveTextContent('Synced by section');
    expect(screen.getByTestId('mp-line-1')).toHaveAttribute('aria-current', 'true');
    rerender(<LyricsPane lines={lines} time={12} onSeek={onSeek} lang="en" />);
    expect(screen.getByTestId('mp-line-2')).toHaveAttribute('aria-current', 'true');
    expect(screen.getByTestId('mp-line-1')).not.toHaveAttribute('aria-current');
    fireEvent.click(screen.getByTestId('mp-line-0'));
    expect(onSeek).toHaveBeenCalledWith(2);
  });
  it('an instrumental has no pane', () => {
    const { container } = render(<LyricsPane lines={[]} time={0} onSeek={jest.fn()} lang="en" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('MusicCard', () => {
  it('honest labels and prices; clicking a lyric line moves the player; no stems', () => {
    const onExtend = jest.fn();
    render(<MusicCard track={track()} lang="en" busy={false} extendCredits={6} restyleCredits={6} onExtend={onExtend} onRestyle={jest.fn()} onUseInVideo={jest.fn()} peaks={peaks} />);
    expect(screen.getByTestId('mp-extend')).toHaveTextContent('Add 30 s (new section, same style) ✦6');
    expect(screen.getByTestId('mp-restyle')).toHaveTextContent('Restyle (new take) ✦6');
    expect(screen.getByTestId('mp-use-in-video')).toBeEnabled();
    expect(screen.queryByText(/stem/i)).toBeNull();
    fireEvent.click(screen.getByTestId('mp-line-2'));
    expect(screen.getByTestId('mp-time')).toHaveTextContent('0:10 / 0:30');
    expect(screen.getByTestId('mp-line-2')).toHaveAttribute('aria-current', 'true');
    fireEvent.click(screen.getByTestId('mp-extend'));
    expect(onExtend).toHaveBeenCalledWith('trk-00000001');
  });
  it('Restyle opens the style picker and sends only the style', () => {
    const onRestyle = jest.fn();
    render(<MusicCard track={track()} lang="en" busy={false} extendCredits={6} restyleCredits={6} onExtend={jest.fn()} onRestyle={onRestyle} peaks={peaks} />);
    fireEvent.click(screen.getByTestId('mp-restyle'));
    fireEvent.click(screen.getByTestId('mp-restyle-genre-jazz'));
    fireEvent.click(screen.getByTestId('mp-restyle-go'));
    expect(onRestyle).toHaveBeenCalledWith('trk-00000001', { genre: 'jazz', moods: ['happy'] });
  });
  it('Add 30 s is off at the 8-minute cap; Use in Video off until wired', () => {
    render(<MusicCard track={track({ durationSec: 470 })} lang="en" busy={false} extendCredits={6} restyleCredits={11} onExtend={jest.fn()} onRestyle={jest.fn()} peaks={peaks} />);
    expect(screen.getByTestId('mp-extend')).toBeDisabled();
    expect(screen.getByTestId('mp-use-in-video')).toBeDisabled();
  });
});

describe('MusicProducerPanel (mocked routes)', () => {
  const spec: ProducerSpec = { ...DEFAULT_SPEC, genre: 'pop', vocals: true };
  it('Create shows the exact price, posts the spec, and the card appears; extend posts the parent', async () => {
    const post = jest.fn<ReturnType<ProducerPost>, Parameters<ProducerPost>>(async (_p, body) => ({
      ok: true, status: 200,
      json: { ok: true, id: (body as { action: string }).action === 'extend' ? 'trk-00000002' : 'trk-00000001', url: 'https://x/t.mp3', meta: meta((body as { action: string }).action === 'extend' ? { id: 'trk-00000002', part: 1, durationSec: 56 } : {}) },
    }));
    render(<MusicProducerPanel lang="en" book="v8" post={post} initialSpec={spec} />);
    expect(screen.getByTestId('mp-create')).toHaveTextContent('Create · ✦6');
    await act(async () => { fireEvent.click(screen.getByTestId('mp-create')); });
    expect(post).toHaveBeenCalledWith('/api/music/producer', expect.objectContaining({ action: 'generate', spec: expect.objectContaining({ genre: 'pop', lengthSec: 30 }) }));
    await waitFor(() => expect(screen.getByTestId('mp-card-trk-00000001')).toBeInTheDocument());
    await act(async () => { fireEvent.click(screen.getByTestId('mp-extend')); });
    expect(post).toHaveBeenLastCalledWith('/api/music/producer', { action: 'extend', parentId: 'trk-00000001' });
    await waitFor(() => expect(screen.getByTestId('mp-card-trk-00000002')).toBeInTheDocument());
  });
  it('a failed track says the credits were returned', async () => {
    const post: ProducerPost = async () => ({ ok: false, status: 502, json: { ok: false, error: 'provider_unavailable' } });
    render(<MusicProducerPanel lang="en" book="v8" post={post} initialSpec={spec} />);
    await act(async () => { fireEvent.click(screen.getByTestId('mp-create')); });
    expect(screen.getByTestId('mp-error')).toHaveTextContent('Your credits were returned');
  });
  it('a 1 min song costs ✦11; an empty brief cannot be sent', () => {
    const { rerender } = render(<MusicProducerPanel lang="en" book="v8" post={jest.fn()} initialSpec={{ ...spec, lengthSec: 60 }} />);
    expect(screen.getByTestId('mp-create')).toHaveTextContent('✦11');
    rerender(<MusicProducerPanel key="2" lang="en" book="v8" post={jest.fn()} initialSpec={{ ...DEFAULT_SPEC }} />);
    expect(screen.getByTestId('mp-create')).toBeDisabled();
  });
});
