/**
 * lib/agent/intent.ts — what one message asks Agent G for, as one typed answer (lib/agent/contracts AgentIntent).
 * Pure, ka · en · ru, no network, safe on the client.
 *
 * WHY. Every door had its own partial reading of a message, and the gaps between them were where the product misbehaved
 * (Agent G PART 0, gaps A2/A3/A5):
 *   · „სამუშაო შეწყვიტე" („stop the work") typed with the Image tool open got the image tool's clarify card;
 *     „შენი წინა ნაბიჯიდან გააგრძელე" („go on from your last step") got a price card for a picture of that sentence;
 *   · „არ მომწონს" („I don't like it") was a two-word image prompt;
 *   · „ვიდეო 9:16-ზე გადაიყვანე" with a video attached was answered as a question about the video;
 *   · „ამ სამი ვიდეოდან მუსიკალური კლიპი გამიკეთე" with three clips and no track went to the remix: the first clip only;
 *   · „მუსიკა 5 წამიდან დაიწყე" under a montage plan was read as nothing at all, and the plan kept its old start.
 *
 * HOW, WITHOUT A SECOND ROUTER. This file adds no new list of service words. It asks the detectors that already decide
 * each lane (focusGate, studioIntent, intentDetector, videoIntent, the catalog's agentRoute, montageChat, audioChat) in a
 * fixed order and adds only what none of them covered: stop / status / continue, feedback, edits of something that
 * already exists, the parameters (lib/agent/params), and which input is missing. Deterministic on purpose (the owner's
 * supplement: deterministic routing stays where it is faster and more reliable): nothing here can invent a capability
 * the words did not name, and nothing here spends: an `act` is a request to PLAN; every charge still waits for the
 * user's own approval of a price (lib/agent/contracts AgentApproval).
 *
 * ORDER (first match wins):
 *   control → talk / feedback → question → MP3 → a change to the plan on screen → montage → dubbing → animate a photo →
 *   same character → edits → other studio services → catalog → generate → the focus tool's own gate → chat.
 */
import { classifyFocusInput, looksLikeQuestion, talkReason, type GateMode } from '@/lib/chat/focusGate';
import { detectIntent, isGenerativeCommand, resolveGenerativeLane } from '@/lib/chat/intentDetector';
import { detectStudioIntent } from '@/lib/chat/studioIntent';
import { isVideoEditRequest } from '@/lib/chat/videoIntent';
import { routeAgentIntent } from '@/lib/catalog/agentRoute';
import { resolveService } from '@/lib/catalog/services';
import { beatMontageAsk, hasMontageWords } from '@/lib/agent/media/montageChat';
import { asksNarration } from '@/lib/agent/media/montageAsk';
import { audioExtractAsk, wantsAudioFile } from '@/lib/agent/media/audioChat';
import { withoutLinks } from '@/lib/agent/media/audioSource';
import { asksForEdit, mineEdits, onlyDescribing } from '@/lib/agent/media/editWords';
import { hasPlanParams, mineParams } from './params';
import { parseSelection } from './media/sourceSelect';
import type {
  ActTarget, AgentIntent, AttachmentKind, CapabilityId, ControlOp, EditOp, IntentParams, Lang, MissingInput,
} from './contracts';

export interface IntentInput {
  text: string;
  attachments?: readonly AttachmentKind[];
  /** The composer's tool: 'chat', or a focus tool ('image' | 'video' | 'music' | 'lipsync' | …). */
  mode?: string;
  /** The last finished result in the conversation. */
  previous?: { kind: 'video' | 'image' | 'audio' } | null;
  /** A plan card shown and waiting for Start. */
  pending?: { capability: CapabilityId } | null;
  /** The UI language: used when the words carry no script of their own (a number, an emoji). */
  locale?: string;
}

// ─── Words ───────────────────────────────────────────────────────────────────────────────────────────────────────────

