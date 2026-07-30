import { SlidesStudio } from '@/components/studio/SlidesStudio';

export const metadata = {
  title: 'Presentation Studio',
  description: 'Turn a topic into a finished slide deck',
};

// BUILD MEMORY — see the note in app/[locale]/3d/page.tsx. Pure client form; nothing to prerender.
export const dynamic = 'force-dynamic';

type SlidesPageProps = { params: Promise<{ locale: string }> };

export default async function SlidesPage({ params }: SlidesPageProps) {
  const { locale } = await params;
  return <SlidesStudio locale={locale} />;
}
