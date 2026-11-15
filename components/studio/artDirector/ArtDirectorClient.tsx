'use client';

/** Client shell for the admin Art Director preview: wires the shared uploader (signed upload to the user's own folder). */
import { ArtDirectorPanel } from './ArtDirectorPanel';
import { uploadFileToStorage } from '@/components/studio/ui/useUpload';
import type { Lang } from '@/lib/image/artDirector/labels';

export function ArtDirectorClient({ lang }: { lang: Lang }) {
  return (
    <ArtDirectorPanel lang={lang} upload={async (f) => {
      const r = await uploadFileToStorage(f);
      return 'path' in r ? { path: r.path } : { error: r.error };
    }} />
  );
}
