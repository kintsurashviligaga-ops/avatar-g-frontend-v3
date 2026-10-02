'use client';

/**
 * HubHost — mounted ONCE in ChatChrome. It owns what has to outlive the sheet:
 *
 *   · the user's switched-off tools: read from GET /api/plugins when someone signs in (and dropped the moment they sign out
 *     or another account signs in), so the sidebar and the „+" sheet can hide them even before the hub is ever opened;
 *   · the sheet itself (loaded on first open — never in the chat's first bundle);
 *   · `myavatar:hub-open` — any module may open the hub on a tab (`detail: 'connectors' | 'plugins' | 'skills'`) without
 *     importing it.
 */
import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useSignedIn } from '@/components/studio/ui/useSignedIn';
import { hubActions, isHubTab, useHubSelector } from './store';

const HubSheet = dynamic(() => import('./HubSheet').then((m) => m.HubSheet), { ssr: false });

export const HUB_OPEN_EVENT = 'myavatar:hub-open';

export function HubHost({ locale, authed: authedProp, userId: userIdProp }: { locale: string; authed: boolean; userId: string | null }) {
  const { authed, userId } = useSignedIn(authedProp, userIdProp);
  const open = useHubSelector((s) => s.open);

  // The list belongs to an account: a signed-in session without a published uid still has one (the server knows it).
  useEffect(() => { hubActions.syncUser(authed ? userId ?? 'signed-in' : null); }, [authed, userId]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<unknown>).detail;
      hubActions.open(isHubTab(d) ? d : undefined);
    };
    window.addEventListener(HUB_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(HUB_OPEN_EVENT, onOpen);
  }, []);

  return open ? <HubSheet locale={locale} authed={authed} /> : null;
}

export default HubHost;
