/**
 * /api/agent-g/whatsapp/link — the signed-in user's WhatsApp link with Agent G (the card in Settings).
 *
 *   GET     what the card shows: is WhatsApp set up on this deployment, is the user's number linked (masked), alerts on?
 *   POST    a one-time code (15 min) + the wa.me link that opens WhatsApp with "connect CODE" already typed
 *   PATCH   { alerts: boolean } — WhatsApp alerts on/off (replies keep working)
 *   DELETE  unlink the number
 *
 * ⚠️ THE NUMBER NEVER COMES FROM HERE. This route only mints a code; the number is bound when that code arrives FROM
 * WhatsApp (the Meta-signed webhook → handleInbound → consumeConnectCode). See lib/agent-g/channels/whatsapp-link.ts.
 */
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { checkRateLimitByKey } from '@/lib/api/rate-limit';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { businessNumber, whatsappConfig } from '@/lib/agent-g/channels/whatsapp-client';
import { createConnectCode, findLinkByUser, patchLinkMeta, unlink } from '@/lib/agent-g/channels/whatsapp-link';
import { maskNumber } from '@/lib/agent-g/channels/whatsapp-text';

export const dynamic = 'force-dynamic';

/** Inbound needs the app secret (signatures) and the verify token (webhook registration); sending needs the token. */
function inboundReady(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(whatsappConfig(env) && (env.WHATSAPP_APP_SECRET ?? '').trim() && (env.WHATSAPP_VERIFY_TOKEN ?? '').trim());
}

export async function GET(request: NextRequest) {
  const configured = inboundReady();
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user) return apiSuccess({ guest: true, configured, available: configured, linked: null });

  const lookup = await findLinkByUser(createServiceRoleClient(), user.id);
  const linked =
    lookup.state === 'linked'
      ? {
          number: maskNumber(lookup.link.waId),
          linked_at: lookup.link.meta.linked_at ?? null,
          alerts: lookup.link.meta.alerts !== false,
        }
      : null;
  return apiSuccess({ guest: false, configured, available: configured && lookup.state !== 'unavailable', linked });
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user) return apiError(new Error('Unauthorized'), 401, 'Login required');
  if (!inboundReady()) return apiError(new Error('WhatsApp not configured'), 503, 'WhatsApp is not available yet');

  const limited = await checkRateLimitByKey(user.id, { maxRequests: 5, windowMs: 10 * 60_000, keyPrefix: 'wa:code' });
  if (limited) return limited;

  const minted = await createConnectCode(createServiceRoleClient(), user.id);
  if (minted === 'unavailable') return apiError(new Error('WhatsApp tables missing'), 503, 'WhatsApp is not available yet');

  const command = `connect ${minted.code}`;
  const number = await businessNumber();
  return apiSuccess(
    {
      code: minted.code,
      command,
      expires_at: minted.expiresAt,
      wa_link: number ? `https://wa.me/${number}?text=${encodeURIComponent(command)}` : null,
    },
    201,
  );
}

const patchSchema = z.object({ alerts: z.boolean() }).strict();

export async function PATCH(request: NextRequest) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user) return apiError(new Error('Unauthorized'), 401, 'Login required');
  const body = patchSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return apiError(body.error, 400, 'Invalid request');

  const sb = createServiceRoleClient();
  const lookup = await findLinkByUser(sb, user.id);
  if (lookup.state !== 'linked') return apiError(new Error('Not linked'), 404, 'WhatsApp is not linked');
  if (!(await patchLinkMeta(sb, lookup.link, { alerts: body.data.alerts }))) {
    return apiError(new Error('Update failed'), 500, 'Could not save');
  }
  return apiSuccess({ alerts: body.data.alerts });
}

export async function DELETE(request: NextRequest) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user) return apiError(new Error('Unauthorized'), 401, 'Login required');

  const sb = createServiceRoleClient();
  const lookup = await findLinkByUser(sb, user.id);
  if (lookup.state === 'unlinked') return apiSuccess({ unlinked: true });
  if (lookup.state === 'unavailable' || !(await unlink(sb, lookup.link.id))) {
    return apiError(new Error('Unlink failed'), 503, 'Could not unlink right now');
  }
  return apiSuccess({ unlinked: true });
}
