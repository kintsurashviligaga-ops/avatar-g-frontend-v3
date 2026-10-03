'use client';

/**
 * components/voice/live/liveActions.ts — the browser half of voice-to-action: every `toolCall` the Live model makes is
 * validated (lib/voice/liveTools.ts), turned into a window event the app already listens for, and answered with a
 * toolResponse at once — `{ok:true, summary}` or `{ok:false, error, …}` — so the model can say what it did.
 *
 * Events (the contract, docs/voice/LIVE_ACTIONS.md):
 *   • `myavatar:live-action` — detail = the typed LiveAction, for EVERY validated call. OmniStudio's one listener maps
 *     prepare_generation / open_studio onto its studio switch + prompt prefill and calls preventDefault() as its
 *     RECEIPT. No receipt (no studio on this page) → the model is told `ok:false`, never "done".
 *   • `myavatar:open-artifact` — detail `{title, language, code}` for show_code (the canvas another surface owns),
 *     cancelable too: ArtifactCanvas's preventDefault() is the receipt. No canvas on this page → `ok:false`.
 *
 * ⚠️ MONEY. Everything here prepares, reads or navigates — except start_generation, which never runs on the call itself:
 * it opens a COUNTDOWN (LIVE_START_COUNTDOWN_MS) the user can cancel on screen, and only when that runs out uncancelled is
 * `myavatar:live-run` sent, which the studio answers through its own paid path. The model must have said the price and
 * heard a yes (the declaration's `confirmed: "yes"`, lib/voice/liveTools.ts).
 * ⚠️ The answer goes out SYNCHRONOUSLY (no network, no await): Live function calls block the model's turn, and a
 * slow answer is dead air on a voice call. The studio fills `detail.reply` inside dispatchEvent, so its facts (the price,
 * the settings it applied, the screen state) are in the same answer.
 * ⚠️ open_url DOES NOT OPEN ANYTHING HERE. A function call arrives on a WebSocket message, which is not a user gesture:
 * every browser blocks window.open there (iOS Safari always). It becomes a card with the link, and the model is told the
 * truth — the user taps it. The tap (openLiveUrl, inside the click handler) is the gesture that opens the tab.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { setChatMode } from '@/lib/chat/chatModeStore';
import type { LiveFunctionResponse } from '@/lib/voice/geminiLive';
import {
  LIVE_ACTION_EVENT,
  LIVE_RUN_EVENT,
  LIVE_START_COUNTDOWN_MS,
  OPEN_ARTIFACT_EVENT,
  liveUrlHost,
  validateLiveToolCall,
  validateLiveUrl,
  type LiveAction,
  type LiveActionEventDetail,
  type LiveCallView,
  type LiveChatModel,
  type LiveStudioReply,
  type OpenArtifactDetail,
} from '@/lib/voice/liveTools';

/** The strip shows the last few things the agent did — more would bury the call. */
export const LIVE_ACTION_CARDS_MAX = 3;
/** A model looping on a function must not turn into a UI storm: beyond this, calls are refused for the rest of the call. */
export const LIVE_ACTIONS_PER_CALL_MAX = 40;
/** end_call: hang up this long after the goodbye has finished playing (or after the answer, if nothing is said). */
export const LIVE_END_CALL_GRACE_MS = 1500;
/** end_call: never wait longer than this for a goodbye that is still playing. */
export const LIVE_END_CALL_MAX_WAIT_MS = 8000;

export interface LiveToolCall { id: string; name: string; args: unknown }

/**
 * What a card can show: a prepared prompt, an opened tool, code, a link to open. (The rest act on the visible screen and
 * need no card.)
 */
export type LiveCardAction = Extract<LiveAction, { type: 'prepare_generation' | 'open_studio' | 'show_code' | 'open_url' }>;
export interface LiveActionCard {
  /** The function-call id (toolCallCancellation removes by it); a local id when the model sent none. */
  id: string;
  action: LiveCardAction;
}

