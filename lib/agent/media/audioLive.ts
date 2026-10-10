/**
 * lib/agent/media/audioLive.ts — the live effects behind ./audioExtract and ./audioWorker: the caller's files
 * (lib/security/callerMedia), the link check (lib/web/publicFetch, with the source rule on every redirect hop), the
 * licence a source publishes (./commonsLicense), ffmpeg-static through lib/video/ffmpegExec, the `renders` bucket,
 * generation_jobs as the lease queue, and the shared audit trail (./montageLive).
 */
import 'server-only';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { resolveCallerMedia } from '@/lib/security/callerMedia';
import { probeMedia } from '@/lib/services/montage/beatAnalysis';
import { ffmpegExec } from '@/lib/video/ffmpegExec';
import { parseProbeBanner } from '@/lib/video/probeBanner';
import { fetchPublic, type PublicFetchOptions } from '@/lib/web/publicFetch';
import { reSignIfInternal, uploadBufferAndSign } from '@/lib/orchestrator/storage-adapter';
import { supabaseLeaseStore } from '@/lib/orchestrator/jobLease';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { reportError } from '@/lib/observability/report-error';
import { MAX_SOURCE_BYTES, MP3_BITRATE_KBPS, type AudioExecDeps, type ExtractOutcome, type Inspection } from './audioExtract';
import { STREAM_TYPES, platformOfUrl } from './audioSource';
import { commonsLicense, isCommonsPage, licenseFromLinkHeader } from './commonsLicense';
import { audit, every, quoteKey } from './montageLive';

const WEEK_SEC = 604_800;
/** A signed link to the caller's own upload: the quote's 30 minutes plus a run, with room to spare. */
const SOURCE_TTL_SEC = 3600;
const FF_TIMEOUT_MS = 540_000;

/** Every hop of a link is held to the source rule: no platform page and no platform CDN, whatever redirected there. */
export const notAPlatform = (url: string): boolean => platformOfUrl(url) === null;

