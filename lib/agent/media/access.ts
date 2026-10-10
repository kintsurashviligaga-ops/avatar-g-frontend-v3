/**
 * lib/agent/media/access.ts — who may have Agent G execute media (AGENT_G_MEDIA_EXEC).
 *
 * ⚠️ OFF IN PRODUCTION UNLESS THE OWNER TURNS IT ON. `admin` opens it to admins only, `1` / `true` / `on` to every
 * signed-in user, `off` / `0` / `false` closes it everywhere. Unset means off, except on a Vercel Preview, where it
 * means `admin`: the owner can prove the slice end to end there without an env change, and a merge of the code alone
 * turns nothing on in Production. Closed routes answer 404 and the studio keeps its current flow.
 */
import type { User } from '@supabase/supabase-js';
import { isAdminUser } from '@/lib/admin/guard';

export type AgentMediaAccess = 'off' | 'admin' | 'all';

export function agentMediaAccess(env: NodeJS.ProcessEnv = process.env): AgentMediaAccess {
  const raw = (env.AGENT_G_MEDIA_EXEC ?? '').trim().toLowerCase();
  if (raw === 'admin') return 'admin';
  if (raw === '1' || raw === 'true' || raw === 'on') return 'all';
  if (raw === '' && env.VERCEL_ENV === 'preview') return 'admin';
  return 'off';
}

export function agentMediaOpenTo(user: User | null, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!user) return false;
  const access = agentMediaAccess(env);
  return access === 'all' || (access === 'admin' && isAdminUser(user));
}

/**
 * Who may have Agent G read a whole file with Gemini (AGENT_G_FILE_ANALYSIS; lib/agent/media/analyzeExec). Each analysis
 * is a paid model call, so unlike AGENT_G_MEDIA_EXEC it is OFF everywhere until set, a Preview included: `admin` opens
 * it to admins, `1` / `true` / `on` to every signed-in user. The owner's word on the spend comes first (PART 3, G1).
 */
export function agentAnalyzeAccess(env: NodeJS.ProcessEnv = process.env): AgentMediaAccess {
  const raw = (env.AGENT_G_FILE_ANALYSIS ?? '').trim().toLowerCase();
  if (raw === 'admin') return 'admin';
  if (raw === '1' || raw === 'true' || raw === 'on') return 'all';
  return 'off';
}

export function agentAnalyzeOpenTo(user: User | null, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!user) return false;
  const access = agentAnalyzeAccess(env);
  return access === 'all' || (access === 'admin' && isAdminUser(user));
}
