'use client';

/**
 * GeminiLiveConversation — the full-screen Gemini Live call (tier 2 of ChatChrome's voice cascade).
 *
 * A thin host now: the call lives in components/voice/live/useGeminiLiveSession.ts (token mint, WebSocket,
 * AudioWorklet capture, playback queue, barge-in, resumption, captions, transcript sink), the camera in useLiveCamera,
 * and the screen in components/voice/live/LiveModeOverlay.tsx. This file wires them together, builds the spoken
 * persona and owns the voice switch. (It no longer loads the user's enrolled avatar poster, and the 2026-10-03 rocket is
 * retired from the call too: the screen is the owner's approved one, LiveCallChrome's glow and voice pill.)
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
import { ScanFace, Volume2 } from 'lucide-react';

import { isEnabledByDefault } from '@/lib/env/flag';
import { GEMINI_LIVE_VOICES } from '@/lib/voice/geminiLive';
import { LIVE_CALL_EVENT, LIVE_PLAN_KINDS, LIVE_RESULT_EVENT, type LivePlanKind, type LiveResultNote } from '@/lib/voice/liveTools';
import { normalizeVoiceLocale } from '@/lib/voice/voicePrompt';
import { AVATAR_FALLBACK_MIME } from '@/lib/voice/fmp4';
import { isMisheardScript } from '@/lib/voice/heardScript';
import { avatarPlaybackSupported } from '@/lib/voice/fmp4Player';
import { isTestLinkNotice } from '@/components/studio/ui/serviceError';
import type { AvatarAudioOutput } from '@/lib/voice/avatarAudio';
import { LIVE_AVATAR_MAX_MS, defaultLiveAvatar, liveAvatarEnabled } from '@/lib/voice/liveAvatar';

import LiveModeOverlay, { LiveControl } from './live/LiveModeOverlay';
import { LIVE_AVATAR_STRINGS, useLiveAvatarPlayer } from './live/LiveAvatarStage';
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

const PLAN_WORD: Record<LivePlanKind, string> = { audio: 'MP3', montage: 'montage', edit: 'video edit' };

/** The [App] note for an Agent G plan card: its number, its facts, and how it may start (only after the user's yes). */
export function planNote(n: number, kind: LivePlanKind, what: string): string {
  const which = n ? `plan ${n} (${PLAN_WORD[kind]})` : `${PLAN_WORD[kind]} plan`;
  return `[App] Agent G's ${which} is in the chat${what ? `: ${what}` : ''}. Tell the user in one or two sentences what it `
    + 'does and ask whether to start it; after a clear yes call agent_task with action "start"'
    + `${n ? ` and plan ${n}` : ''}. The app starts it only on the user's own yes.`;
}

/** The [App] note for a failed generation. The test link's refusal is no failure to retry: nothing can be made there. */
export function failedNote(what: string): string {
  if (isTestLinkNotice(what)) {
    return '[App] This is a test link: paid creation is switched off here on purpose, so nothing can be made in this call '
      + 'and no credits were spent. Tell the user exactly that in one sentence (real creation works on myavatar.ge); do not '
      + 'offer to try again here.';
  }
  return `[App] A generation failed${what ? `: "${what}"` : ''}. Tell the user plainly and offer to try again.`;
}

