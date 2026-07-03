import { stripToJson, parseAdScript, clampAdScript, AD_SCENE_SEC, AD_MAX_SCENES } from './adScriptAgent';

const good = {
  scenes: [
    { index: 0, durationSec: 6, visualPrompt: 'a glossy bottle on marble, studio light', narrationKa: 'ახალი გემო' },
    { index: 1, durationSec: 6, visualPrompt: 'pour splash slow motion', narrationKa: 'ყოველ წვეთში' },
  ],
  totalSec: 12,
};

describe('ad script agent — defensive parse + clamp (STEP 2.2)', () => {
  it('strips ```json fences and surrounding prose', () => {
    expect(JSON.parse(stripToJson('```json\n{"a":1}\n```'))).toEqual({ a: 1 });
    expect(JSON.parse(stripToJson('Sure! Here is the JSON:\n{"a":1}\nHope it helps'))).toEqual({ a: 1 });
  });

  it('parses valid strict JSON into a typed script', () => {
    const r = parseAdScript(JSON.stringify(good));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.script.scenes).toHaveLength(2);
      expect(r.script.scenes[1]!.narrationKa).toBe('ყოველ წვეთში');
    }
  });

  it('parses fenced JSON (the common LLM failure mode)', () => {
    const r = parseAdScript('```json\n' + JSON.stringify(good) + '\n```');
    expect(r.ok).toBe(true);
  });

  it('returns a clean error on malformed / non-JSON output (never throws)', () => {
    expect(parseAdScript('totally not json').ok).toBe(false);
    expect(parseAdScript('{ "scenes": [ {see comment} ] }').ok).toBe(false);
    // schema violation: empty scenes
    expect(parseAdScript(JSON.stringify({ scenes: [], totalSec: 0 })).ok).toBe(false);
    // missing required visualPrompt
    expect(parseAdScript(JSON.stringify({ scenes: [{ index: 0 }] })).ok).toBe(false);
  });

  it('clamps scene count to the budget/Kling ceiling and re-indexes + recomputes totalSec', () => {
    const many = { scenes: Array.from({ length: 20 }, (_, i) => ({ index: i, durationSec: 6, visualPrompt: `shot ${i}`, narrationKa: '' })), totalSec: 120 };
    const clamped = clampAdScript(many, 3);
    expect(clamped.scenes).toHaveLength(3);
    expect(clamped.scenes.map((s) => s.index)).toEqual([0, 1, 2]);
    expect(clamped.totalSec).toBe(3 * AD_SCENE_SEC);
    // never exceeds the hard ceiling even if asked for more
    expect(clampAdScript(many, 999).scenes.length).toBe(AD_MAX_SCENES);
  });
});
