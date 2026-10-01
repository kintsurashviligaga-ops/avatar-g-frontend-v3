/** @jest-environment node */
/**
 * director.ts with a FAKE generator (no LLM, no network). Rules under test: one bible call then one call per act,
 * sequentially; the bible's locked descriptions reach every act prompt verbatim AND become the Veo subject whatever
 * the act model wrote; act N+1 is written from act N's last scene (prompt + continuity + seed-frame marker); a
 * malformed act is retried once with a correction note and a second miss fails with the act index; the reply is
 * parsed defensively (size cap, clipping, enums, unknown ids, over-long dialogue dropped not truncated); and
 * buildSceneClipInput produces the request lib/veo/engine.createVeoClip consumes.
 */
import {
  ACT_SYSTEM_PROMPT,
  BIBLE_SYSTEM_PROMPT,
  buildSceneClipInput,
  coerceActScenes,
  coerceBible,
  coerceCamera,
  MAX_REPLY_CHARS,
  parseModelJson,
  runLongformDirector,
  type DirectorCallOptions,
  type DirectorGenerate,
  type LongformBible,
} from './director';
import { FILM_DRIFT_NEGATIVE } from '@/lib/chat/filmPipeline';

const ANA = 'a 30-year-old Georgian woman with shoulder-length black hair, hazel eyes, a red wool coat and gold hoop earrings';
const GIO = 'a 35-year-old man with a short brown beard, round glasses, a navy denim jacket and a grey scarf';

const bibleJson = (acts: number, extra: Record<string, unknown> = {}) => ({
  title: 'The Long Way Home',
  logline: 'Two old friends cross Georgia to reach a wedding on time.',
  characters: [
    { id: 'ana', name: 'Ana', role: 'lead', description: ANA },
    { id: 'gio', name: 'Gio', role: 'friend', description: GIO },
  ],
  look: { colorGrade: 'neutral filmic grade', lighting: 'soft natural daylight', cameraStyle: 'handheld documentary', palette: ['red', 'slate', 'gold'], negativePrompt: 'no lens flare, crowds' },
  arc: Array.from({ length: acts }, (_, i) => ({ title: `Part ${i + 1}`, summary: `Summary of part ${i + 1}`, beat: 'hope', closingImage: `Closing image ${i + 1}` })),
  music: { genre: 'folk', mood: 'warm', tempoBpm: 96, instrumentation: 'panduri and strings', direction: 'builds to a full ensemble' },
  ...extra,
});

/** n scenes for act `act`, numbered from `first`; the act model PARAPHRASES the cast (identity must survive). */
const actJson = (act: number, first: number, n: number) => ({
  scenes: Array.from({ length: n }, (_, i) => ({
    sceneNumber: 99, // deliberately wrong: placement is by order
    characters: i % 3 === 2 ? ['gio'] : ['ana', 'gio'],
    location: `Road ${first + i}`,
    action: `scene ${first + i} action of act ${act}`,
    cameraShot: 'medium tracking',
    camera: { move: 'push_in', shot: 'medium', angle: 'eye_level', lens: 'standard' },
    lighting: 'golden hour',
    mood: 'tender',
    imagePrompt: `A woman in a red coat on road ${first + i}. Negative: blur, cartoon`,
    sfxPrompt: 'wind, distant cars',
    dialogue: [],
    endState: `end of scene ${first + i}`,
  })),
});

interface Call { prompt: string; opts: DirectorCallOptions }

/** A scripted generator: replies are consumed in order; each reply is a string or an object (JSON-encoded). */
function fakeGenerator(replies: Array<unknown | ((p: string) => unknown)>): { generate: DirectorGenerate; calls: Call[] } {
  const calls: Call[] = [];
  const queue = [...replies];
  const generate: DirectorGenerate = async (prompt, opts) => {
    calls.push({ prompt, opts });
    const next = queue.shift();
    const value = typeof next === 'function' ? (next as (p: string) => unknown)(prompt) : next;
    if (value instanceof Error) throw value;
    if (value === null || value === undefined) return null;
    return typeof value === 'string' ? value : `\`\`\`json\n${JSON.stringify(value)}\n\`\`\``;
  };
  return { generate, calls };
}

