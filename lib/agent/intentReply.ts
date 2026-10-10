/**
 * lib/agent/intentReply.ts — what the chat does with Agent G's reading of a message (lib/agent/intent) BEFORE any tool
 * reads the words as its prompt, and what Agent G says, in ka · en · ru. Pure, no network, safe on the client.
 *
 * The chat answers only these itself; everything else goes on to the door that already handles it (the focus gate, the
 * remix, the montage and audio cards, the studio panels, the catalog router, the generate lanes):
 *   control      stop · status · continue: about work in flight, in any tool;
 *   requote      a new frame shape, length or music start for the montage plan on screen;
 *   ask          a request missing its input (no track, no source, no photo, no video): Agent G asks, nothing runs;
 *   unsupported  an edit there is no route for yet (a new frame shape, a music offset, an edit of a previous result):
 *                Agent G says so plainly instead of making something else.
 */
import type { AgentIntent, Lang } from './contracts';

export type ActIntent = Extract<AgentIntent, { kind: 'act' }>;
export type Interception = 'requote' | 'ask' | 'unsupported' | null;

export interface InterceptContext {
  /** The composer's tool ('chat' or a focus tool). Only the chat's own lanes are taken over; a focus tool keeps its flow. */
  mode: string;
  /** Agent G's montage / audio routes are open to this user (AGENT_G_MEDIA_EXEC). */
  montageOn: boolean;
  audioOn: boolean;
}

/** Does the chat answer this act itself (and how), or does it go on to the existing doors? */
export function interceptAct(i: ActIntent, ctx: InterceptContext): Interception {
  if (ctx.mode !== 'chat') return null;
  if (i.capability === 'agent.montage') {
    if (!ctx.montageOn) return null;
    if (i.target === 'pending') return 'requote';
    return i.missing.length ? 'ask' : null;
  }
  if (i.capability === 'agent.audio-extract') return ctx.audioOn && i.missing.length ? 'ask' : null;
  if (i.capability === 'media.edit') return 'unsupported';
  // An edit OF the last result (its colours, captions, the next scene with its character, animating it): no route takes a
  // result of ours as its input yet (PART 3). Making a NEW picture or film from the words instead is what this prevents.
  if (i.target === 'previous' && (i.capability === 'video.remix' || i.capability === 'image.generate' || i.capability === 'video.generate')) {
    return 'unsupported';
  }
  if (i.missing.length && (i.capability === 'video.remix' || (i.capability === 'video.generate' && (i.params.fromImage || i.params.sameCharacter)))) {
    return 'ask';
  }
  return null;
}

