/**
 * The one way to get a browser runner. Off unless BROWSER_ENABLED=1 AND BROWSER_SNAPSHOT_ID name the Chromium snapshot
 * (owner steps). On: the Vercel host from that snapshot, every task booked in the SAME $20 ledger as code runs.
 */
import 'server-only';
import { dbSpendStore } from '@/lib/agent/sandbox/dbSpend';
import { disabledBrowser, hostBrowserRunner, type BrowserRunner } from './runner';
import { vercelBrowserHost, vercelLoginHost } from './vercelHost';
import { vaultKey } from './sessionVault';
import { SESSION_BUCKET, sessionStore, type SessionStore } from './sessionStore';
import { browserLogin, type BrowserLogin } from './login';
import type { BrowserDeps } from './quote';

const SNAPSHOT = /^[A-Za-z0-9_-]{6,80}$/;

export function browserEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.BROWSER_ENABLED === '1' && SNAPSHOT.test(env.BROWSER_SNAPSHOT_ID ?? '');
}

/**
 * Logging in inside the cloud browser (./login): off unless the browser is on, AGENT_BROWSER_LOGIN=1 and
 * AGENT_BROWSER_VAULT_KEY holds a 32-byte key (the vault has no fallback key).
 */
export function browserLoginEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return browserEnabled(env) && env.AGENT_BROWSER_LOGIN === '1' && vaultKey(env) !== null;
}

/** The saved-logins vault, or null when logins are off. */
export async function liveSessionStore(env: NodeJS.ProcessEnv = process.env): Promise<SessionStore | null> {
  const key = browserLoginEnabled(env) ? vaultKey(env) : null;
  if (!key) return null;
  const { supabaseBlobs } = await import('@/lib/agent/workspace/live');
  return sessionStore(supabaseBlobs(SESSION_BUCKET), key);
}

export async function liveBrowserLogin(userId: string, env: NodeJS.ProcessEnv = process.env): Promise<BrowserLogin | null> {
  const sessions = await liveSessionStore(env);
  if (!sessions) return null;
  return browserLogin({
    host: vercelLoginHost(env.BROWSER_SNAPSHOT_ID!),
    spend: dbSpendStore({ userId }),
    sessions,
    key: () => env.AGENT_G_QUOTE_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || '',
  });
}

export function getBrowserRunner(userId: string | null, env: NodeJS.ProcessEnv = process.env): BrowserRunner {
  if (!browserEnabled(env)) return disabledBrowser;
  // A task that starts on a site the person saved a login for opens with that login (only with logins switched on).
  const loadState = userId && browserLoginEnabled(env)
    ? async (url: string) => (await liveSessionStore(env))?.forUrl(userId, url) ?? null
    : undefined;
  return hostBrowserRunner(vercelBrowserHost(env.BROWSER_SNAPSHOT_ID!), dbSpendStore({ userId }), { loadState });
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
