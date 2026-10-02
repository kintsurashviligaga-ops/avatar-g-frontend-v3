/**
 * lib/plugins/settings.ts — the user's switched-off tools, kept in `user_plugin_settings` (migration 20261003e). Server-only:
 * it is handed the SERVICE-ROLE client and scopes every read and write to the verified user id by hand — the table grants
 * client roles no write at all, so this module (behind app/api/plugins) is the only writer.
 *
 * The migration is PREPARED, NOT APPLIED. Until the owner applies it, `pluginTableReady` answers false (a cached
 * `select … limit 1` probe — the pattern of lib/research/capabilities.tableReady, keyed on `user_id` because this table has
 * no `id` column) and the route answers `{ available: false }`: the Plugins tab shows its switches disabled with an
 * "opening soon" line, and nothing ever 500s over a missing table.
 *
 * ⚠️ What is stored here hides menu rows and nothing else (lib/plugins/catalog.ts). No route reads it before generating or
 * charging, and none may.
 */
import 'server-only';
import type { ToolId } from '@/lib/studio/tools';
import { normalizeDisabledTools } from './catalog';

type Db = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export const PLUGIN_TABLE = 'user_plugin_settings';

let probe: { at: number; ready: boolean } | null = null;

/** Cached: 5 minutes once the table is there, 30 seconds while it is not (so applying the migration shows up fast). */
export async function pluginTableReady(db: Db, now: number = Date.now()): Promise<boolean> {
  if (probe && now - probe.at < (probe.ready ? 300_000 : 30_000)) return probe.ready;
  let ready = false;
  try {
    const { error } = await db.from(PLUGIN_TABLE).select('user_id').limit(1);
    ready = !error;
  } catch {
    ready = false;
  }
  probe = { at: now, ready };
  return ready;
}

/** Test hook. */
export function resetPluginSchemaProbe(): void {
  probe = null;
}

export type PluginRead = { ok: true; disabledTools: ToolId[] } | { ok: false };

/** The caller's switched-off tools. No row yet = nothing switched off. */
export async function readDisabledTools(db: Db, userId: string): Promise<PluginRead> {
  try {
    const { data, error } = await db.from(PLUGIN_TABLE).select('disabled_tools').eq('user_id', userId).maybeSingle();
    if (error) return { ok: false };
    return { ok: true, disabledTools: normalizeDisabledTools((data as { disabled_tools?: unknown } | null)?.disabled_tools) };
  } catch {
    return { ok: false };
  }
}

/**
 * Replace the caller's list (one upsert on the primary key — two tabs saving at once leave the last write, which is what the
 * user saw last). The list is normalised again here, so a caller that skipped the route's validation still cannot store an
 * unknown id or a duplicate.
 */
export async function writeDisabledTools(db: Db, userId: string, list: readonly string[]): Promise<PluginRead> {
  const disabled = normalizeDisabledTools(list);
  try {
    const { data, error } = await db
      .from(PLUGIN_TABLE)
      .upsert({ user_id: userId, disabled_tools: disabled, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      .select('disabled_tools')
      .single();
    if (error) return { ok: false };
    return { ok: true, disabledTools: normalizeDisabledTools((data as { disabled_tools?: unknown } | null)?.disabled_tools ?? disabled) };
  } catch {
    return { ok: false };
  }
}
