import { reportError } from '@/lib/observability/report-error';

/**
 * Report a Gemini leg falling back to its backup engine.
 *
 * ⚠️ WHY THIS EXISTS. Veo, Imagen and Lyria each degrade GRACEFULLY — a failure returns null and the
 * caller quietly runs Runway / FLUX / MusicGen instead. That resilience is correct and worth keeping:
 * the user always gets something. But every one of those failures was logged with `console.warn` and
 * nothing else, so the degradation was invisible in practice.
 *
 * The cost of that showed up in production. Three consecutive calls to the chat surface all answered
 * from Anthropic — the Gemini route's last-resort fallback — meaning every Gemini call was failing,
 * and with it Veo, Imagen and Lyria were silently on their backups. The product looked healthy from
 * every angle: /api/health said valid, results kept arriving, no error reached anyone. The only
 * symptom was that the "primary" engines named in the UI were not the ones doing the work, at
 * different quality and different cost.
 *
 * A fallback is a NORMAL event, so this is deliberately not an exception path — nothing throws, nothing
 * changes behaviour. It just makes the event visible: Sentry is configured in production, so the next
 * failure arrives with its real HTTP status and the provider's own response body, which is the one
 * thing that says WHY. Without it, diagnosing this needed shell access to Vercel's logs.
 *
 * The body is truncated: a provider error can echo the prompt back, and an error report is not a place
 * to accumulate user content.
 */
export function reportGeminiFallback(args: {
  /** Which leg degraded — 'veo' | 'imagen' | 'lyria' | 'chat'. */
  leg: string;
  /** What it fell back TO, so the report says what the user actually got. */
  fallbackTo: string;
  /** HTTP status when the call completed; omit when it threw. */
  status?: number;
  /** The provider's own response body or the thrown message — the part that explains it. */
  detail?: string;
  /** Model id, so a model-access problem is distinguishable from an account-wide one. */
  model?: string;
}): void {
  const { leg, fallbackTo, status, detail, model } = args;
  const summary = status
    ? `[${leg}] http_${status} → falling back to ${fallbackTo}`
    : `[${leg}] threw → falling back to ${fallbackTo}`;
  // eslint-disable-next-line no-console
  console.warn(`${summary}${detail ? ` · ${detail.slice(0, 300)}` : ''}`);
  reportError(new Error(summary), {
    leg,
    fallbackTo,
    ...(status ? { status } : {}),
    ...(model ? { model } : {}),
    ...(detail ? { detail: detail.slice(0, 300) } : {}),
  });
}
