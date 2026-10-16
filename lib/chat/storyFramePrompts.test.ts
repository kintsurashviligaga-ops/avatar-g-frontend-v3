import { storyFramePrompts } from './filmPipeline';

// 2026-10-16: a typed brief that listed four scenes reached the image model as the whole brief on every frame, so
// scene 2 came back as a 2x2 storyboard with "SCENE 1..4" captions and scene 4 came back empty on every re-roll.
// Each frame must ask for its own scene's story shot.
describe('storyFramePrompts', () => {
  const brief = 'Make a 9:16 ad, four scenes: the actor speaks. The second scene ... the fourth scene ... — Epic wide shot';
  const plan = { 1: brief, 2: brief, 3: brief, 4: brief };
  const scripts = ['Scene one shot.', 'Scene two shot.', 'Scene three shot.', 'Scene four shot.'];

  it('gives every scene its own story shot instead of the whole brief', () => {
    expect(storyFramePrompts(plan, scripts)).toEqual({ 1: scripts[0], 2: scripts[1], 3: scripts[2], 4: scripts[3] });
  });

  it('keeps a per-scene action the user typed', () => {
    const typed = { ...plan, 2: 'My own scene two' };
    const out = storyFramePrompts(typed, scripts, (ord) => ord === 2);
    expect(out[2]).toBe('My own scene two');
    expect(out[4]).toBe('Scene four shot.');
  });

  it('keeps the plan prompt for a blank or missing script slot, and never mutates its input', () => {
    const out = storyFramePrompts(plan, ['Scene one shot.', '  ', null]);
    expect(out).toEqual({ 1: 'Scene one shot.', 2: brief, 3: brief, 4: brief });
    expect(plan[1]).toBe(brief);
  });
});
