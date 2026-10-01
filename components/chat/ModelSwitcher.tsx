'use client';

/**
 * components/chat/ModelSwitcher.tsx — the Gemini-style model picker at the top-left of the chat (docs/DESIGN.md §8).
 *
 * Two triggers, one menu:
 *  • 'desktop' — OmniStudio's own title bar (≥ 1024 px): a muted „Gemini“, the current mode and a chevron.
 *  • 'phone'   — ChatChrome's header (phones and tablets): the wordmark, the mode in the accent and a chevron, i.e.
 *                Gemini mobile's "Gemini · 3.8 Flash ⌄". The name steps aside below 360 px so the mode stays whole.
 *
 * The menu lists the chat modes of lib/chat/chatModes (label · one line in the UI language · a check on the chosen
 * one), then the persona — Gemini keeps its Gems one step from the model, and ours were only in the sidebar.
 *
 * STATE lives outside both headers: the mode in lib/chat/chatModeStore (read by the send path AT SEND TIME, so a
 * switch applies to the very next turn), the persona in PersonaPicker's localStorage key. Both switchers — and the
 * composer's persona chip — therefore agree without a prop being threaded through ChatChrome into OmniStudio.
 *
 * ⚠️ NO FIXED CHILDREN. ChatChrome's header is `sticky` with `backdrop-blur-xl`, which makes it the containing block
 * of a `position: fixed` descendant and its own stacking context: a fixed backdrop in there covers the header, not the
 * page (the LanguageSwitcher measured this — elementFromPoint returned the composer). Outside taps are caught by a
 * document-level capture listener instead, which does not care about stacking contexts.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Check, ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { Wordmark } from '@/components/brand/Wordmark';
import { CHAT_MODES, chatModeOption, type ChatModeId, type ChatModeLocale } from '@/lib/chat/chatModes';
import { useChatMode } from '@/lib/chat/chatModeStore';
import { useViewportClamp } from '@/lib/ui/useViewportClamp';
import { PERSONA_STORAGE_KEY, loadCustomPersonas, loadSelectedPersonaId } from '@/components/studio/PersonaPicker';
import { BUILT_IN_PERSONAS, personaName, type Persona } from '@/lib/services/personas/personas';

/** Ask ChatChrome (the owner of PersonaPicker) to open the persona picker. */
export const OPEN_PERSONA_EVENT = 'myavatar:open-persona';
/**
 * The selected persona changed (detail: the new id, '' = default). PersonaPicker writes localStorage without telling
 * anyone; ChatChrome announces its picks with this, and the composer chip's ✕ clears through it — so the sidebar row,
 * both switchers and the chip never disagree about who the user is talking to.
 */
export const PERSONA_CHANGED_EVENT = 'myavatar:persona-changed';

const toLang = (locale?: string): ChatModeLocale => (locale === 'en' || locale === 'ru' ? locale : 'ka');

/** The menu's items the arrows can land on — a disabled mode is skipped, as in Gemini's own picker. */
const focusable = (items: Array<HTMLButtonElement | null>): HTMLButtonElement[] =>
  items.filter((el): el is HTMLButtonElement => !!el && !el.disabled);

/** Announce a persona change made elsewhere (the picker already saved it). */
export function announcePersona(id: string): void {
  if (typeof window === 'undefined') return;
  try { window.dispatchEvent(new CustomEvent<string>(PERSONA_CHANGED_EVENT, { detail: id })); } catch { /* old engines */ }
}

/** Save + announce a persona choice ('' = back to the default assistant). */
export function selectPersona(id: string): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(PERSONA_STORAGE_KEY, id); } catch { /* private mode — the event still updates this page */ }
  announcePersona(id);
}

