/**
 * The montage manifest: every file the user sent, fixed at quote time, and the checks every later step makes against it
 * (owner, 2026-10-11: "If 3 videos are required, an output made from only 1 or 2 is not a completed task").
 */
import {
  MAX_MANIFEST_FILES,
  baseName,
  buildManifest,
  checkCoverage,
  checkManifest,
  cleanName,
  clipOrder,
  parseAgentRequest,
  parseNames,
  sameManifest,
  type MontageManifestItem,
} from './montageManifest';

const FILES = ['omni-uploads/u/a1.mp4', 'omni-uploads/u/b2.mp4', 'omni-uploads/u/c3.mp4', 'omni-uploads/u/s4.mp3'];
const M: MontageManifestItem[] = buildManifest(
  FILES,
  ['clipA.mp4', 'clipB.mp4', 'clipC.mp4', 'track.mp3'],
  [{ durationSec: 9.04 }, { durationSec: 11.2 }, { durationSec: 6.1 }, { durationSec: 30.0004 }],
  3,
);
const shot = (source: number, url = `https://x.supabase.co/${FILES[source]}`) => ({ url, source, kind: 'video', startSec: 0, endSec: 2, transition: 'cut' });
const body = (shots: unknown[], manifest: unknown = M) => ({
  shots, aspect: '9:16', musicUrl: 'https://x.supabase.co/s4.mp3', musicStartSec: 0, musicDuckDb: 0, musicOnly: true, manifest,
});

describe('buildManifest', () => {
  test('3 videos + 1 MP3: four items in the order sent, names kept, kinds and lengths fixed', () => {
    expect(M).toEqual([
      { index: 0, path: FILES[0], name: 'clipA.mp4', kind: 'video', durationSec: 9.04 },
      { index: 1, path: FILES[1], name: 'clipB.mp4', kind: 'video', durationSec: 11.2 },
      { index: 2, path: FILES[2], name: 'clipC.mp4', kind: 'video', durationSec: 6.1 },
      { index: 3, path: FILES[3], name: 'track.mp3', kind: 'audio', durationSec: 30 },
    ]);
    expect(checkManifest(M)).toEqual({ ok: true, manifest: M, videos: [0, 1, 2], stills: [], audio: 3, voice: null });
  });

  test('no names: each falls back to the reference\'s base name, decoded, without query', () => {
    const m = buildManifest(['https://x.supabase.co/a/My%20Clip.mp4?token=abc', 'u/s.mp3'], null, [{ durationSec: 3 }, { durationSec: 9 }], 1);
    expect(m.map((x) => x.name)).toEqual(['My Clip.mp4', 's.mp3']);
  });
});

describe('names are display text from untrusted input', () => {
  test('control and bidi-override characters are removed, length is capped, empty falls back to the path', () => {
    expect(cleanName('evil‮gnp.mp4', 'u/x.mp4')).toBe('evilgnp.mp4');
    expect(cleanName('a\u0000b\u001fc', 'u/x.mp4')).toBe('abc');
    expect(cleanName('   ', 'u/x.mp4')).toBe('x.mp4');
    expect(cleanName(42, 'u/x.mp4')).toBe('x.mp4');
    expect(cleanName('n'.repeat(500), 'u/x.mp4')).toHaveLength(200);
    expect(baseName('%E0%A4%A')).toBe('%E0%A4%A'); // a broken escape stays raw instead of throwing
  });

  test('parseNames: absent is fine; a list that does not line up with the files is refused, never guessed', () => {
    expect(parseNames(undefined, 3)).toEqual({ ok: true, names: null });
    expect(parseNames(['a', 'b', 'c'], 3)).toEqual({ ok: true, names: ['a', 'b', 'c'] });
    expect(parseNames(['a', 'b'], 3)).toMatchObject({ ok: false });
    expect(parseNames('a,b,c', 3)).toMatchObject({ ok: false });
    expect(parseNames(['a', 2, 'c'], 3)).toMatchObject({ ok: false });
  });
});