/** Where the executor's side effects go (window events in the app; spies in tests). */
export interface LiveActionEnv {
  /**
   * Returns true when a studio took it (its preventDefault receipt). The studio may fill `detail.reply` while it handles
   * the event (dispatchEvent is synchronous), and the executor reads it straight after.
   */
  dispatchAction: (detail: LiveActionEventDetail) => boolean;
  /** Returns true when a canvas took it (its preventDefault receipt); false → show_code answers canvas_unavailable. */
  openArtifact: (detail: OpenArtifactDetail) => boolean;
  /** The chat model picker (a global store, so it works on any page). Defaults to lib/chat/chatModeStore. */
  setChatModel?: (model: LiveChatModel) => void;
  /** The countdown ran out: the studio runs what was prepared. True when a studio took it. */
  runGeneration?: () => boolean;
}

function dispatchCancelable<T>(type: string, detail: T): boolean {
  if (typeof window === 'undefined' || typeof CustomEvent !== 'function') return false;
  try {
    const ev = new CustomEvent<T>(type, { detail, cancelable: true });
    window.dispatchEvent(ev);
    return ev.defaultPrevented;
  } catch {
    return false; // a throwing listener is that listener's bug; the call goes on
  }
}

/** `myavatar:live-action`, cancelable: true = a studio on this page applied it. */
export function dispatchLiveAction(detail: LiveActionEventDetail): boolean {
  return dispatchCancelable(LIVE_ACTION_EVENT, detail);
}

/** `myavatar:open-artifact` with exactly `{title, language, code}` (the canvas contract), cancelable: true = shown. */
export function dispatchOpenArtifact(detail: OpenArtifactDetail): boolean {
  return dispatchCancelable<OpenArtifactDetail>(OPEN_ARTIFACT_EVENT, { title: detail.title, language: detail.language, code: detail.code });
}

/** `myavatar:live-run`, cancelable: true = the studio started (or refused with its own message on screen). */
export function dispatchLiveRun(): boolean {
  return dispatchCancelable(LIVE_RUN_EVENT, {});
}

export const browserLiveActionEnv: LiveActionEnv = {
  dispatchAction: dispatchLiveAction,
  openArtifact: dispatchOpenArtifact,
  setChatModel: (m) => setChatMode(m),
  runGeneration: dispatchLiveRun,
};

const STUDIO_NAME: Record<string, string> = {
  video: 'Video', image: 'Image', music: 'Music', avatar: 'Avatar', chat: 'Chat', photoshoot: 'Photographer',
  interior: 'Interior designer', remix: 'Remix', product: 'Product ad', swap: 'Character swap', vfx: 'VFX', motion: 'Motion',
  montage: 'Montage (video editor)', dubbing: 'Dubbing', model3d: '3D model', presentation: 'Presentation', photo: 'Photo culling',
};
const MODEL_NAME: Record<LiveChatModel, string> = { fast: '3.8 Flash', thinking: '3.8 Flash Thinking', pro: '3.1 Pro', lite: '3.1 Flash-Lite' };

/** The settings the studio actually applied, for the model ("9:16, 24 s"), or the ones asked for when it did not say. */
function appliedSummary(asked: { aspectRatio?: string; durationSec?: number; style?: string; instrumental?: boolean }, reply: LiveStudioReply | undefined): string {
  const src = (reply?.applied ?? asked) as Record<string, unknown>;
  const parts = [
    typeof src.aspectRatio === 'string' ? `aspect ratio ${src.aspectRatio}` : '',
    typeof src.durationSec === 'number' ? (src.durationSec === 0 ? 'full-length' : `${src.durationSec} s`) : '',
    typeof src.style === 'string' && src.style ? `style "${src.style}"` : '',
    typeof src.instrumental === 'boolean' ? (src.instrumental ? 'instrumental' : 'with vocals') : '',
  ].filter(Boolean);
  return parts.join(', ');
}

/** "It costs 4 credits." — or how this tool is priced when the studio could not quote it up front. */
function priceSentence(reply: LiveStudioReply | undefined, tool?: string): string {
  const p = reply?.priceCredits;
  if (typeof p === 'number' && p > 0) return ` Running it costs ${p} credit${p === 1 ? '' : 's'}.`;
  if (tool === 'video') return ' A video is priced at its storyboard step, before anything renders.';
  return '';
}

function refused(answer: (r: Record<string, unknown>) => LiveFunctionResponse, reply: LiveStudioReply | undefined, fallback: string): LiveCallOutcome {
  return { response: answer({ ok: false, error: reply?.error ?? 'refused', message: reply?.message ?? fallback }) };
}

