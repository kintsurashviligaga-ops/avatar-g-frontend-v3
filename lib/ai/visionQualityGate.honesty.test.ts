/** @jest-environment node */
import { evaluateRenderQuality, parseVisionVerdict } from './visionQualityGate';

describe('unmeasured vision QA must never become a passing grade', () => {
  test.each([
    '', 'no JSON', '{}', '{"issues":[]}', '{"score":null,"issues":[]}',
    '{"score":"95","issues":[]}', '{"score":101,"issues":[]}', '{"score":-1,"issues":[]}',
    '{"score":95}', '{"score":95,"issues":null}', '{"score":95,"issues":[null]}',
    '{"score":95,"issues":[{"code":"warp","severity":"unknown","detail":"bad face"}]}',
    '{"score":95,"issues":[{"code":"warp","severity":"critical"}]}',
    '{"score":95,"issues":[{"code":"","severity":"critical","detail":"bad face"}]}',
    '{"score":95,"issues":[{"code":"warp","severity":"critical","detail":""}]}',
  ])('malformed or incomplete model result is unavailable: %s', (text) => {
    expect(parseVisionVerdict(text, 4)).toMatchObject({
      status: 'UNAVAILABLE', ran: false, pass: false, grade: null, score: null,
      action: 'review', reason: 'parse_error', frameCount: 4,
    });
  });

  test('an oversized issue list cannot hide a critical issue by truncation', () => {
    const issues = Array.from({ length: 12 }, () => ({ code: 'minor', severity: 'info', detail: 'minor finding' }));
    issues.push({ code: 'warp', severity: 'critical', detail: 'melted face' });
    expect(parseVisionVerdict(JSON.stringify({ score: 95, issues }), 4))
      .toMatchObject({ status: 'UNAVAILABLE', pass: false, grade: null, reason: 'parse_error' });
  });

  test.each([
    [95, [], 'PASS', true],
    [30, [], 'FAIL', false],
    [95, [{ code: 'warp', severity: 'critical', detail: 'melted face' }], 'FAIL', false],
  ])('a measured score %s has an explicit result', (score, issues, status, pass) => {
    expect(parseVisionVerdict(JSON.stringify({ score, issues }), 4)).toMatchObject({ status, pass, ran: true });
  });

  test('disabled QA is skipped, with no invented measurement and no provider work', async () => {
    const extract = jest.fn();
    const score = jest.fn();
    expect(await evaluateRenderQuality({ videoUrl: 'https://cdn/clip.mp4' }, { enabled: () => false, extract, score }))
      .toMatchObject({ status: 'SKIPPED', ran: false, pass: false, grade: null, score: null, action: 'review', reason: 'disabled' });
    expect(extract).not.toHaveBeenCalled();
    expect(score).not.toHaveBeenCalled();
  });

  test.each(['no_key', 'no_frames', 'vision_unavailable', 'gate_error'])('%s is unavailable, never passed', async (reason) => {
    const deps = {
      enabled: () => true,
      keyPresent: async () => { if (reason === 'gate_error') throw new Error('provider configuration failed'); return reason !== 'no_key'; },
      extract: async () => reason === 'no_frames' ? [] : ['frame'],
      score: async () => null,
    };
    expect(await evaluateRenderQuality({ videoUrl: 'https://cdn/clip.mp4' }, deps))
      .toMatchObject({ status: 'UNAVAILABLE', ran: false, pass: false, grade: null, score: null, action: 'review', reason });
  });
});
