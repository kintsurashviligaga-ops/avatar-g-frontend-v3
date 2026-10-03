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
  MONTAGE_COMMAND_EVENT,
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
import {
  controlName,
  findControl,
  guardOf,
  isTextField,
  linkKind,
  pressControl,
  snapshotControls,
  submitField,
  typeInto,
  type LiveControl,
  type LiveGuard,
  type LinkKind,
} from '@/lib/voice/liveUi';

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
  /** The screen's hands (lib/voice/liveUi) — the document in the app, a fake in tests. */
  ui?: LiveUiPort;
  /** read_webpage: POST /api/voice/web-read. */
  readPage?: (url: string) => Promise<WebReadAnswer>;
  /** montage set_music_start / export / state: the editor's own hook (`myavatar:montage-command`); true = it answered. */
  montageCommand?: (detail: MontageCommandDetail) => boolean;
}

/** What click / type_text / get_screen_state need from the screen. */
export interface LiveUiPort {
  snapshot: () => { controls: LiveControl[]; sheet?: string };
  find: (target: string) => HTMLElement | null;
  guard: (el: HTMLElement) => LiveGuard | null;
  name: (el: HTMLElement) => string;
  link: (el: HTMLElement) => LinkKind;
  press: (el: HTMLElement) => void;
  isField: (el: HTMLElement) => boolean;
  type: (el: HTMLElement, text: string) => boolean;
  submit: (el: HTMLElement) => void;
  /** The tool on screen (`<html data-tool>`), for the composer's Enter rule. */
  tool: () => string;
}

export const browserLiveUi: LiveUiPort = {
  snapshot: () => snapshotControls(document),
  find: (t) => findControl(t, document),
  guard: (el) => guardOf(el),
  name: (el) => controlName(el),
  link: (el) => linkKind(el, window.location),
  press: (el) => pressControl(el),
  isField: (el) => isTextField(el),
  type: (el, text) => typeInto(el, text),
  submit: (el) => submitField(el),
  tool: () => (typeof document !== 'undefined' ? document.documentElement.dataset.tool ?? '' : ''),
};

export type WebReadAnswer =
  | { ok: true; page: { url: string; title: string; description: string; text: string; links: Array<{ text: string; url: string }>; truncated?: boolean } }
  | { ok: false; error: string; status?: number };

/** POST /api/voice/web-read with a timeout (a page that never answers must not hold the call's turn forever). */
export async function fetchWebRead(url: string): Promise<WebReadAnswer> {
  try {
    const res = await fetch('/api/voice/web-read', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ url }), signal: AbortSignal.timeout(15_000),
    });
    const j = (await res.json().catch(() => null)) as WebReadAnswer | null;
    if (j && typeof j === 'object' && 'ok' in j) return j;
    return { ok: false, error: res.status === 429 ? 'rate_limited' : 'fetch_failed' };
  } catch {
    return { ok: false, error: 'timeout' };
  }
}

/** The Montage editor's voice hook (components/studio/montage). */
export type MontageCommandDetail =
  | { command: 'export'; reply?: MontageCommandReply }
  | { command: 'set_music_start'; sec: number; reply?: MontageCommandReply }
  | { command: 'state'; reply?: MontageCommandReply };
