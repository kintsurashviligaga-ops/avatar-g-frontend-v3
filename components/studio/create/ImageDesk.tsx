'use client';

/**
 * ImageDesk — what the CENTRE column shows in the Image tool on a desktop (ref6's grammar: the form is beside, the result is the
 * page). From the top: the Result pane (the latest picture or batch, the actions, the earlier ones), "Models & prices" (the table that
 * is also the size picker), and the conversation — kept, one tap away, because the thread is where every other tool's output and the
 * history live, and nothing is deleted for the sake of a tidier page.
 *
 * It replaces the greeting-and-chips empty state and the message list while the Image tool is open at ≥ 1024 px; the Create screen
 * itself is the right column (ImageCreatePanel). Below `lg` the sheet and the thread are unchanged.
 */
import { useState, type ReactNode } from 'react';
import { ChevronDown, MessagesSquare } from 'lucide-react';
import type { ImageEngineId, ImgQuality } from '@/lib/studio/imageCreate';
import type { ImageResultView } from '@/lib/studio/imageResults';
import { imageCreateCopy } from './imageCreateCopy';
import { ImageModelsTable } from './ImageModelsTable';
import { ImageResultPane, type ImageResultActions } from './ImageResultPane';

export function ImageDesk({
  locale, results, notice, aspect, quality, onQuality, model, onModel, elapsedSec, capSecFor, actions, busy, upscaling, conversation, messageCount, agentG,
}: {
  locale: string;
  results: readonly ImageResultView[];
  notice: { text: string; topUp: boolean } | null;
  aspect: string;
  quality: ImgQuality;
  onQuality: (q: ImgQuality) => void;
  model?: ImageEngineId;
  onModel?: (id: ImageEngineId) => void;
  elapsedSec: number;
  capSecFor: (quality: string) => number;
  actions: ImageResultActions;
  busy: boolean;
  upscaling: boolean;
  /** The thread's rendered messages (the studio's own list) — shown only when the user opens it. */
  conversation: ReactNode;
  messageCount: number;
  /** Agent G's latest word while the thread is hidden (a reply, a question, a confirmation) — it must be SEEN, not buried in the collapsed thread. */
  agentG?: ReactNode;
}) {
  const c = imageCreateCopy(locale);
  const [open, setOpen] = useState(false);
  return (
    <div data-testid="image-desk" className="min-w-0 space-y-7 px-0.5 pb-2 pt-2">
      {agentG}
      <ImageResultPane locale={locale} results={results} notice={notice} aspect={aspect} elapsedSec={elapsedSec} capSecFor={capSecFor} actions={actions} busy={busy} upscaling={upscaling} />
      <ImageModelsTable locale={locale} quality={quality} onQuality={onQuality} {...(model ? { model } : {})} {...(onModel ? { onModel } : {})} />
      {messageCount > 0 && (
        <section data-testid="image-conversation">
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
            className="flex min-h-[52px] w-full items-center gap-3 rounded-2xl bg-app-elevated/40 px-4 text-left ring-1 ring-app-border/10 transition-colors hover:bg-app-elevated/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60">
            <MessagesSquare size={18} aria-hidden="true" className="shrink-0 text-app-muted" />
            <span className="text-[15px] font-medium text-app-text">{c.conversation}</span>
            <span className="text-[13px] tabular-nums text-app-muted">{messageCount}</span>
            <ChevronDown size={18} aria-hidden="true" className={`ml-auto shrink-0 text-app-muted transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
          {open && <div className="mt-4 space-y-4">{conversation}</div>}
        </section>
      )}
    </div>
  );
}
