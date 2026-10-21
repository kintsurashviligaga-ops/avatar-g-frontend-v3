'use client';

import React, { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Check, ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { CHAT_MODES, chatModeOption, type ChatModeId, type ChatModeLocale } from '@/lib/chat/chatModes';
import { useChatMode } from '@/lib/chat/chatModeStore';
import { useViewportClamp } from '@/lib/ui/useViewportClamp';
import { PERSONA_STORAGE_KEY, loadCustomPersonas, loadSelectedPersonaId } from '@/components/studio/PersonaPicker';
import { BUILT_IN_PERSONAS, personaName, type Persona } from '@/lib/services/personas/personas';

export const OPEN_PERSONA_EVENT = 'myavatar:open-persona';
export const PERSONA_CHANGED_EVENT = 'myavatar:persona-changed';

const toLang = (locale?: string): ChatModeLocale => (locale === 'en' || locale === 'ru' ? locale : 'ka');
const cleanName = (s?: string) => (s || '').replace(/^Gemini\s*/i, '').trim();
const focusable = (items: Array<HTMLButtonElement | null>): HTMLButtonElement[] =>
  items.filter((el): el is HTMLButtonElement => !!el && !el.disabled);

export function announcePersona(id: string): void {
  if (typeof window === 'undefined') return;
  try { window.dispatchEvent(new CustomEvent<string>(PERSONA_CHANGED_EVENT, { detail: id })); } catch { /* noop */ }
}

export function selectPersona(id: string): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(PERSONA_STORAGE_KEY, id); } catch { /* noop */ }
  announcePersona(id);
}

function subscribePersona(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e: StorageEvent) => { if (e.key === null || e.key === PERSONA_STORAGE_KEY) onChange(); };
  window.addEventListener(PERSONA_CHANGED_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(PERSONA_CHANGED_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

export function useActivePersona(locale?: string): { id: string; name: string } {
  const id = useSyncExternalStore(subscribePersona, loadSelectedPersonaId, () => '');
  const lang = toLang(locale);
  const name = useMemo(() => {
    if (!id) return '';
    const found = BUILT_IN_PERSONAS.find((p: Persona) => p.id === id) ?? loadCustomPersonas().find((p: Persona) => p.id === id);
    return found ? personaName(found, lang) : '';
  }, [id, lang]);
  return useMemo(() => ({ id, name }), [id, name]);
}

export function RocketSphereLogo({ size = 32 }: { size?: number }) {
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: 'radial-gradient(circle at 32% 28%, #7dd3fc 0%, #38bdf8 22%, #2563eb 52%, #1e3a8a 78%, #020817 100%)',
        boxShadow: '0 0 16px rgba(14,165,233,0.9), 0 0 28px rgba(37,99,235,0.55), inset 0 0 10px rgba(186,230,253,0.85)',
      }}
      aria-hidden="true"
    >
      <span className="pointer-events-none absolute inset-0 rounded-full ring-[1.5px] ring-sky-300/90" />
      <span className="pointer-events-none absolute left-1.5 top-1 h-1.5 w-3 -rotate-[28deg] rounded-full bg-white/85 blur-[0.4px]" />
      <span className="pointer-events-none absolute bottom-1 right-1.5 h-1 w-2.5 -rotate-[28deg] rounded-full bg-sky-200/80 blur-[0.4px]" />
      <svg viewBox="0 0 64 64" style={{ width: size * 0.68, height: size * 0.68 }} className="drop-shadow-[0_1px_5px_rgba(56,189,248,0.95)]">
        <path d="M22 42 C15 45, 12 51, 11 53 C15 52, 22 48, 25 42 Z" fill="#67e8f9" />
        <path d="M24 40 C18 43, 14 49, 13 51 C17 50, 22 46, 25 41 Z" fill="#ffffff" />
        <path d="M27 31 L17 34 C16 37, 17 40, 19 41 L26 38 Z" fill="#3b82f6" stroke="#bae6fd" strokeWidth="1.2" />
        <path d="M33 37 L30 45 C31 47, 34 48, 37 47 L40 37 Z" fill="#3b82f6" stroke="#bae6fd" strokeWidth="1.2" />
        <path d="M49 15 C41 15, 31 21, 25 31 L33 39 C43 33, 49 23, 49 15 Z" fill="#2563eb" stroke="#e0f2fe" strokeWidth="1.4" />
        <path d="M24 32 L32 40 L29 42 L22 35 Z" fill="#cbd5e1" />
        <g transform="translate(37.5, 26.5) rotate(45) scale(0.85)" fill="#1e3a8a" stroke="#7dd3fc" strokeWidth="1.2">
          <path d="M0 -1 C-2.5 -4.5, -5.5 -2, -2 0.5" />
          <path d="M0 -1 C2.5 -4.5, 5.5 -2, 2 0.5" />
          <path d="M0 1 C-2.5 4.5, -5.5 2, -2 -0.5" />
          <path d="M0 1 C2.5 4.5, 5.5 2, 2 -0.5" />
        </g>
      </svg>
    </span>
  );
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
  brandClassName?: string;
  className?: string;
}

