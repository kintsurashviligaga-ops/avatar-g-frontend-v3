import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/api/response';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const mode = request.nextUrl.searchParams.get('hub.mode');
    const token = request.nextUrl.searchParams.get('hub.verify_token');
    const challenge = request.nextUrl.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return new Response(challenge || '', { status: 200 });
    }

    return new Response('Verification failed', { status: 403 });
  } catch (error) {
    return apiError(error, 500, 'WhatsApp verify failed');
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    return apiSuccess({
      channel: 'whatsapp',
      received: true,
      object: body?.object ?? null,
    });
  } catch (error) {
    return apiError(error, 500, 'WhatsApp webhook failed');
  }
}
