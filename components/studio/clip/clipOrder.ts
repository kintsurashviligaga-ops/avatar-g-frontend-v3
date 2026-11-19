/**
 * The chat's card for the video service's ONE clip (GG 2026-10-25 16:10Z: „like Gemini's Veo"). Pure and client-safe.
 *
 * A video request in the chat no longer plans a storyboard of 16–24 s: it becomes this card. The user's words, exactly as
 * typed; the photos (one is the first frame, two or three are references); the length (4 · 6 · 8 · 10 s, 8 by default);
 * the frame; the quality said as a resolution and pixels; the engine; the price on Create. Nothing is charged before Create,
 * and POST /api/video/clip refuses a price that is no longer the one on the card (409 price_changed).
 *
 * Every number here comes from lib/video/directClip, the same functions the route charges by — no second price table.
 *
 * ⚠️ A GEORGIAN LINE MAKES IT AN OMNI CLIP, AT ANY LENGTH (GG 2026-10-26 10:44Z: three people in one narrator's voice; card
 * 10:55Z). The card reads the words first (promptSpeaksGeorgian): Omni's price and its 720p / 1080p picks are on the card
 * before Create, the speaking clip starts at 1080p, and the route corrects the card for free (409 price_changed + speech)
 * when its own reader finds a line the card did not. A speaking clip takes one photo, and words in quote marks that cannot
 * fit the length are said on the card, with Create held, before anything is sent.
 */
import { describeGenerationFailure } from '@/components/studio/ui/serviceError';
import type { ClipStep } from './ClipProgress';
import type { VideoQuality } from '@/lib/credits/videoPricing';
import { clipSpeechRoom, promptSpeaksGeorgian, quotedSpeechSeconds } from '@/lib/video/clipPrompt';
import {
  DIRECT_CLIP_MAX_PHOTOS, DIRECT_CLIP_SECONDS, OMNI_DEFAULT_RESOLUTION, OMNI_SPEECH_DEFAULT_RESOLUTION, directClipCredits, directClipEngine,
  directClipQualityLabel, directClipSeconds, directClipTierAllowed,
  type DirectClipAspect, type DirectClipResolution, type DirectClipSeconds, type DirectClipSpeech,
} from '@/lib/video/directClip';

type Lang = 'ka' | 'en' | 'ru';
const lang = (locale: string): Lang => (locale === 'en' || locale === 'ru' ? locale : 'ka');
const tr = (locale: string, ka: string, en: string, ru: string): string => ({ ka, en, ru })[lang(locale)];

export interface ClipOrder {
  /** The user's words, as typed (only runs of whitespace are folded, by the route). */
  prompt: string;
  /** The photos as JPEG data URLs, in order: one is the first frame, two or three are reference images. */
  photos: string[];
  seconds: DirectClipSeconds;
  aspect: DirectClipAspect;
  /** Veo's tier for 4 / 6 / 8 s; an Omni clip keeps it but does not use it. */
  tier: VideoQuality;
  /** An Omni clip's resolution pick (kept while a Veo length is chosen, so going back to Omni restores it). */
  resolution: DirectClipResolution;
  /** 'ka' when a character says a Georgian line: the clip is Gemini Omni Flash's at every length (lib/video/directClip). */
  speech: DirectClipSpeech;
}

/** Where the card is: asking, sending, the clip being made, or cancelled. A delivered or failed clip replaces the card. */
export type ClipAskPhase = 'ask' | 'starting' | 'running' | 'cancelled';
export interface ClipAskState extends ClipOrder {
  phase: ClipAskPhase;
  /** The price on Create: directClipCredits for this order. */
  credits: number;
  /** While running: when Create was accepted, and the step the status poll last reported (./ClipProgress). */
  t0?: number;
  step?: ClipStep;
}

