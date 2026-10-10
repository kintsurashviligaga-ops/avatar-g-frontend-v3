/**
 * POST /api/calls/bridge/{answer|session|heard|tool|event} — the WhatsApp call media bridge talking back to the app.
 * Logic and rules: lib/calls/whatsapp/bridgeApi.ts. Off (404) unless WHATSAPP_CALLING_ENABLED is on.
 */
import { NextRequest, NextResponse } from 'next/server';
import { handleBridgeRequest, BRIDGE_BODY_MAX_BYTES } from '@/lib/calls/whatsapp/bridgeApi';
import { callingEnabled, liveCallDeps, livePhoneToolDeps } from '@/lib/calls/whatsapp/liveDeps';
import { liveCallSessionDeps, mintCallSession } from '@/lib/calls/whatsapp/liveSession';
import { ticketFromRequest } from '@/lib/calls/whatsapp/ticket';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(request: NextRequest, { params }: { params: { op: string } }) {
  if (!callingEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const raw = await request.text().catch(() => '');
  if (Buffer.byteLength(raw, 'utf8') > BRIDGE_BODY_MAX_BYTES) return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
  let body: unknown = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const origin = new URL(request.url).origin;
  try {
    const r = await handleBridgeRequest(
      {
        call: liveCallDeps(origin),
        tools: livePhoneToolDeps(origin),
        session: (ticket, handle) => mintCallSession(liveCallSessionDeps(), ticket, handle),
      },
      params.op,
      ticketFromRequest(request),
      body,
    );
    return NextResponse.json(r.body, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[WhatsApp.Calls] bridge_failed', { op: params.op, error: error instanceof Error ? error.name : 'unknown' });
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
