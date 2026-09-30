'use client';

/**
 * UnifiedComposer — the Gemini-style input pill, render only. It owns no message state and no send logic:
 * the text, the submit, the attachments (`useAttachments`) and the dictation (`useDictation`) all come in as
 * props, so it can replace OmniStudio's composer markup (:8546-8919) without moving `send()` or its routing
 * precedence.
 *
 *   [attachment chips…]
 *   [textarea — grows to ~8 lines, then scrolls]
 *   [+] [tool chip]              [extra] [mic] [ONE slot]
 *
 * ⚠️ THE TRAILING SLOT IS ONE SLOT, AND tests/landing.spec.ts ASSERTS IT. With nothing to send it holds Live
 * („ცოცხალი ხმა"); with text or an attachment it holds Send (named by `labels.send`, e.g. „ვიდეოს შექმნა");
 * while `busy` it holds Stop. The composer never shows two primary actions side by side. `canSubmit` lets the
 * parent say what counts as "something to send" (a generative tool needs text; chat takes a file alone).
 *
 * ⚠️ THE MIC IS NOT IN THE SLOT. It sits beside it, so dictating a follow-up works while a reply streams and
 * Stop (for the reply) stays reachable at the same time — OmniStudio learned this the hard way (:8827).
 *
 * ⚠️ ENTER DURING IME COMPOSITION MUST NOT SEND. Enter is how a Japanese/Chinese/Korean IME (and some Georgian
 * layouts on Android) COMMITS the composed text; sending on it sends half a word. `isComposing`, a composition
 * ref, and keyCode 229 (Safari fires the committing keydown after `compositionend`, with isComposing false)
 * are all checked.
 *
 * Enter sends, Shift+Enter is a newline. Every control is at least 44 px. Labels come in ka/en/ru.
 */

import {
  forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState,
} from 'react';
import type {
  ChangeEvent, KeyboardEvent as ReactKeyboardEvent, MutableRefObject, ReactNode, Ref,
} from 'react';
import { AlertTriangle, Camera, Image as ImageIcon, Loader2, Mic, Paperclip, Plus, Send, SlidersHorizontal, Square } from 'lucide-react';
import { AttachmentChips } from './AttachmentChips';
import type { UseAttachmentsResult } from './useAttachments';
import type { UseDictationResult } from './useDictation';

type Lang = 'ka' | 'en' | 'ru';

export interface ComposerLabels {
  /** The textarea's accessible name. */
  input: string;
  placeholder: string;
  plus: string;
  photos: string;
  camera: string;
  files: string;
  tools: string;
  mic: string;
  stopDictation: string;
  transcribing: string;
  live: string;
  send: string;
  stop: string;
  dropHere: string;
}

/** ka is OmniStudio's wording, so a swap keeps every string the landing tests and users know. */
export const COMPOSER_LABELS: Readonly<Record<Lang, ComposerLabels>> = Object.freeze({
  ka: {
    input: 'შეტყობინება', placeholder: 'დაწერე, ჩაწერე ხმა, ან მიამაგრე ფაილი…', plus: 'დამატება და ხელსაწყოები',
    photos: 'ფოტოები', camera: 'კამერა', files: 'ფაილები', tools: 'ხელსაწყოები',
    mic: 'ხმის ჩაწერა', stopDictation: 'ჩაწერის შეჩერება', transcribing: 'ტრანსკრიფცია', live: 'ცოცხალი ხმა',
    send: 'გაგზავნა', stop: 'შეჩერება', dropHere: 'ჩააგდე ფაილები აქ',
  },
  en: {
    input: 'Message', placeholder: 'Type, record your voice, or attach a file…', plus: 'Add and tools',
    photos: 'Photos', camera: 'Camera', files: 'Files', tools: 'Tools',
    mic: 'Record voice', stopDictation: 'Stop recording', transcribing: 'Transcribing', live: 'Live voice',
    send: 'Send', stop: 'Stop', dropHere: 'Drop files here',
  },
  ru: {
    input: 'Сообщение', placeholder: 'Напишите, запишите голос или прикрепите файл…', plus: 'Добавить и инструменты',
    photos: 'Фото', camera: 'Камера', files: 'Файлы', tools: 'Инструменты',
    mic: 'Записать голос', stopDictation: 'Остановить запись', transcribing: 'Расшифровка', live: 'Живой голос',
    send: 'Отправить', stop: 'Стоп', dropHere: 'Перетащите файлы сюда',
  },
});

/** What the composer needs from `useAttachments` (the whole result fits). */
export type ComposerAttachmentsApi =
  Pick<UseAttachmentsResult, 'items' | 'processing' | 'remove' | 'onPaste' | 'onInputChange'>
  & Partial<Pick<UseAttachmentsResult, 'dropHandlers' | 'dragActive'>>;

