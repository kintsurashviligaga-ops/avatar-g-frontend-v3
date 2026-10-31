/**
 * The one way to get a sandbox runner. Off unless SANDBOX_ENABLED=1 is set on the deployment (an owner step, so the
 * first paid run happens only when GG says so). On: the Vercel host, with every run booked in the shared spend
 * ledger against the $20 cap before anything is created.
 */
import 'server-only';
import { disabledSandbox, type SandboxRunner } from './policy';
import { hostRunner } from './runner';
import { dbSpendStore } from './dbSpend';
import { vercelHost } from './vercelHost';

export function sandboxEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SANDBOX_ENABLED === '1';
}

export function getSandboxRunner(userId: string | null, env: NodeJS.ProcessEnv = process.env): SandboxRunner {
  if (!sandboxEnabled(env)) return disabledSandbox;
  return hostRunner(vercelHost(), dbSpendStore({ userId }));
}

/** The live effects of a code run (./codeQuote): the quote key, the shared duplicate guard, this runner. */
export async function liveCodeDeps(): Promise<import('./codeQuote').CodeDeps> {
  const [{ storeClaim }, { randomUUID }] = await Promise.all([
    import('@/lib/orchestrator/idempotencyStore'),
    import('node:crypto'),
  ]);
  return {
    // The same key as every Agent G quote (lib/agent/media/montageLive quoteKey), read here so ffmpeg stays out.
    key: () => process.env.AGENT_G_QUOTE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    now: () => Date.now(),
    newId: () => randomUUID(),
    claim: storeClaim,
    enabled: () => sandboxEnabled(),
    runner: (userId) => getSandboxRunner(userId),
  };
}