describe('runLongformDirector — the happy path (240 s = 3 acts × 10)', () => {
  test('bible, then one call per act in order, with the bible injected and act N+1 written from act N', async () => {
    const { generate, calls } = fakeGenerator([bibleJson(3), actJson(0, 1, 10), actJson(1, 11, 10), actJson(2, 21, 10)]);
    const r = await runLongformDirector({ brief: 'A road trip to a wedding', seconds: 240, language: 'ka' }, generate);
    if (!r.ok) throw new Error(r.detail);
    const sb = r.storyboard;

    expect(calls.map((c) => [c.opts.purpose, c.opts.act ?? null, c.opts.attempt])).toEqual([
      ['bible', null, 1], ['act', 0, 1], ['act', 1, 1], ['act', 2, 1],
    ]);
    expect(calls[0]?.opts.system).toBe(BIBLE_SYSTEM_PROMPT);
    expect(calls[0]?.opts.json).toBe(true);
    expect(calls[0]?.prompt).toContain('Acts: 3 (act 1: 10 scenes; act 2: 10 scenes; act 3: 10 scenes)');
    expect(calls[1]?.opts.system).toBe(ACT_SYSTEM_PROMPT);
    // A 10-scene act's budget: 1200 + 450 × 10 — far under the 8000 ceiling a whole film used to hit.
    expect(calls[1]?.opts.maxTokens).toBe(5700);
    for (const c of calls.slice(1)) {
      expect(c.prompt).toContain(ANA); // locked descriptions, verbatim, in EVERY act call
      expect(c.prompt).toContain(GIO);
    }
    expect(calls[1]?.prompt).toContain('This is the opening of the film.');
    expect(calls[1]?.prompt).toContain('Write EXACTLY 10 scenes: scene 1 to scene 10.');
    expect(calls[2]?.prompt).toContain('It ended on: end of scene 10. Scene 11 opens exactly there.');
    expect(calls[3]?.prompt).toContain('This is the final act: resolve the story.');
    expect(calls[2]?.prompt).toContain('The next act ("Part 3") follows: Summary of part 3');

    expect(sb.calls).toBe(4);
    expect(sb.scenes).toHaveLength(30);
    expect(sb.acts.map((a) => [a.index, a.firstOrdinal, a.sceneCount, a.attempts])).toEqual([[0, 0, 10, 1], [1, 10, 10, 1], [2, 20, 10, 1]]);
    sb.scenes.forEach((s, i) => {
      expect(s.ordinal).toBe(i);
      expect(s.sceneNumber).toBe(i + 1); // by order, not the model's "99"
      expect(s.act).toBe(Math.floor(i / 10));
      expect(s.shot.ordinal).toBe(i);
    });
  });

  test('continuity: each scene carries the previous end state; act openers are marked for the seed frame', async () => {
    const { generate } = fakeGenerator([bibleJson(3), actJson(0, 1, 10), actJson(1, 11, 10), actJson(2, 21, 10)]);
    const r = await runLongformDirector({ brief: 'x', seconds: 240 }, generate);
    if (!r.ok) throw new Error(r.detail);
    const s = r.storyboard.scenes;
    expect(s[0]?.continuity).toEqual({ previousEndState: null, seedFromPreviousActLastFrame: false });
    expect(s[5]?.continuity).toEqual({ previousEndState: 'end of scene 5', seedFromPreviousActLastFrame: false });
    expect(s[10]?.continuity).toEqual({ previousEndState: 'end of scene 10', seedFromPreviousActLastFrame: true });
    expect(s[20]?.continuity.seedFromPreviousActLastFrame).toBe(true);
    expect(s.filter((x) => x.continuity.seedFromPreviousActLastFrame).map((x) => x.ordinal)).toEqual([10, 20]);
  });

  test('IDENTITY LOCK: the Veo subject is the bible text, not the act model\'s paraphrase', async () => {
    const { generate } = fakeGenerator([bibleJson(1), actJson(0, 1, 3)]);
    const r = await runLongformDirector({ brief: 'x', seconds: 24 }, generate);
    if (!r.ok) throw new Error(r.detail);
    const [a, , c] = r.storyboard.scenes;
    expect(a?.shot.subject).toBe(`${ANA}; and ${GIO}`);
    expect(c?.shot.subject).toBe(GIO); // only Gio on screen in every third scene
    // The storyboard keeps the model's prose for the board, minus the "Negative:" tail.
    expect(a?.imagePrompt).toBe('A woman in a red coat on road 1');
    const req = buildSceneClipInput(a!, { jobId: 'job-1', bible: r.storyboard.bible, tier: 'fast', format: '16:9', generateAudio: true });
    expect(req.request.prompt).toContain(ANA.slice(1)); // sentence-cased by the compiler
    expect(req.request.prompt).toContain(GIO);
    expect(req.request.prompt).not.toContain('A woman in a red coat');
  });
});

