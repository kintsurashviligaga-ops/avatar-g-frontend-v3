import { z } from 'zod';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const MeteringEventSchema = z.object({
  user_id: z.string().uuid(),
  org_id: z.string().uuid().nullable().optional(),
  service_id: z.string().min(1),
  route: z.string().min(1),
  units: z.number().nonnegative(),
  event_type: z.enum(['api_call', 'job_enqueue', 'job_execution', 'tokens', 'storage_output']),
  metadata: z.record(z.unknown()).optional(),
  timestamp: z.string().datetime().optional(),
});

export type MeteringEventInput = z.infer<typeof MeteringEventSchema>;

export async function recordMeteringEvent(input: MeteringEventInput): Promise<void> {
  const parsed = MeteringEventSchema.parse(input);
  const supabase = createServiceRoleClient();

  await supabase.from('usage_meter_events').insert({
    user_id: parsed.user_id,
    org_id: parsed.org_id ?? null,
    service_id: parsed.service_id,
    route: parsed.route,
    units: parsed.units,
    event_type: parsed.event_type,
    metadata: parsed.metadata ?? {},
    created_at: parsed.timestamp ?? new Date().toISOString(),
  });
}

type UsageRange = 'day' | 'week' | 'month';

export function getRangeStart(range: UsageRange): string {
  const now = new Date();
  const from = new Date(now);
  if (range === 'day') from.setDate(now.getDate() - 1);
  if (range === 'week') from.setDate(now.getDate() - 7);
  if (range === 'month') from.setDate(now.getDate() - 30);
  return from.toISOString();
}

export async function getAggregatedUsage(params: {
  userId: string;
  orgId?: string | null;
  range: UsageRange;
}) {
  const supabase = createServiceRoleClient();
  const start = getRangeStart(params.range);

  let query = supabase
    .from('usage_meter_events')
    .select('event_type,service_id,route,units,created_at,metadata,org_id')
    .eq('user_id', params.userId)
    .gte('created_at', start)
    .order('created_at', { ascending: false });

  if (params.orgId) {
    query = query.eq('org_id', params.orgId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const totalsByType: Record<string, number> = {};
  const totalsByService: Record<string, number> = {};
  const totalsByRoute: Record<string, number> = {};

  for (const row of rows) {
    const units = Number(row.units ?? 0);
    totalsByType[row.event_type] = (totalsByType[row.event_type] ?? 0) + units;
    totalsByService[row.service_id] = (totalsByService[row.service_id] ?? 0) + units;
    totalsByRoute[row.route] = (totalsByRoute[row.route] ?? 0) + units;
  }

  return {
    range: params.range,
    from: start,
    total_events: rows.length,
    totals_by_type: totalsByType,
    totals_by_service: totalsByService,
    totals_by_route: totalsByRoute,
    rows,
  };
}

export function usageRowsToCsv(rows: Array<Record<string, unknown>>): string {
  const header = ['created_at', 'user_id', 'org_id', 'service_id', 'route', 'event_type', 'units', 'metadata'];
  const lines = [header.join(',')];

  for (const row of rows) {
    lines.push([
      String(row.created_at ?? ''),
      String(row.user_id ?? ''),
      String(row.org_id ?? ''),
      String(row.service_id ?? ''),
      String(row.route ?? ''),
      String(row.event_type ?? ''),
      String(row.units ?? 0),
      JSON.stringify(row.metadata ?? {}).replaceAll('"', '""'),
    ].map((value) => `"${value}"`).join(','));
  }

  return lines.join('\n');
}
