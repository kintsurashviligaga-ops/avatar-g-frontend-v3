'use client';

/**
 * Art Director recipe card (Phase 8.4 PR C): what a Library picture was made with — prompt, model, style, ratio and
 * size, seed (best effort), references by letter, price, and the "rest kept identical" proof of a region edit — plus
 * PNG and JPG downloads. Read from /api/image/art-director/recipe; nothing is generated or charged.
 */
import { useEffect, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { recipeRows, type ArtLibraryMeta } from '@/lib/image/artDirector/library';
import { artLabel, type Lang } from '@/lib/image/artDirector/labels';

const T = {
  title: { ka: 'რეცეპტი', en: 'Recipe', ru: 'Рецепт' },
  missing: { ka: 'რეცეპტი ვერ მოიძებნა.', en: 'No recipe was found for this picture.', ru: 'Рецепт не найден.' },
} as const;

export const artDownloadHref = (path: string, format: 'png' | 'jpg') =>
  `/api/image/art-director/download?path=${encodeURIComponent(path)}&format=${format}`;

export function RecipeCard({ path, lang, fetcher = fetch }: { path: string; lang: Lang; fetcher?: typeof fetch }) {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'ok'; recipe: ArtLibraryMeta } | { status: 'missing' }>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const res = await fetcher(`/api/image/art-director/recipe?path=${encodeURIComponent(path)}`, { credentials: 'include' });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; recipe?: ArtLibraryMeta };
        if (live) setState(res.ok && j.ok && j.recipe ? { status: 'ok', recipe: j.recipe } : { status: 'missing' });
      } catch {
        if (live) setState({ status: 'missing' });
      }
    })();
    return () => { live = false; };
  }, [path, fetcher]);

  const btn = 'inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-app-elevated px-3 text-[12px] text-app-text ring-1 ring-app-border/15 transition hover:text-app-accent';
  return (
    <section data-testid="art-recipe" className="rounded-xl border border-app-border/15 bg-app-elevated/45 p-3 text-[12.5px]">
      <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-app-muted">{T.title[lang]}</h4>
      {state.status === 'loading' ? <Loader2 size={15} className="animate-spin text-app-muted" aria-label="…" /> : null}
      {state.status === 'missing' ? <p data-testid="art-recipe-missing" className="text-app-muted">{T.missing[lang]}</p> : null}
      {state.status === 'ok' ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {recipeRows(state.recipe, lang).map((r) => (
            <div key={r.key} className="contents" data-testid={`art-recipe-${r.key}`}>
              <dt className="text-app-muted">{r.label}</dt>
              <dd className="break-words text-app-text">{r.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={artDownloadHref(path, 'png')} download data-testid="art-recipe-png" className={btn}><Download size={13} aria-hidden="true" /> {artLabel('download', lang)} PNG</a>
        <a href={artDownloadHref(path, 'jpg')} download data-testid="art-recipe-jpg" className={btn}><Download size={13} aria-hidden="true" /> {artLabel('download', lang)} JPG</a>
      </div>
    </section>
  );
}
