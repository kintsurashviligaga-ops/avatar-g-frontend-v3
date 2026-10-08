/**
 * app/api/voice/live/route.ts — mints a SHORT-LIVED EPHEMERAL token for a browser-direct Gemini
 * Multimodal Live session. This route is request/response (Vercel-safe); the persistent WebSocket to
 * Gemini is opened by the BROWSER (lib/voice/geminiLive.ts) using this token, so the raw GEMINI_API_KEY
 * never reaches the client.
 *
 * ON BY DEFAULT (Gemini Live is the live-validated default voice); a 503 kill-switch returns when
 * GEMINI_LIVE_ENABLED is set falsy ('0'|'false'|'no'|'off') OR no Gemini key is configured — the client
 * then falls back to the REST voice loop at runtime (GeminiLiveConversation.onUnavailable). The
 * principal is the AUTHENTICATED CALLER (requireUser → session cookie), never a userId from the request
 * body — otherwise anyone could mint a cost-bearing token against another account (IDOR). Voice is
 * intentionally FREE (no credit gate); cost is bounded instead by requireUser + an IP burst limit +
 * a per-USER daily ceiling (defeats IP rotation across throwaway signups) + the platform budget guard.
 *
 * Body (all optional): { model, locale: 'ka'|'en'|'ru', personaId, customPersona, gender: 'male'|'female',
 *   voice: 'Aoede'|'Charon'|'Kore'|'Puck', transcribe: boolean, compression: boolean, resumptionHandle: string|null,
 *   actions: boolean, tools: false, researchId: string, chatSessionId: string }
 *   `researchId` = TALK TO A RESEARCH REPORT: the server loads that finished report for the signed-in OWNER (never text from
 *   the browser), squeezes it to the engine's limit (lib/research/liveContext.ts) and appends it to the locked instruction.
 *   A report that is not the caller's / not finished / not found → 404 `report_unavailable`, no mint.
 *   `chatSessionId` = THE SAME CONVERSATION: the id of the text-chat session the call was opened from. The server loads that
 *   session's newest turns for the signed-in OWNER (lib/voice/liveThread) and appends them to the locked instruction, so the
 *   call continues the chat instead of starting cold. Not the caller's / trashed / malformed → simply no history block.
 * Response: { token, model, expiresAt, setupMessage, setupLocked, voice, locale, actions }.
 *   `setupMessage` is the complete first WS frame ({ setup }) — pass it as GeminiLiveConfig.setupMessage so the
 *   browser sends exactly what the token was minted for.
 *
 * ⚠️ THE SERVER OWNS THE SESSION SETUP NOW. The model used to come from the request body unchecked (any string, so
 * a caller could lock the token to a costlier model), and the token locked ONLY the model — the system instruction,
 * voice and tools were whatever the browser sent, i.e. any signed-in user could drive raw Gemini Live on our key
 * with their own prompt. Now: the model is allowlisted (resolveLiveModel), and the agent profile is resolved HERE
 * (custom personas re-sanitized and clamped) into systemInstruction + voice + generationConfig, built once with
 * buildLiveSetup and minted into the token's bidiGenerateContentSetup.
 *
 * VERIFIED LIVE 2026-09-30 (funded key, gemini-2.5-flash-native-audio-latest): the full lock — Georgian
 * `languageCodes` hint, both transcriptions, sessionResumption, contextWindowCompression — mints (200) and completes
 * setup on the Constrained endpoint; one turn returned audio, a Georgian outputTranscription and a resumption handle,
 * and a FRESH token minted with that handle resumed the session. The browser sends the returned `setupMessage`, so the
 * frame always matches the lock.
 *   googleSearch IS part of the default lock (it minted and completed setup in that same probe): a voice call answers
 *   news, prices, scores and weather from the web like the text chat does. GEMINI_LIVE_GOOGLE_SEARCH=0 is the kill
 *   switch. A session that rejects it costs nothing extra: the browser's legacy retry mints with `tools: false`.
 * Fallback if Google ever rejects the lock (HTTP 400): the verified LEGACY lock (model + generationConfig +
 * systemInstruction — still server-owned, no tools) and `setupMessage` becomes that legacy frame; only if that is
 * rejected too does it drop to the {model}-only lock (`setupLocked: false`). Each step logs
 * `voice.live.setup_lock_rejected`. GEMINI_LIVE_LOCK_SETUP=0 forces the {model}-only lock.
 *
 * VOICE-TO-ACTION (lib/voice/liveTools.ts, docs/voice/LIVE_ACTIONS.md): with `actions: true` the lock also carries
 * `{functionDeclarations}` (prepare a studio, show code, open a studio, end the call — PREPARE-ONLY, never a render or a
 * charge) ahead of the optional googleSearch block, plus the instruction paragraph that explains them. ON unless
 * GEMINI_LIVE_ACTIONS is falsy, but only for a client that ASKS: a browser that cannot execute the calls (an old
 * bundle, the degraded retry) must not hand the model functions that silently do nothing.
 *   ⚠️ UNVERIFIED LIVE: that Google accepts functionDeclarations inside the ephemeral-token lock for
 *   gemini-2.5-flash-native-audio-latest. So a 400 on a lock WITH the declarations first retries the SAME parity lock
 *   WITHOUT them (captions, resumption and search survive; `actions: false` tells the browser) — only then the legacy
 *   chain above. A rejected declaration costs the actions, never the call. `node scripts/probe-live-actions.mjs` (owner,
 *   funded key) mints + opens these three locks — full, actions dropped, no tools — and reports which reach setupComplete.
 * `tools: false` is the browser's degraded legacy retry: NO tools at all (search included), so the lock matches the
 * legacy frame it will send (useGeminiLiveSession strips PARITY_FIELDS, `tools` among them).
 */
