import { HEARD_MAX, HEARD_TEXT_MAX, SPOKEN_PRICE_MAX_MS, TOLD_MAX, createVoiceLedger, creditAmounts } from './voiceLedger';

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

describe('creditAmounts: the prices a sentence names', () => {
  it.each([
    ["It'll cost you 5 credits. Shall we proceed?", [5]],
    ['That is 1 credit.', [1]],
    ['That will be four credits, ok?', [4]],
    ['ეს 5 კრედიტი ღირს. დავიწყო?', [5]],
    ['ხუთი კრედიტი დაჯდება', [5]],
    ['ეს 12 კრედიტიანია', [12]],
    ['Это будет стоить 4 кредита.', [4]],
    ['пять кредитов', [5]],
    ['A 4-credit image, or 8 credits in HD.', [4, 8]],
    ['5 credits now, 5 credits later', [5]],
    ['Your balance is 1.5 credits short', []],
    ['A car picture, red, at sunset.', []],
    ['credits', []],
  ])('%s → %j', (text, amounts) => {
    expect(creditAmounts(text)).toEqual(amounts);
  });

  it('never throws on what is not text', () => {
    expect(creditAmounts(undefined as unknown as string)).toEqual([]);
  });
});

describe('told: the price the model named itself, just before the card', () => {
  it('GG 2026-10-26 08:17Z: "It\'ll cost you 5 credits. Shall we proceed?" before the card → when it named 5', () => {
    const c = clockAt();
    const l = createVoiceLedger(c.now);
    l.tell({ text: 'A car picture.' });
    c.tick(300);
    l.tell({ text: "A car picture. It'll cost you 5 credits." }); // first named the price here
    c.tick(300);
    l.tell({ text: "A car picture. It'll cost you 5 credits. Shall we proceed?" });
    l.tell({ end: true });
    c.tick(2000);
    const card = c.now();
    expect(l.pricedAt!(5, card)).toBe(1300);
    expect(l.pricedAt!(4, card)).toBe(0); // the card's price is not the one said
  });

  it('only the newest price named before the card counts, and only when it names exactly one amount', () => {
    const c = clockAt();
    const l = createVoiceLedger(c.now);
    l.tell({ text: 'That is 5 credits.' });
    l.tell({ end: true });
    c.tick(1000);
    l.tell({ text: 'In HD it would be 8 credits.' });
    l.tell({ end: true });
    c.tick(1000);
    expect(l.pricedAt!(5, c.now())).toBe(0);
    expect(l.pricedAt!(8, c.now())).toBe(2000);
    l.tell({ text: '4 credits, or 8 credits in HD?' });
    l.tell({ end: true });
    c.tick(1000);
    expect(l.pricedAt!(8, c.now())).toBe(0);
  });

  it('words with no price in between do not hide it; a price said after the card is not before it', () => {
    const c = clockAt();
    const l = createVoiceLedger(c.now);
    l.tell({ text: 'It costs 2 credits. Go?' });
    l.tell({ end: true });
    c.tick(500);
    l.tell({ text: 'Great, preparing it now.' });
    l.tell({ end: true });
    c.tick(500);
    const card = c.now();
    c.tick(500);
    l.tell({ text: 'It is 2 credits.' }); // the model reading the card back, after it came
    expect(l.pricedAt!(2, card)).toBe(1000);
  });

  it('a price named longer ago than the window is not the one a yes just answered', () => {
    const c = clockAt();
    const l = createVoiceLedger(c.now);
    l.tell({ text: 'It costs 2 credits.' });
    l.tell({ end: true });
    c.tick(SPOKEN_PRICE_MAX_MS + 1);
    expect(l.pricedAt!(2, c.now())).toBe(0);
  });

  it('the open words count, nothing empty is kept, and only the last few are', () => {
    const c = clockAt();
    const l = createVoiceLedger(c.now);
    l.tell({ text: '   ' });
    l.tell({ end: true });
    l.tell({ text: 'Three credits.' });
    c.tick(100);
    expect(l.pricedAt!(3, c.now())).toBe(1000);
    l.tell({ end: true });
    for (let i = 0; i < TOLD_MAX; i += 1) { c.tick(10); l.tell({ text: `fine ${i}` }); l.tell({ end: true }); }
    c.tick(10);
    expect(l.pricedAt!(3, c.now())).toBe(0); // pushed out
  });
});
