/**
 * GET /api/admin/prices — the Prices tab: per-press prices with cost and profit check (lib/admin/priceSheet, read from
 * the pricing source of truth at request time), the plans, and the top-up packs the checkout sells right now
 * (pricing_tiers when configured, else the built-in defaults).
 */
import { NextResponse } from 'next/server';
import { adminContext } from '@/lib/admin/routeContext';
import { buildPlanRows, buildPriceRows, priceAssumptions } from '@/lib/admin/priceSheet';
import { getTierConfig } from '@/lib/billing/pricingConfig.db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const gate = await adminContext();
  if (!gate.ok) return gate.response;
  const packs = await getTierConfig().catch(() => null);
  return NextResponse.json({
    assumptions: priceAssumptions(),
    services: buildPriceRows(),
    plans: buildPlanRows(),
    packs: packs?.effective ?? [],
    packsFromDefaults: packs?.usingDefaults ?? true,
  });
}
