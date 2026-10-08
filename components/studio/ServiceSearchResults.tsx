'use client';

/**
 * components/studio/ServiceSearchResults.tsx — the services a sidebar search finds (Master Task §51), drawn above the
 * chats it finds. The list comes from the catalog (lib/catalog/services.searchServices, the same aliases Agent G reads),
 * so a service can be found by what a person would type in any UI language, not only by the menu's category names.
 *
 * A usable service is a button that opens it (its tool, and its mode — „Music video" opens Video in music-video mode).
 * A coming-soon service is listed as unavailable and opens nothing (§25: „audio remix" must not become a video remix).
 */
import { Clock } from 'lucide-react';
import type { ServiceDefinition } from '@/lib/catalog/services';
import { TOOL_META } from '@/lib/studio/tools';

type Lang = 'ka' | 'en' | 'ru';

const COPY = {
  heading: { ka: 'სერვისები', en: 'Services', ru: 'Сервисы' },
  soon: { ka: 'მალე', en: 'Soon', ru: 'Скоро' },
} as const;

export function ServiceSearchResults({ services, lang, onOpen, rowClassName }: {
  services: readonly ServiceDefinition[];
  lang: Lang;
  onOpen: (service: ServiceDefinition) => void;
  /** The sidebar's row style, so a found service looks like the menu row it stands for. */
  rowClassName: string;
}) {
  if (services.length === 0) return null;
  return (
    <div className="space-y-0.5 pb-2" data-testid="service-search-results">
      <p className="px-2.5 pb-0.5 pt-1 text-[11px] font-medium text-app-muted/70">{COPY.heading[lang]}</p>
      {services.map((s) => {
        const Icon = s.tool ? TOOL_META[s.tool].Icon : Clock;
        const label = s.label[lang];
        if (!s.tool || s.status === 'coming-soon') {
          return (
            <div key={s.id} aria-disabled="true" title={s.description[lang]} data-service={s.id}
              className={`${rowClassName} cursor-default opacity-60 hover:bg-transparent`}>
              <Icon className="h-4 w-4 shrink-0 text-app-muted" aria-hidden="true" />
              <span className="min-w-0 truncate">{label}</span>
              <span className="ml-auto shrink-0 rounded-full bg-app-elevated px-2 py-0.5 text-[10.5px] text-app-muted">{COPY.soon[lang]}</span>
            </div>
          );
        }
        return (
          <button key={s.id} type="button" onClick={() => onOpen(s)} title={s.description[lang]} data-service={s.id}
            className={rowClassName}>
            <Icon className="h-4 w-4 shrink-0 text-app-muted" aria-hidden="true" />
            <span className="min-w-0 truncate">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
