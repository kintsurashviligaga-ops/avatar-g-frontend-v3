/** @jest-environment node */
import {
  hasRunwayProvider,
  runwayModel,
  mapRunwayRatio,
  mapRunwayDuration,
  createRunwayI2V,
  pollRunwayTask,
} from './runway';


describe('runway adapter — pure mappers', () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  test('mapRunwayRatio emits RESOLUTION strings (never 16:9/9:16) — gen4_turbo default → the 720-family', () => {
    // default model is now gen4_turbo, so the default ratios are the gen4 720-family (not the gen3a 768-family)
    expect(mapRunwayRatio('9:16')).toBe('720:1280');
    expect(mapRunwayRatio('vertical')).toBe('720:1280');
    expect(mapRunwayRatio('16:9')).toBe('1280:720');
    expect(mapRunwayRatio('landscape')).toBe('1280:720');
    expect(mapRunwayRatio(undefined)).toBe('1280:720');
    // never emits the deprecated aspect forms that the 2024-11-06 API rejects
    expect(['720:1280', '1280:720']).toContain(mapRunwayRatio('9:16'));
  });

  test('mapRunwayRatio honours per-orientation env overrides (e.g. gen4_turbo ratios)', () => {
    process.env.RUNWAY_RATIO_LANDSCAPE = '1280:720';
    process.env.RUNWAY_RATIO_PORTRAIT = '720:1280';
    expect(mapRunwayRatio('16:9')).toBe('1280:720');
    expect(mapRunwayRatio('9:16')).toBe('720:1280');
  });

  test('mapRunwayRatio is MODEL-AWARE — switching to gen4_turbo auto-selects 720-family (no env foot-gun)', () => {
    delete process.env.RUNWAY_RATIO_LANDSCAPE; delete process.env.RUNWAY_RATIO_PORTRAIT;
    process.env.RUNWAY_VIDEO_MODEL = 'gen3a_turbo';
    expect(mapRunwayRatio('16:9')).toBe('1280:768'); // gen3a family
    expect(mapRunwayRatio('9:16')).toBe('768:1280');
    process.env.RUNWAY_VIDEO_MODEL = 'gen4_turbo';
    expect(mapRunwayRatio('16:9')).toBe('1280:720'); // gen4 family — switching the model alone Just Works
    expect(mapRunwayRatio('9:16')).toBe('720:1280');
  });

  test('mapRunwayDuration clamps to Runway’s only legal values (5 or 10)', () => {
    expect(mapRunwayDuration(5)).toBe(5);
    expect(mapRunwayDuration(6)).toBe(5);
    expect(mapRunwayDuration(8)).toBe(10);
    expect(mapRunwayDuration(30)).toBe(10);
    expect(mapRunwayDuration(undefined)).toBe(5);
  });

  test('runwayModel defaults to the flagship gen4_turbo (gen3a_turbo is EOL), env-overridable', () => {
    delete process.env.RUNWAY_VIDEO_MODEL;
    expect(runwayModel()).toBe('gen4_turbo');
    process.env.RUNWAY_VIDEO_MODEL = 'gen3a_turbo';
    expect(runwayModel()).toBe('gen3a_turbo');
  });
});

describe('retired Runway transport', () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });
  test.each([undefined, 'legacy-key'])('stays disabled with key %s and makes no create/poll request', async (key) => {
    if (key) process.env.RUNWAY_API_KEY = key;
    else delete process.env.RUNWAY_API_KEY;
    const fetchImpl = jest.fn();
    expect(hasRunwayProvider()).toBe(false);
    await expect(createRunwayI2V({ promptImage: 'https://example.com/image.png', fetchImpl })).rejects.toMatchObject({ code: 'provider_deprecated' });
    await expect(pollRunwayTask('task-123', { fetchImpl })).rejects.toMatchObject({ code: 'provider_deprecated' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
