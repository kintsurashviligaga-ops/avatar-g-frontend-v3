/** @jest-environment node */
import {
  MAX_MUSIC_START_SEC,
  MAX_SHOTS,
  MIN_SHOT_SEC,
  MUSIC_MIN_PLAY_SEC,
  NEUTRAL_GRADE,
  PHOTO_DEFAULT_SEC,
  PHOTO_MAX_SEC,
  blockers,
  buildRenderBody,
  canSplit,
  clampMusicStart,
  clipAt,
  clipForSource,
  commit,
  duplicateClip,
  emptyEdit,
  exportDurationSec,
  insertClips,
  layout,
  moveClip,
  musicSpanSec,
  musicStartMax,
  redo,
  removeClip,
  removeMusic,
  replacePresent,
  setCaption,
  setMusic,
  setMusicStart,
  setPhotoDuration,
  setTransition,
  setTransitionAll,
  splitClip,
  startHistory,
  toggleMute,
  totalSec,
  trimClip,
  undo,
  type Edit,
  type MediaSource,
} from './project';

const video = (id: string, durationSec = 10, over: Partial<MediaSource> = {}): MediaSource => ({
  id, kind: 'video', name: `${id}.mp4`, previewUrl: `blob:${id}`, ref: `u/${id}`, status: 'ready', durationSec, ...over,
});
const photo = (id: string, over: Partial<MediaSource> = {}): MediaSource => ({
  id, kind: 'image', name: `${id}.jpg`, previewUrl: `blob:${id}`, ref: `u/${id}`, status: 'ready', durationSec: 0, ...over,
});

function project(...srcs: MediaSource[]): { edit: Edit; sources: Record<string, MediaSource> } {
  const sources = Object.fromEntries(srcs.map((s) => [s.id, s]));
  const edit = insertClips(emptyEdit('9:16'), srcs.map(clipForSource)).edit;
  return { edit, sources };
}

describe('a new clip', () => {
  it('a video lands whole, a photo for the default beat, a long video as its first minute', () => {
    expect(clipForSource(video('a', 8))).toMatchObject({ startSec: 0, endSec: 8, transition: 'cut', caption: '' });
    expect(clipForSource(photo('p'))).toMatchObject({ startSec: 0, endSec: PHOTO_DEFAULT_SEC });
    expect(clipForSource(video('long', 300)).endSec).toBe(60);
    // A length the browser could not read gets a window the server will measure.
    expect(clipForSource(video('hevc', 0)).endSec).toBe(5);
  });

  it('stops at the shot cap and says how many fit', () => {
    const many = Array.from({ length: MAX_SHOTS + 3 }, (_, i) => clipForSource(video(`v${i}`, 2)));
    const r = insertClips(emptyEdit(), many);
    expect(r.added).toBe(MAX_SHOTS);
    expect(r.edit.clips).toHaveLength(MAX_SHOTS);
    expect(insertClips(r.edit, [clipForSource(video('x'))]).added).toBe(0);
  });
});

describe('the timeline clock', () => {
  it('places clips back to back and finds the clip under the playhead', () => {
    const { edit } = project(video('a', 4), photo('p'), video('b', 5));
    expect(layout(edit.clips).map((p) => [p.t0, p.t1])).toEqual([[0, 4], [4, 7], [7, 12]]);
    expect(totalSec(edit.clips)).toBe(12);
    expect(clipAt(edit.clips, 0)).toEqual({ index: 0, local: 0 });
    expect(clipAt(edit.clips, 5.5)).toEqual({ index: 1, local: 1.5 });
    // The very end belongs to the last clip.
    expect(clipAt(edit.clips, 12)).toEqual({ index: 2, local: 5 });
    expect(clipAt([], 3)).toBeNull();
  });

  it('the export is shorter than the preview clock by each crossfade', () => {
    const { edit, sources } = project(video('a', 4), video('b', 4));
    const faded = setTransition(edit, edit.clips[1]!.id, 'crossfade');
    expect(exportDurationSec(edit, sources)).toBe(8);
    expect(exportDurationSec(faded, sources)).toBeLessThan(8);
  });
});

