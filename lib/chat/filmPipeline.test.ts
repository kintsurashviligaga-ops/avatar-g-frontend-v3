import {
  isThirtySecondFilm,
  buildConsistencySeed,
  buildCharacterAnchor,
  buildStyleGuide,
  sceneBeat,
  planFilmScenes,
  buildFilmClipRequest,
  filmProgressStages,
  normalizeReferenceImages,
  buildSpeechDirection,
  detectSpokenLanguage,
  clampClipSec,
  planFilmGrid,
  FILM_TOTAL_SEC,
  FILM_SCENE_COUNT,
  FILM_CLIP_SEC,
  FILM_CLIP_SEC_MIN,
  FILM_CLIP_SEC_MAX,
  FILM_MAX_REFERENCE_IMAGES,
  FILM_DRIFT_NEGATIVE,
  type FilmShared,
} from './filmPipeline';

describe('film constants', () => {
  it('derives 6 scenes from a 30-second runtime at the 5s film cadence', () => {
    expect(FILM_TOTAL_SEC).toBe(24);
    expect(FILM_SCENE_COUNT).toBe(3); // 24s / 8s = 3 sequential beats (8s Veo scenes)
  });
});

describe('isThirtySecondFilm — conservative flagship detection', () => {
  it('matches explicit 30-second film phrasing', () => {
    expect(isThirtySecondFilm('Make a 30-second film about a lighthouse keeper')).toBe(true);
    expect(isThirtySecondFilm('create a 30 second movie of my avatar')).toBe(true);
    expect(isThirtySecondFilm('thirty-second cinematic short, neon city')).toBe(true);
    expect(isThirtySecondFilm('a 30s film teaser')).toBe(true);
  });

  it('matches short-form production nouns', () => {
    expect(isThirtySecondFilm('produce a short film of a samurai duel')).toBe(true);
    expect(isThirtySecondFilm('make a mini-movie about my dog')).toBe(true);
  });

  it('does NOT fire on a bare image / plain video / chat prompt', () => {
    expect(isThirtySecondFilm('draw a red apple')).toBe(false);
    expect(isThirtySecondFilm('make a video of a sunset')).toBe(false);
    expect(isThirtySecondFilm('what is the weather today?')).toBe(false);
    expect(isThirtySecondFilm('')).toBe(false);
  });
});

describe('buildConsistencySeed — deterministic & stable', () => {
  it('is identical for identical prompts (idempotent renders)', () => {
    const a = buildConsistencySeed('cyberpunk Tokyo chase');
    const b = buildConsistencySeed('cyberpunk Tokyo chase');
    expect(a).toBe(b);
  });

  it('differs across distinct prompts', () => {
    expect(buildConsistencySeed('a')).not.toBe(buildConsistencySeed('b'));
  });

  it('stays within a provider-safe positive 31-bit range', () => {
    for (const p of ['', 'x', 'a very long cinematic brief about robots in the rain']) {
      const s = buildConsistencySeed(p);
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(2_147_483_647);
    }
  });
});

describe('buildCharacterAnchor', () => {
  it('anchors to the reference image when one is provided', () => {
    expect(buildCharacterAnchor('any', { avatarReference: 'avatar://123' })).toMatch(/reference image/i);
  });
  it('a source image OUTWEIGHS a text-extracted character lock (image-to-video identity)', () => {
    // The bug: a generic brief over a bridged photo invented an arbitrary person. The image must win.
    const anchor = buildCharacterAnchor('a 30s blues clip', { avatarReference: 'img://woman', characterLock: 'a 50-year-old Georgian man' });
    expect(anchor).toMatch(/EXACT person shown in the reference image/i);
    expect(anchor).toMatch(/never replace them with a different person/i);
  });
  it('uses the text lock when there is NO image', () => {
    expect(buildCharacterAnchor('any', { characterLock: 'a young woman with red hair' })).toMatch(/young woman with red hair/i);
  });
  it('locks the primary character otherwise', () => {
    expect(buildCharacterAnchor('any')).toMatch(/same primary character/i);
  });
});

