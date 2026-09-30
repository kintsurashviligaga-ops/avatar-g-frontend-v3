import { isAiGoogleOnly } from './policy';

describe('isAiGoogleOnly', () => {
  const saved = process.env.AI_GOOGLE_ONLY;
  afterEach(() => {
    if (saved === undefined) delete process.env.AI_GOOGLE_ONLY;
    else process.env.AI_GOOGLE_ONLY = saved;
  });

  it('is ON when AI_GOOGLE_ONLY is unset', () => {
    delete process.env.AI_GOOGLE_ONLY;
    expect(isAiGoogleOnly()).toBe(true);
  });

  it('is ON when AI_GOOGLE_ONLY is empty or whitespace', () => {
    process.env.AI_GOOGLE_ONLY = '';
    expect(isAiGoogleOnly()).toBe(true);
    process.env.AI_GOOGLE_ONLY = '   ';
    expect(isAiGoogleOnly()).toBe(true);
  });

  it.each(['0', 'false', 'no', 'off', 'FALSE', ' Off ', 'No'])('is OFF (kill switch) for %p', (v) => {
    process.env.AI_GOOGLE_ONLY = v;
    expect(isAiGoogleOnly()).toBe(false);
  });

  it.each(['1', 'true', 'yes', 'on', 'anything-else'])('stays ON for %p', (v) => {
    process.env.AI_GOOGLE_ONLY = v;
    expect(isAiGoogleOnly()).toBe(true);
  });

  it('reads the env at call time, not at import', () => {
    process.env.AI_GOOGLE_ONLY = '0';
    expect(isAiGoogleOnly()).toBe(false);
    process.env.AI_GOOGLE_ONLY = '1';
    expect(isAiGoogleOnly()).toBe(true);
  });
});
