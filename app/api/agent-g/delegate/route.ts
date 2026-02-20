import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { mapSubTaskToDelegateTarget } from '@/lib/agent-g/orchestrator/router';

export const dynamic = 'force-dynamic';

const schema = z.object({
  agent_name: z.enum(['business-agent', 'social-media', 'voice-lab', 'avatar-builder', 'marketplace']),
  action: z.string().min(2),
  input: z.record(z.unknown()).default({}),
  demo_mode: z.boolean().optional(),
});

function authHeaders(request: NextRequest) {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  const auth = request.headers.get('authorization');
  if (auth) headers.authorization = auth;
  return headers;
}

async function callJson(
  request: NextRequest,
  endpoint: string,
  method: 'GET' | 'POST',
  body?: Record<string, unknown>
) {
  const response = await fetch(`${request.nextUrl.origin}${endpoint}`, {
    method,
    headers: authHeaders(request),
    body: method === 'POST' ? JSON.stringify(body || {}) : undefined,
    cache: 'no-store',
  });

  const json = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, json };
}

export async function POST(request: NextRequest) {
  try {
    const secret = process.env.AGENT_G_INTERNAL_SECRET;
    if (secret && request.headers.get('x-agent-g-secret') !== secret) {
      return apiError(new Error('Forbidden'), 403, 'Access denied');
    }

    const payload = schema.safeParse(await request.json());
    if (!payload.success) {
      return apiError(payload.error, 400, 'Invalid delegate payload');
    }

    const target = mapSubTaskToDelegateTarget({
      agent: payload.data.agent_name,
      action: payload.data.action,
      input: payload.data.input,
    });

    if (payload.data.agent_name === 'business-agent') {
      const projectRes = await callJson(request, '/api/business-agent/projects', 'GET');
      const projectId = projectRes.json?.data?.projects?.[0]?.id as string | undefined;

      if (projectId) {
        const runRes = await callJson(request, '/api/business-agent/run', 'POST', { projectId });
        if (runRes.ok) {
          return apiSuccess({ output: { source: 'business-agent', run: runRes.json?.data || {} } });
        }
      }

      const fallback = await callJson(request, '/api/chat', 'POST', {
        message: `Create a business plan for: ${String(payload.data.input.goal || '')}`,
        context: 'business',
      });

      if (!fallback.ok) return apiError(new Error('Business delegation failed'), 502, 'Business delegation failed');
      return apiSuccess({ output: { source: 'business-agent-fallback', data: fallback.json?.data || {} } });
    }

    const delegated = await callJson(request, target.endpoint, target.method, target.body);
    if (!delegated.ok) {
      return apiError(new Error(`Delegation failed (${delegated.status})`), 502, 'Sub-agent delegation failed');
    }

    return apiSuccess({ output: { source: payload.data.agent_name, data: delegated.json?.data || {} } });
  } catch (error) {
    return apiError(error, 500, 'Delegation failed');
  }
}
