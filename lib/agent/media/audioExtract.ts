/**
 * lib/agent/media/audioExtract.ts — Agent G takes the sound out of a video (or an audio file) as an MP3, as a real job.
 * Owner, 2026-10-09 12:34Z: "a video link in the chat, «take the MP3 out of this»", the way Manus shows it, on the
 * execution foundation, with no way around a platform's restrictions.
 *
 * The request side, in four calls (the same shape as ./montageExec, on the same queue):
 *
 *   quote   ONE source: a link, or one file the caller uploaded. A link must pass the source rule first (./audioSource:
 *           no video platform, no stream), then the live check: it opens, it serves video or audio (not a web page),
 *           and it is within the size cap. Then the rights: a licence the source itself publishes for the file (Wikimedia
 *           Commons' licence data, an HTTP `Link: rel="license"`) is named on the plan with its author; the caller's own
 *           upload is theirs; anything else is "unverified", and the plan says to press Start only for a file that is
 *           the user's own or licensed to them. Spends nothing; returns the plan with a signed quote (./quoteToken).
 *   run     only with that quote, which the USER confirmed in the chat: one queued row under the quote's job id (a second
 *           run of the same quote reports the first). The work is the worker's (./audioWorker): it holds a lease, takes
 *           the file through lib/video/ffmpegExec (public hosts only, the source rule on every redirect hop, media types,
 *           a byte cap), turns its first sound stream into MP3, QCs it and stores it.
 *   status  the owner reads where the job is; a job no worker has (yet, or any more) is handed to one.
 *   cancel  the owner stops a queued or running job; its worker kills its ffmpeg at the next heartbeat.
 *
 * FREE, like the montage (the owner chose free for Agent G's ffmpeg-only work on 2026-10-09): no model and no provider
 * is called, so no credits are reserved and nothing is owed back. The result is NOT filed in the Library by itself; the
 * chat's Save to Library files it (POST /api/studio/library), so a user keeps only what they choose to.
 */
import type { BannerProbe } from '@/lib/video/probeBanner';
import { bodyFingerprint } from '@/lib/orchestrator/idemRef';
import { cancel, claimable, enqueue, type LeaseRow, type LeaseStore } from '@/lib/orchestrator/jobLease';
import { classifySource, mp3NameFor } from './audioSource';
import { QUOTE_TTL_MS, signQuote, verifyQuote } from './quoteToken';
import type { AuditEvent, FileRef } from './montageExec';

/** generation_jobs rows of Agent G's audio extractions carry this queue kind in params._exec. */
export const AUDIO_KIND = 'agent-audio-extract';
export const AUDIO_PRICE_CREDITS = 0;
/** The MP3 Agent G makes: constant bitrate, stereo, 44.1 kHz (every player and editor takes it). */
export const MP3_BITRATE_KBPS = 192;
/** The longest source it takes (an hour of sound is ~86 MB of MP3 and well inside one worker's 600 s). */
export const MAX_SOURCE_SEC = 3600;
/** The largest source file it downloads (the same cap ffmpegExec applies to every input). */
export const MAX_SOURCE_BYTES = 200 * 1024 * 1024;

export type AudioErrorCode =
  | 'bad_input' | 'invalid_url' | 'platform' | 'refused' | 'stream' | 'not_media' | 'unavailable' | 'blocked_host'
  | 'too_large' | 'too_long' | 'media_not_yours' | 'unreadable' | 'no_audio' | 'not_configured' | 'invalid_request'
  | 'quote_invalid' | 'quote_changed' | 'quote_expired' | 'already_failed' | 'jobs_unavailable' | 'extract_failed'
  | 'qc_failed' | 'upload_failed' | 'cancelled' | 'not_found' | 'not_running';

export interface AudioError {
  ok: false;
  error: AudioErrorCode;
  message: string;
  /** The platform a `platform` refusal is about. */
  platform?: string;
  /** The link's HTTP status, for `unavailable`. */
  status?: number;
  jobId?: string;
}

export interface AudioRights {
  /** licensed: the source publishes a licence for this file; own: the caller's upload; unverified: neither. */
  status: 'licensed' | 'own' | 'unverified';
  license?: string;
  author?: string;
  /** Where the licence was read (the Commons file page, the `Link` header's target). */
  evidence?: string;
}

