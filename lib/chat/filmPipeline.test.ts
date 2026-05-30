import {
  isThirtySecondFilm,
  buildConsistencySeed,
  buildCharacterAnchor,
  buildStyleGuide,
  sceneBeat,
  planFilmScenes,
  buildFilmClipRequest,
  filmProgressStages,
  FILM_TOTAL_SEC,
  FILM_SCENE_COUNT,
  type FilmShared,
} from './filmPipeline';

describe('film constants', () => {
  it('derives 5 scenes from a 30-second runtime', () => {
    expect(FILM_TOTAL_SEC).toBe(30);
    expect(FILM_SCENE_COUNT).toBe(5);
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
  it('locks to the user avatar when provided', () => {
    expect(buildCharacterAnchor('any', { avatarReference: 'avatar://123' })).toMatch(/custom avatar/i);
  });
  it('locks the primary character otherwise', () => {
    expect(buildCharacterAnchor('any')).toMatch(/same primary character/i);
  });
});

describe('planFilmScenes — continuity-locked production plan', () => {
  it('produces exactly 5 sequential 6-second scenes for a 30s film', () => {
    const plan = planFilmScenes('a hero walks through a neon market');
    expect(plan.scenes).toHaveLength(5);
    expect(plan.shared.sceneCount).toBe(5);
    expect(plan.shared.totalSec).toBe(30);
    plan.scenes.forEach((s, i) => {
      expect(s.durationSec).toBe(6);
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

  it('folds the continuity anchor + seed into every clip prompt', () => {
    const plan = planFilmScenes('a knight crosses a frozen lake');
    for (const scene of plan.scenes) {
      expect(scene.prompt).toContain('Continuity');
      expect(scene.prompt).toContain(String(plan.shared.seed));
    }
  });

  it('threads the user avatar reference through shared params + anchor', () => {
    const plan = planFilmScenes('my avatar dances in cyberpunk Tokyo', { avatarReference: 'avatar://me' });
    expect(plan.shared.avatarReference).toBe('avatar://me');
    expect(plan.scenes[0]!.prompt).toMatch(/custom avatar/i);
  });

  it('applies a style override consistently', () => {
    const plan = planFilmScenes('a city at dawn', { style: 'noir' });
    expect(plan.shared.style).toBe('noir');
    expect(plan.scenes.every((s) => /noir/i.test(s.prompt))).toBe(true);
  });

  // PHASE 44 §2 — the real defect the live-fire exposed: a monotone film.
  it('gives every scene a DISTINCT cinematic composition (no monotone loop)', () => {
    const plan = planFilmScenes('a cyberpunk samurai walks through neon Tokyo');
    const heads = plan.scenes.map((s) => s.prompt.split(' — ')[0]);
    // All five framings differ — the film is an arc, not one beat ×5.
    expect(new Set(heads).size).toBe(plan.scenes.length);
    // The arc opens on an establishing shot and closes on a resolving pull-back.
    expect(plan.scenes[0]!.prompt).toMatch(/establishing/i);
    expect(plan.scenes[plan.scenes.length - 1]!.prompt).toMatch(/pull-back|resol/i);
    // A mid-film close-up re-asserts the protagonist's identity (continuity anchor).
    expect(plan.scenes.some((s) => /close-up/i.test(s.prompt))).toBe(true);
  });

  it('stamps the rigid visual style guide on EVERY scene (locked world)', () => {
    const plan = planFilmScenes('a knight crosses a frozen lake', { style: 'epic' });
    for (const scene of plan.scenes) {
      expect(scene.prompt).toContain('Rigid visual style guide');
      expect(scene.prompt).toMatch(/consistent color palette/i);
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
    seed: 1, characterAnchor: 'x', avatarReference: null, style: null, sceneCount: 5, totalSec: 30,
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

describe('buildFilmClipRequest — LTX request shaping', () => {
  it('passes the shared seed and disables per-clip audio', () => {
    const plan = planFilmScenes('a spaceship docks at a ring station');
    const req = buildFilmClipRequest(plan.scenes[0]!, plan.shared);
    expect(req.selectedOptions.seed).toBe(String(plan.shared.seed));
    expect(req.selectedOptions.generate_audio).toBe('false');
    expect(req.selectedOptions.duration).toBe('6');
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
  });
});

describe('filmProgressStages — progressive agentic transparency', () => {
  it('emits storyboard → N clip stages → stitch → audio → finalize', () => {
    const stages = filmProgressStages(5);
    const keys = stages.map((s) => s.key);
    expect(keys[0]).toBe('storyboard');
    expect(keys).toContain('clip_1');
    expect(keys).toContain('clip_5');
    expect(keys[keys.length - 3]).toBe('stitch');
    expect(keys[keys.length - 2]).toBe('audio');
    expect(keys[keys.length - 1]).toBe('finalize');
    // 1 storyboard + 5 clips + stitch + audio + finalize = 9
    expect(stages).toHaveLength(9);
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
    expect(filmProgressStages(0)).toHaveLength(9);
    expect(filmProgressStages(Number.NaN)).toHaveLength(9);
  });
});
