/**
 * lib/agent/media/audioClient.ts — the studio's calls for Agent G's audio extraction (/api/agent/media/audio): ask for
 * the plan for a link (or for one attached file, uploaded first), run it on the user's Start, follow its progress
 * (./jobFollow, the same follower as the montage), stop it. Browser-side, every effect injected.
 */
import type { AudioQuote, AudioRights } from './audioExtract';
import { audioCodeOf, type AudioChatCode } from './audioChat';
import { cancelJob, postJson, readJson, routeEnabled, sendAndFollow, type Fetch, type FollowDeps, type JobViewBody } from './jobFollow';

const ROUTE = '/api/agent/media/audio';

export type AudioClientQuote =
  | { ok: true; quote: AudioQuote; request: unknown; token: string }
  | { ok: false; code: AudioChatCode; platform?: string };

/** Is Agent G's audio extraction open to this user? Closed or unreachable = "no": the chat keeps its old flow. */
export function audioEnabled(f: Fetch): Promise<boolean> {
  return routeEnabled(f, ROUTE);
}

async function askQuote(f: Fetch, body: Record<string, unknown>): Promise<AudioClientQuote> {
  try {
    const res = await postJson(f, ROUTE, { action: 'quote', ...body });
    const b = await readJson(res);
    if (res.ok && b?.ok === true) return { ok: true, quote: b.quote as AudioQuote, request: b.request, token: String(b.token) };
    const platform = typeof b?.platform === 'string' ? b.platform : undefined;
    return { ok: false, code: audioCodeOf(res.status, b), ...(platform ? { platform } : {}) };
  } catch {
    return { ok: false, code: 'network' };
  }
}

/** The plan for a link the user sent. Spends nothing. */
export function quoteAudioLink(f: Fetch, url: string): Promise<AudioClientQuote> {
  return askQuote(f, { url });
}

/** Upload the user's file to their own storage, then ask for its plan. Spends nothing. */
export async function quoteAudioFile(
  deps: { fetch: Fetch; upload: (dataUrl: string, mimeType: string) => Promise<string | null> },
  file: { dataUrl: string; mimeType: string; name?: string },
): Promise<AudioClientQuote> {
  const path = await deps.upload(file.dataUrl, file.mimeType).catch(() => null);
  if (!path) return { ok: false, code: 'upload_failed' };
  return askQuote(deps.fetch, { file: path, ...(file.name ? { name: file.name } : {}) });
}

export type AudioClientRun =
  | { ok: true; audioUrl: string; name: string; durationSec: number; bytes: number; bitrateKbps: number; rights: AudioRights | null }
  | { ok: false; code: AudioChatCode };

const done = (v: JobViewBody): AudioClientRun | null => {
  if (v.status === 'completed' && typeof v.audioUrl === 'string' && v.audioUrl) {
    return {
      ok: true,
      audioUrl: v.audioUrl,
      name: typeof v.name === 'string' && v.name ? v.name : 'audio.mp3',
      durationSec: Number(v.durationSec) || 0,
      bytes: Number(v.bytes) || 0,
      bitrateKbps: Number(v.bitrateKbps) || 0,
      rights: v.rights && typeof v.rights === 'object' ? (v.rights as AudioRights) : null,
    };
  }
  if (v.status === 'failed') return { ok: false, code: audioCodeOf(500, { error: v.error }) };
  return null;
};

/** Queue the plan the user confirmed, then follow the job to its end. Never starts a second job for the same plan. */
export function runAgentAudio(deps: FollowDeps, input: { request: unknown; token: string; jobId: string }): Promise<AudioClientRun> {
  return sendAndFollow<AudioClientRun>(deps, {
    route: ROUTE,
    runBody: { action: 'run', request: input.request, token: input.token },
    jobId: input.jobId,
    done,
    refused: (status, body) => ({ ok: false, code: audioCodeOf(status, body) }),
    lost: (why) => ({ ok: false, code: why }),
  });
}

/** Stop a running extraction. The run's own follow then reports it as cancelled. */
export function cancelAgentAudio(f: Fetch, jobId: string): Promise<boolean> {
  return cancelJob(f, ROUTE, jobId);
}
