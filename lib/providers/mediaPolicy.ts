/**
 * lib/providers/mediaPolicy.ts — the refusal for a media tool with no Google engine (MASTER TASK v3.1, audit F-04).
 *
 * MEDIA_GOOGLE_ONLY used to be an opt-out switch: an explicit falsy value together with an owner approval reference in
 * OUTSIDE_ENGINES_APPROVED re-opened HeyGen, Kling, NanoBanana, Replicate, Higgsfield, Udio and LTX. v3.1 denies every
 * cross-provider fallback, so neither variable is read any more and the legs the switch guarded are deleted:
 *   · image (the Image tool and chat images) renders on Google's own image model (lib/ai/geminiImage);
 *   · a tool with no Google / ElevenLabs engine refuses BEFORE any charge, upload or provider call — 503 `google_only`,
 *     said in the user's language. Nothing is ever re-routed silently;
 *   · status / poll routes are never refused, so a job started before this change still finishes and settles.
 *
 * Every entry that refuses is listed in GATED_ENTRIES below, and lib/providers/mediaPolicy.test.ts checks that each
 * listed file really calls the guard, so the list cannot drift from the code.
 */
import { NextResponse } from 'next/server';
import { billingLocale } from '@/lib/api/billingCopy';

export const GOOGLE_ONLY_CODE = 'google_only' as const;

const MESSAGE = {
  ka: 'ეს ხელსაწყო დროებით შეჩერებულია, სანამ Google-ის ძრავაზე გადავა. თანხა არ ჩამოგეჭრა.',
  en: 'This tool is paused while it moves to Google’s engines. You were not charged.',
  ru: 'Этот инструмент временно приостановлен на время перехода на движки Google. Списания не было.',
} as const;

export function googleOnlyMessage(locale: string | null | undefined): string {
  return locale === 'en' ? MESSAGE.en : locale === 'ru' ? MESSAGE.ru : MESSAGE.ka;
}

/**
 * The refusal for an entry whose only engine is outside Google. Call it before any charge, upload or provider call. The
 * body carries every field the studio's readers look at (`code` / `error` for describeGenerationFailure, `message` for
 * describeOpFailure, `url` / `jobId` null for the panels that test those).
 */
export function refuseOutsideEngine(req?: Request | null): NextResponse {
  return NextResponse.json(
    {
      success: false,
      url: null,
      jobId: null,
      code: GOOGLE_ONLY_CODE,
      error: GOOGLE_ONLY_CODE,
      message: googleOnlyMessage(billingLocale(req ?? null)),
    },
    { status: 503 },
  );
}

/** Every user-facing entry that refuses, with what it refuses. `file` calls refuseOutsideEngine (pinned by the test). */
export const GATED_ENTRIES: ReadonlyArray<{ file: string; when: string }> = [
  { file: 'app/api/ai/edit/route.ts', when: 'object removal (Replicate inpaint) → refused; ffmpeg ops run' },
  { file: 'app/api/voice/train/route.ts', when: 'voice training (RVC on Replicate) → refused; the status GET stays open' },
  { file: 'app/api/generate/route.ts', when: 'studio models (Higgsfield) → refused; the job list stays open' },
  { file: 'app/api/genjutsu/generate/route.ts', when: 'motion / swap (Higgsfield) → refused; scene (Veo) runs' },
  { file: 'app/api/pipeline/route.ts', when: 'legacy wizard media legs (Nano Banana, HeyGen, World Labs, Udio, lip-sync) → refused; its text services run' },
  { file: 'app/api/heygen/presenter/route.ts', when: 'Avatar presenter (HeyGen) → refused; the status GET stays open' },
  { file: 'app/api/heygen/avatar/route.ts', when: 'HeyGen avatar video → refused; the poll GET stays open' },
  { file: 'app/api/video/voice-narration/route.ts', when: 'film narration in the trained voice (RVC on Replicate, uncharged) → refused; the film keeps its original narration' },
  { file: 'app/api/avatar/live/session/route.ts', when: 'live avatar session (HeyGen LiveAvatar, uncharged) → refused' },
  { file: 'app/api/video/lipsync/route.ts', when: 'talking photo / film lip-sync (HeyGen, SadTalker, sync) → refused' },
  // app/api/ai/music/route.ts and lib/ai/musicEnginesStatus.ts are not listed: since Music Studio v1 (Phase 2) they refuse /
  // show off every non-Google music engine with their own answer (lib/music/studio/boundary).
  { file: 'app/api/video/remix/route.ts', when: 'restyle / character / background / redub (NanoBanana, Kling, roop, sync) → refused; ffmpeg ops, voiceover and the Veo product ad run' },
  { file: 'app/api/motion-control/route.ts', when: 'Motion transfer (Kling) → refused' },
  { file: 'app/api/v2/model3d/create/route.ts', when: '3D (TRELLIS) → refused' },
  { file: 'app/api/ai/edit-photo/route.ts', when: 'photo editor (Replicate) → refused' },
  { file: 'app/api/ai/upscale/route.ts', when: 'upscale (Replicate) → refused' },
  { file: 'app/api/replicate/image/route.ts', when: 'raw Replicate route → refused' },
  { file: 'app/api/replicate/video/route.ts', when: 'raw Replicate route → refused' },
  { file: 'app/api/replicate/audio/route.ts', when: 'raw Replicate route → refused' },
  { file: 'app/api/replicate/avatar/route.ts', when: 'raw Replicate route → refused' },
  { file: 'app/api/replicate/photo/route.ts', when: 'raw Replicate route → refused' },
  { file: 'app/api/replicate/visual-ai/route.ts', when: 'raw Replicate route → refused' },
  { file: 'app/api/replicate/generate/route.ts', when: 'raw Replicate route → refused' },
  { file: 'app/api/udio/generate/route.ts', when: 'raw Udio route → refused' },
  { file: 'app/api/ltx-video/route.ts', when: 'raw LTX route → refused' },
  // MASTER TASK v3.1 PR 5d / 5e: the voice is Google Cloud TTS; what only ElevenLabs offered is refused.
  { file: 'app/api/elevenlabs/tts/route.ts', when: 'a named (ElevenLabs) voice → refused; no voice named, Cloud TTS reads it' },
  { file: 'app/api/orbit/[service]/route.ts', when: 'voice-synthesis in a named (ElevenLabs) voice → refused; no voice named, Cloud TTS reads it' },
  { file: 'app/api/voice-lab/jobs/route.ts', when: 'a job in a named (ElevenLabs) voice → refused; no voice named, Cloud TTS reads it' },
  { file: 'app/api/voice/clone/route.ts', when: 'voice cloning (ElevenLabs) → refused; the list, the default and deleting an earlier clone stay open' },
  { file: 'app/api/elevenlabs/sound/route.ts', when: 'sound effects (ElevenLabs sound-generation) → refused' },
  { file: 'app/api/audio/isolate/route.ts', when: 'vocal isolation (ElevenLabs Voice Isolator) → refused' },
  { file: 'app/api/ads/tts/route.ts', when: 'ad narration with character timings (ElevenLabs) → refused' },
  { file: 'app/api/v2/dubbing/start/route.ts', when: 'dubbing (ElevenLabs Scribe + timed TTS) → refused' },
];
