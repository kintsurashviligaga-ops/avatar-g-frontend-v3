'use client';

/**
 * AgentGCard — the buttons under Agent G's reply when it is NOT generating yet (lib/chat/focusGate).
 *
 *   confirm  "I am ready to create the image: “…” — shall I start?"   [Create ✦ N]  [Edit]
 *   clarify  Agent G asked 2–3 questions; the user may answer in the composer, or    [Create it as it is ✦ N]
 *
 * The price is ON the button (the same quote the panel's own Generate button prints), so the cost is known before the tap.
 * A film's card carries no price on purpose: the charge happens at the storyboard's own Generate, which prints the exact one.
 * Once used (or when the user has left the mode it was made for) the buttons go away — a card is one decision, not a toolbar.
 */
import { Sparkle } from 'lucide-react';
import { creditsLabel } from '@/lib/credits/quote';
import { gateButtons, type GateMode } from '@/lib/chat/focusGate';

export interface AgentGCardState {
  kind: 'clarify' | 'confirm';
  /** The tool this card would run (the focus mode it was made in, or what a chat order asked for). */
  target: GateMode;
  /** Made in plain chat (an order typed there): it stays live while the chat is open, and Create runs `target`. */
  madeIn?: 'chat';
  /** The prompt Agent G will generate from (the user's words, or thin words + their answer). */
  prompt: string;
  /** What pressing the button costs, in credits; 0 = no price on this card. */
  credits: number;
  /** Decided already — the buttons are gone. */
  done?: boolean;
}

export function AgentGCard({
  card, locale, stale, onConfirm, onEdit,
}: {
  card: AgentGCardState;
  locale: string;
  /** The user switched to another mode since: the card no longer applies. */
  stale: boolean;
  onConfirm: () => void;
  onEdit: () => void;
}) {
  if (card.done) return null;
  const b = gateButtons(locale);
  if (stale) {
    return <p className="mt-1 text-[12px] text-app-muted" data-testid="agent-g-stale">{b.stale}</p>;
  }
  const label = card.kind === 'clarify' ? b.asIs : b.create;
  const priced = card.credits > 0;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2" data-testid="agent-g-card" data-kind={card.kind}>
      <button
        type="button"
        onClick={onConfirm}
        data-testid="agent-g-confirm"
        data-price={priced ? card.credits : undefined}
        aria-label={priced ? `${label} — ${creditsLabel(card.credits, locale)}` : label}
        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-app-accent px-4 py-2 text-[12.5px] font-semibold text-app-bg transition-opacity hover:opacity-90"
      >
        <Sparkle size={14} aria-hidden="true" />
        <span>{label}</span>
        {priced ? <span className="tabular-nums" aria-hidden="true">✦ {card.credits}</span> : null}
      </button>
      {card.kind === 'confirm' ? (
        <button
          type="button"
          onClick={onEdit}
          data-testid="agent-g-edit"
          className="inline-flex min-h-[40px] items-center rounded-full border border-app-border/30 px-4 py-2 text-[12.5px] font-medium text-app-text transition-colors hover:bg-app-elevated/60"
        >
          {b.edit}
        </button>
      ) : null}
    </div>
  );
}
