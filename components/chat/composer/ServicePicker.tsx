'use client';

/**
 * ServicePicker — what the composer's „+" opens (GG's unified composer, 2026-10-25): every service in three groups,
 * მთავარი (the chat, Agent G) · შექმნა (video, image, music, avatar, interior) · დამატებითი (product ad, VFX, montage, 3D…).
 * A bottom sheet on a phone, a popover anchored to „+" from 1024 px.
 *
 * The list is the catalog's (lib/catalog/nav composerToolGroups — usable services only, GG's hidden tools left out), so a
 * disabled or unreleased service is never drawn as working, and a beta one says so. Choosing one closes the picker and
 * puts the service in the composer; the conversation on screen stays (GG 2026-10-25, one conversation).
 */
import type { RefObject } from 'react';
import { Check } from 'lucide-react';
import { AnchoredPopover } from '@/components/studio/create/OptionPicker';
import { BottomSheet } from '@/components/studio/ui/BottomSheet';
import type { ToolEntry } from '@/components/studio/ui/ToolSheet';

export interface ServicePickerSection {
  id: 'main' | 'create' | 'extra';
  label: string;
  tools: ToolEntry[];
}

const TITLE = { ka: 'სერვისები', en: 'Services', ru: 'Сервисы' } as const;
const CLOSE = { ka: 'დახურვა', en: 'Close', ru: 'Закрыть' } as const;

export function ServicePicker({ open, onClose, locale, desktop, anchorRef, sections, activeId, onTool, title }: {
  open: boolean;
  onClose: () => void;
  locale: string;
  desktop: boolean;
  /** „+" — the popover's anchor on a desktop. */
  anchorRef: RefObject<HTMLElement | null>;
  sections: readonly ServicePickerSection[];
  activeId: string | null;
  onTool: (id: string) => void;
  /** Overrides the accessible name (e.g. „აირჩიე ხელსაწყო" when opened from a panel's tool switch). */
  title?: string;
}) {
  const lang = locale === 'en' || locale === 'ru' ? locale : 'ka';
  const label = title ?? TITLE[lang];
  if (!open) return null;
  const shown = sections.filter((s) => s.tools.length > 0);
  const body = (
    <div data-testid="service-picker">
      {shown.map((sec, i) => (
        <section key={sec.id} data-testid={`service-group-${sec.id}`}>
          <p className={`px-3 pb-1 text-[12px] font-medium text-app-muted ${i === 0 ? 'pt-1' : 'pt-3'}`}>{sec.label}</p>
          <ul className="space-y-0.5" aria-label={sec.label}>
            {sec.tools.map((t) => {
              const on = activeId === t.id;
              return (
                <li key={t.id}>
                  <button type="button" disabled={t.disabled} aria-pressed={on} data-testid={`service-${t.id}`}
                    onClick={() => { onTool(t.id); onClose(); }}
                    className={`flex min-h-[52px] w-full touch-manipulation items-center gap-3.5 rounded-2xl px-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 ${on ? 'bg-app-elevated' : 'hover:bg-app-elevated/70'}`}>
                    <t.Icon size={20} aria-hidden="true" className={`shrink-0 ${on ? 'text-app-accent' : 'text-app-text/80'}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium leading-tight text-app-text">{t.title}</span>
                      <span className="mt-0.5 block truncate text-[12.5px] leading-tight text-app-muted">{t.sub}</span>
                    </span>
                    {t.tag ? <span className="shrink-0 rounded-full bg-app-elevated px-2 py-0.5 text-[11px] font-medium text-app-muted">{t.tag}</span> : null}
                    {on ? <Check size={16} aria-hidden="true" className="shrink-0 text-app-accent" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
  if (desktop) return <AnchoredPopover anchorRef={anchorRef} onClose={onClose} label={label} width={360} maxHeight={560} testId="tool-sheet">{body}</AnchoredPopover>;
  return (
    <BottomSheet open onClose={onClose} closeLabel={CLOSE[lang]} testId="tool-sheet" title={label} showHeader={false}>
      {body}
    </BottomSheet>
  );
}
