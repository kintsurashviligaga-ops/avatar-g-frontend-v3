/**
 * lib/chat/remixPlanner.ts
 * ========================
 * The HONEST core of conversational video editing (Gemini Remix, Unified Master
 * Prompt §6). Gemini does not *generate* an edited video — it cannot. The real
 * architecture: interpret a natural-language edit request against the film's
 * existing scene structure into a STRUCTURED PLAN, then re-run ONLY the affected
 * pipeline legs for ONLY the affected scenes — reusing the same continuity seed
 * so the untouched 80% of the film is byte-identical and the edit blends in.
 *
 * This module is the PURE, dependency-light planner: a deterministic heuristic
 * interpreter (the graceful fallback when Gemini is unconfigured or errors) plus
 * the leg-selection + plan-merge logic. The LLM adapter (`geminiRemixAgent.ts`)
 * produces the SAME `RemixSceneEdit[]` shape with higher fidelity; everything
 * downstream is identical whether the edits came from Gemini or the heuristic.
 */

// ─── Plan model ───────────────────────────────────────────────────────────────

/** What dimension of a scene an edit touches — drives which legs re-run. */
export type RemixEditKind = 'visual' | 'dialogue' | 'audio' | 'full';

export interface RemixSceneEdit {
  /** 1-based scene ordinal this edit targets. */
  ordinal: number;
  kind: RemixEditKind;
  /** The user's instruction, verbatim (folded into the scene's re-render prompt). */
  instruction: string;
}

/** Pipeline legs that can be re-run, named to match the Console's agent ids. */
export type RemixLeg = 'storyboard' | 'voice' | 'video' | 'lipsync' | 'sfx' | 'montage';

export interface RemixPlan {
  editedScenes: RemixSceneEdit[];
  /** Union of legs to re-run — only these agents work; the rest stay untouched. */
  rerunLegs: RemixLeg[];
  /** Scene ordinals left byte-identical (continuity preserved). */
  unchangedOrdinals: number[];
  /** One-line human summary for the log + the Gemini Remix node. */
  summary: string;
}

// ─── Leg selection ────────────────────────────────────────────────────────────
//
// `montage` ALWAYS re-runs — the final cut must be re-stitched once any scene
// changes. Visual edits re-frame (storyboard) + re-render (video). Dialogue edits
// re-synthesise the voice + re-align lips. Audio edits re-score. A `full` edit
// regenerates the scene end-to-end.

const LEGS_FOR_KIND: Record<RemixEditKind, RemixLeg[]> = {
  visual: ['storyboard', 'video', 'montage'],
  dialogue: ['voice', 'lipsync', 'montage'],
  audio: ['sfx', 'montage'],
  full: ['storyboard', 'voice', 'video', 'lipsync', 'sfx', 'montage'],
};

const LEG_ORDER: RemixLeg[] = ['storyboard', 'voice', 'video', 'lipsync', 'sfx', 'montage'];

export function legsForEditKind(kind: RemixEditKind): RemixLeg[] {
  return LEGS_FOR_KIND[kind];
}

// ─── Heuristic interpreter (deterministic fallback) ──────────────────────────

const DIALOGUE_RX = /\b(say|says|said|saying|dialogue|line|lines|voice[\s-]?over|voiceover|narrat\w*|speak\w*|speech|script|words?|talk\w*|tell|monologue)\b/i;
const AUDIO_RX = /\b(music|sound[\s-]?track|soundtrack|sfx|sound[\s-]?effects?|score|foley|audio|louder|quieter|volume|beat|tempo|melody|tune)\b/i;
const FULL_RX = /\b(redo|re-?generate|regenerate|completely|from scratch|start over|entirely|whole new)\b/i;

/** Classify the dominant edit dimension from the instruction text. */
export function classifyEditKind(text: string): RemixEditKind {
  if (FULL_RX.test(text)) return 'full';
  const dialogue = DIALOGUE_RX.test(text);
  const audio = AUDIO_RX.test(text);
  // Mixing dialogue + audio (or either + an explicit visual word) escalates to full.
  if (dialogue && audio) return 'full';
  if (dialogue) return 'dialogue';
  if (audio) return 'audio';
  return 'visual';
}

const ORDINAL_WORDS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8,
};

const allOrdinals = (sceneCount: number): number[] => Array.from({ length: sceneCount }, (_, i) => i + 1);

/**
 * Scene ordinals EXPLICITLY referenced by a fragment (empty when none) plus a
 * whole-film flag. Unlike `resolveTargetOrdinals`, this does NOT fall back to
 * "all" — the per-clause interpreter needs to know when a clause is unscoped so
 * it can inherit the previous clause's scope or defer to a film-wide note.
 */
