/**
 * components/studio/music/musicDraft.ts — the Music tool panel's choices as a Music Studio v1 request. Pure.
 * Only fields the server's contract accepts are sent. The panel's length picks the model (lib/studio/musicEngines): up to
 * 30 s Lyria 3 Clip, longer Lyria 3 Pro (Full song ≈ 180 s) — an approximate length, never a promise.
 */
import type { MusicRequest } from '@/lib/music/studio/contracts';
import { LYRIA_CLIP_MAX_SEC, LYRIA_CLIP_MODEL, lyriaModelForSec, musicTargetSec } from '@/lib/studio/musicEngines';
import type { MusicDraft } from './MusicStudioCard';

export const MUSIC_STUDIO_DEFAULT_MODEL = LYRIA_CLIP_MODEL;

/** The client switch. Off by default; the server has its own (MUSIC_STUDIO_ENABLED) and refuses when that is off. */
export function musicStudioV1OnClient(): boolean {
  return process.env.NEXT_PUBLIC_MUSIC_STUDIO_V1 === '1';
}

const LABEL = /[^\p{L}\p{N} &/'+-]/gu;
const clean = (s: string | undefined) => (s ?? '').replace(LABEL, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);

export function musicDraftFromPanel(
  m: { prompt: string; genre: string; tempo: string; instrumental: boolean; voiceType: string; lyrics: string; duration?: number },
  locale: string,
): MusicDraft {
  const lang = locale === 'en' || locale === 'ru' ? locale : 'ka';
  const song = !m.instrumental;
  // The clip makes its own 30 s (a legacy 15 is that too); 60 / 90 / Full song name their own length, on Pro.
  const sec = Math.max(LYRIA_CLIP_MAX_SEC, musicTargetSec(m.duration ?? 30));
  const request: MusicRequest = {
    v: 1,
    prompt: m.prompt.trim().slice(0, 2000) || (lang === 'en' ? 'Instrumental track' : lang === 'ru' ? 'Инструментальный трек' : 'ინსტრუმენტული ტრეკი'),
    mode: song ? 'song' : 'instrumental',
    ...(clean(m.genre) ? { genre: clean(m.genre) } : {}),
    ...(m.tempo === 'slow' || m.tempo === 'medium' || m.tempo === 'fast' ? { tempo: m.tempo } : {}),
    ...(song && (m.voiceType === 'female' || m.voiceType === 'male' || m.voiceType === 'duet') ? { vocalGender: m.voiceType } : {}),
    ...(song && m.lyrics.trim() ? { lyrics: m.lyrics.trim().slice(0, 3000) } : {}),
    modelId: lyriaModelForSec(sec),
    durationSec: sec,
    locale: lang,
  };
  return { id: `md_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`, request };
}

export function musicStudioIntro(locale: string): string {
  return locale === 'en' ? 'Here is the plan and the exact price. Nothing is charged until you confirm.'
    : locale === 'ru' ? 'Вот план и точная цена. Ничего не списывается, пока вы не подтвердите.'
      : 'აი გეგმა და ზუსტი ფასი. სანამ არ დაადასტურებ, არაფერი ჩამოგეჭრება.';
}

/**
 * A Download link that downloads. A signed Storage link is another origin, where the browser ignores the `download`
 * attribute and OPENS the file instead (the app page is replaced by a bare player). Supabase Storage answers a signed
 * link with `download=<name>` as an attachment, so the page stays and the file is saved under that name.
 */
export function downloadHref(url: string, name: string): string {
  if (!/\/storage\/v1\/object\/sign\//.test(url) || /[?&]download=/.test(url)) return url;
  const safe = name.replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'track';
  return `${url}${url.includes('?') ? '&' : '?'}download=${encodeURIComponent(safe)}`;
}

/** The file name a track downloads as: myavatar-music-<id8>[-<label>].<ext>. */
export function trackFileName(jobId: string, mime: string | undefined, label?: string): string {
  const ext = /wav/.test(mime ?? '') ? 'wav' : /mp4|m4a|aac/.test(mime ?? '') ? 'm4a' : 'mp3';
  const words = label ? label.replace(/→.*$/, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40) : '';
  const tail = words ? `-${words}` : '';
  return `myavatar-music-${jobId.slice(0, 8)}${tail}.${ext}`;
}

/** A stored track's type from its path (`….wav?token=…`). */
export function mimeOfUrl(url: string): string {
  const ext = /\.(wav|m4a|mp3)(?:\?|#|$)/i.exec(url)?.[1]?.toLowerCase();
  return ext === 'wav' ? 'audio/wav' : ext === 'm4a' ? 'audio/mp4' : 'audio/mpeg';
}
