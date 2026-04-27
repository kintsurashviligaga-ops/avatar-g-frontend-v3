import LandingPageClient from '@/components/landing/LandingPageClient';

type LocaleRootPageProps = {
  params: {
    locale: string;
  };
};

export default function LocaleRootPage({ params: _params }: LocaleRootPageProps) {
  return <LandingPageClient />;
}