describe('planFilmScenes — continuity-locked production plan', () => {
  it('produces exactly 6 sequential 5-second scenes for a 30s film', () => {
    const plan = planFilmScenes('a hero walks through a neon market');
    expect(plan.scenes).toHaveLength(3);
    expect(plan.shared.sceneCount).toBe(3);
    expect(plan.shared.totalSec).toBe(24);
    plan.scenes.forEach((s, i) => {
      expect(s.durationSec).toBe(8);
      expect(s.index).toBe(i);
      expect(s.ordinal).toBe(i + 1);
    });
  });

  it('stamps the SAME seed on every scene (character cannot mutate)', () => {
    const plan = planFilmScenes('a detective in a rainy alley');
    const seeds = new Set(plan.scenes.map((s) => s.seed));
    expect(seeds.size).toBe(1);
    expect(plan.scenes[0]!.seed).toBe(plan.shared.seed);
  });

  it('folds the continuity anchor into every clip prompt (seed rides as a PARAMETER, not prose)', () => {
    const plan = planFilmScenes('a knight crosses a frozen lake');
    for (const scene of plan.scenes) {
      expect(scene.prompt).toContain('Continuity');
      expect(scene.prompt).toContain(plan.shared.characterAnchor);
      // The numeric seed is deliberately NOT written into the prose — "(consistency seed 588875549)" is
      // meaningless to a video model and burned prompt budget. It travels as a real provider parameter
      // (selectedOptions.seed → Veo `seed`, verified live), which is what actually locks continuity.
      expect(scene.prompt).not.toContain(String(plan.shared.seed));
    }
  });

  it('threads the user avatar reference through shared params + anchor', () => {
    const plan = planFilmScenes('my avatar dances in cyberpunk Tokyo', { avatarReference: 'avatar://me' });
    expect(plan.shared.avatarReference).toBe('avatar://me');
    expect(plan.scenes[0]!.prompt).toMatch(/reference image/i);
  });

  it('applies a style override consistently', () => {
    const plan = planFilmScenes('a city at dawn', { style: 'noir' });
    expect(plan.shared.style).toBe('noir');
    expect(plan.scenes.every((s) => /noir/i.test(s.prompt))).toBe(true);
  });

  // PHASE 44 §2 — the real defect the live-fire exposed: a monotone film.
  it('gives every scene a DISTINCT cinematic composition (no monotone loop)', () => {
    const plan = planFilmScenes('a cyberpunk samurai walks through neon Tokyo');
    // The USER'S BRIEF now leads every scene (it is the highest-weighted position and what the storyboard
    // card shows); the distinct camera framing follows it after the em-dash. Assert on the framing segment.
    const framings = plan.scenes.map((s) => s.prompt.split(' — ').slice(1).join(' — '));
    // All framings differ — the film is an arc, not one beat ×N.
    expect(new Set(framings).size).toBe(plan.scenes.length);
    // …and the brief itself is what the scene opens with.
    expect(plan.scenes.every((s) => /cyberpunk samurai/i.test(s.prompt.split(' — ')[0] ?? ''))).toBe(true);
    // The arc opens on an establishing shot and closes on a resolving pull-back.
    expect(plan.scenes[0]!.prompt).toMatch(/establishing/i);
    expect(plan.scenes[plan.scenes.length - 1]!.prompt).toMatch(/pull-back|resol/i);
    // A mid-film close-up re-asserts the protagonist's identity (continuity anchor).
    expect(plan.scenes.some((s) => /close-up/i.test(s.prompt))).toBe(true);
  });

  it('asserts the SAME person (no gender/ethnicity/wardrobe drift) in every non-script scene (Phase 28)', () => {
    const plan = planFilmScenes('a detective investigates a case at night');
    // Stated ONCE, affirmatively. It used to be asserted three separate times per prompt (plus negations
    // like "never a different-looking person"), which bloated the prompt to 1700 chars and buried the
    // scene's own action — Veo reads natural prose, not stacked repetition.
    for (const scene of plan.scenes) {
      expect(scene.prompt).toMatch(/SAME person/);
      expect(scene.prompt).toMatch(/identical face/i);
    }
  });

  it('stamps the visual style guide on EVERY scene (locked world)', () => {
    const plan = planFilmScenes('a knight crosses a frozen lake', { style: 'epic' });
    for (const scene of plan.scenes) {
      expect(scene.prompt).toMatch(/Consistent across every shot/i);
      expect(scene.prompt).toMatch(/one color palette/i);
    }
  });

  it('keeps the prompt Veo-native: no negations in the positive text, story leads, bounded length', () => {
    const plan = planFilmScenes('a detective investigates a case at night', { style: 'noir' });
    for (const scene of plan.scenes) {
      // Negations are unparseable by video models ("NO yellow" → {no, yellow}) and INJECT what they forbid.
      // Every suppression term belongs in the negative field instead.
      expect(scene.prompt).not.toMatch(/\bNO yellow\b|\bNO neon\b|never a static frozen frame|No on-screen text/i);
      // The user's brief occupies the highest-weighted opening position.
      expect(scene.prompt.slice(0, 60)).toMatch(/detective/i);
      // Bounded: the old build was ~1700 chars of directives around a ~75-char story.
      expect(scene.prompt.length).toBeLessThan(1300);
    }
  });

  it('varies the camera motion across the arc while the seed stays constant', () => {
    const plan = planFilmScenes('a lighthouse in a storm');
    const seeds = new Set(plan.scenes.map((s) => s.seed));
    expect(seeds.size).toBe(1); // continuity: one seed
    const motions = new Set(plan.scenes.map((s) => s.cameraMotion));
    expect(motions.size).toBeGreaterThan(1); // progression: distinct camera grammar
  });
});

