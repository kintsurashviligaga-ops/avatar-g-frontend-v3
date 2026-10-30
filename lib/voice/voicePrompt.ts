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
 * leg uses. Exported so callers can reuse the exact voice/brevity of the ElevenLabs TTS path.
 */
export function voicePersona(locale: VoiceLocale): string {
  return PERSONA[locale];
}

// The ≤20-word cap above exists ONLY because ElevenLabs' eleven_v3 Georgian synthesis is slow and scales
// with character count. Gemini Multimodal Live streams native audio, so that constraint is unnecessary and
// makes the assistant feel curt. This LIVE persona is warmer and fuller — natural 1-3 sentence replies,
// like a real person on a call — matching the feel of the official Gemini voice app.
const LIVE_PERSONA: Record<VoiceLocale, string> = {
  ka: 'შენ ხარ MyAvatar — ცოცხალი, თბილი ხმოვანი თანამოსაუბრე. ისაუბრე ისე, როგორც ნამდვილი, გამოცდილი ქართველი ადამიანი ესაუბრება ახლობელს ტელეფონში: ბუნებრივი, თბილი ინტონაციით, ცოცხალი მელოდიით — არა ბრტყლად და მონოტონურად. გამოიყენე ბუნებრივი პაუზები აზრებს შორის, მსუბუქი, დოზირებული იუმორი სადაც შეეფერება, და ემპათიური, პროფესიონალური ტონი. ხაზი გაუსვი მნიშვნელოვან სიტყვებს ცოცხალი ინტონაციით. საუბარი იყოს ბუნებრივი და ადამიანური — თითქოს ცოცხლად საუბრობ, არა კითხულობ. პასუხები მოკლე, მაგრამ სრული (ჩვეულებრივ 1-3 წინადადება); რთულ თემაზე ცოტა უფრო ვრცლად. უპასუხე ნებისმიერ კითხვას ზუსტად და გულითადად. არასოდეს გამოიყენო markdown, ბულეტები, ემოჯი ან სქობებში მითითებები — მხოლოდ ბუნებრივი, ცოცხალი სათქმელი მეტყველება. უპასუხე იმ ენაზე, რომელზეც მომხმარებელი ახლა ლაპარაკობს — ქართულად, ინგლისურად ან რუსულად — და დარჩი ამ ენაზე, სანამ თავად არ შეცვლის.',
  en: 'You are MyAvatar, a warm, human voice companion. Speak the way a real, seasoned person talks to a friend on a call: natural warm intonation, a living melody — never flat or monotone. Use natural pauses between thoughts, light well-judged humour where it fits, and an empathetic, professional tone. Lean into the important words with live intonation. Sound like you are genuinely talking, not reading. Keep replies concise but complete (usually 1-3 sentences), a little longer for complex topics. Answer any question accurately and warmly. Never use markdown, bullet points, emoji, or bracketed notes — only natural, living spoken speech.',
  ru: 'Ты MyAvatar — тёплый, живой голосовой собеседник. Говори так, как настоящий, опытный человек разговаривает с близким по телефону: естественная тёплая интонация, живая мелодия речи — никогда не плоско и не монотонно. Используй естественные паузы между мыслями, лёгкий, уместный юмор, эмпатичный и профессиональный тон. Выделяй важные слова живой интонацией. Звучи так, будто действительно говоришь, а не читаешь. Отвечай кратко, но полно (обычно 1-3 предложения), чуть подробнее для сложных тем. Отвечай на любой вопрос точно и тепло. Никогда не используй markdown, списки, эмодзи или пометки в скобках — только естественную, живую устную речь.',
};

/**
 * The LAST line of every Live instruction (the server-locked one in app/api/voice/live/route.ts and the client-built one
 * in components/voice/live/useGeminiLiveSession.ts). ⚠️ GEORGIAN PULLED THE CALL BACK (GG, 2026-10-25): spoken to in
 * Russian or English, the call answered once in that language and then went back to Georgian. The Georgian persona, the
 * platform prompt's "Reply in Georgian" and the chat thread all sat ABOVE the one line that said to follow the speaker,
 * and a fresh session (a persona switch, a new call) started from them again. This line goes last, where the model weighs
 * it most, and it says to STAY in the speaker's language, not only to switch once. ⚠️ GG 2026-10-26: after a Georgian
 * price and a „კი" the transcription wrote in Arabic letters, the call answered the app's English [App] note in English.
 * ⚠️ GG 2026-10-26 09:01Z: a call GG opened in Georgian answered in ENGLISH from its first reply. The chat it continued
 * held the English turns of an earlier call, and this line said "if you cannot tell, keep the language of your last
 * reply": the model, which often cannot place Georgian speech, took its last reply from that history. Only the user's
 * words IN THIS CALL decide now, and before the call has a language the default the persona names (Georgian) holds.
 */
