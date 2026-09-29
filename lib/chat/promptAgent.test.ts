import { buildDirectorUserContent, coerceBrief, coerceSceneCamera, SYSTEM_PROMPT, type PromptAgentInput } from './promptAgent';

const base: PromptAgentInput = {
  brief: 'a 30s blues clip', mode: 'music_video', sceneCount: 6, length: 30, effect: 'Cinematic', language: 'ka',
};

describe('buildDirectorUserContent — reference-image identity lock (VECTOR 2)', () => {
  it('injects the immutable image lock when a reference image is active', () => {
    const out = buildDirectorUserContent({ ...base, hasReferenceImage: true }, 6);
    expect(out).toMatch(/REFERENCE IMAGE ACTIVE/);
    expect(out).toMatch(/STRICTLY FORBIDDEN/);
    expect(out).toMatch(/the exact same person shown in the reference image/i);
    // the exact stereotypes the user reported are explicitly named as forbidden
    expect(out).toMatch(/older man/i);
    expect(out).toMatch(/chokha/i);
    expect(out).toMatch(/weathered face/i);
  });

  it('does NOT inject the lock (or any stereotype text) with no reference image', () => {
    const out = buildDirectorUserContent({ ...base, hasReferenceImage: false }, 6);
    expect(out).not.toMatch(/REFERENCE IMAGE ACTIVE/);
    expect(out).not.toMatch(/chokha/i);
  });

  it('always carries the exact-scene-count contract + the brief', () => {
    const out = buildDirectorUserContent(base, 6);
    expect(out).toContain('Produce EXACTLY 6 scenes');
    expect(out).toContain('a 30s blues clip');
  });

  it('threads dialogue only when present', () => {
    expect(buildDirectorUserContent({ ...base, dialogue: 'Hello there' }, 6)).toMatch(/Dialogue: Hello there/);
    expect(buildDirectorUserContent({ ...base, dialogue: '   ' }, 6)).not.toMatch(/Dialogue:/);
  });
});

describe('buildDirectorUserContent — vision character-lock (Phase 71)', () => {
  const vid = 'an elderly weathered man in his 70s with a thick white beard and grey hair, wearing a dark wool vest, standing in the mountains';

  it('injects the [CORE CHARACTER VISUAL ID LOCK] with the extracted description verbatim', () => {
    const out = buildDirectorUserContent({ ...base, characterVisualId: vid, hasReferenceImage: true }, 6);
    expect(out).toMatch(/\[CORE CHARACTER VISUAL ID LOCK\]/);
    expect(out).toContain(vid);
    expect(out).toMatch(/GROUND-TRUTH identity/);
    // the exact stereotypes the user reported are explicitly named as forbidden
    expect(out).toMatch(/30-year-old man/i);
    expect(out).toMatch(/skydiver/i);
  });

  it('the vision lock OVERRIDES the generic text-only fallback (no double instruction)', () => {
    const out = buildDirectorUserContent({ ...base, characterVisualId: vid, hasReferenceImage: true }, 6);
    expect(out).not.toMatch(/the exact same person shown in the reference image/i);
  });

  it('falls back to the generic reference lock when no description was extracted', () => {
    const out = buildDirectorUserContent({ ...base, characterVisualId: '', hasReferenceImage: true }, 6);
    expect(out).not.toMatch(/CORE CHARACTER VISUAL ID LOCK/);
    expect(out).toMatch(/REFERENCE IMAGE ACTIVE/);
  });
});

