/** Agent G's smart edit in the chat (Phase 8.7 PR C): which turns are a smart edit, and the answer with its prices. */
import { smartEditAsk, smartEditPlanText } from './smartEditChat';

describe('smartEditAsk', () => {
  it("GG's sentence with clips and a song is a smart edit", () => {
    const ops = smartEditAsk('აიღე ეს 3 კლიპი, ამოჭერი მოსაწყენი ადგილები, დაადე ქართული სუბტიტრები და მუსიკა რიტმზე დასვი', ['video', 'video', 'video', 'audio']);
    expect(ops?.map((o) => o.op)).toEqual(['removeSilence', 'beatSync', 'captions']);
  });
  it('not without a video, not for words with no edit in them, and „on the beat" alone stays Agent G\'s montage', () => {
    expect(smartEditAsk('add Georgian captions', ['image', 'image'])).toBeNull();
    expect(smartEditAsk('what is in these clips?', ['video', 'video'])).toBeNull();
    expect(smartEditAsk('cut these to the beat', ['video', 'video', 'audio'])).toBeNull();
  });
});

describe('smartEditPlanText', () => {
  it('says what is free, what the captions cost and that nothing is charged before the tap', () => {
    const ops = smartEditAsk('cut the boring parts with AI, add Georgian captions and put the music on the beat', ['video', 'audio'])!;
    const en = smartEditPlanText(ops, 'en', true);
    expect(en).toContain('Cut the pauses');
    expect(en).toContain('not built yet');
    expect(en).toContain('Lay the clips on the music’s beat — free');
    expect(en).toContain('Georgian captions — ✦2 per started minute');
    expect(en).toContain('nothing is charged until you tap');
    expect(smartEditPlanText(ops, 'en', false)).toContain('No song came with it');
    expect(smartEditPlanText(ops, 'ka', true)).toContain('ქართული სუბტიტრები — ✦2');
    expect(smartEditPlanText(ops, 'ru', true)).toContain('бесплатно');
  });
});
