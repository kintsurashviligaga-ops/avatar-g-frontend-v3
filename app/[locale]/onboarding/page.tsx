import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ locale: string }>;
};

/**
 * /{locale}/onboarding — kept only so an old bookmark lands somewhere useful.
 *
 * The page used to render an avatar-naming wizard that no screen linked to. It was English only, its three voices were
 * ElevenLabs ids that /api/elevenlabs/tts refuses (google_only), and its „Play" read JSON from a route that answers MP3,
 * so every preview failed. First-run onboarding is WelcomeOnboarding, shown inside the chat (ChatChrome), so this path
 * now opens the dashboard, where that welcome appears for a new account.
 */
export default async function OnboardingPage({ params }: Props) {
  const { locale } = await params;
  redirect(`/${locale}/dashboard`);
}
