/**
 * Financial telemetry constants.
 *
 * BANK_FEE_RATE — the payment-processor / acquiring-bank fee taken off gross wallet top-ups. The platform's
 * native GEL gateway is Bank of Georgia (see lib billing/bog), whose card-acquiring fee is ≈ 2.5%. Kept as a
 * single named constant (overridable via the BANK_FEE_RATE env for the rare re-negotiation) so the admin
 * financials math has one source of truth rather than a magic 0.025 sprinkled across routes.
 */
export const BANK_FEE_RATE: number = (() => {
  const raw = process.env.BANK_FEE_RATE;
  const n = raw != null ? Number(raw) : NaN;
  // Accept a sane fractional rate only (0 ≤ r < 1); otherwise fall back to the 2.5% default.
  return Number.isFinite(n) && n >= 0 && n < 1 ? n : 0.025;
})();
