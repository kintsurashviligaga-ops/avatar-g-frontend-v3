import { chainText, envFlagReader, isVagueAsk, nounsIn, routeV2, routeV2Reply, splitAsk, SUB_AGENTS, type RouteV2 } from './subAgents';
import { planChatTurn, routerV2Step, type ChatSnapshot } from '../chatTurn';

const all = () => true;
const kind = (r: RouteV2) => r.kind;
const agentOf = (r: RouteV2) => (r.kind === 'route' || r.kind === 'closed' ? r.agent : null);

describe('Router v2 — one ask goes to the right sub-agent (ka · en · ru)', () => {
  const cases: Array<[string, string]> = [
    ['გამიკეთე ვიდეო ზღვაზე', 'video'],
    ['დამიხატე კატა', 'image'],
    ['შექმენი 3D მოდელი ჩემი ლოგოსი', 'studio3d'],
    ['გამიკეთე პრეზენტაცია ხელოვნურ ინტელექტზე', 'presentation'],
    ['შექმენი სიმღერა ზღვაზე', 'music'],
    ['make a video about the sea', 'video'],
    ['draw a cat in a hat', 'image'],
    ['create a 3D model of a chair', 'studio3d'],
    ['make a presentation about AI', 'presentation'],
    ['сделай видео про море', 'video'],
    ['нарисуй кота', 'image'],
    ['сделай 3D модель стула', 'studio3d'],
  ];
  it.each(cases)('%s → %s (every flag open)', (text, agent) => {
    const r = routeV2({ text, mode: 'chat', locale: 'ka', open: all });
    // With every flag on, base lanes are upgraded to their specialists.
    const up: Record<string, string> = { video: 'directors-workflow', image: 'art-director', music: 'music-producer' };
    expect(agentOf(r)).toBe(up[agent] ?? agent);
  });

  it('with every flag closed, video and image stay on the base lanes (main behaviour)', () => {
    expect(agentOf(routeV2({ text: 'გამიკეთე ვიდეო ზღვაზე', mode: 'chat' }))).toBe('video');
    expect(agentOf(routeV2({ text: 'დამიხატე კატა', mode: 'chat' }))).toBe('image');
  });

  it('a 3D ask with the 3D Studio closed is said honestly, never made as a picture', () => {
    const r = routeV2({ text: 'შექმენი 3D მოდელი ჩემი ლოგოსი', mode: 'chat' });
    expect(r).toMatchObject({ kind: 'closed', agent: 'studio3d', lang: 'ka' });
    expect(routeV2Reply(r)).toContain('3D სტუდია ჯერ არ არის ჩართული');
  });

  it('a website is the App Builder, not an image (main reads „ვებგვერდი" as image.generate)', () => {
    for (const text of ['შექმენი ვებგვერდი ჩემი კაფესთვის', 'build a website for my cafe', 'создай сайт для моего кафе']) {
      const r = routeV2({ text, mode: 'chat' });
      expect(agentOf(r)).toBe('app-builder');
      expect(r.kind).toBe('closed');
    }
    expect(agentOf(routeV2({ text: 'build a website for my cafe', mode: 'chat', open: all }))).toBe('app-builder');
  });
});

describe('Router v2 — ask instead of guessing', () => {
  it.each(['გააკეთე რამე მაგარი', 'make it', 'make something cool', 'сделай что-нибудь крутое', 'შექმენი რაიმე'])('„%s" → a clarifying question', (text) => {
    expect(isVagueAsk(text)).toBe(true);
    const r = routeV2({ text, mode: 'chat', locale: 'ka' });
    expect(kind(r)).toBe('clarify');
  });

  it('the Georgian question names the options and promises the price first', () => {
    const r = routeV2({ text: 'გააკეთე რამე მაგარი', mode: 'chat' });
    const t = routeV2Reply(r)!;
    expect(t).toMatch(/^რა გავაკეთო\?/);
    expect(t).toContain('3D სტუდია');
    expect(t).toContain('ფასს');
  });

  it('either/or between two services asks which one', () => {
    const r = routeV2({ text: 'ვიდეო თუ სურათი გამიკეთე კატაზე', mode: 'chat' });
    expect(r).toMatchObject({ kind: 'clarify', options: ['video', 'image'] });
    expect(routeV2Reply(r)).toContain('ვიდეო თუ სურათი?');
    expect(routeV2({ text: 'a video or a picture of a cat', mode: 'chat' })).toMatchObject({ kind: 'clarify', options: ['video', 'image'] });
  });

  it('a concrete ask is never questioned', () => {
    expect(isVagueAsk('დამიხატე კატა')).toBe(false);
    expect(isVagueAsk('make a cat')).toBe(false); // a subject, even with no service noun
  });
});

