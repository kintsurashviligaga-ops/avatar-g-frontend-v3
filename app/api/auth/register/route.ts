import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/register — RETIRED. Always 410.
 *
 * WHAT IT USED TO DO: create the account with the service-role admin API as
 * `createUser({ email_confirm: true })` — i.e. pre-confirmed — and let the browser sign straight in. That
 * was a deliberate workaround for a project whose mailer didn't deliver, but it meant an email address was
 * NEVER proved to belong to the person typing it: anyone could register any address, including one they do
 * not control, and receive a fully verified account.
 *
 * WHY IT IS GONE RATHER THAN FIXED: leaving the handler in place would leave the bypass reachable. It is a
 * plain unauthenticated POST — the new client flow simply not calling it would not stop anyone else from
 * doing so, and any confirmed-account-on-demand endpoint defeats the verification gate that replaced it.
 *
 * THE REPLACEMENT: `supabase.auth.signUp()` → Supabase mails a 6-digit code → `verifyOtp({ type: 'signup' })`
 * (components/chat/AuthModal.tsx). The account is created UNCONFIRMED with no session, and only a correct
 * code produces one, so an unverified sign-up can never reach the product.
 *
 * OPERATIONAL PREREQUISITE: this moves sign-up onto Supabase's mailer. The project's SMTP must actually
 * deliver, and the "Confirm signup" template must include the `{{ .Token }}` variable (a link-only template
 * mails no code and users would have nothing to type). Both are dashboard settings, not code.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  // Still rate-limited: the endpoint is retired, not a free thing to hammer.
  const limited = await checkRateLimit(req, RATE_LIMITS.AUTH);
  if (limited) return limited;

  return NextResponse.json(
    {
      ok: false,
      code: 'deprecated',
      message: 'Auto-confirmed registration has been retired. Sign up with supabase.auth.signUp() and verify the emailed code.',
    },
    { status: 410 },
  );
}
