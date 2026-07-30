import { MontageStudio } from '@/components/studio/MontageStudio';

export const metadata = {
  title: 'Montage Studio',
  description: 'Cut several shots into one edited video',
};

// BUILD MEMORY — see the note in app/[locale]/3d/page.tsx. Pure client form; nothing to prerender.
export const dynamic = 'force-dynamic';

type MontagePageProps = { params: Promise<{ locale: string }> };

export default async function MontagePage({ params }: MontagePageProps) {
  const { locale } = await params;
  return <MontageStudio locale={locale} />;
}