const NO_STUDIO = 'No studio is open on this page, so nothing was prepared. Suggest the user opens the MyAvatar dashboard and asks again.';
const NO_STUDIO_SHORT = 'No studio is open on this page, so nothing happened. Suggest the user opens the MyAvatar dashboard.';
const NO_CANVAS = 'No code canvas is open on this page, so the code was not shown or saved. Do not read it aloud; '
  + 'suggest the user opens the MyAvatar dashboard and asks again.';

export interface LiveCallOutcome {
  response: LiveFunctionResponse;
  card?: LiveActionCard;
  endCall?: true;
  /** It changed what is on screen — the call docks so the user can see it (the host decides). */
  screen?: true;
  /** call_view: the model asked for this view. */
  view?: LiveCallView;
  /** start_generation was accepted: the countdown to run it (the host shows it with Cancel). */
  run?: { tool: string; priceCredits?: number };
}

/**
 * Validate + execute ONE function call and build its answer. Pure apart from `env`; never throws.
 * `localId` names the card when the model sent no call id.
 */
export function executeLiveToolCall(call: LiveToolCall, env: LiveActionEnv = browserLiveActionEnv, localId = 'local'): LiveCallOutcome {
  const name = typeof call?.name === 'string' ? call.name : '';
  const id = typeof call?.id === 'string' ? call.id : '';
  const answer = (response: Record<string, unknown>): LiveFunctionResponse => ({ id, name, response });

  const v = validateLiveToolCall(name, call?.args);
  if (!v.ok) {
    const { code, message, field, allowed } = v.error;
    return { response: answer({ ok: false, error: code, message, ...(field ? { field } : {}), ...(allowed ? { allowed: [...allowed] } : {}) }) };
  }
  const action = v.action;
  const card = (a: LiveCardAction): LiveActionCard => ({ id: id || localId, action: a });

  switch (action.type) {
    case 'get_screen_state': {
      const detail: LiveActionEventDetail = { ...action };
      if (!env.dispatchAction(detail)) return { response: answer({ ok: false, error: 'studio_unavailable', message: NO_STUDIO_SHORT }) };
      return { response: answer({ ok: true, state: detail.reply?.state ?? {} }) };
    }
    case 'prepare_generation': {
      const detail: LiveActionEventDetail = { ...action };
      if (!env.dispatchAction(detail)) return { response: answer({ ok: false, error: 'studio_unavailable', message: NO_STUDIO }) };
      if (detail.reply?.ok === false) return refused(answer, detail.reply, 'The studio could not prepare it.');
      const studio = STUDIO_NAME[action.tool] ?? action.tool;
      // A deck or a 3D model is made by its panel's own Create button (it prices the run there): start_generation does
      // not run these studios, so the model is told to hand the last step to the user.
      if (action.tool === 'presentation' || action.tool === 'model3d') {
        return {
          response: answer({
            ok: true,
            summary: `Opened the ${studio} studio on screen with the ${action.tool === 'presentation' ? 'topic' : 'description'} filled in. `
              + 'Nothing was generated and no credits were spent. Tell the user to check it and press Create in that panel — '
              + 'its price is on the button; start_generation does not run this studio.',
          }),
          card: card(action),
          screen: true,
        };
      }
      const applied = appliedSummary(action, detail.reply);
      return {
        response: answer({
          ok: true,
          summary: `Prepared a ${action.tool} prompt in the ${studio} studio on screen${applied ? ` (${applied})` : ''}. Nothing `
            + `was generated and no credits were spent.${priceSentence(detail.reply, action.tool)} Ask the user whether to start it; `
            + 'call start_generation only after a clear yes.',
          ...(typeof detail.reply?.priceCredits === 'number' ? { priceCredits: detail.reply.priceCredits } : {}),
        }),
        card: card(action),
        screen: true,
      };
    }
    case 'update_settings': {
      const detail: LiveActionEventDetail = { ...action };
      if (!env.dispatchAction(detail)) return { response: answer({ ok: false, error: 'studio_unavailable', message: NO_STUDIO_SHORT }) };
      if (detail.reply?.ok === false) return refused(answer, detail.reply, 'The studio on screen has none of those settings.');
      const applied = appliedSummary(action, detail.reply);
      return {
        response: answer({
          ok: true,
          summary: `Updated the settings on screen${applied ? `: ${applied}` : ''}.${priceSentence(detail.reply, detail.reply?.tool)}`,
          ...(typeof detail.reply?.priceCredits === 'number' ? { priceCredits: detail.reply.priceCredits } : {}),
        }),
        screen: true,
      };
    }
    case 'start_generation': {
      const detail: LiveActionEventDetail = { ...action };
      if (!env.dispatchAction(detail)) return { response: answer({ ok: false, error: 'studio_unavailable', message: NO_STUDIO_SHORT }) };
      if (detail.reply?.ok === false) return refused(answer, detail.reply, 'There is nothing prepared to start.');
      const tool = detail.reply?.tool ?? '';
      const price = detail.reply?.priceCredits;
      return {
        response: answer({
          ok: true,
          summary: `The ${STUDIO_NAME[tool] ?? 'studio'} generation starts in ${Math.round(LIVE_START_COUNTDOWN_MS / 1000)} seconds `
            + `unless the user taps Cancel on screen.${priceSentence(detail.reply, tool)} Say so in one sentence.`,
        }),
        screen: true,
        run: { tool, ...(typeof price === 'number' ? { priceCredits: price } : {}) },
      };
    }
    case 'open_studio': {
      if (!env.dispatchAction(action)) return { response: answer({ ok: false, error: 'studio_unavailable', message: NO_STUDIO }) };
      return {
        response: answer({ ok: true, summary: `Opened ${STUDIO_NAME[action.tool] ?? action.tool} on screen. Nothing was started.` }),
        card: card(action),
        screen: true,
      };
    }
    case 'chat_send': {
      const detail: LiveActionEventDetail = { ...action };
      if (!env.dispatchAction(detail)) return { response: answer({ ok: false, error: 'studio_unavailable', message: NO_STUDIO_SHORT }) };
      if (detail.reply?.ok === false) return refused(answer, detail.reply, 'The chat could not take the message.');
      return {
        response: answer({ ok: true, summary: 'Sent to the chat: the written answer is appearing on screen. Tell the user it is on the screen; do not read it all aloud.' }),
        screen: true,
      };
    }
    case 'new_chat':
    case 'scroll_chat':
    case 'open_panel':
    case 'stop': {
      const detail: LiveActionEventDetail = { ...action };
      if (!env.dispatchAction(detail)) return { response: answer({ ok: false, error: 'studio_unavailable', message: NO_STUDIO_SHORT }) };
      if (detail.reply?.ok === false) return refused(answer, detail.reply, 'That is not available on this screen.');
      const summary = detail.reply?.message
        ?? (action.type === 'new_chat' ? 'Started a new, empty chat on screen.'
          : action.type === 'scroll_chat' ? `Scrolled the chat ${action.to === 'top' || action.to === 'bottom' ? `to the ${action.to}` : action.to}.`
            : action.type === 'open_panel' ? `Opened the ${action.panel} panel on screen.`
              : 'Stopped.');
      return { response: answer({ ok: true, summary }), screen: true };
    }
    case 'set_chat_model': {
      // A global store: works on any page, and the studio's header follows its event.
      (env.setChatModel ?? ((m: LiveChatModel) => setChatMode(m)))(action.model);
      return { response: answer({ ok: true, summary: `The text chat now answers with ${MODEL_NAME[action.model]}.` }) };
    }
    case 'call_view':
      return {
        response: answer({
          ok: true,
          summary: action.view === 'screen'
            ? 'The call is now a slim bar at the top of the screen; the user sees the app while you talk.'
            : 'The full call screen is back.',
        }),
        view: action.view,
      };
    case 'show_code': {
      env.dispatchAction(action);
      // ⚠️ The canvas's receipt, like the studio's above: the library and agent pages host Live but no canvas, and the
      // model used to say "it's on your screen" there. And "saved", never "on screen": the full call screen covers the
      // canvas — the user sees it in the docked view, after the card's Open, or after the call.
      if (!env.openArtifact({ title: action.title, language: action.language, code: action.code })) {
        return { response: answer({ ok: false, error: 'canvas_unavailable', message: NO_CANVAS }) };
      }
      const lines = action.code.split('\n').length;
      return {
        response: answer({
          ok: true,
          summary: `"${action.title}" (${action.language}, ${lines} line${lines === 1 ? '' : 's'}) is saved in the code canvas, `
            + 'ready for the user to open. Do not read the code aloud; describe what it does in a sentence or two.',
        }),
        card: card(action),
      };
    }
    case 'open_url': {
      // Not the studio's (no event), and never window.open from here — see the header. A card the user taps.
      const host = liveUrlHost(action.url) || 'the website';
      return {
        response: answer({
          ok: true,
          summary: `A link to ${host} is on the user's screen; they tap it to open it in a new browser tab — a voice call `
            + 'cannot open tabs by itself. Tell them to tap it.',
        }),
        card: card(action),
      };
    }
    case 'end_call':
      env.dispatchAction(action);
      return { response: answer({ ok: true, summary: 'The call ends right after your reply: say a short goodbye now.' }), endCall: true };
    default:
      return { response: answer({ ok: false, error: 'unknown_tool', message: 'No such function.' }) };
  }
}

