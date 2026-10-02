'use client';

/**
 * PromptModelCard — Higgsfield's prompt card: a large rounded field ("Describe your concept, scene, or idea") whose bottom
 * row, under a hairline, reads "◎ Model … Auto ▾" and opens the model picker.
 *
 * The prompt is a plain controlled textarea — it IS the tool's prompt (the studio binds it to the same `input` the composer
 * uses). ⚠️ ENTER IS A NEWLINE HERE, never a send: on a phone Return is how a long brief gets its paragraphs, and the page's
 * Generate button is one tap away. Cmd/Ctrl+Enter runs it, for a keyboard.
 *
 * The box grows with its text (min 112 px, max 240 px, then scrolls). Optional round buttons at the top right — the prompt
 * enhancer and dictation — keep the composer's shortcuts reachable where the composer's own text box is not shown.
 */
import { forwardRef, useCallback, useLayoutEffect, useRef, type ReactNode } from 'react';
import { ChevronDown, Loader2, Mic, Square, Wand2 } from 'lucide-react';

export type MicState = 'idle' | 'recording' | 'transcribing';

const MIN_PX = 112;
const MAX_PX = 240;

export const PromptModelCard = forwardRef<HTMLTextAreaElement, {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  /** Cmd/Ctrl+Enter. */
  onSubmit?: () => void;
  /** The "Model" row: its label, the current value and what opens the picker. */
  modelLabel: string;
  modelValue: string;
  modelIcon: ReactNode;
  modelButtonRef?: React.Ref<HTMLButtonElement>;
  modelOpen?: boolean;
  onOpenModel: () => void;
  /** Round shortcuts (shown only when their handler is given). */
  onEnhance?: () => void;
  enhancing?: boolean;
  enhanceLabel?: string;
  onMic?: () => void;
  micState?: MicState;
  micLabels?: { start: string; stop: string; wait: string };
  /** The prompt could not be sent empty: paint the card's ring as a refusal until the user types. */
  invalid?: boolean;
  invalidMessage?: string;
}>(function PromptModelCard({
  value, onChange, placeholder, label, onSubmit, modelLabel, modelValue, modelIcon, modelButtonRef, modelOpen, onOpenModel,
  onEnhance, enhancing = false, enhanceLabel = '', onMic, micState = 'idle', micLabels, invalid = false, invalidMessage,
}, ref) {
  const inner = useRef<HTMLTextAreaElement | null>(null);
  const fit = useCallback(() => {
    const el = inner.current;
    if (!el) return;
    el.style.height = 'auto'; // release the old height, or scrollHeight can only grow
    el.style.height = `${Math.min(MAX_PX, Math.max(MIN_PX, el.scrollHeight))}px`;
    el.style.overflowY = el.scrollHeight > MAX_PX ? 'auto' : 'hidden';
  }, []);
  // Before paint: a prompt that was set from outside (a template's example, dictation) is measured on arrival.
  useLayoutEffect(() => { fit(); }, [fit, value]);

  const hasText = value.trim().length > 0;
  const showEnhance = !!onEnhance && hasText;
  const showMic = !!onMic;
  const round = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 disabled:opacity-40';

  return (
    <div className={`overflow-hidden rounded-3xl bg-app-elevated/60 ring-1 transition-shadow focus-within:ring-2 focus-within:ring-app-accent/40 ${invalid ? 'ring-2 ring-app-danger/60' : 'ring-app-border/10'}`}>
      <div className="relative">
        <textarea
          ref={(node) => {
            inner.current = node;
            if (typeof ref === 'function') ref(node);
            else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
          }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && onSubmit) { e.preventDefault(); onSubmit(); } }}
          placeholder={placeholder}
          aria-label={label}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid && invalidMessage ? 'create-prompt-hint' : undefined}
          rows={3}
          data-testid="create-prompt"
          className={`block w-full resize-none border-0 bg-transparent px-5 pb-3 pt-4 text-[17px] leading-[1.5] text-app-text outline-none placeholder:text-app-muted/70 focus:ring-0 ${showEnhance || showMic ? 'pr-[5.5rem]' : ''}`}
          style={{ minHeight: MIN_PX }}
        />
        {(showEnhance || showMic) && (
          <div className="absolute right-2 top-2 flex items-center gap-1">
            {showEnhance && (
              <button type="button" onClick={onEnhance} disabled={enhancing} aria-label={enhanceLabel} title={enhanceLabel}
                className={`${round} bg-app-text text-app-bg hover:opacity-90`}>
                {enhancing ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <Wand2 size={17} aria-hidden="true" />}
              </button>
            )}
            {showMic && micLabels && (
              <button type="button" onClick={onMic} disabled={micState === 'transcribing'}
                aria-label={micState === 'recording' ? micLabels.stop : micState === 'transcribing' ? micLabels.wait : micLabels.start}
                title={micState === 'recording' ? micLabels.stop : micLabels.start}
                aria-pressed={micState === 'recording'}
                className={`${round} ${micState === 'recording' ? 'animate-pulse bg-app-danger/15 text-app-danger' : 'text-app-muted hover:bg-app-border/10 hover:text-app-text'}`}>
                {micState === 'recording' ? <Square size={15} className="fill-current" aria-hidden="true" />
                  : micState === 'transcribing' ? <Loader2 size={17} className="animate-spin" aria-hidden="true" />
                    : <Mic size={18} aria-hidden="true" />}
              </button>
            )}
          </div>
        )}
      </div>
      {invalid && invalidMessage && <p id="create-prompt-hint" role="alert" className="px-5 pb-2 text-[12.5px] font-medium text-app-danger">{invalidMessage}</p>}
      <button
        ref={modelButtonRef}
        type="button"
        onClick={onOpenModel}
        aria-haspopup="dialog"
        aria-expanded={modelOpen ?? false}
        data-testid="model-row"
        className="flex min-h-[52px] w-full touch-manipulation items-center justify-between gap-3 border-t border-app-border/10 px-5 text-left transition-colors hover:bg-app-elevated/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-app-accent/60"
      >
        <span className="inline-flex min-w-0 items-center gap-2.5 text-[15px] text-app-muted">
          <span className="flex shrink-0 items-center" aria-hidden="true">{modelIcon}</span>
          <span className="truncate">{modelLabel}</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 text-[16px] font-medium text-app-text">
          {modelValue}
          <ChevronDown size={18} aria-hidden="true" className={`text-app-muted transition-transform ${modelOpen ? 'rotate-180' : ''}`} />
        </span>
      </button>
    </div>
  );
});
