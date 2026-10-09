/**
 * MEDIA_GOOGLE_ONLY — the switch that makes every user-facing media tool run on Google or ElevenLabs only
 * (PROJECT_MASTER R7, certification §L, owner action 9).
 *
 * OPT-IN, DEFAULT OFF. Until the owner turns it on, every tool keeps the engine it has today; turning it on is one env
 * var and a redeploy, and turning it off again is the rollback. VIDEO_GOOGLE_ONLY (lib/veo/policy) and AI_GOOGLE_ONLY
 * (lib/ai/google/policy) already hold video and text to Google, default ON; this covers what they never reached: image,
 * avatar, music extras, remix edits, motion, 3D, the photo / audio editors and the raw vendor routes.
 *
 * When ON:
 *   · image (the Image tool and chat images) renders on Google's own image model (lib/ai/geminiImage);
 *   · a tool with no Google / ElevenLabs engine yet refuses BEFORE any charge or provider call — 503 `google_only`,
 *     said in the user's language — instead of reaching an outside engine. Nothing is ever re-routed silently;
 *   · status / poll routes are never gated, so a job started before the switch still finishes and settles.
 *
 * Every gated entry is listed in GATED_ENTRIES below, and lib/providers/mediaPolicy.test.ts checks that each listed
 * file really calls the guard — so the list is the switch's documentation and cannot drift from the code.
 */
import { NextResponse } from 'next/server';
import { isTruthyFlag } from '@/lib/env/flag';
import { billingLocale } from '@/lib/api/billingCopy';

export const GOOGLE_ONLY_CODE = 'google_only' as const;

export function isMediaGoogleOnly(env: NodeJS.ProcessEnv = process.env): boolean {
  return isTruthyFlag(env.MEDIA_GOOGLE_ONLY);
}

const MESSAGE = {
  ka: 'ეს ხელსაწყო დროებით შეჩერებულია, სანამ Google-ის ძრავაზე გადავა. თანხა არ ჩამოგეჭრა.',
  en: 'This tool is paused while it moves to Google’s engines. You were not charged.',
  ru: 'Этот инструмент временно приостановлен на время перехода на движки Google. Списания не было.',
} as const;

export function googleOnlyMessage(locale: string | null | undefined): string {
  return locale === 'en' ? MESSAGE.en : locale === 'ru' ? MESSAGE.ru : MESSAGE.ka;
}

/**
 * The refusal for an entry that would reach an outside engine, or null when the switch is off. Call it before any
 * charge, upload or provider call. The body carries every field the studio's readers look at (`code` / `error` for
 * describeGenerationFailure, `message` for describeOpFailure, `url` / `jobId` null for the panels that test those).
 */
export function refuseOutsideEngine(req?: Request | null, env: NodeJS.ProcessEnv = process.env): NextResponse | null {
  if (!isMediaGoogleOnly(env)) return null;
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

/**
 * Every user-facing entry the switch governs, with what it does when ON. `file` is the route that calls
 * refuseOutsideEngine / isMediaGoogleOnly (pinned by the test).
 */
export const GATED_ENTRIES: ReadonlyArray<{ file: string; when: string }> = [
  { file: 'app/api/nanobanana/image/route.ts', when: 'Image tool → Google image model instead of NanoBanana' },
  { file: 'lib/chat/ServiceManager.ts', when: 'chat images → Imagen / Google image model only' },
  { file: 'app/api/heygen/presenter/route.ts', when: 'Avatar presenter (HeyGen) → refused' },
  { file: 'app/api/heygen/avatar/route.ts', when: 'HeyGen avatar video → refused' },
  { file: 'app/api/video/lipsync/route.ts', when: 'talking photo / film lip-sync (HeyGen, SadTalker, sync) → refused' },
  { file: 'app/api/ai/music/route.ts', when: 'Udio / MusicGen picks, cover (MusicGen), sample voice (MiniMax), trained voice (RVC) → refused; Lyria and ElevenLabs Music run' },
  { file: 'lib/ai/musicEnginesStatus.ts', when: 'the music picker shows Udio / MusicGen as off' },
  { file: 'app/api/video/remix/route.ts', when: 'restyle / character / background / redub (NanoBanana, Kling, roop, sync) → refused; ffmpeg ops, voiceover and the Veo product ad run' },
  { file: 'app/api/motion-control/route.ts', when: 'Motion transfer (Kling) → refused' },
  { file: 'app/api/v2/model3d/create/route.ts', when: '3D (TRELLIS) → refused' },
  { file: 'app/api/ai/edit-photo/route.ts', when: 'photo editor (Replicate) → refused' },
  { file: 'app/api/ai/edit-audio/route.ts', when: 'vocal isolation / splitter (Demucs) → refused; ffmpeg ops run' },
  { file: 'app/api/ai/upscale/route.ts', when: 'upscale (Replicate) → refused' },
  { file: 'lib/services/dubbing/dubbingPipeline.ts', when: 'dubbing keeps the ducked original bed instead of a Demucs split' },
  { file: 'app/api/replicate/image/route.ts', when: 'raw Replicate route → refused' },
  { file: 'app/api/replicate/video/route.ts', when: 'raw Replicate route → refused' },
  { file: 'app/api/replicate/audio/route.ts', when: 'raw Replicate route → refused' },
  { file: 'app/api/replicate/avatar/route.ts', when: 'raw Replicate route → refused' },
  { file: 'app/api/replicate/photo/route.ts', when: 'raw Replicate route → refused' },
  { file: 'app/api/replicate/visual-ai/route.ts', when: 'raw Replicate route → refused' },
  { file: 'app/api/replicate/generate/route.ts', when: 'raw Replicate route → refused' },
  { file: 'app/api/udio/generate/route.ts', when: 'raw Udio route → refused' },
  { file: 'app/api/ltx-video/route.ts', when: 'raw LTX route → refused' },
];