describe('checkManifest refuses anything a quote would not write', () => {
  test.each<[string, unknown]>([
    ['missing', undefined],
    ['a lone sound file', [{ ...M[3], index: 0 }]],
    ['no picture', [{ ...M[3], index: 0 }, { ...M[3], index: 1, kind: 'voice' }]],
    ['empty', []],
    ['too many files', Array.from({ length: MAX_MANIFEST_FILES + 1 }, (_, i) => ({ ...M[0], index: i }))],
    ['out of order', [M[1], M[0], M[2], M[3]]],
    ['two audios', [...M.slice(0, 3), M[3], { ...M[3], index: 4 }]],
    ['two narrations', [...M.slice(0, 3), { ...M[3], kind: 'voice' }, { ...M[3], index: 4, kind: 'voice' }]],
    ['an unknown kind', [M[0], { ...M[1], kind: 'subtitle' }, M[2], M[3]]],
    ['an image', [M[0], { ...M[1], kind: 'image' }, M[2], M[3]]],
    ['a padded path', [M[0], { ...M[1], path: ` ${M[1]!.path}` }, M[2], M[3]]],
    ['a dirty name', [M[0], { ...M[1], name: 'b‮.mp4' }, M[2], M[3]]],
    ['no length', [M[0], { ...M[1], durationSec: 0 }, M[2], M[3]]],
    ['a garbage length', [M[0], { ...M[1], durationSec: 1e9 }, M[2], M[3]]],
  ])('%s', (_label, raw) => expect(checkManifest(raw).ok).toBe(false));
});

describe('coverage: every video has a shot, every shot comes from a video of the manifest', () => {
  test('all three clips used → ok; the clip order is the order of first appearance', () => {
    const shots = [shot(0), shot(0), shot(1), shot(2), shot(1)];
    expect(checkCoverage(shots, M)).toEqual({ ok: true });
    expect(clipOrder(shots)).toEqual([0, 1, 2]);
  });

  test('GG\'s output (only clip 1 used) is refused, naming clips 2 and 3', () => {
    expect(checkCoverage([shot(0), shot(0)], M)).toEqual({ ok: false, error: 'file 2, 3 of 4 has no shot', missing: [1, 2] });
  });

  test('a shot from the music, from outside the manifest, or with no source is refused', () => {
    expect(checkCoverage([shot(0), shot(1), shot(2), shot(3)], M).ok).toBe(false);
    expect(checkCoverage([shot(0), shot(1), shot(2), { ...shot(2), source: 9 }], M).ok).toBe(false);
    expect(checkCoverage([shot(0), shot(1), shot(2), { ...shot(2), source: undefined }], M).ok).toBe(false);
    expect(checkCoverage([shot(0), shot(1), shot(2), { ...shot(2), source: 1.5 }], M).ok).toBe(false);
  });
});

describe('parseAgentRequest (what the run and the worker read)', () => {
  test('a request with every clip: the shots keep their source and the manifest rides along', () => {
    const r = parseAgentRequest(body([shot(0), shot(1), shot(2)]));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.request.shots.map((s) => s.source)).toEqual([0, 1, 2]);
      expect(r.manifest).toEqual(M);
    }
  });

  test('a clip dropped, the manifest cut to match, or the manifest removed: refused', () => {
    expect(parseAgentRequest(body([shot(0), shot(1)]))).toMatchObject({ ok: false, code: 'manifest_invalid', missing: [2] });
    expect(parseAgentRequest(body([shot(0)], [M[0], { ...M[3], index: 1 }]))).toMatchObject({ ok: true });
    // …but that one is a different request: its fingerprint is not the quote's, so the token refuses it (montageExec).
    expect(parseAgentRequest({ ...body([shot(0), shot(1), shot(2)]), manifest: undefined })).toMatchObject({ ok: false, code: 'manifest_invalid' });
  });

  test('sameManifest compares item by item', () => {
    expect(sameManifest(M, M.map((m) => ({ ...m })))).toBe(true);
    expect(sameManifest(M, [M[0]!, M[2]!, M[1]!, M[3]!])).toBe(false);
    expect(sameManifest(M, [M[0]!, { ...M[1]!, path: 'omni-uploads/u/other.mp4' }, M[2]!, M[3]!])).toBe(false);
  });
});

