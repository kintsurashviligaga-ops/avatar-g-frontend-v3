import { redirect } from 'next/navigation';
import OnboardingWizard from '@/components/onboarding/OnboardingWizard';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function OnboardingPage({ params }: Props) {
  const { locale } = await params;

  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login?redirect=/${locale}/onboarding`);
  }

  // If the user has already completed onboarding (persona row present),
  // skip the wizard and go straight to the dashboard.
  const { data: existing } = await supabase
    .from('avatars')
    .select('id')
    .eq('user_id', user.id)
    .not('name', 'is', null)
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    redirect(`/${locale}/dashboard`);
  }

  return <OnboardingWizard locale={locale} />;
}
