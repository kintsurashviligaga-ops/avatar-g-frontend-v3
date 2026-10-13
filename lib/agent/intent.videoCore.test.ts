/** @jest-environment node */
/**
 * Video Core v1.0 — AC-01 (a sentence becomes the right video job) and §3.3 (montage · generation · music video kept
 * apart). Reproduced on 30be5a2 (2026-10-12, PHASE 0):
 *   · „24-წამიანი მუსიკალური კლიპი გამიკეთე" → chat (the catalog leaves the Video tool to other routers, and the
 *     generate gate wants the verb FIRST, which Georgian never does);
 *   · "24-second music video please" → chat (no lead verb);
 *   · «сделай 24-секундный музыкальный клип» → music.generate (the music rule outweighs the video rule);
 *   · „ერთწუთიანი ვიდეო გამიკეთე ზღვაზე", „ოთხწუთიანი ფილმი გამიკეთე თბილისზე" → chat (verb-final);
 *   · „შვიდი კლიპიდან გამოიყენე მხოლოდ ბოლო ხუთი" with seven clips and a track → chat (a selection names no montage word).
 */
import { classifyAgentIntent, type IntentInput } from './intent';
import { planChatTurn, type ChatSnapshot } from './chatTurn';
import type { AgentIntent, AttachmentKind } from './contracts';

const V: AttachmentKind = 'video';
const A: AttachmentKind = 'audio';
const I: AttachmentKind = 'image';
const V7: AttachmentKind[] = [V, V, V, V, V, V, V];

const run = (text: string, extra: Partial<IntentInput> = {}): AgentIntent => classifyAgentIntent({ text, ...extra });
const act = (i: AgentIntent) => {
  if (i.kind !== 'act') throw new Error(`expected act, got ${JSON.stringify(i)}`);
  return i;
};

describe('AC-01 · a music video asked in words, with no clips attached, is the Video tool in music-video mode', () => {
  test.each<[string, number]>([
    ['24-წამიანი მუსიკალური კლიპი გამიკეთე', 24],
    ['გამიკეთე 24-წამიანი მუსიკალური კლიპი', 24],
    ['ერთწუთიანი მუსიკალური ვიდეო მინდა', 60],
    ['24-second music video please', 24],
    ['make me a 24-second music video', 24],
    ['I want a one-minute music video', 60],
    ['сделай 24-секундный музыкальный клип', 24],
    ['музыкальный клип на 24 секунды', 24],
  ])('%s → video.music-video, new, %s s', (text, sec) => {
    expect(act(run(text))).toMatchObject({ capability: 'video.music-video', target: 'new', params: { durationSec: sec }, missing: [] });
  });

  test('with the track attached, the job is about that track', () => {
    expect(act(run('24-წამიანი მუსიკალური კლიპი გამიკეთე', { attachments: [A] }))).toMatchObject({ capability: 'video.music-video', target: 'attachment', params: { durationSec: 24 } });
  });

  test('with clips attached it is the montage, as before (§3.3: montage ≠ generation)', () => {
    expect(act(run('ამ სამი ვიდეოდან მუსიკალური კლიპი გამიკეთე', { attachments: [V, V, V, A] }))).toMatchObject({ capability: 'agent.montage', target: 'attachment' });
    expect(act(run('Make a music video from these three clips', { attachments: [V, V, V, A] }))).toMatchObject({ capability: 'agent.montage', target: 'attachment' });
    expect(act(run('ამ სამი ვიდეოდან მუსიკალური კლიპი გამიკეთე', { attachments: [V, V, V] }))).toMatchObject({ capability: 'agent.montage', missing: ['track'] });
  });

  test('a question or a remark about music videos is not a job', () => {
    expect(run('what is a music video?').kind).toBe('question');
    expect(run('მუსიკალური კლიპი რა არის?').kind).toBe('question');
    expect(run('my client asked for a music video').kind).not.toBe('act');
    expect(run('მუსიკალური კლიპი კარგი იყო').kind).not.toBe('act');
  });
});

describe('AC-01 · a video asked with the verb LAST (Georgian) reaches the generate lane with its length', () => {
  test.each<[string, number]>([
    ['ერთწუთიანი ვიდეო გამიკეთე ზღვაზე', 60],
    ['ოთხწუთიანი ფილმი გამიკეთე თბილისზე', 240],
    ['ზღვაზე 24-წამიანი ვიდეო გამიკეთე', 24],
    ['make a one-minute video of the sea', 60],
    ['сделай одноминутное видео о море', 60],
    ['сделай четырёхминутное видео о Тбилиси', 240],
  ])('%s → video.generate, new, %s s', (text, sec) => {
    expect(act(run(text))).toMatchObject({ capability: 'video.generate', target: 'new', params: { durationSec: sec }, missing: [] });
  });

  test('an analysis asked with the same verb is not a render', () => {
    expect(run('ვიდეოს ანალიზი გამიკეთე').kind).not.toBe('act');
    expect(run('ამ ვიდეოს აღწერა გამიკეთე', { attachments: [V] }).kind).not.toBe('act');
  });

  test('text written ABOUT a video is the chat\'s, never a render (a writing verb leads)', () => {
    expect(run('напиши пост про предыдущее видео, чтобы отразить настроение', { previous: { kind: 'video' } }).kind).not.toBe('act');
    expect(run('write a script for a 30-second video about Tbilisi').kind).not.toBe('act');
    expect(run('ვიდეოსთვის სცენარი დაწერე').kind).not.toBe('act');
    // a song is still the music lane's
    expect(act(run('write me a song about the sea'))).toMatchObject({ capability: 'music.generate' });
  });

  test('an edit of the attached video keeps its reading (no new video from „ვიდეო … გამიკეთე")', () => {
    expect(act(run('ვიდეო 9:16-ზე გადაიყვანე.', { attachments: [V] }))).toMatchObject({ capability: 'media.edit', params: { editOp: 'aspect' } });
    expect(act(run('სუბტიტრები დაამატე.', { attachments: [V] }))).toMatchObject({ capability: 'video.remix', params: { editOp: 'captions' } });
  });
});

