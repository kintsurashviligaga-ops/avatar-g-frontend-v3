/**
 * The chat's card for an uploaded video, EDITED or EXTENDED by Gemini Omni Flash (GG 2026-10-25 16:58Z; card 17:04Z
 * „კი, ორივე"). Pure and client-safe.
 *
 * A video attached in the Video tool with words is no longer dropped for a new clip: it becomes this card. The words, as
 * typed; the video; Edit (it changes what the words say, at the video's own length) or Extend (+4 · 6 · 8 · 10 s after it,
 * 8 by default); 720p or 1080p with their prices; the engine; the price on Create. The words pick the first: „გააგრძელე",
 * „continue", „продолжи" open it on Extend (lib/video/omniEdit omniEditOpFromWords). Nothing is charged before Create.
 *
 * Every number comes from lib/video/omniEdit, the functions POST /api/video/omni-edit charges by. The browser's own reading
 * of the length prices an edit; the server measures the video itself and refuses a price that is not its own (409
 * price_changed, with its price and the length it read), so a card whose length the phone could not read is corrected
 * before anything is taken.
 */
import { describeGenerationFailure } from '@/components/studio/ui/serviceError';
import type { DirectClipResolution } from '@/lib/video/directClip';
import type { ClipStep } from './ClipProgress';
import {
  OMNI_EDIT_INPUT_MAX_SEC, OMNI_EDIT_MIN_INPUT_SEC, OMNI_EXTEND_DEFAULT_SECONDS, omniEditBilledSeconds, omniEditCredits, omniEditInputCheck,
  omniEditOutputSeconds, omniSourceOfJob, snapOmniExtendSeconds, type OmniEditOp, type OmniEditSeconds,
} from '@/lib/video/omniEdit';

type Lang = 'ka' | 'en' | 'ru';
const lang = (locale: string): Lang => (locale === 'en' || locale === 'ru' ? locale : 'ka');
const tr = (locale: string, ka: string, en: string, ru: string): string => ({ ka, en, ru })[lang(locale)];

export interface EditVideo {
  /** What the card plays (the attachment's object URL). */
  url: string;
  mimeType: string;
  name?: string;
  poster?: string;
  /** Where the chat stored it, when its upload has landed; else Create waits for that upload. */
  path?: string;
  /**
   * A clip made in this chat: its job id, continued by Omni's own interaction (lib/video/omniEdit omniSourceOfJob) —
   * speech and all, nothing uploaded. Google adds no speech to an uploaded video in which someone talks.
   */
  from?: string;
}

export interface EditOrder {
  op: OmniEditOp;
  /** The user's words, as typed. */
  prompt: string;
  video: EditVideo;
  /** Its length as the browser read it (the server measures it again); null when the browser could not. */
  inputSec: number | null;
  /** An extend's new seconds (an edit keeps the video's own length, but the pick is kept for going back to Extend). */
  seconds: OmniEditSeconds;
  resolution: DirectClipResolution;
}

/** Asking, sending, being made, or cancelled. A delivered or failed edit replaces the card. */
export type EditAskPhase = 'ask' | 'starting' | 'running' | 'cancelled';
export interface EditAskState extends EditOrder {
  phase: EditAskPhase;
  /** The price on Create: lib/video/omniEdit omniEditCredits for this order. */
  credits: number;
  /** While running: when Create was accepted, and the step the status poll last reported (./ClipProgress). */
  t0?: number;
  step?: ClipStep;
}

const known = (sec: number | null | undefined): number | null => (typeof sec === 'number' && Number.isFinite(sec) && sec > 0 ? sec : null);

/** An order from what the chat holds, priced. A length the browser could not read prices an edit at 4 s until the server says. */
export function editOrder(input: {
  op: OmniEditOp; prompt: string; video: EditVideo; inputSec?: number | null; seconds?: unknown; resolution?: DirectClipResolution | null;
}): EditAskState {
  const inputSec = known(input.inputSec);
  const seconds = snapOmniExtendSeconds(input.seconds ?? OMNI_EXTEND_DEFAULT_SECONDS);
  const resolution: DirectClipResolution = input.resolution === '1080p' ? '1080p' : '720p';
  return {
    op: input.op, prompt: input.prompt, video: input.video, inputSec, seconds, resolution, phase: 'ask',
    credits: omniEditCredits({ op: input.op, inputSec: inputSec ?? 0, seconds, resolution }),
  };
}

export type EditChange = { op: OmniEditOp } | { seconds: OmniEditSeconds } | { resolution: DirectClipResolution } | { inputSec: number };

/** A chip tapped on the card (or the server's measured length): the same order with that one thing changed, priced again. */
export function changeEdit(state: EditAskState, change: EditChange): EditAskState {
  return { ...editOrder({ ...state, ...change }), phase: state.phase };
}

