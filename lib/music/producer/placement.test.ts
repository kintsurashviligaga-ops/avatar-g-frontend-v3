/** @jest-environment node */
jest.mock('server-only', () => ({}));
import { cueArgs, cueFilter, montageHandoff, planCue, sceneWindow } from './placement';
import { planAgentMusic } from './agent';
import { parsePlaceBody } from './placeRequest';
import { placeOnFilm, type PlaceDeps } from './place.server';
import { filmTargets, registerFilmTarget, resetFilmTargets, type FilmTarget } from './videoTargets';
import { producerChatClientOn, producerChatTakes } from './flag';
import { parseProducerAsk } from './intent';

const scenes = [
  { id: 's1', order: 1, seconds: 8 },
  { id: 's2', order: 2, seconds: 8 },
  { id: 's3', order: 3, seconds: 6 },
  { id: 's4', order: 4, seconds: 10 },
];
const film: FilmTarget = { projectId: 'p1', title: 'Rooftop', filmUrl: 'https://abc.supabase.co/storage/v1/object/sign/renders/f.mp4', scenes, at: 1 };
const GG = 'Create a sad piano track, 1 minute long, and add it to Scene 3 of my video.';

describe('placement', () => {
  it('scene 3 starts after scenes 1+2 (sorted by order)', () => {
    expect(sceneWindow([...scenes].reverse(), 3)).toEqual({ start: 16, end: 22 });
    expect(sceneWindow(scenes, 5)).toBeNull();
    expect(sceneWindow(scenes, 0)).toBeNull();
  });
  it('a 60 s track on scene 3 is trimmed to the scene, 0.5 s fades, 6 dB under', () => {
    const c = planCue({ scenes, target: { kind: 'scene', scene: 3 }, trackSec: 60 });
    expect(c).toEqual({ ok: true, cue: { startSec: 16, durSec: 6, fadeInSec: 0.5, fadeOutSec: 0.5, gainDb: -6, filmSec: 32, scene: 3, notes: ['trimmed_to_scene'] } });
  });
  it('to_end runs to the end of the film; a short track under the whole film is never looped', () => {
    const a = planCue({ scenes, target: { kind: 'scene', scene: 3 }, span: 'to_end', trackSec: 60 });
    expect(a.ok && a.cue.durSec).toBe(16);
    const b = planCue({ scenes, target: { kind: 'film' }, trackSec: 30 });
    expect(b.ok && b.cue).toMatchObject({ startSec: 0, durSec: 30, notes: ['track_shorter_than_film'] });
  });
  it('refuses a missing scene, an empty film, an unmeasured track', () => {
    expect(planCue({ scenes, target: { kind: 'scene', scene: 9 }, trackSec: 30 })).toEqual({ ok: false, reason: 'no_scene' });
    expect(planCue({ scenes: [], target: { kind: 'film' }, trackSec: 30 })).toEqual({ ok: false, reason: 'empty_film' });
    expect(planCue({ scenes, target: { kind: 'film' }, trackSec: 0 })).toEqual({ ok: false, reason: 'track_unmeasured' });
  });
  it('very short cue: fades shrink to a quarter', () => {
    const c = planCue({ scenes: [{ id: 'a', order: 1, seconds: 1 }], target: { kind: 'film' }, trackSec: 30 });
    expect(c.ok && c.cue.fadeInSec).toBe(0.25);
  });
  it('the mix: delay to the scene, fades, -6 dB, sidechain under the dialogue, picture copied', () => {
    const c = planCue({ scenes, target: { kind: 'scene', scene: 3 }, trackSec: 60 });
    if (!c.ok) throw new Error('cue');
    const f = cueFilter(c.cue, true);
    expect(f).toContain('atrim=0:6');
    expect(f).toContain('afade=t=in:st=0:d=0.5');
    expect(f).toContain('afade=t=out:st=5.5:d=0.5');
    expect(f).toContain('volume=-6dB');
    expect(f).toContain('adelay=16000|16000');
    expect(f).toContain('sidechaincompress');
    expect(f).toContain('amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]');
    const args = cueArgs('/t/film.mp4', '/t/track.mp3', '/t/out.mp4', c.cue, true);
    expect(args).toEqual(expect.arrayContaining(['-c:v', 'copy', '-map', '0:v:0', '-map', '[aout]']));
    expect(args.slice(args.indexOf('-t'), args.indexOf('-t') + 2)).toEqual(['-t', '32']);
    expect(cueFilter(c.cue, false)).toMatch(/\[m\]apad\[aout\]$/);
  });
  it('Montage hand-off is the montage render route\'s music fields', () => {
    expect(montageHandoff('https://x/t.mp3')).toEqual({ musicUrl: 'https://x/t.mp3', musicStartSec: 0, musicGainDb: -6 });
  });
});