const B0 = '(?<![\\p{L}\\p{N}])';
const B1 = '(?![\\p{L}\\p{N}])';

const squash = (s: string): string =>
  s.normalize('NFKC').toLowerCase().replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').trim();
const words = (s: string): string[] => squash(s).match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? [];

/** The script decides the language; a message with none takes the UI's. */
export function langOf(text: string, locale?: string): Lang {
  const ka = (text.match(/[ა-ჿ]/g) ?? []).length;
  const ru = (text.match(/[Ѐ-ӿ]/g) ?? []).length;
  const en = (text.match(/[A-Za-z]/g) ?? []).length;
  if (ka + ru + en === 0) return locale === 'en' || locale === 'ru' ? locale : 'ka';
  if (ka >= ru && ka >= en) return 'ka';
  return ru >= en ? 'ru' : 'en';
}

// ─── Control: stop · status · continue ──────────────────────────────────────────────────────────────────────────────

const CONTROL: Readonly<Record<ControlOp, readonly string[]>> = {
  stop: [
    'stop', 'cancel', 'abort', 'halt', 'stop it', 'cancel it', 'stop everything', 'stop generating', 'stop generation',
    'stop rendering', 'stop working', 'stop the job', 'cancel the job',
    'შეწყვიტე', 'შეწყვიტეთ', 'შეაჩერე', 'გააჩერე', 'გაუქმე', 'გააუქმე', 'გაჩერდი', 'შეჩერდი', 'მორჩი', 'კმარა', 'სტოპ',
    'стоп', 'остановись', 'останови', 'остановить', 'прекрати', 'прекратить', 'отмени', 'отменить', 'хватит', 'перестань',
  ],
  status: [
    'status', 'progress', 'where are you', 'where are you at', 'how far', 'how far along', 'how far are you',
    "what's the status", 'what is the status', "what's the progress", 'what is the progress', 'any progress', 'any update',
    'any updates', 'update', 'are you done', 'is it done', 'is it ready', 'are you finished', 'how much longer',
    'how long left', 'how much is left', 'eta',
    'სადამდე მიხვედი', 'სად მიხვედი', 'სადამდე მივიდა', 'სად ხარ მისული', 'რა ეტაპზეა', 'რა ეტაპზე ხარ', 'რა ეტაპზე',
    'რა მდგომარეობაა', 'რა სტატუსია', 'სტატუსი', 'პროგრესი', 'მზადაა', 'მზად არის', 'დამთავრდა', 'დასრულდა',
    'რამდენი დარჩა', 'რამდენი ხანი დარჩა', 'როდის იქნება მზად', 'როდის დამთავრდება',
    'статус', 'прогресс', 'на каком этапе', 'на каком ты этапе', 'на каком вы этапе', 'на каком сейчас этапе', 'как продвигается', 'как успехи', 'готово', 'уже готово', 'сколько осталось',
    'когда будет готово', 'докуда дошёл', 'докуда дошел', 'докуда дошла', 'ты закончил', 'ты закончила',
  ],
  continue: [
    'continue', 'go on', 'keep going', 'resume', 'carry on', 'continue from where you stopped',
    'გააგრძელე', 'განაგრძე', 'გააგრძელეთ', 'გაგრძელება', 'განაახლე',
    'продолжай', 'продолжи', 'продолжить', 'продолжаем', 'возобнови', 'дальше', 'давай дальше',
  ],
};

