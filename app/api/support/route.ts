import { NextRequest, NextResponse } from 'next/server';
import { SUPPORT_EMAIL, validateSupportRequest, type SupportRequest } from '@/lib/support';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Support intake for the official corporate node (support@myavatar.ge).
 *
 * Provider-agnostic + fail-open delivery, in priority order:
 *   1. Resend (if RESEND_API_KEY set) → email support@myavatar.ge
 *   2. Supabase support_tickets table (best effort)
 *   3. structured server log (always)
 * The channel is never a dead end: the client also gets a mailto: fallback.
 */

async function sendViaResend(req: SupportRequest): Promise<boolean> {
  const key = (process.env.RESEND_API_KEY ?? '').trim();
  const from = (process.env.SUPPORT_FROM_EMAIL ?? '').trim();
  if (!key || !from) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [SUPPORT_EMAIL],
        reply_to: req.email,
        subject: req.subject ? `[Support] ${req.subject}` : '[Support] New request',
        text: `From: ${req.name ?? 'n/a'} <${req.email}>\nCategory: ${req.category ?? 'general'}\n\n${req.message}`,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function persistTicket(req: SupportRequest): Promise<boolean> {
  try {
    const admin = createServiceRoleClient();
    const { error } = await admin.from('support_tickets').insert({
      email: req.email,
      name: req.name ?? null,
      subject: req.subject ?? null,
      category: req.category ?? null,
      message: req.message,
      status: 'open',
    });
    return !error;
  } catch {
    return false; // table may not exist yet — fail open
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true, supportEmail: SUPPORT_EMAIL });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try { body = await req.json(); } catch { body = null; }

  const parsed = validateSupportRequest(body);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error, supportEmail: SUPPORT_EMAIL }, { status: 400 });
  }

  const emailed = await sendViaResend(parsed.value);
  const stored = emailed ? false : await persistTicket(parsed.value);
  const delivery = emailed ? 'emailed' : stored ? 'stored' : 'logged';
  if (delivery === 'logged') {
    console.warn('[support] request received (no provider/table) →', JSON.stringify({ email: parsed.value.email, subject: parsed.value.subject, category: parsed.value.category }));
  }

  return NextResponse.json({ ok: true, delivery, supportEmail: SUPPORT_EMAIL });
}