// ─── VEO-NATIVE SPOKEN DIALOGUE ──────────────────────────────────────────────
// Veo generates its clip audio natively, speech included: put the line in the prompt as natural
// direction and the character in frame actually says it, with synced lips, in-clip. Before this the
// per-scene dialogue only ever travelled as a TIMECODE WINDOW for the downstream duck/lip-sync stage, so
// the prompt that reached Veo was visuals-only and nobody in the film ever spoke.

describe('detectSpokenLanguage — name the language, never translate it', () => {
  it('identifies the scripts we actually ship', () => {
    expect(detectSpokenLanguage('ჩვენ დრო აღარ გვაქვს.')).toBe('Georgian');
    expect(detectSpokenLanguage('Времени больше нет.')).toBe('Russian');
    expect(detectSpokenLanguage('We are out of time.')).toBe('English');
  });
  it('returns null when there is no letter to speak', () => {
    expect(detectSpokenLanguage('!!! 123')).toBeNull();
  });
});

describe('buildSpeechDirection — Veo-native, verbatim, no negations', () => {
  it('puts the line in the character\'s mouth with the language named', () => {
    const d = buildSpeechDirection('ჩვენ დრო აღარ გვაქვს.');
    expect(d).toContain('"ჩვენ დრო აღარ გვაქვს."'); // VERBATIM, still Georgian
    expect(d).toMatch(/in Georgian/);
    expect(d).toMatch(/speaks aloud/);
    expect(d).toMatch(/lips moving in sync/);
    // Negations are unparseable by video models — the anti-subtitle terms live in the negative field.
    expect(d).not.toMatch(/\bno\b|\bnever\b|\bavoid\b|without/i);
  });
  it('names the speaker when the script gave one', () => {
    expect(buildSpeechDirection('I know.', { speaker: 'ANNA' })).toMatch(/^ANNA speaks aloud/);
  });
  it('falls back to a generic subject for a placeholder speaker', () => {
    expect(buildSpeechDirection('I know.', { speaker: 'NARRATOR' })).toMatch(/^The character on screen/);
  });
  it('bounds a runaway line (an 8s shot cannot deliver a monologue)', () => {
    // MAX_SPOKEN_LINE_CHARS (200) + the fixed direction — never the caller's 5000.
    expect(buildSpeechDirection('x'.repeat(5000)).length).toBeLessThan(340);
  });
  it('returns nothing for a silent scene', () => {
    expect(buildSpeechDirection(null)).toBe('');
    expect(buildSpeechDirection('   ')).toBe('');
  });
});