/** Words a control message may carry besides its verb: what to stop, where to go on from, who is addressed. */
const CONTROL_FILLER = new Set([
  'it', 'this', 'that', 'the', 'a', 'now', 'please', 'pls', 'job', 'jobs', 'task', 'tasks', 'work', 'working',
  'generation', 'generating', 'render', 'rendering', 'process', 'everything', 'all', 'run', 'from', 'where', 'you', 'left',
  'off', 'stopped', 'your', 'last', 'previous', 'step', 'there', 'up', 'at', 'are', 'with', 'of', 'my', 'video', 'montage',
  'edit', 'then', 'so', 'ok', 'okay', 'agent', 'g', 'just', 'right', 'away',
  'სამუშაო', 'სამუშაოს', 'დავალება', 'დავალებას', 'გენერაცია', 'გენერაციას', 'რენდერი', 'რენდერს', 'პროცესი', 'პროცესს',
  'ყველაფერი', 'ყველაფერს', 'ეს', 'ამას', 'ახლა', 'გთხოვ', 'შენი', 'შენ', 'წინა', 'ნაბიჯიდან', 'ნაბიჯი', 'ბოლო', 'საიდანაც',
  'სადაც', 'იქიდან', 'გაჩერდი', 'შეჩერდი', 'უკვე', 'ჩემი', 'ვიდეო', 'ვიდეოს', 'მონტაჟი', 'მონტაჟს', 'ოკ', 'კარგი', 'აგენტ',
  'ჯი', 'კიდევ', 'და', 'მერე', 'ხარ', 'ახლავე', 'ეგ',
  'работу', 'работа', 'задачу', 'задача', 'генерацию', 'генерация', 'рендер', 'процесс', 'всё', 'все', 'это', 'сейчас',
  'пожалуйста', 'с', 'того', 'места', 'где', 'ты', 'остановился', 'остановилась', 'своего', 'последнего', 'шага',
  'предыдущего', 'уже', 'моё', 'моя', 'видео', 'монтаж', 'ок', 'агент', 'джи', 'же', 'там', 'немедленно',
]);

const MAX_CONTROL_WORDS = 9;

/** Does `toks` contain `phrase` as consecutive tokens, with every other token a filler? */
function controlHit(toks: readonly string[], phrase: string): boolean {
  const pt = phrase.split(' ');
  for (let i = 0; i + pt.length <= toks.length; i += 1) {
    if (!pt.every((p, j) => toks[i + j] === p)) continue;
    const rest = [...toks.slice(0, i), ...toks.slice(i + pt.length)];
    if (rest.every((t) => CONTROL_FILLER.has(t))) return true;
  }
  return false;
}

/** „Stop", „where are you?", „go on" — about work in flight. Short messages only: a sentence with a subject is a prompt. */
export function controlOp(text: string): ControlOp | null {
  const toks = words(text);
  if (!toks.length || toks.length > MAX_CONTROL_WORDS) return null;
  for (const op of ['stop', 'status', 'continue'] as const) {
    if (CONTROL[op].some((p) => controlHit(toks, p))) return op;
  }
  return null;
}

// ─── Requests phrased as questions ─────────────────────────────────────────────────────────────────────────────────

/** "Can you …?", „შეგიძლია …?", «Можешь …?» — a request in question form. The lead and the „?" are taken off. */
const POLITE_LEAD = new RegExp(
  `^\\s*(?:please\\s+)?(?:(?:can|could|would|will)\\s+you(?:\\s+please)?|(?:შეგიძლია|შეგიძლიათ|შეძლებ)(?:\\s+გთხოვ)?|(?:можешь|можете|сможешь|сможете|не\\s+могли\\s+бы\\s+вы)(?:\\s+пожалуйста)?)${B1}[\\s,]*`,
  'iu',
);

function politeCore(text: string): string | null {
  if (!POLITE_LEAD.test(text)) return null;
  const core = text.replace(POLITE_LEAD, '').replace(/[\s?？؟!.]+$/u, '').trim();
  return core || null;
}

// ─── Edits of something that exists ───────────────────────────────────────────────────────────────────────────────