export function resolveExplicitOrdinals(text: string, sceneCount: number): { ordinals: number[]; wholeFilm: boolean } {
  const t = text.toLowerCase();
  const found = new Set<number>();
  const clamp = (n: number) => n >= 1 && n <= sceneCount;

  // "scene 3", "scenes 2", "shot 2", "clip 4", "scene #5"
  for (const m of t.matchAll(/\b(?:scene|shot|clip)s?\s*#?\s*(\d{1,2})\b/g)) {
    const n = Number(m[1]);
    if (clamp(n)) found.add(n);
  }
  // "the 3rd scene", "2nd shot"
  for (const m of t.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)\b/g)) {
    const n = Number(m[1]);
    if (clamp(n)) found.add(n);
  }
  // A clause that LEADS with a bare number is a scene reference ("…and 4 darker").
  const lead = t.match(/^\s*(\d{1,2})\b/);
  if (lead) {
    const n = Number(lead[1]);
    if (clamp(n)) found.add(n);
  }
  // Ordinal words: "the first scene", "third one"
  for (const [word, n] of Object.entries(ORDINAL_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(t) && clamp(n)) found.add(n);
  }
  // Positional language
  if (/\b(begin\w*|start|opening|intro)\b/.test(t)) found.add(1);
  if (/\b(end\w*|last|final|finale|closing|outro)\b/.test(t)) found.add(sceneCount);
  if (/\bmiddle\b/.test(t) && sceneCount >= 1) found.add(Math.ceil(sceneCount / 2));

  const wholeFilm = /\b(all|every|whole|entire|everything|throughout|overall|globally|the (?:video|film|clip|movie))\b/.test(t);
  return { ordinals: Array.from(found).sort((a, b) => a - b), wholeFilm };
}

/**
 * Resolve which scene ordinals an instruction targets. Falls back to "every
 * scene" when no specific reference is found (a general note applies film-wide).
 */
export function resolveTargetOrdinals(text: string, sceneCount: number): number[] {
  const { ordinals, wholeFilm } = resolveExplicitOrdinals(text, sceneCount);
  if (wholeFilm || ordinals.length === 0) return allOrdinals(sceneCount);
  return ordinals;
}

/** Split a request into independent edit clauses ("X and Y; then Z"). */
export function splitClauses(text: string): string[] {
  return text
    .split(/\s+and\s+|\s+then\s+|[,;]|\.(?:\s|$)/i)
    .map((c) => c.trim())
    .filter(Boolean);
}

/**
 * Deterministic interpreter: text → `RemixSceneEdit[]`. Each CLAUSE resolves its
 * own scenes + kind, so "make scene 2 brighter and change the ending's dialogue"
 * routes a VISUAL re-render of scene 2 AND a DIALOGUE re-render of the last scene
 * — not one coarse kind across both. An unscoped clause inherits the previous
 * clause's scenes (continuation); a clause that never gains a scope is a
 * film-wide note. Used directly as the graceful fallback, and as the shape the
 * Gemini adapter conforms its output to.
 */
export function interpretEditRequest(text: string, sceneCount: number): RemixSceneEdit[] {
  const instruction = String(text || '').trim();
  if (!instruction || sceneCount <= 0) return [];

  const clauses = splitClauses(instruction);
  const edits: RemixSceneEdit[] = [];
  const globals: { kind: RemixEditKind; instruction: string }[] = [];
  let scope: number[] = [];

  for (const clause of clauses) {
    const { ordinals, wholeFilm } = resolveExplicitOrdinals(clause, sceneCount);
    const kind = classifyEditKind(clause);
    const target = wholeFilm ? allOrdinals(sceneCount) : ordinals;
    if (target.length > 0) {
      scope = target;
      for (const o of target) edits.push({ ordinal: o, kind, instruction: clause });
    } else if (scope.length > 0) {
      // Continuation — "…and add rain" applies to the previous clause's scenes.
      for (const o of scope) edits.push({ ordinal: o, kind, instruction: clause });
    } else {
      globals.push({ kind, instruction: clause });
    }
  }

  // Clauses that never gained a scene scope are film-wide notes.
  for (const g of globals) for (const o of allOrdinals(sceneCount)) edits.push({ ordinal: o, kind: g.kind, instruction: g.instruction });

  // Defensive: a non-empty request must always yield at least one edit.
  if (edits.length === 0) {
    const kind = classifyEditKind(instruction);
    return allOrdinals(sceneCount).map((ordinal) => ({ ordinal, kind, instruction }));
  }
  return edits;
}

// ─── Plan assembly + merge ────────────────────────────────────────────────────

