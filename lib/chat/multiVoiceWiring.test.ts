/** @jest-environment node */
/**
 * DAY-6 multi-voice ACTIVATION — proves the pure wiring that carries per-speaker dialogue stems from the film
 * dispatch through to the assembler's spatial premix + -12dB duck. The ffmpeg-rendered ducked mix itself needs
 * real ElevenLabs stems + an ffmpeg binary, so it is proven by the live manual test (see VERIFICATION_REPORT.md),
 * NOT here. What IS proven here: the token round-trips stems (backward-compatible), the cast-plan gate only
 * multi-voices ≥2 distinct timecoded speakers, the premix filtergraph gives each speaker a DISTINCT stereo
 * position, and the duck depth the assembly applies is exactly -12 dB.
 */
import { encodeFilmRef, decodeFilmRef, type FilmTaskRef } from './filmTaskRef';
import { resolveDialogueCastPlan, buildDialoguePremixFilter, DIALOGUE_DUCK_DB } from '@/lib/orchestrator/dialogueCastPlan';

const BASE: Omit<FilmTaskRef, 'v'> = {
  sessionId: 's1', createdAt: 1_700_000_000_000, seed: 42, sceneCount: 3,
  clips: [{ ordinal: 0, taskRef: 'rep:1', status: 'queued', attempts: 1 }],
  musicWorkId: null, voiceUrl: 'https://x.supabase.co/renders/merged.mp3',
};
const STEMS = [
  { url: 'https://x.supabase.co/renders/dstem-0-nino.mp3', speaker: 'ნინო', startSec: 2.5 },
  { url: 'https://x.supabase.co/renders/dstem-1-dato.mp3', speaker: 'დათო', startSec: 8.5 },
];

describe('DAY-6 token carry — dialogueStems survive encode→decode (and are backward-compatible)', () => {
  it('round-trips the stems array intact', () => {
    const decoded = decodeFilmRef(encodeFilmRef({ ...BASE, dialogueStems: STEMS }));
    expect(decoded?.dialogueStems).toEqual(STEMS);
    expect(decoded?.voiceUrl).toBe(BASE.voiceUrl); // single-track fallback still carried
  });
  it('an OLD token with no dialogueStems decodes fine → single-voice (no field)', () => {
    const decoded = decodeFilmRef(encodeFilmRef(BASE));
    expect(decoded).not.toBeNull();
    expect(decoded?.dialogueStems).toBeUndefined(); // absence = single-voice, byte-identical to pre-DAY-6
  });
});

describe('DAY-6 gate — resolveDialogueCastPlan only multi-voices ≥2 distinct TIMECODED speakers', () => {
  it('2 distinct timecoded speakers → multiSpeaker with DISTINCT stereo positions', () => {
    const plan = resolveDialogueCastPlan([
      { speaker: 'ნინო', startSec: 2.5 },
      { speaker: 'დათო', startSec: 8.5 },
    ]);
    expect(plan.multiSpeaker).toBe(true);
    expect(plan.distinctSpeakers).toBe(2);
    expect(plan.entries).toHaveLength(2);
    // first-cast speaker sits center (0), the second is panned off-center → distinct positions
    expect(plan.entries[0].pan).toBe(0);
    expect(plan.entries[1].pan).not.toBe(0);
    expect(plan.entries[0].panGains).not.toEqual(plan.entries[1].panGains);
  });
  it('a SINGLE speaker → NOT multi-voice (single-voice fallback)', () => {
    expect(resolveDialogueCastPlan([{ speaker: 'ნინო', startSec: 1 }, { speaker: 'ნინო', startSec: 4 }]).multiSpeaker).toBe(false);
  });
  it('any UNTIMED turn → NOT multi-voice (fallback, no misaligned lane)', () => {
    expect(resolveDialogueCastPlan([{ speaker: 'ნინო', startSec: 1 }, { speaker: 'დათო', startSec: null }]).multiSpeaker).toBe(false);
  });
});

describe('DAY-6 filtergraph — the premix spatializes each voice + the duck is -12 dB', () => {
  it('builds a distinct pan + timed adelay per stem, amixed into [dialogue]', () => {
    const plan = resolveDialogueCastPlan([
      { speaker: 'ნინო', startSec: 2.5 },
      { speaker: 'დათო', startSec: 8.5 },
    ]);
    const f = buildDialoguePremixFilter(plan);
    expect(f).toMatch(/\[0:a\]pan=stereo/);           // stem 0 panned
    expect(f).toMatch(/\[1:a\]pan=stereo/);           // stem 1 panned
    expect(f).toContain('adelay=2500|2500');          // placed at 2.5s
    expect(f).toContain('adelay=8500|8500');          // placed at 8.5s
    expect(f).toMatch(/amix=inputs=2:normalize=0.*\[dialogue\]$/); // mixed into the dialogue lane
    // the two speakers get different pan-gain coefficients (spatially distinct)
    expect(f).not.toMatch(/c0=([\d.]+)\*c0,adelay=2500\|2500\[d0\];\[1:a\]pan=stereo\|c0=\1\*c0,adelay=8500/);
  });
  it('the duck depth the assembly applies under active dialogue is exactly -12 dB', () => {
    expect(DIALOGUE_DUCK_DB).toBe(-12);
  });
});
