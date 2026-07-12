/** @jest-environment node */
import { evaluateFilmQa, type QaInput } from './qaDirectorAgent';

const HEALTHY: QaInput = {
  characterLock: 'a 25-year-old woman, red wool coat, short dark hair',
  characterAnchor: 'a 25-year-old woman, red wool coat, short dark hair',
  scenePrompts: [
    'Establishing wide — a quiet street at dawn',
    'Medium — the woman walks past a cafe',
    'Close-up — her determined face',
    'Arc — she turns a corner',
    'Wide — the city skyline',
    'Resolution — pull-back over the rooftops',
  ],
  sfxCues: Array.from({ length: 6 }, (_, i) => ({ sceneNumber: i + 1, sfxPrompt: `ambience ${i + 1}` })),
  orientation: 'vertical',
  sceneCount: 6,
};

describe('evaluateFilmQa — pre-assembly QA director (Phase 25 V2)', () => {
  test('a flawless plan grades A, passes, no issues, cues unchanged', () => {
    const v = evaluateFilmQa(HEALTHY);
    expect(v.pass).toBe(true);
    expect(v.grade).toBe('A');
    expect(v.issues).toHaveLength(0);
    expect(v.correctedSfxCues).toHaveLength(6);
    expect(v.correctedSfxCues[0]!.sfxPrompt).toBe('ambience 1');
  });

  test('AUTO-FIX: missing SFX cues are filled deterministically (one non-empty cue per scene)', () => {
    const v = evaluateFilmQa({ ...HEALTHY, sfxCues: undefined });
    expect(v.correctedSfxCues).toHaveLength(6);
    for (const c of v.correctedSfxCues) expect(c.sfxPrompt.trim().length).toBeGreaterThan(0);
    const fix = v.issues.find((i) => i.code === 'sfx_cue_filled');
    expect(fix?.autoFixed).toBe(true);
    expect(fix?.severity).toBe('info'); // an info-level self-correction, not a failure
    expect(v.pass).toBe(true); // still passes — a filled cue is not a critical
  });

  test('AUTO-FIX is partial: keeps supplied cues, fills only the gaps', () => {
    const v = evaluateFilmQa({ ...HEALTHY, sfxCues: [{ sceneNumber: 2, sfxPrompt: 'the real cue' }] });
    expect(v.correctedSfxCues.find((c) => c.sceneNumber === 2)!.sfxPrompt).toBe('the real cue');
    expect(v.correctedSfxCues.find((c) => c.sceneNumber === 1)!.sfxPrompt).toMatch(/ambient diegetic/);
  });

  test('missing character lock → a warn (not a hard fail) so a watchable film still ships', () => {
    const v = evaluateFilmQa({ ...HEALTHY, characterLock: null, characterAnchor: '' });
    expect(v.issues.map((i) => i.code)).toContain('character_lock_missing');
    expect(v.issues.find((i) => i.code === 'character_lock_missing')!.severity).toBe('warn');
    expect(v.pass).toBe(true);
    expect(v.grade).not.toBe('A');
  });

  test('scene-count mismatch + empty scene are flagged', () => {
    const v = evaluateFilmQa({ ...HEALTHY, scenePrompts: ['only one', ''], sceneCount: 6 });
    const codes = v.issues.map((i) => i.code);
    expect(codes).toContain('scene_count_mismatch');
    expect(codes).toContain('empty_scene_prompt');
  });

  test('MONOTONE guard: every scene opening on the same framing is flagged (the "one man circling" regression)', () => {
    const v = evaluateFilmQa({ ...HEALTHY, scenePrompts: ['a man walks', 'a man walks', 'a man walks', 'a man walks'], sceneCount: 4 });
    expect(v.issues.map((i) => i.code)).toContain('monotone_scenes');
  });

  test('an invalid orientation is CRITICAL → grade F, does NOT pass', () => {
    const v = evaluateFilmQa({ ...HEALTHY, orientation: 'sideways' as unknown as 'vertical' });
    expect(v.issues.find((i) => i.code === 'bad_orientation')!.severity).toBe('critical');
    expect(v.pass).toBe(false);
    expect(v.grade).toBe('F');
  });

  test('never throws on garbage input (fail-open contract)', () => {
    expect(() => evaluateFilmQa({
      characterLock: undefined, characterAnchor: undefined,
      scenePrompts: undefined as unknown as string[], sfxCues: undefined,
      orientation: 'vertical', sceneCount: 0,
    })).not.toThrow();
  });
});