/** What the composer needs from `useDictation` (the whole result fits). */
export type ComposerDictationApi =
  Pick<UseDictationResult, 'recording' | 'transcribing' | 'toggle' | 'markTyped'>
  & Partial<Pick<UseDictationResult, 'warn'>>;

export interface UnifiedComposerProps {
  locale?: string;
  value: string;
  /** Keyboard edits. (Dictation writes through its own `setValue`.) */
  onChange: (value: string) => void;
  onSubmit: () => void;
  attachments?: ComposerAttachmentsApi;
  /** Omit to hide the mic. */
  dictation?: ComposerDictationApi;
  /** Omit to hide Live (the empty slot then shows a disabled Send). */
  onLive?: () => void;
  busy?: boolean;
  /** Shown in the slot while `busy`. */
  onStop?: () => void;
  /** Overrides "text or an attachment" as the rule for showing Send. */
  canSubmit?: boolean;
  /** Disables the textarea (e.g. while a prompt is being enhanced). */
  disabled?: boolean;
  placeholder?: string;
  labels?: Partial<ComposerLabels>;
  /** The parent owns the „+" sheet (OmniStudio's ToolSheet). Without it, a built-in menu opens. */
  onPlus?: () => void;
  /** `aria-expanded` of „+" when the parent owns the sheet. */
  plusExpanded?: boolean;
  /** The built-in menu's Tools entry. */
  onTools?: () => void;
  /** Rendered right of „+" (OmniStudio's tool chip, `data-testid="options-toggle"`). */
  toolChip?: ReactNode;
  /** Rendered left of the mic (e.g. the prompt-enhance wand, or a queued tool's Run beside Stop). */
  extraActions?: ReactNode;
  /** Rendered above the pill (e.g. the video-remix quick chips). */
  above?: ReactNode;
  /** Rows before the textarea scrolls. Default 8. */
  maxRows?: number;
  textareaRef?: Ref<HTMLTextAreaElement>;
  onFocus?: () => void;
  /** The Files picker's `accept`. */
  acceptFiles?: string;
  autoFocus?: boolean;
  className?: string;
}

export interface UnifiedComposerHandle {
  focus(): void;
  openPhotos(): void;
  openCamera(): void;
  openFiles(): void;
  readonly textarea: HTMLTextAreaElement | null;
}

export const DEFAULT_ACCEPT_FILES = 'image/*,audio/*,video/*,application/pdf,.pdf,.txt,.md,.markdown,.docx,.doc,.rtf,.csv,.json';

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const iconBtn = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent';

/** True when this Enter keydown belongs to an IME composition, not to the user. */
export function isImeEnter(e: Pick<ReactKeyboardEvent, 'keyCode'> & { nativeEvent?: { isComposing?: boolean } }, composing: boolean): boolean {
  return composing || !!e.nativeEvent?.isComposing || e.keyCode === 229;
}