/** What the live check of a link found. */
export type Inspection =
  | {
    ok: true;
    /** What the worker fetches: the user's link, or the file a page resolved to (a Commons file page → its file). */
    fetchUrl: string;
    contentType: string;
    bytes: number | null;
    disposition: string | null;
    /** A licence the source publishes for this exact file, if any. */
    license: { license: string; author?: string; evidence: string } | null;
  }
  | { ok: false; error: 'platform' | 'refused' | 'stream' | 'not_media' | 'unavailable' | 'blocked_host' | 'too_large' | 'invalid_url'; platform?: string; status?: number };

export type ExtractOutcome =
  | { ok: true; mp3: Buffer; input: BannerProbe; output: BannerProbe | null }
  | { ok: false; error: 'no_audio' | 'too_long' | 'unavailable' | 'refused' | 'platform' | 'too_large' | 'not_media' | 'extract_failed'; detail?: string; platform?: string };

export interface AudioExecDeps {
  /** One of the caller's own uploads (or Library items) → a URL ffmpeg may read. */
  resolveFile(ref: string, userId: string): Promise<FileRef>;
  /** Does the link open, what does it serve, how big, under what licence. */
  inspect(url: string): Promise<Inspection>;
  /** ffmpeg: the first sound stream → MP3. Aborting `signal` kills it; `maxSec` caps what is decoded. */
  extract(url: string, opts: { signal: AbortSignal; maxSec: number; title: string }): Promise<ExtractOutcome>;
  /** Store the MP3; its signed URL, or null when storage refused it. */
  upload(jobId: string, mp3: Buffer): Promise<string | null>;
  /** A fresh link to a stored result of ours (it outlives its first signature). */
  resign(url: string): Promise<string>;
  store: LeaseStore;
  audit(ev: AuditEvent): Promise<void>;
  key(): string;
  now(): number;
  newId(): string;
  every(ms: number, tick: () => Promise<void>): () => void;
}

export interface AudioRequest {
  v: 1;
  source: { kind: 'link'; url: string } | { kind: 'file'; ref: string };
  name: string;
  bitrateKbps: number;
  maxSec: number;
  rights: AudioRights;
}

export interface AudioQuote {
  jobId: string;
  credits: number;
  source: 'link' | 'file';
  /** The link's host (null for a file). */
  host: string | null;
  name: string;
  bytes: number | null;
  contentType: string | null;
  rights: AudioRights;
  bitrateKbps: number;
  maxSec: number;
  expiresAt: number;
}

export type AudioQuoteResult = { ok: true; quote: AudioQuote; request: AudioRequest; token: string } | AudioError;

export type AudioJobView =
  | { ok: true; jobId: string; status: 'queued' | 'running'; stage: string | null; pct: number; attempt: number }
  | { ok: true; jobId: string; status: 'completed'; audioUrl: string; name: string; durationSec: number; bytes: number; bitrateKbps: number; rights: AudioRights | null }
  | { ok: true; jobId: string; status: 'failed'; error: AudioErrorCode };

export type AudioRunResult = (AudioJobView & { replay: boolean }) | AudioError;

const err = (error: AudioErrorCode, message: string, extra: Partial<AudioError> = {}): AudioError => ({ ok: false, error, message, ...extra });

const MESSAGES: Record<Exclude<Inspection, { ok: true }>['error'], string> = {
  platform: 'This platform does not allow its media to be downloaded outside its own player. Upload your own or a licensed file instead.',
  refused: 'This link leads somewhere files are not taken from. Upload your own or a licensed file instead.',
  stream: 'This link is a stream, not a file. Upload your own or a licensed file instead.',
  not_media: 'This link is a web page, not a video or audio file.',
  unavailable: 'The link does not open.',
  blocked_host: 'This address is not on the public internet.',
  too_large: `The file is over ${MAX_SOURCE_BYTES / (1024 * 1024)} MB.`,
  invalid_url: 'This is not a link that can be fetched.',
};

const RIGHTS = new Set(['licensed', 'own', 'unverified']);
const NAME = /^[^/\\]{1,104}\.mp3$/;

/** The stored (or returned) request, checked field by field; null when anything is off. */
export function validateAudioRequest(x: unknown): AudioRequest | null {
  const r = x as Partial<AudioRequest> | null;
  if (!r || typeof r !== 'object' || r.v !== 1) return null;
  if (r.bitrateKbps !== MP3_BITRATE_KBPS || r.maxSec !== MAX_SOURCE_SEC) return null;
  if (typeof r.name !== 'string' || !NAME.test(r.name)) return null;
  const rights = r.rights as AudioRights | undefined;
  if (!rights || !RIGHTS.has(rights.status)) return null;
  const s = r.source as AudioRequest['source'] | undefined;
  if (s?.kind === 'link') {
    if (typeof s.url !== 'string' || !classifySource(s.url).ok) return null;
  } else if (s?.kind === 'file') {
    if (typeof s.ref !== 'string' || !s.ref.trim() || s.ref.length > 2048) return null;
  } else {
    return null;
  }
  return r as AudioRequest;
}

