/** @jest-environment node */
import {
  resolveDialogueCastPlan, buildDialoguePremixFilter, panToGains, DIALOGUE_DUCK_DB,
  type DialogueTurnInput,
} from './dialogueCastPlan';

// castRoster reads process.env for voice seeds — set two distinct same-gender voices so distinct speakers
// get DIFFERENT seeds. (Set/restore per the dialogueCasting test pattern.)
const SLOTS = ['ELEVENLABS_VOICE_ID_MALE', 'ELEVENLABS_VOICE_ID_MALE_2', 'ELEVENLABS_VOICE_ID_FEMALE', 'ELEVENLABS_VOICE_ID_FEMALE_2'];
const saved: Record<string, string | undefined> = {};
beforeAll(() => { for (const k of SLOTS) saved[k] = process.env[k]; });
afterAll(() => { for (const k of SLOTS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });
beforeEach(() => {
  process.env.ELEVENLABS_VOICE_ID_MALE = 'm1'; process.env.ELEVENLABS_VOICE_ID_MALE_2 = 'm2';
  process.env.ELEVENLABS_VOICE_ID_FEMALE = 'f1'; process.env.ELEVENLABS_VOICE_ID_FEMALE_2 = 'f2';
});

const t = (speaker: string, startSec: number | null): DialogueTurnInput => ({ speaker, startSec });

describe('resolveDialogueCastPlan — cast-map resolution', () => {
  it('casts each DISTINCT speaker to its own voice seed + a distinct stereo position', () => {
    const plan = resolveDialogueCastPlan([t('Officer', 0), t('Recruit', 3), t('Officer', 6)]);
    expect(plan.distinctSpeakers).toBe(2);
    expect(plan.multiSpeaker).toBe(true);
    // Two distinct male speakers → two different pooled voice seeds (round-robin in castRoster).
    const officer = plan.entries.find((e) => e.speaker === 'Officer')!;
    const recruit = plan.entries.find((e) => e.speaker === 'Recruit')!;
    expect(officer.voiceId).toBe('m1');
    expect(recruit.voiceId).toBe('m2');
    expect(officer.voiceId).not.toBe(recruit.voiceId);
    // First-cast speaker sits center (pan 0); the second gets a non-center slot.
    expect(officer.pan).toBe(0);
    expect(recruit.pan).not.toBe(0);
    // The SAME speaker keeps the SAME position across turns.
    expect(plan.entries.filter((e) => e.speaker === 'Officer').every((e) => e.pan === 0)).toBe(true);
  });

  it('is single-voice (multiSpeaker=false) for a one-speaker script → caller uses the fallback', () => {
    const plan = resolveDialogueCastPlan([t('Narrator', 0), t('Narrator', 4)]);
    expect(plan.distinctSpeakers).toBe(1);
    expect(plan.multiSpeaker).toBe(false);
  });

  it('requires EVERY kept turn to be timecoded — an untimed turn forces the single-voice fallback', () => {
    const plan = resolveDialogueCastPlan([t('Woman', 0), t('Man', null)]);
    expect(plan.multiSpeaker).toBe(false); // Man has no startSec → cannot be spatially placed
  });

  it('drops empty-speaker turns and never NaNs the plan', () => {
    const plan = resolveDialogueCastPlan([{ speaker: '  ', startSec: 0 }, t('Woman', 1), t('Man', 2)]);
    expect(plan.distinctSpeakers).toBe(2);
    expect(plan.entries.every((e) => Number.isFinite(e.startSec))).toBe(true);
  });
});

describe('panToGains — constant-power stereo positioning', () => {
  it('center → equal power; hard left/right → one channel', () => {
    expect(panToGains(0)).toEqual({ l: 0.707, r: 0.707 });
    expect(panToGains(-1)).toEqual({ l: 1, r: 0 });
    expect(panToGains(1)).toEqual({ l: 0, r: 1 });
    // clamps out-of-range
    expect(panToGains(-5)).toEqual({ l: 1, r: 0 });
  });
});

describe('buildDialoguePremixFilter — spatialized premix filtergraph', () => {
  it('pans + time-places each stem, then amixes into one [dialogue] lane', () => {
    const plan = resolveDialogueCastPlan([t('A', 0), t('B', 2.5)]);
    const filter = buildDialoguePremixFilter(plan);
    // stem 0 at t=0 center, stem 1 at t=2500ms panned off-center
    expect(filter).toContain('[0:a]pan=stereo|c0=0.707*c0|c1=0.707*c0,adelay=0|0[d0]');
    expect(filter).toContain('adelay=2500|2500[d1]');
    expect(filter).toContain('[d0][d1]amix=inputs=2:normalize=0:dropout_transition=0[dialogue]');
  });
});

describe('duck invariant', () => {
  it('the dialogue duck depth is exactly -12 dB', () => {
    expect(DIALOGUE_DUCK_DB).toBe(-12);
  });
});
