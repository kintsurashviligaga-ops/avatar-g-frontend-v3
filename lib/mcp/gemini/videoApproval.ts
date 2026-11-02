import 'server-only';

import { createHash, randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createServiceRoleClient } from '../../supabase/server';
import { getCreditCost } from '../../billing/plans';
import { POST as generateVideo } from '../../../app/api/video/generate/route';

type Principal = { userId: string; clientId: string; token: string; scopes: string[] };
type Result = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
const ok = (x: unknown): Result => ({ content: [{ type: 'text', text: JSON.stringify(x) }] });
const fail = (error: string, message: string): Result => ({ ...ok({ error, message }), isError: true });

const videoSchema = z.object({
  kind: z.literal('video'),
  script: z.string().trim().min(3).max(2000),
  avatarId: z.string().uuid(),
  aspectRatio: z.enum(['9:16', '16:9', '1:1']).default('9:16'),
  approvalId: z.string().uuid().optional(),
});

/** Canonicalize to prevent approval for one set of arguments authorizing another. */
export function videoRequestHash(value: { kind: 'video'; script: string; avatarId: string; aspectRatio: string }): string {
  return createHash('sha256').update(JSON.stringify([value.kind, value.script, value.avatarId, value.aspectRatio])).digest('hex');
}

/**
 * A first call creates a pending request; a separate, authenticated first-party
 * browser must approve it. A second MCP call atomically consumes that approval.
 * The user's model-controlled arguments alone cannot grant approval.
 */
export async function requestOrExecuteVideo(raw: Record<string, unknown>, principal: Principal): Promise<Result> {
  if (process.env.MCP_VIDEO_GENERATION_ENABLED !== 'true') {
    return fail('generation_unavailable', 'Video generation via MCP is not enabled. No task was created.');
  }
  if (!principal.scopes.includes('mcp:write') || !principal.clientId) return fail('insufficient_scope', 'The connected client lacks write access.');
  const parsed = videoSchema.safeParse(raw);
  if (!parsed.success) return fail('invalid_arguments', 'Video requires a valid avatar ID, script, and aspect ratio.');
  const { approvalId, ...request } = parsed.data;
  const requestHash = videoRequestHash(request);
  const credits = getCreditCost('video-studio.generate', 20);
  try {
    const db = createServiceRoleClient();
    if (!approvalId) {
      const id = randomUUID();
      const { error } = await db.from('mcp_generation_approvals').insert({
        id, user_id: principal.userId, client_id: principal.clientId,
        request, request_hash: requestHash, quoted_credits: credits,
      });
      if (error) return fail('approval_unavailable', 'Approval could not be created. No task was created.');
      return ok({ status: 'approval_required', approvalId: id, approvalUrl: `https://myavatar.ge/api/mcp/consent?id=${id}`, quotedCredits: credits, expiresInSeconds: 600 });
    }

    // One UPDATE is the synchronization point across serverless instances. Only
    // the exact owner, OAuth client, arguments and still-current quote may claim.
    const now = new Date().toISOString();
    const { data, error } = await db.from('mcp_generation_approvals')
      .update({ state: 'consumed', consumed_at: now })
      .eq('id', approvalId).eq('user_id', principal.userId).eq('client_id', principal.clientId)
      .eq('request_hash', requestHash).eq('quoted_credits', credits).eq('state', 'approved')
      .gt('expires_at', now).select('id').maybeSingle();
    if (error || !data) return fail('approval_invalid', 'Approval is missing, expired, already used, or does not match this request.');

    // No automatic retries: existing paid endpoint is not an atomic queue+charge
    // transaction, so an interrupted result can be ambiguous. This is disabled
    // by default until billing and the live delegated-token path are verified.
    const req = new NextRequest('https://myavatar.ge/api/video/generate', {
      method: 'POST', headers: { authorization: `Bearer ${principal.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ avatar_id: request.avatarId, prompt: request.script, aspect_ratio: request.aspectRatio }),
    });
    const response = await generateVideo(req);
    if (!response.ok) return fail('execution_uncertain', 'The approved request did not complete normally. Check your works and credit balance before starting a new approval.');
    const body = await response.json() as { data?: { job?: { id?: unknown }; video?: { id?: unknown } } };
    return ok({ status: 'queued', jobId: body.data?.job?.id ?? null, videoId: body.data?.video?.id ?? null });
  } catch {
    return fail('execution_uncertain', 'The request could not be completed. If you approved it, check your works and credit balance before creating another.');
  }
}
