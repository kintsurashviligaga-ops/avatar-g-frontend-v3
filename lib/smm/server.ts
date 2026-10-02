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

  // ⚠️ A CLIENT-SENT FLAG MUST NEVER STAND IN FOR A SESSION IN PRODUCTION. `x-demo-mode: 1` / `?demo=1` turned any
  // anonymous request into the shared 'demo' owner, and every SMM route then wrote through the SERVICE-ROLE client on its
  // behalf. No screen sends the flag; it is honoured only outside production (local demos, tests).
  const demoHeader = request.headers.get('x-demo-mode');
  const demoQuery = request.nextUrl.searchParams.get('demo');
  const isDemo = process.env.NODE_ENV !== 'production' && (demoHeader === '1' || demoQuery === '1');

  if (isDemo) {
    return {
      ownerId: 'demo',
      isDemo: true,
      userId: null,
    };
  }

  return null;
}
