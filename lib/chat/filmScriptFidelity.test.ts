import { planFilmScenes, splitStructuredScript } from './filmPipeline';

describe('splitStructuredScript (attach a real screenplay → its own scenes)', () => {
  const script = `🎬 „ის დილა" — THAT MORNING 60-second trailer | 10 scenes
მთავარი პრომპტი: შექმენი 60-წამიანი ისტორიული ეპიკური დრამა.
🎬 სცენა 1 (0:00–0:06) — „გამთენია" ვიზუალი: AERIAL SHOT: camera descends through clouds over Tbilisi, Narikala fortress silhouette, Mtkvari river, fog over old town rooftops down to a cobblestone street. კამერა: Drone descent. 🔊 SFX: wind.
🎬 სცენა 2 (0:06–0:12) — „უკანასკნელი მშვიდობა" ვიზუალი: STEADICAM tracking a waking street: an old man at a cafe with tea and a newspaper, a woman hanging white laundry on a balcony, children playing football. განათება: golden hour.
🎬 სცენა 3 (0:12–0:18) — „რადიო" ვიზუალი: EXTREME CLOSE-UP of a Soviet Bakelite radio glowing amber, a finger turning the dial, static then a stern official voice. 🔊 SFX: static.`;

  it('extracts one visual prompt per scene marker (no LLM), metadata stripped', () => {
    const scenes = splitStructuredScript(script, 12);
    expect(scenes).not.toBeNull();
    expect(scenes!.length).toBe(3);
    expect(scenes![0]!.toLowerCase()).toMatch(/aerial|tbilisi|narikala/);
    expect(scenes![0]!).not.toMatch(/\bSFX\b/i);
    expect(scenes![1]!.toLowerCase()).toMatch(/old man|laundry|children/);
    expect(scenes![2]!.toLowerCase()).toMatch(/radio|dial|bakelite/);
  });

  it('returns null for unstructured prose (falls back to the LLM scene-writer)', () => {
    expect(splitStructuredScript('a moody film about a man in a city at night', 12)).toBeNull();
  });

  // Real-world regression: a rich PRODUCTION shot-list (deepseek "ის დილა" master script) where each scene
  // is a timeline TABLE — the visual content is in the ACTION column and "Visual:" is only a colour-grade
  // note. The cleaner used to keep the grade note and drop the action, so every frame rendered as a generic
  // golden-hour image with none of the scripted subjects. Each scene must now carry its ACTION verbatim.
  it('parses a timeline-table production script: ACTION column drives the prompt, not the grade note', () => {
    const script = [
      'Scene 1: "უკანასკნელი მშვიდი დილა" (The Last Peaceful Morning)',
      'Frames: 0–144 · Duration: 0:00–0:06 · Clips: 2',
      '',
      'TC          Shot      Camera        Action',
      '00:00–00:02 S1.1      Drone aerial  Epic descent over old Tbilisi at dawn; Narikala silhouette against reddish sky; Mtkvari glittering silver',
      '00:02–00:04 S1.2      Crane descent Mist on narrow streets; tram crawling with sparks',
      '00:04–00:06 S1.3      Steadicam     Street-level: grandfather with tea/newspaper; woman hanging laundry; children with football',
      '',
      'Visual: Golden hour (3200K), volumetric god-rays, warm amber, anamorphic flares, 0.5× meditative tempo.',
      'Overlay: "თბილისი · 22 ივნისი, 1941" — Cinzel Decorative, fade-in 2s / fade-out 1s.',
      '',
      'Scene 2: "ხმა, რომელმაც სამყარო გააჩერა" (The Voice That Stopped the World)',
      'Frames: 144–288 · Duration: 0:06–0:12 · Clips: 3',
      '',
      'TC          Shot      Camera        Action',
      '00:06–00:08 S2.1      Macro 100mm   ECU on Soviet bakelite radio; tube glowing red; Molotov voice in Russian',
      '00:08–00:09 S2.2      Whip pan      Woman with headscarf; eyes widening, lips trembling',
      '00:09–00:10 S2.3      35mm wide     Cherry basket falls in SLOW MOTION; cherries scatter like blood',
      '',
      'Visual: Red tube glow → natural morning; warm→cold shift.',
    ].join('\n');

    const scenes = splitStructuredScript(script, 6);
    expect(scenes).not.toBeNull();
    expect(scenes!.length).toBe(2);

    // Scene 1 carries the ACTION verbatim (the scripted subjects), not just the grade note.
    const s1 = scenes![0]!.toLowerCase();
    expect(s1).toMatch(/tbilisi/);
    expect(s1).toMatch(/narikala/);
    expect(s1).toMatch(/descent/);
    expect(s1).toMatch(/laundry|grandfather|children/);
    // The grade note may ride along as a style hint, but must NOT be the ONLY content…
    expect(s1).not.toMatch(/frames:|duration:|overlay:|cinzel/);
    // …and the shot code / timecode noise is stripped.
    expect(scenes![0]!).not.toMatch(/\bS1\.1\b/);
    expect(scenes![0]!).not.toMatch(/00:00–00:02/);

    // Scene 2 is its OWN content, not scene 1's.
    const s2 = scenes![1]!.toLowerCase();
    expect(s2).toMatch(/radio|molotov|cherry/);
    expect(s2).not.toMatch(/tbilisi|narikala/);
  });
});