/**
 * A card's Open, after the call has ended: bring the studio (focused) or the canvas back to the front. A link is not
 * revealed here — this runs a task after the tap, outside the gesture, where a browser blocks the new tab; the link's
 * own button opens it (openLiveUrl) and the call goes on.
 */
export function revealLiveAction(action: LiveCardAction, env: LiveActionEnv = browserLiveActionEnv): void {
  if (action.type === 'open_url') return;
  if (action.type === 'show_code') env.openArtifact({ title: action.title, language: action.language, code: action.code });
  else env.dispatchAction({ ...action, reveal: true });
}

/**
 * Open a link the call put on screen, in a new tab, with no opener and no referrer. Call it ONLY inside the user's
 * tap (a click handler): that is the gesture the browser needs. The address is checked again here, so nothing but a
 * public http(s) address can ever reach window.open. True when it was handed to the browser.
 */
export function openLiveUrl(url: string): boolean {
  const checked = validateLiveUrl(url);
  if (!checked.ok || typeof window === 'undefined' || typeof window.open !== 'function') return false;
  try {
    window.open(checked.url, '_blank', 'noopener,noreferrer');
    return true;
  } catch {
    return false;
  }
}

/** A confirmed start_generation counting down on screen. */
export interface LivePendingRun {
  id: string;
  tool: string;
  priceCredits?: number;
  /** Date.now() when it runs. */
  runsAt: number;
  /** 'counting' → 'started' | 'cancelled' | 'failed' (kept briefly so the screen can say what happened). */
  state: 'counting' | 'started' | 'cancelled' | 'failed';
}

