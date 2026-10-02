/**
 * /api/plugins — which studio tools the signed-in user has switched OFF (the Plugins tab of the Connectors · Plugins · Skills
 * hub). A switched-off tool disappears from that user's own menus: the sidebar, the collapsed rail and the „+" sheet.
 *
 *   GET  → { available: true, disabledTools: ToolId[] }        (no row yet = [])
 *        → { available: false }                                 while `user_plugin_settings` is not migrated (20261003e)
 *        → 503 { error: 'read_failed' }                          the table is there but the read failed (the tab offers a retry)
 *   PUT  { disabledTools: ToolId[] } → { available: true, disabledTools }
 *          400 invalid (not a known pluggable tool id, a duplicate, the chat, too many, extra keys) · 413 a body far too big
 *          503 { available: false, error: 'unavailable' } while the table is missing · 503 { error: 'save_failed' } (try again)
 *
 * Signed-in only (401 `auth_required` for a guest — a guest has no account to keep a preference in; the tab shows the list
 * with a sign-in prompt). The ids are validated against lib/studio/tools.ts through lib/plugins/catalog.ts, so the stored list
 * can only ever hold tools the studio knows.
 *
 * ⚠️ NOT A SECURITY BOUNDARY, NOT A BILLING CONTROL. This preference hides menu rows; it never stops a route, a deep link or
 * a charge, and nothing that generates or charges may read it (lib/plugins/catalog.ts says why).
 */
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, checkRateLimitByKey, RATE_LIMITS, type RateLimitConfig } from '@/lib/api/rate-limit';
import { DISABLED_TOOLS_MAX, PLUGGABLE_TOOLS } from '@/lib/plugins/catalog';
import { pluginTableReady, readDisabledTools, writeDisabledTools } from '@/lib/plugins/settings';
import { callerId, json } from '@/lib/research/http';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { ToolId } from '@/lib/studio/tools';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 10;

/**
 * Saves come from a switch board (the browser coalesces quick taps into one PUT), so they get their OWN buckets instead of
 * drawing on the WRITE bucket every other write route shares — a user tidying sixteen switches must not 429 their next upload.
 */
const PLUGINS_WRITE_IP: RateLimitConfig = { maxRequests: 60, windowMs: 60_000, keyPrefix: 'rl:plugins:ip' };
const PLUGINS_WRITE_USER: RateLimitConfig = { maxRequests: 60, windowMs: 60_000, keyPrefix: 'rl:plugins:user' };

/** The largest honest body is sixteen short ids (~250 bytes); anything near this is a mistake or an attack. */
const MAX_BODY_CHARS = 4096;

const putSchema = z
  .object({
    disabledTools: z
      .array(z.enum(PLUGGABLE_TOOLS as unknown as [ToolId, ...ToolId[]]))
      .max(DISABLED_TOOLS_MAX)
      .refine((list) => new Set(list).size === list.length, { message: 'duplicate tool id' }),
  })
  .strict();

const unauthorized = () => json({ error: 'auth_required', authRequired: true }, 401);
const unavailable = () => json({ available: false, error: 'unavailable' }, 503);

/** The service-role client, or null when the deployment has none (reads as "not available", never a crash). */
function serviceDb(): ReturnType<typeof createServiceRoleClient> | null {
  try {
    return createServiceRoleClient() ?? null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, RATE_LIMITS.READ);
  if (limited) return limited;
  const userId = await callerId(req);
  if (!userId) return unauthorized();
  const db = serviceDb();
  // The table is not there yet (or no database here): the tab says "opening soon" — an answer, not an error.
  if (!db || !(await pluginTableReady(db as never))) return json({ available: false });
  const read = await readDisabledTools(db as never, userId);
  if (!read.ok) return json({ error: 'read_failed' }, 503);
  return json({ available: true, disabledTools: read.disabledTools });
}

export async function PUT(req: NextRequest) {
  const limited = await checkRateLimit(req, PLUGINS_WRITE_IP);
  if (limited) return limited;
  const userId = await callerId(req);
  if (!userId) return unauthorized();
  const perUser = await checkRateLimitByKey(userId, PLUGINS_WRITE_USER);
  if (perUser) return perUser;

  const text = await req.text().catch(() => '');
  if (text.length > MAX_BODY_CHARS) return json({ error: 'too_large' }, 413);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return json({ error: 'invalid' }, 400);
  }
  const parsed = putSchema.safeParse(raw);
  if (!parsed.success) return json({ error: 'invalid' }, 400);

  const db = serviceDb();
  if (!db || !(await pluginTableReady(db as never))) return unavailable();
  const saved = await writeDisabledTools(db as never, userId, parsed.data.disabledTools);
  if (!saved.ok) return json({ error: 'save_failed' }, 503);
  return json({ available: true, disabledTools: saved.disabledTools });
}
