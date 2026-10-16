/**
 * lib/music/studio/edit.ts — deterministic, NON-DESTRUCTIVE edits of the caller's own tracks: trim, volume, mute,
 * fade in / out, join (with optional crossfade) and format conversion. ffmpeg only, no model, no provider.
 *
 * Every edit writes a NEW Library version (its own generation_jobs row, parent ids recorded); the source row and its
 * file are never touched. Sources are referenced by job id and resolved against the caller's own rows, never by URL:
 * holding a signed link is not ownership. The result is measured again and refused when its length is not the length
 * the edit should produce (±0.5 s), it has no audio stream, or it is silent (unless the edit was a mute).
 *
 * Free of charge, like the existing ffmpeg `process` op of /api/ai/edit-audio (no provider cost). Pricing it is an
 * owner decision recorded in the handoff.
 */
import { z } from 'zod';
import type { AudioQc, SavedTrack } from './contracts';
import { assertDeliverable, measureAudio, renderEdit, renderJoin, type AudioFormat, type EditOp } from './audio';
import { MusicError } from './errors';

const OpSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('trim'), startSec: z.number().min(0).max(3600), endSec: z.number().min(0).max(3600) }).strict(),
  z.object({ op: z.literal('volume'), db: z.number().min(-60).max(12) }).strict(),
  z.object({ op: z.literal('mute') }).strict(),
  z.object({ op: z.literal('fade_in'), sec: z.number().gt(0).max(30) }).strict(),
  z.object({ op: z.literal('fade_out'), sec: z.number().gt(0).max(30) }).strict(),
]);

export const MusicEditSchema = z.object({
  v: z.literal(1),
  sources: z.array(z.string().uuid()).min(1).max(6),
  ops: z.array(OpSchema).max(8).default([]),
  crossfadeSec: z.number().min(0).max(10).default(0),
  format: z.enum(['mp3', 'wav', 'm4a']),
  locale: z.enum(['ka', 'en', 'ru']),
}).strict().superRefine((r, ctx) => {
  if (new Set(r.sources).size !== r.sources.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sources'], message: 'A track appears twice' });
  if (r.sources.length > 1 && r.ops.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ops'], message: 'Join first, then edit the joined track' });
  if (r.sources.length === 1 && r.crossfadeSec > 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['crossfadeSec'], message: 'A crossfade needs two tracks' });
});
export type MusicEditRequest = z.infer<typeof MusicEditSchema>;

export interface EditSource { jobId: string; bytes: Buffer; format: AudioFormat }

export interface EditDeps {
  /** The caller's own music track by job id (any Library music row of theirs), or null. */
  load(jobId: string, userId: string): Promise<EditSource | null>;
  newId(): string;
  store(userId: string, id: string, bytes: Buffer, format: AudioFormat, qc: AudioQc): Promise<SavedTrack>;
  /** File the new version into the Library (a completed generation_jobs row). False when it could not be written. */
  record(row: { id: string; userId: string; saved: SavedTrack; request: MusicEditRequest; label: string }): Promise<boolean>;
}

export function parseMusicEdit(value: unknown): MusicEditRequest {
  const r = MusicEditSchema.safeParse(value);
  if (!r.success) throw new MusicError('validation_failed', r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), 400);
  return r.data;
}

export function editLabel(r: MusicEditRequest): string {
  if (r.sources.length > 1) return `join ×${r.sources.length}${r.crossfadeSec ? ` · crossfade ${r.crossfadeSec}s` : ''} → ${r.format}`;
  const ops = r.ops.map((o) => o.op).join(' + ');
  return `${ops || 'convert'} → ${r.format}`;
}

export async function editMusic(deps: EditDeps, userId: string, value: unknown, signal?: AbortSignal) {
  const req = parseMusicEdit(value);
  const sources: EditSource[] = [];
  for (const id of req.sources) {
    const s = await deps.load(id, userId);
    if (!s) throw new MusicError('not_found', 'A track to edit was not found in your Library.', 404);
    sources.push(s);
  }
  const measured = await Promise.all(sources.map((s) => measureAudio(s.bytes, s.format, signal)));
  let out: { bytes: Buffer; expectedSec: number };
  if (sources.length === 1) {
    out = await renderEdit(sources[0]!, req.ops as EditOp[], measured[0]!.durationSec, req.format, signal);
  } else {
    out = await renderJoin(sources.map((s, i) => ({ ...s, sec: measured[i]!.durationSec })), req.crossfadeSec, req.format, signal);
  }
  const qc = await measureAudio(out.bytes, req.format, signal);
  if (Math.abs(qc.durationSec - out.expectedSec) > 0.5) {
    throw new MusicError('quality_failed', `The edited track is ${qc.durationSec} s, expected ${out.expectedSec.toFixed(2)} s.`, 502);
  }
  const muted = req.ops.some((o) => o.op === 'mute');
  if (muted) {
    if (!qc.codec) throw new MusicError('quality_failed', 'The file has no audio stream.', 502);
  } else {
    assertDeliverable(qc, { minSec: 1, maxSec: 3600 });
  }
  const id = deps.newId();
  const saved = await deps.store(userId, id, out.bytes, req.format, qc);
  const label = editLabel(req);
  if (!(await deps.record({ id, userId, saved, request: req, label }))) throw new MusicError('jobs_unavailable', 'The edited track could not be filed in the Library.', 503);
  return { ok: true as const, jobId: id, url: saved.url, durationSec: qc.durationSec, format: req.format, qc, label, sources: req.sources, credits: 0 };
}
