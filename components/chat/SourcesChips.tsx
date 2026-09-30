'use client';

/**
 * components/chat/SourcesChips.tsx — the web pages a grounded answer was built from, as compact chips.
 *
 * Each chip shows the site's domain and, when it adds something, the page title. It opens in a new tab.
 * There are no favicons: fetching one per source would tell a third-party favicon service which pages the
 * user's answer cited, and the chips have to read on phones without them anyway.
 *
 * ⚠️ GOOGLE GROUNDING LINKS ARE REDIRECTS. The Gemini API returns every source as a
 * `vertexaisearch.cloud.google.com/grounding-api-redirect/…` URL and puts the real site in the title
 * (e.g. "bbc.com"). Taking the domain from the URL would label every chip "vertexaisearch.cloud.google.com".
 * For those links the title is the domain, and the chip shows it alone.
 *
 * ⚠️ ONLY http(s) LINKS RENDER. `lib/chat/sse.ts` already drops anything else from a sources frame; this is
 * the second check, because a caller may pass sources that never went through the codec.
 */

import { memo, useMemo, useState } from 'react';

type SourcesLocale = 'ka' | 'en' | 'ru';

export interface SourceChipData {
  url: string;
  title?: string;
}

export interface SourcesChipsProps {
  sources: ReadonlyArray<SourceChipData>;
  locale?: SourcesLocale;
  /** How many chips to show before a "+N" toggle. Default 6. */
  max?: number;
  className?: string;
}

const LABELS: Record<SourcesLocale, { sources: string; more: (n: number) => string; less: string }> = {
  ka: { sources: 'წყაროები', more: (n) => `+${n}`, less: 'ნაკლები' },
  en: { sources: 'Sources', more: (n) => `+${n}`, less: 'Less' },
  ru: { sources: 'Источники', more: (n) => `+${n}`, less: 'Скрыть' },
};

const REDIRECT_HOSTS = /(^|\.)vertexaisearch\.cloud\.google\.com$/i;
const DOMAIN_LIKE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

export interface SourceLabel {
  href: string;
  domain: string;
  /** Present only when it says more than the domain. */
  title?: string;
}

/** Turns one source into what its chip shows, or null when the URL is not a usable http(s) link. */
export function sourceLabel(src: SourceChipData): SourceLabel | null {
  const raw = typeof src?.url === 'string' ? src.url.trim() : '';
  if (!/^https?:\/\//i.test(raw)) return null;
  let host: string;
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch (_err) {
    return null;
  }
  const title = typeof src.title === 'string' ? src.title.trim() : '';
  let domain = host.replace(/^www\./, '');
  let shownTitle: string | undefined = title || undefined;
  if (REDIRECT_HOSTS.test(host)) {
    if (title && DOMAIN_LIKE.test(title)) {
      domain = title.toLowerCase().replace(/^www\./, '');
      shownTitle = undefined;
    } else if (title) {
      domain = title;
      shownTitle = undefined;
    } else {
      domain = 'google.com';
    }
  }
  if (shownTitle && shownTitle.toLowerCase().replace(/^www\./, '') === domain) shownTitle = undefined;
  return shownTitle ? { href: raw, domain, title: shownTitle } : { href: raw, domain };
}

function SourcesChipsImpl({ sources, locale = 'ka', max = 6, className }: SourcesChipsProps) {
  const [expanded, setExpanded] = useState(false);
  const labels = LABELS[locale] ?? LABELS.ka;
  const items = useMemo(() => {
    const seen = new Set<string>();
    const out: SourceLabel[] = [];
    for (const s of sources ?? []) {
      const l = sourceLabel(s);
      if (!l || seen.has(l.href)) continue;
      seen.add(l.href);
      out.push(l);
    }
    return out;
  }, [sources]);

  if (items.length === 0) return null;
  const limit = Math.max(1, max);
  const shown = expanded ? items : items.slice(0, limit);
  const hidden = items.length - shown.length;

  return (
    <nav aria-label={labels.sources} className={`mt-2 flex flex-wrap items-center gap-1.5 ${className ?? ''}`} data-sources="">
      <span className="mr-0.5 text-[11px] font-medium text-app-muted">{labels.sources}</span>
      {shown.map((s, i) => (
        <a
          key={s.href}
          href={s.href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          title={s.title ? `${s.title} · ${s.domain}` : s.domain}
          className="inline-flex max-w-[15rem] items-center gap-1.5 rounded-full border border-app-border/15 bg-app-elevated/60 px-2.5 py-1 text-[11.5px] leading-none text-app-muted transition-colors hover:border-app-accent/40 hover:text-app-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-app-accent/60"
        >
          <span className="text-[10px] tabular-nums text-app-muted/70">{i + 1}</span>
          <span className="shrink-0 font-medium text-app-text/85">{s.domain}</span>
          {s.title && <span className="min-w-0 truncate">{s.title}</span>}
        </a>
      ))}
      {(hidden > 0 || expanded) && items.length > limit && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="rounded-full px-2 py-1 text-[11.5px] font-medium text-app-muted transition-colors hover:text-app-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-app-accent/60"
        >
          {expanded ? labels.less : labels.more(hidden)}
        </button>
      )}
    </nav>
  );
}

export const SourcesChips = memo(SourcesChipsImpl);

export default SourcesChips;
