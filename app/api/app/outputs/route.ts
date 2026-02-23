import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';

export const dynamic = 'force-dynamic';

type ServiceOutputRow = {
  storage_path: string | null;
  [key: string]: unknown;
};

export async function GET(request: NextRequest) {
  const rateLimitError = await checkRateLimit(request, RATE_LIMITS.READ);
  if (rateLimitError) return rateLimitError;

  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('service_outputs')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(120);

  if (error) {
    return NextResponse.json({ error: 'Failed to load outputs' }, { status: 500 });
  }

  const outputsWithUrl = await Promise.all(
    (data ?? []).map(async (output: ServiceOutputRow) => {
      if (!output.storage_path) {
        return output;
      }

      const { data: signed } = await supabase.storage
        .from('avatar-g-outputs')
        .createSignedUrl(output.storage_path, 60 * 15);

      return {
        ...output,
        signed_url: signed?.signedUrl ?? null,
      };
    })
  );

  return NextResponse.json({ outputs: outputsWithUrl });
}