describe('Router v2 — two services in one message become ordered steps', () => {
  it('„3D of my logo, then a video" keeps BOTH steps in order (main keeps only the 3D)', () => {
    for (const text of [
      'შექმენი ჩემი ლოგოს 3D მოდელი და მერე ვიდეო გააკეთე',
      'make a 3D model of my logo and make a video of it',
      'сделай 3D модель моего логотипа, а потом сделай из неё видео',
    ]) {
      const r = routeV2({ text, mode: 'chat', open: all });
      expect(r.kind).toBe('chain');
      if (r.kind === 'chain') expect(r.steps.map((s) => s.agent)).toEqual(['studio3d', 'directors-workflow']);
    }
  });

  it('splitAsk does not split a single subject on a bare „და" (a cat and a dog is one picture)', () => {
    expect(splitAsk('დამიხატე კატა და ძაღლი')).toHaveLength(1);
    expect(splitAsk('draw a cat and a dog')).toHaveLength(1);
  });

  it('„3D ვიდეო" is one 3D ask, not two', () => {
    expect(nounsIn('3D ვიდეო')).toEqual(['studio3d', 'video']);
    expect(routeV2({ text: 'გამიკეთე 3D ვიდეო', mode: 'chat', open: all }).kind).not.toBe('chain');
  });

  it('the plan says nothing started, nothing charged, and that step 1 is in the box', () => {
    const r = routeV2({ text: 'make an image of a cat and then make a video of it', mode: 'chat', locale: 'ka' });
    expect(r.kind).toBe('chain');
    const ka = chainText(r.kind === 'chain' ? r.steps : [], 'ka');
    expect(ka).toContain('1. სურათი');
    expect(ka).toContain('2. ვიდეო (წინა ნაბიჯის შედეგით)');
    expect(ka).toContain('არაფერი ჩამოჭრილა');
  });

  it('a chain with a closed step starts nothing and offers the open steps', () => {
    const r = routeV2({ text: 'შექმენი ჩემი ლოგოს 3D მოდელი და მერე ვიდეო გააკეთე', mode: 'chat' });
    expect(r.kind).toBe('chain');
    expect(routeV2Reply(r)).toContain('ჯერ არ არის ჩართული');
  });
});

describe('Router v2 — leaves the existing lanes alone', () => {
  it.each(['შეწყვიტე', 'სტატუსი', 'გამარჯობა', 'რა არის 3D?', 'არ მომწონს'])('„%s" keeps the existing reading', (text) => {
    expect(routeV2({ text, mode: 'chat' }).kind).toBe('keep');
  });
  it('a focus tool keeps its own gate', () => {
    expect(routeV2({ text: 'გააკეთე რამე მაგარი', mode: 'image' }).kind).toBe('keep');
  });
  it('asks about attached videos stay with the montage/edit lanes', () => {
    expect(routeV2({ text: 'გააკეთე რამე მაგარი', mode: 'chat', attachments: ['video'] }).kind).toBe('keep');
  });
  it('web search stays in the grounded chat (no route change)', () => {
    expect(routeV2({ text: 'მოძებნე ინტერნეტში თბილისის ამინდი', mode: 'chat' }).kind).toBe('keep');
  });
});

describe('planChatTurn with the flag', () => {
  const snap = (over: Partial<ChatSnapshot> = {}): ChatSnapshot => ({
    mode: 'chat', locale: 'ka', attachments: [], cards: [], jobs: [], foreground: null, lastTruncated: false, lastRedoable: false,
    pendingMontageId: null, previous: null, montageOn: false, audioOn: false, ...over,
  });

  it('flag OFF: exactly main (a vague ask still goes to the image lane, a website too)', () => {
    expect(routerV2Step('გააკეთე რამე მაგარი', snap())).toBeNull();
    expect(planChatTurn('გააკეთე რამე მაგარი', snap())).toMatchObject({ kind: 'pass', intent: { kind: 'act', capability: 'image.generate' } });
  });

  it('flag ON: the vague ask gets the question and keeps the words in the box', () => {
    expect(planChatTurn('გააკეთე რამე მაგარი', snap({ routerV2: true }))).toMatchObject({ kind: 'say', keepComposer: true });
  });

  it('flag ON: a chain puts step 1 in the box when every step is open', () => {
    const step = routerV2Step('make an image of a cat and then make a video of it', snap({ routerV2: true }));
    expect(step).toMatchObject({ kind: 'say', composer: 'make an image of a cat' });
  });

  it('flag ON: a chain with a closed step fills nothing in', () => {
    const step = routerV2Step('შექმენი ჩემი ლოგოს 3D მოდელი და მერე ვიდეო გააკეთე', snap({ routerV2: true }));
    expect(step && 'composer' in step ? step.composer : undefined).toBeUndefined();
  });

  it('flag ON: a concrete ask passes through to the existing reading', () => {
    expect(routerV2Step('დამიხატე კატა', snap({ routerV2: true }))).toBeNull();
  });
});

describe('flags', () => {
  it('envFlagReader is fail-closed; "admins" needs an admin', () => {
    const r = envFlagReader({ A: '1', B: 'admins', C: 'yes', D: '' });
    expect([r('A'), r('B'), r('C'), r('D'), r('E')]).toEqual([true, false, false, false, false]);
    expect(envFlagReader({ B: 'admins' }, true)('B')).toBe(true);
    // 'admin' (the value STUDIO_3D_V2, MONTAGE_SMART_EDITOR and IMAGE_ART_DIRECTOR use) opens it for admins only.
    expect(envFlagReader({ B: 'admin' }, true)('B')).toBe(true);
    expect(envFlagReader({ B: 'admin' }, false)('B')).toBe(false);
    expect(envFlagReader({ B: 'administrator' }, true)('B')).toBe(false);
  });
  it('every sub-agent that is not on main names its draft PR and flag', () => {
    for (const [id, info] of Object.entries(SUB_AGENTS)) {
      if (info.flag) expect({ id, pr: info.draftPr }).toEqual({ id, pr: expect.any(Number) });
    }
  });
});
