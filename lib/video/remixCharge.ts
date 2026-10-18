/**
 * Which video-remix ops cost credits — ONE list for the route that charges (app/api/video/remix) and for the chat, which
 * asks before a charged op runs (components/studio/OmniStudio, the chat-attached remix). The free ops are the local ffmpeg
 * ones (trim, captions, colour grade, speed, stabilise, watermark).
 *
 * The chat's classifier (/api/video/remix-intent) and the panel name some ops differently; REMIX_OP_ALIASES maps both to
 * the route's names, so "add_music" and "music" are one op with one price.
 */
import { creditCostFor } from '@/lib/credits/pricing';
import { PRICE_BOOK } from '@/lib/credits/priceBook';

export const REMIX_OP_ALIASES: Readonly<Record<string, string>> = {
  add_music: 'music', face_swap: 'character', character_swap: 'character', add_text_overlay: 'captions', add_subtitles: 'captions',
};

export const CHARGED_REMIX_OPS: ReadonlySet<string> = new Set(['voiceover', 'music', 'redub', 'restyle', 'character', 'background_remove', 'productad']);

export const canonicalRemixOp = (raw: string): string => REMIX_OP_ALIASES[raw] ?? raw;

export const isChargedRemixOp = (raw: string): boolean => CHARGED_REMIX_OPS.has(canonicalRemixOp(raw));

/**
 * What a charged remix op costs (every one but the product ad, which is billed as a video and never comes from the chat):
 * laying the user's own track under a clip is FFmpeg alone (the price book's remixMusic); every other charged op is priced
 * as the voice-over, the dearest of them (creditCostFor('remix')). No op named = the voice-over's price.
 */
export const remixOpCredits = (op?: string): number => (op && canonicalRemixOp(op) === 'music' ? PRICE_BOOK.remixMusic : creditCostFor('remix'));

type L = { ka: string; en: string; ru: string };
const OP_LABEL: Record<string, L> = {
  music: { ka: 'მუსიკა', en: 'Music', ru: 'Музыка' },
  character: { ka: 'პერსონაჟის შეცვლა', en: 'Change character', ru: 'Смена персонажа' },
  background_remove: { ka: 'ფონის მოცილება', en: 'Background removal', ru: 'Удаление фона' },
  voiceover: { ka: 'ვოისოვერი', en: 'Voiceover', ru: 'Озвучка' },
  redub: { ka: 'ხელახალი გახმოვანება', en: 'Redub (lip-sync)', ru: 'Переозвучка' },
  restyle: { ka: 'რესტაილი', en: 'Restyle', ru: 'Рестайл' },
};

/**
 * WHICH ENGINE does the edit, said before Create (GG 2026-10-11 PART 3: „the user understands the engine, the reason, the
 * files and the cost before confirming"). „Music" is our own FFmpeg laying the track under the clip — no AI at all — and
 * the ask said only „Music, 15 credits"; restyle / character / background / redub reach engines outside Google and
 * ElevenLabs (the route's OUTSIDE_ENGINE_OPS), and the ask never said that either.
 */
export type RemixEngine = 'ffmpeg' | 'elevenlabs_ffmpeg' | 'outside';
export function remixEngine(rawOp: string): RemixEngine {
  const op = canonicalRemixOp(rawOp);
  if (op === 'music') return 'ffmpeg';
  if (op === 'voiceover') return 'elevenlabs_ffmpeg';
  if (op === 'redub' || op === 'restyle' || op === 'character' || op === 'background_remove') return 'outside';
  return 'ffmpeg';
}

const ENGINE_TEXT: Record<RemixEngine, L> = {
  ffmpeg: {
    ka: 'ძრავა: FFmpeg ჩვენს სერვერზე — ტრეკი ვიდეოს ქვეშ ჩაჯდება, AI არ გამოიყენება.',
    en: 'Engine: FFmpeg on our server — the track is laid under the video, no AI is used.',
    ru: 'Движок: FFmpeg на нашем сервере — трек ляжет под видео, ИИ не используется.',
  },
  elevenlabs_ffmpeg: {
    ka: 'ძრავა: ElevenLabs (ხმა) + FFmpeg (ვიდეოსთან შერევა).',
    en: 'Engine: ElevenLabs (the voice) + FFmpeg (mixed into the video).',
    ru: 'Движок: ElevenLabs (голос) + FFmpeg (сведение с видео).',
  },
  outside: {
    ka: 'ძრავა: გარე სერვისი (არა Google ან ElevenLabs).',
    en: 'Engine: an outside service (not Google or ElevenLabs).',
    ru: 'Движок: внешний сервис (не Google и не ElevenLabs).',
  },
};

/**
 * Agent G's question before a charged edit of a video attached in the chat: the edit, the files it uses (by name), the
 * engine and the price, then Create / Edit.
 */
export function remixAskText(rawOp: string, credits: number, locale: string, files: readonly string[] = []): string {
  const op = canonicalRemixOp(rawOp);
  const lang = locale === 'en' || locale === 'ru' ? locale : 'ka';
  const label = OP_LABEL[op]?.[lang] ?? op;
  const named = files.filter(Boolean);
  const engine = ENGINE_TEXT[remixEngine(op)][lang];
  if (lang === 'en') return `This edit of your video, „${label}", costs ${credits} credits.${named.length ? ` Files: ${named.join(' + ')}.` : ''} ${engine} Shall I start?`;
  if (lang === 'ru') return `Эта правка видео, «${label}», стоит ${credits} кредитов.${named.length ? ` Файлы: ${named.join(' + ')}.` : ''} ${engine} Начать?`;
  return `ვიდეოს ეს რედაქტირება, „${label}", ${credits} კრედიტი ღირს.${named.length ? ` ფაილები: ${named.join(' + ')}.` : ''} ${engine} დავიწყო?`;
}
