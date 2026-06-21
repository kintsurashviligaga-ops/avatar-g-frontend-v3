/**
 * remix planner + session tests — the pure core of conversational video editing.
 * Deterministic interpreter, leg selection, plan assembly, and multi-turn merge.
 */
import {
  buildRemixPlan,
  classifyEditKind,
  dedupeEdits,
  interpretEditRequest,
  legsForEditKind,
  looksLikeFilmEdit,
  planRemixFromText,
  resolveExplicitOrdinals,
  resolveTargetOrdinals,
  splitClauses,
} from './remixPlanner';
import { addRemixTurn, startRemixSession, toGeminiHistory } from './remixSession';

describe('looksLikeFilmEdit — strict create-vs-edit routing gate', () => {
  // EDITS — must route to remix.
  it.each([
    'make scene 2 darker',
    'scene 3 brighter and warmer',
    'change the ending’s music',
    'brighten it',
    'make the lighting moodier',
    'slow the ending down',
    'redo the last scene',
    'edit the first shot',
  ])('treats %p as an edit', (txt) => {
    expect(looksLikeFilmEdit(txt)).toBe(true);
  });

  // FRESH BRIEFS — must NOT be swallowed as edits (the headline regression).
  it.each([
    'a dog surfing in tokyo',
    'make a 30 second film about a samurai',
    'a 30 second cinematic film about a lighthouse keeper at dawn',
    'create a video about a seaside town at sunset',
    'an astronaut exploring mars, cinematic, warm tones',
    'a film about scene transitions in nature', // mentions "scene" but is a brief
    '',
    'hi',
  ])('treats %p as a fresh film (not an edit)', (txt) => {
    expect(looksLikeFilmEdit(txt)).toBe(false);
  });
});

describe('classifyEditKind', () => {
  test('detects each dimension', () => {
    expect(classifyEditKind('make the lighting darker')).toBe('visual');
    expect(classifyEditKind('change what she says in the line')).toBe('dialogue');
    expect(classifyEditKind('add louder music and sfx')).toBe('audio');
    expect(classifyEditKind('completely regenerate this')).toBe('full');
  });
  test('dialogue + audio escalates to full', () => {
    expect(classifyEditKind('change the dialogue and the soundtrack')).toBe('full');
  });
});

describe('resolveTargetOrdinals', () => {
  test('explicit scene numbers', () => {
    expect(resolveTargetOrdinals('make scene 3 darker', 5)).toEqual([3]);
    expect(resolveTargetOrdinals('redo shot 2 and scene 4', 5)).toEqual([2, 4]);
  });
  test('positional + ordinal words', () => {
    expect(resolveTargetOrdinals('change the ending', 5)).toEqual([5]);
    expect(resolveTargetOrdinals('fix the first scene', 5)).toEqual([1]);
    expect(resolveTargetOrdinals('the third one needs work', 5)).toEqual([3]);
  });
  test('whole-film + no-reference both target every scene', () => {
    expect(resolveTargetOrdinals('make the whole video moodier', 3)).toEqual([1, 2, 3]);
    expect(resolveTargetOrdinals('add more contrast', 3)).toEqual([1, 2, 3]);
  });
  test('out-of-range scene numbers are ignored', () => {
    expect(resolveTargetOrdinals('change scene 9', 5)).toEqual([1, 2, 3, 4, 5]); // falls back to all
  });
});

describe('legsForEditKind', () => {
  test('maps each kind to the right legs (montage always)', () => {
    expect(legsForEditKind('visual')).toEqual(['storyboard', 'video', 'montage']);
    expect(legsForEditKind('dialogue')).toEqual(['voice', 'lipsync', 'montage']);
    expect(legsForEditKind('audio')).toEqual(['sfx', 'montage']);
    expect(legsForEditKind('full')).toContain('montage');
  });
});

describe('interpretEditRequest + buildRemixPlan', () => {
  test('localized visual edit re-runs only the named scene', () => {
    const plan = planRemixFromText('make scene 3 darker', 5);
    expect(plan.editedScenes.map((e) => e.ordinal)).toEqual([3]);
    expect(plan.editedScenes[0].kind).toBe('visual');
    expect(plan.rerunLegs).toEqual(['storyboard', 'video', 'montage']);
    expect(plan.unchangedOrdinals).toEqual([1, 2, 4, 5]);
    expect(plan.summary).toContain('scene 3');
  });

  test('dialogue edit re-runs voice + lipsync + montage', () => {
    const plan = planRemixFromText('change what the narrator says in scene 2', 4);
    expect(plan.editedScenes.map((e) => e.ordinal)).toEqual([2]);
    expect(plan.rerunLegs).toEqual(['voice', 'lipsync', 'montage']);
  });

  test('film-wide edit touches all scenes', () => {
    const plan = planRemixFromText('make the entire film warmer', 3);
    expect(plan.editedScenes).toHaveLength(3);
    expect(plan.unchangedOrdinals).toHaveLength(0);
  });

  test('empty / no-op request yields an empty plan', () => {
    const plan = planRemixFromText('   ', 5);
    expect(plan.editedScenes).toHaveLength(0);
    expect(plan.rerunLegs).toHaveLength(0);
  });
});

