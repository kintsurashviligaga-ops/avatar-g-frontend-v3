/**
 * lib/chat/quotedSpeech.ts — the words of a request with what someone SAYS in it left out. Pure: no DOM, no network.
 *
 * ⚠️ THE BUG THIS EXISTS FOR (GG, 2026-10-25 20:00Z, the #209 E2E). „Veo 3.1, 8s, 9:16 … She says in Georgian: „ჩემი
 * ფოტო ავტვირთე, Agent G-ს 48-წამიანი ვლოგი ვთხოვე და მზა, დამონტაჟებული ვიდეო მივიღე!" …" with a photo, sent in the chat,
 * opened the Montage editor: „დამონტაჟებული" in the woman's LINE matched the montage words. A line a character speaks, or a
 * quoted title, names no tool; the words around it do.
 */

/** A quoted span, in the marks people type: „…“ “…” "…" «…» (the same marks lib/video/clipPrompt reads lines from). */
const QUOTED = /„[^“”"]{1,600}[“”"]|“[^”]{1,600}”|"[^"]{1,600}"|«[^»]{1,600}»/g;

/**
 * The text with every quoted span of three words or more blanked. A quoted name of one or two words („მონტაჟი",
 * "Montage") is how people point at a tool, so it stays.
 */
export function withoutQuotedSpeech(text: string): string {
  return text.replace(QUOTED, (m) => (m.slice(1, -1).trim().split(/\s+/).length >= 3 ? ' … ' : m));
}
