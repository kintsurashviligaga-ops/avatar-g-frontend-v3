import { isElevenAlignment } from './ttsTimestamps';
describe('with-timestamps alignment shape guard (STEP 2.6)', () => {
  it('accepts the real ElevenLabs with-timestamps shape', () => {
    expect(isElevenAlignment({ characters: ['a'], character_start_times_seconds: [0], character_end_times_seconds: [0.1] })).toBe(true);
  });
  it('rejects malformed / empty shapes', () => {
    expect(isElevenAlignment(null)).toBe(false);
    expect(isElevenAlignment({ characters: [] , character_start_times_seconds: [], character_end_times_seconds: [] })).toBe(false);
    expect(isElevenAlignment({ characters: ['a'] })).toBe(false);
    expect(isElevenAlignment({ text: 'x' })).toBe(false);
  });
});
