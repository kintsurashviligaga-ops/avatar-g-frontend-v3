/**
 * lib/billing/margin/flags.ts — Phase 8.1 switches. Both default OFF, so merging the code changes nothing on myavatar.ge.
 *   ADMIN_FINANCE_DASHBOARD=on      shows the Finance tab in /admin and opens GET /api/admin/finance-v8 (admins only either way)
 *   NEXT_PUBLIC_PRICING_V8=on       shows the proposed v8 plans and per-action prices on /pricing
 */
const on = (v: string | undefined) => v === 'on' || v === '1' || v === 'true';

export const financeDashboardOn = (env: Record<string, string | undefined> = process.env) => on(env.ADMIN_FINANCE_DASHBOARD);
export const pricingV8On = (env: Record<string, string | undefined> = process.env) => on(env.NEXT_PUBLIC_PRICING_V8);
