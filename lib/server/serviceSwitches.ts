/**
 * lib/server/serviceSwitches.ts — the admin's on/off switch per studio tool, with no code change and no redeploy.
 *
 * Stored as rows of the existing feature_flags table (flag_name `service:<tool>`, enabled false = switched off), so it
 * needs no migration and rides the same 30 s cache, timeout bound and fail-open read as the feature flags
 * (lib/server/feature-flags). No row = on: a tool is only off after an admin switched it off.
 *
 * ⚠️ THE SWITCH IS ENFORCED ON THE SERVER. Every route that starts a paid generation for a tool calls
 * `serviceOffResponse(tool)` after its auth check and before any charge or provider call; the client reading
 * GET /api/services/status only hides what the server already refuses.
 *
 * ⚠️ FAIL-OPEN ON A READ ERROR, LIKE THE FLAGS. A database outage must not switch every tool off; the cost of a missed
 * "off" for ≤ 30 s is smaller than the cost of a site-wide false "off".
 */
import { NextResponse } from 'next/server';
import { getFeatureFlag, invalidateFlagCache, readDbOverrides } from '@/lib/server/feature-flags';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { ToolId } from '@/lib/studio/tools';

/** Tools an admin can switch. Chat (the window itself) and the on-device photo sorter are not switchable. */
export const SWITCHABLE_TOOLS = [
  'video', 'product', 'vfx', 'image', 'photoshoot', 'interior', 'music', 'avatar',
  'montage', 'model3d', 'dubbing', 'presentation', 'swap', 'motion', 'remix',
] as const satisfies readonly ToolId[];
export type SwitchableTool = (typeof SWITCHABLE_TOOLS)[number];

export const isSwitchableTool = (v: unknown): v is SwitchableTool =>
  typeof v === 'string' && (SWITCHABLE_TOOLS as readonly string[]).includes(v);

export const serviceFlagName = (tool: SwitchableTool) => `service:${tool}`;

/** Is this tool switched on? Fail-open (true) on any read error. */
export async function isServiceEnabled(tool: SwitchableTool): Promise<boolean> {
  return getFeatureFlag(serviceFlagName(tool), true);
}

/** The tools switched off right now (a single cached read). */
export async function disabledServices(): Promise<SwitchableTool[]> {
  const db = await readDbOverrides();
  return SWITCHABLE_TOOLS.filter((t) => db.get(serviceFlagName(t)) === false);
}

const OFF_MESSAGE = {
  ka: 'ეს სერვისი დროებით გათიშულია. სცადე მოგვიანებით.',
  en: 'This service is temporarily turned off. Please try again later.',
  ru: 'Этот сервис временно отключён. Попробуйте позже.',
} as const;

/**
 * null when `tool` is on; a 503 the panels already render as an error when it is off. Call it after auth and BEFORE
 * any credit reservation or provider call, so a switched-off tool never charges.
 */
export async function serviceOffResponse(tool: SwitchableTool): Promise<NextResponse | null> {
  if (await isServiceEnabled(tool)) return null;
  return NextResponse.json(
    { error: 'service_disabled', code: 'service_disabled', tool, message: OFF_MESSAGE.ka, messages: OFF_MESSAGE },
    { status: 503, headers: { 'Cache-Control': 'no-store' } },
  );
}

/** Same check for code paths that are not a route (the chat's "yes" starting a job): a reason string, or null. */
export async function serviceOffReason(tool: SwitchableTool): Promise<string | null> {
  return (await isServiceEnabled(tool)) ? null : OFF_MESSAGE.ka;
}

/** Admin write: switch a tool on or off. Service-role; clears the cache so this lambda sees it at once. */
export async function setServiceEnabled(tool: SwitchableTool, enabled: boolean, updatedBy: string | null): Promise<{ ok: boolean; error?: string }> {
  try {
    const svc = createServiceRoleClient();
    const { error } = await svc
      .from('feature_flags')
      .upsert({ flag_name: serviceFlagName(tool), enabled, updated_by: updatedBy, updated_at: new Date().toISOString() }, { onConflict: 'flag_name' });
    if (error) return { ok: false, error: error.message };
    invalidateFlagCache();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'write_failed' };
  }
}
