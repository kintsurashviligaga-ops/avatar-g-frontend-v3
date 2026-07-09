/**
 * masterScript — Phase 0 of the Master-Production-Script compiler.
 *
 * A pure, TOTAL (never-throws), FAIL-OPEN parser that turns a pasted Master Production Script (the rich
 * shot-list format: PRODUCTION OVERVIEW / SCENE BREAKDOWN timeline tables / VOICE CAST VO sheet / DIALOGUE
 * SPEAKERS / SCORE ARCHITECTURE / SFX TRIGGER SHEET / TITLE CARD TIMING) into the STRUCTURED fields the render
 * pipeline already consumes — so later phases can execute it faithfully instead of re-summarising the blob:
 *   • scenes        → per-scene visual action (+ title/camera/grade/time window)
 *   • narration     → the VO sheet's spoken Georgian lines → a clean narrationScript (never annotations)
 *   • dialogue      → the dialogue sheet's per-SPEAKER turns (enables multi-voice)
 *   • sfx           → the frame-timed SFX cues
 *   • muteWindows   → the SILENCE beats in the score → the (default-off) audio-mix mute windows
 *   • titleCards    → burned-overlay text + timing (NOT spoken)
 *   • meta          → runtime / format / genre / character anchor
 *
 * Dependency-light on purpose (only the pure spokenText sanitizer) so it is trivially unit-testable. Every
 * sub-parser is isolated + fail-open: a malformed section yields [] for that field, never a throw.
 */
import { sanitizeSpokenText } from '@/lib/chat/spokenText';
import { NARRATOR_SPEAKER } from '@/lib/chat/dialogueCasting';

export interface TimeWindow { startSec: number; endSec: number }
export interface MasterScene { ordinal: number; title: string | null; action: string; startSec: number | null; endSec: number | null }
export interface NarrationLine { id: string; startSec: number | null; endSec: number | null; text: string }
export interface DialogueTurn { speaker: string; startSec: number | null; text: string; direction: string | null }
export interface SfxCue { startSec: number | null; endSec: number | null; sfx: string; notes: string | null }
export interface TitleCard { startSec: number | null; endSec: number | null; text: string }
export interface MasterMeta { runtimeSec: number | null; format: string | null; genre: string | null; characterAnchor: string | null }

export interface ParsedMasterScript {
  ok: boolean;
  meta: MasterMeta;
  scenes: MasterScene[];
  narration: NarrationLine[];
  /** The VO sheet's spoken lines, sanitized + joined — safe to hand straight to TTS. */
  narrationScript: string;
  dialogue: DialogueTurn[];
  sfx: SfxCue[];
  muteWindows: TimeWindow[];
  titleCards: TitleCard[];
}

const DASH = '[–—-]';

/** MM:SS or MM:SS.d (or H:MM) → seconds. null when not a timecode. */
export function parseTc(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})(?:\.(\d+))?$/);
  if (!m) return null;
  const min = Number(m[1]);
  const sec = Number(m[2]);
  const frac = m[3] ? Number(`0.${m[3]}`) : 0;
  if (!Number.isFinite(min) || !Number.isFinite(sec)) return null;
  return min * 60 + sec + frac;
}

/** "00:00–00:02" → {startSec,endSec}. null when not a range. */
export function parseTcRange(raw: string | null | undefined): TimeWindow | null {
  if (!raw) return null;
  const m = raw.trim().match(new RegExp(`^(\\d{1,2}:\\d{2}(?:\\.\\d+)?)\\s*${DASH}\\s*(\\d{1,2}:\\d{2}(?:\\.\\d+)?)`));
  if (!m) return null;
  const a = parseTc(m[1]);
  const b = parseTc(m[2]);
  return a !== null && b !== null && b > a ? { startSec: a, endSec: b } : null;
}