describe('runLongformDirector — malformed replies', () => {
  test('a malformed act is retried ONCE with a correction note, then the film continues', async () => {
    const { generate, calls } = fakeGenerator([
      bibleJson(2),
      actJson(0, 1, 7),
      'Sure! Here are the scenes you asked for: scene 8 is a wide shot…', // act 1, attempt 1: prose, no JSON
      actJson(1, 8, 6),
    ]);
    const r = await runLongformDirector({ brief: 'x', seconds: 104 }, generate); // 13 scenes → 7 / 6
    if (!r.ok) throw new Error(r.detail);
    expect(calls.map((c) => [c.opts.purpose, c.opts.act ?? null, c.opts.attempt])).toEqual([
      ['bible', null, 1], ['act', 0, 1], ['act', 1, 1], ['act', 1, 2],
    ]);
    expect(calls[3]?.prompt).toContain('YOUR PREVIOUS REPLY COULD NOT BE USED');
    expect(calls[3]?.prompt.startsWith(calls[2]!.prompt)).toBe(true);
    expect(r.storyboard.acts.map((a) => a.attempts)).toEqual([1, 2]);
    expect(r.storyboard.scenes).toHaveLength(13);
    expect(r.storyboard.calls).toBe(4);
  });

  test('an act that fails twice fails the storyboard with its index, and later acts are never requested', async () => {
    const { generate, calls } = fakeGenerator([bibleJson(3), actJson(0, 1, 10), '{"scenes": "nope"}', { scenes: [{ action: 'only one' }] }, actJson(2, 21, 10)]);
    const r = await runLongformDirector({ brief: 'x', seconds: 240 }, generate);
    expect(r).toEqual({ ok: false, error: 'act_unparseable', act: 1, detail: 'act 2 was not usable after one retry', calls: 4 });
    expect(calls).toHaveLength(4);
  });

  test('too few scenes is malformed (retried); too many are trimmed', async () => {
    const short = fakeGenerator([bibleJson(1), actJson(0, 1, 2), actJson(0, 1, 3)]);
    const r1 = await runLongformDirector({ brief: 'x', seconds: 24 }, short.generate);
    expect(r1.ok && r1.storyboard.acts[0]?.attempts).toBe(2);
    const long = fakeGenerator([bibleJson(1), actJson(0, 1, 9)]);
    const r2 = await runLongformDirector({ brief: 'x', seconds: 24 }, long.generate);
    expect(r2.ok && r2.storyboard.scenes.map((s) => s.action)).toEqual(['scene 1 action of act 0', 'scene 2 action of act 0', 'scene 3 action of act 0']);
  });

  test('a throwing or empty generator is a miss, not a crash', async () => {
    const { generate } = fakeGenerator([new Error('provider down'), null]);
    expect(await runLongformDirector({ brief: 'x', seconds: 8 }, generate)).toEqual({
      ok: false, error: 'bible_unparseable', detail: 'the bible reply was not usable after one retry', calls: 2,
    });
  });

  test('a bible without any arc summary is unusable', async () => {
    const { generate } = fakeGenerator([bibleJson(1, { arc: [{ title: 'x' }] }), bibleJson(1, { arc: 'no' })]);
    const r = await runLongformDirector({ brief: 'x', seconds: 8 }, generate);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toBe('bible_unparseable');
  });

  test('an off-grid length never calls the model', async () => {
    const { generate, calls } = fakeGenerator([]);
    const r = await runLongformDirector({ brief: 'x', seconds: 100 }, generate);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toBe('invalid_duration');
    expect(calls).toHaveLength(0);
  });

  test('a short arc is padded to one entry per act; extras are dropped', async () => {
    const { generate } = fakeGenerator([bibleJson(1), actJson(0, 1, 12), actJson(1, 13, 12)]);
    const r = await runLongformDirector({ brief: 'x', seconds: 192 }, generate); // 24 scenes → 2 acts, arc has 1
    if (!r.ok) throw new Error(r.detail);
    expect(r.storyboard.bible.arc.map((a) => [a.act, a.title, a.summary])).toEqual([[0, 'Part 1', 'Summary of part 1'], [1, 'Act 2', '']]);
    const b = coerceBible(bibleJson(5), 2);
    expect(b?.arc).toHaveLength(2);
  });
});