/** Escalate two edit kinds targeting the same scene to the broadest one. */
function mergeKind(a: RemixEditKind, b: RemixEditKind): RemixEditKind {
  if (a === b) return a;
  return 'full'; // any disagreement on a scene means re-run it end-to-end
}

/** Collapse edits to at most one per scene, merging kinds + instructions. */
export function dedupeEdits(edits: RemixSceneEdit[]): RemixSceneEdit[] {
  const byOrdinal = new Map<number, RemixSceneEdit>();
  for (const e of edits) {
    const prev = byOrdinal.get(e.ordinal);
    if (!prev) {
      byOrdinal.set(e.ordinal, { ...e });
    } else {
      byOrdinal.set(e.ordinal, {
        ordinal: e.ordinal,
        kind: mergeKind(prev.kind, e.kind),
        instruction: prev.instruction === e.instruction ? prev.instruction : `${prev.instruction}; ${e.instruction}`,
      });
    }
  }
  return Array.from(byOrdinal.values()).sort((a, b) => a.ordinal - b.ordinal);
}

/** Build the executable plan from a set of scene edits. */
export function buildRemixPlan(sceneCount: number, rawEdits: RemixSceneEdit[]): RemixPlan {
  const editedScenes = dedupeEdits(rawEdits.filter((e) => e.ordinal >= 1 && e.ordinal <= sceneCount));
  const legSet = new Set<RemixLeg>();
  for (const e of editedScenes) for (const leg of legsForEditKind(e.kind)) legSet.add(leg);
  const rerunLegs = LEG_ORDER.filter((l) => legSet.has(l));
  const editedOrdinals = new Set(editedScenes.map((e) => e.ordinal));
  const unchangedOrdinals = Array.from({ length: sceneCount }, (_, i) => i + 1).filter((o) => !editedOrdinals.has(o));

  const summary = editedScenes.length === 0
    ? 'No applicable changes detected'
    : editedScenes.length === sceneCount
      ? `Re-rendering all ${sceneCount} scenes · ${rerunLegs.filter((l) => l !== 'montage').join(', ')}`
      : `Re-rendering scene${editedScenes.length > 1 ? 's' : ''} ${editedScenes.map((e) => e.ordinal).join(', ')} · keeping ${unchangedOrdinals.length} untouched`;

  return { editedScenes, rerunLegs, unchangedOrdinals, summary };
}

/** One-shot: text → plan (heuristic). The Gemini path swaps step 1 for the LLM. */
export function planRemixFromText(text: string, sceneCount: number): RemixPlan {
  return buildRemixPlan(sceneCount, interpretEditRequest(text, sceneCount));
}

/**
 * STRICT edit-intent discriminator for the conversational film studio — true ONLY
 * when `text` is clearly an edit of an EXISTING film, not a fresh brief. Used to
 * gate create-vs-remix routing so a brand-new film request is never swallowed as
 * an edit. Deliberately biased toward FALSE (create): `interpretEditRequest` has
 * a catch-all fallback that maps any non-empty text to edits, so it must NOT be
 * used for routing — this is the routing gate.
 */
export function looksLikeFilmEdit(text: string): boolean {
  const t = (text || '').trim().toLowerCase();
  if (t.length < 3) return false;

  // Fresh-film briefs are descriptive — never treat these as edits.
  if (/\b(make|create|generate|produce|i want|give me|new)\b[^.!?]*\b(film|video|movie|clip|story|ad|advert|trailer|reel|short)\b/.test(t)) return false;
  if (/\b\d+\s*[-\s]?\s*(second|sec|minute|min)\b/.test(t)) return false; // "30 second …" brief
  if (/^(a|an|the)\s/.test(t) && t.length > 40) return false;             // long descriptive brief

  // Explicit scene reference → edit.
  if (/\bscenes?\s*#?\s*\d/.test(t)) return true;
  if (/\b(\d+(?:st|nd|rd|th)|first|second|third|fourth|fifth|last|final|opening|closing|ending|beginning|intro|outro)\s+(?:scene|shot|clip)\b/.test(t)) return true;

  // Short imperative edit on the existing film (verb + a concrete edit target).
  const editVerb = /\b(make|change|edit|adjust|redo|re-?render|replace|tweak|turn|fix|brighten|darken|recolou?r|reframe|swap|remove|add|slow|speed|shorten|extend|lengthen|mute|boost)\b/.test(t);
  const editTarget = /\b(it|this|that|the (?:scene|shot|clip|ending|beginning|intro|outro|start|middle|end|background|music|voice|lighting|colou?r|mood|tone|pace|sky|light)|darker|brighter|warmer|cooler|lighter|moodier|slower|faster|louder|quieter|longer|shorter)\b/.test(t);
  return editVerb && editTarget && t.length <= 90;
}
