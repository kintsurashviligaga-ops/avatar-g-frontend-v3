'use client';

/**
 * BaseChatComposer — the shared composer primitive (Phase 1.2 consolidation).
 *
 * Two exports cover every chat surface without forcing one visual identity:
 *   • `useComposerTextarea` — the shared mechanics every composer duplicated:
 *     auto-resize, Enter-to-send (Shift+Enter = newline), and the canSend gate.
 *   • `BaseChatComposer` — the dominant glass-card layout (drag zone + textarea +
 *     left/right action slots + header/overlay slots). MyAvatarComposer extends it;
 *     intentional variants (Grok/Imagine/Bottom) keep their chrome but share the hook.
 */

import { useRef, useCallback, useEffect } from 'react';

export interface UseComposerTextareaOptions {
  value: string;
  onSend: () => void;
  disabled?: boolean;
  minHeight?: number;
  maxHeight?: number;
}

export function useComposerTextarea({ value, onSend, disabled, minHeight, maxHeight = 168 }: UseComposerTextareaOptions) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${minHeight ? Math.max(minHeight, next) : next}px`;
  }, [value, minHeight, maxHeight]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !disabled) onSend();
    }
  }, [value, disabled, onSend]);

  const canSend = value.trim().length > 0 && !disabled;
  return { textareaRef, handleKeyDown, canSend };
}

export interface BaseChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  /** Externally-owned ref (parent may own focus/autosize); falls back internally. */
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
  placeholder: string;
  ariaLabel?: string;
  disabled?: boolean;
  minHeight?: number;
  maxHeight?: number;
  /** Absolutely-positioned overlay inside the card (e.g. drag-drop badge). */
  overlay?: React.ReactNode;
  /** Above the textarea (e.g. attachment chip, hidden file input). */
  header?: React.ReactNode;
  leftActions?: React.ReactNode;
  rightActions?: React.ReactNode;
  wrapperClassName?: string;
  onDrop?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave?: (e: React.DragEvent<HTMLDivElement>) => void;
}

export function BaseChatComposer({
  value, onChange, onKeyDown, textareaRef, placeholder, ariaLabel,
  disabled, minHeight = 56, maxHeight = 168,
  overlay, header, leftActions, rightActions, wrapperClassName,
  onDrop, onDragOver, onDragLeave,
}: BaseChatComposerProps) {
  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      className={wrapperClassName ?? 'relative rounded-3xl bg-black border border-white/[0.10] focus-within:border-white/[0.22] overflow-hidden transition flex-shrink-0'}
    >
      {overlay}
      {header}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        disabled={disabled}
        className="w-full flex-shrink-0 bg-transparent border-none outline-none resize-none overflow-y-auto px-4 pt-3.5 pb-2 text-[15px] font-medium leading-relaxed text-white placeholder:text-white/45 placeholder:font-normal [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ minHeight, maxHeight }}
      />
      <div className="flex items-center justify-between px-2 py-1.5">
        <div className="flex items-center gap-1">{leftActions}</div>
        <div className="flex items-center gap-1">{rightActions}</div>
      </div>
    </div>
  );
}