describe('planFilmScenes — dialogue reaches the Veo prompt', () => {
  // The owner's "დროის წნეხი" grid: 4 × 6s, three spoken beats + one deliberate pause.
  const SCENES = [
    'ფართო კადრი, ინდუსტრიული საწყობი, კაცი შეკრული ზის ხის ყუთზე',
    'ახლო კადრი ქალზე, თვალებში ცრემლი და შიში',
    'დეტალური კადრი შეკრულ ხელებზე, თითები იჭიმება',
    'კაცი დგება, წყვეტს თოკებს და მიდის ქალისკენ',
  ];
  const DIALOGUE = [
    { text: 'ჩვენ დრო აღარ გვაქვს.', speaker: null },
    { text: 'მე ვიცი.', speaker: null },
    null,
    { text: 'სხვა გზა არ არის.', speaker: null },
  ];
  const plan = planFilmScenes('დროის წნეხი', {
    sceneScripts: SCENES, sceneDialogue: DIALOGUE, nativeSpeech: true, clipSec: 6, totalSec: 24,
  });

  it('renders the script as 4 × 6s (the script\'s own cadence, not the pinned 8s grid)', () => {
    expect(plan.scenes).toHaveLength(4);
    expect(plan.scenes.every((s) => s.durationSec === 6)).toBe(true);
  });

  it('puts each scene\'s spoken line INTO that scene\'s prompt, verbatim', () => {
    expect(plan.scenes[0]!.prompt).toContain('"ჩვენ დრო აღარ გვაქვს."');
    expect(plan.scenes[1]!.prompt).toContain('"მე ვიცი."');
    expect(plan.scenes[3]!.prompt).toContain('"სხვა გზა არ არის."');
  });

  it('PRESERVES the spoken language — Georgian is never translated or transliterated', () => {
    expect(plan.scenes[0]!.prompt).toMatch(/in Georgian/);
    // Not a translation of the line, and no Latin transliteration of it either.
    expect(plan.scenes[0]!.prompt).not.toMatch(/we (?:have )?(?:no|are out of) time/i);
    expect(plan.scenes[0]!.prompt).not.toMatch(/chven dro/i);
  });

  it('leaves a SILENT scene silent (a scripted pause stays a pause)', () => {
    expect(plan.scenes[2]!.spokenLines).toEqual([]);
    expect(plan.scenes[2]!.prompt).not.toMatch(/speaks aloud/);
  });

  it('exposes the delegated line on the scene so the composite can drop the duplicate VO', () => {
    expect(plan.scenes.map((s) => s.spokenLines)).toEqual([
      ['ჩვენ დრო აღარ გვაქვს.'], ['მე ვიცი.'], [], ['სხვა გზა არ არის.'],
    ]);
  });

  it('speaks a two-line EXCHANGE in one scene as a reply (both lines reach Veo, neither is lost)', () => {
    // Two turns landing in the same 6s window must BOTH be in that clip's prompt — dropping one and
    // still suppressing the ElevenLabs leg would leave those words spoken by nobody.
    const duo = planFilmScenes('დროის წნეხი', {
      sceneScripts: SCENES, clipSec: 6, totalSec: 24, nativeSpeech: true,
      sceneDialogue: [[{ text: 'ჩვენ დრო აღარ გვაქვს.', speaker: 'კაცი' }, { text: 'მე ვიცი.', speaker: 'ქალი' }]],
    });
    expect(duo.scenes[0]!.spokenLines).toEqual(['ჩვენ დრო აღარ გვაქვს.', 'მე ვიცი.']);
    expect(duo.scenes[0]!.prompt).toContain('"ჩვენ დრო აღარ გვაქვს."');
    expect(duo.scenes[0]!.prompt).toContain('"მე ვიცი."');
    expect(duo.scenes[0]!.prompt).toMatch(/კაცი speaks aloud/);
    expect(duo.scenes[0]!.prompt).toMatch(/Then ქალი answers/);
    expect(duo.scenes[0]!.prompt.length).toBeLessThan(1300);
  });

  it('leads with the STORY, then the line — never camera boilerplate first', () => {
    const head = plan.scenes[0]!.prompt.slice(0, 90);
    expect(head).toMatch(/ინდუსტრიული საწყობი/);
    // The line lands early enough to survive every downstream clamp (tail cut + middle trim).
    expect(plan.scenes[0]!.prompt.indexOf('ჩვენ დრო აღარ გვაქვს')).toBeLessThan(400);
  });

  it('keeps the prompt Veo-native WITH dialogue: no negations, bounded length', () => {
    for (const scene of plan.scenes) {
      expect(scene.prompt).not.toMatch(/\bNO yellow\b|\bNO neon\b|never a static frozen frame|No on-screen text/i);
      expect(scene.prompt.length).toBeLessThan(1300);
    }
  });

  it('NON-VEO engines keep the ElevenLabs path: no line in the prompt without nativeSpeech', () => {
    // Runway/Kling/LTX generate no speech — a line in their prompt is at best burned-in text, so the
    // dialogue must stay out and the existing VO leg must keep owning it.
    const fallback = planFilmScenes('დროის წნეხი', { sceneScripts: SCENES, sceneDialogue: DIALOGUE, clipSec: 6, totalSec: 24 });
    expect(fallback.scenes.every((s) => s.spokenLines.length === 0)).toBe(true);
    expect(fallback.scenes.every((s) => !/speaks aloud/.test(s.prompt))).toBe(true);
    // …and the visual prompt is otherwise unchanged by the dialogue plumbing.
    const noDialogue = planFilmScenes('დროის წნეხი', { sceneScripts: SCENES, clipSec: 6, totalSec: 24 });
    expect(fallback.scenes.map((s) => s.prompt)).toEqual(noDialogue.scenes.map((s) => s.prompt));
  });

  it('RESERVES room for the spoken line — a long scene description can never cut it off', () => {
    // `head` is script-supplied and unbounded (a Master-Script action or an approved storyboard scene runs
    // to 2000 chars) while the prompt is clamped by a tail slice, so the speech clause used to fall off the
    // end — and the composite would then have dropped the ElevenLabs leg for a line no prompt contained.
    for (const headLen of [400, 900, 1400, 1900, 2000]) {
      const long = `a bound man on a crate in an industrial warehouse, ${'dust motes drifting through hard light, '.repeat(60)}`.slice(0, headLen);
      const p = planFilmScenes('დროის წნეხი', {
        sceneScripts: [long], totalSec: 8, clipSec: 8, nativeSpeech: true,
        sceneDialogue: [{ text: 'ჩვენ დრო აღარ გვაქვს.', speaker: null }],
      });
      const scene = p.scenes[0]!;
      expect(scene.spokenLines).toEqual(['ჩვენ დრო აღარ გვაქვს.']);
      // The line is VERBATIM in the emitted prompt at every head length.
      expect(scene.prompt).toContain('"ჩვენ დრო აღარ გვაქვს."');
      expect(scene.prompt).toMatch(/The voice is heard clearly in the shot/);
    }
  });

  it('carries the spoken line into the clip request for the render boundary', () => {
    const req = buildFilmClipRequest(plan.scenes[0]!, plan.shared);
    expect(req.selectedOptions.spokenLine).toBe('ჩვენ დრო აღარ გვაქვს.');
    // A FILM clip opts in to Veo text-to-video (plain chat video deliberately does not).
    expect(req.selectedOptions.veoTextToVideo).toBe('1');
    expect(req.selectedOptions.duration).toBe('6'); // the scene's real length reaches Veo's durationSeconds
    // A silent scene carries no line at all.
    expect(buildFilmClipRequest(plan.scenes[2]!, plan.shared).selectedOptions.spokenLine).toBeUndefined();
  });
});

