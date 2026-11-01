/**
 * lib/connectors/google/access.ts — who may link Google Drive. CONNECTORS_DRIVE: `admin` (admins only, the first
 * Production step), `1`/`true`/`on`/`all` (everyone), anything else = off. Same pattern as AGENT_G_SANDBOX.
 */
import type { User } from '@supabase/supabase-js';
import { isAdminUser } from '@/lib/admin/guard';

export type DriveAccess = 'off' | 'admin' | 'all';

export function driveAccess(env: NodeJS.ProcessEnv = process.env): DriveAccess {
  const raw = (env.CONNECTORS_DRIVE ?? '').trim().toLowerCase();
  if (raw === 'admin') return 'admin';
  if (raw === '1' || raw === 'true' || raw === 'on' || raw === 'all') return 'all';
  return 'off';
}

export function driveOpenTo(user: User | null, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!user) return false;
  const a = driveAccess(env);
  return a === 'all' || (a === 'admin' && isAdminUser(user));
}
