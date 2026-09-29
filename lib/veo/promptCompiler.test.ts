/** @jest-environment node */
import {
  CLAMP_DROP_ORDER,
  DEFAULT_MAX_PROMPT_CHARS,
  DIALOGUE_NEGATIVE_TERMS,
  MAX_NEGATIVE_PROMPT_CHARS,
  compileShotPrompt,
  dialogueLanguageWarning,
  normalizeNegativePrompt,
} from './promptCompiler';
import { cameraPhrase } from './cinematography';
import type { CameraSpec, DialogueLine, ShotSpec } from './types';

const CAMERA: CameraSpec = { move: 'push_in', intensity: 2, shot: 'medium_close', angle: 'low', lens: 'telephoto' };

function shot(partial: Partial<ShotSpec> = {}): ShotSpec {
  return {
    ordinal: 1,
    subject: 'A woman in a red wool coat',
    action: 'walks slowly toward the rain-streaked window',
    setting: 'a Tbilisi apartment at night',
    camera: CAMERA,
    lighting: 'warm tungsten practicals',
    style: 'cinematic 35mm film',
    mood: 'quiet tension',
    audio: {
      dialogue: [{ speaker: 'ANNA', line: 'We have to leave tonight' }],
      sfx: 'rain taps the glass',
      ambience: 'distant traffic',
    },
    hasStartImage: false,
    ...partial,
  };
}