import { NextRequest, NextResponse } from 'next/server';

import { RATE_LIMITS, checkRateLimit, checkRateLimitByKey } from '@/lib/api/rate-limit';
import { isEnabledByDefault } from '@/lib/env/flag';
import { structuredLog } from '@/lib/logger';
import { resolveGeminiKey } from '@/lib/orchestrator/gemini-guard';
import { requireUser } from '@/lib/supabase/server';
import { buildLiveSetup, type LiveSetupMessage, type LiveTool } from '@/lib/voice/geminiLive';
import { LIVE_ACTIONS_RULE } from '@/lib/voice/liveTools';
import { resolveLiveModel, toModelResource } from '@/lib/ai/google/models';
import { resolveAgentProfile, toGeminiLiveSetup, DEFAULT_AGENT_PROFILE_ID, type AgentProfile, type LiveVoice } from '@/lib/agents/profile';
import { PERSONA_VOICES } from '@/lib/services/personas/personas';
import { buildPlatformPrompt } from '@/lib/chat/platformPrompt';
import { chatBudgetAllows } from '@/lib/services/billing/chatBudget';
import { loadLiveReportBlock } from '@/lib/research/liveContext';
import { loadLiveThreadBlock } from '@/lib/voice/liveThread';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

const AUTH_TOKEN_URL = 'https://generativelanguage.googleapis.com/v1alpha/auth_tokens';
const SESSION_TTL_MS = 30 * 60 * 1000; // token valid ~30 min
const NEW_SESSION_WINDOW_MS = 2 * 60 * 1000; // must OPEN the session within ~2 min

type LiveLocale = 'ka' | 'en' | 'ru';

/** BCP-47 hint for the INPUT transcription (native-audio models take no speech languageCode — see geminiLive.ts). */
const TRANSCRIPTION_LANGUAGE: Record<LiveLocale, string> = { ka: 'ka-GE', en: 'en-US', ru: 'ru-RU' };

const MALE_VOICES: ReadonlySet<LiveVoice> = new Set<LiveVoice>(['Charon', 'Puck']);

type Body = Record<string, unknown>;

function asLocale(v: unknown): LiveLocale | null {
  return v === 'ka' || v === 'en' || v === 'ru' ? v : null;
}

/**
 * The session language: the body's `locale`, else the UI locale in the page path the call was opened from
 * (`/en/dashboard` → en), else Georgian. ⚠️ The referer fallback exists because the server now OWNS the system
 * instruction: a client that has not started sending `locale` would otherwise lock every English/Russian user into
 * the Georgian persona.
 */
function resolveLocale(body: Body, referer: string | null): LiveLocale {
  const fromBody = asLocale(body.locale);
  if (fromBody) return fromBody;
  try {
    const seg = referer ? new URL(referer).pathname.split('/')[1] : '';
    return asLocale(seg) ?? 'ka';
  } catch {
    return 'ka';
  }
}

