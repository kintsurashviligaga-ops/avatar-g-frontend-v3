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
