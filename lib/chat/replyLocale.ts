/**
 * replyLocale — detect the chat reply language from the latest message's DOMINANT script.
 *
 * Georgian (U+10A0–10FF) → 'ka', Cyrillic (U+0400–04FF) → 'ru', Latin → 'en'. Fenced/inline CODE is stripped first
 * so "explain this JS: ```…```" asked in Georgian is NOT mis-detected as English by the code's Latin characters.
 * The chat route previously only knew ka/en, so a Russian message fell through to 'en' (and the prompt's "default to
 * Georgian when ambiguous" rule could even answer a short Russian turn in Georgian). Falls back to 'ka' only when no
 * message carries a decisive script. Pure + deterministic (unit-tested); bounded regexes (no ReDoS).
 */

export type ReplyLocale = 'ka' | 'en' | 'ru';
export type LocaleMessage = { role?: string; content: unknown };

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => (p && typeof p === 'object' && (p as { type?: string }).type === 'text' ? String((p as { text?: string }).text ?? '') : ''))
      .join(' ');
  }
  return '';
}

export function detectReplyLocale(messages: readonly LocaleMessage[]): ReplyLocale {
  if (!Array.isArray(messages)) return 'ka';
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m) continue;
    const txt = textOf(m.content);
    if (!txt) continue;
    // detect from PROSE only — strip fenced + inline code so a code-heavy message keeps its question's language
    const prose = txt.replace(/```[\s\S]{0,20000}?```/g, ' ').replace(/`[^`\n]{0,2000}`/g, ' ');
    const georgian = (prose.match(/[Ⴀ-ჿ]/g) || []).length;
    const cyrillic = (prose.match(/[Ѐ-ӿ]/g) || []).length;
    const latin = (prose.match(/[A-Za-z]/g) || []).length;
    const max = Math.max(georgian, cyrillic, latin);
    if (max === 0) continue; // no decisive script (digits/punctuation only) → check the next-older message
    if (georgian === max) return 'ka';
    if (cyrillic === max) return 'ru';
    return 'en';
  }
  return 'ka';
}
