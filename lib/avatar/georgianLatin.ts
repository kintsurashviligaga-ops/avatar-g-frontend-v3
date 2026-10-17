/**
 * lib/avatar/georgianLatin.ts — the talking avatar's Georgian line in Latin letters, for Veo to say (lib/avatar/veoAvatar).
 *
 * Veo's own Georgian is garbled (the 2026-10-16 film), so it says the same syllables written in Latin letters: its face
 * then moves like someone saying the line. Its voice is not heard — the line is ElevenLabs' native Georgian voice, and
 * sync.so redraws the mouth to it (lib/avatar/voicedClip, GG's 2026-10-17 12:29Z decision).
 *
 * Pure and client-safe.
 */

/** Georgian letters in Latin, by the national romanization without the ejective apostrophes (Veo reads them as pauses). */
const LATIN: Readonly<Record<string, string>> = {
  ა: 'a', ბ: 'b', გ: 'g', დ: 'd', ე: 'e', ვ: 'v', ზ: 'z', თ: 't', ი: 'i', კ: 'k', ლ: 'l', მ: 'm', ნ: 'n', ო: 'o',
  პ: 'p', ჟ: 'zh', რ: 'r', ს: 's', ტ: 't', უ: 'u', ფ: 'p', ქ: 'k', ღ: 'gh', ყ: 'q', შ: 'sh', ჩ: 'ch', ც: 'ts', ძ: 'dz',
  წ: 'ts', ჭ: 'ch', ხ: 'kh', ჯ: 'j', ჰ: 'h', ჱ: 'e', ჲ: 'i', ჳ: 'u', ჴ: 'q', ჵ: 'o', ჶ: 'f', ჷ: 'e',
};
/** Mtavruli capitals (U+1C90…) sit 0xBC0 above the Mkhedruli letters they capitalise. */
const MTAVRULI_OFFSET = 0x1c90 - 0x10d0;

/** The Georgian words in Latin letters, everything else (punctuation, digits, Latin) as it is. */
export function georgianToLatin(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    const base = code >= 0x1c90 && code <= 0x1cbf ? String.fromCodePoint(code - MTAVRULI_OFFSET) : ch;
    out += LATIN[base] ?? ch;
  }
  return out.replace(/\s+/g, ' ').trim();
}
