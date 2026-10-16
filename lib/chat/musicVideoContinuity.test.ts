/** @jest-environment node */
/**
 * GG's music video (Production 2026-10-16): the singer's face, clothes and bar changed at every cut, the colours were
 * muddy yellow, each Veo clip brought its own music, and an old ad line came back as a caption. These pin the fixes.
 */
import { planFilmScenes } from './filmPipeline';
import { pickLutLook } from '../orchestrator/cinematic-lut';
import { keepsOnlySong } from '../orchestrator/songMix';

const SCENES = ['a man sings into a vintage microphone', 'close on his face as he holds a note', 'the crowd sways', 'he steps off the stage'];

describe('a script-driven music video keeps one singer in every shot', () => {
  test('every scene of a music video carries the full same-person anchor', () => {
    const plan = planFilmScenes('ძველ ფაბში მღერის ბლუზს და ჯაზს', { sceneScripts: SCENES, totalSec: 32, clipSec: 8, musicVideo: true });
    const performing = plan.scenes.filter((s) => !/no people, no performer/i.test(s.prompt));
    expect(performing.length).toBeGreaterThan(0);
    for (const s of performing) {
      expect(s.prompt).toContain('Continuity');
      expect(s.prompt).toContain(plan.shared.characterAnchor);
    }
  });
  test('a script-driven film that is not a music video still locks only the world (unchanged)', () => {
    const plan = planFilmScenes('a quiet drama', { sceneScripts: SCENES, totalSec: 32, clipSec: 8 });
    expect(plan.scenes.some((s) => s.prompt.includes(`Continuity — the protagonist is ${plan.shared.characterAnchor}`))).toBe(false);
  });
});

describe('colour: natural, not muddy yellow', () => {
  test('no scene asks for a warm grade', () => {
    const plan = planFilmScenes('a singer in an old pub', { totalSec: 48, clipSec: 8 });
    expect(plan.scenes.every((s) => !/warm cinematic colou?r grade/i.test(s.prompt))).toBe(true);
  });
  test('"dark" alone no longer selects the purple-gold night grade', () => {
    expect(pickLutLook('a dark old pub, a man sings the blues')).toBe('cinematic');
    expect(pickLutLook('ძველი მუქი ფაბი')).toBe('cinematic');
    expect(pickLutLook('neon nightclub')).toBe('night_neon');
  });
});

describe('one continuous song under a music video', () => {
  test('a music video with its song drops the clips\' own audio; anything else keeps it', () => {
    expect(keepsOnlySong({ musicVideo: true, hasMusic: true })).toBe(true);
    expect(keepsOnlySong({ musicVideo: true, hasMusic: false })).toBe(false);
    expect(keepsOnlySong({ musicVideo: false, hasMusic: true })).toBe(false);
  });
});
