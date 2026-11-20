/**
 * lib/connectors/oauth/access.ts — who a connector flag opens a connector to. The same values as CONNECTORS_DRIVE
 * (lib/connectors/google/access): `admin`/`admins` = admins only, `1`/`true`/`on`/`all` = everyone, anything else = off.
 * Empty (the default) = off, so a new connector ships closed.
 */
import type { User } from '@supabase/supabase-js';
import { isAdminUser } from '@/lib/admin/guard';

export type FlagAccess = 'off' | 'admin' | 'all';

export function flagAccess(name: string, env: NodeJS.ProcessEnv = process.env): FlagAccess {
  const raw = (env[name] ?? '').trim().toLowerCase();
  if (raw === 'admin' || raw === 'admins') return 'admin';
  if (raw === '1' || raw === 'true' || raw === 'on' || raw === 'all') return 'all';
  return 'off';
}

export function flagOpenTo(user: User | null, name: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!user) return false;
  const a = flagAccess(name, env);
  return a === 'all' || (a === 'admin' && isAdminUser(user));
}
