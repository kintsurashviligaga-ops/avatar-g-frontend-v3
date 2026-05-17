/**
 * GET /api/health/embed?key=$ADMIN_KEY
 *
 * Admin-gated diagnostic for the OpenAI embeddings API. Returns the
 * shape and (partial) values of an embedding so we can verify whether
 * `embed()` is working in production. If the call fails, the actual
 * upstream error (status + body) is surfaced.
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey || req.nextUrl.searchParams.get('key') !== adminKey) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const apiKey = process.env.OPENAI_API_KEY ?? '';
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY not set' }, { status: 500 });
  }

  const t0 = Date.now();
  try {
    const r = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: 'health check — embedding probe',
      }),
    });

    const body = await r.text();
    if (!r.ok) {
      return NextResponse.json(
        {
          ok: false,
          status: r.status,
          statusText: r.statusText,
          body: body.slice(0, 400),
          latencyMs: Date.now() - t0,
          openai_key_prefix: apiKey.slice(0, 7),
          openai_key_length: apiKey.length,
        },
        { status: 200 },
      );
    }

    const json = JSON.parse(body) as { data?: Array<{ embedding?: number[] }>; usage?: unknown };
    const vec = json.data?.[0]?.embedding;

    return NextResponse.json({
      ok: true,
      latencyMs: Date.now() - t0,
      embedding_length: vec?.length ?? null,
      embedding_first_5: vec?.slice(0, 5) ?? null,
      usage: json.usage,
      openai_key_prefix: apiKey.slice(0, 7),
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        latencyMs: Date.now() - t0,
        error: err instanceof Error ? err.message : 'unknown',
        openai_key_prefix: apiKey.slice(0, 7),
        openai_key_length: apiKey.length,
      },
      { status: 200 },
    );
  }
}
