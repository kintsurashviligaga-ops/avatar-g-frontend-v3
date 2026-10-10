/**
 * lib/calls/whatsapp/phoneSetup.ts — the Gemini Live session of one WhatsApp call: the SAME model allowlist, platform
 * prompt and memory as the browser's Live Voice (app/api/voice/live), built here on the server and locked into the
 * session's token, so the media bridge can neither read nor change the prompt or the tools.
 *
 * What differs from the browser's call, and why:
 *   • tools: the phone list (phoneTools.ts) instead of the screen actions; no Google Search (a service call, not a
 *     general assistant: Meta Terms §4.7 until Meta answers);
 *   • transcription always on: the person's own words are what approve anything (lib/voice/spokenYes), never the model's;
 *   • explicit context compression. Live bills the whole context again every turn at the audio input rate (Google's
 *     Live API best practices, 2026-09-15). Google's default trigger (~80 % of the window) is never reached in a call,
 *     so the context would grow and be re-billed for the whole call. 8k → 4k keeps the system prompt and roughly the
 *     last minute of talk word for word; facts about tasks and money come from the tools, not from memory of the call.
 *     Cost per minute in docs/handoffs/omnichannel/COMMUNICATION_UNIT_ECONOMICS.md.
 *   • resumption on: a Live connection lasts ~10 minutes; the bridge resumes with the handle (bounded per call).
 */
import { buildLiveSetup, GEMINI_LIVE_VOICES, type LiveSetupMessage } from '@/lib/voice/geminiLive';
import { phoneCallRule, phoneDeclarations, type AgentScope } from './phoneTools';
import type { CallLang } from './copy';

export const PHONE_COMPRESSION = Object.freeze({ triggerTokens: 8000, targetTokens: 4000 });

const TRANSCRIPTION: Record<CallLang, string> = { ka: 'ka-GE', en: 'en-US', ru: 'ru-RU' };

export interface PhoneSetupInput {
  /** An allowlisted Live model (lib/ai/google/models resolveLiveModel). */
  model: string;
  locale: CallLang;
  /** buildPlatformPrompt for the locale (googleSearch: false) — the same prompt as every other surface. */
  platformSystem: string;
  /** lib/memory/context for the ticket's user, or ''. */
  memoryBlock: string;
  scope: AgentScope;
  supportEmail: string;
  voice?: 'female' | 'male';
  /** undefined = first session (resumable); a handle = resume that session. */
  resumptionHandle?: string | null;
}

export function phoneSystemInstruction(i: Pick<PhoneSetupInput, 'platformSystem' | 'memoryBlock' | 'scope' | 'supportEmail'>): string {
  return [i.platformSystem.trim(), i.memoryBlock.trim(), phoneCallRule(i.scope, i.supportEmail)].filter(Boolean).join('\n\n');
}

export function buildPhoneLiveSetup(i: PhoneSetupInput): LiveSetupMessage {
  return buildLiveSetup({
    model: i.model,
    systemInstruction: phoneSystemInstruction(i),
    voiceName: GEMINI_LIVE_VOICES[i.voice ?? 'female'],
    transcribe: true,
    languageCode: TRANSCRIPTION[i.locale] ?? TRANSCRIPTION.ka,
    compression: { ...PHONE_COMPRESSION },
    resumptionHandle: i.resumptionHandle ?? null,
    functionDeclarations: phoneDeclarations(i.scope),
  });
}