export interface AudioQuoteInput {
  userId: string;
  /** A link the user sent… */
  url?: unknown;
  /** …or one of their own uploads (a storage path or our signed link). */
  file?: unknown;
  /** The uploaded file's own name, for the MP3's name. */
  name?: unknown;
}

/** Check the source and its rights, plan and price. Spends nothing, writes nothing but an audit event. */
export async function quoteAudioExtract(deps: AudioExecDeps, input: AudioQuoteInput): Promise<AudioQuoteResult> {
  const { userId } = input;
  const refuse = async (e: AudioError): Promise<AudioError> => {
    await deps.audit({ userId, op: 'audio_extract', phase: 'quote', outcome: 'refused', detail: e.platform ? `${e.error}: ${e.platform}` : e.error });
    return e;
  };
  const url = typeof input.url === 'string' ? input.url.trim() : '';
  const file = typeof input.file === 'string' ? input.file.trim() : '';
  if (!url === !file || url.length > 2048 || file.length > 2048) return refuse(err('bad_input', 'Send one link or one file.'));
  if (!deps.key()) return refuse(err('not_configured', 'Quotes cannot be signed on this server.'));

  let source: AudioRequest['source'];
  let fetchUrl: string;
  let host: string | null = null;
  let rights: AudioRights;
  let nameHint: { url?: string; disposition?: string | null; name?: string | null };

  if (url) {
    const v = classifySource(url);
    if (!v.ok) {
      return refuse(v.reason === 'platform'
        ? err('platform', MESSAGES.platform, { platform: v.platform })
        : err(v.reason, MESSAGES[v.reason]));
    }
    host = v.host;
    source = { kind: 'link', url: v.url };
    fetchUrl = v.url;
    nameHint = { url: v.url };
  } else {
    const r = await deps.resolveFile(file, userId);
    if (!r.ok) return refuse(r.reason === 'not_yours' ? err('media_not_yours', 'This file is not one of your uploads.') : err('unreadable', 'The file cannot be read.'));
    source = { kind: 'file', ref: file };
    fetchUrl = r.url;
    nameHint = { name: typeof input.name === 'string' ? input.name : null, url: file };
  }

  // ── does it open, what is it, how big, whose ─────────────────────────────────────────────────────────────────────
  const seen = await deps.inspect(fetchUrl);
  if (!seen.ok) {
    if (source.kind === 'file') return refuse(err('unreadable', 'The file cannot be read.'));
    return refuse(err(seen.error, MESSAGES[seen.error], {
      ...(seen.platform ? { platform: seen.platform } : {}),
      ...(seen.status ? { status: seen.status } : {}),
    }));
  }
  if (source.kind === 'link') {
    if (seen.fetchUrl !== source.url) {
      // The link was a page that names its file (a Commons file page): the plan takes that file, under the same rule.
      const direct = classifySource(seen.fetchUrl);
      if (!direct.ok) return refuse(err(direct.reason === 'platform' ? 'platform' : 'refused', MESSAGES.refused, direct.reason === 'platform' ? { platform: direct.platform } : {}));
      source = { kind: 'link', url: direct.url };
    }
    rights = seen.license ? { status: 'licensed', ...seen.license } : { status: 'unverified' };
    nameHint = { ...nameHint, url: seen.fetchUrl, disposition: seen.disposition };
  } else {
    rights = { status: 'own' };
  }

  const request: AudioRequest = {
    v: 1,
    source,
    name: mp3NameFor(nameHint),
    bitrateKbps: MP3_BITRATE_KBPS,
    maxSec: MAX_SOURCE_SEC,
    rights,
  };
  const jobId = deps.newId();
  const credits = AUDIO_PRICE_CREDITS;
  const expiresAt = deps.now() + QUOTE_TTL_MS;
  const token = signQuote({ u: userId, j: jobId, f: bodyFingerprint(request), c: credits, x: expiresAt }, deps.key());
  if (!token) return refuse(err('not_configured', 'Quotes cannot be signed on this server.'));

  const quote: AudioQuote = {
    jobId, credits, source: source.kind, host, name: request.name, bytes: seen.bytes, contentType: seen.contentType || null,
    rights, bitrateKbps: request.bitrateKbps, maxSec: request.maxSec, expiresAt,
  };
  await deps.audit({ userId, op: 'audio_extract', phase: 'quote', outcome: 'ok', jobId, files: 1, credits, detail: `${source.kind}${host ? ` ${host}` : ''}; rights ${rights.status}` });
  return { ok: true, quote, request, token };
}

