import { DubbingStudio } from '@/components/studio/DubbingStudio';

export const metadata = {
  title: 'Dubbing Studio',
  description: 'Translate and re-voice a video in another language, on the original timing',
};

type DubbingPageProps = { params: Promise<{ locale: string }> };

export default async function DubbingPage({ params }: DubbingPageProps) {
  const { locale } = await params;
  return <DubbingStudio locale={locale} />;
}