describe('film grid — 4×6s as well as 3×8s (Veo accepts 4–8s)', () => {
  it('clamps any requested length into Veo\'s accepted window', () => {
    expect(FILM_CLIP_SEC_MIN).toBe(4);
    expect(FILM_CLIP_SEC_MAX).toBe(8);
    expect(clampClipSec(6)).toBe(6);
    expect(clampClipSec(10)).toBe(8); // 10 → Veo 400 "out of bound"
    expect(clampClipSec(1)).toBe(4);
    expect(clampClipSec('nonsense')).toBe(FILM_CLIP_SEC);
    expect(clampClipSec(null, 5)).toBe(5);
  });

  it('derives the grid from the script\'s own timecode windows', () => {
    const windows = [
      { startSec: 0, endSec: 6 }, { startSec: 6, endSec: 12 },
      { startSec: 12, endSec: 18 }, { startSec: 18, endSec: 24 },
    ];
    expect(planFilmGrid({ sceneCount: 4, windows })).toEqual({ sceneCount: 4, clipSec: 6, totalSec: 24 });
  });

  it('falls back to totalSec ÷ sceneCount, then to the 8s default', () => {
    expect(planFilmGrid({ sceneCount: 4, totalSec: 24 })).toEqual({ sceneCount: 4, clipSec: 6, totalSec: 24 });
    expect(planFilmGrid({ sceneCount: 3 })).toEqual({ sceneCount: 3, clipSec: 8, totalSec: 24 });
    expect(planFilmGrid()).toEqual({ sceneCount: FILM_SCENE_COUNT, clipSec: 8, totalSec: 24 });
  });

  it('an out-of-range script cadence is clamped, never rejected', () => {
    // A 12s-per-scene script still renders — at Veo's 8s maximum.
    expect(planFilmGrid({ sceneCount: 2, windows: [{ startSec: 0, endSec: 12 }, { startSec: 12, endSec: 24 }] }))
      .toEqual({ sceneCount: 2, clipSec: 8, totalSec: 16 });
  });

  it('KEEPS the requested runtime when the script sets a different cadence', () => {
    // The 24s package + a 4x6s script must be 4 x 6s = 24s. Deriving only the cadence gave 3 x 6s = an
    // 18-second film: the user silently lost a scene and six seconds of the runtime they paid for.
    const windows = [
      { startSec: 0, endSec: 6 }, { startSec: 6, endSec: 12 },
      { startSec: 12, endSec: 18 }, { startSec: 18, endSec: 24 },
    ];
    expect(planFilmGrid({ sceneCount: 3, totalSec: 24, windows })).toEqual({ sceneCount: 4, clipSec: 6, totalSec: 24 });
    // The 48s package likewise: 6 x 8s → 8 x 6s.
    expect(planFilmGrid({ sceneCount: 6, totalSec: 48, windows })).toEqual({ sceneCount: 8, clipSec: 6, totalSec: 48 });
    // Without a runtime contract the caller's count is authoritative (explicit per-scene scripts).
    expect(planFilmGrid({ sceneCount: 3, windows })).toEqual({ sceneCount: 3, clipSec: 6, totalSec: 18 });
  });

  it('omitting clipSec leaves planFilmScenes byte-identical to the 8s grid', () => {
    expect(planFilmScenes('a hero in a storm', { clipSec: 8 }).scenes.map((s) => s.prompt))
      .toEqual(planFilmScenes('a hero in a storm').scenes.map((s) => s.prompt));
  });
});

