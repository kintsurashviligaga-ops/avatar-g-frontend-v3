/**
 * Owner price approval for newly priced paid services — the crypto-free half of lib/billing/paidServiceGate, so the
 * client-reachable Agent G prompt (lib/chat/platformPrompt) can ask it without bundling node:crypto. In a browser
 * OWNER_APPROVED_PRICING is undefined, so the answer there is always "not approved" (fail closed).
 */
export type GatedService = 'dubbing' | 'presentation';

/** Is `service` at exactly `price` credits approved by the owner? Pure: reads only `env`. */
export function ownerApprovedPrice(service: GatedService, price: number, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!(price > 0) || !Number.isInteger(price)) return false;
  const raw = (env.OWNER_APPROVED_PRICING ?? '').trim().toLowerCase();
  if (!raw) return false;
  return raw.split(',').some((entry) => {
    const [name, value, extra] = entry.trim().split(':');
    return extra === undefined && name === service && /^\d+$/.test(value ?? '') && Number(value) === price;
  });
}

