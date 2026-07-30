/**
 * lib/chat/sceneDialogue.ts
 * =========================
 * VEO-NATIVE SPEECH — resolve the SPOKEN LINE for each film scene.
 *
 * Veo 3.1 generates its clip audio natively, INCLUDING speech: give the prompt a line of dialogue as
 * natural direction ( … and says: "ჩვენ დრო აღარ გვაქვს." ) and the character in frame actually speaks
 * it, with matching lip movement, inside the clip. That is both higher quality than a post-hoc
 * ElevenLabs VO + lip-sync pass AND removes a whole post-processing hop.
 *
 * Before this module the per-scene dialogue only ever travelled as a TIMECODE WINDOW for the downstream
 * duck/lip-sync stage — the prompt that reached Veo carried visuals only, so nobody in the film ever
 * spoke. This module is the missing extraction: it pulls each scene's line out of the sources the
 * pipeline already has (a pasted scene sheet, the parsed Master Production Script's dialogue turns, the
 * dialogue textarea) and hands them to `planFilmScenes` index-aligned with the scenes.
 *
 * PURE + TOTAL by design (no imports, no I/O, never throws) so the whole matrix is unit-testable and can
 * never trigger a paid render. Every regex quantifier is explicitly BOUNDED (ReDoS guard).
 *
 * SCOPE — dialogue, not narration. An off-camera NARRATOR has no mouth in frame; asking Veo to speak a
 * VO line makes a character lip-sync a disembodied narration. So the VO spine keeps its ElevenLabs path
 * (see filmComposite) and only genuine spoken/on-camera lines are delegated to Veo.
 */

/** One spoken line bound to a scene. `speaker` refines the direction ("ANNA says: …") when known. */
export interface SceneSpokenLine {
  text: string;
  speaker?: string | null;
}

/**
 * Longest line a single clip may be asked to SPEAK. A 4–8s shot delivers roughly 15–20 words (~120
 * chars); 200 is a generous ceiling. This is the SAME bound the prompt builder applies
 * (filmPipeline re-exports it) — if the two disagreed, a line long enough to pass here would be
 * silently truncated in the prompt, i.e. words the user wrote would be spoken by nobody. A longer line
 * is deliberately treated as UNPLACEABLE so the whole delegation backs off and the ElevenLabs track —
 * which can pace a long line across the film — keeps it.
 */
export const MAX_SPOKEN_LINE_CHARS = 200;

/** Georgian letters — used to keep the marker vocabulary multilingual without unicode property escapes
 *  (the build targets ES2020, where `\p{L}` support is not guaranteed across all toolchain steps). */
const KA = '\\u10A0-\\u10FF';
const CYR = '\\u0400-\\u04FF';

/** A quoted run — straight, curly, Georgian („…") and guillemets. Bounded (2–240) so a pathological
 *  script can never blow up the matcher. */
const QUOTED_RX = new RegExp('["„“«]([^"”“„«»\\n]{2,240})["”“„»]');

// NOTE on the shape of these: every run of optional whitespace is written so that two unbounded
// whitespace quantifiers are NEVER adjacent (an optional token between them is folded INTO one of them).
// `[^\S\n]*X?[^\S\n]*` is quadratically ambiguous — a line of 8000 spaces that then fails to match makes
// the engine try every split point. Bounded input alone is not a defence.

/** "დიალოგი: …" / "Dialogue: …" / "Реплика: …" — an EXPLICIT dialogue field on its own line. */
const MARKER_LINE_RX = new RegExp(
  `(?:^|\\n)(?:[^\\S\\n]|🗣️?|💬)*` +
  `(?:დიალოგ[${KA}]{0,8}|რეპლიკ[${KA}]{0,8}|ნათქვამ[${KA}]{0,8}|dialogue|dialog|spoken\\s+line|speech|line|voice[- ]?over\\s+line|реплика|диалог|говорит)` +
  `[^\\S\\n]*[:：][^\\S\\n]*([^\\n]{2,400})`,
  'i',
);