describe('defensive parsing', () => {
  test('parseModelJson: fences, prose around the object, a bare array, garbage, the size cap', () => {
    expect(parseModelJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseModelJson('Here you go: {"a": {"b": 2}} — enjoy')).toEqual({ a: { b: 2 } });
    expect(parseModelJson('[1, 2]')).toEqual([1, 2]);
    expect(parseModelJson('not json')).toBeNull();
    expect(parseModelJson('')).toBeNull();
    expect(parseModelJson(42)).toBeNull();
    expect(parseModelJson(null)).toBeNull();
    expect(parseModelJson(`{"a":"${'x'.repeat(MAX_REPLY_CHARS)}"}`)).toBeNull();
  });

  test('coerceBible: ids sanitised + unique, ≤ 6 characters, description required, bounded fields, tempo range', () => {
    const b = coerceBible({
      title: 'T'.repeat(500),
      characters: [
        { id: 'Ana Maria!', name: 'Ana', description: 'desc 1' },
        { id: 'ana_maria', name: 'Dup', description: 'desc 2' },
        { name: 'No Description' },
        'not an object',
        ...Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, description: `d${i}` })),
      ],
      look: { palette: Array.from({ length: 20 }, (_, i) => `colour ${i}`), negativePrompt: 7 },
      arc: [{ summary: 'go' }],
      music: { tempoBpm: 999 },
    }, 1)!;
    expect(b.title).toHaveLength(120);
    expect(b.characters.map((c) => c.id)).toEqual(['ana_maria', 'ana_maria_2', 'c0', 'c1', 'c2', 'c3']);
    expect(b.primaryCharacterId).toBe('ana_maria');
    expect(b.look.palette).toHaveLength(6);
    expect(b.look.negativePrompt).toBe('');
    expect(b.music.tempoBpm).toBeNull();
    expect(coerceBible('a string', 1)).toBeNull();
    expect(coerceBible([], 1)).toBeNull();
  });

  test('coerceBible: a vision-extracted identity overrides the lead (or becomes the lead)', () => {
    const vid = 'an elderly man with a thick white beard and a black felt hat';
    expect(coerceBible(bibleJson(1), 1, { characterVisualId: vid })?.characters[0]).toEqual({ id: 'ana', name: 'Ana', role: 'lead', description: vid });
    const empty = coerceBible({ ...bibleJson(1), characters: [] }, 1, { characterVisualId: vid })!;
    expect(empty.characters).toEqual([{ id: 'protagonist', name: 'Protagonist', role: 'lead', description: vid }]);
    expect(coerceBible({ ...bibleJson(1), characters: [] }, 1)?.primaryCharacterId).toBeNull();
  });

  test('coerceActScenes: control chars, clipping, unknown ids, camera vocabulary, dialogue bounds', () => {
    const bible = coerceBible(bibleJson(1), 1) as LongformBible;
    const longLine = 'ა'.repeat(201);
    const scenes = coerceActScenes({
      scenes: [{
        characters: ['ANA', 'Gio', 'villain', 'ana'],
        action: `runs\u0000 to the\u0007 car ${'z'.repeat(800)}`,
        camera: { move: 'barrel_roll', shot: 'CLOSE_UP', angle: 'low', lens: 42, intensity: 99 },
        dialogue: [
          { speaker: 'ana', line: 'გამარჯობა!' },
          { speaker: 'gio', line: longLine },
          { speaker: 'stranger', line: 'Hello there.' },
          { speaker: 'gio', line: 'A third line is one too many.' },
          { speaker: 'gio', line: 42 },
        ],
      }],
    }, 1, bible, 'ka')!;
    const s = scenes[0]!;
    expect(s.characters).toEqual(['ana', 'gio']);
    expect(s.action.startsWith('runs to the car')).toBe(true);
    expect(s.action).toHaveLength(500);
    expect(s.camera).toEqual({ move: 'auto', intensity: 10, shot: 'close_up', angle: 'low', lens: 'auto' });
    // Over-long line DROPPED (not cut); speaker id → bible name; unknown speaker kept as given; capped at 2.
    expect(s.dialogue).toEqual([
      { speaker: 'Ana', line: 'გამარჯობა!', language: 'ka' },
      { speaker: 'stranger', line: 'Hello there.', language: 'ka' },
    ]);
    expect(s.imagePrompt).toBe(s.action); // no imagePrompt → the action
    expect(s.cameraShot).toBe('medium');
  });

  test('coerceActScenes: an action can come from the imagePrompt; nothing usable is skipped; the lead is the default cast', () => {
    const bible = coerceBible(bibleJson(1), 1) as LongformBible;
    const s = coerceActScenes([{ imagePrompt: 'Ana lifts the veil. Then she smiles.' }, { mood: 'nothing else' }, null], 1, bible)!;
    expect(s[0]?.action).toBe('Ana lifts the veil.');
    expect(s[0]?.characters).toEqual(['ana']);
    expect(coerceActScenes({ scenes: [{ characters: [] , action: 'empty valley' }] }, 1, bible)?.[0]?.characters).toEqual([]);
    expect(coerceActScenes({ scenes: [] }, 1, bible)).toBeNull();
    expect(coerceActScenes({ scenes: [{ action: 'a' }] }, 0, bible)).toBeNull();
  });

  test('coerceCamera keeps only Google\'s vocabulary', () => {
    expect(coerceCamera(null)).toEqual({ move: 'auto', intensity: 5, shot: 'auto', angle: 'auto', lens: 'auto' });
    expect(coerceCamera({ move: 'orbit', shot: 'wide', angle: 'dutch', lens: 'telephoto', intensity: 3 })).toEqual({ move: 'orbit', intensity: 3, shot: 'wide', angle: 'dutch', lens: 'telephoto' });
  });
});

