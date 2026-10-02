'use client';

/**
 * AgentGNote — Agent G's latest word, on a screen where the thread is not visible (the Image tool's desktop desk hides it
 * behind a collapsed "Conversation"). Without it a reply to "აქ ხარ?" — or a question, or a confirmation — would sit unseen
 * while the user wonders why nothing happened. It carries the same buttons as the bubble in the thread (AgentGCard), is
 * announced politely to screen readers, and goes away on its own once the user decides, changes tool, or closes it.
 */
import { Sparkle, X } from 'lucide-react';
import { gateButtons } from '@/lib/chat/focusGate';
import { AgentGCard, type AgentGCardState } from './AgentGCard';

export function AgentGNote({
  text, card, locale, stale, onConfirm, onEdit, onDismiss,
}: {
  text: string;
  card?: AgentGCardState | undefined;
  locale: string;
  stale: boolean;
  onConfirm: () => void;
  onEdit: () => void;
  onDismiss: () => void;
}) {
  const b = gateButtons(locale);
  return (
    <section
      data-testid="agent-g-note"
      role="status"
      aria-live="polite"
      className="relative rounded-2xl bg-app-elevated/60 p-4 ring-1 ring-app-border/15"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-app-accent/15 text-app-accent">
          <Sparkle size={15} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] font-semibold uppercase tracking-wide text-app-muted">Agent G</p>
          <p data-testid="agent-g-note-text" className="mt-1 whitespace-pre-wrap break-words text-[14.5px] leading-relaxed text-app-text">{text}</p>
          {card ? <AgentGCard card={card} locale={locale} stale={stale} onConfirm={onConfirm} onEdit={onEdit} /> : null}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={b.dismiss}
          title={b.dismiss}
          data-testid="agent-g-note-close"
          className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
