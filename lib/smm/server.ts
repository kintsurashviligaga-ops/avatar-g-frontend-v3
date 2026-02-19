import type { NextRequest } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase/auth';

export type SmmOwnerContext = {
  ownerId: string;
  isDemo: boolean;
  userId: string | null;
};

export async function resolveSmmOwnerContext(request: NextRequest): Promise<SmmOwnerContext | null> {
  const user = await getAuthenticatedUser(request);
  if (user?.id) {
    return {
      ownerId: user.id,
      isDemo: false,
      userId: user.id,
    };
  }

  const demoHeader = request.headers.get('x-demo-mode');
  const demoQuery = request.nextUrl.searchParams.get('demo');
  const isDemo = demoHeader === '1' || demoQuery === '1';

  if (isDemo) {
    return {
      ownerId: 'demo',
      isDemo: true,
      userId: null,
    };
  }

  return null;
}