describe('buildSceneClipInput — the request createVeoClip consumes', () => {
  const bible = coerceBible(bibleJson(1), 1) as LongformBible;
  const scene = {
    ordinal: 4,
    shot: {
      ordinal: 0, subject: ANA, action: 'walks toward the church door', setting: 'old Tbilisi courtyard',
      camera: { move: 'push_in' as const, intensity: 5, shot: 'medium' as const, angle: 'eye_level' as const, lens: 'auto' as const },
      lighting: 'golden hour', mood: 'hopeful', audio: { dialogue: [{ speaker: 'Ana', line: 'We made it.' }], sfx: 'church bells' },
      hasStartImage: false, transitionOut: 'cut' as const,
    },
  };

  test('text-to-video: compiled prompt with subject + setting + style, 8 s, seed, film-first negatives, session/ordinal', () => {
    const input = buildSceneClipInput(scene, { jobId: 'j1', bible, tier: 'standard', format: '16:9', generateAudio: true, seed: 1234, negativePrompt: 'watermark' });
    expect(input.sessionId).toBe('longform-j1');
    expect(input.ordinal).toBe(4);
    expect(input.tier).toBe('standard');
    const r = input.request;
    expect(r).toMatchObject({ aspect: '16:9', durationSec: 8, generateAudio: true, seed: 1234 });
    expect(r.prompt).toContain(`${ANA.charAt(0).toUpperCase()}${ANA.slice(1)} walks toward the church door.`);
    expect(r.prompt).toContain('Setting: old Tbilisi courtyard.');
    expect(r.prompt).toContain('neutral filmic grade');
    expect(r.prompt).toContain('Ana says: We made it.');
    expect(r.startImage).toBeUndefined();
    expect(r.referenceImages).toBeUndefined();
    // Caption guard first (dialogue), then the bible's own exclusions (negations stripped), the user's, the drift list.
    expect(r.negativePrompt?.startsWith('subtitles, captions, on-screen text, lens flare, crowds, watermark,')).toBe(true);
    expect(r.negativePrompt!.length).toBeLessThanOrEqual(800);
    expect(r.negativePrompt).toContain(FILM_DRIFT_NEGATIVE.split(', ')[0]);
  });

  test('the previous act\'s last frame → image-to-video: motion-only prompt (no subject re-description)', () => {
    const r = buildSceneClipInput(scene, { jobId: 'j1', bible, tier: 'fast', format: '9:16', generateAudio: true, startImageUrl: 'https://cdn.example/frame.jpg' }).request;
    expect(r.startImage).toEqual({ kind: 'url', url: 'https://cdn.example/frame.jpg' });
    expect(r.prompt).toContain('The subject walks toward the church door.');
    expect(r.prompt).not.toContain(ANA);
    expect(r.prompt).not.toContain('Setting:');
  });

  test('reference images win over a seed frame (Veo: exclusive), capped at 3, https only; a non-https frame is ignored', () => {
    const r = buildSceneClipInput(scene, {
      jobId: 'j1', bible, tier: 'standard', format: '16:9', generateAudio: true, startImageUrl: 'https://cdn.example/frame.jpg',
      referenceImageUrls: ['https://a/1.jpg', 'http://insecure/2.jpg', 'https://a/3.jpg', 'https://a/4.jpg', 'https://a/5.jpg'],
    }).request;
    expect(r.startImage).toBeUndefined();
    expect(r.referenceImages).toEqual([{ kind: 'url', url: 'https://a/1.jpg' }, { kind: 'url', url: 'https://a/3.jpg' }, { kind: 'url', url: 'https://a/4.jpg' }]);
    const noFrame = buildSceneClipInput(scene, { jobId: 'j1', bible, tier: 'standard', format: '16:9', generateAudio: true, startImageUrl: 'file:///etc/passwd' }).request;
    expect(noFrame.startImage).toBeUndefined();
  });

  test('a cropped format carries the framing hint; no seed when none is given; a resolution passes through', () => {
    const r = buildSceneClipInput(scene, { jobId: 'j1', bible, tier: 'lite', format: '1:1', generateAudio: false, resolution: '720p' }).request;
    expect(r.aspect).toBe('1:1'); // the engine renders 16:9 and the crop happens in post
    expect(r.prompt).toMatch(/square 1:1 crop/);
    expect(r.seed).toBeUndefined();
    expect(r.resolution).toBe('720p');
    expect(r.generateAudio).toBe(false);
  });
});
