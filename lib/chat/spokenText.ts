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

// DEFENSIVE BOUNDS — spoken narration is short (generateFilmVoiceover caps at 2400 chars). These hard caps
// guarantee bounded, non-hanging runtime on ANY adversarial input (a multi-MB blob, a million-newline string,
// a giant code block) regardless of the per-line regex passes below.
const MAX_INPUT_CHARS = 20_000;
const MAX_LINES = 4_000;

export function sanitizeSpokenText(input: string | null | undefined): string {
  if (!input) return ''; // null / undefined / '' / any falsy → empty (preserves the original guard)
  // Coerce defensively — a non-string that slips past the type at runtime (a number/object) must never throw:
  // String() itself can throw on a hostile toString() or a null-prototype object, so guard it → '' on failure.
  // Then HARD-CAP the length so the downstream regex passes can never be driven to a hang.
  let coerced: string;
  try {
    coerced = typeof input === 'string' ? input : String(input);
  } catch {
    return '';
  }
  let src = coerced.slice(0, MAX_INPUT_CHARS);
  if (!src) return '';
  // Strip fenced code blocks (```…```) wholesale so an injected/pasted code block is never voiced. The lazy
  // [\s\S]*? is linear on the already-capped input; runs before the line split so multi-line fences are removed.
  src = src.replace(/```[\s\S]*?```/g, ' ');
  const rawLines = src.split(/\r?\n/);
  const kept = (rawLines.length > MAX_LINES ? rawLines.slice(0, MAX_LINES) : rawLines).filter((raw) => {
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
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '') // strip C0 control chars (NUL/BEL/ESC…) so they never reach TTS; keeps \t. Cannot touch Georgian (UTF-8 ≥ 0x80).
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

/**
 * Split narration into parts of at most `maxChars`, cut between sentences where possible (then at a clause break, then
 * between words), so a narration longer than one TTS request is read whole, in order, with no word lost. Pure; every
 * part is non-empty and the parts joined with single spaces give back the input's words.
 */
export function splitSpokenText(text: string, maxChars: number): string[] {
  const max = Math.max(40, Math.floor(maxChars));
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  if (clean.length <= max) return [clean];
  // Sentences (kept with their end mark), then any sentence still too long → clauses → word runs.
  const pieces: string[] = [];
  for (const sentence of clean.match(/[^.!?…]+(?:[.!?…]+|$)\s*/g) ?? [clean]) {
    const s = sentence.trim();
    if (!s) continue;
    if (s.length <= max) { pieces.push(s); continue; }
    for (const clause of s.match(/[^,;:]+(?:[,;:]+|$)\s*/g) ?? [s]) {
      const c = clause.trim();
      if (!c) continue;
      if (c.length <= max) { pieces.push(c); continue; }
      let run = '';
      for (const word of c.split(' ')) {
        const w = word.length > max ? word.slice(0, max) : word;
        if (run && run.length + 1 + w.length > max) { pieces.push(run); run = ''; }
        run = run ? `${run} ${w}` : w;
      }
      if (run) pieces.push(run);
    }
  }
  const parts: string[] = [];
  let part = '';
  for (const p of pieces) {
    if (part && part.length + 1 + p.length > max) { parts.push(part); part = ''; }
    part = part ? `${part} ${p}` : p;
  }
  if (part) parts.push(part);
  return parts;
}