/** The error column of a failed row → the code the chat speaks. Rows are written `<code>: <detail>`. */
export function audioCodeOfRow(error: string | null): AudioErrorCode {
  const e = error ?? '';
  if (/^cancel/i.test(e)) return 'cancelled';
  const code = /^([a-z_]+):/.exec(e)?.[1];
  const known: AudioErrorCode[] = ['no_audio', 'too_long', 'unavailable', 'refused', 'platform', 'too_large', 'not_media', 'qc_failed', 'upload_failed', 'invalid_request', 'media_not_yours', 'unreadable'];
  return code && (known as string[]).includes(code) ? (code as AudioErrorCode) : 'extract_failed';
}

/** The owner's view of a row. */
export function audioViewOf(row: LeaseRow): AudioJobView {
  if (row.status === 'completed') {
    const r = row.result ?? {};
    return {
      ok: true, jobId: row.id, status: 'completed',
      audioUrl: typeof r.audioUrl === 'string' ? r.audioUrl : '',
      name: typeof r.name === 'string' ? r.name : 'audio.mp3',
      durationSec: typeof r.durationSec === 'number' ? r.durationSec : 0,
      bytes: typeof r.bytes === 'number' ? r.bytes : 0,
      bitrateKbps: typeof r.bitrateKbps === 'number' ? r.bitrateKbps : MP3_BITRATE_KBPS,
      rights: r.rights && typeof r.rights === 'object' ? (r.rights as AudioRights) : null,
    };
  }
  if (row.status === 'failed') return { ok: true, jobId: row.id, status: 'failed', error: audioCodeOfRow(row.error) };
  return { ok: true, jobId: row.id, status: row.status === 'pending' ? 'queued' : 'running', stage: row.stage, pct: row.pct, attempt: row.exec?.attempt ?? 0 };
}

export interface AudioRunInput {
  userId: string;
  request: unknown;
  token: unknown;
  /** The multi-step run (lib/agent/run) this job is a step of: kept on the row (`_parent`) and in its audit. Server-set only. */
  parent?: string;
}

/** Queue a quote the user confirmed, never twice. Answers at once; the extraction is the worker's. */
export async function enqueueAudioJob(deps: AudioExecDeps, input: AudioRunInput): Promise<AudioRunResult> {
  const { userId } = input;
  const request = validateAudioRequest(input.request);
  if (!request) return err('invalid_request', 'The plan is not valid.');
  const check = verifyQuote(input.token, deps.key(), { userId, fingerprint: bodyFingerprint(request), now: deps.now() });
  if (!check.ok) {
    await deps.audit({ userId, op: 'audio_extract', phase: 'run', outcome: 'refused', detail: `quote_${check.reason}` });
    if (check.reason === 'expired') return err('quote_expired', 'This plan has expired. Ask again for a fresh one.');
    if (check.reason === 'changed') return err('quote_changed', 'The plan differs from the one quoted.');
    return err('quote_invalid', 'This plan is not valid.');
  }
  const jobId = check.claims.j;
  const put = await enqueue(deps.store, {
    id: jobId,
    userId,
    serviceType: 'music',
    kind: AUDIO_KIND,
    params: {
      subtype: 'audio-extract',
      via: 'agent-g',
      prompt: request.name.replace(/\.mp3$/, ''),
      source: request.source.kind,
      rights: request.rights.status,
      _job: { request },
      ...(input.parent ? { _parent: input.parent } : {}),
    },
  });
  if (put === 'error') return err('jobs_unavailable', 'The job could not be recorded, so it was not started.');
  if (put === 'exists') {
    const row = await deps.store.read(jobId);
    if (!row || row.userId !== userId || row.exec?.kind !== AUDIO_KIND) return err('jobs_unavailable', 'The job could not be recorded, so it was not started.');
    const view = audioViewOf(row);
    await deps.audit({ userId, op: 'audio_extract', phase: 'run', outcome: 'replayed', jobId, detail: view.status, ...(input.parent ? { runId: input.parent } : {}) });
    if (view.status === 'failed') return err('already_failed', 'This already ran and did not finish. Ask again for a fresh plan.', { jobId });
    return { ...(await withFreshUrl(deps, view)), replay: true };
  }
  await deps.audit({
    userId, op: 'audio_extract', phase: 'run', outcome: 'ok', jobId, files: 1, credits: AUDIO_PRICE_CREDITS, detail: `queued; rights ${request.rights.status}`,
    ...(input.parent ? { runId: input.parent } : {}),
  });
  return { ok: true, jobId, status: 'queued', stage: 'queued', pct: 0, attempt: 0, replay: false };
}

