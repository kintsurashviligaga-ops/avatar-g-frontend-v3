import { HEARD_MAX, HEARD_TEXT_MAX, createVoiceLedger } from './voiceLedger';

const clockAt = (start = 1000) => {
  let t = start;
  return { now: () => t, tick: (ms: number) => { t += ms; } };
};

describe('heard: the user\'s own words, one utterance per exchange', () => {
  it('an utterance is timed by its first words, grows as the transcript streams, and closes at the exchange end', () => {
    const c = clockAt();
    const l = createVoiceLedger(c.now);
    expect(l.hear({ text: ' yes' })).toBe(' yes');
    c.tick(400);
    l.hear({ text: ' yes, go ahead' });
    expect(l.heard()).toEqual([{ text: ' yes, go ahead', at: 1000 }]);
    expect(l.hear({ end: true })).toBeNull();
    c.tick(100);
    l.hear({ text: 'wait' });
    expect(l.heard()).toEqual([{ text: ' yes, go ahead', at: 1000 }, { text: 'wait', at: 1500 }]);
  });

  it('empty words open nothing; an end with nothing open adds nothing; the log and each utterance are capped', () => {
    const l = createVoiceLedger(clockAt().now);
    l.hear({ text: '   ' });
    l.hear({ end: true });
    expect(l.heard()).toEqual([]);
    for (let i = 0; i < HEARD_MAX + 5; i++) { l.hear({ text: `u${i}` }); l.hear({ end: true }); }
    expect(l.heard()).toHaveLength(HEARD_MAX);
    expect(l.heard()[0]!.text).toBe('u5');
    l.hear({ text: 'x'.repeat(HEARD_TEXT_MAX + 50) });
    const last = l.heard();
    expect(last[last.length - 1]!.text).toHaveLength(HEARD_TEXT_MAX);
  });
});

describe('studio quote: when the price on screen was told', () => {
  it('a prepare always re-quotes; a screen read quotes only when none or the screen changed', () => {
    const c = clockAt();
    const l = createVoiceLedger(c.now);
    expect(l.studioQuote()).toEqual({ at: 0 });
    l.quoteStudio('A', false); // first read: quoted
    expect(l.studioQuote()).toEqual({ at: 1000, fingerprint: 'A' });
    c.tick(500);
    l.quoteStudio('A', false); // same screen: the earlier time stands (a yes said in between still counts)
    expect(l.studioQuote().at).toBe(1000);
    l.quoteStudio('B', false); // the screen changed: the new price is told now
    expect(l.studioQuote()).toEqual({ at: 1500, fingerprint: 'B' });
    c.tick(500);
    l.quoteStudio('B', true); // a fresh prepare
    expect(l.studioQuote().at).toBe(2000);
  });
});

describe('plans: Agent G\'s cards by number', () => {
  it('numbers plans in the order heard; re-registering keeps the number; told sets the time', () => {
    const c = clockAt();
    const l = createVoiceLedger(c.now);
    expect(l.registerPlan('m1', 'audio', 'MP3 of talk.mp4')).toBe(1);
    expect(l.registerPlan('m2', 'montage')).toBe(2);
    expect(l.registerPlan('m1', 'audio')).toBe(1);
    expect(l.plan(1)).toMatchObject({ id: 'm1', n: 1, at: 0, what: 'MP3 of talk.mp4' });
    c.tick(300);
    l.planTold('m1');
    expect(l.plan(1)!.at).toBe(1300);
    expect(l.plan()).toMatchObject({ id: 'm2' }); // the newest
    expect(l.plan(undefined, 'audio')).toMatchObject({ id: 'm1' }); // the newest MP3
    expect(l.plan(undefined, 'edit')).toBeNull();
    expect(l.plan(7)).toBeNull();
    l.planTold('nope'); // unknown: nothing happens
  });

  it('a status listing numbers new cards and tells the ones that wait for a yes (once)', () => {
    const c = clockAt();
    const l = createVoiceLedger(c.now);
    l.registerPlan('a', 'audio');
    l.planTold('a'); // told at 1000
    c.tick(1000);
    const seen = l.seePlans([
      { id: 'a', kind: 'audio', quoted: true },
      { id: 'b', kind: 'edit', quoted: true, what: 'trim 0:05–0:20' },
      { id: 'c', kind: 'montage', quoted: false },
    ]);
    expect(seen.map((p) => [p.id, p.n, p.at])).toEqual([['a', 1, 1000], ['b', 2, 2000], ['c', 3, 0]]);
  });
});