export function ModelSwitcher({ variant, locale, className = '' }: ModelSwitcherProps) {
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

  const activeTitle = cleanName(current.displayModel) || cleanName(current.label);

  return (
    <div ref={wrapRef} className={`relative min-w-0 ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        data-testid="model-switcher"
        aria-label={`${t.open}, ${t.current}: ${activeTitle}`}
        onKeyDown={onTriggerKeyDown}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        className="group inline-flex h-11 min-w-0 items-center gap-2.5 rounded-full px-2 py-1 text-left transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
      >
        <RocketSphereLogo size={variant === 'phone' ? 30 : 34} />
        <span className="min-w-0 truncate text-[15.5px] font-semibold tracking-tight text-white">
          {activeTitle}
        </span>
        <ChevronDown size={16} aria-hidden="true" className="shrink-0 text-white/60 transition-transform duration-200 group-aria-expanded:rotate-180" />
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={t.menu}
          onKeyDown={onMenuKeyDown}
          data-testid="model-menu"
          {...clamp.props}
          className="absolute left-0 top-full z-50 mt-1.5 w-[min(22rem,calc(100vw-1rem))] rounded-[22px] border border-white/10 bg-[#14161c]/95 p-2 shadow-[0_12px_36px_rgba(0,0,0,0.65)] backdrop-blur-xl"
        >
          {CHAT_MODES.map((m, i) => {
            const on = m.id === mode;
            const mTitle = cleanName(m.displayModel) || cleanName(m.label);
            return (
              <button
                key={m.id}
                ref={(el) => { itemsRef.current[i] = el; }}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                disabled={!m.enabled}
                onClick={() => choose(m.id)}
                className={`flex min-h-[54px] w-full items-center gap-3 rounded-[14px] px-3 py-2 text-left transition-colors hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-45 ${on ? 'bg-white/[0.06]' : ''}`}
              >
                <RocketSphereLogo size={26} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-[14.5px] font-semibold text-white">
                    <span>{cleanName(m.label)}</span>
                    <span className="rounded-md bg-sky-500/15 px-1.5 py-0.5 text-[11.5px] font-medium text-sky-300">{mTitle}</span>
                  </span>
                  <span className={`block text-white/60 ${subText(lang)}`}>{m.description[lang]}</span>
                </span>
                {on && <Check size={18} aria-hidden="true" className="shrink-0 text-sky-400" />}
              </button>
            );
          })}
          <div role="separator" className="my-1 h-px bg-white/10" />
          <button
            type="button"
            role="menuitem"
            ref={(el) => { itemsRef.current[CHAT_MODES.length] = el; }}
            onClick={openPersona}
            className="flex min-h-[48px] w-full items-center gap-2.5 rounded-[14px] px-3 py-2 text-left transition-colors hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            <Sparkles size={17} className="shrink-0 text-sky-400" />
            <span className="min-w-0 flex-1 text-[14px] font-medium text-white">
              {t.persona}
            </span>
            <span className={`truncate ${subText(lang)} ${persona.name ? 'text-sky-300' : 'text-white/60'}`}>{persona.name || t.personaDefault}</span>
            <ChevronRight size={15} className="shrink-0 text-white/50" />
          </button>
        </div>
      )}
    </div>
  );
}

export default ModelSwitcher;