describe('planFilmScenes — Phase 22 VECTOR 1: provider negative threading', () => {
  it('always stamps the drift-suppression baseline on shared + every clip request', () => {
    const plan = planFilmScenes('a hero walks through a neon market');
    expect(plan.shared.negativePrompt).toContain('sepia');
    expect(plan.shared.negativePrompt).toContain('deformed face');
    // The wire that was missing: buildFilmClipRequest maps it onto selectedOptions.negativePrompt.
    const req = buildFilmClipRequest(plan.scenes[0]!, plan.shared);
    expect(req.selectedOptions.negativePrompt).toBe(plan.shared.negativePrompt);
    expect(req.selectedOptions.negativePrompt).toContain(FILM_DRIFT_NEGATIVE.slice(0, 20));
  });

  it("MERGES the Director's scene-tailored negative ahead of the baseline (both survive)", () => {
    const plan = planFilmScenes('a hero in a storm', { negativePrompt: 'ZZ-unique amber cast, flat lighting' });
    expect(plan.shared.negativePrompt).toContain('sepia'); // baseline kept
    expect(plan.shared.negativePrompt).toContain('ZZ-unique amber cast'); // brief negative threaded
  });

  it('caps a runaway brief negative so it can never blow the provider field bound', () => {
    // 800, raised from 600 when the light-streak / extra-performer terms moved OFF the positive text
    // (where they were negations Veo cannot parse) onto this field — at 600 the ~590-char baseline left
    // the Director's own negative with nothing but the cut. geminiVeo trims to the same 800 on the wire.
    const plan = planFilmScenes('a hero in a storm', { negativePrompt: 'x'.repeat(5000) });
    expect(plan.shared.negativePrompt.length).toBeLessThanOrEqual(800);
  });

  it('suppresses the light-streak / sci-fi look on the NEGATIVE field, not as in-prompt negations', () => {
    // "NO neon, glowing light-streaks, lens flares" inside the positive world guide tokenised as
    // {no, neon} and injected the very look it meant to forbid — the last keyword-soup survivor on the
    // SCRIPT-DRIVEN path (exactly the path a pasted screenplay takes).
    const plan = planFilmScenes('a hero in a storm', { sceneScripts: ['a lantern-lit barn at dusk', 'a rope snaps'], totalSec: 16 });
    expect(plan.shared.negativePrompt).toContain('glowing light streaks');
    expect(plan.shared.negativePrompt).toContain('lens flare');
    for (const scene of plan.scenes) {
      expect(scene.prompt).toMatch(/Rigid visual world/); // the world lock still rides on every scene
      expect(scene.prompt).not.toMatch(/\bNO neon\b/i);
      expect(scene.prompt).not.toMatch(/do not add a person/i);
    }
  });
});

