'use client';

/**
 * components/studio/PersonaPicker.tsx
 * ==================================
 * The persona selector — six built-in specialists plus user-authored ones.
 *
 * CONVENTIONS FOLLOWED (matching the studio tree, not inventing a new dialect):
 *  • i18n: a module-level `COPY: Record<Lang, …>` table selected from a `locale` prop. The studio tree does
 *    NOT use a translation hook, and mixing one in here would desync from the /[locale] segment.
 *  • theme: the `app-*` tokens (bg-app-surface / bg-app-elevated / border-app-border/15 / text-app-text /
 *    text-app-muted / bg-app-accent / text-app-bg), never hardcoded hex.
 *  • rows reuse ChatChrome's `sideRow` shape so the picker looks native in the sidebar.
 *
 * PERSISTENCE is localStorage, deliberately: per-user persona storage needs a table this deployment cannot
 * migrate yet. The key is namespaced like the existing `myavatar:favorites`. Custom personas are still
 * VALIDATED SERVER-SIDE before use (POST /api/v2/personas) — the sanitizer strips prompt-injection and is a
 * security boundary, so it must not be something a modified client can skip.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Plus, Sparkles, Trash2, X } from 'lucide-react';
import {
  BUILT_IN_PERSONAS,
  personaName,
  type Persona,
} from '@/lib/services/personas/personas';

type Lang = 'ka' | 'en' | 'ru';

export const PERSONA_STORAGE_KEY = 'myavatar:persona';
export const CUSTOM_PERSONAS_KEY = 'myavatar:personas:custom';

const COPY: Record<Lang, {
  title: string; subtitle: string; none: string; noneSub: string;
  create: string; name: string; directive: string; directivePh: string;
  save: string; cancel: string; delete: string; custom: string; soon: string; invalid: string;
}> = {
  ka: {
    title: 'პერსონა', subtitle: 'აირჩიე სპეციალისტი — შეიცვლება ტონი და რომელ სტუდიას მიმართავს',
    none: 'ნაგულისხმევი', noneSub: 'ზოგადი ასისტენტი',
    create: 'ახალი პერსონა', name: 'სახელი', directive: 'ინსტრუქცია',
    directivePh: 'როგორ უნდა პასუხობდეს? მაგ: „წერ სცენარებს ქართულად, სცენა-სცენა."',
    save: 'შენახვა', cancel: 'გაუქმება', delete: 'წაშლა', custom: 'ჩემი პერსონები', soon: 'მალე',
    invalid: 'ვერ შევინახე — შეამოწმე სახელი და ინსტრუქცია.',
  },
  en: {
    title: 'Persona', subtitle: 'Pick a specialist — it changes the tone and which studio it reaches for',
    none: 'Default', noneSub: 'General assistant',
    create: 'New persona', name: 'Name', directive: 'Directive',
    directivePh: 'How should it answer? e.g. "You write screenplays in Georgian, scene by scene."',
    save: 'Save', cancel: 'Cancel', delete: 'Delete', custom: 'My personas', soon: 'Soon',
    invalid: 'Could not save — check the name and directive.',
  },
  ru: {
    title: 'Персона', subtitle: 'Выберите специалиста — изменится тон и выбор студии',
    none: 'По умолчанию', noneSub: 'Общий ассистент',
    create: 'Новая персона', name: 'Название', directive: 'Инструкция',
    directivePh: 'Как отвечать? Напр.: «Ты пишешь сценарии по-грузински, сцена за сценой».',
    save: 'Сохранить', cancel: 'Отмена', delete: 'Удалить', custom: 'Мои персоны', soon: 'Скоро',
    invalid: 'Не удалось сохранить — проверьте название и инструкцию.',
  },
};

/** Read the saved custom personas. Total: a corrupted entry yields [] rather than throwing on mount. */
export function loadCustomPersonas(): Persona[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_PERSONAS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p): p is Persona =>
      !!p && typeof p === 'object' && typeof (p as Persona).id === 'string' && typeof (p as Persona).directive === 'string');
  } catch {
    return [];
  }
}

