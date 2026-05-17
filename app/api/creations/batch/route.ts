/**
 * POST /api/creations/batch
 * Generates N variations of the same image prompt in parallel.
 * Returns array of { url, creationId } items.
 *
 * Body: { prompt: string, count?: 2|4, quality?: string, ratio?: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

const schema = z.object({
  prompt: z.string().min(1).max(2000),
  count: z.union([z.literal(2), z.literal(4)]).default(4),
  quality: z.string().default('standard'),
  ratio: z.string().default('1:1'),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 });
    }

    const { prompt, count, quality, ratio } = parsed.data;
    const CREDITS_PER_IMAGE = 10;
    const totalCost = CREDITS_PER_IMAGE * count;

    const supabase = createServiceRoleClient();
    const origin = request.nextUrl.origin;
    const authHeader = request.headers.get('authorization') ?? undefined;

    // Fire N parallel image generations
    const tasks = Array.from({ length: count }, (_, i) =>
      fetch(`${origin}/api/replicate/image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader ? { authorization: authHeader } : {}),
        },
        body: JSON.stringify({
          prompt,
          quality,
          aspectRatio: ratio,
          // Seed variation: append variation index to prompt for diversity
          seed: Math.floor(Math.random() * 99999) + i * 13337,
        }),
        signal: AbortSignal.timeout(90_000),
      }).then(async (r) => {
        if (!r.ok) return null;
        const d = await r.json() as { url?: string; imageUrl?: string; output?: string[]; data?: { url?: string } };
        return d?.url || d?.imageUrl || d?.output?.[0] || d?.data?.url || null;
      }).catch(() => null)
    );

    const urls = await Promise.all(tasks);
    const successUrls = urls.filter((u): u is string => typeof u === 'string' && u.length > 0);

    if (successUrls.length === 0) {
      return NextResponse.json({ error: 'All image generations failed' }, { status: 502 });
    }

    // Save each successful generation to user_creations
    const creationInserts = successUrls.map((url, idx) => ({
      user_id: user.id,
      kind: 'image',
      service: 'image',
      title: `${prompt.slice(0, 60)}… (${idx + 1}/${successUrls.length})`,
      prompt,
      url,
      thumbnail_url: url,
      credits_used: CREDITS_PER_IMAGE,
      is_public: false,
    }));

    const { data: insertedRows, error: insertError } = await supabase
      .from('user_creations')
      .insert(creationInserts)
      .select('id, url, thumbnail_url, share_token');

    if (insertError) {
      console.error('[batch] insert error', insertError);
    }

    const results = (insertedRows ?? []).map((row: { id: string; url: string; thumbnail_url: string; share_token: string }) => ({
      creationId: row.id,
      url: row.url,
      thumbnailUrl: row.thumbnail_url,
      shareToken: row.share_token,
    }));

    // Fallback if DB insert failed — return raw URLs
    if (results.length === 0) {
      return NextResponse.json({
        results: successUrls.map((url) => ({ creationId: null, url, thumbnailUrl: url, shareToken: null })),
        generated: successUrls.length,
        requested: count,
        creditsUsed: successUrls.length * CREDITS_PER_IMAGE,
        totalCost,
      });
    }

    return NextResponse.json({
      results,
      generated: successUrls.length,
      requested: count,
      creditsUsed: successUrls.length * CREDITS_PER_IMAGE,
      totalCost,
    });
  } catch (err) {
    console.error('[batch] unexpected error', err);
    return NextResponse.json({ error: 'Batch generation failed' }, { status: 503 });
  }
}