/** An order from what the chat and the panel hold: the length snapped to the grid, the photos capped, the price computed. */
export function clipOrder(input: {
  prompt: string;
  photos: readonly string[];
  seconds: unknown;
  aspect: DirectClipAspect;
  tier: VideoQuality;
  /** The panel's resolution pick; none picked is 1080p for a speaking clip, 720p for a 10 s one without words. */
  resolution?: DirectClipResolution | null;
  /** What the route read (409 price_changed + speech); otherwise the card reads the prompt itself. */
  speech?: DirectClipSpeech;
}): ClipAskState {
  const photos = input.photos.filter(Boolean).slice(0, DIRECT_CLIP_MAX_PHOTOS);
  const seconds = directClipSeconds(input.seconds, photos.length);
  const speech: DirectClipSpeech = input.speech === 'ka' || promptSpeaksGeorgian(input.prompt) ? 'ka' : null;
  // Lite takes no reference images: two or three photos go to Fast (the panel offers Lite again without them).
  const tier = directClipEngine(seconds, speech) === 'veo' && !directClipTierAllowed(input.tier, photos.length) ? 'fast' : input.tier;
  const resolution: DirectClipResolution = input.resolution === '1080p' || input.resolution === '720p'
    ? input.resolution
    : speech === 'ka' ? OMNI_SPEECH_DEFAULT_RESOLUTION : OMNI_DEFAULT_RESOLUTION;
  return {
    prompt: input.prompt, photos, seconds, aspect: input.aspect, tier, resolution, speech, phase: 'ask',
    credits: directClipCredits({ seconds, tier, photos: photos.length, resolution, speech }),
  };
}

/** One pick on the card, or on the composer's chips while the card waits for Create (the tier only from those). */
export type ClipChange = { seconds: DirectClipSeconds } | { aspect: DirectClipAspect } | { resolution: DirectClipResolution } | { tier: VideoQuality };

/** The clip's engine: Gemini Omni Flash at 10 s or with a Georgian line, else Veo. */
export const clipIsOmni = (state: Pick<ClipOrder, 'seconds' | 'speech'>): boolean => directClipEngine(state.seconds, state.speech) === 'omni';

/**
 * The route found a Georgian line the card did not (409 price_changed with speech: 'ka'): the same order as an Omni clip, at
 * the route's price. Any other 409 keeps the order and takes the route's price.
 */
export function clipRepriced(state: ClipAskState, body: { credits?: unknown; speech?: unknown }): ClipAskState {
  const next = body.speech === 'ka' ? { ...clipOrder({ ...state, speech: 'ka' }), phase: 'ask' as const } : { ...state, phase: 'ask' as const };
  return typeof body.credits === 'number' ? { ...next, credits: body.credits } : next;
}

/**
 * What keeps Create from running, said on the card, for a clip that speaks Georgian: two or three photos (Omni takes one,
 * as its first frame), or quoted words that cannot fit the length (`fitsAt`: the shortest length they fit, if any). A
 * clip nobody speaks Georgian in is never held here: a quote in it may be a sign, and the route's reader tells lines from
 * text and measures them itself.
 */
export type ClipHold = { kind: 'photos' } | { kind: 'long'; seconds: number; max: DirectClipSeconds; fitsAt: DirectClipSeconds | null };
export function clipHold(state: Pick<ClipOrder, 'prompt' | 'photos' | 'seconds' | 'speech'>): ClipHold | null {
  if (state.speech !== 'ka') return null;
  if (state.photos.length >= 2) return { kind: 'photos' };
  const said = quotedSpeechSeconds(state.prompt);
  if (said <= clipSpeechRoom(state.seconds)) return null;
  const fitsAt = DIRECT_CLIP_SECONDS.find((s) => s > state.seconds && said <= clipSpeechRoom(s)) ?? null;
  return { kind: 'long', seconds: said, max: state.seconds, fitsAt };
}

