/** @jest-environment node */
import {
  scoreToGrade,
  buildVisionQaPrompt,
  parseVisionVerdict,
  evaluateRenderQuality,
  visionQaEnabled,
  evaluateSceneClips,
  VISION_QUALITY_FLOOR,
} from './visionQualityGate';

// The transport is server-only; the gate lazy-imports it only when no Gemini key is in the env (Vertex).
const mockGoogleAiConfigured = jest.fn(() => false);
jest.mock('./google/transport', () => ({ googleAiConfigured: () => mockGoogleAiConfigured() }));

describe('scoreToGrade — score → grade (Phase 27 V2)', () => {
  test('maps score bands, with the floor as the F boundary', () => {
    expect(scoreToGrade(90)).toBe('A');
    expect(scoreToGrade(85)).toBe('A');
    expect(scoreToGrade(80)).toBe('B');
    expect(scoreToGrade(72)).toBe('B');
    expect(scoreToGrade(60)).toBe('C');
    expect(scoreToGrade(VISION_QUALITY_FLOOR)).toBe('C'); // at the floor is not F
    expect(scoreToGrade(VISION_QUALITY_FLOOR - 1)).toBe('F');
    expect(scoreToGrade(10)).toBe('F');
  });
  test('an explicit floor overrides the default', () => {
    expect(scoreToGrade(70, 75)).toBe('F');
    expect(scoreToGrade(76, 75)).toBe('B');
  });
});

describe('buildVisionQaPrompt', () => {
  test('embeds the rubric + the character lock when supplied', () => {
    const p = buildVisionQaPrompt({ characterLock: 'a 25-year-old woman, red coat', style: 'noir' });
    expect(p).toMatch(/CHARACTER CONSISTENCY/);
    expect(p).toMatch(/DEFORMITY/);
    expect(p).toMatch(/a 25-year-old woman, red coat/);
    expect(p).toMatch(/noir/);
    expect(p).toMatch(/ONLY compact JSON/);
  });
});

describe('parseVisionVerdict — model reply → verdict', () => {
  test('a clean high score → grade A, accept, pass', () => {
    const v = parseVisionVerdict('{"score": 92, "issues": []}', 4);
    expect(v.ran).toBe(true);
    expect(v.grade).toBe('A');
    expect(v.action).toBe('accept');
    expect(v.pass).toBe(true);
    expect(v.frameCount).toBe(4);
  });
  test('a sub-floor score → grade F → RERENDER signal, does not pass', () => {
    const v = parseVisionVerdict('{"score": 30, "issues": [{"code":"drift","severity":"warn","detail":"palette jumps"}]}', 4);
    expect(v.grade).toBe('F');
    expect(v.action).toBe('rerender');
    expect(v.pass).toBe(false);
  });
  test('a CRITICAL issue forces grade F even with a high score', () => {
    const v = parseVisionVerdict('{"score": 95, "issues": [{"code":"warp","severity":"critical","detail":"melted face"}]}', 3);
    expect(v.grade).toBe('F');
    expect(v.action).toBe('rerender');
  });
  test('JSON embedded in prose is extracted', () => {
    const v = parseVisionVerdict('Here is my assessment: {"score": 78, "issues": []} — done.', 4);
    expect(v.grade).toBe('B');
    expect(v.ran).toBe(true);
  });
  test('an unparseable reply has no passing quality claim', () => {
    const v = parseVisionVerdict('the model rambled with no json', 4);
    expect(v.ran).toBe(false);
    expect(v.pass).toBe(false);
    expect(v.action).toBe('review');
    expect(v.reason).toBe('parse_error');
  });
  test('a missing score remains unavailable rather than inventing a perfect score', () => {
    const v = parseVisionVerdict('{"issues": []}', 4);
    expect(v.score).toBeNull();
    expect(v.grade).toBeNull();
  });
});

