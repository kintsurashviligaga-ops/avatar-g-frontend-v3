/**
 * POST /api/agent-g/whatsapp/send — an OPERATOR's outbound WhatsApp message: a text, or an approved template.
 *
 *   { to: "995571333194", text: "…" }                                          free-form (inside the 24 h window only)
 *   { to: "995571333194", template: { name: "hello_world", language: "en_US" } } a template — Meta's own first test
 *   { …, template: { name, language, params: ["…", "…"] } }                     a template whose body has {{1}}, {{2}}…
 *
 * Sent through the same Cloud API client as Agent G (lib/agent-g/channels/whatsapp-client: Graph v25.0 by default,
 * WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID). The answer carries Meta's status, error code and message ids — never
 * the token.
 */
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { adminKeyHeaderMatches } from '@/lib/security/opsAccess';
import { isAdmin } from '@/lib/auth/adminGuard';
import { sendWhatsAppTemplate, sendWhatsAppText, whatsappConfig } from '@/lib/agent-g/channels/whatsapp-client';
import { maskNumber } from '@/lib/agent-g/channels/whatsapp-text';

export const dynamic = 'force-dynamic';

const to = z.string().trim().transform((v) => v.replace(/\D/g, '')).pipe(z.string().min(8).max(15));
const schema = z.union([
  z.object({ to, text: z.string().min(1).max(4000), user_id: z.string().uuid().optional() }).strict(),
  z.object({
    to,
    template: z.object({
      name: z.string().regex(/^[a-z0-9_]{1,512}$/),
      language: z.string().regex(/^[a-z]{2,3}(_[A-Z]{2})?$/).default('en_US'),
      params: z.array(z.string().min(1).max(1024)).max(10).default([]),
    }).strict(),
    user_id: z.string().uuid().optional(),
  }).strict(),
]);

export async function POST(request: NextRequest) {
  // ⚠️ ADMIN ONLY. This sent a WhatsApp message FROM OUR BUSINESS NUMBER to any phone number, with any text, for anyone
  // who POSTed — no session, no key, no limit (spam/phishing under our name, billed conversations, a banned number) —
  // and wrote a service-role row on top. Only an operator may send: the x-admin-key header or an admin session.
  if (!adminKeyHeaderMatches(request) && !(await isAdmin().catch(() => false))) {
    return apiError(new Error('Unauthorized'), 401, 'Admin access required');
  }
  try {
    const payload = schema.safeParse(await request.json());
    if (!payload.success) return apiError(payload.error, 400, 'Invalid WhatsApp send payload');

    const cfg = whatsappConfig();
    if (!cfg) return apiError(new Error('not configured'), 503, 'WhatsApp is not configured (WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID)');

    const res = 'template' in payload.data
      ? await sendWhatsAppTemplate(payload.data.to, payload.data.template, payload.data.template.params, cfg)
      : await sendWhatsAppText(payload.data.to, payload.data.text, cfg);

    try {
      await createServiceRoleClient().from('agent_g_channel_events').insert({
        user_id: payload.data.user_id ?? null,
        type: 'whatsapp_event',
        payload: {
          direction: 'outgoing',
          to: maskNumber(payload.data.to),
          kind: 'template' in payload.data ? `template:${payload.data.template.name}` : 'text',
          ok: res.ok,
          status: res.status,
          error_code: res.errorCode,
        },
      });
    } catch { /* the log is a nicety; the send already happened */ }

    return apiSuccess(
      { ok: res.ok, status: res.status, error_code: res.errorCode, message_ids: res.messageIds, graph_version: cfg.graphVersion },
      res.ok ? 200 : 502,
    );
  } catch (error) {
    return apiError(error, 500, 'WhatsApp send failed');
  }
}