export function clipHoldText(hold: ClipHold, locale: string): string {
  if (hold.kind === 'photos') {
    return tr(locale,
      'ქართულად მოლაპარაკე კლიპი ერთ ფოტოს იღებს, პირველ კადრად. გამომიგზავნე ერთი ფოტოთი.',
      'A clip where someone speaks Georgian takes one photo, as its first frame. Send it with one photo.',
      'Клип, где говорят по-грузински, принимает одно фото, первым кадром. Отправьте его с одним фото.');
  }
  return hold.fitsAt
    ? tr(locale,
      `ნათქვამი ტექსტი ~${hold.seconds} წამია და ${hold.max} წამიან კლიპს არ ეტევა. აირჩიე ${hold.fitsAt} წმ ან შეამოკლე.`,
      `The spoken words take ~${hold.seconds} s and do not fit ${hold.max === 8 ? 'an' : 'a'} ${hold.max} s clip. Pick ${hold.fitsAt} s or shorten them.`,
      `Текст звучит ~${hold.seconds} с и не помещается в клип на ${hold.max} с. Выберите ${hold.fitsAt} с или сократите его.`)
    : tr(locale,
      `ნათქვამი ტექსტი ~${hold.seconds} წამია და ${hold.max} წამიან კლიპს არ ეტევა. შეამოკლე.`,
      `The spoken words take ~${hold.seconds} s and do not fit ${hold.max === 8 ? 'an' : 'a'} ${hold.max} s clip. Shorten them.`,
      `Текст звучит ~${hold.seconds} с и не помещается в клип на ${hold.max} с. Сократите его.`);
}

/** Under a speaking clip: who speaks it, and how. */
export function clipSpeechNote(state: Pick<ClipOrder, 'speech'>, locale: string): string | null {
  if (state.speech !== 'ka') return null;
  return tr(locale,
    'პერსონაჟები ქართულად თვითონ ილაპარაკებენ, თითოეული თავისი ხმით (Gemini Omni Flash).',
    'The characters speak Georgian themselves, each in their own voice (Gemini Omni Flash).',
    'Персонажи говорят по-грузински сами, каждый своим голосом (Gemini Omni Flash).');
}

/** A chip tapped on the card: the same order with that one thing changed, priced again. */
export function changeClip(state: ClipAskState, change: ClipChange): ClipAskState {
  return { ...clipOrder({ ...state, ...change }), phase: state.phase };
}

/**
 * The tier a clip runs on when the one picked is closed on this deployment (GET /api/video/engine says which): Fast, then
 * Lite, then Veo 3.1 — one the photos allow. A closed tier is never offered, and never sent (the route refuses it free).
 */
export function openClipTier(tier: VideoQuality, closed: readonly VideoQuality[], photos: number): VideoQuality {
  if (!closed.includes(tier)) return tier;
  return (['fast', 'lite', 'standard'] as const).find((t) => !closed.includes(t) && directClipTierAllowed(t, photos)) ?? tier;
}

/** The lengths a card offers for its photos: two or three photos are Veo's reference images, which render 8 s only. */
export function clipLengthsFor(photos: number): readonly DirectClipSeconds[] {
  return photos >= 2 ? [8] : [4, 6, 8, 10];
}

/** The body POST /api/video/clip takes, with the price the card showed. */
export function clipRequestBody(state: ClipAskState): Record<string, unknown> {
  return {
    prompt: state.prompt, photos: state.photos, seconds: state.seconds, aspect: state.aspect, tier: state.tier,
    resolution: state.resolution, ...(state.speech ? { speech: state.speech } : {}), expectedCredits: state.credits,
  };
}

/** The engine by its product name: Gemini Omni Flash for 10 s or a Georgian line, else Veo 3.1 at its tier. */
export function clipEngineLabel(state: Pick<ClipOrder, 'seconds' | 'tier'> & { speech?: DirectClipSpeech }): string {
  if (directClipEngine(state.seconds, state.speech) === 'omni') return 'Gemini Omni Flash';
  return state.tier === 'lite' ? 'Veo 3.1 Lite' : state.tier === 'standard' ? 'Veo 3.1' : 'Veo 3.1 Fast';
}

