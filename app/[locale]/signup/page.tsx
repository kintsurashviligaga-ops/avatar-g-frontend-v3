'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import AuthScreen from '@/components/auth/AuthScreen';

function SignupForm() {
  const params = useParams<{ locale?: string }>();
  const locale = params?.locale || 'ka';
  const search = useSearchParams();

  /**
   * ⚠️ THE HIGHEST-INTENT CLICK IN THE FUNNEL WAS BEING THROWN AWAY. PricingSection links here as
   * `/{locale}/signup?plan=pro` — someone who has read the tiers and CHOSEN one — and this page read
   * only the locale. They registered and landed in the dashboard with no plan, no checkout, and nothing
   * remembering they were mid-purchase. Stashing it lets the app pick the thread back up after the
   * account exists; sessionStorage rather than a URL because the auth flow navigates several times and
   * the query string does not survive it.
   */
  useEffect(() => {
    const plan = search?.get('plan');
    if (plan) { try { sessionStorage.setItem('myavatar:intended-plan', plan); } catch { /* private mode */ } }
  }, [search]);

  return <AuthScreen mode="signup" locale={locale} />;
}

export default function LocaleSignupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-transparent">
        <div className="text-white/40 text-sm">Loading...</div>
      </div>
    }>
      <SignupForm />
    </Suspense>
  );
}
