/**
 * lib/agent/media/editExec.ts — Agent G edits one of the user's videos (or takes a still from it) as a real job, on the
 * same lease queue as the montage and the MP3 (lib/orchestrator/jobLease). Master Task PART 3, slice 2: the edits the
 * remix and the editor already make (lib/video/remixOps, surgicalOps), now an action Agent G can quote, queue, follow,
 * stop and deliver into the chat, including on its own last result.
 *
 * The request side, in four calls (./audioExtract's shape):
 *
 *   quote   ONE file of the caller's own (an upload, a Library item, or a result Agent G made for them: a link to
 *           another site is not taken here). It is probed, the asked edits are resolved against it (./editPlan: the
 *           exact range kept, the frame, the length, the sound), and the plan is signed (./quoteToken). Spends nothing.
 *   run     only with that quote, which the USER confirmed in the chat: one queued row under the quote's job id (a
 *           second run of the same quote reports the first). The work is the worker's (./editWorker).
 *   status  the owner reads where the job is; a job no worker has (yet, or any more) is handed to one.
 *   cancel  the owner stops a queued or running edit; its worker kills its ffmpeg at the next heartbeat.
 *
 * FREE (EDIT_PRICE_CREDITS 0): no model and no provider is called. The result is filed like the montage's (the row's
 * signed_url), so it shows in the Library and in the task tray.
 */
import type { BannerProbe } from '@/lib/video/probeBanner';
import { bodyFingerprint } from '@/lib/orchestrator/idemRef';
import { cancel, claimable, enqueue, type LeaseRow, type LeaseStore } from '@/lib/orchestrator/jobLease';
import {
  ADJUST_KEYS, EDIT_KIND, EDIT_PRICE_CREDITS, MAX_ADJUST, SIGNED_ADJUST, editNameFor, resolveEdits, validateEditRequest,
  type EditPlan, type EditPlanError, type EditRequest, type MediaEdit,
} from './editPlan';
import { findLayers, type Anchor, type Layer, type LayerTarget } from './layers';
import type { LayerQcRecord } from './layerQc';
import type { OverlayQcRecord } from './overlayFx';
import { QUOTE_TTL_MS, signQuote, verifyQuote } from './quoteToken';
import { TAP, approvalParams, withNote, type RunApproval } from '@/lib/agent/approval';
import type { AuditEvent, FileRef } from './montageExec';

export { EDIT_KIND, EDIT_PRICE_CREDITS };

export type EditErrorCode =
  | EditPlanError['error']
  | 'bad_input' | 'media_not_yours' | 'unreadable' | 'not_configured' | 'invalid_request' | 'quote_invalid'
  | 'quote_changed' | 'quote_expired' | 'already_failed' | 'jobs_unavailable' | 'source_changed' | 'render_failed'
  | 'unavailable' | 'too_large' | 'qc_failed' | 'upload_failed' | 'cancelled' | 'not_found' | 'not_running'
  | 'missing_glyphs' | 'text_does_not_fit' | 'layer_picture' | 'no_captions';

export interface EditError {
  ok: false;
  error: EditErrorCode;
  message: string;
  jobId?: string;
  /** The specifics a refusal names (the characters a font lacks, the layer a change could not find). */
  detail?: string;
}

export type RenderOutcome =
  | {
    ok: true; bytes: Buffer; input: BannerProbe; output: BannerProbe | null;
    /** The same edit without its captions (the captions' `both`). */
    clean?: { bytes: Buffer; output: BannerProbe | null };
    /** The layers measured on the rendered file (./layerQc). */
    layerQc?: LayerQcRecord;
    /** The overlay measured on the rendered file (./overlayFx): there, and the picture kept under it. */
    overlayQc?: OverlayQcRecord;
    /** The caption track as files. */
    subtitles?: { srt: string; vtt: string };
  }
  | { ok: false; error: 'render_failed' | 'unavailable' | 'too_large' | 'no_video' | 'qc_failed' | 'text_does_not_fit' | 'missing_glyphs' | 'layer_picture'; detail?: string };

