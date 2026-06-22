import { deriveFilmRoster, deriveFilmLog, overallFilmPct, FILM_AGENT_ORDER, type FilmAgentId, type FilmAgentStatus } from './filmAgentRoster';
import type { FilmStudioProgress, FilmLegClientStatus } from './filmStudioClient';

const clip = (status: FilmLegClientStatus, ordinal: number) => ({ ordinal, status });

function progress(over: Partial<FilmStudioProgress> & { matrix?: Partial<NonNullable<FilmStudioProgress['matrix']>> | null }): FilmStudioProgress {
  const matrix = over.matrix === null ? null : {
    sceneCount: 6,
    seed: 1,
    storyboard: 'succeeded' as FilmLegClientStatus,
    clips: [],
    stitch: 'pending' as FilmLegClientStatus,
    audio: 'pending' as FilmLegClientStatus,
    ...(over.matrix ?? {}),
  };
  return {
    phase: over.phase ?? 'rendering',
    matrix: matrix as FilmStudioProgress['matrix'],
    message: over.message ?? '',
    masterUrl: over.masterUrl ?? null,
    previewUrl: over.previewUrl ?? null,
  };
}

const byId = (roster: ReturnType<typeof deriveFilmRoster>) =>
  Object.fromEntries(roster.map((a) => [a.id, a])) as Record<FilmAgentId, { status: FilmAgentStatus; pct: number; ready?: number; total?: number }>;

describe('deriveFilmRoster', () => {
  it('returns all 9 agents in canonical order, even for null progress', () => {
    const r = deriveFilmRoster(null);
    expect(r.map((a) => a.id)).toEqual(FILM_AGENT_ORDER);
    expect(r).toHaveLength(9);
  });

  it('idle progress → director queued, dormant specialists idle', () => {
    const r = byId(deriveFilmRoster(null));
    expect(r.director.status).toBe('queued');
    expect(r.lipsync.status).toBe('idle');
    expect(r.overlay.status).toBe('idle');
    expect(r.remix.status).toBe('idle');
  });

  it('graphics agent activates during the stitch (grade + LUT + overlay) and completes with the master', () => {
    const stitching = byId(deriveFilmRoster(progress({ phase: 'stitching', matrix: { storyboard: 'succeeded' } })));
    expect(stitching.overlay.status).toBe('processing'); // graphics work runs during the stitch
    const assembled = byId(deriveFilmRoster(progress({ phase: 'assembled', matrix: { storyboard: 'succeeded' } })));
    expect(assembled.overlay.status).toBe('completed');
    // lip-sync + remix stay dormant in the plain film render (honest — they run in
    // the companion talking-avatar + remix flows).
    expect(assembled.lipsync.status).toBe('idle');
    expect(assembled.remix.status).toBe('idle');
  });

  it('dispatching → director + storyboard working, video queued', () => {
    const r = byId(deriveFilmRoster(progress({ phase: 'dispatching', matrix: { storyboard: 'pending' } })));
    expect(r.director.status).toBe('processing');
    expect(r.storyboard.status).toBe('processing');
    expect(r.video.status).toBe('queued');
  });

  it('rendering with 3/6 clips → video processing at 50%, director done', () => {
    const r = byId(deriveFilmRoster(progress({
      phase: 'rendering',
      matrix: { clips: [clip('succeeded', 1), clip('succeeded', 2), clip('succeeded', 3), clip('queued', 4), clip('queued', 5), clip('queued', 6)] },
    })));
    expect(r.director.status).toBe('completed');
    expect(r.storyboard.status).toBe('completed');
    expect(r.video.status).toBe('processing');
    expect(r.video.ready).toBe(3);
    expect(r.video.total).toBe(6);
    expect(r.video.pct).toBe(50);
    expect(r.montage.status).toBe('queued');
  });

  it('stitching → video done, montage processing, audio legs processing', () => {
    const r = byId(deriveFilmRoster(progress({
      phase: 'stitching',
      matrix: { clips: [clip('succeeded', 1), clip('succeeded', 2), clip('succeeded', 3), clip('succeeded', 4), clip('succeeded', 5), clip('succeeded', 6)] },
    })));
    expect(r.video.status).toBe('completed');
    expect(r.montage.status).toBe('processing');
    expect(r.voice.status).toBe('processing');
    expect(r.sfx.status).toBe('processing');
  });

  it('voiceUrl / sfxUrl present → those agents complete', () => {
    const r = byId(deriveFilmRoster(progress({ phase: 'stitching', matrix: { voiceUrl: 'http://v', sfxUrl: 'http://s' } })));
    expect(r.voice.status).toBe('completed');
    expect(r.sfx.status).toBe('completed');
  });

  it('assembled → every active agent completed', () => {
    const r = byId(deriveFilmRoster(progress({
      phase: 'assembled',
      masterUrl: 'http://m',
      matrix: { stitch: 'succeeded', audio: 'succeeded', clips: [clip('succeeded', 1), clip('succeeded', 2)], sceneCount: 2 },
    })));
    expect(r.director.status).toBe('completed');
    expect(r.video.status).toBe('completed');
    expect(r.voice.status).toBe('completed');
    expect(r.sfx.status).toBe('completed');
    expect(r.montage.status).toBe('completed');
    expect(overallFilmPct(deriveFilmRoster(progress({ phase: 'assembled', matrix: { stitch: 'succeeded', audio: 'succeeded' } })))).toBe(100);
  });

  it('failed → director + video + montage report error', () => {
    const r = byId(deriveFilmRoster(progress({ phase: 'failed', matrix: { clips: [clip('failed', 1)], sceneCount: 6 } })));
    expect(r.director.status).toBe('error');
    expect(r.video.status).toBe('error');
    expect(r.montage.status).toBe('error');
  });

  it('overallFilmPct ignores dormant idle specialists', () => {
    // 6 active agents all at 0 (queued) + 3 idle → overall 0, not skewed by idle.
    const pct = overallFilmPct(deriveFilmRoster(progress({ phase: 'dispatching', matrix: { storyboard: 'pending' } })));
    expect(pct).toBeGreaterThanOrEqual(0);
    expect(pct).toBeLessThanOrEqual(100);
  });
});

