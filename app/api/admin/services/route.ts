/**
 * /api/admin/services — the admin's service switches (lib/server/serviceSwitches).
 *   GET  → every switchable studio tool with its catalog name and whether it is on.
 *   POST → { tool, enabled } switches one tool; the server refuses its generations within ~30 s on every instance.
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminContext, isUuid } from '@/lib/admin/routeContext';
import { SWITCHABLE_TOOLS, disabledServices, isSwitchableTool, setServiceEnabled } from '@/lib/server/serviceSwitches';
import { TOOL_META } from '@/lib/studio/tools';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const gate = await adminContext();
  if (!gate.ok) return gate.response;
  const off = new Set(await disabledServices());
  return NextResponse.json({
    services: SWITCHABLE_TOOLS.map((tool) => ({
      tool,
      label: { ka: TOOL_META[tool]?.name.ka ?? tool, en: TOOL_META[tool]?.name.en ?? tool },
      enabled: !off.has(tool),
    })),
  });
}

export async function POST(req: NextRequest) {
  const gate = await adminContext();
  if (!gate.ok) return gate.response;
  const body = (await req.json().catch(() => ({}))) as { tool?: unknown; enabled?: unknown };
  if (!isSwitchableTool(body.tool)) return NextResponse.json({ error: 'unknown_tool' }, { status: 400 });
  if (typeof body.enabled !== 'boolean') return NextResponse.json({ error: 'invalid_enabled' }, { status: 400 });
  const result = await setServiceEnabled(body.tool, body.enabled, isUuid(gate.actorId) ? gate.actorId : null);
  if (!result.ok) return NextResponse.json({ error: result.error ?? 'write_failed' }, { status: 500 });
  console.info(JSON.stringify({ ops_marker: 'admin_service_switch', actor: gate.actorId, tool: body.tool, enabled: body.enabled }));
  return NextResponse.json({ ok: true });
}
