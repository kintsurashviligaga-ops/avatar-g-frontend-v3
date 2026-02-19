/**
 * GET /api/affiliate/me
 * Returns current user's affiliate profile
 * Optional: ?create=true to auto-create affiliate profile
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createServerClient } from '@/lib/supabase/server';

const MAX_CODE_ATTEMPTS = 5;

function generateAffiliateCode(): string {
  const seed = randomBytes(6).toString('hex');
  return parseInt(seed, 16).toString(36).toUpperCase().slice(0, 8);
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const createIfMissing = (request.nextUrl.searchParams?.get?.('create') ?? '') === 'true';

    const { data: existing } = await supabase
      .from('affiliates')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!existing && !createIfMissing) {
      return NextResponse.json({
        hasAffiliate: false,
        affiliate: null,
      });
    }

    let affiliate = existing;

    if (!affiliate && createIfMissing) {
      let created = null;
      for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
        const candidate = generateAffiliateCode();
        const { data: codeMatch } = await supabase
          .from('affiliates')
          .select('id')
          .eq('affiliate_code', candidate)
          .single();

        if (!codeMatch) {
          const { data: inserted, error: insertError } = await supabase
            .from('affiliates')
            .insert({
              user_id: user.id,
              affiliate_code: candidate,
            })
            .select()
            .single();

          if (insertError) {
            console.error('[Affiliate] Failed to create affiliate:', insertError);
            break;
          }

          created = inserted;
          break;
        }
      }

      if (!created) {
        return NextResponse.json({ error: 'Failed to create affiliate' }, { status: 500 });
      }

      affiliate = created;
    }

    const affiliateId = affiliate?.id;

    const { count: clicksCount } = await supabase
      .from('affiliate_clicks')
      .select('id', { count: 'exact', head: true })
      .eq('affiliate_id', affiliateId);

    const { count: signupsCount } = await supabase
      .from('affiliate_referrals')
      .select('id', { count: 'exact', head: true })
      .eq('affiliate_id', affiliateId);

    return NextResponse.json({
      hasAffiliate: true,
      affiliate: {
        ...affiliate,
        total_clicks: clicksCount || 0,
        total_signups: signupsCount || 0,
      },
    });
  } catch (error) {
    console.error('[Affiliate] Error fetching profile:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch affiliate profile' },
      { status: 500 }
    );
  }
}

export async function POST() {
  return NextResponse.json({ error: 'Method not allowed. Use GET.' }, { status: 405 });
}