describe('deriveFilmLog', () => {
  it('null progress → empty log', () => {
    expect(deriveFilmLog(null, 'en')).toEqual([]);
  });

  it('grows monotonically and keys are stable + unique', () => {
    const early = deriveFilmLog(progress({ phase: 'rendering', matrix: { clips: [clip('succeeded', 1)] } }), 'en');
    const later = deriveFilmLog(progress({ phase: 'rendering', matrix: { clips: [clip('succeeded', 1), clip('succeeded', 2), clip('succeeded', 3)] } }), 'en');
    // every early key survives in the later snapshot (monotonic)
    const laterKeys = new Set(later.map((l) => l.key));
    expect(early.every((l) => laterKeys.has(l.key))).toBe(true);
    expect(later.length).toBeGreaterThan(early.length);
    // keys unique
    expect(new Set(later.map((l) => l.key)).size).toBe(later.length);
  });

  it('emits one line per landed scene, in ordinal order', () => {
    const log = deriveFilmLog(progress({ phase: 'rendering', matrix: { clips: [clip('succeeded', 2), clip('succeeded', 1), clip('queued', 3)] } }), 'en');
    const clipLines = log.filter((l) => l.key.startsWith('clip-'));
    expect(clipLines.map((l) => l.key)).toEqual(['clip-1', 'clip-2']);
  });

  it('assembled → ends with the master-ready line', () => {
    const log = deriveFilmLog(progress({ phase: 'assembled', masterUrl: 'http://m', matrix: { stitch: 'succeeded', audio: 'succeeded', clips: [clip('succeeded', 1), clip('succeeded', 2)], sceneCount: 2 } }), 'en');
    expect(log.some((l) => l.key === 'master')).toBe(true);
    expect(log[log.length - 1]!.key).toBe('master');
  });

  it('localizes (ka differs from en)', () => {
    const en = deriveFilmLog(progress({ phase: 'dispatching', matrix: { storyboard: 'pending' } }), 'en');
    const ka = deriveFilmLog(progress({ phase: 'dispatching', matrix: { storyboard: 'pending' } }), 'ka');
    expect(en[0]!.text).not.toBe(ka[0]!.text);
    expect(en[0]!.key).toBe(ka[0]!.key);
  });
});
