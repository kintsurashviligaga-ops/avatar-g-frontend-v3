import { buildDirectorUserContent, SYSTEM_PROMPT, type PromptAgentInput } from './promptAgent';

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
});
