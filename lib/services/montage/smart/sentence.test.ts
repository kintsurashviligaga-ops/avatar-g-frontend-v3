/**
 * Agent G's smart-edit sentence → timeline ops (Phase 8.7 PR C). GG's own sentence, in all three languages, first.
 */
import { parseSmartSentence } from './sentence';

const kinds = (s: string) => parseSmartSentence(s).ops.map((o) => o.op);

describe('parseSmartSentence', () => {
  it("GG's sentence in English, Georgian and Russian → pauses, beat, Georgian captions", () => {
    const en = parseSmartSentence('Take these 3 clips, cut the boring parts, add Georgian captions, and put the music on the beat');
    const ka = parseSmartSentence('აიღე ეს 3 კლიპი, ამოჭერი მოსაწყენი ადგილები, დაადე ქართული სუბტიტრები და მუსიკა რიტმზე დასვი');
    const ru = parseSmartSentence('Возьми эти 3 клипа, вырежи скучные места, добавь грузинские субтитры и поставь музыку в ритм');
    for (const r of [en, ka, ru]) {
      expect(r.matched).toBe(true);
      expect(r.ops).toEqual([
        { op: 'removeSilence', sensitivity: 'normal', fillers: true },
        { op: 'beatSync' },
        { op: 'captions', lang: 'ka', style: 'bold-word' },
      ]);
    }
  });

  it('captions default to the language the person wrote in', () => {
    expect(parseSmartSentence('დაადე სუბტიტრები').ops).toEqual([{ op: 'captions', lang: 'ka', style: 'bold-word' }]);
    expect(parseSmartSentence('добавь субтитры').ops).toEqual([{ op: 'captions', lang: 'ru', style: 'bold-word' }]);
    expect(parseSmartSentence('add captions').ops).toEqual([{ op: 'captions', lang: 'en', style: 'bold-word' }]);
    expect(parseSmartSentence('add English subtitles in karaoke style').ops).toEqual([{ op: 'captions', lang: 'en', style: 'karaoke' }]);
  });

  it('sensitivity, fillers and the AI pass only when said', () => {
    expect(parseSmartSentence('remove every pause, tight').ops[0]).toEqual({ op: 'removeSilence', sensitivity: 'tight', fillers: true });
    expect(parseSmartSentence('cut only the long pauses gently').ops[0]).toEqual({ op: 'removeSilence', sensitivity: 'low', fillers: true });
    expect(kinds('cut the boring parts with AI')).toEqual(['removeSilence', 'aiTrim']);
    expect(kinds('cut the boring parts')).toEqual(['removeSilence']);
  });

  it('templates, format and transitions ride along; alone they are not a smart edit', () => {
    expect(kinds('make it a TikTok with glitch transitions and captions')).toEqual(['template', 'transition', 'captions']);
    expect(parseSmartSentence('make it 16:9').matched).toBe(false);
    expect(parseSmartSentence('YouTube please').matched).toBe(false);
    expect(parseSmartSentence('what song is this?').matched).toBe(false);
    expect(parseSmartSentence('ეს რა სიმღერაა?').matched).toBe(false);
  });
});