/** Can this video be taken for `op`? An unread length is left to the server, which measures it before any charge. */
export function editOpAllowed(op: OmniEditOp, inputSec: number | null): boolean {
  const check = omniEditInputCheck(op, inputSec);
  return check === 'ok' || check === 'unknown';
}

/**
 * The clip „გააგრძელე" continues (GG 2026-10-26 15:41Z): the thread's latest video, when Omni made it (`thread`, the Video
 * tool: a failed try or a note after it is passed over), or only the reply just given (`last`, the chat — „გააგრძელე" after
 * a long answer continues the answer). Its source and length come from its job id (lib/video/omniEdit omniSourceOfJob).
 */
export function clipToContinue<T extends { role: string; notice?: boolean; omniJob?: string; videoUrl?: string }>(
  msgs: readonly T[], scope: 'thread' | 'last',
): { msg: T; from: string; url: string; seconds: OmniEditSeconds } | 'extended' | null {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i]!;
    if (m.role !== 'assistant' || m.notice) continue;
    const source = m.omniJob && m.videoUrl ? omniSourceOfJob(m.omniJob) : null;
    if (source) return { msg: m, from: m.omniJob!, url: m.videoUrl!, seconds: source.seconds };
    // An extend's result is longer than the price book's edit row assumes (lib/video/omniEdit): said, not passed over.
    if (m.videoUrl && m.omniJob && /::ox(?:4|6|8|10)(?=~|$)/.test(m.omniJob)) return 'extended';
    // The latest video is the one meant: a Veo clip after an Omni one is not passed over for it.
    if (scope === 'last' || m.videoUrl) return null;
  }
  return null;
}

/** The name the studio's ⬇ / share buttons give a clip (components/studio/OmniStudio). */
const OWN_CLIP_FILE = /^myavatar-video-\d+\.mp4$/i;

/**
 * An attached file that IS the thread's clip made here, downloaded and attached back (GG 2026-10-26 16:29Z: the upload
 * failed, since Google adds no speech to an uploaded video in which someone talks): our download name and the clip's
 * length (±0.6 s). Then the clip itself is continued, nothing uploaded. Any other file stays an upload.
 */
export function ownClipOfAttachment<T extends { role: string; notice?: boolean; omniJob?: string; videoUrl?: string }>(
  msgs: readonly T[], file: { name?: string; durationSec?: number },
): ReturnType<typeof clipToContinue<T>> {
  if (!file.name || !OWN_CLIP_FILE.test(file.name)) return null;
  const clip = clipToContinue(msgs, 'thread');
  if (clip === 'extended') return clip;
  if (!clip || typeof file.durationSec !== 'number' || Math.abs(file.durationSec - clip.seconds) > 0.6) return null;
  return clip;
}

/** The body POST /api/video/omni-edit takes: the stored path (or the clip made here), and the price the card showed. */
export function editRequestBody(state: EditAskState, path: string | null): Record<string, unknown> {
  const source = state.video.from ? { from: state.video.from } : { video: path };
  return { op: state.op, prompt: state.prompt, ...source, seconds: state.seconds, resolution: state.resolution, expectedCredits: state.credits };
}

const sec = (locale: string, s: number) => tr(locale, `${s} წმ`, `${s} s`, `${s} с`);
const round1 = (s: number) => Math.round(s * 10) / 10;

/**
 * What will be made, in one line: „რედაქტირება · 5 წმ · 720p · Gemini Omni Flash" or
 * „გაგრძელება +8 წმ → 13 წმ · 1080p · Gemini Omni Flash". The frame is the video's own.
 */
export function editSpecLine(state: EditOrder, locale: string): string {
  const res = state.resolution;
  if (state.op === 'extend') {
    const total = state.inputSec ? ` → ${sec(locale, omniEditOutputSeconds('extend', state.inputSec, state.seconds))}` : '';
    return [`${tr(locale, 'გაგრძელება', 'Extend', 'Продление')} +${sec(locale, state.seconds)}${total}`, res, 'Gemini Omni Flash'].join(' · ');
  }
  const own = state.inputSec ? sec(locale, omniEditOutputSeconds('edit', state.inputSec)) : null;
  return [tr(locale, 'რედაქტირება', 'Edit', 'Редактирование'), ...(own ? [own] : []), res, 'Gemini Omni Flash'].join(' · ');
}

