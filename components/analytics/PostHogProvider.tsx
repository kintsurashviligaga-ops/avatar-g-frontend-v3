'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider, usePostHog } from 'posthog-js/react';
import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { CONSENT_EVENT, analyticsAllowed } from '@/lib/analytics/consent';

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

// PostHog starts only after the visitor chose "Accept all" on the cookie banner (lib/analytics/consent.ts). It used to
// initialise here at module load on every page, before any choice, which broke the banner's promise.
function startPosthog(): void {
  if (typeof window === 'undefined' || !POSTHOG_KEY) return;
  if (posthog.__loaded) {
    posthog.opt_in_capturing();
    return;
  }
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

/** Apply the current consent: start PostHog on "all", stop capturing otherwise. Exported for tests. */
export function applyAnalyticsConsent(allowed: boolean = analyticsAllowed()): void {
  if (typeof window === 'undefined' || !POSTHOG_KEY) return;
  if (allowed) {
    startPosthog();
  } else if (posthog.__loaded) {
    posthog.opt_out_capturing();
  }
}

applyAnalyticsConsent();

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
      if (posthog.__loaded && analyticsAllowed()) ph?.capture('$pageview', { $current_url: window.location.href });
    }
  }, [pathname, searchParams, ph]);

  return null;
}

/** Safe capture — no-op if PostHog not initialized */
function safeCapture(event: string, props?: Record<string, unknown>) {
  try {
    if (typeof window !== 'undefined' && POSTHOG_KEY && posthog.__loaded && analyticsAllowed()) {
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
  /** Track AI generation failure. Accepts ANY error shape — a structured
   *  provider error object must never crash the failure handler itself (the
   *  `error.slice is not a function` regression). Always coerce to a string. */
  generationFailed: (service: string, error: unknown) => {
    const msg =
      typeof error === 'string'
        ? error
        : error instanceof Error
          ? error.message
          : (() => {
              try {
                return JSON.stringify(error);
              } catch {
                return String(error);
              }
            })();
    safeCapture('ai_generation_failed', { service, error_message: msg.slice(0, 200) });
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
  /** Track wallet top-up intent — fired when the GEL refill modal is opened */
  walletTopupClicked: (source: string, balanceGel?: number | null) => {
    safeCapture('wallet_topup_clicked', { source, balance_gel: balanceGel ?? null });
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
      if (typeof window !== 'undefined' && POSTHOG_KEY && posthog.__loaded && analyticsAllowed()) {
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

function ConsentListener() {
  useEffect(() => {
    const onConsent = (e: Event) => applyAnalyticsConsent(Boolean((e as CustomEvent<{ allowed?: boolean }>).detail?.allowed));
    window.addEventListener(CONSENT_EVENT, onConsent);
    return () => window.removeEventListener(CONSENT_EVENT, onConsent);
  }, []);
  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  if (!POSTHOG_KEY) {
    // No PostHog key configured — skip provider, render children directly
    return <>{children}</>;
  }

  return (
    <PHProvider client={posthog}>
      <ConsentListener />
      <Suspense fallback={null}>
        <PageViewTracker />
      </Suspense>
      {children}
    </PHProvider>
  );
}
