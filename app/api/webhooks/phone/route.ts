/**
 * Phone / Voice Webhook Endpoint
 * Handles Twilio voice callbacks and routes AI through chatEngine via channelBridge.
 * Twilio sends POST to this endpoint when a call is received.
 */

import { NextResponse } from 'next/server';
import { generateChannelReply } from '@/lib/ai/channelBridge';
import { verifyTwilioRequest } from '@/lib/voice/twilio-signature';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalize(v: string | null | undefined): string {
  return String(v || '').trim();
}

/**
 * Reconstruct the EXACT public URL Twilio signed. Twilio computes its signature over the webhook URL it
 * was configured to POST to, but behind the Vercel proxy `req.url` carries an internal deployment host —
 * so we rebuild from the forwarded public host (what the client actually hit), falling back to an
 * explicitly configured public origin, then to the raw request URL. Path + query are preserved because
 * both are part of the signed string.
 *
 * Using the forwarded host is safe for verification: a spoofed host can only make a *legitimate* Twilio
 * request fail to verify — it can never forge a passing signature, since that still requires the auth token.
 */
function reconstructPublicUrl(req: Request): string {
  const requestUrl = new URL(req.url);
  const forwardedHost = normalize((req.headers.get('x-forwarded-host') || req.headers.get('host') || '').split(',')[0]);

  if (forwardedHost) {
    const proto = normalize((req.headers.get('x-forwarded-proto') || '').split(',')[0]) || 'https';
    return `${proto}://${forwardedHost}${requestUrl.pathname}${requestUrl.search}`;
  }

  const configured = normalize(process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL).replace(/\/$/, '');
  if (configured) {
    return `${configured}${requestUrl.pathname}${requestUrl.search}`;
  }

  return requestUrl.toString();
}

function verifyTwilioSignature(req: Request, body: string): boolean {
  const authToken = normalize(process.env.TWILIO_AUTH_TOKEN);
  // FAIL CLOSED when unconfigured. This route drives a PAID LLM (generateChannelReply), so an open
  // endpoint is an unauthenticated compute drain: anyone POSTing a `SpeechResult` burns provider tokens.
  // Without TWILIO_AUTH_TOKEN we cannot prove the request came from Twilio, so we reject it (the route
  // stays effectively inert until telephony is properly provisioned) — previously this returned `true`,
  // leaving the endpoint open to the public.
  if (!authToken) return false;

  // Full HMAC-SHA1 verification: base64(HMAC-SHA1(authToken, publicUrl + sorted POST params)), compared
  // constant-time against the x-twilio-signature header. Previously we only checked the header EXISTED,
  // which any caller could satisfy with an arbitrary string.
  const signature = req.headers.get('x-twilio-signature');
  const params: Array<[string, string]> = [...new URLSearchParams(body).entries()];
  return verifyTwilioRequest(authToken, signature, reconstructPublicUrl(req), params);
}

export async function POST(req: Request): Promise<Response> {
  const startedAt = Date.now();

  try {
    const body = await req.text();

    if (!verifyTwilioSignature(req, body)) {
      return new Response('Forbidden', { status: 403 });
    }

    const params = new URLSearchParams(body);
    const speechResult = normalize(params.get('SpeechResult'));
    const callerNumber = normalize(params.get('From') || params.get('Caller'));
    const callSid = normalize(params.get('CallSid'));

    // Initial call — return TwiML to gather speech
    if (!speechResult) {
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="/api/webhooks/phone" method="POST" speechTimeout="auto" language="ka-GE">
    <Say language="ka-GE">გამარჯობა, მე ვარ Agent G. რით შემიძლია დაგეხმაროთ?</Say>
  </Gather>
  <Say language="ka-GE">ვერ მოვისმინე. გმადლობთ, ნახვამდის.</Say>
</Response>`;
      return new Response(twiml, {
        status: 200,
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    // Process speech through chatEngine
    const aiReply = await generateChannelReply({
      channel: 'phone',
      userId: callSid || callerNumber || 'anonymous',
      externalId: callerNumber || callSid || 'unknown',
      text: speechResult,
      locale: 'ka',
      agentId: 'executive-agent-g',
      sessionId: `phone:${callSid}`,
    });

    console.info('[Phone.Webhook]', {
      event: 'ai_reply',
      call_sid: callSid,
      caller: callerNumber,
      model: aiReply.model,
      tokens_in: aiReply.tokensIn,
      tokens_out: aiReply.tokensOut,
      cost: aiReply.costEstimate,
      duration_ms: Date.now() - startedAt,
    });

    // Return TwiML with AI response + re-gather for continued conversation
    const replyText = aiReply.reply.replace(/[<>&"']/g, (c) => {
      const map: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' };
      return map[c] || c;
    });

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="/api/webhooks/phone" method="POST" speechTimeout="auto" language="ka-GE">
    <Say language="ka-GE">${replyText}</Say>
  </Gather>
  <Say language="ka-GE">სხვა რამე თუ გაქვთ, გმადლობთ, ნახვამდის.</Say>
</Response>`;
    return new Response(twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error) {
    console.error('[Phone.Webhook] Error:', error);
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="ka-GE">ბოდიშს ვიხდი, ტექნიკური პრობლემაა. გთხოვთ სცადოთ მოგვიანებით.</Say>
</Response>`;
    return new Response(twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  }
}

// Twilio verification webhook (GET for status callback)
export async function GET(): Promise<Response> {
  return NextResponse.json({ status: 'phone_webhook_active', channel: 'phone' });
}
