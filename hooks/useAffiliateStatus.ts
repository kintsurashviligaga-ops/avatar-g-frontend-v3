/**
 * Affiliate Status Hook
 * 
 * Client-side hook for affiliate badge display.
 */

'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@/lib/supabase/browser';

interface AffiliateProfile {
  id: string;
  affiliate_code: string;
  is_active: boolean;
}

export function useAffiliateStatus() {
  const [affiliate, setAffiliate] = useState<AffiliateProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAffiliate = async () => {
      try {
        const supabase = createBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setAffiliate(null);
          return;
        }

        const response = await fetch('/api/affiliate/me');
        if (!response.ok) {
          setAffiliate(null);
          return;
        }
        const data = await response.json();
        setAffiliate(data?.affiliate || null);
      } catch {
        setAffiliate(null);
      } finally {
        setLoading(false);
      }
    };

    fetchAffiliate();
  }, []);

  return {
    affiliate,
    loading,
    isAffiliate: Boolean(affiliate?.id),
    isActive: affiliate?.is_active === true,
  };
}
