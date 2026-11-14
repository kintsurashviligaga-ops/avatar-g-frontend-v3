import { directClipCredits } from '@/lib/video/directClip';
import {
  addScene,
  approve,
  composeScenePrompt,
  directorsWorkflowAllowed,
  directorsWorkflowAudience,
  duplicateScene,
  emptyScene,
  livePricer,
  moveScene,
  parsePlannerAnswer,
  plannerInstruction,
  quoteProject,
  removeScene,
  sceneClipSpec,
  soundDesignLine,
  updateScene,
  validateProject,
  DW_MAX_SCENES,
  type DwProject,
  type DwScene,
} from './index';

const scene = (id: string, order: number, over: Partial<DwScene> = {}): DwScene => ({
  ...emptyScene(id),
  order,
  title: `Scene ${order}`,
  action: 'Nino walks into a sunlit café and sits at the window.',
  firstFrame: order === 1 ? 'none' : 'previous',
  ...over,
});

const project = (scenes: DwScene[]): DwProject => ({
  id: 'p1',
  title: 'Café',
  logline: 'Two friends meet',
  aspect: '9:16',
  resolution: '720p',
  characters: [
    { id: 'nino', name: 'Nino', look: 'woman, 30, dark curly hair, red coat', voice: 'female' },
    { id: 'giga', name: 'Giga', look: 'man, 35, short beard, grey sweater', voice: 'male' },
  ],
  scenes,
  status: 'draft',
  version: 1,
});

const kaScene = (id: string, order: number) =>
  scene(id, order, { characterIds: ['nino', 'giga'], audio: { lines: [{ characterId: 'nino', text: 'გამარჯობა, გიგა!' }, { characterId: 'giga', text: 'სალამი!' }], ambience: '', effects: [], music: null } });

describe('engine and price per scene', () => {
  it('a Georgian line goes to Omni at the speech resolution; a silent 8 s goes to Veo', () => {
    const p = project([kaScene('s1', 1), scene('s2', 2)]);
    expect(sceneClipSpec(p, p.scenes[0]!)).toMatchObject({ engine: 'omni', speech: 'ka', resolution: '720p' });
    expect(sceneClipSpec(p, p.scenes[1]!)).toMatchObject({ engine: 'veo', speech: null, resolution: '1080p', photos: 1 });
  });

  it('a 1-scene project costs exactly what the same single clip costs today', () => {
    const p = project([kaScene('s1', 1)]);
    const q = quoteProject(p);
    expect(q.totalCredits).toBe(directClipCredits({ seconds: 8, tier: 'fast', photos: 0, resolution: '720p', speech: 'ka' }));
    expect(q.totalSeconds).toBe(8);
  });

  it('the total is the sum of the scenes, and a custom pricer replaces the price book', () => {
    const p = project([kaScene('s1', 1), scene('s2', 2, { seconds: 4 }), scene('s3', 3, { seconds: 10 })]);
    const q = quoteProject(p);
    expect(q.totalCredits).toBe(q.scenes.reduce((n, s) => n + livePricer(s.clip), 0));
    expect(q.totalSeconds).toBe(22);
    expect(quoteProject(p, () => 7).totalCredits).toBe(21);
  });
});

describe('validateProject', () => {
  it('a sound board has no problems', () => {
    expect(validateProject(project([kaScene('s1', 1), scene('s2', 2)]))).toEqual([]);
  });

  it('refuses 0 and 11 scenes', () => {
    expect(validateProject(project([])).map((x) => x.code)).toContain('scene_count');
    const eleven = Array.from({ length: 11 }, (_, i) => scene(`s${i}`, i + 1));
    expect(validateProject(project(eleven)).map((x) => x.code)).toContain('scene_count');
  });

  it('catches a speaker who is not on screen, an unknown one, and lines too long for the clip', () => {
    const long = 'ეს არის ძალიან გრძელი წინადადება რომელიც ოთხ წამში ვერასდროს ვერ ჩაეტევა რადგან მასში ბევრი სიტყვაა და კიდევ უფრო მეტი';
    const p = project([
      scene('s1', 1, { seconds: 4, characterIds: ['nino'], audio: { lines: [{ characterId: 'giga', text: 'სალამი' }, { characterId: 'zura', text: 'hi' }, { characterId: 'nino', text: long }], ambience: '', effects: [], music: null } }),
    ]);
    const codes = validateProject(p).map((x) => x.code);
    expect(codes).toEqual(expect.arrayContaining(['speaker_not_in_scene', 'unknown_character', 'speech_too_long']));
  });

  it('scene 1 cannot continue from a previous scene; a photo first frame needs a photo', () => {
    const p = project([scene('s1', 1, { firstFrame: 'previous' }), scene('s2', 2, { firstFrame: 'photo' })]);
    expect(validateProject(p).filter((x) => x.code === 'first_frame')).toHaveLength(2);
  });

  it('gaps in order and duplicate ids are problems', () => {
    const codes = validateProject(project([scene('s1', 1), scene('s1', 3)])).map((x) => x.code);
    expect(codes).toEqual(expect.arrayContaining(['order', 'duplicate_id']));
  });
});

