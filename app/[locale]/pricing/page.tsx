'use client';

import { PricingSection } from '@/components/PricingSection';

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-transparent" style={{ color: 'var(--color-text)' }}>
      <div className="pt-8">
        <PricingSection />
      </div>
    </div>
  );
}