describe('planFilmScenes — V1 screenwriter cameraShot threading', () => {
  it('honors the screenwriter per-scene cameraShot verbatim over the beat ladder', () => {
    const plan = planFilmScenes('a hero in a storm', {
      sceneMeta: [{ cameraShot: 'ZZ-unique extreme dutch whip-pan' }],
    });
    expect(plan.scenes[0]!.prompt).toContain('Camera: ZZ-unique extreme dutch whip-pan');
  });

  it('is byte-identical to no-sceneMeta when a scene carries no cameraShot (backward compat)', () => {
    const withMeta = planFilmScenes('a hero in a storm', { sceneMeta: [{ mood: 'tense' }] });
    const without = planFilmScenes('a hero in a storm');
    expect(withMeta.scenes[0]!.prompt).toBe(without.scenes[0]!.prompt);
  });

  it('the explicit user cameraMove still overrides the screenwriter cameraShot', () => {
    const plan = planFilmScenes('a hero in a storm', {
      cameraMove: 'zoom_in',
      sceneMeta: [{ cameraShot: 'should-be-ignored static tripod lockoff' }],
    });
    expect(plan.scenes[0]!.prompt).not.toContain('should-be-ignored');
    expect(plan.scenes[0]!.prompt).toMatch(/dolly push-in/i); // the zoom_in directive wins
  });
});

describe('sceneBeat — deterministic cinematic arc selection', () => {
  it('always opens establishing and closes resolving for a 5-beat film', () => {
    expect(sceneBeat(0, 5).framing).toMatch(/establishing/i);
    expect(sceneBeat(4, 5).framing).toMatch(/pull-back|resolve/i);
  });

  it('degrades coherently for any scene count (1..8)', () => {
    for (let count = 1; count <= 8; count++) {
      for (let i = 0; i < count; i++) {
        expect(typeof sceneBeat(i, count).framing).toBe('string');
        expect(sceneBeat(i, count).framing.length).toBeGreaterThan(0);
      }
    }
    // A single-scene film still establishes.
    expect(sceneBeat(0, 1).framing).toMatch(/establishing/i);
  });
});

describe('buildStyleGuide — the rigid continuity contract', () => {
  const base: FilmShared = {
    seed: 1, characterAnchor: 'x', avatarReference: null, referenceImages: [], style: null, sceneCount: 5, totalSec: 30, orientation: 'landscape', negativePrompt: '',
  };
  it('locks palette, lighting, lens and character design', () => {
    const g = buildStyleGuide(base);
    expect(g).toMatch(/color palette/i);
    expect(g).toMatch(/lighting/i);
    expect(g).toMatch(/lens/i);
    expect(g).toMatch(/character design/i);
  });
  it('folds the chosen aesthetic in when a style is set', () => {
    expect(buildStyleGuide({ ...base, style: 'noir' })).toMatch(/noir aesthetic/i);
  });
  it('locks to the user avatar identity when supplied', () => {
    expect(buildStyleGuide({ ...base, avatarReference: 'avatar://me' })).toMatch(/custom avatar/i);
  });
});

describe('normalizeReferenceImages — multimodal payload hardening', () => {
  it('accepts a plain array and caps at 3', () => {
    expect(normalizeReferenceImages(['a', 'b', 'c', 'd'])).toEqual(['a', 'b', 'c']);
    expect(FILM_MAX_REFERENCE_IMAGES).toBe(3);
  });
  it('de-duplicates and drops empties', () => {
    expect(normalizeReferenceImages(['a', 'a', '', '  ', 'b'])).toEqual(['a', 'b']);
  });
  it('parses a JSON-encoded array string', () => {
    expect(normalizeReferenceImages('["x","y"]')).toEqual(['x', 'y']);
  });
  it('splits a plain comma list but NEVER a data: URL', () => {
    expect(normalizeReferenceImages('one,two')).toEqual(['one', 'two']);
    const dataUrl = 'data:image/png;base64,AAAA';
    expect(normalizeReferenceImages(dataUrl)).toEqual([dataUrl]);
  });
  it('treats a lone string as one ref and null/undefined as empty', () => {
    expect(normalizeReferenceImages('https://x/y.png')).toEqual(['https://x/y.png']);
    expect(normalizeReferenceImages(null)).toEqual([]);
    expect(normalizeReferenceImages(undefined)).toEqual([]);
  });
});

