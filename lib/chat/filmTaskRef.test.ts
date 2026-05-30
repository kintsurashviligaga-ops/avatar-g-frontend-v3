import {
  FILM_PREFIX,
  encodeFilmRef,
  decodeFilmRef,
  isFilmRef,
  computeFilmUnion,
  type FilmTaskRef,
} from './filmTaskRef';

const SAMPLE: Omit<FilmTaskRef, 'v'> = {
  sessionId: 'sess-123',
  createdAt: 1_700_000_000_000,
  seed: 4242,
  sceneCount: 5,
  clips: [
    { ordinal: 1, taskRef: 'ltx-aaa', status: 'queued', attempts: 1 },
    { ordinal: 2, taskRef: 'ltx-bbb', status: 'queued', attempts: 2 },
    { ordinal: 3, taskRef: null, status: 'failed', attempts: 2 },
    { ordinal: 4, taskRef: 'ltx-ddd', status: 'queued', attempts: 1 },
    { ordinal: 5, taskRef: null, status: 'skipped', attempts: 0 },
  ],
  musicWorkId: 'udio-work-9',
};

describe('film union token — encode/decode round-trip', () => {
  it('prefixes the token with `film:`', () => {
    const token = encodeFilmRef(SAMPLE);
    expect(token.startsWith(FILM_PREFIX)).toBe(true);
    expect(isFilmRef(token)).toBe(true);
  });

  it('round-trips every clip ref + the audio workId losslessly', () => {
    const token = encodeFilmRef(SAMPLE);
    const decoded = decodeFilmRef(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.v).toBe(1);
    expect(decoded!.sessionId).toBe('sess-123');
    expect(decoded!.seed).toBe(4242);
    expect(decoded!.sceneCount).toBe(5);
    expect(decoded!.musicWorkId).toBe('udio-work-9');
    expect(decoded!.clips).toHaveLength(5);
    expect(decoded!.clips[2]).toEqual({ ordinal: 3, taskRef: null, status: 'failed', attempts: 2 });
    expect(decoded!.clips.map((c) => c.taskRef)).toEqual(['ltx-aaa', 'ltx-bbb', null, 'ltx-ddd', null]);
  });

  it('survives base64url-unsafe payloads (+ / =) without corruption', () => {
    const tricky: Omit<FilmTaskRef, 'v'> = {
      ...SAMPLE,
      sessionId: 'sub?dir/with+slashes==and??',
      clips: [{ ordinal: 1, taskRef: 'a+b/c==d', status: 'queued', attempts: 1 }],
    };
    const decoded = decodeFilmRef(encodeFilmRef(tricky));
    expect(decoded!.sessionId).toBe('sub?dir/with+slashes==and??');
    expect(decoded!.clips[0]!.taskRef).toBe('a+b/c==d');
  });

  it('round-trips a music-less film (audio skipped)', () => {
    const decoded = decodeFilmRef(encodeFilmRef({ ...SAMPLE, musicWorkId: null }));
    expect(decoded!.musicWorkId).toBeNull();
  });
});

describe('film union token — guards', () => {
  it('isFilmRef is false for null/undefined/foreign tokens', () => {
    expect(isFilmRef(null)).toBe(false);
    expect(isFilmRef(undefined)).toBe(false);
    expect(isFilmRef('composite:abc')).toBe(false);
    expect(isFilmRef('udio:work')).toBe(false);
    expect(isFilmRef('plain-prediction-id')).toBe(false);
  });

  it('decodeFilmRef returns null for non-film tokens', () => {
    expect(decodeFilmRef('composite:abc')).toBeNull();
    expect(decodeFilmRef('not-a-token')).toBeNull();
  });

  it('decodeFilmRef returns null for malformed base64 / non-v1 / non-array clips', () => {
    expect(decodeFilmRef(`${FILM_PREFIX}@@@not-base64@@@`)).toBeNull();
    const wrongVersion = `${FILM_PREFIX}${Buffer.from(JSON.stringify({ v: 2, clips: [] }), 'utf8').toString('base64url')}`;
    expect(decodeFilmRef(wrongVersion)).toBeNull();
    const noClips = `${FILM_PREFIX}${Buffer.from(JSON.stringify({ v: 1, clips: 'nope' }), 'utf8').toString('base64url')}`;
    expect(decodeFilmRef(noClips)).toBeNull();
  });
});

describe('computeFilmUnion — the heart of the Union Poll Codec', () => {
  it('stays `processing` while any clip is still pending', () => {
    const u = computeFilmUnion(['succeeded', 'pending', 'succeeded', 'succeeded', 'succeeded'], 'succeeded');
    expect(u.filmStatus).toBe('processing');
    expect(u.readyToStitch).toBe(false);
    expect(u.stitchStatus).toBe('pending');
    expect(u.anyClipPending).toBe(true);
  });

  it('stays `processing` while audio is still pending even if all clips landed', () => {
    const u = computeFilmUnion(['succeeded', 'succeeded', 'succeeded', 'succeeded', 'succeeded'], 'pending');
    expect(u.filmStatus).toBe('processing');
    expect(u.readyToStitch).toBe(false);
  });

  it('resolves to `succeeded` + readyToStitch only when ALL clips land and audio is terminal', () => {
    const u = computeFilmUnion(['succeeded', 'succeeded', 'succeeded', 'succeeded', 'succeeded'], 'succeeded');
    expect(u.filmStatus).toBe('succeeded');
    expect(u.readyToStitch).toBe(true);
    expect(u.stitchStatus).toBe('ready');
    expect(u.renderSettled).toBe(true);
  });

  it('treats a skipped audio leg as terminal (audio-less film still stitches)', () => {
    const u = computeFilmUnion(['succeeded', 'succeeded', 'succeeded', 'succeeded', 'succeeded'], 'skipped');
    expect(u.filmStatus).toBe('succeeded');
    expect(u.readyToStitch).toBe(true);
  });

  it('ignores skipped clip legs when computing all-succeeded (degraded provider)', () => {
    // Only 3 clips actually rendered; the other 2 were skipped (no LTX key path).
    const u = computeFilmUnion(['succeeded', 'succeeded', 'succeeded', 'skipped', 'skipped'], 'skipped');
    expect(u.allClipsSucceeded).toBe(true);
    expect(u.filmStatus).toBe('succeeded');
    expect(u.readyToStitch).toBe(true);
  });

  it('fails the union — but does NOT discard — when a settled clip leg failed', () => {
    const u = computeFilmUnion(['succeeded', 'failed', 'succeeded', 'succeeded', 'succeeded'], 'succeeded');
    expect(u.filmStatus).toBe('failed');
    expect(u.readyToStitch).toBe(false);
    expect(u.anyClipFailed).toBe(true);
    expect(u.stitchStatus).toBe('blocked');
  });

  it('keeps a failed clip in `processing` while siblings are still pending (lets them finish)', () => {
    const u = computeFilmUnion(['failed', 'pending', 'succeeded', 'succeeded', 'succeeded'], 'succeeded');
    expect(u.filmStatus).toBe('processing');
    expect(u.stitchStatus).toBe('pending');
  });

  it('an all-skipped matrix never spuriously reports success', () => {
    const u = computeFilmUnion(['skipped', 'skipped', 'skipped', 'skipped', 'skipped'], 'skipped');
    expect(u.allClipsSucceeded).toBe(false);
    expect(u.filmStatus).toBe('failed');
    expect(u.readyToStitch).toBe(false);
  });
});