/** Inline "…and says: „…"" / "…ამბობს: „…"" — the line embedded in prose rather than a labelled field. */
const INLINE_SAYS_RX = new RegExp(
  `(?:\\bsays?\\b|ამბობს|დაემატება|говорит|произносит)(?:[^\\S\\n]|[:：])*` +
  `(["„“«][^"”“„«»\\n]{2,240}["”“„»])`,
  'i',
);

/** "ANNA: „…"" — a screenplay speaker cue followed by the quoted line. */
const SPEAKER_CUE_RX = new RegExp(
  `(?:^|\\n)[^\\S\\n]*([A-Z${KA}${CYR}][^\\n:："„“]{0,24})[^\\S\\n]*[:：][^\\S\\n]*` +
  `(["„“«][^"”“„«»\\n]{2,240}["”“„»])`,
  '',
);

/**
 * Non-spoken labels that must NEVER be mistaken for a speaker cue. A production script is FULL of
 * `Label: "value"` rows — a colour grade, a title card, a location, a prop list — and every one of them is
 * quoted exactly like dialogue. Getting this wrong is not a silent bug: the character on screen reads the
 * production note aloud in a paid render ("ფერი speaks aloud, in Georgian: „თბილი ამბერი, ანამორფული"").
 * Kept in sync with the spoken-text sanitizer's own label list.
 */
const NON_SPEAKER_RX = new RegExp(
  `^(?:ვიზუალ[${KA}]{0,6}|კამერ[${KA}]{0,6}|განათებ[${KA}]{0,6}|ტემპ[${KA}]{0,6}|ხმ[${KA}]{0,6}|მუსიკ[${KA}]{0,6}|` +
  `ფერ[${KA}]{0,6}|სათაურ[${KA}]{0,6}|ლოკაცი[${KA}]{0,6}|ხანგრძლივ[${KA}]{0,6}|რეკვიზიტ[${KA}]{0,6}|` +
  `კოსტიუმ[${KA}]{0,6}|გარდერობ[${KA}]{0,6}|ეფექტ[${KA}]{0,6}|გადასვლ[${KA}]{0,6}|შენიშვნ[${KA}]{0,6}|` +
  `visual|camera|lighting|tempo|sfx|vfx|audio|music|sound|score|note|notes|scene|shot|duration|title|action|` +
  `mood|location|prompt|overlay|caption|subtitle|grade|colou?r|palette|props?|wardrobe|costume|set|makeup|` +
  `transition|effects?|frames?|timecode|tc|style|look|lens|aspect|format|runtime|` +
  `визуал|камера|музык|звук|цвет|титр|локаци|реквизит|костюм|переход|примечани)`,
  'i',
);

/** The quoted run that IS the line — i.e. the body opens with the quote (`„მე ვიცი." (ჩურჩულით)`), not one
 *  quoted WORD inside a sentence (`I told him "stop" and walked out.`, where the sentence is the line). */
function leadingQuoted(body: string): string | null {
  const m = body.trimStart().match(QUOTED_RX);
  return m && m.index === 0 && m[1] ? m[1] : null;
}