/** The [App] note when a voice start ran out its countdown and started nothing. */
export function notStartedNote(reason: LiveResultNote['reason'], what: string): string {
  switch (reason) {
    case 'said_no':
      return `[App] Nothing was started: the user said${what ? ` "${what}"` : ' no or wait'}. Ask what they want instead.`;
    case 'cancelled':
      return '[App] Nothing was started: the user cancelled it on screen. Ask what they want instead.';
    case 'not_recorded':
      return `[App] Nothing was started: the app could not record the user's yes${what ? ` (${what})` : ''}. Tell the user and `
        + 'offer to try again.';
    case 'refused':
      return `[App] Nothing was started${what ? `: ${what}` : ''}. Tell the user plainly.`;
    default:
      if (what) {
        // GG 2026-10-26 09:29Z: a Georgian answer came out as „대자.", in Korean letters, and the model told the user that
        // „something went wrong". It hears what the answer came out as, and that it may say it again or tap the card.
        return `[App] Nothing was started: after the price the app heard only "${what}"`
          + `${isMisheardScript(what) ? ' (in an alphabet the call never speaks: the speech recognition missed the words)' : ''}, `
          + 'and that is no clear yes. Do not say it started or that something broke. Ask the user to answer once more with a '
          + 'short yes in their language, or to tap the button on the card; start again only after they say yes.';
      }
      return '[App] Nothing was started: the countdown ended without a clear yes in the user\'s own words after the price or '
        + 'plan. Do not say it started. Ask the user plainly whether to start; start again only after they say yes.';
  }
}

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

  // Voice-to-action: the server decides whether the token carries the functions (GEMINI_LIVE_ACTIONS); this screen
  // asks because it executes them.
  const liveActions = useLiveActions();

  // A persona chosen BY VOICE (set_persona, GG 2026-10-25) takes over from the one the call opened with; '' = none.
  const { personaRequest } = liveActions;
  const activePersonaId = personaRequest ? (personaRequest.id || undefined) : personaId;
  const activeCustomPersona = personaRequest ? undefined : customPersona;

  // Persona + Google-only platform prompt + spoken-call rules. Built here (not in the hook) so the hook stays a pure
  // transport; used only when the mint returns no server-locked setup.
  const instruction = useMemo(
    () => buildLiveInstruction({ locale: loc, personaId: activePersonaId, customPersona: activeCustomPersona, personaOverride: systemInstruction }),
    [loc, activePersonaId, activeCustomPersona, systemInstruction],
  );

  // Which voice speaks: the persona's, until the user picks the other one. Toggling it reconnects (a fresh session;
  // deliberate voice switches happen between sentences). A persona switched by voice brings its own voice, unless the
  // user chose one — so the choice is kept apart from the persona's (null = not chosen).
  const profileGender = genderOfVoice(instruction.voiceName);
  const [chosenGender, setChosenGender] = useState<Gender | null>(gender ?? null);
  const voiceGender: Gender = chosenGender ?? profileGender;
  const voiceName = voiceGender === profileGender ? instruction.voiceName : GEMINI_LIVE_VOICES[voiceGender];

  // THE TALKING AVATAR (lib/voice/liveAvatar, GG 2026-10-25): Google's prebuilt face that speaks the call's answers. Off
  // until the user turns it on; offered only where it can work (NEXT_PUBLIC_LIVE_AVATAR, and a browser that plays its
  // MP4: on iPhone iOS 17.1+), because its voice is INSIDE the video: a browser that cannot play it would hear nothing.
  // The avatar matches the voice switch (Kira female, Ben male).
  // Its voice plays on the call's own output (as loud as a voice call; GG 18:17Z: the avatar was too quiet).
  const audioOutputRef = useRef<(() => AvatarAudioOutput | null) | null>(null);
  const avatarPlayer = useLiveAvatarPlayer(useCallback(() => audioOutputRef.current?.() ?? null, []));
  const [avatarAvailable] = useState(() => liveAvatarEnabled() && avatarPlaybackSupported(AVATAR_FALLBACK_MIME));
  const [avatarWanted, setAvatarWanted] = useState(false);
  const [avatarNote, setAvatarNote] = useState<'capped' | 'dailyLimit' | 'disabled' | 'unsupported' | null>(null);
  const desiredAvatar = avatarAvailable && avatarWanted ? defaultLiveAvatar(voiceGender) : null;
  const desiredAvatarRef = useRef(desiredAvatar);
  desiredAvatarRef.current = desiredAvatar;

  const session = useGeminiLiveSession({
    locale: loc,
    voiceName,
    systemInstruction: instruction.systemInstruction,
    temperature: instruction.temperature,
    tools: instruction.googleSearch ? ['google_search'] : [],
    parity: geminiLiveParityEnabled(),
    personaId: activePersonaId,
    customPersona: activeCustomPersona,
    researchId,
    onTurn,
    onUsage,
    onUnavailable,
    actions: true,
    onToolCall: liveActions.onToolCall,
    onToolCallCancellation: liveActions.onToolCallCancellation,
    // The user's own words: a voice start runs only on these (liveActions, lib/voice/voiceLedger). The model's own words:
    // a price it named just before the card is the price a yes said then answered.
    onHeard: liveActions.onHeard,
    onSaid: liveActions.onSaid,
    avatar: desiredAvatar,
    onVideo: avatarPlayer.push,
    onAvatarInterrupted: avatarPlayer.jumpToLive,
  });
  const { start, stop, sendVideoFrame, status, interrupt } = session;

  // set_persona: once the model's short line in the new role has played, a fresh session in that persona (the mic and
  // the screen stay; the chat so far rides along). Bounded like end_call's goodbye; a call that is not ready yet waits.
  audioOutputRef.current = typeof session.audioOutput === 'function' ? session.audioOutput : null;
  const renewRef = useRef(session.renew);
  renewRef.current = session.renew;
  const renewedSeqRef = useRef(0);
  // The persona the running session was opened with: asking again for that same one renews nothing (a fresh session
  // costs a few seconds and starts from the setup again, GG 2026-10-25).
  const sessionPersonaRef = useRef(personaId ?? '');
  useEffect(() => {
    if (!personaRequest || renewedSeqRef.current >= personaRequest.seq || status === 'closed' || status === 'error') return;
    if (personaRequest.id === sessionPersonaRef.current) { renewedSeqRef.current = personaRequest.seq; return; }
    const answering = status === 'speaking' || status === 'thinking';
    const seq = personaRequest.seq;
    const timer = setTimeout(() => {
      if (renewRef.current()) { renewedSeqRef.current = seq; sessionPersonaRef.current = personaRequest.id; }
    }, answering ? LIVE_END_CALL_MAX_WAIT_MS : LIVE_END_CALL_GRACE_MS);
    return () => clearTimeout(timer);
  }, [personaRequest, status]);

  // The avatar on/off: a FRESH session with or without it (the mic and the screen stay; the chat rides along), once the
  // call is ready. Only when the wish differs from what was last ASKED, so a server that refuses the avatar (and opens a
  // voice call) is never asked again in a loop.
  const askedAvatarRef = useRef<string | null>(desiredAvatar);
  const callReady = status === 'listening' || status === 'speaking' || status === 'thinking';
  useEffect(() => {
    if (!callReady || desiredAvatar === askedAvatarRef.current) return;
    if (renewRef.current()) askedAvatarRef.current = desiredAvatar;
  }, [callReady, desiredAvatar]);
  const sessionAvatar = session.avatar;
  const { avatarRefused } = session;
  useEffect(() => {
    if (!avatarRefused) return;
    askedAvatarRef.current = null;
    setAvatarWanted(false);
    setAvatarNote(avatarRefused === 'daily_limit' ? 'dailyLimit' : 'disabled');
  }, [avatarRefused]);
  // Cost: one avatar session runs LIVE_AVATAR_MAX_MS at most, then the call goes on by voice.
  useEffect(() => {
    if (!sessionAvatar) return;
    const timer = setTimeout(() => { setAvatarWanted(false); setAvatarNote('capped'); }, LIVE_AVATAR_MAX_MS);
    return () => clearTimeout(timer);
  }, [sessionAvatar]);
  // A voice session (or the end of the call) clears the picture; a browser that turns out unable to play it goes back to voice.
  const resetAvatar = avatarPlayer.reset;
  useEffect(() => { if (!sessionAvatar) resetAvatar(); }, [sessionAvatar, resetAvatar]);
  const avatarState = avatarPlayer.state;
  useEffect(() => {
    if (avatarState !== 'unsupported' && avatarState !== 'error') return;
    setAvatarWanted(false);
    setAvatarNote('unsupported');
  }, [avatarState]);

  // ── THE CALL ON THE SCREEN ─────────────────────────────────────────────────────────────────────────────────────
  // Full screen while you only talk; DOCKED into a slim bar the moment the agent changes something on screen (a studio,
  // a prompt, a chat message, a panel), so the user watches it happen instead of finding it after hanging up. The user
  // can flip either way (the bar's ⤢, the full screen's „ეკრანის ნახვა“), and so can the model (call_view).
  const [docked, setDocked] = useState(false);
  // AUTO-DOCK: Immediately fold full-screen into compact LiveDock when agent triggers an action/plan
  useEffect(() => {
    if (liveActions.pendingRun || liveActions.screenSeq > 0) setDocked(true);
  }, [liveActions.pendingRun, liveActions.screenSeq]);

  useEffect(() => {
    const onLiveAction = () => setDocked(true);
    window.addEventListener("myavatar:live-action", onLiveAction);
    return () => window.removeEventListener("myavatar:live-action", onLiveAction);
  }, []);
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
  // the moment it listens again. An Agent G plan gets its number here (the model starts it by that number), and only
  // the moment its note is SENT does a yes start to count for it: a yes before the model knew of the plan is not its yes.
  const notesRef = useRef<Array<{ text: string; planId?: string }>>([]);
  const statusRef = useRef(status);
  statusRef.current = status;
  const sendNote = session.sendNote;
  const { registerPlan, planTold } = liveActions;
  const flushNotes = useCallback(() => {
    if (!notesRef.current.length || statusRef.current !== 'listening') return;
    const batch = notesRef.current;
    if (!sendNote(batch.map((n) => n.text).join(' '))) return;
    notesRef.current = [];
    for (const n of batch) if (n.planId) planTold(n.planId);
  }, [planTold, sendNote]);
  useEffect(() => {
    const onResult = (e: Event) => {
      setDocked(true);
      const n = (e as CustomEvent<LiveResultNote>).detail;
      if (!n || typeof n !== 'object') return;
      const what = typeof n.what === 'string' && n.what.trim() ? n.what.trim().slice(0, n.kind === 'plan' || n.kind === 'music' ? 240 : 160) : '';
      const planKind: LivePlanKind | null = n.kind === 'plan'
        ? ((LIVE_PLAN_KINDS as readonly string[]).includes(n.planKind ?? '') ? n.planKind as LivePlanKind : 'audio') : null;
      const planNo = planKind && typeof n.planId === 'string' && n.planId ? registerPlan(n.planId, planKind, what) : 0;
      const note = n.kind === 'plan' ? planNote(planNo, planKind ?? 'audio', what)
        : n.kind === 'not_started' ? notStartedNote(n.reason, what)
        : n.kind === 'music' ? `[App] Music Studio: ${what || 'the music card changed'}`
        : n.kind === 'failed' ? failedNote(what)
        : `[App] A new ${n.kind === 'audio' ? 'music track' : n.kind} is ready on screen${what ? `: "${what}"` : ''} — it is now result 1. `
          + 'If the user asked for more steps, continue with the next one now; otherwise tell them in one short sentence.';
      notesRef.current = [...notesRef.current, { text: note, ...(planNo ? { planId: n.planId } : {}) }].slice(-4);
      flushNotes();
    };
    window.addEventListener(LIVE_RESULT_EVENT, onResult);
    return () => window.removeEventListener(LIVE_RESULT_EVENT, onResult);
  }, [flushNotes, registerPlan]);
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
    askedAvatarRef.current = desiredAvatarRef.current; // this mint asks for the avatar wished now
    void start();
    return () => stop();
  }, [start, stop, userId, chosenGender]);

  // A call that ended or failed must not keep the camera hot behind the error screen.
  useEffect(() => {
    if (status === 'error' || status === 'closed') stopCamera();
  }, [status, stopCamera]);

  // ⚠️ The call used to fetch the user's enrolled avatar poster (/api/avatar/core) and show it inside the orb and as a
  // blurred backdrop — on the owner's phone, a cropped photo of a man as the face of the AGENT. The agent is MyAvatar's:
  // that request is gone. (The rocket that replaced it is retired too, 2026-10-24: the call wears the voice pill.)

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
      onClick={() => setChosenGender(voiceGender === 'female' ? 'male' : 'female')}
      locale={loc}
      testId="live-voice-switch"
    />
  );

  const avatarCopy = LIVE_AVATAR_STRINGS[loc];
  const primeAvatar = avatarPlayer.prime;
  const avatarSwitch = avatarAvailable ? (
    <LiveControl
      label={avatarCopy.toggle}
      ariaLabel={avatarWanted ? avatarCopy.turnOff : avatarCopy.turnOn}
      pressed={avatarWanted}
      icon={<ScanFace size={22} aria-hidden />}
      onClick={() => {
        if (!avatarWanted) primeAvatar(); // inside this tap: the avatar may speak aloud later (iPhone)
        setAvatarNote(null);
        setAvatarWanted(!avatarWanted);
      }}
      locale={loc}
      testId="live-avatar-switch"
    />
  ) : null;
  const avatarShown = !!sessionAvatar && avatarState !== 'idle' && avatarState !== 'unsupported' && avatarState !== 'error';
  const avatarNeedsTap = !!sessionAvatar && (avatarState === 'muted' || avatarState === 'blocked');
  const avatarNotice = avatarNote ? avatarCopy[avatarNote]
    : desiredAvatar && (!sessionAvatar || avatarState === 'idle' || avatarState === 'buffering') ? avatarCopy.starting
    : null;
  const resumeSession = session.resumeAudio;
  const unlockAvatar = avatarPlayer.unlock;
  const resumeAudio = useCallback(() => { resumeSession(); unlockAvatar(); }, [resumeSession, unlockAvatar]);

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
      audioBlocked={session.audioBlocked || avatarNeedsTap}
      onResumeAudio={resumeAudio}
      extraControls={<>{voiceSwitch}{avatarSwitch}</>}
      avatarVideo={avatarShown ? avatarPlayer.video : null}
      notice={status === 'error' || status === 'closed' ? null : avatarNotice}
      showCaptions={!session.degraded}
      actions={liveActions.cards}
      onOpenAction={openAction}
      activity={session.activity}
      jobs={jobLines}
      docked={docked}
      onToggleDock={toggleDock}
      // An avatar's answer is in its video and cannot be cut locally: the user just speaks, and the server stops it.
      onStopSpeaking={sessionAvatar ? undefined : interrupt}
      pendingRun={liveActions.pendingRun}
      onCancelRun={liveActions.cancelRun}
    />
  );
}
