/** @jest-environment node */
import { googleOnlySwitch, outsideEnginesApproved } from './providerBoundary';

const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;

describe('provider boundary: a falsy *_GOOGLE_ONLY alone never re-opens outside engines', () => {
  it('unset / truthy ⇒ Google-only', () => {
    expect(googleOnlySwitch(undefined, env({}))).toBe(true);
    expect(googleOnlySwitch('1', env({ OUTSIDE_ENGINES_APPROVED: 'owner-2026-10-20' }))).toBe(true);
  });
  it.each(['0', 'false', 'off', 'no'])('falsy %p without an approval is ignored', (v) => {
    expect(googleOnlySwitch(v, env({}))).toBe(true);
    expect(googleOnlySwitch(v, env({ OUTSIDE_ENGINES_APPROVED: '' }))).toBe(true);
    expect(googleOnlySwitch(v, env({ OUTSIDE_ENGINES_APPROVED: '1' }))).toBe(true); // a flag, not an approval reference
    expect(googleOnlySwitch(v, env({ OUTSIDE_ENGINES_APPROVED: 'owner 2026' }))).toBe(true);
  });
  it('falsy + an owner approval reference ⇒ re-opened (the documented rollback)', () => {
    expect(googleOnlySwitch('0', env({ OUTSIDE_ENGINES_APPROVED: 'owner-2026-10-20-heygen' }))).toBe(false);
    expect(outsideEnginesApproved(env({ OUTSIDE_ENGINES_APPROVED: 'owner-2026-10-20-heygen' }))).toBe(true);
  });
  it('the video switch follows the same rule; the text switch no longer reads it at all', async () => {
    const saved = { ...process.env };
    process.env.VIDEO_GOOGLE_ONLY = '0'; process.env.AI_GOOGLE_ONLY = '0'; delete process.env.OUTSIDE_ENGINES_APPROVED;
    const { isGoogleOnly } = await import('../veo/policy');
    const { isAiGoogleOnly } = await import('../ai/google/policy');
    expect(isGoogleOnly()).toBe(true);
    expect(isAiGoogleOnly()).toBe(true);
    process.env.OUTSIDE_ENGINES_APPROVED = 'owner-2026-10-20-runway';
    expect(isGoogleOnly()).toBe(false);
    expect(isAiGoogleOnly()).toBe(true);
    process.env = saved;
  });
});