const SUBTITLES = new RegExp(`სუბტიტრ|subtitle|${B0}captions?${B1}|субтитр`, 'iu');
const COLOR = new RegExp(`${B0}ფერ\\p{L}*|${B0}colou?rs?${B1}|${B0}grade${B1}|${B0}tint${B1}|${B0}цвет\\p{L}*`, 'iu');
const CHANGE = /შეცვალ|შეუცვალ|გააუმჯობეს|გაათბ|გააცივ|გააღიავ|გაამუქ|შეასწორ|change|update|tweak|modify|adjust|fix|correct|improve|grade|warmer|cooler|brighter|darker|измени|поменяй|исправь|улучши|сделай/iu;
/** A frame-shape change is a CONVERSION of something there: „გადაიყვანე", "convert", "make it", «переведи». */
const CONVERT = /გადაიყვან|გადამიყვან|გადააკეთ|გადამიკეთ|გახადე|გამიხადე|ჩასვი|convert|change|turn|make\s+it|resize|reframe|crop|switch|переведи|конвертируй|сделай|измени|переделай|обрежь/iu;
const ANIMATE = /გააცოცხლ|გამიცოცხლ|ააცოცხლ|აამოძრავ|ამიმოძრავ|animate|bring\s+(?:it|this|the\s+photo|this\s+photo|the\s+picture)?\s*to\s+life|make\s+(?:it|this|the\s+photo|this\s+photo)\s+move|оживи|анимируй|заставь\s+двигаться/iu;
const PHOTO_REF = new RegExp(
  `${B0}(?:ეს|ამ|ჩემი|this|that|my|the)\\s+(?:ფოტო\\p{L}*|სურათ\\p{L}*|photo|picture|image|pic|selfie)|${B0}(?:это|эту|этот|моё|мою)\\s+(?:фото\\p{L}*|картинк\\p{L}*|изображени\\p{L}*)`,
  'iu',
);
const SAME_CHARACTER = /იგივე\s+პერსონაჟ|იმავე\s+პერსონაჟ|იგივე\s+გმირ|same\s+(?:character|person|hero|guy|girl|actor)|тем\s+же\s+(?:персонаж|героем)|того\s+же\s+(?:персонаж|героя)/iu;
const PREVIOUS_REF = /წინა\s*(?:შედეგ|ვიდეო|სურათ|ფოტო|ვერსი|ვარიანტ)|ბოლო\s*(?:შედეგ|ვიდეო|სურათ)|previous|last\s+(?:one|result|video|image|picture|version)|the\s+result|предыдущ|последн\p{L}*\s+(?:результат|видео|картинк|вариант)|прошл\p{L}*\s+(?:результат|видео)/iu;
/** „ამ სამი ვიდეოდან", "these three clips", «из этих трёх видео»: clips the user means to have attached. */
const CLIPS_REF = new RegExp(
  `${B0}(?:ამ|ეს|ჩემი)\\s+(?:\\d+|ორი|სამი|ოთხი|ხუთი|რამდენიმე)?\\s*(?:ვიდეო|კლიპ|კადრ)\\p{L}*|${B0}(?:these|those|my|the)\\s+(?:\\d+|two|three|four|five|several|few)?\\s*(?:clips|videos|shots|footage)|${B0}(?:эти|этих|мои|моих)\\s+(?:\\d+|двух|трёх|трех|нескольких)?\\s*(?:видео|клип\\p{L}*|ролик\\p{L}*)`,
  'iu',
);
/** A message that asks for something NEW („a", "another", „ახალი") is not a change to the plan on screen. */
const NEW_THING = new RegExp(`${B0}(?:a|an|another|new|ახალი|სხვა|новый|новое|новую|другой|другое)${B1}`, 'iu');
/**
 * „მუსიკალური კლიპი", "music video", «музыкальный клип»: the Video tool's music-video mode when no clips are attached (with
 * clips it is the montage). Video Core v1.0 AC-01: on 30be5a2 these words reached nothing — the catalog leaves the Video
 * tool to the generate gate, that gate wants the verb FIRST (Georgian never puts it there), and in Russian the music rule
 * outweighed the video rule, so «сделай … музыкальный клип» asked for a SONG.
 */
