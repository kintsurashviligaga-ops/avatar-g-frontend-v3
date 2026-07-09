/**
 * spokenText — DEFENSIVE narration hygiene for TTS (v363). Dependency-free + pure so it is trivially
 * unit-testable and safe to import anywhere.
 *
 * Strips production-script annotations from text destined for the voice engine so it can NEVER read scene
 * headers, timecodes, frame counts, SFX / overlay / camera / grade labels or shot codes aloud (the "TTS read
 * the screenplay annotations" failure on a pasted Master Production Script). CONSERVATIVE: clean narration
 * prose (no such markers) passes through unchanged — this is a guard on the VERBATIM narration/voiceover
 * paths, NOT a production-script parser (that is a separate, larger feature).
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
    if (/^(?:სცენა|сцена|scene|shot|кадр)\s*#?\s*\d+\b/i.test(s)) return false; // scene header
    if (/^S\d+(?:\.\d+)?\b/i.test(s)) return false; // "S1.1 …" shot line
    if (/^(?:VO\d+|#)\b/i.test(s)) return false; // VO-sheet index rows
    if (SPOKEN_LABEL_RX.test(s)) return false; // "Overlay:", "SFX:", "Camera:" …
    return true;
  });
  return kept
    .map((ln) => ln
      .replace(/(?:🎬|🎥|🎞️?|🔊|🎵)/g, '') // stray emoji cues
      .replace(/\b\d{1,2}:\d{2}(?:\.\d+)?\s*[–—-]\s*\d{1,2}:\d{2}(?:\.\d+)?\b/g, '') // inline TC ranges
      .replace(/\bS\d+(?:\.\d+)?\b/g, '') // inline shot codes
      .trim())
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