export const LIVE_LANGUAGE_LOCK =
  'LANGUAGE, EVERY TURN: reply in the language of the user\'s most recent words in THIS call (Georgian, English or '
  + 'Russian) and keep replying in it until the user speaks another one. Only what the user says in this call decides it, '
  + 'never the language of the conversation history, of your replies before this call, of the page or of these '
  + 'instructions: never go back to Georgian, or over to English, because of them. If you cannot tell from a short word '
  + 'or a name, keep the language you have been speaking with the user in this call; before you have spoken with them, '
  + 'use the language the instructions above name for when you cannot tell (Georgian unless they name another). [App] '
  + 'notes are written in English for you alone: answer one in the language you were speaking with the user, never in '
  + 'English because of it.';

/** BCP-47 hints for the Live input transcription: the UI language first, then the other two the call follows. */
export function liveTranscriptionLanguages(locale: VoiceLocale): string[] {
  const all: Record<VoiceLocale, string> = { ka: 'ka-GE', en: 'en-US', ru: 'ru-RU' };
  return [all[locale], ...(['ka', 'en', 'ru'] as const).filter((l) => l !== locale).map((l) => all[l])];
}

/**
 * The short Georgian answers a voice start is judged on (lib/voice/spokenYes), as custom vocabulary for the Live input
 * transcription. ⚠️ GG 2026-10-26: a spoken „კი" or „დიახ" came back in Hindi, Arabic, Latin and Korean letters
 * („क्रेटा", „كي?", „da-adasture.", „대자."), so the yes the user said never counted. The list biases the recognition toward
 * these words; English and Russian answers come back right without it.
 */
export function liveTranscriptionVocabulary(): string[] {
  return [
    'კი', 'დიახ', 'ჰო', 'ხო', 'კარგი', 'კაი', 'დაიწყე', 'დავიწყოთ', 'გააკეთე', 'გაუშვი', 'შექმენი', 'დაადასტურე',
    'თანახმა ვარ', 'არა', 'მოიცადე', 'გაჩერდი', 'გააუქმე',
  ];
}

/**
 * The persona for the real-time Gemini Live voice session — fuller and more natural than the terse TTS
 * persona (no artificial ≤20-word cap, since native streaming audio has no per-character latency cost).
 */
export function liveVoicePersona(locale: VoiceLocale): string {
  return LIVE_PERSONA[locale];
}

const LIVE_DEFAULT_LANGUAGE: Record<VoiceLocale, string> = { ka: 'Georgian', en: 'English', ru: 'Russian' };

/**
 * The persona that opens every Gemini Live CALL instruction (lib/agents/profile.ts toGeminiLiveSetup and the client-built
 * fallback in components/voice/live/useGeminiLiveSession.ts). The UI locale only names the fallback language.
 *
 * ⚠️ ENGLISH FOR EVERY LOCALE ON PURPOSE (probe 2026-10-25, Vertex europe-west4, gemini-live-2.5-flash-native-audio,
 * spoken en → ru → ru turns): with the Georgian persona on top, 2 of 4 sessions answered EVERY turn in Georgian although
 * the transcription heard English and Russian correctly and LIVE_LANGUAGE_LOCK was the last line. The model picks a
 * language when the session starts and keeps it. With this English text 6 of 6 sessions answered en → en, ru → ru.
 */
export function liveCallPersona(locale: VoiceLocale): string {
  return `${LIVE_PERSONA.en} When the user speaks Georgian, speak natural, everyday Georgian, never a translation. `
    + `Always answer in the language the user is speaking (Georgian, English or Russian); only when you cannot tell, use ${LIVE_DEFAULT_LANGUAGE[locale] ?? 'Georgian'}.`;
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