describe('scene-card edits', () => {
  const base = project([scene('a', 1), scene('b', 2), scene('c', 3)]);

  it('every edit renumbers, bumps the version and drops an approval', () => {
    const approved = approve(base);
    const moved = moveScene(approved, 'c', 1);
    expect(moved.scenes.map((s) => s.id)).toEqual(['c', 'a', 'b']);
    expect(moved.scenes.map((s) => s.order)).toEqual([1, 2, 3]);
    expect(moved.version).toBe(2);
    expect(moved.status).toBe('draft');
    expect(moved.scenes[0]!.firstFrame).toBe('none');
  });

  it('add / duplicate stop at 10 scenes; remove stops at 1', () => {
    let p = base;
    for (let i = 0; i < 12; i += 1) p = addScene(p, emptyScene(`n${i}`));
    expect(p.scenes).toHaveLength(DW_MAX_SCENES);
    expect(duplicateScene(p, 'a', 'zz')).toBe(p);
    let q = project([scene('only', 1)]);
    q = removeScene(q, 'only');
    expect(q.scenes).toHaveLength(1);
  });

  it('duplicate lands right after the original with its own copy of the audio', () => {
    const p = duplicateScene(base, 'a', 'a2');
    expect(p.scenes.map((s) => s.id)).toEqual(['a', 'a2', 'b', 'c']);
    expect(p.scenes[1]!.audio).not.toBe(p.scenes[0]!.audio);
  });

  it('updateScene changes fields, not id or order', () => {
    const p = updateScene(base, 'b', { seconds: 10, title: 'New' });
    expect(p.scenes[1]).toMatchObject({ id: 'b', order: 2, seconds: 10, title: 'New' });
  });
});

describe('composeScenePrompt', () => {
  it('names the cast with their looks, keeps the Georgian lines verbatim once each, no narrator, no music by default', () => {
    const p = project([kaScene('s1', 1)]);
    const text = composeScenePrompt(p, p.scenes[0]!);
    expect(text).toContain('Nino: woman, 30, dark curly hair, red coat');
    expect(text.split('გამარჯობა, გიგა!').length - 1).toBe(1);
    expect(text).toContain('"სალამი!"');
    expect(text).toMatch(/no narrator/i);
    expect(text).toContain('No music');
    expect(text).not.toMatch(/\[LINE/);
  });

  it('the scene\'s own sound goes in one Sound design line, with a music cue only when the card asks', () => {
    const p = project([scene('s1', 1, { audio: { lines: [], ambience: 'rain on the window', effects: ['a door slams'], music: 'soft piano' } })]);
    const text = composeScenePrompt(p, p.scenes[0]!);
    expect(text).toContain('Sound design: rain on the window, a door slams, with music: soft piano.');
    expect(soundDesignLine('', [], null, true)).toBeNull();
  });

  it('a scene that continues from the previous one starts from its first frame', () => {
    const p = project([scene('s1', 1), scene('s2', 2)]);
    expect(composeScenePrompt(p, p.scenes[1]!)).toMatch(/Start exactly from the first frame/);
  });
});

describe('planner', () => {
  const d = { id: 'p9', aspect: '9:16' as const, resolution: '720p' as const, sceneId: (i: number) => `s${i}` };

  it('the instruction asks for the scene count, keeps Georgian dialogue and forbids a narrator', () => {
    const t = plannerInstruction({ idea: 'ორი მეგობარი კაფეში', scenes: 3, aspect: '9:16', locale: 'ka' });
    expect(t).toContain('exactly 3 scenes');
    expect(t).toMatch(/Georgian/);
    expect(t).toMatch(/No narrator/);
    expect(plannerInstruction({ idea: 'x', scenes: 40, aspect: '16:9', locale: 'en' })).toContain('exactly 10 scenes');
  });

  it('reads a fenced answer, snaps lengths, puts speakers on screen and forces scene 1 to start fresh', () => {
    const raw = 'Here:\n```json\n' + JSON.stringify({
      title: 'Café',
      characters: [{ id: 'c1', name: 'ნინო', look: 'woman', voice: 'female' }],
      scenes: [
        { title: 'One', action: 'ნინო შედის კაფეში', seconds: 9, characterIds: [], lines: [{ characterId: 'c1', text: 'გამარჯობა!' }], firstFrame: 'previous', music: null },
        { title: 'Two', action: 'ნინო ჯდება', seconds: 5, firstFrame: 'previous' },
        { title: 'Bad', action: '' },
      ],
    }) + '\n```';
    const r = parsePlannerAnswer(raw, d);
    if (!r.ok) throw new Error('expected ok');
    expect(r.project.scenes).toHaveLength(2);
    expect(r.project.scenes[0]).toMatchObject({ id: 's1', seconds: 8, characterIds: ['c1'], firstFrame: 'none' });
    expect(r.project.scenes[1]).toMatchObject({ seconds: 6, firstFrame: 'previous' });
    expect(r.problems).toEqual([]);
  });

  it('caps at 10 scenes, drops unknown speakers and refuses non-JSON', () => {
    const scenes = Array.from({ length: 14 }, (_, i) => ({ action: `a${i}`, seconds: 8, lines: [{ characterId: 'ghost', text: 'hi' }] }));
    const r = parsePlannerAnswer(JSON.stringify({ scenes }), d);
    if (!r.ok) throw new Error('expected ok');
    expect(r.project.scenes).toHaveLength(10);
    expect(r.project.scenes[0]!.audio.lines).toEqual([]);
    expect(parsePlannerAnswer('sorry', d)).toEqual({ ok: false, reason: 'not_json' });
    expect(parsePlannerAnswer('{"scenes":[]}', d)).toEqual({ ok: false, reason: 'no_scenes' });
  });
});

describe('DIRECTORS_WORKFLOW', () => {
  it('is off unless set to admin or everyone in words', () => {
    expect(directorsWorkflowAudience({})).toBe('off');
    expect(directorsWorkflowAudience({ DIRECTORS_WORKFLOW: 'true' })).toBe('off');
    expect(directorsWorkflowAllowed(false, { DIRECTORS_WORKFLOW: 'admin' })).toBe(false);
    expect(directorsWorkflowAllowed(true, { DIRECTORS_WORKFLOW: 'admin' })).toBe(true);
    expect(directorsWorkflowAllowed(false, { DIRECTORS_WORKFLOW: 'Everyone' })).toBe(true);
  });
});
