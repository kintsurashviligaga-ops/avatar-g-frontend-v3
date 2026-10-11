/**
 * lib/chat/chatMediaRoute.ts — where a chat turn with SEVERAL VIDEOS goes, and the plain words for what the user
 * attached. Pure: no DOM, no network.
 *
 * ⚠️ THE BUG THIS EXISTS FOR (GG, 2026-10-11 05:00Z, Production). Three clips + one MP3 + „ეს ოთხივე ფაილი გამოიყენე,
 * ვიდეოები დაამონტაჟე, მუსიკას დაამთხვიე" was answered by the video REMIX: it found the word „მუსიკ", took the FIRST
 * video and the track, uploaded only those two, laid the song under clip one (`-shortest`) and showed a „Music" edit —
 * the other two clips were dropped without a word. Agent G's montage was closed on the account (AGENT_G_MEDIA_EXEC),
 * and the free Montage editor was never offered because „დაამონტაჟე" did not match the montage words either.
 *
 * The rule now: a remix edits ONE video. With two or more videos attached the turn is
 *   · a montage (montage / cut / music words) → Agent G's montage when it is open and the files fit it; otherwise the
 *     Montage editor, opened with EVERY clip in order and the track as its music, and a sentence saying why;
 *   · a one-video edit („add subtitles") → a question: which one — nothing is dropped, the tray is kept;
 *   · anything else → a question about the videos, answered from ALL of them.
 */
import { isVideoEditRequest, isVideoQuestion } from './videoIntent';
import { hasMontageWords, hasMusicWords, type AttachmentKind } from '@/lib/agent/media/montageChat';

export type MultiVideoRoute = 'montage_editor' | 'pick_one_video' | 'video_question';

/** The route for a chat turn carrying two or more videos; null for fewer (the one-video paths decide those). */
export function multiVideoRoute(text: string, kinds: readonly AttachmentKind[]): MultiVideoRoute | null {
  const videos = kinds.filter((k) => k === 'video').length;
  if (videos < 2) return null;
  const t = (text || '').trim();
  if (!t || isVideoQuestion(t)) return 'video_question';
  if (hasMontageWords(t)) return 'montage_editor';
  if (kinds.includes('audio') && hasMusicWords(t)) return 'montage_editor';
  if (isVideoEditRequest(t)) return 'pick_one_video';
  return 'video_question';
}

type Lang = 'ka' | 'en' | 'ru';
const langOf = (locale: string): Lang => (locale === 'en' || locale === 'ru' ? locale : 'ka');

export interface NamedAttachment { kind: AttachmentKind; name?: string }

const KIND_WORD: Record<Lang, Record<AttachmentKind, string>> = {
  ka: { video: 'ვიდეო', audio: 'აუდიო', image: 'ფოტო', other: 'ფაილი' },
  en: { video: 'video', audio: 'audio', image: 'photo', other: 'file' },
  ru: { video: 'видео', audio: 'аудио', image: 'фото', other: 'файл' },
};

/** „3 ვიდეო + 1 აუდიო" — the count of each kind, in the order video, audio, photo, other. */
export function kindsLine(items: readonly NamedAttachment[], locale: string): string {
  const lang = langOf(locale);
  const order: AttachmentKind[] = ['video', 'audio', 'image', 'other'];
  return order
    .map((k) => [k, items.filter((i) => i.kind === k).length] as const)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => {
      const w = KIND_WORD[lang][k];
      return lang === 'en' && n > 1 && k !== 'audio' ? `${n} ${w}s` : `${n} ${w}`;
    })
    .join(' + ');
}

/** The files by name, in order, numbered: „1. clipA.mp4, 2. clipB.mp4". A file with no name is called by its kind. */
export function namesLine(items: readonly NamedAttachment[], locale: string): string {
  const lang = langOf(locale);
  return items.map((i, n) => `${n + 1}. ${i.name || KIND_WORD[lang][i.kind]}`).join(', ');
}

/**
 * What the chat says when it opens the Montage editor with the attachments: which files went where, why Agent G did
 * not cut it itself, and that the export costs nothing.
 */
