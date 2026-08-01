/**
 * WHAT A TYPED SENTENCE ACTUALLY DOES — the composer's routing, asserted end to end.
 *
 * ⚠️ WHY THIS FILE EXISTS. The chat is the product; every service is supposed to be reachable by
 * typing at it. Three separate modules decide that, and each was unit-tested in isolation against
 * sentences its own author chose — so every part passed while the COMPOSITION was broken. Running the
 * real detectors over the sentences a Georgian or Russian user actually types found six live failures,
 * including "all Russian generation" and "the single most common Georgian imperative".
 *
 * So these tests assert the COMPOSED verdict — the lane the user lands in — not any one regex.
 * `route()` below mirrors OmniStudio's send() precedence exactly; if that precedence ever changes,
 * change it here in one place and every case re-checks itself.
 *
 * ⚠️ NON-LATIN COVERAGE IS THE POINT, NOT A BONUS. This product's primary language is Georgian and it
 * ships a Russian locale. A case list that is 90% English will pass while the product is unusable,
 * which is exactly what happened. Every capability below is asserted in KA and RU as well as EN.
 */
import { detectIntent, isGenerativeCommand, resolveGenerativeLane } from './intentDetector';
import { detectStudioIntent } from './studioIntent';

/** Where a sentence ends up. `chat` means the plain conversational stream. */
type Lane =
  | 'image' | 'video' | 'music' | 'avatar'
  | 'dubbing' | 'presentation' | 'model3d' | 'montage'
  | 'chat';

/**
 * The composer's real precedence, from components/studio/OmniStudio.tsx send():
 *   1. detectStudioIntent  — UNGATED (line ~4331), returns early when it matches.
 *   2. isGenerativeCommand — the imperative allowlist that guards paid auto-dispatch.
 *   3. detectIntent        — consulted ONLY behind that gate, and only at confidence >= 0.7.
 * Anything that falls off the end is the plain text stream.
 */
function route(text: string): Lane {
  const studio = detectStudioIntent(text);
  if (studio) return studio.service as Lane;
  if (!isGenerativeCommand(text)) return 'chat';
  // Mirrors the dispatch exactly: resolveGenerativeLane owns the confidence check AND the default, so a
  // recognised imperative can never fall through to prose. See lib/chat/intentDetector.ts.
  const lane = resolveGenerativeLane(text, detectIntent(text));
  if (lane === 'image_generation') return 'image';
  if (lane === 'video_generation') return 'video';
  if (lane === 'music_generation') return 'music';
  if (lane === 'avatar_generation') return 'avatar';
  return 'chat';
}

describe('image', () => {
  it.each([
    // ⚠️ REGRESSION: no English draw/paint/sketch pattern existed at all — the image bank required a
    // media NOUN ("image"/"poster"/"banner"), so the most canonical request in the language went to chat.
    ['draw me a cat on the moon'],
    ['paint a sunset over the mountains'],
    ['sketch a logo for a coffee shop'],
    ['generate an image of a tiger'],
    ['make me a poster for a concert'],
    // ⚠️ REGRESSION: `დამიხატე` (draw for me) was missed — the bare-verb pattern only had `დახატ`, and
    // the noun-bearing pattern needs a media noun, which "კატა" (cat) is not.
    ['დამიხატე ლამაზი კატა'],
    ['დახატე მთები'],
    ['გამიკეთე სურათი მთებზე'],
    // ⚠️ REGRESSION: every Russian command failed the imperative gate — `\b` is ASCII-only, so it never
    // matches after a Cyrillic verb. Russian users could not generate anything by typing.
    ['нарисуй кота'],
    ['создай изображение тигра'],
  ])('routes to image: %s', (text) => {
    expect(route(text)).toBe('image');
  });
});

describe('video', () => {
  it.each([
    ['make a video of a sunset'],
    ['გამიკეთე ვიდეო ზღვაზე'],
    ['сделай видео про море'],
    ['создай ролик для рекламы'],
  ])('routes to video: %s', (text) => {
    expect(route(text)).toBe('video');
  });
});

describe('music', () => {
  it.each([
    ['make me a lofi beat'],
    ['გამიკეთე მუსიკა'],
    ['დამიწერე სიმღერა სიყვარულზე'],
    // ⚠️ REGRESSION: "write" is how people ask for a song, and the music bank held only
    // generate/create/make/compose — so the phrasing got a conversational reply about songwriting.
    ['write me a song about love'],
    ['write a song about the sea'],
    ['сделай трек в стиле лофай'],
    ['сочини музыку для видео'],
  ])('routes to music: %s', (text) => {
    expect(route(text)).toBe('music');
  });
});

describe('avatar / lip-sync', () => {
  it.each([
    ['make me a talking avatar'],
    ['გამიკეთე ავატარი'],
    ['lipsync this video'],
    ['сделай аватар'],
  ])('routes to avatar: %s', (text) => {
    expect(route(text)).toBe('avatar');
  });
});

describe('dubbing', () => {
  it.each([
    ['dub this video into Russian'],
    ['გადათარგმნე ეს ვიდეო რუსულად'],
    // ⚠️ REGRESSION: Georgian verbs take preverbs, so the real imperative is `დაადუბლირე`, not the bare
    // stem. The start-of-token guard rejected it because a letter (`დაა`) preceded `დუბლირ`.
    ['დაადუბლირე ეს ვიდეო ინგლისურად'],
    ['озвучь это видео на английском'],
  ])('routes to dubbing: %s', (text) => {
    expect(route(text)).toBe('dubbing');
  });

  it('mines the target language from the sentence', () => {
    expect(detectStudioIntent('dub this video into Russian')?.params.targetLanguage).toBe('ru');
    expect(detectStudioIntent('დაადუბლირე ეს ვიდეო ინგლისურად')?.params.targetLanguage).toBe('en');
  });
});

