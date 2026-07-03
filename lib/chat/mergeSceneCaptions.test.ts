import { mergeSceneCaptions } from './filmPipeline';

// The storyboard opens on generic camera beats, then per-scene STORY shots arrive and are
// folded into the captions. These lock in that a TYPED brief (not just an attached script)
// gets story-specific captions, while user edits and blank slots are never clobbered.
describe('mergeSceneCaptions', () => {
  const beats = [
    { ordinal: 1, prompt: 'Epic wide establishing shot on an anamorphic lens…' },
    { ordinal: 2, prompt: 'Eye-level medium shot tracking on a gimbal — 35mm…' },
    { ordinal: 3, prompt: 'A controlled camera arc — 28mm parallax…' },
  ];

  it('replaces generic beat captions with the positional story scripts', () => {
    const scripts = [
      'Soldiers march through a rubble-strewn European street at dawn.',
      'A soldier grips a pistol, tension on his face, war-torn city behind.',
      'An officer in a long coat walks a dim alley at night.',
    ];
    const out = mergeSceneCaptions(beats, scripts);
    expect(out.map((s) => s.prompt)).toEqual(scripts);
    // Non-mutating: originals untouched.
    expect(beats[0]!.prompt).toMatch(/anamorphic/);
  });

  it('preserves a scene the user has already edited (edited flag)', () => {
    const scenes = [{ ...beats[0]!, edited: true }, beats[1]!, beats[2]!];
    const scripts = ['NEW story 1', 'NEW story 2', 'NEW story 3'];
    const out = mergeSceneCaptions(scenes, scripts);
    expect(out[0]!.prompt).toMatch(/anamorphic/); // untouched — user owns it
    expect(out[1]!.prompt).toBe('NEW story 2');
  });

  it('preserves a scene flagged edited via the isEdited predicate (typed per-scene action)', () => {
    const scripts = ['NEW story 1', 'NEW story 2', 'NEW story 3'];
    const out = mergeSceneCaptions(beats, scripts, (ord) => ord === 2);
    expect(out[0]!.prompt).toBe('NEW story 1');
    expect(out[1]!.prompt).toMatch(/gimbal/); // ordinal 2 preserved
    expect(out[2]!.prompt).toBe('NEW story 3');
  });

  it('leaves a scene untouched when its script slot is blank/whitespace/missing', () => {
    const out = mergeSceneCaptions(beats, ['real story', '   ', undefined]);
    expect(out[0]!.prompt).toBe('real story');
    expect(out[1]!.prompt).toMatch(/gimbal/); // whitespace-only → keep beat
    expect(out[2]!.prompt).toMatch(/28mm/); // missing → keep beat
  });

  it('trims surrounding whitespace on the applied script', () => {
    const out = mergeSceneCaptions([beats[0]!], ['  padded story  ']);
    expect(out[0]!.prompt).toBe('padded story');
  });

  it('is a no-op when no scripts are provided', () => {
    const out = mergeSceneCaptions(beats, []);
    expect(out.map((s) => s.prompt)).toEqual(beats.map((s) => s.prompt));
  });
});
