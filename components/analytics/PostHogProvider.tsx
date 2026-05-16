'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider, usePostHog } from 'posthog-js/react';
import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

// Initialize PostHog once on client
if (typeof window !== 'undefined' && POSTHOG_KEY && !posthog.__loaded) {
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    capture_pageview: false,    // We manually track for accurate SPA routing
    capture_pageleave: true,
    persistence: 'localStorage+cookie',
    autocapture: false,         // Avoid capturing sensitive form data
    disable_session_recording: true,
    loaded: (ph) => {
      if (process.env.NODE_ENV === 'development') {
        ph.opt_out_capturing(); // Don't pollute analytics with dev events
      }
    },
  });
}

/** Tracks page views on route change — required for Next.js App Router */
function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ph = usePostHog();
  const prevPath = useRef<string>('');

  useEffect(() => {
    const fullPath = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : '');
    if (fullPath !== prevPath.current) {
      prevPath.current = fullPath;
      ph?.capture('$pageview', { $current_url: window.location.href });
    }
  }, [pathname, searchParams, ph]);

  return null;
}

/** Safe capture — no-op if PostHog not initialized */
function safeCapture(event: string, props?: Record<string, unknown>) {
  try {
    if (typeof window !== 'undefined' && POSTHOG_KEY && posthog.__loaded) {
      posthog.capture(event, props);
    }
  } catch { /* never throw from analytics */ }
}

/** Exported analytics helpers — safe no-ops without PostHog key */
export const analytics = {
  /** Track AI generation start */
  generationStarted: (service: string, credits: number) => {
    safeCapture('ai_generation_started', { service, credits_cost: credits });
  },
  /** Track AI generation success */
  generationSuccess: (service: string, credits: number, durationMs?: number) => {
    safeCapture('ai_generation_success', { service, credits_cost: credits, duration_ms: durationMs });
  },
  /** Track AI generation failure */
  generationFailed: (service: string, error: string) => {
    safeCapture('ai_generation_failed', { service, error_message: error.slice(0, 200) });
  },
  /** @deprecated use generationSuccess */
  generation: (service: string, credits: number, success: boolean) => {
    safeCapture('ai_generation', { service, credits, success });
  },
  /** Track pricing page interaction */
  pricingClick: (planId: string, action: 'view' | 'click_cta' | 'checkout_started') => {
    safeCapture('pricing_interaction', { plan_id: planId, action });
  },
  /** Track Stripe checkout started */
  checkoutStarted: (planId: string, billingTier: string) => {
    safeCapture('checkout_started', { plan_id: planId, billing_tier: billingTier });
  },
  /** Track share page view */
  shareView: (kind: string, token: string) => {
    safeCapture('share_page_view', { kind, token });
  },
  /** Track user signup / login */
  auth: (event: 'signup' | 'login' | 'logout') => {
    safeCapture(`user_${event}`);
  },
  /** Track referral code created */
  referralCreated: (code: string) => {
    safeCapture('referral_created', { code });
  },
  /** Track referral code redeemed */
  referralRedeemed: (code: string) => {
    safeCapture('referral_redeemed', { code });
  },
  /** @deprecated use referralCreated/referralRedeemed */
  referral: (action: 'created' | 'redeemed', code?: string) => {
    safeCapture('referral_action', { action, code });
  },
  /** Identify authenticated user */
  identify: (userId: string, props?: Record<string, unknown>) => {
    try {
      if (typeof window !== 'undefined' && POSTHOG_KEY && posthog.__loaded) {
        posthog.identify(userId, props);
      }
    } catch { /* never throw */ }
  },
  /** Track prompt used (truncated for privacy) */
  prompt: (service: string, prompt: string) => {
    safeCapture('prompt_used', { service, prompt_preview: prompt.slice(0, 100) });
  },
  /** Track export/download */
  export: (kind: string, format: string) => {
    safeCapture('media_exported', { kind, format });
  },
  /** Track rate limit hit */
  rateLimitHit: (plan: string) => {
    safeCapture('rate_limit_hit', { plan });
  },
};

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  if (!POSTHOG_KEY) {
    // No PostHog key configured — skip provider, render children directly
    return <>{children}</>;
  }

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PageViewTracker />
      </Suspense>
      {children}
    </PHProvider>
  );
}
