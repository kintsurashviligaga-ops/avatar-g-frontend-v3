/**
 * lib/agent/media/analyzeClient.ts — the studio's calls for Agent G's whole-file analysis (/api/agent/media/analyze):
 * whether it is open to this user, and one analysis of the user's own uploaded file or a public YouTube link. Browser
 * side, fetch injected. Nothing is charged to the user, queued or stored; the route's own daily ceiling bounds it.
 */
import { postJson, readJson, routeEnabled, type Fetch } from './jobFollow';
import type { AnalyzeFocus, AnalyzeKind, MediaAnalysis } from './analyzeSpec';
import type { AnalyzeAnswer } from './analyzeChat';

export const ANALYZE_ROUTE = '/api/agent/media/analyze';

/** Is the analysis open to this user? A closed or unreachable route is simply "no": the chat keeps its old answer. */
export function analyzeEnabled(f: Fetch): Promise<boolean> {
  return routeEnabled(f, ANALYZE_ROUTE);
}

export type AnalyzeCall = { source: { kind: 'file'; ref: string } | { kind: 'youtube'; url: string }; focus: AnalyzeFocus; question: string; lang: string };

/** One analysis. The route's error code when it refused (a closed route reads as 'closed'). */
export async function runAnalyze(f: Fetch, input: AnalyzeCall): Promise<{ ok: true; answer: AnalyzeAnswer } | { ok: false; code: string }> {
  try {
    const res = await postJson(f, ANALYZE_ROUTE, { source: input.source, focus: input.focus, question: input.question.slice(0, 500), lang: input.lang });
    const body = await readJson(res);
    if (res.ok && body?.ok === true && body.analysis && typeof body.analysis === 'object') {
      const src = (body.source ?? {}) as { type?: AnalyzeKind; durationSec?: number | null };
      return { ok: true, answer: { analysis: body.analysis as MediaAnalysis, type: src.type ?? 'video', durationSec: typeof src.durationSec === 'number' ? src.durationSec : null } };
    }
    if (res.status === 401) return { ok: false, code: 'unauthenticated' };
    if (res.status === 404) return { ok: false, code: 'closed' };
    const code = typeof body?.error === 'string' ? body.error : res.status === 429 ? 'rate_limited' : 'network';
    return { ok: false, code };
  } catch {
    return { ok: false, code: 'network' };
  }
}
