/**
 * The one way to get a browser runner. Off unless BROWSER_ENABLED=1 AND BROWSER_SNAPSHOT_ID name the Chromium snapshot
 * (owner steps). On: the Vercel host from that snapshot, every task booked in the SAME $20 ledger as code runs.
 */
import 'server-only';
import { dbSpendStore } from '@/lib/agent/sandbox/dbSpend';
import { disabledBrowser, hostBrowserRunner, type BrowserRunner } from './runner';
import { vercelBrowserHost } from './vercelHost';
import type { BrowserDeps } from './quote';

const SNAPSHOT = /^[A-Za-z0-9_-]{6,80}$/;

export function browserEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.BROWSER_ENABLED === '1' && SNAPSHOT.test(env.BROWSER_SNAPSHOT_ID ?? '');
}

export function getBrowserRunner(userId: string | null, env: NodeJS.ProcessEnv = process.env): BrowserRunner {
  if (!browserEnabled(env)) return disabledBrowser;
  return hostBrowserRunner(vercelBrowserHost(env.BROWSER_SNAPSHOT_ID!), dbSpendStore({ userId }));
}

export async function liveBrowserDeps(): Promise<BrowserDeps> {
  const [{ storeClaim }, { randomUUID }, { liveWorkspaceStore }] = await Promise.all([
    import('@/lib/orchestrator/idempotencyStore'),
    import('node:crypto'),
    import('@/lib/agent/workspace/live'),
  ]);
  return {
    key: () => process.env.AGENT_G_QUOTE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    now: () => Date.now(),
    newId: () => randomUUID(),
    claim: storeClaim,
    enabled: () => browserEnabled(),
    runner: (userId) => getBrowserRunner(userId),
    workspace: liveWorkspaceStore,
  };
}
