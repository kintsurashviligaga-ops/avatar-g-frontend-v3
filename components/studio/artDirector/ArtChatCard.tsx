'use client';

/**
 * The Art Director's result in a chat bubble (Phase 8.4 PR C): the variation grid with Upscale (Re-render), Edit (the
 * brush), Vary, Use as base and PNG/JPG on each tile. Every press goes back to the chat as a new Art Director request
 * (`onRun`), so it gets its own bubble, price and charge. The card itself never calls the route.
 */
import { useState } from 'react';
import { VariationGrid, type TileAction } from './VariationGrid';
import { MaskBrush, type MaskSubmit } from './MaskBrush';
import type { Uploader } from './ArtDirectorPanel';
import { artDownloadHref } from './RecipeCard';
import { ratioValue, type ArtSize } from '@/lib/image/artDirector/spec';
import type { ArtChatRequest, ArtChatState, ArtChatTile } from '@/lib/image/artDirector/chat';
import type { Lang } from '@/lib/image/artDirector/labels';

const T = {
  error: { ka: 'ვერ შეიქმნა. ჩამოჭრა არ მომხდარა.', en: 'Could not create it. Nothing was charged.', ru: 'Не удалось. Ничего не списано.' },
  notSold: { ka: 'ეს ზომა ჯერ არ იყიდება.', en: 'This size is not on sale yet.', ru: 'Этот размер пока не продаётся.' },
  base: { ka: 'შემდეგი ცვლილება ამ სურათზე მოხდება.', en: 'Your next change applies to this picture.', ru: 'Следующее изменение — для этой картинки.' },
} as const;

export function ArtChatCard({ state, lang, prices, upload, onRun, onPickBase, picked }: {
  state: ArtChatState;
  lang: Lang;
  prices: Partial<Record<ArtSize, number | null>>;
  upload: Uploader;
  onRun: (request: ArtChatRequest) => void;
  onPickBase: (tile: ArtChatTile) => void;
  /** The tile path the next chat edit targets, when the user picked one on this card. */
  picked?: string | null;
}) {
  const [editing, setEditing] = useState<ArtChatTile | null>(null);
  const [failed, setFailed] = useState(false);
  const req = state.request;
  const ratio = req.operation === 'generate' || req.operation === 'extend' ? ratioValue(req.aspectRatio) : 1;
  // A follow-up press never carries the parent's mask or a stale base.
  const derived = (over: Partial<ArtChatRequest>): ArtChatRequest => {
    const { maskPath: _m, basePath: _b, ...rest } = req;
    void _m; void _b;
    return { ...rest, references: [], keepRest: true, ...over };
  };

  function onAction(index: number, action: TileAction) {
    const t = state.tiles.find((x) => x.index === index);
    if (action === 'retry') { onRun(derived({ count: 1 })); return; }
    if (!t?.path) return;
    if (action === 'upscale2K' || action === 'upscale4K') onRun(derived({ operation: 'upscale', prompt: '', basePath: t.path, size: action === 'upscale2K' ? '2K' : '4K', count: 1, aspectRatio: '1:1' }));
    else if (action === 'vary') onRun(derived({ operation: 'vary', prompt: req.prompt || 'variation', basePath: t.path, count: 1, aspectRatio: '1:1' }));
    else if (action === 'edit') setEditing(t);
    else if (action === 'base') onPickBase(t);
    else if (action === 'png' || action === 'jpg') {
      const a = document.createElement('a');
      a.href = artDownloadHref(t.path, action);
      a.download = '';
      a.click();
    }
  }

  async function onMask(m: MaskSubmit) {
    const t = editing;
    setEditing(null);
    if (!t?.path) return;
    if (!m.mask) { onRun(derived({ operation: 'edit', prompt: m.prompt, basePath: t.path, count: 1, aspectRatio: '1:1' })); return; }
    const up = await upload(new File([m.mask], 'mask.png', { type: 'image/png' }));
    if (!('path' in up)) { setFailed(true); return; }
    onRun(derived({ operation: 'mask_edit', prompt: m.prompt, basePath: t.path, maskPath: up.path, count: 1, aspectRatio: '1:1', keepRest: m.keepRest }));
  }

  return (
    <div data-testid="art-chat-card">
      <VariationGrid tiles={state.tiles.map((t) => ({ index: t.index, status: t.status, url: t.url, id: t.id, charged: t.charged, refunded: t.refunded }))}
        lang={lang} prices={prices} onAction={onAction} ratio={ratio} />
      {picked && state.tiles.some((t) => t.path === picked) ? <p data-testid="art-chat-picked" className="mt-1 text-[12px] text-app-muted">✓ {T.base[lang]}</p> : null}
      {state.error || failed ? <p role="alert" data-testid="art-chat-error" className="mt-2 text-[13px] text-red-400">{state.error === 'size_not_sold' ? T.notSold[lang] : T.error[lang]}</p> : null}
      {editing?.url ? (
        <div className="mt-3">
          <MaskBrush imageUrl={editing.url} width={editing.width ?? 1024} height={editing.height ?? 1024} lang={lang}
            price={prices[req.size] ?? null} onSubmit={(m) => void onMask(m)} onCancel={() => setEditing(null)} />
        </div>
      ) : null}
    </div>
  );
}
