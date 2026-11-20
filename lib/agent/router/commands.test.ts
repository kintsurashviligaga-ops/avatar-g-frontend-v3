import { commandOf, creditsReply, undoAction, undoReply } from './commands';
import { commandStep, planChatTurn, type ChatSnapshot } from '../chatTurn';
import { classifyAgentIntent } from '../intent';

const snap = (over: Partial<ChatSnapshot> = {}): ChatSnapshot => ({
  mode: 'chat', locale: 'ka', attachments: [], cards: [], jobs: [], foreground: null, lastTruncated: false, lastRedoable: false,
  pendingMontageId: null, previous: null, montageOn: false, audioOn: false, ...over,
});

describe('commandOf', () => {
  it.each([
    'რამდენი კრედიტი მაქვს?', 'ჩემი ბალანსი', 'მაჩვენე ჩემი კრედიტები', 'show me my credits', 'what is my balance?', 'сколько у меня кредитов?', 'мой баланс',
  ])('„%s" → credits', (t) => expect(commandOf(t)).toBe('credits'));

  it.each([
    'undo', 'undo my last action', 'გააუქმე ბოლო მოქმედება', 'დააბრუნე როგორც იყო', 'წინა ვერსია დააბრუნე', 'отмени последнее действие', 'верни как было',
  ])('„%s" → undo', (t) => expect(commandOf(t)).toBe('undo'));

  it.each([
    'რა ღირს ვიდეო კრედიტებში?', 'how much does a video cost in credits?', 'buy credits', 'კრედიტები შევიძინო', 'сколько стоит видео в кредитах',
    'გააუქმე', 'stop', 'დამიხატე კატა', 'write a long essay about the history of credit cards in Georgia and in Europe please',
  ])('„%s" → not a command', (t) => expect(commandOf(t)).toBeNull());

  it('main reads these as a question / chat (the gap this closes)', () => {
    expect(classifyAgentIntent({ text: 'რამდენი კრედიტი მაქვს?' }).kind).toBe('question');
    expect(classifyAgentIntent({ text: 'გააუქმე ბოლო მოქმედება' }).kind).toBe('chat');
    // „გააუქმე" alone stays the existing STOP.
    expect(classifyAgentIntent({ text: 'გააუქმე' })).toMatchObject({ kind: 'control', op: 'stop' });
  });
});

describe('replies', () => {
  it('credits: the chip\'s number, never a guess', () => {
    expect(creditsReply(42, 'ka')).toBe('შენი ბალანსი: ✦42 კრედიტი. არაფერი ჩამოიჭრება, სანამ ფასს არ დაეთანხმები.');
    expect(creditsReply(3, 'ka')).toContain('ცოტა დარჩა');
    expect(creditsReply(null, 'ka')).toContain('ვერ ვხედავ');
    expect(creditsReply(undefined, 'en')).not.toMatch(/\d/);
  });

  it('undo drops a waiting plan; otherwise it only explains', () => {
    expect(undoAction({ waitingPlans: 1, running: 0, hasResult: false })).toBe('drop-plans');
    expect(undoAction({ waitingPlans: 0, running: 2, hasResult: true })).toBe('explain');
    const t = undoReply({ waitingPlans: 0, running: 1, hasResult: true }, 'ka');
    expect(t).toContain('„შეწყვიტე“');
    expect(t).toContain('ბიბლიოთეკაში რჩება');
    expect(undoReply({ waitingPlans: 0, running: 0, hasResult: false }, 'ka')).toMatch(/^ამ საუბარში გასაუქმებელი არაფერია/);
  });
});

describe('commandStep in planChatTurn', () => {
  it('flag OFF: main behaviour', () => {
    expect(commandStep('რამდენი კრედიტი მაქვს?', snap({ balance: 50 }))).toBeNull();
    expect(planChatTurn('რამდენი კრედიტი მაქვს?', snap({ balance: 50 })).kind).toBe('pass');
  });

  it('flag ON: credits answered from the snapshot', () => {
    expect(planChatTurn('რამდენი კრედიტი მაქვს?', snap({ commandsOn: true, balance: 50 }))).toMatchObject({ kind: 'say', text: expect.stringContaining('✦50') });
  });

  it('flag ON: undo drops ONLY the newest waiting plan, never a running card or a tray job', () => {
    const s = snap({
      commandsOn: true,
      cards: [
        { id: 'a', kind: 'montage', phase: 'quoted' },
        { id: 'b', kind: 'edit', phase: 'running' },
        { id: 'c', kind: 'audio', phase: 'quoted' },
      ],
      jobs: [{ id: 'j', kind: 'video', status: 'rendering' }] as ChatSnapshot['jobs'],
    });
    expect(planChatTurn('undo', s)).toMatchObject({ kind: 'stop', cards: ['c'], jobs: [], durable: [], foreground: false });
  });

  it('flag ON: undo with nothing waiting explains and stops nothing', () => {
    const step = planChatTurn('გააუქმე ბოლო მოქმედება', snap({ commandsOn: true, previous: { kind: 'image' } }));
    expect(step.kind).toBe('say');
  });

  it('a message with files is never a command', () => {
    expect(commandStep('undo', snap({ commandsOn: true, attachments: ['video'] }))).toBeNull();
  });
});
