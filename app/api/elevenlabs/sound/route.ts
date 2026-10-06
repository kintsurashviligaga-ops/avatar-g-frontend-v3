import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
/** ElevenLabs is permitted for voice synthesis and lipsync; standalone sound generation is retired. */
export async function POST() {
  return NextResponse.json({ success: false, error: 'provider_deprecated', message: 'Sound effects generation is unavailable.' }, { status: 410 });
}