describe('Agent G: "Create a sad piano track, 1 minute long, and add it to Scene 3 of my video."', () => {
  it('parses to sad + piano, 60 s, instrumental, scene 3', () => {
    const a = parseProducerAsk(GG);
    expect(a?.spec).toMatchObject({ moods: ['sad'], instruments: ['piano'], lengthSec: 60, vocals: false });
    expect(a?.target).toEqual({ kind: 'scene', scene: 3 });
  });
  it('one plan, one price (v8 ✦11), scene 3 at 0:16 – 0:22, and a cheaper 30 s offer', () => {
    const p = planAgentMusic(GG, { film, book: 'v8' });
    expect(p.ok).toBe(true);
    if (!p.ok || !p.target) throw new Error('plan');
    expect(p.credits).toBe(11);
    expect('window' in p && p.window).toEqual({ start: 16, end: 22 });
    expect('notes' in p && p.notes).toContain('longer_than_scene');
    expect('cheaper' in p && p.cheaper).toEqual({ lengthSec: 30, credits: 6 });
  });
  it('refuses before any charge: no film, or the film has fewer scenes', () => {
    expect(planAgentMusic(GG, { film: null, book: 'v8' })).toEqual({ ok: false, reason: 'no_film' });
    expect(planAgentMusic(GG, { film: { ...film, scenes: scenes.slice(0, 2) }, book: 'v8' })).toEqual({ ok: false, reason: 'no_scene', scenes: 2 });
  });
  it('Georgian: „შექმენი სევდიანი ფორტეპიანოს მუსიკა, 1 წუთი, და დაადე ჩემი ვიდეოს მესამე სცენას"', () => {
    const p = planAgentMusic('შექმენი სევდიანი ფორტეპიანოს მუსიკა, 1 წუთი, და დაადე ჩემი ვიდეოს მესამე სცენას', { film, book: 'v8' });
    expect(p.ok && p.target).toEqual({ kind: 'scene', scene: 3 });
  });
  it('whole film with no length: the shortest length that covers it', () => {
    const p = planAgentMusic('add calm music to the whole film', { film: { ...film, scenes: [...scenes, { id: 's5', order: 5, seconds: 10 }, { id: 's6', order: 6, seconds: 10 }, { id: 's7', order: 7, seconds: 10 }] }, book: 'v8' });
    expect(p.ok && p.spec.lengthSec).toBe(120);
  });
  it('not music → not this card', () => {
    expect(planAgentMusic('make a picture of a cat', { film, book: 'v8' })).toEqual({ ok: false, reason: 'not_music' });
  });
});

describe('chat switch', () => {
  it('client flag needs admin/everyone in words; the chat takes music lines in Music, elsewhere only ones naming a video', () => {
    expect(producerChatClientOn('1')).toBe(false);
    expect(producerChatClientOn('admin')).toBe(true);
    expect(producerChatTakes(GG, 'chat', parseProducerAsk(GG))).toBe(true);
    expect(producerChatTakes('a calm piano track', 'chat', parseProducerAsk('a calm piano track'))).toBe(false);
    expect(producerChatTakes('a calm piano track', 'music', parseProducerAsk('a calm piano track'))).toBe(true);
  });
});