describe('per-clause interpretation (hardened)', () => {
  test('splitClauses breaks on and / commas / then / sentences', () => {
    expect(splitClauses('make scene 2 brighter and change the ending dialogue')).toEqual([
      'make scene 2 brighter', 'change the ending dialogue',
    ]);
    expect(splitClauses('redo scene 1, then add music')).toEqual(['redo scene 1', 'add music']);
  });

  test('resolveExplicitOrdinals returns empty (not all) when unscoped', () => {
    expect(resolveExplicitOrdinals('add more contrast', 5).ordinals).toEqual([]);
    expect(resolveExplicitOrdinals('scene 3 darker', 5).ordinals).toEqual([3]);
    expect(resolveExplicitOrdinals('change the whole film', 5).wholeFilm).toBe(true);
    expect(resolveExplicitOrdinals('4 darker', 5).ordinals).toEqual([4]); // leading bare number (post-split clause)
  });

  test('mixed visual + dialogue edit routes BOTH leg sets to the right scenes', () => {
    const plan = planRemixFromText('make scene 2 brighter and change the narrator dialogue in the ending', 5);
    const byOrdinal = Object.fromEntries(plan.editedScenes.map((e) => [e.ordinal, e.kind]));
    expect(byOrdinal[2]).toBe('visual'); // scene 2 → visual
    expect(byOrdinal[5]).toBe('dialogue'); // ending (scene 5) → dialogue
    // union of legs covers both visual (storyboard/video) and dialogue (voice/lipsync)
    expect(plan.rerunLegs).toEqual(['storyboard', 'voice', 'video', 'lipsync', 'montage']);
    expect(plan.unchangedOrdinals).toEqual([1, 3, 4]);
  });

  test('unscoped trailing clause inherits the previous scene scope', () => {
    const plan = planRemixFromText('make scene 3 darker and add heavy rain', 5);
    expect(plan.editedScenes.map((e) => e.ordinal)).toEqual([3]); // "add rain" stays on scene 3
    expect(plan.editedScenes[0].kind).toBe('visual');
  });

  test('a film-wide clause alongside a scoped one applies globally', () => {
    const plan = planRemixFromText('brighten scene 1 and add cinematic music throughout', 4);
    // music (audio, unscoped) → every scene's sfx; scene 1 also gets the visual → full
    expect(plan.editedScenes.find((e) => e.ordinal === 1)?.kind).toBe('full');
    expect(plan.editedScenes.find((e) => e.ordinal === 4)?.kind).toBe('audio');
    expect(plan.rerunLegs).toContain('sfx');
  });
});

describe('dedupeEdits', () => {
  test('merges same-scene edits and escalates conflicting kinds to full', () => {
    const merged = dedupeEdits([
      { ordinal: 3, kind: 'visual', instruction: 'darker' },
      { ordinal: 3, kind: 'dialogue', instruction: 'new line' },
      { ordinal: 1, kind: 'audio', instruction: 'louder' },
    ]);
    expect(merged).toHaveLength(2);
    const scene3 = merged.find((e) => e.ordinal === 3)!;
    expect(scene3.kind).toBe('full');
    expect(scene3.instruction).toBe('darker; new line');
  });
});

describe('multi-turn remix session', () => {
  test('accumulates edits across turns; cumulative plan re-derives', () => {
    let s = startRemixSession('sess-1', 5);
    expect(s.plan.editedScenes).toHaveLength(0);

    s = addRemixTurn(s, 'make scene 3 darker', interpretEditRequest('make scene 3 darker', 5), 1000);
    expect(s.plan.editedScenes.map((e) => e.ordinal)).toEqual([3]);
    expect(s.plan.editedScenes[0].kind).toBe('visual');

    // A dialogue note on the SAME scene escalates it to a full regen.
    s = addRemixTurn(s, 'and have her say goodbye in scene 3', interpretEditRequest('and have her say goodbye in scene 3', 5), 2000);
    expect(s.turns).toHaveLength(2);
    expect(s.plan.editedScenes.map((e) => e.ordinal)).toEqual([3]);
    expect(s.plan.editedScenes[0].kind).toBe('full');
    expect(s.plan.rerunLegs).toContain('voice');
    expect(s.plan.rerunLegs).toContain('video');
  });

  test('toGeminiHistory reconstructs the user/model turn pairs', () => {
    let s = startRemixSession('sess-2', 3);
    s = addRemixTurn(s, 'brighten scene 1', interpretEditRequest('brighten scene 1', 3), 1);
    const hist = toGeminiHistory(s);
    expect(hist).toHaveLength(2);
    expect(hist[0].role).toBe('user');
    expect(hist[1].role).toBe('model');
    expect(hist[0].parts[0].text).toBe('brighten scene 1');
  });
});
