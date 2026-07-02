import { planFilmScenes } from './filmPipeline';

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
