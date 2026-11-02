import 'server-only';

import { createHash, randomUUID } from 'crypto';
import { z } from 'zod';
import { createServiceRoleClient } from '../../supabase/server';
import { quoteMusic, startMusic, workMusic } from '../../music/studio/engine';
import { liveMusicDeps } from '../../music/studio/live';
import { musicStudioEnabled } from '../../music/studio/capabilities';
import { CLIP_MODEL } from '../../music/studio/capabilities';
import { serviceOffResponse } from '../../server/serviceSwitches';
import { paidWritesBlockedOnPreview } from '../../env/previewIsolation';
import { runAfterResponse } from '../../platform/afterResponse';
import { newWorkerId } from '../../agent/media/montageLive';

type Principal = { userId: string; clientId: string; scopes: string[] };
type Result = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
const ok = (x: unknown): Result => ({ content: [{ type: 'text', text: JSON.stringify(x) }] });
const fail = (error: string, message: string): Result => ({ ...ok({ error, message }), isError: true });
const audioSchema = z.object({
  kind: z.literal('audio'), script: z.string().trim().min(3).max(2000),
  approvalId: z.string().uuid().optional(),
});
function fingerprint(value: { kind: 'audio'; script: string }): string {
  return createHash('sha256').update(JSON.stringify([value.kind, value.script, CLIP_MODEL, 30, 'instrumental'])).digest('hex');
}

/** One explicit first-party approval is required for exactly one audio request.
 * The quoted job, price, and plan are stored only on the service-role table;
 * a client-supplied `confirmed` or price cannot authorize a charge. */
export async function requestOrExecuteAudio(raw: Record<string, unknown>, principal: Principal): Promise<Result> {
  if (process.env.MCP_AUDIO_GENERATION_ENABLED !== 'true' || !musicStudioEnabled() || paidWritesBlockedOnPreview()) {
    return fail('generation_unavailable', 'Audio generation via MCP is unavailable. No task was created.');
  }
  if (!principal.scopes.includes('mcp:write') || !principal.clientId) return fail('insufficient_scope', 'The connected client lacks write access.');
  const parsed = audioSchema.safeParse(raw);
  if (!parsed.success) return fail('invalid_arguments', 'Audio requires a valid prompt.');
  const { approvalId, ...request } = parsed.data;
  try {
    if (await serviceOffResponse('music')) return fail('generation_unavailable', 'Music generation is switched off. No task was created.');
    const db = createServiceRoleClient();
    const deps = liveMusicDeps();
    if (!approvalId) {
      // An instrumental clip is the only default: vocals/models are never inferred.
      const quote = await quoteMusic(deps, principal.userId, {
        v: 1, prompt: request.script, mode: 'instrumental', modelId: CLIP_MODEL, durationSec: 30, locale: 'ka',
      });
      const id = randomUUID();
      const expiresAt = new Date(Math.min(quote.expiresAt, Date.now() + 600_000)).toISOString();
      const { error } = await db.from('mcp_generation_approvals').insert({
        id, user_id: principal.userId, client_id: principal.clientId,
        request: { ...request, model: CLIP_MODEL, durationSec: 30, mode: 'instrumental', plan: quote.plan, quoteToken: quote.token },
        request_hash: fingerprint(request), quoted_credits: quote.credits, expires_at: expiresAt,
      });
      if (error) return fail('approval_unavailable', 'Approval could not be created. No task was created.');
      return ok({ status: 'approval_required', approvalId: id, approvalUrl: `https://myavatar.ge/api/mcp/consent?id=${id}`, quotedCredits: quote.credits, expiresAt });
    }
    const now = new Date().toISOString();
    const { data, error } = await db.from('mcp_generation_approvals')
      .update({ state: 'consumed', consumed_at: now })
      .eq('id', approvalId).eq('user_id', principal.userId).eq('client_id', principal.clientId)
      .eq('request_hash', fingerprint(request)).eq('state', 'approved')
      .gt('expires_at', now).select('request').maybeSingle();
    if (error || !data) return fail('approval_invalid', 'Approval is missing, expired, already used, or does not match this request.');
    const saved = data.request as Record<string, unknown>;
    // startMusic revalidates the signed quote, capability, current price, budget,
    // reservation and replay before making the durable job runnable.
    const view = await startMusic(deps, principal.userId, saved.plan, saved.quoteToken, true);
    if (view.status === 'queued') {
      const work = () => workMusic(deps, view.jobId, newWorkerId());
      if (!runAfterResponse(work, 'music-studio.mcp-work')) void work().catch(() => undefined);
    }
    return ok({ status: view.status, jobId: view.jobId });
  } catch {
    return fail('execution_uncertain', 'The request could not be completed. If you approved it, check your works and credit balance before starting another.');
  }
}