export const UnifiedComposer = forwardRef<UnifiedComposerHandle, UnifiedComposerProps>(function UnifiedComposer(props, ref) {
  const {
    locale, value, onChange, onSubmit, attachments, dictation, onLive, busy = false, onStop, canSubmit, disabled = false,
    placeholder, labels, onPlus, plusExpanded, onTools, toolChip, extraActions, above, maxRows = 8, textareaRef,
    onFocus, acceptFiles = DEFAULT_ACCEPT_FILES, autoFocus, className,
  } = props;
  const lang: Lang = locale === 'en' || locale === 'ru' ? locale : 'ka';
  const l: ComposerLabels = { ...COMPOSER_LABELS[lang], ...(labels ?? {}) };

  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const photoRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const plusRef = useRef<HTMLButtonElement | null>(null);
  const menuWrapRef = useRef<HTMLDivElement | null>(null);
  const composingRef = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Forward the textarea to the parent's ref (object or callback) as well as keeping our own.
  const textareaRefProp = useRef(textareaRef);
  textareaRefProp.current = textareaRef;
  const setTaRef = useCallback((el: HTMLTextAreaElement | null) => {
    taRef.current = el;
    const r = textareaRefProp.current;
    if (typeof r === 'function') r(el);
    else if (r) (r as MutableRefObject<HTMLTextAreaElement | null>).current = el;
  }, []);

  useImperativeHandle(ref, () => ({
    focus: () => taRef.current?.focus(),
    openPhotos: () => photoRef.current?.click(),
    openCamera: () => cameraRef.current?.click(),
    openFiles: () => fileRef.current?.click(),
    get textarea() { return taRef.current; },
  }), []);

  // Grow with the text up to `maxRows`, then scroll inside. Measured from the computed line height, so a
  // font or padding change never needs a matching magic number here.
  useIsoLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta || typeof window === 'undefined') return;
    const cs = window.getComputedStyle(ta);
    const lh = parseFloat(cs.lineHeight) || 24;
    const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const max = lh * maxRows + pad;
    ta.style.height = 'auto';
    const h = Math.min(ta.scrollHeight, max);
    if (h > 0) ta.style.height = `${h}px`;
    ta.style.overflowY = ta.scrollHeight > max ? 'auto' : 'hidden';
  }, [value, maxRows]);

  const items = attachments?.items ?? [];
  const processing = !!attachments?.processing;
  const hasContent = canSubmit ?? (value.trim().length > 0 || items.length > 0);
  // A file still being read would be missing from the message: Send waits for it.
  const sendEnabled = hasContent && !processing;

  const submit = useCallback(() => {
    if (sendEnabled) onSubmit();
  }, [sendEnabled, onSubmit]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    if (isImeEnter(e, composingRef.current)) return;
    e.preventDefault();
    // Not gated on `busy`: the parent decides what a send during a reply means (OmniStudio parks it).
    submit();
  };

  const onText = (e: ChangeEvent<HTMLTextAreaElement>) => {
    dictation?.markTyped();
    onChange(e.target.value);
  };

  // ── Built-in „+" menu ──
  const closeMenu = useCallback((refocus: boolean) => {
    setMenuOpen(false);
    if (refocus) plusRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const first = menuWrapRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    first?.focus();
    const onDown = (ev: PointerEvent | MouseEvent) => {
      const t = ev.target as Node | null;
      if (t && menuWrapRef.current?.contains(t)) return;
      setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('mousedown', onDown);
    };
  }, [menuOpen]);

  const onMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const list = Array.from(menuWrapRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(true); return; }
    if (e.key === 'Tab') { closeMenu(false); return; }
    const go = (n: number) => { e.preventDefault(); list[(n + list.length) % list.length]?.focus(); };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(list.length - 1);
  };

  const menuItems: Array<{ key: string; label: string; Icon: typeof Plus; run: () => void }> = [];
  if (attachments) {
    menuItems.push(
      { key: 'photos', label: l.photos, Icon: ImageIcon, run: () => photoRef.current?.click() },
      { key: 'camera', label: l.camera, Icon: Camera, run: () => cameraRef.current?.click() },
      { key: 'files', label: l.files, Icon: Paperclip, run: () => fileRef.current?.click() },
    );
  }
  if (onTools) menuItems.push({ key: 'tools', label: l.tools, Icon: SlidersHorizontal, run: onTools });
  const showPlus = !!onPlus || menuItems.length > 0;

  // ── The trailing slot ──
  let slot: ReactNode;
  if (busy && onStop) {
    slot = (
      <button type="button" onClick={onStop} aria-label={l.stop} title={l.stop} data-testid="composer-stop"
        className={`${iconBtn} bg-app-surface text-app-text hover:text-app-accent`}>
        <Square size={15} aria-hidden="true" className="fill-current" />
      </button>
    );
  } else if (hasContent || !onLive) {
    slot = (
      <button type="button" onClick={submit} disabled={!sendEnabled} aria-label={l.send} title={l.send} data-testid="composer-send"
        className={`${iconBtn} ml-0.5 bg-app-accent text-app-bg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40`}>
        {processing && hasContent ? <Loader2 size={17} aria-hidden="true" className="animate-spin" /> : <Send size={17} aria-hidden="true" />}
      </button>
    );
  } else {
    slot = (
      <button type="button" onClick={onLive} aria-label={l.live} title={l.live} data-testid="composer-live"
        className={`group relative ml-0.5 ${iconBtn} text-app-accent hover:bg-app-accent/10`}>
        <span className="voice-eq relative" aria-hidden="true"><span /><span /><span /><span /></span>
      </button>
    );
  }

  // ── The mic (beside the slot, never in it) ──
  let mic: ReactNode = null;
  if (dictation) {
    if (dictation.recording) {
      mic = (
        <button type="button" onClick={() => void dictation.toggle()} aria-label={l.stopDictation} title={l.stopDictation} aria-pressed="true"
          className={`${iconBtn} animate-pulse bg-app-danger/15 text-app-danger`}>
          <Square size={16} aria-hidden="true" />
        </button>
      );
    } else if (dictation.transcribing) {
      // The recorder's final pass runs AFTER Stop; without a visible wait the box sits unchanged for a whole
      // round-trip, which reads as "the mic ate my sentence" and invites a second tap.
      mic = (
        <span role="status" aria-live="polite" aria-label={l.transcribing} title={`${l.transcribing}…`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-app-accent">
          <Loader2 size={18} aria-hidden="true" className="animate-spin" />
        </span>
      );
    } else {
      mic = (
        <button type="button" onClick={() => void dictation.toggle()} aria-label={l.mic} title={l.mic}
          className={`${iconBtn} text-app-muted hover:bg-app-surface hover:text-app-text`}>
          <Mic size={19} aria-hidden="true" />
        </button>
      );
    }
  }

  const dropHandlers = attachments?.dropHandlers;
  const dragActive = !!attachments?.dragActive;

  return (
    <div className={`relative ${className ?? ''}`} {...(dropHandlers ?? {})}>
      {dictation?.warn && (
        <div role="status" className="mb-2 rounded-xl border border-app-warning/25 bg-app-warning/10 px-3 py-2 text-[12px] leading-snug text-app-text">
          <AlertTriangle size={14} aria-hidden="true" className="mr-1.5 inline-block align-[-2px] text-app-warning" />{dictation.warn}
        </div>
      )}
      {above}
      <div className="relative min-h-[52px] rounded-[24px] border border-app-border/15 bg-app-elevated px-3 py-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.12)] transition-colors focus-within:border-app-accent/40 sm:px-4">
        {attachments && items.length > 0 && (
          <AttachmentChips items={items} onRemove={attachments.remove} locale={lang} className="mb-2 px-1 pt-1" />
        )}
        <textarea
          ref={setTaRef}
          value={value}
          onChange={onText}
          onKeyDown={onKeyDown}
          onCompositionStart={() => { composingRef.current = true; }}
          onCompositionEnd={() => { composingRef.current = false; }}
          onPaste={attachments ? (e) => attachments.onPaste(e) : undefined}
          onFocus={onFocus}
          rows={1}
          disabled={disabled}
          autoFocus={autoFocus}
          enterKeyHint="send"
          aria-label={l.input}
          placeholder={placeholder ?? l.placeholder}
          className="block min-h-[36px] w-full resize-none border-0 bg-transparent px-1 py-1.5 text-[16px] leading-6 text-app-text outline-none placeholder:text-app-muted focus:ring-0 disabled:opacity-60"
        />
        <div className="mt-1 flex items-center gap-1">
          {showPlus && (
            <div ref={menuWrapRef} className="relative" onKeyDown={menuOpen ? onMenuKeyDown : undefined}>
              <button
                ref={plusRef}
                type="button"
                data-testid="plus"
                onClick={() => (onPlus ? onPlus() : setMenuOpen((v) => !v))}
                aria-haspopup={onPlus ? 'dialog' : 'menu'}
                aria-expanded={onPlus ? !!plusExpanded : menuOpen}
                aria-label={l.plus}
                title={l.plus}
                className={`${iconBtn} text-app-muted hover:bg-app-surface hover:text-app-text`}
              >
                <Plus size={20} aria-hidden="true" />
              </button>
              {!onPlus && menuOpen && (
                <div role="menu" aria-label={l.plus}
                  className="absolute bottom-full left-0 z-30 mb-2 min-w-[210px] rounded-2xl border border-app-border/15 bg-app-elevated p-1.5 shadow-lg">
                  {menuItems.map(({ key, label, Icon, run }) => (
                    <button key={key} type="button" role="menuitem" tabIndex={-1}
                      onClick={() => { closeMenu(false); run(); }}
                      className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 text-left text-[14px] font-medium text-app-text transition-colors hover:bg-app-surface focus:bg-app-surface focus:outline-none">
                      <Icon size={18} aria-hidden="true" className="shrink-0 text-app-text/80" />
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {toolChip}
          <div className="flex-1" />
          {extraActions}
          {mic}
          {slot}
        </div>
        {dragActive && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[24px] border-2 border-dashed border-app-accent bg-app-bg/80 text-[14px] font-medium text-app-accent">
            {l.dropHere}
          </div>
        )}
      </div>
      {attachments && (
        <>
          <input ref={photoRef} type="file" multiple accept="image/*" className="hidden" tabIndex={-1} aria-hidden="true"
            data-testid="composer-photos-input" onChange={attachments.onInputChange('photos')} />
          {/* capture="environment" opens the REAR camera on a phone and falls back to a file picker on desktop. */}
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" tabIndex={-1} aria-hidden="true"
            data-testid="composer-camera-input" onChange={attachments.onInputChange('camera')} />
          <input ref={fileRef} type="file" multiple accept={acceptFiles} className="hidden" tabIndex={-1} aria-hidden="true"
            data-testid="composer-files-input" onChange={attachments.onInputChange('files')} />
        </>
      )}
    </div>
  );
});
