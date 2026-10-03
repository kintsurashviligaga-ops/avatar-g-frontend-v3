'use client';

/**
 * GeminiLiveConversation — the full-screen Gemini Live call (tier 2 of ChatChrome's voice cascade).
 *
 * A thin host now: the call lives in components/voice/live/useGeminiLiveSession.ts (token mint, WebSocket,
 * AudioWorklet capture, playback queue, barge-in, resumption, captions, transcript sink), the camera in useLiveCamera,
 * and the screen in components/voice/live/LiveModeOverlay.tsx. This file wires them together, builds the spoken
 * persona and owns the voice switch. (It no longer loads the user's enrolled avatar poster: the agent on the call is
 * the rocket — LiveOrb — not a photo of the user.)
 *
 * CONTRACT WITH ChatChrome (unchanged): props `userId`, `locale`, `systemInstruction`, `gender`, `onClose`,
 * `onUnavailable`. A 503 from the token mint (GEMINI_LIVE_ENABLED kill switch off, key missing, mint failed) calls
 * `onUnavailable` so the parent falls back to VoiceConversation at RUNTIME, with no client redeploy.
 *
 * NEW, optional: `personaId` / `customPersona` (the PersonaPicker choice — until now Live ignored it), `onTurn` (the
 * transcript sink; without it every closed turn is dispatched as the window event LIVE_TRANSCRIPT_EVENT,
 * 'myavatar:live-transcript', for OmniStudio to append to the thread) and `onUsage`.
 *
 * VOICE-TO-ACTION (docs/voice/LIVE_ACTIONS.md): the call asks for the UI-action functions and EXECUTES them here —
 * live/liveActions.ts validates each call, dispatches `myavatar:live-action` (OmniStudio switches + prefills, never
 * runs) / `myavatar:open-artifact` (code), answers the model at once, and the overlay shows a card per action. A card's
 * Open ends the call and brings that studio (focused) or the canvas to the front — except a link (open_url), whose
 * Open opens the tab inside the user's tap and keeps the call going; end_call hangs up after the goodbye.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// Volume2, not AudioLines — this lucide version does not export the latter (verified against the installed package,
// the same trap that once cost a build over `Waves` vs `AudioLines`).
import { Volume2 } from 'lucide-react';

import { isEnabledByDefault } from '@/lib/env/flag';
import { GEMINI_LIVE_VOICES } from '@/lib/voice/geminiLive';
import { LIVE_CALL_EVENT, LIVE_RESULT_EVENT, type LiveResultNote } from '@/lib/voice/liveTools';
import { normalizeVoiceLocale } from '@/lib/voice/voicePrompt';

import LiveModeOverlay, { LiveControl } from './live/LiveModeOverlay';
import type { LiveJobLine } from './live/LiveActivityFeed';
import { useJobQueue } from '@/store/useJobQueue';
import { mergeTrayJobs } from '@/lib/jobs/durableJobs';
import {
  LIVE_END_CALL_GRACE_MS,
  LIVE_END_CALL_MAX_WAIT_MS,
  openLiveUrl,
  revealLiveAction,
  useLiveActions,
  type LiveActionCard,
} from './live/liveActions';
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
  /** Talk to a finished research report (its id): the server loads it for the owner and gives it to the model. */
  researchId?: string | null;
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
  researchId,
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

  // Voice-to-action: the server decides whether the token carries the functions (GEMINI_LIVE_ACTIONS); this screen
  // asks because it executes them.
  const liveActions = useLiveActions();

  const session = useGeminiLiveSession({
    locale: loc,
    voiceName,
    systemInstruction: instruction.systemInstruction,
    temperature: instruction.temperature,
    tools: instruction.googleSearch ? ['google_search'] : [],
    parity: geminiLiveParityEnabled(),
    personaId,
    customPersona,
    researchId,
    onTurn,
    onUsage,
    onUnavailable,
    actions: true,
    onToolCall: liveActions.onToolCall,
    onToolCallCancellation: liveActions.onToolCallCancellation,
  });
  const { start, stop, sendVideoFrame, status, interrupt } = session;

  // ── THE CALL ON THE SCREEN ─────────────────────────────────────────────────────────────────────────────────────
  // Full screen while you only talk; DOCKED into a slim bar the moment the agent changes something on screen (a studio,
  // a prompt, a chat message, a panel), so the user watches it happen instead of finding it after hanging up. The user
  // can flip either way (the bar's ⤢, the full screen's „ეკრანის ნახვა“), and so can the model (call_view).
  const [docked, setDocked] = useState(false);
  const { screenSeq, viewRequest } = liveActions;
  useEffect(() => { if (screenSeq > 0) setDocked(true); }, [screenSeq]);
  useEffect(() => { if (viewRequest) setDocked(viewRequest.view === 'screen'); }, [viewRequest]);
  // An error needs the full screen (its message, Retry); the overlay also refuses to dock on one.
  useEffect(() => { if (status === 'error') setDocked(false); }, [status]);
  const toggleDock = useCallback(() => setDocked((d) => !d), []);

  // Tell the studio a call is on (`myavatar:live-call` + <html data-live-call>): while it is, the call's turns stay in
  // ONE conversation even when the agent switches tools — the studio's per-tool session swap would otherwise split the
  // call's transcript across threads.
  useEffect(() => {
    const el = document.documentElement;
    el.dataset.liveCall = '1';
    try { window.dispatchEvent(new CustomEvent(LIVE_CALL_EVENT, { detail: { active: true } })); } catch { /* old engines */ }
    return () => {
      delete el.dataset.liveCall;
      try { window.dispatchEvent(new CustomEvent(LIVE_CALL_EVENT, { detail: { active: false } })); } catch { /* old engines */ }
    };
  }, []);

  // [App] NOTES: the studio announces each new result (or a failure) while the call is on (LIVE_RESULT_EVENT); the model
  // hears it, so a plan of several steps goes on by itself — „make music, then the video, then put them together"
  // (owner, 2026-10-03). Held while the agent is speaking or thinking (text arriving then would cut it off) and sent
  // the moment it listens again.
  const notesRef = useRef<string[]>([]);
  const statusRef = useRef(status);
  statusRef.current = status;
  const sendNote = session.sendNote;
  const flushNotes = useCallback(() => {
    if (!notesRef.current.length || statusRef.current !== 'listening') return;
    const text = notesRef.current.join(' ');
    if (sendNote(text)) notesRef.current = [];
  }, [sendNote]);
  useEffect(() => {
    const onResult = (e: Event) => {
      const n = (e as CustomEvent<LiveResultNote>).detail;
      if (!n || typeof n !== 'object') return;
      const what = typeof n.what === 'string' && n.what.trim() ? n.what.trim().slice(0, 160) : '';
      const note = n.kind === 'failed'
        ? `[App] A generation failed${what ? `: "${what}"` : ''}. Tell the user plainly and offer to try again.`
        : `[App] A new ${n.kind === 'audio' ? 'music track' : n.kind} is ready on screen${what ? `: "${what}"` : ''} — it is now result 1. `
          + 'If the user asked for more steps, continue with the next one now; otherwise tell them in one short sentence.';
      notesRef.current = [...notesRef.current, note].slice(-4);
      flushNotes();
    };
    window.addEventListener(LIVE_RESULT_EVENT, onResult);
    return () => window.removeEventListener(LIVE_RESULT_EVENT, onResult);
  }, [flushNotes]);
  useEffect(() => { flushNotes(); }, [status, flushNotes]);

  // Generations still rendering: the full-screen call covers the job tray, so the call shows them itself.
  const localJobs = useJobQueue((s) => s.jobs);
  const durableJobs = useJobQueue((s) => s.durableJobs);
  const jobLines = useMemo<LiveJobLine[]>(
    () => mergeTrayJobs(localJobs, durableJobs)
      .filter((j) => j.status === 'rendering' || j.status === 'queued')
      .map((j) => ({ id: j.id, label: j.label, pct: j.status === 'queued' ? null : j.pct, stage: j.stage })),
    [localJobs, durableJobs],
  );

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

  // ⚠️ The call used to fetch the user's enrolled avatar poster (/api/avatar/core) and show it inside the orb and as a
  // blurred backdrop — on the owner's phone, a cropped photo of a man as the face of the AGENT. The agent is MyAvatar's:
  // the orb and the backdrop carry the rocket (LiveOrb), and that request is gone.

  const endCall = useCallback(() => {
    stopCamera();
    stop();
    onClose();
  }, [onClose, stop, stopCamera]);

  // end_call. ⚠️ Function calls BLOCK the model's turn: it speaks its goodbye only AFTER our answer, so hanging up on
  // the call itself cut the goodbye off. Hang up once nothing is playing (a short grace), or — if the goodbye is
  // playing — when it ends, bounded. Through a ref: ChatChrome passes a fresh onClose every render, and a re-armed
  // timer per parent render could postpone the hang-up forever.
  const endCallRef = useRef(endCall);
  endCallRef.current = endCall;
  const { endRequested } = liveActions;
  useEffect(() => {
    if (!endRequested || status === 'closed') return; // 'closed' = already hung up (no second onClose)
    const goodbyePlaying = status === 'speaking' || status === 'thinking';
    const timer = setTimeout(() => endCallRef.current(), goodbyePlaying ? LIVE_END_CALL_MAX_WAIT_MS : LIVE_END_CALL_GRACE_MS);
    return () => clearTimeout(timer);
  }, [endRequested, status]);

  // A card's Open: end the call, then bring what was prepared to the front. ⚠️ A task LATER, not now: the overlay's
  // useDialogA11y hands focus back to the Live chip synchronously as it unmounts, and the studio's composer must take
  // focus after that — never while the call's modal dialog is still up.
  // A link is the exception: it opens NOW, inside the tap (a task later would be outside the gesture and blocked), and
  // the call goes on — the user asked to see a page, not to hang up. (LiveActionCards opens it itself; this is the guard.)
  const openAction = useCallback((card: LiveActionCard) => {
    if (card.action.type === 'open_url') { openLiveUrl(card.action.url); return; }
    endCall();
    setTimeout(() => revealLiveAction(card.action), 0);
  }, [endCall]);

  const flipCamera = camera.flip;
  const onFlipCamera = useCallback(() => { void flipCamera(); }, [flipCamera]);

  // ⚠️ WAS A ♀ | ♂ GLYPH PAIR, COLOUR-CODED PINK AND BLUE. The control does not choose a GENDER, it chooses a VOICE
  // (Google Aoede vs Charon); the glyphs rendered at whatever weight the system font gave them; and pink/blue is a
  // convention this product has no reason to adopt. One labelled control says, in the user's language, which voice
  // is speaking. It is one of the call's round controls (LiveControl): the word under it is the voice speaking now, and
  // the accessible name starts with that word (WCAG 2.5.3) and then says what activating it does.
  const voiceWord = voiceGender === 'female'
    ? (loc === 'en' ? 'Female' : loc === 'ru' ? 'Женский' : 'ქალის')
    : (loc === 'en' ? 'Male' : loc === 'ru' ? 'Мужской' : 'კაცის');
  const voiceSwitch = (
    <LiveControl
      label={voiceWord}
      ariaLabel={voiceGender === 'female'
        ? (loc === 'en' ? 'Female voice — switch to the male voice' : loc === 'ru' ? 'Женский голос — переключить на мужской' : 'ქალის ხმა — გადართე კაცის ხმაზე')
        : (loc === 'en' ? 'Male voice — switch to the female voice' : loc === 'ru' ? 'Мужской голос — переключить на женский' : 'კაცის ხმა — გადართე ქალის ხმაზე')}
      icon={<Volume2 size={22} className="text-app-accent" aria-hidden />}
      onClick={() => setVoiceGender((v) => (v === 'female' ? 'male' : 'female'))}
      locale={loc}
      testId="live-voice-switch"
    />
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
      onToggleMute={session.toggleMute}
      onToggleCamera={camera.toggle}
      onFlipCamera={onFlipCamera}
      onEnd={endCall}
      onRetry={session.retry}
      audioBlocked={session.audioBlocked}
      onResumeAudio={session.resumeAudio}
      extraControls={voiceSwitch}
      showCaptions={!session.degraded}
      actions={liveActions.cards}
      onOpenAction={openAction}
      activity={session.activity}
      jobs={jobLines}
      docked={docked}
      onToggleDock={toggleDock}
      onStopSpeaking={interrupt}
      pendingRun={liveActions.pendingRun}
      onCancelRun={liveActions.cancelRun}
    />
  );
}