export interface EditExecDeps {
  /** One of the caller's own files (an upload, a Library item, our own result) → a URL ffmpeg may read. */
  resolveFile(ref: string, userId: string): Promise<FileRef>;
  probe(url: string): Promise<BannerProbe | null>;
  /**
   * ffmpeg: the source → the edited MP4 (or the JPEG). Aborting `signal` kills it. `assets`: the picture layers' files
   * (their refs → URLs ffmpeg may read), resolved as the caller's own by the worker.
   */
  render(url: string, request: EditRequest, opts: { signal: AbortSignal; assets?: Record<string, string> }): Promise<RenderOutcome>;
  /** Store the result (`variant` 'clean': the copy without captions); its signed URL, or null when storage refused it. */
  upload(jobId: string, bytes: Buffer, output: EditPlan['output'], variant?: 'clean'): Promise<string | null>;
  /** The characters of these texts the renderer's fonts cannot draw (the quote refuses them; absent = not checked). */
  missingGlyphs?(texts: string[]): string[];
  /** A fresh link to a stored result of ours (it outlives its first signature). */
  resign(url: string): Promise<string>;
  store: LeaseStore;
  audit(ev: AuditEvent): Promise<void>;
  key(): string;
  now(): number;
  newId(): string;
  every(ms: number, tick: () => Promise<void>): () => void;
}

export interface EditQuote {
  jobId: string;
  credits: number;
  name: string;
  edits: MediaEdit[];
  plan: EditPlan;
  expiresAt: number;
}

export type EditQuoteResult = { ok: true; quote: EditQuote; request: EditRequest; token: string } | EditError;

export type EditJobView =
  | { ok: true; jobId: string; status: 'queued' | 'running'; stage: string | null; pct: number; attempt: number }
  | {
    ok: true; jobId: string; status: 'completed'; output: 'mp4' | 'jpg'; url: string; name: string; durationSec: number; width: number; height: number; edits: MediaEdit[];
    /** The clean copy (no captions), when one was asked for. */
    clean?: { url: string; name: string };
    /** The caption track as files (UTF-8 text). */
    subtitles?: { srt: string; vtt: string };
    /** The QC of the layers on the rendered file: its outcome and what it measured. */
    layerQc?: { outcome: string; warnings: string[]; checks: number };
    /** A revision: the earlier edit it changed. */
    parentJobId?: string;
  }
  | { ok: true; jobId: string; status: 'failed'; error: EditErrorCode };

export type EditRunResult = (EditJobView & { replay: boolean }) | EditError;

const err = (error: EditErrorCode, message: string, extra: Partial<EditError> = {}): EditError => ({ ok: false, error, message, ...extra });

export interface EditQuoteInput {
  userId: string;
  /** The caller's own file: a storage path, our signed link, or a Library item's link. */
  file?: unknown;
  /** The edits as asked (./editWords mineEdits, a tool call, a run step); resolved here against the file. */
  edits?: unknown;
  /** The file's own name, for the result's name. */
  name?: unknown;
}

/** Edits that change the result's timeline: a revision with one of these is made on the earlier RESULT, not its source. */
const TIME_EDITS = new Set(['trim', 'speed', 'thumbnail']);

