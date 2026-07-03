import 'server-only';

/**
 * Read the LIVE (is_active) agent config for a target (STEP 5). This is how an approved config
 * version actually reaches the pipeline: a caller does `(await getActiveConfig('kling'))?.params`
 * and falls back to its hard-coded default when null. Fail-soft — a missing table or no active
 * row returns null, so nothing breaks before the migration is applied or the first approval.
 */
import { createServiceRoleClient } from '@/lib/supabase/server';

export interface ActiveConfig {
  version: number;
  params: Record<string, unknown>;
  prompt: string | null;
}

export async function getActiveConfig(target: string): Promise<ActiveConfig | null> {
  if (!target) return null;
  try {
    const sb = createServiceRoleClient();
    const { data, error } = await sb
      .from('agent_configs')
      .select('version, params, prompt')
      .eq('target', target)
      .eq('is_active', true)
      .maybeSingle();
    if (error || !data) return null;
    return {
      version: data.version as number,
      params: (data.params ?? {}) as Record<string, unknown>,
      prompt: (data.prompt ?? null) as string | null,
    };
  } catch {
    return null;
  }
}
