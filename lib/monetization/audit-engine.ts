/**
 * lib/monetization/audit-engine.ts
 * =================================
 * Founder-only financial audit engine.
 *
 * Two layers:
 *
 *   1. Server-side aggregation against agent_evolution_traces (canonical):
 *      runFounderAudit() invokes the `founder_financial_audit` Postgres RPC
 *      and returns wholesale spend, retail inflows, net margin, and the
 *      margin multiplier (target 3.5x–4.0x).
 *
 *   2. Per-action unit-cost math (forecast / live preview):
 *      forecastMarginForAction() applies the published GEL_COST_WHOLESALE
 *      matrix below to estimate the margin on a single worker-agent
 *      invocation, useful for live UI hints and the chat-side audit reply
 *      when the trace table is still warming up.
 *
 * The DB RPC is restricted to service-role callers (SECURITY DEFINER) and
 * is the authoritative number. The forecast layer is a sanity check.
 */

import 'server-only';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { GEL_COST, type MeteredAction } from '@/lib/billing/gel';

/** Target net-profit-margin band (retail / wholesale). */
export const TARGET_MARGIN_MIN = 3.5;
export const TARGET_MARGIN_MAX = 4.0;

/**
 * Wholesale unit costs (what we pay downstream providers per action) in GEL.
 * Calibrated to keep retail / wholesale ≈ 3.5x at the published GEL_COST.
 * Update whenever provider pricing shifts.
 */
export const GEL_COST_WHOLESALE: Record<MeteredAction, number> = {
  chat: 0.0,           // Gemini / OpenAI tier fits within the free-fallback
  voice_tts: 0.057,    // ElevenLabs ka voice ≈ retail/3.5
  geometry_3d: 0.143,  // RunPod GPU minute average
  video_film: 0.571,   // Replicate film + VEO blend
  avatar: 0.571,       // Avatar-as-video synthesis
};

export interface FounderAuditWindow {
  /** ISO timestamp; defaults to 30 days ago. */
  since?: string;
  /** ISO timestamp; defaults to now. */
  until?: string;
}

export interface FounderAuditResult {
  windowStart: string;
  windowEnd: string;
  wholesaleSpendGel: number;
  retailInflowsGel: number;
  netMarginGel: number;
  /** retail / wholesale. null when wholesale = 0. */
  marginMultiplier: number | null;
  /** Whether the multiplier sits inside the target band. */
  withinTarget: boolean;
  workerRunCount: number;
  uniqueUserCount: number;
}

/**
 * Pull the canonical aggregate from the founder_financial_audit RPC.
 * Throws if the service-role client can't authenticate (env not configured).
 */