const FRAMING = 'Keep the subject centred with safe margins for a square crop';
const QUOTES = /["“”„‟«»]/;

describe('compileShotPrompt — Google\'s prompt anatomy', () => {
  it('orders subject+action, setting, camera, lighting, style, mood, framing, dialogue, SFX, ambience', () => {
    const { prompt, sections } = compileShotPrompt(shot(), { framingHint: FRAMING });
    expect(Object.keys(sections)).toEqual([
      'subject', 'action', 'setting', 'camera', 'lighting', 'style', 'mood', 'framing', 'dialogue', 'sfx', 'ambience',
    ]);
    const positions = Object.values(sections).map((text) => prompt.indexOf(text));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('the prompt is exactly its sections joined by one space', () => {
    const r = compileShotPrompt(shot(), { framingHint: FRAMING, styleGuide: 'teal-orange grade' });
    expect(r.prompt).toBe(Object.values(r.sections).join(' '));
  });

  it('renders the full text-to-video prompt', () => {
    expect(compileShotPrompt(shot()).prompt).toBe(
      'A woman in a red wool coat walks slowly toward the rain-streaked window. ' +
      'Setting: a Tbilisi apartment at night. ' +
      'Medium close-up, low-angle shot looking up at the subject, telephoto lens with compressed perspective, ' +
      'slow dolly in (the camera physically moves toward the subject). ' +
      'Lighting: warm tungsten practicals. Style: cinematic 35mm film. Mood: quiet tension. ' +
      'ANNA says: We have to leave tonight. SFX: rain taps the glass. Ambient noise: distant traffic.',
    );
  });

  it('the camera section is cameraPhrase() as a sentence', () => {
    expect(compileShotPrompt(shot()).sections.camera).toBe(`${cameraPhrase(CAMERA)}.`);
  });

  it('a predicate action continues the subject in one sentence', () => {
    const { sections, prompt } = compileShotPrompt(shot({ action: 'turns toward the door.' }));
    expect(sections.subject).toBe('A woman in a red wool coat');
    expect(sections.action).toBe('turns toward the door.');
    expect(prompt.startsWith('A woman in a red wool coat turns toward the door.')).toBe(true);
  });

  it.each([
    ['She turns toward the door', 'She turns toward the door.'],
    ['she turns toward the door', 'She turns toward the door.'],
    ['the rain begins to fall', 'The rain begins to fall.'],
    ['Suddenly, the lights go out!', 'Suddenly, the lights go out!'],
  ])('an action that is its own sentence (%s) is not glued onto the subject', (action, want) => {
    const { sections } = compileShotPrompt(shot({ action }));
    expect(sections.subject).toBe('A woman in a red wool coat.');
    expect(sections.action).toBe(want);
  });

  it('subject alone / action alone still make sentences', () => {
    expect(compileShotPrompt(shot({ action: '' })).sections.subject).toBe('A woman in a red wool coat.');
    const onlyAction = compileShotPrompt(shot({ subject: '  ', action: 'waves hello' }));
    expect(onlyAction.sections.subject).toBeUndefined();
    expect(onlyAction.sections.action).toBe('Waves hello.');
  });

  it('empty and whitespace-only fields leave no section, label, or "undefined" behind', () => {
    const r = compileShotPrompt(shot({
      setting: '   ', lighting: undefined, style: '', mood: '\n', audio: { dialogue: [], sfx: ' ', ambience: undefined },
    }));
    expect(Object.keys(r.sections)).toEqual(['subject', 'action', 'camera']);
    expect(r.prompt).not.toMatch(/undefined|null|Setting:|Lighting:|Style:|Mood:|SFX:|Ambient noise:|\s{2}/);
  });

  it('collapses whitespace and never doubles a terminator', () => {
    const r = compileShotPrompt(shot({ setting: 'a quiet\n\n  harbour at dawn.', mood: 'hopeful!', lighting: 'soft window light;' }));
    expect(r.sections.setting).toBe('Setting: a quiet harbour at dawn.');
    expect(r.sections.mood).toBe('Mood: hopeful!');
    expect(r.sections.lighting).toBe('Lighting: soft window light.');
    expect(r.prompt).not.toMatch(/\.\.|;\./);
  });

  it('never upper-cases a Georgian first letter into Mtavruli', () => {
    const r = compileShotPrompt(shot({ subject: 'ქალი წითელ პალტოში', action: '' }));
    expect(r.sections.subject).toBe('ქალი წითელ პალტოში.');
  });

  it('an all-auto camera adds no camera section', () => {
    const r = compileShotPrompt(shot({ camera: { move: 'auto', intensity: 5, shot: 'auto', angle: 'auto', lens: 'auto' } }));
    expect(r.sections.camera).toBeUndefined();
  });

  it('merges the film-wide style guide into Style, without repeating an identical style', () => {
    expect(compileShotPrompt(shot(), { styleGuide: 'teal-orange grade' }).sections.style)
      .toBe('Style: cinematic 35mm film; teal-orange grade.');
    expect(compileShotPrompt(shot(), { styleGuide: 'Cinematic 35mm film.' }).sections.style)
      .toBe('Style: cinematic 35mm film.');
    expect(compileShotPrompt(shot({ style: undefined }), { styleGuide: 'anime cel shading' }).sections.style)
      .toBe('Style: anime cel shading.');
  });

  it('places the framing hint after the look and before the audio; null / empty adds nothing', () => {
    const r = compileShotPrompt(shot(), { framingHint: FRAMING });
    expect(r.sections.framing).toBe(`${FRAMING}.`);
    expect(r.prompt.indexOf(FRAMING)).toBeGreaterThan(r.prompt.indexOf('Mood:'));
    expect(r.prompt.indexOf(FRAMING)).toBeLessThan(r.prompt.indexOf('ANNA says:'));
    expect(compileShotPrompt(shot(), { framingHint: null }).sections.framing).toBeUndefined();
    expect(compileShotPrompt(shot(), { framingHint: '  ' }).sections.framing).toBeUndefined();
  });

  it('is deterministic', () => {
    expect(compileShotPrompt(shot(), { framingHint: FRAMING })).toEqual(compileShotPrompt(shot(), { framingHint: FRAMING }));
  });
});

describe('image-to-video: "prompt for motion only"', () => {
  const i2v = () => compileShotPrompt(shot({ hasStartImage: true }), { framingHint: FRAMING });

  it('opens with "The subject …" and never re-describes the subject', () => {
    const r = i2v();
    expect(r.prompt.startsWith('The subject walks slowly toward the rain-streaked window.')).toBe(true);
    expect(r.prompt).not.toContain('red wool coat');
    expect(r.sections.subject).toBeUndefined();
  });

  it('drops setting (background), lighting and style — the frame already carries them', () => {
    const r = i2v();
    for (const key of ['setting', 'lighting', 'style']) expect(r.sections[key]).toBeUndefined();
    expect(r.prompt).not.toMatch(/Tbilisi|tungsten|35mm/);
    expect(r.dropped).toEqual([]); // omitted by the i2v rule, not by the clamp
  });

  it('keeps the camera MOVE only — shot size, angle and lens are already fixed by the frame', () => {
    const r = i2v();
    expect(r.sections.camera).toBe('Slow dolly in (the camera physically moves toward the subject).');
    expect(r.prompt).not.toMatch(/close-up|low-angle|telephoto/);
  });

  it('keeps mood, framing hint and every audio section', () => {
    const r = i2v();
    expect(Object.keys(r.sections)).toEqual(['action', 'camera', 'mood', 'framing', 'dialogue', 'sfx', 'ambience']);
    expect(r.sections.dialogue).toBe('ANNA says: We have to leave tonight.');
  });

  it('does not double "the subject" when the action already names it, and keeps full sentences', () => {
    expect(compileShotPrompt(shot({ hasStartImage: true, action: 'the subject raises her hand' })).sections.action)
      .toBe('The subject raises her hand.');
    expect(compileShotPrompt(shot({ hasStartImage: true, action: 'She raises her hand' })).sections.action)
      .toBe('She raises her hand.');
  });

  it('a static i2v camera still says so; an auto one says nothing', () => {
    expect(compileShotPrompt(shot({ hasStartImage: true, camera: { ...CAMERA, move: 'static' } })).sections.camera)
      .toBe('Static shot (the camera holds completely still).');
    expect(compileShotPrompt(shot({ hasStartImage: true, camera: { ...CAMERA, move: 'auto' } })).sections.camera)
      .toBeUndefined();
  });

  it('with no action there is no invented motion', () => {
    const r = compileShotPrompt(shot({ hasStartImage: true, action: '' }));
    expect(r.sections.action).toBeUndefined();
    expect(r.prompt.startsWith('Slow dolly in')).toBe(true);
  });
});

describe('dialogue — `Speaker says: line`, colon, no quotation marks', () => {
  const dialogue = (lines: DialogueLine[]) => compileShotPrompt(shot({ audio: { dialogue: lines } })).sections.dialogue;

  it('renders each line as its own sentence', () => {
    expect(dialogue([
      { speaker: 'ANNA', line: 'We have to leave tonight' },
      { speaker: 'GIO', line: 'Not without the letters?' },
    ])).toBe('ANNA says: We have to leave tonight. GIO says: Not without the letters?');
  });

  it.each([
    ['"We have to go."'],
    ['“We have to go.”'],
    ['„We have to go.“'],
    ['«We have to go.»'],
    ["'We have to go.'"],
  ])('strips quotation marks: %s', (line) => {
    const out = dialogue([{ speaker: 'ANNA', line }]);
    expect(out).toBe('ANNA says: We have to go.');
    expect(out).not.toMatch(QUOTES);
  });

  it('keeps apostrophes inside the line', () => {
    expect(dialogue([{ speaker: 'ANNA', line: "Don't look back, it's over" }])).toBe("ANNA says: Don't look back, it's over.");
  });

  it('no quotation mark reaches the prompt from any audio section', () => {
    const r = compileShotPrompt(shot({
      audio: { dialogue: [{ speaker: '"ANNA"', line: '"Run!"' }], sfx: 'a voice shouts "stop"', ambience: '«wind»' },
    }));
    expect(r.sections.dialogue).toBe('ANNA says: Run!');
    expect(r.sections.sfx).toBe('SFX: a voice shouts stop.');
    expect(r.sections.ambience).toBe('Ambient noise: wind.');
    for (const key of ['dialogue', 'sfx', 'ambience']) expect(r.sections[key]).not.toMatch(QUOTES);
  });

  it('a colon in the speaker name cannot break the pattern', () => {
    expect(dialogue([{ speaker: 'ANNA:', line: 'Hello' }])).toBe('ANNA says: Hello.');
  });

  it('a missing speaker falls back to the subject', () => {
    expect(dialogue([{ speaker: '  ', line: 'Hello there' }])).toBe('The subject says: Hello there.');
  });

  it('skips empty lines, and no lines means no dialogue section', () => {
    expect(dialogue([{ speaker: 'ANNA', line: '  ' }, { speaker: 'GIO', line: 'Now' }])).toBe('GIO says: Now.');
    expect(dialogue([{ speaker: 'ANNA', line: '""' }])).toBeUndefined();
    expect(compileShotPrompt(shot({ audio: undefined })).sections.dialogue).toBeUndefined();
  });

  it('a null entry from a parsed script is skipped, not a crash', () => {
    expect(dialogue([null as unknown as DialogueLine, { speaker: 'GIO', line: 'Now' }])).toBe('GIO says: Now.');
  });

  it('dialogue is never truncated, however long the line', () => {
    const line = `${'We walked for a very long time through the snow '.repeat(4).trim()}`;
    expect(dialogue([{ speaker: 'ANNA', line }])).toBe(`ANNA says: ${line}.`);
  });
});

describe('the clamp — drops mood → style → lighting → ambience → sfx → setting, never the core', () => {
  const long = (word: string) => `${word} `.repeat(60).trim(); // ~ 60 × (len+1) chars

  it('exposes the documented drop order', () => {
    expect(CLAMP_DROP_ORDER).toEqual(['mood', 'style', 'lighting', 'ambience', 'sfx', 'setting']);
    expect(DEFAULT_MAX_PROMPT_CHARS).toBe(1800);
  });

  it('under budget, nothing is dropped', () => {
    const r = compileShotPrompt(shot());
    expect(r.dropped).toEqual([]);
    expect(r.prompt.length).toBeLessThanOrEqual(DEFAULT_MAX_PROMPT_CHARS);
  });

  it('drops only as much as needed, lowest priority first', () => {
    const full = compileShotPrompt(shot()).prompt;
    const moodLen = compileShotPrompt(shot()).sections.mood?.length ?? 0;
    const r = compileShotPrompt(shot(), { maxChars: full.length - 1 });
    expect(r.dropped).toEqual(['mood']);
    expect(r.prompt.length).toBe(full.length - moodLen - 1);
    const r2 = compileShotPrompt(shot(), { maxChars: full.length - moodLen - 2 });
    expect(r2.dropped).toEqual(['mood', 'style']);
  });

  it('drops in the documented order when every optional section is huge', () => {
    const big = shot({
      mood: long('tense'), style: long('filmic'), lighting: long('amber'), setting: long('harbour'),
      audio: { dialogue: [{ speaker: 'ANNA', line: 'Go' }], sfx: long('clank'), ambience: long('gulls') },
    });
    const r = compileShotPrompt(big, { maxChars: 1000 });
    expect(r.dropped).toEqual(['mood', 'style', 'lighting', 'ambience', 'sfx']);
    expect(r.sections.setting).toBeDefined();
    expect(r.prompt.length).toBeLessThanOrEqual(1000);
    const r2 = compileShotPrompt(big, { maxChars: 300 });
    expect(r2.dropped).toEqual([...CLAMP_DROP_ORDER]);
  });

  it('the default budget (1800) applies without options', () => {
    const big = shot({ mood: long('tense'), style: long('filmic'), lighting: long('amber'), setting: long('harbour') });
    const r = compileShotPrompt(big);
    expect(r.prompt.length).toBeLessThanOrEqual(1800);
    expect(r.dropped[0]).toBe('mood');
  });

  it('keeps subject, action, camera, dialogue (and the framing hint) verbatim under ANY clamp', () => {
    const lines: DialogueLine[] = [{ speaker: 'ANNA', line: 'We have to leave tonight' }, { speaker: 'GIO', line: 'Then go' }];
    const s = shot({ audio: { dialogue: lines, sfx: 'thunder', ambience: 'rain' } });
    const unclamped = compileShotPrompt(s, { framingHint: FRAMING });
    for (const maxChars of [1, 10, 80, 200]) {
      const r = compileShotPrompt(s, { maxChars, framingHint: FRAMING });
      for (const key of ['subject', 'action', 'camera', 'dialogue', 'framing']) {
        expect(r.sections[key]).toBe(unclamped.sections[key]);
      }
      expect(Object.keys(r.sections)).toEqual(['subject', 'action', 'camera', 'framing', 'dialogue']);
      expect(r.dropped).toEqual([...CLAMP_DROP_ORDER]);
    }
  });

  it('sections and prompt agree after clamping', () => {
    const r = compileShotPrompt(shot(), { maxChars: 250 });
    expect(r.prompt).toBe(Object.values(r.sections).join(' '));
    for (const key of r.dropped) expect(r.sections[key]).toBeUndefined();
  });

  it('a nonsense maxChars falls back to the default instead of stripping the prompt', () => {
    for (const maxChars of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(compileShotPrompt(shot(), { maxChars }).dropped).toEqual([]);
    }
  });

  it('i2v omissions do not count as clamp drops', () => {
    const r = compileShotPrompt(shot({ hasStartImage: true }), { maxChars: 10 });
    expect(r.dropped).toEqual(['mood', 'ambience', 'sfx']);
    expect(r.sections.action).toBeDefined();
    expect(r.sections.camera).toBeDefined();
    expect(r.sections.dialogue).toBeDefined();
  });
});

describe('compileShotPrompt — the negative prompt', () => {
  it('with dialogue, guards against burned-in captions', () => {
    expect(compileShotPrompt(shot()).negativePrompt).toBe(DIALOGUE_NEGATIVE_TERMS);
  });

  it('without dialogue or a user negative, there is no negative prompt at all', () => {
    const r = compileShotPrompt(shot({ audio: { dialogue: [], sfx: 'thunder' } }));
    expect(r.negativePrompt).toBeUndefined();
    expect('negativePrompt' in r).toBe(false);
  });

  it('normalises the user\'s negative prompt and appends it after the caption guard', () => {
    expect(compileShotPrompt(shot(), { negativePrompt: 'no text, avoid watermarks, Subtitles' }).negativePrompt)
      .toBe('subtitles, captions, on-screen text, text, watermarks');
    expect(compileShotPrompt(shot({ audio: undefined }), { negativePrompt: ['no logos', 'blur'] }).negativePrompt)
      .toBe('logos, blur');
  });

  it('checks the user\'s terms against the shot style and the film style guide', () => {
    expect(compileShotPrompt(shot({ style: 'Anime', audio: undefined }), { negativePrompt: 'cartoon, blur' }).negativePrompt)
      .toBe('blur');
    expect(compileShotPrompt(shot({ style: undefined, audio: undefined }), { styleGuide: 'film noir', negativePrompt: 'monochrome, blur' }).negativePrompt)
      .toBe('blur');
  });
});

describe('normalizeNegativePrompt', () => {
  it.each([
    ['no text', 'text'],
    ['No text.', 'text'],
    ["don't show watermarks", 'watermarks'],
    ['don’t include logos', 'logos'],
    ['do not add subtitles', 'subtitles'],
    ['avoid blurry faces', 'blurry faces'],
    ['avoiding lens flare', 'lens flare'],
    ['without any people', 'people'],
    ['never render extra fingers', 'extra fingers'],
    ['not cartoonish', 'cartoonish'],
    ['exclude a crowd', 'crowd'],
    ['please no-text', 'text'],
    ['- no watermark', 'watermark'],
  ])('strips the negation: %s → %s', (raw, want) => {
    expect(normalizeNegativePrompt(raw)).toBe(want);
  });

  it('never eats words that merely start with a negation', () => {
    expect(normalizeNegativePrompt('noise, noir, none, notebook, nothingness, avoidance')).toBe(
      'noise, noir, none, notebook, nothingness, avoidance',
    );
  });

  it('a bare negation leaves nothing', () => {
    expect(normalizeNegativePrompt('no, avoid, without, don\'t')).toBe('');
  });

  it('splits lists on commas, semicolons, newlines, sentences and "or"', () => {
    expect(normalizeNegativePrompt('text; watermark\nlogos. subtitles | frames, cars or trucks')).toBe(
      'text, watermark, logos, subtitles, frames, cars, trucks',
    );
  });

  it('splits "no X and no Y" but keeps "black and white" as one term', () => {
    expect(normalizeNegativePrompt('no text and no watermark, black and white')).toBe('text, watermark, black and white');
  });

  it('de-duplicates case-insensitively and lower-cases', () => {
    expect(normalizeNegativePrompt('Text, TEXT, no text, text.')).toBe('text');
    expect(normalizeNegativePrompt(['Blur', 'blur', 'BLUR'])).toBe('blur');
  });

  it('strips quotation marks and stray punctuation', () => {
    expect(normalizeNegativePrompt('"text", «logos», ...watermark!!')).toBe('text, logos, watermark');
  });

  it('empty / missing input is an empty string', () => {
    expect(normalizeNegativePrompt('')).toBe('');
    expect(normalizeNegativePrompt(null)).toBe('');
    expect(normalizeNegativePrompt(undefined)).toBe('');
    expect(normalizeNegativePrompt([])).toBe('');
    expect(normalizeNegativePrompt([' , ;', '\n'])).toBe('');
    expect(normalizeNegativePrompt([42, null] as unknown as string[])).toBe('');
  });

  describe('removes terms that contradict the chosen style', () => {
    const NEG = 'anime, cartoon, illustration, neon glow, sepia, monochrome, black and white, blur, text';

    it('without a style, nothing is removed', () => {
      expect(normalizeNegativePrompt(NEG)).toBe(NEG);
      expect(normalizeNegativePrompt(NEG, '')).toBe(NEG);
      expect(normalizeNegativePrompt(NEG, 'cinematic realism')).toBe(NEG);
    });

    it('Anime ⇏ anime, cartoon, illustration', () => {
      expect(normalizeNegativePrompt(NEG, 'Anime')).toBe('neon glow, sepia, monochrome, black and white, blur, text');
      expect(normalizeNegativePrompt('cartoonish, illustrations, 2D, drawing, blur', 'anime cel shading')).toBe('blur');
    });

    it('Neon / Cyberpunk ⇏ neon glow', () => {
      expect(normalizeNegativePrompt(NEG, 'Neon')).not.toMatch(/neon/);
      expect(normalizeNegativePrompt('neon glow, neon signs, cyberpunk, blur', 'Cyberpunk')).toBe('blur');
      expect(normalizeNegativePrompt(NEG, 'Cyberpunk')).toContain('anime');
    });

    it('Vintage ⇏ sepia', () => {
      expect(normalizeNegativePrompt(NEG, 'Vintage')).toBe(
        'anime, cartoon, illustration, neon glow, monochrome, black and white, blur, text',
      );
      expect(normalizeNegativePrompt('sepia tones, vintage look, blur', 'retro 1970s')).toBe('blur');
    });

    it('Noir ⇏ monochrome (and every other way of saying "no colour")', () => {
      expect(normalizeNegativePrompt(NEG, 'Noir')).toBe('anime, cartoon, illustration, neon glow, sepia, blur, text');
      expect(normalizeNegativePrompt('grayscale, greyscale, B&W, desaturated, black-and-white, blur', 'film noir')).toBe('blur');
    });

    it('recognises the Georgian style names too', () => {
      expect(normalizeNegativePrompt(NEG, 'ანიმე')).not.toMatch(/anime|cartoon|illustration/);
      expect(normalizeNegativePrompt(NEG, 'ნუარი')).not.toMatch(/monochrome/);
    });

    it('a combined style removes each family', () => {
      expect(normalizeNegativePrompt(NEG, 'neon noir')).toBe('anime, cartoon, illustration, sepia, blur, text');
    });
  });

  describe('≤ 800 characters, cut on a comma', () => {
    const terms = Array.from({ length: 200 }, (_, i) => `artifact number ${i}`);
    const out = normalizeNegativePrompt(terms.join(', '));

    it('respects the cap', () => {
      expect(MAX_NEGATIVE_PROMPT_CHARS).toBe(800);
      expect(out.length).toBeLessThanOrEqual(800);
      expect(out.length).toBeGreaterThan(700);
    });

    it('never cuts a term in half, and never ends on a separator', () => {
      expect(out).not.toMatch(/,\s*$/);
      for (const t of out.split(', ')) expect(terms).toContain(t);
      expect(out.split(', ')).toEqual(terms.slice(0, out.split(', ').length));
    });

    it('a single oversized term is cut on a word, not dropped', () => {
      const para = 'blurry '.repeat(200).trim();
      const cut = normalizeNegativePrompt(para);
      expect(cut.length).toBeLessThanOrEqual(800);
      expect(cut.length).toBeGreaterThan(780);
      expect(cut.endsWith('blurry')).toBe(true);
    });
  });
});

describe('dialogueLanguageWarning — Veo speech is evaluated for English', () => {
  it('null when there is nothing to warn about', () => {
    expect(dialogueLanguageWarning(undefined)).toBeNull();
    expect(dialogueLanguageWarning(null)).toBeNull();
    expect(dialogueLanguageWarning([])).toBeNull();
    expect(dialogueLanguageWarning([{ speaker: 'A', line: 'We have to go.' }])).toBeNull();
    expect(dialogueLanguageWarning([{ speaker: 'A', line: 'Go.', language: 'en-US' }])).toBeNull();
    expect(dialogueLanguageWarning([{ speaker: 'A', line: 'Go.', language: 'und' }])).toBeNull();
    expect(dialogueLanguageWarning([{ speaker: 'A', line: '   ', language: 'ka' }])).toBeNull();
  });

  it('warns on a Georgian line, tagged or not', () => {
    const tagged = dialogueLanguageWarning([{ speaker: 'G', line: 'gamarjoba', language: 'ka' }]);
    const script = dialogueLanguageWarning([{ speaker: 'G', line: 'ჩვენ დრო აღარ გვაქვს' }]);
    for (const w of [tagged, script]) {
      expect(w).toMatch(/English only/);
      expect(w).toMatch(/Georgian/);
      expect(w).toMatch(/One dialogue line/);
    }
  });

  it('a Georgian-script line tagged "en" is still flagged — the script wins over a wrong tag', () => {
    expect(dialogueLanguageWarning([{ speaker: 'G', line: 'გამარჯობა', language: 'en' }])).toMatch(/Georgian/);
  });

  it('counts the flagged lines and names each language once', () => {
    const w = dialogueLanguageWarning([
      { speaker: 'A', line: 'გამარჯობა' },
      { speaker: 'B', line: 'Hello' },
      { speaker: 'C', line: 'Привет', language: 'ru' },
      { speaker: 'D', line: 'ნახვამდის' },
    ]);
    expect(w).toMatch(/3 dialogue lines are in Georgian, Russian/);
  });

  it('falls back to the script (or the raw tag) when the language is not in the name table', () => {
    expect(dialogueLanguageWarning([{ speaker: 'A', line: 'Привіт' }])).toMatch(/Cyrillic script/);
    expect(dialogueLanguageWarning([{ speaker: 'A', line: 'Hej', language: 'sv' }])).toMatch(/\bsv\b/);
  });

  it('speaks Georgian to a Georgian UI', () => {
    const w = dialogueLanguageWarning([{ speaker: 'G', line: 'გამარჯობა' }], 'ka');
    expect(w).toMatch(/ინგლისურ/);
    expect(w).toMatch(/ქართული/);
    expect(w).toMatch(/^Veo-ს/);
  });
});
