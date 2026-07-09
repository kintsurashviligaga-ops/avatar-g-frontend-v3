/**
 * lib/voice/voicePrompt.ts
 * =======================
 * Pure helpers for the real-time voice-interaction node. The conversational LLM leg (POST /api/voice/chat)
 * turns a transcribed user turn into a SHORT, SPOKEN-friendly reply — kept terse for low latency since the
 * reply is immediately voiced by ElevenLabs streaming TTS. Georgian-first; en/ru mirrored.
 *
 * Kept pure (no server-only / no network) so the persona prompt, the spoken trim, and the fallback are all
 * unit-testable. The route wires these into llmText; it NEVER touches TTS voice settings (0.48 stays locked
 * in lib/audio/tts-model.ts).
 */
export type VoiceLocale = 'ka' | 'en' | 'ru';

export function normalizeVoiceLocale(raw: unknown): VoiceLocale {
  return raw === 'en' || raw === 'ru' ? raw : 'ka';
}

const PERSONA: Record<VoiceLocale, string> = {
  ka: 'შენ ხარ MyAvatar — ქართული ხმოვანი ასისტენტი. უპასუხე ბუნებრივი, სასაუბრო ქართულით, მოკლედ — 1-3 წინადადება, თითქოს ხმამაღლა საუბრობ. არ გამოიყენო markdown, ბულეტები, ემოჯი, ან სქობებში მითითებები — მხოლოდ სუფთა სათქმელი ტექსტი.',
  en: 'You are MyAvatar, a Georgian-first voice assistant. Reply in natural, conversational language, SHORT — 1-3 sentences, as if speaking aloud. No markdown, bullet points, emoji, or bracketed notes — only clean spoken text.',
  ru: 'Ты MyAvatar — голосовой ассистент. Отвечай естественно и разговорно, КОРОТКО — 1-3 предложения, как будто говоришь вслух. Без markdown, списков, эмодзи и пометок в скобках — только чистый произносимый текст.',
};

const FALLBACK: Record<VoiceLocale, string> = {
  ka: 'ბოდიში, ახლა ვერ გავიგე. გაიმეორებ?',
  en: "Sorry, I didn't catch that. Could you say it again?",
  ru: 'Извините, я не расслышал. Повторите, пожалуйста?',
};

/** The spoken reply when the LLM chain misses entirely — never leave the user in silence. */
export function voiceFallbackReply(locale: VoiceLocale): string {
  return FALLBACK[locale];
}

export interface VoiceTurn { role: 'user' | 'assistant'; content: string }

/**
 * Build the { system, user } for llmText from the latest transcribed turn + a short rolling history. History
 * is capped (recency) so the prompt stays small + fast; each turn's content is trimmed.
 */
export function buildVoiceReplyPrompt(text: string, locale: VoiceLocale, history?: readonly VoiceTurn[]): { system: string; user: string } {
  const recent = (history ?? [])
    .filter((h) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string' && h.content.trim())
    .slice(-6)
    .map((h) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content.trim().slice(0, 500)}`);
  const convo = recent.length ? recent.join('\n') + '\n' : '';
  return { system: PERSONA[locale], user: `${convo}User: ${text.trim().slice(0, 2000)}\nAssistant:` };
}

/** Clean + bound an LLM reply for TTS: strip markdown/brackets/emoji, collapse whitespace, cap length. */
export function trimForSpeech(reply: string | null | undefined, maxChars = 700): string {
  let s = (typeof reply === 'string' ? reply : '').trim();
  if (!s) return '';
  s = s
    .replace(/```[\s\S]*?```/g, ' ')      // code fences
    .replace(/\[[^\]]*\]/g, ' ')          // [notes]
    .replace(/[#>*_`~]+/g, '')             // markdown tokens
    .replace(/^\s*(?:assistant|ასისტენტი|ассистент)\s*[:：]\s*/i, '') // stray role label
    .replace(/\s{2,}/g, ' ')
    .trim();
  return s.slice(0, maxChars);
}
