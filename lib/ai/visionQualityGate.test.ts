/** @jest-environment node */
import {
  scoreToGrade,
  buildVisionQaPrompt,
  parseVisionVerdict,
  evaluateRenderQuality,
  visionQaEnabled,
  VISION_QUALITY_FLOOR,
} from './visionQualityGate';

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
  test('an unparseable reply FAILS OPEN to accept (never blocks a master on QA garbage)', () => {
    const v = parseVisionVerdict('the model rambled with no json', 4);
    expect(v.ran).toBe(false);
    expect(v.pass).toBe(true);
    expect(v.action).toBe('accept');
    expect(v.reason).toBe('parse_error');
  });
  test('a missing/NaN score defaults to 100 (accept) rather than blocking', () => {
    const v = parseVisionVerdict('{"issues": []}', 4);
    expect(v.score).toBe(100);
    expect(v.grade).toBe('A');
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
    expect(v.pass).toBe(true);
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
    expect(v.pass).toBe(true);
  });

  test('vision model returns null (timeout/no key) → skip("vision_unavailable"), fail-open', async () => {
    const v = await evaluateRenderQuality(base, {
      enabled: () => true, keyPresent: () => true,
      extract: async () => ['ZmFrZQ=='], score: async () => null,
    });
    expect(v.reason).toBe('vision_unavailable');
    expect(v.pass).toBe(true);
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
    expect(v.pass).toBe(true);
    expect(v.reason).toBe('no_frames');
  });

  test('visionQaEnabled reads FILM_VISION_QA', () => {
    expect(visionQaEnabled({ FILM_VISION_QA: '1' } as NodeJS.ProcessEnv)).toBe(true);
    expect(visionQaEnabled({ FILM_VISION_QA: '0' } as NodeJS.ProcessEnv)).toBe(false);
    expect(visionQaEnabled({} as NodeJS.ProcessEnv)).toBe(false);
  });
});