/** The persona id the user last selected ('' = default/none). */
export function loadSelectedPersonaId(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(PERSONA_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export interface PersonaPickerProps {
  locale?: string;
  open: boolean;
  onClose: () => void;
  /** Fires with the newly selected persona (null = default) so the shell can thread it into chat requests. */
  onSelect?: (persona: Persona | null) => void;
}

export default function PersonaPicker({ locale = 'ka', open, onClose, onSelect }: PersonaPickerProps) {
  const lang: Lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  const t = COPY[lang];

  const [selectedId, setSelectedId] = useState<string>('');
  const [customs, setCustoms] = useState<Persona[]>([]);
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftDirective, setDraftDirective] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedId(loadSelectedPersonaId());
    setCustoms(loadCustomPersonas());
    setError(null);
  }, [open]);

  const all = useMemo<Persona[]>(() => [...BUILT_IN_PERSONAS, ...customs], [customs]);

  const choose = useCallback((id: string) => {
    setSelectedId(id);
    try { window.localStorage.setItem(PERSONA_STORAGE_KEY, id); } catch { /* private mode */ }
    onSelect?.(all.find((p) => p.id === id) ?? null);
    onClose();
  }, [all, onSelect, onClose]);

  /** Validate SERVER-SIDE, then store what comes back — never the raw draft. */
  const save = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/v2/personas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: draftName, directive: draftDirective }),
      });
      const json = (await res.json().catch(() => null)) as { persona?: Persona } | null;
      if (!res.ok || !json?.persona) { setError(t.invalid); return; }
      const next = [...customs.filter((c) => c.id !== json.persona!.id), json.persona];
      setCustoms(next);
      try { window.localStorage.setItem(CUSTOM_PERSONAS_KEY, JSON.stringify(next)); } catch { /* private mode */ }
      setCreating(false); setDraftName(''); setDraftDirective('');
    } catch {
      setError(t.invalid);
    } finally {
      setBusy(false);
    }
  }, [draftName, draftDirective, customs, t]);

  const remove = useCallback((id: string) => {
    const next = customs.filter((c) => c.id !== id);
    setCustoms(next);
    try { window.localStorage.setItem(CUSTOM_PERSONAS_KEY, JSON.stringify(next)); } catch { /* private mode */ }
    if (selectedId === id) choose('');
  }, [customs, selectedId, choose]);

  if (!open) return null;

  const row = 'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-app-elevated';

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t.title}
        className="max-h-[86dvh] w-full max-w-[440px] overflow-y-auto rounded-t-3xl border border-app-border/15 bg-app-surface p-5 shadow-[0_0_60px_rgba(0,0,0,0.45)] sm:rounded-3xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-[17px] font-bold tracking-tight text-app-text">
              <Sparkles className="h-[17px] w-[17px] text-app-accent" /> {t.title}
            </h2>
            <p className="mt-1 text-[12.5px] leading-snug text-app-muted">{t.subtitle}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t.cancel}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text">
            <X size={16} />
          </button>
        </div>

        {/* Default (no persona) */}
        <button type="button" onClick={() => choose('')} className={row}>
          <span className="text-[20px] leading-none">🤖</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-semibold text-app-text">{t.none}</span>
            <span className="block truncate text-[11.5px] text-app-muted">{t.noneSub}</span>
          </span>
          {selectedId === '' && <Check size={16} className="shrink-0 text-app-accent" />}
        </button>

        <div className="my-2 h-px bg-app-border/10" />

        {BUILT_IN_PERSONAS.map((p) => (
          <button key={p.id} type="button" onClick={() => choose(p.id)} className={row}>
            <span className="text-[20px] leading-none">{p.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-semibold text-app-text">{personaName(p, lang)}</span>
              <span className="block truncate text-[11.5px] text-app-muted">{p.tagline[lang]}</span>
            </span>
            {selectedId === p.id && <Check size={16} className="shrink-0 text-app-accent" />}
          </button>
        ))}

        {customs.length > 0 && (
          <>
            <div className="mt-3 px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-app-muted">{t.custom}</div>
            {customs.map((p) => (
              <div key={p.id} className="group flex items-center gap-1">
                <button type="button" onClick={() => choose(p.id)} className={`${row} flex-1`}>
                  <span className="text-[20px] leading-none">{p.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-app-text">{personaName(p, lang)}</span>
                    <span className="block truncate text-[11.5px] text-app-muted">{p.directive.slice(0, 60)}</span>
                  </span>
                  {selectedId === p.id && <Check size={16} className="shrink-0 text-app-accent" />}
                </button>
                <button type="button" onClick={() => remove(p.id)} aria-label={`${t.delete} ${personaName(p, lang)}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-elevated hover:text-rose-400">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </>
        )}

        <div className="my-2 h-px bg-app-border/10" />

        {!creating ? (
          <button type="button" onClick={() => setCreating(true)}
            className="flex w-full items-center gap-2.5 rounded-xl bg-app-elevated px-3 py-2.5 text-[13.5px] font-semibold text-app-text ring-1 ring-app-border/15 transition-colors hover:bg-app-border/10 active:scale-[0.99]">
            <Plus className="h-[17px] w-[17px] text-app-accent" /> {t.create}
          </button>
        ) : (
          <div className="space-y-2">
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder={t.name}
              aria-label={t.name}
              maxLength={40}
              className="w-full rounded-xl border border-app-border/15 bg-app-elevated px-3.5 py-2.5 text-[16px] text-app-text outline-none transition-colors placeholder:text-app-muted focus:border-app-accent/40"
            />
            <textarea
              value={draftDirective}
              onChange={(e) => setDraftDirective(e.target.value)}
              placeholder={t.directivePh}
              aria-label={t.directive}
              rows={3}
              maxLength={1200}
              className="w-full resize-none rounded-xl border border-app-border/15 bg-app-elevated px-3.5 py-2.5 text-[16px] leading-snug text-app-text outline-none transition-colors placeholder:text-app-muted focus:border-app-accent/40"
            />
            {error && <p className="px-1 text-[12px] text-rose-400">{error}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => void save()} disabled={busy || draftName.trim().length < 2 || draftDirective.trim().length < 10}
                className="min-h-[44px] flex-1 rounded-xl bg-app-accent px-4 text-[13.5px] font-semibold text-app-bg transition-opacity disabled:opacity-50">
                {t.save}
              </button>
              <button type="button" onClick={() => { setCreating(false); setError(null); }}
                className="min-h-[44px] rounded-xl px-4 text-[13.5px] font-semibold text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text">
                {t.cancel}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
