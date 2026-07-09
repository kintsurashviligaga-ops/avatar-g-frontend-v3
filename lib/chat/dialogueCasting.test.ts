/** @jest-environment node */
import { inferCastingTraits, voicePool, castRoster, collapseVoicedTurns, NARRATOR_SPEAKER, type CastTurn, type VoicedTurn } from './dialogueCasting';

// The module reads process.env lazily (per call), so we set slots per-test and restore after.
const SLOTS = [
  'ELEVENLABS_VOICE_ID_MALE', 'ELEVENLABS_VOICE_ID_MALE_2', 'ELEVENLABS_VOICE_ID_MALE_3',
  'ELEVENLABS_VOICE_ID_FEMALE', 'ELEVENLABS_VOICE_ID_FEMALE_2',
  'ELEVENLABS_VOICE_ID_CHILD', 'ELEVENLABS_VOICE_ID_ELDERLY_FEMALE',
  'ELEVENLABS_GEORGIAN_VOICE_ID', 'ELEVENLABS_VOICE_ID',
];
const saved: Record<string, string | undefined> = {};
beforeAll(() => { for (const k of SLOTS) saved[k] = process.env[k]; });
afterAll(() => { for (const k of SLOTS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });
beforeEach(() => { for (const k of SLOTS) delete process.env[k]; });

describe('inferCastingTraits', () => {
  it('reads gender from EN + KA speaker keywords', () => {
    expect(inferCastingTraits('Woman')).toMatchObject({ gender: 'female', ageBand: 'adult' });
    expect(inferCastingTraits('ქალი')).toMatchObject({ gender: 'female' });
    expect(inferCastingTraits('Officer')).toMatchObject({ gender: 'male', ageBand: 'adult' });
    expect(inferCastingTraits('ჯარისკაცი')).toMatchObject({ gender: 'male' });
    expect(inferCastingTraits('Nino')).toMatchObject({ gender: 'female' });
  });
  it('reads age band (child / elderly) over the default adult', () => {
    expect(inferCastingTraits('Grandmother')).toMatchObject({ ageBand: 'elderly', gender: 'female' });
    expect(inferCastingTraits('ბებია')).toMatchObject({ ageBand: 'elderly' });
    expect(inferCastingTraits('Child')).toMatchObject({ ageBand: 'child' });
    expect(inferCastingTraits('ბავშვი')).toMatchObject({ ageBand: 'child' });
  });
  it('uses the direction hint + defaults to female-adult on an unknown name (legacy parity)', () => {
    expect(inferCastingTraits('Voice 1', 'old man, gravelly')).toMatchObject({ gender: 'male', ageBand: 'elderly' });
    expect(inferCastingTraits('XYZ')).toMatchObject({ gender: 'female', ageBand: 'adult' });
  });
});

describe('voicePool', () => {
  it('orders persona → gender base → shared fallback, de-duped', () => {
    process.env.ELEVENLABS_VOICE_ID_MALE = 'm1';
    process.env.ELEVENLABS_VOICE_ID_MALE_2 = 'm2';
    process.env.ELEVENLABS_VOICE_ID = 'base';
    expect(voicePool({ gender: 'male', ageBand: 'adult' })).toEqual(['m1', 'm2', 'base']);
  });
  it('puts the elderly/child persona slot first, then the gender base', () => {
    process.env.ELEVENLABS_VOICE_ID_ELDERLY_FEMALE = 'ef';
    process.env.ELEVENLABS_VOICE_ID_FEMALE = 'f1';
    expect(voicePool({ gender: 'female', ageBand: 'elderly' })).toEqual(['ef', 'f1']);
    process.env.ELEVENLABS_VOICE_ID_CHILD = 'kid';
    expect(voicePool({ gender: 'female', ageBand: 'child' })).toEqual(['kid', 'f1']);
  });
  it('is empty when no voice slots are configured (→ synthesize falls back internally)', () => {
    expect(voicePool({ gender: 'male', ageBand: 'adult' })).toEqual([]);
  });
});

describe('castRoster', () => {
  const turns: CastTurn[] = [
    { speaker: 'Woman', text: 'ღმერთო ჩემო…' },
    { speaker: 'Grandmother', text: 'ისევ ომი…' },
    { speaker: 'Officer', text: 'წინ!' },
    { speaker: 'Woman', text: 'არა…' }, // repeat speaker → same voice
    { speaker: 'Recruit', text: 'დიახ!' }, // 2nd distinct male-adult → next pool voice
  ];

  it('gives each distinct speaker one stable voice; repeats keep it', () => {
    process.env.ELEVENLABS_VOICE_ID_MALE = 'm1';
    process.env.ELEVENLABS_VOICE_ID_MALE_2 = 'm2';
    process.env.ELEVENLABS_VOICE_ID_FEMALE = 'f1';
    process.env.ELEVENLABS_VOICE_ID_ELDERLY_FEMALE = 'ef';
    const r = castRoster(turns);
    expect(r.get('woman')).toMatchObject({ gender: 'female', ageBand: 'adult', voiceId: 'f1' });
    expect(r.get('grandmother')).toMatchObject({ ageBand: 'elderly', voiceId: 'ef' });
    // two distinct male-adult speakers land on DIFFERENT pool voices (round-robin casting seed)
    expect(r.get('officer')!.voiceId).toBe('m1');
    expect(r.get('recruit')!.voiceId).toBe('m2');
    expect(r.size).toBe(4); // Woman de-duplicated
  });

  it('is deterministic — same turns, same casting', () => {
    process.env.ELEVENLABS_VOICE_ID_MALE = 'm1';
    process.env.ELEVENLABS_VOICE_ID_MALE_2 = 'm2';
    expect(castRoster(turns).get('recruit')!.voiceId).toBe(castRoster(turns).get('recruit')!.voiceId);
  });

  it('wraps within a single-voice pool (same voice for same-profile chars when only one configured)', () => {
    process.env.ELEVENLABS_VOICE_ID_MALE = 'only';
    const r = castRoster(turns);
    expect(r.get('officer')!.voiceId).toBe('only');
    expect(r.get('recruit')!.voiceId).toBe('only');
  });

  it('assigns null voice when nothing is configured (degrades to internal fallback)', () => {
    const r = castRoster(turns);
    expect(r.get('woman')!.voiceId).toBeNull();
    expect(r.get('woman')!.gender).toBe('female');
  });
});

describe('collapseVoicedTurns', () => {
  const v = (speaker: string, text: string, voiceId: string | null, gender: 'male' | 'female' = 'male'): VoicedTurn =>
    ({ speaker, text, voiceId, gender });

  it('merges consecutive SAME-speaker lines into one breath', () => {
    const out = collapseVoicedTurns([v('giorgi', 'A.', 'm1'), v('giorgi', 'B.', 'm1')], 12);
    expect(out).toHaveLength(1);
    expect(out[0]!.text).toBe('A. B.');
  });

  it('does NOT merge two DISTINCT speakers even when they share a pooled voice (finding #3/#4)', () => {
    // Both male → same voiceId 'm1' under a 1-voice pool, but they are different characters.
    const out = collapseVoicedTurns([v('giorgi', 'G1.', 'm1'), v('david', 'D1.', 'm1'), v('giorgi', 'G2.', 'm1')], 12);
    expect(out.map((t) => t.text)).toEqual(['G1.', 'D1.', 'G2.']);
  });

  it('reserves the narrator VO spine when the cap is exceeded (finding #2)', () => {
    const many: VoicedTurn[] = [];
    for (let i = 0; i < 20; i++) many.push(v(`char${i}`, `line ${i}`, `x${i}`));
    many.push(v(NARRATOR_SPEAKER, 'the closing narration', 'nrr'));
    const out = collapseVoicedTurns(many, 5);
    expect(out).toHaveLength(5);
    // narrator survives even though it is the very last (highest-index) turn
    expect(out.some((t) => t.speaker === NARRATOR_SPEAKER)).toBe(true);
    // and original order is preserved (narrator stays last)
    expect(out[out.length - 1]!.speaker).toBe(NARRATOR_SPEAKER);
  });

  it('preserves original (timecode) order and honors cap<=0', () => {
    const out = collapseVoicedTurns([v('a', '1.', 'x'), v('b', '2.', 'y'), v('c', '3.', 'z')], 2);
    expect(out.map((t) => t.text)).toEqual(['1.', '2.']);
    expect(collapseVoicedTurns([v('a', '1.', 'x')], 0)).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const input = [v('a', 'X.', 'x'), v('a', 'Y.', 'x')];
    collapseVoicedTurns(input, 12);
    expect(input.map((t) => t.text)).toEqual(['X.', 'Y.']);
  });
});
