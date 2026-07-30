import { Model3dStudio } from '@/components/studio/Model3dStudio';

export const metadata = {
  title: '3D Studio',
  description: 'Turn text or a photo into a 3D model',
};

// BUILD MEMORY: this page is a pure client form — prerendering it for every locale renders the whole
// studio at build time for output nobody can cache, and the static pass is what pushes `next build` into
// the container's OOM killer. Rendering on request costs nothing here; there is no SEO value in a
// signed-in tool.
export const dynamic = 'force-dynamic';

type Model3dPageProps = { params: Promise<{ locale: string }> };

export default async function Model3dPage({ params }: Model3dPageProps) {
  const { locale } = await params;
  return <Model3dStudio locale={locale} />;
}