describe('editing', () => {
  it('splits a clip in two at the playhead, keeping caption and mute, the second half with a hard cut', () => {
    const { edit } = project(video('a', 10));
    const id = edit.clips[0]!.id;
    const prepared = setTransition(toggleMute(setCaption(edit, id, 'სათაური'), id), id, 'fade');
    const r = splitClip(prepared, id, 3.5);
    expect(r.secondId).toBeTruthy();
    expect(r.edit.clips.map((c) => [c.startSec, c.endSec])).toEqual([[0, 3.5], [3.5, 10]]);
    expect(r.edit.clips.every((c) => c.caption === 'სათაური' && c.muted)).toBe(true);
    expect(r.edit.clips[1]!.transition).toBe('cut');
    expect(r.edit.clips[1]!.id).toBe(r.secondId);
  });

  it('refuses a split that would leave a part shorter than a shot', () => {
    const { edit } = project(video('a', 10));
    const c = edit.clips[0]!;
    expect(canSplit(c, MIN_SHOT_SEC / 2)).toBe(false);
    expect(canSplit(c, 10 - MIN_SHOT_SEC / 2)).toBe(false);
    expect(splitClip(edit, c.id, 0.1).secondId).toBeNull();
  });

  it('trims a video inside its source and never below a shot', () => {
    const { edit, sources } = project(video('a', 10));
    const id = edit.clips[0]!.id;
    const src = sources.a;
    expect(trimClip(edit, id, 'start', 2.25, src).clips[0]).toMatchObject({ startSec: 2.25, endSec: 10 });
    expect(trimClip(edit, id, 'start', -5, src).clips[0]!.startSec).toBe(0);
    expect(trimClip(edit, id, 'end', 99, src).clips[0]!.endSec).toBe(10);
    expect(trimClip(edit, id, 'end', 0, src).clips[0]!.endSec).toBe(MIN_SHOT_SEC);
  });

  it('a photo has no source timeline: either edge sets how long it shows, up to the cap', () => {
    const { edit, sources } = project(photo('p'));
    const id = edit.clips[0]!.id;
    expect(trimClip(edit, id, 'end', 5, sources.p).clips[0]).toMatchObject({ startSec: 0, endSec: 5 });
    expect(trimClip(edit, id, 'start', 1, sources.p).clips[0]).toMatchObject({ startSec: 0, endSec: 2 });
    expect(setPhotoDuration(edit, id, 99).clips[0]!.endSec).toBe(PHOTO_MAX_SEC);
  });

  it('moves, duplicates and deletes', () => {
    const { edit } = project(video('a', 2), video('b', 3));
    const [a, b] = edit.clips;
    expect(moveClip(edit, b!.id, -1).clips.map((c) => c.sourceId)).toEqual(['b', 'a']);
    expect(moveClip(edit, a!.id, -1)).toBe(edit);
    const dup = duplicateClip(setTransition(edit, b!.id, 'crossfade'), b!.id);
    expect(dup.clips.map((c) => c.sourceId)).toEqual(['a', 'b', 'b']);
    expect(dup.clips[2]!.transition).toBe('cut');
    expect(removeClip(edit, a!.id).clips.map((c) => c.sourceId)).toEqual(['b']);
  });

  it('applies one transition to every cut, never to the first clip', () => {
    const { edit } = project(video('a', 2), video('b', 2), video('c', 2));
    expect(setTransitionAll(edit, 'fade').clips.map((c) => c.transition)).toEqual(['cut', 'fade', 'fade']);
  });
});

