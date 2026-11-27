/**
 * Phase 8.10 (flag NEXT_PUBLIC_CHAT_PIN_GOAL): trimming must never forget the thread's core goal.
 */
import { serializeHistory, wireToHistory, PINNED_GOAL_CHARS, type HistoryMsg } from './historySerializer';

const GOAL = 'ჩემი კაფესთვის „მზე" ვამზადებ კამპანიას: 3 სურათი, 1 ვიდეო და ტექსტი Instagram-ისთვის. სტილი თბილი, ყვითელი.';
const long = (i: number) => `ნაბიჯი ${i}: ${'ა'.repeat(900)}`;

function thread(turns: number): HistoryMsg[] {
  const out: HistoryMsg[] = [{ role: 'user', text: GOAL }, { role: 'assistant', text: 'კარგი, დავიწყოთ სურათებით.' }];
  for (let i = 1; i < turns; i++) out.push({ role: 'user', text: long(i) }, { role: 'assistant', text: long(i) });
  out.push({ role: 'user', text: 'ახლა ვიდეო' });
  return out;
}

describe('pinGoal', () => {
  it('main behaviour (off): a long thread drops the opening ask', () => {
    const wire = serializeHistory(thread(40), { maxChars: 10_000 });
    expect(JSON.stringify(wire)).not.toContain('კამპანიას');
  });

  it('on: the opening ask is kept as the first turn, then a one-char model turn, then the newest suffix', () => {
    const wire = serializeHistory(thread(40), { maxChars: 10_000, pinGoal: true });
    expect(wire[0]).toEqual({ role: 'user', content: GOAL });
    expect(wire[1]).toEqual({ role: 'assistant', content: '…' });
    expect(wire[2]!.role).toBe('user');
    expect(wire[wire.length - 1]).toEqual({ role: 'user', content: 'ახლა ვიდეო' });
    // roles still alternate
    wire.forEach((t, i) => expect(t.role).toBe(i % 2 === 0 ? 'user' : 'assistant'));
    // the pin's cost is inside the budget
    const size = wire.reduce((n, t) => n + JSON.stringify(t.content).length, 0);
    expect(size).toBeLessThan(10_000 + 2_000);
  });

  it('on, nothing trimmed: identical to off (no duplicate goal)', () => {
    const short = thread(3);
    expect(serializeHistory(short, { pinGoal: true })).toEqual(serializeHistory(short));
  });

  it('a one-turn thread is unchanged', () => {
    const one: HistoryMsg[] = [{ role: 'user', text: GOAL }];
    expect(serializeHistory(one, { maxChars: 10, pinGoal: true })).toEqual([{ role: 'user', content: GOAL }]);
  });

  it('a huge opening ask is capped, and its media are not re-sent', () => {
    const big = 'გ'.repeat(PINNED_GOAL_CHARS * 3);
    const msgs: HistoryMsg[] = [
      { role: 'user', text: big, medias: [{ kind: 'image', dataUrl: 'data:image/png;base64,AAAA', mimeType: 'image/png' }] },
      ...thread(40).slice(1),
    ];
    const wire = serializeHistory(msgs, { maxChars: 10_000, pinGoal: true });
    expect(typeof wire[0]!.content).toBe('string');
    expect((wire[0]!.content as string).length).toBe(PINNED_GOAL_CHARS + 1);
    expect(JSON.stringify(wire[0])).not.toContain('base64');
  });

  it('an opening turn with no text (a bare photo) pins nothing', () => {
    const msgs: HistoryMsg[] = [
      { role: 'user', text: '', medias: [{ kind: 'image', url: 'https://x.example/a.png' }] },
      ...thread(40).slice(1),
    ];
    const wire = serializeHistory(msgs, { maxChars: 10_000, pinGoal: true });
    expect(wire[1]?.content).not.toBe('…');
  });

  it('the server re-run over the browser payload keeps the pin and adds no second one', () => {
    const browser = serializeHistory(thread(40), { maxChars: 10_000, pinGoal: true });
    const server = serializeHistory(wireToHistory(browser), { maxChars: 10_000, pinGoal: true });
    expect(server).toEqual(browser);
    // and a server with a smaller budget still pins the same goal
    const tight = serializeHistory(wireToHistory(browser), { maxChars: 4_000, pinGoal: true });
    expect(tight[0]).toEqual({ role: 'user', content: GOAL });
  });
});
