import '@testing-library/jest-dom';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { UseInVideoSheet } from './UseInVideoSheet';
import { MusicPlanCard } from './MusicPlanCard';
import type { ProducerPost } from './MusicProducerPanel';
import type { MusicCardTrack } from './MusicCard';
import { registerFilmTarget, resetFilmTargets, type FilmTarget } from '@/lib/music/producer/videoTargets';
import { DEFAULT_SPEC } from '@/lib/music/producer/spec';
import type { ProducerMeta } from '@/lib/music/producer/library';

const scenes = [
  { id: 's1', order: 1, seconds: 8 }, { id: 's2', order: 2, seconds: 8 }, { id: 's3', order: 3, seconds: 6 }, { id: 's4', order: 4, seconds: 10 },
];
const film: FilmTarget = { projectId: 'p1', title: 'Rooftop', filmUrl: 'https://abc.supabase.co/storage/v1/object/sign/renders/f.mp4', scenes, sceneTitles: ['Street', 'Stairs', 'Rooftop', 'Dawn'], at: 1 };
const meta = (over: Partial<ProducerMeta> = {}): ProducerMeta => ({
  v: 1, kind: 'music-producer', id: 'trk-00000001', action: 'generate', spec: { ...DEFAULT_SPEC, moods: ['sad'], instruments: ['piano'], lengthSec: 60 },
  model: 'lyria-3-pro-preview', input: '', lyrics: '', lines: [], timeline: [], durationSec: 58.4, bpm: null, part: 0, parentId: null,
  credits: 11, book: 'v8', audioPath: 'music-producer/u1/trk-00000001.mp3', mime: 'audio/mpeg', createdAt: '2026-11-15T07:00:00Z', ...over,
});
const track: MusicCardTrack = { id: 'trk-00000001', url: 'https://x/t.mp3', meta: meta() };
const GG = 'Create a sad piano track, 1 minute long, and add it to Scene 3 of my video.';

beforeEach(() => resetFilmTargets());

describe('UseInVideoSheet', () => {
  it('no film yet: says how to get one', () => {
    render(<UseInVideoSheet track={track} lang="en" post={jest.fn()} onClose={jest.fn()} />);
    expect(screen.getByTestId('mp-no-film')).toBeInTheDocument();
    expect(screen.queryByTestId('mp-place')).toBeNull();
  });
  it('scene 3: shows 0:16 – 0:22, the trim note, places for free with the right body', async () => {
    registerFilmTarget(film);
    const post = jest.fn<ReturnType<ProducerPost>, Parameters<ProducerPost>>(async () => ({ ok: true, status: 200, json: { ok: true, url: 'https://x/film-with-music.mp4', charged: 0 } }));
    render(<UseInVideoSheet track={track} lang="en" post={post} onClose={jest.fn()} />);
    expect(screen.getByTestId('mp-use-scene-3')).toHaveTextContent('Scene 3 · Rooftop');
    fireEvent.click(screen.getByTestId('mp-use-scene-3'));
    expect(screen.getByTestId('mp-cue')).toHaveTextContent('0:16 – 0:22');
    expect(screen.getByTestId('mp-cue')).toHaveTextContent('6 dB');
    expect(screen.getByTestId('mp-cue-trimmed')).toBeInTheDocument();
    expect(screen.getByTestId('mp-place')).toHaveTextContent('free');
    await act(async () => { fireEvent.click(screen.getByTestId('mp-place')); });
    expect(post).toHaveBeenCalledWith('/api/music/producer/place', {
      trackId: 'trk-00000001', target: { kind: 'scene', scene: 3 }, span: 'scene',
      film: { projectId: 'p1', filmUrl: film.filmUrl, scenes },
    });
    expect(screen.getByTestId('mp-placed').querySelector('video')).toHaveAttribute('src', 'https://x/film-with-music.mp4');
  });
  it('until the end / whole film change where it lands; Montage hands off the track', () => {
    registerFilmTarget(film);
    const onOpenMontage = jest.fn();
    render(<UseInVideoSheet track={track} lang="en" post={jest.fn()} onClose={jest.fn()} onOpenMontage={onOpenMontage} />);
    fireEvent.click(screen.getByTestId('mp-use-scene-3'));
    fireEvent.click(screen.getByTestId('mp-span-end'));
    expect(screen.getByTestId('mp-cue')).toHaveTextContent('0:16 – 0:32');
    fireEvent.click(screen.getByTestId('mp-use-film'));
    expect(screen.getByTestId('mp-cue')).toHaveTextContent('0:00 – 0:32');
    fireEvent.click(screen.getByTestId('mp-open-montage'));
    expect(onOpenMontage).toHaveBeenCalledWith({ musicUrl: 'https://x/t.mp3', musicStartSec: 0, musicGainDb: -6 });
  });
  it('a failed place says nothing was charged', async () => {
    registerFilmTarget(film);
    const post: ProducerPost = async () => ({ ok: false, status: 503, json: { ok: false, error: 'place_failed' } });
    render(<UseInVideoSheet track={track} lang="en" post={post} onClose={jest.fn()} />);
    await act(async () => { fireEvent.click(screen.getByTestId('mp-place')); });
    expect(screen.getByTestId('mp-place-error')).toHaveTextContent('Nothing was charged');
  });
});