describe('presentation', () => {
  it.each([
    ['make me a 10-slide deck about AI'],
    // ⚠️ REGRESSION: `გამიკეთე` — the commonest Georgian imperative there is — was absent from the
    // studio imperative list, which held `გააკეთე` only. Every KA studio request starting this way died.
    ['გამიკეთე 10 სლაიდიანი პრეზენტაცია AI-ზე'],
    ['сделай презентацию на 10 слайдов'],
  ])('routes to presentation: %s', (text) => {
    expect(route(text)).toBe('presentation');
  });

  it('mines the slide count', () => {
    expect(detectStudioIntent('make me a 10-slide deck about AI')?.params.slideCount).toBe(10);
    expect(detectStudioIntent('გამიკეთე 10 სლაიდიანი პრეზენტაცია AI-ზე')?.params.slideCount).toBe(10);
  });

  // ⚠️ REGRESSION: the subject IS the request, and it was the one field never mined — the panel opened
  // with the slide count filled, the topic blank, and the chat claiming it had captured the description.
  it('mines the topic — the field that is the whole request', () => {
    expect(detectStudioIntent('make me a 10-slide deck about AI')?.params.topic).toBe('AI');
    expect(detectStudioIntent('გამიკეთე 10 სლაიდიანი პრეზენტაცია AI-ზე')?.params.topic).toBe('AI');
    expect(detectStudioIntent('сделай презентацию на 10 слайдов про космос')?.params.topic).toBe('космос');
    // The leading article is scaffolding, not subject — "history of Georgia" is the topic.
    expect(detectStudioIntent('make a presentation about the history of Georgia')?.params.topic)
      .toBe('history of Georgia');
  });
});

describe('3D', () => {
  it.each([
    ['make a 3d model of a chair'],
    ['გამიკეთე 3d მოდელი სკამის'],
    ['сделай 3d модель стула'],
  ])('routes to model3d: %s', (text) => {
    expect(route(text)).toBe('model3d');
  });

  it('mines the subject of the model', () => {
    expect(detectStudioIntent('make a 3d model of a chair')?.params.topic).toBe('chair');
    expect(detectStudioIntent('გამიკეთე 3d მოდელი სკამის')?.params.topic).toBe('სკამის');
  });
});

describe('montage', () => {
  it.each([
    ['stitch these clips together'],
    ['გააერთიანე ეს კლიპები'],
    ['склей эти клипы'],
  ])('routes to montage: %s', (text) => {
    expect(route(text)).toBe('montage');
  });
});

describe('what must NOT route — a wrong render is a wrong charge', () => {
  it.each([
    // Questions about a service are not requests for it.
    ['რა არის დუბლირება?'],
    ['how much does a video cost?'],
    ['сколько стоит видео?'],
    ['what is the best way to make a presentation?'],
    ['გამარჯობა, როგორ ხარ?'],
    // Declaratives / complaints / deliberation — the false-positive family the allowlist exists for.
    ['my client asked for a music video'],
    ['the app will not let me generate a video'],
    ['is flux better than sdxl?'],
    // Analysis is not generation — this one is a paid-render trap in Georgian.
    ['გააკეთე ფოტოს ანალიზი'],
    ['აღწერე ეს ფოტო'],
  ])('stays in chat: %s', (text) => {
    expect(route(text)).toBe('chat');
  });

  // ⚠️ REGRESSION: "read this text aloud" is a TTS ask, but `озвучь` also means "dub", so it opened the
  // DUBBING panel — a video tool, for a text request. Dubbing needs a video object to claim the sentence.
  it.each([
    ['озвучь этот текст'],
    ['read this text aloud'],
    ['წაიკითხე ეს ტექსტი'],
  ])('does not open dubbing for a text-to-speech ask: %s', (text) => {
    expect(detectStudioIntent(text)?.service).not.toBe('dubbing');
  });
});

describe('an imperative order never comes back as an essay', () => {
  // ⚠️ THE LIVE FAILURE, FROM THE USER'S OWN SCREENSHOTS. "Make the photo of the jungle…" produced a
  // chatty explanation of what Image Studio *would* do. The gate recognised the command; the classifier
  // then said text_chat because `photo` and `picture` were absent from the image noun list.
  it.each([
    ['Make the photo of the jungle 9:16 format, high quality, with a lion'],
    ['make me a picture of a lion'],
    ['create a photo of the mountains'],
    ['сделай фото джунглей'],
    ['сделай картинку льва'],
    ['დამიგენერირე ლომის სურათი'],
    // No media noun AT ALL — a subject and nothing else. These are the ones that prove the default
    // matters: requiring the user to name "image" can never cover how people actually ask.
    ['make a jungle scene with a lion'],
    ['generate a lion in the jungle'],
    ['create something cyberpunk and neon'],
  ])('generates instead of talking: %s', (text) => {
    expect(route(text)).toBe('image');
  });

  // The veto: an imperative aimed at a TEXT deliverable must stay written, not become a picture.
  it.each([
    ['make me a list of content ideas'],
    ['write me an email to my client'],
    ['create a plan for next week'],
    ['make a summary of this article'],
    ['сделай список идей'],
    ['გამიკეთე გეგმა შემდეგი კვირისთვის'],
  ])('still answers in text: %s', (text) => {
    expect(route(text)).toBe('chat');
  });
});
