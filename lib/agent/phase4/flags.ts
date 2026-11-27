/**
 * lib/agent/phase4/flags.ts — who may use the Phase 4 features (v5.1 Phase 4, PREPARED, NOT WIRED). Pure.
 *
 * GG 2026-11-13 12:34Z:
 *   - AGENT_BROWSER_AGENT stays admin-only (D-08). There is no "everyone" value: anything but "admins" (or "admin") is off.
 *   - Phase 8.12: "admin" is accepted as well as "admins", like lib/agent/run/engineFlags.ts, STUDIO_3D_V2 and
 *     MONTAGE_SMART_EDITOR, because the launch runbook says "set to admin". Still admin-only, still fails closed.
 *   - AGENT_SANDBOX_PACKAGES and AGENT_APP_BUILDER start admin-only too (they run in the same code sandbox as D-08).
 * Every flag fails closed: unset, empty, misspelt or unknown → off. All three are off by default and stay off until GG
 * turns them on after the DB is back and the integration tests pass.
 */
export type Phase4Flag = 'AGENT_BROWSER_AGENT' | 'AGENT_SANDBOX_PACKAGES' | 'AGENT_APP_BUILDER';
export const PHASE4_FLAGS: readonly Phase4Flag[] = ['AGENT_BROWSER_AGENT', 'AGENT_SANDBOX_PACKAGES', 'AGENT_APP_BUILDER'];
export type Phase4Audience = 'off' | 'admins';

export function phase4Audience(raw: string | undefined | null): Phase4Audience {
  if (typeof raw !== 'string') return 'off';
  const v = raw.trim().toLowerCase();
  return v === 'admins' || v === 'admin' ? 'admins' : 'off';
}

/** May this user use the feature? Only an admin, and only when the flag says "admins". */
export function phase4Allowed(flag: Phase4Flag, user: { isAdmin: boolean } | null, env: Record<string, string | undefined> = process.env): boolean {
  if (!PHASE4_FLAGS.includes(flag)) return false;
  return phase4Audience(env[flag]) === 'admins' && user?.isAdmin === true;
}
