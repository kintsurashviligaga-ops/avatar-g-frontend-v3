/**
 * spokenText — DEFENSIVE narration hygiene for TTS (v363 + v364). Dependency-free + pure so it is trivially
 * unit-testable and safe to import anywhere.
 *
 * Strips EVERYTHING that is not spoken text before a string reaches the voice engine so it can never read
 * production/screenplay annotations aloud: scene headers, timecodes ([00:03] / 00:03 / (0:05)), frame counts,
 * SFX / overlay / camera / grade labels, shot codes, stage directions ((pause), [whispering], *sighs*),
 * character/speaker labels (NARRATOR:), INT./EXT. sluglines, and markdown.
 *
 * CONSERVATIVE: clean narration prose (no such markers) — including all Georgian text, diacritics and natural
 * punctuation — passes through UNCHANGED. This is a guard on the VERBATIM narration/voiceover paths, NOT a
 * production-script parser (that is a separate, larger feature). It never touches TTS voice settings.
 */
const SPOKEN_LABEL_RX = /^(?:frames?|duration|clips?|tc|shot|camera|subject|visual|overlay|grade|runtime|master\s*format|alt\s*format|genre(?:\/tone)?|tone|audio\s*spec|character\s*anchor|historical\s*anchor|score(?:\s*architecture)?|sfx|vfx|instrumentation|style|music|export|aspect(?:\s*honesty)?|speed\s*ramps?|final\s*frame|key\s*poetry|consistency\s*rules?|prompt|model|production\s*overview|scene\s*breakdown|voice\s*cast|dialogue\s*speakers?|title\s*card|engineering\s*notes|production\s*summary|color|lens|delivery|per-scene\s*trims)\b\s*[:：]/i;

export function sanitizeSpokenText(input: string | null | undefined): string {
  if (!input) return '';
  const kept = input.split(/\r?\n/).filter((raw) => {
    // Strip a leading cue emoji so an emoji-prefixed label ("🔊 SFX:") is still recognised.
    const s = raw.replace(/^\s*(?:🎬|🎥|🎞️?|🔊|🎵)\s*/, '').trim();
    if (!s) return false;
    if (/^[-=_·•*]{3,}$/.test(s)) return false; // separator rules
    if (/^\d{1,2}:\d{2}(?:\.\d+)?\s*[–—-]\s*\d{1,2}:\d{2}/.test(s)) return false; // TC timeline row
    if (/^\d+\s*[–—-]\s*\d+\b/.test(s)) return false; // frame-range row "0–144 …"
    if (/^TC\s+(?:shot|subject|camera|action)\b/i.test(s)) return false; // shot-list table header
    if (/^(?:INT|EXT)[.\/]/i.test(s)) return false; // screenplay slugline "INT./EXT. …"
    if (/^(?:სცენა|сцена|scene|shot|кадр)\s*#?\s*\d+\b/i.test(s)) return false; // scene header
    if (/^S\d+(?:\.\d+)?\b/i.test(s)) return false; // "S1.1 …" shot line
    if (/^(?:VO\d+|#)\b/i.test(s)) return false; // VO-sheet index rows
    if (SPOKEN_LABEL_RX.test(s)) return false; // "Overlay:", "SFX:", "Camera:" …
    return true;
  });
  return kept
    .map((ln) => ln
      .replace(/(?:🎬|🎥|🎞️?|🔊|🎵)/g, '') // stray emoji cues
      .replace(/\[[^\]]*\]/g, ' ') // bracketed notes / timecodes: [00:03] [whispering]
      .replace(/\([^)]*\)/g, ' ') // parenthetical directions / timecodes: (pause) (0:05)
      .replace(/\*[^*\n]*\*/g, ' ') // asterisk stage directions / emphasis: *sighs*
      .replace(/^\s*[A-Z][A-Z0-9 .'()/-]{1,30}[:：]\s*/, '') // leading SPEAKER: / NARRATOR: label
      .replace(/\b\d{1,2}:\d{2}(?:\.\d+)?\s*[–—-]\s*\d{1,2}:\d{2}(?:\.\d+)?\b/g, '') // inline TC ranges
      .replace(/\b\d{1,2}:\d{2}(?:\.\d+)?\b/g, '') // bare inline timecodes: 00:03
      .replace(/\bS\d+(?:\.\d+)?\b/g, '') // inline shot codes
      .replace(/[#>`~*_]+/g, '') // stray markdown tokens
      .trim())
    .filter((ln) => ln.length > 0)
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Alias matching the Day-1 task naming; identical behaviour. */
export const sanitizeNarration = sanitizeSpokenText;