describe('a photo in the manifest (owner, 2026-10-11 11:37Z)', () => {
  const PF = ['omni-uploads/u/a1.mov', 'omni-uploads/u/p2.jpg', 'omni-uploads/u/s3.mp3'];
  const PM = buildManifest(PF, ['a.mov', 'product.jpg', 'song.mp3'], [{ durationSec: 8 }, { durationSec: 0.04 }, { durationSec: 40 }], 2, [1]);

  test('buildManifest marks it an image with no length; checkManifest lists it as a still', () => {
    expect(PM[1]).toEqual({ index: 1, path: PF[1], name: 'product.jpg', kind: 'image', durationSec: 0 });
    expect(checkManifest(PM)).toEqual({ ok: true, manifest: PM, videos: [0], stills: [1], audio: 2, voice: null });
  });

  test('refused: a photo with a length, a video with no length; photos with no video are a montage (GG 2026-10-11 17:38Z)', () => {
    expect(checkManifest(PM.map((m) => (m.index === 1 ? { ...m, durationSec: 3 } : m)))).toMatchObject({ ok: false, error: 'manifest item 2 is a photo with a length' });
    expect(checkManifest(PM.map((m) => (m.index === 0 ? { ...m, kind: 'image', durationSec: 0 } : m)))).toMatchObject({ ok: true, videos: [], stills: [0, 1], audio: 2 });
    expect(checkManifest(PM.map((m) => (m.index === 0 ? { ...m, durationSec: 0 } : m)))).toMatchObject({ ok: false, error: 'manifest item 1 has no length' });
    expect(checkManifest(PM.map((m) => (m.index === 1 ? { ...m, kind: 'gif' } : m)))).toMatchObject({ ok: false });
  });

  test('coverage: the photo needs its image shot; a run that leaves it out names it', () => {
    const img = { url: `https://x.supabase.co/${PF[1]}`, source: 1, kind: 'image', startSec: 0, endSec: 2, transition: 'cut' };
    const vid = { url: `https://x.supabase.co/${PF[0]}`, source: 0, kind: 'video', startSec: 0, endSec: 2, transition: 'cut' };
    expect(checkCoverage([vid, img], PM)).toEqual({ ok: true });
    expect(checkCoverage([vid], PM)).toMatchObject({ ok: false, missing: [1] });
    expect(checkCoverage([vid, { ...img, kind: 'video' }], PM)).toMatchObject({ ok: false, missing: [] });
    expect(checkCoverage([{ ...vid, kind: 'image' }, img], PM)).toMatchObject({ ok: false, missing: [] });
    expect(parseAgentRequest({ ...body([vid, img], PM), musicUrl: `https://x.supabase.co/${PF[2]}` }).ok).toBe(true);
  });
});


// GG 2026-10-11 17:38Z: a montage with no music, and one with the user's own narration over it.
describe('no music, and a narration', () => {
  test('pictures alone are a manifest; a narration is listed as `voice`, apart from the music', () => {
    const noMusic = M.slice(0, 3);
    expect(checkManifest(noMusic)).toEqual({ ok: true, manifest: noMusic, videos: [0, 1, 2], stills: [], audio: null, voice: null });
    const VF = ['u/a.mp4', 'u/s.mp3', 'u/v.m4a'];
    const vm = buildManifest(VF, ['a.mp4', 'song.mp3', 'me.m4a'], [{ durationSec: 9 }, { durationSec: 60 }, { durationSec: 12 }], 1, [], 2);
    expect(vm.map((m) => m.kind)).toEqual(['video', 'audio', 'voice']);
    expect(checkManifest(vm)).toMatchObject({ ok: true, videos: [0], audio: 1, voice: 2 });
    const only = buildManifest(['u/a.mp4', 'u/v.m4a'], null, [{ durationSec: 9 }, { durationSec: 12 }], null, [], 1);
    expect(checkManifest(only)).toMatchObject({ ok: true, audio: null, voice: 1 });
  });

  test('a shot cut from the narration is refused like one cut from the music', () => {
    const vm = buildManifest(['u/a.mp4', 'u/v.m4a'], null, [{ durationSec: 9 }, { durationSec: 12 }], null, [], 1);
    expect(checkCoverage([{ source: 1, kind: 'video' }], vm)).toMatchObject({ ok: false });
    expect(checkCoverage([{ source: 0, kind: 'video' }], vm)).toEqual({ ok: true });
  });

  test('the request lays exactly the sound the manifest lists', () => {
    const noMusic = M.slice(0, 3);
    const silent = { shots: [shot(0), shot(1), shot(2)], aspect: '9:16', musicDuckDb: 0, musicOnly: false, manifest: noMusic };
    expect(parseAgentRequest(silent)).toMatchObject({ ok: true });
    expect(parseAgentRequest({ ...silent, musicUrl: 'https://x.supabase.co/s4.mp3' })).toMatchObject({ ok: false, code: 'manifest_invalid' });
    expect(parseAgentRequest({ ...silent, voiceUrl: 'https://x.supabase.co/v.m4a' })).toMatchObject({ ok: false, code: 'manifest_invalid' });
  });
});
