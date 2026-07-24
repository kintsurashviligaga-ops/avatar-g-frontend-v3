/**
 * Phone / Voice Webhook Endpoint
 * Handles Twilio voice callbacks and routes AI through chatEngine via channelBridge.
 * Twilio sends POST to this endpoint when a call is received.
 */

import { NextResponse } from 'next/server';
import { generateChannelReply } from '@/lib/ai/channelBridge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalize(v: string | null | undefined): string {
  return String(v || '').trim();
}

function verifyTwilioSignature(req: Request, _body: string): boolean {
  const authToken = normalize(process.env.TWILIO_AUTH_TOKEN);
  // FAIL CLOSED when unconfigured. This route drives a PAID LLM (generateChannelReply), so an open
  // endpoint is an unauthenticated compute drain: anyone POSTing a `SpeechResult` burns provider tokens.
  // Without TWILIO_AUTH_TOKEN we cannot prove the request came from Twilio, so we reject it (the route
  // stays effectively inert until telephony is properly provisioned) — previously this returned `true`,
  // leaving the endpoint open to the public.
  if (!authToken) return false;
  const signature = req.headers.get('x-twilio-signature');
  if (!signature) return false;
  // TODO: upgrade to full HMAC-SHA1 verification (URL + sorted params, base64, constant-time compare)
  // once the request URL behind the Vercel proxy is resolved reliably. Until then we require the header.
  return Boolean(signature);
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
