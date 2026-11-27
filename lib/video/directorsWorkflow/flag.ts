/**
 * lib/video/directorsWorkflow/flag.ts — DIRECTORS_WORKFLOW: who sees the Director's Workflow.
 *
 * OFF unless set. 'admin' = admins only (the first real test on myavatar.ge), 'everyone' = all signed-in users. Any
 * other value, including '1' or 'true', is OFF: opening a paid multi-scene feature to everyone must be said in words.
 */
export type DwAudience = 'off' | 'admin' | 'everyone';

export function directorsWorkflowAudience(env: Record<string, string | undefined> = process.env): DwAudience {
  const v = (env.DIRECTORS_WORKFLOW ?? '').trim().toLowerCase();
  return v === 'admin' || v === 'everyone' ? v : 'off';
}

export function directorsWorkflowAllowed(isAdmin: boolean, env: Record<string, string | undefined> = process.env): boolean {
  const a = directorsWorkflowAudience(env);
  return a === 'everyone' || (a === 'admin' && isAdmin);
}
