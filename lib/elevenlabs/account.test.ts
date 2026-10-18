/**
 * lib/elevenlabs/account — the voice health probes read the plan, not just the key. 2026-10-17 09:31Z: the approved
 * avatar test was refused by ElevenLabs (`401 subscription_required / ivc_not_permitted`) while health said "voice ok".
 */
import { describeElevenLabsAccount, elevenLabsVoiceState, isLastingVoiceRefusal, readElevenLabsAccount } from './account';

describe('readElevenLabsAccount', () => {
  it('reads the plan, the characters left and whether cloned voices are allowed', () => {
    const a = readElevenLabsAccount({ subscription: { tier: 'free', character_count: 1200, character_limit: 10000, can_use_instant_voice_cloning: false } });
    expect(a).toEqual({ tier: 'free', charactersLeft: 8800, cloning: false });
  });

  it('leaves what ElevenLabs did not say unknown', () => {
    expect(readElevenLabsAccount({})).toEqual({ tier: null, charactersLeft: null, cloning: null });
    expect(readElevenLabsAccount(null)).toEqual({ tier: null, charactersLeft: null, cloning: null });
    expect(readElevenLabsAccount({ subscription: { tier: 42, character_count: '1', can_use_instant_voice_cloning: 'yes' } }))
      .toEqual({ tier: null, charactersLeft: null, cloning: null });
  });
});

describe('elevenLabsVoiceState', () => {
  it('fails a plan that does not allow cloned voices — the Georgian voices are all clones', () => {
    expect(elevenLabsVoiceState({ tier: 'free', charactersLeft: 9000, cloning: false })).toBe('no_cloning');
  });

  it('fails an exhausted quota', () => {
    expect(elevenLabsVoiceState({ tier: 'starter', charactersLeft: 0, cloning: true })).toBe('no_characters');
  });

  it('passes a plan with cloning and characters, and never fails on an unknown alone', () => {
    expect(elevenLabsVoiceState({ tier: 'starter', charactersLeft: 25000, cloning: true })).toBe('ok');
    expect(elevenLabsVoiceState({ tier: null, charactersLeft: null, cloning: null })).toBe('ok');
  });
});

describe('describeElevenLabsAccount', () => {
  it('names the plan and the missing cloning, and never carries a key', () => {
    const line = describeElevenLabsAccount({ tier: 'free', charactersLeft: 9000, cloning: false });
    expect(line).toMatch(/^no_cloning · plan free · cloned voices: NOT allowed/);
    expect(line).toContain('9000 characters left');
  });
});

describe('isLastingVoiceRefusal', () => {
  it('reads a plan, key or voice refusal as lasting, and a timeout, a rate limit or an outage as passing', () => {
    for (const s of [401, 402, 403, 404, 422]) expect(isLastingVoiceRefusal(s)).toBe(true);
    for (const s of [408, 429, 500, 502, 503]) expect(isLastingVoiceRefusal(s)).toBe(false);
  });
});
