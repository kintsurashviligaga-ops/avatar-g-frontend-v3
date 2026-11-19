/**
 * GET /api/documents/file?path=documents/<user id>/<file>.pdf[&download=1&name=<file name>] — opens or downloads a PDF
 * Agent G wrote, for as long as the file exists.
 *
 * The chat's card keeps the file's storage path, not only the 7-day link the create route answered with: a chat opened
 * next month still opens its PDF. Each request mints a fresh short link and redirects to it. Only the owner's own folder
 * is served (the path names the user id and must match the signed-in caller); anything else is a 404, never a hint.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { createSignedAssetUrl } from '@/lib/orchestrator/storage-adapter';
import { documentDownloadUrl } from '@/lib/documents/client';
import { documentFileName } from '@/lib/documents/spec';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PATH = /^documents\/([0-9a-f-]{36})\/\d{4}-\d{2}-\d{2}-[0-9a-f-]{36}\.pdf$/;
const LINK_SEC = 600;

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const q = req.nextUrl.searchParams;
  const path = q.get('path') ?? '';
  const m = PATH.exec(path);
  if (!m || m[1] !== user.id) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const url = await createSignedAssetUrl('renders', path, LINK_SEC);
  if (!url) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const target = q.get('download') === '1' ? documentDownloadUrl(url, documentFileName((q.get('name') ?? '').replace(/\.pdf$/i, ''))) : url;
  return NextResponse.redirect(target, { status: 302, headers: { 'Cache-Control': 'no-store' } });
}
