import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { escapeHtml, markdownToEmailHtml } from '@/lib/chat/emailHtml';

/**
 * POST /api/mail/send — VECTOR 5/7. Emails the requested chat content (a table / document / message) to the
 * signed-in user's account address via Resend's REST API (no SDK dependency).
 *
 * FAIL-OPEN by design: with no RESEND_API_KEY the route returns a friendly `{ ok:false, configured:false }`
 * (HTTP 200) so the client can toast "email not configured yet" and the build/typecheck stay green. The moment
 * the key is added to Vercel env it starts delivering — no code change needed.
 *
 * Body: { subject?, html?, text?, to? }. `to` defaults to the account email; a supplied address must be valid.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAIL_FROM = process.env.MAIL_FROM || 'MyAvatar <info@myavatar.ge>';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Wrap the message content in a branded, email-client-safe HTML shell. */
function brandedEmail(subject: string, contentHtml: string): string {
  return (
    '<!doctype html><html><body style="margin:0;background:#f4f4f5;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Noto Sans Georgian,sans-serif;color:#111">' +
    '<div style="max-width:640px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e4e4e7">' +
    '<div style="background:linear-gradient(135deg,#06b6d4,#0891b2);padding:18px 24px;color:#fff">' +
    '<div style="font-size:18px;font-weight:800;letter-spacing:-0.02em">MyAvatar</div>' +
    '<div style="font-size:12px;opacity:0.9">Agent G · myavatar.ge</div></div>' +
    '<div style="padding:24px 26px;line-height:1.6;font-size:14px">' +
    `<h2 style="margin:0 0 14px;font-size:16px">${escapeHtml(subject)}</h2>` +
    contentHtml +
    '</div>' +
    '<div style="padding:14px 26px;border-top:1px solid #e4e4e7;color:#71717a;font-size:11px">You received this because you asked Agent G to email it to you · myavatar.ge</div>' +
    '</div></body></html>'
  );
}

export async function POST(req: NextRequest) {
  try {
    const limited = await checkRateLimit(req, RATE_LIMITS.WRITE);
    if (limited) return limited;

    const { user } = await authedClientFromRequest(req);
    if (!user?.email) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as { subject?: string; html?: string; text?: string; to?: string } | null;
    const to = typeof body?.to === 'string' && EMAIL_RE.test(body.to.trim()) ? body.to.trim() : user.email;
    const subject = (typeof body?.subject === 'string' && body.subject.trim() ? body.subject.trim() : 'MyAvatar — Agent G').slice(0, 200);

    const contentHtml = typeof body?.html === 'string' && body.html.trim()
      ? body.html
      : typeof body?.text === 'string' && body.text.trim()
        ? markdownToEmailHtml(body.text)
        : '';
    if (!contentHtml) {
      return NextResponse.json({ ok: false, error: 'no_content' }, { status: 400 });
    }

    const html = brandedEmail(subject, contentHtml);
    const apiKey = process.env.RESEND_API_KEY;

    // FAIL-OPEN: no provider key yet → friendly no-op the UI can surface as a soft toast.
    if (!apiKey) {
      return NextResponse.json({ ok: false, configured: false, to, message: 'Email delivery is not configured yet — add RESEND_API_KEY to enable it.' });
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: MAIL_FROM, to: [to], subject, html }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      // eslint-disable-next-line no-console
      console.error('[mail/send] resend', res.status, detail.slice(0, 200));
      return NextResponse.json({ ok: false, error: 'send_failed' }, { status: 502 });
    }
    const j = (await res.json().catch(() => ({}))) as { id?: string };
    return NextResponse.json({ ok: true, to, id: j.id ?? null });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[POST /api/mail/send]', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: 'mail_error' }, { status: 500 });
  }
}
