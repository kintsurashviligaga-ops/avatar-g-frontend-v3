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

/**
 * Detect the language the user actually SPOKE from the transcript's dominant script, so the reply + TTS follow
 * the speech rather than the UI locale. This fixes the reported "user speaks Russian while the UI is Georgian →
 * gets a Georgian reply" leak. Deterministic + script-based (no ML, no latency, unit-testable): Georgian block
 * U+10A0–U+10FF → 'ka', Cyrillic U+0400–U+04FF → 'ru', Latin A–Z → 'en'. Falls back to `fallback` (the UI locale)
 * only when the transcript carries no decisive letters (empty / digits / punctuation), so it never regresses the
 * common case where the UI language and the spoken language already match. Ties resolve ka > ru > en (Georgian-first).
 */
export function detectSpokenLocale(text: string, fallback: VoiceLocale): VoiceLocale {
  const s = typeof text === 'string' ? text : '';
  const georgian = (s.match(/[Ⴀ-ჿ]/g) || []).length; // Georgian (Asomtavruli + Mkhedruli)
  const cyrillic = (s.match(/[Ѐ-ӿ]/g) || []).length; // Cyrillic → Russian
  const latin = (s.match(/[A-Za-z]/g) || []).length;           // Latin → English
  // Native scripts (Georgian, Cyrillic) are highly distinctive and essentially never appear inside genuine English
  // speech, whereas a Latin-script brand/app name ("Instagram", "YouTube") COMMONLY rides inside native speech. So
  // any real native script (≥2 letters — shrugs off a stray transliterated char) decides the language REGARDLESS of
  // how many Latin brand-name letters outnumber it; otherwise "გახსენი Instagram" / "открой YouTube" would flip to an
  // English reply. Latin wins only when there is no meaningful native script. Ties resolve ka > ru (Georgian-first).
  const nativeMax = Math.max(georgian, cyrillic);
  if (nativeMax >= 2) return georgian >= cyrillic ? 'ka' : 'ru';
  if (latin >= 2) return 'en';
  return fallback;
}

// VECTOR 2 — voice replies are enforced EXTREMELY short. Georgian is synthesized on the slow eleven_v3
// engine, and synthesis time scales with character count, so a punchy 1-2 sentence / ≤20-word reply cuts the
// spoken latency dramatically. en/ru ride the fast turbo engine but stay terse too — voice wants brevity.
const PERSONA: Record<VoiceLocale, string> = {
  ka: 'შენ ხარ MyAvatar — ცოცხალი ქართული ხმოვანი ასისტენტი. უპასუხე ბუნებრივი, სასაუბრო ქართულით — ძალიან მოკლედ და პირდაპირ: მაქსიმუმ 1-2 წინადადება, 20 სიტყვამდე, თითქოს ცოცხლად ესაუბრები. არ გამოიყენო markdown, ბულეტები, ემოჯი, ან სქობებში მითითებები — მხოლოდ სუფთა, სათქმელი ტექსტი. თუ პასუხი გრძელია, მოკლედ შეაჯამე.',
  en: 'You are MyAvatar, a Georgian-first voice assistant. Reply in natural, conversational language — VERY short and direct: at most 1-2 sentences, under 20 words, as if talking live. No markdown, bullet points, emoji, or bracketed notes — only clean spoken text. If the answer is long, give a crisp summary.',
  ru: 'Ты MyAvatar — живой голосовой ассистент. Отвечай естественно и разговорно — ОЧЕНЬ коротко и прямо: максимум 1-2 предложения, до 20 слов, как в живой беседе. Без markdown, списков, эмодзи и пометок в скобках — только чистый произносимый текст. Если ответ длинный, дай краткое резюме.',
};

/**
 * The spoken persona for a locale — the same Georgian-first, ≤20-word brevity contract the /api/voice/chat
 * leg uses. Exported so the Gemini Multimodal Live session (native audio) can seed its systemInstruction
 * with the identical voice/brevity, keeping the spoken personality consistent across the TTS and Live paths.
 */
export function voicePersona(locale: VoiceLocale): string {
  return PERSONA[locale];
}

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