/**
 * What a quality pick changes, said in words (GG 2026-10-26 08:46Z: the three Veo rows read „1080p · 1080×1920" alike, so
 * only the price told them apart). The three Veo tiers render the same pixels; they differ in detail, motion and wait.
 * Lite takes no reference photos (directClipTierAllowed). The 10 s clip's two picks differ in pixels only.
 */
export function clipTierBlurb(tier: VideoQuality, locale: string): string {
  if (tier === 'lite') {
    return tr(locale, 'ყველაზე იაფი, სწრაფი მონახაზისთვის. 2–3 ფოტოს არ იღებს.', 'Cheapest, for a quick draft. Does not take 2–3 photos.', 'Самый дешёвый, для быстрого черновика. Не принимает 2–3 фото.');
  }
  if (tier === 'fast') {
    return tr(locale, 'კარგი ხარისხი, სწრაფად მზადდება. ბალანსი ფასსა და ხარისხს შორის.', 'Good quality, made quickly. The balance of price and quality.', 'Хорошее качество, делается быстро. Баланс цены и качества.');
  }
  return tr(locale, 'საუკეთესო დეტალი და მოძრაობა. უფრო დიდხანს მზადდება.', 'The best detail and motion. Takes longer to make.', 'Лучшая детализация и движение. Делается дольше.');
}

export function clipResolutionBlurb(resolution: DirectClipResolution, locale: string): string {
  return resolution === '1080p'
    ? tr(locale, 'უფრო მკვეთრი, დიდი ეკრანისთვის.', 'Sharper, for a big screen.', 'Чётче, для большого экрана.')
    : tr(locale, 'ტელეფონისთვის საკმარისი, უფრო იაფი.', 'Enough for a phone, and cheaper.', 'Достаточно для телефона, дешевле.');
}

/** „8 წმ · 9:16 · 1080p · 1080×1920 · Veo 3.1 Fast" — what will be made, in one line. */
export function clipSpecLine(state: ClipOrder, locale: string): string {
  const sec = tr(locale, `${state.seconds} წმ`, `${state.seconds} s`, `${state.seconds} с`);
  return [sec, state.aspect, directClipQualityLabel(state.aspect, state.seconds, state.resolution, state.speech), clipEngineLabel(state)].join(' · ');
}

/** What the photos will be, said under them. */
export function clipPhotoNote(photos: number, locale: string): string | null {
  if (photos <= 0) return null;
  if (photos === 1) return tr(locale, 'ფოტო იქნება კლიპის პირველი კადრი.', 'The photo is the clip\'s first frame.', 'Фото станет первым кадром клипа.');
  // Two or three photos are Veo's references, which render 8 s only: said here, or a greyed-out 10 s reads as broken.
  return tr(locale,
    'ფოტოებიდან პერსონაჟები და საგნები შენარჩუნდება (8 წმ). 10 წამიანი კლიპი მხოლოდ ერთ ფოტოს იღებს, პირველ კადრად: ამისთვის ერთი ფოტოთი გამომიგზავნე.',
    'The people and things in the photos are kept (8 s). A 10 s clip takes one photo only, as its first frame: send it with one photo for that.',
    'Люди и предметы с фото сохранятся (8 с). Клип на 10 с принимает только одно фото, первым кадром: для него отправьте одно фото.');
}

/** The card's own words above the prompt. */
export function clipAskText(locale: string): string {
  return tr(locale,
    'ამ ვიდეოს შევქმნი შენი ტექსტით, ზუსტად ისე, როგორც დაწერე:',
    'I will make this video from your words, exactly as you wrote them:',
    'Я сделаю это видео по вашему тексту — ровно так, как вы написали:');
}

