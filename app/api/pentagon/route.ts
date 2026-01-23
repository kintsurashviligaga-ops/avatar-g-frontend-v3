import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Modes:
 * 1) If RENDER_STATUS_BACKEND_URL is set -> proxy to backend
 * 2) Else -> read from Supabase (requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
 */

const DEFAULT_BACKEND_BASE = 'https://avatarg-backend.vercel.app';

function pickRenderStatusTarget(req: Request) {
  const env = process.env.RENDER_STATUS_BACKEND_URL?.trim();
  if (env && /^https?:\/\//i.test(env)) return env;

  // Default: backend base + /api/render-status?...
  const url = new URL(req.url);
  return `${DEFAULT_BACKEND_BASE}/api/render-status?${url.searchParams.toString()}`;
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function withTimeout(ms: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  return { controller, cleanup: () => clearTimeout(t) };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const jobId = url.searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json({ ok: false, error: 'jobId is required' }, { status: 400 });
    }

    // ✅ If backend URL is provided (or default base), proxy first
    const useProxy =
      !!process.env.RENDER_STATUS_BACKEND_URL?.trim() || !!process.env.PREFER_RENDER_STATUS_PROXY?.trim();

    if (useProxy) {
      const target = pickRenderStatusTarget(req);
      const { controller, cleanup } = withTimeout(30_000);

      try {
        const upstream = await fetch(target, {
          method: 'GET',
          signal: controller.signal,
          cache: 'no-store',
          headers: { Accept: 'application/json', 'x-proxy': 'avatar-g-frontend' },
        });

        const text = await upstream.text();
        const parsed = safeJson(text);
        const isJson = upstream.headers.get('content-type')?.includes('application/json') || parsed !== null;

        return new NextResponse(isJson ? JSON.stringify(parsed ?? {}) : text, {
          status: upstream.status,
          headers: {
            'Content-Type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
            'Cache-Control': 'no-store',
          },
        });
      } finally {
        cleanup();
      }
    }

    // ✅ Supabase mode (build-safe: client created only inside handler)
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Supabase env vars are missing (or proxy mode not enabled).',
          details: {
            hasSUPABASE_URL: !!supabaseUrl,
            hasSUPABASE_SERVICE_ROLE_KEY: !!serviceRoleKey,
            hint:
              'Set RENDER_STATUS_BACKEND_URL to proxy, OR set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to read DB directly.',
          },
        },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // You can rename table/columns to match your schema
    const { data, error } = await supabase
      .from('render_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error || !data) {
      return NextResponse.json({ ok: false, error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      job: {
        id: data.id,
        status: data.status,
        progress: data.progress ?? null,
        finalVideoUrl: data.final_video_url ?? data.finalVideoUrl ?? null,
        error: data.error ?? null,
        updatedAt: data.updated_at ?? null,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
