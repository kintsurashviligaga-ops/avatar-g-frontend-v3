/**
 * scriptSchema — a strict Zod contract for structured film-script inputs.
 *
 * A script is an ordered list of timed segments, each either a DIALOGUE token (a character speaking,
 * used to key lip-sync + audio ducking) or a NARRATOR voice-over block. Timecodes are absolute-second
 * offsets on the master timeline. Parsing is total: parseScript never throws — it returns a discriminated
 * ok/err so callers (the orchestrator, the audio mixer, the lip-sync node) fail-fast on malformed input.
 */
import { z } from 'zod';

/** A non-negative timecode offset, in seconds, on the master timeline. */
const timecode = z.number().finite().nonnegative();

const dialogueToken = z.object({
  kind: z.literal('dialogue'),
  character: z.string().trim().min(1).max(80),
  text: z.string().trim().min(1).max(2000),
  startSec: timecode,
  endSec: timecode,
});

const narratorBlock = z.object({
  kind: z.literal('narrator'),
  text: z.string().trim().min(1).max(4000),
  startSec: timecode,
  endSec: timecode,
});

export const scriptSegmentSchema = z.discriminatedUnion('kind', [dialogueToken, narratorBlock]);
export type ScriptSegment = z.infer<typeof scriptSegmentSchema>;
export type DialogueSegment = z.infer<typeof dialogueToken>;

/** An explicit [startSec, endSec] window on the master timeline (score hard-mute / silence beat). */
export const timeWindowSchema = z.object({ startSec: timecode, endSec: timecode });
export type TimeWindow = z.infer<typeof timeWindowSchema>;

export const scriptSchema = z
  .object({
    title: z.string().trim().max(200).optional(),
    totalDurationSec: z.number().finite().positive().max(3600),
    segments: z.array(scriptSegmentSchema).min(1).max(500),
    /** Explicit score hard-mute / silence-beat windows — the dynamic driver of the audio mixer. */
    muteWindows: z.array(timeWindowSchema).max(50).optional(),
  })
  // Cross-field timing invariants — validated here (discriminatedUnion members can't carry .refine).
  .superRefine((s, ctx) => {
    s.segments.forEach((seg, i) => {
      if (seg.endSec < seg.startSec) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['segments', i, 'endSec'], message: 'endSec must be ≥ startSec' });
      }
      if (seg.endSec > s.totalDurationSec) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['segments', i, 'endSec'], message: 'segment endSec exceeds totalDurationSec' });
      }
    });
    (s.muteWindows ?? []).forEach((w, i) => {
      if (w.endSec <= w.startSec) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['muteWindows', i, 'endSec'], message: 'endSec must be > startSec' });
      }
      if (w.endSec > s.totalDurationSec) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['muteWindows', i, 'endSec'], message: 'muteWindow exceeds totalDurationSec' });
      }
    });
  });

export type Script = z.infer<typeof scriptSchema>;

export type ParseScriptResult =
  | { ok: true; script: Script }
  | { ok: false; error: string; issues: string[] };

/** Total, non-throwing parse. Returns the validated script or a flat list of human-readable issues. */
export function parseScript(input: unknown): ParseScriptResult {
  const r = scriptSchema.safeParse(input);
  if (r.success) return { ok: true, script: r.data };
  const issues = r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
  return { ok: false, error: issues.join('; '), issues };
}

/** The dialogue spans (start/end/character) — the keys the audio mixer ducks under and lip-sync targets. */
export function dialogueSpans(script: Script): { startSec: number; endSec: number; character: string }[] {
  return script.segments
    .filter((s): s is DialogueSegment => s.kind === 'dialogue')
    .map((s) => ({ startSec: s.startSec, endSec: s.endSec, character: s.character }));
}

/** True when any dialogue overlaps [aSec, bSec) — used to gate lip-sync / ducking on a window. */
export function hasDialogueInWindow(script: Script, aSec: number, bSec: number): boolean {
  return script.segments.some((s) => s.kind === 'dialogue' && s.startSec < bSec && s.endSec > aSec);
}

/**
 * The audio-mixer inputs derived from a parsed script: the dialogue spans and the explicit mute windows
 * (silence beats). This is the single connection point between a parsed script and the audio stage.
 * In the ffmpeg assembler the MUTE WINDOWS drive the hard-mute post-pass (script-driven, never a hardcoded
 * window). The DIALOGUE SPANS feed the standalone compileAudioMix time-driven duck; the assembler itself
 * ducks the score via buildFilterComplex's voice-keyed sidechain, so it does not re-apply span ducking.
 */
export function scriptMixWindows(script: Script): { dialogueSpans: TimeWindow[]; muteWindows: TimeWindow[] } {
  return {
    dialogueSpans: dialogueSpans(script).map((d) => ({ startSec: d.startSec, endSec: d.endSec })),
    muteWindows: script.muteWindows ?? [],
  };
}
