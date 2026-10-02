/**
 * lib/research/liveContext.ts — put a finished research report INTO a Gemini Live call, server-side.
 *
 * ⚠️ THE SERVER OWNS THE LIVE SESSION SETUP (app/api/voice/live: the system instruction is locked into the ephemeral token), so
 * the browser never sends report TEXT — it sends a report id, and this module loads that report for the SIGNED-IN OWNER and
 * builds the block that is appended to the instruction. A prompt injected by a client is impossible by construction, and
 * somebody else's report is simply "unavailable".
 *
 * ⚠️ THE ENGINE'S LIMIT. A native-audio Live session holds its whole instruction in the context window (and a long system
 * instruction is part of what Google must accept inside the token's lock). The report is therefore squeezed to
 * LIVE_REPORT_CONTEXT_CHARS (≈ 6k tokens of English; every section kept, each shortened — lib/research/report.buildReportContext)
 * and the model is told when it holds shortened sections, so it says "that detail is not in the part I have" instead of
 * inventing it. UNVERIFIED LIVE: that Google accepts a ~24k-character system instruction inside `bidiGenerateContentSetup` for
 * the ephemeral lock — the route's existing fallback chain (lock → legacy lock → {model}-only) applies if it does not, and
 * the setup frame the browser sends is always the one the token was minted for (it still carries the report).
 *
 * The block is spoken-call oriented: no tables or URLs read aloud, the three quick commands (summarize / key takeaways /
 * read it to me) and the rule that the report is untrusted data.
 */
import { buildReportContext, wrapReportForModel } from './report';
import { isJobId } from './request';
import type { ResearchLocale } from './types';

export const LIVE_REPORT_CONTEXT_CHARS = 24_000;

const LANGUAGE: Record<ResearchLocale, string> = { ka: 'Georgian', en: 'English', ru: 'Russian' };

/** The instruction block for a call about `report`. */
export function liveReportBlock(opts: { report: string; title?: string | null; locale: ResearchLocale }): string {
  const ctx = buildReportContext(opts.report, { title: opts.title, maxChars: LIVE_REPORT_CONTEXT_CHARS });
  return [
    'REPORT CALL: the person on this call is reading a research report and wants to talk about it instead of reading it. The report is below.',
    '- Answer from the report only. If it does not cover the question, say so in one sentence — never guess and never use outside knowledge for facts about this report.',
    '- If the person asks to "summarize" (შეაჯამე, суммируй): give a spoken summary of four to six sentences.',
    '- If they ask for the "key takeaways" or "main point" (ამოიღე მთავარი არსი, главное): say the four to six most important points, one at a time, most important first.',
    '- If they ask you to "read it to me" (წამიკითხე, прочитай): read the executive summary and then name the sections; ask which one to go deeper into. Do not read tables or web addresses aloud — describe what they show.',
    '- Say numbers, names and dates exactly as the report gives them. Keep answers short enough to listen to; offer to continue rather than talking for minutes.',
    `- Start in ${LANGUAGE[opts.locale]} unless the person speaks another language.`,
    wrapReportForModel(ctx, { title: opts.title }),
  ].join('\n');
}

export interface LiveReportDeps {
  /** The caller's own completed job, or null (not theirs / not finished / not found). */
  getReport(userId: string, id: string): Promise<{ report: string; title: string | null } | null>;
}

/**
 * The block for `researchId`, or null when it cannot be used (malformed id, not the caller's, not finished, store down).
 * A null is the route's cue to refuse the call with `report_unavailable` rather than open one that does not know the report.
 */
export async function loadLiveReportBlock(userId: string, researchId: unknown, locale: ResearchLocale, deps: LiveReportDeps): Promise<string | null> {
  if (!isJobId(researchId)) return null;
  try {
    const r = await deps.getReport(userId, researchId);
    if (!r || !r.report.trim()) return null;
    return liveReportBlock({ report: r.report, title: r.title, locale });
  } catch {
    return null;
  }
}