/** Under the spec line: what the price is for (an edit is billed at its length on the grid, an extend at the new seconds). */
export function editPriceNote(state: EditOrder, locale: string): string {
  if (state.op === 'extend') {
    const own = tr(locale,
      `ფასი მხოლოდ ახალ ${state.seconds} წამზეა. კადრი ვიდეოს საკუთარია.`,
      `The price is for the new ${state.seconds} s only. The frame is the video's own.`,
      `Цена только за новые ${state.seconds} с. Кадр остаётся как в видео.`);
    return state.video.from ? own : `${own} ${uploadSpeechNote(locale)}`;
  }
  if (!state.inputSec) {
    return tr(locale,
      'ვიდეოს სიგრძეს სერვერი გაზომავს. თუ ფასი შეიცვლება, შექმნამდე გაჩვენებ.',
      'The server measures the video\'s length. If the price changes, you will see it before anything is made.',
      'Длину видео измерит сервер. Если цена изменится, вы увидите её до создания.');
  }
  const billed = omniEditBilledSeconds('edit', state.inputSec);
  return tr(locale,
    `${round1(state.inputSec)} წამიანი ვიდეო, ფასი ${billed} წამისაა. კადრი ვიდეოს საკუთარია.`,
    `A ${round1(state.inputSec)} s video, priced as ${billed} s. The frame is the video's own.`,
    `Видео ${round1(state.inputSec)} с, цена как за ${billed} с. Кадр остаётся как в видео.`);
}

/**
 * An uploaded video is extended without new speech: Google's Omni page says so („you cannot extend an uploaded video where
 * someone is talking to add additional dialogue"), and GG's two such extends came back empty (2026-10-26 15:12Z, 15:39Z).
 */
function uploadSpeechNote(locale: string): string {
  return tr(locale,
    'ატვირთულ ვიდეოში, სადაც ვინმე ლაპარაკობს, Google ახალ ლაპარაკს ვერ ამატებს. ჩატში შექმნილ კლიპს კი ლაპარაკიანად აგრძელებს: კლიპის შემდეგ დაწერე „გააგრძელე“.',
    'Google cannot add new speech to an uploaded video in which someone talks. A clip made in this chat it continues, speech and all: write „continue" after the clip.',
    'Google не может добавить новую речь в загруженное видео, где кто-то говорит. Клип, созданный в этом чате, он продолжает вместе с речью: напишите «продолжи» после клипа.');
}

/** „გააგრძელე" after a video that was already extended once: one extend per clip for now, nothing charged. */
export function extendOnceText(locale: string): string {
  return tr(locale,
    'ეს ვიდეო უკვე ერთხელ გაგრძელდა. ჯერჯერობით ჩატში შექმნილ კლიპს ერთხელ ვაგრძელებ. თანხა არ ჩამოგეჭრა.',
    'This video was already extended once. For now a clip made in this chat is extended once. Nothing was charged.',
    'Это видео уже продлено один раз. Пока клип из этого чата продлевается один раз. Деньги не списаны.');
}

/** The card's own words above the prompt. */
export function editAskText(op: OmniEditOp, locale: string): string {
  return op === 'extend'
    ? tr(locale,
      'ამ ვიდეოს გავაგრძელებ შენი ტექსტით, ზუსტად ისე, როგორც დაწერე:',
      'I will extend this video from your words, exactly as you wrote them:',
      'Я продлю это видео по вашему тексту — ровно так, как вы написали:')
    : tr(locale,
      'ამ ვიდეოს შევცვლი შენი ტექსტით, ზუსტად ისე, როგორც დაწერე:',
      'I will edit this video from your words, exactly as you wrote them:',
      'Я изменю это видео по вашему тексту — ровно так, как вы написали:');
}

export function editRunningText(op: OmniEditOp, locale: string): string {
  return op === 'extend'
    ? tr(locale, 'ვიდეო გრძელდება (Gemini Omni Flash). ჩვეულებრივ 1–2 წუთი სჭირდება.', 'Extending the video (Gemini Omni Flash). It usually takes 1–2 minutes.', 'Видео продлевается (Gemini Omni Flash). Обычно это 1–2 минуты.')
    : tr(locale, 'ვიდეო იცვლება (Gemini Omni Flash). ჩვეულებრივ 1–2 წუთი სჭირდება.', 'Editing the video (Gemini Omni Flash). It usually takes 1–2 minutes.', 'Видео редактируется (Gemini Omni Flash). Обычно это 1–2 минуты.');
}

/** A video attached without words: what to say. */
export function editNeedsWordsText(locale: string): string {
  return tr(locale,
    'მითხარი, რა შევცვალო ამ ვიდეოში, ან დაწერე „გააგრძელე" და რა უნდა მოხდეს შემდეგ.',
    'Tell me what to change in this video, or write „continue" and what should happen next.',
    'Скажите, что изменить в этом видео, или напишите «продолжи» и что должно произойти дальше.');
}

