'use client';

/**
 * launch.ts — the doors INTO Deep Research from the rest of the app, each a few lines so the hot files (OmniStudio, ChatChrome,
 * ToolSheet) stay almost untouched:
 *
 *   useResearchToolExtras(locale, getPrompt)  the „+" sheet's two rows („Deep Research", „Connectors") — an EMPTY list until
 *                                             /api/research/capabilities says `available: true`, so a deployment without the
 *                                             feature (or with the migration unapplied) shows nothing and never errors
 *   openResearchFromComposer(prompt)          a guest is sent to sign-in; a signed-in user gets the start-confirmation sheet
 */
import { useEffect, useMemo, useRef } from 'react';
import { FileSearch, Plug } from 'lucide-react';
import type { ToolEntry } from '@/components/studio/ui/ToolSheet';
import { researchCopy } from './copy';
import { researchActions, useResearchAvailable } from './store';

export type ToolExtra = ToolEntry & { onPick: () => void };

export function openResearchFromComposer(prompt: string): void {
  try {
    if (document.documentElement.dataset.authed === '0') {
      window.dispatchEvent(new CustomEvent('myavatar:auth-required'));
      return;
    }
  } catch {
    /* SSR */
  }
  researchActions.openStart(prompt);
}

export function useResearchToolExtras(locale: string, getPrompt: () => string): ToolExtra[] {
  const available = useResearchAvailable();
  const latest = useRef(getPrompt);
  latest.current = getPrompt;
  useEffect(() => { void researchActions.ensureCapabilities(); }, []);
  return useMemo(() => {
    if (!available) return [];
    const c = researchCopy(locale);
    return [
      { id: 'research', Icon: FileSearch, title: c.toolTitle, sub: c.toolSub, onPick: () => openResearchFromComposer(latest.current()) },
      { id: 'connectors', Icon: Plug, title: c.connectorsTitle, sub: c.connectorsSub, onPick: researchActions.openConnectors },
    ];
  }, [available, locale]);
}

/** The assistant's line in the thread when a research starts (the card under it carries the progress). */
export const researchStartedNote = (locale: string): string => researchCopy(locale).toastStarted;
