/**
 * lib/music/studio/boundary.ts — the approved provider boundary for music (PROJECT_MASTER R7, Music Studio v1 Phase 2):
 * Google (Lyria) generates music; ElevenLabs only for explicitly permitted voice work; ffmpeg edits. An entry whose only
 * engine is outside that boundary (Udio, Replicate MusicGen / Demucs / MiniMax / RVC) answers this refusal BEFORE any
 * charge, upload or provider call — whatever MEDIA_GOOGLE_ONLY says. Status / poll routes are never refused, so a job
 * started earlier still finishes and settles.
 */
import { NextResponse } from 'next/server';
import { billingLocale } from '@/lib/api/billingCopy';

export const MUSIC_UNSUPPORTED = 'unsupported' as const;

const MESSAGE = {
  ka: 'ეს მუსიკის ფუნქცია მიუწვდომელია — დამტკიცებულ ძრავაზე ჯერ არ არსებობს. თანხა არ ჩამოგეჭრა.',
  en: 'This music feature is not available — it has no approved engine yet. You were not charged.',
  ru: 'Эта музыкальная функция недоступна — для неё пока нет одобренного движка. Списания не было.',
} as const;

export function musicUnsupportedMessage(locale: string | null | undefined): string {
  return locale === 'en' ? MESSAGE.en : locale === 'ru' ? MESSAGE.ru : MESSAGE.ka;
}

export function musicUnsupportedResponse(req?: Request | null): NextResponse {
  return NextResponse.json(
    { success: false, ok: false, url: null, jobId: null, code: MUSIC_UNSUPPORTED, error: MUSIC_UNSUPPORTED, message: musicUnsupportedMessage(billingLocale(req ?? null)) },
    { status: 400 },
  );
}