/** Over Omni's 10 s, before anything is sent: said with its length, the file stays in the composer. */
export function editTooLongText(seconds: number | null, locale: string): string {
  const said = seconds ? round1(seconds) : null;
  return said
    ? tr(locale,
      `ვიდეო ${said} წამია. რედაქტირება და გაგრძელება მაქსიმუმ ${OMNI_EDIT_INPUT_MAX_SEC} წამიან ვიდეოზე მუშაობს. შეამოკლე და ხელახლა დაამატე. თანხა არ ჩამოგეჭრა.`,
      `The video is ${said} s. Editing and extending take a video of up to ${OMNI_EDIT_INPUT_MAX_SEC} s. Trim it and attach it again. Nothing was charged.`,
      `Видео длится ${said} с. Редактирование и продление работают с видео до ${OMNI_EDIT_INPUT_MAX_SEC} с. Обрежьте его и добавьте снова. Деньги не списаны.`)
    : tr(locale,
      `რედაქტირება და გაგრძელება მაქსიმუმ ${OMNI_EDIT_INPUT_MAX_SEC} წამიან ვიდეოზე მუშაობს. შეამოკლე და ხელახლა დაამატე. თანხა არ ჩამოგეჭრა.`,
      `Editing and extending take a video of up to ${OMNI_EDIT_INPUT_MAX_SEC} s. Trim it and attach it again. Nothing was charged.`,
      `Редактирование и продление работают с видео до ${OMNI_EDIT_INPUT_MAX_SEC} с. Обрежьте его и добавьте снова. Деньги не списаны.`);
}

/** Too short to edit (Omni renders at least 3 s); extending it still works. */
export function editTooShortText(locale: string): string {
  return tr(locale,
    `რედაქტირებისთვის ვიდეო მინიმუმ ${OMNI_EDIT_MIN_INPUT_SEC} წამი უნდა იყოს. ასეთი მოკლე ვიდეოს გაგრძელება შეიძლება: დაწერე „გააგრძელე" და რა უნდა მოხდეს. თანხა არ ჩამოგეჭრა.`,
    `To edit, the video must be at least ${OMNI_EDIT_MIN_INPUT_SEC} s. A video this short can be extended: write „continue" and what should happen. Nothing was charged.`,
    `Для редактирования видео должно быть не короче ${OMNI_EDIT_MIN_INPUT_SEC} с. Такое короткое видео можно продлить: напишите «продолжи» и что должно произойти. Деньги не списаны.`);
}

/** Photos sent with the video: Omni's edit takes the video and the words only. Said, never dropped in silence. */
export function editPhotosLeftText(locale: string): string {
  return tr(locale,
    'ფოტოები ამ რედაქტირებაში არ გამოიყენება: Omni ვიდეოსა და შენს ტექსტს იღებს.',
    'The photos are not used in this edit: Omni takes the video and your words.',
    'Фото в этом редактировании не используются: Omni берёт видео и ваш текст.');
}

/** The upload of the video did not land: nothing was sent or charged. */
export function editUploadFailedText(locale: string): string {
  return tr(locale,
    'ვიდეო ვერ აიტვირთა, ამიტომ არაფერი გაიგზავნა. ხელახლა დაამატე და სცადე. თანხა არ ჩამოგეჭრა.',
    'The video did not upload, so nothing was sent. Attach it again and try. Nothing was charged.',
    'Видео не загрузилось, поэтому ничего не отправлено. Добавьте его снова и попробуйте. Деньги не списаны.');
}

/** What a refusal or a failed edit tells the user: the route's own codes first, then the studio's shared table. */
export function editFailureText(body: unknown, locale: string): string {
  const b = (body && typeof body === 'object' ? body : {}) as { error?: unknown; seconds?: unknown };
  const seconds = typeof b.seconds === 'number' ? b.seconds : null;
  if (b.error === 'video_too_long') return editTooLongText(seconds, locale);
  if (b.error === 'video_too_short') return editTooShortText(locale);
  if (b.error === 'video_too_large') {
    return tr(locale,
      'ვიდეო ძალიან დიდია ამ რედაქტირებისთვის. გამოიყენე უფრო მოკლე ან დაბალი ხარისხის ვიდეო. თანხა არ ჩამოგეჭრა.',
      'The video is too large for this edit. Use a shorter or lower-quality video. Nothing was charged.',
      'Видео слишком большое для этого редактирования. Используйте более короткое или менее качественное видео. Деньги не списаны.');
  }
  if (b.error === 'video_unreadable' || b.error === 'invalid_request') {
    return tr(locale,
      'ამ ვიდეოს წაკითხვა ვერ მოხერხდა. სცადე MP4 ან MOV ფაილი. თანხა არ ჩამოგეჭრა.',
      'This video could not be read. Try an MP4 or MOV file. Nothing was charged.',
      'Не удалось прочитать это видео. Попробуйте файл MP4 или MOV. Деньги не списаны.');
  }
  return describeGenerationFailure(body, locale, tr(locale,
    'ვიდეო ვერ შეიცვალა. სცადე ხელახლა.',
    'The video could not be edited. Please try again.',
    'Видео не удалось изменить. Попробуйте ещё раз.'));
}