describe('planFilmScenes — multimodal reference-image identity lock', () => {
  it('threads 1–3 reference images into shared params + the primary anchor', () => {
    const plan = planFilmScenes('a hero in a storm', { referenceImages: ['img://1', 'img://2', 'img://3', 'img://4'] });
    expect(plan.shared.referenceImages).toEqual(['img://1', 'img://2', 'img://3']);
    // The first reference image becomes the primary avatar reference.
    expect(plan.shared.avatarReference).toBe('img://1');
    expect(plan.scenes[0]!.prompt).toMatch(/custom avatar|reference image/i);
  });

  it('folds the reference-image count into the rigid style guide', () => {
    const plan = planFilmScenes('a hero in a storm', { referenceImages: ['img://1', 'img://2'] });
    expect(plan.scenes.every((s) => /2 uploaded reference images/i.test(s.prompt))).toBe(true);
  });

  it('an explicit avatarReference still wins over uploaded images', () => {
    const plan = planFilmScenes('x', { avatarReference: 'avatar://me', referenceImages: ['img://1'] });
    expect(plan.shared.avatarReference).toBe('avatar://me');
    expect(plan.shared.referenceImages).toEqual(['img://1']);
  });

  it('defaults to an empty reference set when none supplied', () => {
    expect(planFilmScenes('x').shared.referenceImages).toEqual([]);
  });
});

describe('buildFilmClipRequest — LTX request shaping', () => {
  it('passes the shared seed and disables per-clip audio', () => {
    const plan = planFilmScenes('a spaceship docks at a ring station');
    const req = buildFilmClipRequest(plan.scenes[0]!, plan.shared);
    expect(req.selectedOptions.seed).toBe(String(plan.shared.seed));
    expect(req.selectedOptions.generate_audio).toBe('false');
    expect(req.selectedOptions.duration).toBe('8'); // 8s film cadence (Veo scene)
    expect(req.userPrompt).toBe(plan.scenes[0]!.prompt);
  });

  it('forwards a character reference when the avatar is supplied', () => {
    const plan = planFilmScenes('my avatar on stage', { avatarReference: 'avatar://x' });
    const req = buildFilmClipRequest(plan.scenes[2]!, plan.shared);
    expect(req.selectedOptions.characterReference).toBe('avatar://x');
  });

  it('omits characterReference when no avatar is supplied', () => {
    const plan = planFilmScenes('a lone wolf on a ridge');
    const req = buildFilmClipRequest(plan.scenes[0]!, plan.shared);
    expect(req.selectedOptions.characterReference).toBeUndefined();
    expect(req.selectedOptions.characterReferences).toBeUndefined();
  });

  it('maps 1–3 reference images into both the single ref and the JSON array', () => {
    const plan = planFilmScenes('my avatar on stage', { referenceImages: ['img://a', 'img://b'] });
    const req = buildFilmClipRequest(plan.scenes[1]!, plan.shared);
    expect(req.selectedOptions.characterReference).toBe('img://a');
    expect(JSON.parse(req.selectedOptions.characterReferences!)).toEqual(['img://a', 'img://b']);
  });

  it('keeps a single avatarReference as a 1-element array for the Director Agent', () => {
    const plan = planFilmScenes('my avatar on stage', { avatarReference: 'avatar://x' });
    const req = buildFilmClipRequest(plan.scenes[0]!, plan.shared);
    expect(JSON.parse(req.selectedOptions.characterReferences!)).toEqual(['avatar://x']);
  });
});

describe('filmProgressStages — progressive agentic transparency', () => {
  it('emits storyboard → N clip stages → stitch → audio → finalize', () => {
    const stages = filmProgressStages(6);
    const keys = stages.map((s) => s.key);
    expect(keys[0]).toBe('storyboard');
    expect(keys).toContain('clip_1');
    expect(keys).toContain('clip_6');
    expect(keys[keys.length - 3]).toBe('stitch');
    expect(keys[keys.length - 2]).toBe('audio');
    expect(keys[keys.length - 1]).toBe('finalize');
    // 1 storyboard + 6 clips + stitch + audio + finalize = 10
    expect(stages).toHaveLength(10);
  });

  it('every stage carries all three locales', () => {
    for (const s of filmProgressStages()) {
      expect(typeof s.label.en).toBe('string');
      expect(typeof s.label.ka).toBe('string');
      expect(typeof s.label.ru).toBe('string');
      expect(s.label.en.length).toBeGreaterThan(0);
    }
  });

  it('clip stages mention character consistency', () => {
    const clip = filmProgressStages(5).find((s) => s.key === 'clip_2')!;
    expect(clip.label.en).toMatch(/consistency/i);
  });

  it('falls back to the default scene count for bad input', () => {
    // bad input → FILM_SCENE_COUNT (6): 1 storyboard + 6 clips + stitch/audio/finalize = 10
    expect(filmProgressStages(0)).toHaveLength(7);
    expect(filmProgressStages(Number.NaN)).toHaveLength(7);
  });
});
