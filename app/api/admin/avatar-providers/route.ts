import { NextRequest, NextResponse } from 'next/server';
import { secretMatches } from '@/lib/security/secretMatch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Admin diagnostic — enumerates avatar provider capabilities using the
 * production key (HEYGEN_API_KEY is a Vercel "Sensitive" var and cannot be
 * read off-platform, so we probe it here). Answers:
 *   - Does HeyGen expose Georgian voices?
 *   - What avatars exist?
 *   - Is the Interactive/Streaming Avatar API available on this plan?
 * The ElevenLabs voice and library listings left in PR 6b: speech is Google Cloud TTS (PR 5d), and nothing reads an
 * ElevenLabs voice any more.
 *
 * Auth: x-admin-key == MIGRATION_RUN_KEY (or ADMIN_KEY).
 */

const norm = (v: string | null | undefined) => String(v || '').trim();

function authorized(req: NextRequest): boolean {
  const expected = norm(process.env.MIGRATION_RUN_KEY) || norm(process.env.ADMIN_KEY);
  // Constant-time: a plain `===` leaks how many leading characters of a guess were right.
  return secretMatches(req.headers.get('x-admin-key'), expected);
}

const isKa = (s: string | undefined) => /georg|^ka\b|ka-|ქართ/i.test(String(s || ''));

async function heygenVoices(key: string) {
  const r = await fetch('https://api.heygen.com/v2/voices', { headers: { 'X-Api-Key': key } });
  if (!r.ok) return { ok: false, status: r.status, detail: (await r.text()).slice(0, 160) };
  const j = await r.json() as { data?: { voices?: Array<Record<string, unknown>> } };
  const voices = j.data?.voices ?? [];
  const languages = [...new Set(voices.map(v => String(v['language'] ?? '')).filter(Boolean))].sort();
  const georgian = voices
    .filter(v => isKa(String(v['language'])) || isKa(String(v['name'])))
    .map(v => ({ voice_id: v['voice_id'], name: v['name'], language: v['language'], gender: v['gender'], preview: v['preview_audio'] }));
  return { ok: true, total: voices.length, georgian, georgianCount: georgian.length, languages };
}

async function heygenAvatars(key: string) {
  const r = await fetch('https://api.heygen.com/v2/avatars', { headers: { 'X-Api-Key': key } });
  if (!r.ok) return { ok: false, status: r.status, detail: (await r.text()).slice(0, 160) };
  const j = await r.json() as { data?: { avatars?: Array<Record<string, unknown>> } };
  const avatars = j.data?.avatars ?? [];
  const slim = (a: Record<string, unknown>) => ({ avatar_id: a['avatar_id'], name: a['avatar_name'], gender: a['gender'], preview: a['preview_image_url'] });
  const isMale = (a: Record<string, unknown>) => String(a['gender'] ?? '').toLowerCase() === 'male';
  const businessRe = /office|business|suit|professional|formal|glass|executive|corporate|ceo|manager|desk/i;
  const maleBusiness = avatars.filter(a => isMale(a) && businessRe.test(String(a['avatar_name'] ?? ''))).map(slim);
  return {
    ok: true,
    total: avatars.length,
    sample: avatars.slice(0, 10).map(slim),
    maleBusiness: maleBusiness.slice(0, 25),
    maleBusinessCount: maleBusiness.length,
  };
}

async function heygenStreaming(key: string) {
  // Capability probe: can we mint a streaming session token? (classic, sunset)
  const r = await fetch('https://api.heygen.com/v1/streaming.create_token', {
    method: 'POST', headers: { 'X-Api-Key': key, 'Content-Type': 'application/json' }, body: '{}',
  });
  const body = (await r.text()).slice(0, 200);
  return { available: r.ok, status: r.status, detail: body };
}

async function liveAvatar(key: string) {
  // Probe HeyGen's NEW real-time product (LiveAvatar). Does the HeyGen key work?
  const out: Record<string, unknown> = {};
  // 1) interactive avatars list
  try {
    const a = await fetch('https://api.liveavatar.com/v1/avatars', { headers: { 'X-API-KEY': key } });
    const body = await a.text();
    let parsed: unknown; try { parsed = JSON.parse(body); } catch { parsed = body.slice(0, 200); }
    out['avatars'] = { status: a.status, ok: a.ok, sample: parsed };
  } catch (e) { out['avatars'] = { error: String(e) }; }
  // 2) token auth check (empty body → 400 means KEY ACCEPTED; 401/403 means no access)
  try {
    const t = await fetch('https://api.liveavatar.com/v1/sessions/token', {
      method: 'POST', headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' }, body: '{}',
    });
    out['tokenAuth'] = { status: t.status, ok: t.ok, detail: (await t.text()).slice(0, 240) };
  } catch (e) { out['tokenAuth'] = { error: String(e) }; }
  // 3) voices list (to confirm Eka native Georgian voice id is usable)
  try {
    const v = await fetch('https://api.liveavatar.com/v1/voices', { headers: { 'X-API-KEY': key } });
    const body = await v.text();
    out['voices'] = { status: v.status, ok: v.ok, len: body.length };
  } catch (e) { out['voices'] = { error: String(e) }; }
  return out;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const heygenKey = norm(process.env.HEYGEN_API_KEY);

  const result: Record<string, unknown> = {
    ok: true,
    keys: { heygen: Boolean(heygenKey) },
  };

  const tasks: Array<Promise<void>> = [];
  if (heygenKey) {
    tasks.push(heygenVoices(heygenKey).then(d => { result['heygen_voices'] = d; }).catch(e => { result['heygen_voices'] = { ok: false, error: String(e) }; }));
    tasks.push(heygenAvatars(heygenKey).then(d => { result['heygen_avatars'] = d; }).catch(e => { result['heygen_avatars'] = { ok: false, error: String(e) }; }));
    tasks.push(heygenStreaming(heygenKey).then(d => { result['heygen_streaming'] = d; }).catch(e => { result['heygen_streaming'] = { ok: false, error: String(e) }; }));
    tasks.push(liveAvatar(heygenKey).then(d => { result['liveavatar'] = d; }).catch(e => { result['liveavatar'] = { error: String(e) }; }));
  }

  await Promise.all(tasks);
  return NextResponse.json(result);
}