describe('evaluateRenderQuality — fail-open orchestration (injected deps)', () => {
  const base = { videoUrl: 'https://cdn/master.mp4', characterLock: 'a hero' };

  test('gate DISABLED → skip("disabled"), never runs (no extract/score call)', async () => {
    const extract = jest.fn();
    const score = jest.fn();
    const v = await evaluateRenderQuality(base, { enabled: () => false, extract, score });
    expect(v.reason).toBe('disabled');
    expect(v.ran).toBe(false);
    expect(v.pass).toBe(false);
    expect(extract).not.toHaveBeenCalled();
    expect(score).not.toHaveBeenCalled();
  });

  test('no Gemini key → skip("no_key"), no extraction', async () => {
    const extract = jest.fn();
    const v = await evaluateRenderQuality(base, { enabled: () => true, keyPresent: () => false, extract });
    expect(v.reason).toBe('no_key');
    expect(extract).not.toHaveBeenCalled();
  });

  test('no frames extracted → skip("no_frames")', async () => {
    const v = await evaluateRenderQuality(base, { enabled: () => true, keyPresent: () => true, extract: async () => [] });
    expect(v.reason).toBe('no_frames');
    expect(v.pass).toBe(false);
  });

  test('vision model returns null (timeout/no key) → skip("vision_unavailable"), fail-open', async () => {
    const v = await evaluateRenderQuality(base, {
      enabled: () => true, keyPresent: () => true,
      extract: async () => ['ZmFrZQ=='], score: async () => null,
    });
    expect(v.reason).toBe('vision_unavailable');
    expect(v.pass).toBe(false);
    expect(v.frameCount).toBe(1);
  });

  test('happy path → runs the vision model and returns the parsed verdict', async () => {
    const v = await evaluateRenderQuality(base, {
      enabled: () => true, keyPresent: () => true,
      extract: async () => ['a', 'b', 'c'],
      score: async (prompt) => {
        expect(prompt).toMatch(/a hero/); // the character lock reached the rubric
        return '{"score": 40, "issues": [{"code":"warp","severity":"critical","detail":"deformed"}]}';
      },
    });
    expect(v.ran).toBe(true);
    expect(v.grade).toBe('F');
    expect(v.action).toBe('rerender');
    expect(v.frameCount).toBe(3);
  });

  test('extract THROWS → fail-open (skip, never throws up into the render path)', async () => {
    const v = await evaluateRenderQuality(base, {
      enabled: () => true, keyPresent: () => true,
      extract: async () => { throw new Error('ffmpeg exploded'); },
    });
    expect(v.pass).toBe(false);
    expect(v.reason).toBe('no_frames');
  });

  test('visionQaEnabled reads FILM_VISION_QA', () => {
    expect(visionQaEnabled({ FILM_VISION_QA: '1' } as NodeJS.ProcessEnv)).toBe(true);
    expect(visionQaEnabled({ FILM_VISION_QA: '0' } as NodeJS.ProcessEnv)).toBe(false);
    expect(visionQaEnabled({} as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe('the default key check also asks the transport (a Vertex project has no Gemini key)', () => {
  const KEYS = ['GEMINI_API_KEY', 'GOOGLE_AI_API_KEY', 'GOOGLE_API_KEY'] as const;
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => { for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; } });
  afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

  test('no key, Vertex configured → the gate runs', async () => {
    mockGoogleAiConfigured.mockReturnValue(true);
    const extract = jest.fn(async () => ['a']);
    const v = await evaluateRenderQuality({ videoUrl: 'https://cdn/clip.mp4' }, { enabled: () => true, extract, score: async () => '{"score": 90, "issues": []}' });
    expect(extract).toHaveBeenCalledTimes(1);
    expect(v.ran).toBe(true);
    expect(v.grade).toBe('A');
  });

  test('no key, no transport → skip("no_key") before any download', async () => {
    mockGoogleAiConfigured.mockReturnValue(false);
    const extract = jest.fn(async () => ['a']);
    const v = await evaluateRenderQuality({ videoUrl: 'https://cdn/clip.mp4' }, { enabled: () => true, extract });
    expect(v.reason).toBe('no_key');
    expect(extract).not.toHaveBeenCalled();
  });

  test('an AI Studio key without Vertex no longer starts the extraction (MASTER TASK v3.1)', async () => {
    mockGoogleAiConfigured.mockReturnValue(false);
    process.env.GEMINI_API_KEY = 'AQ.test-key';
    const extract = jest.fn(async () => ['a']);
    const v = await evaluateRenderQuality({ videoUrl: 'https://cdn/clip.mp4' }, { enabled: () => true, extract });
    expect(v.reason).toBe('no_key');
    expect(extract).not.toHaveBeenCalled();
  });

  test('an async keyPresent is awaited (a pending promise is not "present")', async () => {
    const extract = jest.fn(async () => ['a']);
    const v = await evaluateRenderQuality({ videoUrl: 'https://cdn/clip.mp4' }, { enabled: () => true, keyPresent: async () => false, extract });
    expect(v.reason).toBe('no_key');
    expect(extract).not.toHaveBeenCalled();
  });
});

describe('evaluateSceneClips — each scene graded on its own (audit item 3b)', () => {
  const clips = [3, 1, 2].map((ordinal) => ({ ordinal, url: `https://cdn/clip-${ordinal}.mp4` }));
  const verdicts: Record<string, string | null> = {
    'clip-1': '{"score": 91, "issues": []}',
    'clip-2': '{"score": 40, "issues": [{"code":"warp","severity":"critical","detail":"a melted hand"}]}',
    'clip-3': '{"score": 64, "issues": [{"code":"drift","severity":"warn","detail":"palette jumps"}]}',
  };
  const deps = {
    enabled: () => true,
    keyPresent: () => true,
    extract: async (url: string) => [url],
    score: async (_prompt: string, frames: string[]) => verdicts[/clip-\d/.exec(frames[0])![0]] ?? null,
  };

  test('every scene is graded and reported in scene order, with issue codes only', async () => {
    const out = await evaluateSceneClips(clips, { deadlineMs: 5_000 }, deps);
    expect(out).toEqual([
      { ordinal: 1, status: 'PASS', grade: 'A', score: 91, action: 'accept', issues: [] },
      { ordinal: 2, status: 'FAIL', grade: 'F', score: 40, action: 'rerender', issues: ['warp'] },
      { ordinal: 3, status: 'PASS', grade: 'C', score: 64, action: 'accept', issues: ['drift'] },
    ]);
  });

  test('a scene the gate could not measure is retained without a passing grade', async () => {
    const out = await evaluateSceneClips(clips, { deadlineMs: 5_000 }, { ...deps, score: async (_p: string, f: string[]) => (f[0].includes('clip-2') ? null : verdicts['clip-1']) });
    expect(out.map((e) => e.ordinal)).toEqual([1, 2, 3]);
    expect(out[1]).toMatchObject({ status: 'UNAVAILABLE', grade: null, reason: 'vision_unavailable' });
  });

  test('off → nothing runs, and every input is explicitly skipped', async () => {
    const extract = jest.fn(async () => ['a']);
    const out = await evaluateSceneClips(clips, { deadlineMs: 5_000 }, { ...deps, enabled: () => false, extract });
    expect(out).toHaveLength(3);
    expect(out.every((q) => q.status === 'SKIPPED' && q.grade === null)).toBe(true);
    expect(extract).not.toHaveBeenCalled();
  });

  test('a scene still being graded at the deadline is unavailable, and the deadline holds', async () => {
    const slow = { ...deps, extract: async (url: string) => (url.includes('clip-2') ? new Promise<string[]>(() => {}) : [url]) };
    const t0 = Date.now();
    const out = await evaluateSceneClips(clips, { deadlineMs: 150, concurrency: 3 }, slow);
    expect(Date.now() - t0).toBeLessThan(2_000);
    expect(out.map((e) => e.ordinal)).toEqual([1, 2, 3]);
    expect(out[1]).toMatchObject({ status: 'UNAVAILABLE', grade: null, reason: 'deadline' });
  });

  test('no more clips are downloaded at once than the concurrency allows', async () => {
    let inFlight = 0;
    let peak = 0;
    const counted = {
      ...deps,
      extract: async (url: string) => {
        inFlight += 1; peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 10));
        inFlight -= 1;
        return [url];
      },
    };
    const many = Array.from({ length: 6 }, (_, i) => ({ ordinal: i + 1, url: `https://cdn/clip-${(i % 3) + 1}.mp4` }));
    const out = await evaluateSceneClips(many, { deadlineMs: 5_000, concurrency: 2 }, counted);
    expect(peak).toBe(2);
    expect(out).toHaveLength(6);
  });
});
