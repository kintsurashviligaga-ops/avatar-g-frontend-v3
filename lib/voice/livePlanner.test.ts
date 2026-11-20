/**
 * Phase 8.10 voice planner (LIVE_AGENT_PLANNER): a spoken order → steps + one Georgian line to say back. $0, pure.
 */
import { planSpokenTask, spokenPlan, cleanWords, PLAN_AGENT_TASK_DECLARATION, LIVE_PLANNER_RULE, LIVE_PLAN_REQUEST_MAX_CHARS } from './livePlanner';
import { LIVE_STUDIO_TOOLS } from './liveTools';

const plan = (request: unknown, open?: (f: string) => boolean) => planSpokenTask({ request }, open);
const OPEN = (...flags: string[]) => (f: string) => flags.includes(f);

describe('planSpokenTask', () => {
  it('a Georgian three-step order: image → video → music, in order, spoken back before anything runs', () => {
    const r = plan('ჯერ სურათი გააკეთე კაფეზე, მერე მისგან ვიდეო და ბოლოს მუსიკა');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.steps.map((s) => [s.n, s.studio, s.how])).toEqual([
      [1, 'image', 'prepare_generation'], [2, 'video', 'prepare_generation'], [3, 'music', 'prepare_generation'],
    ]);
    expect(r.steps.map((s) => s.words)).toEqual(['სურათი გააკეთე კაფეზე', 'მისგან ვიდეო', 'მუსიკა']);
    expect(r.speak).toBe('გეგმა ასეთია: ჯერ სურათი, შემდეგ ვიდეო, ბოლოს მუსიკა. ჯერ არაფერი დაწყებულა. თითოეულ ნაბიჯს ჯერ ფასს გეტყვი და დავიწყებ მხოლოდ შენი „კი"-ს შემდეგ. დავიწყო პირველით?');
    expect(r.next).toMatch(/^After the user agrees, step 1: prepare_generation with tool "image"/);
  });

  it('every studio the plan names is one prepare_generation takes', () => {
    const r = plan('make an image, then a video, then music, then an avatar, then a presentation');
    if (!r.ok) throw new Error('expected a plan');
    for (const s of r.steps) if (s.studio) expect(LIVE_STUDIO_TOOLS).toContain(s.studio);
    expect(r.steps.map((s) => s.studio)).toEqual(['image', 'video', 'music', 'avatar', 'presentation']);
  });

  it('3D has no voice path (GG keeps 3D off): marked not_available, never swapped for a picture', () => {
    const r = plan('გააკეთე 3D მოდელი და მერე ვიდეო');
    if (!r.ok) throw new Error('expected a plan');
    expect(r.steps[0]).toMatchObject({ how: 'not_available' });
    expect(r.steps[0]!.studio).toBeUndefined();
    expect(r.steps[1]).toMatchObject({ studio: 'video', how: 'prepare_generation' });
    expect(r.speak).toContain('3D სტუდია (ეს ზარში ჯერ არ შემიძლია)');
    expect(r.speak).toContain('მის ნაცვლად სხვას არაფერს გავაკეთებ');
    expect(r.next).toMatch(/step 2/);
    // even with the 3D flag open there is still no call function for it
    const on = planSpokenTask({ request: 'გააკეთე 3D მოდელი და მერე ვიდეო' }, OPEN('NEXT_PUBLIC_STUDIO_3D_V2'));
    if (!on.ok) throw new Error('expected a plan');
    expect(on.steps[0]!.how).toBe('not_available');
  });

  it('a single 3D ask is refused in words', () => {
    const r = plan('გააკეთე 3D მოდელი ჩემი ლოგოსი');
    expect(r).toMatchObject({ ok: false, error: 'not_available' });
  });

  it('search then deck (ru): ask_agent_g first, then the presentation', () => {
    const r = plan('найди в интернете цены на кофе и потом сделай презентацию');
    if (!r.ok) throw new Error('expected a plan');
    expect(r.steps.map((s) => s.how)).toEqual(['ask_agent_g', 'prepare_generation']);
    expect(r.speak).toMatch(/^План такой: сначала поиск в интернете, потом презентация\./);
  });

  it('vague or either/or: ask, never guess', () => {
    expect(plan('გააკეთე რამე მაგარი')).toMatchObject({ ok: false, error: 'needs_detail' });
    const e = plan('ვიდეო თუ სურათი');
    expect(e).toMatchObject({ ok: false, error: 'needs_detail' });
    if (!e.ok) expect(e.speak).toContain('ვიდეო თუ სურათი');
  });

  it('with the specialist flags open, the steps name them (Art Director, Director\'s Workflow)', () => {
    const r = planSpokenTask({ request: 'ჯერ სურათი, მერე ვიდეო' }, OPEN('NEXT_PUBLIC_IMAGE_ART_DIRECTOR', 'DIRECTORS_WORKFLOW'));
    if (!r.ok) throw new Error('expected a plan');
    expect(r.steps.map((s) => [s.service, s.studio])).toEqual([['არტ-დირექტორი', 'image'], ['რეჟისორის რეჟიმი', 'video']]);
  });

  it('bad arguments never throw', () => {
    expect(planSpokenTask(undefined)).toMatchObject({ ok: false, error: 'invalid_args' });
    expect(planSpokenTask({ request: 42 })).toMatchObject({ ok: false, error: 'invalid_args' });
    expect(planSpokenTask({ request: '   ' })).toMatchObject({ ok: false, error: 'invalid_args' });
    const long = plan('ჯერ სურათი გააკეთე ' + 'ა'.repeat(5000) + ' მერე ვიდეო');
    if (long.ok) for (const s of long.steps) expect(s.words.length).toBeLessThanOrEqual(LIVE_PLAN_REQUEST_MAX_CHARS);
  });

  it('the answer never carries a price, a start or a charge', () => {
    const r = plan('make an image then a video');
    expect(JSON.stringify(r)).not.toMatch(/start_generation|credits|✦|\$/);
  });
});

