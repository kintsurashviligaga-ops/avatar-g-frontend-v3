import { isAiGoogleOnly } from './policy';

describe('isAiGoogleOnly (always on, MASTER TASK v3.1)', () => {
  const saved = { ai: process.env.AI_GOOGLE_ONLY, approved: process.env.OUTSIDE_ENGINES_APPROVED };
  afterEach(() => {
    if (saved.ai === undefined) delete process.env.AI_GOOGLE_ONLY;
    else process.env.AI_GOOGLE_ONLY = saved.ai;
    if (saved.approved === undefined) delete process.env.OUTSIDE_ENGINES_APPROVED;
    else process.env.OUTSIDE_ENGINES_APPROVED = saved.approved;
  });

  it('is ON when AI_GOOGLE_ONLY is unset, empty or whitespace', () => {
    delete process.env.AI_GOOGLE_ONLY;
    expect(isAiGoogleOnly()).toBe(true);
    process.env.AI_GOOGLE_ONLY = '';
    expect(isAiGoogleOnly()).toBe(true);
    process.env.AI_GOOGLE_ONLY = '   ';
    expect(isAiGoogleOnly()).toBe(true);
  });

  it.each(['0', 'false', 'no', 'off', 'FALSE', ' Off ', 'No', '1', 'true', 'anything-else'])(
    'stays ON for %p, even with an owner approval',
    (v) => {
      process.env.AI_GOOGLE_ONLY = v;
      delete process.env.OUTSIDE_ENGINES_APPROVED;
      expect(isAiGoogleOnly()).toBe(true);
      process.env.OUTSIDE_ENGINES_APPROVED = 'owner-2026-10-20-anthropic';
      expect(isAiGoogleOnly()).toBe(true);
    },
  );
});
