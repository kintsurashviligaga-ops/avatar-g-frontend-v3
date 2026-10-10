/** @jest-environment node */
/**
 * One message read against the screen (lib/agent/chatTurn): the 13 sentences of the Master Task as the studio meets them,
 * with cards, tray jobs and a reply in flight. Nothing here runs or charges; the step says what the studio does.
 */
import { planChatTurn, wordsAreForChat, workOf, type ChatSnapshot, type ThreadCard, type TrayJob } from './chatTurn';

const base: ChatSnapshot = {
  mode: 'chat', locale: 'ka', attachments: [], cards: [], jobs: [], foreground: null,
  lastTruncated: false, lastRedoable: false, pendingMontageId: null, previous: null, montageOn: true, audioOn: true,
};
const snap = (over: Partial<ChatSnapshot> = {}): ChatSnapshot => ({ ...base, ...over });
const montage = (phase: string, over: Partial<ThreadCard> = {}): ThreadCard => ({ id: `m-${phase}`, kind: 'montage', phase, ...over });
const audio = (phase: string, over: Partial<ThreadCard> = {}): ThreadCard => ({ id: `a-${phase}`, kind: 'audio', phase, ...over });
const job = (status: string, over: Partial<TrayJob> = {}): TrayJob => ({ id: `j-${status}`, kind: 'image', label: 'Poster', status, ...over });

describe('„სამუშაო შეწყვიტე" (stop)', () => {
  test('stops running cards, drops waiting plans, cancels tray jobs and the reply in flight, and says so', () => {
    const s = snap({
      cards: [montage('running', { stage: 'Cutting', pct: 40 }), audio('quoted'), montage('done', { id: 'old' })],
      jobs: [job('rendering'), job('queued', { id: 'q2', kind: 'music', label: '' }), job('done', { id: 'fin' })],
      foreground: 'reply',
    });
    const step = planChatTurn('სამუშაო შეწყვიტე.', s);
    expect(step.kind).toBe('stop');
    if (step.kind !== 'stop') return;
    expect(step.cards).toEqual(['m-running', 'a-quoted']);
    expect(step.jobs).toEqual(['j-rendering', 'q2']);
    expect(step.durable).toEqual([]);
    expect(step.foreground).toBe(true);
    expect(step.text).toBe('⏹ გავაჩერე: მონტაჟი, MP3-ის ამოღება, Poster, მუსიკა, პასუხი.');
  });

  test('a card already stopping is not stopped twice; a server job is stopped only when it can be, and only then listed', () => {
    const s = snap({
      cards: [montage('running', { stopping: true })],
      jobs: [job('rendering', { id: 'd1', durable: true, cancellable: true }), job('rendering', { id: 'd2', durable: true, cancellable: false, label: 'Film' })],
    });
    const step = planChatTurn('stop', s);
    if (step.kind !== 'stop') throw new Error(step.kind);
    expect(step.cards).toEqual([]);
    expect(step.durable).toEqual(['d1']);
    expect(step.text).toBe('⏹ Stopped: Poster.');
  });

  test('nothing running: says so, stops nothing', () => {
    const step = planChatTurn('стоп', snap());
    if (step.kind !== 'stop') throw new Error(step.kind);
    expect(step).toMatchObject({ cards: [], jobs: [], durable: [], foreground: false });
    expect(step.text).toMatch(/ничего не выполняется/);
  });

  test('a stop works in a focus tool too, and never reaches the tool as a prompt', () => {
    expect(planChatTurn('გააჩერე', snap({ mode: 'image' })).kind).toBe('stop');
    expect(planChatTurn('stop', snap({ mode: 'video' })).kind).toBe('stop');
  });
});