function normalizeVoice(raw: unknown): LiveVoice | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;
  const cap = `${t.charAt(0).toUpperCase()}${t.slice(1).toLowerCase()}`;
  return (PERSONA_VOICES as readonly string[]).includes(cap) ? (cap as LiveVoice) : null;
}

/** Explicit `voice` > `gender` (keeps the persona's voice when it already has that gender) > persona voice > Aoede. */
function voiceFor(profile: AgentProfile, voice: unknown, gender: unknown): LiveVoice {
  const explicit = normalizeVoice(voice);
  let v: LiveVoice = explicit ?? profile.voice;
  if (!explicit && (gender === 'male' || gender === 'female') && (gender === 'male') !== MALE_VOICES.has(v)) {
    v = gender === 'male' ? 'Charon' : 'Aoede';
  }
  return v;
}

/**
 * The last block of the Live system instruction. buildPlatformPrompt is written for the TEXT chat (a Markdown
 * FORMAT rule, "you have Google Search"), so a voice call overrides both explicitly — last, where the model weighs
 * instructions most. With `actions` the session carries the UI-action declarations, and LIVE_ACTIONS_RULE replaces
 * the "name the tool and say how to open it" advice (the model can now open it itself).
 */
function liveCallRule(search: boolean, actions: boolean): string {
  return [
    'LIVE VOICE CALL: everything you say is spoken aloud in real time. The FORMAT guidance above does not apply here —',
    'speak natural sentences with no Markdown, lists, headings, tables, code blocks, LaTeX or emoji; describe structure',
    'in words. If the user speaks another language, answer in that language.',
    actions
      ? LIVE_ACTIONS_RULE
      : 'When a studio tool fits, name it and say how to open it; keep any suggested prompt short enough to say aloud.',
    search
      ? ''
      : 'You cannot search the web during this call: for anything that changes over time (news, prices, scores, weather), say you cannot check it live right now and suggest asking in the text chat.',
  ].filter(Boolean).join(' ');
}