describe('undo / redo', () => {
  it('steps back and forward, and a no-op edit is not a step', () => {
    const { edit } = project(video('a', 4));
    let h = startHistory(edit);
    h = commit(h, edit);
    expect(h.past).toHaveLength(0);
    const muted = toggleMute(edit, edit.clips[0]!.id);
    h = commit(h, muted);
    expect(undo(h).present).toBe(edit);
    expect(redo(undo(h)).present).toBe(muted);
    // A drag in progress replaces the present without a step.
    expect(replacePresent(h, edit).past).toHaveLength(1);
  });
});

describe('the export request', () => {
  it('is the montage route contract: refs, trims, transitions, captions, format', () => {
    const { edit, sources } = project(video('a', 6), photo('p'));
    const [a, p] = edit.clips;
    const e = setCaption(setTransition(edit, p!.id, 'crossfade'), a!.id, 'გამარჯობა', 'center');
    expect(buildRenderBody(e, sources)).toEqual({
      shots: [
        { url: 'u/a', kind: 'video', startSec: 0, endSec: 6, muted: false, transition: 'cut', caption: 'გამარჯობა', captionPos: 'center' },
        { url: 'u/p', kind: 'image', startSec: 0, endSec: PHOTO_DEFAULT_SEC, muted: true, transition: 'crossfade' },
      ],
      aspect: '9:16',
    });
  });

  it('sends music, „music only" when the clips’ sound is off, and a grade only when it is not neutral', () => {
    const song: MediaSource = { id: 'm', kind: 'audio', name: 'song', previewUrl: 'blob:m', ref: 'u/m', status: 'ready', durationSec: 30 };
    const { edit, sources } = project(video('a', 6));
    const withMusic = { ...edit, musicId: 'm', originalSound: false, grade: { ...NEUTRAL_GRADE, temperature: 40 } };
    expect(buildRenderBody(withMusic, { ...sources, m: song })).toMatchObject({
      musicUrl: 'u/m', musicOnly: true, grade: { saturation: 100, contrast: 100, brightness: 100, temperature: 40 },
    });
    expect(buildRenderBody(edit, sources)).not.toHaveProperty('grade');
    // Sound off and no music: a silent edit — every shot muted.
    const silent = buildRenderBody({ ...edit, originalSound: false }, sources) as { shots: { muted: boolean }[] };
    expect(silent.shots.every((s) => s.muted)).toBe(true);
  });

  it('is blocked, with the reason, until every file is up', () => {
    expect(blockers(emptyEdit(), {})).toEqual([{ kind: 'empty' }]);
    const up = project(video('a', 6, { status: 'uploading', ref: null }), video('b', 4, { status: 'error', ref: null }));
    expect(blockers(up.edit, up.sources)).toEqual([{ kind: 'failed', count: 1 }, { kind: 'uploading', count: 1 }]);
    const ok = project(video('a', 6));
    expect(blockers(ok.edit, ok.sources)).toEqual([]);
    const song: MediaSource = { id: 'm', kind: 'audio', name: 's', previewUrl: 'blob:m', ref: null, status: 'uploading', durationSec: 0 };
    expect(blockers({ ...ok.edit, musicId: 'm' }, { ...ok.sources, m: song })).toEqual([{ kind: 'musicUploading' }]);
  });
});

