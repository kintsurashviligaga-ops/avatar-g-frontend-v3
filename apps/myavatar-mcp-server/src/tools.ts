/**
 * MyAvatar MCP tools — thin, standardized adapters that map the universal MCP
 * tool contract onto MyAvatar's existing HTTP pipelines. This is the decoupling
 * boundary: the server holds NO vendor SDKs or business logic — it forwards to
 * the deployed API (the same routes the browser uses), so there is one source of
 * truth for generation/billing/credits.
 *
 * Config (env):
 *   MYAVATAR_API_BASE   default https://myavatar.ge
 *   MYAVATAR_API_TOKEN  Supabase JWT / bearer for the authed produce/jobs routes
 */

import { z } from 'zod';

const BASE = process.env.MYAVATAR_API_BASE ?? 'https://myavatar.ge';
const TOKEN = process.env.MYAVATAR_API_TOKEN ?? '';

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}
const ok = (text: string): ToolResult => ({ content: [{ type: 'text', text }] });
const err = (text: string): ToolResult => ({ content: [{ type: 'text', text }], isError: true });

function authHeaders(): Record<string, string> {
  return TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};
}

export interface ToolDef {
  id: string;
  description: string;
  /** Zod raw shape consumed by McpServer.tool(). */
  params: z.ZodRawShape;
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
}

// ── database_jobs_sync — read generation_jobs (reload-recovery state) ──────────
const databaseJobsSync: ToolDef = {
  id: 'database_jobs_sync',
  description: "Read the authenticated user's generation_jobs (reload-recovery state) from Supabase via the MyAvatar API.",
  params: { limit: z.number().int().min(1).max(50).optional(), status: z.enum(['active']).optional() },
  handler: async ({ limit, status }) => {
    const url = new URL('/api/orchestrator/jobs', BASE);
    if (typeof limit === 'number') url.searchParams.set('limit', String(limit));
    if (typeof status === 'string') url.searchParams.set('status', status);
    const res = await fetch(url, { headers: authHeaders() });
    const body = await res.text();
    if (!res.ok) return err(`HTTP ${res.status}: ${body.slice(0, 300)}`);
    return ok(body.slice(0, 6000));
  },
};

// ── hardware_gpu_render — full 30s film pipeline (RunPod GPU / CPU fallback) ───
const hardwareGpuRender: ToolDef = {
  id: 'hardware_gpu_render',
  description: 'Run the cinematic film pipeline end-to-end and return the final signed master URL.',
  params: { prompt: z.string().min(1), totalDurationSec: z.number().int().min(5).max(60).optional() },
  handler: async ({ prompt, totalDurationSec }) => {
    const res = await fetch(new URL('/api/orchestrator/produce', BASE), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ prompt, totalDurationSec: typeof totalDurationSec === 'number' ? totalDurationSec : 30 }),
    });
    if (res.status === 401) return err('unauthorized — set MYAVATAR_API_TOKEN to a valid bearer JWT');
    if (!res.ok || !res.body) return err(`HTTP ${res.status}`);
    // Consume the self-contained SSE stream to completion.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let finalUrl: string | null = null;
    let failed: string | null = null;
    let lastStage = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const chunks = buf.split('\n\n');
      buf = chunks.pop() ?? '';
      for (const c of chunks) {
        const line = c.split('\n').find((l) => l.startsWith('data: '));
        if (!line) continue;
        try {
          const ev = JSON.parse(line.slice(6)) as { stage?: string; url?: string; error?: string };
          if (ev.stage) lastStage = ev.stage;
          if (ev.stage === 'completed' && ev.url) finalUrl = ev.url;
          if (ev.stage === 'failed') failed = ev.error ?? 'failed';
        } catch { /* partial chunk */ }
      }
    }
    if (finalUrl) return ok(JSON.stringify({ status: 'completed', url: finalUrl }));
    return err(JSON.stringify({ status: 'failed', reason: failed ?? lastStage ?? 'no url returned' }));
  },
};

// ── synthesis_voice_ka — premium Georgian TTS ─────────────────────────────────
const synthesisVoiceKa: ToolDef = {
  id: 'synthesis_voice_ka',
  description: 'Premium Georgian (ka) text-to-speech via ElevenLabs; returns base64 audio/mpeg.',
  params: { text: z.string().min(1).max(800), locale: z.enum(['ka', 'en', 'ru']).optional() },
  handler: async ({ text, locale }) => {
    const res = await fetch(new URL('/api/elevenlabs/tts', BASE), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, locale: typeof locale === 'string' ? locale : 'ka' }),
    });
    if (!res.ok) return err(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) return err('empty audio stream');
    return ok(JSON.stringify({ mime: 'audio/mpeg', bytes: buf.length, base64: buf.toString('base64').slice(0, 200_000) }));
  },
};

export const TOOLS: ToolDef[] = [databaseJobsSync, hardwareGpuRender, synthesisVoiceKa];