export async function runFounderAudit(window: FounderAuditWindow = {}): Promise<FounderAuditResult> {
  const supabase = createServiceRoleClient();

  const sinceIso = window.since ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const untilIso = window.until ?? new Date().toISOString();

  const { data, error } = await supabase.rpc('founder_financial_audit', {
    p_since: sinceIso,
    p_until: untilIso,
  });

  if (error) {
    throw new Error(`audit RPC failed: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;

  const wholesale = Number(row?.wholesale_spend_gel ?? 0);
  const retail = Number(row?.retail_inflows_gel ?? 0);
  const margin = Number(row?.net_margin_gel ?? retail - wholesale);
  const multiplier = wholesale > 0 ? retail / wholesale : null;

  return {
    windowStart: sinceIso,
    windowEnd: untilIso,
    wholesaleSpendGel: wholesale,
    retailInflowsGel: retail,
    netMarginGel: margin,
    marginMultiplier: multiplier,
    withinTarget: multiplier !== null && multiplier >= TARGET_MARGIN_MIN && multiplier <= TARGET_MARGIN_MAX,
    workerRunCount: Number(row?.worker_count ?? 0),
    uniqueUserCount: Number(row?.user_count ?? 0),
  };
}

/** Forecast the margin on a single action without hitting the DB. */
export function forecastMarginForAction(action: MeteredAction): {
  retailGel: number;
  wholesaleGel: number;
  netGel: number;
  multiplier: number | null;
} {
  const retail = GEL_COST[action] ?? 0;
  const wholesale = GEL_COST_WHOLESALE[action] ?? 0;
  return {
    retailGel: retail,
    wholesaleGel: wholesale,
    netGel: retail - wholesale,
    multiplier: wholesale > 0 ? retail / wholesale : null,
  };
}

/** Render an audit result as a markdown block suitable for chat output. */
export function renderAuditAsMarkdown(audit: FounderAuditResult, locale: string = 'en'): string {
  const fmt = (n: number) => `${n.toFixed(2)} ₾`;
  const mult = audit.marginMultiplier === null
    ? '—'
    : `${audit.marginMultiplier.toFixed(2)}×`;
  const target = `${TARGET_MARGIN_MIN}× – ${TARGET_MARGIN_MAX}×`;
  const status = audit.withinTarget
    ? (locale === 'ka' ? '✅ მიზნის ფარგლებში' : locale === 'ru' ? '✅ В целевой полосе' : '✅ within target band')
    : (locale === 'ka' ? '⚠️ მიზნის გარეთ' : locale === 'ru' ? '⚠️ Вне целевой полосы' : '⚠️ outside target band');

  if (locale === 'ka') {
    return [
      `**ფინანსური აუდიტი** (${audit.windowStart.slice(0, 10)} → ${audit.windowEnd.slice(0, 10)})`,
      '',
      `- დაუშვებული ხარჯი: \`${fmt(audit.wholesaleSpendGel)}\``,
      `- რეტეილ შემოსავალი: \`${fmt(audit.retailInflowsGel)}\``,
      `- წმინდა მარჟა: \`${fmt(audit.netMarginGel)}\``,
      `- მარჟის მამრავლი: **${mult}** (სამიზნე: ${target}) — ${status}`,
      `- აგენტის გაშვებები: \`${audit.workerRunCount}\``,
      `- აქტიური მომხმარებლები: \`${audit.uniqueUserCount}\``,
    ].join('\n');
  }
  if (locale === 'ru') {
    return [
      `**Финансовый аудит** (${audit.windowStart.slice(0, 10)} → ${audit.windowEnd.slice(0, 10)})`,
      '',
      `- Оптовые расходы: \`${fmt(audit.wholesaleSpendGel)}\``,
      `- Розничные поступления: \`${fmt(audit.retailInflowsGel)}\``,
      `- Чистая маржа: \`${fmt(audit.netMarginGel)}\``,
      `- Множитель маржи: **${mult}** (цель: ${target}) — ${status}`,
      `- Запусков агентов: \`${audit.workerRunCount}\``,
      `- Уникальных пользователей: \`${audit.uniqueUserCount}\``,
    ].join('\n');
  }
  return [
    `**Founder Financial Audit** (${audit.windowStart.slice(0, 10)} → ${audit.windowEnd.slice(0, 10)})`,
    '',
    `- Wholesale infra spend: \`${fmt(audit.wholesaleSpendGel)}\``,
    `- Retail platform inflows: \`${fmt(audit.retailInflowsGel)}\``,
    `- Net margin: \`${fmt(audit.netMarginGel)}\``,
    `- Margin multiplier: **${mult}** (target: ${target}) — ${status}`,
    `- Worker runs: \`${audit.workerRunCount}\``,
    `- Unique users: \`${audit.uniqueUserCount}\``,
  ].join('\n');
}

/**
 * Quick keyword detector for Founder audit triggers. The chat router checks
 * `isFounderAuditCommand(text)` before doing any RPC work.
 */
const AUDIT_KEYWORDS = [
  /\bsystem(\s+)?audit\b/i,
  /\bfinancial(\s+)report\b/i,
  /\blive\s+platform\s+margin\b/i,
  /სისტემური\s+აუდიტი/i,
  /ფინანსური\s+ხარჯები/i,
  /финансовый\s+аудит/i,
];

export function isFounderAuditCommand(text: string): boolean {
  if (!text) return false;
  return AUDIT_KEYWORDS.some((rx) => rx.test(text));
}

/** Read the comma-separated FOUNDER_USER_IDS env list. */
export function getFounderUserIds(): string[] {
  const raw = process.env.FOUNDER_USER_IDS || process.env.NEXT_PUBLIC_FOUNDER_USER_IDS || '';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export function isFounder(userId: string | null | undefined): boolean {
  if (!userId) return false;
  const founders = getFounderUserIds();
  return founders.includes(userId);
}
