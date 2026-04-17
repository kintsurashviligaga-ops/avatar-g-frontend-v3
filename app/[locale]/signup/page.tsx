'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import AuthScreen from '@/components/auth/AuthScreen';

function SignupForm() {
  const params = useParams<{ locale?: string }>();
  const locale = params?.locale || 'ka';

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
