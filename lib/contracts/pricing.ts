/**
 * lib/contracts/pricing.ts — the PRICING_CONFIG contract (PROJECT_MASTER.md Part 1 §11).
 *
 * What a capability costs at the provider, in USD, per unit. This is the provider-cost table, not the price the user
 * pays: lib/providers/pricing.ts turns a USD cost into credits and GEL (rate × margin), and keeps its own, different
 * `PricingConfig` (the rate and margin). Part 4 "dynamic pricing UI" reads both.
 *
 * validatePricingConfig() is the build-time gate: the real table (Part 4) must pass it in a jest test before it ships.
 */
import { isAgentCapability, type AgentCapability } from './agent';

export const PRICING_UNITS = ['per_request', 'per_second', 'per_image', 'per_character', 'per_10_seconds', 'per_shot', 'free'] as const;
export type PricingUnit = (typeof PRICING_UNITS)[number];

export const PRICING_PROVIDERS = ['google', 'elevenlabs', 'sandbox'] as const;
export type PricingProvider = (typeof PRICING_PROVIDERS)[number];

export type PricingEntry = {
  capability: AgentCapability;
  provider: PricingProvider;
  unit: PricingUnit;
  priceUSD: number;
  enabled: boolean;
  notes?: string;
};

export type PricingConfig = {
  entries: PricingEntry[];
  currency: 'USD';
  updatedAt: string;
};

/** Every problem with a pricing config, as readable lines; [] = valid. */
export function validatePricingConfig(cfg: PricingConfig): string[] {
  const problems: string[] = [];
  if (cfg.currency !== 'USD') problems.push(`currency must be USD, got ${String(cfg.currency)}`);
  if (!cfg.updatedAt || Number.isNaN(Date.parse(cfg.updatedAt))) problems.push('updatedAt must be an ISO date');
  const seen = new Set<string>();
  cfg.entries.forEach((e, i) => {
    const at = `entry ${i} (${String(e.capability)}/${String(e.provider)})`;
    if (!isAgentCapability(e.capability)) problems.push(`${at}: unknown capability`);
    if (!(PRICING_PROVIDERS as readonly string[]).includes(e.provider)) problems.push(`${at}: provider not allowed (Section A)`);
    if (!(PRICING_UNITS as readonly string[]).includes(e.unit)) problems.push(`${at}: unknown unit ${String(e.unit)}`);
    if (!Number.isFinite(e.priceUSD) || e.priceUSD < 0) problems.push(`${at}: priceUSD must be a number ≥ 0`);
    else if (e.unit === 'free' && e.priceUSD !== 0) problems.push(`${at}: a free unit must cost 0`);
    else if (e.unit !== 'free' && e.enabled && e.priceUSD === 0) problems.push(`${at}: an enabled paid unit costs 0 (use unit "free")`);
    const key = `${e.capability}|${e.provider}|${e.unit}`;
    if (seen.has(key)) problems.push(`${at}: duplicate ${e.unit} price`);
    seen.add(key);
  });
  return problems;
}