describe('§3.3 · a source selection with clips and a track is the montage of those clips', () => {
  test.each([
    'შვიდი კლიპიდან გამოიყენე მხოლოდ ბოლო ხუთი',
    'use only the last five of the seven clips',
    'из семи клипов используй только последние пять',
  ])('%s + 7 clips + track → agent.montage of the attachment', (text) => {
    const i = act(run(text, { attachments: [...V7, A] }));
    expect(i).toMatchObject({ capability: 'agent.montage', target: 'attachment', missing: [] });
    expect(i.params.durationSec).toBeUndefined(); // „შვიდი", „ხუთი" count clips, they are not a length
  });

  test('the same words with the clips but no track ask for the track', () => {
    expect(act(run('შვიდი კლიპიდან გამოიყენე მხოლოდ ბოლო ხუთი', { attachments: V7 }))).toMatchObject({ capability: 'agent.montage', missing: ['track'] });
  });

  test("the owner's five-clip sentence: 9:16, song from 0:59, 29.7 s, the logo as the picture attached", () => {
    const t = 'ამ ხუთი ვიდეოდან გააკეთე 29.7-წამიანი კლიპი, მუსიკა დაიწყე 0:59-დან, გამოიყენე 9:16 ფორმატი და ბოლოს დაამატე ჩემი ლოგო.';
    expect(act(run(t, { attachments: [V, V, V, V, V, A, I] }))).toMatchObject({
      capability: 'agent.montage', target: 'attachment', params: { aspect: '9:16', musicStartSec: 59, durationSec: 29.7 }, missing: [],
    });
  });
});

describe('the chat step: the Video tool opens in the mode and at the length the words name', () => {
  const base: ChatSnapshot = {
    mode: 'chat', locale: 'ka', attachments: [], cards: [], jobs: [], foreground: null,
    lastTruncated: false, lastRedoable: false, pendingMontageId: null, previous: null, montageOn: true, audioOn: true,
  };
  const snap = (over: Partial<ChatSnapshot> = {}): ChatSnapshot => ({ ...base, ...over });

  test('a music video: music-video mode, 24 s', () => {
    expect(planChatTurn('24-წამიანი მუსიკალური კლიპი გამიკეთე', snap())).toMatchObject({ kind: 'open', tool: 'video', videoMode: 'musicvideo', durationSec: 24 });
    expect(planChatTurn('24-second music video please', snap({ locale: 'en' }))).toMatchObject({ kind: 'open', tool: 'video', videoMode: 'musicvideo', durationSec: 24 });
  });

  test('a film: documentary mode, 60 s / 240 s (the length is carried, the tool decides whether it can be made)', () => {
    expect(planChatTurn('ერთწუთიანი ვიდეო გამიკეთე ზღვაზე', snap())).toMatchObject({ kind: 'open', tool: 'video', videoMode: 'documentary', durationSec: 60 });
    expect(planChatTurn('ოთხწუთიანი ფილმი გამიკეთე თბილისზე', snap())).toMatchObject({ kind: 'open', tool: 'video', videoMode: 'documentary', durationSec: 240 });
  });

  test('no length in the words: the step carries none (the tool must not inherit the last project\'s)', () => {
    const step = planChatTurn('make a video about the sea', snap({ locale: 'en' }));
    expect(step).toMatchObject({ kind: 'open', tool: 'video', videoMode: 'documentary' });
    expect((step as { durationSec?: number }).durationSec).toBeUndefined();
  });

  test('a photo brought to life and the next scene with the same character keep their own paths', () => {
    expect(planChatTurn('ეს ფოტო გააცოცხლე.', snap({ attachments: ['image'] })).kind).toBe('pass');
    expect(planChatTurn('იგივე პერსონაჟით შემდეგი სცენა გააკეთე.', snap({ previous: { kind: 'video' } })).kind).not.toBe('open');
  });

  test('inside the Video tool the words are the tool\'s own prompt, not a step', () => {
    expect(planChatTurn('24-წამიანი მუსიკალური კლიპი გამიკეთე', snap({ mode: 'video' })).kind).toBe('pass');
  });

  test('clips and a track: the montage, never the Video tool', () => {
    expect(planChatTurn('შვიდი კლიპიდან გამოიყენე მხოლოდ ბოლო ხუთი', snap({ attachments: [...V7, A] })).kind).toBe('pass');
  });

  test('an attached video or document is material for the legacy flow: the Video tool never opens over it and drops it', () => {
    expect(planChatTurn('make a video from this script', snap({ locale: 'en', attachments: ['document'] })).kind).toBe('pass');
    expect(planChatTurn('make a video like this one', snap({ locale: 'en', attachments: [V] })).kind).toBe('pass');
    expect(planChatTurn('сделай видео как это', snap({ locale: 'ru', attachments: [V] })).kind).toBe('pass');
    // pictures (the board's references) and a track (kept for the soundtrack) still open it
    expect(planChatTurn('make a video about the sea', snap({ locale: 'en', attachments: [I] })).kind).toBe('open');
    expect(planChatTurn('24-წამიანი მუსიკალური კლიპი გამიკეთე', snap({ attachments: [A] })).kind).toBe('open');
  });
});