/** A line under the card when the request named several scenes: one clip is made, nothing longer is planned. */
export function clipOneClipNote(locale: string): string {
  return tr(locale,
    'ერთი კლიპი კეთდება, მაქსიმუმ 10 წამი. რამდენიმე სცენიანი ფილმი ახლა არ კეთდება.',
    'One clip is made, up to 10 seconds. Films of several scenes are not made right now.',
    'Делается один клип, до 10 секунд. Фильмы из нескольких сцен сейчас не делаются.');
}

export function clipRunningText(state: Pick<ClipOrder, 'seconds' | 'tier'> & { speech?: DirectClipSpeech }, locale: string): string {
  return tr(locale,
    `კლიპი მზადდება (${clipEngineLabel(state)}). ჩვეულებრივ 1–2 წუთი სჭირდება.`,
    `Making the clip (${clipEngineLabel(state)}). It usually takes 1–2 minutes.`,
    `Клип создаётся (${clipEngineLabel(state)}). Обычно это 1–2 минуты.`);
}

/** The step after Google's render (./ClipProgress `finishing`): the clip saved for the chat. */
export function clipFinishingText(locale: string): string {
  return tr(locale, 'კლიპი შეიქმნა. ვამატებ ჩატში…', 'The clip is made. Putting it in the chat…', 'Клип готов. Добавляю в чат…');
}

export function clipCancelledText(locale: string): string {
  return tr(locale, 'გაუქმდა. თანხა არ ჩამოგეჭრა.', 'Cancelled. Nothing was charged.', 'Отменено. Деньги не списаны.');
}

/** The server kept the job past the poll budget: it is paid, so nothing new is started; it lands in the Library. */
export function clipStillRenderingText(locale: string): string {
  return tr(locale,
    'კლიპი ჯერ კიდევ მზადდება. როცა მზად იქნება, ბიბლიოთეკაში გამოჩნდება.',
    'The clip is still being made. It will appear in your Library when it is ready.',
    'Клип ещё создаётся. Когда будет готов, он появится в Библиотеке.');
}

/**
 * What a refusal or a failed clip tells the user. The clip's own codes first (a line too long for THIS clip's length, the
 * Georgian voice off), then the studio's shared table (components/studio/ui/serviceError), never the raw code.
 */
export function clipFailureText(body: unknown, locale: string): string {
  const b = (body && typeof body === 'object' ? body : {}) as { error?: unknown; seconds?: unknown; maxSeconds?: unknown };
  const max = typeof b.maxSeconds === 'number' ? b.maxSeconds : null;
  if (b.error === 'speech_too_long' && max) {
    const said = typeof b.seconds === 'number' ? b.seconds : null;
    return said
      ? tr(locale,
        `ნათქვამი ტექსტი ~${said} წამია და ${max} წამიან კლიპს არ ეტევა. შეამოკლე ან აირჩიე უფრო გრძელი კლიპი. თანხა არ ჩამოგეჭრა.`,
        `The spoken words take ~${said} s and do not fit a ${max} s clip. Shorten them or pick a longer clip. Nothing was charged.`,
        `Текст звучит ~${said} с и не помещается в клип на ${max} с. Сократите его или выберите клип длиннее. Деньги не списаны.`)
      : tr(locale,
        `ნათქვამი ტექსტი ${max} წამიანი კლიპისთვის ძალიან გრძელია. შეამოკლე. თანხა არ ჩამოგეჭრა.`,
        `The spoken words are too long for a ${max} s clip. Shorten them. Nothing was charged.`,
        `Текст слишком длинный для клипа на ${max} с. Сократите его. Деньги не списаны.`);
  }
  if (b.error === 'speech_one_photo') return clipHoldText({ kind: 'photos' }, locale);
  if (b.error === 'voice_off') {
    return tr(locale,
      'ქართული ხმა ახლა გამორთულია, ამიტომ ეს კლიპი ვერ გაკეთდება. თანხა არ ჩამოგეჭრა.',
      'The Georgian voice is off right now, so this clip cannot be made. Nothing was charged.',
      'Грузинский голос сейчас выключен, поэтому этот клип не получится. Деньги не списаны.');
  }
  if (b.error === 'tier_unavailable') {
    return tr(locale,
      'ეს ხარისხი ახლა მიუწვდომელია. აირჩიე სხვა ხარისხი და სცადე ხელახლა. თანხა არ ჩამოგეჭრა.',
      'This quality is unavailable right now. Pick another one and try again. Nothing was charged.',
      'Это качество сейчас недоступно. Выберите другое и попробуйте снова. Деньги не списаны.');
  }
  if (b.error === 'invalid_request') {
    return tr(locale,
      'ამ მოთხოვნის მიღება ვერ მოხერხდა. შეამოწმე ფოტოები (მაქსიმუმ 3, JPEG/PNG/WebP) და სცადე ხელახლა. თანხა არ ჩამოგეჭრა.',
      'This request could not be accepted. Check the photos (up to 3, JPEG/PNG/WebP) and try again. Nothing was charged.',
      'Запрос не принят. Проверьте фото (до 3, JPEG/PNG/WebP) и попробуйте снова. Деньги не списаны.');
  }
  return describeGenerationFailure(body, locale, tr(locale,
    'ვიდეო ვერ შეიქმნა. სცადე ხელახლა.',
    'The video could not be made. Please try again.',
    'Видео не получилось. Попробуйте ещё раз.'));
}