export async function POST(request: NextRequest) {
  try {
    // ── Gate 1: feature flag. Native Gemini Live is the DEFAULT voice (live-validated), so it is ON unless
    // GEMINI_LIVE_ENABLED is explicitly set falsy ('0'|'false'|'no'|'off') — the kill-switch. Its 503 makes
    // the client fall back to the REST voice loop at runtime (GeminiLiveConversation.onUnavailable). The
    // remaining gates (key, IP rate-limit, auth, per-user cap, budget) fully protect the cost-bearing mint. ──
    if (!isEnabledByDefault(process.env.GEMINI_LIVE_ENABLED)) {
      return NextResponse.json({ error: 'gemini_live_disabled' }, { status: 503 });
    }
    // ── Gate 2: key present (fail-closed, never leaked) ──────────────────────
    const apiKey = resolveGeminiKey();
    if (!apiKey) {
      return NextResponse.json({ error: 'gemini_key_missing' }, { status: 503 });
    }
    // ── Gate 3: IP burst limit on a cost-bearing mint (forgiving VOICE_TOKEN limit — reconnects/voice-
    // toggle must not 429; the auth (Gate 4) + per-user daily cap (Gate 5) are the real per-account guards) ──
    const limited = await checkRateLimit(request, RATE_LIMITS.VOICE_TOKEN);
    if (limited) return limited;

    // ── Gate 4: authenticate the CALLER via their session (never a body userId) ──
    let userId: string;
    try {
      userId = (await requireUser()).id;
    } catch {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }

    // Voice mode is intentionally FREE for every signed-in user (no balance required). There is NO credit gate.
    // Because signup auto-confirms and the Gate-3 IP limiter can be sidestepped by rotating IPs, bound COST per
    // ACCOUNT here: a per-user daily ceiling keyed on the authenticated userId (not IP) caps how many cost-bearing
    // 30-min native-audio sessions a single account can mint, without blocking a real user's day of heavy use.
    const perUser = await checkRateLimitByKey(userId, RATE_LIMITS.VOICE_TOKEN_USER);
    if (perUser) return perUser;

    const raw = (await request.json().catch(() => ({}))) as unknown;
    const body: Body = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Body) : {};

    // ── The session, built server-side ──
    // Allowlisted model: anything malformed, retired or unlisted resolves to the default (never an error).
    const model = resolveLiveModel(typeof body.model === 'string' ? body.model : null);
    const modelResource = toModelResource(model);
    const locale = resolveLocale(body, request.headers.get('referer'));
    const profile = resolveAgentProfile({
      personaId: typeof body.personaId === 'string' ? body.personaId : null,
      customPersona: body.customPersona,
    });
    const personaActive = profile.id !== DEFAULT_AGENT_PROFILE_ID;
    // Talk to a research report. Imported lazily: this module (and its tests) must not pull the research runtime into every mint.
    let reportBlock = '';
    if (body.researchId !== undefined && body.researchId !== null && body.researchId !== '') {
      const { researchLiveDeps } = await import('@/lib/research/runtime');
      const block = await loadLiveReportBlock(userId, body.researchId, locale, researchLiveDeps());
      if (!block) return NextResponse.json({ error: 'report_unavailable' }, { status: 404 });
      reportBlock = block;
    }
    // The text chat this call was opened from (lib/voice/liveThread): only the session ID travels; the turns are loaded here
    // for the session's OWNER. A report call is about the report, so it does not carry the thread. Any miss → no block, the
    // call still opens. Imported lazily for the same reason as the research runtime.
    let threadBlock = '';
    if (!reportBlock && typeof body.chatSessionId === 'string' && body.chatSessionId) {
      const { liveThreadDeps } = await import('@/lib/voice/liveThreadStore');
      threadBlock = await loadLiveThreadBlock(userId, body.chatSessionId, liveThreadDeps());
    }
    // `tools: false` = the browser's degraded legacy retry: no tools of any kind (see the header).
    const toolsAllowed = body.tools !== false;
    // Google Search in Live: default ON, like the text chat (GEMINI_LIVE_GOOGLE_SEARCH=0 is the kill switch). The
    // 2026-09-30 probe minted and completed setup with it; a session that still refuses it ends in the browser's
    // `tools: false` retry, which locks no tools at all — the call survives, only the web lookup is lost.
    const search = toolsAllowed && profile.googleSearch && isEnabledByDefault(process.env.GEMINI_LIVE_GOOGLE_SEARCH);
    // Voice-to-action: default ON (GEMINI_LIVE_ACTIONS=0 is the kill switch), and only for a client that executes them.
    const actionsWanted = toolsAllowed && body.actions === true && isEnabledByDefault(process.env.GEMINI_LIVE_ACTIONS);
    const voice = voiceFor(profile, body.voice, body.gender);
    const promptNow = new Date();
    // The instruction names the action functions ONLY when the lock carries them, so it is built per attempt.
    const liveFor = (withActions: boolean) => toGeminiLiveSetup(
      { ...profile, voice },
      // The report (when there is one) goes BEFORE the call rule: that rule stays the last block, where the model weighs it most.
      { locale, platformSystem: `${buildPlatformPrompt({ locale, now: promptNow, googleSearch: search })}${threadBlock ? `\n\n${threadBlock}` : ''}${reportBlock ? `\n\n${reportBlock}` : ''}\n\n${liveCallRule(search, withActions)}` },
    );
    const live = liveFor(actionsWanted);
    const transcribe = body.transcribe === true;
    const parityFor = (withActions: boolean) => {
      const l = withActions === actionsWanted ? live : liveFor(withActions);
      const tools: LiveTool[] = [...(withActions ? ['live_actions' as const] : []), ...(search ? ['google_search' as const] : [])];
      return buildLiveSetup({
        model,
        systemInstruction: l.systemInstruction,
        voiceName: l.voiceName,
        // The Live session has always run at the model's default temperature; only an active persona changes that.
        ...(personaActive ? { temperature: l.temperature } : {}),
        ...(transcribe ? { transcribe: true, languageCode: TRANSCRIPTION_LANGUAGE[locale] } : {}),
        ...(body.compression === true ? { compression: true } : {}),
        ...('resumptionHandle' in body
          ? { resumptionHandle: typeof body.resumptionHandle === 'string' ? body.resumptionHandle : null }
          : {}),
        ...(tools.length ? { tools } : {}),
      });
    };
    const setupMessage = parityFor(actionsWanted);

    // ── Gate 6: platform budget (fails OPEN inside chatBudgetAllows, like every budget check). A refusal is a 503,
    // so the client drops to the REST loop, which speaks the budget message instead of dead-ending. ──
    if (!(await chatBudgetAllows(live.systemInstruction, model))) {
      structuredLog('warn', 'voice.live.budget_refused', { model });
      return NextResponse.json({ error: 'budget_exhausted' }, { status: 503 });
    }

    const now = Date.now();
    const expireTime = new Date(now + SESSION_TTL_MS).toISOString();
    const newSessionExpireTime = new Date(now + NEW_SESSION_WINDOW_MS).toISOString();

    // The lock field is `bidiGenerateContentSetup` — verified live: the earlier `liveConnectConstraints` name is
    // rejected by the auth_tokens API with HTTP 400 ("Unknown name … Cannot find field").
    // The key rides in the x-goog-api-key HEADER: a key in the URL lands in every proxy and access log.
    const mint = (lock: object, timeoutMs: number) =>
      fetch(AUTH_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({ uses: 1, expireTime, newSessionExpireTime, bidiGenerateContentSetup: lock }),
        signal: AbortSignal.timeout(timeoutMs), // a hung mint becomes the already-handled 503 path
      });

    let setupLocked = isEnabledByDefault(process.env.GEMINI_LIVE_LOCK_SETUP);
    // The frame the browser will send — always the one the token was minted for.
    let frame: LiveSetupMessage = setupMessage;
    let res = await mint(setupLocked ? setupMessage.setup : { model: modelResource }, 12_000);
    if (!res.ok && setupLocked && res.status === 400 && actionsWanted) {
      const detail = await res.text().catch(() => '');
      structuredLog('warn', 'voice.live.setup_lock_rejected', { lock: 'actions', status: res.status, detail: detail.slice(0, 300) });
      // The declarations are the newest, unverified part of the lock: drop ONLY them first. From here on the frame
      // never carries them again — not even on the {model}-only fallback below, which sends the parity frame.
      frame = parityFor(false);
      res = await mint(frame.setup, 8_000);
    }
    if (!res.ok && setupLocked && res.status === 400) {
      const detail = await res.text().catch(() => '');
      structuredLog('warn', 'voice.live.setup_lock_rejected', { lock: 'full', status: res.status, detail: detail.slice(0, 300) });
      // Still server-owned: the legacy wire the product ran on before parity (no transcription/resumption/tools).
      const plain = actionsWanted ? liveFor(false) : live;
      const legacy = buildLiveSetup({
        model,
        systemInstruction: plain.systemInstruction,
        voiceName: plain.voiceName,
        ...(personaActive ? { temperature: plain.temperature } : {}),
      });
      res = await mint(legacy.setup, 8_000);
      if (res.ok) {
        frame = legacy;
      } else if (res.status === 400) {
        const d2 = await res.text().catch(() => '');
        structuredLog('warn', 'voice.live.setup_lock_rejected', { lock: 'legacy', status: res.status, detail: d2.slice(0, 300) });
        setupLocked = false;
        res = await mint({ model: modelResource }, 8_000);
      }
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      structuredLog('warn', 'voice.live.token_mint_failed', { status: res.status, detail: detail.slice(0, 300) });
      // Do not leak the upstream body / key to the client.
      return NextResponse.json({ error: 'live_token_unavailable', status: res.status }, { status: 503 });
    }
    const data = (await res.json().catch(() => ({}))) as { name?: string };
    // Tells the browser whether this call's frame declares the UI actions (false after any fallback that dropped them).
    const actions = !!frame.setup.tools?.some((block) => 'functionDeclarations' in block);
    const token = String(data.name || '').trim();
    if (!token) {
      return NextResponse.json({ error: 'live_token_empty' }, { status: 503 });
    }

    return NextResponse.json({
      token,
      model: modelResource,
      expiresAt: expireTime,
      setupMessage: frame,
      setupLocked,
      voice: live.voiceName,
      locale,
      actions,
    });
  } catch (error) {
    structuredLog('error', 'voice.live.failed', { error: error instanceof Error ? error.message : 'unknown' });
    return NextResponse.json({ error: 'voice_live_failed' }, { status: 500 });
  }
}
