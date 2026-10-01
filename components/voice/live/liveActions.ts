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
 * ⚠️ PREPARE-ONLY. Nothing here may start a render or charge a credit: the strongest thing a call can do is fill a
 * prompt the user then runs with their own tap. A future action that spends money needs a user gesture, not a call.
 * ⚠️ The answer goes out SYNCHRONOUSLY (no network, no await): Live function calls block the model's turn, and a
 * slow answer is dead air on a voice call.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import type { LiveFunctionResponse } from '@/lib/voice/geminiLive';
import {
  LIVE_ACTION_EVENT,
  OPEN_ARTIFACT_EVENT,
  validateLiveToolCall,
  type LiveAction,
  type LiveActionEventDetail,
  type LiveStudioTool,
  type OpenArtifactDetail,
  type PrepareGenerationAction,
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

/** Everything a card can show; end_call has no card (the call simply ends). */
export type LiveCardAction = Exclude<LiveAction, { type: 'end_call' }>;
export interface LiveActionCard {
  /** The function-call id (toolCallCancellation removes by it); a local id when the model sent none. */
  id: string;
  action: LiveCardAction;
}

/** Where the executor's side effects go (window events in the app; spies in tests). */
export interface LiveActionEnv {
  /** Returns true when a studio took it (its preventDefault receipt). */
  dispatchAction: (detail: LiveActionEventDetail) => boolean;
  /** Returns true when a canvas took it (its preventDefault receipt); false → show_code answers canvas_unavailable. */
  openArtifact: (detail: OpenArtifactDetail) => boolean;
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

export const browserLiveActionEnv: LiveActionEnv = { dispatchAction: dispatchLiveAction, openArtifact: dispatchOpenArtifact };

const STUDIO_NAME: Record<LiveStudioTool, string> = { video: 'Video', image: 'Image', music: 'Music', avatar: 'Avatar' };

function settingsSummary(a: PrepareGenerationAction): string {
  const parts = [
    a.aspectRatio ? `aspect ratio ${a.aspectRatio}` : '',
    a.durationSec !== undefined ? `${a.durationSec} s` : '',
    a.style ? `style "${a.style}"` : '',
  ].filter(Boolean);
  // ⚠️ Honest about what the studio did: the receipt covers the studio switch and the prompt, not these settings.
  return parts.length
    ? ` The requested ${parts.join(', ')} are shown to the user on screen; they confirm them in the studio settings before Run.`
    : '';
}

const NO_STUDIO = 'No studio is open on this page, so nothing was prepared. Suggest the user opens the MyAvatar dashboard and asks again.';
const NO_CANVAS = 'No code canvas is open on this page, so the code was not shown or saved. Do not read it aloud; '
  + 'suggest the user opens the MyAvatar dashboard and asks again.';

export interface LiveCallOutcome {
  response: LiveFunctionResponse;
  card?: LiveActionCard;
  endCall?: true;
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
    case 'prepare_generation': {
      if (!env.dispatchAction(action)) return { response: answer({ ok: false, error: 'studio_unavailable', message: NO_STUDIO }) };
      const studio = STUDIO_NAME[action.tool];
      return {
        response: answer({
          ok: true,
          summary: `Prepared a ${action.tool} prompt in the ${studio} studio. Nothing was generated and no credits were spent: `
            + `the user reviews it and starts it with the Run button.${settingsSummary(action)}`,
        }),
        card: card(action),
      };
    }
    case 'open_studio': {
      if (!env.dispatchAction(action)) return { response: answer({ ok: false, error: 'studio_unavailable', message: NO_STUDIO }) };
      return { response: answer({ ok: true, summary: `Opened the ${STUDIO_NAME[action.tool]} studio. Nothing was started.` }), card: card(action) };
    }
    case 'show_code': {
      env.dispatchAction(action);
      // ⚠️ The canvas's receipt, like the studio's above: the library and agent pages host Live but no canvas, and the
      // model used to say "it's on your screen" there. And "saved", never "on screen": the Live dialog covers the
      // canvas for the whole call — the user sees it after the card's Open (which hangs up) or after the call.
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
    case 'end_call':
      env.dispatchAction(action);
      return { response: answer({ ok: true, summary: 'The call ends right after your reply: say a short goodbye now.' }), endCall: true };
    default:
      return { response: answer({ ok: false, error: 'unknown_tool', message: 'No such function.' }) };
  }
}

/** A card's Open, after the call has ended: bring the studio (focused) or the canvas back to the front. */
export function revealLiveAction(action: LiveCardAction, env: LiveActionEnv = browserLiveActionEnv): void {
  if (action.type === 'show_code') env.openArtifact({ title: action.title, language: action.language, code: action.code });
  else env.dispatchAction({ ...action, reveal: true });
}

export interface UseLiveActionsResult {
  /** Newest first, at most LIVE_ACTION_CARDS_MAX. */
  cards: LiveActionCard[];
  /** The model called end_call: the host hangs up once the goodbye has been said. */
  endRequested: boolean;
  /** useGeminiLiveSession `onToolCall`: answers every call, synchronously. */
  onToolCall: (calls: LiveToolCall[]) => LiveFunctionResponse[];
  /** useGeminiLiveSession `onToolCallCancellation`: the user barged in — drop those cards. */
  onToolCallCancellation: (ids: string[]) => void;
}

/** The executor as React state for the Live screen. `env` is for tests. */
export function useLiveActions(env?: LiveActionEnv): UseLiveActionsResult {
  const [cards, setCards] = useState<LiveActionCard[]>([]);
  const [endRequested, setEndRequested] = useState(false);
  const envRef = useRef(env);
  envRef.current = env;
  const countRef = useRef(0);
  const seqRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const onToolCall = useCallback((calls: LiveToolCall[]): LiveFunctionResponse[] => {
    const responses: LiveFunctionResponse[] = [];
    const added: LiveActionCard[] = [];
    let end = false;
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
      const out = executeLiveToolCall(call, envRef.current ?? browserLiveActionEnv, `live-action-${seqRef.current}`);
      responses.push(out.response);
      if (out.card) added.unshift(out.card); // newest first
      if (out.endCall) end = true;
    }
    if (mountedRef.current) {
      if (added.length) {
        setCards((prev) => {
          const fresh = new Set(added.map((c) => c.id));
          return [...added, ...prev.filter((c) => !fresh.has(c.id))].slice(0, LIVE_ACTION_CARDS_MAX);
        });
      }
      if (end) setEndRequested(true);
    }
    return responses;
  }, []);

  const onToolCallCancellation = useCallback((ids: string[]) => {
    if (!mountedRef.current || !Array.isArray(ids) || !ids.length) return;
    const gone = new Set(ids);
    setCards((prev) => (prev.some((c) => gone.has(c.id)) ? prev.filter((c) => !gone.has(c.id)) : prev));
  }, []);

  return { cards, endRequested, onToolCall, onToolCallCancellation };
}