/** First quoted run (straight or curly/Georgian quotes) — the spoken text; translation is the SECOND quote. */
function firstQuoted(line: string): string | null {
  const m = line.match(/["„“]([^"”“„]{2,})["”“„]/);
  return m && m[1] ? m[1].trim() : null;
}

interface Sections { [key: string]: string }
const SECTION_ANCHORS: { key: string; rx: RegExp }[] = [
  { key: 'overview', rx: /^\s*PRODUCTION\s+OVERVIEW\b/i },
  { key: 'scenes', rx: /^\s*SCENE\s+BREAKDOWN\b/i },
  { key: 'voice', rx: /^\s*VOICE\s+CAST\b/i },
  { key: 'dialogue', rx: /^\s*DIALOGUE\s+SPEAKERS\b/i },
  { key: 'score', rx: /^\s*(?:MUSIC\s*&\s*SOUND|SCORE\s+ARCHITECTURE)\b/i },
  { key: 'sfx', rx: /^\s*SFX\s+TRIGGER\b/i },
  { key: 'anchor', rx: /^\s*CHARACTER\s+ANCHOR\b(?!\s*[:：])/i }, // NOT the overview's "Character Anchor:" line
  { key: 'generation', rx: /^\s*GENERATION\s+BREAKDOWN\b/i },
  { key: 'color', rx: /^\s*COLOR\b/i },
  { key: 'qc', rx: /^\s*(?:10\/10\s+)?QC\b/i },
  { key: 'title', rx: /^\s*TITLE\s+CARD\b/i },
  { key: 'engineering', rx: /^\s*ENGINEERING\s+NOTES\b/i },
  { key: 'summary', rx: /^\s*PRODUCTION\s+SUMMARY\b/i },
];

/** Slice the script into its known sections (body text keyed by section). Absent sections are simply missing. */
export function sectionize(text: string): Sections {
  const lines = text.split(/\r?\n/);
  const hits: { key: string; at: number }[] = [];
  const seen = new Set<string>();
  // Record only the FIRST line per section key — a synonym header (e.g. SCORE ARCHITECTURE under
  // MUSIC & SOUND DESIGN, both → 'score') must NOT create a second boundary that truncates the first.
  lines.forEach((ln, i) => {
    for (const a of SECTION_ANCHORS) {
      if (a.rx.test(ln)) { if (!seen.has(a.key)) { hits.push({ key: a.key, at: i }); seen.add(a.key); } break; }
    }
  });
  const out: Sections = {};
  for (let i = 0; i < hits.length; i++) {
    const start = hits[i]!.at + 1;
    const end = i + 1 < hits.length ? hits[i + 1]!.at : lines.length;
    out[hits[i]!.key] = lines.slice(start, end).join('\n').trim();
  }
  return out;
}

function parseMeta(body: string | undefined): MasterMeta {
  const meta: MasterMeta = { runtimeSec: null, format: null, genre: null, characterAnchor: null };
  if (!body) return meta;
  const runtime = body.match(/Runtime\s*[:：]\s*([\d.]+)\s*s/i);
  if (runtime) { const n = Number(runtime[1]); if (Number.isFinite(n)) meta.runtimeSec = n; }
  const fmt = body.match(/Master\s*Format\s*[:：]\s*([^\n]+)/i);
  if (fmt?.[1]) meta.format = fmt[1].trim();
  const genre = body.match(/Genre(?:\/Tone)?\s*[:：]\s*([^\n]+)/i);
  if (genre?.[1]) meta.genre = genre[1].trim();
  const anchor = body.match(/Character\s*Anchor\s*[:：]\s*([^\n]+)/i);
  if (anchor?.[1]) meta.characterAnchor = anchor[1].trim();
  return meta;
}

/** Pull the ACTION tail out of a "TC  [shot]  [camera]  ACTION" timeline row (strips timecode + S1.1 code). */
function rowAction(line: string): string | null {
  const m = line.match(new RegExp(`^\\s*\\d{1,2}:\\d{2}(?:\\.\\d+)?\\s*${DASH}\\s*\\d{1,2}:\\d{2}(?:\\.\\d+)?\\s+(\\S.*)$`));
  if (!m || !m[1]) return null;
  const tail = m[1].trim().replace(/^S\d+(?:\.\d+)?\b[\s.:—–-]*/i, '').trim();
  return tail.length >= 6 ? tail : null;
}

function parseScenes(body: string | undefined): MasterScene[] {
  if (!body) return [];
  try {
    const scenes: MasterScene[] = [];
    // Split on "Scene N:" headers.
    const headerRx = /(^|\n)\s*Scene\s+(\d+)\s*[:：]\s*([^\n]*)/gi;
    const marks: { ordinal: number; header: string; at: number }[] = [];
    for (const m of body.matchAll(headerRx)) {
      if (typeof m.index === 'number') marks.push({ ordinal: Number(m[2]), header: m[3] ?? '', at: m.index });
    }
    for (let i = 0; i < marks.length; i++) {
      const start = marks[i]!.at;
      const end = i + 1 < marks.length ? marks[i + 1]!.at : body.length;
      const block = body.slice(start, end);
      // Title = first quoted run in the header (else the raw header text).
      const title = firstQuoted(marks[i]!.header) ?? (marks[i]!.header.trim() || null);
      // Time window from the "Duration: 0:00–0:06" line.
      const durLine = block.match(/Duration\s*[:：]\s*([^\n·]+)/i);
      const win = durLine ? parseTcRange(durLine[1]) : null;
      // Action = the joined ACTION tails of the timeline rows; append the Visual: grade as a style hint.
      const actions = block.split(/\r?\n/).map(rowAction).filter((x): x is string => !!x);
      let action = actions.join('. ');
      const grade = block.match(/(?:ვიზუალი|visual|визуал)\s*[:：]\s*([^\n]+)/i);
      if (grade && grade[1]) action += (action ? ' — ' : '') + grade[1].trim();
      action = action.replace(/\s+/g, ' ').trim();
      if (action.length >= 6) {
        scenes.push({ ordinal: marks[i]!.ordinal, title, action, startSec: win?.startSec ?? null, endSec: win?.endSec ?? null });
      }
    }
    return scenes;
  } catch { return []; }
}

function parseNarration(body: string | undefined): NarrationLine[] {
  if (!body) return [];
  try {
    const out: NarrationLine[] = [];
    for (const raw of body.split(/\r?\n/)) {
      const m = raw.match(new RegExp(`^\\s*(VO\\d+)\\s+(\\d{1,2}:\\d{2}(?:\\.\\d+)?(?:\\s*${DASH}\\s*\\d{1,2}:\\d{2}(?:\\.\\d+)?)?)\\s+(.+)$`, 'i'));
      if (!m || !m[1] || !m[2]) continue;
      const text = firstQuoted(m[3] ?? '');
      if (!text) continue;
      const win = parseTcRange(m[2]);
      out.push({ id: m[1].toUpperCase(), startSec: win?.startSec ?? parseTc(m[2].split(/[–—-]/)[0] ?? ''), endSec: win?.endSec ?? null, text });
    }
    return out;
  } catch { return []; }
}

function parseDialogue(body: string | undefined): DialogueTurn[] {
  if (!body) return [];
  try {
    const out: DialogueTurn[] = [];
    for (const raw of body.split(/\r?\n/)) {
      // "Speaker   00:09   "Georgian"   "translation"   Direction …"
      const m = raw.match(/^\s*([A-Za-zÀ-ÿႠ-ჿ][^\s"„“]{0,24})\s+(\d{1,2}:\d{2}(?:\.\d+)?)\s+["„“]/);
      if (!m || !m[1]) continue;
      const text = firstQuoted(raw);
      if (!text) continue;
      // Direction = the run AFTER the second quoted (translation), best-effort.
      const afterQuotes = raw.split(/["”“„]/).slice(4).join(' ').trim();
      const direction = afterQuotes ? afterQuotes.replace(/\s{2,}.*$/, '').trim() || null : null;
      out.push({ speaker: m[1].trim(), startSec: parseTc(m[2]), text, direction });
    }
    return out;
  } catch { return []; }
}

function parseSfx(body: string | undefined): SfxCue[] {
  if (!body) return [];
  try {
    const out: SfxCue[] = [];
    for (const raw of body.split(/\r?\n/)) {
      // Rows lead with a frame range/number, then a TC (range or single), then the SFX name, then a duration col.
      const tc = raw.match(new RegExp(`(\\d{1,2}:\\d{2})(?:\\s*${DASH}\\s*(\\d{1,2}:\\d{2}))?`));
      if (!tc) continue;
      // Ignore header + non-cue lines.
      if (/^\s*(?:frames?|tc)\b/i.test(raw)) continue;
      const afterTc = raw.slice((tc.index ?? 0) + tc[0].length);
      // SFX name = up to the duration column (Nf / "cont.") or two+ spaces.
      const nameM = afterTc.match(/^\s*(.+?)(?:\s{2,}|\s+\d+f\b|\s+cont\.?\b|$)/i);
      const sfx = (nameM?.[1] ?? '').trim();
      if (sfx.length < 2 || /^[+\-–—]/.test(sfx)) continue;
      const notesM = afterTc.match(/(?:\d+f|cont\.?)\s+(.+)$/i);
      out.push({ startSec: parseTc(tc[1] ?? ''), endSec: tc[2] ? parseTc(tc[2]) : null, sfx, notes: notesM?.[1] ? notesM[1].trim() : null });
    }
    return out;
  } catch { return []; }
}

function parseMuteWindows(scoreBody: string | undefined): TimeWindow[] {
  if (!scoreBody) return [];
  try {
    const out: TimeWindow[] = [];
    for (const raw of scoreBody.split(/\r?\n/)) {
      if (!/\b(silence|muted?|non[-\s]?negotiable)\b/i.test(raw)) continue;
      const range = raw.match(new RegExp(`(\\d{1,2}:\\d{2})\\s*${DASH}\\s*(\\d{1,2}:\\d{2})`));
      if (!range) continue;
      const win = parseTcRange(`${range[1]}–${range[2]}`);
      if (win) out.push(win);
    }
    return out;
  } catch { return []; }
}

function parseTitleCards(body: string | undefined): TitleCard[] {
  if (!body) return [];
  try {
    const out: TitleCard[] = [];
    for (const raw of body.split(/\r?\n/)) {
      // "Frame 744–768 (00:31–00:32):  "ის დილა / THAT MORNING""
      const tcM = raw.match(new RegExp(`\\((\\d{1,2}:\\d{2})(?:\\s*${DASH}\\s*(\\d{1,2}:\\d{2}))?\\)\\s*[:：]\\s*(.+)$`));
      if (!tcM) continue;
      const raw3 = tcM[3] ?? '';
      const text = (firstQuoted(raw3) ?? raw3.trim()).replace(/\s+/g, ' ').trim();
      if (!text) continue;
      out.push({ startSec: parseTc(tcM[1]), endSec: tcM[2] ? parseTc(tcM[2]) : null, text });
    }
    return out;
  } catch { return []; }
}

/** Parse a Master Production Script into structured render inputs. Total + fail-open. */
export function parseMasterScript(input: string | null | undefined): ParsedMasterScript {
  const empty: ParsedMasterScript = {
    ok: false,
    meta: { runtimeSec: null, format: null, genre: null, characterAnchor: null },
    scenes: [], narration: [], narrationScript: '', dialogue: [], sfx: [], muteWindows: [], titleCards: [],
  };
  if (!input || typeof input !== 'string') return empty;
  try {
    const sec = sectionize(input);
    const scenes = parseScenes(sec.scenes ?? input);
    const narration = parseNarration(sec.voice);
    const dialogue = parseDialogue(sec.dialogue);
    const sfx = parseSfx(sec.sfx);
    const muteWindows = parseMuteWindows(sec.score);
    const titleCards = parseTitleCards(sec.title);
    const meta = parseMeta(sec.overview);
    // narrationScript: the spoken VO lines, sanitized so no annotation can ever be voiced.
    const narrationScript = sanitizeSpokenText(narration.map((n) => n.text).join(' '));
    const ok = scenes.length > 0 || narration.length > 0 || dialogue.length > 0;
    return { ok, meta, scenes, narration, narrationScript, dialogue, sfx, muteWindows, titleCards };
  } catch {
    return empty;
  }
}

/** A single voiced turn for the dialogue leg — speaker drives casting, direction refines the voice, startSec
 *  is the timecode (null if untimed). startSec is additive: the casting path ignores it, but the DAY-4
 *  multi-voice spatial premix needs it to place each line on the master timeline. */
export interface MasterTurn { speaker: string; text: string; direction: string | null; startSec: number | null }

/**
 * Build the ordered dialogue-leg turns for the audio pipeline. When the script has ON-CAMERA dialogue, the
 * VO NARRATOR spine is FOLDED IN as narrator-voiced turns (so it is never dropped when dialogue also exists)
 * and the whole set is ordered by timecode — untimed lines sort last, keeping insertion order (stable sort).
 * Returns [] when there is no on-camera dialogue, so the caller routes narration through the single-voice
 * narration leg instead. Pure + total.
 */
export function masterDialogueTurns(
  parsed: ParsedMasterScript,
  narratorGender: 'male' | 'female' | null,
): MasterTurn[] {
  if (!parsed?.ok || !parsed.dialogue?.length) return [];
  const narratorDir = narratorGender === 'male' ? 'male narrator' : narratorGender === 'female' ? 'female narrator' : 'narrator';
  const rows: { speaker: string; text: string; direction: string | null; t: number | null }[] = [
    ...(parsed.narration ?? []).map((n) => ({ speaker: NARRATOR_SPEAKER, text: n.text, direction: narratorDir, t: n.startSec })),
    ...(parsed.dialogue ?? []).map((d) => ({ speaker: d.speaker, text: d.text, direction: d.direction, t: d.startSec })),
  ];
  return rows
    .sort((a, b) => (a.t ?? Infinity) - (b.t ?? Infinity))
    .map(({ speaker, text, direction, t }) => ({ speaker, text, direction, startSec: t }));
}
