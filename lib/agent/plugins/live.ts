/**
 * lib/agent/plugins/live.ts — the facts the plugin resolver needs, read live for one user (server only), and the
 * plugin deps the agent run hands its tools. Every read fails closed: an error means "not ready", never "linked".
 */
import type { User } from '@supabase/supabase-js';
import { flagOpenTo } from '@/lib/connectors/oauth/access';
import { liveTokenDeps, linkedToken } from '@/lib/connectors/oauth/live';
import type { TokenConnectorDeps } from '@/lib/connectors/oauth/types';
import { notionSpec } from '@/lib/connectors/notion';
import { githubSpec } from '@/lib/connectors/github';
import { driveOpenTo } from '@/lib/connectors/google/access';
import { liveDriveDeps } from '@/lib/connectors/google';
import { agentAnalyzeOpenTo, agentMediaOpenTo, agentSandboxOpenTo } from '@/lib/agent/media/access';
import type { PluginFacts } from './catalog';

/** AGENT_PLUGINS: `admin` | `all` | empty (off). Off = /api/agent/plugins is a 404 and no plugin tool is offered. */
export const pluginsOpenTo = (user: User | null, env: NodeJS.ProcessEnv = process.env): boolean => flagOpenTo(user, 'AGENT_PLUGINS', env);

async function dbAnswers(): Promise<boolean> {
  try {
    const { createServiceRoleClient } = await import('@/lib/supabase/server');
    const sb = createServiceRoleClient();
    const q = sb.from('profiles').select('id').limit(1);
    const timeout = new Promise<{ error: unknown }>((r) => setTimeout(() => r({ error: 'timeout' }), 3000));
    const { error } = (await Promise.race([q, timeout])) as { error: unknown };
    return !error;
  } catch {
    return false;
  }
}

const tokenFacts = async (deps: TokenConnectorDeps, userId: string, open: boolean) => ({
  open,
  configured: !!deps.cfg,
  tableReady: deps.tableReady,
  linked: deps.cfg && deps.tableReady ? !!(await linkedToken(deps, userId)) : false,
});

export async function livePluginFacts(user: User): Promise<PluginFacts> {
  const driveOpen = driveOpenTo(user);
  const [drive, notion, github, dbUp] = await Promise.all([
    driveOpen ? liveDriveDeps(user) : Promise.resolve(null),
    liveTokenDeps(notionSpec, user),
    liveTokenDeps(githubSpec, user),
    dbAnswers(),
  ]);
  let driveLinked = false;
  if (drive?.cfg && drive.store && drive.tableReady) driveLinked = !!(await drive.store.get(user.id).catch(() => null));
  return {
    pluginsOn: pluginsOpenTo(user),
    drive: { open: driveOpen, configured: !!drive?.cfg, tableReady: !!drive?.tableReady, linked: driveLinked },
    notion: await tokenFacts(notion, user.id, flagOpenTo(user, notionSpec.flag)),
    github: await tokenFacts(github, user.id, flagOpenTo(user, githubSpec.flag)),
    sandbox: agentSandboxOpenTo(user),
    analyze: agentAnalyzeOpenTo(user),
    media: agentMediaOpenTo(user),
    dbUp,
  };
}

/** What an agent run adds to its context for the plugin tools. Everything closed = {} (the run is unchanged). */
export async function livePluginContext(user: User): Promise<{ notionDeps?: TokenConnectorDeps; githubDeps?: TokenConnectorDeps; calendar?: boolean }> {
  if (!pluginsOpenTo(user)) return {};
  const [notion, github] = await Promise.all([liveTokenDeps(notionSpec, user), liveTokenDeps(githubSpec, user)]);
  return {
    calendar: true,
    ...(notion.cfg && notion.tableReady ? { notionDeps: notion } : {}),
    ...(github.cfg && github.tableReady ? { githubDeps: github } : {}),
  };
}