const MUSIC_VIDEO = new RegExp(`მუსიკალურ\\p{L}*\\s+(?:კლიპ|ვიდეო)\\p{L}*|${B0}ვიდეო\\s*კლიპ\\p{L}*|${B0}music\\s+video|музыкальн\\p{L}*\\s+(?:клип|видео)|${B0}видеоклип`, 'iu');
/** „მინდა", "I want", «хочу»: a wish is a request. */
const WANT = new RegExp(`${B0}(?:i\\s+want|i\\s+need|i'd\\s+like|let's\\s+make|მინდა|მჭირდება|გავაკეთო|хочу|нужен|нужно|давай)${B1}`, 'iu');
/**
 * A Georgian make-verb ANYWHERE („ერთწუთიანი ვიდეო გამიკეთე ზღვაზე"): the verb comes last, so the lead-verb gate
 * (lib/chat/intentDetector isGenerativeCommand) never sees it. Never with an analysis noun: „ვიდეოს ანალიზი გამიკეთე" is
 * a question about the file, not a render.
 */
const KA_MAKE = /გამიკეთ|გააკეთ|შემიქმენ|შექმენ|დამიგენერირ|დააგენერირ|დაგენერირ|დამიმზად|გადამიღ|გადაიღ/u;
const KA_ANALYSIS = /ანალიზ|აღწერ/u;
/**
 * A writing verb leads („დაწერე", "write", «напиши»): the result is TEXT about a video («напиши пост про предыдущее
 * видео», "write a script for the video"), never the video. A song stays the music lane's ("write me a song").
 */
const WRITING_LEAD = new RegExp(
  `^\\s*(?:please\\s+|გთხოვ\\s+|пожалуйста\\s+)?(?:write|rewrite|draft|translate|summari[sz]e|explain|paraphrase|proofread|დაწერ|დამიწერ|მომწერ|გადაწერ|გადამიწერ|თარგმნ|მითარგმნ|ახსენ|ამიხსენ|შეაჯამ|напиши|перепиши|переведи|объясни|перескажи)`,
  'iu',
);

const REMIX_OPS: ReadonlyArray<{ op: EditOp; re: RegExp }> = [
  { op: 'stabilize', re: /სტაბილ|stabili[sz]|стабилиз|shaky|jitter/iu },
  { op: 'speed', re: /სიჩქარ|გააჩქარ|შეანელ|speed|slow\s*(?:it\s*)?down|faster|slower|ускор|замедл|скорост/iu },
  { op: 'trim', re: /მოჭერ|მოჭრ|შემოკლ|trim|cut\s+(?:the|off|out)|обрез|обрежь/iu },
  { op: 'music', re: /მუსიკ|music|soundtrack|музык/iu },
  { op: 'background_remove', re: /ფონ\p{L}*\s*(?:მოა?შორ|ამოი?ღ|წაშ)|remove\s*(?:the\s*)?background|убер\S*\s*фон|удал\S*\s*фон/iu },
  { op: 'character', re: /პერსონაჟ|face\s*swap|swap\s*(?:the\s*)?(?:face|character)|замен\S*\s*(?:лиц|персонаж)/iu },
];

// ─── The classifier ─────────────────────────────────────────────────────────────────────────────────────────────────

const LANE: Record<string, CapabilityId> = {
  image_generation: 'image.generate',
  video_generation: 'video.generate',
  music_generation: 'music.generate',
  avatar_generation: 'avatar.talking',
};

const STUDIO: Record<string, CapabilityId> = {
  dubbing: 'voice.dubbing',
  presentation: 'design.presentation',
  model3d: 'design.model3d',
  avatar: 'avatar.talking',
  montage: 'video.editing',
};

const FOCUS: Record<string, { gate: GateMode; capability: CapabilityId }> = {
  image: { gate: 'image', capability: 'image.generate' },
  video: { gate: 'video', capability: 'video.generate' },
  music: { gate: 'music', capability: 'music.generate' },
  lipsync: { gate: 'avatar', capability: 'avatar.talking' },
};