export interface UseLiveActionsResult {
  /** Newest first, at most LIVE_ACTION_CARDS_MAX. */
  cards: LiveActionCard[];
  /** The model called end_call: the host hangs up once the goodbye has been said. */
  endRequested: boolean;
  /** Bumps each time an action changed what is on screen (the host docks the call so the user sees it). */
  screenSeq: number;
  /** The last call_view the model asked for (with a sequence number, so asking twice still applies). */
  viewRequest: { view: LiveCallView; seq: number } | null;
  /** A confirmed generation counting down, or how the last one ended. */
  pendingRun: LivePendingRun | null;
  /** The user's Cancel on the countdown. */
  cancelRun: () => void;
  /** useGeminiLiveSession `onToolCall`: answers every call, synchronously. */
  onToolCall: (calls: LiveToolCall[]) => LiveFunctionResponse[];
  /** useGeminiLiveSession `onToolCallCancellation`: the user barged in — drop those cards (and a countdown it started). */
  onToolCallCancellation: (ids: string[]) => void;
}

/** The executor as React state for the Live screen. `env` is for tests. */
export function useLiveActions(env?: LiveActionEnv): UseLiveActionsResult {
  const [cards, setCards] = useState<LiveActionCard[]>([]);
  const [endRequested, setEndRequested] = useState(false);
  const [screenSeq, setScreenSeq] = useState(0);
  const [viewRequest, setViewRequest] = useState<{ view: LiveCallView; seq: number } | null>(null);
  const [pendingRun, setPendingRun] = useState<LivePendingRun | null>(null);
  const envRef = useRef(env);
  envRef.current = env;
  const countRef = useRef(0);
  const seqRef = useRef(0);
  const mountedRef = useRef(true);
  const runTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // ⚠️ A call that ends mid-countdown does NOT run it: hanging up is the clearest "no" there is.
      if (runTimer.current) clearTimeout(runTimer.current);
      if (clearTimer.current) clearTimeout(clearTimer.current);
    };
  }, []);

  /** Show how the countdown ended for a moment, then clear the banner. */
  const settleRun = useCallback((state: LivePendingRun['state']) => {
    if (!mountedRef.current) return;
    setPendingRun((p) => (p ? { ...p, state } : p));
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => { if (mountedRef.current) setPendingRun(null); }, 2500);
  }, []);

  const armRun = useCallback((id: string, run: { tool: string; priceCredits?: number }) => {
    if (runTimer.current) clearTimeout(runTimer.current);
    if (clearTimer.current) clearTimeout(clearTimer.current);
    setPendingRun({ id, ...run, runsAt: Date.now() + LIVE_START_COUNTDOWN_MS, state: 'counting' });
    runTimer.current = setTimeout(() => {
      runTimer.current = null;
      if (!mountedRef.current) return;
      const e = envRef.current ?? browserLiveActionEnv;
      const ok = (e.runGeneration ?? dispatchLiveRun)();
      settleRun(ok ? 'started' : 'failed');
    }, LIVE_START_COUNTDOWN_MS);
  }, [settleRun]);

  const cancelRun = useCallback(() => {
    if (!runTimer.current) return;
    clearTimeout(runTimer.current);
    runTimer.current = null;
    settleRun('cancelled');
  }, [settleRun]);

  const onToolCall = useCallback((calls: LiveToolCall[]): LiveFunctionResponse[] => {
    const responses: LiveFunctionResponse[] = [];
    const added: LiveActionCard[] = [];
    let end = false;
    let screen = false;
    let view: LiveCallView | null = null;
    let run: { id: string; tool: string; priceCredits?: number } | null = null;
    for (const call of Array.isArray(calls) ? calls : []) {
      if (countRef.current >= LIVE_ACTIONS_PER_CALL_MAX) {
        responses.push({
          id: typeof call?.id === 'string' ? call.id : '',
          name: typeof call?.name === 'string' ? call.name : '',
          response: { ok: false, error: 'too_many_actions', message: 'Too many actions in this call; nothing more was done. Tell the user.' },
        });
        continue;
      }
      countRef.current += 1;
      seqRef.current += 1;
      const localId = `live-action-${seqRef.current}`;
      const out = executeLiveToolCall(call, envRef.current ?? browserLiveActionEnv, localId);
      responses.push(out.response);
      if (out.card) added.unshift(out.card); // newest first
      if (out.endCall) end = true;
      if (out.screen) screen = true;
      if (out.view) view = out.view;
      if (out.run) run = { id: typeof call?.id === 'string' && call.id ? call.id : localId, ...out.run };
    }
    if (mountedRef.current) {
      if (added.length) {
        setCards((prev) => {
          const fresh = new Set(added.map((c) => c.id));
          return [...added, ...prev.filter((c) => !fresh.has(c.id))].slice(0, LIVE_ACTION_CARDS_MAX);
        });
      }
      if (end) setEndRequested(true);
      if (screen) setScreenSeq((n) => n + 1);
      if (view) { const v = view; setViewRequest((p) => ({ view: v, seq: (p?.seq ?? 0) + 1 })); }
      if (run) armRun(run.id, run);
    }
    return responses;
  }, [armRun]);

  const onToolCallCancellation = useCallback((ids: string[]) => {
    if (!mountedRef.current || !Array.isArray(ids) || !ids.length) return;
    const gone = new Set(ids);
    setCards((prev) => (prev.some((c) => gone.has(c.id)) ? prev.filter((c) => !gone.has(c.id)) : prev));
    // A barge-in that cancels the start itself also stops its countdown.
    setPendingRun((p) => {
      if (p && p.state === 'counting' && gone.has(p.id) && runTimer.current) {
        clearTimeout(runTimer.current);
        runTimer.current = null;
        return { ...p, state: 'cancelled' };
      }
      return p;
    });
  }, []);

  return { cards, endRequested, screenSeq, viewRequest, pendingRun, cancelRun, onToolCall, onToolCallCancellation };
}