/** Strip wrapping quotes + trailing separators from an extracted line. */
function unquote(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/^["„“«]+/, '')
    .replace(/["”“„»]+$/, '')
    .replace(/[\s;,—–-]+$/, '')
    .trim();
}

/** A line is only worth speaking if it carries real words (not a stray punctuation run or a timecode). */
function usableLine(s: string): boolean {
  if (s.length < 2 || s.length > MAX_SPOKEN_LINE_CHARS) return false;
  // A timecode is a cue sheet, not speech — bare (00:03) or bracketed ([00:03] …, (0:06–0:12) …).
  if (/^[[(]?\d{1,2}:\d{2}/.test(s)) return false;
  return /\p{L}/u.test(s);
}

/**
 * Pull the SPOKEN line out of one scene block (a "🎬 სცენა 2 (0:06–0:12) — „title" … დიალოგი: „მე ვიცი.""
 * sheet, or any prose block that quotes what a character says).
 *
 * Priority: an explicit `დიალოგი:` / `Dialogue:` field → an inline "…says: „…"" → a screenplay speaker
 * cue (`ANNA: „…"`). The scene TITLE (a quoted run on the marker/header line) is deliberately NOT a
 * candidate — that was the obvious trap, since both are quoted. Returns null when the scene is silent.
 */
export function extractSceneDialogue(block: string | null | undefined): SceneSpokenLine | null {
  if (!block || typeof block !== 'string') return null;
  const text = block.slice(0, 8000); // bound the scan window
  try {
    // 1) An explicit dialogue FIELD. Its value may itself be quoted, and may carry a "(კაცი)" speaker.
    const field = text.match(MARKER_LINE_RX);
    if (field?.[1]) {
      const tail = field[1];
      const line = unquote(leadingQuoted(tail) ?? tail);
      if (usableLine(line)) {
        const who = tail.match(/^\s*\(?\s*([^)\n:："„“]{1,24})\s*\)\s*[:：]?/);
        return { text: line, speaker: who?.[1] ? who[1].trim() : null };
      }
    }
    // 2) Inline prose — "…and says: „…"".
    const inline = text.match(INLINE_SAYS_RX);
    if (inline?.[1]) {
      const line = unquote(inline[1]);
      if (usableLine(line)) return { text: line, speaker: null };
    }
    // 3) A screenplay speaker cue on its own line (`ANNA: „…"`). This form is the ambiguous one — a
    // production script's metadata rows look identical (`ფერი: „თბილი ამბერი"`), and the label blocklist
    // can never be complete. So it additionally requires the quoted text to READ as an utterance: ending
    // in sentence punctuation. Real dialogue does ("მე ვიცი."); a colour/prop/title note does not.
    for (const m of text.matchAll(new RegExp(SPEAKER_CUE_RX.source, 'g'))) {
      const speaker = (m[1] ?? '').trim();
      if (!speaker || NON_SPEAKER_RX.test(speaker)) continue;
      const line = unquote(m[2] ?? '');
      if (!/[.!?…:；;]$/.test(line)) continue;
      if (usableLine(line)) return { text: line, speaker };
    }
  } catch {
    /* total: a malformed block is simply "no dialogue" */
  }
  return null;
}

/** A scene's timecode window on the master timeline (either bound may be unknown). */
export interface SceneWindow {
  startSec?: number | null;
  endSec?: number | null;
}

/** A Master-Production-Script dialogue turn (speaker + timecode), as `masterDialogueTurns` emits it. */
export interface DialogueTurnLike {
  speaker?: string | null;
  text: string;
  startSec?: number | null;
}

export interface PlanSceneDialogueInput {
  sceneCount: number;
  /** Per-scene clip length — used to derive a scene's timecode window when the script has none. */
  clipSec: number;
  /** Explicit per-scene windows (from the parsed script). Index-aligned with the scenes. */
  windows?: (SceneWindow | null | undefined)[];
  /** Lines already extracted per scene from the pasted scene sheets. Index-aligned, highest priority. */
  sheets?: (SceneSpokenLine | null | undefined)[];
  /** Timecoded dialogue turns (Master Production Script). Placed by the window they fall in. */
  turns?: (DialogueTurnLike | null | undefined)[];
  /** A free-form dialogue script (the composer textarea). Used only when it maps 1:1 onto the scenes. */
  script?: string | null;
}

/** Longest single spoken line accepted from a free-form script. Matches `parseDialogueScript`'s own 400-char
 *  bound in filmVoiceover, so a line the ElevenLabs path would have voiced is never quietly dropped here. */
const MAX_SCRIPT_LINE_CHARS = 400;

/** How many lines one scene may speak. A 4–8s shot can hold a two-line exchange ("— We're out of time."
 *  / "— I know.") but not a monologue; a third line in the same window means the script's own pacing
 *  disagrees with the scene grid, which makes the whole delegation unsafe (see `complete`). */
export const MAX_LINES_PER_SCENE = 2;

/** One parsed line of a free-form dialogue script — `null` for a line that carries no speakable words. */
type ParsedScriptLine = SceneSpokenLine | null;

/** Split a free-form dialogue script into its lines, KEEPING a slot for every non-empty source line so a
 *  caller can tell "3 speakable lines" from "3 speakable lines and one we could not use". */
function parseDialogueScriptLines(script: string | null | undefined): ParsedScriptLine[] {
  if (!script || typeof script !== 'string') return [];
  const out: ParsedScriptLine[] = [];
  for (const raw of script.slice(0, 8000).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (out.length >= 24) { out.push(null); continue; } // over the bound → counts as unplaceable
    // "ANNA: „…"" / "ANNA: …" → speaker + text; otherwise the whole line is the text.
    const cue = line.match(new RegExp(`^([A-Za-z${KA}${CYR}][^:：\\n]{0,24})[:：]\\s*(.{1,${MAX_SCRIPT_LINE_CHARS}})$`));
    const speakerRaw = cue?.[1]?.trim() ?? null;
    // A METADATA row ("SFX: distant thunder", "Camera: slow push in", "Overlay: title card") is not
    // speech. Previously only the SPEAKER was nulled and the whole row was kept as the line, so Veo was
    // asked to have a character say "SFX: distant thunder rolls" out loud. Null the LINE: it is counted
    // but never placed, which blocks delegation and leaves the ElevenLabs path (whose sanitizer strips
    // exactly these labels) in charge.
    if (speakerRaw && NON_SPEAKER_RX.test(speakerRaw)) { out.push(null); continue; }
    const speaker = speakerRaw || null;
    const bodyRaw = speaker ? cue![2]! : line;
    const text = unquote(leadingQuoted(bodyRaw) ?? bodyRaw);
    out.push(usableLine(text) ? { text, speaker } : null);
  }
  return out;
}

/** Split a free-form dialogue script into its individual spoken lines (speaker cue stripped). */
export function splitDialogueScriptLines(script: string | null | undefined): SceneSpokenLine[] {
  return parseDialogueScriptLines(script).filter((l): l is SceneSpokenLine => !!l);
}

/**
 * The resolved speech plan for a film.
 *
 * `complete` is the load-bearing field. Delegating speech to Veo is only safe when EVERY line the user
 * wrote ends up in some scene's prompt: the ElevenLabs leg is dropped wholesale (it is one track for the
 * whole film, not per scene), so a line we failed to place would be spoken by nobody at all. So this is
 * an ALL-OR-NOTHING contract — `complete: false` means "delegate none of it", which leaves the proven
 * ElevenLabs path byte-identical rather than half-delegating and losing words.
 */
export interface SceneDialoguePlan {
  /** Per-scene lines, index-aligned with the film's scenes. An empty array is a silent scene. */
  scenes: SceneSpokenLine[][];
  /** Lines successfully placed into a scene. */
  placed: number;
  /** Lines the source contained. */
  total: number;
  /** True iff total > 0 and every one of them was placed → safe to delegate + drop the ElevenLabs leg. */
  complete: boolean;
}

const EMPTY_PLAN: SceneDialoguePlan = { scenes: [], placed: 0, total: 0, complete: false };

/**
 * Resolve the spoken lines for EVERY scene, index-aligned with the film plan.
 *
 * Sources, highest priority first:
 *   1. `sheets`  — the line the user wrote inside that scene's own block (unambiguous).
 *   2. `turns`   — timecoded Master-Script dialogue, placed into the scene whose window contains it.
 *   3. `script`  — the free-form dialogue textarea, positionally (line i → scene i).
 *
 * Everything that cannot be placed — a third line inside one scene's window, a line past the last scene,
 * more lines than scenes, a line with no speakable words — leaves `placed < total`, i.e. `complete: false`.
 * Pure + total.
 */
export function planSceneDialogue(input: PlanSceneDialogueInput): SceneDialoguePlan {
  const count = Number.isFinite(input.sceneCount) && input.sceneCount > 0 ? Math.floor(input.sceneCount) : 0;
  if (count === 0) return EMPTY_PLAN;
  const clipSec = Number.isFinite(input.clipSec) && input.clipSec > 0 ? input.clipSec : 8;
  const scenes: SceneSpokenLine[][] = Array.from({ length: count }, () => []);
  let placed = 0;
  let total = 0;

  /** Append to a scene, respecting the per-scene cap. Returns false when the line could not be placed. */
  const push = (idx: number, line: SceneSpokenLine): boolean => {
    if (idx < 0 || idx >= count) return false;
    const slot = scenes[idx]!;
    if (slot.length >= MAX_LINES_PER_SCENE) return false;
    slot.push({ text: line.text.trim(), speaker: line.speaker ?? null });
    return true;
  };

  // 1) Per-scene sheets — one line per scene, by construction aligned.
  const sheets = input.sheets ?? [];
  for (let i = 0; i < sheets.length; i++) {
    const line = sheets[i];
    if (!line || !usableLine(String(line.text ?? '').trim())) continue;
    total += 1;
    if (push(i, line)) placed += 1;
  }

  // 2) Timecoded turns → the scene whose window contains the turn's start.
  const turnsRaw = input.turns ?? [];
  const turns = turnsRaw.filter((t): t is DialogueTurnLike => !!t && typeof t.text === 'string');
  if (turns.length && placed === 0) {
    const windowFor = (i: number): { start: number; end: number } => {
      const w = input.windows?.[i];
      const start = typeof w?.startSec === 'number' && Number.isFinite(w.startSec) ? w.startSec : i * clipSec;
      const end = typeof w?.endSec === 'number' && Number.isFinite(w.endSec) && w.endSec > start ? w.endSec : start + clipSec;
      return { start, end };
    };
    const allTimed = turns.every((t) => typeof t.startSec === 'number' && Number.isFinite(t.startSec));
    for (let k = 0; k < turns.length; k++) {
      const t = turns[k]!;
      const text = t.text.trim();
      total += 1;
      if (!usableLine(text)) continue; // counted, never placed → blocks delegation
      let idx = -1;
      if (allTimed) {
        const at = t.startSec as number;
        for (let i = 0; i < count; i++) {
          const { start, end } = windowFor(i);
          if (at >= start && at < end) { idx = i; break; }
        }
        // A turn past the last window belongs to the closing scene (a trailing line still gets spoken).
        if (idx < 0 && at >= windowFor(count - 1).end) idx = count - 1;
      } else {
        // Untimed → positional (line k belongs to scene k). Over the scene count, it stays unplaced.
        idx = k;
      }
      if (push(idx, { text, speaker: t.speaker ?? null })) placed += 1;
    }
  } else if (turns.length) {
    // Both sources supplied. They are meant to be mutually exclusive (the caller picks whichever set the
    // ElevenLabs leg would have voiced, so delegation and suppression describe the SAME lines). Count the
    // turns as unplaced rather than assuming they duplicate the sheets — that keeps `complete` false and
    // the whole delegation off, which is the safe direction if a caller ever passes both.
    total += turns.length;
  }

  // 3) The free-form dialogue textarea — positional, one line per scene.
  if (total === 0) {
    const parsed = parseDialogueScriptLines(input.script);
    for (let i = 0; i < parsed.length; i++) {
      total += 1;
      const line = parsed[i];
      if (!line) continue; // an unusable line (a "…" separator, an over-long line) blocks delegation
      if (push(i, line)) placed += 1;
    }
  }

  return { scenes, placed, total, complete: total > 0 && placed === total };
}