/** Some photos could not be read (a link that did not load, a format the browser cannot draw): said, never silent. */
export function clipPhotoLostText(locale: string): string {
  return tr(locale,
    'ზოგი ფოტო ვერ წავიკითხე, ამიტომ კლიპში არ იქნება. სხვა ფორმატით (JPEG/PNG) ხელახლა დაამატე, თუ გინდა.',
    'Some photos could not be read, so they are not in the clip. Add them again as JPEG or PNG if you want them.',
    'Некоторые фото не удалось прочитать, они не попадут в клип. Добавьте их снова в JPEG или PNG, если нужно.');
}

/** A prompt (or an attached script) longer than one clip's prompt can be: shortened by the user, never cut silently. */
export function clipTooLongText(locale: string, max: number): string {
  return tr(locale,
    `ერთი კლიპის აღწერა მაქსიმუმ ${max} სიმბოლოა. შეამოკლე და ხელახლა გამომიგზავნე.`,
    `One clip's description is at most ${max} characters. Shorten it and send it again.`,
    `Описание одного клипа — не больше ${max} символов. Сократите его и отправьте снова.`);
}

/** The words of the prompt asking for nothing but a clip: what to describe. */
export function clipNeedsWordsText(locale: string): string {
  return tr(locale,
    'აღწერე, რა უნდა ხდებოდეს ვიდეოში, და გამომიგზავნე.',
    'Describe what should happen in the video, then send it.',
    'Опишите, что должно происходить в видео, и отправьте.');
}

/**
 * A length the words name („10 წამიანი", „6 წმ", „4 seconds", „8s", „10 сек"): it wins over the panel for this clip, like a
 * ratio typed in the words does. Only the grid's lengths count; „24 წამი" or „1 წუთი" names none (the card says 8).
 */
export function clipSecondsFromWords(text: string): DirectClipSeconds | null {
  // `\b` is ASCII-only in JS, so a unit ends where no letter follows (\p{L}): „8 с" and „8s," both count.
  const m = /(?:^|[^\d.,])(4|6|8|10)\s*-?\s*(?:წამ|წმ|sec(?:ond)?s?(?!\p{L})|s(?!\p{L})|сек|с(?!\p{L}))/iu.exec(text);
  return m ? (Number(m[1]) as DirectClipSeconds) : null;
}

/** A frame named by the words or a card („16:9", „9:16"): the clip's own two; anything else names none. */
export function clipAspectFor(aspect: string | null | undefined): DirectClipAspect | undefined {
  return aspect === '16:9' ? '16:9' : aspect === '9:16' ? '9:16' : undefined;
}
