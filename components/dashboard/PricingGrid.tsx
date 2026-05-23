'use client';

/**
 * PricingGrid — billing surface composition. Currently hosts the admin-only
 * Founder Production Verification Gate (renders nothing for non-admins), and is
 * the mount point for future public refill tiers. Kept as a thin, reusable
 * component so the billing layout has a single composition root.
 */

import { FounderVerificationGate } from '@/components/dashboard/FounderVerificationGate';

export function PricingGrid({ locale }: { locale: string }) {
  return (
    <div className="space-y-3">
      <FounderVerificationGate locale={locale} />
    </div>
  );
}

export default PricingGrid;