describe('parsePlaceBody', () => {
  const body = { trackId: 'trk-00000001', target: { kind: 'scene', scene: 3 }, film: { projectId: 'p1', filmUrl: film.filmUrl, scenes } };
  it('accepts a valid body and defaults span to the scene', () => {
    expect(parsePlaceBody(body)).toMatchObject({ trackId: 'trk-00000001', span: 'scene', target: { kind: 'scene', scene: 3 } });
  });
  it('refuses http links, bad scenes and junk targets', () => {
    expect(parsePlaceBody({ ...body, film: { ...body.film, filmUrl: 'http://x/f.mp4' } })).toBeNull();
    expect(parsePlaceBody({ ...body, film: { ...body.film, scenes: [{ id: 'a', order: 1, seconds: 99 }] } })).toBeNull();
    expect(parsePlaceBody({ ...body, target: { kind: 'stems' } })).toBeNull();
    expect(parsePlaceBody({ ...body, film: { ...body.film, projectId: '../x' } })).toBeNull();
  });
});

describe('placeOnFilm (mocked ffmpeg + download)', () => {
  const cue = (() => { const c = planCue({ scenes, target: { kind: 'scene', scene: 3 }, trackSec: 60 }); if (!c.ok) throw new Error('c'); return c.cue; })();
  function deps(over: Partial<PlaceDeps> = {}, probeStderr = 'Duration: 00:00:32.00\n  Stream #0:0: Video: h264, yuv420p, 1920x1080, 24 fps\n  Stream #0:1: Audio: aac, 48000 Hz, stereo') {
    const calls = { exec: [] as string[][], cleaned: 0 };
    const d: PlaceDeps = {
      bin: '/bin/ffmpeg',
      download: async () => true,
      writeFile: async () => undefined,
      readFile: async () => Buffer.from('mp4'),
      exec: async (_b, args) => {
        calls.exec.push(args);
        if (args.length === 4) { const e = new Error('probe') as Error & { stderr: string }; e.stderr = probeStderr; throw e; }
        return { stdout: '', stderr: '' };
      },
      tmp: async () => '/tmp/x',
      cleanup: async () => { calls.cleaned++; },
      ...over,
    };
    return { d, calls };
  }
  it('downloads, probes, mixes with the sidechain when the film has sound, cleans up', async () => {
    const { d, calls } = deps();
    const r = await placeOnFilm(d, { filmUrl: film.filmUrl, track: Buffer.from('mp3'), cue, budgetMs: 60_000 });
    expect(r).toEqual({ ok: true, bytes: Buffer.from('mp4'), filmHadAudio: true });
    expect(calls.exec[1]?.join(' ')).toContain('sidechaincompress');
    expect(calls.cleaned).toBe(1);
  });
  it('a silent film gets the music alone', async () => {
    const { d, calls } = deps({}, 'Duration: 00:00:32.00\n  Stream #0:0: Video: h264, yuv420p, 1920x1080, 24 fps');
    const r = await placeOnFilm(d, { filmUrl: film.filmUrl, track: Buffer.from('mp3'), cue, budgetMs: 60_000 });
    expect(r.ok && r.filmHadAudio).toBe(false);
    expect(calls.exec[1]?.join(' ')).not.toContain('sidechaincompress');
  });
  it('misses are reasons, never throws', async () => {
    expect(await placeOnFilm(deps({ bin: null }).d, { filmUrl: film.filmUrl, track: Buffer.from(''), cue, budgetMs: 1 })).toEqual({ ok: false, reason: 'ffmpeg_missing' });
    expect(await placeOnFilm(deps({ download: async () => false }).d, { filmUrl: film.filmUrl, track: Buffer.from(''), cue, budgetMs: 1 })).toEqual({ ok: false, reason: 'film_unavailable' });
    expect(await placeOnFilm(deps({}, 'Duration: 00:00:32.00\n  Stream #0:0: Audio: aac').d, { filmUrl: film.filmUrl, track: Buffer.from(''), cue, budgetMs: 1 })).toEqual({ ok: false, reason: 'not_a_video' });
  });
});

describe('videoTargets', () => {
  it('newest first, one per project, at most 5', () => {
    resetFilmTargets();
    registerFilmTarget({ ...film, at: 1 });
    registerFilmTarget({ ...film, projectId: 'p2', at: 2 });
    registerFilmTarget({ ...film, title: 'Rooftop v2', at: 3 });
    expect(filmTargets().map((f) => [f.projectId, f.title])).toEqual([['p1', 'Rooftop v2'], ['p2', 'Rooftop']]);
    for (let i = 0; i < 6; i++) registerFilmTarget({ ...film, projectId: `q${i}`, at: 10 + i });
    expect(filmTargets()).toHaveLength(5);
  });
});
