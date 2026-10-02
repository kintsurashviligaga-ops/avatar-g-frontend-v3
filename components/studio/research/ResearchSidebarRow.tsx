'use client';

/**
 * ResearchSidebarRow — „Deep Research" in ChatChrome's sidebar, under Library: opens the list of the user's researches.
 * Drawn only for a signed-in user and only when the server says the feature exists here; otherwise null.
 */
import { useEffect } from 'react';
import { FileSearch } from 'lucide-react';
import { researchCopy } from './copy';
import { researchActions, useResearchAvailable } from './store';

export function ResearchSidebarRow({ locale, authed, className, onPicked }: { locale: string; authed: boolean; className: string; onPicked?: () => void }) {
  const available = useResearchAvailable();
  useEffect(() => { void researchActions.ensureCapabilities(); }, []);
  if (!authed || !available) return null;
  const c = researchCopy(locale);
  return (
    <button type="button" data-testid="sidebar-research" onClick={() => { onPicked?.(); researchActions.openList(); }} className={className}>
      <FileSearch className="h-[17px] w-[17px] text-app-muted" aria-hidden="true" /> {c.sidebarRow}
    </button>
  );
}
