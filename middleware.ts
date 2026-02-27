import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * Root middleware: refreshes Supabase auth cookies on every request.
 * Next.js only recognises middleware.ts at the project root (not inside app/).
 */
export async function middleware(request: NextRequest) {
  const { response } = await updateSession(request);
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static assets)
     * - _next/image  (image optimisation)
     * - favicon.ico, brand/, placeholders/ (public assets)
     * - api/webhooks (Stripe webhooks must not have cookies tampered with)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|brand/|placeholders/|api/webhooks).*)',
  ],
};