/** What a link serves, by its Content-Type: a file we can take sound from, a stream, or something else. */
export function mediaKind(contentType: string, url: string): 'media' | 'stream' | 'other' {
  const ct = contentType.split(';')[0]!.trim().toLowerCase();
  if (STREAM_TYPES.test(ct)) return 'stream';
  if (/^(?:video|audio)\//.test(ct) || /^application\/(?:ogg|mp4|x-matroska|octet-stream)$/.test(ct) || ct === 'binary/octet-stream') return 'media';
  // A storage host that names no type: the address's own extension decides.
  if (!ct && /\.(?:mp4|m4v|mov|webm|mkv|mp3|m4a|aac|wav|ogg|oga|opus|flac)(?:$|[?#])/i.test(url)) return 'media';
  return 'other';
}

/** Does the link open, what does it serve, how big is it, does its source publish a licence for it. */
export async function inspectLink(url: string, io: Pick<PublicFetchOptions, 'fetchImpl' | 'lookupImpl'> = {}): Promise<Inspection> {
  let fetchUrl = url;
  let license: { license: string; author?: string; evidence: string } | null = null;
  const commons = await commonsLicense(url, io);
  if (commons) {
    license = { license: commons.license, ...(commons.author ? { author: commons.author } : {}), evidence: commons.pageUrl };
    if (isCommonsPage(url)) fetchUrl = commons.fileUrl;
  } else if (isCommonsPage(url)) {
    return { ok: false, error: 'not_media' };
  }

  const opts = { ...io, allowUrl: notAPlatform, timeoutMs: 10_000 };
  let r = await fetchPublic(fetchUrl, { ...opts, method: 'HEAD' });
  // Some hosts refuse HEAD (403/405/501) but serve GET: ask again, read the headers only.
  if (!r.ok && r.error === 'http_error' && (r.status === 403 || r.status === 405 || r.status === 501)) r = await fetchPublic(fetchUrl, opts);
  if (!r.ok) {
    if (r.error === 'refused_url') {
      const platform = r.url ? platformOfUrl(r.url) : null;
      return platform ? { ok: false, error: 'platform', platform } : { ok: false, error: 'refused' };
    }
    if (r.error === 'invalid_url') return { ok: false, error: 'invalid_url' };
    if (r.error === 'blocked_host') return { ok: false, error: 'blocked_host' };
    return { ok: false, error: 'unavailable', ...(r.status ? { status: r.status } : {}) };
  }
  void r.res.body?.cancel().catch(() => undefined);
  const contentType = (r.res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  const kind = mediaKind(contentType, r.url);
  if (kind === 'stream') return { ok: false, error: 'stream' };
  if (kind === 'other') return { ok: false, error: 'not_media' };
  const cl = Number(r.res.headers.get('content-length'));
  const bytes = Number.isFinite(cl) && cl > 0 ? cl : null;
  if (bytes !== null && bytes > MAX_SOURCE_BYTES) return { ok: false, error: 'too_large' };
  if (!license) {
    const declared = licenseFromLinkHeader(r.res.headers.get('link'));
    if (declared) license = { license: declared, evidence: 'the file\'s own Link: rel="license" header' };
  }
  return { ok: true, fetchUrl, contentType, bytes, disposition: r.res.headers.get('content-disposition'), license };
}

const stderrOf = (e: unknown): string => String((e as { stderr?: string })?.stderr ?? (e as Error)?.message ?? '');

/** ffmpeg's refusal of a download (lib/video/ffmpegExec "ffmpeg input refused (<code>)") → the job's error. */
function refusalOf(text: string, url: string): ExtractOutcome | null {
  const code = /ffmpeg input refused \(([a-z_]+)\)/i.exec(text)?.[1];
  if (!code) return null;
  if (code === 'refused_url') {
    const platform = platformOfUrl(url);
    return { ok: false, error: platform ? 'platform' : 'refused', detail: 'a redirect left the allowed hosts', ...(platform ? { platform } : {}) };
  }
  if (code === 'too_large') return { ok: false, error: 'too_large', detail: `over ${MAX_SOURCE_BYTES} bytes` };
  if (code === 'wrong_type') return { ok: false, error: 'not_media', detail: 'the link no longer serves video or audio' };
  return { ok: false, error: 'unavailable', detail: code };
}

/** The first sound stream of `url` → a stereo 44.1 kHz CBR MP3, its metadata replaced by its title only. */
export async function extractMp3(
  url: string,
  opts: { signal: AbortSignal; maxSec: number; title: string },
  io: Pick<PublicFetchOptions, 'fetchImpl' | 'lookupImpl'> = {},
): Promise<ExtractOutcome> {
  const bin = (ffmpegStatic as unknown as string | null) ?? null;
  if (!bin) return { ok: false, error: 'extract_failed', detail: 'ffmpeg is missing' };
  const dir = await mkdtemp(join(tmpdir(), 'mp3-'));
  const out = join(dir, 'audio.mp3');
  try {
    let stderr: string;
    try {
      ({ stderr } = await ffmpegExec(bin, [
        '-hide_banner', '-y', '-i', url,
        '-map', '0:a:0', '-vn', '-sn', '-dn', '-map_metadata', '-1',
        '-ac', '2', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', `${MP3_BITRATE_KBPS}k`,
        '-t', String(opts.maxSec), '-id3v2_version', '3', '-metadata', `title=${opts.title.slice(0, 100)}`,
        '-f', 'mp3', out,
      ], { maxBuffer: 1 << 24, timeout: FF_TIMEOUT_MS, signal: opts.signal }, { ...io, allowUrl: notAPlatform }));
    } catch (e) {
      if (opts.signal.aborted) return { ok: false, error: 'extract_failed', detail: 'cancelled' };
      const text = stderrOf(e);
      const refused = refusalOf(text, url);
      if (refused) return refused;
      const input = parseProbeBanner(text);
      if (/matches no streams/i.test(text) || (!input.hasAudio && (input.hasVideo || input.durationSec > 0))) {
        return { ok: false, error: 'no_audio', detail: 'the source has no sound stream' };
      }
      const last = text.trim().split('\n').filter(Boolean).pop() ?? 'ffmpeg failed';
      return { ok: false, error: 'extract_failed', detail: last.slice(0, 160) };
    }
    const input = parseProbeBanner(stderr);
    const output = await probeMedia(out);
    const mp3 = await readFile(out);
    return { ok: true, mp3, input, output };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function liveAudioDeps(): AudioExecDeps {
  return {
    async resolveFile(ref, userId) {
      const r = await resolveCallerMedia(ref, userId, SOURCE_TTL_SEC);
      if (r.ok) return r.own ? { ok: true, url: r.url } : { ok: false, reason: 'not_yours' };
      return { ok: false, reason: r.reason === 'not_owner' ? 'not_yours' : 'unreadable' };
    },
    inspect: (url) => inspectLink(url),
    extract: (url, opts) => extractMp3(url, opts),
    upload: (jobId, mp3) => uploadBufferAndSign('renders', `audio/extract-${jobId}.mp3`, mp3, 'audio/mpeg', WEEK_SEC),
    resign: (url) => reSignIfInternal(url, WEEK_SEC),
    store: supabaseLeaseStore(() => createServiceRoleClient(), reportError),
    audit,
    key: quoteKey,
    now: () => Date.now(),
    newId: () => randomUUID(),
    every,
  };
}