function subscribePersona(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onEvent = () => onChange();
  // Another tab picked a persona. `key === null` is a storage.clear() (sign-out wipes).
  const onStorage = (e: StorageEvent) => { if (e.key === null || e.key === PERSONA_STORAGE_KEY) onChange(); };
  window.addEventListener(PERSONA_CHANGED_EVENT, onEvent);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(PERSONA_CHANGED_EVENT, onEvent);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * The active persona: its id ('' = default) and its name in the UI language ('' when default or unknown). Reactive to
 * PERSONA_CHANGED_EVENT and to other tabs; the snapshot is a string, so an unchanged choice never re-renders.
 */
export function useActivePersona(locale?: string): { id: string; name: string } {
  const id = useSyncExternalStore(subscribePersona, loadSelectedPersonaId, () => '');
  const lang = toLang(locale);
  const name = useMemo(() => {
    if (!id) return '';
    const found = BUILT_IN_PERSONAS.find((p: Persona) => p.id === id)
      ?? loadCustomPersonas().find((p: Persona) => p.id === id);
    return found ? personaName(found, lang) : '';
  }, [id, lang]);
  return useMemo(() => ({ id, name }), [id, name]);
}

const COPY: Record<ChatModeLocale, { open: string; current: string; menu: string; persona: string; personaDefault: string }> = {
  ka: { open: 'მოდელის არჩევა', current: 'ამჟამად', menu: 'მოდელი', persona: 'პერსონა', personaDefault: 'ნაგულისხმევი' },
  en: { open: 'Choose a model', current: 'current', menu: 'Model', persona: 'Persona', personaDefault: 'Default' },
  ru: { open: 'Выбрать модель', current: 'сейчас', menu: 'Модель', persona: 'Персона', personaDefault: 'По умолчанию' },
};

/**
 * Georgian reading text stays at 16 px with a 1.6 line (docs/DESIGN.md §3): its tall glyphs turn to mush at Gemini's
 * 13 px. Latin and Cyrillic keep Gemini's quieter 13 px sub-line.
 */
const subText = (lang: ChatModeLocale) => (lang === 'ka' ? 'text-[16px] leading-[1.6]' : 'text-[13px] leading-[1.45]');

export interface ModelSwitcherProps {
  variant: 'desktop' | 'phone';
  locale?: string;
  /**
   * Phone variant: classes for the wordmark beside the mode. Default hides it below 360 px (the mode must stay whole);
   * ChatChrome also hides it on a tablet whose sidebar already carries the name.
   */
  brandClassName?: string;
  className?: string;
}

export function ModelSwitcher({ variant, locale, brandClassName = 'max-[359px]:hidden', className = '' }: ModelSwitcherProps) {
  const lang = toLang(locale);
  const t = COPY[lang];
  const [mode, setMode] = useChatMode();
  const current = chatModeOption(mode);
  const persona = useActivePersona(lang);
  const [open, setOpen] = useState(false);
  const clamp = useViewportClamp(open);
  const menuId = useId();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const itemsRef = useRef<Array<HTMLButtonElement | null>>([]);
  // Which item takes focus when the menu opens: the checked mode (Enter / ArrowDown / a click) or the last item
  // (ArrowUp), per the WAI-ARIA menu-button pattern.
  const focusOnOpenRef = useRef<'checked' | 'last'>('checked');

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  // Outside taps and Escape, at the document — see the header note on stacking contexts. Capture phase: Escape must
  // close THIS menu without also closing whatever dialog sits under it (the phone drawer listens for Escape too).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: Event) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close(true);
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, close]);

  // Focus moves INTO the menu when it opens, so the arrows work straight away and a screen reader lands on a choice.
  useEffect(() => {
    if (!open) return;
    const items = focusable(itemsRef.current);
    const target = focusOnOpenRef.current === 'last'
      ? items[items.length - 1]
      : items.find((el) => el.getAttribute('aria-checked') === 'true') ?? items[0];
    target?.focus();
    focusOnOpenRef.current = 'checked';
  }, [open]);

  const choose = (id: ChatModeId) => {
    setMode(id);
    close(true);
  };

  const openPersona = () => {
    setOpen(false);
    // The picker is a dialog of its own and takes the focus; nothing to restore here.
    try { window.dispatchEvent(new Event(OPEN_PERSONA_EVENT)); } catch { /* old engines */ }
  };

  const onTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      focusOnOpenRef.current = e.key === 'ArrowUp' ? 'last' : 'checked';
      setOpen(true);
    }
  };

  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = focusable(itemsRef.current);
    if (!items.length) return;
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const move = (to: number) => { e.preventDefault(); items[(to + items.length) % items.length]?.focus(); };
    switch (e.key) {
      case 'ArrowDown': move(at + 1); break;
      case 'ArrowUp': move(at < 0 ? items.length - 1 : at - 1); break;
      case 'Home': move(0); break;
      case 'End': move(items.length - 1); break;
      // Tab leaves a menu (it is not a tab stop of its own); focus continues from the trigger's position.
      case 'Tab': setOpen(false); break;
      default: break;
    }
  };

  const label = `${t.open}, ${t.current}: ${current.displayModel}`;
  const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60';

  return (
    <div ref={wrapRef} className={`relative min-w-0 ${className}`}>
      {variant === 'desktop' ? (
        <button
          ref={triggerRef}
          type="button"
          data-testid="model-switcher"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          aria-label={label}
          title={current.displayModel}
          onClick={() => setOpen((v) => !v)}
          onKeyDown={onTriggerKeyDown}
          className={`group inline-flex h-10 min-w-0 items-center gap-1.5 rounded-full pl-3 pr-2 text-[17px] font-medium text-app-text transition-colors duration-200 hover:bg-app-border/10 aria-expanded:bg-app-border/10 [@media(pointer:coarse)]:h-11 ${focusRing}`}
        >
          <span className="shrink-0 text-app-muted">Gemini</span>
          <span className="min-w-0 truncate">{current.label}</span>
          <ChevronDown size={16} aria-hidden="true" className="shrink-0 text-app-muted transition-transform duration-200 group-aria-expanded:rotate-180 motion-reduce:transition-none" />
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          data-testid="model-switcher"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          aria-label={label}
          title={current.displayModel}
          onClick={() => setOpen((v) => !v)}
          onKeyDown={onTriggerKeyDown}
          className={`group inline-flex h-11 min-w-0 items-center gap-1.5 rounded-full pl-1 pr-2 transition-colors duration-200 hover:bg-app-elevated aria-expanded:bg-app-elevated touch-manipulation ${focusRing}`}
        >
          <span className={`flex shrink-0 items-center ${brandClassName}`} aria-hidden="true"><Wordmark size="sm" /></span>
          <span className="min-w-0 truncate text-[15px] font-medium text-app-accent">{current.label}</span>
          <ChevronDown size={16} aria-hidden="true" className="shrink-0 text-app-muted transition-transform duration-200 group-aria-expanded:rotate-180 motion-reduce:transition-none" />
        </button>
      )}

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={t.menu}
          data-testid="model-menu"
          onKeyDown={onMenuKeyDown}
          // No entrance animation on purpose: the viewport clamp positions this panel with an inline transform, and a
          // keyframe transform would override it for the animation's length and then jump sideways at 320 px.
          {...clamp.props}
          className="absolute left-0 top-full z-50 mt-1 w-[min(22rem,calc(100vw-1rem))] rounded-[20px] bg-app-elevated p-2 shadow-[0_8px_28px_rgba(0,0,0,0.45)] ring-1 ring-app-border/10"
        >
          {CHAT_MODES.map((m, i) => {
            const on = m.id === mode;
            return (
              <button
                key={m.id}
                ref={(el) => { itemsRef.current[i] = el; }}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                disabled={!m.enabled}
                title={m.displayModel}
                onClick={() => choose(m.id)}
                className="flex min-h-[52px] w-full items-center gap-2 rounded-[12px] p-2 text-left transition-colors duration-200 hover:bg-app-border/10 focus-visible:bg-app-border/10 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45 [@media(pointer:coarse)]:min-h-[56px]"
              >
                <span className="flex w-5 shrink-0 justify-center">
                  {on && <Check size={18} aria-hidden="true" className="text-app-accent" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium leading-5 text-app-text">{m.label}</span>
                  <span className={`block text-app-muted ${subText(lang)}`}>{m.description[lang]}</span>
                </span>
              </button>
            );
          })}
          <div role="separator" className="my-1 h-px bg-app-border/10" />
          <button
            ref={(el) => { itemsRef.current[CHAT_MODES.length] = el; }}
            type="button"
            role="menuitem"
            onClick={openPersona}
            className="flex min-h-[52px] w-full items-center gap-2 rounded-[12px] p-2 text-left transition-colors duration-200 hover:bg-app-border/10 focus-visible:bg-app-border/10 focus-visible:outline-none [@media(pointer:coarse)]:min-h-[56px]"
          >
            <span className="flex w-5 shrink-0 justify-center"><Sparkles size={18} aria-hidden="true" className="text-app-muted" /></span>
            <span className={`min-w-0 flex-1 font-medium text-app-text ${subText(lang)}`}>{t.persona}</span>
            <span className={`min-w-0 max-w-[50%] truncate ${subText(lang)} ${persona.name ? 'text-app-accent' : 'text-app-muted'}`}>
              {persona.name || t.personaDefault}
            </span>
            <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-app-muted" />
          </button>
        </div>
      )}
    </div>
  );
}

export default ModelSwitcher;
