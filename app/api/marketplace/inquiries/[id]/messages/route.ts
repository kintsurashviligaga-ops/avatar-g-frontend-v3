import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import type { MarketplaceMessage } from '@/lib/marketplace/types';

export const dynamic = 'force-dynamic';

const messageSchema = z.object({ body: z.string().min(1).max(2000) });

async function ensureParticipant(userId: string, inquiryId: string) {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('marketplace_inquiries')
    .select('id,buyer_id,seller_id')
    .eq('id', inquiryId)
    .maybeSingle();

  if (error || !data) return { ok: false };
  return { ok: data.buyer_id === userId || data.seller_id === userId };
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiError(new Error('Unauthorized'), 401, 'Login required');

    const participant = await ensureParticipant(user.id, params.id);
    if (!participant.ok) return apiError(new Error('Forbidden'), 403, 'Access denied');

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('marketplace_messages')
      .select('*')
      .eq('inquiry_id', params.id)
      .order('created_at', { ascending: true });

    if (error) return apiError(error, 500, 'Failed to load messages');
    return apiSuccess({ messages: (data ?? []) as MarketplaceMessage[] });
  } catch (error) {
    return apiError(error, 500, 'Failed to load messages');
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiError(new Error('Unauthorized'), 401, 'Login required');

    const participant = await ensureParticipant(user.id, params.id);
    if (!participant.ok) return apiError(new Error('Forbidden'), 403, 'Access denied');

    const payload = messageSchema.safeParse(await request.json());
    if (!payload.success) return apiError(payload.error, 400, 'Invalid message payload');

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('marketplace_messages')
      .insert({ inquiry_id: params.id, sender_id: user.id, body: payload.data.body })
      .select('*')
      .single();

    if (error || !data) return apiError(error ?? new Error('Insert failed'), 500, 'Failed to send message');
    return apiSuccess({ message: data as MarketplaceMessage }, 201);
  } catch (error) {
    return apiError(error, 500, 'Failed to send message');
  }
}
