/** lib/music/studio/http.ts — the shared request plumbing of the Music Studio routes: auth, the switch, errors. */
import { NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { billingLocale } from '@/lib/api/billingCopy';
import { reportError } from '@/lib/observability/report-error';
import { MusicError, musicError } from './errors';
import { musicErrorText } from './copy';
import { musicStudioEnabled } from './capabilities';

export function musicErrorResponse(e: unknown, req: Request | null): NextResponse {
  const err = musicError(e);
  if (err.code === 'unknown_error') reportError(e, { fn: 'musicStudio.route' });
  return NextResponse.json({ ok: false, code: err.code, message: musicErrorText(err.code, billingLocale(req)) }, { status: err.status });
}

/** The signed-in user, or a refusal. A session that cannot be verified is refused (503), never treated as a guest. */
export async function musicUser(req: Request): Promise<{ userId: string } | { response: NextResponse }> {
  if (!musicStudioEnabled()) return { response: musicErrorResponse(new MusicError('not_enabled', 'off', 503), req) };
  try {
    const { user } = await authedClientFromRequest(req);
    if (!user?.id) {
      const l = billingLocale(req);
      const message = l === 'en' ? 'Sign in to make music.' : l === 'ru' ? 'Войдите, чтобы создавать музыку.' : 'მუსიკის შესაქმნელად შედი ანგარიშზე.';
      return { response: NextResponse.json({ ok: false, code: 'unauthorized', message }, { status: 401 }) };
    }
    return { userId: user.id };
  } catch {
    return { response: NextResponse.json({ ok: false, code: 'auth_unavailable' }, { status: 503 }) };
  }
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new MusicError('validation_failed', 'JSON body required.', 400);
  return b as Record<string, unknown>;
}
