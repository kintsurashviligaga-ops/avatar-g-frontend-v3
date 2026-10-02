/**
 * GET /api/connectors → { connectors: ConnectorState[], limits }
 *
 * The honest state of every connector (lib/connectors/registry.ts): Local files WORKS (`ready`, with the signed-in user's file
 * count), and Google Drive, OneDrive, Notion and Dropbox are `soon` — prepared on the server, NOT connectable: no OAuth flow, no
 * token store, nothing to authorize. A guest gets the list too (statuses are public facts; there is no file count to leak).
 * `limits` are the numbers the Connectors view shows: documents per account, characters per document, documents per run.
 */
import { NextRequest } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { connectorRegistry, connectorStates } from '@/lib/connectors/registry';
import { tableReady } from '@/lib/research/capabilities';
import { RESEARCH_ATTACH_MAX, RESEARCH_CONTEXT_MAX_CHARS, RESEARCH_FILES_MAX, RESEARCH_FILE_MAX_CHARS } from '@/lib/research/context';
import { callerId, json } from '@/lib/research/http';
import { getResearchRuntime } from '@/lib/research/runtime';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 15;

export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, RATE_LIMITS.READ);
  if (limited) return limited;
  const userId = await callerId(req);
  const rt = getResearchRuntime();
  const filesTableReady = !!rt && (await tableReady(rt.db as never, 'research_context_files'));
  const providers = connectorRegistry({ localFiles: rt?.files ?? null, filesTableReady });
  const connectors = await connectorStates(userId, providers);
  return json({
    connectors,
    limits: { maxFiles: RESEARCH_FILES_MAX, maxFileChars: RESEARCH_FILE_MAX_CHARS, maxAttach: RESEARCH_ATTACH_MAX, maxContextChars: RESEARCH_CONTEXT_MAX_CHARS },
  });
}
