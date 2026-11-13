/**
 * POST /api/chat/media/renew — fresh signed links for the media of a reopened chat (Phase 7.6 item 7).
 *
 * Body `{ urls: string[] }` (at most 40 are looked at). Answer `{ renewed: { [oldUrl]: newUrl } }`: only links of OUR
 * storage that the caller may read (lib/chat/mediaRenew → lib/security/callerMedia) are in it. Free: signing a link is
 * not a generation. Signed-in only. Behind CHAT_MEDIA_RENEW (server, off): off answers 404 `disabled`, and the client
 * stops asking for the rest of the session.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { applyApiGuards } from '@/lib/api/guard';
import { RATE_LIMITS, checkRateLimitByKey } from '@/lib/api/rate-limit';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { chatMediaRenewOn, renewChatMedia } from '@/lib/chat/mediaRenew';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 20;

const bodySchema = z.object({ urls: z.array(z.string().max(4000)).max(200) });
const noStore = { 'Cache-Control': 'no-store' };

export async function POST(req: NextRequest) {
  if (!chatMediaRenewOn()) return NextResponse.json({ error: 'disabled' }, { status: 404, headers: noStore });

  const gate = await applyApiGuards(req, { limit: RATE_LIMITS.READ, skipBudget: true, label: 'chat.media.renew' });
  if (gate.response) return gate.response;
  const userId = gate.auth?.userId ?? (await authedClientFromRequest(req)).user?.id ?? null;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const capped = await checkRateLimitByKey(userId, RATE_LIMITS.READ);
  if (capped) return capped;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input' }, { status: 400, headers: noStore });

  const renewed = await renewChatMedia(parsed.data.urls, userId);
  return NextResponse.json({ renewed }, { headers: noStore });
}
