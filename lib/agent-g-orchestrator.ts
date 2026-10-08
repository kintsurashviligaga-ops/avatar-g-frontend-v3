/**
 * lib/agent-g-orchestrator.ts — Agent G's system prompt for the routes that predate the studio chat: /api/chat (its
 * non-Google fallback), /api/chat/stream, /api/agent-g/chat (and /api/agent-g/delegate through it) and the Telegram
 * channel (lib/agentg/personality.ts).
 *
 * ⚠️ THESE ROUTES STILL SPOKE THE OLD ~9 KB PROMPT AFTER THE STUDIO CHAT HAD MOVED OFF IT. It told users Agent G "routes
 * to seven agents" on HeyGen, Replicate, LTX, Udio and WorldLabs, offered "14 AI services" (a Game Creator, a Tourism AI,
 * a Voice Clone and a multi-stem music editor that do not exist), and closed with "13 creative AI services" — three
 * different counts in one prompt, none of them the catalog's, and engines PROJECT_MASTER §A removes. The studio chat had
 * been given lib/chat/platformPrompt.ts for exactly these reasons; this module now returns the same prompt, so every
 * Agent G surface names the services, prices and engines from one source (the catalog, lib/credits/pricing).
 *
 * A function, not a constant: the platform prompt carries Tbilisi's date and time, which a module-level string would
 * freeze at the first request a warm server handled. `googleSearch` must say whether the caller's request carries the
 * Google Search tool, so the prompt never promises a search the model cannot run.
 */
import { buildPlatformPrompt } from '@/lib/chat/platformPrompt';

export function agentGSystemPrompt(opts: { locale?: string | null; googleSearch: boolean; now?: Date }): string {
  const locale = opts.locale === 'en' || opts.locale === 'ru' ? opts.locale : 'ka';
  return buildPlatformPrompt({ locale, googleSearch: opts.googleSearch, ...(opts.now ? { now: opts.now } : {}) });
}