const pick = (locale: string): Lang => (locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka');
const L = (lang: Lang, ka: string, en: string, ru: string): string => (lang === 'en' ? en : lang === 'ru' ? ru : ka);

/** Something running or waiting, as the chat knows it. */
export interface WorkItem {
  what: 'montage' | 'audio' | 'image' | 'music' | 'video' | 'avatar' | 'reply' | 'other';
  /** waiting = a plan card on screen, waiting for the user's Start. */
  status: 'waiting' | 'queued' | 'running';
  /** The tray's own label (already in the UI language), when there is one. */
  label?: string;
  pct?: number | null;
  /** The step in words (the card's own stage text), when known. */
  stage?: string | null;
}

const WHAT: Record<WorkItem['what'], { ka: string; en: string; ru: string }> = {
  montage: { ka: 'მონტაჟი', en: 'the montage', ru: 'монтаж' },
  audio: { ka: 'MP3-ის ამოღება', en: 'the MP3 extraction', ru: 'извлечение MP3' },
  image: { ka: 'სურათი', en: 'an image', ru: 'изображение' },
  music: { ka: 'მუსიკა', en: 'a track', ru: 'трек' },
  video: { ka: 'ვიდეო', en: 'a video', ru: 'видео' },
  avatar: { ka: 'ავატარის ვიდეო', en: 'an avatar video', ru: 'видео с аватаром' },
  reply: { ka: 'პასუხი', en: 'the reply', ru: 'ответ' },
  other: { ka: 'დავალება', en: 'a task', ru: 'задача' },
};

const nameOf = (w: WorkItem, lang: Lang): string => w.label?.trim() || WHAT[w.what][lang];

/** „Stop": what was stopped, or that nothing was running. A film's scenes already sent keep rendering: said, not hidden. */
export function stopReply(stopped: readonly WorkItem[], locale: string): string {
  const lang = pick(locale);
  if (!stopped.length) {
    return L(lang, 'ახლა არაფერი მუშაობს — გასაჩერებელი არაფერია.', 'Nothing is running right now, so there is nothing to stop.', 'Сейчас ничего не выполняется — останавливать нечего.');
  }
  const list = stopped.map((w) => nameOf(w, lang)).join(', ');
  const film = stopped.some((w) => w.what === 'video');
  const note = film
    ? ' ' + L(lang, 'ვიდეოს სცენები, რომლებიც უკვე გაიგზავნა, რენდერს თავის მხარეს აგრძელებს.', 'Video scenes already sent keep rendering on the engine\'s side.', 'Уже отправленные сцены видео продолжают рендериться на стороне движка.')
    : '';
  return L(lang, `⏹ გავაჩერე: ${list}.`, `⏹ Stopped: ${list}.`, `⏹ Остановлено: ${list}.`) + note;
}

/** „Where are you?": each running or waiting item with its step and percent, or that nothing is running. */
export function statusReply(items: readonly WorkItem[], locale: string): string {
  const lang = pick(locale);
  if (!items.length) {
    return L(lang, 'ახლა არაფერი მუშაობს. რასაც დაიწყებ, აქ გამოჩნდება მისი ნაბიჯები.', 'Nothing is running right now. When something starts, its steps show here.', 'Сейчас ничего не выполняется. Когда что-то начнётся, его шаги появятся здесь.');
  }
  const lines = items.map((w) => {
    const pct = typeof w.pct === 'number' && w.pct > 0 ? ` · ${Math.round(w.pct)}%` : '';
    const step = w.status === 'waiting'
      ? L(lang, 'გეგმა შენს „დაწყებას“ ელოდება', 'the plan is waiting for your Start', 'план ждёт вашего «Начать»')
      : w.status === 'queued'
        ? L(lang, 'რიგშია', 'queued', 'в очереди')
        : w.stage?.trim() || L(lang, 'მიმდინარეობს', 'running', 'выполняется');
    return `• ${nameOf(w, lang)} — ${step}${pct}`;
  });
  return `${L(lang, 'ახლა მუშაობს:', 'Running now:', 'Сейчас выполняется:')}\n${lines.join('\n')}`;
}

export type ContinueCase = 'nothing' | 'plan-waiting' | 'running';

/** „Go on": what continuing means here when it is not the cut-off reply (that one simply continues). */
export function continueReply(c: ContinueCase, locale: string): string {
  const lang = pick(locale);
  if (c === 'plan-waiting') {
    return L(lang, 'გეგმა მზადაა და შენს „დაწყებას“ ელოდება — ბარათზე დააჭირე და გავაგრძელებ.', 'The plan is ready and waiting for your Start — press it on the card and I will carry on.', 'План готов и ждёт вашего «Начать» — нажмите на карточке, и я продолжу.');
  }
  if (c === 'running') {
    return L(lang, 'ვმუშაობ და არ გავჩერებულვარ — ნაბიჯები ბარათზე ჩანს. „სადამდე მიხვედი?“ მკითხე და გეტყვი.', 'I am still working and have not stopped — the steps are on the card. Ask "how far along?" and I will tell you.', 'Я работаю и не останавливалась — шаги видны на карточке. Спросите «на каком этапе?», и я отвечу.');
  }
  return L(lang, 'შეწყვეტილი სამუშაო არ მაქვს. მითხარი, რა გავაგრძელო, ან ↻-ს დააჭირე ბოლო პასუხის ქვეშ.', 'There is no stopped work to pick up. Tell me what to continue, or press ↻ under the last reply.', 'Прерванной работы нет. Скажите, что продолжить, или нажмите ↻ под последним ответом.');
}

/** A request missing its input: what to send. Nothing has run and nothing is charged. */
export function askReply(i: ActIntent, locale: string): string {
  const lang = pick(locale);
  const m = new Set(i.missing);
  if (i.capability === 'agent.montage') {
    if (m.has('clips')) {
      return L(lang, 'დაურთე კლიპები და ერთი მუსიკის ფაილი (MP3 ან WAV) — დავჭრი ბითზე და ჯერ გეგმას გაჩვენებ.', 'Attach the clips and one music file (MP3 or WAV): I will cut them on the beat and show you the plan first.', 'Прикрепите клипы и один музыкальный файл (MP3 или WAV): я нарежу их в бит и сначала покажу план.');
    }
    return L(lang, 'კლიპები მაქვს, მუსიკა აკლია: დაურთე ერთი მუსიკის ფაილი (MP3 ან WAV) და იმავე სიტყვებით გამომიგზავნე.', 'I have the clips; the music is missing. Attach one music file (MP3 or WAV) and send the same words again.', 'Клипы есть, не хватает музыки: прикрепите один музыкальный файл (MP3 или WAV) и отправьте те же слова.');
  }
  if (i.capability === 'agent.audio-extract') {
    return L(lang, 'საიდან ამოვიღო? დაურთე ერთი ვიდეო ან აუდიო ფაილი, ან ჩასვი პირდაპირი ბმული მედიაფაილზე.', 'From what? Attach one video or audio file, or paste a direct link to a media file.', 'Откуда извлечь? Прикрепите один видео- или аудиофайл или вставьте прямую ссылку на медиафайл.');
  }
  if (i.capability === 'video.generate' && i.params.fromImage) {
    return L(lang, 'დაურთე ფოტო, რომელიც უნდა გავაცოცხლო, და იმავე სიტყვებით გამომიგზავნე.', 'Attach the photo to bring to life and send the same words again.', 'Прикрепите фото, которое нужно оживить, и отправьте те же слова.');
  }
  if (i.capability === 'video.generate' && i.params.sameCharacter) {
    return L(lang, 'ამ ჩატში წინა შედეგი არ მაქვს. დაურთე პერსონაჟის ფოტო ან კადრი და ვიდეოს ხელსაწყოში მისით გავაგრძელებ.', 'There is no earlier result in this chat. Attach a photo or a frame of the character and I will keep it in the Video tool.', 'В этом чате нет предыдущего результата. Прикрепите фото или кадр персонажа, и я сохраню его в инструменте «Видео».');
  }
  return L(lang, 'რომელ ვიდეოზე? დაურთე ვიდეო და იმავე სიტყვებით გამომიგზავნე.', 'Which video? Attach it and send the same words again.', 'Какое видео? Прикрепите его и отправьте те же слова.');
}

/** An edit with no route yet: said plainly, with the way that works today. */
export function unsupportedReply(i: ActIntent, locale: string): string {
  const lang = pick(locale);
  const op = i.params.editOp;
  if (op === 'aspect') {
    return L(lang, `ვიდეოს ფორმატის შეცვლა (${i.params.aspect ?? '9:16'}) ჩატში ჯერ არ შემიძლია. ახლა ასე გამოვა: „ვიდეოს მონტაჟში“ გახსენი, იქ ფორმატი აირჩიე; ან დაურთე კლიპები და მუსიკა — ბითზე მონტაჟს იმ ფორმატში დავჭრი.`, `I cannot change a video's frame shape (${i.params.aspect ?? '9:16'}) in the chat yet. What works today: open Video editing and pick the format there, or attach your clips and a track and I will cut them on the beat in that format.`, `Сменить формат видео (${i.params.aspect ?? '9:16'}) в чате я пока не могу. Сейчас так: откройте «Видеомонтаж» и выберите формат там, или прикрепите клипы и трек — я смонтирую их в бит в этом формате.`);
  }
  if (op === 'music_offset') {
    return L(lang, 'დასრულებულ ვიდეოში მუსიკის გადაწევა ჯერ არ შემიძლია. მონტაჟის გეგმაში კი შემიძლია: დაურთე კლიპები და მუსიკა და დაწერე, რომელი წამიდან დაიწყოს.', 'I cannot move the music in a finished video yet. In a montage plan I can: attach the clips and the track and say which second the music starts at.', 'Сдвинуть музыку в готовом видео я пока не могу. В плане монтажа могу: прикрепите клипы и трек и напишите, с какой секунды начать музыку.');
  }
  return L(lang, 'წინა შედეგის პირდაპირ შეცვლა ჩატში ჯერ არ შემიძლია. ჩამოტვირთე, თავიდან დაურთე და იმავე სიტყვებით გამომიგზავნე — ახალს არ შევქმნი მის ნაცვლად.', 'I cannot edit an earlier result directly in the chat yet. Download it, attach it again and send the same words — I will not make a new one in its place.', 'Изменить предыдущий результат прямо в чате я пока не могу. Скачайте его, прикрепите снова и отправьте те же слова — новый вместо него я делать не буду.');
}

/** Under a plan that a change in the chat replaced: where the new one is. */
export function replacedNote(locale: string): string {
  const lang = pick(locale);
  return L(lang, 'გეგმა შეიცვალა — ახალი ქვემოთაა.', 'Plan changed: the new one is below.', 'План изменён — новый ниже.');
}

/** The montage prompt that re-quotes a plan: the words it was planned from, then the change. */
export const mergeMontagePrompt = (base: string | undefined, change: string): string =>
  [base?.trim(), change.trim()].filter(Boolean).join('\n').slice(0, 2000);
