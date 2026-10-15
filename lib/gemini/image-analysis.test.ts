/** @jest-environment node */
jest.mock('./client', () => ({ generateWithGemini: jest.fn() }));
jest.mock('./prompts', () => ({ getGeminiSystemPrompt: jest.fn(() => '') }));
jest.mock('../security/allowlistedAudioFetch', () => ({
  isOwnSupabaseUrl: jest.fn(() => true),
  fetchAllowlistedAudio: jest.fn(async () => ({ headers: new Headers({ 'content-type': 'image/jpeg' }) })),
  readBodyWithCap: jest.fn(async () => Buffer.alloc(1024, 1)),
}));

import { generateWithGemini } from './client';
import { characterIdPrompt, describeCharacterFromImage } from './image-analysis';

const gem = generateWithGemini as jest.MockedFunction<typeof generateWithGemini>;

// The ad brief of 2026-10-15 16:49Z: a selfie taken on a street at night, a film set on a black background.
const AD_BRIEF = 'შექმენი 9:16 ფორმატის სარეკლამო ვიდეო სადაც მსახიობი შავ ფონზე შავ მაისურში და შავ პიჯაკში ლაპარაკობს';

describe('characterIdPrompt', () => {
  it('never asks for the photo\'s background, place or light', () => {
    for (const p of [characterIdPrompt(), characterIdPrompt(AD_BRIEF)]) {
      expect(p).toMatch(/never the background, the place, the time of day or the lighting of the photo/);
      expect(p).not.toMatch(/immediate setting/);
      expect(p).not.toMatch(/standing in a mountain landscape/);
    }
  });

  it('takes the clothing from the brief when there is one, else from the photo', () => {
    const withBrief = characterIdPrompt(AD_BRIEF);
    expect(withBrief).toMatch(/if the film brief below says what this person wears, describe THAT clothing/);
    expect(withBrief).toContain(AD_BRIEF);
    expect(characterIdPrompt()).toMatch(/describe the clothing in the photo/);
    expect(characterIdPrompt()).not.toMatch(/Film brief/);
  });

  it('hands over a bounded, one-line brief without breaking its own quotes', () => {
    const p = characterIdPrompt(`he says "hi"\n\n${'x'.repeat(5000)}`);
    const quoted = /Film brief \(any language; read it only for the clothing\): "([^"]*)"$/.exec(p);
    expect(quoted).not.toBeNull();
    expect(quoted![1]!.length).toBe(1200);
    expect(quoted![1]!.startsWith("he says 'hi' x")).toBe(true);
  });
});

describe('describeCharacterFromImage', () => {
  beforeEach(() => gem.mockReset());

  it('sends the brief-aware instruction with the photo and returns the one-line description', async () => {
    gem.mockResolvedValueOnce({ text: '"a man in his 30s with short dark hair and stubble, wearing a black t-shirt under a black jacket"' } as never);
    const out = await describeCharacterFromImage('https://x.supabase.co/storage/v1/object/sign/uploads/a.jpg', 'ka', AD_BRIEF);
    expect(out).toBe('a man in his 30s with short dark hair and stubble, wearing a black t-shirt under a black jacket');
    const call = gem.mock.calls[0]![0] as { prompt: string; attachments: Array<{ type: string }> };
    expect(call.prompt).toBe(characterIdPrompt(AD_BRIEF));
    expect(call.attachments[0]!.type).toBe('image');
  });

  it('a miss is null, never an exception', async () => {
    gem.mockRejectedValueOnce(new Error('boom'));
    await expect(describeCharacterFromImage('https://x.supabase.co/a.jpg', 'en')).resolves.toBeNull();
  });
});