/**
 * Regression guard for the "one man in every shot" bug: when a real per-scene
 * script is supplied, each scene must render the subject/action the SCRIPT
 * describes. The protagonist must NOT be flooded into establishing shots, object
 * close-ups or scenes featuring other people; character identity is applied
 * CONDITIONALLY ("whenever the protagonist appears"), never as "the same person
 * in every shot", and the music-video "subject performs with energy" clause must
 * not leak into a film-trailer scene.
 */
describe('script-faithful trailer prompts', () => {
  const CHARACTER =
    '35 year old Georgian man Giorgi, dark wavy hair, deep green eyes, 1940s dark linen shirt';
  const sceneScripts = [
    'AERIAL SHOT: the camera descends through clouds over the old town of Tbilisi, Narikala fortress a black silhouette, the Mtkvari river a silver ribbon, fog over the rooftops, down to a silent cobblestone street',
    'STEADICAM tracking a waking street: an old man at a cafe with steaming tea and an open newspaper, a woman hanging white laundry on a balcony, children playing football',
    'EXTREME CLOSE-UP of a Soviet Bakelite radio, the tube glowing amber, a finger slowly turning the dial, static then a stern official voice',
    'Medium shot: Giorgi stands frozen in the cobblestone street as the announcement washes over the crowd, broken pride on his face',
  ];
  const plan = planFilmScenes('60-second cinematic film trailer, 1941 Tbilisi, WWII declared', {
    orientation: 'vertical',
    style: 'Cinematic',
    characterLock: CHARACTER,
    sceneScripts,
    totalSec: sceneScripts.length * 5,
  });

  it('emits one scene per supplied script line, each faithful to its own text', () => {
    expect(plan.scenes.length).toBe(sceneScripts.length);
    expect(plan.scenes[0]!.prompt.toLowerCase()).toMatch(/tbilisi|aerial|narikala|rooftops/);
    expect(plan.scenes[1]!.prompt.toLowerCase()).toMatch(/old man|laundry|children/);
    expect(plan.scenes[2]!.prompt.toLowerCase()).toMatch(/radio|dial|bakelite/);
    expect(plan.scenes[3]!.prompt.toLowerCase()).toMatch(/giorgi|frozen/);
  });

  it('does NOT flood any scene with the protagonist or a performer', () => {
    for (const s of plan.scenes) {
      const p = s.prompt.toLowerCase();
      expect(p).not.toMatch(/same single protagonist appears in every shot/);
      expect(p).not.toMatch(/subject moves and performs with energy/);
    }
  });

  it('keeps character identity conditional (world locked, protagonist only where written)', () => {
    for (const s of plan.scenes) {
      expect(s.prompt).toMatch(/whenever the film's protagonist appears/i);
      expect(s.prompt).toMatch(/Rigid visual world/);
    }
  });
});