describe('SYSTEM_PROMPT — no invented placeholder characters (VECTOR 1)', () => {
  it('carries an explicit rule forbidding fabricated stock characters', () => {
    expect(SYSTEM_PROMPT).toMatch(/NO INVENTED PLACEHOLDER CHARACTERS/);
    expect(SYSTEM_PROMPT).toMatch(/NEVER fabricate a stock or stereotypical character/i);
  });

  it('the few-shot GOOD example is NOT a stereotypical old man', () => {
    const good = /GOOD:[\s\S]*?BAD:/.exec(SYSTEM_PROMPT)?.[0] ?? '';
    expect(good).not.toMatch(/50-year-old man|older man|chokha|weathered/i);
  });

  it('scopes Georgian authenticity to the SETTING, not the character identity', () => {
    expect(SYSTEM_PROMPT).toMatch(/Georgian SETTINGS/);
    expect(SYSTEM_PROMPT).toMatch(/NEVER dictates or invents the character's identity/i);
  });
});

describe('SYSTEM_PROMPT — cinematic continuity (VECTOR 1)', () => {
  it('enforces a linear continuity vector that keeps the protagonist in frame', () => {
    expect(SYSTEM_PROMPT).toMatch(/CINEMATIC CONTINUITY VECTOR/);
    expect(SYSTEM_PROMPT).toMatch(/LINEAR VISUAL PERSISTENCE/);
    expect(SYSTEM_PROMPT).toMatch(/appears in EVERY shot/);
  });
  it('forbids the empty-stage / character-drop jump', () => {
    expect(SYSTEM_PROMPT).toMatch(/FORBIDDEN JUMPS/);
    expect(SYSTEM_PROMPT).toMatch(/empty stage/i);
  });
});

describe('SYSTEM_PROMPT — color science (VECTOR 3)', () => {
  it('hardcodes neutral color-science tokens and forbids yellow/sepia tint', () => {
    expect(SYSTEM_PROMPT).toMatch(/ARRI Alexa color science/);
    expect(SYSTEM_PROMPT).toMatch(/neutral white balance/i);
    expect(SYSTEM_PROMPT).toMatch(/yellow tint/i);
    expect(SYSTEM_PROMPT).toMatch(/sepia/i);
  });

  it('routes the suppression tokens to negativePrompt, NOT into imagePrompt', () => {
    // A "Negative: …" tail inside imagePrompt is submitted as POSITIVE conditioning (so the model draws the
    // cartoon/blur it was meant to avoid) AND is rendered to the user as the scene's description — the
    // storyboard card showed "cartoon, illustration, painting, CGI, bokeh, lens blur" as the scene text.
    expect(SYSTEM_PROMPT).toMatch(/NEVER write a "Negative:" list inside imagePrompt/i);
    expect(SYSTEM_PROMPT).toMatch(/visualStyle\.negativePrompt MUST carry the suppression tokens/i);
  });
});

describe('the director speaks structured camera language (docs/VEO_ENGINE.md §5)', () => {
  it('keeps documented values and turns anything else into auto', () => {
    expect(coerceSceneCamera({ move: 'push_in', shot: 'close_up', angle: 'low', lens: 'telephoto' }))
      .toEqual({ move: 'push_in', shot: 'close_up', angle: 'low', lens: 'telephoto' });
    expect(coerceSceneCamera({ move: 'dolly zoom vertigo', shot: 'close_up' })).toEqual({ move: 'auto', shot: 'close_up', angle: 'auto', lens: 'auto' });
  });

  it('an all-auto or missing camera is absent, not an empty object the render must interpret', () => {
    expect(coerceSceneCamera({ move: 'nonsense' })).toBeUndefined();
    expect(coerceSceneCamera(null)).toBeUndefined();
    expect(coerceSceneCamera('push_in')).toBeUndefined();
  });

  it('camera and lighting survive the brief parse; a scene without them is unchanged', () => {
    const brief = coerceBrief({
      character: { description: 'a woman in a red coat', imagePromptFragment: 'a woman in a red coat' },
      scenes: [
        { imagePrompt: 'she walks through the rain', camera: { move: 'truck_left', shot: 'wide' }, lighting: 'cool 5600K street light' },
        { imagePrompt: 'she stops at a door' },
      ],
    }, 2);
    expect(brief!.scenes[0]!.camera).toEqual({ move: 'truck_left', shot: 'wide', angle: 'auto', lens: 'auto' });
    expect(brief!.scenes[0]!.lighting).toBe('cool 5600K street light');
    expect(brief!.scenes[1]).not.toHaveProperty('camera');
    expect(brief!.scenes[1]).not.toHaveProperty('lighting');
  });

  it('the system prompt names the vocabulary and the dolly-vs-zoom distinction', () => {
    expect(SYSTEM_PROMPT).toContain('STRUCTURED CAMERA');
    expect(SYSTEM_PROMPT).toContain('push_in/pull_out = the camera physically moves');
    expect(SYSTEM_PROMPT).toContain('"camera": { "move": "push_in"');
  });
});
