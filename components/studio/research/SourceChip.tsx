'use client';

/**
 * SourceChip — one cited page: a favicon, its title and its domain, as a link that opens the page in a new tab.
 *
 * The favicon comes from OUR proxy (/api/research/favicon): the user's browser never asks a third party which pages a report
 * cited. The proxy answers 204 when a site has no icon (or the fetch failed) — an <img> treats that as a failed load, and the
 * chip falls back to the domain's first letter on an accent-tinted badge. Only http(s) URLs are ever linked.
 */
import { useState } from 'react';
import { faviconSrc, sourceDomain } from './api';

export function SourceChip({ url, title, openLabel }: { url: string; title?: string; openLabel: string }) {
  const domain = sourceDomain(url);
  const [broken, setBroken] = useState(false);
  if (!domain) return null;
  const name = (title || '').replace(/\s+/g, ' ').trim() || domain;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={`${openLabel}: ${domain}`}
      data-testid="research-source"
      data-domain={domain}
      className="inline-flex min-h-[44px] max-w-full items-center gap-2 rounded-full border border-app-border/20 bg-app-elevated/40 py-1.5 pl-2 pr-3.5 text-left transition-colors hover:bg-app-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent sm:max-w-[320px]"
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-app-accent/15 text-[11px] font-bold uppercase text-app-accent" aria-hidden="true">
        {broken ? (
          domain[0]
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={faviconSrc(domain)} alt="" width={16} height={16} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="h-4 w-4 object-contain" />
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium leading-tight text-app-text">{name}</span>
        {name !== domain ? <span className="block truncate text-[11.5px] leading-tight text-app-muted">{domain}</span> : null}
      </span>
    </a>
  );
}
