'use client';

/**
 * ArtDirectorPanel (Phase 8.4) — the whole Art Director in one card: prompt, reference tray A–N, control panel, the
 * variation grid, and the brush editor. Talks only to /api/image/art-director (404 unless IMAGE_ART_DIRECTOR allows the
 * user). Every press shows its price on the button first; the server charges only images that arrive.
 */
import { useMemo, useState } from 'react';
import { ControlPanel, DEFAULT_ART_SETTINGS, type ArtSettings } from './ControlPanel';
import { ReferenceTray, type TrayRef } from './ReferenceTray';
import { VariationGrid, type GridTile, type TileAction } from './VariationGrid';
import { MaskBrush, type MaskSubmit } from './MaskBrush';
import { artBook, imageCredits, sizesFor } from '@/lib/image/artDirector/price';
import { ratioValue, type ArtSize } from '@/lib/image/artDirector/spec';
import type { Lang } from '@/lib/image/artDirector/labels';
import type { ArtOperation } from '@/lib/image/artDirector/prompt';

export interface ArtSlot { index: number; status: 'done' | 'failed'; id?: string; url?: string; path?: string; charged: number; refunded: number; meta?: { width: number; height: number } }
export type Uploader = (file: File) => Promise<{ path: string } | { error: string }>;

const T = {
  placeholder: { ka: 'აღწერე სურათი… ან დაწერე რა შეიცვალოს', en: 'Describe the picture… or say what to change', ru: 'Опишите изображение… или что изменить' },
  create: { ka: 'შექმნა', en: 'Create', ru: 'Создать' },
  busy: { ka: 'იხატება…', en: 'Drawing…', ru: 'Рисуется…' },
  base: { ka: 'საფუძველი', en: 'Base', ru: 'Основа' },
  error: { ka: 'ვერ შეიქმნა. ჩამოჭრა არ მომხდარა.', en: 'Could not create it. Nothing was charged.', ru: 'Не удалось. Ничего не списано.' },
} as const;