describe('„სადამდე მიხვედი?" (status)', () => {
  test('lists each card, job and reply with its step and percent', () => {
    const s = snap({ cards: [montage('running', { stage: 'ბითზე ვჭრი', pct: 62 }), audio('quoted')], jobs: [job('queued')], foreground: 'reply' });
    const step = planChatTurn('სადამდე მიხვედი?', s);
    expect(step).toMatchObject({ kind: 'say' });
    if (step.kind !== 'say') return;
    expect(step.text).toBe('ახლა მუშაობს:\n• მონტაჟი — ბითზე ვჭრი · 62%\n• MP3-ის ამოღება — გეგმა შენს „დაწყებას“ ელოდება\n• Poster — რიგშია\n• პასუხი — მიმდინარეობს');
  });

  test('is a question about the work, never a paid generation, in any tool', () => {
    for (const mode of ['chat', 'image', 'music']) {
      const step = planChatTurn('how far along are you?', snap({ mode }));
      expect(step.kind).toBe('say');
    }
  });

  test('finished cards and jobs are not running', () => {
    expect(workOf(snap({ cards: [montage('done'), audio('failed')], jobs: [job('done'), job('canceled')] }))).toEqual([]);
  });
});

describe('„შენი წინა ნაბიჯიდან გააგრძელე" (continue)', () => {
  const T = 'შენი წინა ნაბიჯიდან გააგრძელე.';
  test('a cut-off reply continues the stream', () => {
    expect(planChatTurn(T, snap({ lastTruncated: true })).kind).toBe('continue-stream');
  });
  test('a plan waiting for Start says so; nothing starts on its own', () => {
    const step = planChatTurn(T, snap({ cards: [montage('quoted')] }));
    expect(step.kind).toBe('say');
    if (step.kind === 'say') expect(step.text).toMatch(/დაწყებას/);
  });
  test('work still running says it has not stopped', () => {
    const step = planChatTurn('continue', snap({ jobs: [job('rendering')] }));
    if (step.kind !== 'say') throw new Error(step.kind);
    expect(step.text).toMatch(/still working/);
  });
  test('a stopped or failed Agent G card is asked again (a fresh plan; Start still decides)', () => {
    expect(planChatTurn(T, snap({ lastRedoable: true, cards: [montage('cancelled')] })).kind).toBe('redo');
  });
  test('nothing to pick up: the chat model carries the conversation on; a focus tool says so', () => {
    expect(planChatTurn('continue', snap()).kind).toBe('pass');
    const step = planChatTurn('continue', snap({ mode: 'image' }));
    if (step.kind !== 'say') throw new Error(step.kind);
    expect(step.text).toMatch(/no stopped work/);
  });
});

describe('a change to the montage plan on screen', () => {
  const card = montage('quoted', { id: 'card-1', prompt: 'ამ სამი ვიდეოდან მუსიკალური კლიპი გამიკეთე' });
  test('„მუსიკა 5 წამიდან დაიწყე" re-quotes it from its own words plus the change', () => {
    const step = planChatTurn('მუსიკა 5 წამიდან დაიწყე.', snap({ cards: [card], pendingMontageId: 'card-1' }));
    expect(step).toMatchObject({ kind: 'requote', cardId: 'card-1', prompt: 'ამ სამი ვიდეოდან მუსიკალური კლიპი გამიკეთე\nმუსიკა 5 წამიდან დაიწყე.' });
  });
  test('„ვიდეო 9:16-ზე გადაიყვანე" with the plan on screen changes the plan\'s frame', () => {
    expect(planChatTurn('ვიდეო 9:16-ზე გადაიყვანე.', snap({ cards: [card], pendingMontageId: 'card-1' })).kind).toBe('requote');
  });
  test('with no plan on screen the same words are not a re-quote', () => {
    expect(planChatTurn('მუსიკა 5 წამიდან დაიწყე.', snap({ cards: [card] })).kind).not.toBe('requote');
  });
  test('with the montage route closed, nothing is taken over', () => {
    expect(planChatTurn('მუსიკა 5 წამიდან დაიწყე.', snap({ cards: [card], pendingMontageId: 'card-1', montageOn: false })).kind).not.toBe('requote');
  });
  test('a question about the plan is not a change', () => {
    expect(planChatTurn('რამდენი ღირს 9:16?', snap({ cards: [card], pendingMontageId: 'card-1' })).kind).toBe('pass');
  });
});

