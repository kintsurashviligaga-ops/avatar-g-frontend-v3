import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const hasVerifyToken = Boolean(String(process.env.WHATSAPP_VERIFY_TOKEN || '').trim());
console.info('[WhatsApp Webhook] WHATSAPP_VERIFY_TOKEN configured:', hasVerifyToken);

function getVerifyToken(): string {
  return String(process.env.WHATSAPP_VERIFY_TOKEN || '').trim();
}

export async function GET(request: Request): Promise<Response> {
  const verifyToken = getVerifyToken();
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (!verifyToken) {
    console.warn('[WhatsApp Webhook] Verification failed: missing WHATSAPP_VERIFY_TOKEN env.');
    return new Response('Forbidden', {
      status: 403,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  if (mode === 'subscribe' && token === verifyToken) {
    return new Response(challenge || '', {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  console.warn('[WhatsApp Webhook] Verification failed: mode/token mismatch.', {
    mode,
    hasToken: Boolean(token),
  });
  return new Response('Forbidden', {
    status: 403,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  let payload: unknown = null;

  try {
    payload = await request.json();
  } catch {
    payload = null;
  }

  const object =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? String((payload as Record<string, unknown>).object || '') || null
      : null;

  console.info('[WhatsApp Webhook] Event received', {
    object,
    hasPayload: Boolean(payload),
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