/** A completed view's link, re-signed (our own stored result only: the worker wrote it). */
async function withFreshUrl(deps: AudioExecDeps, view: AudioJobView): Promise<AudioJobView> {
  if (view.status !== 'completed' || !view.audioUrl) return view;
  return { ...view, audioUrl: await deps.resign(view.audioUrl).catch(() => view.audioUrl) };
}

/** A pending row no worker took within this long is handed to one by the owner's status read. */
export const AUDIO_KICK_AFTER_MS = 15_000;

/** Where the owner's job is, and whether it needs a worker now. */
export async function audioJobStatus(
  deps: AudioExecDeps,
  input: { userId: string; jobId: unknown },
): Promise<{ view: AudioJobView; needsWorker: boolean } | AudioError> {
  const jobId = typeof input.jobId === 'string' ? input.jobId : '';
  const row = jobId ? await deps.store.read(jobId) : null;
  if (!row || row.userId !== input.userId || row.exec?.kind !== AUDIO_KIND) return err('not_found', 'No such job.');
  const now = deps.now();
  const needsWorker = claimable(row, now) && (row.status === 'processing' || now - row.createdAt >= AUDIO_KICK_AFTER_MS);
  return { view: await withFreshUrl(deps, audioViewOf(row)), needsWorker };
}

export const AUDIO_CANCELLED = 'cancelled by the user';

/** The owner stops a queued or running extraction; its worker kills ffmpeg at its next heartbeat. */
export async function cancelAudioJob(deps: AudioExecDeps, input: { userId: string; jobId: unknown }): Promise<{ ok: true } | AudioError> {
  const jobId = typeof input.jobId === 'string' ? input.jobId : '';
  const before = jobId ? await deps.store.read(jobId) : null;
  if (!before || before.exec?.kind !== AUDIO_KIND) return err('not_found', 'No such job.');
  const r = await cancel(deps.store, jobId, input.userId, AUDIO_CANCELLED, false);
  if (!r.ok) return r.reason === 'final' ? err('not_running', 'This is no longer running.', { jobId }) : err('not_found', 'No such job.');
  await deps.audit({ userId: input.userId, op: 'audio_extract', phase: 'cancel', outcome: 'cancelled', jobId });
  return { ok: true };
}

export interface Mp3Verdict {
  ok: boolean;
  problems: string[];
  durationSec: number;
}

/**
 * QC of the MP3 before it is delivered: it reads back as MP3 sound and nothing else, it is more than a header, and its
 * length matches what was decoded from the source (within 2 s or 5 %). A file that fails is not delivered.
 */
export function qcMp3(output: BannerProbe | null, input: BannerProbe, bytes: number, maxSec: number): Mp3Verdict {
  if (!output) return { ok: false, problems: ['the MP3 could not be read back'], durationSec: 0 };
  const problems: string[] = [];
  if (!output.hasAudio) problems.push('no sound');
  if (output.hasVideo) problems.push('a picture stream');
  if (output.hasAudio && output.audioCodec !== 'mp3') problems.push(`sound codec ${output.audioCodec ?? 'unknown'}`);
  if (!(bytes >= 1024)) problems.push(`only ${bytes} bytes`);
  if (!(output.durationSec >= 0.2)) problems.push('shorter than a fifth of a second');
  const expected = Math.min(input.durationSec > 0 ? input.durationSec : output.durationSec, maxSec);
  const tolerance = Math.max(2, expected * 0.05);
  if (input.durationSec > 0 && !(Math.abs(output.durationSec - expected) <= tolerance)) {
    problems.push(`length ${output.durationSec.toFixed(1)}s, source ${expected.toFixed(1)}s`);
  }
  return { ok: problems.length === 0, problems, durationSec: output.durationSec };
}
