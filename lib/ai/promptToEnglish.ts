import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Render a generation brief into English for the model that will execute it.
 *
 * ⚠️ THIS IS WHY "NO SERVICE FOLLOWS THE PROMPT". Every generative provider this product calls — Udio,
 * MusicGen, ElevenLabs Music, FLUX, Pollinations, Veo, Kling — is trained overwhelmingly on English
 * text. Nothing in the pipeline translated anything: `buildMusicBrief` cleans and concatenates, the
 * cover-art prompt interpolates the user's words verbatim, and the video brief does the same. So a
 * Georgian sentence arrived at an English-only model as noise, the model fell back to its priors, and
 * the user got a competent-looking result with no relationship to what they asked for. On the cover-art
 * path that failure is visible and absurd — an anime portrait for "inspirational Spanish hip-hop duet" —
 * but the same thing was happening silently to the audio and the video.
 *
 * It is not a prompt-engineering problem and no amount of rewording the template fixes it: the model
 * cannot read the alphabet.
 *
 * ⚠️ WHAT MUST NOT BE TRANSLATED — the distinction this module exists to respect:
 *   · LYRICS and DIALOGUE are content, not instructions. A user asking for a song "ესპანურად" (in
 *     Spanish) is specifying the OUTPUT language; translating the words they want sung would destroy
 *     the request rather than serve it. Callers pass only the DESCRIPTION here, never the lyrics.
 *   · A named language stays named. "in Spanish" survives translation as an instruction, which is
 *     exactly what the provider needs to hear.
 *
 * CHEAP AND SKIPPABLE: a prompt that is already Latin script returns immediately, unchanged, with no
 * network call — so English and Spanish briefs cost nothing and the common case is untouched.
 *
 * FAIL-OPEN, ALWAYS: any error, missing key or timeout returns the ORIGINAL text. Today's behaviour is
 * that the raw prompt goes to the provider; that is the floor this can never fall below, and a
 * translation outage must never turn a working render into a failed one.
 */

/** Latin-script (plus digits/punctuation) needs no translation — the providers read it natively. */
function isLatinScript(s: string): boolean {
  // Any Georgian, Cyrillic, Armenian, Hebrew, Arabic, or CJK character means a translation is worth it.
  return !/[԰-֏֐-׿؀-ۿႠ-ჿЀ-ӿ぀-ヿ一-鿿가-힯]/.test(s);
}

const MODEL = process.env.ANTHROPIC_TRANSLATE_MODEL || 'claude-haiku-4-5-20251001';

/**
 * @param text  the DESCRIPTION of what to generate — never lyrics, never dialogue.
 * @param kind  what is being made, so the translation keeps the vocabulary of that medium.
 */
export async function promptToEnglish(
  text: string,
  kind: 'music' | 'image' | 'video' = 'image',
): Promise<string> {
  const raw = String(text ?? '').trim();
  if (!raw || isLatinScript(raw)) return raw;

  const key = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!key) return raw;

  try {
    const client = new Anthropic({ apiKey: key });
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      // Temperature 0: this is a transcription of intent, not a creative act. A translator that
      // embellishes reintroduces the exact problem — a result that is not what the user asked for.
      temperature: 0,
      system:
        'You translate generation briefs into English for an AI media model. Output ONLY the translated '
        + 'brief — no preamble, no quotes, no commentary, no explanation. Preserve every concrete detail: '
        + 'genre, mood, tempo, instruments, subject, colours, camera, composition, and the number and '
        + 'gender of performers. If the brief names a language for the OUTPUT (for example "in Spanish"), '
        + 'keep that instruction in English rather than translating the brief into that language. '
        + 'Keep proper nouns as they are. Be faithful and literal; add nothing that was not asked for.',
      messages: [{ role: 'user', content: `Medium: ${kind}.\n\nBrief:\n${raw}` }],
    }, { timeout: 12_000 });

    const out = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join(' ')
      .trim();

    // A suspiciously empty or truncated answer is worse than the original — keep what the user wrote.
    return out.length >= 3 ? out : raw;
  } catch {
    return raw;
  }
}
