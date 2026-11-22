/**
 * lib/services/montage/smart/flag.ts — MONTAGE_SMART_EDITOR: who sees the Smart Editor layer of Montage (Phase 8.7):
 * auto-captions, silence removal, the beat button, the text/effects tracks, templates and the Agent G smart edit.
 *
 * OFF unless set. 'admin' = admins only (the first real test on myavatar.ge), 'everyone' = every signed-in user. Any
 * other value, including '1' or 'true', is OFF: opening a paid feature to everyone must be said in words. Same contract
 * as DIRECTORS_WORKFLOW, MUSIC_PRODUCER_V2 and AVATAR_STUDIO_V2. With the flag off the editor is exactly today's
 * Montage: nothing here is reachable.
 */
export type SmartAudience = 'off' | 'admin' | 'everyone';

export function smartEditorAudience(env: Record<string, string | undefined> = process.env): SmartAudience {
  const v = (env.MONTAGE_SMART_EDITOR ?? '').trim().toLowerCase();
  return v === 'admin' || v === 'everyone' ? v : 'off';
}

export function smartEditorAllowed(isAdmin: boolean, env: Record<string, string | undefined> = process.env): boolean {
  const a = smartEditorAudience(env);
  return a === 'everyone' || (a === 'admin' && isAdmin);
}

/**
 * The browser only knows NEXT_PUBLIC_MONTAGE_SMART_EDITOR, so the editor shows the Smart tools when it says 'admin' or
 * 'everyone'; the server's MONTAGE_SMART_EDITOR still decides per user (the routes answer 404).
 */
export function smartEditorClientOn(value: string | undefined): boolean {
  const v = (value ?? '').trim().toLowerCase();
  return v === 'admin' || v === 'everyone';
}
