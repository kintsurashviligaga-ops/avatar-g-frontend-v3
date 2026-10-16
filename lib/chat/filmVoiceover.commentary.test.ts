/**
 * A brief that says a character speaks is not a request for a narrator. Video Core certification 2026-10-15: an English
 * brief with "speaks"/"dialogue" routed the typed character line to an off-screen narrator (wantsCommentary → the
 * narrationAsDialogue path in filmComposite was skipped), while the same brief in Georgian worked.
 */
jest.mock('server-only', () => ({}));
jest.mock('../ai/llmText', () => ({ llmText: jest.fn(async () => null) }));
jest.mock('../orchestrator/storage-adapter', () => ({ uploadAndSign: jest.fn() }));
import { wantsCommentary } from './filmVoiceover';

describe('wantsCommentary', () => {
  it.each([
    'A 9:16 advert: an actor on black speaks to camera and presents the MyAvatar.ge chat.',
    'Two scenes with dialogue between a mother and her son in the kitchen.',
    'The presenter delivers the spoken lines with confident gestures.',
    'შექმენი სარეკლამო ვიდეო: მსახიობი ლაპარაკობს და პრეზენტაციას აკეთებს.',
    'Актёр говорит в камеру на чёрном фоне.',
  ])('a character talking on screen is not a narrator: %s', (brief) => {
    expect(wantsCommentary(brief)).toBe(false);
  });

  it.each([
    'A football highlight with a sports commentator.',
    'A nature film with voice-over narration.',
    'A cinematic film (with professional spoken voice-over narration)',
    'ფილმი დიქტორის ხმით',
    ' (პროფესიონალი კომენტატორის ხმოვანი ნარაციით)',
    'Фильм с закадровой озвучкой диктора.',
  ])('an explicit narrator still asks for one: %s', (brief) => {
    expect(wantsCommentary(brief)).toBe(true);
  });
});
