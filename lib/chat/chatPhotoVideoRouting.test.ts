/**
 * ROUTING CONTRACT — a PHOTO + a named video deliverable in chat must START the film, not chat about it.
 *
 * THE BUG (live, from a real run): the user attached his photo and wrote a Georgian film brief. The chat→Video
 * route required isGenerativeCommand(), which demands the message LEAD with a generate verb ("შემიქმენი…",
 * "create…"). A DESCRIPTIVE brief ("this is my photo — I want a 24-second blockbuster trailer…") fails that
 * gate, so it fell through to plain chat and the model merely REPLIED "I'll hand this to the Video Studio
 * agent and start generating now" while nothing ran. The user then had to switch service by hand.
 *
 * The fix pairs an attached IMAGE with a plain noun check (no verb requirement). Both signals are required,
 * so ordinary chat that merely mentions video is never hijacked.
 */
import { isGenerativeCommand } from './intentDetector';

/** Mirrors mentionsVideoDeliverable() in components/studio/OmniStudio.tsx. */
function mentionsVideoDeliverable(s: string): boolean {
  const b = (s || '').toLowerCase();
  return /\b(video|film|movie|clip|trailer|reel|footage)\b/.test(b)
    || /ვიდეო|ფილმ|კლიპ|ტრეილერ|რგოლ|მოკლემეტრაჟ/.test(s || '')
    || /видео|фильм|клип|трейлер|ролик/.test(b);
}

/** The shipped gate: an attached image + a named deliverable routes to the Video Studio. */
const routesToVideo = (text: string, hasImage: boolean) => hasImage && mentionsVideoDeliverable(text);

describe('chat photo + video brief → Video Studio', () => {
  const BRIEFS = [
    'ეს ჩემი ფოტოა — მინდა 24-წამიანი ბლოკბასტერის ტრეილერი',
    'photo attached — a 24 second blockbuster style trailer',
    'сделай из этого фото клип',
    'мой снимок — нужен короткий фильм',
    'here is me, I want a short film about the sea',
  ];

  it('THE REGRESSION: descriptive briefs fail the lead-verb gate but MUST still route with a photo', () => {
    for (const b of BRIEFS.slice(0, 2)) {
      expect(isGenerativeCommand(b)).toBe(false); // why it used to fall through to plain chat …
      expect(routesToVideo(b, true)).toBe(true);  // … and why it now starts the film
    }
  });

  it('routes every locale’s brief when a photo is attached', () => {
    for (const b of BRIEFS) expect(routesToVideo(b, true)).toBe(true);
  });

  it('still routes the imperative phrasings that already worked', () => {
    for (const b of ['შემიქმენი ვიდეო ზღვაზე', 'create a video of the ocean', 'сделай видео про море']) {
      expect(routesToVideo(b, true)).toBe(true);
    }
  });

  it('does NOT hijack chat that merely mentions video with no photo attached', () => {
    expect(routesToVideo('what video formats do you support?', false)).toBe(false);
    expect(routesToVideo('რა ვიდეო ფორმატები გაქვს?', false)).toBe(false);
  });

  it('does NOT hijack a photo question that never names a video deliverable', () => {
    expect(routesToVideo('what is in this photo?', true)).toBe(false);
    expect(routesToVideo('გააკეთე ფოტოს ანალიზი', true)).toBe(false);
    expect(routesToVideo('make this brighter', true)).toBe(false); // → stays an image edit
  });
});