describe('spoken text', () => {
  it('english and russian lines, lowercase mid-sentence, no lists or Markdown', () => {
    const en = spokenPlan([{ n: 1, service: 'Image', words: 'x', how: 'prepare_generation', studio: 'image' }, { n: 2, service: 'Video', words: 'y', how: 'prepare_generation', studio: 'video' }], 'en');
    expect(en).toBe('Here is the plan: first image, then video. Nothing has started yet. I\'ll tell you the price of each step and start it only after your yes. Shall I begin with the first?');
    expect(en).not.toMatch(/[*#\n]|^\d\./);
    const ru = spokenPlan([{ n: 1, service: 'Видео', words: 'x', how: 'prepare_generation', studio: 'video' }], 'ru');
    expect(ru).toMatch(/^План такой: сначала видео\./);
  });

  it('cleanWords drops the joining words only', () => {
    expect(cleanWords('ჯერ სურათი გააკეთე კაფეზე')).toBe('სურათი გააკეთე კაფეზე');
    expect(cleanWords('მისგან ვიდეო და')).toBe('მისგან ვიდეო');
    expect(cleanWords('then a video from it')).toBe('a video from it');
    expect(cleanWords('сначала картинку и')).toBe('картинку');
  });
});

describe('declaration', () => {
  it('is a plain Live function declaration with one required string', () => {
    expect(PLAN_AGENT_TASK_DECLARATION).toEqual({
      name: 'plan_agent_task', description: expect.any(String),
      parameters: { type: 'OBJECT', properties: { request: { type: 'STRING', description: expect.any(String) } }, required: ['request'] },
    });
    expect(JSON.parse(JSON.stringify(PLAN_AGENT_TASK_DECLARATION))).toEqual(PLAN_AGENT_TASK_DECLARATION);
    expect(LIVE_PLANNER_RULE).toMatch(/every paid step needs its own price and its own yes/);
  });
});