describe('the music start', () => {
  const song = (durationSec = 30, over: Partial<MediaSource> = {}): MediaSource => ({
    id: 'm', kind: 'audio', name: 'song', previewUrl: 'blob:m', ref: 'u/m', status: 'ready', durationSec, ...over,
  });
  const withSong = (startSec = 0, durationSec = 30) => {
    const { edit, sources } = project(video('a', 6));
    return { edit: setMusic(edit, 'm', startSec, durationSec), sources: { ...sources, m: song(durationSec) } };
  };

  it('a new edit, and a new song, start at the top', () => {
    expect(emptyEdit().musicStartSec).toBe(0);
    const { edit } = withSong(12);
    expect(edit.musicStartSec).toBe(12);
    // Another song replaces it from ITS top: the last song's start meant nothing for this one.
    expect(setMusic(edit, 'm2').musicStartSec).toBe(0);
    expect(removeMusic(edit)).toMatchObject({ musicId: null, musicStartSec: 0 });
    const none = emptyEdit();
    expect(removeMusic(none)).toBe(none);
  });

  it('is finite, ≥ 0, on the 0.1 s grid and inside the track (at least a second of it still plays)', () => {
    expect(musicStartMax(30)).toBe(30 - MUSIC_MIN_PLAY_SEC);
    expect(musicStartMax(29.37)).toBe(28.3);
    expect(musicStartMax(30.3)).toBe(29.3); // no float noise flooring a step off
    expect(musicStartMax(0.6)).toBe(0); // shorter than the floor: the top is the only start
    // A length the browser could not read: the server's own ceiling decides.
    expect(musicStartMax(0)).toBe(MAX_MUSIC_START_SEC);
    expect(clampMusicStart(12.34, 30)).toBe(12.3);
    expect(clampMusicStart(12.35, 30)).toBe(12.4);
    expect(clampMusicStart(-4, 30)).toBe(0);
    expect(clampMusicStart(99, 30)).toBe(29);
    expect(clampMusicStart(Number.NaN, 30)).toBe(0);
    expect(clampMusicStart(5000, 0)).toBe(MAX_MUSIC_START_SEC);
    for (const v of [0, 7.3, 28.9, 29, 31, 1e9]) expect(clampMusicStart(v, 30)).toBeLessThanOrEqual(30);
  });

  it('setMusicStart is a pure edit — no change, same object; a non-finite value changes nothing', () => {
    const { edit } = withSong(0);
    const moved = setMusicStart(edit, 42.06, 120);
    expect(moved).not.toBe(edit);
    expect(moved.musicStartSec).toBe(42.1);
    expect(edit.musicStartSec).toBe(0); // the old edit is untouched
    expect(setMusicStart(moved, 42.1, 120)).toBe(moved);
    expect(setMusicStart(moved, Number.NaN, 120)).toBe(moved);
    expect(setMusicStart(moved, Number.POSITIVE_INFINITY, 120)).toBe(moved);
    expect(setMusicStart(moved, 500, 120).musicStartSec).toBe(119);
  });

  it('is an undo step like any other edit', () => {
    const { edit } = withSong(0);
    let h = startHistory(edit);
    h = commit(h, setMusicStart(h.present, 10, 30));
    h = commit(h, setMusicStart(h.present, 20, 30));
    expect(h.present.musicStartSec).toBe(20);
    expect(undo(h).present.musicStartSec).toBe(10);
    expect(undo(undo(h)).present.musicStartSec).toBe(0);
    expect(redo(undo(h)).present.musicStartSec).toBe(20);
    // Setting the start it already has is not a step.
    expect(commit(h, setMusicStart(h.present, 20, 30))).toBe(h);
  });

  it('how long the song plays under the edit: from its start to its end or the edit’s end', () => {
    expect(musicSpanSec(30, 0, 12)).toBe(12);
    expect(musicSpanSec(30, 25, 12)).toBe(5);
    expect(musicSpanSec(30, 29.5, 12)).toBe(0.5);
    expect(musicSpanSec(0, 10, 12)).toBe(12); // unknown length: assumed to cover the edit
  });

  it('goes out with the export only when the song is up and the start is past the top', () => {
    const { edit, sources } = withSong(42.5, 120);
    expect(buildRenderBody(edit, sources)).toMatchObject({ musicUrl: 'u/m', musicOnly: false, musicStartSec: 42.5 });
    expect(buildRenderBody(setMusicStart(edit, 0, 120), sources)).not.toHaveProperty('musicStartSec');
    // Still uploading: no music at all (Export is blocked anyway), so no start either.
    const pending = { ...sources, m: song(120, { status: 'uploading', ref: null }) };
    expect(buildRenderBody(edit, pending)).not.toHaveProperty('musicUrl');
    expect(buildRenderBody(edit, pending)).not.toHaveProperty('musicStartSec');
  });
});
