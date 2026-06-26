/**
 * lib/admin/stats.ts (PHASE 4 Task 2) — gather admin-dashboard numbers.
 *
 * Every query is FAIL-OPEN (returns 0 / [] on any error or missing table), so the
 * dashboard renders even before all migrations are applied. Reads the historical
 * record (generation_jobs) for generation counts + wallet_topups for revenue.
 * Must be called with the SERVICE-ROLE client (admin-only data).
 */
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

export interface AdminStats {
  totalUsers: number;
  gensToday: number;
  gensWeek: number;
  gensAllTime: number;
  failedGens: number;
  revenueGel: number;
  byService: { kind: string; count: number }[];
  recentSignups: { id: string; created_at: string }[];
  recentGenerations: { id: string; kind: string; user_id: string | null; created_at: string }[];
}

async function count(client: Client, table: string, build?: (q: any) => any): Promise<number> { // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    let q = client.from(table).select('id', { count: 'exact', head: true });
    if (build) q = build(q);
    const { count: c, error } = await q;
    return error || typeof c !== 'number' ? 0 : c;
  } catch { return 0; }
}

export async function gatherAdminStats(client: Client): Promise<AdminStats> {
  const now = Date.now();
  const dayAgo = new Date(now - 86_400_000).toISOString();
  const weekAgo = new Date(now - 7 * 86_400_000).toISOString();
  const SERVICES = ['film', 'avatar', 'image', 'music'] as const;

  const [
    totalUsers, gensToday, gensWeek, gensAllTime, failedGens,
    filmC, avatarC, imageC, musicC,
  ] = await Promise.all([
    count(client, 'profiles'),
    count(client, 'generation_jobs', (q) => q.eq('status', 'completed').gte('created_at', dayAgo)),
    count(client, 'generation_jobs', (q) => q.eq('status', 'completed').gte('created_at', weekAgo)),
    count(client, 'generation_jobs', (q) => q.eq('status', 'completed')),
    count(client, 'generation_jobs', (q) => q.eq('status', 'failed')),
    count(client, 'generation_jobs', (q) => q.eq('status', 'completed').eq('service_type', 'film')),
    count(client, 'generation_jobs', (q) => q.eq('status', 'completed').eq('service_type', 'avatar')),
    count(client, 'generation_jobs', (q) => q.eq('status', 'completed').eq('service_type', 'image')),
    count(client, 'generation_jobs', (q) => q.eq('status', 'completed').eq('service_type', 'music')),
  ]);

  // Revenue = sum of paid GEL top-ups (the real money record). Fail-open → 0.
  let revenueGel = 0;
  try {
    const { data } = await client.from('wallet_topups').select('amount_gel');
    if (Array.isArray(data)) revenueGel = data.reduce((s: number, r: { amount_gel?: number }) => s + (Number(r.amount_gel) || 0), 0);
  } catch { revenueGel = 0; }

  let recentSignups: AdminStats['recentSignups'] = [];
  try {
    const { data } = await client.from('profiles').select('id, created_at').order('created_at', { ascending: false }).limit(10);
    if (Array.isArray(data)) recentSignups = data as AdminStats['recentSignups'];
  } catch { recentSignups = []; }

  let recentGenerations: AdminStats['recentGenerations'] = [];
  try {
    const { data } = await client.from('generation_jobs').select('id, service_type, user_id, created_at').order('created_at', { ascending: false }).limit(20);
    if (Array.isArray(data)) recentGenerations = (data as { id: string; service_type: string; user_id: string | null; created_at: string }[]).map((r) => ({ id: r.id, kind: r.service_type, user_id: r.user_id, created_at: r.created_at }));
  } catch { recentGenerations = []; }

  const byService = [
    { kind: 'film', count: filmC }, { kind: 'avatar', count: avatarC },
    { kind: 'image', count: imageC }, { kind: 'music', count: musicC },
  ].sort((a, b) => b.count - a.count);
  void SERVICES;

  return { totalUsers, gensToday, gensWeek, gensAllTime, failedGens, revenueGel, byService, recentSignups, recentGenerations };
}