export function classifyAgentIntent(input: IntentInput): AgentIntent {
  const raw = String(input.text ?? '').trim();
  const lang = langOf(raw, input.locale);
  const kinds: AttachmentKind[] = [...(input.attachments ?? [])];
  const prev = input.previous?.kind ?? null;
  const nVideo = kinds.filter((k) => k === 'video').length;
  const nAudio = kinds.filter((k) => k === 'audio').length;
  const nImage = kinds.filter((k) => k === 'image').length;

  if (!words(raw).length) return { kind: 'chat', lang };

  const act = (capability: CapabilityId, target: ActTarget, params: IntentParams = {}, missing: MissingInput[] = []): AgentIntent =>
    ({ kind: 'act', capability, target, params, missing, lang });

  // 1) Work in flight — whatever tool is open. Only with nothing attached: a file plus „stop" is not about a job.
  if (!kinds.length) {
    const op = controlOp(raw);
    if (op) return { kind: 'control', op, lang };
  }

  // 2) Talk and feedback (the focus gate's own lists).
  const talk = talkReason(raw);
  if (talk === 'feedback') return { kind: 'feedback', lang };
  if (talk && talk !== 'empty' && !kinds.length) return { kind: 'talk', reason: talk, lang };

  // 3) A question is answered in words. A request phrased as a question („can you …?") is read without its lead.
  const polite = politeCore(raw);
  if (!polite && looksLikeQuestion(raw) && !isGenerativeCommand(raw)) return { kind: 'question', lang };
  const text = polite ?? raw;
  const params = mineParams(text);

  // 4) The sound of a file or a link, as an MP3.
  const audio = audioExtractAsk(text, kinds);
  if (audio) return act('agent.audio-extract', audio.source === 'link' ? 'link' : 'attachment');
  if (wantsAudioFile(withoutLinks(text))) return act('agent.audio-extract', 'new', {}, ['source']);

  // 5) A change to the montage plan on screen: a new frame shape, length, music start or source selection („მარტო ბოლო
  //    შვიდი", lib/agent/media/sourceSelect), and nothing new asked for. The same files are quoted again.
  if (input.pending?.capability === 'agent.montage' && !kinds.length && (hasPlanParams(params) || parseSelection(text) !== null) && words(text).length <= 10
    && !NEW_THING.test(text) && !routeAgentIntent(text) && !detectStudioIntent(text)) {
    return act('agent.montage', 'pending', params);
  }

  // 6) A montage of the attached pictures: to a track, under the clips' own sound, or with none sent (GG 2026-10-11
  //    17:38Z). Words that make the music the point with no track sent, or clips named but not attached: say what is
  //    missing.
  if (beatMontageAsk(text, kinds)) return act('agent.montage', 'attachment', params);
  if (nAudio === 0 && nVideo + nImage >= 2 && nVideo + nImage === kinds.length && asksNarration(text) && hasMontageWords(text)) {
    return act('agent.montage', 'attachment', params, ['narration']);
  }
  // („Озвучь это видео" alone is dubbing, not a montage missing its track.)
  if (nAudio === 0 && (nVideo >= 1 || nImage >= 2) && nVideo + nImage === kinds.length && !asksNarration(text) && beatMontageAsk(text, [...kinds, 'audio'])) {
    return act('agent.montage', 'attachment', params, ['track']);
  }
  if (!kinds.length && CLIPS_REF.test(text) && beatMontageAsk(text, ['video', 'video', 'audio'])) {
    return act('agent.montage', 'new', params, ['clips', 'track']);
  }

  const studio = detectStudioIntent(text);
  const videoTarget: ActTarget | null = nVideo >= 1 ? 'attachment' : !kinds.length && prev === 'video' ? 'previous' : null;

  // 7) Dubbing names its language („რუსულად").
  if (studio?.service === 'dubbing') {
    const p: IntentParams = studio.params.targetLanguage ? { targetLanguage: studio.params.targetLanguage } : {};
    return act('voice.dubbing', videoTarget ?? 'new', p, videoTarget ? [] : ['video']);
  }

  // 8) „ეს ფოტო გააცოცხლე": a photo becomes a clip (image→video).
  if (ANIMATE.test(text) && (nImage >= 1 || prev === 'image' || PHOTO_REF.test(text))) {
    const target: ActTarget = nImage >= 1 ? 'attachment' : prev === 'image' ? 'previous' : 'new';
    return act('video.generate', target, { ...params, fromImage: true, editOp: 'animate' }, target === 'new' ? ['photo'] : []);
  }

  // 9) „იგივე პერსონაჟით შემდეგი სცენა": the next scene with the character of the last result.
  if (SAME_CHARACTER.test(text)) {
    const target: ActTarget = nImage >= 1 ? 'attachment' : prev === 'video' || prev === 'image' ? 'previous' : 'new';
    return act('video.generate', target, { ...params, sameCharacter: true }, target === 'new' ? ['previous'] : []);
  }

  // 10) Edits of a video or picture that exists (attached, or the last result).
  const generative = isGenerativeCommand(text);
  if (SUBTITLES.test(text) && !generative) {
    return act('video.remix', videoTarget ?? 'new', { ...params, editOp: 'captions' }, videoTarget ? [] : ['video']);
  }
  if (params.aspect && CONVERT.test(text) && !generative && !NEW_THING.test(text)) {
    return act('media.edit', videoTarget ?? 'new', { ...params, editOp: 'aspect' }, videoTarget ? [] : ['video']);
  }
  if (params.musicStartSec !== undefined && !generative) {
    return act('media.edit', videoTarget ?? 'new', { ...params, editOp: 'music_offset' }, videoTarget ? [] : ['video']);
  }
  // „მარტო ბოლო ხუთი" about the last result: the montage's own files planned again with only those pictures (counted
  // as they were sent; lib/agent/chatTurn remontage). A quote again, nothing runs before Start.
  if (!kinds.length && prev === 'video' && !generative && parseSelection(text) !== null && words(text).length <= 10 && !NEW_THING.test(text)) {
    return act('agent.montage', 'previous', params);
  }
  if (COLOR.test(text) && CHANGE.test(text) && !(generative && NEW_THING.test(text))) {
    const onImage = nImage >= 1 || (!kinds.length && prev === 'image');
    const onVideo = nVideo >= 1 || (!kinds.length && prev === 'video');
    const target: ActTarget = nImage + nVideo >= 1 ? 'attachment' : onImage || onVideo ? 'previous' : 'new';
    if (onVideo) return act('video.remix', target, { ...params, editOp: 'color' });
    if (onImage) return act('image.generate', target, { ...params, editOp: 'color' });
    if (PREVIOUS_REF.test(text)) return act('media.edit', 'previous', { ...params, editOp: 'color' }, ['previous']);
  }
  if (nVideo >= 1 && isVideoEditRequest(text)) {
    const op = REMIX_OPS.find((r) => r.re.test(text))?.op;
    return act('video.remix', 'attachment', op ? { ...params, editOp: op } : params);
  }
  if (!kinds.length && prev === 'video' && PREVIOUS_REF.test(text) && isVideoEditRequest(text)) {
    const op = REMIX_OPS.find((r) => r.re.test(text))?.op;
    return act('video.remix', 'previous', op ? { ...params, editOp: op } : params);
  }
  // „წინა ვიდეო შავ-თეთრი გახადე", "mute the last video", „make the last video 2× faster": an edit the edit's own words
  // (media/editWords) can read, of the last video, and nothing new asked for. Before the generate lanes, which would
  // otherwise make a new video from „make the last video …". Words that also describe a picture („წინა ვიდეო უფრო ნათელი
  // იყო", "the previous one was warmer") are an edit only when the message asks for one: a remark goes to the chat.
  if (!kinds.length && prev === 'video' && PREVIOUS_REF.test(text) && !NEW_THING.test(text)) {
    const mined = mineEdits(text);
    if ((mined.edits.length || mined.unsupported.length) && (!onlyDescribing(mined) || asksForEdit(text))) return act('media.edit', 'previous', params);
  }

  // 11b) „24-წამიანი მუსიკალური კლიპი გამიკეთე", "a 24-second music video", «музыкальный клип на 24 секунды» with no
  //      clips attached: the Video tool in music-video mode, at that length (with clips it is the montage, step 6). A
  //      request is an imperative or a make-verb, a wish („მინდა", "I want"), or a length or frame shape named for it.
  if (MUSIC_VIDEO.test(text) && nVideo + nImage === 0
    && (generative || KA_MAKE.test(text) || WANT.test(text) || params.durationSec !== undefined || params.aspect !== undefined)) {
    return act('video.music-video', nAudio ? 'attachment' : 'new', params);
  }

  // 11) The other studio services (presentation, 3D, avatar, the editor).
  if (studio) return act(STUDIO[studio.service]!, 'new', { ...params, ...(studio.params.durationSec ? { durationSec: studio.params.durationSec } : {}) });

  // 12) The catalog: a service with its own tool, or one that is not available yet.
  const route = routeAgentIntent(text);
  if (route?.kind === 'unavailable') {
    return { kind: 'unavailable', capability: route.service.id as CapabilityId, alternative: (route.alternative?.id as CapabilityId | undefined) ?? null, lang };
  }
  if (route?.kind === 'open') {
    const id = route.service.id as CapabilityId;
    const needsPhoto = id === 'video.product-ad' && nImage === 0 && prev !== 'image';
    return act(id, nImage >= 1 ? 'attachment' : 'new', params, needsPhoto ? ['photo'] : []);
  }

  // 13) „Make me …": the generate lanes. A Georgian make-verb at the END of a video ask („ერთწუთიანი ვიდეო გამიკეთე
  //     ზღვაზე") counts too, when the words read as a video and name no analysis (Video Core v1.0 AC-01).
  const detected = detectIntent(text);
  const kaVideo = !generative && nVideo === 0 && KA_MAKE.test(text) && !KA_ANALYSIS.test(text) && detected.intent === 'video_generation' && detected.confidence >= 0.7;
  if (generative || kaVideo) {
    const lane = resolveGenerativeLane(text, detected);
    // «напиши пост про видео», "write a script for the video": text about a video is the chat's, not a render.
    if (lane && !(lane === 'video_generation' && WRITING_LEAD.test(text))) {
      const svc = resolveService(text);
      const id = svc && svc.status !== 'coming-soon' && svc.tool && LANE[lane]!.split('.')[0] === svc.id.split('.')[0] ? (svc.id as CapabilityId) : LANE[lane]!;
      return act(id, kinds.length ? 'attachment' : 'new', params);
    }
  }

  // 14) A focus tool's own words: its gate decides whether there is enough to make.
  const focus = input.mode ? FOCUS[input.mode] : undefined;
  if (focus) {
    const v = classifyFocusInput({ text, mode: focus.gate, hasAttachments: kinds.length > 0 });
    if (v.kind === 'chat') return { kind: 'question', lang };
    return act(focus.capability, kinds.length ? 'attachment' : 'new', params, v.kind === 'clarify' ? ['detail'] : []);
  }

  // 15) A request phrased as a question that asked for nothing we do is still a question.
  return polite ? { kind: 'question', lang } : { kind: 'chat', lang };
}

/** Does this intent ever lead to a job (after the user approves its price)? Talk, questions, feedback and control never do. */
export const intentCanSpend = (i: AgentIntent): boolean => i.kind === 'act' && i.missing.length === 0;
