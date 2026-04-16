/**
 * POST /api/pipeline/run
 *
 * Accepts a PipelineNode[] in the request body, executes them through the
 * wave-based parallel pipeline engine, and streams real-time progress events
 * back to the caller as Server-Sent Events (text/event-stream).
 *
 * Event format (each line):
 *   data: {"type":"wave_start","waveIndex":0,"nodeIds":["a","b"],...}\n\n
 *
 * Use the `usePipelineStream` client hook to consume this endpoint.
 */

import { NextRequest } from 'next/server';
import { pipelineEngine } from '@/lib/ai/pipeline';
import type { PipelineNode } from '@/lib/ai/pipeline';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<Response> {
  const limited = await checkRateLimit(req, RATE_LIMITS.AI);
  if (limited) return limited;

  let nodes: PipelineNode[];
  try {
    const body = await req.json();
    nodes = body.nodes;
    if (!Array.isArray(nodes) || nodes.length === 0) {
      return Response.json({ error: 'nodes array required and must not be empty' }, { status: 400 });
    }
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Controller may have been closed if the client disconnected
        }
      };

      try {
        await pipelineEngine.executePipeline(nodes, (event) => {
          send(event);
        });
      } catch (err) {
        send({
          type: 'error',
          message: err instanceof Error ? err.message : 'Pipeline execution failed',
        });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Disable Nginx / Vercel response buffering
      'X-Accel-Buffering': 'no',
    },
  });
}