/** The job id of an edit result of ours named by a link or storage path (`…/edits/<uuid>.mp4|jpg`), or null. */
export function editJobIdOf(file: string): string | null {
  let path = file;
  try { if (/^https?:\/\//i.test(file)) path = decodeURIComponent(new URL(file).pathname); } catch { return null; }
  const m = /(?:^|\/)edits\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:-clean)?\.(?:mp4|jpg)$/i.exec(path);
  return m ? m[1]!.toLowerCase() : null;
}

/**
 * A revision: the caller's own completed edit behind `file` (a result of ours), when the new asks only change its look
 * (layers, captions, frame, colour, fades, sound): the new edit is the earlier one changed, rendered again from the SAME
 * source, so a moved or removed layer leaves no trace. Null: not a revision (a time edit is made on the result itself).
 */
async function revisionOf(deps: EditExecDeps, userId: string, file: string, asks: unknown): Promise<{ jobId: string; request: EditRequest } | null> {
  const jobId = editJobIdOf(file);
  if (!jobId || !Array.isArray(asks) || asks.some((a) => TIME_EDITS.has((a as { op?: string } | null)?.op ?? ''))) return null;
  const row = await deps.store.read(jobId).catch(() => null);
  if (!row || row.userId !== userId || row.exec?.kind !== EDIT_KIND || row.status !== 'completed') return null;
  const request = validateEditRequest((row.params._job as { request?: unknown } | undefined)?.request);
  return request ? { jobId, request } : null;
}

/** The look of the picture as the result shows it: asked again, it changes what is there (./mergeAsks stackLook). */
const STACKED: ReadonlySet<string> = new Set(['adjust', 'rotate', 'flip', 'motion']);
const opOf = (a: unknown): string | undefined => (a as { op?: string } | null)?.op;
const numOr0 = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * Light and colour, a turn, a mirror and a movement asked on a result that has them change what the result shows, so
 * they add to the parent's own: „brighter" again is brighter still (to the limit), a turn of 90° more makes 180°, the
 * same mirror twice is the picture as it was and two different ones are a half turn, „and a glitch" keeps the zoom.
 * Null when none of them is asked again (each asked op then simply replaces the parent's). A value that is not a number
 * is passed on as asked, for resolveEdits to refuse.
 */
function stackLook(parent: readonly MediaEdit[], asks: readonly unknown[]): unknown[] | null {
  const ask = (op: string) => asks.find((a) => opOf(a) === op) as Record<string, unknown> | undefined;
  if (![...STACKED].some((op) => ask(op) && parent.some((e) => e.op === op))) return null;
  const out: unknown[] = [];
  const pa = parent.find((e) => e.op === 'adjust'), aa = ask('adjust');
  if (pa && aa && ADJUST_KEYS.every((k) => aa[k] === undefined || typeof aa[k] === 'number')) {
    const m: Record<string, unknown> = { op: 'adjust' };
    for (const k of ADJUST_KEYS) {
      const low = SIGNED_ADJUST.has(k) ? -MAX_ADJUST : 0;
      const v = Math.max(low, Math.min(MAX_ADJUST, Math.round(numOr0(pa[k]) + numOr0(aa[k]))));
      if (v !== 0) m[k] = v;
    }
    if (Object.keys(m).length > 1) out.push(m);
  } else if (aa || pa) out.push(aa ?? { ...pa });
  let turn = 0;
  const pf = parent.find((e) => e.op === 'flip'), af = ask('flip');
  if (pf && af && (af.axis === undefined || af.axis === 'horizontal' || af.axis === 'vertical')) {
    if ((af.axis ?? 'horizontal') !== pf.axis) turn = 180; // a mirror each way is a half turn; the same one twice, none
  } else if (af || pf) out.push(af ?? { ...pf });
  const pr = parent.find((e) => e.op === 'rotate'), ar = ask('rotate');
  if (ar && typeof ar.deg !== 'number') out.push(ar);
  else {
    const deg = ((((pr?.deg ?? 0) + Math.round(numOr0(ar?.deg)) + turn) % 360) + 360) % 360;
    if (deg !== 0) out.push({ op: 'rotate', deg });
  }
  const pm = parent.find((e) => e.op === 'motion'), am = ask('motion');
  if (pm || am) out.push(pm && am ? { ...pm, ...am, op: 'motion' } : am ?? { ...pm });
  return out;
}

/**
 * The asks merged onto a parent edit: each asked op replaces the parent's own (the look of the picture adds to its
 * own: stackLook); layer changes apply to its layers. A captions ask without a track keeps the parent's track (with and
 * without captions: the same lines, delivered anew); `off` takes the captions away.
 */
function mergeAsks(parent: readonly MediaEdit[], asks: unknown[]): unknown[] {
  const asked = new Set(asks.map(opOf));
  const stacked = stackLook(parent, asks);
  if (stacked) asks = [...asks.filter((a) => !STACKED.has(opOf(a) ?? '')), ...stacked];
  const kept = parent.filter((e) => !asked.has(e.op) && e.op !== 'layers' && !(stacked && STACKED.has(e.op))).map((e) => ({ ...e })) as unknown[];
  // Places erased before stay erased: a new place is added to them („and the logo top left too").
  const parentErase = parent.find((e) => e.op === 'erase');
  if (parentErase && asked.has('erase')) {
    asks = asks.map((a) => {
      const e = a as { op?: string; boxes?: unknown[] } | null;
      return e?.op === 'erase' && Array.isArray(e.boxes) ? { ...e, boxes: [...parentErase.boxes.map((b) => ({ ...b })), ...e.boxes] } : a;
    });
  }
  const layersAsk = asks.find((a) => (a as { op?: string } | null)?.op === 'layers');
  const parentLayers = parent.find((e) => e.op === 'layers');
  // Layers not asked about stay as they were (the stored list, checked again against the new result).
  if (!layersAsk && parentLayers) kept.push({ op: 'layers', layers: parentLayers.layers });
  const parentTrack = parent.find((e) => e.op === 'captions');
  const merged: unknown[] = [];
  for (const a of asks) {
    const c = a as { op?: string; track?: unknown; deliver?: unknown; off?: unknown } | null;
    if (c?.op !== 'captions') { merged.push(a); continue; }
    if (c.off === true) continue;
    merged.push(c.track || !parentTrack ? a : { op: 'captions', track: parentTrack.track, deliver: c.deliver ?? parentTrack.deliver });
  }
  return [...kept, ...merged];
}

/**
 * A captions ask with no lines of its own („with and without captions", „without captions") on a file that has no
 * captions of ours: there is nothing to deliver twice, and captions in the picture itself are never painted over.
 */
function captionsWithout(asks: unknown, parent: readonly MediaEdit[] | null): boolean {
  if (!Array.isArray(asks) || parent?.some((e) => e.op === 'captions')) return false;
  return asks.some((a) => {
    const c = a as { op?: string; track?: unknown } | null;
    return c?.op === 'captions' && !c.track;
  });
}

/**
 * What the words remove that is not a layer of ours (a logo, a watermark, a text or subtitles in the picture itself)
 * becomes an erase of that place of the source (./editPlan `erase`): a removal no layer of ours answers, at the place it
 * names (`at`, else `where`), in the stretch it names; „without subtitles" on a file with no captions of ours is the
 * subtitles' band at the bottom. Layer removals that are ours stay layer removals. A place not said is asked for.
 */
export function eraseFromSource(asks: unknown, parentLayers: readonly Layer[], parentHasCaptions: boolean): unknown {
  if (!Array.isArray(asks)) return asks;
  const boxes: Array<Record<string, unknown>> = [];
  let unplaced = false;
  const out: unknown[] = [];
  for (const a of asks) {
    const l = a as { op?: string; remove?: unknown; off?: unknown; track?: unknown } | null;
    if (l?.op === 'captions' && l.off === true && !l.track && !parentHasCaptions) {
      boxes.push({ at: 'bottom' });
      continue;
    }
    if (l?.op !== 'layers' || !Array.isArray(l.remove)) { out.push(a); continue; }
    const ours: unknown[] = [];
    for (const raw of l.remove) {
      const t = (raw ?? {}) as LayerTarget & { at?: Anchor; fromSec?: number; toSec?: number; firstSec?: number; lastSec?: number };
      if (findLayers(parentLayers, t).length) { ours.push(raw); continue; }
      const at = t.at ?? t.where;
      if (!at || t.all) { unplaced = true; continue; }
      const { fromSec, toSec, firstSec, lastSec } = t;
      boxes.push({ at, ...(fromSec !== undefined ? { fromSec } : {}), ...(toSec !== undefined ? { toSec } : {}), ...(firstSec !== undefined ? { firstSec } : {}), ...(lastSec !== undefined ? { lastSec } : {}) });
    }
    const rest: Record<string, unknown> = { ...(l as Record<string, unknown>) };
    if (ours.length) rest.remove = ours;
    else delete rest.remove;
    if (rest.add || rest.change || rest.remove || rest.layers) out.push(rest);
  }
  if (unplaced) out.push({ op: 'erase', boxes: [] });
  else if (boxes.length) {
    const given = out.findIndex((a) => (a as { op?: string } | null)?.op === 'erase');
    if (given >= 0) {
      const e = out[given] as { boxes?: unknown[] };
      out[given] = { ...e, boxes: [...(Array.isArray(e.boxes) ? e.boxes : []), ...boxes] };
    } else {
      out.push({ op: 'erase', boxes });
    }
  }
  return out;
}

/** Probe the file, resolve the edits against it, plan and sign. Spends nothing, writes nothing but an audit event. */
export async function quoteEdit(deps: EditExecDeps, input: EditQuoteInput): Promise<EditQuoteResult> {
  const { userId } = input;
  const refuse = async (e: EditError): Promise<EditError> => {
    await deps.audit({ userId, op: 'media_edit', phase: 'quote', outcome: 'refused', detail: e.error });
    return e;
  };
  const file = typeof input.file === 'string' ? input.file.trim() : '';
  if (!file || file.length > 2048) return refuse(err('bad_input', 'Send one of your videos.'));
  if (!deps.key()) return refuse(err('not_configured', 'Quotes cannot be signed on this server.'));

  // A revision of an edit of ours: the same source again, the earlier edits changed (layers moved, removed, added).
  const parent = await revisionOf(deps, userId, file, input.edits);
  const sourceRef = parent ? parent.request.source.ref : file;
  const parentLayers: Layer[] = (parent?.request.edits.find((e) => e.op === 'layers') as { layers?: Layer[] } | undefined)?.layers ?? [];
  // What is in the picture itself (not a layer of ours) is erased at its place, said on the card before Start.
  const own = eraseFromSource(input.edits, parentLayers, Boolean(parent?.request.edits.some((e) => e.op === 'captions')));
  const asks = parent && Array.isArray(own) ? mergeAsks(parent.request.edits, own) : own;
  if (captionsWithout(own, parent?.request.edits ?? null)) {
    return refuse(err('no_captions', 'There are no captions of ours on this file: send the lines with their times.'));
  }

  const r = await deps.resolveFile(sourceRef, userId);
  if (!r.ok) return refuse(r.reason === 'not_yours' ? err('media_not_yours', 'This file is not one of yours.') : err('unreadable', 'The file cannot be read.'));
  const probe = await deps.probe(r.url);
  if (!probe) return refuse(err('unreadable', 'The file cannot be read.'));
  const resolved = resolveEdits(asks, probe, { layers: parentLayers });
  if (!resolved.ok) return refuse(err(resolved.error, resolved.message, resolved.detail ? { detail: resolved.detail } : {}));

  // Words the fonts cannot draw are refused here, by name, before anything runs (never drawn as blanks or boxes).
  const layers = (resolved.edits.find((e) => e.op === 'layers') as { layers?: Layer[] } | undefined)?.layers ?? [];
  const captions = resolved.edits.find((e) => e.op === 'captions');
  const caption = resolved.edits.find((e) => e.op === 'caption');
  const texts = [
    ...layers.flatMap((l) => (l.kind === 'text' ? [l.text] : [])),
    ...(captions?.op === 'captions' ? captions.track.cues.map((c) => (c.speaker ? `${c.speaker}: ${c.text}` : c.text)) : []),
    ...(caption?.op === 'caption' ? [caption.text] : []),
  ];
  const missing = texts.length && deps.missingGlyphs ? deps.missingGlyphs(texts) : [];
  if (missing.length) return refuse(err('missing_glyphs', `The font cannot draw: ${missing.join(' ')}`, { detail: missing.join(' ') }));
  // A picture layer is one of the caller's own files, checked now and again by the worker.
  for (const l of layers) {
    if (l.kind !== 'image') continue;
    const pic = await deps.resolveFile(l.ref, userId);
    if (!pic.ok) return refuse(err(pic.reason === 'not_yours' ? 'media_not_yours' : 'layer_picture', 'The picture to put on it cannot be used.'));
  }

  const request: EditRequest = {
    v: 1,
    source: { ref: sourceRef },
    edits: resolved.edits,
    name: editNameFor(typeof input.name === 'string' && input.name.trim() ? input.name : sourceRef, resolved.plan.output),
    plan: resolved.plan,
    ...(parent ? { parent: { jobId: parent.jobId, depth: (parent.request.parent?.depth ?? 0) + 1 } } : {}),
  };
  const jobId = deps.newId();
  const credits = EDIT_PRICE_CREDITS;
  const expiresAt = deps.now() + QUOTE_TTL_MS;
  const token = signQuote({ u: userId, j: jobId, f: bodyFingerprint(request), c: credits, x: expiresAt }, deps.key());
  if (!token) return refuse(err('not_configured', 'Quotes cannot be signed on this server.'));
  await deps.audit({
    userId, op: 'media_edit', phase: 'quote', outcome: 'ok', jobId, files: 1, credits, durationSec: resolved.plan.durationSec,
    detail: `${resolved.edits.map((e) => e.op).join('+')} → ${resolved.plan.output}`,
  });
  return { ok: true, quote: { jobId, credits, name: request.name, edits: request.edits, plan: request.plan, expiresAt }, request, token };
}

/** The error column of a failed row → the code the chat speaks. Rows are written `<code>: <detail>`. */
export function editCodeOfRow(error: string | null): EditErrorCode {
  const e = error ?? '';
  if (/^cancel/i.test(e)) return 'cancelled';
  const code = /^([a-z_]+):/.exec(e)?.[1];
  const known: EditErrorCode[] = ['source_changed', 'no_video', 'unavailable', 'too_large', 'qc_failed', 'upload_failed', 'invalid_request', 'media_not_yours', 'unreadable', 'missing_glyphs', 'text_does_not_fit', 'layer_picture'];
  return code && (known as string[]).includes(code) ? (code as EditErrorCode) : 'render_failed';
}

const cleanOf = (r: Record<string, unknown>): { url: string; name: string } | null => {
  const c = r.clean as { url?: unknown; name?: unknown } | undefined;
  return c && typeof c.url === 'string' && typeof c.name === 'string' ? { url: c.url, name: c.name } : null;
};
const subtitlesOf = (r: Record<string, unknown>): { srt: string; vtt: string } | null => {
  const s = r.subtitles as { srt?: unknown; vtt?: unknown } | undefined;
  return s && typeof s.srt === 'string' && typeof s.vtt === 'string' ? { srt: s.srt, vtt: s.vtt } : null;
};
const layerQcSummary = (q: Record<string, unknown>): { outcome: string; warnings: string[]; checks: number } => ({
  outcome: typeof q.outcome === 'string' ? q.outcome : 'UNVERIFIED',
  warnings: Array.isArray(q.warnings) ? q.warnings.filter((w): w is string => typeof w === 'string').slice(0, 10) : [],
  checks: Array.isArray(q.checks) ? q.checks.length : 0,
});

/** The owner's view of a row. */
export function editViewOf(row: LeaseRow): EditJobView {
  if (row.status === 'completed') {
    const r = row.result ?? {};
    const request = validateEditRequest((row.params._job as { request?: unknown } | undefined)?.request);
    const output = r.output === 'jpg' ? 'jpg' : 'mp4';
    return {
      ok: true, jobId: row.id, status: 'completed', output,
      url: typeof r.url === 'string' ? r.url : '',
      name: typeof r.name === 'string' ? r.name : `video-edit.${output}`,
      durationSec: typeof r.durationSec === 'number' ? r.durationSec : 0,
      width: typeof r.width === 'number' ? r.width : 0,
      height: typeof r.height === 'number' ? r.height : 0,
      edits: request?.edits ?? [],
      ...(cleanOf(r) ? { clean: cleanOf(r)! } : {}),
      ...(subtitlesOf(r) ? { subtitles: subtitlesOf(r)! } : {}),
      ...(r.layerQc && typeof r.layerQc === 'object' ? { layerQc: layerQcSummary(r.layerQc as Record<string, unknown>) } : {}),
      ...(request?.parent ? { parentJobId: request.parent.jobId } : {}),
    };
  }
  if (row.status === 'failed') return { ok: true, jobId: row.id, status: 'failed', error: editCodeOfRow(row.error) };
  return { ok: true, jobId: row.id, status: row.status === 'pending' ? 'queued' : 'running', stage: row.stage, pct: row.pct, attempt: row.exec?.attempt ?? 0 };
}

export interface EditRunInput {
  userId: string;
  request: unknown;
  token: unknown;
  /** The multi-step run (lib/agent/run) this job is a step of: kept on the row (`_parent`) and in its audit. Server-set only. */
  parent?: string;
  /** How the user said yes (lib/agent/approval, parsed by the route): kept on the row (`_approval`) and in the audit. Absent = the Start tap. */
  approval?: RunApproval;
}

/** Queue a quote the user confirmed, never twice. Answers at once; the edit is the worker's. */
export async function enqueueEditJob(deps: EditExecDeps, input: EditRunInput): Promise<EditRunResult> {
  const { userId } = input;
  const approval = input.approval ?? TAP;
  const request = validateEditRequest(input.request);
  if (!request) return err('invalid_request', 'The plan is not valid.');
  const check = verifyQuote(input.token, deps.key(), { userId, fingerprint: bodyFingerprint(request), now: deps.now() });
  if (!check.ok) {
    await deps.audit({ userId, op: 'media_edit', phase: 'run', outcome: 'refused', detail: `quote_${check.reason}` });
    if (check.reason === 'expired') return err('quote_expired', 'This plan has expired. Ask again for a fresh one.');
    if (check.reason === 'changed') return err('quote_changed', 'The plan differs from the one quoted.');
    return err('quote_invalid', 'This plan is not valid.');
  }
  const jobId = check.claims.j;
  const put = await enqueue(deps.store, {
    id: jobId,
    userId,
    serviceType: request.plan.output === 'jpg' ? 'image' : 'film',
    kind: EDIT_KIND,
    params: {
      subtype: request.plan.output === 'jpg' ? (request.plan.still ? 'design' : 'thumbnail') : 'edit',
      via: 'agent-g',
      prompt: request.edits.map((e) => e.op).join(' + '),
      _job: { request },
      ...(input.parent ? { _parent: input.parent } : {}),
      ...approvalParams(approval),
    },
  });
  if (put === 'error') return err('jobs_unavailable', 'The job could not be recorded, so it was not started.');
  if (put === 'exists') {
    const row = await deps.store.read(jobId);
    if (!row || row.userId !== userId || row.exec?.kind !== EDIT_KIND) return err('jobs_unavailable', 'The job could not be recorded, so it was not started.');
    const view = editViewOf(row);
    await deps.audit({ userId, op: 'media_edit', phase: 'run', outcome: 'replayed', jobId, detail: view.status, ...(input.parent ? { runId: input.parent } : {}) });
    if (view.status === 'failed') return err('already_failed', 'This already ran and did not finish. Ask again for a fresh plan.', { jobId });
    return { ...(await withFreshUrl(deps, view)), replay: true };
  }
  await deps.audit({
    userId, op: 'media_edit', phase: 'run', outcome: 'ok', jobId, files: 1, credits: EDIT_PRICE_CREDITS, approval: approval.channel,
    detail: withNote(`queued: ${request.edits.map((e) => e.op).join('+')}`, approval), ...(input.parent ? { runId: input.parent } : {}),
  });
  return { ok: true, jobId, status: 'queued', stage: 'queued', pct: 0, attempt: 0, replay: false };
}

/** A completed view's link, re-signed (our own stored result only: the worker wrote it). */
async function withFreshUrl(deps: EditExecDeps, view: EditJobView): Promise<EditJobView> {
  if (view.status !== 'completed' || !view.url) return view;
  const url = await deps.resign(view.url).catch(() => view.url);
  const clean = view.clean ? { ...view.clean, url: await deps.resign(view.clean.url).catch(() => view.clean!.url) } : undefined;
  return { ...view, url, ...(clean ? { clean } : {}) };
}

/** A pending row no worker took within this long is handed to one by the owner's status read. */
export const EDIT_KICK_AFTER_MS = 15_000;

/** Where the owner's job is, and whether it needs a worker now. */
export async function editJobStatus(
  deps: EditExecDeps,
  input: { userId: string; jobId: unknown },
): Promise<{ view: EditJobView; needsWorker: boolean } | EditError> {
  const jobId = typeof input.jobId === 'string' ? input.jobId : '';
  const row = jobId ? await deps.store.read(jobId) : null;
  if (!row || row.userId !== input.userId || row.exec?.kind !== EDIT_KIND) return err('not_found', 'No such job.');
  const now = deps.now();
  const needsWorker = claimable(row, now) && (row.status === 'processing' || now - row.createdAt >= EDIT_KICK_AFTER_MS);
  return { view: await withFreshUrl(deps, editViewOf(row)), needsWorker };
}

export const EDIT_CANCELLED = 'cancelled by the user';

/** The owner stops a queued or running edit; its worker kills ffmpeg at its next heartbeat. */
export async function cancelEditJob(deps: EditExecDeps, input: { userId: string; jobId: unknown }): Promise<{ ok: true } | EditError> {
  const jobId = typeof input.jobId === 'string' ? input.jobId : '';
  const before = jobId ? await deps.store.read(jobId) : null;
  if (!before || before.exec?.kind !== EDIT_KIND) return err('not_found', 'No such job.');
  const r = await cancel(deps.store, jobId, input.userId, EDIT_CANCELLED, false);
  if (!r.ok) return r.reason === 'final' ? err('not_running', 'This is no longer running.', { jobId }) : err('not_found', 'No such job.');
  await deps.audit({ userId: input.userId, op: 'media_edit', phase: 'cancel', outcome: 'cancelled', jobId });
  return { ok: true };
}
