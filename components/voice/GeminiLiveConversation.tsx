'use client';

/**
 * GeminiLiveConversation — the full-screen Gemini Live call (tier 2 of ChatChrome's voice cascade).
 *
 * A thin host now: the call lives in components/voice/live/useGeminiLiveSession.ts (token mint, WebSocket,
 * AudioWorklet capture, playback queue, barge-in, resumption, captions, transcript sink), the camera in useLiveCamera,
 * and the screen in components/voice/live/LiveModeOverlay.tsx. This file wires them together, builds the spoken
 * persona, loads the user's enrolled avatar and owns the voice switch.
 *
 * CONTRACT WITH ChatChrome (unchanged): props `userId`, `locale`, `systemInstruction`, `gender`, `onClose`,
 * `onUnavailable`. A 503 from the token mint (GEMINI_LIVE_ENABLED kill switch off, key missing, mint failed) calls
 * `onUnavailable` so the parent falls back to VoiceConversation at RUNTIME, with no client redeploy.
 *
 * NEW, optional: `personaId` / `customPersona` (the PersonaPicker choice — until now Live ignored it), `onTurn` (the
 * transcript sink; without it every closed turn is dispatched as the window event LIVE_TRANSCRIPT_EVENT,
 * 'myavatar:live-transcript', for OmniStudio to append to the thread) and `onUsage`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
// Volume2, not AudioLines — this lucide version does not export the latter (verified against the installed package,
// the same trap that once cost a build over `Waves` vs `AudioLines`).
import { Volume2 } from 'lucide-react';

import { isEnabledByDefault } from '@/lib/env/flag';
import { GEMINI_LIVE_VOICES } from '@/lib/voice/geminiLive';
import { normalizeVoiceLocale } from '@/lib/voice/voicePrompt';

import LiveModeOverlay from './live/LiveModeOverlay';
import {
  buildLiveInstruction,
  useGeminiLiveSession,
  useLiveCamera,
  type LiveTurn,
  type LiveUsage,
} from './live/useGeminiLiveSession';

// Native Gemini Live is the DEFAULT voice (live-validated). Two independent kill switches revert to VoiceConversation:
// the CLIENT build-time flag NEXT_PUBLIC_GEMINI_LIVE_ENABLED (ChatChrome skips mounting this component) and the
// SERVER flag GEMINI_LIVE_ENABLED (503s the token mint → onUnavailable → the parent falls back at runtime).
export const geminiLiveEnabled = (): boolean => isEnabledByDefault(process.env.NEXT_PUBLIC_GEMINI_LIVE_ENABLED);

/**
 * The parity wire: input/output transcription (captions + the thread transcript), session resumption, sliding-window
 * compression and Google Search grounding. ON by default; NEXT_PUBLIC_GEMINI_LIVE_PARITY=0 pins the call to the legacy
 * wire verified live on 2026-07-24. Even when on, a failed first handshake retries once on the legacy wire, so an
 * endpoint that rejects a parity field costs captions, never the call.
 */
export const geminiLiveParityEnabled = (): boolean => isEnabledByDefault(process.env.NEXT_PUBLIC_GEMINI_LIVE_PARITY);

type Gender = 'female' | 'male';

interface Props {
  userId: string;
  locale?: 'ka' | 'en' | 'ru';
  /** Override the spoken persona (the platform prompt and the call rules are still appended). */
  systemInstruction?: string;
  /** Which built-in Google voice speaks first. Defaults to the persona's voice, else female (Aoede); male is Charon. */
  gender?: Gender;
  onClose: () => void;
  /**
   * Called when the Live token mint reports the server has disabled Gemini Live (503) — lets the parent fall back to
   * VoiceConversation at RUNTIME. This is what makes the server GEMINI_LIVE_ENABLED kill switch actually revert.
   */
  onUnavailable?: () => void;
  /** Active persona (PersonaPicker). Custom personas are re-validated by lib/agents/profile.ts. */
  personaId?: string | null;
  customPersona?: unknown;
  /** Transcript sink — one call per closed turn, user first. Default: the 'myavatar:live-transcript' window event. */
  onTurn?: (turn: LiveTurn) => void;
  onUsage?: (usage: LiveUsage) => void;
}

const genderOfVoice = (voice: string): Gender => (voice === 'Charon' || voice === 'Puck' ? 'male' : 'female');