export function montageEditorOpenedText(
  items: readonly NamedAttachment[],
  reason: 'agent_closed' | 'agent_shape',
  locale: string,
): string {
  const lang = langOf(locale);
  const clips = items.filter((i) => i.kind === 'video' || i.kind === 'image');
  const tracks = items.filter((i) => i.kind === 'audio');
  const music = tracks[0];
  const extra = tracks.slice(1);
  const clipNames = clips.map((c, n) => `${n + 1}. ${c.name || KIND_WORD[lang][c.kind]}`).join(', ');
  const musicName = music ? (music.name || KIND_WORD[lang].audio) : '';
  if (lang === 'en') {
    const why = reason === 'agent_closed'
      ? 'Agent G\'s automatic beat-cut montage is not switched on for this account yet, so'
      : 'Agent G\'s automatic montage takes video clips and exactly one track, so';
    return `${why} I opened the **Montage** editor with all ${clips.length} clips on the timeline, in your order (${clipNames})`
      + (music ? ` and **${musicName}** as the music.` : '.')
      + (extra.length ? ` Only one track fits under the edit: ${extra.map((e) => e.name || 'audio').join(', ')} is not used.` : '')
      + ' Check the order, then press Export — it costs no credits.';
  }
  if (lang === 'ru') {
    const why = reason === 'agent_closed'
      ? 'Автоматический монтаж Agent G под бит на этом аккаунте пока не включён, поэтому'
      : 'Автоматический монтаж Agent G берёт только видео и ровно один трек, поэтому';
    return `${why} я открыл редактор **Монтаж**: все ${clips.length} клипа на таймлайне в вашем порядке (${clipNames})`
      + (music ? `, **${musicName}** — музыкой.` : '.')
      + (extra.length ? ` Под монтаж помещается один трек: ${extra.map((e) => e.name || 'аудио').join(', ')} не используется.` : '')
      + ' Проверьте порядок и нажмите «Экспорт» — это бесплатно.';
  }
  const why = reason === 'agent_closed'
    ? 'Agent G-ის ავტომატური მონტაჟი (ბიტზე დაჭრა) ამ ანგარიშზე ჯერ ჩართული არ არის, ამიტომ'
    : 'Agent G-ის ავტომატური მონტაჟი მხოლოდ ვიდეოებს და ზუსტად ერთ ტრეკს იღებს, ამიტომ';
  return `${why} გავხსენი **მონტაჟის** რედაქტორი: ${clips.length}-ვე კლიპი თაიმლაინზეა შენი თანმიმდევრობით (${clipNames})`
    + (music ? `, **${musicName}** — მუსიკად.` : '.')
    + (extra.length ? ` მონტაჟის ქვეშ ერთი ტრეკი ეტევა: ${extra.map((e) => e.name || 'აუდიო').join(', ')} არ გამოიყენება.` : '')
    + ' შეამოწმე თანმიმდევრობა და დააჭირე „ექსპორტს" — კრედიტი არ იხარჯება.';
}

/** A one-video edit asked of several videos: which one? Every file stays in the tray. */
export function pickOneVideoText(items: readonly NamedAttachment[], locale: string): string {
  const lang = langOf(locale);
  const videos = items.filter((i) => i.kind === 'video');
  const list = videos.map((v, n) => `${n + 1}. ${v.name || KIND_WORD[lang].video}`).join(', ');
  if (lang === 'en') return `This edit works on one video, and you attached ${videos.length} (${list}). Remove the others and send again — or write „montage" to join them all into one video.`;
  if (lang === 'ru') return `Эта правка делается с одним видео, а вы прикрепили ${videos.length} (${list}). Уберите лишние и отправьте снова — или напишите «смонтируй», чтобы собрать их в одно видео.`;
  return `ეს რედაქტირება ერთ ვიდეოზე კეთდება, შენ კი ${videos.length} მიამაგრე (${list}). დატოვე ერთი და ხელახლა გაგზავნე — ან დაწერე „დაამონტაჟე", რომ ყველა ერთ ვიდეოდ შევკრა.`;
}