export function ArtDirectorPanel({ lang, upload, fetcher = fetch }: { lang: Lang; upload: Uploader; fetcher?: typeof fetch }) {
  const book = artBook();
  const sizes = useMemo(() => sizesFor(book), [book]);
  const [prompt, setPrompt] = useState('');
  const [settings, setSettings] = useState<ArtSettings>(DEFAULT_ART_SETTINGS);
  const [refs, setRefs] = useState<TrayRef[]>([]);
  const [tiles, setTiles] = useState<GridTile[]>([]);
  const [slots, setSlots] = useState<ArtSlot[]>([]);
  const [base, setBase] = useState<ArtSlot | null>(null);
  const [editing, setEditing] = useState<ArtSlot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const price = (size: ArtSize) => imageCredits({ size, references: refs.length, book });
  const prices = { '2K': sizes.includes('2K') ? price('2K') : null, '4K': sizes.includes('4K') ? price('4K') : null };

  async function run(operation: ArtOperation, extra: { basePath?: string; maskPath?: string; size?: ArtSize; count?: 1 | 2 | 4; prompt?: string; keepRest?: boolean } = {}) {
    const count = extra.count ?? (operation === 'generate' || operation === 'vary' ? settings.count : 1);
    setBusy(true);
    setError(null);
    setTiles(Array.from({ length: count }, (_, index) => ({ index, status: 'working' as const })));
    try {
      const res = await fetcher('/api/image/art-director', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          v: 1, operation, prompt: extra.prompt ?? prompt, locale: lang,
          references: refs.map((r) => ({ path: r.path, role: r.role, locked: r.locked, ...(r.note ? { note: r.note } : {}) })),
          ...(extra.basePath ? { basePath: extra.basePath } : {}), ...(extra.maskPath ? { maskPath: extra.maskPath } : {}),
          keepRest: extra.keepRest ?? true, aspectRatio: settings.aspectRatio, size: extra.size ?? settings.size, count,
          styleId: settings.styleId, avoid: settings.avoid, seed: settings.seed,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; slots?: ArtSlot[]; message?: string };
      if (!res.ok || !j.ok || !j.slots) throw new Error(j.message || 'failed');
      setSlots(j.slots);
      setTiles(j.slots.map((s) => ({ index: s.index, status: s.status, url: s.url, id: s.id, charged: s.charged, refunded: s.refunded })));
    } catch {
      setTiles([]);
      setError(T.error[lang]);
    } finally {
      setBusy(false);
    }
  }

  async function addRefs(files: File[]) {
    setBusy(true);
    const added: TrayRef[] = [];
    for (const f of files) {
      const r = await upload(f);
      if ('path' in r) added.push({ path: r.path, previewUrl: typeof URL.createObjectURL === 'function' ? URL.createObjectURL(f) : '', role: 'object', locked: false });
    }
    setRefs((cur) => [...cur, ...added].slice(0, 14));
    setBusy(false);
  }

  function onAction(index: number, action: TileAction) {
    const s = slots.find((x) => x.index === index);
    if (!s?.path) { if (action === 'retry') void run('generate', { count: 1 }); return; }
    if (action === 'upscale2K' || action === 'upscale4K') void run('upscale', { basePath: s.path, size: action === 'upscale2K' ? '2K' : '4K', prompt: '' });
    else if (action === 'vary') void run('vary', { basePath: s.path, count: 1, prompt: prompt || 'variation' });
    else if (action === 'edit') setEditing(s);
    else if (action === 'base') setBase(s);
    else if (action === 'png' || action === 'jpg') {
      const a = document.createElement('a');
      a.href = `/api/image/art-director/download?path=${encodeURIComponent(s.path)}&format=${action}`;
      a.download = '';
      a.click();
    }
  }

  async function onMask(m: MaskSubmit) {
    if (!editing?.path) return;
    const basePath = editing.path;
    setEditing(null);
    if (!m.mask) { void run('edit', { basePath, prompt: m.prompt }); return; }
    const up = await upload(new File([m.mask], 'mask.png', { type: 'image/png' }));
    if (!('path' in up)) { setError(T.error[lang]); return; }
    void run('mask_edit', { basePath, maskPath: up.path, prompt: m.prompt, keepRest: m.keepRest });
  }

  const per = price(settings.size);
  const pressCount = base ? 1 : settings.count;
  return (
    <section data-testid="art-director" className="mx-auto w-full max-w-[44rem] space-y-3 px-4">
      <ReferenceTray refs={refs} onChange={setRefs} onAdd={(f) => void addRefs(f)} lang={lang} busy={busy} />
      {base ? <p className="text-[12px] text-app-muted">{T.base[lang]}: ✓ <button type="button" onClick={() => setBase(null)} className="underline">✕</button></p> : null}
      <div className="flex items-end gap-2">
        <textarea data-testid="art-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2} placeholder={T.placeholder[lang]}
          className="min-h-[52px] flex-1 resize-none rounded-2xl border border-app-border/25 bg-app-elevated/45 px-4 py-3 text-[15px] text-app-text" />
        <button type="button" data-testid="art-create" disabled={busy || !prompt.trim() || per == null}
          onClick={() => void (base ? run('edit', { basePath: base.path }) : run('generate'))}
          className="inline-flex min-h-[52px] items-center rounded-2xl bg-app-accent px-5 text-[14px] font-semibold text-app-bg disabled:opacity-50">
          {busy ? T.busy[lang] : `${T.create[lang]} ✦${(per ?? 0) * pressCount}`}
        </button>
      </div>
      <ControlPanel value={settings} onChange={setSettings} book={book} references={refs.length} lang={lang} sizes={sizes} />
      {error ? <p role="alert" data-testid="art-error" className="text-[13px] text-red-400">{error}</p> : null}
      {editing?.url ? (
        <MaskBrush imageUrl={editing.url} width={editing.meta?.width ?? 1024} height={editing.meta?.height ?? 1024} lang={lang}
          price={price(settings.size)} onSubmit={(m) => void onMask(m)} onCancel={() => setEditing(null)} />
      ) : null}
      {tiles.length ? <VariationGrid tiles={tiles} lang={lang} prices={prices} onAction={onAction} ratio={ratioValue(settings.aspectRatio)} /> : null}
    </section>
  );
}