describe('the other sentences', () => {
  test('clips without a track: Agent G asks for it', () => {
    const step = planChatTurn('ამ სამი ვიდეოდან მუსიკალური კლიპი გამიკეთე.', snap({ attachments: ['video', 'video', 'video'] }));
    expect(step.kind).toBe('say');
    if (step.kind === 'say') expect(step.text).toMatch(/მუსიკა აკლია/);
  });
  test('clips and a track go on to the montage card', () => {
    expect(planChatTurn('ამ სამი ვიდეოდან მუსიკალური კლიპი გამიკეთე.', snap({ attachments: ['video', 'video', 'video', 'audio'] })).kind).toBe('pass');
  });
  test('„ამ ვიდეოდან ამოიღე ხმა MP3-ად" with a video goes on to the MP3 card; with nothing, Agent G asks for the source', () => {
    expect(planChatTurn('ამ ვიდეოდან ამოიღე ხმა MP3-ად.', snap({ attachments: ['video'] })).kind).toBe('pass');
    expect(planChatTurn('ამ ვიდეოდან ამოიღე ხმა MP3-ად.', snap()).kind).toBe('say');
  });
  test('„გააკეთე 20-წამიანი რეკლამა", „ეს ფოტო გააცოცხლე" (with a photo), „ეს ვიდეო რუსულად გაახმოვანე" go on to their doors', () => {
    expect(planChatTurn('გააკეთე 20-წამიანი რეკლამა.', snap()).kind).toBe('pass');
    expect(planChatTurn('ეს ფოტო გააცოცხლე.', snap({ attachments: ['image'] })).kind).toBe('pass');
    expect(planChatTurn('ეს ვიდეო რუსულად გაახმოვანე.', snap({ attachments: ['video'] })).kind).toBe('pass');
  });
  test('„სუბტიტრები დაამატე" with no video asks for it; „წინა შედეგს ფერები შეუცვალე" says plainly it cannot yet', () => {
    expect(planChatTurn('სუბტიტრები დაამატე.', snap()).kind).toBe('say');
    const step = planChatTurn('წინა შედეგს ფერები შეუცვალე.', snap({ previous: { kind: 'image' } }));
    if (step.kind !== 'say') throw new Error(step.kind);
    expect(step.text).toMatch(/ახალს არ შევქმნი/);
  });
  test('„იგივე პერსონაჟით შემდეგი სცენა გააკეთე" after a video goes on; with no result, asks for the character', () => {
    expect(planChatTurn('იგივე პერსონაჟით შემდეგი სცენა გააკეთე.', snap({ previous: { kind: 'image' }, attachments: ['image'] })).kind).toBe('pass');
    const step = planChatTurn('იგივე პერსონაჟით შემდეგი სცენა გააკეთე.', snap());
    expect(step.kind).toBe('say');
  });
  test('talk, questions and feedback go on to the chat, never to a tool', () => {
    for (const t of ['გამარჯობა', 'რა ღირს ვიდეო?', 'არ მომწონს']) {
      expect(planChatTurn(t, snap({ mode: 'image' })).kind).toBe('pass');
    }
  });
});

describe('wordsAreForChat: a spend-at-once tool never runs on talk', () => {
  test.each([
    ['რა ღირს?', true], ['გამარჯობა', true], ['არ მომწონს', true], ['stop', true], ['how far along?', true],
    ['Summer sale: 50% off everything', false], ['ზაფხულის ფასდაკლება', false], ['', false],
  ])('%s → %s', (text, forChat) => {
    expect(wordsAreForChat(text, 'video', 'ka')).toBe(forChat);
  });
});

test('an ask keeps the words and files in the composer; other notes do not', () => {
  const ask = planChatTurn('ამ სამი ვიდეოდან მუსიკალური კლიპი გამიკეთე.', snap({ attachments: ['video', 'video'] }));
  expect(ask).toMatchObject({ kind: 'say', keepComposer: true });
  const status = planChatTurn('სადამდე მიხვედი?', snap());
  expect(status).toMatchObject({ kind: 'say' });
  expect((status as { keepComposer?: boolean }).keepComposer).toBeUndefined();
});