export interface MontageCommandReply {
  ok: boolean;
  error?: string;
  message?: string;
  state?: Record<string, unknown>;
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

export function dispatchMontageCommand(detail: MontageCommandDetail): boolean {
  return dispatchCancelable(MONTAGE_COMMAND_EVENT, detail);
}

export const browserLiveActionEnv: LiveActionEnv = {
  dispatchAction: dispatchLiveAction,
  openArtifact: dispatchOpenArtifact,
  setChatModel: (m) => setChatMode(m),
  runGeneration: dispatchLiveRun,
  ui: browserLiveUi,
  readPage: fetchWebRead,
  montageCommand: dispatchMontageCommand,
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
  /** read_webpage: the answer arrives after the network (the step spinner runs meanwhile); `response` is a placeholder. */
  pending?: Promise<LiveFunctionResponse>;
}

/** Why the call does not press it — in words the model repeats to the user. */
const GUARD_MESSAGE: Record<LiveGuard, (name: string) => string> = {
  spend: (n) => `"${n}" starts a paid generation, so the call does not press it. For video, image, music or avatar use `
    + 'prepare_generation, say the price, and after a clear yes call start_generation; for any other tool ask the user to tap it '
    + '(its price is on the button).',
  pay: (n) => `"${n}" pays money: only the user can do that. Tell them to tap it themselves.`,
  destructive: (n) => `"${n}" deletes or signs out: only the user can do that. Ask them to tap it if they want to.`,
  file: (n) => `"${n}" opens the device's file picker, which only the user's own tap can open. Tell them to tap it.`,
  call: () => 'That is part of this call\'s own screen: use call_view or end_call instead.',
  password: () => 'Passwords are never typed by the call. Ask the user to type it themselves.',
};

const WEB_READ_ERRORS: Record<string, string> = {
  invalid_url: 'That is not a valid public web address.',
  blocked_host: 'That address is not a public website (or points into a private network), so it was not read.',
  too_many_redirects: 'The site kept redirecting, so it could not be read.',
  http_error: 'The site answered with an error (it may need a sign-in, or the page does not exist).',
  not_html: 'That address is not a web page (it is a file or an app), so it could not be read.',
  too_large: 'That page is too large to read.',
  timeout: 'The site did not answer in time.',
  fetch_failed: 'The site could not be reached.',
  unauthenticated: 'Reading websites needs the user to be signed in.',
  rate_limited: 'Too many pages were read in a short time; wait a minute.',
};
const WEB_TEXT_MAX = 3500;
const WEB_LINKS_MAX = 25;

/** The page's controls, never throwing (a snapshot is a nice-to-have; the studio's state still goes out). */
function safeSnapshot(ui: LiveUiPort): { controls: LiveControl[]; sheet?: string } | null {
  try { return ui.snapshot(); } catch { return null; }
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
      const studio = env.dispatchAction(detail);
      // The controls come from the PAGE, not the studio: they are what the user could tap on any page (the library, a
      // settings page) — so the call can act there too.
      const ui = env.ui ? safeSnapshot(env.ui) : null;
      if (!studio && !ui) return { response: answer({ ok: false, error: 'studio_unavailable', message: NO_STUDIO_SHORT }) };
      return {
        response: answer({
          ok: true,
          state: {
            ...(studio ? detail.reply?.state ?? {} : { studio: 'none on this page — only the controls below' }),
            ...(ui ? { controls: ui.controls, ...(ui.sheet ? { openSheet: ui.sheet } : {}) } : {}),
          },
        }),
      };
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

    case 'click': {
      const ui = env.ui;
      if (!ui) return { response: answer({ ok: false, error: 'unavailable', message: 'The screen cannot be operated here.' }) };
      const el = ui.find(action.target);
      if (!el) return { response: answer({ ok: false, error: 'not_found', message: `No control "${action.target}" is on screen now. Call get_screen_state for the current controls and ids.` }) };
      const name = ui.name(el) || action.target;
      const guard = ui.guard(el);
      if (guard) return { response: answer({ ok: false, error: `needs_user_${guard}`, message: GUARD_MESSAGE[guard](name) }) };
      const link = ui.link(el);
      if (link === 'external') {
        const href = (el.closest('a[href]') as HTMLAnchorElement | null)?.href ?? '';
        const checked = validateLiveUrl(href);
        if (!checked.ok) return { response: answer({ ok: false, error: 'invalid_link', message: 'That link does not go to a public website.' }) };
        return {
          response: answer({ ok: true, summary: `"${name}" goes to ${checked.host}: a link is on the user's screen to tap (a call cannot open tabs). Tell them to tap it.` }),
          card: card({ type: 'open_url', url: checked.url, title: name }),
        };
      }
      if (link === 'other_page') {
        return { response: answer({ ok: false, error: 'would_end_call', message: `"${name}" opens another page, which would end this call. Tell the user to tap it themselves when they are ready.` }) };
      }
      ui.press(el);
      return {
        response: answer({ ok: true, summary: `Pressed "${name}". The screen may have changed: call get_screen_state before the next click.` }),
        screen: true,
      };
    }
    case 'type_text': {
      const ui = env.ui;
      if (!ui) return { response: answer({ ok: false, error: 'unavailable', message: 'The screen cannot be operated here.' }) };
      const el = ui.find(action.target);
      if (!el) return { response: answer({ ok: false, error: 'not_found', message: `No field "${action.target}" is on screen now. Call get_screen_state for the current controls and ids.` }) };
      const name = ui.name(el) || action.target;
      const guard = ui.guard(el);
      if (guard === 'password' || guard === 'call') return { response: answer({ ok: false, error: `needs_user_${guard}`, message: GUARD_MESSAGE[guard](name) }) };
      if (!ui.isField(el)) return { response: answer({ ok: false, error: 'not_a_field', message: `"${name}" is not a text field; use click for buttons.` }) };
      if (!ui.type(el, action.text)) return { response: answer({ ok: false, error: 'not_a_field', message: `Could not type into "${name}".` }) };
      let submitted = false;
      let held = '';
      if (action.submit) {
        // ⚠️ Enter in the studio's composer RUNS the open tool — a paid generation everywhere but the chat.
        const composer = el.getAttribute('data-testid') === 'composer-input';
        const form = el.closest('form');
        const paidForm = !!form && Array.from(form.querySelectorAll('button,[role="button"],input[type="submit"]')).some((b) => ui.guard(b as HTMLElement) === 'spend');
        if (composer && ui.tool() !== 'chat') held = ' It was NOT submitted: in this studio Enter starts a paid generation — use start_generation after a yes to the price.';
        else if (paidForm) held = ' It was NOT submitted: that form starts a paid generation — ask the user to tap it.';
        else { ui.submit(el); submitted = true; }
      }
      return {
        response: answer({ ok: true, summary: `Typed into "${name}"${submitted ? ' and submitted it' : ''}.${held}` }),
        screen: true,
      };
    }
    case 'download':
    case 'use_result': {
      const detail: LiveActionEventDetail = { ...action };
      if (!env.dispatchAction(detail)) return { response: answer({ ok: false, error: 'studio_unavailable', message: NO_STUDIO_SHORT }) };
      if (detail.reply?.ok === false) return refused(answer, detail.reply, 'That result could not be used.');
      return {
        response: answer({ ok: true, summary: detail.reply?.message ?? (action.type === 'download' ? 'The download started.' : 'Done.') }),
        screen: true,
      };
    }
    case 'montage': {
      if (action.action === 'open') {
        const detail: LiveActionEventDetail = { ...action };
        if (!env.dispatchAction(detail)) return { response: answer({ ok: false, error: 'studio_unavailable', message: NO_STUDIO_SHORT }) };
        if (detail.reply?.ok === false) return refused(answer, detail.reply, 'Montage could not be opened with those results.');
        return { response: answer({ ok: true, summary: detail.reply?.message ?? 'Montage is open with those results.' }), screen: true };
      }
      const command: MontageCommandDetail = action.action === 'export' ? { command: 'export' }
        : action.action === 'set_music_start' ? { command: 'set_music_start', sec: action.musicStartSec ?? 0 }
          : { command: 'state' };
      if (!(env.montageCommand ?? dispatchMontageCommand)(command)) {
        return { response: answer({ ok: false, error: 'montage_closed', message: 'Montage is not open. Use montage with action "open" first.' }) };
      }
      const r = command.reply;
      if (!r || r.ok === false) {
        return { response: answer({ ok: false, error: r?.error ?? 'refused', message: r?.message ?? 'Montage could not do that.' }) };
      }
      const summary = r.message
        ?? (action.action === 'export' ? 'Montage is exporting the edit (free); the finished video will appear in the chat — you will get an [App] note when it is ready.'
          : action.action === 'set_music_start' ? `The music now starts ${action.musicStartSec ?? 0} s into the song.` : 'Here is the edit.');
      return { response: answer({ ok: true, summary, ...(r.state ? { state: r.state } : {}) }), ...(action.action !== 'state' ? { screen: true as const } : {}) };
    }
    case 'read_webpage': {
      const read = env.readPage ?? fetchWebRead;
      const host = liveUrlHost(action.url) || 'the website';
      const pending = read(action.url).then((r): LiveFunctionResponse => {
        if (!r.ok) {
          return answer({ ok: false, error: r.error, message: `${WEB_READ_ERRORS[r.error] ?? 'The page could not be read.'}${r.status ? ` (HTTP ${r.status})` : ''}` });
        }
        const p = r.page;
        const text = p.text.length > WEB_TEXT_MAX ? `${p.text.slice(0, WEB_TEXT_MAX)} …` : p.text;
        return answer({
          ok: true,
          url: p.url,
          title: p.title,
          ...(p.description ? { description: p.description } : {}),
          text,
          links: p.links.slice(0, WEB_LINKS_MAX).map((l) => `${l.text} — ${l.url}`),
          note: 'Answer from this text in the user\'s language. To follow a link, call read_webpage with its url. A link to the page is on the user\'s screen to tap.',
        });
      }).catch(() => answer({ ok: false, error: 'fetch_failed', message: WEB_READ_ERRORS.fetch_failed! }));
      return {
        response: answer({ ok: true, pending: true }),
        pending,
        card: card({ type: 'open_url', url: action.url, title: host }),
      };
    }
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
  /** useGeminiLiveSession `onToolCall`: answers every call — synchronously, or (a read_webpage in the batch) once the page is read. */
  onToolCall: (calls: LiveToolCall[]) => LiveFunctionResponse[] | Promise<LiveFunctionResponse[]>;
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

  const onToolCall = useCallback((calls: LiveToolCall[]): LiveFunctionResponse[] | Promise<LiveFunctionResponse[]> => {
    const responses: LiveFunctionResponse[] = [];
    const added: LiveActionCard[] = [];
    let end = false;
    let screen = false;
    let view: LiveCallView | null = null;
    let run: { id: string; tool: string; priceCredits?: number } | null = null;
    const pendings: Array<{ index: number; promise: Promise<LiveFunctionResponse> }> = [];
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
      if (out.pending) pendings.push({ index: responses.length, promise: out.pending });
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
    // A read_webpage answers after the network: the whole batch is answered together (the session awaits it; the step
    // spinner on screen runs meanwhile). Everything else in the batch has already happened.
    if (!pendings.length) return responses;
    return Promise.all(pendings.map((p) => p.promise)).then((done) => {
      done.forEach((r, i) => { responses[pendings[i]!.index] = r; });
      return responses;
    });
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
