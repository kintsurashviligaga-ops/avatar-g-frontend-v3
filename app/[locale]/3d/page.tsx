import { Model3dStudio } from '@/components/studio/Model3dStudio';

export const metadata = {
  title: '3D Studio',
  description: 'Turn text or a photo into a 3D model',
};

type Model3dPageProps = { params: Promise<{ locale: string }> };

export default async function Model3dPage({ params }: Model3dPageProps) {
  const { locale } = await params;
  return <Model3dStudio locale={locale} />;
}