export default function GeminiLiveConversation({
  userId,
  locale = 'ka',
  systemInstruction,
  gender,
  onClose,
  onUnavailable,
  personaId,
  customPersona,
  onTurn,
  onUsage,
}: Props) {
  const loc = normalizeVoiceLocale(locale);

  // Persona + Google-only platform prompt + spoken-call rules. Built here (not in the hook) so the hook stays a pure
  // transport; used only when the mint returns no server-locked setup.
  const instruction = useMemo(
    () => buildLiveInstruction({ locale: loc, personaId, customPersona, personaOverride: systemInstruction }),
    [loc, personaId, customPersona, systemInstruction],
  );

  // Which voice speaks. Toggling it reconnects (a fresh session; deliberate voice switches happen between sentences).
  const profileGender = genderOfVoice(instruction.voiceName);
  const [voiceGender, setVoiceGender] = useState<Gender>(gender ?? profileGender);
  const voiceName = voiceGender === profileGender ? instruction.voiceName : GEMINI_LIVE_VOICES[voiceGender];

  const session = useGeminiLiveSession({
    locale: loc,
    voiceName,
    systemInstruction: instruction.systemInstruction,
    temperature: instruction.temperature,
    tools: instruction.googleSearch ? ['google_search'] : [],
    parity: geminiLiveParityEnabled(),
    personaId,
    customPersona,
    onTurn,
    onUsage,
    onUnavailable,
  });
  const { start, stop, sendVideoFrame, status } = session;

  const camera = useLiveCamera({ onFrame: sendVideoFrame });
  const stopCamera = camera.stop;

  // Connect on mount; a voice switch reconnects with the new voice. The mount is NOT the user's gesture (ChatChrome
  // loads this screen with dynamic()): the Live button primes the audio context + mic inside its own click
  // (lib/voice/livePrime) and the session adopts them; without a prime, a context that will not start shows
  // "tap to turn on sound" rather than a silent call.
  useEffect(() => {
    void start();
    return () => stop();
  }, [start, stop, userId, voiceGender]);

  // A call that ended or failed must not keep the camera hot behind the error screen.
  useEffect(() => {
    if (status === 'error' || status === 'closed') stopCamera();
  }, [status, stopCamera]);

  // The user's enrolled LIVE-AVATAR poster (avatar/enroll → profiles.core_avatar_id): shown inside the orb and as the
  // backdrop, so the Live screen is the USER's avatar rather than an empty space. Best-effort; any miss → plain orb.
  const [avatarPoster, setAvatarPoster] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/avatar/core', { credentials: 'include' });
        if (!r.ok) return;
        const j = (await r.json().catch(() => ({}))) as { data?: { poster_url?: string | null; status?: string } };
        if (alive && j?.data?.poster_url && j.data.status === 'ready') setAvatarPoster(j.data.poster_url);
      } catch { /* fail-open — plain orb */ }
    })();
    return () => { alive = false; };
  }, [userId]);

  const endCall = useCallback(() => {
    stopCamera();
    stop();
    onClose();
  }, [onClose, stop, stopCamera]);

  const flipCamera = camera.flip;
  const onFlipCamera = useCallback(() => { void flipCamera(); }, [flipCamera]);

  // ⚠️ WAS A ♀ | ♂ GLYPH PAIR, COLOUR-CODED PINK AND BLUE. The control does not choose a GENDER, it chooses a VOICE
  // (Google Aoede vs Charon); the glyphs rendered at whatever weight the system font gave them; and pink/blue is a
  // convention this product has no reason to adopt. One labelled control says, in the user's language, which voice
  // is speaking. The aria-label announces the destination, because that is what activating it does.
  const voiceSwitch = (
    <button
      type="button"
      onClick={() => setVoiceGender((v) => (v === 'female' ? 'male' : 'female'))}
      aria-label={voiceGender === 'female'
        ? (loc === 'en' ? 'Switch to the male voice' : loc === 'ru' ? 'Переключить на мужской голос' : 'გადართე კაცის ხმაზე')
        : (loc === 'en' ? 'Switch to the female voice' : loc === 'ru' ? 'Переключить на женский голос' : 'გადართე ქალის ხმაზე')}
      className="flex h-12 min-w-[48px] shrink-0 touch-manipulation items-center justify-center gap-2 rounded-full px-3 text-app-text transition-colors duration-200 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60"
    >
      <Volume2 size={20} className="shrink-0 text-app-accent" aria-hidden />
      {/* Icon-only below `sm`: the pill must hold five controls on a 320 px phone; the aria-label still names it. */}
      <span className={`hidden whitespace-nowrap font-semibold sm:inline ${loc === 'ka' ? 'text-[16px]' : 'text-[15px]'}`}>
        {voiceGender === 'female'
          ? (loc === 'en' ? 'Female' : loc === 'ru' ? 'Женский' : 'ქალის')
          : (loc === 'en' ? 'Male' : loc === 'ru' ? 'Мужской' : 'კაცის')}
      </span>
    </button>
  );

  return (
    <LiveModeOverlay
      locale={loc}
      status={status}
      error={session.error}
      errorDetail={session.errorDetail}
      captions={session.captions}
      muted={session.muted}
      cameraOn={camera.on}
      cameraFacing={camera.facing}
      getLevels={session.getLevels}
      videoRef={camera.videoRef}
      avatarUrl={avatarPoster}
      onToggleMute={session.toggleMute}
      onToggleCamera={camera.toggle}
      onFlipCamera={onFlipCamera}
      onEnd={endCall}
      onRetry={session.retry}
      audioBlocked={session.audioBlocked}
      onResumeAudio={session.resumeAudio}
      extraControls={voiceSwitch}
      showCaptions={!session.degraded}
    />
  );
}