describe('MusicPlanCard (Agent G)', () => {
  it('one plan, one price; Start makes the track then places it under Scene 3', async () => {
    const post = jest.fn<ReturnType<ProducerPost>, Parameters<ProducerPost>>(async (path) => (path === '/api/music/producer'
      ? { ok: true, status: 200, json: { ok: true, id: 'trk-00000001', url: 'https://x/t.mp3', meta: meta(), charged: 11 } }
      : { ok: true, status: 200, json: { ok: true, url: 'https://x/film.mp4' } }));
    const onCharged = jest.fn();
    render(<MusicPlanCard text={GG} film={film} book="v8" lang="en" post={post} onCharged={onCharged} />);
    expect(screen.getByTestId('mp-plan-step-1')).toHaveTextContent('✦11');
    expect(screen.getByTestId('mp-plan-step-2')).toHaveTextContent('Put it under Scene 3 (0:16 – 0:22)');
    expect(screen.getByTestId('mp-plan-step-2')).toHaveTextContent('free');
    expect(screen.getByTestId('mp-plan-longer')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByTestId('mp-plan-start')); });
    expect(post).toHaveBeenNthCalledWith(1, '/api/music/producer', { action: 'generate', spec: expect.objectContaining({ moods: ['sad'], instruments: ['piano'], lengthSec: 60 }) });
    expect(post).toHaveBeenNthCalledWith(2, '/api/music/producer/place', expect.objectContaining({ trackId: 'trk-00000001', target: { kind: 'scene', scene: 3 } }));
    expect(onCharged).toHaveBeenCalledWith(11);
    expect(screen.getByTestId('mp-plan-film').querySelector('video')).toHaveAttribute('src', 'https://x/film.mp4');
  });
  it('"30 s is enough" switches to the cheaper length before Start', () => {
    render(<MusicPlanCard text={GG} film={film} book="v8" lang="en" post={jest.fn()} />);
    fireEvent.click(screen.getByTestId('mp-plan-cheaper'));
    expect(screen.getByTestId('mp-plan-start')).toHaveTextContent('✦6');
    expect(screen.queryByTestId('mp-plan-cheaper')).toBeNull();
  });
  it('no scene 3 in the film: refused on the card, nothing posted', () => {
    const post = jest.fn();
    render(<MusicPlanCard text={GG} film={{ ...film, scenes: scenes.slice(0, 2) }} book="v8" lang="en" post={post} />);
    expect(screen.getByTestId('mp-plan-refused')).toHaveTextContent('only 2 scenes');
    expect(screen.queryByTestId('mp-plan-start')).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });
  it('a place miss after the track: the track is kept and the card says so', async () => {
    const post: ProducerPost = async (path) => (path === '/api/music/producer'
      ? { ok: true, status: 200, json: { ok: true, id: 'trk-00000001', url: 'https://x/t.mp3', meta: meta(), charged: 11 } }
      : { ok: false, status: 503, json: { ok: false, error: 'place_failed' } });
    render(<MusicPlanCard text={GG} film={film} book="v8" lang="en" post={post} />);
    await act(async () => { fireEvent.click(screen.getByTestId('mp-plan-start')); });
    expect(screen.getByTestId('mp-card-trk-00000001')).toBeInTheDocument();
    expect(screen.getByTestId('mp-plan-place-missed')).toHaveTextContent('in your Library');
  });
  it('a track miss: credits returned, no place call', async () => {
    const post = jest.fn<ReturnType<ProducerPost>, Parameters<ProducerPost>>(async () => ({ ok: false, status: 502, json: { ok: false, error: 'provider_unavailable' } }));
    render(<MusicPlanCard text={GG} film={film} book="v8" lang="en" post={post} />);
    await act(async () => { fireEvent.click(screen.getByTestId('mp-plan-start')); });
    expect(post).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('mp-plan-error')).toHaveTextContent('credits were returned');
  });
});
